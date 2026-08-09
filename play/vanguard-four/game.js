/* Vanguard Four - world, simulation, rendering */
(function (root) {
  'use strict';
  var V = root.V;
  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d', { alpha: false });

  var W = 390, H = 700, SC = 1;
  var AR = { x: 10, y: 88, w: 370, h: 500 };

  function resize() {
    W = Math.max(280, root.innerWidth);
    H = Math.max(420, root.innerHeight);
    var dpr = Math.min(2, root.devicePixelRatio || 1);
    var lim = 960 / Math.max(W, H);
    SC = Math.min(dpr, dpr * Math.max(0.4, lim));
    if (Math.max(W, H) * SC > 960) SC = 960 / Math.max(W, H);
    canvas.width = Math.round(W * SC);
    canvas.height = Math.round(H * SC);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(SC, 0, 0, SC, 0, 0);

    var band = Math.max(96, Math.min(120, H * 0.17));
    AR.x = 10; AR.y = 88; AR.w = W - 20; AR.h = Math.max(200, H - 88 - band - 6);

    var L = V.layout;
    L.W = W; L.H = H;
    L.strike = { x: W - 62, y: H - band * 0.5, r: 48 };
    L.sup = { x: W - 158, y: H - band * 0.42, r: 36 };
    L.ports = [];
    var m = 8, gap = 6, pw = (W - m * 2 - gap * 3) / 4, ph = 56;
    for (var i = 0; i < 4; i++) L.ports.push({ x: m + i * (pw + gap), y: 6, w: pw, h: ph });
    L.mute = { x: W - 52, y: 55, w: 48, h: 48 };
  }

  /* ===================== WORLD ===================== */
  var G = {
    heroes: [], enemies: [], projs: [], strikes: [], bolts: [], wells: [], novas: [],
    arcs: [], spawns: [], ctrl: 0, room: 1, kills: 0, score: 0, best: 0,
    state: 'play', stateT: 0, t: 0, flash: null, hint: 6, banner: null, roomsCleared: 0
  };
  root.G = G;

  function loadBest() {
    try { G.best = parseInt(root.localStorage.getItem('vanguard4_best') || '0', 10) || 0; } catch (e) { G.best = 0; }
  }
  function saveBest() {
    try { root.localStorage.setItem('vanguard4_best', String(G.best)); } catch (e) { }
  }

  G.fx = {
    slashArc: function (h, big) {
      G.arcs.push({ x: h.x, y: h.y, a: h.a, r: big ? 62 : 44, arc: big ? 2.5 : 1.5, t: 0.16, max: 0.16, col: h.col, owner: h });
    },
    flash: function (col, t) { G.flash = { col: col, t: t, max: t }; }
  };

  G.addStrike = function (o) {
    o.life = o.life || 0.1; o.max = o.life; o.hit = [];
    if (o.owner) { o.x = o.owner.x + Math.cos(o.owner.a) * (o.ox || 0); o.y = o.owner.y + Math.sin(o.owner.a) * (o.ox || 0); o.a = o.owner.a; }
    if (o.a === undefined) o.a = 0;
    G.strikes.push(o);
    return o;
  };
  G.addProj = function (o) { o.max = o.life; G.projs.push(o); return o; };

  G.randomEnemy = function () {
    if (!G.enemies.length) return null;
    return G.enemies[V.randi(0, G.enemies.length)];
  };
  G.chainTargets = function (x, y, rad, n) {
    var out = [], src = { x: x, y: y }, used = {};
    for (var k = 0; k < n; k++) {
      var best = null, bd = rad * rad;
      for (var i = 0; i < G.enemies.length; i++) {
        if (used[i]) continue;
        var e = G.enemies[i], d = V.dist2(src, e);
        if (d < bd) { bd = d; best = i; }
      }
      if (best === null) break;
      used[best] = 1; out.push(G.enemies[best]); src = G.enemies[best];
      rad = 120;
    }
    return out;
  };

  function meterGain(h, amt) {
    if (h.sup) return;
    h.meter = V.clamp(h.meter + amt, 0, 100);
  }

  G.damageEnemy = function (e, dmg, src, knock, ang, stun) {
    if (e.dead) return;
    if (e.type === 'bracer' && ang !== undefined) {
      if (Math.abs(V.angDiff(ang + Math.PI, e.a)) < 1.05) dmg *= 0.3;
    }
    e.hp -= dmg;
    e.flash = 0.12;
    if (knock) { e.vx += Math.cos(ang) * knock * (e.def.boss ? 0.18 : 1); e.vy += Math.sin(ang) * knock * (e.def.boss ? 0.18 : 1); }
    if (stun) e.stun = Math.max(e.stun, stun * (e.def.boss ? 0.4 : 1));
    if (src && src.isHero) meterGain(src, dmg * 0.55);
    V.burst(e.x, e.y, 3, '#fff', 130, 0.2, 2);
    V.sfx('hit');
    if (e.hp <= 0) killEnemy(e, src);
  };

  function killEnemy(e, src) {
    e.dead = true;
    G.kills++;
    G.score += e.def.score;
    V.burst(e.x, e.y, e.def.boss ? 40 : 12, e.def.col, e.def.boss ? 330 : 200, 0.55, e.def.boss ? 6 : 3.5);
    V.ring(e.x, e.y, e.r + 8, e.def.col, 0.35);
    V.shake(e.def.boss ? 14 : 2.5);
    V.sfx('kill');
    if (e.def.boss) { G.banner = { txt: 'WARDEN DOWN', t: 2.0, col: '#e8437a' }; G.fx.flash('#ffffff', 0.25); }
    if (src && src.isHero) meterGain(src, 6);
  }

  G.damageHero = function (h, dmg, ang, knock) {
    if (h.downed || h.inv > 0) return;
    h.hp -= dmg;
    h.flash = 0.14;
    h.inv = 0.28;
    if (knock) { h.vx += Math.cos(ang) * knock; h.vy += Math.sin(ang) * knock; }
    meterGain(h, dmg * 0.9);
    V.burst(h.x, h.y, 5, '#ff5f5f', 150, 0.25, 2.5);
    if (h.i === G.ctrl) { V.shake(4); G.fx.flash('#ff2f4f', 0.14); }
    V.sfx('hit');
    if (h.hp <= 0) downHero(h);
  };

  function downHero(h) {
    h.hp = 0; h.downed = true; h.reviveP = 0; h.sup = null; h.vx = 0; h.vy = 0;
    V.sfx('down'); V.shake(7);
    V.ring(h.x, h.y, 30, '#ff4040', 0.5);
    G.banner = { txt: h.name + ' IS DOWN', t: 1.6, col: '#ff6a6a' };
    if (h.i === G.ctrl) {
      var alt = nearestLiving(h);
      if (alt) setCtrl(alt.i, true);
    }
    if (allDown()) gameOver();
  }

  G.reviveHero = function (h, frac) {
    h.downed = false; h.hp = Math.max(1, Math.round(h.max * (frac || 0.5)));
    h.inv = 1.2; h.reviveP = 0;
    V.ring(h.x, h.y, 34, h.col, 0.5);
    V.burst(h.x, h.y, 14, h.col, 180, 0.45, 3);
    V.sfx('revive');
  };

  function allDown() {
    for (var i = 0; i < G.heroes.length; i++) if (!G.heroes[i].downed) return false;
    return true;
  }
  function nearestLiving(from) {
    var best = null, bd = 1e9;
    for (var i = 0; i < G.heroes.length; i++) {
      var h = G.heroes[i];
      if (h === from || h.downed) continue;
      var d = V.dist2(from, h);
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  }
  function setCtrl(i, silent) {
    if (i < 0 || i > 3) return;
    var h = G.heroes[i];
    if (!h || h.downed || i === G.ctrl) return;
    G.ctrl = i;
    V.ring(h.x, h.y, 30, h.col, 0.35);
    if (!silent) V.sfx('swap');
    G.banner = { txt: h.name + ' - ' + h.def.title.toUpperCase(), t: 1.1, col: h.col };
  }

  function gameOver() {
    if (G.state === 'over') return;
    G.state = 'over'; G.stateT = 0;
    if (G.score > G.best) { G.best = G.score; saveBest(); }
    V.sfx('over'); V.shake(14);
    G.fx.flash('#ff2f4f', 0.5);
  }

  /* ===================== SETUP ===================== */
  function makeHero(i) {
    var d = V.HEROES[i];
    return {
      isHero: true, i: i, def: d, name: d.name, col: d.col, kit: d.kit,
      x: AR.x + AR.w * (0.3 + 0.14 * i), y: AR.y + AR.h * 0.72,
      vx: 0, vy: 0, a: -Math.PI / 2, r: 13,
      hp: d.max, max: d.max, meter: 0, sup: null,
      downed: false, reviveP: 0, cd: 0, combo: 0, comboT: 0,
      dashT: 0, dvx: 0, dvy: 0, inv: 0, flash: 0, stun: 0,
      botT: 0, botJit: Math.random() * 6.28, aiTarget: null
    };
  }

  function newRun() {
    V.resetInput();
    G.heroes = [makeHero(0), makeHero(1), makeHero(2), makeHero(3)];
    G.enemies = []; G.projs = []; G.strikes = []; G.bolts = []; G.wells = []; G.novas = [];
    G.arcs = []; G.spawns = []; V.parts.length = 0;
    G.ctrl = 0; G.room = 1; G.kills = 0; G.score = 0; G.roomsCleared = 0; G.t = 0; V.shakeAmt = 0;
    G.state = 'play'; G.stateT = 0; G.hint = 7; G.flash = null;
    G.banner = { txt: 'ROOM 1', t: 1.4, col: '#cfe6ff' };
    spawnRoom(G.room);
  }

  function spawnRoom(r) {
    var boss = (r % 5 === 0);
    var pool = ['husk', 'husk', 'skitter'];
    if (r >= 2) pool.push('lobber', 'skitter');
    if (r >= 3) pool.push('bracer', 'husk');
    if (r >= 4) pool.push('sapper', 'lobber');
    if (r >= 7) pool.push('bracer', 'sapper');
    var n = Math.min(26, 4 + Math.floor(r * 1.9));
    if (boss) n = Math.min(12, 3 + Math.floor(r * 0.7));
    var pace = Math.max(0.10, 0.28 - r * 0.010);
    G.spawns = [];
    for (var i = 0; i < n; i++) {
      G.spawns.push({ type: V.pick(pool), t: 0.25 + i * pace + (i > 7 ? (i - 7) * pace * 1.6 : 0), x: 0, y: 0, set: false });
    }
    if (boss) {
      G.spawns.push({ type: 'warden', t: 1.0, x: AR.x + AR.w / 2, y: AR.y + 70, set: true });
      G.banner = { txt: 'WARDEN APPROACHES', t: 2.0, col: '#e8437a' };
      V.sfx('boss');
    }
    for (var j = 0; j < G.spawns.length; j++) {
      var s = G.spawns[j];
      if (s.set) continue;
      var edge = V.randi(0, 4);
      if (edge === 0) { s.x = V.rand(AR.x + 24, AR.x + AR.w - 24); s.y = AR.y + 22; }
      else if (edge === 1) { s.x = AR.x + AR.w - 24; s.y = V.rand(AR.y + 24, AR.y + AR.h - 24); }
      else if (edge === 2) { s.x = V.rand(AR.x + 24, AR.x + AR.w - 24); s.y = AR.y + AR.h - 22; }
      else { s.x = AR.x + 24; s.y = V.rand(AR.y + 24, AR.y + AR.h - 24); }
      s.tel = 0;
    }
  }

  function spawnEnemy(type, x, y, r) {
    var d = V.ENEMIES[type];
    var scale = 1 + (G.room - 1) * 0.21;
    var hp = Math.round(d.hp * (d.boss ? (1 + (G.room / 5 - 1) * 0.85) : scale));
    G.enemies.push({
      type: type, def: d, x: x, y: y, vx: 0, vy: 0, a: Math.PI / 2,
      hp: hp, max: hp, r: d.r, dmg: Math.round(d.dmg * (1 + (G.room - 1) * 0.145)),
      state: 'walk', windT: 0, cd: V.rand(0.3, 1.0), stun: 0, flash: 0,
      dead: false, tgt: null, fuse: type === 'sapper' ? V.rand(7, 10) : 0,
      phase: 0, pcd: 2.0, jit: Math.random() * 6.28, spawnT: 0.35
    });
    V.ring(x, y, 26, d.col, 0.35);
  }

  /* ===================== UPDATE ===================== */
  function clampToArena(e) {
    var pad = e.r || 10;
    if (e.x < AR.x + pad) { e.x = AR.x + pad; e.vx = Math.abs(e.vx) * 0.3; }
    if (e.x > AR.x + AR.w - pad) { e.x = AR.x + AR.w - pad; e.vx = -Math.abs(e.vx) * 0.3; }
    if (e.y < AR.y + pad) { e.y = AR.y + pad; e.vy = Math.abs(e.vy) * 0.3; }
    if (e.y > AR.y + AR.h - pad) { e.y = AR.y + AR.h - pad; e.vy = -Math.abs(e.vy) * 0.3; }
  }

  function nearestHero(e) {
    var best = null, bd = 1e9;
    for (var i = 0; i < G.heroes.length; i++) {
      var h = G.heroes[i];
      if (h.downed) continue;
      var d = V.dist2(e, h);
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  }
  function nearestEnemy(p, maxd) {
    var best = null, bd = maxd ? maxd * maxd : 1e9;
    for (var i = 0; i < G.enemies.length; i++) {
      var d = V.dist2(p, G.enemies[i]);
      if (d < bd) { bd = d; best = G.enemies[i]; }
    }
    return best;
  }

  function tryAttack(h) {
    if (h.cd > 0 || h.stun > 0 || h.downed || h.sup) return;
    h.cd = h.kit.cd;
    h.kit.atk(h, G);
  }
  function trySuper(h) {
    if (h.meter < 100 || h.downed || h.sup) return;
    h.meter = 0;
    h.kit.sup(h, G);
    G.banner = { txt: h.name + ' SUPER', t: 1.1, col: h.col };
  }

  function updateHero(h, dt, isPlayer) {
    h.cd -= dt; h.comboT -= dt; h.inv -= dt; h.flash -= dt; h.stun -= dt;
    if (h.kit.tick) h.kit.tick(h, G, dt);

    if (h.downed) {
      h.vx *= 0.85; h.vy *= 0.85;
      h.x += h.vx * dt; h.y += h.vy * dt;
      // revive by nearby living ally
      var helper = null;
      for (var i = 0; i < G.heroes.length; i++) {
        var a = G.heroes[i];
        if (a === h || a.downed) continue;
        if (V.dist2(a, h) < 46 * 46) { helper = a; break; }
      }
      if (helper) {
        h.reviveP += dt / 1.6;
        if (h.reviveP >= 1) { G.reviveHero(h, 0.5); G.banner = { txt: h.name + ' REVIVED', t: 1.2, col: h.col }; }
        else if (Math.random() < 0.25) V.burst(h.x, h.y, 1, h.col, 60, 0.3, 2);
      } else h.reviveP = Math.max(0, h.reviveP - dt * 0.35);
      clampToArena(h);
      return;
    }

    var mv = { x: 0, y: 0, mag: 0 };
    if (isPlayer) {
      mv = V.moveVec();
      if (V.strikeHeld()) tryAttack(h);
    } else {
      mv = botThink(h, dt);
    }

    if (h.dashT > 0) {
      h.dashT -= dt;
      h.x += h.dvx * dt; h.y += h.dvy * dt;
      if (Math.random() < 0.6) V.burst(h.x, h.y, 1, h.col, 40, 0.25, 2.5);
    } else if (h.stun <= 0) {
      var sp = h.def.speed * (h.sup ? 0.4 : 1);
      h.vx = V.lerp(h.vx, mv.x * sp * mv.mag, 1 - Math.pow(0.001, dt));
      h.vy = V.lerp(h.vy, mv.y * sp * mv.mag, 1 - Math.pow(0.001, dt));
      if (mv.mag > 0.1) h.a = Math.atan2(mv.y, mv.x);
    }
    // face nearest enemy when standing still / attacking
    if (mv.mag < 0.12) {
      var e = nearestEnemy(h, h.kit.ranged ? 320 : 150);
      if (e) h.a = V.lerp(h.a, h.a + V.angDiff(V.angTo(h, e), h.a), Math.min(1, dt * 14));
    }
    h.x += h.vx * dt; h.y += h.vy * dt;
    h.vx *= Math.pow(0.02, dt); h.vy *= Math.pow(0.02, dt);
    clampToArena(h);
  }

  function botThink(h, dt) {
    h.botT -= dt;
    var mv = { x: 0, y: 0, mag: 0 };
    // 1. revive priority: closest living hero to a downed ally goes for it
    var target = null, mode = 'fight';
    var bestD = 1e9, downed = null;
    for (var i = 0; i < G.heroes.length; i++) {
      var d = G.heroes[i];
      if (!d.downed) continue;
      var mine = V.dist2(h, d);
      var closer = false;
      for (var j = 0; j < G.heroes.length; j++) {
        var o = G.heroes[j];
        if (o === h || o.downed || o.i === G.ctrl) continue;
        if (V.dist2(o, d) < mine) closer = true;
      }
      if (!closer && mine < bestD) { bestD = mine; downed = d; }
    }
    if (downed) { mode = 'revive'; target = downed; }
    else {
      target = h.aiTarget;
      if (h.botT <= 0 || !target || target.dead || G.enemies.indexOf(target) < 0) {
        h.botT = V.rand(0.6, 1.2);
        // prefer nearest, boss weighted
        var best = null, bd = 1e9;
        for (var k = 0; k < G.enemies.length; k++) {
          var e = G.enemies[k];
          var dd = V.dist2(h, e) * (e.def.boss ? 0.5 : 1) * (e.type === 'sapper' ? 0.55 : 1);
          if (dd < bd) { bd = dd; best = e; }
        }
        target = best; h.aiTarget = best;
      }
    }
    if (!target) {
      // idle: drift toward centre-ish of the pack
      var p = G.heroes[G.ctrl];
      if (p && p !== h && V.dist(h, p) > 90) {
        var ai = V.angTo(h, p);
        return { x: Math.cos(ai), y: Math.sin(ai), mag: 0.7 };
      }
      return mv;
    }

    var dist = V.dist(h, target);
    var ang = V.angTo(h, target);
    h.a = ang;

    if (mode === 'revive') {
      if (dist > 32) return { x: Math.cos(ang), y: Math.sin(ang), mag: 1 };
      return mv;
    }

    // super usage
    if (h.meter >= 100) {
      var near = 0;
      for (var m = 0; m < G.enemies.length; m++) if (V.dist2(h, G.enemies[m]) < 200 * 200) near++;
      if (near >= 3 || (target.def.boss && dist < 260) || G.enemies.length >= 5) trySuper(h);
    }

    var want = h.kit.prefer;
    h.botJit += dt * 1.4;
    var strafe = Math.sin(h.botJit) * 0.55;
    if (dist > want + 12) {
      mv.x = Math.cos(ang) - Math.sin(ang) * strafe * 0.4;
      mv.y = Math.sin(ang) + Math.cos(ang) * strafe * 0.4;
      mv.mag = 1;
    } else if (dist < want - 34 && h.kit.ranged) {
      mv.x = -Math.cos(ang); mv.y = -Math.sin(ang); mv.mag = 0.9;
    } else {
      mv.x = -Math.sin(ang) * strafe; mv.y = Math.cos(ang) * strafe; mv.mag = Math.abs(strafe);
    }
    var n = Math.sqrt(mv.x * mv.x + mv.y * mv.y) || 1;
    mv.x /= n; mv.y /= n;

    if (dist < h.kit.botRange) tryAttack(h);
    return mv;
  }

  function updateEnemy(e, dt) {
    e.flash -= dt; e.stun -= dt; e.cd -= dt;
    if (e.spawnT > 0) { e.spawnT -= dt; e.vx *= 0.8; e.vy *= 0.8; e.x += e.vx * dt; e.y += e.vy * dt; return; }
    var h = nearestHero(e);
    if (!h) { e.vx *= 0.9; e.vy *= 0.9; e.x += e.vx * dt; e.y += e.vy * dt; clampToArena(e); return; }
    var dist = V.dist(e, h), ang = V.angTo(e, h);
    var moving = true, sp = e.def.speed;

    if (e.stun > 0) { moving = false; }
    else if (e.state === 'wind') {
      e.windT -= dt; moving = false;
      e.a = V.lerp(e.a, e.a + V.angDiff(ang, e.a), Math.min(1, dt * 4));
      if (e.windT <= 0) {
        e.state = 'walk'; e.cd = e.def.atkcd;
        doEnemyAttack(e, h, ang);
      }
    } else {
      e.a = V.lerp(e.a, e.a + V.angDiff(ang, e.a), Math.min(1, dt * 6));
      switch (e.type) {
        case 'lobber':
          if (dist < 150) { e.mvang = ang + Math.PI; sp *= 1.1; }
          else e.mvang = ang;
          if (dist < e.def.reach && e.cd <= 0) { e.state = 'wind'; e.windT = e.def.wind; }
          break;
        case 'sapper':
          e.fuse -= dt; e.mvang = ang; sp *= 1.15;
          if (dist < e.def.reach || e.fuse <= 0) { e.state = 'wind'; e.windT = e.def.wind; e.arming = true; }
          break;
        case 'warden':
          updateWarden(e, h, dist, ang, dt);
          return;
        default:
          e.mvang = ang;
          if (dist < e.def.reach + e.r + h.r - 10 && e.cd <= 0) { e.state = 'wind'; e.windT = e.def.wind; }
          break;
      }
    }

    if (moving && e.mvang !== undefined) {
      e.jit += dt * 2;
      var jx = Math.cos(e.mvang) + Math.sin(e.mvang) * Math.sin(e.jit) * 0.25;
      var jy = Math.sin(e.mvang) - Math.cos(e.mvang) * Math.sin(e.jit) * 0.25;
      var n = Math.sqrt(jx * jx + jy * jy) || 1;
      e.vx = V.lerp(e.vx, jx / n * sp, 1 - Math.pow(0.005, dt));
      e.vy = V.lerp(e.vy, jy / n * sp, 1 - Math.pow(0.005, dt));
    }
    e.x += e.vx * dt; e.y += e.vy * dt;
    e.vx *= Math.pow(0.06, dt); e.vy *= Math.pow(0.06, dt);
    clampToArena(e);
  }

  function updateWarden(e, h, dist, ang, dt) {
    e.pcd -= dt;
    if (e.chargeT > 0) {
      e.chargeT -= dt;
      e.x += e.cvx * dt; e.y += e.cvy * dt;
      V.burst(e.x, e.y, 1, e.def.col, 60, 0.3, 4);
      for (var i = 0; i < G.heroes.length; i++) {
        var hh = G.heroes[i];
        if (!hh.downed && V.dist2(e, hh) < (e.r + hh.r + 4) * (e.r + hh.r + 4)) {
          G.damageHero(hh, e.dmg, V.angTo(e, hh), 340);
        }
      }
      clampToArena(e);
      if (e.chargeT <= 0) { e.pcd = 1.4; V.shake(4); }
      return;
    }
    if (e.state === 'wind') {
      e.windT -= dt;
      if (e.windT <= 0) {
        e.state = 'walk';
        if (e.next === 'slam') {
          for (var k = 0; k < 3; k++) {
            (function (kk) {
              setTimeout(function () {
                if (e.dead) return;
                G.addStrike({ x: e.x, y: e.y, r: 70 + kk * 55, arc: 6.3, dmg: 18, knock: 300, life: 0.12, col: e.def.col, team: 0 });
                V.ring(e.x, e.y, 70 + kk * 55, e.def.col, 0.4);
                V.shake(5); V.sfx('heavy');
              }, kk * 190);
            })(k);
          }
        } else if (e.next === 'summon') {
          for (var s = 0; s < 3; s++) {
            var a2 = Math.random() * 6.28;
            spawnEnemy(Math.random() < 0.5 ? 'skitter' : 'husk', V.clamp(e.x + Math.cos(a2) * 60, AR.x + 20, AR.x + AR.w - 20), V.clamp(e.y + Math.sin(a2) * 60, AR.y + 20, AR.y + AR.h - 20));
          }
          V.sfx('boss');
        } else {
          e.chargeT = 0.55;
          e.cvx = Math.cos(ang) * 480; e.cvy = Math.sin(ang) * 480;
          V.sfx('heavy');
        }
        e.pcd = 2.3;
      }
      return;
    }
    if (e.pcd <= 0) {
      e.state = 'wind'; e.windT = e.def.wind;
      var roll = Math.random();
      e.next = dist < 110 ? 'slam' : (roll < 0.4 ? 'charge' : (roll < 0.7 ? 'summon' : 'slam'));
      if (e.next === 'summon' && G.enemies.length > 12) e.next = 'slam';
      return;
    }
    e.a = V.lerp(e.a, e.a + V.angDiff(ang, e.a), Math.min(1, dt * 3));
    e.vx = V.lerp(e.vx, Math.cos(ang) * e.def.speed, 1 - Math.pow(0.02, dt));
    e.vy = V.lerp(e.vy, Math.sin(ang) * e.def.speed, 1 - Math.pow(0.02, dt));
    e.x += e.vx * dt; e.y += e.vy * dt;
    clampToArena(e);
  }

  function doEnemyAttack(e, h, ang) {
    if (e.type === 'lobber') {
      var a = V.angTo(e, h);
      G.addProj({ x: e.x, y: e.y, vx: Math.cos(a) * 230, vy: Math.sin(a) * 230, r: 7, dmg: e.dmg, team: 0, col: e.def.col, life: 2.0, split: 0 });
      V.sfx('shot');
    } else if (e.type === 'sapper') {
      G.addStrike({ x: e.x, y: e.y, r: 62, arc: 6.3, dmg: e.dmg, knock: 300, life: 0.12, col: '#ff7a3c', team: 0 });
      V.burst(e.x, e.y, 22, '#ff7a3c', 300, 0.5, 4);
      V.ring(e.x, e.y, 62, '#ffb03c', 0.4);
      V.shake(7); V.sfx('heavy');
      e.hp = 0; killEnemy(e, null); G.score -= e.def.score; G.kills--;
      if (G.kills < 0) G.kills = 0;
    } else {
      G.addStrike({ x: e.x + Math.cos(e.a) * (e.r + 8), y: e.y + Math.sin(e.a) * (e.r + 8), r: e.def.reach, arc: 1.9, a: e.a, dmg: e.dmg, knock: 190, life: 0.11, col: e.def.col, team: 0 });
      V.sfx('slash');
    }
  }

  function updateStrikes(dt) {
    for (var i = G.strikes.length - 1; i >= 0; i--) {
      var s = G.strikes[i];
      s.life -= dt;
      if (s.owner && s.follow) {
        s.x = s.owner.x + Math.cos(s.owner.a) * (s.ox || 0);
        s.y = s.owner.y + Math.sin(s.owner.a) * (s.ox || 0);
        s.a = s.owner.a;
      }
      var list = s.team === 1 ? G.enemies : G.heroes;
      for (var j = 0; j < list.length; j++) {
        var t = list[j];
        if (s.hit.indexOf(t) >= 0) continue;
        if (s.team === 0 && (t.downed || t.inv > 0)) continue;
        var rr = s.r + t.r;
        if (V.dist2(s, t) > rr * rr) continue;
        if (s.arc < 6.2) {
          var ta = V.angTo(s, t);
          if (Math.abs(V.angDiff(ta, s.a)) > s.arc * 0.5 && V.dist2(s, t) > (t.r + 6) * (t.r + 6)) continue;
        }
        s.hit.push(t);
        if (s.team === 1) G.damageEnemy(t, s.dmg, s.owner || null, s.knock, V.angTo(s, t), s.stun);
        else G.damageHero(t, s.dmg, V.angTo(s, t), s.knock);
      }
      if (s.life <= 0) G.strikes.splice(i, 1);
    }
  }

  function updateProjs(dt) {
    for (var i = G.projs.length - 1; i >= 0; i--) {
      var p = G.projs[i];
      p.life -= dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (Math.random() < 0.5) V.burst(p.x, p.y, 1, p.col, 20, 0.22, p.r * 0.6);
      var gone = p.life <= 0 || p.x < AR.x - 20 || p.x > AR.x + AR.w + 20 || p.y < AR.y - 20 || p.y > AR.y + AR.h + 20;
      var hitAny = false;
      var list = p.team === 1 ? G.enemies : G.heroes;
      for (var j = 0; j < list.length; j++) {
        var t = list[j];
        if (p.team === 0 && (t.downed || t.inv > 0)) continue;
        var rr = p.r + t.r;
        if (V.dist2(p, t) < rr * rr) {
          if (p.team === 1) G.damageEnemy(t, p.dmg, p.src || null, 90, Math.atan2(p.vy, p.vx));
          else G.damageHero(t, p.dmg, Math.atan2(p.vy, p.vx), 120);
          V.burst(p.x, p.y, 6, p.col, 160, 0.3, 3);
          hitAny = true;
          break;
        }
      }
      if (hitAny && p.split) {
        for (var k = 0; k < p.split; k++) {
          var a = Math.random() * 6.28;
          G.addProj({ x: p.x, y: p.y, vx: Math.cos(a) * 300, vy: Math.sin(a) * 300, r: 5, dmg: p.dmg * 0.5, team: p.team, col: p.col, life: 0.55, split: 0, src: p.src });
        }
      }
      if (hitAny || gone) G.projs.splice(i, 1);
    }
  }

  function updateFields(dt) {
    for (var i = G.wells.length - 1; i >= 0; i--) {
      var w = G.wells[i];
      w.t -= dt;
      for (var j = 0; j < G.enemies.length; j++) {
        var e = G.enemies[j];
        var d = V.dist(w, e);
        if (d < w.r) {
          var a = V.angTo(e, w);
          var pull = (1 - d / w.r) * 900 * dt;
          e.vx += Math.cos(a) * pull; e.vy += Math.sin(a) * pull;
          e.stun = Math.max(e.stun, 0.15);
        }
      }
      if (Math.random() < 0.9) V.burst(w.x + V.rand(-w.r, w.r) * 0.5, w.y + V.rand(-w.r, w.r) * 0.5, 1, w.owner ? w.owner.col : '#ff9a3c', 30, 0.35, 3);
      if (w.t <= 0) {
        G.addStrike({ x: w.x, y: w.y, r: 130, arc: 6.3, dmg: 60, knock: 420, life: 0.14, col: '#ffcf8a', team: 1, stun: 0.7 });
        V.ring(w.x, w.y, 130, '#ffcf8a', 0.45); V.ring(w.x, w.y, 80, '#fff', 0.35);
        V.burst(w.x, w.y, 30, '#ff9a3c', 380, 0.6, 5);
        V.shake(12); V.sfx('heavy');
        G.wells.splice(i, 1);
      }
    }
    for (var n = G.novas.length - 1; n >= 0; n--) {
      var nv = G.novas[n];
      nv.t -= dt;
      nv.r = nv.maxr * (1 - nv.t / nv.max);
      for (var m = 0; m < G.enemies.length; m++) {
        var en = G.enemies[m];
        if (nv.hit.indexOf(en) >= 0) continue;
        if (V.dist(nv, en) < nv.r + en.r) {
          nv.hit.push(en);
          G.damageEnemy(en, nv.dmg, null, 260, V.angTo(nv, en), 0.4);
        }
      }
      if (nv.t <= 0) G.novas.splice(n, 1);
    }
    for (var b = G.bolts.length - 1; b >= 0; b--) { G.bolts[b].t -= dt; if (G.bolts[b].t <= 0) G.bolts.splice(b, 1); }
    for (var c = G.arcs.length - 1; c >= 0; c--) {
      var ac = G.arcs[c];
      ac.t -= dt;
      if (ac.owner) { ac.x = ac.owner.x; ac.y = ac.owner.y; }
      if (ac.t <= 0) G.arcs.splice(c, 1);
    }
  }

  function separate() {
    var all = G.enemies;
    for (var i = 0; i < all.length; i++) {
      for (var j = i + 1; j < all.length; j++) {
        var a = all[i], b = all[j];
        var dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r;
        var d2 = dx * dx + dy * dy;
        if (d2 > rr * rr || d2 < 0.001) continue;
        var d = Math.sqrt(d2), push = (rr - d) * 0.5;
        var ux = dx / d, uy = dy / d;
        var wa = a.def.boss ? 0.1 : 1, wb = b.def.boss ? 0.1 : 1;
        a.x -= ux * push * wa; a.y -= uy * push * wa;
        b.x += ux * push * wb; b.y += uy * push * wb;
      }
    }
    for (var k = 0; k < G.heroes.length; k++) {
      for (var l = k + 1; l < G.heroes.length; l++) {
        var h1 = G.heroes[k], h2 = G.heroes[l];
        if (h1.downed && h2.downed) continue;
        var ddx = h2.x - h1.x, ddy = h2.y - h1.y, r2 = 24;
        var dd2 = ddx * ddx + ddy * ddy;
        if (dd2 > r2 * r2 || dd2 < 0.001) continue;
        var dd = Math.sqrt(dd2), pp = (r2 - dd) * 0.4;
        if (!h1.downed) { h1.x -= ddx / dd * pp; h1.y -= ddy / dd * pp; }
        if (!h2.downed) { h2.x += ddx / dd * pp; h2.y += ddy / dd * pp; }
      }
    }
  }

  function update(dt) {
    G.t += dt;
    V.updateParts(dt);
    V.shakeAmt *= Math.pow(0.02, dt);
    if (G.flash) { G.flash.t -= dt; if (G.flash.t <= 0) G.flash = null; }
    if (G.banner) { G.banner.t -= dt; if (G.banner.t <= 0) G.banner = null; }
    if (G.hint > 0) G.hint -= dt;

    var swap = V.takeSwap();
    var sup = V.takeSuper();

    if (G.state === 'over') {
      G.stateT += dt;
      if (V.takeTap() && G.stateT > 0.7) newRun();
      // let particles settle
      for (var q = 0; q < G.enemies.length; q++) { G.enemies[q].vx *= 0.9; G.enemies[q].vy *= 0.9; }
      return;
    }

    if (swap >= 0) setCtrl(swap);
    if (sup) trySuper(G.heroes[G.ctrl]);

    for (var i = 0; i < G.heroes.length; i++) updateHero(G.heroes[i], dt, i === G.ctrl);
    for (var j = G.enemies.length - 1; j >= 0; j--) {
      if (G.enemies[j].dead) { G.enemies.splice(j, 1); continue; }
      updateEnemy(G.enemies[j], dt);
    }
    separate();
    updateStrikes(dt);
    updateProjs(dt);
    updateFields(dt);

    // spawn queue
    for (var s = G.spawns.length - 1; s >= 0; s--) {
      var sp = G.spawns[s];
      sp.t -= dt;
      if (sp.t <= 0) { spawnEnemy(sp.type, sp.x, sp.y); G.spawns.splice(s, 1); }
      else if (sp.t < 0.45 && Math.random() < 0.4) V.burst(sp.x, sp.y, 1, '#ffffff', 40, 0.3, 2);
    }

    if (G.state === 'play') {
      if (!G.enemies.length && !G.spawns.length) {
        G.state = 'clear'; G.stateT = 0;
        G.roomsCleared++;
        G.score += 100 + G.room * 10;
        V.sfx('clear');
        G.banner = { txt: 'ROOM CLEAR', t: 1.8, col: '#9ef7c3' };
      }
    } else if (G.state === 'clear') {
      G.stateT += dt;
      if (G.stateT > 2.4) {
        for (var h = 0; h < G.heroes.length; h++) {
          var hero = G.heroes[h];
          var healf = Math.max(0.10, 0.22 - G.room * 0.006);
          if (hero.downed) G.reviveHero(hero, Math.max(0.28, 0.45 - G.room * 0.008));
          else hero.hp = Math.min(hero.max, hero.hp + hero.max * healf);
          hero.meter = Math.min(100, hero.meter + 15);
        }
        if (G.score > G.best) { G.best = G.score; saveBest(); }
        G.room++;
        G.state = 'play';
        spawnRoom(G.room);
        if (G.room % 5 !== 0) G.banner = { txt: 'ROOM ' + G.room, t: 1.3, col: '#cfe6ff' };
      }
    }

  }

  /* ===================== RENDER ===================== */
  function rr(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function drawArena(c) {
    var g = c.createLinearGradient(0, AR.y, 0, AR.y + AR.h);
    g.addColorStop(0, '#161d2b');
    g.addColorStop(1, '#0d121c');
    c.fillStyle = g;
    rr(c, AR.x, AR.y, AR.w, AR.h, 14); c.fill();
    c.save();
    rr(c, AR.x, AR.y, AR.w, AR.h, 14); c.clip();
    c.strokeStyle = 'rgba(255,255,255,0.045)'; c.lineWidth = 1;
    var step = 44;
    c.beginPath();
    for (var x = AR.x; x < AR.x + AR.w; x += step) { c.moveTo(x, AR.y); c.lineTo(x, AR.y + AR.h); }
    for (var y = AR.y; y < AR.y + AR.h; y += step) { c.moveTo(AR.x, y); c.lineTo(AR.x + AR.w, y); }
    c.stroke();
    // centre mark
    c.strokeStyle = 'rgba(120,180,255,0.10)'; c.lineWidth = 2;
    c.beginPath(); c.arc(AR.x + AR.w / 2, AR.y + AR.h / 2, 60, 0, 6.2832); c.stroke();
    c.restore();
    c.strokeStyle = 'rgba(140,190,255,0.22)'; c.lineWidth = 2;
    rr(c, AR.x, AR.y, AR.w, AR.h, 14); c.stroke();
  }

  function drawHeroShape(c, h) {
    var s = h.def.sym;
    c.save();
    c.translate(h.x, h.y);
    c.rotate(h.a);
    var col = h.flash > 0 ? '#ffffff' : h.col;
    if (h.downed) col = '#5a6472';
    // body
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(14, 0); c.lineTo(-8, 10); c.lineTo(-5, 0); c.lineTo(-8, -10);
    c.closePath(); c.fill();
    c.fillStyle = h.def.dark;
    c.beginPath(); c.arc(0, 0, 6, 0, 6.2832); c.fill();
    // kit flourish
    c.strokeStyle = col; c.lineWidth = 2;
    if (s === 'blade') { c.beginPath(); c.moveTo(6, -6); c.lineTo(20, -10); c.stroke(); }
    else if (s === 'fist') { c.fillStyle = col; c.fillRect(8, -7, 8, 14); }
    else if (s === 'lamp') { c.beginPath(); c.arc(12, 0, 4, 0, 6.2832); c.stroke(); }
    else { c.beginPath(); c.moveTo(8, -8); c.lineTo(16, 0); c.lineTo(8, 8); c.stroke(); }
    c.restore();
  }

  function drawHero(c, h) {
    var isP = h.i === G.ctrl;
    // shadow
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.beginPath(); c.ellipse(h.x, h.y + 12, 12, 5, 0, 0, 6.2832); c.fill();

    if (h.downed) {
      c.save();
      c.globalAlpha = 0.55;
      c.translate(h.x, h.y); c.rotate(G.t * 0.6);
      c.fillStyle = '#5a6472';
      c.fillRect(-10, -4, 20, 8);
      c.restore();
      // revive ring
      c.strokeStyle = 'rgba(255,90,90,0.8)'; c.lineWidth = 3;
      c.beginPath(); c.arc(h.x, h.y, 20, -1.57, -1.57 + 6.2832 * h.reviveP); c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.15)'; c.lineWidth = 1;
      c.beginPath(); c.arc(h.x, h.y, 20, 0, 6.2832); c.stroke();
      c.fillStyle = '#ff8a8a'; c.font = '700 9px system-ui,sans-serif'; c.textAlign = 'center';
      c.fillText('DOWN', h.x, h.y - 26);
      return;
    }

    if (isP) {
      c.strokeStyle = h.col; c.globalAlpha = 0.55 + Math.sin(G.t * 5) * 0.15;
      c.lineWidth = 2;
      c.beginPath(); c.arc(h.x, h.y, 20, 0, 6.2832); c.stroke();
      c.globalAlpha = 1;
    }
    if (h.inv > 0 && Math.floor(G.t * 30) % 2 === 0) c.globalAlpha = 0.55;
    if (h.sup) {
      c.globalAlpha = 1;
      c.strokeStyle = '#fff'; c.lineWidth = 2;
      c.beginPath(); c.arc(h.x, h.y, 24 + Math.sin(G.t * 20) * 3, 0, 6.2832); c.stroke();
    }
    drawHeroShape(c, h);
    c.globalAlpha = 1;

    // tiny hp pip
    var w = 22, hp = V.clamp(h.hp / h.max, 0, 1);
    c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(h.x - w / 2, h.y - 22, w, 3);
    c.fillStyle = hp > 0.35 ? h.col : '#ff5252';
    c.fillRect(h.x - w / 2, h.y - 22, w * hp, 3);
  }

  function drawEnemy(c, e) {
    var col = e.flash > 0 ? '#ffffff' : e.def.col;
    var pulse = e.state === 'wind' ? (0.5 + Math.sin(G.t * 40) * 0.5) : 0;
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.beginPath(); c.ellipse(e.x, e.y + e.r * 0.8, e.r * 0.9, e.r * 0.35, 0, 0, 6.2832); c.fill();

    if (e.spawnT > 0) {
      c.globalAlpha = 1 - e.spawnT / 0.35;
    }
    c.save();
    c.translate(e.x, e.y); c.rotate(e.a);
    c.fillStyle = col;
    c.strokeStyle = e.def.dark; c.lineWidth = 2;
    switch (e.type) {
      case 'husk':
        c.fillRect(-e.r * 0.8, -e.r * 0.8, e.r * 1.6, e.r * 1.6);
        c.fillStyle = e.def.dark; c.fillRect(e.r * 0.2, -3, 6, 6);
        break;
      case 'skitter':
        c.beginPath(); c.moveTo(e.r, 0); c.lineTo(-e.r * 0.7, e.r * 0.8); c.lineTo(-e.r * 0.7, -e.r * 0.8); c.closePath(); c.fill();
        break;
      case 'lobber':
        c.beginPath();
        for (var i = 0; i < 5; i++) { var a = i / 5 * 6.2832; c[i ? 'lineTo' : 'moveTo'](Math.cos(a) * e.r, Math.sin(a) * e.r); }
        c.closePath(); c.fill();
        c.fillStyle = '#fff'; c.beginPath(); c.arc(4, 0, 3, 0, 6.2832); c.fill();
        break;
      case 'bracer':
        c.beginPath();
        for (var j = 0; j < 6; j++) { var b = j / 6 * 6.2832; c[j ? 'lineTo' : 'moveTo'](Math.cos(b) * e.r, Math.sin(b) * e.r); }
        c.closePath(); c.fill();
        c.strokeStyle = '#fff4d0'; c.lineWidth = 4;
        c.beginPath(); c.arc(0, 0, e.r + 4, -0.9, 0.9); c.stroke();
        break;
      case 'sapper':
        c.beginPath(); c.arc(0, 0, e.r + Math.sin(G.t * 12) * 1.5, 0, 6.2832); c.fill();
        c.fillStyle = '#ffdf5f';
        c.beginPath(); c.arc(0, 0, 4 + pulse * 3, 0, 6.2832); c.fill();
        break;
      case 'warden':
        c.beginPath();
        for (var k = 0; k < 8; k++) { var w2 = k / 8 * 6.2832; c[k ? 'lineTo' : 'moveTo'](Math.cos(w2) * e.r, Math.sin(w2) * e.r * 0.92); }
        c.closePath(); c.fill();
        c.fillStyle = e.def.dark;
        c.beginPath(); c.arc(0, 0, e.r * 0.5, 0, 6.2832); c.fill();
        c.fillStyle = '#ffe0ec';
        c.beginPath(); c.arc(e.r * 0.55, 0, 6, 0, 6.2832); c.fill();
        break;
    }
    c.restore();

    if (e.state === 'wind') {
      c.strokeStyle = 'rgba(255,80,80,' + (0.35 + pulse * 0.5) + ')';
      c.lineWidth = 2;
      c.beginPath(); c.arc(e.x, e.y, e.r + 8 + pulse * 4, 0, 6.2832); c.stroke();
      if (e.type !== 'sapper' && e.type !== 'lobber') {
        c.fillStyle = 'rgba(255,80,80,0.16)';
        c.beginPath();
        c.moveTo(e.x, e.y);
        c.arc(e.x, e.y, e.def.reach + e.r, e.a - 0.95, e.a + 0.95);
        c.closePath(); c.fill();
      }
    }
    if (e.chargeT > 0) {
      c.strokeStyle = 'rgba(255,120,170,0.6)'; c.lineWidth = 3;
      c.beginPath(); c.arc(e.x, e.y, e.r + 6, 0, 6.2832); c.stroke();
    }

    // hp bar
    if (e.hp < e.max) {
      var bw = e.def.boss ? 0 : e.r * 2.2;
      if (bw) {
        c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(e.x - bw / 2, e.y - e.r - 9, bw, 3);
        c.fillStyle = '#ff6b6b'; c.fillRect(e.x - bw / 2, e.y - e.r - 9, bw * V.clamp(e.hp / e.max, 0, 1), 3);
      }
    }
    c.globalAlpha = 1;
  }

  function drawBossBar(c) {
    var boss = null;
    for (var i = 0; i < G.enemies.length; i++) if (G.enemies[i].def.boss) boss = G.enemies[i];
    if (!boss) return;
    var w = AR.w - 40, x = AR.x + 20, y = AR.y + 8;
    c.fillStyle = 'rgba(0,0,0,0.6)'; rr(c, x, y, w, 9, 4); c.fill();
    c.fillStyle = '#e8437a';
    rr(c, x, y, w * V.clamp(boss.hp / boss.max, 0, 1), 9, 4); c.fill();
    c.fillStyle = '#ffd0e0'; c.font = '700 9px system-ui,sans-serif'; c.textAlign = 'center';
    c.fillText('WARDEN', AR.x + AR.w / 2, y + 21);
  }

  function drawEffects(c) {
    // wells
    for (var i = 0; i < G.wells.length; i++) {
      var w = G.wells[i], k = w.t / w.max;
      var g = c.createRadialGradient(w.x, w.y, 4, w.x, w.y, w.r * (0.4 + 0.6 * (1 - k)));
      g.addColorStop(0, 'rgba(255,180,90,0.55)');
      g.addColorStop(1, 'rgba(255,120,40,0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(w.x, w.y, w.r, 0, 6.2832); c.fill();
      c.strokeStyle = 'rgba(255,200,130,0.7)'; c.lineWidth = 2;
      c.beginPath(); c.arc(w.x, w.y, 20 + 40 * k, 0, 6.2832); c.stroke();
    }
    // novas
    for (var n = 0; n < G.novas.length; n++) {
      var nv = G.novas[n], t = nv.t / nv.max;
      c.strokeStyle = nv.col; c.globalAlpha = t;
      c.lineWidth = 8 * t + 2;
      c.beginPath(); c.arc(nv.x, nv.y, nv.r, 0, 6.2832); c.stroke();
      c.globalAlpha = 1;
    }
    // arcs (melee swings)
    for (var a = 0; a < G.arcs.length; a++) {
      var ac = G.arcs[a], k2 = ac.t / ac.max;
      c.globalAlpha = k2 * 0.6;
      c.fillStyle = ac.col;
      c.beginPath();
      c.moveTo(ac.x, ac.y);
      c.arc(ac.x, ac.y, ac.r * (1.1 - 0.25 * k2), ac.a - ac.arc / 2, ac.a + ac.arc / 2);
      c.closePath(); c.fill();
      c.globalAlpha = 1;
    }
    // bolts
    for (var b = 0; b < G.bolts.length; b++) {
      var bo = G.bolts[b];
      c.globalAlpha = V.clamp(bo.t / 0.16, 0, 1);
      c.strokeStyle = bo.col; c.lineWidth = 3;
      c.beginPath();
      c.moveTo(bo.ax, bo.ay);
      var segs = 4;
      for (var s = 1; s < segs; s++) {
        var tt = s / segs;
        c.lineTo(V.lerp(bo.ax, bo.bx, tt) + V.rand(-7, 7), V.lerp(bo.ay, bo.by, tt) + V.rand(-7, 7));
      }
      c.lineTo(bo.bx, bo.by);
      c.stroke();
      c.globalAlpha = 1;
    }
    // projectiles
    for (var p = 0; p < G.projs.length; p++) {
      var pr = G.projs[p];
      c.fillStyle = pr.col;
      c.beginPath(); c.arc(pr.x, pr.y, pr.r, 0, 6.2832); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 1;
      c.beginPath(); c.arc(pr.x, pr.y, pr.r + 2, 0, 6.2832); c.stroke();
    }
    // spawn telegraphs
    for (var sp = 0; sp < G.spawns.length; sp++) {
      var s2 = G.spawns[sp];
      if (s2.t > 1.2) continue;
      c.strokeStyle = 'rgba(255,255,255,0.4)'; c.lineWidth = 2;
      c.beginPath(); c.arc(s2.x, s2.y, 8 + (1.2 - Math.max(0, s2.t)) * 12, 0, 6.2832); c.stroke();
    }
  }

  function drawPortraits(c) {
    var L = V.layout;
    for (var i = 0; i < 4; i++) {
      var p = L.ports[i], h = G.heroes[i];
      if (!h) continue;
      var active = i === G.ctrl;
      c.fillStyle = active ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.05)';
      rr(c, p.x, p.y, p.w, p.h, 7); c.fill();
      c.strokeStyle = h.downed ? 'rgba(255,80,80,0.85)' : (active ? h.col : 'rgba(255,255,255,0.18)');
      c.lineWidth = active ? 2.5 : 1.2;
      rr(c, p.x, p.y, p.w, p.h, 7); c.stroke();

      c.fillStyle = h.downed ? '#ff7676' : h.col;
      c.font = '700 10px system-ui,sans-serif'; c.textAlign = 'left';
      c.fillText(h.name, p.x + 6, p.y + 14);
      c.fillStyle = 'rgba(255,255,255,0.35)';
      c.font = '600 8px system-ui,sans-serif';
      c.fillText(String(i + 1), p.x + p.w - 10, p.y + 14);

      // hp bar
      var bw = p.w - 12;
      c.fillStyle = 'rgba(0,0,0,0.5)'; rr(c, p.x + 6, p.y + 20, bw, 6, 3); c.fill();
      if (!h.downed) {
        c.fillStyle = h.hp / h.max > 0.3 ? '#66e08a' : '#ff5252';
        rr(c, p.x + 6, p.y + 20, bw * V.clamp(h.hp / h.max, 0, 1), 6, 3); c.fill();
      } else {
        c.fillStyle = '#ff5252';
        rr(c, p.x + 6, p.y + 20, bw * V.clamp(h.reviveP, 0, 1), 6, 3); c.fill();
      }
      // super meter
      c.fillStyle = 'rgba(0,0,0,0.5)'; rr(c, p.x + 6, p.y + 29, bw, 5, 2.5); c.fill();
      var full = h.meter >= 100;
      c.fillStyle = full ? (Math.floor(G.t * 8) % 2 ? '#ffffff' : h.col) : 'rgba(180,220,255,0.75)';
      rr(c, p.x + 6, p.y + 29, bw * V.clamp(h.meter / 100, 0, 1), 5, 2.5); c.fill();

      c.fillStyle = h.downed ? '#ff7676' : 'rgba(255,255,255,0.5)';
      c.font = '600 8px system-ui,sans-serif'; c.textAlign = 'left';
      c.fillText(h.downed ? 'DOWNED' : (full ? 'SUPER READY' : h.def.title), p.x + 6, p.y + 45);
      if (active) {
        c.fillStyle = h.col;
        rr(c, p.x + 6, p.y + 49, p.w - 12, 3, 1.5); c.fill();
      }
    }
  }

  function drawHUD(c) {
    drawPortraits(c);
    c.textAlign = 'left';
    c.fillStyle = 'rgba(200,220,255,0.85)';
    c.font = '700 11px system-ui,sans-serif';
    c.fillText('ROOM ' + G.room, 10, 80);
    c.fillStyle = 'rgba(255,255,255,0.75)';
    c.fillText('SCORE ' + G.score, 78, 80);
    c.fillStyle = 'rgba(255,255,255,0.45)';
    c.fillText('KILLS ' + G.kills, 168, 80);
    c.fillText('BEST ' + Math.max(G.best, G.score), 232, 80);
    // mute
    var m = V.layout.mute;
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.font = '600 9px system-ui,sans-serif'; c.textAlign = 'right';
    c.fillText(V.isMuted() ? 'SND OFF' : 'SND ON', m.x + m.w, m.y + 12);
  }

  function drawControls(c) {
    var L = V.layout, IN = V.in;
    // stick
    if (IN.stick.on) {
      c.strokeStyle = 'rgba(255,255,255,0.22)'; c.lineWidth = 2;
      c.beginPath(); c.arc(IN.stick.ox, IN.stick.oy, 52, 0, 6.2832); c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.16)';
      c.beginPath(); c.arc(IN.stick.ox + IN.stick.dx * IN.stick.mag * 52, IN.stick.oy + IN.stick.dy * IN.stick.mag * 52, 22, 0, 6.2832); c.fill();
    } else {
      c.strokeStyle = 'rgba(255,255,255,0.10)'; c.lineWidth = 2;
      c.beginPath(); c.arc(72, H - 56, 44, 0, 6.2832); c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.08)';
      c.beginPath(); c.arc(72, H - 56, 20, 0, 6.2832); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.30)';
      c.font = '600 9px system-ui,sans-serif'; c.textAlign = 'center';
      c.fillText('MOVE', 72, H - 8);
    }

    var h = G.heroes[G.ctrl];
    // strike
    var sb = L.strike;
    c.fillStyle = IN.strike ? 'rgba(255,255,255,0.26)' : 'rgba(255,255,255,0.11)';
    c.beginPath(); c.arc(sb.x, sb.y, sb.r, 0, 6.2832); c.fill();
    c.strokeStyle = h ? h.col : '#fff'; c.lineWidth = 2.5;
    c.beginPath(); c.arc(sb.x, sb.y, sb.r, 0, 6.2832); c.stroke();
    c.fillStyle = '#fff'; c.font = '800 13px system-ui,sans-serif'; c.textAlign = 'center';
    c.fillText('STRIKE', sb.x, sb.y + 5);

    // super
    var ub = L.sup;
    var ready = h && h.meter >= 100;
    c.fillStyle = ready ? (Math.floor(G.t * 8) % 2 ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.20)') : 'rgba(255,255,255,0.06)';
    c.beginPath(); c.arc(ub.x, ub.y, ub.r, 0, 6.2832); c.fill();
    c.strokeStyle = ready ? (h ? h.col : '#fff') : 'rgba(255,255,255,0.18)';
    c.lineWidth = 2.5;
    c.beginPath(); c.arc(ub.x, ub.y, ub.r, 0, 6.2832); c.stroke();
    if (h && !ready) {
      c.strokeStyle = h.col; c.lineWidth = 3;
      c.beginPath(); c.arc(ub.x, ub.y, ub.r - 2, -1.57, -1.57 + 6.2832 * (h.meter / 100)); c.stroke();
    }
    c.fillStyle = ready ? '#fff' : 'rgba(255,255,255,0.45)';
    c.font = '800 11px system-ui,sans-serif';
    c.fillText('SUPER', ub.x, ub.y + 4);
  }

  function drawOverlays(c) {
    if (G.hint > 0 && G.state !== 'over') {
      c.globalAlpha = V.clamp(G.hint / 1.5, 0, 1);
      c.fillStyle = 'rgba(0,0,0,0.55)';
      rr(c, 10, AR.y + AR.h - 34, AR.w, 26, 8); c.fill();
      c.fillStyle = '#dfe9ff'; c.font = '600 10px system-ui,sans-serif'; c.textAlign = 'center';
      c.fillText('Drag left to move  ·  STRIKE to fight  ·  tap a portrait to swap hero', W / 2, AR.y + AR.h - 17);
      c.globalAlpha = 1;
    }
    if (G.banner) {
      var k = V.clamp(G.banner.t / 0.4, 0, 1);
      c.globalAlpha = k;
      c.fillStyle = G.banner.col;
      c.font = '800 20px system-ui,sans-serif'; c.textAlign = 'center';
      c.fillText(G.banner.txt, W / 2, AR.y + AR.h * 0.32);
      c.globalAlpha = 1;
    }
    if (G.state === 'clear') {
      c.fillStyle = 'rgba(255,255,255,0.7)';
      c.font = '700 12px system-ui,sans-serif'; c.textAlign = 'center';
      c.fillText('Regrouping  ·  allies revived', W / 2, AR.y + AR.h * 0.42);
    }
    if (G.state === 'over') {
      c.fillStyle = 'rgba(4,7,14,0.82)';
      c.fillRect(0, 0, W, H);
      c.textAlign = 'center';
      c.fillStyle = '#ff5f7a'; c.font = '800 30px system-ui,sans-serif';
      c.fillText('SQUAD DOWN', W / 2, H * 0.34);
      c.fillStyle = '#e8f0ff'; c.font = '700 15px system-ui,sans-serif';
      c.fillText('SCORE ' + G.score, W / 2, H * 0.34 + 40);
      c.fillStyle = 'rgba(255,255,255,0.65)'; c.font = '600 12px system-ui,sans-serif';
      c.fillText('Rooms cleared ' + G.roomsCleared + '   ·   Kills ' + G.kills, W / 2, H * 0.34 + 64);
      c.fillStyle = '#ffe45e';
      c.fillText('BEST ' + G.best, W / 2, H * 0.34 + 88);
      if (G.stateT > 0.7) {
        c.globalAlpha = 0.6 + Math.sin(G.t * 5) * 0.4;
        c.fillStyle = '#9ef7c3'; c.font = '800 14px system-ui,sans-serif';
        c.fillText('TAP  or  press any key  to REDEPLOY', W / 2, H * 0.34 + 128);
        c.globalAlpha = 1;
      }
    }
  }

  function render() {
    var c = ctx;
    c.setTransform(SC, 0, 0, SC, 0, 0);
    c.fillStyle = '#080b12';
    c.fillRect(0, 0, W, H);

    var sh = V.shakeAmt;
    c.save();
    if (sh > 0.3) c.translate(V.rand(-sh, sh) * 0.6, V.rand(-sh, sh) * 0.6);

    drawArena(c);
    c.save();
    rr(c, AR.x, AR.y, AR.w, AR.h, 14); c.clip();
    drawEffects(c);
    for (var i = 0; i < G.enemies.length; i++) drawEnemy(c, G.enemies[i]);
    for (var j = 0; j < G.heroes.length; j++) if (G.heroes[j].downed) drawHero(c, G.heroes[j]);
    for (var k = 0; k < G.heroes.length; k++) if (!G.heroes[k].downed) drawHero(c, G.heroes[k]);
    V.drawParts(c);
    c.restore();
    drawBossBar(c);
    c.restore();

    if (G.flash) {
      c.globalAlpha = V.clamp(G.flash.t / G.flash.max, 0, 1) * 0.35;
      c.fillStyle = G.flash.col;
      c.fillRect(0, 0, W, H);
      c.globalAlpha = 1;
    }

    drawHUD(c);
    drawControls(c);
    drawOverlays(c);
  }

  /* ===================== LOOP ===================== */
  var last = 0, acc = 0;
  function frame(ts) {
    if (!last) last = ts;
    var dt = (ts - last) / 1000;
    last = ts;
    if (dt > 0.05) dt = 0.05;
    if (dt < 0) dt = 0;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  resize();
  root.addEventListener('resize', function () { resize(); });
  root.addEventListener('orientationchange', function () { setTimeout(resize, 120); });
  V.bindInput(canvas);
  loadBest();
  newRun();
  requestAnimationFrame(frame);
})(window);
