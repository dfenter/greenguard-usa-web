/* Ridge Glider / Three.js presentation, fixed-step flight, and GGKit shell. */
import * as THREE from 'three';
import { RIDGES, RidgeWorld } from './world.js';

const TAU = Math.PI * 2;
const STEP = 1 / 60;
const MAX_STEPS = 4;
const THERMAL_CHAIN_GRACE = 24;
const INTRO_LIFT_END = 760;
const canvas = document.getElementById('scene');
const ui = {
  hud: document.getElementById('hud'), hudDistance: document.getElementById('hud-distance'), hudAltitude: document.getElementById('hud-altitude'),
  hudSpeed: document.getElementById('hud-speed'), speedArc: document.getElementById('speed-arc'), coach: document.getElementById('coach'), objective: document.getElementById('objective'),
  toast: document.getElementById('toast'), toastTitle: document.getElementById('toast-title'), toastCopy: document.getElementById('toast-copy'), title: document.getElementById('title-screen'),
  cards: document.getElementById('mode-cards'), report: document.getElementById('report-screen'), reportKicker: document.getElementById('report-kicker'),
  reportTitle: document.getElementById('report-title'), reportCopy: document.getElementById('report-copy'), reportDistance: document.getElementById('report-distance'),
  reportScore: document.getElementById('report-score'), reportMedal: document.getElementById('report-medal'), reportHint: document.getElementById('report-hint'),
  pause: document.getElementById('pause-screen'), pauseButton: document.getElementById('pause-button'), resumeButton: document.getElementById('resume-button'), launchButton: document.getElementById('launch-button'), settingsButton: document.getElementById('settings-button'),
  countdown: document.getElementById('countdown'), countdownValue: document.getElementById('countdown-value')
};

const MODES = [
  { id: 'distance-run', name: 'DISTANCE RUN', desc: 'Pure score attack. Every clean metre counts.', ridge: 0, goal: 4920, medals: [2500, 3800, 5000] },
  { id: 'thermal-chain', name: 'THERMAL CHAIN', desc: 'Catch consecutive columns for a rising bonus.', ridge: 1, goal: 5440, medals: [3, 5, 7] },
  { id: 'lz-precision', name: 'LZ PRECISION', desc: 'Bring it down gently inside the bullseye.', ridge: 2, goal: 3320, medals: [0.45, 0.72, 0.9] },
  { id: 'cross-country-finale', name: 'CROSS-COUNTRY FINALE', desc: 'The long line. Gusts build across every ridge.', ridge: 3, goal: 7900, medals: [5600, 7200, 8100], locked: true }
];
const MODE_BY_ID = Object.fromEntries(MODES.map((mode) => [mode.id, mode]));
const COLORS = { ink: 0xeaf8f3, aqua: 0x8de8d5, gold: 0xffd17b, coral: 0xff9b7e, cloud: 0xe8f2e9 };
const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const debug = window.__rg || { state: {} };
const debugState = debug.state || {};
debug.state = debugState;

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function mix(a, b, t) { return a + (b - a) * t; }
function setTextIfChanged(element, value) { const next = String(value); if (element.textContent !== next) element.textContent = next; }
function safeInt(value, min, max) { return Number.isInteger(value) && value >= min && value <= max; }
function pressed(code) {
  const down = kit.input.keyDown(code);
  const fire = down && !keyLatch[code];
  keyLatch[code] = down;
  return fire;
}
function resetKeyLatch() { for (const key of Object.keys(keyLatch)) keyLatch[key] = false; }

function validSave(value) {
  if (!value || value.version !== 1 || !safeInt(value.runs, 0, 999999)) return false;
  if (!safeInt(value.selectedRidge, 0, RIDGES.length - 1)) return false;
  if (!value.best || typeof value.best !== 'object' || Array.isArray(value.best)) return false;
  if (!value.medals || typeof value.medals !== 'object' || Array.isArray(value.medals)) return false;
  if (Object.keys(value.best).some((key) => !Object.prototype.hasOwnProperty.call(MODE_BY_ID, key) || !safeInt(value.best[key], 0, 9999999))) return false;
  if (Object.keys(value.medals).some((key) => !Object.prototype.hasOwnProperty.call(MODE_BY_ID, key) || !safeInt(value.medals[key], 0, 3))) return false;
  for (const mode of MODES) {
    if (value.best[mode.id] != null && !safeInt(value.best[mode.id], 0, 9999999)) return false;
    if (value.medals[mode.id] != null && !safeInt(value.medals[mode.id], 0, 3)) return false;
  }
  return typeof value.canopy === 'string' && ['reef', 'ice', 'ember', 'moss'].includes(value.canopy);
}

const kit = GGKit.create({
  slug: 'ridge-glider', orientation: 'landscape', validateSave: validSave,
  onPause(reason) { if (reason === 'manual') showPause(true); },
  onResume() { if (flight) showPause(false); resetKeyLatch(); lastFrame = performance.now(); },
  onRestart() { resetKeyLatch(); resetFlight(); }
});
kit.registerPWA();
kit.audio.register({
  menu: 'assets/wind_loop.mp3', wind: 'assets/wind_loop.mp3', canopy: 'assets/canopy_flutter.mp3', collision: 'assets/canopy_flutter.mp3', thermal: 'assets/thermal_chime.mp3', landing: 'assets/landing_thud.mp3'
});

const defaultSave = { version: 1, runs: 0, selectedRidge: 0, canopy: 'reef', best: {}, medals: {} };
let save = kit.save.get(defaultSave);
if (!validSave(save)) save = { ...defaultSave, best: {}, medals: {} };

let renderer;
let scene;
let camera;
let world;
let glider;
let terrainMesh;
let terrainBand;
let landmarkGroup;
let thermalGroup;
let flagGroup;
let lzGroup;
let trafficGroup;
let cloudGroup;
let gustGroup;
let airFxGroup;
let dustFxGroup;
let sparkFxGroup;
let corridorMesh;
let approachCone;
let shadow;
let skyCanvas;
let skyContext;
let skyTexture;
let simClock = 0;
let accumulator = 0;
let lastFrame = 0;
let renderWidth = 1;
let renderHeight = 1;
let modeIndex = 0;
let ridgeIndex = save.selectedRidge;
let mode = null;
let activeSeed = 0;
let flight = null;
let selectedCanopy = save.canopy;
let toastTimer = 0;
let coachTimer = 0;
let coachMessage = '';
let currentScreen = 'title';
let lastHud = { distance: '', altitude: '', speed: '' };
const toastQueue = [];
let pointerActionAt = 0;
let audioEpoch = 0;
let impactKick = 0;
const keyLatch = Object.create(null);

const materials = {};
const pools = { thermal: [], thermalRings: [], birds: [], flags: [], lz: [], traffic: [], clouds: [], gusts: [], airParticles: [], dustParticles: [], sparkParticles: [] };

function material(name, color, opts = {}) {
  if (materials[name]) return materials[name];
  const mat = new THREE.MeshStandardMaterial({ color, roughness: opts.roughness ?? .78, metalness: opts.metalness ?? 0, flatShading: true, transparent: !!opts.transparent, opacity: opts.opacity ?? 1, depthWrite: opts.depthWrite ?? true, side: opts.side ?? THREE.FrontSide });
  materials[name] = mat;
  return mat;
}

