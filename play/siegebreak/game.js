/* Siegebreak - fantasy siege defense. Hold the wall. */
'use strict';

/* ---------------- layout ---------------- */
var HUD_H = 62;
var WALL_TOP = 300;      // rampart floor (hero feet)
var MERLON_BOT = 322;    // bottom of crenellations
var GROUND_Y = 520;      // wall base / enemy walk lane
var BAR_Y = 632;         // bottom control bar top
var SPAWN_Y = 640;
var GX0 = 150, GX1 = 240, GY0 = 442, GY1 = GROUND_Y;
var SEG = [[0, 130], [130, 260], [260, 390]];
var SEGC = [65, 195, 325];
var TOTAL_NIGHTS = 10;

var C = {
  sky0: '#0b1030', sky1: '#161d3d',
  ground: '#161a26', ground2: '#0f121c',
  wall: '#3b4152', wallD: '#2b3040', wallL: '#4d5468',
  ramp: '#565e73',
  hero: '#ffd166', heroD: '#e0a32c',
  grunt: '#d9534f', grap: '#e0793f', elite: '#b07bd6',
  ram: '#8a6a4a', tower: '#6f7686',
  spear: '#7fd4ff', archer: '#9ae66e', oil: '#ffa94d',
  bad: '#ff5a4d', good: '#7dd87d', gold: '#ffd166'
};

/* ---------------- state ---------------- */
var G = null;
var best = loadBest();
var selChip = -1;      // selected squad chip index
var hint = 0;
var shopBtns = [];
var flash = 0;

var UP_DEFS = [
  { k: 'wall', name: 'REPAIR WALL', desc: '+45 hp to every segment', base: 30, step: 8 },
  { k: 'gate', name: 'REBUILD GATE', desc: '+90 gate hp', base: 35, step: 10 },
  { k: 'blade', name: 'SHARPEN BLADE', desc: 'hero damage +18%', base: 40, step: 15 },
  { k: 'drill', name: 'DRILL SQUADS', desc: 'squad rank +1', base: 45, step: 20 },
  { k: 'banner', name: 'WAR BANNER', desc: 'banner charges +30%', base: 40, step: 15 }
];

function newGame() {
  Input.clear();
  G = {
    mode: 'play',
    night: 1,
    valor: 0,
    segs: [{ hp: 100, max: 100 }, { hp: 100, max: 100 }, { hp: 100, max: 100 }],
    gate: { hp: 260, max: 260 },
    hero: { x: 195, y: WALL_TOP, leap: null, atk: 0, atkType: 'over', face: 1, combo: 0, comboT: 0 },
    enemies: [], ladders: [], parts: [], shots: [], pours: [], texts: [],
    squads: [
      { type: 'spear', seg: 0, moveTo: -1, moveT: 0, cd: 0 },
      { type: 'archer', seg: 1, moveTo: -1, moveT: 0, cd: 0 },
      { type: 'oil', seg: 2, moveTo: -1, moveT: 0, cd: 0 }
    ],
    banner: 0,
    gateOil: 100,
    heroDmg: 1, squadLvl: 1, bannerMul: 1,
    upCost: { wall: 30, gate: 35, blade: 40, drill: 45, banner: 40 },
    wave: null, waveT: 0,
    shake: 0, nightTitle: 2.4,
    ramMash: 0
  };
  startNight(1);
  selChip = -1;
  flash = 0;
  hint = 9;
}

/* ---------------- wave generation (seeded per night) ---------------- */
function startNight(n) {
  var r = makeRng(1337 + n * 7919);
  var dur = 22 + n * 3.2;
  var ev = [];
  function add(kind, count, t0, t1) {
    for (var i = 0; i < count; i++) {
      var s = Math.floor(r() * 3);
      ev.push({ t: t0 + (t1 - t0) * r(), kind: kind, seg: s });
    }
  }
  add('grunt', 6 + n * 3, 1.0, dur);
  if (n >= 2) add('grap', 1 + (n - 1) * 2, 5, dur);
  if (n >= 4) add('elite', 1 + Math.floor((n - 4) * 1.2), 8, dur);
  if (n >= 3) add('ram', n >= 8 ? 2 : 1, 6, dur * 0.65);
  if (n >= 6) add('tower', n >= 9 ? 2 : 1, 9, dur * 0.7);
  ev.sort(function (a, b) { return a.t - b.t; });
  G.wave = { ev: ev, i: 0, dur: dur };
  G.waveT = 0;
  G.nightTitle = 2.4;
  G.ladders.length = 0;
  G.enemies.length = 0;
  G.shots.length = 0;
  G.pours.length = 0;
  G.gateOil = 100;
}

/* ---------------- helpers ---------------- */
function segAt(x) { return x < 130 ? 0 : (x < 260 ? 1 : 2); }
function aliveSegs() { var c = 0; for (var i = 0; i < 3; i++) if (G.segs[i].hp > 0) c++; return c; }
function nearestOpenSeg(from) {
  var bi = -1, bd = 99;
  for (var i = 0; i < 3; i++) if (G.segs[i].hp > 0 && Math.abs(i - from) < bd) { bd = Math.abs(i - from); bi = i; }
  return bi;
}
function addPart(x, y, n, col, spd, life) {
  for (var i = 0; i < n; i++) {
    var a = rand(0, Math.PI * 2), s = rand(spd * 0.3, spd);
    G.parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, l: life || rand(0.25, 0.6), m: life || 0.6, c: col, r: rand(1.4, 3.2) });
  }
  if (G.parts.length > 260) G.parts.splice(0, G.parts.length - 260);
}
function floatText(x, y, s, col) {
  G.texts.push({ x: x, y: y, s: s, c: col || '#fff', l: 0.9 });
  if (G.texts.length > 22) G.texts.shift();
}
function shake(v) { G.shake = Math.min(16, G.shake + v); }

/* ---------------- enemies ---------------- */
var EDEF = {
  grunt: { hp: 30, gs: 36, cs: 27, w: 11, h: 22, col: C.grunt, dps: 5.0, valor: 3 },
  grap: { hp: 20, gs: 58, cs: 50, w: 10, h: 20, col: C.grap, dps: 4.5, valor: 4 },
  elite: { hp: 70, gs: 26, cs: 19, w: 14, h: 26, col: C.elite, dps: 10, valor: 9, shield: true },
  ram: { hp: 230, gs: 20, w: 62, h: 30, col: C.ram, dps: 11, valor: 26 },
  tower: { hp: 300, gs: 13, w: 46, h: 60, col: C.tower, dps: 0, valor: 32 }
};

function spawn(kind, seg) {
  var d = EDEF[kind];
  var hpScale = 1 + (G.night - 1) * 0.12;
  var e = {
    k: kind, x: 0, y: SPAWN_Y + rand(0, 14), hp: d.hp * hpScale, max: d.hp * hpScale,
    st: 'ground', seg: seg, ladder: null, vy: 0, shield: !!d.shield,
    tx: 0, cd: 0, unload: 2.2, wob: rand(0, 6.28), hurt: 0
  };
  if (kind === 'ram') { e.x = 195 + rand(-16, 16); e.tx = 195; e.seg = 1; }
  else { e.x = clamp(SEGC[seg] + rand(-46, 46), 14, VW - 14); e.tx = e.x; }
  if (kind === 'tower') { e.tx = clamp(SEGC[seg] + rand(-20, 20), 40, VW - 40); }
  G.enemies.push(e);
  return e;
}

function findLadder(seg, x) {
  var b = null, bd = 1e9;
  for (var i = 0; i < G.ladders.length; i++) {
    var L = G.ladders[i];
    if (L.hp <= 0) continue;
    var d = Math.abs(L.x - x) + (L.seg === seg ? 0 : 90);
    if (d < bd) { bd = d; b = L; }
  }
  return bd < 150 ? b : null;
}

