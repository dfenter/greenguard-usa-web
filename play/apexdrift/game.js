import * as THREE from 'three';
import { createRacerWorld } from '/play/_shared/racer/engine.js';

const TRACK_IDS = [
  'tideglass-180', 'sunline-causeway', 'harbor-rise',
  'cobalt-switchback', 'summit-run', 'cliffside-needle',
  'neon-overpass', 'metro-spiral', 'midnight-boulevard',
];
const TRACK_FILES = {
  'tideglass-180': './tracks/tideglass-180.json',
  'sunline-causeway': './tracks/sunline-causeway.json',
  'harbor-rise': './tracks/harbor-rise.json',
  'cobalt-switchback': './tracks/cobalt-switchback.json',
  'summit-run': './tracks/summit-run.json',
  'cliffside-needle': './tracks/cliffside-needle.json',
  'neon-overpass': './tracks/neon-overpass.json',
  'metro-spiral': './tracks/metro-spiral.json',
  'midnight-boulevard': './tracks/midnight-boulevard.json',
};
const TRACK_META = {
  'tideglass-180': { short: 'TIDEGLASS 180', tag: 'SEASIDE / 180 SWEEPER' },
  'sunline-causeway': { short: 'SUNLINE', tag: 'BAY / CAUSEWAY' },
  'harbor-rise': { short: 'HARBOR RISE', tag: 'PORT / ELEVATED' },
  'cobalt-switchback': { short: 'COBALT', tag: 'ALPINE / LADDER' },
  'summit-run': { short: 'SUMMIT RUN', tag: 'ALPINE / HIGH ROAD' },
  'cliffside-needle': { short: 'NEEDLE', tag: 'ALPINE / CLIFF CUT' },
  'neon-overpass': { short: 'OVERPASS', tag: 'CITY / TUNNEL' },
  'metro-spiral': { short: 'METRO SPIRAL', tag: 'CITY / SPIRAL' },
  'midnight-boulevard': { short: 'MIDNIGHT', tag: 'CITY / BOULEVARD' },
};
const MODES = ['grand-prix', 'time-attack', 'drift-trial'];
const CUPS = [
  { name: 'COASTLINE CUP', range: [0, 2] },
  { name: 'SUMMIT CUP', range: [3, 5] },
  { name: 'NEON CUP', range: [6, 8] },
];
const CARS = [
  { id: 'sunset-gt', name: 'Sunset GT', livery: 'Solar', paint: 0xd44738, accent: 0xf2c34e, maxSpeed: 58, grip: 1.06, angle: 1.0, top: 1.0 },
  { id: 'violet-comet', name: 'Violet Comet', livery: 'Ultraviolet', paint: 0x8e53d6, accent: 0xff73a8, maxSpeed: 60, grip: 0.93, angle: 1.18, top: 1.05 },
  { id: 'coast-runner', name: 'Coast Runner', livery: 'Aqua Flash', paint: 0x1c95c7, accent: 0x76f2de, maxSpeed: 56, grip: 1.16, angle: 0.92, top: 0.96 },
  { id: 'cobalt-r', name: 'Cobalt R', livery: 'Blue Hour', paint: 0x2454b8, accent: 0xd9ecff, maxSpeed: 63, grip: 0.88, angle: 1.08, top: 1.12 },
  { id: 'sunset-pro', name: 'Sunset Pro', livery: 'Hotline', paint: 0xff754c, accent: 0x40243e, maxSpeed: 61, grip: 1.0, angle: 1.28, top: 1.08 },
  { id: 'night-phantom', name: 'Night Phantom', livery: 'Electric Noir', paint: 0x242b52, accent: 0x5de9ef, maxSpeed: 66, grip: 0.84, angle: 1.34, top: 1.18 },
];
const STARTER_SAVE = { selectedCar: 'sunset-gt', unlocked: ['sunset-gt'], medals: {}, tutorial: false };
const FIXED_DT = 1 / 60;
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const wrap01 = (value) => { const result = value % 1; return result < 0 ? result + 1 : result; };
const lerp = (a, b, amount) => a + (b - a) * amount;

const canvas = document.getElementById('scene');
const fallback = document.getElementById('fallback');
const fallbackError = document.getElementById('fallback-error');
const metaLabel = document.getElementById('race-meta');
const speedLabel = document.getElementById('speed');
const posLabel = document.getElementById('pos');
const lapLabel = document.getElementById('lap');
const nitroPips = Array.from(document.querySelectorAll('.nitro-pip'));
const driftChip = document.getElementById('drift-chip');
const driftScoreLabel = document.getElementById('drift-score');
const toast = document.getElementById('toast');
const tutorial = document.getElementById('tutorial');
const menu = document.getElementById('menu');
const result = document.getElementById('result');
const trackCards = document.getElementById('track-cards');
const garageList = document.getElementById('garage-list');
const selectedCarLabel = document.getElementById('selected-car');
const resultTitle = document.getElementById('result-title');
const resultCopy = document.getElementById('result-copy');
const resultButton = document.getElementById('result-button');
const podium = document.getElementById('podium');
const medalLabel = document.getElementById('medal');

