/* Fizzlift - the dual-gravity match simulation.
 *
 * The glowing fizz line runs across the board at a per-column row `bnd[c]`.
 *   AIR   region: rows  <  bnd[c]  -> pieces FALL DOWN toward the line.
 *   FIZZ  region: rows >=  bnd[c]  -> pieces FLOAT UP toward the line.
 * Both sides pack against the surface, refill enters from the top (air) and
 * from the bottom (fizz), and a cascade resolves in both directions at once.
 *
 * Bottle caps only exist in the fizz and pop free when they reach the surface.
 * Valve seals take two hits; breaking one opens a valve that raises the line
 * PERMANENTLY around that column. The line also waves mid-level.
 *
 * This module is pure simulation. It stores NO render state on a cell: the
 * view keeps its own records keyed by cell id, and the sim publishes spawn
 * and event lists that the view reads once. (Shipped-broken defect class:
 * per-entity render state stored on the entity passed to the renderer.)
 */
(function (FZ) {
  'use strict';

  var COLS = 7, ROWS = 9;
  FZ.COLS = COLS; FZ.ROWS = ROWS;

  var K = { NORM: 0, CAP: 1, SEAL: 2, BOMB: 3, SURGE: 4 };
  FZ.K = K;

  var nextId = 1;

  function mkCell(col, k, r, c) {
    return {
      col: col, k: k, r: r, c: c,
      hp: (k === K.SEAL ? 2 : 0),
      id: nextId++, detonated: false
    };
  }

  function idx(r, c) { return r * COLS + c; }
  FZ.idx = idx;
  FZ.rowOf = function (i) { return (i / COLS) | 0; };
  FZ.colOf = function (i) { return i % COLS; };

  function matchable(cell) { return !!cell && cell.col >= 0; }
  function swappable(cell) {
    return !!cell && (cell.k === K.NORM || cell.k === K.BOMB || cell.k === K.SURGE);
  }
  FZ.swappable = swappable;

  /* ------------------------------------------------------- boundaries */
  function recomputeBnd(b) {
    for (var c = 0; c < COLS; c++) {
      var w = b.wave ? Math.round(b.wave * Math.sin(b.phase + c * 0.85)) : 0;
      b.bnd[c] = FZ.clamp(b.base[c] + b.valve[c] + b.creep + w, 1, ROWS - 1);
    }
  }
  FZ.recomputeBnd = recomputeBnd;

  /* ----------------------------------------------------- construction */
  FZ.makeBoard = function (cfg) {
    var b = {
      cfg: cfg,
      colors: FZ.clamp(cfg.colors || 5, 3, 6),
      g: new Array(COLS * ROWS),
      base: new Int8Array(COLS),
      valve: new Int8Array(COLS),
      bnd: new Int8Array(COLS),
      wave: cfg.wave | 0,
      phase: 0,
      creep: 0,
      rnd: FZ.rng(cfg.seed),
      capsOut: 0,
      capsLive: 0,
      capGoal: cfg.caps | 0,
      sealsLeft: 0,
      sealsTotal: 0,
      sealsBroken: 0,
      score: 0,
      spawnCaps: true,
      spawned: [],     /* view-consumable spawn records for THIS settle */
      events: []       /* view-consumable sim events for THIS step */
    };
    var c, r;
    for (c = 0; c < COLS; c++) {
      b.base[c] = FZ.clamp(FZ.bndPattern(cfg.bp, c, COLS, ROWS), 1, ROWS - 1);
      b.valve[c] = 0;
    }
    recomputeBnd(b);

    /* fill with no starting matches */
    for (r = 0; r < ROWS; r++) {
      for (c = 0; c < COLS; c++) {
        var tries = 0, col;
        do {
          col = (b.rnd() * b.colors) | 0;
          tries++;
        } while (tries < 24 && makesRun(b, r, c, col));
        b.g[idx(r, c)] = mkCell(col, K.NORM, r, c);
      }
    }

    /* seals: scattered through the fizz half, never orthogonally adjacent so a
       dense Seal Rush board still reads as separate targets */
    var want = FZ.clamp(cfg.seals | 0, 0, 14), placed = 0, guard = 0;
    while (placed < want && guard++ < 900) {
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
    /* dense rush boards may not fit the spacing rule; relax it rather than
       silently shipping a level with fewer seals than authored */
    guard = 0;
    while (placed < want && guard++ < 900) {
      var sc2 = (b.rnd() * COLS) | 0;
      var sr2 = FZ.clamp(b.bnd[sc2] + ((b.rnd() * Math.max(1, ROWS - b.bnd[sc2])) | 0), 0, ROWS - 1);
      var t2 = b.g[idx(sr2, sc2)];
      if (!t2 || t2.k !== K.NORM) continue;
      b.g[idx(sr2, sc2)] = mkCell(-1, K.SEAL, sr2, sc2);
      placed++;
    }
    b.sealsLeft = placed; b.sealsTotal = placed;

    /* a couple of starter caps low in the fizz so the goal reads instantly */
    var caps = Math.min(3, cfg.caps | 0), cg = 0;
    while (caps > 0 && cg++ < 300) {
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
    for (var pass = 0; pass < 14; pass++) {
      var runs = FZ.findRuns(b);
      if (!runs.length) return;
      for (var i = 0; i < runs.length; i++) {
        var run = runs[i];
        var t = b.g[run[(run.length / 2) | 0]];
        if (t && t.k === K.NORM) {
          var col = t.col;
          for (var g = 0; g < 8; g++) {
            var n = (b.rnd() * b.colors) | 0;
            if (n !== col) { t.col = n; break; }
          }
        }
      }
    }
  }

  /* --------------------------------------------------------- matching */
  FZ.findRuns = function (b) {
    var runs = [], r, c, i;
    for (r = 0; r < ROWS; r++) {
      c = 0;
      while (c < COLS) {
        var cell = b.g[idx(r, c)];
        if (!matchable(cell)) { c++; continue; }
        var e = c + 1;
        while (e < COLS) {
          var n = b.g[idx(r, e)];
          if (matchable(n) && n.col === cell.col) e++; else break;
        }
        if (e - c >= 3) {
          var run = [];
          for (i = c; i < e; i++) run.push(idx(r, i));
          run.horiz = true;
          runs.push(run);
        }
        c = e;
      }
    }
    for (c = 0; c < COLS; c++) {
      r = 0;
      while (r < ROWS) {
        var cl = b.g[idx(r, c)];
        if (!matchable(cl)) { r++; continue; }
        var e2 = r + 1;
        while (e2 < ROWS) {
          var n2 = b.g[idx(e2, c)];
          if (matchable(n2) && n2.col === cl.col) e2++; else break;
        }
        if (e2 - r >= 3) {
          var run2 = [];
          for (i = r; i < e2; i++) run2.push(idx(i, c));
          run2.horiz = false;
          runs.push(run2);
        }
        r = e2;
      }
    }
    return runs;
  };

  /* Is there a run of three or more through this single cell? Allocation
     free, and it only walks the two lines that cross the cell. */
  function runThrough(b, r, c) {
    var cell = b.g[idx(r, c)];
    if (!matchable(cell)) return false;
    var col = cell.col, n = 1, k, t;
    for (k = c - 1; k >= 0; k--) { t = b.g[idx(r, k)]; if (matchable(t) && t.col === col) n++; else break; }
    for (k = c + 1; k < COLS; k++) { t = b.g[idx(r, k)]; if (matchable(t) && t.col === col) n++; else break; }
    if (n >= 3) return true;
    n = 1;
    for (k = r - 1; k >= 0; k--) { t = b.g[idx(k, c)]; if (matchable(t) && t.col === col) n++; else break; }
    for (k = r + 1; k < ROWS; k++) { t = b.g[idx(k, c)]; if (matchable(t) && t.col === col) n++; else break; }
    return n >= 3;
  }

  /* An adjacent swap can only create a run through one of the two cells it
     touched, so a full board scan is wasted work. The scanning version cost
     126 findRuns calls (each allocating a fresh run list) per hasMove, which
     showed up as 100-300ms frame spikes at 4x throttle. */
  function testSwap(b, r1, c1, r2, c2) {
    var i1 = idx(r1, c1), i2 = idx(r2, c2);
    var a = b.g[i1], d = b.g[i2];
    if (!swappable(a) || !swappable(d)) return false;
    b.g[i1] = d; b.g[i2] = a;
    var ok = runThrough(b, r1, c1) || runThrough(b, r2, c2);
    b.g[i1] = a; b.g[i2] = d;
    return ok;
  }
  FZ.testSwap = testSwap;

  FZ.hasMove = function (b) {
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        if (c + 1 < COLS && testSwap(b, r, c, r, c + 1)) return true;
        if (r + 1 < ROWS && testSwap(b, r, c, r + 1, c)) return true;
      }
    }
    return false;
  };

  /* Score a legal swap by the objective it advances. Hints prefer a move that
     touches a seal, then fall back to the first legal match. The plan builder
     marks special cells while inspecting a candidate, so those flags are
     restored before the hint search continues. */
  function hintQuality(b, r1, c1, r2, c2) {
    if (!b.sealsLeft) return 0;
    var flags = [], i, cell;
    for (i = 0; i < b.g.length; i++) {
      cell = b.g[i];
      if (cell && (cell.k === K.BOMB || cell.k === K.SURGE)) flags.push([cell, cell.detonated]);
    }
    FZ.doSwap(b, r1, c1, r2, c2);
    var plan = FZ.planClear(b, idx(r2, c2));
    var score = plan ? plan.seals.length * 10000 + plan.list.length : 0;
    FZ.doSwap(b, r1, c1, r2, c2);
    for (i = 0; i < flags.length; i++) flags[i][0].detonated = flags[i][1];
    return score;
  }

  /* A hint the coach strip can point at. Returns {r1,c1,r2,c2} or null. */
  FZ.findHint = function (b) {
    if (!b.sealsLeft) {
      for (var fr = 0; fr < ROWS; fr++) {
        for (var fc = 0; fc < COLS; fc++) {
          if (fc + 1 < COLS && testSwap(b, fr, fc, fr, fc + 1)) return { r1: fr, c1: fc, r2: fr, c2: fc + 1 };
          if (fr + 1 < ROWS && testSwap(b, fr, fc, fr + 1, fc)) return { r1: fr, c1: fc, r2: fr + 1, c2: fc };
        }
      }
      return null;
    }
    var best = null, bestScore = -1;
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        if (c + 1 < COLS && testSwap(b, r, c, r, c + 1)) {
          var h1 = { r1: r, c1: c, r2: r, c2: c + 1 };
          var q1 = hintQuality(b, r, c, r, c + 1);
          if (q1 > bestScore) { best = h1; bestScore = q1; }
        }
        if (r + 1 < ROWS && testSwap(b, r, c, r + 1, c)) {
          var h2 = { r1: r, c1: c, r2: r + 1, c2: c };
          var q2 = hintQuality(b, r, c, r + 1, c);
          if (q2 > bestScore) { best = h2; bestScore = q2; }
        }
      }
    }
    return best;
  };

  FZ.doSwap = function (b, r1, c1, r2, c2) {
    var a = b.g[idx(r1, c1)], d = b.g[idx(r2, c2)];
    b.g[idx(r1, c1)] = d; b.g[idx(r2, c2)] = a;
    if (a) { a.r = r2; a.c = c2; }
    if (d) { d.r = r1; d.c = c1; }
  };

  FZ.shuffle = function (b) {
    var pool = [], i, cell;
    for (i = 0; i < b.g.length; i++) {
      cell = b.g[i];
      if (cell && cell.k === K.NORM) pool.push(cell);
    }
    for (var pass = 0; pass < 40; pass++) {
      for (i = pool.length - 1; i > 0; i--) {
        var j = (b.rnd() * (i + 1)) | 0;
        var t = pool[i].col; pool[i].col = pool[j].col; pool[j].col = t;
      }
      if (FZ.findRuns(b).length === 0 && FZ.hasMove(b)) return true;
    }
    /* Permuting the existing colours can be provably unable to produce a legal
       move (a board of near-uniform colour, or one crowded with seals and
       caps). Repainting is the only guaranteed escape: a dead board is an
       unwinnable level, and this game has no lives to lose to one. */
    for (pass = 0; pass < 60; pass++) {
      for (i = 0; i < pool.length; i++) pool[i].col = (b.rnd() * b.colors) | 0;
      if (FZ.findRuns(b).length === 0 && FZ.hasMove(b)) return true;
    }
    return false;
  };

  /* --------------------------------------------------- dual gravity */
  /* Packs both regions against the fizz surface and refills the openings.
     Returns true if anything moved or spawned. b.spawned holds the new cells
     with the side and distance they entered from, for the view to animate. */
  FZ.settle = function (b, buoy) {
    var moved = false;
    b.spawned.length = 0;
    for (var c = 0; c < COLS; c++) {
      var bn = b.bnd[c], r, i, cell, list;

      /* AIR: rows 0..bn-1 fall down and pack onto the surface */
      list = [];
      for (r = 0; r < bn; r++) {
        cell = b.g[idx(r, c)];
        if (cell) { list.push(cell); b.g[idx(r, c)] = null; }
      }
      var start = bn - list.length;
      for (i = 0; i < list.length; i++) moved = place(b, start + i, c, list[i]) || moved;
      for (r = start - 1; r >= 0; r--) {
        var nc = spawn(b, c, false, start - r);
        place(b, r, c, nc);
        moved = true;
      }

      /* FIZZ: rows bn..ROWS-1 float up and pack under the surface */
      list = [];
      for (r = bn; r < ROWS; r++) {
        cell = b.g[idx(r, c)];
        if (cell) { list.push(cell); b.g[idx(r, c)] = null; }
      }
      if (buoy) buoyCaps(list);
      for (i = 0; i < list.length; i++) moved = place(b, bn + i, c, list[i]) || moved;
      for (r = bn + list.length; r < ROWS; r++) {
        var nc2 = spawn(b, c, true, r - (bn + list.length) + 1);
        place(b, r, c, nc2);
        moved = true;
      }
    }
    return moved;
  };

  /* Caps are buoyant. Inside a fizz column they climb past ordinary pieces,
     two positions per settle, so a rising line REWARDS the player instead of
     stranding the goal deeper in a bigger fizz region. A cap never passes a
     valve seal or another cap: seals stay real obstacles and caps stay in a
     readable queue. `list` runs surface-first. */
  var CAP_LIFT = 1;
  function buoyCaps(list) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].k !== K.CAP) continue;
      var j = i;
      for (var s = 0; s < CAP_LIFT && j > 0; s++) {
        var above = list[j - 1];
        if (above.k === K.SEAL || above.k === K.CAP) break;
        list[j - 1] = list[j];
        list[j] = above;
        j--;
      }
    }
  }

  function place(b, r, c, cell) {
    var changed = (cell.r !== r || cell.c !== c);
    cell.r = r; cell.c = c;
    b.g[idx(r, c)] = cell;
    return changed;
  }

  function spawn(b, c, fromFizz, dist) {
    var wantCap = false;
    if (fromFizz && b.spawnCaps) {
      var goal = b.capGoal;
      /* Generous by design: the throttle is how many caps are IN FLIGHT, not
         how many exist, so the vat keeps feeding caps while the player works
         the ones already floating. Surplus caps promote the medal tier, so an
         over-generous drop can never hurt the player. */
      var need = (goal >= 9999) ? 1 : goal - b.capsOut;
      if (need > 0 && b.capsLive < 3 && b.rnd() < 0.26) wantCap = true;
    }
    var cell;
    if (wantCap) {
      cell = mkCell(-1, K.CAP, 0, c);
      b.capsLive++;
    } else {
      cell = mkCell((b.rnd() * b.colors) | 0, K.NORM, 0, c);
    }
    b.spawned.push({ id: cell.id, c: c, fromFizz: fromFizz, dist: dist });
    return cell;
  }

  /* ---------------------------------------------------- clear planning */
  /* Marks cells for destruction and resolves special chains. Caps and seals
     are never destroyed by being marked: caps must reach the surface and
     seals take adjacency damage. */
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
        specials.push({
          at: at,
          kind: run.length >= 5 ? K.SURGE : K.BOMB,
          col: cellAt ? cellAt.col : 0
        });
      }
    }

    /* chain-detonate specials caught in the blast */
    var queue = [];
    for (i = 0; i < mark.length; i++) if (mark[i]) queue.push(i);
    var guard = 0;
    while (queue.length && guard++ < 600) {
      var q = queue.pop();
      var cell = b.g[q];
      if (!cell) continue;
      if (cell.k === K.BOMB && !cell.detonated) {
        cell.detonated = true;
        var r0 = (q / COLS) | 0, c0 = q % COLS;
        for (var dr = -1; dr <= 1; dr++) {
          for (var dc = -1; dc <= 1; dc++) {
            var rr = r0 + dr, cc = c0 + dc;
            if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) continue;
            var k2 = idx(rr, cc);
            if (!mark[k2]) { mark[k2] = 1; queue.push(k2); }
          }
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

    var list = [], seals = [], seen = {};
    for (i = 0; i < mark.length; i++) {
      if (!mark[i]) continue;
      var cl = b.g[i];
      if (!cl) continue;
      if (cl.k === K.CAP || cl.k === K.SEAL) { mark[i] = 0; continue; }
      list.push(i);
    }
    /* Seals take damage from any clear TOUCHING them, diagonals included: a
       burst next to a valve should crack it, and the 4-neighbour version made
       a dense Seal Rush board read as unresponsive. */
    for (i = 0; i < list.length; i++) {
      var p = list[i], pr = (p / COLS) | 0, pc = p % COLS;
      for (var dr2 = -1; dr2 <= 1; dr2++) {
        for (var dc2 = -1; dc2 <= 1; dc2++) {
          if (!dr2 && !dc2) continue;
          var nr = pr + dr2, ncc = pc + dc2;
          if (nr < 0 || nr >= ROWS || ncc < 0 || ncc >= COLS) continue;
          var ki = idx(nr, ncc);
          var sc = b.g[ki];
          if (sc && sc.k === K.SEAL && !seen[ki]) { seen[ki] = 1; seals.push(ki); }
        }
      }
    }
    if (!list.length) return null;
    return { list: list, specials: specials, seals: seals };
  };

  /* Applies a plan. Pushes view events onto b.events; returns cleared count. */
  FZ.applyClear = function (b, plan, chain) {
    var i, cleared = 0;
    var specialAt = {};
    for (i = 0; i < plan.specials.length; i++) specialAt[plan.specials[i].at] = plan.specials[i];

    for (i = 0; i < plan.list.length; i++) {
      var p = plan.list[i], cell = b.g[p];
      if (!cell) continue;
      var r = (p / COLS) | 0, c = p % COLS;
      var sp = specialAt[p];
      var side = (r >= b.bnd[c]) ? 1 : -1;   /* 1 = fizz side (floats), -1 = air */
      if (sp) {
        b.g[p] = mkCell(sp.col, sp.kind, r, c);
        b.spawned.push({ id: b.g[p].id, c: c, fromFizz: side > 0, dist: 0, inPlace: true });
        b.events.push({ t: 'special', r: r, c: c, col: sp.col, kind: sp.kind, side: side });
      } else {
        b.g[p] = null;
        cleared++;
        b.events.push({ t: 'clear', r: r, c: c, col: cell.col, side: side, chain: chain });
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
        b.sealsBroken++;
        b.score += 320;
        b.events.push({ t: 'valve', r: sr, c: scc, col: -1 });
        openValve(b, scc);
      } else {
        b.events.push({ t: 'crack', r: sr, c: scc, col: -1 });
      }
    }
    b.score += cleared * 12 * (1 + chain);
    return cleared;
  };

  /* A broken seal opens a fizz valve: the line rises permanently nearby. */
  function openValve(b, c) {
    for (var d = -1; d <= 1; d++) {
      var cc = c + d;
      if (cc < 0 || cc >= COLS) continue;
      b.valve[cc] = FZ.clamp(b.valve[cc] - (d === 0 ? 2 : 1), -4, 4);
    }
    recomputeBnd(b);
  }

  /* The Overflow vat also creeps the whole line upward on a timer. */
  FZ.creepLine = function (b, amount) {
    var before = b.creep;
    b.creep = FZ.clamp(b.creep - (amount | 0), -4, 4);
    if (b.creep === before) return false;
    recomputeBnd(b);
    return true;
  };

  /* Caps in the surface band break free. The band is three rows deep - one
     above the line, the line itself, and one below - so a cap that has almost
     made it still pays out. */
  FZ.collectCaps = function (b) {
    var n = 0;
    for (var c = 0; c < COLS; c++) {
      var r = b.bnd[c];
      n += pop(b, r, c);
      if (r - 1 >= 0) n += pop(b, r - 1, c);
      if (r + 1 < ROWS) n += pop(b, r + 1, c);
    }
    return n;
  };

  function pop(b, r, c) {
    var cell = b.g[idx(r, c)];
    if (!cell || cell.k !== K.CAP) return 0;
    b.g[idx(r, c)] = null;
    b.capsLive = Math.max(0, b.capsLive - 1);
    b.capsOut++;
    b.score += 150;
    b.events.push({ t: 'cap', r: r, c: c, col: -1 });
    return 1;
  }

  FZ.advanceWave = function (b) {
    if (!b.wave) return false;
    b.phase += 0.9;
    if (b.phase > 1e6) b.phase = b.phase % (Math.PI * 2);
    var old = [], c;
    for (c = 0; c < COLS; c++) old.push(b.bnd[c]);
    recomputeBnd(b);
    for (c = 0; c < COLS; c++) if (old[c] !== b.bnd[c]) return true;
    return false;
  };

  /* Mean fizz line row, the single number the verification hook reports. */
  FZ.meanLine = function (b) {
    if (!b) return 0;
    var s = 0;
    for (var c = 0; c < COLS; c++) s += b.bnd[c];
    return Math.round((s / COLS) * 100) / 100;
  };

  FZ.lineCols = function (b, out) {
    var arr = out || [];
    arr.length = COLS;
    for (var c = 0; c < COLS; c++) arr[c] = b ? b.bnd[c] : 0;
    return arr;
  };

})(window.FZ);