function plantLadder(x, seg, kind) {
  var L = { x: clamp(x, 16, VW - 16), seg: seg, hp: kind === 'grap' ? 1 : 3, grap: kind === 'grap', build: 0 };
  G.ladders.push(L);
  Audio2.ladder();
  addPart(L.x, GROUND_Y, 8, '#8a7a55', 60);
  return L;
}

function damage(e, dmg, kind) {
  if (e.shield && kind !== 'kick' && kind !== 'banner') dmg *= 0.25;
  e.hp -= dmg;
  e.hurt = 0.12;
  if (e.hp <= 0) killEnemy(e);
}

function killEnemy(e) {
  e.dead = true;
  var d = EDEF[e.k];
  G.valor += d.valor;
  addPart(e.x, e.y - 8, e.k === 'ram' || e.k === 'tower' ? 26 : 10, d.col, e.k === 'tower' ? 150 : 90);
  if (e.k === 'ram' || e.k === 'tower') { shake(9); floatText(e.x, e.y - 30, '+' + d.valor, C.gold); }
  Audio2.kill();
}

/* ---------------- hero ---------------- */
function heroCommand(x, dir) {
  var h = G.hero;
  var tx = clamp(x, 16, VW - 16);
  var d = Math.abs(tx - h.x);
  h.face = tx >= h.x ? 1 : -1;
  h.leap = { x0: h.x, x1: tx, t: 0, dur: clamp(d / 950, 0.09, 0.30) };
  h.pending = (dir === 'down') ? 'kick' : (dir === 'left' || dir === 'right') ? 'sweep' : 'over';
}

function doAttack(type) {
  var h = G.hero;
  h.atk = 0.26; h.atkType = type;
  Audio2.swing();
  var hits = 0;
  var R = type === 'sweep' ? 74 : type === 'kick' ? 58 : 48;
  var dmgBase = (type === 'over' ? 38 : type === 'sweep' ? 21 : 16) * G.heroDmg;

  // enemies on rampart or near the top of the wall face
  for (var i = 0; i < G.enemies.length; i++) {
    var e = G.enemies[i];
    if (e.dead || e.k === 'ram') continue;
    if (e.k === 'tower') {
      if (e.arrived && Math.abs(e.x - h.x) < R + 26) {
        damage(e, dmgBase * 0.7, type); hits++;
        addPart(e.x, WALL_TOP + 10, 6, '#cfd6e6', 90, 0.3);
      }
      continue;
    }
    if (e.st === 'ground' || e.st === 'fall') continue;
    var reach = (e.st === 'top') ? 0 : (e.y - WALL_TOP);
    if (reach > (type === 'kick' ? 84 : 44)) continue;
    if (Math.abs(e.x - h.x) > R) continue;
    hits++;
    if (type === 'kick') {
      if (e.shield) { e.shield = false; addPart(e.x, e.y - 12, 8, '#dcd6ff', 90); floatText(e.x, e.y - 26, 'SHIELD!', '#dcd6ff'); }
      damage(e, dmgBase, type);
      if (!e.dead && e.st === 'climb') { e.st = 'fall'; e.vy = -40; e.ladder = null; }
      else if (!e.dead) { e.x += h.face * 16; }
    } else if (type === 'sweep') {
      damage(e, dmgBase, type);
      if (!e.dead) {
        e.x += (e.x > h.x ? 1 : -1) * 20;
        if (e.st === 'climb' && Math.random() < 0.4) { e.st = 'fall'; e.vy = -20; e.ladder = null; }
      }
    } else {
      damage(e, dmgBase, type);
    }
    addPart(e.x, e.y - 10, 5, type === 'kick' ? '#ffd9a0' : '#fff0c0', 80, 0.3);
  }

  // kick knocks ladders off the wall
  if (type === 'kick') {
    for (var j = 0; j < G.ladders.length; j++) {
      var L = G.ladders[j];
      if (L.hp <= 0) continue;
      if (Math.abs(L.x - h.x) < R) {
        L.hp = 0; hits++;
        addPart(L.x, WALL_TOP + 30, 14, '#9a854f', 120);
        Audio2.kick();
        floatText(L.x, WALL_TOP + 20, L.grap ? 'ROPE CUT' : 'LADDER DOWN', '#ffd9a0');
        for (var q = 0; q < G.enemies.length; q++) {
          var c = G.enemies[q];
          if (!c.dead && c.st === 'climb' && c.ladder === L) { c.st = 'fall'; c.vy = -30; c.ladder = null; }
        }
      }
    }
  }

  if (hits > 0) {
    Audio2.hit();
    shake(type === 'over' ? 5 : 3.5);
    h.comboT = 1.6;
    h.combo = Math.min(9, h.combo + 1);
    G.banner = Math.min(100, G.banner + (5 + h.combo * 1.6) * G.bannerMul);
  }
}

/* ---------------- rally / squads ---------------- */
function orderSquad(i, seg) {
  var s = G.squads[i];
  if (s.seg === seg && s.moveTo < 0) return;
  s.moveTo = seg; s.moveT = 1.0;
  Audio2.rally();
  floatText(SEGC[seg], WALL_TOP - 40, s.type.toUpperCase() + ' →', C[s.type]);
}

function bannerBurst() {
  if (G.banner < 100) return;
  G.banner = 0;
  Audio2.banner();
  shake(14); flash = 0.5;
  for (var i = 0; i < 3; i++) G.pours.push({ seg: i, t: 1.1, big: true });
  for (var j = 0; j < G.enemies.length; j++) {
    var e = G.enemies[j];
    if (e.dead) continue;
    if (e.st === 'climb') { e.st = 'fall'; e.vy = -50; e.ladder = null; damage(e, 40, 'banner'); }
    else damage(e, e.k === 'ram' || e.k === 'tower' ? 55 : 45, 'banner');
  }
  for (var k = 0; k < G.ladders.length; k++) if (G.ladders[k].grap) G.ladders[k].hp = 0;
  floatText(195, 200, 'RALLY!', C.gold);
}

function gateMash(x, y) {
  if (G.gateOil < 16) { return; }
  G.gateOil -= 16;
  Audio2.oil();
  G.pours.push({ gate: true, t: 0.45 });
  addPart(rand(GX0, GX1), GY0, 10, C.oil, 110, 0.5);
  shake(3);
  var hit = false;
  for (var i = 0; i < G.enemies.length; i++) {
    var e = G.enemies[i];
    if (e.dead) continue;
    if (e.y > GROUND_Y - 30 && e.x > GX0 - 40 && e.x < GX1 + 40) { damage(e, 24 * G.heroDmg, 'oil'); hit = true; }
  }
  if (hit) { G.banner = Math.min(100, G.banner + 3 * G.bannerMul); }
}

