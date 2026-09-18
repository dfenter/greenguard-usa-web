/* Jaw closed/open contact sheet, posed through the SAME path probe_jaw uses
 * (bind quaternion, then rotateOnAxis(+X, OPEN_RAD)) so what is drawn is what
 * the gate measures. Head-on side view of the head; edges coloured by stretch:
 * grey <=1.5x, amber <=3x, red >3x (the gate's failing set). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from './_png.mjs';
globalThis.self = globalThis; globalThis.window = globalThis;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const THREE = await import('three');
const { GLTFLoader } = await import(path.join(HERE, '../../_shared/three/GLTFLoader.js'));

const OPEN_RAD = Number(process.env.OPEN_RAD ?? 0.72);
const AXIS = new THREE.Vector3(1, 0, 0);
const TW = 560, TH = 420;

const loadGlb = (f) => new Promise((res, rej) => {
  const b = fs.readFileSync(f);
  new GLTFLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', res, rej);
});
/* Pose from the SCENE ROOT, never from the mesh or the bone: the exporter
 * parents the bones under a sibling low_rig Object3D, so mesh.updateMatrixWorld
 * never reaches a bone and jawBone.updateMatrixWorld recomputes against a stale
 * parent chain. Either way Skeleton.update() reads an identity bone matrixWorld
 * and produces boneMatrix = boneInverse instead of the bind pose, which is the
 * probe_jaw defect this sheet shared. See the note in hse/probe_jaw.mjs. */
function baked(mesh, root) {
  root.updateMatrixWorld(true);
  const p = mesh.geometry.getAttribute('position'), out = new Float32Array(p.count*3), v = new THREE.Vector3();
  for (let i=0;i<p.count;i++){ v.fromBufferAttribute(p,i); mesh.applyBoneTransform(i,v); out[3*i]=v.x;out[3*i+1]=v.y;out[3*i+2]=v.z; }
  return out;
}

function renderTile(pos, edges, bounds, title, sub) {
  const img = new PNG(TW, TH, [14,16,20]);
  const { minA, maxA, minB, maxB } = bounds;
  const pad = 26;
  const sx = (TW-2*pad)/Math.max(1e-9,(maxA-minA)), sy = (TH-2*pad-24)/Math.max(1e-9,(maxB-minB));
  const s = Math.min(sx, sy);
  const ox = pad + ((TW-2*pad) - (maxA-minA)*s)/2;
  const oy = pad + 24 + ((TH-2*pad-24) - (maxB-minB)*s)/2;
  // A = along body (y), B = vertical (z); flip B so up is up
  const P = (i) => [ ox + (pos[3*i+1]-minA)*s, TH - (oy + (pos[3*i+2]-minB)*s) ];
  // two passes: quiet mesh first, then the stretched seam on top
  let n=0;
  for (const e of edges) {
    const st=e[2]; if (st > 1.5) continue;
    if ((n++ % 3) !== 0) continue;           // thin the background mesh
    const [x0,y0]=P(e[0]), [x1,y1]=P(e[1]);
    img.line(x0,y0,x1,y1,[58,66,80],1);
  }
  for (const e of edges) {
    const st=e[2]; if (st <= 1.5) continue;
    const col = st > 3 ? [255,64,54] : [255,176,32];
    const [x0,y0]=P(e[0]), [x1,y1]=P(e[1]);
    img.line(x0,y0,x1,y1,col, st>3?2:1);
  }
  img.text(10, 8, title, [235,240,248], 2);
  img.text(10, 26, sub, [150,160,175], 1);
  return img;
}

