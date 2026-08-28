import fs from 'node:fs'; import vm from 'node:vm'; import * as THREE from 'three';
globalThis.window = globalThis;
const dir='/Users/lucille/greenguard-usa-web/play/razorfin/';
vm.runInThisContext(fs.readFileSync(dir+'data.js','utf8'),{filename:'data.js'});
globalThis.fetch = async (u) => { const b = fs.readFileSync(dir+u); return { ok:true, arrayBuffer: async()=> b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength) }; };
const A = (await import(dir+'fish3d.js')).default;
await A.preloadFish();
const g = A.buildFish(globalThis.RFD.CREATURES.find(d=>d.id==='tuna')).geometry;
const p=g.getAttribute('position'), n=g.getAttribute('normal'), idx=g.getIndex();
// Compare each stored normal against the geometric face normal of a face it belongs to.
const faceN = new Array(p.count).fill(null);
const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),ab=new THREE.Vector3(),ac=new THREE.Vector3(),cr=new THREE.Vector3();
for(let f=0; f<idx.count; f+=3){
  const i0=idx.getX(f), i1=idx.getX(f+1), i2=idx.getX(f+2);
  a.fromBufferAttribute(p,i0); b.fromBufferAttribute(p,i1); c.fromBufferAttribute(p,i2);
  ab.subVectors(b,a); ac.subVectors(c,a); cr.crossVectors(ab,ac).normalize();
  for(const i of [i0,i1,i2]) if(!faceN[i]) faceN[i]=cr.clone();
}
let flipped=0, zero=0; const bad=[];
const v=new THREE.Vector3();
for(let i=0;i<p.count;i++){
  v.fromBufferAttribute(n,i);
  if(v.lengthSq()<1e-6){zero++;continue;}
  if(!faceN[i])continue;
  const d=v.normalize().dot(faceN[i]);
  if(d < -0.3){flipped++; if(bad.length<10)bad.push([i,d.toFixed(2),p.getX(i).toFixed(2),p.getY(i).toFixed(2),p.getZ(i).toFixed(2)]);}
}
console.log('verts',p.count,'zeroNormals',zero,'flippedVsFace',flipped);
console.log(bad);
