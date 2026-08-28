import fs from 'node:fs'; import vm from 'node:vm';
import * as THREE from 'three';
globalThis.window=globalThis; globalThis.devicePixelRatio=3;
vm.runInThisContext(fs.readFileSync('data.js','utf8'),{filename:'data.js'});
const { default: Art3D } = await import('../shark3d.js');
const rows=globalThis.RF?.RFD?.SHARKS||globalThis.RFD?.SHARKS||[];
for(const id of ['reef','tiger','hammerhead','greatwhite','blue','zeusfin']){
  const def=rows.find(d=>d.id===id);
  const rig=Art3D.buildShark(def), root=rig.group;
  const jb=root.getObjectByName('LowerJaw');
  const g=rig.group.userData.rfMorph?.gape;
  const e=new THREE.Euler().setFromQuaternion(jb.quaternion,'XYZ');
  console.log(id.padEnd(12),'finalX',(e.x*180/Math.PI).toFixed(2).padStart(7),
    'applied',String(g?.degrees).padStart(6),
    'implied bind',((e.x*180/Math.PI)-(g?.degrees||0)).toFixed(2).padStart(8));
}
