/* Gridfall model. The simulation owns all puzzle state and never touches Phaser. */
(function () {
  'use strict';

  var N = 8;
  var COLORS = [0xf25c68, 0xf7c948, 0x5bcb77, 0x38a8de, 0x9a7cf3, 0xf29a4a];
  var COLOR_NAMES = ['coral', 'sun', 'leaf', 'tide', 'plum', 'ember'];
  var GLYPHS = ['●', '✦', '⌁', '◆', '✚', '■'];
  var KINDS = { empty: 0, hazard: 9 };

  var PATTERNS = [
    { id: 'classic', name: 'Classic', unlock: 0, mark: '●' },
    { id: 'prism', name: 'Prism', unlock: 1, mark: '◆' },
    { id: 'leaf', name: 'Leaf', unlock: 2, mark: '✦' },
    { id: 'star', name: 'Star', unlock: 3, mark: '✚' },
    { id: 'aurora', name: 'Aurora', unlock: 4, mark: '⌁' },
    { id: 'gold', name: 'Goldline', unlock: 5, mark: '■' }
  ];

  /* The chapters deliberately lengthen the move budget and add new tile language. */
  var CHALLENGES = [
    { id: 'challenge-01', name: 'First Fold', sub: 'Learn the clean group', accent: 0xf7c948, goal: 'score', target: 420, moves: 18, bronze: [420, 3, 0], silver: [620, 5, 1], gold: [820, 7, 2], pattern: 'prism', rows: ['00112233', '22334455', '44550011', '11003344', '33445522', '55001133', '11224455', '33005511'] },
    { id: 'challenge-02', name: 'Twin Channels', sub: 'Make two cascades breathe', accent: 0x38a8de, goal: 'cascades', target: 2, moves: 22, bronze: [520, 3, 1], silver: [780, 5, 2], gold: [1050, 7, 3], pattern: 'leaf', rows: ['00112233', '00112233', '44556611', '44556611', '22334455', '22334455', '55001122', '55001122'] },
    { id: 'challenge-03', name: 'Pressure Bloom', sub: 'Build a large clear', accent: 0x5bcb77, goal: 'clears', target: 30, moves: 26, bronze: [700, 4, 1], silver: [980, 6, 2], gold: [1300, 8, 3], pattern: 'star', rows: ['00110022', '00110022', '33445500', '33445500', '11223344', '11223344', '44550011', '44550011'] },
    { id: 'challenge-04', name: 'Ceramic Switch', sub: 'Read every color family', accent: 0x9a7cf3, goal: 'score', target: 1050, moves: 30, bronze: [1050, 5, 1], silver: [1400, 7, 2], gold: [1800, 9, 3], pattern: 'aurora', rows: ['01234501', '12345012', '23450123', '34501234', '45012345', '50123450', '01234501', '12345012'] },
    { id: 'challenge-05', name: 'Glass Garden', sub: 'Turn gravity into a tool', accent: 0xf29a4a, goal: 'cascades', target: 3, moves: 34, bronze: [1250, 6, 1], silver: [1700, 8, 2], gold: [2200, 10, 4], pattern: 'gold', rows: ['00112244', '00112244', '33550011', '33550011', '22445533', '22445533', '11003355', '11003355'] },
    { id: 'challenge-06', name: 'Signal Crown', sub: 'The full pattern set', accent: 0xf25c68, goal: 'score', target: 1700, moves: 38, bronze: [1700, 7, 1], silver: [2200, 9, 3], gold: [2800, 12, 5], pattern: 'gold', rows: ['01230123', '12341234', '23452345', '34503450', '45014501', '50125012', '01230123', '12341234'] }
  ];
  var MASTER = {
    id: 'gridfall-master', name: 'Gridfall Master', sub: 'Hazards, scarce moves, no wasted tap', accent: 0xf29a4a,
    goal: 'cascades', target: 4, moves: 45, bronze: [1600, 8, 2], silver: [2200, 10, 4], gold: [3000, 13, 6], pattern: 'gold',
    rows: ['90011229', '22334455', '44550011', '11003344', '33445522', '55001133', '11224455', '92255009']
  };

  function rng(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), 1 | t);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(text) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function int(random, n) { return Math.floor(random() * n) % (n || 1); }
  function index(x, y) { return y * N + x; }
  function inBounds(x, y) { return x >= 0 && x < N && y >= 0 && y < N; }
  function cloneBoard(board) { return new Uint8Array(board); }

  function boardFromRows(rows, random) {
    var board = new Uint8Array(N * N), value;
    for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) {
      value = (rows[y] || '').charCodeAt(x) - 48;
      board[index(x, y)] = value === 9 ? KINDS.hazard : (value >= 1 && value <= 6 ? value : 1 + int(random, 6));
    }
    return board;
  }
  function wouldMakeTriple(board, x, y, value) {
    if (x >= 2 && board[index(x - 1, y)] === value && board[index(x - 2, y)] === value) return true;
    if (y >= 2 && board[index(x, y - 1)] === value && board[index(x, y - 2)] === value) return true;
    return false;
  }
  function wouldMakeTripleWithBelow(board, x, y, value) {
    if (x >= 2 && board[index(x - 1, y)] === value && board[index(x - 2, y)] === value) return true;
    if (y + 2 < N && board[index(x, y + 1)] === value && board[index(x, y + 2)] === value) return true;
    return false;
  }
  function fillSafe(board, random) {
    for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) {
      if (board[index(x, y)] === KINDS.hazard) continue;
      var value = 1 + int(random, 6), tries = 0;
      while (wouldMakeTriple(board, x, y, value) && tries++ < 12) value = 1 + int(random, 6);
      board[index(x, y)] = value;
    }
    return board;
  }
  function boardFor(mode, boardId, random) {
    if (mode === 'challenge') return fillSafe(boardFromRows(definition(mode, boardId).rows, random), random);
    if (mode === 'master') return fillSafe(boardFromRows(MASTER.rows, random), random);
    var board = new Uint8Array(N * N);
    return fillSafe(board, random);
  }
  function definition(mode, boardId) {
    if (mode === 'master') return MASTER;
    if (mode === 'challenge') for (var i = 0; i < CHALLENGES.length; i++) if (CHALLENGES[i].id === boardId) return CHALLENGES[i];
    if (mode === 'daily') return { id: boardId, name: 'Daily Stamp', sub: 'One seeded board, one official finish', accent: 0x38a8de, goal: 'score', target: 1000, moves: 40, bronze: [1000, 4, 1], silver: [1400, 6, 2], gold: [1900, 9, 3], pattern: 'classic' };
    return { id: 'marathon-open', name: 'Open Grid', sub: 'A 60-move score run', accent: 0xf7c948, goal: 'score', target: 1800, moves: 60, bronze: [1800, 5, 1], silver: [2400, 8, 2], gold: [3200, 11, 4], pattern: 'classic' };
  }
  function safeMode(mode) { return mode === 'daily' || mode === 'challenge' || mode === 'master' ? mode : 'marathon'; }
  function normalizeBoardId(mode, boardId) {
    if (mode === 'master') return MASTER.id;
    if (mode === 'challenge') for (var i = 0; i < CHALLENGES.length; i++) if (CHALLENGES[i].id === boardId) return boardId;
    return mode === 'daily' ? (boardId || 'daily-stamped') : 'marathon-open';
  }
  function countFilled(board) { var n = 0; for (var i = 0; i < board.length; i++) if (board[i]) n++; return n; }
  function groupAt(board, x, y) {
    if (!inBounds(x, y) || board[index(x, y)] < 1 || board[index(x, y)] > 6) return [];
    var target = board[index(x, y)], seen = {}, queue = [index(x, y)], head = 0, out = [], p, px, py, nx, ny, k;
    seen[queue[0]] = true;
    while (head < queue.length) {
      p = queue[head++]; px = p % N; py = (p / N) | 0; out.push([px, py]);
      for (var i = 0; i < 4; i++) {
        nx = px + (i === 0 ? 1 : i === 1 ? -1 : 0); ny = py + (i === 2 ? 1 : i === 3 ? -1 : 0);
        if (!inBounds(nx, ny)) continue;
        k = index(nx, ny); if (!seen[k] && board[k] === target) { seen[k] = true; queue.push(k); }
      }
    }
    return out;
  }
  function allGroups(board) {
    var seen = {}, groups = [], g, cell, k;
    for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) {
      k = index(x, y); if (seen[k] || board[k] < 1 || board[k] > 6) continue;
      g = groupAt(board, x, y);
      for (var i = 0; i < g.length; i++) { cell = g[i]; seen[index(cell[0], cell[1])] = true; }
      if (g.length >= 3) groups.push(g);
    }
    return groups;
  }
  function ensureLegal(board, random) {
    if (allGroups(board).length) return;
    for (var y = 0; y < N; y++) for (var x = 0; x < N - 2; x++) {
      if (board[index(x, y)] !== KINDS.hazard && board[index(x + 1, y)] !== KINDS.hazard && board[index(x + 2, y)] !== KINDS.hazard) {
        var value = 1 + int(random, 6);
        board[index(x, y)] = value; board[index(x + 1, y)] = value; board[index(x + 2, y)] = value;
        return;
      }
    }
  }
  function refill(board, random) {
    var moved = [], values, write, value, y, x;
    for (x = 0; x < N; x++) {
      values = [];
      for (y = N - 1; y >= 0; y--) if (board[index(x, y)]) values.push(board[index(x, y)]);
      for (y = 0; y < N; y++) board[index(x, y)] = 0;
      write = N - 1;
      for (var i = 0; i < values.length; i++) { value = values[i]; board[index(x, write)] = value; if (write !== N - 1 - i) moved.push([x, write, x, N - 1 - i]); write--; }
      while (write >= 0) {
        value = 1 + int(random, 6); var attempts = 0;
        while (wouldMakeTripleWithBelow(board, x, write, value) && attempts++ < 12) value = 1 + int(random, 6);
        board[index(x, write)] = value; moved.push([x, write, x, -1]); write--;
      }
    }
    return moved;
  }
  function removeCells(board, cells) {
    var removed = [];
    for (var i = 0; i < cells.length; i++) { var x = cells[i][0], y = cells[i][1], k = index(x, y); if (board[k]) { removed.push([x, y, board[k]]); board[k] = 0; } }
    return removed;
  }
  function goalReached(state) {
    var def = state.def;
    if (def.goal === 'cascades') return state.cascades >= def.target;
    if (def.goal === 'clears') return state.clears >= def.target;
    return state.score >= def.target;
  }
  function metric(value, thresholds) { return value >= thresholds[2] ? 3 : value >= thresholds[1] ? 2 : value >= thresholds[0] ? 1 : 0; }
  function medal(state) {
    if (!state || !state.complete || !state.def || !state.def.bronze || state.mode === 'marathon' || state.mode === 'daily') return '';
    var a = metric(state.score, [state.def.bronze[0], state.def.silver[0], state.def.gold[0]]);
    var b = metric(state.bestStreak, [state.def.bronze[1], state.def.silver[1], state.def.gold[1]]);
    var c = metric(state.cascades, [state.def.bronze[2], state.def.silver[2], state.def.gold[2]]);
    var n = Math.min(a, b, c);
    return n === 3 ? 'gold' : n === 2 ? 'silver' : n === 1 ? 'bronze' : '';
  }
  function copyCells(cells) { return cells.map(function (c) { return [c[0], c[1]]; }); }
  function publicBoard(board) { return Array.prototype.slice.call(board); }
  function patternAt(id) { for (var i = 0; i < PATTERNS.length; i++) if (PATTERNS[i].id === id) return PATTERNS[i]; return PATTERNS[0]; }

  function newState(mode, boardId, seed, dateKey, patternId) {
    mode = safeMode(mode);
    var id = normalizeBoardId(mode, boardId), random = rng(seed || hash('gridfall|' + mode + '|' + id)), def = definition(mode, id), board;
    if (mode === 'daily') { board = new Uint8Array(N * N); fillSafe(board, random); }
    else board = boardFor(mode, id, random);
    ensureLegal(board, random);
    return {
      mode: mode, boardId: id, boardName: def.name, boardSub: def.sub, def: def, seed: seed >>> 0, dailyKey: dateKey || '', random: random,
      board: board, score: 0, streak: 0, bestStreak: 0, clears: 0, cascades: 0, wipes: 0, moves: 0, movesRemaining: def.moves,
      phase: 'play', complete: false, patternId: patternAt(patternId || def.pattern || 'classic').id, selected: null, last: null
    };
  }
  function hint(state) {
    var groups = allGroups(state.board);
    if (!groups.length) return null;
    groups.sort(function (a, b) { return b.length - a.length; });
    return copyCells(groups[0]);
  }
  function tap(state, x, y) {
    if (!state || state.phase !== 'play') return { ok: false, reason: 'not-ready' };
    if (!inBounds(x, y)) return { ok: false, reason: 'outside' };
    var group = groupAt(state.board, x, y);
    if (group.length < 3) { state.selected = [[x, y]]; return { ok: false, reason: 'need-group', group: group }; }
    var previousStreak = state.streak, removed = removeCells(state.board, group), cascades = 0, cascadeGroups = [], moved = [], nextGroups;
    state.moves++; state.movesRemaining = Math.max(0, state.def.moves - state.moves); state.streak++; state.bestStreak = Math.max(state.bestStreak, state.streak); state.clears += removed.length;
    var totalRemoved = removed.length;
    moved = moved.concat(refill(state.board, state.random));
    for (var guard = 0; guard < 8; guard++) {
      nextGroups = allGroups(state.board); if (!nextGroups.length) break;
      cascades++;
      var cascadeCells = [];
      for (var i = 0; i < nextGroups.length; i++) cascadeCells = cascadeCells.concat(removeCells(state.board, nextGroups[i]));
      cascadeGroups.push(cascadeCells); totalRemoved += cascadeCells.length; state.clears += cascadeCells.length;
      moved = moved.concat(refill(state.board, state.random));
    }
    state.cascades += cascades; if (totalRemoved >= 24 || cascades >= 3) state.wipes++;
    var gain = removed.length * 12 + cascades * 55 + Math.max(0, totalRemoved - removed.length) * 8 + (state.streak - 1) * 18;
    state.score += gain; state.selected = null;
    var complete = goalReached(state); if (complete) { state.complete = true; state.phase = 'complete'; }
    else if (state.movesRemaining <= 0) state.phase = 'over';
    else if (!allGroups(state.board).length) ensureLegal(state.board, state.random);
    state.last = { group: copyCells(group), removed: removed, cascadeGroups: cascadeGroups, moved: moved, cascades: cascades, gain: gain, streak: state.streak, previousStreak: previousStreak, totalRemoved: totalRemoved, wipe: totalRemoved >= 24 || cascades >= 3, complete: complete, over: state.phase === 'over', medal: medal(state) };
    return { ok: true, group: copyCells(group), removed: removed, cascadeGroups: cascadeGroups, moved: moved, cascades: cascades, gain: gain, streak: state.streak, previousStreak: previousStreak, complete: complete, over: state.phase === 'over', wipe: state.last.wipe, medal: state.last.medal, movesRemaining: state.movesRemaining };
  }
  function snapshot(state) {
    return {
      mode: state.mode, boardId: state.boardId, boardName: state.boardName, boardSub: state.boardSub, phase: state.phase, score: state.score,
      streak: state.streak, bestStreak: state.bestStreak, clears: state.clears, lines: state.clears, cascades: state.cascades, wipes: state.wipes,
      moves: state.moves, movesRemaining: state.movesRemaining, moveLimit: state.def.moves, hand: [], next: [], board: publicBoard(state.board),
      medal: medal(state), complete: state.complete, dailyKey: state.dailyKey, target: state.def.target || 0, goal: state.def.goal || 'score',
      filled: countFilled(state.board), patternId: state.patternId, patternName: patternAt(state.patternId).name, selected: state.selected ? copyCells(state.selected) : null
    };
  }

  window.GridfallSim = {
    N: N, COLORS: COLORS, COLOR_NAMES: COLOR_NAMES, GLYPHS: GLYPHS, KINDS: KINDS, PATTERNS: PATTERNS, CHALLENGES: CHALLENGES, MASTER: MASTER,
    hash: hash, safeMode: safeMode, boardDefinition: definition, patternAt: patternAt, newState: newState, groupAt: groupAt, allGroups: allGroups,
    hint: hint, tap: tap, place: function (state, a, b, c) { return arguments.length >= 4 ? tap(state, b, c) : tap(state, a, b); }, medal: medal, snapshot: snapshot,
    publicBoard: publicBoard, challengeAt: function (id) { for (var i = 0; i < CHALLENGES.length; i++) if (CHALLENGES[i].id === id) return CHALLENGES[i]; return CHALLENGES[0]; },
    challengeIndex: function (id) { for (var i = 0; i < CHALLENGES.length; i++) if (CHALLENGES[i].id === id) return i; return 0; }
  };
})();
