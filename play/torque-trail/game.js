// Torque Trail: trucking job runner. The simulation and GGKit contracts stay
// title-side; GGRacer owns the road, environment, vehicle, camera, and FX.
import * as THREE from 'three';
import { createRacerWorld } from '../_shared/racer/engine.js';

'use strict';

const sceneCanvas = document.getElementById('scene');
const hudCanvas = document.getElementById('hud');

const ui = {
  title: document.getElementById('titleScreen'), drive: document.getElementById('driveHud'),
  start: document.getElementById('startButton'), titleSettings: document.getElementById('titleSettingsButton'),
  cash: document.getElementById('cashRead'), jobs: document.getElementById('jobsRead'), tire: document.getElementById('tireRead'),
  lock: document.getElementById('lockRead'), zone: document.getElementById('zoneRead'), cargo: document.getElementById('cargoRead'),
  garage: document.getElementById('garageButton'), settings: document.getElementById('settingsButton'), pause: document.getElementById('pauseButton'),
  throttle: document.getElementById('throttleControl'), throttleTrack: document.getElementById('throttleTrack'), throttleKnob: document.getElementById('throttleKnob'),
  steer: document.getElementById('steerControl'), steerTrack: document.getElementById('steerTrack'), steerKnob: document.getElementById('steerKnob'),
  winch: document.getElementById('winchButton'), recover: document.getElementById('recoverButton'), state: document.getElementById('stateRead'),
  tutorial: document.getElementById('tutorialCard'), tutorialStep: document.getElementById('tutorialStep'), tutorialText: document.getElementById('tutorialText'),
  message: document.getElementById('message'), jobPanel: document.getElementById('jobPanel'), jobTitle: document.getElementById('jobPanelTitle'),
  jobCopy: document.getElementById('jobPanelCopy'), jobList: document.getElementById('jobList'), jobGarage: document.getElementById('jobGarageButton'),
  garagePanel: document.getElementById('garagePanel'), diff: document.getElementById('diffLockChoice'), upgrade: document.getElementById('upgradeButton'),
  pausePanel: document.getElementById('pausePanel'), resume: document.getElementById('resumeButton'), pauseRestart: document.getElementById('pauseRestartButton'),
  pauseSettings: document.getElementById('pauseSettingsButton'), quit: document.getElementById('quitButton'), titleCash: document.getElementById('titleCash'),
  titleJobs: document.getElementById('titleJobs'), titleUpgrade: document.getElementById('titleUpgrade'), titleBest: document.getElementById('titleBest'),
  speed: document.getElementById('speedRead'), torque: document.getElementById('torqueRead'), speedArc: document.getElementById('speedArc'),
  torqueArc: document.getElementById('torqueArc'), payout: document.getElementById('payoutRead'), settingsPanel: document.getElementById('settingsPanel'),
  musicVolume: document.getElementById('musicVolume'), sfxVolume: document.getElementById('sfxVolume'), shakeToggle: document.getElementById('shakeToggle'),
  reducedToggle: document.getElementById('reducedToggle'), loading: document.getElementById('loadingScreen'), loadingStage: document.getElementById('loadingStage'),
  loadingBar: document.getElementById('loadingBar'),
};

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const money = (v) => '$' + Math.max(0, Math.round(v));
const TAU = Math.PI * 2;
const WORLD_HALF = 160;
const SAVE_VERSION = 5;

const LIVERIES = {
  sunset: { name: 'Sunset', color: 0xd48d3f, accent: 0xf2cf6a },
  pine: { name: 'Pine', color: 0x3d9a78, accent: 0xa5e1b4 },
  ridge: { name: 'Ridge', color: 0x4f8fbd, accent: 0xc2e4ef },
};

// These multipliers are the prototype handling contract.
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

// The authored world network remains the sim source of truth. Route JSONs in
// tracks/ use these same vertices, so surface classification and delivery
// distances remain unchanged after the render swap.
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

const TRACK_FILES = {
  'frontier-main': 'tracks/frontier-main.json',
  'job-mire-seals': 'tracks/job-mire-seals.json',
  'job-ridge-lanterns': 'tracks/job-ridge-lanterns.json',
  'job-silt-medicine': 'tracks/job-silt-medicine.json',
  'job-survey-cores': 'tracks/job-survey-cores.json',
  'job-field-radios': 'tracks/job-field-radios.json',
  'job-mire-fuel': 'tracks/job-mire-fuel.json',
  'job-quarry-bearings': 'tracks/job-quarry-bearings.json',
  'job-quarry-relays': 'tracks/job-quarry-relays.json',
  'job-stone-samples': 'tracks/job-stone-samples.json',
  'job-lantern-batteries': 'tracks/job-lantern-batteries.json',
  'job-ridge-mesh': 'tracks/job-ridge-mesh.json',
  'job-long-haul': 'tracks/job-long-haul.json',
};

const ANCHOR_POINTS = [[-105, 72], [-78, 6], [-42, 49], [-2, 110], [42, 47], [77, 17], [104, -17], [90, -102], [22, -82], [-57, -65], [-99, -13], [122, 76]];
const SFX = { click: 'assets/sfx/click.mp3', confirm: 'assets/sfx/confirm.mp3', back: 'assets/sfx/back.mp3', open: 'assets/sfx/open.mp3', drop: 'assets/sfx/drop.mp3', select: 'assets/sfx/select.mp3', winch: 'assets/sfx/winch.mp3', mud: 'assets/sfx/mud.mp3', wood: 'assets/sfx/wood.mp3', payout: 'assets/sfx/payout.mp3' };

function heightAt(x, z) {
  let h = Math.sin(x * .045) * 1.7 + Math.cos(z * .055) * 1.35 + Math.sin((x + z) * .022) * 1.2;
  const rockD = Math.hypot((x - 76) / 92, (z + 48) / 72);
  h += clamp(1 - rockD, 0, 1) * (5.5 + Math.sin(x * .12) * 1.5);
  const mudD = Math.hypot((x + 18) / 74, (z - 40) / 54);
  h -= clamp(1 - mudD, 0, 1) * 1.8;
  return h;
}

function pointSegmentDistance(x, z, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const len = dx * dx + dz * dz;
  const t = len ? clamp(((x - a[0]) * dx + (z - a[1]) * dz) / len, 0, 1) : 0;
  return Math.hypot(x - (a[0] + t * dx), z - (a[1] + t * dz));
}

