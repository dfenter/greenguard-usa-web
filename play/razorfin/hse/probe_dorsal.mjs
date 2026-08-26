import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path';
import { fileURLToPath } from 'node:url'; import * as THREE from 'three';
const BASE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
globalThis.window = globalThis; globalThis.devicePixelRatio = 3;
vm.runInThisContext(fs.readFileSync(path.join(BASE, 'data.js'), 'utf8'), { filename: 'data.js' });
const { default: Art3D } = await import('../shark3d.js');
const rows = globalThis.RF?.RFD?.SHARKS || globalThis.RFD?.SHARKS || globalThis.RF?.SHARKS || [];
for (const id of (process.env.IDS || 'reef,hammerhead,greatwhite').split(',')) {
  const def = rows.find((d) => d.id === id); if (!def) continue;
  const rig = Art3D.buildShark(def), body = rig.parts.body, g = rig.group;
  g.updateMatrixWorld(true);
  const geo = body.geometry, pos = geo.getAttribute('position'), p = new THREE.Vector3(), wp = new THREE.Vector3();
  // correlate skinned Z against WORLD up (world y), using the body's world matrix
  let n = 0, sz = 0, sy = 0, szz = 0, syy = 0, szy = 0;
  const pts = [];
  for (let i = 0; i < pos.count; i += 3) {
    p.fromBufferAttribute(pos, i); body.applyBoneTransform(i, p);
    wp.copy(p).applyMatrix4(body.matrixWorld);
    pts.push([p.x, p.y, p.z, wp.y]);
    sz += p.z; sy += wp.y; n++;
  }
  const mz = sz / n, my = sy / n;
  for (const q of pts) { const a = q[2] - mz, b = q[3] - my; szz += a * a; syy += b * b; szy += a * b; }
  const corrZ = szy / Math.sqrt(szz * syy);
  // same for x
  let sx = 0; for (const q of pts) sx += q[0]; const mx = sx / pts.length;
  let sxx = 0, sxy = 0; for (const q of pts) { const a = q[0] - mx, b = q[3] - my; sxx += a * a; sxy += a * b; }
  console.log(id, 'corr(skinnedZ, worldUp)=' + corrZ.toFixed(3), 'corr(skinnedX, worldUp)=' + (sxy / Math.sqrt(sxx * syy)).toFixed(3));
}
