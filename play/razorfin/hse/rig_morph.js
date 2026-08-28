/* Razorfin HSE L2: bounded rest-pose exaggeration for baked shark rigs.
 *
 * This module owns the textured-rig silhouette pass. It changes bone scale
 * and position before buildLoadedRig captures the animation rest transforms.
 * Runtime swim and jaw motion therefore compose on top of the morph instead
 * of being overwritten by it.
 */
import * as THREE from 'three';

const MORPH_VERSION = 'hse-l2-rev15-gape';

/* ---------------------------------------------------------------------- *
 * REST-POSE JAW GAPE (Rev 15 lane GRIN)
 * ---------------------------------------------------------------------- *
 *
 * The owner verdict on the r15 head crops was "mouths are CLOSED, no teeth
 * are visible". The HSE reference has the jaw hinged DOWN at rest, with the
 * gape 25-35% of head height, a dark cavity behind it and two tooth rows
 * showing. That open mouth is the single strongest silhouette cue in the
 * reference and we had none of it.
 *
 * WHY THIS LIVES HERE AND NOT IN shark3d.js.
 *
 * shark3d.js already computes a `jawRestGape` (JAW_REST_GAPE 0.28) and
 * applies it every frame as
 *
 *     jawBone.quaternion.copy(baseJawQuaternion);
 *     jawBone.rotateX(-jawGape * JAW_MAX_ROTATION);
 *
 * Two things are wrong with that, and only one of them is fixable from here:
 *
 *   1. THE SIGN IS INVERTED. Measured on all eight evidence rows
 *      (scratchpad/probe_gape.mjs: sweep the LowerJaw about each local axis
 *      and re-skin the jaw vertex cloud), local +X swings the jaw cloud
 *      DOWN - jaw box z decreases monotonically through the sweep on every
 *      row, e.g. reef 0.00 -> z[-0.244,-0.152], 0.50 -> z[-0.369,-0.222].
 *      Local -X swings it UP, into the skull. Local Y and Z swing it
 *      SIDEWAYS (they carry all the lateral delta and near-zero vertical),
 *      so X is unambiguously the hinge. shark3d.js rotates by -gape, i.e.
 *      it drives the jaw CLOSED and slightly through the palate, which is
 *      exactly the closed mouth in the evidence.
 *
 *   2. That line runs every frame and hard-resets the bone from
 *      `baseJawQuaternion` first, so nothing this module writes to
 *      `bone.quaternion` would survive the first animate() call...
 *      EXCEPT that `baseJawQuaternion` is captured FROM THE BONE at
 *      shark3d.js:3034, which runs AFTER applyMorph() at shark3d.js:2941.
 *
 * So a rest rotation applied here is absorbed into `baseJawQuaternion` and
 * becomes the pose the runtime resets TO. The bite then composes on top of
 * it additively and unchanged: Swim_Bite still drives `animation.bite` 0->1
 * through the same `rotateX(-jawGape * JAW_MAX_ROTATION)` term, so a bite
 * still closes and re-opens the jaw relative to this new rest. We are moving
 * the origin of that animation, not replacing it - which is precisely the
 * "keep the bite additive" requirement, and is why this is a rest-pose morph
 * (this module's whole job) rather than an animation change.
 *
 * The hinge axis is taken as bone-local X and verified per rig rather than
 * assumed: applyRestGape re-skins the jaw cloud and keeps the rotation only
 * if it actually moved the jaw ventrally against the measured dorsal axis.
 * A bake whose hinge is authored differently therefore gets no gape instead
 * of a jaw rotated sideways through its own cheek. */
const JAW_HINGE_AXIS = Object.freeze(new THREE.Vector3(1, 0, 0));
/* 22-30 degrees by row personality gape, per the brief. face.gape runs
 * -0.60..+0.60, so the midpoint 26 deg +/- 4 deg spans the requested band. */
const GAPE_MIN_RAD = 22 * Math.PI / 180;
const GAPE_MAX_RAD = 30 * Math.PI / 180;
/* A gape is only accepted if the jaw cloud actually moved ventrally by at
 * least this fraction of the jaw's own height. Below it the rotation did
 * something other than open a mouth and is reverted. */
const GAPE_MIN_TRAVEL = 0.12;
/* Mirrors of JAW_REST_GAPE / JAW_MAX_ROTATION in shark3d.js (lines 72-73).
 * They are consts in a module this lane does not own and are not exported, so
 * they are duplicated here rather than imported. If either changes there, the
 * rest gape will be off by the difference - the gape record's netHingeDeg and
 * the mouth gate both surface that immediately. */
/* The orchestrator merged the sign fix: shark3d.js:3117/3148 now rotate by
 * +gape and JAW_REST_GAPE is 0, so the rest jaw is no longer closed by that
 * code and there is NOTHING left for this module to cancel. The old
 * JAW_REST_GAPE_HINT / JAW_MAX_ROTATION_HINT mirror constants are deleted
 * rather than zeroed: a mirror of someone else's const is exactly the kind of
 * thing that goes stale silently, and the whole point of the merge was to
 * remove the need for one. commitRestGape now sets the ABSOLUTE angle and
 * lets shark3d.js add its own (currently zero) rest term on top. */
const REQUIRED_BONES = Object.freeze(['Head', 'LowerJaw', 'Neck', 'Spine1', 'Spine2', 'Tail1', 'Tail2', 'Tail3']);
const MAX_SCALE_FACTOR = 1.18;
const MIN_SCALE_FACTOR = 0.84;
const MAX_LENGTH_DELTA = 0.03;
const MAX_DISPLACEMENT_RATIO = 0.24;
/* Silhouette gate: the rendered outline must stay recognisably the same shark.
 * Measured in the length/height plane the camera sees, against the UNMORPHED
 * rest pose, so "hadesmaw rendered as a deformed striped blob" fails here
 * rather than reaching a screenshot. 20% matches the orchestrator's bound. */
const MAX_ASPECT_DELTA = 0.20;
/* Area is deliberately looser than aspect. The bulk/sculpt morph's whole job
 * is girth, which legitimately grows the length x height footprint without
 * breaking the outline; ASPECT is the quantity that actually detects "this
 * silhouette is no longer a shark". Measured headlessly the textured roster
 * spans 0.99-1.16 area against 0.86-1.03 aspect, and greatwhite reaches 1.22
 * in-browser (the skinned box settles slightly differently under the live
 * clip than it does in the Node capture), so 0.20 on area rejects healthy
 * rigs. Keep aspect at the orchestrator's 20% and give area 30%. */
const MAX_AREA_DELTA = 0.30;

