import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);

const THEMES = {
  desert: {
    skyTop: 0x1a4b87, skyMid: 0xd06c46, skyBottom: 0xf2c37c,
    horizon: 0xc88768, fog: 0xc88768, fogNear: 160, fogFar: 580,
    ground: 0x9d713e, groundAlt: 0xc28b4d, propA: 0x6a3e28, propB: 0x315842,
    silhouette: 'mesa', cloud: 0xffdcc0, accent: 0xffd15c,
  },
  coastal: {
    skyTop: 0x287bb4, skyMid: 0x74c6cf, skyBottom: 0xc2eff0,
    horizon: 0x7bb5a9, fog: 0x8cc4c7, fogNear: 150, fogFar: 620,
    ground: 0x4f8b63, groundAlt: 0x9fbf79, propA: 0x2d674e, propB: 0xd3ba7a,
    silhouette: 'island', cloud: 0xf4ffff, accent: 0x7de4eb,
  },
  alpine: {
    skyTop: 0x274e83, skyMid: 0x8db8d1, skyBottom: 0xe4f1e5,
    horizon: 0x9bb9b7, fog: 0x9bb9b7, fogNear: 145, fogFar: 600,
    ground: 0x49624d, groundAlt: 0x738267, propA: 0x294b3c, propB: 0x8c887a,
    silhouette: 'peaks', cloud: 0xf4fbff, accent: 0xd6ecff,
  },
  'night-city': {
    skyTop: 0x060b25, skyMid: 0x111b48, skyBottom: 0x3a3761,
    horizon: 0x171c38, fog: 0x20274a, fogNear: 120, fogFar: 510,
    ground: 0x2b3447, groundAlt: 0x3e4d66, propA: 0x26334a, propB: 0x477d98,
    silhouette: 'city', cloud: 0x303a67, accent: 0x62e9ee,
  },
};

function palette(theme) {
  return THEMES[theme] || THEMES.desert;
}

function seeded(seed) {
  let value = seed >>> 0;
  return function random() {
    value = Math.imul(value ^ value >>> 16, 2246822519);
    value = Math.imul(value ^ value >>> 13, 3266489917);
    return ((value ^= value >>> 16) >>> 0) / 4294967296;
  };
}

function makeGroundTexture(colors) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = `#${new THREE.Color(colors.ground).getHexString()}`;
  ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 16) {
    for (let x = 0; x < 256; x += 16) {
      const shade = ((x * 13 + y * 7) % 23) - 11;
      ctx.fillStyle = `rgba(${shade > 0 ? 255 : 0},${shade > 0 ? 220 : 0},${shade > 0 ? 120 : 0},${Math.abs(shade) / 180})`;
      ctx.fillRect(x + (y % 32) / 4, y, 13, 13);
    }
  }
  ctx.strokeStyle = 'rgba(28, 31, 25, .18)';
  ctx.lineWidth = 2;
  for (let i = -256; i < 512; i += 42) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 256, 256); ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(10, 10);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeSkyDome(colors) {
  const geometry = new THREE.SphereGeometry(760, 32, 16);
  const position = geometry.getAttribute('position');
  const color = new THREE.Color();
  const top = new THREE.Color(colors.skyTop);
  const mid = new THREE.Color(colors.skyMid);
  const bottom = new THREE.Color(colors.skyBottom);
  const array = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i) / 760;
    const mix = Math.max(0, Math.min(1, (y + 0.12) / 1.12));
    if (mix < 0.5) color.lerpColors(bottom, mid, mix * 2);
    else color.lerpColors(mid, top, (mix - 0.5) * 2);
    color.toArray(array, i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(array, 3));
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, depthWrite: false });
  const dome = new THREE.Mesh(geometry, material);
  dome.name = 'gradient sky dome';
  return dome;
}

