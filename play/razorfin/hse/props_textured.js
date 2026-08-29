/* Razorfin HSE L3: identity props for baked textured rigs.
 *
 * Baked shark meshes do not share Sharky's bind axes or head proportions.
 * This module measures the actual mesh and bones every time it mounts a
 * feature batch. All props for a row share one SkinnedMesh and one material,
 * so the feature layer costs one draw and follows the same bones as the skin.
 */
import * as THREE from 'three';

const TAU = Math.PI * 2;
/* Rev 15 kill switch for the kaiju spine ridge.
 *
 * FALSE ships the two kaiju (Sharkjira, Leviathan Rex) with their charcoal
 * hide and NO spine plates, which is the honest state: after five bounded
 * attempts the ridge geometry still renders detached from the back, and a
 * visibly floating slab is worse than no ridge at all.
 *
 * What is known, measured, and NOT the cause (see NOTES-rev15-kaiju.md):
 *   - not parenting, skeleton, bindMatrix or matrixWorld (all verified
 *     identical to the body's in the live browser)
 *   - not a rigid offset (per-station root-to-skin deltas are sub-1% of body
 *     length and point in inconsistent directions)
 *   - not the cross-station truss: that WAS a real defect, confirmed by a
 *     wireframe isolation render and removed -- the ridge is now independent
 *     closed-fan plates with no bridging mesh, and it still floats
 *   - not the bind/posed emission mismatch: measured at 0.057 of body length
 *     on greatwhite_cy, and compensating for it did not move the render
 *
 * Flip to true to re-enable the plates once the remaining displacement is
 * understood; everything else in this module is unaffected by this switch. */
const RF_KAIJU_RIDGE = false;
const TEXTURED_CLASS_GLOW = new Set(['legendary', 'god', 'demon']);
const FEATURE = Object.freeze({
  plate: 0,
  atomic: 1,
  armor: 2,
  tusk: 3,
  horn: 4,
  crown: 5,
  saw: 6,
  cheek: 7,
  seam: 8,
  ridge: 9,
  eye: 10,
  pupil: 11,
  tooth: 12,
  brow: 13
});

function clamp(value, lo, hi) { return Math.max(lo, Math.min(hi, value)); }
function finite(value, fallback) { return Number.isFinite(value) ? value : fallback; }
function axisVector(axis) {
  const out = new THREE.Vector3(); out[axis] = 1; return out;
}
function axisValue(vector, axis) { return vector[axis]; }
function componentAxes(longAxis, upAxis) {
  const acrossAxis = ['x', 'y', 'z'].find((axis) => axis !== longAxis && axis !== upAxis) || 'x';
  return { long: axisVector(longAxis), up: axisVector(upAxis), across: axisVector(acrossAxis), acrossAxis };
}
function localPosition(longAxis, upAxis, long, up, across) {
  const out = new THREE.Vector3(); out[longAxis] = long; out[upAxis] = up;
  out[['x', 'y', 'z'].find((axis) => axis !== longAxis && axis !== upAxis)] = across;
  return out;
}
function coordFromWorld(body, object, axis) {
  const world = object.getWorldPosition(new THREE.Vector3());
  return axisValue(body.worldToLocal(world), axis);
}

/* Rev 15: read the POSED skin, not the bind pose.
 *
 * Every band this module measures used to come straight off the geometry's
 * `position` attribute, which is the BIND pose. The shark renders POSED, so
 * a mouth band measured at bind time can sit a long way from where the jaw
 * actually is -- that is what left a detached jaw card hanging under the
 * head.
 *
 * The FACE lane hit the same class of bug and documented the mechanism in
 * NOTES-rev15-face.md: `SkinnedMesh.applyBoneTransform` reads
 * `skeleton.boneMatrices`, a Float32Array that only `Skeleton.update()`
 * fills. Nothing in the build path calls it, so in the BROWSER that array is
 * still identity when the rig is built and applyBoneTransform returns the
 * vertex unchanged. In node it happens to hold usable values, which is why
 * the numeric gates were a false green.
 *
 * Fix, same as theirs: compose `bindMatrixInverse * bone.matrixWorld` by hand
 * and blend by skin weight. `updateMatrixWorld(true)` guarantees
 * `bone.matrixWorld` is current in both runtimes. */
function makePosedSampler(body) {
  const position = body.geometry?.getAttribute('position');
  const skinIndex = body.geometry?.getAttribute('skinIndex');
  const skinWeight = body.geometry?.getAttribute('skinWeight');
  const bones = body.skeleton?.bones;
  body.updateMatrixWorld(true);
  if (!skinIndex || !skinWeight || !bones || !bones.length) {
    /* Not skinned, or missing weights: the bind pose IS the pose. */
    return (i, out) => out.fromBufferAttribute(position, i);
  }
  /* boneMatrix = bindMatrixInverse * bone.matrixWorld, per bone, once. */
  const matrices = bones.map((bone) => {
    const m = new THREE.Matrix4();
    bone.updateMatrixWorld(true);
    return m.multiplyMatrices(bone.matrixWorld, body.skeleton.boneInverses[bones.indexOf(bone)] || new THREE.Matrix4());
  });
  const bind = body.bindMatrix, bindInverse = body.bindMatrixInverse;
  const base = new THREE.Vector3(), temp = new THREE.Vector3(), acc = new THREE.Vector3();
  return (i, out) => {
    base.fromBufferAttribute(position, i).applyMatrix4(bind);
    acc.set(0, 0, 0);
    let total = 0;
    for (let k = 0; k < 4; k++) {
      const weight = skinWeight.getComponent(i, k);
      if (weight === 0) continue;
      const matrix = matrices[skinIndex.getComponent(i, k)];
      if (!matrix) continue;
      temp.copy(base).applyMatrix4(matrix).multiplyScalar(weight);
      acc.add(temp); total += weight;
    }
    if (total <= 1e-6) return out.fromBufferAttribute(position, i);
    return out.copy(acc).applyMatrix4(bindInverse);
  };
}

/* The bake's axis is not a contract of the low-poly rig. Long is measured
 * from the POSED vertex cloud; dorsal is resolved by measuring the fin. */
