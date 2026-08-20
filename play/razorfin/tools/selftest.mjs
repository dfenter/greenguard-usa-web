// Headless selftest runner. Usage, from play/razorfin/:
//   node --import ./tools/reg.mjs tools/selftest.mjs world game art3d fx ui meta abilities
// Classic scripts (data/meta/abilities/ui/sharkart) load via vm; ES modules import.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const BASE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
globalThis.window = globalThis;
globalThis.devicePixelRatio = 3;
function classic(f) { vm.runInThisContext(fs.readFileSync(path.join(BASE, f), 'utf8'), { filename: f }); }
classic('data.js');
const targets = process.argv.slice(2).length ? process.argv.slice(2) : ['world', 'game'];
let allPass = true;
for (const t of targets) {
  let res;
  try {
    if (t === 'world') { await import(pathToFileURL(path.join(BASE, 'world3d.js'))); res = globalThis.RF.World.__selftest(); }
    else if (t === 'game') { await import(pathToFileURL(path.join(BASE, 'engine3d.js'))); res = globalThis.RF.Game.__selftest(); }
    else if (t === 'art3d') { const m = await import(pathToFileURL(path.join(BASE, 'shark3d.js'))); res = (globalThis.RF.Art3D && globalThis.RF.Art3D.__selftest) ? globalThis.RF.Art3D.__selftest() : m.__selftest(); }
    else if (t === 'fish') { await import(pathToFileURL(path.join(BASE, 'shark3d.js'))); await import(pathToFileURL(path.join(BASE, 'fish3d.js'))); res = globalThis.RF.Art3D.__selftestFish(); }
    else if (t === 'fx') { const m = await import(pathToFileURL(path.join(BASE, 'fx3d.js'))); res = m.__selftest(); }
    else if (t === 'ui') { classic('ui3d.js'); res = globalThis.RF.UI.__selftest(); }
    else if (t === 'meta') { classic('meta.js'); res = globalThis.RF.Meta.__selftest(); }
    else if (t === 'abilities') { classic('meta.js'); classic('abilities.js'); res = globalThis.RF.Abilities.__selftest(); }
    else { console.log('unknown target ' + t); allPass = false; continue; }
  } catch (e) { console.log(t + ' EXCEPTION ' + (e && e.stack || e)); allPass = false; continue; }
  const notes = res && res.notes ? res.notes
    : res && res.sections ? Object.values(res.sections).flatMap(s => (s && s.notes) || [])
    : [];
  let ok = 0, fail = 0;
  for (const n of notes) { if (/^(FAIL|EXCEPTION)/.test(n)) { fail++; console.log('  ' + n); } else ok++; }
  console.log(t + ': pass=' + (res && res.pass) + ' ok=' + ok + ' fail=' + fail);
  if (!res || !res.pass) allPass = false;
}
process.exit(allPass ? 0 : 1);
