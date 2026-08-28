import fs from 'node:fs'; import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
const BASE='/Users/lucille/greenguard-usa-web/play/razorfin';
globalThis.window = globalThis; globalThis.devicePixelRatio = 3;
vm.runInThisContext(fs.readFileSync(BASE+'/data.js','utf8'), {filename:'data.js'});
await import(pathToFileURL(BASE+'/shark3d.js'));
const A = globalThis.RF.Art3D;
await A.preload();
const tpl = A.residentTemplates();

function meshVerts(t){
  const out=[]; const v=new THREE.Vector3();
  t.scene.updateMatrixWorld(true);
  t.scene.traverse((o)=>{ if(!o.isMesh||o.userData.rfExcludeFromBounds) return;
    const p=o.geometry?.attributes?.position; if(!p) return;
    for(let i=0;i<p.count;i++) out.push(v.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld).clone()); });
  return out;
}
const med=(a)=>{ if(!a.length) return 0; const s=a.slice().sort((x,y)=>x-y); const m=s.length>>1;
  return s.length%2?s[m]:(s[m-1]+s[m])/2; };

/* DORSAL SPIKE, done properly.
 * Slice the mid-60% of the long axis into bins. In each bin the body's
 * centreline is the MEDIAN of the transverse coord (robust to a one-sided
 * fin, unlike the mean or the bbox centre). The dorsal fin is the direction
 * in which the extreme sticks out furthest BEYOND that centreline, summed
 * over bins. Pectorals are paired and cancel; a dorsal fin does not. */
function spike(V, bb, sz, axisKey){
  const NB=12, x0=bb.min.x+sz.x*0.2, x1=bb.min.x+sz.x*0.8;
  const bins=Array.from({length:NB},()=>[]);
  for(const p of V){ if(p.x<x0||p.x>x1) continue;
    let bi=Math.floor((p.x-x0)/((x1-x0)||1)*NB); bi=Math.max(0,Math.min(NB-1,bi));
    bins[bi].push(p); }
  let sPos=0,sNeg=0,n=0;
  for(const b of bins){ if(b.length<8) continue;
    const c=med(b.map(p=>p[axisKey]));
    let mx=0,mn=0;
    for(const p of b){ const d=p[axisKey]-c; if(d>mx)mx=d; if(-d>mn)mn=-d; }
    sPos+=mx; sNeg+=mn; n++; }
  if(!n) return {pos:0,neg:0,score:0};
  sPos/=n; sNeg/=n;
  return {pos:sPos, neg:sNeg, score:(sPos-sNeg)/Math.max(sPos+sNeg,1e-6)};
}
/* Skewness fallback for degenerate (short-finned) bakes: third moment of the
 * transverse distribution about its median. A dorsal side has a long thin
 * tail of vertices; the belly is blunt. */
function skew(V, bb, sz, axisKey){
  const x0=bb.min.x+sz.x*0.2, x1=bb.min.x+sz.x*0.8;
  const vals=[]; for(const p of V){ if(p.x<x0||p.x>x1) continue; vals.push(p[axisKey]); }
  if(vals.length<32) return 0;
  const c=med(vals); let m2=0,m3=0;
  for(const q of vals){ const d=q-c; m2+=d*d; m3+=d*d*d; }
  m2/=vals.length; m3/=vals.length;
  const s=Math.sqrt(m2); return s>1e-9 ? m3/(s*s*s) : 0;
}
const rows=[];
for(const t of tpl){
  const V=meshVerts(t); if(!V.length) continue;
  const bb=new THREE.Box3(); for(const p of V) bb.expandByPoint(p);
  const sz=bb.getSize(new THREE.Vector3());
  const sy=spike(V,bb,sz,'y'), sz_=spike(V,bb,sz,'z');
  const ky=skew(V,bb,sz,'y'), kz=skew(V,bb,sz,'z');
  rows.push({key:t.key, sz:[sz.x,sz.y,sz.z].map(n=>+n.toFixed(3)),
    spikeY:+sy.score.toFixed(3), spikeZ:+sz_.score.toFixed(3),
    skewY:+ky.toFixed(3), skewZ:+kz.toFixed(3)});
}
rows.sort((a,b)=>a.key<b.key?-1:1);
console.log('key'.padEnd(16),'spikeY'.padStart(7),'spikeZ'.padStart(7),'skewY'.padStart(7),'skewZ'.padStart(7),'  verdict');
for(const r of rows){
  const useY=Math.abs(r.spikeY)>=Math.abs(r.spikeZ);
  const s=useY?r.spikeY:r.spikeZ, ax=useY?'Y':'Z';
  const degen=Math.abs(s)<0.08;
  const k=useY?r.skewY:r.skewZ;
  const sign=degen ? (k>0?'+':'-') : (s>0?'+':'-');
  console.log(r.key.padEnd(16), String(r.spikeY).padStart(7), String(r.spikeZ).padStart(7),
    String(r.skewY).padStart(7), String(r.skewZ).padStart(7),
    '  up='+sign+ax, degen?'(DEGEN->skew)':'');
}
fs.writeFileSync(BASE+'/scratchpad/orient/spike.json', JSON.stringify(rows,null,2));
