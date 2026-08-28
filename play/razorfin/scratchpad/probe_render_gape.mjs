import fs from 'node:fs'; import vm from 'node:vm';
import * as THREE from 'three';
globalThis.window=globalThis; globalThis.devicePixelRatio=3;
vm.runInThisContext(fs.readFileSync('data.js','utf8'),{filename:'data.js'});
const { default: Art3D } = await import('../shark3d.js');
const rows=globalThis.RF?.RFD?.SHARKS||globalThis.RFD?.SHARKS||[];
for(const id of ['reef','greatwhite']){
  const def=rows.find(d=>d.id===id);
  const rig=Art3D.buildShark(def), body=rig.parts.body, root=rig.group;
  const jb=root.getObjectByName('LowerJaw');
  root.updateMatrixWorld(true);
  const q=jb.quaternion;
  const e=new THREE.Euler().setFromQuaternion(q,'XYZ');
  console.log(id,'LowerJaw quat',[q.x,q.y,q.z,q.w].map(v=>v.toFixed(4)).join(','),
   'eulerX(deg)',(e.x*180/Math.PI).toFixed(2), 'gapeRec',rig.group.userData.rfMorph?.gape?.degrees);
  // now call animate like the game would
  if(rig.animate){ rig.animate(0,{speedFrac:0}); root.updateMatrixWorld(true);
    const q2=jb.quaternion; const e2=new THREE.Euler().setFromQuaternion(q2,'XYZ');
    console.log('   after animate(): eulerX(deg)',(e2.x*180/Math.PI).toFixed(2),'rfJawGape',rig.group.userData.rfJawGape);
  }
}