function roadDistance(x, z) {
  let best = Infinity;
  for (const path of ROAD_PATHS) for (let i = 1; i < path.length; i += 1) best = Math.min(best, pointSegmentDistance(x, z, path[i - 1], path[i]));
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
  if (!o.recovery || typeof o.recovery !== 'object' || typeof o.recovery.bogged !== 'boolean' || typeof o.recovery.bogTimer !== 'number' || !isFinite(o.recovery.bogTimer) || o.recovery.bogTimer < 0 || o.recovery.bogTimer > 30) return false;
  if (o.recovery.winch !== null && (!o.recovery.winch || typeof o.recovery.winch !== 'object' || typeof o.recovery.winch.x !== 'number' || !isFinite(o.recovery.winch.x) || typeof o.recovery.winch.z !== 'number' || !isFinite(o.recovery.winch.z) || typeof o.recovery.winch.time !== 'number' || !isFinite(o.recovery.winch.time) || o.recovery.winch.x < -WORLD_HALF || o.recovery.winch.x > WORLD_HALF || o.recovery.winch.z < -WORLD_HALF || o.recovery.winch.z > WORLD_HALF || o.recovery.winch.time < 0 || o.recovery.winch.time > 3)) return false;
  return true;
}

const DEFAULT_SAVE = {
  v: SAVE_VERSION, cash: 160, jobs: 0, bestCash: 160, tire: 'road', diffLock: false, upgrade: 0, livery: 'sunset', lastSettlement: 0,
  currentJob: null, completed: {}, tutorialDone: false, reducedMotion: false, screenShake: true,
  recovery: { bogged: false, bogTimer: 0, winch: null }, player: { x: -126, z: 102, angle: .25, speed: 0 },
};

let racer = null;
let trackDataById = {};
let activeRouteId = 'frontier-main';
let markerGroup = null;
let depotMarkers = [];
let anchorMarkers = [];
let beaconMarker = null;
let guideMarker = null;
let guidePath = null;
let lastRouteProgress = 0;
const raycaster = new THREE.Raycaster();
const trackPosition = new THREE.Vector3();
const trackClosest = { progress: 0, distance: 0, lateral: 0, offroad: false, sector: 0, position: new THREE.Vector3(), tangent: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3() };
const trackSample = { progress: 0, position: new THREE.Vector3(), tangent: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(), bank: 0 };
const racerFrame = { carState: { progress: 0, speed: 0, steering: 0, acceleration: 0, lateralG: 0, suspension: 0, brake: 0, boost: 0, position: { x: 0, y: 0, z: 0 }, yaw: 0 }, rivals: [] };

const kit = GGKit.create({
  slug: 'torque-trail', orientation: 'any', validateSave,
  onPause(reason) { pausedReason = reason; clearClaimedControls(); if (racer) racer.world.setPaused(true); },
  onResume() { pausedReason = null; if (racer) racer.world.setPaused(false); },
  onRestart() { resetTrip(); },
});
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/play/torque-trail/sw.js', { scope: '/play/torque-trail/' }).catch(() => {});
kit.audio.register({ menu: 'assets/music/quiet-range.mp3', trail: 'assets/music/open-trail.mp3', ...SFX });

let save = kit.save.get(null);
if (!validateSave(save)) save = JSON.parse(JSON.stringify(DEFAULT_SAVE));
kit.juice.enabled = save.screenShake;

const state = {
  player: { ...save.player }, currentJob: save.currentJob, bogged: save.recovery.bogged, bogTimer: save.recovery.bogTimer,
  winch: save.recovery.winch ? { ...save.recovery.winch } : null, lastSettlement: save.lastSettlement, celebrate: 0,
  tripDistance: 0, animState: 'idle', motionDip: 0, motionVelocity: 0, fxClock: 0,
};

let mode = 'title';
let pausedReason = null;
let lastFrame = performance.now();
let saveClock = 0;
let messageClock = 0;
let audioStarted = false;
let currentDepot = 0;
let worldClock = 0;
let uiClock = 0;
let payoutClock = 0;
let lastPayout = 0;
let lastHudSnapshot = '';
const inputSnapshot = { throttle: 0, steer: 0 };
const controlRects = { throttle: { x: 0, y: 0, w: 1, h: 1 }, steer: { x: 0, y: 0, w: 1, h: 1 } };
const claimedControls = new Map();
const nearestSettlementResult = { index: -1, distance: Infinity };

const tutorial = {
  active: !save.tutorialDone, step: 0, text: [
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
  save.recovery = { bogged: !!state.bogged, bogTimer: clamp(state.bogTimer, 0, 30), winch: state.winch ? { x: state.winch.x, z: state.winch.z, time: clamp(state.winch.time, 0, 3) } : null };
  kit.save.set(save);
}

function sfx(name, opts) { kit.audio.sfx(name, opts); }
function ensureAudio(route) {
  const target = route ? 'trail' : 'menu';
  if (audioStarted && route === !!(mode === 'drive')) return;
  audioStarted = true;
  kit.audio.music(target, 650);
}
function toast(text, seconds = 2.4) { ui.message.textContent = text; ui.message.classList.add('show'); messageClock = seconds; }

function applyMode(next) {
  mode = next;
  ui.title.style.display = next === 'title' ? 'flex' : 'none';
  ui.drive.style.display = next === 'drive' ? 'block' : 'none';
  const controlsOn = next === 'drive';
  ui.throttle.style.display = controlsOn ? 'block' : 'none';
  ui.steer.style.display = controlsOn ? 'block' : 'none';
  if (controlsOn) requestAnimationFrame(measureControls); else clearClaimedControls();
  updateTitleMeta();
  updateUI();
}

function updateTitleMeta() {
  ui.titleCash.textContent = money(save.cash); ui.titleJobs.textContent = String(save.jobs);
  ui.titleUpgrade.textContent = save.upgrade ? 'Torque ' + save.upgrade : 'Stock'; ui.titleBest.textContent = money(save.bestCash);
}

function routeIdForJob(jobId) { return jobId ? 'job-' + jobId : 'frontier-main'; }

function makeLabel(text, color) {
  const canvas = document.createElement('canvas'); canvas.width = 384; canvas.height = 96;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = 'rgba(10,25,30,.9)'; ctx.fillRect(4, 8, 376, 80);
  ctx.strokeStyle = '#' + new THREE.Color(color).getHexString(); ctx.lineWidth = 4; ctx.strokeRect(4, 8, 376, 80);
  ctx.fillStyle = '#f7edc8'; ctx.font = '900 25px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text.toUpperCase(), 192, 49);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(9, 2.25, 1); return sprite;
}

function disposeMarkerGroup() {
  if (!markerGroup) return;
  markerGroup.traverse((object) => {
    if (object.geometry) object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => { if (material) { if (material.map) material.map.dispose(); material.dispose(); } });
  });
  markerGroup = null; depotMarkers = []; anchorMarkers = []; beaconMarker = null; guideMarker = null; guidePath = null;
}

function markerFrameAt(x, z) {
  trackPosition.set(x, heightAt(x, z), z);
  const query = racer.trackQueries.closestPoint(trackPosition, trackClosest);
  racer.trackQueries.sampleRacingLine(query.progress, trackSample);
  return trackSample;
}

