/* Dirt Rocket. GGRacer adapter over the original fixed-step motocross sim. */
import { createRacerWorld } from '../_shared/racer/engine.js';
import { EVENTS, FAMILIES, CHAMPIONSHIPS, makeTrack, makeBigAir, familyForEvent } from './track.js';
import { Bike, BIKE } from './bike.js';

const sceneCanvas = document.getElementById('scene');
const hudCanvas = document.getElementById('hud');
const hud = hudCanvas.getContext('2d', { alpha: true });
const TAU = Math.PI * 2;
const FIXED = 1 / 120;
const MAX_TIME = 7200;
const MEDALS = ['', 'BRONZE', 'SILVER', 'GOLD'];
const MEDAL_COLORS = ['#94a8a8', '#d89058', '#e5eef0', '#ffd46c'];

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function fmt(t) { return t == null ? '--.--' : t.toFixed(2); }
function validNum(v, max = MAX_TIME) { return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max; }
function safeEvent(i) { return EVENTS[i] || EVENTS[0]; }

// ------------------------------------------------------------- GGKit setup
function validGhost(g) {
  return Array.isArray(g) && g.length > 0 && g.length <= 1400 && g.every(row => Array.isArray(row) && row.length === 4 &&
    validNum(row[0], MAX_TIME) && Number.isFinite(row[1]) && Math.abs(row[1]) <= 100000 &&
    Number.isFinite(row[2]) && Math.abs(row[2]) <= 10000 && Number.isFinite(row[3]) && Math.abs(row[3]) <= Math.PI * 2);
}
function validateSave(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o) || o.v !== 2) return false;
  if (!o.events || typeof o.events !== 'object' || Array.isArray(o.events)) return false;
  for (const key of Object.keys(o.events)) {
    if (!EVENTS.some(e => e.id === key)) return false;
    const r = o.events[key];
    if (!r || typeof r !== 'object' || Array.isArray(r) || !MEDALS.includes(r.medal || '')) return false;
    if (r.best != null && !validNum(r.best)) return false;
    if (r.ghosts != null && (!Array.isArray(r.ghosts) || r.ghosts.length > 3 || r.ghosts.some(g => g != null && !validGhost(g)))) return false;
  }
  if (o.tutorialDone != null && typeof o.tutorialDone !== 'boolean') return false;
  if (o.progress != null && (!Number.isInteger(o.progress) || o.progress < 0 || o.progress >= EVENTS.length)) return false;
  if (o.bigAirBest != null && !validNum(o.bigAirBest, 999999)) return false;
  return true;
}

let manualPaused = false;
let pausedByKit = false;
const kit = GGKit.create({
  slug: 'dirt-rocket', orientation: 'landscape', validateSave,
  onPause() { pausedByKit = true; releaseInput(); if (racer) racer.world.setPaused(true); },
  onResume() { pausedByKit = false; if (racer) racer.world.setPaused(false); },
  onRestart() { restartTrack(); },
});
const DEFAULT_SAVE = { v: 2, events: {}, progress: 0, tutorialDone: false, bigAirBest: 0 };
let save = kit.save.get(null);
if (!validateSave(save)) save = JSON.parse(JSON.stringify(DEFAULT_SAVE));
function persist() { kit.save.set(save); }
function eventRecord(index) {
  const id = safeEvent(index).id;
  if (!save.events[id]) save.events[id] = { medal: '', best: null, ghosts: [null, null, null] };
  const r = save.events[id];
  if (!Array.isArray(r.ghosts)) r.ghosts = [null, null, null];
  while (r.ghosts.length < 3) r.ghosts.push(null);
  return r;
}
function medalRank(m) { return Math.max(0, MEDALS.indexOf(m || '')); }
function eventUnlocked(index) { return index === 0 || medalRank(eventRecord(index - 1).medal) >= 1; }
function championshipUnlocked(index) {
  if (index <= 0) return true;
  const prior = CHAMPIONSHIPS[index - 1];
  return prior.events.every(i => medalRank(eventRecord(i).medal) >= 1);
}

// All gameplay cues use GGKit's buses. These are tiny original procedural MP3
// renders shipped beside the title, not borrowed from another game.
kit.audio.register({
  engine: 'assets/audio/engine.mp3', boost: 'assets/audio/boost.mp3', land: 'assets/audio/land.mp3',
  crash: 'assets/audio/crash.mp3', pickup: 'assets/audio/pickup.mp3', ui: 'assets/audio/ui.mp3',
  medal: 'assets/audio/medal.mp3', bigair: 'assets/audio/bigair.mp3', skid: 'assets/audio/skid.mp3',
  surface: 'assets/audio/surface.mp3', menu: 'assets/audio/menu.mp3', drive: 'assets/audio/drive.mp3',
});
function sfx(name, opts) { kit.audio.sfx(name, opts); }

// ------------------------------------------------------------- GGRacer render adapter
let track = null;
let racer = null;
let trackJSON = null;
let worldFamily = FAMILIES.stadium;
let worldTheme = 'desert';
let worldTimeOfDay = 'dusk';
const trackJSONById = new Map();
const TRACK_ASSET_IDS = Array.from({ length: 24 }, (_, i) => `event-${Math.floor(i / 3) + 1}-track-${(i % 3) + 1}`).concat('big-air');

function trackAssetId(eventIndex, trackIndex, kind = S.kind) {
  return kind === 'bigAir' && trackIndex === 0 ? 'big-air' : `event-${eventIndex + 1}-track-${trackIndex + 1}`;
}

function themeAccent(theme) {
  return theme === 'night-city' ? 0x5de9ef : theme === 'alpine' ? 0xb8f2d1 : theme === 'coastal' ? 0xffd36b : 0xf2c34e;
}

function buildRacerWorld() {
  trackJSON = trackJSONById.get(trackAssetId(S.eventIndex, S.trackIndex));
  if (!trackJSON) throw new Error(`Missing Dirt Rocket track asset for event ${S.eventIndex + 1}, track ${S.trackIndex + 1}`);
  if (racer) racer.world.dispose();
  worldFamily = track ? track.family : FAMILIES.stadium;
  worldTheme = trackJSON.theme || 'desert';
  worldTimeOfDay = trackJSON.timeOfDay || (worldTheme === 'night-city' ? 'night' : 'dusk');
  racer = createRacerWorld({
    canvas: sceneCanvas,
    trackJSON,
    theme: worldTheme,
    timeOfDay: worldTimeOfDay,
    ggkit: kit,
    rivalCount: 1,
    seed: trackJSON.sourceSeed,
    paint: 0xd44738,
    accent: themeAccent(worldTheme),
    carName: 'Dirt Rocket compact chase car',
  });
  racer.world.resize();
}

