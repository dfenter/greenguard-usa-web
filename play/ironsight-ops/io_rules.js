/* Ironsight Ops - io_rules.js
 * Gameplay rules on top of io_sim: mission setup, ballistics, hostile
 * behaviour, ordnance, the objective machine and scoring. Still no Phaser
 * object anywhere: this layer speaks only in sim records and frame events.
 */
var IORules = (function () {
  'use strict';

  var C = IOContent, K = IOSim;
  var S = K.state, P = S.player;
  var CELL = K.CELL, TAU = Math.PI * 2;
  var clamp = K.clamp;

  /* ------------------------------------------------------- utilities */
  function rand() { return Math.random(); }
  function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
  function freeEnt() {
    for (var i = 0; i < S.ents.length; i++) if (!S.ents[i].active) return S.ents[i];
    return null;
  }
  function weaponOf(who) {
    if (who === P) return C.weapon(P.current === 'primary' ? P.primary : P.secondary);
    return C.weapon(who.weapon);
  }
  function currentWeaponId() { return P.current === 'primary' ? P.primary : P.secondary; }

  /* ------------------------------------------------------ level setup */
  function buildLevel(theatreId, startCell) {
    var th = C.theatre(theatreId);
    S.theatre = th;
    K.applyOps(th);
    var sc = startCell || th.start;
    K.computeReach(sc[0], sc[1]);
    K.buildCoverSpots();
    var sp = K.snapPoint(sc[0], sc[1]);
    P.x = sp.x; P.y = sp.y;
    S.spawnPoints.length = 0;
    for (var i = 0; i < th.spawns.length; i++) {
      var p = K.snapPoint(th.spawns[i][0], th.spawns[i][1]);
      S.spawnPoints.push(p);
    }
    K.refreshFlow();
    S.flowT = 0;
  }

  function resetPools() {
    var i;
    for (i = 0; i < S.ents.length; i++) { S.ents[i].active = false; S.ents[i].alive = false; }
    for (i = 0; i < S.tracers.length; i++) S.tracers[i].active = false;
    for (i = 0; i < S.ord.length; i++) S.ord[i].active = false;
    for (i = 0; i < S.smokes.length; i++) S.smokes[i].active = false;
    for (i = 0; i < S.intel.length; i++) { S.intel[i].active = false; S.intel[i].taken = false; }
    S.enemiesAlive = 0;
  }

  function resetPlayer(loadout) {
    P.hp = P.maxHp; P.alive = true; P.hurtT = 0; P.regenT = 0;
    P.anim = 'idle'; P.legAnim = 'stand'; P.animT = 0; P.lean = 0;
    P.vaultT = 0; P.reloadT = 0; P.raiseT = 0; P.bloom = 0; P.fireCd = 0;
    P.recoil = 0; P.shots = 0; P.hits = 0; P.kills = 0; P.firing = false;
    P.primary = loadout.primary; P.secondary = loadout.secondary;
    P.gadget = loadout.gadget; P.current = 'primary';
    P.mag = {}; P.reserve = {};
    var ids = [P.primary, P.secondary];
    for (var i = 0; i < ids.length; i++) {
      var w = C.weapon(ids[i]);
      P.mag[ids[i]] = w.mag;
      P.reserve[ids[i]] = w.reserve;
    }
    P.charges = C.gadget(P.gadget).charges;
    P.breachCharges = 2;
  }

  /* ------------------------------------------------------- spawning */
  function spawnEnemy(kindId, x, y) {
    var e = freeEnt();
    if (!e) return null;
    var def = C.enemy(kindId);
    e.active = true; e.alive = true; e.civ = false; e.team = 'foe';
    e.kind = def.id; e.inert = !!def.inert;
    e.x = x; e.y = y; e.vx = 0; e.vy = 0; e.r = 11;
    e.maxHp = Math.round(def.hp * (0.8 + S.difficulty * 0.35));
    e.hp = e.maxHp;
    e.speed = def.speed; e.weapon = def.weapon; e.score = def.score;
    e.accuracy = clamp(def.accuracy * (0.65 + S.difficulty * 0.5), 0.1, 0.95);
    e.shield = def.shield || 0;
    e.angle = Math.atan2(P.y - y, P.x - x);
    e.moveAngle = e.angle;
    e.fireCd = def.react + rand() * 0.4;
    e.burst = 0; e.think = rand() * 0.25; e.react = def.react;
    e.suppress = 0; e.flinch = 0; e.blind = 0; e.hurtT = 0; e.deadT = 0;
    e.hasGoal = false; e.targetSeen = false; e.anim = 'idle'; e.animT = rand();
    e.spawnT = 0.35; e.marked = 0; e.followIdx = -1; e.escort = false;
    e.moveMag = 0;
    if (!e.inert) S.enemiesAlive++;
    K.emit('spawn', x, y, 0, 0, def.tint);
    return e;
  }
  function spawnSquad(kindId, count, nearAnchor) {
    var base = nearAnchor ? C.anchor(S.theatre.id, nearAnchor) : null;
    var placed = 0;
    var order = pickSpawnOrder(base);
    for (var i = 0; i < order.length && placed < count; i++) {
      var p = order[i];
      if (dist(p.x, p.y, P.x, P.y) < 190) continue;      // never in the player's lap
      var jitter = placed % 3;
      var e = spawnEnemy(kindId, p.x + (jitter - 1) * 14, p.y + ((placed % 2) ? 12 : -12));
      if (e) placed++;
    }
    while (placed < count) {
      var f = S.spawnPoints[(placed * 3) % S.spawnPoints.length];
      if (!f) break;
      if (!spawnEnemy(kindId, f.x, f.y)) break;
      placed++;
    }
    return placed;
  }
  function pickSpawnOrder(base) {
    var list = S.spawnPoints.slice(0);
    if (base) {
      list.sort(function (a, b) {
        return dist(a.x, a.y, base.x, base.y) - dist(b.x, b.y, base.x, base.y);
      });
    }
    return list;
  }
  function spawnCiv(kindId, x, y) {
    var e = freeEnt();
    if (!e) return null;
    e.active = true; e.alive = true; e.civ = true; e.team = 'us';
    e.kind = kindId; e.inert = true; e.escort = true;
    e.x = x; e.y = y; e.r = 10; e.hp = 120; e.maxHp = 120;
    e.speed = 118; e.angle = 0; e.anim = 'idle'; e.animT = 0;
    e.hurtT = 0; e.deadT = 0; e.suppress = 0; e.flinch = 0; e.blind = 0;
    e.spawnT = 0; e.marked = 0; e.moveMag = 0;
    return e;
  }
  function spawnIntelAt(anchors) {
    var placed = 0;
    for (var i = 0; i < anchors.length && placed < S.intel.length; i++) {
      var a = C.anchor(S.theatre.id, anchors[i]);
      var slot = S.intel[placed];
      var sp = K.snapPoint(a.x / CELL, a.y / CELL);
      slot.active = true; slot.taken = false; slot.x = sp.x; slot.y = sp.y; slot.phase = placed * 0.7;
      placed++;
    }
    return placed;
  }

  /* --------------------------------------------------------- mission */
  function startMission(mode, missionIndex, loadout) {
    S.mode = mode;
    S.result = '';
    S.score = 0; S.timeElapsed = 0; S.simT = 0;
    S.stageIndex = 0; S.stageT = 0; S.stageProgress = 0; S.stageDone = false;
    S.holdT = 0; S.clearCount = 0; S.intelTaken = 0; S.rescued = 0;
    S.reinforceT = 0; S.wave = 0; S.waveT = 0; S.targetsLeft = 0; S.trialT = 0;
    resetPools();

    if (mode === 'campaign') {
      var mi = clamp(missionIndex | 0, 0, C.MISSIONS.length - 1);
      S.missionIndex = mi;
      S.mission = C.mission(mi);
      S.difficulty = S.mission.difficulty;
      buildLevel(S.mission.theatre, null);
      resetPlayer(loadout);
      S.intelNeeded = S.mission.intel || 0;
      spawnIntelAt(S.mission.intelAt || []);
      S.stage = S.mission.stages[0];
      beginStage();
    } else if (mode === 'survival') {
      S.mission = null;
      S.missionIndex = -1;
      S.difficulty = C.SURVIVAL.difficulty(1);
      buildLevel(C.SURVIVAL.theatre, C.SURVIVAL.start);
      resetPlayer(loadout);
      S.intelNeeded = 0;
      S.stage = { kind: 'survival', icon: 'skull', text: 'Hold the warehouse' };
      S.wave = 0; S.waveT = 2.0;
    } else {
      S.mission = null;
      S.missionIndex = -1;
      S.difficulty = 0.5;
      buildLevel(C.TRIAL.theatre, C.TRIAL.start);
      resetPlayer(loadout);
      S.intelNeeded = 0;
      S.stage = { kind: 'trial', icon: 'clear', text: 'Drop every target' };
      S.targetsLeft = C.TRIAL.targets;
      spawnTargets(C.TRIAL.batch);
    }
    S.running = true;
    K.refreshFlow();
    return S.stage;
  }

  function beginStage() {
    var st = S.stage;
    S.stageT = 0; S.stageProgress = 0; S.stageDone = false;
    S.holdT = 0; S.reinforceT = 0;
    S.clearCount = 0;
    if (!st) return;
    if (st.spawn) {
      for (var i = 0; i < st.spawn.length; i++) {
        spawnSquad(st.spawn[i].kind, st.spawn[i].n, st.spawn[i].near);
      }
    }
    if (st.kind === 'rescue') S.rescueNeeded = st.count || 1;
    K.emit('stage', 0, 0, S.stageIndex, 0, 0, st.text || '');
  }

  function advanceStage() {
    S.stageIndex++;
    if (!S.mission || S.stageIndex >= S.mission.stages.length) {
      finish('complete');
      return;
    }
    S.stage = S.mission.stages[S.stageIndex];
    beginStage();
    K.emit('sfx', 0, 0, 0, 0, 0, 'objective');
  }

  function finish(result) {
    if (!S.running) return;
    S.running = false;
    S.result = result;
    K.emit('finish', 0, 0, 0, 0, 0, result);
  }

  function spawnTargets(n) {
    var order = C.TRIAL.order;
    for (var i = 0; i < n && S.targetsLeft > 0; i++) {
      var a = C.anchor(C.TRIAL.theatre, order[(S.trialSpawned = (S.trialSpawned || 0) + 1) % order.length]);
      var sp = K.snapPoint(a.x / CELL + (i % 3) - 1, a.y / CELL + (i % 2 ? 1 : -1));
      spawnEnemy('target', sp.x, sp.y);
    }
  }

  /* -------------------------------------------------------- ballistics */
  /* One hitscan ray. Solid cover stops it, penetrable cover taxes it and
   * lets it through, glass shatters, barrels cook off, and every hostile
   * the ray passes close to takes suppression whether or not it connects. */
  function castRay(ox, oy, ang, w, fromPlayer, shooter, dmgScale) {
    var dx = Math.cos(ang), dy = Math.sin(ang);
    var dmg = w.damage * (dmgScale == null ? 1 : dmgScale);
    var x = ox, y = oy, lastCell = -1;
    var step = 5, travelled = 0;
    var hitEnt = null, hitX = ox, hitY = oy, hitKind = 'none';
    while (travelled <= w.range) {
      x += dx * step; y += dy * step; travelled += step;
      var cx = x / CELL | 0, cy = y / CELL | 0;
      if (cx < 0 || cy < 0 || cx >= K.COLS || cy >= K.ROWS) { hitKind = 'wall'; break; }
      var ci = K.idx(cx, cy), cv = S.grid[ci];
      if (ci !== lastCell) {
        lastCell = ci;
        if (cv === K.WALL) { hitKind = 'wall'; break; }
        if (cv === K.DOOR) { damageCell(ci, dmg * 0.5); hitKind = 'wall'; break; }
        if (cv === K.GLASS) {
          damageCell(ci, dmg);
          K.emit('glass', cx * CELL + CELL * 0.5, cy * CELL + CELL * 0.5, 0, 0, 0xbfe9ff);
        } else if (cv === K.CRATE) {
          damageCell(ci, dmg);
          K.emit('splinter', x, y, ang, 0, 0xc79a5c);
          dmg *= w.pierce;
          if (dmg < 2) { hitKind = 'cover'; break; }
        }
      }
      /* barrels */
      for (var b = 0; b < S.barrels.length; b++) {
        var br = S.barrels[b];
        if (!br.alive) continue;
        var bxp = br.cx * CELL + CELL * 0.5, byp = br.cy * CELL + CELL * 0.5;
        if (dist(x, y, bxp, byp) < 15) {
          br.hp -= dmg;
          if (br.hp <= 0) { br.alive = false; explode(bxp, byp, 96, 92, fromPlayer, true); }
          else K.emit('impact', x, y, ang, 0, 0xffa96b);
          hitKind = 'barrel'; hitX = x; hitY = y;
          travelled = w.range + 1;
          break;
        }
      }
      if (hitKind === 'barrel') break;
      /* bodies, sampled every fourth step */
      if ((travelled % 20) < step) {
        for (var i = 0; i < S.ents.length; i++) {
          var e = S.ents[i];
          if (!e.active || !e.alive) continue;
          if (fromPlayer && e.civ) continue;
          if (!fromPlayer && !e.civ) continue;
          var d2 = (x - e.x) * (x - e.x) + (y - e.y) * (y - e.y);
          if (d2 < 26 * 26 && !e.civ) e.suppress = clamp(e.suppress + 0.28, 0, 1);
          if (d2 < (e.r + 3) * (e.r + 3)) { hitEnt = e; hitX = x; hitY = y; hitKind = 'body'; break; }
        }
        if (hitEnt) break;
        if (!fromPlayer) {
          var pd2 = (x - P.x) * (x - P.x) + (y - P.y) * (y - P.y);
          if (pd2 < (P.r + 3) * (P.r + 3) && P.alive) {
            hitEnt = P; hitX = x; hitY = y; hitKind = 'player'; break;
          }
        }
      }
    }
    if (hitKind === 'none') { hitX = x; hitY = y; }
    else if (hitKind === 'wall' || hitKind === 'cover') { hitX = x; hitY = y; }

    K.emit('tracer', ox, oy, hitX, hitY, w.tint);

    if (hitKind === 'body' && hitEnt) {
      var fall = clamp(1 - dist(ox, oy, hitEnt.x, hitEnt.y) / w.range * 0.35, 0.58, 1);
      var d = dmg * fall;
      if (hitEnt.shield) {
        var facing = Math.abs(K.angDiff(ang + Math.PI, hitEnt.angle)) < 1.1;
        if (facing) d *= (1 - hitEnt.shield);
      }
      hurtEnemy(hitEnt, d, fromPlayer);
      K.emit('blood', hitX, hitY, ang, 0, 0xd1454f);
      if (fromPlayer) { P.hits++; K.emit('hitmark', hitX, hitY, 0, 0, 0xffffff); }
    } else if (hitKind === 'player') {
      hurtPlayer(dmg * clamp(1 - dist(ox, oy, P.x, P.y) / w.range * 0.35, 0.58, 1), ang);
    } else if (hitKind === 'wall' || hitKind === 'cover') {
      K.emit('impact', hitX, hitY, ang, 0, 0xbfd4dd);
      K.emit('sfx', 0, 0, 0, 0, 0, 'hit_wall');
    }
    return hitKind;
  }

  function damageCell(ci, dmg) {
    if (S.cellMaxHp[ci] <= 0) return;
    S.cellHp[ci] -= dmg;
    if (S.cellHp[ci] <= 0) {
      var kind = S.grid[ci];
      S.grid[ci] = K.FLOOR;
      var cx = ci % K.COLS, cy = (ci / K.COLS) | 0;
      K.emit('break', cx * CELL + CELL * 0.5, cy * CELL + CELL * 0.5, kind, 0,
        kind === K.GLASS ? 0xbfe9ff : 0xc79a5c);
    }
  }

  function hurtEnemy(e, dmg, fromPlayer) {
    if (!e.alive) return;
    if (e.civ) dmg *= 0.35;
    e.hp -= dmg;
    e.hurtT = 0.14;
    if (!e.civ) {
      e.flinch = Math.max(e.flinch, 0.22);
      e.suppress = clamp(e.suppress + 0.3, 0, 1);
    }
    if (e.hp <= 0) killEntity(e, fromPlayer);
    else K.emit('sfx', 0, 0, 0, 0, 0, 'hit_body');
  }

  function killEntity(e, byPlayer) {
    if (!e.alive) return;
    e.alive = false; e.hp = 0; e.deadT = 3.0; e.anim = 'down';
    if (e.civ) {
      K.emit('civdown', e.x, e.y, 0, 0, 0xd5d8c8);
      if (S.stage && (S.stage.kind === 'escort' || S.stage.kind === 'rescue')) finish('failed_escort');
      return;
    }
    S.enemiesAlive = Math.max(0, S.enemiesAlive - 1);
    if (byPlayer) {
      P.kills++;
      S.clearCount++;
      S.score += e.score;
      if (e.kind === 'target') { S.targetsLeft--; S.score += 40; }
    }
    K.emit('kill', e.x, e.y, 0, 0, C.enemy(e.kind).tint);
  }

  function hurtPlayer(dmg, ang) {
    if (!P.alive) return;
    P.hp -= dmg;
    P.hurtT = 0.2;
    P.regenT = 4.5;
    K.emit('playerhit', P.x, P.y, ang || 0, dmg, 0xff5f5f);
    if (P.hp <= 0) {
      P.hp = 0; P.alive = false;
      K.emit('playerdown', P.x, P.y, 0, 0, 0xff5f5f);
      finish('failed_down');
    }
  }

  /* --------------------------------------------------------- ordnance */
  function explode(x, y, radius, damage, fromPlayer, isBarrel) {
    K.emit('explode', x, y, radius, 0, isBarrel ? 0xffa04a : 0xffbd66);
    K.emit('sfx', 0, 0, 0, 0, 0, 'explode');
    for (var i = 0; i < S.ents.length; i++) {
      var e = S.ents[i];
      if (!e.active || !e.alive) continue;
      var d = dist(x, y, e.x, e.y);
      if (d > radius) continue;
      if (!K.lineClear(x, y, e.x, e.y, false)) continue;
      hurtEnemy(e, damage * (1 - d / (radius * 1.45)), fromPlayer);
    }
    var pd = dist(x, y, P.x, P.y);
    if (pd < radius && K.lineClear(x, y, P.x, P.y, false)) {
      hurtPlayer(damage * 0.55 * (1 - pd / (radius * 1.45)), 0);
    }
    for (var b = 0; b < S.barrels.length; b++) {
      var br = S.barrels[b];
      if (!br.alive) continue;
      var bx = br.cx * CELL + CELL * 0.5, by = br.cy * CELL + CELL * 0.5;
      if (dist(x, y, bx, by) < radius * 0.8) {
        br.alive = false;
        /* chained cook off resolves on the next step so the stack stays flat */
        var o = freeOrd();
        if (o) { o.active = true; o.type = 'chain'; o.x = bx; o.y = by; o.tx = bx; o.ty = by; o.t = 0.12; o.fuse = 0.12; }
      }
    }
    /* soft cover near the blast comes apart */
    var c0 = clamp((x - radius) / CELL | 0, 0, K.COLS - 1), c1 = clamp((x + radius) / CELL | 0, 0, K.COLS - 1);
    var r0 = clamp((y - radius) / CELL | 0, 0, K.ROWS - 1), r1 = clamp((y + radius) / CELL | 0, 0, K.ROWS - 1);
    for (var cy = r0; cy <= r1; cy++) {
      for (var cx = c0; cx <= c1; cx++) {
        var ci = K.idx(cx, cy), v = S.grid[ci];
        if (v !== K.CRATE && v !== K.GLASS && v !== K.DOOR) continue;
        damageCell(ci, damage * 0.8);
      }
    }
  }
  function freeOrd() {
    for (var i = 0; i < S.ord.length; i++) if (!S.ord[i].active) return S.ord[i];
    return null;
  }
  function freeSmoke() {
    var oldest = null;
    for (var i = 0; i < S.smokes.length; i++) {
      if (!S.smokes[i].active) return S.smokes[i];
      if (!oldest || S.smokes[i].life < oldest.life) oldest = S.smokes[i];
    }
    return oldest;
  }

  function useGadget() {
    if (!P.alive || !S.running) return false;
    if (P.charges <= 0) { K.emit('sfx', 0, 0, 0, 0, 0, 'empty'); K.emit('chip', 0, 0, 0, 0, 0, 'No charges'); return false; }
    var g = C.gadget(P.gadget);
    P.charges--;
    if (g.id === 'ping') {
      for (var i = 0; i < S.ents.length; i++) {
        var e = S.ents[i];
        if (e.active && e.alive && !e.civ) e.marked = g.life;
      }
      K.emit('ping', P.x, P.y, 0, 0, g.tint);
      K.emit('sfx', 0, 0, 0, 0, 0, 'ping');
      K.emit('chip', 0, 0, 0, 0, 0, 'Drone sweep');
      return true;
    }
    var o = freeOrd();
    if (!o) return false;
    var range = g.throwRange;
    var tx = P.x + Math.cos(P.angle) * range, ty = P.y + Math.sin(P.angle) * range;
    /* the throw stops at the first wall so nothing lands inside geometry */
    var stepN = Math.ceil(range / 10);
    for (var s = 1; s <= stepN; s++) {
      var px = P.x + Math.cos(P.angle) * (range * s / stepN);
      var py = P.y + Math.sin(P.angle) * (range * s / stepN);
      if (K.cellAt(px, py) === K.WALL || K.cellAt(px, py) === K.DOOR) {
        tx = P.x + Math.cos(P.angle) * (range * (s - 1) / stepN);
        ty = P.y + Math.sin(P.angle) * (range * (s - 1) / stepN);
        break;
      }
    }
    o.active = true; o.type = g.id; o.x = P.x; o.y = P.y; o.tx = tx; o.ty = ty;
    o.t = 0; o.fuse = g.fuse + 0.32; o.ownerFoe = false;
    K.emit('sfx', 0, 0, 0, 0, 0, 'swap');
    K.emit('chip', 0, 0, 0, 0, 0, g.name + ' out');
    return true;
  }

  function updateOrdnance(dt) {
    for (var i = 0; i < S.ord.length; i++) {
      var o = S.ord[i];
      if (!o.active) continue;
      o.t += dt;
      var fly = clamp(o.t / 0.32, 0, 1);
      o.x = o.x + (o.tx - o.x) * (fly < 1 ? 0.25 : 1);
      o.y = o.y + (o.ty - o.y) * (fly < 1 ? 0.25 : 1);
      if (o.t < o.fuse) continue;
      o.active = false;
      if (o.type === 'frag' || o.type === 'chain') {
        var g = C.gadget('frag');
        explode(o.tx, o.ty, o.type === 'chain' ? 96 : g.radius, o.type === 'chain' ? 92 : g.damage, !o.ownerFoe, o.type === 'chain');
      } else if (o.type === 'smoke') {
        var sm = freeSmoke();
        var sg = C.gadget('smoke');
        if (sm) {
          sm.active = true; sm.x = o.tx; sm.y = o.ty; sm.r = 10;
          sm.life = sg.life; sm.max = sg.life; sm.grow = sg.radius;
        }
        K.emit('smokepop', o.tx, o.ty, 0, 0, 0xb9d4d0);
        K.emit('sfx', 0, 0, 0, 0, 0, 'flash');
      } else if (o.type === 'flash') {
        var fg = C.gadget('flash');
        K.emit('flashbang', o.tx, o.ty, fg.radius, 0, 0xfff3c4);
        K.emit('sfx', 0, 0, 0, 0, 0, 'flash');
        for (var e = 0; e < S.ents.length; e++) {
          var en = S.ents[e];
          if (!en.active || !en.alive || en.civ) continue;
          var d = dist(o.tx, o.ty, en.x, en.y);
          if (d > fg.radius) continue;
          if (!K.lineClear(o.tx, o.ty, en.x, en.y, false)) continue;
          en.blind = Math.max(en.blind, fg.blind * (1 - d / (fg.radius * 1.6)));
          en.suppress = 1;
        }
        var pd = dist(o.tx, o.ty, P.x, P.y);
        if (pd < fg.radius && K.lineClear(o.tx, o.ty, P.x, P.y, false)) {
          K.emit('playerflash', P.x, P.y, 1 - pd / fg.radius, 0, 0xffffff);
        }
      }
    }
    for (var s = 0; s < S.smokes.length; s++) {
      var sm2 = S.smokes[s];
      if (!sm2.active) continue;
      sm2.life -= dt;
      sm2.r += (sm2.grow - sm2.r) * Math.min(1, dt * 2.6);
      if (sm2.life <= 0) sm2.active = false;
    }
  }

  /* --------------------------------------------------------- shooting */
  function playerShoot(aimAng) {
    var w = weaponOf(P);
    var id = currentWeaponId();
    if (P.reloadT > 0 || P.raiseT > 0 || P.vaultT > 0 || !P.alive) return;
    if (P.fireCd > 0) return;
    if ((P.mag[id] | 0) <= 0) {
      K.emit('sfx', 0, 0, 0, 0, 0, 'empty');
      P.fireCd = 0.28;
      startReload();
      return;
    }
    P.mag[id]--;
    P.fireCd = w.cooldown;
    P.shots++;
    var spread = w.spread + P.bloom + (P.moveMag > 0.25 ? w.moveBloom : 0);
    var ox = P.x + Math.cos(aimAng) * 12 + Math.cos(aimAng + Math.PI / 2) * P.lean * 7;
    var oy = P.y + Math.sin(aimAng) * 12 + Math.sin(aimAng + Math.PI / 2) * P.lean * 7;
    for (var p = 0; p < w.pellets; p++) {
      var a = aimAng + (rand() - 0.5) * spread * (w.pellets > 1 ? 2.2 : 1) + P.recoil;
      castRay(ox, oy, a, w, true, P, 1);
    }
    P.bloom = Math.min(w.bloomMax, P.bloom + w.bloomShot);
    P.recoil += (rand() - 0.5) * w.kick * 0.004;
    P.recoil = clamp(P.recoil, -0.06, 0.06);
    K.emit('muzzle', ox, oy, aimAng, w.kick, w.tint);
    K.emit('casing', ox, oy, aimAng, 0, 0xd8c07a);
    K.emit('shake', 0, 0, w.shake, 0, 0);
    K.emit('sfx', 0, 0, 0, 0, 0, w.sfx);
    P.anim = 'fire'; P.animT = 0.09;
  }

  function startReload() {
    var id = currentWeaponId();
    var w = weaponOf(P);
    if (P.reloadT > 0 || P.raiseT > 0) return false;
    if ((P.reserve[id] | 0) <= 0) { K.emit('chip', 0, 0, 0, 0, 0, 'No reserve'); return false; }
    if ((P.mag[id] | 0) >= w.mag) return false;
    P.reloadTotal = (P.mag[id] | 0) > 0 ? w.reloadTac : w.reloadEmpty;
    P.reloadT = P.reloadTotal;
    K.emit('sfx', 0, 0, 0, 0, 0, 'reload');
    P.anim = 'reload';
    return true;
  }
  function finishReload() {
    var id = currentWeaponId();
    var w = weaponOf(P);
    var want = w.mag - (P.mag[id] | 0);
    var take = Math.min(want, P.reserve[id] | 0);
    P.mag[id] = (P.mag[id] | 0) + take;
    P.reserve[id] = (P.reserve[id] | 0) - take;
    P.bloom = 0;
  }
  function swapWeapon() {
    if (P.raiseT > 0 || P.vaultT > 0 || !P.alive) return false;
    P.reloadT = 0;                       // a swap cancels a reload, by design
    P.current = P.current === 'primary' ? 'secondary' : 'primary';
    P.raiseT = weaponOf(P).raise;
    P.bloom = 0;
    K.emit('sfx', 0, 0, 0, 0, 0, 'swap');
    return true;
  }

  /* Vault: cross the low cover the player is facing. Cancels a reload. */
  function vaultTarget() {
    if (!P.alive || P.vaultT > 0) return null;
    var a = P.angle;
    for (var d = 26; d <= 58; d += 8) {
      var cx = (P.x + Math.cos(a) * d) / CELL | 0;
      var cy = (P.y + Math.sin(a) * d) / CELL | 0;
      if (cx < 0 || cy < 0 || cx >= K.COLS || cy >= K.ROWS) return null;
      var v = S.grid[K.idx(cx, cy)];
      if (v === K.WALL || v === K.DOOR) return null;
      if (v === K.CRATE) {
        var tx = P.x + Math.cos(a) * (d + 46), ty = P.y + Math.sin(a) * (d + 46);
        if (K.cellAt(tx, ty) !== K.FLOOR) return null;
        return { x: tx, y: ty };
      }
    }
    return null;
  }
  function startVault() {
    var t = vaultTarget();
    if (!t) return false;
    P.vaultT = 0.34; P.vaultX = t.x; P.vaultY = t.y;
    P.vaultFrom = 0.34;
    P.reloadT = 0;
    P.anim = 'vault';
    K.emit('sfx', 0, 0, 0, 0, 0, 'vault');
    return true;
  }

  /* ------------------------------------------------------------ player */
  function updatePlayer(dt, ctl) {
    P.fireCd -= dt;
    P.bloom = Math.max(0, P.bloom - weaponOf(P).bloomDecay * dt);
    P.recoil *= Math.pow(0.02, dt);
    P.hurtT = Math.max(0, P.hurtT - dt);
    if (!P.alive) return;

    if (P.regenT > 0) P.regenT -= dt;
    else if (P.hp < P.maxHp) P.hp = Math.min(P.maxHp, P.hp + 15 * dt);

    if (P.raiseT > 0) P.raiseT -= dt;
    if (P.reloadT > 0) {
      P.reloadT -= dt;
      if (P.reloadT <= 0) { P.reloadT = 0; finishReload(); }
    }

    if (P.vaultT > 0) {
      var k = 1 - P.vaultT / P.vaultFrom;
      P.x += (P.vaultX - P.x) * Math.min(1, dt / Math.max(0.02, P.vaultT));
      P.y += (P.vaultY - P.y) * Math.min(1, dt / Math.max(0.02, P.vaultT));
      P.vaultT -= dt;
      P.anim = 'vault';
      P.legAnim = 'vault';
      if (P.vaultT <= 0) { P.vaultT = 0; P.anim = 'idle'; }
      return;
    }

    /* movement */
    var mx = ctl.moveX, my = ctl.moveY;
    var mag = Math.hypot(mx, my);
    P.moveMag = clamp(mag, 0, 1);
    var speed = 124 * (P.reloadT > 0 ? 0.86 : 1);
    if (mag > 0.02) {
      P.moveAngle = Math.atan2(my, mx);
      K.moveBody(P, mx * speed * dt, my * speed * dt, false);
      P.animT += dt * (2.4 + P.moveMag * 4.2);
      var f = Math.floor(P.animT * 2) % 4;
      P.legAnim = 'run' + f;
    } else {
      P.legAnim = 'stand';
      P.animT += dt;
    }

    /* aim, with a gentle assist that steers but never snaps */
    var aimMag = Math.hypot(ctl.aimX, ctl.aimY);
    if (aimMag > 0.08) P.angle = Math.atan2(ctl.aimY, ctl.aimX);
    var assist = (ctl.assist === false) ? null : assistTarget(P.angle);
    if (assist && ctl.fire) {
      var diff = K.angDiff(P.angle, Math.atan2(assist.y - P.y, assist.x - P.x));
      var maxStep = 1.6 * dt * (1 - clamp(aimMag, 0, 1) * 0.55);
      P.angle += clamp(diff, -maxStep, maxStep);
    }

    /* lean: standing still beside cover pushes the muzzle past the corner */
    var wantLean = 0;
    if (P.moveMag < 0.06) {
      var side = Math.atan2(Math.sin(P.angle + Math.PI / 2), Math.cos(P.angle + Math.PI / 2));
      var lx = P.x + Math.cos(side) * 20, ly = P.y + Math.sin(side) * 20;
      var rx = P.x - Math.cos(side) * 20, ry = P.y - Math.sin(side) * 20;
      if (K.blocksSight(K.cellAt(lx, ly)) && !K.blocksSight(K.cellAt(rx, ry))) wantLean = -1;
      else if (K.blocksSight(K.cellAt(rx, ry)) && !K.blocksSight(K.cellAt(lx, ly))) wantLean = 1;
    }
    P.lean += (wantLean - P.lean) * Math.min(1, dt * 7);

    if (ctl.fire) {
      var w = weaponOf(P);
      if (w.auto || ctl.fireEdge) playerShoot(P.angle);
    }
    P.firing = !!ctl.fire;

    if (P.animT <= 0 && P.anim === 'fire') P.anim = 'idle';
    if (P.anim === 'fire') { P.animT -= dt; if (P.animT <= 0) P.anim = 'idle'; }
    else if (P.reloadT > 0) P.anim = 'reload';
    else if (P.lean > 0.55 || P.lean < -0.55) P.anim = 'lean';
    else P.anim = 'idle';
  }

  function assistTarget(ang) {
    var best = null, bestScore = 1e9;
    var w = weaponOf(P);
    for (var i = 0; i < S.ents.length; i++) {
      var e = S.ents[i];
      if (!e.active || !e.alive || e.civ) continue;
      var d = dist(P.x, P.y, e.x, e.y);
      if (d > w.range) continue;
      var off = Math.abs(K.angDiff(ang, Math.atan2(e.y - P.y, e.x - P.x)));
      if (off > 0.26) continue;
      if (!K.lineClear(P.x, P.y, e.x, e.y, true)) continue;
      var score = off * 260 + d * 0.25;
      if (score < bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  /* ---------------------------------------------------------- hostiles */
  function updateEnemy(e, dt) {
    if (!e.active) return;
    if (!e.alive) {
      e.deadT -= dt;
      if (e.deadT <= 0) e.active = false;
      return;
    }
    e.hurtT = Math.max(0, e.hurtT - dt);
    e.flinch = Math.max(0, e.flinch - dt);
    e.blind = Math.max(0, e.blind - dt);
    e.marked = Math.max(0, e.marked - dt);
    e.spawnT = Math.max(0, e.spawnT - dt);
    e.suppress = Math.max(0, e.suppress - 0.55 * dt);
    e.fireCd -= dt;

    if (e.civ) { updateCiv(e, dt); return; }
    if (e.inert) { e.anim = 'idle'; return; }
    if (e.spawnT > 0) return;

    var def = C.enemy(e.kind);
    var w = C.weapon(e.weapon);
    e.think -= dt;
    var seen = e.targetSeen;
    if (e.think <= 0) {
      e.think = 0.22 + rand() * 0.18;
      seen = P.alive && K.lineClear(e.x, e.y, P.x, P.y, true);
      e.targetSeen = seen;
      chooseGoal(e, def, w, seen);
    }

    var d = dist(e.x, e.y, P.x, P.y);
    if (seen && P.alive) {
      var want = Math.atan2(P.y - e.y, P.x - e.x);
      e.angle += clamp(K.angDiff(e.angle, want), -6 * dt, 6 * dt);
      if (e.blind <= 0 && e.flinch <= 0 && e.fireCd <= 0 && d < w.range * 1.08) {
        var spread = (1 - e.accuracy) * 0.24 + e.suppress * 0.26;
        castRay(e.x + Math.cos(e.angle) * 12, e.y + Math.sin(e.angle) * 12,
          e.angle + (rand() - 0.5) * spread, w, false, e, 0.62);
        K.emit('muzzle', e.x + Math.cos(e.angle) * 12, e.y + Math.sin(e.angle) * 12, e.angle, 1, w.tint);
        K.emit('sfx', 0, 0, 0, 0, 0, w.sfx);
        e.burst++;
        e.anim = 'fire'; e.animT = 0.1;
        if (e.burst >= def.burst) { e.burst = 0; e.fireCd = def.burstGap * (1 + e.suppress * 0.8); }
        else e.fireCd = w.cooldown * (1 + e.suppress * 0.5);
      }
    } else if (e.hasGoal) {
      e.angle += clamp(K.angDiff(e.angle, Math.atan2(e.goalY - e.y, e.goalX - e.x)), -4 * dt, 4 * dt);
    }

    var sp = def.speed * (0.85 + S.difficulty * 0.3) * (1 - e.suppress * 0.35) * (e.blind > 0 ? 0.25 : 1);
    if (e.flinch > 0) sp *= 0.3;
    var moved = 0;
    if (e.hasGoal) {
      var gx = e.goalX - e.x, gy = e.goalY - e.y;
      var gl = Math.hypot(gx, gy);
      if (gl > 10) {
        var bx = e.x, by = e.y;
        K.moveBody(e, gx / gl * sp * dt, gy / gl * sp * dt, false);
        moved = dist(bx, by, e.x, e.y);
        if (moved < 0.3) {
          /* stuck against geometry: fall back to the flow field next think */
          e.think = Math.min(e.think, 0.05);
          e.hasGoal = false;
        }
      } else e.hasGoal = false;
    }
    e.moveMag = moved > 0.2 ? 1 : 0;
    e.animT += dt * (moved > 0.2 ? 6 : 1.6);
    if (e.anim === 'fire') { e.animT -= dt * 6; }
    if (e.hurtT > 0) e.anim = 'flinch';
    else if (e.fireCd > 0 && seen) e.anim = 'fire';
    else e.anim = 'idle';
  }

  function chooseGoal(e, def, w, seen) {
    e.hasGoal = false;
    if (!P.alive) return;
    var d = dist(e.x, e.y, P.x, P.y);
    if (seen) {
      /* hurt or suppressed and cover minded: break the sightline */
      if ((e.suppress > 0.3 || e.hp < e.maxHp * 0.55) && def.cover > 0.4) {
        var spot = findCover(e);
        if (spot) { e.goalX = spot.x; e.goalY = spot.y; e.hasGoal = true; return; }
      }
      if (d > w.range * 0.62) { e.goalX = P.x; e.goalY = P.y; e.hasGoal = true; return; }
      if (def.cover < 0.4 && d > 60) { e.goalX = P.x; e.goalY = P.y; e.hasGoal = true; return; }
      var side = (e.id % 2 === 0 ? 1 : -1);
      e.goalX = e.x + Math.cos(e.angle + Math.PI / 2) * 44 * side;
      e.goalY = e.y + Math.sin(e.angle + Math.PI / 2) * 44 * side;
      e.hasGoal = true;
      return;
    }
    var next = K.flowStep(e.x, e.y);
    if (next) { e.goalX = next.x; e.goalY = next.y; e.hasGoal = true; }
    else { e.goalX = P.x; e.goalY = P.y; e.hasGoal = true; }
  }

  function findCover(e) {
    var list = S.coverSpots;
    if (!list.length) return null;
    var best = null, bestScore = 1e9;
    var checked = 0;
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      var d = dist(e.x, e.y, s.x, s.y);
      if (d > 230 || d < 12) continue;
      var score = d + dist(P.x, P.y, s.x, s.y) * 0.08;
      if (score >= bestScore) continue;
      if (K.lineClear(P.x, P.y, s.x, s.y, false)) continue;   // must break the sightline
      if (++checked > 14) break;
      bestScore = score; best = s;
    }
    return best;
  }

  function updateCiv(e, dt) {
    if (!P.alive) return;
    var d = dist(e.x, e.y, P.x, P.y);
    var moving = d > 54;
    if (moving) {
      var next = K.flowStep(e.x, e.y) || { x: P.x, y: P.y };
      var gx = next.x - e.x, gy = next.y - e.y;
      var gl = Math.hypot(gx, gy) || 1;
      K.moveBody(e, gx / gl * e.speed * dt, gy / gl * e.speed * dt, false);
      e.angle = Math.atan2(gy, gx);
    }
    e.moveMag = moving ? 1 : 0;
    e.animT += dt * (moving ? 5 : 1.5);
    e.anim = moving ? 'move' : 'idle';
  }

  /* -------------------------------------------------------- objectives */
  function anchorPoint(id) {
    var a = C.anchor(S.theatre.id, id);
    return K.snapPoint(a.x / CELL, a.y / CELL);
  }
  function stageAnchor() {
    if (!S.stage || S.stage.anchor == null) return null;
    if (!S._anchorCache || S._anchorStage !== S.stageIndex || S._anchorMode !== S.mode) {
      S._anchorCache = anchorPoint(S.stage.anchor);
      S._anchorStage = S.stageIndex;
      S._anchorMode = S.mode;
    }
    return S._anchorCache;
  }

  function updateObjective(dt) {
    var st = S.stage;
    if (!st || !S.running) return;
    S.stageT += dt;

    if (st.reinforce) {
      S.reinforceT += dt;
      if (S.reinforceT >= st.reinforce.every && S.enemiesAlive < st.reinforce.max) {
        S.reinforceT = 0;
        var kinds = ['rifleman', 'rusher', 'marksman'];
        spawnSquad(kinds[(S.wave++) % kinds.length], st.reinforce.n, st.anchor || null);
        K.emit('chip', 0, 0, 0, 0, 0, 'Contact inbound');
        K.emit('sfx', 0, 0, 0, 0, 0, 'alarm');
      }
    }

    var a = stageAnchor();
    var inZone = a ? dist(P.x, P.y, a.x, a.y) < 46 : false;

    switch (st.kind) {
      case 'breach':
      case 'defuse':
        if (inZone && P.alive) {
          S.stageProgress = clamp(S.stageProgress + dt / (st.time || 2), 0, 1);
          if (S.stageProgress >= 1) {
            if (st.kind === 'breach') {
              explode(a.x, a.y, 108, 40, true, false);
              K.emit('sfx', 0, 0, 0, 0, 0, 'breach');
            } else {
              K.emit('sfx', 0, 0, 0, 0, 0, 'objective');
            }
            K.emit('chip', 0, 0, 0, 0, 0, st.kind === 'breach' ? 'Breach set' : 'Charge cut');
            advanceStage();
          }
        } else {
          S.stageProgress = Math.max(0, S.stageProgress - dt * 0.5);
        }
        break;
      case 'clear':
        S.stageProgress = clamp(S.clearCount / (st.count || 1), 0, 1);
        if (S.clearCount >= (st.count || 1)) advanceStage();
        break;
      case 'intel':
        S.stageProgress = clamp(S.intelTaken / (st.count || 1), 0, 1);
        if (S.intelTaken >= (st.count || 1)) advanceStage();
        break;
      case 'rescue':
        S.stageProgress = !a ? 0 : (inZone ? 1 : clamp(1 - dist(P.x, P.y, a.x, a.y) / 800, 0, 0.98));
        if (inZone) {
          var kind = (S.mission && S.mission.stages[S.stageIndex].icon === 'vip') ? 'vip' : 'hostage';
          for (var i = 0; i < (st.count || 1); i++) {
            spawnCiv(kind, a.x + (i - 0.5) * 22, a.y + 14);
          }
          S.rescued = st.count || 1;
          K.emit('chip', 0, 0, 0, 0, 0, kind === 'vip' ? 'Asset secured' : 'Hostages secured');
          K.emit('sfx', 0, 0, 0, 0, 0, 'objective');
          advanceStage();
        }
        break;
      case 'escort':
        S.stageProgress = a ? clamp(1 - dist(P.x, P.y, a.x, a.y) / 1000, 0, 0.99) : 0;
        if (inZone && civsClose()) { S.stageProgress = 1; advanceStage(); }
        break;
      case 'hold':
        if (inZone) S.holdT += dt;
        S.stageProgress = clamp(S.holdT / (st.time || 30), 0, 1);
        if (S.holdT >= (st.time || 30)) advanceStage();
        break;
      case 'extract':
        S.stageProgress = a ? clamp(1 - dist(P.x, P.y, a.x, a.y) / 900, 0, 0.99) : 0;
        if (inZone) { S.stageProgress = 1; advanceStage(); }
        break;
      case 'survival':
        updateSurvival(dt);
        break;
      case 'trial':
        updateTrial(dt);
        break;
      default:
        break;
    }
  }
  function civsClose() {
    for (var i = 0; i < S.ents.length; i++) {
      var e = S.ents[i];
      if (e.active && e.alive && e.civ && dist(e.x, e.y, P.x, P.y) > 120) return false;
    }
    return true;
  }

  function updateSurvival(dt) {
    S.waveT -= dt;
    if (S.enemiesAlive <= 0 && S.waveT <= 0) {
      S.wave++;
      S.difficulty = C.SURVIVAL.difficulty(S.wave);
      var count = Math.round(C.SURVIVAL.baseCount + S.wave * C.SURVIVAL.perWave);
      count = Math.min(count, C.SURVIVAL.maxAlive);
      var mix = C.SURVIVAL.mix(S.wave);
      for (var i = 0; i < count; i++) {
        spawnSquad(mix[i % mix.length], 1, null);
      }
      if (S.wave % C.SURVIVAL.heavyEvery === 0) spawnSquad('heavy', 1, null);
      S.waveT = 3.0;
      S.score += 120 * S.wave;
      K.emit('wave', 0, 0, S.wave, 0, 0, 'Wave ' + S.wave);
      K.emit('sfx', 0, 0, 0, 0, 0, 'alarm');
      /* every third wave restocks the loadout so a long run stays playable */
      if (S.wave % 3 === 0) {
        P.reserve[P.primary] = (P.reserve[P.primary] | 0) + C.weapon(P.primary).mag * 3;
        P.charges = Math.min(P.charges + 1, C.gadget(P.gadget).charges + 2);
        K.emit('chip', 0, 0, 0, 0, 0, 'Resupply');
      }
    }
    S.stageProgress = clamp(1 - S.enemiesAlive / Math.max(1, C.SURVIVAL.maxAlive), 0, 1);
  }

  function updateTrial(dt) {
    S.trialT += dt;
    S.stageProgress = clamp(1 - S.targetsLeft / C.TRIAL.targets, 0, 1);
    var alive = 0;
    for (var i = 0; i < S.ents.length; i++) if (S.ents[i].active && S.ents[i].alive) alive++;
    if (alive === 0) {
      if (S.targetsLeft <= 0) { finish('complete'); return; }
      spawnTargets(Math.min(C.TRIAL.batch, S.targetsLeft));
    }
    if (S.trialT > C.TRIAL.limit) finish('failed_time');
  }

  function updateIntel(dt) {
    for (var i = 0; i < S.intel.length; i++) {
      var it = S.intel[i];
      if (!it.active || it.taken) continue;
      it.phase += dt;
      if (dist(P.x, P.y, it.x, it.y) < 26 && P.alive) {
        it.taken = true; it.active = false;
        S.intelTaken++;
        S.score += 250;
        K.emit('intel', it.x, it.y, 0, 0, 0x57d6b6);
        K.emit('sfx', 0, 0, 0, 0, 0, 'objective');
        K.emit('chip', 0, 0, 0, 0, 0, 'Intel ' + S.intelTaken + ' of ' + S.intelNeeded);
      }
    }
  }

  /* -------------------------------------------------------------- step */
  function step(dt, ctl) {
    if (!S.running) return;
    S.simT += dt;
    S.timeElapsed += dt;
    S.flowT -= dt;
    if (S.flowT <= 0) { K.refreshFlow(); S.flowT = 0.45; }

    updatePlayer(dt, ctl);
    for (var i = 0; i < S.ents.length; i++) updateEnemy(S.ents[i], dt);
    updateOrdnance(dt);
    updateIntel(dt);
    updateObjective(dt);
  }

  /* ------------------------------------------------------------ scoring */
  function medalsFor(missionIndex, timeUsed, intelTaken, accuracy) {
    var m = C.mission(missionIndex);
    var stars = 1;
    if (timeUsed <= m.par) stars++;
    if (intelTaken >= (m.intel || 0) || accuracy >= 0.5) stars++;
    return clamp(stars, 1, 3);
  }
  function finalScore(timeUsed) {
    var s = S.score;
    if (S.mission) s += Math.max(0, Math.round((S.mission.par - timeUsed) * 10));
    var acc = S.player.shots > 0 ? S.player.hits / S.player.shots : 0;
    s += Math.round(acc * 900);
    return Math.max(0, Math.round(s));
  }

  return {
    startMission: startMission, step: step, finish: finish,
    useGadget: useGadget, startReload: startReload, swapWeapon: swapWeapon,
    startVault: startVault, vaultTarget: vaultTarget,
    stageAnchor: stageAnchor, anchorPoint: anchorPoint,
    weaponOf: weaponOf, currentWeaponId: currentWeaponId,
    medalsFor: medalsFor, finalScore: finalScore,
    spawnEnemy: spawnEnemy, explode: explode
  };
})();
