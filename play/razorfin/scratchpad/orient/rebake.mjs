import fs from 'node:fs'; import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
const BASE='/Users/lucille/greenguard-usa-web/play/razorfin';
globalThis.window=globalThis; globalThis.devicePixelRatio=3;
vm.runInThisContext(fs.readFileSync(BASE+'/data.js','utf8'),{filename:'data.js'});
await import(pathToFileURL(BASE+'/shark3d.js'));
const A=globalThis.RF.Art3D; await A.preload();
/* In the FINAL frame, where do the pectorals sit? They are the two widest
 * lateral extremes over the front-mid body. On a correct shark they are a
 * symmetric pair about the dorsal axis, spread along the LATERAL axis (z).
 * If they are spread along Y instead, the model is rolled 90 deg. */
for(const t of A.residentTemplates().sort((a,b)=>a.key<b.key?-1:1)){
  t.scene.updateMatrixWorld(true);
  const pts=[]; const v=new THREE.Vector3();
  t.scene.traverse(m=>{ if(!m.isMesh||m.userData.rfExcludeFromBounds) return;
    const p=m.geometry?.attributes?.position; if(!p) return;
    const st=Math.max(1,Math.floor(p.count/8000));
    for(let i=0;i<p.count;i+=st) pts.push(v.fromBufferAttribute(p,i).applyMatrix4(m.matrixWorld).clone()); });
  if(!pts.length) continue;
  const bb=new THREE.Box3(); for(const p of pts) bb.expandByPoint(p);
  const s=bb.getSize(new THREE.Vector3()), c=bb.getCenter(new THREE.Vector3());
  // pectoral band: 30%..60% back from the nose (+x end)
  const x1=bb.max.x-s.x*0.30, x0=bb.max.x-s.x*0.62;
  let my=0,mz=0;
  for(const p of pts){ if(p.x<x0||p.x>x1) continue;
    my=Math.max(my,Math.abs(p.y-c.y)); mz=Math.max(mz,Math.abs(p.z-c.z)); }
  const o=t.scene.userData.rfOrientation;
  console.log('%s pectoralY=%s pectoralZ=%s ratio(z/y)=%s %s',
    t.key.padEnd(16), my.toFixed(4), mz.toFixed(4), (mz/Math.max(my,1e-9)).toFixed(2),
    mz>my?'lateral OK':'*** ROLLED (pectorals vertical) ***');
}
