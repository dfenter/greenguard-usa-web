/* Lane A6: prove the runtime sign flip renders the SAME pose as before.
 * Reproduces shark3d.js animate(): quaternion.copy(baseJawQuaternion) then
 * rotateX(JAW_HINGE_SIGN * gape * JAW_MAX_ROTATION), and reports where the
 * jaw tip goes relative to the skull along the model's dorsal axis. */
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath} from 'node:url';
globalThis.self=globalThis; globalThis.window=globalThis;
const HERE=path.dirname(fileURLToPath(import.meta.url));
const THREE=await import('three');
const {GLTFLoader}=await import(path.join(HERE,'../../_shared/three/GLTFLoader.js'));
const SIGN=Number(process.env.JAW_HINGE_SIGN ?? -1), MAXROT=0.72;
const load=(f)=>new Promise((r,j)=>{const b=fs.readFileSync(f);new GLTFLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',r,j);});
function baked(m){m.updateMatrixWorld(true);const pa=m.geometry.getAttribute('position');
 const o=new Float32Array(pa.count*3),v=new THREE.Vector3();
 for(let i=0;i<pa.count;i++){v.fromBufferAttribute(pa,i);m.applyBoneTransform(i,v);o[3*i]=v.x;o[3*i+1]=v.y;o[3*i+2]=v.z;}return o;}
console.log(`shark3d animate(): rotateX(${SIGN} * gape * ${MAXROT})`);
for(const f of process.argv.slice(2)){
 const g=await load(f); let m=null; g.scene.traverse(o=>{if(!m&&o.isSkinnedMesh)m=o;});
 const bones=m.skeleton.bones, jaw=bones.find(b=>b.name==='LowerJaw'), ji=bones.indexOf(jaw);
 const si=m.geometry.getAttribute('skinIndex'), sw=m.geometry.getAttribute('skinWeight');
 const jset=[]; for(let i=0;i<si.count;i++){let s=0;for(let k=0;k<4;k++)if(si.getComponent(i,k)===ji)s+=sw.getComponent(i,k);if(s>0.5)jset.push(i);}
 const base=jaw.quaternion.clone();
 jaw.quaternion.copy(base);jaw.updateMatrixWorld(true);
 const shut=baked(m);
 jaw.quaternion.copy(base);jaw.rotateX(SIGN*1.0*MAXROT);jaw.updateMatrixWorld(true);
 const open=baked(m);
 jaw.quaternion.copy(base);jaw.updateMatrixWorld(true);
 let dz=0,dy=0; for(const i of jset){dz+=open[3*i+2]-shut[3*i+2];dy+=open[3*i+1]-shut[3*i+1];}
 dz/=jset.length; dy/=jset.length;
 // dorsal is +Z in this rig (jaw bone sits at zc - H*0.18), so ventral = -Z
 console.log(path.basename(f).padEnd(20),'jawverts',String(jset.length).padStart(4),
  ' dZ',dz.toFixed(5),' dY',dy.toFixed(5),
  ' ->', dz<0 ? 'OPENS VENTRALLY (correct)' : 'OPENS DORSALLY (WRONG - into skull)');
}
