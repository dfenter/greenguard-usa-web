/* scratch diagnostic: dump worst stretching edges post-collapse */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
globalThis.self = globalThis; globalThis.window = globalThis;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const THREE = await import('three');
const { GLTFLoader } = await import(path.join(HERE, '../../_shared/three/GLTFLoader.js'));
const OPEN_RAD = Number(process.env.OPEN_RAD ?? 0.72);
const TOPN = Number(process.env.TOPN ?? 8);
function loadGlb(file){return new Promise((res,rej)=>{const b=fs.readFileSync(file);new GLTFLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',res,rej);});}
function baked(mesh){mesh.updateMatrixWorld(true);const pos=mesh.geometry.getAttribute('position');const out=new Float32Array(pos.count*3);const v=new THREE.Vector3();for(let i=0;i<pos.count;i++){v.fromBufferAttribute(pos,i);mesh.applyBoneTransform(i,v);out[i*3]=v.x;out[i*3+1]=v.y;out[i*3+2]=v.z;}return out;}
function w(mesh,bi,vi){const si=mesh.geometry.getAttribute('skinIndex'),sw=mesh.geometry.getAttribute('skinWeight');let s=0;for(let k=0;k<4;k++)if(si.getComponent(vi,k)===bi)s+=sw.getComponent(vi,k);return s;}
for (const file of process.argv.slice(2)) {
  const g = await loadGlb(file); let mesh=null; g.scene.traverse(o=>{if(!mesh&&o.isSkinnedMesh)mesh=o;});
  const bones=mesh.skeleton.bones; const ji=bones.findIndex(b=>b.name==='LowerJaw'); const hi=bones.findIndex(b=>b.name==='Head');
  const jaw=bones[ji];
  mesh.geometry.computeBoundingBox(); const sz=new THREE.Vector3(); mesh.geometry.boundingBox.getSize(sz);
  const L=Math.max(sz.x,sz.y,sz.z);
  jaw.rotation.x=0; jaw.updateMatrixWorld(true); const rest=baked(mesh);
  jaw.rotation.x=OPEN_RAD; jaw.updateMatrixWorld(true); const open=baked(mesh);
  const idx=mesh.geometry.getIndex().array;
  const el=(a,p,q)=>Math.hypot(a[p*3]-a[q*3],a[p*3+1]-a[q*3+1],a[p*3+2]-a[q*3+2]);
  const seen=new Set(); const rows=[];
  for(let t=0;t+2<idx.length;t+=3){const a=idx[t],b=idx[t+1],c=idx[t+2];
    for(const [p,q] of [[a,b],[b,c],[c,a]]){const k=p<q?p+':'+q:q+':'+p; if(seen.has(k))continue; seen.add(k);
      const r=el(rest,p,q); if(r<1e-9)continue; const o=el(open,p,q); rows.push({s:o/r,r,p,q});}}
  rows.sort((x,y)=>y.s-x.s);
  console.log('=== '+path.basename(file)+'  L='+L.toFixed(4)+'  edges='+rows.length);
  // how many edges above 3x, and their weight profile
  const over = rows.filter(r=>r.s>3);
  console.log('  edges>3x: '+over.length+'   edges>1.5x: '+rows.filter(r=>r.s>1.5).length);
  for(const e of rows.slice(0,TOPN)){
    const jp=w(mesh,ji,e.p), jq=w(mesh,ji,e.q), hp=w(mesh,hi,e.p), hq=w(mesh,hi,e.q);
    // full skin index/weight dump for both endpoints
    const si=mesh.geometry.getAttribute('skinIndex'),sw=mesh.geometry.getAttribute('skinWeight');
    const dump=(v)=>[0,1,2,3].map(k=>bones[si.getComponent(v,k)]?.name+':'+sw.getComponent(v,k).toFixed(3)).filter(s=>!s.endsWith(':0.000')).join(',');
    console.log(`  stretch=${e.s.toFixed(3)} rest=${(e.r/L).toExponential(2)}L jawW=${jp.toFixed(3)}/${jq.toFixed(3)} headW=${hp.toFixed(3)}/${hq.toFixed(3)}`);
    console.log(`     v${e.p}[${dump(e.p)}]  v${e.q}[${dump(e.q)}]`);
  }
}
