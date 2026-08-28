import * as THREE from 'three';
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path';
import { pathToFileURL } from 'node:url';
globalThis.window = globalThis; globalThis.devicePixelRatio = 3;
vm.runInThisContext(fs.readFileSync('data.js','utf8'),{filename:'data.js'});
const m = await import(pathToFileURL(path.resolve('shark3d.js')));
const A = globalThis.RF.Art3D || m.Art3D; await A.preload();
const def = globalThis.RFD.SHARKS.find(s=>s.id==='greatwhite');
const rec=A.buildShark(def); const g=rec.group;
let neck; g.traverse(o=>{if(o.isBone&&o.name==='Neck')neck=o;});
// speed step at t=1.0 from 0.1 -> 0.9 : does the wave phase jump?
console.log('t      speed   swimRate*t   neckZ');
let prev=null,maxJump=0;
for(let i=0;i<80;i++){
  const t=i/60; const sp = t<1.0?0.1:0.9;
  rec.animate(t,{speedFrac:sp,turn:0}); g.updateMatrixWorld(true);
  const p=new THREE.Vector3().setFromMatrixPosition(neck.matrixWorld);
  const rate=2.3+3.4*sp;
  if(i>2&&i!==60){const j=Math.abs(p.z-prev); if(t>0.9&&t<1.15) console.log('  t=%s sp=%s phase=%s z=%s d=%s',t.toFixed(3),sp,(t*rate).toFixed(3),p.z.toFixed(2),j.toFixed(2));}
  prev=p.z;
}
