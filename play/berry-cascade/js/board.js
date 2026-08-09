/* Berry Cascade - headless match-3 engine, level generation, playout validation */
(function (BC) {
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

  function isMatchable(b, i) { return b.c[i] >= 0; }

  /* ---- run detection ---- */
  function findRuns(b) {
    var runs = [], x, y, i, c, run;
    for (y = 0; y < b.h; y++) {
      x = 0;
      while (x < b.w) {
        i = y * b.w + x; c = b.c[i];
        if (c < 0) { x++; continue; }
        var x2 = x;
        while (x2 + 1 < b.w && b.c[y * b.w + x2 + 1] === c) x2++;
        if (x2 - x + 1 >= 3) {
          run = [];
          for (var k = x; k <= x2; k++) run.push(y * b.w + k);
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
          for (var k2 = y; k2 <= y2; k2++) run.push(k2 * b.w + x);
          runs.push({ dir: 1, cells: run, color: c });
        }
        y = y2 + 1;
      }
    }
    return runs;
  }

  function groupRuns(runs) {
    var groups = [], i, j;
    for (i = 0; i < runs.length; i++) {
      var r = runs[i], hit = -1;
      for (j = 0; j < groups.length; j++) {
        var g = groups[j];
        if (g.color !== r.color) continue;
        var share = false;
        for (var k = 0; k < r.cells.length && !share; k++) if (g.set[r.cells[k]]) share = true;
        if (share) { hit = j; break; }
      }
      if (hit < 0) {
        var set = {}; for (var m = 0; m < r.cells.length; m++) set[r.cells[m]] = 1;
        groups.push({ color: r.color, runs: [r], set: set });
      } else {
        groups[hit].runs.push(r);
        for (var m2 = 0; m2 < r.cells.length; m2++) groups[hit].set[r.cells[m2]] = 1;
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

  /* ---- special activation expansion ---- */
  function pickCommonColor(b, rand) {
    var counts = [0, 0, 0, 0, 0, 0], i, best = 0, bc = -1;
    for (i = 0; i < b.n; i++) if (b.c[i] >= 0) counts[b.c[i]]++;
    for (i = 0; i < 6; i++) if (counts[i] > best) { best = counts[i]; bc = i; }
    if (bc < 0) bc = rand ? Math.floor(rand() * 6) : 0;
    return bc;
  }

  function cellsOfColor(b, col) {
    var out = [], i;
    for (i = 0; i < b.n; i++) if (b.c[i] === col) out.push(i);
    return out;
  }

  // expands special chains inside a clear-set (object used as set)
  function expand(b, set, rand, fx) {
    var q = [], i;
    for (var key in set) { i = key | 0; if (b.sp[i] > 0) q.push(i); }
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

  function specialCells(b, idx, sp, rand) {
    var w = b.w, x = idx % w, y = (idx / w) | 0, out = [], i, j;
    if (sp === SP.LH) { for (i = 0; i < w; i++) out.push(y * w + i); }
    else if (sp === SP.LV) { for (i = 0; i < b.h; i++) out.push(i * w + x); }
    else if (sp === SP.BURST) {
      for (j = y - 1; j <= y + 1; j++) for (i = x - 1; i <= x + 1; i++)
        if (i >= 0 && i < w && j >= 0 && j < b.h) out.push(j * w + i);
    } else if (sp === SP.PRISM) {
      var col = pickCommonColor(b, rand);
      out = cellsOfColor(b, col);
    }
    return out;
  }
  BC.specialCells = specialCells;

  /* ---- one match-resolution step ---- */
  // swapIdx: preferred pivot for special creation (-1 for cascades)
  BC.stepClear = function (b, swapIdx, rand) {
    var runs = findRuns(b);
    if (!runs.length) return null;
    var groups = groupRuns(runs);
    var set = {}, creates = [], gi;
    for (gi = 0; gi < groups.length; gi++) {
      var g = groups[gi];
      var hasH = false, hasV = false, maxRun = 0, longest = g.runs[0];
      for (var r = 0; r < g.runs.length; r++) {
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
          // intersection cell of an h-run and a v-run
          for (var a = 0; a < g.runs.length && pivot < 0; a++) {
            if (g.runs[a].dir !== 0) continue;
            for (var bq = 0; bq < g.runs.length && pivot < 0; bq++) {
              if (g.runs[bq].dir !== 1) continue;
              for (var ca = 0; ca < g.runs[a].cells.length && pivot < 0; ca++)
                for (var cb = 0; cb < g.runs[bq].cells.length; cb++)
                  if (g.runs[a].cells[ca] === g.runs[bq].cells[cb]) { pivot = g.runs[a].cells[ca]; break; }
            }
          }
          if (pivot < 0) pivot = g.cells[(g.cells.length / 2) | 0];
        } else {
          pivot = longest.cells[(longest.cells.length / 2) | 0];
        }
        creates.push({ i: pivot, sp: spType, c: spType === SP.PRISM ? PRISMC : g.color });
      }
      for (var q = 0; q < g.cells.length; q++) set[g.cells[q]] = 1;
    }
    var fx = [];
    expand(b, set, rand, fx);
    // created specials survive
    for (var ci = 0; ci < creates.length; ci++) delete set[creates[ci].i];
    var cells = [];
    for (var key in set) cells.push(key | 0);
    if (!cells.length && !creates.length) return null;
    return { cells: cells, creates: creates, fx: fx };
  };

  /* ---- swap validity + combos ---- */
  BC.canSwap = function (b, i, j) {
    if (b.c[i] === ACORN || b.c[j] === ACORN) return false;
    if (b.c[i] === EMPTY || b.c[j] === EMPTY) return false;
    if (b.sp[i] === SP.PRISM || b.sp[j] === SP.PRISM) return true;
    if (b.sp[i] > 0 && b.sp[j] > 0) return true;
    // simulate
    var ci = b.c[i], cj = b.c[j], si = b.sp[i], sj = b.sp[j];
    b.c[i] = cj; b.c[j] = ci; b.sp[i] = sj; b.sp[j] = si;
    var ok = touchesRun(b, i) || touchesRun(b, j);
    b.c[i] = ci; b.c[j] = cj; b.sp[i] = si; b.sp[j] = sj;
    return ok;
  };

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

  BC.listMoves = function (b) {
    var out = [], x, y, i;
    for (y = 0; y < b.h; y++) for (x = 0; x < b.w; x++) {
      i = y * b.w + x;
      if (x + 1 < b.w && BC.canSwap(b, i, i + 1)) out.push([i, i + 1]);
      if (y + 1 < b.h && BC.canSwap(b, i, i + b.w)) out.push([i, i + b.w]);
    }
    return out;
  };

  BC.doSwap = function (b, i, j) {
    var c = b.c[i], s = b.sp[i];
    b.c[i] = b.c[j]; b.sp[i] = b.sp[j];
    b.c[j] = c; b.sp[j] = s;
  };

  // Returns the first clear step after a swap (handles special+special combos).
  BC.swapClear = function (b, i, j, rand) {
    var si = b.sp[i], sj = b.sp[j];
    var set = null, fx = [], name = '';
    var w = b.w;
    function addAll(list) { for (var k = 0; k < list.length; k++) { var q = list[k]; if (q >= 0 && q < b.n && b.c[q] !== ACORN && b.c[q] !== EMPTY) set[q] = 1; } }
    function lineOrBurst(s) { return s === SP.LH || s === SP.LV || s === SP.BURST; }

    var isCombo = (si === SP.PRISM || sj === SP.PRISM || (lineOrBurst(si) && lineOrBurst(sj)));
    if (isCombo) {
      // both swapped pieces are consumed by the combo; strip them so expand() can't re-fire them
      b.sp[i] = SP.NONE; b.sp[j] = SP.NONE;
      if (b.c[i] === PRISMC) b.c[i] = 0;
      if (b.c[j] === PRISMC) b.c[j] = 0;
    }

    if (si === SP.PRISM && sj === SP.PRISM) {
      set = {}; name = 'BOARD WIPE!';
      for (var k = 0; k < b.n; k++) if (b.c[k] !== ACORN && b.c[k] !== EMPTY) set[k] = 1;
    } else if (si === SP.PRISM || sj === SP.PRISM) {
      var pi = (si === SP.PRISM) ? i : j, oi = (si === SP.PRISM) ? j : i;
      var osp = (si === SP.PRISM) ? sj : si, ocol = b.c[oi];
      set = {}; set[pi] = 1; set[oi] = 1;
      if (ocol < 0) ocol = pickCommonColor(b, rand);
      var targets = cellsOfColor(b, ocol);
      if (osp === SP.LH || osp === SP.LV) {
        name = 'PRISM LINES!';
        for (var t = 0; t < targets.length; t++) b.sp[targets[t]] = (rand && rand() < 0.5) ? SP.LH : SP.LV;
      } else if (osp === SP.BURST) {
        name = 'PRISM BURST!';
        for (var t2 = 0; t2 < targets.length; t2++) b.sp[targets[t2]] = SP.BURST;
      } else {
        name = 'PRISM!';
      }
      for (var t3 = 0; t3 < targets.length; t3++) set[targets[t3]] = 1;
    } else if (lineOrBurst(si) && lineOrBurst(sj)) {
      var x = i % w, y = (i / w) | 0;
      var bothBurst = (si === SP.BURST && sj === SP.BURST);
      var anyBurst = (si === SP.BURST || sj === SP.BURST);
      set = {};
      if (bothBurst) {
        name = 'MEGA BURST!';
        for (var yy = y - 2; yy <= y + 2; yy++) for (var xx = x - 2; xx <= x + 2; xx++)
          if (xx >= 0 && xx < w && yy >= 0 && yy < b.h) set[yy * w + xx] = 1;
      } else if (anyBurst) {
        name = 'TRIPLE CROSS!';
        var list = [];
        for (var d = -1; d <= 1; d++) {
          if (y + d >= 0 && y + d < b.h) for (var xa = 0; xa < w; xa++) list.push((y + d) * w + xa);
          if (x + d >= 0 && x + d < w) for (var ya = 0; ya < b.h; ya++) list.push(ya * w + (x + d));
        }
        addAll(list);
      } else {
        name = 'CROSS!';
        var l2 = [];
        for (var xb = 0; xb < w; xb++) l2.push(y * w + xb);
        for (var yb = 0; yb < b.h; yb++) l2.push(yb * w + x);
        addAll(l2);
      }
      set[i] = 1; set[j] = 1;
    }

    if (set) {
      expand(b, set, rand, fx);
      var cells = [];
      for (var key in set) cells.push(key | 0);
      return { cells: cells, creates: [], fx: fx, combo: name };
    }
    return BC.stepClear(b, i, rand) || BC.stepClear(b, j, rand);
  };

  /* ---- apply / gravity ---- */
  BC.applyClear = function (b, step, st) {
    var cells = step.cells, i, k, syr = 0;
    for (k = 0; k < cells.length; k++) {
      i = cells[k];
      if (b.c[i] === ACORN || b.c[i] === EMPTY) continue;
      if (b.syr[i] > 0) { b.syr[i]--; syr++; }
      b.c[i] = EMPTY; b.sp[i] = SP.NONE;
    }
    for (k = 0; k < step.creates.length; k++) {
      var cr = step.creates[k];
      b.c[cr.i] = cr.c; b.sp[cr.i] = cr.sp;
    }
    if (st) { st.syrup += syr; }
    return { cleared: cells.length, syrup: syr };
  };

  // Compacts + refills until nothing is left falling and no acorn is sitting on the floor.
  // Returns {falls: {finalIndex: cellsFallen}, acorns:[index]} so the view can animate the drop.
  BC.gravity = function (b, rand, cfg, st) {
    var w = b.w, x, y, i, falls = {}, acorns = [], pass = 0, again = true;
    while (again && pass++ < 12) {
      again = false;
      // 1. anything resting on the floor that is an acorn gets delivered
      for (x = 0; x < w; x++) {
        var bi = (b.h - 1) * w + x;
        if (b.c[bi] === ACORN) {
          acorns.push(bi); b.c[bi] = EMPTY; b.sp[bi] = SP.NONE;
          delete falls[bi];
          if (st) st.acorns++;
        }
      }
      // 2. compact each column, then refill the gap at the top
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
            if (inplay < 3 && rand() < 0.34) makeAcorn = true;
          }
          if (makeAcorn) { b.c[idx] = ACORN; b.sp[idx] = SP.NONE; st.acornSpawned++; }
          else { b.c[idx] = (rand() * cfg.colors) | 0; b.sp[idx] = SP.NONE; }
          falls[idx] = y + 1.4;
        }
      }
      // 3. a freshly landed acorn on the floor means another delivery pass
      for (x = 0; x < w; x++) if (b.c[(b.h - 1) * w + x] === ACORN) { again = true; break; }
    }
    return { falls: falls, acorns: acorns };
  };

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
    for (i = 0; i < b.n; i++) if (b.c[i] >= 0 && b.sp[i] === SP.NONE) pool.push(i);
    do {
      for (i = pool.length - 1; i > 0; i--) {
        var j = (rand() * (i + 1)) | 0;
        var a = pool[i], c = pool[j];
        var t = b.c[a]; b.c[a] = b.c[c]; b.c[c] = t;
      }
      guard++;
      if (guard > 40) {
        for (i = 0; i < pool.length; i++) b.c[pool[i]] = (rand() * cfg.colors) | 0;
      }
    } while (guard < 90 && (BC.hasAnyMatch(b) || !BC.listMoves(b).length));
    if (BC.hasAnyMatch(b) || !BC.listMoves(b).length) BC.rebuildPlayable(b, cfg);
  };

  BC.fillFresh = function (b, rand, cfg) {
    var guard = 0;
    do {
      for (var i = 0; i < b.n; i++) { b.c[i] = (rand() * cfg.colors) | 0; b.sp[i] = SP.NONE; }
      var g2 = 0;
      while (BC.hasAnyMatch(b) && g2++ < 200) {
        var runs = findRuns(b);
        for (var r = 0; r < runs.length; r++) {
          var cell = runs[r].cells[(runs[r].cells.length / 2) | 0];
          b.c[cell] = (rand() * cfg.colors) | 0;
        }
      }
      guard++;
    } while (guard < 30 && !BC.listMoves(b).length);
    if (BC.hasAnyMatch(b) || !BC.listMoves(b).length) BC.rebuildPlayable(b, cfg);
  };

  /* ---------------- level generation ---------------- */
  var LEVEL_CACHE = {};

  BC.levelName = function (n) {
    var names = ['Dew Hollow', 'Sunny Bramble', 'Amber Steps', 'Ribbon Creek', 'Thistle Bend',
      'Copper Grove', 'Moss Gate', 'Quiet Orchard', 'Hazel Rise', 'Syrup Flats',
      'Lantern Wood', 'Glass Pond', 'Rook Meadow', 'Cider Pass', 'Warm Hollow',
      'Bracken Mile', 'Ember Ridge', 'Fern Terrace', 'Acorn Vault', 'Peppermint Bay',
      'Frost Bramble', 'Sable Marsh', 'Gilded Rows', 'Nettle Climb', 'Cloud Orchard',
      'Sunset Bluff', 'Storm Arbor', 'Crown Thicket', 'Last Grove', 'Cascade Peak'];
    return names[n] || ('Grove ' + (n + 1));
  };

  function baseLevel(n) {
    var rand = BC.rng(0x51ED + n * 7919 + 13);
    var colors = n < 5 ? 4 : (n < 15 ? 5 : 6);
    var kind = n % 4;
    var lv = {
      n: n, seed: 0x51ED + n * 7919 + 13, colors: colors,
      target: 2600 + n * 500,
      syrupCells: [], syrupTotal: 0, acorns: 0,
      moves: 0, name: BC.levelName(n)
    };
    var W = BC.W, H = BC.H;
    if (kind === 1 || kind === 3) {
      // syrup lives in a contiguous patch (readable, and reachable by cascades)
      var count = Math.min(20, 5 + Math.ceil(n * 0.55));
      var bw = BC.clamp(Math.ceil(Math.sqrt(count * 1.5)), 4, W);
      var bh = BC.clamp(Math.ceil(count / bw), 1, H);
      var x0 = ((rand() * (W - bw + 1)) | 0);
      var y0 = (n % 2 === 0) ? (H - bh) : BC.clamp(2 + ((rand() * (H - bh - 2)) | 0), 0, H - bh);
      var placed = 0;
      for (var yy = y0; yy < y0 + bh && placed < count; yy++) {
        for (var xx = x0; xx < x0 + bw && placed < count; xx++) {
          var layers = (n >= 18 && rand() < 0.25) ? 2 : 1;
          lv.syrupCells.push({ i: yy * W + xx, l: layers });
          lv.syrupTotal += layers;
          placed++;
        }
      }
    }
    if (kind === 2 || kind === 3) {
      lv.acorns = Math.min(3, 1 + Math.floor(n / 11));
    }
    lv.moves = 20 + (kind === 3 ? 4 : 0) + Math.floor(n / 8) * 2;
    return lv;
  }

  BC.initBoardFor = function (lv) {
    var rand = BC.rng(lv.seed ^ 0x2F1B);
    var b = BC.newBoard(BC.W, BC.H);
    BC.fillFresh(b, rand, lv);
    for (var k = 0; k < lv.syrupCells.length; k++) {
      var s = lv.syrupCells[k];
      b.syr[s.i] = s.l;
    }
    return { board: b, rand: rand };
  };

  BC.goalsMet = function (lv, st) {
    return st.score >= lv.target && st.syrup >= lv.syrupTotal && st.acorns >= lv.acorns;
  };

  BC.newState = function (lv) {
    return { score: 0, syrup: 0, acorns: 0, acornSpawned: 0, moves: lv.moves };
  };

  BC.scoreFor = function (cleared, chain) {
    var mult = 1 + chain * 0.5;
    return Math.round(cleared * 60 * mult);
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

  function playout(lv, seed) {
    var init = BC.initBoardFor(lv);
    var b = init.board;
    var rand = BC.rng(seed);
    var st = BC.newState(lv);
    var guard = 0;
    while (st.moves > 0 && guard++ < 400) {
      if (BC.goalsMet(lv, st)) return true;
      var moves = BC.listMoves(b);
      if (!moves.length) { BC.shuffle(b, rand, lv); moves = BC.listMoves(b); if (!moves.length) break; }
      var m = moves[(rand() * moves.length) | 0];
      BC.doSwap(b, m[0], m[1]);
      resolveAll(b, m[0], m[1], lv, st, rand);
      st.moves--;
    }
    return BC.goalsMet(lv, st);
  }

  // random-playout validation: bump the move budget until a random bot clears it often enough
  BC.getLevel = function (n) {
    if (LEVEL_CACHE[n]) return LEVEL_CACHE[n];
    var lv = baseLevel(n);
    var TRIES = 6, NEED = 2, bump = 0;  // bounded validation keeps level loading responsive
    while (bump < 16) {
      var pass = 0, fail = 0, ok = false;
      for (var k = 0; k < TRIES; k++) {
        if (playout(lv, 0x1234 + n * 977 + k * 31)) pass++; else fail++;
        if (pass >= NEED) { ok = true; break; }
        if (TRIES - fail < NEED) break;    // cannot reach the bar; stop early
      }
      if (ok) break;
      // relax: more moves, and every third round trim the score target too
      lv.moves += 3;
      if (bump % 3 === 2 && lv.target > 900) lv.target = Math.round(lv.target * 0.9);
      bump++;
    }
    lv.moves += 5; // safety margin over the validated budget (players beat blind random play)
    // confirmation pass on independent seeds, so a lucky sample can't ship an impossible grove
    for (var round = 0; round < 6; round++) {
      var p2 = 0, f2 = 0;
      for (var v = 0; v < 10; v++) {
        if (playout(lv, 0x77E1 + n * 613 + v * 149)) p2++; else f2++;
        if (p2 >= 2) break;
        if (10 - f2 < 2) break;
      }
      if (p2 >= 2) break;
      lv.moves += 4;
      if (lv.target > 900) lv.target = Math.round(lv.target * 0.94);
    }
    lv.stars = [lv.target, Math.round(lv.target * 2.5), Math.round(lv.target * 4.5)];
    LEVEL_CACHE[n] = lv;
    return lv;
  };

  BC.endlessLevel = function (stage) {
    var s = Math.min(stage, 8);
    return {
      n: -1, seed: (Date.now() & 0x7fffffff) ^ 0x9E37,
      colors: s < 2 ? 4 : (s < 5 ? 5 : 6),
      target: 0, syrupCells: [], syrupTotal: 0, acorns: 0,
      moves: 20, name: 'Endless Cascade', stars: [0, 0, 0]
    };
  };
})(BC);
