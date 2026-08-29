import fs from 'node:fs'; import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
const BASE='/Users/lucille/greenguard-usa-web/play/razorfin';
globalThis.window=globalThis; globalThis.devicePixelRatio=3;
vm.runInThisContext(fs.readFileSync(BASE+'/data.js','utf8'),{filename:'data.js'});
await import(pathToFileURL(BASE+'/shark3d.js'));
const A=globalThis.RF.Art3D; await A.preload();
/* Ground truth by eye for the four approved bakes + reference. */
const TRUTH={sharky:+1,greatwhite_cy:+1,thresher:-1,tigershark:-1,whaler:+1};
/* CUE: the GIRTH PEAK.  A shark's maximum cross-section sits just behind
 * the head (pectoral girdle), well forward of mid-body; the tail tapers
 * monotonically.  So the centroid of the cross-section-area profile lies on
 * the HEAD side of centre.  Report it for all 29 models. */
const rows=[];
for(const t of A.residentTemplates()){
  t.scene.updateMatrixWorld(true);
  const pts=[];
  t.scene.traverse(o=>{ if(!o.isMesh||!o.geometry?.attributes?.position)return;
    const pos=o.geometry.attributes.position;
    for(let i=0;i<pos.count;i++) pts.push(new THREE.Vector3().fromBufferAttribute(pos,i).applyMatrix4(o.matrixWorld)); });
  if(pts.length<50) continue;
  const box=new THREE.Box3(); for(const p of pts) box.expandByPoint(p);
  const sz=box.getSize(new THREE.Vector3());
  const BINS=10; const s=[]; for(let i=0;i<BINS;i++) s.push({ly:1e9,hy:-1e9,lz:1e9,hz:-1e9,n:0});
  for(const p of pts){ let b=Math.floor((p.x-box.min.x)/(sz.x||1)*BINS); b=Math.max(0,Math.min(BINS-1,b));
    const q=s[b]; q.n++; if(p.y<q.ly)q.ly=p.y; if(p.y>q.hy)q.hy=p.y; if(p.z<q.lz)q.lz=p.z; if(p.z>q.hz)q.hz=p.z; }
  const prof=s.map(q=>q.n?(q.hy-q.ly)*(q.hz-q.lz):0);
  const mx=Math.max(...prof)||1; const np=prof.map(v=>v/mx);
  const arg=np.indexOf(1);
  // area-weighted centroid, in [-1,+1] about the middle
  let wsum=0,w=0; for(let i=0;i<BINS;i++){ wsum+=np[i]*((i+0.5)/BINS*2-1); w+=np[i]; }
  const cen=w?wsum/w:0;
  rows.push({key:t.key,arg,cen:+cen.toFixed(3),truth:TRUTH[t.key]||0,prof:np.map(v=>v.toFixed(2)).join(' ')});
}
rows.sort((a,b)=>a.cen-b.cen);
for(const r of rows){
  const pick=r.cen>0?1:-1;
  const mark=r.truth? (pick===r.truth?'MATCH':'** MISS') : '';
  console.log(r.key.padEnd(17),'argmax',r.arg,'centroid',String(r.cen).padStart(7),
    'pick',pick>0?'+X':'-X', mark.padEnd(9), r.prof);
}
