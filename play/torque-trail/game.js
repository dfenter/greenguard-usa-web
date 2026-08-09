// Torque Trail: a stylized Three.js off-road delivery adventure.
//
// The archived canvas prototype is the design document. Its tuned handling
// values, tire profiles, mud bogging, winch pull, recovery, job board, and
// save-between-jobs loop are kept here while the view becomes a real 3D map.
import * as THREE from 'three';
import { OBJLoader } from '/play/_shared/three/OBJLoader.js';

'use strict';

const sceneCanvas = document.getElementById('scene');
const hudCanvas = document.getElementById('hud');
const renderer = new THREE.WebGLRenderer({
  canvas: sceneCanvas,
  antialias: false,
  alpha: false,
  powerPreference: 'high-performance',
  stencil: false,
  depth: true,
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = false;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x7fa69e, 118, 355);
const camera = new THREE.PerspectiveCamera(58, 1, .5, 480);
const world = new THREE.Group();
scene.add(world);

const sun = new THREE.DirectionalLight(0xfff0c4, 1.35);
sun.position.set(-90, 140, 80);
scene.add(sun);
const hemi = new THREE.HemisphereLight(0xb8e6d1, 0x463b35, 1.05);
scene.add(hemi);

const ui = {
  title: document.getElementById('titleScreen'),
  drive: document.getElementById('driveHud'),
  start: document.getElementById('startButton'),
  titleSettings: document.getElementById('titleSettingsButton'),
  cash: document.getElementById('cashRead'),
  jobs: document.getElementById('jobsRead'),
  tire: document.getElementById('tireRead'),
  lock: document.getElementById('lockRead'),
  zone: document.getElementById('zoneRead'),
  cargo: document.getElementById('cargoRead'),
  garage: document.getElementById('garageButton'),
  settings: document.getElementById('settingsButton'),
  pause: document.getElementById('pauseButton'),
  throttle: document.getElementById('throttleControl'),
  throttleTrack: document.getElementById('throttleTrack'),
  throttleKnob: document.getElementById('throttleKnob'),
  steer: document.getElementById('steerControl'),
  steerTrack: document.getElementById('steerTrack'),
  steerKnob: document.getElementById('steerKnob'),
  winch: document.getElementById('winchButton'),
  recover: document.getElementById('recoverButton'),
  state: document.getElementById('stateRead'),
  tutorial: document.getElementById('tutorialCard'),
  tutorialStep: document.getElementById('tutorialStep'),
  tutorialText: document.getElementById('tutorialText'),
  message: document.getElementById('message'),
  jobPanel: document.getElementById('jobPanel'),
  jobTitle: document.getElementById('jobPanelTitle'),
  jobCopy: document.getElementById('jobPanelCopy'),
  jobList: document.getElementById('jobList'),
  jobGarage: document.getElementById('jobGarageButton'),
  garagePanel: document.getElementById('garagePanel'),
  diff: document.getElementById('diffLockChoice'),
  upgrade: document.getElementById('upgradeButton'),
  pausePanel: document.getElementById('pausePanel'),
  resume: document.getElementById('resumeButton'),
  pauseRestart: document.getElementById('pauseRestartButton'),
  pauseSettings: document.getElementById('pauseSettingsButton'),
  quit: document.getElementById('quitButton'),
  titleCash: document.getElementById('titleCash'),
  titleJobs: document.getElementById('titleJobs'),
  titleUpgrade: document.getElementById('titleUpgrade'),
  titleBest: document.getElementById('titleBest'),
  speed: document.getElementById('speedRead'),
  torque: document.getElementById('torqueRead'),
  speedArc: document.getElementById('speedArc'),
  torqueArc: document.getElementById('torqueArc'),
  payout: document.getElementById('payoutRead'),
  settingsPanel: document.getElementById('settingsPanel'),
  musicVolume: document.getElementById('musicVolume'),
  sfxVolume: document.getElementById('sfxVolume'),
  shakeToggle: document.getElementById('shakeToggle'),
  reducedToggle: document.getElementById('reducedToggle'),
  loading: document.getElementById('loadingScreen'),
  loadingStage: document.getElementById('loadingStage'),
  loadingBar: document.getElementById('loadingBar'),
};

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const money = (v) => '$' + Math.max(0, Math.round(v));
const TAU = Math.PI * 2;
const WORLD_HALF = 160;
const SAVE_VERSION = 5;
const DEAD_Y = -1000;

const LIVERIES = {
  sunset: { name: 'Sunset', color: 0xd48d3f, accent: 0xf2cf6a },
  pine: { name: 'Pine', color: 0x3d9a78, accent: 0xa5e1b4 },
  ridge: { name: 'Ridge', color: 0x4f8fbd, accent: 0xc2e4ef },
};

// These multipliers carry over from the prototype exactly. Diff-lock adds a
// small, honest low-speed bias instead of turning every surface into mud.
const TIRES = {
  road: { label: 'ROAD', road: 1.2, mud: .68, rock: .75 },
  mud: { label: 'MUD', road: .8, mud: 1.35, rock: .9 },
  rock: { label: 'ROCK', road: .88, mud: .78, rock: 1.3 },
};

const SETTLEMENTS = [
  { name: 'Bramblehook', sign: 'B', x: -126, z: 102, color: 0xf0c65b, zone: 'road' },
  { name: 'Mirelight', sign: 'M', x: -56, z: 18, color: 0x8fd3a2, zone: 'mud' },
  { name: 'Silt Run', sign: 'S', x: 20, z: 76, color: 0x5ac0bf, zone: 'mud' },
  { name: 'Stonecross', sign: 'S', x: 103, z: 34, color: 0xd58a62, zone: 'rock' },
  { name: 'Quarry Gate', sign: 'Q', x: 116, z: -73, color: 0xc7b4a0, zone: 'rock' },
  { name: 'Lantern House', sign: 'L', x: -28, z: -102, color: 0xe8af67, zone: 'road' },
];
SETTLEMENTS.forEach((settlement, index) => { settlement.index = index; });

// One hand-authored route spine plus branches. Jobs sit on this path so the
// free-roam map still has a readable navigation rhythm in portrait view.
const ROAD_PATHS = [
  [[-126, 102], [-105, 85], [-80, 54], [-56, 18], [-28, 22], [20, 76], [52, 68], [103, 34], [112, -10], [116, -73], [78, -96], [28, -104], [-28, -102], [-70, -82], [-80, -25], [-56, 18]],
  [[-126, 102], [-92, 116], [-45, 122], [5, 112], [53, 96], [103, 34]],
  [[-56, 18], [-34, -8], [-27, -46], [-28, -102]],
  [[103, 34], [78, 6], [44, -12], [16, -2], [-12, 28]],
];

const JOBS = [
  { id: 'mire-seals', from: 0, to: 1, cargo: 'Pump seals', pay: 140, difficulty: 1, tip: 'Mud bog' },
  { id: 'ridge-lanterns', from: 0, to: 3, cargo: 'Ridge lanterns', pay: 165, difficulty: 2, tip: 'Rock crawl' },
  { id: 'silt-medicine', from: 0, to: 2, cargo: 'Dry-box medicine', pay: 185, difficulty: 2, tip: 'Mud bog' },
  { id: 'survey-cores', from: 1, to: 3, cargo: 'Survey cores', pay: 150, difficulty: 3, tip: 'Mixed ground' },
  { id: 'field-radios', from: 1, to: 0, cargo: 'Field radios', pay: 130, difficulty: 2, tip: 'Packed trail' },
  { id: 'mire-fuel', from: 1, to: 4, cargo: 'Fuel drums', pay: 210, difficulty: 4, tip: 'Mud to stone' },
  { id: 'quarry-bearings', from: 4, to: 0, cargo: 'Forge bearings', pay: 240, difficulty: 5, tip: 'Rock descent' },
  { id: 'quarry-relays', from: 4, to: 2, cargo: 'Relay housings', pay: 225, difficulty: 5, tip: 'Ridge trail' },
  { id: 'stone-samples', from: 3, to: 5, cargo: 'Core samples', pay: 185, difficulty: 3, tip: 'Crest trail' },
  { id: 'lantern-batteries', from: 5, to: 1, cargo: 'Lantern batteries', pay: 205, difficulty: 4, tip: 'Wet switchbacks' },
  { id: 'ridge-mesh', from: 3, to: 4, cargo: 'Bridge mesh', pay: 270, difficulty: 6, tip: 'Loose rock' },
  { id: 'long-haul', from: 2, to: 5, cargo: 'Expedition cases', pay: 295, difficulty: 6, tip: 'All three zones' },
];

const SFX = {
  click: 'assets/sfx/click.mp3',
  confirm: 'assets/sfx/confirm.mp3',
  back: 'assets/sfx/back.mp3',
  open: 'assets/sfx/open.mp3',
  drop: 'assets/sfx/drop.mp3',
  select: 'assets/sfx/select.mp3',
  winch: 'assets/sfx/winch.mp3',
  mud: 'assets/sfx/mud.mp3',
  wood: 'assets/sfx/wood.mp3',
  payout: 'assets/sfx/payout.mp3',
};

function validPosition(p) {
  return p && typeof p.x === 'number' && isFinite(p.x) && p.x >= -WORLD_HALF && p.x <= WORLD_HALF &&
    typeof p.z === 'number' && isFinite(p.z) && p.z >= -WORLD_HALF && p.z <= WORLD_HALF &&
    typeof p.angle === 'number' && isFinite(p.angle) && typeof p.speed === 'number' && isFinite(p.speed);
}

function validateSave(o) {
  if (!o || typeof o !== 'object' || o.v !== SAVE_VERSION) return false;
  if (![o.cash, o.jobs, o.bestCash, o.upgrade].every((n) => typeof n === 'number' && isFinite(n) && n >= 0)) return false;
  if (!Number.isInteger(o.jobs) || !Number.isInteger(o.upgrade) || o.upgrade > 3) return false;
  if (!TIRES[o.tire] || !LIVERIES[o.livery] || !validPosition(o.player)) return false;
  if (!Number.isInteger(o.lastSettlement) || !SETTLEMENTS[o.lastSettlement]) return false;
  if (!o.completed || typeof o.completed !== 'object') return false;
  for (const id of Object.keys(o.completed)) if (!JOBS.some((job) => job.id === id) || typeof o.completed[id] !== 'boolean') return false;
  if (o.currentJob !== null && !JOBS.some((job) => job.id === o.currentJob)) return false;
  if (typeof o.tutorialDone !== 'boolean' || typeof o.diffLock !== 'boolean' || typeof o.reducedMotion !== 'boolean' || typeof o.screenShake !== 'boolean') return false;
  if (!o.recovery || typeof o.recovery !== 'object' || typeof o.recovery.bogged !== 'boolean' ||
      typeof o.recovery.bogTimer !== 'number' || !isFinite(o.recovery.bogTimer) || o.recovery.bogTimer < 0 || o.recovery.bogTimer > 30) return false;
  if (o.recovery.winch !== null && (!o.recovery.winch || typeof o.recovery.winch !== 'object' ||
      typeof o.recovery.winch.x !== 'number' || !isFinite(o.recovery.winch.x) ||
      typeof o.recovery.winch.z !== 'number' || !isFinite(o.recovery.winch.z) ||
      typeof o.recovery.winch.time !== 'number' || !isFinite(o.recovery.winch.time) ||
      o.recovery.winch.x < -WORLD_HALF || o.recovery.winch.x > WORLD_HALF ||
      o.recovery.winch.z < -WORLD_HALF || o.recovery.winch.z > WORLD_HALF ||
      o.recovery.winch.time < 0 || o.recovery.winch.time > 3)) return false;
  return true;
}

const DEFAULT_SAVE = {
  v: SAVE_VERSION,
  cash: 160,
  jobs: 0,
  bestCash: 160,
  tire: 'road',
  diffLock: false,
  upgrade: 0,
  livery: 'sunset',
  lastSettlement: 0,
  currentJob: null,
  completed: {},
  tutorialDone: false,
  reducedMotion: false,
  screenShake: true,
  recovery: { bogged: false, bogTimer: 0, winch: null },
  player: { x: -126, z: 102, angle: .25, speed: 0 },
};

const kit = GGKit.create({
  slug: 'torque-trail',
  orientation: 'any',
  validateSave,
  onPause(reason) {
    pausedReason = reason;
    clearClaimedControls();
  },
  onResume() {
    pausedReason = null;
  },
  onRestart() {
    resetTrip();
  },
});
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('/play/torque-trail/sw.js', { scope: '/play/torque-trail/' }).catch(() => {});
}
kit.audio.register({
  menu: 'assets/music/quiet-range.mp3',
  trail: 'assets/music/open-trail.mp3',
  ...SFX,
});

