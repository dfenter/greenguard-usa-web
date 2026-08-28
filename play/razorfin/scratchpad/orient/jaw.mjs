import fs from 'node:fs'; import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
const BASE='/Users/lucille/greenguard-usa-web/play/razorfin';
globalThis.window=globalThis; globalThis.devicePixelRatio=3;
vm.runInThisContext(fs.readFileSync(BASE+'/data.js','utf8'),{filename:'data.js'});
await import(pathToFileURL(BASE+'/shark3d.js'));
const A=globalThis.RF.Art3D; await A.preload();
/* sharky is the ONE rig everyone agrees renders correctly (Rev 9 reference).
 * Measure its jaw-vs-head and its eye/dorsal geometry to fix the sign
 * convention, then check every other rig against the same convention. */
const t=A.residentTemplates().find(x=>x.key==='sharky');
t.scene.updateMatrixWorld(true);
const P=(n)=>{const o=t.scene.getObjectByName(n); if(!o)return null;
  return new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);};
const head=P('Head'), jaw=P('LowerJaw');
console.log('sharky head',head.toArray().map(v=>+v.toFixed(4)));
console.log('sharky jaw ',jaw.toArray().map(v=>+v.toFixed(4)));
console.log('sharky jaw-head delta',jaw.clone().sub(head).toArray().map(v=>+v.toFixed(4)));
const bones=[]; t.scene.traverse(o=>{if(o.isBone)bones.push(o.name);});
console.log('sharky bones:',bones.join(','));
