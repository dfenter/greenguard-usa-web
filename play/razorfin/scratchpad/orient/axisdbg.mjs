import fs from 'node:fs'; import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
const BASE='/Users/lucille/greenguard-usa-web/play/razorfin';
globalThis.window=globalThis; globalThis.devicePixelRatio=3;
vm.runInThisContext(fs.readFileSync(BASE+'/data.js','utf8'),{filename:'data.js'});
await import(pathToFileURL(BASE+'/shark3d.js'));
const A=globalThis.RF.Art3D; await A.preload();
const t=A.residentTemplates().find(x=>x.key==='mako');
/* Undo the applied orientation to recover the AUTHORED frame, then measure
   raw geometry the way resolveOrientation's orientSamples does. */
const o=t.scene.userData.rfOrientation;
const inv=o.quaternion.clone().invert();
const pts=[]; const v=new THREE.Vector3();
t.scene.updateMatrixWorld(true);
t.scene.traverse((m)=>{ if(!m.isMesh||m.userData.rfExcludeFromBounds) return;
  const p=m.geometry?.attributes?.position; if(!p) return;
  const step=Math.max(1,Math.floor(p.count/8000));
  for(let i=0;i<p.count;i+=step) pts.push(v.fromBufferAttribute(p,i).applyMatrix4(m.matrixWorld).clone().applyQuaternion(inv));
});
const bb=new THREE.Box3(); for(const p of pts) bb.expandByPoint(p);
console.log('AUTHORED-frame raw geometry size:', bb.getSize(new THREE.Vector3()).toArray().map(v=>+v.toFixed(4)));
console.log('resolver picked axis =', o.axis);
// and the CURRENT (post-orientation) raw geometry
const pts2=[]; t.scene.traverse((m)=>{ if(!m.isMesh||m.userData.rfExcludeFromBounds) return;
  const p=m.geometry?.attributes?.position; if(!p) return;
  const step=Math.max(1,Math.floor(p.count/8000));
  for(let i=0;i<p.count;i+=step) pts2.push(v.fromBufferAttribute(p,i).applyMatrix4(m.matrixWorld).clone());
});
const bb2=new THREE.Box3(); for(const p of pts2) bb2.expandByPoint(p);
console.log('POST-orientation raw geometry size:', bb2.getSize(new THREE.Vector3()).toArray().map(v=>+v.toFixed(4)));
console.log('setFromObject (SKINNED) size:', new THREE.Box3().setFromObject(t.scene).getSize(new THREE.Vector3()).toArray().map(v=>+v.toFixed(4)));
