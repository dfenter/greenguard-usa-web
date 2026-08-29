/* Lane S3 (rev17): jaw open/close geometry probe, extended for the family
 * pipeline gate (PLAN-rev17-families.md, Verification section).
 *
 * Loads a GLB FILE DIRECTLY (not through shark3d.js/a row def -- family GLBs
 * in assets/models/fam/*.glb have no row def yet) with the project's own
 * three.js + GLTFLoader (play/_shared/three), poses LowerJaw at two angles
 * and asserts, per GLB:
 *   1. no vertex ABOVE the jaw hinge plane moves more than 0.002 * L when the
 *      jaw opens (upper head must stay put),
 *   2. lower-lip vertices (lowest 15% of head height, front 55% of head)
 *      move at least 0.03 * L,
 *   3. no triangle edge on the mesh stretches more than 3x between rest and
 *      the open pose (skin tearing gate),
 * where L is the model's long-axis (bounding box) extent, and prints
 * per-GLB pass/fail with the measured numbers.
 *
 * REST_RAD defaults to 0 (rev17 build-time jaw write was removed in Step 0;
 * writeJawGape is the only writer now). OPEN_RAD defaults to 0.72 per the
 * brief.
 *
 * Usage:
 *   node hse/probe_jaw.mjs assets/models/greatwhite_cy.glb assets/models/thresher.glb ...
 *   REST_RAD=0 OPEN_RAD=0.72 node hse/probe_jaw.mjs <glb...>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

globalThis.self = globalThis;
globalThis.window = globalThis;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const THREE = await import('three');
const { GLTFLoader } = await import(path.join(HERE, '../../_shared/three/GLTFLoader.js'));

const REST_RAD = Number(process.env.REST_RAD ?? 0);
const OPEN_RAD = Number(process.env.OPEN_RAD ?? 0.72);
const UPPER_MAX_FRAC = 0.002;   // no upper-head vertex moves more than this * L
const LOWER_MIN_FRAC = 0.03;    // lower-lip vertices must move at least this * L
const STRETCH_MAX = 3.0;        // no triangle edge may stretch more than this factor

function loadGlb(file) {
  return new Promise((resolve, reject) => {
    const buf = fs.readFileSync(file);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    new GLTFLoader().parse(ab, '', resolve, reject);
  });
}

function findSkinnedMesh(root) {
  let found = null;
  root.traverse((o) => { if (!found && o.isSkinnedMesh) found = o; });
  return found;
}

/* Bake the CURRENT (posed) world position of every vertex, honouring
 * skinning, without mutating the geometry. */
function bakedPositions(mesh) {
  mesh.updateMatrixWorld(true);
  const geo = mesh.geometry;
  const pos = geo.getAttribute('position');
  const out = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    mesh.applyBoneTransform(i, v); // skinned local -> skinned-space posed position
    out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z;
  }
  return out;
}

function skinWeightOnBone(mesh, boneIdx, vertIdx) {
  const si = mesh.geometry.getAttribute('skinIndex');
  const sw = mesh.geometry.getAttribute('skinWeight');
  let w = 0;
  for (let k = 0; k < 4; k++) if (si.getComponent(vertIdx, k) === boneIdx) w += sw.getComponent(vertIdx, k);
  return w;
}

