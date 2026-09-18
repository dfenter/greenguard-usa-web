/* Razorfin Rev 18 lane 4: enforce JW-1 from hse/JAW-WEIGHT-SPEC.md.
 *
 * Walks EVERY edge of the exported mesh and fails when the LowerJaw weight
 * difference across it exceeds what the 3x stretch bar allows:
 *
 *     |dW|  <=  S * restLen / (arm * theta)        S = 2.0
 *
 * That bound is the 3x bar restated, not a proxy for it: an edge stretches by
 * 1 + |dW| * arm * theta / restLen under the jaw rotation, so |dW| at the
 * bound is exactly stretch 3.0. See the spec section "Where S = 2.0 comes
 * from".
 *
 * Usage: node --import ./tools/reg.mjs hse/jaw_weight_test.mjs <glb...>
 * Exit 0 = all families pass, 1 = at least one edge violates JW-1.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
globalThis.self = globalThis; globalThis.window = globalThis;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(HERE, '..');
const THREE = await import('three');
const { GLTFLoader } = await import(path.join(HERE, '../../_shared/three/GLTFLoader.js'));
const { resolveOpenRadians, loadRecipeForFamily } =
  await import(path.join(HERE, 'jaw_gate_config.mjs'));

/* JW-1. The 3x gate bar expressed as a weight bound. Not tunable by env:
 * the bar lives in the file so a run cannot be argued into passing. */
const STRETCH_BAR = 3.0;
const S = STRETCH_BAR - 1.0;

const loadGlb = (f) => new Promise((res, rej) => {
  const b = fs.readFileSync(f);
  new GLTFLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', res, rej);
});

function jawW(mesh, bi, vi) {
  const si = mesh.geometry.getAttribute('skinIndex');
  const sw = mesh.geometry.getAttribute('skinWeight');
  let s = 0;
  for (let k = 0; k < 4; k++) if (si.getComponent(vi, k) === bi) s += sw.getComponent(vi, k);
  return s;
}

const pct = (arr, p) => {
  const a = arr.slice().sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor(a.length * p))];
};

let failed = 0;
let families = 0;

for (const file of process.argv.slice(2)) {
  const base = path.basename(file);
  const g = await loadGlb(file);
  let mesh = null;
  g.scene.traverse((o) => { if (!mesh && o.isSkinnedMesh) mesh = o; });
  if (!mesh) { console.log(`${base.padEnd(24)} FAIL  no skinned mesh`); failed++; continue; }

  const bones = mesh.skeleton.bones;
  const jawIdx = bones.findIndex((b) => b.name === 'LowerJaw');
  const jaw = bones[jawIdx];
  if (jawIdx < 0) { console.log(`${base.padEnd(24)} FAIL  no LowerJaw bone`); failed++; continue; }

  /* theta from the recipe via the shared resolver, never a literal. */
  const family = base.replace(/\.glb$/i, '');
  const recipe = await loadRecipeForFamily(family, { fs, path, rootDir: ROOT_DIR });
  const theta = resolveOpenRadians(process.env, recipe).radians;

  mesh.geometry.computeBoundingBox();
  const sz = new THREE.Vector3();
  mesh.geometry.boundingBox.getSize(sz);
  const L = Math.max(sz.x, sz.y, sz.z);

  const pos = mesh.geometry.getAttribute('position');
  const n = pos.count;
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = jawW(mesh, jawIdx, i);

  /* Hinge = the ACTUAL LowerJaw bone origin, which is what the mesh is posed
   * about.  count_cliffs.mjs derives a hinge from percentiles of the jaw
   * weight cloud (5th pct y, 95th pct z); lane 4 measured that estimate at
   * z=-0.384 on snapjaw against a true bone origin of z=-0.053, an ~8x error
   * in the moment arm, which made this test under-predict stretch by ~2.5x
   * (5.41x predicted vs 12.65x measured on snapjaw's worst edge) and so let
   * edges through that the real gate fails.  Never estimate a quantity the
   * file already contains exactly. */
  const ids = [];
  for (let i = 0; i < n; i++) if (w[i] > 0.05) ids.push(i);
  if (ids.length < 8) { console.log(`${base.padEnd(24)} FAIL  jaw cloud too small (${ids.length})`); failed++; continue; }
  mesh.updateMatrixWorld(true);
  const jawOrigin = new THREE.Vector3().setFromMatrixPosition(jaw.matrixWorld);
  const hingeY = jawOrigin.y;
  const jawZ = jawOrigin.z;

  const idx = mesh.geometry.getIndex().array;
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  const seen = new Set();
  let considered = 0;
  const bad = [];
  let worstRatio = 0;

  for (let t = 0; t + 2 < idx.length; t += 3) {
    const tri = [idx[t], idx[t + 1], idx[t + 2]];
    for (const [p, q] of [[tri[0], tri[1]], [tri[1], tri[2]], [tri[2], tri[0]]]) {
      const k = p < q ? `${p}:${q}` : `${q}:${p}`;
      if (seen.has(k)) continue;
      seen.add(k);
      /* Both ends rigid -> no differential motion, nothing to bound. */
      if (w[p] <= 0 && w[q] <= 0) continue;
      a.fromBufferAttribute(pos, p);
      b.fromBufferAttribute(pos, q);
      const rest = a.distanceTo(b) / L;
      if (rest < 1e-9) continue;
      const arm = Math.hypot((a.y + b.y) / 2 - hingeY, (a.z + b.z) / 2 - jawZ) / L;
      if (arm < 1e-9) continue;
      considered++;
      const bound = S * rest / (arm * theta);
      const d = Math.abs(w[p] - w[q]);
      const ratio = d / bound;
      if (ratio > worstRatio) worstRatio = ratio;
      if (d > bound) bad.push({ d, bound, rest, arm, p, q, wp: w[p], wq: w[q], ratio });
    }
  }

  families++;
  bad.sort((x, y) => y.ratio - x.ratio);
  const ok = bad.length === 0;
  if (!ok) failed++;
  console.log(
    `${base.padEnd(24)} ${ok ? 'PASS' : 'FAIL'}  theta=${theta.toFixed(4)}  ` +
    `edges=${considered}  violations=${bad.length}  worst |dW|/bound=${worstRatio.toFixed(3)}`);
  for (const r of bad.slice(0, 5)) {
    /* Implied stretch, so a failure reads in the same units as probe_jaw. */
    const stretch = 1 + r.d * r.arm * theta / r.rest;
    console.log(
      `    |dW|=${r.d.toFixed(3)} bound=${r.bound.toFixed(3)} ` +
      `restL=${r.rest.toExponential(2)}L arm=${r.arm.toFixed(4)}L ` +
      `jawW=${r.wp.toFixed(3)}/${r.wq.toFixed(3)} -> stretch~${stretch.toFixed(2)}x`);
  }
}

console.log(`\njaw_weight_test: ${families - failed}/${families} families satisfy JW-1 (bar ${STRETCH_BAR}x)`);
process.exit(failed ? 1 : 0);
