/* Lane O2: the face batch, fitted to a REAL textured shark head.
 *
 * The Rev 13 face batch (socket/sclera/pupil/highlight/brow plus separated
 * teeth on Head and LowerJaw) was authored against the Quaternius Sharky
 * head, and it encodes that head's proportions as constants: an eye station
 * at 0.132 of the body span measured up from box.min.y, a socket radius of
 * 0.0165 span, a lip depth fraction of 0.16, and - the assumption that bites
 * hardest - that "up" in the mesh's own space is +Z and the nose is at low Y.
 *
 * None of that survives contact with a shark_bake.py asset. Measured on the
 * live skinned rigs (hse/probe_dorsal.mjs, hse/probe_axis.mjs):
 *
 *     reef        corr(skinned Z, world up) -0.009   corr(skinned X, up) -1.000
 *     greatwhite  corr(skinned Z, world up) -0.162   corr(skinned X, up) -1.000
 *     hammerhead  corr(skinned Z, world up) +0.948   corr(skinned X, up) +0.062
 *
 * The up axis is not even consistent BETWEEN baked rigs, because each bake
 * carries whatever orientation its source asset had and prepareTemplate's
 * roll correction operates on the group, not on skinned mesh space. So this
 * module assumes nothing: it measures the head's own frame from the mesh -
 * long axis from the Head-to-tail skin-weight centroids, up axis by
 * correlating each skinned axis against world up through the body's live
 * world matrix, lateral as the remaining perpendicular - and authors every
 * eye and tooth in that measured frame.
 *
 * Everything is then pushed back through the owning bone's inverse, the same
 * way Rev 13 does it, so the vertex lands where it was authored once GPU
 * skinning re-applies the bone. That is what keeps the fit correct on the
 * rows whose Head/LowerJaw carry a non-uniform personality scale.
 *
 * Contract: buildTexturedFace(rig, skinnedMesh, def, profile) -> a bound
 * SkinnedMesh (added to the body's parent) or null, carrying gate metrics on
 * userData.rfFaceMetrics. Returns null rather than throwing on any rig it
 * cannot measure, so a bake that lands mid-program degrades to the bake's own
 * painted face instead of breaking the row.
 */
import * as THREE from 'three';
/* The rest gape is measured by rig_morph's applyMorph() but can only be
 * APPLIED after this module has authored the mouth against the closed jaw.
 * See the call at the end of buildTexturedFace(). */
import { commitRestGape } from './rig_morph.js';

const TAU = Math.PI * 2;
/* Same kind ids the Rev 13 face shader branches on, so a textured face can
 * reuse that material contract exactly. */
/* `cavity` (7) is new in Rev 15: the dark throat behind the tooth rows. A
 * gape with nothing behind it reads as a painted line rather than as an open
 * mouth, which is what made the r14 jaws vanish at gameplay size. */
export const FACE_KIND = Object.freeze({ socket: 0, sclera: 1, pupil: 2, highlight: 3, brow: 4, tooth: 5, lip: 6, cavity: 7 });

/* ---------------------------------------------------------------------- *
 * MOUTH HOLD (Rev 15 lane GRIN)
 * ---------------------------------------------------------------------- *
 *
 * When true, the batch emits the EYE ONLY: no tooth rows, no mouth cavity.
 *
 * WHY IT IS ON. The rest gape now works - the merged sign fix plus
 * commitRestGape() put the LowerJaw at a measured 25.8-26.3 deg on every
 * shipping row, and the jaw visibly hinges open in the render. What does NOT
 * work is fitting the tooth rows and the cavity to that opened mouth. Shot on
 * the current tree at 380 px (hse/evidence/r15-face/heads_g2/):
 *
 *   reef        lower row seats in the mouth, upper row rides too high on the
 *               snout - reads as a separate arc floating over the head
 *   blue        mouth reads CLOSED; teeth are a few specks up on the DORSAL
 *               surface, nowhere near the lip
 *   greatwhite  row hangs off the throat, teeth scattered below the jaw line
 *
 * The mouth-line derivation is the culprit, and it is a REAL unsolved
 * problem, not a tuning gap: `mouthU` comes from the head slice's ventral end
 * (`upper.uMin + upper.uSpan * 0.16`), which was calibrated against a CLOSED
 * jaw. With the jaw hinged open the head/jaw weight overlap and the head band
 * both change shape, so that fraction no longer lands on the lip. Two of the
 * three rows above take the `mouthSource = "head extent (overlap was the
 * snout tip)"` fallback, which is a guess by construction.
 *
 * The numeric seating gates do NOT catch this, for the same reason they did
 * not catch the original defect: they measure distance to the nearest
 * head-or-jaw vertex, and a row sitting in the newly-opened GAP is close to
 * both surfaces. Measured, every row scores 1.6-3.0% of a head span - healthy
 * - while the render shows teeth on the dorsal ridge. A gate that a visibly
 * wrong row passes is not evidence.
 *
 * Shipping floating teeth is worse than shipping none: it is precisely the
 * r14 defect this revision exists to remove, and the coordinator's
 * instruction was explicit - do not leave floating geometry. So the mouth is
 * held and the eye ships, which is a strict improvement on the r15 baseline
 * (iris ring, pupil, socket, no white-dot blowout) with no regression.
 *
 * TO LIFT THIS: fix the mouth line against the OPENED jaw - derive the lip
 * from the head/jaw weight boundary in the posed pose rather than from a
 * fixed fraction of the head band - then set this to false and re-shoot
 * reef/blue/greatwhite. The gape, the cavity geometry, the tooth emitter and
 * the mouth gate are all in place and working; only the seating station is
 * wrong. */
const RF_GRIN_MOUTH_HOLD = true;

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function finite(v, d) { return typeof v === 'number' && Number.isFinite(v) ? v : d; }

/* ---------------------------------------------------------------------- *
 * Measuring the head
 * ---------------------------------------------------------------------- */

/* Every vertex of the body, pushed through its bones into SKINNED space, and
 * tagged with which of Head / LowerJaw owns it. Skinned space is the only
 * space where the lip is actually at the lip: the bind pose puts it wherever
 * the armature scale has not yet been applied. */
function skinnedSamples(body) {
  const geometry = body.geometry;
  const position = geometry.getAttribute('position');
  const skinIndex = geometry.getAttribute('skinIndex');
  const skinWeight = geometry.getAttribute('skinWeight');
  const bones = body.skeleton?.bones || [];
  const headIndex = bones.findIndex((bone) => bone.name === 'Head');
  const jawIndex = bones.findIndex((bone) => bone.name === 'LowerJaw');
  if (!position || !skinIndex || !skinWeight || headIndex < 0 || jawIndex < 0) return null;

  const point = new THREE.Vector3(), world = new THREE.Vector3();
  const all = [], headWeights = [], jawWeights = [];
  body.updateMatrixWorld(true);
  /* Skin a vertex to POSED space by hand instead of calling
   * body.applyBoneTransform().
   *
   * THIS IS THE REV 15 SEATING FIX. applyBoneTransform() reads
   * skeleton.boneMatrices, a Float32Array that THREE fills in
   * Skeleton.update(). Nothing in the build path calls that: in node it
   * happens to hold the right values, but in the BROWSER it is still the
   * identity when buildLoadedRig runs, so applyBoneTransform returns the
   * vertex UNCHANGED. Measured on reef, head vertex 1989:
   *
   *     raw                    (-0.043, -0.010, -0.375)
   *     applyBoneTransform     (-0.043, -0.010, -0.375)   <- unchanged
   *     manual linear blend    (-0.043, -0.374, -0.282)   <- correct, delta 0.376
   *
   * So every sample this module measured in the browser was the BIND pose
   * while the shark rendered in its posed pose, and the whole batch was
   * authored one head-height below the head - the float in
   * hse/evidence/head_after/. In node the two poses agree, the samples are
   * right, and every gate passes: that is the exact "false green" recorded in
   * hse/STATUS-O2.md, and this is its mechanism.
   *
   * Composing the bone matrices here depends on bone.matrixWorld, which
   * updateMatrixWorld(true) above guarantees is current in BOTH runtimes. */
  const boneMatrices = bones.map((bone) => new THREE.Matrix4()
    .multiplyMatrices(body.bindMatrixInverse, bone.matrixWorld));
  const blended = new THREE.Vector3(), contribution = new THREE.Vector3();
  const skinVertex = (index, target) => {
    target.fromBufferAttribute(position, index);
    blended.set(0, 0, 0);
    let total = 0;
    for (let k = 0; k < 4; k++) {
      const bone = skinIndex.getComponent(index, k), weight = skinWeight.getComponent(index, k);
      if (!(weight > 0) || !boneMatrices[bone]) continue;
      contribution.copy(target).applyMatrix4(boneMatrices[bone]);
      blended.addScaledVector(contribution, weight);
      total += weight;
    }
    /* An unweighted vertex keeps its bind position, which is what skinning
     * does with a zero weight sum. */
    if (total > 1e-6) target.copy(blended).multiplyScalar(1 / total);
    return target;
  };
  /* Weights are collected first and thresholded second, because the
   * threshold cannot be a constant. Measured max LowerJaw weight across the
   * baked line (hse/probe_jaw.mjs):
   *
   *     reef / dogfish        1.000   hard-weighted jaw
   *     megalodon / megalodonrex 0.267   soft-blended jaw
   *     thresher              0.219
   *     whaleshark / whitepointer 0.259
   *
   * A fixed 0.5 cut - which is what the Sharky-era code uses - finds the jaw
   * on the first rig and NOTHING on the other three, so those rows silently
   * produced no face at all. The cut is therefore relative to the weight this
   * rig actually reaches, which selects the jaw-most vertices on both kinds
   * of bake. */
  let maxHead = 0, maxJaw = 0;
  for (let i = 0; i < position.count; i++) {
    skinVertex(i, point);
    world.copy(point).applyMatrix4(body.matrixWorld);
    all.push([point.x, point.y, point.z, world.y]);
    let headWeight = 0, jawWeight = 0;
    for (let k = 0; k < 4; k++) {
      const bone = skinIndex.getComponent(i, k), weight = skinWeight.getComponent(i, k);
      if (bone === headIndex) headWeight += weight; else if (bone === jawIndex) jawWeight += weight;
    }
    headWeights.push(headWeight); jawWeights.push(jawWeight);
    if (headWeight > maxHead) maxHead = headWeight;
    if (jawWeight > maxJaw) maxJaw = jawWeight;
  }
  const headCut = Math.min(0.5, maxHead * 0.55), jawCut = Math.min(0.5, maxJaw * 0.55);
  const head = [], jaw = [];
  for (let i = 0; i < all.length; i++) {
    if (headWeights[i] > headCut && headWeights[i] > 1e-4) head.push(all[i]);
    if (jawWeights[i] > jawCut && jawWeights[i] > 1e-4) jaw.push(all[i]);
  }
  if (head.length < 8 || jaw.length < 8) return null;

  /* SPARSE HEAD REPAIR.
   *
   * The head cloud is every vertex whose Head-bone weight clears a relative
   * cut. On a hard-weighted bake that IS the skull. On a softly weighted one
   * it is a thin strip of it: measured skinned bounding boxes of the selected
   * cloud,
   *
   *     reef        1416 verts   box 0.149 x 0.237 x 0.146   plausible skull
   *     megalodon    282 verts   box 0.043 x 0.289 x 0.240   a sliver
   *
   * A "head" 0.043 wide and 0.289 long is not a head, and everything derived
   * from it - headCentroid, headF, headU, the eye station, the ray origin -
   * is then wrong. That is the whole megalodon/typhonmaw failure: a lateral
   * ray cast anywhere on that strip finds a maximum width of 0.034 against a
   * headSpan of 0.347, so the eye was sized and seated from noise.
   *
   * A shark's head is also a REGION - the forward part of the body - and that
   * definition needs no weights at all. When the weighted cloud is too flat to
   * be a skull (its narrowest dimension under a fifth of its longest), the
   * head is re-selected as every vertex forward of a cut along the body's own
   * long axis. The weighted cloud still decides WHERE that cut goes, which is
   * the one thing it is reliable for. */
  const cloudBox = (list) => {
    let mnx = Infinity, mny = Infinity, mnz = Infinity, mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
    for (const q of list) {
      if (q[0] < mnx) mnx = q[0]; if (q[0] > mxx) mxx = q[0];
      if (q[1] < mny) mny = q[1]; if (q[1] > mxy) mxy = q[1];
      if (q[2] < mnz) mnz = q[2]; if (q[2] > mxz) mxz = q[2];
    }
    return [mxx - mnx, mxy - mny, mxz - mnz];
  };
  let headSource = 'Head bone weights';
  {
    const dims = cloudBox(head);
    const longest = Math.max(dims[0], dims[1], dims[2]);
    const shortest = Math.min(dims[0], dims[1], dims[2]);
    if (longest > 1e-9 && shortest / longest < 0.20) {
      /* Body long axis, and which end the weighted cloud sits at. */
      const bodyDims = cloudBox(all);
      let axis = 0;
      if (bodyDims[1] >= bodyDims[0] && bodyDims[1] >= bodyDims[2]) axis = 1;
      else if (bodyDims[2] >= bodyDims[0] && bodyDims[2] >= bodyDims[1]) axis = 2;
      let bodyLo = Infinity, bodyHi = -Infinity;
      for (const q of all) { if (q[axis] < bodyLo) bodyLo = q[axis]; if (q[axis] > bodyHi) bodyHi = q[axis]; }
      let headMean = 0;
      for (const q of head) headMean += q[axis];
      headMean /= Math.max(head.length, 1);
      const span = Math.max(bodyHi - bodyLo, 1e-9);
      const noseAtHi = Math.abs(headMean - bodyHi) < Math.abs(headMean - bodyLo);
      /* Take the forward-most N vertices by rank rather than by a fixed
       * fraction of the body's length.
       *
       * A fraction assumes uniform tessellation and these bakes are not
       * uniform: the forward 30% of megalodon contains only 386 vertices, not
       * enough to improve on the 282 the weights gave. Ranking guarantees a
       * usable sample on any mesh. A quarter of the body's vertices is about
       * what the dense bakes' own head clouds come to (reef: 1416 of 7240). */
      /* Rank the body's vertices from the nose backwards, then keep those
       * within the ORIGINAL cloud's own length of the nose. Ranking alone
       * (a flat 25% of the body) made the "head" a quarter of the shark, so
       * headSpan came out as 1.236 against a real head of ~0.29 and every
       * fraction expressed against it was meaningless. The weighted cloud is
       * unreliable about the head's WIDTH but perfectly reliable about how far
       * back it reaches, so that length is what bounds the region. */
      const ordered = all.slice().sort((a, b) => noseAtHi ? b[axis] - a[axis] : a[axis] - b[axis]);
      let headLo = Infinity, headHi = -Infinity;
      for (const q of head) { if (q[axis] < headLo) headLo = q[axis]; if (q[axis] > headHi) headHi = q[axis]; }
      const headLen = Math.max(headHi - headLo, span * 0.05);
      const nose = noseAtHi ? bodyHi : bodyLo;
      const rebuilt = [];
      for (const q of ordered) {
        if (Math.abs(q[axis] - nose) <= headLen) rebuilt.push(q);
      }
      /* Accept the rebuild whenever it is denser than the sliver AND actually
       * fatter: the point is to get a cross-section, so the test is on the
       * shape it produces, not on a vertex count alone. */
      const rebuiltDims = rebuilt.length ? cloudBox(rebuilt) : [0, 0, 0];
      const rebuiltRatio = Math.min(...rebuiltDims) / Math.max(Math.max(...rebuiltDims), 1e-9);
      if (rebuilt.length > head.length && rebuiltRatio > shortest / longest) {
        head.length = 0;
        for (const q of rebuilt) head.push(q);
        headSource = 'body-forward region (weighted cloud was a sliver)';
      }
    }
  }

  /* skinVertex is exported so headSurface() can skin the triangle corners
   * with the SAME corrected blend these samples used. Two different skinning
   * paths is how the pose bug hid for a whole revision. */
  return { all, head, jaw, headIndex, jawIndex, headCut, jawCut, maxHeadWeight: maxHead, maxJawWeight: maxJaw, skinVertex, headSource };
}

