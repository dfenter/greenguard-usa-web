import * as THREE from 'three';

const canvas = document.getElementById('scene');
const ui = {
  gold: document.getElementById('gold-value'),
  hull: document.getElementById('hull-value'),
  cargo: document.getElementById('cargo-value'),
  time: document.getElementById('voyage-time'),
  windArrow: document.getElementById('wind-arrow'),
  windReadout: document.getElementById('wind-readout'),
  windMeter: document.querySelector('#wind-meter > span'),
  coach: document.getElementById('coach'),
  routeStatus: document.getElementById('route-status'),
  routePanel: document.getElementById('route-panel'),
  routeToggle: document.getElementById('route-toggle'),
  regionName: document.getElementById('region-name'),
  routeLeg: document.getElementById('route-leg'),
  trimControl: document.getElementById('trim-control'),
  trimNeedle: document.getElementById('trim-needle'),
  trimKnob: document.getElementById('trim-knob'),
  speed: document.getElementById('speed-readout'),
  pauseButton: document.getElementById('pause-button'),
  contractList: document.getElementById('contract-list'),
  titlePanel: document.getElementById('title-panel'),
  dockPanel: document.getElementById('dock-panel'),
  dockName: document.getElementById('dock-name'),
  dockSub: document.getElementById('dock-sub'),
  tradeTable: document.getElementById('trade-table'),
  upgradeCopy: document.getElementById('upgrade-copy'),
  upgradeButton: document.getElementById('upgrade-button'),
  banner: document.getElementById('banner'),
};
const TAU = Math.PI * 2;
const STEP = 1 / 60;
const WORLD = 2800;
const COLORS = {
  ink: 0x092331,
  paper: 0xf4efd9,
  foam: 0xb9eee6,
  gold: 0xf4c66d,
  coral: 0xed806e,
  teal: 0x4fd0b6,
  storm: 0xa9b7dc,
};
const GOODS = [
  { id: 'moonkelp', name: 'Moonkelp', base: 24, color: 0x62d5b7 },
  { id: 'sunspice', name: 'Sunspice', base: 38, color: 0xf2bd63 },
  { id: 'brineglass', name: 'Brineglass', base: 58, color: 0x8ec9f4 },
  { id: 'emberroot', name: 'Emberroot', base: 82, color: 0xee8270 },
];
const HULL_FAMILY = [
  { name: 'CUTTER', capacity: 12, speed: 1, length: 30, beam: 9, hull: 0x9a4c4b, deck: 0xf0d39a, sail: 0xf2e4bd },
  { name: 'SLOOP', capacity: 18, speed: 1.12, length: 36, beam: 11, hull: 0x3d7e86, deck: 0xf0d39a, sail: 0xf0d8a4 },
  { name: 'BRIGANTINE', capacity: 25, speed: 1.2, length: 43, beam: 13, hull: 0x5f5d87, deck: 0xdcbf86, sail: 0xe9d7bd },
  { name: 'FLAGSHIP', capacity: 34, speed: 1.3, length: 51, beam: 16, hull: 0x244c69, deck: 0xf3cc72, sail: 0xd9eff0 },
];
const REGION_FAMILY = [
  {
    id: 'lumen', name: 'LUMEN COAST', copy: 'Harbor town coast. Lighthouse point and a south shortcut channel.',
    center: { x: -900, z: -560 }, dock: { x: -790, z: -525 }, hue: 0xc9b878, landmark: 'lighthouse', seed: 11,
    bias: [0.72, 1.42, 0.86, 0.68], shortcut: [{ x: -1070, z: -730 }, { x: -930, z: -805 }, { x: -730, z: -790 }, { x: -620, z: -680 }],
    reefs: [{ x: -1030, z: -430, r: 40 }, { x: -600, z: -420, r: 35 }, { x: -970, z: -870, r: 32 }],
  },
  {
    id: 'gale', name: 'GALE STRAITS', copy: 'Storm-lashed straits. A wreck marks the narrow reef shortcut.',
    center: { x: -260, z: -720 }, dock: { x: -170, z: -760 }, hue: 0x756f99, landmark: 'wreck', seed: 23,
    bias: [1.36, 0.8, 0.68, 1.5], shortcut: [{ x: -450, z: -850 }, { x: -320, z: -970 }, { x: -120, z: -1010 }, { x: 40, z: -900 }],
    reefs: [{ x: -470, z: -620, r: 45 }, { x: 10, z: -670, r: 42 }, { x: -330, z: -1020, r: 37 }, { x: 160, z: -870, r: 36 }],
  },
  {
    id: 'sunken', name: 'SUNKEN ARCHIPELAGO', copy: 'Reef archipelago. The floating market hides the east channel shortcut.',
    center: { x: 430, z: -220 }, dock: { x: 500, z: -170 }, hue: 0xc68f72, landmark: 'market', seed: 37,
    bias: [1.25, 0.7, 1.48, 0.8], shortcut: [{ x: 280, z: -420 }, { x: 430, z: -520 }, { x: 650, z: -490 }, { x: 790, z: -340 }],
    reefs: [{ x: 210, z: -190, r: 38 }, { x: 350, z: 20, r: 34 }, { x: 710, z: -80, r: 43 }, { x: 800, z: -500, r: 36 }],
  },
  {
    id: 'bluewater', name: 'BLUEWATER LANE', copy: 'Open ocean trade lane. Chase the broad wind lane past the trade beacon.',
    center: { x: 720, z: 540 }, dock: { x: 660, z: 510 }, hue: 0x759c84, landmark: 'beacon', seed: 51,
    bias: [0.68, 1.38, 0.88, 1.42], shortcut: [{ x: 460, z: 660 }, { x: 610, z: 780 }, { x: 850, z: 770 }, { x: 1020, z: 620 }],
    reefs: [{ x: 470, z: 420, r: 34 }, { x: 930, z: 360, r: 38 }, { x: 960, z: 770, r: 38 }],
  },
];
const ROUTE_FAMILY = {
  coastal: { id: 'coastal', name: 'COASTAL RUN', docks: [0, 2, 0], reward: 300, thresholds: [{ profit: 250, time: 120 }, { profit: 450, time: 95 }, { profit: 700, time: 75 }] },
  deep: { id: 'deep', name: 'DEEP TRADE', docks: [0, 1, 2, 3, 0], reward: 720, thresholds: [{ profit: 600, time: 260 }, { profit: 1000, time: 210 }, { profit: 1500, time: 175 }] },
  rush: { id: 'rush', name: 'CARGO RUSH', docks: [3, 1], reward: 1100, thresholds: [{ profit: 700, time: 100 }, { profit: 1150, time: 80 }, { profit: 1800, time: 65 }] },
};
const CONTRACT_FAMILY = [
  { id: 'sales', name: 'HARBOR LEDGER', copy: 'Sell 8 cargo stacks across the coast.', target: 8, reward: 260 },
  { id: 'caches', name: 'CACHE CARTOGRAPHER', copy: 'Recover 6 gold caches from open water.', target: 6, reward: 420 },
  { id: 'storms', name: 'SQUALL RUNNER', copy: 'Enter 4 storm cells and ride the boost.', target: 4, reward: 520 },
  { id: 'glides', name: 'MASTER OF THE TIDE', copy: 'Earn 6 clean glide docking bonuses.', target: 6, reward: 620 },
  { id: 'routes', name: 'CHARTED WATERS', copy: 'Complete 2 route circuits.', target: 2, reward: 780 },
  { id: 'upgrades', name: 'SHIPWRIGHT PARTNER', copy: 'Fit 2 hull upgrades.', target: 2, reward: 900 },
];
const SFX_NAMES = ['trim', 'dock', 'buy', 'sell', 'reef', 'cache', 'boost', 'upgrade', 'victory'];
const START = { x: -910, z: -650 };

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function damp(a, b, lambda, dt) { return lerp(a, b, 1 - Math.exp(-lambda * dt)); }
function wrapAngle(angle) {
  if (!Number.isFinite(angle)) return 0;
  return ((angle + Math.PI) % TAU + TAU) % TAU - Math.PI;
}
function distanceXZ(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
function fmtGold(value) { return Math.max(0, Math.floor(value)).toLocaleString(); }
function formatTime(seconds) { const s = Math.max(0, Math.floor(seconds)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }
function setTextIfChanged(node, value) { const text = String(value); if (node && node.textContent !== text) node.textContent = text; }
function color(value) { return new THREE.Color(value); }
function regionById(id) { return REGION_FAMILY.find((region) => region.id === id) || REGION_FAMILY[0]; }
function routeById(id) { return ROUTE_FAMILY[id] || ROUTE_FAMILY.coastal; }
function hullByLevel(level) { return HULL_FAMILY[clamp(Math.floor(Number(level) || 0), 0, HULL_FAMILY.length - 1)] || HULL_FAMILY[0]; }
function cargoCount() { return state.cargo.reduce((total, amount) => total + amount, 0); }
function capacity() { return hullByLevel(state.hull).capacity; }
function volatility() { return clamp(0.08 + state.gold / 12000 * 0.24, 0.08, 0.32); }
function marketLabel() { return volatility() > .23 ? 'WILD' : volatility() > .15 ? 'SHIFTING' : 'CALM'; }

function hasRoute(id) { return Object.prototype.hasOwnProperty.call(ROUTE_FAMILY, id); }
function contractById(id) { return CONTRACT_FAMILY.find((contract) => contract.id === id) || null; }
function freshContracts() {
  return Object.fromEntries(CONTRACT_FAMILY.map((contract) => [contract.id, { progress: 0, claimed: false }]));
}
function validContracts(contracts) {
  if (!contracts || typeof contracts !== 'object' || Array.isArray(contracts)) return false;
  if (Object.keys(contracts).length !== CONTRACT_FAMILY.length) return false;
  return CONTRACT_FAMILY.every((contract) => {
    const entry = contracts[contract.id];
    return !!entry && Number.isSafeInteger(entry.progress) && entry.progress >= 0 && entry.progress <= contract.target && typeof entry.claimed === 'boolean';
  });
}
function validRouteRun(run) {
  if (run == null) return true;
  if (!run || typeof run !== 'object' || !hasRoute(run.id)) return false;
  const route = ROUTE_FAMILY[run.id];
  return Number.isSafeInteger(run.legIndex) && run.legIndex >= 0 && run.legIndex < route.docks.length &&
    Number.isFinite(run.startedAt) && run.startedAt >= 0 && Number.isFinite(run.startGold) && run.startGold >= 0 &&
    Number.isFinite(run.tradeProfit) && Math.abs(run.tradeProfit) <= 100000000 &&
    Number.isSafeInteger(run.deliveryRemaining) && run.deliveryRemaining >= 0 && run.deliveryRemaining <= 4;
}

function validSave(save) {
  if (!save || save.v !== 3 || !Number.isSafeInteger(save.gold) || save.gold < 0 || save.gold > 100000000 ||
    !Number.isSafeInteger(save.hull) || save.hull < 0 || save.hull >= HULL_FAMILY.length ||
    !Array.isArray(save.cargo) || save.cargo.length !== GOODS.length ||
    !Number.isSafeInteger(save.bestGold) || save.bestGold < save.gold || save.bestGold > 100000000 ||
    !Number.isFinite(save.simTime) || save.simTime < 0 || save.simTime > 10000000 ||
    !REGION_FAMILY.some((region) => region.id === save.region) || !validRouteRun(save.activeRoute) ||
    (save.contracts !== undefined && !validContracts(save.contracts)) ||
    (save.victory !== undefined && typeof save.victory !== 'boolean') ||
    (save.rng !== undefined && (!Number.isSafeInteger(save.rng) || save.rng < 0 || save.rng > 0xffffffff))) return false;
  const saveCapacity = HULL_FAMILY[save.hull].capacity;
  if (save.cargo.some((amount) => !Number.isSafeInteger(amount) || amount < 0 || amount > saveCapacity)) return false;
  if (save.cargo.reduce((total, amount) => total + amount, 0) > saveCapacity) return false;
  if (!save.routeMedals || typeof save.routeMedals !== 'object' || Array.isArray(save.routeMedals)) return false;
  if (Object.keys(save.routeMedals).length !== Object.keys(ROUTE_FAMILY).length || !Object.keys(ROUTE_FAMILY).every((id) => Number.isSafeInteger(save.routeMedals[id]) && save.routeMedals[id] >= 0 && save.routeMedals[id] <= 3)) return false;
  if (!save.vessel || typeof save.vessel !== 'object' ||
    !Number.isFinite(save.vessel.x) || !Number.isFinite(save.vessel.z) ||
    Math.abs(save.vessel.x) > WORLD / 2 || Math.abs(save.vessel.z) > WORLD / 2 ||
    !Number.isFinite(save.vessel.heading) || Math.abs(save.vessel.heading) > TAU ||
    !Number.isFinite(save.vessel.targetHeading) || Math.abs(save.vessel.targetHeading) > TAU ||
    !Number.isFinite(save.vessel.trim) || Math.abs(save.vessel.trim) > 1.45) return false;
  if (save.caches !== undefined && (!Array.isArray(save.caches) || save.caches.length !== 12 || save.caches.some((value) => typeof value !== 'boolean'))) return false;
  if (save.crates !== undefined && (!Array.isArray(save.crates) || save.crates.length !== 8 || save.crates.some((value) => typeof value !== 'boolean'))) return false;
  return true;
}

const kit = window.GGKit.create({
  slug: 'tide-harbor',
  orientation: 'landscape',
  validateSave: validSave,
  onPause() { if (titleStarted) setCoach('PAUSED · PRESS RESUME'); paintPauseButton(); },
  onResume() { if (state.tutorialStage < 5) setTutorial(tutorialMessage()); else setCoach('SAILING'); paintPauseButton(); },
  onRestart() { resetGame(); },
});
kit.loader.show('TIDE HARBOR');
kit.loader.progress(0.08);
kit.audio.register({
  wind: './assets/wind.mp3',
  market: './assets/market.mp3',
  creak: './assets/creak.mp3',
  gulls: './assets/gulls.mp3',
  storm: './assets/storm.mp3',
  trim: './assets/trim.mp3',
  dock: './assets/dock.mp3',
  buy: './assets/buy.mp3',
  sell: './assets/sell.mp3',
  reef: './assets/reef.mp3',
  cache: './assets/cache.mp3',
  boost: './assets/boost.mp3',
  upgrade: './assets/upgrade.mp3',
  victory: './assets/victory.mp3',
});

let state = freshState();
let vessel = freshVessel();
let routeRun = null;
let dockIndex = -1;
let dockRenderKey = '';
let contractRenderKey = '';
let simTime = 0;
let transientQueue = [];
let activeTransient = null;
let stormFlash = 0;
let audioStarted = false;
let firstFrame = true;
let scene;
let camera;
let renderer;
let ocean;
let boatRoot;
let boatShadow;
let boatLevels = [];
let boatLevelVisuals = [];
let waterUniforms;
let windArrows = [];
let stormVisuals = [];
let rainMeshes = [];
let rainStates = [];
let wakeMeshes = [];
let wakeStates = [];
let sprayMeshes = [];
let sprayStates = [];
let wakeCursor = 0;
let sprayCursor = 0;
let wakeAccumulator = 0;
let sprayAccumulator = 0;
let worldGroup;
let regionsVisual = [];
let docks = [];
let reefs = [];
let windLanes = [];
let pickups = { caches: [], crates: [] };
let groundPlane;
let raycaster;
let cameraGoal = new THREE.Vector3();
let cameraLook = new THREE.Vector3();
let frameLast = 0;
let accumulator = 0;
let resizeTimer = 0;
let reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
let booted = false;
let titleStarted = false;
let trimSfxCooldown = 0;
let cameraDip = 0;
let cameraDipVelocity = 0;
let boatPulse = 0;
let boatPulseVelocity = 0;
let contactAccent = 0;
let contactAccentScale = 1;
let contactRing;
let contactRingMaterial;

function freshState() {
  return {
    v: 3,
    mode: 'sailing',
    gold: 240,
    hull: 0,
    cargo: GOODS.map(() => 0),
    region: 'lumen',
    bestGold: 240,
    routeMedals: { coastal: 0, deep: 0, rush: 0 },
    activeRoute: null,
    contracts: freshContracts(),
    tutorialStage: 0,
    victory: false,
    rng: 0x7f4a7c15,
    inStorm: false,
    boost: false,
  };
}

function freshVessel() {
  return { x: START.x, z: START.z, heading: 0.22, targetHeading: 0.22, trim: 0.22, speed: 0, heel: 0, pitch: 0, stormClock: 0, wakeClock: 0, boostTimer: 0, dockQuality: 0, impactCooldown: 0 };
}

function nextSimRandom() {
  state.rng = (Math.imul(state.rng, 1664525) + 1013904223) >>> 0;
  return state.rng / 0x100000000;
}

function vesselVisualState() {
  if (dockIndex >= 0) return 'DOCKED';
  if (vessel.boostTimer > 0) return 'BOOST';
  if (state.inStorm) return 'STORM RUN';
  if (vessel.speed < 2) return 'IDLE';
  return 'SAILING';
}

function tutorialMessage() {
  return [
    '1/5 · TAP WATER TO STEER',
    '2/5 · DRAG TRIM FOR SPEED',
    '3/5 · GLIDE SLOWLY INTO A DOCK',
    '4/5 · BUY A CARGO STACK',
    '5/5 · SELL A CARGO STACK',
    'TUTORIAL COMPLETE · SAIL FOR ROUTES, CACHES, CONTRACTS',
  ][clamp(state.tutorialStage, 0, 5)];
}

function advanceTutorial(stage) {
  if (state.tutorialStage < stage) {
    state.tutorialStage = stage;
    setTutorial(tutorialMessage());
    saveGame();
  }
}

function progressContract(id, amount = 1) {
  const entry = state.contracts && state.contracts[id];
  const contract = contractById(id);
  if (!entry || !contract || entry.claimed) return;
  entry.progress = clamp(entry.progress + amount, 0, contract.target);
}

function claimContract(id) {
  const contract = contractById(id);
  const entry = state.contracts && state.contracts[id];
  if (!contract || !entry || entry.claimed || entry.progress < contract.target) return;
  entry.claimed = true;
  state.gold += contract.reward;
  state.bestGold = Math.max(state.bestGold, state.gold);
  setBanner(contract.name + ' CLAIMED +' + contract.reward + 'G', 'good', 1);
  kit.audio.sfx('cache', { volume: .58, rate: 1.18 });
  saveGame();
  updateUI();
}

function saveGame() {
  state.bestGold = Math.max(state.bestGold, state.gold);
  kit.save.set({
    v: 3, gold: state.gold, hull: state.hull, cargo: state.cargo.slice(), region: state.region,
    bestGold: state.bestGold, routeMedals: { ...state.routeMedals }, simTime,
    activeRoute: routeRun ? { ...routeRun } : null, contracts: JSON.parse(JSON.stringify(state.contracts)),
    tutorialStage: state.tutorialStage, victory: !!state.victory, rng: state.rng,
    vessel: { x: vessel.x, z: vessel.z, heading: vessel.heading, targetHeading: vessel.targetHeading, trim: vessel.trim },
    caches: pickups.caches.map((pickup) => pickup.collected), crates: pickups.crates.map((pickup) => pickup.collected),
  });
}

function loadGame() {
  const save = kit.save.get(null);
  if (!validSave(save)) return;
  state.gold = Math.max(0, Math.floor(save.gold));
  state.hull = clamp(Math.floor(save.hull), 0, HULL_FAMILY.length - 1);
  state.cargo = GOODS.map((_, index) => clamp(Math.floor(Number(save.cargo[index]) || 0), 0, capacity()));
  state.region = regionById(save.region).id;
  state.bestGold = Math.max(state.gold, Math.floor(save.bestGold || state.gold));
  state.routeMedals = { ...state.routeMedals, ...(save.routeMedals || {}) };
  simTime = Math.max(0, Number(save.simTime) || 0);
  routeRun = save.activeRoute ? { ...save.activeRoute } : null;
  state.contracts = save.contracts ? JSON.parse(JSON.stringify(save.contracts)) : freshContracts();
  state.tutorialStage = clamp(Number.isSafeInteger(save.tutorialStage) ? save.tutorialStage : 0, 0, 5);
  state.victory = save.victory === true;
  state.rng = Number.isSafeInteger(save.rng) ? save.rng >>> 0 : state.rng;
  if (save.vessel && Number.isFinite(save.vessel.x) && Number.isFinite(save.vessel.z)) {
    vessel.x = clamp(save.vessel.x, -WORLD / 2 + 40, WORLD / 2 - 40);
    vessel.z = clamp(save.vessel.z, -WORLD / 2 + 40, WORLD / 2 - 40);
    vessel.heading = Number.isFinite(save.vessel.heading) ? wrapAngle(save.vessel.heading) : vessel.heading;
    vessel.targetHeading = Number.isFinite(save.vessel.targetHeading) ? wrapAngle(save.vessel.targetHeading) : vessel.heading;
    vessel.trim = clamp(Number.isFinite(save.vessel.trim) ? save.vessel.trim : vessel.trim, -1.45, 1.45);
  }
  pickups.caches.forEach((pickup, index) => { pickup.collected = !!(save.caches && save.caches[index]); });
  pickups.crates.forEach((pickup, index) => { pickup.collected = !!(save.crates && save.crates[index]); });
  if (state.tutorialStage < 5) setTutorial(tutorialMessage()); else setCoach('VOYAGE RESTORED · SAIL TO A DOCK');
}

function resetGame() {
  kit.input.clearAll();
  state = freshState();
  probe.state = state;
  vessel = freshVessel();
  routeRun = null;
  dockIndex = -1;
  simTime = 0;
  accumulator = 0;
  state.mode = 'sailing';
  state.victory = false;
  state.contracts = freshContracts();
  state.tutorialStage = 0;
  state.rng = 0x7f4a7c15;
  dockRenderKey = '';
  contractRenderKey = '';
  pickups.caches.forEach((pickup) => { pickup.collected = false; });
  pickups.crates.forEach((pickup) => { pickup.collected = false; });
  if (ui.dockPanel) ui.dockPanel.classList.add('hidden');
  setBanner('FRESH TIDE', 'good', 1);
  kit.audio.music('wind', 500);
  setTutorial(tutorialMessage());
  saveGame();
}

function syncProbe() {
  probe.state = state;
  state.region = currentRegion().id;
  state.mode = dockIndex >= 0 ? 'docked' : state.victory ? 'victory' : 'sailing';
  state.inStorm = !!activeStormForVessel();
  state.boost = vessel.boostTimer > 0;
}

const probe = {
  state,
  forceEvent: false,
  forceStorm: false,
  triggerEvent(type) { forceEvent(type || 'cache'); },
};
window.__th = probe;

function currentRegion() {
  let best = REGION_FAMILY[0];
  let bestDistance = Infinity;
  REGION_FAMILY.forEach((region) => {
    const d = Math.hypot(vessel.x - region.center.x, vessel.z - region.center.z);
    if (d < bestDistance) { bestDistance = d; best = region; }
  });
  return best || REGION_FAMILY[0];
}

function initScene() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = false;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x72b1bd);
  scene.fog = new THREE.Fog(0x72b1bd, 520, 1900);
  camera = new THREE.PerspectiveCamera(52, 1, 0.1, 4000);
  camera.position.set(START.x - 72, 62, START.z - 72);
  camera.lookAt(START.x, 0, START.z);
  raycaster = new THREE.Raycaster();
  groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  scene.add(new THREE.HemisphereLight(0xbfe8e0, 0x163847, 1.65));
  const sun = new THREE.DirectionalLight(0xffe2ab, 2.1);
  sun.position.set(-240, 420, -180);
  scene.add(sun);
  waterUniforms = { uTime: { value: 0 }, uWind: { value: new THREE.Vector2(1, 0) } };
  const waterGeometry = new THREE.PlaneGeometry(WORLD, WORLD * .78, 72, 56);
  waterGeometry.rotateX(-Math.PI / 2);
  const waterMaterial = new THREE.ShaderMaterial({
    uniforms: waterUniforms,
    vertexShader: 'uniform float uTime; varying vec3 vWorld; void main(){ vec3 p=position; p.y += sin(p.x*.027+uTime*1.7)*.8 + cos(p.z*.021-uTime*1.15)*.55; vec4 wp=modelMatrix*vec4(p,1.0); vWorld=wp.xyz; gl_Position=projectionMatrix*viewMatrix*wp; }',
    fragmentShader: 'uniform float uTime; uniform vec2 uWind; varying vec3 vWorld; void main(){ float a=sin(vWorld.x*.035+uTime*.7)+cos(vWorld.z*.041-uTime*.5); float foam=smoothstep(.74,1.0,sin(vWorld.x*.12+vWorld.z*.08+uTime*1.4)*.5+.5); vec3 deep=vec3(.035,.21,.29); vec3 teal=vec3(.055,.38,.44); vec3 c=mix(deep,teal,.42+.18*a)+vec3(.06,.13,.12)*foam; gl_FragColor=vec4(c,1.0); }',
  });
  ocean = new THREE.Mesh(waterGeometry, waterMaterial);
  ocean.position.y = -1.1;
  scene.add(ocean);
  worldGroup = new THREE.Group();
  scene.add(worldGroup);
  initPools();
  buildWorld();
  buildBoat();
  buildWindArrows();
  resize();
}