let save = kit.save.get(null);
if (!validateSave(save)) save = JSON.parse(JSON.stringify(DEFAULT_SAVE));
kit.juice.enabled = save.screenShake;

const state = {
  player: { ...save.player },
  currentJob: save.currentJob,
  bogged: save.recovery.bogged,
  bogTimer: save.recovery.bogTimer,
  winch: save.recovery.winch ? { ...save.recovery.winch } : null,
  lastSettlement: save.lastSettlement,
  celebrate: 0,
  tripDistance: 0,
  animState: 'idle',
  motionDip: 0,
  motionVelocity: 0,
  fxClock: 0,
};

let mode = 'title';
let pausedReason = null;
let lastFrame = performance.now();
let saveClock = 0;
let messageClock = 0;
let audioStarted = false;
let currentDepot = 0;
let vehicle = null;
let dust = null;
let sparks = null;
let mudSpray = null;
let gravel = null;
let wetSpray = null;
let celebration = null;
let winchLine = null;
let worldClock = 0;
let cameraClock = 0;
let mapReady = false;
let rawVehicle = null;
let raycaster = new THREE.Raycaster();
let terrainGroup = null;
let propGroup = null;
let depotGroup = null;
let skyMesh = null;
let anchors = [];
let guideArrow = null;
let guidePath = null;
const secondaryMotion = [];
const waterRipples = [];
let uiClock = 0;
let payoutClock = 0;
let lastPayout = 0;
let lastDepotState = -1;
let lastFogSurface = '';
let lastHudSnapshot = '';
const inputSnapshot = { throttle: 0, steer: 0 };
const controlRects = { throttle: { x: 0, y: 0, w: 1, h: 1 }, steer: { x: 0, y: 0, w: 1, h: 1 } };
const claimedControls = new Map();
const nearestSettlementResult = { index: -1, distance: Infinity };
const desiredCamera = new THREE.Vector3();
const lookTarget = new THREE.Vector3();

const tutorial = {
  active: !save.tutorialDone,
  step: 0,
  startX: state.player.x,
  startZ: state.player.z,
  text: [
    'Open the Bramblehook board and choose the first load.',
    'Use the left throttle and right steer to leave the depot.',
    'Open the garage and turn on DIFF-LOCK for low-speed grip.',
    'Follow the gold beacon to deliver the cargo.',
  ],
};

function persist() {
  save.player = { ...state.player, speed: clamp(state.player.speed, -105, 230) };
  save.currentJob = state.currentJob;
  save.lastSettlement = state.lastSettlement;
  save.recovery = {
    bogged: !!state.bogged,
    bogTimer: clamp(state.bogTimer, 0, 30),
    winch: state.winch ? { x: state.winch.x, z: state.winch.z, time: clamp(state.winch.time, 0, 3) } : null,
  };
  kit.save.set(save);
}

function sfx(name, opts) {
  kit.audio.sfx(name, opts);
}

function ensureAudio(route) {
  const target = route ? 'trail' : 'menu';
  if (audioStarted && route === !!(mode === 'drive')) return;
  audioStarted = true;
  kit.audio.music(target, 650);
}

function toast(text, seconds = 2.4) {
  ui.message.textContent = text;
  ui.message.classList.add('show');
  messageClock = seconds;
}

function applyMode(next) {
  mode = next;
  ui.title.style.display = next === 'title' ? 'flex' : 'none';
  ui.drive.style.display = next === 'drive' ? 'block' : 'none';
  const controlsOn = next === 'drive';
  ui.throttle.style.display = controlsOn ? 'block' : 'none';
  ui.steer.style.display = controlsOn ? 'block' : 'none';
  if (controlsOn) requestAnimationFrame(measureControls);
  else clearClaimedControls();
  updateTitleMeta();
  updateUI();
}

function updateTitleMeta() {
  ui.titleCash.textContent = money(save.cash);
  ui.titleJobs.textContent = String(save.jobs);
  ui.titleUpgrade.textContent = save.upgrade ? 'Torque ' + save.upgrade : 'Stock';
  ui.titleBest.textContent = money(save.bestCash);
}

function material(hex, roughness = .8, metalness = .05, emissive = 0x000000, emissiveIntensity = 0) {
  return new THREE.MeshStandardMaterial({
    color: hex,
    roughness,
    metalness,
    flatShading: true,
    emissive,
    emissiveIntensity,
  });
}

function heightAt(x, z) {
  let h = Math.sin(x * .045) * 1.7 + Math.cos(z * .055) * 1.35 + Math.sin((x + z) * .022) * 1.2;
  const rockD = Math.hypot((x - 76) / 92, (z + 48) / 72);
  const ridge = clamp(1 - rockD, 0, 1);
  h += ridge * (5.5 + Math.sin(x * .12) * 1.5);
  const mudD = Math.hypot((x + 18) / 74, (z - 40) / 54);
  h -= clamp(1 - mudD, 0, 1) * 1.8;
  return h;
}

function pointSegmentDistance(x, z, a, b) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = dx * dx + dz * dz;
  const t = len ? clamp(((x - a[0]) * dx + (z - a[1]) * dz) / len, 0, 1) : 0;
  return Math.hypot(x - (a[0] + t * dx), z - (a[1] + t * dz));
}

function roadDistance(x, z) {
  let best = Infinity;
  for (const path of ROAD_PATHS) for (let i = 1; i < path.length; i++) best = Math.min(best, pointSegmentDistance(x, z, path[i - 1], path[i]));
  return best;
}

function surfaceAt(x, z) {
  const water = Math.hypot((x - 39) / 27, (z - 54) / 18);
  if (water < 1) return 'water';
  if (roadDistance(x, z) < 7.5) return 'road';
  if (Math.hypot((x + 18) / 74, (z - 40) / 54) < 1) return 'mud';
  if (Math.hypot((x - 76) / 92, (z + 48) / 72) < 1) return 'rock';
  return 'grass';
}

function surfaceColor(surface, x, z) {
  const n = Math.sin(x * .31 + z * .17) * .5 + Math.cos(z * .22 - x * .1) * .5;
  const colors = {
    grass: [0x628957, 0x779c5d],
    road: [0x765541, 0x966d4a],
    mud: [0x75533c, 0x986b46],
    rock: [0x77766d, 0x9b9482],
    water: [0x3f9a9c, 0x6bc6bd],
  };
  const pair = colors[surface] || colors.grass;
  return n > 0 ? pair[0] : pair[1];
}

function makeSky() {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, '#204d62');
  gradient.addColorStop(.48, '#68a8a0');
  gradient.addColorStop(1, '#d6bd83');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 2, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(390, 24, 16), mat);
  mesh.rotation.y = .22;
  return mesh;
}

function makeTerrain() {
  const size = 46;
  const step = (WORLD_HALF * 2) / (size - 1);
  const positions = [];
  const colors = [];
  const indices = [];
  const color = new THREE.Color();
  for (let iz = 0; iz < size; iz++) {
    for (let ix = 0; ix < size; ix++) {
      const x = -WORLD_HALF + ix * step;
      const z = -WORLD_HALF + iz * step;
      const y = heightAt(x, z) - .18;
      positions.push(x, y, z);
      color.setHex(surfaceColor(surfaceAt(x, z), x, z));
      colors.push(color.r, color.g, color.b);
    }
  }
  for (let iz = 0; iz < size - 1; iz++) {
    for (let ix = 0; ix < size - 1; ix++) {
      const a = iz * size + ix;
      const b = a + 1;
      const c = a + size;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .96, metalness: 0, flatShading: true }));
  terrainGroup = new THREE.Group();
  terrainGroup.add(mesh);
  return terrainGroup;
}

function makeRibbon(paths, width, colors, yOffset = .08) {
  const positions = [];
  const vertexColors = [];
  const indices = [];
  let base = 0;
  const c0 = new THREE.Color(colors[0]);
  const c1 = new THREE.Color(colors[1] || colors[0]);
  for (const path of paths) {
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len * width, nz = dx / len * width;
      const verts = [[a[0] - nx, heightAt(a[0], a[1]) + yOffset, a[1] - nz], [a[0] + nx, heightAt(a[0], a[1]) + yOffset, a[1] + nz], [b[0] + nx, heightAt(b[0], b[1]) + yOffset, b[1] + nz], [b[0] - nx, heightAt(b[0], b[1]) + yOffset, b[1] - nz]];
      for (const v of verts) positions.push(v[0], v[1], v[2]);
      const c = (i + path.length) % 2 ? c0 : c1;
      for (let v = 0; v < 4; v++) vertexColors.push(c.r, c.g, c.b);
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      base += 4;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(vertexColors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .88, flatShading: true }));
}

function makeWater() {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 32), material(0x50b7b1, .35, .05, 0x164d50, .22));
  mesh.scale.set(27, 18, 1);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(39, heightAt(39, 54) + .18, 54);
  group.add(mesh);
  for (let i = 0; i < 3; i++) {
    const ripple = new THREE.Mesh(new THREE.TorusGeometry(4 + i * 3, .08, 5, 24), new THREE.MeshBasicMaterial({ color: 0x9de3d1, transparent: true, opacity: .22, depthWrite: false }));
    ripple.rotation.x = -Math.PI / 2;
    ripple.position.set(39 + (i - 1) * 7, heightAt(39, 54) + .26, 54 + (i % 2 ? 4 : -4));
    group.add(ripple);
    waterRipples.push(ripple);
  }
  return group;
}

