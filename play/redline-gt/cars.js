// cars.js — Redline GT vehicle roster, loading and rigging.
// Quaternius CC0 OBJ bodies are split by object name into chassis + wheels so
// the shipped car has real wheel spin, steer yaw and cosmetic lean/pitch
// springs (art bible: >=3 visual states on the player entity).
import * as THREE from 'three';
import { OBJLoader } from '/play/_shared/three/OBJLoader.js';

// Roster. `unlock` is the cumulative gold-medal count required.
// Handling multipliers stay close to 1.0 so the prototype's tuned constants
// remain the baseline feel; the spread is presentation-plus-nudge, not a rebalance.
export const CARS = [
  {
    id: 'harrier', file: 'SportsCar', name: 'GG Harrier',
    blurb: 'Balanced starter coupe. Forgiving on the brakes.',
    unlock: 0,
    body: 0xe0552f, trim: 0x2a2f38, glass: 0x142a42, well: 0x11151c,
    topSpeed: 1.00, accel: 1.00, grip: 1.00,
  },
  {
    id: 'vesper', file: 'SportsCar2', name: 'Vesper 12',
    blurb: 'Higher top end, twitchier under load.',
    unlock: 1,
    body: 0x2f8fe0, trim: 0x1c2430, glass: 0x10243e, well: 0x10151d,
    topSpeed: 1.07, accel: 0.97, grip: 0.95,
  },
  {
    id: 'meridian', file: 'NormalCar1', name: 'Meridian GS',
    blurb: 'Planted touring build. Grip over glamour.',
    unlock: 3,
    body: 0x4fbf7a, trim: 0x243028, glass: 0x12322e, well: 0x101916,
    topSpeed: 0.96, accel: 1.00, grip: 1.11,
  },
  {
    id: 'kestrel', file: 'NormalCar2', name: 'Kestrel RS',
    blurb: 'Sharp launch, short gearing, restless tail.',
    unlock: 5,
    body: 0xf2c53d, trim: 0x33291a, glass: 0x27253a, well: 0x18151a,
    topSpeed: 1.02, accel: 1.09, grip: 0.97,
  },
  {
    id: 'bastion', file: 'SUV', name: 'Bastion XT',
    blurb: 'Heavy and stubborn. Shrugs off contact.',
    unlock: 7,
    body: 0x8f5fd6, trim: 0x2a2338, glass: 0x171833, well: 0x11111a,
    topSpeed: 0.94, accel: 0.92, grip: 1.16, mass: 1.35,
  },
  {
    id: 'checker', file: 'Taxi', name: 'Checker Ace',
    blurb: 'The gold-plated joke that is somehow quickest.',
    unlock: 10,
    body: 0xffd24a, trim: 0x1d1d1d, glass: 0x182536, well: 0x111318,
    topSpeed: 1.10, accel: 1.06, grip: 1.05,
  },
];

// Quaternius object names carry their role; map them to rig slots.
function slotFor(name) {
  const n = name.toLowerCase();
  if (n.includes('frontleft')) return 'wheelFL';
  if (n.includes('frontright')) return 'wheelFR';
  if (n.includes('front')) return 'wheelFront';
  if (n.includes('backwheel') || n.includes('rearwheel') || n.includes('back')) return 'wheelBack';
  if (n.includes('wheel')) return 'wheelBack';
  return 'body';
}