function initPools() {
  const wakeGeometry = new THREE.PlaneGeometry(1, 1);
  wakeGeometry.rotateX(-Math.PI / 2);
  const sprayGeometry = new THREE.SphereGeometry(0.7, 5, 4);
  const rainGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 9, 0), new THREE.Vector3(0, 0, 0)]);
  const wakeMaterial = new THREE.MeshBasicMaterial({ color: COLORS.foam, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const sprayMaterial = new THREE.MeshBasicMaterial({ color: COLORS.foam, transparent: true, opacity: 0, depthWrite: false });
  const rainMaterial = new THREE.LineBasicMaterial({ color: COLORS.storm, transparent: true, opacity: 0, depthWrite: false });
  for (let i = 0; i < 16; i++) {
    const mesh = new THREE.Mesh(wakeGeometry, wakeMaterial);
    mesh.visible = false;
    scene.add(mesh);
    wakeMeshes.push(mesh); wakeStates.push({ life: 0, max: 1, x: 0, z: 0, scale: 1, heading: 0 });
  }
  for (let i = 0; i < 16; i++) {
    const mesh = new THREE.Mesh(sprayGeometry, sprayMaterial);
    mesh.visible = false;
    scene.add(mesh);
    sprayMeshes.push(mesh); sprayStates.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, scale: 1 });
  }
  for (let i = 0; i < 16; i++) {
    const line = new THREE.Line(rainGeometry, rainMaterial);
    line.visible = false;
    scene.add(line);
    rainMeshes.push(line); rainStates.push({ x: 0, y: 0, z: 0, life: 0 });
  }
}

