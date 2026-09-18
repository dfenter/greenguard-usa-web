import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
globalThis.self=globalThis; globalThis.window=globalThis;
const HERE=path.dirname(fileURLToPath(import.meta.url));
const THREE=await import('three');
const {GLTFLoader}=await import(path.join(HERE,'../../_shared/three/GLTFLoader.js'));
const load=(f)=>new Promise((r,j)=>{const b=fs.readFileSync(f);new GLTFLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',r,j);});
for(const f of process.argv.slice(2)){
  const g=await load(f); let m=null; g.scene.traverse(o=>{if(!m&&o.isSkinnedMesh)m=o;});
  const geo=m.geometry, idx=geo.getIndex().array, N=geo.getAttribute('position').count;
  const pos=geo.getAttribute('position');
  // union by INDEX
  const par=new Int32Array(N); for(let i=0;i<N;i++)par[i]=i;
  const find=(a)=>{while(par[a]!==a){par[a]=par[par[a]];a=par[a];}return a;};
  const uni=(a,b)=>{a=find(a);b=find(b);if(a!==b)par[a]=b;};
  for(let t=0;t<idx.length;t+=3){uni(idx[t],idx[t+1]);uni(idx[t+1],idx[t+2]);}
  const sz={};for(const v of new Set(idx)){const r=find(v);sz[r]=(sz[r]||0)+1;}
  const nIdx=Object.keys(sz).length;
  // union by POSITION (weld coincident verts first) - split verts from UV seams show as separate islands
  const key=(i)=>`${pos.getX(i).toFixed(6)},${pos.getY(i).toFixed(6)},${pos.getZ(i).toFixed(6)}`;
  const map=new Map(); const rep=new Int32Array(N);
  for(let i=0;i<N;i++){const k=key(i); if(!map.has(k))map.set(k,i); rep[i]=map.get(k);}
  const par2=new Int32Array(N); for(let i=0;i<N;i++)par2[i]=i;
  const find2=(a)=>{while(par2[a]!==a){par2[a]=par2[par2[a]];a=par2[a];}return a;};
  const uni2=(a,b)=>{a=find2(rep[a]);b=find2(rep[b]);if(a!==b)par2[a]=b;};
  for(let t=0;t<idx.length;t+=3){uni2(idx[t],idx[t+1]);uni2(idx[t+1],idx[t+2]);}
  const sz2={};for(const v of new Set(idx)){const r=find2(rep[v]);sz2[r]=(sz2[r]||0)+1;}
  const c2=Object.values(sz2).sort((a,b)=>b-a);
  console.log(`${path.basename(f).padEnd(22)} verts=${N} tris=${idx.length/3} islandsByIndex=${nIdx} islandsByPosition=${c2.length} largest=${c2[0]} (${(100*c2[0]/N).toFixed(1)}%) top5=${c2.slice(0,5).join(',')}`);
}