const ad = window.__ad || { state: {} };
window.__ad = ad;
let mode = MODES.includes(ad.state.mode) ? ad.state.mode : 'grand-prix';
let selectedTrack = hasOwn(TRACK_FILES, ad.state.track) ? ad.state.track : TRACK_IDS[0];
let cup = clamp(Number(ad.state.cup) || 1, 1, 3);
const bootQuery = new URLSearchParams(location.search);
if (bootQuery.has('forceCup') && !bootQuery.has('forceTrack')) selectedTrack = TRACK_IDS[(cup - 1) * 3];
let raceIndex = TRACK_IDS.indexOf(selectedTrack);
let racer = null;
let trackData = null;
let kit = null;
let saveData = STARTER_SAVE;
let selectedCar = CARS[0];
let toastUntil = 0;
let toastText = '';
let tutorialUntil = 0;
let tutorialStage = 0;
let lastHudTime = -1;
let accumulator = 0;
let lastFrameTime = 0;
let frameHandle = 0;
let pendingTrackLoad = false;

const sim = {
  started: false,
  countdown: 1.7,
  elapsed: 0,
  progress: 0.014,
  lap: 1,
  laps: 3,
  speed: 0,
  steering: 0,
  lateral: 0,
  nitroCharges: 2,
  nitroActive: 0,
  nitroMeter: 0.2,
  drifting: false,
  driftAngle: 0,
  driftTime: 0,
  driftScore: 0,
  currentChain: 0,
  cleanExit: 0,
  wallCooldown: 0,
  draftTimer: 0,
  pickupMask: 0,
  position: 8,
  completed: false,
  timeRemaining: 75,
  ghostDistance: 0,
  ghostTime: 0,
  raceDistance: 0,
};
const playerState = {
  position: { x: 0, y: 0, z: 0 }, yaw: 0, progress: 0, speed: 0, steering: 0,
  acceleration: 0, lateralG: 0, suspension: 0, brake: 0, boost: 0, roll: 0, pitch: 0,
};
const rivalStates = Array.from({ length: 7 }, () => ({ progress: 0, speed: 30, steering: 0, boost: 0 }));
const rivalLaps = new Int8Array(7);
const rivalDistances = new Float32Array(7);
const framePacket = { carState: playerState, rivals: rivalStates };
const playerFrame = { progress: 0, position: new THREE.Vector3(), tangent: new THREE.Vector3(0, 0, 1), right: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0), bank: 0 };

function validateSave(value) {
  if (!value || typeof value !== 'object') return false;
  if (!CARS.some((car) => car.id === value.selectedCar)) return false;
  if (!Array.isArray(value.unlocked) || !value.unlocked.every((id) => CARS.some((car) => car.id === id))) return false;
  return !value.medals || typeof value.medals === 'object';
}

function carById(id) {
  for (let i = 0; i < CARS.length; i += 1) if (CARS[i].id === id) return CARS[i];
  return CARS[0];
}

function isUnlocked(id) {
  return Array.isArray(saveData.unlocked) && saveData.unlocked.includes(id);
}

function trackMeta(id) {
  return hasOwn(TRACK_META, id) ? TRACK_META[id] : { short: id.toUpperCase(), tag: 'RIDGE RUN' };
}

function syncAd() {
  ad.state.mode = mode;
  ad.state.cup = cup;
  ad.state.track = trackData && trackData.id ? trackData.id : selectedTrack;
  ad.state.lap = sim.lap;
  ad.state.pos = sim.position;
  ad.state.nitro = sim.nitroCharges;
  ad.state.drifting = sim.drifting;
  ad.state.driftScore = Math.round(sim.driftScore);
  document.getElementById('boot-track').textContent = trackMeta(ad.state.track).short;
  document.getElementById('boot-cup').textContent = String(cup);
}

function showToast(message, duration = 1) {
  toastText = message;
  toast.textContent = message;
  toastUntil = performance.now() / 1000 + duration;
  toast.classList.add('visible');
}

function setTutorial(message, duration = 3.2) {
  if (saveData.tutorial || sim.completed) return;
  tutorial.textContent = message;
  tutorialUntil = performance.now() / 1000 + duration;
  tutorial.classList.add('visible');
}

function hideMenu() {
  menu.classList.remove('visible');
  menu.setAttribute('aria-hidden', 'true');
  if (kit && kit.paused) kit.resume('menu');
}

function openMenu() {
  if (!kit || sim.completed) return;
  kit.pause('menu');
  renderMenu();
  menu.classList.add('visible');
  menu.setAttribute('aria-hidden', 'false');
}

