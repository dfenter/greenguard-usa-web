/* Kart Circuit Zero - preserved spline simulation with a GGRacer adapter. */
import { createRacerWorld } from '../_shared/racer/engine.js';

const TAU = Math.PI * 2;
const LAPS = 3;
const FIXED_DT = 1 / 120;
const GHOST_HZ = 10;
const MAX_GHOST_SAMPLES = 7200;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
const angleDelta = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
const pad2 = (v) => String(v).padStart(2, '0');
const formatTime = (seconds) => {
  const t = Math.max(0, Number(seconds) || 0);
  return `${pad2(Math.floor(t / 60))}:${(t % 60).toFixed(2).padStart(5, '0')}`;
};
const formatDelta = (seconds) => `${seconds >= 0 ? '+' : '-'}${Math.abs(seconds).toFixed(2)}`;
const hex = (v) => `#${Number(v).toString(16).padStart(6, '0')}`;

const canvas = document.getElementById('scene');
const ui = {
  title: document.getElementById('titleScreen'), race: document.getElementById('raceHud'), result: document.getElementById('resultScreen'),
  circuitGrid: document.getElementById('circuitGrid'), start: document.getElementById('startButton'), resultNext: document.getElementById('resultNext'), resultMenu: document.getElementById('resultMenu'),
  circuit: document.getElementById('circuitLabel'), lap: document.getElementById('lapValue'), time: document.getElementById('timeValue'), delta: document.getElementById('deltaValue'), speed: document.getElementById('speedValue'),
  coach: document.getElementById('coach'), position: document.getElementById('positionChip'), drift: document.getElementById('driftButton'), boostTier: document.getElementById('boostTier'), boostFill: document.getElementById('boostFill'), banner: document.getElementById('banner'), bannerTitle: document.getElementById('bannerTitle'), bannerSub: document.getElementById('bannerSub'), resultKicker: document.getElementById('resultKicker'), resultTitle: document.getElementById('resultTitle'), resultTime: document.getElementById('resultTime'), resultMedal: document.getElementById('resultMedal'), resultDetail: document.getElementById('resultDetail'), pause: document.getElementById('pauseButton'), livery: document.getElementById('liveryButton'),
};

function setTextIfChanged(el, value) {
  const text = String(value);
  if (el.textContent !== text) el.textContent = text;
}

const CIRCUITS = [
  {
    id: 'coastline-sprint', name: 'COASTLINE SPRINT', short: 'COAST 01', identity: 'Sea-wall speed and a lighthouse cutback.', seed: 7129,
    color: 0x38d8d5,
    gold: 82, silver: 95, bronze: 112, shortcut: .54, shortcutLane: 5.3, shortcutSkip: 170, pads: [.09, .30, .69, .88], gates: [.22, .77], cornerNotes: 'Long right, late hairpin, open sprint',
    controls: [[-60, -155], [155, -185], [345, -78], [390, 95], [270, 218], [45, 260], [-120, 205], [-305, 248], [-435, 120], [-450, -58], [-330, -190], [-145, -235]],
  },
  {
    id: 'canyon-switchbacks', name: 'CANYON SWITCHBACKS', short: 'CANYON 02', identity: 'Terracotta switchbacks under the stone bridge.', seed: 3511,
    color: 0xff9867,
    gold: 98, silver: 112, bronze: 130, shortcut: .67, shortcutLane: -5.2, shortcutSkip: 190, pads: [.13, .40, .60, .86], gates: [.28, .81], cornerNotes: 'Snap left, blind right, two switchbacks',
    controls: [[-30, -185], [170, -177], [320, -65], [205, 28], [350, 150], [220, 250], [35, 205], [-120, 315], [-335, 247], [-270, 92], [-432, -15], [-280, -130], [-370, -265], [-110, -328]],
  },
  {
    id: 'neon-night-loop', name: 'NEON NIGHT LOOP', short: 'NEON 03', identity: 'A violet midnight ring with a lit skyway.', seed: 9901,
    color: 0xc787ff,
    gold: 83, silver: 96, bronze: 114, shortcut: .45, shortcutLane: 5.3, shortcutSkip: 205, pads: [.10, .33, .54, .78, .93], gates: [.25, .72], cornerNotes: 'Banked loop, inside lift, neon hairpin',
    controls: [[-34, -292], [180, -260], [350, -138], [385, 45], [305, 205], [120, 285], [-80, 300], [-255, 218], [-360, 55], [-325, -125], [-185, -245], [12, -315]],
  },
  {
    id: 'circuit-zero', name: 'CIRCUIT ZERO', short: 'ZERO 04', identity: 'The showcase: a zero-core finale with no wasted corner.', seed: 44021,
    color: 0x71e7b4,
    gold: 108, silver: 123, bronze: 143, shortcut: .59, shortcutLane: -5.6, shortcutSkip: 230, pads: [.08, .26, .49, .70, .89], gates: [.18, .77], cornerNotes: 'Zero bend, split apex, final reveal',
    controls: [[0, -315], [232, -292], [392, -164], [302, -24], [478, 110], [342, 258], [95, 232], [8, 370], [-180, 276], [-412, 315], [-372, 128], [-508, -17], [-352, -178], [-224, -290]],
  },
];

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return {
    x: .5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    z: .5 * (2 * p1.z + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
  };
}

function buildSpline(def) {
  const controls = def.controls.map(([x, z]) => ({ x, z }));
  const count = 180;
  const points = [];
  for (let i = 0; i < count; i += 1) {
    const u = i / count;
    const base = Math.floor(u * controls.length);
    const t = u * controls.length - base;
    const p = catmull(controls[(base - 1 + controls.length) % controls.length], controls[base], controls[(base + 1) % controls.length], controls[(base + 2) % controls.length], t);
    p.y = Math.sin(u * TAU * 2 + def.seed * .001) * (def.id === 'canyon-switchbacks' ? 1.5 : 2.5);
    points.push(p);
  }
  let length = 0;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i], next = points[(i + 1) % points.length], prev = points[(i - 1 + points.length) % points.length];
    const tx = next.x - prev.x, tz = next.z - prev.z, mag = Math.hypot(tx, tz) || 1;
    p.tangent = { x: tx / mag, z: tz / mag };
    p.normal = { x: -p.tangent.z, z: p.tangent.x };
    p.distance = length;
    length += Math.hypot(next.x - p.x, next.z - p.z);
  }
  return { ...def, points, length, halfWidth: 8.7 };
}

const TRACKS = CIRCUITS.map(buildSpline);

