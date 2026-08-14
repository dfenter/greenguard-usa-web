/* Chroma Tap - authored content: palette, level packs, level table, medals.
 * Pure data + pure helpers. No engine, no DOM, no globals beyond window.CTData.
 * Every keyed lookup in here has a guarded fallback (defect class: FAMILY[variant]
 * miss hard-froze a shipped title).
 */
(function (g) {
  'use strict';

  /* ------------------------------------------------------------------ board tokens
   * Values follow play/_assets/ART_puzzlepop.md (Puzzle Pop lane, Rev 1).
   */
  var TOKENS = {
    ink: '#182238',
    board: '#243453',
    cell: '#314567',
    cellEdge: '#5D7294',
    highlight: '#F7FBFF',
    paper: '#FFF8EE',
    brass: '#F3BC50',
    shadow: '#0d1426'
  };
  var COLS = 7, ROWS = 8;

  /* Six tile families. Triple-coded: silhouette + value + centred glyph.
   * Glyphs are always Ink on the face; every face clears 4.5:1 against Ink.
   */
  var FAMILIES = [
    { key: 'seed',  name: 'Seed',   face: '#F25C68', edge: '#FF8A92', deep: '#B4323F', shape: 'round',   glyph: 'circle' },
    { key: 'sun',   name: 'Sun',    face: '#F7C948', edge: '#FFE9A3', deep: '#B7902A', shape: 'cut',     glyph: 'star4' },
    { key: 'leaf',  name: 'Leaf',   face: '#5BCB77', edge: '#A6EDB6', deep: '#31904A', shape: 'notch',   glyph: 'leaf' },
    { key: 'tide',  name: 'Tide',   face: '#38A8DE', edge: '#93DBF7', deep: '#1E6E97', shape: 'squircle',glyph: 'drop' },
    { key: 'plum',  name: 'Plum',   face: '#9A7CF3', edge: '#CDBAFF', deep: '#65499F', shape: 'hex',     glyph: 'star6' },
    { key: 'ember', name: 'Ember',  face: '#F29A4A', edge: '#FFC790', deep: '#AF6521', shape: 'bevel',   glyph: 'flame' }
  ];
  function family(i) {
    var f = FAMILIES[i | 0];
    return f || FAMILIES[0];
  }

  /* ------------------------------------------------------------------ packs
   * colTop[x] = first playable row of column x. Rows above it are holes, which
   * is how each pack gets its own board silhouette. Refills enter at colTop.
   */
  var PACKS = [
    {
      key: 'crate-yard', name: 'Crate Yard', short: 'Yard',
      blurb: 'Stacked crates in a timber yard.',
      colTop: [0, 0, 0, 0, 0, 0, 0],
      frame: '#8A5A32', frameEdge: '#C08A55', field: '#2B3C5E',
      hazard: 'crate', unlockPoints: 0
    },
    {
      key: 'balloon-rise', name: 'Balloon Rise', short: 'Rise',
      blurb: 'Balloons climb a row every move.',
      colTop: [2, 1, 0, 0, 0, 1, 2],
      frame: '#2F6E8F', frameEdge: '#79C2E4', field: '#22375B',
      hazard: 'balloon', unlockPoints: 5
    },
    {
      key: 'gear-works', name: 'Gear Works', short: 'Works',
      blurb: 'Heavy gears sink toward the floor.',
      colTop: [1, 0, 0, 0, 0, 0, 1],
      frame: '#5A6272', frameEdge: '#9FAAC0', field: '#26314C',
      hazard: 'gear', unlockPoints: 12
    },
    {
      key: 'chroma-master', name: 'Chroma Master', short: 'Master',
      blurb: 'Crates, balloons and gears at once.',
      colTop: [2, 1, 1, 0, 1, 1, 2],
      frame: '#6B4A8F', frameEdge: '#C3A2E8', field: '#2A2A54',
      hazard: 'all', unlockPoints: 20
    }
  ];
  function pack(key) {
    for (var i = 0; i < PACKS.length; i++) if (PACKS[i].key === key) return PACKS[i];
    return PACKS[0];
  }
  function packIndex(key) {
    for (var i = 0; i < PACKS.length; i++) if (PACKS[i].key === key) return i;
    return 0;
  }

  /* ------------------------------------------------------------------ levels
   * 28 authored levels, 7 per pack. Move budgets are deliberately generous:
   * every level also carries automatic rescue moves and free special drops.
   * gc = combos needed for gold, sc = for silver.
   */
  function L(n, p, colors, moves, goals, extra) {
    var d = {
      n: n, pack: p, colors: colors, moves: moves,
      goals: {
        crate: goals.crate || 0,
        balloon: goals.balloon || 0,
        gear: goals.gear || 0,
        pop: goals.pop || 0
      },
      popColor: goals.popColor || 0,
      crateHp: goals.crateHp || 1,
      rescue: 4, rescueMoves: 6,
      spawnEvery: 5, spawnSp: 1,
      gc: 3, sc: 1,
      seed: 9176 + n * 7919
    };
    if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) d[k] = extra[k];
    return d;
  }

  var LEVELS = [
    /* --- Crate Yard: learn taps, groups, specials, crate cracking --- */
    L(1,  'crate-yard', 4, 22, { crate: 4 },                                { gc: 1, sc: 1, spawnEvery: 5 }),
    L(2,  'crate-yard', 4, 22, { crate: 6 },                                { gc: 2, sc: 1, spawnEvery: 5 }),
    L(3,  'crate-yard', 5, 24, { crate: 8 },                                { gc: 2, sc: 1 }),
    L(4,  'crate-yard', 5, 24, { crate: 6, crateHp: 2 },                    { gc: 3, sc: 1 }),
    L(5,  'crate-yard', 5, 26, { crate: 9, crateHp: 2, pop: 20, popColor: 0 }, { gc: 3, sc: 2 }),
    L(6,  'crate-yard', 5, 26, { crate: 12, crateHp: 2 },                   { gc: 4, sc: 2 }),
    L(7,  'crate-yard', 6, 28, { crate: 14, crateHp: 2 },                   { gc: 4, sc: 2, rescue: 4 }),

    /* --- Balloon Rise: rising goals, vertical pressure --- */
    L(8,  'balloon-rise', 5, 24, { balloon: 3, crate: 4 },                  { gc: 2, sc: 1, spawnEvery: 5 }),
    L(9,  'balloon-rise', 5, 24, { balloon: 4, crate: 4 },                  { gc: 3, sc: 1 }),
    L(10, 'balloon-rise', 5, 26, { balloon: 5, crate: 6, crateHp: 2 },      { gc: 3, sc: 2 }),
    L(11, 'balloon-rise', 6, 26, { balloon: 5, pop: 24, popColor: 3 },      { gc: 3, sc: 2 }),
    L(12, 'balloon-rise', 5, 26, { balloon: 6, crate: 8, crateHp: 2 },      { gc: 4, sc: 2, spawnEvery: 5 }),
    L(13, 'balloon-rise', 6, 28, { balloon: 7, crate: 6, crateHp: 2 },      { gc: 4, sc: 2 }),
    L(14, 'balloon-rise', 6, 30, { balloon: 8, crate: 10, crateHp: 2 },     { gc: 5, sc: 3, rescue: 4 }),

    /* --- Gear Works: sinking goals, chute planning --- */
    L(15, 'gear-works', 5, 26, { gear: 2, crate: 4 },                       { gc: 2, sc: 1, spawnEvery: 5 }),
    L(16, 'gear-works', 5, 26, { gear: 2, crate: 8, crateHp: 2 },           { gc: 3, sc: 1 }),
    L(17, 'gear-works', 6, 28, { gear: 3, pop: 26, popColor: 4 },           { gc: 3, sc: 2 }),
    L(18, 'gear-works', 5, 28, { gear: 3, balloon: 3 },                     { gc: 4, sc: 2 }),
    L(19, 'gear-works', 6, 28, { gear: 4, crate: 8, crateHp: 2 },           { gc: 4, sc: 2, spawnEvery: 5 }),
    L(20, 'gear-works', 6, 30, { gear: 4, balloon: 5, crate: 6 },           { gc: 5, sc: 3 }),
    L(21, 'gear-works', 6, 32, { gear: 5, crate: 10, crateHp: 2 },          { gc: 5, sc: 3, rescue: 4 }),

    /* --- Chroma Master: every goal type, every hazard --- */
    L(22, 'chroma-master', 6, 30, { crate: 8, crateHp: 2, balloon: 4, gear: 2 },              { gc: 4, sc: 2, rescue: 4, spawnEvery: 5 }),
    L(23, 'chroma-master', 6, 30, { crate: 10, crateHp: 2, balloon: 5, gear: 2, pop: 22, popColor: 1 }, { gc: 5, sc: 3, rescue: 4, spawnEvery: 5 }),
    L(24, 'chroma-master', 6, 32, { crate: 12, crateHp: 2, balloon: 5, gear: 3 },             { gc: 5, sc: 3, rescue: 4, spawnEvery: 5 }),
    L(25, 'chroma-master', 6, 32, { crate: 10, crateHp: 3, balloon: 6, gear: 3, pop: 26, popColor: 2 }, { gc: 6, sc: 3, rescue: 4, spawnEvery: 4 }),
    L(26, 'chroma-master', 6, 34, { crate: 14, crateHp: 2, balloon: 7, gear: 4 },             { gc: 6, sc: 4, rescue: 4, spawnEvery: 4 }),
    L(27, 'chroma-master', 6, 34, { crate: 14, crateHp: 3, balloon: 7, gear: 4, pop: 28, popColor: 5 }, { gc: 6, sc: 4, rescue: 4, spawnEvery: 4, spawnSp: 2 }),
    L(28, 'chroma-master', 6, 36, { crate: 16, crateHp: 3, balloon: 8, gear: 5, pop: 30, popColor: 4 }, { gc: 7, sc: 4, rescue: 4, spawnEvery: 4, spawnSp: 2 })
  ];

  var MAXLV = LEVELS.length;

  function level(n) {
    var i = (n | 0) - 1;
    if (i < 0) i = 0;
    if (i >= LEVELS.length) i = LEVELS.length - 1;
    return LEVELS[i];
  }

  /* Levels belonging to a pack, in order. */
  function packLevels(key) {
    var out = [];
    for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i].pack === key) out.push(LEVELS[i]);
    return out;
  }

  /* ------------------------------------------------------------------ medals */
  var MEDALS = ['none', 'bronze', 'silver', 'gold'];
  var MEDAL_POINTS = { none: 0, bronze: 1, silver: 2, gold: 3 };
  function medalPoints(m) {
    var v = MEDAL_POINTS[m];
    return typeof v === 'number' ? v : 0;
  }
  /* Medal is earned on moves remaining + combos fired + hint discipline. */
  function medalFor(def, movesLeft, combos, hintUsed) {
    if (!def) return 'bronze';
    var ratio = movesLeft / Math.max(1, def.moves);
    if (ratio >= 0.25 && combos >= def.gc && !hintUsed) return 'gold';
    if (ratio >= 0.10 && combos >= def.sc) return 'silver';
    return 'bronze';
  }

  /* ------------------------------------------------------------------ daily
   * Date-seeded board. The daily rotates pack shape and goal mix so a week of
   * dailies never repeats the same board silhouette twice running.
   */
  function dayKey(d) {
    var t = d || new Date();
    var m = t.getMonth() + 1, day = t.getDate();
    return t.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
  }
  function dailyDef(key) {
    var s = 0, i;
    var k = typeof key === 'string' && key ? key : dayKey();
    for (i = 0; i < k.length; i++) s = (s * 31 + k.charCodeAt(i)) | 0;
    s = Math.abs(s) || 1;
    var pk = PACKS[s % PACKS.length] || PACKS[0];
    var colors = 5 + (s >> 3) % 2;
    var goals = { crate: 6 + (s >> 5) % 7, crateHp: 1 + (s >> 7) % 2 };
    if (pk.hazard === 'balloon' || pk.hazard === 'all') goals.balloon = 3 + (s >> 9) % 4;
    if (pk.hazard === 'gear' || pk.hazard === 'all') goals.gear = 2 + (s >> 11) % 3;
    if ((s >> 13) % 3 === 0) { goals.pop = 20 + (s >> 15) % 12; goals.popColor = (s >> 17) % colors; }
    var d = L(0, pk.key, colors, 28, goals, { gc: 4, sc: 2, rescue: 4, rescueMoves: 5, spawnEvery: 5 });
    d.seed = s;
    d.daily = k;
    return d;
  }

  /* ------------------------------------------------------------------ save shape */
  function emptySave() {
    return {
      v: 3,
      unlocked: 1,          // highest campaign level reachable
      medals: {},           // "n" -> 'bronze'|'silver'|'gold'
      best: {},             // "n" -> best score
      daily: { key: '', cleared: 0, best: 0, streak: 0, last: '' },
      seenTutorial: 0,
      totalPoints: 0,
      meta: { v: 1, tokens: 0, choices: { canopy: '', water: '', light: '' }, restored: 0 },
      active: null
    };
  }
  function validateSave(o) {
    return !!o && typeof o === 'object' && !Array.isArray(o) && o.v === 3;
  }
  /* Repair whatever came out of storage into a legal save. */
  function normalizeSave(o) {
    var s = emptySave();
    if (!o || typeof o !== 'object' || Array.isArray(o)) return s;
    var n = parseInt(o.unlocked, 10);
    s.unlocked = (isFinite(n) && n >= 1) ? Math.min(MAXLV, n) : 1;
    var k, i, keys, total = 0;
    if (o.medals && typeof o.medals === 'object' && !Array.isArray(o.medals)) {
      keys = Object.keys(o.medals).slice(0, 64);
      for (i = 0; i < keys.length; i++) {
        k = keys[i];
        if (!/^\d{1,3}$/.test(k) || (parseInt(k, 10) < 1 || parseInt(k, 10) > MAXLV)) continue;
        var m = o.medals[k];
        if (MEDALS.indexOf(m) > 0) { s.medals[k] = m; total += medalPoints(m); }
      }
    }
    if (o.best && typeof o.best === 'object' && !Array.isArray(o.best)) {
      keys = Object.keys(o.best).slice(0, 64);
      for (i = 0; i < keys.length; i++) {
        k = keys[i];
        if (!/^\d{1,3}$/.test(k) || (parseInt(k, 10) < 1 || parseInt(k, 10) > MAXLV)) continue;
        var b = parseInt(o.best[k], 10);
        if (isFinite(b) && b > 0) s.best[k] = Math.min(99999999, b);
      }
    }
    if (o.daily && typeof o.daily === 'object' && !Array.isArray(o.daily)) {
      s.daily.key = typeof o.daily.key === 'string' ? o.daily.key.slice(0, 12) : '';
      s.daily.cleared = o.daily.cleared ? 1 : 0;
      var db = parseInt(o.daily.best, 10);
      s.daily.best = (isFinite(db) && db > 0) ? Math.min(99999999, db) : 0;
      var st = parseInt(o.daily.streak, 10);
      s.daily.streak = (isFinite(st) && st > 0) ? Math.min(9999, st) : 0;
      s.daily.last = typeof o.daily.last === 'string' ? o.daily.last.slice(0, 12) : '';
    }
    s.seenTutorial = o.seenTutorial ? 1 : 0;
    if (o.meta && typeof o.meta === 'object' && !Array.isArray(o.meta)) {
      s.meta.tokens = Math.max(0, Math.min(9999, parseInt(o.meta.tokens, 10) || 0));
      if (o.meta.choices && typeof o.meta.choices === 'object') {
        var choiceKeys = ['canopy', 'water', 'light'];
        var choiceValues = {
          canopy: ['leaf-canopy', 'cloth-canopy'],
          water: ['stone-channel', 'rain-garden'],
          light: ['warm-lantern', 'sun-mirror']
        };
        for (i = 0; i < choiceKeys.length; i++) {
          var cv = o.meta.choices[choiceKeys[i]];
          s.meta.choices[choiceKeys[i]] = typeof cv === 'string' &&
            choiceValues[choiceKeys[i]].indexOf(cv) >= 0 ? cv : '';
        }
      }
      s.meta.restored = o.meta.restored ? 1 : 0;
    }
    if (o.active && typeof o.active === 'object' && !Array.isArray(o.active) && o.active.v === 1) {
      var av = o.active;
      var aid = parseInt(av.level, 10);
      var aMode = av.mode === 'daily' ? 'daily' : (av.mode === 'campaign' ? 'campaign' : '');
      var aDate = typeof av.daily === 'string' ? av.daily.slice(0, 12) : '';
      var st = av.state;
      if (aMode && ((aMode === 'daily' && /^\d{4}-\d{2}-\d{2}$/.test(aDate)) ||
        (aMode === 'campaign' && aid >= 1 && aid <= MAXLV)) && st && typeof st === 'object' &&
        Array.isArray(st.grid) && st.grid.length === COLS * ROWS && Array.isArray(st.queue) && st.queue.length === COLS) {
        s.active = {
          v: 1, mode: aMode, level: aMode === 'campaign' ? aid : 0, daily: aDate,
          state: st
        };
      }
    }
    s.totalPoints = total;
    return s;
  }

  /* A pack is open when the player has banked enough medal points. */
  function packUnlocked(pk, save) {
    if (!pk) return false;
    var need = pk.unlockPoints || 0;
    if (need <= 0) return true;
    return (save && typeof save.totalPoints === 'number' ? save.totalPoints : 0) >= need;
  }
  function levelUnlocked(n, save) {
    var def = level(n);
    var pk = pack(def.pack);
    if (!packUnlocked(pk, save)) return false;
    return n <= (save && save.unlocked ? save.unlocked : 1);
  }

  g.CTData = {
    TOKENS: TOKENS,
    FAMILIES: FAMILIES, family: family,
    PACKS: PACKS, pack: pack, packIndex: packIndex,
    LEVELS: LEVELS, MAXLV: MAXLV, level: level, packLevels: packLevels,
    MEDALS: MEDALS, medalPoints: medalPoints, medalFor: medalFor,
    dayKey: dayKey, dailyDef: dailyDef,
    emptySave: emptySave, validateSave: validateSave, normalizeSave: normalizeSave,
    packUnlocked: packUnlocked, levelUnlocked: levelUnlocked,
    COLS: COLS, ROWS: ROWS
  };
})(typeof window !== 'undefined' ? window : globalThis);
