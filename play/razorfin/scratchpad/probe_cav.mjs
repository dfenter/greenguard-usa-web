import fs from 'node:fs'; import vm from 'node:vm';
import * as THREE from 'three';
globalThis.window=globalThis; globalThis.devicePixelRatio=3;
vm.runInThisContext(fs.readFileSync('data.js','utf8'),{filename:'data.js'});
const { default: Art3D } = await import('../shark3d.js');
const rows=globalThis.RF?.RFD?.SHARKS||globalThis.RFD?.SHARKS||[];
for(const id of ['reef','tiger','greatwhite','blue','zeusfin','hammerhead']){
  const def=rows.find(d=>d.id===id);
  const rig=Art3D.buildShark(def), body=rig.parts.body;
  let face=null; rig.group.traverse(o=>{if(o.material?.userData?.rfTexturedFace)face=o;});
  if(!face)continue;
  rig.group.updateMatrixWorld(true); face.skeleton?.update();
  const g=face.geometry,pos=g.getAttribute('position'),k=g.getAttribute('rfFaceKind');
  const boxes={};const p=new THREE.Vector3();
  for(let i=0;i<pos.count;i++){
    const kind=Math.round(k.getX(i)); p.fromBufferAttribute(pos,i);
    face.applyBoneTransform(i,p); p.applyMatrix4(face.matrixWorld);
    (boxes[kind]=boxes[kind]||new THREE.Box3()).expandByPoint(p);
  }
  const bb=new THREE.Box3().setFromObject(body);
  const sz=(b)=>b?b.getSize(new THREE.Vector3()).length().toFixed(1):'-';
  const inside=(b)=>b?(bb.containsBox(b)?'IN':'OUT'):'-';
  console.log(id.padEnd(12),'cavity',sz(boxes[7]),inside(boxes[7]),
   ' tooth',sz(boxes[5]),inside(boxes[5]),' body diag',bb.getSize(new THREE.Vector3()).length().toFixed(1));
}
