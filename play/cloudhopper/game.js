import * as THREE from 'three';

const { GGKit } = window;
const canvas = document.getElementById('scene');

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;
const REGION_SEED = 1001;
const FIXED_STEP = 1 / 60;
const MAX_SIM_STEPS = 40;

const AIRCRAFT = [
  { id: 'skylark', name: 'Skylark S1', role: 'Balanced scout', color: 0xf0d9a1, accent: 0xe98269, stall: 30, max: 76, bestGlide: 43, landingMin: 34, landingMax: 46, liftoff: 41, burn: 1.2, lift: .83, unlock: 0, silhouette: 'scout' },
  { id: 'wayfarer', name: 'Wayfarer C2', role: 'Long range courier', color: 0xb9d9e5, accent: 0x42a7bd, stall: 27, max: 70, bestGlide: 40, landingMin: 31, landingMax: 43, liftoff: 38, burn: .91, lift: .89, unlock: 3, silhouette: 'courier' },
  { id: 'sunracer', name: 'Sunracer X', role: 'High altitude wing', color: 0xffb66f, accent: 0xed6a7d, stall: 37, max: 94, bestGlide: 54, landingMin: 43, landingMax: 58, liftoff: 48, burn: 1.44, lift: .77, unlock: 8, silhouette: 'racer' },
];

const MISSIONS = [
  { id: 'first-flight', title: 'First Flight', kind: 'tutorial', type: 'ring', targetCount: 8, strip: 0, description: 'Take off, bank through the calibration line, and bring it home.', time: '3 min', tier: 'training', biome: 'dawn' },
  { id: 'dawn-line', title: 'Dawn Line', kind: 'ring', type: 'ring', targetCount: 8, strip: 0, description: 'Eight gates trace the long morning calibration route.', time: '3 min', tier: 'ring course', biome: 'dawn' },
  { id: 'canyon-gates', title: 'Canyon Gates', kind: 'ring', type: 'ring', targetCount: 10, strip: 1, description: 'Thread the red gullies and land at Mesa Strip.', time: '3 min', tier: 'ring course', biome: 'mesa' },
  { id: 'lake-thread', title: 'Lake Thread', kind: 'ring', type: 'ring', targetCount: 12, strip: 2, description: 'Hold a low line across the blue and keep your stall margin.', time: '4 min', tier: 'ring course', biome: 'lake' },
  { id: 'switchback-strip', title: 'Switchback Strip', kind: 'landing', type: 'free', targetCount: 0, strip: 3, description: 'Free-flight navigation, then a narrow hillside approach.', time: '4 min', tier: 'landing', biome: 'cliff' },
  { id: 'mesa-cargo', title: 'Mesa Cargo', kind: 'cargo', type: 'cargo', targetCount: 5, strip: 1, description: 'Collect five marked cargo hops before the fuel line turns amber.', time: '3 min', tier: 'cargo hop', biome: 'mesa' },
  { id: 'fogline-cargo', title: 'Fogline Cargo', kind: 'cargo', type: 'cargo', targetCount: 6, strip: 4, description: 'Read the horizon lights through a thick morning layer.', time: '4 min', tier: 'cargo hop', biome: 'fog' },
  { id: 'copper-arch', title: 'Copper Arch', kind: 'ring', type: 'ring', targetCount: 12, strip: 5, description: 'A fast gate ladder over the ochre basin.', time: '4 min', tier: 'ring course', biome: 'copper' },
  { id: 'low-tide', title: 'Low Tide', kind: 'cargo', type: 'cargo', targetCount: 7, strip: 2, description: 'Keep the wing clean over the lake and pick up the low crates.', time: '4 min', tier: 'cargo hop', biome: 'lake' },
  { id: 'summit-courier', title: 'Summit Courier', kind: 'cargo', type: 'cargo', targetCount: 8, strip: 5, description: 'Climb for the summit drop, then descend into a short final.', time: '5 min', tier: 'cargo hop', biome: 'summit' },
  { id: 'needle-pass', title: 'Needle Pass', kind: 'ring', type: 'ring', targetCount: 14, strip: 3, description: 'Tight spacing makes the bank angle matter more than speed.', time: '4 min', tier: 'ring course', biome: 'cliff' },
  { id: 'grand-circuit', title: 'Grand Circuit', kind: 'mixed', type: 'mixed', targetCount: 16, strip: 5, description: 'The complete route. Gate, cargo, approach, repeat.', time: '5 min', tier: 'mastery', biome: 'summit' },
  { id: 'stormline-relay', title: 'Stormline Relay', kind: 'mixed', type: 'mixed', targetCount: 18, strip: 4, description: 'A long relay across the shifting procedural weather line.', time: '5 min', tier: 'mastery', biome: 'fog' },
  { id: 'horizon-cup', title: 'Horizon Cup', kind: 'mixed', type: 'mixed', targetCount: 20, strip: 5, description: 'The final line is yours if you can read the whole sky.', time: '5 min', tier: 'mastery', biome: 'summit' },
];

const STRIPS = [
  { id: 'strip-01', name: 'Strip 01 / Home Beacon', x: 58, start: 8200, end: 8320, width: 25, color: 0xffd177, kit: 'dawn' },
  { id: 'strip-02', name: 'Strip 02 / Mesa North', x: -74, start: 10000, end: 10120, width: 30, color: 0x8ee5c5, kit: 'mesa' },
  { id: 'strip-03', name: 'Strip 03 / Lake Shelf', x: 96, start: 12100, end: 12225, width: 28, color: 0x79d6ec, kit: 'lake' },
  { id: 'strip-04', name: 'Strip 04 / Switchback', x: -112, start: 14300, end: 14430, width: 26, color: 0xffa77e, kit: 'cliff' },
  { id: 'strip-05', name: 'Strip 05 / Fogline', x: 54, start: 16400, end: 16540, width: 32, color: 0xc1d8ec, kit: 'fog' },
  { id: 'strip-06', name: 'Strip 06 / Summit', x: -40, start: 18600, end: 18750, width: 24, color: 0xffd177, kit: 'summit' },
];

const AUDIO = {
  flightDawn: './assets/flight_dawn.mp3', flightSunset: './assets/flight_sunset.mp3',
  uiConfirm: './assets/ui_confirm.mp3', uiSelect: './assets/ui_select.mp3', ringPass: './assets/ring_pass.mp3',
  cargoPickup: './assets/cargo_pickup.mp3', stallWarn: './assets/stall_warn.mp3', fuelLow: './assets/fuel_low.mp3',
  landing: './assets/landing.mp3', crash: './assets/crash.mp3', engine: './assets/engine.mp3',
};
const SFX = ['uiConfirm', 'uiSelect', 'ringPass', 'cargoPickup', 'stallWarn', 'fuelLow', 'landing', 'crash', 'engine'];
const PLANE_IDS = new Set(AIRCRAFT.map((plane) => plane.id));
const MISSION_IDS = new Set(MISSIONS.map((mission) => mission.id));

function validProgress(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.unlocked) || !Array.isArray(value.completed)) return false;
  if (!PLANE_IDS.has(value.selected)) return false;
  if (!value.unlocked.includes(value.selected)) return false;
  if (value.unlocked.some((id) => !PLANE_IDS.has(id))) return false;
  if (value.completed.some((id) => !MISSION_IDS.has(id))) return false;
  if (new Set(value.unlocked).size !== value.unlocked.length || new Set(value.completed).size !== value.completed.length) return false;
  if (typeof value.tutorialComplete !== 'boolean') return false;
  if (value.ace != null && typeof value.ace !== 'boolean') return false;
  if (value.completed.some((id) => {
    const index = MISSIONS.findIndex((mission) => mission.id === id);
    return MISSIONS.slice(0, index).some((mission) => !value.completed.includes(mission.id));
  })) return false;
  if (value.unlocked.includes('wayfarer') && value.completed.length < 3) return false;
  if (value.unlocked.includes('sunracer') && value.completed.length < 8) return false;
  if (value.best != null && (typeof value.best !== 'object' || Array.isArray(value.best))) return false;
  if (value.best && Object.entries(value.best).some(([id, time]) => !MISSION_IDS.has(id) || !Number.isFinite(time) || time < 0)) return false;
  return Number.isFinite(value.credits) && value.credits >= 0 && value.credits <= 999999;
}

const kit = GGKit.create({
  slug: 'cloudhopper',
  orientation: 'landscape',
  validateSave: validProgress,
  onPause(reason) { onKitPause(reason); },
  onResume() { lastFrame = performance.now(); },
  onRestart() { if (kit.paused) kit.resume('manual'); beginFlight(game.missionIndex); },
});
kit.registerPWA();
kit.audio.register(AUDIO);

const defaultProgress = { version: 1, unlocked: ['skylark'], selected: 'skylark', completed: [], credits: 0, tutorialComplete: false, ace: false, best: {} };
let progress = kit.save.get(defaultProgress);
if (!validProgress(progress)) progress = defaultProgress;
progress.best = progress.best && typeof progress.best === 'object' ? progress.best : {};
progress.ace = !!progress.ace;

let renderer;
let scene;
let camera;
let world;
let terrainGroup;
let waterGroup;
let landmarkGroup;
let ringGroup;
let cloudGroup;
let planeGroup;
let planeParts = null;
let terrainMesh;
let trailPoints;
let burstPoints;
let trailPositionArray;
let burstPositionArray;
let bursts;
let cloudMeshes = [];
let cloudStates = [];
let cloudPuffGeometry;
let cloudMaterial;
let ringObjects = [];
let horizonGroup;
let propPool = [];
let propStates = [];
let windPoints;
let windPositionArray;
let windSizeArray;
let windAlphaArray;
let waterSurfaceMaterial;
let terrainField = null;
let terrainFieldColumns = 0;
let terrainFieldRows = 0;
let terrainFieldLeft = 0;
let terrainFieldZStart = 0;
let terrainFieldWidth = 0;
let terrainFieldZStep = 0;
const sampledResult = { h: 0, water: false };
let skyDome;
let planeShadow;
let shadowGroup;
let shadowMaterial;
let sharedPropGeometries;
let sharedPropMaterials;
let planeModelCache = new Map();
let cameraVelocity = new THREE.Vector3();
let lookTarget = new THREE.Vector3();
let springDelta = new THREE.Vector3();
let cameraDesired = new THREE.Vector3();
let burstOrigin = new THREE.Vector3();
let lastFrame = performance.now();
let visualClock = 0;
let simAccumulator = 0;
let lastStallSound = 0;
let lastFuelSound = 0;
let engineCueTimer = 0;
let toastTimer = 0;
let pauseKeyLatch = false;
let menuSeed = 801;
let burstSerial = 0;
const tilt = { supported: false, enabled: false, beta: 0, gamma: 0, neutralBeta: null, neutralGamma: null, listening: false };
let systemReducedMotion = false;

const verificationState = { speed: 0, altitude: 0, crashed: 0, assistsOn: true, forceScenicTour: false };

const game = {
  mode: 'menu', missionIndex: 0, mission: MISSIONS[0], seed: REGION_SEED, routeSeed: menuSeed, elapsed: 0, sortie: 0,
  player: null, nextTarget: 0, targetTotal: 0, fuelOut: false, tutorialStep: 0, result: null, stall: false,
  challenge: { phase: 'menu', ringMisses: 0 }, ringBeat: { time: 0, kind: 'pass' }, cameraDip: 0, cameraKick: 0, launchCountdown: 0,
  assistsOn: !progress.ace, graceBounces: 0, crashedCount: 0,
};

window.__ch = {
  state: verificationState,
  get forceScenicTour() { return verificationState.forceScenicTour; },
  set forceScenicTour(value) { verificationState.forceScenicTour = !!value; },
};

const ui = {
  title: document.getElementById('title-screen'), hud: document.getElementById('hud'), result: document.getElementById('result-screen'),
  pause: document.getElementById('pause-screen'), catalog: document.getElementById('catalog-screen'), catalogTitle: document.getElementById('catalog-title'),
  catalogContent: document.getElementById('catalog-content'), speed: document.getElementById('speed-value'), speedMeter: document.getElementById('speed-meter'),
  altitude: document.getElementById('altitude-value'), altitudeMeter: document.getElementById('altitude-meter'), fuel: document.getElementById('fuel-value'),
  fuelMeter: document.getElementById('fuel-meter'), target: document.getElementById('target-value'), targetMeter: document.getElementById('target-meter'),
  targetLabel: document.getElementById('target-label'), targetUnit: document.getElementById('target-unit'), mission: document.getElementById('hud-mission'),
  alert: document.getElementById('flight-alert'), alertText: document.getElementById('alert-text'), objective: document.getElementById('objective-text'),
  tutorial: document.getElementById('tutorial-card'), tutorialStep: document.getElementById('tutorial-step'), tutorialText: document.getElementById('tutorial-text'),
  stick: document.getElementById('stick-knob'), throttle: document.getElementById('throttle-knob'), throttleFill: document.getElementById('throttle-fill'), toast: document.getElementById('toast'),
  resultKicker: document.getElementById('result-kicker'), resultTitle: document.getElementById('result-title'), resultCopy: document.getElementById('result-copy'),
  resultTime: document.getElementById('result-time'), resultGates: document.getElementById('result-gates'), resultRating: document.getElementById('result-rating'),
  stickControl: document.getElementById('stick-control'), throttleControl: document.getElementById('throttle-control'), speedArc: document.getElementById('speed-arc'), speedBand: document.getElementById('speed-band'),
  horizon: document.getElementById('horizon-cue'), flightPath: document.getElementById('flight-path'), nextTarget: document.getElementById('next-target-indicator'), resultVista: document.getElementById('result-vista'),
  loading: document.getElementById('loading-screen'), loadingBar: document.getElementById('loading-bar'), loadingStage: document.getElementById('loading-stage'), loadingPercent: document.getElementById('loading-percent'),
  launchCountdown: document.getElementById('launch-countdown'),
};