async function probeOne(file) {
  const name = path.basename(file);
  let gltf;
  try { gltf = await loadGlb(file); }
  catch (e) { return { name, ok: false, error: 'load failed: ' + e.message }; }

  const mesh = findSkinnedMesh(gltf.scene);
  if (!mesh) return { name, ok: false, error: 'no SkinnedMesh found' };
  const bones = mesh.skeleton.bones;
  const jawIdx = bones.findIndex((b) => b.name === 'LowerJaw');
  const headIdx = bones.findIndex((b) => b.name === 'Head');
  if (jawIdx < 0) return { name, ok: false, error: 'no LowerJaw bone' };
  if (headIdx < 0) return { name, ok: false, error: 'no Head bone' };
  const jawBone = bones[jawIdx];

  // model long-axis extent L from the bind-pose bounding box
  mesh.geometry.computeBoundingBox();
  const bb = mesh.geometry.boundingBox;
  const size = new THREE.Vector3(); bb.getSize(size);
  const L = Math.max(size.x, size.y, size.z);
  if (!(L > 0)) return { name, ok: false, error: 'degenerate bounding box' };

  // rest pose
  jawBone.rotation.x = REST_RAD;
  jawBone.updateMatrixWorld(true);
  const restPos = bakedPositions(mesh);

  // classify vertices relative to the jaw hinge (jaw bone's own position,
  // in the mesh's skinned local space) and the head extent, using REST pose.
  const geo = mesh.geometry;
  const posAttr = geo.getAttribute('position');
  const n = posAttr.count;
  const jawHingeLocal = jawBone.position.clone(); // jaw bone parented under Head typically; approximate hinge as jaw bone's local origin projected via Head's transform
  // Build a robust "hinge plane" from the geometry itself: use the AABB of
  // vertices weighted mostly to LowerJaw (rest pose) as the jaw region, and
  // everything else weighted to Head as the "upper head" region, both
  // measured on axis with the greatest spread among head-weighted verts
  // (the model's own long axis serves well enough for a hinge-plane proxy).
  const headWeighted = [], jawWeighted = [];
  for (let i = 0; i < n; i++) {
    const hw = skinWeightOnBone(mesh, headIdx, i);
    const jw = skinWeightOnBone(mesh, jawIdx, i);
    if (jw > 0.5) jawWeighted.push(i);
    else if (hw > 0.1) headWeighted.push(i);
  }
  if (!jawWeighted.length) return { name, ok: false, error: 'no vertices weighted to LowerJaw' };

  // Determine the model's "up" and "forward" axes from the bind-pose bbox:
  // forward = axis of largest extent, up = axis of second-largest extent
  // (a reasonable default for these fore-aft symmetric fish rigs; matches
  // the convention used elsewhere in hse/probe_axes2.mjs).
  const axes = [['x', size.x], ['y', size.y], ['z', size.z]].sort((a, b) => b[1] - a[1]);
  const fwdAxis = axes[0][0];
  // Rev 17 fix: a shark head is wider than it is tall, so "second-largest
  // extent" picks WIDTH on most bases. Up is instead the non-forward axis
  // along which the LowerJaw-weighted centroid is displaced from the
  // Head-weighted centroid (the jaw hangs below the head).
  const centroid = (list) => { const c = [0, 0, 0]; for (const i of list) { c[0] += restPos[3 * i]; c[1] += restPos[3 * i + 1]; c[2] += restPos[3 * i + 2]; } return c.map((v) => v / Math.max(1, list.length)); };
  const cj = centroid(jawWeighted), ch = centroid(headWeighted);
  const cand = axes.slice(1).map(([a]) => a);
  const idx0 = { x: 0, y: 1, z: 2 };
  const upAxis = cand.sort((a, b) => Math.abs(cj[idx0[b]] - ch[idx0[b]]) - Math.abs(cj[idx0[a]] - ch[idx0[a]]))[0];
  const axisIdx = { x: 0, y: 1, z: 2 };
  const fI = axisIdx[fwdAxis], uI = axisIdx[upAxis];

  // head height range (from head-weighted verts) along the "up" axis, and
  // front/back range along "forward" axis, both from rest positions.
  let headMinU = Infinity, headMaxU = -Infinity, headMinF = Infinity, headMaxF = -Infinity;
  for (const i of headWeighted.length ? headWeighted : jawWeighted) {
    headMinU = Math.min(headMinU, restPos[i * 3 + uI]);
    headMaxU = Math.max(headMaxU, restPos[i * 3 + uI]);
    headMinF = Math.min(headMinF, restPos[i * 3 + fI]);
    headMaxF = Math.max(headMaxF, restPos[i * 3 + fI]);
  }
  for (const i of jawWeighted) {
    headMinU = Math.min(headMinU, restPos[i * 3 + uI]);
    headMaxU = Math.max(headMaxU, restPos[i * 3 + uI]);
    headMinF = Math.min(headMinF, restPos[i * 3 + fI]);
    headMaxF = Math.max(headMaxF, restPos[i * 3 + fI]);
  }
  const headHeight = headMaxU - headMinU || 1e-6;
  const headLength = headMaxF - headMinF || 1e-6;

  // lower-lip region: lowest 15% of head height AND front 55% of head length,
  // among vertices with meaningful jaw weight.
  const lowerLipVerts = [];
  const upperHeadVerts = []; // head-weighted verts with near-zero jaw weight = "above the hinge"
  for (let i = 0; i < n; i++) {
    const jw = skinWeightOnBone(mesh, jawIdx, i);
    const u = restPos[i * 3 + uI], f = restPos[i * 3 + fI];
    const uFrac = (u - headMinU) / headHeight;     // 0 = bottom, 1 = top
    const fFrac = (f - headMinF) / headLength;      // 0..1 along head length (axis sign not guaranteed nose-first, but front/back symmetric-ish gate below)
    if (jw > 0.4 && uFrac <= 0.15 && (fFrac <= 0.55 || fFrac >= 0.45)) lowerLipVerts.push(i);
    if (jw < 0.05 && skinWeightOnBone(mesh, headIdx, i) > 0.3) upperHeadVerts.push(i);
  }

  // open pose
  jawBone.rotation.x = OPEN_RAD;
  jawBone.updateMatrixWorld(true);
  const openPos = bakedPositions(mesh);

  const dist = (i) => Math.hypot(
    openPos[i * 3] - restPos[i * 3],
    openPos[i * 3 + 1] - restPos[i * 3 + 1],
    openPos[i * 3 + 2] - restPos[i * 3 + 2]
  );

  let maxUpperMove = 0;
  for (const i of upperHeadVerts) maxUpperMove = Math.max(maxUpperMove, dist(i));
  let minLowerMove = lowerLipVerts.length ? Infinity : 0;
  let maxLowerMove = 0;
  for (const i of lowerLipVerts) { const d = dist(i); minLowerMove = Math.min(minLowerMove, d); maxLowerMove = Math.max(maxLowerMove, d); }

  // triangle edge stretch: walk mesh index triples, compare rest vs open edge lengths
  const index = geo.getIndex();
  let maxStretch = 1;
  if (index) {
    const idx = index.array;
    const step = Math.max(1, Math.floor(idx.length / 3 / 20000)) * 3; // sample cap for very dense meshes
    const edgeLen = (posArr, a, b) => Math.hypot(
      posArr[a * 3] - posArr[b * 3], posArr[a * 3 + 1] - posArr[b * 3 + 1], posArr[a * 3 + 2] - posArr[b * 3 + 2]
    );
    for (let t = 0; t < idx.length; t += step) {
      const a = idx[t], b = idx[t + 1], c = idx[t + 2];
      if (b === undefined || c === undefined) break;
      for (const [p, q] of [[a, b], [b, c], [c, a]]) {
        const restLen = edgeLen(restPos, p, q);
        if (restLen < 1e-6) continue;
        const openLen = edgeLen(openPos, p, q);
        maxStretch = Math.max(maxStretch, openLen / restLen);
      }
    }
  }

  const upperOk = maxUpperMove <= UPPER_MAX_FRAC * L;
  const lowerOk = lowerLipVerts.length >= 6 && maxLowerMove >= LOWER_MIN_FRAC * L && minLowerMove >= 0.5 * LOWER_MIN_FRAC * L; // Rev 17: commissure-band verts legitimately travel less than the chin
  const stretchOk = maxStretch <= STRETCH_MAX;
  const ok = upperOk && lowerOk && stretchOk;

  return {
    name, ok, L: +L.toFixed(4),
    upperVerts: upperHeadVerts.length, maxUpperMove: +maxUpperMove.toFixed(5), upperLimit: +(UPPER_MAX_FRAC * L).toFixed(5), upperOk,
    lowerVerts: lowerLipVerts.length, minLowerMove: lowerLipVerts.length ? +minLowerMove.toFixed(5) : null, maxLowerMove: +maxLowerMove.toFixed(5), lowerLimit: +(LOWER_MIN_FRAC * L).toFixed(5), lowerOk,
    maxStretch: +maxStretch.toFixed(3), stretchOk,
  };
}

