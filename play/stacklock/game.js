/* Stacklock — AAA rebuild.
 *
 * Falling-block line-clear title for the Puzzle Pop lane. Phaser 3 (vendored,
 * /play/_shared/) for the view, GGKit for the entire lifecycle: pause, input
 * identity, save, audio buses, loader, settings and the juice budget. No CDN,
 * no network, no third-party asset.
 *
 * ARCHITECTURE
 *   sim   fixed 60 Hz step. Owns the grid, the active piece, gravity, lock
 *         delay, clears, scoring, unlocks. Never reads a Phaser object.
 *   view  paints the sim by edge. Never writes sim state. All render state
 *         lives in view-side records, never on a sim entity.
 *   The sim clock is the ONLY clock: a degraded device gets slow motion, it
 *   never gets a time skip (see PlayScene.update).
 *
 * DEFECT CLASSES EXPLICITLY HANDLED (each shipped broken once in this fleet)
 *   1  debug view arrays are preallocated and separate from every live pool
 *   2  no per-entity render state is stored on an object handed to a renderer
 *   3  DOM control handlers seed kit.input.pointers at pointer claim time
 *   4  no camera split is used, so no second camera is required
 *   5  plain scene configs are promoted to real Scene subclasses (toScene)
 *   6  the test switches are readable from the boot fallback AND the live scene
 *   7  no clock advances past the stepped sim
 *   8  every keyed lookup against variant content has a guarded fallback
 *   9  the coach strip is a thin fading band, never over the play area centre
 *  10  sw.js precaches only files that exist
 */