function buildMarkerGroup() {
  disposeMarkerGroup();
  markerGroup = new THREE.Group(); markerGroup.name = 'Torque Trail title markers';
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < SETTLEMENTS.length; i += 1) {
    const settlement = SETTLEMENTS[i]; const frame = markerFrameAt(settlement.x, settlement.z);
    const group = new THREE.Group(); group.userData.settlementId = i; group.position.copy(frame.position);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(3.8, 4.5, .28, 8), new THREE.MeshStandardMaterial({ color: 0x294d45, roughness: .9 }));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4.9, .16, 8, 32), new THREE.MeshStandardMaterial({ color: settlement.color, emissive: settlement.color, emissiveIntensity: .5, roughness: .5, metalness: .14 }));
    ring.quaternion.setFromUnitVectors(up, frame.up); ring.position.y = .24;
    const label = makeLabel(settlement.name, settlement.color); label.position.copy(frame.up).multiplyScalar(4.2);
    group.add(base, ring, label); group.traverse((object) => { object.userData.settlementId = i; });
    markerGroup.add(group); depotMarkers.push({ group, ring, index: i });
  }
  const guideFrame = markerFrameAt(SETTLEMENTS[0].x, SETTLEMENTS[0].z);
  guideMarker = new THREE.Group(); guideMarker.name = 'tutorial Bramblehook guide'; guideMarker.position.copy(guideFrame.position);
  const guideRing = new THREE.Mesh(new THREE.TorusGeometry(3.1, .16, 6, 24), new THREE.MeshBasicMaterial({ color: 0xf4ce65, transparent: true, opacity: .9 }));
  guideRing.quaternion.setFromUnitVectors(up, guideFrame.up); guideRing.position.y = .3;
  const guideCone = new THREE.Mesh(new THREE.ConeGeometry(.5, 1.5, 5), new THREE.MeshBasicMaterial({ color: 0xf4ce65, transparent: true, opacity: .9 }));
  guideCone.position.copy(guideFrame.up).multiplyScalar(1.5); guideMarker.add(guideRing, guideCone); guideMarker.traverse((object) => { object.userData.settlementId = 0; });
  guideMarker.visible = false;
  markerGroup.add(guideMarker);
  const guideGeometry = new THREE.BufferGeometry(); guideGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
  guidePath = new THREE.Line(guideGeometry, new THREE.LineBasicMaterial({ color: 0xf4ce65, transparent: true, opacity: .55, depthWrite: false }));
  guidePath.visible = false;
  markerGroup.add(guidePath);
  for (let i = 0; i < ANCHOR_POINTS.length; i += 1) {
    const [x, z] = ANCHOR_POINTS[i]; const frame = markerFrameAt(x, z);
    const group = new THREE.Group(); group.userData.anchor = true; group.position.copy(frame.position);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.3, .12, 6, 24), new THREE.MeshStandardMaterial({ color: 0xf4ce65, emissive: 0xf4ce65, emissiveIntensity: .36, roughness: .5 }));
    ring.quaternion.setFromUnitVectors(up, frame.up); ring.position.y = .2; group.add(ring);
    group.traverse((object) => { object.userData.anchor = true; }); markerGroup.add(group);
    anchorMarkers.push({ x, z, object: group, ring });
  }
  if (state.currentJob) {
    const job = JOBS.find((candidate) => candidate.id === state.currentJob);
    if (job) {
      const frame = markerFrameAt(SETTLEMENTS[job.to].x, SETTLEMENTS[job.to].z);
      beaconMarker = new THREE.Group(); beaconMarker.name = 'active load beacon'; beaconMarker.position.copy(frame.position);
      const beaconRing = new THREE.Mesh(new THREE.TorusGeometry(5.7, .22, 8, 32), new THREE.MeshStandardMaterial({ color: 0xf4ce65, emissive: 0xf4ce65, emissiveIntensity: 1.2, roughness: .35, metalness: .18 }));
      beaconRing.quaternion.setFromUnitVectors(up, frame.up); beaconRing.position.y = .32;
      const beacon = new THREE.Mesh(new THREE.ConeGeometry(.8, 2.8, 6), new THREE.MeshBasicMaterial({ color: 0xf4ce65, transparent: true, opacity: .9 }));
      beacon.position.copy(frame.up).multiplyScalar(2.1); beaconMarker.add(beaconRing, beacon, makeLabel('DELIVER', 0xf4ce65));
      beaconMarker.userData.baseY = beaconMarker.position.y;
      markerGroup.add(beaconMarker);
    }
  }
  racer.world.scene.add(markerGroup);
}

function setRacerRoute(routeId) {
  const data = trackDataById[routeId] || trackDataById['frontier-main'];
  if (!data) return;
  disposeMarkerGroup();
  if (racer) racer.world.dispose();
  activeRouteId = data.id;
  racer = createRacerWorld({
    canvas: sceneCanvas, trackJSON: data, theme: data.theme || 'desert',
    timeOfDay: data.timeOfDay || (data.theme === 'night-city' ? 'night' : 'dusk'),
    rivalCount: 0, ggkit: kit, paint: LIVERIES[save.livery].color, accent: LIVERIES[save.livery].accent,
    carName: 'Torque Trail field truck',
  });
  racer.quality.set(2);
  racer.world.setPaused(!!kit.paused);
  buildMarkerGroup();
  updateRacerFrame(1 / 60);
  racer.world.update(racerFrame, 1 / 60);
  racer.camera.snapToCar();
}

function nearestAnchor() {
  let best = null; let bestDistance = Infinity;
  for (const anchor of anchorMarkers) {
    const d = Math.hypot(state.player.x - anchor.x, state.player.z - anchor.z);
    if (d < bestDistance) { bestDistance = d; best = anchor; }
  }
  return bestDistance < 34 ? best : null;
}

