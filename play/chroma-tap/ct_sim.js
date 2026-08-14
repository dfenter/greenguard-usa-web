/* Chroma Tap - simulation. Pure model: no engine, no DOM, no render state.
 *
 * Contract with the view (defect class: per-entity render state stored on the
 * entity passed to the renderer): cells carry ONLY simulation fields. Every
 * animation input the view needs is returned in the move report, which is a
 * diff of cell positions across each resolution phase.
 */
(function (g) {
  'use strict';

  var D = g.CTData;
  var COLS = D.COLS, ROWS = D.ROWS;
  var SP_NONE = 0, SP_ROCKET = 1, SP_BOMB = 2, SP_ORB = 3;

  /* ------------------------------------------------------------------ rng */
  function rng(seed) {
    var a = (seed | 0) || 1;
    var f = function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.int = function (n) { return n > 0 ? Math.floor(f() * n) % n : 0; };
    f.getState = function () { return a | 0; };
    f.setState = function (state) { a = (state | 0) || 1; };
    return f;
  }

  var uid = 1;
  function mkTile(c) { return { id: uid++, k: 'tile', c: c, sp: SP_NONE, hp: 1, rot: 0, orbColor: -1 }; }
  function mkObj(kind, hp) { return { id: uid++, k: kind, c: -1, sp: SP_NONE, hp: hp || 1, rot: 0, orbColor: -1 }; }

  /* ------------------------------------------------------------------ board */
  function Board(def) {
    this.def = def || D.level(1);
    this.pack = D.pack(this.def.pack);
    this.cols = COLS; this.rows = ROWS;
    this.colTop = (this.pack.colTop && this.pack.colTop.length === COLS)
      ? this.pack.colTop.slice() : [0, 0, 0, 0, 0, 0, 0];
    this.rng = rng(this.def.seed);
    this.cells = new Array(COLS * ROWS);
    this.queue = [];
    this.movesLeft = this.def.moves;
    this.movesUsed = 0;
    this.score = 0;
    this.combos = 0;
    this.chains = 0;
    this.chainMax = 0;
    this.hintUsed = 0;
    this.rescuesLeft = this.def.rescue || 0;
    this.rescuesUsed = 0;
    this.giftsGiven = 0;
    this.prog = { crate: 0, balloon: 0, gear: 0, pop: 0 };
    this.over = 0;          // 0 running, 1 win, -1 lose
    this.medal = 'none';
    this.shuffles = 0;
    this.build();
  }

  Board.prototype.hole = function (x, y) {
    if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) return true;
    return y < this.colTop[x];
  };
  Board.prototype.at = function (x, y) {
    if (this.hole(x, y)) return null;
    return this.cells[y * this.cols + x] || null;
  };
  Board.prototype.set = function (x, y, v) {
    if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) return;
    this.cells[y * this.cols + x] = v;
  };
  Board.prototype.rc = function () { return this.rng.int(this.def.colors || 5); };

  /* Next-spawn preview: two upcoming colours per column. */
  Board.prototype.nextSpawns = function () {
    var out = [], x, i;
    for (x = 0; x < this.cols; x++) {
      var q = this.queue[x] || [];
      var pair = [];
      for (i = 0; i < 2; i++) pair.push(typeof q[i] === 'number' ? q[i] : 0);
      out.push(pair);
    }
    return out;
  };

  Board.prototype.build = function () {
    var x, y, i, k, tries;
    for (i = 0; i < COLS * ROWS; i++) this.cells[i] = null;
    for (x = 0; x < COLS; x++) {
      for (y = this.colTop[x]; y < ROWS; y++) this.set(x, y, mkTile(this.rc()));
      var q = [];
      for (i = 0; i < 4; i++) q.push(this.rc());
      this.queue.push(q);
    }

    var gl = this.def.goals, blocked = {}, usedCol = {};
    /* Gears go in first and keep a clean chute of plain tiles beneath them, so
     * digging one out is always a solvable line of play. */
    for (k = 0; k < gl.gear; k++) {
      for (tries = 0; tries < 90; tries++) {
        x = this.rng.int(COLS);
        y = this.colTop[x] + 1 + this.rng.int(3);
        if (usedCol[x] || y >= ROWS - 2) continue;
        var gc = this.at(x, y);
        if (!gc || gc.k !== 'tile') continue;
        usedCol[x] = 1;
        this.set(x, y, mkObj('gear', 1));
        for (var yy = y + 1; yy < ROWS; yy++) blocked[x + ',' + yy] = 1;
        break;
      }
    }
    /* Crates sit low, balloons start near the floor so they have room to rise.
     * Only a fraction of the crate goal is physically placed: crates keep
     * arriving as the board refills (placeMore below). */
    var startCrates = Math.min(gl.crate, 6 + this.rng.int(3));
    var spots = [], placed = { crate: 0, balloon: 0 };
    for (k = 0; k < startCrates; k++) spots.push(['crate', 2, ROWS - 2]);
    for (k = 0; k < gl.balloon; k++) spots.push(['balloon', ROWS - 3, ROWS - 1]);
    for (k = 0; k < spots.length; k++) {
      for (tries = 0; tries < 100; tries++) {
        x = this.rng.int(COLS);
        var lo = Math.max(this.colTop[x], spots[k][1]);
        var hi = spots[k][2];
        if (hi < lo) continue;
        y = lo + this.rng.int(hi - lo + 1);
        if (blocked[x + ',' + y]) continue;
        var c = this.at(x, y);
        if (!c || c.k !== 'tile') continue;
        if (tries < 80 && this.neighborObstacles(x, y) > 0) continue;
        this.set(x, y, mkObj(spots[k][0], spots[k][0] === 'crate' ? (this.def.crateHp || 1) : 1));
        placed[spots[k][0]]++;
        break;
      }
    }
    /* Guarantee the goal is physically reachable: a shaped board plus a dense
     * hazard mix can starve the random placement above, and a level whose
     * balloons were never placed can never be cleared. */
    while (placed.balloon < gl.balloon) {
      var spot = this.firstPlainCell(true);
      if (!spot) break;
      this.set(spot[0], spot[1], mkObj('balloon', 1));
      placed.balloon++;
    }
    while (placed.crate < startCrates) {
      var spot2 = this.firstPlainCell(false);
      if (!spot2) break;
      this.set(spot2[0], spot2[1], mkObj('crate', this.def.crateHp || 1));
      placed.crate++;
    }
    this.cratesPlaced = placed.crate;
    if (!this.hasMove()) this.rebuildPlayable();
  };

  /* First plain tile cell, scanning from the floor up (balloons) or from the
   * middle down (crates). Used only by the placement guarantee above. */
  Board.prototype.firstPlainCell = function (fromBottom) {
    var x, y, c;
    if (fromBottom) {
      for (y = this.rows - 1; y >= 0; y--) for (x = 0; x < this.cols; x++) {
        c = this.at(x, y);
        if (c && c.k === 'tile' && this.neighborObstacles(x, y) === 0) return [x, y];
      }
    } else {
      for (y = 2; y < this.rows - 1; y++) for (x = 0; x < this.cols; x++) {
        c = this.at(x, y);
        if (c && c.k === 'tile' && this.neighborObstacles(x, y) === 0) return [x, y];
      }
    }
    for (y = this.rows - 1; y >= 0; y--) for (x = 0; x < this.cols; x++) {
      c = this.at(x, y);
      if (c && c.k === 'tile') return [x, y];
    }
    return null;
  };

  Board.prototype.neighborObstacles = function (x, y) {
    var d = [[1, 0], [-1, 0], [0, 1], [0, -1]], n = 0;
    for (var i = 0; i < 4; i++) {
      var c = this.at(x + d[i][0], y + d[i][1]);
      if (c && c.k !== 'tile') n++;
    }
    return n;
  };

  /* ------------------------------------------------------------------ groups */
  Board.prototype.groupAt = function (x, y) {
    var c = this.at(x, y);
    if (!c || c.k !== 'tile' || c.sp !== SP_NONE) return [];
    var seen = {}, out = [], st = [[x, y]];
    seen[x + ',' + y] = 1;
    var d = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (st.length) {
      var p = st.pop(), px = p[0], py = p[1];
      out.push(p);
      for (var i = 0; i < 4; i++) {
        var nx = px + d[i][0], ny = py + d[i][1], key = nx + ',' + ny;
        if (seen[key]) continue;
        var q = this.at(nx, ny);
        if (q && q.k === 'tile' && q.sp === SP_NONE && q.c === c.c) { seen[key] = 1; st.push([nx, ny]); }
      }
    }
    return out;
  };

  Board.prototype.hasMove = function () {
    for (var y = 0; y < this.rows; y++) for (var x = 0; x < this.cols; x++) {
      var c = this.at(x, y);
      if (!c || c.k !== 'tile') continue;
      if (c.sp !== SP_NONE) return true;
      var r = this.at(x + 1, y), dn = this.at(x, y + 1);
      if (r && r.k === 'tile' && r.sp === SP_NONE && r.c === c.c) return true;
      if (dn && dn.k === 'tile' && dn.sp === SP_NONE && dn.c === c.c) return true;
    }
    return false;
  };

  Board.prototype.shuffleColors = function () {
    var list = [], i, x, y;
    for (y = 0; y < this.rows; y++) for (x = 0; x < this.cols; x++) {
      var c = this.at(x, y);
      if (c && c.k === 'tile' && c.sp === SP_NONE) list.push(c);
    }
    for (i = list.length - 1; i > 0; i--) {
      var j = this.rng.int(i + 1), t = list[i].c; list[i].c = list[j].c; list[j].c = t;
    }
    this.shuffles++;
  };

  Board.prototype.rebuildPlayable = function () {
    var plain = [], x, y;
    for (y = 0; y < this.rows; y++) for (x = 0; x < this.cols; x++) {
      var c = this.at(x, y);
      if (c && c.k === 'tile') { c.c = (x + y * 2) % (this.def.colors || 5); c.sp = SP_NONE; plain.push([x, y]); }
    }
    for (var i = 0; i < plain.length; i++) {
      var a = plain[i], right = this.at(a[0] + 1, a[1]), down = this.at(a[0], a[1] + 1);
      var me = this.at(a[0], a[1]);
      if (right && right.k === 'tile') { me.c = right.c = 0; if (this.hasMove()) return true; }
      if (down && down.k === 'tile') { me.c = down.c = 0; if (this.hasMove()) return true; }
    }
    if (plain.length) { var f = this.at(plain[0][0], plain[0][1]); if (f) f.sp = SP_ROCKET; }
    return this.hasMove();
  };

  /* ------------------------------------------------------------------ blast geometry
   * Shared by the live resolution and by previewBlast(), so the telegraph the
   * player sees is exactly the set of cells that will be hit.
   */
  Board.prototype.rocketCells = function (x, y, rot) {
    var out = [], i;
    if (rot) { for (i = 0; i < this.rows; i++) if (!this.hole(x, i)) out.push([x, i]); }
    else { for (i = 0; i < this.cols; i++) if (!this.hole(i, y)) out.push([i, y]); }
    return out;
  };
  Board.prototype.bombCells = function (x, y) {
    var out = [], i, j;
    for (i = -2; i <= 2; i++) for (j = -2; j <= 2; j++) {
      if (Math.abs(i) + Math.abs(j) > 3) continue;
      if (!this.hole(x + i, y + j)) out.push([x + i, y + j]);
    }
    return out;
  };
  Board.prototype.orbCells = function (color) {
    var out = [], i, j;
    for (j = 0; j < this.rows; j++) for (i = 0; i < this.cols; i++) {
      var t = this.at(i, j);
      if (t && t.k === 'tile' && (t.c === color || t.sp !== SP_NONE)) out.push([i, j]);
    }
    return out;
  };
  Board.prototype.commonColor = function () {
    var cnt = [0, 0, 0, 0, 0, 0], x, y, best = 0;
    for (y = 0; y < this.rows; y++) for (x = 0; x < this.cols; x++) {
      var c = this.at(x, y);
      if (c && c.k === 'tile' && c.sp === SP_NONE) cnt[c.c]++;
    }
    for (x = 1; x < 6; x++) if (cnt[x] > cnt[best]) best = x;
    return best;
  };
  Board.prototype.bestNeighborColor = function (x, y) {
    var d = [[1, 0], [-1, 0], [0, 1], [0, -1]], best = -1, bn = 0;
    for (var i = 0; i < 4; i++) {
      var q = this.at(x + d[i][0], y + d[i][1]);
      if (q && q.k === 'tile' && q.sp === SP_NONE) {
        var n = this.groupAt(x + d[i][0], y + d[i][1]).length;
        if (n > bn) { bn = n; best = q.c; }
      }
    }
    return best < 0 ? this.commonColor() : best;
  };
  Board.prototype.adjacentSpecial = function (x, y) {
    var d = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (var i = 0; i < 4; i++) {
      var q = this.at(x + d[i][0], y + d[i][1]);
      if (q && q.k === 'tile' && q.sp !== SP_NONE) return [x + d[i][0], y + d[i][1], q];
    }
    return null;
  };
  Board.prototype.comboCells = function (a, b) {
    var out = [], seen = {}, i, j, k;
    var ax = a[0], ay = a[1], bx = b[0], by = b[1];
    var lo = Math.min(a[2].sp, b[2].sp), hi = Math.max(a[2].sp, b[2].sp);
    var self = this;
    function push(x, y) {
      if (self.hole(x, y)) return;
      var key = x + ',' + y;
      if (seen[key]) return;
      seen[key] = 1; out.push([x, y]);
    }
    if (lo === SP_ROCKET && hi === SP_ROCKET) {
      for (i = 0; i < this.cols; i++) { push(i, ay); push(i, by); }
      for (j = 0; j < this.rows; j++) { push(ax, j); push(bx, j); }
    } else if (lo === SP_ROCKET && hi === SP_BOMB) {
      for (i = 0; i < this.cols; i++) for (j = -1; j <= 1; j++) push(i, ay + j);
      for (j = 0; j < this.rows; j++) for (i = -1; i <= 1; i++) push(ax + i, j);
    } else if (lo === SP_BOMB && hi === SP_BOMB) {
      for (i = -3; i <= 3; i++) for (j = -3; j <= 3; j++) if (Math.abs(i) + Math.abs(j) <= 4) push(ax + i, ay + j);
    } else if (lo === SP_ORB && hi === SP_ORB) {
      for (j = 0; j < this.rows; j++) for (i = 0; i < this.cols; i++) push(i, j);
    } else if (hi === SP_ORB && lo === SP_ROCKET) {
      var col = this.comboOrbColor(a, b);
      for (j = 0; j < this.rows; j++) for (i = 0; i < this.cols; i++) {
        var t = this.at(i, j);
        if (t && t.k === 'tile' && t.c === col) {
          for (k = 0; k < this.cols; k++) push(k, j);
          for (k = 0; k < this.rows; k++) push(i, k);
        }
      }
    } else if (hi === SP_ORB && lo === SP_BOMB) {
      var col2 = this.comboOrbColor(a, b);
      for (j = 0; j < this.rows; j++) for (i = 0; i < this.cols; i++) {
        var t2 = this.at(i, j);
        if (t2 && t2.k === 'tile' && t2.c === col2) {
          for (var di = -1; di <= 1; di++) for (var dj = -1; dj <= 1; dj++) push(i + di, j + dj);
        }
      }
    }
    return out;
  };

  Board.prototype.comboOrbColor = function (a, b) {
    var p = a[2].sp === SP_ORB ? a : b;
    return p[2].orbColor >= 0 ? p[2].orbColor : this.bestNeighborColor(p[0], p[1]);
  };

  /* Preview the same recursive special queue used by _fireChain. This keeps
   * the telegraph honest when a blast sweeps up another special. */
  Board.prototype.previewSpecialCells = function (starts) {
    var out = [], seen = {}, queued = {}, queue = [], self = this;
    function add(x, y) {
      if (self.hole(x, y)) return;
      var key = x + ',' + y;
      if (seen[key]) return;
      seen[key] = 1; out.push([x, y]);
    }
    function queueSpecial(x, y) {
      var c = self.at(x, y);
      if (!c || c.k !== 'tile' || c.sp === SP_NONE || queued[c.id]) return;
      queued[c.id] = 1; queue.push([x, y, c]);
    }
    for (var i = 0; i < starts.length; i++) {
      add(starts[i][0], starts[i][1]);
      queueSpecial(starts[i][0], starts[i][1]);
    }
    var guard = 0;
    while (queue.length && guard++ < 200) {
      var e = queue.shift(), cells = self.cellsOf(e[0], e[1], e[2]);
      for (var j = 0; j < cells.length; j++) {
        add(cells[j][0], cells[j][1]);
        queueSpecial(cells[j][0], cells[j][1]);
      }
    }
    return out;
  };

  /* Pure: what would tapping (x,y) hit right now? Used for the telegraph and
   * for the group highlight. Never mutates. */
  Board.prototype.previewBlast = function (x, y) {
    var c = this.at(x, y);
    if (!c || this.over) return null;
    if (c.k === 'tile' && c.sp !== SP_NONE) {
      var partner = this.adjacentSpecial(x, y);
      if (partner) return { kind: 'combo', cells: this.previewSpecialCells(this.comboCells([x, y, c], partner)), a: [x, y], b: [partner[0], partner[1]] };
      return {
        kind: c.sp === SP_ROCKET ? 'rocket' : (c.sp === SP_BOMB ? 'bomb' : 'orb'),
        cells: this.previewSpecialCells([[x, y]]), a: [x, y]
      };
    }
    var grp = this.groupAt(x, y);
    if (grp.length < 2) return null;
    return { kind: 'group', cells: grp, a: [x, y], size: grp.length };
  };

  /* ------------------------------------------------------------------ resolution */
  function Marks() { this.kill = {}; this.dmg = {}; this.killList = []; this.dmgList = []; }

  Board.prototype._markKill = function (x, y, m) {
    var c = this.at(x, y);
    if (!c || m.kill[c.id]) return null;
    m.kill[c.id] = 1;
    m.killList.push([x, y, c]);
    return c;
  };
  Board.prototype._markDmg = function (x, y, m) {
    var c = this.at(x, y);
    if (!c || m.kill[c.id] || m.dmg[c.id]) return;
    m.dmg[c.id] = 1;
    m.dmgList.push([x, y, c]);
  };

  /* A blast hit: tiles die, crates/balloons take damage, and any special
   * swept up is queued so it fires in turn. Gears are banked only by the
   * hazard step, so a blast cannot bypass their floor rule. */
  Board.prototype._hit = function (x, y, m, queue) {
    var c = this.at(x, y);
    if (!c || m.kill[c.id]) return;
    if (c.k === 'tile' && c.sp !== SP_NONE) {
      if (!m.queued) m.queued = {};
      if (!m.queued[c.id] && queue.length < 128) { m.queued[c.id] = 1; queue.push([x, y, c]); }
      return;
    }
    if (c.k === 'crate' || c.k === 'balloon') { this._markDmg(x, y, m); return; }
    if (c.k === 'gear') return;
    this._markKill(x, y, m);
  };

  /* Adjacent-collapse splash: only crates and balloons feel it. Gears are
   * heavy and need a direct blast. */
  Board.prototype._splash = function (coords, m) {
    var d = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (var i = 0; i < coords.length; i++) {
      for (var j = 0; j < 4; j++) {
        var nx = coords[i][0] + d[j][0], ny = coords[i][1] + d[j][1];
        var c = this.at(nx, ny);
        if (c && (c.k === 'crate' || c.k === 'balloon')) this._markDmg(nx, ny, m);
      }
    }
  };

  Board.prototype.cellsOf = function (x, y, c) {
    if (c.sp === SP_ROCKET) return this.rocketCells(x, y, c.rot);
    if (c.sp === SP_BOMB) return this.bombCells(x, y);
    return this.orbCells(c.orbColor >= 0 ? c.orbColor : this.bestNeighborColor(x, y));
  };

  Board.prototype._fireChain = function (starts, m, fired) {
    var queue = starts.slice(), guard = 0;
    m.queued = m.queued || {};
    while (queue.length && guard++ < 200) {
      var e = queue.shift(), x = e[0], y = e[1], c = e[2];
      if (m.kill[c.id]) continue;
      m.kill[c.id] = 1; m.killList.push([x, y, c]);
      var cells = this.cellsOf(x, y, c);
      fired.push({
        kind: c.sp === SP_ORB ? 'orb' : (c.sp === SP_BOMB ? 'bomb' : 'rocket'),
        x: x, y: y, rot: c.rot || 0, cells: cells
      });
      for (var i = 0; i < cells.length; i++) this._hit(cells[i][0], cells[i][1], m, queue);
    }
  };

  /* ------------------------------------------------------------------ snapshots */
  Board.prototype._snap = function () {
    var map = {}, x, y;
    for (y = 0; y < this.rows; y++) for (x = 0; x < this.cols; x++) {
      var c = this.at(x, y);
      if (c) map[c.id] = [x, y];
    }
    return map;
  };
  Board.prototype._diff = function (before) {
    var moves = [], spawns = [], x, y;
    for (y = 0; y < this.rows; y++) for (x = 0; x < this.cols; x++) {
      var c = this.at(x, y);
      if (!c) continue;
      var b = before[c.id];
      if (!b) { spawns.push({ cell: c, x: x, y: y }); continue; }
      if (b[0] !== x || b[1] !== y) moves.push({ cell: c, fx: b[0], fy: b[1], x: x, y: y });
    }
    return { moves: moves, spawns: spawns };
  };

  /* ------------------------------------------------------------------ gravity */
  Board.prototype.countKind = function (kind) {
    var n = 0, x, y;
    for (y = 0; y < this.rows; y++) for (x = 0; x < this.cols; x++) {
      var c = this.at(x, y);
      if (c && c.k === kind) n++;
    }
    return n;
  };

  Board.prototype.settle = function () {
    var x, y;
    /* Crate delivery rate is adaptive: if the board is running dry of crates
     * while the quota is unmet, the yard sends more down. Counted once per
     * settle, never per refilled cell. */
    var crateNeed = this.def.goals.crate - this.cratesPlaced;
    var crateChance = 0;
    if (crateNeed > 0) crateChance = this.countKind('crate') < 4 ? 58 : 26;
    for (x = 0; x < this.cols; x++) {
      var top = this.colTop[x];
      var write = this.rows - 1;
      for (y = this.rows - 1; y >= top; y--) {
        var c = this.cells[y * this.cols + x];
        if (!c) continue;
        if (write !== y) {
          this.cells[write * this.cols + x] = c;
          this.cells[y * this.cols + x] = null;
        }
        write--;
      }
      var q = this.queue[x] || (this.queue[x] = []);
      for (y = write; y >= top; y--) {
        while (q.length < 4) q.push(this.rc());
        var nb = mkTile(q.shift());
        q.push(this.rc());
        /* Crates keep arriving from the top until the level's crate quota has
         * been physically placed, so a long level never runs out of goal. */
        if (crateChance > 0 && this.cratesPlaced < this.def.goals.crate && this.rng.int(100) < crateChance) {
          nb = mkObj('crate', this.def.crateHp || 1);
          this.cratesPlaced++;
        }
        this.cells[y * this.cols + x] = nb;
      }
    }
  };

  Board.prototype.findCascadeGroup = function () {
    var best = null, bestSize = 1;
    for (var y = 0; y < this.rows; y++) for (var x = 0; x < this.cols; x++) {
      var c = this.at(x, y);
      if (!c || c.k !== 'tile' || c.sp !== SP_NONE) continue;
      var grp = this.groupAt(x, y);
      if (grp.length > bestSize) { bestSize = grp.length; best = { x: x, y: y, cells: grp }; }
    }
    return best;
  };

  Board.prototype.resolveCascadeGroup = function (pick, chain) {
    var x = pick.x, y = pick.y, grp = pick.cells, m = new Marks(), made = null;
    var sp = grp.length >= 9 ? SP_ORB : (grp.length >= 7 ? SP_BOMB : (grp.length >= 5 ? SP_ROCKET : SP_NONE));
    for (var k = 0; k < grp.length; k++) {
      var gx = grp[k][0], gy = grp[k][1];
      if (sp && gx === x && gy === y) continue;
      this._markKill(gx, gy, m);
    }
    this._splash(grp, m);
    if (sp) {
      made = this.at(x, y);
      if (made) {
        made.sp = sp;
        made.rot = (x + y) % 2;
        if (sp === SP_ORB) made.orbColor = made.c;
      }
    }
    var cracked = [], cleared = [], i;
    for (i = 0; i < m.dmgList.length; i++) {
      var de = m.dmgList[i], dc = de[2];
      if (this.at(de[0], de[1]) !== dc) continue;
      dc.hp--;
      if (dc.hp > 0) cracked.push({ x: de[0], y: de[1], kind: dc.k, hp: dc.hp, id: dc.id });
      else { m.kill[dc.id] = 1; m.killList.push([de[0], de[1], dc]); }
    }
    for (i = 0; i < m.killList.length; i++) {
      var ke = m.killList[i], kc = ke[2];
      if (this.at(ke[0], ke[1]) !== kc) continue;
      if (kc.k === 'crate') this.prog.crate++;
      else if (kc.k === 'balloon') this.prog.balloon++;
      else if (kc.k === 'gear') this.prog.gear++;
      else if (kc.k === 'tile' && kc.c === this.def.popColor && this.def.goals.pop) this.prog.pop++;
      this.set(ke[0], ke[1], null);
      cleared.push({ x: ke[0], y: ke[1], kind: kc.k, c: kc.c, sp: kc.sp, id: kc.id });
    }
    var base = Math.max(cleared.length, grp.length);
    var scoreDelta = (base * base * 6 + cleared.length * 12) * (chain + 1);
    this.score += scoreDelta;
    this.chains++;
    this.chainMax = Math.max(this.chainMax, chain + 1);
    return {
      chain: chain + 1, groupSize: grp.length, made: made ? { x: x, y: y, sp: made.sp, c: made.c, id: made.id } : null,
      fired: [], cleared: cleared, cracked: cracked, scoreDelta: scoreDelta
    };
  };

  /* ------------------------------------------------------------------ tap */
  Board.prototype.tap = function (x, y) {
    if (this.over) return null;
    var c = this.at(x, y);
    if (!c) return null;

    var m = new Marks(), fired = [], made = null, groupSize = 0, comboPair = null;

    if (c.k === 'tile' && c.sp !== SP_NONE) {
      var partner = this.adjacentSpecial(x, y);
      if (partner) {
        comboPair = { a: [x, y], b: [partner[0], partner[1]] };
        m.kill[c.id] = 1; m.killList.push([x, y, c]);
        m.kill[partner[2].id] = 1; m.killList.push([partner[0], partner[1], partner[2]]);
        if (c.sp === SP_ORB && c.orbColor < 0) c.orbColor = this.comboOrbColor([x, y, c], partner);
        if (partner[2].sp === SP_ORB && partner[2].orbColor < 0) partner[2].orbColor = this.comboOrbColor([x, y, c], partner);
        var cc = this.comboCells([x, y, c], partner), q2 = [];
        fired.push({ kind: 'combo', x: x, y: y, cells: cc });
        for (var i = 0; i < cc.length; i++) this._hit(cc[i][0], cc[i][1], m, q2);
        this._fireChain(q2, m, fired);
        this.combos += 2;
      } else {
        if (c.sp === SP_ORB && c.orbColor < 0) c.orbColor = this.bestNeighborColor(x, y);
        this._fireChain([[x, y, c]], m, fired);
        this.combos += 1;
      }
    } else {
      var grp = this.groupAt(x, y);
      if (grp.length < 2) return null;
      groupSize = grp.length;
      var sp = groupSize >= 9 ? SP_ORB : (groupSize >= 7 ? SP_BOMB : (groupSize >= 5 ? SP_ROCKET : SP_NONE));
      for (var k = 0; k < grp.length; k++) {
        var gx = grp[k][0], gy = grp[k][1];
        if (sp && gx === x && gy === y) continue;   // the tapped cell survives as the special
        this._markKill(gx, gy, m);
      }
      this._splash(grp, m);
      if (sp) {
        made = this.at(x, y);
        if (made) {
          made.sp = sp;
          made.rot = (x + y) % 2;
          if (sp === SP_ORB) made.orbColor = made.c;
        }
      }
    }

    /* Splash from everything the blast removed. */
    if (fired.length) {
      var coords = [], j;
      for (j = 0; j < m.killList.length; j++) coords.push([m.killList[j][0], m.killList[j][1]]);
      this._splash(coords, m);
    }

    /* Apply damage before removal so a cracked crate reports its new state. */
    var cracked = [], cleared = [];
    for (var di = 0; di < m.dmgList.length; di++) {
      var e = m.dmgList[di], dc = e[2];
      if (this.at(e[0], e[1]) !== dc) continue;
      dc.hp--;
      if (dc.hp > 0) { cracked.push({ x: e[0], y: e[1], kind: dc.k, hp: dc.hp, id: dc.id }); }
      else { m.kill[dc.id] = 1; m.killList.push([e[0], e[1], dc]); }
    }

    for (var ki = 0; ki < m.killList.length; ki++) {
      var ke = m.killList[ki], kx = ke[0], ky = ke[1], kc = ke[2];
      if (this.at(kx, ky) !== kc) continue;
      if (kc.k === 'crate') this.prog.crate++;
      else if (kc.k === 'balloon') this.prog.balloon++;
      else if (kc.k === 'gear') this.prog.gear++;
      else if (kc.k === 'tile' && kc.c === this.def.popColor && this.def.goals.pop) this.prog.pop++;
      this.set(kx, ky, null);
      cleared.push({ x: kx, y: ky, kind: kc.k, c: kc.c, sp: kc.sp, id: kc.id });
    }

    if (!cleared.length && !made && !cracked.length) return null;

    var base = Math.max(cleared.length, groupSize);
    this.score += base * base * 6 + cleared.length * 12;
    this.movesLeft--; this.movesUsed++;

    /* Phase A: collapse + refill, followed by bounded automatic cascades. */
    var snapA = this._snap();
    this.settle();
    var phaseA = this._diff(snapA);
    var phases = [{ kind: 'collapse', phase: phaseA, chain: 0 }], cascades = [];
    var allCleared = cleared.slice(), allCracked = cracked.slice(), madeList = [];
    if (made) madeList.push({ x: x, y: y, sp: made.sp, c: made.c, id: made.id });
    var cascadeGuard = 0, pick, cascade, snapC, phaseC;
    while (!this.over && cascadeGuard++ < 12) {
      pick = this.findCascadeGroup();
      if (!pick) break;
      cascade = this.resolveCascadeGroup(pick, cascadeGuard - 1);
      if (!cascade || (!cascade.cleared.length && !cascade.made)) break;
      cascades.push(cascade);
      Array.prototype.push.apply(allCleared, cascade.cleared);
      Array.prototype.push.apply(allCracked, cascade.cracked);
      if (cascade.made) madeList.push(cascade.made);
      snapC = this._snap();
      this.settle();
      phaseC = this._diff(snapC);
      phases.push({ kind: 'cascade', phase: phaseC, chain: cascade.chain });
    }

    /* Phase B: hazards move, then settle again */
    var snapB = this._snap();
    var hazard = this.stepHazards();
    this.settle();
    var phaseB = this._diff(snapB);
    phases.push({ kind: 'hazard', phase: phaseB, chain: 0 });

    var chips = this.endOfMove();

    return {
      ok: true,
      tap: { x: x, y: y },
      groupSize: groupSize,
      made: made ? { x: x, y: y, sp: made.sp, c: made.c, id: made.id } : null,
      madeList: madeList,
      fired: fired,
      combo: comboPair,
      cleared: allCleared,
      cracked: allCracked,
      cascades: cascades,
      cascadeCount: cascades.length,
      chainMax: this.chainMax,
      gearsHome: hazard.gearsHome,
      phaseA: phaseA,
      phaseB: phaseB,
      phases: phases,
      chips: chips,
      movesLeft: this.movesLeft,
      score: this.score,
      over: this.over,
      medal: this.medal
    };
  };

  /* Gears sink one row and balloons rise one row on every turn. They swap with
   * the occupant in their lane, so crates and specials cannot freeze a hazard.
   * A gear is scored only when that one-row step places it on the floor. */
  Board.prototype.stepHazards = function () {
    var x, y, c, gearsHome = [];
    for (y = this.rows - 2; y >= 0; y--) for (x = 0; x < this.cols; x++) {
      c = this.at(x, y);
      if (c && c.k === 'gear') {
        var dn = this.at(x, y + 1);
        if (dn && dn.k !== 'gear') { this.set(x, y + 1, c); this.set(x, y, dn); }
      }
    }
    for (x = 0; x < this.cols; x++) {
      c = this.at(x, this.rows - 1);
      if (c && c.k === 'gear') {
        this.prog.gear++;
        gearsHome.push({ x: x, y: this.rows - 1 });
        this.set(x, this.rows - 1, null);
      }
    }
    var risers = [];
    for (y = 1; y < this.rows; y++) for (x = 0; x < this.cols; x++) {
      c = this.at(x, y);
      if (c && c.k === 'balloon' && risers.indexOf(c) < 0) {
        var up = this.at(x, y - 1);
        if (up && up.k !== 'balloon') { this.set(x, y - 1, c); this.set(x, y, up); risers.push(c); }
      }
    }
    return { gearsHome: gearsHome };
  };

  Board.prototype.goalsDone = function () {
    var gl = this.def.goals;
    return this.prog.crate >= gl.crate && this.prog.balloon >= gl.balloon &&
      this.prog.gear >= gl.gear && this.prog.pop >= gl.pop;
  };

  /* Returns the corner chips the view should queue (one at a time, per UI_LAW). */
  Board.prototype.endOfMove = function () {
    var chips = [];
    if (this.goalsDone()) {
      this.over = 1;
      this.score += this.movesLeft * 120;
      this.medal = D.medalFor(this.def, this.movesLeft, this.combos, this.hintUsed);
    } else if (this.movesLeft <= 0) {
      if (this.rescuesLeft > 0) {
        this.rescuesLeft--; this.rescuesUsed++;
        this.movesLeft += (this.def.rescueMoves || 5);
        chips.push({ t: 'rescue', n: this.def.rescueMoves || 5 });
      } else {
        this.over = -1;
      }
    }
    if (!this.over) {
      var every = this.def.spawnEvery || 6;
      if (this.movesUsed > 0 && this.movesUsed % every === 0) {
        var gift = this.dropGift(this.def.spawnSp || 1);
        if (gift) { this.giftsGiven++; chips.push({ t: 'gift', sp: gift.sp, x: gift.x, y: gift.y }); }
      }
      var guard = 0;
      while (!this.hasMove() && guard++ < 30) this.shuffleColors();
      if (!this.hasMove()) this.rebuildPlayable();
    }
    if (this.score > 99999999) this.score = 99999999;
    return chips;
  };

  /* Free special drop. Generous by design: the owner always wants the board to
   * hand something back on a tight budget. */
  Board.prototype.dropGift = function (sp) {
    var cands = [], x, y;
    for (y = 0; y < this.rows; y++) for (x = 0; x < this.cols; x++) {
      var c = this.at(x, y);
      if (c && c.k === 'tile' && c.sp === SP_NONE) cands.push([x, y, c]);
    }
    if (!cands.length) return null;
    var pick = cands[this.rng.int(cands.length)];
    var cell = pick[2];
    cell.sp = (sp === 2 ? SP_BOMB : SP_ROCKET);
    cell.rot = (pick[0] + pick[1]) % 2;
    return { x: pick[0], y: pick[1], sp: cell.sp, id: cell.id };
  };

  Board.prototype.goalList = function () {
    var gl = this.def.goals, out = [];
    if (gl.crate) out.push({ k: 'crate', need: gl.crate, have: Math.min(gl.crate, this.prog.crate) });
    if (gl.balloon) out.push({ k: 'balloon', need: gl.balloon, have: Math.min(gl.balloon, this.prog.balloon) });
    if (gl.gear) out.push({ k: 'gear', need: gl.gear, have: Math.min(gl.gear, this.prog.gear) });
    if (gl.pop) out.push({ k: 'pop', need: gl.pop, have: Math.min(gl.pop, this.prog.pop), c: this.def.popColor });
    return out;
  };

  Board.prototype.saveState = function () {
    var grid = [], i, c;
    for (i = 0; i < this.cells.length; i++) {
      c = this.cells[i];
      grid.push(c ? {
        id: c.id, k: c.k, c: c.c, hp: c.hp, sp: c.sp, rot: c.rot, orbColor: c.orbColor
      } : null);
    }
    return {
      v: 1, grid: grid, queue: this.queue.map(function (q) { return q.slice(0, 8); }),
      rng: this.rng.getState(), cratesPlaced: this.cratesPlaced,
      movesLeft: this.movesLeft, movesUsed: this.movesUsed, score: this.score,
      combos: this.combos, chains: this.chains, chainMax: this.chainMax,
      hintUsed: this.hintUsed, rescuesLeft: this.rescuesLeft, rescuesUsed: this.rescuesUsed,
      giftsGiven: this.giftsGiven, prog: {
        crate: this.prog.crate, balloon: this.prog.balloon,
        gear: this.prog.gear, pop: this.prog.pop
      }, over: this.over, medal: this.medal, shuffles: this.shuffles
    };
  };

  Board.prototype.restoreState = function (state) {
    if (!state || state.v !== 1 || !Array.isArray(state.grid) || state.grid.length !== this.cells.length ||
      !Array.isArray(state.queue) || state.queue.length !== this.cols) return false;
    var allowed = { tile: 1, crate: 1, balloon: 1, gear: 1 }, maxId = uid, i, raw, c;
    for (i = 0; i < this.cells.length; i++) {
      raw = state.grid[i];
      if (!raw) { this.cells[i] = null; continue; }
      if (typeof raw !== 'object' || !allowed[raw.k]) return false;
      c = raw.k === 'tile' ? mkTile(0) : mkObj(raw.k, 1);
      c.id = Math.max(1, parseInt(raw.id, 10) || c.id);
      c.c = raw.k === 'tile' ? Math.max(0, Math.min(5, parseInt(raw.c, 10) || 0)) : -1;
      c.hp = raw.k === 'crate' ? Math.max(1, Math.min(3, parseInt(raw.hp, 10) || 1)) : 1;
      c.sp = raw.k === 'tile' ? Math.max(SP_NONE, Math.min(SP_ORB, parseInt(raw.sp, 10) || 0)) : SP_NONE;
      c.rot = raw.k === 'tile' ? (parseInt(raw.rot, 10) ? 1 : 0) : 0;
      var oc = parseInt(raw.orbColor, 10);
      c.orbColor = raw.k === 'tile' ? (isFinite(oc) ? Math.max(-1, Math.min(5, oc)) : -1) : -1;
      if (c.sp === SP_ORB && c.orbColor < 0) c.orbColor = c.c;
      this.cells[i] = c;
      maxId = Math.max(maxId, c.id + 1);
    }
    this.queue = [];
    for (i = 0; i < this.cols; i++) {
      var q = state.queue[i];
      if (!Array.isArray(q)) return false;
      this.queue.push(q.slice(0, 8).map(function (v) { return Math.max(0, Math.min(5, parseInt(v, 10) || 0)); }));
    }
    uid = maxId;
    this.rng.setState(state.rng);
    this.cratesPlaced = Math.max(0, Math.min(999, parseInt(state.cratesPlaced, 10) || 0));
    this.movesLeft = Math.max(0, Math.min(999, parseInt(state.movesLeft, 10) || 0));
    this.movesUsed = Math.max(0, Math.min(999, parseInt(state.movesUsed, 10) || 0));
    this.score = Math.max(0, Math.min(99999999, parseInt(state.score, 10) || 0));
    this.combos = Math.max(0, Math.min(999, parseInt(state.combos, 10) || 0));
    this.chains = Math.max(0, Math.min(999, parseInt(state.chains, 10) || 0));
    this.chainMax = Math.max(0, Math.min(99, parseInt(state.chainMax, 10) || 0));
    this.hintUsed = state.hintUsed ? 1 : 0;
    this.rescuesLeft = Math.max(0, Math.min(9, parseInt(state.rescuesLeft, 10) || 0));
    this.rescuesUsed = Math.max(0, Math.min(9, parseInt(state.rescuesUsed, 10) || 0));
    this.giftsGiven = Math.max(0, Math.min(999, parseInt(state.giftsGiven, 10) || 0));
    this.prog = {
      crate: Math.max(0, Math.min(999, parseInt(state.prog && state.prog.crate, 10) || 0)),
      balloon: Math.max(0, Math.min(999, parseInt(state.prog && state.prog.balloon, 10) || 0)),
      gear: Math.max(0, Math.min(999, parseInt(state.prog && state.prog.gear, 10) || 0)),
      pop: Math.max(0, Math.min(999, parseInt(state.prog && state.prog.pop, 10) || 0))
    };
    this.over = state.over === 1 || state.over === -1 ? state.over : 0;
    this.medal = state.medal === 'gold' || state.medal === 'silver' || state.medal === 'bronze' ? state.medal : 'none';
    this.shuffles = Math.max(0, Math.min(999, parseInt(state.shuffles, 10) || 0));
    return true;
  };

  /* Best group on the board, for the hint. Marks the level as hint-used, which
   * costs the gold medal but nothing else. */
  Board.prototype.hint = function (charge) {
    var best = null, bn = 1, seen = {}, firstSpecial = null;
    for (var y = 0; y < this.rows; y++) for (var x = 0; x < this.cols; x++) {
      var c = this.at(x, y);
      if (!c || c.k !== 'tile') continue;
      if (c.sp !== SP_NONE) { if (!firstSpecial) firstSpecial = [[x, y]]; continue; }
      if (seen[c.id]) continue;
      var grp = this.groupAt(x, y);
      for (var i = 0; i < grp.length; i++) { var q = this.at(grp[i][0], grp[i][1]); if (q) seen[q.id] = 1; }
      if (grp.length > bn) { bn = grp.length; best = grp; }
    }
    if (charge !== false) this.hintUsed = 1;
    return best || firstSpecial;
  };

  /* Compact state for the verification hook and the pause card. */
  Board.prototype.snapshot = function () {
    var rows = [], x, y;
    for (y = 0; y < this.rows; y++) {
      var line = [];
      for (x = 0; x < this.cols; x++) {
        var c = this.at(x, y);
        if (this.hole(x, y)) line.push('.');
        else if (!c) line.push('_');
        else if (c.k === 'crate') line.push('C' + c.hp);
        else if (c.k === 'balloon') line.push('B');
        else if (c.k === 'gear') line.push('G');
        else line.push(String(c.c) + (c.sp ? 'RBO'.charAt(c.sp - 1) : ''));
      }
      rows.push(line);
    }
    return {
      cols: this.cols, rows: this.rows, colTop: this.colTop.slice(),
      grid: rows, movesLeft: this.movesLeft, movesUsed: this.movesUsed,
      score: this.score, combos: this.combos, hintUsed: this.hintUsed,
      chains: this.chains, chainMax: this.chainMax,
      rescuesLeft: this.rescuesLeft, rescuesUsed: this.rescuesUsed,
      gifts: this.giftsGiven, over: this.over, medal: this.medal,
      goals: this.goalList(), prog: {
        crate: this.prog.crate, balloon: this.prog.balloon,
        gear: this.prog.gear, pop: this.prog.pop
      },
      next: this.nextSpawns()
    };
  };

  g.CTSim = {
    rng: rng, Board: Board,
    SP_NONE: SP_NONE, SP_ROCKET: SP_ROCKET, SP_BOMB: SP_BOMB, SP_ORB: SP_ORB
  };
})(typeof window !== 'undefined' ? window : globalThis);