(function () {
  'use strict';

  var DATA = (typeof window !== 'undefined' && window.SL_DATA) || null;

  // ============================================================= constants
  var COLS = 10;
  var VIS_ROWS = 20;
  var HIDDEN = 2;              // spawn buffer above the visible board
  var ROWS = VIS_ROWS + HIDDEN;
  var STEP = 1000 / 60;        // fixed sim step, ms
  var MAX_STEPS = 4;           // catch-up cap: beyond this the sim slows down
  var SOFT_MULT = 18;          // soft drop gravity multiplier
  var CELL_HAZARD = 8;
  var CELL_WILD = 9;
  var CELL_GARBAGE = 10;       // round 2: buried rows sent by the rival

  // Flash, then shatter, then collapse. The flash is long enough to READ as a
  // beat on a 60 Hz phone without stalling the next piece.
  var CLEAR_FLASH = 130;
  var CLEAR_SHATTER = 160;
  var CLEAR_COLLAPSE = 140;
  var CLEAR_TOTAL = CLEAR_FLASH + CLEAR_SHATTER + CLEAR_COLLAPSE;

  var SCORE_BASE = [0, 100, 300, 500, 800];
  var MAX_SCORE = 99999999;
  // Round 2 save shape. Version 1 profiles are migrated in migrateSave().
  var SAVE_VERSION = 2;
  var RECORD_MODES = ['marathon', 'sprint', 'ultra', 'rival'];
  var RECORD_MAX = 5;

  var FONT = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

  var CSS = {
    ink: '#141b2b',
    panel: '#1b2440',
    edge: '#3d4a78',
    text: '#eaf0fb',
    dim: '#9fb0d4',
    amber: '#ffa724',
    mint: '#5bcb77',
    coral: '#f25c68'
  };

  // ------------------------------------------------------------ fallbacks
  // Defect class 8: every keyed lookup below is guarded. A missing family,
  // identity or board must degrade to something playable, never freeze.
  var FALLBACK_FAMILY = {
    key: 'O', name: 'NOVA', frame: 'blk_box', color: 0xf7c948, glow: 0xffeaa6, box: 2
  };
  var FALLBACK_IDENTITY = {
    id: 'marathon', name: 'MARATHON', sub: 'Graphite Tower', blurb: '',
    sky: ['#0b1020', '#141c38', '#1d2450', '#2a2050'],
    frame: 0x2b3560, frameEdge: 0x6f80c8, accent: 0xffa724,
    cellA: 0x1b2440, cellB: 0x202a4c, cellAlpha: 0.55, grain: 0.10,
    music: 'music_board'
  };

  var FAMILIES = (DATA && DATA.FAMILIES) || [FALLBACK_FAMILY];
  var FAMILY_BY_KEY = {};
  var FAMILY_INDEX = {};
  for (var fi = 0; fi < FAMILIES.length; fi++) {
    FAMILY_BY_KEY[FAMILIES[fi].key] = FAMILIES[fi];
    FAMILY_INDEX[FAMILIES[fi].key] = fi;
  }
  function family(key) { return FAMILY_BY_KEY[key] || FALLBACK_FAMILY; }
  function identity(mode) {
    var t = (DATA && DATA.IDENTITIES) ? DATA.IDENTITIES[mode] : null;
    return t || FALLBACK_IDENTITY;
  }
  var PUZZLES = (DATA && DATA.PUZZLES) || [];
  function puzzleAt(i) {
    if (!PUZZLES.length) return null;
    var n = Math.max(0, Math.min(PUZZLES.length - 1, i | 0));
    return PUZZLES[n] || PUZZLES[0];
  }
  function puzzleIndexById(id) {
    for (var i = 0; i < PUZZLES.length; i++) if (PUZZLES[i].id === id) return i;
    return -1;
  }
  var MASTER = (DATA && DATA.MASTER) || { id: 'master', name: 'Master Clear', level: 10, holds: 1, rows: [] };
  var GRAVITY = (DATA && DATA.GRAVITY && DATA.GRAVITY.length) ? DATA.GRAVITY : [800];
  function gravityMs(level) {
    var i = Math.max(0, (level | 0) - 1);
    return GRAVITY[Math.min(i, GRAVITY.length - 1)];
  }
  var LOCK = (DATA && DATA.LOCK) || { graceMs: 500, resets: 15, hardDropGraceMs: 120 };
  var MEDALS = (DATA && DATA.MEDALS) || { marathon: [], sprint: [] };
  function medalList(mode) { return MEDALS[mode] || []; }

  // ------------------------------------------------- round 2 content tables
  // Defect class 8 again: every one of these is a guarded read with a live
  // fallback, so a stripped or older sl_data.js still boots into a playable
  // game rather than throwing on the first frame.
  var FALLBACK_RIVAL = {
    key: 'apprentice', name: 'APPRENTICE', sub: 'learning the well',
    stepMs: 235, error: 0.34, look: 0, garbage: 0.7, wins: 0
  };
  var RIVALS = (DATA && DATA.RIVALS && DATA.RIVALS.length) ? DATA.RIVALS : [FALLBACK_RIVAL];
  function rivalTier(i) {
    var n = Math.max(0, Math.min(RIVALS.length - 1, i | 0));
    return RIVALS[n] || FALLBACK_RIVAL;
  }
  var ULTRA = (DATA && DATA.ULTRA) || { ms: 120000, startLevel: 4, rampMs: 18000, maxLevel: 16 };
  var DANGER = (DATA && DATA.DANGER) || { warn: 13, crit: 16, tickMs: 900 };
  var GARBAGE = (DATA && DATA.GARBAGE) || {
    lines: [0, 0, 1, 2, 4], tspin: [0, 2, 4, 6, 6], tspinMini: [0, 0, 1, 2, 2],
    combo: [0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5], b2b: 1, perfect: 10, max: 8
  };
  var SPINS = (DATA && DATA.SPINS) || {
    full: [400, 800, 1200, 1600, 1600], mini: [100, 200, 400, 400, 400],
    perfect: [0, 800, 1200, 1800, 3500]
  };
  function tableAt(list, i, dflt) {
    if (!list || !list.length) return dflt;
    return list[Math.max(0, Math.min(list.length - 1, i | 0))];
  }

  // ------------------------------------------------------- piece rotations
  // SRS: states 1-3 are derived by rotating inside the family's own box, which
  // is what makes the kick tables below valid.
  function rotCW(m) {
    var n = m.length;
    var out = [];
    for (var y = 0; y < n; y++) {
      out.push([]);
      for (var x = 0; x < n; x++) out[y].push(m[n - 1 - x][y]);
    }
    return out;
  }
  var ROT = {};
  (function buildRotations() {
    var shapes = (DATA && DATA.SHAPES) || { O: [[1, 1], [1, 1]] };
    for (var k in shapes) {
      if (!Object.prototype.hasOwnProperty.call(shapes, k)) continue;
      var states = [shapes[k]];
      for (var r = 1; r < 4; r++) states.push(rotCW(states[r - 1]));
      ROT[k] = states;
    }
    // The two Puzzle pickups are single cells and never rotate.
    ROT.W = [[[1]], [[1]], [[1]], [[1]]];
    ROT.B = [[[1]], [[1]], [[1]], [[1]]];
  })();
  function shapeOf(kind, rot) {
    var s = ROT[kind] || ROT.O || ROT.W;
    return s[((rot % 4) + 4) % 4];
  }
  // The rival AI is a separate script. Reading it through a guarded accessor
  // means a missing sl_ai.js costs the rival its planning, not the whole boot:
  // an unplanned rival simply drops its piece where it spawned.
  function root_SL_AI() {
    return (typeof window !== 'undefined' && window.SL_AI) || null;
  }
  // Collision against ANY grid. The player board and the rival board share it,
  // which is what keeps the two sims provably identical in their rules.
  function hits(grid, kind, rot, px, py) {
    var m = shapeOf(kind, rot);
    for (var y = 0; y < m.length; y++) {
      for (var x = 0; x < m[y].length; x++) {
        if (!m[y][x]) continue;
        var nx = px + x, ny = py + y;
        if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
        if (ny >= 0 && grid[ny][nx]) return true;
      }
    }
    return false;
  }

  // SRS wall kicks. Authored in SRS space (y up); the board runs y down, so
  // the y component is negated when the offset is applied.
  var KICK_JLSTZ = {
    '01': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '10': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '12': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '21': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '23': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    '32': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '30': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '03': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]]
  };
  var KICK_I = {
    '01': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    '10': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    '12': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
    '21': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    '23': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    '32': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    '30': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    '03': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]]
  };
  var KICK_NONE = [[0, 0]];
  function kicksFor(kind, from, to) {
    if (kind === 'O' || kind === 'W' || kind === 'B') return KICK_NONE;
    var table = kind === 'I' ? KICK_I : KICK_JLSTZ;
    return table['' + from + to] || KICK_NONE;
  }

  // ------------------------------------------------------------- utilities
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function easeOutCubic(t) { var u = 1 - t; return 1 - u * u * u; }
  function easeOutBack(t) {
    var c1 = 1.70158, c3 = c1 + 1, u = t - 1;
    return 1 + c3 * u * u * u + c1 * u * u;
  }
  function setTextIfChanged(obj, value) {
    var next = String(value);
    if (obj && obj.text !== next) obj.setText(next);
    return obj;
  }
  function pad(n, w) {
    var s = String(n);
    while (s.length < w) s = '0' + s;
    return s;
  }
  function formatTime(ms) {
    var cs = Math.floor(ms / 10) % 100;
    var sec = Math.floor(ms / 1000) % 60;
    var min = Math.floor(ms / 60000);
    return pad(min, 2) + ':' + pad(sec, 2) + '.' + pad(cs, 2);
  }
  function frameForCell(v) {
    if (v === CELL_HAZARD) return 'blk_hazard';
    if (v === CELL_WILD) return 'blk_wild';
    if (v === CELL_GARBAGE) return 'blk_shell';
    var f = FAMILIES[v - 1];
    return (f && f.frame) || FALLBACK_FAMILY.frame;
  }
  function colorForCell(v) {
    if (v === CELL_HAZARD) return 0xffa724;
    if (v === CELL_WILD) return 0xd8e2f2;
    if (v === CELL_GARBAGE) return 0x8593b5;
    var f = FAMILIES[v - 1];
    return (f && f.color) || 0xffffff;
  }
  // Mixes two 0xRRGGBB colours. Used by the evolving sky, the combo rim and
  // the danger grade, all of which interpolate rather than hard-switch.
  function mixColor(a, b, t) {
    var u = clamp(t, 0, 1);
    var ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
    var br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
    return (((ar + (br - ar) * u) | 0) << 16) | (((ag + (bg - ag) * u) | 0) << 8) |
      ((ab + (bb - ab) * u) | 0);
  }
  function cssToInt(css) {
    var s = String(css || '#000000').replace('#', '');
    var n = parseInt(s, 16);
    return isFinite(n) ? n : 0;
  }
  function intToCss(n) { return '#' + ('000000' + ((n >>> 0) & 0xffffff).toString(16)).slice(-6); }
  function frameForKind(kind) {
    if (kind === 'W') return 'blk_wild';
    if (kind === 'B') return 'blk_bomb';
    return family(kind).frame;
  }
  function colorForKind(kind) {
    if (kind === 'W') return 0xd8e2f2;
    if (kind === 'B') return 0xffa724;
    return family(kind).color;
  }
  function cellForKind(kind) {
    if (kind === 'W') return CELL_WILD;
    var idx = FAMILY_INDEX[kind];
    return (idx == null ? 1 : idx + 1);
  }
  // Authored '#' blocks pick a stable family from their coordinates so a hand
  // written board is colourful without the author naming seven letters a row.
  function authoredCell(col, row) {
    return ((col * 7 + row * 5 + 3) % FAMILIES.length) + 1;
  }

  function readInsets() {
    var probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;' +
      'padding:env(safe-area-inset-top) env(safe-area-inset-right) ' +
      'env(safe-area-inset-bottom) env(safe-area-inset-left);';
    document.body.appendChild(probe);
    var cs = getComputedStyle(probe);
    var out = {
      top: parseFloat(cs.paddingTop) || 0,
      right: parseFloat(cs.paddingRight) || 0,
      bottom: parseFloat(cs.paddingBottom) || 0,
      left: parseFloat(cs.paddingLeft) || 0
    };
    probe.remove();
    return out;
  }

  // ================================================================= save
  var SAVE_KEYS_V1 = ['v', 'bestScore', 'bestLines', 'bestSprint', 'marathonMedal',
    'sprintMedal', 'puzzleDone', 'puzzleBest', 'masterDone', 'tut', 'motionSet',
    'motionEnabled', 'textScale'];
  var SAVE_KEYS = SAVE_KEYS_V1.concat(['bestUltra', 'ultraMedal', 'rivalMedal',
    'rivalWins', 'rivalTier', 'rivalStreak', 'records', 'career']);

  function emptyRecords() {
    var r = {};
    for (var i = 0; i < RECORD_MODES.length; i++) r[RECORD_MODES[i]] = [];
    return r;
  }
  function emptyCareer() {
    return { tspins: 0, quads: 0, perfects: 0, bestCombo: 0, lines: 0, runs: 0 };
  }
  function defaultSave() {
    return {
      v: SAVE_VERSION,
      bestScore: 0, bestLines: 0, bestSprint: 0, bestUltra: 0,
      marathonMedal: '', sprintMedal: '', ultraMedal: '', rivalMedal: '',
      puzzleDone: [], puzzleBest: 0,
      masterDone: false, tut: false, motionSet: false, motionEnabled: true,
      textScale: 0,
      rivalWins: 0, rivalTier: 0, rivalStreak: 0,
      records: emptyRecords(),
      career: emptyCareer()
    };
  }
  function safeInt(v, lo, hi) {
    return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v >= lo && v <= hi;
  }
  function validMedal(mode, key) {
    if (key === '') return true;
    var list = medalList(mode);
    for (var i = 0; i < list.length; i++) if (list[i].key === key) return true;
    return false;
  }
  // The fields shared by version 1 and version 2. Both validators run it, so
  // the migration below can trust an accepted v1 blob field by field.
  function validateCommon(o, keys) {
    if (!o || typeof o !== 'object') return false;
    for (var k in o) {
      if (Object.prototype.hasOwnProperty.call(o, k) && keys.indexOf(k) < 0) return false;
    }
    if (!safeInt(o.bestScore, 0, MAX_SCORE)) return false;
    if (!safeInt(o.bestLines, 0, 999999)) return false;
    if (!safeInt(o.bestSprint, 0, 36000000)) return false;
    if (typeof o.marathonMedal !== 'string' || typeof o.sprintMedal !== 'string' ||
        !validMedal('marathon', o.marathonMedal) || !validMedal('sprint', o.sprintMedal)) return false;
    if (!(o.puzzleDone instanceof Array)) return false;
    if (o.puzzleDone.length > PUZZLES.length) return false;
    for (var i = 0; i < o.puzzleDone.length; i++) {
      // Persisted content ids must validate against the live registry and the
      // unlock chain. Normal progress is exactly the contiguous prefix.
      if (typeof o.puzzleDone[i] !== 'string' || o.puzzleDone[i] !== PUZZLES[i].id) return false;
    }
    if (!safeInt(o.puzzleBest, 0, PUZZLES.length) || o.puzzleBest !== o.puzzleDone.length) return false;
    if (typeof o.masterDone !== 'boolean') return false;
    if (typeof o.tut !== 'boolean' || typeof o.motionSet !== 'boolean') return false;
    if (typeof o.motionEnabled !== 'boolean') return false;
    if (!safeInt(o.textScale, 0, 2)) return false;
    if (o.masterDone && (o.puzzleDone.length < 20 || o.bestLines < 90)) return false;
    return true;
  }

  function validateSaveV1(o) {
    if (!o || typeof o !== 'object' || o.v !== 1) return false;
    return validateCommon(o, SAVE_KEYS_V1);
  }

  function validateRecordList(list, mode) {
    if (!(list instanceof Array) || list.length > RECORD_MAX) return false;
    for (var i = 0; i < list.length; i++) {
      var hi = mode === 'sprint' || mode === 'rival' ? 36000000 : MAX_SCORE;
      if (!safeInt(list[i], 0, hi)) return false;
    }
    return true;
  }

  function validateSave(o) {
    if (!o || typeof o !== 'object' || o.v !== SAVE_VERSION) return false;
    if (!validateCommon(o, SAVE_KEYS)) return false;
    if (!safeInt(o.bestUltra, 0, MAX_SCORE)) return false;
    if (typeof o.ultraMedal !== 'string' || !validMedal('ultra', o.ultraMedal)) return false;
    if (typeof o.rivalMedal !== 'string' || !validMedal('rival', o.rivalMedal)) return false;
    if (!safeInt(o.rivalWins, 0, 999999)) return false;
    if (!safeInt(o.rivalTier, 0, RIVALS.length - 1)) return false;
    if (!safeInt(o.rivalStreak, 0, 999999)) return false;
    if (!o.records || typeof o.records !== 'object') return false;
    for (var k in o.records) {
      if (!Object.prototype.hasOwnProperty.call(o.records, k)) continue;
      if (RECORD_MODES.indexOf(k) < 0) return false;
    }
    for (var i = 0; i < RECORD_MODES.length; i++) {
      if (!validateRecordList(o.records[RECORD_MODES[i]], RECORD_MODES[i])) return false;
    }
    if (!o.career || typeof o.career !== 'object') return false;
    var careerKeys = ['tspins', 'quads', 'perfects', 'bestCombo', 'lines', 'runs'];
    for (var c in o.career) {
      if (!Object.prototype.hasOwnProperty.call(o.career, c)) continue;
      if (careerKeys.indexOf(c) < 0) return false;
    }
    for (var j = 0; j < careerKeys.length; j++) {
      if (!safeInt(o.career[careerKeys[j]], 0, MAX_SCORE)) return false;
    }
    // The rival tier the player may select is earned, never persisted ahead of
    // the wins that unlock it.
    if (rivalTier(o.rivalTier).wins > o.rivalWins) return false;
    return true;
  }

  // GGKit is handed a validator that accepts BOTH shapes, so a version 1 blob
  // survives the read instead of being dropped as corrupt. migrateSave() then
  // does the actual upgrade. Anything that satisfies neither shape returns
  // null and the caller falls back to a fresh profile: no throw, no partial
  // profile, and no silent loss of a valid older save.
  function validateAnySave(o) {
    return validateSave(o) || validateSaveV1(o);
  }

  function migrateSave(o) {
    if (validateSave(o)) return o;
    if (!validateSaveV1(o)) return null;
    var d = defaultSave();
    d.bestScore = o.bestScore;
    d.bestLines = o.bestLines;
    d.bestSprint = o.bestSprint;
    d.marathonMedal = o.marathonMedal;
    d.sprintMedal = o.sprintMedal;
    d.puzzleDone = o.puzzleDone.slice();
    d.puzzleBest = o.puzzleBest;
    d.masterDone = o.masterDone;
    d.tut = o.tut;
    d.motionSet = o.motionSet;
    d.motionEnabled = o.motionEnabled;
    d.textScale = o.textScale;
    // The v1 profile only ever kept a single best per mode. Seed the new
    // personal-best tables with it so a returning player's history is on the
    // records page from the first boot rather than starting blank.
    if (o.bestScore) d.records.marathon = [o.bestScore];
    if (o.bestSprint) d.records.sprint = [o.bestSprint];
    d.career.lines = o.bestLines || 0;
    return validateSave(d) ? d : null;
  }

  // Top-N table helper. Marathon and Ultra rank high, Sprint and Rival rank
  // low (they are clocks), and every entry is clamped to the validator range.
  function pushRecord(mode, value) {
    if (RECORD_MODES.indexOf(mode) < 0) return false;
    var v = Math.round(value);
    if (!isFinite(v) || v <= 0) return false;
    var lowIsBetter = mode === 'sprint' || mode === 'rival';
    v = clamp(v, 0, lowIsBetter ? 36000000 : MAX_SCORE);
    var list = profile.records[mode] || (profile.records[mode] = []);
    list.push(v);
    list.sort(function (a, b) { return lowIsBetter ? a - b : b - a; });
    if (list.length > RECORD_MAX) list.length = RECORD_MAX;
    return list.indexOf(v) === 0;
  }

  // ========================================================== debug state
  // Defect class 1: the debug board is its own preallocated matrix. It is
  // never assigned from, or aliased to, the live sim grid or any sprite pool.
  // Defect class 6: the object exists before any scene does, so a harness can
  // set forceMode / forceBoard against the boot fallback and the live scene
  // reads the very same object.
  var SL_DEBUG_STATE = {
    ready: false,
    scene: 'boot',
    mode: 'marathon',
    boardId: '',
    boardName: '',
    phase: 'boot',
    score: 0,
    level: 1,
    lines: 0,
    goal: 0,
    cleared: 0,
    hazards: 0,
    combo: 0,
    bestCombo: 0,
    b2b: 0,
    elapsedMs: 0,
    holdKind: '',
    holdLocked: false,
    queue: [],
    pickups: { wild: 0, bomb: 0 },
    // round 2 additions
    timeLeftMs: 0,
    danger: 0,
    incoming: 0,
    spins: 0,
    quads: 0,
    perfects: 0,
    tier: 0,
    rival: { lines: 0, height: 0, dead: false, pending: 0 },
    records: { marathon: [], sprint: [], ultra: [], rival: [] },
    unlockedPuzzles: 1,
    medals: { marathon: '', sprint: '', master: false },
    best: { score: 0, lines: 0, sprintMs: 0 },
    reducedMotion: false,
    // test switches, honoured by the boot fallback and the live scene alike
    forceMode: '',
    forceBoard: '',
    board: (function () {
      var b = [];
      for (var r = 0; r < VIS_ROWS; r++) {
        var row = [];
        for (var c = 0; c < COLS; c++) row.push(0);
        b.push(row);
      }
      return b;
    })()
  };

  var Game = { phaser: null, play: null, title: null, insets: readInsets() };
  var restartOverride = null;
  var pendingMusic = null;
  var audioUnlocked = false;

  function applyForce(mode, boardId) {
    SL_DEBUG_STATE.forceMode = mode || '';
    SL_DEBUG_STATE.forceBoard = boardId || '';
    var s = Game.play;
    if (s && s.scene && s.scene.isActive && s.scene.isActive()) {
      restartPlay(startArgs(mode || SL_DEBUG_STATE.mode, boardId || ''), true);
      return true;
    }
    if (Game.title && Game.title.scene && Game.title.scene.isActive()) {
      startPlay(startArgs(mode || SL_DEBUG_STATE.mode, boardId || ''), true);
      return true;
    }
    return false; // still booting: the switch is read when Play first starts
  }
  function startArgs(mode, boardId) {
    var m = identity(mode).id;
    var args = { mode: m };
    if (m === 'puzzle') {
      var idx = boardId ? puzzleIndexById(boardId) : -1;
      args.puzzleIndex = idx >= 0 ? idx : 0;
    }
    if (m === 'rival') args.tier = profile ? (profile.rivalTier | 0) : 0;
    return args;
  }

  if (typeof window !== 'undefined') {
    window.__sl = {
      state: SL_DEBUG_STATE,
      forceMode: function (mode) { return applyForce(mode, ''); },
      forceBoard: function (boardId) { return applyForce('puzzle', boardId); }
    };
  }

  // ================================================================== kit
  var kit = GGKit.create({
    slug: 'stacklock',
    orientation: 'portrait',
    validateSave: validateAnySave,
    onPause: function () {
      var s = Game.play;
      if (s && s.scene.isActive()) { s.releaseInputs(); s.scene.pause(); }
    },
    onResume: function () {
      var s = Game.play;
      if (s && s.scene.isPaused()) s.scene.resume();
    },
    onRestart: function () {
      var s = Game.play;
      if (s) {
        var args = restartOverride || s.restartArgs();
        restartOverride = null;
        s.releaseInputs();
        s.scene.restart(args);
      }
    }
  });

  // Round 2 save migration. A version 1 profile is upgraded in place and
  // written back at the next persist; anything that fails BOTH validators
  // degrades to a fresh profile rather than throwing.
  var profile = migrateSave(kit.save.get(null));
  var saveMigrated = false;
  if (!profile) profile = defaultSave();
  else if (profile.v !== SAVE_VERSION) profile = defaultSave();
  else saveMigrated = true;
  function persist() { kit.save.set(profile); }
  if (saveMigrated) persist();
  var TEXT_SCALES = [1, 1.15, 1.3];
  function textScaleValue() {
    var i = safeInt(profile.textScale, 0, TEXT_SCALES.length - 1) ? profile.textScale : 0;
    return TEXT_SCALES[i];
  }
  function scaledPx(size) { return Math.round(size * textScaleValue()); }

  // Reduced motion: the OS preference is the INITIAL value only. Once the
  // player touches the GGKit settings row, their choice wins forever.
  (function initMotion() {
    if (profile.motionSet) {
      kit.juice.enabled = profile.motionEnabled !== false;
      return;
    }
    var mm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mm && mm.matches) kit.juice.enabled = false;
  })();
  function motionOn() { return kit.juice.enabled !== false; }
  function fxCount(n) { return Math.max(1, Math.round(n * (motionOn() ? 1 : 0.3))); }

  function openSettings() {
    var box = kit.openSettings([function (parent, row) {
      row('Coach tips', function () { return profile.tut !== true; }, function (v) {
        profile.tut = !v; persist();
      });
      var scaleRow = document.createElement('button');
      scaleRow.type = 'button';
      scaleRow.style.cssText = 'font:inherit;font-size:16px;color:#e8eef4;background:#1b2733;' +
        'border:1px solid #2e3e4e;border-radius:10px;padding:12px 18px;min-width:min(70vw,280px);';
      function paintScale() {
        scaleRow.textContent = 'Text size: ' + TEXT_SCALES[profile.textScale] + 'x';
      }
      scaleRow.addEventListener('click', function () {
        profile.textScale = (profile.textScale + 1) % TEXT_SCALES.length;
        persist();
        refreshControlScale();
        if (Game.title && Game.title.scene && Game.title.scene.isActive()) Game.title.layout();
        if (Game.play && Game.play.scene && Game.play.scene.isActive()) Game.play.layout();
        paintScale();
      });
      paintScale();
      parent.appendChild(scaleRow);
    }]);
    // GGKit owns the shake toggle and its persistence. Mirror the current
    // value into the validated game profile so an OS reduced-motion default is
    // not lost when the player merely opens settings.
    profile.motionSet = true;
    profile.motionEnabled = kit.juice.enabled !== false;
    persist();
    var rows = box ? box.querySelectorAll('button') : [];
    for (var i = 0; i < rows.length; i++) {
      if (!/^Screen shake:/.test(rows[i].textContent)) continue;
      rows[i].addEventListener('click', function () {
        profile.motionEnabled = kit.juice.enabled !== false;
        profile.motionSet = true;
        persist();
      });
      break;
    }
    themeOverlay(box, 'SETTINGS');
    return box;
  }

  // ======================================================= scene transition
  // Screens fade through a shutter rather than cutting. The shutter is a DOM
  // layer, not a Phaser object, so it survives the scene swap it is covering
  // and cannot be torn down halfway by the scene it is hiding.
  var shutter = null;
  var shutterBusy = false;
  function ensureShutter() {
    if (shutter) return shutter;
    shutter = document.createElement('div');
    shutter.id = 'sl-shutter';
    shutter.style.cssText = 'position:fixed;inset:0;z-index:80;opacity:0;pointer-events:none;' +
      'background:radial-gradient(120% 90% at 50% 45%, #1b2440 0%, #0b1020 62%, #05070f 100%);' +
      'transition:opacity .16s ease-out;';
    var bars = document.createElement('div');
    bars.style.cssText = 'position:absolute;inset:0;' +
      'background:repeating-linear-gradient(0deg,rgba(111,128,200,.16) 0 2px,rgba(0,0,0,0) 2px 12px);' +
      '-webkit-mask-image:linear-gradient(180deg,#000,rgba(0,0,0,0));' +
      'mask-image:linear-gradient(180deg,#000,rgba(0,0,0,0));';
    shutter.appendChild(bars);
    document.body.appendChild(shutter);
    return shutter;
  }
  // Runs `fn` behind a closed shutter. Reduced motion shortens the beat to a
  // near-instant cover rather than removing the continuity entirely.
  function transition(fn) {
    var s = ensureShutter();
    if (shutterBusy) { fn(); return; }
    shutterBusy = true;
    var hold = motionOn() ? 170 : 60;
    s.style.transition = 'opacity ' + (hold / 1000).toFixed(3) + 's ease-out';
    s.style.opacity = '1';
    s.style.pointerEvents = 'auto';
    setTimeout(function () {
      try { fn(); } catch (e) { /* a failed swap must still lift the shutter */ }
      setTimeout(function () {
        s.style.transition = 'opacity ' + (motionOn() ? 0.26 : 0.08) + 's ease-out';
        s.style.opacity = '0';
        s.style.pointerEvents = 'none';
        shutterBusy = false;
      }, 70);
    }, hold + 10);
  }

  // `immediate` skips the shutter. The debug force hooks use it so a harness
  // never has to wait out a cosmetic beat to observe the switch it just set.
  function run(immediate, fn) { if (immediate) fn(); else transition(fn); }

  function startPlay(args, immediate) {
    run(immediate, function () {
      kit.input.clearAll();
      if (Game.play) Game.play.releaseInputs();
      if (Game.title) Game.title.scene.start('play', args);
    });
  }
  function startTitle(immediate) {
    run(immediate, function () {
      kit.input.clearAll();
      if (Game.play) Game.play.releaseInputs();
      if (Game.play) Game.play.scene.start('title');
    });
  }
  function restartPlay(args, immediate) {
    run(immediate, function () {
      restartOverride = args || null;
      kit.restart();
    });
  }
  function playMusic(name, fadeMs) {
    pendingMusic = { name: name, fadeMs: fadeMs };
    if (audioUnlocked) kit.audio.music(name, fadeMs);
  }

  function refreshControlScale() {
    if (!controls) return;
    var ids = ['hold', 'left', 'rotate', 'right', 'drop'];
    for (var i = 0; i < ids.length; i++) {
      var b = controls.btns[ids[i]];
      b.style.fontSize = scaledPx(17) + 'px';
      if (b.children[0]) b.children[0].style.fontSize = scaledPx(ids[i] === 'left' || ids[i] === 'right' || ids[i] === 'rotate' ? 19 : 14) + 'px';
    }
  }

  // =========================================================== DOM theming
  // GGKit still owns the loader, settings shell and pause lifecycle. The title
  // only restyles the DOM they produce so no screen ships in utility grey.
  var SKIN = {
    bg: 'radial-gradient(120% 80% at 50% 10%, #263162 0%, #161d38 48%, #0b1020 100%)',
    font: FONT
  };
  function gridStrip() {
    var s = document.createElement('div');
    s.style.cssText = 'position:absolute;left:0;right:0;bottom:0;height:120px;pointer-events:none;' +
      'background:repeating-linear-gradient(90deg,rgba(60,78,140,.35) 0 2px,rgba(0,0,0,0) 2px 34px),' +
      'repeating-linear-gradient(0deg,rgba(60,78,140,.35) 0 2px,rgba(0,0,0,0) 2px 34px);' +
      '-webkit-mask-image:linear-gradient(180deg,rgba(0,0,0,0) 0%,#000 80%);' +
      'mask-image:linear-gradient(180deg,rgba(0,0,0,0) 0%,#000 80%);opacity:.55;';
    return s;
  }
  function themeOverlay(box, title) {
    if (!box || box.__skinned) return box;
    box.__skinned = true;
    box.style.background = SKIN.bg;
    box.style.fontFamily = SKIN.font;
    box.style.color = CSS.text;
    box.appendChild(gridStrip());
    var kids = box.querySelectorAll('div, button');
    for (var i = 0; i < kids.length; i++) {
      var e = kids[i];
      if (e.tagName === 'BUTTON') {
        var primary = /back|resume/i.test(e.textContent);
        e.style.cssText += ';position:relative;font-family:' + SKIN.font +
          ';letter-spacing:.06em;font-weight:750;border-radius:12px;' +
          'border:1px solid ' + (primary ? CSS.amber : CSS.edge) + ';' +
          'background:' + (primary ? 'linear-gradient(180deg,#5a3a12,#33220c)'
            : 'linear-gradient(180deg,#232e56,#161d38)') + ';color:' + CSS.text + ';';
      } else if (i === 0 && title) {
        e.style.cssText += ';letter-spacing:.22em;color:' + CSS.text + ';';
      }
    }
    return box;
  }
  function themeLoader() {
    var box = document.body.lastElementChild;
    if (!box || box.__skinned) return;
    box.__skinned = true;
    box.style.background = SKIN.bg;
    box.style.fontFamily = SKIN.font;
    box.appendChild(gridStrip());
    var head = box.firstElementChild;
    if (head) {
      head.style.cssText = 'font-size:28px;font-weight:800;letter-spacing:.24em;margin-bottom:4px;' +
        'color:' + CSS.text + ';z-index:1;';
      var sub = document.createElement('div');
      sub.textContent = 'Stack it. Lock it. Clear it.';
      sub.style.cssText = 'font-size:14px;letter-spacing:.08em;color:' + CSS.amber +
        ';margin-bottom:22px;opacity:.9;z-index:1;';
      head.parentNode.insertBefore(sub, head.nextSibling);
    }
    for (var i = 0; i < box.children.length; i++) {
      var e = box.children[i];
      if (e.style && e.style.height === '8px') {
        e.style.cssText = 'width:min(70vw,320px);height:10px;border-radius:5px;position:relative;' +
          'background:rgba(20,27,43,.9);border:1px solid ' + CSS.edge + ';overflow:hidden;z-index:1;';
        var bar = e.firstElementChild;
        if (bar) {
          bar.style.cssText = 'width:0%;height:100%;transition:width .18s;' +
            'background:linear-gradient(90deg,#4c6fe0,' + CSS.amber + ');';
        }
        break;
      }
    }
  }

  // ======================================================== DOM control bar
  // Defect class 3: these handlers capture the pointer, so GGKit's window
  // listener can be bypassed by the capture target. Every handler seeds and
  // clears kit.input.pointers itself, at claim time, keeping the kit's
  // per-pointer identity map authoritative for pause and restart clearing.
  var CTRL_H = 78;                    // css px, excluding the safe-area inset
  var controls = null;

  function buildControls() {
    if (controls) return controls;
    var bar = document.createElement('div');
    bar.id = 'sl-controls';
    bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:60;display:none;' +
      'padding:8px 8px calc(8px + env(safe-area-inset-bottom)) 8px;' +
      'box-sizing:border-box;gap:8px;justify-content:center;' +
      'font-family:' + FONT + ';touch-action:none;';
    document.body.appendChild(bar);

    var defs = [
      { id: 'hold', label: 'HOLD' },
      { id: 'left', label: '◀', repeat: true },
      { id: 'rotate', label: '↻' },
      { id: 'right', label: '▶', repeat: true },
      { id: 'drop', label: '▼▼' }
    ];
    var btns = {};
    for (var i = 0; i < defs.length; i++) btns[defs[i].id] = makeButton(bar, defs[i]);
    controls = { root: bar, btns: btns, handler: null };
    return controls;
  }

  function makeButton(parent, def) {
    var b = document.createElement('button');
    b.type = 'button';
    b.dataset.zone = def.id;
    b.setAttribute('aria-label', def.id);
    b.style.cssText = 'flex:1 1 0;min-width:0;height:' + (CTRL_H - 16) + 'px;min-height:44px;' +
      'border-radius:14px;border:1px solid ' + CSS.edge + ';color:' + CSS.text + ';' +
      'background:linear-gradient(180deg,#242f57,#151c34);font-family:' + FONT + ';' +
      'font-size:' + scaledPx(17) + 'px;font-weight:750;letter-spacing:.04em;touch-action:none;' +
      '-webkit-tap-highlight-color:transparent;user-select:none;transition:transform .08s ease-out;';
    var lab = document.createElement('div');
    lab.textContent = def.label;
    lab.style.cssText = 'font-size:' + scaledPx(def.label.length > 2 ? 14 : 19) + 'px;line-height:1.1;';
    b.appendChild(lab);
    parent.appendChild(b);

    function down(e) {
      e.preventDefault();
      if (b.setPointerCapture) { try { b.setPointerCapture(e.pointerId); } catch (err) { /* no capture */ } }
      // Seed the kit's pointer map at claim time (defect class 3).
      kit.input.pointers.set(e.pointerId, {
        x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY,
        downAt: performance.now(), zone: def.id
      });
      b.style.transform = 'scale(.96)';
      if (controls && controls.handler) controls.handler(def.id, true);
    }
    function up(e) {
      kit.input.pointers.delete(e.pointerId);
      b.style.transform = '';
      if (controls && controls.handler) controls.handler(def.id, false);
    }
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('lostpointercapture', up);
    b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    return b;
  }

  function showControls(on) {
    var c = buildControls();
    c.root.style.display = on ? 'flex' : 'none';
  }

  function highlightControls(verb) {
    if (!controls || controls.currentCoach === verb) return;
    controls.currentCoach = verb;
    var ids = ['hold', 'left', 'rotate', 'right', 'drop'];
    for (var i = 0; i < ids.length; i++) {
      var active = verb === ids[i] || (verb === 'shift' && (ids[i] === 'left' || ids[i] === 'right'));
      var b = controls.btns[ids[i]];
      b.style.boxShadow = active ? '0 0 0 3px rgba(255,199,97,.75), 0 0 18px rgba(255,167,36,.55)' : '';
      b.style.opacity = active ? '1' : (verb && verb !== 'clear' ? '.72' : '1');
    }
  }

  // ============================================================ audio names
  var SFX = ['sfx_move', 'sfx_rotate', 'sfx_soft', 'sfx_lock', 'sfx_hard',
    'sfx_clear1', 'sfx_clear2', 'sfx_clear3', 'sfx_quad', 'sfx_combo',
    'sfx_hold', 'sfx_deny', 'sfx_level', 'sfx_goal', 'sfx_ui', 'sfx_bomb',
    'sfx_pickup', 'sfx_over', 'sfx_tick'];
  var MUSIC = ['music_board', 'music_rush'];

  function sfx(name, opts) {
    if (!audioUnlocked) {
      audioUnlocked = true;
      if (pendingMusic) kit.audio.music(pendingMusic.name, pendingMusic.fadeMs);
    }
    kit.audio.sfx(name, opts);
  }
  // Round 2 added beats (spin, perfect clear, garbage, rival lock, rival KO)
  // that need their own identity without a new download. Each one is an
  // existing cue re-voiced by playback rate and level, which is how the
  // library gets nine more distinct reads inside the payload budget.
  var VOICE = {
    tspin:     { name: 'sfx_combo', rate: 1.42, volume: 0.95 },
    tspinMini: { name: 'sfx_combo', rate: 1.72, volume: 0.62 },
    perfect:   { name: 'sfx_goal', rate: 1.18, volume: 1.0 },
    garbageIn: { name: 'sfx_bomb', rate: 0.72, volume: 0.7 },
    garbageOut:{ name: 'sfx_hard', rate: 0.82, volume: 0.55 },
    rivalLock: { name: 'sfx_lock', rate: 1.35, volume: 0.28 },
    rivalClear:{ name: 'sfx_clear1', rate: 1.3, volume: 0.4 },
    rivalDown: { name: 'sfx_quad', rate: 0.78, volume: 1.0 },
    danger:    { name: 'sfx_tick', rate: 0.62, volume: 0.5 }
  };
  function voice(key) {
    var v = VOICE[key];
    if (!v) return;
    sfx(v.name, { rate: v.rate, volume: v.volume });
  }

  // ============================================================ Boot scene
  var BootScene = {
    key: 'boot',
    preload: function () {
      kit.loader.show('STACKLOCK');
      themeLoader();
      var self = this;
      this.load.on('progress', function (p) { kit.loader.progress(p * 0.6); });
      this.load.atlas('atlas', 'assets/atlas.png', 'assets/atlas.json');
      this.load.image('disc', 'assets/disc.png');
      this.load.image('p_shard', 'assets/p_shard.png');
      this.load.image('p_spark', 'assets/p_spark.png');
      this.load.image('p_ember', 'assets/p_ember.png');
      this.load.image('p_ring', 'assets/p_ring.png');
      this.load.image('p_beam', 'assets/p_beam.png');
      this.load.image('logo', 'assets/logo.png');
      this.load.on('complete', function () { self.filesDone = true; });
    },
    create: function () {
      var self = this;
      // Pre-warm every texture through the renderer once so the first locked
      // piece never pays an upload cost mid-drop.
      var warm = this.add.container(0, 0).setAlpha(0.001);
      var frames = ['blk_bar', 'blk_box', 'blk_tee', 'blk_jay', 'blk_ell', 'blk_ess',
        'blk_zed', 'blk_hazard', 'blk_wild', 'blk_bomb', 'blk_lit', 'blk_ghost',
        'blk_shell', 'medal_bronze', 'medal_silver', 'medal_gold', 'medal_master', 'lockout'];
      for (var i = 0; i < frames.length; i++) warm.add(this.add.image(4, 4, 'atlas', frames[i]));
      var singles = ['disc', 'p_shard', 'p_spark', 'p_ember', 'p_ring', 'p_beam', 'logo'];
      for (var j = 0; j < singles.length; j++) warm.add(this.add.image(4, 4, singles[j]));
      kit.loader.progress(0.68);

      var reg = {};
      for (var s = 0; s < SFX.length; s++) reg[SFX[s]] = 'assets/' + SFX[s] + '.mp3';
      for (var m = 0; m < MUSIC.length; m++) reg[MUSIC[m]] = 'assets/' + MUSIC[m] + '.mp3';
      kit.audio.register(reg);

      var done = 0;
      Promise.all(SFX.map(function (n) {
        return kit.audio.preload([n]).then(function () {
          done++;
          kit.loader.progress(0.68 + 0.32 * (done / SFX.length));
        });
      })).then(function () {
        kit.loader.progress(1);
        warm.destroy(true);
        // Music stays lazy until the first real interaction unlocks audio.
        // SFX are already warmed so the first action remains responsive.
        SL_DEBUG_STATE.ready = true;
        self.time.delayedCall(50, function () {
          kit.loader.hide();
          // Defect class 6: a switch set before boot finished is honoured here.
          if (SL_DEBUG_STATE.forceMode) {
            self.scene.start('play', startArgs(SL_DEBUG_STATE.forceMode, SL_DEBUG_STATE.forceBoard));
          } else if (SL_DEBUG_STATE.forceBoard) {
            self.scene.start('play', startArgs('puzzle', SL_DEBUG_STATE.forceBoard));
          } else {
            self.scene.start('title');
          }
        });
      });
    }
  };

  // ============================================== shared painted background
  // One baked opaque sky per identity per view size. Blended full-screen
  // layers are the biggest cost on a throttled CPU, so the gradient, the wash
  // and the grain are composited ONCE into a texture and drawn as a single
  // unblended quad.
  // Round 2: the sky EVOLVES. `tier` walks the identity's cool stops toward
  // its authored hot stops, and the baked motif changes with it, so a level 18
  // Marathon board does not sit on the same wallpaper as level 1. Bakes are
  // still per (identity, tier, size) and still capped, so a whole run mints a
  // handful of textures, not one per frame.
  var SKY_TIERS = 4;
  function skyStops(id, tier) {
    var cool = id.sky || FALLBACK_IDENTITY.sky;
    var hot = id.skyHot || cool;
    var u = clamp(tier / (SKY_TIERS - 1), 0, 1);
    var out = [];
    for (var i = 0; i < cool.length; i++) {
      var a = cssToInt(cool[i]);
      var b = cssToInt(hot[Math.min(i, hot.length - 1)]);
      out.push(intToCss(mixColor(a, b, u)));
    }
    return out;
  }

  function bakeSky(scene, rawW, rawH, id, tierIn) {
    // Quantise the bake size so a drag-resize or an address-bar reflow cannot
    // mint a new full-screen canvas texture on every frame.
    var w = Math.ceil(rawW / 32) * 32;
    var h = Math.ceil(rawH / 32) * 32;
    var tier = clamp(tierIn | 0, 0, SKY_TIERS - 1);
    var key = 'sky_' + id.id + '_t' + tier + '_' + w + 'x' + h;
    if (scene.textures.exists(key)) return key;
    var tex = scene.textures.createCanvas(key, w, h);
    var ctx = tex.getContext();
    var g = ctx.createLinearGradient(0, 0, w * 0.35, h);
    var stops = skyStops(id, tier);
    for (var i = 0; i < stops.length; i++) g.addColorStop(i / (stops.length - 1), stops[i]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // corner vignette + a quiet diagonal rhythm, both baked
    var rad = ctx.createRadialGradient(w * 0.5, h * 0.18, 0, w * 0.5, h * 0.18, Math.max(w, h) * 0.9);
    rad.addColorStop(0, 'rgba(255,255,255,' + (0.07 + tier * 0.012).toFixed(3) + ')');
    rad.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = rad;
    ctx.fillRect(0, 0, w, h);

    // Per-area motif, baked. The four identities do not share a wallpaper.
    var motif = id.motif || 'grid';
    ctx.globalAlpha = (id.grain != null ? id.grain : 0.1) * (1 + tier * 0.22);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    var x;
    if (motif === 'rule') {
      // Sprint: dead straight rules, the calmest possible field.
      for (var yy = (h % 34); yy < h; yy += 34) {
        ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(w, yy); ctx.stroke();
      }
    } else if (motif === 'pulse') {
      // Ultra: concentric overclock rings, tighter as the tier rises.
      var step = 74 - tier * 9;
      for (var rr = step; rr < Math.max(w, h) * 1.1; rr += step) {
        ctx.beginPath(); ctx.arc(w * 0.5, h * 0.34, rr, 0, Math.PI * 2); ctx.stroke();
      }
    } else if (motif === 'cog') {
      // Puzzle: interlocking brass rings, the Lockworks read.
      for (var cy2 = -40; cy2 < h + 80; cy2 += 118) {
        for (var cx2 = -20; cx2 < w + 60; cx2 += 118) {
          ctx.beginPath(); ctx.arc(cx2, cy2, 34, 0, Math.PI * 2); ctx.stroke();
          ctx.beginPath(); ctx.arc(cx2, cy2, 19, 0, Math.PI * 2); ctx.stroke();
        }
      }
    } else if (motif === 'ember') {
      // Master Clear: rising heat lines that lean harder every tier.
      var lean = 0.35 + tier * 0.1;
      for (x = -h; x < w + h; x += 22) {
        ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(x + h * lean, 0); ctx.stroke();
      }
    } else {
      for (x = -h; x < w; x += 26 - tier * 2) {
        ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(x + h, 0); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    tex.refresh();
    scene.skyKeys = scene.skyKeys || [];
    scene.skyKeys.push(key);
    // Two sky quads are live at once during a tier crossfade, so the cache
    // floor has to sit above two or a live texture could be evicted.
    while (scene.skyKeys.length > 5) {
      var old = scene.skyKeys.shift();
      if (old !== key && scene.textures.exists(old)) scene.textures.remove(old);
    }
    return key;
  }

  // A Phaser Graphics object replays its whole command list into the batch on
  // EVERY frame, not only when it is redrawn. A 200 cell grid and a stack of
  // panel rounded-rects therefore cost a full re-tessellation per frame, which
  // is what pinned the play scene at 4 fps in the first profile. Everything
  // static is baked into a canvas texture once per layout and drawn as ONE
  // quad; only genuinely animated shapes stay in a Graphics.
  function rr(ctx, x, y, w, h, r) {
    var rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }
  function hexCss(n) { return '#' + ('000000' + (n >>> 0).toString(16)).slice(-6); }

  // ============================================================ Title scene
  var TitleScene = {
    key: 'title',
    create: function () {
      var self = this;
      Game.title = this;
      SL_DEBUG_STATE.scene = 'title';
      SL_DEBUG_STATE.phase = 'title';
      showControls(false);
      playMusic('music_board', 900);

      this.page = 0;              // 0 = modes, 1 = puzzle board grid, 2 = records
      this.nodes = [];
      this.cards = [];            // per-card containers, for the stagger intro
      this.focusIndex = 0;
      this.introT = 0;
      this.ambientT = 0;
      this.keyPrev = { up: false, down: false, left: false, right: false, enter: false, escape: false };
      this.buildAmbient();
      this.layout();
      this.scale.on('resize', this.layout, this);
      this.events.once('shutdown', function () {
        self.scale.off('resize', self.layout, self);
        Game.title = null;
      });
    },

    // A slow drift of the title's own piece silhouettes behind the cards.
    // Fixed pool, no allocation, and it is the ONLY moving thing behind the
    // menu so the cards stay the read.
    buildAmbient: function () {
      this.ambient = [];
      var frames = ['blk_bar', 'blk_box', 'blk_tee', 'blk_jay', 'blk_ell', 'blk_ess', 'blk_zed'];
      for (var i = 0; i < 14; i++) {
        var img = this.add.image(0, 0, 'atlas', frames[i % frames.length])
          .setDepth(1).setAlpha(0.14);
        this.ambient.push({
          img: img,
          x: 0, y: 0, size: 18 + (i % 5) * 7,
          speed: 12 + (i % 6) * 5, spin: (i % 2 ? 1 : -1) * (6 + (i % 4) * 4),
          seed: i * 0.7
        });
      }
      this.ambientPlaced = false;
    },

    placeAmbient: function (w, h) {
      for (var i = 0; i < this.ambient.length; i++) {
        var a = this.ambient[i];
        a.x = ((i * 97) % 100) / 100 * w;
        a.y = ((i * 61) % 100) / 100 * (h + 120) - 60;
      }
      this.ambientPlaced = true;
    },

    stepAmbient: function (dt, w, h) {
      if (!this.ambient || !this.ambient.length) return;
      if (!this.ambientPlaced) this.placeAmbient(w, h);
      var slow = motionOn() ? 1 : 0.25;
      for (var i = 0; i < this.ambient.length; i++) {
        var a = this.ambient[i];
        a.y += a.speed * slow * dt / 1000;
        if (a.y > h + 40) { a.y = -40; a.x = (a.x * 1.37 + 61) % Math.max(1, w); }
        a.img.setPosition(a.x, a.y).setDisplaySize(a.size, a.size)
          .setAngle(motionOn() ? (this.ambientT * a.spin * 0.01 + a.seed * 40) : 0);
      }
    },

    update: function (time, delta) {
      var dt = Math.min(delta || 16.7, 100);
      this.ambientT += dt;
      if (this.introT < 1400) this.introT += dt;
      this.stepAmbient(dt, this.scale.gameSize.width, this.scale.gameSize.height);
      this.paintIntro();
      if (this.logoImg) {
        var bob = motionOn() ? Math.sin(this.ambientT * 0.0016) * 3 : 0;
        this.logoImg.setY(this.logoBaseY + bob);
      }
      if (kit.paused) return;
      var up = kit.input.keyDown('ArrowUp') || kit.input.keyDown('KeyW');
      var down = kit.input.keyDown('ArrowDown') || kit.input.keyDown('KeyS');
      var left = kit.input.keyDown('ArrowLeft') || kit.input.keyDown('KeyA');
      var right = kit.input.keyDown('ArrowRight') || kit.input.keyDown('KeyD');
      var enter = kit.input.keyDown('Enter') || kit.input.keyDown('Space');
      var escape = kit.input.keyDown('Escape');
      var p = this.keyPrev;
      var upEdge = up && !p.up, downEdge = down && !p.down;
      var leftEdge = left && !p.left, rightEdge = right && !p.right;
      var enterEdge = enter && !p.enter, escapeEdge = escape && !p.escape;
      p.up = up; p.down = down; p.left = left; p.right = right;
      p.enter = enter; p.escape = escape;

      var count = this.focusRects ? this.focusRects.length : 1;
      if (this.page === 0) {
        if (upEdge || leftEdge) this.focusIndex = Math.max(0, this.focusIndex - 1);
        if (downEdge || rightEdge) this.focusIndex = Math.min(count - 1, this.focusIndex + 1);
        if (enterEdge) this.activateFocus();
      } else if (this.page === 1) {
        if (escapeEdge) { this.goPage(0); return; }
        var cols = PUZZLE_COLS;
        var col = this.focusIndex % cols;
        var row = Math.floor(this.focusIndex / cols);
        var lastRow = Math.floor((count - 1) / cols);
        if (leftEdge) col = Math.max(0, col - 1);
        if (rightEdge) col = Math.min(cols - 1, col + 1);
        if (upEdge) row = Math.max(0, row - 1);
        if (downEdge) row = Math.min(lastRow, row + 1);
        this.focusIndex = Math.min(count - 1, row * cols + col);
        if (enterEdge) this.activateFocus();
      } else {
        if (escapeEdge) { this.goPage(0); return; }
        this.focusIndex = 0;
        if (enterEdge) this.goPage(0);
      }
      this.updateFocus();
    },

    goPage: function (page) {
      this.page = page;
      this.focusIndex = 0;
      this.introT = 0;
      sfx('sfx_ui');
      this.layout();
    },

    activateFocus: function () {
      var self = this;
      if (this.page === 0) {
        var n = TITLE_MODES.length;
        if (this.focusIndex < n) {
          var mode = TITLE_MODES[this.focusIndex];
          if (mode === 'master' && !this.masterUnlocked()) return;
          if (mode === 'puzzle') { this.goPage(1); return; }
          startPlay(startArgs(mode, ''));
        } else if (this.focusIndex === n) {
          self.goPage(2);
        } else if (this.focusIndex === n + 1) {
          openSettings();
        } else if (this.focusIndex === n + 2) {
          self.showHelp();
        }
        return;
      }
      if (this.page === 1 && this.focusIndex < unlockedCount()) {
        startPlay({ mode: 'puzzle', puzzleIndex: this.focusIndex });
      }
    },

    clearNodes: function () {
      for (var i = 0; i < this.nodes.length; i++) this.nodes[i].destroy();
      this.nodes.length = 0;
      this.cards.length = 0;
      this.logoImg = null;
    },

    // Cards slide up and fade in on a stagger rather than appearing. Reduced
    // motion keeps the fade and drops the travel.
    paintIntro: function () {
      if (!this.cards || !this.cards.length) return;
      var travel = motionOn() ? 26 : 0;
      for (var i = 0; i < this.cards.length; i++) {
        var c = this.cards[i];
        if (c.done) continue;
        var u = clamp((this.introT - i * 55) / 300, 0, 1);
        var e = easeOutCubic(u);
        c.node.setAlpha(e).setY(c.baseY + (1 - e) * travel);
        if (u >= 1) { c.done = true; c.node.setAlpha(1).setY(c.baseY); }
      }
    },

    layout: function () {
      var w = this.scale.gameSize.width;
      var h = this.scale.gameSize.height;
      Game.insets = readInsets();
      this.clearNodes();
      var ins = Game.insets;
      var key = bakeSky(this, Math.ceil(w), Math.ceil(h), identity('marathon'), 0);
      var bg = this.add.image(0, 0, key).setOrigin(0, 0).setDepth(0);
      bg.setDisplaySize(w, h);
      this.nodes.push(bg);
      this.ambientPlaced = false;
      if (this.page === 0) this.buildModes(w, h, ins);
      else if (this.page === 1) this.buildPuzzleGrid(w, h, ins);
      else this.buildRecords(w, h, ins);
    },

    card: function (x, y, w, h, accent, alpha) {
      var g = this.add.graphics().setDepth(2);
      g.fillStyle(0x141b2b, alpha == null ? 0.82 : alpha);
      g.fillRoundedRect(x, y, w, h, 16);
      g.lineStyle(2, accent, 0.75);
      g.strokeRoundedRect(x, y, w, h, 16);
      this.nodes.push(g);
      return g;
    },

    label: function (x, y, text, size, color, weight, origin) {
      var t = this.add.text(x, y, text, {
        fontFamily: FONT, fontSize: scaledPx(size) + 'px',
        fontStyle: weight || '600', color: color || CSS.text
      }).setDepth(3).setOrigin(origin == null ? 0 : origin, 0.5);
      this.nodes.push(t);
      return t;
    },

    hit: function (x, y, w, h, fn) {
      // Zones compute their hit area from size at setInteractive time, so the
      // zone is created centred rather than re-origined afterwards.
      var z = this.add.zone(x + w / 2, y + h / 2, w, h).setDepth(9).setInteractive();
      z.on('pointerup', function () { sfx('sfx_ui'); fn(); });
      this.nodes.push(z);
      return z;
    },

    // Wraps everything created since `mark` into one container so the intro
    // can stagger it. Container.add() returns the CONTAINER, never the child,
    // so its result is deliberately discarded here.
    groupSince: function (mark) {
      var cont = this.add.container(0, 0).setDepth(2);
      cont.add(this.nodes.slice(mark));
      this.nodes.length = mark;
      this.nodes.push(cont);
      this.cards.push({ node: cont, baseY: 0, done: false });
      cont.setAlpha(0);
      return cont;
    },

    buildModes: function (w, h, ins) {
      var self = this;
      this.focusRects = [];
      var pad = 16 + ins.left;
      var cw = w - pad * 2;
      var top = ins.top + 12;

      var logo = this.add.image(w / 2, top + 36, 'logo').setDepth(3);
      logo.setScale(Math.min(1, (cw * 0.62) / logo.width));
      this.nodes.push(logo);
      this.logoImg = logo;
      this.logoBaseY = top + 36;
      this.label(w / 2, top + 80, 'STACKLOCK', 28, CSS.text, '800', 0.5);
      this.label(w / 2, top + 104, 'Stack it. Lock it. Clear it.', 14, CSS.dim, '600', 0.5);

      var y = top + 126;
      var by = h - ins.bottom - 56;
      var modes = TITLE_MODES;
      var ch = clamp((by - y - 12) / modes.length, 62, 112);
      for (var i = 0; i < modes.length; i++) {
        (function (mode, yy) {
          var mark = self.nodes.length;
          var id = identity(mode);
          var locked = (mode === 'master') && !self.masterUnlocked();
          var h0 = ch - 8;
          self.focusRects.push({ x: pad, y: yy, w: cw, h: h0 });
          self.card(pad, yy, cw, h0, locked ? 0x39415e : id.frameEdge, locked ? 0.5 : 0.85);
          // A colour bar keys each card to its board identity, so the menu
          // carries the same per-area palette the boards do.
          var bar = self.add.graphics().setDepth(2);
          bar.fillStyle(locked ? 0x39415e : id.accent, locked ? 0.4 : 0.9);
          bar.fillRoundedRect(pad + 4, yy + 8, 5, h0 - 16, 3);
          self.nodes.push(bar);
          self.label(pad + 20, yy + h0 * 0.26, id.name, 18, locked ? CSS.dim : CSS.text, '800');
          self.label(pad + 20, yy + h0 * 0.5, id.sub, 12, intToCss(id.accent), '700');
          var blurb = locked
            ? 'Clear Puzzle board 20 and reach Marathon level 10 to unlock.'
            : id.blurb;
          var bt = self.label(pad + 20, yy + h0 * 0.76, blurb, 12, CSS.dim, '500');
          bt.setWordWrapWidth(cw - 128);
          bt.setOrigin(0, 0.5);

          var stat = self.modeStat(mode);
          if (stat.text) self.label(pad + cw - 16, yy + h0 * 0.26, stat.text, 14, stat.color, '750', 1);
          if (stat.sub) self.label(pad + cw - 16, yy + h0 * 0.52, stat.sub, 12, CSS.dim, '650', 1);
          if (stat.medal) {
            var m = self.add.image(pad + cw - 26, yy + h0 * 0.76, 'atlas', stat.medal)
              .setDepth(3).setDisplaySize(26, 26);
            self.nodes.push(m);
          }
          var cont = self.groupSince(mark);
          cont.baseY = 0;
          if (!locked) {
            // The rival card carries a second target: its right edge cycles the
            // earned opponent tier instead of starting the duel.
            if (mode === 'rival') {
              var tw = 104;
              self.hit(pad, yy, cw - tw, h0, function () { startPlay(startArgs(mode, '')); });
              self.hit(pad + cw - tw, yy, tw, h0, function () { self.cycleRivalTier(); });
            } else {
              self.hit(pad, yy, cw, h0, function () {
                if (mode === 'puzzle') { self.goPage(1); return; }
                startPlay(startArgs(mode, ''));
              });
            }
          }
        })(modes[i], y + i * ch);
      }

      var bw = (cw - 16) / 3;
      var bottom = [
        { label: 'RECORDS', fn: function () { self.goPage(2); } },
        { label: 'SETTINGS', fn: function () { openSettings(); } },
        { label: 'HELP', fn: function () { self.showHelp(); } }
      ];
      var bmark = this.nodes.length;
      for (var b = 0; b < bottom.length; b++) {
        var bx = pad + b * (bw + 8);
        this.card(bx, by, bw, 46, 0x3d4a78, 0.8);
        this.label(bx + bw / 2, by + 23, bottom[b].label, 14, CSS.text, '750', 0.5);
        this.focusRects.push({ x: bx, y: by, w: bw, h: 46 });
      }
      this.groupSince(bmark);
      for (var b2 = 0; b2 < bottom.length; b2++) {
        this.hit(pad + b2 * (bw + 8), by, bw, 46, bottom[b2].fn);
      }
      this.focusG = this.add.graphics().setDepth(8);
      this.nodes.push(this.focusG);
      this.updateFocus();
    },

    cycleRivalTier: function () {
      var max = highestRivalTier();
      if (max <= 0) return;
      profile.rivalTier = ((profile.rivalTier | 0) + 1) % (max + 1);
      persist();
      sfx('sfx_ui');
      this.introT = 1400;   // do not replay the intro for a stat change
      this.layout();
      for (var i = 0; i < this.cards.length; i++) {
        this.cards[i].done = true;
        this.cards[i].node.setAlpha(1);
      }
    },

    modeStat: function (mode) {
      if (mode === 'marathon') {
        return {
          text: profile.bestScore ? profile.bestScore.toLocaleString() : '',
          color: CSS.amber, medal: medalFrame('marathon', profile.marathonMedal)
        };
      }
      if (mode === 'sprint') {
        return {
          text: profile.bestSprint ? formatTime(profile.bestSprint) : '',
          color: '#8fe6ff', medal: medalFrame('sprint', profile.sprintMedal)
        };
      }
      if (mode === 'ultra') {
        return {
          text: profile.bestUltra ? profile.bestUltra.toLocaleString() : '',
          color: '#7dffdc', medal: medalFrame('ultra', profile.ultraMedal)
        };
      }
      if (mode === 'puzzle') {
        return {
          text: (profile.puzzleDone.length || 0) + ' / ' + PUZZLES.length,
          color: '#ffc861', medal: ''
        };
      }
      if (mode === 'rival') {
        var t = rivalTier(profile.rivalTier);
        var more = highestRivalTier() > 0 ? '  ↻' : '';
        return {
          text: t.name + more, color: '#a8f06a',
          sub: (profile.rivalWins || 0) + ' won',
          medal: medalFrame('rival', profile.rivalMedal)
        };
      }
      return {
        text: profile.masterDone ? 'CLEARED' : '', color: '#ff8a3c',
        medal: profile.masterDone ? 'medal_master' : ''
      };
    },

    masterUnlocked: function () {
      return profile.masterDone ||
        ((profile.puzzleDone.length || 0) >= 20 && (profile.bestLines || 0) >= 90);
    },

    buildPuzzleGrid: function (w, h, ins) {
      var self = this;
      this.focusRects = [];
      var pad = 16 + ins.left;
      var cw = w - pad * 2;
      var top = ins.top + 18;
      this.label(pad, top + 14, 'PUZZLE', 24, CSS.text, '800');
      this.label(pad, top + 40, 'Lockworks - hand-authored boards', 12, '#ffc861', '650');
      this.label(pad + cw, top + 14, (profile.puzzleDone.length || 0) + ' / ' + PUZZLES.length,
        15, CSS.dim, '750', 1);

      var cols = PUZZLE_COLS;
      var gap = 8;
      var size = Math.floor((cw - gap * (cols - 1)) / cols);
      var gy = top + 62;
      var unlocked = unlockedCount();
      SL_DEBUG_STATE.unlockedPuzzles = unlocked;
      for (var i = 0; i < PUZZLES.length; i++) {
        (function (i) {
          var mark = self.nodes.length;
          var p = PUZZLES[i];
          var x = pad + (i % cols) * (size + gap);
          var y = gy + Math.floor(i / cols) * (size + gap);
          self.focusRects.push({ x: x, y: y, w: size, h: size });
          var done = profile.puzzleDone.indexOf(p.id) >= 0;
          var open = i < unlocked;
          self.card(x, y, size, size, done ? 0xffc861 : (open ? 0x6f80c8 : 0x39415e),
            open ? 0.86 : 0.45);
          self.label(x + size / 2, y + size * 0.36, done ? '✓' : (open ? String(i + 1) : '■'),
            done ? 22 : 19, done ? '#ffc861' : (open ? CSS.text : '#5b6588'), '800', 0.5);
          var nm = self.label(x + size / 2, y + size * 0.74, open ? p.name : 'Locked', 11,
            open ? CSS.dim : '#5b6588', '650', 0.5);
          nm.setWordWrapWidth(size - 6);
          nm.setAlign('center');
          nm.setOrigin(0.5, 0.5);
          self.groupSince(mark);
          if (open) {
            self.hit(x, y, size, size, function () {
              startPlay({ mode: 'puzzle', puzzleIndex: i });
            });
          }
        })(i);
      }

      var by = h - ins.bottom - 58;
      this.card(pad, by, cw, 46, 0x3d4a78, 0.8);
      this.label(pad + cw / 2, by + 23, 'BACK', 14, CSS.text, '750', 0.5);
      this.hit(pad, by, cw, 46, function () { self.goPage(0); });
      this.focusRects.push({ x: pad, y: by, w: cw, h: 46 });
      this.focusG = this.add.graphics().setDepth(8);
      this.nodes.push(this.focusG);
      this.updateFocus();
    },

    // ------------------------------------------------------- records page
    // The personal-best table per mode, plus the career counters the round 2
    // mechanics feed. Menus may breathe; this page never appears during play.
    buildRecords: function (w, h, ins) {
      var self = this;
      this.focusRects = [];
      var pad = 16 + ins.left;
      var cw = w - pad * 2;
      var top = ins.top + 18;
      this.label(pad, top + 14, 'RECORDS', 24, CSS.text, '800');
      this.label(pad, top + 40, 'Personal bests, five deep', 12, '#ffc861', '650');

      var rows = [
        { mode: 'marathon', name: 'MARATHON', unit: 'score' },
        { mode: 'ultra', name: 'ULTRA 2:00', unit: 'score' },
        { mode: 'sprint', name: 'SPRINT 40', unit: 'time' },
        { mode: 'rival', name: 'RIVAL KO', unit: 'time' }
      ];
      var y = top + 66;
      var rh = 76;
      for (var i = 0; i < rows.length; i++) {
        var mark = this.nodes.length;
        var r = rows[i];
        var id = identity(r.mode);
        var list = (profile.records && profile.records[r.mode]) || [];
        this.card(pad, y, cw, rh - 8, id.frameEdge, 0.82);
        this.label(pad + 14, y + 20, r.name, 15, CSS.text, '800');
        var top1 = list.length ? formatRecord(r.unit, list[0]) : '--';
        this.label(pad + cw - 14, y + 20, top1, 18, intToCss(id.accent), '800', 1);
        var rest = [];
        for (var k = 1; k < list.length; k++) rest.push(formatRecord(r.unit, list[k]));
        this.label(pad + 14, y + 48, rest.length ? rest.join('   ') : 'No runs banked yet',
          12, CSS.dim, '600');
        this.groupSince(mark);
        y += rh;
      }

      var cmark = this.nodes.length;
      var c = profile.career || emptyCareer();
      this.card(pad, y, cw, 96, 0x6f80c8, 0.82);
      this.label(pad + 14, y + 22, 'CAREER', 15, CSS.text, '800');
      var stats = [
        ['T-SPINS', c.tspins || 0],
        ['QUADS', c.quads || 0],
        ['PERFECT', c.perfects || 0],
        ['BEST COMBO', c.bestCombo || 0],
        ['LINES', c.lines || 0],
        ['BOARDS', (profile.puzzleDone.length || 0) + '/' + PUZZLES.length]
      ];
      for (var s = 0; s < stats.length; s++) {
        var col = s % 3, row = Math.floor(s / 3);
        var sx = pad + 14 + col * ((cw - 28) / 3);
        var sy = y + 50 + row * 26;
        this.label(sx, sy, stats[s][0], 11, CSS.dim, '700');
        this.label(sx + (cw - 28) / 3 - 12, sy, String(stats[s][1]), 14, CSS.text, '800', 1);
      }
      this.groupSince(cmark);

      var by = h - ins.bottom - 58;
      this.card(pad, by, cw, 46, 0x3d4a78, 0.8);
      this.label(pad + cw / 2, by + 23, 'BACK', 14, CSS.text, '750', 0.5);
      this.hit(pad, by, cw, 46, function () { self.goPage(0); });
      this.focusRects.push({ x: pad, y: by, w: cw, h: 46 });
      this.focusG = this.add.graphics().setDepth(8);
      this.nodes.push(this.focusG);
      this.updateFocus();
    },

    showHelp: function () {
      var box = kit.openSettings([]);
      themeOverlay(box, 'HOW TO PLAY');
      var head = box.firstElementChild;
      if (head) head.textContent = 'How to play';
      var lines = [
        'Tap the left or right half of the board to shift.',
        'Tap the falling piece, or the turn button, to rotate.',
        'Swipe down to hard drop. Swipe up to hold.',
        'Fill a full row to clear it. Four at once is a QUAD.',
        'Clears back to back, and clears in a row, both pay more.',
        'Turn a T into a covered seat for a T-SPIN. It pays the most.',
        'Empty the whole board on a clear for a PERFECT CLEAR bonus.',
        'In Rival, your clears bury the opponent and its clears bury you.',
        'Keyboard: arrows move, Z and X turn, space drops, C holds.'
      ];
      var wrap = document.createElement('div');
      wrap.style.cssText = 'max-width:min(80vw,340px);text-align:left;font-size:' + scaledPx(13) + 'px;line-height:1.5;' +
        'color:' + CSS.dim + ';display:flex;flex-direction:column;gap:6px;z-index:1;';
      for (var i = 0; i < lines.length; i++) {
        var d = document.createElement('div');
        d.textContent = lines[i];
        wrap.appendChild(d);
      }
      var back = box.querySelector('button:last-of-type');
      if (back) box.insertBefore(wrap, back); else box.appendChild(wrap);
    },

    updateFocus: function () {
      if (!this.focusG || !this.focusRects || !this.focusRects.length) return;
      var rect = this.focusRects[Math.min(this.focusIndex, this.focusRects.length - 1)];
      this.focusG.clear();
      this.focusG.lineStyle(3, 0xffc861, 0.95);
      this.focusG.strokeRoundedRect(rect.x - 3, rect.y - 3, rect.w + 6, rect.h + 6, 19);
    }
  };

  function medalFrame(mode, key) {
    var list = medalList(mode);
    for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i].frame;
    return '';
  }
  function unlockedCount() {
    // Unlock chain: board n+1 opens when board n is cleared. Always at least
    // one open board, and never more than the set.
    var n = 1;
    for (var i = 0; i < PUZZLES.length; i++) {
      if (profile.puzzleDone.indexOf(PUZZLES[i].id) >= 0) n = Math.max(n, i + 2);
    }
    return Math.min(PUZZLES.length, n);
  }

  // The six board identities in menu order, and the puzzle grid width that
  // keeps the 30 board set on one page at 390px.
  var TITLE_MODES = ['marathon', 'sprint', 'ultra', 'puzzle', 'rival', 'master'];
  var PUZZLE_COLS = 5;

  // Rival tiers are EARNED. Tier n unlocks once the player has banked the
  // wins its row asks for, and the selectable tier is clamped to that.
  function highestRivalTier() {
    var wins = profile.rivalWins || 0;
    var best = 0;
    for (var i = 0; i < RIVALS.length; i++) if (wins >= (RIVALS[i].wins || 0)) best = i;
    return best;
  }
  function formatRecord(unit, value) {
    return unit === 'time' ? formatTime(value) : Number(value).toLocaleString();
  }

  // ============================================================= Play scene
  var PlayScene = {
    key: 'play',

    init: function (args) {
      var a = args || {};
      // Defect class 6: a switch set on the debug object wins over the args,
      // then clears itself so a manual restart does not stay hijacked.
      if (SL_DEBUG_STATE.forceMode) {
        a = startArgs(SL_DEBUG_STATE.forceMode, SL_DEBUG_STATE.forceBoard);
        SL_DEBUG_STATE.forceMode = '';
        SL_DEBUG_STATE.forceBoard = '';
      } else if (SL_DEBUG_STATE.forceBoard) {
        a = startArgs('puzzle', SL_DEBUG_STATE.forceBoard);
        SL_DEBUG_STATE.forceBoard = '';
      }
      this.mode = identity(a.mode || 'marathon').id;
      this.puzzleIndex = clamp(a.puzzleIndex | 0, 0, Math.max(0, PUZZLES.length - 1));
      // The requested rival tier is clamped to what the profile has earned, so
      // a stale arg or a hand-set switch can never hand out an unearned bout.
      this.tierIndex = clamp(a.tier == null ? (profile.rivalTier | 0) : (a.tier | 0),
        0, highestRivalTier());
      this.identity = identity(this.mode);
    },

    restartArgs: function () {
      return { mode: this.mode, puzzleIndex: this.puzzleIndex, tier: this.tierIndex };
    },

    // ---------------------------------------------------------- lifecycle
    create: function () {
      var self = this;
      Game.play = this;
      SL_DEBUG_STATE.scene = 'play';

      this.buildSim();
      this.buildView();
      this.bindInput();
      this.layout();
      this.scale.on('resize', this.layout, this);

      showControls(true);
      buildControls().handler = function (id, down) { self.onControl(id, down); };

      playMusic(this.identity.music || 'music_board', 700);

      this.events.once('shutdown', function () {
        self.scale.off('resize', self.layout, self);
        self.unbindInput();
        if (controls) controls.handler = null;
        // The rival board's canvas texture is owned by this scene instance,
        // so it is released with it rather than leaking across restarts.
        if (self.rivalTexKey && self.textures.exists(self.rivalTexKey)) {
          self.textures.remove(self.rivalTexKey);
        }
        self.rivalTexKey = '';
        self.rivalTex = null;
        if (Game.play === self) Game.play = null;
      });
    },

    // =================================================================== sim
    buildSim: function () {
      var r, c;
      this.grid = [];
      for (r = 0; r < ROWS; r++) {
        var row = [];
        for (c = 0; c < COLS; c++) row.push(0);
        this.grid.push(row);
      }
      this.bag = [];
      this.queue = [];
      this.finiteQueue = false;
      this.hold = '';
      this.holdMax = 1;
      this.holdUsed = 0;
      this.holdLocked = false;
      this.piece = { kind: 'O', rot: 0, x: 4, y: 0, alive: false };
      this.score = 0;
      this.lines = 0;
      this.level = 1;
      this.combo = 0;
      this.bestCombo = 0;
      this.b2b = 0;
      this.goal = 0;
      this.cleared = 0;
      this.simTime = 0;
      this.acc = 0;
      this.gravAcc = 0;
      this.lockTimer = 0;
      this.lockResets = 0;
      this.grounded = false;
      this.softHeld = false;
      this.dasDir = 0;
      this.dasTimer = 0;
      this.actions = [];
      this.clearRows = [];
      this.clearT = 0;
      this.collapsePivot = -1;
      this.collapseShift = 0;
      this.collapseOrigins = [];
      this.result = '';
      this.medal = '';
      this.hazardCount = 0;
      this.phase = 'play';
      this.pickups = { wild: 0, bomb: 0 };
      this.puzzle = null;
      this.pieceCount = 0;
      this.rescueUsed = 0;
      this.masterBagSerial = 0;
      // ---- round 2 sim state ----
      this.lastRotate = false;      // was the last successful action a rotation
      this.lastKick = 0;            // which SRS kick offset was taken
      this.spin = null;             // { full, mini } for the piece being locked
      this.spinCount = 0;
      this.quadCount = 0;
      this.perfectCount = 0;
      this.pendingGarbage = 0;      // rows queued against the player
      this.garbageSeen = 0;
      this.timeLeft = 0;
      this.ultraRamp = 0;
      this.dangerGrade = 0;         // 0 calm, 1 warn, 2 critical
      this.dangerTick = 0;
      this.stackTop = 0;
      this.rival = null;
      this.rivalCfg = rivalTier(this.tierIndex);
      this.gestures = new Map();
      this.keyPrev = { left: false, right: false, down: false, rotate: false,
        ccw: false, hold: false, drop: false, enter: false, escape: false };
      this.gamepadPrev = { left: false, right: false, down: false, rotate: false,
        hold: false, drop: false };

      if (this.mode === 'puzzle') {
        this.puzzle = puzzleAt(this.puzzleIndex);
        if (this.puzzle) {
          this.paintRows(this.puzzle.rows);
          this.queue = this.puzzle.queue.slice();
          this.finiteQueue = true;
          this.goal = this.puzzle.goal || 1;
          this.holdMax = this.puzzle.holds || 1;
          this.level = 3;
        }
      } else if (this.mode === 'master') {
        this.paintRows(MASTER.rows);
        this.level = MASTER.level || 10;
        this.holdMax = MASTER.holds || 1;
        this.goal = this.hazardCount;
      } else if (this.mode === 'sprint') {
        this.goal = 40;
        this.level = 3;
      } else if (this.mode === 'ultra') {
        // Two minutes on a clock that runs DOWN, with gravity stepping up on
        // the ramp window rather than on your own line count.
        this.level = ULTRA.startLevel || 4;
        this.timeLeft = ULTRA.ms || 120000;
        this.goal = 0;
      } else if (this.mode === 'rival') {
        this.level = 4;
        this.goal = 0;
        this.buildRival();
      } else {
        this.goal = 0;
      }
      this.initialHazards = this.hazardCount;

      this.refillQueue();
      this.spawn(null, false);

      // Coach: an interactive first run on the five verbs. It is a thin strip
      // at the TOP of the board, never a blocking panel over the play area
      // (defect class 9).
      this.coachStep = !profile.tut ? 0 : -1;
      this.coachFade = 0;
      this.coachLife = this.coachStep >= 0 ? 3000 : 0;
      this.coachDone = false;
    },

    paintRows: function (rows) {
      if (!rows || !rows.length) return;
      var n = Math.min(rows.length, VIS_ROWS - 2);
      for (var i = 0; i < n; i++) {
        var gr = ROWS - n + i;
        var str = rows[rows.length - n + i] || '';
        for (var c = 0; c < COLS; c++) {
          var ch = str.charAt(c);
          if (ch === '#') this.grid[gr][c] = authoredCell(c, gr);
          else if (ch === 'H') { this.grid[gr][c] = CELL_HAZARD; this.hazardCount++; }
          else this.grid[gr][c] = 0;
        }
      }
    },

    // ============================================================ the rival
    // A second, complete simulation on the same rules, driven by SL_AI. It is
    // stepped inside the SAME fixed step as the player's board, so a throttled
    // device slows both boards equally and the duel stays fair.
    buildRival: function () {
      var r = {
        grid: [], bag: [], queue: [],
        piece: { kind: 'O', rot: 0, x: 4, y: 0, alive: false },
        pending: 0, lines: 0, sent: 0, combo: 0, b2b: 0,
        dead: false, actT: 0, target: null, dirty: true,
        flash: null, height: 0, thinkMs: 0
      };
      for (var y = 0; y < ROWS; y++) {
        var row = [];
        for (var x = 0; x < COLS; x++) row.push(0);
        r.grid.push(row);
      }
      this.rival = r;
      this.rivalRefill();
      this.rivalSpawn();
    },

    rivalRefill: function () {
      var r = this.rival;
      while (r.queue.length < 3) {
        if (!r.bag.length) {
          var keys = [];
          for (var i = 0; i < FAMILIES.length; i++) keys.push(FAMILIES[i].key);
          for (var j = keys.length - 1; j > 0; j--) {
            var k = Math.floor(Math.random() * (j + 1));
            var t = keys[j]; keys[j] = keys[k]; keys[k] = t;
          }
          r.bag = keys;
        }
        r.queue.push(r.bag.pop());
      }
    },

    rivalSpawn: function () {
      var r = this.rival;
      if (r.dead) return;
      if (r.pending > 0) {
        var n = Math.min(r.pending, GARBAGE.max || 8);
        r.pending -= n;
        if (this.applyGarbage(r.grid, n, Math.floor(Math.random() * COLS))) {
          this.rivalKO();
          return;
        }
        r.dirty = true;
      }
      this.rivalRefill();
      var kind = r.queue.shift();
      this.rivalRefill();
      var box = family(kind).box || 3;
      r.piece.kind = kind;
      r.piece.rot = 0;
      r.piece.x = Math.floor((COLS - box) / 2);
      r.piece.y = HIDDEN;
      r.piece.alive = true;
      if (hits(r.grid, kind, 0, r.piece.x, r.piece.y)) { this.rivalKO(); return; }
      // Plan the whole placement now, then spend real hand-time reaching it.
      var cfg = this.rivalCfg;
      var plan = (root_SL_AI() && ROT[kind])
        ? root_SL_AI().best(r.grid, ROT[kind], ROT[r.queue[0]] || null,
          { error: cfg.error, lookahead: cfg.look })
        : null;
      r.target = plan && plan.ok ? { x: plan.x, rot: plan.rot } : null;
      r.actT = 0;
    },

    rivalKO: function () {
      var r = this.rival;
      if (r.dead) return;
      r.dead = true;
      r.piece.alive = false;
      r.dirty = true;
      voice('rivalDown');
      this.win('RIVAL DOWN');
    },

    rivalStep: function (dt) {
      var r = this.rival;
      if (!r || r.dead || this.phase !== 'play') return;
      if (r.flash) {
        r.flash.t += dt;
        if (r.flash.t > 200) r.flash = null;
      }
      r.actT += dt;
      var step = Math.max(40, this.rivalCfg.stepMs || 200);
      var guard = 0;
      while (r.actT >= step && !r.dead && guard++ < 8) {
        r.actT -= step;
        this.rivalAct();
      }
      r.height = this.stackHeight(r.grid);
    },

    rivalAct: function () {
      var r = this.rival;
      if (!r.piece.alive) { this.rivalSpawn(); return; }
      var t = r.target;
      if (!t) { this.rivalLock(); return; }
      if (r.piece.rot !== t.rot) {
        if (!this.rivalRotate()) { this.rivalLock(); return; }
      } else if (r.piece.x !== t.x) {
        var dir = t.x > r.piece.x ? 1 : -1;
        if (hits(r.grid, r.piece.kind, r.piece.rot, r.piece.x + dir, r.piece.y)) {
          this.rivalLock();
          return;
        }
        r.piece.x += dir;
      } else {
        this.rivalLock();
        return;
      }
      // A rival hand that never falls looks like a cursor. One row of descent
      // per action reads as a player working the piece down.
      if (!hits(r.grid, r.piece.kind, r.piece.rot, r.piece.x, r.piece.y + 1)) r.piece.y++;
    },

    rivalRotate: function () {
      var r = this.rival;
      var from = ((r.piece.rot % 4) + 4) % 4;
      var to = ((from + 1) % 4 + 4) % 4;
      var kicks = kicksFor(r.piece.kind, from, to);
      for (var i = 0; i < kicks.length; i++) {
        var kx = kicks[i][0], ky = -kicks[i][1];
        if (!hits(r.grid, r.piece.kind, to, r.piece.x + kx, r.piece.y + ky)) {
          r.piece.rot = to;
          r.piece.x += kx;
          r.piece.y += ky;
          return true;
        }
      }
      return false;
    },

    rivalLock: function () {
      var r = this.rival;
      var p = r.piece;
      while (!hits(r.grid, p.kind, p.rot, p.x, p.y + 1)) p.y++;
      var m = shapeOf(p.kind, p.rot);
      var y, x;
      for (y = 0; y < m.length; y++) {
        for (x = 0; x < m[y].length; x++) {
          if (!m[y][x]) continue;
          var gy = p.y + y, gx = p.x + x;
          if (gy < 0) { this.rivalKO(); return; }
          r.grid[gy][gx] = cellForKind(p.kind);
        }
      }
      p.alive = false;
      r.dirty = true;
      voice('rivalLock');

      var full = [];
      for (var rr = 0; rr < ROWS; rr++) {
        var done = true;
        for (var c = 0; c < COLS; c++) if (!r.grid[rr][c]) { done = false; break; }
        if (done) full.push(rr);
      }
      if (!full.length) { r.combo = 0; this.rivalSpawn(); return; }
      r.flash = { rows: full.slice(), t: 0 };
      for (var k = full.length - 1; k >= 0; k--) r.grid.splice(full[k], 1);
      while (r.grid.length < ROWS) {
        var blank = [];
        for (var c2 = 0; c2 < COLS; c2++) blank.push(0);
        r.grid.unshift(blank);
      }
      r.lines += full.length;
      r.combo++;
      var quad = full.length >= 4;
      var b2bActive = quad && r.b2b > 0;
      if (quad) r.b2b++; else r.b2b = 0;
      var send = tableAt(GARBAGE.lines, full.length, 0) +
        (b2bActive ? (GARBAGE.b2b || 1) : 0) +
        tableAt(GARBAGE.combo, r.combo - 1, 5);
      send = Math.round(send * (this.rivalCfg.garbage || 1));
      r.sent += send;
      voice('rivalClear');
      // Outgoing rows cancel the sender's own incoming queue first, exactly as
      // they do for the player. Only the surplus crosses over.
      var cancel = Math.min(send, r.pending);
      r.pending -= cancel;
      this.pendingGarbage += send - cancel;
      this.rivalSpawn();
    },

    refillQueue: function () {
      if (this.finiteQueue) return;
      while (this.queue.length < 5) {
        if (!this.bag.length) {
          var keys = [];
          for (var i = 0; i < FAMILIES.length; i++) keys.push(FAMILIES[i].key);
          for (var j = keys.length - 1; j > 0; j--) {
            var k = Math.floor(Math.random() * (j + 1));
            var t = keys[j]; keys[j] = keys[k]; keys[k] = t;
          }
          this.bag = keys;
          // Master Clear is generous too: assistance is deterministic, so a
          // bad random roll can never remove the intended wildcard cadence.
          if (this.mode === 'master' && (this.masterBagSerial++ % 2) === 1) {
            this.bag.splice(Math.floor(Math.random() * this.bag.length), 0, 'W');
          }
        }
        this.queue.push(this.bag.pop());
      }
    },

    spawn: function (kind, preserveHold) {
      // Buried rows land BEFORE the next piece exists, so the player always
      // sees the new floor under the piece they are about to place.
      if (kind == null && !preserveHold) {
        this.takeGarbage();
        if (this.phase !== 'play') return;
      }
      this.lastRotate = false;
      this.lastKick = 0;
      this.spin = null;
      if (kind == null) {
        if (!this.queue.length) {
          if (this.finiteQueue) {
            // A finite hand is exhausted. The parked piece is still playable,
            // so it comes out of the hold slot before a deterministic rescue
            // wildcard keeps a generous Puzzle board from becoming a dead end.
            if (this.hold) { kind = this.hold; this.hold = ''; }
            else if (this.mode === 'puzzle' && this.rescueUsed < Math.max(1, this.goal)) {
              kind = 'W';
              this.rescueUsed++;
            } else { this.fail('OUT OF PIECES'); return; }
          } else {
            this.refillQueue();
          }
        }
        if (kind == null) {
          kind = this.queue.shift();
          this.refillQueue();
        }
      }
      var box = (kind === 'W' || kind === 'B') ? 1 : family(kind).box || 3;
      this.piece.kind = kind;
      this.piece.rot = 0;
      this.piece.x = Math.floor((COLS - box) / 2);
      // Spawn on the first VISIBLE row. The two buffer rows above stay free
      // for wall kicks, and nothing the player controls is ever drawn outside
      // the board frame.
      this.piece.y = HIDDEN;
      this.piece.alive = true;
      this.gravAcc = 0;
      this.lockTimer = 0;
      this.lockResets = 0;
      this.grounded = false;
      if (!preserveHold) {
        this.holdLocked = false;
        this.holdUsed = 0;
      }
      this.pieceCount++;
      if (kind === 'W') this.pickups.wild++;
      if (kind === 'B') this.pickups.bomb++;
      if (kind === 'W' || kind === 'B') sfx('sfx_pickup', { volume: 0.7 });
      if (this.collides(this.piece.kind, this.piece.rot, this.piece.x, this.piece.y)) {
        this.fail('STACK FULL');
      }
    },

    collides: function (kind, rot, px, py) {
      return hits(this.grid, kind, rot, px, py);
    },

    // ------------------------------------------------------------- garbage
    // A buried row is a full row of shell blocks with one open column. Rows
    // push the stack UP; anything forced above the board tops the owner out.
    applyGarbage: function (grid, n, hole) {
      var pushed = false;
      for (var i = 0; i < n; i++) {
        var top = grid.shift();
        for (var c = 0; c < COLS; c++) if (top[c]) pushed = true;
        var row = [];
        for (var x = 0; x < COLS; x++) row.push(x === hole ? 0 : CELL_GARBAGE);
        grid.push(row);
      }
      return pushed;
    },

    takeGarbage: function () {
      if (this.mode !== 'rival' || this.pendingGarbage <= 0) return;
      var n = Math.min(this.pendingGarbage, GARBAGE.max || 8);
      this.pendingGarbage -= n;
      var hole = Math.floor(Math.random() * COLS);
      var topped = this.applyGarbage(this.grid, n, hole);
      this.garbageSeen += n;
      this.garbageFx = { rows: n, t: 0 };
      voice('garbageIn');
      if (motionOn()) kit.juice.shake(3 + n, 180);
      if (topped) this.fail('BURIED');
    },

    // -------------------------------------------------------- spin reading
    // Standard three corner rule. A T that was rotated into a seat with three
    // of its box corners occupied is a spin; if only one FRONT corner is
    // buried it is the reduced mini award, unless the placement needed the
    // last kick in the table, which is the classic exception.
    readSpin: function () {
      if (this.piece.kind !== 'T' || !this.lastRotate) return null;
      var px = this.piece.x, py = this.piece.y;
      var self = this;
      function filled(cx, cy) {
        if (cx < 0 || cx >= COLS || cy >= ROWS) return true;
        if (cy < 0) return false;
        return !!self.grid[cy][cx];
      }
      var corners = [[0, 0], [2, 0], [0, 2], [2, 2]];
      var count = 0;
      for (var i = 0; i < corners.length; i++) {
        if (filled(px + corners[i][0], py + corners[i][1])) count++;
      }
      if (count < 3) return null;
      var rot = ((this.piece.rot % 4) + 4) % 4;
      var frontSets = [[[0, 0], [2, 0]], [[2, 0], [2, 2]], [[0, 2], [2, 2]], [[0, 0], [0, 2]]];
      var front = frontSets[rot];
      var frontCount = 0;
      for (var f = 0; f < front.length; f++) {
        if (filled(px + front[f][0], py + front[f][1])) frontCount++;
      }
      var full = frontCount >= 2 || this.lastKick >= 4;
      return { full: full, mini: !full };
    },

    // Board is completely empty after a clear: the rarest beat in the game.
    isPerfect: function () {
      for (var r = 0; r < ROWS; r++) {
        for (var c = 0; c < COLS; c++) if (this.grid[r][c]) return false;
      }
      return true;
    },

    // Highest occupied row, expressed as rows above the floor. Drives the
    // danger grade and the rival's own pressure read.
    stackHeight: function (grid) {
      for (var r = 0; r < ROWS; r++) {
        for (var c = 0; c < COLS; c++) if (grid[r][c]) return ROWS - r;
      }
      return 0;
    },

    ghostY: function () {
      var y = this.piece.y;
      while (!this.collides(this.piece.kind, this.piece.rot, this.piece.x, y + 1)) y++;
      return y;
    },

    tryMove: function (dx) {
      if (this.phase !== 'play' || !this.piece.alive) return false;
      if (this.collides(this.piece.kind, this.piece.rot, this.piece.x + dx, this.piece.y)) {
        this.setPlayerState('invalid', 140);
        return false;
      }
      this.piece.x += dx;
      this.lastRotate = false;   // a shift cancels a pending spin read
      this.touchLock();
      this.setPlayerState('resolve', 130);
      sfx('sfx_move', { volume: 0.45 });
      this.coachHit('shift');
      return true;
    },

    tryRotate: function (dir) {
      if (this.phase !== 'play' || !this.piece.alive) return false;
      var from = ((this.piece.rot % 4) + 4) % 4;
      var to = ((from + dir) % 4 + 4) % 4;
      var kicks = kicksFor(this.piece.kind, from, to);
      for (var i = 0; i < kicks.length; i++) {
        var kx = kicks[i][0];
        var ky = -kicks[i][1]; // SRS y is up, the board runs y down
        if (!this.collides(this.piece.kind, to, this.piece.x + kx, this.piece.y + ky)) {
          this.piece.rot = to;
          this.piece.x += kx;
          this.piece.y += ky;
          this.lastRotate = true;
          this.lastKick = i;
          this.touchLock();
          this.kickFx = i > 0 ? 1 : 0;
          sfx('sfx_rotate', { volume: 0.55 });
          this.coachHit('rotate');
          return true;
        }
      }
      this.setPlayerState('invalid', 160);
      sfx('sfx_deny', { volume: 0.35 });
      return false;
    },

    touchLock: function () {
      if (this.grounded && this.lockResets < LOCK.resets) {
        this.lockResets++;
        this.lockTimer = 0;
      }
    },

    tryHold: function () {
      if (this.phase !== 'play' || !this.piece.alive) return;
      if (this.holdUsed >= this.holdMax) {
        this.holdLocked = true;
        this.setPlayerState('invalid', 180);
        sfx('sfx_deny', { volume: 0.5 });
        this.flashLockout = 1;
        return;
      }
      var cur = this.piece.kind;
      this.holdUsed++;
      this.setPlayerState('resolve', 150);
      sfx('sfx_hold');
      this.coachHit('hold');
      if (!this.hold) {
        this.hold = cur;
        this.spawn(null, true);
      } else {
        var swap = this.hold;
        this.hold = cur;
        this.spawn(swap, true);
      }
      this.holdLocked = this.holdUsed >= this.holdMax;
    },

    hardDrop: function () {
      if (this.phase !== 'play' || !this.piece.alive) return;
      var dist = 0;
      while (!this.collides(this.piece.kind, this.piece.rot, this.piece.x, this.piece.y + 1)) {
        this.piece.y++;
        dist++;
      }
      this.score += dist * 2;
      if (dist > 0) this.lastRotate = false;
      this.dropDist = dist;
      this.dropFx = { x: this.piece.x, kind: this.piece.kind, dist: dist,
        fromY: this.piece.y - dist, toY: this.piece.y, t: 0 };
      this.setPlayerState('resolve', 150);
      sfx('sfx_hard');
      this.coachHit('drop');
      this.lockPiece(true);
    },

    softDrop: function () {
      if (this.phase !== 'play' || !this.piece.alive) return;
      if (!this.collides(this.piece.kind, this.piece.rot, this.piece.x, this.piece.y + 1)) {
        this.piece.y++;
        this.score++;
        this.lastRotate = false;
        this.gravAcc = 0;
        sfx('sfx_soft', { volume: 0.3 });
      }
    },

    lockPiece: function (hard) {
      var m = shapeOf(this.piece.kind, this.piece.rot);
      var kind = this.piece.kind;
      var cx = this.piece.x, cy = this.piece.y;
      var y, x;
      // The spin is read from the board the piece is landing ON, before the
      // piece itself is stamped into it.
      this.spin = this.readSpin();

      if (kind === 'B') {
        // Bomb pickup: a 3x3 bite out of the stack. No line needed.
        var removed = 0;
        for (y = cy - 1; y <= cy + 1; y++) {
          for (x = cx - 1; x <= cx + 1; x++) {
            if (y < 0 || y >= ROWS || x < 0 || x >= COLS) continue;
            if (this.grid[y][x]) {
              if (this.grid[y][x] === CELL_HAZARD) this.hazardCount--;
              this.grid[y][x] = 0;
              removed++;
            }
          }
        }
        this.bombFx = { x: cx, y: cy, t: 0 };
        sfx('sfx_bomb');
        this.score += removed * 20;
        this.piece.alive = false;
        this.afterLock();
        return;
      }

      for (y = 0; y < m.length; y++) {
        for (x = 0; x < m[y].length; x++) {
          if (!m[y][x]) continue;
          var gy = cy + y, gx = cx + x;
          if (gy < 0) { this.fail('STACK FULL'); return; }
          this.grid[gy][gx] = cellForKind(kind);
        }
      }

      if (kind === 'W') {
        // Wildcard: fills its own row outright. Generous by design.
        var wr = cy;
        if (wr >= 0 && wr < ROWS) {
          for (x = 0; x < COLS; x++) if (!this.grid[wr][x]) this.grid[wr][x] = CELL_WILD;
        }
      }

      this.piece.alive = false;
      sfx('sfx_lock', { volume: hard ? 1 : 0.75, rate: hard ? 1 : 1.08 });
      this.lockFx = { x: cx, y: cy, t: 0, kind: kind };
      // View-side record of exactly which cells just landed, so the settle pop
      // is applied to those cells and nothing else.
      this.lockCells.length = 0;
      for (y = 0; y < m.length; y++) {
        for (x = 0; x < m[y].length; x++) {
          if (!m[y][x]) continue;
          this.lockCells.push((cy + y) * COLS + (cx + x));
        }
      }
      this.afterLock();
    },

    afterLock: function () {
      var full = [];
      for (var r = 0; r < ROWS; r++) {
        var done = true;
        for (var c = 0; c < COLS; c++) if (!this.grid[r][c]) { done = false; break; }
        if (done) full.push(r);
      }
      if (full.length) {
        this.actions.length = 0;
        this.clearRows = full;
        this.clearT = 0;
        this.phase = 'clearing';
        return;
      }
      // A spin that buries itself without completing a row still pays, and
      // still keeps the back to back chain alive.
      if (this.spin) {
        var award = tableAt(this.spin.full ? SPINS.full : SPINS.mini, 0, 100) * this.level;
        this.score = Math.min(MAX_SCORE, this.score + award);
        this.spinCount++;
        this.banner(this.spin.full ? 'T-SPIN' : 'T-SPIN MINI', 0x9a7cf3);
        voice(this.spin.full ? 'tspin' : 'tspinMini');
        this.celebrate(2, null, 0x9a7cf3);
      }
      this.combo = 0;
      this.checkGoal();
      if (this.phase === 'play') this.spawn();
    },

    resolveClears: function () {
      var rows = this.clearRows;
      var n = rows.length;
      var r, c;
      this.collapseOrigins.length = ROWS;
      for (var finalRow = 0; finalRow < ROWS; finalRow++) {
        this.collapseOrigins[finalRow] = -1;
        var finalIndex = 0;
        for (var oldRow = 0; oldRow < ROWS; oldRow++) {
          if (rows.indexOf(oldRow) >= 0) continue;
          if (finalIndex === finalRow) {
            this.collapseOrigins[finalRow] = oldRow;
            break;
          }
          finalIndex++;
        }
      }
      // hazards leaving the board are the Master Clear win condition
      for (var i = 0; i < n; i++) {
        for (c = 0; c < COLS; c++) if (this.grid[rows[i]][c] === CELL_HAZARD) this.hazardCount--;
      }
      for (r = n - 1; r >= 0; r--) this.grid.splice(rows[r], 1);
      while (this.grid.length < ROWS) {
        var blank = [];
        for (c = 0; c < COLS; c++) blank.push(0);
        this.grid.unshift(blank);
      }

      this.combo++;
      if (this.combo > this.bestCombo) this.bestCombo = this.combo;
      var quad = n >= 4;
      var spin = this.spin;
      // A "special" clear is the pair that carries the back to back chain: a
      // QUAD, or a spin that finished at least one row.
      var special = quad || !!spin;
      var base = spin
        ? tableAt(spin.full ? SPINS.full : SPINS.mini, n, 800) * this.level
        : SCORE_BASE[Math.min(n, 4)] * this.level;
      var b2bActive = special && this.b2b > 0;
      if (b2bActive) base = Math.round(base * 1.5);
      if (special) this.b2b++; else this.b2b = 0;
      var comboBonus = this.combo > 1 ? 50 * (this.combo - 1) * this.level : 0;
      this.score = Math.min(MAX_SCORE, this.score + base + comboBonus);
      this.lines += n;
      this.cleared += n;
      if (quad) this.quadCount++;
      if (spin) this.spinCount++;
      var perfect = this.isPerfect();
      if (perfect) {
        this.perfectCount++;
        this.score = Math.min(MAX_SCORE,
          this.score + tableAt(SPINS.perfect, n, 3500) * this.level);
      }
      this.lastClear = { n: n, quad: quad, combo: this.combo, b2b: this.b2b,
        spin: !!spin, perfect: perfect };

      sfx(quad ? 'sfx_quad' : ('sfx_clear' + Math.min(3, n)),
        { rate: 1 + Math.min(4, this.combo - 1) * 0.05 });
      if (spin) voice(spin.full ? 'tspin' : 'tspinMini');
      if (this.combo >= 2) sfx('sfx_combo', { volume: Math.min(1, 0.5 + this.combo * 0.1) });
      if (perfect) voice('perfect');
      // The last few Sprint lines get a countdown tick over the clear cue.
      if (this.mode === 'sprint' && this.lines >= 36) sfx('sfx_tick', { volume: 0.8 });
      this.coachHit('clear');

      // Escalation ladder, one tier per beat and never two at once.
      var rowY = this.layoutBox
        ? this.layoutBox.y + (rows[rows.length - 1] - HIDDEN) * this.layoutBox.cell
        : null;
      var tier = perfect ? 4 : (quad || spin ? 3 : (this.combo >= 2 || n >= 2 ? 2 : 1));
      if (b2bActive && tier === 3) tier = 4;
      this.celebrate(tier, rowY, spin ? 0x9a7cf3 : this.identity.accent);

      // The chip carries ONE reward name. Order of precedence keeps the
      // rarest read on screen rather than the noisiest.
      var chip = '';
      var chipColor = this.identity.accent;
      if (perfect) { chip = 'PERFECT CLEAR'; chipColor = 0xf7fbff; }
      else if (spin) {
        chip = (b2bActive ? 'B2B ' : '') + (spin.full ? 'T-SPIN' : 'T-SPIN MINI') +
          (n > 1 ? ' x' + n : '');
        chipColor = 0x9a7cf3;
      } else if (quad) chip = b2bActive ? 'B2B QUAD' : 'QUAD';
      else if (this.combo >= 3) { chip = 'COMBO x' + this.combo; chipColor = 0x8fe6ff; }
      this.banner(chip, chipColor);

      // Garbage exchange. Outgoing rows cancel the player's own incoming queue
      // before any surplus crosses to the rival.
      if (this.mode === 'rival' && this.rival && !this.rival.dead) {
        var send = spin
          ? tableAt(spin.full ? GARBAGE.tspin : GARBAGE.tspinMini, n, 0)
          : tableAt(GARBAGE.lines, n, 0);
        if (b2bActive) send += GARBAGE.b2b || 1;
        send += tableAt(GARBAGE.combo, this.combo - 1, 5);
        if (perfect) send += GARBAGE.perfect || 10;
        if (send > 0) {
          var cancel = Math.min(send, this.pendingGarbage);
          this.pendingGarbage -= cancel;
          this.rival.pending += send - cancel;
          if (send - cancel > 0) voice('garbageOut');
        }
      }

      if (this.mode === 'marathon') {
        var nl = Math.min(GRAVITY.length, Math.floor(this.lines / 10) + 1);
        if (nl > this.level) {
          this.level = nl;
          sfx('sfx_level');
          this.banner('LEVEL ' + this.level, this.identity.accent);
          this.rewardBurst();
          if (this.level >= 8) playMusic('music_rush', 900);
        }
      }
      // Rival gravity ramps on YOUR clear rate, so a fast player also raises
      // the speed they have to handle the incoming rows at.
      if (this.mode === 'rival') {
        this.level = Math.min(12, 4 + Math.floor(this.lines / 12));
      }
      this.spin = null;
      this.checkGoal();
    },

    checkGoal: function () {
      if (this.phase === 'over' || this.phase === 'win') return;
      if (this.mode === 'sprint' && this.lines >= 40) return this.win('SPRINT CLEAR');
      if (this.mode === 'puzzle' && this.cleared >= this.goal) return this.win('BOARD CLEAR');
      if (this.mode === 'master' && this.hazardCount <= 0) return this.win('MASTER CLEAR');
    },

    // Ending mid-collapse would freeze the row-settle offset on screen, so the
    // clear animation state is always retired with the run.
    settleBoard: function () {
      this.clearRows = [];
      this.clearT = 0;
      this.collapsePivot = -1;
      this.collapseShift = 0;
      this.collapseOrigins.length = 0;
      this.clearColorsT = 0;
    },

    win: function (msg) {
      if (this.phase === 'win' || this.phase === 'over') return;
      this.phase = 'win';
      this.result = msg;
      this.piece.alive = false;
      this.settleBoard();
      sfx('sfx_goal');
      this.rewardBurst();
      this.commitProgress(true);
      this.showResult();
    },

    fail: function (msg) {
      if (this.phase === 'win' || this.phase === 'over') return;
      this.phase = 'over';
      this.result = msg;
      this.piece.alive = false;
      this.settleBoard();
      sfx('sfx_over');
      playMusic('music_board', 900);
      this.commitProgress(false);
      this.showResult();
    },

    commitProgress: function (won) {
      var changed = false;
      if (this.mode === 'marathon') {
        if (this.score > (profile.bestScore || 0)) { profile.bestScore = this.score; changed = true; }
        if (this.lines > (profile.bestLines || 0)) { profile.bestLines = this.lines; changed = true; }
        var list = medalList('marathon');
        for (var i = 0; i < list.length; i++) {
          if (this.level >= list[i].level) {
            if (rankOf('marathon', list[i].key) > rankOf('marathon', profile.marathonMedal)) {
              profile.marathonMedal = list[i].key; changed = true;
            }
            this.medal = list[i].key;
          }
        }
      } else if (this.mode === 'sprint' && won) {
        if (!profile.bestSprint || this.simTime < profile.bestSprint) {
          profile.bestSprint = Math.round(this.simTime); changed = true;
        }
        var sl = medalList('sprint');
        for (var j = 0; j < sl.length; j++) {
          if (this.simTime <= sl[j].ms) {
            if (rankOf('sprint', sl[j].key) > rankOf('sprint', profile.sprintMedal)) {
              profile.sprintMedal = sl[j].key; changed = true;
            }
            this.medal = sl[j].key;
          }
        }
      } else if (this.mode === 'puzzle' && won && this.puzzle) {
        if (profile.puzzleDone.indexOf(this.puzzle.id) < 0) {
          profile.puzzleDone.push(this.puzzle.id);
          profile.puzzleBest = Math.max(profile.puzzleBest || 0, this.puzzleIndex + 1);
          changed = true;
        }
      } else if (this.mode === 'ultra') {
        if (this.score > (profile.bestUltra || 0)) { profile.bestUltra = this.score; changed = true; }
        var ul = medalList('ultra');
        for (var u = 0; u < ul.length; u++) {
          if (this.score >= ul[u].score) {
            if (rankOf('ultra', ul[u].key) > rankOf('ultra', profile.ultraMedal)) {
              profile.ultraMedal = ul[u].key; changed = true;
            }
            this.medal = ul[u].key;
          }
        }
        if (pushRecord('ultra', this.score)) changed = true;
        changed = true;
      } else if (this.mode === 'rival') {
        if (won) {
          profile.rivalWins = (profile.rivalWins || 0) + 1;
          profile.rivalStreak = (profile.rivalStreak || 0) + 1;
          var rl = medalList('rival');
          for (var v = 0; v < rl.length; v++) {
            if (this.tierIndex >= rl[v].tier &&
                rankOf('rival', rl[v].key) > rankOf('rival', profile.rivalMedal)) {
              profile.rivalMedal = rl[v].key;
            }
            if (this.tierIndex >= rl[v].tier) this.medal = rl[v].key;
          }
          pushRecord('rival', this.simTime);
          // A win that earns a new tier promotes the selection immediately, so
          // the next bout is the harder one unless the player steps back down.
          profile.rivalTier = Math.min(highestRivalTier(), profile.rivalTier + 1);
        } else {
          profile.rivalStreak = 0;
        }
        changed = true;
      } else if (this.mode === 'master' && won) {
        if (!profile.masterDone) { profile.masterDone = true; changed = true; }
      }

      if (this.mode === 'marathon' && this.score > 0) { pushRecord('marathon', this.score); changed = true; }
      if (this.mode === 'sprint' && won) { pushRecord('sprint', this.simTime); changed = true; }

      // Career counters are cumulative across every mode, and they are what
      // the records page reports back.
      var c = profile.career || (profile.career = emptyCareer());
      if (this.spinCount || this.quadCount || this.perfectCount || this.lines || this.bestCombo) {
        c.tspins = Math.min(MAX_SCORE, (c.tspins || 0) + this.spinCount);
        c.quads = Math.min(MAX_SCORE, (c.quads || 0) + this.quadCount);
        c.perfects = Math.min(MAX_SCORE, (c.perfects || 0) + this.perfectCount);
        c.lines = Math.min(MAX_SCORE, (c.lines || 0) + this.lines);
        c.bestCombo = Math.max(c.bestCombo || 0, this.bestCombo);
        changed = true;
      }
      c.runs = Math.min(MAX_SCORE, (c.runs || 0) + 1);

      if (!profile.tut && this.coachDone) { profile.tut = true; changed = true; }
      if (changed) persist();
    },

    // ---------------------------------------------------------- stepping
    step: function (dt) {
      // Clocks that must include the clear animation: the Sprint stopwatch,
      // the Ultra countdown and the rival's own hand all keep running while a
      // clear resolves, because the player is not free during it either.
      if (this.mode === 'sprint' && this.phase === 'clearing') this.simTime += dt;
      if (this.mode === 'ultra' && this.phase === 'play') this.tickUltra(dt);
      else if (this.mode === 'ultra' && this.phase === 'clearing') this.tickUltra(dt);
      if (this.mode === 'rival') this.rivalStep(dt);
      if (this.phase !== 'play' && this.phase !== 'clearing') { this.dangerGrade = 0; }
      else this.tickDanger(dt);
      if (this.phase === 'clearing') {
        this.actions.length = 0;
        this.clearT += dt;
        if (this.collapsePivot < 0 && this.clearT >= CLEAR_FLASH + CLEAR_SHATTER) {
          this.collapsePivot = this.clearRows[this.clearRows.length - 1];
          this.collapseShift = this.clearRows.length;
          this.emitShatter();
          this.resolveClears();
        }
        if (this.clearT >= CLEAR_TOTAL) {
          this.clearRows = [];
          this.collapsePivot = -1;
          this.collapseShift = 0;
          this.clearT = 0;
          if (this.phase === 'clearing') {
            this.phase = 'play';
            this.spawn();
          }
        }
        return;
      }
      if (this.phase !== 'play') return;

      this.simTime += dt;

      // horizontal auto-shift
      if (this.dasDir !== 0) {
        this.dasTimer += dt;
        if (this.dasTimer >= this.dasNext) {
          this.dasNext = 55;
          this.dasTimer = 0;
          this.tryMove(this.dasDir);
        }
      }

      // queued discrete actions, consumed inside the step so input is
      // deterministic relative to gravity
      while (this.actions.length) {
        var a = this.actions.shift();
        if (a === 'cw') this.tryRotate(1);
        else if (a === 'ccw') this.tryRotate(-1);
        else if (a === 'hold') this.tryHold();
        else if (a === 'drop') this.hardDrop();
        if (this.phase !== 'play') return;
      }

      if (!this.piece.alive) return;

      var g = gravityMs(this.level);
      this.gravAcc += dt * (this.softHeld ? SOFT_MULT : 1);
      while (this.gravAcc >= g) {
        this.gravAcc -= g;
        if (!this.collides(this.piece.kind, this.piece.rot, this.piece.x, this.piece.y + 1)) {
          this.piece.y++;
          this.lastRotate = false;
          if (this.softHeld) this.score++;
          this.lockTimer = 0;
          this.lockResets = 0;
        } else break;
      }

      var landed = this.collides(this.piece.kind, this.piece.rot, this.piece.x, this.piece.y + 1);
      if (landed) {
        if (!this.grounded) { this.grounded = true; this.lockTimer = 0; }
        this.lockTimer += dt;
        if (this.lockTimer >= LOCK.graceMs) this.lockPiece(false);
      } else {
        this.grounded = false;
        this.lockTimer = 0;
      }
    },

    // Ultra: the clock is the pressure. Gravity climbs on the ramp window no
    // matter how the player is doing, and the run ends when the clock does.
    tickUltra: function (dt) {
      this.timeLeft -= dt;
      var elapsed = (ULTRA.ms || 120000) - this.timeLeft;
      var lvl = Math.min(ULTRA.maxLevel || 16,
        (ULTRA.startLevel || 4) + Math.floor(elapsed / (ULTRA.rampMs || 18000)));
      if (lvl > this.level) {
        this.level = lvl;
        sfx('sfx_level', { rate: 1.12 });
        this.banner('LEVEL ' + this.level, this.identity.accent);
        this.ultraRamp = 1;
      }
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.win('TIME');
      }
    },

    // Danger grade. It is a colour and audio STATE, not a banner: the board
    // and its frame carry the warning so nothing new covers the playfield.
    tickDanger: function (dt) {
      var h = this.stackHeight(this.grid);
      this.stackTop = h;
      var grade = h >= (DANGER.crit || 16) ? 2 : (h >= (DANGER.warn || 13) ? 1 : 0);
      if (grade !== this.dangerGrade) {
        this.dangerGrade = grade;
        this.dangerTick = 0;
        if (grade === 2) voice('danger');
      }
      if (grade === 2) {
        this.dangerTick += dt;
        if (this.dangerTick >= (DANGER.tickMs || 900)) {
          this.dangerTick = 0;
          voice('danger');
        }
      }
    },

    queueAction: function (action) {
      if (this.phase !== 'play' || this.actions.length >= 8) return;
      this.actions.push(action);
    },

    // ------------------------------------------------------------- coach
    COACH: [
      { verb: 'shift', text: 'SHIFT  •  TAP LEFT / RIGHT' },
      { verb: 'rotate', text: 'ROTATE  •  TAP PIECE' },
      { verb: 'hold', text: 'HOLD  •  SWIPE UP' },
      { verb: 'drop', text: 'DROP  •  SWIPE DOWN' },
      { verb: 'clear', text: 'CLEAR  •  FILL A ROW' }
    ],
    coachHit: function (verb) {
      if (this.coachStep < 0 || this.coachStep >= this.COACH.length) return;
      if (this.COACH[this.coachStep].verb !== verb) return;
      this.coachStep++;
      this.coachFade = 1;
      this.coachLife = this.coachStep < this.COACH.length ? 3000 : 0;
      if (this.coachStep >= this.COACH.length) {
        this.coachDone = true;
        profile.tut = true;
        persist();
      }
    },

    // =================================================================== view
    buildView: function () {
      var i;
      this.world = this.add.container(0, 0).setDepth(10);
      this.playerG = this.add.graphics().setDepth(28);
      this.world.add(this.playerG);
      this.playerState = 'ready';
      this.playerStateT = 0;
      this.playerClock = 0;
      this.previewX = 0;
      this.previewValid = true;
      this.bg = this.add.image(0, 0, '__DEFAULT').setOrigin(0, 0).setDepth(0);
      // The evolving sky needs TWO quads: the outgoing tier stays on screen at
      // a falling alpha while the incoming tier fades up under it, so a level
      // change is a dissolve rather than a pop.
      this.bgNext = this.add.image(0, 0, '__DEFAULT').setOrigin(0, 0).setDepth(0.5)
        .setVisible(false);
      this.skyTier = 0;
      this.skyFade = 1;
      // A danger wash over the sky. One additive quad, tinted and alpha driven
      // by the danger grade; it never covers a cell because it sits at depth 1
      // under the board frame.
      this.dangerImg = this.add.image(0, 0, 'disc').setDepth(1.2)
        .setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
      // One soft glow behind the board so the frame reads as an object lit
      // from the playfield, not a rectangle pasted on a gradient.
      this.glow = this.add.image(0, 0, 'disc').setDepth(1)
        .setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.24);
      // Board frame + empty cell grid: one baked quad, not 200 live paths.
      this.boardImg = this.add.image(0, 0, '__DEFAULT').setOrigin(0, 0).setDepth(4);
      this.world.add([this.boardImg]);
      this.bakedKeys = [];

      // Preallocated sprite pools. Nothing is created during play.
      this.stackPool = [];
      for (i = 0; i < VIS_ROWS * COLS; i++) {
        this.stackPool.push(this.add.image(0, 0, 'atlas', 'blk_box').setVisible(false).setDepth(6));
      }
      this.flashPool = [];
      for (i = 0; i < COLS * 4; i++) {
        this.flashPool.push(this.add.image(0, 0, 'atlas', 'blk_lit')
          .setVisible(false).setDepth(8).setBlendMode(Phaser.BlendModes.ADD));
      }
      this.ghostPool = [];
      this.activePool = [];
      for (i = 0; i < 4; i++) {
        this.ghostPool.push(this.add.image(0, 0, 'atlas', 'blk_ghost').setVisible(false).setDepth(6.5));
        this.activePool.push(this.add.image(0, 0, 'atlas', 'blk_box').setVisible(false).setDepth(7));
      }
      // The rail lives at UI depth, ABOVE the rail panel graphics (depth 20).
      this.railPool = [];
      for (i = 0; i < 20; i++) {
        this.railPool.push(this.add.image(0, 0, 'atlas', 'blk_box').setVisible(false).setDepth(21));
      }
      this.world.add(this.stackPool);
      this.world.add(this.flashPool);
      this.world.add(this.ghostPool);
      this.world.add(this.activePool);

      // Rival board. It is repainted into ONE canvas texture on the frames its
      // grid actually changes (roughly once a second), so the second board
      // costs a single quad per frame instead of two hundred sprites.
      this.rivalImg = this.add.image(0, 0, '__DEFAULT').setOrigin(0, 0)
        .setDepth(22).setVisible(false);
      this.rivalPool = [];
      for (i = 0; i < 4; i++) {
        this.rivalPool.push(this.add.image(0, 0, 'atlas', 'blk_box')
          .setVisible(false).setDepth(23));
      }
      this.rivalG = this.add.graphics().setDepth(24);   // rival flash + KO veil
      this.rivalBakes = [];
      // Incoming garbage meter: a thin column against the board's left edge.
      this.garbageG = this.add.graphics().setDepth(20);
      // Combo rim: the board frame's own reaction. One stroked rounded rect,
      // redrawn only when the tier or its pulse changes.
      this.rimG = this.add.graphics().setDepth(5);
      this.comboTier = 0;
      this.comboPulse = 0;

      // View-side render records. Defect class 2: none of this lives on a sim
      // object, and the renderer is never handed a sim entity.
      this.cellView = [];
      for (i = 0; i < VIS_ROWS * COLS; i++) this.cellView.push({ v: 0, pop: 0 });
      this.lockCells = [];
      this.queueAnim = 0;
      this.holdAnim = 0;
      this.lastQueueHead = '';
      this.lastHoldKind = '';
      this.resultT = 0;
      this.resultScoreShown = 0;
      this.dropFx = null;
      this.garbageFx = null;

      // HUD card, rail panels and the mode chip are static per layout too.
      this.chromeImg = this.add.image(0, 0, '__DEFAULT').setOrigin(0, 0).setDepth(19);
      this.ringG = this.add.graphics().setDepth(20);   // sprint progress arc only
      this.coachG = this.add.graphics().setDepth(20);
      this.txt = {};
      this.txt.mode = this.text(0, 0, '', 14, CSS.dim, '750');
      this.txt.metricLabel = this.text(0, 0, '', 12, CSS.dim, '750');
      this.txt.metric = this.text(0, 0, '', 24, CSS.text, '800');
      this.txt.secondLabel = this.text(0, 0, '', 12, CSS.dim, '750');
      this.txt.second = this.text(0, 0, '', 16, CSS.dim, '750');
      this.txt.level = this.text(0, 0, '', 20, CSS.text, '800');
      this.txt.levelLabel = this.text(0, 0, '', 12, CSS.dim, '750');
      this.txt.holdLabel = this.text(0, 0, '↔', 16, CSS.dim, '800');
      this.txt.nextLabel = this.text(0, 0, '›', 18, CSS.dim, '800');
      this.txt.coach = this.text(0, 0, '', 14, CSS.text, '650');
      this.txt.pause = this.text(0, 0, '≡', 22, CSS.dim, '800');
      this.txt.rivalLabel = this.text(0, 0, '', 11, CSS.dim, '750').setVisible(false);

      this.lockoutIcon = this.add.image(0, 0, 'atlas', 'lockout')
        .setVisible(false).setDepth(21).setTint(0xff6a5c);

      // In-play events are a single queued edge chip. Run-boundary messaging
      // belongs to the result card, never to a live center banner.
      this.bannerG = this.add.graphics().setDepth(30);
      this.bannerT = this.text(0, 0, '', 14, CSS.text, '800').setDepth(31).setOrigin(0.5, 0.5);
      this.bannerLife = 0;
      this.bannerDur = 900;
      this.bannerColor = 0xffa724;
      this.bannerText = '';
      this.bannerQueue = [];

      // Row sweep beams (the first read of a clear) and reward rings. Both are
      // small fixed pools, hidden when dead, never allocated during play.
      this.beamPool = [];
      for (i = 0; i < 4; i++) {
        this.beamPool.push(this.add.image(0, 0, 'p_beam').setVisible(false)
          .setDepth(9).setBlendMode(Phaser.BlendModes.ADD));
      }
      this.world.add(this.beamPool);
      this.world.bringToTop(this.playerG);
      this.ringPool = [];
      for (i = 0; i < 3; i++) {
        this.ringPool.push({
          img: this.add.image(0, 0, 'p_ring').setVisible(false).setDepth(27)
            .setBlendMode(Phaser.BlendModes.ADD),
          t: 0, life: 0
        });
      }

      this.buildFx();
      this.buildResult();

      this.kickFx = 0;
      this.flashLockout = 0;
      this.lockFx = null;
      this.bombFx = null;
      this.dropDist = 0;
      this.lastClear = null;
      // View record of the shattering row's colours, cached before the sim
      // splices the grid. Never read from a sim array at emit time.
      this.clearColors = [];
      this.clearColorsT = 0;
    },

    text: function (x, y, str, size, color, weight) {
      return this.add.text(x, y, str, {
        fontFamily: FONT, fontSize: scaledPx(size) + 'px', fontStyle: weight || '600',
        color: color || CSS.text
      }).setDepth(21);
    },

    setPlayerState: function (state, duration) {
      if (!this.playerG) return;
      this.playerState = state;
      this.playerStateT = duration || 0;
      if (state === 'preview') this.previewX = this.piece.x;
    },

    updatePlayerState: function (dt) {
      this.playerClock += dt;
      if (this.playerStateT > 0) {
        this.playerStateT = Math.max(0, this.playerStateT - dt);
        if (this.playerStateT === 0) this.playerState = 'ready';
      }
    },

    paintPlayerState: function () {
      var lb = this.layoutBox;
      var g = this.playerG;
      if (!lb || !g) return;
      g.clear();
      if (!this.piece.alive || this.phase !== 'play') return;
      var m = shapeOf(this.piece.kind, this.piece.rot);
      var minX = COLS, maxX = -1, minY = ROWS, maxY = -1;
      for (var py = 0; py < m.length; py++) {
        for (var px = 0; px < m[py].length; px++) {
          if (!m[py][px]) continue;
          minX = Math.min(minX, this.piece.x + px);
          maxX = Math.max(maxX, this.piece.x + px);
          minY = Math.min(minY, this.piece.y + py);
          maxY = Math.max(maxY, this.piece.y + py);
        }
      }
      if (maxY < HIDDEN || minY >= ROWS) return;
      var cx = lb.x + ((minX + maxX + 1) * 0.5) * lb.cell;
      var cy = lb.y + ((Math.max(minY, HIDDEN) + maxY - HIDDEN + 1) * 0.5) * lb.cell;
      var radius = Math.max(lb.cell * 0.75, (maxX - minX + 1) * lb.cell * 0.5 + 5);
      var pulse = 1 + 0.035 * Math.sin(this.playerClock * 0.008);
      var color = this.playerState === 'invalid' ? 0xffa724 : this.identity.accent;

      // Landing affordance, drawn under the focus ring in EVERY state. Two
      // faint column guides run from the piece to its landing row and a bright
      // pad marks the seat, so a player always knows where the piece is going
      // without waiting for the ghost to be noticed.
      var gy0 = this.ghostY();
      if (gy0 !== this.piece.y) {
        var padTop = lb.y + (gy0 + (maxY - minY) + 1 - HIDDEN) * lb.cell;
        var lx = lb.x + minX * lb.cell;
        var rx = lb.x + (maxX + 1) * lb.cell;
        g.lineStyle(1, color, 0.22);
        g.lineBetween(lx + 1, cy, lx + 1, padTop);
        g.lineBetween(rx - 1, cy, rx - 1, padTop);
        g.lineStyle(3, color, 0.55 + 0.2 * Math.sin(this.playerClock * 0.006));
        g.lineBetween(lx + 2, padTop - 1, rx - 2, padTop - 1);
      }

      g.lineStyle(this.playerState === 'resolve' ? 3 : 2, color, 0.95);
      g.strokeCircle(cx, cy, radius * (this.playerState === 'resolve' ? 1.12 : pulse));
      if (this.playerState === 'preview') {
        var px0 = this.previewX == null ? this.piece.x : this.previewX;
        var legal = this.piece.alive && !this.collides(this.piece.kind, this.piece.rot, px0, this.piece.y);
        this.previewValid = legal;
        if (!legal) {
          g.lineStyle(2, 0xffa724, 0.95);
          g.lineBetween(cx - radius * 0.7, cy - radius * 0.7, cx + radius * 0.7, cy + radius * 0.7);
          g.lineBetween(cx + radius * 0.7, cy - radius * 0.7, cx - radius * 0.7, cy + radius * 0.7);
        } else {
          var gy = this.piece.y;
          while (!this.collides(this.piece.kind, this.piece.rot, px0, gy + 1)) gy++;
          var gyc = lb.y + (gy - HIDDEN + 0.5) * lb.cell;
          var targetCx = lb.x + (px0 + (m[0].length * 0.5)) * lb.cell;
          g.lineStyle(2, 0xf7fbff, 0.85);
          g.lineBetween(cx, cy + radius, targetCx, gyc - lb.cell * 0.45);
          g.fillStyle(0xf7fbff, 0.9);
          g.fillTriangle(targetCx, gyc - lb.cell * 0.15, targetCx - 5, gyc - lb.cell * 0.45,
            targetCx + 5, gyc - lb.cell * 0.45);
        }
      } else if (this.playerState === 'resolve') {
        g.lineStyle(2, 0xf7fbff, 0.9);
        g.lineBetween(cx - radius * 0.45, cy, cx + radius * 0.45, cy);
        g.lineBetween(cx, cy - radius * 0.45, cx, cy + radius * 0.45);
      }
    },

    // Three pooled particle systems, the lane floor: clear fragments,
    // movement/lock streaks, reward celebration. Nothing allocates per frame.
    buildFx: function () {
      this.fx = {};
      this.fx.shard = this.add.particles(0, 0, 'p_shard', {
        lifespan: 620, speed: { min: 60, max: 300 }, angle: { min: 200, max: 340 },
        gravityY: 900, scale: { start: 0.42, end: 0 }, rotate: { min: -220, max: 220 },
        alpha: { start: 1, end: 0 }, emitting: false, quantity: 1, maxAliveParticles: 16
      }).setDepth(24);
      this.fx.spark = this.add.particles(0, 0, 'p_spark', {
        lifespan: 300, speed: { min: 20, max: 130 }, scale: { start: 0.35, end: 0 },
        alpha: { start: 0.85, end: 0 }, blendMode: 'ADD', emitting: false,
        quantity: 1, maxAliveParticles: 16
      }).setDepth(25);
      this.fx.reward = this.add.particles(0, 0, 'p_ember', {
        lifespan: 1400, speed: { min: 90, max: 320 }, angle: { min: 200, max: 340 },
        gravityY: 420, scale: { start: 1.1, end: 0 }, alpha: { start: 1, end: 0 },
        blendMode: 'ADD', emitting: false, quantity: 1, maxAliveParticles: 16
      }).setDepth(26);
      // Fourth pooled system, the round 2 addition: garbage dust thrown up by
      // an incoming buried row and by the hard drop's contact.
      this.fx.dust = this.add.particles(0, 0, 'p_spark', {
        lifespan: 460, speed: { min: 25, max: 110 }, angle: { min: 240, max: 300 },
        scale: { start: 0.5, end: 0 }, alpha: { start: 0.7, end: 0 },
        gravityY: -80, emitting: false, quantity: 1, maxAliveParticles: 16
      }).setDepth(23.5);
      this.sweepImg = this.add.image(0, 0, 'p_beam').setVisible(false)
        .setDepth(29).setBlendMode(Phaser.BlendModes.ADD);
      this.sweepFx = null;
    },

    emitShatter: function () {
      if (!this.layoutBox) return;
      var lb = this.layoutBox;
      var rows = this.clearRows;
      var per = fxCount(rows.length >= 4 ? 9 : 6);
      for (var i = 0; i < rows.length; i++) {
        var vy = rows[i] - HIDDEN;
        if (vy < 0) continue;
        var y = lb.y + vy * lb.cell + lb.cell * 0.5;
        var rowColors = this.clearColors[i] || [];
        for (var c = 0; c < COLS; c++) {
          var v = rowColors[c] || 0xffffff;
          var x = lb.x + c * lb.cell + lb.cell * 0.5;
          this.fx.shard.setParticleTint(v);
          this.fx.shard.emitParticleAt(x, y, per);
        }
        this.fx.spark.setParticleTint(this.identity.accent);
        this.fx.spark.emitParticleAt(lb.x + lb.boardW * 0.5, y, fxCount(10));
      }
    },

    // The escalation ladder in one place. Tier 1 is the dry contact accent the
    // clear sound already carries; every step up adds exactly one new layer,
    // and the hero treatment is reserved for tier 4.
    celebrate: function (tier, rowY, color) {
      var lb = this.layoutBox;
      if (!lb) return;
      var cx = lb.x + lb.boardW * 0.5;
      var cy = rowY == null ? lb.y + lb.boardH * 0.5 : rowY;
      var tint = color == null ? this.identity.accent : color;
      if (tier >= 2) {
        this.fx.spark.setParticleTint(tint);
        this.fx.spark.emitParticleAt(cx, cy, fxCount(8));
        this.comboPulse = Math.max(this.comboPulse, 0.6);
      }
      if (tier >= 3) {
        this.ring(cx, cy, lb.boardW * 1.3, tint);
        this.fx.shard.setParticleTint(tint);
        this.fx.shard.emitParticleAt(cx, cy, fxCount(10));
        this.comboPulse = 1;
        if (motionOn()) { kit.juice.shake(9, 220); kit.juice.hitStop(55); }
      }
      if (tier >= 4) {
        this.fx.reward.setParticleTint(tint);
        this.fx.reward.emitParticleAt(cx, cy, fxCount(motionOn() ? 40 : 12));
        this.ring(cx, cy, lb.boardW * 1.9, 0xf7fbff);
        this.sweepFx = { t: 0, life: 420, color: tint };
        if (motionOn()) { kit.juice.shake(13, 300); kit.juice.hitStop(70); }
      }
    },

    // A board-wide light sweep, reserved for the hero beats. One additive quad
    // travelling from the bottom of the board to the top.
    paintSweep: function (dt) {
      var s = this.sweepImg;
      if (!s) return;
      if (!this.sweepFx || !this.layoutBox) {
        if (s.visible) s.setVisible(false);
        return;
      }
      var lb = this.layoutBox;
      this.sweepFx.t += dt;
      var u = clamp(this.sweepFx.t / this.sweepFx.life, 0, 1);
      if (u >= 1) { this.sweepFx = null; s.setVisible(false); return; }
      s.setVisible(true)
        .setPosition(lb.x + lb.boardW * 0.5, lb.y + lb.boardH * (1 - u))
        .setDisplaySize(lb.boardW * 1.05, lb.cell * 2.6)
        .setTint(this.sweepFx.color)
        .setAlpha((motionOn() ? 0.8 : 0.35) * Math.sin(u * Math.PI));
    },

    rewardBurst: function () {
      if (!this.layoutBox) return;
      var lb = this.layoutBox;
      this.fx.reward.setParticleTint(this.identity.accent);
      this.fx.reward.emitParticleAt(lb.x + lb.boardW * 0.5, lb.y + lb.boardH * 0.42,
        fxCount(motionOn() ? 46 : 12));
      this.ring(lb.x + lb.boardW * 0.5, lb.y + lb.boardH * 0.42, lb.boardW * 1.15);
    },

    ring: function (x, y, size, color) {
      for (var i = 0; i < this.ringPool.length; i++) {
        var r = this.ringPool[i];
        if (r.life > 0) continue;
        r.life = 520;
        r.t = 0;
        r.size = size;
        r.img.setVisible(true).setPosition(x, y)
          .setTint(color == null ? this.identity.accent : color)
          .setDisplaySize(size * 0.2, size * 0.2).setAlpha(0.9);
        return;
      }
    },

    paintRings: function (dt) {
      for (var i = 0; i < this.ringPool.length; i++) {
        var r = this.ringPool[i];
        if (r.life <= 0) continue;
        r.t += dt;
        var u = clamp(r.t / r.life, 0, 1);
        var e = easeOutCubic(u);
        r.img.setDisplaySize(r.size * (0.2 + 0.8 * e), r.size * (0.2 + 0.8 * e))
          .setAlpha(0.9 * (1 - u));
        if (u >= 1) { r.life = 0; r.img.setVisible(false); }
      }
    },

    // The clear's first read: a bright beam sweeping the row before it
    // shatters. Runs inside the flash window only.
    paintBeams: function () {
      var lb = this.layoutBox;
      var bi = 0;
      if (this.phase === 'clearing' && this.clearT < CLEAR_FLASH && lb) {
        var u = clamp(this.clearT / CLEAR_FLASH, 0, 1);
        for (var i = 0; i < this.clearRows.length && bi < this.beamPool.length; i++, bi++) {
          var vy = this.clearRows[i] - HIDDEN;
          if (vy < 0) continue;
          var b = this.beamPool[bi];
          b.setVisible(true)
            .setPosition(lb.x + u * lb.boardW, lb.y + vy * lb.cell + lb.cell / 2)
            .setDisplaySize(lb.cell * 1.1, lb.cell * 1.7)
            .setTint(0xffffff)
            .setAlpha((1 - u) * (motionOn() ? 0.95 : 0.5));
        }
      }
      for (; bi < this.beamPool.length; bi++) {
        if (this.beamPool[bi].visible) this.beamPool[bi].setVisible(false);
      }
    },

    banner: function (text, color) {
      if (!text) return;
      var entry = { text: text, color: color || 0xffa724 };
      if ((this.bannerLife > 0 && this.bannerText === text) ||
          this.bannerQueue.some(function (item) { return item.text === text; })) return;
      // Keep the queue useful during a fast clear streak: the newest four
      // distinct rewards are enough to preserve the read without backlog.
      if (this.bannerQueue.length >= 4) this.bannerQueue.shift();
      this.bannerQueue.push(entry);
    },

    buildResult: function () {
      this.resultG = this.add.graphics().setDepth(40).setVisible(false);
      this.resultTitle = this.text(0, 0, '', 26, CSS.text, '800').setDepth(41).setOrigin(0.5, 0.5);
      this.resultSub = this.text(0, 0, '', 14, CSS.dim, '650').setDepth(41).setOrigin(0.5, 0.5);
      this.resultMedal = this.add.image(0, 0, 'atlas', 'medal_bronze')
        .setDepth(41).setVisible(false);
      this.resultBtns = [];
      for (var i = 0; i < 3; i++) {
        var t = this.text(0, 0, '', 14, CSS.text, '750').setDepth(42).setOrigin(0.5, 0.5);
        var z = this.add.zone(0, 0, 10, 10).setOrigin(0.5, 0.5).setDepth(43);
        this.resultBtns.push({ label: t, zone: z, fn: null });
      }
      this.resultVisible = false;
    },

    showResult: function () {
      var self = this;
      this.resultVisible = true;
      showControls(false);
      var won = this.phase === 'win';
      var self2 = this;
      this.resultT = 0;
      this.resultScoreShown = 0;
      setTextIfChanged(this.resultTitle, this.result || (won ? 'CLEAR' : 'GAME OVER'));
      this.resultTitle.setColor(won ? '#ffc861' : '#f25c68');
      // The subtitle is a FUNCTION of the counting score, so the ceremony can
      // tick the number up rather than stamping the final value.
      if (this.mode === 'sprint') {
        this.resultScoreTarget = 0;
        this.resultSubFn = function () {
          return won ? formatTime(self2.simTime) + '  -  40 lines' : self2.lines + ' of 40 lines';
        };
      } else if (this.mode === 'puzzle') {
        this.resultScoreTarget = 0;
        this.resultSubFn = function () {
          return self2.cleared + ' of ' + self2.goal + ' lines cleared';
        };
      } else if (this.mode === 'master') {
        this.resultScoreTarget = 0;
        this.resultSubFn = function () {
          return won ? 'Every hazard removed' : self2.hazardCount + ' hazard blocks left';
        };
      } else if (this.mode === 'ultra') {
        this.resultScoreTarget = this.score;
        this.resultSubFn = function (n) {
          return n.toLocaleString() + ' points  -  ' + self2.lines + ' lines';
        };
      } else if (this.mode === 'rival') {
        this.resultScoreTarget = this.score;
        this.resultSubFn = function (n) {
          return (won ? 'KO in ' + formatTime(self2.simTime) : 'Buried at ' + formatTime(self2.simTime)) +
            '  -  ' + n.toLocaleString();
        };
      } else {
        this.resultScoreTarget = this.score;
        this.resultSubFn = function (n) {
          return n.toLocaleString() + ' points  -  level ' + self2.level +
            '  -  ' + self2.lines + ' lines';
        };
      }
      setTextIfChanged(this.resultSub, this.resultSubFn(0));
      var mf = medalFrame(this.mode, this.medal);
      if (!mf && won && this.mode === 'master') mf = 'medal_master';
      if (!mf && won && this.mode === 'puzzle') mf = 'medal_gold';
      this.resultMedalWanted = !!mf;
      this.resultSubDone = false;
      this.resultMedal.setVisible(false);
      if (mf) this.resultMedal.setFrame(mf);

      var btns = [];
      btns.push({ label: 'PLAY AGAIN', fn: function () { restartPlay(self.restartArgs()); } });
      if (this.mode === 'puzzle' && won && this.puzzleIndex + 1 < PUZZLES.length) {
        btns.push({
          label: 'NEXT BOARD', fn: function () {
            restartPlay({ mode: 'puzzle', puzzleIndex: self.puzzleIndex + 1 });
          }
        });
      }
      btns.push({ label: 'MENU', fn: function () { startTitle(); } });
      for (var i = 0; i < this.resultBtns.length; i++) {
        var b = this.resultBtns[i];
        var d = btns[i];
        b.fn = d ? d.fn : null;
        b.label.setVisible(!!d);
        b.zone.setVisible(!!d);
        if (d) setTextIfChanged(b.label, d.label);
        b.zone.removeAllListeners('pointerup');
        if (d) {
          (function (fn) {
            b.zone.on('pointerup', function () { sfx('sfx_ui'); fn(); });
          })(d.fn);
        } else if (b.zone.input) {
          b.zone.disableInteractive();
        }
      }
      // Size first, then claim input: a zone's hit area is built from its
      // size at setInteractive time.
      this.layoutResult();
    },

    // ---------------------------------------------------------- layout
    layout: function () {
      var w = Math.max(240, this.scale.gameSize.width);
      var h = Math.max(360, this.scale.gameSize.height);
      Game.insets = readInsets();
      var ins = Game.insets;

      this.skyTier = this.levelSkyTier();
      var key = bakeSky(this, Math.ceil(w), Math.ceil(h), this.identity, this.skyTier);
      this.bg.setTexture(key).setDisplaySize(w, h);
      this.bgNext.setDisplaySize(w, h).setVisible(false);
      this.skyFade = 1;
      this.dangerImg.setPosition(w / 2, h * 0.5).setDisplaySize(w * 1.6, h * 1.2);

      var hudH = 74;
      var ctrlH = CTRL_H + ins.bottom;
      var coachH = 32;
      var top = ins.top + 6;
      var availH = h - top - hudH - coachH - ctrlH - 10;
      // The duel needs room for a second board, so its rail is wider and its
      // hold/next panels give way to the rival's playfield.
      var railW = this.mode === 'rival'
        ? clamp(w * 0.33, 92, 140)
        : clamp(w * 0.26, 78, 116);
      var framePad = 14;
      var railGap = 10;
      var availW = w - ins.left - ins.right - railW - railGap - framePad * 2;
      var cell = Math.floor(Math.min(availW / COLS, availH / VIS_ROWS));
      // Keep the board inside the play band even in 844x390 landscape. At
      // dpr2 this seven-CSS-pixel floor remains a readable 14 physical pixels.
      cell = Math.max(7, cell);
      var boardW = cell * COLS;
      var boardH = cell * VIS_ROWS;
      var groupW = boardW + framePad * 2 + railGap + railW;
      var x = Math.round(ins.left + framePad + Math.max(0,
        (w - ins.left - ins.right - groupW) / 2));
      // Bias the board DOWN into the slack rather than centring it. On a tall
      // phone that puts the stack nearer the thumbs and leaves the breathing
      // room above, where the HUD and the coach strip already live.
      var y = Math.round(top + hudH + coachH + Math.max(0, (availH - boardH) * 0.62));

      this.layoutBox = {
        x: x, y: y, cell: cell, boardW: boardW, boardH: boardH,
        framePad: framePad, railGap: railGap,
        railX: x + boardW + framePad + railGap, railW: railW,
        w: w, h: h, hudTop: top, hudH: hudH
      };
      this.layoutRail();
      this.glow.setPosition(x + boardW / 2, y + boardH * 0.55)
        .setDisplaySize(boardW * 2.1, boardH * 1.3)
        .setTint(this.identity.accent);
      this.drawFrame();
      this.layoutHud();
      this.applyTextScale();
      this.layoutResult();
      this.paintCells(true);
    },

    // Which evolved sky the current level sits on. Marathon and Ultra walk the
    // whole ladder; the fixed-speed modes stay on their own authored grade so
    // a Puzzle board never changes colour under the player mid-solve.
    levelSkyTier: function () {
      if (this.mode === 'marathon') return clamp(Math.floor((this.level - 1) / 5), 0, SKY_TIERS - 1);
      if (this.mode === 'ultra') {
        return clamp(Math.floor((this.level - (ULTRA.startLevel || 4)) / 4), 0, SKY_TIERS - 1);
      }
      if (this.mode === 'rival') return clamp(Math.floor((this.level - 4) / 3), 0, SKY_TIERS - 1);
      if (this.mode === 'master') return 2;
      return 0;
    },

    // Rail geometry. Normal modes get a big hold slot and a three deep next
    // queue; the duel trades that down for the rival board.
    layoutRail: function () {
      var lb = this.layoutBox;
      var chipH = 46;
      var chipY = lb.y + lb.boardH - 52;
      if (this.mode === 'rival') {
        lb.holdH = Math.min(lb.boardH * 0.13, 66);
        lb.nextH = Math.min(lb.boardH * 0.21, 108);
        lb.nextCount = 2;
        var rivalTop = lb.y + lb.holdH + 8 + lb.nextH + 8;
        var rivalH = Math.max(60, chipY - 10 - rivalTop);
        var rc = Math.floor(Math.min(lb.railW / COLS, rivalH / VIS_ROWS));
        rc = Math.max(3, rc);
        lb.rivalCell = rc;
        lb.rivalW = rc * COLS;
        lb.rivalH = rc * VIS_ROWS;
        lb.rivalX = Math.round(lb.railX + (lb.railW - lb.rivalW) / 2);
        lb.rivalY = Math.round(rivalTop + Math.max(0, (rivalH - lb.rivalH) / 2));
        lb.rivalPanel = { x: lb.railX, y: rivalTop, w: lb.railW, h: rivalH };
      } else {
        lb.holdH = Math.min(lb.boardH * 0.20, 96);
        lb.nextH = Math.min(lb.boardH * 0.46, 232);
        lb.nextCount = 3;
        lb.rivalCell = 0;
        lb.rivalPanel = null;
      }
      lb.chipY = chipY;
      lb.chipH = chipH;
      this.railHoldH = lb.holdH;
      this.railNextH = lb.nextH;
    },

    bakeKey: function (kind) {
      var lb = this.layoutBox;
      return 'sl_' + kind + '_' + this.identity.id + '_' + lb.w + 'x' + lb.h + '_' +
        lb.cell + '_' + lb.x + '_' + lb.y + '_' + Math.round(lb.railW) + '_' +
        (lb.rivalCell || 0);
    },
    // Bakes are keyed by identity + layout. Old ones are released so a long
    // resize drag cannot pile up full-size canvas textures.
    keepBake: function (key) {
      if (this.bakedKeys.indexOf(key) < 0) this.bakedKeys.push(key);
      while (this.bakedKeys.length > 4) {
        var old = this.bakedKeys.shift();
        if (this.textures.exists(old)) this.textures.remove(old);
      }
    },

    drawFrame: function () {
      var lb = this.layoutBox;
      var id = this.identity;
      var key = this.bakeKey('board');
      var pad = lb.framePad || 14;
      var W = lb.boardW + pad * 2, H = lb.boardH + pad * 2;
      if (!this.textures.exists(key)) {
        var tex = this.textures.createCanvas(key, Math.ceil(W), Math.ceil(H));
        var ctx = tex.getContext();
        // board object: rounded frame, inner well, contact shadow, edge line
        ctx.fillStyle = 'rgba(0,0,0,0.34)';
        rr(ctx, 4, 6, W - 8, H - 8, 18); ctx.fill();
        ctx.fillStyle = hexCss(id.frame);
        rr(ctx, 4, 4, W - 8, H - 8, 18); ctx.fill();
        ctx.strokeStyle = hexCss(id.frameEdge);
        ctx.globalAlpha = 0.85; ctx.lineWidth = 2;
        rr(ctx, 4, 4, W - 8, H - 8, 18); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(10,14,26,0.72)';
        rr(ctx, pad - 3, pad - 3, lb.boardW + 6, lb.boardH + 6, 10); ctx.fill();
        // empty cell rhythm, two values, quiet
        var radius = Math.max(2, lb.cell * 0.14);
        for (var r = 0; r < VIS_ROWS; r++) {
          for (var col = 0; col < COLS; col++) {
            ctx.globalAlpha = id.cellAlpha;
            ctx.fillStyle = hexCss((r + col) % 2 ? id.cellA : id.cellB);
            rr(ctx, pad + col * lb.cell + 1, pad + r * lb.cell + 1,
              lb.cell - 2, lb.cell - 2, radius);
            ctx.fill();
          }
        }
        ctx.globalAlpha = 1;
        tex.refresh();
      }
      this.keepBake(key);
      this.boardImg.setTexture(key).setPosition(lb.x - pad, lb.y - pad)
        .setDisplaySize(W, H);
      this.drawChrome();
    },

    drawChrome: function () {
      var lb = this.layoutBox;
      var id = this.identity;
      var ins = Game.insets;
      var key = this.bakeKey('chrome');
      if (!this.textures.exists(key)) {
        var tex = this.textures.createCanvas(key, Math.ceil(lb.w), Math.ceil(lb.h));
        var ctx = tex.getContext();
        function panel(x, y, w, h, radius, edge, edgeAlpha) {
          ctx.fillStyle = 'rgba(20,27,43,0.80)';
          rr(ctx, x, y, w, h, radius); ctx.fill();
          ctx.strokeStyle = hexCss(edge);
          ctx.globalAlpha = edgeAlpha;
          ctx.lineWidth = 1.5;
          rr(ctx, x, y, w, h, radius); ctx.stroke();
          ctx.globalAlpha = 1;
        }
        panel(ins.left + 8, lb.hudTop - 2, lb.w - ins.left - ins.right - 16,
          lb.hudH - 6, 14, id.frameEdge, 0.4);
        panel(lb.railX, lb.y, lb.railW, lb.holdH, 12, id.frameEdge, 0.5);
        panel(lb.railX, lb.y + lb.holdH + 8, lb.railW, lb.nextH, 12, id.frameEdge, 0.5);
        if (lb.rivalPanel) {
          var rp = lb.rivalPanel;
          panel(rp.x, rp.y, rp.w, rp.h, 12, id.accent, 0.6);
          // The rival's well is a darker inset inside its own panel, so the
          // second board reads as a board and not as a chart.
          ctx.fillStyle = 'rgba(8,12,20,0.86)';
          rr(ctx, lb.rivalX - 3, lb.rivalY - 3, lb.rivalW + 6, lb.rivalH + 6, 6);
          ctx.fill();
          ctx.globalAlpha = 0.4;
          ctx.strokeStyle = hexCss(id.frameEdge);
          ctx.lineWidth = 1;
          for (var gy = 0; gy <= VIS_ROWS; gy += 5) {
            ctx.beginPath();
            ctx.moveTo(lb.rivalX, lb.rivalY + gy * lb.rivalCell);
            ctx.lineTo(lb.rivalX + lb.rivalW, lb.rivalY + gy * lb.rivalCell);
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        }
        panel(lb.railX, lb.chipY, lb.railW, lb.chipH, 10, id.accent, 0.55);
        tex.refresh();
      }
      this.keepBake(key);
      this.chromeImg.setTexture(key).setPosition(0, 0).setDisplaySize(lb.w, lb.h);
    },

    layoutHud: function () {
      var lb = this.layoutBox;
      var ins = Game.insets;
      var x0 = ins.left + 14;
      var top = lb.hudTop;
      this.txt.mode.setPosition(x0, top + 4);
      this.txt.metricLabel.setPosition(x0, top + 20);
      this.txt.metric.setPosition(x0, top + 38);
      this.txt.secondLabel.setPosition(x0 + 132, top + 20);
      this.txt.second.setPosition(x0 + 132, top + 39);
      // The level readout is inset so it never sits under the settings tap
      // target in the top-right corner.
      this.txt.levelLabel.setPosition(lb.w - ins.right - 62, top + 20).setOrigin(1, 0);
      this.txt.level.setPosition(lb.w - ins.right - 62, top + 38).setOrigin(1, 0);
      this.txt.pause.setPosition(lb.w - ins.right - 22, top + 22).setOrigin(0.5, 0.5);
      if (!this.pauseZone) {
        this.pauseZone = this.add.zone(0, 0, 46, 44).setDepth(44).setInteractive();
        this.pauseZone.on('pointerup', function () { sfx('sfx_ui'); openSettings(); });
      }
      this.pauseZone.setPosition(lb.w - ins.right - 22, top + 22);

      this.txt.holdLabel.setPosition(lb.railX + 6, lb.y + 4);
      this.txt.nextLabel.setPosition(lb.railX + 6, lb.y + lb.holdH + 12);
      if (lb.rivalPanel) {
        this.txt.rivalLabel.setVisible(true)
          .setPosition(lb.rivalPanel.x + 6, lb.rivalPanel.y + 4);
        setTextIfChanged(this.txt.rivalLabel, rivalTier(this.tierIndex).name);
      } else {
        this.txt.rivalLabel.setVisible(false);
      }
      // The coach strip sits in the gap ABOVE the board frame. It never covers
      // a cell, the play area centre or the lower half of the screen.
      this.txt.coach.setPosition(ins.left + 26, lb.hudTop + lb.hudH + 14).setOrigin(0, 0.5);
      this.txt.coach.setWordWrapWidth(lb.w - 32);
      this.txt.coach.setAlign('left');
    },

    applyTextScale: function () {
      var names = ['mode', 'metricLabel', 'metric', 'secondLabel', 'second', 'level',
        'levelLabel', 'holdLabel', 'nextLabel', 'coach', 'pause', 'rivalLabel'];
      var sizes = [14, 14, 24, 14, 16, 20, 14, 16, 18, 14, 22, 11];
      for (var i = 0; i < names.length; i++) this.txt[names[i]].setFontSize(scaledPx(sizes[i]));
      this.bannerT.setFontSize(scaledPx(14));
      this.resultTitle.setFontSize(scaledPx(26));
      this.resultSub.setFontSize(scaledPx(14));
      for (var j = 0; j < this.resultBtns.length; j++) this.resultBtns[j].label.setFontSize(scaledPx(14));
    },

    layoutResult: function () {
      if (!this.layoutBox) return;
      var lb = this.layoutBox;
      var cx = lb.w / 2;
      var cy = lb.h * 0.44;
      this.resultTitle.setPosition(cx, cy - 58);
      this.resultSub.setPosition(cx, cy - 24);
      this.resultMedal.setPosition(cx, cy + 18).setDisplaySize(54, 54);
      var bw = Math.min(260, lb.w * 0.62);
      var n = 0;
      for (var i = 0; i < this.resultBtns.length; i++) {
        var b = this.resultBtns[i];
        if (!b.label.visible) continue;
        var by = cy + 66 + n * 52;
        b.label.setPosition(cx, by);
        b.zone.setPosition(cx, by).setSize(bw, 44);
        b.zone.setInteractive();   // rebuilds the hit area at the new size
        n++;
      }
      this.resultRows = n;
    },

    // ---------------------------------------------------------- painting
    paintCells: function (force) {
      var lb = this.layoutBox;
      if (!lb) return;
      var clearing = this.phase === 'clearing';
      var flashing = clearing && this.clearT < CLEAR_FLASH;
      var shattering = clearing && this.clearT >= CLEAR_FLASH && this.collapsePivot < 0;
      var collapseE = 0;
      if (this.collapsePivot >= 0) {
        collapseE = easeOutCubic(clamp((this.clearT - CLEAR_FLASH - CLEAR_SHATTER) / CLEAR_COLLAPSE, 0, 1));
      }
      var rowHidden = {};
      if (clearing && this.collapsePivot < 0) {
        for (var q = 0; q < this.clearRows.length; q++) rowHidden[this.clearRows[q]] = true;
      }

      var i = 0;
      for (var r = HIDDEN; r < ROWS; r++) {
        for (var c = 0; c < COLS; c++, i++) {
          var sp = this.stackPool[i];
          var v = this.grid[r][c];
          var rec = this.cellView[i];
          if (!v || (rowHidden[r] && shattering)) {
            if (sp.visible) sp.setVisible(false);
            rec.v = 0;
            continue;
          }
          var yOff = 0;
          if (this.collapsePivot >= 0 && this.collapseOrigins[r] >= 0) {
            yOff = (this.collapseOrigins[r] - r) * lb.cell * (1 - collapseE);
          }
          if (rec.v !== v || force) {
            rec.v = v;
            sp.setFrame(frameForCell(v));
          }
          sp.setPosition(lb.x + c * lb.cell + lb.cell / 2,
            lb.y + (r - HIDDEN) * lb.cell + lb.cell / 2 + yOff);
          // Settle pop: the cells that just locked squash then recover. It is
          // the contact accent the house motion language asks for, and it is
          // the only per-cell transform in the painter.
          if (rec.pop > 0) {
            var pk = rec.pop * (motionOn() ? 1 : 0.35);
            sp.setDisplaySize(lb.cell * (1 + 0.20 * pk), lb.cell * (1 - 0.12 * pk));
          } else {
            sp.setDisplaySize(lb.cell, lb.cell);
          }
          if (rowHidden[r] && flashing) sp.setTintFill(0xffffff); else sp.clearTint();
          if (!sp.visible) sp.setVisible(true);
        }
      }

      // clear-row flash plates
      var fpi = 0;
      if (flashing) {
        var pulse = 0.55 + 0.45 * Math.sin(this.clearT * 0.07);
        for (var fr = 0; fr < this.clearRows.length && fpi < this.flashPool.length; fr++) {
          var vy = this.clearRows[fr] - HIDDEN;
          if (vy < 0) continue;
          for (var fc = 0; fc < COLS && fpi < this.flashPool.length; fc++, fpi++) {
            var fp = this.flashPool[fpi];
            fp.setVisible(true)
              .setPosition(lb.x + fc * lb.cell + lb.cell / 2, lb.y + vy * lb.cell + lb.cell / 2)
              .setDisplaySize(lb.cell, lb.cell)
              .setAlpha(pulse * (motionOn() ? 0.9 : 0.5))
              .setTint(this.identity.accent);
          }
        }
      }
      for (; fpi < this.flashPool.length; fpi++) {
        if (this.flashPool[fpi].visible) this.flashPool[fpi].setVisible(false);
      }

      // ghost + active piece. The two pools are indexed independently: a cell
      // sitting in the spawn buffer above the board is clipped out of the
      // active pool while its ghost, which is always lower, still draws.
      var gi = 0, ai = 0;
      if (this.piece.alive && this.phase === 'play') {
        var m = shapeOf(this.piece.kind, this.piece.rot);
        var gy = this.ghostY();
        var frame = frameForKind(this.piece.kind);
        var tintc = colorForKind(this.piece.kind);
        var popS = 1 + (this.kickFx > 0 ? 0.06 * this.kickFx : 0);
        if (this.playerState === 'resolve') popS *= 1.06;
        if (this.playerState === 'invalid') popS *= 0.96;
        for (var py = 0; py < m.length; py++) {
          for (var px = 0; px < m[py].length; px++) {
            if (!m[py][px]) continue;
            var bx = lb.x + (this.piece.x + px) * lb.cell + lb.cell / 2;
            var grow = gy + py - HIDDEN;
            var arow = this.piece.y + py - HIDDEN;
            if (grow >= 0 && grow < VIS_ROWS && gy !== this.piece.y && gi < 4) {
              // The ghost breathes and carries the piece's own hue, so it is a
              // legible seat rather than a grey smear.
              var ga = 0.42 + (motionOn() ? 0.14 * (0.5 + 0.5 * Math.sin(this.playerClock * 0.006)) : 0.1);
              this.ghostPool[gi].setVisible(true)
                .setPosition(bx, lb.y + grow * lb.cell + lb.cell / 2)
                .setDisplaySize(lb.cell * 0.98, lb.cell * 0.98)
                .setTint(tintc).setAlpha(ga);
              gi++;
            }
            if (arow >= 0 && arow < VIS_ROWS && ai < 4) {
              var as = this.activePool[ai];
              if (as.frame.name !== frame) as.setFrame(frame);
              as.setVisible(true).setPosition(bx, lb.y + arow * lb.cell + lb.cell / 2)
                .setDisplaySize(lb.cell * popS, lb.cell * popS).clearTint().setAlpha(1);
              ai++;
            }
          }
        }
      }
      for (; gi < 4; gi++) if (this.ghostPool[gi].visible) this.ghostPool[gi].setVisible(false);
      for (; ai < 4; ai++) if (this.activePool[ai].visible) this.activePool[ai].setVisible(false);
    },

    // ------------------------------------------------------- rival painting
    ensureRivalTex: function () {
      var lb = this.layoutBox;
      if (!lb || !lb.rivalCell) return '';
      var w = Math.max(2, Math.ceil(lb.rivalW));
      var h = Math.max(2, Math.ceil(lb.rivalH));
      var key = 'sl_rivalboard_' + w + 'x' + h;
      if (this.rivalTexKey === key && this.textures.exists(key)) return key;
      if (this.rivalTexKey && this.rivalTexKey !== key && this.textures.exists(this.rivalTexKey)) {
        this.textures.remove(this.rivalTexKey);
      }
      // createCanvas returns null when the key already exists, so the live
      // CanvasTexture is fetched back rather than assumed from the call.
      this.textures.createCanvas(key, w, h);
      this.rivalTex = this.textures.get(key);
      this.rivalTexKey = key;
      if (this.rival) this.rival.dirty = true;
      return key;
    },

    // The rival's stack is repainted only on the frames its grid changed, so a
    // whole second board costs one quad per frame.
    paintRival: function () {
      var lb = this.layoutBox;
      var r = this.rival;
      var i;
      if (!r || !lb || !lb.rivalCell) {
        if (this.rivalImg.visible) this.rivalImg.setVisible(false);
        for (i = 0; i < this.rivalPool.length; i++) this.rivalPool[i].setVisible(false);
        if (this.rivalG) this.rivalG.clear();
        return;
      }
      var key = this.ensureRivalTex();
      if (!key) return;
      var tex = this.rivalTex;
      if (r.dirty && tex && tex.getContext) {
        r.dirty = false;
        var ctx = tex.getContext();
        var cell = lb.rivalCell;
        ctx.clearRect(0, 0, lb.rivalW, lb.rivalH);
        for (var row = HIDDEN; row < ROWS; row++) {
          for (var col = 0; col < COLS; col++) {
            var v = r.grid[row][col];
            if (!v) continue;
            ctx.fillStyle = hexCss(colorForCell(v));
            rr(ctx, col * cell + 0.5, (row - HIDDEN) * cell + 0.5,
              cell - 1, cell - 1, Math.max(1, cell * 0.22));
            ctx.fill();
          }
        }
        tex.refresh();
      }
      this.rivalImg.setTexture(key).setPosition(lb.rivalX, lb.rivalY)
        .setDisplaySize(lb.rivalW, lb.rivalH).setVisible(true)
        .setAlpha(r.dead ? 0.35 : 1);

      // The rival's live piece rides on four pooled sprites above the bake.
      var pi = 0;
      if (r.piece.alive && !r.dead) {
        var m = shapeOf(r.piece.kind, r.piece.rot);
        var frame = frameForKind(r.piece.kind);
        for (var py = 0; py < m.length; py++) {
          for (var px = 0; px < m[py].length; px++) {
            if (!m[py][px] || pi >= this.rivalPool.length) continue;
            var vy = r.piece.y + py - HIDDEN;
            if (vy < 0 || vy >= VIS_ROWS) continue;
            var s = this.rivalPool[pi++];
            if (s.frame.name !== frame) s.setFrame(frame);
            s.setVisible(true)
              .setPosition(lb.rivalX + (r.piece.x + px) * lb.rivalCell + lb.rivalCell / 2,
                lb.rivalY + vy * lb.rivalCell + lb.rivalCell / 2)
              .setDisplaySize(lb.rivalCell, lb.rivalCell);
          }
        }
      }
      for (; pi < this.rivalPool.length; pi++) {
        if (this.rivalPool[pi].visible) this.rivalPool[pi].setVisible(false);
      }

      // Clear flash on the rival board, and a veil when it is down.
      var g = this.rivalG;
      g.clear();
      if (r.flash) {
        var a = clamp(1 - r.flash.t / 200, 0, 1);
        g.fillStyle(0xffffff, 0.75 * a);
        for (var f = 0; f < r.flash.rows.length; f++) {
          var fy = r.flash.rows[f] - HIDDEN;
          if (fy < 0) continue;
          g.fillRect(lb.rivalX, lb.rivalY + fy * lb.rivalCell, lb.rivalW, lb.rivalCell);
        }
      }
      if (r.dead) {
        g.lineStyle(3, 0xff5c3c, 0.9);
        g.lineBetween(lb.rivalX, lb.rivalY, lb.rivalX + lb.rivalW, lb.rivalY + lb.rivalH);
        g.lineBetween(lb.rivalX + lb.rivalW, lb.rivalY, lb.rivalX, lb.rivalY + lb.rivalH);
      }
    },

    // Incoming garbage meter: a segmented column hugging the board's inner
    // left edge. It is the only new persistent HUD element, and it replaces
    // nothing the player already reads.
    paintGarbage: function () {
      var g = this.garbageG;
      var lb = this.layoutBox;
      g.clear();
      if (this.mode !== 'rival' || !lb) return;
      var n = Math.min(this.pendingGarbage, VIS_ROWS);
      var x = lb.x - 8;
      var wq = 5;
      g.fillStyle(0x101828, 0.75);
      g.fillRoundedRect(x, lb.y, wq, lb.boardH, 2);
      if (n <= 0) return;
      var segH = lb.boardH / VIS_ROWS;
      var hot = n >= 4;
      for (var i = 0; i < n; i++) {
        var alpha = hot ? 0.75 + 0.25 * Math.sin(this.playerClock * 0.012 + i) : 0.85;
        g.fillStyle(hot ? 0xff5c3c : 0xffa724, motionOn() ? alpha : 0.85);
        g.fillRect(x, lb.y + lb.boardH - (i + 1) * segH + 1, wq, segH - 2);
      }
    },

    paintRail: function () {
      var lb = this.layoutBox;
      var holdH = lb.holdH, nextH = lb.nextH;
      var nx = lb.railX, ny = lb.y;
      var ny2 = ny + holdH + 8;
      // The bottom rail panel is a calm progress ring instead of another
      // counter. It is the only live shape on the rail, so it is the only one
      // still in a Graphics.
      var g = this.ringG;
      var chipY = lb.chipY;
      var cx = nx + lb.railW / 2, cy = chipY + 23, rad = 15;
      var frac = 0;
      if (this.mode === 'sprint') frac = this.lines / 40;
      else if (this.mode === 'puzzle') frac = this.goal ? this.cleared / this.goal : 0;
      else if (this.mode === 'master') {
        frac = this.initialHazards ? (this.initialHazards - this.hazardCount) / this.initialHazards : 0;
      } else if (this.mode === 'ultra') {
        frac = 1 - this.timeLeft / (ULTRA.ms || 120000);
      } else if (this.mode === 'rival') {
        frac = this.rival ? (this.rival.dead ? 1 : this.rival.height / VIS_ROWS) : 0;
      } else frac = (this.lines % 10) / 10;
      frac = clamp(frac, 0, 1);
      // Graphics.arc() walks its sweep in 0.01 rad steps, which is 628 verts
      // for a full circle EVERY frame the command list replays. The ring is
      // hand-tessellated to 48 segments instead, and the redraw is gated on a
      // quantised fraction so a per-frame value (the Ultra clock) cannot mint
      // a new command list sixty times a second.
      var qf = Math.round(frac * 48) / 48;
      if (this.ringFrac !== qf || this.ringCx !== cx || this.ringCy !== cy) {
        this.ringFrac = qf; this.ringCx = cx; this.ringCy = cy;
        var SEG = 48, i2, ang;
        g.clear();
        g.lineStyle(4, 0x2a3a52, 1);
        g.beginPath();
        for (i2 = 0; i2 <= SEG; i2++) {
          ang = -Math.PI / 2 + (Math.PI * 2 * i2) / SEG;
          if (i2 === 0) g.moveTo(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad);
          else g.lineTo(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad);
        }
        g.strokePath();
        if (qf > 0) {
          var used = Math.max(1, Math.round(SEG * qf));
          g.lineStyle(4, this.identity.accent, 1);
          g.beginPath();
          for (i2 = 0; i2 <= used; i2++) {
            ang = -Math.PI / 2 + (Math.PI * 2 * qf * i2) / used;
            if (i2 === 0) g.moveTo(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad);
            else g.lineTo(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad);
          }
          g.strokePath();
        }
      }

      var pi = 0;
      var count = lb.nextCount || 3;
      var spacing = Math.min(64, nextH / (count + 0.3));
      // hold slot: pops on a swap, dims while the slot is spent
      if (this.hold) {
        var hs = Math.min(13, lb.railW / 7.2) * (1 + (motionOn() ? 0.22 : 0.08) * this.holdAnim);
        pi = this.paintMini(this.hold, nx + lb.railW / 2, ny + holdH * 0.62, hs, pi,
          this.holdUsed >= this.holdMax ? 0.5 : 1);
      }
      // The queue slides: when the head is consumed every preview travels one
      // slot upward across the next 160 ms instead of teleporting.
      var slide = (motionOn() ? this.queueAnim : 0) * spacing;
      for (var i = 0; i < count && i < this.queue.length; i++) {
        var alpha = i === 0 ? 1 : (i === 1 ? 0.82 : 0.6);
        var mc = Math.min(i === 0 ? 12.5 : 10.5, lb.railW / (i === 0 ? 7.6 : 9.2));
        pi = this.paintMini(this.queue[i], nx + lb.railW / 2,
          ny2 + 26 + i * spacing + slide, mc, pi,
          alpha * (i === 0 ? 1 : (1 - this.queueAnim * 0.25)));
      }
      for (; pi < this.railPool.length; pi++) {
        if (this.railPool[pi].visible) this.railPool[pi].setVisible(false);
      }

      // hold lockout indicator: a broken ring over the hold slot
      var locked = this.holdUsed >= this.holdMax;
      this.lockoutIcon.setVisible(locked)
        .setPosition(nx + lb.railW - 18, ny + 16).setDisplaySize(20, 20)
        .setAlpha(this.flashLockout > 0 ? 1 : 0.75)
        .setTint(this.flashLockout > 0 ? 0xffffff : 0xff6a5c);
    },

    paintMini: function (kind, cx, cy, cell, pi, alpha) {
      var m = shapeOf(kind, 0);
      var wCells = m[0].length, hCells = m.length;
      var ox = cx - wCells * cell / 2, oy = cy - hCells * cell / 2;
      var frame = frameForKind(kind);
      var a = alpha == null ? 0.98 : clamp(alpha, 0.1, 1);
      for (var y = 0; y < hCells; y++) {
        for (var x = 0; x < wCells; x++) {
          if (!m[y][x] || pi >= this.railPool.length) continue;
          var s = this.railPool[pi++];
          s.setVisible(true).setFrame(frame)
            .setPosition(ox + x * cell + cell / 2, oy + y * cell + cell / 2)
            .setDisplaySize(cell, cell).setAlpha(a);
        }
      }
      return pi;
    },

    paintHud: function () {
      // The HUD card itself is part of the baked chrome quad; only the numbers
      // change here, and every one of them goes through setTextIfChanged.
      setTextIfChanged(this.txt.mode, this.identity.name);

      // Each mode reads out the number that decides ITS run, never a borrowed
      // one: a Puzzle board does not care about the Marathon high score.
      if (this.mode === 'sprint') {
        setTextIfChanged(this.txt.metricLabel, 'TIME');
        setTextIfChanged(this.txt.metric, formatTime(this.simTime));
        setTextIfChanged(this.txt.secondLabel, 'BEST');
        setTextIfChanged(this.txt.second, profile.bestSprint ? formatTime(profile.bestSprint) : '--:--.--');
        setTextIfChanged(this.txt.levelLabel, 'LINES');
        setTextIfChanged(this.txt.level, Math.min(this.lines, 40) + '/40');
      } else if (this.mode === 'puzzle') {
        setTextIfChanged(this.txt.metricLabel, 'SCORE');
        setTextIfChanged(this.txt.metric, pad(this.score, 6));
        setTextIfChanged(this.txt.secondLabel, 'LEFT');
        setTextIfChanged(this.txt.second, String(this.queue.length + (this.hold ? 1 : 0) +
          (this.piece.alive ? 1 : 0)));
        setTextIfChanged(this.txt.levelLabel, 'GOAL');
        setTextIfChanged(this.txt.level, Math.min(this.cleared, this.goal) + '/' + this.goal);
      } else if (this.mode === 'ultra') {
        setTextIfChanged(this.txt.metricLabel, 'SCORE');
        setTextIfChanged(this.txt.metric, pad(this.score, 6));
        setTextIfChanged(this.txt.secondLabel, 'LEFT');
        setTextIfChanged(this.txt.second, formatTime(Math.max(0, this.timeLeft)));
        this.txt.second.setColor(this.timeLeft < 15000 ? CSS.coral : CSS.dim);
        setTextIfChanged(this.txt.levelLabel, 'LVL');
        setTextIfChanged(this.txt.level, String(this.level));
      } else if (this.mode === 'rival') {
        setTextIfChanged(this.txt.metricLabel, 'SCORE');
        setTextIfChanged(this.txt.metric, pad(this.score, 6));
        setTextIfChanged(this.txt.secondLabel, 'INCOMING');
        setTextIfChanged(this.txt.second, String(this.pendingGarbage));
        this.txt.second.setColor(this.pendingGarbage >= 4 ? CSS.coral
          : (this.pendingGarbage > 0 ? CSS.amber : CSS.dim));
        setTextIfChanged(this.txt.levelLabel, 'SENT');
        setTextIfChanged(this.txt.level, String(this.rival ? this.rival.pending : 0));
      } else if (this.mode === 'master') {
        setTextIfChanged(this.txt.metricLabel, 'SCORE');
        setTextIfChanged(this.txt.metric, pad(this.score, 6));
        setTextIfChanged(this.txt.secondLabel, 'HAZARD');
        setTextIfChanged(this.txt.second, String(Math.max(0, this.hazardCount)));
        setTextIfChanged(this.txt.levelLabel, 'LVL');
        setTextIfChanged(this.txt.level, String(this.level));
      } else {
        setTextIfChanged(this.txt.metricLabel, 'SCORE');
        setTextIfChanged(this.txt.metric, pad(this.score, 6));
        setTextIfChanged(this.txt.secondLabel, 'LINES');
        setTextIfChanged(this.txt.second, String(this.lines));
        setTextIfChanged(this.txt.levelLabel, 'LVL');
        setTextIfChanged(this.txt.level, String(this.level));
      }
    },

    paintBanner: function (dt) {
      var lb = this.layoutBox;
      var g = this.bannerG;
      if (!lb || this.phase !== 'play') {
        this.bannerLife = 0;
        this.bannerQueue.length = 0;
        this.bannerT.setVisible(false);
        g.clear();
        return;
      }
      // The coach owns the only transient slot until it fades. The queued
      // event resumes afterward instead of stacking beside it.
      if (this.coachFade > 0.01) {
        this.bannerT.setVisible(false);
        g.clear();
        return;
      }
      if (this.bannerLife <= 0 && this.bannerQueue.length) {
        var next = this.bannerQueue.shift();
        this.bannerText = next.text;
        this.bannerColor = next.color;
        this.bannerLife = this.bannerDur;
      }
      if (this.bannerLife <= 0) {
        if (this.bannerT.visible) { this.bannerT.setVisible(false); g.clear(); }
        return;
      }
      this.bannerLife -= dt;
      var t = 1 - clamp(this.bannerLife / this.bannerDur, 0, 1);
      var inE = motionOn() ? easeOutCubic(clamp(t / 0.18, 0, 1)) : 1;
      var outA = motionOn() && t > 0.76 ? 1 - (t - 0.76) / 0.24 : 1;
      setTextIfChanged(this.bannerT, this.bannerText);
      var bw = clamp(this.bannerT.width + 24, 78, 190);
      var bh = 28;
      var ins = Game.insets || { right: 0 };
      var bx = lb.w - ins.right - 12 - bw / 2;
      var by = lb.hudTop + lb.hudH + 14 + bh / 2;
      g.clear();
      g.fillStyle(0x0b0f1c, 0.82 * outA);
      g.fillRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 10);
      g.lineStyle(1.5, this.bannerColor, 0.85 * outA);
      g.strokeRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 10);
      this.bannerT.setVisible(true).setAlpha(outA)
        .setPosition(bx, by)
        .setScale(motionOn() ? clamp(inE, 0.001, 1) : 1);
      this.bannerT.setColor('#' + ('000000' + this.bannerColor.toString(16)).slice(-6));
    },

    // ---------------------------------------------- board frame reactions
    // The frame itself carries the combo tier and the danger grade. One
    // stroked rounded rect, no new panel, no new text: the board reacts, the
    // HUD does not grow.
    comboTierNow: function () {
      if (this.combo >= 6) return 3;
      if (this.combo >= 3) return 2;
      if (this.combo >= 2 || this.b2b > 0) return 1;
      return 0;
    },

    paintRim: function (dt) {
      var g = this.rimG;
      var lb = this.layoutBox;
      if (!lb) return;
      if (this.comboPulse > 0) this.comboPulse = Math.max(0, this.comboPulse - dt / 420);
      var tier = this.phase === 'play' || this.phase === 'clearing' ? this.comboTierNow() : 0;
      var danger = this.dangerGrade;
      if (!tier && !danger && this.comboPulse <= 0) {
        if (this.rimDrawn) { g.clear(); this.rimDrawn = false; }
        return;
      }
      this.rimDrawn = true;
      var pad = lb.framePad || 14;
      var W = lb.boardW + pad * 2, H = lb.boardH + pad * 2;
      var x = lb.x - pad, y = lb.y - pad;
      // Danger outranks the combo tier: a stack about to top out must never be
      // recoloured by a reward.
      var color, width, alpha;
      if (danger >= 2) {
        color = 0xff3b2e;
        width = 4;
        alpha = 0.55 + (motionOn() ? 0.4 * (0.5 + 0.5 * Math.sin(this.playerClock * 0.014)) : 0.25);
      } else if (danger === 1) {
        color = mixColor(this.identity.frameEdge, 0xff8a3c, 0.7);
        width = 3;
        alpha = 0.55;
      } else {
        var tierColor = [0, 0x8fe6ff, 0xffc861, 0xff8a3c][tier] || this.identity.accent;
        color = mixColor(this.identity.accent, tierColor, 0.7);
        width = 2 + tier;
        alpha = 0.35 + tier * 0.16 + this.comboPulse * 0.3;
      }
      var grow = motionOn() ? this.comboPulse * 4 : 0;
      g.clear();
      g.lineStyle(width, color, clamp(alpha, 0, 1));
      g.strokeRoundedRect(x - grow, y - grow, W + grow * 2, H + grow * 2, 18 + grow);
      if (tier >= 2 || danger >= 2) {
        g.lineStyle(1, color, clamp(alpha * 0.5, 0, 1));
        g.strokeRoundedRect(x - grow - 5, y - grow - 5, W + grow * 2 + 10, H + grow * 2 + 10, 23 + grow);
      }
    },

    paintDanger: function () {
      var d = this.dangerImg;
      var lb = this.layoutBox;
      if (!lb || !this.dangerGrade) {
        if (d.visible) d.setVisible(false);
        return;
      }
      var base = this.dangerGrade >= 2 ? 0.3 : 0.14;
      var pulse = this.dangerGrade >= 2 && motionOn()
        ? 0.10 * (0.5 + 0.5 * Math.sin(this.playerClock * 0.014)) : 0;
      d.setVisible(true)
        .setPosition(lb.x + lb.boardW / 2, lb.y + lb.boardH * 0.35)
        .setDisplaySize(lb.w * 2.2, lb.h * 1.5)
        .setTint(this.dangerGrade >= 2 ? 0xff2a1c : 0xff8a3c)
        .setAlpha(base + pulse);
    },

    // The sky walks its tier as the level climbs, crossfading rather than
    // popping. Two quads at most, and the incoming bake is cached.
    updateSky: function (dt) {
      var lb = this.layoutBox;
      if (!lb) return;
      var want = this.levelSkyTier();
      if (want !== this.skyTier && this.skyFade >= 1) {
        var key = bakeSky(this, Math.ceil(lb.w), Math.ceil(lb.h), this.identity, want);
        this.bgNext.setTexture(key).setDisplaySize(lb.w, lb.h).setAlpha(0).setVisible(true);
        this.skyTier = want;
        this.skyFade = 0;
      }
      if (this.skyFade < 1) {
        this.skyFade = Math.min(1, this.skyFade + dt / (motionOn() ? 900 : 260));
        this.bgNext.setAlpha(easeOutCubic(this.skyFade));
        if (this.skyFade >= 1) {
          var k = this.bgNext.texture && this.bgNext.texture.key;
          if (k) this.bg.setTexture(k).setDisplaySize(lb.w, lb.h);
          this.bgNext.setVisible(false);
        }
      }
    },

    // Cosmetic decays that belong to the view clock, gathered in one place.
    decayView: function (dt) {
      var i;
      // Cells that locked this step get their settle pop seeded here, from the
      // view-side index list the sim handed over. The sim never touches a
      // cellView record itself.
      while (this.lockCells.length) {
        var idx = this.lockCells.pop();
        var vi = (Math.floor(idx / COLS) - HIDDEN) * COLS + (idx % COLS);
        if (vi >= 0 && vi < this.cellView.length) this.cellView[vi].pop = 1;
      }
      if (this.queueAnim > 0) this.queueAnim = Math.max(0, this.queueAnim - dt / 160);
      if (this.holdAnim > 0) this.holdAnim = Math.max(0, this.holdAnim - dt / 220);
      if (this.ultraRamp > 0) this.ultraRamp = Math.max(0, this.ultraRamp - dt / 500);
      for (i = 0; i < this.cellView.length; i++) {
        var rec = this.cellView[i];
        if (rec.pop > 0) rec.pop = Math.max(0, rec.pop - dt / 220);
      }
      var head = this.queue.length ? this.queue[0] : '';
      if (head !== this.lastQueueHead) { this.lastQueueHead = head; this.queueAnim = 1; }
      if (this.hold !== this.lastHoldKind) { this.lastHoldKind = this.hold; this.holdAnim = 1; }
      if (this.garbageFx) {
        this.garbageFx.t += dt;
        if (this.layoutBox && this.garbageFx.t < 40) {
          var lb = this.layoutBox;
          this.fx.dust.setParticleTint(0x8593b5);
          this.fx.dust.emitParticleAt(lb.x + lb.boardW * 0.5,
            lb.y + lb.boardH - 4, fxCount(12));
        }
        if (this.garbageFx.t > 120) this.garbageFx = null;
      }
      if (this.dropFx) {
        this.dropFx.t += dt;
        if (this.dropFx.t < 30 && this.layoutBox && this.dropFx.dist > 1) {
          var lb2 = this.layoutBox;
          this.fx.dust.setParticleTint(colorForKind(this.dropFx.kind));
          this.fx.dust.emitParticleAt(
            lb2.x + (this.dropFx.x + 1) * lb2.cell,
            lb2.y + (this.dropFx.toY - HIDDEN + 1) * lb2.cell,
            fxCount(Math.min(10, 3 + this.dropFx.dist)));
        }
        if (this.dropFx.t > 60) this.dropFx = null;
      }
    },

    paintResult: function (dt) {
      var lb = this.layoutBox;
      var g = this.resultG;
      if (this.resultVisible) this.resultT += (dt || 16.7);
      if (!this.resultVisible) {
        if (g.visible) g.setVisible(false);
        this.resultTitle.setVisible(false);
        this.resultSub.setVisible(false);
        this.resultMedal.setVisible(false);
        for (var i = 0; i < this.resultBtns.length; i++) {
          this.resultBtns[i].label.setVisible(false);
          this.resultBtns[i].zone.setVisible(false);
        }
        return;
      }
      // The ceremony: veil, then the card springs in on ease-out back, then
      // the copy and the buttons fade up, then the score ticks to its total.
      var t = this.resultT;
      var veil = clamp(t / 220, 0, 1);
      var cardU = motionOn() ? clamp((t - 70) / 320, 0, 1) : clamp(t / 160, 0, 1);
      var cardE = cardU <= 0 ? 0 : (motionOn() ? easeOutBack(cardU) : cardU);
      var copyA = clamp((t - 260) / 240, 0, 1);
      var btnA = clamp((t - 380) / 260, 0, 1);

      g.setVisible(true).clear();
      g.fillStyle(0x070a14, 0.82 * veil);
      g.fillRect(0, 0, lb.w, lb.h);
      if (cardE <= 0) {
        this.resultTitle.setVisible(false);
        this.resultSub.setVisible(false);
        this.resultMedal.setVisible(false);
        for (var z = 0; z < this.resultBtns.length; z++) {
          this.resultBtns[z].label.setVisible(false);
        }
        return;
      }
      var cx = lb.w / 2, cy = lb.h * 0.44;
      var cardW = Math.min(330, lb.w * 0.86);
      // Card height is derived from the real content bottom (the last button
      // edge plus padding), so a three-button result never spills out of it.
      var cardH = 202 + Math.max(0, (this.resultRows || 1) - 1) * 52;
      var midY = cy - 96 + cardH / 2;
      var sw = cardW * cardE, sh = cardH * cardE;
      g.fillStyle(0x141b2b, 0.95);
      g.fillRoundedRect(cx - sw / 2, midY - sh / 2, sw, sh, 18 * cardE);
      g.lineStyle(2, this.identity.frameEdge, 0.8);
      g.strokeRoundedRect(cx - sw / 2, midY - sh / 2, sw, sh, 18 * cardE);

      // Score count-up, eased so the last digits settle rather than snap.
      if (this.resultScoreTarget > 0 && this.resultSubFn) {
        var cu = clamp((t - 300) / 700, 0, 1);
        var shown = Math.round(this.resultScoreTarget * easeOutCubic(cu));
        if (shown !== this.resultScoreShown) {
          this.resultScoreShown = shown;
          setTextIfChanged(this.resultSub, this.resultSubFn(shown));
        }
      } else if (this.resultSubFn && !this.resultSubDone) {
        setTextIfChanged(this.resultSub, this.resultSubFn(0));
        this.resultSubDone = true;
      }

      this.resultTitle.setVisible(true).setAlpha(copyA)
        .setScale(motionOn() ? 0.92 + 0.08 * copyA : 1);
      this.resultSub.setVisible(true).setAlpha(copyA);
      if (this.resultMedalWanted) {
        var ma = clamp((t - 430) / 260, 0, 1);
        this.resultMedal.setVisible(true).setAlpha(ma)
          .setDisplaySize(54 * (motionOn() ? easeOutBack(ma) : ma), 54 * (motionOn() ? easeOutBack(ma) : ma));
      }
      var bw = Math.min(260, lb.w * 0.62);
      for (var j = 0; j < this.resultBtns.length; j++) {
        var b = this.resultBtns[j];
        if (!b.fn) continue;
        b.label.setVisible(true).setAlpha(btnA);
        b.zone.setVisible(true);
        g.fillStyle(j === 0 ? 0x3a2a10 : 0x232e56, 0.95 * btnA);
        g.fillRoundedRect(b.label.x - bw / 2, b.label.y - 22, bw, 44, 12);
        g.lineStyle(1.5, j === 0 ? this.identity.accent : 0x6f80c8, 0.9 * btnA);
        g.strokeRoundedRect(b.label.x - bw / 2, b.label.y - 22, bw, 44, 12);
      }
    },

    paintCoach: function (dt) {
      var t = this.txt.coach;
      if (this.coachStep < 0 || this.coachStep >= this.COACH.length || this.phase !== 'play' || this.coachLife <= 0) {
        highlightControls('');
        if (this.coachFade > 0) this.coachFade = Math.max(0, this.coachFade - dt / 180);
        t.setVisible(this.coachFade > 0.01).setAlpha(this.coachFade);
        if (this.coachFade <= 0.01) this.coachG.clear();
        return;
      }
      // A single-line strip pinned to the TOP edge of the play band. It fades
      // out after three seconds and never covers the play area centre.
      this.coachLife = Math.max(0, this.coachLife - dt);
      this.coachFade = this.coachLife < 650 ? this.coachLife / 650 : Math.min(1, this.coachFade + dt / 180);
      highlightControls(this.COACH[this.coachStep].verb);
      setTextIfChanged(t, this.COACH[this.coachStep].text);
      t.setVisible(true).setAlpha(0.92 * this.coachFade);
      var lb = this.layoutBox;
      if (lb) {
        var g = this.coachG;
        g.clear();
        var bw = Math.min(lb.w - 32, t.width + 24), bh = 28;
        var left = (Game.insets && Game.insets.left || 0) + 14;
        var by = lb.hudTop + lb.hudH + 14 + bh / 2;
        t.setPosition(left + 12, by);
        g.fillStyle(0x0b0f1c, 0.62 * this.coachFade);
        g.fillRoundedRect(left, by - bh / 2, bw, bh, bh / 2);
        g.lineStyle(1, this.identity.accent, 0.45 * this.coachFade);
        g.strokeRoundedRect(left, by - bh / 2, bw, bh, bh / 2);
      }
    },

    pollKeyboard: function () {
      var k = this.keyPrev;
      var left = kit.input.keyDown('ArrowLeft') || kit.input.keyDown('KeyA');
      var right = kit.input.keyDown('ArrowRight') || kit.input.keyDown('KeyD');
      var down = kit.input.keyDown('ArrowDown') || kit.input.keyDown('KeyS');
      var rotate = kit.input.keyDown('ArrowUp') || kit.input.keyDown('KeyX') || kit.input.keyDown('KeyW');
      var ccw = kit.input.keyDown('KeyZ');
      var hold = kit.input.keyDown('KeyC') || kit.input.keyDown('ShiftLeft') || kit.input.keyDown('ShiftRight');
      var drop = kit.input.keyDown('Space');
      var enter = kit.input.keyDown('Enter');
      var escape = kit.input.keyDown('Escape');

      if (this.resultVisible) {
        if ((enter && !k.enter) || (drop && !k.drop)) { restartPlay(this.restartArgs()); return; }
        if (escape && !k.escape) { startTitle(); return; }
      } else {
        if (left && !k.left) this.startShift(-1);
        if (right && !k.right) this.startShift(1);
        if (!left && k.left && this.dasDir === -1) this.stopShift();
        if (!right && k.right && this.dasDir === 1) this.stopShift();
        if (rotate && !k.rotate) this.queueAction('cw');
        if (ccw && !k.ccw) this.queueAction('ccw');
        if (hold && !k.hold) this.queueAction('hold');
        if (drop && !k.drop) this.queueAction('drop');
        if (escape && !k.escape) openSettings();
      }
      this.softHeld = down;
      k.left = left; k.right = right; k.down = down; k.rotate = rotate;
      k.ccw = ccw; k.hold = hold; k.drop = drop; k.enter = enter; k.escape = escape;
    },

    pollGamepad: function () {
      var pads = null;
      try { pads = navigator.getGamepads ? navigator.getGamepads() : null; } catch (e) { pads = null; }
      var gp = null;
      for (var i = 0; pads && i < pads.length; i++) {
        if (pads[i] && pads[i].connected) { gp = pads[i]; break; }
      }
      var p = this.gamepadPrev;
      if (!gp) {
        if (p.left && !this.keyPrev.left && this.dasDir === -1) this.stopShift();
        if (p.right && !this.keyPrev.right && this.dasDir === 1) this.stopShift();
        p.left = p.right = p.down = p.rotate = p.hold = p.drop = false;
        return;
      }
      var axis = gp.axes && gp.axes.length ? gp.axes[0] || 0 : 0;
      var left = !!((gp.buttons[14] && gp.buttons[14].pressed) || axis < -0.5);
      var right = !!((gp.buttons[15] && gp.buttons[15].pressed) || axis > 0.5);
      var down = !!(gp.buttons[13] && gp.buttons[13].pressed);
      var rotate = !!(gp.buttons[0] && gp.buttons[0].pressed);
      var hold = !!(gp.buttons[2] && gp.buttons[2].pressed);
      var drop = !!(gp.buttons[1] && gp.buttons[1].pressed);
      if (this.resultVisible) {
        if ((rotate && !p.rotate) || (drop && !p.drop)) { restartPlay(this.restartArgs()); return; }
      } else {
        if (left && !p.left) this.startShift(-1);
        if (right && !p.right) this.startShift(1);
        if (!left && p.left && !this.keyPrev.left && this.dasDir === -1) this.stopShift();
        if (!right && p.right && !this.keyPrev.right && this.dasDir === 1) this.stopShift();
        if (rotate && !p.rotate) this.queueAction('cw');
        if (hold && !p.hold) this.queueAction('hold');
        if (drop && !p.drop) this.queueAction('drop');
      }
      this.softHeld = this.softHeld || down;
      p.left = left; p.right = right; p.down = down; p.rotate = rotate;
      p.hold = hold; p.drop = drop;
    },

    // ------------------------------------------------------------- update
    update: function (time, delta) {
      if (kit.paused) return;
      this.pollKeyboard();
      if (kit.paused) return;
      this.pollGamepad();
      if (kit.paused) return;
      // Defect class 7: the frame delta is clamped and the leftover backlog is
      // DROPPED, never replayed. A slow device runs the sim in slow motion; it
      // never receives a time skip, and no clock here reads wall time.
      var frameDelta = Math.min(delta || 0, 100);
      this.acc += frameDelta;
      var steps = 0;
      while (this.acc >= STEP && steps < MAX_STEPS) {
        this.step(STEP);
        this.acc -= STEP;
        steps++;
      }
      if (steps >= MAX_STEPS && this.acc > STEP) this.acc = 0;

      var j = kit.juice.frame();
      var viewDelta = j.frozen ? 0 : frameDelta;
      this.fx.shard.timeScale = j.frozen ? 0 : 1;
      this.fx.spark.timeScale = j.frozen ? 0 : 1;
      this.fx.reward.timeScale = j.frozen ? 0 : 1;
      this.fx.dust.timeScale = j.frozen ? 0 : 1;
      // cosmetic decays, view side only
      if (this.kickFx > 0) this.kickFx = Math.max(0, this.kickFx - viewDelta / 120);
      if (this.flashLockout > 0) this.flashLockout = Math.max(0, this.flashLockout - viewDelta / 260);
      if (this.lockFx && !j.frozen) {
        this.lockFx.t += viewDelta;
        if (this.lockFx.t < 60 && this.layoutBox) {
          var lbx = this.layoutBox;
          var ly = this.lockFx.y - HIDDEN;
          if (ly >= 0 && ly < VIS_ROWS) {
            this.fx.spark.setParticleTint(colorForKind(this.lockFx.kind));
            this.fx.spark.emitParticleAt(
              lbx.x + this.lockFx.x * lbx.cell + lbx.cell,
              lbx.y + ly * lbx.cell + lbx.cell, fxCount(3));
          }
        }
        if (this.lockFx.t > 80) this.lockFx = null;
      }
      if (this.bombFx && this.layoutBox && !j.frozen) {
        var lb2 = this.layoutBox;
        var by2 = this.bombFx.y - HIDDEN;
        this.fx.shard.setParticleTint(0xffa724);
        this.fx.shard.emitParticleAt(lb2.x + this.bombFx.x * lb2.cell + lb2.cell / 2,
          lb2.y + by2 * lb2.cell + lb2.cell / 2, fxCount(22));
        this.bombFx = null;
      }

      // Cache the colours of the row about to shatter, so the fragment tint
      // survives the grid splice. View record, never a sim field.
      if (this.phase === 'clearing' && this.collapsePivot < 0 && !this.clearColorsT) {
        this.clearColors.length = 0;
        for (var rowIndex = 0; rowIndex < this.clearRows.length; rowIndex++) {
          var colorRow = [];
          var rr = this.clearRows[rowIndex];
          for (var c2 = 0; c2 < COLS; c2++) {
            var v2 = this.grid[rr][c2];
            colorRow[c2] = v2 === CELL_HAZARD ? 0xffa724
              : v2 === CELL_WILD ? 0xd8e2f2 : (FAMILIES[v2 - 1] ? FAMILIES[v2 - 1].color : 0xffffff);
          }
          this.clearColors.push(colorRow);
        }
        this.clearColorsT = 1;
      }
      if (this.phase !== 'clearing') this.clearColorsT = 0;

      this.world.setPosition(motionOn() ? j.dx : 0, motionOn() ? j.dy : 0);

      if (!j.frozen) {
        this.updatePlayerState(viewDelta);
        this.decayView(viewDelta);
        this.updateSky(viewDelta);
        this.paintCells(false);
        this.paintPlayerState();
        this.paintBeams();
        this.paintSweep(viewDelta);
        this.paintRings(viewDelta);
        this.paintRail();
        this.paintRival();
        this.paintGarbage();
        this.paintRim(viewDelta);
        this.paintDanger();
        this.paintHud();
        this.paintBanner(viewDelta);
        this.paintCoach(viewDelta);
      }
      this.paintResult(viewDelta);
      this.syncDebug();
    },

    // Defect class 1: the harness reads a preallocated debug matrix that is a
    // COPY of the sim grid. It is never the sim array, so a harness read can
    // never truncate or mutate live state.
    syncDebug: function () {
      var d = SL_DEBUG_STATE;
      d.mode = this.mode;
      d.boardId = this.puzzle ? this.puzzle.id : (this.mode === 'master' ? 'master' : this.mode);
      d.boardName = this.puzzle ? this.puzzle.name : this.identity.sub;
      d.phase = this.phase;
      d.score = this.score;
      d.level = this.level;
      d.lines = this.lines;
      d.goal = this.goal;
      d.cleared = this.cleared;
      d.hazards = Math.max(0, this.hazardCount);
      d.combo = this.combo;
      d.bestCombo = this.bestCombo;
      d.b2b = this.b2b;
      d.elapsedMs = Math.round(this.simTime);
      d.holdKind = this.hold || '';
      d.holdLocked = this.holdUsed >= this.holdMax;
      d.reducedMotion = !motionOn();
      d.pickups.wild = this.pickups.wild;
      d.pickups.bomb = this.pickups.bomb;
      d.timeLeftMs = Math.round(Math.max(0, this.timeLeft));
      d.danger = this.dangerGrade;
      d.incoming = this.pendingGarbage;
      d.spins = this.spinCount;
      d.quads = this.quadCount;
      d.perfects = this.perfectCount;
      d.tier = this.tierIndex;
      d.rival.lines = this.rival ? this.rival.lines : 0;
      d.rival.height = this.rival ? this.rival.height : 0;
      d.rival.dead = this.rival ? !!this.rival.dead : false;
      d.rival.pending = this.rival ? this.rival.pending : 0;
      for (var rm = 0; rm < RECORD_MODES.length; rm++) {
        var src2 = (profile.records && profile.records[RECORD_MODES[rm]]) || [];
        var dst2 = d.records[RECORD_MODES[rm]];
        dst2.length = 0;
        for (var rq = 0; rq < src2.length; rq++) dst2.push(src2[rq]);
      }
      d.unlockedPuzzles = unlockedCount();
      d.medals.marathon = profile.marathonMedal || '';
      d.medals.sprint = profile.sprintMedal || '';
      d.medals.master = !!profile.masterDone;
      d.best.score = profile.bestScore || 0;
      d.best.lines = profile.bestLines || 0;
      d.best.sprintMs = profile.bestSprint || 0;
      d.queue.length = 0;
      for (var q = 0; q < Math.min(5, this.queue.length); q++) d.queue.push(this.queue[q]);
      for (var r = 0; r < VIS_ROWS; r++) {
        var src = this.grid[r + HIDDEN];
        var dst = d.board[r];
        for (var c = 0; c < COLS; c++) dst[c] = src[c];
      }
    },

    // ================================================================ input
    bindInput: function () {
      var self = this;
      // Phaser supplies the board event edge; GGKit owns pointer identity and
      // the authoritative start coordinates. A map keeps multitouch gestures
      // independent and makes cancellation explicit.
      this.input.on('pointerdown', function (p) {
        if (self.resultVisible || kit.paused) return;
        if (self.gestures.size >= 4) return;
        var kp = kit.input.pointers.get(p.id);
        var sx = kp ? kp.startX : p.x, sy = kp ? kp.startY : p.y;
        self.gestures.set(p.id, { id: p.id, x: sx, y: sy });
        self.setPlayerState('preview', 0);
        self.previewX = self.piece.x;
        self.previewValid = true;
      });
      this.input.on('pointermove', function (p) {
        var gsx = self.gestures.get(p.id);
        if (!gsx || !self.piece.alive) return;
        var dx = p.x - gsx.x;
        if (Math.abs(dx) > 24 && Math.abs(dx) > Math.abs(p.y - gsx.y)) {
          self.previewX = clamp(self.piece.x + (dx < 0 ? -1 : 1), -4, COLS - 1);
          self.previewValid = !self.collides(self.piece.kind, self.piece.rot, self.previewX, self.piece.y);
        }
        self.setPlayerState('preview', 0);
      });
      this.input.on('pointerup', function (p) {
        var gsx = self.gestures.get(p.id);
        if (!gsx) return;
        self.gestures.delete(p.id);
        if (self.resultVisible || kit.paused) return;
        var lb = self.layoutBox;
        if (!lb) return;
        // ignore anything that started outside the board
        if (gsx.x < lb.x - 12 || gsx.x > lb.x + lb.boardW + 12 ||
            gsx.y < lb.y - 12 || gsx.y > lb.y + lb.boardH + 12) return;
        var dx = p.x - gsx.x, dy = p.y - gsx.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 26 && dy < -26 && Math.abs(dy) > Math.abs(dx)) { self.queueAction('hold'); return; }
        if (dist > 26 && dy > 26 && Math.abs(dy) > Math.abs(dx)) { self.queueAction('drop'); return; }
        if (Math.abs(dx) > 24) { self.tryMove(dx < 0 ? -1 : 1); return; }
        // a tap: on the piece rotates, otherwise shifts toward the tapped side
        if (self.pieceAt(p.x, p.y)) self.queueAction('cw');
        else self.tryMove(p.x < lb.x + lb.boardW / 2 ? -1 : 1);
      });
      this.input.on('pointercancel', function (p) {
        self.gestures.delete(p.id);
        if (!self.gestures.size && self.playerState === 'preview') self.setPlayerState('ready', 0);
      });
    },

    unbindInput: function () {
      this.input.removeAllListeners('pointerdown');
      this.input.removeAllListeners('pointermove');
      this.input.removeAllListeners('pointerup');
      this.input.removeAllListeners('pointercancel');
    },

    releaseInputs: function () {
      this.dasDir = 0;
      this.softHeld = false;
      this.gestures.clear();
      this.actions.length = 0;
      for (var k in this.keyPrev) this.keyPrev[k] = false;
      for (var g in this.gamepadPrev) this.gamepadPrev[g] = false;
      if (this.playerState === 'preview') this.setPlayerState('ready', 0);
    },

    pieceAt: function (sx, sy) {
      var lb = this.layoutBox;
      if (!lb || !this.piece.alive) return false;
      var col = Math.floor((sx - lb.x) / lb.cell);
      var row = Math.floor((sy - lb.y) / lb.cell) + HIDDEN;
      var m = shapeOf(this.piece.kind, this.piece.rot);
      var py = row - this.piece.y, px = col - this.piece.x;
      return py >= 0 && py < m.length && px >= 0 && px < m[py].length && !!m[py][px];
    },

    startShift: function (dir) {
      if (this.dasDir === dir) return;
      this.dasDir = dir;
      this.dasTimer = 0;
      this.dasNext = 150;   // DAS delay, then 55ms auto-repeat
      this.tryMove(dir);
    },
    stopShift: function () { this.dasDir = 0; this.dasTimer = 0; },

    onControl: function (id, down) {
      if (kit.paused) return;
      if (this.resultVisible) {
        if (down && id === 'drop') restartPlay(this.restartArgs());
        return;
      }
      if (id === 'left') { if (down) this.startShift(-1); else if (this.dasDir === -1) this.stopShift(); return; }
      if (id === 'right') { if (down) this.startShift(1); else if (this.dasDir === 1) this.stopShift(); return; }
      if (!down) return;
      if (id === 'rotate') this.queueAction('cw');
      else if (id === 'hold') this.queueAction('hold');
      else if (id === 'drop') this.queueAction('drop');
      this.setPlayerState('preview', 0);
    }
  };

  function rankOf(mode, key) {
    var list = medalList(mode);
    for (var i = 0; i < list.length; i++) if (list[i].key === key) return i + 1;
    return 0;
  }

  // ================================================================== boot
  // Defect class 5: Phaser only wires preload/create/update from a plain
  // config object, so each scene literal is promoted to a real Scene subclass
  // with its whole method set on the prototype.
  function toScene(cfg) {
    var Klass = function () { Phaser.Scene.call(this, { key: cfg.key }); };
    Klass.prototype = Object.create(Phaser.Scene.prototype);
    Klass.prototype.constructor = Klass;
    for (var k in cfg) {
      if (k === 'key') continue;
      Klass.prototype[k] = cfg[k];
    }
    return Klass;
  }

  Game.phaser = new Phaser.Game({
    type: Phaser.AUTO,
    parent: document.body,
    backgroundColor: '#0b1020',
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: window.innerWidth,
      height: window.innerHeight
    },
    render: {
      antialias: true, antialiasGL: false, powerPreference: 'high-performance',
      roundPixels: false, batchSize: 4096
    },
    fps: { target: 60, min: 30 },
    // Defect class 4: one camera, one world container. No camera split is
    // used anywhere, so there is no second camera to forget to create.
    scene: [toScene(BootScene), toScene(TitleScene), toScene(PlayScene)]
  });

  kit.registerPWA();
  window.__STACKLOCK_READY = true;
})();
