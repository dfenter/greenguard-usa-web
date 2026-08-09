// cars.js — Rally Dust car roster, loading and rigging.
//
// Three Quaternius CC0 bodies carry six liveries. The meta progression unlocks
// liveries, so a new car costs no extra download: the OBJ is parsed once and
// cached, and the livery is a re-authored material set on top of it.
//
// The rig gives the player entity its animation states: wheel spin, front-axle
// steer yaw, spring-damped chassis lean and pitch, and a suspension travel
// channel that compresses on landing after a jump. A roof light pod lights up
// on the night stages.
//
// Adapted from the sibling title Redline GT's vehicle rig; nothing is imported.
import * as THREE from 'three';
import { OBJLoader } from '/play/_shared/three/OBJLoader.js';

// `unlock` is the number of stage gold medals required.
export const CARS = [
  {
    id: 'burrow', file: 'SportsCar', name: 'Burrow 210 Works',
    blurb: 'The service-park hatch everyone learns on. Honest and light.',
    unlock: 0, body: 0xd8402c, trim: 0x1d2530, accentTrim: 0xf4f6fa,
    topSpeed: 1.00, accel: 1.00, grip: 1.00, number: 7, stripe: 'chevron',
  },
  {
    id: 'ochre', file: 'SportsCar', name: 'Burrow 210 Ochre',
    blurb: 'Desert livery. Longer gearing for the open basin roads.',
    unlock: 2, body: 0xe2892c, trim: 0x2b2118, accentTrim: 0xffd76a,
    topSpeed: 1.05, accel: 0.98, grip: 0.98, number: 12, stripe: 'band',
  },
  {
    id: 'thistle', file: 'NormalCar2', name: 'Thistle RS',
    blurb: 'Longer wheelbase saloon. Settles fast after a slide.',
    unlock: 4, body: 0x2f7f5c, trim: 0x14281f, accentTrim: 0xf2f7ea,
    topSpeed: 0.97, accel: 1.01, grip: 1.12, number: 21, stripe: 'twin',
  },
  {
    id: 'cobalt', file: 'NormalCar2', name: 'Thistle Cobalt',
    blurb: 'Night-stage build with a full roof pod. Sharp on tarmac.',
    unlock: 7, body: 0x2557c4, trim: 0x101a2c, accentTrim: 0x7de4eb,
    topSpeed: 1.03, accel: 1.05, grip: 1.05, number: 4, stripe: 'chevron',
  },
  {
    id: 'quarry', file: 'SUV', name: 'Quarry XT',
    blurb: 'Raid truck. Heavy, stubborn, and unbothered by ruts.',
    unlock: 10, body: 0x8f5fd6, trim: 0x241d33, accentTrim: 0xffe17c,
    topSpeed: 0.95, accel: 0.93, grip: 1.20, number: 33, stripe: 'band',
  },
  {
    id: 'ember', file: 'SUV', name: 'Quarry Ember',
    blurb: 'The one they only hand over once you have earned it.',
    unlock: 14, body: 0xffb02e, trim: 0x1c1512, accentTrim: 0xff5a2a,
    topSpeed: 1.08, accel: 1.07, grip: 1.10, number: 1, stripe: 'twin',
  },
];

export function carById(id) { return CARS.find((c) => c.id === id) || null; }

function slotFor(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('frontleft')) return 'wheelFL';
  if (n.includes('frontright')) return 'wheelFR';
  if (n.includes('front')) return 'wheelFront';
  if (n.includes('backwheel') || n.includes('rearwheel') || n.includes('back')) return 'wheelBack';
  if (n.includes('wheel')) return 'wheelBack';
  return 'body';
}