function nearestSettlement() {
  let bestIndex = -1; let bestDistance = Infinity;
  for (let i = 0; i < SETTLEMENTS.length; i += 1) {
    const d = dist2(state.player, SETTLEMENTS[i]);
    if (d < bestDistance) { bestDistance = d; bestIndex = i; }
  }
  nearestSettlementResult.index = bestIndex; nearestSettlementResult.distance = bestDistance;
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
function routeTier() { return clamp(1 + Math.floor((save.jobs + 1) / 2), 1, 6); }
function jobUnlocked(job) { return job.difficulty <= routeTier(); }
function motionImpact(power) { if (!save.reducedMotion) state.motionVelocity -= power; }
function juiceShake(magnitude, duration) { if (!save.reducedMotion) kit.juice.shake(magnitude, duration); }
function juiceHitStop(duration) { if (!save.reducedMotion) kit.juice.hitStop(duration); }

// The simulation still calls these prototype effect hooks. GGRacer consumes
// the resulting speed, suspension, brake, and boost channels for its FX.
function emitDust() {}
function emitSurfaceFX() {}
function burst() { state.celebrate = Math.max(state.celebrate, .45); }

function clearClaimedControls() { claimedControls.clear(); inputSnapshot.throttle = 0; inputSnapshot.steer = 0; }
function claimControl(event, zone, element) {
  if (mode !== 'drive' || kit.paused) return;
  let pointer = kit.input.pointers.get(event.pointerId);
  if (!pointer) {
    pointer = { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, downAt: performance.now(), zone: null };
    kit.input.pointers.set(event.pointerId, pointer);
  }
  claimedControls.set(event.pointerId, zone); pointer.zone = zone;
  try { element.setPointerCapture(event.pointerId); } catch (_) {}
}
function releaseControl(event) { claimedControls.delete(event.pointerId); }
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
  let throttle = 0; let steer = 0;
  const throttleRect = controlRects.throttle; const steerRect = controlRects.steer;
  const throttlePointer = throttleRect.w > 1 && throttleRect.h > 1 ? claimedPointer('throttle') : null;
  const steerPointer = steerRect.w > 1 && steerRect.h > 1 ? claimedPointer('steer') : null;
  if (throttlePointer && throttleRect.h > 1) {
    const t = clamp((throttlePointer.y - throttleRect.y) / throttleRect.h, 0, 1); throttle = 1 - t * 2;
    ui.throttleKnob.style.top = clamp((throttlePointer.y - throttleRect.y) - 25, -1, throttleRect.h - 49) + 'px';
  } else ui.throttleKnob.style.top = '88px';
  if (steerPointer && steerRect.w > 1) {
    const t = clamp((steerPointer.x - steerRect.x) / steerRect.w, 0, 1); steer = t * 2 - 1;
    ui.steerKnob.style.left = clamp((steerPointer.x - steerRect.x) - 25, -1, steerRect.w - 49) + 'px';
  } else ui.steerKnob.style.left = 'calc(50% - 25px)';
  if (kit.input.keyDown('ArrowUp') || kit.input.keyDown('KeyW') || kit.input.keyDown('Space')) throttle = 1;
  if (kit.input.keyDown('ArrowDown') || kit.input.keyDown('KeyS')) throttle = -1;
  if (kit.input.keyDown('ArrowLeft') || kit.input.keyDown('KeyA')) steer = -1;
  if (kit.input.keyDown('ArrowRight') || kit.input.keyDown('KeyD')) steer = 1;
  inputSnapshot.throttle = clamp(throttle, -1, 1); inputSnapshot.steer = clamp(steer, -1, 1); return inputSnapshot;
}

function updateSimulation(dt) {
  const input = readControls(); const p = state.player;
  if (!state.winch) {
    const surface = surfaceAt(p.x, p.z); const grip = traction(surface);
    const maxForward = surface === 'water' ? 90 : surface === 'mud' ? 105 : surface === 'rock' ? 145 : 215;
    if (Math.abs(input.throttle) > .02) p.speed += input.throttle * 195 * grip * dt;
    const drag = surface === 'mud' ? (save.tire === 'mud' ? .29 : .21) : surface === 'water' ? .55 : surface === 'rock' ? .72 : .82;
    p.speed *= Math.pow(drag, dt); p.speed = clamp(p.speed, -105 * grip, maxForward * grip);
    const steeringPower = (.65 + Math.min(1.1, Math.abs(p.speed) / 120)) * (p.speed >= 0 ? 1 : -1);
    p.angle += input.steer * steeringPower * dt;
    const oldX = p.x, oldZ = p.z;
    p.x += Math.sin(p.angle) * p.speed * dt; p.z += Math.cos(p.angle) * p.speed * dt;
    p.x = clamp(p.x, -WORLD_HALF + 5, WORLD_HALF - 5); p.z = clamp(p.z, -WORLD_HALF + 5, WORLD_HALF - 5);
    state.tripDistance += Math.hypot(p.x - oldX, p.z - oldZ);
    if (Math.abs(p.speed) > 34 && Math.random() < dt * 12) emitDust();
    state.fxClock -= dt;
    if (state.fxClock <= 0 && Math.abs(p.speed) > 18) { emitSurfaceFX(); state.fxClock = surface === 'mud' ? .08 : surface === 'rock' ? .1 : .14; }
    if (surface === 'mud' && Math.abs(p.speed) < 28 && input.throttle > .25) state.bogTimer += dt * (1.3 / Math.max(.5, grip));
    else state.bogTimer = Math.max(0, state.bogTimer - dt * 1.6);
    if (state.bogTimer > 2.5) {
      if (!state.bogged) { sfx('mud', { volume: .75 }); motionImpact(.22); toast('Bogged down. Find a gold-ringed tree or recover.', 3.1); }
      state.bogged = true; p.speed *= .84;
    }
    if (state.bogged && surface !== 'mud') { state.bogged = false; state.bogTimer = 0; }
  } else {
    const a = state.winch; const dx = a.x - p.x, dz = a.z - p.z; const distance = Math.hypot(dx, dz); p.speed = 0;
    if (distance > 6) { const step = Math.min(168 * (1 + save.upgrade * .12) * dt, distance - 6); p.x += dx / distance * step; p.z += dz / distance * step; p.angle = Math.atan2(dx, dz); emitDust(); }
    a.time -= dt; const remaining = Math.hypot(a.x - p.x, a.z - p.z);
    if (remaining <= 6.05 || a.time <= 0) { state.winch = null; state.bogged = false; state.bogTimer = 0; sfx('wood', { volume: .78 }); burst(); motionImpact(.16); juiceShake(3, 150); toast('Winch bite. Back on the trail.'); }
  }
  const near = nearestSettlement(); if (near) state.lastSettlement = near.index;
  if (state.currentJob) { const job = JOBS.find((j) => j.id === state.currentJob); if (job && dist2(p, SETTLEMENTS[job.to]) < 13) completeJob(job); }
  saveClock += dt; if (saveClock > 1.2) { persist(); saveClock = 0; }
  if (state.celebrate > 0) state.celebrate -= dt;
  updateTutorial();
}

function completeJob(job) {
  save.cash += job.pay; lastPayout = job.pay; save.jobs += 1; save.bestCash = Math.max(save.bestCash, save.cash); save.completed[job.id] = true;
  state.currentJob = null; state.lastSettlement = job.to; state.bogged = false; state.bogTimer = 0; state.celebrate = 1.3; state.player.speed = 0; payoutClock = 2.8;
  motionImpact(.24); persist(); sfx('payout', { volume: .95 }); sfx('drop', { volume: .65 }); sfx('confirm', { volume: .6 }); burst(); juiceShake(7, 220); juiceHitStop(60);
  setRacerRoute('frontier-main');
  toast('Delivered ' + job.cargo.toLowerCase() + '  ·  +' + money(job.pay), 3.2);
  if (tutorial.active && tutorial.step === 3) finishTutorial();
}