function sampleTrack(track, distance) {
  return sampleTrackInto(track, distance, { tangent: {}, normal: {} });
}
function sampleTrackInto(track, distance, out) {
  const s = ((distance % track.length) + track.length) % track.length;
  const raw = s / track.length * track.points.length;
  const i = Math.floor(raw) % track.points.length;
  const f = raw - Math.floor(raw);
  const a = track.points[i], b = track.points[(i + 1) % track.points.length];
  const tx = lerp(a.tangent.x, b.tangent.x, f), tz = lerp(a.tangent.z, b.tangent.z, f), mag = Math.hypot(tx, tz) || 1;
  const tangent = out.tangent || (out.tangent = {}), normal = out.normal || (out.normal = {});
  tangent.x = tx / mag; tangent.z = tz / mag;
  normal.x = -tangent.z; normal.z = tangent.x;
  out.x = lerp(a.x, b.x, f); out.y = lerp(a.y, b.y, f); out.z = lerp(a.z, b.z, f); out.distance = s;
  return out;
}

function forwardBetween(previous, current, target, length) {
  if (current >= previous) return target > previous && target <= current;
  return target > previous || target <= current;
}
function wrappedDistance(a, b, length) {
  const delta = Math.abs(a - b) % length;
  return Math.min(delta, length - delta);
}
const MEDAL_RANK = { '': 0, BRONZE: 1, SILVER: 2, GOLD: 3 };
const LIVERIES = [{ body: 0x42d7cf, accent: 0xffe29a, name: 'SEAFOAM' }, { body: 0xff7b62, accent: 0xffefb0, name: 'SUNSET' }, { body: 0xa984ff, accent: 0x7af8ed, name: 'VIOLET' }];

function validTrace(trace) {
  if (!Array.isArray(trace) || trace.length < 2 || trace.length > MAX_GHOST_SAMPLES) return false;
  let previousTime = -1;
  let previousDistance = -1;
  for (const p of trace) {
    if (!Array.isArray(p) || p.length !== 4 || !p.every(Number.isFinite) || p[0] < previousTime || p[1] < previousDistance || Math.abs(p[2]) > 1.01 || (p[3] !== 0 && p[3] !== 1)) return false;
    previousTime = p[0];
    previousDistance = p[1];
  }
  return true;
}
function validSave(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.v !== 2 || !value.circuits || typeof value.circuits !== 'object' || Array.isArray(value.circuits)) return false;
  for (const key of Object.keys(value.circuits)) {
    if (!TRACKS.some((t) => t.id === key)) return false;
    const r = value.circuits[key];
    if (!r || typeof r !== 'object' || Array.isArray(r) || !Object.hasOwn(MEDAL_RANK, r.medal || '') || (r.best != null && (!Number.isFinite(r.best) || r.best < 0 || r.best > 600))) return false;
    if (r.ghost != null && !validTrace(r.ghost)) return false;
  }
  if (value.livery != null && (!Number.isInteger(value.livery) || value.livery < 0 || value.livery >= LIVERIES.length)) return false;
  if (value.cupBest != null && (!Number.isFinite(value.cupBest) || value.cupBest < 0 || value.cupBest > 2400)) return false;
  return true;
}

const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const kit = window.GGKit.create({
  slug: 'kart-circuit-zero', orientation: 'any', validateSave: function (s) { return !!s && typeof s === 'object' && !Array.isArray(s); },
  onPause() { if (racer) racer.world.setPaused(true); clearTransientUi(); queueTransient('PAUSED · CLOSE SETTINGS TO RESUME', 'coach', 1400); },
  onResume() { if (racer) racer.world.setPaused(false); if (phase === 'race') queueTransient('STEER LEFT OR RIGHT · HOLD DRIFT', 'coach', 2600); },
  onRestart() { if (!kit.paused && mode !== 'menu') beginRace(activeMode, activeCircuit, true); },
});
if (reducedMotion) kit.juice.enabled = false;
kit.audio.register({
  menu: 'assets/audio/menu.mp3', engine: 'assets/audio/engine.mp3', engineLow: 'assets/audio/engine.mp3', engineHigh: 'assets/audio/engine.mp3', drift: 'assets/audio/drift.mp3', surface: 'assets/audio/drift.mp3', boost: 'assets/audio/boost.mp3', collision: 'assets/audio/collision.mp3', checkpoint: 'assets/audio/checkpoint.mp3', ui: 'assets/audio/ui.mp3', clear: 'assets/audio/clear.mp3',
});

const DEFAULT_SAVE = { v: 2, circuits: {}, livery: 0, cupBest: 0 };
let save = kit.save.get(null);
if (!validSave(save)) save = JSON.parse(JSON.stringify(DEFAULT_SAVE));
function persist() { kit.save.set(save); }
function recordFor(track) { if (!save.circuits[track.id]) save.circuits[track.id] = { medal: '', best: 0, ghost: null }; return save.circuits[track.id]; }
function bestMedal(track) { return recordFor(track).medal || ''; }
function unlocked(index) {
  if (index <= 0) return true;
  if (window.__kc && window.__kc.forceCircuit != null) return true;
  for (let i = 0; i < index; i += 1) if (MEDAL_RANK[bestMedal(TRACKS[i])] < (i === 0 ? 1 : 2)) return false;
  return true;
}

const PROBE_STATE = window.__kc && window.__kc.state ? window.__kc.state : {};
window.__kc = window.__kc || { state: PROBE_STATE, forceCircuit: null, forceMode: null };
window.__kc.state = PROBE_STATE;
let mode = 'menu';
let activeMode = 'timeTrial';
let activeCircuit = 0;
let phase = 'menu';
let cupLeg = 0;
let cupTimes = [];
let forceSignature = '';
let countdownRemaining = 3;
let lastCountdownBeat = 3;
let wallSfxCooldown = 0;
let driftSfxCooldown = 0;
let surfaceSfxCooldown = 0;
let engineSfxCooldown = 0;
let bootForceCircuit = new URLSearchParams(location.search).get('forceCircuit');
let bootForceMode = new URLSearchParams(location.search).get('forceMode');

function normalizeCircuit(value) {
  if (value == null || value === '') return null;
  if (Number.isFinite(Number(value))) return clamp(Math.floor(Number(value)), 0, TRACKS.length - 1);
  const found = TRACKS.findIndex((t) => t.id === String(value).toLowerCase() || t.short.toLowerCase() === String(value).toLowerCase());
  return found >= 0 ? found : null;
}
function normalizeMode(value) {
  const v = String(value || '').toLowerCase().replace(/[-_ ]/g, '');
  if (v === 'timetrial' || v === 'time') return 'timeTrial';
  if (v === 'ghostrace' || v === 'ghost') return 'ghostRace';
  if (v === 'cup' || v === 'circuitcup') return 'cup';
  if (v === 'menu' || v === 'title') return 'menu';
  return null;
}