const files = process.argv.slice(2);
const OUT = process.env.SHEET_OUT || 'assets/review/rev17_jaw_contact.png';
const rows = [];
for (const file of files) {
  const name = path.basename(file, '.glb');
  const gltf = await loadGlb(file);
  let mesh = null; gltf.scene.traverse(o => { if (!mesh && o.isSkinnedMesh) mesh = o; });
  const jawBone = mesh.skeleton.bones.find(b => b.name === 'LowerJaw');
  const bindQuat = jawBone.quaternion.clone();

  jawBone.quaternion.copy(bindQuat);
  const rest = baked(mesh, gltf.scene);
  jawBone.quaternion.copy(bindQuat); jawBone.rotateOnAxis(AXIS, OPEN_RAD);
  const open = baked(mesh, gltf.scene);

  // per-vertex LowerJaw weight, to restrict drawing to the mouth region
  const jawI = mesh.skeleton.bones.findIndex(b=>b.name==='LowerJaw');
  const si=mesh.geometry.getAttribute('skinIndex'), sw=mesh.geometry.getAttribute('skinWeight');
  const nV=mesh.geometry.getAttribute('position').count; const jw=new Float32Array(nV);
  for(let i=0;i<nV;i++){ let w=0; for(let k=0;k<4;k++) if(si.getComponent(i,k)===jawI) w+=sw.getComponent(i,k); jw[i]=w; }
  const idx = mesh.geometry.getIndex().array;
  const eLen=(A,p,q)=>Math.hypot(A[3*p]-A[3*q],A[3*p+1]-A[3*q+1],A[3*p+2]-A[3*q+2]);
  const seen=new Set(); const edgesR=[], edgesO=[];
  let worst=1;
  for(let t=0;t<idx.length;t+=3){
    const tri=[idx[t],idx[t+1],idx[t+2]];
    for(const [p,q] of [[tri[0],tri[1]],[tri[1],tri[2]],[tri[2],tri[0]]]){
      const k=p<q?p*1e7+q:q*1e7+p; if(seen.has(k))continue; seen.add(k);
      const r=eLen(rest,p,q); if(r<1e-6)continue;
      const st=eLen(open,p,q)/r; if(st>worst)worst=st;
      edgesR.push([p,q,1,Math.max(jw[p],jw[q])]); edgesO.push([p,q,st,Math.max(jw[p],jw[q])]);
    }
  }
  // Frame on the HEAD: front 40% along the body axis (y), using rest pose.
  const ys=[],zs=[];
  for(let i=0;i<rest.length/3;i++){ ys.push(rest[3*i+1]); zs.push(rest[3*i+2]); }
  const ymin=Math.min(...ys), ymax=Math.max(...ys);
  // jaw sits at the low-y or high-y end; pick the end nearest the jaw bone
  const jy = new THREE.Vector3().setFromMatrixPosition(jawBone.matrixWorld).y;
  const nearMin = Math.abs(jy-ymin) < Math.abs(jy-ymax);
  // Region of interest = jaw-weighted verts UNION the endpoints of every
  // failing edge. snapjaw's tears sit mid-body, so a fixed nose crop hides
  // exactly the thing being reviewed.
  const roi=[];
  for(let i=0;i<rest.length/3;i++) if(jw[i]>0.02) roi.push(rest[3*i+1]);
  for(const e of edgesO) if(e[2]>3){ roi.push(rest[3*e[0]+1]); roi.push(rest[3*e[1]+1]); }
  const span0=(ymax-ymin)*0.42;
  let a0, a1;
  if(roi.length){
    const lo=Math.min(...roi), hi=Math.max(...roi);
    const padY=Math.max((hi-lo)*0.25,(ymax-ymin)*0.05);
    a0=lo-padY; a1=hi+padY;
  } else {
    a0 = nearMin ? ymin : ymax-span0; a1 = nearMin ? ymin+span0 : ymax;
  }
  const keep=(i)=> rest[3*i+1]>=a0-1e-9 && rest[3*i+1]<=a1+1e-9;
  const zk=[],yk=[]; for(let i=0;i<rest.length/3;i++) if(keep(i)){ zk.push(rest[3*i+2]); yk.push(rest[3*i+1]); }
  zk.sort((x,y)=>x-y);
  const pct=(arr,f)=>arr[Math.max(0,Math.min(arr.length-1,Math.floor(f*(arr.length-1))))];
  // trim 1% tails so a couple of stray verts do not blow out the framing
  yk.sort((x,y)=>x-y);
  const padA=(pct(yk,0.99)-pct(yk,0.01))*0.15, padB=(pct(zk,0.99)-pct(zk,0.01))*0.15;
  const bounds={minA:pct(yk,0.01)-padA,maxA:pct(yk,0.99)+padA,
                minB:pct(zk,0.01)-padB,maxB:pct(zk,0.99)+padB};
  // Draw the whole head crop; the seam edges carry the colour.
  const fR=edgesR.filter(e=>keep(e[0])&&keep(e[1]));
  const fO=edgesO.filter(e=>keep(e[0])&&keep(e[1]));
  const nBad=fO.filter(e=>e[2]>3).length;
  rows.push([
    renderTile(rest,fR,bounds,`${name}  CLOSED`,`bind pose`),
    renderTile(open,fO,bounds,`${name}  OPEN ${OPEN_RAD} rad`,`worst ${worst.toFixed(2)}x   red edges>3x: ${nBad}`)
  ]);
  console.log(`tile ${name} worst=${worst.toFixed(2)} badEdgesInCrop=${nBad}`);
}
const sheet = PNG.grid(rows, 10, [8,9,12]);
fs.writeFileSync(OUT, sheet.encode());
console.log('sheet ->', OUT);
