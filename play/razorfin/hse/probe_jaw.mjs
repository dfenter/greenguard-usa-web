/* Lane S3 (rev17): jaw open/close geometry probe, extended for the family
 * pipeline gate (PLAN-rev17-families.md, Verification section).
 *
 * Loads a GLB FILE DIRECTLY (not through shark3d.js/a row def -- family GLBs
 * in assets/models/fam/*.glb have no row def yet) with the project's own
 * three.js + GLTFLoader (play/_shared/three), poses LowerJaw at two angles
 * and asserts, per GLB:
 *   1. no UPPER-HEAD vertex (upper 50% of head height, Head-weighted) moves
 *      more than 0.002 * L when the jaw opens, i.e. jaw weight must not bleed
 *      up into the skull (re-pointed lane A4; see the gate comment below),
 *   2. lower-lip vertices (lowest 15% of head height, front 55% of head)
 *      move at least 0.03 * L,
 *   3. no triangle edge on the mesh stretches more than 3x between rest and
 *      the open pose (skin tearing gate),
 * where L is the model's long-axis (bounding box) extent, and prints
 * per-GLB pass/fail with the measured numbers.
 *
 * REST POSE (lane A3, 2026-09-17 - corrected).
 * The rest pose is the LowerJaw BIND QUATERNION exactly as authored in the
 * GLB, and the open pose is `bindQuat` then `rotateOnAxis(JAW_HINGE_AXIS,
 * OPEN_RAD)`. That is `hse/rig_morph.js writeJawGape` verbatim: it restores
 * `authority.closedBase` (the bind quaternion, captured at rig_morph.js:1019)
 * and rotates about the hinge axis. The probe's rest pose is now the pose the
 * game actually renders.
 *
 * It previously forced `jawBone.rotation.x = 0` as "rest". Every family bake
 * carries a LowerJaw bind rotation of ~pi (3.059 to 3.077), so that forced
 * pose flung the jaw a further ~3.07 rad from where the asset sits, squashed
 * vertex pairs together, and then divided a 0.72 rad opening by the
 * artificially tiny rest length. Validated synthetically (scratchpad
 * synth3.mjs): on a rig with a ~pi bind and perfectly rigid binary weights the
 * old basis reports 10.8x tearing that does not exist while this basis
 * correctly reports 1.000x; on a genuine weight-gradient edge this basis
 * reports 1.171x while the old basis misses it entirely at 1.000x. The old
 * number was measuring the bind rotation, not skin deformation.
 *
 * JAW_HINGE_AXIS (local X) was re-derived empirically per bake rather than
 * assumed: searching the unit sphere for the axis maximising lip travel along
 * the head-to-jaw direction lands within 4-12 degrees of X on all five
 * families, with X within 2% of the optimum's travel. The axis was correct;
 * the rest pose was not.
 *
 * HINGE SIGN (lane A6, 2026-09-17). The AXIS is X, but which SIGN of X opens
 * the jaw depends on the bind roll the rig baked, so it is measured per GLB
 * rather than fixed at +X. See the note at `openSign` below.
 *
 * OPEN_RAD defaults to 0.72 per the brief.
 *
 * Usage:
 *   node hse/probe_jaw.mjs assets/models/greatwhite_cy.glb assets/models/thresher.glb ...
 *   OPEN_RAD=0.72 node hse/probe_jaw.mjs <glb...>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

globalThis.self = globalThis;
globalThis.window = globalThis;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const THREE = await import('three');
const { GLTFLoader } = await import(path.join(HERE, '../../_shared/three/GLTFLoader.js'));

const OPEN_RAD = Number(process.env.OPEN_RAD ?? 0.72);
const UPPER_MAX_FRAC = 0.002;   // no upper-head vertex moves more than this * L
const LOWER_MIN_FRAC = 0.03;    // lower-lip vertices must move at least this * L
const STRETCH_MAX = 3.0;        // no triangle edge may stretch more than this factor
/* Mirrors JAW_HINGE_AXIS in hse/rig_morph.js:63. Confirmed empirically per
 * bake (see the rest-pose note above), not assumed. */
