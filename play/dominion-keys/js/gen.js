/* Dominion Keys - seeded chamber generation, validated by construction order */
(function (root) {
  'use strict';
  var S = root.DKSim;
  var W = S.W, H = S.H, N = S.N;

  function rngOf(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function ri(r, n) { return (r() * n) | 0; }
  function pick(r, arr) { return arr[ri(r, arr.length)]; }

  var COLS = [1, 5, 9], ROWS = [4, 9, 14];
  var FACT = [1, 1, 2, 6, 24, 120, 720];

  function baseGrid() {
    var g = new Uint8Array(N), x, y;
    for (x = 0; x < W; x++) { g[x] = S.WALL; g[(H - 1) * W + x] = S.WALL; }
    for (y = 0; y < H; y++) { g[y * W] = S.WALL; g[y * W + W - 1] = S.WALL; }
    // hero well: walls x=4 and x=8 from y=17..20, hero at bottom centre
    for (y = 17; y <= 20; y++) { g[y * W + 4] = S.WALL; g[y * W + 8] = S.WALL; }
    for (y = 17; y <= 20; y++) for (x = 5; x <= 7; x++) g[y * W + x] = S.CUP;
    g[20 * W + 6] = S.HERO;
    return g;
  }

  function buildDesc(desc) {
    var g = baseGrid(), pinIds = new Uint8Array(N), i, x, y, r;
    // reservoirs
    for (i = 0; i < desc.res.length; i++) {
      r = desc.res[i];
      var top = r.py - 3;
      if (r.mat === S.GAS) for (x = r.cx - 1; x <= r.cx + 3; x++) if (x > 0 && x < W - 1) g[top * W + x] = S.WALL;
      for (y = top; y <= r.py - 1; y++) {
        if (r.cx - 1 > 0) g[y * W + r.cx - 1] = S.WALL;
        if (r.cx + 3 < W - 1) g[y * W + r.cx + 3] = S.WALL;
      }
      // contents
      var placed = 0;
      for (y = r.py - 1; y >= r.py - 2; y--) {
        for (x = r.cx; x <= r.cx + 2; x++) {
          if (r.mat === S.MONSTER) {
            if (y === r.py - 1 && placed < r.count) { g[y * W + x] = S.MONSTER; placed++; }
          } else g[y * W + x] = r.mat;
        }
      }
    }
    // pin bars
    for (i = 0; i < desc.res.length; i++) {
      r = desc.res[i];
      var x0 = r.anchor < 0 ? 1 : r.cx, x1 = r.anchor < 0 ? r.cx + 2 : W - 2;
      r.x0 = x0; r.x1 = x1;
      for (x = x0; x <= x1; x++) {
        var k = r.py * W + x;
        if (g[k] === S.EMPTY) { g[k] = S.PIN; pinIds[k] = r.id; }
      }
    }
    // ramps
    for (i = 0; i < desc.ramps.length; i++) {
      var rm = desc.ramps[i];
      for (var j = 0; j < rm.len; j++) {
        x = rm.x + rm.d * j; y = rm.y + j;
        if (x < 1 || x > W - 2 || y < 1 || y > H - 3) continue;
        if (rm.noShaft != null && x >= 4 && x <= 8 && y > rm.noShaft) continue;
        if (g[y * W + x] === S.EMPTY) g[y * W + x] = S.WALL;
      }
    }
    var st = S.makeState(g, pinIds);
    st.monsters = S.countMonsters(g);
    return st;
  }

  // cheap geometry probe: with every pin gone and only gold in play, can gold reach the hero?
  function goldPathOK(st) {
    var p = S.clone(st), i, g = p.grid;
    for (i = 0; i < N; i++) {
      var c = g[i];
      if (c === S.LAVA || c === S.WATER || c === S.GAS || c === S.MONSTER || c === S.PIN) g[i] = S.EMPTY;
    }
    p.monsters = 0;
    S.settle(p, 220);
    return p.collected >= 4;
  }

  // --- solver: explore every pull order ---
  function analyze(base, ids, budget, alreadySettled, stopAt) {
    var out = [], anyDeath = false, bestPath = null, reached = false;
    var memo = 0;

    function rec(st, rem, pm, path) {
      if (reached) return;
      if (!st.dead && st.monsters === 0 && st.collected > pm) {
        pm = st.collected;
        if (!bestPath || pm > bestPath.g || (pm === bestPath.g && path.length < bestPath.p.length)) {
          bestPath = { g: pm, p: path.slice(0) };
        }
        if (stopAt && pm >= stopAt) { reached = true; return; }
      }
      if (st.dead) { anyDeath = true; out.push([pm, FACT[rem.length]]); return; }
      if (rem.length === 0) { out.push([pm, 1]); return; }
      for (var i = 0; i < rem.length; i++) {
        var c = S.clone(st);
        S.pull(c, rem[i]);
        S.settle(c, budget);
        memo++;
        var nr = rem.slice(0); nr.splice(i, 1);
        path.push(rem[i]);
        rec(c, nr, pm, path);
        path.pop();
      }
    }
    var root0 = S.clone(base);
    if (!alreadySettled) S.settle(root0, budget);
    if (root0.dead) return null;
    rec(root0, ids.slice(0), 0, []);
    var best = 0, k;
    if (reached) return { best: stopAt, winW: 1, total: 1, anyDeath: anyDeath, path: bestPath ? bestPath.p : [], nodes: memo, initial: root0 };
    for (k = 0; k < out.length; k++) if (out[k][0] > best) best = out[k][0];
    var winW = 0, tot = FACT[ids.length];
    for (k = 0; k < out.length; k++) if (out[k][0] >= best) winW += out[k][1];
    return { best: best, winW: winW, total: tot, anyDeath: anyDeath, path: bestPath ? bestPath.p : [], nodes: memo, initial: root0 };
  }

  function candidate(rng, wing) {
    var pal = wing === 0 ? [S.LAVA, S.LAVA, S.MONSTER]
      : wing === 1 ? [S.LAVA, S.LAVA, S.MONSTER, S.WATER, S.MONSTER]
        : [S.LAVA, S.MONSTER, S.WATER, S.GAS, S.MONSTER, S.LAVA];
    var nPins = wing === 0 ? 3 : wing === 1 ? 4 : 5;

    // choose slots: at most 2 per row
    var slots = [], rowsUse = ROWS.slice(0);
    // shuffle rows
    for (var a = rowsUse.length - 1; a > 0; a--) { var b = ri(rng, a + 1), t = rowsUse[a]; rowsUse[a] = rowsUse[b]; rowsUse[b] = t; }
    var need = nPins, ri2 = 0;
    while (need > 0 && ri2 < rowsUse.length) {
      var py = rowsUse[ri2++];
      var cnt = Math.min(need, 1 + (rng() < 0.65 ? 1 : 0));
      var cols = COLS.slice(0);
      for (a = cols.length - 1; a > 0; a--) { b = ri(rng, a + 1); t = cols[a]; cols[a] = cols[b]; cols[b] = t; }
      cols = cols.slice(0, cnt);
      if (ri2 === 1 && cols.indexOf(5) < 0) cols[0] = 5; // guarantee a centre shaft slot
      cols.sort(function (p, q) { return p - q; });
      for (a = 0; a < cols.length; a++) {
        slots.push({ cx: cols[a], py: py, anchor: cols.length === 1 ? (rng() < 0.5 ? -1 : 1) : (a === 0 ? -1 : 1) });
      }
      need -= cols.length;
    }
    if (slots.length < nPins) return null;

    // materials: one gold (prefer centre column / lowest row), rest from palette
    // gold goes to the LOWEST centre-column slot so its shaft to the hero is clear
    var gi = -1, bestScore = -1;
    for (a = 0; a < slots.length; a++) {
      var sc = (slots[a].cx === 5 ? 100 : 0) + slots[a].py;
      if (sc > bestScore) { bestScore = sc; gi = a; }
    }
    var mats = new Array(slots.length), rest = [];
    for (a = 0; a < slots.length; a++) if (a !== gi) rest.push(a);
    mats[gi] = S.GOLD;
    // shuffle the remaining slot indices
    for (a = rest.length - 1; a > 0; a--) { b = ri(rng, a + 1); t = rest[a]; rest[a] = rest[b]; rest[b] = t; }
    // lava prefers a side column (its basin is where hazards belong)
    var li = 0;
    for (a = 0; a < rest.length; a++) if (slots[rest[a]].cx !== 5) { li = a; break; }
    var lavaSlot = rest[li]; mats[lavaSlot] = S.LAVA; rest.splice(li, 1);
    var wantMon = wing === 0 ? (rng() < 0.55) : true;
    var monSlot = -1;
    if (wantMon && rest.length) {
      var mi = -1;
      for (a = 0; a < rest.length; a++) if (slots[rest[a]].cx === slots[lavaSlot].cx) { mi = a; break; }
      if (mi < 0) for (a = 0; a < rest.length; a++) if (slots[rest[a]].cx !== 5) { mi = a; break; }
      if (mi >= 0) { monSlot = rest[mi]; mats[monSlot] = S.MONSTER; rest.splice(mi, 1); }
    }
    var forced = [];
    if (wing >= 1) forced.push(S.WATER);
    if (wing >= 2) forced.push(S.GAS);
    for (a = 0; a < rest.length; a++) mats[rest[a]] = forced.length ? forced.shift() : pick(rng, pal);
    var res = [];
    for (a = 0; a < slots.length; a++) {
      res.push({
        id: a + 1, cx: slots[a].cx, py: slots[a].py, anchor: slots[a].anchor,
        mat: mats[a], count: mats[a] === S.MONSTER ? (1 + (rng() < 0.3 ? 1 : 0)) : 6
      });
    }

    // ramps (never inside the gold shaft or over the well mouth)
    var ramps = [], goldPy = res[gi].py;
    for (a = 0; a < res.length; a++) {
      if (a === monSlot || (monSlot >= 0 && a === lavaSlot)) continue; // keep the kill lane clean
      if (rng() < 0.6) {
        var d = rng() < 0.5 ? 1 : -1;
        var sx = d > 0 ? res[a].cx : res[a].cx + 2;
        ramps.push({ x: sx, y: res[a].py + 2, d: d, len: 2 + ri(rng, 3), noShaft: goldPy });
      }
    }
    return { res: res, ramps: ramps, wing: wing };
  }

  function generate(levelIndex) {
    var wing = (levelIndex / 10) | 0;
    var seed = 9176 + levelIndex * 7919;
    var attempts = 0, budget = 200;
    var maxFrac = [0.34, 0.2, 0.12][wing], minPath = [2, 2, 3][wing];
    while (attempts < 1600) {
      var rng = rngOf(seed + attempts * 2654435761);
      attempts++;
      if (attempts % 400 === 0) { maxFrac += 0.07; minPath = Math.max(2, minPath - 1); }
      var desc = candidate(rng, wing);
      if (!desc) continue;
      var st = buildDesc(desc);
      if (!goldPathOK(st)) continue;
      var ids = desc.res.map(function (r) { return r.id; });
      var an = analyze(st, ids, budget);
      if (!an) continue;
      if (an.best < 4) continue;
      if (!an.anyDeath) continue;
      if (an.path.length < minPath) continue;
      var frac = an.winW / an.total;
      if (frac > maxFrac) continue;
      return {
        index: levelIndex, wing: wing, desc: desc, target: an.best,
        solution: an.path, winFrac: frac, attempts: attempts,
        make: function () { return buildDesc(desc); }
      };
    }
    return null;
  }

  root.DKGen = { generate: generate, buildDesc: buildDesc, analyze: analyze, rngOf: rngOf };
})(typeof globalThis !== 'undefined' ? globalThis : this);