function makeCardTexture(kind, colors, detail = 1) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 192;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = `#${new THREE.Color(colors.horizon).getHexString()}`;
  if (kind === 'city') {
    for (let x = 0; x < canvas.width; x += 26 + detail * 4) {
      const h = 38 + ((x * 17) % 100);
      ctx.fillRect(x, canvas.height - h, 22 + ((x / 26) % 4) * 4, h);
      ctx.fillStyle = `#${new THREE.Color(colors.groundAlt).getHexString()}`;
      for (let y = canvas.height - h + 12; y < canvas.height - 8; y += 17) {
        if ((x + y) % 3 !== 0) ctx.fillRect(x + 5, y, 4, 5);
        if ((x + y) % 4 !== 0) ctx.fillRect(x + 14, y, 4, 5);
      }
      ctx.fillStyle = `#${new THREE.Color(colors.horizon).getHexString()}`;
    }
  } else {
    ctx.beginPath(); ctx.moveTo(0, canvas.height);
    for (let x = 0; x <= canvas.width; x += 24) {
      const wave = Math.sin(x * 0.036 + detail) * 25 + Math.sin(x * 0.011) * 28;
      const height = kind === 'peaks' ? 92 + Math.abs(Math.sin(x * 0.017)) * 48 : 50 + wave;
      ctx.lineTo(x, canvas.height - height);
    }
    ctx.lineTo(canvas.width, canvas.height); ctx.closePath();
    ctx.fill();
    if (kind === 'mesa') {
      ctx.fillStyle = `#${new THREE.Color(colors.groundAlt).getHexString()}`;
      for (let x = 12; x < canvas.width; x += 70) ctx.fillRect(x, 120 + (x % 4) * 6, 54, 72);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeCloudTexture(colors) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 96;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 96);
  gradient.addColorStop(0, `rgba(${new THREE.Color(colors.cloud).r * 255},${new THREE.Color(colors.cloud).g * 255},${new THREE.Color(colors.cloud).b * 255},0)`);
  gradient.addColorStop(0.48, `rgba(${new THREE.Color(colors.cloud).r * 255},${new THREE.Color(colors.cloud).g * 255},${new THREE.Color(colors.cloud).b * 255},.62)`);
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.ellipse(128, 50, 112, 25, 0, 0, Math.PI * 2);
  ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function addHorizon(group, colors, theme, random) {
  const layers = [
    { radius: 350, y: 18, scale: 190, opacity: 0.96, count: 9 },
    { radius: 480, y: 30, scale: 230, opacity: 0.78, count: 11 },
    { radius: 625, y: 50, scale: 280, opacity: 0.58, count: 13 },
  ];
  for (let layerIndex = 0; layerIndex < layers.length; layerIndex += 1) {
    const layer = layers[layerIndex];
    const texture = makeCardTexture(colors.silhouette, colors, layerIndex + 1);
    const material = new THREE.SpriteMaterial({
      map: texture, color: 0xffffff, transparent: true, opacity: layer.opacity,
      depthWrite: false, fog: false,
    });
    for (let i = 0; i < layer.count; i += 1) {
      const sprite = new THREE.Sprite(material);
      const angle = (i / layer.count) * Math.PI * 2 + random() * 0.18;
      const radius = layer.radius + (random() - 0.5) * 48;
      sprite.position.set(Math.cos(angle) * radius, layer.y + random() * 24, Math.sin(angle) * radius);
      sprite.scale.set(layer.scale * (0.75 + random() * 0.4), layer.scale * 0.58, 1);
      sprite.name = `horizon ${theme} parallax ${layerIndex + 1}`;
      group.add(sprite);
    }
  }
}

function addClouds(group, colors, random, tierCounts) {
  const texture = makeCloudTexture(colors);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 0.72, fog: false });
  const max = tierCounts[2];
  const clouds = new Array(max);
  for (let i = 0; i < max; i += 1) {
    const cloud = new THREE.Sprite(material);
    const angle = random() * Math.PI * 2;
    const radius = 160 + random() * 430;
    cloud.position.set(Math.cos(angle) * radius, 46 + random() * 70, Math.sin(angle) * radius);
    cloud.scale.set(70 + random() * 90, 26 + random() * 28, 1);
    cloud.visible = i < tierCounts[1];
    group.add(cloud);
    clouds[i] = cloud;
  }
  return { clouds, max, tierCounts };
}

