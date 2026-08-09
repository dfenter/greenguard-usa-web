/* Kinetic Burst - battle loop, screens, rendering */
'use strict';

var cv = document.getElementById('cv');
var ctx = cv.getContext('2d', { alpha: false });
var rotEl = document.getElementById('rot');
var gateEl = document.getElementById('gate');

/* ---------------- layout ---------------- */
var LY = {
  hdr: 0,
  foeY: 36, foeH: 126, cardW: 118, cardGap: 10, cardX0: 8,
  ownY: 166, ownH: 110,
  statusY: 282,
  timerY: 316, timerH: 8,
  barY: 622, barH: 68
};
function cardX(i) { return LY.cardX0 + i * (LY.cardW + LY.cardGap); }

/* ---------------- game state ---------------- */
var G = null;
var save = Store.read();
var paused = false, started = false, hidden = document.hidden;

function defaultUnlocked() { return [0, 1, 2]; }

function newGame(keepProgress) {
  Timers.clear();
  FX.clear();
  Input.reset();
  Board.init();
  Board.clearTrace();
  var unlocked = (save.unlocked && save.unlocked.length >= 3) ? save.unlocked.slice(0) : defaultUnlocked();
  var team = save.team && save.team.length === 3 ? save.team.slice(0) : [0, 1, 2];
  for (var i = 0; i < 3; i++) if (unlocked.indexOf(team[i]) < 0) team[i] = unlocked[i % unlocked.length];
  G = {
    round: keepProgress ? clamp(save.round | 0, 1, 8) : 1,
    turn: 1,
    unlocked: unlocked,
    teamIds: team,
    team: [],
    foes: [],
    sub: 'trace',
    overlay: null,
    target: 0,
    pendingRuns: [], runIdx: 0, comboCount: 0,
    attackQueue: [],
    clash: null,
    strike: null,
    status: '',
    hintOn: true,
    rosterSel: [],
    turnDmg: 0
  };
  startRound(G.round);
}

function makeFighter(id) {
  var f = FIGHTERS[id];
  return { id: id, name: f.name, type: f.type, maxhp: f.hp, hp: f.hp, atk: f.atk, charge: 0, flash: 0, hitT: 0 };
}
function overcapFor(f) { return f.id === 6 ? 250 : M.overcap; }

function newPlan(foe) {
  var alive = [];
  for (var i = 0; i < G.team.length; i++) if (G.team[i].hp > 0) alive.push(i);
  var t = alive.length ? pick(alive) : 0;
  foe.plan = { target: t, dmg: Math.round(foe.atk * rnd(0.85, 1.2)) };
}

function startRound(r) {
  Timers.clear();
  FX.clear();
  Input.reset();
  Board.init();
  G.round = r;
  G.turn = 1;
  G.sub = 'trace';
  G.overlay = null;
  G.target = 0;
  G.pendingRuns = []; G.attackQueue = []; G.clash = null; G.strike = null;
  G.team = [];
  for (var i = 0; i < 3; i++) G.team.push(makeFighter(G.teamIds[i]));
  G.foes = [];
  var L = LADDER[r - 1];
  for (var j = 0; j < 3; j++) {
    var hp = Math.round(foeHP(r) * [0.9, 1.0, 1.15][j]);
    var foe = {
      name: L.foes[j][0], type: L.foes[j][1], maxhp: hp, hp: hp,
      atk: foeATK(r) * [0.95, 1.0, 1.1][j], speed: foeSpeed(r),
      cd: 2 + (j % 2), plan: null, flash: 0
    };
    newPlan(foe);
    G.foes.push(foe);
  }
  G.status = 'ROUND ' + r + ' / 8 - ' + L.name;
  persist();
}

function persist() {
  save.unlocked = G.unlocked.slice(0);
  save.team = G.teamIds.slice(0);
  save.round = G.round;
  save.best = Math.max(save.best | 0, G.round);
  Store.write(save);
}

/* ---------------- trace -> chains ---------------- */
function commitTrace() {
  if (G.sub !== 'trace') return;
  var runs = Board.runs();
  if (!runs.length) {
    if (Board.path.length > 1) { FX.float(VW / 2, BY - 14, 'NO CHAIN (need 3+ same)', '#ff8b96', 14); Snd.miss(); }
    Board.clearTrace();
    return;
  }
  G.pendingRuns = runs;
  G.runIdx = 0;
  G.turnDmg = 0;
  G.sub = 'resolve';
  Board.tracing = false;
  Timers.after(0.05, stepRun);
}

function stepRun() {
  if (G.runIdx >= G.pendingRuns.length) {
    Board.collapse();
    Board.clearTrace();
    Timers.after(0.4, checkAttacks);
    return;
  }
  var run = G.pendingRuns[G.runIdx];
  var combo = 1 + M.comboStep * G.runIdx;
  var L = run.cells.length;
  var amt = Math.round((L * M.chargePerOrb + Math.max(0, L - M.minRun) * M.chargeBonusPerExtra) * combo);
  var mid = run.cells[(L / 2) | 0];
  var mx = Board.cx(mid.c), my = Board.cy(mid.r);
  var col = ORBS[run.t].col;
  Snd.chain(G.runIdx);
  FX.burst(mx, my, col, 8 + L * 2, 150);

  if (run.t === 3) {
    var heal = Math.round(L * M.healPerOrb * combo);
    for (var i = 0; i < G.team.length; i++) {
      var f = G.team[i];
      if (f.hp <= 0) continue;
      f.hp = Math.min(f.maxhp, f.hp + heal);
      FX.float(cardX(i) + LY.cardW / 2, LY.ownY + 30, '+' + heal, HEART.col, 16);
      if (f.id === 5) { f.charge = Math.min(overcapFor(f), f.charge + heal); } // TALO WREN
    }
    FX.float(mx, my - 22, 'x' + L + ' HEART  x' + combo.toFixed(2), HEART.col, 14);
  } else {
    var any = false;
    for (var k = 0; k < G.team.length; k++) {
      var g = G.team[k];
      if (g.hp <= 0) continue;
      var gain = 0;
      if (g.type === run.t) gain = amt;
      else if (g.id === 7 && L >= 4) gain = Math.round(amt * 0.4); // KAIDE RHO
      if (gain > 0) {
        g.charge = Math.min(overcapFor(g), g.charge + gain);
        g.flash = 0.4;
        FX.float(cardX(k) + LY.cardW / 2, LY.ownY + 84, '+' + gain, col, 15);
        any = true;
      }
    }
    FX.float(mx, my - 22, 'x' + L + ' ' + KI[run.t].short + (any ? '' : ' (no user)') + '  x' + combo.toFixed(2), col, 14);
  }
  Board.markDead(run.cells);
  G.runIdx++;
  Timers.after(0.3, stepRun);
}

