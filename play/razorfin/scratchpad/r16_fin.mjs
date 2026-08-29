// Independent check of dorsal polarity: the DORSAL FIN is the tallest, most
// isolated midbody excursion. Find the extreme vertex on each side of axis 1
// and report how much body mass sits near it. A fin tip is a thin spike (few
// vertices out there); a belly is a broad bulge (many).
import fs from 'node:fs';
globalThis.self = globalThis.self || globalThis;
import * as THREE from 'three';
import { GLTFLoader } from '../../_shared/three/GLTFLoader.js';
const loader = new GLTFLoader();
for (const name of process.argv.slice(2)) {
  const buf = fs.readFileSync(`assets/models/${name}.glb`);
  const gltf = await new Promise((res, rej) =>
    loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset+buf.byteLength), '', res, rej));
  let mesh=null; gltf.scene.traverse(n=>{ if((n.isMesh||n.isSkinnedMesh)&&!mesh) mesh=n; });
  const pos=mesh.geometry.getAttribute('position'); const P=new THREE.Vector3();
  const lo=[1/0,1/0,1/0],hi=[-1/0,-1/0,-1/0];
  for(let i=0;i<pos.count;i++){P.fromBufferAttribute(pos,i);const v=[P.x,P.y,P.z];
    for(let a=0;a<3;a++){if(v[a]<lo[a])lo[a]=v[a];if(v[a]>hi[a])hi[a]=v[a];}}
  const size=[hi[0]-lo[0],hi[1]-lo[1],hi[2]-lo[2]];
  let longAxis=0; for(let a=1;a<3;a++) if(size[a]>size[longAxis]) longAxis=a;
  const A=1; // the axis every bake selected
  const mid=[];
  for(let i=0;i<pos.count;i++){P.fromBufferAttribute(pos,i);const v=[P.x,P.y,P.z];
    const al=(v[longAxis]-lo[longAxis])/size[longAxis];
    if(al>=0.25&&al<=0.75) mid.push(v);}
  const vals=mid.map(v=>v[A]).sort((a,b)=>a-b);
  const med=vals[vals.length>>1];
  // count vertices in the outer 10% of reach on each side
  const top=Math.max(...vals), bot=Math.min(...vals);
  const tBand=med+(top-med)*0.85, bBand=med-(med-bot)*0.85;
  const nTop=vals.filter(x=>x>=tBand).length, nBot=vals.filter(x=>x<=bBand).length;
  // and how far each side reaches, normalised
  console.log(`${name.padEnd(15)} reach +${((top-med)/size[A]).toFixed(3)} / -${((med-bot)/size[A]).toFixed(3)}  `+
    `verts_in_outer15%: +Y=${nTop} -Y=${nBot}  => spike(thin) side = ${nTop<nBot?'+Y':'-Y'}`);
}