function clamp(value, lo, hi) { return value < lo ? lo : value > hi ? hi : value; }
function finite(value, fallback = 0) { return typeof value === 'number' && Number.isFinite(value) ? value : fallback; }
function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / Math.max(edge1 - edge0, 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
}
function scalar(value, fallback, lo, hi) { return clamp(finite(value, fallback), lo, hi); }
function vec3(value, fallback = [0, 1, 0]) {
  if (value?.isVector3) return value.clone().normalize();
  if (Array.isArray(value) && value.length >= 3) return new THREE.Vector3(value[0], value[1], value[2]).normalize();
  return new THREE.Vector3(...fallback).normalize();
}
function findBone(root, name) { return root?.getObjectByName(name) || null; }
function plainVector(value) { return [Number(value.x.toFixed(6)), Number(value.y.toFixed(6)), Number(value.z.toFixed(6))]; }

function personalityFor(def, profile) {
  const p = profile?.personality || def?.personality || {};
  return {
    bulk: p.bulk || {},
    sculpt: p.sculpt || {},
    face: p.face || {}
  };
}

function captureRestWorld(root, mesh) {
  root.updateMatrixWorld(true);
  mesh.skeleton?.update();
  const position = mesh.geometry?.getAttribute('position');
  if (!position) return { points: new Float32Array(), bounds: new THREE.Box3(), count: 0 };
  const points = new Float32Array(position.count * 3), point = new THREE.Vector3(), bounds = new THREE.Box3().makeEmpty();
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i);
    mesh.applyBoneTransform(i, point);
    point.applyMatrix4(mesh.matrixWorld);
    points[i * 3] = point.x; points[i * 3 + 1] = point.y; points[i * 3 + 2] = point.z;
    bounds.expandByPoint(point);
  }
  return { points, bounds, count: position.count };
}

function pointFromArray(array, index, target = new THREE.Vector3()) {
  return target.set(array[index * 3], array[index * 3 + 1], array[index * 3 + 2]);
}

function weightedIndices(mesh, boneNames) {
  const index = mesh.geometry?.getAttribute('skinIndex'), weight = mesh.geometry?.getAttribute('skinWeight'), bones = mesh.skeleton?.bones || [];
  const wanted = new Set(boneNames.map((name) => bones.findIndex((bone) => bone.name === name)).filter((entry) => entry >= 0));
  const out = [];
  if (!index || !weight || !wanted.size) return out;
  for (let i = 0; i < index.count; i++) {
    let sum = 0;
    for (let c = 0; c < 4; c++) if (wanted.has(index.getComponent(i, c))) sum += Math.max(0, finite(weight.getComponent(i, c), 0));
    if (sum > 0.5) out.push(i);
  }
  return out;
}

function subsetBounds(points, indices) {
  const bounds = new THREE.Box3().makeEmpty(), point = new THREE.Vector3();
  for (const index of indices) bounds.expandByPoint(pointFromArray(points, index, point));
  return bounds;
}

function extentRatio(before, after, axis) {
  const a = before.getSize(new THREE.Vector3())[axis], b = after.getSize(new THREE.Vector3())[axis];
  return b / Math.max(a, 1e-6);
}

/* Which world axis is nose-to-tail, and which is dorsal-ventral, for THIS rig.
 *
 * Do NOT take this from the rest-pose bounding box. The skinned box is
 * inflated through the bone matrices and does not describe the body (O1
 * recorded the same trap for the bakeview framing): measured that way,
 * smoothhammer/greatwhite_cy/whitepointer all report their LONGEST extent on
 * world Y, when their nose-to-tail axis is world X. Gating "length" against
 * the box axis therefore scores a girth change as a length change.
 *
 * Take it from the RIG instead. Head -> Tail3 is the body's own long axis by
 * construction, and it measures a clean world X on every bake (reef -1,0,0;
 * hammerhead -1,-0.05,0; tiger -1,0,-0.01; magmaw -1,-0.03,0; greatwhite
 * -1,-0.06,0; hadesmaw -1,-0.01,0). The dorsal axis is then the bind-up the
 * caller measured, and the third axis is the remaining one. */
function bodyAxes(bounds, root = null, up = null) {
  const size = bounds.getSize(new THREE.Vector3());
  const dominant = (vector) => {
    const ax = Math.abs(vector.x), ay = Math.abs(vector.y), az = Math.abs(vector.z);
    return az > ax && az > ay ? 'z' : ay > ax ? 'y' : 'x';
  };
  let long = null;
  const head = findBone(root, 'Head'), tail = findBone(root, 'Tail3');
  if (head && tail) {
    root.updateMatrixWorld(true);
    const a = new THREE.Vector3().setFromMatrixPosition(head.matrixWorld);
    const b = new THREE.Vector3().setFromMatrixPosition(tail.matrixWorld);
    const direction = b.sub(a);
    if (direction.lengthSq() > 1e-9) long = dominant(direction);
  }
  /* Fall back to the box only when the rig cannot answer. */
  if (!long) long = ['x', 'y', 'z'].sort((a, b) => size[b] - size[a])[0];
  let height = up ? dominant(up) : null;
  if (!height || height === long) height = ['x', 'y', 'z'].filter((a) => a !== long).sort((a, b) => size[b] - size[a])[0];
  const width = ['x', 'y', 'z'].find((a) => a !== long && a !== height);
  return { long, height, width, size };
}

function auditWeights(mesh) {
  const geometry = mesh.geometry, index = geometry?.getAttribute('skinIndex'), weight = geometry?.getAttribute('skinWeight'), bones = mesh.skeleton?.bones || [];
  if (!index || !weight) return { vertices: 0, invalid: 0, maxSumError: 0, maxIndex: 0 };
  let invalid = 0, maxSumError = 0, maxIndex = 0;
  for (let i = 0; i < index.count; i++) {
    let sum = 0;
    for (let c = 0; c < 4; c++) {
      const joint = index.getComponent(i, c), value = weight.getComponent(i, c);
      maxIndex = Math.max(maxIndex, joint);
      if (!Number.isInteger(joint) || joint < 0 || joint >= bones.length || !Number.isFinite(value) || value < -1e-5) invalid++;
      sum += Math.max(0, finite(value, 0));
    }
    maxSumError = Math.max(maxSumError, Math.abs(sum - 1));
    if (Math.abs(sum - 1) > 0.02) invalid++;
  }
  return { vertices: index.count, invalid, maxSumError, maxIndex };
}

/* Compensate a bone's axial scale against its parent chain.
 *
 * Neck -> Spine1 -> Spine2 -> Tail1 -> Tail2 -> Tail3 is a PARENT CHAIN, and
 * every bone in it is offset from its parent along bone-local +Y (measured:
 * each carries position (0, 0.139, 0) / (0, 0.119, 0)). A local-Y scale on a
 * parent therefore multiplies the offset of every descendant, so six bones at
 * a modest 1.02 compound to 1.02^6 = 1.13 - a 13% body-length change out of
 * per-bone factors that each looked safely inside the +/-3% tolerance. That
 * compounding, not the tolerance, is why 32 of 40 textured rows threw the
 * length-delta gate and stayed HELD on the toon rig.
 *
 * Bone-local Y is the chain direction, i.e. LENGTH; local X and Z are girth.
 * Girth is the whole point of the bulk/sculpt morph and is not compounded
 * (those axes carry no child offset), so keep it. Length is what breaks the
 * silhouette and the camera contract, so drive it to 1 and let the authored
 * length live in sil.len, which buildLoadedRig already normalizes against. */
