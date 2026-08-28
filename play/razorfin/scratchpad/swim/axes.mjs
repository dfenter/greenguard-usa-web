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
  if (!def) { console.log(id,'NO DEF'); continue; }
  const rec = A.buildShark(def);
  const g = rec.group;
  const ori = g.userData.rfOrientation || null;
  // find swim bones
  const names=['Neck','Spine1','Spine2','Tail1','Tail2','Tail3'];
  const tmpl = g.userData.rfSourceBase;
  console.log('=== '+id+'  base='+tmpl);
  console.log('   swimSource', JSON.stringify(g.userData.rfSwimSource));
  // measure world motion of tail tip under animate
  const scene = rec.parts.body;
  let bones=[]; g.traverse(o=>{ if(o.isBone && names.includes(o.name)) bones.push(o); });
  console.log('   bones found:', bones.map(b=>b.name).join(','));
  if(!bones.length) continue;
  const tip = bones[bones.length-1];

  const samples=[];
  for(let i=0;i<24;i++){
    const t=i/24*2;
    rec.animate(t,{speedFrac:0.5,turn:0});
    g.updateMatrixWorld(true);
    const p=new THREE.Vector3().setFromMatrixPosition(tip.matrixWorld);
    samples.push(p.clone());
  }
  // amplitude per world axis
  const mn=samples[0].clone(),mx=samples[0].clone();
  for(const s of samples){mn.min(s);mx.max(s);}
  const d=mx.clone().sub(mn);
  console.log('   tailtip world swing  x=%s y=%s z=%s', d.x.toFixed(4), d.y.toFixed(4), d.z.toFixed(4));
}