/* ---------------- update ---------------- */
function update(dt) {
  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 34);
  if (flash > 0) flash = Math.max(0, flash - dt * 1.6);
  if (hint > 0) hint -= dt;
  if (G.nightTitle > 0) G.nightTitle -= dt;

  for (var t = G.texts.length - 1; t >= 0; t--) {
    var T = G.texts[t]; T.l -= dt; T.y -= dt * 22; if (T.l <= 0) G.texts.splice(t, 1);
  }
  for (var p = G.parts.length - 1; p >= 0; p--) {
    var P = G.parts[p];
    P.l -= dt; P.x += P.vx * dt; P.y += P.vy * dt; P.vy += 320 * dt;
    if (P.l <= 0) G.parts.splice(p, 1);
  }
  for (var s = G.shots.length - 1; s >= 0; s--) {
    var S = G.shots[s]; S.t += dt * S.sp;
    if (S.t >= 1) G.shots.splice(s, 1);
  }
  for (var o = G.pours.length - 1; o >= 0; o--) { G.pours[o].t -= dt; if (G.pours[o].t <= 0) G.pours.splice(o, 1); }

  if (G.mode !== 'play') return;

  G.gateOil = Math.min(100, G.gateOil + dt * 15);

  /* --- keyboard movement --- */
  var h = G.hero;
  var kx = 0;
  if (Input.keys['arrowleft'] || Input.keys['a']) kx -= 1;
  if (Input.keys['arrowright'] || Input.keys['d']) kx += 1;
  if (kx !== 0 && !h.leap) { h.x = clamp(h.x + kx * 250 * dt, 16, VW - 16); h.face = kx; }

  if (h.leap) {
    h.leap.t += dt;
    var k = clamp(h.leap.t / h.leap.dur, 0, 1);
    h.x = lerp(h.leap.x0, h.leap.x1, k);
    h.y = WALL_TOP - Math.sin(k * Math.PI) * Math.min(30, Math.abs(h.leap.x1 - h.leap.x0) * 0.28);
    if (k >= 1) { h.leap = null; h.y = WALL_TOP; if (h.pending) { doAttack(h.pending); h.pending = null; } }
  }
  if (h.atk > 0) h.atk -= dt;
  if (h.comboT > 0) { h.comboT -= dt; if (h.comboT <= 0) h.combo = 0; }

  /* --- wave spawns --- */
  G.waveT += dt;
  var w = G.wave;
  while (w.i < w.ev.length && w.ev[w.i].t <= G.waveT) {
    var ev = w.ev[w.i++];
    spawn(ev.kind, ev.seg);
  }

  /* --- ladders --- */
  for (var li = G.ladders.length - 1; li >= 0; li--) if (G.ladders[li].hp <= 0) G.ladders.splice(li, 1);

  /* --- enemies --- */
  G.ramMash = 0;
  for (var i = G.enemies.length - 1; i >= 0; i--) {
    var e = G.enemies[i];
    if (e.dead) { G.enemies.splice(i, 1); continue; }
    if (e.hurt > 0) e.hurt -= dt;
    var d = EDEF[e.k];

    if (e.k === 'ram') {
      if (e.y > GROUND_Y - 6) { e.y -= d.gs * dt; e.x += (e.tx - e.x) * Math.min(1, dt * 1.6); }
      else {
        e.y = GROUND_Y - 6;
        G.ramMash = 1;
        G.gate.hp -= d.dps * dt * (1 + (G.night - 1) * 0.05);
        e.wob += dt * 6;
        if (Math.random() < dt * 2.2) { addPart(195, GY0 + 6, 4, '#c9a06a', 70); shake(2.2); Audio2.gate(); }
        if (G.gate.hp <= 0) { G.gate.hp = 0; loseGame(); return; }
      }
      continue;
    }

    if (e.k === 'tower') {
      if (!e.arrived) {
        e.y -= d.gs * dt;
        e.x += (e.tx - e.x) * Math.min(1, dt * 1.2);
        if (e.y <= GROUND_Y + 4) { e.arrived = true; e.y = GROUND_Y + 4; shake(6); }
      } else {
        e.unload -= dt;
        if (e.unload <= 0) {
          e.unload = 3.0;
          var el = spawn(G.night >= 7 ? 'elite' : 'grunt', segAt(e.x));
          el.st = 'top'; el.y = WALL_TOP; el.x = clamp(e.x + rand(-14, 14), 14, VW - 14);
          addPart(el.x, WALL_TOP, 8, '#cfd6e6', 70);
        }
      }
      continue;
    }

    if (e.st === 'ground') {
      // walk up to the wall base then to a ladder / plant one
      if (e.y > GROUND_Y) {
        e.y -= d.gs * dt;
        e.x += (e.tx - e.x) * Math.min(1, dt * 1.3);
      } else {
        e.y = GROUND_Y;
        var L = findLadder(e.seg, e.x);
        if (!L) {
          if (e.k === 'grap') { L = plantLadder(e.x, e.seg, 'grap'); }
          else {
            e.build = (e.build || 0) + dt;
            if (e.build > 0.7) L = plantLadder(e.x, e.seg, 'grunt');
          }
        }
        if (L) {
          if (Math.abs(e.x - L.x) > 3) e.x += Math.sign(L.x - e.x) * Math.min(Math.abs(L.x - e.x), d.gs * dt);
          else { e.st = 'climb'; e.ladder = L; e.off = rand(-4, 4); }
        }
      }
      continue;
    }

    if (e.st === 'climb') {
      if (!e.ladder || e.ladder.hp <= 0) { e.st = 'fall'; e.vy = 0; continue; }
      e.x = e.ladder.x + (e.off || 0);
      e.y -= d.cs * dt;
      if (e.y <= WALL_TOP) { e.y = WALL_TOP; e.st = 'top'; e.ladder = null; }
      continue;
    }

    if (e.st === 'fall') {
      e.vy += 620 * dt;
      e.y += e.vy * dt;
      if (e.y >= GROUND_Y) {
        damage(e, 26, 'fall');
        if (!e.dead) { e.st = 'ground'; e.y = GROUND_Y; e.tx = e.x; e.build = 0; }
        else { addPart(e.x, GROUND_Y, 10, d.col, 90); }
      }
      continue;
    }

    if (e.st === 'top') {
      var sg = segAt(e.x);
      if (G.segs[sg].hp > 0) {
        G.segs[sg].hp -= d.dps * dt;
        e.wob += dt * 8;
        if (Math.random() < dt * 1.4) addPart(e.x, WALL_TOP + 6, 3, '#9aa2b8', 50, 0.3);
        if (G.segs[sg].hp <= 0) {
          G.segs[sg].hp = 0;
          shake(11); Audio2.gate();
          floatText(SEGC[sg], WALL_TOP - 30, 'BREACHED', C.bad);
          addPart(SEGC[sg], WALL_TOP + 10, 24, '#6b7385', 160);
          if (aliveSegs() === 0) { loseGame(); return; }
        }
      } else {
        var tsg = nearestOpenSeg(sg);
        if (tsg >= 0) {
          var tx = SEGC[tsg];
          e.x += Math.sign(tx - e.x) * 34 * dt;
        }
      }
    }
  }

  /* --- squads --- */
  for (var q = 0; q < G.squads.length; q++) {
    var sq = G.squads[q];
    if (sq.moveTo >= 0) {
      sq.moveT -= dt;
      if (sq.moveT <= 0) { sq.seg = sq.moveTo; sq.moveTo = -1; }
      continue;
    }
    sq.cd -= dt;
    if (sq.cd > 0) continue;
    var lo = SEG[sq.seg][0], hi = SEG[sq.seg][1];
    if (sq.type === 'spear') {
      sq.cd = 0.55;
      var tgt = null;
      for (var a = 0; a < G.enemies.length; a++) {
        var en = G.enemies[a];
        if (en.dead || en.k === 'ram' || en.k === 'tower') continue;
        if (en.x < lo || en.x > hi) continue;
        if (en.st === 'top' || (en.st === 'climb' && en.y < WALL_TOP + 62)) { tgt = en; break; }
      }
      if (tgt) {
        damage(tgt, 9 + 6 * G.squadLvl, 'spear');
        G.shots.push({ x0: SEGC[sq.seg], y0: WALL_TOP - 6, x1: tgt.x, y1: tgt.y - 8, t: 0, sp: 7, c: C.spear, w: 2.5 });
      }
    } else if (sq.type === 'archer') {
      sq.cd = 0.7;
      var t2 = null, bd = 1e9;
      for (var b = 0; b < G.enemies.length; b++) {
        var e2 = G.enemies[b];
        if (e2.dead) continue;
        if (e2.x < lo - 20 || e2.x > hi + 20) continue;
        if (e2.st !== 'ground' && e2.k !== 'ram' && e2.k !== 'tower') continue;
        var dd = Math.abs(e2.x - SEGC[sq.seg]);
        if (dd < bd) { bd = dd; t2 = e2; }
      }
      if (t2) {
        damage(t2, 7 + 5 * G.squadLvl, 'arrow');
        G.shots.push({ x0: SEGC[sq.seg], y0: WALL_TOP - 8, x1: t2.x, y1: t2.y - 8, t: 0, sp: 3.2, c: C.archer, w: 2, arc: 1 });
      }
    } else {
      sq.cd = 4.6;
      var any = false;
      for (var cc = 0; cc < G.enemies.length; cc++) {
        var e3 = G.enemies[cc];
        if (e3.dead) continue;
        if (e3.x < lo - 12 || e3.x > hi + 12) continue;
        if (e3.st === 'climb') { damage(e3, 22 + 12 * G.squadLvl, 'oil'); any = true; if (Math.random() < 0.5 && !e3.dead) { e3.st = 'fall'; e3.vy = 0; e3.ladder = null; } }
        else if (e3.st === 'ground' && e3.y <= GROUND_Y + 6) { damage(e3, 12 + 7 * G.squadLvl, 'oil'); any = true; }
      }
      if (any) { G.pours.push({ seg: sq.seg, t: 0.8 }); Audio2.oil(); }
      else sq.cd = 1.2;
    }
  }

  /* --- night complete? --- */
  if (G.wave.i >= G.wave.ev.length && G.enemies.length === 0) {
    G.valor += 20 + G.night * 10;
    if (G.night > best) { best = G.night; saveBest(best); }
    if (G.night >= TOTAL_NIGHTS) { G.mode = 'win'; Audio2.win(); if (TOTAL_NIGHTS > best) { best = TOTAL_NIGHTS; saveBest(best); } }
    else { G.mode = 'shop'; selChip = -1; Audio2.rally(); }
  }
}