function showError(error) {
  const message = error && error.message ? error.message : String(error);
  fallbackError.textContent = `BOOT ERROR: ${message}`;
  fallback.hidden = false;
}

function pointerIn(id, pointer) {
  const element = document.getElementById(id);
  if (!element || !pointer) return false;
  const rect = element.getBoundingClientRect();
  return pointer.x >= rect.left && pointer.x <= rect.right && pointer.y >= rect.top && pointer.y <= rect.bottom;
}

function readControls() {
  let steer = 0;
  let drift = false;
  let nitro = false;
  let flick = false;
  if (kit.input.keyDown('ArrowLeft') || kit.input.keyDown('KeyA')) steer -= 1;
  if (kit.input.keyDown('ArrowRight') || kit.input.keyDown('KeyD')) steer += 1;
  drift = kit.input.keyDown('ShiftLeft') || kit.input.keyDown('ShiftRight');
  nitro = kit.input.keyDown('Space') || kit.input.keyDown('KeyN') || kit.input.keyDown('Enter');
  for (const pointer of kit.input.pointers.values()) {
    if (pointerIn('steer-left', pointer)) steer -= 1;
    if (pointerIn('steer-right', pointer)) steer += 1;
    if (pointerIn('brake', pointer)) drift = true;
    if (pointerIn('nitro-button', pointer)) nitro = true;
    if (Math.abs(pointer.x - pointer.startX) > 26 && performance.now() - pointer.downAt < 520) flick = true;
  }
  return { steer: clamp(steer, -1, 1), drift, nitro, flick };
}

function approximateLength(data) {
  let length = 0;
  const points = data.controlPoints || [];
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const dx = Number(b.x) - Number(a.x);
    const dz = Number(b.z) - Number(a.z);
    const dy = Number(b.elevation || 0) - Number(a.elevation || 0);
    length += Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  return Math.max(240, length * 1.12);
}

function resetSimulation() {
  sim.started = false;
  sim.countdown = 1.7;
  sim.elapsed = 0;
  sim.progress = 0.014;
  sim.lap = 1;
  sim.laps = mode === 'drift-trial' ? 99 : 3;
  sim.speed = 0;
  sim.steering = 0;
  sim.lateral = 0;
  sim.nitroCharges = 2;
  sim.nitroActive = 0;
  sim.nitroMeter = 0.2;
  sim.drifting = false;
  sim.driftAngle = 0;
  sim.driftTime = 0;
  sim.driftScore = 0;
  sim.currentChain = 0;
  tutorialStage = 0;
  sim.cleanExit = 0;
  sim.wallCooldown = 0;
  sim.draftTimer = 0;
  sim.pickupMask = 0;
  sim.position = 8;
  sim.completed = false;
  sim.timeRemaining = 75;
  sim.ghostDistance = 0;
  sim.ghostTime = 0;
  sim.raceDistance = 0;
  for (let i = 0; i < rivalStates.length; i += 1) {
    rivalStates[i].progress = wrap01(0.035 + i * 0.038);
    rivalStates[i].speed = 29 + i * 0.35;
    rivalStates[i].steering = 0;
    rivalStates[i].boost = 0;
    rivalLaps[i] = 0;
  }
  if (racer) {
    racer.world.mainCar.setLivery({ paint: selectedCar.paint, accent: selectedCar.accent });
    racer.camera.snapToCar();
  }
  setTutorial('STEER WITH ARROWS OR A / D · TAP DRIFT TO LINK THE FIRST SWEEP', 4.2);
  showToast('3', 0.48);
  syncAd();
}

function buildPlayerState() {
  const frame = racer.trackQueries.sampleRacingLine(sim.progress, playerFrame);
  playerState.position.x = frame.position.x + frame.right.x * sim.lateral;
  playerState.position.y = frame.position.y + frame.right.y * sim.lateral;
  playerState.position.z = frame.position.z + frame.right.z * sim.lateral;
  playerState.progress = sim.progress;
  playerState.yaw = Math.atan2(frame.tangent.x, frame.tangent.z) + sim.steering * (sim.drifting ? 0.34 : 0.08);
  playerState.speed = sim.speed;
  playerState.steering = sim.steering;
  playerState.acceleration = (sim.speed - 30) * 0.12;
  playerState.lateralG = sim.steering * sim.speed * 0.014;
  playerState.suspension = Math.sin(sim.elapsed * 7.2) * Math.min(.045, sim.speed * .0012);
  playerState.brake = sim.drifting ? 1 : 0;
  playerState.boost = sim.nitroActive > 0 ? 1 : 0;
  playerState.roll = -sim.steering * 0.06 - (sim.drifting ? sim.driftAngle * 0.12 : 0);
  playerState.pitch = -((sim.speed - 30) * 0.0012);
}

