/* HSE lane O3: synchronous gate surface for the art3d selftest.
 *
 * hse/verify.mjs is the harness and owns the browser work. This file exists
 * only because __selftest() is synchronous and not awaited by the runner, so
 * an `await import()` there would change a contract every other lane depends
 * on. The gate TABLE is parsed out of verify.mjs rather than copied, so the
 * numbers the selftest asserts can never drift from the numbers the harness
 * actually judges against. A copy would have been the obvious move and would
 * have rotted the first time a gate moved.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const HERE = __dirname;
const RAZORFIN = path.resolve(HERE, '..');
const VERIFY = path.join(HERE, 'verify.mjs');
const REPORT = path.join(HERE, 'verify_report.md');

function gateTable() {
  const src = fs.readFileSync(VERIFY, 'utf8');
  const m = src.match(/const GATES = Object\.freeze\((\{[\s\S]*?\n\})\);/);
  if (!m) throw new Error('could not parse GATES out of hse/verify.mjs');
  // The literal carries line comments, so it is evaluated rather than JSON.parsed.
  return vm.runInNewContext('(' + m[1] + ')');
}

function thumbDims() {
  const src = fs.readFileSync(VERIFY, 'utf8');
  const m = src.match(/const THUMB_W = (\d+), THUMB_H = (\d+);/);
  return m ? { w: Number(m[1]), h: Number(m[2]) } : { w: 0, h: 0 };
}

function roster() {
  const sandbox = { window: {} };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(RAZORFIN, 'data.js'), 'utf8'), sandbox, { filename: 'data.js' });
  return sandbox.window.RFD.SHARKS;
}

/* Mirrors the harness's distinctness metric so its behaviour is pinned here
 * too: this is the only gate that can catch "every legendary row ended up the
 * same purple", and a metric that silently returns 0 would pass everything. */
function distance(a, b) {
  if (!a || !b || a.length !== b.length) return 1;
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
  return Math.sqrt(s / a.length);
}

function __verifyGates() {
  const notes = [];
  let pass = true;
  const check = (cond, msg) => { if (cond) notes.push('ok ' + msg); else { pass = false; notes.push('FAIL ' + msg); } };

  check(fs.existsSync(VERIFY), 'hse/verify.mjs exists');
  const GATES = gateTable();
  const T = thumbDims();

  const sharks = roster();
  check(sharks.length === 86, `roster has 86 rows (got ${sharks.length})`);
  check(new Set(sharks.map((s) => s.id)).size === sharks.length, 'row ids are unique');

  for (const [k, v] of Object.entries(GATES)) {
    if (typeof v === 'number') check(v > 0 && isFinite(v), `gate ${k} is a positive finite number (${v})`);
  }
  check(GATES.satFloor > 0 && GATES.satFloor < 1, `saturation floor ${GATES.satFloor} inside 0..1`);
  check(GATES.backBellyDelta > 0 && GATES.backBellyDelta < 1, `countershade gate ${GATES.backBellyDelta} inside 0..1`);
  check(GATES.patternContrast > 0 && GATES.patternContrast < 1, `pattern contrast gate ${GATES.patternContrast} inside 0..1`);
  check(GATES.bgBleedMax > 0 && GATES.bgBleedMax < 0.25, `background bleed ceiling ${GATES.bgBleedMax} is strict`);
  check(GATES.drawsMax <= 100, `draw budget ${GATES.drawsMax} <= 100 (program budget)`);
  check(GATES.trisMax <= 55000, `triangle budget ${GATES.trisMax} <= 55000 (program budget)`);
  check(T.w * T.h >= 1024, `distinctness thumbnails carry enough signal (${T.w}x${T.h})`);

  check(distance([0.5, 0.5], [0.5, 0.5]) === 0, 'distance of a vector with itself is 0');
  check(distance([0, 0], [1, 1]) === 1, 'distance of black against white is 1');
  check(distance([0.5], null) === 1, 'distance against a missing vector is maximal, not 0');

  const patterned = sharks.filter((s) => s.sil && s.sil.pattern && s.sil.pattern !== 'plain' && s.sil.pattern !== 'none');
  notes.push(`ok ${patterned.length}/${sharks.length} rows claim a non-plain pattern and are held to the contrast gate`);
  const modelled = sharks.filter((s) => s.sil && s.sil.model);
  notes.push(`ok ${modelled.length}/${sharks.length} rows route to a baked textured model`);

  check(fs.existsSync(REPORT), 'hse/verify_report.md exists (run: node hse/verify.mjs)');

  return { pass, notes, gates: GATES, rows: sharks.length };
}

module.exports = { __verifyGates, distance };
