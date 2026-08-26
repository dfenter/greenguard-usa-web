import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path';
import { fileURLToPath } from 'node:url'; import * as THREE from 'three';
const BASE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
globalThis.window = globalThis; globalThis.devicePixelRatio = 3;
vm.runInThisContext(fs.readFileSync(path.join(BASE, 'data.js'), 'utf8'), { filename: 'data.js' });
const { default: Art3D } = await import('../shark3d.js');
const rows = globalThis.RF?.RFD?.SHARKS || globalThis.RFD?.SHARKS || [];
for (const id of (process.env.IDS || 'medusagaze,reef').split(',')) {
  const def = rows.find((d) => d.id === id); if (!def) continue;
  let rig; try { rig = Art3D.buildShark(def); } catch(e){ continue; }
  const body = rig.parts.body;
  const geo=body.geometry,pos=geo.getAttribute('position'),si=geo.getAttribute('skinIndex'),sw=geo.getAttribute('skinWeight');
  const bones=body.skeleton.bones, hi=bones.findIndex(b=>b.name==='Head'), ji=bones.findIndex(b=>b.name==='LowerJaw');
  const p=new THREE.Vector3(); body.updateMatrixWorld(true);
  const all=[],hwArr=[]; let mh=0;
  for(let i=0;i<pos.count;i++){p.fromBufferAttribute(pos,i);body.applyBoneTransform(i,p);
    const wy=p.clone().applyMatrix4(body.matrixWorld).y; all.push([p.x,p.y,p.z,wy]);
    let a=0; for(let k=0;k<4;k++) if(si.getComponent(i,k)===hi)a+=sw.getComponent(i,k); hwArr.push(a); mh=Math.max(mh,a);}
  const hc=Math.min(0.5,mh*0.55); const head=[]; for(let i=0;i<all.length;i++) if(hwArr[i]>hc)head.push(all[i]);
  const cen=(L)=>{const v=new THREE.Vector3();for(const q of L)v.add(new THREE.Vector3(q[0],q[1],q[2]));return v.divideScalar(L.length||1);};
  const hcen=cen(head), acen=cen(all); const fwd=hcen.clone().sub(acen).normalize();
  // up axis
  let mx=0,my=0,mz=0,mw=0; for(const q of all){mx+=q[0];my+=q[1];mz+=q[2];mw+=q[3];} const n=all.length; mx/=n;my/=n;mz/=n;mw/=n;
  let vw=0; const cov=[0,0,0],va=[0,0,0];
  for(const q of all){const d=[q[0]-mx,q[1]-my,q[2]-mz],w=q[3]-mw; vw+=w*w; for(let a=0;a<3;a++){cov[a]+=d[a]*w;va[a]+=d[a]*d[a];}}
  let best=0,bs=-1,cr=[0,0,0]; for(let a=0;a<3;a++){cr[a]=cov[a]/Math.sqrt(Math.max(va[a]*vw,1e-18)); if(Math.abs(cr[a])>bs){bs=Math.abs(cr[a]);best=a;}}
  const upv=new THREE.Vector3(); upv.setComponent(best,cr[best]>=0?1:-1);
  const up=upv.clone().addScaledVector(fwd,-upv.dot(fwd)).normalize();
  const side=new THREE.Vector3().crossVectors(fwd,up).normalize();
  const proj=head.map(q=>{const v=new THREE.Vector3(q[0]-hcen.x,q[1]-hcen.y,q[2]-hcen.z);return{f:v.dot(fwd),u:v.dot(up),s:v.dot(side)};});
  let fl=Infinity,fh=-Infinity; for(const q of proj){fl=Math.min(fl,q.f);fh=Math.max(fh,q.f);} const span=fh-fl;
  console.log(id,'base='+rig.group.userData.rfSourceBase,'headSpan='+span.toFixed(4));
  // half width profile along f
  for(const frac of [0.4,0.5,0.6,0.66,0.75,0.85]){
    const f=fl+span*frac, tol=span*0.09; const near=proj.filter(q=>Math.abs(q.f-f)<=tol);
    if(!near.length){console.log('   f='+frac,'none');continue;}
    let ul=Infinity,uh=-Infinity,smax=0; for(const q of near){ul=Math.min(ul,q.u);uh=Math.max(uh,q.u);smax=Math.max(smax,Math.abs(q.s));}
    const us=uh-ul;
    // width at u fraction 0.68
    const tu=ul+us*0.68, win=us*0.16; let sAt=0; for(const q of near) if(Math.abs(q.u-tu)<=win) sAt=Math.max(sAt,Math.abs(q.s));
    let sl=Infinity,sh=-Infinity; for(const q of near){sl=Math.min(sl,q.s);sh=Math.max(sh,q.s);}
    console.log('   f='+frac,'n='+near.length,'uSpan='+us.toFixed(4),'maxHalfW='+smax.toFixed(4),'halfW@u0.68='+sAt.toFixed(4),'sRange=['+sl.toFixed(4)+','+sh.toFixed(4)+']','uRange=['+ul.toFixed(4)+','+uh.toFixed(4)+']');
  }
}