function createMaterial(hex, roughness = .85, metalness = .02) {
  return new THREE.MeshStandardMaterial({ color: hex, roughness, metalness, flatShading: true });
}

function addBox(parent, x, y, z, sx, sy, sz, material, rotationY = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
  mesh.position.set(x, y, z); mesh.rotation.y = rotationY; parent.add(mesh); return mesh;
}

function addIsland(parent, x, z, radius, hex, scaleY = 1) {
  const shore = new THREE.Mesh(new THREE.CylinderGeometry(radius * .88, radius * 1.12, 5, 12), createMaterial(0xd8bd82));
  shore.position.set(x, 1.1 * scaleY, z); shore.scale.z = .78; parent.add(shore);
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(radius, 1), createMaterial(hex));
  rock.position.set(x, radius * .18 * scaleY, z); rock.scale.set(1.2, .24 * scaleY, .88); parent.add(rock);
  const grass = new THREE.Mesh(new THREE.DodecahedronGeometry(radius * .72, 1), createMaterial(0x4f866c));
  grass.position.set(x - radius * .08, radius * .38 * scaleY, z + radius * .05); grass.scale.set(1.1, .2 * scaleY, .82); parent.add(grass);
  const crown = new THREE.Mesh(new THREE.TorusGeometry(radius * .48, 3.2, 6, 20), new THREE.MeshBasicMaterial({ color: 0x9fe0a2, transparent: true, opacity: .38 }));
  crown.rotation.x = Math.PI / 2; crown.position.set(x, radius * .48 * scaleY, z); parent.add(crown);
  for (let i = 0; i < 4; i++) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3.4, 15 + i * 2, 6), createMaterial(0x765348));
    trunk.position.set(x + Math.cos(i * 1.7) * radius * .42, 9 + i, z + Math.sin(i * 1.7) * radius * .38); parent.add(trunk);
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(12 + (i % 2) * 4, 1), createMaterial([0x397261, 0x4f866c, 0x6b9870][i % 3]));
    leaf.position.set(trunk.position.x, 20 + i * 2, trunk.position.z); leaf.scale.y = .9; parent.add(leaf);
  }
}

function createDock(region, index) {
  const group = new THREE.Group();
  const wood = createMaterial(0x9f7057);
  const pale = createMaterial(0xe3c887);
  for (let i = -4; i <= 4; i++) addBox(group, i * 11, 2 + (i % 2) * .15, 0, 9, 3, 17, wood, region.id === 'gale' ? -.1 : .1);
  addBox(group, -24, 1.4, 0, 8, 6, 24, pale);
  addBox(group, 24, 1.4, 0, 8, 6, 24, pale);
  [-36, -12, 12, 36].forEach((x, postIndex) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.7, 17, 7), createMaterial(0x765348));
    post.position.set(x, 6, postIndex % 2 ? -9 : 9); group.add(post);
  });
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(22, 10, 4), createMaterial([0xed806e, 0xf4c66d, 0x62d5b7][index % 3]));
  canopy.position.set(-2, 19, 0); canopy.rotation.y = Math.PI / 4; group.add(canopy);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(.8, .8, 38, 6), createMaterial(0xf2e6c7));
  mast.position.set(36, 20, 0); group.add(mast);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(14, 8), new THREE.MeshBasicMaterial({ color: GOODS[index % GOODS.length].color, side: THREE.DoubleSide }));
  flag.position.set(42, 32, 0); flag.rotation.y = Math.PI / 2; group.add(flag);
  group.position.set(region.dock.x, 0, region.dock.z);
  worldGroup.add(group);
  docks.push({ regionId: region.id, index, x: region.dock.x, z: region.dock.z, visual: group });
}

function createLandmark(region) {
  const group = new THREE.Group();
  const x = region.center.x + 76;
  const z = region.center.z - 78;
  if (region.landmark === 'lighthouse') {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(13, 19, 90, 8), createMaterial(0xe4d8bc));
    tower.position.y = 45; group.add(tower);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(22, 24, 8), createMaterial(0xed806e)); cap.position.y = 102; group.add(cap);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(10, 8, 6), new THREE.MeshBasicMaterial({ color: COLORS.gold })); glow.position.y = 91; group.add(glow);
  } else if (region.landmark === 'wreck') {
    addBox(group, 0, 4, 0, 90, 8, 19, createMaterial(0x513e3b), -.42);
    addBox(group, -8, 20, -3, 5, 38, 5, createMaterial(0xb58b67), -.25);
    addBox(group, 20, 13, 3, 5, 28, 5, createMaterial(0xa7795e), .42);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(27, 20), new THREE.MeshBasicMaterial({ color: COLORS.storm, transparent: true, opacity: .7, side: THREE.DoubleSide }));
    cloth.position.set(-9, 28, 0); cloth.rotation.y = -.55; group.add(cloth);
  } else if (region.landmark === 'market') {
    const float = createMaterial(0xb27d5d);
    addBox(group, 0, 2, 0, 110, 4, 32, float);
    [-34, 0, 34].forEach((offset, i) => {
      const tent = new THREE.Mesh(new THREE.ConeGeometry(22, 28, 4), createMaterial([0xed806e, 0xf4c66d, 0x62d5b7][i]));
      tent.position.set(offset, 18, 0); tent.rotation.y = Math.PI / 4; group.add(tent);
    });
  } else {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(18, 24, 16, 8), createMaterial(0xd8c092)); base.position.y = 8; group.add(base);
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(5, 9, 70, 6), createMaterial(0xece2bc)); beacon.position.y = 50; group.add(beacon);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(18, 3, 6, 16), new THREE.MeshBasicMaterial({ color: COLORS.gold })); ring.position.y = 52; ring.rotation.x = Math.PI / 2; group.add(ring);
  }
  group.position.set(x, 0, z); worldGroup.add(group);
}

function createWindLane(a, b, label) {
  const points = [new THREE.Vector3(a.x, .5, a.z), new THREE.Vector3((a.x + b.x) / 2, .5, (a.z + b.z) / 2), new THREE.Vector3(b.x, .5, b.z)];
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: COLORS.gold, transparent: true, opacity: .45 }));
  worldGroup.add(line);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(22, 1.7, 6, 24), new THREE.MeshBasicMaterial({ color: COLORS.gold, transparent: true, opacity: .38 }));
  ring.position.set((a.x + b.x) / 2, .7, (a.z + b.z) / 2); ring.rotation.x = Math.PI / 2; worldGroup.add(ring);
  windLanes.push({ a, b, label, line, ring, t: 0 });
}

function createShortcut(region) {
  const geometry = new THREE.BufferGeometry().setFromPoints(region.shortcut.map((point) => new THREE.Vector3(point.x, .7, point.z)));
  const line = new THREE.Line(geometry, new THREE.LineDashedMaterial({ color: COLORS.teal, dashSize: 16, gapSize: 10, transparent: true, opacity: .48 }));
  line.computeLineDistances(); worldGroup.add(line);
  region.shortcut.forEach((point, index) => {
    if (index % 2 !== 0) return;
    const buoy = new THREE.Mesh(new THREE.SphereGeometry(3.5, 6, 4), createMaterial(COLORS.teal, .55));
    buoy.position.set(point.x, 4, point.z); worldGroup.add(buoy);
  });
}

function buildWorld() {
  REGION_FAMILY.forEach((region, index) => {
    const visual = new THREE.Group();
    addIsland(visual, region.center.x, region.center.z, 118, region.hue, 1);
    addIsland(visual, region.center.x - 125, region.center.z + 48, 45, region.hue, .9);
    addIsland(visual, region.center.x + 132, region.center.z + 95, 36, region.hue, .8);
    region.reefs.forEach((reef) => {
      const rock = new THREE.Mesh(new THREE.ConeGeometry(reef.r * .55, 16, 7), createMaterial(0x877e69));
      rock.position.set(reef.x, 5, reef.z); visual.add(rock); reefs.push({ x: reef.x, z: reef.z, r: reef.r, visual: rock });
    });
    worldGroup.add(visual); regionsVisual.push(visual);
    createDock(region, index); createLandmark(region); createShortcut(region);
  });
  createWindLane({ x: -500, z: -350 }, { x: 40, z: -120 }, 'reef breeze');
  createWindLane({ x: 150, z: 130 }, { x: 900, z: 360 }, 'open trade wind');
  createWindLane({ x: -790, z: -900 }, { x: -200, z: -1020 }, 'strait lift');
  createPickups();
  createStorms();
}

