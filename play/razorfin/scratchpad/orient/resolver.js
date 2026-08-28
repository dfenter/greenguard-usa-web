/* ---------------------------------------------------------------------------
 * Rev 15 ORIENTATION RESOLVER (lane ORIENT).
 *
 * ONE authoritative answer per model, computed once, cached by model key, and
 * applied at template load. Replaces the Rev 14/15 pile of conditional laws
 * (a TEXTURED_KEYS branch, a merged-primitive branch, a NOSE_FLIP_KEYS set and
 * a hard-coded goblinshark override) that between them produced SIX different
 * rest orientations across the 29 models - the owner's "all random and mostly
 * wrong".
 *
 * THE TARGET FRAME is fixed by the engine, not by taste:
 *   engine3d.js renderPlayer() spins the rig group 180 degrees about WORLD Y
 *   to face left, and rolls bank about WORLD X. A Y-spin only keeps the belly
 *   down if dorsal is +Y, and world3d.js:161 states "bakes are nose-right".
 *   => NOSE +X, DORSAL +Y. (The note at the old :1141 claiming "dorsal is
 *   world z" described only the frame after the conditional roll fired, which
 *   is why downstream consumers each re-measured and each got a different
 *   answer.)
 *
 * HOW EACH AXIS IS DECIDED, strongest evidence first:
 *
 * 1. LONG AXIS - the largest BIND-POSE extent. Skinned bounding boxes are
 *    inflated by the bone matrices (a shark_bake.py spine is a chain of
 *    +local-Y translations and reports a Y extent longer than the real
 *    nose-to-tail Z), so the axis is taken from raw geometry, never from
 *    measureBox(). Unchanged from Rev 14; it was the one correct part.
 *
 * 2. DORSAL AXIS + SIGN - the LOWER JAW BONE, where the rig has one.
 *    The lower jaw physically hangs BELOW the snout, so (jaw - head) points
 *    DOWN in model space; dorsal is its negation. This is a direct physical
 *    readout, exact on all 15 shark_bake.py rigs plus sharky, and it is what
 *    the fin-spike and vertex-skewness metrics were trying and failing to
 *    approximate. Verified against the known-good reference: sharky's jaw
 *    sits at y-0.0286 relative to its head.
 *
 *    Measured consequence: 12 of the 15 baked rigs (blueshark, bullhead,
 *    dogfish, greatwhite_cy, mako, megalodonrex, scallopedhammer, smoothhound,
 *    thresher, tiger_nu, whaler, whitepointer) had their jaw ABOVE the head
 *    under the old law - i.e. they were rendering BELLY-UP - while tigershark,
 *    smoothhammer and textured_test were upright. That single split explains
 *    most of the roster.
 *
 * 3. DORSAL fallback, for rigs with no jaw bone (the Quaternius Main1..Main6
 *    rigs and the fish): the one-sided FIN SPIKE. Over the middle 60% of the
 *    long axis, bin the hull and in each bin take the body centreline as the
 *    MEDIAN of the transverse coordinate - the median is robust to a one-sided
 *    fin, which is exactly why the old code's bbox-centre and world-origin
 *    versions failed (a bbox centre sits BETWEEN the extremes by construction,
 *    so its "asymmetry" is ~0 for every model). Dorsal is the side whose
 *    extreme reaches furthest beyond that centreline; pectorals are paired and
 *    cancel.
 *
 * 4. DORSAL fallback-of-last-resort, when the spike score is degenerate
 *    (|score| < SPIKE_DEGENERATE - short-finned bakes): the SKEWNESS of the
 *    transverse vertex distribution about its median. A back carries a long
 *    thin tail of fin vertices; a belly is blunt.
 *
 * 5. NOSE SIGN - the HEAD/TAIL bones when present, else the GIRTH profile:
 *    bin along the long axis and compare mean cross-section radius of the two
 *    end fifths (skipping the outermost bin, which is snout tip on one side
 *    and caudal sheet on the other). The head end is a thicker skull.
 *    Vertex COUNT is deliberately NOT used: it measures how much detail the
 *    artist spent on an end, not how thick it is, and it flipped the goblin
 *    tail-first (549 verts in the head bin against 116 at the snout).
 *
 * The result is a single quaternion applied once to the scene. No per-row
 * work, no per-model special cases in the control flow.
 * ------------------------------------------------------------------------- */
const SPIKE_DEGENERATE = 0.08;
const orientationCache = new Map();