function simProgress(x) {
  const start = 42;
  return clamp((x - start) / Math.max(1, track.finishX - start), 0, 1);
}

const renderPlayerState = { position: { x: 0, y: 0, z: 0 }, progress: 0, yaw: 0, speed: 0, steering: 0, acceleration: 0, lateralG: 0, suspension: 0, pitch: 0, roll: 0, brake: 0, boost: 0 };
const renderRivalState = { position: { x: 0, y: 0, z: 0 }, progress: 0, yaw: 0, speed: 0, steering: 0, acceleration: 0, lateralG: 0, suspension: 0, pitch: 0, roll: 0, brake: 0, boost: 0 };
const racerFrame = { carState: renderPlayerState, rivals: [renderRivalState] };

function copyBikeToRenderState(target, bikeState, isPlayer = false) {
  const progress = simProgress(bikeState.x);
  const frame = racer.world.track.sampleRacingLine(progress);
  const simGround = track.heightAt(bikeState.x);
  const airOffset = clamp(Math.max(0, bikeState.y - simGround) * 0.82, 0, 2.8);
  target.position.x = frame.position.x;
  target.position.y = frame.position.y + airOffset;
  target.position.z = frame.position.z;
  target.progress = progress;
  target.yaw = Math.atan2(frame.tangent.x, frame.tangent.z);
  target.speed = Number(bikeState.vx) || 0;
  target.steering = 0;
  target.acceleration = isPlayer ? (input.gas ? 1 : input.brake ? -1 : 0) : 0;
  target.lateralG = 0;
  target.suspension = clamp(((bikeState.pen[0] + bikeState.pen[1]) * 0.5 - 0.12) * 0.8, -0.16, 0.34);
  // The sim's +X forward axis becomes GGRacer's +Z forward axis, so its
  // positive nose-up angle is the negative Three.js X rotation.
  target.pitch = clamp(-wrapAngle(bikeState.angle), -1.3, 1.3);
  target.roll = 0;
  target.brake = isPlayer && input.brake ? 1 : 0;
  target.boost = bikeState.boosting ? 1 : 0;
}

// --------------------------------------------------------------- game state
let W = 960, H = 540, lastTap = null, lastInput = { gas: false, brake: false, boost: false, lean: 0 };
let safeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const input = { gas: false, brake: false, boost: false, lean: 0 };
const S = {
  mode: 'title', kind: 'championship', eventIndex: 0, trackIndex: 0, tracks: [], time: 0, times: [null, null, null], bonuses: [0, 0, 0],
  checkpoint: 40, crashTime: 0, totalCrashes: 0, message: '', messageTime: 0, messageQueue: [], messageColor: '#efae5c', landingQuality: 'READY', qualityTime: 0,
  tutorialActive: false, tutorialStep: 0, tutorialTimer: 0, ghost: null, ghostRecord: [], lastGhostSample: 0,
  bigAirScore: 0, bigAirPeak: 0, bigAirRotation: 0, currentBonus: 0, shortcutFound: false,
  engineCue: 0, skidCue: 0, countdown: 0, countdownBeat: 0, rivalTime: 0, rivalX: 0,
};
const bike = new Bike();
const simOut = {};
let appliedForceEvent = null;
let appliedForceTrack = null;

window.__dr = window.__dr || { forceEvent: null, forceTrack: null, state: {} };
window.__dr.state = window.__dr.state || {};
function publishState() {
  const st = window.__dr.state;
  st.mode = S.mode; st.kind = S.kind; st.event = S.eventIndex; st.track = S.trackIndex; st.time = S.time;
  st.heat = bike.heat; st.landingQuality = S.landingQuality; st.speed = bike.vx; st.wheelie = bike.wheelieMeter;
  st.eventName = safeEvent(S.eventIndex).name; st.family = track ? track.familyId : 'stadium'; st.medal = S.mode === 'eventResult' ? MEDALS[eventMedal()] : '';
}
function applyForceSwitches() {
  const forcedEvent = Number.isInteger(window.__dr.forceEvent) ? clamp(window.__dr.forceEvent, 0, EVENTS.length - 1) : null;
  if (forcedEvent !== null && forcedEvent !== appliedForceEvent) {
    appliedForceEvent = forcedEvent;
    buildEvent(forcedEvent, S.kind === 'bigAir' ? 'bigAir' : S.kind);
  }
  const forcedTrack = Number.isInteger(window.__dr.forceTrack) ? clamp(window.__dr.forceTrack, 0, 2) : null;
  if (forcedTrack !== null && forcedTrack !== appliedForceTrack) {
    appliedForceTrack = forcedTrack;
    if (S.tracks.length) { S.trackIndex = forcedTrack; startTrack(); }
  }
}

function layout() {
  const r = hudCanvas.getBoundingClientRect(); W = r.width || innerWidth; H = r.height || innerHeight;
  const styles = getComputedStyle(document.documentElement);
  const readInset = name => Math.max(0, parseFloat(styles.getPropertyValue(name)) || 0);
  safeInsets = { top: readInset('--safe-top'), right: readInset('--safe-right'), bottom: readInset('--safe-bottom'), left: readInset('--safe-left') };
  if (racer) racer.world.resize();
  hudCanvas.width = Math.round(W * Math.min(devicePixelRatio || 1, 1.5)); hudCanvas.height = Math.round(H * Math.min(devicePixelRatio || 1, 1.5));
  hud.setTransform(hudCanvas.width / W, 0, 0, hudCanvas.height / H, 0, 0);
}
function controls() {
  const r = Math.max(34, Math.min(62, H * .13));
  const compact = W < 520;
  return {
    gas: { x: W - safeInsets.right - r - 24, y: H - safeInsets.bottom - r - 21, r },
    boost: { x: W - safeInsets.right - r - (compact ? 94 : 42), y: H - safeInsets.bottom - r * 2.65 - 26, r: r * .68 },
    brake: { x: safeInsets.left + r + 26, y: H - safeInsets.bottom - r - 21, r: r * .84 },
  };
}
function inCircle(x, y, c) { return Math.hypot(x - c.x, y - c.y) <= c.r + 12; }
function inRect(x, y, r) { return r && x >= r.x && y >= r.y && x <= r.x + r.w && y <= r.y + r.h; }
function releaseInput() { input.gas = input.brake = input.boost = false; input.lean = 0; lastInput = { gas: false, brake: false, boost: false, lean: 0 }; }
const navigationHeld = new Set();
function navigationPressed(code) {
  const held = kit.input.keyDown(code);
  const wasHeld = navigationHeld.has(code);
  if (held) navigationHeld.add(code); else navigationHeld.delete(code);
  return held && !wasHeld;
}
function readNavigation() {
  const enter = navigationPressed('Enter') || navigationPressed('Space');
  const restart = navigationPressed('KeyR');
  const pause = navigationPressed('Escape');
  const settings = navigationPressed('KeyO');
  const fullscreen = navigationPressed('KeyF');
  if (settings) { kit.openSettings(); return; }
  if (fullscreen) { kit.requestFullscreen(); return; }
  if (restart && (S.mode === 'run' || S.mode === 'crash' || S.mode === 'countdown')) { kit.restart(); return; }
  if (pause && (S.mode === 'run' || S.mode === 'crash' || S.mode === 'countdown')) { manualPaused = true; kit.pause('manual'); return; }
  if (enter) {
    if (S.mode === 'title') { const b = menuButtons(); processTap({ x: b.champ.x + b.champ.w * .5, y: b.champ.y + b.champ.h * .5 }); }
    else if (S.mode === 'result') processTap({ x: W * .5, y: H * .75 });
    else if (S.mode === 'eventResult') { const b = resultButtons(); processTap({ x: b.next.x + b.next.w * .5, y: b.next.y + b.next.h * .5 }); }
  }
}
function seedPointer(e) {
  // GGKit normally seeds this before the canvas listener. This fallback is
  // intentional: DOM/canvas event ordering must never leave a claimed pedal
  // absent from the kit identity map.
  if (!kit.input.pointers.has(e.pointerId)) kit.input.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, downAt: performance.now(), zone: null });
}
sceneCanvas.addEventListener('pointerdown', e => {
  e.preventDefault(); seedPointer(e); try { sceneCanvas.setPointerCapture(e.pointerId); } catch (err) { /* no capture */ }
  const r = sceneCanvas.getBoundingClientRect(); lastTap = { x: e.clientX - r.left, y: e.clientY - r.top };
  if (S.mode === 'title') kit.audio.music('menu', 300);
}, { passive: false });
sceneCanvas.addEventListener('lostpointercapture', e => kit.input.pointers.delete(e.pointerId));
window.addEventListener('pagehide', () => { kit.input.clearAll(); releaseInput(); });

