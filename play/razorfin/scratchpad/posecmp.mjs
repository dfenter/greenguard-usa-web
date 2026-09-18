import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
globalThis.self=globalThis; globalThis.window=globalThis;
const HERE=path.dirname(fileURLToPath(import.meta.url));
const THREE=await import('three');
const {GLTFLoader}=await import(path.join(HERE,'../../_shared/three/GLTFLoader.js'));
const load=(f)=>new Promise((r,j)=>{const b=fs.readFileSync(f);new GLTFLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',r,j);});
for(const f of process.argv.slice(2)){
const g=await load(f); let m=null; g.scene.traverse(o=>{if(!m&&o.isSkinnedMesh)m=o;});
const geo=m.geometry,pa=geo.getAttribute('position'),N=pa.count,idx=geo.getIndex().array;
const jb=m.skeleton.bones.find(b=>b.name==='LowerJaw'); const bq=jb.quaternion.clone();
const bake=()=>{m.updateMatrixWorld(true);const o=new Float32Array(N*3),v=new THREE.Vector3();
 for(let i=0;i<N;i++){v.fromBufferAttribute(pa,i);m.applyBoneTransform(i,v);o[3*i]=v.x;o[3*i+1]=v.y;o[3*i+2]=v.z;}return o;};
// pose A: identity jaw (what Blender considers bind)
jb.quaternion.set(0,0,0,1);jb.updateMatrixWorld(true);const ident=bake();
// pose B: GLB bind quat (what the probe calls rest)
jb.quaternion.copy(bq);jb.updateMatrixWorld(true);const bind=bake();
const eL=(A,p,q)=>Math.hypot(A[3*p]-A[3*q],A[3*p+1]-A[3*q+1],A[3*p+2]-A[3*q+2]);
const seen=new Set();let n=0,shrunk=0,worstR=1,wp=-1,wq=-1;
for(let t=0;t<idx.length;t+=3){const T=[idx[t],idx[t+1],idx[t+2]];
 for(const [p,q] of [[T[0],T[1]],[T[1],T[2]],[T[2],T[0]]]){const k=p<q?p*1e7+q:q*1e7+p;if(seen.has(k))continue;seen.add(k);
  const a=eL(ident,p,q),b=eL(bind,p,q);if(a<1e-9||b<1e-9)continue;n++;const r=a/b;
  if(r>1.5)shrunk++; if(r>worstR){worstR=r;wp=p;wq=q;}}}
console.log(`${path.basename(f).padEnd(20)} edges=${n} shrunkBy>1.5x_at_bind=${shrunk} worstShrink=${worstR.toFixed(1)}x (v${wp},v${wq})`);
}
