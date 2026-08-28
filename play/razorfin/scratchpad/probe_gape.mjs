import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path';
import * as THREE from 'three';
const BASE = path.resolve('.');
globalThis.window = globalThis; globalThis.devicePixelRatio = 3;
vm.runInThisContext(fs.readFileSync(path.join(BASE,'data.js'),'utf8'), {filename:'data.js'});
const { default: Art3D } = await import('../shark3d.js');
const rows = globalThis.RF?.RFD?.SHARKS || globalThis.RFD?.SHARKS || [];
const ids = (process.env.IDS||'reef,tiger,hammerhead,greatwhite,blue,megalodon,zeusfin,typhonmaw').split(',');
function skinPts(body, filterJaw){
  const g=body.geometry,pos=g.getAttribute('position'),si=g.getAttribute('skinIndex'),sw=g.getAttribute('skinWeight');
  const bones=body.skeleton.bones, ji=bones.findIndex(b=>b.name==='LowerJaw');
  const mats=bones.map(b=>new THREE.Matrix4().multiplyMatrices(body.bindMatrixInverse,b.matrixWorld));
  const out=[];const p=new THREE.Vector3(),t=new THREE.Vector3();
  for(let i=0;i<pos.count;i++){
    let jw=0;for(let k=0;k<4;k++) if(si.getComponent(i,k)===ji) jw+=sw.getComponent(i,k);
    if(filterJaw && jw<0.35) continue;
    p.fromBufferAttribute(pos,i);const acc=new THREE.Vector3();
    for(let k=0;k<4;k++){const b=si.getComponent(i,k),w=sw.getComponent(i,k);if(w<=0)continue;
      t.copy(p).applyMatrix4(mats[b]).multiplyScalar(w);acc.add(t);}
    out.push(acc.clone());
  }
  return out;
}
for(const id of ids){
  const def=rows.find(d=>d.id===id); if(!def){console.log(id,'NO DEF');continue;}
  const rig=Art3D.buildShark(def), body=rig.parts.body, root=rig.group;
  const jaw=root.getObjectByName('LowerJaw'), head=root.getObjectByName('Head');
  if(!jaw){console.log(id,'no jaw bone');continue;}
  root.updateMatrixWorld(true);
  const all=skinPts(body,false), box=new THREE.Box3(); all.forEach(p=>box.expandByPoint(p));
  const size=box.getSize(new THREE.Vector3());
  // head extent for reference
  const base=jaw.quaternion.clone();
  const res={};
  for(const ax of ['x','y','z']){
    for(const sgn of [1,-1]){
      jaw.quaternion.copy(base);
      jaw.rotateOnAxis(new THREE.Vector3(ax==='x'?1:0,ax==='y'?1:0,ax==='z'?1:0), sgn*0.5);
      root.updateMatrixWorld(true);
      const jp=skinPts(body,true); const jb=new THREE.Box3(); jp.forEach(p=>jb.expandByPoint(p));
      res[ax+(sgn>0?'+':'-')]=jb;
    }
  }
  jaw.quaternion.copy(base); root.updateMatrixWorld(true);
  const jp0=skinPts(body,true); const jb0=new THREE.Box3(); jp0.forEach(p=>jb0.expandByPoint(p));
  const c0=jb0.getCenter(new THREE.Vector3());
  const deltas=Object.entries(res).map(([k,b])=>{
    const c=b.getCenter(new THREE.Vector3());
    return k+':('+(c.x-c0.x).toFixed(3)+','+(c.y-c0.y).toFixed(3)+','+(c.z-c0.z).toFixed(3)+')';
  });
  console.log(id.padEnd(12),'bodyBox',size.toArray().map(v=>v.toFixed(2)).join('/'),
    'jawVerts',jp0.length,'restJawQ',[base.x,base.y,base.z,base.w].map(v=>v.toFixed(3)).join(','));
  console.log('   ',deltas.join(' '));
}
