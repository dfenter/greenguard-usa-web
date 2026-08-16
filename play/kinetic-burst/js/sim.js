/* Kinetic Burst - battle simulation.
 *
 * Pure state and numbers: no Phaser, no DOM, no timers of its own. The view
 * calls trace/commit/burst and animates the report it gets back. The sim is
 * already in its post-move state when the report is returned, so the renderer
 * never has to guess what happened.
 *
 * Deterministic: every random draw comes from one seeded stream, so a replayed
 * stage produces the same board. Cosmetic randomness lives in fx.js.
 */
(function (root) {
  'use strict';
  var M = KB.M;

  function Battle(cfg) {
    this.mode = cfg.mode || 'road';           /* road | endless | trial */
    this.stageIndex = cfg.stage | 0;
    this.trialIndex = cfg.trial | 0;
    this.rules = cfg.rules || {};
    this.rand = KB.rng(cfg.seed || 0x4B42);
    this.cols = M.cols;
    this.rows = M.rows;
    this.minRun = this.rules.minRun || M.minRun;
    this.nextId = 1;
    this.turn = 0;
    this.score = 0;
    this.damageDone = 0;
    this.over = false;
    this.won = false;
    this.waveIndex = 0;
    this.wave = 0;                            /* endless wave counter */
    this.lastRunCount = 0;
    this.path = [];
    this.tracing = false;
    this.traceT = 0;
    this.tracePointer = null;

    this.team = [];
    for (var i = 0; i < cfg.team.length && i < 3; i++) {
      var slot = cfg.team[i];
      var def = KB.fighter(slot.id);
      var lv = KB.level(slot.xp);
      var hp = KB.statHp(def, slot.xp);
      if (this.rules.halfHp) hp = Math.max(20, Math.round(hp * 0.5));
      this.team.push({
        slot: i, fid: def.id, def: def, level: lv,
        maxHp: hp, hp: hp,
        atk: KB.statAtk(def, slot.xp),
        charge: 0, armed: false, shield: 0, down: false
      });
    }
    while (this.team.length < 3) this.team.push(this.team[0]);
    this.front = 0;
    this.target = 0;

    this.waves = cfg.waves || [];
    this.enemies = [];
    this.buildGrid();
    this.spawnWave(0);
  }

  /* ------------------------------------------------------------- board */
  Battle.prototype.newOrb = function () {
    var t;
    if (!this.rules.noHeart && this.rand() < M.heartRate) t = KB.HEART;
    else t = (this.rand() * 3) | 0;
    return { id: this.nextId++, t: t };
  };

  Battle.prototype.buildGrid = function () {
    this.grid = [];
    for (var r = 0; r < this.rows; r++) {
      var row = [];
      for (var c = 0; c < this.cols; c++) row.push(this.newOrb());
      this.grid.push(row);
    }
  };

  Battle.prototype.orbAt = function (c, r) {
    if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return null;
    return this.grid[r][c];
  };

  /* ------------------------------------------------------------ trace */
  Battle.prototype.traceLimit = function () {
    var extra = 0;
    for (var i = 0; i < this.team.length; i++) {
      if (!this.team[i].down && this.team[i].def.passive === 'swift') extra = 1.5;
    }
    return M.traceTime + extra;
  };

  Battle.prototype.pathIndex = function (c, r) {
    for (var i = 0; i < this.path.length; i++) {
      if (this.path[i].c === c && this.path[i].r === r) return i;
    }
    return -1;
  };

  Battle.prototype.traceStart = function (c, r, pointerId) {
    if (this.over || this.tracing) return false;
    if (!this.orbAt(c, r)) return false;
    this.path.length = 0;
    this.path.push({ c: c, r: r });
    this.tracing = true;
    this.traceT = this.traceLimit();
    this.tracePointer = pointerId;
    return true;
  };

  /* Returns 'add' | 'back' | 'none'. Backtracking pops the last cell; a fast
   * drag that skips cells walks the gap so the chain still links. */
  Battle.prototype.traceExtend = function (c, r) {
    if (!this.tracing || !this.path.length) return 'none';
    var last = this.path[this.path.length - 1];
    if (last.c === c && last.r === r) return 'none';
    if (!this.orbAt(c, r)) return 'none';
    if (this.path.length >= 2) {
      var prev = this.path[this.path.length - 2];
      if (prev.c === c && prev.r === r) { this.path.pop(); return 'back'; }
    }
    if (this.pathIndex(c, r) >= 0) return 'none';
    if (this.path.length >= M.maxPath) return 'none';
    var dc = c - last.c, dr = r - last.r;
    if (Math.abs(dc) > 1 || Math.abs(dr) > 1) {
      var cc = last.c, rr = last.r, added = false, guard = 0;
      while ((cc !== c || rr !== r) && guard++ < this.cols + this.rows) {
        cc += Math.sign(c - cc);
        rr += Math.sign(r - rr);
        if (this.pathIndex(cc, rr) >= 0) return added ? 'add' : 'none';
        if (this.path.length >= M.maxPath) return added ? 'add' : 'none';
        this.path.push({ c: cc, r: rr });
        added = true;
      }
      return added ? 'add' : 'none';
    }
    this.path.push({ c: c, r: r });
    return 'add';
  };

  Battle.prototype.traceCancel = function () {
    this.path.length = 0;
    this.tracing = false;
    this.traceT = 0;
    this.tracePointer = null;
  };

  /* clock for the trace timer only; never advances anything else */
  Battle.prototype.tickTrace = function (dt) {
    if (!this.tracing || this.over) return false;
    this.traceT -= dt;
    if (this.traceT <= 0) { this.traceT = 0; return true; }
    return false;
  };

  /* Split the path into scoring runs of same-type orbs. */
  Battle.prototype.runs = function () {
    var out = [], cur = null;
    for (var i = 0; i < this.path.length; i++) {
      var cell = this.path[i];
      var orb = this.orbAt(cell.c, cell.r);
      if (!orb) continue;
      if (cur && cur.t === orb.t) cur.cells.push(cell);
      else {
        if (cur && cur.cells.length >= this.minRun) out.push(cur);
        cur = { t: orb.t, cells: [cell] };
      }
    }
    if (cur && cur.cells.length >= this.minRun) out.push(cur);
    return out;
  };

  /* --------------------------------------------------------- fighters */
  Battle.prototype.fighterFor = function (type) {
    var best = null;
    for (var i = 0; i < this.team.length; i++) {
      var f = this.team[i];
      if (f.down || f.def.type !== type) continue;
      if (!best || f.atk > best.atk) best = f;
    }
    return best;
  };

  Battle.prototype.aliveTeam = function () {
    var n = 0;
    for (var i = 0; i < this.team.length; i++) if (!this.team[i].down) n++;
    return n;
  };

  Battle.prototype.frontFighter = function () {
    var f = this.team[this.front];
    if (f && !f.down) return f;
    for (var i = 0; i < this.team.length; i++) {
      if (!this.team[i].down) { this.front = i; return this.team[i]; }
    }
    return this.team[0];
  };

  Battle.prototype.setFront = function (i) {
    if (i < 0 || i >= this.team.length) return false;
    if (this.team[i].down) return false;
    this.front = i;
    this.retarget();
    return true;
  };

  Battle.prototype.chargeCap = function (f) {
    return f.def.passive === 'over' ? M.overcap : M.fullCharge;
  };

  /* ---------------------------------------------------------- enemies */
  Battle.prototype.spawnWave = function (i) {
    var list = this.waves[i] || [];
    this.enemies = [];
    for (var k = 0; k < list.length; k++) {
      var d = list[k];
      this.enemies.push({
        slot: k, name: d.name, type: d.type, boss: !!d.boss,
        maxHp: d.hp, hp: d.hp, atk: d.atk,
        speed: Math.max(1, d.speed),
        timer: Math.max(1, d.speed),
        alive: true, telegraph: 0, tgt: 0
      });
    }
    this.target = 0;
    this.retarget();
    this.telegraph();
  };

  Battle.prototype.retarget = function () {
    if (this.enemies.length && this.enemies[this.target] && this.enemies[this.target].alive) return;
    for (var i = 0; i < this.enemies.length; i++) {
      if (this.enemies[i].alive) { this.target = i; return; }
    }
    this.target = 0;
  };

  Battle.prototype.setTarget = function (i) {
    if (i < 0 || i >= this.enemies.length) return false;
    if (!this.enemies[i].alive) return false;
    this.target = i;
    return true;
  };

  /* Every enemy publishes its next hit one turn ahead: the turn counter
   * on the card and this number are the same value the sim will use. */
  Battle.prototype.telegraph = function () {
    var front = this.frontFighter();
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      if (!e.alive) { e.telegraph = 0; continue; }
      e.tgt = front ? front.slot : 0;
      e.telegraph = this.incomingDamage(e, front);
    }
  };

  Battle.prototype.incomingDamage = function (e, f) {
    if (!f) return e.atk;
    var mult = KB.kiMult(e.type, f.def.type);
    if (f.def.passive === 'champion' && mult < 1) mult = 1;
    var dmg = e.atk * mult;
    if (f.def.passive === 'bulwark') dmg *= 0.8;
    return Math.max(1, Math.round(dmg));
  };

  /* ------------------------------------------------------------ damage */
  Battle.prototype.attackMult = function (f, runOrbs, chain) {
    var m = chain;
    if (f.def.passive === 'longchain' && runOrbs >= 5) m *= 1.25;
    return m;
  };

  Battle.prototype.hitEnemy = function (e, raw, atkType, opts) {
    opts = opts || {};
    var mult = opts.pierce ? Math.max(1, KB.kiMult(atkType, e.type)) : KB.kiMult(atkType, e.type);
    var dmg = Math.max(1, Math.round(raw * mult));
    e.hp -= dmg;
    this.damageDone += dmg;
    var killed = false;
    if (e.hp <= 0) { e.hp = 0; e.alive = false; killed = true; }
    return { dmg: dmg, mult: mult, killed: killed, slot: e.slot };
  };

  /* ----------------------------------------------------------- preview
   * Live readout while the player drags. Reads state, writes nothing. */
  Battle.prototype.preview = function () {
    var runs = this.runs();
    var scoring = 0, orbs = 0;
    for (var i = 0; i < runs.length; i++) { scoring++; orbs += runs[i].cells.length; }
    var chain = 1 + M.comboStep * Math.max(0, scoring - 1);
    var dmg = 0, heal = 0;
    var e = this.enemies[this.target];
    for (var k = 0; k < runs.length; k++) {
      var run = runs[k];
      var n = run.cells.length;
      if (run.t === KB.HEART) { heal += this.rules.noHeal ? 0 : n * M.healPerOrb; continue; }
      var f = this.fighterFor(run.t);
      if (!f) continue;
      var raw = f.atk * n * M.damagePerOrb * this.attackMult(f, n, chain);
      var mult = e && e.alive ? KB.kiMult(run.t, e.type) : 1;
      dmg += Math.max(1, Math.round(raw * mult));
    }
    return { runs: scoring, orbs: orbs, chain: chain, damage: Math.round(dmg), heal: Math.round(heal) };
  };

  /* ------------------------------------------------------------ commit */
  Battle.prototype.commit = function () {
    var rep = {
      ok: false, runs: [], orbs: 0, chain: 1, damage: 0, heal: 0,
      pops: [], moves: [], spawns: [], charged: [], kills: [],
      enemyActions: [], ko: false, waveCleared: false, stageCleared: false,
      target: this.target, turn: this.turn
    };
    if (this.over) { this.traceCancel(); return rep; }
    var runs = this.runs();
    this.tracing = false;
    this.tracePointer = null;
    this.path.length = 0;
    if (!runs.length) { rep.ok = false; return rep; }

    rep.ok = true;
    this.turn++;
    rep.turn = this.turn;
    var chain = 1 + M.comboStep * Math.max(0, runs.length - 1);
    rep.chain = chain;
    this.lastRunCount = runs.length;

    var chargeMul = this.rules.chargeMul || 1;
    var i, k, f, run, n;

    /* 1. pops and cascade geometry for every scoring cell */
    var deadCols = [];
    for (i = 0; i < this.cols; i++) deadCols.push([]);
    for (k = 0; k < runs.length; k++) {
      run = runs[k];
      for (i = 0; i < run.cells.length; i++) {
        var cell = run.cells[i];
        var orb = this.orbAt(cell.c, cell.r);
        if (!orb || orb.dead) continue;
        orb.dead = true;
        rep.pops.push({ c: cell.c, r: cell.r, t: orb.t, id: orb.id, run: k });
        deadCols[cell.c].push(cell.r);
      }
      rep.orbs += run.cells.length;
    }

    /* 2. damage, healing and charge */
    var target = this.enemies[this.target];
    for (k = 0; k < runs.length; k++) {
      run = runs[k];
      n = run.cells.length;
      var entry = { t: run.t, count: n, damage: 0, heal: 0, fighter: -1, mult: 1, killed: false, cells: run.cells };
      if (run.t === KB.HEART) {
        var healAmt = this.rules.noHeal ? 0 : Math.round(n * M.healPerOrb);
        if (healAmt > 0) {
          for (i = 0; i < this.team.length; i++) {
            var t3 = this.team[i];
            if (t3.down) continue;
            t3.hp = Math.min(t3.maxHp, t3.hp + healAmt);
          }
        }
        entry.heal = healAmt;
        rep.heal += healAmt;
        /* Talo Wren banks heart runs as charge */
        for (i = 0; i < this.team.length; i++) {
          var w = this.team[i];
          if (!w.down && w.def.passive === 'wellspring') {
            this.addCharge(w, n * M.chargePerOrb * 0.6 * chargeMul, rep);
          }
        }
        rep.runs.push(entry);
        continue;
      }
      f = this.fighterFor(run.t);
      if (f) {
        entry.fighter = f.slot;
        var gain = (n * M.chargePerOrb + Math.max(0, n - this.minRun) * M.chargeBonusPerExtra) * chargeMul;
        if (f.def.passive === 'steady') gain *= 1.1;
        this.addCharge(f, gain, rep);
        this.retarget();
        target = this.enemies[this.target];
        if (target && target.alive) {
          var raw = f.atk * n * M.damagePerOrb * this.attackMult(f, n, chain);
          var hit = this.hitEnemy(target, raw, run.t);
          entry.damage = hit.dmg;
          entry.mult = hit.mult;
          entry.killed = hit.killed;
          rep.damage += hit.dmg;
          if (hit.killed) rep.kills.push(hit.slot);
        }
      } else {
        /* nobody on the team carries this element: the run spills a little
         * charge into the front fighter rather than vanishing */
        var fr = this.frontFighter();
        if (fr) this.addCharge(fr, n * M.chargePerOrb * 0.4 * chargeMul, rep);
      }
      rep.runs.push(entry);
    }

    /* 3. collapse and refill */
    this.collapse(deadCols, rep);

    /* 4. enemy turn */
    this.enemyTurn(rep);

    /* 5. bookkeeping */
    if (this.mode === 'endless') this.score += rep.damage;
    this.finishTurn(rep);
    return rep;
  };

  Battle.prototype.addCharge = function (f, amount, rep) {
    var cap = this.chargeCap(f);
    var before = f.charge;
    f.charge = Math.min(cap, f.charge + amount);
    var armedNow = f.charge >= M.fullCharge && before < M.fullCharge;
    f.armed = f.charge >= M.fullCharge;
    if (rep) rep.charged.push({ slot: f.slot, gain: Math.round(f.charge - before), full: armedNow });
  };

  Battle.prototype.collapse = function (deadCols, rep) {
    for (var c = 0; c < this.cols; c++) {
      if (!deadCols[c].length) continue;
      var write = this.rows - 1;
      for (var r = this.rows - 1; r >= 0; r--) {
        var orb = this.grid[r][c];
        if (orb.dead) continue;
        if (write !== r) {
          this.grid[write][c] = orb;
          rep.moves.push({ id: orb.id, c: c, from: r, to: write });
        }
        write--;
      }
      var spawnIndex = 0;
      for (var w = write; w >= 0; w--) {
        var fresh = this.newOrb();
        this.grid[w][c] = fresh;
        rep.spawns.push({ id: fresh.id, c: c, r: w, t: fresh.t, order: spawnIndex++ });
      }
    }
  };

  Battle.prototype.enemyTurn = function (rep) {
    var front = this.frontFighter();
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      if (!e.alive) continue;
      e.timer--;
      if (e.timer > 0) continue;
      e.timer = e.speed;
      front = this.frontFighter();
      if (!front) break;
      var dmg = this.incomingDamage(e, front);
      if (front.shield > 0) {
        var absorbed = Math.min(front.shield, dmg);
        front.shield -= absorbed;
        dmg -= absorbed;
      }
      front.hp -= dmg;
      if (front.hp <= 0) {
        front.hp = 0;
        front.down = true;
        front.armed = false;
        front.charge = 0;
      }
      rep.enemyActions.push({ slot: e.slot, dmg: dmg, target: front.slot, downed: front.down });
    }
    this.telegraph();
  };

  Battle.prototype.finishTurn = function (rep) {
    if (this.aliveTeam() === 0) {
      this.over = true; this.won = false;
      rep.ko = true;
      return;
    }
    var standing = 0;
    for (var i = 0; i < this.enemies.length; i++) if (this.enemies[i].alive) standing++;
    if (standing > 0) return;
    rep.waveCleared = true;
    if (this.mode === 'endless') {
      this.wave++;
      this.score += 250 + this.wave * 90;
      var next = KB.endlessWave(this.wave);
      this.waves.push(next.foes);
      this.arcHint = next.arc;
      this.waveIndex = this.waves.length - 1;
      this.spawnWave(this.waveIndex);
      if (!this.rules.keepCharge) this.softReset();
      return;
    }
    if (this.waveIndex + 1 < this.waves.length) {
      this.waveIndex++;
      this.spawnWave(this.waveIndex);
      if (!this.rules.keepCharge) this.softReset();
      return;
    }
    this.over = true;
    this.won = true;
    rep.stageCleared = true;
  };

  /* between waves: keep health, cool the charge bars a little */
  Battle.prototype.softReset = function () {
    for (var i = 0; i < this.team.length; i++) {
      var f = this.team[i];
      if (f.down) continue;
      f.charge = Math.min(f.charge, M.fullCharge * 0.5);
      f.armed = f.charge >= M.fullCharge;
    }
  };

  /* ------------------------------------------------------------- burst
   * A super is two beats: arm (charge >= 100) then a clash timing tap.
   * clashQuality is 0..1 from the view's sweep; the sim decides the number. */
  Battle.prototype.canBurst = function (slot) {
    var f = this.team[slot];
    return !!(f && !f.down && f.charge >= M.fullCharge && !this.over);
  };

  Battle.prototype.clashWindow = function (slot) {
    var f = this.team[slot];
    var w = M.clashWindow;
    if (f && f.def.passive === 'read') w *= 1.4;
    return w;
  };

  Battle.prototype.clashMult = function (quality) {
    if (quality >= 0.86) return M.clashPerfect;
    if (quality >= 0.55) return M.clashGood;
    return M.clashLate;
  };

  Battle.prototype.burst = function (slot, quality) {
    var rep = {
      ok: false, kind: '', name: '', hits: [], damage: 0, heal: 0, selfDamage: 0,
      clash: 1, kills: [], waveCleared: false, stageCleared: false, ko: false,
      enemyActions: [], slot: slot
    };
    if (!this.canBurst(slot)) return rep;
    var f = this.team[slot];
    var sp = f.def.special;
    rep.ok = true;
    rep.kind = sp.kind;
    rep.name = sp.name;
    var clash = this.clashMult(quality == null ? 0.6 : quality);
    rep.clash = clash;

    var over = 1;
    if (f.def.passive === 'over') over = 1 + Math.max(0, f.charge - M.fullCharge) / M.fullCharge * 0.9;
    var base = f.atk * sp.power * clash * over * 3.4;
    var pierce = sp.kind === 'pierce';
    var self = this;

    function hitOne(e) {
      if (!e || !e.alive) return;
      var h = self.hitEnemy(e, base, f.def.type, { pierce: pierce });
      rep.hits.push({ slot: e.slot, dmg: h.dmg, mult: h.mult, killed: h.killed });
      rep.damage += h.dmg;
      if (h.killed) rep.kills.push(e.slot);
    }

    this.retarget();
    var tgt = this.enemies[this.target];
    if (sp.kind === 'sweep' || sp.kind === 'pierce') {
      for (var i = 0; i < this.enemies.length; i++) hitOne(this.enemies[i]);
    } else if (sp.kind === 'double') {
      hitOne(tgt);
      this.retarget();
      hitOne(this.enemies[this.target]);
    } else if (sp.kind === 'chain') {
      base *= 1 + 0.12 * this.lastRunCount;
      hitOne(tgt);
    } else {
      hitOne(tgt);
    }

    if (sp.kind === 'delay') {
      for (var d = 0; d < this.enemies.length; d++) {
        if (this.enemies[d].alive) this.enemies[d].timer++;
      }
    }
    if (sp.kind === 'mend' && !this.rules.noHeal) {
      var heal = Math.round(rep.damage / 3);
      for (var m = 0; m < this.team.length; m++) {
        var t = this.team[m];
        if (t.down) continue;
        t.hp = Math.min(t.maxHp, t.hp + heal);
      }
      rep.heal = heal;
    }
    if (sp.kind === 'risk') {
      var cost = Math.round(f.maxHp * 0.12);
      f.hp = Math.max(1, f.hp - cost);
      rep.selfDamage = cost;
    }

    f.charge = 0;
    f.armed = false;
    if (this.mode === 'endless') this.score += rep.damage;

    /* A burst is a free action: it never advances the enemy turn counter,
     * so the number on an enemy card is always the number the player sees. */
    this.retarget();
    this.telegraph();

    var standing = 0;
    for (var s = 0; s < this.enemies.length; s++) if (this.enemies[s].alive) standing++;
    if (standing === 0) this.finishTurn(rep);
    return rep;
  };

  /* ------------------------------------------------------------- state */
  Battle.prototype.teamHpFrac = function () {
    var hp = 0, max = 0;
    for (var i = 0; i < this.team.length; i++) { hp += this.team[i].hp; max += this.team[i].maxHp; }
    return max > 0 ? hp / max : 0;
  };

  Battle.prototype.snapshot = function () {
    var enemies = [];
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      enemies.push({ name: e.name, hp: e.hp, maxHp: e.maxHp, alive: e.alive, timer: e.timer, type: e.type, boss: e.boss });
    }
    var team = [];
    for (var k = 0; k < this.team.length; k++) {
      var f = this.team[k];
      team.push({ name: f.def.name, hp: f.hp, maxHp: f.maxHp, charge: Math.round(f.charge), down: f.down, type: f.def.type });
    }
    return {
      mode: this.mode, stage: this.stageIndex, trial: this.trialIndex,
      turn: this.turn, wave: this.mode === 'endless' ? this.wave : this.waveIndex,
      waves: this.waves.length, over: this.over, won: this.won,
      score: this.score, damage: this.damageDone,
      hp: Math.round(this.teamHpFrac() * 100),
      team: team, enemies: enemies
    };
  };

  KB.Battle = Battle;
  root.KB = KB;
})(typeof window !== 'undefined' ? window : globalThis);