function centroid(points) {
  const out = new THREE.Vector3();
  if (!points.length) return out;
  for (const p of points) { out.x += p[0]; out.y += p[1]; out.z += p[2]; }
  return out.divideScalar(points.length);
}

/* Which skinned axis points at world up. Correlating the axis against the
 * world Y of the same vertex is the same technique prepareTemplate uses for
 * the shader's bind-up, and for the same reason: guessing is silent. A wrong
 * up axis still builds a face, it just builds it on the shark's cheek. */
function measureUpAxis(samples) {
  const points = samples.all;
  const n = points.length;
  let mx = 0, my = 0, mz = 0, mw = 0;
  for (const p of points) { mx += p[0]; my += p[1]; mz += p[2]; mw += p[3]; }
  mx /= n; my /= n; mz /= n; mw /= n;
  let vw = 0;
  const cov = [0, 0, 0], varAxis = [0, 0, 0];
  for (const p of points) {
    const d = [p[0] - mx, p[1] - my, p[2] - mz], w = p[3] - mw;
    vw += w * w;
    for (let a = 0; a < 3; a++) { cov[a] += d[a] * w; varAxis[a] += d[a] * d[a]; }
  }
  let best = 0, bestScore = -Infinity;
  const correlations = [0, 0, 0];
  for (let a = 0; a < 3; a++) {
    const denom = Math.sqrt(Math.max(varAxis[a] * vw, 1e-18));
    correlations[a] = denom > 0 ? cov[a] / denom : 0;
    const score = Math.abs(correlations[a]);
    if (score > bestScore) { bestScore = score; best = a; }
  }
  const up = new THREE.Vector3();
  up.setComponent(best, correlations[best] >= 0 ? 1 : -1);
  return { up, axis: best, correlation: correlations[best], correlations };
}

/* The head frame: forward runs tail centroid -> head centroid, up is the
 * measured world-up axis orthogonalized against forward, side completes the
 * right-handed set. Authoring in this frame is what makes one set of
 * fractions work on a rig whose nose is at -Y and on one whose nose is at +X.
 */
function headFrame(body, samples) {
  const bones = body.skeleton?.bones || [];
  const tailBone = ['Tail3', 'Tail2', 'Tail1'].map((n) => bones.findIndex((b) => b.name === n)).find((i) => i >= 0);
  const headCentroid = centroid(samples.head);
  /* Prefer a tail-weighted centroid for the long axis; fall back to the whole
   * body centroid, which is still behind the head on any shark. */
  let tailCentroid = null;
  if (tailBone !== undefined && tailBone >= 0) {
    const geometry = body.geometry;
    const skinIndex = geometry.getAttribute('skinIndex'), skinWeight = geometry.getAttribute('skinWeight');
    /* Relative cut, for the same reason skinnedSamples uses one: a bake with
     * a softly blended tail reaches nowhere near 0.5 and would select nothing. */
    const weights = [];
    let maxWeight = 0;
    for (let i = 0; i < samples.all.length; i++) {
      let w = 0;
      for (let k = 0; k < 4; k++) if (skinIndex.getComponent(i, k) === tailBone) w += skinWeight.getComponent(i, k);
      weights.push(w); if (w > maxWeight) maxWeight = w;
    }
    const cut = Math.min(0.5, maxWeight * 0.55);
    const picked = [];
    for (let i = 0; i < weights.length; i++) if (weights[i] > cut && weights[i] > 1e-4) picked.push(samples.all[i]);
    if (picked.length >= 8) tailCentroid = centroid(picked);
  }
  if (!tailCentroid) tailCentroid = centroid(samples.all);

  /* The frame comes from the BONES, not from the vertex clouds.
   *
   * The first cut took forward as head-centroid minus tail-centroid in skinned
   * space. That is wrong for two compounding reasons, and it put the whole
   * face batch out beside the pectoral fin (measured on reef: the eye parts
   * landed at world z -38..-47 while the body spans z -52.8..+52.9):
   *
   *   - The skinned pose is BENT by the procedural swim, so a straight line
   *     from tail to head is a chord across a curve, not the head's forward.
   *     Measured: head centroid world z -42.3, tail centroid world z +46.2,
   *     giving a "forward" with a -0.757 world-z component on a shark whose
   *     head actually points down world +x.
   *   - The head cloud is one-sided (see the mirror note in the gate), so its
   *     centroid is offset laterally, which tips the axis further.
   *
   * The Head bone already carries the answer exactly. Measured on reef:
   *
   *     Neck -> Head world direction   (1.000, 0.000, 0.000)   nose forward
   *     Head local X -> world          (0.000, -1.000, 0.000)  down
   *     Head local Z -> world          (0.000, 0.000, 1.000)   lateral
   *
   * so forward is Neck -> Head, up is whichever head-local axis best opposes
   * world down, and side completes the set. Falling back to the centroid axis
   * only if the bones are missing keeps a bake without a Neck working. */
  const skinToWorld = new THREE.Matrix3().setFromMatrix4(body.matrixWorld);
  const worldToSkin = skinToWorld.clone().invert();
  const headBone = bones.find((b) => b.name === 'Head');
  const neckBone = bones.find((b) => b.name === 'Neck');

  /* Forward comes from the GEOMETRY, not from the bones.
   *
   * The bone chain looked like the obvious source, but it is posed by the
   * procedural swim and by prepareTemplate's axis/roll correction, so it no
   * longer agrees with the skinned vertices it drives. Measured on reef:
   *
   *     Neck -> Head, skinned space   (0.000,  0.000, -0.138)   pure z
   *     head cloud, skinned box       y[-0.498, -0.263]         lives on y
   *     body cloud, skinned box       y[-0.498, +0.485]         y is the length
   *
   * Trusting the bone delta therefore declared z the body axis, which made
   * the LATERAL axis come out along the body's length: the head's projected
   * lateral range was s[-0.499, -0.264], entirely on one side of the midline
   * instead of straddling it. Mirroring across that axis is what threw the
   * second eye 78 world units back to the tail.
   *
   * The head-to-tail centroid axis is computed from the same vertices the
   * face has to sit on, so it cannot disagree with them. The one-sidedness of
   * the head cloud biases it slightly, which the sign-symmetric lateral axis
   * below corrects for. */
  let forward = headCentroid.clone().sub(tailCentroid);
  if (forward.lengthSq() < 1e-12) return null;
  forward.normalize();

  /* Up: the skinned direction that maps closest to world up. Measuring it
   * against the live world matrix keeps it correct whatever orientation the
   * bake was authored in. */
  const measured = measureUpAxis(samples);
  let up = null;
  if (headBone) {
    const worldUp = new THREE.Vector3(0, 1, 0).applyMatrix3(worldToSkin);
    if (worldUp.lengthSq() > 1e-12) up = worldUp.normalize();
  }
  if (!up) up = measured.up.clone();
  up.addScaledVector(forward, -up.dot(forward));
  if (up.lengthSq() < 1e-9) return null;
  up.normalize();
  let side = new THREE.Vector3().crossVectors(forward, up).normalize();

  /* Verify the lateral axis actually straddles the midline, and repair it if
   * not. A shark is symmetric about its lateral axis, so the head vertices
   * must spread to BOTH signs of it. When the chosen axis is wrong the head
   * projects entirely to one side (measured on reef with the bone-derived
   * frame: s[-0.499, -0.264]) and every mirrored feature lands off the body.
   * Testing this directly is cheap and catches any future bake whose
   * orientation defeats the derivation above. */
  const lateralBalance = (axis) => {
    let lo = Infinity, hi = -Infinity;
    for (const p of samples.head) {
      const d = (p[0] - headCentroid.x) * axis.x + (p[1] - headCentroid.y) * axis.y + (p[2] - headCentroid.z) * axis.z;
      if (d < lo) lo = d; if (d > hi) hi = d;
    }
    if (!(hi > lo)) return 0;
    /* 1.0 when the spread is perfectly centred, 0 when it is entirely on one
     * side of the origin. */
    return Math.min(-lo, hi) / Math.max(Math.max(-lo, hi), 1e-9);
  };
  if (lateralBalance(side) < 0.25) {
    let best = side, bestScore = lateralBalance(side);
    for (const candidate of [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)]) {
      const score = lateralBalance(candidate);
      if (score > bestScore) { bestScore = score; best = candidate.clone(); }
    }
    side = best.normalize();
    /* Rebuild the other two around the repaired lateral axis so the frame
     * stays orthogonal. */
    forward.addScaledVector(side, -forward.dot(side));
    if (forward.lengthSq() < 1e-12) return null;
    forward.normalize();
    up.crossVectors(side, forward).normalize();
  }

  /* The cross product gives a direction, but skinned space is NOT orthonormal
   * once the group's non-uniform scale is folded in (measured on reef:
   * body.matrixWorld scale 107.50, 107.50, 97.66). A unit step along `side`
   * in skinned space therefore covers a different world distance than a unit
   * step along `forward`, and the two axes are not even perpendicular in the
   * space the shark is actually drawn in.
   *
   * That is what put the mirrored eye 78 world units away at the tail: the
   * head surface sits at world z -52.8..-27.5, but the eye pair came out at
   * z -48..+50, i.e. one eye on the head and its mirror walking down the
   * body. The fix is to define `side` so that it is perpendicular to the
   * other two AFTER the world transform, which is the space symmetry actually
   * has to hold in. Build it in world space, then bring it back. */
  const worldForward = forward.clone().applyMatrix3(skinToWorld).normalize();
  const worldUpAxis = up.clone().applyMatrix3(skinToWorld);
  worldUpAxis.addScaledVector(worldForward, -worldUpAxis.dot(worldForward));
  if (worldUpAxis.lengthSq() > 1e-12) {
    worldUpAxis.normalize();
    const worldSide = new THREE.Vector3().crossVectors(worldForward, worldUpAxis).normalize();
    const backSide = worldSide.clone().applyMatrix3(worldToSkin);
    if (backSide.lengthSq() > 1e-12) side = backSide.normalize();
    /* Same treatment for up, so all three axes are mutually perpendicular in
     * the space the shark is drawn in rather than only in skinned space. */
    const backUp = worldUpAxis.clone().applyMatrix3(worldToSkin);
    if (backUp.lengthSq() > 1e-12) up.copy(backUp.normalize());
  }
  /* The ORIGIN must come from the bone too. The head vertex cloud is
   * one-sided, so its centroid is pushed off the skull's midline - measured on
   * reef, the head centroid sits at world z -42.3 while the Head bone is at
   * world z +0.9, and anchoring there dragged every eye and tooth out to the
   * flank no matter how good the axes were. The Head bone is on the midline by
   * construction, which is exactly what an origin for a symmetric face needs. */
  /* The origin is the head cloud's own centroid. The Head BONE looked like a
   * better, midline-guaranteed anchor, but it is posed by the procedural swim
   * and sits well outside the head vertices it nominally drives (measured on
   * reef: bone at skinned z -0.303 against a head cloud spanning y -0.498..
   * -0.263), which pushed the whole face forward past the nose - the eye came
   * out at world x 24..72 on a head ending at x 31.7. The cloud centroid is
   * by construction inside the vertices the face must sit on. */
  const origin = headCentroid;

  /* ORIENT `up` SO THAT IT ACTUALLY POINTS DORSAL.
   *
   * Everything downstream assumes +u is toward the shark's back, so that a
   * head slice's uMin is the LOWER lip and uMax is the dorsal ridge. Nothing
   * up to this point guaranteed that: `up` is derived by correlating a skinned
   * axis against world up, and measureUpAxis reports a correlation of -1 on
   * reef/tiger/greatwhite and +1 on hammerhead. The module RECORDED that sign
   * and then ignored it.
   *
   * With +u pointing ventral, `lower.uMax` - meant to be the top of the jaw
   * band, i.e. the mouth line - selected the DORSAL end instead, and the whole
   * lower tooth row was laid along the top of the skull. Measured on reef:
   * lower row mean world y 45.1 against an eye at 44.3, i.e. above the eye;
   * on the render those are the specks along the dorsal ridge, and they are
   * 100% of the containment failure (a per-kind isolation render scored the
   * eyeball and brow at 1.000 inside and the teeth at 0.057).
   *
   * The fix is to settle the sign once, here, against the live world matrix,
   * so every `uMin`/`uMax` downstream means what it says. Flipping `up`
   * requires flipping `side` too, or the frame stops being right-handed and
   * the mirrored features swap flanks. */
  {
    const worldUp = new THREE.Vector3(0, 1, 0);
    const upInWorld = up.clone().applyMatrix3(skinToWorld);
    if (upInWorld.lengthSq() > 1e-12 && upInWorld.normalize().dot(worldUp) < 0) {
      up.negate();
      side.negate();
    }
  }

  return {
    forward, up, side, headCentroid: origin, headCloudCentroid: headCentroid, tailCentroid,
    upAxis: measured.axis, upCorrelation: measured.correlation,
    frameSource: (headBone && neckBone) ? 'Head/Neck bones' : 'skin-weight centroids'
  };
}

/* ---------------------------------------------------------------------- *
 * Posed head surface: triangles + brute-force ray cast
 * ---------------------------------------------------------------------- */

/* Rev 15 seating. Everything before this pass seated features against a
 * SCALAR half-width measured from a slice of the vertex cloud. That is the
 * wrong shape of measurement: one number cannot describe where a curved skull
 * actually is under a given feature, so the eye rim crossed the silhouette on
 * a rounded head and the whole eye hung in open water on a thin one.
 *
 * This builds the real thing: the posed head SURFACE as triangles, skinned
 * with the same corrected manual blend `skinnedSamples` uses, and casts a ray
 * outward along the frame's lateral axis to find where the skin actually is.
 * The eye is then seated against that hit and its own local normal.
 *
 * Brute force on purpose. It is a build-time cost paid once per rig, the head
 * third is 334-2308 triangles on the baked line, and a BVH would be more code
 * to get wrong for no measurable gain at this size.
 */