function loseGame() {
  G.mode = 'lose';
  var score = G.night - 1;
  if (score > best) { best = score; saveBest(best); }
  shake(16); flash = 0.6;
  Audio2.lose();
}

/* ---------------- drawing ---------------- */
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
function txt(s, x, y, size, col, align, bold) {
  ctx.fillStyle = col;
  ctx.font = (bold === false ? '' : 'bold ') + size + 'px ui-sans-serif, system-ui, -apple-system, Helvetica, Arial, sans-serif';
  ctx.textAlign = align || 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
}

var stars = (function () {
  var r = makeRng(99), a = [];
  for (var i = 0; i < 46; i++) a.push({ x: r() * VW, y: HUD_H + r() * (WALL_TOP - HUD_H - 20), r: r() * 1.3 + 0.4, p: r() * 6.28 });
  return a;
})();

function draw(time) {
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  var sh = G.shake;
  if (sh > 0) ctx.translate(rand(-sh, sh) * 0.5, rand(-sh, sh) * 0.5);

  /* sky */
  var g = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  g.addColorStop(0, '#070a1c'); g.addColorStop(0.55, C.sky0); g.addColorStop(1, '#241a2e');
  ctx.fillStyle = g; ctx.fillRect(-20, 0, VW + 40, GROUND_Y);

  for (var i = 0; i < stars.length; i++) {
    var s = stars[i];
    ctx.globalAlpha = 0.35 + 0.4 * Math.abs(Math.sin(time * 0.6 + s.p));
    ctx.fillStyle = '#cfd8ff';
    ctx.fillRect(s.x, s.y, s.r, s.r);
  }
  ctx.globalAlpha = 1;
  // moon
  ctx.fillStyle = '#e9e6d0'; ctx.beginPath(); ctx.arc(320, 108, 20, 0, 6.283); ctx.fill();
  ctx.fillStyle = C.sky0; ctx.beginPath(); ctx.arc(311, 101, 18, 0, 6.283); ctx.fill();

  /* ground / enemy field */
  var gg = ctx.createLinearGradient(0, GROUND_Y - 10, 0, BAR_Y);
  gg.addColorStop(0, '#2a2033'); gg.addColorStop(1, C.ground2);
  ctx.fillStyle = gg; ctx.fillRect(-20, GROUND_Y - 4, VW + 40, BAR_Y - GROUND_Y + 30);
  ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = 1;
  for (var yy = GROUND_Y + 16; yy < BAR_Y; yy += 22) {
    ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(VW, yy); ctx.stroke();
  }
  // enemy camp fires
  for (var f = 0; f < 3; f++) {
    var fx = 40 + f * 150, fy = BAR_Y - 8;
    ctx.fillStyle = 'rgba(255,140,60,' + (0.25 + 0.12 * Math.sin(time * 5 + f)) + ')';
    ctx.beginPath(); ctx.arc(fx, fy, 14 + Math.sin(time * 6 + f) * 2, 0, 6.283); ctx.fill();
  }

  drawGroundEnemies();
  drawWall(time);
  drawLadders(time);
  drawClimbers();
  drawPours(time);
  drawRampart(time);
  drawSquads(time);
  drawTopEnemies(time);
  drawHero(time);
  drawShots();
  drawParts();
  drawTexts();

  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  drawHUD(time);
  drawBar(time);

  if (flash > 0) {
    ctx.fillStyle = 'rgba(255,225,150,' + (flash * 0.5) + ')';
    ctx.fillRect(0, 0, VW, VH);
  }

  if (G.mode === 'shop') drawShop();
  else if (G.mode === 'lose') drawEnd(false);
  else if (G.mode === 'win') drawEnd(true);
  else if (G.nightTitle > 0) {
    var al = clamp(G.nightTitle / 0.7, 0, 1);
    ctx.globalAlpha = al;
    txt('NIGHT ' + G.night, VW / 2, 168, 40, C.gold);
    txt(nightBlurb(G.night), VW / 2, 200, 13, '#cbd2e6');
    ctx.globalAlpha = 1;
  }

  if (hint > 0 && G.mode === 'play') {
    ctx.globalAlpha = clamp(hint / 2, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,.55)'; rr(20, 236, 350, 30, 8); ctx.fill();
    txt('TAP the wall to leap & strike  •  SWIPE DOWN = kick ladders off', VW / 2, 251, 12, '#ffe9b8');
    ctx.globalAlpha = 1;
  }
}

function nightBlurb(n) {
  var b = ['ladders in the dark', 'ropes on the stone', 'the ram comes', 'shielded vanguard',
    'a tide of them', 'a tower rolls in', 'they climb faster', 'two rams at the gate',
    'towers and elites', 'the last assault'];
  return b[clamp(n - 1, 0, 9)];
}

