/* Fizzlift - dual-gravity match board.
   Air region (rows < bnd[c]) falls DOWN. Fizz region (rows >= bnd[c]) floats UP.
   Pieces pack against the fizz surface from both sides; refill enters from the
   top (air) and the bottom (fizz). Caps that reach the surface row pop free. */
(function (FZ) {

  var COLS = 7, ROWS = 9;
  FZ.COLS = COLS; FZ.ROWS = ROWS;

  var K = { NORM: 0, CAP: 1, SEAL: 2, BOMB: 3, SURGE: 4 };
  FZ.K = K;

  var nextId = 1;

  function mkCell(col, k, r, c, ry) {
    return { col: col, k: k, hp: (k === K.SEAL ? 2 : 0), r: r, c: c, rx: c, ry: (ry === undefined ? r : ry), id: nextId++, dying: 0, born: 1 };
  }

  function idx(r, c) { return r * COLS + c; }
  FZ.idx = idx;

  function matchable(cell) { return !!cell && cell.col >= 0 && !cell.dying; }
  function swappable(cell) { return !!cell && (cell.k === K.NORM || cell.k === K.BOMB || cell.k === K.SURGE); }
  FZ.swappable = swappable;

  /* ---------- boundaries ---------- */
  function recomputeBnd(b) {
    for (var c = 0; c < COLS; c++) {
      var w = b.wave ? Math.round(b.wave * Math.sin(b.phase + c * 0.85)) : 0;
      b.bnd[c] = FZ.clamp(b.base[c] + b.valve[c] + w, 1, ROWS - 1);
    }
  }
  FZ.recomputeBnd = recomputeBnd;

  /* ---------- construction ---------- */
  FZ.makeBoard = function (cfg) {
    var b = {
      cfg: cfg,
      colors: FZ.clamp(cfg.colors || 5, 3, 6),
      g: new Array(COLS * ROWS),
      base: new Int8Array(COLS),
      valve: new Int8Array(COLS),
      bnd: new Int8Array(COLS),
      wave: cfg.wave || 0,
      phase: 0,
      rnd: FZ.rng(cfg.seed),
      capsOut: 0,       // caps surfaced
      capsLive: 0,      // caps on the board
      sealsLeft: 0,
      sealsTotal: 0,
      score: 0,
      spawnCaps: true
    };
    for (var c = 0; c < COLS; c++) {
      b.base[c] = FZ.clamp(FZ.bndPattern(cfg.bp, c, COLS, ROWS), 1, ROWS - 1);
      b.valve[c] = 0;
    }
    recomputeBnd(b);

    /* fill with no starting matches */
    for (var r = 0; r < ROWS; r++) {
      for (c = 0; c < COLS; c++) {
        var tries = 0, col;
        do {
          col = (b.rnd() * b.colors) | 0;
          tries++;
        } while (tries < 24 && makesRun(b, r, c, col));
        b.g[idx(r, c)] = mkCell(col, K.NORM, r, c);
      }
    }

    /* seals: scattered, never on the same cell, biased into the fizz half */
    var want = FZ.clamp(cfg.seals | 0, 0, 8), placed = 0, guard = 0;
    while (placed < want && guard++ < 400) {
      var sc = (b.rnd() * COLS) | 0;
      var lo = b.bnd[sc], hi = ROWS - 1;
      var sr = lo + ((b.rnd() * Math.max(1, hi - lo + 1)) | 0);
      sr = FZ.clamp(sr, 0, ROWS - 1);
      var cell = b.g[idx(sr, sc)];
      if (!cell || cell.k !== K.NORM) continue;
      if (neighbourKind(b, sr, sc, K.SEAL)) continue;
      b.g[idx(sr, sc)] = mkCell(-1, K.SEAL, sr, sc);
      placed++;
    }
    b.sealsLeft = placed; b.sealsTotal = placed;

    /* a couple of starter caps low in the fizz */
    var caps = Math.min(2, cfg.caps | 0), cg = 0;
    while (caps > 0 && cg++ < 200) {
      var cc = (b.rnd() * COLS) | 0;
      var cr = ROWS - 1 - ((b.rnd() * 2) | 0);
      if (cr < b.bnd[cc]) continue;
      var t = b.g[idx(cr, cc)];
      if (!t || t.k !== K.NORM) continue;
      b.g[idx(cr, cc)] = mkCell(-1, K.CAP, cr, cc);
      b.capsLive++; caps--;
    }

    clearStartingRuns(b);
    return b;
  };

  function neighbourKind(b, r, c, k) {
    var d = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (var i = 0; i < 4; i++) {
      var rr = r + d[i][0], cc = c + d[i][1];
      if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) continue;
      var t = b.g[idx(rr, cc)];
      if (t && t.k === k) return true;
    }
    return false;
  }

  function makesRun(b, r, c, col) {
    var a = c >= 2 && b.g[idx(r, c - 1)] && b.g[idx(r, c - 2)] &&
      b.g[idx(r, c - 1)].col === col && b.g[idx(r, c - 2)].col === col;
    var v = r >= 2 && b.g[idx(r - 1, c)] && b.g[idx(r - 2, c)] &&
      b.g[idx(r - 1, c)].col === col && b.g[idx(r - 2, c)].col === col;
    return a || v;
  }

  function clearStartingRuns(b) {
    for (var pass = 0; pass < 12; pass++) {
      var runs = FZ.findRuns(b);
      if (!runs.length) return;
      for (var i = 0; i < runs.length; i++) {
        var run = runs[i];
        var t = b.g[run[(run.length / 2) | 0]];
        if (t && t.k === K.NORM) {
          var col = t.col;
          for (var g = 0; g < 8; g++) { var n = (b.rnd() * b.colors) | 0; if (n !== col) { t.col = n; break; } }
        }
      }
    }
  }

  /* ---------- matching ---------- */
  FZ.findRuns = function (b) {
    var runs = [], r, c, i;
    for (r = 0; r < ROWS; r++) {
      c = 0;
      while (c < COLS) {
        var cell = b.g[idx(r, c)];
        if (!matchable(cell)) { c++; continue; }
        var e = c + 1;
        while (e < COLS) { var n = b.g[idx(r, e)]; if (matchable(n) && n.col === cell.col) e++; else break; }
        if (e - c >= 3) { var run = []; for (i = c; i < e; i++) run.push(idx(r, i)); run.horiz = true; runs.push(run); }
        c = e;
      }
    }
    for (c = 0; c < COLS; c++) {
      r = 0;
      while (r < ROWS) {
        var cl = b.g[idx(r, c)];
        if (!matchable(cl)) { r++; continue; }
        var e2 = r + 1;
        while (e2 < ROWS) { var n2 = b.g[idx(e2, c)]; if (matchable(n2) && n2.col === cl.col) e2++; else break; }
        if (e2 - r >= 3) { var run2 = []; for (i = r; i < e2; i++) run2.push(idx(i, c)); run2.horiz = false; runs.push(run2); }
        r = e2;
      }
    }
    return runs;
  };

  FZ.hasMove = function (b) {
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        if (c + 1 < COLS && testSwap(b, r, c, r, c + 1)) return true;
        if (r + 1 < ROWS && testSwap(b, r, c, r + 1, c)) return true;
      }
    }
    return false;
  };

  function testSwap(b, r1, c1, r2, c2) {
    var a = b.g[idx(r1, c1)], d = b.g[idx(r2, c2)];
    if (!swappable(a) || !swappable(d)) return false;
    b.g[idx(r1, c1)] = d; b.g[idx(r2, c2)] = a;
    var ok = FZ.findRuns(b).length > 0;
    b.g[idx(r1, c1)] = a; b.g[idx(r2, c2)] = d;
    return ok;
  }
  FZ.testSwap = testSwap;

  FZ.doSwap = function (b, r1, c1, r2, c2) {
    var a = b.g[idx(r1, c1)], d = b.g[idx(r2, c2)];
    b.g[idx(r1, c1)] = d; b.g[idx(r2, c2)] = a;
    if (a) { a.r = r2; a.c = c2; }
    if (d) { d.r = r1; d.c = c1; }
  };

  FZ.shuffle = function (b) {
    var pool = [], i, cell;
    for (i = 0; i < b.g.length; i++) { cell = b.g[i]; if (cell && cell.k === K.NORM) pool.push(cell); }
    for (var pass = 0; pass < 30; pass++) {
      for (i = pool.length - 1; i > 0; i--) {
        var j = (b.rnd() * (i + 1)) | 0;
        var t = pool[i].col; pool[i].col = pool[j].col; pool[j].col = t;
      }
      if (FZ.findRuns(b).length === 0 && FZ.hasMove(b)) return true;
    }
    return false;
  };

  /* ---------- gravity ---------- */
  /* Returns true if any cell changed row/col or was spawned. */
  FZ.settle = function (b) {
    var moved = false;
    for (var c = 0; c < COLS; c++) {
      var bn = b.bnd[c], r, i, cell, list;

      /* AIR: rows 0..bn-1, pack to the bottom of the region */
      list = [];
      for (r = 0; r < bn; r++) { cell = b.g[idx(r, c)]; if (cell) { list.push(cell); b.g[idx(r, c)] = null; } }
      var start = bn - list.length;
      for (i = 0; i < list.length; i++) moved = place(b, start + i, c, list[i]) || moved;
      for (r = 0; r < start; r++) {
        var nc = spawn(b, c, false, start - r);
        place(b, r, c, nc); moved = true;
      }

      /* FIZZ: rows bn..ROWS-1, pack to the top of the region (the surface) */
      list = [];
      for (r = bn; r < ROWS; r++) { cell = b.g[idx(r, c)]; if (cell) { list.push(cell); b.g[idx(r, c)] = null; } }
      for (i = 0; i < list.length; i++) moved = place(b, bn + i, c, list[i]) || moved;
      for (r = bn + list.length; r < ROWS; r++) {
        var nc2 = spawn(b, c, true, r - (bn + list.length) + 1);
        place(b, r, c, nc2); moved = true;
      }
    }
    return moved;
  };

  function place(b, r, c, cell) {
    var changed = (cell.r !== r || cell.c !== c);
    cell.r = r; cell.c = c;
    b.g[idx(r, c)] = cell;
    return changed;
  }

  function spawn(b, c, fromFizz, dist) {
    var wantCap = false;
    if (fromFizz && b.spawnCaps) {
      var need = (b.cfg.caps | 0) - b.capsOut - b.capsLive;
      if (need > 0 && b.rnd() < (b.cfg.endless ? 0.20 : 0.24)) wantCap = true;
    }
    var cell;
    if (wantCap) {
      cell = mkCell(-1, K.CAP, 0, c);
      b.capsLive++;
    } else {
      cell = mkCell((b.rnd() * b.colors) | 0, K.NORM, 0, c);
    }
    cell.ry = fromFizz ? (ROWS - 1 + dist) : (-dist);
    cell.rx = c;
    return cell;
  }

  /* ---------- clearing ---------- */
  /* Marks cells for destruction. Returns {list, specials, chainSeals} or null. */
  FZ.planClear = function (b, swapIdx) {
    var runs = FZ.findRuns(b);
    if (!runs.length) return null;
    var mark = new Uint8Array(COLS * ROWS);
    var specials = [];
    var i, j;

    for (i = 0; i < runs.length; i++) {
      var run = runs[i];
      for (j = 0; j < run.length; j++) mark[run[j]] = 1;
      if (run.length >= 4) {
        var at = -1;
        if (swapIdx >= 0 && run.indexOf(swapIdx) >= 0) at = swapIdx;
        else at = run[(run.length / 2) | 0];
        var cellAt = b.g[at];
        specials.push({ at: at, kind: run.length >= 5 ? K.SURGE : K.BOMB, col: cellAt ? cellAt.col : 0 });
      }
    }

    /* chain-detonate specials caught in the blast */
    var queue = [];
    for (i = 0; i < mark.length; i++) if (mark[i]) queue.push(i);
    var guard = 0;
    while (queue.length && guard++ < 400) {
      var q = queue.pop();
      var cell = b.g[q];
      if (!cell) continue;
      if (cell.k === K.BOMB && !cell.detonated) {
        cell.detonated = true;
        var r0 = (q / COLS) | 0, c0 = q % COLS;
        for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
          var rr = r0 + dr, cc = c0 + dc;
          if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) continue;
          var k2 = idx(rr, cc);
          if (!mark[k2]) { mark[k2] = 1; queue.push(k2); }
        }
      } else if (cell.k === K.SURGE && !cell.detonated) {
        cell.detonated = true;
        var cx = q % COLS;
        for (var rr2 = 0; rr2 < ROWS; rr2++) {
          var k3 = idx(rr2, cx);
          if (!mark[k3]) { mark[k3] = 1; queue.push(k3); }
        }
      }
    }

    /* caps and seals are never destroyed by being marked */
    var list = [], seals = [];
    var seen = {};
    for (i = 0; i < mark.length; i++) {
      if (!mark[i]) continue;
      var cl = b.g[i];
      if (!cl) continue;
      if (cl.k === K.CAP || cl.k === K.SEAL) { mark[i] = 0; continue; }
      list.push(i);
    }
    /* seal damage from adjacency */
    for (i = 0; i < list.length; i++) {
      var p = list[i], pr = (p / COLS) | 0, pc = p % COLS;
      var d = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (j = 0; j < 4; j++) {
        var nr = pr + d[j][0], ncc = pc + d[j][1];
        if (nr < 0 || nr >= ROWS || ncc < 0 || ncc >= COLS) continue;
        var ki = idx(nr, ncc);
        var sc = b.g[ki];
        if (sc && sc.k === K.SEAL && !seen[ki]) { seen[ki] = 1; seals.push(ki); }
      }
    }
    if (!list.length) return null;
    return { list: list, specials: specials, seals: seals };
  };

  /* Applies a plan. fx = callback(type, r, c, colour) for juice. */
  FZ.applyClear = function (b, plan, chain, fx) {
    var i, cleared = 0;
    var specialAt = {};
    for (i = 0; i < plan.specials.length; i++) specialAt[plan.specials[i].at] = plan.specials[i];

    for (i = 0; i < plan.list.length; i++) {
      var p = plan.list[i], cell = b.g[p];
      if (!cell) continue;
      var r = (p / COLS) | 0, c = p % COLS;
      var sp = specialAt[p];
      if (sp) {
        b.g[p] = mkCell(sp.col, sp.kind, r, c);
        fx('special', r, c, sp.col);
      } else {
        b.g[p] = null;
        cleared++;
        fx('clear', r, c, cell.col);
      }
    }
    /* seal damage */
    for (i = 0; i < plan.seals.length; i++) {
      var si = plan.seals[i], sc = b.g[si];
      if (!sc || sc.k !== K.SEAL) continue;
      sc.hp--;
      var sr = (si / COLS) | 0, scc = si % COLS;
      if (sc.hp <= 0) {
        b.g[si] = null;
        b.sealsLeft = Math.max(0, b.sealsLeft - 1);
        fx('valve', sr, scc, -1);
        openValve(b, scc);
      } else {
        fx('crack', sr, scc, -1);
      }
    }
    b.score += cleared * 12 * (1 + chain);
    return cleared;
  };

  /* A broken seal opens a fizz valve: the fizz line rises permanently nearby. */
  function openValve(b, c) {
    for (var d = -1; d <= 1; d++) {
      var cc = c + d;
      if (cc < 0 || cc >= COLS) continue;
      b.valve[cc] = FZ.clamp(b.valve[cc] - (d === 0 ? 2 : 1), -3, 3);
    }
    recomputeBnd(b);
  }

  /* Caps sitting exactly on the fizz surface break free. */
  FZ.collectCaps = function (b, fx) {
    var n = 0;
    for (var c = 0; c < COLS; c++) {
      var r = b.bnd[c];
      n += pop(b, r, c, fx);
      if (r - 1 >= 0) n += pop(b, r - 1, c, fx);
    }
    return n;
  };

  function pop(b, r, c, fx) {
    var cell = b.g[idx(r, c)];
    if (!cell || cell.k !== K.CAP) return 0;
    b.g[idx(r, c)] = null;
    b.capsLive = Math.max(0, b.capsLive - 1);
    b.capsOut++;
    b.score += 150;
    fx('cap', r, c, -1);
    return 1;
  }

  FZ.advanceWave = function (b) {
    if (!b.wave) return false;
    b.phase += 0.9;
    if (b.phase > 1e6) b.phase = b.phase % (Math.PI * 2);
    var old = [];
    for (var c = 0; c < COLS; c++) old.push(b.bnd[c]);
    recomputeBnd(b);
    for (c = 0; c < COLS; c++) if (old[c] !== b.bnd[c]) return true;
    return false;
  };

})(window.FZ);