const touch = { flightId: null, throttleId: null, x: 0, y: 0, throttle: .64, stickX: 0, stickY: 0, suppressUntil: 0 };
const controlInput = { pitch: 0, roll: 0, throttle: .64 };
const controlRects = { stick: { left: 0, top: 0, right: 0, bottom: 0 }, throttle: { left: 0, top: 0, right: 0, bottom: 0 } };

function hash(x, z, seed) {
  const value = Math.sin(x * 12.9898 + z * 78.233 + seed * .00117) * 43758.5453;
  return value - Math.floor(value);
}

function terrainAt(x, z, seed = game.seed) {
  const phase = seed * .000017;
  const broad = Math.sin(z * .0054 + phase * 2.1) * 11 + Math.sin(z * .0016 + phase * 4.2) * 7;
  const cross = Math.sin(x * .032 - z * .003 + phase * 3.7) * 7;
  const ridge = Math.pow(Math.abs(Math.sin(z * .009 + x * .011 + phase * 2)), 5) * 25;
  const rumble = (hash(Math.floor(x * .1), Math.floor(z * .08), seed) - .5) * 5;
  const lakeX = -66 + Math.sin(phase * 2.2) * 25;
  const lakeZ = 2480 + Math.cos(phase * 1.4) * 190;
  const lakeShape = ((x - lakeX) / 190) ** 2 + ((z - lakeZ) / 390) ** 2;
  const riverCenter = riverCenterAt(z, seed);
  const riverDistance = Math.abs(x - riverCenter);
  const riverWater = z > 3200 && z < 7900 && riverDistance < riverWidthAt(z, seed);
  const coastWater = z > 10800 && z < 13300 && x > coastXAt(z, seed);
  const riverValley = z > 3000 && z < 8100 ? -Math.max(0, 8 - riverDistance * .15) : 0;
  const coastValley = z > 10600 && z < 13400 ? -Math.max(0, (x - coastXAt(z, seed) + 30) * .06) : 0;
  if (lakeShape < 1) return { h: 2.25 + (1 - lakeShape) * .22, water: true };
  if (riverWater || coastWater) return { h: 2.42, water: true };
  return { h: Math.max(.4, 7 + broad + cross + ridge + rumble + riverValley + coastValley), water: false };
}

function lakeForSeed(seed = REGION_SEED) {
  const phase = seed * .000017;
  return { x: -66 + Math.sin(phase * 2.2) * 25, z: 2480 + Math.cos(phase * 1.4) * 190, width: 380, length: 720 };
}

function riverCenterAt(z, seed = REGION_SEED) {
  const phase = seed * .000017;
  return -26 + Math.sin(z * .00145 + phase * 3.2) * 62 + Math.sin(z * .0037 + phase) * 14;
}

function riverWidthAt(z, seed = REGION_SEED) {
  return 12 + (Math.sin(z * .0021 + seed * .001) + 1) * 2.4;
}

function coastXAt(z, seed = REGION_SEED) {
  const phase = seed * .000017;
  return 150 + Math.sin(z * .0018 + phase * 2.7) * 24 + Math.sin(z * .0041) * 7;
}

function sampledTerrainAt(x, z) {
  if (!terrainField) { const direct = terrainAt(x, z, game.seed); sampledResult.h = direct.h; sampledResult.water = direct.water; return sampledResult; }
  const col = clamp((x - terrainFieldLeft) / terrainFieldWidth * terrainFieldColumns, 0, terrainFieldColumns - .001);
  const row = clamp((z - terrainFieldZStart) / terrainFieldZStep, 0, terrainFieldRows - .001);
  const c0 = Math.floor(col); const r0 = Math.floor(row);
  const c1 = Math.min(terrainFieldColumns, c0 + 1); const r1 = Math.min(terrainFieldRows, r0 + 1);
  const tx = col - c0; const tz = row - r0;
  const i00 = r0 * (terrainFieldColumns + 1) + c0;
  const i10 = r0 * (terrainFieldColumns + 1) + c1;
  const i01 = r1 * (terrainFieldColumns + 1) + c0;
  const i11 = r1 * (terrainFieldColumns + 1) + c1;
  const h0 = lerp(terrainField.h[i00], terrainField.h[i10], tx);
  const h1 = lerp(terrainField.h[i01], terrainField.h[i11], tx);
  sampledResult.h = lerp(h0, h1, tz); sampledResult.water = !!(terrainField.water[i00] || terrainField.water[i10] || terrainField.water[i01] || terrainField.water[i11]);
  return sampledResult;
}

function worldTerrainAt(x, z) { return sampledTerrainAt(x, z); }

function terrainColor(height, x, z, isWater, seed = game.seed) {
  if (isWater) return [0.035, 0.28 + (Math.sin(x * .02 + z * .01) + 1) * .035, 0.46 + (Math.cos(z * .01) + 1) * .04];
  const eastWest = Math.sin(z * .0008 + x * .008) * .025;
  const slopeX = terrainAt(x + 6, z, seed).h - terrainAt(x - 6, z, seed).h;
  const slopeZ = terrainAt(x, z + 6, seed).h - terrainAt(x, z - 6, seed).h;
  const steepness = clamp(Math.hypot(slopeX, slopeZ) * .055, 0, 1);
  let hue = z < 7600 ? .29 : z < 11100 ? .045 : z < 13300 ? .15 : z < 15500 ? .07 : z < 17600 ? .54 : .12;
  let saturation = z < 15500 ? .47 : .36;
  let lightness = clamp(.29 + height * .008 + eastWest, .2, .58);
  if (height > 29 || steepness > .62) { hue = z > 17600 ? .1 : .06; saturation = .18; lightness = clamp(.34 + height * .006, .28, .62); }
  else if (height > 22 || steepness > .38) { hue = z > 15500 ? .08 : .095; saturation = .3; lightness = clamp(.3 + height * .007, .25, .52); }
  const color = new THREE.Color().setHSL(hue, saturation, lightness);
  return [color.r, color.g, color.b];
}

function makeMaterial(color, emissive = 0x000000, opacity = 1) {
  return new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: emissive ? .45 : 0, roughness: .82, metalness: .08, flatShading: true, transparent: opacity < 1, opacity });
}

function clearGroup(group) {
  if (!group) return;
  while (group.children.length) group.remove(group.children[group.children.length - 1]);
}

function makeWaterMaterial() {
  if (waterSurfaceMaterial) return waterSurfaceMaterial;
  waterSurfaceMaterial = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, deep: { value: new THREE.Color(0x176276) }, light: { value: new THREE.Color(0x80d4ca) } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'uniform float time; uniform vec3 deep; uniform vec3 light; varying vec2 vUv; void main(){vec2 p=vUv*vec2(18.0,7.0);float wave=sin(p.x+time*.55)+sin(p.y*1.7-time*.35);float glint=smoothstep(1.15,1.85,wave)*.32;vec3 color=mix(deep,light,glint);gl_FragColor=vec4(color,.84);}',
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  return waterSurfaceMaterial;
}

function makeRibbonGeometry(start, end, width, seed, mode) {
  const segments = mode === 'coast' ? 34 : 56;
  const positions = new Float32Array((segments + 1) * 2 * 3);
  const uvs = new Float32Array((segments + 1) * 2 * 2);
  const indices = [];
  for (let i = 0; i <= segments; i += 1) {
    const z = lerp(start, end, i / segments);
    const center = mode === 'coast' ? coastXAt(z, seed) : riverCenterAt(z, seed);
    const half = mode === 'coast' ? 280 - center : width * .5;
    const left = mode === 'coast' ? center : center - half;
    const right = mode === 'coast' ? 300 : center + half;
    const row = i * 2;
    positions[row * 3] = left; positions[row * 3 + 1] = 2.5; positions[row * 3 + 2] = -z;
    positions[(row + 1) * 3] = right; positions[(row + 1) * 3 + 1] = 2.5; positions[(row + 1) * 3 + 2] = -z;
    uvs[row * 2] = 0; uvs[row * 2 + 1] = i / segments;
    uvs[(row + 1) * 2] = 1; uvs[(row + 1) * 2 + 1] = i / segments;
    if (i < segments) { indices.push(row, row + 1, row + 2, row + 1, row + 3, row + 2); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

function buildTerrain(seed) {
  clearGroup(terrainGroup);
  clearGroup(waterGroup);
  const columns = 48;
  const rows = 360;
  const left = -260;
  const width = 520;
  const zStart = -220;
  const zStep = 54;
  const positions = new Float32Array((columns + 1) * (rows + 1) * 3);
  const colors = new Float32Array((columns + 1) * (rows + 1) * 3);
  const heights = new Float32Array((columns + 1) * (rows + 1));
  const waterFlags = new Uint8Array((columns + 1) * (rows + 1));
  const indices = [];
  let vertex = 0;
  for (let row = 0; row <= rows; row += 1) {
    const logicalZ = zStart + row * zStep;
    for (let col = 0; col <= columns; col += 1) {
      const x = left + (col / columns) * width;
      const sample = terrainAt(x, logicalZ, seed);
      heights[vertex] = sample.h;
      waterFlags[vertex] = sample.water ? 1 : 0;
      positions[vertex * 3] = x;
      positions[vertex * 3 + 1] = sample.h;
      positions[vertex * 3 + 2] = -logicalZ;
      const shade = terrainColor(sample.h, x, logicalZ, sample.water, seed);
      colors[vertex * 3] = shade[0]; colors[vertex * 3 + 1] = shade[1]; colors[vertex * 3 + 2] = shade[2];
      vertex += 1;
    }
  }
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const a = row * (columns + 1) + col;
      const b = a + 1;
      const c = a + columns + 1;
      const d = c + 1;
      if ((row + col) % 2) indices.push(a, b, c, b, d, c); else indices.push(a, b, d, a, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  terrainMesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, flatShading: true }));
  terrainMesh.receiveShadow = true;
  terrainGroup.add(terrainMesh);
  terrainField = { h: heights, water: waterFlags };
  terrainFieldColumns = columns; terrainFieldRows = rows; terrainFieldLeft = left; terrainFieldZStart = zStart; terrainFieldWidth = width; terrainFieldZStep = zStep;

  const waterMaterial = makeWaterMaterial();
  const lakeData = lakeForSeed(seed);
  const lake = new THREE.Mesh(new THREE.PlaneGeometry(lakeData.width, lakeData.length, 18, 30), waterMaterial);
  lake.rotation.x = -Math.PI / 2;
  lake.position.set(lakeData.x, 2.48, -lakeData.z);
  waterGroup.add(lake);
  const shoreMaterial = new THREE.MeshBasicMaterial({ color: 0xd5c58c, transparent: true, opacity: .6, side: THREE.DoubleSide });
  const shallowMaterial = new THREE.MeshBasicMaterial({ color: 0x69c8b3, transparent: true, opacity: .22, side: THREE.DoubleSide });
  [
    [lakeData.width * .52, lakeData.length * .52, shoreMaterial, 2.35],
    [lakeData.width * .47, lakeData.length * .47, shallowMaterial, 2.4],
  ].forEach(([widthValue, lengthValue, material, y]) => {
    const band = new THREE.Mesh(new THREE.PlaneGeometry(widthValue, lengthValue, 14, 20), material);
    band.rotation.x = -Math.PI / 2; band.position.set(lakeData.x, y, -lakeData.z); waterGroup.add(band);
  });
  for (let i = 0; i < 4; i += 1) {
    const foam = new THREE.Mesh(new THREE.TorusGeometry(1, .18, 4, 18), new THREE.MeshBasicMaterial({ color: 0xd9f3df, transparent: true, opacity: .42, side: THREE.DoubleSide }));
    foam.rotation.x = -Math.PI / 2;
    foam.scale.set(15 + i * 8, 1, 4 + i * 2);
    foam.position.set(lakeData.x + (i % 2 ? 90 : -110), 2.7 + i * .03, -(lakeData.z + (i - 2) * 125));
    waterGroup.add(foam);
  }
  const river = new THREE.Mesh(makeRibbonGeometry(3200, 7900, 28, seed, 'river'), waterMaterial);
  river.frustumCulled = true;
  waterGroup.add(river);
  const riverShore = new THREE.Mesh(makeRibbonGeometry(3200, 7900, 55, seed, 'river'), new THREE.MeshBasicMaterial({ color: 0x6ab29c, transparent: true, opacity: .18, side: THREE.DoubleSide, depthWrite: false }));
  riverShore.position.y = -.07;
  waterGroup.add(riverShore);
  const coast = new THREE.Mesh(makeRibbonGeometry(10800, 13300, 0, seed, 'coast'), waterMaterial);
  coast.frustumCulled = true;
  waterGroup.add(coast);
  const coastShore = new THREE.Mesh(makeRibbonGeometry(10800, 13300, 0, seed, 'coast'), new THREE.MeshBasicMaterial({ color: 0xd3c187, transparent: true, opacity: .34, side: THREE.DoubleSide, depthWrite: false }));
  coastShore.scale.set(.985, 1, 1); coastShore.position.y = -.08;
  waterGroup.add(coastShore);
}

function makeCloud(x, y, z, scale) {
  const group = new THREE.Group();
  group.position.set(x, y, -z);
  group.scale.setScalar(scale);
  if (!cloudPuffGeometry) cloudPuffGeometry = new THREE.PlaneGeometry(22, 9);
  if (!cloudMaterial) {
    cloudMaterial = new THREE.ShaderMaterial({
      uniforms: { tint: { value: new THREE.Color(0xeaf6ee) }, strength: { value: .42 } },
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'uniform vec3 tint; uniform float strength; varying vec2 vUv; void main(){float d=distance(vUv,vec2(.5));float a=(1.0-smoothstep(.08,.52,d))*strength;gl_FragColor=vec4(tint,a);}',
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
  }
  const puffA = new THREE.Mesh(cloudPuffGeometry, cloudMaterial);
  const puffB = new THREE.Mesh(cloudPuffGeometry, cloudMaterial);
  const puffC = new THREE.Mesh(cloudPuffGeometry, cloudMaterial);
  puffA.rotation.y = Math.PI; puffB.rotation.y = Math.PI; puffC.rotation.y = Math.PI;
  puffA.position.set(0, 0, 0); puffB.position.set(-9, -1, 2); puffC.position.set(10, -1.5, 1);
  puffB.scale.set(.72, .72, 1); puffC.scale.set(.84, .66, 1);
  group.add(puffA, puffB, puffC);
  cloudGroup.add(group);
  cloudMeshes.push(group);
  cloudStates.push({ phase: x * .02 + z * .004, speed: 1.2 + cloudStates.length * .06, wrap: 280 });
}

function buildCloudLayer(seed) {
  clearGroup(cloudGroup);
  cloudMeshes = [];
  cloudStates = [];
  for (let i = 0; i < 16; i += 1) {
    const x = -210 + hash(i * 4.3, 2, seed) * 420;
    const z = 480 + i * 1040 + hash(i * 9.2, 4, seed) * 420;
    makeCloud(x, 56 + hash(i, 5, seed) * 22, z, .78 + hash(i, 7, seed) * .6);
  }
  for (let i = 0; i < 10; i += 1) {
    const x = -230 + hash(i * 7.1, 8, seed) * 460;
    const z = 720 + i * 1710 + hash(i * 2.2, 6, seed) * 520;
    makeCloud(x, 112 + hash(i, 11, seed) * 34, z, 1.1 + hash(i, 13, seed) * .75);
  }
  for (let i = 0; i < 5; i += 1) {
    const x = -250 + i * 118;
    const z = 1800 + i * 3900;
    makeCloud(x, 66 + i * 4, z, 2.8 + (i % 2) * .7);
    cloudStates[cloudStates.length - 1].speed = .35 + i * .04;
    cloudStates[cloudStates.length - 1].wrap = 420;
  }
}

function makeBlobShadow(x, y, z, scaleX = 1, scaleZ = 1) {
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 24), shadowMaterial);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(x, y + .08, -z);
  shadow.scale.set(scaleX, scaleZ, 1);
  shadowGroup.add(shadow);
  return shadow;
}

function createPropPoolItem() {
  const group = new THREE.Group();
  group.visible = false;
  group.frustumCulled = true;
  const trunk = new THREE.Mesh(sharedPropGeometries.trunk, sharedPropMaterials.trunk);
  const crown = new THREE.Mesh(sharedPropGeometries.crown, sharedPropMaterials.crown);
  const crownTop = new THREE.Mesh(sharedPropGeometries.crown, sharedPropMaterials.crown);
  const rock = new THREE.Mesh(sharedPropGeometries.rock, sharedPropMaterials.rock);
  const wall = new THREE.Mesh(sharedPropGeometries.building, sharedPropMaterials.building);
  const roof = new THREE.Mesh(sharedPropGeometries.roof, sharedPropMaterials.roof);
  const marker = new THREE.Mesh(sharedPropGeometries.marker, sharedPropMaterials.copper);
  trunk.position.y = 2.2; crown.position.y = 6.3; crownTop.position.y = 8.2; crownTop.scale.set(.65, .7, .65);
  wall.position.y = 1.75; roof.position.y = 4.1; roof.rotation.y = Math.PI * .25;
  [trunk, crown, crownTop, rock, wall, roof, marker].forEach((mesh) => { mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); });
  landmarkGroup.add(group);
  return { group, parts: { trunk, crown, crownTop, rock, wall, roof, marker } };
}

