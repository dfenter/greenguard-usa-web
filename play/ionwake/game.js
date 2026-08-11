import * as THREE from 'three';
import { createRacerWorld } from '../_shared/racer/engine.js';
import { AUDIO_ASSETS, sfx } from './audio.js';
import { createMachineKit } from './machines.js';

const sceneCanvas = document.getElementById('scene');
const hudCanvas = document.getElementById('hud');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap01 = (v) => { const n = v % 1; return n < 0 ? n + 1 : n; };
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;
const TRACK_FILES = [
  ['voltspire', 'Voltspire Switchbacks', 'voltspire.json'],
  ['cinder-highroad', 'Cinder Highroad', 'cinder-highroad.json'],
  ['mirror-orbit', 'Mirror Orbit', 'mirror-orbit.json'],
  ['neon-artery', 'Neon Artery', 'neon-artery.json'],
  ['suncut-switchbacks', 'Suncut Switchbacks', 'suncut-switchbacks.json'],
  ['halo-dive', 'Halo Dive', 'halo-dive.json'],
  ['blackline-crest', 'Blackline Crest', 'blackline-crest.json'],
  ['ion-reef', 'Ion Reef', 'ion-reef.json'],
  ['last-light-ring', 'Last Light Ring', 'last-light-ring.json'],
];
const CUPS = [
  { id: 'first-light', name: 'FIRST LIGHT', color: '#55e7ef', tracks: [0, 1, 2] },
  { id: 'red-shift', name: 'RED SHIFT', color: '#ffbd58', tracks: [3, 4, 5] },
  { id: 'black-vector', name: 'BLACK VECTOR', color: '#cf9dff', tracks: [6, 7, 8] },
];
const MACHINES = [
  { id: 'lumen-k2', name: 'Lumen K2', unlock: 0, top: 252, accel: 34, shield: 100, boost: 28, handling: 1.08 },
  { id: 'vanta-arc', name: 'Vanta Arc', unlock: 2, top: 270, accel: 31, shield: 88, boost: 34, handling: 0.96 },
  { id: 'cobalt-rise', name: 'Cobalt Rise', unlock: 4, top: 244, accel: 40, shield: 112, boost: 24, handling: 1.18 },
  { id: 'ember-vector', name: 'Ember Vector', unlock: 6, top: 282, accel: 30, shield: 78, boost: 38, handling: 0.9 },
  { id: 'prism-wake', name: 'Prism Wake', unlock: 8, top: 261, accel: 37, shield: 94, boost: 30, handling: 1.03 },
  { id: 'null-comet', name: 'Null Comet', unlock: 10, top: 291, accel: 27, shield: 66, boost: 44, handling: 0.84 },
];
const LIVERIES = [
  { name: 'AURORA', paint: 0x13cbd4, accent: 0xffd36e },
  { name: 'EMBER', paint: 0xf05f4f, accent: 0xffe9a1 },
  { name: 'NIGHTFALL', paint: 0x7059e9, accent: 0x5df5ff },
];
const POINTS = [15, 12, 10, 8, 6, 4, 2, 1];
const FIXED = 1 / 60;
const TOTAL_LAPS = 3;

const state = {
  mode: 'boot', cup: 0, track: 0, trackId: 'voltspire', lap: 1, pos: 8,
  energy: 100, speed: 0, race: 'grand-prix', machine: 'lumen-k2',
};
const requested = {
  track: new URLSearchParams(location.search).get('forceTrack'),
  cup: new URLSearchParams(location.search).get('forceCup'),
  race: new URLSearchParams(location.search).get('forceRace'),
};
let app = null;
const iwApi = { state };
Object.defineProperties(iwApi, {
  forceTrack: {
    configurable: true, get: () => requested.track,
    set: (value) => { requested.track = value; if (app) app.applyForceSwitches(); },
  },
  forceCup: {
    configurable: true, get: () => requested.cup,
    set: (value) => { requested.cup = value; if (app) app.applyForceSwitches(); },
  },
  forceRace: {
    configurable: true, get: () => requested.race,
    set: (value) => { requested.race = value; if (app) app.applyForceSwitches(); },
  },
});
window.__iw = iwApi;

function safeTrackIndex(value) {
  if (typeof value === 'string') {
    const id = value.toLowerCase();
    const direct = TRACK_FILES.findIndex((entry) => entry[0] === id);
    if (direct >= 0) return direct;
  }
  const n = Number(value);
  return Number.isFinite(n) ? clamp(Math.floor(n >= 1 ? n - 1 : n), 0, TRACK_FILES.length - 1) : null;
}

function safeCupIndex(value) {
  const n = Number(value);
  return Number.isFinite(n) ? clamp(Math.floor(n >= 1 ? n - 1 : n), 0, CUPS.length - 1) : null;
}

function safeRace(value) {
  const v = String(value || '').toLowerCase().replace(/[_ ]/g, '-');
  if (v === 'grand-prix' || v === 'grandprix' || v === 'gp' || v === '0') return 'grand-prix';
  if (v === 'time-attack' || v === 'timeattack' || v === '1') return 'time-attack';
  if (v === 'survival' || v === '2') return 'survival';
  return null;
}

function fallbackTrack(index) {
  const points = [
    { x: 0, z: -90, elevation: 8, banking: 0 }, { x: 100, z: -30, elevation: 12, banking: 16 },
    { x: 55, z: 92, elevation: 18, banking: -18 }, { x: -70, z: 82, elevation: 10, banking: -13 },
    { x: -115, z: -5, elevation: 6, banking: 20 }, { x: -58, z: -82, elevation: 8, banking: -12 },
  ];
  return { version: 1, id: TRACK_FILES[index][0], name: TRACK_FILES[index][1], width: 14, sampleCount: 120, theme: 'night-city', timeOfDay: 'night', controlPoints: points, sectors: [{ id: 1, at: 0 }, { id: 2, at: 0.33 }, { id: 3, at: 0.66 }], racingLine: [{ at: 0, lateral: 0 }], features: [], pickups: [] };
}

function validSave(value) {
  if (!value || value.v !== 2 || typeof value.tutorialDone !== 'boolean') return false;
  if (!Number.isInteger(value.medals) || value.medals < 0 || value.medals > 99) return false;
  if (!MACHINES.some((machine) => machine.id === value.machine)) return false;
  if (!Number.isInteger(value.livery) || value.livery < 0 || value.livery >= LIVERIES.length) return false;
  if (!value.best || typeof value.best !== 'object' || Array.isArray(value.best)) return false;
  for (const [key, record] of Object.entries(value.best)) {
    if (!TRACK_FILES.some((track) => track[0] === key) || !record || typeof record.time !== 'number' || record.time < 0 || record.time > 3600) return false;
  }
  if (!value.cups || typeof value.cups !== 'object' || Array.isArray(value.cups)) return false;
  return true;
}

function defaultSave() {
  return { v: 2, tutorialDone: false, medals: 0, machine: MACHINES[0].id, livery: 0, best: {}, cups: {}, contacts: 0 };
}

function migrateSave(value) {
  const next = defaultSave();
  if (!value || typeof value !== 'object') return next;
  next.tutorialDone = value.tutorialDone === true;
  next.medals = clamp(Number(value.medals) || 0, 0, 99);
  next.machine = MACHINES.some((machine) => machine.id === value.machine) ? value.machine : next.machine;
  next.livery = Number.isInteger(value.livery) && value.livery >= 0 && value.livery < LIVERIES.length ? value.livery : 0;
  if (value.best && typeof value.best === 'object' && !Array.isArray(value.best)) {
    for (const [key, record] of Object.entries(value.best)) {
      if (TRACK_FILES.some((track) => track[0] === key) && record && Number.isFinite(record.time) && record.time >= 0 && record.time <= 3600) {
        next.best[key] = { time: record.time, ghost: record.ghost !== false };
      }
    }
  }
  if (value.cups && typeof value.cups === 'object' && !Array.isArray(value.cups)) next.cups = value.cups;
  next.contacts = Math.max(0, Number(value.contacts) || 0);
  return next;
}

function makeGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
  gradient.addColorStop(0, 'rgba(255,255,255,.95)');
  gradient.addColorStop(.3, 'rgba(73,244,255,.7)');
  gradient.addColorStop(1, 'rgba(15,115,255,0)');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
const GLOW_TEXTURE = makeGlowTexture();

function basisQuaternion(frame, target, matrix = new THREE.Matrix4()) {
  matrix.makeBasis(frame.right, frame.up, frame.tangent);
  target.setFromRotationMatrix(matrix);
}

function blankFrame() {
  return { position: new THREE.Vector3(), tangent: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3() };
}

function lineLateral(data, progress) {
  const points = Array.isArray(data.racingLine) && data.racingLine.length ? data.racingLine : [{ at: 0, lateral: 0 }];
  const t = wrap01(progress);
  let before = points[points.length - 1];
  let after = points[0];
  for (let i = 0; i < points.length; i += 1) {
    if (Number(points[i].at) <= t) before = points[i];
    if (Number(points[i].at) > t) { after = points[i]; break; }
  }
  let span = Number(after.at) - Number(before.at);
  if (span <= 0) span += 1;
  let delta = t - Number(before.at);
  if (delta < 0) delta += 1;
  return lerp(Number(before.lateral) || 0, Number(after.lateral) || 0, clamp(delta / span, 0, 1));
}

