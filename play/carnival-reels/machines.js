/* Carnival Reels - machine math models.
   Pure logic, no DOM, no engine. Each machine exposes spin(lite) -> result:
     { mult:Number (x bet), parts:[{tag,label,pay}], ...visual data }
   Analysis is either EXACT (full enumeration) or SIM (monte-carlo chunks).
   The four prototype machines (Orchard, Ghost Train, Gem Cascade, the
   2000-slot wheel) keep their tuned constants verbatim; Midway Ways and the
   Grand Carousel are new for the tour. */
(function (root) {
  'use strict';

  var R = Math.random;
  function pick(strip) { return strip[(R() * strip.length) | 0]; }
  // Build a reel strip and spread symbols evenly around it, so the physical
  // strip reads like a real reel. Stop selection stays uniform, so the maths
  // in the pay tables is unchanged by the ordering.
  function build(weights) {
    var syms = [], k, N = 0;
    for (k in weights) { syms.push(k); N += weights[k]; }
    syms.sort(function (a, b) { return weights[b] - weights[a]; });
    var out = new Array(N), i, j;
    for (i = 0; i < syms.length; i++) {
      var w = weights[syms[i]], step = N / w, off = i * (N / syms.length / 2);
      for (j = 0; j < w; j++) {
        var idx = Math.round(off + j * step) % N, guard = 0;
        while (out[idx] !== undefined && guard++ < N) idx = (idx + 1) % N;
        out[idx] = syms[i];
      }
    }
    for (i = 0; i < N; i++) if (out[i] === undefined) out[i] = syms[0];
    return out;
  }
  // build() spreads symbols evenly, which is right for the single-line and
  // single-row machines but wrong for a 3-row window: an evenly spread strip
  // puts a common symbol in almost EVERY window, which inflates ways hits.
  // The multi-row machines use a seeded shuffle instead, so a 3-row window
  // behaves like a real draw. Seeded, so the shipped strip is stable and the
  // posted maths always describes the strip the player actually sees.
  function shuffled(weights, seed) {
    var arr = [], k, i;
    for (k in weights) for (i = 0; i < weights[k]; i++) arr.push(k);
    var s = seed >>> 0;
    function rnd() { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }
    for (i = arr.length - 1; i > 0; i--) {
      var j = (rnd() * (i + 1)) | 0, t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function wpick(table) { // table: [[value, weight], ...]
    var t = 0, i;
    for (i = 0; i < table.length; i++) t += table[i][1];
    var r = R() * t;
    for (i = 0; i < table.length; i++) { r -= table[i][1]; if (r < 0) return table[i][0]; }
    return table[table.length - 1][0];
  }

  /* ---------------- analysis accumulator ---------------- */
  function Analysis(exact) {
    this.exact = !!exact;
    this.n = 0; this.sum = 0; this.sumSq = 0;
    this.hitAny = 0; this.hit1 = 0; this.max = 0;
    this.tags = {};       // tag -> {label, n, sum}
    this.order = [];      // tag order of first appearance
    this.done = false;
  }
  Analysis.prototype.add = function (res, w) {
    w = w || 1;
    this.n += w; this.sum += res.mult * w; this.sumSq += res.mult * res.mult * w;
    if (res.mult > 0) this.hitAny += w;
    if (res.mult >= 1) this.hit1 += w;
    if (res.mult > this.max) this.max = res.mult;
    for (var i = 0; i < res.parts.length; i++) {
      var p = res.parts[i], t = this.tags[p.tag];
      if (!t) { t = this.tags[p.tag] = { label: p.label, n: 0, sum: 0 }; this.order.push(p.tag); }
      t.n += w; t.sum += p.pay * w;
    }
  };
  Analysis.prototype.rtp = function () { return this.n ? this.sum / this.n : 0; };
  Analysis.prototype.sd = function () {
    if (this.n < 2) return 0;
    var m = this.sum / this.n, v = this.sumSq / this.n - m * m;
    return v > 0 ? Math.sqrt(v) : 0;
  };
  Analysis.prototype.rows = function () {
    var out = [], self = this;
    this.order.forEach(function (tag) {
      var t = self.tags[tag];
      out.push({
        tag: tag, label: t.label,
        p: t.n / self.n,
        avg: t.n ? t.sum / t.n : 0,
        rtp: t.sum / self.n
      });
    });
    out.sort(function (a, b) { return b.rtp - a.rtp; });
    return out;
  };

  /* ================= A. ORCHARD CLASSIC ================= */
  // 38-stop strip, 3 reels, single centre line. Prototype constants.
  var A_W = { CH: 11, LE: 8, PL: 7, BE: 5, ST: 4, SE: 3 };
  var A_STRIP = build(A_W);
  var A_TRIPLE = { SE: 420, ST: 120, BE: 50, PL: 18, LE: 12, CH: 4 };
  var A_NAME = { CH: 'Cherry', LE: 'Lemon', PL: 'Plum', BE: 'Bell', ST: 'Star', SE: 'Seven' };

  function aEval(a, b, c) {
    var parts = [], mult = 0;
    if (a === b && b === c) {
      var p = A_TRIPLE[a];
      parts.push({ tag: 'T' + a, label: 'Three ' + A_NAME[a] + 's', pay: p });
      mult = p;
    } else {
      var n = (a === 'CH' ? 1 : 0) + (b === 'CH' ? 1 : 0) + (c === 'CH' ? 1 : 0);
      if (n === 2) { parts.push({ tag: 'CH2', label: 'Two Cherries', pay: 0.5 }); mult = 0.5; }
      else if (n === 1) { parts.push({ tag: 'CH1', label: 'One Cherry', pay: 0.2 }); mult = 0.2; }
    }
    return { mult: mult, parts: parts };
  }

  var A = {
    id: 'orchard', name: 'Orchard Classic', tag: 'CLASSIC',
    blurb: '3 reels, 1 line, 38 stops',
    reels: 3, rows: 3, exact: true,
    strip: A_STRIP, symNames: A_NAME, triple: A_TRIPLE, weights: A_W,
    strips: [A_STRIP, A_STRIP, A_STRIP],
    spin: function () {
      var s = [(R() * 38) | 0, (R() * 38) | 0, (R() * 38) | 0];
      var r = aEval(A_STRIP[s[0]], A_STRIP[s[1]], A_STRIP[s[2]]);
      r.stops = s;
      r.syms = [A_STRIP[s[0]], A_STRIP[s[1]], A_STRIP[s[2]]];
      r.badges = [];
      // Anticipation is a posted state: two matching high symbols on the line.
      r.anticipate = [false, false, false];
      if (r.syms[0] === r.syms[1] && A_TRIPLE[r.syms[0]] >= 50) r.anticipate[2] = true;
      if (r.syms[0] === 'SE' && r.syms[1] === 'SE' && r.syms[2] === 'SE') r.badges.push('triple_crown');
      return r;
    },
    enumerate: function (an) {
      var N = A_STRIP.length;
      for (var i = 0; i < N; i++)for (var j = 0; j < N; j++)for (var k = 0; k < N; k++)
        an.add(aEval(A_STRIP[i], A_STRIP[j], A_STRIP[k]), 1);
      an.done = true;
    }
  };

  /* ================= B. GHOST TRAIN ================= */
  // 5 cells, count-anywhere pays, 3+ COIN triggers hold and respin.
  var B_W = { LAN: 7, KEY: 5, SKU: 3, GHO: 3, COIN: 2 };
  var B_STRIP = build(B_W);
  var B_NAME = { LAN: 'Lantern', KEY: 'Key', SKU: 'Skull', GHO: 'Ghost', COIN: 'Coin' };
  var B_PAY = {   //          3     4     5
    GHO: [0, 0, 0, 4, 28, 200],
    SKU: [0, 0, 0, 2.5, 14, 80],
    KEY: [0, 0, 0, 0.9, 4.7, 30],
    LAN: [0, 0, 0, 0.25, 1.7, 12]
  };
  var B_COINV = [[2, 34], [3, 24], [5, 16], [8, 12], [15, 8], [38, 4], [120, 2]];
  var B_Q = 0.11;      // per-empty-cell lock chance per respin
  var B_FULL = 40;     // full-vault bonus

  var B = {
    id: 'ghost', name: 'Ghost Train', tag: 'HOLD AND SPIN',
    blurb: '5 cells, pays anywhere, 3 coins wake the train',
    exact: false, reels: 5, rows: 1, strip: B_STRIP, symNames: B_NAME, pay: B_PAY,
    weights: B_W, coinValues: B_COINV, lockChance: B_Q, fullVault: B_FULL,
    strips: [B_STRIP, B_STRIP, B_STRIP, B_STRIP, B_STRIP],
    spin: function (lite) {
      var cells = [], i, c = 0;
      for (i = 0; i < 5; i++) { var s = pick(B_STRIP); cells.push(s); if (s === 'COIN') c++; }
      var parts = [], mult = 0, k;
      for (k in B_PAY) {
        var n = 0;
        for (i = 0; i < 5; i++) if (cells[i] === k) n++;
        var p = B_PAY[k][n] || 0;
        if (p > 0) { parts.push({ tag: k + n, label: n + ' ' + B_NAME[k] + 's', pay: p }); mult += p; }
      }
      var res = { mult: mult, parts: parts, cells: cells, bonus: null, badges: [] };
      res.anticipate = [false, false, false, false, false];
      if (!lite) {
        var seen = 0;
        for (i = 0; i < 5; i++) {
          if (seen === 2 && i < 5) res.anticipate[i] = true;
          if (cells[i] === 'COIN') seen++;
        }
      }
      if (c >= 3) {
        var vals = new Array(5), filled = 0;
        for (i = 0; i < 5; i++) { if (cells[i] === 'COIN') { vals[i] = wpick(B_COINV); filled++; } else vals[i] = 0; }
        var rounds = lite ? null : [];
        if (!lite) rounds.push({ vals: vals.slice(), left: 3, gained: [] });
        var left = 3;
        while (left > 0 && filled < 5) {
          left--;
          var gained = [];
          for (i = 0; i < 5; i++) {
            if (vals[i] === 0 && R() < B_Q) { vals[i] = wpick(B_COINV); filled++; gained.push(i); }
          }
          if (gained.length) left = 3;
          if (!lite) rounds.push({ vals: vals.slice(), left: left, gained: gained });
        }
        var tot = 0;
        for (i = 0; i < 5; i++) tot += vals[i];
        parts.push({ tag: 'bonusTrig', label: 'Train woken (3+ coins)', pay: 0 });
        parts.push({ tag: 'bonusCoins', label: 'Coin values', pay: tot });
        mult += tot;
        if (filled === 5) {
          parts.push({ tag: 'fullVault', label: 'Full Vault (5 of 5)', pay: B_FULL });
          mult += B_FULL;
          res.badges.push('full_vault');
        }
        res.bonus = { rounds: rounds, vals: vals, filled: filled, total: tot };
        res.badges.push('ghost_train');
      }
      res.mult = mult;
      return res;
    }
  };

  /* ================= C. GEM CASCADE ================= */
  var C_COLS = 5, C_ROWS = 5, C_N = 25;
  var C_W = [24, 21, 18, 15, 12, 10];       // gem weights (index = tier)
  var C_TOT = C_W.reduce(function (a, b) { return a + b; }, 0);
  var C_BASE = [0.8, 1.1, 1.6, 2.4, 3.8, 6.5];
  var C_GNAME = ['Quartz', 'Jade', 'Topaz', 'Coral', 'Cobalt', 'Prism'];
  var C_MULT = [1, 2, 3, 5, 8];             // tumble ladder (index = tumble #)
  function cSizeF(n) {
    if (n < 5) return 0;
    if (n === 5) return 1; if (n === 6) return 1.7; if (n === 7) return 2.8;
    if (n === 8) return 4.5; if (n === 9) return 7;
    if (n <= 11) return 12; if (n <= 14) return 32;
    return 150;
  }
  function cGem() {
    var r = R() * C_TOT;
    for (var i = 0; i < 6; i++) { r -= C_W[i]; if (r < 0) return i; }
    return 5;
  }
  var C_SEEN = new Int8Array(C_N), C_STACK = new Int16Array(C_N);
  function cClusters(g) {
    var out = [], i, n;
    for (i = 0; i < C_N; i++) C_SEEN[i] = 0;
    for (i = 0; i < C_N; i++) {
      if (C_SEEN[i] || g[i] < 0) continue;
      var t = g[i], sp = 0, cells = [];
      C_STACK[sp++] = i; C_SEEN[i] = 1;
      while (sp > 0) {
        var c = C_STACK[--sp]; cells.push(c);
        var x = c % C_COLS, y = (c / C_COLS) | 0;
        if (x > 0) { n = c - 1; if (!C_SEEN[n] && g[n] === t) { C_SEEN[n] = 1; C_STACK[sp++] = n; } }
        if (x < C_COLS - 1) { n = c + 1; if (!C_SEEN[n] && g[n] === t) { C_SEEN[n] = 1; C_STACK[sp++] = n; } }
        if (y > 0) { n = c - C_COLS; if (!C_SEEN[n] && g[n] === t) { C_SEEN[n] = 1; C_STACK[sp++] = n; } }
        if (y < C_ROWS - 1) { n = c + C_COLS; if (!C_SEEN[n] && g[n] === t) { C_SEEN[n] = 1; C_STACK[sp++] = n; } }
      }
      if (cells.length >= 5) out.push({ tier: t, cells: cells });
    }
    return out;
  }

  var C = {
    id: 'cascade', name: 'Gem Cascade', tag: 'TUMBLE',
    blurb: '5x5 clusters of 5 or more, tumble multipliers',
    exact: false, cols: C_COLS, rows: C_ROWS, gemNames: C_GNAME, mults: C_MULT,
    sizeF: cSizeF, base: C_BASE, gemWeights: C_W,
    spin: function (lite) {
      var g = new Int8Array(C_N), i;
      for (i = 0; i < C_N; i++) g[i] = cGem();
      var steps = lite ? null : [{ grid: Array.prototype.slice.call(g), clusters: [], mult: 1, win: 0 }];
      var mult = 0, parts = [], tumble = 0, best = 0;
      for (; ;) {
        var cl = cClusters(g);
        if (!cl.length) break;
        var m = C_MULT[Math.min(tumble, C_MULT.length - 1)];
        var stepWin = 0;
        for (i = 0; i < cl.length; i++) {
          var c = cl[i], sz = c.cells.length;
          if (sz > best) best = sz;
          var pay = C_BASE[c.tier] * cSizeF(sz) * m;
          stepWin += pay;
          var band = sz >= 15 ? '15+' : (sz >= 12 ? '12-14' : (sz >= 10 ? '10-11' : String(sz)));
          parts.push({ tag: 'c' + band, label: 'Cluster of ' + band, pay: pay });
        }
        mult += stepWin;
        if (!lite) steps.push({ grid: Array.prototype.slice.call(g), clusters: cl, mult: m, win: stepWin, clear: true });
        // clear + gravity + refill
        for (i = 0; i < cl.length; i++) for (var j = 0; j < cl[i].cells.length; j++) g[cl[i].cells[j]] = -1;
        for (var x = 0; x < C_COLS; x++) {
          var wp = C_ROWS - 1;
          for (var y = C_ROWS - 1; y >= 0; y--) {
            var v = g[y * C_COLS + x];
            if (v >= 0) { g[wp * C_COLS + x] = v; wp--; }
          }
          for (; wp >= 0; wp--) g[wp * C_COLS + x] = cGem();
        }
        tumble++;
        if (!lite) steps.push({ grid: Array.prototype.slice.call(g), clusters: [], mult: C_MULT[Math.min(tumble, C_MULT.length - 1)], win: 0, fall: true });
        if (tumble > 40) break; // hard safety cap
      }
      var res = { mult: mult, parts: parts, steps: steps, tumbles: tumble, best: best, grid: Array.prototype.slice.call(g), badges: [] };
      if (tumble >= 5) { parts.push({ tag: 'deepChain', label: '5+ tumble chain', pay: 0 }); res.badges.push('deep_chain'); }
      if (best >= 13) { parts.push({ tag: 'megaCluster', label: 'Cluster of 13+', pay: 0 }); res.badges.push('mega_cluster'); }
      return res;
    }
  };

  /* ================= E. MIDWAY WAYS ================= */
  // 5 reels, 3 rows, 243 ways. Wild on reels 2-4 in the base game and on all
  // five reels during free spins. 3+ TROPHY scatters award 8 free spins on a
  // rising multiplier trail.
  var E_NAME = { TIC: 'Ticket', POP: 'Popcorn', DUC: 'Duck', BAL: 'Balloon', HAT: 'Top Hat', WLD: 'Ringmaster', SCT: 'Trophy' };
  var E_PAY = {   //       3     4     5
    HAT: [0, 0, 0, 0.17, 0.63, 2.6],
    BAL: [0, 0, 0, 0.085, 0.32, 1.3],
    DUC: [0, 0, 0, 0.053, 0.19, 0.74],
    POP: [0, 0, 0, 0, 0.095, 0.37],
    TIC: [0, 0, 0, 0, 0.053, 0.21]
  };
  var E_SCAT = [0, 0, 0, 0.32, 1.3, 6.3];
  var E_ORDER = ['HAT', 'BAL', 'DUC', 'POP', 'TIC'];
  var E_OUT_W = { TIC: 12, POP: 10, DUC: 8, BAL: 6, HAT: 4, SCT: 2 };
  var E_MID_W = { TIC: 12, POP: 10, DUC: 8, BAL: 6, HAT: 4, SCT: 2, WLD: 3 };
  var E_FS_W = { TIC: 12, POP: 10, DUC: 8, BAL: 6, HAT: 4, SCT: 2, WLD: 3 };
  var E_STRIPS = [shuffled(E_OUT_W, 0x51ed), shuffled(E_MID_W, 0x7a13), shuffled(E_MID_W, 0x2c99),
    shuffled(E_MID_W, 0x6b41), shuffled(E_OUT_W, 0x18d7)];
  var E_FS_STRIPS = [shuffled(E_FS_W, 0x3f02), shuffled(E_MID_W, 0x9ab5), shuffled(E_MID_W, 0x40e6),
    shuffled(E_MID_W, 0xd214), shuffled(E_FS_W, 0x8c73)];
  var E_TRAIL = [1, 1, 2, 2, 3, 5];
  var E_SPINS = 6;

  function eDraw(strips) {
    var grid = [], stops = [], r, row;
    for (r = 0; r < 5; r++) {
      var s = strips[r], at = (R() * s.length) | 0;
      stops.push(at);
      var col = [];
      for (row = 0; row < 3; row++) col.push(s[(at + row) % s.length]);
      grid.push(col);
    }
    return { grid: grid, stops: stops };
  }
  function eEval(grid, mult, prefix) {
    var parts = [], total = 0, i, r, row;
    for (i = 0; i < E_ORDER.length; i++) {
      var sym = E_ORDER[i], counts = [], depth = 0;
      for (r = 0; r < 5; r++) {
        var c = 0;
        for (row = 0; row < 3; row++) { var v = grid[r][row]; if (v === sym || v === 'WLD') c++; }
        if (c === 0) break;
        counts.push(c); depth++;
      }
      if (depth >= 3) {
        var ways = 1;
        for (r = 0; r < depth; r++) ways *= counts[r];
        var pay = E_PAY[sym][depth] * ways * mult;
        if (pay > 0) {
          parts.push({
            tag: prefix + sym + depth,
            label: (prefix ? 'Free ' : '') + depth + ' ' + E_NAME[sym] + ' x' + ways + ' ways',
            pay: pay
          });
          total += pay;
        }
      }
    }
    var sc = 0;
    for (r = 0; r < 5; r++) for (row = 0; row < 3; row++) if (grid[r][row] === 'SCT') sc++;
    if (sc >= 3) {
      var sp = E_SCAT[Math.min(sc, 5)] * mult;
      if (sp > 0) {
        parts.push({
          tag: prefix + 'SCT' + Math.min(sc, 5),
          label: (prefix ? 'Free ' : '') + Math.min(sc, 5) + ' Trophies', pay: sp
        });
        total += sp;
      }
    }
    return { total: total, parts: parts, scatters: sc };
  }

  var E = {
    id: 'midway', name: 'Midway Ways', tag: '243 WAYS',
    blurb: '5 reels, 243 ways, ringmaster wilds',
    exact: false, reels: 5, rows: 3, symNames: E_NAME, pay: E_PAY, scatterPay: E_SCAT,
    order: E_ORDER, strips: E_STRIPS, fsStrips: E_FS_STRIPS, trail: E_TRAIL, freeSpins: E_SPINS,
    weights: E_MID_W, outerWeights: E_OUT_W,
    spin: function (lite) {
      var d = eDraw(E_STRIPS);
      var ev = eEval(d.grid, 1, '');
      var parts = ev.parts, mult = ev.total;
      var res = {
        mult: 0, parts: parts, grid: d.grid, stops: d.stops, base: ev.total,
        scatters: ev.scatters, free: null, badges: []
      };
      res.anticipate = [false, false, false, false, false];
      if (!lite) {
        var seen = 0, r, row;
        for (r = 0; r < 5; r++) {
          if (seen === 2) res.anticipate[r] = true;
          for (row = 0; row < 3; row++) if (d.grid[r][row] === 'SCT') seen++;
        }
      }
      if (ev.scatters >= 3) {
        var spins = [], fsTotal = 0, i;
        parts.push({ tag: 'fsTrig', label: 'Free spins awarded', pay: 0 });
        for (i = 0; i < E_SPINS; i++) {
          var fd = eDraw(E_FS_STRIPS);
          var m = E_TRAIL[Math.min(i, E_TRAIL.length - 1)];
          var fe = eEval(fd.grid, m, 'fs');
          fsTotal += fe.total;
          for (var k = 0; k < fe.parts.length; k++) parts.push(fe.parts[k]);
          if (!lite) spins.push({ grid: fd.grid, stops: fd.stops, mult: m, win: fe.total });
        }
        mult += fsTotal;
        res.free = { spins: spins, total: fsTotal, count: E_SPINS };
        res.badges.push('free_run');
        if (fsTotal >= 60) res.badges.push('midway_king');
      }
      res.mult = mult;
      return res;
    }
  };

  /* ================= D. GRAND CAROUSEL (finale) ================= */
  // 3 reels, 3 rows, 5 lines, plus three features: the 2000-slot Grand Wheel
  // (prototype table verbatim), a pick-a-booth prize bonus, and doubled free
  // spins. Densest feature mix in the parlour.
  var D_SEG = [
    ['Blank', 0, 1274], ['0.5x', 0.5, 320], ['1x', 1, 190], ['2x', 2, 105],
    ['3x', 3, 55], ['5x', 5, 27], ['10x', 10, 20], ['25x', 25, 6],
    ['100x', 100, 2], ['GRAND 500x', 500, 1]
  ];
  var D_SLOTS = [], D_LAYOUT = [];
  (function () {
    for (var i = 0; i < D_SEG.length; i++) for (var j = 0; j < D_SEG[i][2]; j++) D_SLOTS.push(i);
    // visual wheel: 40 wedges, distribution roughly mirrors weights
    D_LAYOUT = [0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 4, 0, 1, 0, 2, 0, 5,
      0, 1, 0, 2, 0, 3, 0, 1, 0, 6, 0, 1, 0, 2, 0, 7, 0, 8, 0, 9];
  })();
  var D_STAKE = 16;   // Grand Wheel is spun for 16x the bet
  var D_NAME = {
    HOR: 'Carousel Horse', CAN: 'Cotton Candy', RIN: 'Ring', TIK: 'Token',
    WHL: 'Wheel', STA: 'Star', PRZ: 'Prize'
  };
  var D_LINE3 = { HOR: 18, CAN: 5.5, RIN: 2.1, TIK: 0.8 };
  var D_LINE2 = { HOR: 1.4, CAN: 0.4 };
  var D_W = { TIK: 11, RIN: 9, CAN: 7, HOR: 4, WHL: 2, STA: 2, PRZ: 2 };
  var D_STRIPS = [shuffled(D_W, 0xa17e), shuffled(D_W, 0x5d38), shuffled(D_W, 0xe902)];
  var D_LINES = [[1, 1, 1], [0, 0, 0], [2, 2, 2], [0, 1, 2], [2, 1, 0]];
  var D_PRIZES = [[1, 30], [2, 24], [3, 18], [5, 12], [9, 8], [20, 5], [60, 2]];
  var D_PICKS = 3;
  var D_FS = 6;
  var D_FS_MULT = 2;

  function dWheel() {
    var slot = (R() * D_SLOTS.length) | 0;
    var idx = D_SLOTS[slot];
    return { slot: slot, seg: idx, value: D_SEG[idx][1], label: D_SEG[idx][0] };
  }
  function dDraw() {
    var grid = [], stops = [], r, row;
    for (r = 0; r < 3; r++) {
      var s = D_STRIPS[r], at = (R() * s.length) | 0;
      stops.push(at);
      var col = [];
      for (row = 0; row < 3; row++) col.push(s[(at + row) % s.length]);
      grid.push(col);
    }
    return { grid: grid, stops: stops };
  }
  function dLines(grid, mult, prefix) {
    var parts = [], total = 0, i;
    for (i = 0; i < D_LINES.length; i++) {
      var L = D_LINES[i];
      var a = grid[0][L[0]], b = grid[1][L[1]], c = grid[2][L[2]];
      if (a === b && b === c && D_LINE3[a] != null) {
        var p3 = D_LINE3[a] * mult;
        parts.push({ tag: prefix + 'L3' + a, label: (prefix ? 'Free ' : '') + 'Three ' + D_NAME[a], pay: p3 });
        total += p3;
      } else if (a === b && D_LINE2[a] != null) {
        var p2 = D_LINE2[a] * mult;
        parts.push({ tag: prefix + 'L2' + a, label: (prefix ? 'Free ' : '') + 'Two ' + D_NAME[a], pay: p2 });
        total += p2;
      }
    }
    return { total: total, parts: parts };
  }
  function dCount(grid, sym) {
    var n = 0, r, row;
    for (r = 0; r < 3; r++) for (row = 0; row < 3; row++) if (grid[r][row] === sym) n++;
    return n;
  }

  var D = {
    id: 'carousel', name: 'Grand Carousel', tag: 'WHEEL AND PICK',
    blurb: '3 reels, 5 lines, wheel, pick and free spins',
    exact: false, reels: 3, rows: 3, segments: D_SEG, layout: D_LAYOUT, wheelStake: D_STAKE,
    symNames: D_NAME, line3: D_LINE3, line2: D_LINE2, lines: D_LINES, strips: D_STRIPS,
    prizes: D_PRIZES, picks: D_PICKS, freeSpins: D_FS, fsMult: D_FS_MULT, weights: D_W,
    wheelSlots: D_SLOTS.length,
    wheelSpin: dWheel,
    spin: function (lite) {
      var d = dDraw();
      var lin = dLines(d.grid, 1, '');
      var parts = lin.parts, mult = lin.total;
      var res = {
        mult: 0, parts: parts, grid: d.grid, stops: d.stops, base: lin.total,
        wheel: null, prize: null, free: null, badges: []
      };
      res.anticipate = [false, false, false];
      var nW = dCount(d.grid, 'WHL'), nS = dCount(d.grid, 'STA'), nP = dCount(d.grid, 'PRZ');
      if (!lite) {
        var sw = 0, sp = 0, ss = 0, r, row;
        for (r = 0; r < 3; r++) {
          if (sw === 2 || sp === 2 || ss === 2) res.anticipate[r] = true;
          for (row = 0; row < 3; row++) {
            if (d.grid[r][row] === 'WHL') sw++;
            else if (d.grid[r][row] === 'PRZ') sp++;
            else if (d.grid[r][row] === 'STA') ss++;
          }
        }
      }
      if (nW >= 3) {
        var w = dWheel();
        var wp = w.value * D_STAKE;
        parts.push({ tag: 'whlTrig', label: 'Grand Wheel spun', pay: 0 });
        if (wp > 0) parts.push({ tag: 'whl' + w.seg, label: 'Wheel ' + w.label, pay: wp });
        mult += wp;
        res.wheel = w;
        res.badges.push('carousel_wheel');
        if (w.seg === 9) res.badges.push('grand_ring');
        else if (w.seg === 8) res.badges.push('high_road');
      }
      if (nP >= 3) {
        var picked = [], tot = 0, i;
        for (i = 0; i < D_PICKS; i++) { var v = wpick(D_PRIZES); picked.push(v); tot += v; }
        parts.push({ tag: 'przTrig', label: 'Prize booth opened', pay: 0 });
        parts.push({ tag: 'przPay', label: 'Booth prizes', pay: tot });
        mult += tot;
        var board = [];
        for (i = 0; i < 9; i++) board.push(i < D_PICKS ? picked[i] : wpick(D_PRIZES));
        res.prize = { picked: picked, total: tot, board: board };
        res.badges.push('pick_bonus');
      }
      if (nS >= 3) {
        var spins = [], ftot = 0, j;
        parts.push({ tag: 'fsTrig2', label: 'Free spins awarded', pay: 0 });
        for (j = 0; j < D_FS; j++) {
          var fd = dDraw();
          var fl = dLines(fd.grid, D_FS_MULT, 'fs');
          ftot += fl.total;
          for (var k = 0; k < fl.parts.length; k++) parts.push(fl.parts[k]);
          if (!lite) spins.push({ grid: fd.grid, stops: fd.stops, win: fl.total });
        }
        mult += ftot;
        res.free = { spins: spins, total: ftot, count: D_FS, mult: D_FS_MULT };
        res.badges.push('free_run');
      }
      res.mult = mult;
      return res;
    },
    // The wheel table itself is exactly enumerable and is posted as such.
    enumerateWheel: function (an) {
      for (var i = 0; i < D_SLOTS.length; i++) {
        var idx = D_SLOTS[i], s = D_SEG[idx];
        an.add({ mult: s[1], parts: s[1] > 0 ? [{ tag: 'w' + idx, label: s[0], pay: s[1] }] : [] }, 1);
      }
      an.done = true;
    }
  };

  /* ---------------- registry ---------------- */
  var MACHINES = [A, B, C, E, D];
  MACHINES.forEach(function (m, i) {
    m.index = i;
    m.an = new Analysis(!!m.exact);
    m.simTarget = m.exact ? 0 : 40000;
  });
  // The wheel table is analysed exactly and posted beside the carousel.
  D.wheelAn = new Analysis(true);

  var api = {
    MACHINES: MACHINES, Analysis: Analysis, build: build,
    A: A, B: B, C: C, D: D, E: E, byId: {}
  };
  MACHINES.forEach(function (m) { api.byId[m.id] = m; });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CR_MACHINES = api;
})(typeof window !== 'undefined' ? window : globalThis);
