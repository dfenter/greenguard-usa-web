import fs from 'node:fs'; import vm from 'node:vm';
globalThis.window=globalThis; globalThis.devicePixelRatio=3;
vm.runInThisContext(fs.readFileSync('data.js','utf8'),{filename:'data.js'});
const { default: Art3D } = await import('../shark3d.js');
const rows=globalThis.RF?.RFD?.SHARKS||globalThis.RFD?.SHARKS||[];
const KIND={0:'socket',1:'sclera',2:'pupil',3:'highlight',4:'brow',5:'tooth',6:'lip',7:'cavity'};
for(const id of (process.env.IDS||'reef,tiger,hammerhead,greatwhite,blue,megalodon,zeusfin,typhonmaw').split(',')){
  const def=rows.find(d=>d.id===id); if(!def)continue;
  const rig=Art3D.buildShark(def);
  let face=null; rig.group.traverse(o=>{if(o.material?.userData?.rfTexturedFace)face=o;});
  const f=rig.group.userData.rfFace;
  if(!face){console.log(id.padEnd(12),'NO FACE MESH (held)', f?'metrics present':'');continue;}
  const k=face.geometry.getAttribute('rfFaceKind');
  const c={};for(let i=0;i<k.count;i++){const n=KIND[Math.round(k.getX(i))]||'?';c[n]=(c[n]||0)+1;}
  console.log(id.padEnd(12),'verts',k.count,JSON.stringify(c));
}