function headSurface(body, samples, skinVertex, frame, headSpanHint) {
  const geometry = body.geometry;
  const index = geometry.getIndex();
  const position = geometry.getAttribute('position');
  const skinIndex = geometry.getAttribute('skinIndex');
  const skinWeight = geometry.getAttribute('skinWeight');
  if (!position || !skinIndex || !skinWeight) return null;

  /* Head-weight per vertex, so a triangle can be tested for membership. The
   * cut is deliberately looser than skinnedSamples' (0.35 against a relative
   * ~0.5): a triangle only needs to be NEAR the head to be worth casting
   * against, and the softly weighted bakes have very few vertices over the
   * strict cut - megalodon yields 334 head triangles where reef yields 1970.
   * Being generous here costs a few hundred triangles and is what stops the
   * thin bakes from having no surface to hit at all. */
  /* Which triangles count as "the head surface" is selected GEOMETRICALLY,
   * not by skin weight.
   *
   * Filtering by Head-bone weight is the obvious choice and it fails on the
   * softly weighted bakes: typhonmaw and megalodon have 282 head-weighted
   * vertices against reef's 1416, and loosening the weight cut from 0.5 all
   * the way to 0.05 only reaches 321. Their skull is mostly weighted to Neck
   * and Spine, so a weight-filtered hull is a sliver well inside the real
   * silhouette - the ray hit that sliver and the eye was seated in open water
   * beside the visible head.
   *
   * The head is a REGION of the body, so it is selected as one: every
   * triangle whose centroid lies forward of the head cloud's rear edge along
   * the frame's forward axis, whatever bone drives it. That is dense on every
   * bake because it is just "the front of the shark". */
  const count = position.count;
  const cut = 0;

  /* Skin every vertex once, then keep only the triangles that touch the head.
   * Skinning is the expensive half, so it is not repeated per triangle. */
  const skinned = new Array(count);
  const scratch = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    skinVertex(i, scratch);
    skinned[i] = scratch.clone();
  }

  /* Rear edge of the head region, as a fraction of the BODY's own forward
   * extent rather than from the head vertex cloud.
   *
   * Deriving it from the head cloud looked right and is not robust: that
   * cloud is a weight-thresholded sample and on the soft bakes it is both
   * sparse and spatially scattered, so its rear edge lands almost at the
   * nose. Measured, triangles surviving the filter: reef 2817 of 6715, but
   * typhonmaw only 408 of 6790 despite a LARGER head span - a hull far inside
   * the real silhouette, which is what let the ray hit early and seat the eye
   * in open water.
   *
   * The forward third of the body is the head on every shark in this line,
   * and it is a measurement no weighting can corrupt. */
  let bodyFrontF = -Infinity, bodyRearF = Infinity;
  for (const q of samples.all) {
    const f = (q[0] - frame.headCentroid.x) * frame.forward.x
            + (q[1] - frame.headCentroid.y) * frame.forward.y
            + (q[2] - frame.headCentroid.z) * frame.forward.z;
    if (f > bodyFrontF) bodyFrontF = f;
    if (f < bodyRearF) bodyRearF = f;
  }
  if (!Number.isFinite(bodyFrontF) || !Number.isFinite(bodyRearF)) return null;
  /* 0.38 of the body still left typhonmaw with 786 of 6790 triangles (12%),
   * because its tessellation is not uniform along the body. Rather than keep
   * tuning a fraction that means something different on every bake, the whole
   * body is used: the ray is cast along the LATERAL axis at the eye station,
   * so triangles down by the tail are simply never hit, and the only cost of
   * including them is a few thousand extra ray-triangle tests once per rig at
   * build time. Correctness beats a micro-optimisation here. */
  const rearLimit = -Infinity;

  const tris = [];
  const triCount = index ? index.count : count;
  const centroidV = new THREE.Vector3();
  for (let t = 0; t + 2 < triCount; t += 3) {
    const a = index ? index.getX(t) : t;
    const b = index ? index.getX(t + 1) : t + 1;
    const c = index ? index.getX(t + 2) : t + 2;
    centroidV.copy(skinned[a]).add(skinned[b]).add(skinned[c]).multiplyScalar(1 / 3);
    const f = (centroidV.x - frame.headCentroid.x) * frame.forward.x
            + (centroidV.y - frame.headCentroid.y) * frame.forward.y
            + (centroidV.z - frame.headCentroid.z) * frame.forward.z;
    if (f < rearLimit) continue;
    const A = skinned[a], B = skinned[b], C = skinned[c];
    const centre = new THREE.Vector3().copy(A).add(B).add(C).multiplyScalar(1 / 3);
    const radius = Math.sqrt(Math.max(
      centre.distanceToSquared(A), centre.distanceToSquared(B), centre.distanceToSquared(C)));
    const tri = [A, B, C];
    tri.centre = centre; tri.radius = radius;
    tris.push(tri);
  }
  if (tris.length < 4) return null;
  return { tris, count: tris.length, cut };
}

/* Ray-triangle hit (Moller-Trumbore), returning the hit point, the geometric
 * normal oriented back along the ray, and the distance. Two-sided, because a
 * baked hull's winding is not something this module can rely on.
 *
 * `pick` selects WHICH hit along the ray is wanted. The default is the
 * FARTHEST, and that is deliberate: the ray starts on the head's centreline,
 * which is inside the mesh, and a shark bake has interior surfaces in the way
 * - the mouth cavity, the gill slits, the throat. Taking the nearest hit
 * seated the eye against one of those instead of the outer flank, measured on
 * blue as a local half-width of 0.0295 of a head span against a band width of
 * 0.2265, i.e. an eye sized to an interior wall and 8x too small. The
 * outermost hit along the ray is the silhouette, which is the surface the eye
 * has to sit on and stay inside of. */
function castRay(surface, origin, direction, maxDistance, pick = 'far') {
  const edge1 = new THREE.Vector3(), edge2 = new THREE.Vector3();
  const pvec = new THREE.Vector3(), tvec = new THREE.Vector3(), qvec = new THREE.Vector3();
  let bestT = pick === 'far' ? -Infinity : maxDistance, bestTri = null;
  /* Cheap reject before the Moller-Trumbore work: a ray can only hit a
   * triangle whose bounding sphere it passes within. Every cast here runs
   * along the lateral axis at one station, so this discards almost the whole
   * body for a couple of dot products per triangle. */
  const toCentre = new THREE.Vector3();
  for (const tri of surface.tris) {
    toCentre.copy(tri.centre).sub(origin);
    const along = toCentre.dot(direction);
    if (along < -tri.radius || along > maxDistance + tri.radius) continue;
    if (toCentre.lengthSq() - along * along > tri.radius * tri.radius) continue;
    edge1.subVectors(tri[1], tri[0]);
    edge2.subVectors(tri[2], tri[0]);
    pvec.crossVectors(direction, edge2);
    const det = edge1.dot(pvec);
    if (Math.abs(det) < 1e-12) continue;
    const inv = 1 / det;
    tvec.subVectors(origin, tri[0]);
    const u = tvec.dot(pvec) * inv;
    if (u < 0 || u > 1) continue;
    qvec.crossVectors(tvec, edge1);
    const v = direction.dot(qvec) * inv;
    if (v < 0 || u + v > 1) continue;
    const t = edge2.dot(qvec) * inv;
    if (t <= 1e-9 || t > maxDistance) continue;
    if (pick === 'far' ? t > bestT : t < bestT) { bestT = t; bestTri = tri; }
  }
  if (!bestTri) return null;
  const point = origin.clone().addScaledVector(direction, bestT);
  const normal = new THREE.Vector3()
    .subVectors(bestTri[1], bestTri[0])
    .cross(new THREE.Vector3().subVectors(bestTri[2], bestTri[0]));
  if (normal.lengthSq() < 1e-18) return null;
  normal.normalize();
  /* Face the normal back toward where the ray came from, so "outward" is
   * unambiguous regardless of the bake's winding. */
  if (normal.dot(direction) > 0) normal.negate();
  return { point, normal, distance: bestT };
}

/* Project a sample list into the measured frame, origin at the head centroid.
 * f = along the body toward the nose, u = dorsal, s = lateral. */
function project(points, frame) {
  const out = [];
  const v = new THREE.Vector3();
  for (const p of points) {
    v.set(p[0] - frame.headCentroid.x, p[1] - frame.headCentroid.y, p[2] - frame.headCentroid.z);
    out.push({ f: v.dot(frame.forward), u: v.dot(frame.up), s: v.dot(frame.side), p });
  }
  return out;
}

function unproject(frame, f, u, s) {
  return new THREE.Vector3()
    .copy(frame.headCentroid)
    .addScaledVector(frame.forward, f)
    .addScaledVector(frame.up, u)
    .addScaledVector(frame.side, s);
}

function extent(list, key) {
  let lo = Infinity, hi = -Infinity;
  for (const q of list) { const v = q[key]; if (v < lo) lo = v; if (v > hi) hi = v; }
  return { lo, hi, span: Math.max(hi - lo, 1e-9) };
}

/* A slice of the head at one station along the body, returning the dorsal
 * range and the half-width there. The half-width is sampled only among points
 * near the requested dorsal height, for the same reason Rev 13's
 * faceSkinnedBand does it: a shark head is widest at the cheek, and seating
 * an eye or a tooth at the cheek width puts it in open water beside the face.
 */
function slice(projected, f, tolerance, uFraction) {
  const near = [];
  let nearest = Infinity, fallback = null;
  for (const q of projected) {
    const d = Math.abs(q.f - f);
    if (d <= tolerance) near.push(q);
    if (d < nearest) { nearest = d; fallback = q; }
  }
  if (!near.length) { if (!fallback) return null; near.push(fallback); }
  const u = extent(near, 'u');
  let side = 0;
  if (uFraction === null || uFraction === undefined) {
    for (const q of near) side = Math.max(side, Math.abs(q.s));
  } else {
    const target = u.lo + u.span * uFraction, window = u.span * 0.30;
    for (const q of near) if (Math.abs(q.u - target) <= window) side = Math.max(side, Math.abs(q.s));
    if (side <= 0) for (const q of near) side = Math.max(side, Math.abs(q.s));
  }
  return { uMin: u.lo, uMax: u.hi, uSpan: u.span, side: Math.max(side, tolerance * 0.20), count: near.length };
}

/* ---------------------------------------------------------------------- *
 * Finding the painted eye
 * ---------------------------------------------------------------------- */

/* A baked shark has its eye painted into the diffuse as a dark blob on the
 * side of the head. If it is detectable we seat the geometry eye exactly
 * there, which is what stops the overlay from disagreeing with the skin it
 * sits on. The search is deliberately narrow - forward half of the head,
 * upper flank, one side - because the mouth and the gill slits are also dark
 * and both would out-vote a real eye over the whole head.
 *
 * Returns { f, u } in frame coordinates, or null when the texture is not
 * readable (a Node run, a CORS-tainted canvas, a bake with no eye painted),
 * in which case the caller falls back to the head-band geometry estimate.
 */
function detectPaintedEye(body, frame, projected, headExtentF, headExtentU) {
  const material = Array.isArray(body.material) ? body.material[0] : body.material;
  const map = material?.map;
  const image = map?.image;
  if (!image || !image.width || !image.height) return null;
  const uv = body.geometry.getAttribute('uv');
  if (!uv) return null;

  let data = null, width = 0, height = 0;
  try {
    const canvas = typeof document !== 'undefined' && document.createElement ? document.createElement('canvas') : null;
    if (!canvas) return null;
    /* One downsampled read is plenty: an eye is a large feature at this
     * scale, and a 256px read keeps the whole probe well under a frame. */
    const scale = Math.min(1, 256 / Math.max(image.width, image.height));
    width = Math.max(8, Math.round(image.width * scale));
    height = Math.max(8, Math.round(image.height * scale));
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(image, 0, 0, width, height);
    data = context.getImageData(0, 0, width, height).data;
  } catch (error) { return null; }
  if (!data) return null;

  /* Search window, in frame fractions: the forward 55% of the head, above the
   * mouth line, on the +side flank. */
  const fMin = headExtentF.lo + headExtentF.span * 0.45;
  const uMin = headExtentU.lo + headExtentU.span * 0.42;

  let best = null;
  const position = body.geometry.getAttribute('position');
  let luminanceSum = 0, luminanceCount = 0;
  const candidates = [];
  for (let i = 0; i < projected.length; i++) {
    const q = projected[i];
    if (q.f < fMin || q.u < uMin || q.s <= 0) continue;
    const index = q.p[4];
    if (index === undefined) continue;
    const u = uv.getX(index), v = uv.getY(index);
    const px = clamp(Math.round(u * (width - 1)), 0, width - 1);
    const py = clamp(Math.round((1 - v) * (height - 1)), 0, height - 1);
    const o = (py * width + px) * 4;
    const luminance = (data[o] * 0.2126 + data[o + 1] * 0.7152 + data[o + 2] * 0.0722) / 255;
    luminanceSum += luminance; luminanceCount++;
    candidates.push({ q, luminance });
  }
  if (candidates.length < 12 || !luminanceCount) return null;
  const mean = luminanceSum / luminanceCount;
  let variance = 0;
  for (const c of candidates) { const d = c.luminance - mean; variance += d * d; }
  const deviation = Math.sqrt(variance / candidates.length);
  /* A painted eye is a genuinely dark outlier against the flank. If nothing
   * on the flank is meaningfully darker than the flank average, there is no
   * eye to find and the geometry estimate is the honest answer. */
  if (deviation < 0.02) return null;
  const threshold = mean - deviation * 1.35;

  let sumF = 0, sumU = 0, weight = 0, darkest = Infinity;
  for (const c of candidates) {
    if (c.luminance > threshold) continue;
    const w = (threshold - c.luminance) + 1e-4;
    sumF += c.q.f * w; sumU += c.q.u * w; weight += w;
    darkest = Math.min(darkest, c.luminance);
  }
  if (weight <= 0) return null;
  const f = sumF / weight, u = sumU / weight;
  /* Reject a "detection" that is really the mouth line or the gills: it must
   * land in the forward-upper quadrant we asked for. */
  if (!(f >= fMin && u >= uMin)) return null;
  best = { f, u, contrast: mean - darkest, mean, deviation, samples: candidates.length };
  return best;
}

/* ---------------------------------------------------------------------- *
 * Geometry builder (mirrors the Rev 13 face batch contract)
 * ---------------------------------------------------------------------- */

function faceBuilder() {
  const positions = [], indices = [], skinIndices = [], skinWeights = [], kinds = [], edges = [];
  let weights = [[0, 1]];
  const setWeights = (w) => { weights = w; };
  const vertex = (x, y, z, kind = 0, edge = 1) => {
    positions.push(x, y, z);
    const ids = [0, 0, 0, 0], values = [0, 0, 0, 0];
    let total = 0;
    for (let i = 0; i < Math.min(4, weights.length); i++) { ids[i] = weights[i][0]; values[i] = weights[i][1]; total += values[i]; }
    const inv = total > 1e-6 ? 1 / total : 1;
    for (let i = 0; i < 4; i++) { skinIndices.push(ids[i]); skinWeights.push(values[i] * inv); }
    kinds.push(kind); edges.push(edge);
    return positions.length / 3 - 1;
  };
  const vertexAt = (vector, kind = 0, edge = 1) => vertex(vector.x, vector.y, vector.z, kind, edge);
  const tri = (a, b, c) => indices.push(a, b, c);
  const geometry = () => {
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    out.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    out.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
    out.setAttribute('rfFaceKind', new THREE.Float32BufferAttribute(kinds, 1));
    out.setAttribute('rfFaceEdge', new THREE.Float32BufferAttribute(edges, 1));
    out.setIndex(indices); out.computeVertexNormals(); out.computeBoundingBox(); out.computeBoundingSphere();
    return { geometry: out, triangles: indices.length / 3, vertices: positions.length / 3 };
  };
  return { vertex, vertexAt, tri, setWeights, geometry };
}

