import fs from 'node:fs'; import vm from 'node:vm';
import * as THREE from 'three';
globalThis.window=globalThis; globalThis.devicePixelRatio=3;
vm.runInThisContext(fs.readFileSync('data.js','utf8'),{filename:'data.js'});
const { default: Art3D } = await import('../shark3d.js');
const rows=globalThis.RF?.RFD?.SHARKS||globalThis.RFD?.SHARKS||[];
const rig=Art3D.buildShark(rows.find(d=>d.id==='reef'));
const jb=rig.group.getObjectByName('LowerJaw');
const deg=()=> (new THREE.Euler().setFromQuaternion(jb.quaternion,'XYZ').x*180/Math.PI).toFixed(2);
console.log('rest (no animate)      ',deg());
let t=0;
for(const [label,inp] of [['idle',{speedFrac:0.2}],['biting',{speedFrac:0.5,biting:true}],['biting held',{speedFrac:0.5,biting:true}],['released',{speedFrac:0.2}]]){
  for(let k=0;k<40;k++){ t+=1/60; rig.animate(t,inp); }
  console.log(label.padEnd(22),deg(),' rfJawGape',rig.group.userData.rfJawGape.toFixed(3));
}
