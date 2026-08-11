import * as THREE from 'three';

/*
 * GGRacer track authoring and geometry.
 *
 * Coordinates are metres. A title only supplies controlPoints plus optional
 * sectors/racingLine data; everything else in this module is derived once at
 * load time and then stays static during a race.
 */

const UP = new THREE.Vector3(0, 1, 0);
const EPS = 0.0001;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function wrap01(value) {
  value %= 1;
  return value < 0 ? value + 1 : value;
}

function pointFromJSON(point) {
  if (Array.isArray(point)) {
    return new THREE.Vector3(Number(point[0]) || 0, Number(point[1]) || 0, Number(point[2]) || 0);
  }
  return new THREE.Vector3(
    Number(point.x) || 0,
    Number(point.elevation ?? point.y) || 0,
    Number(point.z) || 0,
  );
}

function bankFromJSON(point) {
  const bank = Array.isArray(point) ? point[3] : (point.banking ?? point.bank ?? 0);
  return THREE.MathUtils.degToRad(Number(bank) || 0);
}

function makeRoadTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const i = (y * canvas.width + x) * 4;
      const noise = ((x * 17 + y * 31 + x * y * 3) % 19) - 9;
      const base = 52 + noise;
      image.data[i] = base;
      image.data[i + 1] = base + 4;
      image.data[i + 2] = base + 8;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  ctx.fillStyle = 'rgba(18, 22, 27, .54)';
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = 'rgba(246, 239, 213, .94)';
  ctx.fillRect(5, 0, 5, 256);
  ctx.fillRect(246, 0, 5, 256);
  ctx.fillStyle = 'rgba(235, 234, 214, .8)';
  for (let y = 0; y < 256; y += 48) ctx.fillRect(125, y + 4, 6, 28);
  ctx.fillStyle = 'rgba(13, 16, 20, .25)';
  ctx.fillRect(39, 0, 7, 256);
  ctx.fillRect(209, 0, 7, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 4.5);
  texture.anisotropy = 2;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeRimGeometry(samples, width, yOffset, outerOffset) {
  const count = samples.length;
  const positions = new Float32Array(count * 2 * 3);
  const uvs = new Float32Array(count * 2 * 2);
  const indices = new Uint16Array(count * 6);
  const left = new THREE.Vector3();
  const right = new THREE.Vector3();
  const p = new THREE.Vector3();
  let distance = 0;
  for (let i = 0; i < count; i += 1) {
    const sample = samples[i];
    const next = samples[(i + 1) % count];
    p.copy(sample.position);
    left.copy(sample.right).multiplyScalar(width * 0.5 + outerOffset);
    right.copy(sample.right).multiplyScalar(-width * 0.5 - outerOffset);
    const base = i * 6;
    positions[base] = p.x + left.x;
    positions[base + 1] = p.y + yOffset;
    positions[base + 2] = p.z + left.z;
    positions[base + 3] = p.x + right.x;
    positions[base + 4] = p.y + yOffset;
    positions[base + 5] = p.z + right.z;
    const uv = i * 4;
    uvs[uv] = 0;
    uvs[uv + 1] = distance / 24;
    uvs[uv + 2] = 1;
    uvs[uv + 3] = distance / 24;
    const j = (i + 1) % count;
    indices[i * 6] = i * 2;
    indices[i * 6 + 1] = j * 2;
    indices[i * 6 + 2] = i * 2 + 1;
    indices[i * 6 + 3] = i * 2 + 1;
    indices[i * 6 + 4] = j * 2;
    indices[i * 6 + 5] = j * 2 + 1;
    distance += sample.length;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}

function makeRoadGeometry(samples, width, thickness) {
  const count = samples.length;
  const positions = new Float32Array(count * 4 * 3);
  const uvs = new Float32Array(count * 4 * 2);
  const indices = new Uint16Array(count * 24);
  const p = new THREE.Vector3();
  const edge = new THREE.Vector3();
  let distance = 0;
  for (let i = 0; i < count; i += 1) {
    const sample = samples[i];
    p.copy(sample.position);
    const next = samples[(i + 1) % count];
    edge.copy(sample.right).multiplyScalar(width * 0.5);
    const offset = i * 12;
    // top-left, top-right, bottom-left, bottom-right
    positions[offset] = p.x + edge.x;
    positions[offset + 1] = p.y + 0.02;
    positions[offset + 2] = p.z + edge.z;
    positions[offset + 3] = p.x - edge.x;
    positions[offset + 4] = p.y + 0.02;
    positions[offset + 5] = p.z - edge.z;
    positions[offset + 6] = p.x + edge.x;
    positions[offset + 7] = p.y - thickness;
    positions[offset + 8] = p.z + edge.z;
    positions[offset + 9] = p.x - edge.x;
    positions[offset + 10] = p.y - thickness;
    positions[offset + 11] = p.z - edge.z;
    const uv = i * 8;
    uvs[uv] = 0; uvs[uv + 1] = distance / 32;
    uvs[uv + 2] = 1; uvs[uv + 3] = distance / 32;
    uvs[uv + 4] = 0; uvs[uv + 5] = distance / 32;
    uvs[uv + 6] = 1; uvs[uv + 7] = distance / 32;
    const j = (i + 1) % count;
    const a = i * 4;
    const b = j * 4;
    const k = i * 24;
    // Top, bottom, left side, right side.
    indices[k] = a; indices[k + 1] = b; indices[k + 2] = a + 1;
    indices[k + 3] = a + 1; indices[k + 4] = b; indices[k + 5] = b + 1;
    indices[k + 6] = a + 2; indices[k + 7] = a + 3; indices[k + 8] = b + 2;
    indices[k + 9] = a + 3; indices[k + 10] = b + 3; indices[k + 11] = b + 2;
    indices[k + 12] = a; indices[k + 13] = a + 2; indices[k + 14] = b;
    indices[k + 15] = a + 2; indices[k + 16] = b + 2; indices[k + 17] = b;
    indices[k + 18] = a + 1; indices[k + 19] = b + 1; indices[k + 20] = a + 3;
    indices[k + 21] = a + 3; indices[k + 22] = b + 1; indices[k + 23] = b + 3;
    distance += sample.length;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}

function instanceMatrix(position, quaternion, scale, matrix) {
  matrix.compose(position, quaternion, scale);
  return matrix;
}

function buildBarrier(group, samples, width, palette) {
  const max = Math.ceil(samples.length / 3) * 2;
  const post = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.18, 1.25, 0.18),
    new THREE.MeshStandardMaterial({ color: palette.post, roughness: 0.7 }),
    max,
  );
  const rail = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.16, 0.18, 3.4),
    new THREE.MeshStandardMaterial({ color: palette.rail, roughness: 0.55, metalness: 0.15 }),
    max,
  );
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const position = new THREE.Vector3();
  let index = 0;
  for (let i = 0; i < samples.length; i += 3) {
    const sample = samples[i];
    const yaw = Math.atan2(sample.tangent.x, sample.tangent.z);
    quaternion.setFromAxisAngle(UP, yaw);
    for (const side of [-1, 1]) {
      position.copy(sample.position).addScaledVector(sample.right, side * (width * 0.5 + 1.15));
      position.y += 0.64;
      instanceMatrix(position, quaternion, scale, matrix);
      post.setMatrixAt(index, matrix);
      position.y += 0.18;
      instanceMatrix(position, quaternion, scale, matrix);
      rail.setMatrixAt(index, matrix);
      index += 1;
    }
  }
  post.count = index;
  rail.count = index;
  post.instanceMatrix.needsUpdate = true;
  rail.instanceMatrix.needsUpdate = true;
  group.add(post, rail);
  return [post, rail];
}