/* A disc lying in the frame's (forward, up) plane at lateral offset s. */
function frameDisc(builder, frame, matrix, f, u, s, radiusF, radiusU, kind, segments = 12, edge = 1) {
  const center = builder.vertexAt(unproject(frame, f, u, s).applyMatrix4(matrix), kind, edge);
  const ring = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * TAU;
    ring.push(builder.vertexAt(
      unproject(frame, f + Math.cos(a) * radiusF, u + Math.sin(a) * radiusU, s).applyMatrix4(matrix), kind, edge));
  }
  for (let i = 0; i < segments; i++) builder.tri(center, ring[i], ring[(i + 1) % segments]);
  return ring;
}

/* A dome whose base ring sits at sBase and whose tip pushes out to sTip, so
 * the eyeball reads as proud of the socket rather than as a decal. */
function frameDome(builder, frame, matrix, f, u, sBase, sTip, radiusF, radiusU, kind, segments = 12) {
  const tip = builder.vertexAt(unproject(frame, f, u, sTip).applyMatrix4(matrix), kind);
  const ring = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * TAU;
    ring.push(builder.vertexAt(
      unproject(frame, f + Math.cos(a) * radiusF, u + Math.sin(a) * radiusU, sBase).applyMatrix4(matrix), kind));
  }
  for (let i = 0; i < segments; i++) builder.tri(tip, ring[i], ring[(i + 1) % segments]);
  return ring;
}

/* A free-standing tooth wedge: its own base quad plus a tip, so neighbours
 * show a real modelled gap instead of fusing into a machined grille. Authored
 * in frame coordinates and transformed by `matrix` (the owning bone inverse).
 */
function frameTooth(builder, frame, matrix, f, halfF, u, uTip, sOuter, sInner) {
  const corner = (ff, uu, ss) => unproject(frame, ff, uu, ss).applyMatrix4(matrix);
  const b0 = builder.vertexAt(corner(f - halfF, u, sOuter), FACE_KIND.tooth);
  const b1 = builder.vertexAt(corner(f - halfF, u, sInner), FACE_KIND.tooth);
  const b2 = builder.vertexAt(corner(f + halfF, u, sInner), FACE_KIND.tooth);
  const b3 = builder.vertexAt(corner(f + halfF, u, sOuter), FACE_KIND.tooth);
  const tip = builder.vertexAt(corner(f, uTip, (sOuter + sInner) * 0.5), FACE_KIND.tooth);
  const base = [b0, b1, b2, b3];
  for (let i = 0; i < 4; i++) builder.tri(base[i], base[(i + 1) % 4], tip);
  builder.tri(base[0], base[2], base[1]); builder.tri(base[0], base[3], base[2]);
}

/* ---------------------------------------------------------------------- *
 * Material
 * ---------------------------------------------------------------------- */

/* Which rows are allowed to look unreal.
 *
 * Rev 15 owner override: "sharks look like they are from the Avatar movie,
 * weird hybrid nonsense, just make them look like sharks." A row that is
 * supposed to BE a species - a great white, a tiger, a hammerhead - has to be
 * recognizable from a photo first and cartoon-exaggerated second, which rules
 * out the glowing coloured iris the Rev 13 material gave every row.
 *
 * eyeColorOf() in shark3d.js hands this module a saturated hue per row
 * (greatwhite 0x8bdcff cyan, tiger 0x79e85b green, hammerhead 0xd9f25b
 * yellow-green). That resolver is not this lane's file, so rather than change
 * what it returns, the material decides what the iris is ALLOWED to be: only
 * the god and demon classes - explicitly mythological, never claiming to be a
 * photographed animal - keep a coloured iris, and even they lose the emissive
 * bloom. Every real-species row gets a shark's eye: near black, with a dark
 * amber cast kept only where the row's own colour was already warm, so a
 * lemon or a nurse shark still differs from a blue.
 */
function irisFor(def, eyeColor) {
  const mythic = def?.cls === 'god' || def?.cls === 'demon';
  if (mythic) return eyeColor ? eyeColor.clone() : new THREE.Color(0xffc94a);
  const hsl = { h: 0, s: 0, l: 0 };
  (eyeColor || new THREE.Color(0x2a2016)).getHSL(hsl);
  /* Warm hues (amber/brown, roughly 0.02..0.14) keep a trace of their colour;
   * the cyans and greens that read as alien go all the way to neutral dark. */
  const warm = hsl.h > 0.02 && hsl.h < 0.14;
  return new THREE.Color().setHSL(warm ? hsl.h : 0.075, warm ? 0.42 : 0.10, 0.085);
}

/* The face batch owns its own material so the eye can escape the body's
 * palette tint. It carries `rfTextured` so the textured-row selftest clause
 * ("every material on a textured row is a textured material") still passes
 * with the overlay mounted, and it is Standard/Physical and front-sided for
 * the same reason.
 */
export function texturedFaceMaterial(def, palette, eyeColor) {
  const base = palette?.base ? palette.base.clone() : new THREE.Color(0x6a7a86);
  const iris = irisFor(def, eyeColor);
  const mythic = def?.cls === 'god' || def?.cls === 'demon';
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(1, 1, 1), roughness: 0.34, metalness: 0.0, side: THREE.DoubleSide
  });
  material.name = `RF O2 textured face ${def?.id || 'unknown'}`;
  const uniforms = {
    uRfFaceIris: { value: iris },
    uRfFaceSocket: { value: base.clone().multiplyScalar(0.30) },
    uRfFaceBrowColor: { value: base.clone().multiplyScalar(0.48) },
    uRfFaceLidTint: { value: base.clone().multiplyScalar(0.78) },
    /* Gums read PALE - a shark's gum line is a washed pinkish grey, not the
     * red-red the brief explicitly rejects. */
    uRfFaceGum: { value: new THREE.Color(0xb08d86) },
    /* The throat behind the teeth: near black, so an open jaw reads as a hole
     * rather than as a painted stripe. */
    /* Dark MAROON, per the brief, not neutral black: at the 380 px crop a
     * pure-black cavity reads as a hole punched in the render (and is
     * indistinguishable from the pupil), while a desaturated maroon reads as
     * the inside of a mouth. Kept dark enough that the tooth rows in front of
     * it are the brightest thing in the mouth by a wide margin, which is what
     * makes the teeth pop in the reference. */
    uRfFaceCavity: { value: new THREE.Color(0x2a1014) },
    /* Only the mythic rows keep any iris emission, and far weaker than the
     * 0.38 that turned every eye into a lamp. */
    uRfFaceIrisGlow: { value: mythic ? 0.14 : 0.0 }
  };
  material.userData.rfFaceUniforms = uniforms;
  /* Declared so the row-level textured material gate keeps passing: this IS a
   * material on a textured row, it just paints a face rather than skin. */
  material.userData.rfTextured = true;
  material.userData.rfTexturedFace = true;
  material.userData.rfHasDiffuse = true;
  material.userData.rfHasNormalMap = true;
  material.onBeforeCompile = (shader) => {
    for (const [name, uniform] of Object.entries(uniforms)) shader.uniforms[name] = uniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float rfFaceKind;\nattribute float rfFaceEdge;\nvarying float vRfFaceKind;\nvarying float vRfFaceEdge;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRfFaceKind = rfFaceKind;\nvRfFaceEdge = rfFaceEdge;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRfFaceIris;\nuniform vec3 uRfFaceSocket;\nuniform vec3 uRfFaceBrowColor;\nuniform vec3 uRfFaceLidTint;\nuniform vec3 uRfFaceGum;\nuniform vec3 uRfFaceCavity;\nuniform float uRfFaceIrisGlow;\nvarying float vRfFaceKind;\nvarying float vRfFaceEdge;')
      .replace('#include <color_fragment>', [
        '#include <color_fragment>',
        'float rfK = vRfFaceKind;',
        'if (rfK < 0.5) diffuseColor.rgb = uRfFaceSocket * mix(0.85, 1.25, vRfFaceEdge);',
        /* Sclera. A shark shows almost no white - the visible ball is dark,
         * lifting only slightly toward the rim - so this is a DARK ball with
         * a faint tint, not the near-white eyeball of Rev 13. That near-white
         * sclera is a MAMMAL's eye, and is a large part of why these heads
         * read as humanoid hybrids. */
        /* Rev 15: the edge term carries a much wider range so the IRIS RING
         * (emitted with rfFaceEdge = 0) is a genuinely dark annulus while the
         * ball's own rim (edge = 1) still lifts toward the skin. At the old
         * 0.10..0.26 span the ring and the ball differed by 16% of one mix
         * and were indistinguishable at crop size, which is half of why the
         * eye read as a featureless dot. */
        'else if (rfK < 1.5) diffuseColor.rgb = mix(uRfFaceIris * 0.55, uRfFaceLidTint, 0.04 + 0.42 * vRfFaceEdge);',
        /* Pupil: the darkest thing on the head. */
        'else if (rfK < 2.5) diffuseColor.rgb = uRfFaceIris * 0.16;',
        /* Specular highlight: pure white, and the ONLY bright pixel in the
         * eye. This is what the rendered-pixel gate looks for. */
        'else if (rfK < 3.5) diffuseColor.rgb = vec3(1.0);',
                /* Brow blends toward the surrounding skin instead of painting a flat
         * block, so the ridge reads as a shadowed swell. */
        'else if (rfK < 4.5) diffuseColor.rgb = mix(uRfFaceLidTint, uRfFaceBrowColor, 0.55);',
        /* Teeth: white, faintly warm, brighter toward the tip. */
        'else if (rfK < 5.5) diffuseColor.rgb = mix(vec3(0.82, 0.81, 0.76), vec3(0.99, 0.99, 0.96), vRfFaceEdge);',
        /* Lip / gum line: pale, never red-red. */
        'else if (rfK < 6.5) diffuseColor.rgb = uRfFaceGum;',
        /* Mouth cavity. */
        'else diffuseColor.rgb = uRfFaceCavity;'
      ].join('\n'));
    /* The cavity is MATTE. The batch material is roughness 0.34 so the eye
     * and the teeth read wet, but a specular highlight sliding across the
     * inside of the mouth destroys the "this is a hole" read the cavity
     * exists to create - it makes the sheet look like a painted panel. Drive
     * roughness to 1 for the cavity kind only, after the material's own
     * roughness has been resolved. */
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <roughnessmap_fragment>', [
        '#include <roughnessmap_fragment>',
        'roughnessFactor = mix(roughnessFactor, 1.0, step(6.5, vRfFaceKind));'
      ].join('\n'));
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <emissivemap_fragment>', [
        '#include <emissivemap_fragment>',
        'float rfIris = step(1.5, vRfFaceKind) - step(2.5, vRfFaceKind);',
        'float rfSpec = step(2.5, vRfFaceKind) - step(3.5, vRfFaceKind);',
        /* Real-species rows pass uRfFaceIrisGlow = 0, so their eye is lit by
         * the scene only and can never bloom. */
        'totalEmissiveRadiance += uRfFaceIris * rfIris * uRfFaceIrisGlow;',
        /* The highlight is emissive so it survives a shaded, fogged frame: a
         * purely lit white disc washes out to the water value at gameplay
         * distance, which is how the r14 eye-highlight gate failed on the
         * photo rows. Raised from 0.55 because it is now the sole bright
         * pixel in the eye and has to carry the read alone. */
        'totalEmissiveRadiance += vec3(1.0) * rfSpec * 0.95;'
      ].join('\n'));
  };
  /* Bumped for the GRIN pass (iris ring edge range, matte cavity branch). The
   * old program is otherwise silently reused and NONE of the above appears -
   * this has cost this lane a full evidence cycle before. */
  material.customProgramCacheKey = () => 'rf-o2-textured-face:rf-tex4-r15-grin';
  material.needsUpdate = true;
  return material;
}

/* ---------------------------------------------------------------------- *
 * Build
 * ---------------------------------------------------------------------- */

const cache = new WeakMap();

/* Measure a textured head and build the face geometry for it.
 * Exported separately from the mount so the gates can be run headlessly. */