function updateRivals(dt, trackLength) {
  const playerDistance = (sim.lap - 1) + sim.progress;
  for (let i = 0; i < rivalStates.length; i += 1) {
    if (mode === 'time-attack' && i === 0) {
      sim.ghostTime += dt;
      sim.ghostDistance = wrap01(sim.ghostDistance + (38 + Math.sin(sim.ghostTime * .35) * 2.3) * dt / trackLength);
      rivalStates[i].progress = sim.ghostDistance;
      rivalStates[i].speed = 38 + Math.sin(sim.ghostTime * .35) * 2.3;
      rivalStates[i].steering = Math.sin(sim.ghostTime * 1.7) * 0.2;
      rivalStates[i].boost = .2;
      continue;
    }
    const aiDistance = rivalLaps[i] + rivalStates[i].progress;
    const gap = playerDistance - aiDistance;
    const catchUp = clamp(gap * 5.1, -3, 8.5);
    const base = 30.4 + i * .65 + Math.sin(sim.elapsed * (.62 + i * .035) + i) * 1.35;
    rivalStates[i].speed = clamp(base + catchUp, 24, 57);
    const previous = rivalStates[i].progress;
    rivalStates[i].progress = previous + rivalStates[i].speed * dt / trackLength;
    if (rivalStates[i].progress >= 1) {
      rivalStates[i].progress -= 1;
      rivalLaps[i] += 1;
    }
    rivalStates[i].steering = Math.sin(sim.elapsed * (1.1 + i * .03) + i * 2.2) * .3;
    rivalStates[i].boost = catchUp > 3.4 ? 1 : 0;
  }
}

function calculatePosition() {
  const playerDistance = (sim.lap - 1) + sim.progress;
  let place = 1;
  for (let i = 0; i < rivalDistances.length; i += 1) {
    rivalDistances[i] = rivalLaps[i] + rivalStates[i].progress;
    if (rivalDistances[i] > playerDistance) place += 1;
  }
  sim.position = clamp(place, 1, 8);
}

function collectPickups(previous, next) {
  const pickupAt = [.06, .13, .2, .29, .38, .47, .57, .66, .75, .84, .93];
  for (let i = 0; i < pickupAt.length; i += 1) {
    if ((sim.pickupMask & (1 << i)) !== 0) continue;
    const crossed = previous <= next ? pickupAt[i] >= previous && pickupAt[i] < next : pickupAt[i] >= previous || pickupAt[i] < next;
    if (!crossed) continue;
    sim.pickupMask |= 1 << i;
    sim.nitroCharges = Math.min(3, sim.nitroCharges + 1);
    sim.nitroMeter = .3;
    kit.audio.sfx('pickup', { rate: 1.02 + i * .012 });
    showToast('NITRO +1', .72);
  }
}

function beginDrift(direction) {
  sim.drifting = true;
  sim.driftAngle = direction * .16;
  sim.driftTime = 0;
  sim.currentChain = Math.max(0, sim.currentChain);
  if (tutorialStage < 1) {
    tutorialStage = 1;
    setTutorial('HOLD A CORNER THROUGH THE DRIFT · ANGLE BUILDS NITRO', 3.2);
  }
  kit.audio.sfx('driftStart');
}

function cleanExit() {
  if (!sim.drifting) return;
  if (sim.driftTime > .32 && Math.abs(sim.driftAngle) > .18) {
    sim.cleanExit = 1.2;
    sim.speed = Math.min(selectedCar.maxSpeed + 10, sim.speed + 4.8);
    sim.currentChain += 1;
    showToast(`CLEAN EXIT x${sim.currentChain}`, .8);
    kit.audio.sfx('cleanExit');
  }
  sim.drifting = false;
  sim.driftAngle = 0;
  sim.driftTime = 0;
}

function useNitro() {
  if (sim.nitroCharges <= 0 || sim.nitroActive > 0 || !sim.started) return;
  sim.nitroCharges -= 1;
  sim.nitroActive = .95;
  kit.audio.sfx('nitro', { rate: 1.05 });
  showToast('NITRO', .62);
  if (tutorialStage < 2) {
    tutorialStage = 2;
    setTutorial('NITRO IS EARNED BY STYLE · PICKUPS ARE GENEROUS', 3.1);
  }
}