function trackChallenge(track, progress) {
  const look = clamp(42 / Math.max(1, track.length), .006, .02);
  const before = track.sampleAt(progress - look, blankFrame());
  const after = track.sampleAt(progress + look, blankFrame());
  const a = new THREE.Vector3(before.tangent.x, 0, before.tangent.z);
  const b = new THREE.Vector3(after.tangent.x, 0, after.tangent.z);
  if (a.lengthSq() < .001 || b.lengthSq() < .001) return { demand: 0, sign: 1, safeSpeed: 72 };
  a.normalize(); b.normalize();
  const angle = Math.acos(clamp(a.dot(b), -1, 1));
  const sign = Math.sign(a.z * b.x - a.x * b.z) || 1;
  const demand = clamp(angle * 1.85, 0, 1);
  return { demand, sign, safeSpeed: 72 - demand * 46 };
}

function inWrappedRange(progress, from, to) {
  const t = wrap01(progress); const start = wrap01(from); const end = wrap01(to);
  return start <= end ? t >= start && t <= end : t >= start || t <= end;
}

class HoverCraft {
  constructor(options = {}) {
    this.root = new THREE.Group();
    this.root.name = options.name || 'Ionwake hover machine';
    this.root.scale.setScalar(options.scale || 1);
    this.orientationMatrix = new THREE.Matrix4();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.bodyMaterial = new THREE.MeshPhongMaterial({ color: options.paint || 0x13cbd4, specular: 0xffffff, shininess: 170, flatShading: false });
    this.accentMaterial = new THREE.MeshPhongMaterial({ color: options.accent || 0xffd36e, specular: 0xffffff, shininess: 130 });
    this.darkMaterial = new THREE.MeshStandardMaterial({ color: 0x07111d, roughness: .24, metalness: .82 });
    this.glassMaterial = new THREE.MeshStandardMaterial({ color: 0x8cecff, roughness: .12, metalness: .26, transparent: true, opacity: .78 });
    this.engineMaterial = new THREE.MeshStandardMaterial({ color: 0xb9fbff, emissive: 0x19dff0, emissiveIntensity: 3.4, toneMapped: false });
    this.lightMaterial = new THREE.MeshStandardMaterial({ color: 0xfff2c1, emissive: 0xffa71a, emissiveIntensity: 3, toneMapped: false });
    const shell = new THREE.Shape();
    shell.moveTo(-1.25, 0); shell.lineTo(1.25, 0); shell.lineTo(1.12, .5); shell.quadraticCurveTo(.85, .72, 0, .75); shell.quadraticCurveTo(-.85, .72, -1.12, .5); shell.closePath();
    const shellMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shell, { depth: 4.6, bevelEnabled: true, bevelSegments: 2, bevelSize: .12, bevelThickness: .09 }), this.bodyMaterial);
    shellMesh.geometry.translate(0, .38, -2.3);
    this.body.add(shellMesh);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(.95, 1.9, 6), this.bodyMaterial);
    nose.rotation.x = Math.PI / 2; nose.position.set(0, .62, 2.65); this.body.add(nose);
    const cabin = new THREE.Mesh(new THREE.CylinderGeometry(.78, 1.02, 1.05, 6), this.glassMaterial);
    cabin.scale.z = 1.18; cabin.position.set(0, 1.16, -.25); this.body.add(cabin);
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.42, .12, 1.75), this.accentMaterial);
    canopy.position.set(0, 1.73, -.18); canopy.rotation.y = .02; this.body.add(canopy);
    for (const side of [-1, 1]) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(.16, .18, 2.9), this.accentMaterial);
      blade.position.set(side * 1.2, .78, -.2); blade.rotation.z = side * .06; this.body.add(blade);
      const mirror = new THREE.Mesh(new THREE.BoxGeometry(.18, .13, .3), this.darkMaterial);
      mirror.position.set(side * 1.1, 1.38, .74); this.body.add(mirror);
    }
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.95, .2, .16), this.accentMaterial);
    bumper.position.set(0, .55, 3.46); this.body.add(bumper);
    for (const side of [-1, 1]) {
      const headlight = new THREE.Mesh(new THREE.BoxGeometry(.38, .14, .05), this.lightMaterial);
      headlight.position.set(side * .62, .83, 3.45); this.body.add(headlight);
      const engine = new THREE.Mesh(new THREE.SphereGeometry(.18, 8, 6), this.engineMaterial);
      engine.position.set(side * .63, .62, -2.35); this.root.add(engine);
    }
    const skirt = new THREE.Mesh(new THREE.TorusGeometry(1.17, .15, 6, 28), this.engineMaterial);
    skirt.rotation.x = Math.PI / 2; skirt.position.y = .12; this.root.add(skirt);
    const underbody = new THREE.Mesh(new THREE.BoxGeometry(2.18, .15, 3.1), this.darkMaterial);
    underbody.position.y = .22; this.root.add(underbody);
    this.pool = new THREE.Mesh(new THREE.CircleGeometry(1.75, 24), new THREE.MeshBasicMaterial({ map: GLOW_TEXTURE, transparent: true, opacity: .68, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.pool.rotation.x = -Math.PI / 2; this.pool.position.y = -.42; this.root.add(this.pool);
    this.roll = 0; this.pitch = 0;
  }

  update(frame, dt, clock, energy = 100, boost = 0) {
    this.root.position.copy(frame.position).addScaledVector(frame.up, .52);
    basisQuaternion(frame, this.root.quaternion, this.orientationMatrix);
    const steer = Number(frame.steering) || 0;
    const targetRoll = -steer * .13 - (Number(frame.lateralG) || 0) * .018;
    const targetPitch = -(Number(frame.acceleration) || 0) * .012 + (Number(frame.pitch) || 0);
    const response = 1 - Math.exp(-Math.max(0, dt) * 11);
    this.roll += (targetRoll - this.roll) * response;
    this.pitch += (targetPitch - this.pitch) * response;
    this.body.rotation.z = this.roll;
    this.body.rotation.x = this.pitch;
    const bob = Math.sin(clock * 8 + this.root.position.x * .01) * .045;
    this.body.position.y = bob;
    this.pool.material.opacity = .36 + clamp(energy / 100, 0, 1) * .4;
    this.engineMaterial.emissiveIntensity = 2.8 + boost * 2.2 + clamp(energy / 100, 0, 1) * .9;
    this.pool.scale.setScalar(1 + boost * .22);
  }

  dispose() {
    this.root.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) object.material.dispose();
    });
  }
}

