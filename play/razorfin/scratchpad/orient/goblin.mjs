import fs from 'node:fs'; import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
const BASE='/Users/lucille/greenguard-usa-web/play/razorfin';
globalThis.window=globalThis; globalThis.devicePixelRatio=3;
vm.runInThisContext(fs.readFileSync(BASE+'/data.js','utf8'),{filename:'data.js'});
await import(pathToFileURL(BASE+'/shark3d.js'));
const A=globalThis.RF.Art3D; await A.preload();
/* For the two jawless rigs, dump a full girth/extent profile along x so we can
   see which end is really the head. The CAUDAL FIN is a thin vertical sheet:
   it has large HEIGHT but small DEPTH (z). A head has both. */
for(const k of ['goblinshark','anglerfish']){
  const t=A.residentTemplates().find(x=>x.key===k);
  t.scene.updateMatrixWorld(true);
  const pts=[]; const v=new THREE.Vector3();
  t.scene.traverse(m=>{ if(!m.isMesh||m.userData.rfExcludeFromBounds) return;
    const p=m.geometry?.attributes?.position; if(!p) return;
    for(let i=0;i<p.count;i++) pts.push(v.fromBufferAttribute(p,i).applyMatrix4(m.matrixWorld).clone()); });
  const bb=new THREE.Box3(); for(const p of pts) bb.expandByPoint(p);
  const s=bb.getSize(new THREE.Vector3()), NB=10;
  const hy=new Float64Array(NB), hz=new Float64Array(NB), cnt=new Float64Array(NB);
  const lo=new Float64Array(NB).fill(1e9), hi=new Float64Array(NB).fill(-1e9);
  const lz=new Float64Array(NB).fill(1e9), hzz=new Float64Array(NB).fill(-1e9);
  for(const p of pts){ let b=Math.floor((p.x-bb.min.x)/(s.x||1)*NB); b=Math.max(0,Math.min(NB-1,b));
    cnt[b]++; if(p.y<lo[b])lo[b]=p.y; if(p.y>hi[b])hi[b]=p.y; if(p.z<lz[b])lz[b]=p.z; if(p.z>hzz[b])hzz[b]=p.z; }
  console.log('=== '+k+'  (bin 0 = -x end, bin 9 = +x end)');
  for(let i=0;i<NB;i++){ if(!cnt[i])continue;
    const H=hi[i]-lo[i], D=hzz[i]-lz[i];
    console.log('  bin%d n=%-6d height=%.3f depth=%.3f  depth/height=%.2f',i,cnt[i],H,D,D/Math.max(H,1e-6)); }
}