function drawWall(time) {
  // wall face
  var g = ctx.createLinearGradient(0, MERLON_BOT, 0, GROUND_Y);
  g.addColorStop(0, C.wallL); g.addColorStop(0.35, C.wall); g.addColorStop(1, C.wallD);
  ctx.fillStyle = g;
  ctx.fillRect(0, MERLON_BOT, VW, GROUND_Y - MERLON_BOT);
  // bricks
  ctx.strokeStyle = 'rgba(0,0,0,.22)'; ctx.lineWidth = 1;
  for (var y = MERLON_BOT + 18; y < GROUND_Y; y += 18) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(VW, y); ctx.stroke();
    var off = ((y / 18) % 2) * 22;
    for (var x = off; x < VW; x += 44) {
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 18); ctx.stroke();
    }
  }
  // segment damage tint + cracks
  for (var i = 0; i < 3; i++) {
    var sg = G.segs[i], f = sg.hp / sg.max;
    if (f < 1) {
      ctx.fillStyle = 'rgba(180,40,30,' + (0.30 * (1 - f)) + ')';
      ctx.fillRect(SEG[i][0], MERLON_BOT, SEG[i][1] - SEG[i][0], GROUND_Y - MERLON_BOT);
    }
    if (sg.hp <= 0) {
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.fillRect(SEG[i][0] + 4, MERLON_BOT, SEG[i][1] - SEG[i][0] - 8, GROUND_Y - MERLON_BOT);
      ctx.strokeStyle = C.bad; ctx.lineWidth = 2;
      ctx.strokeRect(SEG[i][0] + 4, MERLON_BOT + 2, SEG[i][1] - SEG[i][0] - 8, GROUND_Y - MERLON_BOT - 4);
    }
    // divider
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 2;
    if (i > 0) { ctx.beginPath(); ctx.moveTo(SEG[i][0], MERLON_BOT); ctx.lineTo(SEG[i][0], GROUND_Y); ctx.stroke(); }
  }
  // gate
  var gf = G.gate.hp / G.gate.max;
  ctx.fillStyle = '#241a12'; ctx.fillRect(GX0 - 4, GY0 - 6, GX1 - GX0 + 8, GY1 - GY0 + 6);
  var gd = ctx.createLinearGradient(0, GY0, 0, GY1);
  gd.addColorStop(0, '#8a6a44'); gd.addColorStop(1, '#5a4229');
  ctx.fillStyle = gd;
  ctx.beginPath();
  ctx.moveTo(GX0, GY1); ctx.lineTo(GX0, GY0 + 16);
  ctx.quadraticCurveTo(195, GY0 - 16, GX1, GY0 + 16); ctx.lineTo(GX1, GY1);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 2;
  for (var b = GX0 + 12; b < GX1; b += 14) { ctx.beginPath(); ctx.moveTo(b, GY0 + 2); ctx.lineTo(b, GY1); ctx.stroke(); }
  ctx.strokeStyle = '#3a2b1a'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(GX0, GY0 + 26); ctx.lineTo(GX1, GY0 + 26); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(GX0, GY0 + 56); ctx.lineTo(GX1, GY0 + 56); ctx.stroke();
  if (gf < 1) {
    ctx.fillStyle = 'rgba(200,40,25,' + (0.45 * (1 - gf)) + ')';
    ctx.fillRect(GX0, GY0 - 10, GX1 - GX0, GY1 - GY0 + 10);
  }
  // gate hp bar under gate
  bar(GX0, GY1 - 10, GX1 - GX0, 6, gf, gf > 0.5 ? '#c8a35a' : (gf > 0.25 ? '#e2a33c' : C.bad));

  // mash prompt
  if (G.ramMash && G.mode === 'play') {
    var pulse = 0.5 + 0.5 * Math.sin(time * 9);
    ctx.strokeStyle = 'rgba(255,169,77,' + (0.5 + pulse * 0.5) + ')';
    ctx.lineWidth = 3; rr(GX0 - 12, GY0 - 14, GX1 - GX0 + 24, GY1 - GY0 + 22, 8); ctx.stroke();
    txt('MASH: POUR OIL', 195, GY0 - 26, 12, '#ffd9a0');
    bar(GX0, GY0 - 8, GX1 - GX0, 5, G.gateOil / 100, C.oil);
  }
}

function drawRampart(time) {
  // walkway
  ctx.fillStyle = C.ramp;
  ctx.fillRect(0, WALL_TOP, VW, 8);
  ctx.fillStyle = 'rgba(255,255,255,.10)';
  ctx.fillRect(0, WALL_TOP, VW, 2);
  // crenellations (behind hero visually: drawn as blocks hanging below walkway top edge)
  ctx.fillStyle = C.wallL;
  for (var x = 0; x < VW; x += 26) ctx.fillRect(x, WALL_TOP + 8, 18, 14);
  // torches at segment edges
  for (var i = 0; i < 4; i++) {
    var tx2 = i * 130;
    tx2 = clamp(tx2, 4, VW - 6);
    ctx.fillStyle = '#5a4a33'; ctx.fillRect(tx2 - 1, WALL_TOP - 14, 3, 14);
    var fl = 0.6 + 0.4 * Math.sin(time * 7 + i * 2);
    ctx.fillStyle = 'rgba(255,170,60,' + (0.55 * fl) + ')';
    ctx.beginPath(); ctx.arc(tx2, WALL_TOP - 17, 5 + fl * 2, 0, 6.283); ctx.fill();
  }
}

function drawGroundEnemies() {
  for (var i = 0; i < G.enemies.length; i++) {
    var e = G.enemies[i];
    if (e.k === 'ram') { drawRam(e); continue; }
    if (e.k === 'tower') { drawTower(e); continue; }
    if (e.st === 'ground' || e.st === 'fall') drawFoot(e);
  }
}
function drawClimbers() {
  for (var i = 0; i < G.enemies.length; i++) {
    var e = G.enemies[i];
    if (e.st === 'climb') drawFoot(e);
  }
}
function drawTopEnemies(time) {
  for (var i = 0; i < G.enemies.length; i++) {
    var e = G.enemies[i];
    if (e.st === 'top') drawFoot(e);
  }
}

function drawFoot(e) {
  var d = EDEF[e.k];
  var col = e.hurt > 0 ? '#ffffff' : d.col;
  var w = d.w, h = d.h;
  ctx.fillStyle = col;
  rr(e.x - w / 2, e.y - h, w, h - 5, 3); ctx.fill();
  ctx.beginPath(); ctx.arc(e.x, e.y - h - 3, w * 0.42, 0, 6.283); ctx.fill();
  // legs
  ctx.fillRect(e.x - w / 2 + 1, e.y - 5, 3, 5);
  ctx.fillRect(e.x + w / 2 - 4, e.y - 5, 3, 5);
  if (e.shield) {
    ctx.fillStyle = '#dcd6ff';
    rr(e.x - w / 2 - 6, e.y - h + 2, 5, h - 6, 2); ctx.fill();
  }
  if (e.k === 'grap' && e.st === 'ground') {
    ctx.strokeStyle = '#c8b48a'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(e.x, e.y - h); ctx.lineTo(e.x + 8, e.y - h - 8); ctx.stroke();
  }
  if (e.st === 'top') {
    // little weapon swing
    ctx.strokeStyle = '#e8e2d0'; ctx.lineWidth = 2;
    var a = Math.sin(e.wob) * 0.7;
    ctx.beginPath(); ctx.moveTo(e.x, e.y - h + 4);
    ctx.lineTo(e.x + Math.cos(a - 1.1) * 13, e.y - h + 4 + Math.sin(a - 1.1) * 13); ctx.stroke();
  }
  // hp pip
  if (e.hp < e.max) bar(e.x - 9, e.y - h - 12, 18, 3, e.hp / e.max, C.bad);
}

function drawRam(e) {
  var d = EDEF.ram;
  var wob = Math.sin(e.wob) * 4;
  ctx.fillStyle = '#463322';
  rr(e.x - d.w / 2, e.y - d.h, d.w, d.h, 4); ctx.fill();
  ctx.fillStyle = e.hurt > 0 ? '#fff' : '#7d5f3f';
  rr(e.x - d.w / 2 + 6, e.y - d.h - 10 + wob * 0.2, d.w - 12, 12, 6); ctx.fill();
  ctx.fillStyle = '#3a2b1a';
  rr(e.x - 8, e.y - d.h - 14 + wob, 16, 8, 3); ctx.fill();
  // wheels
  ctx.fillStyle = '#2b2118';
  ctx.beginPath(); ctx.arc(e.x - 18, e.y - 3, 6, 0, 6.283); ctx.fill();
  ctx.beginPath(); ctx.arc(e.x + 18, e.y - 3, 6, 0, 6.283); ctx.fill();
  bar(e.x - 26, e.y - d.h - 24, 52, 4, e.hp / e.max, C.bad);
  txt('RAM', e.x, e.y - d.h - 32, 9, '#e6b98a');
}