class SparkPool {
  constructor(scene) {
    this.max = 72; this.cursor = 0; this.items = [];
    this.mesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(.085, 0), new THREE.MeshBasicMaterial({ color: 0xffd77a, toneMapped: false }), this.max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(this.mesh);
    for (let i = 0; i < this.max; i += 1) this.items.push({ life: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3(), scale: new THREE.Vector3(1, 1, 1) });
    this.matrix = new THREE.Matrix4(); this.quat = new THREE.Quaternion();
  }
  burst(position, color = 0xffd77a, count = 5) {
    this.mesh.material.color.setHex(color);
    for (let i = 0; i < count; i += 1) {
      const item = this.items[this.cursor]; this.cursor = (this.cursor + 1) % this.max;
      const angle = (i / Math.max(1, count)) * TAU;
      item.life = .24 + (i % 3) * .07; item.pos.copy(position);
      item.vel.set(Math.cos(angle) * (1.2 + i * .1), .8 + (i % 2) * .5, Math.sin(angle) * (1.2 + i * .1));
    }
  }
  update(dt) {
    let count = 0;
    for (const item of this.items) {
      if (item.life <= 0) continue;
      item.life -= dt; item.pos.addScaledVector(item.vel, dt); item.vel.y -= 3.5 * dt;
      const size = clamp(item.life * 4, .1, 1); item.scale.set(size, size, size);
      this.matrix.compose(item.pos, this.quat, item.scale); this.mesh.setMatrixAt(count, this.matrix); count += 1;
    }
    this.mesh.count = count; this.mesh.instanceMatrix.needsUpdate = true;
  }
  dispose() { this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}

class CourseLayer {
  constructor(racer, data) {
    this.data = data; this.root = new THREE.Group(); this.root.name = 'Ionwake energy wall and feature layer';
    racer.world.scene.add(this.root);
    const track = racer.world.track;
    const left = [], right = [];
    for (let i = 0; i <= track.samples.length; i += 2) {
      const sample = track.samples[i % track.samples.length];
      for (const side of [1, -1]) {
        const point = sample.position.clone().addScaledVector(sample.right, side * (track.width * .5 + .25)).addScaledVector(sample.up, 1.15);
        (side > 0 ? left : right).push(point);
      }
    }
    this.wallMaterial = new THREE.LineBasicMaterial({ color: 0x4cebf3, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, toneMapped: false });
    const leftLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(left), this.wallMaterial);
    const rightLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(right), this.wallMaterial);
    this.root.add(leftLine, rightLine);
    this.rails = [];
    const railMaterial = new THREE.MeshBasicMaterial({ color: 0x35f5e7, transparent: true, opacity: .92, blending: THREE.AdditiveBlending, toneMapped: false });
    const railRanges = Array.isArray(data.rails) && data.rails.length ? data.rails : [{ from: .08, to: .2, side: -1 }, { from: .42, to: .56, side: 1 }, { from: .76, to: .9, side: -1 }];
    for (const rail of railRanges) {
      const points = [];
      const from = Number(rail.from ?? rail.at ?? 0);
      const to = Number(rail.to ?? from + .12);
      const span = to >= from ? to - from : 1 - from + to;
      for (let step = 0; step <= 16; step += 1) {
        const progress = wrap01(from + span * (step / 16));
        const sample = track.sampleAt(progress);
        const side = Number(rail.side) < 0 ? -1 : 1;
        points.push(sample.position.clone().addScaledVector(sample.right, side * (track.width * .5 - 1.02)).addScaledVector(sample.up, .16));
      }
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), railMaterial.clone());
      line.name = 'charge rail ' + (rail.name || 'edge rail');
      this.root.add(line);
      this.rails.push({ data: rail, line, from, to, side: Number(rail.side) < 0 ? -1 : 1 });
    }
    this.pickups = [];
    const pickupMaterial = new THREE.MeshStandardMaterial({ color: 0xbffeff, emissive: 0x18dbe9, emissiveIntensity: 3.2, metalness: .3, roughness: .16, toneMapped: false });
    for (const pickup of Array.isArray(data.pickups) ? data.pickups : []) {
      const frame = track.sampleAt(Number(pickup.at) || 0);
      const orb = new THREE.Mesh(new THREE.SphereGeometry(.28, 10, 8), pickupMaterial);
      orb.position.copy(frame.position).addScaledVector(frame.right, Number(pickup.lateral) || 0).addScaledVector(frame.up, .7);
      this.root.add(orb); this.pickups.push({ data: pickup, mesh: orb, collected: false });
    }
    this.features = [];
    const featureMaterials = { pit: new THREE.MeshBasicMaterial({ color: 0x59ebd0, transparent: true, opacity: .72, toneMapped: false }), dash: new THREE.MeshBasicMaterial({ color: 0xffcb61, transparent: true, opacity: .88, toneMapped: false }), ramp: new THREE.MeshStandardMaterial({ color: 0x9f6cff, emissive: 0x5835d4, emissiveIntensity: 1.8, metalness: .3, roughness: .3 }) };
    for (const feature of Array.isArray(data.features) ? data.features : []) {
      if (!featureMaterials[feature.type]) continue;
      const frame = track.sampleAt(Number(feature.at) || 0);
      const pad = new THREE.Group();
      pad.name = feature.type === 'dash' ? 'free boost chevron pad' : feature.type + ' feature';
      const base = new THREE.Mesh(new THREE.BoxGeometry(track.width * .55, .06, 3.2), featureMaterials[feature.type]);
      pad.add(base);
      if (feature.type === 'dash') {
        const arrow = new THREE.Shape(); arrow.moveTo(-.42, -.32); arrow.lineTo(.42, 0); arrow.lineTo(-.42, .32); arrow.closePath();
        for (let i = -1; i <= 1; i += 1) {
          const chevron = new THREE.Mesh(new THREE.ShapeGeometry(arrow), featureMaterials.dash.clone());
          chevron.rotation.x = -Math.PI * .5; chevron.position.set(0, .08, i * .82); pad.add(chevron);
        }
      } else if (feature.type === 'ramp') {
        base.rotation.x = -.18;
        base.scale.z = 1.15;
      }
      pad.position.copy(frame.position).addScaledVector(frame.right, Number(feature.lateral) || 0).addScaledVector(frame.up, .1);
      basisQuaternion(frame, pad.quaternion); this.root.add(pad); this.features.push({ data: feature, mesh: pad });
    }
  }
  resetPickups() { for (const pickup of this.pickups) { pickup.collected = false; pickup.mesh.visible = true; } }
  onRail(progress, lateral, width) {
    for (const rail of this.rails) {
      const span = rail.to >= rail.from ? rail.to - rail.from : 1 - rail.from + rail.to;
      const offset = wrap01(progress - rail.from);
      const inside = offset <= span + .002;
      if (inside && Math.abs(lateral - rail.side * (width * .5 - 1.02)) < 1.45) return rail;
    }
    return null;
  }
  collect(progress, lateral) {
    for (const pickup of this.pickups) {
      if (pickup.collected || Math.min(Math.abs(progress - Number(pickup.data.at)), 1 - Math.abs(progress - Number(pickup.data.at))) > .018) continue;
      if (Math.abs(lateral - (Number(pickup.data.lateral) || 0)) > 3) continue;
      pickup.collected = true; pickup.mesh.visible = false; return true;
    }
    return false;
  }
  update(clock) {
    this.wallMaterial.opacity = .43 + Math.sin(clock * 4.5) * .1;
    for (const rail of this.rails) rail.line.material.opacity = .72 + Math.sin(clock * 7.5) * .2;
    for (const pickup of this.pickups) if (pickup.mesh.visible) { pickup.mesh.rotation.y = clock * 2.7; pickup.mesh.position.y += Math.sin(clock * 5 + pickup.mesh.position.x) * .0008; }
  }
  dispose() { this.root.traverse((object) => { if (object.geometry) object.geometry.dispose(); if (object.material) object.material.dispose(); }); }
}

class IonwakeApp {
  constructor(trackData) {
    this.tracks = trackData;
    this.save = migrateSave(kit.save.get(defaultSave()));
    if (!validSave(this.save)) this.save = defaultSave();
    this.cup = 0; this.trackIndex = 0; this.raceMode = 'grand-prix'; this.machineIndex = 0; this.liveryIndex = this.save.livery;
    this.racer = null; this.course = null; this.player = null; this.ghostCraft = null; this.rivals = []; this.sparks = null;
    this.mode = 'title'; this.countdown = 0; this.accumulator = 0; this.simClock = 0; this.viewClock = 0; this.lastTime = 0;
    this.pointerClaims = new Map(); this.previousKeys = new Set(); this.toastText = ''; this.toastTimer = 0; this.landingText = ''; this.tutorialTimer = 0; this.scriptInput = null; this.worldPacket = { carState: {}, rivals: [] };
    this.sim = { progress: .04, distance: .04, lap: 1, lapTime: 0, totalTime: 0, speed: 0, steering: 0, energy: 100, acceleration: 0, lateral: 0, boost: 0, airborne: 0, jumpQuality: '', contactTimer: 0, scrapeTimer: 0, railTimer: 0, stability: 1, spinTimer: 0, headingOffset: 0, cameraNudge: 0, previousProgress: .04, finished: false };
    this.raceResult = null; this.ghost = null; this.activeField = 8; this.lastForced = { track: null, cup: null, race: null };
    this.bindInput(); this.resize(); window.addEventListener('resize', () => this.resize());
    this.applyForceSwitches(); this.syncState(); this.render();
  }

  bindInput() {
    sceneCanvas.addEventListener('pointerdown', (event) => {
      const rect = sceneCanvas.getBoundingClientRect();
      const localX = event.clientX - rect.left; const localY = event.clientY - rect.top;
      let pointer = kit.input.pointers.get(event.pointerId);
      if (!pointer) pointer = { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, downAt: performance.now(), zone: 'claimed' };
      pointer.zone = 'claimed'; pointer.gameZone = this.mode === 'race' || this.mode === 'countdown' ? (localX > rect.width - 148 && localY > rect.height - 118 ? 'boost' : 'steer') : 'menu'; pointer.baseX = localX;
      kit.input.pointers.set(event.pointerId, pointer); this.pointerClaims.set(event.pointerId, { x: localX, y: localY, zone: pointer.gameZone });
      if (sceneCanvas.setPointerCapture) { try { sceneCanvas.setPointerCapture(event.pointerId); } catch (e) {} }
    }, { passive: true });
    sceneCanvas.addEventListener('pointerup', (event) => this.finishPointer(event), { passive: true });
    sceneCanvas.addEventListener('pointercancel', (event) => this.finishPointer(event), { passive: true });
  }

  finishPointer(event) {
    const claim = this.pointerClaims.get(event.pointerId);
    if (claim && claim.zone === 'menu') {
      const rect = sceneCanvas.getBoundingClientRect(); const x = event.clientX - rect.left; const y = event.clientY - rect.top;
      if (Math.hypot(x - claim.x, y - claim.y) < 28) this.handleTap(x, y, rect.width, rect.height);
    }
    this.pointerClaims.delete(event.pointerId); kit.input.pointers.delete(event.pointerId);
  }