export function texturedFaceGeometry(body, def, profile = null) {
  const samples = skinnedSamples(body);
  if (!samples) return null;
  /* Remember each sample's vertex index so the painted-eye probe can look up
   * that vertex's UV. */
  for (let i = 0; i < samples.all.length; i++) samples.all[i][4] = i;

  const frame = headFrame(body, samples);
  if (!frame) return null;

  const headProjected = project(samples.head, frame);
  const jawProjected = project(samples.jaw, frame);
  const allProjected = project(samples.all, frame);
  const headF = extent(headProjected, 'f'), headU = extent(headProjected, 'u');
  const jawF = extent(jawProjected, 'f');
  const bodyF = extent(allProjected, 'f');
  /* The head span is the scale EVERYTHING is expressed against. Using the
   * body span instead is the Rev 13 bug that inflated teeth on the bulky
   * rows, whose head is a far larger fraction of the body. */
  const headSpan = Math.max(headF.span, 1e-9);

  const face = profile?.face || { eye: 1, brow: 0, pupil: 1, gape: 0, tilt: 0 };
  const eyeScale = clamp(finite(face.eye, 1), 0.34, 1.45);
  const browAmount = clamp(finite(face.brow, 0), -1, 1);
  const pupilScale = clamp(finite(face.pupil, 1), 0.60, 1.50);
  const tilt = clamp(finite(face.tilt, 0), -1, 1);

  const bones = body.skeleton?.bones || [];
  const headBone = bones[samples.headIndex], jawBone = bones[samples.jawIndex];
  const boneInverse = (bone) => bone
    ? new THREE.Matrix4().multiplyMatrices(body.bindMatrixInverse, bone.matrixWorld).invert()
    : new THREE.Matrix4();
  const headInverse = boneInverse(headBone), jawInverse = boneInverse(jawBone);

  const builder = faceBuilder();

  /* ---- eyes ---- */

  /* Start from geometry: an eye sits in the forward-upper quadrant of the
   * head. Then let the painted eye override it when the diffuse can be read,
   * which is the case that actually makes the overlay agree with the skin. */
  let eyeF = headF.lo + headF.span * 0.66;
  let eyeU = headU.lo + headU.span * 0.68;
  let eyeSource = 'head-band geometry';
  const painted = detectPaintedEye(body, frame, allProjected, headF, headU);
  if (painted) {
    eyeF = painted.f; eyeU = painted.u; eyeSource = 'painted diffuse';
  }
  /* Nudge along the body by the row's tilt so a mean row's eye reads slightly
   * further forward, the same expression hook the Sharky path uses. */
  eyeF += headSpan * 0.010 * tilt;

  /* The dorsal height above is a fraction of the head's OVERALL up extent,
   * which is only the eye line on a head whose profile happens to match the
   * one those fractions were tuned on. On a tall or blunt skull it lands
   * above the skin: measured eye-seat medians of 0.13-0.26 of a head span on
   * bullhead, smoothhound, tigershark and whitepointer, against 0.04-0.06 on
   * the rows that fit.
   *
   * So rather than trusting the fraction, seat the eye on the surface: take
   * the slice of head at the eye station and pick the dorsal height whose
   * flank is widest, i.e. the cheek. That is where an eye sits on a real
   * shark, and it is defined on every skull shape. The fraction above is kept
   * only as the starting station along the body. */
  const eyeSliceTolerance = headSpan * 0.09;
  {
    const near = [];
    for (const q of headProjected) if (Math.abs(q.f - eyeF) <= eyeSliceTolerance) near.push(q);
    if (near.length >= 8) {
      const u = extent(near, 'u');
      /* Bucket the slice by dorsal height and take the widest bucket in the
       * upper half of the head, so the cheek wins and the throat does not. */
      const buckets = 12;
      const widest = new Array(buckets).fill(0);
      for (const q of near) {
        const b = clamp(Math.floor(((q.u - u.lo) / u.span) * buckets), 0, buckets - 1);
        widest[b] = Math.max(widest[b], Math.abs(q.s));
      }
      let bestBucket = -1, bestWidth = -Infinity;
      for (let b = Math.floor(buckets * 0.45); b < buckets; b++) {
        if (widest[b] > bestWidth) { bestWidth = widest[b]; bestBucket = b; }
      }
      if (bestBucket >= 0) {
        const seated = u.lo + u.span * ((bestBucket + 0.5) / buckets);
        /* A painted-eye detection is a stronger signal than the cheek
         * heuristic, so it is only nudged toward the seated height rather
         * than overridden. */
        eyeU = painted ? eyeU * 0.35 + seated * 0.65 : seated;
      }
    }
  }

  /* Half-width measured AT the seated dorsal height, not at the slice's
   * widest point: seating the eye on the cheek width when the eye line is
   * elsewhere is what leaves it hanging beside the face. */
  /* Rev 15: the half-width is measured against the WHOLE body cloud at the eye
   * station, not against the Head-bone cloud alone.
   *
   * The head cloud is a thresholded, one-sided sample, and on the softly
   * weighted bakes it is far too sparse to describe a cross-section. Measured
   * head points, and the half-width each cloud yields as a fraction of the
   * head span:
   *
   *     reef        1416 pts   0.195      plausible
   *     tiger       1489 pts   0.267      plausible
   *     hammerhead  1588 pts   0.490      plausible (cephalofoil)
   *     greatwhite  1162 pts   0.293      plausible
   *     megalodon    282 pts   0.019   <- a head 2% as wide as it is long
   *     typhonmaw    282 pts   0.019   <- same bake family
   *
   * A 0.019 half-width is not a shark, it is an artifact of the >0.5 weight
   * cut selecting a sliver. The eye was then seated 0.019 out while its own
   * radius was 0.047, so it hung in open water beside the skull - that is the
   * megalodon/typhonmaw silhouette failure (5-8% of face pixels inside the
   * mask).
   *
   * The body cloud at the same station is dense on every bake and describes
   * the true cross-section, so the seat is taken from it and the head cloud is
   * kept only for the dorsal extent. */
  const eyeBand = (() => {
    const near = [];
    for (const q of headProjected) if (Math.abs(q.f - eyeF) <= eyeSliceTolerance) near.push(q);
    if (near.length < 8) return null;
    const u = extent(near, 'u');
    const window = u.span * 0.16;
    /* Widest lateral reach of the FULL body at this station and dorsal band.
     *
     * The station tolerance is widened until the slice actually contains
     * enough points to describe a cross-section. On the sparse bakes the
     * nominal tolerance selects a handful of vertices whose lateral spread is
     * meaningless, which is what produced the 0.019 half-width; on the dense
     * ones the first pass already succeeds and nothing changes. */
    let side = 0;
    for (let pass = 0; pass < 4 && side <= 0; pass++) {
      const tol = eyeSliceTolerance * (1 + pass);
      const band = window * (1 + pass);
      let count = 0;
      let widest = 0;
      for (const q of allProjected) {
        if (Math.abs(q.f - eyeF) > tol) continue;
        if (Math.abs(q.u - eyeU) > band) continue;
        count++;
        const a = Math.abs(q.s);
        if (a > widest) widest = a;
      }
      /* A cross-section described by fewer than 24 vertices is noise, not a
       * measurement: keep widening rather than trusting it. */
      if (count >= 24) side = widest;
    }
    /* Widen the dorsal window before falling back to the whole station, so a
     * thin band never silently becomes "the widest point of the head". */
    if (side <= 0) {
      for (const q of allProjected) {
        if (Math.abs(q.f - eyeF) > eyeSliceTolerance) continue;
        if (Math.abs(q.u - eyeU) > u.span * 0.45) continue;
        const a = Math.abs(q.s);
        if (a > side) side = a;
      }
    }
    if (side <= 0) for (const q of near) side = Math.max(side, Math.abs(q.s));
    return { uMin: u.lo, uMax: u.hi, uSpan: u.span, side: Math.max(side, eyeSliceTolerance * 0.20), count: near.length };
  })();
  if (!eyeBand) return null;
  /* Half-width of the head AT the eye line. This is the surface the eye must
   * sit on, and it is why the eye scales with the measured head rather than
   * with the body. */
  const skinS = eyeBand.side;
  /* The eye is sized against the head, but only WEAKLY against the head's
   * width. Scaling it linearly by the measured half-width double-counts the
   * skull - the half-width itself already ranges 0.10..0.27 of a head span
   * across the baked line - and produced a 3.49x spread in relative eye size,
   * from 0.035 of a head span on whitepointer rows to 0.122 on tiger_nu ones.
   * At gameplay size the small end simply reads as no eye at all, which is
   * the opposite of the brief's big expressive eyes.
   *
   * The width term is therefore taken to a fractional power and clamped hard,
   * so a genuinely broad skull still gets a slightly larger eye without the
   * narrow rows collapsing. The base fraction is raised to match: an eye is a
   * feature you are meant to read at 253 CSS px of shark, not a rivet. */
  const widthRatio = skinS / Math.max(headSpan, 1e-9);
  const headScale = clamp(Math.pow(widthRatio / 0.19, 0.35), 0.86, 1.22);

  /* ---- eye seating by ray cast against the posed head surface ----
   *
   * Every earlier revision seated the eye against a SCALAR half-width taken
   * from a slice of the vertex cloud, and no constant could satisfy both
   * failure modes across bakes of different width: proud enough to read on a
   * thin skull meant the rim crossed the silhouette on a round one, and sunk
   * enough to stay inside the round one meant the batch vanished into the
   * thin one. Both states are in the r15 run log.
   *
   * The fix is to stop guessing where the skin is and go and find it. A ray
   * is cast from the head's CENTRELINE at the eye station outward along the
   * frame's lateral axis; the hit is the actual skin under this eye, and the
   * hit normal is which way "out" points there. The eye is then sized against
   * the distance to that hit and its centre pushed back INSIDE the hull along
   * the normal, so the rim is geometrically inboard of the silhouette rather
   * than inboard of an average.
   *
   * `castRay` returns null when the ray misses (a hole in the bake, a station
   * past the snout tip); the band half-width is the fallback so a miss is a
   * slightly worse seat rather than no eye. */
  const surface = headSurface(body, samples, samples.skinVertex, frame, headSpan);

  /* THE RAY ORIGIN HAS TO BE VALIDATED BEFORE THE CAST IS TRUSTED.
   *
   * `unproject(frame, eyeF, eyeU, 0)` is meant to be the head's CENTRELINE at
   * the eye station, and on a densely weighted bake it is. On a sparse one it
   * is not: the whitepointer family carries 282 head-weighted vertices against
   * reef's 1416, so `headCentroid`, `eyeF` and `eyeU` are all derived from a
   * cloud too thin to describe the skull, and the nominal centreline point
   * lands OUTSIDE the mesh. A ray fired from outside then reports its first
   * exit as the "far flank", giving a local half-width of 0.0057 against a
   * head span of 0.3472 - a head 1.6% as wide as it is long. The eye was sized
   * and seated from that, which is why megalodon and typhonmaw rendered
   * entirely in open water (every rfFaceKind 0.000 inside the silhouette).
   *
   * An origin inside the hull has a signature: casting both lateral
   * directions from it hits on OPPOSITE sides, and the two distances sum to a
   * plausible width. That is checked here, and when it fails the origin is
   * moved to the medial axis of a coarse slice of ALL vertices at that
   * station - not the head-weighted subset, which is exactly the data that is
   * unreliable on these rows - and the cast is retried. */
  /* Plausibility bar for a head's lateral width at the eye.
   *
   * Deriving it from eyeBand.uSpan was circular: that span comes from the same
   * head cloud whose unreliability is the thing being guarded against, so on
   * the sparse bakes a nonsense width cleared a nonsense bar. headU.span is
   * the head's own dorsal extent and headSpan its length, both measured over
   * the (now repaired) cloud, and a shark's head is not narrower than about a
   * tenth of its length anywhere an eye sits. */
  const localHeadHeight = headU.span;
  const minPlausibleWidth = Math.max(headSpan * 0.10, 1e-6);

  /* Medial point of the slab of ALL vertices at a station: the midpoint of the
   * lateral extremes, at the requested dorsal height. `samples.all` is the
   * full mesh, so this is dense on every bake in the line. */
  const medialOrigin = (stationF, dorsalU) => {
    const tolF = headSpan * 0.10;
    const tolU = Math.max(localHeadHeight * 0.22, headSpan * 0.06);
    let sMin = Infinity, sMax = -Infinity, n = 0;
    for (const q of allProjected) {
      if (Math.abs(q.f - stationF) > tolF) continue;
      if (Math.abs(q.u - dorsalU) > tolU) continue;
      if (q.s < sMin) sMin = q.s;
      if (q.s > sMax) sMax = q.s;
      n++;
    }
    if (n < 8 || !Number.isFinite(sMin) || !Number.isFinite(sMax)) return null;
    return { s: (sMin + sMax) * 0.5, width: sMax - sMin, count: n };
  };

  /* Cast both ways from one origin and report whether the pair is coherent. */
  const castPair = (originS) => {
    if (!surface) return null;
    const origin = unproject(frame, eyeF, eyeU, originS);
    const out = [];
    for (const side of [-1, 1]) {
      const direction = frame.side.clone().multiplyScalar(side).normalize();
      out.push(castRay(surface, origin, direction, headSpan * 4));
    }
    if (!out[0] || !out[1]) return { hits: out, ok: false, width: 0, originS };
    /* Opposite sides by construction of the two directions; what has to be
     * checked is that the total width is physically plausible for a head. */
    const width = out[0].distance + out[1].distance;
    return { hits: out, ok: width >= minPlausibleWidth, width, originS };
  };

  /* VALIDATE THE EYE STATION ITSELF, not only the ray origin.
   *
   * eyeU comes from a cheek-width heuristic over the head cloud. When that
   * cloud has just been rebuilt geometrically (the sparse-bake repair in
   * skinnedSamples) its dorsal extent covers more of the body than the old
   * strip did, and the heuristic lands high: measured on megalodon after the
   * repair, eyeU sat at 0.89 of the head's height, where a lateral cast finds
   * ZERO width because that is above the skull entirely.
   *
   * A station that cannot be cast through is not a station. Sweep the dorsal
   * range, keep the heights where a two-sided cast actually returns a
   * plausible width, and move eyeU to the widest of them - which is the cheek,
   * which is where an eye belongs. Only applied when the current eyeU fails,
   * so the dense rows keep the seat their own geometry chose. */
  const widthAt = (stationF, dorsalU) => {
    if (!surface) return 0;
    const o = unproject(frame, stationF, dorsalU, 0);
    const a = castRay(surface, o, frame.side.clone().multiplyScalar(-1).normalize(), headSpan * 4);
    const b = castRay(surface, o, frame.side.clone().normalize(), headSpan * 4);
    return (a && b) ? a.distance + b.distance : 0;
  };
  if (surface && widthAt(eyeF, eyeU) < minPlausibleWidth) {
    /* Search the station AND the height together. Fixing only the height is
     * not enough when the station itself is past the point where the skull has
     * any width: on megalodon the eye station sat at 0.66 of the head extent,
     * where the widest cast anywhere in the dorsal range is 0.030 against a
     * head that reaches 0.197 further back. Both coordinates come from the
     * same unreliable cloud, so both are re-derived against the surface.
     *
     * The search is biased forward - an eye belongs on the front of the head,
     * not the middle - by walking stations from the nose backwards and taking
     * the FIRST that clears the plausibility bar with a comfortable margin,
     * rather than the globally widest, which would drift toward the gills. */
    let chosenF = null, chosenU = null;
    for (let i = 0; i <= 12 && chosenF === null; i++) {
      /* 0.80 down to 0.20 of the head extent, nose end first. */
      const f2 = headF.lo + headF.span * (0.80 - i * 0.05);
      let bestU = null, bestW = 0;
      for (let k = 1; k < 20; k++) {
        const u = headU.lo + headU.span * (k / 20);
        const w = widthAt(f2, u);
        if (w > bestW) { bestW = w; bestU = u; }
      }
      if (bestU !== null && bestW >= minPlausibleWidth * 2) { chosenF = f2; chosenU = bestU; }
    }
    if (chosenF !== null) {
      eyeF = chosenF;
      /* Just above the widest slice: that slice is the cheek's centre and a
       * shark's eye rides a little above it. */
      const lifted = chosenU + headU.span * 0.06;
      eyeU = widthAt(chosenF, lifted) >= minPlausibleWidth ? lifted : chosenU;
      eyeSource += ' + cast-validated station';
    }
  }

  let pair = castPair(0);
  let originSource = 'frame centreline';
  if (!pair || !pair.ok) {
    const medial = medialOrigin(eyeF, eyeU);
    if (medial) {
      const retry = castPair(medial.s);
      if (retry && retry.ok) { pair = retry; originSource = 'medial axis of full-mesh slice'; }
      else if (retry && !pair) { pair = retry; originSource = 'medial axis (still incoherent)'; }
    }
  }
  /* A head whose own cloud is too sparse to trust gets the full-mesh slice
   * treatment unconditionally, even if the centreline cast looked plausible:
   * "plausible" on 282 vertices is not evidence. */
  const sparseHead = samples.head.length < 600;
  if (sparseHead && originSource === 'frame centreline') {
    const medial = medialOrigin(eyeF, eyeU);
    if (medial) {
      const retry = castPair(medial.s);
      if (retry && retry.ok && retry.width > (pair ? pair.width : 0)) {
        pair = retry; originSource = 'medial axis (sparse head)';
      }
    }
  }

  const hits = pair ? pair.hits : [null, null];
  const hitDistances = hits.filter(Boolean).map((h) => h.distance);
  /* Half-width for SIZING is half the coherent full width when we have one,
   * which is a property of the head rather than of where the ray started. */
  const localHalfWidth = (pair && pair.ok)
    ? pair.width * 0.5
    : (hitDistances.length ? Math.min(...hitDistances) : skinS);

  /* Radius: the aesthetic size, capped at 0.9 of the LOCAL half-width from the
   * cast. That cap is what stops the whitepointer family - a genuinely thin
   * bake, local half-width 0.011 of a head span against reef's 0.057 - from
   * getting an eye four times wider than the skull it sits on. */
  /* SEATING CONFIDENCE / HOLD.
   *
   * A cast that reports a head narrower than a tenth of its own length has not
   * measured a head. On the whitepointer base (25 of the 86 rows) it reports
   * 0.017-0.026, and no amount of downstream clamping makes a feature seated
   * against that number land on the skin - the rendered batch is beside the
   * head, with every rfFaceKind scoring 0.000 inside the silhouette.
   *
   * Rather than ship a face that is visibly wrong on those rows, the module
   * declares them UNSEATABLE and returns null, which is the same contract as
   * "this bake cannot be measured": shark3d keeps the Rev 14 baked face for
   * that row and every other row still gets the overlay. The threshold is a
   * MEASUREMENT, not a hardcoded id list, so a future re-bake that fixes the
   * geometry starts passing on its own with no code change. */
  const seatConfidence = localHalfWidth / Math.max(headSpan, 1e-9);
  const seatable = seatConfidence >= 0.10;

  /* Rev 15 lane GRIN: the eye is sized to the BRIEF's 0.10-0.14 of head
   * length, then capped by the flank it has to sit on.
   *
   * The r15 head crops showed the eye as "a white dot with no visible
   * iris/socket". Two causes, both here rather than in the shader:
   *
   *   1. 0.082 of a head span is the SOCKET radius, so the visible eyeball
   *      was 0.78 of that, i.e. ~0.064 of a head span across its radius -
   *      well under half the reference eye. At a 380 px crop that is a few
   *      pixels of iris, which is why no structure was readable.
   *   2. The socket cap was `localHalfWidth * 0.9`, so on the many rows whose
   *      cast half-width is small the socket collapsed and took the whole eye
   *      with it.
   *
   * The brief gives the eye as 0.10-0.14 of head LENGTH measured across the
   * whole eye, so the eyeball RADIUS is 0.05-0.07 of the head span. The
   * socket is the shaded disc BEHIND the ball and is deliberately larger, so
   * a socket rim is visible around the eye at crop size - that rim is the
   * "sunk in a shaded socket" read the brief asks for. */
  /* The clamp ceiling is 0.068, not 0.072: the brief's band is on the eye
   * DIAMETER (0.10-0.14 L), so the radius band is 0.050-0.070, and the
   * personality eyeScale/headScale product runs slightly over 1 on the
   * chunky rows. At 0.072 tiger/hammerhead/greatwhite measured 0.143-0.144 of
   * a head span across - just outside. 0.068 keeps every shipping row inside
   * the band with the personality spread intact. */
  const eyeRadiusWanted = headSpan * clamp(0.060 * eyeScale * headScale, 0.050, 0.068);
  /* The lateral cap stays TIGHT (0.55, not 0.82). The eye is a disc sunk into
   * a curved flank, so a ball sized close to the local half-width bulges out
   * as a sphere stuck on the cheek rather than an eye set into it - which is
   * exactly how reef rendered at 0.82 (a teal ball proud of the head). The
   * brief's 0.10-0.14 L is still met on every shipping row through
   * eyeRadiusWanted; this only stops a narrow flank from being overrun. */
  const eyeRadius = Math.min(eyeRadiusWanted, localHalfWidth * 0.55);
  /* Socket is 1.34x the ball: enough rim to read as a socket at 380 px
   * without the disc spilling off the cheek. */
  const socketRadius = Math.min(eyeRadius * 1.34, localHalfWidth * 0.92);

  /* Seat depths are now per-side offsets FROM THE HIT rather than absolute
   * lateral coordinates, so each flank is seated against its own surface.
   * The centre goes to hit - normal * (eyeRadius * 0.55): a sphere of radius
   * eyeRadius centred 0.55 radii inside the hull breaks the surface by 0.45
   * radii, which reads as a proud eyeball while the rim stays inside. */
  /* 0.78, not 0.55: the ball spans centre +/- eyeRadius, so an inset of 0.55
   * leaves 45% of the radius standing proud of the skin - at the larger Rev
   * 15 eye size that renders as a sphere glued to the cheek rather than an
   * eye set into it. 0.78 leaves 22% proud, which still catches a highlight
   * and still reads as a rounded eyeball, without the bulge. */
  const eyeCentreInset = eyeRadius * 0.78;
  const seatSide = (side) => {
    const hit = hits[side < 0 ? 0 : 1];
    if (hit) {
      /* Lateral coordinate of the hit, in frame space. */
      const rel = hit.point.clone().sub(frame.headCentroid);
      const hitS = rel.dot(frame.side);
      const outward = Math.sign(hitS) || side;
      return {
        skin: Math.abs(hitS),
        centre: Math.abs(hitS) - eyeCentreInset,
        outward
      };
    }
    return { skin: skinS, centre: skinS - eyeCentreInset, outward: side };
  };
  const seats = { '-1': seatSide(-1), '1': seatSide(1) };
  /* Kept for the metrics block and the socket-depth gate, which are expressed
   * against a single representative seat. */
  const seatS = Math.min(seats['-1'].skin, seats['1'].skin);
  const socketS = seatS;
  const socketFloorS = seatS - eyeCentreInset - eyeRadius * 0.42;
  const socketDepth = socketS - socketFloorS;

  const pupilOffsetU = eyeRadius * (0.20 + 0.16 * tilt);
  const pupilOffsetF = eyeRadius * (0.10 + 0.14 * tilt);
  const pupilRadius = eyeRadius * clamp(0.46 * pupilScale, 0.24, 0.66);
  /* Rev 15: the highlight is a fixed FRACTION of the eye, raised from 0.26 to
   * 0.34, and floored so it survives on a small eye.
   *
   * The rendered-pixel gate counts bright low-saturation pixels inside the
   * head crop, and at 0.26 the rows with the smallest eyes returned 17-32 px
   * where the bar is 50: greatwhite 17, hammerhead 17, typhonmaw 27,
   * megalodon 32. A catch-light that small is also the wrong art call - it is
   * the single feature that makes the eye read as wet rather than painted, and
   * the HSE reference gives it real area. The floor is expressed against the
   * head span so a row whose eye is clamped small by a narrow skull still gets
   * a highlight that exists at gameplay size. */
  /* A catch-light is a SMALL bright dot, not a second pupil.
   *
   * Chasing the >= 50 px eyecheck bar I ran this to 0.48 of the eye radius,
   * which is larger than the pupil itself (0.46) - at head-crop size that
   * reads as a flat white disc pasted over the eye, which is worse art than
   * the small highlight it replaced. The pixel bar was met by a shape that
   * fails the thing the bar is a proxy FOR.
   *
   * 0.30 keeps it clearly subordinate to the pupil while still carrying the
   * wet read, and the head-span floor is what actually rescued the small-eyed
   * rows, so that is kept. */
  /* Two constraints pull against each other here and both are legitimate:
   *
   *   - the rendered-pixel gate wants >= 50 bright px in the head crop, which
   *     on a small-eyed row means a physically larger dot;
   *   - a catch-light larger than the pupil reads as a white sticker at the
   *     760 px crop size the art is judged at. At 0.48 of eyeRadius (larger
   *     than the 0.46 pupil) that is exactly what it looked like.
   *
   * The resolution is to keep the RATIO subordinate to the pupil - so the eye
   * always reads correctly - while raising the absolute FLOOR, which is what
   * the small-eyed rows actually need. 0.36 of the eye stays clearly inside
   * the pupil; the 0.015 head-span floor is what carries greatwhite and
   * hammerhead over the bar without inflating the rows that already pass. */
  /* Rev 15 lane GRIN: the head-span FLOOR is removed.
   *
   * `Math.max(eyeRadius * 0.36, headSpan * 0.015)` is what turned the eye
   * into "a white dot with no visible iris/socket" in the r15 crops. On every
   * row whose eye was clamped small by a narrow flank the floor won, so the
   * catch-light was sized against the HEAD while the eyeball was sized
   * against the CHEEK - and since the highlight is emissive 0.95 and drawn
   * last, in front of everything, a catch-light wider than the iris paints
   * the entire eye solid white. That is exactly the defect in the evidence,
   * and it is why raising the eye size alone would not have fixed it.
   *
   * A catch-light is strictly subordinate to the pupil, always. With the eye
   * now sized to the brief (0.10-0.14 L) rather than clamped to a sliver,
   * 0.30 of the eye radius is a real, countable dot at the 380 px crop
   * without any floor propping it up. */
  const highlightRadius = eyeRadius * 0.30;
  const highlightU = pupilOffsetU + eyeRadius * 0.34;
  const highlightF = pupilOffsetF + eyeRadius * 0.30;
  /* The iris RING: a disc between the sclera and the pupil, so the eye reads
   * dark-ringed rather than as a flat ball with a dot on it. The brief asks
   * for "dark iris ring, black pupil, single highlight" as three separable
   * features, which needs three separable discs. */
  const irisRadius = eyeRadius * 0.74;
  const pupilOffset = Math.hypot(pupilOffsetU, pupilOffsetF) / Math.max(eyeRadius, 1e-9);

  for (const side of [-1, 1]) {
    builder.setWeights([[samples.headIndex, 1]]);
    const sx = side;
    /* Per-side seat: each flank is placed against the surface the ray found on
     * THAT side, so an asymmetric bake (and every one-sided head cloud in this
     * line is asymmetric) seats both eyes correctly rather than mirroring one
     * good seat onto a surface that is somewhere else. */
    const seat = seats[side < 0 ? '-1' : '1'];
    const centreS = seat.centre;
    const floorS = centreS - eyeRadius * 0.42;
    /* The ball spans centre +/- eyeRadius; its outermost point is therefore
     * centreS + eyeRadius, which sits eyeRadius*0.45 proud of the skin by
     * construction of eyeCentreInset. */
    const ballTipS = centreS + eyeRadius;
    /* SOCKET: the shading disc BEHIND the eye. 16 segments, not 12 - at the
     * 380 px crop the rim is now large enough for a dodecagon to read as
     * faceted. */
    frameDisc(builder, frame, headInverse, eyeF, eyeU, sx * floorS,
      socketRadius * 0.90, socketRadius, FACE_KIND.socket, 16, 0.25);
    frameDome(builder, frame, headInverse, eyeF, eyeU, sx * centreS, sx * ballTipS,
      eyeRadius * 0.92, eyeRadius, FACE_KIND.sclera, 16);
    /* IRIS RING between sclera and pupil. Concentric with the PUPIL rather
     * than with the ball, so the ring stays even as the pupil is offset by
     * the row's tilt. */
    frameDisc(builder, frame, headInverse, eyeF + pupilOffsetF * 0.7, eyeU + pupilOffsetU * 0.7,
      sx * (ballTipS + headSpan * 0.0012), irisRadius, irisRadius, FACE_KIND.sclera, 16, 0.0);
    frameDisc(builder, frame, headInverse, eyeF + pupilOffsetF, eyeU + pupilOffsetU,
      sx * (ballTipS + headSpan * 0.002), pupilRadius, pupilRadius, FACE_KIND.pupil, 16);
    frameDisc(builder, frame, headInverse, eyeF + highlightF, eyeU + highlightU,
      /* 14 segments, not 8: at gameplay size an octagon reads as a dot, but
       * the head crops the owner judges from are 760 px and an 8-gon catch
       * light is visibly faceted there. */
      sx * (ballTipS + headSpan * 0.004), highlightRadius, highlightRadius, FACE_KIND.highlight, 14);

    /* Brow wedge. The inner end sits higher than the outer end so the eye is
     * never framed by a symmetric hard edge; a positive brow drives down and
     * inward over the pupil, a negative one lifts and softens. */
    /* NO BROW GEOMETRY. This is a deliberate removal, not an omission.
     *
     * Rev 13 authored the brow as a flat quad standing proud of the flank.
     * Every attempt to make that read correctly failed at head-crop size, and
     * the 760 px crops are what finally showed why:
     *
     *   - proud of the skin (1.0005 of the half-width) and spanning the eye,
     *     it drew as a hard teal bar ruled straight across the pupil: its
     *     lower edge sat at eyeU + 0.02 socket radii, i.e. on the eyeball's
     *     own centre line, while the ball reaches 0.78;
     *   - lifted clear of the ball, the same quad became a teal diagonal
     *     stripe hanging above the skull - a thin plate seen edge-on, reading
     *     as a decal stuck to the head rather than as anatomy.
     *
     * A shark has no brow. What it has is a shallow supraorbital swell, and
     * that is a SHADING cue, not a piece of geometry: the socket rim and the
     * sunken eyeball already cast it. Adding a plate to say "brow" was the
     * mistake, and the honest fix is to delete it rather than keep tuning a
     * shape that has no anatomical referent. The personality `brow` column
     * still drives the squint through the socket and lid tint.
     *
     * FACE_KIND.brow is intentionally left defined: the shader branch and the
     * gates still reference it, and a future pass that models a real
     * supraorbital ridge (a swell in the skin, cast against the head surface
     * the way the eye now is) can emit it again without touching the shader. */
  }

  /* ---- teeth ---- */

  /* The mouth line is the Head/LowerJaw skin-weight overlap along the body
   * axis. On a baked rig that overlap runs back past the mouth corner into
   * the throat, so the grin uses only the forward part of it and stops short
   * of the nose tip. */
  /* On a hard-weighted bake the overlap IS the mouth. On a softly blended one
   * it is not: the LowerJaw weight peaks at the hinge rather than at the lip,
   * so the proportional cut in skinnedSamples selects throat vertices and the
   * overlap collapses behind the head. Measured along the frame's forward axis
   * (hse/probe_base.mjs), overlap span as a fraction of the head span:
   *
   *     reef / dogfish        0.141 / 0.259 = 0.54   usable
   *     tiger / tiger_nu      0.218 / 0.283 = 0.77   usable
   *     whaleshark/whitepointer 0.080 / 0.198 = 0.40  usable
   *     megalodon/megalodonrex  0.026 / 0.392 = 0.07  degenerate
   *
   * A degenerate overlap is detected rather than trusted, and the mouth falls
   * back to the forward part of the HEAD's own extent, which is where a shark
   * mouth is on any of these bakes. Guessing here is what put the megalodonrex
   * family's teeth 0.31 of a head span off the surface. */
  const overlapLo = Math.max(headF.lo, jawF.lo);
  const overlapHi = Math.min(headF.hi, jawF.hi);
  const overlapSpan = overlapHi - overlapLo;
  /* Two ways the overlap lies, and both were measured rather than guessed
   * (hse/probe_base.mjs, extents along the frame's forward axis):
   *
   *   base           head extent      jaw extent      overlap / headSpan
   *   dogfish        -0.170..0.090   -0.114..0.027    0.54   real mouth
   *   smoothhound    -0.225..0.072   -0.141..0.034    0.59   real mouth
   *   megalodonrex   -0.300..0.092   -0.670..-0.274   0.07   collapsed
   *   whitepointer   -0.113..0.088    0.006..0.088    0.41   SNOUT TIP
   *   tigershark     -0.137..0.142    0.052..0.142    0.32   SNOUT TIP
   *
   * The last two are the trap: the overlap ratio looks healthy, but the jaw
   * cloud ends flush with the head's forward tip, so the "overlap" is the
   * nose cone. Laying a grin along it put the whole row on the tip of the
   * snout, 0.22-0.31 of a head span off the surface. An overlap is therefore
   * only trusted when it is both wide enough AND actually behind the tip. */
  const tipMargin = headSpan * 0.06;
  const overlapWide = overlapSpan > 0 && overlapSpan / headSpan >= 0.18;
  const overlapBehindTip = overlapHi <= headF.hi - tipMargin;
  const overlapUsable = overlapWide && overlapBehindTip;
  /* Fallback: the forward-middle of the head, stopping short of the nose. A
   * shark's mouth is under the front half of the skull on every one of these
   * bakes, which is exactly what the working rows measure to. */
  const mouthLo = overlapUsable ? overlapLo : headF.lo + headF.span * 0.34;
  const mouthHi = overlapUsable ? overlapHi : headF.hi - headF.span * 0.10;
  if (!(mouthHi > mouthLo)) return null;
  const mouthSpan = mouthHi - mouthLo;
  const mouthSource = overlapUsable
    ? 'head/jaw weight overlap'
    : overlapWide ? 'head extent (overlap was the snout tip)' : 'head extent (degenerate overlap)';
  /* Forward-biased: the lip is toward the nose end of the mouth range. */
  const mouthStart = mouthLo + mouthSpan * 0.46;
  const mouthEnd = mouthLo + mouthSpan * 0.94;

  /* Rev 15: 9 stations per row, up from 5. The brief asks for 8-12 separated
   * teeth upper and lower, and 5 stations read at gameplay size as a handful
   * of tusks rather than as a shark's saw. toothHalfF stays a fraction of the
   * pitch, so more teeth means smaller teeth at the SAME proportional
   * separation - individually readable, never fusing into a grille. */
  const toothCount = 11;
  const toothPitch = (mouthEnd - mouthStart) / Math.max(toothCount - 1, 1);
  const bandTolerance = Math.max(toothPitch * 0.60, 1e-9);
  /* 0.34 of the pitch, so a tooth is a little over two thirds of the gap it
   * sits in: separated triangles at crop size, never a fused grille. */
  const toothHalfF = toothPitch * 0.34;
  const toothGap = toothPitch - toothHalfF * 2;

  /* Lateral half-width of the head at a given station and lip height, by ray
   * cast. Hoisted out of the tooth loop because the mouth cavity needs the
   * same measurement at its own stations - a cavity sized against anything
   * other than the surface the teeth are seated on would either float clear
   * of the jaw or punch through it. */
  const castSideAt = (stationF, u, fallback) => {
    if (!surface) return fallback;
    const origin = unproject(frame, stationF, u, 0);
    let widest = 0;
    for (const dir of [-1, 1]) {
      const hit = castRay(surface, origin, frame.side.clone().multiplyScalar(dir).normalize(),
        headSpan * 4);
      if (hit) widest = Math.max(widest, hit.distance);
    }
    return widest > 1e-9 ? widest : fallback;
  };

  let toothSeatMax = 0, placed = 0;
  /* HOLD: emit no teeth. `placed` stays 0, which the metrics below already
   * handle, and the `if (!placed) return null` guard is relaxed for the hold
   * so the EYE still ships. See RF_GRIN_MOUTH_HOLD. */
  for (let i = 0; RF_GRIN_MOUTH_HOLD ? false : i < toothCount; i++) {
    const f = mouthStart + (mouthEnd - mouthStart) * (i / Math.max(toothCount - 1, 1));
    /* Upper row reads the head band at its LOWER lip (uFraction 0.10), lower
     * row reads the jaw band at its TOP (0.90), so the two rows meet at the
     * mouth line instead of fringing under the chin. */
    const upper = slice(headProjected, f, bandTolerance, 0.10);
    /* With a degenerate overlap the jaw cloud is the throat, not the lip, so
     * the lower row seats against the head's own lower surface instead. The
     * teeth still RIDE the LowerJaw bone either way, so the grin opens with
     * the bite; only the surface they are measured onto changes. */
    const lower = overlapUsable
      ? slice(jawProjected, f, bandTolerance, 0.90)
      : slice(headProjected, f, bandTolerance, 0.02);
    if (!upper || !lower) continue;
    /* The mouth line is taken from the HEAD slice's ventral end, not from the
     * jaw cloud's dorsal end.
     *
     * `lower.uMax - span*0.16` was meant to be "the top of the lower jaw",
     * i.e. the mouth line. It is not, because the LowerJaw vertex cloud is not
     * the lip: measured on reef the jaw cloud spans world y 33.9..47.3 inside
     * a head spanning 27.9..53.2, i.e. it sits in the vertical MIDDLE of the
     * skull (it is the hinge and throat, which is exactly what
     * hse/STATUS-O2.md records as the soft-weight problem). Its uMax is
     * therefore up near the eye, and the lower tooth row was laid there -
     * the specks along the dorsal ridge in the render, and 100% of the
     * containment failure.
     *
     * The head slice's ventral end IS the mouth line on every one of these
     * bakes, so both rows are referenced to it: the upper row hangs down from
     * it and the lower row rises from just below it. The teeth still RIDE the
     * LowerJaw bone (set by builder.setWeights below), so the grin still opens
     * with the bite - only the surface they are MEASURED against changes. */
    const mouthU = upper.uMin + upper.uSpan * 0.16;
    const lipU = mouthU;
    const jawU = mouthU - upper.uSpan * 0.04;
    /* Rev 15: the lateral seat is measured, never padded UP.
     *
     * The r14 form was Math.max(slice.side * 0.90, toothPitch * 0.55), and the
     * max() is the bug the silhouette gate caught. Toward the snout the head
     * slice is genuinely narrow, so the toothPitch floor won and forced the
     * tooth WIDER than the head it is supposed to sit on - the tooth row then
     * trailed off the jaw into open water, which is most of the containment
     * failure on megalodon (11% inside) and typhonmaw (16%).
     *
     * A tooth may only ever be as wide as the surface it seats against. The
     * floor is kept solely as a degenerate-slice guard and is now a fraction
     * of the MEASURED side, so it can never exceed it. */
    /* Lateral seat per STATION, from a ray cast at that station's own lip
     * height, never a global maximum and never a pitch-derived floor.
     *
     * The r14 form was Math.max(slice.side * 0.90, toothPitch * 0.55). Toward
     * the snout the jaw is genuinely narrow, so the pitch floor won and forced
     * the tooth WIDER than the jaw it sits in - the row then trailed off into
     * open water, which was most of the megalodon/typhonmaw containment
     * failure. Casting at each station measures the jaw where the tooth
     * actually goes, so a tapering snout gets tapering teeth for free. */
    const upperSide = castSideAt(f, lipU, upper.side) * 0.90;
    const lowerSide = castSideAt(f, jawU, lower.side) * 0.90;
    /* Tooth HEIGHT is keyed to the cast half-width at this station, the same
     * way the eye is now keyed, and capped against the mouth pitch.
     *
     * Keying it to the pitch alone (r14, and r15 up to this point) is what the
     * silhouette gate was still catching. Per-kind isolation renders on
     * greatwhite scored sclera 1.000, highlight 1.000 and brow 1.000 inside
     * the outline while teeth scored 0.800 - every remaining outside pixel was
     * tooth. Tucking the rows further inboard laterally (0.86 -> 0.74 of the
     * measured jaw width) did not close it, which localises the leak to the
     * tooth TIP rather than its lateral seat: the pitch is a property of the
     * mouth's LENGTH, so on a broad jaw a pitch-derived tip is long enough to
     * cross the lip and poke through the flank.
     *
     * The half-width at the station is the dimension the tip actually has to
     * stay inside, so it bounds the height. The pitch cap is kept so a long
     * narrow snout does not grow fangs, and the taper still shortens the teeth
     * toward the corner of the mouth. */
    /* Rev 15 lane GRIN: tooth height is driven by the BRIEF's absolute bar
     * (0.035-0.05 of head length) with the geometric terms as CAPS, not the
     * other way round.
     *
     * The r15 form was `min(pitchHeight, widthHeight)`, and on a narrow snout
     * `widthHeight = min(upperSide, lowerSide) * 0.62 * ...` collapses to
     * nearly nothing - which is why the crops show no teeth at all even on
     * rows whose tooth geometry passed every containment gate. A gate that
     * only asks "is the tooth inside the silhouette" is trivially satisfied
     * by a tooth of zero height, and that is the trap this lane's new
     * tooth-white pixel gate exists to close.
     *
     * So: start from the size the reference actually shows, then clamp it by
     * the mouth pitch (a long snout must not grow fangs) and by the local
     * half-width (a tooth may never be taller than the jaw is wide, or the
     * tip pokes through the flank - the greatwhite containment leak). The
     * FLOOR is what changed: a tooth is never allowed to vanish, because an
     * invisible tooth row is the defect being fixed. */
    const taper = 1 - i / (toothCount + 2);
    const briefHeight = headSpan * 0.042 * (0.78 + 0.34 * taper);
    const pitchHeight = toothPitch * 1.05 * (0.70 + 0.55 * taper);
    const widthHeight = Math.min(upperSide, lowerSide) * 1.30 * (0.70 + 0.55 * taper);
    const height = Math.max(
      Math.min(briefHeight, pitchHeight, widthHeight),
      headSpan * 0.026 * (0.78 + 0.34 * taper));
    toothSeatMax = Math.max(toothSeatMax, Math.abs(lipU - jawU) / Math.max(mouthSpan, 1e-9));
    placed++;
    for (const side of [-1, 1]) {
      const sx = side;
      builder.setWeights([[samples.headIndex, 1]]);
      /* A tooth is INSIDE the mouth, so its outer face belongs under the lip
       * rather than flush with the silhouette - flush put it outside the
       * rendered outline once antialiasing was accounted for. */
      frameTooth(builder, frame, headInverse, f, toothHalfF,
        lipU + toothPitch * 0.10, lipU - height, sx * upperSide * 0.74, sx * upperSide * 0.52);
      builder.setWeights([[samples.jawIndex, 1]]);
      frameTooth(builder, frame, jawInverse, f, toothHalfF * 0.86,
        jawU - toothPitch * 0.10, jawU + height * 0.86, sx * lowerSide * 0.74, sx * lowerSide * 0.52);
    }
  }
  if (!placed && !RF_GRIN_MOUTH_HOLD) return null;

  /* ---- mouth cavity ---- */

  /* A dark surface spanning the gape, so an open mouth reads as a HOLE rather
   * than as a slot cut in the skin.
   *
   * This is the geometry Rev 15 declared (`FACE_KIND.cavity` plus
   * `uRfFaceCavity`) but never emitted, on the grounds that an inner mouth
   * volume is only meaningful once the batch is seated. The batch is seated
   * now, and with the rest gape from rig_morph.js the jaw hangs 22-30 degrees
   * open - so without this the viewer looks straight through the head and out
   * the other side, which is worse than the closed mouth it replaced.
   *
   * It is deliberately a SHEET, not a volume. A closed inner mouth would have
   * to be modelled against the palate and the tongue, neither of which these
   * bakes have; a sheet set back behind the tooth rows gives the same read at
   * any crop size for a fraction of the triangles, and cannot poke through
   * the flank because it is strictly inboard of the teeth.
   *
   * WEIGHTING: the sheet is split along the mouth line. Its upper half rides
   * the Head bone and its lower half rides LowerJaw, so the cavity opens and
   * closes WITH the jaw instead of tearing away from it during a bite. That
   * is the same two-bone treatment the tooth rows already use, for the same
   * reason. */
  const cavitySteps = Math.max(toothCount - 1, 4);
  /* Set back behind the teeth: the tooth rows seat at 0.74/0.52 of the local
   * half-width, so 0.40 keeps the cavity strictly inboard of every tooth. */
  const cavityInset = 0.40;
  const cavityF = (i) => mouthStart + (mouthEnd - mouthStart) * (i / cavitySteps);
  /* One quad strip per side, from the upper lip down to the lower jaw. The
   * two sides meet at the midline, closing the back of the mouth. */
  for (const side of RF_GRIN_MOUTH_HOLD ? [] : [-1, 1]) {
    const sx = side;
    for (let i = 0; i < cavitySteps; i++) {
      const f0 = cavityF(i), f1 = cavityF(i + 1);
      const upper0 = slice(headProjected, f0, bandTolerance, 0.10);
      const upper1 = slice(headProjected, f1, bandTolerance, 0.10);
      if (!upper0 || !upper1) continue;
      const lipU0 = upper0.uMin + upper0.uSpan * 0.16;
      const lipU1 = upper1.uMin + upper1.uSpan * 0.16;
      const side0 = castSideAt(f0, lipU0, upper0.side) * cavityInset;
      const side1 = castSideAt(f1, lipU1, upper1.side) * cavityInset;
      /* Cavity depth: down from the lip by the same measure the teeth use, so
       * the hole is exactly as tall as the gape the teeth frame. */
      const drop0 = headSpan * 0.052, drop1 = headSpan * 0.052;
      const corner = (matrix, f, u, s) => builder.vertexAt(
        unproject(frame, f, u, s).applyMatrix4(matrix), FACE_KIND.cavity, 0.0);
      /* Upper band on the Head bone. */
      builder.setWeights([[samples.headIndex, 1]]);
      const uA = corner(headInverse, f0, lipU0, sx * side0);
      const uB = corner(headInverse, f1, lipU1, sx * side1);
      const uC = corner(headInverse, f1, lipU1 - drop1 * 0.5, sx * side1);
      const uD = corner(headInverse, f0, lipU0 - drop0 * 0.5, sx * side0);
      /* One winding only: the batch material is already THREE.DoubleSide, so
       * emitting the mirrored triangles as well doubles the triangle count
       * for no visible change AND gives computeVertexNormals() two opposing
       * normals per vertex that average to zero - which is what would make
       * the cavity shade as a flat unlit patch rather than a dark hole. */
      builder.tri(uA, uB, uC); builder.tri(uA, uC, uD);
      /* Lower band on the LowerJaw bone, so it swings with the gape. */
      builder.setWeights([[samples.jawIndex, 1]]);
      const lA = corner(jawInverse, f0, lipU0 - drop0 * 0.5, sx * side0);
      const lB = corner(jawInverse, f1, lipU1 - drop1 * 0.5, sx * side1);
      const lC = corner(jawInverse, f1, lipU1 - drop1, sx * side1);
      const lD = corner(jawInverse, f0, lipU0 - drop0, sx * side0);
      builder.tri(lA, lB, lC); builder.tri(lA, lC, lD);
    }
  }

  /* HOLD: an unseatable row keeps the Rev 14 baked face.
   *
   * Returning null here is the module's existing "I cannot measure this bake"
   * contract, so shark3d needs no change: that row renders exactly as it does
   * today while every seatable row gets the overlay. RF_FACE_FORCE=1 builds it
   * anyway, which is how the evidence renders for a held row are produced. */
  const forceUnseatable = typeof process !== 'undefined'
    && process.env && process.env.RF_FACE_FORCE === '1';
  if (!seatable && !forceUnseatable) return null;

  const built = builder.geometry();

  /* ---- gates ---- */

  /* Every tooth is pushed through its own bone exactly the way skinning will,
   * then measured against the live head/jaw surface. A tooth that floats off
   * the snout or dangles below the chin fails this numerically, which is the
   * only way to catch it without a screenshot of every one of 86 rows. */
  const seating = (() => {
    const out = {
      maxSurfaceRatio: 0, medianSurfaceRatio: 0, outsideHeadSpan: 0, teeth: 0,
      eyeMedianSurfaceRatio: 0, eyeMaxSurfaceRatio: 0, eyes: 0
    };
    /* The head/jaw point clouds are a THRESHOLDED sample of a symmetric mesh,
     * and the threshold does not select symmetrically: measured on bullhead at
     * the forward stations the head cloud spans s = -0.0035..+0.0735, i.e. one
     * flank only. Both eyes and both tooth rows are mirrored, so half of them
     * would be measured against a surface that is simply not in the sample and
     * would read as "off the head" no matter how well they are seated.
     *
     * The shark is bilaterally symmetric about the frame's side axis, so the
     * comparison cloud is mirrored across that plane before measuring. This
     * changes only what the GATE compares against; it does not move a single
     * built vertex. */
    const mirror = (cloud) => {
      const out2 = [];
      const v = new THREE.Vector3();
      for (const q of cloud) {
        out2.push(q);
        v.set(q[0] - frame.headCentroid.x, q[1] - frame.headCentroid.y, q[2] - frame.headCentroid.z);
        const s = v.dot(frame.side);
        const m = new THREE.Vector3(q[0], q[1], q[2]).addScaledVector(frame.side, -2 * s);
        out2.push([m.x, m.y, m.z]);
      }
      return out2;
    };
    /* Everything below is measured in WORLD space, not skinned space.
     *
     * Measuring in skinned space is what made this gate a false green: the
     * group carries a non-uniform world scale (measured on reef: 107.50,
     * 107.50, 97.66), so equal skinned distances are unequal on screen, and a
     * batch sitting in open water beside the head still scored 0.018. The
     * seating claim is a claim about the rendered image, so it has to be
     * checked in the space the image is drawn in. */
    const toWorld = body.matrixWorld;
    const worldify = (cloud) => cloud.map((q) => {
      const w = new THREE.Vector3(q[0], q[1], q[2]).applyMatrix4(toWorld);
      return [w.x, w.y, w.z];
    });
    const surface = worldify(mirror(samples.head.concat(samples.jaw)));
    if (!surface.length) return out;
    const headOnly = worldify(mirror(samples.head));
    /* The scale the ratios are expressed against must be a world length too. */
    let worldHeadSpan = 0;
    {
      const hb = new THREE.Box3();
      for (const q of headOnly) hb.expandByPoint(new THREE.Vector3(q[0], q[1], q[2]));
      worldHeadSpan = Math.max(hb.getSize(new THREE.Vector3()).length(), 1e-9);
    }
    /* Head span measured along the FRAME's forward axis, which is the axis
     * the teeth are laid out on. */
    const hf = headF;
    const position = built.geometry.getAttribute('position');
    const kindAttribute = built.geometry.getAttribute('rfFaceKind');
    const skinIndexAttribute = built.geometry.getAttribute('skinIndex');
    const headMatrix = headBone
      ? new THREE.Matrix4().multiplyMatrices(body.bindMatrixInverse, headBone.matrixWorld)
      : new THREE.Matrix4();
    const jawMatrix = jawBone
      ? new THREE.Matrix4().multiplyMatrices(body.bindMatrixInverse, jawBone.matrixWorld)
      : new THREE.Matrix4();
    const point = new THREE.Vector3(), local = new THREE.Vector3();
    const toothRatios = [], eyeRatios = [];
    const nearest = (target, cloud) => {
      let best = Infinity;
      for (const q of cloud) {
        const dx = q[0] - target.x, dy = q[1] - target.y, dz = q[2] - target.z;
        const d = dx * dx + dy * dy + dz * dz;
        if (d < best) best = d;
      }
      return Math.sqrt(best);
    };
    for (let i = 0; i < position.count; i++) {
      const kind = kindAttribute.getX(i);
      const isTooth = kind > FACE_KIND.tooth - 0.5 && kind < FACE_KIND.tooth + 0.5;
      /* Socket and sclera are the parts that must sit ON the skin; the pupil
       * and highlight ride deliberately proud of the ball, so measuring them
       * against the hull would be measuring the wrong thing. */
      const isEyeSeat = kind < FACE_KIND.sclera + 0.5;
      if (!isTooth && !isEyeSeat) continue;
      point.fromBufferAttribute(position, i);
      point.applyMatrix4(skinIndexAttribute.getX(i) === samples.jawIndex ? jawMatrix : headMatrix);
      /* The head-span containment test stays in the frame, where "along the
       * body" is meaningful; the SEATING test moves to world space, where the
       * distance actually corresponds to what a player sees. */
      if (isTooth) {
        local.set(point.x - frame.headCentroid.x, point.y - frame.headCentroid.y, point.z - frame.headCentroid.z);
        const f = local.dot(frame.forward);
        if (f < hf.lo - hf.span * 0.05 || f > hf.hi + hf.span * 0.05) out.outsideHeadSpan++;
      }
      point.applyMatrix4(toWorld);
      if (isTooth) toothRatios.push(nearest(point, surface) / worldHeadSpan);
      else eyeRatios.push(nearest(point, headOnly) / worldHeadSpan);
    }
    const summarize = (list) => {
      if (!list.length) return { median: 0, max: 0, count: 0 };
      const sorted = list.slice().sort((a, b) => a - b);
      return { median: sorted[Math.floor(sorted.length / 2)], max: sorted[sorted.length - 1], count: sorted.length };
    };
    const tooth = summarize(toothRatios), eye = summarize(eyeRatios);
    out.teeth = tooth.count; out.maxSurfaceRatio = tooth.max; out.medianSurfaceRatio = tooth.median;
    out.eyes = eye.count; out.eyeMaxSurfaceRatio = eye.max; out.eyeMedianSurfaceRatio = eye.median;
    return out;
  })();

  return {
    geometry: built.geometry,
    triangles: built.triangles,
    vertices: built.vertices,
    metrics: {
      eyeSource,
      mouthSource,
      overlapRatio: overlapSpan / headSpan,
      paintedEyeContrast: painted ? painted.contrast : 0,
      upAxis: frame.upAxis,
      maxJawWeight: samples.maxJawWeight,
      jawCut: samples.jawCut,
      headPoints: samples.head.length,
      jawPoints: samples.jaw.length,
      upCorrelation: Number(frame.upCorrelation.toFixed(4)),
      headSpan,
      headHalfWidth: skinS,
      castLocalHalfWidth: localHalfWidth,
      seatConfidence,
      seatable,
      /* True when the tooth rows and cavity were deliberately withheld. Lets
       * the gates assert absence rather than fail on it, and makes the hold
       * visible in any rig dump instead of looking like a build that quietly
       * lost its teeth. */
      mouthHeld: RF_GRIN_MOUTH_HOLD,
      castOriginSource: originSource,
      castPairWidth: pair ? pair.width : 0,
      castPairOk: !!(pair && pair.ok),
      castOriginS: pair ? pair.originS : 0,
      sparseHead,
      castHits: hits.filter(Boolean).length,
      castTriangles: surface ? surface.count : 0,
      headScale,
      eyeRadius,
      socketRadius,
      socketDepth,
      socketDepthRatio: socketDepth / Math.max(socketRadius, 1e-9),
      pupilOffsetRatio: pupilOffset,
      pupilRadiusRatio: pupilRadius / Math.max(eyeRadius, 1e-9),
      highlightRadiusRatio: highlightRadius / Math.max(eyeRadius, 1e-9),
      highlightConcentric: Math.hypot(highlightU - pupilOffsetU, highlightF - pupilOffsetF) / Math.max(eyeRadius, 1e-9),
      eyeSurfaceMedianRatio: seating.eyeMedianSurfaceRatio,
      eyeSurfaceMaxRatio: seating.eyeMaxSurfaceRatio,
      eyeSamples: seating.eyes,
      toothCount: placed * 4,
      toothGap,
      toothGapRatio: toothGap / Math.max(toothPitch, 1e-9),
      toothSurfaceMedianRatio: seating.medianSurfaceRatio,
      toothSurfaceMaxRatio: seating.maxSurfaceRatio,
      toothOutsideHeadSpan: seating.outsideHeadSpan,
      toothSeatSpread: toothSeatMax,
      mouthSpanRatio: mouthSpan / Math.max(bodyF.span, 1e-9)
    }
  };
}

