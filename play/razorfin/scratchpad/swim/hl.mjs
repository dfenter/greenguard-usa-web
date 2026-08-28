import * as THREE from 'three';
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path';
import { pathToFileURL } from 'node:url';
globalThis.window=globalThis;globalThis.devicePixelRatio=3;
vm.runInThisContext(fs.readFileSync('data.js','utf8'),{filename:'data.js'});
const m=await import(pathToFileURL(path.resolve('shark3d.js')));
const A=globalThis.RF.Art3D||m.Art3D; await A.preload();
const def=globalThis.RFD.SHARKS.find(s=>s.id==='greatwhite');
const rec=A.buildShark(def); const g=rec.group;
let pose=null; g.traverse(o=>{if(!pose&&o.name==='RF Rev 9b pose root')pose=o;});
let head=null,tail=null; g.traverse(o=>{if(o.isBone&&o.name==='Head')head=o; if(o.isBone&&o.name==='Tail2')tail=o;});
for(const ph of [0.5,1.5,2.5,3.5]){
 rec.animate(1,{speedFrac:0.5,turn:0,tailPhase:ph,tailAmp:0.34}); g.updateMatrixWorld(true);
 const hp=new THREE.Vector3().setFromMatrixPosition(head.matrixWorld);
 const tp=new THREE.Vector3().setFromMatrixPosition(tail.matrixWorld);
 console.log('ph=%s pose.z=%s  headWorldZ=%s tailWorldZ=%s', ph, pose.position.z.toFixed(3), hp.z.toFixed(2), tp.z.toFixed(2));
}
console.log('pose.scale',pose.scale.toArray(),'group.scale',g.scale.toArray());