function deployWinch() {
  if (state.winch || !state.bogged) return;
  const anchor = nearestAnchor(); if (!anchor) { toast('No anchor in range. Recover if the bog has you.'); return; }
  state.winch = { x: anchor.x, z: anchor.z, time: 2.4 }; sfx('winch', { volume: .9 }); motionImpact(.12); juiceShake(3, 120); toast('Winch engaged. Hold the line.');
}
function recoveryPoint(depot, job) {
  const candidates = [[18, 12], [-18, 12], [18, -12], [-18, -12], [22, 0], [0, 22]];
  for (const [dx, dz] of candidates) { const x = clamp(depot.x + dx, -WORLD_HALF + 5, WORLD_HALF - 5); const z = clamp(depot.z + dz, -WORLD_HALF + 5, WORLD_HALF - 5); if (!job || Math.hypot(x - SETTLEMENTS[job.to].x, z - SETTLEMENTS[job.to].z) >= 13.5) return { x, z }; }
  return { x: clamp(depot.x + 22, -WORLD_HALF + 5, WORLD_HALF - 5), z: clamp(depot.z + 8, -WORLD_HALF + 5, WORLD_HALF - 5) };
}
function recover() {
  if (!state.bogged || nearestAnchor()) return;
  const cost = Math.min(Math.max(5, 25 - save.upgrade * 5), save.cash); save.cash -= cost;
  const depot = SETTLEMENTS[state.lastSettlement] || SETTLEMENTS[0]; const activeJob = state.currentJob && JOBS.find((job) => job.id === state.currentJob); const spawn = recoveryPoint(depot, activeJob);
  state.player.x = spawn.x; state.player.z = spawn.z; state.player.speed = 0; state.player.angle = Math.atan2(depot.x - state.player.x, depot.z - state.player.z); state.bogged = false; state.bogTimer = 0; state.winch = null;
  motionImpact(.28); persist(); sfx('back', { volume: .85 }); burst(); juiceShake(9, 220); toast(cost ? 'Recovered at ' + depot.name + '  ·  -' + money(cost) : 'Recovered at ' + depot.name + '  ·  empty wallet', 3);
}
function resetTrip() {
  const depot = SETTLEMENTS[state.lastSettlement] || SETTLEMENTS[0]; state.currentJob = null; state.player.x = depot.x + 10; state.player.z = depot.z + 8; state.player.speed = 0; state.player.angle = .25;
  state.bogged = false; state.bogTimer = 0; state.winch = null; state.tripDistance = 0; persist(); setRacerRoute('frontier-main'); sfx('back', { volume: .7 }); toast('Trip reset at ' + depot.name + '.');
}

function suspensionValue(p) {
  const fx = Math.sin(p.angle), fz = Math.cos(p.angle); const sx = Math.cos(p.angle), sz = -Math.sin(p.angle);
  const front = (heightAt(p.x + fx * 1.35 + sx * .85, p.z + fz * 1.35 + sz * .85) + heightAt(p.x + fx * 1.35 - sx * .85, p.z + fz * 1.35 - sz * .85)) * .5;
  const rear = (heightAt(p.x - fx * 1.35 + sx * .85, p.z - fz * 1.35 + sz * .85) + heightAt(p.x - fx * 1.35 - sx * .85, p.z - fz * 1.35 - sz * .85)) * .5;
  return clamp((front + rear - heightAt(p.x, p.z) * 2) * .06 + state.motionDip, -.18, .18);
}

function updateRacerFrame(dt) {
  if (!racer) return;
  const p = state.player; const car = racerFrame.carState; const surface = surfaceAt(p.x, p.z);
  trackPosition.set(p.x, heightAt(p.x, p.z), p.z); lastRouteProgress = racer.trackQueries.closestPoint(trackPosition, trackClosest).progress;
  state.motionVelocity += (0 - state.motionDip) * 34 * dt; state.motionVelocity *= Math.exp(-9 * dt); state.motionDip += state.motionVelocity * dt;
  car.progress = lastRouteProgress; car.speed = p.speed / 3.6; car.steering = inputSnapshot.steer; car.acceleration = inputSnapshot.throttle * 195 * traction(surface) / 3.6;
  car.lateralG = inputSnapshot.steer * Math.abs(car.speed) * .014; car.suspension = suspensionValue(p); car.brake = inputSnapshot.throttle < 0 ? -inputSnapshot.throttle : 0; car.boost = 0;
  car.pitch = clamp(-inputSnapshot.throttle * Math.abs(car.speed) / 210 * .07, -.09, .09); car.roll = save.reducedMotion ? 0 : clamp(-inputSnapshot.steer * Math.abs(car.speed) / 150 * .06, -.06, .06);
  car.position.x = p.x; car.position.y = heightAt(p.x, p.z) + state.motionDip; car.position.z = p.z; car.yaw = p.angle;
  state.animState = state.celebrate > 0 ? 'delivered' : state.winch ? 'winching' : state.bogged ? 'bogged' : Math.abs(p.speed) > 5 || Math.abs(inputSnapshot.throttle) > .1 ? 'driving' : 'idle';
}

function updateTitleMarkers(dt) {
  if (!markerGroup) return;
  for (const marker of depotMarkers) { marker.ring.rotation.z += dt * .7; const active = state.currentJob && JOBS.find((job) => job.id === state.currentJob)?.to === marker.index; marker.ring.scale.setScalar(active ? 1.12 + Math.sin(worldClock * 5) * .08 : 1 + Math.sin(worldClock * 2 + marker.index) * .04); marker.ring.material.emissiveIntensity = active ? .9 : .45; }
  for (const marker of anchorMarkers) { marker.ring.rotation.z += dt * 1.5; const near = Math.hypot(state.player.x - marker.x, state.player.z - marker.z) < 42; marker.ring.scale.setScalar(near ? 1 + Math.sin(worldClock * 5) * .08 : 1); marker.ring.material.emissiveIntensity = near ? .85 : .36; }
  if (beaconMarker) { beaconMarker.position.y = beaconMarker.userData.baseY + Math.sin(worldClock * 4) * .16; beaconMarker.rotation.y += dt * .45; }
  if (guideMarker && guidePath) {
    const showGuide = tutorial.active && tutorial.step === 0 && mode === 'drive' && !state.currentJob;
    guideMarker.visible = showGuide; guidePath.visible = showGuide;
    if (showGuide) {
      guideMarker.scale.setScalar(1 + Math.sin(worldClock * 5) * .08); guideMarker.rotation.y += dt * .7;
      const guidePosition = guidePath.geometry.attributes.position.array; const target = guideMarker.position;
      guidePosition[0] = state.player.x; guidePosition[1] = heightAt(state.player.x, state.player.z) + .25; guidePosition[2] = state.player.z;
      guidePosition[3] = lerp(state.player.x, target.x, .33); guidePosition[4] = lerp(heightAt(state.player.x, state.player.z), target.y, .33) + .55; guidePosition[5] = lerp(state.player.z, target.z, .33);
      guidePosition[6] = lerp(state.player.x, target.x, .66); guidePosition[7] = lerp(heightAt(state.player.x, state.player.z), target.y, .66) + .55; guidePosition[8] = lerp(state.player.z, target.z, .66);
      guidePosition[9] = target.x; guidePosition[10] = target.y + .25; guidePosition[11] = target.z; guidePath.geometry.attributes.position.needsUpdate = true;
    }
  }
}