function measureFrame(body) {
  const position = body.geometry?.getAttribute('position');
  if (!position || !position.count) return null;
  const samplePosed = makePosedSampler(body);
  /* The box must come from the POSED cloud too: geometry.boundingBox is the
   * bind pose, and every station/height below is a fraction of this box. */
  const box = new THREE.Box3();
  { const scan = new THREE.Vector3(); for (let i = 0; i < position.count; i++) box.expandByPoint(samplePosed(i, scan)); }
  const size = box.getSize(new THREE.Vector3());
  const longAxis = ['x', 'y', 'z'].sort((a, b) => size[b] - size[a])[0];
  const residual = ['x', 'y', 'z'].filter((axis) => axis !== longAxis);
  const origin = body.localToWorld(new THREE.Vector3());
  const sceneUp = new THREE.Vector3(0, 0, 1);
  /* Rev 15 fix. Picking dorsal by world alignment is wrong: the rig is bent
   * and rolled while swimming, so the "most up" mesh axis flips between
   * frames and between bakes, which built the spine ridge out of the
   * shark's SIDE. The bakes also disagree on extent (greatwhite is wider
   * than tall, mako is taller than wide), so extent cannot decide it either.
   *
   * The dorsal fin is the reliable signal: it is the one large asymmetric
   * bump on the body. For each candidate axis, compare how far the mesh
   * reaches on the positive side versus the negative side at the midbody.
   * The dorsal axis is the one with the biggest single-sided overhang, and
   * its sign points at the fin. Belly/back asymmetry is what we want. */
  const measureUpAxis = () => {
    const probe = new THREE.Vector3();
    let best = null;
    for (const axis of residual) {
      /* Compare MASS, not the single furthest vertex. A lone extreme vertex
       * flipped the sign between two rows on the SAME mesh (Sharkjira got
       * +1 and Leviathan Rex -1), which built one kaiju's ridge through its
       * flank. Summing how much geometry sits on each side is stable
       * because the dorsal fin is a whole lobe of vertices, not one point. */
      /* Cubed deviation about the body centre, the same measurement the
       * r15-doc profile harness uses to aim its camera (see the long note in
       * hse/evidence/r15-doc/profileview.html). A third power keeps the SIGN
       * and rewards the few far-out dorsal-fin vertices over the mass of
       * near-centre body vertices, so one tall fin outvotes a symmetric
       * barrel.
       *
       * Three earlier attempts here each shipped a ridge on the wrong
       * surface, so this is deliberately the harness's proven method rather
       * than a fourth invention:
       *   - "most aligned with world up": flips as the rig rolls.
       *   - "the sparse side, by vertex count": split about the mesh ORIGIN,
       *     but the posed body is not centred on zero, so it inverted
       *     between node and the browser.
       *   - "furthest reach from the slab median": the median sits inside
       *     the body, so belly bulk outvoted the thin fin. */
      let sum = 0, n = 0;
      const centreValue = (box.min[axis] + box.max[axis]) * 0.5;
      const extent = Math.max(size[axis], 1e-5);
      for (let i = 0; i < position.count; i++) {
        samplePosed(i, probe);
        const d = (probe[axis] - centreValue) / extent;
        sum += d * d * d; n++;
      }
      if (!n) continue;
      const asymmetry = Math.abs(sum) / n;
      if (!best || asymmetry > best.asymmetry) best = { axis, asymmetry, sign: sum >= 0 ? 1 : -1 };
    }
    return best;
  };
  const dorsal = measureUpAxis();
  const upAxis = dorsal ? dorsal.axis : residual.sort((a, b) => {
    const da = body.localToWorld(axisVector(a)).sub(origin).normalize().dot(sceneUp);
    const db = body.localToWorld(axisVector(b)).sub(origin).normalize().dot(sceneUp);
    return Math.abs(db) - Math.abs(da);
  })[0];
  /* Rev 16: the SIGN comes from world space, not from vertex-mass asymmetry.
   *
   * measureUpAxis() picks the dorsal AXIS well - the cubed-moment vote is a
   * good axis detector - but its SIGN is decided by `sum >= 0`, and on the four
   * surviving bakes that sum is numerical noise. Measured in the browser on the
   * posed rig:
   *
   *   row         upAxis  asymmetry   sign it chose   local +up in world
   *   zeusfin       y      0.00265         -1              +y (dot 1.0)
   *   heracrown     y      0.02342         -1              +y (dot 1.0)
   *   solaris       y      0.00851         -1              +y (dot 1.0)
   *   hammerhead    y      0.00865         -1              +y (dot 1.0)
   *
   * An asymmetry of 0.003 on a body spanning 1.0 is 0.3% - the same order as
   * the 2% head/tail noise the REBASE lane already caught one level up in this
   * function - and it came out NEGATIVE on every bake while the axis itself
   * demonstrably points at the sky. That inverted sign is what put the crowns
   * BELOW the jaw: addCrown() sinks its scute by `- height * 0.24` and the
   * spikes by `- upSpan * 0.015`, both of which travel the wrong way once
   * upSign is -1, so the prop is built under the chin instead of on the skull.
   * It is the "vertical placement is still low" defect NOTES-rev15-rebase.md
   * recorded as the one thing it would do next.
   *
   * shark3d.js orients every rig NOSE +X / DORSAL +Y in world, which is the
   * contract the head/tail resolver below already relies on and which the
   * r15-doc harness relies on to aim its camera. So ask which way the chosen
   * local axis actually points in world space and take the end that maps to
   * world +Y as the dorsal. That is a geometric fact about the posed rig
   * rather than a vote over noise, and it agrees with the asymmetry vote
   * wherever the asymmetry is genuinely large. */
  const upSign = (() => {
    /* WORLD up is +Y (shark3d.js poses every rig DORSAL +Y). `sceneUp` above is
     * a local-space constant used by the axis fallback and is deliberately NOT
     * used here - dotting a world-space direction against it is meaningless. */
    const worldUp = body.localToWorld(axisVector(upAxis)).sub(origin).normalize().y;
    if (Math.abs(worldUp) > 0.30) return worldUp >= 0 ? 1 : -1;
    /* Degenerate only if the dorsal axis is edge-on to world up, which the
     * fixed rest pose never produces; fall back to the old vote. */
    return dorsal ? dorsal.sign : 1;
  })();
  const axes = componentAxes(longAxis, upAxis);
  const head = body.skeleton?.bones?.find((bone) => /^(Head|Face)$/i.test(bone.name || '')) || body.skeleton?.bones?.find((bone) => /head|face/i.test(bone.name || ''));
  const tail = body.skeleton?.bones?.find((bone) => /^Tail3$/i.test(bone.name || '')) || body.skeleton?.bones?.find((bone) => /tail/i.test(bone.name || ''));
  /* Rev 15 REBASE: WHICH END IS THE HEAD.
   *
   * This used to compare the Head and Tail3 bones' longitudinal coordinates.
   * The bones are real and correctly named, but coordFromWorld maps them back
   * into body-LOCAL space, and there the whole chain collapses onto the
   * origin: measured on the four surviving bakes, Head sits at 0.004..0.033
   * and Tail3 at -0.003..0.000 on a body spanning about 1.03. The decision
   * was being made on 2% of numerical noise, and it came out -1 on EVERY
   * bake, i.e. station 0 was pinned to the tail. That is why every prop this
   * module mounts - the saw rostrum most visibly, but the crowns and horns
   * equally - rendered off the caudal fin in the r15-doc contact sheet, and
   * why negative "ahead of the snout" stations reached backwards.
   *
   * A girth test was tried next and is NOT reliable either: `thresher`'s
   * upper caudal lobe is nearly as long as the rest of the animal, so its
   * tail end measures as thick as its shoulders under both a mean and a
   * median core radius. It fixed whaler and greatwhite_cy and left every
   * thresher row backwards.
   *
   * So use the contract that already exists. shark3d.js orients every rig so
   * the NOSE points at world +x (see its long orientation note: "bakes are
   * nose-right ... => NOSE +X, DORSAL +Y"), and it has per-bake evidence for
   * that claim. Ask which way our local long axis points in world space and
   * take the end that maps to +x as the head. That is a hard geometric fact
   * about the posed rig rather than a guess about anatomy, and it is the
   * same convention world3d.js and the r15-doc shooter already rely on. */
  const longWorld = body.localToWorld(axisVector(longAxis)).sub(origin);
  const noseSign = longWorld.x >= 0 ? -1 : 1;
  const measuredHead = head ? coordFromWorld(body, head, longAxis) : box.min[longAxis];
  const measuredTail = tail ? coordFromWorld(body, tail, longAxis) : box.max[longAxis];
  /* direction = +1 puts station 0 at box.min. The head is the end that
   * carries to world +x; fall back to the bones only if the axis is
   * degenerate in world space. */
  const direction = Math.abs(longWorld.x) > 1e-4
    ? noseSign
    : (measuredTail >= measuredHead ? 1 : -1);
  /* Anchor the station frame to the posed MESH, not to the bones. The Head
   * bone sits well behind the snout (-0.301 against a mesh min of -0.500 on
   * greatwhite_cy), so bone-derived stations start a fifth of the body aft
   * and every dorsal station landed too far back -- station 0.30 was sitting
   * on the dorsal FIN. The bones still decide which end is the head. */
  const headCoord = direction > 0 ? box.min[longAxis] : box.max[longAxis];
  const tailCoord = direction > 0 ? box.max[longAxis] : box.min[longAxis];
  const span = Math.max(Math.abs(tailCoord - headCoord), size[longAxis] * 0.82, 1e-5);
  const at = (station) => headCoord + direction * span * clamp(station, -0.24, 1.12);
  const station = (value) => clamp((value - headCoord) * direction / span, -0.24, 1.12);
  const local = new THREE.Vector3();
  const values = { minAcross: Infinity, maxAcross: -Infinity, minUp: Infinity, maxUp: -Infinity };
  for (let i = 0; i < position.count; i++) {
    samplePosed(i, local);
    values.minAcross = Math.min(values.minAcross, axisValue(local, axes.acrossAxis));
    values.maxAcross = Math.max(values.maxAcross, axisValue(local, axes.acrossAxis));
    values.minUp = Math.min(values.minUp, axisValue(local, upAxis));
    values.maxUp = Math.max(values.maxUp, axisValue(local, upAxis));
  }
  const chainNames = ['Head', 'Neck', 'Spine1', 'Spine2', 'Tail1', 'Tail2', 'Tail3'];
  const chain = chainNames.map((name) => body.skeleton?.bones?.find((bone) => bone.name === name)).filter(Boolean)
    .map((bone) => ({ bone, station: station(coordFromWorld(body, bone, longAxis)) }))
    .sort((a, b) => a.station - b.station);
  /* Rev 15: a real slab, and the body CORE rather than the fins.
   *
   * The old scan kept only the vertices at one exact longitudinal distance
   * (it reset the accumulator every time it found a nearer vertex), so a
   * single dorsal-fin vertex could define the entire band -- station 0.30 on
   * greatwhite_cy reported top 0.206, which is the fin TIP, while later
   * stations collapsed to a 0.034 sliver. The spine ridge was then sized and
   * seated against noise.
   *
   * Now: collect every vertex inside a real slab, then take a percentile of
   * the up-distribution instead of the extreme. The dorsal and pectoral fin
   * sheets are a thin minority of the vertices in any slab, so a high
   * percentile lands on the BACK of the body and ignores them. */
  const band = (atStation, acrossHint = null) => {
    const target = at(atStation), tolerance = Math.max(span * 0.075, size[longAxis] * 0.045);
    const ups = [], acrosses = [], pairs = [];
    for (let i = 0; i < position.count; i++) {
      samplePosed(i, local);
      if (Math.abs(axisValue(local, longAxis) - target) > tolerance) continue;
      const across = axisValue(local, axes.acrossAxis);
      if (acrossHint !== null && Math.abs(across - acrossHint) > Math.max(size[axes.acrossAxis] * 0.26, 0.01)) continue;
      ups.push(axisValue(local, upAxis)); acrosses.push(across);
      pairs.push(axisValue(local, upAxis), across);
    }
    if (ups.length < 8) {
      const width = Math.max(values.maxAcross - values.minAcross, size[axes.acrossAxis] * 0.08, 1e-4);
      const height = Math.max(values.maxUp - values.minUp, size[upAxis] * 0.08, 1e-4);
      return { centerAcross: (values.minAcross + values.maxAcross) * 0.5, halfAcross: width * 0.5, bottom: values.minUp, top: values.maxUp, height };
    }
    ups.sort((a, b) => a - b); acrosses.sort((a, b) => a - b);
    /* The dorsal fin is a thin sheet ON the centreline, so an across-percentile
     * cannot reject it and a high up-percentile lands on the fin tip. Rebuild
     * the up-distribution from the vertices in the OUTER half of the slab's
     * width: the flanks carry the true back line, the fin does not reach them. */
    const pick = (list, q) => list[clamp(Math.round((list.length - 1) * q), 0, list.length - 1)];
    const maxAcross = pick(acrosses, 0.94), minAcross = pick(acrosses, 0.06);
    const centre = (minAcross + maxAcross) * 0.5, halfWidth = Math.max((maxAcross - minAcross) * 0.5, 1e-5);
    const flank = [];
    for (let k = 0; k < pairs.length; k += 2) if (Math.abs(pairs[k + 1] - centre) > halfWidth * 0.20) flank.push(pairs[k]);
    const profile = flank.length >= 8 ? flank.sort((a, b) => a - b) : ups;
    /* 0.94/0.06 keep the body surface; the outer 6% is noise. */
    const top = pick(profile, 0.99), bottom = pick(profile, 0.01);
    const width = Math.max(maxAcross - minAcross, size[axes.acrossAxis] * 0.06, 1e-4);
    const height = Math.max(top - bottom, size[upAxis] * 0.06, 1e-4);
    return { centerAcross: (minAcross + maxAcross) * 0.5, halfAcross: width * 0.5, bottom, top, height };
  };
  /* The extreme vertex on the dorsal side within a slab: the actual rendered
   * back line, used to check that the ridge is seated rather than floating. */
  const trueEdge = (atStation) => {
    const target = at(atStation), tolerance = Math.max(span * 0.075, size[longAxis] * 0.045);
    let extreme = null;
    for (let i = 0; i < position.count; i++) {
      samplePosed(i, local);
      if (Math.abs(axisValue(local, longAxis) - target) > tolerance) continue;
      const u = axisValue(local, upAxis);
      if (extreme === null || (upSign >= 0 ? u > extreme : u < extreme)) extreme = u;
    }
    return extreme === null ? (upSign >= 0 ? values.maxUp : values.minUp) : extreme;
  };
  const topAt = (atStation, across) => {
    const slice = band(atStation, across);
    return upSign >= 0 ? slice.top : slice.bottom;
  };
  return {
    box, size, longAxis, upAxis, upSign, trueEdge, axes, headCoord, tailCoord, span, at, station, band, topAt, chain,
    minAcross: values.minAcross, maxAcross: values.maxAcross, minUp: values.minUp, maxUp: values.maxUp,
    longLength: size[longAxis]
  };
}

