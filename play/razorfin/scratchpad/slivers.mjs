import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath} from 'node:url';
globalThis.self=globalThis; globalThis.window=globalThis;
const HERE=path.dirname(fileURLToPath(import.meta.url));
const THREE=await import('three');
const {GLTFLoader}=await import(path.join(HERE,'../../_shared/three/GLTFLoader.js'));
const load=(f)=>new Promise((r,j)=>{const b=fs.readFileSync(f);new GLTFLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',r,j);});
for(const f of process.argv.slice(2)){
  const g=await load(f); let m=null; g.scene.traverse(o=>{if(!m&&o.isSkinnedMesh)m=o;});
  const geo=m.geometry,idx=geo.getIndex().array,pa=geo.getAttribute('position');
  geo.computeBoundingBox(); const s=new THREE.Vector3(); geo.boundingBox.getSize(s);
  const L=Math.max(s.x,s.y,s.z);
  const seen=new Set(),lens=[];
  for(let t=0;t<idx.length;t+=3){const T=[idx[t],idx[t+1],idx[t+2]];
    for(const [p,q] of [[T[0],T[1]],[T[1],T[2]],[T[2],T[0]]]){const k=p<q?p*1e7+q:q*1e7+p;if(seen.has(k))continue;seen.add(k);
      lens.push(Math.hypot(pa.getX(p)-pa.getX(q),pa.getY(p)-pa.getY(q),pa.getZ(p)-pa.getZ(q))/L);}}
  lens.sort((a,b)=>a-b);
  const med=lens[Math.floor(lens.length/2)];
  const under=(x)=>lens.filter(v=>v<x).length;
  console.log(path.basename(f).padEnd(20),'edges',String(lens.length).padStart(6),
    'medianL',med.toExponential(2),'min',lens[0].toExponential(2),
    ' <1e-3L:',String(under(1e-3)).padStart(4),' <5e-4L:',String(under(5e-4)).padStart(4));
}
