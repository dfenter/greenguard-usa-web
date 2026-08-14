/* Pure match-3 simulation. Phaser never reads or writes a cell directly. */
(function (root) {
  'use strict';

  var W = 8, H = 8, SIZE = W * H;
  var B_NONE = 0, B_CRATE = 1, B_IVY = 2;
  var SP_NONE = 0, SP_ROW = 1, SP_COL = 2, SP_BOMB = 3, SP_BLOOM = 4;
  var DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  var KDIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

  function rng(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function cell() { return { c: -1, b: B_NONE, plate: 0, key: false, sp: SP_NONE, pickup: 0, id: 0 }; }
  function copyGoal(g) { return { type: g.type, color: g.color == null ? -1 : g.color, need: g.n || 0, have: 0 }; }
  function addUnique(arr, idx) { if (arr.indexOf(idx) < 0) arr.push(idx); }

  function State(level) {
    this.W = W; this.H = H; this.level = level;
    this.rnd = rng(level.seed || 1); this.colors = Math.max(5, level.colors | 0);
    this.cells = new Array(SIZE); this.nextId = 1; this.movesLeft = level.moves | 0;
    this.score = 0; this.chain = 0; this.turn = 0; this.ivyTick = 0;
    this.ivyHitThisTurn = false; this.over = 0; this.lastEvents = null;
    this.goals = (level.goals || []).map(copyGoal); this.build();
  }
  var P = State.prototype;
  P.inb = function (x, y) { return x >= 0 && y >= 0 && x < W && y < H; };
  P.at = function (x, y) { return this.cells[y * W + x]; };
  P.randColor = function () { return Math.min(this.colors - 1, (this.rnd() * this.colors) | 0); };
  P.index = function (x, y) { return y * W + x; };
  P.xy = function (i) { return { x: i % W, y: (i / W) | 0 }; };

  P.build = function () {
    var i, x, y, pool = [];
    for (i = 0; i < SIZE; i++) { this.cells[i] = cell(); pool.push(i); }
    for (i = pool.length - 1; i > 0; i--) {
      var j = (this.rnd() * (i + 1)) | 0, temp = pool[i]; pool[i] = pool[j]; pool[j] = temp;
    }
    var cursor = 0;
    var take = function () { return pool[cursor++ % pool.length]; };
    var L = this.level;
    var plateCount = Math.max(0, L.plates | 0), doubleCount = Math.max(0, L.dbl | 0);
    if (plateCount) {
      var pw = Math.min(W, Math.max(3, Math.ceil(Math.sqrt(plateCount))));
      var ph = Math.min(H - 1, Math.ceil(plateCount / pw));
      var ox = (this.rnd() * (W - pw + 1)) | 0, oy = 1 + ((this.rnd() * Math.max(1, H - ph)) | 0);
      var plateCells = [];
      for (y = oy; y < oy + ph; y++) for (x = ox; x < ox + pw; x++) plateCells.push(this.index(x, y));
      for (i = 0; i < plateCells.length && plateCount > 0; i++) {
        var pc = this.cells[plateCells[i]];
        pc.plate = doubleCount-- > 0 ? 2 : 1; plateCount--;
      }
    }
    this.placeBlockers(B_CRATE, L.crates | 0, pool, take);
    this.placeBlockers(B_IVY, L.ivy | 0, pool, take);
    var columnOrder = [];
    for (x = 0; x < W; x++) {
      var burden = 0;
      for (y = 0; y < H; y++) if (this.at(x, y).b) burden++;
      columnOrder.push({ x: x, n: burden, r: this.rnd() });
    }
    columnOrder.sort(function (a, b) { return (a.n - b.n) || (a.r - b.r); });
    var keyCount = L.keys | 0;
    for (i = 0; i < keyCount; i++) {
      var placed = false;
      for (var co = 0; co < columnOrder.length && !placed; co++) {
        var col = columnOrder[(i + co) % columnOrder.length].x;
        for (y = 1; y < H - 1 && !placed; y++) {
          var kc = this.at(col, y);
          if (!kc.b && !kc.key && !kc.plate) { kc.key = true; placed = true; }
        }
      }
    }
    this.fillColors();
    this.placeBonuses(L.bonuses || {});
    this.plateTotal = this.countPlates();
    for (i = 0; i < this.goals.length; i++) if (this.goals[i].type === 'plates') this.goals[i].need = this.plateTotal;
    var ivies = 0;
    for (i = 0; i < SIZE; i++) if (this.cells[i].b === B_IVY) ivies++;
    this.ivyMax = Math.min(15, ivies + 6);
    if (!this.hasMove()) this.shuffleBoard();
  };

  P.placeBlockers = function (kind, count, pool, take) {
    var guard = 0;
    while (count > 0 && guard++ < 1000) {
      var idx = take(), c = this.cells[idx];
      if (((idx / W) | 0) === 0 || c.b || c.key || c.plate) continue;
      c.b = kind; c.c = -1; c.id = 0; count--;
    }
  };
  P.fillColors = function () {
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var c = this.at(x, y);
      if (c.b || c.key) continue;
      var tries = 0;
      do { c.c = this.randColor(); tries++; } while (tries < 50 && this.startsMatch(x, y));
      c.id = this.nextId++;
    }
  };
  P.placeBonuses = function (bonus) {
    var extras = Math.max(0, bonus.extra | 0), bombs = Math.max(0, bonus.bomb | 0), i;
    var candidates = [];
    for (i = 0; i < SIZE; i++) if (!this.cells[i].b && !this.cells[i].key && this.cells[i].c >= 0) candidates.push(i);
    for (i = candidates.length - 1; i > 0; i--) {
      var j = (this.rnd() * (i + 1)) | 0, t = candidates[i]; candidates[i] = candidates[j]; candidates[j] = t;
    }
    var at = 0;
    while (extras-- > 0 && at < candidates.length) this.cells[candidates[at++]].pickup = 1;
    while (bombs-- > 0 && at < candidates.length) {
      var c = this.cells[candidates[at++]]; c.pickup = 2; c.sp = SP_BLOOM;
    }
  };
  P.startsMatch = function (x, y) {
    var c = this.at(x, y).c, n = 1, i;
    if (c < 0) return false;
    for (i = x - 1; i >= 0 && this.at(i, y).c === c; i--) n++;
    if (n >= 3) return true;
    n = 1;
    for (i = y - 1; i >= 0 && this.at(x, i).c === c; i--) n++;
    return n >= 3;
  };
  P.countPlates = function () { var n = 0; for (var i = 0; i < SIZE; i++) n += this.cells[i].plate; return n; };

  P.findMatches = function () {
    var runs = [], x, y, c, end;
    for (y = 0; y < H; y++) {
      x = 0;
      while (x < W) {
        c = this.at(x, y).c;
        if (c < 0) { x++; continue; }
        end = x; while (end + 1 < W && this.at(end + 1, y).c === c) end++;
        if (end - x + 1 >= 3) runs.push({ h: true, x: x, y: y, len: end - x + 1, c: c });
        x = end + 1;
      }
    }
    for (x = 0; x < W; x++) {
      y = 0;
      while (y < H) {
        c = this.at(x, y).c;
        if (c < 0) { y++; continue; }
        end = y; while (end + 1 < H && this.at(x, end + 1).c === c) end++;
        if (end - y + 1 >= 3) runs.push({ h: false, x: x, y: y, len: end - y + 1, c: c });
        y = end + 1;
      }
    }
    return runs;
  };
  P.anyMatch = function () { return this.findMatches().length > 0; };
  P.canSwapCell = function (x, y) {
    if (!this.inb(x, y)) return false;
    var c = this.at(x, y);
    return !c.b && !c.key && (c.c >= 0 || c.sp > 0);
  };
  P.rawSwap = function (x1, y1, x2, y2) {
    var a = this.at(x1, y1), b = this.at(x2, y2), k;
    k = a.c; a.c = b.c; b.c = k;
    k = a.sp; a.sp = b.sp; b.sp = k;
    k = a.pickup; a.pickup = b.pickup; b.pickup = k;
    k = a.id; a.id = b.id; b.id = k;
  };
  P.testSwap = function (x1, y1, x2, y2) {
    if (!this.canSwapCell(x1, y1) || !this.canSwapCell(x2, y2) || Math.abs(x1 - x2) + Math.abs(y1 - y2) !== 1) return false;
    var a = this.at(x1, y1), b = this.at(x2, y2);
    if (a.sp || b.sp) return true;
    this.rawSwap(x1, y1, x2, y2);
    var ok = this.anyMatch();
    this.rawSwap(x1, y1, x2, y2);
    return ok;
  };
  P.listMoves = function () {
    var out = [];
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      if (x + 1 < W && this.testSwap(x, y, x + 1, y)) out.push([x, y, x + 1, y]);
      if (y + 1 < H && this.testSwap(x, y, x, y + 1)) out.push([x, y, x, y + 1]);
    }
    return out;
  };
  P.hasMove = function () { return this.listMoves().length > 0; };
  P.shuffleBoard = function () {
    var bag = [], i, c;
    for (i = 0; i < SIZE; i++) { c = this.cells[i]; if (!c.b && !c.key && c.c >= 0) bag.push(c.c); }
    for (var pass = 0; pass < 200; pass++) {
      for (i = bag.length - 1; i > 0; i--) { var j = (this.rnd() * (i + 1)) | 0, t = bag[i]; bag[i] = bag[j]; bag[j] = t; }
      var p = 0;
      for (i = 0; i < SIZE; i++) { c = this.cells[i]; if (!c.b && !c.key && c.c >= 0) c.c = bag[p++]; }
      if (!this.anyMatch() && this.hasMove()) return true;
    }
    for (i = 0; i < SIZE; i++) { c = this.cells[i]; if (!c.b && !c.key && c.c >= 0) c.c = (i * 3 + 1) % this.colors; }
    return this.hasMove();
  };

  P.addGoal = function (type, color, amount) {
    for (var i = 0; i < this.goals.length; i++) {
      var g = this.goals[i];
      if (g.type === type && (type !== 'collect' || g.color === color)) g.have = Math.min(g.need, g.have + amount);
    }
  };
  P.newEvent = function () { return { cleared: [], damaged: [], blasts: [], specials: [], moved: [], spawned: [], keys: [], ivy: null, bonusMoves: 0, chain: 0, score: 0 }; };
  P.markRuns = function (runs, marks, specials) {
    for (var i = 0; i < runs.length; i++) {
      var r = runs[i], list = [];
      for (var j = 0; j < r.len; j++) { var x = r.h ? r.x + j : r.x, y = r.h ? r.y : r.y + j, idx = this.index(x, y); list.push(idx); marks[idx] = true; }
      if (r.len >= 5) specials.push({ i: list[(r.len / 2) | 0], sp: SP_BLOOM, c: r.c });
      else if (r.len === 4) specials.push({ i: list[1], sp: r.h ? SP_ROW : SP_COL, c: r.c });
    }
    for (var a = 0; a < runs.length; a++) for (var b = a + 1; b < runs.length; b++) {
      var ra = runs[a], rb = runs[b];
      if (ra.h === rb.h || ra.c !== rb.c) continue;
      var hr = ra.h ? ra : rb, vr = ra.h ? rb : ra;
      if (vr.x >= hr.x && vr.x < hr.x + hr.len && hr.y >= vr.y && hr.y < vr.y + vr.len) {
        var cross = this.index(vr.x, hr.y), found = false;
        for (var si = 0; si < specials.length; si++) if (specials[si].i === cross) { specials[si].sp = SP_BOMB; found = true; }
        if (!found) specials.push({ i: cross, sp: SP_BOMB, c: ra.c });
      }
    }
  };
  P.expand = function (queue, marks, blasts) {
    var guard = 0;
    while (queue.length && guard++ < 4000) {
      var idx = queue.pop(), c = this.cells[idx];
      if (!c || !c.sp) continue;
      var sp = c.sp, x = idx % W, y = (idx / W) | 0, i;
      c.sp = SP_NONE; blasts.push({ x: x, y: y, sp: sp });
      if (sp === SP_ROW) for (i = 0; i < W; i++) this.markBlast(i + y * W, marks, queue);
      else if (sp === SP_COL) for (i = 0; i < H; i++) this.markBlast(x + i * W, marks, queue);
      else if (sp === SP_BOMB) for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) if (this.inb(x + dx, y + dy)) this.markBlast(this.index(x + dx, y + dy), marks, queue);
      else if (sp === SP_BLOOM) for (i = 0; i < SIZE; i++) if (this.cells[i].c === c.c) this.markBlast(i, marks, queue);
    }
  };
  P.markBlast = function (idx, marks, queue) {
    var c = this.cells[idx];
    if (!c || c.key || marks[idx]) return;
    marks[idx] = true;
    if (c.sp) queue.push(idx);
  };
  P.commit = function (marks, specials, blasts, force, ev) {
    var keep = {}, idx, i, x, y, c;
    for (i = 0; i < specials.length; i++) keep[specials[i].i] = specials[i];
    var touched = [];
    for (var m in marks) {
      idx = +m; c = this.cells[idx]; x = idx % W; y = (idx / W) | 0;
      if (c.b) {
        if (force) { ev.damaged.push({ x: x, y: y, b: c.b, direct: true }); if (c.b === B_IVY) this.ivyHitThisTurn = true; c.b = B_NONE; c.c = -1; c.id = 0; this.score += 35; }
        continue;
      }
      if (c.key || c.c < 0) continue;
      ev.cleared.push({ x: x, y: y, c: c.c, sp: c.sp, pickup: c.pickup, id: c.id });
      touched.push(idx); this.addGoal('collect', c.c, 1); this.score += 10 + this.chain * 5;
      if (c.pickup === 1) { this.movesLeft += 2; ev.bonusMoves += 2; this.score += 60; }
      if (c.plate > 0) { c.plate--; ev.damaged.push({ x: x, y: y, plate: true, stage: c.plate }); this.addGoal('plates', -1, 1); this.score += 25; }
      if (keep[idx]) { c.c = keep[idx].c; c.sp = keep[idx].sp; c.pickup = 0; c.id = this.nextId++; ev.specials.push({ x: x, y: y, sp: c.sp }); }
      else { c.c = -1; c.sp = SP_NONE; c.pickup = 0; c.id = 0; }
    }
    var seen = {};
    for (i = 0; i < touched.length; i++) {
      idx = touched[i]; x = idx % W; y = (idx / W) | 0;
      for (var d = 0; d < DIRS.length; d++) {
        var nx = x + DIRS[d][0], ny = y + DIRS[d][1];
        if (!this.inb(nx, ny)) continue;
        var ni = this.index(nx, ny), nb = this.cells[ni];
        if (seen[ni] || !nb.b) continue;
        seen[ni] = true; ev.damaged.push({ x: nx, y: ny, b: nb.b, direct: false });
        if (nb.b === B_IVY) this.ivyHitThisTurn = true;
        nb.b = B_NONE; nb.c = -1; nb.id = 0; this.score += 30;
      }
      for (d = 0; d < KDIRS.length; d++) {
        var kx = x + KDIRS[d][0], ky = y + KDIRS[d][1];
        if (this.inb(kx, ky) && this.at(kx, ky).key) this.at(kx, ky).keyJolt = true;
      }
    }
    this.chain++; ev.chain = Math.max(ev.chain || 0, this.chain);
    return ev;
  };
  P.resolveMarks = function (marks, specials, force, ev) {
    var queue = [], idx;
    for (idx in marks) queue.push(+idx);
    this.expand(queue, marks, ev.blasts);
    for (var i = 0; i < specials.length; i++) if (!marks[specials[i].i]) { marks[specials[i].i] = true; queue.push(specials[i].i); }
    this.commit(marks, specials, ev.blasts, force || ev.blasts.length > 0, ev);
  };
  P.clearOne = function (ev) {
    var runs = this.findMatches();
    if (!runs.length) return false;
    var marks = {}, specials = [];
    this.markRuns(runs, marks, specials);
    this.resolveMarks(marks, specials, false, ev);
    return true;
  };
  P.gravity = function (ev) {
    var x, y;
    for (x = 0; x < W; x++) {
      var bottom = H - 1;
      for (y = H - 1; y >= -1; y--) {
        if (y >= 0 && !this.at(x, y).b) continue;
        var top = y + 1, write = bottom;
        for (var read = bottom; read >= top; read--) {
          var source = this.at(x, read);
          if (source.c < 0 && !source.key) continue;
          if (write !== read) {
            var dest = this.at(x, write);
            var sourceId = source.id;
            dest.c = source.c; dest.sp = source.sp; dest.key = source.key; dest.pickup = source.pickup; dest.id = source.id;
            source.c = -1; source.sp = SP_NONE; source.key = false; source.pickup = 0; source.id = 0;
            ev.moved.push({ fx: x, fy: read, tx: x, ty: write, id: sourceId });
          }
          write--;
        }
        for (read = write; read >= top; read--) {
          var n = this.at(x, read); n.c = this.randColor(); n.sp = SP_NONE; n.key = false; n.pickup = 0; n.id = this.nextId++;
          ev.spawned.push({ x: x, y: read, id: n.id });
        }
        bottom = y - 1;
      }
    }
  };
  P.collectKeys = function (ev) {
    for (var x = 0; x < W; x++) {
      var c = this.at(x, H - 1);
      if (c.key) { c.key = false; c.c = -1; c.id = 0; this.addGoal('keys', -1, 1); this.score += 200; ev.keys.push({ x: x, y: H - 1 }); }
    }
  };
  P.joltKeys = function (ev) {
    for (var i = 0; i < SIZE; i++) {
      var keyCell = this.cells[i];
      if (!keyCell.key || !keyCell.keyJolt) continue;
      keyCell.keyJolt = false;
      var x = i % W, y = (i / W) | 0;
      for (var step = 0; step < 2 && y < H - 1; step++) {
        var below = this.at(x, y + 1);
        if (below.b || below.key) break;
        if (below.c >= 0) {
          ev.cleared.push({ x: x, y: y + 1, c: below.c, sp: below.sp, slip: true, id: below.id });
          this.addGoal('collect', below.c, 1); this.score += 10;
          if (below.plate > 0) { below.plate--; ev.damaged.push({ x: x, y: y + 1, plate: true, stage: below.plate }); this.addGoal('plates', -1, 1); this.score += 25; }
        }
        below.c = -1; below.sp = SP_NONE; below.pickup = 0; below.id = 0;
        keyCell.key = false; below.key = true; below.keyJolt = false;
        keyCell = below; y++;
      }
    }
  };
  P.spreadIvy = function (ev) {
    if (this.ivyHitThisTurn) { this.ivyTick = 0; return; }
    this.ivyTick++;
    if (this.ivyTick < 3) return;
    this.ivyTick = 0;
    var ivy = [], i;
    for (i = 0; i < SIZE; i++) if (this.cells[i].b === B_IVY) ivy.push(i);
    if (!ivy.length || ivy.length >= this.ivyMax) return;
    for (var tries = 0; tries < 32; tries++) {
      var source = ivy[(this.rnd() * ivy.length) | 0], x = source % W, y = (source / W) | 0, d = DIRS[(this.rnd() * DIRS.length) | 0];
      var nx = x + d[0], ny = y + d[1];
      if (!this.inb(nx, ny) || ny === 0) continue;
      var c = this.at(nx, ny);
      if (c.b || c.key || c.plate || (ny > 0 && this.at(nx, ny - 1).key)) continue;
      c.b = B_IVY; c.c = -1; c.id = 0; ev.ivy = { x: nx, y: ny }; return;
    }
  };
  P.resolve = function (ev) {
    if (!ev.chain) this.chain = 0;
    for (var guard = 0; guard < 80; guard++) {
      if (!this.clearOne(ev)) break;
      this.joltKeys(ev);
      this.gravity(ev); this.collectKeys(ev);
    }
    this.collectKeys(ev);
  };
  P.playSwap = function (x1, y1, x2, y2) {
    if (!this.testSwap(x1, y1, x2, y2)) return false;
    var scoreBefore = this.score;
    var beforeA = this.at(x1, y1), beforeB = this.at(x2, y2);
    var specialA = beforeA.sp, specialB = beforeB.sp;
    this.rawSwap(x1, y1, x2, y2); this.movesLeft--; this.turn++; this.ivyHitThisTurn = false;
    var ev = this.newEvent(), marks = {}, specials = [];
    if (specialA || specialB) {
      var sc = this.at(x1, y1).sp ? this.at(x2, y2).c : this.at(x1, y1).c;
      var bombBomb = specialA === SP_BLOOM && specialB === SP_BLOOM;
      for (var i = 0; i < SIZE; i++) if (!this.cells[i].b && !this.cells[i].key && (bombBomb || this.cells[i].c === sc || this.cells[i].sp)) marks[i] = true;
      this.resolveMarks(marks, specials, true, ev);
    } else this.resolve(ev);
    this.spreadIvy(ev); this.gravity(ev); this.resolve(ev);
    if (this.goalsMet()) this.over = 1; else if (this.movesLeft <= 0) this.over = 2;
    ev.score = this.score - scoreBefore; this.lastEvents = ev; return ev;
  };
  P.blast = function (indices) {
    var scoreBefore = this.score;
    var ev = this.newEvent(), marks = {};
    for (var i = 0; i < indices.length; i++) if (this.cells[indices[i]]) marks[indices[i]] = true;
    this.ivyHitThisTurn = false; this.resolveMarks(marks, [], true, ev); this.gravity(ev); this.resolve(ev);
    if (this.goalsMet()) this.over = 1;
    ev.score = this.score - scoreBefore; this.lastEvents = ev; return ev;
  };
  P.hammer = function (x, y) {
    if (!this.inb(x, y) || this.at(x, y).key) return false;
    return this.blast([this.index(x, y)]);
  };
  P.rowRocket = function (y) {
    var rows = [], x; for (x = 0; x < W; x++) rows.push(this.index(x, y)); return this.blast(rows);
  };
  P.shuffle = function () { var ok = this.shuffleBoard(), ev = this.newEvent(); ev.shuffle = ok; this.lastEvents = ev; return ev; };
  P.goalsMet = function () { for (var i = 0; i < this.goals.length; i++) if (this.goals[i].have < this.goals[i].need) return false; return true; };
  P.stars = function () {
    var s = 1, moves = this.level.moves | 0;
    if (this.movesLeft >= Math.ceil(moves * 0.15)) s++;
    if (this.movesLeft >= Math.ceil(moves * 0.30)) s++;
    return s;
  };
  P.goalSnapshot = function () { return this.goals.map(function (g) { return { type: g.type, color: g.color, need: g.need, have: g.have }; }); };

  var API = { W: W, H: H, State: State, rng: rng, B_NONE: B_NONE, B_CRATE: B_CRATE, B_IVY: B_IVY,
    SP_NONE: SP_NONE, SP_ROW: SP_ROW, SP_COL: SP_COL, SP_BOMB: SP_BOMB, SP_BLOOM: SP_BLOOM };
  root.PP = root.PP || {}; root.PP.engine = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