// The pack's MTL palette is muted studio gray in places and the art bible bans
// primitive gray in a shipped frame, so every material is re-authored here as a
// saturated flat MeshStandardMaterial keyed off the livery.
function materialFor(mtlName, car, palette) {
  const n = (mtlName || '').toLowerCase();
  if (palette[n]) return palette[n];
  let color, rough = 0.55, metal = 0.15, emissive = 0x000000, emissiveI = 0;
  if (n.includes('window')) {
    color = 0x141d2a; rough = 0.18; metal = 0.5;
  } else if (n.includes('headlight')) {
    color = 0xfff4d0; rough = 0.3; metal = 0.1; emissive = 0xffeeb0; emissiveI = 0.95;
  } else if (n.includes('taillight')) {
    color = 0xff4436; rough = 0.35; metal = 0.1; emissive = 0xff2a1c; emissiveI = 0.7;
  } else if (n.includes('black')) {
    color = 0x15171c; rough = 0.9; metal = 0.05;
  } else if (n.includes('grey') || n.includes('gray') || n.includes('silver')) {
    color = car.trim; rough = 0.5; metal = 0.35;
  } else if (n.includes('dark')) {
    color = new THREE.Color(car.body).multiplyScalar(0.5).getHex();
    rough = 0.6; metal = 0.15;
  } else if (n.includes('white')) {
    color = car.accentTrim; rough = 0.5; metal = 0.1;
  } else {
    color = car.body; rough = 0.5; metal = 0.2;
  }
  const mat = new THREE.MeshStandardMaterial({
    color, roughness: rough, metalness: metal, flatShading: true,
    emissive, emissiveIntensity: emissiveI,
  });
  palette[n] = mat;
  return mat;
}

const objLoader = new OBJLoader();
const rawCache = new Map();

function loadRaw(file) {
  if (rawCache.has(file)) return rawCache.get(file);
  const p = new Promise((resolve, reject) => {
    objLoader.load('assets/cars/' + file + '.obj', resolve, undefined, reject);
  });
  rawCache.set(file, p);
  return p;
}

// Roof light pod: four emissive lamps on a bar. Built from primitives, but
// never gray: it carries the livery accent and reads as rally kit.
function buildLightPod(car, width, height, forward) {
  const group = new THREE.Group();
  const barMat = new THREE.MeshStandardMaterial({
    color: car.trim, roughness: 0.6, metalness: 0.3, flatShading: true,
  });
  const bar = new THREE.Mesh(new THREE.BoxGeometry(width, 0.09, 0.1), barMat);
  bar.position.set(0, height, forward);
  group.add(bar);
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xfff3cc, roughness: 0.25, metalness: 0.05,
    emissive: 0xffe6a0, emissiveIntensity: 0.9, flatShading: true,
  });
  const geo = new THREE.CylinderGeometry(0.085, 0.085, 0.09, 8);
  for (let i = 0; i < 4; i++) {
    const lamp = new THREE.Mesh(geo, lampMat);
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set((i - 1.5) * (width / 4.4), height + 0.06, forward - 0.05);
    group.add(lamp);
  }
  return { group, lampMat, barMat, geo, bar };
}