function placeProp(item, kind, x, z, scale, rotation) {
  const sample = worldTerrainAt(x, z);
  if (sample.water) return false;
  const parts = item.parts;
  item.group.visible = true;
  item.group.position.set(x, sample.h, -z);
  item.group.rotation.y = rotation;
  item.group.scale.setScalar(scale);
  parts.trunk.visible = kind === 'tree'; parts.crown.visible = kind === 'tree'; parts.crownTop.visible = kind === 'tree';
  parts.rock.visible = kind === 'rock'; parts.wall.visible = kind === 'building'; parts.roof.visible = kind === 'building'; parts.marker.visible = kind === 'marker';
  if (kind === 'rock') parts.rock.material = z > 17600 ? sharedPropMaterials.snow : z > 13300 ? sharedPropMaterials.copper : sharedPropMaterials.rock;
  if (kind === 'tree') {
    const summit = z > 17600;
    parts.crown.material = summit ? sharedPropMaterials.snow : sharedPropMaterials.crown;
    parts.crownTop.material = summit ? sharedPropMaterials.snow : sharedPropMaterials.crown;
  }
  return true;
}

function buildProps(seed) {
  clearGroup(landmarkGroup);
  sharedPropGeometries = {
    rock: new THREE.DodecahedronGeometry(2.2, 0),
    trunk: new THREE.CylinderGeometry(.35, .55, 4.8, 5),
    crown: new THREE.ConeGeometry(2.6, 6.5, 6),
    marker: new THREE.OctahedronGeometry(1.3, 0),
    building: new THREE.BoxGeometry(5.5, 3.5, 5.5),
    roof: new THREE.ConeGeometry(4.1, 2.6, 4),
  };
  sharedPropMaterials = {
    rock: makeMaterial(0x6e6559), trunk: makeMaterial(0x5a4037), crown: makeMaterial(0x315f52),
    copper: makeMaterial(0xb86f50, 0x3d1710), snow: makeMaterial(0xc7d7d0),
    building: makeMaterial(0xc18c68), roof: makeMaterial(0x5e4b4b),
  };
  propPool = [];
  propStates = [];
  for (let i = 0; i < 220; i += 1) {
    const item = createPropPoolItem();
    propPool.push(item);
    let z;
    let x;
    let kind;
    if (i < 92) {
      z = 180 + i * 205 + hash(i, 31, seed) * 155;
      x = (hash(i, 41, seed) - .5) * 470;
      kind = i % 5 === 0 ? 'rock' : 'tree';
    } else if (i < 164) {
      z = 3320 + (i - 92) * 64 + hash(i, 33, seed) * 55;
      const riverX = riverCenterAt(z, seed);
      x = riverX + (i % 2 ? 1 : -1) * (27 + hash(i, 35, seed) * 42);
      kind = 'tree';
    } else if (i < 194) {
      z = i % 2 ? 2250 + (i - 164) * 45 : 10900 + (i - 164) * 76;
      const shoreline = i % 2 ? lakeForSeed(seed).x : coastXAt(z, seed);
      x = shoreline - 28 - hash(i, 37, seed) * 46;
      kind = i % 3 === 0 ? 'rock' : 'tree';
    } else {
      const village = i - 194;
      z = 4200 + Math.floor(village / 5) * 470 + hash(village, 39, seed) * 60;
      x = riverCenterAt(z, seed) + (village % 5 - 2) * 10 + hash(village, 43, seed) * 8;
      kind = 'building';
    }
    if (!placeProp(item, kind, x, z, .72 + hash(i, 47, seed) * .6, hash(i, 53, seed) * TAU)) item.group.visible = false;
    else if (kind === 'rock') item.group.scale.y *= .7 + hash(i, 59, seed) * .8;
    propStates.push({ kind, z });
  }
}

function buildSky() {
  const material = new THREE.ShaderMaterial({
    uniforms: { top: { value: new THREE.Color(0x172e5d) }, horizon: { value: new THREE.Color(0x8cc8c5) }, bottom: { value: new THREE.Color(0x345a6a) } },
    vertexShader: 'varying float vHeight; void main(){vHeight=normalize(position).y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; varying float vHeight; void main(){float t=smoothstep(-.18,.64,vHeight); vec3 c=mix(bottom,horizon,smoothstep(-.2,.18,vHeight)); c=mix(c,top,t); gl_FragColor=vec4(c,1.0);}',
    side: THREE.BackSide, depthWrite: false,
  });
  skyDome = new THREE.Mesh(new THREE.SphereGeometry(1200, 24, 14), material);
  skyDome.position.y = 220;
  skyDome.frustumCulled = false;
  scene.add(skyDome);
}

function setSkyPalette(index) {
  if (!skyDome) return;
  const palettes = [
    [0x244b7f, 0xb2d7cd, 0x5d7d83], [0x322d5f, 0xe0ad92, 0x395d70], [0x183d5a, 0x86c9c7, 0x365867],
    [0x352958, 0xd79a88, 0x4b6173],
  ];
  const palette = palettes[index % palettes.length];
  skyDome.material.uniforms.top.value.setHex(palette[0]); skyDome.material.uniforms.horizon.value.setHex(palette[1]); skyDome.material.uniforms.bottom.value.setHex(palette[2]);
  scene.background = new THREE.Color(palette[2]);
  scene.fog.color.setHex(palette[2]);
}

function buildHorizon(seed) {
  clearGroup(horizonGroup);
  const layers = [
    { z: 1250, base: 34, height: 42, color: 0x537e82, opacity: .7 },
    { z: 2850, base: 50, height: 58, color: 0x466d78, opacity: .56 },
    { z: 5100, base: 64, height: 78, color: 0x3c5e70, opacity: .44 },
    { z: 7900, base: 75, height: 98, color: 0x344f68, opacity: .34 },
    { z: 11100, base: 92, height: 120, color: 0x2d4560, opacity: .26 },
  ];
  layers.forEach((layer, layerIndex) => {
    const shape = new THREE.Shape();
    const width = 920 + layerIndex * 90;
    shape.moveTo(-width * .5, -18);
    for (let i = 0; i <= 18; i += 1) {
      const x = -width * .5 + (i / 18) * width;
      const peak = Math.sin(i * .83 + seed * .001 + layerIndex) * .32 + Math.sin(i * .31 + layerIndex * 1.7) * .2;
      shape.lineTo(x, layer.height * (.44 + peak) + Math.sin(i * 2.2 + seed) * 4);
    }
    shape.lineTo(width * .5, -18); shape.closePath();
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: layer.color, transparent: true, opacity: layer.opacity, depthWrite: false, side: THREE.DoubleSide }));
    mesh.position.set(Math.sin(layerIndex * 1.8 + seed) * 70, layer.base, -layer.z);
    mesh.frustumCulled = true;
    horizonGroup.add(mesh);
  });
}

function makeStrip(strip, seed) {
  const group = new THREE.Group();
  const y = worldTerrainAt(strip.x, (strip.start + strip.end) * .5).h + .22;
  group.position.set(strip.x, y, -(strip.start + strip.end) * .5);
  group.rotation.x = Math.atan2(worldTerrainAt(strip.x, strip.end).h - worldTerrainAt(strip.x, strip.start).h, strip.end - strip.start);
  group.userData.strip = strip.id;
  const shoulder = makeMaterial(strip.kit === 'lake' ? 0x56797a : strip.kit === 'cliff' ? 0x60484d : 0x53665e);
  const runway = makeMaterial(strip.kit === 'summit' ? 0xe4dfc0 : 0xd9c88e);
  const line = new THREE.Mesh(new THREE.BoxGeometry(strip.width + 9, .18, strip.end - strip.start), shoulder);
  group.add(line);
  const surface = new THREE.Mesh(new THREE.BoxGeometry(strip.width, .2, strip.end - strip.start - 4), runway);
  surface.position.y = .1;
  group.add(surface);
  for (let z = strip.start + 18; z < strip.end - 8; z += 23) {
    const mark = new THREE.Mesh(new THREE.BoxGeometry(3.8, .04, 10), makeMaterial(0x806c5b));
    mark.position.set(0, .23, -(z - (strip.start + strip.end) * .5));
    group.add(mark);
  }
  const beaconMaterial = new THREE.MeshBasicMaterial({ color: strip.color });
  [-strip.width * .52, strip.width * .52].forEach((x) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.12, .16, 5.6, 6), makeMaterial(0x52636a));
    pole.position.set(x, 2.9, -(strip.start - (strip.start + strip.end) * .5 + 5));
    group.add(pole);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(.32, 8, 6), beaconMaterial);
    beacon.position.set(x, 5.8, pole.position.z);
    group.add(beacon);
  });
  const sign = new THREE.Mesh(new THREE.BoxGeometry(strip.width * .7, 2.7, .16), makeMaterial(strip.color, strip.color));
  sign.position.set(0, 2, -(strip.end - (strip.start + strip.end) * .5 - 3));
  group.add(sign);
  const runwayShadow = new THREE.Mesh(new THREE.CircleGeometry(1, 24), shadowMaterial);
  runwayShadow.rotation.x = -Math.PI / 2; runwayShadow.position.set(0, .12, 0); runwayShadow.scale.set(strip.width * .65, (strip.end - strip.start) * .44, 1); group.add(runwayShadow);
  if (strip.kit === 'lake') {
    const dock = new THREE.Mesh(new THREE.BoxGeometry(strip.width * 1.5, .35, 12), makeMaterial(0x9a775a));
    dock.position.set(strip.width * .75, .65, 8); group.add(dock);
    for (let i = 0; i < 4; i += 1) { const post = new THREE.Mesh(new THREE.CylinderGeometry(.18, .2, 3, 6), makeMaterial(0x6c5346)); post.position.set(strip.width * .2 + i * 3, 1.3, 4); group.add(post); }
  } else if (strip.kit === 'cliff') {
    for (let i = 0; i < 4; i += 1) { const marker = new THREE.Mesh(sharedPropGeometries.marker, sharedPropMaterials.copper); marker.position.set((i % 2 ? 1 : -1) * (strip.width * .8 + 6), 2 + i * .6, i * 22 - 30); marker.scale.setScalar(.7 + i * .12); group.add(marker); }
  } else if (strip.kit === 'summit') {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(.18, .28, 9, 6), makeMaterial(0x4c4c57)); mast.position.set(0, 4.5, 0); group.add(mast);
    const pennant = new THREE.Mesh(new THREE.ConeGeometry(1.3, 2.5, 3), new THREE.MeshBasicMaterial({ color: strip.color })); pennant.rotation.z = -Math.PI / 2; pennant.position.set(1.2, 7.6, 0); group.add(pennant);
  }
  group.traverse((object) => { if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; } });
  landmarkGroup.add(group);
}