  resize() {
    const rect = hudCanvas.getBoundingClientRect(); const dpr = Math.min(window.devicePixelRatio || 1, 2);
    hudCanvas.width = Math.max(1, Math.floor(rect.width * dpr)); hudCanvas.height = Math.max(1, Math.floor(rect.height * dpr));
    this.hudDpr = dpr; this.hudWidth = rect.width || window.innerWidth || 844; this.hudHeight = rect.height || window.innerHeight || 390;
    const ctx = hudCanvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.racer) this.racer.world.resize();
  }

  applyForceSwitches() {
    const forcedTrack = safeTrackIndex(requested.track); const forcedCup = safeCupIndex(requested.cup); const forcedRace = safeRace(requested.race);
    if (forcedTrack != null && requested.track !== this.lastForced.track) { this.lastForced.track = requested.track; this.trackIndex = forcedTrack; this.cup = Math.floor(forcedTrack / 3); if (this.racer && (this.mode === 'race' || this.mode === 'countdown')) this.startRace(this.raceMode, forcedTrack); }
    if (forcedCup != null && requested.cup !== this.lastForced.cup) { this.lastForced.cup = requested.cup; this.cup = forcedCup; this.trackIndex = CUPS[this.cup].tracks[0]; if (this.racer && (this.mode === 'race' || this.mode === 'countdown')) this.startRace(this.raceMode, this.trackIndex); }
    if (forcedRace && requested.race !== this.lastForced.race) { this.lastForced.race = requested.race; this.raceMode = forcedRace; this.startRace(forcedRace, this.trackIndex); }
    this.syncState();
  }

  selectedMachine() { return MACHINES.find((machine) => machine.id === this.save.machine) || MACHINES[0]; }
  selectedLivery() { return LIVERIES[this.liveryIndex] || LIVERIES[0]; }
  cycleMachine(direction = 1) {
    let index = MACHINES.findIndex((machine) => machine.id === this.save.machine); if (index < 0) index = 0;
    for (let i = 0; i < MACHINES.length; i += 1) { index = (index + direction + MACHINES.length) % MACHINES.length; if (MACHINES[index].unlock <= this.save.medals) break; }
    this.save.machine = MACHINES[index].id; kit.save.set(this.save); sfx(kit, 'ui', { volume: .4 });
  }
  cycleLivery(direction = 1) { this.liveryIndex = (this.liveryIndex + direction + LIVERIES.length) % LIVERIES.length; this.save.livery = this.liveryIndex; kit.save.set(this.save); sfx(kit, 'ui', { volume: .35 }); }
  cycleCup(direction = 1) { this.cup = (this.cup + direction + CUPS.length) % CUPS.length; this.trackIndex = CUPS[this.cup].tracks[0]; sfx(kit, 'ui', { volume: .35 }); }
  cycleTrack(direction = 1) { const tracks = CUPS[this.cup].tracks; const at = tracks.indexOf(this.trackIndex); this.trackIndex = tracks[(at + direction + tracks.length) % tracks.length]; sfx(kit, 'ui', { volume: .35 }); }

  startRace(mode = this.raceMode, trackIndex = this.trackIndex) {
    this.raceMode = mode; this.trackIndex = clamp(trackIndex, 0, this.tracks.length - 1); this.cup = Math.floor(this.trackIndex / 3); this.disposeRace();
    const data = this.tracks[this.trackIndex] || fallbackTrack(this.trackIndex); const livery = this.selectedLivery(); const machine = this.selectedMachine();
    this.racer = createRacerWorld({ canvas: sceneCanvas, trackJSON: data, theme: data.theme || 'night-city', timeOfDay: data.timeOfDay || 'night', ggkit: kit, rivalCount: 7, carName: 'Ionwake shared camera proxy', paint: livery.paint, accent: livery.accent });
    const concealGT = (car) => { car.root.visible = true; car.root.traverse((object) => { if (object.isMesh) object.visible = false; }); };
    concealGT(this.racer.world.mainCar);
    for (const rival of this.racer.world.rivals) concealGT(rival);
    this.racer.camera.setMode('chase');
    this.course = new CourseLayer(this.racer, data); this.sparks = new SparkPool(this.racer.world.scene);
    this.ghost = this.save.best[data.id] ? { time: this.save.best[data.id].time, progress: .04 } : null;
    this.player = createMachineKit({ id: machine.id, name: machine.name, paint: livery.paint, accent: livery.accent });
    this.racer.world.mainCar.root.add(this.player.root);
    if (mode === 'time-attack' && this.ghost) {
      this.ghostCraft = createMachineKit({ id: 'vanta-arc', name: 'time attack ghost', paint: 0x86f5ff, accent: 0xd8ffff, scale: .88 });
      this.ghostCraft.root.traverse((object) => { if (object.material) { object.material.transparent = true; object.material.opacity = .28; } });
      this.racer.world.scene.add(this.ghostCraft.root);
    }
    const rivalPalette = [0xff6d6d, 0x6d9cff, 0x81ed9a, 0xffae58, 0xd795ff, 0x66dce7, 0xf8e76c];
    this.rivals = [];
    for (let i = 0; i < 7; i += 1) {
      const rival = createMachineKit({ id: MACHINES[(i + 1) % MACHINES.length].id, name: 'AI ' + (i + 1), paint: rivalPalette[i], accent: 0xeaf7ff, scale: .92 });
      this.racer.world.rivals[i].root.add(rival.root); this.rivals.push(rival);
    }
    this.sim = { progress: .04, distance: .04, lap: 1, lapTime: 0, totalTime: 0, speed: 0, steering: 0, energy: machine.shield, acceleration: 0, lateral: 0, boost: 0, airborne: 0, jumpQuality: '', contactTimer: 0, scrapeTimer: 0, railTimer: 0, stability: 1, spinTimer: 0, headingOffset: 0, cameraNudge: 0, previousProgress: .04, finished: false };
    this.ai = this.rivals.map((_, i) => ({ progress: wrap01(.04 - (i + 1) * .013), distance: .04 - (i + 1) * .013, speed: 0, lateral: lineLateral(data, .04 - (i + 1) * .013), aggression: .38 + i * .08, skill: .93 + (i % 4) * .022, maxSpeed: MACHINES[(i + 1) % MACHINES.length].top / 3.6, energy: 100, eliminated: false, contactTimer: 0 }));
    this.countdown = 3.15; this.mode = 'countdown'; this.simClock = 0; this.accumulator = 0; this.activeField = 8; this.raceResult = null; this.tutorialTimer = this.save.tutorialDone ? 0 : 5;
    this.toastText = ''; this.toastTimer = 0; kit.audio.resume(); kit.audio.music(this.trackIndex % 2 ? 'stemB' : 'stemA', 320); sfx(kit, 'countdown', { volume: .35 });
    this.syncState(); this.resize();
  }

  disposeRace() {
    if (this.racer) { if (this.course) this.course.dispose(); if (this.player) this.player.dispose(); if (this.ghostCraft) this.ghostCraft.dispose(); for (const rival of this.rivals) rival.dispose(); if (this.sparks) this.sparks.dispose(); this.racer.world.dispose(); }
    this.racer = null; this.course = null; this.player = null; this.ghostCraft = null; this.rivals = []; this.sparks = null; this.ai = [];
  }

  restart() { if (this.mode === 'race' || this.mode === 'countdown') this.startRace(this.raceMode, this.trackIndex); else { this.mode = 'title'; this.render(); } }
  onKitPause() { this.accumulator = 0; this.pointerClaims.clear(); this.previousKeys.clear(); }
  onKitResume() { this.accumulator = 0; }

  input() {
    if (this.scriptInput) return this.scriptInput(this);
    let steer = 0; let boost = false; let brake = false;
    if (kit.input.keyDown('ArrowLeft') || kit.input.keyDown('KeyA')) steer -= 1;
    if (kit.input.keyDown('ArrowRight') || kit.input.keyDown('KeyD')) steer += 1;
    boost = kit.input.keyDown('Space') || kit.input.keyDown('ShiftLeft') || kit.input.keyDown('KeyX');
    brake = kit.input.keyDown('ArrowDown') || kit.input.keyDown('KeyS');
    const rect = sceneCanvas.getBoundingClientRect();
    for (const pointer of kit.input.pointers.values()) {
      if (pointer.gameZone === 'boost') boost = true;
      if (pointer.gameZone === 'steer') steer += clamp((pointer.x - pointer.baseX) / 90, -1, 1);
    }
    return { steer: clamp(steer, -1, 1), boost, brake };
  }

  keyPressed(code) {
    const down = kit.input.keyDown(code); const was = this.previousKeys.has(code);
    if (down) this.previousKeys.add(code); else this.previousKeys.delete(code);
    return down && !was;
  }

  step(dt) {
    this.applyForceSwitches();
    if (this.mode === 'countdown') { this.countdown -= dt; this.simClock += dt; if (this.countdown <= 0) { this.mode = 'race'; this.toast('GO', .75); sfx(kit, 'countdown', { volume: .5, rate: 1.4 }); } this.syncState(); return; }
    if (this.mode !== 'race' || kit.paused) return;
    this.simClock += dt; this.sim.totalTime += dt; this.sim.lapTime += dt;
    const machine = this.selectedMachine(); const input = this.input(); const data = this.tracks[this.trackIndex] || fallbackTrack(this.trackIndex); const track = this.racer.world.track;
    const previous = this.sim.progress; const targetSteer = input.steer * machine.handling;
    this.sim.steering += (targetSteer - this.sim.steering) * (1 - Math.exp(-dt * 8));
    const maxSpeed = machine.top / 3.6; const boost = input.boost && this.sim.energy > 2 && this.sim.airborne <= 0;
    const targetSpeed = maxSpeed * (boost ? 1.14 : 1);
    const accel = machine.accel * (boost ? 1.18 : 1) - (input.brake ? 52 : 0) - (this.sim.speed > targetSpeed ? 20 : 0) - this.sim.speed * .018;
    this.sim.acceleration = accel; this.sim.speed = clamp(this.sim.speed + accel * dt, 0, targetSpeed + 8);
    this.sim.boost = boost ? 1 : 0;
    if (boost) this.sim.energy = Math.max(0, this.sim.energy - machine.boost * dt); else this.sim.energy = Math.min(machine.shield, this.sim.energy);
    const challenge = trackChallenge(track, this.sim.progress);
    const speedRatio = clamp(this.sim.speed / Math.max(1, maxSpeed), 0, 1);
    const directionalSteer = this.sim.steering * challenge.sign;
    const steeringMatch = challenge.demand < .14 ? 1 : clamp(directionalSteer / Math.max(.24, challenge.demand * (.56 + speedRatio * .42)), 0, 1);
    if (challenge.demand > .14) {
      const cornerCap = challenge.safeSpeed + steeringMatch * Math.max(0, maxSpeed - challenge.safeSpeed);
      if (this.sim.speed > cornerCap) this.sim.speed = Math.max(0, this.sim.speed - (this.sim.speed - cornerCap) * (2.4 + challenge.demand * 4.6) * dt);
      if (steeringMatch < .45 && !input.brake) {
        this.sim.speed = Math.max(0, this.sim.speed - (7 + challenge.demand * 26) * dt);
        this.sim.energy = Math.max(0, this.sim.energy - (3 + challenge.demand * 10) * dt);
        this.sim.stability = Math.max(0, this.sim.stability - (0.34 + challenge.demand * .62) * dt);
        this.sim.lateral += challenge.sign * (1.2 + challenge.demand * 2.7) * dt;
      } else {
        this.sim.stability = Math.min(1, this.sim.stability + dt * (.24 + steeringMatch * .2));
      }
    } else this.sim.stability = Math.min(1, this.sim.stability + dt * .34);
    if (input.brake) this.sim.stability = Math.min(1, this.sim.stability + dt * .08);
    if (this.sim.stability < .27 && this.sim.spinTimer <= 0) {
      this.sim.spinTimer = .72; this.sim.headingOffset = challenge.sign * .82; this.sim.speed *= .42;
      this.sim.energy = Math.max(0, this.sim.energy - 9); this.sim.lateral += challenge.sign * 2.4;
      this.sparkAtPlayer(0xff5e54, 14); this.toast('SPINOUT - STEER THE LINE', .9); sfx(kit, 'contact', { volume: .38 });
    }
    if (this.sim.spinTimer > 0) { this.sim.spinTimer = Math.max(0, this.sim.spinTimer - dt); this.sim.headingOffset *= Math.max(0, 1 - dt * 1.8); }
    else this.sim.headingOffset *= Math.max(0, 1 - dt * 4.5);
    const lateralResponse = (7.3 + this.sim.speed * .065) * machine.handling;
    this.sim.lateral += this.sim.steering * lateralResponse * dt;
    this.sim.lateral *= 1 - dt * (this.sim.steering ? .32 : 1.25);
    const edge = track.width * .5 - .55;
    if (Math.abs(this.sim.lateral) > edge) {
      const wallOver = Math.abs(this.sim.lateral) - edge; this.sim.lateral = Math.sign(this.sim.lateral) * (edge + wallOver * .18);
      this.sim.speed = Math.max(0, this.sim.speed - (18 + wallOver * 24) * dt); this.sim.energy = Math.max(0, this.sim.energy - (12 + wallOver * 18) * dt);
      this.sim.stability = Math.max(0, this.sim.stability - dt * .24);
      this.sim.scrapeTimer -= dt;
      if (this.sim.scrapeTimer <= 0) { this.sim.scrapeTimer = .16; this.sparkAtPlayer(0xffc96a, 5); sfx(kit, 'scrape', { volume: .2 }); }
    }
    const magnetic = track.width * .5 - .95;
    if (Math.abs(this.sim.lateral) > magnetic) this.sim.lateral -= Math.sign(this.sim.lateral) * .04 * dt;
    const distanceStep = this.sim.speed * dt / Math.max(1, track.length); this.sim.distance += distanceStep; this.sim.progress = wrap01(this.sim.distance); this.sim.previousProgress = previous;
    if (this.sim.airborne > 0) { this.sim.airborne = Math.max(0, this.sim.airborne - dt); if (this.sim.airborne === 0) this.land(); }
    this.handleTrackEvents(previous, this.sim.progress, dt);
    const rail = this.course && this.course.onRail(this.sim.progress, this.sim.lateral, track.width);
    if (rail) {
      this.sim.energy = Math.min(machine.shield, this.sim.energy + (8 + this.sim.speed * .08) * dt);
      this.sim.railTimer -= dt;
      if (this.sim.railTimer <= 0) { this.sim.railTimer = .55; this.toast('CHARGE RAIL + ENERGY', .42); sfx(kit, 'pickup', { volume: .18, rate: 1.18 }); }
    } else this.sim.railTimer = Math.min(0, this.sim.railTimer - dt);
    this.updateAI(dt, data, track);
    this.handleContacts(track);
    if (this.ghost) this.ghost.progress = wrap01(.04 + this.sim.lapTime / Math.max(.1, this.ghost.time));
    if (this.sparks) this.sparks.update(dt);
    if (this.sim.lap > (this.raceMode === 'time-attack' ? 1 : this.raceMode === 'survival' ? 5 : TOTAL_LAPS)) this.finishRace();
    this.syncState();
  }

  handleTrackEvents(previous, current, dt) {
    const data = this.tracks[this.trackIndex] || fallbackTrack(this.trackIndex); const wrapped = current < previous;
    const crossed = (at) => wrapped ? at >= previous || at <= current : at >= previous && at <= current;
    for (const feature of Array.isArray(data.features) ? data.features : []) {
      if (!crossed(Number(feature.at) || 0)) continue;
      if (feature.type === 'pit') { this.sim.energy = Math.min(this.selectedMachine().shield, this.sim.energy + 22); this.toast('PIT STRIP + ENERGY', .8); sfx(kit, 'pickup', { volume: .26 }); }
      if (feature.type === 'dash') { this.sim.speed = Math.min(this.selectedMachine().top / 3.6 + 12, this.sim.speed + 16); this.sim.energy = Math.min(this.selectedMachine().shield, this.sim.energy + 7); this.toast('DASH PLATE', .65); sfx(kit, 'dash', { volume: .35 }); }
      if (feature.type === 'ramp') { this.sim.airborne = .52; this.sim.jumpQuality = ''; this.toast('AIM FOR THE LANDING', .75); }
    }
    if (this.course && this.course.collect(current, this.sim.lateral)) { this.sim.energy = Math.min(this.selectedMachine().shield, this.sim.energy + 18); this.toast('ENERGY ORB', .7); sfx(kit, 'pickup', { volume: .34 }); }
    if (wrapped) { this.sim.lap += 1; this.sim.lapTime = 0; if (this.course) this.course.resetPickups(); sfx(kit, 'lap', { volume: .35 }); this.toast('LAP ' + Math.min(this.sim.lap, 9), .8); if (this.raceMode === 'survival') this.shrinkField(); if (!this.save.tutorialDone && this.sim.lap >= 2) { this.save.tutorialDone = true; kit.save.set(this.save); } }
    if (this.tutorialTimer > 0) this.tutorialTimer = Math.max(0, this.tutorialTimer - dt);
  }

  shrinkField() { const active = this.ai.filter((rival) => !rival.eliminated); if (!active.length) return; active.sort((a, b) => a.distance - b.distance); const removed = active[0]; removed.eliminated = true; this.activeField = Math.max(1, this.activeField - 1); this.toast('FIELD SHRINKS', .9); }

  updateAI(dt, data, track) {
    for (let i = 0; i < this.ai.length; i += 1) {
      const rival = this.ai[i]; if (rival.eliminated) continue;
      rival.contactTimer = Math.max(0, rival.contactTimer - dt);
      const rubber = clamp((this.sim.distance - rival.distance) * .32, -.11, .12);
      const challenge = trackChallenge(track, rival.progress);
      const ideal = rival.maxSpeed * (.81 + rival.skill * .14 + rubber - challenge.demand * .2 + Math.sin(this.simClock * (1.3 + rival.aggression) + i) * .012);
      rival.speed += (ideal - rival.speed) * (1 - Math.exp(-dt * (3.2 + rival.aggression)));
      rival.speed = clamp(rival.speed, 18, rival.maxSpeed + 5);
      rival.distance += rival.speed * dt / Math.max(1, track.length); rival.progress = wrap01(.04 + rival.distance);
      let wanted = lineLateral(data, rival.progress) + Math.sin(this.simClock * (1.1 + rival.aggression) + i * 1.7) * (.12 + rival.aggression * .22);
      for (let j = 0; j < this.ai.length; j += 1) {
        if (j === i || this.ai[j].eliminated) continue;
        const other = this.ai[j];
        if (Math.abs(rival.distance - other.distance) < 9 / Math.max(1, track.length) && Math.abs(rival.lateral - other.lateral) < 3.4) wanted += (rival.lateral >= other.lateral ? 1 : -1) * (.85 + rival.aggression * .35);
      }
      rival.lateral += (wanted - rival.lateral) * (1 - Math.exp(-dt * (2.6 + rival.aggression * 2)));
      if (this.course && this.course.onRail(rival.progress, rival.lateral, track.width)) rival.energy = Math.min(100, rival.energy + 5 * dt);
    }
  }

  frameAt(progress, lateral, out = {}) {
    const direct = out.position && out.tangent && out.right && out.up;
    const frame = this.racer.world.track.sampleAt(progress, direct ? out : (out.frame || blankFrame()));
    frame.position.addScaledVector(frame.right, lateral); if (!direct) out.frame = frame; return frame;
  }

  handleContacts(track) {
    this.sim.contactTimer = Math.max(0, this.sim.contactTimer - FIXED);
    const playerFrame = this.frameAt(this.sim.progress, this.sim.lateral, this.contactFrame || (this.contactFrame = {}));
    for (let i = 0; i < this.ai.length; i += 1) {
      const rival = this.ai[i]; if (rival.eliminated) continue;
      if (Math.abs(this.sim.distance - rival.distance) > 9 / Math.max(1, track.length) || Math.abs(this.sim.lateral - rival.lateral) > 3.25) continue;
      const rivalFrame = this.frameAt(rival.progress, rival.lateral, this.rivalContactFrame || (this.rivalContactFrame = {}));
      if (playerFrame.position.distanceToSquared(rivalFrame.position) > 22) continue;
      if (this.sim.contactTimer <= 0 && rival.contactTimer <= 0) this.applyContact(i);
    }
    for (let i = 0; i < this.ai.length; i += 1) {
      const left = this.ai[i]; if (left.eliminated) continue;
      for (let j = i + 1; j < this.ai.length; j += 1) {
        const right = this.ai[j]; if (right.eliminated || left.contactTimer > 0 || right.contactTimer > 0) continue;
        if (Math.abs(left.distance - right.distance) > 9 / Math.max(1, track.length) || Math.abs(left.lateral - right.lateral) > 3.25) continue;
        const leftFrame = this.frameAt(left.progress, left.lateral, this.aiContactFrameA || (this.aiContactFrameA = {}));
        const rightFrame = this.frameAt(right.progress, right.lateral, this.aiContactFrameB || (this.aiContactFrameB = {}));
        if (leftFrame.position.distanceToSquared(rightFrame.position) <= 22) this.applyContactPair(i, j);
      }
    }
  }

  applyContact(index) {
    const rival = this.ai[index]; const direction = Math.sign(this.sim.lateral - rival.lateral) || (index % 2 ? 1 : -1);
    this.sim.contactTimer = .28; rival.contactTimer = .28;
    this.sim.lateral += direction * 1.55; rival.lateral -= direction * 1.25;
    this.sim.speed = Math.max(0, this.sim.speed - 5.8); rival.speed = Math.max(0, rival.speed - 5.2);
    this.sim.energy = Math.max(0, this.sim.energy - 9); rival.energy = Math.max(0, rival.energy - 9);
    this.sim.stability = Math.max(0, this.sim.stability - .16); this.sim.cameraNudge = direction;
    this.save.contacts += 1; state.lastContact = { rival: index + 1, at: this.sim.totalTime };
    this.sparkAtPlayer(0xff8b59, 11); this.sparkAtRival(index, 0xffd27a, 8); sfx(kit, 'contact', { volume: .38 });
    this.toast('MACHINE CONTACT', .52);
  }

  applyContactPair(leftIndex, rightIndex) {
    const left = this.ai[leftIndex]; const right = this.ai[rightIndex]; const direction = Math.sign(left.lateral - right.lateral) || (leftIndex % 2 ? 1 : -1);
    left.contactTimer = .28; right.contactTimer = .28;
    left.lateral += direction * 1.35; right.lateral -= direction * 1.35;
    left.speed = Math.max(0, left.speed - 5.2); right.speed = Math.max(0, right.speed - 5.2);
    left.energy = Math.max(0, left.energy - 8); right.energy = Math.max(0, right.energy - 8);
    this.sparkAtRival(leftIndex, 0xffbe60, 7); this.sparkAtRival(rightIndex, 0xffbe60, 7);
  }

  land() { const clean = Math.abs(this.sim.steering) < .4 && Math.abs(this.sim.lateral) < (this.racer.world.track.width * .35); this.sim.jumpQuality = clean ? 'CLEAN LANDING' : 'HARD LANDING'; this.toast(this.sim.jumpQuality, .8); if (!clean) { this.sim.speed = Math.max(0, this.sim.speed - 12); this.sim.energy = Math.max(0, this.sim.energy - 3); } sfx(kit, 'landing', { volume: clean ? .34 : .45 }); }

  sparkAtPlayer(color, count) { if (!this.sparks || !this.racer) return; const frame = this.frameAt(this.sim.progress, this.sim.lateral, this.sparkFrame || (this.sparkFrame = {})); this.sparks.burst(frame.position, color, count); }

  sparkAtRival(index, color, count) { if (!this.sparks || !this.racer || !this.ai[index]) return; if (!this.rivalSparkFrames) this.rivalSparkFrames = []; if (!this.rivalSparkFrames[index]) this.rivalSparkFrames[index] = {}; const rival = this.ai[index]; const frame = this.frameAt(rival.progress, rival.lateral, this.rivalSparkFrames[index]); this.sparks.burst(frame.position, color, count); }

  finishRace() {
    if (this.sim.finished) return; this.sim.finished = true; this.mode = 'results'; this.sim.speed = 0;
    const standings = this.standings(); const position = standings.findIndex((entry) => entry.player) + 1; const track = this.tracks[this.trackIndex] || fallbackTrack(this.trackIndex); const time = this.sim.totalTime;
    const result = { position, time, track: track.id, mode: this.raceMode, points: POINTS[position - 1] || 0, medal: time < 102 ? 'GOLD' : time < 132 ? 'SILVER' : 'BRONZE' };
    this.raceResult = result; this.save.medals += result.medal === 'GOLD' ? 2 : result.medal === 'SILVER' ? 1 : 0;
    if (this.raceMode === 'time-attack' && (!this.save.best[track.id] || time < this.save.best[track.id].time)) this.save.best[track.id] = { time, ghost: true };
    if (this.raceMode === 'grand-prix') { const cup = this.cup; const key = CUPS[cup].id; if (!this.save.cups[key]) this.save.cups[key] = { points: 0, tracks: [] }; this.save.cups[key].points += result.points; this.save.cups[key].tracks.push({ track: track.id, position, medal: result.medal }); }
    kit.save.set(this.save); sfx(kit, 'podium', { volume: .5 }); kit.audio.stopMusic(420); this.syncState();
  }

  standings() {
    const entries = [{ player: true, distance: this.sim.distance, id: -1 }];
    for (let i = 0; i < this.ai.length; i += 1) if (!this.ai[i].eliminated) entries.push({ player: false, distance: this.ai[i].distance, id: i });
    entries.sort((a, b) => b.distance - a.distance); return entries;
  }

  continueAfterResults() {
    if (this.raceMode === 'grand-prix') {
      const tracks = CUPS[this.cup].tracks; const at = tracks.indexOf(this.trackIndex);
      if (at >= 0 && at < tracks.length - 1) { this.startRace('grand-prix', tracks[at + 1]); return; }
      this.mode = 'podium'; this.disposeRace(); this.syncState(); return;
    }
    this.disposeRace(); this.mode = 'title'; this.syncState();
  }

  toast(text, seconds = 1) { this.toastText = text; this.toastTimer = seconds; }

  syncState() {
    const track = this.tracks[this.trackIndex] || fallbackTrack(this.trackIndex); const standings = this.mode === 'race' || this.mode === 'countdown' ? this.standings() : [];
    state.mode = this.mode; state.cup = this.cup; state.track = this.trackIndex; state.trackId = track.id; state.lap = this.sim.lap; state.pos = standings.length ? standings.findIndex((entry) => entry.player) + 1 : (this.raceResult ? this.raceResult.position : 8); state.energy = Math.round(this.sim.energy); state.speed = Math.round(this.sim.speed * 3.6); state.race = this.raceMode; state.machine = this.selectedMachine().id; state.stability = Math.round(this.sim.stability * 100); state.contactCount = this.save.contacts; state.onChargeRail = !!(this.course && this.course.onRail(this.sim.progress, this.sim.lateral, this.racer ? this.racer.world.track.width : 14));
  }

  runScriptedTest(kind = 'no-steer') {
    const longest = this.tracks.reduce((best, item, index) => {
      const points = Array.isArray(item.controlPoints) ? item.controlPoints : [];
      let length = 0;
      for (let i = 0; i < points.length; i += 1) { const a = points[i]; const b = points[(i + 1) % points.length]; length += Math.hypot((Number(b.x) || 0) - (Number(a.x) || 0), (Number(b.z) || 0) - (Number(a.z) || 0), (Number(b.elevation ?? b.y) || 0) - (Number(a.elevation ?? a.y) || 0)); }
      return length > best.length ? { index, length } : best;
    }, { index: 0, length: 0 });
    this.startRace('time-attack', longest.index); this.mode = 'race'; this.countdown = 0;
    const scriptedKind = kind === 'steered' ? 'steered' : 'no-steer';
    this.scriptInput = (appRef) => {
      if (scriptedKind === 'no-steer') return { steer: 0, boost: false, brake: false };
      const challenge = trackChallenge(appRef.racer.world.track, appRef.sim.progress);
      const steer = challenge.demand > .12 ? challenge.sign * clamp(challenge.demand * 1.16 + .14, 0, 1) : 0;
      const brake = challenge.demand > .52 && appRef.sim.speed > challenge.safeSpeed + 8;
      return { steer, boost: false, brake };
    };
    const started = longest.index; let frames = 0; const maxFrames = 60 * 260;
    while (this.mode === 'race' && frames < maxFrames) { this.step(FIXED); frames += 1; }
    const result = { kind: scriptedKind, track: this.tracks[started].id, lengthEstimate: longest.length, seconds: this.sim.totalTime, lap: this.sim.lap, position: this.standings().findIndex((entry) => entry.player) + 1, finished: this.sim.finished, stability: this.sim.stability, frames };
    this.scriptInput = null; state.tests = { ...(state.tests || {}), [scriptedKind]: result };
    this.disposeRace(); this.mode = 'title'; this.syncState(); this.render();
    return result;
  }

  sampleTrackFrames(trackIndex = this.trackIndex, count = 256) {
    const index = clamp(Number(trackIndex) || 0, 0, this.tracks.length - 1); const data = this.tracks[index] || fallbackTrack(index);
    if (!this.racer || this.trackIndex !== index) this.startRace('time-attack', index);
    const samples = []; let finite = true; const track = this.racer.world.track; const frame = blankFrame();
    for (let i = 0; i < Math.max(8, count); i += 1) {
      track.sampleAt(i / Math.max(8, count), frame);
      const values = [frame.position.x, frame.position.y, frame.position.z, frame.tangent.x, frame.tangent.y, frame.tangent.z, frame.right.x, frame.right.y, frame.right.z, frame.up.x, frame.up.y, frame.up.z];
      if (values.some((value) => !Number.isFinite(value))) finite = false;
      if (i < 4 || i >= Math.max(8, count) - 4) samples.push({ progress: i / Math.max(8, count), position: [frame.position.x, frame.position.y, frame.position.z] });
    }
    return { id: data.id, length: track.length, sampleCount: track.sampleCount, finite, samples };
  }

  sampleAllTrackFrames(count = 256) {
    const results = [];
    for (let i = 0; i < this.tracks.length; i += 1) { this.startRace('time-attack', i); results.push(this.sampleTrackFrames(i, count)); this.disposeRace(); }
    this.mode = 'title'; this.syncState(); this.render(); return results;
  }

  handleTap(x, y, width, height) {
    if (this.mode === 'title') {
      if (y > height * .35 && y < height * .59) { if (x < width / 3) this.startRace('grand-prix', CUPS[this.cup].tracks[0]); else if (x < width * 2 / 3) this.startRace('time-attack', this.trackIndex); else this.startRace('survival', this.trackIndex); return; }
      if (y > height * .63 && y < height * .78) { if (x < width * .27) this.cycleCup(-1); else if (x > width * .73) this.cycleCup(1); else this.cycleTrack(1); return; }
      if (y > height * .78 && x > width * .38 && x < width * .62) { this.cycleMachine(1); return; }
    } else if (this.mode === 'results' || this.mode === 'podium') {
      if (y > height * .65) this.continueAfterResults();
    }
  }

  handleKeys() {
    if (this.keyPressed('KeyR')) return kit.restart();
    if (this.keyPressed('KeyO')) return kit.openSettings();
    if (this.keyPressed('Escape') && (this.mode === 'race' || this.mode === 'countdown')) { kit.pause('user'); return; }
    if (this.mode === 'title') {
      if (this.keyPressed('Digit1')) return this.startRace('grand-prix', CUPS[this.cup].tracks[0]);
      if (this.keyPressed('Digit2')) return this.startRace('time-attack', this.trackIndex);
      if (this.keyPressed('Digit3')) return this.startRace('survival', this.trackIndex);
      if (this.keyPressed('ArrowLeft')) return this.cycleCup(-1);
      if (this.keyPressed('ArrowRight')) return this.cycleCup(1);
      if (this.keyPressed('Tab')) return this.cycleMachine(1);
      if (this.keyPressed('KeyL')) return this.cycleLivery(1);
      if (this.keyPressed('Enter')) return this.startRace('grand-prix', CUPS[this.cup].tracks[0]);
    } else if ((this.mode === 'results' || this.mode === 'podium') && (this.keyPressed('Enter') || this.keyPressed('Space'))) this.continueAfterResults();
  }

  updateView(viewDt) {
    if (!this.racer) return;
    const playerFrame = this.frameAt(this.sim.progress, this.sim.lateral, this.viewPlayerFrame || (this.viewPlayerFrame = blankFrame()));
    const data = this.tracks[this.trackIndex] || fallbackTrack(this.trackIndex);
    const mainState = this.worldPacket.carState; delete mainState.position; delete mainState.yaw; mainState.progress = this.sim.progress; mainState.lateral = this.sim.lateral - lineLateral(data, this.sim.progress); mainState.hover = .34 + (this.sim.airborne > 0 ? .18 : 0); mainState.headingOffset = this.sim.headingOffset; mainState.speed = this.sim.speed; mainState.steering = this.sim.steering; mainState.acceleration = this.sim.acceleration; mainState.lateralG = this.sim.steering * this.sim.speed * .04; mainState.pitch = this.sim.airborne > 0 ? .18 : 0; mainState.boost = this.sim.boost;
    const rivalFrames = this.worldPacket.rivals;
    for (let i = 0; i < this.ai.length; i += 1) { const ai = this.ai[i]; if (!this.viewRivalFrames) this.viewRivalFrames = []; if (!this.viewRivalFrames[i]) this.viewRivalFrames[i] = blankFrame(); this.frameAt(ai.progress, ai.lateral, this.viewRivalFrames[i]); const packet = rivalFrames[i] || (rivalFrames[i] = {}); delete packet.position; delete packet.yaw; packet.progress = ai.progress; packet.lateral = ai.lateral - lineLateral(data, ai.progress); packet.hover = .34; packet.speed = ai.speed; packet.steering = 0; packet.acceleration = 0; }
    rivalFrames.length = this.ai.length;
    this.racer.world.update(this.worldPacket, viewDt);
    if (this.sim.cameraNudge) { this.racer.camera.object.rotateZ(clamp(this.sim.cameraNudge * .018, -.03, .03)); this.sim.cameraNudge *= .78; }
    if (this.player) this.player.update({ speed: this.sim.speed, steering: this.sim.steering, acceleration: this.sim.acceleration, lateralG: this.sim.steering * this.sim.speed * .04, pitch: this.sim.airborne > 0 ? .18 : 0 }, viewDt, this.simClock, this.sim.energy, this.sim.boost);
    for (let i = 0; i < this.rivals.length; i += 1) { if (this.ai[i] && this.ai[i].eliminated) { this.rivals[i].root.visible = false; continue; } this.rivals[i].root.visible = true; this.rivals[i].update({ speed: this.ai[i].speed, steering: 0, acceleration: 0 }, viewDt, this.simClock, this.ai[i].energy, 0); }
    if (this.ghostCraft && this.ghost) { if (!this.ghostFrame) this.ghostFrame = blankFrame(); const ghostFrame = this.frameAt(this.ghost.progress, lineLateral(data, this.ghost.progress), this.ghostFrame); this.ghostCraft.root.position.copy(ghostFrame.position).addScaledVector(ghostFrame.up, .34); basisQuaternion(ghostFrame, this.ghostCraft.root.quaternion); this.ghostCraft.update({ speed: 52, steering: 0, acceleration: 0 }, viewDt, this.simClock, 100, 0); }
    if (this.course) this.course.update(this.simClock);
    this.racer.world.render();
  }

  loop(now) {
    const elapsed = this.lastTime ? Math.min(.12, (now - this.lastTime) / 1000) : FIXED; this.lastTime = now;
    if (!kit.paused) { this.accumulator += elapsed; let steps = 0; while (this.accumulator >= FIXED && steps < 10) { this.step(FIXED); this.accumulator -= FIXED; steps += 1; } this.handleKeys(); this.updateView(steps * FIXED); }
    else this.handleKeys();
    if (this.toastTimer > 0) this.toastTimer = Math.max(0, this.toastTimer - elapsed);
    this.render(); requestAnimationFrame((time) => this.loop(time));
  }

  text(ctx, value, x, y, size, color = '#f3f8ff', align = 'left', weight = 700) { ctx.font = weight + ' ' + size + 'px Inter, system-ui, sans-serif'; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(value, x, y); }
  panel(ctx, x, y, w, h, fill = 'rgba(8,19,32,.78)', stroke = 'rgba(93,235,243,.45)') { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, w - 1, h - 1); }
  render() {
    const ctx = hudCanvas.getContext('2d'); const w = this.hudWidth; const h = this.hudHeight; const dpr = this.hudDpr || 1; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    if (!this.racer) { ctx.fillStyle = '#06111e'; ctx.fillRect(0, 0, w, h); for (let x = -h; x < w + h; x += 42) { ctx.strokeStyle = 'rgba(41,116,148,.16)'; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x - h, h); ctx.stroke(); } }
    if (this.mode === 'title') this.renderTitle(ctx, w, h); else if (this.mode === 'race' || this.mode === 'countdown') this.renderRaceHud(ctx, w, h); else this.renderResult(ctx, w, h);
  }

  renderTitle(ctx, w, h) {
    const cup = CUPS[this.cup]; const track = this.tracks[this.trackIndex] || fallbackTrack(this.trackIndex); const machine = this.selectedMachine();
    this.text(ctx, 'IONWAKE', w * .07, h * .17, Math.max(30, Math.min(64, w * .07)), '#effcff', 'left', 900);
    this.text(ctx, 'ANTI-GRAV GRAND PRIX', w * .075, h * .25, 13, '#61e5ef', 'left', 800);
    this.text(ctx, cup.name, w * .075, h * .72, 15, cup.color, 'left', 800); this.text(ctx, track.name, w * .075, h * .78, 15, '#f4f7fb', 'left', 700);
    this.text(ctx, '<', w * .04, h * .72, 24, '#61e5ef', 'center', 800); this.text(ctx, '>', w * .96, h * .72, 24, '#61e5ef', 'center', 800);
    const cardY = h * .37; const cardW = Math.min(220, w * .28); const gap = Math.min(16, w * .025); const startX = (w - (cardW * 3 + gap * 2)) / 2;
    [['GRAND PRIX', '3 TRACK CUP', '1'], ['TIME ATTACK', 'CHASE GHOST', '2'], ['SURVIVAL', 'FIELD SHRINKS', '3']].forEach((card, i) => { const x = startX + i * (cardW + gap); this.panel(ctx, x, cardY, cardW, h * .2, i === 0 ? 'rgba(24,69,79,.86)' : 'rgba(10,28,45,.86)', i === 0 ? '#61e5ef' : 'rgba(117,155,181,.5)'); this.text(ctx, card[0], x + cardW * .08, cardY + h * .07, 14, '#f3f8ff'); this.text(ctx, card[1], x + cardW * .08, cardY + h * .14, 11, '#88a9ba', 'left', 600); this.text(ctx, card[2], x + cardW * .9, cardY + h * .07, 13, '#ffca61', 'center', 900); });
    this.panel(ctx, w * .31, h * .82, w * .38, h * .1, 'rgba(10,28,45,.9)', 'rgba(255,202,97,.45)'); this.text(ctx, machine.name + '  /  ' + LIVERIES[this.liveryIndex].name, w * .5, h * .87, 14, '#ffda86', 'center', 800);
    this.text(ctx, 'Tap a mode  |  arrows change cup  |  tap machine  |  L changes livery', w * .5, h * .95, 12, '#7f9daf', 'center', 600);
  }

  renderMinimap(ctx, w, h) {
    if (!this.racer || !this.racer.minimap || !this.racer.minimap.length) return;
    const points = this.racer.minimap; const boxW = Math.min(156, w * .2); const boxH = 92; const x = w - boxW - 16; const y = h - boxH - 100;
    let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
    for (const point of points) { minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x); minZ = Math.min(minZ, point.z); maxZ = Math.max(maxZ, point.z); }
    const sx = (boxW - 18) / Math.max(1, maxX - minX); const sz = (boxH - 22) / Math.max(1, maxZ - minZ); const scale = Math.min(sx, sz);
    const px = (value) => x + 9 + (value.x - minX) * scale + (boxW - 18 - (maxX - minX) * scale) * .5;
    const py = (value) => y + 11 + (value.z - minZ) * scale + (boxH - 22 - (maxZ - minZ) * scale) * .5;
    this.panel(ctx, x, y, boxW, boxH, 'rgba(4,17,28,.82)', 'rgba(76,238,231,.55)');
    ctx.strokeStyle = 'rgba(201,247,255,.75)'; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i < points.length; i += 1) { const point = points[i]; if (i === 0) ctx.moveTo(px(point), py(point)); else ctx.lineTo(px(point), py(point)); }
    ctx.closePath(); ctx.stroke();
    const data = this.tracks[this.trackIndex] || fallbackTrack(this.trackIndex);
    ctx.strokeStyle = '#32f3df'; ctx.lineWidth = 3;
    for (const rail of Array.isArray(data.rails) ? data.rails : []) {
      const from = Number(rail.from ?? rail.at ?? 0); const to = Number(rail.to ?? from + .12); const count = 12; ctx.beginPath();
      for (let i = 0; i <= count; i += 1) { const point = points[Math.floor(wrap01(from + (to - from) * i / count) * points.length) % points.length]; if (i === 0) ctx.moveTo(px(point), py(point)); else ctx.lineTo(px(point), py(point)); }
      ctx.stroke();
    }
    const playerPoint = points[Math.floor(wrap01(this.sim.progress) * points.length) % points.length]; ctx.fillStyle = '#ffca69'; ctx.beginPath(); ctx.arc(px(playerPoint), py(playerPoint), 3.6, 0, TAU); ctx.fill();
    for (const rival of this.ai) { if (rival.eliminated) continue; const point = points[Math.floor(wrap01(rival.progress) * points.length) % points.length]; ctx.fillStyle = '#ff716c'; ctx.beginPath(); ctx.arc(px(point), py(point), 2.1, 0, TAU); ctx.fill(); }
    this.text(ctx, 'TRACK MAP  /  CHARGE RAILS', x + 8, y + boxH - 8, 8, '#9be8ea', 'left', 800);
  }

  renderRaceHud(ctx, w, h) {
    const standings = this.standings(); const position = standings.findIndex((entry) => entry.player) + 1; const speed = Math.round(this.sim.speed * 3.6); const lapTarget = this.raceMode === 'time-attack' ? 1 : this.raceMode === 'survival' ? 5 : TOTAL_LAPS;
    ctx.fillStyle = 'rgba(3,12,22,.28)'; ctx.fillRect(0, 0, w, 62);
    this.text(ctx, String(speed).padStart(3, '0'), 18, 24, 26, '#f3f8ff', 'left', 900); this.text(ctx, 'KM/H', 20, 47, 10, '#7fa9bb', 'left', 700);
    this.text(ctx, 'LAP ' + clamp(this.sim.lap, 1, lapTarget) + '/' + lapTarget, w * .5, 22, 14, '#f3f8ff', 'center', 800);
    this.text(ctx, position + ' / ' + this.activeField, w - 20, 24, 25, '#ffca61', 'right', 900); this.text(ctx, 'POS', w - 21, 47, 10, '#7fa9bb', 'right', 700);
    const barX = w * .28; const barW = w * .44; this.text(ctx, 'ENERGY', barX - 8, 52, 10, '#65e7ee', 'right', 800); ctx.fillStyle = 'rgba(8,22,34,.92)'; ctx.fillRect(barX, 47, barW, 10); ctx.fillStyle = this.sim.energy < 25 ? '#ff786e' : '#4de6df'; ctx.fillRect(barX, 47, barW * clamp(this.sim.energy / this.selectedMachine().shield, 0, 1), 10); ctx.strokeStyle = 'rgba(200,250,255,.65)'; ctx.strokeRect(barX, 47, barW, 10);
    this.renderMinimap(ctx, w, h);
    if (this.sim.boost) { this.panel(ctx, 16, h - 78, 106, 42, 'rgba(255,175,69,.22)', 'rgba(255,208,103,.7)'); this.text(ctx, 'BOOST', 69, h - 57, 14, '#ffdc91', 'center', 900); }
    this.panel(ctx, w - 132, h - 78, 116, 42, 'rgba(4,22,35,.58)', 'rgba(91,230,238,.45)'); this.text(ctx, 'S BRAKE  /  BOOST', w - 74, h - 57, 9, '#a9d8df', 'center', 700);
    if (this.mode === 'countdown') { ctx.fillStyle = 'rgba(4,13,25,.22)'; ctx.fillRect(w * .38, h * .36, w * .24, h * .15); const beat = this.countdown > 0 ? Math.ceil(this.countdown) : 0; this.text(ctx, beat > 0 ? String(beat) : 'GO', w * .5, h * .435, 42, beat === 0 ? '#ffca61' : '#f4fbff', 'center', 900); }
    const tutorial = !this.save.tutorialDone && this.tutorialTimer > 0 ? (this.sim.speed < 8 ? 'STEER WITH A / D OR DRAG. ENERGY IS YOUR SHIELD.' : this.sim.energy > 35 ? 'HOLD BOOST TO SPEND ENERGY. DASH PLATES ARE FREE.' : 'PIT STRIPS AND ORBS RECHARGE ENERGY. TOUCH THE LINE.') : '';
    if (tutorial) { ctx.fillStyle = 'rgba(5,15,27,.72)'; ctx.fillRect(0, 66, w, 30); this.text(ctx, tutorial, w * .5, 81, 12, '#b7e9ec', 'center', 700); }
    if (this.toastTimer > 0 && this.toastText) { const fade = clamp(this.toastTimer / .35, 0, 1); ctx.globalAlpha = fade; this.panel(ctx, w * .5 - 86, 70, 172, 28, 'rgba(7,20,31,.72)', 'rgba(93,235,243,.5)'); this.text(ctx, this.toastText, w * .5, 84, 11, '#f2fcff', 'center', 800); ctx.globalAlpha = 1; }
  }

  renderResult(ctx, w, h) {
    const result = this.raceResult; const track = this.tracks[this.trackIndex] || fallbackTrack(this.trackIndex);
    this.text(ctx, this.mode === 'podium' ? 'CUP COMPLETE' : 'RUN COMPLETE', w * .5, h * .2, 28, '#f4fbff', 'center', 900);
    this.text(ctx, this.mode === 'podium' ? CUPS[this.cup].name : track.name, w * .5, h * .28, 14, '#65e7ee', 'center', 800);
    if (this.mode === 'podium') { const cup = this.save.cups[CUPS[this.cup].id] || { points: 0, tracks: [] }; this.panel(ctx, w * .22, h * .34, w * .56, h * .3, 'rgba(10,30,47,.9)', 'rgba(255,202,97,.6)'); this.text(ctx, 'POINTS TABLE', w * .5, h * .39, 12, '#ffda86', 'center', 800); this.text(ctx, String(cup.points).padStart(2, '0') + ' TOTAL', w * .5, h * .45, 24, '#f4fbff', 'center', 900); for (let i = 0; i < 3; i += 1) { const row = cup.tracks[i]; const name = row ? ((this.tracks.find((item) => item.id === row.track) || {}).name || row.track) : 'NEXT TRACK'; this.text(ctx, name, w * .27, h * (.51 + i * .045), 11, '#b5cbd4'); this.text(ctx, row ? String(row.position) + 'TH  ' + (POINTS[row.position - 1] || 0) : '-', w * .72, h * (.51 + i * .045), 11, '#ffda86', 'right', 800); } this.text(ctx, 'MEDALS  ' + this.save.medals, w * .5, h * .64, 11, '#a9c1cc', 'center', 700); }
    else if (result) { this.panel(ctx, w * .28, h * .34, w * .44, h * .26, 'rgba(10,30,47,.9)', 'rgba(93,235,243,.5)'); this.text(ctx, String(result.position) + 'TH', w * .5, h * .42, 34, result.position === 1 ? '#ffcf67' : '#f4fbff', 'center', 900); this.text(ctx, result.medal + '  /  ' + result.points + ' PTS', w * .5, h * .52, 14, '#65e7ee', 'center', 800); this.text(ctx, result.time.toFixed(2) + ' SEC', w * .5, h * .58, 13, '#bed1db', 'center', 700); }
    this.panel(ctx, w * .35, h * .72, w * .3, 46, 'rgba(25,65,76,.9)', 'rgba(93,235,243,.7)'); this.text(ctx, this.mode === 'podium' ? 'CONTINUE' : 'NEXT RUN', w * .5, h * .78, 14, '#f4fbff', 'center', 900);
  }
}

