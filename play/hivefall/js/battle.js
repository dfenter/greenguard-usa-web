/* Hivefall - battle half: swarm waves, wall, lane-mapped shots */
(function (w) {
  'use strict';
  var HF = w.HF;

  var MAX_ENEMIES = 64, MAX_SHOTS = 90;

  var KINDS = [
    { id: 0, name: 'MITE',   hp: 16,  spd: 26, r: 11, dmg: 5,  col: '#8ad06a', coin: 2 },
    { id: 1, name: 'HUSK',   hp: 50,  spd: 15, r: 17, dmg: 13, col: '#c98a4b', coin: 5 },
    { id: 2, name: 'DARTER', hp: 22,  spd: 44, r: 10, dmg: 6,  col: '#6ac6d0', coin: 3 },
    { id: 3, name: 'BROOD',  hp: 300, spd: 9,  r: 25, dmg: 38, col: '#d05a8a', coin: 40 }
  ];
  HF.KINDS = KINDS;

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /* deterministic wave script for a fight number (1..20) */
  HF.genWave = function (f, lanes) {
    var rng = mulberry32(9176 + f * 7919);
    var list = [], t = 1.2;
    var n = Math.min(46, 7 + Math.round(f * 1.7));
    var gap = HF.clamp(1.55 - f * 0.035, 0.52, 1.55);
    var boss = (f === 10 || f === 15 || f === 20);
    for (var i = 0; i < n; i++) {
      var roll = rng(), k = 0;
      if (f >= 3 && roll > 0.72) k = 2;
      if (f >= 4 && roll < 0.22 + Math.min(0.2, f * 0.012)) k = 1;
      list.push({ t: t, kind: k, lane: Math.floor(rng() * lanes) });
      t += gap * (0.55 + rng() * 0.9);
      if (f >= 6 && rng() > 0.86) { /* paired spawn */
        list.push({ t: t - 0.12, kind: k, lane: Math.floor(rng() * lanes) });
      }
    }
    if (boss) list.push({ t: 4 + n * gap * 0.34, kind: 3, lane: Math.floor(lanes / 2) });
    list.sort(function (a, b) { return a.t - b.t; });
    return { list: list, boss: boss, count: list.length, dur: t };
  };

  HF.waveSummary = function (wave) {
    var c = [0, 0, 0, 0];
    for (var i = 0; i < wave.list.length; i++) c[wave.list[i].kind]++;
    return c;
  };

  /* ---------- Battle ---------- */
  function Battle() {
    this.enemies = []; this.shots = []; this.lanes = 6;
    this.reset(1, { dmg: 0, slow: 0, wall: 0, coin: 0 }, 6);
  }

  Battle.prototype.wallMax = function (gear) { return 130 + gear.wall * 60; };

  Battle.prototype.reset = function (fight, gear, lanes) {
    this.lanes = lanes || 6;
    this.fight = fight;
    this.gear = gear;
    this.enemies.length = 0;
    this.shots.length = 0;
    this.wave = HF.genWave(fight, this.lanes);
    this.queue = this.wave.list.slice();
    this.qi = 0;
    this.time = 0;
    this.hpMul = 1 + 0.17 * (fight - 1);
    this.spdMul = 1 + 0.018 * (fight - 1);
    this.wallHpMax = this.wallMax(gear);
    this.wallHp = this.wallHpMax;
    this.shake = 0;
    this.flashLane = new Array(this.lanes);
    for (var i = 0; i < this.lanes; i++) this.flashLane[i] = 0;
    this.over = 0; /* 0 running, 1 won, -1 lost */
    this.killCount = 0;
    this.coins = 0;
  };

  Battle.prototype.dmgMul = function () { return 1 + 0.42 * this.gear.dmg; };
  Battle.prototype.slowFactor = function () { return Math.max(0.22, 0.66 - 0.055 * this.gear.slow); };
  Battle.prototype.slowTime = function () { return 2.0 + 0.45 * this.gear.slow; };
  Battle.prototype.coinMul = function () { return 1 + 0.45 * this.gear.coin; };

  /* fire from a matched gem: col = lane, gem type index */
  Battle.prototype.fire = function (col, type, power, splash, pierce, L) {
    if (col < 0 || col >= this.lanes) return;
    this.flashLane[col] = 0.35;
    var x = L.bx + (col + 0.5) * L.cell;
    if (type === 2) { /* green: repair */
      var heal = Math.round(3.2 * power);
      this.wallHp = Math.min(this.wallHpMax, this.wallHp + heal);
      HF.fx.text(x, L.wallY - 8, '+' + heal, '#7fe08a');
      HF.fx.burst(x, L.wallY, '#7fe08a', 5, 90, 0.4);
      HF.audio.sfx('repair');
      return;
    }
    if (type === 3) { /* gold: coins */
      var got = Math.max(1, Math.round(1.4 * power * this.coinMul()));
      this.coins += got;
      HF.fx.text(x, L.wallY - 14, '+' + got + 'c', '#ffd15c');
      HF.audio.sfx('coin');
      return;
    }
    if (this.shots.length >= MAX_SHOTS) this.shots.shift();
    this.shots.push({
      lane: col, x: x, y: L.wallY - 6,
      vy: -(type === 1 ? 430 : (type === 4 ? 360 : 520)),
      kind: type,
      dmg: (type === 1 ? 5 : (type === 4 ? 7 : 20)) * power * this.dmgMul(),
      splash: !!splash, pierce: !!pierce, hits: [], life: 3
    });
    HF.audio.sfx('shoot');
  };

  Battle.prototype.spawn = function (kind, lane, L) {
    if (this.enemies.length >= MAX_ENEMIES) return;
    var K = KINDS[kind];
    var hp = K.hp * this.hpMul;
    this.enemies.push({
      kind: kind, lane: lane,
      x: L.bx + (lane + 0.5) * L.cell,
      y: L.btop - 20 - Math.random() * 14,
      hp: hp, max: hp, spd: K.spd * this.spdMul * (0.9 + Math.random() * 0.2),
      r: K.r, slow: 0, ven: 0, venDps: 0, flash: 0, wob: Math.random() * 6.28, dead: false
    });
  };

  Battle.prototype.hurt = function (e, d, L, col) {
    e.hp -= d; e.flash = 0.12;
    if (e.hp <= 0 && !e.dead) {
      e.dead = true;
      this.killCount++;
      var K = KINDS[e.kind];
      var got = Math.max(1, Math.round(K.coin * this.coinMul() * 0.5));
      this.coins += got;
      HF.fx.burst(e.x, e.y, K.col, e.kind === 3 ? 26 : 9, 190, 0.55);
      if (e.kind === 3) { this.shake = Math.max(this.shake, 9); HF.fx.text(e.x, e.y, 'BROOD DOWN', '#ffd15c'); }
      HF.audio.sfx('kill');
    } else {
      HF.fx.burst(e.x, e.y, col || '#ffffff', 3, 110, 0.28);
      HF.audio.sfx('hit');
    }
  };

  Battle.prototype.update = function (dt, L) {
    if (this.over) return;
    var i, j, e, s;
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt * 22);
    for (i = 0; i < this.lanes; i++) if (this.flashLane[i] > 0) this.flashLane[i] -= dt;

    /* spawns */
    while (this.qi < this.queue.length && this.queue[this.qi].t <= this.time) {
      var q = this.queue[this.qi++];
      this.spawn(q.kind, q.lane, L);
    }

    /* shots */
    var ks = 0;
    for (i = 0; i < this.shots.length; i++) {
      s = this.shots[i];
      s.y += s.vy * dt; s.life -= dt;
      var alive = s.y > L.btop - 30 && s.life > 0;
      if (alive) {
        for (j = 0; j < this.enemies.length; j++) {
          e = this.enemies[j];
          if (e.dead) continue;
          var laneOk = s.splash ? Math.abs(e.lane - s.lane) <= 1 : e.lane === s.lane;
          if (!laneOk) continue;
          if (s.hits.indexOf(e) >= 0) continue;
          if (Math.abs(e.y - s.y) > e.r + 8) continue;
          var mult = (s.splash && e.lane !== s.lane) ? 0.5 : 1;
          if (s.kind === 1) {
            e.slow = this.slowTime();
            HF.fx.burst(e.x, e.y, '#7fd8ff', 6, 120, 0.4);
            HF.audio.sfx('frost');
          } else if (s.kind === 4) {
            e.venDps = Math.max(e.venDps, s.dmg * 0.75);
            e.ven = 3.2;
            HF.fx.burst(e.x, e.y, '#c48aff', 5, 110, 0.4);
            HF.audio.sfx('venom');
          }
          this.hurt(e, s.dmg * mult, L, s.kind === 1 ? '#7fd8ff' : (s.kind === 4 ? '#c48aff' : '#ff9b5c'));
          s.hits.push(e);
          if (s.hits.length > 12) s.hits.shift();
          if (!s.pierce) { alive = false; break; }
        }
      }
      if (alive) this.shots[ks++] = s;
    }
    this.shots.length = ks;

    /* enemies */
    var ke = 0;
    for (i = 0; i < this.enemies.length; i++) {
      e = this.enemies[i];
      if (e.dead) continue;
      if (e.flash > 0) e.flash -= dt;
      if (e.slow > 0) e.slow -= dt;
      if (e.ven > 0) {
        e.ven -= dt;
        e.hp -= e.venDps * dt;
        if (Math.random() < dt * 8) HF.fx.burst(e.x, e.y, '#c48aff', 1, 40, 0.3);
        if (e.hp <= 0) { this.hurt(e, 0.01, L, '#c48aff'); continue; }
      }
      e.wob += dt * 5;
      e.y += e.spd * (e.slow > 0 ? this.slowFactor() : 1) * dt;
      if (e.y + e.r >= L.wallY) {
        var d = KINDS[e.kind].dmg * (1 + 0.10 * (this.fight - 1));
        this.wallHp -= d;
        this.shake = Math.min(14, this.shake + 5);
        HF.fx.burst(e.x, L.wallY, '#ff5c5c', 12, 170, 0.5);
        HF.fx.text(e.x, L.wallY + 14, '-' + Math.round(d), '#ff8a8a');
        HF.audio.sfx('wall');
        e.dead = true;
        if (this.wallHp <= 0) { this.wallHp = 0; this.over = -1; }
        continue;
      }
      this.enemies[ke++] = e;
    }
    this.enemies.length = ke;

    if (!this.over && this.qi >= this.queue.length && this.enemies.length === 0) this.over = 1;
  };

  /* ---------- draw ---------- */
  Battle.prototype.draw = function (g, L) {
    var i, e, s;
    /* field backdrop */
    g.fillStyle = '#0e141c';
    g.fillRect(0, L.btop, L.W, L.wallY - L.btop);
    /* lanes */
    for (i = 0; i < this.lanes; i++) {
      var x = L.bx + i * L.cell;
      g.fillStyle = (i % 2) ? 'rgba(255,255,255,0.022)' : 'rgba(255,255,255,0.05)';
      g.fillRect(x, L.btop, L.cell, L.wallY - L.btop);
      if (this.flashLane[i] > 0) {
        g.fillStyle = 'rgba(255,209,92,' + (this.flashLane[i] * 0.35).toFixed(3) + ')';
        g.fillRect(x, L.btop, L.cell, L.wallY - L.btop);
      }
    }
    /* hive line at top */
    g.fillStyle = '#1b2430';
    g.fillRect(0, L.btop, L.W, 6);
    g.fillStyle = '#33415a';
    for (i = 0; i < this.lanes; i++) {
      g.fillRect(L.bx + i * L.cell + 3, L.btop, L.cell - 6, 3);
    }

    /* shots */
    for (i = 0; i < this.shots.length; i++) {
      s = this.shots[i];
      var sc = s.kind === 1 ? '#7fd8ff' : (s.kind === 4 ? '#c48aff' : '#ffb35c');
      g.fillStyle = sc;
      var wdt = s.splash ? 8 : 5, hgt = s.pierce ? 20 : 12;
      g.fillRect(s.x - wdt / 2, s.y - hgt / 2, wdt, hgt);
      g.globalAlpha = 0.35;
      g.fillRect(s.x - wdt / 2, s.y, wdt, hgt * 1.4);
      g.globalAlpha = 1;
    }

    /* enemies */
    for (i = 0; i < this.enemies.length; i++) {
      e = this.enemies[i];
      var K = HF.KINDS[e.kind];
      var wob = Math.sin(e.wob) * (e.kind === 2 ? 3.5 : 1.5);
      var cx = e.x + wob, cy = e.y;
      g.fillStyle = e.flash > 0 ? '#ffffff' : K.col;
      g.beginPath();
      g.moveTo(cx, cy - e.r);
      g.lineTo(cx + e.r * 0.92, cy - e.r * 0.3);
      g.lineTo(cx + e.r * 0.62, cy + e.r * 0.85);
      g.lineTo(cx - e.r * 0.62, cy + e.r * 0.85);
      g.lineTo(cx - e.r * 0.92, cy - e.r * 0.3);
      g.closePath(); g.fill();
      /* eyes */
      g.fillStyle = 'rgba(10,14,20,0.85)';
      g.fillRect(cx - e.r * 0.45, cy - e.r * 0.1, e.r * 0.3, e.r * 0.22);
      g.fillRect(cx + e.r * 0.15, cy - e.r * 0.1, e.r * 0.3, e.r * 0.22);
      if (e.slow > 0) {
        g.strokeStyle = '#7fd8ff'; g.lineWidth = 2;
        g.strokeRect(cx - e.r, cy - e.r, e.r * 2, e.r * 2);
      }
      if (e.ven > 0) { g.fillStyle = 'rgba(196,138,255,0.28)'; g.fillRect(cx - e.r, cy - e.r, e.r * 2, e.r * 2); }
      /* hp bar */
      if (e.hp < e.max) {
        var bw = e.r * 2;
        g.fillStyle = '#000'; g.fillRect(cx - e.r, cy - e.r - 7, bw, 4);
        g.fillStyle = '#ff6b6b';
        g.fillRect(cx - e.r, cy - e.r - 7, bw * HF.clamp(e.hp / e.max, 0, 1), 4);
      }
    }
  };

  w.HF.Battle = Battle;
})(window);
