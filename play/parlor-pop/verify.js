/* Build gate: greedy 200x replay per authored level. node verify.js [--fix] */
'use strict';
var path = require('path');
var fs = require('fs');
var E = require(path.join(__dirname, 'engine.js'));
var CONTENT = require(path.join(__dirname, 'levels.js'));
var LEVELS = Array.isArray(CONTENT) ? CONTENT : CONTENT.levels;
var TRIALS = 200, FAST = 80, TARGET = 0.90, CAP = 72;

function goalValue(st, run) {
  var p = run.len, g;
  for (var i = 0; i < st.goals.length; i++) {
    g = st.goals[i];
    if (g.type === 'collect' && g.color === run.c) p += 8;
    if (g.type === 'plates') p += 8;
  }
  return p;
}
function previewScore(st, mv) {
  st.rawSwap(mv[0], mv[1], mv[2], mv[3]);
  var runs = st.findMatches(), score = 0;
  for (var i = 0; i < runs.length; i++) score += goalValue(st, runs[i]);
  var a = st.at(mv[0], mv[1]), b = st.at(mv[2], mv[3]);
  if (a.sp || b.sp) score += 35;
  for (i = 0; i < runs.length; i++) {
    var run = runs[i];
    for (var j = 0; j < run.len; j++) {
      var x = run.h ? run.x + j : run.x, y = run.h ? run.y : run.y + j, d;
      for (d = 0; d < 4; d++) {
        var nx = x + [[1, 0], [-1, 0], [0, 1], [0, -1]][d][0], ny = y + [[1, 0], [-1, 0], [0, 1], [0, -1]][d][1];
        if (st.inb(nx, ny) && st.at(nx, ny).b) score += 7;
      }
      for (var ky = y - 1; ky >= 0; ky--) if (st.at(x, ky).key) { score += 30; break; }
    }
  }
  st.rawSwap(mv[0], mv[1], mv[2], mv[3]);
  return score;
}
function playout(level, random) {
  var st = new E.State(level), guard = 0;
  while (st.over === 0 && guard++ < 180) {
    var moves = st.listMoves();
    if (!moves.length) { st.shuffle(); moves = st.listMoves(); }
    if (!moves.length) break;
    var pick = moves[0], best = -1e9;
    if (random() < 0.88) {
      for (var i = 0; i < moves.length; i++) {
        var value = previewScore(st, moves[i]);
        if (value > best) { best = value; pick = moves[i]; }
      }
    } else pick = moves[(random() * moves.length) | 0];
    st.playSwap(pick[0], pick[1], pick[2], pick[3]);
  }
  return st.over === 1;
}
function rate(level, count) {
  var wins = 0, random = E.rng((level.seed ^ 0x9e3779b9) >>> 0);
  for (var i = 0; i < (count || TRIALS); i++) if (playout(level, random)) wins++;
  return wins / (count || TRIALS);
}
function replaceMoves(src, level) {
  var re = new RegExp("(id: '" + level.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "'[^}]*?moves: )(\\d+)");
  return src.replace(re, '$1' + level.moves);
}

var fix = process.argv.indexOf('--fix') >= 0, changed = [], ok = true;
for (var i = 0; i < LEVELS.length; i++) {
  var level = LEVELS[i], original = level.moves, win = rate(level, fix ? FAST : TRIALS), bump = 0;
  while (fix && win < TARGET && level.moves < CAP && bump++ < 40) { level.moves += 3; win = rate(level, FAST); }
  if (fix) win = rate(level, TRIALS);
  if (fix) while (win < TARGET && level.moves < CAP && bump++ < 60) { level.moves += 2; win = rate(level, TRIALS); }
  if (fix && level.moves !== original) changed.push(level.id + ': ' + original + ' -> ' + level.moves);
  if (win < TARGET) ok = false;
  console.log(String(i + 1).padStart(2, '0') + '. ' + level.id.padEnd(18) + ' moves=' + String(level.moves).padStart(2, ' ') + '  win=' + (win * 100).toFixed(1) + '%');
}
if (fix && changed.length) {
  var file = path.join(__dirname, 'levels.js'), source = fs.readFileSync(file, 'utf8');
  for (i = 0; i < LEVELS.length; i++) source = replaceMoves(source, LEVELS[i]);
  fs.writeFileSync(file, source);
  console.log('\nupdated levels.js:\n  ' + changed.join('\n  '));
}
console.log(ok ? '\nALL LEVELS PASS (>= 90%)' : '\nSOME LEVELS BELOW TARGET');
process.exitCode = ok ? 0 : 1;