const kit = window.GGKit.create({
  slug: 'ionwake', orientation: 'landscape', validateSave: validSave,
  onPause: () => { if (app) app.onKitPause(); }, onResume: () => { if (app) app.onKitResume(); }, onRestart: () => { if (app) app.restart(); },
});
kit.audio.register(AUDIO_ASSETS); kit.registerPWA();

async function boot() {
  kit.loader.show('IONWAKE'); kit.loader.progress(.08);
  const tracks = [];
  for (let i = 0; i < TRACK_FILES.length; i += 1) {
    try { const response = await fetch('tracks/' + TRACK_FILES[i][2]); if (!response.ok) throw new Error('track fetch'); tracks.push(await response.json()); }
    catch (error) { tracks.push(fallbackTrack(i)); }
    kit.loader.progress(.1 + (i + 1) / TRACK_FILES.length * .82);
  }
  app = new IonwakeApp(tracks);
  iwApi.testNoSteer = () => app.runScriptedTest('no-steer');
  iwApi.testSteeredLap = () => app.runScriptedTest('steered');
  iwApi.sampleTrackFrames = (trackIndex = app.trackIndex, count = 256) => app.sampleTrackFrames(trackIndex, count);
  iwApi.sampleAllTrackFrames = (count = 256) => app.sampleAllTrackFrames(count);
  kit.loader.hide(); requestAnimationFrame((time) => app.loop(time));
}
boot();
