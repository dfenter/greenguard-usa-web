import * as THREE from 'three';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const SILHOUETTES = {
  'lumen-k2': { width: 1.72, length: 5.25, height: .58, nose: .86, canopy: .9, fin: 0, intake: .62, plates: 1 },
  'vanta-arc': { width: 1.48, length: 5.75, height: .5, nose: .72, canopy: .82, fin: .55, intake: .5, plates: 1 },
  'cobalt-rise': { width: 1.98, length: 4.8, height: .68, nose: 1.02, canopy: .98, fin: .16, intake: .76, plates: 2 },
  'ember-vector': { width: 1.38, length: 6.2, height: .48, nose: .66, canopy: .72, fin: .88, intake: .44, plates: 1 },
  'prism-wake': { width: 1.76, length: 5.1, height: .62, nose: .82, canopy: 1.02, fin: .32, intake: .68, plates: 2 },
  'null-comet': { width: 1.22, length: 6.65, height: .43, nose: .56, canopy: .7, fin: .62, intake: .36, plates: 1 },
};

function wedgeGeometry(config) {
  const half = config.width * .5;
  const shape = new THREE.Shape();
  shape.moveTo(-half * .32, 0);
  shape.lineTo(half * .78, .05);
  shape.lineTo(half, config.height * .46);
  shape.lineTo(half * .76, config.height);
  shape.quadraticCurveTo(0, config.height * 1.14, -half * .76, config.height);
  shape.lineTo(-half, config.height * .46);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: config.length,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: .1,
    bevelThickness: .07,
    curveSegments: 2,
  });
  geometry.translate(0, 0, -config.length * .5);
  return geometry;
}

function material(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? .28,
    metalness: options.metalness ?? .72,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    toneMapped: options.toneMapped ?? false,
  });
}

function addMesh(group, geometry, meshMaterial, position, rotation = null) {
  const mesh = new THREE.Mesh(geometry, meshMaterial);
  mesh.position.set(position[0] || 0, position[1] || 0, position[2] || 0);
  if (rotation) mesh.rotation.set(rotation[0] || 0, rotation[1] || 0, rotation[2] || 0);
  group.add(mesh);
  return mesh;
}

