import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path';
import { fileURLToPath } from 'node:url'; import * as THREE from 'three';
const BASE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
globalThis.window = globalThis; globalThis.devicePixelRatio = 3;
vm.runInThisContext(fs.readFileSync(path.join(BASE, 'data.js'), 'utf8'), { filename: 'data.js' });
const { default: Art3D } = await import('../shark3d.js');
const rows = globalThis.RF?.RFD?.SHARKS || globalThis.RFD?.SHARKS || [];
for (const id of (process.env.IDS || 'megalodon,whaleshark,tiger,reef').split(',')) {
  const def = rows.find((d) => d.id === id); if (!def) continue;
  const rig = Art3D.buildShark(def), body = rig.parts.body;
  const geo = body.geometry, pos = geo.getAttribute('position');
  const si = geo.getAttribute('skinIndex'), sw = geo.getAttribute('skinWeight');
  const bones = body.skeleton.bones;
  const hi = bones.findIndex((b) => b.name === 'Head'), ji = bones.findIndex((b) => b.name === 'LowerJaw');
  const p = new THREE.Vector3(); body.updateMatrixWorld(true);
  const hw = [], jw = [], all = [];
  let mh = 0, mj = 0;
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i); body.applyBoneTransform(i, p);
    all.push([p.x,p.y,p.z]);
    let a=0,b=0; for (let k=0;k<4;k++){const bi=si.getComponent(i,k),w=sw.getComponent(i,k); if(bi===hi)a+=w; else if(bi===ji)b+=w;}
    hw.push(a); jw.push(b); mh=Math.max(mh,a); mj=Math.max(mj,b);
  }
  const hc=Math.min(0.5,mh*0.55), jc=Math.min(0.5,mj*0.55);
  const head=[],jaw=[]; for(let i=0;i<all.length;i++){ if(hw[i]>hc&&hw[i]>1e-4)head.push(all[i]); if(jw[i]>jc&&jw[i]>1e-4)jaw.push(all[i]); }
  // frame
  const cen=(L)=>{const v=new THREE.Vector3(); for(const q of L)v.add(new THREE.Vector3(q[0],q[1],q[2])); return v.divideScalar(L.length||1);};
  const hcen=cen(head), acen=cen(all);
  const fwd=hcen.clone().sub(acen).normalize();
  console.log(id, 'base='+rig.group.userData.rfSourceBase, 'maxH='+mh.toFixed(2),'maxJ='+mj.toFixed(2),'head='+head.length,'jaw='+jaw.length);
  // head/jaw extents along fwd
  const proj=(L)=>{let lo=Infinity,hi2=-Infinity; for(const q of L){const d=new THREE.Vector3(q[0],q[1],q[2]).sub(hcen).dot(fwd); lo=Math.min(lo,d);hi2=Math.max(hi2,d);} return [lo,hi2];};
  const [hl,hh]=proj(head), [jl,jh]=proj(jaw), [al,ah]=proj(all);
  console.log('   fwd extents: head['+hl.toFixed(3)+','+hh.toFixed(3)+'] jaw['+jl.toFixed(3)+','+jh.toFixed(3)+'] body['+al.toFixed(3)+','+ah.toFixed(3)+']');
  console.log('   overlap ['+Math.max(hl,jl).toFixed(3)+','+Math.min(hh,jh).toFixed(3)+'] span='+(Math.min(hh,jh)-Math.max(hl,jl)).toFixed(3)+' headSpan='+(hh-hl).toFixed(3));
}