function readInput() {
  if (S.mode !== 'run' && S.mode !== 'crash') { releaseInput(); return; }
  const z = controls(); const canvasRect = sceneCanvas.getBoundingClientRect(); let gas = false, brake = false, boost = false, lean = 0, leanId = null;
  for (const [id, p] of kit.input.pointers) {
    const x = p.x - canvasRect.left, y = p.y - canvasRect.top;
    if (inCircle(x, y, z.boost)) { boost = true; gas = true; continue; }
    if (inCircle(x, y, z.gas)) { gas = true; continue; }
    if (inCircle(x, y, z.brake)) { brake = true; continue; }
    if (x >= W * .56 && y > 66) { gas = true; continue; }
    if (x < W * .56 && leanId == null) { leanId = id; lean = clamp((p.startY - p.y) / Math.max(58, H * .18), -1, 1); }
  }
  const k = kit.input;
  gas = gas || k.keyDown('ArrowRight') || k.keyDown('KeyD');
  brake = brake || k.keyDown('ArrowLeft') || k.keyDown('KeyA');
  boost = boost || ((k.keyDown('Space') || k.keyDown('ShiftLeft') || k.keyDown('ShiftRight')) && gas);
  const keyLean = (k.keyDown('ArrowUp') || k.keyDown('KeyW') ? 1 : 0) + (k.keyDown('ArrowDown') || k.keyDown('KeyS') ? -1 : 0);
  input.gas = gas; input.brake = brake; input.boost = boost; input.lean = keyLean || lean;
  lastInput = { gas, brake, boost, lean: input.lean };
}

// -------------------------------------------------------------- progression
function eventPar() { return S.tracks.reduce((a, tr) => a + tr.par, 0); }
function eventTotal() { return S.times.reduce((a, t, i) => a + (t == null ? 0 : t - S.bonuses[i]), 0); }
function eventMedal() {
  const total = eventTotal(), par = eventPar();
  if (total <= par) return 3; if (total <= par * 1.13) return 2; if (total <= par * 1.34) return 1; return 0;
}
function startMode(kind) {
  S.kind = kind; S.eventIndex = kind === 'bigAir' ? 7 : clamp(save.progress || 0, 0, EVENTS.length - 1); S.trackIndex = 0;
  buildEvent(S.eventIndex, kind);
}
function buildEvent(index, kind = S.kind) {
  const requested = Number.isInteger(index) ? index : 0; S.eventIndex = clamp(requested, 0, EVENTS.length - 1); S.kind = kind;
  S.tracks = [];
  for (let i = 0; i < 3; i++) { const family = familyForEvent(S.eventIndex, i); S.tracks.push(kind === 'bigAir' && i === 0 ? makeBigAir(0xB16A + S.eventIndex) : makeTrack(family, (S.eventIndex + 1) * 7919 + i * 1313 + 17, S.eventIndex, i)); }
  S.times = [null, null, null]; S.bonuses = [0, 0, 0]; S.trackIndex = 0; S.currentBonus = 0; S.totalCrashes = 0; S.ghostRecord = []; S.ghost = null;
  S.bigAirScore = 0; S.bigAirPeak = 0; S.bigAirRotation = 0;
  startTrack();
}
function startTrack() {
  track = S.tracks[S.trackIndex] || makeTrack('stadium', 17, 0, 0);
  buildRacerWorld();
  const x = 42; bike.reset(x, track.heightAt(x) + BIKE.WR + .33, track.slopeAt(x)); bike.vx = 0;
  S.time = 0; S.engineCue = 0; S.checkpoint = x; clearMessages(); S.qualityTime = 0; S.landingQuality = 'READY'; S.currentBonus = 0; S.shortcutFound = false;
  S.countdown = 3; S.countdownBeat = 3; S.rivalTime = track.par * (1.08 - S.eventIndex * .006); S.rivalX = x;
  for (const p of track.pickups) p.taken = false;
  S.tutorialActive = !save.tutorialDone && S.kind === 'championship' && S.eventIndex === 0 && S.trackIndex === 0;
  S.tutorialStep = 0; S.tutorialTimer = 0;
  const rec = eventRecord(S.eventIndex); S.ghost = S.kind === 'timeTrial' ? rec.ghosts[S.trackIndex] : null;
  S.ghostRecord = []; S.lastGhostSample = 0;
  S.mode = 'countdown'; releaseInput(); manualPaused = false;
}
function modeRun() { S.mode = 'run'; releaseInput(); kit.audio.music('drive', 350); sfx('engine', { volume: .5, rate: .88 }); sfx('surface', { volume: .42 }); }
function restartTrack() { if (S.mode === 'run' || S.mode === 'crash' || S.mode === 'countdown') startTrack(); }
function clearMessages() { S.message = ''; S.messageTime = 0; S.messageQueue.length = 0; }
function startMessage(item) { S.message = item.text; S.messageTime = item.seconds; S.messageColor = item.color; }
function pushMessage(value, color = '#efae5c', seconds = 1.0) {
  const item = { text: value, color, seconds: clamp(seconds, .2, 1.0) };
  if (S.messageTime > 0) {
    if (S.message === item.text || S.messageQueue.some(next => next.text === item.text)) return;
    if (S.messageQueue.length < 8) S.messageQueue.push(item);
  } else startMessage(item);
}
function setTitle() {
  if (manualPaused) { manualPaused = false; kit.input.clearAll(); kit.resume('manual'); }
  S.mode = 'title'; releaseInput(); kit.audio.music('menu', 300);
}
function enterManualPause() { manualPaused = true; kit.pause('manual'); }

