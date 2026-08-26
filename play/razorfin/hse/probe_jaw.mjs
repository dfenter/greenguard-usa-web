import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path';
import { fileURLToPath } from 'node:url';
const BASE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
globalThis.window = globalThis; globalThis.devicePixelRatio = 3;
vm.runInThisContext(fs.readFileSync(path.join(BASE, 'data.js'), 'utf8'), { filename: 'data.js' });
const { default: Art3D } = await import('../shark3d.js');
const rows = globalThis.RF?.RFD?.SHARKS || globalThis.RFD?.SHARKS || [];
for (const id of (process.env.IDS || 'megalodon,thresher,whaleshark,reef').split(',')) {
  const def = rows.find((d) => d.id === id); if (!def) continue;
  const rig = Art3D.buildShark(def), body = rig.parts.body;
  const geo = body.geometry, pos = geo.getAttribute('position');
  const si = geo.getAttribute('skinIndex'), sw = geo.getAttribute('skinWeight');
  const bones = body.skeleton.bones;
  const ji = bones.findIndex((b) => b.name === 'LowerJaw');
  const buckets = [0,0,0,0,0,0]; let maxJaw = 0;
  for (let i = 0; i < pos.count; i++) {
    let jw = 0;
    for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === ji) jw += sw.getComponent(i, k);
    maxJaw = Math.max(maxJaw, jw);
    if (jw > 0) buckets[Math.min(5, Math.floor(jw * 5))]++;
  }
  console.log(id.padEnd(12), 'base=' + String(rig.group.userData.rfSourceBase).padEnd(15),
    'maxJawWeight=' + maxJaw.toFixed(3), 'buckets(0-.2,.2-.4,.4-.6,.6-.8,.8-1,1)=' + buckets.join(','));
}
