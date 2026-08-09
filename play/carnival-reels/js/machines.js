/* Carnival Reels - machine math models.
   Pure logic, no DOM. Each machine exposes spin(lite) -> result:
     { mult:Number (x bet), parts:[{tag,label,pay}], ...visual data }
   Analysis is either EXACT (full enumeration) or SIM (monte-carlo chunks). */
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
  function wpick(table) { // table: [[value, weight], ...] with total
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
  // 38-stop strip, 3 reels, single centre line.
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
    blurb: '3 reels - 1 line - 38 stops',
    reels: 3, exact: true,
    strip: A_STRIP, symNames: A_NAME, triple: A_TRIPLE,
    spin: function () {
      var s = [(R() * 38) | 0, (R() * 38) | 0, (R() * 38) | 0];
      var r = aEval(A_STRIP[s[0]], A_STRIP[s[1]], A_STRIP[s[2]]);
      r.stops = s;
      r.syms = [A_STRIP[s[0]], A_STRIP[s[1]], A_STRIP[s[2]]];
      r.badges = [];
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
  // 5 cells, count-anywhere pays, 3+ COIN triggers hold & respin.
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
    id: 'ghost', name: 'Ghost Train', tag: 'HOLD & SPIN',
    blurb: '5 cells - pays anywhere - 3 coins trigger',
    exact: false, strip: B_STRIP, symNames: B_NAME, pay: B_PAY,
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
          parts.push({ tag: 'fullVault', label: 'Full Vault (5/5)', pay: B_FULL });
          mult += B_FULL;
          res.badges.push('full_vault');
        }
        res.bonus = { rounds: rounds, vals: vals, filled: filled, total: tot };
        res.mult = mult;
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
    blurb: '5x5 clusters of 5+ - tumble multipliers',
    exact: false, cols: C_COLS, rows: C_ROWS, gemNames: C_GNAME, mults: C_MULT,
    sizeF: cSizeF, base: C_BASE,
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

  /* ================= D. JACKPOT WHEEL ================= */
  var D_SEG = [
    ['Blank', 0, 1274], ['0.5x', 0.5, 320], ['1x', 1, 190], ['2x', 2, 105],
    ['3x', 3, 55], ['5x', 5, 27], ['10x', 10, 20], ['25x', 25, 6],
    ['100x', 100, 2], ['GRAND 500x', 500, 1]
  ];
  var D_SLOTS = [], D_LAYOUT = [];
  (function () {
    // slot list for exact enumeration
    for (var i = 0; i < D_SEG.length; i++) for (var j = 0; j < D_SEG[i][2]; j++) D_SLOTS.push(i);
    // visual wheel: 40 wedges, distribution roughly mirrors weights
    var plan = [0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 4, 0, 1, 0, 2, 0, 5,
      0, 1, 0, 2, 0, 3, 0, 1, 0, 6, 0, 1, 0, 2, 0, 7, 0, 8, 0, 9];
    D_LAYOUT = plan;
  })();
  function dEval(idx) {
    var s = D_SEG[idx];
    var parts = s[1] > 0 ? [{ tag: 'w' + idx, label: s[0], pay: s[1] }] : [];
    return { mult: s[1], parts: parts, seg: idx };
  }
  var D = {
    id: 'wheel', name: 'Jackpot Wheel', tag: 'WHEEL',
    blurb: '2000-slot wheel - grand 1 in 2000',
    exact: true, segments: D_SEG, layout: D_LAYOUT,
    spin: function () {
      var slot = (R() * D_SLOTS.length) | 0;
      var r = dEval(D_SLOTS[slot]);
      r.slot = slot;
      r.badges = [];
      if (r.seg === 9) r.badges.push('grand_ring');
      else if (r.seg === 8) r.badges.push('high_road');
      return r;
    },
    enumerate: function (an) {
      for (var i = 0; i < D_SLOTS.length; i++) an.add(dEval(D_SLOTS[i]), 1);
      an.done = true;
    }
  };

  var MACHINES = [A, B, C, D];
  MACHINES.forEach(function (m) {
    m.an = new Analysis(!!m.exact);
    m.simTarget = m.exact ? 0 : 240000;
  });

  var api = { MACHINES: MACHINES, Analysis: Analysis, A: A, B: B, C: C, D: D };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CR_MACHINES = api;
})(typeof window !== 'undefined' ? window : globalThis);