function stepSimulation(dt) {
  if (!racer || sim.completed) return;
  sim.elapsed += dt;
  if (!sim.started) {
    sim.countdown -= dt;
    if (sim.countdown <= 1.2 && sim.countdown > 1.15) showToast('2', .42);
    if (sim.countdown <= .65 && sim.countdown > .6) showToast('1', .42);
    if (sim.countdown <= 0) {
      sim.started = true;
      sim.speed = 27;
      showToast('GO', .62);
      kit.audio.sfx('countdown');
    }
    buildPlayerState();
    framePacket.carState = playerState;
    racer.world.update(framePacket, FIXED_DT);
    return;
  }
  const controls = readControls();
  const steerTarget = controls.steer;
  const previousSpeed = sim.speed;
  sim.steering = lerp(sim.steering, steerTarget, 1 - Math.exp(-dt * 11));
  if (controls.nitro) useNitro();
  if (!sim.drifting && (controls.drift || controls.flick) && sim.speed > 12) beginDrift(Math.abs(sim.steering) > .1 ? Math.sign(sim.steering) : (controls.steer || 1));
  if (sim.drifting) {
    sim.driftTime += dt;
    const angleTarget = clamp(.14 + Math.abs(sim.steering) * .76 * selectedCar.angle, .14, .92);
    const direction = Math.abs(sim.steering) > .07 ? Math.sign(sim.steering) : Math.sign(sim.driftAngle || 1);
    sim.driftAngle = lerp(sim.driftAngle, direction * angleTarget, 1 - Math.exp(-dt * 5.5));
    sim.lateral += sim.steering * dt * (1.65 + selectedCar.angle * .48) * (sim.speed / 34);
    const proximity = Math.abs(sim.lateral) > 4.2 ? 1.25 : 1;
    const style = (Math.abs(sim.driftAngle) * 1.6 + sim.speed / 44) * selectedCar.angle * proximity;
    sim.driftScore += style * dt * 110;
    sim.nitroMeter += style * dt * .012;
    if (sim.nitroMeter >= 1) {
      sim.nitroMeter -= 1;
      sim.nitroCharges = Math.min(3, sim.nitroCharges + 1);
      kit.audio.sfx('charge');
      showToast('STYLE CHARGE', .72);
    }
    if (sim.driftTime > .12 && Math.abs(sim.steering) < .05 && !controls.drift) sim.cleanExit += dt;
    else sim.cleanExit = 0;
    if (sim.cleanExit > .26 || sim.speed < 7) cleanExit();
    if (Math.floor(sim.elapsed * 7) % 4 === 0 && sim.driftTime > .18) kit.audio.sfx('drift', { rate: .84 + Math.abs(sim.driftAngle) * .42, volume: .42 });
    if (Math.floor(sim.elapsed * 10) % 5 === 0 && Math.abs(sim.driftAngle) > .35) racer.world.fx.spawnSkid(playerState.position, playerState.yaw);
  } else {
    sim.lateral = lerp(sim.lateral, sim.steering * 1.1, 1 - Math.exp(-dt * selectedCar.grip * 4.2));
  }
  sim.draftTimer = Math.max(0, sim.draftTimer - dt);
  let drafting = false;
  for (let i = 0; i < rivalStates.length; i += 1) {
    const gap = rivalStates[i].progress - sim.progress;
    if (gap > .006 && gap < .055 && Math.abs(sim.lateral) < 3.8) { drafting = true; break; }
  }
  if (drafting) {
    sim.speed += dt * 3.4;
    if (sim.draftTimer <= 0) {
      sim.draftTimer = .85;
      showToast('SLIPSTREAM', .7);
      kit.audio.sfx('cleanExit', { rate: 1.28, volume: .36 });
    }
  }
  const target = selectedCar.maxSpeed + (sim.nitroActive > 0 ? 24 : 0) + (drafting ? 6 : 0) + (Math.abs(sim.steering) > .55 && sim.drifting ? 2 : 0);
  const throttle = sim.nitroActive > 0 ? 7.2 : 3.1;
  sim.speed = lerp(sim.speed, target, 1 - Math.exp(-dt * throttle));
  if (sim.drifting) sim.speed = Math.max(18, sim.speed - Math.abs(sim.steering) * dt * 3.3);
  sim.nitroActive = Math.max(0, sim.nitroActive - dt);
  sim.cleanExit = Math.max(0, sim.cleanExit - dt);
  sim.wallCooldown = Math.max(0, sim.wallCooldown - dt);
  const wall = (trackData.width || 14) * .5 - 1.18;
  if (Math.abs(sim.lateral) > wall) {
    sim.lateral = clamp(sim.lateral, -wall, wall);
    sim.speed = Math.max(13, sim.speed * .88);
    if (sim.wallCooldown <= 0) {
      sim.wallCooldown = .25;
      kit.audio.sfx('wallTap', { rate: .92 + Math.random() * .08 });
      racer.world.fx.spawnSpark(playerState.position, { x: sim.steering * 2, y: 1.4, z: -sim.speed * .08 });
      showToast('WALL TAP', .58);
    }
  }
  const trackLength = approximateLength(trackData);
  const previousProgress = sim.progress;
  sim.progress += sim.speed * dt / trackLength;
  if (sim.progress >= 1) {
    sim.progress -= 1;
    sim.lap += 1;
    sim.pickupMask = 0;
    kit.audio.sfx('lap');
    if (mode === 'drift-trial' && sim.lap > 3) sim.lap = 1;
    if (mode !== 'drift-trial' && sim.lap > sim.laps) {
      sim.lap = sim.laps;
      sim.completed = true;
      finishRace();
    }
  }
  collectPickups(previousProgress, sim.progress);
  if (mode === 'drift-trial') {
    sim.timeRemaining -= dt;
    if (sim.timeRemaining <= 0) {
      sim.timeRemaining = 0;
      sim.completed = true;
      finishRace();
    }
  }
  updateRivals(dt, trackLength);
  calculatePosition();
  buildPlayerState();
  framePacket.carState = playerState;
  racer.world.update(framePacket, FIXED_DT);
  if (sim.nitroActive > 0 && previousSpeed < selectedCar.maxSpeed + 12) racer.world.fx.spawnSpark(playerState.position, { x: 0, y: .7, z: -sim.speed * .18 });
}

