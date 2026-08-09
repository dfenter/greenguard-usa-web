/* Chroma Tap - board model, level generation, collapse / special resolution */
(function (g) {
  'use strict';

  var COLS = 7, ROWS = 8, MAXLV = 25;
  var SP_NONE = 0, SP_ROCKET = 1, SP_BOMB = 2, SP_ORB = 3;

  /* ---------- level generation (seeded, deterministic) ---------- */
  function levelDef(n) {
    n = Math.max(1, Math.min(MAXLV, n | 0));
    var r = g.CT.rng(9176 + n * 7919);
    var colors = n <= 2 ? 4 : (n <= 8 ? 5 : (n % 4 === 0 ? 6 : 5));
    var goals = { crate: 0, balloon: 0, gear: 0, pop: 0 };
    var popColor = 0;

    goals.crate = Math.min(8, 3 + Math.floor(n / 3));
    if (n >= 4) goals.balloon = Math.min(5, 2 + Math.floor((n - 4) / 6));
    if (n >= 7) goals.gear = Math.min(3, 1 + Math.floor((n - 7) / 7));
    if (n >= 10 && n % 3 === 1) { goals.pop = 24 + ((n * 5) % 16); popColor = r.int(colors); }
    if (n <= 2) goals.crate = 3 + n;

    var mv = 11 + goals.crate * 2.4 + goals.balloon * 2.8 + goals.gear * 4 + goals.pop * 0.32;
    mv = mv * (1.34 - n * 0.008) * (colors === 6 ? 1.18 : 1);
    mv = Math.round(mv);
    var moves = Math.max(15, Math.min(72, mv));

    return {
      n: n, colors: colors, moves: moves, goals: goals, popColor: popColor,
      seed: 9176 + n * 7919
    };
  }

  /* ---------- board ---------- */
  var uid = 1;
  function mkBlock(c) {
    return { k: 'b', c: c, sp: SP_NONE, oy: 0, vy: 0, sc: 1, dead: 0, flash: 0, id: uid++ };
  }
  function mkObj(kind, c) {
    return { k: kind, c: c || 0, sp: SP_NONE, oy: 0, vy: 0, sc: 1, dead: 0, flash: 0, hp: 1, id: uid++ };
  }

  function Board(def) {
    this.def = def;
    this.cols = COLS; this.rows = ROWS;
    this.rng = g.CT.rng(def.seed);
    this.cells = new Array(COLS * ROWS);
    this.queue = [];          // per column: array of upcoming colors
    this.movesLeft = def.moves;
    this.movesUsed = 0;
    this.score = 0;
    this.prog = { crate: 0, balloon: 0, gear: 0, pop: 0 };
    this.over = 0;            // 0 running, 1 win, -1 lose
    this.stars = 0;
    this.events = [];         // visual events for the renderer
    this.shuffles = 0;
    this.build();
  }

  Board.prototype.idx = function (x, y) { return y * this.cols + x; };
  Board.prototype.at = function (x, y) {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return null;
    return this.cells[y * this.cols + x];
  };
  Board.prototype.set = function (x, y, v) { this.cells[y * this.cols + x] = v; };

  Board.prototype.rc = function () { return this.rng.int(this.def.colors); };

  Board.prototype.build = function () {
    var x, y, i;
    for (i = 0; i < COLS * ROWS; i++) this.cells[i] = mkBlock(this.rc());
    this.queue = [];
    for (x = 0; x < COLS; x++) {
      var q = [];
      for (i = 0; i < 4; i++) q.push(this.rc());
      this.queue.push(q);
    }
    // obstacles. Gears go first and keep a clear chute of plain blocks beneath
    // them, so digging a gear out is always a solvable line of play.
    var gl = this.def.goals, k, tries, blocked = {}, usedCol = {};
    for (k = 0; k < gl.gear; k++) {
      for (tries = 0; tries < 80; tries++) {
        x = this.rng.int(COLS);
        y = 1 + this.rng.int(3);
        if (usedCol[x]) continue;
        var gc = this.at(x, y);
        if (!gc || gc.k !== 'b') continue;
        usedCol[x] = 1;
        this.set(x, y, mkObj('gear'));
        for (var yy = y + 1; yy < ROWS; yy++) blocked[x + ',' + yy] = 1;
        break;
      }
    }
    var spots = [];
    for (k = 0; k < gl.crate; k++) spots.push(['crate', 2, ROWS - 2]);
    for (k = 0; k < gl.balloon; k++) spots.push(['balloon', ROWS - 3, ROWS - 1]);
    for (k = 0; k < spots.length; k++) {
      for (tries = 0; tries < 90; tries++) {
        x = this.rng.int(COLS);
        y = spots[k][1] + this.rng.int(spots[k][2] - spots[k][1] + 1);
        if (blocked[x + ',' + y]) continue;
        var c = this.at(x, y);
        if (!c || c.k !== 'b') continue;
        // keep obstacles apart: a crate ringed by crates can become unreachable
        if (tries < 70 && this.neighborObstacles(x, y) > 0) continue;
        this.set(x, y, mkObj(spots[k][0]));
        break;
      }
    }
    // guarantee a legal opening move
    if (!this.hasMove()) this.rebuildPlayable();
  };

  Board.prototype.neighborObstacles = function (x, y) {
    var d = [[1, 0], [-1, 0], [0, 1], [0, -1]], n = 0;
    for (var i = 0; i < 4; i++) {
      var c = this.at(x + d[i][0], y + d[i][1]);
      if (c && c.k !== 'b') n++;
    }
    return n;
  };

  /* ---------- groups ---------- */
  Board.prototype.groupAt = function (x, y) {
    var c = this.at(x, y);
    if (!c || c.k !== 'b' || c.sp !== SP_NONE) return [];
    var seen = {}, out = [], st = [[x, y]];
    seen[x + ',' + y] = 1;
    while (st.length) {
      var p = st.pop(), px = p[0], py = p[1];
      out.push(p);
      var d = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (var i = 0; i < 4; i++) {
        var nx = px + d[i][0], ny = py + d[i][1], key = nx + ',' + ny;
        if (seen[key]) continue;
        var q = this.at(nx, ny);
        if (q && q.k === 'b' && q.sp === SP_NONE && q.c === c.c) { seen[key] = 1; st.push([nx, ny]); }
      }
    }
    return out;
  };

  Board.prototype.hasMove = function () {
    for (var y = 0; y < this.rows; y++) for (var x = 0; x < this.cols; x++) {
      var c = this.at(x, y);
      if (!c || c.k !== 'b') continue;
      if (c.sp !== SP_NONE) return true;
      var r = this.at(x + 1, y), d = this.at(x, y + 1);
      if (r && r.k === 'b' && r.sp === SP_NONE && r.c === c.c) return true;
      if (d && d.k === 'b' && d.sp === SP_NONE && d.c === c.c) return true;
    }
    return false;
  };

  Board.prototype.shuffleColors = function () {
    var list = [], i, x, y;
    for (y = 0; y < this.rows; y++) for (x = 0; x < this.cols; x++) {
      var c = this.at(x, y);
      if (c && c.k === 'b' && c.sp === SP_NONE) list.push(c);
    }
    for (i = list.length - 1; i > 0; i--) {
      var j = this.rng.int(i + 1), t = list[i].c; list[i].c = list[j].c; list[j].c = t;
    }
    this.shuffles++;
  };

  Board.prototype.rebuildPlayable = function () {
    var plain = [], x, y, i;
    for (y = 0; y < this.rows; y++) for (x = 0; x < this.cols; x++) {
      i = this.idx(x, y);
      if (this.cells[i] && this.cells[i].k === 'b') {
        this.cells[i].c = (x + y * 2) % this.def.colors;
        this.cells[i].sp = SP_NONE;
        plain.push([x, y]);
      }
    }
    for (i = 0; i < plain.length; i++) {
      var a = plain[i], right = this.at(a[0] + 1, a[1]), down = this.at(a[0], a[1] + 1);
      if (right && right.k === 'b') { this.at(a[0], a[1]).c = right.c = 0; if (this.hasMove()) return true; }
      if (down && down.k === 'b') { this.at(a[0], a[1]).c = down.c = 0; if (this.hasMove()) return true; }
    }
    if (plain.length) this.at(plain[0][0], plain[0][1]).sp = SP_ROCKET;
    return this.hasMove();
  };

  /* ---------- clearing ---------- */
  Board.prototype._mark = function (x, y, set) {
    var c = this.at(x, y);
    if (!c || set[c.id]) return null;
    set[c.id] = [x, y, c];
    return c;
  };

  // Damage obstacles neighbouring a set of coords
  Board.prototype._splash = function (coords, set) {
    var d = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (var i = 0; i < coords.length; i++) {
      for (var j = 0; j < d.length; j++) {
        var nx = coords[i][0] + d[j][0], ny = coords[i][1] + d[j][1];
        var c = this.at(nx, ny);
        if (!c) continue;
        if (c.k === 'crate' || c.k === 'balloon') this._mark(nx, ny, set);
      }
    }
  };

  Board.prototype.blastOf = function (x, y, c, set, queue) {
    var i, j;
    if (c.sp === SP_ROCKET) {
      if (c.rot) { for (j = 0; j < this.rows; j++) this._hit(x, j, set, queue); }
      else { for (i = 0; i < this.cols; i++) this._hit(i, y, set, queue); }
    } else if (c.sp === SP_BOMB) {
      for (i = -2; i <= 2; i++) for (j = -2; j <= 2; j++) {
        if (Math.abs(i) + Math.abs(j) <= 3) this._hit(x + i, y + j, set, queue);
      }
    } else if (c.sp === SP_ORB) {
      var col = (typeof c.orbColor === 'number') ? c.orbColor : this.commonColor();
      for (j = 0; j < this.rows; j++) for (i = 0; i < this.cols; i++) {
        var t = this.at(i, j);
        if (t && t.k === 'b' && (t.c === col || t.sp !== SP_NONE)) this._hit(i, j, set, queue);
      }
    }
  };

  Board.prototype._hit = function (x, y, set, queue) {
    var c = this.at(x, y);
    if (!c || set[c.id]) return;
    if (c.k === 'b' && c.sp !== SP_NONE) {
      if (queue.length < 96) queue.push([x, y, c]);
      return;
    }
    set[c.id] = [x, y, c];
  };

  Board.prototype.commonColor = function () {
    var cnt = [0, 0, 0, 0, 0, 0], x, y, best = 0;
    for (y = 0; y < this.rows; y++) for (x = 0; x < this.cols; x++) {
      var c = this.at(x, y);
      if (c && c.k === 'b' && c.sp === SP_NONE) cnt[c.c]++;
    }
    for (x = 1; x < 6; x++) if (cnt[x] > cnt[best]) best = x;
    return best;
  };

  // Fire one or more specials, chaining. Returns cleared set map.
  Board.prototype.fireSpecials = function (starts) {
    var set = {}, queue = starts.slice(), guard = 0;
    while (queue.length && guard++ < 200) {
      var e = queue.shift(), x = e[0], y = e[1], c = e[2];
      if (set[c.id]) continue;
      set[c.id] = [x, y, c];
      this.events.push({ t: c.sp === SP_ORB ? 'orb' : (c.sp === SP_BOMB ? 'bomb' : 'rocket'), x: x, y: y, rot: c.rot || 0 });
      this.blastOf(x, y, c, set, queue);
    }
    var coords = [], k;
    for (k in set) coords.push([set[k][0], set[k][1]]);
    this._splash(coords, set);
    return set;
  };

  // Combine two adjacent specials into a bigger effect
  Board.prototype.combo = function (a, b) {
    var set = {}, queue = [], lo = Math.min(a[2].sp, b[2].sp), hi = Math.max(a[2].sp, b[2].sp);
    var ax = a[0], ay = a[1], i, j;
    set[a[2].id] = a; set[b[2].id] = b;
    this.events.push({ t: 'combo', x: ax, y: ay, kind: lo + '' + hi });
    if (lo === SP_ROCKET && hi === SP_ROCKET) {
      for (i = 0; i < this.cols; i++) { this._hit(i, ay, set, queue); this._hit(i, b[1], set, queue); }
      for (j = 0; j < this.rows; j++) { this._hit(ax, j, set, queue); this._hit(b[0], j, set, queue); }
    } else if (lo === SP_ROCKET && hi === SP_BOMB) {
      for (i = 0; i < this.cols; i++) for (j = -1; j <= 1; j++) this._hit(i, ay + j, set, queue);
      for (j = 0; j < this.rows; j++) for (i = -1; i <= 1; i++) this._hit(ax + i, j, set, queue);
    } else if (lo === SP_BOMB && hi === SP_BOMB) {
      for (i = -3; i <= 3; i++) for (j = -3; j <= 3; j++)
        if (Math.abs(i) + Math.abs(j) <= 4) this._hit(ax + i, ay + j, set, queue);
    } else if (hi === SP_ORB && lo === SP_ORB) {
      for (j = 0; j < this.rows; j++) for (i = 0; i < this.cols; i++) this._hit(i, j, set, queue);
    } else if (hi === SP_ORB && lo === SP_ROCKET) {
      var col = this.commonColor();
      for (j = 0; j < this.rows; j++) for (i = 0; i < this.cols; i++) {
        var t = this.at(i, j);
        if (t && t.k === 'b' && t.c === col) {
          var k2;
          for (k2 = 0; k2 < this.cols; k2++) this._hit(k2, j, set, queue);
          for (k2 = 0; k2 < this.rows; k2++) this._hit(i, k2, set, queue);
        }
      }
    } else if (hi === SP_ORB && lo === SP_BOMB) {
      var col2 = this.commonColor();
      for (j = 0; j < this.rows; j++) for (i = 0; i < this.cols; i++) {
        var t2 = this.at(i, j);
        if (t2 && t2.k === 'b' && t2.c === col2) {
          for (var di = -1; di <= 1; di++) for (var dj = -1; dj <= 1; dj++) this._hit(i + di, j + dj, set, queue);
        }
      }
    }
    // chain any specials swept up
    var guard = 0;
    while (queue.length && guard++ < 200) {
      var e = queue.shift();
      if (set[e[2].id]) continue;
      set[e[2].id] = e;
      this.events.push({ t: e[2].sp === SP_ORB ? 'orb' : (e[2].sp === SP_BOMB ? 'bomb' : 'rocket'), x: e[0], y: e[1], rot: e[2].rot || 0 });
      this.blastOf(e[0], e[1], e[2], set, queue);
    }
    var coords = [], k;
    for (k in set) coords.push([set[k][0], set[k][1]]);
    this._splash(coords, set);
    return set;
  };

  /* ---------- player action ---------- */
  // returns null (illegal) or {cleared:[cells], made:cellOrNull}
  Board.prototype.tap = function (x, y) {
    if (this.over) return null;
    var c = this.at(x, y);
    if (!c) return null;
    this.events.length = 0;

    var set = null, made = null, n = 0;

    if (c.k === 'b' && c.sp !== SP_NONE) {
      // adjacent special => combo
      var d = [[1, 0], [-1, 0], [0, 1], [0, -1]], partner = null;
      for (var i = 0; i < 4; i++) {
        var q = this.at(x + d[i][0], y + d[i][1]);
        if (q && q.k === 'b' && q.sp !== SP_NONE) { partner = [x + d[i][0], y + d[i][1], q]; break; }
      }
      if (c.sp === SP_ORB && !partner) c.orbColor = this.bestNeighborColor(x, y);
      set = partner ? this.combo([x, y, c], partner) : this.fireSpecials([[x, y, c]]);
    } else {
      var grp = this.groupAt(x, y);
      if (grp.length < 2) return null;
      n = grp.length;
      set = {};
      var sp = n >= 9 ? SP_ORB : (n >= 7 ? SP_BOMB : (n >= 5 ? SP_ROCKET : SP_NONE));
      for (var k = 0; k < grp.length; k++) {
        var gx = grp[k][0], gy = grp[k][1];
        if (sp && gx === x && gy === y) continue;   // seed cell survives as the special
        var cc = this.at(gx, gy);
        set[cc.id] = [gx, gy, cc];
      }
      this._splash(grp, set);
      if (sp) {
        made = this.at(x, y);
        made.sp = sp;
        made.rot = (x + y) % 2;
        if (sp === SP_ORB) made.orbColor = made.c;
        made.flash = 1;
        this.events.push({ t: 'make', x: x, y: y, sp: sp });
      }
      this.events.push({ t: 'pop', x: x, y: y, n: n });
    }

    var cleared = this.applyClear(set);
    if (!cleared.length && !made) return null;

    var base = Math.max(cleared.length, n);
    this.score += base * base * 6 + cleared.length * 12;
    this.movesLeft--; this.movesUsed++;

    this.settle();
    this.endOfMove();
    return { cleared: cleared, made: made, n: cleared.length };
  };

  Board.prototype.bestNeighborColor = function (x, y) {
    var d = [[1, 0], [-1, 0], [0, 1], [0, -1]], best = -1, bn = 0;
    for (var i = 0; i < 4; i++) {
      var q = this.at(x + d[i][0], y + d[i][1]);
      if (q && q.k === 'b' && q.sp === SP_NONE) {
        var n = this.groupAt(x + d[i][0], y + d[i][1]).length;
        if (n > bn) { bn = n; best = q.c; }
      }
    }
    return best < 0 ? this.commonColor() : best;
  };

  // Remove all cells in set, tally goals. Returns list of [x,y,cell]
  Board.prototype.applyClear = function (set) {
    var out = [], k;
    for (k in set) {
      var e = set[k], x = e[0], y = e[1], c = e[2];
      if (this.at(x, y) !== c) continue;
      if (c.k === 'crate') this.prog.crate++;
      else if (c.k === 'balloon') this.prog.balloon++;
      else if (c.k === 'gear') {
        // plain collapses never touch a gear (see _splash); only a blast knocks it loose
        this.prog.gear++;
        this.events.push({ t: 'gear', x: x, y: y });
      }
      else if (c.k === 'b' && c.c === this.def.popColor) this.prog.pop++;
      this.set(x, y, null);
      out.push(e);
    }
    return out;
  };

  /* ---------- gravity + refill ---------- */
  Board.prototype.settle = function () {
    var x, y, CELL = 1;
    for (x = 0; x < this.cols; x++) {
      var write = this.rows - 1;
      for (y = this.rows - 1; y >= 0; y--) {
        var c = this.cells[y * this.cols + x];
        if (!c) continue;
        if (write !== y) {
          this.cells[write * this.cols + x] = c;
          this.cells[y * this.cols + x] = null;
          c.oy = (y - write) * CELL;   // rows above (negative), scaled by renderer
          c.vy = 0;
        }
        write--;
      }
      for (y = write; y >= 0; y--) {
        var q = this.queue[x];
        while (q.length < 4) q.push(this.rc());
        if (q.length > 8) q.length = 8;
        var nb = mkBlock(q.shift());
        q.push(this.rc());
        nb.oy = -(write - y + 1);
        nb.vy = 0;
        this.cells[y * this.cols + x] = nb;
      }
    }
  };

  /* ---------- end of move ---------- */
  Board.prototype.endOfMove = function () {
    var x, y, c;
    // gears are heavy: each move they sink one row through a plain block
    for (y = this.rows - 2; y >= 0; y--) for (x = 0; x < this.cols; x++) {
      c = this.at(x, y);
      if (c && c.k === 'gear') {
        var dn = this.at(x, y + 1);
        if (dn && dn.k === 'b' && dn.sp === SP_NONE) {
          this.set(x, y + 1, c); this.set(x, y, dn);
          c.oy = -1; dn.oy = 1;
        }
      }
    }
    // gears reaching the floor are collected
    for (x = 0; x < this.cols; x++) {
      c = this.at(x, this.rows - 1);
      if (c && c.k === 'gear') {
        this.prog.gear++;
        this.events.push({ t: 'gear', x: x, y: this.rows - 1 });
        this.set(x, this.rows - 1, null);
      }
    }
    // balloons rise one cell (swap with a plain block above)
    var risers = [];
    for (y = 1; y < this.rows; y++) for (x = 0; x < this.cols; x++) {
      c = this.at(x, y);
      if (c && c.k === 'balloon' && !c._rose) {
        var up = this.at(x, y - 1);
        if (up && up.k === 'b') {
          this.set(x, y - 1, c); this.set(x, y, up);
          c.oy = 1; up.oy = -1; c._rose = 1; risers.push(c);
        }
      }
    }
    for (x = 0; x < risers.length; x++) risers[x]._rose = 0;
    this.settle();

    // goal / fail evaluation
    var gl = this.def.goals, done =
      this.prog.crate >= gl.crate && this.prog.balloon >= gl.balloon &&
      this.prog.gear >= gl.gear && this.prog.pop >= gl.pop;
    if (done) {
      this.over = 1;
      var ratio = this.movesLeft / Math.max(1, this.def.moves);
      this.stars = ratio >= 0.38 ? 3 : (ratio >= 0.15 ? 2 : 1);
      this.score += this.movesLeft * 120;
    } else if (this.movesLeft <= 0) {
      this.over = -1;
    } else {
      var guard = 0;
      while (!this.hasMove() && guard++ < 30) this.shuffleColors();
      if (!this.hasMove()) this.rebuildPlayable();
    }
    if (this.score > 99999999) this.score = 99999999;
  };

  Board.prototype.goalsLeft = function () {
    var gl = this.def.goals, out = [];
    if (gl.crate) out.push({ k: 'crate', need: gl.crate, have: Math.min(gl.crate, this.prog.crate) });
    if (gl.balloon) out.push({ k: 'balloon', need: gl.balloon, have: Math.min(gl.balloon, this.prog.balloon) });
    if (gl.gear) out.push({ k: 'gear', need: gl.gear, have: Math.min(gl.gear, this.prog.gear) });
    if (gl.pop) out.push({ k: 'pop', need: gl.pop, have: Math.min(gl.pop, this.prog.pop), c: this.def.popColor });
    return out;
  };

  // Best available group, for the hint button
  Board.prototype.hint = function () {
    var best = null, bn = 1, seen = {};
    for (var y = 0; y < this.rows; y++) for (var x = 0; x < this.cols; x++) {
      var c = this.at(x, y);
      if (!c || c.k !== 'b') continue;
      if (c.sp !== SP_NONE) return [[x, y]];
      if (seen[c.id]) continue;
      var grp = this.groupAt(x, y);
      for (var i = 0; i < grp.length; i++) { var q = this.at(grp[i][0], grp[i][1]); if (q) seen[q.id] = 1; }
      if (grp.length > bn) { bn = grp.length; best = grp; }
    }
    return best;
  };

  g.CTGame = {
    COLS: COLS, ROWS: ROWS, MAXLV: MAXLV,
    SP_NONE: SP_NONE, SP_ROCKET: SP_ROCKET, SP_BOMB: SP_BOMB, SP_ORB: SP_ORB,
    levelDef: levelDef, Board: Board
  };
})(window);