/* ---------------- attacks + clash ---------------- */
function aliveFoes() { var a = []; for (var i = 0; i < G.foes.length; i++) if (G.foes[i].hp > 0) a.push(i); return a; }
function aliveTeam() { var a = []; for (var i = 0; i < G.team.length; i++) if (G.team[i].hp > 0) a.push(i); return a; }

function checkAttacks() {
  G.attackQueue = [];
  for (var i = 0; i < G.team.length; i++) {
    var f = G.team[i];
    if (f.hp > 0 && f.charge >= M.fullCharge) G.attackQueue.push(i);
  }
  if (!G.attackQueue.length) { enemyPhase(); return; }
  nextAttack();
}

function nextAttack() {
  if (!aliveFoes().length) { roundWon(); return; }
  if (!G.attackQueue.length) { enemyPhase(); return; }
  var idx = G.attackQueue.shift();
  var f = G.team[idx];
  if (!f || f.hp <= 0 || f.charge < M.fullCharge) { nextAttack(); return; }
  if (aliveFoes().indexOf(G.target) < 0) G.target = aliveFoes()[0];
  G.sub = 'clash';
  G.clash = { t: 0, fi: idx, taken: false, perfW: f.id === 2 ? 0.15 : 0.09 };
  Snd.blip(660, 0.08, 'triangle', 0.2);
}

function clashTap() {
  if (G.sub !== 'clash' || !G.clash || G.clash.taken) return;
  var c = G.clash;
  c.taken = true;
  var p = c.t / M.clashWindow;
  var center = 0.66, d = Math.abs(p - center);
  var mult, label, col;
  if (d <= c.perfW) { mult = M.clashPerfect; label = 'PERFECT CLASH'; col = '#ffd166'; Snd.perfect(); }
  else if (d <= c.perfW + 0.16) { mult = M.clashGood; label = 'GOOD CLASH'; col = '#54d98c'; Snd.blip(520, 0.1, 'triangle', 0.25); }
  else { mult = 1.0; label = 'CLASH'; col = '#9fb4d4'; Snd.blip(300, 0.09, 'square', 0.2); }
  doStrike(mult, label, col);
}

function clashTimeout() {
  if (G.sub !== 'clash' || !G.clash || G.clash.taken) return;
  G.clash.taken = true;
  Snd.miss();
  doStrike(M.clashLate, 'NO CLASH', '#ff8b96');
}

function doStrike(mult, label, col) {
  var f = G.team[G.clash.fi];
  var av = aliveFoes();
  if (!av.length) { roundWon(); return; }
  if (av.indexOf(G.target) < 0) G.target = av[0];
  var foe = G.foes[G.target];
  var chargeM = Math.min(f.charge, overcapFor(f)) / M.fullCharge;
  var typeM = kiMult(f.type, foe.type);
  if (f.id === 8 && typeM < 1) typeM = 1; // MIRA DELUNE
  var base = f.atk * chargeM;
  var dmg = Math.max(1, Math.round(base * typeM * mult));
  foe.hp -= dmg;
  foe.flash = 0.5;
  f.charge = 0;
  G.sub = 'strike';
  G.clash = null;

  var fx = cardX(G.target) + LY.cardW / 2, fy = LY.foeY + 46;
  FX.hit(7 + Math.min(6, dmg / 40));
  FX.bang(col, 0.35);
  FX.burst(fx, fy, col, 16, 200);
  Snd.hit();
  FX.float(fx, fy - 6, '-' + dmg, '#ffffff', 26);
  FX.float(fx, fy + 16, label, col, 13);
  FX.float(VW / 2, BY - 26,
    f.atk + ' ATK x' + chargeM.toFixed(2) + ' CHG x' + typeM.toFixed(2) + ' ' + kiLabel(f.type, foe.type) + ' x' + mult.toFixed(2) + ' = ' + dmg,
    '#c9d8f0', 13);
  G.turnDmg += dmg;

  if (foe.hp <= 0) {
    foe.hp = 0;
    Snd.ko();
    FX.burst(fx, fy, '#ffffff', 22, 260);
    FX.float(fx, fy - 30, 'DOWN', '#ffd166', 18);
    FX.hit(10);
    var nx = aliveFoes();
    if (!nx.length) { Timers.after(0.7, roundWon); return; }
    G.target = nx[0];
  }
  Timers.after(0.62, function () { G.sub = 'resolve'; nextAttack(); });
}

/* ---------------- enemy phase ---------------- */
function enemyPhase() {
  G.sub = 'enemy';
  var order = [];
  for (var i = 0; i < G.foes.length; i++) {
    var f = G.foes[i];
    if (f.hp <= 0) continue;
    f.cd--;
    if (f.cd <= 0) order.push(i);
  }
  runEnemy(order, 0);
}