/* Gate thresholds, exported so the selftest asserts the same numbers this
 * module was tuned against rather than a copy that can drift. */
export const TEXTURED_FACE_GATES = Object.freeze({
  toothOutsideHeadSpan: 0,
  toothSurfaceMedianRatio: 0.16,
  toothSurfaceMaxRatio: 0.45,
  eyeSurfaceMedianRatio: 0.12,
  socketDepthRatio: 0.05,
  pupilOffsetRatio: 0.06,
  toothGapRatio: 0.15,
  toothCountMin: 12
});

/* Check a metrics block against the gates. Returns an array of failure
 * strings, empty when the fit is good. */
export function checkTexturedFace(metrics) {
  const failures = [];
  if (!metrics) return ['textured face metrics missing'];
  const g = TEXTURED_FACE_GATES;
  if (metrics.toothOutsideHeadSpan !== g.toothOutsideHeadSpan) {
    failures.push(`${metrics.toothOutsideHeadSpan} teeth outside the head span`);
  }
  if (!(metrics.toothSurfaceMedianRatio < g.toothSurfaceMedianRatio)) {
    failures.push(`tooth row median ${metrics.toothSurfaceMedianRatio.toFixed(4)} off the head surface`);
  }
  if (!(metrics.toothSurfaceMaxRatio < g.toothSurfaceMaxRatio)) {
    failures.push(`worst tooth ${metrics.toothSurfaceMaxRatio.toFixed(4)} off the head surface`);
  }
  if (!(metrics.eyeSurfaceMedianRatio < g.eyeSurfaceMedianRatio)) {
    failures.push(`eye seat median ${metrics.eyeSurfaceMedianRatio.toFixed(4)} off the head surface`);
  }
  if (!(metrics.socketDepthRatio > g.socketDepthRatio)) failures.push('eye socket is flat');
  if (!(metrics.pupilOffsetRatio > g.pupilOffsetRatio)) failures.push('pupil is dead-centre');
  /* Under RF_GRIN_MOUTH_HOLD the batch deliberately emits no teeth, so the
   * tooth gates would fail on a row that is behaving exactly as intended.
   * They are not skipped silently: the hold asserts the OPPOSITE - that the
   * mouth really is absent - so a stray tooth escaping the hold is still a
   * failure and is still caught here. */
  if (metrics.mouthHeld) {
    if (metrics.toothCount !== 0) failures.push(`mouth is HELD but ${metrics.toothCount} teeth were emitted`);
  } else {
    if (!(metrics.toothGapRatio > g.toothGapRatio)) failures.push('teeth are a grille, not separated');
    if (!(metrics.toothCount >= g.toothCountMin)) failures.push(`only ${metrics.toothCount} teeth`);
  }
  return failures;
}

