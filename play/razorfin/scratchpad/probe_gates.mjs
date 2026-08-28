import fs from 'node:fs'; import vm from 'node:vm';
globalThis.window=globalThis; globalThis.devicePixelRatio=3;
vm.runInThisContext(fs.readFileSync('data.js','utf8'),{filename:'data.js'});
const { default: Art3D } = await import('../shark3d.js');
const { checkTexturedFace } = await import('../hse/face_textured.js');
const rows=globalThis.RF?.RFD?.SHARKS||globalThis.RFD?.SHARKS||[];
let ok=0,bad=0,held=0; const msgs={};
for(const def of rows){
  let rig; try{rig=Art3D.buildShark(def);}catch(e){continue;}
  let face=null; rig.group.traverse(o=>{if(o.material?.userData?.rfTexturedFace)face=o;});
  if(!face){held++;continue;}
  const m=face.userData.rfFaceMetrics;
  const fails=checkTexturedFace(m);
  if(fails&&fails.length){bad++;for(const s of fails)msgs[s.replace(/[\d.]+/g,'N')]=(msgs[s.replace(/[\d.]+/g,'N')]||0)+1;}
  else ok++;
}
console.log('numeric face gates: PASS',ok,'FAIL',bad,'held/noface',held);
console.log(msgs);
