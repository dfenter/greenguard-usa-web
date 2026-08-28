import fs from 'node:fs'; import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
const BASE='/Users/lucille/greenguard-usa-web/play/razorfin';
globalThis.window=globalThis; globalThis.devicePixelRatio=3;
vm.runInThisContext(fs.readFileSync(BASE+'/data.js','utf8'),{filename:'data.js'});
await import(pathToFileURL(BASE+'/shark3d.js'));
const A=globalThis.RF.Art3D; await A.preload();
console.log('key'.padEnd(16),'RAW-geometry size (want X longest, Y=dorsal)   jaw dy');
for(const t of A.residentTemplates().sort((a,b)=>a.key<b.key?-1:1)){
  t.scene.updateMatrixWorld(true);
  const pts=[]; const v=new THREE.Vector3();
  t.scene.traverse((m)=>{ if(!m.isMesh||m.userData.rfExcludeFromBounds) return;
    const p=m.geometry?.attributes?.position; if(!p) return;
    const step=Math.max(1,Math.floor(p.count/6000));
    for(let i=0;i<p.count;i+=step) pts.push(v.fromBufferAttribute(p,i).applyMatrix4(m.matrixWorld).clone()); });
  if(!pts.length) continue;
  const bb=new THREE.Box3(); for(const p of pts) bb.expandByPoint(p);
  const s=bb.getSize(new THREE.Vector3());
  const P=(n)=>{const b=t.scene.getObjectByName(n); return b? new THREE.Vector3().setFromMatrixPosition(b.matrixWorld):null;};
  const h=P('Head')||P('Nose'), j=P('LowerJaw')||P('Jaw');
  const dy=(h&&j)?(j.y-h.y):null;
  const longestIsX = s.x>=s.y && s.x>=s.z;
  console.log(t.key.padEnd(16), JSON.stringify(s.toArray().map(n=>+n.toFixed(3))).padEnd(28),
    longestIsX?'X-long OK':'X-LONG FAIL', dy===null?'  n/a':('  '+(dy<0?'jawDown OK':'jawUP FAIL')));
}