const AXIAL_COMPONENT = 1;
function neutralizeAxial(factor) {
  const out = factor.slice();
  out[AXIAL_COMPONENT] = 1;
  return out;
}

function makeBoneSpec(bone, factor, offset, name, record) {
  const safe = new THREE.Vector3(
    clamp(finite(factor[0], 1), MIN_SCALE_FACTOR, MAX_SCALE_FACTOR),
    clamp(finite(factor[1], 1), MIN_SCALE_FACTOR, MAX_SCALE_FACTOR),
    clamp(finite(factor[2], 1), MIN_SCALE_FACTOR, MAX_SCALE_FACTOR)
  );
  const delta = new THREE.Vector3(finite(offset[0]), finite(offset[1]), finite(offset[2]));
  bone.scale.multiply(safe);
  bone.position.add(delta);
  record.bones[name] = { factor: plainVector(safe), offset: plainVector(delta) };
  return { safe, delta };
}

function morphGeometry(mesh, up, bodyLength, dorsalSignal) {
  const source = mesh.geometry, position = source?.getAttribute('position');
  if (!position || Math.abs(dorsalSignal) < 1e-5) return { geometry: source, vertices: 0, maxOffset: 0 };
  const geometry = source.clone(), target = geometry.getAttribute('position');
  const sourcePoint = new THREE.Vector3(); let upMin = Infinity, upMax = -Infinity;
  for (let i = 0; i < position.count; i++) { const d = sourcePoint.fromBufferAttribute(position, i).dot(up); upMin = Math.min(upMin, d); upMax = Math.max(upMax, d); }
  const upRange = Math.max(upMax - upMin, 1e-6);
  const point = new THREE.Vector3(), displacement = new THREE.Vector3();
  const amplitude = bodyLength * clamp(dorsalSignal * 0.07, -0.018, 0.024);
  let changed = 0, maxOffset = 0;
  for (let i = 0; i < target.count; i++) {
    point.fromBufferAttribute(target, i);
    const top = smoothstep(0.52, 0.94, (point.dot(up) - upMin) / upRange);
    if (top <= 1e-5) continue;
    displacement.copy(up).multiplyScalar(amplitude * top);
    point.add(displacement);
    target.setXYZ(i, point.x, point.y, point.z);
    changed++;
    maxOffset = Math.max(maxOffset, Math.abs(amplitude * top));
  }
  target.needsUpdate = true;
  if (geometry.getAttribute('normal')) geometry.computeVertexNormals();
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  geometry.userData.rfMorphGeometry = MORPH_VERSION;
  geometry.userData.rfBindPoseBounds = true;
  return { geometry, vertices: changed, maxOffset };
}

function buildMorphPlan(mesh, def, profile, bodyLength) {
  const { bulk, sculpt, face } = personalityFor(def, profile);
  const headBulk = scalar(bulk.head, 1, 0.72, 1.40), neckBulk = scalar(bulk.neck, 1, 0.72, 1.40);
  const chestBulk = scalar(bulk.chest, 1, 0.60, 1.50), tailBulk = scalar(bulk.tail, 1, 0.60, 1.50), finBulk = scalar(bulk.fin, 1, 0.60, 1.60);
  const headSculpt = scalar(sculpt.head, 0, -0.50, 0.50), neckSculpt = scalar(sculpt.neck, 0, -0.50, 0.50);
  const chestSculpt = scalar(sculpt.chest, 0, -0.60, 0.60), tailSculpt = scalar(sculpt.tail, 0, -0.60, 0.60);
  const jawSculpt = scalar(sculpt.jaw, 0, -0.60, 0.60), underbite = scalar(sculpt.underbite, 0, -0.60, 0.60);
  const brow = scalar(sculpt.brow, 0, -1, 1), hump = scalar(sculpt.hump, 0, -0.60, 0.60), sag = scalar(sculpt.sag, 0, -0.60, 0.60);
  const muscle = scalar(sculpt.muscle, 0, -0.60, 0.60), dorsal = scalar(sculpt.dorsal, 0, -0.60, 0.60);
  const eye = scalar(face.eye, 1, 0.35, 1.45), gape = scalar(face.gape, 0, -0.60, 0.60), tilt = scalar(face.tilt, 0, -1, 1);
  const familyTail = scalar(profile?.tail?.[1], 1, 0.82, 1.18);
  const radial = (bulkValue, sculptValue, bulkGain, sculptGain, extra = 0) => clamp(1 + (bulkValue - 1) * bulkGain + sculptValue * sculptGain + extra, MIN_SCALE_FACTOR, MAX_SCALE_FACTOR);
  const axial = (value) => clamp(value, MIN_SCALE_FACTOR, MAX_SCALE_FACTOR);
  const vertical = (value) => bodyLength * clamp(value, -0.008, 0.008);
  const jawRadial = radial(headBulk, jawSculpt, 0.18, 0.10, (eye - 1) * 0.025);
  const neckRadial = radial(neckBulk, neckSculpt, 0.24, 0.08, muscle * 0.035);
  const chestRadial = radial(chestBulk, chestSculpt, 0.22, 0.08, muscle * 0.045);
  const tailRadial = radial(tailBulk, tailSculpt, 0.12, 0.035, muscle * 0.035);
  const headRadial = radial(headBulk, headSculpt, 0.30, 0.11, (eye - 1) * 0.035);
  const dorsalSignal = dorsal * 0.72 + (finBulk - 1) * 0.42 + hump * 0.20 - sag * 0.10;
  return {
    head: [headRadial, axial(1 + headSculpt * 0.015), headRadial],
    jaw: [jawRadial, axial(1 + underbite * 0.025 + gape * 0.010), axial(1 + jawSculpt * 0.06 + underbite * 0.08)],
    neck: [neckRadial, axial(1 + neckSculpt * 0.010), neckRadial],
    spine1: [chestRadial, axial(1 + chestSculpt * 0.008), chestRadial],
    spine2: [radial(chestBulk, chestSculpt, 0.18, 0.06, muscle * 0.030), axial(1 + chestSculpt * 0.006), radial(chestBulk, chestSculpt, 0.18, 0.06, muscle * 0.030)],
    tail1: [tailRadial, axial(1 + (tailBulk - 1) * 0.045 + tailSculpt * 0.020 + (familyTail - 1) * 0.05), tailRadial],
    tail2: [tailRadial, axial(1 + (tailBulk - 1) * 0.035 + tailSculpt * 0.016 + (familyTail - 1) * 0.04), tailRadial],
    tail3: [radial(tailBulk, tailSculpt, 0.08, 0.025, muscle * 0.025), axial(1 + (tailBulk - 1) * 0.025 + tailSculpt * 0.012 + (familyTail - 1) * 0.03), radial(tailBulk, tailSculpt, 0.08, 0.025, muscle * 0.025)],
    headOffset: [bodyLength * 0.0025 * tilt, 0, vertical(brow * 0.08)],
    jawOffset: [0, 0, -vertical(underbite * 0.34 + jawSculpt * 0.16 + gape * 0.08)],
    neckOffset: [0, 0, vertical(hump * 0.12 - sag * 0.18)],
    spine1Offset: [0, 0, vertical(hump * 0.20 - sag * 0.12)],
    spine2Offset: [0, 0, vertical(hump * 0.28 - sag * 0.18)],
    dorsalSignal,
    sources: { headBulk, neckBulk, chestBulk, tailBulk, finBulk, eye, gape, tilt }
  };
}

