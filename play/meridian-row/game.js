/* Meridian Row - rules, board, rivals. All names/art original. */
'use strict';

var DISTRICTS = [
  { name: 'Saltmarket', col: '#4aa3ff' },
  { name: 'Lanternside', col: '#ffb23f' },
  { name: 'Kiln Quarter', col: '#ff5d5d' },
  { name: 'Verge Park', col: '#4fd08a' }
];
var TIERNAME = ['Stall', 'Hall', 'Spire'];
var TIERCOST = [24, 46, 84];
var TIERINC = [4, 9, 17];
var SHIELD_COST = 10;
var HEIST_ODDS = 0.85;

var CORNERNAME = { 0: 'Meridian Gate', 6: 'Ledger Corner', 12: 'Customs Yard', 18: 'Vault Corner' };

/* 24 tiles around a 7x7 ring. i=0 bottom-left, clockwise along the bottom. */
var TILES = (function () {
  var t = [], i;
  for (i = 0; i < 24; i++) {
    var col, row;
    if (i <= 6) { col = i; row = 6; }
    else if (i <= 12) { col = 6; row = 6 - (i - 6); }
    else if (i <= 18) { col = 6 - (i - 12); row = 0; }
    else { col = 0; row = i - 18; }
    t.push({ i: i, col: col, row: row, kind: 'event', d: -1 });
  }
  [0, 6, 12, 18].forEach(function (k) { t[k].kind = k === 0 ? 'gate' : 'corner'; });
  var slots = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23];
  slots.forEach(function (s, n) { t[s].kind = 'land'; t[s].d = n % 4; });
  return t;
})();

/* 24 sticker names, 6 per album (album = district) */
var STICKERS = [
  'Brine Crane', 'Netmender', 'Tide Scale', 'Salt Awning', 'Dock Lantern', 'Gull Vane',
  'Wick Tower', 'Paper Moth', 'Amber Pane', 'Lamp Ferry', 'Ember Bell', 'Glow Arch',
  'Clay Wheel', 'Flue Stack', 'Red Slab', 'Ash Gate', 'Fire Ladle', 'Brick Rose',
  'Fern Gate', 'Green Bench', 'Root Bridge', 'Seed Vault', 'Moss Dial', 'Leaf Arch'
];
var ALBUM_BONUS = 40;

var PCOL = ['#eaf3ff', '#ff6fae', '#9b8cff', '#58e0c8'];
var PNAME = ['You', 'Vex Orlan', 'Bramble Kite', 'Dorn Wexley'];

var TM = new Timers();

var G = {
  state: 'start',
  level: 1, boardsWon: 0, bestTurns: 0,
  players: [], cur: 0, turns: 0, elapsed: 0,
  dice: [1, 1], diceSpin: 0, extra: 0,
  corners: { 6: -1, 12: -1, 18: -1 },
  moveLeft: 0, hopT: 0,
  choices: null, choiceTitle: '', choiceNote: '',
  log: [], winner: -1, hint: true,
  lastSticker: -1, stickerT: 0
};

function mkPlayer(i, level) {
  var ai = i > 0;
  return {
    i: i, name: PNAME[i], col: PCOL[i], ai: ai,
    coins: ai ? (20 + 6 * (level - 1)) : 34,
    shields: 0, pos: 0, dist: [0, 0, 0, 0],
    stick: ai ? null : new Array(24).fill(false),
    albums: [false, false, false, false],
    stickCount: 0, laps: 0
  };
}

function logAdd(s) {
  G.log.push(String(s).slice(0, 64));
  if (G.log.length > 24) G.log.splice(0, G.log.length - 24);
}

function income(p) {
  var s = 0;
  for (var d = 0; d < 4; d++) for (var t = 0; t < p.dist[d]; t++) s += TIERINC[t];
  return s;
}
function tiersTotal(p) { return p.dist[0] + p.dist[1] + p.dist[2] + p.dist[3]; }
function buildCost(p, d) {
  var t = p.dist[d];
  if (t >= 3) return -1;
  var c = TIERCOST[t];
  if (p.ai) c = Math.round(c * Math.max(0.72, 1.18 - 0.075 * (G.level - 1)));
  return c;
}