export function createMachineKit(options = {}) {
  const config = SILHOUETTES[options.id] || SILHOUETTES['lumen-k2'];
  const root = new THREE.Group();
  root.name = (options.name || 'Ionwake machine') + ' wheel-free anti-grav kit';
  root.scale.setScalar(options.scale || 1);
  const body = new THREE.Group();
  body.name = 'elongated wedge dart hull';
  root.add(body);

  const hullMaterial = material(options.paint || 0x13cbd4, { roughness: .22, metalness: .82 });
  const accentMaterial = material(options.accent || 0xffd36e, { roughness: .2, metalness: .72, emissive: options.accent || 0xffd36e, emissiveIntensity: .12 });
  const darkMaterial = material(0x06111d, { roughness: .22, metalness: .88 });
  const glassMaterial = material(0x8beeff, { roughness: .1, metalness: .2, transparent: true, opacity: .72 });
  const intakeMaterial = material(0x01050a, { roughness: .18, metalness: .9 });
  const engineMaterial = material(0xb8fbff, { roughness: .1, metalness: .2, emissive: 0x16e7ff, emissiveIntensity: 3.6, toneMapped: false });
  const underMaterial = material(0xa6faff, { roughness: .1, metalness: .25, emissive: 0x10d6e5, emissiveIntensity: 2.4, toneMapped: false });
  const warningMaterial = material(0xffca69, { roughness: .16, metalness: .28, emissive: 0xff7b18, emissiveIntensity: 2.8, toneMapped: false });

  const hull = addMesh(body, wedgeGeometry(config), hullMaterial, [0, .28, 0]);
  hull.name = 'single clean anti-grav hull';
  addMesh(body, new THREE.BoxGeometry(config.width * .74, .11, config.length * .7), accentMaterial, [0, .64, -.02]);
  addMesh(body, new THREE.ConeGeometry(config.nose, 1.35, 6), hullMaterial, [0, .48, config.length * .5 + .46], [Math.PI * .5, 0, 0]);

  const canopy = addMesh(body, new THREE.SphereGeometry(1, 12, 8), glassMaterial, [0, .94, -.28]);
  canopy.name = 'low faceted canopy';
  canopy.scale.set(config.canopy * .68, config.canopy * .36, config.canopy * 1.08);
  addMesh(body, new THREE.BoxGeometry(config.width * .52, .08, config.length * .28), accentMaterial, [0, 1.2, -.26]);

  for (const side of [-1, 1]) {
    addMesh(body, new THREE.BoxGeometry(.12, .2, config.length * .56), accentMaterial, [side * config.width * .48, .55, -.05], [0, side * .06, side * .06]);
    addMesh(body, new THREE.BoxGeometry(config.intake, .22, .12), intakeMaterial, [side * config.width * .34, .54, config.length * .3]);
    addMesh(body, new THREE.BoxGeometry(config.intake * .68, .08, .07), engineMaterial, [side * config.width * .34, .56, config.length * .37]);
    if (config.plates > 1) addMesh(body, new THREE.BoxGeometry(.1, .12, config.length * .42), accentMaterial, [side * config.width * .28, .1, -.18], [0, 0, side * .12]);
  }

  if (config.fin) {
    addMesh(body, new THREE.BoxGeometry(.13, config.fin, config.length * .34), accentMaterial, [-config.width * .34, .84, -.78], [0, -.1, -.12]);
    addMesh(body, new THREE.BoxGeometry(.13, config.fin, config.length * .34), accentMaterial, [config.width * .34, .84, -.78], [0, .1, .12]);
  }
  if (options.id === 'vanta-arc' || options.id === 'null-comet') {
    addMesh(body, new THREE.BoxGeometry(.11, .28, config.length * .58), accentMaterial, [0, .78, -.38], [0, 0, options.id === 'null-comet' ? 0 : .08]);
  }
  if (options.id === 'cobalt-rise' || options.id === 'prism-wake') {
    addMesh(body, new THREE.BoxGeometry(config.width * .82, .12, .24), accentMaterial, [0, .72, -config.length * .42]);
  }

  const thrusters = [];
  const engineGlow = [];
  for (const side of [-1, 1]) {
    const nozzle = addMesh(root, new THREE.CylinderGeometry(.22, .29, .5, 10), darkMaterial, [side * config.width * .29, .34, -config.length * .54], [Math.PI * .5, 0, 0]);
    nozzle.name = 'twin rear thruster nozzle';
    thrusters.push(nozzle);
    const glow = addMesh(root, new THREE.SphereGeometry(.25, 10, 8), engineMaterial, [side * config.width * .29, .34, -config.length * .79]);
    glow.name = 'emissive engine glow';
    engineGlow.push(glow);
  }

  const plates = new THREE.Group();
  plates.name = 'underside repulsor plates';
  for (const side of [-1, 1]) {
    addMesh(plates, new THREE.BoxGeometry(config.width * .25, .08, config.length * .32), underMaterial, [side * config.width * .26, -.16, -.2], [0, 0, side * .08]);
  }
  root.add(plates);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(1.6 + config.width * .24, 28), new THREE.MeshBasicMaterial({ color: 0x44efff, transparent: true, opacity: .62, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  pool.name = 'hover light pool on road';
  pool.rotation.x = -Math.PI * .5;
  pool.position.y = -.42;
  root.add(pool);

  for (const side of [-1, 1]) addMesh(body, new THREE.BoxGeometry(.3, .12, .08), warningMaterial, [side * config.width * .3, .67, config.length * .53]);

  let bodyLean = 0;
  let bodyPitch = 0;
  let throttle = 0;
  function update(state = {}, dt = 1 / 60, clock = 0, energy = 100, boost = 0) {
    const speed = Number(state.speed) || 0;
    throttle = throttle + (clamp(speed / 72, 0, 1) - throttle) * (1 - Math.exp(-dt * 7));
    const wantedLean = -(Number(state.steering) || 0) * .12 - (Number(state.lateralG) || 0) * .015;
    const wantedPitch = -(Number(state.acceleration) || 0) * .01 + (Number(state.pitch) || 0);
    const response = 1 - Math.exp(-dt * 12);
    bodyLean += (wantedLean - bodyLean) * response;
    bodyPitch += (wantedPitch - bodyPitch) * response;
    body.rotation.z = bodyLean;
    body.rotation.x = bodyPitch;
    body.position.y = Math.sin(clock * 8 + config.length) * .035;
    const power = throttle + clamp(Number(boost) || 0, 0, 1) * 1.45;
    engineMaterial.emissiveIntensity = 2.8 + power * 4.8 + clamp(energy / 100, 0, 1) * .75;
    underMaterial.emissiveIntensity = 1.8 + power * 2.2;
    pool.material.opacity = .38 + clamp(energy / 100, 0, 1) * .28 + power * .18;
    pool.scale.set(1 + power * .24, 1 + power * .24, 1);
    for (let i = 0; i < engineGlow.length; i += 1) {
      engineGlow[i].scale.setScalar(.76 + power * .75);
      engineGlow[i].position.z = -config.length * (.77 + power * .08);
    }
    for (const nozzle of thrusters) nozzle.scale.z = .92 + power * .16;
  }
  function dispose() {
    root.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((entry) => { if (entry.map) entry.map.dispose(); entry.dispose(); });
      }
    });
  }
  return { root, body, update, dispose, id: options.id, silhouette: config };
}

export const MACHINE_SILHOUETTES = Object.freeze(Object.keys(SILHOUETTES));
