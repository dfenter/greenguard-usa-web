/* Razorfin HSE L3: identity props for baked textured rigs.
 *
 * Baked shark meshes do not share Sharky's bind axes or head proportions.
 * This module measures the actual mesh and bones every time it mounts a
 * feature batch. All props for a row share one SkinnedMesh and one material,
 * so the feature layer costs one draw and follows the same bones as the skin.
 */
import * as THREE from 'three';

const TAU = Math.PI * 2;
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
  seam: 8
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

/* The bake's axis is not a contract of the low-poly rig. Long is measured
 * from the bind-pose vertex box; dorsal is the remaining mesh axis whose
 * current world direction is most aligned to the scene up direction. */
function measureFrame(body) {
  const position = body.geometry?.getAttribute('position');
  if (!position || !position.count) return null;
  const box = body.geometry.boundingBox || body.geometry.computeBoundingBox() && body.geometry.boundingBox;
  const size = box.getSize(new THREE.Vector3());
  const longAxis = ['x', 'y', 'z'].sort((a, b) => size[b] - size[a])[0];
  const residual = ['x', 'y', 'z'].filter((axis) => axis !== longAxis);
  const origin = body.localToWorld(new THREE.Vector3());
  const sceneUp = new THREE.Vector3(0, 0, 1);
  const upAxis = residual.sort((a, b) => {
    const da = body.localToWorld(axisVector(a)).sub(origin).normalize().dot(sceneUp);
    const db = body.localToWorld(axisVector(b)).sub(origin).normalize().dot(sceneUp);
    return Math.abs(db) - Math.abs(da);
  })[0];
  const axes = componentAxes(longAxis, upAxis);
  const head = body.skeleton?.bones?.find((bone) => /^(Head|Face)$/i.test(bone.name || '')) || body.skeleton?.bones?.find((bone) => /head|face/i.test(bone.name || ''));
  const tail = body.skeleton?.bones?.find((bone) => /^Tail3$/i.test(bone.name || '')) || body.skeleton?.bones?.find((bone) => /tail/i.test(bone.name || ''));
  const measuredHead = head ? coordFromWorld(body, head, longAxis) : box.min[longAxis];
  const measuredTail = tail ? coordFromWorld(body, tail, longAxis) : box.max[longAxis];
  const direction = measuredTail >= measuredHead ? 1 : -1;
  const headCoord = measuredHead;
  const tailCoord = measuredTail;
  const span = Math.max(Math.abs(tailCoord - headCoord), size[longAxis] * 0.82, 1e-5);
  const at = (station) => headCoord + direction * span * clamp(station, -0.24, 1.12);
  const station = (value) => clamp((value - headCoord) * direction / span, -0.24, 1.12);
  const local = new THREE.Vector3();
  const values = { minAcross: Infinity, maxAcross: -Infinity, minUp: Infinity, maxUp: -Infinity };
  for (let i = 0; i < position.count; i++) {
    local.fromBufferAttribute(position, i);
    values.minAcross = Math.min(values.minAcross, axisValue(local, axes.acrossAxis));
    values.maxAcross = Math.max(values.maxAcross, axisValue(local, axes.acrossAxis));
    values.minUp = Math.min(values.minUp, axisValue(local, upAxis));
    values.maxUp = Math.max(values.maxUp, axisValue(local, upAxis));
  }
  const chainNames = ['Head', 'Neck', 'Spine1', 'Spine2', 'Tail1', 'Tail2', 'Tail3'];
  const chain = chainNames.map((name) => body.skeleton?.bones?.find((bone) => bone.name === name)).filter(Boolean)
    .map((bone) => ({ bone, station: station(coordFromWorld(body, bone, longAxis)) }))
    .sort((a, b) => a.station - b.station);
  const band = (atStation, acrossHint = null) => {
    const target = at(atStation), tolerance = Math.max(span * 0.065, size[longAxis] * 0.035);
    let nearest = Infinity, minAcross = Infinity, maxAcross = -Infinity, minUp = Infinity, maxUp = -Infinity;
    for (let i = 0; i < position.count; i++) {
      local.fromBufferAttribute(position, i);
      const distance = Math.abs(axisValue(local, longAxis) - target);
      const acrossDistance = acrossHint === null ? 0 : Math.abs(axisValue(local, axes.acrossAxis) - acrossHint);
      if (distance > tolerance || acrossDistance > Math.max(size[axes.acrossAxis] * 0.26, 0.01)) continue;
      if (distance < nearest) { nearest = distance; minAcross = Infinity; maxAcross = -Infinity; minUp = Infinity; maxUp = -Infinity; }
      if (distance <= nearest + size[longAxis] * 0.018) {
        const across = axisValue(local, axes.acrossAxis), up = axisValue(local, upAxis);
        minAcross = Math.min(minAcross, across); maxAcross = Math.max(maxAcross, across);
        minUp = Math.min(minUp, up); maxUp = Math.max(maxUp, up);
      }
    }
    if (!Number.isFinite(minAcross)) {
      minAcross = values.minAcross; maxAcross = values.maxAcross; minUp = values.minUp; maxUp = values.maxUp;
    }
    const width = Math.max(maxAcross - minAcross, size[axes.acrossAxis] * 0.08, 1e-4);
    const height = Math.max(maxUp - minUp, size[upAxis] * 0.08, 1e-4);
    return { centerAcross: (minAcross + maxAcross) * 0.5, halfAcross: width * 0.5, bottom: minUp, top: maxUp, height };
  };
  const topAt = (atStation, across) => {
    const slice = band(atStation, across);
    return slice.top;
  };
  return {
    box, size, longAxis, upAxis, axes, headCoord, tailCoord, span, at, station, band, topAt, chain,
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

function makeBuilder(frame, skeleton) {
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
  const addScute = (station, baseUp, height, halfLong, halfAcross, across, weights) => {
    const base = [
      addVertex(frame.at(station) - halfLong, baseUp, across - halfAcross, weights, FEATURE.armor, 1),
      addVertex(frame.at(station) + halfLong, baseUp, across - halfAcross, weights, FEATURE.armor, 1),
      addVertex(frame.at(station) + halfLong, baseUp, across + halfAcross, weights, FEATURE.armor, 1),
      addVertex(frame.at(station) - halfLong, baseUp, across + halfAcross, weights, FEATURE.armor, 1)
    ];
    const cap = [
      addVertex(frame.at(station) - halfLong * 0.62, baseUp + height, across - halfAcross * 0.58, weights, FEATURE.armor, 0),
      addVertex(frame.at(station) + halfLong * 0.62, baseUp + height, across - halfAcross * 0.58, weights, FEATURE.armor, 0),
      addVertex(frame.at(station) + halfLong * 0.62, baseUp + height, across + halfAcross * 0.58, weights, FEATURE.armor, 0),
      addVertex(frame.at(station) - halfLong * 0.62, baseUp + height, across + halfAcross * 0.58, weights, FEATURE.armor, 0)
    ];
    addTri(cap[0], cap[1], cap[2]); addTri(cap[0], cap[2], cap[3]);
    for (let i = 0; i < 4; i++) { const n = (i + 1) % 4; addTri(base[i], base[n], cap[n]); addTri(base[i], cap[n], cap[i]); }
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
  const geometry = () => {
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    out.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    out.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
    out.setAttribute('rfFeatureKind', new THREE.Float32BufferAttribute(kinds, 1));
    out.setAttribute('rfFeatureEdge', new THREE.Float32BufferAttribute(edges, 1));
    out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    out.setIndex(indices); out.computeVertexNormals(); out.computeBoundingBox(); out.computeBoundingSphere();
    return { geometry: out, triangles: indices.length / 3, vertices: positions.length / 3 };
  };
  return { addPlate, addScute, addPyramid, addCone, geometry, at };
}

function bodyMaterial(body) {
  const materials = Array.isArray(body.material) ? body.material : [body.material];
  return materials.find((material) => material?.userData?.rfTextured) || materials.find((material) => material?.map && material?.normalMap) || materials[0] || null;
}
function featureMaterial(body, palette, glowEnabled) {
  const source = bodyMaterial(body), sourceUniforms = source?.userData?.rfTexturedUniforms || {};
  const accent = sourceUniforms.uRfAccentColor?.value?.clone?.() || palette?.accent?.clone?.() || new THREE.Color(0.2, 0.8, 1);
  const base = sourceUniforms.uRfTopColor?.value?.clone?.() || palette?.base?.clone?.() || new THREE.Color(0.2, 0.3, 0.35);
  const belly = sourceUniforms.uRfBottomColor?.value?.clone?.() || palette?.belly?.clone?.() || new THREE.Color(0.8, 0.9, 0.9);
  const glow = palette?.glow?.clone?.() || sourceUniforms.uRfRimColor?.value?.clone?.() || accent.clone();
  const uniforms = {
    uRfFeatureBase: { value: base }, uRfFeatureAccent: { value: accent }, uRfFeatureBelly: { value: belly },
    uRfFeatureGlow: { value: glow }, uRfFeatureGlowStrength: { value: glowEnabled ? 0.72 : 0.0 }
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
      .replace('#include <map_fragment>', '#include <map_fragment>\nfloat rfFeatureArmor = step(1.5, vRfFeatureKind) - step(3.5, vRfFeatureKind);\nfloat rfFeatureTusk = step(2.5, vRfFeatureKind) - step(3.5, vRfFeatureKind);\nfloat rfFeatureCrown = step(3.5, vRfFeatureKind) - step(6.5, vRfFeatureKind);\nfloat rfFeatureSaw = step(5.5, vRfFeatureKind) - step(7.5, vRfFeatureKind);\ndiffuseColor.rgb = mix(uRfFeatureAccent, uRfFeatureBase, rfFeatureArmor * 0.64);\ndiffuseColor.rgb = mix(diffuseColor.rgb, uRfFeatureBelly * 0.92, rfFeatureTusk);\ndiffuseColor.rgb = mix(diffuseColor.rgb, uRfFeatureAccent * 1.08, rfFeatureCrown + rfFeatureSaw * 0.28);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nfloat rfFeatureSeam = step(0.72, vRfFeatureEdge);\ntotalEmissiveRadiance += uRfFeatureGlow * rfFeatureSeam * uRfFeatureGlowStrength;');
  };
  material.customProgramCacheKey = () => 'rf-hse-textured-props:rf-tex1'; material.needsUpdate = true;
  return material;
}

function featureIds(def) {
  const id = String(def?.id || '');
  if (id === 'hammerhead' || id === 'athenajaw') return null;
  if (id === 'leviathanrex') return 'sharkjira';
  if (id === 'leviathan_rex') return 'leviathan';
  if (id === 'minotaurram') return 'horns';
  if (id === 'coralcrown' || id === 'zeusfin' || id === 'heracrown') return 'crown';
  if (id === 'sawshark' || id === 'barbhook' || id === 'chimerashark') return 'saw';
  return null;
}

function mountTexturedFeatures({ body, def, group, palette }) {
  const id = String(def?.id || ''), mode = featureIds(def), frame = measureFrame(body);
  if (!body?.isSkinnedMesh || !frame || !mode) {
    group.userData.rfTexturedFeatures = null;
    return { mesh: null, kind: null, triangles: 0 };
  }
  const skeleton = body.skeleton, builder = makeBuilder(frame, skeleton), bodySize = frame.size;
  const headBone = skeleton.bones.find((bone) => /^(Head|Face)$/i.test(bone.name || '')) || skeleton.bones[0];
  const jawBone = skeleton.bones.find((bone) => /lowerjaw|jaw/i.test(bone.name || '')) || headBone;
  const headWeight = weightsFor(frame, 0.08, headBone), jawWeight = weightsFor(frame, 0.08, jawBone);
  const headBand = frame.band(0.09), upSpan = Math.max(frame.maxUp - frame.minUp, bodySize[frame.upAxis] * 0.25);
  const bodyLong = Math.max(frame.longLength, frame.span);
  let plateCount = 0, scuteCount = 0, crownCount = 0, tuskCount = 0, hornCount = 0, sawToothCount = 0;
  const addCrown = (heavy = false) => {
    const station = 0.075, band = frame.band(station), height = upSpan * (heavy ? 0.30 : 0.22), halfLong = frame.span * (heavy ? 0.048 : 0.038), halfAcross = band.halfAcross * (heavy ? 0.90 : 0.78);
    const baseUp = frame.topAt(station, band.centerAcross) - height * 0.24;
    builder.addScute(station, baseUp, height, halfLong, halfAcross, band.centerAcross, headWeight); crownCount++;
    const spikes = heavy ? [-0.55, 0, 0.55] : [-0.48, 0, 0.48];
    for (const offset of spikes) {
      const spikeStation = station + offset * 0.035, spikeBand = frame.band(spikeStation);
      builder.addPyramid(spikeStation, frame.topAt(spikeStation, spikeBand.centerAcross) - upSpan * 0.015, spikeStation - 0.012, frame.topAt(spikeStation, spikeBand.centerAcross) + upSpan * (heavy ? 0.26 : 0.20), frame.span * 0.018, Math.max(spikeBand.halfAcross * 0.16, frame.span * 0.010), spikeBand.centerAcross, headWeight, FEATURE.crown); crownCount++;
    }
    const browStation = 0.025, browBand = frame.band(browStation), browHeight = upSpan * (heavy ? 0.13 : 0.09);
    builder.addScute(browStation, frame.topAt(browStation, browBand.centerAcross) - browHeight * 0.30, browHeight, frame.span * 0.034, browBand.halfAcross * 0.88, browBand.centerAcross, headWeight); crownCount++;
  };
  if (mode === 'sharkjira') {
    const stations = [0.18, 0.28, 0.38, 0.48, 0.58, 0.68, 0.77, 0.84];
    for (let i = 0; i < stations.length; i++) {
      const station = stations[i], band = frame.band(station), height = upSpan * [0.52, 0.68, 0.84, 0.98, 0.98, 0.84, 0.66, 0.46][i];
      const baseUp = frame.topAt(station, band.centerAcross) - height * 0.22;
      builder.addPlate(station, baseUp, height, frame.span * 0.055, Math.max(band.halfAcross * 0.18, frame.span * 0.018), band.centerAcross, weightsFor(frame, station), FEATURE.atomic); plateCount++;
    }
  } else if (mode === 'leviathan') {
    const stations = [0.16, 0.24, 0.32, 0.40, 0.48, 0.56, 0.64, 0.72, 0.79, 0.85];
    for (let i = 0; i < stations.length; i++) {
      const station = stations[i], band = frame.band(station), rowOffset = band.halfAcross * 0.46, halfLong = frame.span * 0.050, halfAcross = Math.max(band.halfAcross * 0.30, frame.span * 0.022), height = upSpan * [0.13, 0.17, 0.20, 0.22, 0.23, 0.22, 0.19, 0.16, 0.13, 0.10][i];
      for (const sign of [-1, 1]) {
        const across = band.centerAcross + sign * rowOffset, top = frame.topAt(station, across), baseUp = top - height * 0.28;
        builder.addScute(station, baseUp, height, halfLong, halfAcross, across, weightsFor(frame, station)); scuteCount++;
      }
    }
    addCrown(true);
    for (const sign of [-1, 1]) {
      const cheekStation = 0.14, cheekBand = frame.band(cheekStation), across = cheekBand.centerAcross + sign * cheekBand.halfAcross * 0.94, top = frame.topAt(cheekStation, across), bottom = cheekBand.bottom + cheekBand.height * 0.28;
      builder.addScute(cheekStation, bottom, cheekBand.height * 0.30, frame.span * 0.035, frame.span * 0.020, across, headWeight); crownCount++;
    }
    const tuskStations = [0.045, 0.085, 0.125];
    for (let i = 0; i < tuskStations.length; i++) for (const sign of [-1, 1]) {
      const station = tuskStations[i], band = frame.band(station), across = band.centerAcross + sign * band.halfAcross * 0.72, baseUp = frame.band(station, across).bottom + upSpan * 0.08, length = upSpan * (0.34 - i * 0.045);
      builder.addCone(station, baseUp, station + 0.012, baseUp - length, frame.span * 0.014, frame.span * 0.022, across, jawWeight, FEATURE.tusk); tuskCount++;
    }
  } else if (mode === 'horns') {
    for (const sign of [-1, 1]) {
      const across = headBand.centerAcross + sign * headBand.halfAcross * 0.58, baseUp = frame.topAt(0.08, across) - upSpan * 0.05;
      builder.addCone(0.08, baseUp, 0.01, baseUp + upSpan * 0.54, frame.span * 0.032, frame.span * 0.040, across, headWeight, FEATURE.horn); hornCount++;
    }
  } else if (mode === 'crown') {
    addCrown(id === 'heracrown');
  } else if (mode === 'saw') {
    const noseBand = frame.band(0.02), root = frame.at(0.03), tip = frame.at(-0.19), width = Math.max(noseBand.halfAcross * 0.24, frame.span * 0.018), bladeUp = (noseBand.top + noseBand.bottom) * 0.5;
    builder.addPlate(-0.08, bladeUp - upSpan * 0.07, upSpan * 0.14, Math.abs(root - tip) * 0.52, width, noseBand.centerAcross, headWeight, FEATURE.saw);
    for (let i = 0; i < 5; i++) {
      const station = 0.00 - i * 0.035, side = i % 2 ? -1 : 1, band = frame.band(station), across = band.centerAcross + side * Math.max(band.halfAcross * 0.38, frame.span * 0.022);
      builder.addPyramid(station, bladeUp + upSpan * 0.04, station - 0.014, bladeUp - upSpan * 0.02, frame.span * 0.012, frame.span * 0.012, across, headWeight, FEATURE.saw); sawToothCount++;
    }
  }
  const built = builder.geometry();
  if (!built.vertices) { group.userData.rfTexturedFeatures = null; return { mesh: null, kind: null, triangles: 0 }; }
  const glowEnabled = TEXTURED_CLASS_GLOW.has(String(def?.cls || '').toLowerCase()) || finite(def?.act, 1) >= 3;
  const material = featureMaterial(body, palette, glowEnabled);
  const mesh = new THREE.SkinnedMesh(built.geometry, material);
  mesh.name = `RF HSE textured ${mode} identity features`; mesh.renderOrder = 2; mesh.frustumCulled = false;
  mesh.bind(skeleton, body.bindMatrix.clone(), body.bindMatrixInverse.clone());
  body.parent?.add(mesh); body.parent?.updateMatrixWorld(true); mesh.computeBoundingBox(); mesh.userData.rfFrozenBounds = true;
  const bodyBox = new THREE.Box3().setFromObject(body), featureBox = new THREE.Box3().setFromObject(mesh), bodySizeWorld = bodyBox.getSize(new THREE.Vector3());
  const contactEnvelope = bodyBox.clone().expandByScalar(Math.max(bodySizeWorld.x, bodySizeWorld.y, bodySizeWorld.z) * 0.035);
  const contact = contactEnvelope.intersectsBox(featureBox);
  group.userData.rfVisibleDrawCalls = finite(group.userData.rfVisibleDrawCalls, 0) + 1;
  if (!contact) throw new Error(`${id}: textured feature contact gate failed`);
  if (built.triangles > 560) throw new Error(`${id}: textured feature triangles ${built.triangles} exceed the one-draw budget`);
  if (mode === 'sharkjira' && plateCount !== 8) throw new Error(`${id}: atomic spine requires 8 measured plates`);
  if (mode === 'leviathan' && (scuteCount !== 20 || tuskCount !== 6)) throw new Error(`${id}: king feature counts are incomplete`);
  const metadata = {
    mode, measuredAxes: { long: frame.longAxis, up: frame.upAxis, across: frame.axes.acrossAxis },
    contact, contactGap: contact ? 0 : Infinity, triangles: built.triangles, vertices: built.vertices, draw: 1,
    plateCount, scuteCount, crownCount, tuskCount, hornCount, sawToothCount, glowEnabled,
    stationRange: [0, 0.85], bodyBandMeasured: true, bones: frame.chain.map((entry) => entry.bone.name)
  };
  mesh.userData.rfTexturedFeatureMetrics = metadata;
  group.userData.rfTexturedFeatures = metadata;
  group.userData.rfTexturedFeatureMesh = mesh;
  if (mode === 'sharkjira') {
    group.userData.rfSharkjira = { plateCount, plateStations: [0.18, 0.28, 0.38, 0.48, 0.58, 0.68, 0.77, 0.84], atomicTriangles: built.triangles, toothTriangles: 0, pulseUniform: true, textured: true };
    group.userData.rfSharkjiraPulse = material.userData.rfTexturedUniforms.uRfFeatureGlowStrength;
  }
  if (mode === 'leviathan') {
    group.userData.rfLeviathan = { scuteCount, scuteStations: [0.16, 0.24, 0.32, 0.40, 0.48, 0.56, 0.64, 0.72, 0.79, 0.85], rowOffset: 0.46, crownPlates: 2, cheekPlates: 2, tuskCount, featureTriangles: built.triangles, pulseUniform: true, textured: true };
    group.userData.rfLeviathanPulse = material.userData.rfTexturedUniforms.uRfFeatureGlowStrength;
  }
  return { mesh, kind: mode, triangles: built.triangles, metadata };
}

export { mountTexturedFeatures };
