import fs from 'node:fs'; import vm from 'node:vm';
import * as THREE from 'three';
globalThis.window=globalThis; globalThis.devicePixelRatio=3;
vm.runInThisContext(fs.readFileSync('data.js','utf8'),{filename:'data.js'});
const { default: Art3D } = await import('../shark3d.js');
const rows=globalThis.RF?.RFD?.SHARKS||globalThis.RFD?.SHARKS||[];
function skin(body){
  const g=body.geometry,pos=g.getAttribute('position'),si=g.getAttribute('skinIndex'),sw=g.getAttribute('skinWeight');
  const bones=body.skeleton.bones, ji=bones.findIndex(b=>b.name==='LowerJaw'), hi=bones.findIndex(b=>b.name==='Head');
  const mats=bones.map(b=>new THREE.Matrix4().multiplyMatrices(body.bindMatrixInverse,b.matrixWorld));
  const jaw=[],head=[];const p=new THREE.Vector3(),t=new THREE.Vector3();
  for(let i=0;i<pos.count;i++){
    let jw=0,hw=0;for(let k=0;k<4;k++){const b=si.getComponent(i,k),w=sw.getComponent(i,k);if(b===ji)jw+=w;if(b===hi)hw+=w;}
    p.fromBufferAttribute(pos,i);const acc=new THREE.Vector3();
    for(let k=0;k<4;k++){const b=si.getComponent(i,k),w=sw.getComponent(i,k);if(w<=0)continue;t.copy(p).applyMatrix4(mats[b]).multiplyScalar(w);acc.add(t);}
    if(jw>0.35)jaw.push(acc.clone()); if(hw>0.35)head.push(acc.clone());
  }
  return {jaw,head};
}
for(const id of (process.env.IDS||'reef,tiger,hammerhead,greatwhite,blue,megalodon,zeusfin,typhonmaw').split(',')){
  const def=rows.find(d=>d.id===id); if(!def)continue;
  const rig=Art3D.buildShark(def), body=rig.parts.body, root=rig.group;
  const jb=root.getObjectByName('LowerJaw'); if(!jb)continue;
  const rest=jb.quaternion.clone();
  // up axis = z per earlier probe (height). long = y.
  const out=[];
  for(const ang of [0, 26*Math.PI/180]){
    jb.quaternion.copy(rest); if(ang) jb.rotateOnAxis(new THREE.Vector3(1,0,0), ang);
    root.updateMatrixWorld(true);
    const {jaw,head}=skin(body);
    const hb=new THREE.Box3();head.forEach(p=>hb.expandByPoint(p));
    const hh=hb.max.z-hb.min.z;
    // forward = -y (nose). tip = jaw verts with smallest y
    const ys=jaw.map(p=>p.y).sort((a,b)=>a-b); const cut=ys[Math.floor(ys.length*0.20)];
    const tip=jaw.filter(p=>p.y<=cut);
    const tz=tip.reduce((s,p)=>s+p.z,0)/tip.length;
    out.push({tz,hh,hbmin:hb.min.z});
  }
  jb.quaternion.copy(rest); root.updateMatrixWorld(true);
  const travel=(out[0].tz-out[1].tz)/out[0].hh;
  console.log(id.padEnd(12),'headH',out[0].hh.toFixed(3),'tipZ',out[0].tz.toFixed(3),'->',out[1].tz.toFixed(3),'travel/headH',travel.toFixed(4));
}
