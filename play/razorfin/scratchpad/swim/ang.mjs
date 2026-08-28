import * as THREE from 'three';
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path';
import { pathToFileURL } from 'node:url';
globalThis.window=globalThis;globalThis.devicePixelRatio=3;
vm.runInThisContext(fs.readFileSync('data.js','utf8'),{filename:'data.js'});
const m=await import(pathToFileURL(path.resolve('shark3d.js')));
const A=globalThis.RF.Art3D||m.Art3D; await A.preload();
const def=globalThis.RFD.SHARKS.find(s=>s.id==='greatwhite');
const rec=A.buildShark(def); const g=rec.group;
const names=['Tail3','Tail2','Tail1','Spine2','Spine1','Neck','Head'];
rec.animate(0,{speedFrac:0.5,turn:0,tailPhase:0.7,tailAmp:0.34}); g.updateMatrixWorld(true);
// world lateral (z) offset of each bone joint relative to rest
const rest={};
rec.animate(0,{speedFrac:0,turn:0,tailPhase:0,tailAmp:0}); g.updateMatrixWorld(true);
for(const n of names){let b;g.traverse(o=>{if(o.isBone&&o.name===n)b=o;});if(b)rest[n]=new THREE.Vector3().setFromMatrixPosition(b.matrixWorld);}
for(const ph of [0.5,1.5,2.5]){
 rec.animate(1,{speedFrac:0.5,turn:0,tailPhase:ph,tailAmp:0.34}); g.updateMatrixWorld(true);
 const parts=[];
 for(const n of names){let b;g.traverse(o=>{if(o.isBone&&o.name===n)b=o;});if(!b)continue;
  const p=new THREE.Vector3().setFromMatrixPosition(b.matrixWorld);
  parts.push(n+'='+(p.z-rest[n].z).toFixed(2));}
 console.log('phase',ph,parts.join(' '));
}