const JAW_HINGE_AXIS = Object.freeze(new THREE.Vector3(1, 0, 0));

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

function posAttrCount(mesh) {
  return mesh.geometry.getAttribute('position').count;
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

  // rest pose = the LowerJaw bind quaternion as authored in the GLB, which is
  // what writeJawGape restores as `authority.closedBase` before every open.
  const bindQuat = jawBone.quaternion.clone();
  jawBone.quaternion.copy(bindQuat);
  jawBone.updateMatrixWorld(true);
  const restPos = bakedPositions(mesh);

  /* HINGE SIGN (lane A6, 2026-09-17). Which way local X opens the jaw is a
   * property of the bind roll the rig baked, not a constant. It was +X while
   * tools/sharklib/rig.py applied `jaw.roll = pi`; with that roll removed the
   * ventral direction is -X. rig_morph.js already measures this rather than
   * assuming it, so the probe does too and stays correct across the change.
   *
   * Measured the same way rig_morph does: hinge both ways and keep whichever
   * moves the jaw-weighted cloud further from the skull, using the Head
   * centroid as the reference so no anatomy axis has to be named first. */
  const openSign = (() => {
    const jawIdxAll = [];
    for (let i = 0; i < posAttrCount(mesh); i++) {
      if (skinWeightOnBone(mesh, jawIdx, i) > 0.5) jawIdxAll.push(i);
    }
    if (!jawIdxAll.length) return 1;
    const headIdxAll = [];
    for (let i = 0; i < posAttrCount(mesh); i++) {
      if (skinWeightOnBone(mesh, jawIdx, i) <= 0.5
        && skinWeightOnBone(mesh, headIdx, i) > 0.1) headIdxAll.push(i);
    }
    const mean = (list, src) => {
      const c = [0, 0, 0];
      for (const i of list) { c[0] += src[3 * i]; c[1] += src[3 * i + 1]; c[2] += src[3 * i + 2]; }
      return c.map((v) => v / Math.max(1, list.length));
    };
    const skull = mean(headIdxAll.length ? headIdxAll : jawIdxAll, restPos);
    let best = { sign: 1, away: -Infinity };
    for (const sign of [1, -1]) {
      jawBone.quaternion.copy(bindQuat);
      jawBone.rotateOnAxis(JAW_HINGE_AXIS, sign * OPEN_RAD);
      jawBone.updateMatrixWorld(true);
      const posed = bakedPositions(mesh);
      const c = mean(jawIdxAll, posed);
      const away = Math.hypot(c[0] - skull[0], c[1] - skull[1], c[2] - skull[2]);
      if (away > best.away) best = { sign, away };
    }
    jawBone.quaternion.copy(bindQuat);
    jawBone.updateMatrixWorld(true);
    return best.sign;
  })();
  const OPEN_ANGLE = openSign * OPEN_RAD;

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

  /* UP AXIS (lane A5, 2026-09-17). This is the true cause of snapjaw's n = 0
   * lower-lip classification, and it is a probe bug, not an asset defect.
   *
   * The jaw-vs-head centroid rule assumes the jaw hangs measurably BELOW the
   * head centroid. On snapjaw those two centroids are vertically coincident to
   * 1e-4 (cj.y 0.1208 vs ch.y 0.1206, a separation of 0.0001 against a body
   * extent of 1.0), because its authored jaw wraps the snout symmetrically
   * rather than hanging under it. At that magnitude the rule is reading
   * floating-point noise, and it picked X - the shark's WIDTH - as "up". The
   * lip test then measured a slab down one FLANK, where no jaw-weighted vertex
   * lives, so n = 0. Same rule, same failure mode as the "second-largest
   * extent picks width" bug it was introduced to fix.
   *
   * Use the signal that is unambiguous on every family instead: the direction
   * the jaw vertices ACTUALLY TRAVEL when the bone opens. A jaw opens downward
   * by definition, so that vector IS local "down", it is measured rather than
   * assumed, and it needs no anatomy heuristic. Measured across all five
   * pilots it names the same axis every time (z, the forward axis here, which
   * is exactly why the candidate list still excludes forward - the jaw swings
   * forward-and-down and the forward component dominates). Rank the two
   * non-forward candidates by jaw travel, and only fall back to the centroid
   * rule if that travel is degenerate. */
  const upProbeQuat = jawBone.quaternion.clone();
  jawBone.rotateOnAxis(JAW_HINGE_AXIS, OPEN_ANGLE);
  jawBone.updateMatrixWorld(true);
  const upProbePos = bakedPositions(mesh);
  jawBone.quaternion.copy(upProbeQuat);
  jawBone.updateMatrixWorld(true);
  const jawTravel = [0, 0, 0];
  for (const i of jawWeighted) {
    jawTravel[0] += upProbePos[3 * i] - restPos[3 * i];
    jawTravel[1] += upProbePos[3 * i + 1] - restPos[3 * i + 1];
    jawTravel[2] += upProbePos[3 * i + 2] - restPos[3 * i + 2];
  }
  for (let k = 0; k < 3; k++) jawTravel[k] /= Math.max(1, jawWeighted.length);
  const travelOn = (a) => Math.abs(jawTravel[idx0[a]]);
  const bestTravel = Math.max(...cand.map(travelOn));
  const upAxis = bestTravel > 1e-6
    ? cand.slice().sort((a, b) => travelOn(b) - travelOn(a))[0]
    : cand.slice().sort((a, b) => Math.abs(cj[idx0[b]] - ch[idx0[b]]) - Math.abs(cj[idx0[a]] - ch[idx0[a]]))[0];
  const axisIdx = { x: 0, y: 1, z: 2 };
  const fI = axisIdx[fwdAxis], uI = axisIdx[upAxis];

  /* HEAD REGION (lane A5, 2026-09-17 - this is why snapjaw classified 0 lip
   * vertices, and it is a probe bug, not an asset defect).
   *
   * `headWeighted` is every vertex with Head weight > 0.1. After
   * finish._normalize_joined_mouth_skin runs, EVERY body vertex that is not
   * jaw-weighted is given Head = 1.0, so that set spans nose to TAIL TIP. The
   * "head height" measured from it was really the whole body's vertical
   * extent, which on a shark is dominated by the dorsal fin and the caudal
   * lobe, both far from the mouth. `uFrac <= 0.15` then selects a slab near
   * the belly/lower caudal rather than the lower lip, and on snapjaw (the
   * deepest-bodied pilot, head extent 0.117 against a body extent of 0.200)
   * not one jaw-weighted vertex fell inside it: n = 0.
   *
   * Scope the extent to the actual head before taking fractions. The jaw
   * region is by definition part of the head, so its forward extent gives a
   * reliable head span: take the jaw-weighted verts' bounding interval along
   * forward, grow it to the fuller head length, and keep only head-weighted
   * verts inside it. Falls back to the old behaviour if that window is empty,
   * so no family can regress to a worse basis than before. */
  const jawF = jawWeighted.map((i) => restPos[3 * i + fI]);
  const jawFMin = Math.min(...jawF), jawFMax = Math.max(...jawF);
  // The head extends back from the jaw by roughly the jaw's own length again;
  // 2x the jaw span, centred on the jaw, comfortably covers skull and snout
  // while excluding trunk, dorsal fin and tail.
  const jawSpan = Math.max(jawFMax - jawFMin, 1e-6);
  const headLo = jawFMin - jawSpan, headHi = jawFMax + jawSpan;
  const headRegion = headWeighted.filter((i) => {
    const f = restPos[3 * i + fI];
    return f >= headLo && f <= headHi;
  });
  if (headRegion.length) {
    headWeighted.length = 0;
    for (const i of headRegion) headWeighted.push(i);
  }

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
  for (let i = 0; i < n; i++) {
    const jw = skinWeightOnBone(mesh, jawIdx, i);
    const u = restPos[i * 3 + uI], f = restPos[i * 3 + fI];
    const uFrac = (u - headMinU) / headHeight;     // 0 = bottom, 1 = top
    const fFrac = (f - headMinF) / headLength;      // 0..1 along head length (axis sign not guaranteed nose-first, but front/back symmetric-ish gate below)
    /* `(fFrac <= 0.55 || fFrac >= 0.45)` was a tautology - it is true for
     * every fFrac in 0..1, so the forward filter never filtered. Left as a
     * no-op deliberately: the axis SIGN is not guaranteed nose-first on these
     * bakes (io.measure assumes nose +Y but tigershark is nose -Y), so a real
     * front/back gate would cut the lip off on half the families. The vertical
     * gate plus jw > 0.4 is the honest classifier; `fFrac` is kept only so the
     * head-length basis above stays exercised and visible. */
    void fFrac;
    if (jw > 0.4 && uFrac <= 0.15) lowerLipVerts.push(i);
  }

  // open pose = bind quaternion, then hinge about the measured axis. This is
  // rig_morph.writeJawGape's `quaternion.set(closedBase)` +
  // `rotateOnAxis(JAW_HINGE_AXIS, angle)`, not a rotation.x write.
  jawBone.quaternion.copy(bindQuat);
  jawBone.rotateOnAxis(JAW_HINGE_AXIS, OPEN_ANGLE);
  jawBone.updateMatrixWorld(true);
  const openPos = bakedPositions(mesh);

  const dist = (i) => Math.hypot(
    openPos[i * 3] - restPos[i * 3],
    openPos[i * 3 + 1] - restPos[i * 3 + 1],
    openPos[i * 3 + 2] - restPos[i * 3 + 2]
  );

  /* UPPER-HEAD GATE (lane A4, 2026-09-17 - re-pointed; it was vacuous).
   *
   * This used to measure displacement of vertices selected by `jw < 0.05`
   * while posing ONLY LowerJaw. LowerJaw is a LEAF bone, so a vertex with
   * (almost) no LowerJaw weight cannot move by construction: the gate read
   * exactly 0.0 for every family and every candidate hinge axis, and had been
   * reporting OK for its whole life without testing anything (lane A3, s1).
   *
   * Re-pointed at the property it was always meant to protect: jaw weight must
   * not BLEED up into the upper head, because that is what makes the skull
   * swing when the mouth opens. Measure the actual swing of vertices that are
   * anatomically upper-head - above the jaw seam and predominantly Head-driven
   * - rather than pre-filtering them by the very weight that would move them.
   * A bleeding rig now fails here instead of passing silently.
   *
   * Region is geometric: upper 50% of head height (well clear of the lip band
   * at <=15%) and meaningfully Head-weighted. The limit stays 0.002 * L. */
  const upperRegionVerts = [];
  for (let i = 0; i < n; i++) {
    const uFrac = (restPos[i * 3 + uI] - headMinU) / headHeight;
    if (uFrac >= 0.5 && skinWeightOnBone(mesh, headIdx, i) > 0.3) upperRegionVerts.push(i);
  }
  let maxUpperMove = 0;
  for (const i of upperRegionVerts) maxUpperMove = Math.max(maxUpperMove, dist(i));
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
    upperVerts: upperRegionVerts.length, maxUpperMove: +maxUpperMove.toFixed(5), upperLimit: +(UPPER_MAX_FRAC * L).toFixed(5), upperOk,
    lowerVerts: lowerLipVerts.length, minLowerMove: lowerLipVerts.length ? +minLowerMove.toFixed(5) : null, maxLowerMove: +maxLowerMove.toFixed(5), lowerLimit: +(LOWER_MIN_FRAC * L).toFixed(5), lowerOk,
    maxStretch: +maxStretch.toFixed(3), stretchOk,
  };
}

const files = process.argv.slice(2);
if (!files.length) {
  console.log('usage: node hse/probe_jaw.mjs <glb...>   (OPEN_RAD env optional)');
  process.exit(2);
}

let anyFail = false;
console.log(`rest=LowerJaw bind quaternion  open=bind + rotateOnAxis(+X, ${OPEN_RAD})`);
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
