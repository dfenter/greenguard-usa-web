import fs from 'node:fs'; import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
const BASE='/Users/lucille/greenguard-usa-web/play/razorfin';
globalThis.window=globalThis; globalThis.devicePixelRatio=3;
vm.runInThisContext(fs.readFileSync(BASE+'/data.js','utf8'),{filename:'data.js'});
await import(pathToFileURL(BASE+'/shark3d.js'));
const A=globalThis.RF.Art3D; await A.preload();
const med=(a)=>{const s=a.slice().sort((x,y)=>x-y),m=s.length>>1;return s.length?(s.length%2?s[m]:(s[m-1]+s[m])/2):0;};
/* PAIRED-ness, not extent.
 * A pectoral pair is SYMMETRIC: the hull reaches about equally far in +axis
 * and -axis. A dorsal fin / caudal lobe is ONE-SIDED. So for each transverse
 * axis measure how BALANCED the two reaches are, weighted by how far they go.
 * The lateral axis is the one whose far reach is balanced. */
for(const t of A.residentTemplates().sort((a,b)=>a.key<b.key?-1:1)){
  t.scene.updateMatrixWorld(true);
  const pts=[]; const v=new THREE.Vector3();
  t.scene.traverse(m=>{ if(!m.isMesh||m.userData.rfExcludeFromBounds) return;
    const p=m.geometry?.attributes?.position; if(!p) return;
    const st=Math.max(1,Math.floor(p.count/12000));
    for(let i=0;i<p.count;i+=st) pts.push(v.fromBufferAttribute(p,i).applyMatrix4(m.matrixWorld).clone()); });
  if(!pts.length) continue;
  const bb=new THREE.Box3(); for(const p of pts) bb.expandByPoint(p);
  const s=bb.getSize(new THREE.Vector3());
  const x1=bb.max.x-s.x*0.28, x0=bb.max.x-s.x*0.65;
  const band=pts.filter(p=>p.x>=x0&&p.x<=x1);
  if(band.length<40){console.log(t.key,'thin band');continue;}
  const cy=med(band.map(p=>p.y)), cz=med(band.map(p=>p.z));
  const f=(k,c)=>{let hi=0,lo=0; for(const p of band){const d=p[k]-c; if(d>hi)hi=d; if(-d>lo)lo=-d;}
    return {hi,lo,bal:Math.min(hi,lo)/Math.max(hi,lo||1e-9),span:hi+lo};};
  const Y=f('y',cy), Z=f('z',cz);
  // lateral axis = the more BALANCED one (paired fins), tie-broken by span
  const lat = Y.bal>Z.bal ? 'y':'z';
  console.log('%s  Ybal=%s(%s) Zbal=%s(%s)  lateral=%s %s',
    t.key.padEnd(16), Y.bal.toFixed(2), Y.span.toFixed(3), Z.bal.toFixed(2), Z.span.toFixed(3),
    lat, lat==='z'?'OK':'*** ROLLED ***');
}
