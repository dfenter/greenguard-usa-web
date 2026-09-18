/* Diagnostic: do the >3x edges actually VIOLATE the gradient cap, or do they
   satisfy it? Distinguishes "budget too loose" from "cap not applied here". */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
globalThis.self = globalThis; globalThis.window = globalThis;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const THREE = await import('three');
const { GLTFLoader } = await import(path.join(HERE, '../../_shared/three/GLTFLoader.js'));

const OPEN_RAD = Number(process.env.OPEN_RAD ?? 0.72);
const BUDGET = Number(process.env.BUDGET ?? 1.6);
const AXIS = new THREE.Vector3(1, 0, 0);

const loadGlb = (f) => new Promise((res, rej) => {
  const b = fs.readFileSync(f);
  new GLTFLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', res, rej);
});
function baked(mesh) {
  mesh.updateMatrixWorld(true);
  const p = mesh.geometry.getAttribute('position'), out = new Float32Array(p.count * 3), v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); mesh.applyBoneTransform(i, v); out[3*i]=v.x; out[3*i+1]=v.y; out[3*i+2]=v.z; }
  return out;
}
function wOn(mesh, bi, vi) {
  const si = mesh.geometry.getAttribute('skinIndex'), sw = mesh.geometry.getAttribute('skinWeight');
  let w = 0; for (let k = 0; k < 4; k++) if (si.getComponent(vi,k) === bi) w += sw.getComponent(vi,k);
  return w;
}

for (const file of process.argv.slice(2)) {
  const gltf = await loadGlb(file);
  let mesh = null; gltf.scene.traverse(o => { if (!mesh && o.isSkinnedMesh) mesh = o; });
  const bones = mesh.skeleton.bones;
  const jawIdx = bones.findIndex(b => b.name === 'LowerJaw');
  const jawBone = bones[jawIdx];
  mesh.geometry.computeBoundingBox();
  const size = new THREE.Vector3(); mesh.geometry.boundingBox.getSize(size);
  const L = Math.max(size.x, size.y, size.z);
  const bindQuat = jawBone.quaternion.clone();

  jawBone.quaternion.copy(bindQuat); jawBone.updateMatrixWorld(true);
  const rest = baked(mesh);
  const hinge = new THREE.Vector3().setFromMatrixPosition(jawBone.matrixWorld);
  jawBone.quaternion.copy(bindQuat); jawBone.rotateOnAxis(AXIS, OPEN_RAD); jawBone.updateMatrixWorld(true);
  const open = baked(mesh);

  const eLen = (A,p,q) => Math.hypot(A[3*p]-A[3*q], A[3*p+1]-A[3*q+1], A[3*p+2]-A[3*q+2]);
  const idx = mesh.geometry.getIndex().array;
  const seen = new Set(); const bad = [];
  const grp = mesh.geometry.groups || [];
  for (let t = 0; t < idx.length; t += 3) {
    const tri = [idx[t], idx[t+1], idx[t+2]];
    for (const [p,q] of [[tri[0],tri[1]],[tri[1],tri[2]],[tri[2],tri[0]]]) {
      const key = p<q ? p*1e7+q : q*1e7+p; if (seen.has(key)) continue; seen.add(key);
      const r = eLen(rest,p,q); if (r < 1e-6) continue;
      const s = eLen(open,p,q)/r;
      if (s > 3.0) {
        const wa = wOn(mesh,jawIdx,p), wb = wOn(mesh,jawIdx,q);
        const mid = new THREE.Vector3((rest[3*p]+rest[3*q])/2,(rest[3*p+1]+rest[3*q+1])/2,(rest[3*p+2]+rest[3*q+2])/2);
        const arm = mid.distanceTo(hinge)/L;
        const allowed = Math.min(1.0, BUDGET*(r/L)/Math.max(arm,1e-9));
        bad.push({ s, dW: Math.abs(wa-wb), wa, wb, restL: r/L, arm, allowed, p, q });
      }
    }
  }
  bad.sort((a,b) => b.s - a.s);
  const viol = bad.filter(e => e.dW > e.allowed + 1e-6).length;
  console.log(`\n${path.basename(file)}  L=${L.toFixed(4)}  edges>3x=${bad.length}  violate_cap=${viol}  satisfy_cap=${bad.length-viol}`);
  // material group of a vertex tells us body-scan vs authored mouth island
  const vgrp = new Int32Array(mesh.geometry.getAttribute('position').count).fill(-1);
  for (let gi=0; gi<grp.length; gi++){ const g=grp[gi]; for(let k=g.start;k<g.start+g.count;k++) vgrp[idx[k]]=gi; }
  const mats = Array.isArray(mesh.material)?mesh.material.map(m=>m.name):[mesh.material.name];
  console.log('  material groups:', mats.map((m,i)=>i+'='+m).join(' '));
  console.log('   stretch     dW     wa     wb    rest/L      arm/L   capAllow  matP matQ');
  for (const e of bad.slice(0,6))
    console.log(`  ${e.s.toFixed(2).padStart(7)}  ${e.dW.toFixed(3)}  ${e.wa.toFixed(3)}  ${e.wb.toFixed(3)}  ${e.restL.toExponential(2)}  ${e.arm.toFixed(4)}  ${e.allowed.toFixed(4)}  ${vgrp[e.p]} ${vgrp[e.q]}`);
}
