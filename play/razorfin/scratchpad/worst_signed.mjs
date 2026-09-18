import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
globalThis.self=globalThis; globalThis.window=globalThis;
const HERE=path.dirname(fileURLToPath(import.meta.url));
const THREE=await import('three');
const {GLTFLoader}=await import(path.join(HERE,'../../_shared/three/GLTFLoader.js'));
const AXIS=new THREE.Vector3(1,0,0),OPEN=Number(process.env.OPEN ?? -0.72);
const load=(f)=>new Promise((r,j)=>{const b=fs.readFileSync(f);new GLTFLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',r,j);});
for(const f of process.argv.slice(2)){
  const g=await load(f); let m=null; g.scene.traverse(o=>{if(!m&&o.isSkinnedMesh)m=o;});
  const jb=m.skeleton.bones.find(b=>b.name==='LowerJaw'),bq=jb.quaternion.clone();
  const bn=m.skeleton.bones.map(b=>b.name), ji=bn.indexOf('LowerJaw');
  const geo=m.geometry,idx=geo.getIndex().array,N=geo.getAttribute('position').count;
  const si=geo.getAttribute('skinIndex'),sw=geo.getAttribute('skinWeight'),pa=geo.getAttribute('position');
  const bake=()=>{m.updateMatrixWorld(true);const o=new Float32Array(N*3),v=new THREE.Vector3();
    for(let i=0;i<N;i++){v.fromBufferAttribute(pa,i);m.applyBoneTransform(i,v);o[3*i]=v.x;o[3*i+1]=v.y;o[3*i+2]=v.z;}return o;};
  jb.quaternion.copy(bq);jb.updateMatrixWorld(true);const rest=bake();
  jb.quaternion.copy(bq);jb.rotateOnAxis(AXIS,OPEN);jb.updateMatrixWorld(true);const open=bake();
  const eL=(A,p,q)=>Math.hypot(A[3*p]-A[3*q],A[3*p+1]-A[3*q+1],A[3*p+2]-A[3*q+2]);
  const seen=new Set();let best=1,bp=-1,bq2=-1;
  for(let t=0;t<idx.length;t+=3){const T=[idx[t],idx[t+1],idx[t+2]];
    for(const [p,q] of [[T[0],T[1]],[T[1],T[2]],[T[2],T[0]]]){const k=p<q?p*1e7+q:q*1e7+p;if(seen.has(k))continue;seen.add(k);
      const r=eL(rest,p,q);if(r<1e-9)continue;const s=eL(open,p,q)/r;if(s>best){best=s;bp=p;bq2=q;}}}
  const dump=(i)=>{const o=[];for(let k=0;k<4;k++){const w=sw.getComponent(i,k);if(w>1e-6)o.push(`${bn[si.getComponent(i,k)]}=${w.toFixed(4)}`);}
    return `v${i} [${o.join(' ')}] pos=(${pa.getX(i).toFixed(5)},${pa.getY(i).toFixed(5)},${pa.getZ(i).toFixed(5)})`;};
  const jw=(i)=>{let w=0;for(let k=0;k<4;k++)if(si.getComponent(i,k)===ji)w+=sw.getComponent(i,k);return w;};
  const hinge=new THREE.Vector3().setFromMatrixPosition(jb.matrixWorld);
  console.log(`\n${path.basename(f)} worst=${best.toFixed(3)} restLen=${eL(rest,bp,bq2).toExponential(3)}`);
  console.log('  A: '+dump(bp)); console.log('  B: '+dump(bq2));
  console.log(`  jawW A=${jw(bp).toFixed(4)} B=${jw(bq2).toFixed(4)} dW=${Math.abs(jw(bp)-jw(bq2)).toFixed(4)}`);
  console.log(`  hingeWorld=(${hinge.x.toFixed(4)},${hinge.y.toFixed(4)},${hinge.z.toFixed(4)})`);
  const armA=Math.hypot(rest[3*bp+1]-hinge.y,rest[3*bp+2]-hinge.z),armB=Math.hypot(rest[3*bq2+1]-hinge.y,rest[3*bq2+2]-hinge.z);
  console.log(`  armA(y,z)=${armA.toFixed(5)} armB=${armB.toFixed(5)}`);
  console.log(`  travelA=${eL2(rest,open,bp)} travelB=${eL2(rest,open,bq2)}`);
  function eL2(A,B,i){return Math.hypot(B[3*i]-A[3*i],B[3*i+1]-A[3*i+1],B[3*i+2]-A[3*i+2]).toExponential(3);}
}