function addInstanced(group, geometry, material, matrices, name) {
  const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
  mesh.name = name;
  for (let i = 0; i < matrices.length; i += 1) mesh.setMatrixAt(i, matrices[i]);
  mesh.instanceMatrix.needsUpdate = true;
  group.add(mesh);
  return mesh;
}

function matrixAt(position, yaw, scale, matrix, quaternion) {
  quaternion.setFromAxisAngle(UP, yaw);
  matrix.compose(position, quaternion, scale);
  return matrix.clone();
}

function addBillboards(group, track, theme, colors, random) {
  if (typeof document === 'undefined') return [];
  const canvas = document.createElement('canvas');
  canvas.width = 320; canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = theme === 'night-city' ? '#12283c' : '#7f3d2f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = `#${new THREE.Color(colors.accent).getHexString()}`;
  ctx.font = '800 32px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(theme === 'night-city' ? 'GG / NIGHT RUN' : 'GREENGUARD GRAND PRIX', 160, 48);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false });
  const boards = [];
  const frame = { position: new THREE.Vector3(), tangent: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3() };
  for (let i = 0; i < 9; i += 1) {
    const progress = (i * 0.113 + 0.08) % 1;
    track.sampleAt(progress, frame);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 1.5), material);
    board.position.copy(frame.position).addScaledVector(frame.right, (i % 2 ? 1 : -1) * (track.width * 0.5 + 4.4));
    board.position.y += 2.3 + random() * 1.3;
    // The chase camera approaches the board from behind its forward-facing
    // side. Turn the readable face toward the racing direction so the canvas
    // text is not seen through the back of the double-sided plane.
    board.rotation.y = Math.atan2(-frame.tangent.x, -frame.tangent.z);
    boards.push(board);
    group.add(board);
  }
  return boards;
}

function addCrowdStands(group, track, colors) {
  const standGroup = new THREE.Group();
  standGroup.name = 'trackside crowd stands';
  const deckMaterial = new THREE.MeshStandardMaterial({ color: colors.propB, roughness: 0.82, flatShading: true });
  const railMaterial = new THREE.MeshStandardMaterial({ color: colors.accent, roughness: 0.58, metalness: 0.18 });
  let crowdMap = null;
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const context = canvas.getContext('2d');
    context.fillStyle = '#172135'; context.fillRect(0, 0, 256, 64);
    for (let x = 8; x < 256; x += 16) {
      context.fillStyle = x % 32 ? '#f1bd79' : '#69cbd0';
      context.beginPath(); context.arc(x, 22 + (x % 3) * 3, 6, 0, Math.PI * 2); context.fill();
      context.fillRect(x - 7, 30, 14, 24);
    }
    crowdMap = new THREE.CanvasTexture(canvas);
    crowdMap.colorSpace = THREE.SRGBColorSpace;
  }
  const crowdMaterial = new THREE.MeshBasicMaterial({ map: crowdMap, color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
  const deckGeometry = new THREE.BoxGeometry(8, 0.28, 1.2);
  const railGeometry = new THREE.BoxGeometry(8.2, 0.16, 0.12);
  for (let i = 0; i < 4; i += 1) {
    const frame = { position: new THREE.Vector3(), tangent: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3() };
    track.sampleAt(0.07 + i * 0.23, frame);
    const stand = new THREE.Group();
    const side = i % 2 ? -1 : 1;
    stand.position.copy(frame.position).addScaledVector(frame.right, side * (track.width * 0.5 + 10));
    stand.position.y -= 0.5;
    stand.rotation.y = Math.atan2(frame.tangent.x, frame.tangent.z);
    for (let row = 0; row < 3; row += 1) {
      const deck = new THREE.Mesh(deckGeometry, deckMaterial);
      deck.position.set(0, row * 0.66, -row * 0.45);
      stand.add(deck);
    }
    const rail = new THREE.Mesh(railGeometry, railMaterial);
    rail.position.set(0, 2.12, -1.35);
    stand.add(rail);
    const crowd = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 1.7), crowdMaterial);
    crowd.position.set(0, 1.35, -1.28);
    crowd.rotation.y = Math.PI;
    stand.add(crowd);
    standGroup.add(stand);
  }
  group.add(standGroup);
  return standGroup;
}