function updateTutorial() {
  if (!tutorial.active || mode !== 'drive') { ui.tutorial.classList.remove('show'); return; }
  if (tutorial.step === 0 && state.currentJob) tutorial.step = 1;
  else if (tutorial.step === 1 && state.tripDistance > 22) tutorial.step = 2;
  else if (tutorial.step === 2 && save.diffLock) tutorial.step = 3;
  ui.tutorial.classList.add('show'); ui.tutorialStep.textContent = 'Field briefing ' + (tutorial.step + 1) + ' / 4'; ui.tutorialText.textContent = tutorial.text[tutorial.step];
}
function finishTutorial() { tutorial.active = false; save.tutorialDone = true; persist(); ui.tutorial.classList.remove('show'); toast('Briefing complete. The whole frontier is open.', 3.4); }

function updateUI() {
  if (uiClock < .08) return; uiClock = 0;
  const surface = surfaceAt(state.player.x, state.player.z); const zone = surface === 'mud' ? 'Mud Bog' : surface === 'rock' ? 'Rock Ridge' : surface === 'water' ? 'Shallow Crossing' : surface === 'road' ? 'Ridge Trail' : 'Open Meadow';
  const speedValue = Math.round(Math.abs(state.player.speed)); const torqueValue = Math.round(clamp(traction(surface) / 1.45, 0, 1) * 100);
  if (ui.speed) ui.speed.textContent = speedValue + ' km/h'; if (ui.torque) ui.torque.textContent = torqueValue + '%';
  if (ui.speedArc) ui.speedArc.style.background = 'conic-gradient(var(--teal) 0 ' + clamp(speedValue / 2.15, 0, 100) + '%, rgba(255,255,255,.1) ' + clamp(speedValue / 2.15, 0, 100) + '% 100%)';
  if (ui.torqueArc) ui.torqueArc.style.background = 'conic-gradient(var(--orange) 0 ' + torqueValue + '%, rgba(255,255,255,.1) ' + torqueValue + '% 100%)';
  const snapshot = [save.cash, save.jobs, save.tire, save.diffLock, zone, state.currentJob, state.bogged, !!state.winch, state.animState, payoutClock > 0].join('|');
  if (snapshot === lastHudSnapshot) return; lastHudSnapshot = snapshot;
  ui.cash.textContent = money(save.cash); ui.jobs.textContent = String(save.jobs); ui.tire.textContent = TIRES[save.tire].label; ui.lock.textContent = save.diffLock ? 'ON' : 'OFF'; ui.zone.textContent = zone + '  ·  ROUTE ' + routeTier();
  if (state.currentJob) { const job = JOBS.find((j) => j.id === state.currentJob); ui.cargo.style.display = 'block'; ui.cargo.innerHTML = '<b>' + (job ? job.cargo.toUpperCase() : 'CARGO') + '</b>  →  ' + (job ? SETTLEMENTS[job.to].name : 'the depot') + '  ·  ' + money(job ? job.pay : 0); }
  else { ui.cargo.style.display = 'block'; ui.cargo.innerHTML = 'No cargo loaded. <b>Tap a depot</b> to open the job board.'; }
  const anchor = nearestAnchor(); const winchDisplay = state.bogged && anchor && !state.winch ? 'block' : 'none'; const recoverDisplay = state.bogged && !anchor && state.bogTimer > 3.4 && !state.winch ? 'block' : 'none';
  if (ui.winch.style.display !== winchDisplay) ui.winch.style.display = winchDisplay; if (ui.recover.style.display !== recoverDisplay) ui.recover.style.display = recoverDisplay;
  ui.state.textContent = state.animState.toUpperCase() + (state.bogged ? '  ·  BOGGED' : '');
  if (ui.payout) { ui.payout.style.display = payoutClock > 0 ? 'block' : 'none'; if (payoutClock > 0) ui.payout.textContent = 'PAYMENT CLEARED  +' + money(lastPayout); }
  updateTitleMeta();
}