/* Every hull vertex in the scene's CURRENT world frame, plus its box. */
function orientSamples(meshes) {
  const points = [], v = new THREE.Vector3();
  for (const mesh of meshes) {
    if (mesh.userData.rfExcludeFromBounds) continue;
    const position = mesh.geometry?.attributes?.position; if (!position) continue;
    /* Stride large hulls: orientation is a gross-shape question and 8k
     * samples decide it identically to 200k, at a fraction of the cost. */
    const step = Math.max(1, Math.floor(position.count / 8000));
    for (let i = 0; i < position.count; i += step) points.push(v.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).clone());
  }
  const box = new THREE.Box3(); for (const p of points) box.expandByPoint(p);
  return { points, box, size: box.getSize(new THREE.Vector3()) };
}
function orientMedian(values) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b), mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
/* One-sided fin spike about the per-bin MEDIAN centreline. Returns a signed
 * score in -1..1: positive means the hull reaches further in +axis. */
function orientSpike(points, box, size, axis) {
  const BINS = 12, x0 = box.min.x + size.x * 0.2, x1 = box.min.x + size.x * 0.8, span = (x1 - x0) || 1;
  const bins = Array.from({ length: BINS }, () => []);
  for (const p of points) { if (p.x < x0 || p.x > x1) continue; bins[Math.max(0, Math.min(BINS - 1, Math.floor((p.x - x0) / span * BINS)))].push(p[axis]); }
  let positive = 0, negative = 0, used = 0;
  for (const bin of bins) {
    if (bin.length < 8) continue;
    const centre = orientMedian(bin);
    let hi = 0, lo = 0;
    for (const value of bin) { const d = value - centre; if (d > hi) hi = d; if (-d > lo) lo = -d; }
    positive += hi; negative += lo; used++;
  }
  if (!used) return 0;
  positive /= used; negative /= used;
  return (positive - negative) / Math.max(positive + negative, 1e-6);
}
/* Third moment about the median: the degenerate-spike tiebreak. */
function orientSkew(points, box, size, axis) {
  const x0 = box.min.x + size.x * 0.2, x1 = box.min.x + size.x * 0.8, values = [];
  for (const p of points) { if (p.x < x0 || p.x > x1) continue; values.push(p[axis]); }
  if (values.length < 32) return 0;
  const centre = orientMedian(values);
  let m2 = 0, m3 = 0;
  for (const value of values) { const d = value - centre; m2 += d * d; m3 += d * d * d; }
  m2 /= values.length; m3 /= values.length;
  const sd = Math.sqrt(m2);
  return sd > 1e-9 ? m3 / (sd * sd * sd) : 0;
}
/* Mean cross-section radius of the two end fifths. Positive result means the
 * +x end is the bulkier one, i.e. the head already points +x. */
function orientGirthBias(points, box, size) {
  const BINS = 20, girth = new Float64Array(BINS), count = new Float64Array(BINS);
  const centre = box.getCenter(new THREE.Vector3());
  for (const p of points) {
    let bi = Math.floor((p.x - box.min.x) / (size.x || 1) * BINS);
    bi = Math.max(0, Math.min(BINS - 1, bi));
    const dy = (p.y - centre.y) / (size.y || 1), dz = (p.z - centre.z) / (size.z || 1);
    const r = Math.hypot(dy, dz);
    if (r > girth[bi]) girth[bi] = r;
    count[bi]++;
  }
  let lo = 0, hi = 0, loN = 0, hiN = 0;
  for (let i = 1; i < 4; i++) { if (count[i]) { lo += girth[i]; loN++; } if (count[BINS - 1 - i]) { hi += girth[BINS - 1 - i]; hiN++; } }
  lo = loN ? lo / loN : 0; hi = hiN ? hi / hiN : 0;
  return hi - lo;
}
/* The authoritative resolver. Returns the decision record for a model key,
 * computing it at most once. `scene` must be in its AUTHORED frame (no
 * orientation rotation applied yet). */