function measureMorph(root, mesh, reference = null, upAxis = null) {
  const before = reference?.points ? reference : null, after = captureRestWorld(root, mesh);
  const base = before || after;
  /* Measured per rig, never assumed: see bodyAxes(). */
  const axes = bodyAxes(base.bounds, root, upAxis);
  const LONG = axes.long, HEIGHT = axes.height, WIDTH = axes.width;
  const length = Math.max(base.bounds.max[LONG] - base.bounds.min[LONG], 1e-6);
  const afterLength = after.bounds.max[LONG] - after.bounds.min[LONG];
  let maxOffset = 0;
  if (before && before.count === after.count) {
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    for (let i = 0; i < after.count; i++) maxOffset = Math.max(maxOffset, pointFromArray(before.points, i, a).distanceTo(pointFromArray(after.points, i, b)));
  }
  const head = weightedIndices(mesh, ['Head']), jaw = weightedIndices(mesh, ['LowerJaw']), tail = weightedIndices(mesh, ['Tail1', 'Tail2', 'Tail3']);
  const headBefore = subsetBounds(base.points, head), headAfter = subsetBounds(after.points, head);
  const jawBefore = subsetBounds(base.points, jaw), jawAfter = subsetBounds(after.points, jaw);
  const tailBefore = subsetBounds(base.points, tail), tailAfter = subsetBounds(after.points, tail);
  const jawBeforeCenter = jawBefore.getCenter(new THREE.Vector3()), jawAfterCenter = jawAfter.getCenter(new THREE.Vector3());
  const bodyHeight = Math.max(base.bounds.max[HEIGHT] - base.bounds.min[HEIGHT], 1e-6);
  /* Silhouette gate inputs: projected area and aspect in the plane the camera
   * actually sees (length against height), so a morph that breaks the outline
   * is caught by the same quantity the render shows. */
  const beforeAspect = length / bodyHeight;
  const afterHeight = Math.max(after.bounds.max[HEIGHT] - after.bounds.min[HEIGHT], 1e-6);
  const afterAspect = afterLength / afterHeight;
  return {
    beforeLength: length,
    afterLength,
    axes: { long: LONG, height: HEIGHT, width: WIDTH },
    lengthRatio: afterLength > 0 ? afterLength / length : 1,
    lengthDeltaRatio: afterLength / length - 1,
    maxOffset,
    maxOffsetRatio: maxOffset / length,
    headWidthRatio: head.length === 0 ? 1 : extentRatio(headBefore, headAfter, WIDTH),
    headHeightRatio: head.length === 0 ? 1 : extentRatio(headBefore, headAfter, HEIGHT),
    jawDropRatio: jaw.length === 0 ? 0 : (jawBeforeCenter[HEIGHT] - jawAfterCenter[HEIGHT]) / length,
    tailLengthRatio: tail.length === 0 ? 1 : extentRatio(tailBefore, tailAfter, LONG),
    dorsalHeightRatio: afterHeight / bodyHeight,
    aspectRatio: afterAspect / beforeAspect,
    areaRatio: (afterLength * afterHeight) / (length * bodyHeight),
    bounds: { before: base.bounds, after: after.bounds },
    vertexCount: after.count
  };
}

/* Hinge the LowerJaw open in the REST pose, and verify against the skin that
 * it opened rather than swung sideways.
 *
 * Returns a record describing what was applied (and why, if nothing was), so
 * the evidence harness and the selftest can read the decision rather than
 * infer it from pixels.
 *
 * `up` is the rig's measured dorsal axis, so "ventral" is the direction the
 * caller already established rather than a world-space guess - the same axis
 * the dorsal crest rides. */
