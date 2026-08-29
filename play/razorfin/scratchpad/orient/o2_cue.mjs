import fs from 'node:fs'; import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
const BASE='/Users/lucille/greenguard-usa-web/play/razorfin';
globalThis.window=globalThis; globalThis.devicePixelRatio=3;
vm.runInThisContext(fs.readFileSync(BASE+'/data.js','utf8'),{filename:'data.js'});
await import(pathToFileURL(BASE+'/shark3d.js'));
const A=globalThis.RF.Art3D; await A.preload();
/* TRUTH from my eyes:  greatwhite_cy + sharky = head at +X (correct)
 *                      thresher, tigershark, whaler = head at -X (reversed)
 * Find a cue that separates those groups. */
const TRUTH={greatwhite_cy:+1,sharky:+1,thresher:-1,tigershark:-1,whaler:-1};
for(const k of Object.keys(TRUTH)){
  const t=A.residentTemplates().find(x=>x.key===k); if(!t)continue;
  t.scene.updateMatrixWorld(true);
  const pts=[];
  t.scene.traverse(o=>{ if(!o.isMesh||!o.geometry?.attributes?.position)return;
    const pos=o.geometry.attributes.position;
    for(let i=0;i<pos.count;i++) pts.push(new THREE.Vector3().fromBufferAttribute(pos,i).applyMatrix4(o.matrixWorld)); });
  const box=new THREE.Box3(); for(const p of pts) box.expandByPoint(p);
  const sz=box.getSize(new THREE.Vector3());
  const BINS=20;
  const bins=[]; for(let i=0;i<BINS;i++) bins.push([]);
  for(const p of pts){ let b=Math.floor((p.x-box.min.x)/(sz.x||1)*BINS); b=Math.max(0,Math.min(BINS-1,b)); bins[b].push(p); }
  // cross-sectional AREA proxy: height*depth per bin, normalized
  const area=bins.map(b=>{ if(b.length<4)return 0;
    let ly=1e9,hy=-1e9,lz=1e9,hz=-1e9;
    for(const p of b){ if(p.y<ly)ly=p.y; if(p.y>hy)hy=p.y; if(p.z<lz)lz=p.z; if(p.z>hz)hz=p.z; }
    return (hy-ly)*(hz-lz); });
  const mx=Math.max(...area)||1;
  const na=area.map(a=>a/mx);
  // Compare mean normalized area of bins 2..6 (near -X end) vs 13..17 (near +X end)
  const mean=(a,i0,i1)=>{let s=0,n=0;for(let i=i0;i<=i1;i++){s+=a[i];n++;}return s/n;};
  const loA=mean(na,2,6), hiA=mean(na,13,17);
  console.log(k.padEnd(15),'truth',TRUTH[k]>0?'+X':'-X',
    ' areaLo(-X)',loA.toFixed(3),' areaHi(+X)',hiA.toFixed(3),
    ' => bulk at', hiA>loA?'+X':'-X', (hiA>loA?1:-1)===TRUTH[k]?'  MATCH':'  ** MISS');
  console.log('    profile', na.map(v=>v.toFixed(2)).join(' '));
}