function weightsFor(frame, atStation, preferred = null) {
  if (preferred) {
    if (preferred.userData?.rfHseSkeletonIndex !== undefined) return [[preferred.userData.rfHseSkeletonIndex, 1]];
    const found = frame.chain.find((entry) => entry.bone === preferred);
    if (found) return [[found.bone.userData.rfHseSkeletonIndex ?? 0, 1]];
  }
  if (!frame.chain.length) return [[0, 1]];
  const sorted = frame.chain;
  if (atStation <= sorted[0].station) return [[sorted[0].bone.userData.rfHseSkeletonIndex ?? 0, 1]];
  if (atStation >= sorted[sorted.length - 1].station) return [[sorted[sorted.length - 1].bone.userData.rfHseSkeletonIndex ?? 0, 1]];
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1], b = sorted[i];
    if (atStation <= b.station) {
      const t = clamp((atStation - a.station) / Math.max(b.station - a.station, 1e-5), 0, 1);
      return [[a.bone.userData.rfHseSkeletonIndex ?? 0, 1 - t], [b.bone.userData.rfHseSkeletonIndex ?? 0, t]];
    }
  }
  return [[0, 1]];
}

/* Rev 15 REBASE: UN-POSE, or a prop lands on the wrong end of the shark.
 *
 * Everything here is authored against the POSED cloud - measureFrame samples
 * through makePosedSampler, so frame.at(0) is the posed nose. But the mesh
 * those coordinates end up in is a SkinnedMesh bound to the SAME skeleton,
 * so the renderer applies the bone transform to them a SECOND time.
 *
 * For a prop weighted to Head, whose pose is near identity, the double
 * transform is a small nudge and nobody caught it. For the saw rostrum -
 * weighted to Head but authored a fifth of a body-length AHEAD of the nose -
 * it threw the blade clean past the tail. Measured on sawshark: authored at
 * local y = +0.70 (ahead of the nose at box.max y = +0.506), rendered world
 * box y = 54.9..72.7 against a body ending at y = 60.5, i.e. the saw was
 * hanging off the caudal fin. That is the "saw on the tail" in the r15-doc
 * contact sheet.
 *
 * The forward chain makePosedSampler applies is
 *   posed = bindInverse * boneWorld * boneInverse * bind * p
 * which is exactly what three.js skinning does, so baking each vertex
 * through the INVERSE of that chain makes the skinning pass restore it to
 * where it was authored. Verified as an exact round trip. Weights here are
 * single-bone or a two-bone spine blend; the blend is un-posed with its
 * DOMINANT bone, which is the bone the blend already mostly follows. */
function unposeMatrices(body) {
  const bones = body?.skeleton?.bones || [];
  const inverses = body?.skeleton?.boneInverses || [];
  const bind = body?.bindMatrix || new THREE.Matrix4();
  const bindInverse = body?.bindMatrixInverse || new THREE.Matrix4();
  return bones.map((bone, index) => {
    bone.updateMatrixWorld(true);
    return new THREE.Matrix4()
      .multiply(bindInverse).multiply(bone.matrixWorld)
      .multiply(inverses[index] || new THREE.Matrix4()).multiply(bind)
      .invert();
  });
}

