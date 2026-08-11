import { createRacerWorld } from '../_shared/racer/engine.js';

const canvas = document.getElementById('scene');
const themeLabel = document.getElementById('theme');
const themeButton = document.getElementById('themeButton');
const settingsButton = document.getElementById('settingsButton');
const restartButton = document.getElementById('restartButton');
const sectorLabel = document.getElementById('sector');
const speedLabel = document.getElementById('speed');
const minimapCanvas = document.getElementById('minimap');
const minimapContext = minimapCanvas.getContext('2d');
const query = new URLSearchParams(location.search);
const requestedTheme = query.get('theme');
const theme = requestedTheme === 'nightcity' || requestedTheme === 'night-city' ? 'night-city' : 'desert';

let racer = null;
let trackData = null;
let minimapBounds = null;
let minimapClock = 0;
let simulationTime = 0;
let pausedByKit = false;

const playerState = {
  progress: 0.012,
  speed: 34,
  steering: 0,
  acceleration: 0,
  lateralG: 0,
  suspension: 0,
  brake: 0,
  boost: 0,
};
const rivalState = {
  progress: 0.932,
  speed: 31,
  steering: 0,
};
const framePacket = { carState: playerState, rivals: [rivalState] };

function pressed(code) {
  return kit.input.keyDown(code);
}

function readSteering() {
  let steering = 0;
  if (pressed('ArrowLeft') || pressed('KeyA')) steering -= 1;
  if (pressed('ArrowRight') || pressed('KeyD')) steering += 1;
  for (const pointer of kit.input.pointers.values()) {
    steering += pointer.x < window.innerWidth * 0.5 ? -0.8 : 0.8;
  }
  return Math.max(-1, Math.min(1, steering));
}

function updateShowcase(dt) {
  if (kit.paused) return;
  const steering = readSteering();
  const boost = pressed('Space') ? 1 : 0;
  const targetSpeed = boost ? 48 : 34;
  playerState.speed += (targetSpeed - playerState.speed) * Math.min(1, dt * 2.8);
  playerState.steering += (steering - playerState.steering) * Math.min(1, dt * 8);
  playerState.acceleration = (targetSpeed - playerState.speed) * 0.04;
  playerState.lateralG = playerState.steering * playerState.speed * 0.014;
  playerState.boost = boost;
  playerState.progress = (playerState.progress + playerState.speed * dt / trackData.width / 32) % 1;
  rivalState.speed = 31 + Math.sin(simulationTime * 0.72) * 1.8;
  rivalState.progress = (rivalState.progress + rivalState.speed * dt / trackData.width / 32) % 1;
  rivalState.steering = Math.sin(simulationTime * 1.7) * 0.22;
  simulationTime += dt;
}

function frameProvider(dt) {
  updateShowcase(dt);
  minimapClock += dt;
  if (minimapClock > 0.1) {
    minimapClock = 0;
    updateHud();
    drawMinimap();
  }
  return framePacket;
}

function updateHud() {
  const sector = racer.trackQueries.getSector(playerState.progress) + 1;
  sectorLabel.textContent = `SECTOR ${sector} / 3 · QUALITY ${racer.quality.tier === 2 ? 'SHOWCASE' : racer.quality.tier === 1 ? 'BALANCED' : 'LOW'}`;
  speedLabel.firstChild.textContent = String(Math.round(playerState.speed * 3.6)).padStart(3, '0');
}

function buildMinimapBounds() {
  const line = racer.minimap;
  const bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (let i = 0; i < line.length; i += 1) {
    bounds.minX = Math.min(bounds.minX, line[i].x);
    bounds.maxX = Math.max(bounds.maxX, line[i].x);
    bounds.minZ = Math.min(bounds.minZ, line[i].z);
    bounds.maxZ = Math.max(bounds.maxZ, line[i].z);
  }
  minimapBounds = bounds;
}

function minimapPoint(x, z, padding = 22) {
  const spanX = minimapBounds.maxX - minimapBounds.minX || 1;
  const spanZ = minimapBounds.maxZ - minimapBounds.minZ || 1;
  return {
    x: padding + (x - minimapBounds.minX) / spanX * (minimapCanvas.width - padding * 2),
    y: padding + (1 - (z - minimapBounds.minZ) / spanZ) * (minimapCanvas.height - padding * 2),
  };
}