function makeLabel(text, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(13, 34, 32, .88)';
  ctx.fillRect(8, 16, 496, 96);
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.strokeRect(8, 16, 496, 96);
  ctx.fillStyle = '#f7edc8';
  ctx.font = '900 32px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text.toUpperCase(), 256, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(13, 3.25, 1);
  return sprite;
}

function addDepot(s, index) {
  const g = new THREE.Group();
  g.position.set(s.x, heightAt(s.x, s.z), s.z);
  g.userData.settlementId = index;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(8, 9, .55, 8), material(0x294d45, .95));
  base.position.y = .3;
  const building = new THREE.Mesh(new THREE.BoxGeometry(7.5, 4.5, 6.5), material(0xd3a85c, .82));
  building.position.y = 2.55;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(5.8, 2.8, 4), material(s.color, .8));
  roof.position.y = 6.1;
  roof.rotation.y = Math.PI / 4;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(10.4, .22, 8, 40), material(s.color, .55, .15, s.color, .45));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = .72;
  const flag = new THREE.Mesh(new THREE.BoxGeometry(.18, 5.5, .18), material(0x3a4037, .9));
  flag.position.set(0, 7.8, 0);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.7, .22), material(s.color, .78, .05, s.color, .14));
  sign.position.set(0, 7.8, .12);
  g.add(base, building, roof, ring, flag, sign);
  const label = makeLabel(s.name, '#' + new THREE.Color(s.color).getHexString());
  label.position.set(0, 11, 0);
  g.add(label);
  g.traverse((child) => { child.userData.settlementId = index; });
  g.userData.ring = ring;
  secondaryMotion.push({ object: flag, phase: index * .7, amount: .1 });
  depotGroup.add(g);
}

function makeTree(x, z, scale, isAnchor) {
  const g = new THREE.Group();
  g.position.set(x, heightAt(x, z), z);
  g.scale.setScalar(scale);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.55, .8, 5.2, 6), material(0x5b402d, .98));
  trunk.position.y = 2.55;
  const low = new THREE.Mesh(new THREE.ConeGeometry(3.2, 5.1, 7), material(0x2d7352, .94));
  low.position.y = 5.2;
  const high = new THREE.Mesh(new THREE.ConeGeometry(2.35, 4.6, 7), material(0x4c9a5b, .94));
  high.position.y = 8.0;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.25, .12, 6, 22), material(0xf4ce65, .58, .1, 0xf4ce65, .35));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = .22;
  ring.visible = !!isAnchor;
  g.add(trunk, low, high, ring);
  if (isAnchor) {
    g.userData.anchor = true;
    g.userData.ring = ring;
    anchors.push({ x, z, object: g });
  }
  if (isAnchor) g.traverse((child) => { child.userData.anchor = true; });
  if (!isAnchor) secondaryMotion.push({ object: g, phase: (x * .07 + z * .03), amount: .035 });
  propGroup.add(g);
}

function makeRock(x, z, scale) {
  const socket = new THREE.Mesh(new THREE.CircleGeometry(3.2, 12), new THREE.MeshBasicMaterial({ color: 0x30352f, transparent: true, opacity: .34, depthWrite: false }));
  socket.rotation.x = -Math.PI / 2;
  socket.position.set(x, heightAt(x, z) + .05, z);
  socket.scale.set(scale * 1.3, scale, 1);
  propGroup.add(socket);
  const g = new THREE.Mesh(new THREE.DodecahedronGeometry(2.5, 0), material(Math.random() > .5 ? 0x77776e : 0x9b9482, .98));
  g.position.set(x, heightAt(x, z) + 1.6 * scale, z);
  g.scale.set(scale * 1.3, scale * .75, scale);
  g.rotation.set(.15, Math.random() * TAU, .2);
  propGroup.add(g);
}

function makeReedCluster(x, z, scale = 1) {
  const g = new THREE.Group();
  g.position.set(x, heightAt(x, z), z);
  for (let i = 0; i < 5; i++) {
    const reed = new THREE.Mesh(new THREE.CylinderGeometry(.06, .1, 2.5 + (i % 3) * .55, 5), material(i % 2 ? 0x8dbb62 : 0x5f9b62, .9));
    reed.position.set((i - 2) * .28 * scale, 1.2 * scale, ((i * 7) % 4 - 1.5) * .25 * scale);
    reed.rotation.z = (i - 2) * .08;
    g.add(reed);
  }
  g.scale.setScalar(scale);
  propGroup.add(g);
  secondaryMotion.push({ object: g, phase: x * .04 + z * .02, amount: .08 });
}

function makeLog(x, z, rotation = 0, scale = 1) {
  const log = new THREE.Mesh(new THREE.CylinderGeometry(.28 * scale, .36 * scale, 3.8 * scale, 8), material(0x654732, .94));
  log.position.set(x, heightAt(x, z) + .35 * scale, z);
  log.rotation.set(0, rotation, Math.PI / 2);
  propGroup.add(log);
}

function makeFence(x, z, rotation = 0, length = 8) {
  const g = new THREE.Group();
  g.position.set(x, heightAt(x, z), z);
  g.rotation.y = rotation;
  const wood = material(0x81613e, .92);
  for (const offset of [-length / 2, 0, length / 2]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(.28, 2.3, .28), wood);
    post.position.set(offset, 1.15, 0);
    g.add(post);
  }
  for (const y of [.9, 1.65]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(length, .2, .18), wood);
    rail.position.y = y;
    g.add(rail);
  }
  propGroup.add(g);
}

function buildProps() {
  propGroup = new THREE.Group();
  depotGroup = new THREE.Group();
  anchors = [];
  for (let i = 0; i < SETTLEMENTS.length; i++) addDepot(SETTLEMENTS[i], i);
  const anchorPoints = [[-105, 72], [-78, 6], [-42, 49], [-2, 110], [42, 47], [77, 17], [104, -17], [90, -102], [22, -82], [-57, -65], [-99, -13], [122, 76]];
  for (const [x, z] of anchorPoints) makeTree(x, z, .85 + (Math.abs(x + z) % 3) * .08, true);
  let seed = 821;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 58; i++) {
    const x = lerp(-148, 148, rand());
    const z = lerp(-145, 145, rand());
    if (Math.hypot(x - 80, z + 48) < 38 || roadDistance(x, z) < 14 || SETTLEMENTS.some((s) => Math.hypot(x - s.x, z - s.z) < 14)) continue;
    if (i % 3 === 0) makeRock(x, z, .55 + rand() * .7);
    else makeTree(x, z, .55 + rand() * .55, false);
  }
  // Authored zone signatures keep the three routes readable at a glance.
  for (const [x, z, scale] of [[-34, 42, 1.1], [-2, 31, .85], [-45, 11, .9], [-18, 69, 1]]) makeReedCluster(x, z, scale);
  for (const [x, z, r, scale] of [[-56, 47, .4, 1], [-33, 20, -.3, .8], [-8, 55, .1, 1.2]]) makeLog(x, z, r, scale);
  for (const [x, z, s] of [[58, -52, 1.25], [78, -35, 1.1], [96, -64, 1.35], [64, -83, .9]]) {
    makeRock(x, z, s);
    makeRock(x + 5, z + 3, s * .55);
  }
  makeFence(-102, 113, -.2, 13);
  makeFence(-80, -103, .1, 10);
  makeFence(48, 97, -.6, 11);
  world.add(propGroup, depotGroup);
}

function addZoneDetails() {
  const ridge = makeLabel('Rock Ridge', '#d58a62');
  ridge.position.set(73, heightAt(73, -118) + 4, -118);
  ridge.scale.set(15, 3.75, 1);
  world.add(ridge);
  const bog = makeLabel('Mud Bog', '#8fd3a2');
  bog.position.set(-15, heightAt(-15, 40) + 3.5, 40);
  bog.scale.set(12, 3, 1);
  world.add(bog);
  const ridgeTrail = makeLabel('Ridge Trail', '#c7e1b3');
  ridgeTrail.position.set(8, heightAt(8, -12) + 3, -12);
  ridgeTrail.scale.set(13, 3.25, 1);
  world.add(ridgeTrail);
  const mark = (x, z, sx, sz, color, opacity, rotation = 0) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = rotation;
    mesh.scale.set(sx, sz, 1);
    mesh.position.set(x, heightAt(x, z) + .12, z);
    world.add(mesh);
  };
  // Wet depressions, paired wheel ruts, and mineral strata are deliberately
  // placed on the three route identities instead of relying on labels alone.
  for (const [x, z, r] of [[-36, 46, .2], [-18, 55, -.45], [-5, 34, .1], [-42, 29, .7]]) mark(x, z, 6, 2.2, 0x3f5947, .34, r);
  for (const [x, z, r] of [[62, -53, .1], [76, -39, -.25], [91, -65, .4], [53, -78, -.1]]) mark(x, z, 7, 1.1, 0xb6a78c, .5, r);
  for (const [x, z, r] of [[-88, 80, .5], [-58, 53, .15], [-6, 112, -.3], [29, 89, .2]]) mark(x, z, 9, 1.7, 0x936d49, .45, r);
}

function buildWorld() {
  skyMesh = makeSky();
  world.add(skyMesh);
  world.add(makeTerrain());
  world.add(makeWater());
  world.add(makeRibbon(ROAD_PATHS, 8.6, [0x543d32, 0x6f5038], .08));
  world.add(makeRibbon(ROAD_PATHS, 6.5, [0x9b754d, 0xb38a5b], .14));
  world.add(makeRibbon(ROAD_PATHS, .16, [0xe7d59b, 0xd0b36d], .22));
  buildProps();
  addZoneDetails();
  const light = new THREE.Mesh(new THREE.CircleGeometry(2, 20), material(0xf4ce65, .3, .1, 0xf4ce65, .8));
  light.rotation.x = -Math.PI / 2;
  light.position.y = .22;
  world.add(light);
  guideArrow = new THREE.Group();
  const guideDisc = new THREE.Mesh(new THREE.TorusGeometry(2.4, .13, 6, 24), new THREE.MeshBasicMaterial({ color: 0xf4ce65, transparent: true, opacity: .9 }));
  guideDisc.rotation.x = -Math.PI / 2;
  const guideCone = new THREE.Mesh(new THREE.ConeGeometry(.65, 1.8, 5), new THREE.MeshBasicMaterial({ color: 0xf4ce65, transparent: true, opacity: .9 }));
  guideCone.position.y = 2.2;
  guideArrow.add(guideDisc, guideCone);
  guideArrow.visible = false;
  world.add(guideArrow);
  const guideGeometry = new THREE.BufferGeometry();
  guideGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
  guidePath = new THREE.Line(guideGeometry, new THREE.LineBasicMaterial({ color: 0xf4ce65, transparent: true, opacity: .55, depthWrite: false }));
  guidePath.visible = false;
  world.add(guidePath);
  mapReady = true;
}

