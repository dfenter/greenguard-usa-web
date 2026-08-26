import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path';
import { fileURLToPath } from 'node:url'; import * as THREE from 'three';
const BASE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
globalThis.window = globalThis; globalThis.devicePixelRatio = 3;
vm.runInThisContext(fs.readFileSync(path.join(BASE, 'data.js'), 'utf8'), { filename: 'data.js' });
const { default: Art3D } = await import('../shark3d.js');
const rows = globalThis.RF?.RFD?.SHARKS || globalThis.RFD?.SHARKS || globalThis.RF?.SHARKS || [];
console.log("rows:", rows.length);
for (const id of (process.env.IDS || 'reef,hammerhead,greatwhite,tiger').split(',')) {
  const def = rows.find((d) => d.id === id); if (!def) continue;
  const rig = Art3D.buildShark(def), body = rig.parts.body, g = rig.group;
  g.updateMatrixWorld(true);
  const bones = body.skeleton.bones;
  const w = (n) => { const b = bones.find((x) => x.name === n); if (!b) return null; return new THREE.Vector3().setFromMatrixPosition(b.matrixWorld); };
  const fmt = (v) => v ? `(${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)})` : 'n/a';
  console.log(id, 'tex=' + !!g.userData.rfTextured);
  for (const n of ['Head', 'LowerJaw', 'Neck', 'Tail3']) console.log('   world', n, fmt(w(n)));
  // bind-space (skinned, pre-group) head vs tail
  const geo = body.geometry, pos = geo.getAttribute('position'), p = new THREE.Vector3();
  const si = geo.getAttribute('skinIndex'), sw = geo.getAttribute('skinWeight');
  const hi = bones.findIndex((b) => b.name === 'Head'), ti = bones.findIndex((b) => b.name === 'Tail3');
  let hc = new THREE.Vector3(), hn = 0, tc = new THREE.Vector3(), tn = 0;
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i); body.applyBoneTransform(i, p);
    let hw = 0, tw = 0;
    for (let k = 0; k < 4; k++) { const b = si.getComponent(i, k), v = sw.getComponent(i, k); if (b === hi) hw += v; else if (b === ti) tw += v; }
    if (hw > 0.5) { hc.add(p); hn++; } if (tw > 0.5) { tc.add(p); tn++; }
  }
  if (hn) hc.divideScalar(hn); if (tn) tc.divideScalar(tn);
  console.log('   skinned head centroid', fmt(hc), 'tail centroid', fmt(tc), '-> nose axis delta', fmt(hc.clone().sub(tc)));
}