// Build a rigged instance: root -> chassis (lean/pitch pivot) -> body + wheels.
export async function buildCar(car) {
  const raw = await loadRaw(car.file);
  const palette = {};
  const root = new THREE.Group();
  const chassis = new THREE.Group();
  root.add(chassis);

  const wheelGroups = [];
  const bodyParts = [];

  const whole = new THREE.Box3().setFromObject(raw);
  const size = new THREE.Vector3(); whole.getSize(size);
  const scale = 4.35 / Math.max(size.z, 0.001);   // target ~4.35 m long
  const minY = whole.min.y;

  raw.traverse((child) => {
    if (!child.isMesh) return;
    const slot = slotFor(child.name || (child.parent && child.parent.name) || '');
    const geo = child.geometry.clone();
    geo.computeVertexNormals();

    let mats;
    if (Array.isArray(child.material)) {
      mats = child.material.map((m) => materialFor(m.name, car, palette));
    } else {
      mats = materialFor(child.material && child.material.name, car, palette);
    }
    const mesh = new THREE.Mesh(geo, mats);
    mesh.name = child.name || slot;

    if (slot === 'body') {
      bodyParts.push(mesh);
      chassis.add(mesh);
      return;
    }

    // Wheel: re-pivot the geometry about its own centre so it spins in place.
    geo.computeBoundingBox();
    const c = new THREE.Vector3(); geo.boundingBox.getCenter(c);
    geo.translate(-c.x, -c.y, -c.z);
    const pivot = new THREE.Group();
    pivot.position.copy(c);
    pivot.add(mesh);
    chassis.add(pivot);
    wheelGroups.push(pivot);
    pivot.userData.front = slot === 'wheelFL' || slot === 'wheelFR' || slot === 'wheelFront';
  });

  // Light pod sits in model space, so it is added before the chassis scale.
  const podWidth = size.x * 0.62;
  const pod = buildLightPod(car, podWidth, whole.max.y + 0.14, -size.z * 0.16);
  chassis.add(pod.group);

  // ---------------------------------------------------------- rally kit
  // Everything below is model-space, added before the chassis scale, so a
  // livery is still a material set plus a few primitives: no extra download.
  const kitMats = [];
  const kitGeos = [];
  const half = size.x * 0.5;
  const nose = -size.z * 0.5, tail = size.z * 0.5;

  // Tyre contact patches. The blob shadow alone left the car reading as if it
  // hovered; four dark ellipses pinned under the wheels anchor it.
  const patchMat = new THREE.MeshBasicMaterial({
    map: blobTexture(), transparent: true, opacity: 0.55, color: 0x000000,
    depthWrite: false, fog: true,
  });
  kitMats.push(patchMat);
  const patchGeo = new THREE.PlaneGeometry(1, 1.35);
  kitGeos.push(patchGeo);
  const contactPatches = [];
  for (const w of wheelGroups) {
    const patch = new THREE.Mesh(patchGeo, patchMat);
    patch.rotation.x = -Math.PI / 2;
    patch.position.set(w.position.x, minY + 0.012 / scale, w.position.z);
    patch.renderOrder = 2;
    chassis.add(patch);
    contactPatches.push(patch);
  }

  // Mudguards behind each wheel: the single most rally-reading addition to a
  // road-car silhouette.
  const flapMat = new THREE.MeshStandardMaterial({
    color: 0x14171d, roughness: 0.95, metalness: 0.02, flatShading: true,
    side: THREE.DoubleSide,
  });
  kitMats.push(flapMat);
  const flapGeo = new THREE.PlaneGeometry(size.x * 0.24, size.y * 0.42);
  kitGeos.push(flapGeo);
  for (const w of wheelGroups) {
    const flap = new THREE.Mesh(flapGeo, flapMat);
    const back = w.position.z > 0 ? 1 : -1;
    flap.position.set(w.position.x * 1.02, minY + size.y * 0.2, w.position.z + back * size.z * 0.055);
    flap.rotation.x = 0.16 * back;
    chassis.add(flap);
  }

  // Sump guard under the nose.
  const guardMat = new THREE.MeshStandardMaterial({
    color: car.trim, roughness: 0.6, metalness: 0.45, flatShading: true,
  });
  kitMats.push(guardMat);
  const guardGeo = new THREE.BoxGeometry(size.x * 0.62, size.y * 0.05, size.z * 0.26);
  kitGeos.push(guardGeo);
  const guard = new THREE.Mesh(guardGeo, guardMat);
  guard.position.set(0, minY + size.y * 0.09, nose * 0.62);
  chassis.add(guard);

  // Livery graphics: a stripe treatment and a competition roundel per car, so
  // the six liveries are not six flat colours.
  const trimMat = new THREE.MeshStandardMaterial({
    color: car.accentTrim, roughness: 0.44, metalness: 0.1, flatShading: true,
  });
  kitMats.push(trimMat);
  function stripe(w, h, d, x, y, z, rz) {
    const g = new THREE.BoxGeometry(w, h, d);
    kitGeos.push(g);
    const m = new THREE.Mesh(g, trimMat);
    m.position.set(x, y, z);
    if (rz) m.rotation.z = rz;
    chassis.add(m);
  }
  const midY = minY + size.y * 0.52;
  if (car.stripe === 'twin') {
    for (const s of [-1, 1]) {
      stripe(size.x * 0.02, size.y * 0.06, size.z * 0.92, s * size.x * 0.13, whole.max.y * 0.995, 0);
    }
  } else if (car.stripe === 'band') {
    for (const s of [-1, 1]) {
      stripe(size.x * 0.02, size.y * 0.1, size.z * 0.78, s * (half - size.x * 0.005), midY, 0);
    }
  } else {
    for (const s of [-1, 1]) {
      stripe(size.x * 0.02, size.y * 0.09, size.z * 0.34, s * (half - size.x * 0.005), midY, size.z * 0.12, 0.28);
      stripe(size.x * 0.02, size.y * 0.09, size.z * 0.34, s * (half - size.x * 0.005), midY, -size.z * 0.16, -0.28);
    }
  }

  const roundelMat = new THREE.MeshBasicMaterial({
    map: numberTexture(car.number, car.body, car.accentTrim), transparent: true,
    depthWrite: false, fog: true,
  });
  kitMats.push(roundelMat);
  const roundelGeo = new THREE.PlaneGeometry(size.z * 0.2, size.z * 0.2);
  kitGeos.push(roundelGeo);
  for (const s of [-1, 1]) {
    const r = new THREE.Mesh(roundelGeo, roundelMat);
    r.position.set(s * (half + size.x * 0.006), midY + size.y * 0.06, size.z * 0.02);
    r.rotation.y = s * Math.PI / 2;
    r.renderOrder = 3;
    chassis.add(r);
  }

  chassis.scale.setScalar(scale);
  chassis.position.y = -minY * scale;
  chassis.rotation.y = Math.PI;   // Quaternius cars face -Z, the sim drives +Z

  // Blob shadow: a soft radial-gradient plane. No shadow maps in this lane.
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 5.2),
    new THREE.MeshBasicMaterial({
      map: blobTexture(), transparent: true, opacity: 0.48,
      depthWrite: false, color: 0x000000, fog: true,
    })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.06;
  shadow.renderOrder = 2;
  root.add(shadow);

  // Dirt accumulation: the body dulls toward the surface tone as the stage
  // runs, and a reset or a landing throws more of it on. Cosmetic only.
  const bodyMats = Object.values(palette);
  const baseHex = bodyMats.map((m) => m.color.getHex());
  const dirtCol = new THREE.Color();
  const workCol = new THREE.Color();
  let dirtLevel = -1;
  function setDirt(amount, tone) {
    const a = amount < 0 ? 0 : amount > 1 ? 1 : amount;
    if (Math.abs(a - dirtLevel) < 0.02) return;
    dirtLevel = a;
    dirtCol.setHex(tone == null ? 0x8b7048 : tone);
    for (let i = 0; i < bodyMats.length; i++) {
      workCol.setHex(baseHex[i]);
      workCol.lerp(dirtCol, a * 0.42);
      bodyMats[i].color.copy(workCol);
      bodyMats[i].roughness = Math.min(1, bodyMats[i].roughness + a * 0.2);
    }
  }

  return {
    root, chassis, shadow, wheelGroups, bodyParts, pod, contactPatches, setDirt,
    materials: bodyMats.concat([pod.lampMat, pod.barMat]).concat(kitMats),
    geometries: kitGeos,
    spec: car, scale, modelSize: size, minY,
  };
}