function findWheelRole(name) {
  const n = String(name || '').toLowerCase();
  if (n.includes('frontleft')) return 'frontLeft';
  if (n.includes('frontright')) return 'frontRight';
  if (n.includes('front')) return 'front';
  if (n.includes('back') || n.includes('rear') || n.includes('wheel')) return 'rear';
  return 'body';
}

function reauthoredMaterial(name, livery, bodyMats) {
  const n = String(name || '').toLowerCase();
  let color = livery.color;
  let roughness = .52;
  let metalness = .16;
  let emissive = 0x000000;
  let emissiveIntensity = 0;
  let isBody = true;
  if (n.includes('window')) { color = 0x13252c; roughness = .16; metalness = .6; isBody = false; }
  else if (n.includes('headlight')) { color = 0xfff1b1; roughness = .28; emissive = 0xffcf65; emissiveIntensity = .9; isBody = false; }
  else if (n.includes('tail')) { color = 0xf0473d; roughness = .3; emissive = 0xf0473d; emissiveIntensity = .65; isBody = false; }
  else if (n.includes('black')) { color = 0x182326; roughness = .82; metalness = .04; isBody = false; }
  else if (n.includes('grey') || n.includes('gray') || n.includes('white')) { color = 0xb9c4b7; roughness = .48; metalness = .3; isBody = false; }
  const mat = material(color, roughness, metalness, emissive, emissiveIntensity);
  if (isBody) bodyMats.push(mat);
  return mat;
}

function loadVehicleRaw() {
  if (rawVehicle) return Promise.resolve(rawVehicle);
  const loader = new OBJLoader();
  return new Promise((resolve, reject) => loader.load('assets/cars/SUV.obj', (raw) => { rawVehicle = raw; resolve(raw); }, undefined, reject));
}

function makeBlobTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
  g.addColorStop(0, 'rgba(0,0,0,.62)');
  g.addColorStop(.55, 'rgba(0,0,0,.28)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildVehicle(raw) {
  const root = new THREE.Group();
  const chassis = new THREE.Group();
  root.add(chassis);
  const whole = new THREE.Box3().setFromObject(raw);
  const size = new THREE.Vector3();
  whole.getSize(size);
  const scale = 5.2 / Math.max(size.x, size.z, .001);
  const minY = whole.min.y;
  const wheelGroups = [];
  const frontWheels = [];
  const bodyMats = [];
  const livery = LIVERIES[save.livery];
  raw.traverse((child) => {
    if (!child.isMesh) return;
    const roles = Array.isArray(child.material) ? child.material.map((m) => reauthoredMaterial(m.name, livery, bodyMats)) : reauthoredMaterial(child.material && child.material.name, livery, bodyMats);
    const geometry = child.geometry.clone();
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, roles);
    const role = findWheelRole(child.name || child.parent?.name);
    mesh.name = child.name || role;
    if (role === 'body') {
      chassis.add(mesh);
      return;
    }
    geometry.computeBoundingBox();
    const center = new THREE.Vector3();
    geometry.boundingBox.getCenter(center);
    geometry.translate(-center.x, -center.y, -center.z);
    const pivot = new THREE.Group();
    pivot.position.copy(center);
    pivot.add(mesh);
    chassis.add(pivot);
    wheelGroups.push(pivot);
    if (role === 'front' || role === 'frontLeft' || role === 'frontRight') frontWheels.push(pivot);
  });
  chassis.scale.setScalar(scale);
  chassis.position.y = -minY * scale;
  chassis.rotation.y = Math.PI;
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(4.1, 6.4), new THREE.MeshBasicMaterial({ map: makeBlobTexture(), transparent: true, depthWrite: false, opacity: .7 }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = .1;
  root.add(shadow);
  const tireShadows = [];
  const tireShadowTexture = makeBlobTexture();
  for (const [x, z] of [[-1.28, -1.42], [1.28, -1.42], [-1.28, 1.42], [1.28, 1.42]]) {
    const tireShadow = new THREE.Mesh(new THREE.PlaneGeometry(.92, 1.25), new THREE.MeshBasicMaterial({ map: tireShadowTexture, transparent: true, depthWrite: false, opacity: .5 }));
    tireShadow.rotation.x = -Math.PI / 2;
    tireShadow.position.set(x, .12, z);
    root.add(tireShadow);
    tireShadows.push(tireShadow);
  }
  for (const wheel of wheelGroups) {
    wheel.userData.baseY = wheel.position.y;
    wheel.userData.localX = wheel.position.x * scale;
    wheel.userData.localZ = wheel.position.z * scale;
  }
  const cargoBedMat = material(livery.accent, .62, .12);
  const cargoBed = new THREE.Mesh(new THREE.BoxGeometry(2.35, .42, 1.65), cargoBedMat);
  cargoBed.position.set(0, 1.18, .72);
  cargoBed.scale.setScalar(scale > .3 ? 1 : 1);
  chassis.add(cargoBed);
  const cargoRail = new THREE.Mesh(new THREE.BoxGeometry(2.55, .16, 1.86), material(0x273a37, .7, .35));
  cargoRail.position.set(0, 1.48, .72);
  chassis.add(cargoRail);
  const bogLamp = new THREE.Mesh(new THREE.TorusGeometry(2.5, .12, 8, 32), material(0xf08b50, .45, .08, 0xf08b50, .65));
  bogLamp.rotation.x = -Math.PI / 2;
  bogLamp.position.y = .34;
  bogLamp.visible = false;
  root.add(bogLamp);
  const winchLamp = new THREE.Mesh(new THREE.SphereGeometry(.22, 10, 8), material(0x76d7bd, .35, .1, 0x76d7bd, 1));
  winchLamp.position.set(0, 1.05, -2.55);
  winchLamp.visible = false;
  chassis.add(winchLamp);
  root.userData.bodyMats = bodyMats;
  return { root, chassis, shadow, tireShadows, cargoBedMat, wheelGroups, frontWheels, bodyMats, bogLamp, winchLamp, baseChassisY: -minY * scale, lean: 0, leanVel: 0, pitch: 0, pitchVel: 0, wheelSpin: 0 };
}

function setVehicleLivery() {
  if (!vehicle) return;
  const paint = LIVERIES[save.livery];
  for (const mat of vehicle.bodyMats) mat.color.setHex(paint.color);
  vehicle.cargoBedMat.color.setHex(paint.accent);
}

class PointPool {
  constructor(count, size, gravity, color) {
    this.count = count;
    this.size = size;
    this.gravity = gravity;
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.max = new Float32Array(count);
    this.col = new Float32Array(count * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.geometry = geometry;
    this.points = new THREE.Points(geometry, new THREE.PointsMaterial({ size, vertexColors: true, transparent: true, opacity: .88, depthWrite: false, sizeAttenuation: true }));
    this.points.frustumCulled = false;
    this.points.visible = false;
    this.next = 0;
    for (let i = 0; i < count; i++) this.pos[i * 3 + 1] = DEAD_Y;
    this.defaultColor = color;
  }
  emit(x, y, z, vx, vy, vz, life, color = this.defaultColor) {
    const i = this.next;
    this.next = (this.next + 1) % this.count;
    const p = i * 3;
    this.pos[p] = x; this.pos[p + 1] = y; this.pos[p + 2] = z;
    this.vel[p] = vx; this.vel[p + 1] = vy; this.vel[p + 2] = vz;
    this.life[i] = life; this.max[i] = life;
    this.col[p] = ((color >> 16) & 255) / 255; this.col[p + 1] = ((color >> 8) & 255) / 255; this.col[p + 2] = (color & 255) / 255;
  }
  update(dt) {
    let live = false;
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const p = i * 3;
      if (this.life[i] <= 0) { this.pos[p + 1] = DEAD_Y; continue; }
      live = true;
      this.vel[p] *= .97; this.vel[p + 2] *= .97; this.vel[p + 1] += this.gravity * dt;
      this.pos[p] += this.vel[p] * dt; this.pos[p + 1] += this.vel[p + 1] * dt; this.pos[p + 2] += this.vel[p + 2] * dt;
      const t = clamp(this.life[i] / this.max[i], 0, 1);
      this.col[p] *= .992 * t; this.col[p + 1] *= .992 * t; this.col[p + 2] *= .992 * t;
    }
    if (live || this.points.visible) { this.geometry.attributes.position.needsUpdate = true; this.geometry.attributes.color.needsUpdate = true; }
    this.points.visible = live;
  }
}

function emitDust() {
  if (!dust) return;
  const p = state.player;
  const surface = surfaceAt(p.x, p.z);
  const color = surface === 'mud' ? 0x916342 : surface === 'rock' ? 0xb5a88f : 0xc4a266;
  const backX = p.x - Math.sin(p.angle) * 2.2;
  const backZ = p.z - Math.cos(p.angle) * 2.2;
  dust.emit(backX, heightAt(backX, backZ) + .5, backZ, (Math.random() - .5) * 7, 3 + Math.random() * 4, (Math.random() - .5) * 7, .5 + Math.random() * .22, color);
}

function emitSurfaceFX() {
  const p = state.player;
  const surface = surfaceAt(p.x, p.z);
  if (surface !== 'mud' && surface !== 'rock' && surface !== 'water' && surface !== 'road') return;
  const forwardX = Math.sin(p.angle), forwardZ = Math.cos(p.angle);
  const sideX = Math.cos(p.angle), sideZ = -Math.sin(p.angle);
  const rearX = p.x - forwardX * 1.8;
  const rearZ = p.z - forwardZ * 1.8;
  const y = heightAt(rearX, rearZ) + .28;
  const pool = surface === 'mud' ? mudSpray : surface === 'rock' ? gravel : wetSpray;
  const color = surface === 'mud' ? 0x6e4633 : surface === 'rock' ? 0xd0bc91 : surface === 'road' ? 0x9ccbd0 : 0x63d2cc;
  if (!pool) return;
  for (const side of [-1, 1]) {
    const x = rearX + sideX * side * 1.05;
    const z = rearZ + sideZ * side * 1.05;
    pool.emit(x, y, z, -forwardX * 3 + sideX * side * (2 + Math.random() * 2), 1.4 + Math.random() * 2.2, -forwardZ * 3 + sideZ * side * (2 + Math.random() * 2), .34 + Math.random() * .18, color);
  }
}

function burst(x, z, color = 0xf4ce65) {
  if (!sparks) return;
  const y = heightAt(x, z) + 1.2;
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * TAU;
    const speed = 4 + (i % 5) * .7;
    sparks.emit(x, y, z, Math.cos(a) * speed, 4 + (i % 4), Math.sin(a) * speed, .55 + (i % 3) * .08, color);
  }
}

function nearestAnchor() {
  let best = null;
  let bestDistance = Infinity;
  for (const anchor of anchors) {
    const d = Math.hypot(state.player.x - anchor.x, state.player.z - anchor.z);
    if (d < bestDistance) { bestDistance = d; best = anchor; }
  }
  return bestDistance < 34 ? best : null;
}