let racer = null;
let racerTrackJSON = null;
let racerBuildToken = 0;
let track = TRACKS[0];
const racerPlayerSample = { tangent: {}, normal: {} };
const racerGhostSample = { tangent: {}, normal: {} };
const racerFrame = {
  carState: {
    position: { x: 0, y: 0, z: 0 },
    progress: 0,
    speed: 0,
    steering: 0,
    acceleration: 0,
    lateralG: 0,
    suspension: 0,
    roll: 0,
    pitch: 0,
    brake: 0,
    boost: 0,
    yaw: 0,
  },
  rivals: [{
    position: { x: 0, y: 0, z: 0 },
    progress: 0,
    speed: 0,
    steering: 0,
    acceleration: 0,
    lateralG: 0,
    suspension: 0,
    roll: 0,
    pitch: 0,
    boost: 0,
    yaw: 0,
  }],
};

function yawForTangent(tangent) {
  return Math.atan2(tangent.x, tangent.z);
}

function setRacerState(target, vehicle, sample, isGhost) {
  const jumpHeight = vehicle.jump > 0
    ? Math.sin((.72 - vehicle.jump) / .72 * Math.PI) * 4
    : 0;
  const lateralG = clamp(vehicle.lateralVelocity * .16 + vehicle.headingVelocity * 1.6, -4, 4);
  const roll = clamp(
    -vehicle.lateralVelocity * .022
      - vehicle.headingVelocity * .08
      - vehicle.steer * (vehicle.driftHeld ? .16 : .08),
    -.34,
    .34,
  );
  const suspension = clamp(
    Math.abs(vehicle.curvature) * .72
      + Math.abs(vehicle.lateralVelocity) * .006
      + (vehicle.jump > 0 ? .04 : 0),
    0,
    .22,
  );
  target.position.x = sample.x + sample.normal.x * vehicle.lateral;
  target.position.y = sample.y + jumpHeight;
  target.position.z = sample.z + sample.normal.z * vehicle.lateral;
  target.progress = (vehicle.s / track.length + 1) % 1;
  target.yaw = yawForTangent(sample.tangent) + vehicle.heading;
  target.speed = vehicle.speed;
  target.steering = vehicle.steer;
  target.acceleration = clamp(vehicle.speed / 70, 0, 1);
  target.lateralG = lateralG;
  target.suspension = suspension;
  target.roll = isGhost ? roll * .7 : roll;
  target.pitch = vehicle.jump > 0 ? -.08 : 0;
  target.boost = vehicle.boost;
}

function tintGhostActor(actor) {
  if (!actor || !actor.root) return;
  actor.root.name = 'saved best-run ghost';
  actor.root.traverse((node) => {
    if (!node.isMesh || !node.material) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      material.transparent = true;
      material.opacity = Math.min(Number.isFinite(material.opacity) ? material.opacity : 1, .34);
      material.depthWrite = false;
      if (material.color) material.color.setHex(0x83efff);
      if (material.emissive) material.emissive.setHex(0x2c8f9f);
      if ('emissiveIntensity' in material) material.emissiveIntensity = Math.max(Number(material.emissiveIntensity) || 0, .7);
      material.toneMapped = false;
    }
  });
}

function setGhostVisibility() {
  if (!racer || !racer.world.rivals[0]) return;
  racer.world.rivals[0].root.visible = mode !== 'menu' && validTrace(ghostTrace);
}

function updateRacerWorld(dt) {
  if (!racer || !track) return;
  setRacerState(racerFrame.carState, player, sampleTrackInto(track, player.s, racerPlayerSample), false);
  if (validTrace(ghostTrace)) {
    setRacerState(racerFrame.rivals[0], ghost, sampleTrackInto(track, ghost.s, racerGhostSample), true);
  } else {
    racerFrame.rivals[0].progress = racerFrame.carState.progress;
    racerFrame.rivals[0].position.x = racerFrame.carState.position.x;
    racerFrame.rivals[0].position.y = racerFrame.carState.position.y;
    racerFrame.rivals[0].position.z = racerFrame.carState.position.z;
    racerFrame.rivals[0].speed = 0;
    racerFrame.rivals[0].boost = 0;
  }
  racer.world.update(racerFrame, dt);
  setGhostVisibility();
}

async function buildWorld(index) {
  track = TRACKS[clamp(index, 0, TRACKS.length - 1)];
  const token = ++racerBuildToken;
  if (racer) racer.world.dispose();
  racer = null;
  racerTrackJSON = null;
  const response = await fetch(`./tracks/${track.id}.json`);
  if (!response.ok) throw new Error(`Track data failed to load: ${track.id}`);
  const authored = await response.json();
  if (token !== racerBuildToken) return;
  racerTrackJSON = authored;
  const livery = LIVERIES[save.livery] || LIVERIES[0];
  racer = createRacerWorld({
    canvas,
    trackJSON: authored,
    theme: authored.theme || 'coastal',
    timeOfDay: authored.timeOfDay || (authored.theme === 'night-city' ? 'night' : 'dusk'),
    seed: track.seed,
    ggkit: kit,
    rivalCount: 1,
    paint: livery.body,
    accent: livery.accent,
    reducedMotion,
    carName: 'Kart Circuit Zero player',
  });
  tintGhostActor(racer.world.rivals[0]);
  racer.world.resize();
  updateRacerWorld(1 / 60);
  racer.world.render();
}

function emitFx(event) {
  if (!racer || reducedMotion) return;
  if (event === 'wall' || event === 'respawn') racer.world.fx.impact(event === 'respawn' ? 4 : 2.5);
}
function newVehicle() {
  return { s: 0, previousS: 0, totalDistance: 0, lateral: 0, lateralVelocity: 0, heading: 0, headingVelocity: 0, curvature: 0, speed: 0, lap: 1, lapsCompleted: 0, time: 0, timeBonus: 0, driftCharge: 0, boost: 0, driftHeld: false, wall: 0, offroad: 0, offCourseTime: 0, checkpointS: 0, checkpointLateral: 0, jump: 0, recordClock: 0, trace: [], finished: false, lastEvent: '', eventPulse: 0, wheelSpin: 0, steer: 0, lastTier: 'BLUE', collisionCooldown: 0, triggered: Object.create(null) };
}
let player = newVehicle();
let ghost = newVehicle();
let ghostTrace = null;
let accumulator = 0;
let lastFrame = 0;
let firstInput = false;
let tutorialElapsed = 0;
let tutorialStep = -1;
let tutorialStartDelay = 0;
let lastDisplayed = { time: '', lap: '', delta: '', speed: '', tier: '', circuit: '', mode: '' };
const physicsAheadSample = { tangent: {}, normal: {} };
const physicsBehindSample = { tangent: {}, normal: {} };