// The pack's MTL palette is muted studio-gray in places; every material is
// re-authored here as a livery-aware Lambert material. Diffuse vertex lighting
// keeps the livery readable without paying Phong's per-fragment specular work;
// game.js supplies a tiny emissive sweep for the paint highlight and preserves
// the brake/headlamp reads without a texture pass.
function materialFor(mtlName, car, palette) {
  const n = (mtlName || '').toLowerCase();
  if (palette[n]) return palette[n];
  let color, emissive = 0x000000, emissiveI = 0, role = 'body';
  if (n.includes('window')) {
    color = car.glass || 0x101a2c; emissive = 0x081525; emissiveI = 0.18; role = 'glass';
  } else if (n.includes('headlight')) {
    color = 0xfff3c8; emissive = 0xffe9a8; emissiveI = 0.35; role = 'head';
  } else if (n.includes('taillight')) {
    color = 0xff4436; emissive = 0xff2a1c; emissiveI = 1.15; role = 'tail';
  } else if (n.includes('black')) {
    color = car.well || 0x10131a; role = 'well';
  } else if (n.includes('grey') || n.includes('gray') || n.includes('silver')) {
    color = car.trim || 0x7f8998; role = 'trim';
  } else if (n.includes('dark')) {
    color = new THREE.Color(car.body).multiplyScalar(0.54).getHex(); role = 'paint';
  } else {
    // Original names such as Orange, Blue, Yellow and White are all paint
    // panels. The roster colour is the final source of truth for rival liveries.
    color = car.body;
    role = 'paint';
  }
  const mat = new THREE.MeshLambertMaterial({
    color, flatShading: false, emissive, emissiveIntensity: emissiveI, fog: true,
  });
  mat.userData.role = role;
  mat.userData.baseColor = color;
  mat.userData.paintPhase = Object.keys(palette).length * 0.73;
  // These are deliberately initialized at build time so the race never has
  // to allocate bookkeeping the first time a lamp or paint sweep is touched.
  mat.userData.baseEmissive = emissiveI;
  mat.userData.baseEmissiveHex = emissive;
  mat.userData.basePaintEmissive = emissiveI;
  mat.userData.lastEmissiveHex = -1;
  mat.userData.lastEmissiveIntensity = -1;
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

// Build a rigged instance: root -> chassis (lean/pitch pivot) -> body + wheels.
export async function buildCar(car) {
  const raw = await loadRaw(car.file);
  const palette = {};
  const root = new THREE.Group();
  const chassis = new THREE.Group();
  root.add(chassis);

  const wheels = { FL: null, FR: null, RL: null, RR: null };
  const wheelGroups = [];
  const bodyParts = [];
  let wheelRadius = 0.35;

  // Measure the whole car once so we can normalise scale + ground it.
  const whole = new THREE.Box3().setFromObject(raw);
  const size = new THREE.Vector3(); whole.getSize(size);
  const scale = 4.35 / Math.max(size.z, 0.001); // target ~4.35 m long
  const minY = whole.min.y;

  raw.traverse((child) => {
    if (!child.isMesh) return;
    const slot = slotFor(child.name || child.parent?.name || '');
    const geo = child.geometry.clone();
    geo.computeVertexNormals();

    // Re-author materials by MTL name (OBJLoader keeps names on the material).
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

    // Wheel: re-pivot geometry about its own centre so it can spin in place.
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const c = new THREE.Vector3(); bb.getCenter(c);
    const radial = Math.max(bb.max.y - bb.min.y, bb.max.z - bb.min.z) * 0.5 * scale;
    wheelRadius = Math.max(wheelRadius, radial);
    geo.translate(-c.x, -c.y, -c.z);
    const pivot = new THREE.Group();
    pivot.position.copy(c);
    pivot.add(mesh);
    chassis.add(pivot);
    wheelGroups.push(pivot);

    // The pack sometimes ships a single merged rear-axle object; in that case
    // steering only touches the front pivots and the merged rear spins whole.
    const isFront = slot === 'wheelFL' || slot === 'wheelFR' || slot === 'wheelFront';
    pivot.userData.front = isFront;
    pivot.userData.side = c.x >= 0 ? 1 : -1;
    pivot.userData.baseY = pivot.position.y;
    pivot.userData.radius = Math.max(0.22, radial);
    if (isFront) {
      if (c.x >= 0) wheels.FR = pivot; else wheels.FL = pivot;
    } else {
      if (wheels.RR) wheels.RL = pivot; else wheels.RR = pivot;
    }
  });

  chassis.scale.setScalar(scale);
  chassis.position.y = -minY * scale;

  // MODEL-FORWARD CONVENTION (verified, not assumed): every Quaternius body in
  // this pack puts its `Headlights` material at positive Z and `TailLights` at
  // negative Z, so the model already faces +Z, which is the direction the sim
  // drives. The previous Math.PI flip turned the car to face the chase camera,
  // which is why the gate frame showed headlights in a rear-view shot. One
  // convention, applied here and nowhere else.
  chassis.rotation.y = 0;

  // Contact shadow: sized and placed from the actual wheel footprint rather
  // than the body centre, so it sits under the tyres instead of floating.
  let fx0 = Infinity, fx1 = -Infinity, fz0 = Infinity, fz1 = -Infinity;
  for (const w of wheelGroups) {
    const wx = w.position.x * scale, wz = w.position.z * scale;
    if (wx < fx0) fx0 = wx; if (wx > fx1) fx1 = wx;
    if (wz < fz0) fz0 = wz; if (wz > fz1) fz1 = wz;
  }
  const trackW = isFinite(fx0) ? Math.max(1.6, (fx1 - fx0) * 1.55) : 3.0;
  const trackL = isFinite(fz0) ? Math.max(2.6, (fz1 - fz0) * 1.5) : 4.6;
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(trackW, trackL),
    new THREE.MeshBasicMaterial({
      map: blobTexture(), transparent: true, opacity: 0.55,
      depthWrite: false, color: 0x000000, fog: true,
    })
  );
  shadow.rotation.x = -Math.PI / 2;
  // Child of the root, at the footprint centre: the root already carries the
  // car's world position and heading, so the shadow can never drift off it.
  shadow.position.set(
    isFinite(fx0) ? (fx0 + fx1) / 2 : 0,
    0.055,
    isFinite(fz0) ? (fz0 + fz1) / 2 : 0
  );
  shadow.renderOrder = 2;
  root.add(shadow);

  const mats = Object.values(palette);
  return {
    root, chassis, shadow, wheels, wheelGroups, bodyParts,
    materials: mats,
    paintMats: mats.filter((m) => m.userData.role === 'paint'),
    headMats: mats.filter((m) => m.userData.role === 'head'),
    tailMats: mats.filter((m) => m.userData.role === 'tail'),
    lightState: { braking: null, headOn: null, paintPhase: -Infinity },
    wheelRadius: Math.max(0.28, wheelRadius),
    spec: car,
    footprint: { w: trackW, l: trackL },
  };
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

// Ghost variant: same silhouette, translucent additive shell. Reuses the
// already-parsed OBJ so a ghost costs no extra network fetch.
export async function buildGhost(car, tint) {
  const raw = await loadRaw(car.file);
  const root = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    color: tint, transparent: true, opacity: 0.28,
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
  inner.rotation.y = 0;      // same verified model-forward convention as buildCar
  root.add(inner);
  root.renderOrder = 3;
  return { root, mat };
}
