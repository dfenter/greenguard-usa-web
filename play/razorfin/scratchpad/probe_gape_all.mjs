import fs from 'node:fs'; import vm from 'node:vm';
globalThis.window=globalThis; globalThis.devicePixelRatio=3;
vm.runInThisContext(fs.readFileSync('data.js','utf8'),{filename:'data.js'});
const { default: Art3D } = await import('../shark3d.js');
const rows=globalThis.RF?.RFD?.SHARKS||globalThis.RFD?.SHARKS||[];
let open=0,closed=0,none=0,fail=0; const reasons={};
for(const def of rows){
  try{
    const rig=Art3D.buildShark(def); const g=rig.group.userData.rfMorph?.gape;
    if(!g){none++;continue;}
    if(g.applied){open++;} else {closed++;reasons[g.reason]=(reasons[g.reason]||0)+1;}
  }catch(e){fail++;}
}
console.log('rows',rows.length,'gapeOPEN',open,'gapeCLOSED',closed,'noRecord(untextured)',none,'buildFail',fail);
console.log(reasons);