function lineMaterial(color, opacity = 1) { return new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: false }); }

function setVisible(object, value) { if (object) object.visible = !!value; }

function clearGroup(group, dispose = false) {
  if (!group) return;
  if (dispose) {
    const cached = new Set(Object.values(materials));
    group.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) {
        const list = Array.isArray(object.material) ? object.material : [object.material];
        for (const mat of list) if (!cached.has(mat)) mat.dispose();
      }
    });
  }
  while (group.children.length) group.remove(group.children[group.children.length - 1]);
}

function makeGlider() {
  const root = new THREE.Group();
  const paint = { reef: 0xeff9f3, ice: 0xcbeaff, ember: 0xffc079, moss: 0xc4edb0 }[selectedCanopy] || 0xeff9f3;
  const accent = { reef: 0x55cbb8, ice: 0x5aa8db, ember: 0xeb7664, moss: 0x73b98c }[selectedCanopy] || 0x55cbb8;
  const wingGeometry = new THREE.BufferGeometry();
  wingGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-0.3,0,0, -3.8,0,-2.15, -1.35,0,0, -0.3,0,0, -1.35,0,0, -3.8,0,2.15], 3));
  wingGeometry.computeVertexNormals();
  const wing = new THREE.Mesh(wingGeometry, material('wing-' + selectedCanopy, paint, { side: THREE.DoubleSide, roughness: .56 }));
  root.add(wing);
  const edgeGeometry = new THREE.BufferGeometry();
  edgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-0.3,.02,0, -3.8,.02,-2.15, -1.35,.02,0, -3.8,.02,2.15, -0.3,.02,0], 3));
  root.add(new THREE.Line(edgeGeometry, lineMaterial(accent, .95)));
  const keel = new THREE.Mesh(new THREE.CylinderGeometry(.12, .16, 2.0, 8), material('keel-' + selectedCanopy, accent));
  keel.rotation.z = Math.PI / 2; keel.position.x = -.15; keel.position.y = -.22; root.add(keel);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(.45, 10, 6), material('canopy-' + selectedCanopy, accent, { roughness: .2, metalness: .12 }));
  canopy.scale.set(1.1, .6, .8); canopy.position.set(.35, -.05, 0); root.add(canopy);
  const pilot = new THREE.Mesh(new THREE.SphereGeometry(.18, 8, 5), material('pilot-' + selectedCanopy, 0x17252b));
  pilot.position.set(.42, -.35, 0); root.add(pilot);
  const stallRibbon = new THREE.Mesh(new THREE.PlaneGeometry(1.2, .16), material('stall-ribbon', COLORS.coral, { transparent: true, opacity: .86, depthWrite: false, side: THREE.DoubleSide }));
  stallRibbon.position.set(-1.5, .42, 0); stallRibbon.rotation.y = Math.PI / 2; stallRibbon.visible = false; root.add(stallRibbon);
  root.scale.setScalar(1.45);
  root.userData.parts = { wing, edge: root.children[1], keel, canopy, pilot, stallRibbon };
  return root;
}

function makeBird() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-.85,0,0,0,.3,0,.85,0,0], 3));
  const line = new THREE.Line(geometry, lineMaterial(0x253b42, .88));
  line.scale.setScalar(.9); return line;
}

function makeTrafficKite() {
  const root = new THREE.Group();
  const wingGeometry = new THREE.BufferGeometry();
  wingGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-1.2, 0, 0, 0, .18, -1.1, 1.2, 0, 0, 0, .18, 1.1, -1.2, 0, 0], 3));
  const wing = new THREE.Line(wingGeometry, lineMaterial(COLORS.coral, .92)); root.add(wing);
  const body = new THREE.Mesh(new THREE.OctahedronGeometry(.22, 0), material('traffic-body', COLORS.coral, { roughness: .5 }));
  body.position.y = -.12; root.add(body);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(.12, 7, 5), material('traffic-beacon', COLORS.gold, { transparent: true, opacity: .8, depthWrite: false }));
  beacon.position.y = .25; root.add(beacon);
  return root;
}

function makeParticlePool(group, count, name, color, size) {
  const geometry = new THREE.OctahedronGeometry(size, 0);
  const mat = material(name, color, { transparent: true, opacity: .78, depthWrite: false });
  const pool = [];
  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(geometry, mat); mesh.visible = false; group.add(mesh);
    pool.push({ mesh, life: 0, maxLife: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 });
  }
  return pool;
}

function spawnParticles(pool, x, y, z, amount, spread, speed, life) {
  let spawned = 0;
  for (const particle of pool) {
    if (particle.mesh.visible) continue;
    const angle = Math.random() * TAU;
    const radial = Math.random() * spread;
    particle.x = x + Math.cos(angle) * radial; particle.y = y + Math.random() * spread; particle.z = z + Math.sin(angle) * radial;
    particle.vx = (Math.random() - .5) * speed; particle.vy = Math.random() * speed; particle.vz = (Math.random() - .5) * speed;
    particle.life = life * (.7 + Math.random() * .3); particle.maxLife = particle.life; particle.mesh.visible = true; spawned++;
    if (spawned >= amount) break;
  }
}

function updateParticles(dt) {
  if (!dt) return;
  for (const pool of [pools.airParticles, pools.dustParticles, pools.sparkParticles]) for (const particle of pool) {
    if (!particle.mesh.visible) continue;
    particle.life -= dt;
    if (particle.life <= 0) { particle.mesh.visible = false; continue; }
    particle.x += particle.vx * dt; particle.y += particle.vy * dt; particle.z += particle.vz * dt; particle.vy -= dt * 4.5;
    particle.mesh.position.set(particle.x, particle.y, particle.z);
    const fade = Math.max(.16, particle.life / particle.maxLife); particle.mesh.scale.setScalar(fade);
  }
}

function updateSkyGradient(colors) {
  if (!skyContext) return;
  const gradient = skyContext.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, colors[0]); gradient.addColorStop(.55, colors[1]); gradient.addColorStop(1, colors[2]);
  skyContext.fillStyle = gradient; skyContext.fillRect(0, 0, 4, 256);
  if (skyTexture) skyTexture.needsUpdate = true;
}