function drawTower(e) {
  var d = EDEF.tower;
  var top = e.y - (e.arrived ? (GROUND_Y - WALL_TOP + 8) : d.h);
  ctx.fillStyle = e.hurt > 0 ? '#fff' : '#5c6272';
  rr(e.x - d.w / 2, top, d.w, e.y - top, 4); ctx.fill();
  ctx.fillStyle = '#41465a';
  for (var y = top + 12; y < e.y - 8; y += 18) ctx.fillRect(e.x - d.w / 2 + 4, y, d.w - 8, 3);
  ctx.fillStyle = '#7d8598';
  ctx.fillRect(e.x - d.w / 2 - 4, top - 6, d.w + 8, 8);
  ctx.fillStyle = '#2b2118';
  ctx.beginPath(); ctx.arc(e.x - 14, e.y - 3, 6, 0, 6.283); ctx.fill();
  ctx.beginPath(); ctx.arc(e.x + 14, e.y - 3, 6, 0, 6.283); ctx.fill();
  bar(e.x - 26, top - 18, 52, 4, e.hp / e.max, C.bad);
  txt('TOWER', e.x, top - 26, 9, '#c3cad9');
}

function drawLadders(time) {
  for (var i = 0; i < G.ladders.length; i++) {
    var L = G.ladders[i];
    if (L.grap) {
      ctx.strokeStyle = '#c8b48a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(L.x, GROUND_Y); ctx.lineTo(L.x + 2, WALL_TOP + 6); ctx.stroke();
      ctx.fillStyle = '#9aa2b8';
      ctx.fillRect(L.x - 4, WALL_TOP + 4, 9, 5);
    } else {
      ctx.strokeStyle = '#9a854f'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(L.x - 7, GROUND_Y); ctx.lineTo(L.x - 7, WALL_TOP + 4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(L.x + 7, GROUND_Y); ctx.lineTo(L.x + 7, WALL_TOP + 4); ctx.stroke();
      ctx.lineWidth = 2;
      for (var y = WALL_TOP + 12; y < GROUND_Y; y += 16) {
        ctx.beginPath(); ctx.moveTo(L.x - 7, y); ctx.lineTo(L.x + 7, y); ctx.stroke();
      }
    }
  }
}

function drawPours(time) {
  for (var i = 0; i < G.pours.length; i++) {
    var p = G.pours[i];
    var a = clamp(p.t, 0, 1);
    if (p.gate) {
      ctx.fillStyle = 'rgba(255,169,77,' + (0.5 * a) + ')';
      ctx.fillRect(GX0, GY0 - 6, GX1 - GX0, GY1 - GY0 + 8);
      continue;
    }
    var lo = SEG[p.seg][0] + 4, w = SEG[p.seg][1] - SEG[p.seg][0] - 8;
    var gr = ctx.createLinearGradient(0, WALL_TOP, 0, GROUND_Y);
    gr.addColorStop(0, 'rgba(255,200,90,' + (0.75 * a) + ')');
    gr.addColorStop(1, 'rgba(200,80,20,' + (0.25 * a) + ')');
    ctx.fillStyle = gr;
    ctx.fillRect(lo, WALL_TOP + 10, w, GROUND_Y - WALL_TOP - 10);
    for (var k = 0; k < 4; k++) {
      var x = lo + ((k * 37 + time * 260) % w);
      ctx.fillStyle = 'rgba(255,230,160,' + (0.5 * a) + ')';
      ctx.fillRect(x, WALL_TOP + 12, 3, 26);
    }
  }
}

function drawSquads(time) {
  for (var i = 0; i < G.squads.length; i++) {
    var sq = G.squads[i];
    var seg = sq.moveTo >= 0 ? sq.moveTo : sq.seg;
    var x = SEGC[seg];
    if (sq.moveTo >= 0) x = lerp(SEGC[sq.seg], SEGC[sq.moveTo], 1 - sq.moveT / 1.0);
    x += (i - 1) * 26;
    var col = C[sq.type];
    for (var m = 0; m < 3; m++) {
      var mx = x + (m - 1) * 8;
      ctx.globalAlpha = sq.moveTo >= 0 ? 0.55 : 1;
      ctx.fillStyle = col;
      rr(mx - 3, WALL_TOP - 15, 6, 12, 2); ctx.fill();
      ctx.beginPath(); ctx.arc(mx, WALL_TOP - 18, 2.6, 0, 6.283); ctx.fill();
      if (sq.type === 'spear') { ctx.fillRect(mx + 3, WALL_TOP - 26, 1.5, 20); }
      else if (sq.type === 'archer') { ctx.fillRect(mx + 3, WALL_TOP - 22, 1.5, 12); }
      else { ctx.fillRect(mx - 4, WALL_TOP - 22, 8, 4); }
      ctx.globalAlpha = 1;
    }
  }
}

function drawHero(time) {
  var h = G.hero;
  var bob = h.leap ? 0 : Math.sin(time * 3) * 1.2;
  var x = h.x, y = h.y + bob;
  // glow
  ctx.fillStyle = 'rgba(255,209,102,.10)';
  ctx.beginPath(); ctx.arc(x, y - 16, 26, 0, 6.283); ctx.fill();
  // body
  ctx.fillStyle = C.hero;
  rr(x - 7, y - 26, 14, 20, 4); ctx.fill();
  ctx.fillStyle = C.heroD;
  ctx.fillRect(x - 7, y - 8, 5, 8); ctx.fillRect(x + 2, y - 8, 5, 8);
  ctx.fillStyle = C.hero;
  ctx.beginPath(); ctx.arc(x, y - 31, 6, 0, 6.283); ctx.fill();
  // cape
  ctx.fillStyle = 'rgba(200,60,70,.85)';
  ctx.beginPath();
  ctx.moveTo(x - h.face * 5, y - 27);
  ctx.lineTo(x - h.face * 15, y - 6 + (h.leap ? 6 : 0));
  ctx.lineTo(x - h.face * 3, y - 8);
  ctx.closePath(); ctx.fill();
  // sword
  var t = h.atk > 0 ? (1 - h.atk / 0.26) : -1;
  ctx.strokeStyle = '#fff4d0'; ctx.lineCap = 'round';
  if (t >= 0) {
    if (h.atkType === 'over') {
      var a = lerp(-2.1, 0.2, t);           // angle from straight up, swinging down
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(x, y - 22);
      ctx.lineTo(x + Math.sin(a) * 32 * h.face, y - 22 - Math.cos(a) * 32);
      ctx.stroke();
      ctx.globalAlpha = 0.35 * (1 - t);
      ctx.strokeStyle = '#ffe9a8'; ctx.lineWidth = 9;
      ctx.beginPath();
      if (h.face > 0) ctx.arc(x, y - 22, 32, -2.6, -0.9);
      else ctx.arc(x, y - 22, 32, -2.24, -0.54);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (h.atkType === 'sweep') {
      ctx.lineWidth = 4;
      var a2 = lerp(-1.2, 1.2, t) * h.face;
      ctx.beginPath(); ctx.moveTo(x, y - 18);
      ctx.lineTo(x + Math.cos(a2) * 34 * h.face, y - 18 + Math.sin(a2) * 12); ctx.stroke();
      ctx.globalAlpha = 0.3 * (1 - t);
      ctx.fillStyle = '#ffe9a8';
      ctx.beginPath(); ctx.ellipse(x, y - 16, 60, 16, 0, 0, 6.283); ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(x, y - 12);
      ctx.lineTo(x + h.face * lerp(6, 26, t), y - 4); ctx.stroke();
      ctx.globalAlpha = 0.35 * (1 - t);
      ctx.fillStyle = '#ffd9a0';
      ctx.fillRect(x - 46, y + 2, 92, 10);
      ctx.globalAlpha = 1;
    }
  } else {
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x + h.face * 8, y - 24); ctx.lineTo(x + h.face * 12, y - 42); ctx.stroke();
  }
  ctx.lineCap = 'butt';
  if (h.combo > 1) txt('x' + h.combo, x, y - 50, 12, C.gold);
}

function drawShots() {
  for (var i = 0; i < G.shots.length; i++) {
    var s = G.shots[i];
    var t = clamp(s.t, 0, 1);
    var x = lerp(s.x0, s.x1, t), y = lerp(s.y0, s.y1, t);
    if (s.arc) y -= Math.sin(t * Math.PI) * 26;
    ctx.strokeStyle = s.c; ctx.lineWidth = s.w;
    var px = lerp(s.x0, s.x1, Math.max(0, t - 0.12));
    var py = lerp(s.y0, s.y1, Math.max(0, t - 0.12));
    if (s.arc) py -= Math.sin(Math.max(0, t - 0.12) * Math.PI) * 26;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
  }
}

function drawParts() {
  for (var i = 0; i < G.parts.length; i++) {
    var p = G.parts[i];
    ctx.globalAlpha = clamp(p.l / p.m, 0, 1);
    ctx.fillStyle = p.c;
    ctx.fillRect(p.x, p.y, p.r, p.r);
  }
  ctx.globalAlpha = 1;
}
function drawTexts() {
  for (var i = 0; i < G.texts.length; i++) {
    var t = G.texts[i];
    ctx.globalAlpha = clamp(t.l / 0.6, 0, 1);
    txt(t.s, t.x, t.y, 12, t.c);
    ctx.globalAlpha = 1;
  }
}

function bar(x, y, w, h, f, col) {
  ctx.fillStyle = 'rgba(0,0,0,.5)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = col;
  ctx.fillRect(x, y, w * clamp(f, 0, 1), h);
}

function drawHUD(time) {
  ctx.fillStyle = '#080b16';
  ctx.fillRect(0, 0, VW, HUD_H);
  ctx.fillStyle = 'rgba(255,255,255,.07)';
  ctx.fillRect(0, HUD_H - 1, VW, 1);

  txt('NIGHT ' + G.night + '/' + TOTAL_NIGHTS, 8, 14, 13, C.gold, 'left');
  txt('BEST ' + best, VW - 8, 14, 11, '#8f97ad', 'right');
  txt('VALOR ' + Math.floor(G.valor), VW - 8, 30, 11, C.gold, 'right');

  // segment bars
  for (var i = 0; i < 3; i++) {
    var x = 8 + i * 78, sg = G.segs[i], f = sg.hp / sg.max;
    bar(x, 26, 70, 7, f, sg.hp <= 0 ? '#4a2028' : (f > 0.5 ? C.good : (f > 0.25 ? '#e2c33c' : C.bad)));
    txt('W' + (i + 1), x + 35, 42, 9, '#7d859b');
  }
  // gate bar
  bar(250, 26, 70, 7, G.gate.hp / G.gate.max, G.gate.hp / G.gate.max > 0.4 ? '#c8a35a' : C.bad);
  txt('GATE', 285, 42, 9, '#7d859b');

  // banner meter
  var bf = G.banner / 100;
  bar(8, 48, 304, 6, bf, bf >= 1 ? C.gold : '#6d5fd6');
  txt('BANNER', 340, 51, 9, bf >= 1 ? C.gold : '#7d859b');

  // wave progress
  var wp = G.wave ? clamp(G.waveT / G.wave.dur, 0, 1) : 0;
  ctx.fillStyle = 'rgba(255,255,255,.12)';
  ctx.fillRect(0, HUD_H - 3, VW * wp, 2);
}

var BTN = [];
function drawBar(time) {
  BTN.length = 0;
  ctx.fillStyle = '#080b16';
  ctx.fillRect(0, BAR_Y, VW, VH - BAR_Y);
  ctx.fillStyle = 'rgba(255,255,255,.07)';
  ctx.fillRect(0, BAR_Y, VW, 1);

  var w = 92, gap = 5, x0 = 6, y = BAR_Y + 6, h = 56;
  for (var i = 0; i < 3; i++) {
    var sq = G.squads[i];
    var x = x0 + i * (w + gap);
    BTN.push({ x: x, y: y, w: w, h: h, kind: 'chip', i: i });
    var sel = selChip === i;
    ctx.fillStyle = sel ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,.06)';
    rr(x, y, w, h, 8); ctx.fill();
    ctx.strokeStyle = sel ? C[sq.type] : 'rgba(255,255,255,.14)';
    ctx.lineWidth = sel ? 2.5 : 1;
    rr(x, y, w, h, 8); ctx.stroke();
    txt(sq.type.toUpperCase(), x + w / 2, y + 17, 13, C[sq.type]);
    var segn = (sq.moveTo >= 0 ? sq.moveTo : sq.seg) + 1;
    txt('WALL ' + segn + (sq.moveTo >= 0 ? ' …' : ''), x + w / 2, y + 35, 10, '#aeb6cc');
    if (sq.type === 'oil') {
      bar(x + 14, y + 45, w - 28, 4, 1 - clamp(sq.cd / 4.6, 0, 1), C.oil);
    } else {
      txt('R' + G.squadLvl, x + w / 2, y + 46, 9, '#7d859b');
    }
  }
  // banner button
  var bx = x0 + 3 * (w + gap);
  BTN.push({ x: bx, y: y, w: VW - bx - 6, h: h, kind: 'banner' });
  var full = G.banner >= 100;
  ctx.fillStyle = full ? 'rgba(255,209,102,' + (0.25 + 0.15 * Math.sin(time * 8)) + ')' : 'rgba(255,255,255,.05)';
  rr(bx, y, VW - bx - 6, h, 8); ctx.fill();
  ctx.strokeStyle = full ? C.gold : 'rgba(255,255,255,.12)';
  ctx.lineWidth = full ? 2.5 : 1;
  rr(bx, y, VW - bx - 6, h, 8); ctx.stroke();
  txt('RALLY', bx + (VW - bx - 6) / 2, y + 22, 13, full ? C.gold : '#5f6780');
  txt(full ? 'READY!' : Math.floor(G.banner) + '%', bx + (VW - bx - 6) / 2, y + 40, 10, full ? C.gold : '#5f6780');

  // segment targeting overlay when a chip is selected
  if (selChip >= 0 && G.mode === 'play') {
    for (var s = 0; s < 3; s++) {
      var lo = SEG[s][0], sw = SEG[s][1] - SEG[s][0];
      ctx.fillStyle = 'rgba(255,255,255,.07)';
      ctx.fillRect(lo + 3, HUD_H + 6, sw - 6, GROUND_Y - HUD_H - 12);
      ctx.strokeStyle = C[G.squads[selChip].type]; ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.strokeRect(lo + 3, HUD_H + 6, sw - 6, GROUND_Y - HUD_H - 12);
      ctx.setLineDash([]);
      txt('WALL ' + (s + 1), SEGC[s], HUD_H + 24, 15, C[G.squads[selChip].type]);
    }
    txt('tap a wall to send ' + G.squads[selChip].type.toUpperCase(), VW / 2, GROUND_Y + 24, 12, '#e7ecff');
  }
}

