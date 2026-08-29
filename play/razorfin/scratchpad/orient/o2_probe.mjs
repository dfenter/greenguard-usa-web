import fs from 'node:fs'; import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
const BASE='/Users/lucille/greenguard-usa-web/play/razorfin';
globalThis.window=globalThis; globalThis.devicePixelRatio=3;
vm.runInThisContext(fs.readFileSync(BASE+'/data.js','utf8'),{filename:'data.js'});
await import(pathToFileURL(BASE+'/shark3d.js'));
const A=globalThis.RF.Art3D; await A.preload();
const KEYS=['greatwhite_cy','thresher','tigershark','whaler','sharky'];
for(const k of KEYS){
  const t=A.residentTemplates().find(x=>x.key===k);
  if(!t){console.log(k,'MISSING');continue;}
  t.scene.updateMatrixWorld(true);
  const P=(n)=>{const o=t.scene.getObjectByName(n); if(!o)return null;
    return new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);};
  const head=P('Head')||P('Nose'), jaw=P('LowerJaw')||P('Jaw');
  const tail=P('Tail3')||P('Tail2')||P('Tail1');
  const f=(v)=>v?v.toArray().map(x=>+x.toFixed(4)).join(','):'null';
  // geometry bbox in the RESOLVED (post-prepareTemplate) frame
  const box=new THREE.Box3(); const pts=[];
  t.scene.traverse(o=>{ if(!o.isMesh||!o.geometry?.attributes?.position)return;
    const pos=o.geometry.attributes.position;
    const step=Math.max(1,Math.floor(pos.count/4000));
    for(let i=0;i<pos.count;i+=step){
      const v=new THREE.Vector3().fromBufferAttribute(pos,i).applyMatrix4(o.matrixWorld);
      pts.push(v); box.expandByPoint(v);} });
  const sz=box.getSize(new THREE.Vector3());
  console.log('=== '+k);
  console.log('  bbox size', f(sz));
  console.log('  head',f(head),' jaw',f(jaw),' tail',f(tail));
  if(head&&jaw) console.log('  jaw-head',f(jaw.clone().sub(head)));
  if(head&&tail) console.log('  head.x-tail.x', (head.x-tail.x).toFixed(4), '=> head is at', head.x>tail.x?'+X (GOOD)':'-X (BACKWARDS)');
  const bones=[]; t.scene.traverse(o=>{if(o.isBone)bones.push(o.name);});
  console.log('  bones:',bones.join(','));
}
