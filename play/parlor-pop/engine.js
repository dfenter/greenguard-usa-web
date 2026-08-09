/* Parlor Pop - engine.js
   Pure board logic. No DOM. Shared by the game and by verify.js (node). */
(function (root) {
  'use strict';

  var W = 8, H = 8;
  var B_NONE = 0, B_CRATE = 1, B_IVY = 2;
  var SP_NONE = 0, SP_ROW = 1, SP_COL = 2, SP_BOMB = 3, SP_BLOOM = 4;
  var MAX_IVY = 14;
  var KDIR = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];

  function rng(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function cellNew() { return { c: -1, b: B_NONE, plate: 0, key: false, sp: SP_NONE, id: 0 }; }

  function State(level) {
    this.W = W; this.H = H;
    this.level = level;
    this.rnd = rng(level.seed);
    this.colors = level.colors;
    this.cells = new Array(W * H);
    this.nextId = 1;
    this.movesLeft = level.moves;
    this.score = 0;
    this.chain = 0;
    this.ivyTick = 0;
    this.ivyHitThisTurn = false;
    this.over = 0; // 0 playing, 1 win, 2 lose
    this.goals = [];
    for (var i = 0; i < level.goals.length; i++) {
      var g = level.goals[i];
      this.goals.push({ type: g.type, color: g.color === undefined ? -1 : g.color, need: g.n || 0, have: 0 });
    }
    this.build();
  }
  var P = State.prototype;

  P.at = function (x, y) { return this.cells[y * W + x]; };
  P.inb = function (x, y) { return x >= 0 && y >= 0 && x < W && y < H; };

  P.randColor = function () { return (this.rnd() * this.colors) | 0; };

  P.build = function () {
    var L = this.level, i, x, y, c;
    for (i = 0; i < W * H; i++) this.cells[i] = cellNew();
    // deterministic obstacle placement from the seed + per-level parameters
    var pool = [];
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) pool.push(y * W + x);
    for (i = pool.length - 1; i > 0; i--) {
      var j = (this.rnd() * (i + 1)) | 0; var t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    var pi = 0, self = this;
    function take() { return pool[pi++]; }

    var crates = L.crates | 0, ivy = L.ivy | 0, plates = L.plates | 0, dbl = L.dbl | 0, keys = L.keys | 0;

    // 1. Plates go down first as one contiguous slab so they are reachable as a
    //    block rather than scattered singles the player can never finish off.
    if (plates > 0) {
      var rw = Math.min(W, Math.max(3, Math.round(Math.sqrt(plates * 1.35))));
      var rh = Math.min(H - 1, Math.ceil(plates / rw));
      var ox = (this.rnd() * (W - rw + 1)) | 0;
      var oy = 1 + ((this.rnd() * (H - rh)) | 0);
      var cellsIn = [];
      for (y = oy; y < oy + rh; y++) for (x = ox; x < ox + rw; x++) cellsIn.push(y * W + x);
      // order by distance from the slab centre so doubles land in the middle
      var mx = ox + (rw - 1) / 2, my = oy + (rh - 1) / 2;
      cellsIn.sort(function (a, b) {
        var ax = a % W, ay = (a / W) | 0, bx = b % W, by = (b / W) | 0;
        return (Math.abs(ax - mx) + Math.abs(ay - my)) - (Math.abs(bx - mx) + Math.abs(by - my));
      });
      for (i = 0; i < cellsIn.length && plates > 0; i++) {
        this.cells[cellsIn[i]].plate = (dbl-- > 0) ? 2 : 1;
        plates--;
      }
    }

    // 2. Crates: never in the top row (the board must always refill) and never
    //    on a plate (a plate under a crate could not be reached).
    var guard = 0;
    while (crates > 0 && guard++ < 900) {
      if (pi >= pool.length) break;
      var s = take();
      if ((s / W | 0) === 0 || this.cells[s].plate || this.cells[s].b) continue;
      this.cells[s].b = B_CRATE; crates--;
    }
    guard = 0;
    while (ivy > 0 && guard++ < 900) {
      if (pi >= pool.length) break;
      var s2 = take();
      if ((s2 / W | 0) === 0 || this.cells[s2].plate || this.cells[s2].b) continue;
      this.cells[s2].b = B_IVY; ivy--;
    }

    // 3. Keys start high, but only in columns with a clear run to the floor,
    //    so a key can never be sealed behind a stack of crates.
    var colCost = [];
    for (x = 0; x < W; x++) {
      var blocks = 0;
      for (y = 0; y < H; y++) if (this.at(x, y).b) blocks++;
      colCost.push({ x: x, n: blocks, r: this.rnd() });
    }
    colCost.sort(function (a, b) { return (a.n - b.n) || (a.r - b.r); });
    var ci = 0;
    guard = 0;
    while (keys > 0 && guard++ < 900) {
      var kx = colCost[ci % W].x; ci++;
      var ky = 1;
      while (ky < 4 && (this.at(kx, ky).b || this.at(kx, ky).key)) ky++;
      if (ky >= 4) continue;
      var kc = this.at(kx, ky);
      kc.key = true; kc.c = -1; kc.plate = 0; keys--;
    }
    // fill with colors, avoiding starting matches
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      var cc = this.at(x, y);
      if (cc.b || cc.key) continue;
      var tries = 0;
      do { cc.c = this.randColor(); tries++; } while (tries < 30 && this.startsMatch(x, y));
      cc.id = this.nextId++;
    }
    // guarantee at least one legal move
    if (!this.hasMove() && !this.shuffle()) this.build();
    var iv0 = 0;
    for (i = 0; i < W * H; i++) if (this.cells[i].b === B_IVY) iv0++;
    this.ivyMax = Math.min(MAX_IVY, iv0 + 5);   // pressure, not a takeover
    this.plateTotal = this.countPlates();
    for (var gi = 0; gi < this.goals.length; gi++) {
      if (this.goals[gi].type === 'plates') this.goals[gi].need = this.plateTotal;
    }
  };

  P.countPlates = function () {
    var n = 0; for (var i = 0; i < W * H; i++) n += this.cells[i].plate; return n;
  };

  P.startsMatch = function (x, y) {
    var c = this.at(x, y).c; if (c < 0) return false;
    var n = 1, i;
    for (i = x - 1; i >= 0 && this.at(i, y).c === c; i--) n++;
    if (n >= 3) return true;
    n = 1;
    for (i = y - 1; i >= 0 && this.at(x, i).c === c; i--) n++;
    return n >= 3;
  };

  /* ---------- matching ---------- */
  P.findMatches = function () {
    var runs = [], x, y, i, c;
    for (y = 0; y < H; y++) {
      x = 0;
      while (x < W) {
        c = this.at(x, y).c;
        if (c < 0) { x++; continue; }
        var e = x; while (e + 1 < W && this.at(e + 1, y).c === c) e++;
        if (e - x + 1 >= 3) runs.push({ h: true, x: x, y: y, len: e - x + 1, c: c });
        x = e + 1;
      }
    }
    for (x = 0; x < W; x++) {
      y = 0;
      while (y < H) {
        c = this.at(x, y).c;
        if (c < 0) { y++; continue; }
        var e2 = y; while (e2 + 1 < H && this.at(x, e2 + 1).c === c) e2++;
        if (e2 - y + 1 >= 3) runs.push({ h: false, x: x, y: y, len: e2 - y + 1, c: c });
        y = e2 + 1;
      }
    }
    return runs;
  };

  P.anyMatch = function () { return this.findMatches().length > 0; };

  /* ---------- swap ---------- */
  P.canSwapCell = function (x, y) {
    if (!this.inb(x, y)) return false;
    var c = this.at(x, y);
    return !c.b && !c.key && c.c >= 0;
  };

  P.rawSwap = function (x1, y1, x2, y2) {
    var a = this.at(x1, y1), b = this.at(x2, y2);
    var t = this.cells[y1 * W + x1];
    // swap tile payload only (plates stay with the cell)
    var tc = a.c, ts = a.sp, ti = a.id;
    a.c = b.c; a.sp = b.sp; a.id = b.id;
    b.c = tc; b.sp = ts; b.id = ti;
    return t;
  };

  // returns true if the swap is legal (creates a match or involves a special)
  P.testSwap = function (x1, y1, x2, y2) {
    if (!this.canSwapCell(x1, y1) || !this.canSwapCell(x2, y2)) return false;
    if (Math.abs(x1 - x2) + Math.abs(y1 - y2) !== 1) return false;
    var a = this.at(x1, y1), b = this.at(x2, y2);
    if (a.sp || b.sp) return true;
    this.rawSwap(x1, y1, x2, y2);
    var ok = this.anyMatch();
    this.rawSwap(x1, y1, x2, y2);
    return ok;
  };

  P.hasMove = function () {
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      if (x + 1 < W && this.testSwap(x, y, x + 1, y)) return true;
      if (y + 1 < H && this.testSwap(x, y, x, y + 1)) return true;
    }
    return false;
  };

  P.listMoves = function () {
    var out = [];
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      if (x + 1 < W && this.testSwap(x, y, x + 1, y)) out.push([x, y, x + 1, y]);
      if (y + 1 < H && this.testSwap(x, y, x, y + 1)) out.push([x, y, x, y + 1]);
    }
    return out;
  };

  P.shuffle = function () {
    var bag = [], i, cc;
    for (i = 0; i < W * H; i++) { cc = this.cells[i]; if (!cc.b && !cc.key && cc.c >= 0) bag.push(cc.c); }
    for (var g = 0; g < 600; g++) {
      for (i = bag.length - 1; i > 0; i--) {
        var j = (this.rnd() * (i + 1)) | 0; var t = bag[i]; bag[i] = bag[j]; bag[j] = t;
      }
      var k = 0;
      for (i = 0; i < W * H; i++) { cc = this.cells[i]; if (!cc.b && !cc.key && cc.c >= 0) cc.c = bag[k++]; }
      if (!this.anyMatch() && this.hasMove()) return true;
    }
    return false;
  };

  /* ---------- clearing ---------- */
  P.addGoal = function (type, color, n) {
    for (var i = 0; i < this.goals.length; i++) {
      var g = this.goals[i];
      if (g.type !== type) continue;
      if (type === 'collect' && g.color !== color) continue;
      g.have = Math.min(g.need, g.have + n);
    }
  };

  // Compute one resolution step. Returns null when the board is settled.
  P.clearStep = function () {
    var runs = this.findMatches();
    if (!runs.length) return null;
    var i, j, k, x, y;
    var mark = {};              // idx -> true
    var newSpecials = [];       // {x,y,sp,c}
    var queue = [];

    for (i = 0; i < runs.length; i++) {
      var r = runs[i], list = [];
      for (j = 0; j < r.len; j++) {
        var cx = r.h ? r.x + j : r.x, cy = r.h ? r.y : r.y + j;
        list.push(cy * W + cx); mark[cy * W + cx] = true;
      }
      // special creation
      var sp = SP_NONE;
      if (r.len === 4) sp = r.h ? SP_ROW : SP_COL;
      else if (r.len >= 5) sp = SP_BLOOM;
      if (sp) {
        var mid = list[(r.len / 2) | 0];
        newSpecials.push({ i: mid, sp: sp, c: r.c });
      }
    }
    // cross intersections -> bomb
    for (i = 0; i < runs.length; i++) for (j = 0; j < runs.length; j++) {
      var a = runs[i], b = runs[j];
      if (!a.h || b.h || a.c !== b.c) continue;
      if (b.x >= a.x && b.x < a.x + a.len && a.y >= b.y && a.y < b.y + b.len) {
        var mi = a.y * W + b.x;
        var found = false;
        for (k = 0; k < newSpecials.length; k++) if (newSpecials[k].i === mi) { newSpecials[k].sp = SP_BOMB; found = true; }
        if (!found) newSpecials.push({ i: mi, sp: SP_BOMB, c: a.c });
      }
    }

    for (var m in mark) queue.push(+m);
    var blasts = [];
    this.expand(queue, mark, blasts);

    return this.commit(mark, newSpecials, blasts);
  };

  // Detonate specials found in the marked set (cascading).
  P.expand = function (queue, mark, blasts) {
    var guard = 0;
    while (queue.length && guard++ < 4000) {
      var idx = queue.pop();
      var cc = this.cells[idx];
      if (!cc || !cc.sp) continue;
      var sp = cc.sp; cc.sp = SP_NONE;
      var x = idx % W, y = (idx / W) | 0, i;
      blasts.push({ x: x, y: y, sp: sp });
      var add = [];
      if (sp === SP_ROW) { for (i = 0; i < W; i++) add.push(y * W + i); }
      else if (sp === SP_COL) { for (i = 0; i < H; i++) add.push(i * W + x); }
      else if (sp === SP_BOMB) {
        for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++)
          if (this.inb(x + dx, y + dy)) add.push((y + dy) * W + x + dx);
      } else if (sp === SP_BLOOM) {
        var col = cc.c;
        for (i = 0; i < W * H; i++) if (this.cells[i].c === col && !this.cells[i].b) add.push(i);
      }
      for (i = 0; i < add.length; i++) {
        var ai = add[i]; if (mark[ai]) continue;
        var t = this.cells[ai];
        if (t.b || t.key) continue;
        mark[ai] = true; queue.push(ai);
      }
    }
  };

  // Explicit blast (booster hammer / rocket)
  P.blast = function (list) {
    var mark = {}, queue = [], i;
    for (i = 0; i < list.length; i++) {
      var idx = list[i], t = this.cells[idx];
      if (!t || t.key) continue;
      mark[idx] = true; queue.push(idx);
    }
    var blasts = [];
    this.expand(queue, mark, blasts);
    return this.commit(mark, [], blasts, true);
  };

  P.commit = function (mark, newSpecials, blasts, force) {
    var cleared = [], damaged = [], i, idx, x, y;
    var keep = {};
    for (i = 0; i < newSpecials.length; i++) keep[newSpecials[i].i] = newSpecials[i];

    var hitNeighbors = {};
    for (var m in mark) {
      idx = +m; x = idx % W; y = (idx / W) | 0;
      var cc = this.cells[idx];
      if (cc.b) {
        if (force) { // direct hit destroys a blocker
          if (cc.b === B_IVY) this.ivyHitThisTurn = true;
          damaged.push({ x: x, y: y, b: cc.b });
          cc.b = B_NONE; cc.c = -1;
          this.addGoal('blockers', -1, 1);
        }
        continue;
      }
      if (cc.key) continue;
      if (cc.c < 0) continue;
      cleared.push({ x: x, y: y, c: cc.c, sp: cc.sp });
      this.addGoal('collect', cc.c, 1);
      this.score += 10 + this.chain * 5;
      if (cc.plate > 0) {
        cc.plate--;
        damaged.push({ x: x, y: y, plate: true });
        this.addGoal('plates', -1, 1);
        this.score += 25;
      }
      // adjacent blockers take damage
      hitNeighbors[idx] = true;
      if (keep[idx]) { cc.c = keep[idx].c; cc.sp = keep[idx].sp; cc.id = this.nextId++; }
      else { cc.c = -1; cc.sp = SP_NONE; cc.id = 0; }
    }
    // blocker damage from adjacency
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    var seen = {}, slip = {};
    for (var h in hitNeighbors) {
      idx = +h; x = idx % W; y = (idx / W) | 0;
      for (i = 0; i < 4; i++) {
        var nx = x + dirs[i][0], ny = y + dirs[i][1];
        if (!this.inb(nx, ny)) continue;
        var ni = ny * W + nx; if (seen[ni]) continue;
        var nc = this.cells[ni];
        if (!nc.b) continue;
        seen[ni] = true;
        if (nc.b) {
          if (nc.b === B_IVY) this.ivyHitThisTurn = true;
          damaged.push({ x: nx, y: ny, b: nc.b });
          nc.b = B_NONE; nc.c = -1; nc.id = 0;
          this.score += 30;
        }
      }
      // A match anywhere around a key (including diagonals) jolts it loose: the
      // tile directly beneath gives way and gravity carries the key one row down.
      for (i = 0; i < 8; i++) {
        var kx = x + KDIR[i][0], ky = y + KDIR[i][1];
        if (!this.inb(kx, ky)) continue;
        var kc2 = this.at(kx, ky);
        if (kc2.key) slip[ky * W + kx] = true;
      }
    }
    // resolve key slips after the neighbour sweep so order cannot matter
    for (var sk in slip) {
      idx = +sk; x = idx % W; y = (idx / W) | 0;
      // the jolt shakes loose up to two tiles beneath the key
      for (var drop = 1; drop <= 2; drop++) {
        if (y + drop >= H) break;
        var below = this.at(x, y + drop);
        if (below.b || below.key || below.c < 0) break;
        cleared.push({ x: x, y: y + drop, c: below.c, sp: below.sp, slip: true });
        this.addGoal('collect', below.c, 1);
        this.score += 10;
        if (below.plate > 0) {
          below.plate--;
          damaged.push({ x: x, y: y + drop, plate: true });
          this.addGoal('plates', -1, 1);
          this.score += 25;
        }
        below.c = -1; below.sp = SP_NONE; below.id = 0;
      }
    }
    this.chain++;
    if (cleared.length || damaged.length) return { cleared: cleared, damaged: damaged, blasts: blasts, specials: newSpecials };
    return null;
  };

  /* ---------- gravity ---------- */
  // Column-wise, split into segments by blockers. Each segment compacts down
  // and refills from its own top, so no permanent holes can form.
  P.gravity = function () {
    var moves = [], spawns = [], x, y;
    for (x = 0; x < W; x++) {
      var segEnd = H - 1;
      for (y = H - 1; y >= -1; y--) {
        var isBlock = (y < 0) || this.at(x, y).b;
        if (!isBlock) continue;
        // segment is rows [y+1 .. segEnd]
        if (segEnd > y) this.compact(x, y + 1, segEnd, moves, spawns);
        segEnd = y - 1;
      }
    }
    return { moves: moves, spawns: spawns };
  };

  P.compact = function (x, top, bottom, moves, spawns) {
    var write = bottom, y;
    for (y = bottom; y >= top; y--) {
      var cc = this.at(x, y);
      if (cc.c < 0 && !cc.key) continue;
      if (write !== y) {
        var d = this.at(x, write);
        d.c = cc.c; d.sp = cc.sp; d.key = cc.key; d.id = cc.id;
        cc.c = -1; cc.sp = SP_NONE; cc.key = false; cc.id = 0;
        moves.push({ fx: x, fy: y, tx: x, ty: write });
      }
      write--;
    }
    for (y = write; y >= top; y--) {
      var n = this.at(x, y);
      n.c = this.randColor(); n.sp = SP_NONE; n.key = false; n.id = this.nextId++;
      spawns.push({ x: x, y: y });
    }
  };

  // keys that reached the bottom row leave the board
  P.collectKeys = function () {
    var out = [];
    for (var x = 0; x < W; x++) {
      var cc = this.at(x, H - 1);
      if (cc.key) {
        cc.key = false; cc.c = -1; cc.id = 0;
        this.addGoal('keys', -1, 1);
        this.score += 200;
        out.push({ x: x, y: H - 1 });
      }
    }
    return out;
  };

  /* ---------- turn bookkeeping ---------- */
  P.spreadIvy = function () {
    var i, x, y;
    if (this.ivyHitThisTurn) { this.ivyTick = 0; return null; }
    this.ivyTick++;
    if (this.ivyTick < 4) return null;
    this.ivyTick = 0;
    var ivies = [], count = 0;
    for (i = 0; i < W * H; i++) if (this.cells[i].b === B_IVY) { ivies.push(i); count++; }
    if (!count || count >= (this.ivyMax || MAX_IVY)) return null;
    // shuffle candidate order deterministically
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (var t = 0; t < 40; t++) {
      var src = ivies[(this.rnd() * ivies.length) | 0];
      x = src % W; y = (src / W) | 0;
      var d = dirs[(this.rnd() * 4) | 0];
      var nx = x + d[0], ny = y + d[1];
      if (!this.inb(nx, ny) || ny === 0) continue;
      var nc = this.at(nx, ny);
      if (nc.b || nc.key || nc.plate) continue;
      // never seal the cell directly under a key: that would strand the drop
      if (ny > 0 && this.at(nx, ny - 1).key) continue;
      nc.b = B_IVY; nc.c = -1; nc.sp = SP_NONE; nc.id = 0;
      return { x: nx, y: ny };
    }
    return null;
  };

  P.goalsMet = function () {
    for (var i = 0; i < this.goals.length; i++) if (this.goals[i].have < this.goals[i].need) return false;
    return true;
  };

  P.stars = function () {
    var m = this.level.moves, s = 1;
    if (this.movesLeft >= Math.ceil(m * 0.15)) s++;
    if (this.movesLeft >= Math.ceil(m * 0.3)) s++;
    return s;
  };

  /* ---------- headless full resolution (used by verify + boosters) ---------- */
  P.settle = function () {
    var guard = 0;
    this.chain = 0;
    while (guard++ < 200) {
      var r = this.clearStep();
      if (!r) break;
      this.gravity();
      this.collectKeys();
    }
    this.collectKeys();
    if (!this.hasMove()) this.shuffle();
  };

  P.playSwap = function (x1, y1, x2, y2) {
    this.rawSwap(x1, y1, x2, y2);
    this.movesLeft--;
    this.ivyHitThisTurn = false;
    this.settle();
    this.spreadIvy();
    this.gravity();
    this.settle();
    if (this.goalsMet()) this.over = 1;
    else if (this.movesLeft <= 0) this.over = 2;
  };

  var API = {
    W: W, H: H, State: State, rng: rng,
    B_NONE: B_NONE, B_CRATE: B_CRATE, B_IVY: B_IVY,
    SP_NONE: SP_NONE, SP_ROW: SP_ROW, SP_COL: SP_COL, SP_BOMB: SP_BOMB, SP_BLOOM: SP_BLOOM
  };
  root.PP = root.PP || {};
  root.PP.engine = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