function initScene() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  GGKit.hiDpi.three(renderer);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x6eacc0, 760, 4300);
  camera = new THREE.PerspectiveCamera(54, 1, 12, 7200);
  const skyBake = GGKit.hiDpi.canvas(4, 256); skyCanvas = skyBake.canvas; skyContext = skyBake.ctx;
  skyTexture = new THREE.CanvasTexture(skyCanvas); skyTexture.colorSpace = THREE.SRGBColorSpace; scene.background = skyTexture;
  updateSkyGradient(RIDGES[0].sky);
  scene.add(new THREE.HemisphereLight(0xe6f4ef, 0x132a35, 1.55));
  const sun = new THREE.DirectionalLight(0xffedc5, 2.2); sun.position.set(-300, 800, 500); scene.add(sun);
  terrainBand = new THREE.Group(); scene.add(terrainBand);
  landmarkGroup = new THREE.Group(); scene.add(landmarkGroup);
  thermalGroup = new THREE.Group(); scene.add(thermalGroup);
  flagGroup = new THREE.Group(); scene.add(flagGroup);
  lzGroup = new THREE.Group(); scene.add(lzGroup);
  trafficGroup = new THREE.Group(); scene.add(trafficGroup);
  cloudGroup = new THREE.Group(); scene.add(cloudGroup);
  gustGroup = new THREE.Group(); scene.add(gustGroup);
  airFxGroup = new THREE.Group(); scene.add(airFxGroup);
  dustFxGroup = new THREE.Group(); scene.add(dustFxGroup);
  sparkFxGroup = new THREE.Group(); scene.add(sparkFxGroup);
  corridorMesh = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 6, 1, true), material('corridor', 0xffdf91, { transparent: true, opacity: .09, depthWrite: false, side: THREE.DoubleSide }));
  scene.add(corridorMesh);
  approachCone = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 6, 1, true), material('approach', COLORS.aqua, { transparent: true, opacity: .14, depthWrite: false, side: THREE.DoubleSide }));
  scene.add(approachCone);
  shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 24), material('blob-shadow', 0x07181e, { transparent: true, opacity: .3, depthWrite: false, side: THREE.DoubleSide }));
  shadow.rotation.x = -Math.PI / 2; shadow.visible = false; scene.add(shadow);
  for (let i = 0; i < 12; i++) {
    const group = new THREE.Group();
    const column = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.12, 1, 10, 1, true), material('thermal-' + i, 0xffd681, { transparent: true, opacity: .12, depthWrite: false, side: THREE.DoubleSide }));
    group.add(column);
    const rings = [];
    for (let r = 0; r < 3; r++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(1, .035, 5, 16), material('thermal-ring-' + i + '-' + r, 0xfff1b0, { transparent: true, opacity: .45, depthWrite: false })); ring.rotation.x = Math.PI / 2; group.add(ring); rings.push(ring); }
    const birdSet = [];
    for (let b = 0; b < 3; b++) { const bird = makeBird(); group.add(bird); birdSet.push(bird); }
    thermalGroup.add(group); pools.thermal.push({ group, column, rings, birds: birdSet });
  }
  for (let i = 0; i < 20; i++) {
    const group = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, 8, 5), material('flag-pole', 0xffe4a3)); pole.position.y = 4; group.add(pole);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, .06), material('flag-' + i, COLORS.gold, { roughness: .5 })); flag.position.set(1, 7.1, 0); group.add(flag);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(.24, 6, 4), material('flag-glow', COLORS.gold, { transparent: true, opacity: .7, depthWrite: false })); glow.position.set(0, 8, 0); group.add(glow);
    flagGroup.add(group); pools.flags.push({ group, flag, glow });
  }
  for (let i = 0; i < 4; i++) {
    const group = new THREE.Group();
    const strip = new THREE.Mesh(new THREE.BoxGeometry(250, 1.4, 54), material('lz-strip', COLORS.gold, { transparent: true, opacity: .42, depthWrite: false }));
    strip.position.y = 1; group.add(strip);
    const edge = new THREE.LineSegments(new THREE.BufferGeometry(), lineMaterial(COLORS.gold, .9));
    edge.geometry.setAttribute('position', new THREE.Float32BufferAttribute([-125, 4, -28, 125, 4, -28, 125, 4, -28, 125, 4, 28, 125, 4, 28, -125, 4, 28, -125, 4, 28, -125, 4, -28], 3)); group.add(edge);
    lzGroup.add(group); pools.lz.push({ group, strip, edge });
  }
  for (let i = 0; i < 6; i++) { const group = makeTrafficKite(); trafficGroup.add(group); pools.traffic.push({ group, phase: i * .83, hitFlash: 0 }); }
  for (let i = 0; i < 16; i++) {
    const group = new THREE.Group();
    const cloudMat = material('cloud-' + i, COLORS.cloud, { transparent: true, opacity: .48, depthWrite: false });
    for (let p = 0; p < 3; p++) { const puff = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 1), cloudMat); puff.position.set((p - 1) * 28, (p % 2) * 11, (p - 1) * 18); puff.scale.set(1.4 - p * .16, .7 + p * .15, .8); group.add(puff); }
    cloudGroup.add(group); pools.clouds.push({ group, seed: i * 1.71 });
  }
  for (let i = 0; i < 24; i++) {
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0], 3));
    const streak = new THREE.Line(geometry, lineMaterial(0xb6f3dc, .26)); gustGroup.add(streak); pools.gusts.push({ streak, phase: i * 0.71 });
  }
  pools.airParticles = makeParticlePool(airFxGroup, 28, 'air-particles', 0x9beedb, .9);
  pools.dustParticles = makeParticlePool(dustFxGroup, 32, 'dust-particles', 0xd89b6c, 1.1);
  pools.sparkParticles = makeParticlePool(sparkFxGroup, 22, 'spark-particles', COLORS.gold, .72);
  glider = makeGlider(); scene.add(glider);
  resize();
}

function buildTerrain() {
  clearGroup(terrainBand, true);
  const ridge = world.ridge;
  const cols = 92, rows = 12, width = 1120;
  const positions = [], colors = [], indices = [];
  const colorNear = new THREE.Color(ridge.terrain[0]); const colorFar = new THREE.Color(ridge.terrain[1]);
  for (let zIndex = 0; zIndex <= rows; zIndex++) {
    const z = -width / 2 + width * zIndex / rows;
    for (let xIndex = 0; xIndex <= cols; xIndex++) {
      const x = ridge.length * xIndex / cols;
      const y = world.lateralTerrain(x, z);
      positions.push(x, y, z);
      const side = Math.abs(z) / (width / 2); const c = colorNear.clone().lerp(colorFar, side * .72); colors.push(c.r, c.g, c.b);
    }
  }
  const stride = cols + 1;
  for (let zIndex = 0; zIndex < rows; zIndex++) for (let xIndex = 0; xIndex < cols; xIndex++) {
    const a = zIndex * stride + xIndex, b = a + 1, c = a + stride, d = c + 1;
    indices.push(a, c, b, b, c, d);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
  terrainMesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .93, metalness: 0, flatShading: true, side: THREE.DoubleSide }));
  terrainBand.add(terrainMesh);
  const bandPositions = [];
  for (let i = 0; i < cols; i++) {
    const x = ridge.length * i / cols; const next = ridge.length * (i + 1) / cols;
    if (world.slope(x) <= .075) continue;
    const y = world.terrain(x) + 32 + Math.min(110, Math.max(0, world.slope(x)) * 160);
    bandPositions.push(x, y, -330, next, world.terrain(next) + 32, -330, x, y + 8, -330, next, world.terrain(next) + 40, -330);
  }
  const bandGeometry = new THREE.BufferGeometry(); bandGeometry.setAttribute('position', new THREE.Float32BufferAttribute(bandPositions, 3));
  terrainBand.add(new THREE.LineSegments(bandGeometry, lineMaterial(0xa4e9e0, .26)));
  buildLandmark();
  buildCorridor();
  buildLzCone();
}

