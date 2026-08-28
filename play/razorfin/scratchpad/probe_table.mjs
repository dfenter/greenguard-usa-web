import fs from 'node:fs'; import vm from 'node:vm';
import * as THREE from 'three';
globalThis.window=globalThis; globalThis.devicePixelRatio=3;
vm.runInThisContext(fs.readFileSync('data.js','utf8'),{filename:'data.js'});
const { default: Art3D } = await import('../shark3d.js');
const rows=globalThis.RF?.RFD?.SHARKS||globalThis.RFD?.SHARKS||[];
const ids=(process.env.IDS||'reef,tiger,hammerhead,greatwhite,blue,megalodon,zeusfin,typhonmaw').split(',');
console.log('| row | gape rendered | eye dia /L | teeth | cavity tris | overlay |');
console.log('|---|---|---|---|---|---|');
for(const id of ids){
  const def=rows.find(d=>d.id===id); if(!def)continue;
  const rig=Art3D.buildShark(def);
  const jb=rig.group.getObjectByName('LowerJaw');
  const deg=jb?(new THREE.Euler().setFromQuaternion(jb.quaternion,'XYZ').x*180/Math.PI):0;
  let face=null; rig.group.traverse(o=>{if(o.material?.userData?.rfTexturedFace)face=o;});
  if(!face){console.log(`| ${id} | ${deg.toFixed(2)}° | — | — | — | HELD (seatConfidence) |`);continue;}
  const m=face.userData.rfFaceMetrics;
  const k=face.geometry.getAttribute('rfFaceKind'); let cav=0;
  for(let i=0;i<k.count;i++) if(Math.round(k.getX(i))===7) cav++;
  console.log(`| ${id} | ${deg.toFixed(2)}° | ${(2*m.eyeRadius/m.headSpan).toFixed(3)} | ${m.toothCount} | ${cav} v | shipped |`);
}