function processTap(p) {
  if (!p) return;
  if (manualPaused) {
    const b = pauseButtons();
    if (inRect(p.x, p.y, b.resume)) { manualPaused = false; kit.input.clearAll(); kit.resume('manual'); releaseInput(); }
    else if (inRect(p.x, p.y, b.settings)) kit.openSettings();
    else if (inRect(p.x, p.y, b.fullscreen)) kit.requestFullscreen();
    else if (inRect(p.x, p.y, b.title)) setTitle();
    return;
  }
  if (S.mode === 'title') {
    const b = menuButtons();
    if (inRect(p.x, p.y, b.champ)) { sfx('ui', { volume: .5 }); startMode('championship'); }
    else if (inRect(p.x, p.y, b.tt)) { sfx('ui', { volume: .5 }); startMode('timeTrial'); }
    else if (inRect(p.x, p.y, b.air)) { sfx('ui', { volume: .5 }); startMode('bigAir'); }
    else if (inRect(p.x, p.y, titleActionButtons().settings)) kit.openSettings();
    else if (inRect(p.x, p.y, titleActionButtons().fullscreen)) kit.requestFullscreen();
    return;
  }
  if (S.mode === 'run' || S.mode === 'crash' || S.mode === 'countdown') {
    if (inRect(p.x, p.y, pauseButton())) enterManualPause();
    return;
  }
  if (S.mode === 'result') { advanceTrack(); return; }
  if (S.mode === 'eventResult') {
    const b = resultButtons();
    if (inRect(p.x, p.y, b.retry)) { buildEvent(S.eventIndex, S.kind); return; }
    if (inRect(p.x, p.y, b.next)) { const next = S.eventIndex + 1; if (S.kind === 'championship' && next < EVENTS.length && eventUnlocked(next)) buildEvent(next, S.kind); else setTitle(); return; }
    if (inRect(p.x, p.y, b.home)) { setTitle(); return; }
  }
}
function advanceTrack() {
  if (S.kind === 'bigAir' || S.kind === 'timeTrial' || S.trackIndex >= 2) { finishEvent(); return; }
  S.trackIndex++; startTrack();
}
function finishEvent() {
  if (S.kind === 'timeTrial') {
    const rec = eventRecord(S.eventIndex); const old = rec.ghosts[S.trackIndex];
    if (!old || !old.length || S.time < old[old.length - 1][0]) rec.ghosts[S.trackIndex] = S.ghostRecord.slice(0, 1400);
    if (!rec.best || S.time < rec.best) rec.best = S.time;
  } else if (S.kind === 'championship') {
    const m = eventMedal(); const rec = eventRecord(S.eventIndex); if (m > medalRank(rec.medal)) rec.medal = MEDALS[m]; if (!rec.best || eventTotal() < rec.best) rec.best = eventTotal();
    if (m > 0 && S.eventIndex === save.progress) save.progress = Math.min(EVENTS.length - 1, save.progress + 1);
  } else {
    if (S.bigAirScore > (save.bigAirBest || 0)) save.bigAirBest = S.bigAirScore;
  }
  persist(); clearMessages(); S.mode = 'eventResult';
  sfx(S.kind === 'bigAir' ? 'bigair' : 'medal', { volume: .72 });
}

