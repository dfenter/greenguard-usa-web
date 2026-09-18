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
  const jawIdx=m.skeleton.bones.indexOf(jb);
  jb.quaternion.copy(bq);jb.updateMatrixWorld(true); const rest=baked(m);
  jb.quaternion.copy(bq);jb.rotateOnAxis(AXIS,OPEN);jb.updateMatrixWorld(true); const open=baked(m);
  const geo=m.geometry, idx=geo.getIndex().array, N=geo.getAttribute('position').count;
  const si=geo.getAttribute('skinIndex'), sw=geo.getAttribute('skinWeight');
  const jw=new Float32Array(N);
  for(let i=0;i<N;i++){let w=0;for(let k=0;k<4;k++){if(si.getComponent(i,k)===jawIdx)w+=sw.getComponent(i,k);}jw[i]=w;}
  const ys=[];for(let i=0;i<N;i++)ys.push(rest[3*i+1]);
  const ymin=Math.min(...ys),ymax=Math.max(...ys),L=ymax-ymin;
  const xs=[];for(let i=0;i<N;i++)xs.push(rest[3*i]); const xmin=Math.min(...xs),xmax=Math.max(...xs);
  const eL=(A,p,q)=>Math.hypot(A[3*p]-A[3*q],A[3*p+1]-A[3*q+1],A[3*p+2]-A[3*q+2]);
  const seen=new Set(); const bad=[]; let worst=1,wi=null; let allE=0;
  for(let t=0;t<idx.length;t+=3){const T=[idx[t],idx[t+1],idx[t+2]];
    for(const [p,q] of [[T[0],T[1]],[T[1],T[2]],[T[2],T[0]]]){
      const k=p<q?p*1e7+q:q*1e7+p; if(seen.has(k))continue; seen.add(k); allE++;
      const r=eL(rest,p,q); if(r<1e-6)continue; const st=eL(open,p,q)/r;
      const rec={st,p,q,dW:Math.abs(jw[p]-jw[q]),wa:jw[p],wb:jw[q],
        yFrac:((rest[3*p+1]+rest[3*q+1])/2-ymin)/L,
        xFrac:((rest[3*p]+rest[3*q])/2-xmin)/(xmax-xmin),
        relLen:r/L};
      if(st>worst){worst=st;wi=rec;}
      if(st>3)bad.push(rec);
    }}
  bad.sort((a,b)=>b.st-a.st);
  console.log(`\n=== ${path.basename(f)} L=${L.toFixed(4)} edges=${allE} bad=${bad.length}`);
  console.log(`  worst=${worst.toFixed(2)} dW=${wi.dW.toFixed(3)} (${wi.wa.toFixed(3)}|${wi.wb.toFixed(3)}) yFrac=${wi.yFrac.toFixed(3)} xFrac=${wi.xFrac.toFixed(3)} relLen=${wi.relLen.toExponential(2)}`);
  const relLens=bad.map(b=>b.relLen).sort((a,b)=>a-b);
  const dWs=bad.map(b=>b.dW).sort((a,b)=>a-b);
  const allRel=[]; {const s2=new Set(); for(let t=0;t<idx.length;t+=3){const T=[idx[t],idx[t+1],idx[t+2]];
    for(const [p,q] of [[T[0],T[1]],[T[1],T[2]],[T[2],T[0]]]){const k=p<q?p*1e7+q:q*1e7+p;if(s2.has(k))continue;s2.add(k);const r=eL(rest,p,q)/L;if(r>1e-9)allRel.push(r);}}}
  allRel.sort((a,b)=>a-b);
  console.log(`  bad relLen med=${relLens[relLens.length>>1].toExponential(2)} min=${relLens[0].toExponential(2)} max=${relLens[relLens.length-1].toExponential(2)}`);
  console.log(`  ALL  relLen med=${allRel[allRel.length>>1].toExponential(2)} p3=${allRel[Math.floor(allRel.length*0.03)].toExponential(2)}`);
  console.log(`  bad dW med=${dWs[dWs.length>>1].toFixed(3)} min=${dWs[0].toFixed(3)} max=${dWs[dWs.length-1].toFixed(3)}`);
  console.log(`  top8: ${bad.slice(0,8).map(b=>`${b.st.toFixed(1)}x[dW${b.dW.toFixed(2)} y${b.yFrac.toFixed(2)} len${b.relLen.toExponential(1)}]`).join(' ')}`);
  // how many bad edges would survive a perfect dW cap? predicted stretch with dW capped
  const arm = (()=>{ // approx arm = max distance of jaw-weighted vert from hinge
    const hp=new THREE.Vector3().setFromMatrixPosition(jb.matrixWorld); let mx=0;
    for(let i=0;i<N;i++) if(jw[i]>0.5){const d=Math.hypot(rest[3*i]-hp.x,rest[3*i+1]-hp.y,rest[3*i+2]-hp.z); if(d>mx)mx=d;} return mx;})();
  console.log(`  arm=${(arm/L).toFixed(3)}L  chord=${(2*Math.sin(OPEN/2)).toFixed(3)}`);
  // predicted worst stretch if dW <= BUDGET*rest/arm with BUDGET=1.6
  let pw=0; for(const b of bad){const allowed=1.6*(b.relLen*L)/arm; const pred=1+Math.min(b.dW,allowed)*2*Math.sin(OPEN/2)*arm/(b.relLen*L); if(pred>pw)pw=pred;}
  console.log(`  predicted worst after ideal cap = ${pw.toFixed(3)}x`);
}