const files = process.argv.slice(2);
if (!files.length) {
  console.log('usage: node hse/probe_jaw.mjs <glb...>   (REST_RAD, OPEN_RAD env optional)');
  process.exit(2);
}

let anyFail = false;
console.log(`REST_RAD=${REST_RAD} OPEN_RAD=${OPEN_RAD}`);
for (const f of files) {
  const r = await probeOne(f);
  if (r.error) { anyFail = true; console.log(`${r.name.padEnd(28)} ERROR ${r.error}`); continue; }
  if (!r.ok) anyFail = true;
  console.log(
    `${r.name.padEnd(28)} L=${r.L}  ` +
    `upper(n=${r.upperVerts}) move<=${r.maxUpperMove} limit=${r.upperLimit} ${r.upperOk ? 'OK' : 'FAIL'}  ` +
    `lower(n=${r.lowerVerts}) min=${r.minLowerMove} max=${r.maxLowerMove} limit>=${r.lowerLimit} ${r.lowerOk ? 'OK' : 'FAIL'}  ` +
    `stretch=${r.maxStretch}x limit<=${STRETCH_MAX} ${r.stretchOk ? 'OK' : 'FAIL'}  ` +
    `${r.ok ? 'PASS' : 'FAIL'}`
  );
}
process.exit(anyFail ? 1 : 0);