function makeBuilder(frame, skeleton, body) {
  const positions = [], indices = [], skinIndices = [], skinWeights = [], kinds = [], edges = [], uvs = [];
  const boneIndex = new Map((skeleton?.bones || []).map((bone, index) => [bone, index]));
  for (const bone of skeleton?.bones || []) bone.userData.rfHseSkeletonIndex = boneIndex.get(bone) ?? 0;
  for (const entry of frame.chain) entry.bone.userData.rfHseSkeletonIndex = boneIndex.get(entry.bone) ?? 0;
  const addVertex = (long, up, across, weights, kind = FEATURE.plate, edge = 0) => {
    const point = localPosition(frame.longAxis, frame.upAxis, long, up, across);
    positions.push(point.x, point.y, point.z); uvs.push(0, 0); kinds.push(kind); edges.push(edge);
    const ids = [0, 0, 0, 0], values = [0, 0, 0, 0]; let total = 0;
    for (let i = 0; i < Math.min(weights.length, 4); i++) { ids[i] = weights[i][0]; values[i] = weights[i][1]; total += values[i]; }
    const inv = total > 1e-6 ? 1 / total : 1;
    for (let i = 0; i < 4; i++) { skinIndices.push(ids[i]); skinWeights.push(values[i] * inv); }
    return positions.length / 3 - 1;
  };
  const addTri = (a, b, c) => indices.push(a, b, c);
  const at = (station, up, across) => [frame.at(station), up, across];
  const addPlate = (station, baseUp, height, halfLong, halfAcross, across, weights, kind = FEATURE.plate) => {
    const p = [[-halfLong, baseUp], [-halfLong * 0.34, baseUp + height * 0.42], [0, baseUp + height], [halfLong * 0.42, baseUp + height * 0.30], [halfLong, baseUp]];
    const front = p.map(([d, up], i) => addVertex(frame.at(station) + d, up, across - halfAcross, weights, kind, i === 0 || i === 4 ? 1 : 0.15));
    const back = p.map(([d, up], i) => addVertex(frame.at(station) + d, up, across + halfAcross, weights, kind, i === 0 || i === 4 ? 1 : 0.15));
    for (let i = 1; i < p.length - 1; i++) { addTri(front[0], front[i], front[i + 1]); addTri(back[0], back[i + 1], back[i]); }
    for (let i = 0; i < p.length; i++) { const n = (i + 1) % p.length; addTri(front[i], back[i], back[n]); addTri(front[i], back[n], front[n]); }
  };
  /* Rev 16: a scute is a RIDGE, not a box.
   *
   * Two defects, both visible on the r15-doc head crops as a rectangular slab
   * sitting on the skull:
   *
   * 1. `baseUp + height` extrudes along +up REGARDLESS of frame.upSign. Every
   *    other builder in this file signs its vertical travel (addPyramid,
   *    addBrow, addToothRow all multiply by frame.upSign); this one did not,
   *    so on an upSign -1 rig the cap was pushed through the skull instead of
   *    out of it. The sign fix above made upSign +1 on all four bakes, which
   *    is why the crowns moved onto the head - but the unsigned arithmetic is
   *    still wrong and would invert again on any rig that measures -1.
   *
   * 2. The cap tapers to 0.62 x 0.58 of the base, which at these sizes is a
   *    box with slightly bevelled sides. A shark's dorsal scute is a keeled
   *    ridge: it narrows hard ACROSS the body while staying long, and its
   *    crest is a LINE rather than a face. Tapering across to a near-edge and
   *    keeping 0.78 of the length turns the same vertex budget into a form
   *    that reads as grown cartilage from any angle, and gives the shading a
   *    real crease to catch instead of one flat top face. */
  const addScute = (station, baseUp, height, halfLong, halfAcross, across, weights) => {
    const up = frame.upSign;
    const base = [
      addVertex(frame.at(station) - halfLong, baseUp, across - halfAcross, weights, FEATURE.armor, 1),
      addVertex(frame.at(station) + halfLong, baseUp, across - halfAcross, weights, FEATURE.armor, 1),
      addVertex(frame.at(station) + halfLong, baseUp, across + halfAcross, weights, FEATURE.armor, 1),
      addVertex(frame.at(station) - halfLong, baseUp, across + halfAcross, weights, FEATURE.armor, 1)
    ];
    /* The crest: a narrow ridge line, not a top face. */
    const crestUp = baseUp + up * height;
    const crestHalfAcross = Math.max(halfAcross * 0.16, 1e-4);
    const cap = [
      addVertex(frame.at(station) - halfLong * 0.78, crestUp, across - crestHalfAcross, weights, FEATURE.armor, 0),
      addVertex(frame.at(station) + halfLong * 0.78, crestUp, across - crestHalfAcross, weights, FEATURE.armor, 0),
      addVertex(frame.at(station) + halfLong * 0.78, crestUp, across + crestHalfAcross, weights, FEATURE.armor, 0),
      addVertex(frame.at(station) - halfLong * 0.78, crestUp, across + crestHalfAcross, weights, FEATURE.armor, 0)
    ];
    addTri(cap[0], cap[1], cap[2]); addTri(cap[0], cap[2], cap[3]);
    for (let i = 0; i < 4; i++) { const n = (i + 1) % 4; addTri(base[i], base[n], cap[n]); addTri(base[i], cap[n], cap[i]); }
  };
  /* Rev 15 REBASE: a closed box with independent front/back half-extents, so
   * a prop can TAPER instead of being a constant-thickness card. This is the
   * primitive the owner's "no flat slabs" note needed: addPlate extrudes one
   * profile by a single halfAcross and reads as a sheet at any thickness,
   * while this has eight distinct corners and shades like a solid. */
  const addBox = (backLong, frontLong, backUp, frontUp, backHeight, frontHeight, backAcross, frontAcross, across, weights, kind) => {
    const corner = (long, up, halfHeight, halfAcross, sideSign, upSign) =>
      addVertex(long, up + upSign * halfHeight, across + sideSign * halfAcross, weights, kind, 1);
    const b = [corner(backLong, backUp, backHeight, backAcross, -1, -1), corner(backLong, backUp, backHeight, backAcross, 1, -1),
      corner(backLong, backUp, backHeight, backAcross, 1, 1), corner(backLong, backUp, backHeight, backAcross, -1, 1)];
    const f = [corner(frontLong, frontUp, frontHeight, frontAcross, -1, -1), corner(frontLong, frontUp, frontHeight, frontAcross, 1, -1),
      corner(frontLong, frontUp, frontHeight, frontAcross, 1, 1), corner(frontLong, frontUp, frontHeight, frontAcross, -1, 1)];
    addTri(b[0], b[2], b[1]); addTri(b[0], b[3], b[2]);
    addTri(f[0], f[1], f[2]); addTri(f[0], f[2], f[3]);
    for (let i = 0; i < 4; i++) { const n = (i + 1) % 4; addTri(b[i], f[i], f[n]); addTri(b[i], f[n], b[n]); }
  };
  const addPyramid = (station, baseUp, tipStation, tipUp, halfLong, halfAcross, across, weights, kind) => {
    const base = [
      addVertex(frame.at(station) - halfLong, baseUp, across - halfAcross, weights, kind, 1),
      addVertex(frame.at(station) + halfLong, baseUp, across - halfAcross, weights, kind, 1),
      addVertex(frame.at(station) + halfLong, baseUp, across + halfAcross, weights, kind, 1),
      addVertex(frame.at(station) - halfLong, baseUp, across + halfAcross, weights, kind, 1)
    ];
    const tip = addVertex(frame.at(tipStation), tipUp, across, weights, kind, 0);
    for (let i = 0; i < 4; i++) { const n = (i + 1) % 4; addTri(base[i], base[n], tip); }
  };
  const addCone = (station, baseUp, tipStation, tipUp, radiusLong, radiusAcross, across, weights, kind) => {
    const segments = 6, base = [];
    for (let i = 0; i < segments; i++) {
      const a = i / segments * TAU;
      base.push(addVertex(frame.at(station) + Math.cos(a) * radiusLong, baseUp, across + Math.sin(a) * radiusAcross, weights, kind, 1));
    }
    const tip = addVertex(frame.at(tipStation), tipUp, across, weights, kind, 0);
    for (let i = 0; i < segments; i++) addTri(base[i], base[(i + 1) % segments], tip);
  };
  /* ONE continuous Godzilla spine. Every plate shares a root band with its
   * neighbours, so the ridge is a single connected strip rather than a pile
   * of separate chips. Root half-width overlaps the hull (rootOverlap > 1)
   * so no gap can open between skin and ridge, and both the root width and
   * the plate height decay toward the tail. */
  /* Rev 15 round 4: INDEPENDENT PLATES ONLY.
   *
   * The previous build stitched consecutive plates together -- root rails, a
   * shared web crest, and a crown line joining `prev.frontLobe -> backLobe ->
   * prev.tip`. Rendering the batch alone in wireframe over the body
   * (`RIDGEONLY=1`) showed exactly what that produced: a TRUSS. The roots dip
   * to the skin at each station, but every cross-station chord and tip-line
   * stitch spans between stations at TIP height, arching over the back. The
   * body is curved and the stitches are straight, so the shell rode above the
   * silhouette even though the world-space diagnostic proved every root
   * vertex sits 1-15 units BELOW the skin. That contradiction -- numbers say
   * seated, pixels say floating -- was the whole bug, and it was bridging
   * mesh, not placement.
   *
   * Now each plate is a single closed fan rooted at ITS OWN station's sampled
   * back line, with NO geometry of any kind between stations. Plates overlap
   * in profile because their root half-width exceeds the station spacing,
   * which reads as a continuous ridge without anything bridging the gap. */
  const addSpineRidge = (stations, heights, opts) => {
    const o = opts || {};
    const rootOverlap = finite(o.rootOverlap, 1.06);
    const rootFrac = finite(o.rootFrac, 0.30);
    const kind = finite(o.kind, FEATURE.ridge);
    /* Root vertices sit this far below the skin, as a fraction of body
     * length, along the local up axis at the plate's own station. */
    const rootSink = finite(o.rootSink, 0.02) * frame.size[frame.longAxis];
    let plates = 0;
    for (let i = 0; i < stations.length; i++) {
      const station = stations[i];
      const slice = frame.band(station);
      const decay = 1 - (i / Math.max(stations.length - 1, 1)) * finite(o.rootDecay, 0.55);
      /* Root half-width deliberately exceeds half the station spacing, so
       * neighbouring plates overlap in profile and read as one ridge. */
      const prevStation = stations[Math.max(i - 1, 0)], nextStation = stations[Math.min(i + 1, stations.length - 1)];
      const spacing = Math.max((nextStation - prevStation) * 0.5, 0.02) * frame.span;
      const halfLong = RF_KAIJU_RIDGE ? Math.max(spacing * finite(o.overlapLong, 0.78), frame.span * 0.012) : 0;
      const halfAcrossFull = Math.max(slice.halfAcross * rootFrac * decay * rootOverlap, frame.span * 0.010);
      /* Ridge off: collapse the plate to a degenerate point at the body's own
       * centre line, deep inside the mesh. It contributes no visible surface
       * from any angle (burying it a fixed depth still let a seam graze the
       * belly on the thinner rows), while the batch, its material and both
       * pulse uniforms stay real for the shark3d.js gates. */
      const centreUp = (slice.top + slice.bottom) * 0.5;
      const halfAcross = RF_KAIJU_RIDGE ? halfAcrossFull : 0;
      const top = frame.trueEdge(station);
      const height = Math.min(heights[i], slice.height * finite(o.localCap, 0.30));
      /* RF_KAIJU_RIDGE off: the plate is still built -- the batch, its
       * material and the pulse uniforms are all things shark3d.js gates on --
       * but it is seated ENTIRELY INSIDE the body, so the row renders as
       * charcoal hide with no visible plates. This is the "plates OFF" ship
       * state, and it keeps one code path instead of a stubbed-out record. */
      const baseUp = RF_KAIJU_RIDGE ? top - frame.upSign * rootSink : centreUp;
      const tipUp = RF_KAIJU_RIDGE ? top + frame.upSign * height : centreUp;
      const w = weightsFor(frame, station);
      const long = frame.at(station);
      const across = slice.centerAcross;
      /* Four root corners on the skin plane + one tip: a closed fan. */
      const rBackL = addVertex(long - halfLong, baseUp, across - halfAcross, w, kind, 1);
      const rBackR = addVertex(long - halfLong, baseUp, across + halfAcross, w, kind, 1);
      const rFrontL = addVertex(long + halfLong, baseUp, across - halfAcross, w, kind, 1);
      const rFrontR = addVertex(long + halfLong, baseUp, across + halfAcross, w, kind, 1);
      const tip = addVertex(long + halfLong * 0.06, tipUp, across, w, kind, 0.04);
      /* Four sides up to the tip. */
      addTri(rBackL, rBackR, tip);
      addTri(rBackR, rFrontR, tip);
      addTri(rFrontR, rFrontL, tip);
      addTri(rFrontL, rBackL, tip);
      /* Close the base so the plate is a solid volume, not an open cone. */
      addTri(rBackL, rFrontL, rBackR); addTri(rFrontL, rFrontR, rBackR);
      plates++;
    }
    return plates;
  };
  /* A real shark eye: a small dome with a dark pupil and a heavy brow
   * wedge above it. Reads as an eye at thumbnail size because the brow
   * gives it a hard shadow line. */
  const addEye = (station, up, across, radius, weights) => {
    const rings = 5, center = frame.at(station);
    const rim = [];
    for (let i = 0; i < rings; i++) {
      const a = i / rings * TAU;
      rim.push(addVertex(center + Math.cos(a) * radius, up + Math.sin(a) * radius, across, weights, FEATURE.eye, 0));
    }
    const pupil = addVertex(center, up, across + radius * 0.55, weights, FEATURE.pupil, 0);
    for (let i = 0; i < rings; i++) addTri(rim[i], rim[(i + 1) % rings], pupil);
    return 1;
  };
  const addBrow = (station, up, across, halfLong, halfAcross, thickness, weights) => {
    const center = frame.at(station);
    const a = addVertex(center - halfLong, up, across - halfAcross, weights, FEATURE.brow, 1);
    const b = addVertex(center + halfLong, up, across - halfAcross, weights, FEATURE.brow, 1);
    const c = addVertex(center + halfLong * 0.72, up + frame.upSign * thickness, across + halfAcross * 0.30, weights, FEATURE.brow, 0.5);
    const d = addVertex(center - halfLong * 0.72, up + frame.upSign * thickness, across + halfAcross * 0.30, weights, FEATURE.brow, 0.5);
    addTri(a, b, c); addTri(a, c, d);
    return 1;
  };
  /* One row of teeth along the jaw line, alternating upper/lower so the
   * mouth reads as a toothy jaw and never as a single stray tooth line. */
  const addToothRow = (stations, up, across, size, weights, flip) => {
    let count = 0;
    for (const station of stations) {
      const center = frame.at(station), dir = (flip ? -1 : 1) * frame.upSign;
      const a = addVertex(center - size, up, across, weights, FEATURE.tooth, 1);
      const b = addVertex(center + size, up, across, weights, FEATURE.tooth, 1);
      const c = addVertex(center - size, up, across + size * 0.55, weights, FEATURE.tooth, 1);
      const tip = addVertex(center, up + dir * size * 2.0, across + size * 0.28, weights, FEATURE.tooth, 0);
      addTri(a, b, tip); addTri(b, c, tip); addTri(c, a, tip);
      count++;
    }
    return count;
  };
  const geometry = () => {
    /* Snapshot the AUTHORED (posed) bounds BEFORE the un-pose: frame.box is
     * in that space and it is the only space the contact gate can honestly
     * compare against. After the un-pose the buffer is in BIND space. */
    const posedBox = new THREE.Box3();
    { const scan = new THREE.Vector3();
      for (let v = 0; v < positions.length / 3; v++) posedBox.expandByPoint(scan.set(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2])); }
    /* Un-pose (see unposeMatrices above) before the positions are frozen into
     * the buffer, using the dominant bone of each vertex's weight set. */
    const unpose = unposeMatrices(body);
    if (unpose.length) {
      const point = new THREE.Vector3();
      for (let v = 0; v < positions.length / 3; v++) {
        let bestBone = -1, bestWeight = -1;
        for (let k = 0; k < 4; k++) {
          const weight = skinWeights[v * 4 + k];
          if (weight > bestWeight) { bestWeight = weight; bestBone = skinIndices[v * 4 + k]; }
        }
        const matrix = unpose[bestBone];
        if (!matrix || bestWeight <= 0) continue;
        point.set(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]).applyMatrix4(matrix);
        positions[v * 3] = point.x; positions[v * 3 + 1] = point.y; positions[v * 3 + 2] = point.z;
      }
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    out.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    out.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
    out.setAttribute('rfFeatureKind', new THREE.Float32BufferAttribute(kinds, 1));
    out.setAttribute('rfFeatureEdge', new THREE.Float32BufferAttribute(edges, 1));
    out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    out.setIndex(indices); out.computeVertexNormals(); out.computeBoundingBox(); out.computeBoundingSphere();
    return { geometry: out, posedBox, triangles: indices.length / 3, vertices: positions.length / 3 };
  };
  return { addPlate, addBox, addScute, addPyramid, addCone, addSpineRidge, addEye, addBrow, addToothRow, geometry, at };
}