let transientQueue = [];
let transientActive = false;
let transientToken = 0;
let transientHoldTimer = 0;
let transientFadeTimer = 0;
const EVENT_TOASTS = {
  gate: 'TIME +2.2s',
  shortcut: 'SHORTCUT',
  'boost-blue': 'BLUE BOOST',
  'boost-orange': 'ORANGE BOOST',
  'boost-purple': 'PURPLE BOOST',
  respawn: 'CHECKPOINT',
};

function clearTransientUi() {
  transientToken += 1;
  window.clearTimeout(transientHoldTimer);
  window.clearTimeout(transientFadeTimer);
  transientQueue = [];
  transientActive = false;
  ui.coach.classList.remove('visible', 'event', 'fade');
  ui.coach.classList.add('hidden');
}

function showNextTransient() {
  if (!transientQueue.length) {
    transientActive = false;
    ui.coach.classList.remove('visible', 'event', 'fade');
    ui.coach.classList.add('hidden');
    return;
  }
  const item = transientQueue.shift();
  const token = ++transientToken;
  transientActive = true;
  setTextIfChanged(ui.coach, item.text);
  ui.coach.classList.toggle('event', item.kind === 'event');
  ui.coach.classList.remove('hidden', 'fade');
  ui.coach.classList.add('visible');
  transientHoldTimer = window.setTimeout(() => {
    if (token !== transientToken) return;
    ui.coach.classList.remove('visible');
    transientFadeTimer = window.setTimeout(() => {
      if (token !== transientToken) return;
      ui.coach.classList.add('hidden');
      transientActive = false;
      showNextTransient();
    }, reducedMotion ? 1 : 180);
  }, item.hold);
}

function queueTransient(text, kind = 'coach', hold = 3000) {
  if (!text) return;
  const last = transientQueue[transientQueue.length - 1];
  if (last && last.text === text && last.kind === kind) return;
  const maxHold = kind === 'event' ? 1000 : 3400;
  transientQueue.push({ text, kind, hold: clamp(Number(hold) || maxHold, 150, maxHold) });
  if (transientQueue.length > 4) transientQueue.shift();
  if (!transientActive) showNextTransient();
}

function queueEventToast(event) {
  if (phase === 'race' && EVENT_TOASTS[event]) queueTransient(EVENT_TOASTS[event], 'event', 780);
}

function setTutorialStep(step, text) {
  if (tutorialStep === step) return;
  tutorialStep = step;
  queueTransient(text, 'coach', 3000);
}

