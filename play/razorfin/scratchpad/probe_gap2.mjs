import fs from 'node:fs'; import vm from 'node:vm';
import * as THREE from 'three';
globalThis.window=globalThis; globalThis.devicePixelRatio=3;
vm.runInThisContext(fs.readFileSync('data.js','utf8'),{filename:'data.js'});
const { default: Art3D } = await import('../shark3d.js');
const rows=globalThis.RF?.RFD?.SHARKS||globalThis.RFD?.SHARKS||[];
// Measure the vertical opening between upper-lip teeth and lower-jaw teeth in world space
for(const id of ['reef','tiger','greatwhite','blue','zeusfin','hammerhead']){
  const def=rows.find(d=>d.id===id);
  const rig=Art3D.buildShark(def), body=rig.parts.body;
  let face=null; rig.group.traverse(o=>{if(o.material?.userData?.rfTexturedFace)face=o;});
  if(!face)continue;
  rig.group.updateMatrixWorld(true); face.skeleton?.update(); body.skeleton?.update();
  const g=face.geometry,pos=g.getAttribute('position'),k=g.getAttribute('rfFaceKind'),si=g.getAttribute('skinIndex');
  const bones=face.skeleton.bones;
  const ji=bones.findIndex(b=>b.name==='LowerJaw'), hi=bones.findIndex(b=>b.name==='Head');
  const p=new THREE.Vector3(); const upper=[],lower=[];
  for(let i=0;i<pos.count;i++){
    if(Math.round(k.getX(i))!==5) continue;
    p.fromBufferAttribute(pos,i); face.applyBoneTransform(i,p); p.applyMatrix4(face.matrixWorld);
    (si.getComponent(i,0)===ji?lower:upper).push(p.clone());
  }
  if(!upper.length||!lower.length){console.log(id,'missing a row');continue;}
  const ub=new THREE.Box3();upper.forEach(q=>ub.expandByPoint(q));
  const lb=new THREE.Box3();lower.forEach(q=>lb.expandByPoint(q));
  const bb=new THREE.Box3().setFromObject(body); const hs=bb.getSize(new THREE.Vector3());
  // opening on the axis with largest separation
  const d=['x','y','z'].map(a=>({a,v:Math.abs(ub.getCenter(new THREE.Vector3())[a]-lb.getCenter(new THREE.Vector3())[a])})).sort((m,n)=>n.v-m.v)[0];
  console.log(id.padEnd(12),'upper/lower tooth-row separation',d.v.toFixed(2),'on',d.a,
   ' = '+(d.v/Math.max(hs.x,hs.y,hs.z)*100).toFixed(1)+'% of body length');
}
