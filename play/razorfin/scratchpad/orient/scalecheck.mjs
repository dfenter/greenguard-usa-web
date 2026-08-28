import fs from 'node:fs'; import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
const BASE='/Users/lucille/greenguard-usa-web/play/razorfin';
globalThis.window=globalThis; globalThis.devicePixelRatio=3;
vm.runInThisContext(fs.readFileSync(BASE+'/data.js','utf8'),{filename:'data.js'});
await import(pathToFileURL(BASE+'/shark3d.js'));
const A=globalThis.RF.Art3D; await A.preload();
const t=A.residentTemplates().find(x=>x.key==='mako');
t.scene.updateMatrixWorld(true);
const tb=new THREE.Box3().setFromObject(t.scene);
console.log('TEMPLATE mako axis=%s size=%s', t.axis, JSON.stringify(tb.getSize(new THREE.Vector3()).toArray().map(v=>+v.toFixed(3))));
console.log('  scene.rotation=',t.scene.rotation.toArray().slice(0,3).map(v=>+v.toFixed(3)));
console.log('  scene.scale=',t.scene.scale.toArray().map(v=>+v.toFixed(3)));
const def=RFD.SHARK_BY_ID['mako'];
const rig=A.buildShark(def); rig.group.updateMatrixWorld(true);
// walk down from group to the model root to see each transform
let node=rig.parts.body, chain=[];
while(node && node!==rig.group){ chain.push(node); node=node.parent; }
chain.push(rig.group); chain.reverse();
for(const o of chain){
  console.log('  %-28s rot=%s scale=%s', (o.name||o.type).slice(0,28),
    JSON.stringify(o.rotation.toArray().slice(0,3).map(v=>+v.toFixed(3))),
    JSON.stringify(o.scale.toArray().map(v=>+v.toFixed(3))));
}
