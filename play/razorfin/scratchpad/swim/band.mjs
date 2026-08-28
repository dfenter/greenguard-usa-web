import * as THREE from 'three';
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path';
import { pathToFileURL } from 'node:url';
globalThis.window=globalThis; globalThis.devicePixelRatio=3;
vm.runInThisContext(fs.readFileSync('data.js','utf8'),{filename:'data.js'});
const m=await import(pathToFileURL(path.resolve('shark3d.js')));
const A=globalThis.RF.Art3D||m.Art3D; await A.preload();
const def=globalThis.RFD.SHARKS.find(s=>s.id==='greatwhite');
const rec=A.buildShark(def); const g=rec.group;
rec.animate(0,{speedFrac:0.5,turn:0,tailPhase:0,tailAmp:0.34}); g.updateMatrixWorld(true);
const meshes=[];g.traverse(o=>{if(o.isMesh&&o.geometry?.attributes?.position)meshes.push(o);});
console.log('meshes',meshes.map(o=>o.name+(o.isSkinnedMesh?'[skinned]':'')+':'+o.geometry.attributes.position.count).join(' '));
const _v=new THREE.Vector3();
function skinAt(o,i){_v.fromBufferAttribute(o.geometry.attributes.position,i);
 if(o.isSkinnedMesh&&o.applyBoneTransform)o.applyBoneTransform(i,_v);
 return _v.clone().applyMatrix4(o.matrixWorld);}
// histogram of u
const bb=new THREE.Box3().setFromObject(g);
console.log('bbox',JSON.stringify(bb.min),JSON.stringify(bb.max));
let mn=1e9,mx=-1e9;
const hist=new Array(10).fill(0);
for(const o of meshes){const pos=o.geometry.attributes.position;
 for(let i=0;i<pos.count;i+=Math.max(1,Math.floor(pos.count/3000))){
  const v=skinAt(o,i); mn=Math.min(mn,v.x);mx=Math.max(mx,v.x);}}
console.log('skinned x range',mn.toFixed(2),mx.toFixed(2));
for(const o of meshes){const pos=o.geometry.attributes.position;
 for(let i=0;i<pos.count;i+=Math.max(1,Math.floor(pos.count/3000))){
  const v=skinAt(o,i); const u=(v.x-mn)/(mx-mn); const b=Math.min(9,Math.floor(u*10)); hist[b]++;}}
console.log('u histogram',hist.join(' '));
// track rear band z over frames
const tail=[],head=[];
for(const o of meshes){const pos=o.geometry.attributes.position;
 for(let i=0;i<pos.count;i+=Math.max(1,Math.floor(pos.count/3000))){
  const v=skinAt(o,i); const u=(v.x-mn)/(mx-mn);
  if(u<=0.08)tail.push({o,i}); if(u>=0.88)head.push({o,i});}}
console.log('tail verts',tail.length,'head verts',head.length);
for(let f=0;f<12;f++){const t=f/30;
 rec.animate(t,{speedFrac:0.5,turn:0,tailPhase:t*4.0,tailAmp:0.34});
 g.updateMatrixWorld(true);
 let sz=0,sy=0;for(const e of tail){const v=skinAt(e.o,e.i);sz+=v.z;sy+=v.y;}
 let hz2=0;for(const e of head){const v=skinAt(e.o,e.i);hz2+=v.z;}
 console.log('f=%d tailZ=%s tailY=%s headZ=%s',f,(sz/tail.length).toFixed(3),(sy/tail.length).toFixed(3),(hz2/head.length).toFixed(3));}