function createPickup(kind, x, z, amount, goodIndex) {
  const group = new THREE.Group();
  if (kind === 'cache') {
    const box = new THREE.Mesh(new THREE.BoxGeometry(18, 12, 18), createMaterial(COLORS.gold)); box.position.y = 8; group.add(box);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(20, 4, 20), createMaterial(0xf8e2a4)); lid.position.y = 16; group.add(lid);
  } else {
    const box = new THREE.Mesh(new THREE.BoxGeometry(20, 16, 20), createMaterial(GOODS[goodIndex].color)); box.position.y = 9; group.add(box);
    const strap = new THREE.Mesh(new THREE.BoxGeometry(22, 2, 4), createMaterial(0xf2e4bd)); strap.position.y = 10; group.add(strap);
  }
  const halo = new THREE.Mesh(new THREE.TorusGeometry(18, 1.4, 6, 22), new THREE.MeshBasicMaterial({ color: kind === 'cache' ? COLORS.gold : GOODS[goodIndex].color, transparent: true, opacity: .62 }));
  halo.position.y = 2; halo.rotation.x = Math.PI / 2; group.add(halo);
  group.position.set(x, 0, z); worldGroup.add(group);
  return { x, z, amount, goodIndex, collected: false, visual: group, kind };
}

function createPickups() {
  const cachePositions = [
    [-1160, -740, 230], [-640, -890, 310], [-410, -460, 270], [80, -1050, 360], [290, -560, 290],
    [820, -90, 340], [1000, 510, 420], [430, 780, 250], [50, 430, 380], [-280, 260, 320], [1180, 120, 500], [-1070, 40, 260],
  ];
  cachePositions.forEach((entry) => pickups.caches.push(createPickup('cache', entry[0], entry[1], entry[2], 0)));
  const cratePositions = [[-570, -760, 1], [-70, -450, 2], [230, -60, 3], [770, -380, 0], [890, 780, 1], [280, 620, 2], [-450, 170, 3], [1110, 610, 0]];
  cratePositions.forEach((entry) => pickups.crates.push(createPickup('crate', entry[0], entry[1], 3, entry[2])));
}

function createStorms() {
  const stormStates = [
    { x: -330, z: -560, size: 150, seed: 2.1 }, { x: 50, z: -790, size: 176, seed: 4.7 },
    { x: 260, z: -420, size: 138, seed: 8.4 }, { x: 560, z: 160, size: 165, seed: 11.2 },
    { x: 340, z: 620, size: 142, seed: 14.6 },
  ];
  stormStates.forEach((storm, index) => {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(storm.size * .72, 5, 8, 32), new THREE.MeshBasicMaterial({ color: COLORS.storm, transparent: true, opacity: .2 }));
    ring.rotation.x = Math.PI / 2; group.add(ring);
    for (let i = 0; i < 5; i++) {
      const cloud = new THREE.Mesh(new THREE.SphereGeometry(storm.size * (.19 + i % 2 * .04), 8, 5), new THREE.MeshStandardMaterial({ color: 0x1a2a46, transparent: true, opacity: .54, roughness: 1 }));
      cloud.position.set((i - 2) * storm.size * .17, 8 + (i % 2) * 8, Math.sin(i * 2) * storm.size * .12); cloud.scale.y = .42; group.add(cloud);
    }
    const flash = new THREE.PointLight(COLORS.storm, 0, storm.size * 2.3, 2); flash.position.y = 34; group.add(flash);
    group.position.set(storm.x, 1, storm.z); worldGroup.add(group);
    stormVisuals.push({ state: { ...storm, hitTimer: 2.5 + index, active: false }, group, ring, flash });
  });
}

function buildBoat() {
  boatRoot = new THREE.Group();
  worldGroup.add(boatRoot);
  boatShadow = new THREE.Mesh(new THREE.CircleGeometry(22, 24), new THREE.MeshBasicMaterial({ color: 0x06212b, transparent: true, opacity: .3, depthWrite: false }));
  boatShadow.rotation.x = -Math.PI / 2; boatShadow.position.y = -1.2; boatRoot.add(boatShadow);
  contactRingMaterial = new THREE.MeshBasicMaterial({ color: COLORS.coral, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  contactRing = new THREE.Mesh(new THREE.TorusGeometry(18, 1.4, 6, 24), contactRingMaterial);
  contactRing.rotation.x = -Math.PI / 2; contactRing.position.y = -.8; contactRing.visible = false; boatRoot.add(contactRing);
  HULL_FAMILY.forEach((family, level) => {
    const group = new THREE.Group();
    const points = [[-family.length * .54, 0], [-family.length * .37, -family.beam * .53], [family.length * .28, -family.beam * .5], [family.length * .54, 0], [family.length * .28, family.beam * .5], [-family.length * .37, family.beam * .53]];
    const shape = new THREE.Shape(); points.forEach((point, index) => { if (index === 0) shape.moveTo(point[0], point[1]); else shape.lineTo(point[0], point[1]); }); shape.closePath();
    const hullGeometry = new THREE.ExtrudeGeometry(shape, { depth: 4.6, bevelEnabled: true, bevelSegments: 1, bevelSize: 1.4, bevelThickness: 1.1 });
    hullGeometry.translate(0, 0, -2.3); hullGeometry.rotateX(-Math.PI / 2);
    const hull = new THREE.Mesh(hullGeometry, createMaterial(family.hull, .68, .14)); hull.position.y = 2.1; group.add(hull);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(family.length * .62, 1.3, family.beam * .72), createMaterial(family.deck)); deck.position.set(-3, 5.1, 0); group.add(deck);
    const bowRail = new THREE.Mesh(new THREE.TorusGeometry(family.beam * .32, .75, 5, 12, Math.PI), createMaterial(0xe8dcc0));
    bowRail.rotation.z = Math.PI / 2; bowRail.position.set(family.length * .38, 5.8, 0); group.add(bowRail);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(.75, .95, 50 + level * 5, 8), createMaterial(0xe8dcc0)); mast.position.set(-4, 28 + level * 2, 0); group.add(mast);
    const sailGroup = new THREE.Group();
    const sailShape = new THREE.Shape(); sailShape.moveTo(-3, 3); sailShape.lineTo(-3, 44 + level * 4); sailShape.lineTo(-27 - level * 3, 13); sailShape.closePath();
    const sailMaterial = new THREE.MeshStandardMaterial({ color: family.sail, roughness: .9, side: THREE.DoubleSide, flatShading: true });
    const sail = new THREE.Mesh(new THREE.ShapeGeometry(sailShape), sailMaterial); sail.position.set(-4, 4, 0); sailGroup.add(sail);
    const jibShape = new THREE.Shape(); jibShape.moveTo(2, 4); jibShape.lineTo(2, 30 + level * 3); jibShape.lineTo(18 + level * 2, 7); jibShape.closePath();
    const jib = new THREE.Mesh(new THREE.ShapeGeometry(jibShape), new THREE.MeshStandardMaterial({ color: family.sail, roughness: .9, side: THREE.DoubleSide, flatShading: true })); jib.position.set(-1, 6, 0); sailGroup.add(jib);
    const telltaleMaterial = new THREE.MeshBasicMaterial({ color: COLORS.coral, side: THREE.DoubleSide });
    const telltaleA = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.1), telltaleMaterial); telltaleA.position.set(-13, 25, .8); telltaleA.rotation.y = Math.PI / 2; sailGroup.add(telltaleA);
    const telltaleB = new THREE.Mesh(new THREE.PlaneGeometry(7, .9), telltaleMaterial.clone()); telltaleB.position.set(-9, 34, -.8); telltaleB.rotation.y = Math.PI / 2; sailGroup.add(telltaleB);
    sailGroup.position.y = 5; group.add(sailGroup);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(14, 8), new THREE.MeshBasicMaterial({ color: level === 3 ? COLORS.gold : family.hull, side: THREE.DoubleSide })); flag.position.set(20, 50 + level * 4, 0); flag.rotation.y = Math.PI / 2; group.add(flag);
    const lanternMaterial = new THREE.MeshBasicMaterial({ color: COLORS.gold, transparent: true, opacity: .75 });
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(3.2, 8, 6), lanternMaterial); lantern.position.set(family.length * .34, 9, 0); group.add(lantern);
    group.visible = level === state.hull;
    boatRoot.add(group); boatLevels.push(group); boatLevelVisuals.push({ sailGroup, sail, jib, telltaleA, telltaleB, sailMaterial, flag, lantern });
  });
}

function buildWindArrows() {
  const direction = new THREE.Vector3(1, 0, 0);
  for (let i = 0; i < 5; i++) {
    const arrow = new THREE.ArrowHelper(direction, new THREE.Vector3(), 30, COLORS.foam, 8, 4);
    arrow.line.material.transparent = true; arrow.line.material.opacity = .42;
    arrow.cone.material.transparent = true; arrow.cone.material.opacity = .72;
    scene.add(arrow); windArrows.push(arrow);
  }
}

function getSailData() {
  const windRelative = wrapAngle(wind.angle - vessel.heading);
  const point = Math.abs(windRelative);
  const noGo = .5;
  const closeReach = clamp((point - noGo) / .64, 0, 1);
  const broadReach = Math.sin(clamp(point, 0, Math.PI));
  const idealTrim = clamp(windRelative * .72, -1.45, 1.45);
  const trimError = Math.abs(wrapAngle(vessel.trim - idealTrim));
  const trimEfficiency = clamp(1 - trimError / 1.55, 0, 1);
  const pointEfficiency = point < noGo ? .045 + closeReach * .11 : .35 + broadReach * .68;
  const luff = point < noGo ? clamp(1 - point / noGo, 0, 1) : 0;
  const family = hullByLevel(state.hull);
  const speed = 15 + 56 * family.speed * pointEfficiency * (.27 + trimEfficiency * .73);
  const heel = clamp((Math.sin(windRelative) * .17 + wrapAngle(vessel.trim - idealTrim) * .11) * (speed / 55), -.24, .24);
  let mode = 'RUNNING';
  if (luff > .45) mode = 'SAIL LUFF'; else if (point < .92) mode = 'CLOSE REACH'; else if (point < 2.12) mode = 'BEAM REACH';
  return { windRelative, point, noGo, idealTrim, trimError, trimEfficiency, pointEfficiency, luff, speed, heel, mode };
}

function updateWind() {
  wind.angle = -.72 + Math.sin(simTime * .022) * .48 + Math.sin(simTime * .006) * .22;
  wind.speed = 58 + Math.sin(simTime * .031) * 11 + Math.sin(simTime * .008) * 7;
  waterUniforms.uWind.value.set(Math.cos(wind.angle), Math.sin(wind.angle));
}

let wind = { angle: -.72, speed: 60 };

function updateTrimFromScreen(x, y) {
  const rect = ui.trimControl.getBoundingClientRect();
  const dx = x - (rect.left + rect.width / 2);
  const dy = y - (rect.top + rect.height / 2);
  if (Math.hypot(dx, dy) < 12) return;
  const previous = vessel.trim;
  vessel.trim = clamp(wrapAngle(Math.atan2(dx, -dy)), -1.45, 1.45);
  if (Math.abs(vessel.trim - previous) > .08 && trimSfxCooldown <= 0) { kit.audio.sfx('trim', { volume: .16, rate: 1 + Math.abs(vessel.trim) * .08 }); trimSfxCooldown = .18; }
  advanceTutorial(2);
  startAudio();
}

