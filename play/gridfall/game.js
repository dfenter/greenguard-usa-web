/* Gridfall - game.js : board model, piece set, dealing, scoring. No rendering here. */
'use strict';
var G = (function () {

  var N = 8;                 // board is 8x8
  var COLORS = ['#4fc3f7', '#ffb74d', '#7ed37e', '#ef6b6b', '#b47ae0', '#ffe066', '#4dd0e1'];

  /* ---- piece library: base shapes expanded through unique rotations ---- */
  function norm(cells) {
    var mx = 99, my = 99, i;
    for (i = 0; i < cells.length; i++) { if (cells[i][0] < mx) mx = cells[i][0]; if (cells[i][1] < my) my = cells[i][1]; }
    var out = [];
    for (i = 0; i < cells.length; i++) out.push([cells[i][0] - mx, cells[i][1] - my]);
    out.sort(function (a, b) { return (a[1] - b[1]) || (a[0] - b[0]); });
    return out;
  }
  function rot(cells) {
    var my = 0;
    for (var i = 0; i < cells.length; i++) if (cells[i][1] > my) my = cells[i][1];
    var out = [];
    for (i = 0; i < cells.length; i++) out.push([my - cells[i][1], cells[i][0]]);
    return norm(out);
  }
  function key(cells) { var s = ''; for (var i = 0; i < cells.length; i++) s += cells[i][0] + ',' + cells[i][1] + ';'; return s; }

  var BASES = [
    { c: 0, w: 5, s: [[0, 0]] },                                                   // single
    { c: 0, w: 8, s: [[0, 0], [1, 0]] },                                           // domino
    { c: 1, w: 8, s: [[0, 0], [1, 0], [2, 0]] },                                   // tri line
    { c: 1, w: 6, s: [[0, 0], [1, 0], [2, 0], [3, 0]] },                           // quad line
    { c: 2, w: 3, s: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]] },                   // penta line
    { c: 3, w: 8, s: [[0, 0], [1, 0], [0, 1], [1, 1]] },                           // 2x2
    { c: 4, w: 2, s: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2]] }, // 3x3
    { c: 5, w: 9, s: [[0, 0], [0, 1], [1, 1]] },                                   // corner (3)
    { c: 6, w: 5, s: [[0, 0], [1, 0], [2, 0], [1, 1]] },                           // T
    { c: 2, w: 4, s: [[1, 0], [2, 0], [0, 1], [1, 1]] },                           // S
    { c: 3, w: 4, s: [[0, 0], [1, 0], [1, 1], [2, 1]] },                           // Z
    { c: 4, w: 5, s: [[0, 0], [0, 1], [0, 2], [1, 2]] },                           // L
    { c: 6, w: 5, s: [[1, 0], [1, 1], [1, 2], [0, 2]] },                           // J
    { c: 5, w: 4, s: [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]] }                    // big corner (5)
  ];

  var PIECES = [], BAG = [];
  (function build() {
    for (var b = 0; b < BASES.length; b++) {
      var cur = norm(BASES[b].s), seen = {}, r;
      for (r = 0; r < 4; r++) {
        var k = key(cur);
        if (!seen[k]) {
          seen[k] = 1;
          var w = 0, h = 0;
          for (var i = 0; i < cur.length; i++) { if (cur[i][0] + 1 > w) w = cur[i][0] + 1; if (cur[i][1] + 1 > h) h = cur[i][1] + 1; }
          PIECES.push({ id: PIECES.length, cells: cur, w: w, h: h, n: cur.length, col: BASES[b].c, wt: BASES[b].w });
        }
        cur = rot(cur);
      }
    }
    for (var p = 0; p < PIECES.length; p++) for (var q = 0; q < PIECES[p].wt; q++) BAG.push(PIECES[p].id);
  })();

  /* ---- board helpers ---- */
  function newBoard() { return new Uint8Array(N * N); }

  function canPlace(bd, piece, ox, oy) {
    if (ox < 0 || oy < 0 || ox + piece.w > N || oy + piece.h > N) return false;
    var c = piece.cells;
    for (var i = 0; i < c.length; i++) {
      if (bd[(oy + c[i][1]) * N + (ox + c[i][0])]) return false;
    }
    return true;
  }
  function anySpot(bd, piece) {
    for (var y = 0; y <= N - piece.h; y++)
      for (var x = 0; x <= N - piece.w; x++)
        if (canPlace(bd, piece, x, y)) return true;
    return false;
  }
  function place(bd, piece, ox, oy) {
    var c = piece.cells, cells = [];
    for (var i = 0; i < c.length; i++) {
      var cx = ox + c[i][0], cy = oy + c[i][1];
      bd[cy * N + cx] = piece.col + 1;
      cells.push([cx, cy]);
    }
    return cells;
  }
  /* returns {rows:[], cols:[], cells:[[x,y,color]...]} and mutates board */
  function clearLines(bd) {
    var rows = [], cols = [], x, y, full;
    for (y = 0; y < N; y++) {
      full = true;
      for (x = 0; x < N; x++) if (!bd[y * N + x]) { full = false; break; }
      if (full) rows.push(y);
    }
    for (x = 0; x < N; x++) {
      full = true;
      for (y = 0; y < N; y++) if (!bd[y * N + x]) { full = false; break; }
      if (full) cols.push(x);
    }
    var cells = [], mark = {};
    function add(cx, cy) {
      var k = cy * N + cx;
      if (mark[k]) return;
      mark[k] = 1;
      cells.push([cx, cy, bd[k]]);
    }
    for (var i = 0; i < rows.length; i++) for (x = 0; x < N; x++) add(x, rows[i]);
    for (i = 0; i < cols.length; i++) for (y = 0; y < N; y++) add(cols[i], y);
    for (i = 0; i < cells.length; i++) bd[cells[i][1] * N + cells[i][0]] = 0;
    return { rows: rows, cols: cols, cells: cells, count: rows.length + cols.length };
  }
  function isEmpty(bd) { for (var i = 0; i < bd.length; i++) if (bd[i]) return false; return true; }
  function filled(bd) { var n = 0; for (var i = 0; i < bd.length; i++) if (bd[i]) n++; return n; }

  /* ---- dealing: a hand NEVER arrives dead ---- */
  function rollHand(rng) {
    var h = [];
    for (var i = 0; i < 3; i++) h.push(PIECES[BAG[Math.floor(rng() * BAG.length) % BAG.length]]);
    return h;
  }
  function playableCount(bd, hand) {
    var n = 0;
    for (var i = 0; i < hand.length; i++) if (hand[i] && anySpot(bd, hand[i])) n++;
    return n;
  }
  /* prefer a hand where all three fit somewhere; never return one where none fit */
  function dealHand(bd, rng) {
    var best = null, bestScore = -1;
    for (var t = 0; t < 60; t++) {
      var h = rollHand(rng);
      var s = playableCount(bd, h);
      if (s > bestScore) { bestScore = s; best = h; }
      if (s === 3) return h;
      if (t >= 24 && bestScore >= 1) return best;
    }
    return best;
  }
  function handDead(bd, hand) {
    for (var i = 0; i < hand.length; i++) if (hand[i] && anySpot(bd, hand[i])) return false;
    return true;
  }

  /* ---- daily starting board: seeded scatter, never a pre-made full line ---- */
  function seedBoard(bd, rng) {
    var want = 8 + Math.floor(rng() * 5), tries = 0;
    var colr = Math.floor(rng() * COLORS.length);
    while (want > 0 && tries < 400) {
      tries++;
      var x = Math.floor(rng() * N), y = Math.floor(rng() * N), k = y * N + x;
      if (bd[k]) continue;
      bd[k] = ((colr + x + y) % COLORS.length) + 1;
      var cl = clearLines(bd);
      if (cl.count > 0) { bd[k] = 0; continue; }
      want--;
    }
  }

  /* ---- scoring ---- */
  function scoreFor(nCells, cl, streak, perfect) {
    var pts = nCells;
    if (cl.count > 0) {
      var base = 10 * cl.count * cl.count + 10;
      var mult = 1 + 0.25 * Math.max(0, streak - 1);
      pts += Math.round(base * mult);
      if (perfect) pts += 300;
    }
    return pts;
  }

  return {
    N: N, COLORS: COLORS, PIECES: PIECES,
    newBoard: newBoard, canPlace: canPlace, anySpot: anySpot, place: place,
    clearLines: clearLines, isEmpty: isEmpty, filled: filled,
    dealHand: dealHand, rollHand: rollHand, handDead: handDead, playableCount: playableCount,
    seedBoard: seedBoard, scoreFor: scoreFor
  };
})();