function resolveOrientation(scene, meshes, key) {
  const cacheKey = String(key || '');
  if (cacheKey && orientationCache.has(cacheKey)) return orientationCache.get(cacheKey);

  /* --- 1. long axis, from bind-pose geometry only --- */
  const authored = orientSamples(meshes);
  const a = authored.size;
  const longAxis = a.y >= a.x && a.y >= a.z ? 'y' : a.z > a.x ? 'z' : 'x';

  /* --- the rotation that carries the long axis onto world +x --- */
  const toLong = new THREE.Euler(0, 0, 0);
  if (longAxis === 'y') toLong.z = -Math.PI / 2; else if (longAxis === 'z') toLong.y = Math.PI / 2;
  const longQuat = new THREE.Quaternion().setFromEuler(toLong);

  /* Re-express the authored samples in the long-axis-aligned frame, so the
   * dorsal and nose tests below all run in one consistent space. */
  const points = authored.points.map((p) => p.clone().applyQuaternion(longQuat));
  const box = new THREE.Box3(); for (const p of points) box.expandByPoint(p);
  const size = box.getSize(new THREE.Vector3());

  /* --- 2/3/4. dorsal axis and sign --- */
  const jawBone = scene.getObjectByName('LowerJaw') || scene.getObjectByName('Jaw');
  const headBone = scene.getObjectByName('Head') || scene.getObjectByName('Nose');
  let dorsal = null, dorsalSource = '';
  if (jawBone && headBone) {
    /* (jaw - head) points DOWN; dorsal is its negation, snapped to whichever
     * transverse axis dominates. Measured in the long-aligned frame. */
    const jaw = new THREE.Vector3().setFromMatrixPosition(jawBone.matrixWorld).applyQuaternion(longQuat);
    const head = new THREE.Vector3().setFromMatrixPosition(headBone.matrixWorld).applyQuaternion(longQuat);
    const down = jaw.sub(head);
    /* Only the transverse components mean anything: a jaw is also forward of
     * the head bone, and that x component must not vote. */
    if (Math.abs(down.y) >= Math.abs(down.z)) { if (Math.abs(down.y) > 1e-6) { dorsal = { axis: 'y', sign: down.y > 0 ? -1 : 1 }; dorsalSource = 'jaw bone'; } }
    else if (Math.abs(down.z) > 1e-6) { dorsal = { axis: 'z', sign: down.z > 0 ? -1 : 1 }; dorsalSource = 'jaw bone'; }
  }
  let spikeY = 0, spikeZ = 0, skewY = 0, skewZ = 0;
  if (!dorsal) {
    spikeY = orientSpike(points, box, size, 'y'); spikeZ = orientSpike(points, box, size, 'z');
    const axis = Math.abs(spikeY) >= Math.abs(spikeZ) ? 'y' : 'z';
    const score = axis === 'y' ? spikeY : spikeZ;
    if (Math.abs(score) >= SPIKE_DEGENERATE) { dorsal = { axis, sign: score > 0 ? 1 : -1 }; dorsalSource = 'fin spike'; }
    else {
      /* Degenerate spike (short fins: tigershark, whitepointer and the fish).
       * Fall through to distribution skewness on the same axis. */
      skewY = orientSkew(points, box, size, 'y'); skewZ = orientSkew(points, box, size, 'z');
      const sk = axis === 'y' ? skewY : skewZ;
      dorsal = { axis, sign: sk >= 0 ? 1 : -1 }; dorsalSource = 'skewness (degenerate spike)';
    }
  }

  /* --- the roll that carries the dorsal direction onto world +y --- */
  const dorsalVec = new THREE.Vector3(); dorsalVec[dorsal.axis] = dorsal.sign;
  /* Rotate about world x (the long axis) only, so the nose stays on x. */
  let roll = 0;
  if (dorsal.axis === 'y') roll = dorsal.sign > 0 ? 0 : Math.PI;
  else roll = dorsal.sign > 0 ? -Math.PI / 2 : Math.PI / 2;
  const rollQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), roll);

  /* --- 5. nose sign, measured after the roll (girth is roll-invariant, but
   * the bones must be read in the final frame) --- */
  const rolled = points.map((p) => p.clone().applyQuaternion(rollQuat));
  const rBox = new THREE.Box3(); for (const p of rolled) rBox.expandByPoint(p);
  const rSize = rBox.getSize(new THREE.Vector3());
  const tailBone = scene.getObjectByName('Tail3') || scene.getObjectByName('Tail2') || scene.getObjectByName('Tail1');
  const total = new THREE.Quaternion().copy(rollQuat).multiply(longQuat);
  let flip = false, noseSource = '', girthBias = 0;
  if (headBone && tailBone) {
    const head = new THREE.Vector3().setFromMatrixPosition(headBone.matrixWorld).applyQuaternion(total);
    const tail = new THREE.Vector3().setFromMatrixPosition(tailBone.matrixWorld).applyQuaternion(total);
    if (Math.abs(head.x - tail.x) > 1e-6) { flip = head.x < tail.x; noseSource = 'head/tail bones'; }
  }
  if (!noseSource) {
    girthBias = orientGirthBias(rolled, rBox, rSize);
    flip = girthBias < 0; noseSource = 'girth profile';
  }
  /* The nose flip is a 180 spin about the DORSAL axis (world +y after the
   * roll), never about local y and never about z: spinning about anything
   * else rolls the shark as it turns it, which is the Rev 14.1 bug. */
  const flipQuat = flip ? new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI) : new THREE.Quaternion();

  const quaternion = new THREE.Quaternion().copy(flipQuat).multiply(rollQuat).multiply(longQuat);
  const record = {
    key: cacheKey, axis: longAxis, dorsalAxis: dorsal.axis, dorsalSign: dorsal.sign, dorsalSource,
    roll, flip, noseSource, girthBias: +girthBias.toFixed(4),
    spikeY: +spikeY.toFixed(4), spikeZ: +spikeZ.toFixed(4), skewY: +skewY.toFixed(4), skewZ: +skewZ.toFixed(4),
    quaternion
  };
  if (cacheKey) orientationCache.set(cacheKey, record);
  return record;
}