function updateControls(step) {
  if (state.mode !== 'sailing' && state.mode !== 'victory') return;
  trimSfxCooldown = Math.max(0, trimSfxCooldown - step);
  let steer = 0;
  if (kit.input.keyDown('ArrowRight') || kit.input.keyDown('KeyD')) steer += 1;
  if (kit.input.keyDown('ArrowLeft') || kit.input.keyDown('KeyA')) steer -= 1;
  let trim = 0;
  if (kit.input.keyDown('ArrowUp') || kit.input.keyDown('KeyW')) trim += 1;
  if (kit.input.keyDown('ArrowDown') || kit.input.keyDown('KeyS')) trim -= 1;
  if (steer) { vessel.targetHeading = wrapAngle(vessel.targetHeading + steer * 1.22 * step); advanceTutorial(1); }
  if (trim) { vessel.trim = clamp(vessel.trim + trim * 1.08 * step, -1.45, 1.45); advanceTutorial(2); }
  for (const pointer of kit.input.pointers.values()) if (pointer.zone === 'trim') updateTrimFromScreen(pointer.x, pointer.y);
  vessel.heading = wrapAngle(damp(vessel.heading, vessel.targetHeading, 3.2, step));
}

function activeStormForVessel() {
  let found = null;
  stormVisuals.forEach((storm) => {
    const d = distanceXZ(vessel, storm.state);
    if (d < storm.state.size * .64 && (!found || d < distanceXZ(vessel, found.state))) found = storm;
  });
  return found;
}

function triggerImpact(magnitude, accentColor) {
  contactAccent = 1;
  contactAccentScale = 1;
  boatPulseVelocity += magnitude * .7;
  cameraDipVelocity -= magnitude * .46;
  if (!reducedMotion) {
    kit.juice.hitStop(55);
    kit.juice.shake(Math.min(2.4, magnitude), 180);
  }
  if (contactRingMaterial) contactRingMaterial.color.setHex(accentColor || COLORS.coral);
}

function distanceToSegment(point, a, b) {
  const dx = b.x - a.x; const dz = b.z - a.z;
  const t = clamp(((point.x - a.x) * dx + (point.z - a.z) * dz) / Math.max(.001, dx * dx + dz * dz), 0, 1);
  return Math.hypot(point.x - (a.x + t * dx), point.z - (a.z + t * dz));
}

function updateStorms(step) {
  stormVisuals.forEach((storm, index) => {
    const s = storm.state;
    s.x += Math.cos(wind.angle) * (3 + index * .45) * step;
    s.z += Math.sin(wind.angle) * (3 + index * .45) * step;
    if (s.x < -WORLD / 2) s.x = WORLD / 2;
    if (s.x > WORLD / 2) s.x = -WORLD / 2;
    if (s.z < -WORLD / 2) s.z = WORLD / 2;
    if (s.z > WORLD / 2) s.z = -WORLD / 2;
    storm.group.position.set(s.x, 1, s.z);
    if (!reducedMotion) {
      storm.ring.rotation.z += step * .16;
      storm.ring.material.opacity = .16 + Math.sin(simTime * 2 + s.seed) * .04;
    } else storm.ring.material.opacity = .14;
    s.hitTimer -= step;
  });
  const active = activeStormForVessel();
  if (!active) { state.inStorm = false; vessel.stormClock = 0; return; }
  state.inStorm = true;
  active.state.active = true;
  vessel.stormClock += step;
  if (vessel.stormClock < step * 1.2) {
    setBanner('STORM CELL AHEAD', 'storm', 1); kit.audio.sfx('storm', { volume: .6 });
    triggerImpact(1.8, COLORS.storm);
    progressContract('storms');
  }
  if (active.state.hitTimer <= 0) {
    active.state.hitTimer = 3.4;
    const spillChance = .3 + volatility() * .42;
    if (cargoCount() && nextSimRandom() < spillChance) {
      const loaded = state.cargo.findIndex((amount) => amount > 0);
      if (loaded >= 0) { state.cargo[loaded]--; setBanner('SPILL · 1 ' + GOODS[loaded].name, 'storm', 1); kit.audio.sfx('creak', { volume: .8, rate: .8 }); }
    } else setBanner('STORM BOOST · SPILL ' + Math.round(spillChance * 100) + '%', 'storm', 1);
    if (!reducedMotion) kit.juice.shake(1.4, 170);
  }
}

function updateBoostLanes(step) {
  windLanes.forEach((lane, index) => {
    lane.t += step;
    if (!reducedMotion) {
      lane.ring.rotation.z = lane.t * (.9 + index * .06);
      lane.ring.material.opacity = .26 + Math.sin(simTime * 3 + index) * .12;
    } else lane.ring.material.opacity = .22;
    if (distanceToSegment(vessel, lane.a, lane.b) < 34 && vessel.boostTimer < .2) {
      vessel.boostTimer = 2.4; setBanner('WIND BOOST LANE', 'good', 1); kit.audio.sfx('boost', { volume: .55, rate: 1.05 });
    }
  });
  vessel.boostTimer = Math.max(0, vessel.boostTimer - step);
}

function updateSailing(step) {
  updateControls(step);
  const sail = getSailData();
  const stormBoost = state.inStorm ? 1.42 : 1;
  const laneBoost = vessel.boostTimer > 0 ? 1.3 : 1;
  const windFactor = clamp(wind.speed / 60, .72, 1.22);
  const targetSpeed = sail.speed * windFactor * stormBoost * laneBoost;
  vessel.speed = damp(vessel.speed, targetSpeed, 3.5, step);
  const dock = nearestDock();
  if (dock && distanceXZ(vessel, dock) < 155) vessel.speed = damp(vessel.speed, Math.min(vessel.speed, 28), 1.8, step);
  const before = { x: vessel.x, z: vessel.z };
  vessel.x += Math.cos(vessel.heading) * vessel.speed * step;
  vessel.z += Math.sin(vessel.heading) * vessel.speed * step;
  vessel.x = clamp(vessel.x, -WORLD / 2 + 35, WORLD / 2 - 35);
  vessel.z = clamp(vessel.z, -WORLD / 2 + 35, WORLD / 2 - 35);
  vessel.impactCooldown = Math.max(0, vessel.impactCooldown - step);
  reefs.forEach((reef) => {
    const dx = vessel.x - reef.x; const dz = vessel.z - reef.z; const d = Math.hypot(dx, dz); const min = reef.r * .62 + 12;
    if (d < min) {
      const nx = d ? dx / d : 1; const nz = d ? dz / d : 0;
      vessel.x = reef.x + nx * min; vessel.z = reef.z + nz * min; vessel.speed *= .28; vessel.targetHeading = wrapAngle(Math.atan2(nz, nx) + .75);
      if (vessel.impactCooldown <= 0) {
        vessel.impactCooldown = .42; triggerImpact(2.4, COLORS.coral); kit.audio.sfx('reef', { volume: .72, rate: .88 });
        setBanner('REEF · EASE HELM', 'storm', 1);
      }
    }
  });
  vessel.heel = damp(vessel.heel, sail.heel, 4.4, step);
  vessel.pitch = damp(vessel.pitch, clamp((before.x - vessel.x) * .008, -.08, .08), 3.4, step);
  updatePickups(); updateWakeAndSpray(step); maybeDockApproach();
}

function updatePickups() {
  pickups.caches.forEach((pickup) => {
    if (pickup.collected) return;
    pickup.visual.rotation.y = simTime * .45; pickup.visual.position.y = 2 + Math.sin(simTime * 2.6 + pickup.x) * 2;
    if (distanceXZ(vessel, pickup) < 28) { pickup.collected = true; pickup.visual.visible = false; state.gold += pickup.amount; state.bestGold = Math.max(state.bestGold, state.gold); progressContract('caches'); setBanner('+' + pickup.amount + ' GOLD', 'good', 1); kit.audio.sfx('cache', { volume: .55, rate: 1.1 }); }
  });
  pickups.crates.forEach((pickup) => {
    if (pickup.collected) return;
    pickup.visual.rotation.y = -simTime * .38; pickup.visual.position.y = 2 + Math.sin(simTime * 2.4 + pickup.z) * 1.8;
    if (distanceXZ(vessel, pickup) < 28) {
      pickup.collected = true; pickup.visual.visible = false;
      const room = capacity() - cargoCount();
      const add = Math.min(room, pickup.amount);
      if (add > 0) state.cargo[pickup.goodIndex] += add; else state.gold += 120;
      setBanner(add > 0 ? '+' + add + ' ' + GOODS[pickup.goodIndex].name : '+120 GOLD', 'good', 1); kit.audio.sfx('gulls', { volume: .5, rate: .95 });
    }
  });
}

function spawnWake() {
  const index = wakeCursor++ % wakeMeshes.length; const mesh = wakeMeshes[index]; const render = wakeStates[index];
  render.life = 1; render.max = 1; render.x = vessel.x - Math.cos(vessel.heading) * 17; render.z = vessel.z - Math.sin(vessel.heading) * 17; render.scale = clamp(vessel.speed / 30, .4, 2.8); render.heading = vessel.heading;
  mesh.visible = true; mesh.material.opacity = .42; mesh.position.set(render.x, .2, render.z); mesh.rotation.z = -render.heading; mesh.scale.set(render.scale * 8, render.scale * 2.5, 1);
}

function spawnSpray() {
  const index = sprayCursor++ % sprayMeshes.length; const mesh = sprayMeshes[index]; const render = sprayStates[index]; const side = Math.random() < .5 ? -1 : 1;
  const sideX = -Math.cos(vessel.heading) * 7 + Math.cos(vessel.heading + Math.PI / 2) * side * 4;
  const sideZ = -Math.sin(vessel.heading) * 7 + Math.sin(vessel.heading + Math.PI / 2) * side * 4;
  render.life = .55 + Math.random() * .32; render.max = render.life; render.x = vessel.x + sideX; render.y = 1 + Math.random() * 2; render.z = vessel.z + sideZ;
  render.vx = -Math.cos(vessel.heading) * (3 + vessel.speed * .11) + (Math.random() - .5) * 4;
  render.vy = 8 + Math.random() * 8 + vessel.speed * .05; render.vz = -Math.sin(vessel.heading) * (3 + vessel.speed * .11) + (Math.random() - .5) * 4; render.scale = clamp(vessel.speed / 50, .3, 1.6);
  mesh.visible = true; mesh.position.set(render.x, render.y, render.z); mesh.scale.setScalar(render.scale); mesh.material.opacity = .72;
}

function updateWakeAndSpray(step) {
  if (reducedMotion) {
    wakeMeshes.forEach((mesh) => { mesh.visible = false; });
    sprayMeshes.forEach((mesh) => { mesh.visible = false; });
    wakeStates.forEach((render) => { render.life = 0; });
    sprayStates.forEach((render) => { render.life = 0; });
    return;
  }
  wakeAccumulator += step * clamp(vessel.speed / 17, 0, 4);
  while (wakeAccumulator > 1) { wakeAccumulator -= 1; spawnWake(); }
  sprayAccumulator += step * clamp(vessel.speed / 12, 0, 5);
  while (sprayAccumulator > 1) { sprayAccumulator -= 1; spawnSpray(); }
  wakeStates.forEach((render, index) => {
    if (render.life <= 0) return;
    render.life -= step * 1.25; const mesh = wakeMeshes[index]; const alpha = clamp(render.life / render.max, 0, 1);
    mesh.material.opacity = alpha * .42 * clamp(vessel.speed / 28, .2, 1); mesh.scale.set(render.scale * (10 + (1 - alpha) * 9), render.scale * (3 + (1 - alpha) * 5), 1); mesh.position.y = .13 + (1 - alpha) * .06; mesh.visible = render.life > 0;
  });
  sprayStates.forEach((render, index) => {
    if (render.life <= 0) return;
    render.life -= step; render.x += render.vx * step; render.y += render.vy * step; render.z += render.vz * step; render.vy -= 20 * step;
    const mesh = sprayMeshes[index]; const alpha = clamp(render.life / render.max, 0, 1); mesh.position.set(render.x, render.y, render.z); mesh.material.opacity = alpha * .7; mesh.visible = render.life > 0;
  });
}

