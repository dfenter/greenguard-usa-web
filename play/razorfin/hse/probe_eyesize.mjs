import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path';
import { fileURLToPath } from 'node:url';
const BASE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
globalThis.window = globalThis; globalThis.devicePixelRatio = 3;
vm.runInThisContext(fs.readFileSync(path.join(BASE, 'data.js'), 'utf8'), { filename: 'data.js' });
const { default: Art3D, PERSONALITY_TABLE } = await import('../shark3d.js');
const { texturedFaceGeometry } = await import('./face_textured.js');
const rows = globalThis.RF?.RFD?.SHARKS || globalThis.RFD?.SHARKS || [];
const out = [];
for (const def of rows) {
  const rig = Art3D.buildShark(def); if (!rig.group.userData.rfTextured) continue;
  const built = texturedFaceGeometry(rig.parts.body, def, PERSONALITY_TABLE[def.id] || null);
  if (!built) continue;
  const m = built.metrics;
  out.push({ id: def.id, base: rig.group.userData.rfSourceBase,
    ratio: m.eyeRadius * 2 / m.headSpan, hw: m.headHalfWidth / m.headSpan,
    eyeAuthored: (PERSONALITY_TABLE[def.id]?.face?.eye ?? 1), headScale: m.headScale });
}
out.sort((a,b)=>a.ratio-b.ratio);
for (const r of out) console.log(r.id.padEnd(15), r.base.padEnd(16), 'eye/head=' + r.ratio.toFixed(3), 'halfW/head=' + r.hw.toFixed(3), 'authoredEye=' + r.eyeAuthored.toFixed(2), 'headScale=' + r.headScale.toFixed(3));
const rs = out.map(r=>r.ratio);
console.log('\nspread', Math.min(...rs).toFixed(3), '..', Math.max(...rs).toFixed(3), ' ratio', (Math.max(...rs)/Math.min(...rs)).toFixed(2)+'x');
