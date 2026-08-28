import fs from 'node:fs'; import vm from 'node:vm';
import * as THREE from 'three';
globalThis.window=globalThis; globalThis.devicePixelRatio=3;
vm.runInThisContext(fs.readFileSync('data.js','utf8'),{filename:'data.js'});
const { default: Art3D } = await import('../shark3d.js');
const rows=globalThis.RF?.RFD?.SHARKS||globalThis.RFD?.SHARKS||[];
for(const id of ['reef','blue']){
  const rig=Art3D.buildShark(rows.find(d=>d.id===id));
  const body=rig.parts.body;
  let f=null; rig.group.traverse(o=>{if(o.material?.userData?.rfTexturedFace)f=o;});
  if(!f)continue;
  rig.group.updateMatrixWorld(true); f.skeleton?.update(); body.skeleton?.update();
  const g=f.geometry,pos=g.getAttribute('position'),k=g.getAttribute('rfFaceKind'),si=g.getAttribute('skinIndex');
  const bones=f.skeleton.bones, ji=bones.findIndex(b=>b.name==='LowerJaw');
  const p=new THREE.Vector3(); const up=[],lo=[];
  for(let i=0;i<pos.count;i++){
    if(Math.round(k.getX(i))!==5)continue;
    p.fromBufferAttribute(pos,i); f.applyBoneTransform(i,p); p.applyMatrix4(f.matrixWorld);
    (si.getComponent(i,0)===ji?lo:up).push(p.clone());
  }
  // nearest distance from each tooth-row centroid to the BODY skin
  const bpos=body.geometry.getAttribute('position'); const skin=[];
  const q=new THREE.Vector3();
  for(let i=0;i<bpos.count;i+=3){ q.fromBufferAttribute(bpos,i); body.applyBoneTransform(i,q); q.applyMatrix4(body.matrixWorld); skin.push(q.clone()); }
  const nearest=(pts)=>{ let worst=0;
    for(const a of pts){ let best=1e9; for(const s of skin){ const d=a.distanceToSquared(s); if(d<best)best=d; } worst=Math.max(worst,Math.sqrt(best)); }
    return worst; };
  const diag=new THREE.Box3().setFromObject(body).getSize(new THREE.Vector3()).length();
  console.log(id.padEnd(8),'UPPER worst gap',(nearest(up)/diag*100).toFixed(2)+'% of body diag',
              '| LOWER worst gap',(nearest(lo)/diag*100).toFixed(2)+'%');
}