function updateRain(step) {
  if (reducedMotion) {
    rainMeshes.forEach((mesh) => { mesh.visible = false; });
    stormVisuals.forEach((storm) => { storm.flash.intensity = 0; });
    return;
  }
  const active = stormVisuals.filter((storm) => Math.hypot(vessel.x - storm.state.x, vessel.z - storm.state.z) < 560).sort((a, b) => distanceXZ(vessel, a.state) - distanceXZ(vessel, b.state))[0];
  rainMeshes.forEach((mesh, index) => {
    const render = rainStates[index];
    if (!active) { mesh.visible = false; return; }
    if (render.life <= 0) { render.life = .7 + Math.random() * .6; render.x = active.state.x + (Math.random() - .5) * active.state.size * 1.7; render.z = active.state.z + (Math.random() - .5) * active.state.size * 1.7; render.y = 28 + Math.random() * 46; }
    render.life -= step; render.y -= 48 * step; mesh.position.set(render.x, render.y, render.z); mesh.material.opacity = .17 + Math.sin(simTime * 3) * .04; mesh.visible = true;
  });
  if (active && Math.sin(simTime * .88 + active.state.seed) > .995) { stormFlash = .18; active.flash.intensity = 7; kit.juice.shake(1.1, 100); }
  stormFlash = Math.max(0, stormFlash - step); stormVisuals.forEach((storm) => { storm.flash.intensity = Math.max(0, storm.flash.intensity - step * 28); });
}

function nearestDock() {
  let best = null; let bestDistance = Infinity;
  docks.forEach((dock) => { const d = distanceXZ(vessel, dock); if (d < bestDistance) { bestDistance = d; best = dock; } });
  return best;
}

function dockingQuality(dock) {
  const dx = dock.x - vessel.x; const dz = dock.z - vessel.z; const desired = Math.atan2(dz, dx); const alignment = (Math.cos(wrapAngle(vessel.heading - desired)) + 1) / 2;
  const distanceScore = 1 - clamp((Math.hypot(dx, dz) - 28) / 122, 0, 1);
  return clamp((1 - vessel.speed / 36) * .48 + alignment * .27 + distanceScore * .25, 0, 1);
}

function maybeDockApproach() {
  const dock = nearestDock(); if (!dock) return;
  const d = distanceXZ(vessel, dock);
  if (d < 155 && vessel.speed < 30) {
    vessel.dockQuality = dockingQuality(dock);
    if (d < 52 && vessel.speed < 23) openDock(dock.index, vessel.dockQuality, true);
  }
}

function tryDock() {
  if (state.mode !== 'sailing' && state.mode !== 'victory') { if (state.mode === 'docked') closeDock(); return; }
  const dock = nearestDock();
  if (!dock || distanceXZ(vessel, dock) > 150) { setBanner('NO DOCK IN REACH', 'storm', 1); return; }
  if (vessel.speed > 38) { vessel.speed *= .45; setBanner('EASE THE HELM', 'storm', 1); return; }
  openDock(dock.index, dockingQuality(dock), false);
}

function openDock(index, quality, automatic) {
  if (dockIndex >= 0 || !docks[index]) return;
  dockIndex = index; state.mode = 'docked'; vessel.speed = 0; ui.dockPanel.classList.remove('hidden');
  dockRenderKey = '';
  const region = regionById(docks[index].regionId);
  setTextIfChanged(ui.dockName, region.name); setTextIfChanged(ui.dockSub, (quality > .72 ? 'Clean glide.' : automatic ? 'Safe glide.' : 'Docked.') + ' Market ' + marketLabel() + '.');
  if (quality > .72) { const bonus = 45 + Math.floor(quality * 60); state.gold += bonus; progressContract('glides'); setBanner('CLEAN GLIDE +' + bonus + 'G', 'good', 1); kit.audio.sfx('dock', { volume: .6, rate: 1.2 }); }
  else { setBanner('DOCKED', 'good', 1); kit.audio.sfx('creak', { volume: .7, rate: .92 }); }
  if (routeRun) handleRouteDock(index);
  kit.audio.music('market', 500); kit.audio.sfx('dock', { volume: .42, rate: automatic ? 1.08 : .94 }); advanceTutorial(3); saveGame(); updateUI();
}

function closeDock() {
  dockIndex = -1; dockRenderKey = ''; state.mode = state.victory ? 'victory' : 'sailing'; ui.dockPanel.classList.add('hidden'); if (state.tutorialStage < 5) setTutorial(tutorialMessage()); else setCoach('CAST OFF'); kit.audio.music('wind', 700); saveGame();
}

function priceFor(region, goodIndex, buy) {
  const good = GOODS[goodIndex] || GOODS[0];
  const drift = Math.sin(simTime * .11 + region.seed + goodIndex * 1.7) * volatility();
  const tide = Math.sin(simTime * .037 + region.seed * 1.7 + goodIndex) * .08;
  const raw = good.base * (region.bias[goodIndex] || 1) * (1 + drift + tide);
  return Math.max(8, Math.round(raw * (buy ? 1.08 : .86)));
}

function buy(goodIndex) {
  if (dockIndex < 0) return;
  if (cargoCount() >= capacity()) { setBanner('HOLD FULL', 'storm', 1); return; }
  const price = priceFor(regionById(docks[dockIndex].regionId), goodIndex, true);
  if (state.gold < price) { setBanner('NEED ' + price + 'G', 'storm', 1); return; }
  state.gold -= price; state.cargo[goodIndex]++; if (routeRun) routeRun.tradeProfit -= price; setBanner('BUY ' + GOODS[goodIndex].name, 'good', 1); kit.audio.sfx('buy', { volume: .44, rate: 1.1 }); advanceTutorial(4); saveGame(); updateUI();
}

function sell(goodIndex) {
  if (dockIndex < 0 || state.cargo[goodIndex] <= 0) { setBanner('NO ' + GOODS[goodIndex].name.toUpperCase(), 'storm', 1); return; }
  const price = priceFor(regionById(docks[dockIndex].regionId), goodIndex, false);
  state.cargo[goodIndex]--; state.gold += price; state.bestGold = Math.max(state.bestGold, state.gold); if (routeRun) routeRun.tradeProfit += price; progressContract('sales'); setBanner('SELL ' + GOODS[goodIndex].name + ' +' + price + 'G', 'good', 1); kit.audio.sfx('sell', { volume: .48, rate: 1.22 }); advanceTutorial(5); checkVictory(); saveGame(); updateUI();
}

function upgradeCost() { return [650, 1700, 3800][state.hull] || 0; }
function upgradeRequirement() {
  if (state.hull === 1 && state.routeMedals.coastal < 1) return 'Earn a Coastal Run medal first.';
  if (state.hull === 2 && state.routeMedals.deep < 1) return 'Earn a Deep Trade medal first.';
  if (state.hull === 3) return 'Flagship hull fitted.';
  return '';
}

function upgradeHull() {
  if (state.hull >= HULL_FAMILY.length - 1) { setBanner('FLAGSHIP FITTED', 'good', 1); return; }
  const requirement = upgradeRequirement(); if (requirement) { setBanner(requirement, 'storm', 1); return; }
  const cost = upgradeCost(); if (state.gold < cost) { setBanner('NEED ' + cost + 'G', 'storm', 1); return; }
  state.gold -= cost; state.hull++; progressContract('upgrades'); setBanner(state.hull === 3 ? 'FLAGSHIP UNLOCKED' : HULL_FAMILY[state.hull].name + ' FITTED', 'good', 1); kit.audio.sfx('upgrade', { volume: .75, rate: .7 }); if (!reducedMotion) kit.juice.shake(2.5, 260); saveGame(); checkVictory(); updateUI();
}

function isRouteUnlocked(id) { return id === 'coastal' || (id === 'deep' && state.routeMedals.coastal >= 1) || (id === 'rush' && state.routeMedals.deep >= 1); }

function startRoute(id) {
  const route = routeById(id);
  if (!isRouteUnlocked(route.id)) { setBanner(route.id === 'deep' ? 'COASTAL MEDAL NEEDED' : 'DEEP MEDAL NEEDED', 'storm', 1); return; }
  if (routeRun) { setBanner('FINISH ACTIVE RUN', 'storm', 1); return; }
  if (dockIndex >= 0) closeDock();
  const deliveryRemaining = route.id === 'rush' ? 4 : 0;
  if (deliveryRemaining && capacity() - cargoCount() < deliveryRemaining) { setBanner('CARGO RUSH NEEDS 4 HOLD', 'storm', 1); return; }
  routeRun = { id: route.id, startedAt: simTime, startGold: state.gold, legIndex: 0, tradeProfit: 0, deliveryRemaining };
  if (deliveryRemaining) state.cargo[2] += deliveryRemaining;
  ui.routePanel.classList.remove('expanded'); setBanner(route.name + ' START · NEXT ' + regionById(regionByDock(route.docks[0])).name, 'good', 1); setCourseToDock(route.docks[0]); saveGame();
}

function regionByDock(index) { return docks[index] ? docks[index].regionId : REGION_FAMILY[0].id; }

function handleRouteDock(index) {
  if (!routeRun) return;
  const route = routeById(routeRun.id); const target = route.docks[routeRun.legIndex];
  if (index !== target) { setBanner('NEXT · ' + regionById(regionByDock(target)).name, 'storm', 1); return; }
  routeRun.legIndex++;
  if (routeRun.legIndex >= route.docks.length) completeRoute(route);
  else { const next = route.docks[routeRun.legIndex]; setBanner('LEG ' + routeRun.legIndex + ' · NEXT ' + regionById(regionByDock(next)).name, 'good', 1); }
}

function medalFor(route, profit, time) {
  let medal = 0;
  route.thresholds.forEach((threshold, index) => { if (profit >= threshold.profit && time <= threshold.time) medal = index + 1; });
  return medal;
}

function completeRoute(route) {
  if (route.id === 'rush' && state.cargo[2] < routeRun.deliveryRemaining) {
    setBanner('CHARTER CARGO LOST', 'storm', 1); routeRun = null; saveGame(); return;
  }
  if (route.id === 'rush') state.cargo[2] -= routeRun.deliveryRemaining;
  const time = Math.max(0, simTime - routeRun.startedAt); const profit = routeRun.tradeProfit; const reward = route.reward; state.gold += reward; state.bestGold = Math.max(state.bestGold, state.gold);
  const medal = medalFor(route, profit, time); state.routeMedals[route.id] = Math.max(state.routeMedals[route.id] || 0, medal);
  progressContract('routes');
  const text = medal ? route.name + ' MEDAL ' + '★'.repeat(medal) : route.name + ' COMPLETE';
  setBanner(text + ' +' + reward + 'G', 'good', 1); kit.audio.sfx(medal ? 'victory' : 'dock', { volume: .8, rate: 1.35 }); if (!reducedMotion) kit.juice.shake(2.2, 230); routeRun = null; checkVictory(); saveGame();
}