function medalForRace() {
  if (mode === 'drift-trial') {
    if (sim.driftScore >= 9000) return 'gold';
    if (sim.driftScore >= 5500) return 'silver';
    if (sim.driftScore >= 2500) return 'bronze';
    return 'none';
  }
  if (sim.position === 1) return 'gold';
  if (sim.position <= 3) return 'silver';
  if (sim.position <= 6) return 'bronze';
  return 'none';
}

function recordMedal() {
  const medal = medalForRace();
  const key = `${mode}:${selectedTrack}`;
  if (!saveData.medals || typeof saveData.medals !== 'object') saveData.medals = {};
  if (!hasOwn(saveData.medals, key) || saveData.medals[key] !== 'gold' && (saveData.medals[key] === 'none' || medal === 'gold' || medal === 'silver')) saveData.medals[key] = medal;
  const medalCount = Object.values(saveData.medals).filter((value) => value !== 'none').length;
  const unlockCount = Math.min(CARS.length, 1 + Math.floor(medalCount / 2));
  saveData.unlocked = CARS.slice(0, unlockCount).map((car) => car.id);
  kit.save.set(saveData);
  return medal;
}

function finishRace() {
  if (sim.completed !== true) sim.completed = true;
  const medal = recordMedal();
  const medalIcon = medal === 'gold' ? '◆' : medal === 'silver' ? '◇' : medal === 'bronze' ? '●' : '○';
  medalLabel.textContent = medalIcon;
  if (mode === 'drift-trial') {
    resultTitle.textContent = `${medal.toUpperCase()} STYLE`;
    resultCopy.textContent = `${Math.round(sim.driftScore).toLocaleString()} style points · angle, duration, proximity`;
    resultButton.textContent = 'Run it again';
  } else {
    const cupEnd = mode === 'grand-prix' && raceIndex % 3 === 2;
    resultTitle.textContent = cupEnd ? `${CUPS[cup - 1].name} PODIUM` : `${medal.toUpperCase()} FINISH`;
    resultCopy.textContent = `Position ${sim.position}/8 · clean exits carry speed into the next corner`;
    resultButton.textContent = cupEnd ? (cup < 3 ? 'Next cup' : 'Race again') : 'Next race';
  }
  podium.innerHTML = '';
  const playerName = selectedCar.name.toUpperCase();
  const places = [
    { label: sim.position === 1 ? playerName : 'RIVAL 01', className: 'first' },
    { label: sim.position === 2 ? playerName : 'RIVAL 02', className: 'second' },
    { label: sim.position === 3 ? playerName : 'RIVAL 03', className: 'third' },
  ];
  for (let i = 0; i < places.length; i += 1) {
    const item = document.createElement('div');
    item.className = `podium-place ${places[i].className}`;
    item.textContent = `${i + 1} / ${places[i].label}`;
    podium.appendChild(item);
  }
  result.classList.add('visible');
  result.setAttribute('aria-hidden', 'false');
  if (kit) kit.audio.sfx(medal === 'gold' ? 'podium' : 'finish');
  syncAd();
}

function closeResult() {
  result.classList.remove('visible');
  result.setAttribute('aria-hidden', 'true');
}

function nextRace() {
  closeResult();
  if (mode === 'drift-trial') {
    startRace();
    return;
  }
  if (mode === 'grand-prix') {
    raceIndex = (raceIndex + 1) % TRACK_IDS.length;
    cup = Math.floor(raceIndex / 3) + 1;
    selectedTrack = TRACK_IDS[raceIndex];
  }
  startRace();
}

function renderMenu() {
  const modeButtons = document.querySelectorAll('.menu-button[data-mode]');
  modeButtons.forEach((button) => {
    button.classList.toggle('selected', button.dataset.mode === mode);
  });
  trackCards.innerHTML = '';
  for (let i = 0; i < TRACK_IDS.length; i += 1) {
    const id = TRACK_IDS[i];
    const button = document.createElement('button');
    button.className = 'track-card';
    button.classList.toggle('selected', id === selectedTrack);
    button.type = 'button';
    button.dataset.track = id;
    const meta = trackMeta(id);
    button.innerHTML = `<strong>${meta.short}</strong><small>${meta.tag}</small>`;
    button.addEventListener('click', () => {
      selectedTrack = id;
      raceIndex = TRACK_IDS.indexOf(id);
      cup = Math.floor(raceIndex / 3) + 1;
      renderMenu();
    });
    trackCards.appendChild(button);
  }
  selectedCarLabel.textContent = `CAR 0${CARS.indexOf(selectedCar) + 1} / ${selectedCar.name.toUpperCase()}`;
  garageList.hidden = true;
}

