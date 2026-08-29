import fs from 'node:fs'; import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
const BASE='/Users/lucille/greenguard-usa-web/play/razorfin';
globalThis.window=globalThis; globalThis.devicePixelRatio=3;
vm.runInThisContext(fs.readFileSync(BASE+'/data.js','utf8'),{filename:'data.js'});
await import(pathToFileURL(BASE+'/shark3d.js'));
const A=globalThis.RF.Art3D; await A.preload();
const KEYS=['greatwhite_cy','thresher','tigershark','whaler','sharky'];
for(const k of KEYS){
  const t=A.residentTemplates().find(x=>x.key===k);
  if(!t) continue;
  t.scene.updateMatrixWorld(true);
  const pts=[];
  t.scene.traverse(o=>{ if(!o.isMesh||!o.geometry?.attributes?.position)return;
    const pos=o.geometry.attributes.position;
    const step=Math.max(1,Math.floor(pos.count/8000));
    for(let i=0;i<pos.count;i+=step){
      pts.push(new THREE.Vector3().fromBufferAttribute(pos,i).applyMatrix4(o.matrixWorld));} });
  const box=new THREE.Box3(); for(const p of pts) box.expandByPoint(p);
  const sz=box.getSize(new THREE.Vector3());
  const BINS=12;
  const loY=new Array(BINS).fill(Infinity),hiY=new Array(BINS).fill(-Infinity);
  const loZ=new Array(BINS).fill(Infinity),hiZ=new Array(BINS).fill(-Infinity);
  const cnt=new Array(BINS).fill(0);
  for(const p of pts){ let b=Math.floor((p.x-box.min.x)/(sz.x||1)*BINS); b=Math.max(0,Math.min(BINS-1,b));
    cnt[b]++; if(p.y<loY[b])loY[b]=p.y; if(p.y>hiY[b])hiY[b]=p.y;
    if(p.z<loZ[b])loZ[b]=p.z; if(p.z>hiZ[b])hiZ[b]=p.z; }
  console.log('=== '+k+'  bbox x['+box.min.x.toFixed(2)+','+box.max.x.toFixed(2)+']');
  const H=[],D=[],S=[];
  for(let b=0;b<BINS;b++){ const h=cnt[b]?hiY[b]-loY[b]:0, d=cnt[b]?hiZ[b]-loZ[b]:0;
    H.push(h.toFixed(3)); D.push(d.toFixed(3)); S.push((d/Math.max(h,1e-6)).toFixed(2)); }
  console.log('  bin(-X..+X) height', H.join(' '));
  console.log('  bin(-X..+X) depth ', D.join(' '));
  console.log('  bin solidity d/h  ', S.join(' '));
  console.log('  cnt               ', cnt.join(' '));
}