function buildLandmark() {
  clearGroup(landmarkGroup, true);
  const landmark = world.ridge.landmark; const group = new THREE.Group(); const y = world.terrain(landmark.x);
  const stone = material('landmark-stone-' + world.ridge.id, new THREE.Color(world.ridge.terrain[0]).offsetHSL(0, -.1, .12).getHex());
  if (landmark.kind === 'arch') {
    for (const z of [-52, 52]) { const pillar = new THREE.Mesh(new THREE.CylinderGeometry(24, 32, 210, 6), stone); pillar.position.set(landmark.x, y + 105, z); group.add(pillar); }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(54, 55, 160), stone); lintel.position.set(landmark.x, y + 210, 0); group.add(lintel);
  } else if (landmark.kind === 'glacier') {
    const ice = material('glacier-ice', 0xd8f3ff, { roughness: .42 });
    for (let i = 0; i < 7; i++) { const spire = new THREE.Mesh(new THREE.ConeGeometry(28 + (i % 3) * 8, 190 + (i % 4) * 34, 5), ice); spire.position.set(landmark.x + (i - 3) * 42, y + 95, (i % 2 ? 35 : -25) + (i - 3) * 6); group.add(spire); }
  } else if (landmark.kind === 'mesa') {
    for (const x of [-75, 75]) { const mesa = new THREE.Mesh(new THREE.CylinderGeometry(65, 105, 260, 6), stone); mesa.position.set(landmark.x + x, y + 130, (x > 0 ? 90 : -100)); group.add(mesa); }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(210, 28, 45), stone); bridge.position.set(landmark.x, y + 225, 0); group.add(bridge);
  } else {
    const cliff = new THREE.Mesh(new THREE.CylinderGeometry(125, 150, 260, 6), stone); cliff.position.set(landmark.x, y + 130, -120); group.add(cliff);
    const waterMat = material('waterfall', 0x7de2eb, { transparent: true, opacity: .74, roughness: .2 });
    for (let i = 0; i < 5; i++) { const stream = new THREE.Mesh(new THREE.BoxGeometry(10 + (i % 2) * 5, 180, 8), waterMat); stream.position.set(landmark.x - 75 + i * 36, y + 36, -112); group.add(stream); }
  }
  landmarkGroup.add(group);
}

function buildCorridor() {
  const corridor = world.ridge.shortcut; const mid = (corridor.start + corridor.end) / 2;
  corridorMesh.position.set(mid, world.terrain(mid) + corridor.floor + 110, 0); corridorMesh.scale.set(72, corridor.end - corridor.start, 72); corridorMesh.rotation.z = Math.PI / 2; corridorMesh.visible = true;
}

function buildLzCone() {
  if (!mode || !world) return;
  const target = mode.id === 'lz-precision' ? world.ridge.lzs[1] : world.nextLz(0);
  approachCone.position.set(target - 180, world.terrain(target) + 92, 0); approachCone.scale.set(52, 260, 52); approachCone.rotation.z = Math.PI / 2; approachCone.visible = mode.id === 'lz-precision';
}

function buildModeCards() {
  ui.cards.innerHTML = '';
  for (let i = 0; i < MODES.length; i++) {
    const entry = MODES[i]; const card = document.createElement('button'); card.type = 'button'; card.className = 'mode-card'; card.dataset.mode = entry.id; card.setAttribute('aria-label', entry.name);
    card.innerHTML = '<b></b><span></span><i></i>'; card.children[0].textContent = entry.name; card.children[1].textContent = entry.desc;
    card.children[2].textContent = entry.locked && !unlocked(entry) ? 'LOCKED' : 'MEDALS ' + (save.medals[entry.id] || 0) + '/3'; ui.cards.appendChild(card);
  }
  updateMenuCards();
}

function updateMenuCards() {
  [...ui.cards.children].forEach((card, index) => { card.classList.toggle('active', index === modeIndex); card.classList.toggle('locked', MODES[index].locked && !unlocked(MODES[index])); });
}

function unlocked(entry) {
  if (!entry.locked) return true;
  return (save.medals['distance-run'] || 0) >= 1 && (save.medals['thermal-chain'] || 0) >= 1 && (save.medals['lz-precision'] || 0) >= 1;
}

function saveProgress() { kit.save.set(save); }

function startMusic(name, fadeMs) {
  const token = ++audioEpoch;
  kit.audio.preload([name]).then(() => {
    const valid = token === audioEpoch && ((name === 'menu' && !mode) || (name === 'wind' && mode && flight));
    if (valid) kit.audio.music(name, fadeMs);
  });
}

function stopMusic() { audioEpoch++; kit.audio.stopMusic(180); }

function setScreen(screen) {
  currentScreen = screen;
  ui.title.classList.toggle('hidden', screen !== 'title'); ui.report.classList.toggle('hidden', screen !== 'report'); ui.pause.classList.toggle('hidden', screen !== 'pause');
  ui.hud.hidden = screen !== 'flight'; ui.pauseButton.hidden = screen !== 'flight';
  if (screen !== 'flight') ui.countdown.classList.remove('show');
  if (screen !== 'flight') { ui.coach.classList.remove('show'); ui.hud.classList.remove('stall'); }
  if (screen === 'pause') ui.toast.classList.remove('show');
}

function showPause(value) { if (value) setScreen('pause'); else if (flight) setScreen('flight'); }

function setCoach(text, seconds = 5) {
  const next = String(text); const changed = coachMessage !== next;
  if (!changed) { if (coachTimer > 0 || ui.coach.classList.contains('show')) coachTimer = Math.max(coachTimer, seconds); return; }
  coachMessage = next; setTextIfChanged(ui.coach, next); coachTimer = seconds; ui.coach.classList.remove('show'); void ui.coach.offsetWidth;
  if (currentScreen === 'flight' && toastTimer <= 0) ui.coach.classList.add('show');
}

function clearToasts() {
  toastTimer = 0; toastQueue.length = 0; ui.toast.classList.remove('show');
}

function showToast(entry) {
  setTextIfChanged(ui.toastTitle, entry.title); setTextIfChanged(ui.toastCopy, entry.copy); ui.toastTitle.style.color = entry.color;
  ui.toast.classList.remove('show'); void ui.toast.offsetWidth; ui.toast.classList.add('show'); ui.coach.classList.remove('show'); toastTimer = 1;
}

function toast(title, copy, color = '#8de8d5') {
  const entry = { title: String(title), copy: String(copy || ''), color };
  if (toastTimer > 0) { if (toastQueue.length >= 5) toastQueue.shift(); toastQueue.push(entry); return; }
  showToast(entry);
}

function updateTransients(dt) {
  if (kit.paused) return;
  if (toastTimer > 0) {
    toastTimer -= dt;
    if (toastTimer <= 0) {
      ui.toast.classList.remove('show');
      if (toastQueue.length) showToast(toastQueue.shift());
    }
  }
  if (coachTimer > 0) coachTimer -= dt;
  ui.coach.classList.toggle('show', currentScreen === 'flight' && coachTimer > 0 && toastTimer <= 0);
}

function currentForce(name) { return debug[name] === true || debugState[name] === true; }