function activeTrace() { const r = recordFor(track); return validTrace(r.ghost) ? r.ghost : null; }
function resetVehicle(v) { Object.assign(v, newVehicle()); }
function raceTime(v) { return Math.max(0, v.time - v.timeBonus); }
function ghostInputAt(trace, time) {
  if (!validTrace(trace) || trace.length < 2) return { steer: 0, drift: false };
  if (time >= trace[trace.length - 1][0]) { const p = trace[trace.length - 1]; return { steer: p[2], drift: p[3] === 1 }; }
  let lo = 0, hi = trace.length - 1;
  while (lo + 1 < hi) { const mid = (lo + hi) >> 1; if (trace[mid][0] <= time) lo = mid; else hi = mid; }
  const a = trace[lo], b = trace[hi], f = clamp((time - a[0]) / (b[0] - a[0] || 1), 0, 1);
  return { steer: lerp(a[2], b[2], f), drift: f < .5 ? a[3] === 1 : b[3] === 1 };
}
function triggerOnce(v, key, lap) { const id = `${key}-${lap}`; if (v.triggered[id]) return false; v.triggered[id] = true; return true; }
function releaseBoost(v) {
  if (v.driftCharge < .12) { v.driftCharge = 0; return; }
  const tier = v.driftCharge >= 1.28 ? 'PURPLE' : v.driftCharge >= .62 ? 'ORANGE' : 'BLUE';
  const strength = tier === 'PURPLE' ? 1.72 : tier === 'ORANGE' ? 1.25 : .84;
  v.boost = Math.max(v.boost, strength);
  v.lastEvent = `boost-${tier.toLowerCase()}`; v.eventPulse = .42; v.lastTier = tier; v.driftCharge = 0;
}
function stepVehicle(v, steer, driftHeld, dt, isGhost = false) {
  if (v.finished) return;
  v.lastEvent = ''; v.eventPulse = Math.max(0, v.eventPulse - dt); v.time += dt; v.previousS = v.s; v.steer = clamp(steer, -1, 1); v.driftHeld = !!driftHeld; v.collisionCooldown = Math.max(0, v.collisionCooldown - dt);
  const ahead = sampleTrackInto(track, v.s + 12, physicsAheadSample), behind = sampleTrackInto(track, v.s - 12, physicsBehindSample);
  const roadTurn = angleDelta(yawForTangent(ahead.tangent) - yawForTangent(behind.tangent));
  v.curvature = roadTurn / 24;
  const cornerDemand = Math.abs(v.curvature) * v.speed;
  const wasDrifting = v.driftCharge > 0;
  const drifting = v.driftHeld && Math.abs(v.steer) > .12 && v.speed > 18 && (cornerDemand > .06 || Math.abs(v.lateralVelocity) > 3.5);
  if (drifting) {
    v.driftCharge = clamp(v.driftCharge + dt * (1.08 + Math.abs(v.steer) * .35), 0, 1.8);
    v.lateralVelocity += v.steer * (24 + v.speed * .23) * dt;
  } else if (wasDrifting) releaseBoost(v);
  const targetHeading = clamp(v.steer * (drifting ? .52 : .34), -.58, .58);
  v.headingVelocity += ((targetHeading - v.heading) * (drifting ? 2.2 : 3.8) - v.headingVelocity * (drifting ? .9 : 2.6)) * dt;
  v.heading += v.headingVelocity * dt;
  v.heading = clamp(v.heading, -.68, .68);
  v.lateralVelocity += (Math.sin(v.heading) * v.speed * (drifting ? 1.25 : .82) + v.steer * (drifting ? 7 : 4.5)) * dt;
  v.lateralVelocity *= Math.pow(drifting ? .91 : .78, dt * 60);
  v.lateral += v.lateralVelocity * dt;
  const cornerDrag = 1 - clamp(Math.abs(v.steer) * (drifting ? .05 : .025) + cornerDemand * .0018, 0, .16);
  const boostTarget = v.boost > 0 ? 30 + v.boost * 22 : 0;
  const targetSpeed = clamp((drifting ? 54 : 70) - cornerDemand * 7 + boostTarget, 28, 118);
  v.speed = damp(v.speed, targetSpeed, drifting ? 2.1 : 3.8, dt) * cornerDrag;
  v.boost = Math.max(0, v.boost - dt * (v.boost > 1.3 ? .72 : .95));
  const edge = track.halfWidth - 1.05;
  v.wall = 0;
  if (Math.abs(v.lateral) > edge) {
    const penetration = Math.abs(v.lateral) - edge;
    v.wall = clamp(penetration / 2.5, 0, 1);
    v.speed *= Math.pow(.16, dt * (1.1 + v.wall * 2.6));
    v.lateralVelocity *= -.22;
    v.headingVelocity *= -.38;
    v.heading *= .58;
    v.lateral = clamp(v.lateral, -track.halfWidth - 2.2, track.halfWidth + 2.2);
    if (v.wall > .28 && v.collisionCooldown <= 0) { v.lastEvent = 'wall'; v.eventPulse = .42; v.collisionCooldown = .22; }
  }
  v.offroad = Math.max(0, Math.abs(v.lateral) - track.halfWidth) / 3;
  if (v.offroad > 0) v.speed *= Math.pow(.24, dt * v.offroad);
  if (v.offroad > .08) v.offCourseTime += dt; else v.offCourseTime = Math.max(0, v.offCourseTime - dt * 2);
  if (v.offCourseTime > 1.15) {
    v.s = v.checkpointS; v.previousS = v.s; v.lateral = v.checkpointLateral; v.lateralVelocity = 0; v.heading = 0; v.headingVelocity = 0; v.speed = 31; v.boost = 0; v.jump = 0; v.offCourseTime = 0; v.lastEvent = 'respawn'; v.eventPulse = .8;
  }
  const travel = Math.max(0, v.speed * dt);
  v.s += travel; v.totalDistance += travel;
  if (v.s >= track.length) v.s -= track.length;
  const crossedFinish = v.previousS > track.length * .82 && v.s < track.length * .18 && travel > 0;
  if (crossedFinish && triggerOnce(v, 'lap', v.lapsCompleted + 1)) {
    v.lapsCompleted += 1; v.lap = v.lapsCompleted + 1; v.checkpointS = 0; v.checkpointLateral = 0; v.lastEvent = v.lapsCompleted >= LAPS ? 'finish' : 'lap'; v.eventPulse = .6;
    if (v.lapsCompleted >= LAPS) v.finished = true;
  }
  const lap = Math.max(1, Math.min(LAPS, v.lap));
  for (let i = 0; i < track.pads.length; i += 1) {
    const padS = track.length * track.pads[i];
    if (forwardBetween(v.previousS, v.s, padS, track.length) && Math.abs(v.lateral) < track.halfWidth * .72 && triggerOnce(v, `pad-${i}`, lap)) { v.boost = Math.max(v.boost, .95); v.lastEvent = 'pad'; v.eventPulse = .34; }
  }
  for (let i = 0; i < track.gates.length; i += 1) {
    const gateS = track.length * track.gates[i];
    if (forwardBetween(v.previousS, v.s, gateS, track.length) && Math.abs(v.lateral) < track.halfWidth * .82 && triggerOnce(v, `gate-${i}`, lap)) { v.timeBonus += 2.2; v.checkpointS = gateS; v.checkpointLateral = clamp(v.lateral, -track.halfWidth * .58, track.halfWidth * .58); v.lastEvent = 'gate'; v.eventPulse = .42; }
  }
  const gatePostHit = track.gates.some((fraction) => wrappedDistance(v.s, track.length * fraction, track.length) < 1.55 && Math.abs(v.lateral) > track.halfWidth * .74);
  if (gatePostHit && v.collisionCooldown <= 0) { v.wall = Math.max(v.wall, .62); v.speed *= .62; v.lateralVelocity *= -.28; v.lastEvent = 'wall'; v.eventPulse = .5; v.collisionCooldown = .24; }
  const rampS = track.length * track.shortcut;
  if (forwardBetween(v.previousS, v.s, rampS, track.length) && Math.abs(v.lateral - track.shortcutLane) < 2.6 && triggerOnce(v, 'ramp', lap)) { v.s = (v.s + track.shortcutSkip) % track.length; v.totalDistance += track.shortcutSkip; v.jump = .72; v.boost = Math.max(v.boost, 1.1); v.lastEvent = 'shortcut'; v.eventPulse = .7; }
  if (v.jump > 0) {
    const wasAirborne = v.jump;
    v.jump = Math.max(0, v.jump - dt);
    if (wasAirborne > 0 && v.jump === 0) { v.lastEvent = 'landing'; v.eventPulse = .3; }
  }
  v.wheelSpin += v.speed * dt * 1.9;
  if (!isGhost) {
    v.recordClock += dt;
    if (v.recordClock >= 1 / GHOST_HZ && v.trace.length < MAX_GHOST_SAMPLES) { v.recordClock -= 1 / GHOST_HZ; v.trace.push([Number(v.time.toFixed(3)), Number(v.totalDistance.toFixed(2)), Number(v.steer.toFixed(3)), v.driftHeld ? 1 : 0]); }
  }
}

const pointerZones = new Map();
function readInput() {
  let steer = 0;
  if (kit.input.keyDown('ArrowLeft') || kit.input.keyDown('KeyA')) steer -= 1;
  if (kit.input.keyDown('ArrowRight') || kit.input.keyDown('KeyD')) steer += 1;
  let drift = kit.input.keyDown('Space') || kit.input.keyDown('ShiftLeft') || kit.input.keyDown('ShiftRight');
  try {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = Array.from(pads || []).find((item) => item && item.connected);
    if (pad) {
      const axis = Number.isFinite(pad.axes[0]) && Math.abs(pad.axes[0]) > .14 ? pad.axes[0] : 0;
      const dpad = (pad.buttons[14]?.pressed ? -1 : 0) + (pad.buttons[15]?.pressed ? 1 : 0);
      steer = Math.abs(axis) > 0 ? clamp(axis, -1, 1) : dpad;
      drift = drift || !!pad.buttons[0]?.pressed || Number(pad.buttons[7]?.value || 0) > .28 || !!pad.buttons[6]?.pressed;
    }
  } catch (error) {}
  for (const [pointerId, zone] of pointerZones) {
    const p = kit.input.pointers.get(pointerId);
    if (!p) continue;
    if (zone === 'steer') steer = clamp((p.x - p.startX) / 120, -1, 1);
    if (zone === 'drift') drift = true;
  }
  if (steer || drift) firstInput = true;
  return { steer, drift };
}