function renderJobBoard(index) {
  currentDepot = index; const depot = SETTLEMENTS[index]; const near = dist2(state.player, depot) < 25; ui.jobTitle.textContent = depot.name; ui.jobCopy.textContent = near ? 'Choose a load, then tune the truck for the ground ahead.' : 'Drive closer to the depot to load a route.'; ui.jobList.replaceChildren();
  for (const job of JOBS.filter((j) => j.from === index)) {
    const complete = !!save.completed[job.id]; const unlocked = jobUnlocked(job); const ready = near && !state.currentJob && unlocked; const card = document.createElement('button');
    card.className = 'job-card' + (ready ? ' ready' : '') + (complete ? ' done' : '') + (!unlocked ? ' locked' : ''); card.disabled = !ready;
    const pips = '<span class="difficulty-pips" aria-label="Tier ' + job.difficulty + '">' + [1, 2, 3, 4, 5, 6].map((pip) => '<i class="' + (pip <= job.difficulty ? 'on' : '') + '"></i>').join('') + '</span>';
    const status = !unlocked ? 'Unlocks after ' + Math.max(1, (job.difficulty - 1) * 2 - 1) + ' runs' : complete ? 'REPEATABLE CONTRACT' : 'NEW ROUTE';
    card.innerHTML = '<span class="job-main"><span class="route-preview route-' + job.difficulty + '"><i></i><i></i><i></i></span><span><span class="job-name">' + job.cargo + '  →  ' + SETTLEMENTS[job.to].name + '</span><span class="job-detail">' + job.tip + '  ·  ' + status + '</span>' + pips + '</span></span><span class="job-pay">' + money(job.pay) + '</span>';
    card.addEventListener('click', () => takeJob(job)); ui.jobList.appendChild(card);
  }
  for (const button of document.querySelectorAll('#tireChoices .choice, #garageTireChoices .choice')) button.classList.toggle('selected', button.dataset.tire === save.tire);
}
function openJobBoard(index) { if (mode !== 'drive') return; renderJobBoard(index); sfx('open', { volume: .65 }); kit.pause('jobPanel'); ui.jobPanel.style.display = 'flex'; }
function takeJob(job) {
  if (state.currentJob || !jobUnlocked(job) || dist2(state.player, SETTLEMENTS[job.from]) >= 25) return;
  state.currentJob = job.id; state.tripDistance = 0; setRacerRoute(routeIdForJob(job.id)); persist(); sfx('confirm', { volume: .8 }); closePanel('jobPanel'); toast('Loaded ' + job.cargo.toLowerCase() + '. Roll to ' + SETTLEMENTS[job.to].name + '.', 3);
}
function openGarage() { const depot = nearestSettlement(); if (!depot) { toast('Garage tuning happens at a depot.'); return; } sfx('open', { volume: .55 }); updateGarageUI(); kit.pause('garagePanel'); ui.garagePanel.style.display = 'flex'; }
function updateGarageUI() {
  ui.diff.classList.toggle('selected', save.diffLock); ui.diff.querySelector('small').textContent = save.diffLock ? 'On: more low-speed traction' : 'Off: free-rolling on firm trail';
  for (const button of document.querySelectorAll('#garageTireChoices .choice')) button.classList.toggle('selected', button.dataset.tire === save.tire);
  for (const button of document.querySelectorAll('#liveryChoices .choice')) button.classList.toggle('selected', button.dataset.livery === save.livery);
  const pull = 34 + save.upgrade * 22; const recovery = 22 + save.upgrade * 24; document.getElementById('garageTruckIcon').style.background = '#' + LIVERIES[save.livery].color.toString(16).padStart(6, '0'); document.getElementById('pullStat').style.width = pull + '%'; document.getElementById('recoveryStat').style.width = recovery + '%'; document.getElementById('garagePreviewCopy').textContent = save.upgrade ? 'Torque Kit ' + save.upgrade + ' field tune' : 'Stock field tune';
  if (save.upgrade >= 3) { ui.upgrade.querySelector('b').textContent = 'TORQUE KIT MAX'; ui.upgrade.querySelector('small').textContent = 'Maximum field tune installed'; ui.upgrade.disabled = true; }
  else { const price = 180 + save.upgrade * 120; ui.upgrade.querySelector('b').textContent = 'TORQUE KIT ' + (save.upgrade + 1); ui.upgrade.querySelector('small').textContent = money(price) + '  ·  +' + (12 + save.upgrade * 3) + '% pull  ·  cheaper recovery'; ui.upgrade.disabled = save.cash < price; }
}
function closePanel(id) { const panel = document.getElementById(id); if (panel) panel.style.display = 'none'; kit.resume(id); sfx('back', { volume: .35 }); }
function toggleDiffLock() { save.diffLock = !save.diffLock; persist(); updateGarageUI(); sfx('select', { volume: .65 }); toast(save.diffLock ? 'Diff-lock on. Crawl with intent.' : 'Diff-lock off. The truck rolls free.'); }
function chooseTire(tire) { if (!TIRES[tire]) return; save.tire = tire; persist(); updateGarageUI(); for (const button of document.querySelectorAll('#tireChoices .choice, #garageTireChoices .choice')) button.classList.toggle('selected', button.dataset.tire === save.tire); updateUI(); sfx('select', { volume: .65 }); toast(TIRES[tire].label + ' tires mounted.'); }
function chooseLivery(livery) { if (!LIVERIES[livery]) return; save.livery = livery; persist(); if (racer) racer.world.mainCar.setLivery({ paint: LIVERIES[livery].color, accent: LIVERIES[livery].accent }); updateGarageUI(); sfx('select', { volume: .65 }); toast(LIVERIES[livery].name + ' livery applied.'); }
function buyUpgrade() { if (save.upgrade >= 3) return; const price = 180 + save.upgrade * 120; if (save.cash < price) { toast('Not enough payout saved for this tune.'); return; } save.cash -= price; save.upgrade += 1; persist(); updateGarageUI(); updateUI(); sfx('confirm', { volume: .9 }); burst(); toast('Torque Kit ' + save.upgrade + ' installed.'); }
function syncSettingsUI() { if (!ui.musicVolume) return; ui.musicVolume.value = String(Math.round(kit.audio.prefs.music * 100)); ui.sfxVolume.value = String(Math.round(kit.audio.prefs.sfx * 100)); ui.shakeToggle.textContent = kit.juice.enabled ? 'Screen shake: On' : 'Screen shake: Off'; ui.reducedToggle.textContent = save.reducedMotion ? 'Reduced motion: On' : 'Reduced motion: Off'; ui.shakeToggle.setAttribute('aria-pressed', String(kit.juice.enabled)); ui.reducedToggle.setAttribute('aria-pressed', String(save.reducedMotion)); }
function openSettingsPanel() { if (ui.settingsPanel) { syncSettingsUI(); kit.pause('settings'); ui.settingsPanel.style.display = 'flex'; } }
function closeSettingsPanel() { if (!ui.settingsPanel) return; ui.settingsPanel.style.display = 'none'; kit.resume('settings'); }
function manualPause() { if (mode !== 'drive' || kit.paused) return; sfx('click', { volume: .55 }); kit.pause('manual'); ui.pausePanel.style.display = 'flex'; }
function manualResume() { ui.pausePanel.style.display = 'none'; kit.resume('manual'); sfx('click', { volume: .55 }); }
function returnToTitle() { ui.pausePanel.style.display = 'none'; kit.resume('manual'); persist(); kit.audio.music('menu', 500); applyMode('title'); }

function handleCanvasClick(event) {
  if (mode !== 'drive' || kit.paused || !racer || !markerGroup) return;
  const rect = sceneCanvas.getBoundingClientRect(); const pointer = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, racer.world.camera); const hits = raycaster.intersectObjects(markerGroup.children, true);
  for (const hit of hits) { const object = hit.object; if (object.userData.settlementId != null) { const index = object.userData.settlementId; if (dist2(state.player, SETTLEMENTS[index]) < 25) openJobBoard(index); else toast('Drive within the depot ring to open its board.'); return; } if (object.userData.anchor && state.bogged) { deployWinch(); return; } }
}

function resize() {
  if (racer) racer.world.resize();
  const width = Math.max(320, window.innerWidth); const height = Math.max(240, window.innerHeight); const pixelRatio = Math.min(1.5, window.devicePixelRatio || 1, 1280 / width);
  hudCanvas.width = Math.max(1, Math.floor(width * Math.min(pixelRatio, 1.25))); hudCanvas.height = Math.max(1, Math.floor(height * Math.min(pixelRatio, 1.25))); measureControls();
}
function measureControls() {
  const throttleRect = ui.throttleTrack.getBoundingClientRect(); const steerRect = ui.steerTrack.getBoundingClientRect();
  if (throttleRect.width > 1 && throttleRect.height > 1) Object.assign(controlRects.throttle, { x: throttleRect.left, y: throttleRect.top, w: throttleRect.width, h: throttleRect.height });
  if (steerRect.width > 1 && steerRect.height > 1) Object.assign(controlRects.steer, { x: steerRect.left, y: steerRect.top, w: steerRect.width, h: steerRect.height });
}

