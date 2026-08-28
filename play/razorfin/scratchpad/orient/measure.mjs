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
console.log('templates:', tpl.length);

function meshVerts(t){
  const out=[]; const v=new THREE.Vector3();
  t.scene.updateMatrixWorld(true);
  t.scene.traverse((o)=>{ if(!o.isMesh||o.userData.rfExcludeFromBounds) return;
    const p=o.geometry?.attributes?.position; if(!p) return;
    for(let i=0;i<p.count;i++){ out.push(v.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld).clone()); } });
  return out;
}
const rows=[];
for(const t of tpl){
  const V=meshVerts(t); if(!V.length){ console.log(t.key,'NO VERTS'); continue; }
  const bb=new THREE.Box3(); for(const p of V) bb.expandByPoint(p);
  const sz=bb.getSize(new THREE.Vector3()), c=bb.getCenter(new THREE.Vector3());
  // mid-60% one-sided extents about the centre, in the POST-prepareTemplate frame
  const x0=bb.min.x+sz.x*0.2, x1=bb.min.x+sz.x*0.8;
  let py=0,ny=0,pz=0,nz=0;
  for(const p of V){ if(p.x<x0||p.x>x1) continue;
    const dy=p.y-c.y, dz=p.z-c.z;
    if(dy>py)py=dy; if(-dy>ny)ny=-dy; if(dz>pz)pz=dz; if(-dz>nz)nz=-dz; }
  // girth profile along x (20 bins), normalized radius
  const nb=20, girth=new Float64Array(nb), cnt=new Float64Array(nb);
  for(const p of V){ let bi=Math.floor((p.x-bb.min.x)/(sz.x||1)*nb); bi=Math.max(0,Math.min(nb-1,bi));
    const r=Math.hypot((p.y-c.y)/(sz.y||1),(p.z-c.z)/(sz.z||1)); if(r>girth[bi])girth[bi]=r; cnt[bi]++; }
  let lo=0,hi=0,loN=0,hiN=0;
  for(let i=1;i<4;i++){ if(cnt[i]){lo+=girth[i];loN++;} if(cnt[nb-1-i]){hi+=girth[nb-1-i];hiN++;} }
  lo=loN?lo/loN:0; hi=hiN?hi/hiN:0;
  rows.push({key:t.key, axis:t.axis, sz:[sz.x,sz.y,sz.z].map(n=>+n.toFixed(3)),
    ext:{py:+py.toFixed(3),ny:+ny.toFixed(3),pz:+pz.toFixed(3),nz:+nz.toFixed(3)},
    asymY:+(py-ny).toFixed(3), asymZ:+(pz-nz).toFixed(3),
    girthLo:+lo.toFixed(3), girthHi:+hi.toFixed(3),
    dorsalAsym:t.scene.userData.rfDorsalAsym||null, noseVol:t.scene.userData.rfNoseVolume||null});
}
rows.sort((a,b)=>a.key<b.key?-1:1);
console.log('key'.padEnd(16),'axis','size'.padEnd(22),'asymY'.padStart(7),'asymZ'.padStart(7),'gLo'.padStart(6),'gHi'.padStart(6),' noseGuess');
for(const r of rows){
  const noseGuess = r.girthLo>r.girthHi ? 'HEAD@-x(BAD)' : 'head@+x(ok)';
  const dors = Math.abs(r.asymY)>=Math.abs(r.asymZ) ? (r.asymY>0?'up=+Y(ok)':'up=-Y(BAD)') : (r.asymZ>0?'up=+Z(roll)':'up=-Z(roll)');
  console.log(r.key.padEnd(16), r.axis, JSON.stringify(r.sz).padEnd(22),
    String(r.asymY).padStart(7), String(r.asymZ).padStart(7),
    String(r.girthLo).padStart(6), String(r.girthHi).padStart(6), '', noseGuess, dors);
}
fs.writeFileSync(BASE+'/scratchpad/orient/measured.json', JSON.stringify(rows,null,2));
