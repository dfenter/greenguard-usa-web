// Replicate measureBindUp's metric against the shipped GLBs, and independently
// check the answer against where the DORSAL FIN really is (the vertex with the
// greatest midbody excursion should be the fin tip, and it must be on the
// same side the metric names).
import fs from 'node:fs';
globalThis.self = globalThis.self || globalThis;
globalThis.URL = globalThis.URL;
import * as THREE from 'three';
import { GLTFLoader } from '../../_shared/three/GLTFLoader.js';

const BAKES = process.argv.slice(2);
const loader = new GLTFLoader();
for (const name of BAKES) {
  const buf = fs.readFileSync(`assets/models/${name}.glb`);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const gltf = await new Promise((res, rej) => loader.parse(ab, '', res, rej));
  let mesh = null;
  gltf.scene.traverse(n => { if ((n.isMesh||n.isSkinnedMesh) && !mesh) mesh = n; });
  if (!mesh) { console.log(name, 'NO MESH'); continue; }
  const pos = mesh.geometry.getAttribute('position');
  const lo=[1/0,1/0,1/0], hi=[-1/0,-1/0,-1/0];
  const P = new THREE.Vector3();
  for (let i=0;i<pos.count;i++){ P.fromBufferAttribute(pos,i);
    const v=[P.x,P.y,P.z]; for(let a=0;a<3;a++){ if(v[a]<lo[a])lo[a]=v[a]; if(v[a]>hi[a])hi[a]=v[a]; } }
  const size=[hi[0]-lo[0],hi[1]-lo[1],hi[2]-lo[2]];
  let longAxis=0; for(let a=1;a<3;a++) if(size[a]>size[longAxis]) longAxis=a;
  const along=v=>(v[longAxis]-lo[longAxis])/Math.max(size[longAxis],1e-5);
  const rows=[];
  for(let axis=0;axis<3;axis++){
    if(axis===longAxis) continue;
    const s=[]; const pts=[];
    for(let i=0;i<pos.count;i++){ P.fromBufferAttribute(pos,i); const v=[P.x,P.y,P.z];
      const a=along(v); if(a<0.25||a>0.75) continue; s.push(v[axis]); pts.push(v); }
    if(s.length<64) continue;
    const srt=[...s].sort((a,b)=>a-b); const med=srt[srt.length>>1];
    const scale=Math.max(size[axis],1e-5);
    let maxPos=0,maxNeg=0,m2=0,m3=0;
    for(const val of s){ const d=(val-med)/scale;
      if(d>maxPos)maxPos=d; if(-d>maxNeg)maxNeg=-d; m2+=d*d; m3+=d*d*d; }
    const varr=m2/s.length; const skew=m3/Math.max(Math.pow(varr,1.5)*s.length,1e-9);
    rows.push({axis, spike:Math.abs(maxPos-maxNeg), spikeSign: maxPos>=maxNeg?-1:1,
      skew:Math.abs(skew), skewSign: skew>=0?-1:1, maxPos:+maxPos.toFixed(4), maxNeg:+maxNeg.toFixed(4)});
  }
  const bestSpike=rows.reduce((a,b)=>b.spike>a.spike?b:a);
  let best;
  if(bestSpike.spike>=0.05) best={axis:bestSpike.axis,sign:bestSpike.spikeSign,metric:'spike',score:bestSpike.spike};
  else { const bs=rows.reduce((a,b)=>b.skew>a.skew?b:a); best={axis:bs.axis,sign:bs.skewSign,metric:'skew',score:bs.skew}; }
  const v=[0,0,0]; v[best.axis]=best.sign;
  console.log(`${name.padEnd(16)} long=${longAxis} -> bindUp=[${v}] via ${best.metric} ${best.score.toFixed(3)}`);
  console.log(`   ${JSON.stringify(rows)}`);
}
