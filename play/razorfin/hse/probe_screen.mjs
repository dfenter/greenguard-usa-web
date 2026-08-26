/* Where does each face part land in SCREEN space, using the exact camera the
   headview page builds? This settles whether the parts are mispositioned or
   merely outside the framing. */
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path';
import { fileURLToPath } from 'node:url'; import * as THREE from 'three';
const BASE=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
globalThis.window=globalThis; globalThis.devicePixelRatio=3;
vm.runInThisContext(fs.readFileSync(path.join(BASE,'data.js'),'utf8'),{filename:'data.js'});
const { default: Art3D } = await import('../shark3d.js');
const rows=globalThis.RFD?.SHARKS||[];
const def=rows.find(d=>d.id===(process.env.ID||'reef'));
const rig=Art3D.buildShark(def); const g=rig.group; g.updateMatrixWorld(true);
const body=rig.parts.body;
let face=null; g.traverse(o=>{if(o.userData?.rfTexturedFace)face=o;});
const W=900,H=700;
const box=new THREE.Box3().setFromObject(body); const size=box.getSize(new THREE.Vector3());
const noseX=box.max.x, cy=(box.min.y+box.max.y)/2, cz=(box.min.z+box.max.z)/2;
const headLen=size.x*0.22, cx=noseX-headLen*0.45;
const cam=new THREE.PerspectiveCamera(32,W/H,0.1,20000);
const dist=headLen*3.1;
cam.position.set(cx+dist*0.72, cy+dist*0.34, cz+dist*0.62);
cam.lookAt(cx,cy,cz); cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
const sk=face.skeleton; sk.update();
const geo=face.geometry,pos=geo.getAttribute('position'),kind=geo.getAttribute('rfFaceKind');
const si=geo.getAttribute('skinIndex'),sw=geo.getAttribute('skinWeight');
const bm=face.bindMatrix,bmi=face.bindMatrixInverse;
const tmp=new THREE.Matrix4(),v=new THREE.Vector3(),sv=new THREE.Vector3();
const acc={};
for(let i=0;i<pos.count;i++){
  v.fromBufferAttribute(pos,i); sv.copy(v).applyMatrix4(bm);
  const out=new THREE.Vector3();
  for(let k=0;k<4;k++){const w=sw.getComponent(i,k); if(!w)continue;
    tmp.fromArray(sk.boneMatrices, si.getComponent(i,k)*16);
    out.addScaledVector(new THREE.Vector3().copy(sv).applyMatrix4(tmp), w);}
  out.applyMatrix4(bmi).applyMatrix4(face.matrixWorld);
  const p=out.clone().project(cam);
  const sx=(p.x*0.5+0.5)*W, sy=(-p.y*0.5+0.5)*H;
  const k=Math.round(kind.getX(i));
  (acc[k]=acc[k]||{x:[Infinity,-Infinity],y:[Infinity,-Infinity],n:0,vis:0});
  const a=acc[k]; a.n++;
  a.x[0]=Math.min(a.x[0],sx);a.x[1]=Math.max(a.x[1],sx);
  a.y[0]=Math.min(a.y[0],sy);a.y[1]=Math.max(a.y[1],sy);
  if(sx>=0&&sx<W&&sy>=0&&sy<H&&p.z>-1&&p.z<1)a.vis++;
}
// body for reference
const bacc={x:[Infinity,-Infinity],y:[Infinity,-Infinity]};
const bp=body.geometry.getAttribute('position');
for(let i=0;i<bp.count;i+=7){const q=new THREE.Vector3().fromBufferAttribute(bp,i);body.applyBoneTransform(i,q);
  q.applyMatrix4(body.matrixWorld).project(cam);
  const sx=(q.x*0.5+0.5)*W, sy=(-q.y*0.5+0.5)*H;
  bacc.x[0]=Math.min(bacc.x[0],sx);bacc.x[1]=Math.max(bacc.x[1],sx);
  bacc.y[0]=Math.min(bacc.y[0],sy);bacc.y[1]=Math.max(bacc.y[1],sy);}
console.log('viewport '+W+'x'+H);
console.log('BODY screen x['+bacc.x[0].toFixed(0)+','+bacc.x[1].toFixed(0)+'] y['+bacc.y[0].toFixed(0)+','+bacc.y[1].toFixed(0)+']');
const N=['socket','sclera','pupil','highlight','brow','tooth','lip'];
for(const k of Object.keys(acc)){const a=acc[k];
  console.log('  '+(N[k]||k).padEnd(10)+' screen x['+a.x[0].toFixed(0)+','+a.x[1].toFixed(0)+'] y['+a.y[0].toFixed(0)+','+a.y[1].toFixed(0)+'] onscreen '+a.vis+'/'+a.n);}