function nearestSettlement() {
  let bestIndex = -1;
  let bestDistance = Infinity;
  for (let i = 0; i < SETTLEMENTS.length; i++) {
    const d = dist2(state.player, SETTLEMENTS[i]);
    if (d < bestDistance) { bestDistance = d; bestIndex = i; }
  }
  nearestSettlementResult.index = bestIndex;
  nearestSettlementResult.distance = bestDistance;
  return bestDistance < 25 ? SETTLEMENTS[bestIndex] : null;
}

function traction(surface) {
  const tire = TIRES[save.tire];
  if (surface === 'water') return .5;
  let value = surface === 'mud' ? tire.mud : surface === 'rock' ? tire.rock : surface === 'road' ? tire.road : .9;
  if (save.diffLock) value *= surface === 'road' ? .93 : 1.12;
  value *= 1 + save.upgrade * .045;
  return value;
}

function routeTier() {
  return clamp(1 + Math.floor((save.jobs + 1) / 2), 1, 6);
}

function jobUnlocked(job) {
  return job.difficulty <= routeTier();
}

function motionImpact(power) {
  if (save.reducedMotion) return;
  state.motionVelocity -= power;
}

function juiceShake(magnitude, duration) {
  if (!save.reducedMotion) kit.juice.shake(magnitude, duration);
}

function juiceHitStop(duration) {
  if (!save.reducedMotion) kit.juice.hitStop(duration);
}

function clearClaimedControls() {
  claimedControls.clear();
  inputSnapshot.throttle = 0;
  inputSnapshot.steer = 0;
}

function claimControl(event, zone, element) {
  if (mode !== 'drive' || kit.paused) return;
  // The slider's own pointerdown fires BEFORE GGKit's window-level listener
  // during bubbling, so the pointer is not tracked yet at claim time - the
  // old early-return made every touch slider dead. Seed the entry; GGKit's
  // handler overwrites it a moment later with identical coordinates.
  let pointer = kit.input.pointers.get(event.pointerId);
  if (!pointer) {
    pointer = {
      x: event.clientX, y: event.clientY,
      startX: event.clientX, startY: event.clientY,
      downAt: performance.now(), zone: null,
    };
    kit.input.pointers.set(event.pointerId, pointer);
  }
  claimedControls.set(event.pointerId, zone);
  pointer.zone = zone;
  try { element.setPointerCapture(event.pointerId); } catch (_) {}
}

function releaseControl(event) {
  claimedControls.delete(event.pointerId);
}

function claimedPointer(zone) {
  for (const [pointerId, claimedZone] of claimedControls) {
    if (claimedZone !== zone) continue;
    const pointer = kit.input.pointers.get(pointerId);
    if (pointer) return pointer;
    claimedControls.delete(pointerId);
  }
  return null;
}

function readControls() {
  let throttle = 0;
  let steer = 0;
  const throttleRect = controlRects.throttle;
  const steerRect = controlRects.steer;
  const throttlePointer = throttleRect.w > 1 && throttleRect.h > 1 ? claimedPointer('throttle') : null;
  const steerPointer = steerRect.w > 1 && steerRect.h > 1 ? claimedPointer('steer') : null;
  if (throttlePointer && throttleRect.h > 1) {
    const t = clamp((throttlePointer.y - throttleRect.y) / throttleRect.h, 0, 1);
    throttle = 1 - t * 2;
    ui.throttleKnob.style.top = clamp((throttlePointer.y - throttleRect.y) - 25, -1, throttleRect.h - 49) + 'px';
  } else ui.throttleKnob.style.top = '88px';
  if (steerPointer && steerRect.w > 1) {
    const t = clamp((steerPointer.x - steerRect.x) / steerRect.w, 0, 1);
    steer = t * 2 - 1;
    ui.steerKnob.style.left = clamp((steerPointer.x - steerRect.x) - 25, -1, steerRect.w - 49) + 'px';
  } else ui.steerKnob.style.left = 'calc(50% - 25px)';
  if (kit.input.keyDown('ArrowUp') || kit.input.keyDown('KeyW') || kit.input.keyDown('Space')) throttle = 1;
  if (kit.input.keyDown('ArrowDown') || kit.input.keyDown('KeyS')) throttle = -1;
  if (kit.input.keyDown('ArrowLeft') || kit.input.keyDown('KeyA')) steer = -1;
  if (kit.input.keyDown('ArrowRight') || kit.input.keyDown('KeyD')) steer = 1;
  inputSnapshot.throttle = clamp(throttle, -1, 1);
  inputSnapshot.steer = clamp(steer, -1, 1);
  return inputSnapshot;
}

function updateSimulation(dt) {
  const input = readControls();
  const p = state.player;
  if (!state.winch) {
    const surface = surfaceAt(p.x, p.z);
    const grip = traction(surface);
    const maxForward = surface === 'water' ? 90 : surface === 'mud' ? 105 : surface === 'rock' ? 145 : 215;
    if (Math.abs(input.throttle) > .02) p.speed += input.throttle * 195 * grip * dt;
    const drag = surface === 'mud' ? (save.tire === 'mud' ? .29 : .21) : surface === 'water' ? .55 : surface === 'rock' ? .72 : .82;
    p.speed *= Math.pow(drag, dt);
    p.speed = clamp(p.speed, -105 * grip, maxForward * grip);
    const steeringPower = (.65 + Math.min(1.1, Math.abs(p.speed) / 120)) * (p.speed >= 0 ? 1 : -1);
    p.angle += input.steer * steeringPower * dt;
    const oldX = p.x, oldZ = p.z;
    p.x += Math.sin(p.angle) * p.speed * dt;
    p.z += Math.cos(p.angle) * p.speed * dt;
    p.x = clamp(p.x, -WORLD_HALF + 5, WORLD_HALF - 5);
    p.z = clamp(p.z, -WORLD_HALF + 5, WORLD_HALF - 5);
    state.tripDistance += Math.hypot(p.x - oldX, p.z - oldZ);
    if (Math.abs(p.speed) > 34 && Math.random() < dt * 12) emitDust();
    state.fxClock -= dt;
    if (state.fxClock <= 0 && Math.abs(p.speed) > 18) {
      emitSurfaceFX();
      state.fxClock = surface === 'mud' ? .08 : surface === 'rock' ? .1 : .14;
    }
    if (surface === 'mud' && Math.abs(p.speed) < 28 && input.throttle > .25) state.bogTimer += dt * (1.3 / Math.max(.5, grip));
    else state.bogTimer = Math.max(0, state.bogTimer - dt * 1.6);
    if (state.bogTimer > 2.5) {
      if (!state.bogged) { sfx('mud', { volume: .75 }); motionImpact(.22); toast('Bogged down. Find a gold-ringed tree or recover.', 3.1); }
      state.bogged = true;
      p.speed *= .84;
    }
    if (state.bogged && surface !== 'mud') { state.bogged = false; state.bogTimer = 0; }
  } else {
    const a = state.winch;
    const dx = a.x - p.x, dz = a.z - p.z;
    const distance = Math.hypot(dx, dz);
    p.speed = 0;
    if (distance > 6) {
      const step = Math.min(168 * (1 + save.upgrade * .12) * dt, distance - 6);
      p.x += dx / distance * step;
      p.z += dz / distance * step;
      p.angle = Math.atan2(dx, dz);
      if (Math.random() < dt * 15) { emitDust(); if (sparks) sparks.emit(a.x, heightAt(a.x, a.z) + 1, a.z, (Math.random() - .5) * 2, 1 + Math.random() * 2, (Math.random() - .5) * 2, .3, 0xf4ce65); }
    }
    a.time -= dt;
    const remaining = Math.hypot(a.x - p.x, a.z - p.z);
    if (remaining <= 6.05 || a.time <= 0) {
      state.winch = null;
      state.bogged = false;
      state.bogTimer = 0;
      sfx('wood', { volume: .78 });
      burst(p.x, p.z, 0x76d7bd);
      motionImpact(.16);
      juiceShake(3, 150);
      toast('Winch bite. Back on the trail.');
    }
  }
  const near = nearestSettlement();
  if (near) state.lastSettlement = near.index;
  if (state.currentJob) {
    const job = JOBS.find((j) => j.id === state.currentJob);
    if (job && dist2(p, SETTLEMENTS[job.to]) < 13) completeJob(job);
  }
  saveClock += dt;
  if (saveClock > 1.2) { persist(); saveClock = 0; }
  if (state.celebrate > 0) state.celebrate -= dt;
  updateTutorial();
}

function completeJob(job) {
  save.cash += job.pay;
  lastPayout = job.pay;
  save.jobs += 1;
  save.bestCash = Math.max(save.bestCash, save.cash);
  save.completed[job.id] = true;
  state.currentJob = null;
  state.lastSettlement = job.to;
  state.bogged = false;
  state.bogTimer = 0;
  state.celebrate = 1.3;
  state.player.speed = 0;
  payoutClock = 2.8;
  motionImpact(.24);
  persist();
  sfx('payout', { volume: .95 });
  sfx('drop', { volume: .65 });
  sfx('confirm', { volume: .6 });
  burst(state.player.x, state.player.z, 0xf4ce65);
  if (celebration) for (let i = 0; i < 22; i++) celebration.emit(state.player.x, heightAt(state.player.x, state.player.z) + 1, state.player.z, (Math.random() - .5) * 9, 4 + Math.random() * 5, (Math.random() - .5) * 9, .9, i % 2 ? 0xf4ce65 : 0x76d7bd);
  juiceShake(7, 220);
  juiceHitStop(60);
  toast('Delivered ' + job.cargo.toLowerCase() + '  ·  +' + money(job.pay), 3.2);
  if (tutorial.active && tutorial.step === 3) finishTutorial();
}

function deployWinch() {
  if (state.winch || !state.bogged) return;
  const anchor = nearestAnchor();
  if (!anchor) { toast('No anchor in range. Recover if the bog has you.'); return; }
  state.winch = { x: anchor.x, z: anchor.z, time: 2.4 };
  sfx('winch', { volume: .9 });
  motionImpact(.12);
  juiceShake(3, 120);
  toast('Winch engaged. Hold the line.');
}

function recoveryPoint(depot, job) {
  const candidates = [[18, 12], [-18, 12], [18, -12], [-18, -12], [22, 0], [0, 22]];
  for (const [dx, dz] of candidates) {
    const x = clamp(depot.x + dx, -WORLD_HALF + 5, WORLD_HALF - 5);
    const z = clamp(depot.z + dz, -WORLD_HALF + 5, WORLD_HALF - 5);
    if (!job || Math.hypot(x - SETTLEMENTS[job.to].x, z - SETTLEMENTS[job.to].z) >= 13.5) return { x, z };
  }
  return { x: clamp(depot.x + 22, -WORLD_HALF + 5, WORLD_HALF - 5), z: clamp(depot.z + 8, -WORLD_HALF + 5, WORLD_HALF - 5) };
}

