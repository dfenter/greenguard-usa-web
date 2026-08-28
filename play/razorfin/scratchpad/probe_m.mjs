import fs from 'node:fs'; import vm from 'node:vm';
globalThis.window=globalThis; globalThis.devicePixelRatio=3;
vm.runInThisContext(fs.readFileSync('data.js','utf8'),{filename:'data.js'});
const { default: Art3D } = await import('../shark3d.js');
const rows=globalThis.RF?.RFD?.SHARKS||globalThis.RFD?.SHARKS||[];
const rig=Art3D.buildShark(rows.find(d=>d.id==='reef'));
let face=null; rig.group.traverse(o=>{if(o.material?.userData?.rfTexturedFace)face=o;});
console.log(JSON.stringify(face.userData.rfFaceMetrics,null,1));
