/* Dominion Keys - deterministic chamber simulation.
 * Fixed-step cellular sim preserved from the tuned prototype: grid 13x22,
 * the same material reactions, the same bottom-up movement pass with the
 * alternating scan direction, and the same 8-slot cycle hash. The view layer
 * never writes into this module; it only reads grid cells and drains events.
 */
(function (root) {
  'use strict';

  var W = 13, H = 22, N = W * H;
  var EMPTY = 0, WALL = 1, GOLD = 2, LAVA = 3, WATER = 4, GAS = 5,
      STONE = 6, MONSTER = 7, DRAIN = 8, PIN = 9, HERO = 10, CUP = 11;

  function makeState(grid, pinIds) {
    return {
      grid: grid,
      pins: pinIds,           // Uint8Array, 0 = not a pin cell
      moved: new Uint8Array(N),
      tick: 0,
      collected: 0,
      lost: 0,
      monsters: 0,
      dead: 0,
      pulled: 0,              // bitmask of pulled pin ids (1..8)
      events: null,           // optional flat array for fx (nulled in the solver)
      hist: [0, 0, 0, 0, 0, 0, 0, 0],
      hi: 0
    };
  }

  function clone(s) {
    var c = makeState(s.grid.slice(0), s.pins);
    c.tick = s.tick; c.collected = s.collected; c.lost = s.lost;
    c.monsters = s.monsters; c.dead = s.dead; c.pulled = s.pulled;
    return c;
  }

  // Compact snapshot used by undo. Keeps the grid copy small and typed.
  function snapshot(s) {
    return {
      grid: s.grid.slice(0), tick: s.tick, collected: s.collected, lost: s.lost,
      monsters: s.monsters, dead: s.dead, pulled: s.pulled
    };
  }
  function restore(s, snap) {
    s.grid.set(snap.grid);
    s.tick = snap.tick; s.collected = snap.collected; s.lost = snap.lost;
    s.monsters = snap.monsters; s.dead = snap.dead; s.pulled = snap.pulled;
    for (var i = 0; i < 8; i++) s.hist[i] = 0;
    s.hi = 0;
    if (s.events) s.events.length = 0;
  }

  function countMonsters(g) {
    var n = 0;
    for (var i = 0; i < N; i++) if (g[i] === MONSTER) n++;
    return n;
  }

  function countMat(g, m) {
    var n = 0;
    for (var i = 0; i < N; i++) if (g[i] === m) n++;
    return n;
  }

  function pull(s, id) {
    if (s.pulled & (1 << id)) return false;
    s.pulled |= (1 << id);
    var g = s.grid, p = s.pins;
    for (var i = 0; i < N; i++) if (p[i] === id && g[i] === PIN) g[i] = EMPTY;
    return true;
  }

  function ev(s, type, x, y) {
    if (s.events && s.events.length < 96) s.events.push(type, x, y);
  }

  // can material m enter cell value t (target)
  function canEnter(m, t) {
    if (t === DRAIN) return m !== MONSTER;
    if (t === EMPTY || t === CUP) return true;
    if (t === GAS && m !== GAS) return true;
    if (t === WATER && (m === GOLD || m === MONSTER)) return true;
    return false;
  }

  // no corner cutting: a diagonal needs the side OR the vertical neighbour open
  function diagOK(m, g, i, d, vertOpen) {
    return vertOpen || canEnter(m, g[i + d]);
  }

  function moveTo(s, i, j, m) {
    var g = s.grid, t = g[j];
    if (t === DRAIN) {
      g[i] = EMPTY;
      if (m === GOLD) s.lost++;
      ev(s, 5, j % W, (j / W) | 0);
    } else if (t === CUP) {
      g[i] = EMPTY;
      if (m === GOLD) { s.collected++; ev(s, 1, j % W, (j / W) | 0); }
      else if (m === LAVA || m === MONSTER) { s.dead = 1; ev(s, 4, j % W, (j / W) | 0); }
    } else if (t === EMPTY) {
      g[j] = m; g[i] = EMPTY;
    } else {
      g[j] = m; g[i] = t; // swap with the lighter fluid
      s.moved[i] = 1;
    }
    s.moved[j] = 1;
    return 1;
  }

  function step(s) {
    var g = s.grid, mv = s.moved, i, x, y, c, changed = 0;
    mv.fill(0);
    var d0 = (s.tick & 1) ? 1 : -1;

    // ---- reactions ----
    for (y = 1; y < H - 1; y++) {
      for (x = 1; x < W - 1; x++) {
        i = y * W + x; c = g[i];
        if (c === LAVA) {
          var ns0 = i - W, ns1 = i + W, ns2 = i - 1, ns3 = i + 1, k, n, t;
          for (k = 0; k < 4; k++) {
            n = k === 0 ? ns0 : k === 1 ? ns1 : k === 2 ? ns2 : ns3;
            t = g[n];
            if (t === WATER) {
              g[i] = STONE; g[n] = EMPTY; changed = 1;
              ev(s, 2, x, y);
              break;
            } else if (t === GAS) {
              g[n] = LAVA; changed = 1; ev(s, 3, n % W, (n / W) | 0);
            } else if (t === GOLD) {
              g[n] = EMPTY; s.lost++; changed = 1; ev(s, 6, n % W, (n / W) | 0);
            } else if (t === MONSTER) {
              g[n] = EMPTY; s.monsters--; changed = 1; ev(s, 7, n % W, (n / W) | 0);
            } else if (t === HERO) {
              s.dead = 1;
            }
          }
        } else if (c === MONSTER) {
          if (g[i - 1] === HERO || g[i + 1] === HERO || g[i - W] === HERO || g[i + W] === HERO) s.dead = 1;
        }
      }
    }

    // ---- movement (bottom-up) ----
    for (y = H - 2; y >= 1; y--) {
      for (var q = 0; q < W - 2; q++) {
        x = d0 > 0 ? 1 + q : (W - 2 - q);
        i = y * W + x;
        if (mv[i]) continue;
        c = g[i];
        var dn = canEnter(c, g[i + W]), up = canEnter(c, g[i - W]);
        if (c === GOLD || c === MONSTER) {
          if (c === MONSTER && g[i + W] === LAVA) { g[i] = EMPTY; s.monsters--; changed = 1; ev(s, 7, x, y); continue; }
          if (dn) { changed |= moveTo(s, i, i + W, c); continue; }
          if (c === GOLD) {
            if (diagOK(c, g, i, d0, dn) && canEnter(c, g[i + W + d0])) { changed |= moveTo(s, i, i + W + d0, c); continue; }
            if (diagOK(c, g, i, -d0, dn) && canEnter(c, g[i + W - d0])) { changed |= moveTo(s, i, i + W - d0, c); continue; }
          }
        } else if (c === LAVA || c === WATER) {
          if (dn) { changed |= moveTo(s, i, i + W, c); continue; }
          if (diagOK(c, g, i, d0, dn) && canEnter(c, g[i + W + d0])) { changed |= moveTo(s, i, i + W + d0, c); continue; }
          if (diagOK(c, g, i, -d0, dn) && canEnter(c, g[i + W - d0])) { changed |= moveTo(s, i, i + W - d0, c); continue; }
          if (canEnter(c, g[i + d0])) { changed |= moveTo(s, i, i + d0, c); continue; }
          if (c === WATER && canEnter(c, g[i - d0])) { changed |= moveTo(s, i, i - d0, c); continue; }
        } else if (c === GAS) {
          if (up) { changed |= moveTo(s, i, i - W, c); continue; }
          if (diagOK(c, g, i, d0, up) && canEnter(c, g[i - W + d0])) { changed |= moveTo(s, i, i - W + d0, c); continue; }
          if (diagOK(c, g, i, -d0, up) && canEnter(c, g[i - W - d0])) { changed |= moveTo(s, i, i - W - d0, c); continue; }
          if (canEnter(c, g[i + d0])) { changed |= moveTo(s, i, i + d0, c); continue; }
        }
      }
    }
    s.tick++;
    return changed;
  }

  function hash(g) {
    var h = 2166136261, i;
    for (i = 0; i < N; i++) { h ^= g[i]; h = (h * 16777619) >>> 0; }
    return h;
  }

  // run until settled / cycling / budget. returns ticks used
  function settle(s, budget) {
    var t = 0;
    while (t < budget) {
      var ch = step(s); t++;
      if (s.dead) break;
      if (!ch) break;
      var h = hash(s.grid), j, rep = 0;
      for (j = 0; j < 8; j++) if (s.hist[j] === h) { rep = 1; break; }
      s.hist[s.hi] = h; s.hi = (s.hi + 1) & 7;
      if (rep) break;
    }
    return t;
  }

  // ---------------------------------------------------------------- build
  // A chamber descriptor is data only: reservoirs (a material behind a key
  // bar), plus stone ramps. Identical construction order to the prototype so
  // the pre-solved pull orders in levels.js stay valid.
  function baseGrid() {
    var g = new Uint8Array(N), x, y;
    for (x = 0; x < W; x++) { g[x] = WALL; g[(H - 1) * W + x] = WALL; }
    for (y = 0; y < H; y++) { g[y * W] = WALL; g[y * W + W - 1] = WALL; }
    for (y = 17; y <= 20; y++) { g[y * W + 4] = WALL; g[y * W + 8] = WALL; }
    for (y = 17; y <= 20; y++) for (x = 5; x <= 7; x++) g[y * W + x] = CUP;
    g[20 * W + 6] = HERO;
    return g;
  }

  function buildDesc(desc) {
    var g = baseGrid(), pinIds = new Uint8Array(N), i, x, y, r;
    for (i = 0; i < desc.res.length; i++) {
      r = desc.res[i];
      var top = r.py - 3;
      if (r.mat === GAS) for (x = r.cx - 1; x <= r.cx + 3; x++) if (x > 0 && x < W - 1) g[top * W + x] = WALL;
      for (y = top; y <= r.py - 1; y++) {
        if (r.cx - 1 > 0) g[y * W + r.cx - 1] = WALL;
        if (r.cx + 3 < W - 1) g[y * W + r.cx + 3] = WALL;
      }
      var placed = 0;
      for (y = r.py - 1; y >= r.py - 2; y--) {
        for (x = r.cx; x <= r.cx + 2; x++) {
          if (r.mat === MONSTER) {
            if (y === r.py - 1 && placed < r.count) { g[y * W + x] = MONSTER; placed++; }
          } else g[y * W + x] = r.mat;
        }
      }
    }
    for (i = 0; i < desc.res.length; i++) {
      r = desc.res[i];
      var x0 = r.anchor < 0 ? 1 : r.cx, x1 = r.anchor < 0 ? r.cx + 2 : W - 2;
      r.x0 = x0; r.x1 = x1;
      for (x = x0; x <= x1; x++) {
        var k = r.py * W + x;
        if (g[k] === EMPTY) { g[k] = PIN; pinIds[k] = r.id; }
      }
    }
    for (i = 0; i < desc.ramps.length; i++) {
      var rm = desc.ramps[i];
      for (var j = 0; j < rm.len; j++) {
        x = rm.x + rm.d * j; y = rm.y + j;
        if (x < 1 || x > W - 2 || y < 1 || y > H - 3) continue;
        if (rm.noShaft != null && x >= 4 && x <= 8 && y > rm.noShaft) continue;
        if (g[y * W + x] === EMPTY) g[y * W + x] = WALL;
      }
    }
    var st = makeState(g, pinIds);
    st.monsters = countMonsters(g);
    return st;
  }

  // Exhaustive pull-order search. Used offline to validate every authored
  // chamber and at runtime, with a small remaining-key count, to detect a
  // chamber that can no longer be won so the fail state is immediate.
  var FACT = [1, 1, 2, 6, 24, 120, 720];
  function analyze(base, ids, budget, alreadySettled, stopAt) {
    var out = [], anyDeath = false, bestPath = null, reached = false, nodes = 0;

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
        var c = clone(st);
        pull(c, rem[i]);
        settle(c, budget);
        nodes++;
        var nr = rem.slice(0); nr.splice(i, 1);
        path.push(rem[i]);
        rec(c, nr, pm, path);
        path.pop();
      }
    }
    var root0 = clone(base);
    if (!alreadySettled) settle(root0, budget);
    if (root0.dead) return null;
    rec(root0, ids.slice(0), 0, []);
    if (reached) return { best: stopAt, winW: 1, total: 1, anyDeath: anyDeath, path: bestPath ? bestPath.p : [], nodes: nodes };
    var best = 0, k;
    for (k = 0; k < out.length; k++) if (out[k][0] > best) best = out[k][0];
    var winW = 0, tot = FACT[ids.length];
    for (k = 0; k < out.length; k++) if (out[k][0] >= best) winW += out[k][1];
    return { best: best, winW: winW, total: tot, anyDeath: anyDeath, path: bestPath ? bestPath.p : [], nodes: nodes };
  }

  root.DKSim = {
    W: W, H: H, N: N,
    EMPTY: EMPTY, WALL: WALL, GOLD: GOLD, LAVA: LAVA, WATER: WATER, GAS: GAS,
    STONE: STONE, MONSTER: MONSTER, DRAIN: DRAIN, PIN: PIN, HERO: HERO, CUP: CUP,
    makeState: makeState, clone: clone, snapshot: snapshot, restore: restore,
    pull: pull, step: step, settle: settle, hash: hash,
    countMonsters: countMonsters, countMat: countMat,
    baseGrid: baseGrid, buildDesc: buildDesc, analyze: analyze
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.DKSim;
})(typeof globalThis !== 'undefined' ? globalThis : this);
