import * as THREE from 'three';

/* Vertol Rescue / fleet F1
 *
 * A fixed-step hover and winch sim with a procedural low-poly airframe. GGKit
 * owns lifecycle, input identity, saves and audio. Three owns only the view.
 * The render view never stores pose on sim entities: survivor state and their
 * pooled render slots stay separate so a debug probe cannot corrupt a frame.
 */
(() => {
  'use strict';

  const { GGKit } = window;
  const canvas = document.getElementById('scene');
  const bootHook = window.__vr || {};
  const TAU = Math.PI * 2;
  const STEP = 1 / 60;
  const MAX_SIM_STEPS = 5;
  const MAX_SURVIVORS = 9;
  const MAX_FX = 220;
  const MAX_WASH = 150;
  const MAX_CABLE_SEGMENTS = 18;
  const WORLD_X = 50;
  const WORLD_Z = 35;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const approach = (a, b, speed, dt) => a + (b - a) * (1 - Math.exp(-speed * dt));
  const pad2 = (v) => String(Math.max(0, Math.floor(v))).padStart(2, '0');
  const formatTime = (v) => `${pad2(v / 60)}:${pad2(v % 60)}`;
  const setTextIfChanged = (node, value) => {
    if (node && node.textContent !== String(value)) node.textContent = String(value);
  };
  const setStyleIfChanged = (node, property, value) => {
    if (node && node.style[property] !== value) node.style[property] = value;
  };

  const MISSIONS = [
    {
      id: 'urban-extraction', short: 'URBAN', title: 'Urban Extraction', zone: 'Floodline District', order: 0,
      description: 'Rooftop survivors. A collapsing block. Find the canal cut before the timer closes.',
      total: 6, timeLimit: 150, targetTime: 106, windBase: 10, windAngle: .35, fog: .006,
      palette: { sky: 0x193b4b, horizon: 0x507d78, ground: 0x274750, water: 0x17465a, accent: 0x71e4c0, wash: 0x6bc9c2, fire: 0xffa65f },
      hospital: { x: -39, z: 25 }, shortcut: { name: 'CANAL CUT', x: 6, z: 20, radius: 4.6 },
      pickups: [{ x: -20, z: 16, type: 'fuel' }, { x: 13, z: 5, type: 'repair' }, { x: 34, z: 17, type: 'flare' }],
      survivors: [
        { name: 'ARI', x: -25, z: -10, y: 5.8, priority: 2, color: 0xffc46b },
        { name: 'BO', x: -8, z: -15, y: 7.1, priority: 1, color: 0x8ce4ec },
        { name: 'CLEO', x: 11, z: -10, y: 5.4, priority: 3, color: 0xf2a6df },
        { name: 'DAX', x: 26, z: -3, y: 6.6, priority: 2, color: 0xa5ef9f },
        { name: 'ELI', x: 30, z: 13, y: 3.4, priority: 1, color: 0xffd36f },
        { name: 'FIA', x: -2, z: 18, y: 1.3, priority: 3, color: 0xff9797 }
      ],
      hazards: [
        { kind: 'powerline', x: -17, z: -3, w: 15, d: 1, h: 7.8, damage: 14 },
        { kind: 'powerline', x: 20, z: 4, w: 1, d: 13, h: 6.5, damage: 14 },
        { kind: 'smoke', x: -1, z: -5, w: 5, d: 5, h: 10, damage: 7 },
        { kind: 'collapse', x: 18, z: -16, w: 8, d: 7, h: 10, damage: 18 }
      ],
      signature: 'collapse'
    },
    {
      id: 'storm-rescue', short: 'STORM', title: 'Storm Rescue', zone: 'Ember Ridge', order: 1,
      description: 'High wind, low visibility, and a wildfire ridge that keeps moving under the rotor wash.',
      total: 6, timeLimit: 165, targetTime: 119, windBase: 38, windAngle: -.95, fog: .018,
      palette: { sky: 0x4b3540, horizon: 0x9c694e, ground: 0x4b3d36, water: 0x393d47, accent: 0xffa06a, wash: 0xd98a55, fire: 0xff704d },
      hospital: { x: -39, z: 25 }, shortcut: { name: 'FIREBREAK SADDLE', x: -1, z: 10, radius: 4.2 },
      pickups: [{ x: -22, z: 15, type: 'fuel' }, { x: 17, z: -1, type: 'repair' }, { x: 31, z: 18, type: 'flare' }, { x: 5, z: -22, type: 'fuel' }],
      survivors: [
        { name: 'JUN', x: -27, z: -15, y: 2.3, priority: 1, color: 0x8ed9ef },
        { name: 'KAI', x: -13, z: -23, y: 3.6, priority: 2, color: 0xffc56f },
        { name: 'LEA', x: 3, z: -17, y: 5.9, priority: 1, color: 0xf3a1a1 },
        { name: 'MOR', x: 20, z: -12, y: 4.5, priority: 3, color: 0xb6efa1 },
        { name: 'NOA', x: 32, z: 0, y: 6.2, priority: 2, color: 0xffd978 },
        { name: 'PAX', x: 25, z: 18, y: 2.1, priority: 3, color: 0xd0a8ff }
      ],
      hazards: [
        { kind: 'smoke', x: -19, z: -6, w: 6, d: 6, h: 11, damage: 8 },
        { kind: 'smoke', x: 14, z: -4, w: 7, d: 7, h: 12, damage: 8 },
        { kind: 'fire', x: 5, z: -24, w: 7, d: 5, h: 2.4, damage: 10 },
        { kind: 'fire', x: 29, z: 8, w: 6, d: 6, h: 2.1, damage: 10 },
        { kind: 'ridge', x: -3, z: 4, w: 10, d: 9, h: 6.8, damage: 17 }
      ],
      signature: 'ridge'
    },
    {
      id: 'mass-casualty', short: 'MASS', title: 'Mass Casualty', zone: 'Northstar Offshore Rig', order: 2,
      description: 'Nine lives across a broken rig. Triage the critical calls first, then thread the capsized boat.',
      total: 9, timeLimit: 205, targetTime: 152, windBase: 31, windAngle: 1.25, fog: .014,
      palette: { sky: 0x203f58, horizon: 0x6d8f96, ground: 0x263c46, water: 0x0d3d55, accent: 0x7cdde1, wash: 0x64cbdc, fire: 0xff9a5b },
      hospital: { x: -39, z: 25 }, shortcut: { name: 'UNDER-DECK CHANNEL', x: 13, z: 23, radius: 4.4 },
      pickups: [{ x: -24, z: 15, type: 'fuel' }, { x: 2, z: 15, type: 'repair' }, { x: 28, z: -15, type: 'flare' }, { x: 35, z: 15, type: 'fuel' }],
      survivors: [
        { name: 'RHEA', x: -25, z: -17, y: 2.2, priority: 1, color: 0xffa58e },
        { name: 'SOL', x: -14, z: -13, y: 4.2, priority: 1, color: 0x86e4ee },
        { name: 'TESS', x: -1, z: -18, y: 3.2, priority: 2, color: 0xffd978 },
        { name: 'UMA', x: 12, z: -14, y: 5.5, priority: 3, color: 0xb2efa1 },
        { name: 'VIK', x: 27, z: -8, y: 3.3, priority: 2, color: 0xd1b0ff },
        { name: 'WES', x: 35, z: 2, y: 2.0, priority: 1, color: 0xff9a9a },
        { name: 'YARA', x: 25, z: 15, y: 2.1, priority: 2, color: 0xa1c7ff },
        { name: 'ZED', x: 9, z: 22, y: 1.2, priority: 3, color: 0xffbd77 },
        { name: 'ANN', x: -8, z: 23, y: 1.4, priority: 2, color: 0xf4a8da }
      ],
      hazards: [
        { kind: 'crane', x: 4, z: -4, w: 2, d: 15, h: 12, damage: 18 },
        { kind: 'crane', x: 24, z: 7, w: 13, d: 2, h: 8, damage: 18 },
        { kind: 'smoke', x: 19, z: -17, w: 5, d: 5, h: 9, damage: 6 },
        { kind: 'boat', x: 28, z: 23, w: 10, d: 5, h: 2.8, damage: 13 }
      ],
      signature: 'boat'
    },
    {
      id: 'night-harbor', short: 'NIGHT', title: 'Night Harbor Finale', zone: 'Blackwater Harbor', order: 3,
      description: 'The unlocked night operation. Follow flare lanes through cranes, smoke, and a collapsing dock.',
      total: 7, timeLimit: 190, targetTime: 140, windBase: 24, windAngle: -.4, fog: .025,
      palette: { sky: 0x07162c, horizon: 0x244362, ground: 0x142b3a, water: 0x082b43, accent: 0x8ed9ff, wash: 0x70cfe1, fire: 0xff8f68 },
      hospital: { x: -39, z: 25 }, shortcut: { name: 'DRY DOCK TUNNEL', x: -2, z: 21, radius: 4.0 },
      pickups: [{ x: -24, z: 16, type: 'fuel' }, { x: 13, z: 16, type: 'repair' }, { x: 31, z: 1, type: 'flare' }, { x: 18, z: -22, type: 'fuel' }],
      survivors: [
        { name: 'ASH', x: -25, z: -15, y: 3.1, priority: 1, color: 0x8de1ef },
        { name: 'BEA', x: -10, z: -20, y: 1.7, priority: 2, color: 0xffc875 },
        { name: 'CIR', x: 7, z: -15, y: 6.2, priority: 1, color: 0xf5a4bb },
        { name: 'DREW', x: 23, z: -7, y: 3.8, priority: 3, color: 0xa7efa3 },
        { name: 'ELI', x: 34, z: 4, y: 2.3, priority: 2, color: 0xffdb78 },
        { name: 'FOX', x: 20, z: 18, y: 4.3, priority: 1, color: 0xb6c8ff },
        { name: 'GREY', x: 0, z: 24, y: 1.3, priority: 2, color: 0xd4a8ff }
      ],
      hazards: [
        { kind: 'powerline', x: -15, z: -3, w: 17, d: 1, h: 7.1, damage: 16 },
        { kind: 'crane', x: 16, z: 1, w: 2, d: 16, h: 14, damage: 19 },
        { kind: 'smoke', x: 2, z: -4, w: 7, d: 7, h: 12, damage: 7 },
        { kind: 'collapse', x: 24, z: 17, w: 9, d: 7, h: 9, damage: 20 }
      ],
      signature: 'harbor'
    }
  ];
  const CONTRACT_DEFINITIONS = [
    { id: 'urban-headwind', base: 'urban-extraction', short: 'URBAN+', title: 'Urban Headwind', zone: 'Floodline District / Headwind Contract', description: 'A tighter canal route with stronger gusts. Prove the first extraction was repeatable.', timeLimit: 145, targetTime: 112, windBase: 24 },
    { id: 'storm-blackout', base: 'storm-rescue', short: 'STORM+', title: 'Storm Blackout', zone: 'Ember Ridge / Blackout Contract', description: 'The ridge is darker and the firebreak is narrower. Read the flare lane and keep the cable calm.', timeLimit: 180, targetTime: 131, windBase: 48 },
    { id: 'rig-triage-rush', base: 'mass-casualty', short: 'MASS+', title: 'Rig Triage Rush', zone: 'Northstar Offshore Rig / Rush Contract', description: 'Nine calls, a shorter window, and a stricter priority chain on the weather deck.', timeLimit: 225, targetTime: 168, windBase: 42 },
    { id: 'harbor-low-tide', base: 'night-harbor', short: 'NIGHT+', title: 'Harbor Low Tide', zone: 'Blackwater Harbor / Low Tide Contract', description: 'The dry dock is open, but the cranes are live. Find the faster line and carry every survivor home.', timeLimit: 180, targetTime: 132, windBase: 34 },
    { id: 'floodline-afterdark', base: 'urban-extraction', short: 'FLOOD+', title: 'Floodline Afterdark', zone: 'Floodline District / Afterdark Contract', description: 'A second collapse blocks the familiar lane. The hospital beacon is your only safe horizon.', timeLimit: 155, targetTime: 118, windBase: 30 },
    { id: 'ridge-firebreak', base: 'storm-rescue', short: 'RIDGE+', title: 'Ridge Firebreak', zone: 'Ember Ridge / Firebreak Contract', description: 'The fire front is advancing. Use the saddle shortcut before the smoke columns close the route.', timeLimit: 170, targetTime: 126, windBase: 55 }
  ];
  CONTRACT_DEFINITIONS.forEach((contract, index) => {
    const base = MISSIONS.find((mission) => mission.id === contract.base);
    MISSIONS.push({ ...base, ...contract, order: 4 + index, zoneType: contract.base, contract: true, hazards: base.hazards.map((hazard, hazardIndex) => ({ ...hazard, x: hazard.x + (index % 2 ? 1.4 : -1.2), z: hazard.z + (hazardIndex % 2 ? 1.1 : -1.1) })) });
  });
  const MISSION_BY_ID = Object.fromEntries(MISSIONS.map((mission) => [mission.id, mission]));
  const MISSION_ALIASES = { urban: 'urban-extraction', storm: 'storm-rescue', mass: 'mass-casualty', night: 'night-harbor', finale: 'night-harbor' };
  const MAX_MEDAL = 3;

  const AUDIO = {
    rotor: 'assets/rotor.mp3', night: 'assets/night.mp3', wind: 'assets/wind.mp3', radio: 'assets/radio.mp3', cry: 'assets/cry.mp3',
    secure: 'assets/secure.mp3', impact: 'assets/impact.mp3', medal: 'assets/medal.mp3', pickup: 'assets/pickup.mp3', landing: 'assets/landing.mp3', tailwash: 'assets/tailwash.mp3'
  };

  function validateBest(value) {
    return value && typeof value === 'object' && !Array.isArray(value) && Number.isFinite(value.time) && value.time >= 0 && value.time <= 9999 && Number.isFinite(value.damage) && value.damage >= 0 && value.damage <= 100 && Number.isInteger(value.saved) && value.saved >= 0 && value.saved <= MAX_SURVIVORS && Number.isInteger(value.medal) && value.medal >= 0 && value.medal <= MAX_MEDAL;
  }
  function validateProfile(value) {
    if (!value || value.version !== 2 || !Array.isArray(value.unlocked) || typeof value.medals !== 'object' || Array.isArray(value.medals) || typeof value.best !== 'object' || Array.isArray(value.best)) return false;
    if (value.unlocked.some((id) => !MISSION_BY_ID[id]) || new Set(value.unlocked).size !== value.unlocked.length) return false;
    if (!value.unlocked.includes('urban-extraction')) return false;
    const medalKeys = Object.keys(value.medals);
    if (medalKeys.some((id) => !MISSION_BY_ID[id] || !Number.isInteger(value.medals[id]) || value.medals[id] < 0 || value.medals[id] > MAX_MEDAL)) return false;
    if (Object.entries(value.best).some(([id, best]) => !MISSION_BY_ID[id] || !validateBest(best))) return false;
    if (typeof value.runs !== 'number' || !Number.isInteger(value.runs) || value.runs < 0 || value.runs > 999999) return false;
    return true;
  }

  let pauseMode = null;
  let runtimeState = null;
  const kit = GGKit.create({
    slug: 'vertol-rescue', orientation: 'landscape', validateSave: validateProfile,
    onPause(reason) {
      controlClaims.stick = null; controlClaims.throttle = null; controlClaims.winch = null;
      accumulator = 0;
      if (runtimeState && runtimeState.mode === 'playing') { pauseMode = 'playing'; runtimeState.mode = 'paused'; runtimeState.paused = true; }
      if (reason === 'manual') showOnly('pause-screen');
    },
    onResume() {
      lastFrame = performance.now();
      if (pauseMode === 'playing') { runtimeState.mode = 'playing'; runtimeState.paused = false; pauseMode = null; hide('pause-screen'); show('hud'); measureControls(); }
    },
    onRestart() {
      controlClaims.stick = null; controlClaims.throttle = null; controlClaims.winch = null;
      if (state.mode === 'playing' || state.mode === 'won' || state.mode === 'crashed') beginMission(currentMission.id, true);
      if (kit.paused) kit.resume('manual');
    }
  });
  kit.registerPWA();
  kit.audio.register(AUDIO);

  const defaultProfile = { version: 2, unlocked: ['urban-extraction'], medals: {}, best: {}, runs: 0 };
  let profile = kit.save.get(defaultProfile);
  if (!validateProfile(profile)) profile = { version: 2, unlocked: ['urban-extraction'], medals: {}, best: {}, runs: 0 };

  const state = {
    mode: 'title', mission: 'urban-extraction', fuel: 100, hull: 100, survivors: 0,
    survivorsTotal: 6, aboard: 0, delivered: 0, waiting: 6, time: 0, timeLimit: 150,
    wind: 0, windOverride: null, cableLength: 7, cableTension: 0, damageStage: 0,
    shortcutFound: false, triageMistakes: 0, reason: '', medal: 0, paused: false, tutorialStep: 0
  };
  runtimeState = state;

  let currentMission = MISSIONS[0];
  let selectedMissionId = 'urban-extraction';
  let renderer;
  let scene;
  let camera;
  let zoneGroup;
  let survivorGroup;
  let pickupGroup;
  let helicopter;
  let helicopterParts;
  let cableLine;
  let cableHook;
  let washPoints;
  let washPositions;
  let fxPoints;
  let fxPositions;
  let fxColors;
  let fxSizes;
  let fxAlphas;
  let cablePositions;
  let survivorMeshes = [];
  let pickupMeshes = [];
  let fxSlots = [];
  let washSlots = [];
  let cameraTarget = new THREE.Vector3();
  let cameraGoal = new THREE.Vector3();
  let currentHazards = [];
  let dynamicHazardViews = [];
  let washRing;
  let washDust;
  let accumulator = 0;
  let lastFrame = performance.now();
  let eventUntil = 0;
  let eventSerial = 0;
  const eventQueue = [];
  let resultState = null;
  let gamepadWasPaused = false;
  let gamepadWasRestart = false;
  let juiceFrame = { dx: 0, dy: 0, frozen: false };
  let cameraFov = 47;
  let skyDome;
  let blobShadow;
  let objectiveKey = '';
  let objectiveShownAt = 0;
  const fxColor = new THREE.Color();
  const controlClaims = { stick: null, throttle: null, winch: null };
  const controlReadout = { stickX: 0, stickY: 0, throttle: .58, winch: .44, yaw: 0 };
  const hookPose = { x: 0, y: 0, z: 0 };
  const objectiveReadout = { label: '', text: '' };
  const controlRects = { stick: { x: 0, y: 0, w: 132, h: 132 }, throttle: { x: 0, y: 0, w: 68, h: 140 }, winch: { x: 0, y: 0, w: 88, h: 180 } };
  const ui = {
    title: document.getElementById('title-screen'), hud: document.getElementById('hud'), pause: document.getElementById('pause-screen'), result: document.getElementById('result-screen'),
    missionGrid: document.getElementById('mission-grid'), objectiveLine: document.getElementById('mission-objective'), objectiveLabel: document.getElementById('objective-label'), objective: document.getElementById('objective-text'),
    fuel: document.getElementById('fuel-value'), fuelMeter: document.getElementById('fuel-meter'), hull: document.getElementById('hull-value'), hullMeter: document.getElementById('hull-meter'), survivors: document.getElementById('survivor-value'), wind: document.getElementById('wind-value'),
    time: document.getElementById('time-value'), tension: document.getElementById('tension-read'), tensionMeter: document.getElementById('tension-meter'), stick: document.getElementById('stick-knob'), throttle: document.getElementById('throttle-knob'), winch: document.getElementById('winch-knob'),
    eventChip: document.getElementById('event-chip'), eventText: document.getElementById('event-text'), tutorialArrow: document.getElementById('tutorial-arrow'), damageVignette: document.getElementById('damage-vignette'), resultKicker: document.getElementById('result-kicker'), resultTitle: document.getElementById('result-title'), resultCopy: document.getElementById('result-copy'), resultMedal: document.getElementById('result-medal'), resultThreshold: document.getElementById('result-threshold'), resultSaved: document.getElementById('result-saved'), resultTime: document.getElementById('result-time'), resultDamage: document.getElementById('result-damage'), resultShortcut: document.getElementById('result-shortcut'), next: document.getElementById('next-button')
  };

  const sim = {
    time: 0, x: -34, y: 9, z: 25, vx: 0, vy: 0, vz: 0, yaw: 0, yawRate: 0, pitch: 0, roll: 0, rotorPhase: 0,
    collective: .58, cableLength: 7, cableTarget: 7, cableAngleX: 0, cableAngleZ: 0, cableVelX: 0, cableVelZ: 0, tension: 0,
    hooked: -1, onboard: 0, delivered: 0, triageMistakes: 0, triageDelay: 0, routeBonus: 0, hull: 100, fuel: 100, damageStage: 0, damageCooldown: 0, damageFlash: 0,
    landingPulse: 0, smokeTimer: 0, windCue: 0, tailCue: 0, flare: 0, shortcutFound: false, wind: 0, windX: 0, windZ: 0, tailWash: 0, airframeState: 'hover', tutorialStep: 0, pickups: [], survivors: []
  };

  function hide(id) { document.getElementById(id)?.classList.add('is-hidden'); }
  function show(id) { document.getElementById(id)?.classList.remove('is-hidden'); }
  function showOnly(id) {
    ['title-screen', 'hud', 'pause-screen', 'result-screen'].forEach((name) => { if (name === id) show(name); else hide(name); });
  }
  function normalizeMission(value) {
    const id = String(value || '').toLowerCase();
    return MISSION_BY_ID[id] ? id : (MISSION_ALIASES[id] || 'urban-extraction');
  }
  function isUnlocked(id) { return profile.unlocked.includes(id); }
  function missionIndex(id) { const index = MISSIONS.findIndex((mission) => mission.id === id); return index < 0 ? 0 : index; }
  function damageThreshold(mission) { return missionFamily(mission) === 'storm-rescue' ? 38 : 25; }

  function createMaterial(color, options = {}) {
    return new THREE.MeshStandardMaterial({ color, roughness: options.roughness == null ? .82 : options.roughness, metalness: options.metalness == null ? .05 : options.metalness, flatShading: true, emissive: options.emissive || 0x000000, emissiveIntensity: options.emissiveIntensity || 0, transparent: !!options.transparent, opacity: options.opacity == null ? 1 : options.opacity, depthWrite: options.depthWrite == null ? true : options.depthWrite });
  }
  function addBox(parent, x, y, z, w, h, d, color, options = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), createMaterial(color, options));
    mesh.position.set(x, y, z); mesh.rotation.set(options.rx || 0, options.ry || 0, options.rz || 0); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function addCylinder(parent, x, y, z, radius, height, color, options = {}) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * (options.bottomScale || 1), height, options.segments || 8), createMaterial(color, options));
    mesh.position.set(x, y, z); mesh.rotation.set(options.rx || 0, options.ry || 0, options.rz || 0); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function addCone(parent, x, y, z, radius, height, color, options = {}) {
    const mesh = new THREE.Mesh(new THREE.ConeGeometry(radius, height, options.segments || 8), createMaterial(color, options));
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function addBetween(parent, a, b, radius, color, options = {}) {
    const start = new THREE.Vector3(a.x, a.y, a.z); const end = new THREE.Vector3(b.x, b.y, b.z);
    const delta = end.clone().sub(start); const mesh = addCylinder(parent, 0, 0, 0, radius, delta.length(), color, { segments: options.segments || 6, metalness: options.metalness || 0 });
    mesh.position.copy(start.clone().add(end).multiplyScalar(.5)); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()); return mesh;
  }
  function disposeObject(root) {
    root.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      }
    });
  }
  function createSky() {
    const geometry = new THREE.SphereGeometry(150, 24, 12);
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { top: { value: new THREE.Color(0x193b4b) }, horizon: { value: new THREE.Color(0x507d78) }, ground: { value: new THREE.Color(0x274750) } },
      vertexShader: 'varying vec3 vWorld; void main(){ vWorld = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 horizon; uniform vec3 ground; varying vec3 vWorld; void main(){ float h = clamp(normalize(vWorld).y * .5 + .5, 0.0, 1.0); vec3 c = mix(ground, horizon, smoothstep(0.0, .44, h)); c = mix(c, top, smoothstep(.44, 1.0, h)); gl_FragColor = vec4(c, 1.0); }'
    });
    skyDome = new THREE.Mesh(geometry, material); skyDome.position.y = 32; skyDome.renderOrder = -5; scene.add(skyDome);
  }
  function addPad(parent, x, z, color) {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(5.8, 5.8, .18, 32), createMaterial(0x12343d, { metalness: .18 }));
    base.position.set(x, .12, z); parent.add(base);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(5.25, .13, 8, 32), createMaterial(color, { emissive: color, emissiveIntensity: .5 }));
    ring.rotation.x = Math.PI / 2; ring.position.set(x, .25, z); parent.add(ring);
    addBox(parent, x, .27, z, 1.1, .08, 5.3, 0xeef6df); addBox(parent, x, .28, z, 5.3, .08, 1.1, 0xeef6df);
  }
  function addWater(parent, x, z, w, d, color) {
    const water = addBox(parent, x, -.22, z, w, .14, d, color, { roughness: .35, metalness: .18 });
    water.material.transparent = true; water.material.opacity = .92;
    for (let i = 0; i < 4; i += 1) addBox(parent, x - w * .42 + i * w * .27, -.12, z + Math.sin(i) * d * .18, w * .15, .035, .08, 0x72d2cf, { transparent: true, opacity: .28 });
  }
  function addPowerLine(parent, hazard) {
    const horizontal = hazard.w > hazard.d;
    const a = { x: hazard.x - (horizontal ? hazard.w * .5 : 0), y: hazard.h, z: hazard.z - (horizontal ? 0 : hazard.d * .5) };
    const b = { x: hazard.x + (horizontal ? hazard.w * .5 : 0), y: hazard.h, z: hazard.z + (horizontal ? 0 : hazard.d * .5) };
    addCylinder(parent, a.x, hazard.h * .5, a.z, .12, hazard.h, 0x3c5d63, { segments: 6 });
    addCylinder(parent, b.x, hazard.h * .5, b.z, .12, hazard.h, 0x3c5d63, { segments: 6 });
    addBetween(parent, a, b, .035, 0xffd16e);
    addBetween(parent, { x: a.x, y: hazard.h - .7, z: a.z }, { x: b.x, y: hazard.h - .7, z: b.z }, .025, 0xff8c70);
  }
  function addSmokeColumn(parent, hazard, color) {
    const smoke = new THREE.Group(); smoke.position.set(hazard.x, 0, hazard.z); parent.add(smoke);
    for (let i = 0; i < 5; i += 1) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(.95 + i * .16, 8, 6), createMaterial(0x75858a, { transparent: true, opacity: .22, depthWrite: false }));
      puff.position.set(Math.sin(i * 2.2) * .7, 1.4 + i * 1.55, Math.cos(i * 1.7) * .7); puff.scale.set(1.15, 1.3, .95); smoke.add(puff);
    }
    addCone(parent, hazard.x, .7, hazard.z, 1.2, 2.0, color, { emissive: color, emissiveIntensity: .65 });
  }
  function addCrane(parent, hazard, color) {
    addCylinder(parent, hazard.x, hazard.h * .5, hazard.z, .3, hazard.h, 0x486872, { segments: 6 });
    addBetween(parent, { x: hazard.x, y: hazard.h, z: hazard.z }, { x: hazard.x + hazard.w, y: hazard.h, z: hazard.z + hazard.d }, .16, color);
    addBetween(parent, { x: hazard.x, y: hazard.h - 1, z: hazard.z }, { x: hazard.x + hazard.w, y: hazard.h - 1, z: hazard.z + hazard.d }, .08, 0x617b80);
  }
  function addSignature(parent, mission) {
    const color = mission.palette.accent;
    if (mission.signature === 'collapse') {
      addBox(parent, 18, 4.2, -16, 7.5, 1.2, 6, 0x6a4e48, { rz: -.2 });
      addBox(parent, 20, 7.0, -15.8, 6.2, 1.1, 5.5, 0x8a5e50, { rz: .34, ry: .16 });
      addBox(parent, 17, 1.4, -16, 9, .7, 7.4, 0x3f4f51, { rz: .04 });
      addCylinder(parent, 14, 4.5, -12.6, .18, 9, color, { rz: .52, segments: 6 });
    } else if (mission.signature === 'ridge') {
      for (let i = 0; i < 7; i += 1) addCone(parent, -3 + i * 1.25, 1.5 + (i % 3) * .5, 4 + Math.sin(i) * 4, 1.5 + (i % 2) * .45, 3 + (i % 3), 0x65483c, { segments: 7 });
      addBox(parent, 5, 3.7, 5, 8, .7, 1.5, color, { rz: -.12 });
    } else if (mission.signature === 'boat') {
      addWater(parent, 28, 23, 13, 7, mission.palette.water);
      addBox(parent, 28, 1.8, 23, 11, 1.1, 3.1, 0xb65f4b, { rz: -.22, rx: .07 });
      addBox(parent, 27, 3.1, 23.3, 4.4, .6, 2.1, 0xd7a56d, { rz: -.22 });
      addCylinder(parent, 29, 5.0, 23, .12, 4, 0x885044, { rz: .22, segments: 6 });
    } else {
      addBox(parent, 24, 1.8, 17, 10, .8, 6, 0x514c58, { rz: -.18 });
      addBox(parent, 27, 4.0, 17, 8, .65, 5, 0x705b5a, { rz: .28, ry: .22 });
      addCylinder(parent, 21, 4.3, 14.5, .2, 8.5, color, { rz: .3, segments: 6 });
      addBetween(parent, { x: 21, y: 7.8, z: 14.5 }, { x: 30, y: 5.8, z: 18 }, .16, color);
    }
  }
  function buildUrban(parent, mission) {
    addWater(parent, -3, 23, 90, 14, mission.palette.water);
    const blocks = [{ x: -25, z: -10, w: 12, h: 5.2, d: 10 }, { x: -8, z: -15, w: 12, h: 6.5, d: 10 }, { x: 11, z: -10, w: 13, h: 5.0, d: 10 }, { x: 27, z: -3, w: 12, h: 6.0, d: 11 }, { x: 30, z: 13, w: 12, h: 3.1, d: 10 }];
    blocks.forEach((block, index) => { addBox(parent, block.x, block.h * .5, block.z, block.w, block.h, block.d, index % 2 ? 0x315c62 : 0x3b5660); addBox(parent, block.x, block.h + .08, block.z, block.w + .35, .16, block.d + .35, mission.palette.accent); });
    for (let x = -45; x < 44; x += 9) addBox(parent, x, .03, 7, .18, .06, 62, 0x456a6e, { transparent: true, opacity: .34 });
  }
  function buildRidge(parent, mission) {
    addWater(parent, -8, 26, 95, 11, mission.palette.water);
    for (let i = 0; i < 13; i += 1) addCone(parent, -39 + i * 6.4, 2.2 + (i % 3) * .6, 5 + Math.sin(i * 1.4) * 11, 2 + (i % 2) * .8, 4.4 + (i % 3), 0x5c463c, { segments: 7 });
    for (let i = 0; i < 8; i += 1) { addCylinder(parent, -32 + i * 9, 2.7, 20 + Math.sin(i) * 3, .12, 5.4, 0x4a594e, { segments: 6 }); addCone(parent, -32 + i * 9, 6.5, 20 + Math.sin(i) * 3, 1.6, 4.4, 0x4c6a4c, { segments: 7 }); }
    for (let i = 0; i < 8; i += 1) addBox(parent, -35 + i * 10, .06, -30, 5.5, .08, .45, mission.palette.accent, { transparent: true, opacity: .4 });
  }
  function buildRig(parent, mission) {
    addWater(parent, 0, 0, 105, 68, mission.palette.water);
    addBox(parent, -1, .35, -3, 42, .7, 21, 0x4a6268, { metalness: .34 });
    for (let x = -18; x <= 18; x += 12) for (let z = -10; z <= 7; z += 17) addCylinder(parent, x, -2.5, z, .38, 6, 0x35535e, { segments: 7 });
    for (let x = -18; x <= 18; x += 12) addBetween(parent, { x, y: -2, z: -10 }, { x, y: -2, z: 7 }, .11, 0x7d9c96);
    addBox(parent, -30, 1, 22, 15, .8, 8, 0x425961, { ry: .04 });
    addBox(parent, -30, 2.3, 22, 4, 1.7, 6, 0x61777a, { ry: .04 });
    for (let x = -42; x < 43; x += 8) addBox(parent, x, .04, -29, 4.5, .06, .5, mission.palette.accent, { transparent: true, opacity: .42 });
  }
  function buildHarbor(parent, mission) {
    addWater(parent, 0, 2, 105, 68, mission.palette.water);
    addBox(parent, -5, .3, 19, 72, .6, 7, 0x263a47, { metalness: .22 });
    addBox(parent, 31, 1, -8, 12, 2, 28, 0x263946, { ry: -.02 });
    for (let x = -38; x < 42; x += 8) addCylinder(parent, x, .2, 23, .3, 1.4, mission.palette.accent, { emissive: mission.palette.accent, emissiveIntensity: .2, segments: 8 });
    for (let i = 0; i < 9; i += 1) { addBox(parent, -34 + i * 8.5, .12, -17 + (i % 2) * 4, 4.7, .24, 4.4, 0x374854); addBox(parent, -34 + i * 8.5, 1.5, -17 + (i % 2) * 4, 3.8, 2.6, 3.6, i % 3 === 0 ? 0x36516b : 0x3e4b56); }
    addCylinder(parent, -23, 4, 23, .18, 8, mission.palette.accent, { segments: 6 });
  }
  function missionFamily(mission) { return mission.zoneType || mission.id; }
  function addHazardSignal(parent, hazard, color, index) {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(Math.max(hazard.w, hazard.d) * .32 + 1.1, .07, 6, 20), createMaterial(color, { emissive: color, emissiveIntensity: .75, transparent: true, opacity: .62, depthWrite: false }));
    ring.rotation.x = Math.PI / 2; ring.position.set(hazard.x, .16, hazard.z); group.add(ring);
    const flare = new THREE.Mesh(new THREE.OctahedronGeometry(.22, 0), createMaterial(color, { emissive: color, emissiveIntensity: 1.1, transparent: true, opacity: .9 }));
    flare.position.set(hazard.x, Math.max(1.2, hazard.h * .22), hazard.z); group.add(flare); parent.add(group);
    dynamicHazardViews.push({ hazard, ring, flare, phase: index * 1.71, baseX: hazard.x, baseZ: hazard.z });
  }
  function buildZone(mission) {
    if (zoneGroup) { scene.remove(zoneGroup); disposeObject(zoneGroup); }
    zoneGroup = new THREE.Group(); scene.add(zoneGroup);
    scene.background = new THREE.Color(mission.palette.sky);
    scene.fog = new THREE.FogExp2(mission.palette.horizon, mission.fog);
    skyDome.material.uniforms.top.value.setHex(mission.palette.sky); skyDome.material.uniforms.horizon.value.setHex(mission.palette.horizon); skyDome.material.uniforms.ground.value.setHex(mission.palette.ground);
    addBox(zoneGroup, 0, -.65, 0, 110, 1.1, 78, mission.palette.ground, { roughness: .95 });
    for (let x = -45; x <= 45; x += 9) addBox(zoneGroup, x, -.03, 0, .08, .06, 67, 0x9cc0af, { transparent: true, opacity: .12 });
    for (let z = -30; z <= 30; z += 9) addBox(zoneGroup, 0, -.02, z, 97, .06, .08, 0x9cc0af, { transparent: true, opacity: .11 });
    if (missionFamily(mission) === 'urban-extraction') buildUrban(zoneGroup, mission);
    else if (missionFamily(mission) === 'storm-rescue') buildRidge(zoneGroup, mission);
    else if (missionFamily(mission) === 'mass-casualty') buildRig(zoneGroup, mission);
    else buildHarbor(zoneGroup, mission);
    addPad(zoneGroup, mission.hospital.x, mission.hospital.z, mission.palette.accent);
    const gate = new THREE.Mesh(new THREE.TorusGeometry(mission.shortcut.radius, .14, 8, 28), createMaterial(mission.palette.accent, { emissive: mission.palette.accent, emissiveIntensity: .65, transparent: true, opacity: .82 }));
    gate.rotation.x = Math.PI / 2; gate.position.set(mission.shortcut.x, 7.5, mission.shortcut.z); gate.name = 'shortcut-gate'; zoneGroup.add(gate);
    addCylinder(zoneGroup, mission.shortcut.x, .5, mission.shortcut.z, .16, 1.0, mission.palette.accent, { emissive: mission.palette.accent, emissiveIntensity: .4, segments: 8 });
    currentHazards = mission.hazards;
    dynamicHazardViews = [];
    mission.hazards.forEach((hazard, index) => {
      hazard.activity = 1; hazard.motionX = 0; hazard.motionZ = 0;
      if (hazard.kind === 'powerline') addPowerLine(zoneGroup, hazard);
      else if (hazard.kind === 'smoke') addSmokeColumn(zoneGroup, hazard, mission.palette.fire);
      else if (hazard.kind === 'crane') addCrane(zoneGroup, hazard, mission.palette.accent);
      else if (hazard.kind === 'fire') { addCone(zoneGroup, hazard.x, 1.2, hazard.z, 1.5, 2.4, mission.palette.fire, { emissive: mission.palette.fire, emissiveIntensity: .8 }); addCone(zoneGroup, hazard.x + 1, .9, hazard.z + .5, .9, 1.7, 0xffd369, { emissive: 0xff8a50, emissiveIntensity: .7 }); }
      else { addBox(zoneGroup, hazard.x, hazard.h * .5, hazard.z, hazard.w, hazard.h, hazard.d, 0x5d5555, { rz: -.1 }); }
      addHazardSignal(zoneGroup, hazard, hazard.kind === 'fire' || hazard.kind === 'smoke' ? mission.palette.fire : mission.palette.accent, index);
    });
    addSignature(zoneGroup, mission);
    if (mission.id === 'night-harbor') for (let i = 0; i < 12; i += 1) addCylinder(zoneGroup, -40 + i * 7.2, .45, -30 + (i % 3) * 17, .11, .9, 0x7bc7e6, { emissive: 0x3d9bc5, emissiveIntensity: 1, segments: 8 });
    const accent = new THREE.Color(mission.palette.accent);
    washPoints.material.color.copy(accent);
    cableHook.material.color.copy(accent);
    helicopterParts.rotor.material.color.copy(accent);
    configurePickups(mission);
    configureSurvivors(mission);
  }
  function createHelicopter() {
    const group = new THREE.Group(); group.rotation.order = 'YXZ';
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.7, 1.45, 2.2), createMaterial(0x4cbcae, { metalness: .2 })); group.add(body);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(1.35, 10, 7), createMaterial(0x54cbbd, { metalness: .08 })); nose.scale.set(1.18, .73, 1.15); nose.position.set(0, .05, 1.28); group.add(nose);
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.13, 10, 7), createMaterial(0x173847, { roughness: .26, metalness: .28 })); canopy.scale.set(1.07, .58, .78); canopy.position.set(0, .32, 1.48); group.add(canopy);
    const tail = addBox(group, 0, .12, -3.0, .62, .62, 4.2, 0x347c80, { metalness: .16 });
    const fin = addBox(group, 0, .82, -4.55, .18, 1.2, 1.1, 0x2a666e, { rz: -.16 });
    const boomAccent = addBox(group, 0, -.2, -3.05, .7, .13, 3.0, 0xf3cf79, { emissive: 0x6e4b1d, emissiveIntensity: .2 });
    const rotor = new THREE.Group(); rotor.position.y = 1.05; group.add(rotor);
    const bladeA = addBox(rotor, 0, .05, 0, 9.2, .1, .22, 0xbce8df, { metalness: .2 });
    const bladeB = addBox(rotor, 0, .06, 0, .22, .1, 9.2, 0xbce8df, { metalness: .2 });
    const mast = addCylinder(group, 0, 1.0, 0, .11, 1.3, 0xc7e9dd, { segments: 8 });
    const tailRotor = new THREE.Group(); tailRotor.position.set(0, .32, -4.95); group.add(tailRotor);
    addBox(tailRotor, 0, 0, 0, 2.3, .08, .16, 0xf0d59c); addBox(tailRotor, 0, 0, 0, .16, .08, 2.3, 0xf0d59c);
    const skidA = addBox(group, -1.2, -1.03, .05, .14, .14, 4.6, 0xa5d8ca, { metalness: .18 });
    const skidB = addBox(group, 1.2, -1.03, .05, .14, .14, 4.6, 0xa5d8ca, { metalness: .18 });
    for (const x of [-1.2, 1.2]) { addBetween(group, { x, y: -.2, z: 1.1 }, { x, y: -1.03, z: 1.1 }, .08, 0xa5d8ca); addBetween(group, { x, y: -.2, z: -1.0 }, { x, y: -1.03, z: -1.0 }, .08, 0xa5d8ca); }
    const smoke = new THREE.Group(); smoke.position.set(-1.2, .8, -.4); smoke.visible = false; group.add(smoke);
    for (let i = 0; i < 3; i += 1) { const p = new THREE.Mesh(new THREE.SphereGeometry(.28 + i * .1, 7, 5), createMaterial(0x667477, { transparent: true, opacity: .42, depthWrite: false })); p.position.set(Math.sin(i) * .32, i * .4, i * .24); smoke.add(p); }
    return { group, body, nose, canopy, tail, fin, boomAccent, rotor: { group: rotor, material: bladeA.material }, tailRotor, skidA, skidB, smoke, bodyMaterial: body.material, accentMaterial: boomAccent.material };
  }
  function createSurvivorMesh(index) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(.35, .65, 4, 8), createMaterial(0xffffff)); body.position.y = .55; group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(.3, 8, 6), createMaterial(0xffe1bd)); head.position.y = 1.45; group.add(head);
    const beacon = new THREE.Mesh(new THREE.TorusGeometry(.72, .045, 6, 20), createMaterial(0xffd978, { emissive: 0xffa540, emissiveIntensity: .5, transparent: true, opacity: .75 })); beacon.rotation.x = Math.PI / 2; beacon.position.y = .06; group.add(beacon);
    group.userData = { body, head, beacon, index }; survivorGroup.add(group); return group;
  }
  function createParticlePoints(count, color, size, opacity) {
    const positions = new Float32Array(count * 3); const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ color, size, transparent: true, opacity, depthWrite: false, sizeAttenuation: true });
    const points = new THREE.Points(geometry, material); points.frustumCulled = false; scene.add(points); return { points, positions, geometry, material };
  }
  function createFxPoints(count) {
    const positions = new Float32Array(count * 3); const colors = new Float32Array(count * 3); const sizes = new Float32Array(count); const alphas = new Float32Array(count);
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)); geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1)); geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
    const material = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, vertexColors: true, uniforms: { pixelRatio: { value: renderer.getPixelRatio() } }, vertexShader: 'attribute float aSize; attribute float aAlpha; varying vec3 vColor; varying float vAlpha; uniform float pixelRatio; void main(){ vColor = color; vAlpha = aAlpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * pixelRatio * (92.0 / max(1.0, -mv.z)); gl_Position = projectionMatrix * mv; }', fragmentShader: 'varying vec3 vColor; varying float vAlpha; void main(){ vec2 p = gl_PointCoord - .5; float edge = smoothstep(.5, .18, length(p)); gl_FragColor = vec4(vColor, edge * vAlpha); }' });
    const points = new THREE.Points(geometry, material); points.frustumCulled = false; scene.add(points); return { points, positions, colors, sizes, alphas, geometry, material };
  }
  function initScene() {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    GGKit.hiDpi.three(renderer); renderer.setSize(window.innerWidth, window.innerHeight, false); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xc5e9df, 0x14252c, 1.7));
    const sun = new THREE.DirectionalLight(0xffe7b6, 2.8); sun.position.set(-28, 48, 22); sun.castShadow = true; sun.shadow.mapSize.set(512, 512); sun.shadow.camera.left = -70; sun.shadow.camera.right = 70; sun.shadow.camera.top = 70; sun.shadow.camera.bottom = -70; scene.add(sun);
    camera = new THREE.PerspectiveCamera(47, window.innerWidth / Math.max(1, window.innerHeight), .1, 220); camera.position.set(-24, 26, 36);
    createSky();
    zoneGroup = new THREE.Group(); scene.add(zoneGroup); survivorGroup = new THREE.Group(); scene.add(survivorGroup); pickupGroup = new THREE.Group(); scene.add(pickupGroup);
    helicopterParts = createHelicopter(); helicopter = helicopterParts.group; scene.add(helicopter);
    blobShadow = new THREE.Mesh(new THREE.CircleGeometry(3.2, 24), new THREE.MeshBasicMaterial({ color: 0x06171b, transparent: true, opacity: .3, depthWrite: false })); blobShadow.rotation.x = -Math.PI / 2; blobShadow.renderOrder = 2; scene.add(blobShadow);
    washRing = new THREE.Mesh(new THREE.TorusGeometry(2.4, .08, 6, 32), new THREE.MeshBasicMaterial({ color: 0x8ee9d0, transparent: true, opacity: .2, depthWrite: false })); washRing.rotation.x = Math.PI / 2; washRing.renderOrder = 3; scene.add(washRing);
    washDust = new THREE.Mesh(new THREE.RingGeometry(1.2, 3.4, 24), new THREE.MeshBasicMaterial({ color: 0xd3c18f, transparent: true, opacity: .12, side: THREE.DoubleSide, depthWrite: false })); washDust.rotation.x = -Math.PI / 2; washDust.renderOrder = 3; scene.add(washDust);
    cablePositions = new Float32Array(MAX_CABLE_SEGMENTS * 3); const cableGeometry = new THREE.BufferGeometry(); cableGeometry.setAttribute('position', new THREE.BufferAttribute(cablePositions, 3)); cableLine = new THREE.Line(cableGeometry, new THREE.LineBasicMaterial({ color: 0x9be9d6, transparent: true, opacity: .9 })); cableLine.frustumCulled = false; scene.add(cableLine);
    cableHook = new THREE.Mesh(new THREE.SphereGeometry(.2, 8, 6), createMaterial(0x9be9d6, { emissive: 0x9be9d6, emissiveIntensity: .65 })); scene.add(cableHook);
    const wash = createParticlePoints(MAX_WASH, 0x71d5c8, .12, .66); washPoints = wash.points; washPositions = wash.positions;
    const fx = createFxPoints(MAX_FX); fxPoints = fx.points; fxPositions = fx.positions; fxColors = fx.colors; fxSizes = fx.sizes; fxAlphas = fx.alphas;
    for (let i = 0; i < MAX_SURVIVORS; i += 1) survivorMeshes.push(createSurvivorMesh(i));
    for (let i = 0; i < 4; i += 1) {
      const group = new THREE.Group();
      const fuel = new THREE.Group(); const fuelRing = new THREE.Mesh(new THREE.TorusGeometry(.72, .08, 6, 18), createMaterial(0x73e7c1, { emissive: 0x73e7c1, emissiveIntensity: .5 })); fuelRing.rotation.x = Math.PI / 2; fuel.add(fuelRing); const fuelCore = new THREE.Mesh(new THREE.CylinderGeometry(.24, .24, .52, 8), createMaterial(0x73e7c1, { emissive: 0x73e7c1, emissiveIntensity: .7 })); fuelCore.position.y = .15; fuel.add(fuelCore); group.add(fuel);
      const repair = new THREE.Group(); const repairBox = new THREE.Mesh(new THREE.BoxGeometry(1.05, .24, .78), createMaterial(0x8fd9ff, { emissive: 0x8fd9ff, emissiveIntensity: .7 })); repairBox.position.y = .22; repair.add(repairBox); const crossA = addBox(repair, 0, .39, 0, .2, .08, .72, 0xf3fbff, { emissive: 0xb7edff, emissiveIntensity: .7 }); const crossB = addBox(repair, 0, .4, 0, .72, .08, .2, 0xf3fbff, { emissive: 0xb7edff, emissiveIntensity: .7 }); repair.add(crossA, crossB); repair.visible = false; group.add(repair);
      const flare = new THREE.Group(); const flareCore = new THREE.Mesh(new THREE.ConeGeometry(.42, .9, 6), createMaterial(0xffc86e, { emissive: 0xff8b3d, emissiveIntensity: 1 })); flareCore.position.y = .4; flare.add(flareCore); const flareRing = new THREE.Mesh(new THREE.TorusGeometry(.64, .055, 6, 18), createMaterial(0xffe1a0, { emissive: 0xffb14f, emissiveIntensity: .8 })); flareRing.rotation.x = Math.PI / 2; flare.add(flareRing); flare.visible = false; group.add(flare);
      group.userData.variants = { fuel, repair, flare }; pickupGroup.add(group); pickupMeshes.push(group);
    }
    for (let i = 0; i < MAX_FX; i += 1) fxSlots.push({ active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, age: 0, kind: 0, color: 0xffffff, size: .3 });
    for (let i = 0; i < MAX_WASH; i += 1) washSlots.push({ angle: (i / MAX_WASH) * TAU, radius: .7 + ((i * 17) % 100) / 100 * 5.2, seed: (i * 13) % 97 / 97 });
    buildZone(currentMission);
    resize();
  }
  function applyLivery(mission) {
    const bodyColor = mission.id === 'storm-rescue' ? 0x9e6049 : mission.id === 'night-harbor' ? 0x315879 : mission.id === 'mass-casualty' ? 0x438e9c : 0x42b8ac;
    helicopterParts.bodyMaterial.color.setHex(bodyColor); helicopterParts.accentMaterial.color.setHex(mission.palette.accent); helicopterParts.canopy.material.color.setHex(mission.id === 'night-harbor' ? 0x0b1a37 : 0x173847); helicopterParts.tail.material.color.setHex(mission.palette.ground);
  }
  function configureSurvivors(mission) {
    sim.survivors.length = 0;
    for (let i = 0; i < MAX_SURVIVORS; i += 1) {
      const mesh = survivorMeshes[i]; const data = mission.survivors[i]; mesh.visible = !!data;
      if (!data) continue;
      sim.survivors.push({ id: i, name: data.name, x: data.x, y: data.y, z: data.z, priority: data.priority, color: data.color, status: 'waiting' });
      mesh.userData.body.material.color.setHex(data.color); mesh.userData.beacon.material.color.setHex(data.priority === 1 ? 0xff8c72 : mission.palette.accent); mesh.userData.beacon.material.emissive.setHex(data.priority === 1 ? 0xff5d4b : mission.palette.accent);
    }
  }
  function configurePickups(mission) {
    sim.pickups.length = 0;
    for (let i = 0; i < pickupMeshes.length; i += 1) {
      const data = mission.pickups[i]; const mesh = pickupMeshes[i]; mesh.visible = !!data;
      if (!data) continue;
      sim.pickups.push({ x: data.x, z: data.z, type: data.type, taken: false }); mesh.position.set(data.x, .6, data.z); mesh.userData.type = data.type;
      Object.entries(mesh.userData.variants).forEach(([type, variant]) => { variant.visible = type === data.type; });
    }
  }
  function clearFx() { for (let i = 0; i < fxSlots.length; i += 1) fxSlots[i].active = false; }
  function resetSim(mission) {
    sim.time = 0; sim.x = mission.hospital.x + 5; sim.y = 9; sim.z = mission.hospital.z; sim.vx = 0; sim.vy = 0; sim.vz = 0; sim.yaw = 0; sim.yawRate = 0; sim.pitch = 0; sim.roll = 0; sim.rotorPhase = 0; sim.collective = .58; sim.cableLength = 7; sim.cableTarget = 7; sim.cableAngleX = 0; sim.cableAngleZ = 0; sim.cableVelX = 0; sim.cableVelZ = 0; sim.tension = 0; sim.hooked = -1; sim.onboard = 0; sim.delivered = 0; sim.triageMistakes = 0; sim.triageDelay = 0; sim.routeBonus = 0; sim.hull = 100; sim.fuel = 100; sim.damageStage = 0; sim.damageCooldown = 0; sim.damageFlash = 0; sim.landingPulse = 0; sim.smokeTimer = 0; sim.windCue = 0; sim.tailCue = 0; sim.flare = 0; sim.shortcutFound = false; sim.wind = 0; sim.windX = 0; sim.windZ = 0; sim.tailWash = 0; sim.airframeState = 'hover'; sim.tutorialStep = mission.order === 0 ? 0 : 4;
    for (let i = 0; i < sim.survivors.length; i += 1) { const survivor = sim.survivors[i]; survivor.status = 'waiting'; survivor.x = mission.survivors[i].x; survivor.y = mission.survivors[i].y; survivor.z = mission.survivors[i].z; survivor.rigProgress = 0; survivor.seatIndex = -1; }
    for (let i = 0; i < sim.pickups.length; i += 1) sim.pickups[i].taken = false;
    for (let i = 0; i < pickupMeshes.length; i += 1) pickupMeshes[i].visible = i < mission.pickups.length;
    for (let i = 0; i < currentHazards.length; i += 1) { currentHazards[i].activity = 1; currentHazards[i].motionX = 0; currentHazards[i].motionZ = 0; }
    clearFx();
    syncState();
  }
  function syncState() {
    state.fuel = Math.round(sim.fuel * 10) / 10; state.hull = Math.round(sim.hull * 10) / 10; state.survivors = sim.delivered + sim.onboard; state.aboard = sim.onboard; state.delivered = sim.delivered; state.waiting = currentMission.total - state.survivors; state.time = sim.time; state.wind = Math.round(sim.wind); state.cableLength = Math.round(sim.cableLength * 100) / 100; state.cableTension = sim.tension; state.damageStage = sim.damageStage; state.shortcutFound = sim.shortcutFound; state.triageMistakes = sim.triageMistakes; state.tutorialStep = sim.tutorialStep; state.paused = state.mode === 'paused';
  }
  function saveProfile() { if (validateProfile(profile)) kit.save.set(profile); }
  function beginMission(id, replay = false) {
    const normalized = normalizeMission(id); const mission = MISSION_BY_ID[normalized] || MISSIONS[0];
    if (!replay && !isUnlocked(mission.id)) return;
    currentMission = mission; selectedMissionId = mission.id; state.mission = mission.id; state.survivorsTotal = mission.total; state.timeLimit = mission.timeLimit; state.reason = ''; state.medal = 0; resultState = null;
    clearEvents(); objectiveKey = ''; objectiveShownAt = 0; applyLivery(mission); buildZone(mission); resetSim(mission); state.mode = 'playing'; state.paused = false; kit.input.clearAll(); controlClaims.stick = null; controlClaims.throttle = null; controlClaims.winch = null; showOnly('hud'); measureControls();
    kit.audio.music(mission.order >= 3 ? 'night' : 'rotor', 240); kit.audio.sfx('radio', { volume: .72 });
  }
  function showTitle() {
    state.mode = 'title'; state.paused = false; clearEvents(); kit.audio.stopMusic(220); kit.input.clearAll(); controlClaims.stick = null; controlClaims.throttle = null; controlClaims.winch = null; hide('hud'); hide('pause-screen'); hide('result-screen'); show('title-screen'); renderMissionGrid();
  }
  function renderMissionGrid() {
    ui.missionGrid.replaceChildren();
    for (const mission of MISSIONS) {
      const unlocked = isUnlocked(mission.id); const card = document.createElement('button'); card.type = 'button'; card.className = `mission-card${unlocked ? '' : ' is-locked'}${selectedMissionId === mission.id ? ' is-selected' : ''}`; card.disabled = !unlocked; card.dataset.mission = mission.id;
      const medal = profile.medals[mission.id] || 0; const best = profile.best[mission.id]; const dots = [0, 1, 2].map((index) => `<i class="${index < medal ? 'is-on' : ''}"></i>`).join('');
      const bestText = best ? `BEST ${formatTime(best.time)} / ${Math.round(best.damage)}%` : 'NO FLIGHT RECORDED';
      card.innerHTML = `<span class="mission-number">${String(mission.order + 1).padStart(2, '0')} / ${mission.short}</span><strong>${mission.title}</strong><small>${mission.zone}<br>${mission.description}</small><span class="mission-threshold">MEDAL: ${mission.targetTime}s / ${damageThreshold(mission)}% DAMAGE</span><span class="mission-status">${unlocked ? (medal ? 'MEDAL ' + medal + '/3' : 'READY') : 'LOCKED'}</span><span class="mission-best">${bestText}</span><span class="medal-row">${dots}</span>`;
      ui.missionGrid.appendChild(card);
    }
  }
  function clearEvents() {
    eventQueue.length = 0; eventUntil = 0;
    if (ui.eventChip) ui.eventChip.classList.remove('is-visible');
  }
  function pumpEvent() {
    if (!ui.eventChip || state.mode !== 'playing' || ui.eventChip.classList.contains('is-visible')) return;
    const next = eventQueue.shift();
    if (!next) return;
    ui.eventChip.classList.toggle('no-motion', !kit.juice.enabled); void ui.eventChip.offsetWidth;
    setTextIfChanged(ui.eventText, next.text); ui.eventChip.setAttribute('aria-label', next.text); ui.eventChip.classList.add('is-visible');
    eventUntil = sim.time + Math.min(1, Math.max(.35, next.duration)); eventSerial += 1; ui.eventChip.dataset.serial = String(eventSerial);
  }
  function showEvent(kicker, title, copy, duration = .9) {
    if (state.mode !== 'playing') return;
    const text = [kicker, title, copy].filter(Boolean).join(' · ');
    eventQueue.push({ text, duration });
    if (eventQueue.length > 6) eventQueue.shift();
    pumpEvent();
  }
  function updateEventChip() {
    if (!ui.eventChip) return;
    if (state.mode !== 'playing') { clearEvents(); return; }
    if (ui.eventChip.classList.contains('is-visible') && sim.time >= eventUntil) ui.eventChip.classList.remove('is-visible');
    pumpEvent();
  }
  function currentObjective() {
    if (currentMission.order === 0 && sim.tutorialStep === 0) { objectiveReadout.label = 'FOLLOW SOS'; objectiveReadout.text = 'Fly to the gold beacon · lower cable'; return objectiveReadout; }
    if (currentMission.order === 0 && sim.tutorialStep === 1) { objectiveReadout.label = 'HOOK'; objectiveReadout.text = 'Hold the hook over the survivor'; return objectiveReadout; }
    if (currentMission.order === 0 && sim.tutorialStep === 2) { objectiveReadout.label = 'REEL'; objectiveReadout.text = 'Lift gently · keep tension low'; return objectiveReadout; }
    if (currentMission.order === 0 && sim.tutorialStep === 3) { objectiveReadout.label = 'LAND'; objectiveReadout.text = 'Settle on the hospital ring'; return objectiveReadout; }
    if (sim.hooked >= 0) { objectiveReadout.label = 'CABLE LOAD'; objectiveReadout.text = 'Reel gently · avoid orange tension'; return objectiveReadout; }
    if (sim.onboard > 0) { objectiveReadout.label = 'RETURN'; objectiveReadout.text = `${sim.onboard} aboard · land on hospital ring`; return objectiveReadout; }
    if (sim.delivered >= currentMission.total) { objectiveReadout.label = 'FINAL'; objectiveReadout.text = 'Settle onto the hospital pad'; return objectiveReadout; }
    const critical = sim.survivors.find((survivor) => survivor.status === 'waiting' && survivor.priority === 1);
    if (critical) { objectiveReadout.label = 'TRIAGE'; objectiveReadout.text = `Secure ${critical.name} first if clear`; return objectiveReadout; }
    objectiveReadout.label = 'RESCUE'; objectiveReadout.text = 'Find SOS · hook · reel aboard'; return objectiveReadout;
  }
  function updateObjective() {
    const objective = currentObjective(); const nextKey = `${objective.label}|${objective.text}`;
    if (nextKey !== objectiveKey) { objectiveKey = nextKey; objectiveShownAt = sim.time; }
    setTextIfChanged(ui.objectiveLabel, objective.label); setTextIfChanged(ui.objective, objective.text); ui.objectiveLine.classList.toggle('is-faded', sim.time - objectiveShownAt > 3);
  }
  function updateTutorialUI() {
    if (currentMission.order !== 0 || sim.tutorialStep >= 4) { ui.tutorialArrow.classList.remove('is-visible'); return; }
    let target = null;
    if (sim.tutorialStep < 2) target = sim.survivors[0];
    else if (sim.tutorialStep === 2) target = sim.survivors[0];
    else target = currentMission.hospital;
    if (!target) return;
    const dx = target.x - sim.x; const dz = target.z - sim.z; const heading = Math.atan2(dx, dz) - sim.yaw; ui.tutorialArrow.style.setProperty('--arrow-angle', `${heading}rad`); ui.tutorialArrow.classList.add('is-visible');
  }
  function showResult(won, reason) {
    clearFx(); state.mode = won ? 'won' : 'crashed'; state.reason = reason; state.paused = false; syncState();
    const time = sim.time; const damage = 100 - sim.hull; let medal = 0;
    if (won && sim.delivered === currentMission.total) medal += 1;
    if (won && time <= currentMission.targetTime) medal += 1;
    if (won && damage <= damageThreshold(currentMission)) medal += 1;
    state.medal = medal; resultState = { won, time, damage, medal, reason };
    if (won) {
      const prior = profile.medals[currentMission.id] || 0; if (medal > prior) profile.medals[currentMission.id] = medal;
      const previousBest = profile.best[currentMission.id]; const candidate = { time, damage, saved: sim.delivered, medal };
      if (!previousBest || medal > previousBest.medal || (medal === previousBest.medal && (time < previousBest.time || (time === previousBest.time && damage < previousBest.damage)))) profile.best[currentMission.id] = candidate;
      const next = MISSIONS[missionIndex(currentMission.id) + 1]; if (next && !profile.unlocked.includes(next.id)) profile.unlocked.push(next.id);
      profile.runs += 1; saveProfile(); kit.audio.stopMusic(260); kit.audio.sfx('medal', { volume: .8 });
    } else { profile.runs += 1; saveProfile(); kit.audio.stopMusic(260); kit.audio.sfx('impact', { volume: .9 }); }
    setTextIfChanged(ui.resultKicker, won ? `${currentMission.title.toUpperCase()} / FLIGHT REPORT` : 'AIRFRAME REPORT / SORTIE LOST'); setTextIfChanged(ui.resultTitle, won ? 'MISSION CLEAR' : 'AIRFRAME DOWN'); setTextIfChanged(ui.resultCopy, won ? (sim.triageMistakes ? `${sim.triageMistakes} triage reorder${sim.triageMistakes === 1 ? '' : 's'} recorded. The pad is full.` : 'All survivors are home. The route is clear for the next call.') : reason); setTextIfChanged(ui.resultThreshold, `MEDAL CHECK / ALL SAVED / ${currentMission.targetTime}s OR FASTER / ${damageThreshold(currentMission)}% DAMAGE OR LESS`); setTextIfChanged(ui.resultMedal, won ? `${medal >= 1 ? '●' : '○'} ${medal >= 2 ? '●' : '○'} ${medal >= 3 ? '●' : '○'}` : '○ ○ ○'); setTextIfChanged(ui.resultSaved, `${sim.delivered} / ${currentMission.total}`); setTextIfChanged(ui.resultTime, formatTime(time)); setTextIfChanged(ui.resultDamage, `${Math.round(damage)}%`); setTextIfChanged(ui.resultShortcut, sim.shortcutFound ? `YES / -${sim.routeBonus}s` : 'NO');
    const next = MISSIONS[missionIndex(currentMission.id) + 1]; clearEvents(); ui.next.disabled = !won || !next || !isUnlocked(next.id); setTextIfChanged(ui.next, next && isUnlocked(next.id) ? `Next: ${next.short}` : 'Next sortie'); showOnly('result-screen');
  }
  function fail(reason) { if (state.mode !== 'playing') return; showResult(false, reason); }
  function completeMission() { if (state.mode !== 'playing') return; showResult(true, 'MISSION CLEAR'); }

  function hookPoint() {
    hookPose.x = sim.x + Math.sin(sim.cableAngleX) * sim.cableLength; hookPose.y = sim.y - 1.65 - Math.cos(sim.cableAngleX) * sim.cableLength; hookPose.z = sim.z + Math.sin(sim.cableAngleZ) * sim.cableLength; return hookPose;
  }
  function ensurePointer(event, zone) {
    const id = event.pointerId;
    if (id == null) return null;
    let pointer = kit.input.pointers.get(id);
    if (!pointer) { pointer = { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, downAt: performance.now(), zone: null }; kit.input.pointers.set(id, pointer); }
    pointer.zone = zone; return pointer;
  }
  function controlPointerDown(event, zone) {
    if (state.mode !== 'playing' || kit.paused) return;
    if (controlClaims[zone] != null && kit.input.pointers.has(controlClaims[zone])) return;
    const pointer = ensurePointer(event, zone); if (!pointer) return;
    controlClaims[zone] = event.pointerId; event.currentTarget.setPointerCapture?.(event.pointerId); event.preventDefault();
  }
  function releaseControlPointer(event, zone) { if (controlClaims[zone] === event.pointerId) controlClaims[zone] = null; }
  function measureControls() {
    const ids = { stick: 'stick-control', throttle: 'throttle-control', winch: 'winch-control' };
    for (const zone of Object.keys(ids)) { const rect = document.getElementById(ids[zone]).getBoundingClientRect(); if (rect.width > 0 && rect.height > 0) Object.assign(controlRects[zone], { x: rect.left, y: rect.top, w: rect.width, h: rect.height }); }
  }
  function activeGamepad() {
    if (!navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    for (let i = 0; i < pads.length; i += 1) if (pads[i] && pads[i].connected) return pads[i];
    return null;
  }
  function axisValue(value, deadzone = .14) { return Math.abs(value) < deadzone ? 0 : clamp(value, -1, 1); }
  function pollGamepadActions() {
    const pad = activeGamepad();
    if (!pad) { gamepadWasPaused = false; gamepadWasRestart = false; return; }
    const pausePressed = !!pad.buttons[9]?.pressed;
    const restartPressed = !!pad.buttons[0]?.pressed;
    if (pausePressed && !gamepadWasPaused) handleAction(kit.paused ? 'resume' : 'pause');
    if (restartPressed && !gamepadWasRestart && state.mode !== 'title' && state.mode !== 'playing') handleAction('restart');
    gamepadWasPaused = pausePressed; gamepadWasRestart = restartPressed;
  }
  function readControls() {
    let stickX = 0; let stickY = 0; let throttle = sim.collective; let winch = clamp((sim.cableTarget - 2.4) / 10.5, 0, 1);
    const pad = activeGamepad();
    const stickPointer = controlClaims.stick == null ? null : kit.input.pointers.get(controlClaims.stick);
    if (stickPointer) { const rect = controlRects.stick; stickX = clamp((stickPointer.x - (rect.x + rect.w * .5)) / (rect.w * .45), -1, 1); stickY = clamp(-(stickPointer.y - (rect.y + rect.h * .5)) / (rect.h * .45), -1, 1); }
    else if (pad) { stickX = axisValue(pad.axes[0] || 0); stickY = -axisValue(pad.axes[1] || 0); }
    else { stickX = (kit.input.keyDown('KeyD') ? 1 : 0) - (kit.input.keyDown('KeyA') ? 1 : 0); stickY = (kit.input.keyDown('KeyW') ? 1 : 0) - (kit.input.keyDown('KeyS') ? 1 : 0); }
    const throttlePointer = controlClaims.throttle == null ? null : kit.input.pointers.get(controlClaims.throttle);
    if (throttlePointer) { const rect = controlRects.throttle; throttle = clamp(1 - (throttlePointer.y - rect.y) / rect.h, 0, 1); }
    else if (pad) { throttle = clamp((pad.buttons[7]?.value || 0) - (pad.buttons[6]?.value || 0) + .58, .18, .95); if (pad.axes[3] != null) throttle = clamp(.58 - axisValue(pad.axes[3]) * .32, .18, .95); }
    else { if (kit.input.keyDown('KeyR')) throttle += .7 * STEP; if (kit.input.keyDown('KeyF')) throttle -= .7 * STEP; }
    const winchPointer = controlClaims.winch == null ? null : kit.input.pointers.get(controlClaims.winch);
    if (winchPointer) { const rect = controlRects.winch; winch = clamp((winchPointer.y - rect.y) / rect.h, 0, 1); }
    else if (pad) { winch = clamp((pad.axes[3] == null ? .44 : (axisValue(pad.axes[3]) + 1) * .5), 0, 1); if (pad.buttons[5]?.pressed) winch = 1; if (pad.buttons[4]?.pressed) winch = 0; }
    else { if (kit.input.keyDown('ArrowDown')) winch += .7 * STEP; if (kit.input.keyDown('ArrowUp')) winch -= .7 * STEP; }
    if (Math.abs(stickX) + Math.abs(stickY) > 1) { const scale = 1 / Math.hypot(stickX, stickY); stickX *= scale; stickY *= scale; }
    controlReadout.stickX = stickX; controlReadout.stickY = stickY; controlReadout.throttle = clamp(throttle, .18, .95); controlReadout.winch = clamp(winch, 0, 1); controlReadout.yaw = pad ? (!!pad.buttons[2]?.pressed ? 1 : 0) - (!!pad.buttons[1]?.pressed ? 1 : 0) : (kit.input.keyDown('KeyE') ? 1 : 0) - (kit.input.keyDown('KeyQ') ? 1 : 0); return controlReadout;
  }
  function spawnFx(x, y, z, kind, color, count, speed) {
    let spawned = 0;
    let oldest = null;
    for (let i = 0; i < fxSlots.length && spawned < count; i += 1) {
      const slot = fxSlots[i]; if (!slot.active) { oldest = slot; break; } if (!oldest || slot.life < oldest.life) oldest = slot;
    }
    while (spawned < count && oldest) {
      const index = fxSlots.indexOf(oldest); const angle = ((index * 2.41 + sim.time * 3.1 + spawned * .7) % TAU); const spread = .4 + ((index * 19) % 10) / 10;
      oldest.active = true; oldest.x = x; oldest.y = y; oldest.z = z; oldest.vx = Math.cos(angle) * speed * spread; oldest.vy = (kind === 2 ? .8 : .35) * speed * (.5 + ((index * 7) % 10) / 10); oldest.vz = Math.sin(angle) * speed * spread; oldest.life = .3 + ((index * 11) % 10) / 16; oldest.max = oldest.life; oldest.age = 0; oldest.kind = kind; oldest.color = color; oldest.size = kind === 2 ? .52 : kind === 3 ? .34 : .28; oldest = null; spawned += 1;
      for (let i = 0; i < fxSlots.length; i += 1) { const slot = fxSlots[i]; if (!slot.active || !oldest || slot.life < oldest.life) oldest = slot; }
    }
  }
  function damageHull(amount, reason) {
    if (sim.damageCooldown > 0 || state.mode !== 'playing') return;
    sim.hull = clamp(sim.hull - amount, 0, 100); sim.damageCooldown = .72; sim.damageFlash = .28; sim.damageStage = sim.hull > 72 ? 0 : sim.hull > 45 ? 1 : sim.hull > 20 ? 2 : 3; spawnFx(sim.x, sim.y - 1, sim.z, 2, currentMission.palette.fire, 14, 3.2); kit.juice.shake(4 + amount * .12, 180); kit.juice.hitStop(48); kit.audio.sfx('impact', { volume: .72, rate: .88 + sim.damageStage * .08 }); showEvent('DAMAGE', `${reason} · HULL ${Math.ceil(sim.hull)}%`, '', .9); if (sim.hull <= 0) fail('HULL CRITICAL');
  }
  function updateWind(dt) {
    const mission = currentMission; const gust = Math.sin(sim.time * .61 + 1.4) * .28 + Math.sin(sim.time * 1.37) * .14 + Math.sin(sim.time * .19 + 2.2) * .3; const override = state.windOverride == null ? null : state.windOverride;
    const strength = override == null ? mission.windBase * (1 + gust) : override; const angle = mission.windAngle + Math.sin(sim.time * .17) * .12; sim.flare = Math.max(0, sim.flare - dt); sim.windCue = Math.max(0, sim.windCue - dt); const damp = sim.flare > 0 ? .36 : 1; sim.wind = Math.max(0, strength * damp); sim.windX = Math.cos(angle) * sim.wind; sim.windZ = Math.sin(angle) * sim.wind; if (sim.wind > mission.windBase * 1.24 && sim.windCue <= 0) { sim.windCue = 1.15; kit.audio.sfx('wind', { volume: .34, rate: .86 + sim.wind / 180 }); }
  }
  function updateHazards() {
    for (let i = 0; i < currentHazards.length; i += 1) {
      const hazard = currentHazards[i]; const cycle = sim.time * (hazard.kind === 'smoke' ? .78 : .46) + i * 1.9;
      hazard.activity = .72 + Math.sin(cycle) * .2 + Math.sin(cycle * .41) * .08;
      hazard.motionX = hazard.kind === 'smoke' || hazard.kind === 'fire' ? Math.sin(cycle * .8) * .8 : Math.sin(cycle * .53) * (hazard.kind === 'boat' ? 1.2 : .35);
      hazard.motionZ = hazard.kind === 'smoke' ? Math.cos(cycle * .63) * .7 : hazard.kind === 'collapse' ? Math.max(0, Math.sin((sim.time - 10) * .32)) * .8 : 0;
    }
  }
  function checkHazards() {
    for (let i = 0; i < currentHazards.length; i += 1) {
      const hazard = currentHazards[i]; const hazardX = hazard.x + (hazard.motionX || 0); const hazardZ = hazard.z + (hazard.motionZ || 0); const inside = Math.abs(sim.x - hazardX) < hazard.w * .5 + 1.5 && Math.abs(sim.z - hazardZ) < hazard.d * .5 + 1.5;
      if (!inside) continue;
      const liveDamage = hazard.damage * clamp(hazard.activity || 1, .55, 1);
      if (hazard.kind === 'powerline' || hazard.kind === 'crane' || hazard.kind === 'collapse' || hazard.kind === 'ridge') { if (sim.y < hazard.h + 4.3) damageHull(liveDamage, hazard.kind === 'powerline' ? 'POWER LINE STRIKE' : 'ROTOR STRIKE'); }
      else if (hazard.kind === 'smoke' && sim.y < hazard.h + 1) { if (sim.damageCooldown <= 0) damageHull(liveDamage, 'SMOKE COLUMN'); }
      else if (hazard.kind === 'fire' && sim.y < hazard.h + 4) damageHull(liveDamage, 'FIRE FRONT');
    }
  }
  function collectPickups() {
    for (let i = 0; i < sim.pickups.length; i += 1) {
      const pickup = sim.pickups[i]; if (pickup.taken || Math.hypot(sim.x - pickup.x, sim.z - pickup.z) > 2.8) continue; pickup.taken = true; pickupMeshes[i].visible = false;
      if (pickup.type === 'fuel') { sim.fuel = clamp(sim.fuel + 34, 0, 100); showEvent('SUPPLY', 'FUEL +34', '', .9); }
      else if (pickup.type === 'repair') { sim.hull = clamp(sim.hull + 26, 0, 100); sim.damageStage = sim.hull > 72 ? 0 : sim.hull > 45 ? 1 : 2; showEvent('SUPPLY', 'HULL +26', '', .9); }
      else { sim.flare = 13; showEvent('SUPPLY', 'FLARE ACTIVE · 13s', '', .9); }
      kit.audio.sfx('pickup', { volume: .72 }); spawnFx(sim.x, sim.y, sim.z, 1, pickup.type === 'flare' ? 0xffc86e : 0x73e7c1, 10, 1.9);
    }
  }
  function updateWinch(dt, controls) {
    sim.cableTarget = 2.4 + controls.winch * 10.5; sim.cableLength = approach(sim.cableLength, sim.cableTarget, 8.5, dt);
    const windBendX = sim.windX * .006; const windBendZ = sim.windZ * .006; sim.cableVelX += (windBendX + sim.vx * .014 - sim.cableAngleX * 2.8 - sim.cableVelX * 1.7) * dt; sim.cableVelZ += (windBendZ + sim.vz * .014 - sim.cableAngleZ * 2.8 - sim.cableVelZ * 1.7) * dt; sim.cableAngleX = clamp(sim.cableAngleX + sim.cableVelX * dt, -.82, .82); sim.cableAngleZ = clamp(sim.cableAngleZ + sim.cableVelZ * dt, -.82, .82);
    const hook = hookPoint(); const speed = Math.hypot(sim.vx, sim.vz); sim.tension = sim.hooked >= 0 ? clamp(.18 + speed * .024 + Math.abs(sim.cableVelX + sim.cableVelZ) * .12 + Math.abs(sim.vy) * .035 + (sim.cableLength < sim.cableTarget + .02 ? .05 : 0), 0, 1) : clamp(Math.abs(sim.cableVelX + sim.cableVelZ) * .08, 0, .42);
    if (sim.hooked < 0 && sim.cableLength > 3.4) {
      for (let i = 0; i < sim.survivors.length; i += 1) { const survivor = sim.survivors[i]; if (survivor.status !== 'waiting') continue; if (Math.hypot(hook.x - survivor.x, hook.y - survivor.y, hook.z - survivor.z) < 1.55) { sim.hooked = i; survivor.status = 'hooked'; kit.audio.sfx('cry', { volume: .54 }); showEvent('CONTACT', `${survivor.name} HOOKED`, '', .9); break; } }
    }
    if (sim.hooked >= 0) {
      const survivor = sim.survivors[sim.hooked]; if (!survivor) { sim.hooked = -1; return; }
      survivor.rigProgress = clamp((survivor.rigProgress || 0) + dt * 1.8, 0, 1); survivor.x = approach(survivor.x, hook.x, 10, dt); survivor.y = approach(survivor.y, hook.y - .55, 10, dt); survivor.z = approach(survivor.z, hook.z, 10, dt);
      if (sim.cableLength < 3.15) {
        let minimumPriority = 9; for (let i = 0; i < sim.survivors.length; i += 1) if (sim.survivors[i].status === 'waiting') minimumPriority = Math.min(minimumPriority, sim.survivors[i].priority);
        if (survivor.priority > minimumPriority) { sim.triageMistakes += 1; sim.triageDelay += 5; sim.time += 5; sim.fuel = clamp(sim.fuel - 3, 0, 100); showEvent('TRIAGE', `${survivor.name} · +5s`, '', .9); }
        survivor.status = 'aboard'; survivor.seatIndex = sim.onboard; sim.onboard += 1; sim.hooked = -1; kit.audio.sfx('secure', { volume: .75 }); spawnFx(sim.x, sim.y - 1, sim.z, 1, survivor.color, 12, 1.8); showEvent('SECURED', `${survivor.name} · ${sim.onboard} ABOARD`, '', .9);
      }
    }
  }
  function deliverAtPad() {
    const mission = currentMission; const atPad = Math.hypot(sim.x - mission.hospital.x, sim.z - mission.hospital.z) < 5.5; const settled = sim.y <= 3.35 && Math.abs(sim.vy) < 2.1 && Math.hypot(sim.vx, sim.vz) < 3.0;
    if (!atPad || !settled || sim.onboard <= 0) return;
    for (let i = 0; i < sim.survivors.length; i += 1) if (sim.survivors[i].status === 'aboard') sim.survivors[i].status = 'delivered';
    sim.delivered += sim.onboard; sim.onboard = 0; showEvent('PAD', `${sim.delivered} HOME`, '', .9); kit.audio.sfx('secure', { volume: .7, rate: 1.15 }); if (sim.delivered >= mission.total) completeMission();
  }
  function checkShortcut() { if (!sim.shortcutFound && Math.hypot(sim.x - currentMission.shortcut.x, sim.z - currentMission.shortcut.z) < currentMission.shortcut.radius && sim.y > 4 && sim.y < 12) { sim.shortcutFound = true; sim.routeBonus = 8; showEvent('SHORTCUT', `${currentMission.shortcut.name} · -8s`, '', .9); kit.audio.sfx('radio', { volume: .7, rate: 1.2 }); } }
  function updateTutorial() {
    if (currentMission.order !== 0 || sim.tutorialStep >= 4) return;
    const first = sim.survivors[0];
    if (sim.tutorialStep === 0 && first && first.status === 'waiting' && Math.hypot(sim.x - first.x, sim.z - first.z) < 9) sim.tutorialStep = 1;
    else if (sim.tutorialStep === 1 && sim.hooked >= 0) sim.tutorialStep = 2;
    else if (sim.tutorialStep === 2 && sim.onboard > 0) sim.tutorialStep = 3;
    else if (sim.tutorialStep === 3 && sim.delivered > 0) sim.tutorialStep = 4;
  }
  function simulate(dt) {
    if (state.mode !== 'playing') return;
    sim.time += dt; const controls = readControls(); updateWind(dt); updateHazards(); sim.collective = approach(sim.collective, controls.throttle, 7, dt); const mass = 1 + sim.onboard * .09 + (sim.hooked >= 0 ? .12 : 0); const speed = Math.hypot(sim.vx, sim.vz);
    const lift = sim.collective * 27 / mass - 12.2; sim.vy += lift * dt; sim.vy *= Math.pow(.19, dt); sim.vx += (controls.stickX * 17 / mass + sim.windX * .12) * dt; sim.vz += (controls.stickY * 17 / mass + sim.windZ * .12) * dt; sim.vx *= Math.pow(.32, dt); sim.vz *= Math.pow(.32, dt); sim.x = clamp(sim.x + sim.vx * dt, -WORLD_X, WORLD_X); sim.z = clamp(sim.z + sim.vz * dt, -WORLD_Z, WORLD_Z); sim.y += sim.vy * dt;
    if (sim.y < 2.45) { if (sim.vy < -7.2) { sim.landingPulse = .32; damageHull(Math.min(30, Math.abs(sim.vy) * 1.6), 'HARD LANDING'); kit.audio.sfx('landing', { volume: .6, rate: .9 }); } sim.y = 2.45; if (sim.vy < 0) sim.vy = 0; }
    sim.tailWash = sim.collective * (.34 + sim.wind * .004) * (sim.windX * .006 - sim.windZ * .004); sim.tailCue = Math.max(0, sim.tailCue - dt); if (Math.abs(sim.tailWash) > .018 && sim.tailCue <= 0) { sim.tailCue = 1.35; kit.audio.sfx('tailwash', { volume: .16, rate: .92 + Math.abs(sim.tailWash) * 3 }); } sim.yawRate += (controls.yaw * 1.8 + sim.tailWash + (sim.windX * .013 - sim.windZ * .008) + controls.stickX * .18) * dt; sim.yawRate *= Math.pow(.24, dt); sim.yaw += sim.yawRate * dt; sim.roll = approach(sim.roll, clamp(-sim.vx * .045 - controls.stickX * .12, -.48, .48), 6.5, dt); sim.pitch = approach(sim.pitch, clamp(sim.vz * .045 + controls.stickY * .1, -.42, .42), 6.5, dt); sim.rotorPhase += (32 + sim.collective * 48) * dt;
    const burn = (.075 + sim.collective * .28 + speed * .009 + sim.onboard * .035 + sim.wind * .0018) * dt; sim.fuel = clamp(sim.fuel - burn, 0, 100); sim.damageCooldown = Math.max(0, sim.damageCooldown - dt); sim.damageFlash = Math.max(0, sim.damageFlash - dt); sim.landingPulse = Math.max(0, sim.landingPulse - dt * 2.4); sim.smokeTimer -= dt;
    sim.airframeState = sim.hull <= 0 ? 'crash' : sim.damageStage >= 2 ? 'damage' : sim.y <= 2.55 ? 'land' : speed < 1.4 ? 'hover' : 'fly';
    if (sim.damageStage > 0 && sim.smokeTimer <= 0) { sim.smokeTimer = .16 + sim.damageStage * .06; spawnFx(sim.x - 1.1, sim.y + .65, sim.z - .5, 3, 0x75858a, sim.damageStage + 1, .8 + sim.damageStage * .18); }
    updateWinch(dt, controls); checkHazards(); collectPickups(); checkShortcut(); deliverAtPad(); updateTutorial(); updateFx(dt); syncState();
    if (sim.time >= currentMission.timeLimit) fail('RESCUE WINDOW CLOSED'); else if (sim.fuel <= 0) fail('FUEL EMPTY'); else if (sim.hull <= 0) fail('HULL CRITICAL');
  }
  function updateFx(dt) { for (let i = 0; i < fxSlots.length; i += 1) { const slot = fxSlots[i]; if (!slot.active) continue; slot.age += dt; slot.life -= dt; if (slot.life <= 0) { slot.active = false; continue; } slot.x += slot.vx * dt; slot.y += slot.vy * dt; slot.z += slot.vz * dt; slot.vy -= (slot.kind === 3 ? -.4 : 4.5) * dt; slot.vx *= Math.pow(.18, dt); slot.vz *= Math.pow(.18, dt); } }
  function updateRenderEffects() {
    const rotorX = sim.x; const rotorY = .34; const rotorZ = sim.z; for (let i = 0; i < washSlots.length; i += 1) { const slot = washSlots[i]; const pulse = Math.sin(sim.time * 7 + slot.seed * 9) * .11; washPositions[i * 3] = rotorX + Math.cos(slot.angle + sim.rotorPhase * .02) * (slot.radius + pulse); washPositions[i * 3 + 1] = rotorY + slot.seed * .05; washPositions[i * 3 + 2] = rotorZ + Math.sin(slot.angle + sim.rotorPhase * .02) * (slot.radius + pulse); }
    for (let i = 0; i < fxSlots.length; i += 1) { const slot = fxSlots[i]; const visible = slot.active; fxPositions[i * 3] = visible ? slot.x : 999; fxPositions[i * 3 + 1] = visible ? slot.y : 999; fxPositions[i * 3 + 2] = visible ? slot.z : 999; fxColor.setHex(slot.color || 0xffffff); fxColors[i * 3] = fxColor.r; fxColors[i * 3 + 1] = fxColor.g; fxColors[i * 3 + 2] = fxColor.b; const fadeIn = clamp(slot.age / .08, 0, 1); const fadeOut = clamp(slot.life / .2, 0, 1); fxAlphas[i] = visible ? fadeIn * fadeOut : 0; fxSizes[i] = visible ? slot.size * (1 + Math.sin(slot.age * 18) * .08) : 0; }
    for (let i = 0; i < dynamicHazardViews.length; i += 1) { const view = dynamicHazardViews[i]; const hazard = view.hazard; const x = view.baseX + (hazard.motionX || 0); const z = view.baseZ + (hazard.motionZ || 0); view.ring.position.set(x, .16 + Math.sin(sim.time * 3 + view.phase) * .05, z); view.ring.scale.setScalar(.86 + hazard.activity * .22); view.ring.material.opacity = .3 + hazard.activity * .42; view.flare.position.set(x, Math.max(1.2, hazard.h * .22) + Math.sin(sim.time * 4 + view.phase) * .18, z); view.flare.rotation.y = sim.time * 2 + view.phase; view.flare.scale.setScalar(.8 + hazard.activity * .35); }
    if (washRing) { washRing.position.set(sim.x, .05, sim.z); washRing.scale.setScalar(.7 + sim.collective * .95 + sim.wind * .006); washRing.material.opacity = .12 + sim.collective * .1; washDust.position.set(sim.x, .08, sim.z); washDust.scale.setScalar(.55 + sim.collective * .65); washDust.material.opacity = .08 + sim.collective * .11; }
    washPoints.geometry.attributes.position.needsUpdate = true; fxPoints.geometry.attributes.position.needsUpdate = true; fxPoints.geometry.attributes.color.needsUpdate = true; fxPoints.geometry.attributes.aSize.needsUpdate = true; fxPoints.geometry.attributes.aAlpha.needsUpdate = true; washPoints.visible = state.mode === 'playing'; fxPoints.visible = state.mode === 'playing' || state.mode === 'crashed';
  }
  function updateCable() {
    const hook = hookPoint(); for (let i = 0; i < MAX_CABLE_SEGMENTS; i += 1) { const t = i / (MAX_CABLE_SEGMENTS - 1); cablePositions[i * 3] = lerp(sim.x, hook.x, t) + Math.sin(t * Math.PI) * sim.cableAngleX * .35; cablePositions[i * 3 + 1] = lerp(sim.y - 1.65, hook.y, t) + Math.sin(t * Math.PI) * (sim.tension > .68 ? -.14 : .05); cablePositions[i * 3 + 2] = lerp(sim.z, hook.z, t) + Math.sin(t * Math.PI) * sim.cableAngleZ * .35; } cableLine.geometry.attributes.position.needsUpdate = true; cableLine.material.color.setHex(sim.hooked >= 0 && sim.tension > .68 ? 0xff956b : currentMission.palette.accent); cableHook.position.set(hook.x, hook.y, hook.z); cableHook.visible = state.mode === 'playing';
  }
  function updateView() {
    helicopter.position.set(sim.x, sim.y, sim.z); helicopter.rotation.set(sim.pitch, sim.yaw, sim.roll); helicopterParts.rotor.group.rotation.y = sim.rotorPhase; helicopterParts.tailRotor.rotation.z = sim.rotorPhase * (1.3 + sim.tailWash * .8); helicopterParts.smoke.visible = sim.damageStage > 0; helicopterParts.smoke.scale.setScalar(1 + sim.damageStage * .12 + Math.sin(sim.time * 7) * .04); helicopterParts.body.scale.y = sim.airframeState === 'land' ? .94 : sim.airframeState === 'crash' ? .78 : 1; helicopterParts.rotor.group.scale.setScalar(sim.airframeState === 'damage' ? 1.02 : 1); helicopterParts.bodyMaterial.emissive.setHex(sim.damageFlash > 0 ? 0xff8068 : 0x000000); helicopterParts.bodyMaterial.emissiveIntensity = sim.damageFlash > 0 ? .48 : 0;
    blobShadow.position.set(sim.x, .03, sim.z); blobShadow.scale.set(1 + Math.abs(sim.roll) * .35, 1 + Math.abs(sim.pitch) * .2, 1); blobShadow.material.opacity = clamp(.24 + sim.y * -.006, .08, .27);
    for (let i = 0; i < survivorMeshes.length; i += 1) { const mesh = survivorMeshes[i]; const survivor = sim.survivors[i]; if (!survivor) { mesh.visible = false; continue; } mesh.visible = survivor.status !== 'delivered'; if (survivor.status === 'aboard') { const seat = new THREE.Vector3(((survivor.seatIndex % 3) - 1) * .62, -.2 + Math.floor(survivor.seatIndex / 3) * .18, .68); helicopter.localToWorld(seat); mesh.position.copy(seat); mesh.quaternion.copy(helicopter.quaternion); mesh.rotation.z += Math.sin(sim.time * 4 + i) * .035; } else { mesh.position.set(survivor.x, survivor.y + (survivor.status === 'waiting' ? Math.sin(sim.time * 3 + i) * .08 : survivor.status === 'hooked' ? Math.sin(sim.time * 8 + i) * .12 : 0), survivor.z); mesh.rotation.z = survivor.status === 'hooked' ? Math.sin(sim.time * 9 + i) * .18 : 0; } mesh.userData.beacon.visible = survivor.status === 'waiting'; }
    for (let i = 0; i < pickupMeshes.length; i += 1) if (pickupMeshes[i].visible) { pickupMeshes[i].position.y = .62 + Math.sin(sim.time * 3 + i) * .12; pickupMeshes[i].rotation.y = sim.time * .8 + i; }
    updateCable(); updateRenderEffects(); const tension = sim.tension; ui.tension.classList.toggle('is-hot', tension > .68); setTextIfChanged(ui.tension, sim.hooked >= 0 ? `${Math.round(tension * 100)}%` : 'READY'); setStyleIfChanged(ui.tensionMeter, 'width', `${sim.hooked >= 0 ? clamp(tension * 100, 0, 100) : 0}%`); ui.tensionMeter.style.background = tension > .68 ? 'var(--orange)' : 'var(--aqua)';
    cameraGoal.set(sim.x - sim.vx * .7, sim.y + 18 - sim.landingPulse * 4, sim.z + 25 - sim.vz * .7); camera.position.x = approach(camera.position.x, cameraGoal.x + juiceFrame.dx * .018, 5.4, STEP); camera.position.y = approach(camera.position.y, cameraGoal.y + juiceFrame.dy * .018, 5.4, STEP); camera.position.z = approach(camera.position.z, cameraGoal.z, 5.4, STEP); cameraTarget.set(sim.x + sim.vx * .35, sim.y * .55, sim.z + sim.vz * .35); camera.lookAt(cameraTarget); cameraFov = approach(cameraFov, 47 + clamp(Math.hypot(sim.vx, sim.vz) * .5, 0, 5) + sim.damageFlash * 2, 4, STEP); if (camera.fov !== cameraFov) { camera.fov = cameraFov; camera.updateProjectionMatrix(); }
  }
  function updateUI() {
    if (state.mode === 'playing') {
      setTextIfChanged(ui.fuel, Math.ceil(sim.fuel)); setTextIfChanged(ui.hull, Math.ceil(sim.hull)); setTextIfChanged(ui.survivors, `${sim.delivered + sim.onboard} / ${currentMission.total}`); setTextIfChanged(ui.wind, `${Math.round(sim.wind)} KT`); setTextIfChanged(ui.time, formatTime(sim.time)); setStyleIfChanged(ui.fuelMeter, 'width', `${clamp(sim.fuel, 0, 100)}%`); setStyleIfChanged(ui.hullMeter, 'width', `${clamp(sim.hull, 0, 100)}%`); ui.fuelMeter.style.background = sim.fuel < 24 ? 'var(--red)' : 'var(--mint)'; ui.hullMeter.style.background = sim.hull < 35 ? 'var(--red)' : 'var(--amber)'; updateObjective(); updateEventChip(); updateTutorialUI(); ui.damageVignette.style.opacity = String(clamp(sim.damageFlash * 2.2, 0, .72));
      const stickX = controlClaims.stick != null && kit.input.pointers.has(controlClaims.stick) ? clamp((kit.input.pointers.get(controlClaims.stick).x - (controlRects.stick.x + controlRects.stick.w * .5)) / (controlRects.stick.w * .45), -1, 1) : 0; const stickY = controlClaims.stick != null && kit.input.pointers.has(controlClaims.stick) ? clamp(-(kit.input.pointers.get(controlClaims.stick).y - (controlRects.stick.y + controlRects.stick.h * .5)) / (controlRects.stick.h * .45), -1, 1) : 0; ui.stick.style.transform = `translate(${stickX * 38}px, ${-stickY * 38}px)`; const throttleRatio = clamp((sim.collective - .18) / .77, 0, 1); ui.throttle.style.transform = `translateY(${(1 - throttleRatio) * 88}px)`; const winchRatio = clamp((sim.cableTarget - 2.4) / 10.5, 0, 1); ui.winch.style.transform = `translateY(${winchRatio * 128}px)`;
    }
  }
  function resize() { if (!renderer || !camera) return; renderer.setSize(window.innerWidth, window.innerHeight, false); camera.aspect = window.innerWidth / Math.max(1, window.innerHeight); camera.updateProjectionMatrix(); measureControls(); }
  function handleAction(action) {
    if (action === 'pause' && state.mode === 'playing' && !kit.paused) kit.pause('manual');
    else if (action === 'resume' && kit.paused) kit.resume('manual');
    else if (action === 'restart' && state.mode !== 'title') kit.restart();
    else if (action === 'title') { if (kit.paused) kit.resume('manual'); showTitle(); }
    else if (action === 'settings') kit.openSettings();
    else if (action === 'fullscreen') kit.requestFullscreen();
    else if (action === 'next' && resultState?.won) beginMission(MISSIONS[missionIndex(currentMission.id) + 1]?.id || currentMission.id);
  }
  function installInput() {
    const controls = { stick: document.getElementById('stick-control'), throttle: document.getElementById('throttle-control'), winch: document.getElementById('winch-control') };
    Object.entries(controls).forEach(([zone, node]) => { node.addEventListener('pointerdown', (event) => controlPointerDown(event, zone), { passive: false }); node.addEventListener('pointerup', (event) => releaseControlPointer(event, zone), { passive: true }); node.addEventListener('pointercancel', (event) => releaseControlPointer(event, zone), { passive: true }); node.addEventListener('lostpointercapture', (event) => releaseControlPointer(event, zone), { passive: true }); });
    document.addEventListener('click', (event) => { const missionButton = event.target.closest('[data-mission]'); if (missionButton) { beginMission(missionButton.dataset.mission); return; } const actionButton = event.target.closest('[data-action]'); if (actionButton) handleAction(actionButton.dataset.action); });
    window.addEventListener('keydown', (event) => { if (event.code === 'Escape' || event.code === 'KeyP') { event.preventDefault(); handleAction(kit.paused ? 'resume' : 'pause'); } else if ((event.code === 'Space' || event.code === 'Enter') && state.mode !== 'title' && state.mode !== 'playing') { event.preventDefault(); handleAction('restart'); } else if (event.code === 'KeyF' && event.altKey) { handleAction('fullscreen'); } });
    window.addEventListener('resize', resize, { passive: true });
  }
  function exposeHook() {
    const hook = {
      state,
      forceMission(value) { beginMission(normalizeMission(value), true); },
      forceWind(value) { if (value === null || value === undefined || value === false || value === 'clear') state.windOverride = null; else if (value === true) state.windOverride = Math.max(55, currentMission.windBase); else { const parsed = Number(value); state.windOverride = Number.isFinite(parsed) ? clamp(parsed, 0, 90) : currentMission.windBase; } syncState(); }
    };
    window.__vr = hook;
  }
  function frame(now) {
    const realDt = clamp((now - lastFrame) / 1000, 0, .2); lastFrame = now; juiceFrame = kit.juice.frame(); pollGamepadActions();
    if (!kit.paused && state.mode === 'playing') { accumulator += realDt; let steps = 0; while (accumulator >= STEP && steps < MAX_SIM_STEPS) { simulate(STEP); accumulator -= STEP; steps += 1; } }
    if (!juiceFrame.frozen) updateView(); updateUI(); renderer.render(scene, camera); requestAnimationFrame(frame);
  }

  initScene();
  exposeHook();
  installInput();
  kit.loader.show('VERTOL RESCUE'); kit.loader.progress(.18); requestAnimationFrame(() => { kit.loader.progress(.46); requestAnimationFrame(() => { kit.loader.progress(.74); requestAnimationFrame(() => { kit.loader.progress(1); kit.loader.hide(); }); }); });
  renderMissionGrid();
  const pendingMission = bootHook._pendingMission; const pendingWind = bootHook._pendingWind;
  if (pendingMission != null) beginMission(normalizeMission(pendingMission), true); else showTitle();
  if (pendingWind != null) window.__vr.forceWind(pendingWind);
  requestAnimationFrame(frame);
})();