// Competition roundel drawn into a canvas: a numbered door disc with the livery
// accent ring. No font file ships; this is the platform stack rasterised once.
const numberTexCache = new Map();
function numberTexture(num, body, accent) {
  const key = num + ':' + body + ':' + accent;
  if (numberTexCache.has(key)) return numberTexCache.get(key);
  const s = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d');
  const hex = (h) => '#' + h.toString(16).padStart(6, '0');
  g.fillStyle = 'rgba(244,242,234,0.95)';
  g.beginPath(); g.arc(s / 2, s / 2, s * 0.44, 0, Math.PI * 2); g.fill();
  g.strokeStyle = hex(accent); g.lineWidth = s * 0.055;
  g.beginPath(); g.arc(s / 2, s / 2, s * 0.42, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#15171c';
  g.font = '900 ' + Math.round(s * 0.5) + 'px -apple-system, system-ui, Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(num), s / 2, s / 2 + s * 0.02);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  numberTexCache.set(key, tex);
  return tex;
}

let blobTex = null;
function blobTexture() {
  if (blobTex) return blobTex;
  const s = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(s / 2, s / 2, 2, s / 2, s / 2, s / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.62)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  blobTex = new THREE.CanvasTexture(cv);
  blobTex.colorSpace = THREE.SRGBColorSpace;
  return blobTex;
}

// Ghost shell: the same silhouette as a translucent additive body. Reuses the
// already-parsed OBJ, so a ghost costs no extra network fetch.
export async function buildGhost(car, tint) {
  const raw = await loadRaw(car.file);
  const root = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    color: tint, transparent: true, opacity: 0.26,
    depthWrite: false, blending: THREE.AdditiveBlending, fog: true,
  });
  const whole = new THREE.Box3().setFromObject(raw);
  const size = new THREE.Vector3(); whole.getSize(size);
  const scale = 4.35 / Math.max(size.z, 0.001);
  const minY = whole.min.y;
  const inner = new THREE.Group();
  raw.traverse((child) => {
    if (!child.isMesh) return;
    inner.add(new THREE.Mesh(child.geometry, mat));
  });
  inner.scale.setScalar(scale);
  inner.position.y = -minY * scale;
  inner.rotation.y = Math.PI;
  root.add(inner);
  root.renderOrder = 3;
  return { root, mat };
}