function renderGarage() {
  garageList.innerHTML = '';
  garageList.hidden = false;
  for (let i = 0; i < CARS.length; i += 1) {
    const car = CARS[i];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `car-card${isUnlocked(car.id) ? '' : ' locked'}`;
    button.style.setProperty('--swatch', `#${car.paint.toString(16).padStart(6, '0')}`);
    button.innerHTML = `<span class="car-swatch"></span><strong>${isUnlocked(car.id) ? car.name : 'LOCKED'}</strong><small>${isUnlocked(car.id) ? `${car.livery} · grip ${Math.round(car.grip * 100)} · angle ${Math.round(car.angle * 100)}` : `Earn ${Math.max(1, i * 2)} medals`}</small>`;
    if (isUnlocked(car.id)) button.addEventListener('click', () => {
      selectedCar = car;
      saveData.selectedCar = car.id;
      kit.save.set(saveData);
      renderMenu();
    });
    garageList.appendChild(button);
  }
}

async function loadTrack(id) {
  const safeId = hasOwn(TRACK_FILES, id) ? id : TRACK_IDS[0];
  const response = await fetch(TRACK_FILES[safeId]);
  if (!response.ok) throw new Error(`Track file ${safeId} returned ${response.status}`);
  const data = await response.json();
  if (!data || data.id !== safeId || !Array.isArray(data.controlPoints)) throw new Error(`Invalid track data for ${safeId}`);
  return data;
}

async function rebuildWorld(id) {
  pendingTrackLoad = true;
  if (racer) {
    racer.world.dispose();
    racer = null;
  }
  trackData = await loadTrack(id);
  racer = createRacerWorld({
    canvas,
    trackJSON: trackData,
    theme: trackData.theme || 'coastal',
    timeOfDay: trackData.timeOfDay || 'dusk',
    rivalCount: 7,
    ggkit: kit,
    seed: 4700 + TRACK_IDS.indexOf(trackData.id) * 17,
    carName: selectedCar.name,
    paint: selectedCar.paint,
    accent: selectedCar.accent,
  });
  GGKit.hiDpi.three(racer.world.renderer);
  racer.world.resize();
  pendingTrackLoad = false;
  syncAd();
}

async function startRace() {
  if (pendingTrackLoad) return;
  hideMenu();
  closeResult();
  try {
    if (!racer || !trackData || trackData.id !== selectedTrack) await rebuildWorld(selectedTrack);
    resetSimulation();
    metaLabel.textContent = `${mode.replace('-', ' ').toUpperCase()} / ${trackMeta(selectedTrack).short}`;
    kit.audio.music(mode === 'time-attack' ? 'driveB' : 'driveA', 500);
    syncAd();
  } catch (error) {
    showError(error);
  }
}

function updateHUD(now) {
  const seconds = now / 1000;
  if (seconds - lastHudTime < .08) return;
  lastHudTime = seconds;
  speedLabel.textContent = String(Math.round(sim.speed * 3.6)).padStart(3, '0');
  posLabel.innerHTML = mode === 'drift-trial' ? 'STYLE <strong>1</strong>/1' : `POS <strong>${sim.position}</strong>/8`;
  lapLabel.innerHTML = mode === 'drift-trial' ? `TIME <strong>${Math.ceil(sim.timeRemaining)}</strong>` : `LAP <strong>${sim.lap}</strong>/${sim.laps}`;
  for (let i = 0; i < nitroPips.length; i += 1) nitroPips[i].classList.toggle('on', i < sim.nitroCharges);
  driftChip.classList.toggle('visible', sim.drifting);
  driftScoreLabel.textContent = Math.round(sim.driftScore).toLocaleString();
  const currentToast = seconds < toastUntil;
  toast.classList.toggle('visible', currentToast);
  if (!currentToast && toastText) toastText = '';
  const currentTutorial = seconds < tutorialUntil;
  tutorial.classList.toggle('visible', currentTutorial);
  if (!saveData.tutorial && sim.elapsed > 8) {
    saveData.tutorial = true;
    kit.save.set(saveData);
    tutorial.classList.remove('visible');
  }
  syncAd();
}

function onPause() {
  if (racer) racer.world.setPaused(true);
}

function onResume() {
  if (racer) racer.world.setPaused(false);
}

function onRestart() {
  if (result.classList.contains('visible')) closeResult();
  resetSimulation();
}

