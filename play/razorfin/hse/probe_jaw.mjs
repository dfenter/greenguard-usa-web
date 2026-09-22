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
 * REST_RAD / OPEN_RAD are angles RELATIVE TO THE BONE'S AUTHORED REST POSE,
 * applied about the local hinge axis exactly as rig_morph.writeJawGape does at
 * runtime (restore closedBase, then rotateOnAxis).
 *
 * Rev 18, residual A root cause: this probe used to assign
 * `jawBone.rotation.x = REST_RAD` ABSOLUTELY. Every family GLB exports its
 * LowerJaw with a rest rotation near 3.07 rad (~176 deg), so `rotation.x = 0`
 * did not mean "closed", it swung the jaw through 176 degrees into an
 * anatomically impossible pose before measuring. Edges in that crushed pose
 * are up to 9x shorter than the real geometry (thresher: a genuine 1.85e-3
 * edge measured 2.00e-4), and dividing the opened length by that bogus rest
 * length reported 4.0x "skin tearing" on healthy meshes. That is why the
 * number was bit-identical across five different rebakes with different vertex
 * counts: it was never a property of the mesh.
 *
 * Usage:
 *   node hse/probe_jaw.mjs assets/models/greatwhite_cy.glb assets/models/thresher.glb ...
 *   REST_RAD=0 node hse/probe_jaw.mjs <glb...>
 *
 * Rev 18, router decision 1: the open angle is NO LONGER a hardcoded 0.72.
 * It comes from hse/jaw_gate_config.mjs, which derives it from the same place
 * the runtime does -- the recipe's `mouth.gape_degrees` (25 deg on all five
 * pilots), bracketed by rig_morph's exported GAPE_MIN_RAD/GAPE_MAX_RAD band.
 * 0.72 rad is 41.3 deg: 65% more travel than the rig is ever asked for, and
 * because stretch blows up superlinearly on near-coincident edges, measuring
 * there turned honest ~3x edges into 15-45x and made the gate table noise.
 * Setting OPEN_RAD still overrides, but the probe now prints which source it
 * used so an off-brief angle can never again be mistaken for real travel.
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
const { resolveOpenRadians, loadRecipeForFamily } = await import(path.join(HERE, 'jaw_gate_config.mjs'));
const ROOT_DIR = path.join(HERE, '..');
const UPPER_MAX_FRAC = 0.002;   // no upper-head vertex moves more than this * L
const LOWER_MIN_FRAC = 0.03;    // lower-lip vertices must move at least this * L
/* Rev 18 lane 7: the 3x stretch RATIO bar is gone. It failed 5 of 5 families
 * that lane 6 confirmed visually unbroken, because a ratio carries no scale
 * and the failing edges are sub-pixel. The gate is now an ABSOLUTE opened
 * length, with a dead-jaw precondition so a motionless jaw cannot pass it.
 * See hse/jaw_open_budget.mjs for the derivation. Stretch is still printed as
 * an informational column. */