function buildCurbs(group, samples, width, curbSamples) {
  const max = Math.max(2, curbSamples.length * 2);
  const geometry = new THREE.BoxGeometry(0.82, 0.16, 2.25);
  const red = new THREE.InstancedMesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: 0xb92d31, roughness: 0.72 }),
    max,
  );
  const white = new THREE.InstancedMesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: 0xf2ead7, roughness: 0.68 }),
    max,
  );
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const position = new THREE.Vector3();
  let redIndex = 0;
  let whiteIndex = 0;
  for (let i = 0; i < curbSamples.length; i += 1) {
    const sample = curbSamples[i];
    const yaw = Math.atan2(sample.tangent.x, sample.tangent.z);
    quaternion.setFromAxisAngle(UP, yaw);
    const stripe = i % 2 === 0 ? red : white;
    for (const side of [-1, 1]) {
      position.copy(sample.position).addScaledVector(sample.right, side * (width * 0.5 + 0.32));
      position.y += 0.11;
      instanceMatrix(position, quaternion, scale, matrix);
      const slot = stripe === red ? redIndex++ : whiteIndex++;
      stripe.setMatrixAt(slot, matrix);
    }
  }
  // The two sides of a curb use the same alternating colour slot, so the
  // counts are the actual number of matrices written rather than a guess.
  red.count = Math.min(redIndex, max);
  white.count = Math.min(whiteIndex, max);
  red.instanceMatrix.needsUpdate = true;
  white.instanceMatrix.needsUpdate = true;
  group.add(red, white);
  geometry.computeBoundingSphere();
  return [red, white];
}