function buildRegion(seed) {
  buildTerrain(seed);
  buildCloudLayer(seed);
  clearGroup(landmarkGroup);
  buildProps(seed);
  buildHorizon(seed);
  STRIPS.forEach((strip) => makeStrip(strip, seed));
  const launch = { x: 0, start: -40, end: 250, width: 26, color: 0x83e5c0 };
  const launchGroup = new THREE.Group();
  launchGroup.position.set(launch.x, worldTerrainAt(0, 80).h + .18, -105);
  launchGroup.add(new THREE.Mesh(new THREE.BoxGeometry(launch.width + 9, .18, launch.end - launch.start), makeMaterial(0x40535a)));
  launchGroup.add(new THREE.Mesh(new THREE.BoxGeometry(launch.width, .2, launch.end - launch.start - 4), makeMaterial(0xb8c895)));
  launchGroup.children[1].position.y = .1;
  landmarkGroup.add(launchGroup);
}

function wingGeometry(span, sweep = .36) {
  const shape = new THREE.Shape();
  shape.moveTo(-span * .5, -.42); shape.lineTo(span * .5, -.42); shape.lineTo(span * sweep, .36); shape.lineTo(0, .18); shape.lineTo(-span * sweep, .36); shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth: .12, bevelEnabled: false });
}

function makePlaneModel(spec) {
  const group = new THREE.Group();
  group.rotation.order = 'YXZ';
  const isCourier = spec.silhouette === 'courier';
  const isRacer = spec.silhouette === 'racer';
  const body = new THREE.Mesh(new THREE.ConeGeometry(isRacer ? .55 : .7, isCourier ? 4.8 : 4.1, isRacer ? 5 : 6), makeMaterial(spec.color));
  body.rotation.x = -Math.PI / 2;
  body.position.z = -.1;
  body.userData.role = 'body';
  group.add(body);
  const belly = new THREE.Mesh(new THREE.CylinderGeometry(isRacer ? .38 : .5, isCourier ? .7 : .63, isCourier ? 2.1 : 1.7, 6), makeMaterial(spec.accent));
  belly.rotation.x = -Math.PI / 2;
  belly.position.z = 1.2;
  belly.userData.role = 'belly';
  group.add(belly);
  const canopy = new THREE.Mesh(new THREE.IcosahedronGeometry(.62, 1), new THREE.MeshStandardMaterial({ color: 0x173a4a, emissive: 0x0b3548, emissiveIntensity: .64, roughness: .18, metalness: .25, flatShading: true }));
  canopy.scale.set(.88, .62, 1.1);
  canopy.position.set(0, .54, -.55);
  canopy.userData.role = 'canopy';
  group.add(canopy);
  const wings = new THREE.Mesh(wingGeometry(isRacer ? 5.9 : isCourier ? 6.3 : 5.2, isRacer ? .43 : isCourier ? .31 : .36), makeMaterial(spec.color));
  wings.rotation.x = -Math.PI / 2;
  wings.position.set(0, .03, .35);
  wings.userData.role = 'wings';
  group.add(wings);
  const tail = new THREE.Mesh(wingGeometry(isCourier ? 2.5 : 2.1, .35), makeMaterial(spec.accent));
  tail.rotation.x = -Math.PI / 2;
  tail.position.set(0, .2, 1.45);
  tail.userData.role = 'tail';
  group.add(tail);
  const fin = new THREE.Mesh(new THREE.ConeGeometry(.42, 1.2, 4), makeMaterial(spec.accent));
  fin.scale.set(.7, 1, .55);
  fin.position.set(0, .68, 1.25);
  fin.userData.role = 'fin';
  group.add(fin);
  const prop = new THREE.Group();
  prop.userData.role = 'prop';
  const hub = new THREE.Mesh(new THREE.SphereGeometry(.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe4a4 }));
  const bladeA = new THREE.Mesh(new THREE.BoxGeometry(.12, 1.7, .08), new THREE.MeshBasicMaterial({ color: 0xffe4a4, transparent: true, opacity: .86 }));
  const bladeB = bladeA.clone(); bladeB.rotation.z = Math.PI / 2;
  prop.position.z = -2.18; prop.add(hub, bladeA, bladeB);
  group.add(prop);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(.25, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffc36d }));
  glow.position.set(0, .1, 2.06);
  glow.userData.role = 'glow';
  group.add(glow);
  const controlMaterial = makeMaterial(spec.accent);
  const aileronLeft = new THREE.Mesh(new THREE.BoxGeometry(1.1, .09, .28), controlMaterial);
  const aileronRight = aileronLeft.clone();
  aileronLeft.position.set(-2.2, .13, .55); aileronRight.position.set(2.2, .13, .55);
  aileronLeft.userData.role = 'aileronLeft'; aileronRight.userData.role = 'aileronRight'; group.add(aileronLeft, aileronRight);
  const elevator = new THREE.Mesh(new THREE.BoxGeometry(1.7, .09, .25), controlMaterial);
  elevator.position.set(0, .31, 1.8); elevator.userData.role = 'elevator'; group.add(elevator);
  const rudder = new THREE.Mesh(new THREE.BoxGeometry(.1, .75, .25), controlMaterial);
  rudder.position.set(0, 1.02, 1.36); rudder.userData.role = 'rudder'; group.add(rudder);
  const gear = new THREE.Group(); gear.userData.role = 'gear';
  [-1, 1].forEach((side) => {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(.07, .08, .7, 5), makeMaterial(0x475b64));
    strut.position.set(side * (isCourier ? 1.9 : 1.5), -.38, .4); strut.rotation.z = side * .26;
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(.22, .07, 5, 10), makeMaterial(0x252c34));
    wheel.rotation.y = Math.PI / 2; wheel.position.set(side * (isCourier ? 1.9 : 1.5), -.7, .4); gear.add(strut, wheel);
  });
  group.add(gear);
  group.traverse((object) => { if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; } });
  group.userData.animState = 'idle';
  group.userData.spec = spec;
  return group;
}

function makeRingObject(target, index, type) {
  const node = new THREE.Group();
  node.position.set(target.x, target.y, -target.z);
  node.userData.phase = index * .73;
  const scale = target.scale || 1;
  const color = type === 'cargo' ? 0xffb86d : 0x79d6ec;
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: index === 0 ? .98 : .65 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry((type === 'cargo' ? 11 : 10) * scale, .78 * scale, 6, 22), material);
  node.add(ring);
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.25 * scale, 1), new THREE.MeshBasicMaterial({ color: 0xffe4a4 }));
  core.userData.role = 'core';
  node.add(core);
  if (type === 'cargo') {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(2.8 * scale, 2.8 * scale, 2.8 * scale), makeMaterial(0xcd7e5d));
    crate.position.y = -5.5 * scale;
    crate.rotation.set(.2, .4, .1);
    node.add(crate);
  }
  ring.userData.baseColor = color;
  ring.userData.passed = false;
  ring.userData.index = index;
  ringObjects.push({ node, ring, target, passed: false, missed: false, kind: type, baseY: target.y });
  ringGroup.add(node);
}

function makeTargets(mission, seed) {
  ringObjects = [];
  clearGroup(ringGroup);
  const strip = STRIPS[mission.strip];
  const targets = [];
  if (mission.kind === 'landing') return targets;
  const start = 500;
  const distance = Math.max(900, strip.start - 1100 - start);
  const targetScale = game.missionIndex < 2 ? 1.55 : game.missionIndex < 5 ? 1.34 : game.missionIndex < 9 ? 1.18 : 1.08;
  for (let i = 0; i < mission.targetCount; i += 1) {
    const progress = (i + 1) / (mission.targetCount + 1);
    const z = start + distance * progress + Math.sin(seed * .00002 + i * 1.8) * (18 + mission.targetCount * .42);
    const x = Math.sin(seed * .00001 + i * 2.9) * (36 + (i % 3) * 16) + Math.cos(i * .7) * 13;
    const kind = mission.kind === 'mixed' ? (i % 2 ? 'cargo' : 'ring') : mission.type;
    targets.push({ x, z, y: worldTerrainAt(x, z).h + 17 + Math.sin(i * 1.23) * 3, kind, scale: targetScale });
  }
  targets.forEach((target, index) => makeRingObject(target, index, target.kind));
  return targets;
}

function createParticleSystems() {
  trailPositionArray = new Float32Array(180 * 3);
  burstPositionArray = new Float32Array(180 * 3);
  windPositionArray = new Float32Array(96 * 3);
  windSizeArray = new Float32Array(96);
  windAlphaArray = new Float32Array(96);
  const trailSizeArray = new Float32Array(180);
  const trailAlphaArray = new Float32Array(180);
  const burstSizeArray = new Float32Array(180);
  const burstAlphaArray = new Float32Array(180);
  createParticleSystems.trailSizeArray = trailSizeArray;
  createParticleSystems.trailAlphaArray = trailAlphaArray;
  createParticleSystems.burstSizeArray = burstSizeArray;
  createParticleSystems.burstAlphaArray = burstAlphaArray;
  const particleVertex = 'attribute float aSize; attribute float aAlpha; varying float vAlpha; uniform float pixelRatio; void main(){vAlpha=aAlpha;vec4 mvPosition=modelViewMatrix*vec4(position,1.0);gl_PointSize=aSize*pixelRatio*(260.0/max(1.0,-mvPosition.z));gl_Position=projectionMatrix*mvPosition;}';
  const particleFragment = 'uniform vec3 color; varying float vAlpha; void main(){float d=distance(gl_PointCoord,vec2(.5));float soft=smoothstep(.5,.12,d);if(soft<.01) discard;gl_FragColor=vec4(color,soft*vAlpha);}';
  const trailGeometry = new THREE.BufferGeometry();
  trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositionArray, 3));
  trailGeometry.setAttribute('aSize', new THREE.BufferAttribute(trailSizeArray, 1));
  trailGeometry.setAttribute('aAlpha', new THREE.BufferAttribute(trailAlphaArray, 1));
  trailGeometry.setDrawRange(0, 0);
  trailPoints = new THREE.Points(trailGeometry, new THREE.ShaderMaterial({ uniforms: { color: { value: new THREE.Color(0xffd177) }, pixelRatio: { value: renderer.getPixelRatio() } }, vertexShader: particleVertex, fragmentShader: particleFragment, transparent: true, depthWrite: false }));
  trailPoints.frustumCulled = false;
  const burstGeometry = new THREE.BufferGeometry();
  burstGeometry.setAttribute('position', new THREE.BufferAttribute(burstPositionArray, 3));
  burstGeometry.setAttribute('aSize', new THREE.BufferAttribute(burstSizeArray, 1));
  burstGeometry.setAttribute('aAlpha', new THREE.BufferAttribute(burstAlphaArray, 1));
  burstGeometry.setDrawRange(0, 0);
  burstPoints = new THREE.Points(burstGeometry, new THREE.ShaderMaterial({ uniforms: { color: { value: new THREE.Color(0x83e5c0) }, pixelRatio: { value: renderer.getPixelRatio() } }, vertexShader: particleVertex, fragmentShader: particleFragment, transparent: true, depthWrite: false }));
  burstPoints.frustumCulled = false;
  const windGeometry = new THREE.BufferGeometry();
  windGeometry.setAttribute('position', new THREE.BufferAttribute(windPositionArray, 3));
  windGeometry.setAttribute('aSize', new THREE.BufferAttribute(windSizeArray, 1));
  windGeometry.setAttribute('aAlpha', new THREE.BufferAttribute(windAlphaArray, 1));
  windGeometry.setDrawRange(0, 0);
  windPoints = new THREE.Points(windGeometry, new THREE.ShaderMaterial({ uniforms: { color: { value: new THREE.Color(0xd9f4e9) }, pixelRatio: { value: renderer.getPixelRatio() } }, vertexShader: particleVertex, fragmentShader: particleFragment, transparent: true, depthWrite: false }));
  windPoints.frustumCulled = false;
  world.add(trailPoints, burstPoints, windPoints);
  bursts = Array.from({ length: 180 }, () => ({ active: false, life: 0, max: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }));
}

function spawnBurst(position, color = 0x83e5c0, count = 22) {
  burstPoints.material.uniforms.color.value.setHex(color);
  let created = 0;
  for (let i = 0; i < bursts.length && created < count; i += 1) {
    if (bursts[i].active) continue;
    const burst = bursts[i];
    const serial = burstSerial + created + i;
    const angle = hash(serial * 1.7, 3.1, game.routeSeed) * TAU;
    const speed = 13 + hash(serial * 2.3, 7.2, game.routeSeed) * 34;
    burst.active = true; burst.max = .5 + hash(serial * 3.1, 9.4, game.routeSeed) * .55; burst.life = burst.max;
    burst.x = position.x; burst.y = position.y; burst.z = position.z;
    burst.vx = Math.cos(angle) * speed; burst.vy = 11 + hash(serial * 4.7, 11.8, game.routeSeed) * 25; burst.vz = Math.sin(angle) * speed;
    created += 1;
  }
  burstSerial += created;
}