function runEnemy(order, k) {
  if (k >= order.length) {
    if (!aliveTeam().length) { roundLost(); return; }
    G.turn++;
    G.sub = 'trace';
    Board.clearTrace();
    return;
  }
  var foe = G.foes[order[k]];
  if (foe.hp <= 0) { runEnemy(order, k + 1); return; }
  var av = aliveTeam();
  if (!av.length) { roundLost(); return; }
  var ti = av.indexOf(foe.plan.target) >= 0 ? foe.plan.target : av[0];
  var tgt = G.team[ti];
  var typeM = kiMult(foe.type, tgt.type);
  var dmg = Math.max(1, Math.round(foe.plan.dmg * typeM));
  tgt.hp = Math.max(0, tgt.hp - dmg);
  tgt.hitT = 0.4;
  var tx = cardX(ti) + LY.cardW / 2, ty = LY.ownY + 44;
  FX.hit(6);
  FX.bang('#ff5c6e', 0.28);
  FX.burst(tx, ty, KI[foe.type].col, 14, 170);
  Snd.hit();
  FX.float(tx, ty, '-' + dmg, '#ff8b96', 22);
  FX.float(VW / 2, BY - 26, foe.name + ': ' + foe.plan.dmg + ' x' + typeM.toFixed(2) + ' ' + kiLabel(foe.type, tgt.type) + ' = ' + dmg, '#ffb0b8', 13);
  if (tgt.hp <= 0) { FX.float(tx, ty - 26, 'KO', '#ff5c6e', 18); Snd.ko(); }
  foe.cd = foe.speed;
  newPlan(foe);
  Timers.after(0.6, function () { runEnemy(order, k + 1); });
}

/* ---------------- round end ---------------- */
function roundWon() {
  G.sub = 'over';
  Board.clearTrace();
  Timers.clear();
  Snd.win();
  FX.bang('#ffd166', 0.6);
  var unlockedNames = [];
  if (G.round === 2 || G.round === 4 || G.round === 6) {
    var tier = G.round / 2;
    for (var i = 0; i < FIGHTERS.length; i++) {
      if (FIGHTERS[i].tier === tier && G.unlocked.indexOf(i) < 0) { G.unlocked.push(i); unlockedNames.push(FIGHTERS[i].name); }
    }
  }
  G.newUnlocks = unlockedNames;
  G.overlay = (G.round >= 8) ? 'crown' : 'win';
  if (G.round >= 8) { save.wins = (save.wins | 0) + 1; }
  save.unlocked = G.unlocked.slice(0);
  save.team = G.teamIds.slice(0);
  save.round = G.round >= 8 ? 1 : G.round + 1;
  save.best = Math.max(save.best | 0, G.round);
  Store.write(save);
}
function roundLost() {
  G.sub = 'over';
  Board.clearTrace();
  Timers.clear();
  Snd.ko();
  FX.bang('#ff5c6e', 0.6);
  G.overlay = 'lose';
}

/* ---------------- update ---------------- */
function update(dt) {
  FX.update(dt);
  Board.update(dt);
  if (G.overlay) return;
  Timers.update(dt);

  var i;
  for (i = 0; i < G.team.length; i++) {
    var f = G.team[i];
    if (f.flash > 0) f.flash -= dt;
    if (f.hitT > 0) f.hitT -= dt;
  }
  for (i = 0; i < G.foes.length; i++) if (G.foes[i].flash > 0) G.foes[i].flash -= dt;

  if (G.sub === 'trace' && Board.tracing) {
    Board.traceT -= dt;
    if (Board.traceT <= 0) { Board.traceT = 0; commitTrace(); }
  }
  if (G.sub === 'clash' && G.clash && !G.clash.taken) {
    G.clash.t += dt;
    if (G.clash.t >= M.clashWindow) clashTimeout();
  }
}

/* ---------------- rendering ---------------- */
function typeBadge(x, y, t, small) {
  var k = t < 3 ? KI[t] : HEART;
  ctx.fillStyle = k.dim;
  rrect(ctx, x, y, small ? 30 : 34, 13, 6); ctx.fill();
  txt(ctx, k.short, x + (small ? 15 : 17), y + 10, 9, k.col, 'center', 700);
}

function drawFoe(i) {
  var f = G.foes[i], x = cardX(i), y = LY.foeY, w = LY.cardW, h = LY.foeH;
  var dead = f.hp <= 0;
  ctx.globalAlpha = dead ? 0.32 : 1;
  ctx.fillStyle = f.flash > 0 ? '#3a2430' : '#141a27';
  rrect(ctx, x, y, w, h, 10); ctx.fill();
  ctx.strokeStyle = (G.target === i && !dead) ? '#ffffff' : KI[f.type].dim;
  ctx.lineWidth = (G.target === i && !dead) ? 2.5 : 1.5;
  rrect(ctx, x, y, w, h, 10); ctx.stroke();

  // greybox portrait
  var pc = KI[f.type].col;
  ctx.fillStyle = KI[f.type].dim;
  rrect(ctx, x + 8, y + 20, w - 16, 34, 8); ctx.fill();
  ctx.fillStyle = pc;
  ctx.beginPath(); ctx.arc(x + w / 2, y + 37, 11, 0, Math.PI * 2); ctx.fill();
  Board.drawGlyph(ctx, f.type, x + w / 2, y + 37, 8);

  txt(ctx, f.name, x + w / 2, y + 14, 10, dead ? '#5d6b83' : '#e6eeff', 'center', 700);
  typeBadge(x + 6, y + 58, f.type, true);
  txt(ctx, Math.max(0, Math.ceil(f.hp)) + '/' + f.maxhp, x + w - 6, y + 68, 9, '#8fa2c0', 'right', 600);
  bar(ctx, x + 6, y + 74, w - 12, 7, f.hp / f.maxhp, dead ? '#4a2530' : '#ff5c6e');

  // telegraph
  var ty2 = y + 86;
  var soon = f.cd <= 1;
  ctx.fillStyle = dead ? '#101520' : (soon ? '#3a2a18' : '#0f1420');
  rrect(ctx, x + 6, ty2, w - 12, 32, 6); ctx.fill();
  if (dead) { txt(ctx, 'DOWN', x + w / 2, ty2 + 20, 11, '#5d6b83', 'center', 700); }
  else {
    var tname = G.team[f.plan.target] ? G.team[f.plan.target].name.split(' ')[0] : '?';
    txt(ctx, soon ? 'NEXT TURN' : 'IN ' + f.cd + ' TURNS', x + w / 2, ty2 + 13, 9, soon ? '#ffd166' : '#8fa2c0', 'center', 700);
    txt(ctx, f.plan.dmg + ' -> ' + tname, x + w / 2, ty2 + 26, 10, soon ? '#ffe6a8' : '#9fb4d4', 'center', 600);
  }
  ctx.globalAlpha = 1;
}

