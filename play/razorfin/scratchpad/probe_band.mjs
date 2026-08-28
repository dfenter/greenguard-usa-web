import fs from 'node:fs'; import vm from 'node:vm';
globalThis.window=globalThis; globalThis.devicePixelRatio=3;
vm.runInThisContext(fs.readFileSync('data.js','utf8'),{filename:'data.js'});
const { default: Art3D } = await import('../shark3d.js');
const rows=globalThis.RF?.RFD?.SHARKS||globalThis.RFD?.SHARKS||[];
for(const id of ['reef','blue','greatwhite']){
  const rig=Art3D.buildShark(rows.find(d=>d.id===id));
  let f=null; rig.group.traverse(o=>{if(o.material?.userData?.rfTexturedFace)f=o;});
  if(!f){console.log(id,'HELD');continue;}
  const m=f.userData.rfFaceMetrics;
  console.log(id.padEnd(11),'mouthSource='+m.mouthSource,
    ' toothSurfMedian='+m.toothSurfaceMedianRatio.toFixed(4),
    ' toothSurfMax='+m.toothSurfaceMaxRatio.toFixed(4),
    ' eyeSurfMedian='+m.eyeSurfaceMedianRatio.toFixed(4));
}
