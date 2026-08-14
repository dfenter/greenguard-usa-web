/* Berry Cascade - headless match-3 simulation.
 * Pure state + rules. No DOM, no Phaser, no rendering, no timers.
 * The view reads sim edges (steps returned from these calls); it never
 * writes sim state and never reseeds the sim RNG.
 */
var BC = (function () {
  'use strict';
  var BC = {};

  /* ------------------------------------------------------------ math */
  BC.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  BC.lerp = function (a, b, t) { return a + (b - a) * t; };
  BC.easeOutCubic = function (t) { return 1 - Math.pow(1 - t, 3); };
  BC.easeOutBack = function (t) {
    var c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  };
  BC.easeInQuad = function (t) { return t * t; };

  /* seeded rng (mulberry32) - deterministic, no global Math.random in sim */
  BC.rng = function (seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /* --------------------------------------------------------- board */
  var SP = { NONE: 0, LH: 1, LV: 2, BURST: 3, PRISM: 4 };
  var EMPTY = -1, ACORN = -2, PRISMC = -3;
  BC.SP = SP; BC.EMPTY = EMPTY; BC.ACORN = ACORN; BC.PRISMC = PRISMC;

  BC.W = 8; BC.H = 8;

  BC.newBoard = function (w, h) {
    var n = w * h;
    return { w: w, h: h, n: n, c: new Int8Array(n), sp: new Uint8Array(n), syr: new Uint8Array(n) };
  };
  BC.cloneBoard = function (b) {
    return { w: b.w, h: b.h, n: b.n, c: b.c.slice(), sp: b.sp.slice(), syr: b.syr.slice() };
  };

  /* ---- run detection ---- */
  function findRuns(b) {
    var runs = [], x, y, i, c, run, k, k2;
    for (y = 0; y < b.h; y++) {
      x = 0;
      while (x < b.w) {
        i = y * b.w + x; c = b.c[i];
        if (c < 0) { x++; continue; }
        var x2 = x;
        while (x2 + 1 < b.w && b.c[y * b.w + x2 + 1] === c) x2++;
        if (x2 - x + 1 >= 3) {
          run = [];
          for (k = x; k <= x2; k++) run.push(y * b.w + k);
          runs.push({ dir: 0, cells: run, color: c });
        }
        x = x2 + 1;
      }
    }
    for (x = 0; x < b.w; x++) {
      y = 0;
      while (y < b.h) {
        i = y * b.w + x; c = b.c[i];
        if (c < 0) { y++; continue; }
        var y2 = y;
        while (y2 + 1 < b.h && b.c[(y2 + 1) * b.w + x] === c) y2++;
        if (y2 - y + 1 >= 3) {
          run = [];
          for (k2 = y; k2 <= y2; k2++) run.push(k2 * b.w + x);
          runs.push({ dir: 1, cells: run, color: c });
        }
        y = y2 + 1;
      }
    }
    return runs;
  }

  function groupRuns(runs) {
    var groups = [], i, j, k, m, m2;
    for (i = 0; i < runs.length; i++) {
      var r = runs[i], hit = -1;
      for (j = 0; j < groups.length; j++) {
        var g = groups[j];
        if (g.color !== r.color) continue;
        var share = false;
        for (k = 0; k < r.cells.length && !share; k++) if (g.set[r.cells[k]]) share = true;
        if (share) { hit = j; break; }
      }
      if (hit < 0) {
        var set = {}; for (m = 0; m < r.cells.length; m++) set[r.cells[m]] = 1;
        groups.push({ color: r.color, runs: [r], set: set });
      } else {
        groups[hit].runs.push(r);
        for (m2 = 0; m2 < r.cells.length; m2++) groups[hit].set[r.cells[m2]] = 1;
      }
    }
    for (i = 0; i < groups.length; i++) {
      var cells = [];
      for (var key in groups[i].set) cells.push(key | 0);
      groups[i].cells = cells;
    }
    return groups;
  }

  BC.hasAnyMatch = function (b) { return findRuns(b).length > 0; };

  /* ---- special activation ---- */
  function pickCommonColor(b, rand, colors) {
    var counts = [0, 0, 0, 0, 0, 0], i, best = 0, bc = -1;
    for (i = 0; i < b.n; i++) if (b.c[i] >= 0 && b.c[i] < 6) counts[b.c[i]]++;
    for (i = 0; i < 6; i++) if (counts[i] > best) { best = counts[i]; bc = i; }
    if (bc < 0) bc = rand ? ((rand() * (colors || 6)) | 0) : 0;
    return bc;
  }

  function cellsOfColor(b, col) {
    var out = [], i;
    for (i = 0; i < b.n; i++) if (b.c[i] === col) out.push(i);
    return out;
  }

  function specialCells(b, idx, sp, rand) {
    var w = b.w, x = idx % w, y = (idx / w) | 0, out = [], i, j;
    if (sp === SP.LH) { for (i = 0; i < w; i++) out.push(y * w + i); }
    else if (sp === SP.LV) { for (i = 0; i < b.h; i++) out.push(i * w + x); }
    else if (sp === SP.BURST) {
      for (j = y - 1; j <= y + 1; j++) for (i = x - 1; i <= x + 1; i++)
        if (i >= 0 && i < w && j >= 0 && j < b.h) out.push(j * w + i);
    } else if (sp === SP.PRISM) {
      out = cellsOfColor(b, pickCommonColor(b, rand));
    }
    return out;
  }
  BC.specialCells = specialCells;

  /* expands special chains inside a clear-set (plain object used as a set) */
  function expand(b, set, rand, fx) {
    var q = [], i, key;
    for (key in set) { i = key | 0; if (b.sp[i] > 0) q.push(i); }
    var done = {};
    for (i = 0; i < q.length; i++) done[q[i]] = 1;
    var guard = 0;
    while (q.length && guard++ < 4096) {
      var idx = q.shift();
      var sp = b.sp[idx];
      if (!sp) continue;
      var cells = specialCells(b, idx, sp, rand);
      if (fx) fx.push({ i: idx, sp: sp });
      for (var m = 0; m < cells.length; m++) {
        var j = cells[m];
        if (j < 0 || j >= b.n) continue;
        if (b.c[j] === ACORN || b.c[j] === EMPTY) continue;
        if (!set[j]) set[j] = 1;
        if (b.sp[j] > 0 && !done[j]) { done[j] = 1; q.push(j); }
      }
    }
  }

  /* ---- one match-resolution step. swapIdx = preferred pivot, -1 for cascades ---- */
  BC.stepClear = function (b, swapIdx, rand) {
    var runs = findRuns(b);
    if (!runs.length) return null;
    var groups = groupRuns(runs);
    var set = {}, creates = [], gi, r, a, bq, ca, cb, q, ci, key;
    for (gi = 0; gi < groups.length; gi++) {
      var g = groups[gi];
      var hasH = false, hasV = false, maxRun = 0, longest = g.runs[0];
      for (r = 0; r < g.runs.length; r++) {
        var rr = g.runs[r];
        if (rr.dir === 0) hasH = true; else hasV = true;
        if (rr.cells.length > maxRun) { maxRun = rr.cells.length; longest = rr; }
      }
      var spType = SP.NONE;
      if (maxRun >= 5) spType = SP.PRISM;
      else if (hasH && hasV) spType = SP.BURST;
      else if (maxRun === 4) spType = (longest.dir === 0 ? SP.LH : SP.LV);

      var pivot = -1;
      if (spType) {
        if (swapIdx >= 0 && g.set[swapIdx]) pivot = swapIdx;
        else if (spType === SP.BURST) {
          for (a = 0; a < g.runs.length && pivot < 0; a++) {
            if (g.runs[a].dir !== 0) continue;
            for (bq = 0; bq < g.runs.length && pivot < 0; bq++) {
              if (g.runs[bq].dir !== 1) continue;
              for (ca = 0; ca < g.runs[a].cells.length && pivot < 0; ca++)
                for (cb = 0; cb < g.runs[bq].cells.length; cb++)
                  if (g.runs[a].cells[ca] === g.runs[bq].cells[cb]) { pivot = g.runs[a].cells[ca]; break; }
            }
          }
          if (pivot < 0) pivot = g.cells[(g.cells.length / 2) | 0];
        } else {
          pivot = longest.cells[(longest.cells.length / 2) | 0];
        }
        creates.push({ i: pivot, sp: spType, c: spType === SP.PRISM ? PRISMC : g.color });
      }
      for (q = 0; q < g.cells.length; q++) set[g.cells[q]] = 1;
    }
    var fx = [];
    expand(b, set, rand, fx);
    for (ci = 0; ci < creates.length; ci++) delete set[creates[ci].i];
    var cells = [];
    for (key in set) cells.push(key | 0);
    if (!cells.length && !creates.length) return null;
    return { cells: cells, creates: creates, fx: fx, combo: '' };
  };

  /* ---- swap validity ---- */
  function touchesRun(b, i) {
    var w = b.w, x = i % w, y = (i / w) | 0, c = b.c[i];
    if (c < 0) return false;
    var n = 1, k;
    for (k = x - 1; k >= 0 && b.c[y * w + k] === c; k--) n++;
    for (k = x + 1; k < w && b.c[y * w + k] === c; k++) n++;
    if (n >= 3) return true;
    n = 1;
    for (k = y - 1; k >= 0 && b.c[k * w + x] === c; k--) n++;
    for (k = y + 1; k < b.h && b.c[k * w + x] === c; k++) n++;
    return n >= 3;
  }

  BC.canSwap = function (b, i, j) {
    if (i < 0 || j < 0 || i >= b.n || j >= b.n) return false;
    if (b.c[i] === ACORN || b.c[j] === ACORN) return false;
    if (b.c[i] === EMPTY || b.c[j] === EMPTY) return false;
    if (b.sp[i] === SP.PRISM || b.sp[j] === SP.PRISM) return true;
    if (b.sp[i] > 0 && b.sp[j] > 0) return true;
    var ci = b.c[i], cj = b.c[j], si = b.sp[i], sj = b.sp[j];
    b.c[i] = cj; b.c[j] = ci; b.sp[i] = sj; b.sp[j] = si;
    var ok = touchesRun(b, i) || touchesRun(b, j);
    b.c[i] = ci; b.c[j] = cj; b.sp[i] = si; b.sp[j] = sj;
    return ok;
  };

  BC.listMoves = function (b) {
    var out = [], x, y, i;
    for (y = 0; y < b.h; y++) for (x = 0; x < b.w; x++) {
      i = y * b.w + x;
      if (x + 1 < b.w && BC.canSwap(b, i, i + 1)) out.push([i, i + 1]);
      if (y + 1 < b.h && BC.canSwap(b, i, i + b.w)) out.push([i, i + b.w]);
    }
    return out;
  };

  /* first legal move, used by the hint strip only */
  BC.firstMove = function (b) {
    var moves = BC.listMoves(b);
    return moves.length ? moves[0] : null;
  };

  BC.doSwap = function (b, i, j) {
    var c = b.c[i], s = b.sp[i];
    b.c[i] = b.c[j]; b.sp[i] = b.sp[j];
    b.c[j] = c; b.sp[j] = s;
  };

  /* Returns the first clear step after a swap, handling special+special combos. */
  BC.swapClear = function (b, i, j, rand) {
    var si = b.sp[i], sj = b.sp[j];
    var set = null, fx = [], name = '', tier = 0;
    var w = b.w, k, t, t2, t3, key, d, xa, ya, xb, yb, xx, yy;
    function addAll(list) {
      for (var q = 0; q < list.length; q++) {
        var p = list[q];
        if (p >= 0 && p < b.n && b.c[p] !== ACORN && b.c[p] !== EMPTY) set[p] = 1;
      }
    }
    function lineOrBurst(s) { return s === SP.LH || s === SP.LV || s === SP.BURST; }

    var isCombo = (si === SP.PRISM || sj === SP.PRISM || (lineOrBurst(si) && lineOrBurst(sj)));
    if (isCombo) {
      /* both swapped pieces are consumed; strip so expand() cannot re-fire them */
      b.sp[i] = SP.NONE; b.sp[j] = SP.NONE;
      if (b.c[i] === PRISMC) b.c[i] = 0;
      if (b.c[j] === PRISMC) b.c[j] = 0;
    }

    if (si === SP.PRISM && sj === SP.PRISM) {
      set = {}; name = 'Board wipe'; tier = 4;
      for (k = 0; k < b.n; k++) if (b.c[k] !== ACORN && b.c[k] !== EMPTY) set[k] = 1;
    } else if (si === SP.PRISM || sj === SP.PRISM) {
      var pi = (si === SP.PRISM) ? i : j, oi = (si === SP.PRISM) ? j : i;
      var osp = (si === SP.PRISM) ? sj : si, ocol = b.c[oi];
      set = {}; set[pi] = 1; set[oi] = 1;
      if (ocol < 0) ocol = pickCommonColor(b, rand);
      var targets = cellsOfColor(b, ocol);
      if (osp === SP.LH || osp === SP.LV) {
        name = 'Prism lines'; tier = 3;
        for (t = 0; t < targets.length; t++) b.sp[targets[t]] = (rand && rand() < 0.5) ? SP.LH : SP.LV;
      } else if (osp === SP.BURST) {
        name = 'Prism burst'; tier = 4;
        for (t2 = 0; t2 < targets.length; t2++) b.sp[targets[t2]] = SP.BURST;
      } else {
        name = 'Prism'; tier = 2;
      }
      for (t3 = 0; t3 < targets.length; t3++) set[targets[t3]] = 1;
    } else if (lineOrBurst(si) && lineOrBurst(sj)) {
      var x = i % w, y = (i / w) | 0;
      var bothBurst = (si === SP.BURST && sj === SP.BURST);
      var anyBurst = (si === SP.BURST || sj === SP.BURST);
      set = {};
      if (bothBurst) {
        name = 'Mega burst'; tier = 4;
        for (yy = y - 2; yy <= y + 2; yy++) for (xx = x - 2; xx <= x + 2; xx++)
          if (xx >= 0 && xx < w && yy >= 0 && yy < b.h) set[yy * w + xx] = 1;
      } else if (anyBurst) {
        name = 'Triple cross'; tier = 3;
        var list = [];
        for (d = -1; d <= 1; d++) {
          if (y + d >= 0 && y + d < b.h) for (xa = 0; xa < w; xa++) list.push((y + d) * w + xa);
          if (x + d >= 0 && x + d < w) for (ya = 0; ya < b.h; ya++) list.push(ya * w + (x + d));
        }
        addAll(list);
      } else {
        name = 'Cross'; tier = 2;
        var l2 = [];
        for (xb = 0; xb < w; xb++) l2.push(y * w + xb);
        for (yb = 0; yb < b.h; yb++) l2.push(yb * w + x);
        addAll(l2);
      }
      set[i] = 1; set[j] = 1;
    }

    if (set) {
      expand(b, set, rand, fx);
      var cells = [];
      for (key in set) cells.push(key | 0);
      return { cells: cells, creates: [], fx: fx, combo: name, tier: tier };
    }
    return BC.stepClear(b, i, rand) || BC.stepClear(b, j, rand);
  };

  /* ---- apply / gravity ---- */
  BC.applyClear = function (b, step, st) {
    var cells = step.cells, i, k, syr = 0, syrCells = [];
    for (k = 0; k < cells.length; k++) {
      i = cells[k];
      if (b.c[i] === ACORN || b.c[i] === EMPTY) continue;
      if (b.syr[i] > 0) { b.syr[i]--; syr++; syrCells.push(i); }
      b.c[i] = EMPTY; b.sp[i] = SP.NONE;
    }
    for (k = 0; k < step.creates.length; k++) {
      var cr = step.creates[k];
      b.c[cr.i] = cr.c; b.sp[cr.i] = cr.sp;
    }
    if (st) st.syrup += syr;
    return { cleared: cells.length, syrup: syr, syrCells: syrCells };
  };

  /* Compacts + refills until nothing is falling and no acorn rests on the floor.
   * Returns {falls: {finalIndex: cellsFallen}, acorns:[index]} for the view. */
  BC.gravity = function (b, rand, cfg, st) {
    var w = b.w, x, y, i, falls = {}, acorns = [], pass = 0, again = true;
    var colors = (cfg && cfg.colors) || 6;
    while (again && pass++ < 12) {
      again = false;
      for (x = 0; x < w; x++) {
        var bi = (b.h - 1) * w + x;
        if (b.c[bi] === ACORN) {
          acorns.push(bi); b.c[bi] = EMPTY; b.sp[bi] = SP.NONE;
          delete falls[bi];
          if (st) st.acorns++;
        }
      }
      for (x = 0; x < w; x++) {
        var write = b.h - 1;
        for (y = b.h - 1; y >= 0; y--) {
          i = y * w + x;
          if (b.c[i] === EMPTY) continue;
          if (write !== y) {
            var to = write * w + x;
            b.c[to] = b.c[i]; b.sp[to] = b.sp[i];
            b.c[i] = EMPTY; b.sp[i] = SP.NONE;
            falls[to] = (falls[i] || 0) + (write - y);
            delete falls[i];
          }
          write--;
        }
        for (y = write; y >= 0; y--) {
          var idx = y * w + x;
          var makeAcorn = false;
          if (cfg && cfg.acorns > 0 && st && st.acornSpawned < cfg.acorns) {
            var inplay = st.acornSpawned - st.acorns;
            if (inplay < 4 && rand() < 0.45) makeAcorn = true;
          }
          if (makeAcorn) { b.c[idx] = ACORN; b.sp[idx] = SP.NONE; st.acornSpawned++; }
          else { b.c[idx] = (rand() * colors) | 0; b.sp[idx] = SP.NONE; }
          falls[idx] = y + 1.4;
        }
      }
      for (x = 0; x < w; x++) if (b.c[(b.h - 1) * w + x] === ACORN) { again = true; break; }
    }
    return { falls: falls, acorns: acorns };
  };

  /* deterministic rescue layout when shuffling cannot find a legal board */
  BC.rebuildPlayable = function (b, cfg) {
    var colors = (cfg && cfg.colors) || 6, pool = [], present = {}, i, x, y;
    for (y = 0; y < b.h; y++) for (x = 0; x < b.w; x++) {
      i = y * b.w + x;
      if (b.c[i] >= 0 && b.sp[i] === SP.NONE) { pool.push(i); present[i] = 1; }
    }
    for (i = 0; i < pool.length; i++) {
      x = pool[i] % b.w; y = (pool[i] / b.w) | 0;
      b.c[pool[i]] = (x + y * 2) % colors; b.sp[pool[i]] = SP.NONE;
    }
    for (y = 0; y < b.h; y++) for (x = 0; x + 3 < b.w; x++) {
      var a = y * b.w + x;
      if (present[a] && present[a + 1] && present[a + 2] && present[a + 3]) {
        b.c[a] = 0; b.c[a + 1] = 0; b.c[a + 2] = colors > 1 ? 1 : 0; b.c[a + 3] = 0;
        if (BC.listMoves(b).length) return true;
      }
    }
    for (x = 0; x < b.w; x++) for (y = 0; y + 3 < b.h; y++) {
      var v = y * b.w + x;
      if (present[v] && present[v + b.w] && present[v + b.w * 2] && present[v + b.w * 3]) {
        b.c[v] = 0; b.c[v + b.w] = 0; b.c[v + b.w * 2] = colors > 1 ? 1 : 0; b.c[v + b.w * 3] = 0;
        if (BC.listMoves(b).length) return true;
      }
    }
    for (i = 0; i < pool.length; i++) {
      var p = pool[i], right = (p % b.w) + 1 < b.w ? p + 1 : -1, down = p + b.w;
      if (right >= 0 && present[right]) { b.sp[p] = SP.LH; b.sp[right] = SP.LV; }
      else if (down < b.n && present[down]) { b.sp[p] = SP.LH; b.sp[down] = SP.LV; }
      else continue;
      if (BC.listMoves(b).length) return true;
    }
    return BC.listMoves(b).length > 0;
  };

  BC.shuffle = function (b, rand, cfg) {
    var pool = [], i, guard = 0;
    var colors = (cfg && cfg.colors) || 6;
    for (i = 0; i < b.n; i++) if (b.c[i] >= 0 && b.sp[i] === SP.NONE) pool.push(i);
    do {
      for (i = pool.length - 1; i > 0; i--) {
        var j = (rand() * (i + 1)) | 0;
        var a = pool[i], c = pool[j];
        var t = b.c[a]; b.c[a] = b.c[c]; b.c[c] = t;
      }
      guard++;
      if (guard > 40) for (i = 0; i < pool.length; i++) b.c[pool[i]] = (rand() * colors) | 0;
    } while (guard < 90 && (BC.hasAnyMatch(b) || !BC.listMoves(b).length));
    if (BC.hasAnyMatch(b) || !BC.listMoves(b).length) BC.rebuildPlayable(b, cfg);
  };

  BC.fillFresh = function (b, rand, cfg) {
    var guard = 0, colors = (cfg && cfg.colors) || 6;
    do {
      for (var i = 0; i < b.n; i++) { b.c[i] = (rand() * colors) | 0; b.sp[i] = SP.NONE; }
      var g2 = 0;
      while (BC.hasAnyMatch(b) && g2++ < 200) {
        var runs = findRuns(b);
        for (var r = 0; r < runs.length; r++) {
          var cell = runs[r].cells[(runs[r].cells.length / 2) | 0];
          b.c[cell] = (rand() * colors) | 0;
        }
      }
      guard++;
    } while (guard < 30 && !BC.listMoves(b).length);
    if (BC.hasAnyMatch(b) || !BC.listMoves(b).length) BC.rebuildPlayable(b, cfg);
  };

  /* ------------------------------------------------------ level state */
  BC.newState = function (lv) {
    return {
      score: 0, syrup: 0, acorns: 0, acornSpawned: 0,
      moves: lv.moves, movesUsed: 0, combos: 0, bestChain: 0, cleared: 0
    };
  };

  BC.goalsMet = function (lv, st) {
    return st.score >= lv.target && st.syrup >= lv.syrupTotal && st.acorns >= lv.acorns;
  };

  BC.scoreFor = function (cleared, chain) {
    return Math.round(cleared * 60 * (1 + chain * 0.5));
  };

  /* Board for a level. seedSpecials places starter specials (generous by design).
   * The opening board is deterministic per level, so it is built once and
   * cloned afterwards: validation runs dozens of playouts and fillFresh is
   * the most expensive call in the generator. */
  var BOARD_TEMPLATE = {};
  BC.clearBoardCache = function () { BOARD_TEMPLATE = {}; };

  BC.initBoardFor = function (lv) {
    var ck = lv.mode + ':' + lv.n + ':' + lv.seed;
    var cached = BOARD_TEMPLATE[ck];
    if (cached) return { board: BC.cloneBoard(cached), rand: BC.rng(lv.seed ^ 0x2F1B) };
    var made = BC.buildBoardFor(lv);
    BOARD_TEMPLATE[ck] = BC.cloneBoard(made.board);
    return made;
  };

  BC.buildBoardFor = function (lv) {
    var rand = BC.rng(lv.seed ^ 0x2F1B);
    var b = BC.newBoard(BC.W, BC.H);
    BC.fillFresh(b, rand, lv);
    var k, s;
    for (k = 0; k < lv.syrupCells.length; k++) {
      s = lv.syrupCells[k];
      if (s.i >= 0 && s.i < b.n) b.syr[s.i] = s.l;
    }
    var want = lv.seedSpecials | 0, placed = 0, guard = 0;
    var kinds = [SP.LH, SP.LV, SP.BURST];
    while (placed < want && guard++ < 400) {
      var i = (rand() * b.n) | 0;
      if (b.c[i] < 0 || b.sp[i] !== SP.NONE || b.syr[i] > 0) continue;
      if ((i / b.w | 0) < 2) continue;               /* keep the top rows clean */
      b.sp[i] = kinds[(rand() * kinds.length) | 0];
      placed++;
    }
    if (BC.hasAnyMatch(b)) BC.shuffle(b, rand, lv);
    return { board: b, rand: rand };
  };

  /* full headless resolve of one player move (used by validation playouts) */
  function resolveAll(b, i, j, lv, st, rand) {
    var step = BC.swapClear(b, i, j, rand);
    if (!step) { BC.doSwap(b, i, j); return false; }
    var chain = 0, guard = 0;
    while (step && guard++ < 60) {
      var res = BC.applyClear(b, step, st);
      st.score += BC.scoreFor(res.cleared, chain) + res.syrup * 120;
      var gr = BC.gravity(b, rand, lv, st);
      st.score += gr.acorns.length * 500;
      chain++;
      step = BC.stepClear(b, -1, rand);
    }
    return true;
  }
  BC.resolveAll = resolveAll;

  /* ---------------------------------------------- validation bot
   * A blind uniform-random bot is far weaker than any human, so validating
   * against it inflated move budgets past 100 and shredded authored score
   * targets. The validator below is a cheap heuristic player: it scores each
   * legal swap statically (run length, special creation, special detonation,
   * syrup coverage, acorn lanes) and mostly takes the best one, with a slice
   * of random play so it never assumes perfect lookahead. Shipped budgets
   * then sit close to the authored numbers, and headroom is added on top.
   */

  /* run length through i in each axis, after the candidate swap is applied.
   * w carries goal urgency: a human hunts the last two syrup cells, so the
   * validator has to as well or it declares clearable levels impossible. */
  var DEFAULT_W = { syr: 7, acorn: 6 };
  function evalAt(b, i, lv, w) {
    var bw = b.w, x = i % bw, y = (i / bw) | 0, c = b.c[i], k, s = 0;
    w = w || DEFAULT_W;
    if (c < 0) return 0;
    var hs = x, he = x, vs = y, ve = y;
    while (hs - 1 >= 0 && b.c[y * bw + hs - 1] === c) hs--;
    while (he + 1 < bw && b.c[y * bw + he + 1] === c) he++;
    while (vs - 1 >= 0 && b.c[(vs - 1) * bw + x] === c) vs--;
    while (ve + 1 < b.h && b.c[(ve + 1) * bw + x] === c) ve++;
    var h = he - hs + 1, v = ve - vs + 1;
    if (h < 3 && v < 3) return 0;
    var cells = [];
    if (h >= 3) for (k = hs; k <= he; k++) cells.push(y * bw + k);
    if (v >= 3) for (k = vs; k <= ve; k++) if (k !== y) cells.push(k * bw + x);
    s += cells.length * 2;
    if (h >= 4 || v >= 4) s += 9;
    if (h >= 5 || v >= 5) s += 18;
    if (h >= 3 && v >= 3) s += 12;
    for (k = 0; k < cells.length; k++) {
      var ci = cells[k];
      if (b.syr[ci] > 0) s += w.syr;
      if (lv && lv.acorns > 0) {
        var cx = ci % b.w;
        for (var yy = ((ci / b.w) | 0) - 1; yy >= 0; yy--) {
          if (b.c[yy * b.w + cx] === ACORN) { s += w.acorn; break; }
        }
      }
      if (b.sp[ci] > 0) s += 14;
    }
    return s;
  }

  BC.moveScore = function (b, i, j, lv, w) {
    var si = b.sp[i], sj = b.sp[j], s = 0;
    if (si === SP.PRISM || sj === SP.PRISM) s += (si > 0 && sj > 0) ? 70 : 34;
    else if (si > 0 && sj > 0) s += 46;
    else if (si > 0 || sj > 0) s += 6;
    BC.doSwap(b, i, j);
    s += evalAt(b, i, lv, w) + evalAt(b, j, lv, w);
    BC.doSwap(b, i, j);
    return s;
  };

  /* goal urgency weights for the validation bot, recomputed each move */
  BC.botWeights = function (lv, st) {
    var syrLeft = lv.syrupTotal - st.syrup;
    var acLeft = lv.acorns - st.acorns;
    return {
      syr: syrLeft <= 0 ? 0 : (syrLeft <= 6 ? 44 : (syrLeft <= 14 ? 20 : 8)),
      acorn: acLeft <= 0 ? 0 : (acLeft <= 2 ? 26 : 14)
    };
  };

  /* A heuristic bot plays the level. greed 0 = uniform random, 1 = always best. */
  BC.playout = function (lv, seed, greed) {
    var init = BC.initBoardFor(lv);
    var b = init.board;
    var rand = BC.rng(seed);
    var st = BC.newState(lv);
    var guard = 0;
    if (greed == null) greed = 0.75;
    while (st.moves > 0 && guard++ < 400) {
      if (BC.goalsMet(lv, st)) return true;
      var moves = BC.listMoves(b);
      if (!moves.length) { BC.shuffle(b, rand, lv); moves = BC.listMoves(b); if (!moves.length) break; }
      var m, w = BC.botWeights(lv, st);
      if (rand() < greed) {
        var best = -1, bs = -1, k;
        for (k = 0; k < moves.length; k++) {
          var sc = BC.moveScore(b, moves[k][0], moves[k][1], lv, w) + rand() * 2;
          if (sc > bs) { bs = sc; best = k; }
        }
        m = moves[best < 0 ? 0 : best];
      } else {
        m = moves[(rand() * moves.length) | 0];
      }
      BC.doSwap(b, m[0], m[1]);
      resolveAll(b, m[0], m[1], lv, st, rand);
      st.moves--;
    }
    return BC.goalsMet(lv, st);
  };

  /* Plays the whole move budget ignoring goals and reports the score reached.
   * Score targets are derived from this rather than hand-picked absolutes:
   * a fixed number cannot know that three seeded specials on an early board
   * pay 5000 points in one swipe. */
  BC.scoreRun = function (lv, seed) {
    var init = BC.initBoardFor(lv);
    var b = init.board;
    var rand = BC.rng(seed);
    var st = BC.newState(lv);
    var guard = 0, k;
    while (st.moves > 0 && guard++ < 400) {
      var moves = BC.listMoves(b);
      if (!moves.length) { BC.shuffle(b, rand, lv); moves = BC.listMoves(b); if (!moves.length) break; }
      var best = 0, bs = -1, w = BC.botWeights(lv, st);
      for (k = 0; k < moves.length; k++) {
        var sc = BC.moveScore(b, moves[k][0], moves[k][1], lv, w) + rand() * 2;
        if (sc > bs) { bs = sc; best = k; }
      }
      var m = moves[rand() < 0.75 ? best : ((rand() * moves.length) | 0)];
      BC.doSwap(b, m[0], m[1]);
      resolveAll(b, m[0], m[1], lv, st, rand);
      st.moves--;
    }
    return st.score;
  };

  BC.medianScoreRun = function (lv, seedBase, n) {
    var runs = [], i;
    n = n || 3;
    for (i = 0; i < n; i++) runs.push(BC.scoreRun(lv, (seedBase + i * 6151) >>> 0));
    runs.sort(function (a, b) { return a - b; });
    return runs[(runs.length / 2) | 0];
  };

  /* Raises the move budget until the heuristic bot clears the level, then
   * adds headroom on top. The score target may only be relaxed down to
   * opts.minTarget (authored gauntlet targets are never relaxed), and the
   * budget is hard-capped so a pathological level cannot produce a 100-move
   * grove or stall level entry. */
  BC.validate = function (lv, opts) {
    opts = opts || {};
    var headroom = opts.headroom == null ? 6 : opts.headroom;
    var maxMoves = opts.maxMoves == null ? 34 : opts.maxMoves;
    var floor = Math.round(lv.target * (opts.minTargetFactor == null ? 0.78 : opts.minTargetFactor));
    var tries = opts.tries || 5, need = opts.need || 2;
    var bump = 0, k, salt = (lv.n | 0) * 977 + 0x1234;

    while (bump < 22) {
      var pass = 0, fail = 0;
      for (k = 0; k < tries; k++) {
        if (BC.playout(lv, salt + bump * 7717 + k * 31)) pass++; else fail++;
        if (pass >= need) break;
        if (tries - fail < need) break;
      }
      if (pass >= need) break;
      var grew = false;
      if (lv.moves < maxMoves) { lv.moves += 2; grew = true; }
      if (bump % 3 === 2 && lv.target > floor) {
        lv.target = Math.max(floor, Math.round(lv.target * 0.94));
        grew = true;
      }
      if (!grew) break;                          /* both knobs are at their cap */
      bump++;
    }
    lv.validatedMoves = lv.moves;
    lv.moves += headroom;
    return lv;
  };

  return BC;
})();
