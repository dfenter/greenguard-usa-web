import * as THREE from 'three';
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path';
import { pathToFileURL } from 'node:url';
globalThis.window=globalThis; globalThis.devicePixelRatio=3;
vm.runInThisContext(fs.readFileSync('data.js','utf8'),{filename:'data.js'});
const m=await import(pathToFileURL(path.resolve('shark3d.js')));
const A=globalThis.RF.Art3D||m.Art3D; await A.preload();
for(const id of ['greatwhite','mako']){
const def=globalThis.RFD.SHARKS.find(s=>s.id===id);
const rec=A.buildShark(def); const g=rec.group;
rec.animate(0,{speedFrac:0.5,turn:0}); g.updateMatrixWorld(true);
const names=['Neck','Spine1','Spine2','Tail1','Tail2','Tail3'];
const bb=new THREE.Box3().setFromObject(g);
console.log('=== '+id+'  bbox x '+bb.min.x.toFixed(1)+' .. '+bb.max.x.toFixed(1));
for(const n of names){ let b; g.traverse(o=>{if(o.isBone&&o.name===n)b=o;}); if(!b)continue;
 const p=new THREE.Vector3().setFromMatrixPosition(b.matrixWorld);
 const u=(p.x-bb.min.x)/(bb.max.x-bb.min.x);
 console.log('   %s  worldX=%s  u(0=tail,1=nose)=%s  parent=%s',n.padEnd(7),p.x.toFixed(1),u.toFixed(2),b.parent?.name);}
}
