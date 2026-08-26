import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path';
import { fileURLToPath } from 'node:url';
const BASE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
globalThis.window = globalThis; globalThis.devicePixelRatio = 3;
vm.runInThisContext(fs.readFileSync(path.join(BASE, 'data.js'), 'utf8'), { filename: 'data.js' });
const { default: Art3D, PERSONALITY_TABLE } = await import('../shark3d.js');
const { texturedFaceGeometry, checkTexturedFace } = await import('./face_textured.js');
const rows = globalThis.RF?.RFD?.SHARKS || globalThis.RFD?.SHARKS || [];
let bad = 0, n = 0;
for (const def of rows) {
  let rig; try { rig = Art3D.buildShark(def); } catch (e) { console.log(def.id.padEnd(16), 'SKIP (other lane threw): ' + e.message); continue; }
  if (!rig.group.userData.rfTextured) continue;
  n++;
  const built = texturedFaceGeometry(rig.parts.body, def, PERSONALITY_TABLE[def.id] || null);
  if (!built) { console.log(def.id.padEnd(16), 'NULL (unmeasurable)'); bad++; continue; }
  const m = built.metrics, f = checkTexturedFace(m);
  if (f.length) bad++;
  console.log(def.id.padEnd(16), String(rig.group.userData.rfSourceBase).padEnd(16),
    'eye=' + m.eyeSource.padEnd(18),
    'up=' + m.upAxis + '(' + m.upCorrelation.toFixed(2) + ')',
    'tri=' + String(built.triangles).padStart(4),
    'toothMed=' + m.toothSurfaceMedianRatio.toFixed(4),
    'toothMax=' + m.toothSurfaceMaxRatio.toFixed(4),
    'outside=' + m.toothOutsideHeadSpan,
    'eyeMed=' + m.eyeSurfaceMedianRatio.toFixed(4),
    'socket=' + m.socketDepthRatio.toFixed(3),
    f.length ? 'FAIL ' + f.join('; ') : 'ok');
}
console.log(`\n${n} textured rows, ${bad} failing`);