function checkVictory() {
  if (state.hull >= 3 && state.gold >= 5000 && state.routeMedals.rush >= 1 && !state.victory) { state.victory = true; state.mode = 'victory'; setBanner('VOYAGE GOAL · 5,000G · FLAGSHIP', 'good', 1); kit.audio.sfx('victory', { volume: 1, rate: 1.5 }); saveGame(); }
}

function setCourseToDock(index) {
  const dock = docks[index]; if (!dock) return;
  vessel.targetHeading = Math.atan2(dock.z - vessel.z, dock.x - vessel.x);
}

function setCourseFromScreen(clientX, clientY) {
  if (state.mode !== 'sailing' && state.mode !== 'victory') return;
  const rect = renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera); const point = new THREE.Vector3(); if (!raycaster.ray.intersectPlane(groundPlane, point)) return;
  vessel.targetHeading = Math.atan2(point.z - vessel.z, point.x - vessel.x); setCoach('COURSE SET'); kit.audio.sfx('wind', { volume: .15, rate: 1.45 }); advanceTutorial(1);
}

function transientNode(target) { return target === 'coach' ? ui.coach : ui.banner; }

function clearTransientNode(target) {
  const node = transientNode(target);
  if (node) node.className = '';
}

function pumpTransientQueue() {
  if (activeTransient || !transientQueue.length) return;
  clearTransientNode('coach');
  clearTransientNode('banner');
  const next = transientQueue.shift();
  const node = transientNode(next.target);
  if (!node) return;
  setTextIfChanged(node, next.text);
  node.className = 'show' + (next.type ? ' ' + next.type : '');
  activeTransient = { ...next, until: simTime + next.duration };
}

function queueTransient(text, type, seconds, target) {
  const value = String(text || '').trim();
  if (!value) return;
  const isTutorial = target === 'coach';
  const duration = isTutorial ? clamp(Number(seconds) || 3, 2.5, 3.2) : clamp(Number(seconds) || 1, .65, 1);
  if (activeTransient && activeTransient.target === target && activeTransient.text === value) {
    activeTransient.until = simTime + duration;
    return;
  }
  transientQueue = transientQueue.filter((item) => item.target !== target || item.text !== value);
  transientQueue.push({ text: value, type: type || '', target, duration });
  if (transientQueue.length > 6) transientQueue.shift();
  pumpTransientQueue();
}

function updateTransientQueue() {
  if (!activeTransient) { pumpTransientQueue(); return; }
  const remaining = activeTransient.until - simTime;
  if (activeTransient.target === 'coach' && ui.coach) ui.coach.classList.toggle('dim', remaining <= .65);
  if (remaining <= 0) {
    clearTransientNode(activeTransient.target);
    activeTransient = null;
    pumpTransientQueue();
  }
}

function setCoach(text) { queueTransient(text, '', 1, 'banner'); }
function setTutorial(text) { queueTransient(text, 'tutorial', 3, 'coach'); }

function paintPauseButton() {
  if (!ui.pauseButton) return;
  setTextIfChanged(ui.pauseButton, kit.paused ? '▶' : 'Ⅱ');
  ui.pauseButton.setAttribute('aria-label', kit.paused ? 'Resume voyage' : 'Pause voyage');
}

function addSettingsButton(box, label, action) {
  const button = document.createElement('button');
  button.type = 'button'; button.textContent = label;
  button.style.cssText = 'font:inherit;font-size:16px;color:#0b0f14;background:#4fd0b6;border:0;border-radius:10px;padding:12px 18px;min-width:min(70vw,280px);font-weight:700;';
  button.addEventListener('click', action); box.appendChild(button);
}

function addVolumeControl(box, label, value, setter) {
  const wrap = document.createElement('label');
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;width:min(70vw,280px);font-size:14px;text-align:left;';
  const text = document.createElement('span'); text.textContent = label + ': ' + Math.round(value * 100) + '%';
  const input = document.createElement('input'); input.type = 'range'; input.min = '0'; input.max = '1'; input.step = '.05'; input.value = String(value); input.style.width = '100%';
  input.addEventListener('input', () => { const next = Number(input.value); setter(next); text.textContent = label + ': ' + Math.round(next * 100) + '%'; });
  wrap.append(text, input); box.appendChild(wrap);
}

function openSettingsMenu() {
  kit.openSettings([(box) => {
    addVolumeControl(box, 'Music volume', kit.audio.prefs.music, (value) => kit.audio.setMusicVolume(value));
    addVolumeControl(box, 'SFX volume', kit.audio.prefs.sfx, (value) => kit.audio.setSfxVolume(value));
    addSettingsButton(box, 'RESTART VOYAGE', () => kit.restart());
    addSettingsButton(box, 'FULLSCREEN', () => kit.requestFullscreen());
  }]);
}

function forceEvent(type) {
  const name = typeof type === 'string' ? type : 'cache';
  if (name === 'storm' || name === 'forceStorm') { forceStorm(); return; }
  if (name === 'goal' || name === 'bonus') { state.gold += 1000; setBanner('+1000 GOLD', 'good', 1); checkVictory(); return; }
  const pickup = pickups.caches.find((candidate) => !candidate.collected) || pickups.crates.find((candidate) => !candidate.collected);
  if (pickup) { vessel.x = pickup.x; vessel.z = pickup.z; setCoach('TEST · PICKUP READY'); }
}

function forceStorm() {
  const storm = stormVisuals[0]; if (!storm) return;
  vessel.x = storm.state.x; vessel.z = storm.state.z; vessel.speed = 25; vessel.stormClock = 0; state.mode = 'sailing'; dockIndex = -1; ui.dockPanel.classList.add('hidden'); setBanner('STORM TEST CELL', 'storm', 1); startAudio();
}

function consumeProbeSwitches() {
  if (probe.forceStorm) { probe.forceStorm = false; forceStorm(); }
  if (probe.forceEvent) { const value = probe.forceEvent; probe.forceEvent = false; forceEvent(value === true ? 'cache' : value); }
  if (state.forceStorm) { state.forceStorm = false; forceStorm(); }
  if (state.forceEvent) { const value = state.forceEvent; state.forceEvent = false; forceEvent(value); }
}

function updateBoatVisual() {
  const sail = getSailData();
  const pose = vesselVisualState();
  const visualStep = 1 / 60;
  boatPulseVelocity += -boatPulse * 260 * visualStep;
  boatPulseVelocity *= Math.exp(-18 * visualStep);
  boatPulse += boatPulseVelocity * visualStep;
  if (reducedMotion) boatPulse = boatPulseVelocity = 0;
  boatLevels.forEach((level, index) => { level.visible = index === state.hull; });
  const bob = reducedMotion ? 0 : pose === 'IDLE' ? Math.sin(simTime * 2.1) * .7 : pose === 'DOCKED' ? Math.sin(simTime * 1.4) * .25 : Math.sin(simTime * 3.4) * .32;
  boatRoot.position.set(vessel.x, 1.6 + bob, vessel.z); boatRoot.rotation.y = -vessel.heading; boatRoot.rotation.x = vessel.heel + boatPulse * .012; boatRoot.rotation.z = vessel.pitch;
  boatRoot.scale.setScalar(clamp(1 + boatPulse * .012, .96, 1.035));
  const family = hullByLevel(state.hull); boatShadow.scale.set(family.length / 44, family.beam / 15, 1); boatShadow.material.opacity = .22 + clamp(vessel.speed / 70, 0, .12);
  boatLevelVisuals.forEach((visual, index) => {
    const active = index === state.hull;
    const sailStateScale = pose === 'BOOST' ? 1.16 : pose === 'DOCKED' ? .72 : pose === 'STORM RUN' ? .9 : 1;
    visual.sailGroup.rotation.y = vessel.trim * .56; visual.sailGroup.scale.x = sailStateScale;
    visual.sail.scale.x = (.28 + (1 - sail.luff) * .72) * (pose === 'IDLE' ? .82 : 1); visual.jib.scale.x = (.36 + (1 - sail.luff) * .64) * (pose === 'IDLE' ? .86 : 1);
    visual.sailMaterial.color.setHex(sail.luff > .25 ? COLORS.coral : HULL_FAMILY[index].sail);
    visual.telltaleA.rotation.z = reducedMotion ? 0 : Math.sin(simTime * 8 + index) * (.12 + sail.luff * .7); visual.telltaleB.rotation.z = reducedMotion ? 0 : Math.cos(simTime * 7 + index) * (.1 + sail.luff * .6);
    visual.telltaleA.visible = active && pose !== 'DOCKED'; visual.telltaleB.visible = active && pose !== 'DOCKED'; visual.flag.rotation.z = reducedMotion ? 0 : (pose === 'BOOST' ? Math.sin(simTime * 10) * .32 : Math.sin(simTime * 4 + index) * .08); visual.lantern.material.opacity = pose === 'STORM RUN' ? .98 : pose === 'IDLE' ? .66 + Math.sin(simTime * 2 + index) * .12 : .82;
  });
  contactAccent = Math.max(0, contactAccent - visualStep * 4.8);
  contactAccentScale = 1 + (1 - contactAccent) * 1.9;
  contactRing.visible = contactAccent > 0 && !reducedMotion; contactRing.scale.setScalar(contactAccentScale); contactRingMaterial.opacity = contactAccent * .72;
}

function updateWorldVisuals() {
  windArrows.forEach((arrow, index) => {
    const angle = wind.angle; const radius = 95 + index * 42; const side = index % 2 ? -1 : 1; const x = vessel.x + Math.cos(angle + Math.PI / 2) * side * radius + Math.cos(angle) * (index - 2) * 36; const z = vessel.z + Math.sin(angle + Math.PI / 2) * side * radius + Math.sin(angle) * (index - 2) * 36;
    arrow.position.set(x, 8 + (index % 3) * 5, z); arrow.setDirection(new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle))); arrow.setLength(27 + index * 3, 8, 4); arrow.line.material.opacity = .23 + (index === 2 ? .22 : 0);
  });
  updateBoatVisual();
  waterUniforms.uTime.value = reducedMotion ? 0 : simTime; scene.fog.color.set(state.inStorm ? 0x38435f : 0x72b1bd); scene.background.set(state.inStorm ? 0x38435f : 0x72b1bd);
  const visualStep = 1 / 60;
  cameraDipVelocity += -cameraDip * 250 * visualStep;
  cameraDipVelocity *= Math.exp(-19 * visualStep);
  cameraDip += cameraDipVelocity * visualStep;
  if (reducedMotion) cameraDip = cameraDipVelocity = 0;
  cameraGoal.set(vessel.x - Math.cos(vessel.heading) * (76 + vessel.speed * .34), 62 + vessel.speed * .12, vessel.z - Math.sin(vessel.heading) * (76 + vessel.speed * .34));
  cameraGoal.y += cameraDip; camera.position.lerp(cameraGoal, reducedMotion ? .2 : .075); const lookAhead = reducedMotion ? 18 : 18 + vessel.speed * .34; cameraLook.set(vessel.x + Math.cos(vessel.heading) * lookAhead, 2 + cameraDip * .3, vessel.z + Math.sin(vessel.heading) * lookAhead); camera.lookAt(cameraLook); camera.fov = 52 + (reducedMotion ? 0 : clamp(vessel.speed / 60, 0, 1) * 5); camera.updateProjectionMatrix();
}