/* ---------- board lifecycle ---------- */
function startBoard(level) {
  TM.clear();
  resetInput();
  if (typeof parts !== 'undefined') { parts.clear(); floats.clear(); }
  G.level = clamp(level | 0, 1, 99);
  G.players = [mkPlayer(0, G.level), mkPlayer(1, G.level), mkPlayer(2, G.level), mkPlayer(3, G.level)];
  G.cur = 0; G.turns = 0; G.elapsed = 0; G.extra = 0;
  G.corners = { 6: -1, 12: -1, 18: -1 };
  G.dice = [1, 1]; G.diceSpin = 0;
  G.choices = null; G.winner = -1; G.log.length = 0;
  G.moveLeft = 0; G.lastSticker = -1; G.stickerT = 0;
  G.state = 'idle';
  logAdd('Board ' + G.level + ' opens. Rivals seeded.');
  logAdd('Build all 4 districts to Spire to win.');
}

/* ---------- turn flow ---------- */
function canRoll() { return G.state === 'idle' && G.winner < 0; }

function doRoll() {
  if (G.state !== 'idle' && G.state !== 'rival') return;
  var p = G.players[G.cur];
  G.state = 'rolling';
  G.diceSpin = 0.62;
  Snd.play('roll');
  TM.add(0.62, function () {
    var a = 1 + rint(6), b = 1 + rint(6);
    G.dice = [a, b];
    G.doubles = (a === b);
    if (G.doubles) {
      G.extra++;
      if (G.extra > 2) { G.doubles = false; G.extra = 0; }
    } else G.extra = 0;
    shake(4);
    beginMove(p, a + b);
  });
}

function beginMove(p, n) {
  G.state = 'moving';
  G.moveLeft = n;
  G.hopT = 0;
}

function stepHop(p) {
  p.pos = (p.pos + 1) % 24;
  Snd.play('step');
  if (p.pos === 0) {
    p.laps++;
    var lap = p.ai ? (18 + 2 * (G.level - 1)) : 18;
    p.coins += lap;
    fxAt(p, '+' + lap, '#ffd24a');
    drawSticker(p, 1);
    if (!p.ai) logAdd('Lap bonus +' + lap + ' and a sticker draw.');
  }
  G.moveLeft--;
  if (G.moveLeft <= 0) TM.add(0.16, function () { landOn(p); });
}

/* ---------- landing ---------- */
function landOn(p) {
  var t = TILES[p.pos];
  if (t.kind === 'gate') {
    p.coins += 20; fxAt(p, '+20', '#ffd24a'); Snd.play('coin');
    drawSticker(p, 1);
    if (!p.ai) logAdd('Meridian Gate: +20 and a sticker.');
    finishLanding(p);
    return;
  }
  if (t.kind === 'corner') { doCorner(p, t); return; }
  if (t.kind === 'land') { doLand(p, t); return; }
  doEvent(p, t);
}

function doCorner(p, t) {
  var own = G.corners[t.i];
  if (own < 0) {
    G.corners[t.i] = p.i;
    logAdd(p.name + ' claims ' + CORNERNAME[t.i] + '.');
    fxAt(p, 'CLAIM', p.col); Snd.play('shield');
  } else if (own === p.i) {
    var gain = 8 + income(p);
    p.coins += gain;
    fxAt(p, '+' + gain, '#ffd24a'); Snd.play('coin');
    logAdd(p.name + ' collects ' + gain + ' at ' + CORNERNAME[t.i] + '.');
  } else {
    var o = G.players[own];
    var toll = 5 + 2 * tiersTotal(o);
    toll = Math.min(toll, p.coins);
    p.coins -= toll; o.coins += toll;
    fxAt(p, '-' + toll, '#ff8080'); Snd.play('block');
    logAdd(p.name + ' pays ' + toll + ' toll to ' + o.name + '.');
  }
  finishLanding(p);
}

function doLand(p, t) {
  var d = t.d, cost = buildCost(p, d);
  if (p.ai) {
    if (cost > 0 && p.coins >= cost) applyBuild(p, d, cost);
    else { p.coins += 10; fxAt(p, '+10', '#ffd24a'); }
    finishLanding(p);
    return;
  }
  var list = [];
  if (cost > 0) {
    list.push({
      t: 'BUILD ' + TIERNAME[p.dist[d]] + ' - ' + DISTRICTS[d].name,
      s: 'Cost ' + cost + '  |  +' + TIERINC[p.dist[d]] + ' income',
      c: DISTRICTS[d].col, ok: p.coins >= cost,
      act: function () { applyBuild(p, d, cost); finishLanding(p); }
    });
  } else {
    list.push({
      t: DISTRICTS[d].name + ' COMPLETE', s: 'Collect +24 dividend', c: DISTRICTS[d].col, ok: true,
      act: function () { p.coins += 24; fxAt(p, '+24', '#ffd24a'); Snd.play('coin'); finishLanding(p); }
    });
  }
  list.push({
    t: 'BANK THE ROW', s: '+10 coins, keep it simple', c: '#8fa3c0', ok: true,
    act: function () { p.coins += 10; fxAt(p, '+10', '#ffd24a'); Snd.play('coin'); finishLanding(p); }
  });
  list.push({
    t: 'BUY SHIELD', s: 'Cost ' + SHIELD_COST + '  |  blocks one rival heist', c: '#58e0c8',
    ok: p.coins >= SHIELD_COST,
    act: function () {
      p.coins -= SHIELD_COST; p.shields++; Snd.play('shield');
      fxAt(p, 'SHIELD', '#58e0c8'); finishLanding(p);
    }
  });
  openChoice(DISTRICTS[d].name + ' landmark slot', list, '');
}