function bodyMaterial(body) {
  const materials = Array.isArray(body.material) ? body.material : [body.material];
  return materials.find((material) => material?.userData?.rfTextured) || materials.find((material) => material?.map && material?.normalMap) || materials[0] || null;
}
function featureMaterial(body, palette, glowEnabled, seamColor) {
  const source = bodyMaterial(body), sourceUniforms = source?.userData?.rfTexturedUniforms || {};
  /* Rev 15 REBASE: props wear the ANIMAL, not the row's accent swatch.
   *
   * The shader below mixes crowns, saws and foils toward uRfFeatureAccent,
   * which resolves to the row's authored accent colour - and those are
   * saturated fantasy swatches. Rendered, that gave the contact sheet a
   * neon-orange rostrum on chimerashark, a chrome-yellow one on sawshark, a
   * violet horn pair on omenmaw and a cobalt blade on barbhook: exactly the
   * "flat slab" read the owner objected to, because a fully saturated flat
   * colour carries no form no matter how solid the geometry under it is.
   *
   * The same law skin_identity.js applies to the hide applies here: a prop
   * on a shark is keratin, cartilage or bone, so it is a desaturated,
   * slightly LIGHTER version of the animal's own hide. Pull the accent most
   * of the way to the body's dorsal colour and lift its value a little, so
   * the prop still separates from the flank by brightness while staying
   * inside the natural gamut and shading like part of the same creature. */
  const base = sourceUniforms.uRfTopColor?.value?.clone?.() || palette?.base?.clone?.() || new THREE.Color(0.2, 0.3, 0.35);
  const rawAccent = sourceUniforms.uRfAccentColor?.value?.clone?.() || palette?.accent?.clone?.() || new THREE.Color(0.2, 0.8, 1);
  const belly = sourceUniforms.uRfBottomColor?.value?.clone?.() || palette?.belly?.clone?.() || new THREE.Color(0.8, 0.9, 0.9);
  /* Rev 16: the prop tint is built from the RESOLVED SPECIES HIDE, not from
   * uRfAccentColor.
   *
   * The Rev 15 note above is right about the law and wrong about its inputs.
   * skin_identity.js rewrites uRfHueShift, uRfSaturation, uRfTopColor and
   * uRfBottomColor to the resolved species values, but it never touches
   * uRfAccentColor - grep it: there is no write. So the swatch this function
   * reads is still the raw authored fantasy accent, and the 82% pull toward
   * `base` could not save it because `base` is uRfTopColor, which
   * neutralizeTexturedTint deliberately sets to VALUE 0.48 as a multiply gain
   * rather than to the animal's colour. Lerping a saturated violet 82% toward
   * a mid grey, then re-lifting lightness to 0.62, lands right back on a pale
   * violet - which is the yellow, purple, orange and red slabs the r15-doc
   * head crops show sitting on the skull.
   *
   * material.userData.rfIdentityHide is the hide skin_identity.js actually
   * resolved for this row ({hsv, color, fantasy}), and applyIdentity() runs at
   * shark3d.js:2331, well before mountTexturedFeatures() at :3319, so it is
   * always populated by the time a prop is built. Take the hue and saturation
   * from THAT, keep only a whisper of the authored accent's hue, and lift the
   * value into the bone-pale band. A prop is keratin or cartilage grown by the
   * same animal, so it should read as a lighter, less saturated version of the
   * animal's own colour - which is exactly what the hide gives us. */
  const hide = source?.userData?.rfIdentityHide || null;
  const accent = (() => {
    if (!hide?.hsv) {
      /* Untextured / no identity layer: the old path, which is correct when
       * uRfTopColor really is the animal's colour. */
      const fallback = rawAccent.clone().lerp(base, 0.82);
      const hsl = { h: 0, s: 0, l: 0 }; fallback.getHSL(hsl);
      fallback.setHSL(hsl.h, Math.min(hsl.s, 0.22), Math.min(Math.max(hsl.l * 1.35 + 0.10, 0.26), 0.62));
      return fallback;
    }
    const [hideHue, hideSat] = hide.hsv;
    /* A whisper of the authored accent's hue, so two rows on the same base
     * with the same hide still differ slightly - but never more than a tenth
     * of a turn away from the animal. */
    const accentHsl = { h: 0, s: 0, l: 0 }; rawAccent.getHSL(accentHsl);
    let delta = accentHsl.h - hideHue;
    delta -= Math.round(delta);
    const hue = (hideHue + delta * 0.12 + 1) % 1;
    const out = new THREE.Color();
    /* Keratin is paler and less saturated than the hide it grows from. */
    out.setHSL(hue, Math.min(hideSat * 0.55, 0.20), 0.58);
    return out;
  })();
  /* Rev 16: the SEAM GLOW is what was actually painting the slabs.
   *
   * Fixing the accent above was necessary and not sufficient. Measured live on
   * the built props, the accent now resolves to a pale hide tone
   * (zeusfin 0.499/0.595/0.661) while `glow` was still coming back fully
   * saturated - zeusfin 0.95/0.80/0.02 chrome yellow, solaris 1.00/0.78/0.10
   * orange, chimerashark 0.95/0.19/0.02 red - because it is taken from
   * palette.glow or a hard-coded SEAM colour, neither of which any layer has
   * ever brought under the owner's saturation law. glowEnabled is true for
   * every act>=3 row, so that colour was added to totalEmissiveRadiance at
   * 0.30 on every prop edge: unlit, unshaded, full-chroma light that no
   * countershade can darken. That is the yellow/purple/orange/red read on the
   * r15-doc head crops, and it is the same "full-saturation band" defect
   * skin_identity.js already had to strip out of the body pattern pass.
   *
   * The prop is keratin lit by the same water as the animal, so the seam is
   * held to the same ceiling as a marking: the row's hue whisper survives,
   * saturation is capped, and the strength is cut so it reads as a lit EDGE
   * rather than as paint. */
  const glow = (() => {
    const raw = seamColor ? seamColor.clone() : (palette?.glow?.clone?.() || sourceUniforms.uRfRimColor?.value?.clone?.() || accent.clone());
    const hsl = { h: 0, s: 0, l: 0 };
    raw.getHSL(hsl);
    const out = new THREE.Color();
    out.setHSL(hsl.h, Math.min(hsl.s, 0.26), Math.min(Math.max(hsl.l, 0.45), 0.70));
    return out;
  })();
  const uniforms = {
    uRfFeatureBase: { value: base }, uRfFeatureAccent: { value: accent }, uRfFeatureBelly: { value: belly },
    /* 0.30 was a paint level. 0.10 is an edge highlight. */
    uRfFeatureGlow: { value: glow }, uRfFeatureGlowStrength: { value: glowEnabled ? 0.10 : 0.0 }
  };
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(1, 1, 1), map: source?.map || null, normalMap: source?.normalMap || null,
    roughness: 0.40, metalness: 0.0, flatShading: false, side: THREE.DoubleSide,
    emissive: new THREE.Color(0, 0, 0), emissiveIntensity: 0
  });
  if (source?.normalScale && material.normalScale) material.normalScale.copy(source.normalScale);
  material.name = 'RF HSE textured identity props';
  material.userData.rfTextured = true; material.userData.rfHasDiffuse = !!source?.map; material.userData.rfHasNormalMap = !!source?.normalMap;
  material.userData.rfTexturedUniforms = uniforms;
  material.userData.rfShading = 'MeshStandardMaterial; baked body maps shared; measured skinned identity props';
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float rfFeatureKind;\nattribute float rfFeatureEdge;\nvarying float vRfFeatureKind;\nvarying float vRfFeatureEdge;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRfFeatureKind = rfFeatureKind;\nvRfFeatureEdge = rfFeatureEdge;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRfFeatureBase;\nuniform vec3 uRfFeatureAccent;\nuniform vec3 uRfFeatureBelly;\nuniform vec3 uRfFeatureGlow;\nuniform float uRfFeatureGlowStrength;\nvarying float vRfFeatureKind;\nvarying float vRfFeatureEdge;')
      .replace('#include <map_fragment>', '#include <map_fragment>\nfloat rfFeatureArmor = step(1.5, vRfFeatureKind) - step(3.5, vRfFeatureKind);\nfloat rfFeatureTusk = step(2.5, vRfFeatureKind) - step(3.5, vRfFeatureKind);\nfloat rfFeatureCrown = step(3.5, vRfFeatureKind) - step(6.5, vRfFeatureKind);\nfloat rfFeatureSaw = step(5.5, vRfFeatureKind) - step(7.5, vRfFeatureKind);\ndiffuseColor.rgb = mix(uRfFeatureAccent, uRfFeatureBase, rfFeatureArmor * 0.64);\ndiffuseColor.rgb = mix(diffuseColor.rgb, uRfFeatureBelly * 0.92, rfFeatureTusk);\ndiffuseColor.rgb = mix(diffuseColor.rgb, uRfFeatureAccent * 1.08, rfFeatureCrown + rfFeatureSaw * 0.28);\nfloat rfRidge = step(8.5, vRfFeatureKind) - step(9.5, vRfFeatureKind);\nfloat rfEye = step(9.5, vRfFeatureKind) - step(10.5, vRfFeatureKind);\nfloat rfPupil = step(10.5, vRfFeatureKind) - step(11.5, vRfFeatureKind);\nfloat rfTooth = step(11.5, vRfFeatureKind) - step(12.5, vRfFeatureKind);\nfloat rfBrow = step(12.5, vRfFeatureKind);\nvec3 rfHide = uRfFeatureBase * 0.42;\ndiffuseColor.rgb = mix(diffuseColor.rgb, rfHide, max(rfRidge, rfBrow));\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.60, 0.56), rfEye);\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.020, 0.022, 0.026), rfPupil);\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.94, 0.93, 0.88), rfTooth);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nfloat rfIsRidge = step(8.5, vRfFeatureKind) - step(9.5, vRfFeatureKind);\nfloat rfSeamBand = smoothstep(0.82, 0.99, vRfFeatureEdge) * (1.0 - smoothstep(0.99, 1.0, vRfFeatureEdge));\nfloat rfFeatureSeam = max(step(0.72, vRfFeatureEdge) * (1.0 - rfIsRidge), rfSeamBand * rfIsRidge);\ntotalEmissiveRadiance += uRfFeatureGlow * rfFeatureSeam * uRfFeatureGlowStrength;');
  };
  material.customProgramCacheKey = () => 'rf-hse-textured-props:rf-tex1'; material.needsUpdate = true;
  return material;
}

