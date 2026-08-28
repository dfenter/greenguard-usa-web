/* Razorfin HSE L2: bounded rest-pose exaggeration for baked shark rigs.
 *
 * This module owns the textured-rig silhouette pass. It changes bone scale
 * and position before buildLoadedRig captures the animation rest transforms.
 * Runtime swim and jaw motion therefore compose on top of the morph instead
 * of being overwritten by it.
 */
import * as THREE from 'three';

const MORPH_VERSION = 'hse-l2-rev14';
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
  record.neutral = Object.values(record.bones).every((bone) => bone.factor.every((value) => Math.abs(value - 1) < 1e-6) && bone.offset.every((value) => Math.abs(value) < 1e-6)) && record.dorsal.vertices === 0;
  rigRoot.userData.rfL2MorphRecord = record;
  return record;
}

export { applyMorph, measureMorph };
export default applyMorph;