function syncDebug() {
  debugState.mode = mode ? mode.id : 'menu'; debugState.distance = flight ? flight.x : 0; debugState.altitude = flight && world ? Math.max(0, flight.y - world.terrain(flight.x)) : 0;
  debugState.ridge = world ? world.ridge.id : RIDGES[ridgeIndex].id; debugState.seed = activeSeed; debugState.forceRidge = currentForce('forceRidge'); debugState.forceThermal = currentForce('forceThermal');
  debug.forceRidge = debugState.forceRidge; debug.forceThermal = debugState.forceThermal;
}

function resetFlight() {
  if (!mode) return;
  activeSeed = ((Date.now() ^ (modeIndex * 0x9e3779b9) ^ (ridgeIndex * 0x45d9f3b)) >>> 0) || 1;
  world = new RidgeWorld(ridgeIndex, activeSeed); world.forceRidge = currentForce('forceRidge'); world.forceThermal = currentForce('forceThermal');
  updateSkyGradient(world.ridge.sky); scene.fog.color.set(world.ridge.sky[1]); scene.fog.near = 680 + (ridgeIndex % 3) * 90; scene.fog.far = 3900 + (ridgeIndex % 2) * 700;
  const startY = world.terrain(0) + 370;
  const routeGoal = mode.id === 'cross-country-finale' ? world.ridge.lzs[world.ridge.lzs.length - 1] : mode.goal;
  flight = { x: 0, y: startY, speed: 18, gamma: -.04, alpha: .035, input: 0, targetInput: 0, roll: 0, vy: 0, wind: world.windAt(0), air: -0.72, stall: 0, stallWarned: false, score: 0, thermalChain: 0, thermalCaught: 0, currentThermal: -1, outThermal: 0, shortcut: false, nextMilestone: 1000, t: 0, goal: routeGoal, targetLzX: world.ridge.lzs[1], approachAnnounced: false, lastGround: null, touchdown: false, finished: false, launchTimer: 2.99, countdownStep: 4, launching: true, inputState: 'trim', trafficHits: 0 };
  buildTerrain(); buildLzCone();
  glider.position.set(0, startY, 0); glider.rotation.set(0, 0, 0);
  clearToasts(); coachTimer = 0; coachMessage = ''; setTextIfChanged(ui.coach, ''); setScreen('flight'); startMusic('wind', 250); kit.audio.sfx('canopy', { volume: .3 });
  syncDebug();
}

function beginMode() {
  mode = MODES[modeIndex] || MODES[0];
  if (!unlocked(mode)) { modeIndex = 0; mode = MODES[0]; toast('FLIGHT LOCKED', 'Earn 1 medal per route', '#ff9b7e'); return; }
  ridgeIndex = mode.id === 'cross-country-finale' ? (ridgeIndex + 1) % RIDGES.length : mode.ridge;
  save.selectedRidge = ridgeIndex; save.canopy = selectedCanopy; saveProgress(); kit.restart();
}

function selectMode(index) { modeIndex = (index + MODES.length) % MODES.length; if (!unlocked(MODES[modeIndex])) modeIndex = 0; kit.audio.sfx('thermal', { volume: .16, rate: 1.55 }); updateMenuCards(); }
function cycleRidge(delta) { ridgeIndex = (ridgeIndex + delta + RIDGES.length) % RIDGES.length; save.selectedRidge = ridgeIndex; saveProgress(); }
function cycleCanopy() { if (mode || flight) return; const list = ['reef', 'ice', 'ember', 'moss']; selectedCanopy = list[(list.indexOf(selectedCanopy) + 1) % list.length]; save.canopy = selectedCanopy; saveProgress(); scene.remove(glider); glider = makeGlider(); scene.add(glider); }

function gamepadTarget() {
  if (!navigator.getGamepads) return null;
  const pads = navigator.getGamepads();
  for (const pad of pads) {
    if (!pad || !pad.connected) continue;
    if (pad.buttons[12]?.pressed) return .86;
    if (pad.buttons[13]?.pressed) return -1;
    const axis = Number(pad.axes[1]);
    if (!Number.isFinite(axis) || Math.abs(axis) < .14) continue;
    return clamp(-axis, -1, 1);
  }
  return null;
}

function readFlightInput() {
  let pointer = null;
  for (const p of kit.input.pointers.values()) { if (!p.zone || p.zone === 'flight') { pointer = p; break; } }
  let target = 0;
  if (pointer) { if (!pointer.zone) pointer.zone = 'flight'; target = clamp((pointer.startY - pointer.y) / 105, -1, 1); }
  if (kit.input.keyDown('ArrowUp') || kit.input.keyDown('KeyW')) target = .86;
  if (kit.input.keyDown('ArrowDown') || kit.input.keyDown('KeyS')) target = -1;
  const padTarget = gamepadTarget(); if (padTarget != null) target = padTarget;
  if (!pointer && padTarget == null && !kit.input.keyDown('ArrowUp') && !kit.input.keyDown('KeyW') && !kit.input.keyDown('ArrowDown') && !kit.input.keyDown('KeyS')) target = flight.targetInput * Math.max(0, 1 - STEP * 2.4);
  flight.targetInput = target; flight.input += (target - flight.input) * Math.min(1, STEP * 7);
}

