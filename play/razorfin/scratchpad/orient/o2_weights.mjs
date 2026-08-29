import fs from 'node:fs'; import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
const BASE='/Users/lucille/greenguard-usa-web/play/razorfin';
globalThis.window=globalThis; globalThis.devicePixelRatio=3;
vm.runInThisContext(fs.readFileSync(BASE+'/data.js','utf8'),{filename:'data.js'});
await import(pathToFileURL(BASE+'/shark3d.js'));
const A=globalThis.RF.Art3D; await A.preload();
for(const k of ['greatwhite_cy','thresher','tigershark','whaler','sharky']){
  const t=A.residentTemplates().find(x=>x.key===k); if(!t)continue;
  t.scene.updateMatrixWorld(true);
  let sk=null; t.scene.traverse(o=>{ if(o.isSkinnedMesh&&!sk)sk=o; });
  if(!sk){console.log(k,'no skinned mesh');continue;}
  const names=sk.skeleton.bones.map(b=>b.name);
  const pos=sk.geometry.attributes.position, si=sk.geometry.attributes.skinIndex, sw=sk.geometry.attributes.skinWeight;
  // For Head and Tail3 bones, find the mean X of vertices they dominate
  const acc={};
  for(let i=0;i<pos.count;i++){
    let best=-1,bw=0;
    for(let j=0;j<4;j++){ const w=sw.getComponent(i,j); if(w>bw){bw=w;best=si.getComponent(i,j);} }
    if(best<0)continue; const nm=names[best]; if(!nm)continue;
    const v=new THREE.Vector3().fromBufferAttribute(pos,i).applyMatrix4(sk.matrixWorld);
    (acc[nm]=acc[nm]||{n:0,x:0}); acc[nm].n++; acc[nm].x+=v.x;
  }
  const rows=Object.entries(acc).map(([n,a])=>n+':x='+(a.x/a.n).toFixed(3)+'(n'+a.n+')');
  console.log('=== '+k, rows.join('  '));
}