function recover() {
  if (!state.bogged || nearestAnchor()) return;
  const cost = Math.min(Math.max(5, 25 - save.upgrade * 5), save.cash);
  save.cash -= cost;
  const depot = SETTLEMENTS[state.lastSettlement] || SETTLEMENTS[0];
  const activeJob = state.currentJob && JOBS.find((job) => job.id === state.currentJob);
  const spawn = recoveryPoint(depot, activeJob);
  state.player.x = spawn.x;
  state.player.z = spawn.z;
  state.player.speed = 0;
  state.player.angle = Math.atan2(depot.x - state.player.x, depot.z - state.player.z);
  state.bogged = false;
  state.bogTimer = 0;
  state.winch = null;
  motionImpact(.28);
  persist();
  sfx('back', { volume: .85 });
  burst(state.player.x, state.player.z, 0xee9857);
  juiceShake(9, 220);
  toast(cost ? 'Recovered at ' + depot.name + '  ·  -' + money(cost) : 'Recovered at ' + depot.name + '  ·  empty wallet', 3);
}

function resetTrip() {
  const depot = SETTLEMENTS[state.lastSettlement] || SETTLEMENTS[0];
  state.currentJob = null;
  state.player.x = depot.x + 10;
  state.player.z = depot.z + 8;
  state.player.speed = 0;
  state.player.angle = .25;
  state.bogged = false;
  state.bogTimer = 0;
  state.winch = null;
  state.tripDistance = 0;
  persist();
  sfx('back', { volume: .7 });
  toast('Trip reset at ' + depot.name + '.');
}

function updateVehicle(dt) {
  if (!vehicle) return;
  const p = state.player;
  const h = heightAt(p.x, p.z);
  state.motionVelocity += (0 - state.motionDip) * 34 * dt;
  state.motionVelocity *= Math.exp(-9 * dt);
  state.motionDip += state.motionVelocity * dt;
  vehicle.root.position.set(p.x, h + .04 + state.motionDip, p.z);
  vehicle.root.rotation.y = p.angle;
  const input = inputSnapshot;
  const moving = Math.abs(p.speed) > 5 || Math.abs(input.throttle) > .1;
  state.animState = state.celebrate > 0 ? 'delivered' : state.winch ? 'winching' : state.bogged ? 'bogged' : moving ? 'driving' : 'idle';
  const leanTarget = clamp(-input.steer * Math.abs(p.speed) / 160 * .11, -.13, .13);
  vehicle.leanVel += (leanTarget - vehicle.lean) * 260 * dt;
  vehicle.leanVel *= Math.exp(-21 * dt);
  vehicle.lean += vehicle.leanVel * dt;
  const pitchTarget = clamp(-input.throttle * Math.abs(p.speed) / 210 * .07, -.09, .09) + (state.bogged ? Math.sin(worldClock * 9) * .035 : 0);
  vehicle.pitchVel += (pitchTarget - vehicle.pitch) * 260 * dt;
  vehicle.pitchVel *= Math.exp(-21 * dt);
  vehicle.pitch += vehicle.pitchVel * dt;
  vehicle.chassis.rotation.z = vehicle.lean;
  vehicle.chassis.rotation.x = vehicle.pitch;
  vehicle.chassis.position.y = vehicle.baseChassisY + (state.animState === 'delivered' ? Math.sin(worldClock * 12) * .08 : state.animState === 'idle' ? Math.sin(worldClock * 2.6) * .025 : 0);
  vehicle.wheelSpin -= p.speed * dt * .38;
  for (let wheelIndex = 0; wheelIndex < vehicle.wheelGroups.length; wheelIndex++) {
    const wheel = vehicle.wheelGroups[wheelIndex];
    wheel.rotation.x = vehicle.wheelSpin;
    const lx = wheel.userData.localX || 0;
    const lz = wheel.userData.localZ || 0;
    const probeX = p.x + Math.cos(p.angle) * lx + Math.sin(p.angle) * lz;
    const probeZ = p.z - Math.sin(p.angle) * lx + Math.cos(p.angle) * lz;
    const travel = clamp((heightAt(probeX, probeZ) - h) * .075 + Math.sin(worldClock * 8 + lz) * .018, -.16, .16);
    wheel.position.y = wheel.userData.baseY + travel;
    if (vehicle.tireShadows[wheelIndex]) {
      vehicle.tireShadows[wheelIndex].scale.set(1 + Math.abs(travel) * 1.5, 1 + Math.abs(travel) * .8, 1);
      vehicle.tireShadows[wheelIndex].rotation.z = vehicle.lean * .35;
    }
  }
  for (const wheel of vehicle.frontWheels) wheel.rotation.y = input.steer * .14;
  for (const tireShadow of vehicle.tireShadows) tireShadow.material.opacity = .4 + clamp(Math.abs(p.speed) / 240, 0, .22);
  vehicle.shadow.scale.set(1 + clamp(Math.abs(state.motionDip) * 1.8, 0, .16), 1 + clamp(Math.abs(state.motionDip) * 1.1, 0, .1), 1);
  const slopeX = heightAt(p.x + 2, p.z) - heightAt(p.x - 2, p.z);
  const slopeZ = heightAt(p.x, p.z + 2) - heightAt(p.x, p.z - 2);
  vehicle.shadow.rotation.z = clamp(slopeX * .035, -.12, .12);
  vehicle.shadow.scale.z = 1 + clamp(Math.abs(slopeZ) * .025, 0, .14);
  vehicle.bogLamp.visible = state.bogged;
  vehicle.winchLamp.visible = !!state.winch;
  if (winchLine) {
    winchLine.visible = !!state.winch;
    if (state.winch) {
      const linePos = winchLine.geometry.attributes.position.array;
      const a = state.winch;
      const endY = heightAt(a.x, a.z) + 1.1;
      const tension = clamp(1 - a.time / 2.4, 0, 1);
      const sag = lerp(2.35, .12, tension);
      const vibration = tension * Math.sin(worldClock * 32) * .08;
      for (let i = 0; i < 9; i++) {
        const t = i / 8;
        const p3 = i * 3;
        linePos[p3] = lerp(p.x, a.x, t);
        linePos[p3 + 1] = lerp(h + 1.1, endY, t) + Math.sin(Math.PI * t) * sag + vibration * Math.sin(Math.PI * t * 3);
        linePos[p3 + 2] = lerp(p.z, a.z, t);
      }
      winchLine.material.opacity = lerp(.62, 1, tension);
      winchLine.material.color.setHex(tension > .72 ? 0x76d7bd : 0xf4ce65);
      winchLine.geometry.attributes.position.needsUpdate = true;
    }
  }
}

function updateWorldVisuals(dt) {
  for (const anchor of anchors) {
    const ring = anchor.object.userData.ring;
    if (!ring) continue;
    ring.rotation.z += dt * 1.5;
    const near = Math.hypot(state.player.x - anchor.x, state.player.z - anchor.z) < 42;
    ring.scale.setScalar(near ? 1 + Math.sin(worldClock * 5) * .08 : 1);
    ring.material.emissiveIntensity = near ? .85 : .35;
  }
  if (depotGroup) depotGroup.children.forEach((depot, index) => {
    if (depot.userData.ring) {
      const job = state.currentJob && JOBS.find((candidate) => candidate.id === state.currentJob);
      const active = !!job && job.to === index;
      depot.userData.ring.rotation.z += dt * .7;
      depot.userData.ring.scale.setScalar(active ? 1.12 + Math.sin(worldClock * 5) * .08 : 1 + Math.sin(worldClock * 2 + depot.position.x) * .04);
      depot.userData.ring.material.color.setHex(active ? 0xf4ce65 : SETTLEMENTS[index].color);
      depot.userData.ring.material.emissive.setHex(active ? 0xf4ce65 : SETTLEMENTS[index].color);
      depot.userData.ring.material.emissiveIntensity = active ? .9 : .45;
    }
  });
  for (const motion of secondaryMotion) {
    motion.object.rotation.z = Math.sin(worldClock * 1.6 + motion.phase) * motion.amount;
  }
  for (let i = 0; i < waterRipples.length; i++) {
    const ripple = waterRipples[i];
    const phase = worldClock * .7 + i * 1.7;
    ripple.scale.setScalar(.82 + (Math.sin(phase) + 1) * .13);
    ripple.material.opacity = .12 + (Math.sin(phase) + 1) * .07;
  }
  const surface = surfaceAt(state.player.x, state.player.z);
  if (surface !== lastFogSurface) {
    lastFogSurface = surface;
    const fogColor = surface === 'mud' ? 0x6f9d98 : surface === 'rock' ? 0x98918a : surface === 'road' ? 0x91a98e : 0x7fa69e;
    scene.fog.color.setHex(fogColor);
  }
  if (guideArrow && guidePath) {
    const showGuide = tutorial.active && tutorial.step === 0 && mode === 'drive';
    guideArrow.visible = showGuide;
    guidePath.visible = showGuide;
    if (showGuide) {
      const target = SETTLEMENTS[0];
      guideArrow.position.set(target.x, heightAt(target.x, target.z) + .3 + Math.sin(worldClock * 4) * .16, target.z);
      guideArrow.rotation.y = Math.atan2(target.x - state.player.x, target.z - state.player.z);
      const guidePos = guidePath.geometry.attributes.position.array;
      guidePos[0] = state.player.x; guidePos[1] = heightAt(state.player.x, state.player.z) + .25; guidePos[2] = state.player.z;
      guidePos[3] = lerp(state.player.x, target.x, .33); guidePos[4] = heightAt(lerp(state.player.x, target.x, .33), lerp(state.player.z, target.z, .33)) + .55; guidePos[5] = lerp(state.player.z, target.z, .33);
      guidePos[6] = lerp(state.player.x, target.x, .66); guidePos[7] = heightAt(lerp(state.player.x, target.x, .66), lerp(state.player.z, target.z, .66)) + .55; guidePos[8] = lerp(state.player.z, target.z, .66);
      guidePos[9] = target.x; guidePos[10] = heightAt(target.x, target.z) + .25; guidePos[11] = target.z;
      guidePath.geometry.attributes.position.needsUpdate = true;
    }
  }
}

function updateCamera(dt, shake) {
  if (mode === 'title') {
    cameraClock += dt;
    const angle = cameraClock * .055;
    const heroX = state.player.x;
    const heroZ = state.player.z;
    camera.position.set(heroX + Math.cos(angle) * 18, heightAt(heroX, heroZ) + 7.4, heroZ + Math.sin(angle) * 18);
    camera.lookAt(heroX, heightAt(heroX, heroZ) + 1.5, heroZ);
    camera.fov = 54;
    camera.updateProjectionMatrix();
    return;
  }
  const p = state.player;
  const forwardX = Math.sin(p.angle), forwardZ = Math.cos(p.angle);
  desiredCamera.set(p.x - forwardX * 12, heightAt(p.x, p.z) + 7.6, p.z - forwardZ * 12);
  desiredCamera.x += forwardX * clamp(p.speed / 70, -2, 5);
  desiredCamera.z += forwardZ * clamp(p.speed / 70, -2, 5);
  camera.position.lerp(desiredCamera, 1 - Math.pow(.001, dt));
  lookTarget.set(p.x + forwardX * (3 + clamp(p.speed / 75, 0, 5)), heightAt(p.x, p.z) + 1.25, p.z + forwardZ * (3 + clamp(p.speed / 75, 0, 5)));
  camera.lookAt(lookTarget);
  camera.fov = lerp(camera.fov, 58 + clamp(Math.abs(p.speed) / 210 * 5, 0, 5), 1 - Math.pow(.0005, dt));
  camera.updateProjectionMatrix();
  if (shake && kit.juice.enabled) {
    camera.position.x += shake.dx * .035;
    camera.position.y += shake.dy * .035;
  }
}