function drawOwn(i) {
  var f = G.team[i], x = cardX(i), y = LY.ownY, w = LY.cardW, h = LY.ownH;
  var dead = f.hp <= 0;
  ctx.globalAlpha = dead ? 0.34 : 1;
  ctx.fillStyle = f.hitT > 0 ? '#3a1f26' : '#141a27';
  rrect(ctx, x, y, w, h, 10); ctx.fill();
  var ready = f.charge >= M.fullCharge && !dead;
  ctx.strokeStyle = ready ? '#ffd166' : KI[f.type].dim;
  ctx.lineWidth = ready ? 2.5 : 1.5;
  rrect(ctx, x, y, w, h, 10); ctx.stroke();

  ctx.fillStyle = KI[f.type].dim;
  rrect(ctx, x + 8, y + 18, w - 16, 30, 8); ctx.fill();
  ctx.fillStyle = KI[f.type].col;
  ctx.beginPath(); ctx.arc(x + w / 2, y + 33, 10, 0, Math.PI * 2); ctx.fill();
  Board.drawGlyph(ctx, f.type, x + w / 2, y + 33, 7);

  txt(ctx, f.name, x + w / 2, y + 13, 10, dead ? '#5d6b83' : '#e6eeff', 'center', 700);
  typeBadge(x + 6, y + 52, f.type, true);
  txt(ctx, Math.max(0, Math.ceil(f.hp)) + '/' + f.maxhp, x + w - 6, y + 62, 9, '#8fa2c0', 'right', 600);
  bar(ctx, x + 6, y + 68, w - 12, 6, f.hp / f.maxhp, dead ? '#4a2530' : '#54d98c');

  var cp = f.charge / M.fullCharge;
  bar(ctx, x + 6, y + 80, w - 12, 8, Math.min(1, cp), f.flash > 0 ? '#ffffff' : KI[f.type].col);
  if (cp > 1) { // overcharge segment
    bar(ctx, x + 6, y + 80, (w - 12) * Math.min(1, (cp - 1) / (overcapFor(f) / 100 - 1)), 8, 1, '#ffd166');
  }
  txt(ctx, dead ? 'DOWN' : (ready ? 'READY ' + Math.round(f.charge) + '%' : Math.round(f.charge) + '%'),
    x + w / 2, y + 100, 10, dead ? '#5d6b83' : (ready ? '#ffd166' : '#8fa2c0'), 'center', 700);
  ctx.globalAlpha = 1;
}

function drawHeader() {
  txt(ctx, 'KINETIC BURST', 8, 16, 12, '#5aa9ff', 'left', 800);
  txt(ctx, 'ROUND ' + G.round + '/8  ' + LADDER[G.round - 1].name, VW - 8, 16, 11, '#9fb4d4', 'right', 700);
  txt(ctx, 'TURN ' + G.turn + '   BEST R' + (save.best | 0) + (save.wins ? '   CROWNS ' + save.wins : ''), 8, 29, 9, '#5d6b83', 'left', 600);
}

function drawStatus() {
  var y = LY.statusY;
  ctx.fillStyle = '#0f1420';
  rrect(ctx, 8, y, VW - 16, 28, 8); ctx.fill();
  var msg, col = '#9fb4d4';
  if (G.sub === 'trace') {
    if (Board.tracing) {
      var pv = Board.previewCount();
      msg = 'CHAIN ' + pv.orbs + ' ORB' + (pv.orbs === 1 ? '' : 'S') + ' / ' + pv.runs + ' RUN' + (pv.runs === 1 ? '' : 'S') + '  - RELEASE TO FIRE';
      col = pv.orbs ? '#54d98c' : '#8fa2c0';
    } else {
      msg = 'DRAG THROUGH 3+ SAME ORBS TO CHARGE THAT FIGHTER';
      col = '#7f90ad';
    }
  } else if (G.sub === 'clash') { msg = 'TAP NOW TO CLASH'; col = '#ffd166'; }
  else if (G.sub === 'enemy') { msg = 'OPPONENT TURN'; col = '#ff8b96'; }
  else { msg = 'RESOLVING CHAIN...'; col = '#9fb4d4'; }
  txt(ctx, msg, VW / 2, y + 18, 11, col, 'center', 700);
}

function drawTimer() {
  var y = LY.timerY;
  if (G.sub === 'trace' && Board.tracing) {
    bar(ctx, 8, y, VW - 16, LY.timerH, Board.traceT / M.traceTime, Board.traceT < 2 ? '#ff5c6e' : '#5aa9ff');
  } else {
    bar(ctx, 8, y, VW - 16, LY.timerH, 0, '#5aa9ff');
  }
}

