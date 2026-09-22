/* Rev 18 residual A: dump the worst stretching edges POST-collapse. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
globalThis.self = globalThis; globalThis.window = globalThis;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const THREE = await import('three');
const { GLTFLoader } = await import(path.join(HERE, '../../_shared/three/GLTFLoader.js'));
const REST_RAD = Number(process.env.REST_RAD ?? 0);
/* Rev 18: same reconciliation as probe_jaw -- angle from the recipe, not a
 * hardcoded 0.72. See hse/jaw_gate_config.mjs. */
const { resolveOpenRadians, loadRecipeForFamily } = await import(path.join(HERE, 'jaw_gate_config.mjs'));
/* Rev 18 lane 7: the bar is an ABSOLUTE opened length, not the 3x ratio.
 * See hse/jaw_open_budget.mjs. Ratio stays as an informational column. */
const { MAX_OPEN_L, MAX_OPEN_PX, REFERENCE_BODY_PX } = await import(path.join(HERE, 'jaw_open_budget.mjs'));
const ROOT_DIR = path.join(HERE, '..');
const loadGlb = (f) => new Promise((res, rej) => { const b = fs.readFileSync(f); new GLTFLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', res, rej); });
function baked(mesh) { mesh.updateMatrixWorld(true); const p = mesh.geometry.getAttribute('position'); const o = new Float32Array(p.count*3); const v = new THREE.Vector3();
  for (let i=0;i<p.count;i++){ v.fromBufferAttribute(p,i); mesh.applyBoneTransform(i,v); o[i*3]=v.x;o[i*3+1]=v.y;o[i*3+2]=v.z; } return o; }
function w(mesh, bi, vi){ const si=mesh.geometry.getAttribute('skinIndex'), sw=mesh.geometry.getAttribute('skinWeight'); let s=0; for(let k=0;k<4;k++) if(si.getComponent(vi,k)===bi) s+=sw.getComponent(vi,k); return s; }
for (const file of process.argv.slice(2)) {
  const g = await loadGlb(file); let mesh=null; g.scene.traverse(o=>{ if(!mesh&&o.isSkinnedMesh) mesh=o; });
  const bones = mesh.skeleton.bones; const jawIdx = bones.findIndex(b=>b.name==='LowerJaw'); const jaw=bones[jawIdx];
  mesh.geometry.computeBoundingBox(); const sz=new THREE.Vector3(); mesh.geometry.boundingBox.getSize(sz);
  const L = Math.max(sz.x,sz.y,sz.z);
  /* Rev 18 residual A, same defect probe_jaw had: posing `rotation.x`
   * ABSOLUTELY ignores the ~3.07 rad rest rotation every family GLB exports,
   * which crushes edges and fabricates stretch. Pose from the authored base
   * and rotate about the hinge axis, exactly as rig_morph.writeJawGape does. */
  const family = path.basename(file).replace(/\.glb$/i, '');
  const recipe = await loadRecipeForFamily(family, { fs, path, rootDir: ROOT_DIR });
  const open = resolveOpenRadians(process.env, recipe);
  const OPEN_RAD = open.radians;
  const HINGE = new THREE.Vector3(1, 0, 0);
  const jawBase = jaw.quaternion.clone();
  const pose = (rad) => { jaw.quaternion.copy(jawBase); if (rad) jaw.rotateOnAxis(HINGE, rad); jaw.updateMatrixWorld(true); };
  pose(REST_RAD); const R = baked(mesh);
  pose(OPEN_RAD); const O = baked(mesh);
  const idx = mesh.geometry.getIndex().array;
  const el=(A,a,b)=>Math.hypot(A[a*3]-A[b*3],A[a*3+1]-A[b*3+1],A[a*3+2]-A[b*3+2]);
  const rows=[]; const seen=new Set();
  for(let t=0;t+2<idx.length;t+=3){ const a=idx[t],b=idx[t+1],c=idx[t+2];
    for(const [p,q] of [[a,b],[b,c],[c,a]]){ const k=p<q?p+':'+q:q+':'+p; if(seen.has(k))continue; seen.add(k);
      const rl=el(R,p,q); if(rl<1e-9) continue; const ol=el(O,p,q);
      /* grew = ABSOLUTE opening, the gate quantity. s = ratio, informational. */
      rows.push({s:ol/rl, grew:(ol-rl)/L, rl, ol, p, q}); } }
  /* Sort by what the gate actually measures. */
  rows.sort((x,y)=>y.grew-x.grew);
  console.log('\n=== ' + path.basename(file) + '  L=' + L.toFixed(4) + '  verts=' + mesh.geometry.getAttribute('position').count + '  edges=' + rows.length);
  console.log(`  BAR: opened length <= ${MAX_OPEN_L}L (${MAX_OPEN_PX}px on a ${REFERENCE_BODY_PX}px body). Ratio is informational.`);
  console.log('  worst edges BY ABSOLUTE OPENING:');
  for (const r of rows.slice(0,8)) {
    const px = r.grew * REFERENCE_BODY_PX;
    console.log(`  grew=${r.grew.toExponential(2)}L (${px.toFixed(1)}px) ${r.grew<=MAX_OPEN_L?'ok':'OVER'}  [info stretch=${r.s.toFixed(3)}x] restL=${(r.rl/L).toExponential(2)}L openL=${(r.ol/L).toExponential(2)}L jawW=${w(mesh,jawIdx,r.p).toFixed(3)}/${w(mesh,jawIdx,r.q).toFixed(3)}`);
  }
  const over = rows.filter(r=>r.grew>MAX_OPEN_L);
  console.log(`  edges over budget: ${over.length}   worst opening=${rows[0].grew.toExponential(2)}L (${(rows[0].grew*REFERENCE_BODY_PX).toFixed(1)}px)`);
  const byRatio = rows.slice().sort((x,y)=>y.s-x.s);
  console.log(`  [info] worst RATIO edge: ${byRatio[0].s.toFixed(3)}x, which opens only ${(byRatio[0].grew*REFERENCE_BODY_PX).toFixed(1)}px`);
  // how many edges exceed 3x, and their rest-length distribution
  const bad = rows.filter(r=>r.s>3);
  const lens = rows.map(r=>r.rl/L).sort((a,b)=>a-b);
  console.log(`  edges>3x: ${bad.length}  medianRest=${lens[lens.length>>1].toExponential(2)}L  p01Rest=${lens[Math.floor(lens.length*0.01)].toExponential(2)}L`);
  if (bad.length) { const bl = bad.map(r=>r.rl/L).sort((a,b)=>a-b); console.log(`  bad rest range: ${bl[0].toExponential(2)}L .. ${bl[bl.length-1].toExponential(2)}L`); }
}