function drawMinimap() {
  if (!minimapBounds) return;
  minimapContext.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);
  minimapContext.fillStyle = theme === 'night-city' ? 'rgba(11,20,43,.9)' : 'rgba(43,29,26,.76)';
  minimapContext.fillRect(0, 0, minimapCanvas.width, minimapCanvas.height);
  const line = racer.minimap;
  minimapContext.lineWidth = 7;
  minimapContext.strokeStyle = theme === 'night-city' ? '#31677d' : '#6f5a45';
  minimapContext.beginPath();
  for (let i = 0; i < line.length; i += 1) {
    const point = minimapPoint(line[i].x, line[i].z);
    if (i === 0) minimapContext.moveTo(point.x, point.y); else minimapContext.lineTo(point.x, point.y);
  }
  minimapContext.closePath();
  minimapContext.stroke();
  minimapContext.lineWidth = 2;
  minimapContext.strokeStyle = '#f4ead6';
  minimapContext.stroke();
  const player = racer.trackQueries.sampleRacingLine(playerState.progress);
  const p = minimapPoint(player.position.x, player.position.z);
  minimapContext.fillStyle = '#ffdf75';
  minimapContext.beginPath(); minimapContext.arc(p.x, p.y, 6, 0, Math.PI * 2); minimapContext.fill();
  const rival = racer.trackQueries.sampleRacingLine(rivalState.progress);
  const r = minimapPoint(rival.position.x, rival.position.z);
  minimapContext.fillStyle = '#5de9ef';
  minimapContext.beginPath(); minimapContext.arc(r.x, r.y, 4, 0, Math.PI * 2); minimapContext.fill();
}

function kitOnPause() {
  pausedByKit = true;
  if (racer) racer.world.setPaused(true);
}

function kitOnResume() {
  pausedByKit = false;
  if (racer) racer.world.setPaused(false);
}

function resetShowcase() {
  playerState.progress = 0.012;
  playerState.speed = 34;
  rivalState.progress = 0.932;
  simulationTime = 0;
  if (racer) racer.camera.snapToCar();
}

const kit = GGKit.create({
  slug: 'ggracer-demo',
  orientation: 'landscape',
  onPause: kitOnPause,
  onResume: kitOnResume,
  onRestart: resetShowcase,
});

async function boot() {
  kit.loader.show('GGRacer / Acceptance Run');
  try {
    kit.loader.progress(0.18);
    const response = await fetch('./track.json');
    trackData = await response.json();
    kit.loader.progress(0.42);
    racer = createRacerWorld({
      canvas,
      trackJSON: trackData,
      theme,
      timeOfDay: theme === 'night-city' ? 'night' : 'dusk',
      rivalCount: 1,
      ggkit: kit,
      paint: 0xd44738,
      accent: theme === 'night-city' ? 0x5de9ef : 0xf2c34e,
    });
    kit.loader.progress(0.82);
    buildMinimapBounds();
    themeLabel.textContent = theme === 'night-city' ? 'NIGHT CITY' : 'DESERT';
    themeButton.textContent = theme === 'night-city' ? 'Desert' : 'Night city';
    updateHud();
    drawMinimap();
    kit.loader.progress(1);
    kit.loader.hide();
    racer.world.start(frameProvider);
  } catch (error) {
    kit.loader.hide();
    const failure = document.createElement('div');
    failure.id = 'loadError';
    failure.textContent = `GGRacer failed to boot: ${error.message}`;
    document.body.appendChild(failure);
    throw error;
  }
}

themeButton.addEventListener('click', () => {
  location.href = `${location.pathname}?theme=${theme === 'night-city' ? 'desert' : 'nightcity'}`;
});
settingsButton.addEventListener('click', () => kit.openSettings());
restartButton.addEventListener('click', () => kit.restart());
window.addEventListener('resize', () => { if (racer) racer.world.resize(); });
boot();
