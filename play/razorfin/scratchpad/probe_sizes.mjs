import fs from 'node:fs'; import vm from 'node:vm';
globalThis.window=globalThis; globalThis.devicePixelRatio=3;
vm.runInThisContext(fs.readFileSync('data.js','utf8'),{filename:'data.js'});
const { default: Art3D } = await import('../shark3d.js');
const rows=globalThis.RF?.RFD?.SHARKS||globalThis.RFD?.SHARKS||[];
console.log('row           eyeDia/L  (bar .10-.14)   teeth  gapeDeg  seatConf');
let inband=0,tot=0;
for(const id of (process.env.IDS||'reef,tiger,hammerhead,greatwhite,blue,megalodon,zeusfin,typhonmaw').split(',')){
  const def=rows.find(d=>d.id===id); if(!def)continue;
  const rig=Art3D.buildShark(def);
  let face=null; rig.group.traverse(o=>{if(o.material?.userData?.rfTexturedFace)face=o;});
  const g=rig.group.userData.rfMorph?.gape;
  if(!face){console.log(id.padEnd(14),'HELD (no overlay)                       ',(g?.degrees??'-'));continue;}
  const m=face.userData.rfFaceMetrics;
  const dia=2*m.eyeRadius/m.headSpan; tot++; if(dia>=0.10&&dia<=0.14)inband++;
  console.log(id.padEnd(14),dia.toFixed(4).padEnd(10),(dia>=0.10&&dia<=0.14?'IN ':'OUT').padEnd(14),
    String(m.toothCount).padEnd(6),String(g?.degrees??'-').padEnd(8),m.seatConfidence.toFixed(3));
}
console.log('eye diameter in 0.10-0.14 L band:',inband+'/'+tot);
