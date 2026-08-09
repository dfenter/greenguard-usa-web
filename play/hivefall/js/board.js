/* Hivefall - match-3 board engine (grid, swaps, cascades, animation phases) */
(function (w) {
  'use strict';
  var HF = w.HF;

  var CLEAR_TIME = 0.15, SWAP_TIME = 0.11, FALL_SPEED = 15.0; /* cells per second */

  function Board(cols, rows, ncolors) {
    this.cols = cols; this.rows = rows; this.nc = ncolors;
    this.grid = [];
    this.onClear = null;      /* fn(runs, combo) */
    this.reset();
  }

  Board.prototype.reset = function () {
    this.state = 'idle';
    this.combo = 0;
    this.sw = null;
    this.timer = 0;
    this.grid = [];
    for (var r = 0; r < this.rows; r++) {
      var row = [];
      for (var c = 0; c < this.cols; c++) row.push(null);
      this.grid.push(row);
    }
    for (var r2 = 0; r2 < this.rows; r2++)
      for (var c2 = 0; c2 < this.cols; c2++)
        this.grid[r2][c2] = { t: this.safeType(r2, c2), oy: 0, pop: -1 };
    this.ensureMove();
  };

  /* pick a colour that does not immediately complete a run */
  Board.prototype.safeType = function (r, c) {
    var tries = 0, t;
    do {
      t = HF.irnd(this.nc); tries++;
      var h = (c >= 2 && this.grid[r][c - 1] && this.grid[r][c - 2] &&
               this.grid[r][c - 1].t === t && this.grid[r][c - 2].t === t);
      var v = (r >= 2 && this.grid[r - 1][c] && this.grid[r - 2][c] &&
               this.grid[r - 1][c].t === t && this.grid[r - 2][c].t === t);
      if (!h && !v) break;
    } while (tries < 20);
    return t;
  };

  Board.prototype.at = function (r, c) {
    if (r < 0 || c < 0 || r >= this.rows || c >= this.cols) return null;
    return this.grid[r][c];
  };

  /* find all runs of >=3 -> [{t, cells:[{r,c}], len}] */
  Board.prototype.findRuns = function () {
    var runs = [], r, c, i;
    for (r = 0; r < this.rows; r++) {
      c = 0;
      while (c < this.cols) {
        var t = this.grid[r][c].t, n = 1;
        while (c + n < this.cols && this.grid[r][c + n].t === t) n++;
        if (n >= 3) {
          var cells = [];
          for (i = 0; i < n; i++) cells.push({ r: r, c: c + i });
          runs.push({ t: t, cells: cells, len: n });
        }
        c += n;
      }
    }
    for (c = 0; c < this.cols; c++) {
      r = 0;
      while (r < this.rows) {
        var t2 = this.grid[r][c].t, m = 1;
        while (r + m < this.rows && this.grid[r + m][c].t === t2) m++;
        if (m >= 3) {
          var cl = [];
          for (i = 0; i < m; i++) cl.push({ r: r + i, c: c });
          runs.push({ t: t2, cells: cl, len: m });
        }
        r += m;
      }
    }
    return runs;
  };

  Board.prototype.hasMove = function () {
    var self = this;
    function swap(r1, c1, r2, c2) {
      var a = self.grid[r1][c1], b = self.grid[r2][c2];
      self.grid[r1][c1] = b; self.grid[r2][c2] = a;
    }
    for (var r = 0; r < this.rows; r++) {
      for (var c = 0; c < this.cols; c++) {
        if (c + 1 < this.cols) {
          swap(r, c, r, c + 1);
          if (this.findRuns().length) { swap(r, c, r, c + 1); return true; }
          swap(r, c, r, c + 1);
        }
        if (r + 1 < this.rows) {
          swap(r, c, r + 1, c);
          if (this.findRuns().length) { swap(r, c, r + 1, c); return true; }
          swap(r, c, r + 1, c);
        }
      }
    }
    return false;
  };

  Board.prototype.ensureMove = function () {
    var guard = 0;
    while (guard++ < 30) {
      if (!this.findRuns().length && this.hasMove()) return true;
      this.shuffleTypes();
    }
    /* Deterministic fallback: a two-colour checker has no runs, and the
       top-left 2x2 contains a legal swap (when the game has its normal grid). */
    var colors = Math.max(1, Math.min(2, this.nc));
    for (var r = 0; r < this.rows; r++) for (var c = 0; c < this.cols; c++) {
      this.grid[r][c].t = (r + c) % colors;
      this.grid[r][c].oy = 0; this.grid[r][c].pop = -1;
    }
    return !this.findRuns().length && this.hasMove();
  };

  Board.prototype.shuffleTypes = function () {
    for (var r = 0; r < this.rows; r++)
      for (var c = 0; c < this.cols; c++) {
        this.grid[r][c].t = HF.irnd(this.nc);
        this.grid[r][c].oy = 0; this.grid[r][c].pop = -1;
      }
  };

  /* player attempts a swap; returns true if accepted */
  Board.prototype.trySwap = function (r, c, r2, c2) {
    if (this.state !== 'idle') return false;
    if (!this.at(r, c) || !this.at(r2, c2)) return false;
    if (Math.abs(r - r2) + Math.abs(c - c2) !== 1) return false;
    this.sw = { a: { r: r, c: c }, b: { r: r2, c: c2 }, t: 0, back: false };
    this.state = 'swap';
    this.combo = 0;
    HF.audio.sfx('swap');
    return true;
  };

  Board.prototype.doSwap = function () {
    var a = this.sw.a, b = this.sw.b;
    var t = this.grid[a.r][a.c]; this.grid[a.r][a.c] = this.grid[b.r][b.c]; this.grid[b.r][b.c] = t;
  };

  Board.prototype.startClear = function (runs) {
    var seen = {}, i, j;
    for (i = 0; i < runs.length; i++)
      for (j = 0; j < runs[i].cells.length; j++) {
        var cc = runs[i].cells[j];
        seen[cc.r * this.cols + cc.c] = 1;
        this.grid[cc.r][cc.c].pop = 0;
      }
    this.combo++;
    if (this.onClear) this.onClear(runs, this.combo);
    this.state = 'clear';
    this.timer = 0;
  };

  Board.prototype.collapse = function () {
    for (var c = 0; c < this.cols; c++) {
      var write = this.rows - 1;
      for (var r = this.rows - 1; r >= 0; r--) {
        var g = this.grid[r][c];
        if (g.pop >= 0) continue;
        if (write !== r) {
          this.grid[write][c] = g;
          g.oy = (write - r);
        }
        write--;
      }
      var above = 1;
      for (var r2 = write; r2 >= 0; r2--) {
        this.grid[r2][c] = { t: HF.irnd(this.nc), oy: (r2 + above), pop: -1 };
        above++;
      }
    }
    this.state = 'fall';
  };

  Board.prototype.update = function (dt) {
    var i, r, c;
    if (this.state === 'swap') {
      this.sw.t += dt / SWAP_TIME;
      if (this.sw.t >= 1) {
        this.doSwap();
        if (this.sw.back) { this.sw = null; this.state = 'idle'; return; }
        var runs = this.findRuns();
        if (runs.length) { this.sw = null; this.startClear(runs); }
        else {
          HF.audio.sfx('bad');
          this.sw = { a: this.sw.a, b: this.sw.b, t: 0, back: true };
        }
      }
      return;
    }
    if (this.state === 'clear') {
      this.timer += dt;
      var p = HF.clamp(this.timer / CLEAR_TIME, 0, 1);
      for (r = 0; r < this.rows; r++)
        for (c = 0; c < this.cols; c++) if (this.grid[r][c].pop >= 0) this.grid[r][c].pop = p;
      if (p >= 1) this.collapse();
      return;
    }
    if (this.state === 'fall') {
      var moving = false;
      for (r = 0; r < this.rows; r++)
        for (c = 0; c < this.cols; c++) {
          var g = this.grid[r][c];
          if (g.oy > 0) {
            g.oy -= FALL_SPEED * dt * (1 + g.oy * 0.55);
            if (g.oy < 0.001) g.oy = 0; else moving = true;
          }
        }
      if (!moving) {
        var runs2 = this.findRuns();
        if (runs2.length) this.startClear(runs2);
        else { this.state = 'idle'; this.combo = 0; if (!this.hasMove()) { this.shuffleTypes(); this.ensureMove(); } }
      }
      return;
    }
  };

  /* pixel helpers */
  Board.prototype.cellRect = function (L, r, c) {
    return { x: L.bx + c * L.cell, y: L.by + r * L.cell, s: L.cell };
  };

  Board.prototype.hitCell = function (L, x, y) {
    var c = Math.floor((x - L.bx) / L.cell), r = Math.floor((y - L.by) / L.cell);
    if (r < 0 || c < 0 || r >= this.rows || c >= this.cols) return null;
    return { r: r, c: c };
  };

  w.HF.Board = Board;
})(window);
