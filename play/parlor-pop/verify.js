/* Parlor Pop - verify.js  (build-time only; node verify.js [--fix])
   Random-playout solver check. Plays each level N times with a lightly greedy
   picker and reports the win rate; --fix bumps `moves` in levels.js until every
   level clears at or above the target rate. Not loaded by index.html. */
'use strict';
var path = require('path');
var fs = require('fs');
var E = require(path.join(__dirname, 'engine.js'));
var LEVELS = require(path.join(__dirname, 'levels.js'));

var TRIALS = 200, TARGET = 0.9, CAP = 55;
var FAST = 100;

// Cheap heuristic: how much does this swap advance the goals?
function score(st, mv) {
  st.rawSwap(mv[0], mv[1], mv[2], mv[3]);
  var runs = st.findMatches(), p = 0;
  for (var i = 0; i < runs.length; i++) {
    var r = runs[i], j, w = 1;
    for (j = 0; j < st.goals.length; j++) {
      var g = st.goals[j];
      if (g.have >= g.need) continue;
      if (g.type === 'collect' && g.color === r.c) w = 4;
    }
    p += r.len * w;
    if (r.len >= 4) p += 6;
    // reward clearing plates and cells under keys / beside blockers
    for (j = 0; j < r.len; j++) {
      var cx = r.h ? r.x + j : r.x, cy = r.h ? r.y : r.y + j;
      var cc = st.at(cx, cy);
      if (cc.plate) p += 5;
      for (var k = cy - 1; k >= 0; k--) { if (st.at(cx, k).key) { p += 45; break; } }
      var d = [[1,0],[-1,0],[0,1],[0,-1]];
      for (var q = 0; q < 4; q++) {
        var nx = cx + d[q][0], ny = cy + d[q][1];
        if (st.inb(nx, ny) && st.at(nx, ny).b) {
          p += 3;
          // a blocker sitting under a key is worth a lot more
          for (var kk = ny - 1; kk >= 0; kk--) if (st.at(nx, kk).key) { p += 30; break; }
        }
      }
    }
  }
  st.rawSwap(mv[0], mv[1], mv[2], mv[3]);
  return p;
}

function playout(level, r) {
  var st = new E.State(level);
  st.settle();
  var guard = 0;
  while (st.over === 0 && guard++ < 400) {
    var moves = st.listMoves();
    if (!moves.length) { st.shuffle(); moves = st.listMoves(); if (!moves.length) break; }
    var pick;
    if (r() < 0.85) {
      // greedy over a random sample (cheap)
      var best = -1e9;
      for (var i = 0; i < moves.length; i++) {
        var s = score(st, moves[i]);
        if (s > best) { best = s; pick = moves[i]; }
      }
    } else {
      pick = moves[(r() * moves.length) | 0];
    }
    st.playSwap(pick[0], pick[1], pick[2], pick[3]);
  }
  return st.over === 1;
}

function rate(level, n) {
  n = n || TRIALS;
  var wins = 0, r = E.rng(level.seed ^ 0x9e3779b9);
  for (var t = 0; t < n; t++) if (playout(level, r)) wins++;
  return wins / n;
}

var fix = process.argv.indexOf('--fix') >= 0;
var changed = [];
var allOk = true;
for (var i = 0; i < LEVELS.length; i++) {
  var L = LEVELS[i], orig = L.moves, bumps = 0, w;
  if (fix) {
    w = rate(L, FAST);
    while (w < TARGET && bumps < 60 && L.moves < CAP) { L.moves += 3; bumps++; w = rate(L, FAST); }
  }
  w = rate(L);
  while (fix && w < TARGET && bumps < 80 && L.moves < CAP) { L.moves += 2; bumps++; w = rate(L); }
  // trim back any overshoot from the noisy fast pass, down to the minimum
  // budget that still clears the bar...
  var misses = 0;
  while (fix && L.moves > 14 && misses < 2) {
    var keep = L.moves;
    L.moves -= 2;
    var w2 = rate(L);
    if (w2 < TARGET) { L.moves = keep; misses++; if (misses >= 2) break; L.moves = keep - 4; if (rate(L) < TARGET) { L.moves = keep; break; } }
    else w = w2;
  }
  // ...then hand back a generous margin so nobody plays on a knife edge.
  if (fix) { L.moves = Math.min(60, Math.ceil(L.moves * 1.25)); w = rate(L); }
  if (L.moves !== orig) changed.push(L.name + ': ' + orig + ' -> ' + L.moves);
  if (w < TARGET) allOk = false;
  console.log(String(i + 1).padStart(2) + '. ' + L.name.padEnd(16) + ' moves=' + String(L.moves).padStart(3) + '  win=' + (w * 100).toFixed(1) + '%');
}

if (fix && changed.length) {
  var f = path.join(__dirname, 'levels.js');
  var src = fs.readFileSync(f, 'utf8');
  for (var j = 0; j < LEVELS.length; j++) {
    var L2 = LEVELS[j];
    var re = new RegExp("(name: '" + L2.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "'[^}]*?moves: )(\\d+)");
    src = src.replace(re, '$1' + L2.moves);
  }
  fs.writeFileSync(f, src);
  console.log('\nupdated levels.js:\n  ' + changed.join('\n  '));
}
console.log(allOk ? '\nALL LEVELS PASS (>= ' + (TARGET * 100) + '%)' : '\nSOME LEVELS BELOW TARGET');
