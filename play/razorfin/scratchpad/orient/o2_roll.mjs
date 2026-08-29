import fs from 'node:fs'; import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
const BASE='/Users/lucille/greenguard-usa-web/play/razorfin';
globalThis.window=globalThis; globalThis.devicePixelRatio=3;
vm.runInThisContext(fs.readFileSync(BASE+'/data.js','utf8'),{filename:'data.js'});
await import(pathToFileURL(BASE+'/shark3d.js'));
const A=globalThis.RF.Art3D; await A.preload();
/* In the RESOLVED frame: a correct shark is TALLER than it is DEEP
 * (dorsal fin adds height); a rolled one is deeper than tall. */
const TRUTH={sharky:'OK',greatwhite_cy:'OK',thresher:'OK',tigershark:'OK',
  whitepointer:'OK',whaler:'ROLLED',dogfish:'ROLLED'};
const rows=[];
for(const t of A.residentTemplates()){
  t.scene.updateMatrixWorld(true);
  const pts=[];
  t.scene.traverse(o=>{ if(!o.isMesh||!o.geometry?.attributes?.position)return;
    const pos=o.geometry.attributes.position;
    for(let i=0;i<pos.count;i++) pts.push(new THREE.Vector3().fromBufferAttribute(pos,i).applyMatrix4(o.matrixWorld)); });
  if(pts.length<50)continue;
  const box=new THREE.Box3(); for(const p of pts) box.expandByPoint(p);
  const sz=box.getSize(new THREE.Vector3());
  // pectoral band, as the resolver defines it
  const x1=box.max.x-sz.x*0.28, x0=box.max.x-sz.x*0.65;
  const band=pts.filter(p=>p.x>=x0&&p.x<=x1);
  const med=a=>{const s=a.slice().sort((m,n)=>m-n);const k=s.length>>1;return s.length%2?s[k]:(s[k-1]+s[k])/2;};
  const bal=(ax)=>{const c=med(band.map(p=>p[ax]));let hi=0,lo=0;
    for(const p of band){const d=p[ax]-c;if(d>hi)hi=d;if(-d>lo)lo=-d;}
    return {bal:Math.min(hi,lo)/Math.max(hi,lo||1e-9),span:hi+lo};};
  const by=bal('y'), bz=bal('z');
  rows.push({key:t.key,truth:TRUTH[t.key]||'',
    hw:+(sz.y/sz.z).toFixed(3), balY:+by.bal.toFixed(3), balZ:+bz.bal.toFixed(3),
    spanY:+by.span.toFixed(3), spanZ:+bz.span.toFixed(3)});
}
rows.sort((a,b)=>a.hw-b.hw);
for(const r of rows) console.log(r.key.padEnd(17), r.truth.padEnd(7),
  'H/D',String(r.hw).padStart(6), ' balY',String(r.balY).padStart(6),' balZ',String(r.balZ).padStart(6),
  ' spanY',String(r.spanY).padStart(6),' spanZ',String(r.spanZ).padStart(6));