function buildGate(group, frame, width, color, label) {
  const gate = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.28 });
  const postGeometry = new THREE.BoxGeometry(0.28, 4.1, 0.28);
  const topGeometry = new THREE.BoxGeometry(width + 1.4, 0.32, 0.32);
  const left = new THREE.Mesh(postGeometry, material);
  const right = new THREE.Mesh(postGeometry, material);
  const top = new THREE.Mesh(topGeometry, material);
  const lateralYaw = Math.atan2(-frame.right.z, frame.right.x);
  top.rotation.y = lateralYaw;
  left.position.copy(frame.position).addScaledVector(frame.right, -width * 0.5 - 0.46);
  right.position.copy(frame.position).addScaledVector(frame.right, width * 0.5 + 0.46);
  left.position.y += 2.05;
  right.position.y += 2.05;
  top.position.copy(frame.position);
  top.position.y += 4.08;
  gate.add(left, right, top);
  if (label && typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#101722'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#f6ead1'; ctx.font = '700 30px system-ui';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, 128, 34);
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(width * 0.72, 0.68),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), toneMapped: false, side: THREE.DoubleSide }),
    );
    board.position.copy(frame.position);
    board.position.y += 3.45;
    board.rotation.y = lateralYaw;
    gate.add(board);
  }
  group.add(gate);
}

function buildDistanceMarkers(group, samples, width, markers, color) {
  const markerList = Array.isArray(markers) && markers.length
    ? markers : [{ at: 0.22, label: '3' }, { at: 0.46, label: '2' }, { at: 0.7, label: '1' }];
  for (let i = 0; i < markerList.length; i += 1) {
    const marker = markerList[i];
    const frame = samples[Math.floor(wrap01(Number(marker.at) || 0) * samples.length) % samples.length];
    const side = i % 2 ? -1 : 1;
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 1.55, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x20242d, roughness: 0.62 }),
    );
    post.position.copy(frame.position).addScaledVector(frame.right, side * (width * 0.5 + 1.35));
    post.position.y += 0.78;
    const boardCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    let boardMaterial;
    if (boardCanvas) {
      boardCanvas.width = 128; boardCanvas.height = 96;
      const context = boardCanvas.getContext('2d');
      context.fillStyle = `#${new THREE.Color(color).getHexString()}`;
      context.fillRect(0, 0, 128, 96);
      context.fillStyle = '#101722';
      context.font = '900 64px system-ui'; context.textAlign = 'center'; context.textBaseline = 'middle';
      context.fillText(String(marker.label ?? i + 1), 64, 50);
      boardMaterial = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(boardCanvas), toneMapped: false, side: THREE.DoubleSide });
    } else {
      boardMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.58, side: THREE.DoubleSide });
    }
    const board = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 0.92), boardMaterial);
    board.position.copy(post.position);
    board.position.y += 0.64;
    board.rotation.y = Math.atan2(frame.tangent.x, frame.tangent.z);
    group.add(post, board);
  }
}

