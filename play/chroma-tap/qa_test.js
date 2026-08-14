/* Chroma Tap fix-round QA. Run with: node qa_test.js */
'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var root = __dirname;
var ctx = { console: console, Math: Math, Date: Date, Object: Object, Array: Array,
  JSON: JSON, String: String, Number: Number, isFinite: isFinite, parseInt: parseInt };
ctx.globalThis = ctx;
vm.runInNewContext(fs.readFileSync(path.join(root, 'ct_data.js'), 'utf8'), ctx, { filename: 'ct_data.js' });
vm.runInNewContext(fs.readFileSync(path.join(root, 'ct_sim.js'), 'utf8'), ctx, { filename: 'ct_sim.js' });

var D = ctx.CTData;
var Sim = ctx.CTSim;

function eachCell(board, fn) {
  for (var y = 0; y < board.rows; y++) for (var x = 0; x < board.cols; x++) {
    if (board.at(x, y)) fn(board.at(x, y), x, y);
  }
}

function keySet(cells) {
  var out = {};
  for (var i = 0; i < cells.length; i++) out[cells[i][0] + ',' + cells[i][1]] = 1;
  return out;
}

function bestMove(board) {
  var best = null;
  eachCell(board, function (cell, x, y) {
    var pv = board.previewBlast(x, y);
    if (pv && (!best || pv.cells.length > best.pv.cells.length)) best = { x: x, y: y, pv: pv };
  });
  return best;
}

/* The cascade contract is observable on authored content. */
var cascadeFound = false;
for (var seed = 1; seed < 250 && !cascadeFound; seed++) {
  var cd = D.level(1);
  var cb = new Sim.Board(Object.assign({}, cd, { seed: seed }));
  var cm = bestMove(cb);
  if (cm) {
    var cr = cb.tap(cm.x, cm.y);
    cascadeFound = !!(cr && cr.cascadeCount > 0 && cr.chainMax > 0);
  }
}
assert(cascadeFound, 'an authored board must expose an automatic cascade');

/* Recursive special telegraphs must cover every special blast, not just the first shape. */
var sb = new Sim.Board(D.level(1));
eachCell(sb, function (c, x, y) {
  c.k = 'tile'; c.c = (x + y * 2) % 6; c.sp = Sim.SP_NONE; c.hp = 1; c.orbColor = -1;
});
sb.at(0, 0).sp = Sim.SP_ROCKET; sb.at(0, 0).rot = 0;
sb.at(1, 0).sp = Sim.SP_ROCKET; sb.at(1, 0).rot = 0;
sb.at(3, 0).sp = Sim.SP_ROCKET; sb.at(3, 0).rot = 1;
var spv = sb.previewBlast(0, 0);
var spr = sb.tap(0, 0);
var firedCells = [];
for (var fi = 0; fi < spr.fired.length; fi++) firedCells = firedCells.concat(spr.fired[fi].cells);
assert.deepStrictEqual(keySet(spv.cells), keySet(firedCells), 'special preview must match recursive blast cells');

/* An orb combo uses the orb's stored color. */
var ob = new Sim.Board(D.level(1));
eachCell(ob, function (c) { c.k = 'tile'; c.c = 0; c.sp = Sim.SP_NONE; c.hp = 1; c.orbColor = -1; });
ob.at(0, 0).sp = Sim.SP_ORB; ob.at(0, 0).orbColor = 5;
ob.at(1, 0).sp = Sim.SP_ROCKET; ob.at(1, 0).rot = 0;
ob.at(2, 0).c = 5;
var orbCells = ob.comboCells([0, 0, ob.at(0, 0)], [1, 0, ob.at(1, 0)]);
assert(orbCells.length > 0 && orbCells.some(function (p) { return p[0] === 0 && p[1] === 0; }),
  'orb combo must use its stored color');
assert(ob.comboOrbColor([0, 0, ob.at(0, 0)], [1, 0, ob.at(1, 0)]) === 5, 'orb color is retained');

/* A gear hit by a blast does not bypass floor banking. */
var gb = new Sim.Board(D.level(1));
eachCell(gb, function (c, x, y) {
  c.k = 'tile'; c.c = (x + y * 3) % 6; c.sp = Sim.SP_NONE; c.hp = 1; c.orbColor = -1;
});
gb.at(0, 0).sp = Sim.SP_ROCKET; gb.at(0, 0).rot = 1;
gb.at(0, 2).k = 'gear'; gb.at(0, 2).c = -1; gb.at(0, 2).sp = Sim.SP_NONE;
var gr = gb.tap(0, 0);
assert(gr && !gr.cleared.some(function (e) { return e.kind === 'gear'; }),
  'direct gear blast must not complete the goal');

/* Blockers no longer freeze one-row hazard motion. */
var hb = new Sim.Board(D.level(1));
eachCell(hb, function (c, x, y) {
  c.k = 'tile'; c.c = (x + y) % 6; c.sp = Sim.SP_NONE; c.hp = 1; c.orbColor = -1;
});
hb.at(0, 0).k = 'gear'; hb.at(0, 1).k = 'crate'; hb.at(0, 1).hp = 1;
hb.at(1, 7).k = 'balloon'; hb.at(1, 6).k = 'crate'; hb.at(1, 6).hp = 1;
hb.stepHazards();
assert(hb.at(0, 1).k === 'gear' && hb.at(0, 0).k === 'crate', 'gear must sink through a blocker');
assert(hb.at(1, 6).k === 'balloon' && hb.at(1, 7).k === 'crate', 'balloon must rise through a blocker');

/* Active state is versioned and round-trips the full board. */
var saved = new Sim.Board(D.level(3));
var move = bestMove(saved);
assert(move && saved.tap(move.x, move.y));
var state = saved.saveState();
var restored = new Sim.Board(D.level(3));
assert(restored.restoreState(state), 'active state should validate');
assert.deepStrictEqual(restored.snapshot(), saved.snapshot(), 'active state should round-trip');

var repaired = D.normalizeSave({ v: 3, medals: { '1': 'bronze', '999': 'gold' }, best: { '1': 4, '999': 9 } });
assert(!repaired.medals['999'] && !repaired.best['999'], 'save IDs must be content-bounded');

var shipped = [];
function collect(dir) {
  var names = fs.readdirSync(dir);
  for (var ci = 0; ci < names.length; ci++) {
    if (names[ci] === '.DS_Store') continue;
    var full = path.join(dir, names[ci]), stat = fs.statSync(full);
    if (stat.isDirectory()) collect(full);
    else shipped.push(full);
  }
}
collect(root);
var payload = 0;
for (var si = 0; si < shipped.length; si++) {
  var bytes = fs.statSync(shipped[si]).size;
  assert(bytes <= 400 * 1024, path.relative(root, shipped[si]) + ' exceeds the per-file budget');
  payload += bytes;
}
var audio = fs.readdirSync(path.join(root, 'assets')).filter(function (name) { return /\.(mp3|m4a)$/i.test(name); });
assert(audio.length === fs.readdirSync(path.join(root, 'assets')).length, 'audio assets must be MP3 or M4A');
assert(payload <= 2.5 * 1024 * 1024, 'payload exceeds 2.5MB');
console.log('chroma-tap QA passed: cascade, recursive telegraph, orb color, gear banking, hazard motion, resume state, save bounds, and budgets');