function addDesertDressing(group, track, colors, random, tierCounts) {
  const high = tierCounts[2];
  const rocks = [];
  const cacti = [];
  const cactusArms = [];
  const frame = { position: new THREE.Vector3(), tangent: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3() };
  const position = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  for (let i = 0; i < high; i += 1) {
    const progress = (i / high * 0.98 + random() * 0.025) % 1;
    const side = i % 2 ? 1 : -1;
    track.sampleAt(progress, frame);
    const lateral = track.width * 0.5 + 5 + random() * 21;
    position.copy(frame.position).addScaledVector(frame.right, side * lateral);
    position.y -= 0.15;
    rocks.push(matrixAt(position, random() * Math.PI, new THREE.Vector3(0.7 + random() * 1.5, 0.45 + random() * 0.9, 0.8 + random() * 1.4), matrix, quaternion));
    if (i < high * 0.62) {
      position.y += 1.4;
      cacti.push(matrixAt(position, random() * Math.PI, new THREE.Vector3(0.28 + random() * 0.25, 1.4 + random() * 1.7, 0.28 + random() * 0.25), matrix, quaternion));
      if (i % 3 === 0) {
        position.x += side * 0.45; position.y += 0.55;
        cactusArms.push(matrixAt(position, Math.PI * 0.5, new THREE.Vector3(0.26, 0.72, 0.26), matrix, quaternion));
      }
    }
  }
  const rock = addInstanced(group, new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: colors.propB, flatShading: true, roughness: 0.94 }), rocks, 'desert rock dressing');
  const cactus = addInstanced(group, new THREE.CylinderGeometry(1, 1, 2, 7), new THREE.MeshStandardMaterial({ color: colors.propA, flatShading: true, roughness: 0.9 }), cacti, 'desert cactus dressing');
  const arms = addInstanced(group, new THREE.CylinderGeometry(1, 1, 2, 7), cactus.material, cactusArms, 'desert cactus arms');
  return { meshes: [rock, cactus, arms], max: high, tierCounts };
}

function addNaturalDressing(group, track, colors, random, tierCounts) {
  const high = tierCounts[2];
  const trunks = [];
  const crowns = [];
  const rocks = [];
  const frame = { position: new THREE.Vector3(), tangent: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3() };
  const position = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  for (let i = 0; i < high; i += 1) {
    const progress = (i / high * 0.98 + random() * 0.025) % 1;
    track.sampleAt(progress, frame);
    const side = i % 2 ? 1 : -1;
    const lateral = track.width * 0.5 + 5 + random() * 18;
    position.copy(frame.position).addScaledVector(frame.right, side * lateral);
    const height = 2.2 + random() * 3.5;
    position.y = frame.position.y + height * 0.5 - 0.2;
    trunks.push(matrixAt(position, random() * Math.PI, new THREE.Vector3(0.28, height, 0.28), matrix, quaternion));
    position.y += height * 0.62;
    crowns.push(matrixAt(position, random() * Math.PI, new THREE.Vector3(1.6 + random() * 1.2, 1.8 + random() * 1.5, 1.6 + random() * 1.2), matrix, quaternion));
    position.y = frame.position.y + 0.35;
    rocks.push(matrixAt(position, random() * Math.PI, new THREE.Vector3(0.6 + random(), 0.4 + random() * 0.55, 0.6 + random()), matrix, quaternion));
  }
  const trunk = addInstanced(group, new THREE.CylinderGeometry(0.8, 1, 2, 6), new THREE.MeshStandardMaterial({ color: colors.propB, flatShading: true, roughness: 0.9 }), trunks, 'natural tree trunks');
  const crown = addInstanced(group, new THREE.ConeGeometry(1, 2, 7), new THREE.MeshStandardMaterial({ color: colors.propA, flatShading: true, roughness: 0.88 }), crowns, 'natural tree crowns');
  const rock = addInstanced(group, new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: colors.propB, flatShading: true, roughness: 0.95 }), rocks, 'natural rocks');
  return { meshes: [trunk, crown, rock], max: high, tierCounts };
}