function setupInteractions() {
  ui.start.addEventListener('click', () => { ensureAudio(true); applyMode('drive'); sfx('confirm', { volume: .8 }); });
  ui.titleSettings.addEventListener('click', openSettingsPanel); ui.pause.addEventListener('click', manualPause); ui.settings.addEventListener('click', openSettingsPanel); ui.garage.addEventListener('click', openGarage); ui.winch.addEventListener('click', deployWinch); ui.recover.addEventListener('click', recover); ui.diff.addEventListener('click', toggleDiffLock); ui.upgrade.addEventListener('click', buyUpgrade);
  ui.jobGarage.addEventListener('click', () => { closePanel('jobPanel'); openGarage(); }); ui.resume.addEventListener('click', manualResume); ui.pauseRestart.addEventListener('click', () => { kit.restart(); manualResume(); }); ui.pauseSettings.addEventListener('click', openSettingsPanel); ui.quit.addEventListener('click', returnToTitle);
  if (ui.settingsPanel) { document.getElementById('settingsCloseButton').addEventListener('click', closeSettingsPanel); ui.musicVolume.addEventListener('input', () => kit.audio.setMusicVolume(Number(ui.musicVolume.value) / 100)); ui.sfxVolume.addEventListener('input', () => kit.audio.setSfxVolume(Number(ui.sfxVolume.value) / 100)); ui.shakeToggle.addEventListener('click', () => { kit.juice.enabled = !kit.juice.enabled; save.screenShake = kit.juice.enabled; persist(); syncSettingsUI(); }); ui.reducedToggle.addEventListener('click', () => { save.reducedMotion = !save.reducedMotion; persist(); syncSettingsUI(); }); }
  for (const button of document.querySelectorAll('[data-close]')) button.addEventListener('click', () => closePanel(button.dataset.close));
  for (const button of document.querySelectorAll('[data-tire]')) button.addEventListener('click', () => chooseTire(button.dataset.tire));
  for (const button of document.querySelectorAll('[data-livery]')) button.addEventListener('click', () => chooseLivery(button.dataset.livery));
  sceneCanvas.addEventListener('click', handleCanvasClick); ui.throttle.addEventListener('pointerdown', (event) => claimControl(event, 'throttle', ui.throttle)); ui.steer.addEventListener('pointerdown', (event) => claimControl(event, 'steer', ui.steer)); ui.throttle.addEventListener('lostpointercapture', releaseControl); ui.steer.addEventListener('lostpointercapture', releaseControl);
  window.addEventListener('pointerup', releaseControl, { passive: true }); window.addEventListener('pointercancel', releaseControl, { passive: true }); window.addEventListener('blur', clearClaimedControls, { passive: true }); ui.tutorial.addEventListener('click', () => { if (tutorial.step === 0 && mode === 'drive' && !kit.paused) openJobBoard(0); });
  window.addEventListener('keydown', (event) => { if (event.code === 'Escape') { if (ui.settingsPanel.style.display === 'flex') closeSettingsPanel(); else if (ui.jobPanel.style.display === 'flex') closePanel('jobPanel'); else if (ui.garagePanel.style.display === 'flex') closePanel('garagePanel'); else if (mode === 'drive' && !kit.paused) manualPause(); else if (kit.paused && pausedReason === 'manual') manualResume(); } if (event.code === 'Enter' && mode === 'title') { ensureAudio(true); applyMode('drive'); } if ((event.code === 'KeyW' || event.code === 'Space' || event.code === 'Enter') && state.bogged && !kit.paused) deployWinch(); if (event.code === 'KeyR' && state.bogged && !kit.paused) recover(); if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault(); }, { passive: false });
  window.addEventListener('pointerdown', () => { if (mode === 'title') ensureAudio(false); }, { passive: true }); window.addEventListener('keydown', () => { if (mode === 'title') ensureAudio(false); }, { passive: true }); window.addEventListener('resize', resize, { passive: true }); window.addEventListener('orientationchange', resize, { passive: true }); window.addEventListener('beforeunload', persist); window.addEventListener('pagehide', persist); document.addEventListener('contextmenu', (event) => event.preventDefault());
}

function frame(now) {
  const dt = Math.min(.05, Math.max(0, (now - lastFrame) / 1000)); lastFrame = now; worldClock += dt; uiClock += dt;
  if (messageClock > 0 && (messageClock -= dt) <= 0) ui.message.classList.remove('show'); if (payoutClock > 0) payoutClock = Math.max(0, payoutClock - dt);
  const juice = kit.juice.frame();
  if (!kit.paused && !juice.frozen) { if (mode === 'drive') updateSimulation(dt); updateRacerFrame(dt); updateTitleMarkers(dt); }
  if (racer) { racer.world.setPaused(!!kit.paused); racer.world.update(racerFrame, kit.paused || juice.frozen ? 0 : dt); racer.world.render(); }
  updateUI(); requestAnimationFrame(frame);
}

async function boot() {
  kit.loader.show('Torque Trail'); if (ui.loading) { ui.loading.style.display = 'flex'; ui.loadingStage.textContent = 'Loading route contracts'; ui.loadingBar.style.width = '10%'; }
  kit.loader.progress(.1); const entries = Object.entries(TRACK_FILES); const loaded = await Promise.all(entries.map(async ([id, path]) => { const response = await fetch(path); if (!response.ok) throw new Error('missing route ' + id); return [id, await response.json()]; }));
  trackDataById = Object.fromEntries(loaded); kit.loader.progress(.6); if (ui.loading) { ui.loadingStage.textContent = 'Waking the GGRacer field truck'; ui.loadingBar.style.width = '72%'; }
  setRacerRoute(routeIdForJob(state.currentJob)); resize(); setupInteractions(); applyMode('title'); updateUI(); racer.world.render();
  kit.loader.progress(1); if (ui.loading) { ui.loadingBar.style.width = '100%'; ui.loadingStage.textContent = 'Ready to haul'; } await new Promise((resolve) => setTimeout(resolve, 80)); kit.loader.hide(); if (ui.loading) ui.loading.style.display = 'none';
  requestAnimationFrame(frame);
}

updateTitleMeta();
boot().catch(() => { kit.loader.progress(1); kit.loader.hide(); if (ui.loading) ui.loading.style.display = 'none'; toast('The route book could not load. Reload to try again.', 6); });
