import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path';
import { fileURLToPath } from 'node:url'; import * as THREE from 'three';
const BASE=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
globalThis.window=globalThis; globalThis.devicePixelRatio=3;
vm.runInThisContext(fs.readFileSync(path.join(BASE,'data.js'),'utf8'),{filename:'data.js'});
const { default: Art3D } = await import('../shark3d.js');
const rows=globalThis.RFD?.SHARKS||[];
const def=rows.find(d=>d.id==='reef');
const rig=Art3D.buildShark(def); const g=rig.group; g.updateMatrixWorld(true);
const body=rig.parts.body;
const bones=body.skeleton.bones;
const s2w=new THREE.Matrix3().setFromMatrix4(body.matrixWorld);
const w2s=s2w.clone().invert();
const wp=(n)=>{const b=bones.find(x=>x.name===n);return new THREE.Vector3().setFromMatrixPosition(b.matrixWorld);};
const H=wp('Head'),N=wp('Neck');
const worldFwd=H.clone().sub(N).normalize();
console.log('world forward (Neck->Head)',worldFwd.toArray().map(v=>v.toFixed(3)));
const fwdSkin=H.clone().sub(N).applyMatrix3(w2s).normalize();
console.log('forward in skinned space   ',fwdSkin.toArray().map(v=>v.toFixed(3)));
console.log('  -> back to world          ',fwdSkin.clone().applyMatrix3(s2w).normalize().toArray().map(v=>v.toFixed(3)));
const upW=new THREE.Vector3(0,1,0);
const upS=upW.clone().applyMatrix3(w2s).normalize();
console.log('world up -> skinned         ',upS.toArray().map(v=>v.toFixed(3)));
// orthogonalize in world then bring back
const wu=upW.clone().addScaledVector(worldFwd,-upW.dot(worldFwd)).normalize();
const ws=new THREE.Vector3().crossVectors(worldFwd,wu).normalize();
console.log('world side                  ',ws.toArray().map(v=>v.toFixed(3)));
const sideS=ws.clone().applyMatrix3(w2s).normalize();
console.log('side in skinned space       ',sideS.toArray().map(v=>v.toFixed(3)));
console.log('  -> back to world          ',sideS.clone().applyMatrix3(s2w).normalize().toArray().map(v=>v.toFixed(3)));
// how far does 1 skinned unit along sideS move in world?
console.log('world length of unit skinned side', ws.clone().applyMatrix3(w2s).applyMatrix3(s2w).length().toFixed(3));
console.log('|sideS| before normalize', ws.clone().applyMatrix3(w2s).length().toFixed(5));

// Project the head cloud into this frame, origin at the Head BONE.
const geo=body.geometry,pos=geo.getAttribute('position'),si=geo.getAttribute('skinIndex'),sw=geo.getAttribute('skinWeight');
const hi=bones.findIndex(b=>b.name==='Head'), ji=bones.findIndex(b=>b.name==='LowerJaw');
const p=new THREE.Vector3(); let mh=0,mj=0; const hv=[],jv=[],all=[];
for(let i=0;i<pos.count;i++){p.fromBufferAttribute(pos,i);body.applyBoneTransform(i,p);all.push(p.clone());
  let a=0,b=0;for(let k=0;k<4;k++){const bi=si.getComponent(i,k),v=sw.getComponent(i,k);if(bi===hi)a+=v;else if(bi===ji)b+=v;}
  hv.push(a);jv.push(b);mh=Math.max(mh,a);mj=Math.max(mj,b);}
const hc=Math.min(0.5,mh*0.55),jc=Math.min(0.5,mj*0.55);
const origin=new THREE.Vector3().setFromMatrixPosition(bones[hi].matrixWorld).applyMatrix4(new THREE.Matrix4().copy(body.matrixWorld).invert());
console.log('\norigin (Head bone in skinned space)',origin.toArray().map(v=>v.toFixed(4)));
const proj=(pt)=>{const v=pt.clone().sub(origin);return {f:v.dot(fwdSkin),u:v.dot(upS),s:v.dot(sideS)};};
const stat=(sel)=>{let F=[Infinity,-Infinity],U=[Infinity,-Infinity],S=[Infinity,-Infinity],n=0;
 for(let i=0;i<all.length;i++){if(!sel(i))continue;const q=proj(all[i]);n++;
  F[0]=Math.min(F[0],q.f);F[1]=Math.max(F[1],q.f);U[0]=Math.min(U[0],q.u);U[1]=Math.max(U[1],q.u);S[0]=Math.min(S[0],q.s);S[1]=Math.max(S[1],q.s);}
 return {n,F,U,S};};
const H2=stat(i=>hv[i]>hc), J2=stat(i=>jv[i]>jc), A2=stat(()=>true);
const fmt=(x)=>'f['+x.F[0].toFixed(3)+','+x.F[1].toFixed(3)+'] u['+x.U[0].toFixed(3)+','+x.U[1].toFixed(3)+'] s['+x.S[0].toFixed(3)+','+x.S[1].toFixed(3)+']';
console.log('HEAD n='+H2.n, fmt(H2));
console.log('JAW  n='+J2.n, fmt(J2));
console.log('BODY n='+A2.n, fmt(A2));

// Sanity: which SKINNED axis actually spans the body, and where is the head along it?
const bb=new THREE.Box3(); for(const q of all) bb.expandByPoint(q);
const sz=bb.getSize(new THREE.Vector3());
console.log('\nskinned body box size', sz.toArray().map(v=>v.toFixed(3)));
const hb=new THREE.Box3(); for(let i=0;i<all.length;i++) if(hv[i]>hc) hb.expandByPoint(all[i]);
console.log('skinned HEAD box  min',hb.min.toArray().map(v=>v.toFixed(3)),'max',hb.max.toArray().map(v=>v.toFixed(3)));
console.log('skinned BODY box  min',bb.min.toArray().map(v=>v.toFixed(3)),'max',bb.max.toArray().map(v=>v.toFixed(3)));
console.log('\nNeck/Head in SKINNED space:');
const inv=new THREE.Matrix4().copy(body.matrixWorld).invert();
console.log('  Neck',N.clone().applyMatrix4(inv).toArray().map(v=>v.toFixed(4)));
console.log('  Head',H.clone().applyMatrix4(inv).toArray().map(v=>v.toFixed(4)));
console.log('  Head-Neck skinned delta',H.clone().applyMatrix4(inv).sub(N.clone().applyMatrix4(inv)).toArray().map(v=>v.toFixed(4)));