function drawClash() {
  var c = G.clash;
  if (!c) return;
  var f = G.team[c.fi];
  var x = 24, w = VW - 48, y = BY + 96, h = 34;
  ctx.fillStyle = 'rgba(6,8,14,0.86)';
  rrect(ctx, 12, BY + 30, VW - 24, 150, 14); ctx.fill();
  ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2;
  rrect(ctx, 12, BY + 30, VW - 24, 150, 14); ctx.stroke();
  txt(ctx, f.name + ' STRIKES', VW / 2, BY + 60, 16, '#ffffff', 'center', 800);
  txt(ctx, 'TAP THE GOLD ZONE  (SPACE)', VW / 2, BY + 80, 11, '#ffd166', 'center', 700);

  ctx.fillStyle = '#1a2130'; rrect(ctx, x, y, w, h, 8); ctx.fill();
  var gz = 0.66, gw = c.perfW, ow = c.perfW + 0.16;
  ctx.fillStyle = '#2c4433'; ctx.fillRect(x + w * (gz - ow), y, w * ow * 2, h);
  ctx.fillStyle = '#5c4a1e'; ctx.fillRect(x + w * (gz - gw), y, w * gw * 2, h);
  ctx.fillStyle = '#ffd166'; ctx.fillRect(x + w * gz - 1.5, y, 3, h);
  var p = clamp(c.t / M.clashWindow, 0, 1);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + w * p - 3, y - 5, 6, h + 10);
  txt(ctx, 'x2.00 PERFECT   x1.40 GOOD   x1.00 EARLY/LATE   x0.75 MISS', VW / 2, y + h + 20, 10, '#8fa2c0', 'center', 600);
}

/* buttons */
var BTNS = [];
function drawButtons() {
  BTNS = [];
  var y = LY.barY, h = 54, gap = 8, w = (VW - 16 - gap * 2) / 3;
  var defs = [
    { id: 'math', label: 'MATH', col: '#5aa9ff' },
    { id: 'team', label: 'TEAM', col: '#54d98c' },
    { id: 'retry', label: 'RESTART', col: '#ff8b96' }
  ];
  for (var i = 0; i < 3; i++) {
    var x = 8 + i * (w + gap);
    BTNS.push({ id: defs[i].id, x: x, y: y, w: w, h: h });
    ctx.fillStyle = '#141a27';
    rrect(ctx, x, y, w, h, 10); ctx.fill();
    ctx.strokeStyle = '#26314a'; ctx.lineWidth = 1.5; rrect(ctx, x, y, w, h, 10); ctx.stroke();
    txt(ctx, defs[i].label, x + w / 2, y + 33, 13, defs[i].col, 'center', 800);
  }
}

/* overlays */
function panel(title, lines, buttons, titleCol) {
  ctx.fillStyle = 'rgba(4,6,11,0.9)';
  ctx.fillRect(0, 0, VW, VH);
  var ph = Math.min(VH - 40, 74 + lines.length * 17 + 16 + buttons.length * 56 + 20);
  var py = (VH - ph) / 2;
  ctx.fillStyle = '#0e1420';
  rrect(ctx, 16, py, VW - 32, ph, 14); ctx.fill();
  ctx.strokeStyle = titleCol || '#5aa9ff'; ctx.lineWidth = 2;
  rrect(ctx, 16, py, VW - 32, ph, 14); ctx.stroke();
  txt(ctx, title, VW / 2, py + 34, 19, titleCol || '#5aa9ff', 'center', 800);
  for (var i = 0; i < lines.length; i++) {
    var ln = lines[i];
    var s = typeof ln === 'string' ? ln : ln.s;
    var col = typeof ln === 'string' ? '#9fb4d4' : ln.c;
    txt(ctx, s, VW / 2, py + 58 + i * 17, 11, col, 'center', 600);
  }
  var by = py + ph - 20 - buttons.length * 56;
  for (var b = 0; b < buttons.length; b++) {
    var bx = 40, bw = VW - 80, bh = 48, byy = by + b * 56;
    BTNS.push({ id: buttons[b].id, x: bx, y: byy, w: bw, h: bh });
    ctx.fillStyle = buttons[b].col || '#1b2740';
    rrect(ctx, bx, byy, bw, bh, 10); ctx.fill();
    txt(ctx, buttons[b].label, VW / 2, byy + 30, 14, '#08101c', 'center', 800);
  }
}

function drawOverlay() {
  BTNS = [];
  var i;
  if (G.overlay === 'win') {
    var lines = ['ROUND ' + G.round + ' CLEARED - ' + LADDER[G.round - 1].name, ''];
    if (G.newUnlocks && G.newUnlocks.length) {
      lines.push({ s: 'NEW FIGHTERS JOIN YOUR CAMP', c: '#ffd166' });
      for (i = 0; i < G.newUnlocks.length; i++) lines.push({ s: G.newUnlocks[i], c: '#ffe6a8' });
      lines.push('');
      lines.push('Earned by ladder progress. Nothing is sold.');
    } else {
      lines.push('Roster grows after rounds 2, 4 and 6.');
    }
    lines.push('');
    lines.push('NEXT: ' + LADDER[Math.min(7, G.round)].name);
    panel('ROUND WON', lines, [{ id: 'next', label: 'NEXT ROUND', col: '#54d98c' }, { id: 'team', label: 'MANAGE TEAM', col: '#5aa9ff' }], '#54d98c');
  } else if (G.overlay === 'lose') {
    panel('TEAM DOWN', [
      'Your three fighters were knocked out.',
      'Round ' + G.round + ' - ' + LADDER[G.round - 1].name,
      '',
      'No lives, no waits, no fees. Retry instantly.',
      'Tip: chain the ki type your enemy is weak to.'
    ], [{ id: 'retry', label: 'RETRY ROUND', col: '#ff8b96' }, { id: 'team', label: 'CHANGE TEAM', col: '#5aa9ff' }], '#ff5c6e');
  } else if (G.overlay === 'crown') {
    panel('CROWN WON', [
      'You cleared all 8 rounds of the ladder.',
      'Champion team:',
      G.team[0].name + ' / ' + G.team[1].name + ' / ' + G.team[2].name,
      '',
      'Crowns: ' + (save.wins | 0) + '   Roster: ' + G.unlocked.length + '/9',
      'Every fighter was earned by playing.'
    ], [{ id: 'newrun', label: 'NEW LADDER RUN', col: '#ffd166' }, { id: 'team', label: 'MANAGE TEAM', col: '#5aa9ff' }], '#ffd166');
  } else if (G.overlay === 'math') {
    drawMath();
  } else if (G.overlay === 'roster') {
    drawRoster();
  }
}

