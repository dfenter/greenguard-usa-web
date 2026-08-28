import fs from 'node:fs'; import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
const BASE='/Users/lucille/greenguard-usa-web/play/razorfin';
globalThis.window=globalThis; globalThis.devicePixelRatio=3;
vm.runInThisContext(fs.readFileSync(BASE+'/data.js','utf8'),{filename:'data.js'});
await import(pathToFileURL(BASE+'/shark3d.js'));
const A=globalThis.RF.Art3D; await A.preload();
/* Measure the BUILT RIG (what the game renders), not the template. */
for(const id of ['cookiecutter','mako','tiger','reef']){
  const def=RFD.SHARK_BY_ID[id]; if(!def){console.log(id,'no def');continue;}
  const rig=A.buildShark(def); rig.group.updateMatrixWorld(true);
  const b=new THREE.Box3().setFromObject(rig.parts.body), s=b.getSize(new THREE.Vector3());
  // jaw vs head on the BUILT rig
  const P=(n)=>{const o=rig.group.getObjectByName(n); return o? new THREE.Vector3().setFromMatrixPosition(o.matrixWorld):null;};
  const h=P('Head'), j=P('LowerJaw'), t=P('Tail3')||P('Tail2')||P('Tail1');
  console.log('%s base=%s size=%s', id.padEnd(14), (rig.group.userData.rfSourceBase||'?').padEnd(14),
    JSON.stringify(s.toArray().map(v=>+v.toFixed(2))));
  if(h&&j) console.log('   jaw-head dy=%s (want NEGATIVE)', (j.y-h.y).toFixed(4));
  if(h&&t) console.log('   head.x=%s tail.x=%s (want head>tail)', h.x.toFixed(2), t.x.toFixed(2));
}
