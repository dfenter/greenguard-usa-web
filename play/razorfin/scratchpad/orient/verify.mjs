import fs from 'node:fs'; import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
const BASE='/Users/lucille/greenguard-usa-web/play/razorfin';
globalThis.window=globalThis; globalThis.devicePixelRatio=3;
vm.runInThisContext(fs.readFileSync(BASE+'/data.js','utf8'),{filename:'data.js'});
await import(pathToFileURL(BASE+'/shark3d.js'));
const A=globalThis.RF.Art3D; await A.preload();
console.log('key'.padEnd(16),'axis','dorsalSrc'.padEnd(28),'noseSrc'.padEnd(16),'JAW-CHECK  BONE-CHECK');
let bad=0;
for(const t of A.residentTemplates().sort((a,b)=>a.key<b.key?-1:1)){
  t.scene.updateMatrixWorld(true);
  const o=t.scene.userData.rfOrientation;
  const P=(n)=>{const b=t.scene.getObjectByName(n); return b? new THREE.Vector3().setFromMatrixPosition(b.matrixWorld):null;};
  const head=P('Head')||P('Nose'), jaw=P('LowerJaw')||P('Jaw'),
        tail=P('Tail3')||P('Tail2')||P('Tail1');
  // GATE A: jaw must now be BELOW head (y negative delta)
  let jawv='n/a';
  if(head&&jaw){ const d=jaw.y-head.y; jawv = d<0?'ok':'FAIL'; if(d>=0)bad++; }
  // GATE B: head must be at greater x than tail
  let bonev='n/a';
  if(head&&tail){ bonev = head.x>tail.x?'ok':'FAIL'; if(head.x<=tail.x)bad++; }
  console.log(t.key.padEnd(16), o.axis, o.dorsalSource.padEnd(28), o.noseSource.padEnd(16),
    jawv.padEnd(10), bonev);
}
console.log('\nviolations:', bad);
