import fs from 'node:fs'; import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
const BASE='/Users/lucille/greenguard-usa-web/play/razorfin';
globalThis.window=globalThis; globalThis.devicePixelRatio=3;
vm.runInThisContext(fs.readFileSync(BASE+'/data.js','utf8'),{filename:'data.js'});
await import(pathToFileURL(BASE+'/shark3d.js'));
const A=globalThis.RF.Art3D; await A.preload();
/* Does the SKIN actually follow the Head bone?  Move the Head bone a long
 * way and see which end of the mesh moves.  That is the only unambiguous
 * test of whether the rig is bound to the mesh it claims. */
for(const k of ['greatwhite_cy','thresher','tigershark','whaler','sharky']){
  const t=A.residentTemplates().find(x=>x.key===k); if(!t)continue;
  let sk=null; t.scene.traverse(o=>{ if(o.isSkinnedMesh&&!sk)sk=o; });
  if(!sk){console.log(k,'no skin');continue;}
  t.scene.updateMatrixWorld(true);
  const names=sk.skeleton.bones.map(b=>b.name);
  const hi=names.indexOf('Head'), ti=names.indexOf('Tail3');
  const pos=sk.geometry.attributes.position, si=sk.geometry.attributes.skinIndex, sw=sk.geometry.attributes.skinWeight;
  // mean X of vertices with >0.5 weight on Head, and on Tail3, in MESH space
  const mean=(bi)=>{let n=0,s=0; for(let i=0;i<pos.count;i++){ let w=0;
      for(let j=0;j<4;j++) if(si.getComponent(i,j)===bi) w+=sw.getComponent(i,j);
      if(w>0.5){ n++; s+=new THREE.Vector3().fromBufferAttribute(pos,i).applyMatrix4(sk.matrixWorld).x; } }
    return n?{n,x:+(s/n).toFixed(3)}:null;};
  console.log(k.padEnd(16),'HeadSkin',JSON.stringify(mean(hi)),' Tail3Skin',JSON.stringify(mean(ti)));
}
