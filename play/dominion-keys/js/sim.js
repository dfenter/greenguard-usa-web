/* Dominion Keys - deterministic chamber simulation */
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
      events: null,           // optional array for fx (nulled in solver)
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
    if (s.events && s.events.length < 64) s.events.push(type, x, y);
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

  // returns 1 if moved
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
      g[j] = m; g[i] = t; // swap with lighter fluid
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

  root.DKSim = {
    W: W, H: H, N: N,
    EMPTY: EMPTY, WALL: WALL, GOLD: GOLD, LAVA: LAVA, WATER: WATER, GAS: GAS,
    STONE: STONE, MONSTER: MONSTER, DRAIN: DRAIN, PIN: PIN, HERO: HERO, CUP: CUP,
    makeState: makeState, clone: clone, pull: pull, step: step, settle: settle,
    countMonsters: countMonsters, countMat: countMat, hash: hash
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