/* ---------------- shop / end screens ---------------- */
function drawShop() {
  ctx.fillStyle = 'rgba(6,8,16,.90)';
  ctx.fillRect(0, 0, VW, VH);
  txt('NIGHT ' + G.night + ' HELD', VW / 2, 74, 26, C.gold);
  txt('VALOR: ' + Math.floor(G.valor), VW / 2, 104, 15, '#dfe5f5');
  txt('spend before the horns sound again', VW / 2, 124, 11, '#8f97ad');

  shopBtns.length = 0;
  var y = 150;
  for (var i = 0; i < UP_DEFS.length; i++) {
    var u = UP_DEFS[i], cost = G.upCost[u.k];
    var can = G.valor >= cost;
    var b = { x: 24, y: y, w: VW - 48, h: 62, k: u.k, cost: cost, can: can };
    shopBtns.push(b);
    ctx.fillStyle = can ? 'rgba(255,255,255,.08)' : 'rgba(255,255,255,.03)';
    rr(b.x, b.y, b.w, b.h, 10); ctx.fill();
    ctx.strokeStyle = can ? C.gold : 'rgba(255,255,255,.10)';
    ctx.lineWidth = can ? 2 : 1;
    rr(b.x, b.y, b.w, b.h, 10); ctx.stroke();
    txt(u.name, b.x + 14, b.y + 21, 14, can ? '#fff' : '#5f6780', 'left');
    txt(u.desc, b.x + 14, b.y + 41, 11, can ? '#aeb6cc' : '#4e556b', 'left');
    txt(cost + 'v', b.x + b.w - 14, b.y + 31, 15, can ? C.gold : '#5f6780', 'right');
    y += 70;
  }
  var cb = { x: 24, y: 552, w: VW - 48, h: 58, k: 'go' };
  shopBtns.push(cb);
  ctx.fillStyle = 'rgba(216,80,70,.22)';
  rr(cb.x, cb.y, cb.w, cb.h, 10); ctx.fill();
  ctx.strokeStyle = C.bad; ctx.lineWidth = 2;
  rr(cb.x, cb.y, cb.w, cb.h, 10); ctx.stroke();
  txt('BEGIN NIGHT ' + (G.night + 1), VW / 2, 581, 17, '#ffd8d2');
  txt(nightBlurb(G.night + 1), VW / 2, 624, 11, '#8f97ad');
}