function updateParticles(dt) {
  if (!motionEnabled()) { trailPoints.geometry.setDrawRange(0, 0); burstPoints.geometry.setDrawRange(0, 0); windPoints.geometry.setDrawRange(0, 0); return; }
  const player = game.player;
  const trailCount = player ? Math.min(180, Math.max(10, Math.round(player.speed * 1.4))) : 0;
  if (player) for (let i = 0; i < trailCount; i += 1) {
    const age = i * .055 + (game.elapsed * player.speed * .08 % 1.1);
    const jitter = Math.sin(i * 8.1 + game.elapsed * 2.8) * .34;
    trailPositionArray[i * 3] = player.x + jitter + Math.sin(i * 2.3) * .3;
    trailPositionArray[i * 3 + 1] = player.y - .1 + Math.sin(i * 1.7) * .3;
    trailPositionArray[i * 3 + 2] = -player.z + 2.3 + age * 9.5;
    createParticleSystems.trailSizeArray[i] = 1.4 + (1 - i / trailCount) * 1.5;
    createParticleSystems.trailAlphaArray[i] = .58 * (1 - i / trailCount);
  }
  trailPoints.geometry.setDrawRange(0, trailCount);
  trailPoints.geometry.attributes.position.needsUpdate = true;
  trailPoints.geometry.attributes.aSize.needsUpdate = true; trailPoints.geometry.attributes.aAlpha.needsUpdate = true;
  const windCount = player ? 72 : 0;
  for (let i = 0; i < windCount; i += 1) {
    const lane = i % 12;
    const row = Math.floor(i / 12);
    const drift = Math.sin(visualClock * 1.7 + i * 1.9) * 1.8;
    windPositionArray[i * 3] = player.x + (lane - 5.5) * 8 + drift;
    windPositionArray[i * 3 + 1] = player.y + 2 + (row - 2.5) * 4 + Math.sin(i * 2.4) * 2;
    windPositionArray[i * 3 + 2] = -player.z - 24 - row * 18 - (visualClock * 48 + i * 7) % 120;
    windSizeArray[i] = 1.4 + (lane % 3) * .5;
    windAlphaArray[i] = .14 + (row % 3) * .045;
  }
  windPoints.geometry.setDrawRange(0, windCount);
  windPoints.geometry.attributes.position.needsUpdate = true;
  windPoints.geometry.attributes.aSize.needsUpdate = true; windPoints.geometry.attributes.aAlpha.needsUpdate = true;
  let burstCount = 0;
  bursts.forEach((burst) => {
    if (!burst.active) return;
    burst.life -= dt;
    if (burst.life <= 0) { burst.active = false; return; }
    burst.x += burst.vx * dt; burst.y += burst.vy * dt; burst.z += burst.vz * dt; burst.vy -= 28 * dt;
    burstPositionArray[burstCount * 3] = burst.x; burstPositionArray[burstCount * 3 + 1] = burst.y; burstPositionArray[burstCount * 3 + 2] = burst.z;
    createParticleSystems.burstSizeArray[burstCount] = 1.6 + (1 - burst.life / burst.max) * 3.5;
    createParticleSystems.burstAlphaArray[burstCount] = clamp(burst.life / burst.max, 0, 1);
    burstCount += 1;
  });
  burstPoints.geometry.setDrawRange(0, burstCount);
  burstPoints.geometry.attributes.aSize.needsUpdate = true; burstPoints.geometry.attributes.aAlpha.needsUpdate = true;
  burstPoints.geometry.attributes.position.needsUpdate = true;
}

function buildWorld() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x5d7d83);
  scene.fog = new THREE.Fog(0x5d7d83, 720, 7600);
  world = new THREE.Group();
  terrainGroup = new THREE.Group(); waterGroup = new THREE.Group(); landmarkGroup = new THREE.Group(); ringGroup = new THREE.Group(); cloudGroup = new THREE.Group(); shadowGroup = new THREE.Group(); horizonGroup = new THREE.Group();
  scene.add(world);
  world.add(horizonGroup, terrainGroup, waterGroup, landmarkGroup, ringGroup, cloudGroup, shadowGroup);
  shadowMaterial = new THREE.MeshBasicMaterial({ color: 0x142b2b, transparent: true, opacity: .24, depthWrite: false, side: THREE.DoubleSide });
  const hemisphere = new THREE.HemisphereLight(0xbde9eb, 0x183a37, 2.2);
  scene.add(hemisphere);
  const sun = new THREE.DirectionalLight(0xffe0a1, 3.4);
  sun.position.set(-220, 300, 160);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -330; sun.shadow.camera.right = 330; sun.shadow.camera.top = 350; sun.shadow.camera.bottom = -350; sun.shadow.camera.far = 1100;
  sun.shadow.bias = -.0004;
  scene.add(sun);
  createParticleSystems();
  buildSky();
  buildRegion(REGION_SEED);
  setSkyPalette(0);
  AIRCRAFT.forEach((spec) => planeModelCache.set(spec.id, makePlaneModel(spec)));
  planeGroup = getPlaneModel(AIRCRAFT.find((plane) => plane.id === progress.selected) || AIRCRAFT[0]);
  planeGroup.position.set(0, 30, -26);
  world.add(planeGroup);
  planeParts = getPlaneParts(planeGroup);
  planeShadow = makeBlobShadow(0, worldTerrainAt(0, 0).h, 0, 5.5, 8.5);
}

function getPlaneModel(spec) {
  return planeModelCache.get(spec.id).clone(true);
}

function getPlaneParts(group) {
  const roles = ['prop', 'glow', 'wings', 'body', 'aileronLeft', 'aileronRight', 'elevator', 'rudder', 'gear'];
  return roles.reduce((parts, role) => { parts[role] = group.children.find((child) => child.userData.role === role); return parts; }, {});
}

function resize() {
  if (!renderer) return;
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(1, height);
  camera.updateProjectionMatrix();
  if (ui.stickControl && ui.throttleControl) {
    const stickRect = ui.stickControl.getBoundingClientRect(); const throttleRect = ui.throttleControl.getBoundingClientRect();
    controlRects.stick.left = stickRect.left; controlRects.stick.top = stickRect.top; controlRects.stick.right = stickRect.right; controlRects.stick.bottom = stickRect.bottom;
    controlRects.throttle.left = throttleRect.left; controlRects.throttle.top = throttleRect.top; controlRects.throttle.right = throttleRect.right; controlRects.throttle.bottom = throttleRect.bottom;
  }
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function selectedPlane() { return AIRCRAFT.find((plane) => plane.id === progress.selected) || AIRCRAFT[0]; }

function saveProgress() {
  kit.save.set({ version: 1, unlocked: [...new Set(progress.unlocked)], selected: progress.selected, completed: [...new Set(progress.completed)], credits: clamp(Math.floor(progress.credits), 0, 999999), tutorialComplete: !!progress.tutorialComplete, ace: !!progress.ace, best: progress.best || {} });
}

function playSfx(name, volume = 1) { kit.audio.sfx(name, { volume }); }

function motionEnabled() { return !systemReducedMotion && kit.juice.enabled; }

function announce(message) {
  ui.toast.textContent = message;
  ui.toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => ui.toast.classList.remove('is-visible'), 2400);
}

function setTextIfChanged(element, value) {
  const text = String(value);
  if (element && element.textContent !== text) element.textContent = text;
}

function syncVerificationState() {
  const player = game.player;
  verificationState.speed = player ? Math.round(player.speed) : 0;
  verificationState.altitude = player ? Math.max(0, Math.round(player.y - worldTerrainAt(player.x, player.z).h)) : 0;
  verificationState.crashed = game.crashedCount;
  verificationState.assistsOn = game.assistsOn;
}

function showOnly(screen) {
  [ui.title, ui.hud, ui.result, ui.pause, ui.catalog].forEach((element) => element.classList.add('is-hidden'));
  if (screen) screen.classList.remove('is-hidden');
}

function resetTouch() {
  touch.flightId = null; touch.throttleId = null; touch.stickX = 0; touch.stickY = 0; touch.throttle = .64; touch.suppressUntil = performance.now() + 160;
}

async function requestTiltAccess() {
  if (!('DeviceOrientationEvent' in window)) return;
  tilt.supported = true;
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    try { const permission = await DeviceOrientationEvent.requestPermission(); if (permission !== 'granted') return; } catch (error) { return; }
  }
  if (tilt.listening) return;
  window.addEventListener('deviceorientation', (event) => {
    if (Number.isFinite(event.beta)) tilt.beta = event.beta;
    if (Number.isFinite(event.gamma)) tilt.gamma = event.gamma;
    if (tilt.neutralBeta == null && Number.isFinite(event.beta) && Number.isFinite(event.gamma)) { tilt.neutralBeta = event.beta; tilt.neutralGamma = event.gamma; }
    tilt.enabled = tilt.neutralBeta != null;
  }, { passive: true });
  tilt.listening = true;
}

function beginFlight(missionIndex = game.missionIndex) {
  const mission = MISSIONS[clamp(missionIndex, 0, MISSIONS.length - 1)];
  const spec = selectedPlane();
  game.mode = 'flight'; game.missionIndex = MISSIONS.indexOf(mission); game.mission = mission; game.seed = REGION_SEED; game.routeSeed = 1001 + game.missionIndex * 947 + game.sortie * 173; game.elapsed = 0; game.nextTarget = 0; game.targetTotal = mission.targetCount; game.fuelOut = false; game.result = null; game.tutorialStep = mission.kind === 'tutorial' && !progress.tutorialComplete ? 0 : 3; game.stall = false; game.assistsOn = !progress.ace; game.graceBounces = 0; game.ridgePops = 0; game.takeoffGrace = 0; game.challenge = { phase: mission.kind === 'landing' ? 'free-flight' : 'targets', ringMisses: 0 }; game.ringBeat.time = 0; game.cameraDip = 0; game.cameraKick = 0; game.launchCountdown = 3.2;
  const ground = worldTerrainAt(0, 0).h;
  game.player = { x: 0, z: 0, y: ground + 1.15, speed: 0, verticalSpeed: 0, pitch: 0, roll: 0, fuel: 100, stallTime: 0, animation: 'idle', airborne: false, stallWarning: false, targetY: ground + 1.15 };
  game.sortie += 1;
  makeTargets(mission, game.routeSeed);
  if (planeGroup) world.remove(planeGroup);
  planeGroup = getPlaneModel(spec);
  world.add(planeGroup);
  planeParts = getPlaneParts(planeGroup);
  resetTouch();
  kit.input.clearAll();
  ui.mission.textContent = `${String(game.missionIndex + 1).padStart(2, '0')} / ${mission.title.toUpperCase()}`;
  ui.targetLabel.textContent = mission.kind === 'landing' ? 'FREE FLIGHT' : mission.kind === 'mixed' ? 'MIXED ROUTE' : mission.type === 'cargo' ? 'CARGO RUN' : 'RING COURSE';
  ui.targetUnit.textContent = mission.kind === 'landing' ? 'APPROACH' : mission.kind === 'mixed' ? 'GATES + CARGO' : mission.type === 'cargo' ? 'PICKUPS' : 'GATES';
  showOnly(ui.hud);
  resize();
  ui.tutorial.classList.toggle('is-hidden', game.tutorialStep > 2);
  setSkyPalette(game.missionIndex);
  kit.audio.music(game.missionIndex % 2 ? 'flightSunset' : 'flightDawn', 650);
  playSfx('engine', .32);
  playSfx('uiConfirm', .75);
  announce(`${mission.title} / ${spec.name}`);
  requestTiltAccess();
}

function showTitle() {
  game.mode = 'menu'; game.result = null; game.player = null; game.nextTarget = 0; game.targetTotal = 0; game.fuelOut = false; game.stall = false; game.challenge = { phase: 'menu', ringMisses: 0 }; game.launchCountdown = 0; clearGroup(ringGroup); ringObjects = []; resetTouch(); simAccumulator = 0;
  bursts?.forEach((burst) => { burst.active = false; });
  ui.result.classList.remove('result-active');
  if (kit.paused) { kit.resume('manual'); kit.resume('settings'); }
  kit.audio.stopMusic(300);
  setSkyPalette(0);
  if (planeGroup) world.remove(planeGroup);
  planeGroup = getPlaneModel(selectedPlane());
  planeGroup.position.set(0, 31, -28);
  planeGroup.rotation.set(0, 0, -.1);
  world.add(planeGroup);
  planeParts = getPlaneParts(planeGroup);
  if (planeShadow) { planeShadow.position.set(0, worldTerrainAt(0, 0).h + .08, -28); planeShadow.scale.set(5.5, 8.5, 1); planeShadow.material.opacity = .24; planeShadow.visible = true; }
  showOnly(ui.title);
}

function updateTouchInput() {
  if (game.mode !== 'flight' || performance.now() < touch.suppressUntil) return;
  let flight = null;
  let throttlePointer = null;
  const stickRect = controlRects.stick;
  const throttleRect = controlRects.throttle;
  for (const [id, pointer] of kit.input.pointers.entries()) {
    if (pointer.startX >= stickRect.left && pointer.startX <= stickRect.right && pointer.startY >= stickRect.top && pointer.startY <= stickRect.bottom && !flight) flight = [id, pointer];
    if (pointer.startX >= throttleRect.left && pointer.startX <= throttleRect.right && pointer.startY >= throttleRect.top && pointer.startY <= throttleRect.bottom && !throttlePointer) throttlePointer = [id, pointer];
  }
  if (flight) {
    touch.flightId = flight[0];
    const pointer = flight[1];
    touch.stickX = clamp((pointer.x - pointer.startX) / 68, -1, 1);
    touch.stickY = clamp((pointer.y - pointer.startY) / 68, -1, 1);
  } else { touch.flightId = null; touch.stickX *= .82; touch.stickY *= .82; }
  if (throttlePointer) {
    touch.throttleId = throttlePointer[0];
    const top = window.innerWidth < 760 ? 188 : 220;
    const bottom = top + (window.innerWidth < 760 ? 220 : 270);
    touch.throttle = clamp((bottom - throttlePointer[1].y) / (bottom - top), 0, 1);
  } else touch.throttleId = null;
}

