/* Bulwark - lane tower defense with maze building. Vanilla canvas. */
'use strict';
(function () {

var cv = document.getElementById('c');
var ctx = cv.getContext('2d', { alpha: false });

/* ---------------- layout ---------------- */
var L = { w: 390, h: 700, s: 1, hud: 58, bar: 96, cell: 48, cols: 8, rows: 15, gx: 0, gy: 0 };
var rowsLocked = 0;

function resize() {
  var w = window.innerWidth, h = window.innerHeight;
  L.w = w; L.h = h;
  var dpr = Math.min(2, window.devicePixelRatio || 1);
  var longAxis = Math.max(w, h);
  var s = Math.min(dpr, 960 / longAxis);
  s = Math.max(s, 0.6);
  L.s = s;
  cv.width = Math.round(w * s);
  cv.height = Math.round(h * s);
  ctx.setTransform(s, 0, 0, s, 0, 0);
  L.hud = Math.round(Math.min(64, Math.max(52, h * 0.082)));
  L.bar = Math.round(Math.min(104, Math.max(84, h * 0.135)));
  var gh = h - L.hud - L.bar;
  if (!rowsLocked) {
    var c0 = w / L.cols;
    rowsLocked = E.clamp(Math.floor(gh / c0), 9, 20);
  }
  L.rows = rowsLocked;
  L.cell = Math.min(w / L.cols, gh / L.rows);
  L.gx = (w - L.cols * L.cell) / 2;
  L.gy = L.hud + (gh - L.rows * L.cell) / 2;
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', function () { setTimeout(resize, 120); });

/* ---------------- defs ---------------- */
var T = {
  wall: { name: 'WALL', cost: 5, col: '#5a6478', col2: '#39414f', wall: true, desc: 'blocks path' },
  arrow: { name: 'ARROW', cost: 20, col: '#7ee081', col2: '#2f7a41', dmg: 9, rate: 0.52, range: 2.7, kind: 'shot' },
  frost: { name: 'FROST', cost: 30, col: '#6fd8ff', col2: '#2b6f92', dmg: 3, rate: 0.7, range: 2.3, kind: 'beam', slow: 0.5, slowT: 1.4 },
  splash: { name: 'SPLASH', cost: 45, col: '#ffb457', col2: '#8a5417', dmg: 15, rate: 1.15, range: 2.5, kind: 'lob', aoe: 1.15 },
  zap: { name: 'ZAP', cost: 55, col: '#c79bff', col2: '#5c3d94', dmg: 12, rate: 0.9, range: 3.0, kind: 'chain', chains: 3 },
  bank: { name: 'BANK', cost: 40, col: '#ffe066', col2: '#8a7420', kind: 'bank' }
};
var CHIPS = ['wall', 'arrow', 'frost', 'splash', 'zap', 'bank'];

var EN = {
  grunt: { hp: 20, sp: 1.5, col: '#ff7a7a', r: 0.30, gold: 3, leak: 1 },
  runner: { hp: 12, sp: 2.9, col: '#ffd36e', r: 0.24, gold: 3, leak: 1 },
  tank: { hp: 70, sp: 0.95, col: '#9aa7bd', r: 0.38, gold: 7, leak: 2, armor: 3 },
  flier: { hp: 16, sp: 1.9, col: '#8fe6c8', r: 0.27, gold: 4, leak: 1, fly: true },
  shield: { hp: 24, sp: 1.35, col: '#7fa8ff', r: 0.32, gold: 6, leak: 1, shield: 22 },
  boss: { hp: 700, sp: 0.8, col: '#ff5cc8', r: 0.55, gold: 60, leak: 8, armor: 5, boss: true }
};

/* ---------------- state ---------------- */
var G = null;
var started = false;

function newGame(seed) {
  resize();
  tapPointerId = null;
  G = {
    seed: seed || (Date.now() & 0xffff),
    map: new E.Map(L.cols, L.rows, seed || (Date.now() & 0xffff)),
    towers: [], creeps: [], bullets: [], fx: [], parts: [], texts: [],
    gold: 95, lives: 20, leaks: 0, wave: 0, wavesDone: 0,
    spawnQ: [], spawnI: 0, waveT: 0, active: false, prep: 15,
    phase: 'play', sel: -1, selTower: null, pending: 'arrow',
    shake: 0, shakeX: 0, shakeY: 0, hint: 1, msg: '', msgT: 0,
    kx: 5, ky: 7, kb: false, time: 0, endless: false
  };
  G.map.solve();
}

var best = 0;
try { var storedBest = parseInt(localStorage.getItem('bulwark.best') || '0', 10); best = Number.isFinite(storedBest) && storedBest >= 0 ? storedBest : 0; } catch (e) { best = 0; }
function saveBest(v) { if (v > best) { best = v; try { localStorage.setItem('bulwark.best', String(v)); } catch (e) { } } }

/* ---------------- waves ---------------- */
function buildWave(n) {
  var r = E.rng(G.seed * 7919 + n * 104729);
  var q = [];
  var t = 0;
  if (n % 10 === 0) {
    var bhp = Math.min(18, Math.pow(1.14, Math.min(n - 1, 24)) * (0.5 + Math.min(n, 300) / 30));
    q.push({ type: 'boss', t: 0.6, hpm: bhp, spm: 1 });
    var esc = Math.min(24, 5 + n);
    for (var e = 0; e < esc; e++) q.push({ type: r() < .5 ? 'runner' : 'grunt', t: 1.6 + e * 0.55, hpm: Math.min(18, Math.pow(1.155, Math.min(n, 24))), spm: 1 });
    return q;
  }
  var count = Math.min(48, Math.round(6 + n * 1.75));
  var pool = ['grunt'];
  if (n >= 3) pool.push('runner');
  if (n >= 5) pool.push('flier');
  if (n >= 7) pool.push('tank');
  if (n >= 9) pool.push('shield');
  if (n >= 12) pool.push('runner', 'flier');
  if (n >= 16) pool.push('tank', 'shield');
  var hpm = Math.min(18, Math.pow(1.155, Math.min(n - 1, 24)));
  var spm = 1 + Math.min(0.45, n * 0.013);
  for (var i = 0; i < count; i++) {
    var ty = pool[Math.floor(r() * pool.length)];
    t += 0.34 + r() * 0.42;
    q.push({ type: ty, t: t, hpm: hpm, spm: spm });
  }
  return q;
}

function startWave() {
  G.wave++;
  G.spawnQ = buildWave(G.wave);
  G.spawnI = 0; G.waveT = 0; G.active = true;
  toast('WAVE ' + G.wave + (G.wave % 10 === 0 ? '  — BOSS' : ''));
  E.audio.wave();
}

function endWave() {
  G.active = false;
  G.wavesDone = G.wave;
  var interest = Math.min(45, Math.floor(G.gold * 0.06));
  var bankInc = 0, ipct = 0;
  for (var i = 0; i < G.towers.length; i++) {
    var tw = G.towers[i];
    if (tw.t === 'bank') { bankInc += 4 * tw.lv; ipct += 0.015 * tw.lv; }
  }
  interest += Math.floor(G.gold * ipct);
  var clear = 12 + G.wave * 3;
  var tot = interest + bankInc + clear;
  G.gold += tot;
  E.audio.coin();
  floatT(L.w / 2, L.gy + 40, '+' + tot + 'g  (interest ' + (interest + bankInc) + ')', '#ffe066');
  saveBest(G.wavesDone + G.lives);
  if (G.wave >= 30 && !G.endless) { G.phase = 'win'; E.audio.win(); return; }
  G.prep = 9;
}

/* ---------------- helpers ---------------- */
function cellCenter(i) { return { x: (i % L.cols) + 0.5, y: ((i / L.cols) | 0) + 0.5 }; }
function sx(cx) { return L.gx + cx * L.cell; }
function sy(cy) { return L.gy + cy * L.cell; }
function cellAt(px, py) {
  var x = Math.floor((px - L.gx) / L.cell), y = Math.floor((py - L.gy) / L.cell);
  if (x < 0 || y < 0 || x >= L.cols || y >= L.rows) return -1;
  return y * L.cols + x;
}
function towerAt(i) { for (var k = 0; k < G.towers.length; k++) if (G.towers[k].i === i) return G.towers[k]; return null; }
function toast(m) { G.msg = m; G.msgT = 2.0; }
function floatT(x, y, txt, col) { G.texts.push({ x: x, y: y, t: txt, c: col || '#fff', life: 1.1, max: 1.1 }); }
function burst(x, y, col, n, sp) {
  for (var i = 0; i < n; i++) {
    if (G.parts.length >= 360) break;
    var a = Math.random() * 6.283, v = (0.4 + Math.random()) * (sp || 90);
    G.parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.35 + Math.random() * 0.35, max: 0.7, c: col, r: 1.5 + Math.random() * 2.5 });
  }
}
function shake(m) { G.shake = Math.max(G.shake, m); }

/* ---------------- build ---------------- */
function occupiedCells() {
  var a = [];
  for (var i = 0; i < G.creeps.length; i++) {
    var c = G.creeps[i];
    if (c.fly || c.dead || c.cy < 0) continue;
    var x = E.clamp(Math.floor(c.cx), 0, L.cols - 1), y = E.clamp(Math.floor(c.cy), 0, L.rows - 1);
    a.push(y * L.cols + x);
  }
  return a;
}

function tryBuild(i, type) {
  var d = T[type];
  if (!d) return;
  if (i < 0 || G.map.g[i] !== E.EMPTY) { E.audio.deny(); toast('BLOCKED'); return; }
  if (G.gold < d.cost) { E.audio.deny(); toast('NEED ' + d.cost + 'g'); return; }
  if (!G.map.canPlace(i, occupiedCells())) { E.audio.deny(); toast('WOULD SEAL THE PATH'); shake(4); return; }
  G.gold -= d.cost;
  G.map.g[i] = d.wall ? E.WALL : E.TOWER;
  G.map.solve();
  for (var k = 0; k < G.creeps.length; k++) G.creeps[k].tx = undefined;
  if (!d.wall) {
    G.towers.push({
      i: i, t: type, lv: 1, cd: 0, spent: d.cost, ang: -Math.PI / 2, pulse: 0,
      x: (i % L.cols) + 0.5, y: ((i / L.cols) | 0) + 0.5
    });
  }
  var cc = cellCenter(i);
  burst(sx(cc.x), sy(cc.y), d.col, 10, 70);
  E.audio.build();
  G.hint = 0;
  G.sel = -1;
}

function statOf(tw) {
  var d = T[tw.t], m = Math.pow(1.38, tw.lv - 1);
  return {
    dmg: d.dmg ? d.dmg * m : 0,
    range: d.range ? d.range * (1 + (tw.lv - 1) * 0.09) : 0,
    rate: d.rate ? d.rate * Math.pow(0.94, tw.lv - 1) : 0
  };
}
function upCost(tw) { return Math.round(T[tw.t].cost * (0.85 + tw.lv * 0.75)); }
function sellVal(tw) { return Math.floor(tw.spent * 0.6); }

function upgrade(tw) {
  if (tw.lv >= 5) { toast('MAX LEVEL'); E.audio.deny(); return; }
  var c = upCost(tw);
  if (G.gold < c) { E.audio.deny(); toast('NEED ' + c + 'g'); return; }
  G.gold -= c; tw.spent += c; tw.lv++; tw.pulse = 1;
  burst(sx(tw.x), sy(tw.y), T[tw.t].col, 12, 90);
  E.audio.build();
}
function sell(tw) {
  var v = sellVal(tw);
  G.gold += v;
  G.map.g[tw.i] = E.EMPTY; G.map.solve();
  for (var k = 0; k < G.creeps.length; k++) G.creeps[k].tx = undefined;
  G.towers.splice(G.towers.indexOf(tw), 1);
  G.selTower = null;
  floatT(sx(tw.x), sy(tw.y), '+' + v + 'g', '#ffe066');
  E.audio.coin();
}

/* ---------------- creeps ---------------- */
function spawn(s) {
  var d = EN[s.type];
  var hp = d.hp * (s.hpm || 1);
  G.creeps.push({
    type: s.type, cx: G.map.entryC + 0.5, cy: -0.7, hp: hp, hpMax: hp,
    sh: d.shield ? d.shield * (s.hpm || 1) : 0, shMax: d.shield ? d.shield * (s.hpm || 1) : 0, shT: 0,
    sp: d.sp * (s.spm || 1), r: d.r, col: d.col, gold: d.gold, leak: d.leak,
    armor: d.armor || 0, fly: !!d.fly, boss: !!d.boss,
    slowT: 0, slowF: 1, flash: 0, dead: false, tx: undefined, ty: 0, ang: Math.PI / 2
  });
}

function bestNeighbor(i) {
  var cols = L.cols, rows = L.rows, x = i % cols, y = (i / cols) | 0;
  var bi = -1, bd = 1e9;
  for (var k = 0; k < 4; k++) {
    var ax = x + (k === 0 ? 1 : k === 1 ? -1 : 0), ay = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
    if (ax < 0 || ay < 0 || ax >= cols || ay >= rows) continue;
    var j = ay * cols + ax;
    if (G.map.g[j] !== E.EMPTY) continue;
    var dv = G.map.dist[j];
    if (dv >= 0 && dv < bd) { bd = dv; bi = j; }
  }
  return bi;
}

function pickTarget(c) {
  if (c.cy < 0.5) { c.tx = G.map.entryC + 0.5; c.ty = 0.5; return; }
  var x = E.clamp(Math.floor(c.cx), 0, L.cols - 1), y = E.clamp(Math.floor(c.cy), 0, L.rows - 1);
  var i = y * L.cols + x;
  var ni = G.map.next[i];
  if (ni < 0 || G.map.g[i] !== E.EMPTY) ni = bestNeighbor(i);
  if (ni < 0) { c.tx = c.cx; c.ty = c.cy; return; }
  c.tx = (ni % L.cols) + 0.5; c.ty = ((ni / L.cols) | 0) + 0.5;
}

function leak(c) {
  c.dead = true;
  G.leaks += c.leak; G.lives -= c.leak;
  shake(9); E.audio.leak();
  burst(sx(c.cx), sy(c.cy), '#ff4444', 16, 130);
  floatT(sx(c.cx), sy(c.cy) - 10, '-' + c.leak, '#ff5555');
  if (G.lives <= 0) {
    G.lives = 0; G.phase = 'lose';
    saveBest(G.wavesDone + 0);
    E.audio.lose();
  }
}

function damage(c, amt, src) {
  if (c.dead) return;
  var d = Math.max(1, amt - c.armor);
  if (c.sh > 0) {
    c.sh -= d; c.shT = 2.6;
    if (c.sh < 0) { c.hp += c.sh; c.sh = 0; }
  } else c.hp -= d;
  c.flash = 0.12;
  if (c.hp <= 0) {
    c.dead = true;
    G.gold += c.gold;
    burst(sx(c.cx), sy(c.cy), c.col, c.boss ? 34 : 9, c.boss ? 190 : 100);
    floatT(sx(c.cx), sy(c.cy) - 8, '+' + c.gold, '#ffe066');
    E.audio.kill();
    if (c.boss) { shake(12); E.audio.boom(); }
  }
}

/* ---------------- towers fire ---------------- */
function nearestTarget(tw, range) {
  var bi = null, bd = -1;
  for (var k = 0; k < G.creeps.length; k++) {
    var c = G.creeps[k];
    if (c.dead || c.cy < -0.2) continue;
    var dx = c.cx - tw.x, dy = c.cy - tw.y;
    if (dx * dx + dy * dy > range * range) continue;
    // prefer the creep furthest along toward the exit
    var prog;
    if (c.fly) {
      prog = 1000 - Math.hypot(c.cx - ((G.map.exit % L.cols) + 0.5), c.cy - (((G.map.exit / L.cols) | 0) + 0.5));
    } else {
      var di = G.map.dist[E.clamp(Math.floor(c.cy), 0, L.rows - 1) * L.cols + E.clamp(Math.floor(c.cx), 0, L.cols - 1)];
      prog = 1000 - (di >= 0 ? di : 999);
    }
    if (prog > bd) { bd = prog; bi = c; }
  }
  return bi;
}

function fire(tw, dt) {
  var d = T[tw.t], st = statOf(tw);
  if (d.kind === 'bank' || d.wall) return;
  tw.cd -= dt;
  if (tw.cd > 0) return;
  var tgt = nearestTarget(tw, st.range);
  if (!tgt) return;
  tw.ang = Math.atan2(tgt.cy - tw.y, tgt.cx - tw.x);
  tw.cd = st.rate;
  tw.pulse = 1;
  if (d.kind === 'shot') {
    G.bullets.push({ x: tw.x, y: tw.y, tgt: tgt, sp: 13, dmg: st.dmg, col: d.col, r: 3, kind: 'shot' });
    E.audio.shoot();
  } else if (d.kind === 'lob') {
    G.bullets.push({ x: tw.x, y: tw.y, tx: tgt.cx, ty: tgt.cy, sp: 8, dmg: st.dmg, col: d.col, r: 4.5, kind: 'lob', aoe: d.aoe * (1 + (tw.lv - 1) * 0.06) });
    E.audio.shoot();
  } else if (d.kind === 'beam') {
    damage(tgt, st.dmg);
    tgt.slowT = d.slowT; tgt.slowF = Math.min(tgt.slowF, d.slow);
    G.fx.push({ kind: 'beam', x1: tw.x, y1: tw.y, x2: tgt.cx, y2: tgt.cy, life: 0.14, max: 0.14, col: d.col });
    E.audio.frost();
  } else if (d.kind === 'chain') {
    var hit = [tgt], cur = tgt, dmg = st.dmg;
    var n = d.chains + (tw.lv >= 4 ? 1 : 0);
    damage(cur, dmg);
    G.fx.push({ kind: 'bolt', x1: tw.x, y1: tw.y, x2: cur.cx, y2: cur.cy, life: 0.16, max: 0.16, col: d.col });
    for (var h = 1; h < n; h++) {
      var nb = null, nd = 2.4 * 2.4;
      for (var k = 0; k < G.creeps.length; k++) {
        var c2 = G.creeps[k];
        if (c2.dead || hit.indexOf(c2) >= 0 || c2.cy < -0.2) continue;
        var dd = E.dist2(c2.cx, c2.cy, cur.cx, cur.cy);
        if (dd < nd) { nd = dd; nb = c2; }
      }
      if (!nb) break;
      dmg *= 0.72;
      damage(nb, dmg);
      G.fx.push({ kind: 'bolt', x1: cur.cx, y1: cur.cy, x2: nb.cx, y2: nb.cy, life: 0.16, max: 0.16, col: d.col });
      hit.push(nb); cur = nb;
    }
    E.audio.zap();
  }
}

/* ---------------- update ---------------- */
function update(dt) {
  G.time += dt;
  if (G.phase !== 'play') { updFx(dt); return; }

  if (!G.active) {
    G.prep -= dt;
    if (G.prep <= 0) startWave();
  } else {
    G.waveT += dt;
    while (G.spawnI < G.spawnQ.length && G.spawnQ[G.spawnI].t <= G.waveT) { spawn(G.spawnQ[G.spawnI]); G.spawnI++; }
    if (G.spawnI >= G.spawnQ.length && G.creeps.length === 0) endWave();
  }

  // creeps
  for (var i = G.creeps.length - 1; i >= 0; i--) {
    var c = G.creeps[i];
    if (c.dead) { G.creeps.splice(i, 1); continue; }
    if (c.flash > 0) c.flash -= dt;
    if (c.slowT > 0) { c.slowT -= dt; if (c.slowT <= 0) c.slowF = 1; }
    if (c.shMax > 0) {
      c.shT -= dt;
      if (c.shT <= 0 && c.sh < c.shMax) c.sh = Math.min(c.shMax, c.sh + c.shMax * 0.35 * dt);
    }
    var sp = c.sp * c.slowF;
    if (c.fly) {
      var ex = (G.map.exit % L.cols) + 0.5, ey = ((G.map.exit / L.cols) | 0) + 0.5;
      var dx = ex - c.cx, dy = ey - c.cy, dl = Math.hypot(dx, dy);
      c.ang = Math.atan2(dy, dx);
      if (dl < 0.25) { leak(c); continue; }
      c.cx += dx / dl * sp * dt; c.cy += dy / dl * sp * dt;
    } else {
      if (c.tx === undefined || Math.hypot(c.tx - c.cx, c.ty - c.cy) < 0.06) pickTarget(c);
      var dx2 = c.tx - c.cx, dy2 = c.ty - c.cy, dl2 = Math.hypot(dx2, dy2);
      if (dl2 > 0.0001) {
        c.ang = Math.atan2(dy2, dx2);
        var mv = Math.min(dl2, sp * dt);
        c.cx += dx2 / dl2 * mv; c.cy += dy2 / dl2 * mv;
      }
      var ex2 = (G.map.exit % L.cols) + 0.5, ey2 = ((G.map.exit / L.cols) | 0) + 0.5;
      if (E.dist2(c.cx, c.cy, ex2, ey2) < 0.09) { leak(c); continue; }
    }
  }

  // towers
  for (var t = 0; t < G.towers.length; t++) {
    var tw = G.towers[t];
    if (tw.pulse > 0) tw.pulse -= dt * 4;
    fire(tw, dt);
  }

  // bullets
  for (var b = G.bullets.length - 1; b >= 0; b--) {
    var bu = G.bullets[b];
    if (bu.kind === 'shot') {
      if (!bu.tgt || bu.tgt.dead) { G.bullets.splice(b, 1); continue; }
      var bx = bu.tgt.cx - bu.x, by = bu.tgt.cy - bu.y, bl = Math.hypot(bx, by);
      var step = bu.sp * dt;
      if (bl <= step) {
        damage(bu.tgt, bu.dmg);
        burst(sx(bu.tgt.cx), sy(bu.tgt.cy), bu.col, 4, 60);
        G.bullets.splice(b, 1); continue;
      }
      bu.x += bx / bl * step; bu.y += by / bl * step;
      bu.a = Math.atan2(by, bx);
    } else {
      var lx = bu.tx - bu.x, ly = bu.ty - bu.y, ll = Math.hypot(lx, ly);
      var st2 = bu.sp * dt;
      if (ll <= st2) {
        for (var k2 = 0; k2 < G.creeps.length; k2++) {
          var cc = G.creeps[k2];
          if (cc.dead) continue;
          if (E.dist2(cc.cx, cc.cy, bu.tx, bu.ty) <= bu.aoe * bu.aoe) damage(cc, bu.dmg);
        }
        G.fx.push({ kind: 'ring', x: bu.tx, y: bu.ty, r: bu.aoe, life: 0.3, max: 0.3, col: bu.col });
        burst(sx(bu.tx), sy(bu.ty), bu.col, 14, 130);
        E.audio.boom(); shake(4);
        G.bullets.splice(b, 1); continue;
      }
      bu.x += lx / ll * st2; bu.y += ly / ll * st2;
    }
  }
  updFx(dt);
}

function updFx(dt) {
  for (var i = G.fx.length - 1; i >= 0; i--) { G.fx[i].life -= dt; if (G.fx[i].life <= 0) G.fx.splice(i, 1); }
  for (var p = G.parts.length - 1; p >= 0; p--) {
    var q = G.parts[p];
    q.life -= dt;
    if (q.life <= 0) { G.parts.splice(p, 1); continue; }
    q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.92; q.vy *= 0.92;
  }
  for (var x = G.texts.length - 1; x >= 0; x--) {
    var tt = G.texts[x]; tt.life -= dt; tt.y -= 26 * dt;
    if (tt.life <= 0) G.texts.splice(x, 1);
  }
  if (G.msgT > 0) G.msgT -= dt;
  if (G.shake > 0) {
    G.shake = Math.max(0, G.shake - dt * 26);
    G.shakeX = (Math.random() - 0.5) * G.shake;
    G.shakeY = (Math.random() - 0.5) * G.shake;
  } else { G.shakeX = 0; G.shakeY = 0; }
}

/* ---------------- draw ---------------- */
function rr(x, y, w, h, r) {
  ctx.beginPath();
  r = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function draw() {
  var w = L.w, h = L.h, cell = L.cell;
  ctx.fillStyle = '#0b0f18';
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.translate(G.shakeX, G.shakeY);

  // field
  var fw = L.cols * cell, fh = L.rows * cell;
  var grd = ctx.createLinearGradient(0, L.gy, 0, L.gy + fh);
  grd.addColorStop(0, '#16203a'); grd.addColorStop(1, '#101728');
  ctx.fillStyle = grd;
  ctx.fillRect(L.gx, L.gy, fw, fh);

  // grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.045)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (var x = 0; x <= L.cols; x++) { ctx.moveTo(L.gx + x * cell, L.gy); ctx.lineTo(L.gx + x * cell, L.gy + fh); }
  for (var y = 0; y <= L.rows; y++) { ctx.moveTo(L.gx, L.gy + y * cell); ctx.lineTo(L.gx + fw, L.gy + y * cell); }
  ctx.stroke();

  // path preview (flow toward exit from entry)
  drawPath();

  // cells
  for (var i = 0; i < G.map.n; i++) {
    var g = G.map.g[i];
    if (g === E.EMPTY) continue;
    var cx = L.gx + (i % L.cols) * cell, cy = L.gy + ((i / L.cols) | 0) * cell;
    if (g === E.ROCK) {
      ctx.fillStyle = '#28303f';
      rr(cx + 2, cy + 2, cell - 4, cell - 4, 5); ctx.fill();
      ctx.fillStyle = '#333d4f';
      rr(cx + 5, cy + 5, cell - 12, cell - 13, 3); ctx.fill();
    } else if (g === E.WALL) {
      ctx.fillStyle = T.wall.col2;
      rr(cx + 1.5, cy + 1.5, cell - 3, cell - 3, 4); ctx.fill();
      ctx.fillStyle = T.wall.col;
      rr(cx + 3.5, cy + 3.5, cell - 7, cell - 9, 3); ctx.fill();
    }
  }

  // entry / exit
  drawPort(G.map.entry, '#6fd8ff', 'IN');
  drawPort(G.map.exit, '#ff6b6b', 'OUT');

  // selection ring
  if (G.sel >= 0) {
    var s = cellCenter(G.sel);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]); ctx.lineDashOffset = -G.time * 20;
    rr(sx(s.x) - cell / 2 + 2, sy(s.y) - cell / 2 + 2, cell - 4, cell - 4, 5); ctx.stroke();
    ctx.setLineDash([]);
    var pd = T[G.pending];
    if (pd && pd.range) {
      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      ctx.beginPath(); ctx.arc(sx(s.x), sy(s.y), pd.range * cell, 0, 6.283); ctx.stroke();
    }
  }
  if (G.kb) {
    var kc = G.ky * L.cols + G.kx, kk = cellCenter(kc);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2;
    rr(sx(kk.x) - cell / 2 + 3, sy(kk.y) - cell / 2 + 3, cell - 6, cell - 6, 4); ctx.stroke();
  }

  // towers
  for (var t = 0; t < G.towers.length; t++) drawTower(G.towers[t]);

  // selected tower range
  if (G.selTower) {
    var st = statOf(G.selTower);
    if (st.range) {
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.beginPath(); ctx.arc(sx(G.selTower.x), sy(G.selTower.y), st.range * cell, 0, 6.283); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1.5; ctx.stroke();
    }
  }

  // fx beams
  for (var f = 0; f < G.fx.length; f++) {
    var fx = G.fx[f], al = fx.life / fx.max;
    if (fx.kind === 'beam') {
      ctx.strokeStyle = fx.col; ctx.globalAlpha = al; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(sx(fx.x1), sy(fx.y1)); ctx.lineTo(sx(fx.x2), sy(fx.y2)); ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (fx.kind === 'bolt') {
      ctx.strokeStyle = fx.col; ctx.globalAlpha = al; ctx.lineWidth = 2.4;
      ctx.beginPath();
      var x1 = sx(fx.x1), y1 = sy(fx.y1), x2 = sx(fx.x2), y2 = sy(fx.y2);
      ctx.moveTo(x1, y1);
      for (var seg = 1; seg < 4; seg++) {
        var tt2 = seg / 4;
        ctx.lineTo(E.lerp(x1, x2, tt2) + (Math.random() - 0.5) * 12, E.lerp(y1, y2, tt2) + (Math.random() - 0.5) * 12);
      }
      ctx.lineTo(x2, y2); ctx.stroke(); ctx.globalAlpha = 1;
    } else if (fx.kind === 'ring') {
      ctx.strokeStyle = fx.col; ctx.globalAlpha = al * 0.9; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(sx(fx.x), sy(fx.y), fx.r * cell * (1.3 - al * 0.35), 0, 6.283); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // bullets
  for (var b = 0; b < G.bullets.length; b++) {
    var bu = G.bullets[b];
    ctx.fillStyle = bu.col;
    ctx.beginPath(); ctx.arc(sx(bu.x), sy(bu.y), bu.r, 0, 6.283); ctx.fill();
  }

  // creeps
  for (var c = 0; c < G.creeps.length; c++) drawCreep(G.creeps[c]);

  // particles
  for (var p = 0; p < G.parts.length; p++) {
    var q = G.parts[p];
    ctx.globalAlpha = Math.max(0, q.life / q.max);
    ctx.fillStyle = q.c;
    ctx.fillRect(q.x - q.r / 2, q.y - q.r / 2, q.r, q.r);
  }
  ctx.globalAlpha = 1;

  // float texts
  ctx.textAlign = 'center';
  for (var tx = 0; tx < G.texts.length; tx++) {
    var ft = G.texts[tx];
    ctx.globalAlpha = Math.max(0, ft.life / ft.max);
    ctx.fillStyle = ft.c;
    ctx.font = '700 13px -apple-system,Segoe UI,Roboto,sans-serif';
    ctx.fillText(ft.t, ft.x, ft.y);
  }
  ctx.globalAlpha = 1;

  ctx.restore();

  drawHUD();
  drawBar();
  if (G.phase !== 'play') drawEnd();
}

function drawPath() {
  var i = G.map.entry, cell = L.cell, guard = 0;
  ctx.strokeStyle = 'rgba(120,190,255,0.18)';
  ctx.lineWidth = Math.max(3, cell * 0.42);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  var cc = cellCenter(i);
  ctx.moveTo(sx(cc.x), sy(cc.y));
  while (i >= 0 && i !== G.map.exit && guard++ < 600) {
    i = G.map.next[i];
    if (i < 0) break;
    var p = cellCenter(i);
    ctx.lineTo(sx(p.x), sy(p.y));
  }
  ctx.stroke();
  ctx.lineCap = 'butt';
}

function drawPort(i, col, label) {
  var cell = L.cell, p = cellCenter(i);
  var px = sx(p.x), py = sy(p.y);
  ctx.fillStyle = col;
  ctx.globalAlpha = 0.22 + 0.12 * Math.sin(G.time * 3);
  rr(px - cell / 2 + 1, py - cell / 2 + 1, cell - 2, cell - 2, 5); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = col; ctx.lineWidth = 2;
  rr(px - cell / 2 + 1, py - cell / 2 + 1, cell - 2, cell - 2, 5); ctx.stroke();
  ctx.fillStyle = col;
  ctx.font = '700 9px -apple-system,Segoe UI,Roboto,sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, px, py);
}

function drawTower(tw) {
  var d = T[tw.t], cell = L.cell;
  var px = sx(tw.x), py = sy(tw.y);
  var pulse = Math.max(0, tw.pulse);
  ctx.fillStyle = d.col2;
  rr(px - cell / 2 + 2, py - cell / 2 + 2, cell - 4, cell - 4, 6); ctx.fill();
  var r = cell * (0.30 + pulse * 0.05);
  ctx.fillStyle = d.col;
  if (tw.t === 'bank') {
    rr(px - r, py - r * 0.8, r * 2, r * 1.6, 3); ctx.fill();
    ctx.fillStyle = d.col2;
    ctx.font = '700 ' + Math.round(cell * 0.4) + 'px -apple-system,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('$', px, py + 1);
  } else {
    ctx.beginPath(); ctx.arc(px, py, r, 0, 6.283); ctx.fill();
    ctx.save();
    ctx.translate(px, py); ctx.rotate(tw.ang);
    ctx.fillStyle = '#0b0f18';
    ctx.fillRect(r * 0.3, -cell * 0.075, cell * 0.30, cell * 0.15);
    ctx.restore();
  }
  // level pips
  ctx.fillStyle = '#fff';
  for (var l = 0; l < tw.lv; l++) {
    ctx.globalAlpha = 0.85;
    ctx.fillRect(px - cell / 2 + 3 + l * 4.5, py + cell / 2 - 6, 3, 3);
  }
  ctx.globalAlpha = 1;
}

function drawCreep(c) {
  var cell = L.cell, px = sx(c.cx), py = sy(c.cy);
  var r = c.r * cell;
  if (c.fly) {
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(px + 5, py + 7, r * 0.9, r * 0.5, 0, 0, 6.283); ctx.fill();
  }
  ctx.fillStyle = c.flash > 0 ? '#ffffff' : c.col;
  if (c.boss) {
    ctx.save(); ctx.translate(px, py); ctx.rotate(G.time * 0.7);
    ctx.beginPath();
    for (var k = 0; k < 6; k++) {
      var a = k / 6 * 6.283;
      ctx[k ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath(); ctx.fill(); ctx.restore();
  } else if (c.fly) {
    ctx.save(); ctx.translate(px, py); ctx.rotate(c.ang);
    ctx.beginPath(); ctx.moveTo(r, 0); ctx.lineTo(-r * 0.7, -r * 0.8); ctx.lineTo(-r * 0.3, 0); ctx.lineTo(-r * 0.7, r * 0.8);
    ctx.closePath(); ctx.fill(); ctx.restore();
  } else if (c.type === 'tank') {
    rr(px - r, py - r, r * 2, r * 2, 3); ctx.fill();
  } else {
    ctx.beginPath(); ctx.arc(px, py, r, 0, 6.283); ctx.fill();
  }
  if (c.slowF < 1) {
    ctx.strokeStyle = '#6fd8ff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(px, py, r + 2.5, 0, 6.283); ctx.stroke();
  }
  if (c.sh > 0) {
    ctx.strokeStyle = 'rgba(150,190,255,' + (0.35 + 0.55 * (c.sh / c.shMax)) + ')';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(px, py, r + 4, 0, 6.283); ctx.stroke();
  }
  // hp bar
  if (c.hp < c.hpMax) {
    var bw = r * 2.2;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(px - bw / 2, py - r - 7, bw, 3.5);
    ctx.fillStyle = c.hp / c.hpMax > 0.4 ? '#7ee081' : '#ff6b6b';
    ctx.fillRect(px - bw / 2, py - r - 7, bw * Math.max(0, c.hp / c.hpMax), 3.5);
  }
}

/* ------------- HUD ------------- */
var goBtn = { x: 0, y: 0, w: 0, h: 0 };
var sndBtn = { x: 0, y: 0, w: 0, h: 0 };

function drawHUD() {
  var w = L.w, hud = L.hud;
  ctx.fillStyle = '#0e1420';
  ctx.fillRect(0, 0, w, hud);
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fillRect(0, hud - 1, w, 1);
  ctx.textBaseline = 'middle';

  var pad = 10, cy = hud * 0.36;
  ctx.textAlign = 'left';
  ctx.font = '700 15px -apple-system,Segoe UI,Roboto,sans-serif';
  ctx.fillStyle = G.lives <= 5 ? '#ff6b6b' : '#e6f0ff';
  ctx.fillText('♥ ' + G.lives, pad, cy);
  ctx.fillStyle = '#ffe066';
  ctx.fillText('◆ ' + Math.floor(G.gold), pad + 62, cy);
  var wn = Math.max(1, G.wave);
  ctx.fillStyle = (wn % 10 === 0 && G.active) ? '#ff5cc8' : '#cfe3ff';
  ctx.fillText('W ' + wn + (G.endless ? '' : '/30'), pad + 140, cy);

  ctx.font = '500 10px -apple-system,Segoe UI,Roboto,sans-serif';
  ctx.fillStyle = 'rgba(200,220,255,0.5)';
  ctx.fillText('BEST ' + best, pad + 200, cy);
  if (G.msgT > 0) {
    ctx.fillStyle = 'rgba(255,255,255,' + Math.min(1, G.msgT) + ')';
    ctx.font = '700 11px -apple-system,Segoe UI,Roboto,sans-serif';
    ctx.fillText(G.msg, pad, hud * 0.75);
  } else if (G.hint) {
    ctx.fillStyle = 'rgba(200,220,255,0.65)';
    ctx.font = '500 11px -apple-system,Segoe UI,Roboto,sans-serif';
    ctx.fillText('Tap a cell, then a chip — maze them in.', pad, hud * 0.75);
  }

  // GO / wave state
  goBtn = { x: w - 90, y: 7, w: 82, h: hud - 14 };

  // sound (left of GO)
  sndBtn = { x: goBtn.x - 50, y: Math.max(3, 7 + (goBtn.h - 48) / 2), w: 48, h: 48 };
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  rr(sndBtn.x, sndBtn.y, sndBtn.w, sndBtn.h, 5); ctx.fill();
  ctx.fillStyle = E.audio.isOn() ? '#7ee081' : 'rgba(255,255,255,0.35)';
  ctx.font = '700 9px -apple-system,sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(E.audio.isOn() ? 'SND' : 'OFF', sndBtn.x + sndBtn.w / 2, sndBtn.y + sndBtn.h / 2);

  if (!G.active && G.phase === 'play') {
    var pulse = 0.5 + 0.5 * Math.sin(G.time * 5);
    ctx.fillStyle = 'rgba(126,224,129,' + (0.2 + pulse * 0.2) + ')';
    rr(goBtn.x, goBtn.y, goBtn.w, goBtn.h, 6); ctx.fill();
    ctx.strokeStyle = '#7ee081'; ctx.lineWidth = 1.5;
    rr(goBtn.x, goBtn.y, goBtn.w, goBtn.h, 6); ctx.stroke();
    ctx.fillStyle = '#d9ffdc'; ctx.textAlign = 'center';
    ctx.font = '700 12px -apple-system,Segoe UI,Roboto,sans-serif';
    ctx.fillText('GO  ' + Math.ceil(Math.max(0, G.prep)) + 's', goBtn.x + goBtn.w / 2, goBtn.y + goBtn.h / 2);
  } else {
    var left = G.spawnQ.length - G.spawnI + G.creeps.length;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    rr(goBtn.x, goBtn.y, goBtn.w, goBtn.h, 6); ctx.fill();
    ctx.fillStyle = 'rgba(220,235,255,0.8)'; ctx.textAlign = 'center';
    ctx.font = '700 12px -apple-system,Segoe UI,Roboto,sans-serif';
    ctx.fillText('LEFT ' + left, goBtn.x + goBtn.w / 2, goBtn.y + goBtn.h / 2);
  }
}

/* ------------- build bar / tower sheet ------------- */
var chipRects = [];
var sheetBtns = null;

function drawBar() {
  var w = L.w, h = L.h, bh = L.bar, by = h - bh;
  ctx.fillStyle = '#0e1420';
  ctx.fillRect(0, by, w, bh);
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fillRect(0, by, w, 1);

  if (G.selTower) { drawSheet(by, bh); return; }
  sheetBtns = null;

  chipRects = [];
  var n = CHIPS.length;
  var gap = 4, cw = (w - gap * (n + 1)) / n;
  var chH = bh - 26;
  for (var i = 0; i < n; i++) {
    var key = CHIPS[i], d = T[key];
    var x = gap + i * (cw + gap), y = by + 8;
    chipRects.push({ x: x, y: y, w: cw, h: chH, key: key });
    var afford = G.gold >= d.cost;
    var selc = G.pending === key;
    ctx.fillStyle = selc ? d.col2 : 'rgba(255,255,255,0.05)';
    rr(x, y, cw, chH, 8); ctx.fill();
    if (selc) { ctx.strokeStyle = d.col; ctx.lineWidth = 2; rr(x, y, cw, chH, 8); ctx.stroke(); }
    ctx.globalAlpha = afford ? 1 : 0.35;
    // icon
    var icx = x + cw / 2, icy = y + chH * 0.36, ir = Math.min(cw, chH) * 0.20;
    ctx.fillStyle = d.col;
    if (key === 'wall') { rr(icx - ir, icy - ir * 0.8, ir * 2, ir * 1.6, 2); ctx.fill(); }
    else if (key === 'bank') { rr(icx - ir, icy - ir * 0.8, ir * 2, ir * 1.6, 2); ctx.fill(); ctx.fillStyle = d.col2; ctx.font = '700 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('$', icx, icy); }
    else { ctx.beginPath(); ctx.arc(icx, icy, ir, 0, 6.283); ctx.fill(); }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#dce8ff';
    ctx.font = '700 9px -apple-system,Segoe UI,Roboto,sans-serif';
    ctx.fillText(d.name, icx, y + chH * 0.68);
    ctx.fillStyle = afford ? '#ffe066' : '#ff8a8a';
    ctx.font = '700 10px -apple-system,Segoe UI,Roboto,sans-serif';
    ctx.fillText(d.cost + 'g', icx, y + chH * 0.87);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = 'rgba(190,210,240,0.45)';
  ctx.font = '500 10px -apple-system,Segoe UI,Roboto,sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(G.sel >= 0 ? 'Now tap a chip to build here' : 'Tap an empty cell, then a chip · tap a tower to upgrade', w / 2, h - 9);
}

function drawSheet(by, bh) {
  var tw = G.selTower, d = T[tw.t], st = statOf(tw), w = L.w;
  ctx.fillStyle = '#131b2b';
  ctx.fillRect(0, by, w, bh);
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillStyle = d.col;
  ctx.font = '700 13px -apple-system,Segoe UI,Roboto,sans-serif';
  ctx.fillText(d.name + '  Lv' + tw.lv, 12, by + 16);
  ctx.fillStyle = 'rgba(210,225,250,0.7)';
  ctx.font = '500 10px -apple-system,Segoe UI,Roboto,sans-serif';
  var line = tw.t === 'bank'
    ? ('income ' + (4 * tw.lv) + 'g/wave  ·  interest +' + (tw.lv * 1.5).toFixed(1) + '%')
    : ('dmg ' + st.dmg.toFixed(0) + '  ·  rng ' + st.range.toFixed(1) + '  ·  ' + (1 / st.rate).toFixed(1) + '/s');
  ctx.fillText(line, 12, by + 32);

  var bh2 = bh - 46, byy = by + 40, gap = 8;
  var bw = (w - gap * 4) / 3;
  var can = tw.lv < 5;
  sheetBtns = {
    up: { x: gap, y: byy, w: bw, h: bh2 },
    sell: { x: gap * 2 + bw, y: byy, w: bw, h: bh2 },
    close: { x: gap * 3 + bw * 2, y: byy, w: bw, h: bh2 }
  };
  var uc = upCost(tw);
  btn(sheetBtns.up, can ? (G.gold >= uc ? '#2f7a41' : '#3a2530') : '#2a3040', can ? 'UPGRADE ' + uc + 'g' : 'MAX', can && G.gold >= uc ? '#d9ffdc' : 'rgba(255,255,255,0.5)');
  btn(sheetBtns.sell, '#4a3320', 'SELL +' + sellVal(tw) + 'g', '#ffd9a3');
  btn(sheetBtns.close, '#232b3d', 'CLOSE', '#cfe3ff');
}

function btn(b, fill, label, col) {
  ctx.fillStyle = fill;
  rr(b.x, b.y, b.w, b.h, 8); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.13)'; ctx.lineWidth = 1;
  rr(b.x, b.y, b.w, b.h, 8); ctx.stroke();
  ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '700 11px -apple-system,Segoe UI,Roboto,sans-serif';
  ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2);
}

/* ------------- end screens ------------- */
var endBtns = null;
function drawEnd() {
  var w = L.w, h = L.h;
  ctx.fillStyle = 'rgba(6,9,16,0.86)';
  ctx.fillRect(0, 0, w, h);
  var win = G.phase === 'win';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = win ? '#7ee081' : '#ff6b6b';
  ctx.font = '800 30px -apple-system,Segoe UI,Roboto,sans-serif';
  ctx.fillText(win ? 'HELD THE LINE' : 'BREACHED', w / 2, h * 0.31);
  var score = G.wavesDone + G.lives;
  ctx.fillStyle = '#e6f0ff';
  ctx.font = '600 16px -apple-system,Segoe UI,Roboto,sans-serif';
  ctx.fillText('waves ' + G.wavesDone + '   lives ' + G.lives, w / 2, h * 0.38);
  ctx.font = '800 22px -apple-system,Segoe UI,Roboto,sans-serif';
  ctx.fillStyle = '#ffe066';
  ctx.fillText('SCORE ' + score, w / 2, h * 0.44);
  ctx.font = '500 12px -apple-system,Segoe UI,Roboto,sans-serif';
  ctx.fillStyle = 'rgba(200,220,255,0.6)';
  ctx.fillText('best ' + best, w / 2, h * 0.49);

  var bw = Math.min(230, w - 60), bx = (w - bw) / 2;
  endBtns = { again: { x: bx, y: h * 0.58, w: bw, h: 54 } };
  btn(endBtns.again, '#23406b', win ? 'NEW RUN' : 'TRY AGAIN', '#dcecff');
  if (win) {
    endBtns.cont = { x: bx, y: h * 0.58 + 66, w: bw, h: 54 };
    btn(endBtns.cont, '#2f7a41', 'CONTINUE ENDLESS', '#d9ffdc');
  }
}

/* ---------------- input ---------------- */
function hit(b, x, y, pad) {
  pad = pad === undefined ? 8 : pad;
  return b && x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad;
}

function onTap(px, py) {
  E.audio.init();
  G.kb = false;

  if (G.phase !== 'play') {
    if (endBtns && hit(endBtns.again, px, py)) { newGame(); return; }
    if (endBtns && endBtns.cont && hit(endBtns.cont, px, py)) { G.endless = true; G.phase = 'play'; G.prep = 9; return; }
    return;
  }

  if (hit(sndBtn, px, py, 10)) { E.audio.toggle(); return; }
  if (py < L.hud) {
    if (hit(goBtn, px, py) && !G.active) {
      var bonus = Math.max(0, Math.ceil(G.prep) * 2);
      if (bonus > 0) { G.gold += bonus; floatT(L.w / 2, L.gy + 30, '+' + bonus + 'g early', '#7ee081'); }
      G.prep = 0; startWave();
    }
    return;
  }

  // sheet
  if (G.selTower && sheetBtns) {
    if (hit(sheetBtns.up, px, py, 4)) { upgrade(G.selTower); return; }
    if (hit(sheetBtns.sell, px, py, 4)) { sell(G.selTower); return; }
    if (hit(sheetBtns.close, px, py, 4)) { G.selTower = null; return; }
  }

  // chips
  if (py > L.h - L.bar && !G.selTower) {
    for (var i = 0; i < chipRects.length; i++) {
      var r = chipRects[i];
      if (hit(r, px, py, 3)) {
        G.pending = r.key;
        if (G.sel >= 0) tryBuild(G.sel, r.key);
        else toast('PICK A CELL');
        return;
      }
    }
    return;
  }

  // field
  var ci = cellAt(px, py);
  if (ci < 0) { G.sel = -1; G.selTower = null; return; }
  var tw = towerAt(ci);
  if (tw) { G.selTower = tw; G.sel = -1; return; }
  G.selTower = null;
  if (G.map.g[ci] === E.EMPTY && ci !== G.map.entry && ci !== G.map.exit) {
    if (G.sel === ci) tryBuild(ci, G.pending);
    else G.sel = ci;
  } else if (G.map.g[ci] === E.WALL) {
    // tap a wall to remove for half refund
    G.map.g[ci] = E.EMPTY; G.map.solve();
    for (var k = 0; k < G.creeps.length; k++) G.creeps[k].tx = undefined;
    G.gold += Math.floor(T.wall.cost * 0.6);
    E.audio.coin();
    G.sel = -1;
  } else { G.sel = -1; }
}

function pos(e) {
  var r = cv.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}
var tapPointerId = null;
cv.addEventListener('pointerdown', function (e) {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (tapPointerId !== null) return;
  e.preventDefault();
  tapPointerId = e.pointerId;
  cv.setPointerCapture?.(e.pointerId);
  var p = pos(e); onTap(p.x, p.y);
}, { passive: false });
cv.addEventListener('pointerup', function (e) {
  if (tapPointerId !== e.pointerId) return;
  e.preventDefault(); tapPointerId = null;
}, { passive: false });
cv.addEventListener('pointercancel', function (e) {
  if (tapPointerId === e.pointerId) tapPointerId = null;
}, { passive: false });
document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

document.addEventListener('keydown', function (e) {
  var k = e.key.toLowerCase();
  E.audio.init();
  if (G.phase !== 'play') {
    if (k === 'r' || k === 'enter' || k === ' ') { newGame(); e.preventDefault(); }
    if (k === 'c' && G.phase === 'win') { G.endless = true; G.phase = 'play'; G.prep = 9; }
    return;
  }
  if (k === 'arrowleft' || k === 'a') { G.kb = true; G.kx = Math.max(0, G.kx - 1); e.preventDefault(); }
  else if (k === 'arrowright' || k === 'd') { G.kb = true; G.kx = Math.min(L.cols - 1, G.kx + 1); e.preventDefault(); }
  else if (k === 'arrowup' || k === 'w') { G.kb = true; G.ky = Math.max(0, G.ky - 1); e.preventDefault(); }
  else if (k === 'arrowdown' || k === 's') { G.kb = true; G.ky = Math.min(L.rows - 1, G.ky + 1); e.preventDefault(); }
  else if (k === ' ' || k === 'enter') {
    e.preventDefault();
    G.kb = true;
    var ci = G.ky * L.cols + G.kx;
    var tw = towerAt(ci);
    if (tw) G.selTower = (G.selTower === tw ? null : tw);
    else { G.selTower = null; tryBuild(ci, G.pending); }
  }
  else if (k >= '1' && k <= '6') { G.pending = CHIPS[parseInt(k, 10) - 1]; toast(T[G.pending].name + ' SELECTED'); }
  else if (k === 'u') { var t2 = G.selTower || towerAt(G.ky * L.cols + G.kx); if (t2) upgrade(t2); }
  else if (k === 'x') { var t3 = G.selTower || towerAt(G.ky * L.cols + G.kx); if (t3) sell(t3); }
  else if (k === 'g') { if (!G.active) { G.gold += Math.max(0, Math.ceil(G.prep) * 2); G.prep = 0; startWave(); } }
  else if (k === 'r') newGame();
  else if (k === 'm') E.audio.toggle();
});

/* ---------------- loop ---------------- */
var last = 0;
function frame(ts) {
  if (!last) last = ts;
  var dt = Math.min(0.05, (ts - last) / 1000);
  last = ts;
  if (started) { update(dt); draw(); }
  requestAnimationFrame(frame);
}

resize();
newGame();
started = true;
requestAnimationFrame(frame);

})();
