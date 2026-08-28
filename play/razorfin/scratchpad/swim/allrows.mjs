import * as THREE from 'three';
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path';
import { pathToFileURL } from 'node:url';
globalThis.window=globalThis;globalThis.devicePixelRatio=3;
vm.runInThisContext(fs.readFileSync('data.js','utf8'),{filename:'data.js'});
const m=await import(pathToFileURL(path.resolve('shark3d.js')));
const A=globalThis.RF.Art3D||m.Art3D; await A.preload();
const _v=new THREE.Vector3();
const skin=(o,i)=>{_v.fromBufferAttribute(o.geometry.attributes.position,i);
 if(o.isSkinnedMesh&&o.applyBoneTransform)o.applyBoneTransform(i,_v);
 return _v.clone().applyMatrix4(o.matrixWorld);};
const bad=[]; let n=0;
for(const def of globalThis.RFD.SHARKS){
 let rec; try{rec=A.buildShark(def);}catch(e){bad.push([def.id,'BUILD '+e.message]);continue;}
 const g=rec.group;
 rec.animate(0,{speedFrac:0.5,turn:0,tailPhase:0,tailAmp:0.34}); g.updateMatrixWorld(true);
 let body=null;g.traverse(o=>{if(!body&&o.isSkinnedMesh)body=o;});
 if(!body){bad.push([def.id,'no skinned body']);continue;}
 const bb=new THREE.Box3().setFromObject(g); const H=bb.max.y-bb.min.y;
 const bones=body.skeleton.bones,si=body.geometry.attributes.skinIndex,sw=body.geometry.attributes.skinWeight,pos=body.geometry.attributes.position;
 const pick=(names)=>{const L=[];for(let i=0;i<pos.count;i+=Math.max(1,Math.floor(pos.count/1500))){
   let best=-1,bw=0;for(let c=0;c<4;c++){const w=sw.getComponent(i,c);if(w>bw){bw=w;best=si.getComponent(i,c);}}
   if(best>=0&&bw>0.5&&names.includes(bones[best]?.name))L.push(i);}return L;};
 const tv=pick(['Tail3','Tail2']),hv=pick(['Head','LowerJaw']);
 if(!tv.length||!hv.length){bad.push([def.id,'no bands']);continue;}
 const mean=(L,ax)=>{let s=0;for(const i of L)s+=skin(body,i)[ax];return s/L.length;};
 const tz=[],ty=[],hz=[];let ph=0;
 for(let w=0;w<45;w++){ph+=(1/30)*(2.3+3.4*0.5);rec.animate(-1+w/30,{speedFrac:0.5,turn:0,tailPhase:ph,tailAmp:0.34});}
 for(let f=0;f<60;f++){ph+=(1/30)*(2.3+3.4*0.5);
  rec.animate(f/30,{speedFrac:0.5,turn:0,tailPhase:ph,tailAmp:0.34});g.updateMatrixWorld(true);
  tz.push(mean(tv,'z'));ty.push(mean(tv,'y'));hz.push(mean(hv,'z'));}
 const amp=a=>(Math.max(...a)-Math.min(...a))/2;
 const tl=amp(tz)/H*100, hl=amp(hz)/H*100, tvv=amp(ty)/H*100;
 n++;
 if(hl>6||tl<hl||tvv>2) bad.push([def.id,`tailLat=${tl.toFixed(2)} headLat=${hl.toFixed(2)} vert=${tvv.toFixed(2)}`]);
 A.releaseShark&&A.releaseShark(g);
}
console.log('rows measured:',n,' violations:',bad.length);
for(const b of bad) console.log('  ',b[0],b[1]);