function drawMath() {
  ctx.fillStyle = 'rgba(4,6,11,0.94)'; ctx.fillRect(0, 0, VW, VH);
  txt(ctx, 'ALL THE MATH', VW / 2, 34, 18, '#5aa9ff', 'center', 800);
  var y = 58, L = 14.5;
  function line(s, c, sz) { txt(ctx, s, 16, y, sz || 10.5, c || '#9fb4d4', 'left', 600); y += L; }
  function head(s) { y += 5; txt(ctx, s, 16, y, 11, '#ffd166', 'left', 800); y += L; }

  head('ORB DROP RATES (per new orb)');
  line('HEART 19%   POWER 27%   SPEED 27%   FOCUS 27%');
  head('CHAIN SCORING');
  line('A run = 3+ consecutive same-type orbs in your traced path.');
  line('charge = (len x ' + M.chargePerOrb + ' + (len-3) x ' + M.chargeBonusPerExtra + ') x combo');
  line('combo = 1.00 + 0.25 per earlier run in the same trace');
  line('HEART run heals every living fighter: len x ' + M.healPerOrb + ' x combo');
  line('Charge caps at 200% (250% for ASHEN MORO). Trace timer ' + M.traceTime + 's.');
  head('KI TRIANGLE');
  line('POWER > SPEED > FOCUS > POWER', '#e6eeff');
  line('advantage x1.50   even x1.00   weak x0.67');
  head('STRIKE DAMAGE');
  line('damage = ATK x (charge/100) x ki x clash');
  line('clash: PERFECT x2.00, GOOD x1.40, early/late x1.00');
  line('no tap at all x0.75. OVI SANCT gets a 66% wider perfect zone.');
  head('OPPONENT SCALING (round r)');
  line('HP = 66 + r x 34   (x0.90 / x1.00 / x1.15 per slot)');
  line('ATK = 8 + r x 3.0  (x0.95 / x1.00 / x1.10 per slot)');
  line('each telegraphed hit rolls x0.85-1.20 when it is announced');
  line('Acts every ' + foeSpeed(G.round) + ' turns this round. Telegraph shown 1+ turn ahead.');
  head('THIS ROUND');
  for (var i = 0; i < G.foes.length; i++) {
    var f = G.foes[i];
    line(f.name + ' [' + KI[f.type].short + '] HP ' + Math.max(0, Math.ceil(f.hp)) + '/' + f.maxhp + '  hits ' + f.plan.dmg + ' in ' + Math.max(0, f.cd) + ' turn(s)', '#c9d8f0');
  }
  head('ROSTER UNLOCKS');
  line('2 new fighters after rounds 2, 4 and 6. No purchases exist.');

  BTNS = [];
  var bx = 40, bw = VW - 80, by = VH - 70, bh = 52;
  BTNS.push({ id: 'close', x: bx, y: by, w: bw, h: bh });
  ctx.fillStyle = '#5aa9ff'; rrect(ctx, bx, by, bw, bh, 10); ctx.fill();
  txt(ctx, 'BACK TO FIGHT', VW / 2, by + 32, 14, '#08101c', 'center', 800);
}

function drawRoster() {
  ctx.fillStyle = 'rgba(4,6,11,0.94)'; ctx.fillRect(0, 0, VW, VH);
  txt(ctx, 'YOUR CAMP', VW / 2, 32, 18, '#54d98c', 'center', 800);
  txt(ctx, 'Pick 3 fighters (' + G.rosterSel.length + '/3). Unlocked ' + G.unlocked.length + '/9.', VW / 2, 50, 11, '#9fb4d4', 'center', 600);
  BTNS = [];
  var cw = 118, ch = 96, gap = 10, x0 = 8, y0 = 62;
  for (var i = 0; i < FIGHTERS.length; i++) {
    var f = FIGHTERS[i];
    var col = i % 3, row = (i / 3) | 0;
    var x = x0 + col * (cw + gap), y = y0 + row * (ch + gap);
    var locked = G.unlocked.indexOf(i) < 0;
    var sel = G.rosterSel.indexOf(i) >= 0;
    if (!locked) BTNS.push({ id: 'pick' + i, x: x, y: y, w: cw, h: ch });
    ctx.globalAlpha = locked ? 0.35 : 1;
    ctx.fillStyle = sel ? '#1c2c22' : '#141a27';
    rrect(ctx, x, y, cw, ch, 10); ctx.fill();
    ctx.strokeStyle = sel ? '#54d98c' : KI[f.type].dim; ctx.lineWidth = sel ? 2.5 : 1.5;
    rrect(ctx, x, y, cw, ch, 10); ctx.stroke();
    ctx.fillStyle = KI[f.type].col;
    ctx.beginPath(); ctx.arc(x + cw / 2, y + 26, 12, 0, Math.PI * 2); ctx.fill();
    Board.drawGlyph(ctx, f.type, x + cw / 2, y + 26, 9);
    txt(ctx, f.name, x + cw / 2, y + 52, 9.5, '#e6eeff', 'center', 700);
    txt(ctx, KI[f.type].short + '  HP ' + f.hp + '  ATK ' + f.atk, x + cw / 2, y + 65, 9, '#8fa2c0', 'center', 600);
    if (locked) txt(ctx, 'LOCKED - R' + (f.tier * 2), x + cw / 2, y + 82, 9, '#ffd166', 'center', 700);
    else if (sel) txt(ctx, 'IN TEAM', x + cw / 2, y + 82, 9, '#54d98c', 'center', 700);
    else txt(ctx, 'TAP TO ADD', x + cw / 2, y + 82, 9, '#5d6b83', 'center', 600);
    ctx.globalAlpha = 1;
  }
  var infoY = y0 + 3 * (ch + gap) + 8;
  var selIds = G.rosterSel;
  for (var k = 0; k < selIds.length; k++) {
    txt(ctx, FIGHTERS[selIds[k]].trait, VW / 2, infoY + k * 15, 10, '#7f90ad', 'center', 600);
  }
  var ready = G.rosterSel.length === 3;
  var bx = 40, bw = VW - 80, by = VH - 70, bh = 52;
  BTNS.push({ id: 'confirmteam', x: bx, y: by, w: bw, h: bh });
  ctx.fillStyle = ready ? '#54d98c' : '#2a3448';
  rrect(ctx, bx, by, bw, bh, 10); ctx.fill();
  txt(ctx, ready ? 'CONFIRM (RESTARTS ROUND)' : 'PICK ' + (3 - G.rosterSel.length) + ' MORE',
    VW / 2, by + 32, 13, ready ? '#08101c' : '#6b7a95', 'center', 800);
}

