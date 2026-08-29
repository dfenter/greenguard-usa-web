import fs from 'node:fs'; import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
const BASE='/Users/lucille/greenguard-usa-web/play/razorfin';
globalThis.window=globalThis; globalThis.devicePixelRatio=3;
vm.runInThisContext(fs.readFileSync(BASE+'/data.js','utf8'),{filename:'data.js'});
await import(pathToFileURL(BASE+'/shark3d.js'));
const A=globalThis.RF.Art3D; await A.preload();
/* Where are the TEETH / EYE submeshes?  Those name the true head end
 * independently of the rig. */
for(const k of ['greatwhite_cy','thresher','tigershark','whaler','sharky']){
  const t=A.residentTemplates().find(x=>x.key===k); if(!t)continue;
  t.scene.updateMatrixWorld(true);
  const rows=[];
  t.scene.traverse(o=>{ if(!o.isMesh||!o.geometry?.attributes?.position)return;
    const b=new THREE.Box3().setFromBufferAttribute(o.geometry.attributes.position);
    b.applyMatrix4(o.matrixWorld);
    const c=b.getCenter(new THREE.Vector3());
    rows.push((o.name||'?')+'/'+(o.material?.name||'?')+' cx='+c.x.toFixed(3)+' n='+o.geometry.attributes.position.count);
  });
  console.log('=== '+k); for(const r of rows) console.log('   ',r);
}