function claimPointer(event, zone) {
  pointerZones.set(event.pointerId, zone);
  let p = kit.input.pointers.get(event.pointerId);
  if (!p) { p = { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, downAt: performance.now(), zone: null }; kit.input.pointers.set(event.pointerId, p); }
  p.zone = zone; p.startX = event.clientX; p.x = event.clientX;
  queueMicrotask(() => {
    const current = kit.input.pointers.get(event.pointerId);
    if (current) { current.zone = zone; current.startX = event.clientX; current.x = event.clientX; }
  });
}
function clearPointer(event) {
  pointerZones.delete(event.pointerId);
  const p = kit.input.pointers.get(event.pointerId);
  if (p) p.zone = null;
}
canvas.addEventListener('pointerdown', (event) => {
  if (phase === 'race' && event.clientX < innerWidth * .66) {
    claimPointer(event, 'steer');
    try { canvas.setPointerCapture(event.pointerId); } catch (error) {}
  }
});
ui.drift.addEventListener('pointerdown', (event) => { if (phase === 'race') { claimPointer(event, 'drift'); ui.drift.classList.add('held'); try { ui.drift.setPointerCapture(event.pointerId); } catch (error) {} } });
['pointerup', 'pointercancel', 'pointerleave'].forEach((type) => ui.drift.addEventListener(type, (event) => { clearPointer(event); ui.drift.classList.remove('held'); }));
['pointerup', 'pointercancel'].forEach((type) => canvas.addEventListener(type, clearPointer));
canvas.addEventListener('pointermove', (event) => { const p = kit.input.pointers.get(event.pointerId); if (p && pointerZones.get(event.pointerId) === 'steer') p.x = event.clientX; });
window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyR' && !kit.paused) kit.restart();
  if (event.code === 'Enter' && mode === 'result') ui.resultNext.click();
  if (/^Digit[1-4]$/.test(event.code)) {
    const nextCircuit = Number(event.code.slice(-1)) - 1;
    if (unlocked(nextCircuit)) {
      activeCircuit = nextCircuit;
      if (mode === 'menu') { renderCircuitCards(); publishProbe(); }
      else if (mode === 'result' && activeMode !== 'cup') beginRace(activeMode, activeCircuit, false);
    }
  }
  if (['ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
});

function updateTutorial(dt) {
  if (phase !== 'race' || tutorialElapsed > 62 || player.lapsCompleted > 0) {
    return;
  }
  if (tutorialStartDelay > 0) {
    tutorialStartDelay = Math.max(0, tutorialStartDelay - dt);
    return;
  }
  tutorialElapsed += dt;
  if (!firstInput) {
    setTutorialStep(0, 'STEER LEFT OR RIGHT · FOLLOW THE APEX');
  } else if (player.driftCharge < .05 && tutorialElapsed < 26) {
    setTutorialStep(1, 'HOLD DRIFT THROUGH THE APEX');
  } else if (player.driftCharge >= .05) {
    setTutorialStep(2, 'RELEASE AFTER THE APEX FOR BOOST');
  } else {
    setTutorialStep(3, 'APEX AHEAD · HOLD YOUR LINE');
  }
}

