import fs from 'node:fs'; import vm from 'node:vm';
import * as THREE from 'three';
globalThis.window=globalThis; globalThis.devicePixelRatio=3;
vm.runInThisContext(fs.readFileSync('data.js','utf8'),{filename:'data.js'});
const { default: Art3D } = await import('../shark3d.js');
const rows=globalThis.RF?.RFD?.SHARKS||globalThis.RFD?.SHARKS||[];
for(const id of (process.env.IDS||'reef,tiger,hammerhead,greatwhite,blue,megalodon,zeusfin,typhonmaw').split(',')){
  const def=rows.find(d=>d.id===id); if(!def){console.log(id,'NODEF');continue;}
  const rig=Art3D.buildShark(def);
  const m=rig.group.userData.rfMorph;
  const g=m?.gape;
  console.log(id.padEnd(12), g? (g.applied?('OPEN '+g.degrees+'deg sign='+g.sign+' travel='+g.travelRatio):('CLOSED: '+g.reason)) : 'no gape record', ' neutral='+m?.neutral);
}
