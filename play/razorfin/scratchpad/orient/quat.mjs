import fs from 'node:fs'; import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
const BASE='/Users/lucille/greenguard-usa-web/play/razorfin';
globalThis.window=globalThis; globalThis.devicePixelRatio=3;
vm.runInThisContext(fs.readFileSync(BASE+'/data.js','utf8'),{filename:'data.js'});
await import(pathToFileURL(BASE+'/shark3d.js'));
const A=globalThis.RF.Art3D; await A.preload();
for(const k of ['mako','tigershark','dogfish']){
  const t=A.residentTemplates().find(x=>x.key===k);
  const o=t.scene.userData.rfOrientation;
  console.log('%s: axis=%s dorsal=%s%s roll=%s flip=%s',k,o.axis,o.dorsalSign>0?'+':'-',o.dorsalAxis,(o.roll/Math.PI).toFixed(2)+'pi',o.flip);
  const e=new THREE.Euler().setFromQuaternion(o.quaternion);
  console.log('   resolver quat as euler:',[e.x,e.y,e.z].map(v=>+(v/Math.PI).toFixed(3)),'(xpi)');
  console.log('   scene.rotation now    :',t.scene.rotation.toArray().slice(0,3).map(v=>+(v/Math.PI).toFixed(3)),'(xpi)');
  // where does the long axis actually end up?
  t.scene.updateMatrixWorld(true);
  const b=new THREE.Box3().setFromObject(t.scene), s=b.getSize(new THREE.Vector3());
  console.log('   resulting size:',s.toArray().map(v=>+v.toFixed(3)));
}
