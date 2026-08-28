import fs from 'node:fs'; import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
const BASE='/Users/lucille/greenguard-usa-web/play/razorfin';
globalThis.window=globalThis; globalThis.devicePixelRatio=3;
vm.runInThisContext(fs.readFileSync(BASE+'/data.js','utf8'),{filename:'data.js'});
await import(pathToFileURL(BASE+'/shark3d.js'));
const A=globalThis.RF.Art3D; await A.preload();
for(const k of ['mako','tiger_nu','whitepointer','dogfish']){
  const t=A.residentTemplates().find(x=>x.key===k);
  const o=t.scene.userData.rfOrientation;
  t.scene.updateMatrixWorld(true);
  const P=(n)=>{const b=t.scene.getObjectByName(n); return b? new THREE.Vector3().setFromMatrixPosition(b.matrixWorld):null;};
  const h=P('Head'), j=P('LowerJaw');
  const d=j.clone().sub(h);
  console.log('%s dorsalAxis=%s sign=%s src=%s roll=%.2fpi',k.padEnd(14),o.dorsalAxis,o.dorsalSign,o.dorsalSource,o.roll/Math.PI);
  console.log('   final jaw-head delta = [%s] |y|=%s |z|=%s',
    d.toArray().map(v=>v.toFixed(4)).join(', '), Math.abs(d.y).toFixed(4), Math.abs(d.z).toFixed(4));
}