function stepFlight() {
  if (!flight || !world || flight.finished) return;
  world.forceRidge = currentForce('forceRidge'); world.forceThermal = currentForce('forceThermal');
  flight.t += STEP; readFlightInput();
  if (flight.x > INTRO_LIFT_END) world.introLift = false;
  const input = flight.input; const flare = Math.max(0, input); const dive = Math.max(0, -input);
  const targetAlpha = .035 + flare * .13 - dive * .075; flight.alpha += (targetAlpha - flight.alpha) * Math.min(1, STEP * 4.8);
  const stall = flight.speed < 11.2 || flight.alpha > .151;
  const liftInfo = world.lift(flight.x, flight.y); flight.air = liftInfo.total;
  const drag = .020 + .048 * Math.abs(flight.alpha) + (stall ? .19 : 0) + dive * .006;
  const lift = clamp(.64 + flight.alpha * 4.8 - (stall ? (flight.alpha - .151) * 3.8 : 0), .05, 1.48) * flight.speed * flight.speed * .011;
  const gravityPitch = -Math.sin(flight.gamma) * 1.25;
  flight.speed += (gravityPitch - drag * flight.speed * .18 + dive * 2.4 - flare * 1.2) * STEP;
  flight.speed = clamp(flight.speed, 7.2, 37);
  flight.stall = clamp(Math.max(0, (12.4 - flight.speed) / 3.2) + Math.max(0, (flight.alpha - .135) * 15), 0, 1);
  if (flight.stall > .52 && !flight.stallWarned) { flight.stallWarned = true; kit.audio.sfx('canopy', { volume: .42, rate: 1.55 }); }
  if (flight.stall < .22) flight.stallWarned = false;
  const state = flight.stall > .4 ? 'stall' : input > .2 ? 'flare' : input < -.2 ? 'dive' : 'trim';
  if (state !== flight.inputState) { flight.inputState = state; kit.audio.sfx('canopy', { volume: state === 'stall' ? .42 : .18, rate: state === 'dive' ? 1.25 : .9 }); }
  flight.gamma += ((lift / Math.max(8, flight.speed) - .47) + liftInfo.total * .018 - flare * .075 + dive * .055) * STEP;
  flight.gamma = clamp(flight.gamma, -0.8, .64);
  flight.wind = world.windAt(flight.x);
  const vx = flight.speed * Math.cos(flight.gamma) + flight.wind;
  flight.vy = flight.speed * Math.sin(flight.gamma) + liftInfo.total;
  flight.x += Math.max(4, vx) * STEP; flight.y += flight.vy * STEP;
  flight.roll += (input * .2 - flight.roll) * Math.min(1, STEP * 6);
  if (liftInfo.inThermal && flight.currentThermal !== liftInfo.thermalIndex) { flight.thermalCaught++; flight.thermalChain++; flight.currentThermal = liftInfo.thermalIndex; flight.score += 120 + flight.thermalChain * 55; kit.audio.sfx('thermal', { volume: .46 }); toast('THERMAL ×' + flight.thermalChain, 'LIFT CORE', '#ffd17b'); }
  if (!liftInfo.inThermal) { flight.currentThermal = -1; flight.outThermal += STEP; if (flight.outThermal > THERMAL_CHAIN_GRACE) flight.thermalChain = 0; } else flight.outThermal = 0;
  if (world.inShortcut(flight.x, flight.y) && !flight.shortcut) { flight.shortcut = true; flight.score += world.ridge.shortcut.bonus; toast('SHORTCUT +' + world.ridge.shortcut.bonus, 'LINE FOUND', '#8de8d5'); }
  for (const flag of world.flags) if (!flag.collected && Math.abs(flag.x - flight.x) < 18 && flight.y - world.terrain(flight.x) > 30) { flag.collected = true; flight.score += 100; kit.audio.sfx('thermal', { volume: .32, rate: 1.25 }); }
  if (flight.x >= flight.nextMilestone) { flight.score += 50; flight.nextMilestone += 1000; }
  checkTraffic();
  updateOnboarding();
  if (dive > .22 || flight.speed > 29) spawnParticles(pools.airParticles, flight.x - 24, flight.y, 0, 1, 5, 22, .42);
  const ground = world.terrain(flight.x);
  if (flight.y <= ground + 8) {
    flight.y = ground + 8; flight.lastGround = world.lzAt(flight.x); flight.touchdown = true;
    const hard = Math.abs(flight.vy) > 5.2 || flight.speed + flight.wind > 28 || flight.alpha > .17;
    spawnParticles(pools.dustParticles, flight.x, ground + 7, 0, hard ? 16 : 10, 20, hard ? 34 : 20, hard ? .85 : .65);
    impactKick = hard ? 12 : 5; kit.juice.hitStop(hard ? 65 : 45); kit.juice.shake(hard ? 7 : 3, hard ? 210 : 130);
    finishFlight(flight.lastGround);
  }
  if (!flight.finished && !flight.approachAnnounced && flight.x >= flight.goal - 720) { flight.approachAnnounced = true; setCoach('FINAL APPROACH: trim, keep speed, land in gold flags.', 4.5); }
  if (!flight.finished && flight.x >= flight.goal + 420) finishFlight(null);
}

function checkTraffic() {
  if (!world || !flight) return;
  for (let i = 0; i < world.traffic.length; i++) {
    const hazard = world.traffic[i]; const visual = pools.traffic[i];
    const hazardY = world.terrain(hazard.x) + hazard.height + Math.sin(simClock * hazard.speed + hazard.phase) * 28;
    const hazardZ = Math.sin(simClock * hazard.speed * .8 + hazard.phase) * hazard.amplitude;
    if (Math.abs(hazard.x - flight.x) < 34 && Math.abs(hazardY - flight.y) < 78 && Math.abs(hazardZ) < 82 && !hazard.hit) {
      hazard.hit = true; flight.trafficHits++; flight.score = Math.max(0, flight.score - 180); flight.speed = Math.max(8, flight.speed - 4.5); flight.y -= 32; impactKick = 10;
      if (visual) visual.hitFlash = .5;
      spawnParticles(pools.sparkParticles, flight.x, flight.y, 0, 14, 18, 34, .7); kit.audio.sfx('collision', { volume: .82, rate: .75 }); kit.juice.hitStop(60); kit.juice.shake(8, 220); toast('KITE HIT', '−180', '#ff9b7e');
    }
    if (hazard.hit && Math.abs(hazard.x - flight.x) > 120) hazard.hit = false;
  }
}

function updateOnboarding() {
  if (!flight || flight.t > 22 || flight.trafficHits > 0) return;
  if (flight.t < 2.8) {
    setCoach('FLARE: hold ↑ for lift.', 2.8);
  } else if (flight.t < 7.5 && flight.thermalCaught === 0) {
    setCoach('RELEASE to trim; gold shimmer means lift.', 4.6);
  } else if (flight.thermalCaught > 0) {
    setCoach('DIVE ↓ for speed; flare ↑ before the gold LZ.', 4.5);
  }
}

function medalFor(result) {
  const thresholds = mode.medals;
  if (mode.id === 'lz-precision') {
    if (!result.landed || !result.gentle) return 0;
    if (result.precision >= thresholds[2]) return 3; if (result.precision >= thresholds[1]) return 2; if (result.precision >= thresholds[0]) return 1; return 0;
  }
  const value = mode.id === 'thermal-chain' ? result.chain : result.distance;
  if (value >= thresholds[2]) return 3; if (value >= thresholds[1]) return 2; if (value >= thresholds[0]) return 1; return 0;
}

function finishFlight(lz) {
  if (!flight || flight.finished) return;
  flight.finished = true; stopMusic();
  const speed = flight.speed + flight.wind; const vertical = Math.abs(flight.vy); const slope = Math.abs(world.slope(flight.x));
  if (mode.id === 'lz-precision' && (!lz || Math.abs(lz.x - flight.targetLzX) > 1)) lz = null;
  const inside = !!lz && Math.abs(lz.dx) <= lz.half; const gentle = vertical < 4.8 && speed >= 13 && speed <= 28 && slope < .6 && !((flight.speed < 10.2) || flight.alpha > .17);
  const precision = inside ? clamp(1 - Math.abs(lz.dx) / lz.half, 0, 1) : 0;
  const softBonus = gentle && inside ? Math.round(450 + precision * 850 + Math.max(0, 4.8 - vertical) * 40) : gentle ? 60 : 0;
  const landed = gentle && inside; const distance = Math.round(flight.x); const score = distance + flight.score + softBonus;
  const result = { distance, score, chain: flight.thermalChain, precision, landed, gentle, bonus: softBonus };
  const medal = medalFor(result); const prior = save.best[mode.id] || 0; const isBest = score > prior;
  save.best[mode.id] = Math.max(prior, score); save.medals[mode.id] = Math.max(save.medals[mode.id] || 0, medal); save.runs = Math.min(999999, save.runs + 1); saveProgress();
  const nowUnlocked = unlocked(MODES[3]);
  ui.reportKicker.textContent = mode.name + ' / ' + world.ridge.name; ui.reportTitle.textContent = landed ? 'BULLSEYE TOUCHDOWN' : (gentle ? 'SOFT TOUCHDOWN' : 'RIDGE CONTACT');
  ui.reportCopy.textContent = landed ? 'The approach cone paid off. Your line is in the record book.' : (gentle ? 'A clean recovery, but outside the marked landing zone.' : 'The face won this pass. Read the lift band earlier.');
  ui.reportDistance.textContent = (distance / 1000).toFixed(2) + ' KM'; ui.reportScore.textContent = String(score); ui.reportMedal.textContent = medal ? '★'.repeat(medal) : '-';
  ui.reportHint.textContent = isBest ? 'NEW BEST  /  ENTER to fly again  /  ESC to route board' : (nowUnlocked ? 'FINALE UNLOCKED  /  ENTER to fly again  /  ESC to route board' : 'ENTER to fly again  /  ESC to route board');
  clearToasts(); setScreen('report'); if (landed) { kit.audio.sfx('landing', { volume: .9 }); toast('LZ BONUS', '+' + softBonus, '#8de8d5'); } else { if (flight.touchdown) kit.audio.sfx('collision', { volume: .72, rate: .72 }); if (isBest) toast('NEW BEST', String(score) + ' points', '#ffd17b'); }
  syncDebug(); buildModeCards();
}