function applyBuild(p, d, cost) {
  p.coins -= cost;
  p.dist[d]++;
  Snd.play('build');
  fxAt(p, TIERNAME[p.dist[d] - 1].toUpperCase(), DISTRICTS[d].col);
  if (!p.ai) shake(7);
  logAdd(p.name + ' builds ' + TIERNAME[p.dist[d] - 1] + ' in ' + DISTRICTS[d].name + '.');
  if (p.dist[d] === 3) {
    p.coins += 30;
    logAdd(DISTRICTS[d].name + ' finished by ' + p.name + '! +30');
    if (!p.ai) { shake(11); drawSticker(p, 1); }
  }
}

function buildFree(p, d) {
  if (p.dist[d] < 3) {
    p.dist[d]++;
    logAdd('Album bonus: free ' + TIERNAME[p.dist[d] - 1] + ' in ' + DISTRICTS[d].name + '.');
    Snd.play('build');
  } else { p.coins += 30; logAdd('Album bonus: +30 coins.'); }
}

/* ---------- event tiles ---------- */
function doEvent(p, t) {
  var heist = ((t.i + p.laps) % 2 === 0) ? true : (Math.random() < 0.5);
  if (p.ai) {
    if (p.shields < 1 && Math.random() < 0.4) {
      p.shields += 2; fxAt(p, 'SHIELD', '#58e0c8');
    } else {
      var best = -1, bi = -1;
      for (var i = 1; i < 4; i++) {
        if (i === p.i) continue;
        if (G.players[i].coins > best) { best = G.players[i].coins; bi = i; }
      }
      if (bi >= 0) resolveHeist(p, G.players[bi]);
      else { p.coins += 12; }
    }
    finishLanding(p);
    return;
  }
  if (heist) {
    var list = [];
    for (var k = 1; k < 4; k++) {
      (function (r) {
        var pct = r.shields > 0 ? 0 : Math.round(HEIST_ODDS * 100);
        list.push({
          t: 'HEIST ' + r.name,
          s: 'Vault ' + r.coins + '  |  shields ' + r.shields + '  |  ' + pct + '% take',
          c: r.col, ok: true,
          act: function () { resolveHeist(p, r); finishLanding(p); }
        });
      })(G.players[k]);
    }
    openChoice('Heist: pick a rival vault', list, 'Shields block completely and burn. Unshielded: 85% success.');
  } else {
    var l2 = [
      {
        t: 'GRANT: +2 SHIELDS', s: 'Each blocks one incoming heist', c: '#58e0c8', ok: true,
        act: function () { p.shields += 2; Snd.play('shield'); fxAt(p, '+2 SHIELD', '#58e0c8'); finishLanding(p); }
      },
      {
        t: 'GRANT: +16 COINS', s: 'Straight to the ledger', c: '#ffd24a', ok: true,
        act: function () { p.coins += 16; Snd.play('coin'); fxAt(p, '+16', '#ffd24a'); finishLanding(p); }
      },
      {
        t: 'GRANT: 2 STICKER DRAWS', s: 'Each draw: 1 of 24, 4.2% each', c: '#c58cff', ok: true,
        act: function () { drawSticker(p, 2); finishLanding(p); }
      }
    ];
    openChoice('Row grant', l2, 'Album odds: every draw is uniform over all 24 stickers.');
  }
}

function resolveHeist(thief, target) {
  if (target.shields > 0) {
    target.shields--;
    Snd.play('block');
    logAdd(target.name + ' shield blocks ' + thief.name + '.');
    fxAt(target, 'BLOCKED', '#58e0c8');
    if (!thief.ai) shake(6);
    return;
  }
  if (Math.random() > HEIST_ODDS) {
    Snd.play('block');
    logAdd('Guards turn ' + thief.name + ' back at ' + target.name + '.');
    fxAt(thief, 'FOILED', '#ff8080');
    return;
  }
  var take = Math.min(Math.round(target.coins * 0.32), 90);
  if (take < 6) take = Math.min(6, target.coins);
  target.coins -= take; thief.coins += take;
  Snd.play('heist');
  if (!thief.ai) { shake(9); }
  fxAt(thief, '+' + take, '#ffd24a');
  logAdd(thief.name + ' lifts ' + take + ' from ' + target.name + '.');
}