function frame(now) {
  if (!lastFrameTime) lastFrameTime = now;
  const elapsed = Math.min(.1, Math.max(0, (now - lastFrameTime) / 1000));
  lastFrameTime = now;
  if (kit && !kit.paused && racer && !pendingTrackLoad) {
    accumulator += elapsed;
    let steps = 0;
    const juiceFrame = kit.juice.frame();
    while (accumulator >= FIXED_DT && steps < 5) {
      if (!juiceFrame.frozen) stepSimulation(FIXED_DT);
      accumulator -= FIXED_DT;
      steps += 1;
    }
    if (steps === 5 && accumulator > FIXED_DT) accumulator = FIXED_DT;
    racer.world.render();
  }
  updateHUD(now);
  frameHandle = requestAnimationFrame(frame);
}

function exposeDebugSwitches() {
  const forceTrack = async (value) => {
    if (!hasOwn(TRACK_FILES, value)) return false;
    selectedTrack = value;
    raceIndex = TRACK_IDS.indexOf(value);
    cup = Math.floor(raceIndex / 3) + 1;
    forceTrack.value = value;
    ad.forceTrackId = value;
    await startRace();
    return true;
  };
  const forceCup = async (value) => {
    const nextCup = clamp(Number(value) || 1, 1, 3);
    cup = nextCup;
    raceIndex = CUPS[nextCup - 1].range[0];
    selectedTrack = TRACK_IDS[raceIndex];
    forceCup.value = nextCup;
    ad.forceCupId = nextCup;
    await startRace();
    return true;
  };
  forceTrack.value = hasOwn(TRACK_FILES, ad.state.track) ? ad.state.track : null;
  forceCup.value = cup;
  ad.forceTrack = forceTrack;
  ad.forceCup = forceCup;
  ad.switches = { forceTrack, forceCup };
}

async function boot() {
  kit.loader.show('APEXDRIFT / LOADING RIDGE');
  kit.loader.progress(.12);
  saveData = kit.save.get(STARTER_SAVE);
  selectedCar = carById(saveData.selectedCar);
  kit.audio.register({
    menu: './audio/menu.mp3', driveA: './audio/drive-a.mp3', driveB: './audio/drive-b.mp3',
    countdown: './audio/countdown.mp3', driftStart: './audio/drift-start.mp3', drift: './audio/drift.mp3',
    cleanExit: './audio/clean-exit.mp3', nitro: './audio/nitro.mp3', pickup: './audio/pickup.mp3',
    charge: './audio/charge.mp3', wallTap: './audio/wall-tap.mp3', lap: './audio/lap.mp3',
    finish: './audio/finish.mp3', podium: './audio/podium.mp3',
  });
  kit.loader.progress(.2);
  exposeDebugSwitches();
  await kit.audio.preload(['driveA', 'driveB', 'countdown', 'driftStart', 'drift', 'cleanExit', 'nitro', 'pickup', 'charge', 'wallTap', 'lap', 'finish', 'podium']);
  kit.loader.progress(.35);
  await rebuildWorld(selectedTrack);
  kit.loader.progress(.84);
  fallback.hidden = true;
  renderMenu();
  kit.loader.progress(1);
  kit.loader.hide();
  if (ad.state.mode && MODES.includes(ad.state.mode)) mode = ad.state.mode;
  resetSimulation();
  metaLabel.textContent = `${mode.replace('-', ' ').toUpperCase()} / ${trackMeta(selectedTrack).short}`;
  kit.audio.music(mode === 'time-attack' ? 'driveB' : 'driveA', 500);
  frameHandle = requestAnimationFrame(frame);
}

document.getElementById('mode-button').addEventListener('click', openMenu);
document.getElementById('settings-button').addEventListener('click', () => { if (kit) kit.openSettings(); });
document.getElementById('garage-button').addEventListener('click', renderGarage);
document.getElementById('start-button').addEventListener('click', startRace);
document.getElementById('result-button').addEventListener('click', nextRace);
document.querySelectorAll('.menu-button[data-mode]').forEach((button) => button.addEventListener('click', () => {
  mode = button.dataset.mode;
  if (mode === 'drift-trial') selectedTrack = selectedTrack || TRACK_IDS[0];
  renderMenu();
}));
window.addEventListener('resize', () => { if (racer) racer.world.resize(); });
window.addEventListener('keydown', (event) => {
  if (event.code === 'Escape' && menu.classList.contains('visible')) hideMenu();
  if (event.code === 'KeyR' && kit && !kit.paused) kit.restart();
});

kit = GGKit.create({
  slug: 'apexdrift',
  orientation: 'landscape',
  validateSave: validateSave,
  onPause,
  onResume,
  onRestart,
});
kit.registerPWA();

boot().catch((error) => {
  if (kit) kit.loader.hide();
  showError(error);
  if (!frameHandle) frameHandle = requestAnimationFrame(frame);
});
