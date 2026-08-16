/* Hivefall - simulation. Board (match-3) plus lane battle, fully headless.
 *
 * The sim owns every gameplay value and never touches Phaser, the DOM or a
 * texture. The view drains sim.events once per frame and reads pooled slots
 * by index; no render state is ever written onto a sim entity.
 *
 * Tuned constants carried over from the prototype design document:
 *   CLEAR_TIME 0.15   SWAP_TIME 0.11   FALL_SPEED 15 cells/s
 *   shot damage 20 shell / 5 coil / 7 venom, 4-run splash, 5-run pierce
 *   cascade multiplier 1 + 0.28 * (combo - 1)   (Squad Drill raises 0.28)
 */
var HFSim = (function () {
  'use strict';

  var CLEAR_TIME = 0.15, SWAP_TIME = 0.11, FALL_SPEED = 15.0;
  var REF_TRACK = 396;          /* the prototype's lane length in px */
  var MAX_ENEMIES = 72, MAX_SHOTS = 96;
  var MAX_EVENTS = 96;

  function Sim(opts) {
    this.cols = opts.cols || 6;
    this.rows = opts.rows || 6;
    this.colors = HF.clamp(opts.colors || 5, 3, HF.SQUAD_COUNT);
    this.endless = !!opts.endless;
    this.stats = opts.stats || HF.stats({});
    this.trackLen = REF_TRACK;
    this.rand = Math.random;

    this.grid = [];
    this.enemies = [];
    this.shots = [];
    this.events = [];
    for (var i = 0; i < MAX_ENEMIES; i++) {
      this.enemies.push({
        slot: i, on: false, kind: 0, lane: 0, p: 0, hp: 0, max: 1, spd: 0, r: 10,
        slow: 0, ven: 0, venDps: 0, flash: 0, wob: 0, elite: false, boss: false,
        shield: 0, shieldCd: 0, spawnCd: 0, fire: 0, stun: 0, coin: 0, dmg: 0,
        name: '', sil: 'mite', trait: 'none', born: 0
      });
    }
    for (var j = 0; j < MAX_SHOTS; j++) {
      this.shots.push({
        slot: j, on: false, lane: 0, p: 0, spd: 0, kind: 'shell', dmg: 0,
        splash: false, pierce: false, hits: [], life: 0
      });
    }
    for (var r = 0; r < this.rows; r++) {
      var row = [];
      for (var c = 0; c < this.cols; c++) row.push({ t: 0, haz: 0, hazMax: 0, oy: 0, pop: -1, chg: false });
      this.grid.push(row);
    }
    this.reset(opts.wave || 1);
  }

  /* --------------------------------------------------------------- setup */
  Sim.prototype.setTrack = function (len) {
    this.trackLen = Math.max(80, len || REF_TRACK);
  };
  Sim.prototype.speedScale = function () { return this.trackLen / REF_TRACK; };

  Sim.prototype.emit = function (type, a, b, c, d, e) {
    if (this.events.length >= MAX_EVENTS) this.events.shift();
    this.events.push({ type: type, a: a, b: b, c: c, d: d, e: e });
  };
  Sim.prototype.drain = function (fn) {
    for (var i = 0; i < this.events.length; i++) fn(this.events[i]);
    this.events.length = 0;
  };

  Sim.prototype.reset = function (waveNum) {
    var i;
    this.wave = waveNum | 0;
    this.script = HF.genWave(this.wave, this.cols, this.endless);
    this.act = this.script.act;
    this.hazardDef = this.act.hazard;
    this.queue = this.script.list;
    this.qi = 0;
    this.time = 0;
    this.result = 0;                 /* 0 running, 1 cleared, -1 breached */
    this.hpMul = HF.hpMul(this.wave, this.endless);
    this.spdMul = HF.spdMul(this.wave, this.endless);
    this.wallMax = this.stats.wallMax;
    this.wallHp = this.wallMax;
    this.barricade = this.stats.barricade;
    this.flares = this.stats.flares;
    this.flareTimer = 0;
    this.kills = 0;
    this.coins = 0;
    this.moves = 0;
    this.dry = 0;
    this.charged = false;
    this.combo = 0;
    this.bestCombo = 0;
    this.hazardTimer = (this.hazardDef.every / this.stats.hazardMul) * 0.85;
    this.spreadTimer = this.hazardDef.spread || 0;
    this.bossRef = null;
    this.hold = false;
    for (i = 0; i < this.enemies.length; i++) this.enemies[i].on = false;
    for (i = 0; i < this.shots.length; i++) { this.shots[i].on = false; this.shots[i].hits.length = 0; }
    this.events.length = 0;
    this.resetBoard();
  };

  /* advance to the next Endless Night stage without a scene change */
  Sim.prototype.nextStage = function () {
    var keepBoard = true;
    var savedGrid = [];
    if (keepBoard) {
      for (var r = 0; r < this.rows; r++) {
        var row = [];
        for (var c = 0; c < this.cols; c++) {
          var g = this.grid[r][c];
          row.push({ t: g.t, haz: g.haz, hazMax: g.hazMax, oy: 0, pop: -1, chg: g.chg });
        }
        savedGrid.push(row);
      }
    }
    var hp = this.wallHp, kills = this.kills, coins = this.coins;
    this.reset(this.wave + 1);
    this.kills = kills;
    this.coins = coins;
    this.wallHp = HF.clamp(hp + this.wallMax * 0.18, 1, this.wallMax);
    if (keepBoard) {
      for (var r2 = 0; r2 < this.rows; r2++) {
        for (var c2 = 0; c2 < this.cols; c2++) {
          var s = savedGrid[r2][c2], t = this.grid[r2][c2];
          t.t = s.t; t.haz = s.haz; t.hazMax = s.hazMax; t.chg = s.chg;
          t.oy = 0; t.pop = -1;
        }
      }
      this.ensureMove();
    }
  };

  /* ---------------------------------------------------------- board ----- */
  Sim.prototype.resetBoard = function () {
    this.bstate = 'idle';
    this.sw = null;
    this.btimer = 0;
    this.combo = 0;
    for (var r = 0; r < this.rows; r++) {
      for (var c = 0; c < this.cols; c++) {
        var g = this.grid[r][c];
        g.t = 0; g.haz = 0; g.hazMax = 0; g.oy = 0; g.pop = -1; g.chg = false;
      }
    }
    for (var r2 = 0; r2 < this.rows; r2++)
      for (var c2 = 0; c2 < this.cols; c2++)
        this.grid[r2][c2].t = this.safeType(r2, c2);
    this.ensureMove();
  };

  Sim.prototype.irnd = function (n) { return (this.rand() * n) | 0; };

  Sim.prototype.safeType = function (r, c) {
    var tries = 0, t;
    do {
      t = this.irnd(this.colors); tries++;
      var h = (c >= 2 && this.grid[r][c - 1].t === t && this.grid[r][c - 2].t === t);
      var v = (r >= 2 && this.grid[r - 1][c].t === t && this.grid[r - 2][c].t === t);
      if (!h && !v) break;
    } while (tries < 20);
    return t;
  };

  Sim.prototype.at = function (r, c) {
    if (r < 0 || c < 0 || r >= this.rows || c >= this.cols) return null;
    return this.grid[r][c];
  };
  Sim.prototype.matchable = function (r, c) {
    var g = this.at(r, c);
    return !!g && g.haz <= 0;
  };

  /* runs of three or more, hazard-coated cells never participate */
  Sim.prototype.findRuns = function () {
    var runs = [], r, c, i;
    for (r = 0; r < this.rows; r++) {
      c = 0;
      while (c < this.cols) {
        if (!this.matchable(r, c)) { c++; continue; }
        var t = this.grid[r][c].t, n = 1;
        while (c + n < this.cols && this.matchable(r, c + n) && this.grid[r][c + n].t === t) n++;
        if (n >= 3) {
          var cells = [];
          for (i = 0; i < n; i++) cells.push({ r: r, c: c + i });
          runs.push({ t: t, cells: cells, len: n, dir: 'h' });
        }
        c += n;
      }
    }
    for (c = 0; c < this.cols; c++) {
      r = 0;
      while (r < this.rows) {
        if (!this.matchable(r, c)) { r++; continue; }
        var t2 = this.grid[r][c].t, m = 1;
        while (r + m < this.rows && this.matchable(r + m, c) && this.grid[r + m][c].t === t2) m++;
        if (m >= 3) {
          var cl = [];
          for (i = 0; i < m; i++) cl.push({ r: r + i, c: c });
          runs.push({ t: t2, cells: cl, len: m, dir: 'v' });
        }
        r += m;
      }
    }
    return runs;
  };

  Sim.prototype.hasMove = function () {
    var self = this;
    function swap(r1, c1, r2, c2) {
      var a = self.grid[r1][c1], b = self.grid[r2][c2];
      self.grid[r1][c1] = b; self.grid[r2][c2] = a;
    }
    for (var r = 0; r < this.rows; r++) {
      for (var c = 0; c < this.cols; c++) {
        if (!this.matchable(r, c)) continue;
        if (c + 1 < this.cols && this.matchable(r, c + 1)) {
          swap(r, c, r, c + 1);
          if (this.findRuns().length) { swap(r, c, r, c + 1); return true; }
          swap(r, c, r, c + 1);
        }
        if (r + 1 < this.rows && this.matchable(r + 1, c)) {
          swap(r, c, r + 1, c);
          if (this.findRuns().length) { swap(r, c, r + 1, c); return true; }
          swap(r, c, r + 1, c);
        }
      }
    }
    return false;
  };

  Sim.prototype.shuffleTypes = function () {
    for (var r = 0; r < this.rows; r++)
      for (var c = 0; c < this.cols; c++) {
        var g = this.grid[r][c];
        g.t = this.irnd(this.colors); g.oy = 0; g.pop = -1;
      }
  };

  Sim.prototype.ensureMove = function () {
    var guard = 0;
    while (guard++ < 30) {
      if (!this.findRuns().length && this.hasMove()) return true;
      this.shuffleTypes();
    }
    /* deterministic fallback: a two-colour checker has no run and always
     * leaves a legal swap in the top-left block */
    var n = Math.max(2, Math.min(2, this.colors));
    for (var r = 0; r < this.rows; r++) for (var c = 0; c < this.cols; c++) {
      var g = this.grid[r][c];
      g.t = (r + c) % n; g.oy = 0; g.pop = -1; g.haz = 0; g.hazMax = 0;
    }
    return true;
  };

  Sim.prototype.trySwap = function (r, c, r2, c2) {
    if (this.result || this.bstate !== 'idle') return false;
    if (!this.matchable(r, c) || !this.matchable(r2, c2)) {
      if (this.at(r, c) && this.at(r2, c2)) this.emit('blocked', r2, c2);
      return false;
    }
    if (Math.abs(r - r2) + Math.abs(c - c2) !== 1) return false;
    this.sw = { a: { r: r, c: c }, b: { r: r2, c: c2 }, t: 0, back: false };
    this.bstate = 'swap';
    this.combo = 0;
    this.emit('swap', r, c, r2, c2);
    return true;
  };

  Sim.prototype.doSwap = function () {
    var a = this.sw.a, b = this.sw.b;
    var t = this.grid[a.r][a.c];
    this.grid[a.r][a.c] = this.grid[b.r][b.c];
    this.grid[b.r][b.c] = t;
  };

  Sim.prototype.startClear = function (runs) {
    var i, j, cc;
    /* hazard coats adjacent to any cleared cell lose one layer */
    var stripped = {};
    for (i = 0; i < runs.length; i++) {
      for (j = 0; j < runs[i].cells.length; j++) {
        cc = runs[i].cells[j];
        this.grid[cc.r][cc.c].pop = 0;
        this.stripNeighbours(cc.r, cc.c, stripped);
      }
    }
    this.combo++;
    if (this.combo > this.bestCombo) this.bestCombo = this.combo;
    this.resolveRuns(runs, this.combo);
    this.bstate = 'clear';
    this.btimer = 0;
  };

  Sim.prototype.stripNeighbours = function (r, c, seen) {
    var d = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (var i = 0; i < 4; i++) {
      var rr = r + d[i][0], cc = c + d[i][1];
      var g = this.at(rr, cc);
      if (!g || g.haz <= 0) continue;
      var key = rr * this.cols + cc;
      if (seen[key]) continue;
      seen[key] = 1;
      g.haz--;
      this.emit('hazard', rr, cc, g.haz);
      if (g.haz <= 0) { g.hazMax = 0; g.t = this.irnd(this.colors); }
    }
  };

  Sim.prototype.collapse = function () {
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
        this.grid[r2][c] = { t: this.irnd(this.colors), haz: 0, hazMax: 0, oy: (r2 + above), pop: -1, chg: false };
        above++;
      }
    }
    this.bstate = 'fall';
  };

  Sim.prototype.stepBoard = function (dt) {
    var r, c;
    if (this.bstate === 'swap') {
      this.sw.t += dt / SWAP_TIME;
      if (this.sw.t >= 1) {
        this.doSwap();
        if (this.sw.back) { this.sw = null; this.bstate = 'idle'; return; }
        var runs = this.findRuns();
        if (runs.length) {
          this.sw = null;
          this.moves++;
          var big = false;
          for (var i = 0; i < runs.length; i++) if (runs[i].len >= 4) big = true;
          if (big) this.dry = 0; else this.dry++;
          if (!this.charged && this.dry >= this.stats.pityMoves) {
            this.charged = true; this.dry = 0; this.emit('pity');
          }
          this.startClear(runs);
        } else {
          this.emit('invalid', this.sw.a.r, this.sw.a.c, this.sw.b.r, this.sw.b.c);
          this.sw = { a: this.sw.a, b: this.sw.b, t: 0, back: true };
        }
      }
      return;
    }
    if (this.bstate === 'clear') {
      this.btimer += dt;
      var p = HF.clamp(this.btimer / CLEAR_TIME, 0, 1);
      for (r = 0; r < this.rows; r++)
        for (c = 0; c < this.cols; c++) if (this.grid[r][c].pop >= 0) this.grid[r][c].pop = p;
      if (p >= 1) this.collapse();
      return;
    }
    if (this.bstate === 'fall') {
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
        else {
          this.bstate = 'idle';
          this.combo = 0;
          if (!this.hasMove()) { this.shuffleTypes(); this.ensureMove(); this.emit('reshuffle'); }
        }
      }
      return;
    }
  };

  /* ---------------------------------------------------- match -> combat - */
  Sim.prototype.resolveRuns = function (runs, combo) {
    var cmul = 1 + this.stats.cascadeBonus * (combo - 1);
    var charged = this.charged;
    var cells = 0;
    for (var i = 0; i < runs.length; i++) {
      var run = runs[i];
      var splash = run.len >= 4 || charged;
      var pierce = run.len >= 5;
      var power = cmul * (1 + (run.len - 3) * 0.35) * (charged ? 1.6 : 1);
      for (var j = 0; j < run.cells.length; j++) {
        var cc = run.cells[j];
        this.fire(cc.c, run.t, power, splash, pierce, cc.r);
        cells++;
      }
      this.emit('run', run.t, run.len, run.cells[0].r, run.cells[0].c, combo);
    }
    if (charged) { this.charged = false; this.emit('charged'); }
    this.emit('match', combo, cells, runs.length);
  };

  Sim.prototype.fire = function (lane, type, power, splash, pierce, row) {
    if (lane < 0 || lane >= this.cols) return;
    var kit = HF.SQUAD[HF.clamp(type, 0, HF.SQUAD.length - 1)].key;
    if (kit === 'repair') {
      var heal = Math.round(3.2 * power * this.stats.healMul);
      var before = this.wallHp;
      this.wallHp = Math.min(this.wallMax, this.wallHp + heal);
      this.emit('heal', lane, Math.round(this.wallHp - before), row);
      if (this.stats.medkitStrips) this.stripLane(lane);
      return;
    }
    if (kit === 'salvage') {
      var got = Math.max(1, Math.round(1.4 * power * this.stats.coinMul));
      this.coins += got;
      this.emit('coin', lane, got, row);
      return;
    }
    var s = this.takeShot();
    if (!s) return;
    s.lane = lane;
    s.p = 1.0;                              /* 1 = the wall, 0 = the spawn line */
    s.kind = kit === 'frost' ? 'coil' : (kit === 'venom' ? 'venom' : 'shell');
    s.spd = (s.kind === 'coil' ? 430 : (s.kind === 'venom' ? 360 : 520)) / REF_TRACK;
    s.dmg = (s.kind === 'coil' ? 5 : (s.kind === 'venom' ? 7 : 20)) * power * this.stats.dmgMul;
    s.splash = !!splash;
    s.pierce = !!pierce;
    s.life = 3;
    s.hits.length = 0;
    this.emit('shot', lane, s.kind, s.slot, splash, pierce);
  };

  Sim.prototype.stripLane = function (lane) {
    for (var r = 0; r < this.rows; r++) {
      var g = this.grid[r][lane];
      if (g.haz > 0) {
        g.haz--;
        this.emit('hazard', r, lane, g.haz);
        if (g.haz <= 0) { g.hazMax = 0; g.t = this.irnd(this.colors); }
        return;
      }
    }
  };

  Sim.prototype.takeShot = function () {
    for (var i = 0; i < this.shots.length; i++) {
      var s = this.shots[i];
      if (!s.on) { s.on = true; return s; }
    }
    return null;
  };
  Sim.prototype.takeEnemy = function () {
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      if (!e.on) { e.on = true; return e; }
    }
    return null;
  };

  /* --------------------------------------------------------- hazards ---- */
  Sim.prototype.hazardCount = function () {
    var n = 0;
    for (var r = 0; r < this.rows; r++) for (var c = 0; c < this.cols; c++) if (this.grid[r][c].haz > 0) n++;
    return n;
  };

  Sim.prototype.seedHazard = function (spreadFrom) {
    var def = this.hazardDef;
    if (this.hazardCount() >= def.cap) return false;
    var tries = 0;
    while (tries++ < 40) {
      var r, c;
      if (spreadFrom) {
        var d = [[1, 0], [-1, 0], [0, 1], [0, -1]][this.irnd(4)];
        r = spreadFrom.r + d[0]; c = spreadFrom.c + d[1];
      } else {
        r = this.irnd(this.rows); c = this.irnd(this.cols);
      }
      var g = this.at(r, c);
      if (!g || g.haz > 0 || g.pop >= 0 || g.oy > 0) continue;
      g.haz = def.layers; g.hazMax = def.layers;
      this.emit('hazardNew', r, c, def.layers);
      return true;
    }
    return false;
  };

  Sim.prototype.randomHazardCell = function () {
    var pool = [];
    for (var r = 0; r < this.rows; r++) for (var c = 0; c < this.cols; c++)
      if (this.grid[r][c].haz > 0) pool.push({ r: r, c: c });
    if (!pool.length) return null;
    return pool[this.irnd(pool.length)];
  };

  Sim.prototype.stepHazards = function (dt) {
    var def = this.hazardDef;
    this.hazardTimer -= dt;
    if (this.hazardTimer <= 0) {
      this.hazardTimer = def.every / this.stats.hazardMul;
      this.seedHazard(null);
      /* a hazard must never be able to lock the board */
      if (!this.hasMove()) { this.shuffleTypes(); this.ensureMove(); this.emit('reshuffle'); }
    }
    if (def.spread > 0) {
      this.spreadTimer -= dt;
      if (this.spreadTimer <= 0) {
        this.spreadTimer = def.spread;
        var from = this.randomHazardCell();
        if (from) this.seedHazard(from);
      }
    }
  };

  /* --------------------------------------------------------- battle ----- */
  Sim.prototype.spawn = function (entry) {
    var e = this.takeEnemy();
    if (!e) return null;
    var K = HF.kind(entry.kind);
    var boss = entry.boss || null;
    var hp = (boss ? boss.hp : K.hp * this.hpMul) * (entry.elite ? 1.6 : 1);
    e.kind = entry.kind;
    e.lane = HF.clamp(entry.lane | 0, 0, this.cols - 1);
    e.p = -0.05 - this.rand() * 0.04;
    e.hp = hp; e.max = hp;
    e.spd = ((boss ? boss.spd : K.spd) * (entry.elite ? 1.15 : 1) * this.spdMul * (0.9 + this.rand() * 0.2)) / REF_TRACK;
    e.r = boss ? boss.r : K.r;
    e.dmg = (boss ? boss.dmg : K.dmg) * (1 + 0.06 * (this.wave - 1));
    e.coin = (boss ? boss.coin : K.coin) * (entry.elite ? 2 : 1);
    e.trait = boss ? boss.trait : K.trait;
    e.sil = boss ? 'boss' : K.sil;
    e.name = boss ? boss.name : K.name;
    e.boss = !!boss;
    e.elite = !!entry.elite;
    e.slow = 0; e.ven = 0; e.venDps = 0; e.flash = 0; e.stun = 0;
    e.wob = this.rand() * 6.28;
    e.shield = 0; e.shieldCd = 6; e.spawnCd = 5; e.fire = 2.4;
    e.born = this.time;
    if (boss) { this.bossRef = e; this.emit('bossIn', e.slot, boss.name); }
    else this.emit('spawn', e.slot, entry.kind, e.lane, e.elite);
    return e;
  };

  Sim.prototype.hurt = function (e, dmg, source) {
    if (!e.on || e.hp <= 0) return;
    var d = dmg;
    if (e.trait === 'armor' && source === 'shell') d *= 0.62;
    if (e.shield > 0) d *= 0.4;
    e.hp -= d;
    e.flash = 0.12;
    if (e.hp <= 0) {
      this.kills++;
      var got = Math.max(1, Math.round(e.coin * this.stats.coinMul * 0.5));
      this.coins += got;
      this.emit('kill', e.slot, e.lane, e.p, e.boss, got);
      if (e.boss) this.bossRef = null;
      e.on = false;
    } else {
      this.emit('hit', e.slot, source, e.lane, e.p);
    }
  };

  Sim.prototype.hitWall = function (amount, lane, p) {
    if (this.barricade > 0) {
      this.barricade--;
      this.emit('absorb', lane, this.barricade);
      return;
    }
    this.wallHp -= amount;
    this.emit('breach', lane, Math.round(amount), p);
    if (this.wallHp <= 0) {
      this.wallHp = 0;
      this.result = -1;
      this.emit('lost');
    }
  };

  Sim.prototype.stepBattle = function (dt) {
    var i, j, e, s;
    this.time += dt;

    while (this.qi < this.queue.length && this.queue[this.qi].t <= this.time) {
      this.spawn(this.queue[this.qi++]);
    }

    if (this.flareTimer > 0) this.flareTimer -= dt;

    /* shots travel from the wall (p = 1) up the lane toward the spawn line */
    for (i = 0; i < this.shots.length; i++) {
      s = this.shots[i];
      if (!s.on) continue;
      s.p -= s.spd * dt;
      s.life -= dt;
      if (s.p < -0.08 || s.life <= 0) { s.on = false; s.hits.length = 0; continue; }
      for (j = 0; j < this.enemies.length; j++) {
        e = this.enemies[j];
        if (!e.on || e.hp <= 0) continue;
        var laneOk = s.splash ? Math.abs(e.lane - s.lane) <= 1 : e.lane === s.lane;
        if (!laneOk) continue;
        if (s.hits.indexOf(e.slot) >= 0) continue;
        var reach = (e.r + 8) / this.trackLen;
        if (Math.abs(e.p - s.p) > reach) continue;
        var mult = (s.splash && e.lane !== s.lane) ? 0.5 : 1;
        if (s.kind === 'coil') {
          e.slow = this.stats.slowTime;
          this.emit('chill', e.slot, e.lane, e.p);
        } else if (s.kind === 'venom') {
          e.venDps = Math.max(e.venDps, s.dmg * 0.75);
          e.ven = 3.2;
          this.emit('venom', e.slot, e.lane, e.p);
        }
        this.hurt(e, s.dmg * mult, s.kind);
        s.hits.push(e.slot);
        if (s.hits.length > 12) s.hits.shift();
        if (!s.pierce) { s.on = false; s.hits.length = 0; break; }
      }
    }

    /* enemies */
    for (i = 0; i < this.enemies.length; i++) {
      e = this.enemies[i];
      if (!e.on) continue;
      if (e.flash > 0) e.flash -= dt;
      if (e.slow > 0) e.slow -= dt;
      if (e.stun > 0) e.stun -= dt;
      if (e.shield > 0) e.shield -= dt;
      if (e.ven > 0) {
        e.ven -= dt;
        e.hp -= e.venDps * dt;
        if (e.hp <= 0) { this.hurt(e, 0.01, 'venom'); continue; }
      }
      e.wob += dt * 5;

      var speed = e.spd;
      if (e.slow > 0) speed *= this.stats.slowFactor;
      if (e.stun > 0) speed = 0;
      if (e.trait === 'accel') speed *= HF.clamp(1 + (this.time - e.born) * 0.06, 1, 1.9);
      if (e.trait === 'frenzy') speed *= HF.clamp(1 + (1 - e.hp / e.max) * 0.9, 1, 1.9);

      if (e.trait === 'ranged' && e.p > 0.72) {
        /* spitters hold short of the wall and chip it from range */
        speed = 0;
        e.fire -= dt;
        if (e.fire <= 0) {
          e.fire = 2.4;
          this.emit('spit', e.slot, e.lane, e.p);
          this.hitWall(e.dmg * 0.45, e.lane, e.p);
          if (this.result) return;
        }
      }
      if (e.trait === 'spawner') {
        e.spawnCd -= dt;
        if (e.spawnCd <= 0) {
          e.spawnCd = 6.5;
          this.spawn({ t: this.time, kind: 0, lane: HF.clamp(e.lane - 1, 0, this.cols - 1) });
          this.spawn({ t: this.time, kind: 0, lane: HF.clamp(e.lane + 1, 0, this.cols - 1) });
          this.emit('bossAct', e.slot, 'spawner');
        }
      }
      if (e.trait === 'healer') {
        e.spawnCd -= dt;
        if (e.spawnCd <= 0) {
          e.spawnCd = 3.0;
          for (j = 0; j < this.enemies.length; j++) {
            var o = this.enemies[j];
            if (!o.on || o === e || Math.abs(o.lane - e.lane) > 1) continue;
            o.hp = Math.min(o.max, o.hp + o.max * 0.18);
          }
          this.emit('bossAct', e.slot, 'healer');
        }
      }
      if (e.trait === 'shield') {
        e.shieldCd -= dt;
        if (e.shieldCd <= 0) { e.shieldCd = 9.0; e.shield = 4.0; this.emit('bossAct', e.slot, 'shield'); }
      }

      e.p += speed * dt;
      if (e.p >= 1) {
        this.hitWall(e.dmg, e.lane, 1);
        e.on = false;
        if (this.result) return;
        continue;
      }
    }

    if (!this.result && this.qi >= this.queue.length && !this.anyEnemy()) {
      this.result = 1;
      this.emit('cleared', this.wave);
    }
  };

  Sim.prototype.anyEnemy = function () {
    for (var i = 0; i < this.enemies.length; i++) if (this.enemies[i].on) return true;
    return false;
  };

  Sim.prototype.useFlare = function () {
    if (this.result || this.flares <= 0) return false;
    this.flares--;
    this.flareTimer = 1.6;
    var n = 0;
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      if (!e.on) continue;
      e.stun = e.boss ? 1.0 : 2.2;
      n++;
    }
    this.emit('flare', n, this.flares);
    return true;
  };

  /* ---------------------------------------------------- telegraph ------- */
  /* Lane threat one step ahead: pending spawns inside the telegraph window
   * plus the closest live enemy per lane. The view never computes threat. */
  Sim.prototype.threat = function (out) {
    var i, lane;
    for (i = 0; i < this.cols; i++) {
      out[i] = out[i] || { pending: 0, near: -1, nearKind: -1, danger: 0, eta: 99 };
      out[i].pending = 0; out[i].near = -1; out[i].nearKind = -1; out[i].danger = 0; out[i].eta = 99;
    }
    var win = this.stats.telegraph;
    for (i = this.qi; i < this.queue.length; i++) {
      var q = this.queue[i];
      if (q.t > this.time + win) break;
      lane = HF.clamp(q.lane | 0, 0, this.cols - 1);
      out[lane].pending++;
    }
    for (i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      if (!e.on) continue;
      lane = e.lane;
      if (e.p > out[lane].near) {
        out[lane].near = e.p;
        out[lane].nearKind = e.kind;
        var speed = Math.max(0.001, e.spd * (e.slow > 0 ? this.stats.slowFactor : 1));
        out[lane].eta = (1 - e.p) / speed;
      }
      if (e.p > 0.62) out[lane].danger = Math.max(out[lane].danger, (e.p - 0.62) / 0.38);
    }
    return out;
  };

  Sim.prototype.remaining = function () {
    var live = 0;
    for (var i = 0; i < this.enemies.length; i++) if (this.enemies[i].on) live++;
    return (this.queue.length - this.qi) + live;
  };
  Sim.prototype.waveProgress = function () {
    var total = Math.max(1, this.queue.length);
    return HF.clamp(1 - this.remaining() / total, 0, 1);
  };

  /* ------------------------------------------------------------ step ---- */
  /* Fixed substeps: the sim clock never runs ahead of the stepped simulation
   * even when the browser hands us a long frame. */
  Sim.prototype.step = function (dt) {
    if (this.result) { this.stepBoard(HF.clamp(dt, 0, 0.1)); return; }
    /* tutorial hold: the board stays live, the horde clock does not start */
    if (this.hold) { this.stepBoard(HF.clamp(dt, 0, 0.1)); return; }
    var left = HF.clamp(dt, 0, 0.1);
    var MAXSTEP = 1 / 60;
    while (left > 0) {
      var d = left > MAXSTEP ? MAXSTEP : left;
      this.stepBoard(d);
      this.stepHazards(d);
      this.stepBattle(d);
      left -= d;
      if (this.result) break;
    }
  };

  return {
    create: function (opts) { return new Sim(opts); },
    CLEAR_TIME: CLEAR_TIME,
    SWAP_TIME: SWAP_TIME,
    REF_TRACK: REF_TRACK
  };
})();