/* ---------- stickers / albums ---------- */
function drawSticker(p, n) {
  for (var k = 0; k < n; k++) {
    if (p.ai) {
      p.stickCount++;
      if (p.stickCount % 6 === 0) p.coins += ALBUM_BONUS;
      continue;
    }
    var id = rint(24);
    G.lastSticker = id; G.stickerT = 1.4;
    if (p.stick[id]) {
      p.coins += 6;
      fxAt(p, 'DUPE +6', '#8fa3c0');
      logAdd('Dupe: ' + STICKERS[id] + ' -> +6 coins.');
    } else {
      p.stick[id] = true; p.stickCount++;
      Snd.play('sticker');
      fxAt(p, 'STICKER', '#c58cff');
      logAdd('Sticker: ' + STICKERS[id] + '.');
      var a = (id / 6) | 0, full = true;
      for (var s = a * 6; s < a * 6 + 6; s++) if (!p.stick[s]) full = false;
      if (full && !p.albums[a]) {
        p.albums[a] = true;
        p.coins += ALBUM_BONUS;
        Snd.play('album');
        shake(10);
        logAdd('ALBUM COMPLETE: ' + DISTRICTS[a].name + ' +' + ALBUM_BONUS);
        buildFree(p, a);
      }
    }
  }
}

/* ---------- choice UI bridge ---------- */
function openChoice(title, list, note) {
  G.choiceTitle = title;
  G.choices = list.slice(0, 3);
  G.choiceNote = note || '';
  G.state = 'choice';
  UI.focus = 0;
}
function takeChoice(n) {
  if (G.state !== 'choice' || !G.choices) return;
  var c = G.choices[n];
  if (!c || !c.ok) { Snd.play('block'); return; }
  G.choices = null;
  Snd.play('tap');
  c.act();
}

/* ---------- end of a landing ---------- */
function finishLanding(p) {
  if (checkWin(p)) return;
  G.state = 'wait';
  TM.add(p.ai ? 0.45 : 0.3, function () { endTurn(p); });
}

function checkWin(p) {
  if (p.dist[0] === 3 && p.dist[1] === 3 && p.dist[2] === 3 && p.dist[3] === 3) {
    G.winner = p.i;
    G.state = 'over';
    TM.clear();
    if (p.i === 0) {
      G.boardsWon++;
      if (G.bestTurns === 0 || G.turns < G.bestTurns) G.bestTurns = G.turns;
      Store.write({ boardsWon: G.boardsWon, bestTurns: G.bestTurns, level: G.level + 1 });
      Snd.play('win'); shake(16);
      if (typeof parts !== 'undefined') parts.burst(195, 300, '#ffd24a', 40, 260, 1.1);
    } else {
      Store.write({ boardsWon: G.boardsWon, bestTurns: G.bestTurns, level: G.level });
      Snd.play('lose'); shake(10);
    }
    logAdd(p.name + ' completes the row.');
    return true;
  }
  return false;
}

function endTurn(p) {
  if (G.winner >= 0) return;
  if (G.doubles) {
    G.doubles = false;
    logAdd(p.name + ' rolled doubles - rolls again.');
    if (p.ai) { G.state = 'rival'; TM.add(0.4, doRoll); }
    else G.state = 'idle';
    return;
  }
  G.doubles = false; G.extra = 0;
  G.cur = (G.cur + 1) % 4;
  if (G.cur === 0) {
    G.turns++;
    G.state = 'idle';
  } else {
    G.state = 'rival';
    Snd.play('rival');
    TM.add(0.5, doRoll);
  }
}

/* ---------- per-frame sim ---------- */
function stepGame(dt) {
  if (G.state === 'start' || G.state === 'over') { TM.update(dt); return; }
  G.elapsed += dt;
  if (G.diceSpin > 0) G.diceSpin -= dt;
  if (G.stickerT > 0) G.stickerT -= dt;
  if (G.state === 'moving') {
    G.hopT += dt;
    while (G.hopT >= 0.12 && G.moveLeft > 0) {
      G.hopT -= 0.12;
      stepHop(G.players[G.cur]);
    }
  }
  TM.update(dt);
}