function readInput(dt) {
  updateTouchInput();
  let pitch = touch.flightId == null ? 0 : touch.stickY;
  let roll = touch.flightId == null ? 0 : touch.stickX;
  if (tilt.enabled && touch.flightId == null) {
    pitch = clamp((tilt.beta - tilt.neutralBeta) / 24, -1, 1);
    roll = clamp((tilt.gamma - tilt.neutralGamma) / 24, -1, 1);
  }
  if (kit.input.keyDown('ArrowDown')) pitch += 1;
  if (kit.input.keyDown('ArrowUp')) pitch -= 1;
  if (kit.input.keyDown('ArrowRight') || kit.input.keyDown('KeyD')) roll += 1;
  if (kit.input.keyDown('ArrowLeft') || kit.input.keyDown('KeyA')) roll -= 1;
  if (kit.input.keyDown('KeyW')) touch.throttle += dt * .55;
  if (kit.input.keyDown('KeyS')) touch.throttle -= dt * .55;
  touch.throttle = clamp(touch.throttle, 0, 1);
  controlInput.pitch = clamp(pitch, -1, 1); controlInput.roll = clamp(roll, -1, 1); controlInput.throttle = touch.throttle;
  return controlInput;
}

function updateTutorial() {
  if (game.mission.kind !== 'tutorial' || game.tutorialStep > 2) return;
  const player = game.player;
  if (game.tutorialStep === 0 && player.airborne) { game.tutorialStep = 1; playSfx('uiSelect', .8); announce('Turn lesson unlocked'); }
  else if (game.tutorialStep === 1 && Math.abs(player.roll) > .12) { game.tutorialStep = 2; playSfx('uiSelect', .8); announce('Route lesson unlocked'); }
  else if (game.tutorialStep === 2 && game.nextTarget >= game.targetTotal) { game.tutorialStep = 3; progress.tutorialComplete = true; saveProgress(); playSfx('ringPass', .8); announce('Follow the beacon home'); }
}

function checkTargets(previousZ, previousX, previousY) {
  while (game.nextTarget < ringObjects.length) {
    const object = ringObjects[game.nextTarget];
    const target = object.target;
    const crossed = previousZ <= target.z && game.player.z >= target.z;
    if (!crossed) break;
    const travel = Math.max(.001, game.player.z - previousZ);
    const t = clamp((target.z - previousZ) / travel, 0, 1);
    const crossX = lerp(previousX, game.player.x, t);
    const crossY = lerp(previousY, game.player.y, t);
    const targetY = object.node.position.y;
    const innerRadius = (object.kind === 'cargo' ? 9.4 : 8.7) * (target.scale || 1);
    const distance = Math.hypot(crossX - target.x, crossY - targetY);
    const near = distance <= innerRadius;
    const graze = game.assistsOn && distance <= innerRadius + 9;
    if (!near) {
      if (graze) {
        object.passed = true; object.ring.userData.passed = true; object.ring.material.opacity = .3; object.ring.material.color.setHex(0xffd177); object.node.userData.beat = visualClock + .5;
        game.nextTarget += 1; game.ringBeat = { time: visualClock, kind: 'graze' };
        burstOrigin.set(target.x, targetY, -target.z); spawnBurst(burstOrigin, 0xffd177, 14);
        announce(`${object.kind === 'cargo' ? 'Cargo' : 'Gate'} grazed / keep the scenic line`);
        continue;
      }
      if (!object.missed) {
        object.missed = true; object.ring.material.color.setHex(0xff6d67); object.ring.material.opacity = .92; object.node.userData.beat = visualClock + .6; game.challenge.ringMisses += 1; game.ringBeat = { time: visualClock, kind: 'miss' }; burstOrigin.set(target.x, targetY, -target.z); spawnBurst(burstOrigin, 0xff6d67, 10);
      }
      if (game.assistsOn) {
        const checkpointZ = game.nextTarget > 0 ? ringObjects[game.nextTarget - 1].target.z + 72 : 150;
        game.player.z = Math.max(checkpointZ, target.z - 105);
        game.player.x = lerp(game.player.x, target.x, .72);
        game.player.y = targetY;
        game.player.speed = Math.max(game.player.speed, selectedPlane().bestGlide);
        game.player.verticalSpeed = 0; game.player.stallTime = 0; game.player.airborne = true;
        announce(`${object.kind === 'cargo' ? 'Cargo' : 'Gate'} missed / checkpoint reset, try the line again`);
      } else if (object.missed) announce(`${object.kind === 'cargo' ? 'Cargo' : 'Gate'} missed / realign for the next pass`);
      break;
    }
    object.passed = true; object.ring.userData.passed = true; object.ring.material.opacity = .28; object.ring.material.color.setHex(0x83e5c0); object.node.userData.beat = visualClock + .72;
    game.nextTarget += 1;
    game.ringBeat = { time: visualClock, kind: 'pass' };
    burstOrigin.set(target.x, targetY, -target.z); spawnBurst(burstOrigin, object.kind === 'cargo' ? 0xffb86d : 0x83e5c0, 24);
    if (motionEnabled()) kit.juice.shake(2.5, 110);
    playSfx(object.kind === 'cargo' ? 'cargoPickup' : 'ringPass', .78);
  }
}

function missionGoalReady() {
  return game.challenge.phase === 'landing' || game.challenge.phase === 'complete';
}

function advanceChallenge() {
  const strip = STRIPS[game.mission.strip];
  const player = game.player;
  if (game.challenge.phase === 'free-flight' && player.z >= strip.start - 1500) {
    game.challenge.phase = 'approach'; announce('Approach window ahead / locate the strip'); playSfx('uiSelect', .65);
  }
  if (game.challenge.phase === 'targets' && game.nextTarget >= game.targetTotal) {
    game.challenge.phase = 'approach'; announce('Route complete / begin your approach'); playSfx('uiSelect', .65);
  }
  if (game.challenge.phase === 'approach' && player.z >= strip.start - 420) {
    game.challenge.phase = 'landing'; announce('Landing window / settle onto the highlighted strip'); playSfx('uiSelect', .65);
  }
}

function finishFlight(result, reason) {
  if (game.mode !== 'flight') return;
  game.mode = result === 'won' ? 'result' : 'crashed';
  if (result !== 'won') game.crashedCount += 1;
  game.challenge.phase = result === 'won' ? 'complete' : game.challenge.phase;
  game.result = { result, reason, time: game.elapsed, gates: game.nextTarget, total: game.targetTotal };
  game.cameraDip = result === 'won' ? .8 : 1.8;
  game.cameraKick = result === 'won' ? 3 : 7;
  kit.audio.stopMusic(260);
  if (result === 'won') {
    const oldBest = Number(progress.best[game.mission.id]);
    if (!oldBest || game.elapsed < oldBest) progress.best[game.mission.id] = game.elapsed;
    if (!progress.completed.includes(game.mission.id)) progress.completed.push(game.mission.id);
    progress.credits += 100 + game.missionIndex * 20;
    if (progress.completed.length >= 3 && !progress.unlocked.includes('wayfarer')) progress.unlocked.push('wayfarer');
    if (progress.completed.length >= 8 && !progress.unlocked.includes('sunracer')) progress.unlocked.push('sunracer');
    saveProgress();
    burstOrigin.set(game.player.x, game.player.y, -game.player.z); spawnBurst(burstOrigin, 0x83e5c0, 58);
    if (motionEnabled()) { kit.juice.hitStop(60); kit.juice.shake(4, 260); }
    playSfx('landing', .95);
  } else {
    burstOrigin.set(game.player.x, game.player.y, -game.player.z); spawnBurst(burstOrigin, 0xff9278, 72);
    if (motionEnabled()) { kit.juice.hitStop(90); kit.juice.shake(10, 300); }
    playSfx('crash', .95);
  }
  updateResultPanel();
  ui.result.classList.add('result-active');
  showOnly(ui.result);
}

function updateResultPanel() {
  const result = game.result;
  const won = result.result === 'won';
  ui.resultVista.dataset.outcome = won ? 'landing' : 'crash';
  ui.resultKicker.textContent = won ? `FLIGHT REPORT / ${STRIPS[game.mission.strip].name.toUpperCase()}` : 'FLIGHT REPORT / AIRFRAME RECOVERY';
  ui.resultTitle.textContent = won ? 'SOFT LANDING' : 'TERRAIN IMPACT';
  ui.resultCopy.textContent = won ? 'The strip is yours. That is how you bring a hopper home.' : 'The ridges win this sortie. Trim the nose, keep the stall margin, and try the line again.';
  ui.resultTime.textContent = formatTime(result.time);
  ui.resultGates.textContent = `${result.gates} / ${result.total}`;
  const ratio = result.total ? result.gates / result.total : 1;
  ui.resultRating.textContent = won ? (ratio > .95 && result.time < 180 ? 'A' : 'B') : 'C';
}

function assistGroundContact(player, ground, strip, onStrip, spec) {
  if (!game.assistsOn || game.graceBounces >= 4 || player.y < ground - 4 || player.speed > spec.max * .94 || player.verticalSpeed < -24) return false;
  game.graceBounces += 1;
  const checkpoint = onStrip ? strip.start + 18 : Math.max(95, player.z - 34);
  player.z = onStrip ? checkpoint : Math.max(0, checkpoint);
  player.x = onStrip ? strip.x : clamp(player.x, -155, 155);
  player.y = worldTerrainAt(player.x, player.z).h + (onStrip ? 6.5 : 4.5);
  player.speed = clamp(Math.max(player.speed, spec.bestGlide), spec.bestGlide, spec.landingMax + 8);
  player.verticalSpeed = onStrip ? 1.2 : 4.4;
  player.pitch = clamp(player.pitch * .2, -.12, .12);
  player.roll *= .25;
  player.stallTime = 0;
  player.stallWarning = false;
  player.airborne = true;
  burstOrigin.set(player.x, player.y, -player.z); spawnBurst(burstOrigin, 0xffd177, 12);
  announce(onStrip ? 'Soft bounce / the strip is still yours' : 'Terrain graze / checkpoint held');
  return true;
}