function updateTutorial() {
  if (!tutorial.active || mode !== 'drive') { ui.tutorial.classList.remove('show'); return; }
  if (tutorial.step === 0 && state.currentJob) tutorial.step = 1;
  else if (tutorial.step === 1 && state.tripDistance > 22) tutorial.step = 2;
  else if (tutorial.step === 2 && save.diffLock) tutorial.step = 3;
  ui.tutorial.classList.add('show');
  ui.tutorialStep.textContent = 'Field briefing ' + (tutorial.step + 1) + ' / 4';
  ui.tutorialText.textContent = tutorial.text[tutorial.step];
}

function finishTutorial() {
  tutorial.active = false;
  save.tutorialDone = true;
  persist();
  ui.tutorial.classList.remove('show');
  toast('Briefing complete. The whole frontier is open.', 3.4);
}

function updateUI() {
  if (uiClock < .08) return;
  uiClock = 0;
  const surface = surfaceAt(state.player.x, state.player.z);
  const zone = surface === 'mud' ? 'Mud Bog' : surface === 'rock' ? 'Rock Ridge' : surface === 'water' ? 'Shallow Crossing' : surface === 'road' ? 'Ridge Trail' : 'Open Meadow';
  const speedValue = Math.round(Math.abs(state.player.speed));
  const torqueValue = Math.round(clamp(traction(surface) / 1.45, 0, 1) * 100);
  if (ui.speed) ui.speed.textContent = speedValue + ' km/h';
  if (ui.torque) ui.torque.textContent = torqueValue + '%';
  if (ui.speedArc) ui.speedArc.style.background = 'conic-gradient(var(--teal) 0 ' + clamp(speedValue / 2.15, 0, 100) + '%, rgba(255,255,255,.1) ' + clamp(speedValue / 2.15, 0, 100) + '% 100%)';
  if (ui.torqueArc) ui.torqueArc.style.background = 'conic-gradient(var(--orange) 0 ' + torqueValue + '%, rgba(255,255,255,.1) ' + torqueValue + '% 100%)';
  const hudSnapshot = [save.cash, save.jobs, save.tire, save.diffLock, zone, state.currentJob, state.bogged, !!state.winch, state.animState, payoutClock > 0].join('|');
  if (hudSnapshot === lastHudSnapshot) return;
  lastHudSnapshot = hudSnapshot;
  ui.cash.textContent = money(save.cash);
  ui.jobs.textContent = String(save.jobs);
  ui.tire.textContent = TIRES[save.tire].label;
  ui.lock.textContent = save.diffLock ? 'ON' : 'OFF';
  ui.zone.textContent = zone + '  ·  ROUTE ' + routeTier();
  if (state.currentJob) {
    const job = JOBS.find((j) => j.id === state.currentJob);
    const destination = job ? SETTLEMENTS[job.to].name : 'the depot';
    ui.cargo.style.display = 'block';
    ui.cargo.innerHTML = '<b>' + (job ? job.cargo.toUpperCase() : 'CARGO') + '</b>  →  ' + destination + '  ·  ' + money(job ? job.pay : 0);
  } else {
    ui.cargo.style.display = 'block';
    ui.cargo.innerHTML = 'No cargo loaded. <b>Tap a depot</b> to open the job board.';
  }
  const anchor = nearestAnchor();
  const winchDisplay = state.bogged && anchor && !state.winch ? 'block' : 'none';
  const recoverDisplay = state.bogged && !anchor && state.bogTimer > 3.4 && !state.winch ? 'block' : 'none';
  if (ui.winch.style.display !== winchDisplay) ui.winch.style.display = winchDisplay;
  if (ui.recover.style.display !== recoverDisplay) ui.recover.style.display = recoverDisplay;
  ui.state.textContent = state.animState.toUpperCase() + (state.bogged ? '  ·  BOGGED' : '');
  if (ui.payout) {
    ui.payout.style.display = payoutClock > 0 ? 'block' : 'none';
    if (payoutClock > 0) ui.payout.textContent = 'PAYMENT CLEARED  +' + money(lastPayout);
  }
  updateTitleMeta();
}

function renderJobBoard(index) {
  currentDepot = index;
  const depot = SETTLEMENTS[index];
  const near = dist2(state.player, depot) < 25;
  ui.jobTitle.textContent = depot.name;
  ui.jobCopy.textContent = near ? 'Choose a load, then tune the truck for the ground ahead.' : 'Drive closer to the depot to load a route.';
  ui.jobList.replaceChildren();
  for (const job of JOBS.filter((j) => j.from === index)) {
    const complete = !!save.completed[job.id];
    const unlocked = jobUnlocked(job);
    const ready = near && !state.currentJob && unlocked;
    const card = document.createElement('button');
    card.className = 'job-card' + (ready ? ' ready' : '') + (complete ? ' done' : '') + (!unlocked ? ' locked' : '');
    card.disabled = !ready;
    const pips = '<span class="difficulty-pips" aria-label="Tier ' + job.difficulty + '">' + [1, 2, 3, 4, 5, 6].map((pip) => '<i class="' + (pip <= job.difficulty ? 'on' : '') + '"></i>').join('') + '</span>';
    const status = !unlocked ? 'Unlocks after ' + Math.max(1, (job.difficulty - 1) * 2 - 1) + ' runs' : complete ? 'REPEATABLE CONTRACT' : 'NEW ROUTE';
    card.innerHTML = '<span class="job-main"><span class="route-preview route-' + job.difficulty + '"><i></i><i></i><i></i></span><span><span class="job-name">' + job.cargo + '  →  ' + SETTLEMENTS[job.to].name + '</span><span class="job-detail">' + job.tip + '  ·  ' + status + '</span>' + pips + '</span></span><span class="job-pay">' + money(job.pay) + '</span>';
    card.addEventListener('click', () => takeJob(job));
    ui.jobList.appendChild(card);
  }
  for (const button of document.querySelectorAll('#tireChoices .choice, #garageTireChoices .choice')) button.classList.toggle('selected', button.dataset.tire === save.tire);
}

function openJobBoard(index) {
  if (mode !== 'drive') return;
  renderJobBoard(index);
  sfx('open', { volume: .65 });
  kit.pause('jobPanel');
  ui.jobPanel.style.display = 'flex';
}

function takeJob(job) {
  if (state.currentJob || !jobUnlocked(job) || dist2(state.player, SETTLEMENTS[job.from]) >= 25) return;
  state.currentJob = job.id;
  state.tripDistance = 0;
  persist();
  sfx('confirm', { volume: .8 });
  closePanel('jobPanel');
  toast('Loaded ' + job.cargo.toLowerCase() + '. Roll to ' + SETTLEMENTS[job.to].name + '.', 3);
}

function openGarage() {
  const depot = nearestSettlement();
  if (!depot) { toast('Garage tuning happens at a depot.'); return; }
  sfx('open', { volume: .55 });
  updateGarageUI();
  kit.pause('garagePanel');
  ui.garagePanel.style.display = 'flex';
}

function updateGarageUI() {
  ui.diff.classList.toggle('selected', save.diffLock);
  ui.diff.querySelector('small').textContent = save.diffLock ? 'On: more low-speed traction' : 'Off: free-rolling on firm trail';
  for (const button of document.querySelectorAll('#garageTireChoices .choice')) button.classList.toggle('selected', button.dataset.tire === save.tire);
  for (const button of document.querySelectorAll('#liveryChoices .choice')) button.classList.toggle('selected', button.dataset.livery === save.livery);
  const pull = 34 + save.upgrade * 22;
  const recovery = 22 + save.upgrade * 24;
  document.getElementById('garageTruckIcon').style.background = '#' + LIVERIES[save.livery].color.toString(16).padStart(6, '0');
  document.getElementById('pullStat').style.width = pull + '%';
  document.getElementById('recoveryStat').style.width = recovery + '%';
  document.getElementById('garagePreviewCopy').textContent = save.upgrade ? 'Torque Kit ' + save.upgrade + ' field tune' : 'Stock field tune';
  if (save.upgrade >= 3) {
    ui.upgrade.querySelector('b').textContent = 'TORQUE KIT MAX';
    ui.upgrade.querySelector('small').textContent = 'Maximum field tune installed';
    ui.upgrade.disabled = true;
  } else {
    const price = 180 + save.upgrade * 120;
    ui.upgrade.querySelector('b').textContent = 'TORQUE KIT ' + (save.upgrade + 1);
    ui.upgrade.querySelector('small').textContent = money(price) + '  ·  +' + (12 + save.upgrade * 3) + '% pull  ·  cheaper recovery';
    ui.upgrade.disabled = save.cash < price;
  }
}

function closePanel(id) {
  const panel = document.getElementById(id);
  if (panel) panel.style.display = 'none';
  kit.resume(id);
  sfx('back', { volume: .35 });
}

function toggleDiffLock() {
  save.diffLock = !save.diffLock;
  persist();
  updateGarageUI();
  sfx('select', { volume: .65 });
  toast(save.diffLock ? 'Diff-lock on. Crawl with intent.' : 'Diff-lock off. The truck rolls free.');
}

function chooseTire(tire) {
  if (!TIRES[tire]) return;
  save.tire = tire;
  persist();
  updateGarageUI();
  for (const button of document.querySelectorAll('#tireChoices .choice, #garageTireChoices .choice')) button.classList.toggle('selected', button.dataset.tire === save.tire);
  updateUI();
  sfx('select', { volume: .65 });
  toast(TIRES[tire].label + ' tires mounted.');
}

function chooseLivery(livery) {
  if (!LIVERIES[livery]) return;
  save.livery = livery;
  persist();
  setVehicleLivery();
  updateGarageUI();
  sfx('select', { volume: .65 });
  toast(LIVERIES[livery].name + ' livery applied.');
}

function buyUpgrade() {
  if (save.upgrade >= 3) return;
  const price = 180 + save.upgrade * 120;
  if (save.cash < price) { toast('Not enough payout saved for this tune.'); return; }
  save.cash -= price;
  save.upgrade += 1;
  persist();
  updateGarageUI();
  updateUI();
  sfx('confirm', { volume: .9 });
  burst(state.player.x, state.player.z, 0x76d7bd);
  toast('Torque Kit ' + save.upgrade + ' installed.');
}

