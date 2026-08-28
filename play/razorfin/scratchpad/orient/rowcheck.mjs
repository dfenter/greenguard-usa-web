import fs from 'node:fs'; import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
const BASE='/Users/lucille/greenguard-usa-web/play/razorfin';
globalThis.window=globalThis; globalThis.devicePixelRatio=3;
vm.runInThisContext(fs.readFileSync(BASE+'/data.js','utf8'),{filename:'data.js'});
await import(pathToFileURL(BASE+'/shark3d.js'));
const A=globalThis.RF.Art3D; await A.preload();
for(const id of ['goblin','gulperfiend']){
  const def=RFD.SHARK_BY_ID[id];
  console.log(id,'sil.model=',JSON.stringify(def?.sil?.model));
  const rig=A.buildShark(def);
  rig.group.updateMatrixWorld(true);
  const base=rig.group.userData.rfSourceBase;
  console.log('   base=',base);
  const t=A.residentTemplates().find(x=>x.key===base);
  if(t) console.log('   orientation=',JSON.stringify({...t.scene.userData.rfOrientation, quaternion:undefined}));
  // measure the built rig's silhouette extents
  const b=new THREE.Box3().setFromObject(rig.parts.body), s=b.getSize(new THREE.Vector3());
  console.log('   built body size=',s.toArray().map(v=>+v.toFixed(3)));
}
