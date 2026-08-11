import * as THREE from 'three';

const DEFAULT_PAINT = 0xd44738;
const DEFAULT_ACCENT = 0xf2c34e;

function roundedShell(width, height, length, bevel = 0.12) {
  const shape = new THREE.Shape();
  const w = width * 0.5;
  shape.moveTo(-w + bevel, 0);
  shape.lineTo(w - bevel, 0);
  shape.quadraticCurveTo(w, 0, w, bevel);
  shape.lineTo(w * 0.94, height - bevel);
  shape.quadraticCurveTo(w * 0.92, height, w * 0.78, height);
  shape.lineTo(-w * 0.78, height);
  shape.quadraticCurveTo(-w * 0.92, height, -w * 0.94, height - bevel);
  shape.lineTo(-w, bevel);
  shape.quadraticCurveTo(-w, 0, -w + bevel, 0);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: length,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: bevel,
    bevelThickness: bevel * 0.72,
    curveSegments: 2,
  });
  geometry.translate(0, 0, -length * 0.5);
  return geometry;
}

function addMesh(group, geometry, material, x, y, z) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  group.add(mesh);
  return mesh;
}

export function createGTCar(options = {}) {
  const paint = Number(options.paint ?? DEFAULT_PAINT);
  const accent = Number(options.accent ?? DEFAULT_ACCENT);
  const night = options.night === true;
  const root = new THREE.Group();
  root.name = options.name || 'GGRacer GT-bar vehicle';
  root.scale.setScalar(options.scale || 1);

  const bodyMaterial = new THREE.MeshPhongMaterial({
    color: paint,
    specular: 0xffffff,
    shininess: 150,
    flatShading: false,
  });
  const accentMaterial = new THREE.MeshPhongMaterial({
    color: accent,
    specular: 0xffffff,
    shininess: 115,
  });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x11151b, roughness: 0.35, metalness: 0.7 });
  const glassMaterial = new THREE.MeshStandardMaterial({
    color: 0x1b3149,
    roughness: 0.16,
    metalness: 0.22,
    transparent: true,
    opacity: 0.86,
  });
  const headlightMaterial = new THREE.MeshStandardMaterial({
    color: 0xeaf8ff,
    emissive: 0x9bdcff,
    emissiveIntensity: night ? 2.7 : 1.05,
    toneMapped: false,
  });
  const tailMaterial = new THREE.MeshStandardMaterial({
    color: 0xff353d,
    emissive: 0xff171d,
    emissiveIntensity: night ? 2.5 : 0.6,
    toneMapped: false,
  });

  const body = new THREE.Group();
  body.name = 'beveled multi-part chassis';
  root.add(body);
  addMesh(body, roundedShell(2.15, 0.58, 3.85, 0.16), bodyMaterial, 0, 0.42, 0);
  addMesh(body, new THREE.BoxGeometry(2.02, 0.16, 2.9), accentMaterial, 0, 0.48, -0.08);
  addMesh(body, new THREE.BoxGeometry(2.18, 0.2, 0.26), darkMaterial, 0, 0.55, 1.75);
  addMesh(body, new THREE.BoxGeometry(2.18, 0.2, 0.26), darkMaterial, 0, 0.55, -1.75);

  const cabin = new THREE.Group();
  cabin.name = 'tapered greenhouse cabin';
  cabin.position.y = 0.85;
  body.add(cabin);
  const cabinShell = roundedShell(1.72, 0.72, 2.25, 0.15);
  cabinShell.scale.y = 0.92;
  addMesh(cabin, cabinShell, bodyMaterial, 0, 0, -0.1);
  const roof = addMesh(cabin, new THREE.BoxGeometry(1.34, 0.1, 1.55), accentMaterial, 0, 0.7, -0.1);
  roof.rotation.y = 0.015;
  addMesh(cabin, new THREE.BoxGeometry(1.48, 0.38, 0.055), glassMaterial, 0, 0.34, 1.03);
  addMesh(cabin, new THREE.BoxGeometry(1.48, 0.35, 0.055), glassMaterial, 0, 0.36, -1.22);
  addMesh(cabin, new THREE.BoxGeometry(0.055, 0.37, 1.55), glassMaterial, -0.86, 0.39, -0.1);
  addMesh(cabin, new THREE.BoxGeometry(0.055, 0.37, 1.55), glassMaterial, 0.86, 0.39, -0.1);

  // A bright shoulder blade is the readable livery accent at phone scale.
  addMesh(body, new THREE.BoxGeometry(0.16, 0.18, 2.5), accentMaterial, -1.08, 0.72, -0.08);
  addMesh(body, new THREE.BoxGeometry(0.16, 0.18, 2.5), accentMaterial, 1.08, 0.72, -0.08);

  const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.24, 0.22), accentMaterial);
  bumper.position.set(0, 0.56, 1.92); body.add(bumper);
  const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.24, 0.22), darkMaterial);
  rearBumper.position.set(0, 0.56, -1.92); body.add(rearBumper);
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.24, 0.04), darkMaterial);
  grille.position.set(0, 0.67, 2.04); body.add(grille);

  for (const side of [-1, 1]) {
    addMesh(cabin, new THREE.BoxGeometry(0.16, 0.16, 0.4), accentMaterial, side * 1.03, 0.58, 0.82);
  }
  addMesh(body, new THREE.BoxGeometry(0.34, 0.17, 0.06), headlightMaterial, -0.62, 0.78, 2.03);
  addMesh(body, new THREE.BoxGeometry(0.34, 0.17, 0.06), headlightMaterial, 0.62, 0.78, 2.03);
  addMesh(body, new THREE.BoxGeometry(0.42, 0.19, 0.06), tailMaterial, -0.68, 0.78, -2.03);
  addMesh(body, new THREE.BoxGeometry(0.42, 0.19, 0.06), tailMaterial, 0.68, 0.78, -2.03);

  const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x111318, roughness: 0.83, metalness: 0.04, flatShading: true });
  const rimMaterial = new THREE.MeshStandardMaterial({ color: 0xb7c4c9, roughness: 0.22, metalness: 0.86 });
  const wheelGeometry = new THREE.CylinderGeometry(0.43, 0.43, 0.24, 12);
  const rimGeometry = new THREE.CylinderGeometry(0.22, 0.22, 0.255, 10);
  const wheelArches = new THREE.Mesh(new THREE.TorusGeometry(0.49, 0.09, 6, 12), darkMaterial);
  const wheels = [];
  for (const side of [-1, 1]) {
    for (const axleZ of [-1.22, 1.22]) {
      const steer = new THREE.Group();
      steer.position.set(side * 1.08, 0.47, axleZ);
      const spin = new THREE.Group();
      spin.rotation.z = Math.PI * 0.5;
      const tire = new THREE.Mesh(wheelGeometry, wheelMaterial);
      const rim = new THREE.Mesh(rimGeometry, rimMaterial);
      spin.add(tire, rim);
      steer.add(spin);
      root.add(steer);
      wheels.push({ steer, spin, baseY: 0.47, front: axleZ > 0 });
      const arch = wheelArches.clone();
      arch.position.set(side * 1.09, 0.51, axleZ);
      arch.rotation.y = Math.PI * 0.5;
      body.add(arch);
    }
  }

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.55, 4.55),
    new THREE.MeshBasicMaterial({ color: 0x06080b, transparent: true, opacity: 0.42, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI * 0.5;
  shadow.position.y = 0.035;
  root.add(shadow);

  const exhaustLeft = addMesh(root, new THREE.CylinderGeometry(0.08, 0.1, 0.46, 8), darkMaterial, -0.56, 0.33, -2.04);
  const exhaustRight = addMesh(root, new THREE.CylinderGeometry(0.08, 0.1, 0.46, 8), darkMaterial, 0.56, 0.33, -2.04);
  exhaustLeft.rotation.x = Math.PI * 0.5;
  exhaustRight.rotation.x = Math.PI * 0.5;
  const anchors = {
    dust: new THREE.Object3D(),
    exhaust: new THREE.Object3D(),
    skidLeft: new THREE.Object3D(),
    skidRight: new THREE.Object3D(),
  };
  anchors.dust.position.set(0, 0.22, -1.75);
  anchors.exhaust.position.set(0, 0.42, -2.1);
  anchors.skidLeft.position.set(-0.86, 0.05, -1.1);
  anchors.skidRight.position.set(0.86, 0.05, -1.1);
  root.add(anchors.dust, anchors.exhaust, anchors.skidLeft, anchors.skidRight);

  const headlightCones = [];
  for (const side of [-1, 1]) {
    const target = new THREE.Object3D();
    target.position.set(side * 0.62, 0.56, 24);
    root.add(target);
    const light = new THREE.SpotLight(0xc9edff, night ? 8 : 0, 46, 0.34, 0.72, 1.25);
    light.position.set(side * 0.62, 0.8, 2.1);
    light.target = target;
    light.castShadow = false;
    root.add(light);
    headlightCones.push(light);
  }

  let wheelSpin = 0;
  let bodyLean = 0;
  let bodyPitch = 0;
  const tempState = { position: new THREE.Vector3(), yaw: 0 };

  function update(state = tempState, dt = 1 / 60) {
    const position = state.position || state;
    root.position.x = position.x || 0;
    root.position.y = position.y || 0;
    root.position.z = position.z || 0;
    root.rotation.y = Number(state.yaw) || 0;
    const speed = Number(state.speed) || 0;
    const steering = Number(state.steering) || 0;
    const targetLean = Number(state.roll ?? (-steering * 0.09 - (Number(state.lateralG) || 0) * 0.035));
    const targetPitch = Number(state.pitch ?? (-(Number(state.acceleration) || 0) * 0.012));
    const response = 1 - Math.exp(-dt * 10);
    bodyLean += (targetLean - bodyLean) * response;
    bodyPitch += (targetPitch - bodyPitch) * response;
    body.rotation.z = bodyLean;
    body.rotation.x = bodyPitch;
    wheelSpin -= speed * dt / 0.43;
    const suspension = Number(state.suspension) || 0;
    const brake = Number(state.brake) || 0;
    for (let i = 0; i < wheels.length; i += 1) {
      const wheel = wheels[i];
      wheel.steer.rotation.y = wheel.front ? steering * 0.34 : 0;
      wheel.steer.position.y = wheel.baseY + suspension * (i % 2 ? 0.82 : 1);
      wheel.spin.rotation.y = wheelSpin;
    }
    tailMaterial.emissiveIntensity = night ? 2.5 + brake * 2 : 0.6 + brake * 1.2;
    return root;
  }

  function setNight(value) {
    const enabled = !!value;
    for (let i = 0; i < headlightCones.length; i += 1) headlightCones[i].intensity = enabled ? 8 : 0;
    headlightMaterial.emissiveIntensity = enabled ? 3.8 : 1.05;
    tailMaterial.emissiveIntensity = enabled ? 2.5 : 0.6;
  }

  function setLivery(value = {}) {
    if (value.paint != null) bodyMaterial.color.set(value.paint);
    if (value.accent != null) accentMaterial.color.set(value.accent);
  }

  function setQuality(tier) {
    // The lane uses a blob shadow instead of runtime shadow maps. Low tier
    // can drop it entirely when the device is under sustained load.
    shadow.visible = Number(tier) > 0;
  }

  function dispose() {
    root.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      }
    });
  }

  setNight(night);
  return {
    root,
    body,
    wheels,
    anchors,
    update,
    setNight,
    setLivery,
    setQuality,
    dispose,
  };
}

export const GT_BAR_REQUIREMENTS = [
  'beveled lower shell and tapered greenhouse',
  'tinted glass, mirrors, bumpers, headlamps and taillamps',
  'separate spinning steerable wheels with suspension travel',
  'specular paint, livery accent and contact-shadow blob',
  'headlight cone and FX anchors for dust, exhaust and skid marks',
];