function syncSettingsUI() {
  if (!ui.musicVolume) return;
  ui.musicVolume.value = String(Math.round(kit.audio.prefs.music * 100));
  ui.sfxVolume.value = String(Math.round(kit.audio.prefs.sfx * 100));
  ui.shakeToggle.textContent = kit.juice.enabled ? 'Screen shake: On' : 'Screen shake: Off';
  ui.reducedToggle.textContent = save.reducedMotion ? 'Reduced motion: On' : 'Reduced motion: Off';
  ui.shakeToggle.setAttribute('aria-pressed', String(kit.juice.enabled));
  ui.reducedToggle.setAttribute('aria-pressed', String(save.reducedMotion));
}

function openSettingsPanel() {
  if (ui.settingsPanel) {
    syncSettingsUI();
    kit.pause('settings');
    ui.settingsPanel.style.display = 'flex';
  }
}

function closeSettingsPanel() {
  if (!ui.settingsPanel) return;
  ui.settingsPanel.style.display = 'none';
  kit.resume('settings');
}

function manualPause() {
  if (mode !== 'drive' || kit.paused) return;
  sfx('click', { volume: .55 });
  kit.pause('manual');
  ui.pausePanel.style.display = 'flex';
}

function manualResume() {
  ui.pausePanel.style.display = 'none';
  kit.resume('manual');
  sfx('click', { volume: .55 });
}

function returnToTitle() {
  ui.pausePanel.style.display = 'none';
  kit.resume('manual');
  persist();
  kit.audio.music('menu', 500);
  applyMode('title');
}

function handleCanvasClick(event) {
  if (mode !== 'drive' || kit.paused) return;
  const rect = sceneCanvas.getBoundingClientRect();
  const pointer = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(world.children, true);
  for (const hit of hits) {
    const object = hit.object;
    if (object.userData.settlementId != null) {
      const index = object.userData.settlementId;
      if (dist2(state.player, SETTLEMENTS[index]) < 25) openJobBoard(index);
      else toast('Drive within the depot ring to open its board.');
      return;
    }
    if (object.userData.anchor && state.bogged) { deployWinch(); return; }
  }
}

function resize() {
  const width = Math.max(320, window.innerWidth);
  const height = Math.max(240, window.innerHeight);
  const pixelRatio = Math.min(1.5, window.devicePixelRatio || 1, 1280 / width);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  hudCanvas.width = Math.max(1, Math.floor(width * Math.min(pixelRatio, 1.25)));
  hudCanvas.height = Math.max(1, Math.floor(height * Math.min(pixelRatio, 1.25)));
  measureControls();
}

function measureControls() {
  const throttleRect = ui.throttleTrack.getBoundingClientRect();
  const steerRect = ui.steerTrack.getBoundingClientRect();
  if (throttleRect.width > 1 && throttleRect.height > 1) {
    controlRects.throttle.x = throttleRect.left;
    controlRects.throttle.y = throttleRect.top;
    controlRects.throttle.w = throttleRect.width;
    controlRects.throttle.h = throttleRect.height;
  }
  if (steerRect.width > 1 && steerRect.height > 1) {
    controlRects.steer.x = steerRect.left;
    controlRects.steer.y = steerRect.top;
    controlRects.steer.w = steerRect.width;
    controlRects.steer.h = steerRect.height;
  }
}

function setupInteractions() {
  ui.start.addEventListener('click', () => {
    ensureAudio(true);
    applyMode('drive');
    sfx('confirm', { volume: .8 });
  });
  ui.titleSettings.addEventListener('click', openSettingsPanel);
  ui.pause.addEventListener('click', manualPause);
  ui.settings.addEventListener('click', openSettingsPanel);
  ui.garage.addEventListener('click', openGarage);
  ui.winch.addEventListener('click', deployWinch);
  ui.recover.addEventListener('click', recover);
  ui.diff.addEventListener('click', toggleDiffLock);
  ui.upgrade.addEventListener('click', buyUpgrade);
  ui.jobGarage.addEventListener('click', () => { closePanel('jobPanel'); openGarage(); });
  ui.resume.addEventListener('click', manualResume);
  ui.pauseRestart.addEventListener('click', () => { kit.restart(); manualResume(); });
  ui.pauseSettings.addEventListener('click', openSettingsPanel);
  ui.quit.addEventListener('click', returnToTitle);
  if (ui.settingsPanel) {
    document.getElementById('settingsCloseButton').addEventListener('click', closeSettingsPanel);
    ui.musicVolume.addEventListener('input', () => kit.audio.setMusicVolume(Number(ui.musicVolume.value) / 100));
    ui.sfxVolume.addEventListener('input', () => kit.audio.setSfxVolume(Number(ui.sfxVolume.value) / 100));
  ui.shakeToggle.addEventListener('click', () => { kit.juice.enabled = !kit.juice.enabled; save.screenShake = kit.juice.enabled; persist(); syncSettingsUI(); });
    ui.reducedToggle.addEventListener('click', () => { save.reducedMotion = !save.reducedMotion; persist(); syncSettingsUI(); });
  }
  for (const button of document.querySelectorAll('[data-close]')) button.addEventListener('click', () => closePanel(button.dataset.close));
  for (const button of document.querySelectorAll('[data-tire]')) button.addEventListener('click', () => chooseTire(button.dataset.tire));
  for (const button of document.querySelectorAll('[data-livery]')) button.addEventListener('click', () => chooseLivery(button.dataset.livery));
  sceneCanvas.addEventListener('click', handleCanvasClick);
  ui.throttle.addEventListener('pointerdown', (event) => claimControl(event, 'throttle', ui.throttle));
  ui.steer.addEventListener('pointerdown', (event) => claimControl(event, 'steer', ui.steer));
  ui.throttle.addEventListener('lostpointercapture', releaseControl);
  ui.steer.addEventListener('lostpointercapture', releaseControl);
  window.addEventListener('pointerup', releaseControl, { passive: true });
  window.addEventListener('pointercancel', releaseControl, { passive: true });
  window.addEventListener('blur', clearClaimedControls, { passive: true });
  ui.tutorial.addEventListener('click', () => { if (tutorial.step === 0 && mode === 'drive' && !kit.paused) openJobBoard(0); });
  window.addEventListener('keydown', (event) => {
    if (event.code === 'Escape') {
      if (ui.settingsPanel.style.display === 'flex') closeSettingsPanel();
      else if (ui.jobPanel.style.display === 'flex') closePanel('jobPanel');
      else if (ui.garagePanel.style.display === 'flex') closePanel('garagePanel');
      else if (mode === 'drive' && !kit.paused) manualPause();
      else if (kit.paused && pausedReason === 'manual') manualResume();
    }
    if (event.code === 'Enter' && mode === 'title') { ensureAudio(true); applyMode('drive'); }
    if ((event.code === 'KeyW' || event.code === 'Space' || event.code === 'Enter') && state.bogged && !kit.paused) deployWinch();
    if (event.code === 'KeyR' && state.bogged && !kit.paused) recover();
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
  }, { passive: false });
  window.addEventListener('pointerdown', () => { if (mode === 'title') ensureAudio(false); }, { passive: true });
  window.addEventListener('keydown', () => { if (mode === 'title') ensureAudio(false); }, { passive: true });
  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('orientationchange', resize, { passive: true });
  window.addEventListener('beforeunload', persist);
  window.addEventListener('pagehide', persist);
  document.addEventListener('contextmenu', (e) => e.preventDefault());
}

async function boot() {
  kit.loader.show('Torque Trail');
  if (ui.loading) { ui.loading.style.display = 'flex'; ui.loadingStage.textContent = 'Calibrating the field map'; ui.loadingBar.style.width = '8%'; }
  kit.loader.progress(.08);
  await new Promise((resolve) => requestAnimationFrame(resolve));
  buildWorld();
  if (ui.loading) { ui.loadingStage.textContent = 'Painting mud, stone, and ridge routes'; ui.loadingBar.style.width = '34%'; }
  kit.loader.progress(.34);
  rawVehicle = await loadVehicleRaw();
  if (ui.loading) { ui.loadingStage.textContent = 'Fitting the field truck'; ui.loadingBar.style.width = '58%'; }
  kit.loader.progress(.58);
  vehicle = buildVehicle(rawVehicle);
  world.add(vehicle.root);
  winchLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xf4ce65, transparent: true, opacity: .85, depthWrite: false }));
  winchLine.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(27), 3));
  winchLine.visible = false;
  world.add(winchLine);
  dust = new PointPool(120, .7, -2.7, 0xc4a266);
  sparks = new PointPool(90, .34, -8.5, 0xf4ce65);
  mudSpray = new PointPool(64, .46, -5.6, 0x6e4633);
  gravel = new PointPool(64, .28, -9.5, 0xd0bc91);
  wetSpray = new PointPool(64, .34, -3.4, 0x63d2cc);
  celebration = new PointPool(72, .38, -4.8, 0xf4ce65);
  world.add(dust.points, sparks.points, mudSpray.points, gravel.points, wetSpray.points, celebration.points);
  if (ui.loading) { ui.loadingStage.textContent = 'Warming the trail'; ui.loadingBar.style.width = '70%'; }
  kit.loader.progress(.7);
  // GGKit keeps audio lazy. Decoding the whole SFX bank during boot created
  // avoidable first-seconds stalls on throttled mobile CPUs.
  kit.loader.progress(.78);
  resize();
  camera.position.set(0, 120, 240);
  camera.lookAt(0, 0, 0);
  try { renderer.compile(scene, camera); } catch (_) {}
  if (ui.loading) { ui.loadingStage.textContent = 'Ready to haul'; ui.loadingBar.style.width = '100%'; }
  kit.loader.progress(1);
  await new Promise((resolve) => setTimeout(resolve, 80));
  kit.loader.hide();
  if (ui.loading) ui.loading.style.display = 'none';
  setupInteractions();
  applyMode('title');
}

function frame(now) {
  const dt = Math.min(.05, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  worldClock += dt;
  uiClock += dt;
  if (messageClock > 0 && (messageClock -= dt) <= 0) ui.message.classList.remove('show');
  if (payoutClock > 0) payoutClock = Math.max(0, payoutClock - dt);
  const juice = kit.juice.frame();
  if (!kit.paused && !juice.frozen) {
    if (mode === 'drive') updateSimulation(dt);
    updateVehicle(dt);
    if (mode === 'drive') {
      if (dust) dust.update(dt);
      if (sparks) sparks.update(dt);
      if (mudSpray) mudSpray.update(dt);
      if (gravel) gravel.update(dt);
      if (wetSpray) wetSpray.update(dt);
      if (celebration) celebration.update(dt);
    }
    updateWorldVisuals(dt);
  }
  updateCamera(dt, juice);
  updateUI();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

updateTitleMeta();
requestAnimationFrame(frame);
boot().catch(() => {
  kit.loader.progress(1);
  kit.loader.hide();
  if (ui.loading) ui.loading.style.display = 'none';
  toast('The field map could not load. Reload to try again.', 6);
});
