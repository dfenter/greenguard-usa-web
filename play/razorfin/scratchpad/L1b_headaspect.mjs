import fs from 'node:fs'; import path from 'node:path';
globalThis.self=globalThis; globalThis.window=globalThis;
const THREE=await import('three');
const {GLTFLoader}=await import('/Users/lucille/greenguard-usa-web/play/_shared/three/GLTFLoader.js');
function load(f){return new Promise((r,j)=>{const b=fs.readFileSync(f);new GLTFLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',r,j);});}
function sw(m,bi,vi){const si=m.geometry.getAttribute('skinIndex'),s=m.geometry.getAttribute('skinWeight');let w=0;for(let k=0;k<4;k++)if(si.getComponent(vi,k)===bi)w+=s.getComponent(vi,k);return w;}
for(const f of process.argv.slice(2)){
  const g=await load(f); let m=null; g.scene.traverse(o=>{if(!m&&o.isSkinnedMesh)m=o;});
  const B=m.skeleton.bones, jI=B.findIndex(b=>b.name==='LowerJaw'), hI=B.findIndex(b=>b.name==='Head');
  const pos=m.geometry.getAttribute('position'), n=pos.count;
  m.updateMatrixWorld(true); const v=new THREE.Vector3(); const P=[];
  for(let i=0;i<n;i++){v.fromBufferAttribute(pos,i);m.applyBoneTransform(i,v);P.push([v.x,v.y,v.z]);}
  const reg=[]; for(let i=0;i<n;i++){if(sw(m,jI,i)>0.5||sw(m,hI,i)>0.1)reg.push(i);}
  const e=[0,1,2].map(a=>Math.max(...reg.map(i=>P[i][a]))-Math.min(...reg.map(i=>P[i][a])));
  m.geometry.computeBoundingBox(); const s2=new THREE.Vector3(); m.geometry.boundingBox.getSize(s2);
  console.log(path.basename(f),'HEADREGION x=%s y=%s z=%s | FULLBBOX x=%s y=%s z=%s',...e.map(x=>x.toFixed(3)),s2.x.toFixed(3),s2.y.toFixed(3),s2.z.toFixed(3));
}
