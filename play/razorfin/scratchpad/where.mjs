import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
globalThis.self=globalThis; globalThis.window=globalThis;
const HERE=path.dirname(fileURLToPath(import.meta.url));
const THREE=await import('three');
const {GLTFLoader}=await import(path.join(HERE,'../../_shared/three/GLTFLoader.js'));
const AXIS=new THREE.Vector3(1,0,0), OPEN=0.72;
const load=(f)=>new Promise((r,j)=>{const b=fs.readFileSync(f);new GLTFLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',r,j);});
function baked(m){m.updateMatrixWorld(true);const p=m.geometry.getAttribute('position'),o=new Float32Array(p.count*3),v=new THREE.Vector3();
for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i);m.applyBoneTransform(i,v);o[3*i]=v.x;o[3*i+1]=v.y;o[3*i+2]=v.z;}return o;}
for(const f of process.argv.slice(2)){
  const g=await load(f); let m=null; g.scene.traverse(o=>{if(!m&&o.isSkinnedMesh)m=o;});
  const jb=m.skeleton.bones.find(b=>b.name==='LowerJaw'); const bq=jb.quaternion.clone();
  jb.quaternion.copy(bq);jb.updateMatrixWorld(true); const rest=baked(m);
  jb.quaternion.copy(bq);jb.rotateOnAxis(AXIS,OPEN);jb.updateMatrixWorld(true); const open=baked(m);
  const idx=m.geometry.getIndex().array, seen=new Set();
  const eL=(A,p,q)=>Math.hypot(A[3*p]-A[3*q],A[3*p+1]-A[3*q+1],A[3*p+2]-A[3*q+2]);
  const ys=[]; for(let i=0;i<rest.length/3;i++) ys.push(rest[3*i+1]);
  const ymin=Math.min(...ys),ymax=Math.max(...ys);
  const jy=new THREE.Vector3().setFromMatrixPosition(jb.matrixWorld).y;
  const bad=[];
  for(let t=0;t<idx.length;t+=3){const T=[idx[t],idx[t+1],idx[t+2]];
    for(const [p,q] of [[T[0],T[1]],[T[1],T[2]],[T[2],T[0]]]){
      const k=p<q?p*1e7+q:q*1e7+p; if(seen.has(k))continue; seen.add(k);
      const r=eL(rest,p,q); if(r<1e-6)continue; const st=eL(open,p,q)/r;
      if(st>3) bad.push((rest[3*p+1]+rest[3*q+1])/2);
    }}
  const fr=bad.map(y=>(y-ymin)/(ymax-ymin));
  fr.sort((a,b)=>a-b);
  console.log(`${path.basename(f)} jawBoneY_frac=${((jy-ymin)/(ymax-ymin)).toFixed(3)} badEdges=${bad.length} yFrac range=[${fr[0]?.toFixed(3)}..${fr[fr.length-1]?.toFixed(3)}] median=${fr[Math.floor(fr.length/2)]?.toFixed(3)}`);
}
