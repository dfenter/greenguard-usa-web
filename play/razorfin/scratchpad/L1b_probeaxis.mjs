import fs from 'node:fs';
import path from 'node:path';
globalThis.self=globalThis; globalThis.window=globalThis;
const THREE=await import('three');
const {GLTFLoader}=await import('/Users/lucille/greenguard-usa-web/play/_shared/three/GLTFLoader.js');
function load(f){return new Promise((res,rej)=>{const b=fs.readFileSync(f);new GLTFLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',res,rej);});}
function sw(mesh,bi,vi){const si=mesh.geometry.getAttribute('skinIndex'),s=mesh.geometry.getAttribute('skinWeight');let w=0;for(let k=0;k<4;k++)if(si.getComponent(vi,k)===bi)w+=s.getComponent(vi,k);return w;}
for(const f of process.argv.slice(2)){
  const g=await load(f); let mesh=null; g.scene.traverse(o=>{if(!mesh&&o.isSkinnedMesh)mesh=o;});
  const bones=mesh.skeleton.bones;
  const jI=bones.findIndex(b=>b.name==='LowerJaw'), hI=bones.findIndex(b=>b.name==='Head');
  mesh.geometry.computeBoundingBox(); const bb=mesh.geometry.boundingBox;
  const size=new THREE.Vector3(); bb.getSize(size);
  const pos=mesh.geometry.getAttribute('position'), n=pos.count;
  const axes=[['x',size.x],['y',size.y],['z',size.z]].sort((a,b)=>b[1]-a[1]);
  const ai={x:0,y:1,z:2};
  const P=[]; {const v=new THREE.Vector3(); mesh.updateMatrixWorld(true);
    for(let i=0;i<n;i++){v.fromBufferAttribute(pos,i);mesh.applyBoneTransform(i,v);P.push([v.x,v.y,v.z]);}}
  for(const upName of ['x','y','z']){
    const uI=ai[upName];
    const head=[],jaw=[];
    for(let i=0;i<n;i++){const jw=sw(mesh,jI,i),hw=sw(mesh,hI,i); if(jw>0.5)jaw.push(i); else if(hw>0.1)head.push(i);}
    let mn=Infinity,mx=-Infinity;
    for(const i of (head.length?head:jaw).concat(jaw)){mn=Math.min(mn,P[i][uI]);mx=Math.max(mx,P[i][uI]);}
    const hh=(mx-mn)||1e-6; let lip=0;
    for(let i=0;i<n;i++){const jw=sw(mesh,jI,i); if(jw>0.4&&(P[i][uI]-mn)/hh<=0.15)lip++;}
    console.log(path.basename(f),'up='+upName,(upName===axes[1][0]?'<-PROBE PICKS':'            '),'lip15%='+lip,'size='+size[upName].toFixed(4));
  }
}
