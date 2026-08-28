import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path';
import * as THREE from 'three';
globalThis.window = globalThis; globalThis.devicePixelRatio = 3;
vm.runInThisContext(fs.readFileSync('data.js','utf8'), {filename:'data.js'});
const { default: Art3D } = await import('../shark3d.js');
const rows = globalThis.RF?.RFD?.SHARKS || globalThis.RFD?.SHARKS || [];
const ids=(process.env.IDS||'reef,tiger,hammerhead,greatwhite,blue,megalodon,zeusfin,typhonmaw').split(',');
function pts(body,mode){
  const g=body.geometry,pos=g.getAttribute('position'),si=g.getAttribute('skinIndex'),sw=g.getAttribute('skinWeight');
  const bones=body.skeleton.bones, ji=bones.findIndex(b=>b.name==='LowerJaw'), hi=bones.findIndex(b=>b.name==='Head');
  const mats=bones.map(b=>new THREE.Matrix4().multiplyMatrices(body.bindMatrixInverse,b.matrixWorld));
  const out=[];const p=new THREE.Vector3(),t=new THREE.Vector3();
  for(let i=0;i<pos.count;i++){
    let jw=0,hw=0;for(let k=0;k<4;k++){const b=si.getComponent(i,k),w=sw.getComponent(i,k);if(b===ji)jw+=w;if(b===hi)hw+=w;}
    if(mode==='jaw'&&jw<0.35)continue; if(mode==='head'&&hw<0.35)continue;
    p.fromBufferAttribute(pos,i);const acc=new THREE.Vector3();
    for(let k=0;k<4;k++){const b=si.getComponent(i,k),w=sw.getComponent(i,k);if(w<=0)continue;t.copy(p).applyMatrix4(mats[b]).multiplyScalar(w);acc.add(t);}
    out.push(acc.clone());
  }
  return out;
}
const bx=(a)=>{const b=new THREE.Box3();a.forEach(p=>b.expandByPoint(p));return b;};
for(const id of ids){
  const def=rows.find(d=>d.id===id); if(!def)continue;
  const rig=Art3D.buildShark(def), body=rig.parts.body, root=rig.group;
  const jaw=root.getObjectByName('LowerJaw'); if(!jaw)continue;
  root.updateMatrixWorld(true);
  const hb=bx(pts(body,'head')), all=bx(pts(body,'all'));
  // head span = head box size along HEIGHT axis z and long axis y
  const hs=hb.getSize(new THREE.Vector3());
  const base=jaw.quaternion.clone();
  const rows2=[];
  for(const a of [0,0.1,0.2,0.3,0.4,0.5]){
    jaw.quaternion.copy(base); jaw.rotateX(a); root.updateMatrixWorld(true);
    const jb=bx(pts(body,'jaw'));
    // gape = vertical (z) gap between head box min z and jaw box max z? use jaw min z vs head min z
    rows2.push(a.toFixed(2)+':jawZ['+jb.min.z.toFixed(3)+','+jb.max.z.toFixed(3)+']');
  }
  jaw.quaternion.copy(base); root.updateMatrixWorld(true);
  console.log(id.padEnd(11),'headBox z['+hb.min.z.toFixed(3)+','+hb.max.z.toFixed(3)+'] y['+hb.min.y.toFixed(3)+','+hb.max.y.toFixed(3)+'] headSize',hs.toArray().map(v=>v.toFixed(3)).join('/'));
  console.log('    ',rows2.join(' '));
}
