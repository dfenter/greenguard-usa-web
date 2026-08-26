/* Absolute world distance from each built face vertex to the nearest BODY
   vertex, in the same world units the camera sees. No ratios. */
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path';
import { fileURLToPath } from 'node:url'; import * as THREE from 'three';
const BASE=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
globalThis.window=globalThis; globalThis.devicePixelRatio=3;
vm.runInThisContext(fs.readFileSync(path.join(BASE,'data.js'),'utf8'),{filename:'data.js'});
const { default: Art3D } = await import('../shark3d.js');
const rows=globalThis.RFD?.SHARKS||[];
for(const id of (process.env.IDS||'reef').split(',')){
const def=rows.find(d=>d.id===id); if(!def)continue;
const rig=Art3D.buildShark(def); const g=rig.group; g.updateMatrixWorld(true);
const body=rig.parts.body;
let face=null; g.traverse(o=>{if(o.userData?.rfTexturedFace)face=o;});
if(!face){console.log(id,'no face');continue;}
// ALL body vertices in world
const bp=body.geometry.getAttribute('position'); const B=[]; const v=new THREE.Vector3();
for(let i=0;i<bp.count;i++){v.fromBufferAttribute(bp,i);body.applyBoneTransform(i,v);v.applyMatrix4(body.matrixWorld);B.push([v.x,v.y,v.z]);}
const bb=new THREE.Box3(); for(const q of B) bb.expandByPoint(new THREE.Vector3(q[0],q[1],q[2]));
const bodyLen=bb.getSize(new THREE.Vector3()).length();
// face vertices in world via GPU-equivalent skinning
face.skeleton.update();
const gp=face.geometry.getAttribute('position'),gk=face.geometry.getAttribute('rfFaceKind');
const gi=face.geometry.getAttribute('skinIndex'),gw=face.geometry.getAttribute('skinWeight');
const m=new THREE.Matrix4(),sv=new THREE.Vector3();
const byKind={};
for(let i=0;i<gp.count;i++){
  const out=new THREE.Vector3(); sv.fromBufferAttribute(gp,i).applyMatrix4(face.bindMatrix);
  for(let k=0;k<4;k++){const w=gw.getComponent(i,k);if(!w)continue;
    m.fromArray(face.skeleton.boneMatrices, gi.getComponent(i,k)*16);
    out.addScaledVector(new THREE.Vector3().copy(sv).applyMatrix4(m),w);}
  out.applyMatrix4(face.bindMatrixInverse).applyMatrix4(face.matrixWorld);
  let best=Infinity;
  for(const q of B){const dx=q[0]-out.x,dy=q[1]-out.y,dz=q[2]-out.z;const d=dx*dx+dy*dy+dz*dz;if(d<best)best=d;}
  const kk=Math.round(gk.getX(i));
  (byKind[kk]=byKind[kk]||[]).push(Math.sqrt(best));
}
const N=['socket','sclera','pupil','highlight','brow','tooth','lip'];
console.log(id,'body diagonal '+bodyLen.toFixed(1)+' world units');
for(const k of Object.keys(byKind)){const a=byKind[k].slice().sort((x,y)=>x-y);
  console.log('  '+(N[k]||k).padEnd(10)+' gap to nearest body vertex: med '+a[Math.floor(a.length/2)].toFixed(2)+
    '  max '+a[a.length-1].toFixed(2)+'  (as % of body: '+(100*a[Math.floor(a.length/2)]/bodyLen).toFixed(2)+'%)');}
}