function drawEnd(won) {
  ctx.fillStyle = won ? 'rgba(10,20,14,.92)' : 'rgba(16,6,8,.92)';
  ctx.fillRect(0, 0, VW, VH);
  var score = won ? TOTAL_NIGHTS : G.night - 1;
  txt(won ? 'THE SIEGE IS BROKEN' : 'THE WALL HAS FALLEN', VW / 2, 250, won ? 24 : 25, won ? C.good : C.bad);
  txt(won ? 'Ten nights held. Dawn is yours.' : 'They pour through the stone.', VW / 2, 282, 12, '#aeb6cc');
  txt('NIGHTS SURVIVED', VW / 2, 336, 12, '#8f97ad');
  txt(String(score), VW / 2, 376, 54, C.gold);
  txt('BEST ' + best, VW / 2, 414, 14, '#dfe5f5');
  ctx.fillStyle = 'rgba(255,255,255,.08)';
  rr(90, 452, 210, 58, 10); ctx.fill();
  ctx.strokeStyle = C.gold; ctx.lineWidth = 2;
  rr(90, 452, 210, 58, 10); ctx.stroke();
  txt('HOLD AGAIN', VW / 2, 481, 17, C.gold);
}

/* ---------------- input wiring ---------------- */
function inRect(x, y, r) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }

Input.onPress = function (x, y) {
  if (G.mode !== 'play') return;
  // ram mash: rapid repeated presses on the gate
  if (G.ramMash && y > GY0 - 22 && y < GY1 + 8 && x > GX0 - 24 && x < GX1 + 24) {
    gateMash(x, y);
  }
};

Input.onTap = function (x, y, dir) {
  if (G.mode === 'shop') { shopTap(x, y); return; }
  if (G.mode === 'lose' || G.mode === 'win') { newGame(); Audio2.ui(); return; }

  // bottom bar buttons
  for (var i = 0; i < BTN.length; i++) {
    var b = BTN[i];
    if (inRect(x, y, b)) {
      if (b.kind === 'chip') { selChip = (selChip === b.i) ? -1 : b.i; Audio2.ui(); }
      else { if (G.banner >= 100) bannerBurst(); else Audio2.ui(); }
      return;
    }
  }
  if (y > BAR_Y) return;
  if (y < HUD_H) return;

  if (selChip >= 0) {
    orderSquad(selChip, segAt(x));
    selChip = -1;
    return;
  }
  // gate mash region handled on press; ignore taps that were mashes
  if (G.ramMash && y > GY0 - 22 && y < GY1 + 8 && x > GX0 - 24 && x < GX1 + 24) return;

  heroCommand(x, dir);
};

function shopTap(x, y) {
  for (var i = 0; i < shopBtns.length; i++) {
    var b = shopBtns[i];
    if (!inRect(x, y, b)) continue;
    if (b.k === 'go') {
      G.mode = 'play';
      G.night++;
      startNight(G.night);
      Audio2.rally();
      return;
    }
    if (!b.can) { Audio2.ui(); return; }
    G.valor -= b.cost;
    var def = null;
    for (var j = 0; j < UP_DEFS.length; j++) if (UP_DEFS[j].k === b.k) def = UP_DEFS[j];
    G.upCost[b.k] += def.step;
    Audio2.buy();
    if (b.k === 'wall') {
      for (var s = 0; s < 3; s++) { G.segs[s].max = Math.max(G.segs[s].max, 100); G.segs[s].hp = Math.min(G.segs[s].max, G.segs[s].hp + 45); }
    } else if (b.k === 'gate') {
      G.gate.hp = Math.min(G.gate.max, G.gate.hp + 90);
    } else if (b.k === 'blade') {
      G.heroDmg *= 1.18;
    } else if (b.k === 'drill') {
      G.squadLvl++;
    } else {
      G.bannerMul *= 1.3;
    }
    return;
  }
}

Input.onKey = function (k) {
  if (G.mode === 'lose' || G.mode === 'win') {
    if (k === ' ' || k === 'enter' || k === 'r') newGame();
    return;
  }
  if (G.mode === 'shop') {
    if (k === 'enter' || k === ' ') { G.mode = 'play'; G.night++; startNight(G.night); Audio2.rally(); return; }
    var idx = ['1', '2', '3', '4', '5'].indexOf(k);
    if (idx >= 0 && shopBtns[idx]) {
      var b = shopBtns[idx];
      if (b.can) { shopTap(b.x + 5, b.y + 5); }
    }
    return;
  }
  if (k === ' ') doAttack('over');
  else if (k === 'arrowdown' || k === 's') doAttack('kick');
  else if (k === 'arrowup' || k === 'w') doAttack('sweep');
  else if (k === 'enter') bannerBurst();
  else if (k === '1' || k === '2' || k === '3') { selChip = parseInt(k, 10) - 1; Audio2.ui(); }
  else if (k === 'q' || k === 'e' || k === 'r') {
    var seg = k === 'q' ? 0 : (k === 'e' ? 1 : 2);
    if (selChip >= 0) { orderSquad(selChip, seg); selChip = -1; }
  }
};

/* ---------------- main loop ---------------- */
var last = 0;
function frame(ms) {
  var t = ms / 1000;
  var dt = Math.min(0.05, t - last || 0.016);
  last = t;
  update(dt);
  draw(t);
  requestAnimationFrame(frame);
}

newGame();
requestAnimationFrame(frame);
