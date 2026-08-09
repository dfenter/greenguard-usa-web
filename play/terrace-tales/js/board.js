/* Terrace Tales - match-3 board model */
(function (T) {
  'use strict';

  var SP_NONE = 0, SP_ROW = 1, SP_COL = 2, SP_BOMB = 3, SP_PRISM = 4;
  T.SP = { NONE: SP_NONE, ROW: SP_ROW, COL: SP_COL, BOMB: SP_BOMB, PRISM: SP_PRISM };

  function Board(cols, rows, ntypes, seed) {
    this.cols = cols; this.rows = rows; this.n = ntypes;
    this.rand = T.rng(seed);
    this.g = new Array(cols * rows);
    this.reset();
  }
  Board.prototype.i = function (c, r) { return r * this.cols + c; };
  Board.prototype.at = function (c, r) {
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return null;
    return this.g[r * this.cols + c];
  };
  Board.prototype.mk = function (t) { return { t: t, sp: SP_NONE, off: 0, pop: 0, dead: false, glow: 0 }; };

  Board.prototype.reset = function () {
    var tries = 0;
    do {
      for (var r = 0; r < this.rows; r++) {
        for (var c = 0; c < this.cols; c++) {
          var bad, t, guard = 0;
          do {
            t = (this.rand() * this.n) | 0;
            bad = false;
            var a = this.at(c - 1, r), b = this.at(c - 2, r);
            if (a && b && a.t === t && b.t === t) bad = true;
            var d = this.at(c, r - 1), e = this.at(c, r - 2);
            if (d && e && d.t === t && e.t === t) bad = true;
          } while (bad && ++guard < 24);
          this.g[this.i(c, r)] = this.mk(t);
        }
      }
      tries++;
    } while (!this.hasMove() && tries < 20);
    if (this.findMatches() || !this.hasMove()) this.rebuildPlayable();
  };

  Board.prototype.rebuildPlayable = function () {
    for (var r = 0; r < this.rows; r++) for (var c = 0; c < this.cols; c++) {
      var cell = this.g[this.i(c, r)];
      cell.t = (c + r * 2) % this.n; cell.sp = SP_NONE; cell.off = 0; cell.pop = 0; cell.dead = false;
    }
    this.g[this.i(0, 0)].t = 0; this.g[this.i(1, 0)].t = 0;
    this.g[this.i(2, 0)].t = 1; this.g[this.i(3, 0)].t = 0;
    return this.hasMove();
  };

  /* find all match runs; returns {clear:[idx], spawns:[{i,sp}]} */
  Board.prototype.findMatches = function (prefer) {
    var clearMap = {}, spawns = [], runsH = [], runsV = [], c, r, i;
    for (r = 0; r < this.rows; r++) {
      var run = 1;
      for (c = 1; c <= this.cols; c++) {
        var cur = c < this.cols ? this.g[this.i(c, r)] : null;
        var prev = this.g[this.i(c - 1, r)];
        if (cur && prev && !cur.dead && !prev.dead && cur.t === prev.t) run++;
        else {
          if (run >= 3) runsH.push({ c: c - run, r: r, len: run, t: prev.t, h: 1 });
          run = 1;
        }
      }
    }
    for (c = 0; c < this.cols; c++) {
      var run2 = 1;
      for (r = 1; r <= this.rows; r++) {
        var cur2 = r < this.rows ? this.g[this.i(c, r)] : null;
        var prev2 = this.g[this.i(c, r - 1)];
        if (cur2 && prev2 && !cur2.dead && !prev2.dead && cur2.t === prev2.t) run2++;
        else {
          if (run2 >= 3) runsV.push({ c: c, r: r - run2, len: run2, t: prev2.t, h: 0 });
          run2 = 1;
        }
      }
    }
    if (!runsH.length && !runsV.length) return null;

    var all = runsH.concat(runsV);
    var cellRuns = {};
    for (var k = 0; k < all.length; k++) {
      var R = all[k];
      for (var j = 0; j < R.len; j++) {
        var cc = R.h ? R.c + j : R.c, rr = R.h ? R.r : R.r + j;
        i = this.i(cc, rr);
        clearMap[i] = true;
        (cellRuns[i] || (cellRuns[i] = [])).push(k);
      }
    }
    /* spawn specials */
    var used = {};
    for (var k2 = 0; k2 < all.length; k2++) {
      var Rn = all[k2];
      if (used[k2]) continue;
      var idxs = [];
      for (var j2 = 0; j2 < Rn.len; j2++) {
        idxs.push(this.i(Rn.h ? Rn.c + j2 : Rn.c, Rn.h ? Rn.r : Rn.r + j2));
      }
      /* intersection -> bomb */
      var cross = -1, crossRun = -1;
      for (var q = 0; q < idxs.length; q++) {
        var cr = cellRuns[idxs[q]];
        if (cr && cr.length > 1) {
          for (var z = 0; z < cr.length; z++) if (cr[z] !== k2 && !used[cr[z]]) { cross = idxs[q]; crossRun = cr[z]; break; }
          if (cross >= 0) break;
        }
      }
      var pivot = -1;
      if (prefer != null && idxs.indexOf(prefer) >= 0) pivot = prefer;
      if (cross >= 0) {
        used[k2] = 1; used[crossRun] = 1;
        spawns.push({ i: pivot >= 0 ? pivot : cross, sp: SP_BOMB, t: Rn.t });
      } else if (Rn.len >= 5) {
        used[k2] = 1;
        spawns.push({ i: pivot >= 0 ? pivot : idxs[(Rn.len / 2) | 0], sp: SP_PRISM, t: Rn.t });
      } else if (Rn.len === 4) {
        used[k2] = 1;
        spawns.push({ i: pivot >= 0 ? pivot : idxs[1], sp: Rn.h ? SP_COL : SP_ROW, t: Rn.t });
      }
    }
    var clear = [];
    for (var key in clearMap) clear.push(key | 0);
    if (clear.length > this.cols * this.rows) clear.length = this.cols * this.rows;
    return { clear: clear, spawns: spawns };
  };

  /* expand clear list with special effects; returns expanded array */
  Board.prototype.expandSpecials = function (clear, protectIdx) {
    var set = {}, i;
    for (i = 0; i < clear.length; i++) set[clear[i]] = true;
    var queue = clear.slice(0), rounds = 0, triggered = false;
    while (queue.length && rounds < 400) {
      rounds++;
      var idx = queue.pop();
      var cell = this.g[idx];
      if (!cell || cell.sp === SP_NONE) continue;
      if (protectIdx && protectIdx[idx]) continue;
      var sp = cell.sp; cell.sp = SP_NONE;
      triggered = true;
      var c = idx % this.cols, r = (idx / this.cols) | 0, k;
      var add = [];
      if (sp === SP_ROW) { for (k = 0; k < this.cols; k++) add.push(this.i(k, r)); }
      else if (sp === SP_COL) { for (k = 0; k < this.rows; k++) add.push(this.i(c, k)); }
      else if (sp === SP_BOMB) {
        for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
          if (this.at(c + dc, r + dr)) add.push(this.i(c + dc, r + dr));
        }
      } else if (sp === SP_PRISM) {
        var tt = cell.t;
        for (k = 0; k < this.g.length; k++) if (this.g[k] && this.g[k].t === tt) add.push(k);
      }
      for (k = 0; k < add.length; k++) {
        if (!set[add[k]] && this.g[add[k]]) { set[add[k]] = true; queue.push(add[k]); }
      }
    }
    var out = [];
    for (var key in set) out.push(key | 0);
    return { list: out, triggered: triggered };
  };

  /* remove cells, compute falls. returns array of {idx, fromRows} for animation */
  Board.prototype.collapse = function () {
    var moves = [];
    for (var c = 0; c < this.cols; c++) {
      var write = this.rows - 1;
      for (var r = this.rows - 1; r >= 0; r--) {
        var cell = this.g[this.i(c, r)];
        if (cell && !cell.dead) {
          if (write !== r) {
            this.g[this.i(c, write)] = cell;
            this.g[this.i(c, r)] = null;
            cell.off = (write - r);
            moves.push(cell);
          }
          write--;
        } else {
          this.g[this.i(c, r)] = null;
        }
      }
      var spawnCount = write + 1;
      for (var w = write; w >= 0; w--) {
        var nc = this.mk((this.rand() * this.n) | 0);
        nc.off = spawnCount;
        this.g[this.i(c, w)] = nc;
        moves.push(nc);
      }
    }
    return moves;
  };

  Board.prototype.hasMove = function () {
    var c, r;
    for (r = 0; r < this.rows; r++) {
      for (c = 0; c < this.cols; c++) {
        if (c + 1 < this.cols && this.testSwap(c, r, c + 1, r)) return true;
        if (r + 1 < this.rows && this.testSwap(c, r, c, r + 1)) return true;
      }
    }
    return false;
  };
  Board.prototype.swapCells = function (c1, r1, c2, r2) {
    var i1 = this.i(c1, r1), i2 = this.i(c2, r2);
    var t = this.g[i1]; this.g[i1] = this.g[i2]; this.g[i2] = t;
  };
  Board.prototype.testSwap = function (c1, r1, c2, r2) {
    var a = this.at(c1, r1), b = this.at(c2, r2);
    if (!a || !b) return false;
    if (a.sp === SP_PRISM || b.sp === SP_PRISM) return true;
    this.swapCells(c1, r1, c2, r2);
    var m = this.findMatches();
    this.swapCells(c1, r1, c2, r2);
    return !!m;
  };
  Board.prototype.shuffle = function () {
    var types = [];
    for (var i = 0; i < this.g.length; i++) types.push(this.g[i].t);
    var tries = 0;
    do {
      for (var k = types.length - 1; k > 0; k--) {
        var j = (this.rand() * (k + 1)) | 0, tmp = types[k]; types[k] = types[j]; types[j] = tmp;
      }
      for (var m = 0; m < this.g.length; m++) this.g[m].t = types[m];
      tries++;
    } while ((this.findMatches() || !this.hasMove()) && tries < 60);
    if (this.findMatches() || !this.hasMove()) this.rebuildPlayable();
  };

  T.Board = Board;
})(TT);
