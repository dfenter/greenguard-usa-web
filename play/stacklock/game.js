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

  // Flash, then shatter, then collapse. The flash is long enough to READ as a
  // beat on a 60 Hz phone without stalling the next piece.
  var CLEAR_FLASH = 130;
  var CLEAR_SHATTER = 160;
  var CLEAR_COLLAPSE = 140;
  var CLEAR_TOTAL = CLEAR_FLASH + CLEAR_SHATTER + CLEAR_COLLAPSE;

  var SCORE_BASE = [0, 100, 300, 500, 800];
  var MAX_SCORE = 99999999;
  var SAVE_VERSION = 1;

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
    var f = FAMILIES[v - 1];
    return (f && f.frame) || FALLBACK_FAMILY.frame;
  }
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
  var SAVE_KEYS = ['v', 'bestScore', 'bestLines', 'bestSprint', 'marathonMedal',
    'sprintMedal', 'puzzleDone', 'puzzleBest', 'masterDone', 'tut', 'motionSet',
    'motionEnabled', 'textScale'];

  function defaultSave() {
    return {
      v: SAVE_VERSION,
      bestScore: 0, bestLines: 0, bestSprint: 0,
      marathonMedal: '', sprintMedal: '',
      puzzleDone: [], puzzleBest: 0,
      masterDone: false, tut: false, motionSet: false, motionEnabled: true,
      textScale: 0
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
  function validateSave(o) {
    if (!o || typeof o !== 'object' || o.v !== SAVE_VERSION) return false;
    for (var k in o) {
      if (Object.prototype.hasOwnProperty.call(o, k) && SAVE_KEYS.indexOf(k) < 0) return false;
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
      restartPlay(startArgs(mode || SL_DEBUG_STATE.mode, boardId || ''));
      return true;
    }
    if (Game.title && Game.title.scene && Game.title.scene.isActive()) {
      startPlay(startArgs(mode || SL_DEBUG_STATE.mode, boardId || ''));
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
    validateSave: validateSave,
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

  var profile = kit.save.get(null);
  if (!profile) profile = defaultSave();
  function persist() { kit.save.set(profile); }
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

  function startPlay(args) {
    kit.input.clearAll();
    if (Game.play) Game.play.releaseInputs();
    if (Game.title) Game.title.scene.start('play', args);
  }
  function startTitle() {
    kit.input.clearAll();
    if (Game.play) Game.play.releaseInputs();
    if (Game.play) Game.play.scene.start('title');
  }
  function restartPlay(args) {
    restartOverride = args || null;
    kit.restart();
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
  function bakeSky(scene, rawW, rawH, id) {
    // Quantise the bake size so a drag-resize or an address-bar reflow cannot
    // mint a new full-screen canvas texture on every frame.
    var w = Math.ceil(rawW / 32) * 32;
    var h = Math.ceil(rawH / 32) * 32;
    var key = 'sky_' + id.id + '_' + w + 'x' + h;
    if (scene.textures.exists(key)) return key;
    var tex = scene.textures.createCanvas(key, w, h);
    var ctx = tex.getContext();
    var g = ctx.createLinearGradient(0, 0, w * 0.35, h);
    var stops = id.sky || FALLBACK_IDENTITY.sky;
    for (var i = 0; i < stops.length; i++) g.addColorStop(i / (stops.length - 1), stops[i]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // corner vignette + a quiet diagonal rhythm, both baked
    var rad = ctx.createRadialGradient(w * 0.5, h * 0.18, 0, w * 0.5, h * 0.18, Math.max(w, h) * 0.9);
    rad.addColorStop(0, 'rgba(255,255,255,0.07)');
    rad.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = rad;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = id.grain != null ? id.grain : 0.1;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    for (var x = -h; x < w; x += 26) {
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.lineTo(x + h, 0);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    tex.refresh();
    scene.skyKeys = scene.skyKeys || [];
    scene.skyKeys.push(key);
    while (scene.skyKeys.length > 4) {
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

      this.page = 0;              // 0 = modes, 1 = puzzle board grid
      this.nodes = [];
      this.focusIndex = 0;
      this.keyPrev = { up: false, down: false, left: false, right: false, enter: false, escape: false };
      this.layout();
      this.scale.on('resize', this.layout, this);
      this.events.once('shutdown', function () {
        self.scale.off('resize', self.layout, self);
        Game.title = null;
      });
    },

    update: function () {
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

      if (this.page === 0) {
        if (upEdge || leftEdge) this.focusIndex = Math.max(0, this.focusIndex - 1);
        if (downEdge || rightEdge) this.focusIndex = Math.min(5, this.focusIndex + 1);
        if (enterEdge) this.activateFocus();
      } else {
        if (escapeEdge) { this.page = 0; this.focusIndex = 0; this.layout(); return; }
        var col = this.focusIndex % 4;
        var row = Math.floor(this.focusIndex / 4);
        if (leftEdge) col = Math.max(0, col - 1);
        if (rightEdge) col = Math.min(3, col + 1);
        if (upEdge) row = Math.max(0, row - 1);
        if (downEdge) row = Math.min(5, row + 1);
        this.focusIndex = Math.min(PUZZLES.length, row * 4 + col);
        if (enterEdge) this.activateFocus();
      }
      this.updateFocus();
    },

    activateFocus: function () {
      var self = this;
      if (this.page === 0) {
        var modes = ['marathon', 'sprint', 'puzzle', 'master'];
        if (this.focusIndex < 4) {
          var mode = modes[this.focusIndex];
          if (mode === 'master' && !this.masterUnlocked()) return;
          if (mode === 'puzzle') { this.page = 1; this.focusIndex = 0; this.layout(); return; }
          startPlay(startArgs(mode, ''));
        } else if (this.focusIndex === 4) {
          openSettings();
        } else if (this.focusIndex === 5) {
          self.showHelp();
        }
        return;
      }
      if (this.focusIndex < unlockedCount()) {
        startPlay({ mode: 'puzzle', puzzleIndex: this.focusIndex });
      }
    },

    clearNodes: function () {
      for (var i = 0; i < this.nodes.length; i++) this.nodes[i].destroy();
      this.nodes.length = 0;
    },

    layout: function () {
      var w = this.scale.gameSize.width;
      var h = this.scale.gameSize.height;
      Game.insets = readInsets();
      this.clearNodes();
      var ins = Game.insets;
      var key = bakeSky(this, Math.ceil(w), Math.ceil(h), identity('marathon'));
      var bg = this.add.image(0, 0, key).setOrigin(0, 0).setDepth(0);
      this.nodes.push(bg);
      if (this.page === 0) this.buildModes(w, h, ins);
      else this.buildPuzzleGrid(w, h, ins);
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

    buildModes: function (w, h, ins) {
      var self = this;
      this.focusRects = [];
      var pad = 16 + ins.left;
      var cw = w - pad * 2;
      var top = ins.top + 18;

      var logo = this.add.image(w / 2, top + 44, 'logo').setDepth(3);
      logo.setScale(Math.min(1, (cw * 0.82) / logo.width));
      this.nodes.push(logo);
      this.label(w / 2, top + 96, 'STACKLOCK', 30, CSS.text, '800', 0.5);
      this.label(w / 2, top + 124, 'Stack it. Lock it. Clear it.', 14, CSS.dim, '600', 0.5);

      var y = top + 150;
      var modes = ['marathon', 'sprint', 'puzzle', 'master'];
      var ch = clamp((h - y - 96 - ins.bottom) / 4, 78, 132);
      for (var i = 0; i < modes.length; i++) {
        (function (mode, yy) {
          var id = identity(mode);
          var locked = (mode === 'master') && !self.masterUnlocked();
          var h0 = ch - 10;
          self.focusRects.push({ x: pad, y: yy, w: cw, h: h0 });
          self.card(pad, yy, cw, h0, locked ? 0x39415e : id.frameEdge, locked ? 0.5 : 0.85);
          self.label(pad + 16, yy + h0 * 0.24, id.name, 19, locked ? CSS.dim : CSS.text, '800');
          self.label(pad + 16, yy + h0 * 0.44, id.sub, 12, '#ffc861', '700');
          var blurb = locked
            ? 'Clear Puzzle board 20 and reach Marathon level 10 to unlock.'
            : id.blurb;
          var bt = self.label(pad + 16, yy + h0 * 0.68, blurb, 12, CSS.dim, '500');
          bt.setWordWrapWidth(cw - 120);
          bt.setOrigin(0, 0.5);

          var stat = self.modeStat(mode);
          if (stat.text) self.label(pad + cw - 16, yy + h0 * 0.24, stat.text, 13, stat.color, '750', 1);
          if (stat.medal) {
            var m = self.add.image(pad + cw - 34, yy + h0 * 0.55, 'atlas', stat.medal)
              .setDepth(3).setDisplaySize(30, 30);
            self.nodes.push(m);
          }
          if (!locked) {
            self.hit(pad, yy, cw, ch - 10, function () {
              if (mode === 'puzzle') { self.page = 1; self.focusIndex = 0; self.layout(); return; }
              startPlay(startArgs(mode, ''));
            });
          }
        })(modes[i], y + i * ch);
      }

      var by = h - ins.bottom - 58;
      this.card(pad, by, cw * 0.48, 44, 0x3d4a78, 0.8);
      this.label(pad + cw * 0.24, by + 22, 'SETTINGS', 14, CSS.text, '750', 0.5);
      this.hit(pad, by, cw * 0.48, 44, function () { openSettings(); });

      this.card(pad + cw * 0.52, by, cw * 0.48, 44, 0x3d4a78, 0.8);
      this.label(pad + cw * 0.76, by + 22, 'HOW TO PLAY', 14, CSS.text, '750', 0.5);
      this.hit(pad + cw * 0.52, by, cw * 0.48, 44, function () { self.showHelp(); });
      this.focusRects.push({ x: pad, y: by, w: cw * 0.48, h: 44 });
      this.focusRects.push({ x: pad + cw * 0.52, y: by, w: cw * 0.48, h: 44 });
      this.focusG = this.add.graphics().setDepth(8);
      this.nodes.push(this.focusG);
      this.updateFocus();
    },

    modeStat: function (mode) {
      if (mode === 'marathon') {
        return {
          text: profile.bestScore ? String(profile.bestScore) : '',
          color: CSS.amber, medal: medalFrame('marathon', profile.marathonMedal)
        };
      }
      if (mode === 'sprint') {
        return {
          text: profile.bestSprint ? formatTime(profile.bestSprint) : '',
          color: '#8fe6ff', medal: medalFrame('sprint', profile.sprintMedal)
        };
      }
      if (mode === 'puzzle') {
        return {
          text: (profile.puzzleDone.length || 0) + ' / ' + PUZZLES.length,
          color: '#ffc861', medal: ''
        };
      }
      return { text: profile.masterDone ? 'CLEARED' : '', color: '#ff8a3c', medal: profile.masterDone ? 'medal_master' : '' };
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

      var cols = 4;
      var gap = 8;
      var size = Math.floor((cw - gap * (cols - 1)) / cols);
      var gy = top + 62;
      var unlocked = unlockedCount();
      SL_DEBUG_STATE.unlockedPuzzles = unlocked;
      for (var i = 0; i < PUZZLES.length; i++) {
        (function (i) {
          var p = PUZZLES[i];
          var x = pad + (i % cols) * (size + gap);
          var y = gy + Math.floor(i / cols) * (size + gap);
          self.focusRects.push({ x: x, y: y, w: size, h: size });
          var done = profile.puzzleDone.indexOf(p.id) >= 0;
          var open = i < unlocked;
          self.card(x, y, size, size, done ? 0xffc861 : (open ? 0x6f80c8 : 0x39415e),
            open ? 0.86 : 0.45);
          self.label(x + size / 2, y + size * 0.36, done ? '✓' : (open ? String(i + 1) : '■'),
            done ? 24 : 20, done ? '#ffc861' : (open ? CSS.text : '#5b6588'), '800', 0.5);
          var nm = self.label(x + size / 2, y + size * 0.72, open ? p.name : 'Locked', 12,
            open ? CSS.dim : '#5b6588', '650', 0.5);
          nm.setWordWrapWidth(size - 8);
          nm.setAlign('center');
          nm.setOrigin(0.5, 0.5);
          if (open) {
            self.hit(x, y, size, size, function () {
              startPlay({ mode: 'puzzle', puzzleIndex: i });
            });
          }
        })(i);
      }

      var by = h - ins.bottom - 58;
      this.card(pad, by, cw, 44, 0x3d4a78, 0.8);
      this.label(pad + cw / 2, by + 22, 'BACK', 14, CSS.text, '750', 0.5);
      this.hit(pad, by, cw, 44, function () { self.page = 0; self.layout(); });
      this.focusRects.push({ x: pad, y: by, w: cw, h: 44 });
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
      this.identity = identity(this.mode);
    },

    restartArgs: function () {
      return { mode: this.mode, puzzleIndex: this.puzzleIndex };
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
      var m = shapeOf(kind, rot);
      for (var y = 0; y < m.length; y++) {
        for (var x = 0; x < m[y].length; x++) {
          if (!m[y][x]) continue;
          var nx = px + x, ny = py + y;
          if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
          if (ny >= 0 && this.grid[ny][nx]) return true;
        }
      }
      return false;
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
      this.dropDist = dist;
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
        this.gravAcc = 0;
        sfx('sfx_soft', { volume: 0.3 });
      }
    },

    lockPiece: function (hard) {
      var m = shapeOf(this.piece.kind, this.piece.rot);
      var kind = this.piece.kind;
      var cx = this.piece.x, cy = this.piece.y;
      var y, x;

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
      sfx(hard ? 'sfx_lock' : 'sfx_lock', { volume: hard ? 1 : 0.75 });
      this.lockFx = { x: cx, y: cy, t: 0, kind: kind };
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
      var base = SCORE_BASE[Math.min(n, 4)] * this.level;
      if (quad && this.b2b > 0) base = Math.round(base * 1.5);
      if (quad) this.b2b++; else if (n > 0) this.b2b = 0;
      var comboBonus = this.combo > 1 ? 50 * (this.combo - 1) * this.level : 0;
      this.score = Math.min(MAX_SCORE, this.score + base + comboBonus);
      this.lines += n;
      this.cleared += n;
      this.lastClear = { n: n, quad: quad, combo: this.combo, b2b: this.b2b };

      sfx(quad ? 'sfx_quad' : ('sfx_clear' + Math.min(3, n)));
      if (this.combo >= 2) sfx('sfx_combo', { volume: Math.min(1, 0.5 + this.combo * 0.1) });
      // The last few Sprint lines get a countdown tick over the clear cue.
      if (this.mode === 'sprint' && this.lines >= 36) sfx('sfx_tick', { volume: 0.8 });
      this.coachHit('clear');

      if (motionOn()) {
        if (quad) { kit.juice.shake(11, 260); kit.juice.hitStop(70); }
        else if (this.combo >= 2) kit.juice.shake(4, 150);
      }
      if (quad && this.layoutBox) {
        this.ring(this.layoutBox.x + this.layoutBox.boardW * 0.5,
          this.layoutBox.y + (rows[rows.length - 1] - HIDDEN) * this.layoutBox.cell,
          this.layoutBox.boardW * 1.4);
      }
      this.banner(quad ? (this.b2b > 1 ? 'B2B QUAD' : 'QUAD') :
        (this.combo >= 3 ? 'COMBO x' + this.combo : ''), quad ? this.identity.accent : 0x8fe6ff);

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
      } else if (this.mode === 'master' && won) {
        if (!profile.masterDone) { profile.masterDone = true; changed = true; }
      }
      if (!profile.tut && this.coachDone) { profile.tut = true; changed = true; }
      if (changed) persist();
    },

    // ---------------------------------------------------------- stepping
    step: function (dt) {
      if (this.mode === 'sprint' && this.phase === 'clearing') this.simTime += dt;
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

      // View-side render records. Defect class 2: none of this lives on a sim
      // object, and the renderer is never handed a sim entity.
      this.cellView = [];
      for (i = 0; i < VIS_ROWS * COLS; i++) this.cellView.push({ v: 0, pop: 0 });

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

    rewardBurst: function () {
      if (!this.layoutBox) return;
      var lb = this.layoutBox;
      this.fx.reward.setParticleTint(this.identity.accent);
      this.fx.reward.emitParticleAt(lb.x + lb.boardW * 0.5, lb.y + lb.boardH * 0.42,
        fxCount(motionOn() ? 46 : 12));
      this.ring(lb.x + lb.boardW * 0.5, lb.y + lb.boardH * 0.42, lb.boardW * 1.15);
    },

    ring: function (x, y, size) {
      for (var i = 0; i < this.ringPool.length; i++) {
        var r = this.ringPool[i];
        if (r.life > 0) continue;
        r.life = 520;
        r.t = 0;
        r.size = size;
        r.img.setVisible(true).setPosition(x, y).setTint(this.identity.accent)
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
      setTextIfChanged(this.resultTitle, this.result || (won ? 'CLEAR' : 'GAME OVER'));
      this.resultTitle.setColor(won ? '#ffc861' : '#f25c68');
      var sub = '';
      if (this.mode === 'sprint') {
        sub = won ? formatTime(this.simTime) + '  -  40 lines'
          : this.lines + ' of 40 lines';
      } else if (this.mode === 'puzzle') {
        sub = this.cleared + ' of ' + this.goal + ' lines cleared';
      } else if (this.mode === 'master') {
        sub = won ? 'Every hazard removed' : this.hazardCount + ' hazard blocks left';
      } else {
        sub = this.score.toLocaleString() + ' points  -  level ' + this.level +
          '  -  ' + this.lines + ' lines';
      }
      setTextIfChanged(this.resultSub, sub);
      var mf = medalFrame(this.mode, this.medal);
      if (!mf && won && this.mode === 'master') mf = 'medal_master';
      if (!mf && won && this.mode === 'puzzle') mf = 'medal_gold';
      this.resultMedal.setVisible(!!mf);
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

      var key = bakeSky(this, Math.ceil(w), Math.ceil(h), this.identity);
      this.bg.setTexture(key).setDisplaySize(w, h);

      var hudH = 74;
      var ctrlH = CTRL_H + ins.bottom;
      var coachH = 32;
      var top = ins.top + 6;
      var availH = h - top - hudH - coachH - ctrlH - 10;
      var railW = clamp(w * 0.26, 78, 116);
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
      var y = Math.round(top + hudH + coachH + Math.max(0, (availH - boardH) / 2));

      this.layoutBox = {
        x: x, y: y, cell: cell, boardW: boardW, boardH: boardH,
        framePad: framePad, railGap: railGap,
        railX: x + boardW + framePad + railGap, railW: railW,
        w: w, h: h, hudTop: top, hudH: hudH
      };
      this.glow.setPosition(x + boardW / 2, y + boardH * 0.55)
        .setDisplaySize(boardW * 2.1, boardH * 1.3)
        .setTint(this.identity.accent);
      this.drawFrame();
      this.layoutHud();
      this.applyTextScale();
      this.layoutResult();
      this.paintCells(true);
    },

    bakeKey: function (kind) {
      var lb = this.layoutBox;
      return 'sl_' + kind + '_' + this.identity.id + '_' + lb.w + 'x' + lb.h + '_' +
        lb.cell + '_' + lb.x + '_' + lb.y + '_' + Math.round(lb.railW);
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
        var holdH = Math.min(lb.boardH * 0.20, 96);
        var nextH = Math.min(lb.boardH * 0.46, 232);
        panel(lb.railX, lb.y, lb.railW, holdH, 12, id.frameEdge, 0.5);
        panel(lb.railX, lb.y + holdH + 10, lb.railW, nextH, 12, id.frameEdge, 0.5);
        panel(lb.railX, lb.y + lb.boardH - 52, lb.railW, 46, 10, id.accent, 0.55);
        tex.refresh();
      }
      this.keepBake(key);
      this.chromeImg.setTexture(key).setPosition(0, 0).setDisplaySize(lb.w, lb.h);
      this.railHoldH = Math.min(lb.boardH * 0.20, 96);
      this.railNextH = Math.min(lb.boardH * 0.46, 232);
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
      this.txt.nextLabel.setPosition(lb.railX + 6, lb.y + lb.boardH * 0.24 + 6);
      // The coach strip sits in the gap ABOVE the board frame. It never covers
      // a cell, the play area centre or the lower half of the screen.
      this.txt.coach.setPosition(ins.left + 26, lb.hudTop + lb.hudH + 14).setOrigin(0, 0.5);
      this.txt.coach.setWordWrapWidth(lb.w - 32);
      this.txt.coach.setAlign('left');
    },

    applyTextScale: function () {
      var names = ['mode', 'metricLabel', 'metric', 'secondLabel', 'second', 'level',
        'levelLabel', 'holdLabel', 'nextLabel', 'coach', 'pause'];
      var sizes = [14, 14, 24, 14, 16, 20, 14, 16, 18, 14, 22];
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
          sp.setDisplaySize(lb.cell, lb.cell);
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
              this.ghostPool[gi].setVisible(true)
                .setPosition(bx, lb.y + grow * lb.cell + lb.cell / 2)
                .setDisplaySize(lb.cell, lb.cell).setTint(tintc).setAlpha(0.5);
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

    paintRail: function () {
      var lb = this.layoutBox;
      var holdH = this.railHoldH, nextH = this.railNextH;
      var nx = lb.railX, ny = lb.y;
      var ny2 = ny + holdH + 10;
      // The bottom rail panel is a calm progress ring instead of another
      // counter. It is the only live shape on the rail, so it is the only one
      // still in a Graphics.
      var g = this.ringG;
      var chipY = ny + lb.boardH - 52;
      var cx = nx + lb.railW / 2, cy = chipY + 23, rad = 15;
      var frac = 0;
      if (this.mode === 'sprint') frac = this.lines / 40;
      else if (this.mode === 'puzzle') frac = this.goal ? this.cleared / this.goal : 0;
      else if (this.mode === 'master') {
        frac = this.initialHazards ? (this.initialHazards - this.hazardCount) / this.initialHazards : 0;
      } else frac = (this.lines % 10) / 10;
      frac = clamp(frac, 0, 1);
      if (this.ringFrac !== frac || this.ringCx !== cx || this.ringCy !== cy) {
        this.ringFrac = frac; this.ringCx = cx; this.ringCy = cy;
        g.clear();
        g.lineStyle(4, 0x2a3a52, 1);
        g.beginPath(); g.arc(cx, cy, rad, 0, Math.PI * 2); g.strokePath();
        g.lineStyle(4, this.identity.accent, 1);
        g.beginPath();
        g.arc(cx, cy, rad, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
        g.strokePath();
      }

      var pi = 0;
      // hold slot
      if (this.hold) pi = this.paintMini(this.hold, nx + lb.railW / 2, ny + holdH * 0.62,
        Math.min(13, lb.railW / 7.2), pi);
      // next three
      for (var i = 0; i < 3 && i < this.queue.length; i++) {
        pi = this.paintMini(this.queue[i], nx + lb.railW / 2,
          ny2 + 30 + i * Math.min(64, nextH / 3.3), Math.min(11, lb.railW / 8.6), pi);
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

    paintMini: function (kind, cx, cy, cell, pi) {
      var m = shapeOf(kind, 0);
      var wCells = m[0].length, hCells = m.length;
      var ox = cx - wCells * cell / 2, oy = cy - hCells * cell / 2;
      var frame = frameForKind(kind);
      for (var y = 0; y < hCells; y++) {
        for (var x = 0; x < wCells; x++) {
          if (!m[y][x] || pi >= this.railPool.length) continue;
          var s = this.railPool[pi++];
          s.setVisible(true).setFrame(frame)
            .setPosition(ox + x * cell + cell / 2, oy + y * cell + cell / 2)
            .setDisplaySize(cell, cell).setAlpha(0.98);
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

    paintResult: function () {
      var lb = this.layoutBox;
      var g = this.resultG;
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
      g.setVisible(true).clear();
      g.fillStyle(0x070a14, 0.82);
      g.fillRect(0, 0, lb.w, lb.h);
      var cx = lb.w / 2, cy = lb.h * 0.44;
      var cardW = Math.min(330, lb.w * 0.86);
      g.fillStyle(0x141b2b, 0.95);
      // Card height is derived from the real content bottom (the last button
      // edge plus padding), so a three-button result never spills out of it.
      var cardH = 202 + Math.max(0, (this.resultRows || 1) - 1) * 52;
      g.fillRoundedRect(cx - cardW / 2, cy - 96, cardW, cardH, 18);
      g.lineStyle(2, this.identity.frameEdge, 0.8);
      g.strokeRoundedRect(cx - cardW / 2, cy - 96, cardW, cardH, 18);
      this.resultTitle.setVisible(true);
      this.resultSub.setVisible(true);
      var bw = Math.min(260, lb.w * 0.62);
      for (var j = 0; j < this.resultBtns.length; j++) {
        var b = this.resultBtns[j];
        if (!b.fn) continue;
        b.label.setVisible(true);
        b.zone.setVisible(true);
        g.fillStyle(j === 0 ? 0x3a2a10 : 0x232e56, 0.95);
        g.fillRoundedRect(b.label.x - bw / 2, b.label.y - 22, bw, 44, 12);
        g.lineStyle(1.5, j === 0 ? this.identity.accent : 0x6f80c8, 0.9);
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
        this.paintCells(false);
        this.paintPlayerState();
        this.paintBeams();
        this.paintRings(viewDelta);
        this.paintRail();
        this.paintHud();
        this.paintBanner(viewDelta);
        this.paintCoach(viewDelta);
      }
      this.paintResult();
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