function addCityDressing(group, track, colors, random, tierCounts) {
  const high = tierCounts[2];
  const buildings = [];
  const rooftops = [];
  const windows = [];
  const frame = { position: new THREE.Vector3(), tangent: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3() };
  const position = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const windowScale = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < high; i += 1) {
    const progress = (i / high * 0.98 + random() * 0.02) % 1;
    track.sampleAt(progress, frame);
    const side = i % 2 ? 1 : -1;
    const lateral = track.width * 0.5 + 7 + random() * 24;
    const width = 2.8 + random() * 5.2;
    const depth = 2.6 + random() * 5.2;
    const height = 5 + random() * 18;
    const yaw = Math.atan2(frame.tangent.x, frame.tangent.z) + (random() - 0.5) * 0.2;
    position.copy(frame.position).addScaledVector(frame.right, side * lateral);
    position.y = frame.position.y + height * 0.5 - 0.5;
    buildings.push(matrixAt(position, yaw, new THREE.Vector3(width, height, depth), matrix, quaternion));
    position.y += height * 0.5 + 0.3;
    rooftops.push(matrixAt(position, yaw, new THREE.Vector3(width * 0.82, 0.35, depth * 0.82), matrix, quaternion));
    for (let row = 0; row < 4; row += 1) {
      position.y = frame.position.y + 1.4 + row * 2.25;
      position.x += frame.right.x * side * 0.03;
      position.z += frame.right.z * side * 0.03;
      windows.push(matrixAt(position, yaw, windowScale, matrix, quaternion));
    }
  }
  const body = addInstanced(group, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: colors.propA, flatShading: true, roughness: 0.86 }), buildings, 'night-city building blocks');
  const tops = addInstanced(group, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: colors.propB, flatShading: true, roughness: 0.68, metalness: 0.1 }), rooftops, 'night-city rooftops');
  const window = addInstanced(group, new THREE.BoxGeometry(0.42, 0.72, 0.06), new THREE.MeshStandardMaterial({ color: colors.accent, emissive: colors.accent, emissiveIntensity: 3.2, toneMapped: false }), windows, 'emissive city windows');
  return { meshes: [body, tops, window], max: high, tierCounts };
}