function returnToMenu() {
  stopMusic(); clearToasts(); coachTimer = 0; coachMessage = ''; setTextIfChanged(ui.coach, ''); flight = null; mode = null; setScreen('title'); buildModeCards(); syncDebug(); startMusic('menu', 220);
}

function handleMenuPointer() {
  if (performance.now() - pointerActionAt < 240) return;
  for (const p of kit.input.pointers.values()) {
    if (p.zone) continue;
    const launch = ui.launchButton.getBoundingClientRect();
    if (p.x >= launch.left && p.x <= launch.right && p.y >= launch.top && p.y <= launch.bottom) { p.zone = 'menu'; pointerActionAt = performance.now(); beginMode(); return; }
    const cards = [...ui.cards.children];
    for (let index = 0; index < cards.length; index++) {
      const rect = cards[index].getBoundingClientRect();
      if (p.x >= rect.left && p.x <= rect.right && p.y >= rect.top && p.y <= rect.bottom) { p.zone = 'menu'; pointerActionAt = performance.now(); selectMode(index); return; }
    }
  }
}

function handleReportPointer() {
  for (const p of kit.input.pointers.values()) { if (p.zone) continue; p.zone = 'report'; beginMode(); return; }
}

function processKeys() {
  if (pressed('Digit1')) selectMode(0); if (pressed('Digit2')) selectMode(1); if (pressed('Digit3')) selectMode(2); if (pressed('Digit4')) selectMode(3);
  if (pressed('KeyA')) cycleRidge(-1); if (pressed('KeyD')) cycleRidge(1); if (pressed('KeyC')) cycleCanopy();
  if (pressed('Enter') || pressed('Space')) { if (!flight || flight.finished) beginMode(); }
  if (pressed('Escape')) { if (flight && !flight.finished) returnToMenu(); else if (ui.report.classList.contains('hidden') === false) returnToMenu(); }
  if (flight && !flight.finished && pressed('KeyP')) kit.pause('manual');
}

function syncWorldVisuals() {
  if (!world || !flight) return;
  const thermalColor = world.ridge.thermalColor;
  for (let i = 0; i < pools.thermal.length; i++) {
    const visual = pools.thermal[i]; const thermal = world.thermals[i]; if (!thermal) { visual.group.visible = false; continue; }
    visual.group.visible = thermal.x > flight.x - 360 && thermal.x < flight.x + 1250;
    visual.group.position.set(thermal.x, thermal.base, 0); visual.group.scale.set(thermal.width, thermal.top - thermal.base, thermal.width);
    visual.column.material.color.setHex(thermalColor); visual.column.material.opacity = .07 + .035 * (1 + Math.sin(simClock * 2.1 + thermal.phase));
    for (let r = 0; r < visual.rings.length; r++) { const ring = visual.rings[r]; ring.material.color.setHex(thermalColor); ring.position.y = .12 + ((simClock * (.08 + r * .025) + r / 3) % 1); ring.rotation.z = simClock * (.35 + r * .12); }
    for (let b = 0; b < visual.birds.length; b++) { const bird = visual.birds[b]; const angle = simClock * (.7 + b * .08) + thermal.phase + b * TAU / 3; const radius = .62 + b * .05; bird.position.set(Math.cos(angle) * radius, .46 + ((simClock * .035 + b / 3) % .5), Math.sin(angle) * radius); bird.rotation.y = -angle; bird.scale.setScalar(.9 + .16 * Math.sin(simClock * 2 + b)); }
  }
  for (let i = 0; i < pools.flags.length; i++) { const visual = pools.flags[i]; const flag = world.flags[i]; if (!flag) { visual.group.visible = false; continue; } visual.group.visible = !flag.collected && flag.x > flight.x - 300 && flag.x < flight.x + 1250; visual.group.position.set(flag.x, world.terrain(flag.x), 0); visual.flag.rotation.y = Math.sin(simClock * 1.4 + i) * .16; visual.glow.scale.setScalar(1 + .18 * Math.sin(simClock * 3 + i)); }
  for (let i = 0; i < pools.lz.length; i++) { const visual = pools.lz[i]; const lzX = world.ridge.lzs[i]; if (lzX == null) { visual.group.visible = false; continue; } visual.group.visible = lzX > flight.x - 360 && lzX < flight.x + 1150; visual.group.position.set(lzX, world.terrain(lzX), 0); const target = mode && mode.id === 'lz-precision' && Math.abs(lzX - flight.targetLzX) < 1; visual.strip.material.opacity = target ? .72 : .42; visual.edge.material.opacity = target ? 1 : .72; }
  for (let i = 0; i < pools.traffic.length; i++) { const visual = pools.traffic[i]; const hazard = world.traffic[i]; if (!hazard) { visual.group.visible = false; continue; } const hazardY = world.terrain(hazard.x) + hazard.height + Math.sin(simClock * hazard.speed + hazard.phase) * 28; const hazardZ = Math.sin(simClock * hazard.speed * .8 + hazard.phase) * hazard.amplitude; visual.group.visible = hazard.x > flight.x - 360 && hazard.x < flight.x + 1350; visual.group.position.set(hazard.x, hazardY, hazardZ); visual.group.rotation.y = Math.sin(simClock * hazard.speed + hazard.phase) * .16; visual.group.rotation.z = Math.cos(simClock * hazard.speed + hazard.phase) * .12; visual.hitFlash = Math.max(0, visual.hitFlash - .016); visual.group.scale.setScalar(visual.hitFlash > 0 ? 1.25 : 1); }
  for (let i = 0; i < pools.clouds.length; i++) { const cloud = pools.clouds[i]; const x = ((i * 560 + cloud.seed * 170 - flight.x * .24) % (world.ridge.length + 1300) + world.ridge.length + 1300) % (world.ridge.length + 1300) - 450; cloud.group.position.set(flight.x + x, 520 + (i % 4) * 86, -280 - (i % 5) * 130); cloud.group.rotation.y = Math.sin(simClock * .04 + i) * .08; cloud.group.visible = true; }
  const gustEnergy = clamp(Math.abs(world.windAt(flight.x) - world.ridge.wind) * 3.8 + .45, .35, 2.2);
  for (let i = 0; i < pools.gusts.length; i++) { const gust = pools.gusts[i]; const drift = ((i * 123 - simClock * (32 + gustEnergy * 24)) % 1450 + 1450) % 1450 - 420; gust.streak.position.set(flight.x + drift, flight.y + 35 + Math.sin(simClock * .8 + gust.phase) * 75 + (i % 4) * 90, (i % 6 - 3) * 95); gust.streak.scale.set(55 + gustEnergy * 20, 1, 1); gust.streak.material.opacity = .1 + gustEnergy * .13; gust.streak.visible = true; }
  const ground = world.terrain(flight.x); shadow.visible = true; shadow.position.set(flight.x, ground + 5, 0); const shadowSize = clamp(1.25 - (flight.y - ground) / 850, .28, 1.05); shadow.scale.set(32 * shadowSize, 15 * shadowSize, 1); shadow.material.opacity = .12 + shadowSize * .2;
  corridorMesh.visible = flight.x < world.ridge.shortcut.end + 450 && flight.x > world.ridge.shortcut.start - 450;
  if (mode) { const target = mode.id === 'lz-precision' ? world.ridge.lzs[1] : flight.goal; approachCone.position.set(target - 180, world.terrain(target) + 92, 0); approachCone.visible = target > flight.x - 90 && target < flight.x + 900; }
}