function applyRestGape(rigRoot, mesh, jawBone, gapeSignal) {
  const record = {
    applied: false, radians: 0, degrees: 0, axis: 'local X', travelRatio: 0,
    gapeRatio: 0, reason: null
  };
  if (!jawBone) { record.reason = 'no LowerJaw bone'; return record; }
  const jawIndices = weightedIndices(mesh, ['LowerJaw']);
  if (jawIndices.length < 8) { record.reason = `jaw cloud too small (${jawIndices.length} verts)`; return record; }
  const headIndices = weightedIndices(mesh, ['Head']);

  /* WHICH DIRECTION IS "OPEN", measured from the hinge itself.
   *
   * Neither the caller's bind-space `up` nor bodyAxes()'s HEIGHT answers this
   * correctly, and both were tried against the render:
   *
   *   - `up` is a BIND-space axis while captureRestWorld reports WORLD
   *     points, and mesh.matrixWorld on these bakes is an axis-permuting
   *     rotation (reef's maps bind X onto world Z), so the two spaces do not
   *     share axes at all;
   *   - bodyAxes() calls the box's longest non-long axis "height", which on
   *     these rigs is world Y (reef's body box is 84/106/21) - but the jaw
   *     actually swings along world X.
   *
   * The hinge is its own best instrument. Rotate the jaw a probe amount, see
   * which way the jaw cloud's centroid actually moved in world space, and
   * take THAT as the opening direction by construction. Measured over the
   * eight evidence rows a +26 degree local-X hinge moves the jaw centroid by
   * (+10.0,+1.9,0) reef, (+9.5,+5.1,0) tiger, (+11.4,-2.8,0) hammerhead,
   * (+9.6,+12.6,0) greatwhite, (+9.4,+2.4,0) blue, (+25.0,+13.6,0)
   * megalodon, (+9.8,+4.1,0) zeusfin, (+31.8,+16.8,0) typhonmaw: dominated
   * by +X on every row, with Z identically zero (the hinge is planar, as a
   * jaw should be).
   *
   * This makes the direction a MEASUREMENT rather than an assumption, so a
   * re-bake that reorients the model keeps working, and it removes the whole
   * class of wrong-axis bug that produced the closed mouths to begin with. */
  const restProbe = jawBone.quaternion.clone();
  const jawCentreAt = (angle) => {
    jawBone.quaternion.copy(restProbe);
    if (angle) jawBone.rotateOnAxis(JAW_HINGE_AXIS, angle);
    const state = captureRestWorld(rigRoot, mesh);
    return subsetBounds(state.points, jawIndices).getCenter(new THREE.Vector3());
  };
  const centreRest = jawCentreAt(0);
  const openDir = jawCentreAt(GAPE_MIN_RAD).sub(centreRest);
  jawBone.quaternion.copy(restProbe);
  rigRoot.updateMatrixWorld(true);
  if (openDir.lengthSq() < 1e-12) { record.reason = 'hinge moved nothing'; return record; }
  openDir.normalize();

  /* Nose direction, with any component along the hinge travel removed so
   * "forward" and "open" stay independent. The jaw cloud sits forward of the
   * head centroid on every bake in this line. */
  const nose = (() => {
    const state = captureRestWorld(rigRoot, mesh);
    const jawCentre = subsetBounds(state.points, jawIndices).getCenter(new THREE.Vector3());
    if (!headIndices.length) return new THREE.Vector3(0, 1, 0);
    const headCentre = subsetBounds(state.points, headIndices).getCenter(new THREE.Vector3());
    const delta = jawCentre.sub(headCentre);
    delta.addScaledVector(openDir, -delta.dot(openDir));
    return delta.lengthSq() > 1e-12 ? delta.normalize() : new THREE.Vector3(0, 1, 0);
  })();

  /* Ventral travel is measured at the jaw's FORWARD TIP, not at its centroid.
   *
   * The centroid is the obvious probe point and it is the wrong one: the
   * hinge sits near the middle of the LowerJaw cloud, so a rotation about it
   * barely moves the centroid at all while swinging the chin through a large
   * arc. Measured over the eight evidence rows, a 26 degree hinge moves the
   * centroid by -0.036..+0.046 of head height - indistinguishable from noise,
   * and below any floor worth setting - while it moves the TIP by
   * 0.29..1.14 (reef 1.14, hammerhead 0.96, greatwhite 0.67, megalodon 0.63,
   * tiger 0.43, blue 0.31, zeusfin 0.29). The tip is also the thing the
   * viewer reads as "the mouth is open", so it is both the sensitive
   * measurement and the correct one.
   *
   * The tip is the forward 20% of the jaw cloud along the frame's nose
   * direction, and "forward" is derived from the jaw/head geometry rather
   * than assumed: the nose end is whichever end of the jaw cloud's long axis
   * is further from the head centroid.
   *
   * The denominator is the HEAD's extent along the dorsal axis, which is what
   * the brief's "gape 25-35% of head height" is expressed against, so the
   * number tuned here is the number the gate reads. */
  const measure = () => {
    const state = captureRestWorld(rigRoot, mesh);
    const jawBounds = subsetBounds(state.points, jawIndices);
    const headBounds = headIndices.length ? subsetBounds(state.points, headIndices) : jawBounds;
    /* Head extent along the OPENING direction: the denominator the brief's
     * "gape 25-35% of head height" is expressed against, measured along the
     * same axis the gape moves so the ratio is dimensionally honest. */
    const headSize = headBounds.getSize(new THREE.Vector3());
    const headHeight = Math.max(
      Math.abs(headSize.x * openDir.x) + Math.abs(headSize.y * openDir.y) + Math.abs(headSize.z * openDir.z),
      1e-6);
    /* Forward 20% of the jaw cloud = the chin. */
    const point = new THREE.Vector3();
    const along = [];
    for (const index of jawIndices) along.push(pointFromArray(state.points, index, point).dot(nose));
    along.sort((a, b) => b - a);
    const cut = along[Math.floor(along.length * 0.20)] ?? along[0];
    let sum = 0, count = 0;
    for (const index of jawIndices) {
      pointFromArray(state.points, index, point);
      if (point.dot(nose) < cut) continue;
      sum += point.dot(openDir); count++;
    }
    const tipOpen = count
      ? sum / count
      : jawBounds.getCenter(new THREE.Vector3()).dot(openDir);
    return { drop: -tipOpen, headHeight };
  };

  const before = measure();
  const rest = jawBone.quaternion.clone();
  /* face.gape maps -0.60..+0.60 onto the 22-30 degree band. */
  const t = clamp((finite(gapeSignal, 0) + 0.60) / 1.20, 0, 1);
  const target = GAPE_MIN_RAD + (GAPE_MAX_RAD - GAPE_MIN_RAD) * t;

  /* Try the hinge in both directions and keep whichever OPENS the jaw. The
   * probe says +X is ventral on all eight evidence rows, but the sign is a
   * property of how each bake authored its bind pose, and assuming it is
   * exactly the class of bug that produced the closed mouths in the first
   * place. Measuring costs one extra skinning pass per row at build time. */
  let best = null;
  for (const sign of [1, -1]) {
    jawBone.quaternion.copy(rest);
    jawBone.rotateOnAxis(JAW_HINGE_AXIS, sign * target);
    const after = measure();
    /* Positive travel = the jaw centroid moved AGAINST the dorsal axis. */
    const travel = (before.drop - after.drop) / before.headHeight;
    if (!best || travel > best.travel) best = { sign, travel, after };
  }

  if (!best || best.travel < GAPE_MIN_TRAVEL) {
    jawBone.quaternion.copy(rest);
    record.reason = `hinge did not open the jaw (best travel ${(best?.travel ?? 0).toFixed(4)} of head height, floor ${GAPE_MIN_TRAVEL})`;
    record.travelRatio = Number((best?.travel ?? 0).toFixed(6));
    return record;
  }

  /* ABSOLUTE, not relative.
   *
   * Every bake in this line authors the LowerJaw already CLOSED, and by
   * different amounts: measured as the bone's own local-X euler at rest,
   * reef -14.48 deg, hammerhead -15.50, blue -16.31, greatwhite -17.94,
   * zeusfin -19.61, tiger -20.22. Adding a 26 deg hinge on top of that nets
   * only 6-11 deg of actual opening, and nets a DIFFERENT amount on every
   * row - which is both too small to read at crop size and inconsistent
   * across the roster.
   *
   * The brief specifies the gape as a property of the rendered pose ("22-30
   * deg by row personality"), so the target is the FINAL angle: cancel the
   * bake's authored closure first, then hinge to the requested angle. Every
   * row then presents the same measured gape regardless of how its bake
   * happened to author the rest jaw.
   *
   * The bite is unaffected: it still composes on top of whatever quaternion
   * ends up here, because shark3d.js captures baseJawQuaternion from the bone
   * AFTER this runs. */
  /* THE BONE IS LEFT AT ITS BIND POSE. THIS IS DELIBERATE AND IT IS THE WHOLE
   * DESIGN OF THIS FUNCTION - read this before "fixing" it.
   *
   * The obvious implementation is to leave the jaw rotated here, and it is
   * WRONG, because two things downstream both read this bone:
   *
   *   1. `buildTexturedFace()` (shark3d.js:3000) runs AFTER applyMorph and
   *      authors the tooth rows and the mouth cavity against
   *      `jawBone.matrixWorld` at that moment. If the bone is already hinged
   *      open, the batch bakes the OPEN pose into its geometry.
   *   2. `shark3d.js:3059` then captures `baseJawQuaternion` from the bone and
   *      rotates it again, every frame.
   *
   * So a rotation left here is applied TWICE: once baked into the face batch's
   * vertices, once by the runtime. Rendered, the tooth rows tear off the head
   * and hang in open water beside it - the exact r14 defect this whole
   * revision was about. That is not a hypothesis: it is what the first
   * heads_grin render showed on reef, and it is why this function now restores
   * the bone.
   *
   * What this function therefore delivers is a MEASUREMENT, not a pose:
   * `record.gape` says how far this rig's jaw can hinge, in which direction,
   * and what that is as a fraction of head height - measured by actually
   * skinning the mesh rather than assumed. The gape itself is applied by
   * shark3d.js's existing per-frame jaw code, which already runs on every
   * textured row and already composes the bite on top.
   *
   * The consequence, stated plainly: this lane CANNOT open the rest mouth on
   * its own. `shark3d.js:3117` and `:3148` rotate by `-jawGape`, and the sign
   * is inverted (measured: local +X opens on all eight evidence rows). Fixing
   * that sign is a one-character change in a file this lane does not own, and
   * it is the single thing an orchestrator has to merge for the mouths to
   * open. See NOTES-rev15-grin.md. */
  /* The bone goes back to its bind pose HERE, and the hinge is applied later
   * by commitRestGape(). See the note above: leaving it rotated makes the
   * face batch bake the open pose into its vertices AND get rotated again at
   * runtime, which tears the tooth rows off the head.
   *
   * The angle is ABSOLUTE - the final rendered local-X euler - not an
   * increment, because every bake authors the jaw already closed by a
   * different amount (reef -14.48 deg, hammerhead -15.50, blue -16.31,
   * greatwhite -17.94, zeusfin -19.61, tiger -20.22). An increment nets a
   * different opening on every row; an absolute target does not. */
  const restEuler = new THREE.Euler().setFromQuaternion(rest, 'XYZ');
  jawBone.quaternion.copy(rest);
  rigRoot.updateMatrixWorld(true);
  record.applied = false;
  record.pending = true;
  record.radians = Number(target.toFixed(6));
  record.degrees = Number((target * 180 / Math.PI).toFixed(2));
  record.openSign = best.sign;
  record.authoredClosureDeg = Number((restEuler.x * 180 / Math.PI).toFixed(2));
  /* Everything commitRestGape needs to apply the hinge without re-measuring. */
  record.commit = {
    boneName: 'LowerJaw',
    absoluteRadians: best.sign * target - restEuler.x,
    targetRadians: best.sign * target
  };
  record.sign = best.sign;
  record.travelRatio = Number(best.travel.toFixed(6));
  /* The gape the gate reads: vertical opening between the head's ventral
   * edge and the jaw cloud's dorsal edge, as a fraction of head height. */
  record.gapeRatio = Number(best.travel.toFixed(6));
  return record;
}