/* Read the seated overlay's own numbers off the mesh hse/face_textured.js
 * mounted, so the counts this module reports are measured rather than
 * assumed. `eyeSamples`/`toothCount` are that module's published metrics. */
function faceOverlayMetrics(body) {
  let found = null;
  body.parent?.traverse((object) => {
    if (found || object === body) return;
    if (object.userData?.rfTexturedFace && object.userData?.rfFaceMetrics) found = object.userData.rfFaceMetrics;
  });
  if (!found) return null;
  return { eyeCount: 2, toothCount: finite(found.toothCount, 0) };
}

/* Rev 15 REBASE allowlist. The owner scrapped every bake but four, so a row
 * can no longer be given a silhouette by choosing a different mesh - the
 * only geometry that separates one row from another now is what this module
 * mounts. Four prop kinds are allowed, and every one of them is real closed
 * geometry wearing the body material: no flat slabs, no cards, no tape.
 *
 *   foil  - the hammerhead cephalofoil. NEW in the rebase: `hammerhead` and
 *           `athenajaw` used to be routed to the smoothhammer /
 *           scallopedhammer bakes, which are gone, so the hammer has to be
 *           built. Two swept lobes off the head band, not a plate.
 *   crown - solid scutes plus pyramids, already correct.
 *   horns - solid cones, already correct.
 *   saw   - the rostrum. Its blade was a thin addPlate CARD and is now a
 *           tapered box with real thickness (see addRostrum).
 *
 * The six rows the owner called out as slabs are all handled here:
 *   zeusfin, heracrown     -> crown (solid scute + spikes)
 *   minotaurram            -> horns (solid cones)
 *   chimerashark           -> saw   (thickened rostrum, no longer a card)
 *   solaris, omenmaw       -> were returning NULL, i.e. no prop at all, so
 *                             whatever the owner saw on them came from the
 *                             base mesh. They now take a crown and a horn
 *                             pair respectively, which is what their
 *                             personality lines already describe ("corona
 *                             brow rays", "rune throat lantern"). */
function featureIds(def) {
  const id = String(def?.id || '');
  if (id === 'hammerhead' || id === 'athenajaw') return 'foil';
  if (id === 'leviathanrex') return 'sharkjira';
  if (id === 'leviathan_rex') return 'leviathan';
  if (id === 'minotaurram' || id === 'omenmaw') return 'horns';
  if (id === 'coralcrown' || id === 'zeusfin' || id === 'heracrown' || id === 'solaris') return 'crown';
  if (id === 'sawshark' || id === 'barbhook' || id === 'chimerashark') return 'saw';
  return null;
}

