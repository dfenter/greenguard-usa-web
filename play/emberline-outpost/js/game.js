/* Emberline Outpost - simulation */
(function (EO) {
  'use strict';

  var DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; /* up right down left */
  EO.DIRS = DIRS;

  /* rotate a facing-space offset [forward, side] into grid delta for dir */
  EO.rotFp = function (f, s, dir) {
    switch (dir) {
      case 0: return [s, -f];
      case 1: return [f, s];
      case 2: return [-s, f];
      default: return [-f, -s];
    }
  };

  var G = {
    screen: 'play',       /* play | result | base | maps */
    state: 'prep',        /* prep | wave | won | lost */
    mapIdx: 0,
    L: { ox: 0, oy: 0, tile: 40, w: 390, h: 700, hud: 54, trayY: 0, trayH: 118 },
    paths: [], gate: { x: 0, y: 0 },
    pathSet: null,
    defs: [], enemies: [], shots: [], floats: [],
    parts: null,
    energy: 0, regen: 3.2, leaks: 0, leakCap: 10,
    waves: [], waveIdx: 0, prepT: 0, queue: [], waveActive: false,
    time: 0, kills: 0, score: 0, best: 0,
    shake: 0, flashT: 0, sel: null, hint: true,
    speed: 1, paused: false,
    mods: null, save: null, resultInfo: null,
    trayPage: 0, cursor: { c: 3, r: 4 }, kbDir: 0, kbCard: 0
  };
  EO.G = G;

  EO.cellX = function (c) { return G.L.ox + c * G.L.tile + G.L.tile * 0.5; };
  EO.cellY = function (r) { return G.L.oy + r * G.L.tile + G.L.tile * 0.5; };

  EO.defAt = function (c, r) {
    for (var i = 0; i < G.defs.length; i++) if (G.defs[i].c === c && G.defs[i].r === r) return G.defs[i];
    return null;
  };
  EO.isPath = function (c, r) { return !!(G.pathSet && G.pathSet[c + ',' + r]); };
  EO.buildable = function (c, r) {
    if (c < 0 || r < 0 || c >= EO.COLS || r >= EO.ROWS) return false;
    if (EO.isPath(c, r)) return false;
    if (EO.defAt(c, r)) return false;
    return true;
  };

  EO.computeMods = function (save) {
    var m = { energy: 0, regen: 0, leak: 0, hp: 1, cd: 1, kill: 1 };
    for (var i = 0; i < 4; i++) {
      var id = save.kits[i];
      if (!id) continue;
      if (id === 'cache') m.energy += 12;
      else if (id === 'core') m.regen += 1.2;
      else if (id === 'plate') m.leak += 3;
      else if (id === 'frame') m.hp *= 1.30;
      else if (id === 'kiln') m.cd *= 0.75;
      else if (id === 'rig') m.kill *= 1.40;
    }
    return m;
  };

  /* ---------- start a map ---------- */
  EO.startMap = function (mi) {
    EO.clearTimers();
    mi = EO.clamp(mi | 0, 0, EO.MAPS.length - 1);
    var m = EO.MAPS[mi];
    G.mapIdx = mi;
    G.screen = 'play'; G.state = 'prep';
    G.defs.length = 0; G.enemies.length = 0; G.shots.length = 0; G.floats.length = 0;
    if (!G.parts) G.parts = new EO.Particles(); else G.parts.clear();
    G.mods = EO.computeMods(G.save);
    G.energy = m.energy + G.mods.energy;
    G.regen = m.regen + G.mods.regen;
    G.leaks = 0; G.leakCap = m.leak + G.mods.leak;
    G.waves = EO.buildWaves(mi);
    G.waveIdx = 0; G.queue.length = 0; G.waveActive = false;
    G.prepT = G.waves.length ? G.waves[0].prep : 3;
    G.time = 0; G.kills = 0; G.score = 0;
    G.best = (G.save.best && G.save.best['m' + mi]) || 0;
    G.shake = 0; G.flashT = 0; G.sel = null;
    G.speed = 1; G.paused = false;
    G.hint = !G.save.seen;
    G.trayPage = 0; G.cursor.c = 3; G.cursor.r = EO.ROWS - 2; G.kbDir = 0; G.kbCard = 0;

    /* paths */
    G.paths = [];
    G.pathSet = {};
    for (var p = 0; p < m.paths.length; p++) {
      var cells = EO.expandPath(m.paths[p]);
      var pts = [];
      for (var i = 0; i < cells.length; i++) {
        pts.push({ c: cells[i][0], r: cells[i][1] });
        G.pathSet[cells[i][0] + ',' + cells[i][1]] = 1;
      }
      G.paths.push(pts);
    }
    var last = G.paths[0][G.paths[0].length - 1];
    G.gate = { c: last.c, r: last.r };
  };

  /* ---------- placement ---------- */
  EO.placeDefender = function (id, c, r, dir) {
    var d = EO.DEF_BY_ID[id];
    if (!d) return false;
    if (G.save.unlocked.indexOf(id) < 0) return false;
    if (!EO.buildable(c, r)) { EO.sfx.deny(); return false; }
    if (G.energy < d.cost) { EO.sfx.deny(); EO.float(EO.cellX(c), EO.cellY(r), 'NO CHARGE', '#e05f5f'); return false; }
    if (G.defs.length >= 40) { EO.sfx.deny(); return false; }
    G.energy -= d.cost;
    var hp = Math.round(d.hp * G.mods.hp);
    G.defs.push({
      def: d, c: c, r: r, dir: dir & 3, hp: hp, maxhp: hp,
      cd: 0, skcd: 0, flash: 0, burst: 0, brace: 0, shieldT: 0, born: 0.35, pulse: 0
    });
    EO.sfx.place();
    G.parts.burst(EO.cellX(c), EO.cellY(r), 10, d.col, 90, 3);
    G.hint = false;
    if (!G.save.seen) { G.save.seen = 1; EO.writeSave(G.save); }
    return true;
  };

  EO.recycle = function (dd) {
    var i = G.defs.indexOf(dd);
    if (i < 0) return;
    G.defs.splice(i, 1);
    G.energy += Math.round(dd.def.cost * 0.5);
    G.parts.burst(EO.cellX(dd.c), EO.cellY(dd.r), 10, '#9aa6b2', 80, 3);
    EO.sfx.ui();
    if (G.sel === dd) G.sel = null;
  };

  EO.float = function (x, y, txt, col) {
    if (G.floats.length >= 30) G.floats.shift();
    G.floats.push({ x: x, y: y, t: 0.85, mt: 0.85, s: txt, c: col || '#e8e2d4' });
  };
  function shot(x, y, tx, ty, col, type) {
    if (G.shots.length >= 90) G.shots.shift();
    G.shots.push({ x: x, y: y, tx: tx, ty: ty, t: 0.16, mt: 0.16, c: col, k: type || 0 });
  }

  /* ---------- footprint helpers ---------- */
  EO.fpCells = function (dd) {
    var out = [], fp = dd.def.fp;
    for (var i = 0; i < fp.length; i++) {
      var o = EO.rotFp(fp[i][0], fp[i][1], dd.dir);
      var c = dd.c + o[0], r = dd.r + o[1];
      if (c >= 0 && r >= 0 && c < EO.COLS && r < EO.ROWS) out.push([c, r]);
    }
    return out;
  };
  EO.fpPreview = function (id, c, r, dir) {
    var d = EO.DEF_BY_ID[id]; if (!d) return [];
    var out = [];
    for (var i = 0; i < d.fp.length; i++) {
      var o = EO.rotFp(d.fp[i][0], d.fp[i][1], dir);
      var cc = c + o[0], rr = r + o[1];
      if (cc >= 0 && rr >= 0 && cc < EO.COLS && rr < EO.ROWS) out.push([cc, rr]);
    }
    return out;
  };

  function inFp(dd, e) {
    var cells = EO.fpCells(dd), i;
    if (!e.air) {
      for (i = 0; i < cells.length; i++) if (cells[i][0] === e.cc && cells[i][1] === e.cr) return true;
      return false;
    }
    var t = G.L.tile;
    for (i = 0; i < cells.length; i++) {
      var cx = EO.cellX(cells[i][0]), cy = EO.cellY(cells[i][1]);
      if (Math.abs(e.x - cx) <= t * 0.5 + e.def.r * 0.5 && Math.abs(e.y - cy) <= t * 0.5 + e.def.r * 0.5) return true;
    }
    return false;
  }
  function targetsOf(dd) {
    var tgt = dd.def.tgt, out = [];
    if (tgt === 'n') return out;
    for (var i = 0; i < G.enemies.length; i++) {
      var e = G.enemies[i];
      if (e.dead) continue;
      if (tgt === 'g' && e.air) continue;
      if (tgt === 'a' && !e.air) continue;
      if (inFp(dd, e)) out.push(e);
    }
    /* front-most (furthest along) first */
    out.sort(function (a, b) { return b.prog - a.prog; });
    return out;
  }

  /* ---------- damage ---------- */
  function hurtEnemy(e, amount, col, crit) {
    if (e.dead) return;
    var arm = e.def.armor * (e.oil > 0 ? 0.5 : 1);
    var dmg = Math.max(1, amount - arm);
    e.hp -= dmg;
    e.flash = 0.12;
    if (Math.random() < 0.45) G.parts.burst(e.x, e.y, crit ? 8 : 3, col || '#ffd08a', 70, 2);
    if (e.hp <= 0) killEnemy(e);
    else EO.sfx.hit();
  }
  function killEnemy(e) {
    if (e.dead) return;
    e.dead = true;
    G.kills++;
    var gain = (1.4 + e.maxhp / 34) * G.mods.kill;
    G.energy += gain;
    G.parts.burst(e.x, e.y, 10, e.def.col, 120, 3);
    EO.float(e.x, e.y - 8, '+' + Math.round(gain), '#8fe0a0');
    EO.sfx.die();
  }
  function auraMul(dd) {
    var mul = 1;
    if (dd.brace > 0) mul *= 0.4;
    if (dd.shieldT > 0) mul *= 0.55;
    for (var i = 0; i < G.defs.length; i++) {
      var w = G.defs[i];
      if (w === dd || w.def.id !== 'warden' || w.hp <= 0) continue;
      if (Math.abs(w.c - dd.c) <= 1 && Math.abs(w.r - dd.r) <= 1) { mul *= 0.8; break; }
    }
    return mul;
  }
  function hurtDefender(dd, amount) {
    dd.hp -= amount * auraMul(dd);
    dd.flash = 0.14;
    if (dd.hp <= 0) {
      var i = G.defs.indexOf(dd);
      if (i >= 0) G.defs.splice(i, 1);
      if (G.sel === dd) G.sel = null;
      G.parts.burst(EO.cellX(dd.c), EO.cellY(dd.r), 14, dd.def.col, 130, 4);
      G.shake = Math.max(G.shake, 6);
      EO.sfx.boom();
    }
  }

  /* ---------- spawning ---------- */
  function spawnEnemy(type, pathIdx) {
    if (G.enemies.length >= 90) return;
    var base = EO.ENEMIES[type];
    if (!base) return;
    var s = EO.mapScale(G.mapIdx);
    var hp = Math.round(base.hp * s);
    var e = {
      def: base, air: base.air, hp: hp, maxhp: hp, dead: false,
      slow: 0, stun: 0, root: 0, burn: 0, burnT: 0, oil: 0,
      atkCd: 0, tgt: null, flash: 0, prog: 0, kbcd: 0, rage: 0, cc: 0, cr: 0, x: 0, y: 0
    };
    if (base.air) {
      e.x = G.L.ox + EO.rnd(G.L.tile * 0.6, G.L.tile * (EO.COLS - 0.6));
      e.y = G.L.oy - 26 - EO.rnd(0, 40);
      e.gx = EO.cellX(G.gate.c); e.gy = EO.cellY(G.gate.r);
      e.ph = Math.random() * 6.28;
    } else {
      var pi = EO.clamp(pathIdx | 0, 0, G.paths.length - 1);
      e.path = G.paths[pi]; e.seg = 0; e.u = 0;
      e.x = EO.cellX(e.path[0].c); e.y = EO.cellY(e.path[0].r);
    }
    G.enemies.push(e);
  }

  function updateSpawner(dt) {
    if (G.state !== 'prep' && G.state !== 'wave') return;
    if (G.state === 'prep') {
      G.prepT -= dt;
      if (G.prepT <= 0) {
        if (G.waveIdx >= G.waves.length) return;
        var w = G.waves[G.waveIdx];
        G.queue.length = 0;
        for (var i = 0; i < w.groups.length; i++) {
          var g = w.groups[i];
          for (var n = 0; n < g.count; n++) {
            G.queue.push({ t: g.delay + n * g.gap, type: g.type, path: g.path });
          }
        }
        G.queue.sort(function (a, b) { return a.t - b.t; });
        if (G.queue.length > 200) G.queue.length = 200;
        G.state = 'wave'; G.waveActive = true;
        EO.audio.tone(300, 0.1, 'square', 0.16, 420);
      }
      return;
    }
    /* wave */
    for (var q = 0; q < G.queue.length; q++) G.queue[q].t -= dt;
    while (G.queue.length && G.queue[0].t <= 0) {
      var s = G.queue.shift();
      spawnEnemy(s.type, s.path);
    }
    if (!G.queue.length) {
      var alive = 0;
      for (var e = 0; e < G.enemies.length; e++) if (!G.enemies[e].dead) alive++;
      if (alive === 0) {
        G.waveIdx++;
        if (G.waveIdx >= G.waves.length) { winMap(); }
        else { G.state = 'prep'; G.prepT = G.waves[G.waveIdx].prep; G.energy += 6; EO.float(G.L.w * 0.5, G.L.oy + 30, 'WAVE CLEAR +6', '#8fe0a0'); }
      }
    }
  }

  /* ---------- enemy update ---------- */
  function updateEnemies(dt) {
    var t = G.L.tile;
    for (var i = G.enemies.length - 1; i >= 0; i--) {
      var e = G.enemies[i];
      if (e.dead) { G.enemies.splice(i, 1); continue; }
      if (e.flash > 0) e.flash -= dt;
      if (e.slow > 0) e.slow -= dt;
      if (e.kbcd > 0) e.kbcd -= dt;
      if (e.oil > 0) e.oil -= dt;
      if (e.stun > 0) e.stun -= dt;
      if (e.root > 0) e.root -= dt;
      if (e.burnT > 0) {
        e.burnT -= dt;
        e.hp -= e.burn * dt;
        if (Math.random() < dt * 8) G.parts.add(e.x + EO.rnd(-5, 5), e.y, 0, -30, 0.3, '#ff9a3c', 3, -20);
        if (e.hp <= 0) { killEnemy(e); G.enemies.splice(i, 1); continue; }
      }
      if (e.stun > 0) continue;

      var spdMul = (e.slow > 0 ? 0.55 : 1);

      if (e.air) {
        var dx = e.gx - e.x, dy = e.gy - e.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
        var sp = e.def.spd * t * spdMul;
        e.ph += dt * 3;
        e.x += (dx / d) * sp * dt + Math.cos(e.ph) * 22 * dt;
        e.y += (dy / d) * sp * dt;
        e.prog = 1 - d / 900;
        if (d < t * 0.5) { leak(e); G.enemies.splice(i, 1); continue; }
        continue;
      }

      /* ground: current cell + orthogonally adjacent defenders */
      var cA = e.path[e.seg], cB = e.path[Math.min(e.seg + 1, e.path.length - 1)];
      var near = (e.u < 0.5) ? cA : cB;
      e.cc = near.c; e.cr = near.r;
      if (!e.tgt || e.tgt.hp <= 0 || G.defs.indexOf(e.tgt) < 0) {
        e.tgt = null; e.rage = 0;
        var anchorFound = null;
        for (var k = 0; k < 4; k++) {
          var dd = EO.defAt(e.cc + EO.DIRS[k][0], e.cr + EO.DIRS[k][1]);
          if (!dd) continue;
          if (dd.def.id === 'anchor') { anchorFound = dd; break; }
          if (!e.tgt) e.tgt = dd;
        }
        if (anchorFound) e.tgt = anchorFound;
      }

      if (e.tgt && e.def.dmg > 0) {
        e.atkCd -= dt;
        /* rage: a stalled attacker hits harder so no fight can stalemate forever */
        e.rage = (e.rage || 0) + dt;
        if (e.atkCd <= 0) {
          e.atkCd = 1 / e.def.arate;
          hurtDefender(e.tgt, e.def.dmg * (1 + 0.13 * G.mapIdx) * (1 + Math.min(2.5, e.rage * 0.13)));
          shot(e.x, e.y, EO.cellX(e.tgt.c), EO.cellY(e.tgt.r), '#e05f5f', 1);
        }
        continue;
      }

      if (e.root > 0) continue;

      /* advance along path */
      var move = e.def.spd * spdMul * dt;
      while (move > 0 && e.seg < e.path.length - 1) {
        var need = 1 - e.u;
        if (move >= need) { move -= need; e.seg++; e.u = 0; }
        else { e.u += move; move = 0; }
      }
      if (e.seg >= e.path.length - 1) { leak(e); G.enemies.splice(i, 1); continue; }
      var a = e.path[e.seg], b = e.path[e.seg + 1];
      e.x = EO.lerp(EO.cellX(a.c), EO.cellX(b.c), e.u);
      e.y = EO.lerp(EO.cellY(a.r), EO.cellY(b.r), e.u);
      e.prog = (e.seg + e.u) / e.path.length;
    }
    if (G.enemies.length > 90) G.enemies.splice(0, G.enemies.length - 90);
  }

  function leak(e) {
    G.leaks += e.def.leak;
    G.shake = Math.max(G.shake, 9);
    G.flashT = 0.25;
    G.parts.burst(e.x, e.y, 14, '#e05f5f', 150, 4);
    EO.float(e.x, G.L.oy + G.L.tile * EO.ROWS - 14, '-' + e.def.leak, '#e05f5f');
    EO.sfx.leak();
    if (G.leaks >= G.leakCap) loseMap();
  }

  /* ---------- defender update ---------- */
  function updateDefs(dt) {
    for (var i = 0; i < G.defs.length; i++) {
      var dd = G.defs[i], d = dd.def;
      if (dd.flash > 0) dd.flash -= dt;
      if (dd.born > 0) dd.born -= dt;
      if (dd.brace > 0) dd.brace -= dt;
      if (dd.shieldT > 0) dd.shieldT -= dt;
      if (dd.skcd > 0) dd.skcd -= dt;
      dd.pulse += dt;
      if (d.id === 'scout') G.energy += 0.45 * dt;

      dd.cd -= dt;
      if (dd.burst > 0) {
        dd.burstT -= dt;
        if (dd.burstT <= 0) { dd.burst--; dd.burstT = 0.16; fire(dd, 1.0); }
      }
      if (dd.cd > 0) continue;

      if (d.kind === 'heal') {
        var healed = false;
        var cells = EO.fpCells(dd);
        for (var c = 0; c < cells.length; c++) {
          var t2 = EO.defAt(cells[c][0], cells[c][1]);
          if (t2 && t2.hp < t2.maxhp) {
            t2.hp = Math.min(t2.maxhp, t2.hp + 14);
            G.parts.add(EO.cellX(t2.c), EO.cellY(t2.r) - 6, EO.rnd(-14, 14), -34, 0.5, '#8fe0a0', 3, -8);
            healed = true;
          }
        }
        dd.cd = 1 / d.rate;
        if (healed) EO.audio.tone(760, 0.05, 'sine', 0.05);
        continue;
      }
      var tg = targetsOf(dd);
      if (!tg.length) { dd.cd = 0.08; continue; }
      dd.cd = 1 / d.rate;
      fire(dd, 1.0, tg);
    }
  }

  function fire(dd, mul, tg) {
    var d = dd.def;
    tg = tg || targetsOf(dd);
    if (!tg.length) return;
    var sx = EO.cellX(dd.c), sy = EO.cellY(dd.r);
    var dmg = d.dmg * mul;
    if (d.kind === 'melee' || d.kind === 'single') {
      var e = tg[0];
      hurtEnemy(e, dmg, d.col, mul > 1.5);
      shot(sx, sy, e.x, e.y, d.col, d.kind === 'single' ? 2 : 0);
    } else if (d.kind === 'pierce') {
      for (var i = 0; i < tg.length; i++) { hurtEnemy(tg[i], dmg, d.col); }
      var lastp = tg[tg.length - 1];
      shot(sx, sy, lastp.x, lastp.y, d.col, 2);
    } else if (d.kind === 'chain') {
      for (var j = 0; j < Math.min(3, tg.length); j++) {
        hurtEnemy(tg[j], dmg, d.col);
        shot(j === 0 ? sx : tg[j - 1].x, j === 0 ? sy : tg[j - 1].y, tg[j].x, tg[j].y, d.col, 3);
      }
    } else if (d.kind === 'splash') {
      var c0 = tg[0];
      var rad = G.L.tile * 0.85;
      for (var k = 0; k < tg.length; k++) {
        if (EO.dist2(tg[k].x, tg[k].y, c0.x, c0.y) <= rad * rad) hurtEnemy(tg[k], dmg, d.col);
      }
      G.parts.burst(c0.x, c0.y, 8, '#ffb454', 110, 3);
      shot(sx, sy, c0.x, c0.y, d.col, 4);
      EO.audio.tone(180, 0.08, 'sine', 0.09, 90);
      return;
    } else if (d.kind === 'slow') {
      for (var m = 0; m < tg.length; m++) {
        hurtEnemy(tg[m], dmg, d.col);
        tg[m].slow = 1.2; tg[m].oil = 4.0;
      }
      return;
    } else if (d.kind === 'shove') {
      for (var n = 0; n < tg.length; n++) {
        var e2 = tg[n];
        hurtEnemy(e2, dmg, d.col);
        /* knockback is rate-limited so nothing can be shoved in place forever */
        if (!e2.air && (e2.kbcd || 0) <= 0) {
          e2.kbcd = 1.1;
          var back = 0.5;
          while (back > 0) {
            if (e2.u >= back) { e2.u -= back; back = 0; }
            else if (e2.seg > 0) { back -= e2.u; e2.seg--; e2.u = 1; }
            else { e2.u = 0; back = 0; }
          }
        }
      }
      shot(sx, sy, tg[0].x, tg[0].y, d.col, 0);
    }
    EO.sfx.shot();
  }

  /* ---------- skills ---------- */
  EO.useSkill = function (dd) {
    if (!dd || dd.skcd > 0) { EO.sfx.deny(); return false; }
    var d = dd.def;
    dd.skcd = d.skill.cd * G.mods.cd;
    var tg = targetsOf(dd), i;
    var cx = EO.cellX(dd.c), cy = EO.cellY(dd.r);
    G.parts.burst(cx, cy, 14, d.col, 150, 4);
    EO.sfx.skill();
    EO.float(cx, cy - 18, d.skill.name, d.col);
    switch (d.id) {
      case 'blocker':
        dd.hp = Math.min(dd.maxhp, dd.hp + dd.maxhp * 0.4); dd.brace = 4; break;
      case 'pike':
        for (i = 0; i < tg.length; i++) hurtEnemy(tg[i], d.dmg * 3, d.col, true);
        break;
      case 'arcer':
        dd.burst = 4; dd.burstT = 0.05; break;
      case 'sparker':
        for (i = 0; i < tg.length; i++) { hurtEnemy(tg[i], d.dmg * 1.5, d.col, true); tg[i].stun = 1.6; }
        break;
      case 'medic':
        for (i = 0; i < G.defs.length; i++) {
          var a = G.defs[i];
          a.hp = Math.min(a.maxhp, a.hp + a.maxhp * 0.35);
          G.parts.add(EO.cellX(a.c), EO.cellY(a.r), EO.rnd(-20, 20), -50, 0.6, '#8fe0a0', 3, -10);
        }
        break;
      case 'sniper':
        for (i = 0; i < tg.length; i++) hurtEnemy(tg[i], d.dmg * 4, d.col, true);
        if (tg.length) shot(cx, cy, tg[tg.length - 1].x, tg[tg.length - 1].y, '#ffffff', 2);
        break;
      case 'oiler':
        for (i = 0; i < G.enemies.length; i++) {
          var e = G.enemies[i];
          if (e.oil > 0 && !e.dead) { e.burn = 14; e.burnT = 3; }
        }
        break;
      case 'warden':
        for (i = 0; i < G.defs.length; i++) G.defs[i].shieldT = 5;
        for (i = 0; i < tg.length; i++) {
          var e3 = tg[i];
          hurtEnemy(e3, d.dmg * 2, d.col);
          if (!e3.air) { var bk = 1.2; while (bk > 0) { if (e3.u >= bk) { e3.u -= bk; bk = 0; } else if (e3.seg > 0) { bk -= e3.u; e3.seg--; e3.u = 1; } else { e3.u = 0; bk = 0; } } }
        }
        break;
      case 'scout':
        G.energy += 16; EO.float(cx, cy - 30, '+16', '#8fe0a0'); break;
      case 'anchor':
        for (i = 0; i < tg.length; i++) if (!tg[i].air) tg[i].root = 2.6;
        break;
    }
    G.shake = Math.max(G.shake, 4);
    return true;
  };

  /* ---------- end states ---------- */
  function winMap() {
    G.state = 'won';
    var timeBonus = Math.max(0, Math.round(1200 - G.time * 4));
    G.score = G.kills * 12 + (G.leakCap - G.leaks) * 140 + timeBonus;
    var first = (G.save.cleared === G.mapIdx);
    var mats = EO.matsFor(G.mapIdx, first);
    G.save.mats.scrap = Math.min(99999, G.save.mats.scrap + mats.scrap);
    G.save.mats.ember = Math.min(99999, G.save.mats.ember + mats.ember);
    G.save.mats.alloy = Math.min(99999, G.save.mats.alloy + mats.alloy);
    var newDefs = [];
    if (first) {
      G.save.cleared = G.mapIdx + 1;
      var ul = EO.UNLOCKS[G.mapIdx] || [];
      for (var i = 0; i < ul.length; i++) {
        if (G.save.unlocked.indexOf(ul[i]) < 0) { G.save.unlocked.push(ul[i]); newDefs.push(ul[i]); }
      }
    }
    var key = 'm' + G.mapIdx;
    var rec = false;
    if (!G.save.best[key] || G.score > G.save.best[key]) { G.save.best[key] = G.score; rec = true; }
    EO.writeSave(G.save);
    G.resultInfo = { win: true, mats: mats, newDefs: newDefs, record: rec, final: (G.mapIdx === EO.MAPS.length - 1) };
    G.shake = 8;
    EO.sfx.win();
    EO.after(700, function () { if (G.state === 'won') G.screen = 'result'; });
  }
  function loseMap() {
    if (G.state === 'lost') return;
    G.state = 'lost';
    G.score = G.kills * 12;
    G.resultInfo = { win: false, mats: null, newDefs: [], record: false, final: false };
    G.shake = 14;
    EO.sfx.lose();
    EO.after(800, function () { if (G.state === 'lost') G.screen = 'result'; });
  }
  EO.winMap = winMap;

  /* ---------- main update ---------- */
  EO.update = function (dt) {
    if (G.screen !== 'play') { if (G.parts) G.parts.update(dt); return; }
    if (G.paused) return;
    var sdt = dt * G.speed;
    if (G.state === 'prep' || G.state === 'wave') {
      G.time += sdt;
      G.energy += G.regen * sdt;
      if (G.energy > 999) G.energy = 999;
      updateSpawner(sdt);
      updateEnemies(sdt);
      updateDefs(sdt);
    } else {
      updateEnemies(sdt * 0.35);
    }
    /* shots */
    for (var i = G.shots.length - 1; i >= 0; i--) {
      G.shots[i].t -= dt;
      if (G.shots[i].t <= 0) G.shots.splice(i, 1);
    }
    for (var f = G.floats.length - 1; f >= 0; f--) {
      var fl = G.floats[f];
      fl.t -= dt; fl.y -= 26 * dt;
      if (fl.t <= 0) G.floats.splice(f, 1);
    }
    G.parts.update(dt);
    if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 26);
    if (G.flashT > 0) G.flashT -= dt;
  };

})(window.EO);