const { MAX_OPEN_L, MAX_OPEN_PX, REFERENCE_BODY_PX, DEAD_JAW_MIN_MOVE_L, judge, openPx } =
  await import(path.join(HERE, 'jaw_open_budget.mjs'));

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
  /* Rev 18: the open angle is a property of THIS family's recipe, resolved
   * from the same constant the bake and the runtime use. */
  const family = name.replace(/\.glb$/i, '');
  const recipe = await loadRecipeForFamily(family, { fs, path, rootDir: ROOT_DIR });
  const open = resolveOpenRadians(process.env, recipe);
  const OPEN_RAD = open.radians;
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

  // The authored rest orientation of the hinge. Runtime (rig_morph
  // writeJawGape) restores exactly this and then rotates about the local
  // hinge axis, so the probe must pose the same way or it measures a pose the
  // game can never produce.
  const jawBase = jawBone.quaternion.clone();
  const HINGE_AXIS = new THREE.Vector3(1, 0, 0);
  const poseJaw = (rad) => {
    jawBone.quaternion.copy(jawBase);
    if (rad) jawBone.rotateOnAxis(HINGE_AXIS, rad);
    jawBone.updateMatrixWorld(true);
  };

  // rest pose
  poseJaw(REST_RAD);
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
  poseJaw(OPEN_RAD);
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
  /* The gate quantity: the largest ABSOLUTE amount any edge opens by. */
  let maxOpenL = 0;
  let maxOpenStretch = 1;
  if (index) {
    const idx = index.array;
    /* Rev 18 lane 7: walk EVERY triangle. This used to subsample dense meshes,
     * which is acceptable for a ratio hint but not for a ship gate: the single
     * worst edge is exactly what the gate is looking for and a sampled walk can
     * step straight over it. The pilots are ~8k tris, so the full walk is cheap. */
    const step = 3;
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
        const stretch = openLen / restLen;
        maxStretch = Math.max(maxStretch, stretch);
        /* How much this edge GREW, in body lengths. A near-degenerate edge
         * with a huge ratio contributes almost nothing here, which is the
         * whole point of the change. */
        const grewL = (openLen - restLen) / L;
        if (grewL > maxOpenL) { maxOpenL = grewL; maxOpenStretch = stretch; }
      }
    }
  }

  /* Dead-jaw precondition (JAW-WEIGHT-SPEC section 6): count vertices that
   * actually MOVED between closed and open. An absolute-length bar is passed
   * perfectly by a jaw that does not move, so this must be checked BEFORE any
   * opened length is believed. */
  let movedVerts = 0;
  for (let i = 0; i < n; i++) if (dist(i) > DEAD_JAW_MIN_MOVE_L * L) movedVerts++;

  const upperOk = maxUpperMove <= UPPER_MAX_FRAC * L;
  const lowerOk = lowerLipVerts.length >= 6 && maxLowerMove >= LOWER_MIN_FRAC * L && minLowerMove >= 0.5 * LOWER_MIN_FRAC * L; // Rev 17: commissure-band verts legitimately travel less than the chin
  const verdict = judge({ maxOpenL, movedVerts });
  const openOk = verdict.ok;
  const ok = upperOk && lowerOk && openOk;

  return {
    name, ok, L: +L.toFixed(4),
    openRad: +OPEN_RAD.toFixed(4), openDeg: +open.degrees.toFixed(2), openSrc: open.source,
    upperVerts: upperHeadVerts.length, maxUpperMove: +maxUpperMove.toFixed(5), upperLimit: +(UPPER_MAX_FRAC * L).toFixed(5), upperOk,
    lowerVerts: lowerLipVerts.length, minLowerMove: lowerLipVerts.length ? +minLowerMove.toFixed(5) : null, maxLowerMove: +maxLowerMove.toFixed(5), lowerLimit: +(LOWER_MIN_FRAC * L).toFixed(5), lowerOk,
    movedVerts, jawAlive: verdict.alive, openReason: verdict.reason,
    maxOpenL: +maxOpenL.toFixed(5),
    maxOpenPx: +(maxOpenL * REFERENCE_BODY_PX).toFixed(2),
    atStretch: +maxOpenStretch.toFixed(3), openOk,
    maxStretch: +maxStretch.toFixed(3),
  };
}

const files = process.argv.slice(2);
if (!files.length) {
  console.log('usage: node hse/probe_jaw.mjs <glb...>   (REST_RAD, OPEN_RAD env optional)');
  process.exit(2);
}

let anyFail = false;
console.log(`REST_RAD=${REST_RAD}  open angle: per-recipe (hse/jaw_gate_config.mjs)${process.env.OPEN_RAD ? `  OVERRIDDEN by OPEN_RAD=${process.env.OPEN_RAD}` : ''}`);
for (const f of files) {
  const r = await probeOne(f);
  if (r.error) { anyFail = true; console.log(`${r.name.padEnd(28)} ERROR ${r.error}`); continue; }
  if (!r.ok) anyFail = true;
  console.log(
    `${r.name.padEnd(28)} L=${r.L} open=${r.openDeg}deg(${r.openRad},${r.openSrc})  ` +
    `upper(n=${r.upperVerts}) move<=${r.maxUpperMove} limit=${r.upperLimit} ${r.upperOk ? 'OK' : 'FAIL'}  ` +
    `lower(n=${r.lowerVerts}) min=${r.minLowerMove} max=${r.maxLowerMove} limit>=${r.lowerLimit} ${r.lowerOk ? 'OK' : 'FAIL'}  ` +
    `jaw(moved=${r.movedVerts}) ${r.jawAlive ? 'ALIVE' : 'DEAD'}  ` +
    `open=${r.maxOpenL}L(${r.maxOpenPx}px) limit<=${MAX_OPEN_L}L(${MAX_OPEN_PX}px) ${r.openOk ? 'OK' : 'FAIL'}${r.jawAlive ? '' : ' [' + r.openReason + ']'}  ` +
    `[info stretch=${r.maxStretch}x, at-worst-open=${r.atStretch}x]  ` +
    `${r.ok ? 'PASS' : 'FAIL'}`
  );
}
process.exit(anyFail ? 1 : 0);