function announce(title, sub, color) {
  setTextIfChanged(ui.bannerTitle, title); setTextIfChanged(ui.bannerSub, sub); ui.banner.style.color = color || '#f4fbff'; ui.banner.classList.remove('show'); void ui.banner.offsetWidth; ui.banner.classList.add('show');
}
function raceStarted() { kit.audio.stopMusic(120); kit.audio.music('engine', 250); announce('GO', 'HOLD THE LINE', hex(track.color)); }
function showMenu() {
  mode = 'menu'; phase = 'menu'; pointerZones.clear(); clearTransientUi(); kit.audio.stopMusic(160); kit.audio.music('menu', 220); ui.title.classList.remove('hidden'); ui.race.classList.add('hidden'); ui.result.classList.add('hidden'); renderCircuitCards(); setGhostVisibility(); buildWorld(activeCircuit); publishProbe();
}
function startCup() { cupLeg = 0; cupTimes = []; beginRace('cup', 0, false); }
function beginRace(selectedMode, circuitIndex, restart) {
  activeMode = selectedMode; mode = selectedMode; activeCircuit = clamp(circuitIndex, 0, TRACKS.length - 1); phase = 'countdown'; cupLeg = selectedMode === 'cup' ? cupLeg : 0;
  pointerZones.clear(); clearTransientUi(); kit.audio.stopMusic(120); buildWorld(activeCircuit); resetVehicle(player); resetVehicle(ghost); ghostTrace = activeMode === 'ghostRace' || activeMode === 'timeTrial' ? activeTrace() : null; setGhostVisibility(); countdownRemaining = 3; lastCountdownBeat = 3; wallSfxCooldown = 0; driftSfxCooldown = 0; surfaceSfxCooldown = 0; engineSfxCooldown = 0; tutorialElapsed = 0; tutorialStep = -1; tutorialStartDelay = reducedMotion ? .4 : .95; firstInput = false;
  ui.title.classList.add('hidden'); ui.result.classList.add('hidden'); ui.race.classList.remove('hidden');
  announce('3', 'GET READY', '#ffffff'); updateHUD(); publishProbe();
}
function medalFor(time, track) { return time <= track.gold ? 'GOLD' : time <= track.silver ? 'SILVER' : time <= track.bronze ? 'BRONZE' : ''; }
function saveRun() {
  const result = recordFor(track), time = raceTime(player), old = result.best || 0, isBest = !old || time < old;
  const medal = medalFor(time, track);
  if (MEDAL_RANK[medal] > MEDAL_RANK[result.medal || '']) result.medal = medal;
  if (isBest) { result.best = time; result.ghost = validTrace(player.trace) ? player.trace.slice(0, MAX_GHOST_SAMPLES) : null; }
  persist(); return { time, medal, isBest };
}
function finishRace() {
  if (phase !== 'race') return;
  phase = 'result'; clearTransientUi(); kit.audio.stopMusic(200); kit.audio.sfx('clear'); kit.juice.shake(2.2, 260); kit.juice.hitStop(55);
  const result = saveRun();
  let detail = result.isBest ? 'NEW BEST. This run is now your saved ghost.' : 'Your saved best ghost stays on the line for the next run.';
  let title = result.medal ? `${result.medal} MEDAL` : 'KEEP PUSHING';
  let kicker = 'CIRCUIT CLEAR';
  if (activeMode === 'cup') {
    cupTimes.push(result.time);
    if (cupLeg < TRACKS.length - 1) { kicker = `CUP LEG ${cupLeg + 1} / ${TRACKS.length}`; title = 'LEG COMPLETE'; detail = `Cumulative cup time ${formatTime(cupTimes.reduce((a, b) => a + b, 0))}. Next up: ${TRACKS[cupLeg + 1].name}.`; }
    else { const total = cupTimes.reduce((a, b) => a + b, 0); const rivals = [402, 446, 485].map((base, i) => base + i * 8); const place = 1 + rivals.filter((v) => total > v).length; kicker = 'CIRCUIT CUP COMPLETE'; title = place === 1 ? 'CUP CHAMPION' : `P${place} OVERALL`; detail = `Four-circuit total ${formatTime(total)}. Placement is cumulative across every clean split.`; if (!save.cupBest || total < save.cupBest) save.cupBest = total; persist(); }
  }
  setTextIfChanged(ui.resultKicker, kicker); setTextIfChanged(ui.resultTitle, title); setTextIfChanged(ui.resultTime, formatTime(result.time)); setTextIfChanged(ui.resultMedal, result.medal ? `${result.medal} MEDAL${result.isBest ? '  ·  NEW BEST' : ''}` : 'MEDAL TIME MISSED'); setTextIfChanged(ui.resultDetail, detail); ui.result.classList.remove('hidden'); publishProbe();
}
function stepSimulation(dt) {
  if (phase === 'countdown') {
    countdownRemaining = Math.max(0, countdownRemaining - dt);
    const beat = Math.ceil(countdownRemaining);
    if (beat > 0 && beat < lastCountdownBeat) { lastCountdownBeat = beat; announce(String(beat), 'GET READY', '#ffffff'); }
    if (countdownRemaining <= 0) { phase = 'race'; raceStarted(); }
    return;
  }
  if (phase !== 'race') return;
  const input = readInput();
  stepVehicle(player, input.steer, input.drift, dt, false);
  if (validTrace(ghostTrace) && !ghost.finished) { const ghostInput = ghostInputAt(ghostTrace, ghost.time); stepVehicle(ghost, ghostInput.steer, ghostInput.drift, dt, true); }
  updateTutorial(dt);
  driftSfxCooldown = Math.max(0, driftSfxCooldown - dt);
  surfaceSfxCooldown = Math.max(0, surfaceSfxCooldown - dt);
  engineSfxCooldown = Math.max(0, engineSfxCooldown - dt);
  if (engineSfxCooldown <= 0 && player.speed > 12) {
    const high = player.speed > 58;
    kit.audio.sfx(high ? 'engineHigh' : 'engineLow', { volume: high ? .045 : .035, rate: .78 + player.speed / 88 });
    engineSfxCooldown = .42;
  }
  if (player.driftHeld && Math.abs(player.steer) > .2 && player.speed > 18 && driftSfxCooldown <= 0) { kit.audio.sfx('drift', { volume: .18, rate: .9 + player.driftCharge * .16 }); driftSfxCooldown = .3; }
  if (player.offroad > .08 && surfaceSfxCooldown <= 0) { kit.audio.sfx('surface', { volume: .11, rate: .62 + player.offroad * .18 }); surfaceSfxCooldown = .34; }
  if (player.lastEvent && !['wall', 'respawn', 'landing'].includes(player.lastEvent)) { queueEventToast(player.lastEvent); emitFx(player.lastEvent); if (player.lastEvent === 'gate' || player.lastEvent === 'lap') kit.audio.sfx('checkpoint', { volume: .72 }); if (player.lastEvent.startsWith('boost')) kit.audio.sfx('boost', { volume: .8 }); if (player.lastEvent === 'shortcut') { kit.audio.sfx('boost', { volume: .7, rate: 1.2 }); kit.juice.shake(2, 110); } if (player.lastEvent === 'pad') kit.audio.sfx('checkpoint', { volume: .38, rate: 1.25 }); }
  wallSfxCooldown = Math.max(0, wallSfxCooldown - dt);
  if (player.wall > .28) { if (player.lastEvent === 'wall') emitFx('wall'); if (wallSfxCooldown <= 0) { kit.audio.sfx('collision', { volume: .52, rate: .86 + player.wall * .2 }); wallSfxCooldown = .22; kit.juice.hitStop(32); } kit.juice.shake(player.wall * 1.3, 75); }
  if (player.lastEvent === 'respawn') { queueEventToast('respawn'); emitFx('respawn'); kit.audio.sfx('collision', { volume: .34, rate: .72 }); }
  if (player.lastEvent === 'landing') { kit.audio.sfx('checkpoint', { volume: .26, rate: .72 }); }
  if (player.finished) finishRace();
}