function applyMorph(rigRoot, skinnedMesh, def, profile = {}) {
  if (!rigRoot || !skinnedMesh?.isSkinnedMesh) throw new Error(`${def?.id || 'unknown'}: L2 morph needs a SkinnedMesh`);
  if (rigRoot.userData?.rfL2MorphRecord) return rigRoot.userData.rfL2MorphRecord;
  const bones = Object.fromEntries(REQUIRED_BONES.map((name) => [name, findBone(rigRoot, name)]));
  const missing = REQUIRED_BONES.filter((name) => !bones[name]);
  if (missing.length) throw new Error(`${def?.id || 'unknown'}: L2 morph missing bones ${missing.join(',')}`);
  const beforeWeights = auditWeights(skinnedMesh);
  if (beforeWeights.invalid || beforeWeights.maxIndex >= (skinnedMesh.skeleton?.bones?.length || 0)) throw new Error(`${def?.id || 'unknown'}: L2 morph refuses invalid skin weights`);
  const before = captureRestWorld(rigRoot, skinnedMesh);
  /* Length along the MEASURED long axis, not world X: the bakes are authored
   * long-on-Z or long-on-Y depending on the source asset. */
  const beforeAxes = bodyAxes(before.bounds, rigRoot, vec3(profile?.bindUp, [0, 1, 0]));
  const bodyLength = Math.max(before.bounds.max[beforeAxes.long] - before.bounds.min[beforeAxes.long], 1e-6);
  const basePlan = buildMorphPlan(skinnedMesh, def, profile, bodyLength), record = {
    id: String(def?.id || ''), version: MORPH_VERSION, neutral: false, restPose: true, seamFree: true,
    roleSource: 'PERSONALITY_TABLE bulk/sculpt/face; bounded rest-pose bone morph', vertexCount: before.count,
    maxOffset: 0, maxOffsetRatio: 0, maxOffsetOutsideCrest: 0, maxOffsetOutsideCrestRatio: 0,
    bones: {}, weights: beforeWeights, dorsal: { signal: Number(basePlan.dorsalSignal.toFixed(5)), vertices: 0, maxOffset: 0 }, metrics: null,
    relax: 1
  };
  /* RELAX-TO-FIT: the gates further down are HARD silhouette bounds, but a
   * row that threw over them lost its real textured skin entirely (that is
   * what held megalodon/dunkleosteus/warbringer/typhonmaw/kampechrono on the
   * toon rig). Instead of failing the build, walk the WHOLE plan toward
   * neutral until the MEASURED morph fits: the row keeps the largest
   * exaggeration the silhouette bound allows and never renders out of
   * bounds. r=0 is the exact rest pose, which fits by construction, so the
   * walk always terminates with a legal morph. */
  const restBones = REQUIRED_BONES.map((name) => ({ bone: bones[name], scale: bones[name].scale.clone(), position: bones[name].position.clone() }));
  const restGeometry = skinnedMesh.geometry;
  const fitsBounds = (m) => Math.abs(m.lengthDeltaRatio) <= MAX_LENGTH_DELTA + 1e-5
    && m.maxOffsetRatio <= MAX_DISPLACEMENT_RATIO + 1e-5
    && Math.abs(m.aspectRatio - 1) <= MAX_ASPECT_DELTA + 1e-5
    && Math.abs(m.areaRatio - 1) <= MAX_AREA_DELTA + 1e-5;
  const towardNeutral = (value, r) => 1 + (value - 1) * r;
  const scalePlan = (plan, r) => ({
    head: plan.head.map((v) => towardNeutral(v, r)),
    jaw: plan.jaw.map((v) => towardNeutral(v, r)),
    neck: plan.neck.map((v) => towardNeutral(v, r)),
    spine1: plan.spine1.map((v) => towardNeutral(v, r)),
    spine2: plan.spine2.map((v) => towardNeutral(v, r)),
    tail1: plan.tail1.map((v) => towardNeutral(v, r)),
    tail2: plan.tail2.map((v) => towardNeutral(v, r)),
    tail3: plan.tail3.map((v) => towardNeutral(v, r)),
    headOffset: plan.headOffset.map((v) => v * r),
    jawOffset: plan.jawOffset.map((v) => v * r),
    neckOffset: plan.neckOffset.map((v) => v * r),
    spine1Offset: plan.spine1Offset.map((v) => v * r),
    spine2Offset: plan.spine2Offset.map((v) => v * r),
    dorsalSignal: plan.dorsalSignal * r, sources: plan.sources
  });
  const restoreRest = () => {
    for (const rest of restBones) { rest.bone.scale.copy(rest.scale); rest.bone.position.copy(rest.position); }
    skinnedMesh.geometry = restGeometry;
  };
  /* The dorsal crest must ride the rig's REAL up axis. buildLoadedRig passes
   * the template's measured bindUp (prepareTemplate correlates each bind axis
   * against world up and keeps the sign), so use it; the old [-1,0,0] default
   * pushed the crest sideways on every bake whose bind-up is Y, which is what
   * turned morphed rows into deformed blobs. */
  const up = vec3(profile?.bindUp, [0, 1, 0]);
  let p = basePlan, measured = null, relaxUsed = 1;
  for (const r of [1, 0.72, 0.52, 0.36, 0.25, 0.12, 0]) {
    restoreRest();
    record.bones = {};
    p = scalePlan(basePlan, r); relaxUsed = r;
    makeBoneSpec(bones.Head, p.head, p.headOffset, 'Head', record);
    makeBoneSpec(bones.LowerJaw, p.jaw, p.jawOffset, 'LowerJaw', record);
    makeBoneSpec(bones.Neck, neutralizeAxial(p.neck), p.neckOffset, 'Neck', record);
    makeBoneSpec(bones.Spine1, neutralizeAxial(p.spine1), p.spine1Offset, 'Spine1', record);
    makeBoneSpec(bones.Spine2, neutralizeAxial(p.spine2), p.spine2Offset, 'Spine2', record);
    makeBoneSpec(bones.Tail1, neutralizeAxial(p.tail1), [0, 0, 0], 'Tail1', record);
    makeBoneSpec(bones.Tail2, neutralizeAxial(p.tail2), [0, 0, 0], 'Tail2', record);
    makeBoneSpec(bones.Tail3, neutralizeAxial(p.tail3), [0, 0, 0], 'Tail3', record);
    const dorsal = morphGeometry(skinnedMesh, up, bodyLength, p.dorsalSignal);
    if (dorsal.geometry !== skinnedMesh.geometry) skinnedMesh.geometry = dorsal.geometry;
    record.dorsal = { signal: Number(p.dorsalSignal.toFixed(5)), vertices: dorsal.vertices, maxOffset: Number(dorsal.maxOffset.toFixed(6)) };
    measured = measureMorph(rigRoot, skinnedMesh, before, up);
    if (fitsBounds(measured)) break;
  }
  record.relax = relaxUsed;
  /* REST GAPE runs AFTER the relax-to-fit loop, deliberately.
   *
   * The loop's job is to bound the SILHOUETTE against the unmorphed rest
   * pose, and an open mouth legitimately changes the length/height footprint
   * of the head - it is the change we are trying to make. Folding it into the
   * loop would make the gape compete with the bulk/sculpt morph for the same
   * aspect/area budget and get walked back toward neutral, i.e. the mouth
   * would close again on exactly the chunky rows that most need it.
   *
   * The gape is bounded on its own terms instead: a hard 22-30 degree band,
   * one bone, hinge-only (no scale, no translation), and reverted outright if
   * the skin says it did not open. It cannot run away the way a scale chain
   * can, so it does not need the relax walk. */
  const gapeSignal = finite(basePlan.sources.gape, 0);
  record.gape = applyRestGape(rigRoot, skinnedMesh, bones.LowerJaw, gapeSignal);
  const afterWeights = auditWeights(skinnedMesh);
  if (afterWeights.invalid || afterWeights.maxSumError > 0.02) throw new Error(`${def?.id || 'unknown'}: L2 morph changed or exposed invalid skin weights`);
  record.maxOffset = Number(measured.maxOffset.toFixed(6)); record.maxOffsetRatio = Number(measured.maxOffsetRatio.toFixed(6));
  record.maxOffsetOutsideCrest = record.maxOffset; record.maxOffsetOutsideCrestRatio = record.maxOffsetRatio;
  record.metrics = {
    lengthRatio: Number(measured.lengthRatio.toFixed(6)), lengthDeltaRatio: Number(measured.lengthDeltaRatio.toFixed(6)),
    headWidthRatio: Number(measured.headWidthRatio.toFixed(6)), headHeightRatio: Number(measured.headHeightRatio.toFixed(6)),
    jawDropRatio: Number(measured.jawDropRatio.toFixed(6)), tailLengthRatio: Number(measured.tailLengthRatio.toFixed(6)),
    dorsalHeightRatio: Number(measured.dorsalHeightRatio.toFixed(6)),
    aspectRatio: Number(measured.aspectRatio.toFixed(6)), areaRatio: Number(measured.areaRatio.toFixed(6)),
    axes: measured.axes
  };
  record.weights = { ...afterWeights, unchanged: afterWeights.invalid === beforeWeights.invalid && afterWeights.maxSumError <= beforeWeights.maxSumError + 1e-6 };
  /* The bounds themselves are unchanged and still hard. Relax-to-fit above
   * guarantees they hold, so reaching this line out of bounds is a defect,
   * not a row to reject. */
  if (!fitsBounds(measured)) throw new Error(`${def?.id || 'unknown'}: L2 morph exceeds silhouette bounds even at neutral (measure defect)`);
  /* Lane F2: read the crest vertex count off the RECORD, not off a `dorsal`
   * binding. The relax-to-fit loop above scopes its `dorsal` result inside the
   * loop body, so referring to it here threw `dorsal is not defined` on every
   * textured build - which aborted buildLoadedRig and dropped every textured
   * row back to an untextured placeholder capsule. record.dorsal is written on
   * each iteration and holds the accepted iteration's count. */
  /* A rest gape is a real change to the rest pose, so a row that got one is
   * NOT neutral even when every scale factor relaxed back to 1. Reporting it
   * as neutral would tell the gates "this rig is untouched" while its jaw is
   * hinged 26 degrees open. */
  record.neutral = Object.values(record.bones).every((bone) => bone.factor.every((value) => Math.abs(value - 1) < 1e-6) && bone.offset.every((value) => Math.abs(value) < 1e-6)) && record.dorsal.vertices === 0 && !record.gape.applied;
  rigRoot.userData.rfL2MorphRecord = record;
  return record;
}