// ------------------------------------------------------------- fixed sim
function collectPickups() {
  for (const p of track.pickups) if (!p.taken && Math.abs(bike.x - p.x) < .88 && bike.y > track.pickupY(p) - .9) {
    p.taken = true;
    if (p.type === 'boost') { bike.heat = Math.max(0, bike.heat - .38); pushMessage('BOOST REFILL', '#69d8b5'); }
    else if (p.type === 'time') { S.currentBonus += .85; pushMessage('TIME  -0.85', '#ffd46c'); }
    else { bike.health = 1; S.crashTime = Math.max(0, S.crashTime - .35); pushMessage('REPAIR', '#a9d27c'); }
    sfx('pickup', { volume: .65 });
  }
}
function updateTutorial(dt) {
  if (!S.tutorialActive) return;
  S.tutorialTimer += dt;
  const checks = [input.gas, input.brake, Math.abs(input.lean) > .25, input.boost || bike.heat > .2, S.landingQuality === 'CLEAN' || S.landingQuality === 'WOBBLE' || S.landingQuality === 'CRASH'];
  if (checks[S.tutorialStep]) { S.tutorialStep++; S.tutorialTimer = 0; sfx('ui', { volume: .35, rate: 1 + S.tutorialStep * .06 }); }
  if (S.tutorialStep >= checks.length) { S.tutorialActive = false; save.tutorialDone = true; persist(); pushMessage('TUTORIAL CLEAR', '#69d8b5', 1.5); }
}
function fixedStep(dt) {
  if (S.mode === 'countdown') {
    S.countdown -= dt;
    const beat = Math.ceil(S.countdown);
    if (beat < S.countdownBeat && beat > 0) { S.countdownBeat = beat; sfx('ui', { volume: .45, rate: 1 + (3 - beat) * .05 }); }
    if (S.countdown <= 0) { S.countdown = 0; modeRun(); }
  } else if (S.mode === 'run') {
    S.time += dt;
    S.skidCue -= dt;
    const wasBoosting = bike.boosting;
    bike.step(dt, track, input, simOut);
    if (bike.boosting && !wasBoosting) sfx('boost', { volume: .72, rate: .92 + bike.rpm * .2 });
    if (simOut.landed === 'clean') { S.landingQuality = 'CLEAN'; S.qualityTime = 1.0; S.currentBonus += .18; pushMessage('CLEAN  +KICK', '#8bf0b0'); sfx('land', { volume: .62, rate: 1.1 }); kit.juice.shake(4, 130); kit.juice.hitStop(48); }
    else if (simOut.landed === 'wobble') { S.landingQuality = 'WOBBLE'; S.qualityTime = 1.0; pushMessage('WOBBLE', '#ffd46c'); sfx('land', { volume: .75, rate: .82 }); kit.juice.shake(7, 180); }
    else if (simOut.landed === 'crash' || bike.crashed) { crashBike(); }
    else if (simOut.noseRisk) { if (S.qualityTime <= 0) pushMessage('NOSE RISK', '#ffd46c', .45); S.landingQuality = 'NOSE RISK'; S.qualityTime = .25; }
    if (input.brake && bike.grounded[0] && Math.abs(bike.vx) > 8 && S.skidCue <= 0) { sfx('skid', { volume: .22, rate: .85 + bike.rpm * .25 }); S.skidCue = .34; }
    collectPickups();
    if (bike.grounded[0] && bike.grounded[1] && Math.abs(wrapAngle(bike.angle - track.slopeAt(bike.x))) < .3 && bike.x > S.checkpoint + 34) S.checkpoint = bike.x - 22;
    if (!S.shortcutFound && bike.x > track.shortcut.start && bike.x < track.shortcut.end && bike.y > track.heightAt(bike.x) + .52) { S.shortcutFound = true; S.currentBonus += .72; pushMessage('HIGH LINE  -0.72', '#69d8b5'); }
    if (S.kind === 'timeTrial' && S.time > S.lastGhostSample + .08) { S.ghostRecord.push([S.time, bike.x, bike.y, bike.angle]); S.lastGhostSample = S.time; }
    if (S.kind === 'bigAir') { S.bigAirPeak = Math.max(S.bigAirPeak, simOut.airHeight || 0); S.bigAirRotation = Math.max(S.bigAirRotation, simOut.airRotation || 0); if (simOut.landed === 'clean') S.bigAirScore = Math.max(S.bigAirScore, Math.round(S.bigAirPeak * 620 + S.bigAirRotation * 390)); }
    if (!bike.crashed && bike.x >= track.finishX) { S.times[S.trackIndex] = S.time; S.bonuses[S.trackIndex] = Math.min(2.5, S.currentBonus + bike.wheelieDistance * .0017); clearMessages(); S.mode = 'result'; sfx('ui', { volume: .56 }); }
  } else if (S.mode === 'crash') {
    S.time += dt; S.crashTime -= dt;
    if (S.crashTime <= 0) { const x = Math.max(42, S.checkpoint); bike.reset(x, track.heightAt(x) + BIKE.WR + .33, track.slopeAt(x), true); bike.vx = bike.health > .5 ? 7.2 : 5.4; modeRun(); pushMessage(bike.health > .5 ? 'REMOUNTED' : 'REPAIR BIKE', '#eef6f3'); }
  }
  S.messageTime = Math.max(0, S.messageTime - dt); if (S.messageTime <= 0 && S.messageQueue.length) startMessage(S.messageQueue.shift()); S.qualityTime = Math.max(0, S.qualityTime - dt);
  if (S.mode === 'run' || S.mode === 'crash') updateTutorial(dt);
  publishState();
}
function wrapAngle(value) { while (value > Math.PI) value -= TAU; while (value < -Math.PI) value += TAU; return value; }
function crashBike() {
  if (S.mode === 'crash') return;
  clearMessages(); S.mode = 'crash'; S.crashTime = 1.8; S.totalCrashes++; bike.health = Math.max(0, bike.health - .35); S.landingQuality = 'CRASH'; S.qualityTime = 1.5;
  sfx('crash', { volume: .9 }); kit.juice.shake(11, 260); kit.juice.hitStop(62);
}

// ------------------------------------------------------------- render views
function rivalBikeState() {
  if (S.kind !== 'championship' || S.mode !== 'run' || !track || S.time >= S.rivalTime) return null;
  const start = 42, span = Math.max(1, track.finishX - start);
  const t = clamp(S.time / Math.max(.1, S.rivalTime), 0, 1);
  const x = start + span * t;
  S.rivalX = x;
  return { x, y: track.heightAt(x) + BIKE.WR + .33, angle: track.slopeAt(x), vx: span / S.rivalTime, angular: 0, airTime: 0, pen: [0, 0], boosting: false, wheel: i => ({ x: x + (i ? BIKE.WB * .5 : -BIKE.WB * .5), y: track.heightAt(x) + BIKE.AXLE_Y }) };
}
function ghostBikeState() {
  const rival = rivalBikeState();
  if (rival) return rival;
  if (!S.ghost || !S.ghost.length || S.mode !== 'run') return null;
  let hi = 0; while (hi < S.ghost.length && S.ghost[hi][0] < S.time) hi++;
  if (hi >= S.ghost.length) return null;
  const a = S.ghost[Math.max(0, hi - 1)], b = S.ghost[hi]; const span = Math.max(.001, b[0] - a[0]); const t = clamp((S.time - a[0]) / span, 0, 1);
  return { x: lerp(a[1], b[1], t), y: lerp(a[2], b[2], t), angle: lerp(a[3], b[3], t), vx: 18, angular: 0, airTime: 0, pen: [0, 0], boosting: false, wheel: i => ({ x: lerp(a[1], b[1], t) + (i ? BIKE.WB * .5 : -BIKE.WB * .5), y: lerp(a[2], b[2], t) + BIKE.AXLE_Y }) };
}
function updateView(dt, juice) {
  if (!track || !racer) return;
  if (!(juice && juice.frozen)) {
    copyBikeToRenderState(renderPlayerState, bike, true);
    const rival = ghostBikeState();
    const rivalRoot = racer.world.rivals[0] && racer.world.rivals[0].root;
    if (rival) {
      copyBikeToRenderState(renderRivalState, rival);
      if (rivalRoot) rivalRoot.visible = true;
    } else if (rivalRoot) {
      rivalRoot.visible = false;
    }
    racer.world.update(racerFrame, dt);
  }
  // GGRacer owns lookAt and quaternion roll. Its public camera object is used
  // only for this position-space shake, preserving the title's impact feel
  // without writing camera Euler components after lookAt.
  if (juice && kit.juice.enabled && racer.camera.object) {
    racer.camera.object.position.x += (juice.dx || 0) * 0.018;
    racer.camera.object.position.y += (juice.dy || 0) * 0.018;
  }
  racer.world.render();
}