function updateUI() {
  syncProbe();
  const region = currentRegion(); const sail = getSailData();
  const hull = hullByLevel(state.hull);
  const stateIcon = vessel.boostTimer > 0 ? '⚡ ' : state.inStorm ? '☁ ' : '⛵ ';
  setTextIfChanged(ui.gold, '◉ ' + fmtGold(state.gold) + 'g'); setTextIfChanged(ui.hull, stateIcon + hull.name); setTextIfChanged(ui.cargo, '▱ ' + cargoCount() + ' / ' + capacity());
  setTextIfChanged(ui.time, '◷ ' + formatTime(simTime));
  ui.windArrow.style.transform = 'rotate(' + (wind.angle * 180 / Math.PI) + 'deg)'; setTextIfChanged(ui.windReadout, Math.round(wind.speed)); ui.windReadout.setAttribute('aria-label', 'Wind speed ' + Math.round(wind.speed)); ui.windMeter.style.transform = 'scaleX(' + clamp(sail.trimEfficiency, .06, 1) + ')';
  setTextIfChanged(ui.regionName, region.name);
  const routeText = routeRun ? routeById(routeRun.id).name + ' · ' + Math.min(routeRun.legIndex + 1, routeById(routeRun.id).docks.length) + '/' + routeById(routeRun.id).docks.length + ' · ' + formatTime(simTime - routeRun.startedAt) : ''; setTextIfChanged(ui.routeLeg, routeText);
  const trimAngle = vessel.trim * 180 / Math.PI; ui.trimNeedle.style.transform = 'rotate(' + trimAngle + 'deg)'; ui.trimKnob.style.transform = 'rotate(' + trimAngle + 'deg) translateY(-1px)'; setTextIfChanged(ui.speed, Math.round(vessel.speed) + ' kt'); paintPauseButton();
  updateTransientQueue();
  renderRouteBoard();
  renderContracts();
  if (dockIndex >= 0) renderDockPanel();
}

function renderRouteBoard() {
  Object.keys(ROUTE_FAMILY).forEach((id) => {
    const card = document.querySelector('[data-route-card="' + id + '"]'); const button = card && card.querySelector('.route-button'); const medalNode = card && card.querySelector('[data-medal="' + id + '"]'); const unlocked = isRouteUnlocked(id); const medals = state.routeMedals[id] || 0;
    if (!card || !button || !medalNode) return;
    card.classList.toggle('locked', !unlocked); setTextIfChanged(medalNode, medals ? '★'.repeat(medals) : '○'); button.disabled = !unlocked || !!routeRun; setTextIfChanged(button, routeRun ? (routeRun.id === id ? 'ACTIVE' : 'BUSY') : unlocked ? 'START RUN' : 'LOCKED');
  });
  const status = state.victory ? 'GOAL REACHED · FREE SAIL' : routeRun ? 'ACTIVE · ' + routeById(routeRun.id).name : state.routeMedals.rush ? 'CHAIN COMPLETE' : 'READY · COASTAL RUN'; setTextIfChanged(ui.routeStatus, status);
  if (ui.routeToggle) { setTextIfChanged(ui.routeToggle, ui.routePanel.classList.contains('expanded') ? '−' : '＋'); ui.routeToggle.setAttribute('aria-label', ui.routePanel.classList.contains('expanded') ? 'Close route board' : 'Open route board'); }
}

function renderContracts() {
  if (!ui.contractList) return;
  const renderKey = CONTRACT_FAMILY.map((contract) => {
    const entry = state.contracts[contract.id];
    return contract.id + ':' + entry.progress + ':' + entry.claimed;
  }).join('|');
  if (renderKey === contractRenderKey) return;
  contractRenderKey = renderKey;
  ui.contractList.innerHTML = CONTRACT_FAMILY.map((contract) => {
    const entry = state.contracts[contract.id];
    const complete = entry.progress >= contract.target;
    const status = entry.claimed ? 'CLAIMED' : complete ? 'CLAIM' : entry.progress + ' / ' + contract.target;
    return '<div class="contract-card' + (entry.claimed ? ' claimed' : '') + '"><div class="contract-head"><span class="contract-name">' + contract.name + '</span><span class="contract-progress">' + status + '</span></div><div class="contract-copy">' + contract.copy + ' Reward ' + contract.reward + 'g.</div><button class="contract-button" data-action="claim-contract" data-contract="' + contract.id + '"' + (!complete || entry.claimed ? ' disabled' : '') + '>' + (entry.claimed ? 'CLAIMED' : complete ? 'CLAIM REWARD' : 'IN PROGRESS') + '</button></div>';
  }).join('');
  ui.contractList.querySelectorAll('[data-action]').forEach((button) => bindDomPointer(button));
}

function renderDockPanel() {
  if (dockIndex < 0) return;
  const renderKey = dockIndex + '|' + state.gold + '|' + state.hull + '|' + state.cargo.join(',');
  if (renderKey === dockRenderKey) return;
  dockRenderKey = renderKey;
  const region = regionById(docks[dockIndex].regionId); let html = '<div class="trade-row"><div class="good-name">GOOD</div><div class="good-price">PRICE</div><div></div><div></div></div>';
  GOODS.forEach((good, index) => {
    const buyPrice = priceFor(region, index, true); const sellPrice = priceFor(region, index, false);
    html += '<div class="trade-row"><div><div class="good-name" style="color:#' + good.color.toString(16).padStart(6, '0') + '">' + good.name + '</div><div class="good-count">x' + state.cargo[index] + '</div></div><div class="good-price">' + sellPrice + 'g</div><button class="mini-button buy-button" data-action="buy" data-good="' + index + '">BUY ' + buyPrice + '</button><button class="mini-button sell-button" data-action="sell" data-good="' + index + '">SELL</button></div>';
  });
  ui.tradeTable.innerHTML = html;
  ui.tradeTable.querySelectorAll('[data-action]').forEach((button) => bindDomPointer(button));
  const requirement = upgradeRequirement(); const canUpgrade = state.hull < 3 && !requirement; setTextIfChanged(ui.upgradeCopy, state.hull >= 3 ? 'Flagship hull fitted. The sea is yours.' : requirement || 'Next hull adds hold space, speed, and a new sail livery.'); setTextIfChanged(ui.upgradeButton, state.hull >= 3 ? 'FLAGSHIP FITTED' : 'UPGRADE ' + upgradeCost() + 'G'); ui.upgradeButton.disabled = !canUpgrade || state.gold < upgradeCost();
}

function startAudio() { if (audioStarted) return; audioStarted = true; kit.audio.resume(); kit.audio.music('wind', 900); }

function stepSim(step) {
  if (state.mode === 'docked') { updateUI(); return; }
  simTime += step; updateWind(); consumeProbeSwitches(); updateBoostLanes(step); updateStorms(step); updateRain(step); updateSailing(step); checkVictory();
  if (Math.floor(simTime) % 8 === 0 && Math.abs((simTime % 8) - step) < step * 1.5) saveGame();
  syncProbe(); updateUI();
}

function resize() {
  const width = Math.max(320, window.innerWidth); const height = Math.max(480, window.innerHeight); const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(pixelRatio); renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
  if (resizeTimer) clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }, 150);
}

function seedPointer(event, zone) {
  const existing = kit.input.pointers.get(event.pointerId) || { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, downAt: performance.now(), zone: null };
  existing.x = event.clientX; existing.y = event.clientY; existing.zone = zone; kit.input.pointers.set(event.pointerId, existing);
}

function bindDomPointer(node) {
  if (node.dataset.bound === '1') return; node.dataset.bound = '1';
  node.addEventListener('pointerdown', (event) => { seedPointer(event, 'ui'); event.stopPropagation(); startAudio(); }, { passive: true });
  node.addEventListener('click', () => handleAction(node.dataset.action, node.dataset.route, node.dataset.good, node.dataset.contract));
}

function handleAction(action, value, goodValue, contractValue) {
  startAudio();
  if (action === 'begin') {
    titleStarted = true; if (ui.titlePanel) ui.titlePanel.classList.add('hidden'); kit.resume('title'); if (state.tutorialStage < 5) setTutorial(tutorialMessage()); else setCoach('VOYAGE RESTORED'); updateUI(); return;
  }
  if (kit.paused && action !== 'settings' && action !== 'toggle-pause') return;
  if (action === 'settings') { openSettingsMenu(); return; }
  if (action === 'toggle-pause') { if (kit.paused) kit.resume('manual'); else kit.pause('manual'); paintPauseButton(); return; }
  if (action === 'toggle-routes') { ui.routePanel.classList.toggle('expanded'); updateUI(); return; }
  if (action === 'start-route') { startRoute(value); return; }
  if (action === 'close-dock') { closeDock(); return; }
  if (action === 'upgrade') { upgradeHull(); return; }
  if (action === 'claim-contract') { claimContract(contractValue); return; }
  if (action === 'buy') { buy(Number(goodValue)); return; }
  if (action === 'sell') { sell(Number(goodValue)); }
}

function onCanvasPointerDown(event) { if (kit.paused) return; seedPointer(event, 'canvas'); event.preventDefault(); event.stopPropagation(); if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId); startAudio(); }
function onCanvasPointerUp(event) {
  if (kit.paused) return;
  const pointer = kit.input.pointers.get(event.pointerId); if (!pointer) return;
  if (pointer.zone === 'canvas' && Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) < 16) setCourseFromScreen(event.clientX, event.clientY);
}

function onTrimPointerDown(event) {
  if (kit.paused) return;
  seedPointer(event, 'trim'); event.preventDefault(); event.stopPropagation(); if (ui.trimControl.setPointerCapture) ui.trimControl.setPointerCapture(event.pointerId); updateTrimFromScreen(event.clientX, event.clientY);
}

document.querySelectorAll('[data-action]').forEach((node) => bindDomPointer(node));
canvas.addEventListener('pointerdown', onCanvasPointerDown, { passive: false });
canvas.addEventListener('pointerup', onCanvasPointerUp, { passive: false });
canvas.addEventListener('pointercancel', onCanvasPointerUp, { passive: false });
ui.trimControl.addEventListener('pointerdown', onTrimPointerDown, { passive: false });
canvas.addEventListener('contextmenu', (event) => event.preventDefault());
window.addEventListener('keydown', (event) => {
  if (kit.paused) return;
  if (event.target && event.target.closest && event.target.closest('button, input, select, textarea')) return;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) event.preventDefault();
  if (event.code === 'KeyR') kit.restart();
  if (event.code === 'KeyE' || event.code === 'Enter' || event.code === 'Space') { event.preventDefault(); startAudio(); tryDock(); }
});
window.addEventListener('resize', resize);
window.addEventListener('beforeunload', saveGame);
window.addEventListener('pagehide', saveGame);
document.addEventListener('visibilitychange', () => { if (document.hidden && booted) saveGame(); });

async function boot() {
  kit.loader.progress(.1);
  initScene();
  kit.loader.progress(.34);
  await kit.audio.preload(SFX_NAMES);
  kit.loader.progress(.7);
  loadGame();
  pickups.caches.forEach((pickup) => { pickup.visual.visible = !pickup.collected; });
  pickups.crates.forEach((pickup) => { pickup.visual.visible = !pickup.collected; });
  kit.loader.progress(.84);
  kit.registerPWA();
  kit.pause('title');
  booted = true;
  updateUI();
  kit.loader.progress(1);
  kit.loader.hide();
  requestAnimationFrame(frame);
}

function frame(now) {
  if (!frameLast) frameLast = now;
  const frameDelta = Math.min(.12, Math.max(0, (now - frameLast) / 1000)); frameLast = now;
  const juice = kit.juice.frame();
  if (kit.paused) { accumulator = 0; } else if (!juice.frozen) {
    accumulator += frameDelta;
    let steps = 0;
    while (accumulator >= STEP && steps < 8) { stepSim(STEP); accumulator -= STEP; steps++; }
  }
  updateWorldVisuals();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

boot().catch(() => {
  kit.loader.hide();
  booted = true;
  kit.pause('title');
  updateUI();
  requestAnimationFrame(frame);
});