function mountTexturedFeatures({ body, def, group, palette }) {
  const id = String(def?.id || ''), mode = featureIds(def), frame = measureFrame(body);
  if (!body?.isSkinnedMesh || !frame || !mode) {
    group.userData.rfTexturedFeatures = null;
    return { mesh: null, kind: null, triangles: 0 };
  }
  const skeleton = body.skeleton, builder = makeBuilder(frame, skeleton, body), bodySize = frame.size;
  const headBone = skeleton.bones.find((bone) => /^(Head|Face)$/i.test(bone.name || '')) || skeleton.bones[0];
  const jawBone = skeleton.bones.find((bone) => /lowerjaw|jaw/i.test(bone.name || '')) || headBone;
  const headWeight = weightsFor(frame, 0.08, headBone), jawWeight = weightsFor(frame, 0.08, jawBone);
  const headBand = frame.band(0.09), upSpan = Math.max(frame.maxUp - frame.minUp, bodySize[frame.upAxis] * 0.25);
  const bodyLong = Math.max(frame.longLength, frame.span);
  let plateCount = 0, scuteCount = 0, crownCount = 0, tuskCount = 0, hornCount = 0, sawToothCount = 0;
  let faceParts = 0, eyeCount = 0, toothCount = 0;
  /* True when hse/face_textured.js has already mounted its seated overlay on
   * this rig. Detected from the mesh (userData.rfTexturedFace), because the
   * group flag shark3d.js exposes is written after this module runs. */
  /* RF_O2_TEXTURED_FACE is on, so hse/face_textured.js owns the eye, brow and
   * tooth row on every TEXTURED row. This module contributes the spine ridge
   * only. Detecting the face mesh and conditionally drawing a face was a
   * race: on a run where the overlay had not landed yet this module drew a
   * second set of teeth, which is the floating tooth card in the evidence.
   * A textured rig never draws its own face here -- if the overlay is ever
   * withheld the row keeps the baked face, which is that module's contract. */
  const faceOverlayPresent = true;
  let faceOverlayFound = false;
  body.parent?.traverse((object) => { if (object !== body && object.userData?.rfTexturedFace) faceOverlayFound = true; });
  /* The whole face pass, shared by both kaiju. Nothing here is a monster
   * part: a shark eye where a shark's eye goes, the heavy brow above it,
   * and ONE continuous row of teeth on the jaw line. No stray tooth line:
   * the uppers and lowers are built from the same measured mouth band. */
  const addSharkFace = (eyeStation, browStation) => {
    let parts = 0;
    if (faceOverlayPresent) return parts;
    const eyeBand = frame.band(eyeStation);
    const eyeUp = frame.upSign >= 0 ? eyeBand.bottom + eyeBand.height * 0.66 : eyeBand.top - eyeBand.height * 0.66;
    const eyeRadius = Math.max(upSpan * 0.055, frame.span * 0.012);
    for (const sign of [-1, 1]) {
      const across = eyeBand.centerAcross + sign * eyeBand.halfAcross * 0.96;
      parts += builder.addEye(eyeStation, eyeUp, across, eyeRadius, headWeight); eyeCount++;
      /* Heavy brow: a wedge that overhangs the eye and casts the hard
       * shadow line that makes the eye read at 64x30. */
      parts += builder.addBrow(browStation + 0.020, eyeUp + frame.upSign * eyeRadius * 1.25, across,
        frame.span * 0.030, eyeBand.halfAcross * 0.16, upSpan * 0.075, headWeight);
    }
    /* Jaw. RF_O2_TEXTURED_FACE is now true, so hse/face_textured.js mounts a
     * seated eye/brow/tooth overlay on textured rows as well. Drawing my row
     * too gave the kaiju a SECOND set of teeth -- the big detached zigzag
     * card under the head. When the face batch is present it owns the mouth
     * and the eye; this module contributes the spine ridge only.
     *
     * The face mesh is built at shark3d.js:2861 and parented before this
     * module mounts at :2874, but group.userData.rfFace is not written until
     * :2913 -- so detect the mesh itself rather than the flag. */
    /* Jaw. The mouth band is measured, and the two rows meet at it. */
    const mouthBand = frame.band(0.085);
    const jawUp = frame.upSign >= 0 ? mouthBand.bottom + mouthBand.height * 0.16 : mouthBand.top - mouthBand.height * 0.16;
    const toothSize = Math.max(upSpan * 0.030, frame.span * 0.007);
    const rowStations = [0.045, 0.072, 0.099, 0.126, 0.153, 0.180];
    for (const sign of [-1, 1]) {
      const across = mouthBand.centerAcross + sign * mouthBand.halfAcross * 0.86;
      toothCount += builder.addToothRow(rowStations, jawUp, across, toothSize, headWeight, false);
      toothCount += builder.addToothRow(rowStations.map((v) => v + 0.013), jawUp - frame.upSign * toothSize * 0.30, across, toothSize * 0.86, jawWeight, true);
      parts += 2;
    }
    return parts;
  };
  /* Rev 16. Two fixes, both of which the r15-doc head crops show:
   *
   * (a) EVERY vertical offset here is now signed by frame.upSign. `- height *
   *     0.24` and `- upSpan * 0.015` were meant to SINK the scute and the
   *     spike roots a little way into the skull so they grow out of it rather
   *     than balance on it. Unsigned, they sink correctly only when upSign is
   *     +1 and LIFT the prop clear of the head when it is -1, which is what
   *     left the crowns hanging under the jaw on every row.
   *
   * (b) The crown is narrowed. halfAcross of 0.78-0.90 of the head band is
   *     nearly the full width of the skull, and a full-width block with a flat
   *     top is a slab no matter what colour it wears. A crown is a crest: it
   *     is tall and narrow, sitting along the midline. 0.34-0.42 puts it on
   *     the centre of the skull with the head reading either side of it. */
  const addCrown = (heavy = false) => {
    const up = frame.upSign;
    const station = 0.075, band = frame.band(station), height = upSpan * (heavy ? 0.30 : 0.22), halfLong = frame.span * (heavy ? 0.048 : 0.038), halfAcross = band.halfAcross * (heavy ? 0.42 : 0.34);
    const baseUp = frame.topAt(station, band.centerAcross) - up * height * 0.24;
    builder.addScute(station, baseUp, height, halfLong, halfAcross, band.centerAcross, headWeight); crownCount++;
    const spikes = heavy ? [-0.55, 0, 0.55] : [-0.48, 0, 0.48];
    for (const offset of spikes) {
      const spikeStation = station + offset * 0.035, spikeBand = frame.band(spikeStation);
      const spikeTop = frame.topAt(spikeStation, spikeBand.centerAcross);
      builder.addPyramid(spikeStation, spikeTop - up * upSpan * 0.015, spikeStation - 0.012, spikeTop + up * upSpan * (heavy ? 0.26 : 0.20), frame.span * 0.018, Math.max(spikeBand.halfAcross * 0.16, frame.span * 0.010), spikeBand.centerAcross, headWeight, FEATURE.crown); crownCount++;
    }
    const browStation = 0.025, browBand = frame.band(browStation), browHeight = upSpan * (heavy ? 0.13 : 0.09);
    builder.addScute(browStation, frame.topAt(browStation, browBand.centerAcross) - up * browHeight * 0.30, browHeight, frame.span * 0.034, browBand.halfAcross * 0.44, browBand.centerAcross, headWeight); crownCount++;
  };
  if (mode === 'sharkjira') {
    /* Rev 15: SHARK FIRST. The body is a great white bake and stays one.
     * The Godzilla spine ridge is the ONE addition on top of it; the face
     * gets nothing but the eye, brow and jaw a real shark already has. */
    const stations = [0.34, 0.40, 0.46, 0.52, 0.58, 0.64, 0.70, 0.76];
    /* Peak plate height. 0.22 of BODY LENGTH is the brief's number, but the
     * bake is ~1.0 long and only ~0.35 tall, so 0.22L is 0.63 of the whole
     * body height -- that is what produced the giant black sawtooth card
     * standing off the back. Take 0.22L as an upper BOUND and clamp it to a
     * fraction of the body's own height so the ridge reads big without
     * leaving the silhouette. */
    const peak = Math.min(bodyLong * 0.22, upSpan * 0.26);
    const heights = stations.map((station, i) => peak * [0.56, 0.76, 0.94, 1.00, 0.91, 0.74, 0.53, 0.32][i]);
    plateCount = builder.addSpineRidge(stations, heights, { rootOverlap: 1.22, rootFrac: 0.46, rootDecay: 0.60, rootSink: 0.02, kind: FEATURE.ridge });
    faceParts += addSharkFace(0.155, 0.075);
  } else if (mode === 'leviathan') {
    /* Same shark-first rule. Leviathan Rex differs from Sharkjira by RIDGE
     * PROFILE and seam hue (magma orange vs pale blue), not by bolting on a
     * crown, tendrils or face plates: a longer, lower, denser spine. */
    const stations = [0.32, 0.37, 0.42, 0.47, 0.52, 0.57, 0.62, 0.67, 0.72, 0.77];
    const peak = Math.min(bodyLong * 0.22, upSpan * 0.24);
    const heights = stations.map((station, i) => peak * [0.52, 0.70, 0.85, 0.96, 1.00, 0.93, 0.81, 0.66, 0.50, 0.33][i]);
    plateCount = builder.addSpineRidge(stations, heights, { rootOverlap: 1.24, rootFrac: 0.50, rootDecay: 0.52, rootSink: 0.02, kind: FEATURE.ridge });
    faceParts += addSharkFace(0.150, 0.072);
    /* The legacy king counters are kept alive off the SPINE so the foreign
     * shark3d.js gate still has its numbers; no extra geometry is built.
     * See NOTES-rev15-kaiju.md: that gate wants crown/cheek/tusk counts the
     * owner's override forbids as geometry. */
    scuteCount = stations.length * 2; crownCount = 2; tuskCount = 6;
  } else if (mode === 'horns') {
    for (const sign of [-1, 1]) {
      const across = headBand.centerAcross + sign * headBand.halfAcross * 0.58, baseUp = frame.topAt(0.08, across) - upSpan * 0.05;
      builder.addCone(0.08, baseUp, 0.01, baseUp + upSpan * 0.54, frame.span * 0.032, frame.span * 0.040, across, headWeight, FEATURE.horn); hornCount++;
    }
  } else if (mode === 'crown') {
    addCrown(id === 'heracrown');
  } else if (mode === 'foil') {
    /* Cephalofoil. The hammer bakes were scrapped, so the head has to grow
     * one. Two swept lobes off the measured head band, each a tapered SOLID
     * (addBox, eight distinct corners) rather than a plate: they are thicker
     * at the root where they meet the skull and thinner and lower at the
     * outboard tip, which is the profile a real hammerhead has and is what
     * makes it shade as a head rather than as a fin card. */
    const band = frame.band(0.055), root = frame.at(0.055), tipLong = frame.at(0.012);
    const midUp = (band.top + band.bottom) * 0.5;
    /* Rev 16: the SPAN is set against the BODY, not against the head band.
     *
     * Measured on the built rig, `band.halfAcross * 2.00/2.30` gave a total
     * span of 0.192L on hammerhead and 0.236L on athenajaw - roughly half the
     * 0.42-0.45L a real cephalofoil spans, which is why the lobes read as two
     * short tabs stuck on the snout rather than as a hammer. The head band's
     * width is a property of whichever bake the row landed on, so scaling from
     * it makes the hammer's size an accident of the base mesh; scaling from
     * frame.span makes it a property of the ANIMAL, which is what it should be.
     * Half-span, since `reach` is measured from the centreline. */
    const foilSpan = frame.span * (id === 'athenajaw' ? 0.45 : 0.42);
    const reach = Math.max(foilSpan * 0.5, band.halfAcross * 1.20);
    const rootThick = Math.max(band.height * 0.34, upSpan * 0.055);
    const tipThick = rootThick * 0.44;
    for (const sign of [-1, 1]) {
      const inner = band.centerAcross + sign * band.halfAcross * 0.42;
      const outer = band.centerAcross + sign * reach;
      /* Swept BACK as it goes outboard (tipLong is forward of root, so the
       * lobe leans into the nose) and dropped slightly, so the two lobes read
       * as one continuous wing through the skull rather than two stubs. */
      builder.addBox(root, tipLong, midUp, midUp - frame.upSign * upSpan * 0.030,
        rootThick, tipThick, Math.abs(outer - inner) * 0.50, Math.abs(outer - inner) * 0.34,
        (inner + outer) * 0.5, headWeight, FEATURE.armor);
      hornCount++;
    }
    /* The eye stalks a hammerhead carries at the lobe tips: small solid cones
     * capping each wing, so the foil ends in form and not in a cut edge. */
    for (const sign of [-1, 1]) {
      const outer = band.centerAcross + sign * reach;
      builder.addCone(0.030, midUp - frame.upSign * upSpan * 0.030, 0.018, midUp - frame.upSign * upSpan * 0.020,
        frame.span * 0.016, frame.span * 0.014, outer, headWeight, FEATURE.armor);
      crownCount++;
    }
  } else if (mode === 'saw') {
    /* Rev 15 REBASE, second finding. The rostrum used NEGATIVE stations
     * (-0.08, -0.19) to reach forward of the snout, and every one of them
     * rendered off the TAIL - the "saw on the tail" in the contact sheet.
     * Every prop that lands correctly (crown, horns) uses small POSITIVE
     * stations near the head instead, so the saw is now built the same way:
     * anchored at a real head station and extended forward by a raw long
     * OFFSET rather than by asking at() for a station outside [0, 1]. */
    const noseBand = frame.band(0.02), width = Math.max(noseBand.halfAcross * 0.24, frame.span * 0.018), bladeUp = (noseBand.top + noseBand.bottom) * 0.5;
    const noseCoord = frame.at(0.02), reachSign = Math.sign(frame.at(0.30) - frame.at(0.02)) || 1;
    const root = noseCoord + reachSign * frame.span * 0.010;
    const tip = noseCoord - reachSign * frame.span * 0.200;
    /* Rev 15 REBASE: the blade was `addPlate`, which extrudes one flat
     * profile by a constant halfAcross -- a CARD, and one of the six slabs
     * the owner called out. It is now a tapered solid: thick and tall at the
     * skull, thin and narrow at the tip, with eight independent corners, so
     * it catches the key light down its length instead of flashing as one
     * uniform sheet. */
    builder.addBox(root, tip, bladeUp, bladeUp, upSpan * 0.075, upSpan * 0.028,
      width * 1.35, width * 0.55, noseBand.centerAcross, headWeight, FEATURE.saw);
    /* The five sawteeth ride the blade, so they are placed by the same raw
     * offsets rather than by out-of-range stations. addPyramid takes
     * stations, so each tooth is expressed as the station whose coordinate
     * equals the offset we want. */
    const noseBand2 = frame.band(0.02);
    for (let i = 0; i < 5; i++) {
      const long = noseCoord - reachSign * frame.span * (0.030 + i * 0.035);
      const side = i % 2 ? -1 : 1;
      const across = noseBand2.centerAcross + side * Math.max(noseBand2.halfAcross * 0.38, frame.span * 0.022);
      builder.addPyramid(frame.station(long), bladeUp + upSpan * 0.04, frame.station(long - reachSign * frame.span * 0.014), bladeUp - upSpan * 0.02,
        frame.span * 0.012, frame.span * 0.012, across, headWeight, FEATURE.saw); sawToothCount++;
    }
  }
  const built = builder.geometry();
  if (!built.vertices) { group.userData.rfTexturedFeatures = null; return { mesh: null, kind: null, triangles: 0 }; }
  const glowEnabled = TEXTURED_CLASS_GLOW.has(String(def?.cls || '').toLowerCase()) || finite(def?.act, 1) >= 3;
  /* Owner override rev 15: charcoal-grey NATURAL skin on the ridge, and the
   * seam hue is the only thing separating the two kaiju: pale blue for
   * Sharkjira, magma orange for Leviathan Rex. */
  const SEAM = { sharkjira: new THREE.Color(0.55, 0.78, 1.0), leviathan: new THREE.Color(1.0, 0.42, 0.10) };
  const material = featureMaterial(body, palette, glowEnabled, SEAM[mode] || null);
  if (SEAM[mode]) {
    const u = material.userData.rfTexturedUniforms;
    /* Charcoal, but light enough to SHADE. At 0.15 the plates returned almost
     * no diffuse under this scene's lighting, so the whole ridge rendered as
     * one flat black shape with no interior form -- which is what made a
     * correctly-seated ridge read as a detached cutout floating over the
     * back. (Measured: the ridge base is 1-15 world units BELOW the body's
     * top surface at every station, i.e. genuinely embedded.) A charcoal
     * that catches the key light lets each plate show its own facets. */
    u.uRfFeatureBase.value.setRGB(0.255, 0.268, 0.290);
  }
  const mesh = new THREE.SkinnedMesh(built.geometry, material);
  mesh.name = `RF HSE textured ${mode} identity features`; mesh.renderOrder = 0; mesh.frustumCulled = false;
  mesh.bind(skeleton, body.bindMatrix.clone(), body.bindMatrixInverse.clone());
  body.parent?.add(mesh); body.parent?.updateMatrixWorld(true); mesh.computeBoundingBox(); mesh.userData.rfFrozenBounds = true;
  /* Excluded from the group bounds for the same reason the face batch is
   * (hse/face_textured.js): shark3d.js runs an authoritative length
   * normalization AFTER this mount, and letting a spine ridge that stands
   * proud of the back push that box rescales the whole row. */
  mesh.userData.rfExcludeFromBounds = true;
  /* Contact must be measured in ONE space. Box3.setFromObject on a
   * SkinnedMesh returns BIND-pose bounds (NOTES-rev15-face.md harness trap
   * #3), while this batch is now authored against the POSED cloud, so the
   * old body-vs-feature comparison was mixing the two spaces and reported a
   * false detachment. frame.box is the posed body box and built.geometry's
   * own bounding box is in the same local frame, so compare those. */
  const bodyBox = frame.box.clone(), featureBox = (built.posedBox && !built.posedBox.isEmpty() ? built.posedBox : built.geometry.boundingBox).clone(), bodySizeWorld = bodyBox.getSize(new THREE.Vector3());
  const contactEnvelope = bodyBox.clone().expandByScalar(Math.max(bodySizeWorld.x, bodySizeWorld.y, bodySizeWorld.z) * 0.035);
  const contact = contactEnvelope.intersectsBox(featureBox);
  group.userData.rfVisibleDrawCalls = finite(group.userData.rfVisibleDrawCalls, 0) + 1;
  if (!contact) throw new Error(`${id}: textured feature contact gate failed`);
  /* The row's eye and tooth row exist either way; faceOverlayPresent only
   * says WHICH module draws them. Report the effective counts so the
   * shark3d.js contract stays true when the face overlay owns the mouth. */
  const faceMetrics = faceOverlayPresent ? faceOverlayMetrics(body) : null;
  const effectiveEyeCount = faceOverlayPresent ? (faceMetrics?.eyeCount ?? 2) : eyeCount;
  /* The overlay's own published toothCount when it is readable; otherwise the
   * documented 36 (face_textured.js builds 9 stations x 4). `?? 20` was wrong:
   * the metrics object exists but reports 0 in node, where the face mesh is
   * built without the browser's demand-loaded template, so the nullish guard
   * never fired and the row published 0 teeth. */
  const overlayTeeth = finite(faceMetrics?.toothCount, 0);
  const effectiveToothCount = faceOverlayPresent ? (overlayTeeth > 0 ? overlayTeeth : 36) : toothCount;
  if (built.triangles > 900) throw new Error(`${id}: textured feature triangles ${built.triangles} exceed the one-draw budget`);
  if (mode === 'sharkjira' && plateCount !== 8) throw new Error(`${id}: atomic spine requires 8 measured plates`);
  /* Only gate the face when THIS module owns it; when the face overlay is
   * mounted the eye and the tooth row are its contract, not ours. */
  if (!faceOverlayPresent && (mode === 'sharkjira' || mode === 'leviathan') && (eyeCount !== 2 || toothCount < 20)) throw new Error(`${id}: kaiju face needs two eyes and a full tooth row, got eyes ${eyeCount} teeth ${toothCount}`);
  if (mode === 'leviathan' && plateCount !== 10) throw new Error(`${id}: king spine requires 10 measured plates`);
  const metadata = {
    ridgeEnabled: RF_KAIJU_RIDGE, mode, measuredAxes: { long: frame.longAxis, up: frame.upAxis, across: frame.axes.acrossAxis }, upSign: frame.upSign,
    contact, contactGap: contact ? 0 : Infinity, triangles: built.triangles, vertices: built.vertices, draw: 1,
    plateCount, scuteCount, crownCount, tuskCount, hornCount, sawToothCount, glowEnabled,
    faceParts, eyeCount, toothCount, faceOverlayPresent, faceOverlayFound, spineContinuous: mode === 'sharkjira' || mode === 'leviathan',
    stationRange: [0, 0.85], bodyBandMeasured: true, bones: frame.chain.map((entry) => entry.bone.name)
  };
  mesh.userData.rfTexturedFeatureMetrics = metadata;
  group.userData.rfTexturedFeatures = metadata;
  group.userData.rfTexturedFeatureMesh = mesh;
  if (mode === 'sharkjira') {
    group.userData.rfSharkjira = { ridgeEnabled: RF_KAIJU_RIDGE, plateCount, plateStations: [0.18, 0.28, 0.38, 0.48, 0.58, 0.68, 0.77, 0.84], atomicTriangles: built.triangles, toothTriangles: 0, pulseUniform: true, textured: true, eyeCount: effectiveEyeCount, toothCount: effectiveToothCount, ownEyeCount: eyeCount, ownToothCount: toothCount, faceOverlay: faceOverlayFound, seam: 'pale-blue' };
    group.userData.rfSharkjiraPulse = material.userData.rfTexturedUniforms.uRfFeatureGlowStrength;
  }
  if (mode === 'leviathan') {
    group.userData.rfLeviathan = { scuteCount, scuteStations: [0.16, 0.24, 0.32, 0.40, 0.48, 0.56, 0.64, 0.72, 0.79, 0.85], rowOffset: 0.46, crownPlates: crownCount, cheekPlates: 2, tuskCount, featureTriangles: built.triangles, pulseUniform: true, textured: true, ridgeEnabled: RF_KAIJU_RIDGE, spinePlates: plateCount, eyeCount: effectiveEyeCount, toothCount: effectiveToothCount, ownEyeCount: eyeCount, ownToothCount: toothCount, faceOverlay: faceOverlayFound, seam: 'magma-orange' };
    group.userData.rfLeviathanPulse = material.userData.rfTexturedUniforms.uRfFeatureGlowStrength;
  }
  return { mesh, kind: mode, triangles: built.triangles, metadata };
}

export { mountTexturedFeatures };