function updateCamera() {
  if (!flight) return;
  const speedRatio = clamp((flight.speed - 12) / 20, 0, 1); const target = new THREE.Vector3(flight.x + 150 + speedRatio * 90, flight.y + 8 + flight.gamma * 60, 0);
  const desired = new THREE.Vector3(flight.x - 250 - speedRatio * 40, flight.y + 105 + speedRatio * 28 - impactKick, 250 - speedRatio * 65);
  camera.position.lerp(desired, reducedMotion ? .22 : .09); camera.lookAt(target); camera.fov = 52 + speedRatio * 5; camera.updateProjectionMatrix();
  glider.position.set(flight.x, flight.y, 0); glider.rotation.z = -flight.gamma - flight.input * .12; glider.rotation.x = flight.roll * .32;
  const parts = glider.userData.parts; const flare = Math.max(0, flight.input); const dive = Math.max(0, -flight.input); parts.wing.rotation.x = flare * .16 - dive * .1; parts.canopy.scale.y = .6 + flare * .12; parts.canopy.scale.z = .8 + dive * .12; parts.keel.rotation.y = dive * .18; parts.pilot.position.y = -.35 + flare * .05; parts.stallRibbon.visible = flight.stall > .4; parts.stallRibbon.rotation.z = Math.sin(simClock * 12) * .08; impactKick *= reducedMotion ? .78 : .9;
}

function render(dt, juice) { updateParticles(kit.paused ? 0 : dt); syncWorldVisuals(); updateCamera(); const dx = reducedMotion ? 0 : juice.dx; const dy = reducedMotion ? 0 : juice.dy; camera.position.x += dx * .16; camera.position.y += dy * .16; renderer.render(scene, camera); }

function updateHud() {
  if (!flight || !world || !mode) return;
  const altitude = Math.max(0, flight.y - world.terrain(flight.x)); const distance = (flight.x / 1000).toFixed(2); const speed = Math.round((flight.speed + flight.wind) * 3.6);
  if (lastHud.distance !== distance) { lastHud.distance = distance; setTextIfChanged(ui.hudDistance, distance); }
  if (lastHud.altitude !== String(Math.round(altitude))) { lastHud.altitude = String(Math.round(altitude)); setTextIfChanged(ui.hudAltitude, lastHud.altitude); }
  if (lastHud.speed !== String(speed)) { lastHud.speed = String(speed); setTextIfChanged(ui.hudSpeed, lastHud.speed); }
  ui.hud.classList.toggle('stall', flight.stall > .4);
  if (ui.speedArc) ui.speedArc.style.strokeDashoffset = String(142 - clamp((speed - 25) / 115, 0, 1) * 142);
  if (ui.objective) { const target = (flight.targetLzX / 1000).toFixed(2); setTextIfChanged(ui.objective, 'LZ ' + target); ui.objective.setAttribute('aria-label', 'Landing zone target ' + target + ' kilometres'); }
}

function resize() { renderWidth = Math.max(1, window.innerWidth); renderHeight = Math.max(1, window.innerHeight); renderer.setSize(renderWidth, renderHeight, false); camera.aspect = renderWidth / renderHeight; camera.updateProjectionMatrix(); }

function frame(now) {
  requestAnimationFrame(frame); if (!lastFrame) lastFrame = now; const raw = Math.min(.12, Math.max(0, (now - lastFrame) / 1000)); lastFrame = now;
  processKeys();
  const juice = kit.juice.frame();
  if (mode && flight && !flight.finished && !kit.paused && !juice.frozen) {
    if (flight.launching) {
      flight.launchTimer -= raw; const count = Math.ceil(Math.max(0, flight.launchTimer));
      if (flight.launchTimer > 0) { if (count !== flight.countdownStep) { flight.countdownStep = count; kit.audio.sfx('thermal', { volume: .22, rate: 1.2 + count * .08 }); } ui.countdownValue.textContent = String(Math.max(1, count)); ui.countdown.classList.add('show'); }
      else { flight.launching = false; ui.countdown.classList.remove('show'); setCoach('READ THE FACE: flare in gold lift; dive through sink.', 5); }
    } else {
      accumulator += raw; let steps = 0; while (accumulator >= STEP && steps < MAX_STEPS) { stepFlight(); accumulator -= STEP; simClock += STEP; steps++; }
      if (steps === MAX_STEPS) accumulator = Math.min(accumulator, STEP * 2);
    }
    updateHud();
  } else if (!mode) { handleMenuPointer(); }
  else if (flight && flight.finished) handleReportPointer();
  updateTransients(raw);
  syncDebug(); render(raw, juice);
}

function seedKitPointer(event) {
  if (kit.input.pointers.has(event.pointerId)) return;
  kit.input.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, downAt: performance.now(), zone: 'ui' });
}

ui.pauseButton.addEventListener('pointerdown', seedKitPointer, { passive: true });
ui.resumeButton.addEventListener('pointerdown', seedKitPointer, { passive: true });
ui.pauseButton.addEventListener('click', () => kit.pause('manual'));
ui.resumeButton.addEventListener('click', () => kit.resume('manual'));
ui.settingsButton.addEventListener('click', () => kit.openSettings());
window.addEventListener('resize', resize);

kit.loader.show('RIDGE GLIDER'); kit.loader.progress(.2);
initScene(); kit.loader.progress(.65); buildModeCards(); setScreen('title'); syncDebug(); kit.loader.progress(1); kit.loader.hide(); startMusic('menu', 220);
requestAnimationFrame(frame);