function ghostTimeAtDistance(distance) {
  if (!validTrace(ghostTrace) || ghostTrace.length < 2) return null;
  let lo = 0, hi = ghostTrace.length - 1;
  if (distance <= ghostTrace[0][1]) return ghostTrace[0][0];
  if (distance >= ghostTrace[hi][1]) return ghostTrace[hi][0];
  while (lo + 1 < hi) { const mid = (lo + hi) >> 1; if (ghostTrace[mid][1] <= distance) lo = mid; else hi = mid; }
  const a = ghostTrace[lo], b = ghostTrace[hi]; return lerp(a[0], b[0], clamp((distance - a[1]) / (b[1] - a[1] || 1), 0, 1));
}
function updateHUD() {
  const tier = player.driftCharge >= 1.28 ? 'PURPLE' : player.driftCharge >= .62 ? 'ORANGE' : player.driftCharge > .05 ? 'BLUE' : player.boost > 0 ? 'BOOST' : 'READY';
  const tierColor = tier === 'PURPLE' ? '#dc91ff' : tier === 'ORANGE' ? '#ffad5c' : '#63dcff';
  const displayedTime = raceTime(player), ghostTime = ghostTimeAtDistance(player.totalDistance), delta = ghostTime == null ? null : player.time - ghostTime;
  const position = activeMode === 'ghostRace' && delta != null && delta > 0 ? 'P2 / 2' : 'P1 / 2';
  const circuitValue = track.short, lapValue = `${Math.min(player.lap, LAPS)} / ${LAPS}`, timeValue = formatTime(displayedTime), speedValue = String(Math.round(player.speed * 3.6)), deltaValue = delta == null ? 'GHOST --' : `GHOST ${formatDelta(delta)}`;
  if (lastDisplayed.circuit !== circuitValue) setTextIfChanged(ui.circuit, circuitValue);
  if (lastDisplayed.lap !== lapValue) setTextIfChanged(ui.lap, lapValue);
  if (lastDisplayed.time !== timeValue) setTextIfChanged(ui.time, timeValue);
  if (lastDisplayed.speed !== speedValue) setTextIfChanged(ui.speed, speedValue);
  if (lastDisplayed.delta !== deltaValue) setTextIfChanged(ui.delta, deltaValue);
  if (lastDisplayed.position !== position) setTextIfChanged(ui.position, position);
  if (lastDisplayed.tier !== tier) { setTextIfChanged(ui.boostTier, tier); ui.boostTier.style.color = tierColor; ui.boostFill.style.background = tierColor; }
  ui.position.classList.toggle('hidden', activeMode !== 'ghostRace');
  ui.boostFill.style.width = `${clamp(player.driftCharge / 1.8 * 100, 0, 100)}%`;
  lastDisplayed.circuit = circuitValue; lastDisplayed.lap = lapValue; lastDisplayed.time = timeValue; lastDisplayed.speed = speedValue; lastDisplayed.delta = deltaValue; lastDisplayed.position = position; lastDisplayed.tier = tier;
  PROBE_STATE.mode = mode === 'menu' ? 'menu' : activeMode; PROBE_STATE.phase = phase; PROBE_STATE.lap = player.lap; PROBE_STATE.circuit = activeCircuit; PROBE_STATE.circuitId = track.id; PROBE_STATE.time = Number(displayedTime.toFixed(3)); PROBE_STATE.ghostDelta = delta == null ? 0 : Number(delta.toFixed(3)); PROBE_STATE.boostTier = tier; PROBE_STATE.speed = Number(player.speed.toFixed(2)); PROBE_STATE.cupLeg = activeMode === 'cup' ? cupLeg : 0;
}
function publishProbe() { updateHUD(); window.__kc.state = PROBE_STATE; }

function renderCircuitCards() {
  ui.circuitGrid.replaceChildren();
  TRACKS.forEach((item, index) => {
    const card = document.createElement('button'); card.className = `circuit-card${activeCircuit === index ? ' selected' : ''}${unlocked(index) ? '' : ' locked'}`; card.style.setProperty('--circuit', hex(item.color)); card.disabled = !unlocked(index); card.innerHTML = `<div class="number">${pad2(index + 1)} ${unlocked(index) ? '' : '· LOCKED'}</div><strong>${item.name}</strong><span>${item.identity}</span><span>${bestMedal(item) || 'NO MEDAL'}${recordFor(item).best ? ` · ${formatTime(recordFor(item).best)}` : ''}</span>`;
    card.addEventListener('click', () => { activeCircuit = index; kit.audio.music('menu', 220); kit.audio.sfx('ui', { volume: .45 }); renderCircuitCards(); publishProbe(); }); ui.circuitGrid.appendChild(card);
  });
}
document.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => { activeMode = button.dataset.mode; kit.audio.music('menu', 220); document.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('active', b === button)); kit.audio.sfx('ui', { volume: .45 }); }));
ui.start.addEventListener('click', () => { if (activeMode === 'cup') startCup(); else beginRace(activeMode, activeCircuit, false); });
ui.livery.addEventListener('click', () => { save.livery = (Number.isInteger(save.livery) ? save.livery + 1 : 1) % LIVERIES.length; persist(); setTextIfChanged(ui.livery, `LIVERY: ${LIVERIES[save.livery].name}`); kit.audio.music('menu', 220); kit.audio.sfx('ui', { volume: .45 }); buildWorld(activeCircuit); });
ui.resultNext.addEventListener('click', () => { if (activeMode === 'cup' && cupLeg < TRACKS.length - 1) { cupLeg += 1; beginRace('cup', cupLeg, false); } else if (activeMode === 'cup') startCup(); else beginRace(activeMode, activeCircuit, true); });
ui.resultMenu.addEventListener('click', () => { renderCircuitCards(); showMenu(); });
ui.pause.addEventListener('click', () => { if (kit.paused) kit.resume('manual'); else kit.openSettings(); });

function applyForceSwitches() {
  const forcedCircuit = normalizeCircuit(window.__kc && window.__kc.forceCircuit != null ? window.__kc.forceCircuit : (window.forceCircuit != null ? window.forceCircuit : bootForceCircuit));
  const forcedMode = normalizeMode(window.__kc && window.__kc.forceMode != null ? window.__kc.forceMode : (window.forceMode != null ? window.forceMode : bootForceMode));
  const signature = `${forcedCircuit == null ? '' : forcedCircuit}:${forcedMode || ''}`;
  if (!signature || signature === forceSignature) return;
  forceSignature = signature;
  const circuitChanged = forcedCircuit != null && forcedCircuit !== activeCircuit;
  if (forcedCircuit != null) { activeCircuit = forcedCircuit; renderCircuitCards(); }
  if (forcedMode === 'menu') { showMenu(); return; }
  if (forcedMode) { activeMode = forcedMode; if (forcedMode === 'cup') startCup(); else beginRace(forcedMode, activeCircuit, false); }
  else if (circuitChanged && mode === 'menu') showMenu();
  else if (circuitChanged && mode !== 'menu') beginRace(activeMode, activeCircuit, false);
}

function resize() {
  if (racer) racer.world.resize();
}
window.addEventListener('resize', resize);
if (kit.registerPWA) kit.registerPWA();

async function boot() {
  kit.loader.show('KART CIRCUIT ZERO');
  try {
    kit.loader.progress(.18);
    await buildWorld(activeCircuit);
    kit.loader.progress(.84);
    renderCircuitCards();
    publishProbe();
    setTextIfChanged(ui.livery, `LIVERY: ${(LIVERIES[save.livery] || LIVERIES[0]).name}`);
    kit.loader.progress(1);
    kit.loader.hide();
  } catch (error) {
    kit.loader.hide();
    throw error;
  }
}
boot();

function frame(now) {
  const dt = lastFrame ? clamp((now - lastFrame) / 1000, 0, .08) : 0;
  lastFrame = now;
  applyForceSwitches();
  const juice = kit.juice.frame();
  if (!kit.paused && !juice.frozen) {
    accumulator += Math.min(dt, .05);
    let steps = 0;
    while (accumulator >= FIXED_DT && steps < 16) {
      stepSimulation(FIXED_DT);
      accumulator -= FIXED_DT;
      steps += 1;
    }
  }
  if (!kit.paused) updateRacerWorld(dt || 1 / 60);
  updateHUD();
  if (racer) racer.world.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