function simulate(dt) {
  const player = game.player;
  const spec = selectedPlane();
  if (game.launchCountdown > 0) {
    game.launchCountdown -= dt;
    if (game.launchCountdown <= 0) { game.launchCountdown = 0; playSfx('uiConfirm', .82); announce('GO / bring the hopper into the wind'); }
    return;
  }
  game.elapsed += dt;
  const input = readInput(dt);
  const previousZ = player.z;
  const previousX = player.x;
  const previousY = player.y;
  const wasAirborne = player.airborne;
  const assist = game.assistsOn;
  player.pitch += input.pitch * dt * (assist ? 1.25 : 1.65);
  if (Math.abs(input.pitch) < .06) player.pitch *= Math.pow(assist ? .055 : .29, dt);
  if (assist) player.pitch += clamp(-player.pitch, -.16, .16) * dt * .55;
  player.pitch = clamp(player.pitch, assist ? -.48 : -.62, assist ? .48 : .62);
  player.roll += input.roll * dt * (assist ? 1.55 : 1.8);
  if (Math.abs(input.roll) < .06) player.roll *= Math.pow(assist ? .035 : .21, dt);
  if (assist) player.roll += clamp(-player.roll, -.22, .22) * dt * .48;
  player.roll = clamp(player.roll, assist ? -.58 : -.78, assist ? .58 : .78);
  const throttle = game.fuelOut ? 0 : input.throttle;
  const targetSpeed = game.fuelOut ? spec.bestGlide : 20 + throttle * (spec.max - 20);
  player.speed += (targetSpeed - player.speed) * dt * (game.fuelOut ? .32 : .54);
  const stallReference = assist ? Math.max(20, spec.stall - 5) : spec.stall;
  player.stall = player.airborne && player.speed < stallReference;
  const warningEnter = assist ? stallReference - 1 : spec.stall + 7;
  const warningRecover = assist ? stallReference + 6 : spec.stall + 11;
  if (!player.stallWarning && player.speed <= warningEnter) {
    player.stallWarning = true;
    if (performance.now() - lastStallSound > 900) { playSfx('stallWarn', .72); lastStallSound = performance.now(); }
  } else if (player.stallWarning && player.speed >= warningRecover) player.stallWarning = false;
  if (player.stall) {
    player.stallTime += dt;
    if (assist) player.pitch -= Math.max(player.pitch + .01, 0) * dt * .48;
    else player.pitch -= Math.max(player.pitch + .05, 0) * dt * 1.7;
  } else player.stallTime = Math.max(0, player.stallTime - dt * (assist ? 4.5 : 2.6));
  const lift = clamp((player.speed / stallReference) ** 2, 0, assist ? 1.55 : 1.45) * spec.lift;
  let verticalSpeed = Math.sin(player.pitch) * player.speed * .34 + (lift - 1) * 5;
  if (player.stall) verticalSpeed -= (stallReference - player.speed) * (assist ? .22 : .62 + Math.min(.6, player.stallTime * .11)) + (assist ? Math.min(1.8, player.stallTime * .55) : Math.min(7, player.stallTime * 2.2));
  player.verticalSpeed = verticalSpeed;
  // Assist terrain floor: with assists on, a hands-off flight must never fly
  // level into a ridge (the no-input launch crashed at 3s without this).
  // Look ahead along the flight path and ease into a gentle auto-climb
  // whenever projected clearance drops below the floor. Player pitch input
  // above the assist keeps full authority; this only ADDS climb.
  if (assist && player.airborne) {
    const driftX = Math.sin(player.roll) * 30;
    let peak = -Infinity;
    for (let look = 0; look < 5; look++) {
      const aheadZ = player.z + 20 + look * 33;
      const h = worldTerrainAt(player.x + driftX * (look / 4), aheadZ).h;
      if (h > peak) peak = h;
    }
    const floorY = peak + 28;
    if (player.y < floorY) {
      const deficit = clamp((floorY - player.y) / 26, 0, 1);
      const climb = 7 + deficit * 18;
      if (player.verticalSpeed < climb) player.verticalSpeed += (climb - player.verticalSpeed) * Math.min(1, dt * (2.6 + deficit * 5));
      if (player.speed < spec.bestGlide) player.speed += (spec.bestGlide - player.speed) * dt * .8;
    }
    // Emergency ridge assist: a wall steeper than any climb rate pops the
    // hopper over instead of ending the flight. Capped so it stays a rescue.
    const groundHere = worldTerrainAt(player.x, player.z).h;
    if (player.y < groundHere + 2 && player.verticalSpeed > -26 && (game.ridgePops || 0) < 6) {
      game.ridgePops = (game.ridgePops || 0) + 1;
      player.y = groundHere + 8;
      if (player.verticalSpeed < 8) player.verticalSpeed = 8;
      announce('Ridge assist / nose up');
    }
  }
  player.x += Math.sin(player.roll) * player.speed * dt * (assist ? .34 : .26);
  player.x = clamp(player.x, -190, 190);
  player.z += Math.max(0, player.speed) * dt;
  player.fuel = Math.max(0, player.fuel - throttle * spec.burn * (assist ? .62 : 1) * dt);
  if (player.fuel <= 0 && !game.fuelOut) { game.fuelOut = true; playSfx('fuelLow', .9); announce('Fuel exhausted / glide to the strip'); }
  if (player.fuel < 18 && performance.now() - lastFuelSound > 3500) { playSfx('fuelLow', .5); lastFuelSound = performance.now(); }
  const ground = worldTerrainAt(player.x, player.z).h;
  if (!player.airborne) {
    player.y = ground + 1.15;
    player.verticalSpeed = 0;
    if (player.speed >= spec.liftoff - (assist ? 4 : 0)) {
      player.airborne = true;
      if (assist) {
        // Assisted rotation: a positive initial climb plus a grace window so
        // the contact checks cannot bounce-loop a fresh takeoff into a crash
        // (hands-off launches died at 5s skimming the strip without this).
        player.verticalSpeed = 9;
        player.y = ground + 3;
        game.takeoffGrace = 4;
      }
      announce('Lift off / hold the clean line'); playSfx('uiSelect', .65);
    }
  } else player.y += player.verticalSpeed * dt;
  updateTutorial();
  checkTargets(previousZ, previousX, previousY);
  advanceChallenge();
  const strip = STRIPS[game.mission.strip];
  const onStrip = player.z > strip.start && player.z < strip.end && Math.abs(player.x - strip.x) < strip.width * .62;
  if (game.takeoffGrace > 0) {
    game.takeoffGrace = Math.max(0, game.takeoffGrace - dt);
    // Hold a soft floor through the grace window instead of judging contact.
    if (assist && player.airborne && player.y < ground + 2.5) {
      player.y = ground + 2.5;
      if (player.verticalSpeed < 5) player.verticalSpeed = 5;
    }
  }
  const touching = player.y <= ground + 1.25 && !(assist && game.takeoffGrace > 0);
  if (wasAirborne && player.airborne && touching) {
    const gentleBand = assist ? player.speed >= spec.landingMin - 5 && player.speed <= spec.landingMax + 7 : player.speed >= spec.landingMin && player.speed <= spec.landingMax;
    const gentle = onStrip && missionGoalReady() && !player.stall && gentleBand && player.verticalSpeed >= (assist ? -9 : -6) && player.verticalSpeed <= (assist ? 4 : 2.5) && Math.abs(player.pitch) < (assist ? .38 : .28) && Math.abs(player.roll) < (assist ? .38 : .28);
    if (gentle) finishFlight('won', 'clean touchdown');
    else if (!assistGroundContact(player, ground, strip, onStrip, spec)) finishFlight('crashed', onStrip ? 'unstable touchdown' : 'terrain contact');
  } else if (player.z > strip.end + 64) {
    if (assist && game.graceBounces < 4) {
      game.graceBounces += 1;
      player.z = strip.start - 78; player.x = strip.x; player.y = worldTerrainAt(player.x, player.z).h + 22;
      player.speed = clamp(spec.bestGlide + 5, spec.landingMin + 2, spec.landingMax + 8);
      player.verticalSpeed = 0; player.pitch = 0; player.roll = 0; player.stallTime = 0; player.airborne = true;
      announce('Approach reset / take the strip again');
    } else finishFlight('crashed', 'missed approach');
  }
  updateEngineAudio(dt, throttle, spec);
  game.stall = player.stall;
}

function updateEngineAudio(dt, throttle, spec) {
  engineCueTimer -= dt;
  if (engineCueTimer > 0 || game.mode !== 'flight') return;
  engineCueTimer = 4.72;
  const speedRatio = clamp(game.player.speed / spec.max, 0, 1);
  playSfx('engine', .11 + throttle * .14 + speedRatio * .08);
}

function springVector(current, target, velocity, dt, stiffness = 24, damping = 8) {
  springDelta.copy(target).sub(current);
  velocity.addScaledVector(springDelta, stiffness * dt);
  velocity.multiplyScalar(Math.exp(-damping * dt));
  current.addScaledVector(velocity, dt);
}

function updatePlane(dt, time) {
  if (!planeGroup || !game.player) return;
  const player = game.player;
  const altitude = player.y - worldTerrainAt(player.x, player.z).h;
  const nextAnimation = player.stall ? 'stall' : altitude < 6 ? 'land' : Math.abs(player.roll) > .12 ? 'bank' : player.speed < 24 ? 'idle' : 'cruise';
  if (player.animation !== nextAnimation) { player.animation = nextAnimation; planeGroup.userData.animState = nextAnimation; }
  planeGroup.position.set(player.x, player.y, -player.z);
  planeGroup.rotation.x = lerp(planeGroup.rotation.x, -player.pitch * .74, 1 - Math.pow(.001, dt));
  planeGroup.rotation.z = lerp(planeGroup.rotation.z, -player.roll * .82, 1 - Math.pow(.001, dt));
  planeGroup.rotation.y = lerp(planeGroup.rotation.y, Math.sin(player.roll) * .08, 1 - Math.pow(.001, dt));
  const buffet = motionEnabled() && player.stall ? Math.min(.16, .035 + player.stallTime * .022) : 0;
  planeGroup.position.y += Math.sin(time * 2.3) * (nextAnimation === 'idle' ? .25 : .06) + Math.sin(time * 19) * buffet;
  if (planeParts.prop) planeParts.prop.rotation.z += dt * (nextAnimation === 'idle' ? 3 : 8 + player.speed * .22);
  if (planeParts.glow) { planeParts.glow.scale.setScalar(.78 + Math.sin(time * 10) * .12 + player.speed * .004); planeParts.glow.material.color.setHex(nextAnimation === 'stall' ? 0xff6d67 : 0xffc36d); }
  if (planeParts.wings) planeParts.wings.rotation.z = Math.sin(time * 4.2) * (nextAnimation === 'bank' ? .045 : .008);
  if (planeParts.aileronLeft) planeParts.aileronLeft.rotation.z = -player.roll * .34 + (nextAnimation === 'stall' ? Math.sin(time * 18) * .1 : 0);
  if (planeParts.aileronRight) planeParts.aileronRight.rotation.z = player.roll * .34 + (nextAnimation === 'stall' ? Math.sin(time * 18) * .1 : 0);
  if (planeParts.elevator) planeParts.elevator.rotation.x = player.pitch * .35 + (nextAnimation === 'land' ? .08 : 0);
  if (planeParts.rudder) planeParts.rudder.rotation.y = player.roll * .24;
  if (planeParts.gear) planeParts.gear.visible = nextAnimation === 'land' || game.mode === 'result' || game.mode === 'crashed';
  if (planeShadow) {
    const shadowGround = worldTerrainAt(player.x, player.z).h;
    planeShadow.position.set(player.x, shadowGround + .08, -player.z);
    const shadowScale = clamp(1 - altitude / 130, .22, 1);
    planeShadow.scale.set(5.5 * shadowScale, 8.5 * shadowScale, 1);
    planeShadow.material.opacity = .08 + shadowScale * .22;
    planeShadow.visible = game.mode !== 'menu';
  }
}

function updateCamera(dt, time, juice) {
  if (!camera || !planeGroup) return;
  if (verificationState.forceScenicTour) {
    const scenicZ = (time * 245) % 19000;
    const scenicX = Math.sin(scenicZ * .00125 + .8) * 92 + Math.sin(scenicZ * .0032) * 28;
    const scenicGround = worldTerrainAt(scenicX, scenicZ).h;
    cameraDesired.set(scenicX + 72, scenicGround + 82 + Math.sin(time * .18) * 8, -scenicZ + 138);
    springVector(camera.position, cameraDesired, cameraVelocity, dt, 7, 4.8);
    lookTarget.set(scenicX, scenicGround + 9, -scenicZ - 220);
    camera.lookAt(lookTarget);
    camera.fov = lerp(camera.fov, 58, 1 - Math.pow(.001, dt));
  } else if (game.mode === 'menu') {
    cameraDesired.set(0, 33 + Math.sin(time * .7) * 1.4, 20);
    springVector(camera.position, cameraDesired, cameraVelocity, dt, 10, 5);
    lookTarget.set(0, 25, -90);
    camera.lookAt(lookTarget);
    camera.fov = lerp(camera.fov, 52, 1 - Math.pow(.001, dt));
  } else if (game.player) {
    const player = game.player;
    const resultShot = game.mode === 'result' || game.mode === 'crashed';
    const lookAhead = resultShot ? 28 : clamp(player.speed * .68, 24, 110);
    cameraDesired.set(player.x + player.roll * (resultShot ? 2 : 5), player.y + 7 + player.pitch * 4 - game.cameraDip, -player.z + (resultShot ? 34 : 21));
    springVector(camera.position, cameraDesired, cameraVelocity, dt, 25, 8);
    lookTarget.set(player.x + Math.sin(player.roll) * (resultShot ? 9 : 30), player.y + player.pitch * 8 + 1.5, -player.z - lookAhead);
    camera.lookAt(lookTarget);
    camera.fov = lerp(camera.fov, 51 + clamp(player.speed / 20, 0, 5), 1 - Math.pow(.001, dt));
    game.cameraDip = Math.max(0, game.cameraDip - dt * 1.7);
    game.cameraKick = Math.max(0, game.cameraKick - dt * 15);
  }
  const motionFactor = motionEnabled() ? 1 : 0;
  camera.position.x += juice.dx * .008 * motionFactor + Math.sin(time * 31) * game.cameraKick * .008 * motionFactor;
  camera.position.y += juice.dy * .008 * motionFactor - game.cameraKick * .004 * motionFactor;
  if (skyDome) skyDome.position.copy(camera.position);
  camera.updateProjectionMatrix();
}

function updateScene(dt, time) {
  if (waterSurfaceMaterial) waterSurfaceMaterial.uniforms.time.value = time;
  for (let index = 0; index < cloudMeshes.length; index += 1) {
    const cloud = cloudMeshes[index];
    const state = cloudStates[index];
    cloud.position.x += dt * state.speed;
    cloud.rotation.y = Math.sin(time * .18 + state.phase) * .04;
    if (cloud.position.x > state.wrap) cloud.position.x = -state.wrap;
  }
  for (let index = 0; index < ringObjects.length; index += 1) {
    const object = ringObjects[index];
    if (object.passed) {
      const echo = Math.max(0, (object.node.userData.beat || 0) - time);
      object.node.scale.setScalar(1 + echo * .52);
      object.ring.material.opacity = .2 + echo * .42;
      continue;
    }
    object.node.rotation.z = Math.sin(time * .9 + object.node.userData.phase) * .18;
    object.node.position.y = object.baseY + Math.sin(time * 1.8 + object.node.userData.phase) * 1.2;
    const pulse = index === game.nextTarget ? 1 + Math.sin(time * 5) * .09 : object.missed ? .86 : 1;
    object.node.scale.setScalar(pulse);
    if (index === game.nextTarget && !object.missed) object.ring.material.opacity = .72 + Math.sin(time * 5) * .18;
  }
  if (game.mode !== 'menu' && !kit.paused) updateParticles(dt);
}

