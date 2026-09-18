/* Razorfin Rev 18 lane 5: edge-length histogram of the JAW BAND on the
 * EXPORTED mesh, with the JW-1 minimum length each edge would need.
 *
 * The band is defined exactly as the lane-5 decimator constraint defines it:
 * an edge is IN BAND when either endpoint has jawW strictly inside
 * (JAW_WEIGHT_FLOOR, 1) - i.e. it is partially jaw-driven, so the two ends
 * move differentially and the edge can tear.  Edges with both ends at 0 or
 * both ends at 1 ride rigidly and are excluded.
 *
 * Per edge, JW-1 rearranged for restLen gives the length the edge must keep:
 *
 *     L_min(edge) = |dW| * arm * theta / S        S = 2.0 (the 3x bar)
 *
 * so the histogram is reported against each edge's OWN requirement, not a
 * single global length.  Columns: how many band edges are shorter than what
 * JW-1 demands of them, and by how much.
 *
 * Usage: node --import ./tools/reg.mjs hse/band_edge_hist.mjs <glb...>
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

/* Mirrors tools/sharklib/mouth.py JAW_WEIGHT_FLOOR_* smoothstep band start. */
const FLOOR = 0.08;
const S = 2.0;

/* log-spaced buckets in units of L */
const EDGES = [0, 1e-5, 3e-5, 1e-4, 3e-4, 1e-3, 3e-3, 1e-2, 3e-2, Infinity];
const LABELS = ['<1e-5', '1e-5', '3e-5', '1e-4', '3e-4', '1e-3', '3e-3', '1e-2', '>3e-2'];

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

for (const file of process.argv.slice(2)) {
  const base = path.basename(file);
  const family = base.replace(/\.glb$/i, '');
  const g = await loadGlb(file);
  let mesh = null;
  g.scene.traverse((o) => { if (!mesh && o.isSkinnedMesh) mesh = o; });
  if (!mesh) { console.log(`${base.padEnd(20)} no skinned mesh`); continue; }
  const bones = mesh.skeleton.bones;
  const jawIdx = bones.findIndex((b) => b.name === 'LowerJaw');
  if (jawIdx < 0) { console.log(`${base.padEnd(20)} no LowerJaw`); continue; }

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

  mesh.updateMatrixWorld(true);
  const jawOrigin = new THREE.Vector3().setFromMatrixPosition(bones[jawIdx].matrixWorld);
  const hingeY = jawOrigin.y, jawZ = jawOrigin.z;

  const inBand = (i) => w[i] > FLOOR && w[i] < 1.0;

  const idx = mesh.geometry.getIndex().array;
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  const seen = new Set();
  const hist = new Array(LABELS.length).fill(0);
  let band = 0, violate = 0, worstRatio = 0, worstInfo = null;
  const lens = [];
  for (let t = 0; t + 2 < idx.length; t += 3) {
    const tri = [idx[t], idx[t + 1], idx[t + 2]];
    for (const [p, q] of [[tri[0], tri[1]], [tri[1], tri[2]], [tri[2], tri[0]]]) {
      const k = p < q ? p + ':' + q : q + ':' + p;
      if (seen.has(k)) continue; seen.add(k);
      if (!inBand(p) && !inBand(q)) continue;
      a.fromBufferAttribute(pos, p); b.fromBufferAttribute(pos, q);
      const rest = a.distanceTo(b) / L;
      band++;
      lens.push(rest);
      for (let bkt = 0; bkt < LABELS.length; bkt++) {
        if (rest >= EDGES[bkt] && rest < EDGES[bkt + 1]) { hist[bkt]++; break; }
      }
      const dW = Math.abs(w[p] - w[q]);
      if (dW <= 0) continue;
      const arm = Math.hypot((a.y + b.y) / 2 - hingeY, (a.z + b.z) / 2 - jawZ) / L;
      const lmin = dW * arm * theta / S;
      if (rest < lmin) {
        violate++;
        const r = lmin / Math.max(rest, 1e-12);
        if (r > worstRatio) { worstRatio = r; worstInfo = { rest, lmin, dW, arm }; }
      }
    }
  }
  lens.sort((x, y) => x - y);
  const q = (p) => (lens.length ? lens[Math.min(lens.length - 1, Math.floor(lens.length * p))] : 0);
  console.log(
    `${base.padEnd(20)} theta=${theta.toFixed(4)} bandEdges=${String(band).padStart(6)} ` +
    `p01=${q(0.01).toExponential(2)} p50=${q(0.50).toExponential(2)} ` +
    `underJW1=${String(violate).padStart(6)} worstShortfall=${worstRatio ? worstRatio.toFixed(1) + 'x' : '-'}`);
  console.log('    len(L) ' + LABELS.map((l, i) => `${l}:${hist[i]}`).join('  '));
  if (worstInfo) {
    console.log(`    worst: restL=${worstInfo.rest.toExponential(2)} needs=${worstInfo.lmin.toExponential(2)} ` +
      `dW=${worstInfo.dW.toFixed(3)} arm=${worstInfo.arm.toFixed(4)}`);
  }
}