function render() {
  ctx.save();
  if (FX.shake > 0) ctx.translate(rnd(-FX.shake, FX.shake), rnd(-FX.shake, FX.shake));
  ctx.fillStyle = '#0b0d14';
  ctx.fillRect(-20, -20, VW + 40, VH + 40);
  // backdrop grid
  ctx.strokeStyle = '#10141f'; ctx.lineWidth = 1;
  for (var gx = 0; gx <= VW; gx += 30) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, VH); ctx.stroke(); }

  drawHeader();
  for (var i = 0; i < 3; i++) drawFoe(i);
  for (var j = 0; j < 3; j++) drawOwn(j);
  drawStatus();
  drawTimer();
  Board.draw(ctx, G.sub === 'trace');
  drawButtons();
  FX.draw(ctx);
  if (G.sub === 'clash') drawClash();
  if (FX.flash > 0) {
    ctx.globalAlpha = FX.flash * 0.45; ctx.fillStyle = FX.flashCol;
    ctx.fillRect(-20, -20, VW + 40, VH + 40); ctx.globalAlpha = 1;
  }
  ctx.restore();
  if (G.overlay) drawOverlay();
}

/* ---------------- input handling ---------------- */
function hitBtn(x, y) {
  for (var i = 0; i < BTNS.length; i++) {
    var b = BTNS[i];
    if (x >= b.x - 4 && x <= b.x + b.w + 4 && y >= b.y - 4 && y <= b.y + b.h + 4) return b.id;
  }
  return null;
}

function openRoster() {
  G.rosterSel = G.teamIds.slice(0);
  G.overlay = 'roster';
  Board.clearTrace();
  Snd.ui();
}

function doBtn(id) {
  if (!id) return false;
  Snd.ui();
  if (id === 'math') { G.overlay = 'math'; Board.clearTrace(); return true; }
  if (id === 'close') { G.overlay = null; return true; }
  if (id === 'team') {
    // from a cleared-round screen, advance first so CONFIRM restarts the right round
    if (G.overlay === 'win') { Timers.clear(); Input.reset(); startRound(Math.min(8, G.round + 1)); }
    else if (G.overlay === 'crown') { save.round = 1; Store.write(save); Timers.clear(); Input.reset(); startRound(1); }
    openRoster();
    return true;
  }
  if (id === 'retry') { Timers.clear(); Input.reset(); startRound(G.round); return true; }
  if (id === 'next') { Timers.clear(); Input.reset(); startRound(Math.min(8, G.round + 1)); return true; }
  if (id === 'newrun') { save.round = 1; Store.write(save); Timers.clear(); Input.reset(); startRound(1); return true; }
  if (id === 'confirmteam') {
    if (G.rosterSel.length !== 3) return true;
    G.teamIds = G.rosterSel.slice(0);
    persist();
    Timers.clear(); Input.reset();
    startRound(G.round);
    return true;
  }
  if (id.indexOf('pick') === 0) {
    var fid = parseInt(id.slice(4), 10);
    var at = G.rosterSel.indexOf(fid);
    if (at >= 0) G.rosterSel.splice(at, 1);
    else if (G.rosterSel.length < 3) G.rosterSel.push(fid);
    else { G.rosterSel.shift(); G.rosterSel.push(fid); }
    return true;
  }
  return false;
}

