/* Rev 18, router decision 2: count jaw weight-CLIFF edges on the EXPORTED mesh.
 *
 * The gradient cap's own budget is the metric, restated on the GLB:
 *
 *     allowed = EDGE_STRETCH_BUDGET * (restLen / L) / arm
 *
 * an edge whose |dJaw| exceeds its allowed budget is a cliff. This is the
 * "116 exported edges carry a full weight cliff" number from the handoff, and
 * it is what proves the cap now runs on the topology that ships rather than on
 * the pre-remesh mouth band.
 *
 * Usage: node --import ./tools/reg.mjs hse/count_cliffs.mjs <glb...>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
globalThis.self = globalThis; globalThis.window = globalThis;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const THREE = await import('three');
const { GLTFLoader } = await import(path.join(HERE, '../../_shared/three/GLTFLoader.js'));

/* Mirrors tools/sharklib/mouth.py EDGE_STRETCH_BUDGET / JAW_INTERIOR_PIN. */
const EDGE_STRETCH_BUDGET = 1.6;

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
  const g = await loadGlb(file);
  let mesh = null; g.scene.traverse((o) => { if (!mesh && o.isSkinnedMesh) mesh = o; });
  if (!mesh) { console.log(path.basename(file), 'no skinned mesh'); continue; }
  const bones = mesh.skeleton.bones;
  const jawIdx = bones.findIndex((b) => b.name === 'LowerJaw');
  if (jawIdx < 0) { console.log(path.basename(file), 'no LowerJaw'); continue; }

  mesh.geometry.computeBoundingBox();
  const sz = new THREE.Vector3(); mesh.geometry.boundingBox.getSize(sz);
  const L = Math.max(sz.x, sz.y, sz.z);

  const pos = mesh.geometry.getAttribute('position');
  const n = pos.count;
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = jawW(mesh, jawIdx, i);

  /* Hinge derived the same way the export-time cap derives it: 5th pct of the
   * jaw cloud along y, 95th along z, in the mesh's own local frame. */
  const ids = []; for (let i = 0; i < n; i++) if (w[i] > 0.05) ids.push(i);
  if (ids.length < 8) { console.log(path.basename(file), 'jaw cloud too small'); continue; }
  const pct = (arr, p) => { const a = arr.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(a.length * p))]; };
  const v = new THREE.Vector3();
  const ys = ids.map((i) => { v.fromBufferAttribute(pos, i); return v.y; });
  const zs = ids.map((i) => { v.fromBufferAttribute(pos, i); return v.z; });
  const hingeY = pct(ys, 0.05), jawZ = pct(zs, 0.95);

  const idx = mesh.geometry.getIndex().array;
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  const seen = new Set();
  let cliffs = 0, considered = 0; const deltas = [];
  for (let t = 0; t + 2 < idx.length; t += 3) {
    const tri = [idx[t], idx[t + 1], idx[t + 2]];
    for (const [p, q] of [[tri[0], tri[1]], [tri[1], tri[2]], [tri[2], tri[0]]]) {
      const k = p < q ? p + ':' + q : q + ':' + p;
      if (seen.has(k)) continue; seen.add(k);
      if (w[p] <= 0 && w[q] <= 0) continue;
      a.fromBufferAttribute(pos, p); b.fromBufferAttribute(pos, q);
      const rest = a.distanceTo(b);
      if (rest < 1e-9) continue;
      const arm = Math.hypot((a.y + b.y) / 2 - hingeY, (a.z + b.z) / 2 - jawZ) / L;
      if (arm < 1e-9) continue;
      const allowed = Math.min(1, EDGE_STRETCH_BUDGET * (rest / L) / arm);
      const d = Math.abs(w[p] - w[q]);
      considered++;
      if (d > allowed) { cliffs++; deltas.push(d); }
    }
  }
  deltas.sort((x, y) => x - y);
  const med = deltas.length ? deltas[deltas.length >> 1] : 0;
  const max = deltas.length ? deltas[deltas.length - 1] : 0;
  console.log(
    `${path.basename(file).padEnd(24)} cliffEdges=${String(cliffs).padStart(5)}  ` +
    `of ${considered} jaw-touching  |dJaw| median=${med.toFixed(3)} max=${max.toFixed(3)}`
  );
}