/* Mount the fitted face on a textured rig.
 *
 * `rig` carries the palette and eye color the row resolved (passed through
 * from shark3d so this module does not duplicate the palette resolver);
 * `skinnedMesh` is the body; `def` is the data row; `profile` supplies the
 * personality face column. Returns the bound SkinnedMesh or null. */
export function buildTexturedFace(rig, skinnedMesh, def, profile = null) {
  const body = skinnedMesh;
  const parent = body?.parent;
  if (!body?.isSkinnedMesh || !parent) return null;
  /* REST GAPE FIRST, THEN BUILD THE FACE AGAINST THE OPENED JAW.
   *
   * This ordering is the whole fix for the floating tooth rows, and both
   * halves of it were wrong in turn:
   *
   *   - Applying the gape inside applyMorph() (before this function is even
   *     called) baked the open pose into the batch's vertices AND let
   *     shark3d.js rotate the same bone again at runtime. The gape landed
   *     twice and the rows tore off the head.
   *   - Applying it at the END of this function - the previous fix - stopped
   *     the double transform, but then texturedFaceGeometry() measured the
   *     lip line, cast the tooth seats and sized the cavity against a CLOSED
   *     jaw, and the jaw opened underneath them afterwards. The lower row
   *     rides LowerJaw, so it swung away from the geometry it was fitted to.
   *
   * The jaw is therefore hinged to its final rest pose HERE, the skeleton is
   * updated so the bone matrices the sampler reads are the posed ones, and
   * only then is the face authored - against the mouth as it will actually
   * render. shark3d.js:3059 still captures baseJawQuaternion after all of
   * this, so the bite continues to compose additively. */
  try {
    let rigRoot = body;
    while (rigRoot && !rigRoot.userData?.rfL2MorphRecord) rigRoot = rigRoot.parent;
    if (rigRoot) {
      const S3D_REST_GAPE = 0, S3D_MAX_ROTATION = 0.72;
      const pg = profile?.face?.gape ?? profile?.personality?.face?.gape ?? 0;
      const restGape = Math.min(Math.max(S3D_REST_GAPE + (Number.isFinite(pg) ? pg : 0), 0.20), 0.35) * S3D_MAX_ROTATION;
      commitRestGape(rigRoot, restGape);
      /* The sampler reads bone matrices; without this it would sample the
       * pre-hinge pose and we would be back to fitting a closed mouth. */
      rigRoot.updateMatrixWorld(true);
      body.skeleton?.update();
    }
  } catch (error) {
    /* A gape failure must never take down a row that otherwise renders. */
  }

  let built = null;
  try {
    built = texturedFaceGeometry(body, def, profile);
  } catch (error) {
    /* A bake this module cannot measure must not take the row down with it:
     * the shark still renders with the face the bake painted. */
    return null;
  }
  if (!built) return null;

  const palette = rig?.palette || null;
  const eyeColor = rig?.eyeColor || null;
  const mesh = new THREE.SkinnedMesh(built.geometry, texturedFaceMaterial(def, palette, eyeColor));
  mesh.name = `RF O2 textured face ${def?.id || 'unknown'}`;
  mesh.renderOrder = 3;
  mesh.frustumCulled = false;
  mesh.bind(body.skeleton, body.bindMatrix.clone(), body.bindMatrixInverse.clone());
  parent.add(mesh);
  parent.updateMatrixWorld(true);
  mesh.computeBoundingBox();
  /* Excluded from the group bounds for the same reason the Rev 13 face is:
   * the authoritative length normalization measures the BODY, and letting an
   * eyeball that sits proud of the skin push the box would rescale the row. */
  mesh.userData.rfExcludeFromBounds = true;
  mesh.userData.rfFaceMetrics = built.metrics;
  mesh.userData.rfFaceTriangles = built.triangles;
  mesh.userData.rfTexturedFace = true;

  return mesh;
}

export default buildTexturedFace;