// -------------------------------------------------------------------- HUD
function panel(x, y, w, h, alpha = .78) { hud.fillStyle = `rgba(11,19,24,${alpha})`; hud.fillRect(x, y, w, h); hud.strokeStyle = 'rgba(207,239,229,.16)'; hud.strokeRect(x + .5, y + .5, w - 1, h - 1); }
function text(str, x, y, size, color = '#eef6f3', align = 'left', weight = 700) { hud.font = `${weight} ${size}px Inter,system-ui,sans-serif`; hud.fillStyle = color; hud.textAlign = align; hud.textBaseline = 'alphabetic'; hud.fillText(str, x, y); }
function arc(x, y, r, frac, color, width = 5) { hud.beginPath(); hud.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(frac, 0, 1)); hud.strokeStyle = color; hud.lineWidth = width; hud.stroke(); }
function menuButtons() {
  const compact = W < 520 || H < 360; const bw = compact ? Math.min(232, W * .58) : Math.min(310, W * .3);
  const bh = compact ? 44 : 49; const gap = compact ? 8 : 12; const x = compact ? W * .08 : W * .1; const y = compact ? Math.max(72, H * .42) : H * .53;
  return { champ: { x, y, w: bw, h: bh }, tt: { x, y: y + bh + gap, w: bw, h: bh }, air: { x, y: y + (bh + gap) * 2, w: bw, h: bh } };
}
function titleActionButtons() {
  const b = menuButtons(); const compact = W < 520 || H < 360; const x = compact ? W * .72 : b.champ.x + b.champ.w + 18;
  return { settings: { x, y: b.champ.y, w: compact ? W * .24 : 126, h: 44 }, fullscreen: { x, y: b.tt.y, w: compact ? W * .24 : 126, h: 44 } };
}
function coachVisible() { return S.tutorialActive && S.mode !== 'countdown'; }
function pauseButton() { return { x: W - safeInsets.right - 54, y: safeInsets.top + (coachVisible() ? 42 : 8), w: 44, h: 44 }; }
function pauseButtons() {
  const compact = W < 520 || H < 360; const w = compact ? Math.min(118, (W - 34) / 2) : 170; const h = 44; const gap = compact ? 8 : 12; const x = W * .5 - w - gap * .5; const y = compact ? H * .51 : H * .54;
  return { resume: { x, y, w, h }, settings: { x: W * .5 + gap * .5, y, w, h }, fullscreen: { x, y: y + h + gap, w, h }, title: { x: W * .5 + gap * .5, y: y + h + gap, w, h } };
}
function resultButtons() {
  const compact = W < 520 || H < 360;
  if (compact) { const gap = 8; const w = (W - 20 - gap * 2) / 3; const y = H - safeInsets.bottom - 48; return { retry: { x: 10, y, w, h: 44 }, next: { x: 10 + w + gap, y, w, h: 44 }, home: { x: 10 + (w + gap) * 2, y, w, h: 44 } }; }
  const bw = Math.min(190, W * .19), y = H * .78; return { retry: { x: W * .5 - bw - 10, y, w: bw, h: 44 }, next: { x: W * .5 + 10, y, w: bw, h: 44 }, home: { x: W * .5 - bw * .5, y: y + 56, w: bw, h: 44 } };
}
function button(r, label, fill, locked = false) { hud.fillStyle = locked ? '#24323a' : fill; hud.fillRect(r.x, r.y, r.w, r.h); text(label, r.x + r.w / 2, r.y + r.h * .64, 14, locked ? '#6f8586' : '#0b1217', 'center', 850); }
function meter(x, y, w, value, color, height = 6) {
  hud.fillStyle = '#24383d'; hud.fillRect(x, y, w, height);
  hud.fillStyle = color; hud.fillRect(x, y, w * clamp(value, 0, 1), height);
}
function drawTransient() {
  if (S.mode !== 'run' || S.tutorialActive || S.messageTime <= 0 || !S.message) return;
  const compact = W < 520 || H < 360; const left = safeInsets.left + 10; const top = safeInsets.top;
  const width = Math.min(compact ? 214 : 260, W - left - safeInsets.right - 20); const y = top + 108;
  const fade = clamp(S.messageTime / .18, .16, 1); hud.globalAlpha = fade;
  panel(left, y, width, 32, .78); text(S.message, left + 14, y + 21, 14, S.messageColor || '#efae5c', 'left', 850);
  hud.globalAlpha = 1;
}
function drawCrashStatus() {
  if (S.mode !== 'crash') return;
  const compact = W < 520 || H < 360; const left = safeInsets.left + 10; const top = safeInsets.top; const width = Math.min(compact ? 214 : 260, W - left - safeInsets.right - 20); const y = top + 108;
  panel(left, y, width, 34, .8); text(`↻ ${bike.crashKind === 'nose-first' ? 'NOSE-FIRST' : 'CRASH'}`, left + 12, y + 22, 14, '#ff7667', 'left', 850); text(`${Math.max(0, S.crashTime).toFixed(1)}s  ·  ${Math.round(S.checkpoint)}m`, left + width - 12, y + 22, 14, '#d7e4e0', 'right', 800);
}
function drawHud() {
  hud.clearRect(0, 0, W, H);
  if (S.mode === 'title') { drawTitle(); return; }
  const family = track ? track.family : FAMILIES.stadium;
  const compact = W < 520 || H < 360; const live = S.mode === 'run' || S.mode === 'crash'; const top = safeInsets.top + (coachVisible() ? 42 : 0); const left = safeInsets.left;
  const clusterWidth = compact ? 118 : Math.min(230, W * .26);
  panel(left + 10, top + 8, clusterWidth, 54, .68); text(compact ? `E${S.eventIndex + 1} · ${S.trackIndex + 1}/3` : `${safeEvent(S.eventIndex).name.toUpperCase()} · ${S.trackIndex + 1}/3`, left + 20, top + 28, 14, '#91a8a8'); text(fmt(S.time), left + 20, top + 52, compact ? 22 : 24, '#eef6f3', 'left', 850);
  const pw = compact ? Math.min(124, W * .34) : Math.min(300, W * .34); const px = W * .5 - pw * .5; hud.fillStyle = 'rgba(11,19,24,.68)'; hud.fillRect(px, top + 8, pw, 7); hud.fillStyle = family.edge; hud.fillRect(px, top + 8, pw * clamp(bike.x / Math.max(1, track.finishX), 0, 1), 7);
  if (live) {
    const sx = compact ? W - safeInsets.right - 92 : W - safeInsets.right - 112; const sy = top + 42; arc(sx, sy, compact ? 26 : 32, clamp(Math.abs(bike.vx) / 31, 0, 1), family.edge, 6); text(`${Math.round(Math.abs(bike.vx) * 3.6)}`, sx, sy + 5, compact ? 15 : 17, '#eef6f3', 'center', 850);
    const rivalText = S.kind === 'championship' ? `RIVAL ${Math.round(S.rivalX - bike.x)}m` : S.kind === 'timeTrial' ? (S.ghost ? 'GHOST' : 'NO GHOST') : `PAR ${track.par.toFixed(1)}s`;
    text(rivalText, W - safeInsets.right - 12, top + 78, 14, '#91a8a8', 'right', 800);
    const healthColor = bike.health < .5 ? '#ff7667' : '#69d8b5'; text('♥', left + 17, top + 91, 14, healthColor, 'center', 900); meter(left + 26, top + 86, compact ? 54 : 70, bike.health, healthColor); text('▲', left + (compact ? 91 : 112), top + 91, 14, bike.wheelieMeter > .78 ? '#ffd46c' : '#69d8b5', 'center', 900); meter(left + (compact ? 100 : 122), top + 86, compact ? 54 : 70, bike.wheelieMeter, bike.wheelieMeter > .78 ? '#ffd46c' : '#69d8b5');
  }
  const z = controls(); arc(z.boost.x, z.boost.y, z.boost.r + 7, bike.heat, bike.overheated ? '#ff665b' : '#69d8b5', 5); text(bike.overheated ? '!' : '✦', z.boost.x, z.boost.y + 6, 18, bike.overheated ? '#ff7667' : '#eef6f3', 'center', 900);
  if (live && S.kind === 'bigAir') text(`✦ ${S.bigAirScore} · ${S.bigAirPeak.toFixed(1)}m`, W * .5, top + 73, compact ? 14 : 15, '#ffad76', 'center', 800);
  if (S.mode === 'countdown') { panel(W * .5 - 68, H * .31, 136, 54, .76); text(S.countdown > 0 ? String(Math.ceil(S.countdown)) : 'GO', W * .5, H * .31 + 41, compact ? 40 : 44, family.accent, 'center', 900); }
  drawControls();
  if (S.mode === 'run' || S.mode === 'crash' || S.mode === 'countdown') button(pauseButton(), 'II', '#d7e4e0');
  if (coachVisible()) drawTutorial();
  drawTransient(); drawCrashStatus();
  if (S.mode === 'result') drawTrackResult();
  if (S.mode === 'eventResult') drawEventResult();
  if (manualPaused) drawPauseOverlay();
}
function drawTitle() {
  hud.fillStyle = 'rgba(7,13,17,.42)'; hud.fillRect(0, 0, W, H);
  const compact = W < 520 || H < 360; const titleX = compact ? W * .08 : W * .1; const titleSize = compact ? Math.min(36, W * .09) : Math.min(68, W * .08);
  text('DIRT', titleX, compact ? H * .16 : H * .22, titleSize, '#eef6f3', 'left', 900); text('ROCKET', titleX, compact ? H * .25 : H * .31, titleSize, '#efae5c', 'left', 900); text(compact ? 'MOTOCROSS / F4' : 'SIDE-VIEW MOTOCROSS / FLEET F4', titleX, compact ? H * .31 : H * .37, 11, '#91a8a8', 'left', 800);
  const b = menuButtons(); button(b.champ, compact ? 'CHAMPIONSHIP' : 'CHAMPIONSHIP  3 TRACK EVENTS', '#efae5c'); button(b.tt, compact ? 'TIME TRIAL' : 'TIME TRIAL  GHOST REPLAY', '#69d8b5'); button(b.air, compact ? 'BIG AIR' : 'BIG AIR FINALE', '#ff7667');
  const a = titleActionButtons(); button(a.settings, compact ? 'OPTIONS' : 'SETTINGS  O', '#d7e4e0'); button(a.fullscreen, compact ? 'FULLSCREEN' : 'FULLSCREEN  F', '#d7e4e0');
  const cup = CHAMPIONSHIPS.findIndex(c => c.events.includes(Math.min(save.progress, EVENTS.length - 1)));
  text(`EVENT ${Math.min(save.progress + 1, EVENTS.length)}/8  |  ${cup < 0 ? 'APEX CUP' : CHAMPIONSHIPS[cup].name.toUpperCase()}`, titleX, H - safeInsets.bottom - 8, 10, '#91a8a8'); if (!compact) text('GAS  /  BRAKE  /  LEAN  /  BOOST', W - safeInsets.right - 22, H - safeInsets.bottom - 8, 11, '#91a8a8', 'right');
}
function drawControls() {
  const z = controls(); hud.globalAlpha = input.gas ? .92 : .56; hud.fillStyle = input.gas ? '#3ebd83' : '#1b2c33'; hud.beginPath(); hud.arc(z.gas.x, z.gas.y, z.gas.r, 0, TAU); hud.fill(); hud.strokeStyle = '#8bf0b0'; hud.lineWidth = 2; hud.stroke(); hud.globalAlpha = 1; text('▲', z.gas.x, z.gas.y + 7, 20, '#eef6f3', 'center', 900);
  hud.globalAlpha = input.brake ? .94 : .56; hud.fillStyle = input.brake ? '#cf5943' : '#1b2c33'; hud.beginPath(); hud.arc(z.brake.x, z.brake.y, z.brake.r, 0, TAU); hud.fill(); hud.strokeStyle = '#ff9b7e'; hud.stroke(); hud.globalAlpha = 1; text('■', z.brake.x, z.brake.y + 6, 16, '#eef6f3', 'center', 900);
  const leanX = 25; const leanTop = H * .38; const leanBottom = H * .57; hud.strokeStyle = 'rgba(105,216,181,.45)'; hud.lineWidth = 4; hud.beginPath(); hud.moveTo(leanX, leanTop + 8); hud.lineTo(leanX, leanBottom - 8); hud.stroke(); hud.fillStyle = '#91a8a8'; hud.beginPath(); hud.moveTo(leanX, leanTop); hud.lineTo(leanX - 7, leanTop + 10); hud.lineTo(leanX + 7, leanTop + 10); hud.closePath(); hud.fill(); hud.beginPath(); hud.moveTo(leanX, leanBottom); hud.lineTo(leanX - 7, leanBottom - 10); hud.lineTo(leanX + 7, leanBottom - 10); hud.closePath(); hud.fill();
}
function drawPauseOverlay() {
  hud.fillStyle = 'rgba(7,13,17,.76)'; hud.fillRect(0, 0, W, H); text('PAUSED', W * .5, H * .32, 30, '#eef6f3', 'center', 900); text('THE RUN IS SAFE', W * .5, H * .38, 11, '#91a8a8', 'center', 800);
  const b = pauseButtons(); button(b.resume, 'RESUME', '#69d8b5'); button(b.settings, 'OPTIONS', '#d7e4e0'); button(b.fullscreen, 'FULLSCREEN', '#d7e4e0'); button(b.title, 'TITLE', '#efae5c');
}
function drawTutorial() {
  const tips = ['HOLD GAS', 'TAP BRAKE', 'DRAG TO LEAN', 'BOOST IN GREEN', 'LAND FLAT'];
  const compact = W < 520 || H < 360; const width = Math.min(W - 20, compact ? 360 : 620); const y = safeInsets.top + 4; const opacity = kit.juice.enabled ? clamp(1 - Math.max(0, S.tutorialTimer - 3) * 2.4, .12, 1) : (S.tutorialTimer > 3 ? .28 : .7);
  hud.globalAlpha = opacity; panel(W * .5 - width * .5, y, width, 34, .72); text(`${S.tutorialStep + 1}/5  ·  ${tips[Math.min(4, S.tutorialStep)]}`, W * .5, y + 23, 14, '#eef6f3', 'center', 800); hud.globalAlpha = 1;
}
function drawTrackResult() {
  const compact = W < 520 || H < 360; const pw = compact ? W - 16 : 400; const py = compact ? 8 : H * .18;
  hud.fillStyle = 'rgba(7,13,17,.74)'; hud.fillRect(0, 0, W, H); panel(W * .5 - pw * .5, py, pw, compact ? H - 56 : 218, .93);
  text(`TRACK ${S.trackIndex + 1} CLEAR`, W * .5, py + (compact ? 30 : 38), compact ? 18 : 22, worldFamily.edge, 'center', 900); text(fmt(S.times[S.trackIndex]), W * .5, py + (compact ? 78 : 88), compact ? 38 : 48, '#eef6f3', 'center', 900); text(`BONUS  -${S.bonuses[S.trackIndex].toFixed(2)}s  /  PAR ${track.par.toFixed(2)}s`, W * .5, py + (compact ? 104 : 116), 11, '#91a8a8', 'center'); text(S.kind === 'championship' && S.trackIndex < 2 ? `TAP FOR TRACK ${S.trackIndex + 2}` : 'TAP FOR RESULTS', W * .5, py + (compact ? 136 : 174), compact ? 12 : 15, '#eef6f3', 'center', 850);
}
function drawEventResult() {
  const compact = W < 520 || H < 360; const m = S.kind === 'bigAir' ? (S.bigAirScore >= 1800 ? 3 : S.bigAirScore >= 1100 ? 2 : S.bigAirScore >= 600 ? 1 : 0) : S.kind === 'timeTrial' ? 0 : eventMedal(); const top = compact ? 8 : Math.max(22, H * .09); const pw = compact ? W - 16 : 500;
  hud.fillStyle = 'rgba(7,13,17,.82)'; hud.fillRect(0, 0, W, H); panel(W * .5 - pw * .5, top, pw, compact ? H - 56 : Math.min(350, H * .62), .96); text(S.kind === 'bigAir' ? 'BIG AIR FINALE' : S.kind === 'timeTrial' ? 'TIME TRIAL' : MEDALS[m] || 'KEEP PUSHING', W * .5, top + (compact ? 28 : 47), compact ? 21 : 30, S.kind === 'timeTrial' ? '#69d8b5' : MEDAL_COLORS[m], 'center', 900); text(compact ? `E${S.eventIndex + 1}` : safeEvent(S.eventIndex).name.toUpperCase(), W * .5, top + (compact ? 46 : 70), 11, '#91a8a8', 'center');
  if (S.kind === 'bigAir') { text(`${S.bigAirScore}`, W * .5, top + (compact ? 86 : 135), compact ? 38 : 54, '#ffad76', 'center', 900); text(`PEAK ${S.bigAirPeak.toFixed(1)}m  /  ROT ${S.bigAirRotation.toFixed(2)}`, W * .5, top + (compact ? 110 : 166), 11, '#eef6f3', 'center'); }
  else if (S.kind === 'timeTrial') { text(fmt(S.time), W * .5, top + (compact ? 88 : 137), compact ? 38 : 54, '#eef6f3', 'center', 900); text(S.ghost ? 'GHOST SAVED  /  CHASE IT' : 'GHOST RECORDED  /  CHASE IT', W * .5, top + (compact ? 111 : 168), 11, '#69d8b5', 'center'); }
  else { for (let i = 0; i < 3; i++) { text(`TRACK ${i + 1}`, W * .5 - (compact ? 92 : 190), top + (compact ? 69 : 115) + i * (compact ? 17 : 24), 11, '#91a8a8'); text(`${fmt(S.times[i])}  -${S.bonuses[i].toFixed(2)}`, W * .5 + (compact ? 92 : 190), top + (compact ? 69 : 115) + i * (compact ? 17 : 24), 11, '#eef6f3', 'right', 800); } text(`TOTAL ${fmt(eventTotal())}  /  PAR ${eventPar().toFixed(1)}`, W * .5, top + (compact ? 128 : 218), compact ? 13 : 17, '#eef6f3', 'center', 900); }
  const b = resultButtons(); button(b.retry, 'RETRY', '#efae5c'); const nextOkay = S.kind === 'championship' && S.eventIndex + 1 < EVENTS.length && eventUnlocked(S.eventIndex + 1); button(b.next, S.kind === 'championship' ? (nextOkay ? (compact ? 'NEXT' : 'NEXT EVENT') : 'LOCKED') : 'TITLE', nextOkay || S.kind !== 'championship' ? '#69d8b5' : '#24323a', !nextOkay && S.kind === 'championship'); button(b.home, compact ? 'TITLE' : 'BACK TO TITLE', '#d7e4e0');
}