/* Apply the rest gape that applyMorph MEASURED but deliberately left pending.
 *
 * Must be called AFTER the face batch is built and BEFORE shark3d.js captures
 * `baseJawQuaternion`. `buildTexturedFace()` (shark3d.js:3000) sits exactly in
 * that window and is where this is called from; see the long note in
 * applyRestGape for why neither end of that window is negotiable.
 *
 * Idempotent: a second call on the same rig is a no-op, so a row that somehow
 * routes through two build paths cannot end up double-hinged - which is the
 * failure mode this whole split exists to prevent.
 *
 * Sets the ABSOLUTE rest angle, i.e. the LowerJaw's final local-X euler on
 * the rendered rig.
 *
 * The sign fix was merged, so shark3d.js:3117/3148 now OPEN the jaw
 * (`rotateX(+jawGape * JAW_MAX_ROTATION)`) instead of closing it. But
 * JAW_REST_GAPE = 0 does NOT mean they add nothing at rest: line 3085 is
 *
 *     jawRestGape = clamp(JAW_REST_GAPE + personality.face.gape, 0.20, 0.35)
 *
 * and the 0.20 FLOOR survives the zeroed constant, so every textured row
 * still gets a fixed `0.20 * 0.72` = 0.144 rad = 8.25 deg of rest opening
 * from shark3d.js. Measured on the merged tree: without subtracting it, reef
 * renders 34.25 deg against the 26 requested, and every row overshoots by the
 * same 8.25.
 *
 * So the term is measured off shark3d.js's own published value rather than
 * mirrored as a constant: `group.userData.rfJawRestGape` and
 * `rfJawMaxRotation` are written by that code at build time, so if the floor
 * or the max rotation changes upstream this follows it automatically. That is
 * the whole reason the old JAW_*_HINT mirrors were deleted.
 *
 * The per-frame line resets to baseJawQuaternion - captured AFTER this runs -
 * and adds the same fixed term plus the bite, so the bite still composes
 * additively on the pose set here.
 */
