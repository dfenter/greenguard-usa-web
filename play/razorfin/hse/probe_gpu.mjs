import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path';
import { fileURLToPath } from 'node:url'; import * as THREE from 'three';
const BASE=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
globalThis.window=globalThis; globalThis.devicePixelRatio=3;
vm.runInThisContext(fs.readFileSync(path.join(BASE,'data.js'),'utf8'),{filename:'data.js'});
const { default: Art3D } = await import('../shark3d.js');
const rows=globalThis.RFD?.SHARKS||[];
const def=rows.find(d=>d.id==='reef');
const rig=Art3D.buildShark(def); const g=rig.group; g.updateMatrixWorld(true);
const body=rig.parts.body;
let face=null; g.traverse(o=>{if(o.userData?.rfTexturedFace)face=o;});
// Exactly what the GPU does: boneMatrices = bone.matrixWorld * boneInverse
const sk=face.skeleton; sk.update();
const geo=face.geometry,pos=geo.getAttribute('position'),kind=geo.getAttribute('rfFaceKind');
const si=geo.getAttribute('skinIndex'),sw=geo.getAttribute('skinWeight');
const bm=face.bindMatrix, bmi=face.bindMatrixInverse;
const boxes={};
const tmp=new THREE.Matrix4(), acc=new THREE.Matrix4(), v=new THREE.Vector3(), sv=new THREE.Vector3();
for(let i=0;i<pos.count;i++){
  v.fromBufferAttribute(pos,i);
  // skinning: bindMatrix -> sum(w * boneMatrix) -> bindMatrixInverse
  sv.copy(v).applyMatrix4(bm);
  const out=new THREE.Vector3();
  for(let k=0;k<4;k++){
    const w=sw.getComponent(i,k); if(!w) continue;
    const bi=si.getComponent(i,k);
    tmp.fromArray(sk.boneMatrices, bi*16);
    out.addScaledVector(new THREE.Vector3().copy(sv).applyMatrix4(tmp), w);
  }
  out.applyMatrix4(bmi).applyMatrix4(face.matrixWorld);
  const kk=Math.round(kind.getX(i));
  (boxes[kk]=boxes[kk]||new THREE.Box3()).expandByPoint(out);
}
const N=['socket','sclera','pupil','highlight','brow','tooth','lip'];
const f=(b)=>'x['+b.min.x.toFixed(1)+','+b.max.x.toFixed(1)+'] y['+b.min.y.toFixed(1)+','+b.max.y.toFixed(1)+'] z['+b.min.z.toFixed(1)+','+b.max.z.toFixed(1)+']';
console.log('GPU-equivalent skinning of the FACE mesh:');
for(const k of Object.keys(boxes)) console.log('  '+(N[k]||k).padEnd(10), f(boxes[k]));
const bb=new THREE.Box3().setFromObject(body);
console.log('BODY  ', f(bb));