// -------------------------------------------------------------------- loop
let last = performance.now(), accumulator = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const real = Math.max(0, (now - last) / 1000); last = now; const dt = Math.min(real, .12);
  applyForceSwitches();
  readNavigation(); readInput(); if (lastTap) { const p = lastTap; lastTap = null; processTap(p); }
  const juice = kit.juice.frame();
  if (!pausedByKit) {
    accumulator += dt;
    // A capped real delta becomes deliberate slow motion on a degraded
    // device. Accumulator is never dropped, and simulation time only moves
    // inside fixedStep, so no clock can outrun the stepped simulation.
    while (accumulator >= FIXED) { accumulator -= FIXED; fixedStep(FIXED); }
  } else accumulator = 0;
  if (track) updateView(dt, juice);
  drawHud(); publishState();
}

async function boot() {
  kit.loader.show('Dirt Rocket'); kit.loader.progress(.08);
  layout(); window.addEventListener('resize', layout); window.addEventListener('orientationchange', () => setTimeout(layout, 140));
  kit.loader.progress(.22);
  await Promise.all(TRACK_ASSET_IDS.map(async id => {
    const response = await fetch(`./tracks/${id}.json`);
    if (!response.ok) throw new Error(`Unable to load ${id}.json`);
    trackJSONById.set(id, await response.json());
  }));
  const startEvent = Number.isInteger(window.__dr.forceEvent) ? clamp(window.__dr.forceEvent, 0, EVENTS.length - 1) : 0;
  buildEvent(startEvent, 'championship'); S.mode = 'title'; releaseInput();
  kit.loader.progress(.68);
  updateView(1 / 60, { frozen: false, dx: 0, dy: 0 });
  racer.world.resize();
  kit.loader.progress(.9); kit.registerPWA(); kit.loader.progress(1); kit.loader.hide();
  publishState(); requestAnimationFrame(frame);
}
boot();