function commitRestGape(rigRoot, shark3dRestRadians = 0) {
  const record = rigRoot?.userData?.rfL2MorphRecord;
  const gape = record?.gape;
  if (!gape?.pending || !gape.commit) return null;
  const bone = findBone(rigRoot, gape.commit.boneName);
  if (!bone) return null;

  /* r15 lane JAW. The CLOSED base is captured BEFORE the hinge, and published.
   *
   * This used to hinge the bone and walk away, which made the open pose the
   * bone's resting quaternion. shark3d.js then captured THAT as
   * `baseJawQuaternion` and every frame did `copy(base); rotateX(+gape)`, so
   * the jaw's floor was ~26 deg open and no input could ever close it - the
   * owner's "sharks with open jaws never shut them", exactly.
   *
   * The hinge itself is still applied here, because face_textured.js has to
   * author the lip line, tooth seats and cavity against the POSED mouth (see
   * the long note at its call site). What changes is that the closed base and
   * the rest/max angles are recorded on `rfJawAuthority` first, so a single
   * per-frame writer can reconstruct ANY angle from the closed pose instead of
   * accumulating on top of an already-open one. face_textured restores the
   * bone to that base once the face is authored. */
  const closedBase = bone.quaternion.clone();
  const applied = gape.commit.absoluteRadians - finite(shark3dRestRadians, 0);
  bone.rotateOnAxis(JAW_HINGE_AXIS, applied);
  rigRoot.updateMatrixWorld(true);
  gape.pending = false;
  gape.applied = true;
  gape.netHingeDeg = Number((applied * 180 / Math.PI).toFixed(2));
  gape.shark3dRestDeg = Number((finite(shark3dRestRadians, 0) * 180 / Math.PI).toFixed(2));

  /* THE GAPE AUTHORITY RECORD. One place that says, for this rig: where the
   * jaw is when shut, which way it opens, and how far. `openRadians` is the
   * signed FULL-open travel; the runtime scales it by a 0..1 gape signal.
   *
   * `restRadians` is deliberately NOT the 26 deg the old rest pose baked in.
   * A shark at rest holds a slight gape, not a yawn - the brief asks for
   * 12-18% of full travel. The authored 26 deg becomes the reference for
   * FULL open, and rest sits at a fraction of it. */
  rigRoot.userData.rfJawAuthority = {
    boneName: gape.commit.boneName,
    axis: [JAW_HINGE_AXIS.x, JAW_HINGE_AXIS.y, JAW_HINGE_AXIS.z],
    closedBase: [closedBase.x, closedBase.y, closedBase.z, closedBase.w],
    /* Signed radians from the closed base to a FULL open jaw. The authored
     * rest gape (~26 deg) is the widest this bake was measured to open
     * cleanly, so it is the natural full-open reference. */
    openRadians: applied,
    openDeg: Number((applied * 180 / Math.PI).toFixed(2)),
    sign: gape.sign,
  };
  return gape;
}

/* THE SINGLE GAPE AUTHORITY.
 *
 * Writes the LowerJaw quaternion for one frame, from the CLOSED base pose plus
 * an angle. Nothing else may touch that bone: the r15 defect was three writers
 * (commitRestGape's bake, shark3d's build-time line, shark3d's per-frame line)
 * composing on top of each other, which is how the rest pose ended up being
 * the open pose and why the jaw could not shut.
 *
 * `gape01` is 0 (fully shut) .. 1 (fully open), where "fully open" is the
 * angle the bake was measured to hinge to. It is absolute, not incremental,
 * so calling this twice in a frame is harmless and calling it with 0 always
 * produces a closed mouth regardless of what ran before.
 *
 * Returns the applied angle in degrees so a probe or gate can read the
 * rendered jaw without re-deriving it from the quaternion.
 */
function writeJawGape(rigRoot, gape01) {
  const authority = rigRoot?.userData?.rfJawAuthority;
  if (!authority) return null;
  const bone = findBone(rigRoot, authority.boneName);
  if (!bone) return null;
  const k = Math.min(Math.max(finite(gape01, 0), 0), 1);
  const base = authority.closedBase;
  bone.quaternion.set(base[0], base[1], base[2], base[3]);
  const angle = authority.openRadians * k;
  if (angle) bone.rotateOnAxis(JAW_HINGE_AXIS, angle);
  return Number((angle * 180 / Math.PI).toFixed(3));
}

export { applyMorph, measureMorph, commitRestGape, writeJawGape };
export default applyMorph;
