import fs from 'node:fs'; import vm from 'node:vm';
globalThis.window=globalThis; globalThis.devicePixelRatio=3;
vm.runInThisContext(fs.readFileSync('data.js','utf8'),{filename:'data.js'});
const { default: Art3D } = await import('../shark3d.js');
const rows=globalThis.RF?.RFD?.SHARKS||globalThis.RFD?.SHARKS||[];
const rig=Art3D.buildShark(rows.find(d=>d.id==='reef'));
const body=rig.parts.body;
let n=body,depth=0;
while(n&&depth<8){
  console.log('depth',depth,'name',JSON.stringify(n.name),'type',n.type,
   'hasMorphRecord',!!n.userData?.rfL2MorphRecord,'hasLowerJaw',!!n.getObjectByName?.('LowerJaw'));
  n=n.parent;depth++;
}
console.log('gape record on group:',JSON.stringify(rig.group.userData.rfMorph?.gape));
