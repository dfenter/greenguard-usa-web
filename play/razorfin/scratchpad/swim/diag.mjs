import * as THREE from 'three';
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path';
import { pathToFileURL } from 'node:url';
const BASE = path.resolve('.');
globalThis.window = globalThis; globalThis.devicePixelRatio = 3;
vm.runInThisContext(fs.readFileSync(path.join(BASE,'data.js'),'utf8'),{filename:'data.js'});
const m = await import(pathToFileURL(path.join(BASE,'shark3d.js')));
const A = globalThis.RF.Art3D || m.Art3D;
await A.preload();
const SHARKS = globalThis.RFD.SHARKS;
const rows = ['reef','greatwhite','mako','tiger','hammerhead','leviathanrex'];
for (const id of rows) {
  const def = SHARKS.find(s=>s.id===id);
  const rec = A.buildShark(def); const g = rec.group;
  const names=['Neck','Spine1','Spine2','Tail1','Tail2','Tail3'];
  let bones={}; g.traverse(o=>{ if(o.isBone && names.includes(o.name)) bones[o.name]=o; });
  rec.animate(0,{speedFrac:0.5,turn:0}); g.updateMatrixWorld(true);
  console.log('=== '+id+'  base='+g.userData.rfSourceBase);
  // where does each bone's local Z point in world?
  for (const n of names){ const b=bones[n]; if(!b) continue;
    const q=b.getWorldQuaternion(new THREE.Quaternion());
    const lz=new THREE.Vector3(0,0,1).applyQuaternion(q);
    const ly=new THREE.Vector3(0,1,0).applyQuaternion(q);
    console.log('   %s localZ->world[%s %s %s]  localY->world[%s %s %s]',n.padEnd(7),
      lz.x.toFixed(2),lz.y.toFixed(2),lz.z.toFixed(2), ly.x.toFixed(2),ly.y.toFixed(2),ly.z.toFixed(2));
  }
  // per-bone lateral amplitude along world Z and Y (envelope check)
  const amp={};
  for(const n of names){ const b=bones[n]; if(!b)continue; amp[n]={mn:new THREE.Vector3(1e9,1e9,1e9),mx:new THREE.Vector3(-1e9,-1e9,-1e9)}; }
  for(let i=0;i<64;i++){ rec.animate(i/64*2,{speedFrac:0.5,turn:0}); g.updateMatrixWorld(true);
    for(const n of names){const b=bones[n];if(!b)continue;const p=new THREE.Vector3().setFromMatrixPosition(b.matrixWorld);amp[n].mn.min(p);amp[n].mx.max(p);} }
  const bb=new THREE.Box3().setFromObject(g); const H=bb.max.y-bb.min.y, L=bb.max.x-bb.min.x;
  console.log('   body L=%s H=%s', L.toFixed(2), H.toFixed(2));
  for(const n of names){const a=amp[n];if(!a)continue;const d=a.mx.clone().sub(a.mn);
    console.log('   %s swingZ=%s (%s%% of H)  swingY=%s', n.padEnd(7), d.z.toFixed(3),(d.z/H*100).toFixed(1), d.y.toFixed(3));}
}