Input.onDown = function (x, y, id) {
  if (!started || paused) return;
  if (G.overlay) { doBtn(hitBtn(x, y)); return; }
  var b = hitBtn(x, y);
  if (b) { doBtn(b); return; }
  if (G.sub === 'clash') { clashTap(); return; }
  // select enemy target
  if (y >= LY.foeY && y <= LY.foeY + LY.foeH) {
    for (var i = 0; i < 3; i++) {
      if (x >= cardX(i) && x <= cardX(i) + LY.cardW && G.foes[i].hp > 0) { G.target = i; Snd.ui(); return; }
    }
  }
  if (G.sub === 'trace' && !Board.tracing) {
    var c = Board.cellAt(x, y);
    if (c) { Board.start(c.c, c.r, id); Board.cursor.c = c.c; Board.cursor.r = c.r; }
  }
};
Input.onMove = function (x, y, id) {
  if (!started || paused || G.overlay) return;
  if (G.sub !== 'trace' || !Board.tracing || Board.traceId !== id) return;
  var c = Board.cellAt(x, y);
  if (!c) return;
  // require pointer near the cell centre for deliberate links
  var dx = x - Board.cx(c.c), dy = y - (Board.cy(c.r) - Board.g[c.r][c.c].oy);
  if (dx * dx + dy * dy > (CELL * 0.46) * (CELL * 0.46)) return;
  if (Board.extend(c.c, c.r)) { Board.cursor.c = c.c; Board.cursor.r = c.r; }
};
Input.onUp = function (x, y, id) {
  if (!started || paused || G.overlay) return;
  if (G.sub === 'trace' && Board.tracing && Board.traceId === id && !Board.kbTrace) commitTrace();
};
Input.onCancel = function (id) {
  // pointercancel / blur / lost capture: drop the in-progress trace, never fire it
  if (G && Board.tracing && !Board.kbTrace && Board.traceId === id) Board.clearTrace();
};
Input.onKey = function (k) {
  if (!started || paused || hidden || document.hidden) return;
  KB.visible = true;
  if (G.overlay) {
    if (G.overlay === 'roster') {
      if (k === 'Enter' || k === ' ') { doBtn('confirmteam'); return; }
      if (k === 'Escape') { G.overlay = null; return; }
      var digit = parseInt(k, 10);
      if (digit >= 1 && digit <= 9) { doBtn('pick' + (digit - 1)); return; }
      return;
    }
    if (k === 'Escape' || k === 'm') { if (G.overlay === 'math') doBtn('close'); return; }
    if (k === ' ' || k === 'Enter') {
      if (G.overlay === 'math') doBtn('close');
      else if (G.overlay === 'win') doBtn('next');
      else if (G.overlay === 'lose') doBtn('retry');
      else if (G.overlay === 'crown') doBtn('newrun');
    }
    if (k === 't') doBtn('team');
    return;
  }
  if (k === 'm') { doBtn('math'); return; }
  if (k === 't') { doBtn('team'); return; }
  if (k === 'r') { doBtn('retry'); return; }
  if (k === '1' || k === '2' || k === '3') {
    var i = parseInt(k, 10) - 1;
    if (G.foes[i] && G.foes[i].hp > 0) { G.target = i; Snd.ui(); }
    return;
  }
  if (G.sub === 'clash') { if (k === ' ' || k === 'Enter') clashTap(); return; }
  if (G.sub !== 'trace') return;
  var d = null;
  if (k === 'ArrowLeft') d = [-1, 0];
  else if (k === 'ArrowRight') d = [1, 0];
  else if (k === 'ArrowUp') d = [0, -1];
  else if (k === 'ArrowDown') d = [0, 1];
  if (d) {
    var nc = clamp(Board.cursor.c + d[0], 0, COLS - 1), nr = clamp(Board.cursor.r + d[1], 0, ROWS - 1);
    Board.cursor.c = nc; Board.cursor.r = nr;
    if (Board.tracing) Board.extend(nc, nr);
    return;
  }
  if (k === ' ' || k === 'Enter') {
    if (!Board.tracing) { Board.start(Board.cursor.c, Board.cursor.r, 'kb'); Board.kbTrace = true; }
    else commitTrace();
  }
  if (k === 'Escape' && Board.tracing) Board.clearTrace();
};

/* ---------------- resize / orientation (hardening #1) ---------------- */
function resize() {
  var w = window.innerWidth, h = window.innerHeight;
  var landscape = w > h * 1.05;
  if (landscape) {
    rotEl.classList.add('on');
  } else {
    rotEl.classList.remove('on');
  }
  syncPause(landscape);
  var scale = Math.min(w / VW, h / VH);
  var cssW = Math.max(80, Math.floor(VW * scale)), cssH = Math.max(140, Math.floor(VH * scale));
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  dpr = Math.min(dpr, 960 / cssH);   // cap backing store long axis ~960
  cv.style.width = cssW + 'px';
  cv.style.height = cssH + 'px';
  cv.width = Math.round(cssW * dpr);
  cv.height = Math.round(cssH * dpr);
  ctx.setTransform(cv.width / VW, 0, 0, cv.height / VH, 0, 0);
  ctx.textBaseline = 'alphabetic';
}
function syncPause(landscape) {
  var next = !!(landscape || hidden);
  if (next && !paused) { Input.reset(); Board.clearTrace(); }
  if (!next && paused) { last = 0; Input.reset(); Board.clearTrace(); }
  paused = next;
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', function () { setTimeout(resize, 120); });
document.addEventListener('visibilitychange', function () {
  hidden = document.hidden;
  syncPause(window.innerWidth > window.innerHeight * 1.05);
});

/* ---------------- main loop ---------------- */
var last = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  if (!last) { last = ts; return; }
  var dt = (ts - last) / 1000;
  last = ts;
  if (dt > 0.05) dt = 0.05;       // clamped delta
  if (dt < 0) dt = 0;
  if (paused || !started) return; // rotate overlay freezes the whole simulation
  update(dt);
  render();
}

/* ---------------- boot ---------------- */
Input.attach(cv);
newGame(true);
resize();
render();

function startGame() {
  if (started || paused || hidden || document.hidden) return;
  started = true;
  Snd.init();
  gateEl.classList.remove('on');
  last = 0;
  resize();
}
gateEl.addEventListener('pointerdown', function (e) { e.preventDefault(); startGame(); }, { passive: false });
gateEl.addEventListener('click', startGame);
window.addEventListener('keydown', function (e) {
  if (!started && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); startGame(); }
});
requestAnimationFrame(frame);
