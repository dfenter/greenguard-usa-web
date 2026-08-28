import fs from 'node:fs'; import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
const BASE='/Users/lucille/greenguard-usa-web/play/razorfin';
globalThis.window=globalThis; globalThis.devicePixelRatio=3;
vm.runInThisContext(fs.readFileSync(BASE+'/data.js','utf8'),{filename:'data.js'});
await import(pathToFileURL(BASE+'/shark3d.js'));
const A=globalThis.RF.Art3D; await A.preload();
/* Build the same def repeatedly. If the cached orientation record were being
   mutated, or the quaternion re-applied per build, the rig would drift. */
const def=RFD.SHARK_BY_ID['greatwhite'];
let first=null, drift=0;
for(let i=0;i<6;i++){
  const rig=A.buildShark(def); rig.group.updateMatrixWorld(true);
  const P=(n)=>{const o=rig.group.getObjectByName(n); return o? new THREE.Vector3().setFromMatrixPosition(o.matrixWorld):null;};
  const h=P('Head'), j=P('LowerJaw');
  const dy=+(j.y-h.y).toFixed(6);
  if(first===null) first=dy; else drift=Math.max(drift,Math.abs(dy-first));
  A.releaseShark && A.releaseShark(rig);
}
console.log('jaw dy first build =',first);
console.log('max drift over 6 rebuilds =',drift);
console.log(drift<1e-6 ? 'STABLE (cache is not mutated, no per-build re-rotation)' : 'DRIFT!! cache is being mutated');
