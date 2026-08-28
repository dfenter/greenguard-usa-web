import fs from 'node:fs'; import vm from 'node:vm';
import * as THREE from 'three';
globalThis.window=globalThis; globalThis.devicePixelRatio=3;
vm.runInThisContext(fs.readFileSync('data.js','utf8'),{filename:'data.js'});
const { default: Art3D } = await import('../shark3d.js');
const rows=globalThis.RF?.RFD?.SHARKS||globalThis.RFD?.SHARKS||[];
function cap(root,mesh){
  root.updateMatrixWorld(true); mesh.skeleton?.update();
  const pos=mesh.geometry.getAttribute('position');const pts=new Float32Array(pos.count*3);const p=new THREE.Vector3();
  const b=new THREE.Box3().makeEmpty();
  for(let i=0;i<pos.count;i++){p.fromBufferAttribute(pos,i);mesh.applyBoneTransform(i,p);p.applyMatrix4(mesh.matrixWorld);
    pts[i*3]=p.x;pts[i*3+1]=p.y;pts[i*3+2]=p.z;b.expandByPoint(p);}
  return {pts,b,count:pos.count};
}
function wi(mesh,names){const g=mesh.geometry,ix=g.getAttribute('skinIndex'),w=g.getAttribute('skinWeight'),bs=mesh.skeleton.bones;
  const want=new Set(names.map(n=>bs.findIndex(b=>b.name===n)).filter(i=>i>=0));const out=[];
  for(let i=0;i<ix.count;i++){let s=0;for(let c=0;c<4;c++)if(want.has(ix.getComponent(i,c)))s+=Math.max(0,w.getComponent(i,c));if(s>0.5)out.push(i);}return out;}
function sb(pts,idx){const b=new THREE.Box3().makeEmpty();const p=new THREE.Vector3();
  for(const i of idx){p.set(pts[i*3],pts[i*3+1],pts[i*3+2]);b.expandByPoint(p);}return b;}
for(const id of ['reef','tiger','hammerhead','greatwhite','blue','megalodon','zeusfin','typhonmaw']){
  const def=rows.find(d=>d.id===id);
  const rig=Art3D.buildShark(def), body=rig.parts.body, root=rig.group;
  const jb=root.getObjectByName('LowerJaw');
  const rest=jb.quaternion.clone();
  const jaw=wi(body,['LowerJaw']), head=wi(body,['Head']);
  const s0=cap(root,body);
  const size=s0.b.getSize(new THREE.Vector3());
  const hb=sb(s0.pts,head), jbx=sb(s0.pts,jaw);
  console.log(id.padEnd(11),'bodySize',[size.x,size.y,size.z].map(v=>v.toFixed(1)).join('/'),
   'headC',hb.getCenter(new THREE.Vector3()).toArray().map(v=>v.toFixed(1)).join('/'),
   'jawC',jbx.getCenter(new THREE.Vector3()).toArray().map(v=>v.toFixed(1)).join('/'));
  // sweep +x rotation, report jaw box delta on each world axis
  for(const ang of [26*Math.PI/180]){
    jb.quaternion.copy(rest); jb.rotateOnAxis(new THREE.Vector3(1,0,0),ang);
    const s1=cap(root,body); const j1=sb(s1.pts,jaw);
    const d=j1.getCenter(new THREE.Vector3()).sub(jbx.getCenter(new THREE.Vector3()));
    console.log('    +26deg jawC delta',d.toArray().map(v=>v.toFixed(2)).join('/'));
  }
  jb.quaternion.copy(rest);root.updateMatrixWorld(true);
}
