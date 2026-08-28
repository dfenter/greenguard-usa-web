import * as THREE from 'three';
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path';
import { pathToFileURL } from 'node:url';
globalThis.window=globalThis;globalThis.devicePixelRatio=3;
vm.runInThisContext(fs.readFileSync('data.js','utf8'),{filename:'data.js'});
const m=await import(pathToFileURL(path.resolve('shark3d.js')));
const A=globalThis.RF.Art3D||m.Art3D; await A.preload();
const ROWS=(process.env.IDS||'reef,greatwhite,mako,tiger,hammerhead,leviathanrex').split(',');
const FPS=30,SECS=3,N=FPS*SECS;
const _v=new THREE.Vector3();
const skin=(o,i)=>{_v.fromBufferAttribute(o.geometry.attributes.position,i);
 if(o.isSkinnedMesh&&o.applyBoneTransform)o.applyBoneTransform(i,_v);
 return _v.clone().applyMatrix4(o.matrixWorld);};
const out=[];
for(const id of ROWS){
 const def=globalThis.RFD.SHARKS.find(s=>s.id===id); if(!def){console.log(id,'nodef');continue;}
 const rec=A.buildShark(def); const g=rec.group;
 rec.animate(0,{speedFrac:0.5,turn:0,tailPhase:0,tailAmp:0.34}); g.updateMatrixWorld(true);
 const body=(()=>{let b=null;g.traverse(o=>{if(!b&&o.isSkinnedMesh)b=o;});return b;})();
 if(!body){console.log(id,'no skinned body');continue;}
 const bb=new THREE.Box3().setFromObject(g); const H=bb.max.y-bb.min.y;
 const bones=body.skeleton.bones, si=body.geometry.attributes.skinIndex, sw=body.geometry.attributes.skinWeight;
 const pos=body.geometry.attributes.position;
 // classify vertices by dominant bone
 const pickBy=(names)=>{const L=[];
   for(let i=0;i<pos.count;i+=Math.max(1,Math.floor(pos.count/2500))){
     let best=-1,bw=0; for(let c=0;c<4;c++){const w=sw.getComponent(i,c); if(w>bw){bw=w;best=si.getComponent(i,c);}}
     if(best>=0&&bw>0.5&&names.includes(bones[best]?.name))L.push(i);}
   return L;};
 const tailV=pickBy(['Tail3','Tail2']), headV=pickBy(['Head','LowerJaw']);
 const mean=(L,ax)=>{let s=0;for(const i of L){s+=skin(body,i)[ax];}return L.length?s/L.length:0;};
 const run=(spFn,phFn)=>{const tz=[],ty=[],hz=[];let ph=0;
   /* warm-up: let the amplitude ease settle so we measure steady state,
      not the ramp-in from a cold rig. */
   for(let w=0;w<45;w++){const dt=1/FPS,sp=spFn(0);ph+=dt*(2.3+3.4*sp);
     rec.animate(-1+w/FPS,{speedFrac:sp,turn:0,tailPhase:ph,tailAmp:0.03+0.31*sp});}
   for(let f=0;f<N;f++){const t=f/FPS,dt=1/FPS,sp=spFn(f);
     ph+= dt*(2.3+3.4*sp);
     rec.animate(t,{speedFrac:sp,turn:0,tailPhase:ph,tailAmp:0.03+0.31*sp});
     g.updateMatrixWorld(true);
     tz.push(mean(tailV,'z')); ty.push(mean(tailV,'y')); hz.push(mean(headV,'z'));}
   return {tz,ty,hz};};
 const amp=a=>(Math.max(...a)-Math.min(...a))/2;
 const jerk=(a)=>{const A2=amp(a); if(A2<1e-9)return 0;let mj=0;
   for(let i=2;i<a.length;i++){const j=Math.abs(a[i]-2*a[i-1]+a[i-2]); if(j>mj)mj=j;} return mj/A2*100;};
 const steady=run(()=>0.5);
 const step=run(f=>f<N/2?0.15:0.9);
 const r={id,base:g.userData.rfSourceBase,
  tailLatPctH:+(amp(steady.tz)/H*100).toFixed(2),
  headLatPctH:+(amp(steady.hz)/H*100).toFixed(2),
  tailVertPctH:+(amp(steady.ty)/H*100).toFixed(2),
  jerkPct:+jerk(steady.tz).toFixed(2),
  spdJerkPct:+jerk(step.tz).toFixed(2),
  tailVerts:tailV.length, headVerts:headV.length};
 out.push(r);
 console.log('%s (%s) tailLat=%s%%H headLat=%s%%H tailVert=%s%%H jerk=%s%% stepJerk=%s%%',
  id.padEnd(13),r.base.padEnd(14),r.tailLatPctH,r.headLatPctH,r.tailVertPctH,r.jerkPct,r.spdJerkPct);
}
fs.mkdirSync('hse/evidence/r15-swim',{recursive:true});
fs.writeFileSync('hse/evidence/r15-swim/metrics_'+(process.env.TAG||'after')+'.json',JSON.stringify(out,null,2));
