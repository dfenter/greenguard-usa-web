import * as THREE from 'three';
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path';
import { pathToFileURL } from 'node:url';
globalThis.window=globalThis;globalThis.devicePixelRatio=3;
vm.runInThisContext(fs.readFileSync('data.js','utf8'),{filename:'data.js'});
const m=await import(pathToFileURL(path.resolve('shark3d.js')));
const A=globalThis.RF.Art3D||m.Art3D; await A.preload();
const def=globalThis.RFD.SHARKS.find(s=>s.id==='greatwhite');
const rec=A.buildShark(def); const g=rec.group;
let tail=null; g.traverse(o=>{if(o.isBone&&o.name==='Tail2')tail=o;});
const N=90,FPS=30; let ph=0; const z=[];
for(let f=0;f<N;f++){const dt=1/FPS,sp=f<N/2?0.15:0.9;
 ph+=dt*(2.3+3.4*sp);
 rec.animate(f/FPS,{speedFrac:sp,turn:0,tailPhase:ph,tailAmp:0.03+0.31*sp});
 g.updateMatrixWorld(true);
 z.push(new THREE.Vector3().setFromMatrixPosition(tail.matrixWorld).z);}
for(let f=40;f<52;f++)console.log('f=%d sp=%s z=%s d1=%s',f,(f<45?0.15:0.9),z[f].toFixed(3),(z[f]-z[f-1]).toFixed(3));