function updateHUD() {
  if (game.mode !== 'flight' || !game.player) return;
  const player = game.player;
  const spec = selectedPlane();
  const ground = worldTerrainAt(player.x, player.z).h;
  const altitude = Math.max(0, player.y - ground);
  setTextIfChanged(ui.speed, Math.round(player.speed));
  ui.speedMeter.style.width = `${clamp(player.speed / selectedPlane().max, 0, 1) * 100}%`;
  const stallReference = game.assistsOn ? Math.max(20, spec.stall - 5) : spec.stall;
  ui.speedArc.style.setProperty('--speed-fill', `${clamp(player.speed / spec.max, 0, 1) * 100}%`);
  ui.speedArc.style.setProperty('--stall-mark', `${clamp(stallReference / spec.max, 0, 1) * 100}%`);
  ui.speedBand.classList.toggle('is-active', player.stallWarning);
  setTextIfChanged(ui.altitude, Math.round(altitude));
  ui.altitudeMeter.style.width = `${clamp(altitude / 100, 0, 1) * 100}%`;
  setTextIfChanged(ui.fuel, Math.ceil(player.fuel));
  ui.fuelMeter.style.width = `${player.fuel}%`;
  ui.fuelMeter.style.background = player.fuel < 18 ? '#ff9278' : '#ffd177';
  setTextIfChanged(ui.target, `${game.nextTarget} / ${game.targetTotal}`);
  ui.targetMeter.style.width = `${game.targetTotal ? (game.nextTarget / game.targetTotal) * 100 : 0}%`;
  ui.launchCountdown.classList.toggle('is-hidden', game.launchCountdown <= 0);
  if (game.launchCountdown > 0) setTextIfChanged(ui.launchCountdown, Math.max(1, Math.ceil(game.launchCountdown)));
  ui.alert.classList.toggle('is-hidden', !player.stallWarning && !game.fuelOut);
  ui.alert.classList.toggle('is-critical', player.stall);
  setTextIfChanged(ui.alertText, game.fuelOut ? 'FUEL OUT / BEST GLIDE' : player.stall ? 'STALL / NOSE DOWN + POWER' : `STALL MARGIN / ${Math.max(0, Math.round(player.speed - stallReference))} KT`);
  if (game.tutorialStep === 0) setTextIfChanged(ui.objective, 'Raise power and roll onto the launch line.');
  else if (game.tutorialStep === 1) setTextIfChanged(ui.objective, 'Bank once to read the turn response.');
  else if (game.tutorialStep === 2) setTextIfChanged(ui.objective, 'Follow the big gates, then bring it home.');
  else if (game.challenge.phase === 'free-flight') setTextIfChanged(ui.objective, `Free flight / reach the ${STRIPS[game.mission.strip].name} approach.`);
  else if (game.challenge.phase === 'targets' && game.nextTarget < game.targetTotal) setTextIfChanged(ui.objective, `${ringObjects[game.nextTarget]?.kind === 'cargo' ? 'Cargo hop' : 'Gate'} ${game.nextTarget + 1} ahead / fly through the center.`);
  else if (game.challenge.phase === 'approach') setTextIfChanged(ui.objective, `Approach setup / ${STRIPS[game.mission.strip].name}.`);
  else setTextIfChanged(ui.objective, `Landing window / ${STRIPS[game.mission.strip].name} / ${game.assistsOn ? spec.landingMin - 5 : spec.landingMin}-${game.assistsOn ? spec.landingMax + 7 : spec.landingMax} KT.`);
  ui.throttleControl.classList.toggle('is-focus', game.mission.kind === 'tutorial' && game.tutorialStep === 0);
  ui.stickControl.classList.toggle('is-focus', game.mission.kind === 'tutorial' && game.tutorialStep === 1);
  if (game.mission.kind === 'tutorial' && game.tutorialStep <= 2) {
    ui.tutorial.classList.remove('is-hidden');
    setTextIfChanged(ui.tutorialStep, game.tutorialStep === 0 ? '01 / TAKEOFF' : game.tutorialStep === 1 ? '02 / STEER' : '03 / ROUTE HOME');
    setTextIfChanged(ui.tutorialText, game.tutorialStep === 0 ? 'Add power. The hopper lifts when it is ready.' : game.tutorialStep === 1 ? 'Nudge the pad or A / D. The plane helps you level.' : 'Fly the big beacons, then follow the glowing strip home.');
  } else ui.tutorial.classList.add('is-hidden');
  const knobX = clamp(touch.stickX, -1, 1) * 42;
  const knobY = clamp(touch.stickY, -1, 1) * 42;
  ui.stick.style.transform = `translate(calc(-50% + ${knobX}px), calc(-50% + ${knobY}px))`;
  const throttlePercent = clamp(touch.throttle, 0, 1) * 100;
  ui.throttle.style.top = `${100 - throttlePercent}%`;
  ui.throttleFill.style.height = `${throttlePercent}%`;
  ui.horizon.style.transform = `translate(-50%, -50%) rotate(${player.roll * 24}deg) translateY(${player.pitch * 12}px)`;
  ui.flightPath.style.transform = `translate(calc(-50% + ${clamp(player.roll * 26, -34, 34)}px), calc(-50% + ${clamp(player.verticalSpeed * -2.2, -24, 24)}px))`;
  if (ringObjects[game.nextTarget]) {
    const target = ringObjects[game.nextTarget].target;
    const dx = clamp((target.x - player.x) * .25, -48, 48);
    const dy = clamp((target.y - player.y) * -.12, -28, 28);
    ui.nextTarget.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    setTextIfChanged(ui.nextTarget, ringObjects[game.nextTarget].kind === 'cargo' ? 'CARGO' : 'GATE');
    ui.nextTarget.classList.remove('is-hidden');
  } else ui.nextTarget.classList.add('is-hidden');
}

function renderCatalog(type) {
  game.mode = 'catalog';
  ui.catalogTitle.textContent = type === 'hangar' ? 'HANGAR' : 'MISSION BOARD';
  if (type === 'hangar') {
    ui.catalogContent.innerHTML = `<div class="catalog-section-label">AIRFRAME SELECT / ${progress.credits} FLIGHT CREDITS</div><div class="hangar-grid">${AIRCRAFT.map((plane) => { const unlocked = progress.unlocked.includes(plane.id); const selected = plane.id === progress.selected; return `<button class="aircraft-card${unlocked ? '' : ' is-locked'}${selected ? ' is-selected' : ''}" data-aircraft="${plane.id}" ${unlocked ? '' : 'disabled'}><div class="aircraft-swatch aircraft-swatch--${plane.silhouette}" style="--swatch:#${plane.color.toString(16).padStart(6, '0')}"><span></span></div><small>${selected ? 'Selected' : unlocked ? plane.role : `Unlock at ${plane.unlock} flights`}</small><h3>${plane.name}</h3><p>Stall ${plane.stall} KT / Cruise ${plane.max} KT / Glide ${plane.bestGlide} KT</p></button>`; }).join('')}</div><div class="catalog-section-label">ENVELOPE NOTES</div><p class="catalog-note">Each airframe keeps the same controls but changes stall speed, glide discipline, fuel burn, and landing band.</p>`;
  } else {
    ui.catalogContent.innerHTML = `<div class="catalog-section-label">14 SORTIES / MEASURED ROUTE LADDER</div><div class="mission-grid">${MISSIONS.map((mission, index) => { const unlocked = index === 0 || progress.completed.includes(MISSIONS[index - 1].id); const complete = progress.completed.includes(mission.id); const count = mission.kind === 'landing' ? 'free flight' : `${mission.targetCount} ${mission.kind === 'mixed' ? 'mixed targets' : mission.type === 'cargo' ? 'pickups' : 'gates'}`; return `<button class="mission-card${unlocked ? '' : ' is-locked'}" data-mission="${index}" ${unlocked ? '' : 'disabled'}><span class="mission-number">${String(index + 1).padStart(2, '0')} / ${mission.tier.toUpperCase()}</span>${complete ? '<span class="mission-badge">CLEARED</span>' : ''}<div class="route-thumb route-thumb--${mission.biome}"><i></i><b></b></div><h3>${mission.title}</h3><p>${mission.description}</p><div class="mission-meta"><span>${mission.time}</span><span>${count}</span></div></button>`; }).join('')}</div>`;
  }
  showOnly(ui.catalog);
}

function onKitPause(reason) {
  lastFrame = performance.now();
  pauseKeyLatch = false;
  if (reason === 'manual' && game.mode === 'flight') { ui.pause.classList.remove('is-hidden'); }
}

function togglePause() {
  if (game.mode !== 'flight') return;
  pauseKeyLatch = false;
  if (!kit.paused) { kit.pause('manual'); showOnly(ui.pause); }
  else { kit.resume('manual'); showOnly(ui.hud); }
}

function openSettings() {
  playSfx('uiSelect', .6);
  kit.openSettings([(box) => {
    const addVolume = (label, key, setter) => {
      const row = document.createElement('label');
      row.style.cssText = 'display:grid;grid-template-columns:1fr 90px;gap:12px;align-items:center;font:inherit;font-size:16px;color:#e8eef4;background:#1b2733;border:1px solid #2e3e4e;border-radius:10px;padding:12px 18px;min-width:min(70vw,280px);';
      row.innerHTML = `<span>${label}</span><input type="range" min="0" max="1" step=".05" value="${kit.audio.prefs[key]}" aria-label="${label}">`;
      row.querySelector('input').addEventListener('input', (event) => setter(Number(event.target.value)));
      box.appendChild(row);
    };
    addVolume('Music volume', 'music', (value) => kit.audio.setMusicVolume(value));
    addVolume('SFX volume', 'sfx', (value) => kit.audio.setSfxVolume(value));
    const aceRow = document.createElement('button');
    aceRow.className = 'cloudhopper-ace-row';
    aceRow.style.cssText = 'font:inherit;font-size:16px;color:#e8eef4;background:#1b2733;border:1px solid #2e3e4e;border-radius:10px;padding:12px 18px;min-width:min(70vw,280px);';
    const paintAce = () => { aceRow.textContent = `Ace handling: ${progress.ace ? 'On' : 'Off'}`; };
    aceRow.addEventListener('click', () => {
      progress.ace = !progress.ace;
      game.assistsOn = !progress.ace;
      saveProgress();
      paintAce();
      announce(progress.ace ? 'Ace handling on / original flight model' : 'Assists on / gentle flight model');
    });
    paintAce();
    box.appendChild(aceRow);
  }]);
}

function handleAction(action) {
  if (action === 'launch') beginFlight(progress.tutorialComplete ? Math.min(progress.completed.length, MISSIONS.length - 1) : 0);
  if (action === 'missions') { playSfx('uiSelect', .7); renderCatalog('missions'); }
  if (action === 'hangar') { playSfx('uiSelect', .7); renderCatalog('hangar'); }
  if (action === 'settings') openSettings();
  if (action === 'fullscreen') kit.requestFullscreen();
  if (action === 'pause') togglePause();
  if (action === 'resume') { kit.resume('manual'); showOnly(ui.hud); }
  if (action === 'restart') { kit.restart(); }
  if (action === 'title') showTitle();
}

function handleCatalogClick(event) {
  const missionCard = event.target.closest('[data-mission]');
  const aircraftCard = event.target.closest('[data-aircraft]');
  if (missionCard && !missionCard.disabled) { game.missionIndex = Number(missionCard.dataset.mission); playSfx('uiConfirm', .8); beginFlight(game.missionIndex); }
  if (aircraftCard && !aircraftCard.disabled) { progress.selected = aircraftCard.dataset.aircraft; saveProgress(); playSfx('uiConfirm', .8); announce(`${selectedPlane().name} selected`); renderCatalog('hangar'); }
}

function initInput() {
  document.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action) { event.preventDefault(); handleAction(action); }
  });
  ui.catalogContent.addEventListener('click', handleCatalogClick);
  window.addEventListener('keydown', (event) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
    if (event.code === 'KeyP' || event.code === 'Escape') {
      if (!pauseKeyLatch) togglePause();
      pauseKeyLatch = true;
    }
  });
  window.addEventListener('keyup', (event) => { if (event.code === 'KeyP' || event.code === 'Escape') pauseKeyLatch = false; });
  window.addEventListener('blur', () => { pauseKeyLatch = false; });
  document.addEventListener('visibilitychange', () => { pauseKeyLatch = false; if (document.hidden) simAccumulator = 0; });
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  systemReducedMotion = !!motionQuery?.matches;
  motionQuery?.addEventListener?.('change', (event) => { systemReducedMotion = event.matches; });
}

function updateLoader(done, total, stage) {
  const ratio = total ? done / total : 0;
  if (ui.loadingBar) ui.loadingBar.style.width = `${ratio * 100}%`;
  if (ui.loadingPercent) ui.loadingPercent.textContent = `${Math.round(ratio * 100)}%`;
  if (ui.loadingStage) ui.loadingStage.textContent = stage;
}

function boot() {
  const loadTotal = 4 + Object.keys(AUDIO).length;
  let loadDone = 0;
  const mark = (stage) => { loadDone += 1; updateLoader(loadDone, loadTotal, stage); };
  updateLoader(0, loadTotal, 'CALIBRATING FLIGHTWORKS');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  GGKit.hiDpi.three(renderer);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  camera = new THREE.PerspectiveCamera(52, window.innerWidth / Math.max(1, window.innerHeight), .1, 23000);
  camera.position.set(0, 35, 24);
  mark('RENDERER ONLINE');
  buildWorld();
  mark('REGION HEIGHTFIELD READY');
  initInput();
  mark('COCKPIT INPUT READY');
  resize();
  mark('HUD CALIBRATED');
  Promise.all(Object.keys(AUDIO).map((name) => kit.audio.preload([name]).then(() => mark(`AUDIO / ${name.replace(/[A-Z]/g, (letter) => ' ' + letter).toUpperCase()}`)))).then(() => {
    showTitle();
    updateLoader(loadTotal, loadTotal, 'FLIGHTWORKS READY');
    window.setTimeout(() => { ui.loading?.classList.add('is-hidden'); requestAnimationFrame(frame); }, 220);
  });
}

function frame(now) {
  const rawDt = Math.max(0, (now - lastFrame) / 1000);
  const dt = Math.min(.5, rawDt);
  lastFrame = now;
  const juice = kit.juice.frame();
  if (!juice.frozen) visualClock += dt;
  if (!kit.paused && !juice.frozen && game.mode === 'flight') {
    simAccumulator += dt;
    let steps = 0;
    while (simAccumulator >= FIXED_STEP && steps < MAX_SIM_STEPS) { simulate(FIXED_STEP); simAccumulator -= FIXED_STEP; steps += 1; }
    if (steps === MAX_SIM_STEPS && simAccumulator > FIXED_STEP) simAccumulator = 0;
  }
  const renderDt = juice.frozen ? 0 : dt;
  updatePlane(renderDt, visualClock);
  updateScene(renderDt, visualClock);
  updateHUD();
  syncVerificationState();
  updateCamera(renderDt, visualClock, juice);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

boot();
