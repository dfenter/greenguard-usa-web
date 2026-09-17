import fs from 'node:fs'; import path from 'node:path';
globalThis.self=globalThis; globalThis.window=globalThis;
const THREE=await import('three');
const {GLTFLoader}=await import('/Users/lucille/greenguard-usa-web/play/_shared/three/GLTFLoader.js');
function load(f){return new Promise((r,j)=>{const b=fs.readFileSync(f);new GLTFLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',r,j);});}
function sw(m,bi,vi){const si=m.geometry.getAttribute('skinIndex'),s=m.geometry.getAttribute('skinWeight');let w=0;for(let k=0;k<4;k++)if(si.getComponent(vi,k)===bi)w+=s.getComponent(vi,k);return w;}
function bake(m){m.updateMatrixWorld(true);const p=m.geometry.getAttribute('position');const o=[];const v=new THREE.Vector3();
 for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i);m.applyBoneTransform(i,v);o.push([v.x,v.y,v.z]);}return o;}
for(const f of process.argv.slice(2)){
  const g=await load(f); let m=null; g.scene.traverse(o=>{if(!m&&o.isSkinnedMesh)m=o;});
  const B=m.skeleton.bones, jI=B.findIndex(b=>b.name==='LowerJaw'); const jb=B[jI];
  jb.rotation.x=0; jb.updateMatrixWorld(true); const R=bake(m);
  jb.rotation.x=0.72; jb.updateMatrixWorld(true); const O=bake(m);
  // full-weight jaw verts only
  const idx=[]; for(let i=0;i<R.length;i++) if(sw(m,jI,i)>0.9) idx.push(i);
  const idx5=[]; for(let i=0;i<R.length;i++) if(sw(m,jI,i)>0.5) idx5.push(i);
  const D=i=>Math.hypot(O[i][0]-R[i][0],O[i][1]-R[i][1],O[i][2]-R[i][2]);
  const st=a=>a.length?{n:a.length,min:Math.min(...a.map(D)).toFixed(4),max:Math.max(...a.map(D)).toFixed(4)}:{n:0};
  console.log(path.basename(f),'w>0.9',JSON.stringify(st(idx)),'w>0.5',JSON.stringify(st(idx5)));
}
