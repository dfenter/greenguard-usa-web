import fs from 'node:fs'; import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
const BASE='/Users/lucille/greenguard-usa-web/play/razorfin';
globalThis.window=globalThis; globalThis.devicePixelRatio=3;
vm.runInThisContext(fs.readFileSync(BASE+'/data.js','utf8'),{filename:'data.js'});
await import(pathToFileURL(BASE+'/shark3d.js'));
const A=globalThis.RF.Art3D; await A.preload();
for(const t of A.residentTemplates()){
  t.scene.updateMatrixWorld(true);
  const names=[]; t.scene.traverse(o=>{ if(o.isBone) names.push(o.name); });
  const g=(n)=>{const o=t.scene.getObjectByName(n); if(!o)return null;
    const p=new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
    return [p.x,p.y,p.z].map(v=>+v.toFixed(3));};
  const head=g('Head')||g('Nose'), jaw=g('LowerJaw')||g('Jaw');
  const tail=g('Tail3')||g('Tail2')||g('Tail1');
  console.log(t.key.padEnd(16),'head='+JSON.stringify(head),'jaw='+JSON.stringify(jaw),'tail='+JSON.stringify(tail));
  if(!head) console.log('    bones:', names.slice(0,12).join(','));
}
