import fs from 'node:fs'; import vm from 'node:vm';
import * as THREE from 'three';
globalThis.window=globalThis; globalThis.devicePixelRatio=3;
vm.runInThisContext(fs.readFileSync('data.js','utf8'),{filename:'data.js'});
const { default: Art3D } = await import('../shark3d.js');
const rows=globalThis.RF?.RFD?.SHARKS||globalThis.RFD?.SHARKS||[];
for(const id of ['reef','greatwhite','megalodon']){
  const def=rows.find(d=>d.id===id);
  const rig=Art3D.buildShark(def), body=rig.parts.body, root=rig.group;
  const m=rig.group.userData.rfMorph;
  console.log(id,'bindUp used? mesh.matrixWorld=',body.matrixWorld.elements.slice(0,12).map(v=>v.toFixed(2)).join(','));
  console.log('   group.rot',root.rotation.x.toFixed(3),root.rotation.y.toFixed(3),root.rotation.z.toFixed(3),'scale',root.scale.x.toFixed(3));
}
