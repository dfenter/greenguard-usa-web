import * as THREE from 'three';
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path';
import { pathToFileURL } from 'node:url';
globalThis.window=globalThis;globalThis.devicePixelRatio=3;
vm.runInThisContext(fs.readFileSync('data.js','utf8'),{filename:'data.js'});
const m=await import(pathToFileURL(path.resolve('shark3d.js')));
const A=globalThis.RF.Art3D||m.Art3D; await A.preload();
const def=globalThis.RFD.SHARKS.find(s=>s.id==='greatwhite');
const rec=A.buildShark(def); const g=rec.group;
g.updateMatrixWorld(true);
// where is the actual CAUDAL FIN? find extreme -x vertices
const meshes=[];g.traverse(o=>{if(o.isMesh&&o.geometry?.attributes?.position)meshes.push(o);});
const _v=new THREE.Vector3();
const skin=(o,i)=>{_v.fromBufferAttribute(o.geometry.attributes.position,i);
 if(o.isSkinnedMesh&&o.applyBoneTransform)o.applyBoneTransform(i,_v);
 return _v.clone().applyMatrix4(o.matrixWorld);};
// skinning weights: which bone dominates the rear-most vertices?
const body=meshes.find(o=>o.isSkinnedMesh);
const si=body.geometry.attributes.skinIndex, sw=body.geometry.attributes.skinWeight;
const pos=body.geometry.attributes.position;
let rear=[],xs=[];
for(let i=0;i<pos.count;i++){const v=skin(body,i);xs.push({i,x:v.x});}
xs.sort((a,b)=>a.x-b.x);
const bones=body.skeleton.bones;
const cnt={};
for(let k=0;k<200;k++){const i=xs[k].i;
 for(let c=0;c<4;c++){const w=sw.getComponent(i,c); if(w>0.3){const b=bones[si.getComponent(i,c)]; cnt[b.name]=(cnt[b.name]||0)+1;}}}
console.log('rear-most 200 verts dominated by bones:',JSON.stringify(cnt));
const cnt2={};
for(let k=xs.length-200;k<xs.length;k++){const i=xs[k].i;
 for(let c=0;c<4;c++){const w=sw.getComponent(i,c); if(w>0.3){const b=bones[si.getComponent(i,c)]; cnt2[b.name]=(cnt2[b.name]||0)+1;}}}
console.log('front-most 200 verts dominated by bones:',JSON.stringify(cnt2));
console.log('skeleton bones:',bones.map(b=>b.name).join(','));
