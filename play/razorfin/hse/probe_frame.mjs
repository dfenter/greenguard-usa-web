import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path';
import { fileURLToPath } from 'node:url'; import * as THREE from 'three';
const BASE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
globalThis.window = globalThis; globalThis.devicePixelRatio = 3;
vm.runInThisContext(fs.readFileSync(path.join(BASE, 'data.js'), 'utf8'), { filename: 'data.js' });
const { default: Art3D } = await import('../shark3d.js');
const rows = globalThis.RFD?.SHARKS || [];
const def = rows.find((d) => d.id === (process.env.ID || 'reef'));
const rig = Art3D.buildShark(def); const g = rig.group; g.updateMatrixWorld(true);
const body = rig.parts.body;
const geo = body.geometry, pos = geo.getAttribute('position');
const si = geo.getAttribute('skinIndex'), sw = geo.getAttribute('skinWeight');
const bones = body.skeleton.bones;
const hi = bones.findIndex(b=>b.name==='Head'), ti = bones.findIndex(b=>b.name==='Tail3');
const p = new THREE.Vector3(); body.updateMatrixWorld(true);
const all=[],hw=[],tw=[]; let mh=0,mt=0;
for(let i=0;i<pos.count;i++){p.fromBufferAttribute(pos,i);body.applyBoneTransform(i,p);
  const w=p.clone().applyMatrix4(body.matrixWorld); all.push({s:p.clone(),w});
  let a=0,b=0;for(let k=0;k<4;k++){const bi=si.getComponent(i,k),v=sw.getComponent(i,k);if(bi===hi)a+=v;else if(bi===ti)b+=v;}
  hw.push(a);tw.push(b);mh=Math.max(mh,a);mt=Math.max(mt,b);}
const hc=Math.min(0.5,mh*0.55),tc=Math.min(0.5,mt*0.55);
const head=all.filter((_,i)=>hw[i]>hc), tail=all.filter((_,i)=>tw[i]>tc);
const cenS=(L)=>{const v=new THREE.Vector3();for(const q of L)v.add(q.s);return v.divideScalar(L.length||1);};
const cenW=(L)=>{const v=new THREE.Vector3();for(const q of L)v.add(q.w);return v.divideScalar(L.length||1);};
console.log('head centroid  skinned',cenS(head).toArray().map(v=>v.toFixed(3)),'world',cenW(head).toArray().map(v=>v.toFixed(1)));
console.log('tail centroid  skinned',cenS(tail).toArray().map(v=>v.toFixed(3)),'world',cenW(tail).toArray().map(v=>v.toFixed(1)));
const fwd=cenS(head).clone().sub(cenS(tail)).normalize();
// map skinned dirs to world dirs (rotation only)
const m3=new THREE.Matrix3().setFromMatrix4(body.matrixWorld);
const toW=(v)=>v.clone().applyMatrix3(m3).normalize();
console.log('fwd  skinned',fwd.toArray().map(v=>v.toFixed(3)),'-> world',toW(fwd).toArray().map(v=>v.toFixed(3)));
// up
let mx=0,my=0,mz=0,mw=0;for(const q of all){mx+=q.s.x;my+=q.s.y;mz+=q.s.z;mw+=q.w.y;}
const n=all.length;mx/=n;my/=n;mz/=n;mw/=n;
let vw=0;const cov=[0,0,0],va=[0,0,0];
for(const q of all){const d=[q.s.x-mx,q.s.y-my,q.s.z-mz],w=q.w.y-mw;vw+=w*w;for(let a=0;a<3;a++){cov[a]+=d[a]*w;va[a]+=d[a]*d[a];}}
let best=0,bs=-1,cr=[0,0,0];for(let a=0;a<3;a++){cr[a]=cov[a]/Math.sqrt(Math.max(va[a]*vw,1e-18));if(Math.abs(cr[a])>bs){bs=Math.abs(cr[a]);best=a;}}
console.log('up correlations',cr.map(v=>v.toFixed(3)),'picked axis',best);
const upv=new THREE.Vector3();upv.setComponent(best,cr[best]>=0?1:-1);
const up=upv.clone().addScaledVector(fwd,-upv.dot(fwd)).normalize();
const side=new THREE.Vector3().crossVectors(fwd,up).normalize();
console.log('up   skinned',up.toArray().map(v=>v.toFixed(3)),'-> world',toW(up).toArray().map(v=>v.toFixed(3)));
console.log('side skinned',side.toArray().map(v=>v.toFixed(3)),'-> world',toW(side).toArray().map(v=>v.toFixed(3)));
// extents of head along side
let lo=Infinity,hiA=-Infinity;const hcen=cenS(head);
for(const q of head){const d=q.s.clone().sub(hcen).dot(side);lo=Math.min(lo,d);hiA=Math.max(hiA,d);}
console.log('head extent along side',lo.toFixed(4),hiA.toFixed(4));
// What does the Head bone itself say?
const head3 = bones.find(b=>b.name==='Head'), neck=bones.find(b=>b.name==='Neck'), jaw=bones.find(b=>b.name==='LowerJaw');
const wp=(b)=>new THREE.Vector3().setFromMatrixPosition(b.matrixWorld);
console.log('\nBONE world positions: Head',wp(head3).toArray().map(v=>v.toFixed(1)),
  'Neck',wp(neck).toArray().map(v=>v.toFixed(1)),'LowerJaw',wp(jaw).toArray().map(v=>v.toFixed(1)));
console.log('Neck->Head world dir', wp(head3).clone().sub(wp(neck)).normalize().toArray().map(v=>v.toFixed(3)));
// Head bone local axes in world
const hm=new THREE.Matrix3().setFromMatrix4(head3.matrixWorld);
for (const [n,v] of [['X',new THREE.Vector3(1,0,0)],['Y',new THREE.Vector3(0,1,0)],['Z',new THREE.Vector3(0,0,1)]])
  console.log('Head local '+n+' -> world', v.clone().applyMatrix3(hm).normalize().toArray().map(x=>x.toFixed(3)));
