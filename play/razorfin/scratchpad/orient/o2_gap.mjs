import fs from 'node:fs'; import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
const BASE='/Users/lucille/greenguard-usa-web/play/razorfin';
globalThis.window=globalThis; globalThis.devicePixelRatio=3;
vm.runInThisContext(fs.readFileSync(BASE+'/data.js','utf8'),{filename:'data.js'});
await import(pathToFileURL(BASE+'/shark3d.js'));
const A=globalThis.RF.Art3D; await A.preload();
const TRUTH={sharky:+1,greatwhite_cy:+1,thresher:-1,tigershark:-1,whaler:+1};
/* Candidate cue: the MOUTH is an interior cavity, so near the head the mesh
 * has far more surface area per unit length than the smooth tail.  Also the
 * caudal fin is a thin SHEET.  Measure, per bin: surface area, and the
 * "sheetness" = area / (bbox cross-section).  Also thickness percentiles. */
for(const k of Object.keys(TRUTH)){
  const t=A.residentTemplates().find(x=>x.key===k); if(!t)continue;
  t.scene.updateMatrixWorld(true);
  const tris=[];
  t.scene.traverse(o=>{ if(!o.isMesh||!o.geometry?.attributes?.position)return;
    const g=o.geometry,pos=g.attributes.position,idx=g.index;
    const get=i=>new THREE.Vector3().fromBufferAttribute(pos,i).applyMatrix4(o.matrixWorld);
    const n=idx?idx.count:pos.count;
    for(let i=0;i<n;i+=3){ const a=idx?idx.getX(i):i,b=idx?idx.getX(i+1):i+1,c=idx?idx.getX(i+2):i+2;
      tris.push([get(a),get(b),get(c)]); } });
  const box=new THREE.Box3(); for(const T of tris) for(const v of T) box.expandByPoint(v);
  const sz=box.getSize(new THREE.Vector3());
  const BINS=10;
  const area=new Float64Array(BINS), zspan=[]; for(let i=0;i<BINS;i++) zspan.push({lo:1e9,hi:-1e9,ly:1e9,hy:-1e9});
  for(const T of tris){
    const c=T[0].clone().add(T[1]).add(T[2]).multiplyScalar(1/3);
    let b=Math.floor((c.x-box.min.x)/(sz.x||1)*BINS); b=Math.max(0,Math.min(BINS-1,b));
    area[b]+=T[1].clone().sub(T[0]).cross(T[2].clone().sub(T[0])).length()*0.5;
    for(const v of T){ const s=zspan[b];
      if(v.z<s.lo)s.lo=v.z; if(v.z>s.hi)s.hi=v.z; if(v.y<s.ly)s.ly=v.y; if(v.y>s.hy)s.hy=v.y; }
  }
  // "bulk" = cross-section area of the bin
  const bulk=zspan.map(s=>(s.hi-s.lo)*(s.hy-s.ly));
  const mb=Math.max(...bulk)||1, ma=Math.max(...area)||1;
  const nb=bulk.map(v=>v/mb), na=Array.from(area).map(v=>v/ma);
  const mean=(a,i0,i1)=>{let s=0;for(let i=i0;i<=i1;i++)s+=a[i];return s/(i1-i0+1);};
  // ratio area/bulk : a mouth cavity + gills raise area without raising bulk
  const r=na.map((v,i)=>v/Math.max(nb[i],1e-6));
  const loR=mean(r,1,3), hiR=mean(r,6,8);
  console.log(k.padEnd(15),'truth head at',TRUTH[k]>0?'+X':'-X',
    ' areaPerBulk lo(-X)',loR.toFixed(2),' hi(+X)',hiR.toFixed(2),
    ' pick',hiR>loR?'+X':'-X', ((hiR>loR?1:-1)===TRUTH[k])?'MATCH':'** MISS');
  console.log('    bulk',nb.map(v=>v.toFixed(2)).join(' '));
  console.log('    area',na.map(v=>v.toFixed(2)).join(' '));
}
