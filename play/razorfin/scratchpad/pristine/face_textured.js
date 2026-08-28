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

const TAU = Math.PI * 2;
/* Same kind ids the Rev 13 face shader branches on, so a textured face can
 * reuse that material contract exactly. */
export const FACE_KIND = Object.freeze({ socket: 0, sclera: 1, pupil: 2, highlight: 3, brow: 4, tooth: 5, lip: 6 });

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
    point.fromBufferAttribute(position, i);
    body.applyBoneTransform(i, point);
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
  return { all, head, jaw, headIndex, jawIndex, headCut, jawCut, maxHeadWeight: maxHead, maxJawWeight: maxJaw };
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
  return {
    forward, up, side, headCentroid: origin, headCloudCentroid: headCentroid, tailCentroid,
    upAxis: measured.axis, upCorrelation: measured.correlation,
    frameSource: (headBone && neckBone) ? 'Head/Neck bones' : 'skin-weight centroids'
  };
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

/* The face batch owns its own material so the sclera can be near-white and
 * the iris can glow, fully escaping the body's palette tint. It carries
 * `rfTextured` so the textured-row selftest clause ("every material on a
 * textured row is a textured material") still passes with the overlay
 * mounted, and it is Standard/Physical and front-sided for the same reason.
 */
export function texturedFaceMaterial(def, palette, eyeColor) {
  const base = palette?.base ? palette.base.clone() : new THREE.Color(0x6a7a86);
  const iris = eyeColor ? eyeColor.clone() : new THREE.Color(0xffc94a);
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(1, 1, 1), roughness: 0.34, metalness: 0.0, side: THREE.DoubleSide
  });
  material.name = `RF O2 textured face ${def?.id || 'unknown'}`;
  const uniforms = {
    uRfFaceIris: { value: iris },
    uRfFaceSocket: { value: base.clone().multiplyScalar(0.30) },
    uRfFaceBrowColor: { value: base.clone().multiplyScalar(0.48) },
    uRfFaceLidTint: { value: base.clone().multiplyScalar(0.78) }
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
      .replace('#include <common>', '#include <common>\nuniform vec3 uRfFaceIris;\nuniform vec3 uRfFaceSocket;\nuniform vec3 uRfFaceBrowColor;\nuniform vec3 uRfFaceLidTint;\nvarying float vRfFaceKind;\nvarying float vRfFaceEdge;')
      .replace('#include <color_fragment>', [
        '#include <color_fragment>',
        'float rfK = vRfFaceKind;',
        'if (rfK < 0.5) diffuseColor.rgb = uRfFaceSocket * mix(0.85, 1.25, vRfFaceEdge);',
        'else if (rfK < 1.5) diffuseColor.rgb = mix(vec3(0.94, 0.95, 0.92), uRfFaceLidTint, 0.16);',
        'else if (rfK < 2.5) diffuseColor.rgb = uRfFaceIris * 0.30;',
        'else if (rfK < 3.5) diffuseColor.rgb = vec3(1.0);',
        'else if (rfK < 4.5) diffuseColor.rgb = uRfFaceBrowColor;',
        'else diffuseColor.rgb = vec3(0.95, 0.95, 0.90);'
      ].join('\n'));
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <emissivemap_fragment>', [
        '#include <emissivemap_fragment>',
        'float rfIris = step(1.5, vRfFaceKind) - step(2.5, vRfFaceKind);',
        'float rfSpec = step(2.5, vRfFaceKind) - step(3.5, vRfFaceKind);',
        'totalEmissiveRadiance += uRfFaceIris * rfIris * 0.38;',
        'totalEmissiveRadiance += vec3(1.0) * rfSpec * 0.55;'
      ].join('\n'));
  };
  material.customProgramCacheKey = () => 'rf-o2-textured-face:rf-tex1';
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
  const eyeBand = (() => {
    const near = [];
    for (const q of headProjected) if (Math.abs(q.f - eyeF) <= eyeSliceTolerance) near.push(q);
    if (near.length < 8) return null;
    const u = extent(near, 'u');
    const window = u.span * 0.16;
    let side = 0;
    for (const q of near) if (Math.abs(q.u - eyeU) <= window) side = Math.max(side, Math.abs(q.s));
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
  const socketRadius = headSpan * 0.082 * eyeScale * headScale;
  const eyeRadius = socketRadius * 0.78;

  /* Seat depths: the socket floor is pushed INTO the skull, the eyeball sits
   * proud of it, and the pupil and highlight ride just outside the ball.
   *
   * Orbit depths are expressed against the SOCKET, not against the head
   * half-width. Tying them to the half-width made the socket's apparent depth
   * depend on how broad the skull happened to be: on a wide head with a small
   * eye the floor inset was a large multiple of the socket radius, and on a
   * narrow one it collapsed to nothing (measured: solaris fell to a 0.042
   * depth ratio and read as a flat sticker). Anchoring to the socket radius
   * makes every row's orbit the same shape and keeps the eyeball proud of its
   * floor by a fixed fraction of the eye itself. */
  const socketS = skinS * 0.995;
  const socketFloorS = socketS - socketRadius * 0.42;
  const eyeBaseS = socketS + socketRadius * 0.06;
  const eyeTipS = socketS + socketRadius * 0.52;
  const socketDepth = socketS - socketFloorS;

  const pupilOffsetU = eyeRadius * (0.20 + 0.16 * tilt);
  const pupilOffsetF = eyeRadius * (0.10 + 0.14 * tilt);
  const pupilRadius = eyeRadius * clamp(0.46 * pupilScale, 0.24, 0.66);
  const highlightRadius = eyeRadius * 0.26;
  const highlightU = pupilOffsetU + eyeRadius * 0.30;
  const highlightF = pupilOffsetF + eyeRadius * 0.28;
  const pupilOffset = Math.hypot(pupilOffsetU, pupilOffsetF) / Math.max(eyeRadius, 1e-9);

  for (const side of [-1, 1]) {
    builder.setWeights([[samples.headIndex, 1]]);
    const sx = side;
    frameDisc(builder, frame, headInverse, eyeF, eyeU, sx * socketFloorS,
      socketRadius * 0.88, socketRadius, FACE_KIND.socket, 12, 0.25);
    frameDome(builder, frame, headInverse, eyeF, eyeU, sx * eyeBaseS, sx * eyeTipS,
      eyeRadius * 0.92, eyeRadius, FACE_KIND.sclera, 12);
    frameDisc(builder, frame, headInverse, eyeF + pupilOffsetF, eyeU + pupilOffsetU,
      sx * (eyeTipS + headSpan * 0.002), pupilRadius, pupilRadius, FACE_KIND.pupil, 10);
    frameDisc(builder, frame, headInverse, eyeF + highlightF, eyeU + highlightU,
      sx * (eyeTipS + headSpan * 0.004), highlightRadius, highlightRadius, FACE_KIND.highlight, 8);

    /* Brow wedge. The inner end sits higher than the outer end so the eye is
     * never framed by a symmetric hard edge; a positive brow drives down and
     * inward over the pupil, a negative one lifts and softens. */
    const browU = eyeU + socketRadius * (0.90 + browAmount * 0.30);
    const browOuterU = eyeU - socketRadius * (0.30 - browAmount * 0.24);
    const browF0 = eyeF - socketRadius * (1.05 + browAmount * 0.18);
    const browF1 = eyeF + socketRadius * (1.05 + browAmount * 0.30);
    const bs = sx * skinS * 1.004, bsIn = sx * skinS * 0.978;
    const ring = (s) => [
      builder.vertexAt(unproject(frame, browF0, browOuterU, s).applyMatrix4(headInverse), FACE_KIND.brow),
      builder.vertexAt(unproject(frame, browF0, browU, s).applyMatrix4(headInverse), FACE_KIND.brow),
      builder.vertexAt(unproject(frame, browF1, browU, s).applyMatrix4(headInverse), FACE_KIND.brow),
      builder.vertexAt(unproject(frame, browF1, browOuterU, s).applyMatrix4(headInverse), FACE_KIND.brow)
    ];
    const outer = ring(bs), inner = ring(bsIn);
    builder.tri(outer[0], outer[1], outer[2]); builder.tri(outer[0], outer[2], outer[3]);
    builder.tri(inner[0], inner[2], inner[1]); builder.tri(inner[0], inner[3], inner[2]);
    for (let i = 0; i < 4; i++) {
      const n = (i + 1) % 4;
      builder.tri(outer[i], inner[i], inner[n]); builder.tri(outer[i], inner[n], outer[n]);
    }
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

  const toothCount = 5;
  const toothPitch = (mouthEnd - mouthStart) / Math.max(toothCount - 1, 1);
  const bandTolerance = Math.max(toothPitch * 0.60, 1e-9);
  const toothHalfF = toothPitch * 0.30;
  const toothGap = toothPitch - toothHalfF * 2;

  let toothSeatMax = 0, placed = 0;
  for (let i = 0; i < toothCount; i++) {
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
    const lipU = upper.uMin + upper.uSpan * 0.16;
    const jawU = lower.uMax - lower.uSpan * 0.16;
    const upperSide = Math.max(upper.side * 0.90, toothPitch * 0.55);
    const lowerSide = Math.max(lower.side * 0.90, toothPitch * 0.55);
    /* Tooth height is keyed to the MOUTH pitch, not the body: keying it to
     * the body span is what produced oversized fangs on the bulky rows. */
    const taper = 1 - i / (toothCount + 2);
    const height = toothPitch * 0.72 * (0.70 + 0.55 * taper);
    toothSeatMax = Math.max(toothSeatMax, Math.abs(lipU - jawU) / Math.max(mouthSpan, 1e-9));
    placed++;
    for (const side of [-1, 1]) {
      const sx = side;
      builder.setWeights([[samples.headIndex, 1]]);
      frameTooth(builder, frame, headInverse, f, toothHalfF,
        lipU + toothPitch * 0.10, lipU - height, sx * upperSide * 0.985, sx * upperSide * 0.76);
      builder.setWeights([[samples.jawIndex, 1]]);
      frameTooth(builder, frame, jawInverse, f, toothHalfF * 0.86,
        jawU - toothPitch * 0.10, jawU + height * 0.86, sx * lowerSide * 0.985, sx * lowerSide * 0.76);
    }
  }
  if (!placed) return null;

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
  if (!(metrics.toothGapRatio > g.toothGapRatio)) failures.push('teeth are a grille, not separated');
  if (!(metrics.toothCount >= g.toothCountMin)) failures.push(`only ${metrics.toothCount} teeth`);
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