export function createTrack(trackJSON, options = {}) {
  if (!trackJSON || !Array.isArray(trackJSON.controlPoints) || trackJSON.controlPoints.length < 4) {
    throw new Error('GGRacer trackJSON needs at least four controlPoints');
  }
  const data = trackJSON;
  const width = Number(data.width) || 12;
  const controlPoints = data.controlPoints.map(pointFromJSON);
  const banks = data.controlPoints.map(bankFromJSON);
  const curve = new THREE.CatmullRomCurve3(controlPoints, true, 'catmullrom', 0.5);
  const sampleCount = clamp(Number(data.sampleCount) || controlPoints.length * 18, 96, 320);
  const samples = new Array(sampleCount);
  const point = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  let previous = null;
  for (let i = 0; i < sampleCount; i += 1) {
    const t = i / sampleCount;
    curve.getPointAt(t, point);
    curve.getTangentAt(t, tangent).normalize();
    right.set(tangent.z, 0, -tangent.x);
    if (right.lengthSq() < EPS) right.set(1, 0, 0);
    right.normalize();
    up.crossVectors(tangent, right).normalize();
    const controlT = t * controlPoints.length;
    const controlIndex = Math.floor(controlT) % controlPoints.length;
    const nextIndex = (controlIndex + 1) % controlPoints.length;
    const bank = THREE.MathUtils.lerp(banks[controlIndex], banks[nextIndex], controlT - Math.floor(controlT));
    right.applyAxisAngle(tangent, bank);
    up.applyAxisAngle(tangent, bank);
    const length = previous ? point.distanceTo(previous) : 0;
    samples[i] = {
      t,
      position: point.clone(),
      tangent: tangent.clone(),
      right: right.clone(),
      up: up.clone(),
      bank,
      length,
    };
    previous = point.clone();
  }
  // The closing segment is useful for UVs, frame queries, and distance tests.
  samples[0].length = samples[sampleCount - 1].position.distanceTo(samples[0].position);

  const root = new THREE.Group();
  root.name = data.name || data.id || 'GGRacer Track';
  const roadTexture = makeRoadTexture();
  const roadMaterial = new THREE.MeshStandardMaterial({
    color: options.roadColor || 0xffffff,
    map: roadTexture,
    emissive: options.roadEmissive || 0x000000,
    emissiveIntensity: Number(options.roadEmissiveIntensity) || 0,
    roughness: 0.86,
    metalness: 0.08,
  });
  const road = new THREE.Mesh(makeRoadGeometry(samples, width, 0.24), roadMaterial);
  road.name = 'textured extruded asphalt ribbon';
  root.add(road);
  const rumbleMaterial = new THREE.MeshStandardMaterial({ color: 0xeee4d1, roughness: 0.82 });
  const rumble = new THREE.Mesh(makeRimGeometry(samples, 0.55, 0.075, width * 0.5 + 0.12), rumbleMaterial);
  rumble.name = 'contrasting edge rumble strips';
  root.add(rumble);

  const curbSamples = [];
  const curbPoints = data.controlPoints.map((p, i) => p.curb ? i : -1).filter((i) => i >= 0);
  for (let c = 0; c < curbPoints.length; c += 1) {
    const center = Math.round((curbPoints[c] / controlPoints.length) * sampleCount);
    for (let offset = -3; offset <= 3; offset += 1) {
      curbSamples.push(samples[(center + offset + sampleCount) % sampleCount]);
    }
  }
  buildCurbs(root, samples, width, curbSamples);
  const barrierPalette = options.barrierPalette || { post: 0xc6b79a, rail: 0x6f4d39 };
  buildBarrier(root, samples, width, barrierPalette);

  const gateGroup = new THREE.Group();
  gateGroup.name = 'sector gates and start gantry';
  buildGate(gateGroup, samples[0], width, options.gateColor || 0xe8b54d, 'START / FINISH');
  const sectors = Array.isArray(data.sectors) && data.sectors.length
    ? data.sectors : [{ id: 1, at: 0.25 }, { id: 2, at: 0.5 }, { id: 3, at: 0.75 }];
  for (let i = 0; i < sectors.length; i += 1) {
    const at = wrap01(Number(sectors[i].at) || 0);
    if (at > 0.01) buildGate(gateGroup, samples[Math.floor(at * sampleCount) % sampleCount], width, options.sectorColor || 0x75c9cf, `SECTOR ${sectors[i].id ?? i + 1}`);
  }
  buildDistanceMarkers(gateGroup, samples, width, data.distanceMarkers, options.markerColor || 0xf1c454);
  root.add(gateGroup);

  const query = {
    progress: 0,
    distance: 0,
    lateral: 0,
    offroad: false,
    sector: 0,
    position: new THREE.Vector3(),
    tangent: new THREE.Vector3(),
    right: new THREE.Vector3(),
    up: new THREE.Vector3(),
  };
  const frameCache = {
    progress: 0,
    position: new THREE.Vector3(),
    tangent: new THREE.Vector3(),
    right: new THREE.Vector3(),
    up: new THREE.Vector3(),
    bank: 0,
  };
  const racingLine = Array.isArray(data.racingLine) ? data.racingLine : [];
  const trackLength = samples.reduce((sum, sample) => sum + sample.length, 0);
  const checkpointResult = { sector: 0, crossed: false };

  function sampleAt(progress, out = frameCache) {
    const t = wrap01(progress);
    const scaled = t * sampleCount;
    const index = Math.floor(scaled) % sampleCount;
    const next = (index + 1) % sampleCount;
    const mix = scaled - Math.floor(scaled);
    const a = samples[index];
    const b = samples[next];
    out.progress = t;
    out.position.lerpVectors(a.position, b.position, mix);
    out.tangent.lerpVectors(a.tangent, b.tangent, mix).normalize();
    out.right.lerpVectors(a.right, b.right, mix).normalize();
    out.up.lerpVectors(a.up, b.up, mix).normalize();
    out.bank = THREE.MathUtils.lerp(a.bank, b.bank, mix);
    return out;
  }

  function lineLateral(progress) {
    if (!racingLine.length) return 0;
    const t = wrap01(progress);
    let before = racingLine[racingLine.length - 1];
    let after = racingLine[0];
    for (let i = 0; i < racingLine.length; i += 1) {
      if (Number(racingLine[i].at) <= t) before = racingLine[i];
      if (Number(racingLine[i].at) > t) { after = racingLine[i]; break; }
    }
    let span = Number(after.at) - Number(before.at);
    if (span <= 0) span += 1;
    let delta = t - Number(before.at);
    if (delta < 0) delta += 1;
    return THREE.MathUtils.lerp(Number(before.lateral) || 0, Number(after.lateral) || 0, clamp(delta / span, 0, 1));
  }

  function sampleRacingLine(progress, out = frameCache) {
    sampleAt(progress, out);
    out.position.addScaledVector(out.right, lineLateral(progress));
    return out;
  }

  function closestPoint(worldPosition, out = query) {
    let best = Infinity;
    let bestIndex = 0;
    for (let i = 0; i < sampleCount; i += 1) {
      const sample = samples[i];
      const distance = sample.position.distanceToSquared(worldPosition);
      if (distance < best) { best = distance; bestIndex = i; }
    }
    const sample = samples[bestIndex];
    const dx = worldPosition.x - sample.position.x;
    const dy = worldPosition.y - sample.position.y;
    const dz = worldPosition.z - sample.position.z;
    out.progress = bestIndex / sampleCount;
    out.distance = Math.sqrt(best);
    out.lateral = dx * sample.right.x + dy * sample.right.y + dz * sample.right.z;
    out.position.copy(sample.position);
    out.tangent.copy(sample.tangent);
    out.right.copy(sample.right);
    out.up.copy(sample.up);
    out.sector = getSector(out.progress);
    out.offroad = Math.abs(out.lateral) > width * 0.5 + 1.05;
    return out;
  }

  function getSector(progress) {
    const t = wrap01(progress);
    let sector = 0;
    for (let i = 0; i < sectors.length; i += 1) {
      if (t >= Number(sectors[i].at || 0)) sector = i;
    }
    return sector;
  }

  function checkpoint(progress, state = {}) {
    const sector = getSector(progress);
    const previous = Number(state.sector ?? -1);
    const crossed = sector !== previous;
    state.sector = sector;
    state.progress = wrap01(progress);
    checkpointResult.sector = sector;
    checkpointResult.crossed = crossed;
    return checkpointResult;
  }

  function exportMinimap() {
    const result = new Array(sampleCount);
    for (let i = 0; i < sampleCount; i += 1) result[i] = { x: samples[i].position.x, z: samples[i].position.z };
    return result;
  }

  return {
    data,
    root,
    width,
    sampleCount,
    length: trackLength,
    samples,
    sampleAt,
    sampleRacingLine,
    closestPoint,
    isOffroad(position, margin = 1.05) {
      const result = closestPoint(position);
      return Math.abs(result.lateral) > width * 0.5 + margin;
    },
    getSector,
    checkpoint,
    exportMinimap,
    dispose() {
      root.traverse((object) => {
        if (object.geometry) object.geometry.dispose();
        if (object.material) {
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => {
            if (material.map) material.map.dispose();
            material.dispose();
          });
        }
      });
      controlPoints.length = 0;
      samples.length = 0;
    },
  };
}

export const TRACK_JSON_SCHEMA = {
  version: 1,
  controlPoints: '{ x, z, elevation?, banking?, curb? }[]',
  turns: '{ number, at, name, type }[] optional authoring metadata',
  width: 'road width in metres',
  sectors: '{ id, at }[] where at is normalized progress 0..1',
  distanceMarkers: '{ at, label }[] for roadside braking boards',
  racingLine: '{ at, lateral }[] where lateral is metres from center',
};