function addStreetLights(group, track, colors) {
  const count = Math.max(12, Math.floor(track.sampleCount / 8));
  const poles = [];
  const lamps = [];
  const frame = { position: new THREE.Vector3(), tangent: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3() };
  const position = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  for (let i = 0; i < count; i += 1) {
    track.sampleAt((i / count + 0.02) % 1, frame);
    const side = i % 2 ? 1 : -1;
    position.copy(frame.position).addScaledVector(frame.right, side * (track.width * 0.5 + 2.6));
    position.y += 2;
    poles.push(matrixAt(position, Math.atan2(frame.tangent.x, frame.tangent.z), new THREE.Vector3(0.12, 2.4, 0.12), matrix, quaternion));
    position.y += 2.25;
    lamps.push(matrixAt(position, 0, new THREE.Vector3(0.35, 0.35, 0.35), matrix, quaternion));
  }
  const pole = addInstanced(group, new THREE.CylinderGeometry(0.8, 1, 2, 6), new THREE.MeshStandardMaterial({ color: 0x273242, metalness: 0.7, roughness: 0.35 }), poles, 'city light poles');
  const lampColor = 0xffb45f;
  const lamp = addInstanced(group, new THREE.SphereGeometry(1, 8, 6), new THREE.MeshStandardMaterial({ color: lampColor, emissive: lampColor, emissiveIntensity: 4.2, toneMapped: false }), lamps, 'city warm emissive lamps');
  const lights = [];
  // Keep a fixed light pool; the visible lamp hardware remains instanced for
  // the full track while only these nearest-feeling pools affect the road.
  const lightPoolSize = Math.min(10, count);
  for (let i = 0; i < lightPoolSize; i += 1) {
    const light = new THREE.PointLight(lampColor, 2.7, 32, 2);
    light.name = `pooled warm track lamp ${i + 1}`;
    track.sampleAt((i / lightPoolSize + 0.02) % 1, frame);
    light.position.copy(frame.position).addScaledVector(frame.right, (i % 2 ? 1 : -1) * (track.width * 0.5 + 2.6));
    light.position.y += 3.9;
    group.add(light); lights.push(light);
  }
  return { meshes: [pole, lamp], lights };
}

export function createEnvironment(track, options = {}) {
  const theme = options.theme || 'desert';
  const colors = palette(theme);
  const random = seeded(Number(options.seed) || 7117);
  const tierCounts = [Math.max(18, Math.floor(track.sampleCount * 0.42)), Math.max(30, Math.floor(track.sampleCount * 0.7)), Math.max(48, track.sampleCount)];
  const root = new THREE.Group();
  root.name = `${theme} environment`; 
  const sky = makeSkyDome(colors);
  root.add(sky);
  const groundTexture = makeGroundTexture(colors);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1320, 1320),
    new THREE.MeshStandardMaterial({ color: 0xffffff, map: groundTexture, roughness: 1, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI * 0.5;
  ground.position.y = -5.5;
  ground.name = 'generated terrain skirt to horizon';
  root.add(ground);
  addHorizon(root, colors, theme, random);
  const cloudState = addClouds(root, colors, random, [4, 8, 12]);
  const dressing = theme === 'desert'
    ? addDesertDressing(root, track, colors, random, tierCounts)
    : theme === 'night-city'
      ? addCityDressing(root, track, colors, random, tierCounts)
      : addNaturalDressing(root, track, colors, random, tierCounts);
  const boards = addBillboards(root, track, theme, colors, random);
  addCrowdStands(root, track, colors);
  const lightState = theme === 'night-city' ? addStreetLights(root, track, colors) : { meshes: [], lights: [] };
  const detailMeshes = dressing.meshes.concat(lightState.meshes);
  function setQuality(tier) {
    const safeTier = clampTier(tier);
    const factor = [0.38, 0.68, 1][safeTier];
    for (let i = 0; i < dressing.meshes.length; i += 1) {
      const allocated = dressing.meshes[i].instanceMatrix.count;
      const desired = dressing.max * factor * (i === 2 && theme === 'desert' ? 0.6 : 1);
      dressing.meshes[i].count = Math.max(1, Math.min(allocated, Math.floor(desired)));
    }
    for (let i = 0; i < lightState.meshes.length; i += 1) lightState.meshes[i].count = lightState.meshes[i].instanceMatrix.count || lightState.meshes[i].count;
    for (let i = 0; i < cloudState.clouds.length; i += 1) cloudState.clouds[i].visible = i < [4, 8, 12][safeTier];
  }
  function clampTier(tier) { return Math.max(0, Math.min(2, Number(tier) || 0)); }
  setQuality(options.qualityTier ?? 2);

  return {
    root,
    theme,
    colors,
    fog: { color: colors.fog, near: colors.fogNear, far: colors.fogFar },
    detailMeshes,
    setQuality,
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
      boards.length = 0;
      lightState.lights.length = 0;
    },
  };
}

export { THEMES };
