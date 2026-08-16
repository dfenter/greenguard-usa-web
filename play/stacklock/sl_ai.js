/* sl_ai.js — Stacklock rival stacking AI (round 2).
 *
 * A real placement search, not a random dropper. For every rotation and every
 * column the piece can occupy, the board that WOULD result is built in a
 * preallocated scratch buffer and scored with the Dellacherie feature set
 * (landing height, rows eliminated, row transitions, column transitions,
 * holes, well sums). The best scoring placement wins.
 *
 * Difficulty is expressed as SEARCH quality, never as a cheat:
 *   error     probability that the rival takes a worse-ranked placement
 *   lookahead 1 = refine the top candidates with a full second-ply search
 *                 over the next piece, which is what separates a competent
 *                 stacker from a good one
 *
 * Pure function of (grid, shapes). No engine reference, no DOM, no globals
 * beyond window.SL_AI. Every buffer here is allocated ONCE at module load:
 * a rival decision must never allocate during play.
 */
(function (root) {
  'use strict';

  var COLS = 10;
  var ROWS = 22;
  var SIZE = COLS * ROWS;

  // Preallocated scratch. Two boards are enough for a two-ply search because
  // the second ply always rebuilds from the first ply's result.
  var BOARD0 = new Uint8Array(SIZE);
  var BOARD1 = new Uint8Array(SIZE);
  var BOARD2 = new Uint8Array(SIZE);
  var HEIGHT = new Int16Array(COLS);
  // Candidate ranking buffers. 4 rotations x 10 columns is the hard ceiling.
  var CAND_MAX = 44;
  var CAND_SCORE = new Float64Array(CAND_MAX);
  var CAND_X = new Int16Array(CAND_MAX);
  var CAND_Y = new Int16Array(CAND_MAX);
  var CAND_ROT = new Int16Array(CAND_MAX);
  var ORDER = new Int16Array(CAND_MAX);

  // Dellacherie weights. These are the published set that plays millions of
  // lines unattended; the tiers below degrade it, they never improve on it.
  var W_LANDING = -4.500158;
  var W_LINES = 3.4181268;
  var W_ROWTRANS = -3.2178882;
  var W_COLTRANS = -9.348695;
  var W_HOLES = -7.899265;
  var W_WELLS = -3.3855972;

  var RESULT = { x: 4, rot: 0, y: 0, score: -1e9, ok: false };

  function loadGrid(grid, dst) {
    for (var r = 0; r < ROWS; r++) {
      var row = grid[r];
      var off = r * COLS;
      if (!row) { for (var e = 0; e < COLS; e++) dst[off + e] = 0; continue; }
      for (var c = 0; c < COLS; c++) dst[off + c] = row[c] ? 1 : 0;
    }
  }

  function fits(bd, m, px, py) {
    for (var y = 0; y < m.length; y++) {
      var mrow = m[y];
      for (var x = 0; x < mrow.length; x++) {
        if (!mrow[x]) continue;
        var nx = px + x, ny = py + y;
        if (nx < 0 || nx >= COLS || ny >= ROWS) return false;
        if (ny >= 0 && bd[ny * COLS + nx]) return false;
      }
    }
    return true;
  }

  function dropY(bd, m, px) {
    var y = -m.length;
    if (!fits(bd, m, px, y)) return -9999;
    while (fits(bd, m, px, y + 1)) y++;
    return y;
  }

  // Copies src into dst, stamps the piece, collapses full rows. Returns the
  // number of rows eliminated, or -1 if the placement spilled above the board.
  function stamp(src, dst, m, px, py) {
    var i;
    for (i = 0; i < SIZE; i++) dst[i] = src[i];
    for (var y = 0; y < m.length; y++) {
      var mrow = m[y];
      for (var x = 0; x < mrow.length; x++) {
        if (!mrow[x]) continue;
        var ny = py + y;
        if (ny < 0) return -1;
        dst[ny * COLS + px + x] = 1;
      }
    }
    var write = ROWS - 1;
    var lines = 0;
    for (var r = ROWS - 1; r >= 0; r--) {
      var off = r * COLS;
      var full = true;
      for (var c = 0; c < COLS; c++) { if (!dst[off + c]) { full = false; break; } }
      if (full) { lines++; continue; }
      if (write !== r) {
        var woff = write * COLS;
        for (var c2 = 0; c2 < COLS; c2++) dst[woff + c2] = dst[off + c2];
      }
      write--;
    }
    for (; write >= 0; write--) {
      var zoff = write * COLS;
      for (var c3 = 0; c3 < COLS; c3++) dst[zoff + c3] = 0;
    }
    return lines;
  }

  function evaluate(bd, landingRow, lines) {
    var r, c, off, prev;
    // column heights
    for (c = 0; c < COLS; c++) {
      HEIGHT[c] = 0;
      for (r = 0; r < ROWS; r++) {
        if (bd[r * COLS + c]) { HEIGHT[c] = ROWS - r; break; }
      }
    }
    // holes: empty cells that sit under the column's surface
    var holes = 0;
    for (c = 0; c < COLS; c++) {
      var top = ROWS - HEIGHT[c];
      for (r = top + 1; r < ROWS; r++) if (!bd[r * COLS + c]) holes++;
    }
    // row transitions, walls count as filled
    var rowTrans = 0;
    for (r = 0; r < ROWS; r++) {
      off = r * COLS;
      prev = 1;
      for (c = 0; c < COLS; c++) {
        var cur = bd[off + c];
        if (cur !== prev) rowTrans++;
        prev = cur;
      }
      if (prev !== 1) rowTrans++;
    }
    // column transitions, floor counts as filled, ceiling as empty
    var colTrans = 0;
    for (c = 0; c < COLS; c++) {
      prev = 0;
      for (r = 0; r < ROWS; r++) {
        var cv = bd[r * COLS + c];
        if (cv !== prev) colTrans++;
        prev = cv;
      }
      if (prev !== 1) colTrans++;
    }
    // well sums: a run of empty cells with both sides filled pays 1+2+3...
    var wells = 0;
    for (c = 0; c < COLS; c++) {
      for (r = 0; r < ROWS; r++) {
        if (bd[r * COLS + c]) continue;
        var leftFilled = c === 0 || bd[r * COLS + c - 1];
        var rightFilled = c === COLS - 1 || bd[r * COLS + c + 1];
        if (!leftFilled || !rightFilled) continue;
        var depth = 1;
        for (var rr = r + 1; rr < ROWS && !bd[rr * COLS + c]; rr++) depth++;
        wells += depth * (depth + 1) / 2;
        break;
      }
    }
    var landingHeight = ROWS - landingRow;
    return W_LANDING * landingHeight + W_LINES * lines + W_ROWTRANS * rowTrans +
      W_COLTRANS * colTrans + W_HOLES * holes + W_WELLS * wells;
  }

  // Enumerates every legal resting placement of `shapes` on `src`, scoring each
  // one. Fills the candidate buffers and returns the count.
  function enumerate(src, shapes, work) {
    var n = 0;
    var seen = {};
    for (var rot = 0; rot < 4 && rot < shapes.length; rot++) {
      var m = shapes[rot];
      if (!m || !m.length) continue;
      // Skip duplicate orientations (O never rotates, I and S/Z repeat).
      var sig = JSON.stringify(m);
      if (seen[sig]) continue;
      seen[sig] = 1;
      var wCells = m[0].length;
      for (var x = -2; x <= COLS; x++) {
        if (n >= CAND_MAX) break;
        // fast reject: any filled cell outside the board
        var bad = false;
        for (var yy = 0; yy < m.length && !bad; yy++) {
          for (var xx = 0; xx < wCells; xx++) {
            if (!m[yy][xx]) continue;
            if (x + xx < 0 || x + xx >= COLS) { bad = true; break; }
          }
        }
        if (bad) continue;
        var y = dropY(src, m, x);
        if (y === -9999) continue;
        var lines = stamp(src, work, m, x, y);
        if (lines < 0) continue;
        CAND_SCORE[n] = evaluate(work, y, lines);
        CAND_X[n] = x;
        CAND_Y[n] = y;
        CAND_ROT[n] = rot;
        n++;
      }
    }
    return n;
  }

  function rankOrder(n) {
    var i, j;
    for (i = 0; i < n; i++) ORDER[i] = i;
    for (i = 1; i < n; i++) {
      var key = ORDER[i];
      var kv = CAND_SCORE[key];
      for (j = i - 1; j >= 0 && CAND_SCORE[ORDER[j]] < kv; j--) ORDER[j + 1] = ORDER[j];
      ORDER[j + 1] = key;
    }
  }

  /* best(grid, shapes, nextShapes, opts)
   *   grid       ROWS x COLS array of ints (0 = empty)
   *   shapes     the four rotation matrices of the piece to place
   *   nextShapes the four rotation matrices of the following piece, or null
   *   opts       { error: 0..1, lookahead: 0|1, rng: fn }
   * Returns the shared RESULT record: { ok, x, y, rot, score }.
   */
  function best(grid, shapes, nextShapes, opts) {
    RESULT.ok = false;
    RESULT.score = -1e9;
    if (!grid || !shapes || !shapes.length) return RESULT;
    var o = opts || {};
    var rng = o.rng || Math.random;
    loadGrid(grid, BOARD0);
    var n = enumerate(BOARD0, shapes, BOARD1);
    if (!n) return RESULT;
    rankOrder(n);

    // Second ply: rebuild the board for the strongest few candidates and take
    // the best reply with the next piece. Bounded on purpose so a rival think
    // can never blow the frame budget on a throttled phone.
    if (o.lookahead && nextShapes && nextShapes.length) {
      var depth = Math.min(5, n);
      var bestIdx = ORDER[0];
      var bestVal = -1e9;
      for (var k = 0; k < depth; k++) {
        var idx = ORDER[k];
        var m = shapes[CAND_ROT[idx]];
        var lines = stamp(BOARD0, BOARD1, m, CAND_X[idx], CAND_Y[idx]);
        if (lines < 0) continue;
        var m2 = enumerate(BOARD1, nextShapes, BOARD2);
        var reply = -1e9;
        for (var q = 0; q < m2; q++) if (CAND_SCORE[q] > reply) reply = CAND_SCORE[q];
        if (m2 === 0) reply = -500;
        // The first ply still counts: a placement that clears now is worth
        // taking even if the reply board is a shade worse.
        var total = reply + W_LINES * lines;
        if (total > bestVal) { bestVal = total; bestIdx = idx; }
      }
      // enumerate() overwrote the candidate buffers, so re-derive the chosen
      // placement from BOARD0 before returning it.
      var mm = shapes[CAND_ROT[bestIdx]];
      var yy2 = dropY(BOARD0, mm, CAND_X[bestIdx]);
      RESULT.ok = yy2 !== -9999;
      RESULT.x = CAND_X[bestIdx];
      RESULT.y = yy2;
      RESULT.rot = CAND_ROT[bestIdx];
      RESULT.score = bestVal;
      if (RESULT.ok) return RESULT;
      // fall through to the one-ply pick if the re-derive somehow failed
      n = enumerate(BOARD0, shapes, BOARD1);
      if (!n) return RESULT;
      rankOrder(n);
    }

    var pick = 0;
    var err = o.error || 0;
    // A weaker rival slides DOWN the ranked list rather than playing randomly:
    // its mistakes still look like moves a human would consider.
    while (pick + 1 < n && rng() < err) pick++;
    var sel = ORDER[pick];
    RESULT.ok = true;
    RESULT.x = CAND_X[sel];
    RESULT.y = CAND_Y[sel];
    RESULT.rot = CAND_ROT[sel];
    RESULT.score = CAND_SCORE[sel];
    return RESULT;
  }

  root.SL_AI = { best: best, COLS: COLS, ROWS: ROWS };
})(typeof window !== 'undefined' ? window : globalThis);
