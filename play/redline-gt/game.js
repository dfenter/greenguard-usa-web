// game.js — Redline GT. Stylized low-poly 3D racing for mobile web.
//
// The pseudo-3D prototype is the design document: its six seeded circuits,
// handling constants, gear/RPM model, medal thresholds and ghost-lap feature
// are carried forward. GGRacer is the only 3D renderer used by this title.
//
// Structure:
//   track.js  seeded circuit generation + simulation sampler
//   cars.js   vehicle roster and handling data
//   racer     shared GGRacer track, environment, vehicle, and FX rendering
//   audio.js  synthesised engine + layered music stems
//   hud.js    2D overlay primitives
import { createRacerWorld } from '../_shared/racer/engine.js';
import {
  TRACKS, SEG_LEN, ROAD_HALF, buildLayout, buildCenterline, sampleCenterline,
  buildRaceFeatures, buildItemRows, makeRandom,
} from './track.js';
import { CARS } from './cars.js';
import { EngineSynth, MusicDirector } from './audio.js';
import { Hud, UI, EASE, clamp, lerp, formatTime, formatDelta, rgba, hexStr } from './hud.js';

// ------------------------------------------------------------------ config
const LAPS = 3;
const FIELD_SIZE = 4;
// Input is screen-facing: dragging left and pressing LEFT both produce +1.
// The track normal (track.js: nx=dz, nz=-dx) is the prototype's lateral
// normal. A +1 (left) input must stay positive in the simulation; the visual
// heading response below independently maps screen-left to a negative yaw.
const LEFT_INPUT = 1;
// v4: the ghost record gained an arc-length channel, so a v3 ghost cannot be
// replayed by the new playback path and the save version steps past it.
const SAVE_VERSION = 4;

// Original Redline GT item language. The cell visuals never reveal the roll;
// the short HUD roulette beat makes the reveal feel earned without copying a
// kart-racer icon, name, or sound vocabulary.
const ITEM_DEFS = [
  { id: 'nitro', label: 'NITRO SURGE', short: 'NITRO', color: 0xffc45f },
  { id: 'shield', label: 'SHIELD BUBBLE', short: 'SHIELD', color: 0x72e6ef },
  { id: 'slick', label: 'SLICK PATCH', short: 'SLICK', color: 0xec71b5 },
  { id: 'homing', label: 'HOMING BOLT', short: 'HOMING', color: 0xff785f },
  { id: 'twin', label: 'TWIN BOLTS', short: 'TWIN', color: 0xff9c64 },
  { id: 'repair', label: 'REPAIR KIT', short: 'REPAIR', color: 0x81e59b },
];
// Rows are indexed by race position, leader through last. Values are weights,
// not percentages, so the odds stay easy to tune while preserving the strong
// defensive pull for the leader and the stronger attack pull at the back.
const ITEM_ODDS = [
  [20, 42, 0, 5, 5, 28],
  [22, 28, 10, 12, 8, 20],
  [28, 17, 15, 16, 12, 12],
  [32, 10, 18, 17, 15, 8],
];
const ITEM_COUNT = ITEM_DEFS.length;

// --------------------------------------------------- cosmetic RNG (view side)
// Motion determinism firewall: no view-side code may call Math.random(). Dust,
// sparks, streaks, shard bursts and impact audio variance all draw from this
// one seeded cosmetic stream, reseeded per event, which never reads or writes
// simulation state.
let _cosSeed = 0x9e3779b9;
function vrand() {
  _cosSeed = (_cosSeed * 1664525 + 1013904223) >>> 0;
  return _cosSeed / 4294967296;
}

// Championship ladder. Six circuits forward plus four reverse variants gives
// the content gate its >=10 medal events; reverse runs invert the layout and
// tighten the medal times, so the ladder ramps past the forward set.
const EVENTS = [];
TRACKS.forEach((t, i) => {
  EVENTS.push({
    id: t.code + 'F', trackIndex: i, reverse: false,
    name: t.name, code: t.code, desc: t.desc,
    difficulty: t.difficulty,
    gold: t.gold, silver: t.silver, bronze: t.bronze,
  });
});
[0, 2, 3, 5].forEach((i, k) => {
  const t = TRACKS[i];
  EVENTS.push({
    id: t.code + 'R', trackIndex: i, reverse: true,
    name: t.name + ' Reverse', code: t.code + 'R',
    desc: 'The same asphalt read backwards. Nothing is where you left it.',
    difficulty: Math.min(6, t.difficulty + 1),
    // reverse variants demand ~6% more pace than the forward gold
    gold: Math.round(t.gold * 0.96), silver: Math.round(t.silver * 0.97),
    bronze: Math.round(t.bronze * 0.99),
  });
});

const MEDAL_ORDER = { '': 0, BRONZE: 1, SILVER: 2, GOLD: 3 };
const MEDAL_COLOR = { GOLD: 0xffe17c, SILVER: 0xe3f2ff, BRONZE: 0xefa875 };

// ------------------------------------------------------------------- setup
const sceneCanvas = document.getElementById('scene');
const hudCanvas = document.getElementById('hud');
const hud = new Hud(hudCanvas);

// Safe-area insets published to CSS custom props so the HUD can read them.
(function publishSafeArea() {
  const s = document.createElement('style');
  s.textContent = ':root{--sat:env(safe-area-inset-top,0px);--sar:env(safe-area-inset-right,0px);' +
    '--sab:env(safe-area-inset-bottom,0px);--sal:env(safe-area-inset-left,0px);}';
  document.head.appendChild(s);
})();

// GGRacer owns the WebGL renderer, scene, track geometry, environment, cars,
// chase camera, and speed FX. The title only sends it a frame packet.
let racer = null;
let racerTrackJSON = null;
let playerSpec = CARS[0];

// --------------------------------------------------------------- save data
// Any persisted time above this is not a real lap or race, it is a corrupted
// or edited record, and it must not reach the medal table or the HUD.
const MAX_TIME = 60 * 60;   // one hour

function isTime(v, max) {
  return typeof v === 'number' && isFinite(v) && v >= 0 && v <= (max || MAX_TIME);
}

function validateSave(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
  if (o.v !== SAVE_VERSION) return false;
  if (!o.events || typeof o.events !== 'object' || Array.isArray(o.events)) return false;
  // Persisted IDs must validate against the content registry (defect class).
  for (const k of Object.keys(o.events)) {
    if (!EVENTS.some((e) => e.id === k)) return false;
    const r = o.events[k];
    if (!r || typeof r !== 'object' || Array.isArray(r)) return false;
    // Exact enum membership: `'toString' in MEDAL_ORDER` is true through the
    // prototype chain, so a medal of "toString" used to validate.
    if (r.medal !== undefined && r.medal !== '' &&
      !Object.prototype.hasOwnProperty.call(MEDAL_ORDER, r.medal)) return false;
    if (r.best != null && !isTime(r.best)) return false;
    if (r.bestLap != null && !isTime(r.bestLap)) return false;
    if (r.ghost != null && !validateGhost(r.ghost)) return false;
  }
  if (o.car && !CARS.some((c) => c.id === o.car)) return false;
  if (o.tutorialDone !== undefined && typeof o.tutorialDone !== 'boolean') return false;
  return true;
}

// GGKit's audio preferences are stored without a validator, so a corrupt value
// (JSON `null`, a string, an array) is handed straight back and dereferenced
// inside applyPrefs, which kills the boot. The kit is the shared runtime and is
// not ours to change in this round, so the one key this game owns is sanitised
// here before the kit is ever constructed. This is the only raw storage access
// in the game and it never writes game state.
(function sanitizeAudioPrefs() {
  const key = 'gg-redline-gt-audio';
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return;
    let ok = false;
    try {
      const v = JSON.parse(raw);
      ok = !!v && typeof v === 'object' && !Array.isArray(v)
        && typeof v.mute === 'boolean'
        && typeof v.music === 'number' && isFinite(v.music) && v.music >= 0 && v.music <= 1
        && typeof v.sfx === 'number' && isFinite(v.sfx) && v.sfx >= 0 && v.sfx <= 1;
    } catch (e) { ok = false; }
    if (!ok) localStorage.removeItem(key);
  } catch (e) { /* private mode: nothing to sanitise */ }
})();

const kit = GGKit.create({
  slug: 'redline-gt',
  orientation: 'landscape',
  validateSave,
  onPause() { onPause(); },
  onResume() { onResume(); },
  onRestart() { onRestart(); },
});

const DEFAULT_SAVE = { v: SAVE_VERSION, events: {}, car: CARS[0].id, tutorialDone: false };
let save = kit.save.get(null);
if (!validateSave(save)) save = JSON.parse(JSON.stringify(DEFAULT_SAVE));

function persist() { kit.save.set(save); }
function eventRecord(id) {
  if (!save.events[id]) save.events[id] = { medal: '', best: 0, bestLap: 0, ghost: null };
  return save.events[id];
}
function goldCount() {
  let n = 0;
  for (const e of EVENTS) {
    const r = save.events[e.id];
    if (r && r.medal === 'GOLD') n++;
  }
  return n;
}
function medalCount() {
  let n = 0;
  for (const e of EVENTS) {
    const r = save.events[e.id];
    if (r && r.medal) n++;
  }
  return n;
}
function carUnlocked(car) { return goldCount() >= car.unlock; }
function currentCar() {
  const c = CARS.find((x) => x.id === save.car);
  return c && carUnlocked(c) ? c : CARS[0];
}

// ------------------------------------------------------------------ audio
const engine = new EngineSynth(kit);
// Licensed CC0 tracks with the synth bed as the decode-failure fallback.
const music = new MusicDirector(kit, {
  menu: 'mus_menu',
  race: ['mus_race_a', 'mus_race_b'],
});

kit.audio.register({
  mus_menu: 'assets/music/menu.mp3',
  mus_race_a: 'assets/music/race_a.mp3',
  mus_race_b: 'assets/music/race_b.mp3',
  collide: 'assets/sfx/collide.mp3',
  scrape: 'assets/sfx/scrape.mp3',   // off-road scrub

  skid: 'assets/sfx/skid.mp3',
  uitick: 'assets/sfx/uitick.mp3',
  uiselect: 'assets/sfx/uiselect.mp3',
  checkpoint: 'assets/sfx/checkpoint.mp3',
  gearshift: 'assets/sfx/gearshift.mp3',
  beep: 'assets/sfx/beep.mp3',
  boost: 'assets/sfx/boost.mp3',
  fanfare: 'assets/sfx/fanfare.mp3',
  lapchime: 'assets/sfx/lapchime.mp3',
});

function sfx(name, opts) { kit.audio.sfx(name, opts); }

// ------------------------------------------------------------------ state
// 'title' | 'garage' | 'select' | 'countdown' | 'race' | 'finish'
let mode = 'title';
let event = EVENTS[0];
let track = null;         // simulation track for the current event
let loading = false;

const sim = {
  s: 0,               // arc-length position along centreline, metres
  lateral: 0,         // prototype lateral units (-1.45..1.45)
  speed: 0,           // prototype speed units
  lap: 1,
  lapTime: 0,
  lapDist: 0,         // metres travelled since the lap boundary (ghost channel)
  totalTime: 0,
  gear: 1,
  rpm: 1800,
  hitTimer: 0,
  drifting: 0,
  offRoad: 0,
  finished: false,
  lastNode: 0,
  wheelSpin: 0,
  damage: 0,
  edgeHitTimer: 0,
  jumpT: 0,
  jumpNode: -1,
  shielded: false,
  boostTimer: 0,
  gripTimer: 0,
  spinTimer: 0,
  spinPhase: 0,
  spinDir: 1,
  shortcutActive: false,
  shortcutIndex: -1,
  shortcutT: 0,
  shortcutLane: 0,
  boostPulse: 0,
  secretPulse: 0,
};

// Item state is deliberately plain and stable so the live harness can inspect
// it without chasing a rebuilt object. `heldIndex` is -1 when the slot is
// empty. The item world itself is pooled per race in track.items.
const itemState = {
  heldIndex: -1,
  rouletteTarget: -1,
  rouletteTimer: 0,
  incomingFlash: 0,
  pickupFlash: 0,
  useFlash: 0,
  lastPickup: -1,
};
let itemRngState = 1;

function itemRand() {
  itemRngState = (itemRngState * 1664525 + 1013904223) >>> 0;
  return itemRngState / 4294967296;
}

function resetItemRng(seed) {
  itemRngState = ((seed >>> 0) || 1) >>> 0;
}

function rollItem(position) {
  const row = ITEM_ODDS[clamp(position - 1, 0, ITEM_ODDS.length - 1)];
  let total = 0;
  for (let i = 0; i < ITEM_COUNT; i++) total += row[i];
  let pick = itemRand() * total;
  for (let i = 0; i < ITEM_COUNT; i++) {
    pick -= row[i];
    if (pick <= 0) return i;
  }
  return ITEM_COUNT - 1;
}

// Cosmetic springs (render-side only; never feed back into sim).
const view = {
  fov: 62,
  dip: 0, dipVel: 0,
  lean: 0, leanVel: 0,
  pitch: 0, pitchVel: 0,
  yawLag: 0,
  shakeT: 0,
  flash: 0,
  started: false,
  // Impact language (anticipation -> contact -> follow-through)
  telegraph: 0,       // 0..1, rises in the 80 ms before an unavoidable contact
  recoil: 0, recoilVel: 0,   // chassis follow-through spring, one overshoot
  hitFlashPart: 0,    // localized struck-part flash, 3 frames
  hitSide: 1,         // which flank was struck
  // Screen transitions and menu camera
  fade: 0, fadeDir: 0, fadeNext: null,
  orbit: 0,
  // Weather lighting event
  lightning: 0, lightningNext: 2.4,
  clock: 0,
  carHeading: 0, carHeadingReady: false,
  carHeadingVel: 0,
  suspension: 0, suspensionVel: 0,
  boostKick: 0, boostKickVel: 0,
  carScale: 1,
};

// Ghost recording: sampled at a fixed cadence, bounded, and validated on load.
const GHOST_HZ = 10;
const GHOST_MAX = 60 * GHOST_HZ * 6;   // 6 minutes hard cap
let ghostRecord = null;
let ghostPlay = null;
let ghostAccum = 0;

// Countdown / message / tutorial state
let countdown = 0;
let countdownStep = -1;
let message = '';
let messageTime = 0;
let messageKind = '';
let finishInfo = null;
let ceremonyT = 0;

// HUD chip motion. Each entry is the remaining normalised time of a slide-in
// pop; the bible asks for chip transitions on lap, checkpoint and delta
// changes rather than static readouts.
const chips = { lap: 0, delta: 0, ghost: 0 };
function chipPop(k) {
  if (reducedMotion()) return;
  chips[k] = 1;
}
let lastDeltaSign = 0;

const tutorial = {
  active: false,
  step: 0,
  timer: 0,
  done: false,
  // Terminology matches the on-screen pedals exactly: GAS and BRAKE. The old
  // copy said THROTTLE while the pedal said GAS.
  steps: [
    { key: 'throttle', text: 'Hold GAS on the right to accelerate.', hint: 'throttle' },
    { key: 'steer', text: 'Drag anywhere on the left to steer.', hint: 'steer' },
    { key: 'brake', text: 'Tap BRAKE to slow down. Hold it in a corner to drift.', hint: 'brake' },
    { key: 'rumble', text: 'Put a wheel over the striped kerb. Past it you lose grip.', hint: null },
    { key: 'ghost', text: 'Chase the ghost of your best lap. The delta chip is your gap to it.', hint: 'ghost' },
    { key: 'lap', text: 'Cross the line to bank a lap. Three laps to the flag.', hint: null },
  ],
  // Events the player has actually produced, so the later lessons advance on
  // the thing happening rather than on a timer.
  seen: { rumble: false, ghost: false, lap: false },
};

// Input snapshot rebuilt every frame from GGKit pointer identity + keys.
const input = {
  steer: 0, throttle: false, brake: false,
  steerPointerId: null, steerOriginX: 0,
  touchThrottle: false, touchBrake: false,
};
// Read-only state hook for the gate harness (same pattern as __wanderApp).
window.__rg = { sim, input, items: itemState };

// ------------------------------------------------------------------ layout
let W = 0, H = 0, dpr = 1;

function resize() {
  const rect = sceneCanvas.getBoundingClientRect();
  W = Math.max(320, rect.width);
  H = Math.max(220, rect.height);
  const hudDpr = Math.min(Math.min(1.6, window.devicePixelRatio || 1), 1000 / Math.max(W, 1));
  hud.resize(W, H, hudDpr);
  if (racer) racer.world.resize();
}
window.addEventListener('resize', resize, { passive: true });
window.addEventListener('orientationchange', resize, { passive: true });

function disposeWorld() {
  if (racer) racer.world.dispose();
  racer = null;
  racerTrackJSON = null;
  track = null;
}

function buildItemWorld(center) {
  const rows = buildItemRows(center);
  const cells = [];
  for (let i = 0; i < rows.length; i += 1) {
    for (let laneIndex = 0; laneIndex < 3; laneIndex += 1) {
      cells.push({ dist: rows[i].dist, lane: rows[i].lanes[laneIndex], available: true,
        respawn: 0, visibility: 1, pulse: 0 });
    }
  }
  const patches = [];
  for (let i = 0; i < 10; i += 1) patches.push({ active: false, expiring: false,
    visualScale: 0, life: 0, s: 0, lane: 0, owner: -2, ownerSafe: 0 });
  const projectiles = [];
  for (let i = 0; i < 8; i += 1) projectiles.push({ active: false, visualActive: false,
    homing: false, distance: 0, lane: 0, speed: 0, life: 0, visualScale: 0,
    owner: -2, target: -2, telegraphed: false });
  return { cells, patches, projectiles, nextPatch: 0, nextProjectile: 0 };
}

function reverseTrackJSON(data) {
  const points = data.controlPoints.slice().reverse().map((point) => ({
    x: point.x, z: point.z, elevation: point.elevation, banking: -(point.banking || 0), curb: point.curb,
  }));
  const reverseAt = (value) => {
    const at = (1 - Number(value || 0)) % 1;
    return at < 0 ? at + 1 : at;
  };
  const remapMarkers = (items) => (items || []).map((item) =>
    Object.assign({}, item, { at: reverseAt(item.at) })
  ).sort((a, b) => a.at - b.at);
  const sectors = remapMarkers(data.sectors);
  const distanceMarkers = remapMarkers(data.distanceMarkers);
  const racingLine = remapMarkers(data.racingLine);
  const turns = remapMarkers(data.turns);
  return Object.assign({}, data, { id: data.id + '-reverse', name: data.name + ' Reverse',
    controlPoints: points, sectors, distanceMarkers, racingLine, turns });
}

function racerSlug(cfg) {
  return cfg.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function tintGhostActor(actor) {
  if (!actor || !actor.root) return;
  actor.root.traverse((object) => {
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material) continue;
      material.transparent = true;
      material.opacity = Math.min(Number(material.opacity) || 1, 0.28);
      material.depthWrite = false;
    }
  });
}

async function buildWorld(ev) {
  const cfg = TRACKS[ev.trackIndex];
  const layout = buildLayout(cfg);
  let center = buildCenterline(layout);
  if (ev.reverse) center = reverseCenterline(center);
  const response = await fetch('./tracks/' + racerSlug(cfg) + '.json');
  if (!response.ok) throw new Error('missing GGRacer track JSON for ' + cfg.name);
  const authored = await response.json();
  racerTrackJSON = ev.reverse ? reverseTrackJSON(authored) : authored;
  const features = buildRaceFeatures(cfg, center);
  const items = buildItemWorld(center);
  const carSpec = currentCar();
  playerSpec = carSpec;
  const grid = [10.5, 6.5, 2.8];
  const gridLat = [-0.42, 0.42, -0.12];
  const rivalSpecs = [CARS[1], CARS[2], CARS[3]];
  const rivals = rivalSpecs.map((spec, i) => ({
    spec, distance: grid[i], gridDistance: grid[i], lateral: gridLat[i], gridLateral: gridLat[i],
    speed: 0, pace: 0.95 + i * 0.018, line: gridLat[i], desiredLateral: gridLat[i],
    shielded: false, boostTimer: 0, gripTimer: 0, spinTimer: 0, spinPhase: 0, spinDir: 1,
    itemIndex: -1, itemUseDelay: 0, itemFlash: 0, braking: false, prevSpeed: 0,
    shortcutIndex: -1, shortcutLap: -1,
  }));
  const rec = eventRecord(ev.id);
  ghostPlay = validateGhost(rec.ghost);
  racer = createRacerWorld({
    canvas: sceneCanvas,
    trackJSON: racerTrackJSON,
    theme: racerTrackJSON.theme || 'desert',
    timeOfDay: racerTrackJSON.timeOfDay || (racerTrackJSON.theme === 'night-city' ? 'night' : 'dusk'),
    rivalCount: 4,
    ggkit: kit,
    paint: carSpec.body,
    accent: carSpec.accent,
    seed: cfg.seed + (ev.reverse ? 977 : 0),
  });
  tintGhostActor(racer.world.rivals[3]);
  track = { cfg, ev, layout, center, features, items, rivals,
    maxSpeed: 650 + cfg.difficulty * 34, ghostActor: racer.world.rivals[3] };
}

function prewarmScene() {
  if (!racer) return;
  racer.world.update(racerFrame, 1 / 60);
  racer.world.render();
  hud.warmFonts([10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 26, 28, 32, 36, 44, 52, 64]);
}

function reverseCenterline(center) {
  const src = center.nodes;
  const n = src.length;
  const nodes = [];
  let dist = 0;
  for (let i = 0; i < n; i++) {
    const a = src[(n - i) % n];
    const b = src[(n - i - 1 + n) % n];
    let dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    nodes.push({
      x: a.x, y: a.y, z: a.z,
      tx: dx, tz: dz, nx: dz, nz: -dx,
      heading: Math.atan2(dx, dz),
      dist, len,
      curve: -a.curve,
      obstacle: a.obstacle ? { x: -a.obstacle.x, kind: a.obstacle.kind } : null,
      stripe: a.stripe,
      feature: a.feature,
      bank: -a.bank || 0,
    });
    dist += len;
  }
  return { nodes, totalLength: dist };
}

// A ghost frame is [time, arcLength, lateral]. Timestamps must be finite,
// non-negative, strictly increasing and inside a plausible lap; arc length must
// be non-negative and monotonic; lateral stays inside the road envelope.
// Descending or duplicated timestamps used to pass and then break the binary
// search that drives playback.
function validateGhost(g) {
  if (!Array.isArray(g) || g.length < 4 || g.length > GHOST_MAX) return null;
  let lastT = -1, lastS = -1;
  for (let i = 0; i < g.length; i++) {
    const f = g[i];
    if (!Array.isArray(f) || f.length !== 3) return null;
    const t = f[0], s = f[1], lat = f[2];
    if (typeof t !== 'number' || !isFinite(t) || t < 0 || t > MAX_TIME) return null;
    if (typeof s !== 'number' || !isFinite(s) || s < 0 || s > 1e6) return null;
    if (typeof lat !== 'number' || !isFinite(lat) || Math.abs(lat) > 3) return null;
    if (t <= lastT || s < lastS) return null;
    lastT = t; lastS = s;
  }
  return g;
}

// Scratch centreline samples. Three are enough: A is the car's own node, B is
// any lookahead, C is one-shot use inside an emitter or the ghost.
const _sampA = {}, _sampB = {}, _sampC = {};
const _rivalSamples = [{}, {}, {}];

// ------------------------------------------------------------------ sim
function resetSim() {
  sim.s = 0; sim.lateral = 0; sim.speed = 0;
  sim.lap = 1; sim.lapTime = 0; sim.lapDist = 0; sim.totalTime = 0;
  sim.gear = 1; sim.rpm = 1800; sim.hitTimer = 0;
  sim.drifting = 0; sim.offRoad = 0; sim.finished = false;
  sim.lastNode = 0; sim.wheelSpin = 0; sim.damage = 0;
  sim.edgeHitTimer = 0; sim.jumpT = 0; sim.jumpNode = -1;
  sim.shielded = false; sim.boostTimer = 0; sim.gripTimer = 0;
  sim.spinTimer = 0; sim.spinPhase = 0; sim.spinDir = 1;
  sim.shortcutActive = false; sim.shortcutIndex = -1; sim.shortcutT = 0;
  sim.shortcutLane = 0; sim.boostPulse = 0; sim.secretPulse = 0;

  view.dip = 0; view.dipVel = 0;
  view.lean = 0; view.leanVel = 0;
  view.pitch = 0; view.pitchVel = 0;
  view.yawLag = 0; view.flash = 0;
  view.fov = 62;
  view.started = false;
  view.recoil = 0; view.recoilVel = 0;
  view.telegraph = 0;
  view.hitFlashPart = 0;
  view.hitSide = 1;
  view.fade = 0; view.fadeDir = 0;
  view.orbit = 0;
  view.lightning = 0; view.lightningNext = 2.4;
  view.clock = 0;
  view.carHeading = 0; view.carHeadingReady = false; view.carHeadingVel = 0;
  view.suspension = 0; view.suspensionVel = 0;
  view.boostKick = 0; view.boostKickVel = 0;
  view.carScale = 1;

  ghostRecord = [];
  ghostAccum = 0;
  ghostState.visible = false;
  ghostState.progress = 0;
  ghostState.speed = 0;
  ghostState.lateral = 0;
  ghostState.position.x = 0;
  ghostState.position.y = 0;
  ghostState.position.z = 0;
  ghostState.yaw = 0;

  itemState.heldIndex = -1;
  itemState.rouletteTarget = -1;
  itemState.rouletteTimer = 0;
  itemState.incomingFlash = 0;
  itemState.pickupFlash = 0;
  itemState.useFlash = 0;
  itemState.lastPickup = -1;
  resetItemRng(track ? track.cfg.seed * 97 + (track.ev.reverse ? 41 : 0) : 1);

  input.steer = 0; input.throttle = false; input.brake = false;
  input.steerPointerId = null; input.touchThrottle = false; input.touchBrake = false;

  resetRivals();

  message = ''; messageTime = 0; messageKind = '';
  finishInfo = null; ceremonyT = 0;

  if (track) {
    for (let i = 0; i < track.features.boostPads.length; i++) {
      const pad = track.features.boostPads[i];
      pad.lastLap = -1; pad.pulse = 0;
    }
    for (let i = 0; i < track.features.secrets.length; i++) {
      const secret = track.features.secrets[i];
      secret.lastLap = -1; secret.pulse = 0; secret.revealed = false;
      secret.rewardScale = 0;
      secret.rewardScale = 0;
    }
    track.items.nextPatch = 0;
    track.items.nextProjectile = 0;
    const cells = track.items.cells;
    for (let i = 0; i < cells.length; i++) {
      cells[i].available = true;
      cells[i].respawn = 0;
      cells[i].visibility = 1;
    }
    for (let i = 0; i < track.items.patches.length; i++) {
      const p = track.items.patches[i];
      p.active = false; p.expiring = false; p.visualScale = 0; p.life = 0;
    }
    for (let i = 0; i < track.items.projectiles.length; i++) {
      track.items.projectiles[i].active = false;
      track.items.projectiles[i].visualActive = false;
      track.items.projectiles[i].life = 0;
      track.items.projectiles[i].visualScale = 0;
    }
  }
}

// The screen-facing control already matches the world convention: the road
// normal is the prototype-defined lateral normal, so +1 (left input) pushes
// sim.lateral positive. Identity, applied exactly once; the round-2 negation
// here inverted play steering (its trace verified the cosmetic nose yaw, not
// the lateral position that places the car).
function worldSteer(screenSteer) { return screenSteer; }

function angleDelta(current, target) {
  return Math.atan2(Math.sin(target - current), Math.cos(target - current));
}

function resetRivals() {
  if (!track || !track.rivals) return;
  for (let i = 0; i < track.rivals.length; i++) {
    const r = track.rivals[i];
    r.distance = r.gridDistance;
    r.lateral = r.gridLateral;
    r.speed = 0;
    r.wheelSpin = 0;
    r.line = r.gridLateral;
    r.shielded = false;
    r.boostTimer = 0;
    r.gripTimer = 0;
    r.spinTimer = 0;
    r.spinPhase = 0;
    r.spinDir = 1;
    r.itemIndex = -1;
    r.itemUseDelay = 0;
    r.itemFlash = 0;
    r.desiredLateral = r.gridLateral;
    r.braking = false; r.prevSpeed = 0;
    r.shortcutIndex = -1; r.shortcutLap = -1;
  }
}

function playerDistance() {
  return (sim.lap - 1) * track.center.totalLength + sim.s;
}

function racePosition() {
  if (!track || !track.rivals) return 1;
  const pd = playerDistance();
  let pos = 1;
  for (const r of track.rivals) if (r.distance > pd) pos++;
  return pos;
}

function updateRivals(dt) {
  if (!track || !track.rivals) return;
  const length = track.center.totalLength;
  const pd = playerDistance();
  for (let i = 0; i < track.rivals.length; i++) {
    const r = track.rivals[i];
    if (mode === 'race') {
      r.boostTimer = Math.max(0, r.boostTimer - dt);
      r.gripTimer = Math.max(0, r.gripTimer - dt);
      r.itemUseDelay = Math.max(0, r.itemUseDelay - dt);
      r.itemFlash = Math.max(0, r.itemFlash - dt);
      if (r.spinTimer > 0) {
        r.spinTimer = Math.max(0, r.spinTimer - dt);
        r.spinPhase += dt * 13;
        r.speed = Math.max(70, r.speed * Math.max(0, 1 - dt * 0.62));
      }
      const gap = pd - r.distance;
      const rubber = clamp(gap / Math.max(length * 0.7, 1), -0.045, 0.055);
      const target = track.maxSpeed * r.spec.topSpeed * (r.pace + rubber
        + Math.sin(r.distance * 0.009 + i * 2.1) * 0.018);
      r.braking = target < r.speed - 18;
      r.prevSpeed = r.speed;
      r.speed += (target - r.speed) * Math.min(1, dt * 1.8);
      if (r.boostTimer > 0) r.speed += track.maxSpeed * 0.72 * dt;
      r.speed = Math.min(r.speed, track.maxSpeed * r.spec.topSpeed * (r.boostTimer > 0 ? 1.22 : 1));
      const s = r.distance % length;
      const lapNo = Math.floor(r.distance / length);
      if (r.shortcutIndex < 0 && track.features.shortcuts.length && (i + lapNo) % 3 === 0) {
        for (let k = 0; k < track.features.shortcuts.length; k++) {
          const sc = track.features.shortcuts[k];
          if (sc.lastAiLap === lapNo && sc.lastAiRival === i) continue;
          if (Math.abs(s - sc.entry) < 2.6 && Math.abs(r.lateral - sc.entryLane) < 0.82) {
            r.shortcutIndex = k;
            r.shortcutLap = lapNo;
            sc.lastAiLap = lapNo;
            sc.lastAiRival = i;
            r.boostTimer = Math.max(r.boostTimer, 0.45);
            break;
          }
        }
      }
      const shortcut = r.shortcutIndex >= 0 ? track.features.shortcuts[r.shortcutIndex] : null;
      if (shortcut && (lapNo !== r.shortcutLap || s > shortcut.exit)) r.shortcutIndex = -1;
      r.distance += r.speed * 0.10 * dt * (r.shortcutIndex >= 0 ? 1.12 : 1);
      const sample = sampleCenterline(track.center, s, _rivalSamples[i]);
      const curveLine = clamp(sample.curve * 0.43, -0.7, 0.7);
      const routeLine = r.shortcutIndex >= 0
        ? track.features.shortcuts[r.shortcutIndex].side * (0.78 + Math.sin(Math.max(0, Math.min(1,
          (s - track.features.shortcuts[r.shortcutIndex].entry) /
          Math.max(1, track.features.shortcuts[r.shortcutIndex].exit - track.features.shortcuts[r.shortcutIndex].entry))) * Math.PI) * 0.18)
        : curveLine;
      r.line += (routeLine - r.line) * Math.min(1, dt * 2.4);
      r.desiredLateral = r.line + Math.sin(r.distance * 0.012 + i) * 0.06;
    }
    for (let j = 0; j < track.rivals.length; j++) {
      if (j === i) continue;
      const other = track.rivals[j];
      if (Math.abs(r.distance - other.distance) < 7 && Math.abs(r.lateral - other.lateral) < 0.42) {
        r.desiredLateral += r.lateral >= other.lateral ? 0.16 : -0.16;
        r.speed *= 0.996;
      }
    }
    if (Math.abs(r.distance - pd) < 6 && Math.abs(r.lateral - sim.lateral) < 0.42 && mode === 'race') {
      r.desiredLateral += r.lateral >= sim.lateral ? 0.12 : -0.12;
      r.speed *= 0.994;
      if (Math.abs(r.distance - pd) < 2.3) sim.speed *= 0.996;
    }
    r.desiredLateral = clamp(r.desiredLateral, -1.3, 1.3);
    r.lateral += (r.desiredLateral - r.lateral) * Math.min(1, dt * 3.6);
  }
}

function triggerTrackBoost(label) {
  const topSpeed = track.maxSpeed * playerSpec.topSpeed;
  sim.boostTimer = Math.max(sim.boostTimer, 0.92);
  sim.speed = Math.min(topSpeed * 1.22, sim.speed + 42);
  sim.boostPulse = 1;
  view.boostKickVel += 3.2;
  sfx('boost', { volume: 0.52, rate: 1.06 });
  setMessage(label || 'BOOST LINE  -  HOLD THE APEX', 'good', 1.05);
}

function updateTrackFeatures(dt) {
  if (!track || !track.features) return;
  const features = track.features;
  const speed = sim.speed * 0.10;

  // Shortcut entry and exit are eased in centreline space. The main handling
  // loop stays intact, but the side route gives back time and a small boost.
  if (sim.shortcutActive) {
    const sc = features.shortcuts[sim.shortcutIndex];
    if (!sc) {
      sim.shortcutActive = false;
      sim.shortcutIndex = -1;
    } else {
      sim.shortcutT = clamp(sim.shortcutT + speed * dt / Math.max(70, (sc.exit - sc.entry) * 0.78), 0, 1);
      sim.s = lerp(sc.entry, sc.exit, sim.shortcutT);
      const lane = sc.side * (0.66 + Math.sin(sim.shortcutT * Math.PI) * 0.42);
      sim.shortcutLane = lane;
      sim.lateral += (lane - sim.lateral) * Math.min(1, dt * 5.2);
      if (sim.shortcutT >= 1) {
        sim.shortcutActive = false;
        sim.shortcutIndex = -1;
        sim.shortcutLane = 0;
      }
    }
  } else if (speed > 5) {
    for (let i = 0; i < features.shortcuts.length; i++) {
      const sc = features.shortcuts[i];
      if (sc.lastLap === sim.lap) continue;
      if (Math.abs(sim.s - sc.entry) < Math.max(2.8, speed * dt + 1.2)
        && Math.abs(sim.lateral - sc.entryLane) < 0.52) {
        sc.lastLap = sim.lap;
        sim.shortcutActive = true;
        sim.shortcutIndex = i;
        sim.shortcutT = 0;
        sim.shortcutLane = sc.entryLane;
        sim.boostTimer = Math.max(sim.boostTimer, 0.48);
        sim.boostPulse = 1;
        view.boostKickVel += 1.8;
        setMessage('SHORTCUT LINE  -  RISK REWARDED', 'good', 1.15);
        sfx('boost', { volume: 0.42, rate: 0.94 });
        break;
      }
    }
  }

  for (let i = 0; i < features.boostPads.length; i++) {
    const pad = features.boostPads[i];
    if (pad.lastLap === sim.lap) continue;
    if (loopGap(sim.s, pad.dist) < Math.max(3.1, speed * dt + 1.6)
      && Math.abs(sim.lateral - pad.lane) < 0.34) {
      pad.lastLap = sim.lap;
      pad.pulse = 1;
      triggerTrackBoost('BOOST PAD  -  APEX LINE');
      break;
    }
  }

  for (let i = 0; i < features.secrets.length; i++) {
    const secret = features.secrets[i];
    if (loopGap(playerDistance(), secret.dist) < 18 && Math.abs(sim.lateral - secret.lane) < 0.7) secret.revealed = true;
    if (secret.lastLap === sim.lap) continue;
    if (loopGap(sim.s, secret.dist) < Math.max(3.4, speed * dt + 1.8)
      && Math.abs(sim.lateral - secret.lane) < 0.46) {
      secret.lastLap = sim.lap;
      secret.pulse = 1;
      const reward = secret.rewardId === 'shield' ? 1 : secret.rewardId === 'repair' ? 5 : 0;
      if (itemState.heldIndex < 0) {
        itemState.heldIndex = reward;
        itemState.rouletteTarget = reward;
        itemState.rouletteTimer = 0.26;
        itemState.pickupFlash = 0.42;
        itemState.lastPickup = reward;
        setMessage('HIDDEN CACHE  -  ' + ITEM_DEFS[reward].label, 'good', 1.45);
      } else {
        triggerTrackBoost('HIDDEN CACHE  -  BOOST LINE');
      }
      emitItemBurstAt(secret.dist, secret.lane, reward);
      sfx('uiselect', { volume: 0.64, rate: 1.2 });
    }
  }
  sim.boostPulse = Math.max(0, sim.boostPulse - dt * 3.2);
  sim.secretPulse = Math.max(0, sim.secretPulse - dt * 2.8);
}

function updateTrackFeatureVisuals(dt) {
  if (!track || !track.features) return;
  for (const pad of track.features.boostPads) pad.pulse = Math.max(0, pad.pulse - dt * 2.7);
  for (const secret of track.features.secrets) {
    secret.pulse = Math.max(0, secret.pulse - dt * 2.5);
    const near = loopGap(playerDistance(), secret.dist) < 16 && Math.abs(sim.lateral - secret.lane) < 0.75;
    secret.revealed = secret.revealed || near;
    const target = secret.revealed ? 1 : 0;
    secret.rewardScale += (target - secret.rewardScale) * Math.min(1, dt * 7);
  }
}

// Prototype handling model, ported to arc-length space. All named constants
// below are the prototype's; only the units they act on changed.
function stepSim(dt) {
  const cfg = track.cfg;
  const maxSpeed = track.maxSpeed;
  const car = playerSpec;
  const topSpeed = maxSpeed * car.topSpeed;
  sim.boostTimer = Math.max(0, sim.boostTimer - dt);
  sim.gripTimer = Math.max(0, sim.gripTimer - dt);
  const speedCap = topSpeed * (sim.boostTimer > 0 ? 1.24 : 1);

  let throttle = input.throttle ? 1 : 0.35;
  if (input.brake) throttle = -1;
  sim.speed += throttle * 570 * car.accel * dt;
  if (!input.throttle && !input.brake) sim.speed += 105 * dt;
  if (input.brake) sim.speed -= 260 * dt;
  if (sim.boostTimer > 0) sim.speed += 720 * car.accel * dt;
  sim.speed = clamp(sim.speed, 0, speedCap);

  const node = sampleCenterline(track.center, sim.s, _sampA);
  const speedFrac = sim.speed / speedCap;

  // Prototype outward push: beyond a difficulty-scaled speed threshold the
  // corner throws you wide. Car grip scales the threshold, not the maths.
  const gripBias = (0.64 - cfg.difficulty * 0.018) * car.grip
    * (sim.gripTimer > 0 ? 1.18 : 1);
  const curveDanger = Math.max(0, speedFrac - gripBias);
  // Corner load is intentionally strong enough that a held accelerator with
  // zero steering leaves the road in the first technical sector. Steering
  // into the apex counters it; the racing line then returns the speed.
  const outward = node.curve * curveDanger * (5.2 + cfg.difficulty * 0.25);
  const lineTarget = clamp(node.curve * 0.38, -0.72, 0.72);
  const lineError = Math.abs(sim.lateral - lineTarget);

  // Braking mid-corner breaks traction: the drift channel. Rear steps out,
  // grip falls off, and the car keeps more of its lateral rate.
  const wantDrift = input.brake && speedFrac > 0.45 && Math.abs(input.steer) > 0.25;
  sim.drifting = clamp(sim.drifting + (wantDrift ? dt * 4.2 : -dt * 2.6), 0, 1);
  const gripFalloff = (1 - sim.drifting * 0.42) * (sim.gripTimer > 0 ? 1.12 : 1);

  // Lateral authority is a translation of the car across the road, so it has
  // to fall to zero with road speed: a stopped car used to keep sliding
  // sideways under steering input. Below ~8% of top speed the wheels turn
  // (the visual yaw in updateView still responds) but the body does not
  // translate.
  const rollFrac = clamp(speedFrac / 0.08, 0, 1);
  const steerAuthority = (0.83 + speedFrac * 0.85) * (0.85 + car.grip * 0.15) * rollFrac;
  const steer = worldSteer(input.steer);
  sim.lateral += (steer * steerAuthority + outward) * dt;
  if (sim.spinTimer > 0) {
    sim.spinTimer = Math.max(0, sim.spinTimer - dt);
    sim.spinPhase += dt * 13;
    sim.speed = Math.max(70, sim.speed * Math.max(0, 1 - dt * 0.62));
    sim.lateral += Math.sin(sim.spinPhase) * 0.14 * dt * sim.spinDir;
  }
  sim.lateral *= 1 - dt * 0.72 * gripFalloff;
  sim.lateral = clamp(sim.lateral, -1.45, 1.45);

  // Off-road penalty, prototype thresholds preserved.
  const absLat = Math.abs(sim.lateral);
  sim.offRoad = absLat > 0.94 ? 1 : 0;
  if (absLat > 0.94) {
    sim.speed *= Math.max(0, 1 - dt * (2.0 + cfg.difficulty * 0.10) / car.grip);
  }
  if (absLat > 1.02) {
    sim.speed *= Math.max(0, 1 - dt * (4.8 + cfg.difficulty * 0.2));
    // A no-steer hold stays pressed against the outer wall. A driver who
    // turns back toward the road gets to leave the corridor normally.
    if (Math.abs(input.steer) < 0.12) sim.lateral = sim.lateral < 0 ? -1.08 : 1.08;
    if (sim.edgeHitTimer <= 0) {
      sim.edgeHitTimer = 0.38;
      sim.hitTimer = Math.max(sim.hitTimer, 0.22);
      sim.damage = 0.55;
      setMessage('WALL SCRUB  -  LIFT OR TURN', 'bad', 0.9);
      if (!reducedMotion()) view.flash = 0.08;
      sfx('scrape', { volume: 0.38, rate: 0.72 + speedFrac * 0.28 });
    }
  }

  sim.speed = clamp(sim.speed, 0, speedCap);
  // A clean apex gives back a small amount of speed. Missing it costs more
  // through the existing rumble and wall scrub, so the racing line is a real
  // reward rather than a painted suggestion.
  if (Math.abs(node.curve) > 0.24 && lineError < 0.18) {
    sim.speed = Math.min(topSpeed, sim.speed + dt * 18 * (1 - lineError / 0.18));
  }

  // Advance along the centreline. Arc length uses prototype speed units
  // scaled to world metres so the lap timings match the medal table.
  const worldSpeed = sim.speed * 0.10;
  sim.s += worldSpeed * dt;
  sim.lapDist += worldSpeed * dt;
  sim.wheelSpin += worldSpeed * dt / playerSpec.wheelRadius;
  updateTrackFeatures(dt);

  sim.lapTime += dt;
  sim.totalTime += dt;
  sim.hitTimer = Math.max(0, sim.hitTimer - dt);
  sim.edgeHitTimer = Math.max(0, sim.edgeHitTimer - dt);
  sim.damage = Math.max(0, sim.damage - dt * 0.55);

  // Crest/jump beat. The road mesh carries the rise, while the car gets a
  // short physical lift at speed so the feature is felt as well as seen.
  if (node.feature !== 'crest') sim.jumpNode = -1;
  if (node.feature === 'crest' && sim.jumpNode < 0 && sim.speed > topSpeed * 0.34) {
    sim.jumpNode = node.index;
    sim.jumpT = 0.62;
    sim.speed *= 0.985;
  }
  sim.jumpT = Math.max(0, sim.jumpT - dt);

  // Obstacle contact on node crossings only (cheap, and matches the
  // prototype's per-segment test).
  const nodeIdx = node.index;
  if (nodeIdx !== sim.lastNode) {
    const nodes = track.center.nodes;
    let i = sim.lastNode;
    let guard = 0;
    while (i !== nodeIdx && guard++ < 8) {
      i = (i + 1) % nodes.length;
      const ob = nodes[i].obstacle;
      if (ob && Math.abs(sim.lateral - ob.x) < 0.22) { hitObstacle(); break; }
    }
    sim.lastNode = nodeIdx;
  }

  // Anticipation beat. Look 80 ms up the road: if an obstacle is already inside
  // the contact corridor and there is no longer time to steer out of it, raise
  // the telegraph so the hit is announced before it lands rather than only
  // reported after. Deterministic, cosmetic-only output.
  {
    const lead = worldSpeed * 0.08;
    let tele = 0;
    if (lead > 0.5) {
      const ahead = sampleCenterline(track.center, sim.s + lead, _sampB);
      const nodes = track.center.nodes;
      for (let k = 0; k < 3; k++) {
        const ob = nodes[(ahead.index + k) % nodes.length].obstacle;
        if (ob && Math.abs(sim.lateral - ob.x) < 0.3) {
          tele = Math.max(tele, 1 - k * 0.25);
        }
      }
    }
    view.telegraph = tele;
  }

  // Gear + RPM, prototype formulae verbatim.
  const prevGear = sim.gear;
  const ratio = sim.speed / topSpeed;
  sim.gear = clamp(1 + Math.floor(ratio * 5.9), 1, 6);
  const gearStart = (sim.gear - 1) / 6, gearEnd = sim.gear / 6;
  sim.rpm = 1900 + clamp((ratio - gearStart) / (gearEnd - gearStart), 0, 1) * 5200;
  if (sim.gear !== prevGear) {
    sfx('gearshift', { volume: 0.35, rate: sim.gear > prevGear ? 1.1 : 0.85 });
  }

  // Lap + finish
  if (sim.s >= track.center.totalLength) {
    sim.s -= track.center.totalLength;
    onLapComplete();
  }
}

function actorDistance(actor) {
  return actor < 0 ? playerDistance() : track.rivals[actor].distance;
}

function actorLateral(actor) {
  return actor < 0 ? sim.lateral : track.rivals[actor].lateral;
}

function loopGap(a, b) {
  const length = track.center.totalLength;
  const d = Math.abs(a - b) % length;
  return Math.min(d, length - d);
}

function racePositionForDistance(distance) {
  let position = distance < playerDistance() ? 2 : 1;
  for (let i = 0; i < track.rivals.length; i++) {
    if (track.rivals[i].distance > distance) position++;
  }
  return clamp(position, 1, FIELD_SIZE);
}

function emitItemBurstAt(distance, lane, itemIndex) {
  // Item feedback remains in the HUD. GGRacer owns all world FX, so the old
  // title particle burst is intentionally not recreated here.
  itemState.useFlash = Math.max(itemState.useFlash, reducedMotion() ? 0.18 : 0.35);
}

function setShield(actor, active) {
  if (actor < 0) {
    sim.shielded = active;
  } else {
    const r = track.rivals[actor];
    r.shielded = active;
  }
}

function absorbShield(actor) {
  if (actor < 0 ? sim.shielded : track.rivals[actor].shielded) {
    setShield(actor, false);
    emitItemBurstAt(actorDistance(actor), actorLateral(actor), 1);
    if (actor < 0) {
      itemState.incomingFlash = 0;
      setMessage('SHIELD HELD  -  IMPACT BLOCKED', 'good', 1.5);
      sfx('boost', { volume: 0.46, rate: 1.28 });
    }
    return true;
  }
  return false;
}

function beginPlayerSpin(side, messageText) {
  if (sim.hitTimer > 0.08) return;
  sim.hitTimer = 0.7;
  sim.spinTimer = 0.72;
  sim.spinPhase = 0;
  sim.spinDir = side || 1;
  sim.speed = Math.max(74, sim.speed * 0.58);
  sim.damage = 1;
  view.hitSide = sim.spinDir;
  view.hitFlashPart = 3;
  view.recoilVel -= 7.5 * sim.spinDir;
  if (!reducedMotion()) view.flash = 0.14;
  kit.juice.shake(Math.min(H * 0.02, 12), 220);
  kit.juice.hitStop(45);
  // GGRacer owns world impact FX; keep the title-side feedback channel alive
  // without reviving the deleted particle renderer.
  itemState.useFlash = Math.max(itemState.useFlash, 0.35);
  sfx('collide', { volume: 0.72, rate: 1.05 });
  setMessage(messageText || 'BOLT IMPACT  -  RECOVER', 'bad', 1.2);
}

function beginRivalSpin(rival, side) {
  if (rival.shielded) return;
  rival.spinTimer = 0.72;
  rival.spinPhase = 0;
  rival.spinDir = side || 1;
  rival.speed = Math.max(70, rival.speed * 0.58);
  rival.itemFlash = 0.32;
}

function hitActor(target, source, label) {
  if (absorbShield(target)) return true;
  if (target < 0) {
    const side = actorLateral(target) >= actorLateral(source) ? -1 : 1;
    beginPlayerSpin(side, label);
    return true;
  }
  const rival = track.rivals[target];
  const side = rival.lateral >= actorLateral(source) ? 1 : -1;
  beginRivalSpin(rival, side);
  return true;
}

function pickUpItem(actor, cell) {
  if (!cell.available) return;
  const position = racePositionForDistance(actorDistance(actor));
  const itemIndex = rollItem(position);
  cell.available = false;
  cell.respawn = 4.2;
  emitItemBurstAt(cell.dist, cell.lane, itemIndex);
  if (actor < 0) {
    itemState.heldIndex = itemIndex;
    itemState.rouletteTarget = itemIndex;
    itemState.rouletteTimer = 0.48;
    itemState.pickupFlash = 0.44;
    itemState.lastPickup = itemIndex;
    setMessage('SUPPLY CELL  -  ' + ITEM_DEFS[itemIndex].label, 'good', 1.5);
    sfx('uiselect', { volume: 0.72, rate: 1.1 });
  } else {
    const r = track.rivals[actor];
    r.itemIndex = itemIndex;
    r.itemUseDelay = 0.28;
    r.itemFlash = 0.35;
    sfx('uiselect', { volume: 0.16, rate: 0.92 + actor * 0.06 });
  }
}

function updateItemCells(dt) {
  const cells = track.items.cells;
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    if (!cell.available) {
      cell.respawn -= dt;
      if (cell.respawn <= 0) { cell.available = true; cell.respawn = 0; }
    }
    const targetVisibility = cell.available ? 1 : 0;
    cell.visibility += (targetVisibility - cell.visibility) * Math.min(1, dt * 9);
    cell.pulse += reducedMotion() ? 0 : dt;
  }
}

function tryItemPickups() {
  const cells = track.items.cells;
  const pd = playerDistance();
  if (itemState.heldIndex < 0) {
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      if (cell.available && loopGap(pd, cell.dist) < 4.6 && Math.abs(sim.lateral - cell.lane) < 0.34) {
        pickUpItem(-1, cell);
        break;
      }
    }
  }
  for (let r = 0; r < track.rivals.length; r++) {
    const rival = track.rivals[r];
    if (rival.itemIndex >= 0) continue;
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      if (cell.available && loopGap(rival.distance, cell.dist) < 4.6
        && Math.abs(rival.lateral - cell.lane) < 0.42) {
        pickUpItem(r, cell);
        break;
      }
    }
  }
}

function findTargetAhead(owner) {
  const start = actorDistance(owner);
  let target = -2;
  let best = Infinity;
  if (owner !== -1) {
    const pd = playerDistance();
    if (pd > start && pd - start < 110) { target = -1; best = pd; }
  }
  for (let i = 0; i < track.rivals.length; i++) {
    if (i === owner) continue;
    const d = track.rivals[i].distance;
    if (d > start && d - start < 110 && d < best) {
      target = i;
      best = d;
    }
  }
  return target;
}

function dropSlick(owner) {
  const itemWorld = track.items;
  const patch = itemWorld.patches[itemWorld.nextPatch];
  itemWorld.nextPatch = (itemWorld.nextPatch + 1) % itemWorld.patches.length;
  patch.active = true;
  patch.expiring = false;
  patch.visualScale = 0;
  patch.life = 12;
  patch.s = actorDistance(owner) - 3.2;
  patch.lane = actorLateral(owner);
  patch.owner = owner;
  patch.ownerSafe = 0.8;
  emitItemBurstAt(patch.s, patch.lane, 2);
}

function spawnBolt(owner, homing, laneOffset) {
  const target = findTargetAhead(owner);
  if (target === -2) return false;
  const itemWorld = track.items;
  const bolt = itemWorld.projectiles[itemWorld.nextProjectile];
  itemWorld.nextProjectile = (itemWorld.nextProjectile + 1) % itemWorld.projectiles.length;
  bolt.active = true;
  bolt.visualActive = true;
  bolt.homing = homing;
  bolt.distance = actorDistance(owner) + 2.4;
  bolt.lane = actorLateral(owner) + (laneOffset || 0);
  bolt.speed = homing ? 74 : 84;
  bolt.life = 1.65;
  bolt.visualScale = 0;
  bolt.owner = owner;
  bolt.target = target;
  bolt.telegraphed = false;
  return true;
}

function useActorItem(actor, itemIndex) {
  if (itemIndex < 0) return false;
  if (actor < 0) {
    const topSpeed = track.maxSpeed * playerSpec.topSpeed;
    if (itemIndex === 0) {
      sim.boostTimer = 1.35;
      sim.speed = Math.min(topSpeed * 1.22, sim.speed + 120);
      view.boostKickVel += 3.2;
      sfx('boost', { volume: 0.72, rate: 1.12 });
      setMessage('NITRO SURGE  -  CLEAN LINE', 'good', 1.2);
    } else if (itemIndex === 1) {
      setShield(-1, true);
      sfx('boost', { volume: 0.48, rate: 0.78 });
      setMessage('SHIELD BUBBLE  -  ONE HIT HELD', 'good', 1.4);
    } else if (itemIndex === 2) {
      dropSlick(-1);
      sfx('skid', { volume: 0.48, rate: 1.12 });
      setMessage('SLICK PATCH  -  DROPPED BEHIND', 'info', 1.3);
    } else if (itemIndex === 3) {
      if (!spawnBolt(-1, true, 0)) return false;
      sfx('beep', { volume: 0.52, rate: 1.32 });
      setMessage('HOMING BOLT  -  TARGET LOCKED', 'info', 1.3);
    } else if (itemIndex === 4) {
      if (!spawnBolt(-1, false, -0.25)) return false;
      spawnBolt(-1, false, 0.25);
      sfx('beep', { volume: 0.58, rate: 1.18 });
      setMessage('TWIN BOLTS  -  STRAIGHT AHEAD', 'info', 1.3);
    } else if (itemIndex === 5) {
      sim.damage = 0;
      sim.drifting = 0;
      sim.hitTimer = 0;
      sim.spinTimer = 0;
      sim.gripTimer = 3.0;
      sfx('checkpoint', { volume: 0.58, rate: 1.22 });
      setMessage('REPAIR KIT  -  GRIP RESTORED', 'good', 1.5);
    }
    return true;
  }

  const rival = track.rivals[actor];
  if (itemIndex === 0) rival.boostTimer = 1.25;
  else if (itemIndex === 1) setShield(actor, true);
  else if (itemIndex === 2) dropSlick(actor);
  else if (itemIndex === 3) {
    if (!spawnBolt(actor, true, 0)) return false;
  } else if (itemIndex === 4) {
    if (!spawnBolt(actor, false, -0.25)) return false;
    spawnBolt(actor, false, 0.25);
  } else if (itemIndex === 5) {
    rival.spinTimer = 0;
    rival.gripTimer = 3;
  }
  rival.itemFlash = 0.38;
  return true;
}

function useHeldItem() {
  if (mode !== 'race' || itemState.heldIndex < 0 || itemState.rouletteTimer > 0) return;
  const itemIndex = itemState.heldIndex;
  if (!useActorItem(-1, itemIndex)) return;
  itemState.heldIndex = -1;
  itemState.useFlash = 0.42;
}

function updateAIItems() {
  for (let i = 0; i < track.rivals.length; i++) {
    const rival = track.rivals[i];
    if (rival.itemIndex < 0 || rival.itemUseDelay > 0) continue;
    const sample = sampleCenterline(track.center, rival.distance % track.center.totalLength, _rivalSamples[i]);
    const target = findTargetAhead(i);
    const behindPlayer = playerDistance() < rival.distance && rival.distance - playerDistance() < 32;
    let use = false;
    if (rival.itemIndex === 0) use = Math.abs(sample.curve) < 0.28 && rival.speed > track.maxSpeed * 0.44;
    else if (rival.itemIndex === 1) use = behindPlayer || racePositionForDistance(rival.distance) <= 2;
    else if (rival.itemIndex === 2) use = target !== -2 || behindPlayer;
    else if (rival.itemIndex === 3 || rival.itemIndex === 4) use = target !== -2;
    else if (rival.itemIndex === 5) use = rival.spinTimer > 0 || rival.gripTimer < 0.05;
    if (use && useActorItem(i, rival.itemIndex)) {
      rival.itemIndex = -1;
      rival.itemUseDelay = 0.38;
      rival.itemFlash = 0.42;
      sfx('uiselect', { volume: 0.13, rate: 0.8 + i * 0.08 });
    }
  }
}

function updateSlickPatches(dt) {
  const patches = track.items.patches;
  const pd = playerDistance();
  for (let i = 0; i < patches.length; i++) {
    const patch = patches[i];
    if (!patch.active) continue;
    if (patch.expiring) {
      patch.visualScale = Math.max(0, patch.visualScale - dt * 6);
      if (patch.visualScale <= 0.01) {
        patch.active = false;
      }
      continue;
    }
    patch.life -= dt;
    patch.ownerSafe = Math.max(0, patch.ownerSafe - dt);
    if (patch.life <= 0) {
      patch.expiring = true;
      continue;
    }
    patch.visualScale += (1 - patch.visualScale) * Math.min(1, dt * 9);
    if ((patch.owner !== -1 || patch.ownerSafe <= 0)
      && loopGap(pd, patch.s) < 4.1 && Math.abs(sim.lateral - patch.lane) < 0.42) {
      patch.expiring = true;
      if (!absorbShield(-1)) beginPlayerSpin(patch.lane >= sim.lateral ? -1 : 1, 'SLICK PATCH  -  RECOVER');
      emitItemBurstAt(pd, sim.lateral, 2);
      continue;
    }
    for (let r = 0; r < track.rivals.length; r++) {
      if (patch.owner === r && patch.ownerSafe > 0) continue;
      const rival = track.rivals[r];
      if (loopGap(rival.distance, patch.s) < 4.1 && Math.abs(rival.lateral - patch.lane) < 0.42) {
        patch.expiring = true;
        if (!rival.shielded) beginRivalSpin(rival, rival.lateral >= patch.lane ? 1 : -1);
        else absorbShield(r);
        break;
      }
    }
  }
}

function updateProjectiles(dt) {
  const projectiles = track.items.projectiles;
  for (let i = 0; i < projectiles.length; i++) {
    const bolt = projectiles[i];
    if (!bolt.active && !bolt.visualActive) continue;
    if (!bolt.active) {
      bolt.visualScale = Math.max(0, bolt.visualScale - dt * 10);
      if (bolt.visualScale <= 0.01) {
        bolt.visualActive = false;
      }
      continue;
    }
    bolt.life -= dt;
    bolt.visualScale += (1 - bolt.visualScale) * Math.min(1, dt * 12);
    if (bolt.life <= 0) {
      bolt.active = false;
      continue;
    }
    const targetDistance = actorDistance(bolt.target);
    const targetLane = actorLateral(bolt.target);
    if (bolt.homing) {
      bolt.lane += (targetLane - bolt.lane) * Math.min(1, dt * 5.4);
      if (bolt.target === -1 && !bolt.telegraphed && targetDistance - bolt.distance < 34) {
        bolt.telegraphed = true;
        itemState.incomingFlash = 1;
        sfx('beep', { volume: 0.6, rate: 1.48 });
        setMessage('INCOMING HOMING BOLT', 'bad', 0.85);
      }
    }
    bolt.distance += bolt.speed * dt;
    const gap = targetDistance - bolt.distance;
    if (gap < bolt.speed * dt + 1.5 && gap > -4.5 && Math.abs(targetLane - bolt.lane) < 0.66) {
      hitActor(bolt.target, bolt.owner, bolt.homing ? 'HOMING BOLT  -  RECOVER' : 'BOLT IMPACT  -  RECOVER');
      bolt.active = false;
      emitItemBurstAt(targetDistance, targetLane, bolt.homing ? 3 : 4);
      continue;
    }
  }
}

function updateItemWorld(dt) {
  updateItemCells(dt);
  tryItemPickups();
  updateAIItems();
  updateSlickPatches(dt);
  updateProjectiles(dt);
  itemState.rouletteTimer = Math.max(0, itemState.rouletteTimer - dt);
  itemState.incomingFlash = Math.max(0, itemState.incomingFlash - dt * 2.8);
  itemState.pickupFlash = Math.max(0, itemState.pickupFlash - dt * 2.5);
  itemState.useFlash = Math.max(0, itemState.useFlash - dt * 2.5);
}

function onLapComplete() {
  const rec = eventRecord(event.id);
  const lapTime = sim.lapTime;
  let newBest = false;
  if (!rec.bestLap || lapTime < rec.bestLap) {
    rec.bestLap = lapTime;
    newBest = true;
    // Ghost is the best LAP, stored as [t, lapDistance, lateral] samples.
    // The exact lap-boundary sample is appended before saving so playback runs
    // the ghost all the way to the line instead of dropping it a tenth early.
    if (ghostRecord && ghostRecord.length >= 4) {
      const last = ghostRecord[ghostRecord.length - 1];
      if (lapTime > last[0] && sim.lapDist >= last[1] && ghostRecord.length < GHOST_MAX) {
        ghostRecord.push([lapTime, sim.lapDist, sim.lateral]);
      }
      if (ghostRecord.length <= GHOST_MAX) {
        rec.ghost = ghostRecord.map((f) => [
          Math.round(f[0] * 1000) / 1000,
          Math.round(f[1] * 100) / 100,
          Math.round(f[2] * 1000) / 1000,
        ]);
        // A record that would not survive its own loader is not written.
        if (!validateGhost(rec.ghost)) rec.ghost = null;
      }
    }
    persist();
  }
  ghostRecord = [];
  ghostAccum = 0;

  sim.lapTime = 0;
  sim.lapDist = 0;
  sim.lap++;
  if (!reducedMotion()) view.flash = 0.28;
  sfx(newBest ? 'checkpoint' : 'lapchime', { volume: 0.6 });
  chipPop('lap');

  if (sim.lap > LAPS) {
    finishRace();
  } else {
    setMessage(newBest ? 'NEW BEST LAP  ' + formatTime(lapTime)
      : 'LAP ' + (sim.lap - 1) + ' COMPLETE  ' + formatTime(lapTime),
      newBest ? 'good' : 'info', newBest ? 3 : 2.4);
  }
}

// Impact language, three beats:
//   anticipation  view.telegraph rises for ~80 ms before contact (stepSim)
//   contact       speed loss, localized struck-part flash, directional shard
//                 burst and sparks, screen shake and hit-stop
//   follow-through chassis recoil on an under-damped spring with exactly one
//                 visible overshoot, plus the vignette settling back
function hitObstacle() {
  if (sim.hitTimer > 0) return;
  view.telegraph = 0;
  if (absorbShield(-1)) return;
  view.dipVel -= 9;
  beginPlayerSpin(sim.lateral >= 0 ? 1 : -1, 'CONTACT  -  SPEED LOST');
}

function setMessage(text, kind, time) {
  message = text; messageKind = kind || 'info'; messageTime = time == null ? 2 : time;
}

function finishRace() {
  sim.finished = true;
  const total = sim.totalTime;
  const rec = eventRecord(event.id);
  const medal = total <= event.gold ? 'GOLD'
    : total <= event.silver ? 'SILVER'
    : total <= event.bronze ? 'BRONZE' : '';
  const prevMedal = rec.medal || '';
  const improved = MEDAL_ORDER[medal] > MEDAL_ORDER[prevMedal];
  if (improved) rec.medal = medal;
  const prevBest = rec.best || 0;
  if (!prevBest || total < prevBest) rec.best = total;

  const beforeGold = goldCount();
  persist();
  const unlocked = CARS.filter((c) => c.unlock > 0 && c.unlock <= goldCount()
    && c.unlock > (beforeGold - (improved && medal === 'GOLD' ? 1 : 0)));

  // There is no event after the last one. The button used to clamp to the
  // final index and restart the same race; it now becomes the ladder exit.
  const idx = EVENTS.indexOf(event);
  const next = idx >= 0 && idx < EVENTS.length - 1 ? EVENTS[idx + 1] : null;

  finishInfo = {
    total, medal, improved, prevBest,
    bestLap: rec.bestLap, best: rec.best,
    standing: racePosition(), field: FIELD_SIZE,
    unlocked: unlocked.length ? unlocked[0] : null,
    nextEvent: next,
    isLast: next === null,
  };
  ceremonyT = 0;
  mode = 'finish';
  engine.stop();
  if (!reducedMotion()) view.flash = 0.34;
  sfx('fanfare', { volume: 0.8 });
  music.play('menu');
  if (!save.tutorialDone) { save.tutorialDone = true; persist(); }
}

// ------------------------------------------------------------------- view
// The title keeps cosmetic motion channels for HUD and engine car state. Camera
// placement, roll, FOV, speed streaks, particles, and shadows belong to GGRacer.
const ghostState = {
  visible: false, progress: 0, speed: 0, lateral: 0,
  position: { x: 0, y: 0, z: 0 }, yaw: 0,
};
function actorFrame() {
  return {
    progress: 0, speed: 0, steering: 0, acceleration: 0, lateralG: 0,
    suspension: 0, brake: 0, boost: 0, position: { x: 0, y: 0, z: 0 }, yaw: 0,
  };
}
const racerFrame = {
  carState: actorFrame(),
  rivals: [actorFrame(), actorFrame(), actorFrame(), actorFrame()],
};

function updateView(dt, frozen, shake) {
  if (!frozen) view.clock += dt;
  const node = sampleCenterline(track.center, sim.s, _sampA);
  const lat = sim.lateral * ROAD_HALF;
  const px = node.x + node.nx * lat;
  const pz = node.z + node.nz * lat;
  const py = node.y;
  const steer = worldSteer(input.steer);
  // Screen-left is a negative yaw delta in the world convention. This is the
  // only title-side steering-to-heading mapping sent to GGRacer.
  const slide = clamp(-steer * 0.16 - sim.drifting * steer * 0.34, -0.7, 0.7);
  const spinVisual = sim.spinTimer > 0
    ? Math.sin(sim.spinPhase) * 0.34 * (sim.spinTimer / 0.72) * sim.spinDir : 0;
  const targetHeading = node.heading + slide + spinVisual;
  if (!view.carHeadingReady) { view.carHeading = targetHeading; view.carHeadingReady = true; }
  else view.carHeading += angleDelta(view.carHeading, targetHeading) * Math.min(1, dt * 13);
  const speedFrac = clamp(sim.speed / track.maxSpeed, 0, 1);
  const crestTarget = node.feature === 'crest' ? speedFrac * 0.28 : 0;
  if (!frozen) {
    const targetLean = -clamp(steer * 0.9 + sim.lateral * 0.35, -1, 1) * 0.13 - sim.drifting * steer * 0.06;
    const accelSign = input.brake ? -1 : (input.throttle ? 1 : -0.15);
    const targetPitch = -accelSign * 0.045 * (0.35 + sim.speed / track.maxSpeed);
    spring(view, 'lean', 'leanVel', targetLean, 280, 17, dt);
    spring(view, 'pitch', 'pitchVel', targetPitch, 240, 16, dt);
    spring(view, 'dip', 'dipVel', 0, 200, 14, dt);
    spring(view, 'suspension', 'suspensionVel', crestTarget, 170, 16, dt);
    spring(view, 'boostKick', 'boostKickVel', sim.boostTimer > 0 ? 1 : 0, 125, 18, dt);
    spring(view, 'recoil', 'recoilVel', 0, 150, 7.5, dt);
  }
  view.hitFlashPart = Math.max(0, view.hitFlashPart - 1);
  return { node, px, py, pz, heading: view.carHeading, speedFrac };
}

function setActorFrame(frame, sample, lateral, speed, steering, brake, boost, yaw) {
  const lat = lateral * ROAD_HALF;
  frame.progress = sample.progress == null ? 0 : sample.progress;
  frame.speed = speed * 0.10;
  frame.steering = steering || 0;
  frame.acceleration = 0;
  frame.lateralG = steering * frame.speed * 0.014;
  frame.suspension = 0;
  frame.brake = brake || 0;
  frame.boost = boost || 0;
  frame.position.x = sample.x + sample.nx * lat;
  frame.position.y = sample.y;
  frame.position.z = sample.z + sample.nz * lat;
  frame.yaw = Number.isFinite(yaw) ? yaw : sample.heading;
}

function updateRacerFrame(dt, place) {
  if (!racer || !track || !place) return;
  const length = track.center.totalLength;
  const player = racerFrame.carState;
  setActorFrame(player, place.node, sim.lateral, sim.speed, input.steer,
    input.brake ? 1 : 0, sim.boostTimer > 0 ? 1 : 0, place.heading);
  player.progress = ((sim.s % length) + length) % length / length;
  player.position.y += sim.jumpT > 0 ? Math.sin((0.62 - sim.jumpT) / 0.62 * Math.PI) * 1.35 : 0;
  player.suspension = view.suspension;
  player.pitch = view.pitch;
  player.roll = view.lean + view.recoil * 0.045;
  for (let i = 0; i < track.rivals.length; i += 1) {
    const rival = track.rivals[i];
    const sample = sampleCenterline(track.center, rival.distance % length, _rivalSamples[i]);
    setActorFrame(racerFrame.rivals[i], sample, rival.lateral, rival.speed, 0,
      rival.braking ? 1 : 0, rival.boostTimer > 0 ? 1 : 0, sample.heading);
    racerFrame.rivals[i].progress = (rival.distance % length + length) % length / length;
  }
  const ghost = racerFrame.rivals[3];
  if (ghostState.visible) {
    ghost.progress = ghostState.progress;
    ghost.speed = ghostState.speed;
    ghost.steering = 0;
    ghost.acceleration = 0;
    ghost.lateralG = 0;
    ghost.brake = 0;
    ghost.boost = 0;
    ghost.position.x = ghostState.position.x;
    ghost.position.y = ghostState.position.y;
    ghost.position.z = ghostState.position.z;
    ghost.yaw = ghostState.yaw;
  } else {
    ghost.progress = 0.99;
    ghost.speed = 0;
    ghost.position.x = 0; ghost.position.y = -100; ghost.position.z = 0;
  }
  if (track.ghostActor) track.ghostActor.root.visible = ghostState.visible;
  racer.world.update(racerFrame, dt);
}

function spring(obj, valKey, velKey, target, stiffness, damping, dt) {
  const a = (target - obj[valKey]) * stiffness - obj[velKey] * damping;
  obj[velKey] += a * dt;
  obj[valKey] += obj[velKey] * dt;
}

// ------------------------------------------------------------------ ghost
// Samples are [lapTime, lapDistance, lateral]. Recording the distance channel
// is the whole point: the ghost used to be reconstructed from elapsed-time
// fraction, which places a braking lap at a constant speed and makes both the
// shell position and the delta wrong.
function updateGhostRecord(dt) {
  if (!ghostRecord) return;
  ghostAccum += dt;
  const step = 1 / GHOST_HZ;
  while (ghostAccum >= step) {
    ghostAccum -= step;
    if (ghostRecord.length < GHOST_MAX) {
      const last = ghostRecord.length ? ghostRecord[ghostRecord.length - 1] : null;
      // Strictly increasing on both channels, so the record always survives
      // its own validator and the playback search.
      if (!last || (sim.lapTime > last[0] && sim.lapDist >= last[1])) {
        ghostRecord.push([sim.lapTime, sim.lapDist, sim.lateral]);
      }
    }
  }
}

// Binary search the sample pair bracketing a value in channel `ch`.
function ghostSeek(ch, value) {
  let lo = 0, hi = ghostPlay.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ghostPlay[mid][ch] <= value) lo = mid; else hi = mid;
  }
  return lo;
}

function updateGhostPlayback() {
  ghostState.visible = false;
  if (!ghostPlay || !ghostPlay.length) return;
  const last = ghostPlay[ghostPlay.length - 1];
  const t = sim.lapTime;
  if (t >= last[0]) return;
  const lo = ghostSeek(0, t);
  const a = ghostPlay[lo], b = ghostPlay[Math.min(lo + 1, ghostPlay.length - 1)];
  const span = b[0] - a[0];
  const f = span > 0 ? clamp((t - a[0]) / span, 0, 1) : 0;
  const gs = lerp(a[1], b[1], f);
  const ghostLat = lerp(a[2], b[2], f);
  const node = sampleCenterline(track.center, gs, _sampC);
  const lat = ghostLat * ROAD_HALF;
  ghostState.visible = true;
  ghostState.progress = ((gs % track.center.totalLength) + track.center.totalLength) % track.center.totalLength / track.center.totalLength;
  ghostState.speed = span > 0 ? (b[1] - a[1]) / span : 0;
  ghostState.lateral = ghostLat;
  ghostState.position.x = node.x + node.nx * lat;
  ghostState.position.y = node.y + 0.02;
  ghostState.position.z = node.z + node.nz * lat;
  ghostState.yaw = node.heading;
}

function ghostDelta() {
  if (!ghostPlay || !ghostPlay.length) return null;
  const last = ghostPlay[ghostPlay.length - 1];
  const d = sim.lapDist;
  if (d <= ghostPlay[0][1]) return sim.lapTime - ghostPlay[0][0];
  if (d >= last[1]) return sim.lapTime - last[0];
  const lo = ghostSeek(1, d);
  const a = ghostPlay[lo], b = ghostPlay[Math.min(lo + 1, ghostPlay.length - 1)];
  const span = b[1] - a[1];
  const f = span > 0 ? clamp((d - a[1]) / span, 0, 1) : 0;
  return sim.lapTime - lerp(a[0], b[0], f);
}

// ------------------------------------------------------------------ input
function readInput() {
  if (mode !== 'race' && mode !== 'countdown') {
    input.steer = 0; input.throttle = false; input.brake = false;
    return;
  }
  const zones = controlZones();

  // Touch: pedals by zone, steering by drag anywhere in the left half.
  let throttle = false, brake = false, steer = 0, steering = false;
  for (const [id, p] of kit.input.pointers) {
    if (inRect(p, zones.throttle)) { throttle = true; continue; }
    if (inRect(p, zones.brake)) { brake = true; continue; }
    if (inRect(p, zones.pause)) continue;
    if (inRect(p, zones.item)) continue;
    if (p.x < W * 0.62) {
      // Steering drag. Identity per pointer: the first one in the steer zone
      // owns steering until it lifts (defect class #3).
      if (input.steerPointerId === null || input.steerPointerId === id) {
        input.steerPointerId = id;
        // Screen-left drag is positive; worldSteer() applies the single world
        // orientation flip used by the sim, car wheels and camera lean.
        steer = clamp((p.startX - p.x) / Math.max(72, W * 0.17), -1, 1);
        steering = true;
      }
    }
  }
  if (!steering) input.steerPointerId = null;
  input.touchThrottle = throttle;
  input.touchBrake = brake;

  // Keyboard, fully wired beside touch.
  const k = kit.input;
  let keySteer = 0;
  // Positive is explicitly screen-left. The old mapping fed screen-left as
  // negative into a right-handed world normal, which reversed both phone drag
  // and keyboard steering in landscape play.
  if (k.keyDown('ArrowLeft') || k.keyDown('KeyA')) keySteer += LEFT_INPUT;
  if (k.keyDown('ArrowRight') || k.keyDown('KeyD')) keySteer -= LEFT_INPUT;
  // Space accelerates, matching the documented control contract and the
  // prototype. It was wired to the brake, which is the opposite of what both
  // the notes and the on-screen GAS pedal promise.
  const keyThrottle = k.keyDown('ArrowUp') || k.keyDown('KeyW') || k.keyDown('Space');
  const keyBrake = k.keyDown('ArrowDown') || k.keyDown('KeyS');

  input.steer = clamp(steer + keySteer, -1, 1);
  input.throttle = throttle || keyThrottle;
  input.brake = brake || keyBrake;
}

function inRect(p, r) {
  return r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

// Control rects depend only on the viewport, so they are solved once per
// resize. This runs twice a frame (input read plus HUD draw) and used to
// allocate four objects each time.
const _zones = {
    throttle: { x: 0, y: 0, w: 0, h: 0 },
    brake: { x: 0, y: 0, w: 0, h: 0 },
    pause: { x: 0, y: 0, w: 0, h: 0 },
  item: { x: 0, y: 0, w: 0, h: 0 },
  // Cache key held as six numbers rather than a formatted string: this runs
  // twice a frame and building the key was itself the only allocation left in
  // the function it was written to make allocation-free.
  kW: -1, kH: -1, kT: -1, kR: -1, kB: -1, kL: -1,
};
function controlZones() {
  const s = hud.safe;
  if (_zones.kW === W && _zones.kH === H && _zones.kT === s.top && _zones.kR === s.right
    && _zones.kB === s.bottom && _zones.kL === s.left) return _zones;
  _zones.kW = W; _zones.kH = H;
  _zones.kT = s.top; _zones.kR = s.right; _zones.kB = s.bottom; _zones.kL = s.left;
  const pad = Math.max(14, W * 0.022);
  const bw = Math.max(78, Math.min(122, W * 0.115));
  const bh = Math.max(74, Math.min(104, H * 0.2));
  const by = H - bh - pad - s.bottom;
  const t = _zones.throttle, b = _zones.brake, p = _zones.pause, item = _zones.item;
  t.x = W - pad - s.right - bw; t.y = by; t.w = bw; t.h = bh;
  b.x = W - pad - s.right - bw * 2 - 12; b.y = by; b.w = bw; b.h = bh;
  p.x = W - pad - s.right - 46; p.y = pad + s.top; p.w = 46; p.h = 40;
  item.x = p.x - 136; item.y = p.y + 2; item.w = 126; item.h = 56;
  return _zones;
}

// Discrete taps for menus and the pause button are handled with a direct
// listener; GGKit owns pointer identity for held controls.
sceneCanvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  // Capture the pointer on the canvas. Without capture, a mouse or pen held on
  // a pedal and dragged out of the viewport releases outside the document and
  // GGKit never sees the pointerup, so the control stays latched on. With
  // capture, pointerup/pointercancel are guaranteed to be delivered here (and
  // still bubble to the window listeners the kit owns).
  try { sceneCanvas.setPointerCapture(e.pointerId); } catch (err) { /* unsupported */ }
  const rect = sceneCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  handleTap(x, y);
}, { passive: false });
// Belt and braces for the same defect: if capture is lost for any reason
// (browser gesture takeover, element removal) drop that pointer's held state.
sceneCanvas.addEventListener('lostpointercapture', (e) => {
  kit.input.pointers.delete(e.pointerId);
  if (input.steerPointerId === e.pointerId) input.steerPointerId = null;
});
// A page that is hidden, frozen or restored from bfcache never delivers the
// matching pointerup, so every held control is released on the way out.
window.addEventListener('pagehide', () => { kit.input.clearAll(); releaseControls(); });
window.addEventListener('visibilitychange', () => {
  if (document.hidden) releaseControls();
});
function releaseControls() {
  input.steer = 0; input.throttle = false; input.brake = false;
  input.steerPointerId = null;
  input.touchThrottle = false; input.touchBrake = false;
}
sceneCanvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
sceneCanvas.addEventListener('contextmenu', (e) => e.preventDefault());

// Menu taps must still work while the kit is paused, otherwise the pause menu
// itself is unclickable. Only the pause-menu ids are honoured in that state so
// a paused sim can never be driven.
const PAUSED_OK = new Set(['pause-resume', 'pause-restart', 'pause-settings', 'pause-quit']);

function handleTap(x, y) {
  const z = hud.hit(x, y);
  if (!z) return;
  if (kit.paused && !PAUSED_OK.has(z.id)) return;
  hud.press(z.id);
  hud.focusId = z.id;
  sfx(z.id.startsWith('nav') ? 'uitick' : 'uiselect', { volume: 0.5 });
  onZone(z);
}

let selectPage = 0;
let garageIndex = 0;

// Mode changes go through one 220 ms theme-coloured fade rather than a hard
// cut. The scene keeps rendering underneath, so the transition reads as a
// dissolve into the next screen, not a stall.
function goMode(next, after) {
  if (reducedMotion()) {
    mode = next;
    if (after) after();
    return;
  }
  view.fadeDir = 1;
  view.fadeNext = () => { mode = next; if (after) after(); };
}

function onZone(z) {
  switch (z.id) {
    case 'title-start':
      if (!save.tutorialDone) {
        tutorial.active = true; tutorial.step = 0; tutorial.timer = 0;
        tutorial.seen = { rumble: false, ghost: false, lap: false };
        event = EVENTS[0];
        startEvent(event);
      } else {
        goMode('select', () => music.play('menu'));
      }
      break;
    case 'title-garage':
      garageIndex = Math.max(0, CARS.findIndex((c) => c.id === save.car));
      goMode('garage', () => { view.started = false; view.orbit = 0; setPreviewCar(CARS[garageIndex]); });
      break;
    case 'title-settings': openSettings(); break;
    case 'title-credits': goMode('credits'); break;
    case 'credits-back': goMode('title'); break;
    case 'garage-back': goMode('title', () => { view.started = false; setPreviewCar(currentCar()); }); break;
    case 'garage-prev':
      garageIndex = (garageIndex - 1 + CARS.length) % CARS.length;
      setPreviewCar(CARS[garageIndex]);
      break;
    case 'garage-next':
      garageIndex = (garageIndex + 1) % CARS.length;
      setPreviewCar(CARS[garageIndex]);
      break;
    case 'garage-pick': {
      const c = CARS[garageIndex];
      if (carUnlocked(c)) { save.car = c.id; persist(); sfx('checkpoint', { volume: 0.5 }); }
      break;
    }
    case 'select-back': goMode('title'); break;
    case 'select-page': selectPage = z.data; break;
    case 'select-event': {
      event = z.data;
      startEvent(event);
      break;
    }
    case 'finish-retry': startEvent(event); break;
    case 'finish-next':
      // At the end of the ladder there is nothing to advance to, so the button
      // is the ladder exit and says so (see drawCeremony).
      if (finishInfo && finishInfo.nextEvent) {
        event = finishInfo.nextEvent;
        startEvent(event);
      } else {
        goMode('select', () => { engine.stop(); music.play('menu'); });
      }
      break;
    case 'finish-menu': goMode('select', () => { engine.stop(); music.play('menu'); }); break;
    case 'pause': kit.pause('button'); break;
    case 'item-slot': useHeldItem(); break;
    case 'pause-resume': kit.resume('button'); break;
    case 'pause-restart':
      // The kit only clears input on restart; the pause REASON is still held,
      // so the rebuilt race used to come up frozen under the pause overlay.
      // Drop the reason first, then restart.
      kit.resume('button');
      kit.restart();
      break;
    case 'pause-settings': openSettings(); break;
    case 'pause-quit':
      kit.resume('button');
      goMode('select', () => { engine.stop(); music.play('menu'); });
      break;
    case 'tutorial-skip':
      tutorial.active = false;
      save.tutorialDone = true; persist();
      break;
  }
}

// ------------------------------------------------------------- preferences
// One reduced-motion setting governs every non-essential motion in the game:
// camera shake, hit-stop, speed streaks, screen flashes, the countdown ring,
// HUD chip pops and pulses, tutorial pulsing, rain and screen transitions.
// kit.juice.enabled is the kit-side half of the same switch, so the shared
// settings row and this one can never disagree.
let prefReduced = !kit.juice.enabled;
let prefSfx = kit.audio.prefs.sfx != null ? kit.audio.prefs.sfx : 1;
function reducedMotion() { return prefReduced || !kit.juice.enabled; }

function openSettings() {
  kit.openSettings([
    (box, row) => {
      // Music is a VOLUME question, not a "is a track object present" question:
      // the old getter read music.mode, which stays non-null after the volume
      // is zeroed, so the row read On while silent and could not be undone.
      row('Music', () => kit.audio.prefs.music > 0 && !kit.audio.prefs.mute,
        (v) => {
          kit.audio.setMusicVolume(v ? 0.7 : 0);
          music.applyVolume();
        });
      row('Sound effects', () => prefSfx > 0 && !kit.audio.prefs.mute,
        (v) => {
          prefSfx = v ? 1 : 0;
          kit.audio.setSfxVolume(prefSfx);
        });
      row('Reduced motion', () => reducedMotion(), (v) => {
        prefReduced = v;
        kit.juice.enabled = !v;   // keep the shared shake toggle in step
        hud.reducedMotion = v;
      });
    },
  ]);
}

// ------------------------------------------------------------- lifecycle
let paused = false;

function onPause() {
  paused = true;
  if (racer) racer.world.setPaused(true);
  engine.suspend();
  music.setPaused(true);
}
function onResume() {
  paused = false;
  if (racer) racer.world.setPaused(false);
  engine.resume();
  music.setPaused(false);
  if (mode === 'race') engine.start();
}
function onRestart() {
  if (track) startEvent(event);
}

// Garage selection is HUD-only. The selected livery and handling data are fed to
// the next GGRacer world when an event starts.
let previewToken = 0;
async function setPreviewCar(spec) {
  if (spec && carUnlocked(spec)) playerSpec = spec;
  previewToken += 1;
}

// ------------------------------------------------------------------ loader
// A Redline-branded loading screen. GGKit's shared loader is a black field, a
// system-font string and a green bar with no relationship to this game; the
// kit still owns lifecycle, input, save and audio, but the loading screen is
// presentation and it belongs to the title.
const LOAD_TIPS = [
  'Brake into the corner, not through it. The drift channel opens under braking above half pace.',
  'The striped kerbs are the track edge. Past them the surface stops giving grip back.',
  'Your best lap becomes the ghost you chase on the next run.',
  'Reverse variants are the same asphalt read backwards, and the gold time is tighter.',
  'Gold medals unlock the garage. Six cars, ten events.',
  'Lift before the crest. Blind rises hide the quickest line.',
];
const loader = (function makeLoader() {
  let box = null, fill = null, sub = null, ring = null, raf = 0, t0 = 0, target = 0, shown = 0;
  function tick() {
    if (!box) return;
    shown += (target - shown) * 0.18;
    if (fill) fill.style.width = (clamp(shown, 0, 1) * 100).toFixed(1) + '%';
    if (ring) {
      const a = (performance.now() - t0) / 1000;
      ring.style.transform = 'rotate(' + (a * 90).toFixed(1) + 'deg)';
    }
    raf = requestAnimationFrame(tick);
  }
  return {
    show(cfg) {
      if (box) return;
      const c = cfg || TRACKS[0];
      const accent = hexStr(c.accent);
      const top = hexStr(c.sky.top), mid = hexStr(c.sky.mid), bot = hexStr(c.sky.bot);
      box = document.createElement('div');
      box.style.cssText = 'position:fixed;inset:0;z-index:9000;display:flex;flex-direction:column;' +
        'align-items:center;justify-content:center;gap:14px;color:#fff;text-align:center;' +
        'font-family:' + UI.family + ';' +
        'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);' +
        'background:linear-gradient(180deg,' + top + ' 0%,' + mid + ' 58%,' + bot + ' 100%);';
      // track-specific backdrop: a horizon band and a road wedge in the
      // circuit's own palette, so the loader is the circuit you are entering
      const back = document.createElement('div');
      back.style.cssText = 'position:absolute;inset:0;overflow:hidden;';
      back.innerHTML =
        '<div style="position:absolute;left:0;right:0;bottom:0;height:46%;background:' + hexStr(c.ground) + ';"></div>' +
        '<div style="position:absolute;left:50%;bottom:0;width:0;height:46%;border-left:34vw solid transparent;' +
        'border-right:34vw solid transparent;border-bottom:46vh solid ' + hexStr(c.road) + ';transform:translateX(-50%);"></div>' +
        '<div style="position:absolute;left:0;right:0;bottom:46%;height:2px;background:' + accent + ';opacity:.5;"></div>';
      box.appendChild(back);

      const lock = document.createElement('div');
      lock.style.cssText = 'position:relative;display:flex;flex-direction:column;align-items:center;gap:2px;';
      lock.innerHTML =
        '<div style="font-size:34px;font-weight:900;letter-spacing:6px;">REDLINE</div>' +
        '<div style="font-size:22px;font-weight:900;letter-spacing:12px;color:' + accent + ';">GT</div>';
      box.appendChild(lock);

      const label = document.createElement('div');
      label.style.cssText = 'position:relative;font-size:11px;font-weight:800;letter-spacing:2px;opacity:.85;';
      label.textContent = (c.code ? c.code + '  ' : '') + (c.name || '').toUpperCase();
      box.appendChild(label);

      const trackEl = document.createElement('div');
      trackEl.style.cssText = 'position:relative;width:min(62vw,300px);height:6px;border-radius:3px;' +
        'background:rgba(0,0,0,.42);overflow:hidden;';
      fill = document.createElement('div');
      fill.style.cssText = 'width:0%;height:100%;border-radius:3px;background:' + accent + ';';
      trackEl.appendChild(fill);
      box.appendChild(trackEl);

      sub = document.createElement('div');
      sub.style.cssText = 'position:relative;max-width:min(78vw,420px);font-size:11px;line-height:1.5;' +
        'font-weight:600;opacity:.8;';
      sub.textContent = LOAD_TIPS[Math.floor(vrand() * LOAD_TIPS.length) % LOAD_TIPS.length];
      box.appendChild(sub);

      ring = document.createElement('div');
      ring.style.cssText = 'position:relative;width:16px;height:16px;border-radius:50%;' +
        'border:2px solid rgba(255,255,255,.22);border-top-color:' + accent + ';';
      box.appendChild(ring);

      document.body.appendChild(box);
      shown = 0; target = 0; t0 = performance.now();
      raf = requestAnimationFrame(tick);
    },
    progress(f) { target = clamp(f, 0, 1); },
    hide() {
      if (!box) return;
      cancelAnimationFrame(raf);
      box.remove();
      box = fill = sub = ring = null;
    },
  };
})();

async function startEvent(ev) {
  if (loading) return;
  loading = true;
  event = ev;
  mode = 'loading';
  loader.show(TRACKS[ev.trackIndex]);
  loader.progress(0.05);
  try {
    // Silence the previous race before its world is torn down. Without this
    // the old engine tone rode through the load and the countdown, and a
    // failed load left it running with nothing on screen.
    engine.stop();
    music.stop();
    disposeWorld();
    loader.progress(0.2);
    await buildWorld(ev);
    loader.progress(0.6);
    // Every clip the race can trigger is decoded here, on the loading screen.
    // Decoding the race bed lazily on the first bar cost a multi-hundred-
    // millisecond stall a second or two into the race.
    await kit.audio.preload(['collide', 'scrape', 'uitick', 'uiselect', 'checkpoint',
      'gearshift', 'beep', 'skid', 'lapchime', 'fanfare', 'boost']);
    loader.progress(0.8);
    await music.preloadFor('race');
    loader.progress(0.9);
    resetSim();
    // Build the engine synth graph here too: constructing its oscillators,
    // noise buffer and filters at the GO beat was a measured first-seconds
    // stall right inside the feel window.
    engine.prewarm();
    // Place the camera before the first render so frame 1 is never a blank
    // clear-colour flash.
    updateView(0, true);
    prewarmScene();
    loader.progress(0.97);
    countdown = 3.6;
    countdownStep = -1;
    mode = 'countdown';
    music.play('race');
    loader.progress(1);
  } catch (err) {
    console.error('[redline-gt] failed to build event', err);
    engine.stop();
    music.stop();
    setMessage('TRACK FAILED TO LOAD', 'bad', 4);
    mode = 'select';
  } finally {
    loader.hide();
    loading = false;
  }
}

// ------------------------------------------------------------------ HUD
function drawHud(dt) {
  hud.clear();
  const s = hud.safe;
  const cfg = track ? track.cfg : TRACKS[0];
  const accent = hexStr(cfg.accent);

  if (mode === 'title') { drawTitle(); return drawTransition(); }
  if (mode === 'garage') { drawGarage(); return drawTransition(); }
  if (mode === 'credits') { drawCredits(); return drawTransition(); }
  if (mode === 'select') { drawSelect(); return drawTransition(); }
  if (mode === 'loading') return;

  drawRaceHud(dt);
  if (mode === 'countdown') drawCountdown();
  if (mode === 'finish') drawCeremony(dt);
  if (tutorial.active && mode === 'race') drawTutorial();
  if (kit.paused && !document.hidden) drawPause();
  drawTransition();
}

// Theme-coloured cross-fade between screens. The colour is the circuit accent
// dropped to near-black, so the dissolve belongs to the world it is leaving.
function drawTransition() {
  if (view.fade <= 0.001) return;
  const c = hud.ctx;
  const cfg = track ? track.cfg : TRACKS[0];
  const r = ((cfg.fog >> 16) & 255) * 0.22, g = ((cfg.fog >> 8) & 255) * 0.22, b = (cfg.fog & 255) * 0.22;
  c.fillStyle = 'rgba(' + Math.round(r) + ',' + Math.round(g) + ',' + Math.round(b) + ',' + view.fade.toFixed(3) + ')';
  c.fillRect(0, 0, W, H);
}

function drawTitle() {
  const c = hud.ctx;
  // One safe content rectangle for every full-screen layout: nothing is
  // centred against the raw viewport or pinned past a notch.
  const R = hud.safeRect();
  const cx = R.cx;
  hud.scrim(0.55);
  const t = performance.now() / 1000;

  // Wordmark with a breathing accent bar (still when reduced motion is on).
  const titleY = R.y + R.h * 0.24;
  hud.text('REDLINE', cx, titleY, Math.min(UI.size.mega, R.w * 0.095), UI.color.ink,
    'center', UI.weight.bold, UI.track.mega);
  hud.text('GT', cx, titleY + Math.min(52, R.w * 0.078),
    Math.min(52, R.w * 0.078), UI.color.primary, 'center', UI.weight.bold, 12);
  const breathe = reducedMotion() ? 1 : (0.94 + Math.sin(t * 1.6) * 0.06);
  const barW = Math.min(300, R.w * 0.34) * breathe;
  c.fillStyle = rgba(TRACKS[0].accent, 0.85);
  hud.roundRect(cx - barW / 2, titleY + Math.min(84, R.w * 0.118), barW, 3, 2);
  c.fill();

  const bw = Math.min(240, R.w * 0.3), bh = 48, gap = UI.space(3);
  let by = R.y + R.h * 0.55;
  hud.button('title-start', cx - bw / 2, by, bw, bh,
    save.tutorialDone ? 'RACE' : 'START CAREER',
    { accent: UI.color.primary, solid: true, size: UI.size.sub });
  by += bh + gap;
  const halfW = (bw - gap) / 2;
  hud.button('title-garage', cx - bw / 2, by, halfW, 42, 'GARAGE',
    { accent: UI.color.secondary, size: UI.size.body });
  hud.button('title-settings', cx + gap / 2, by, halfW, 42, 'SETTINGS',
    { accent: UI.color.secondary, size: UI.size.body });
  by += 42 + gap;
  hud.button('title-credits', cx - bw / 2, by, bw, 34, 'CREDITS',
    { accent: UI.color.locked, size: UI.size.caption });

  const stats = medalCount() + ' of ' + EVENTS.length + ' events medalled  -  '
    + goldCount() + ' gold  -  ' + CARS.filter(carUnlocked).length + ' of ' + CARS.length + ' cars';
  hud.text(stats, cx, R.y + R.h - UI.space(6), UI.size.caption, UI.color.inkSoft,
    'center', UI.weight.regular, UI.track.caption);
}

function drawCredits() {
  const c = hud.ctx;
  hud.scrim(0.9);
  const R = hud.safeRect();
  const cx = R.cx;
  let y = R.y + Math.max(30, R.h * 0.12);
  hud.text('CREDITS', cx, y, 22, UI.color.ink, 'center', UI.weight.bold, UI.track.title);
  y += 34;
  const lines = [
    ['Design, code and art direction', 'GreenGuard Studio'],
    ['Vehicle models', 'Quaternius Cars Pack (CC0)'],
    ['Sound effects', 'Kenney Impact, Interface, Sci-Fi and Jingle packs (CC0)'],
    ['Music', 'cynicmusic, section31 and ogelgames (CC0, OpenGameArt)'],
    ['Engine', 'Three.js r160'],
  ];
  for (const [k, v] of lines) {
    hud.text(k, cx, y, 11, 'rgba(160,180,200,0.85)', 'center', 700, 0.5);
    y += 17;
    hud.text(v, cx, y, 14, '#ffffff', 'center', 800);
    y += 26;
  }
  hud.text('Full per-file licensing is listed in LICENSES.md', cx, y + 4, 10,
    UI.color.inkFaint, 'center', 600);
  hud.button('credits-back', cx - 70, R.y + R.h - 52, 140, 40, 'BACK',
    { accent: UI.color.secondary, size: UI.size.body });
}

// The garage presents the selected VEHICLE, not a swatch: the 3D scene behind
// this overlay is an eased turntable orbit of the actual rigged car (see the
// garage branch of updateView and setPreviewCar), and the chrome is pushed to
// the edges so the object stays the subject.
function drawGarage() {
  const c = hud.ctx;
  const R = hud.safeRect();
  const cx = R.cx;
  const car = CARS[garageIndex];
  const unlocked = carUnlocked(car);

  // Studio floor: a soft vertical scrim top and bottom instead of a full
  // blackout, so the turntable stays visible through the whole screen.
  const g = c.createLinearGradient(0, R.y, 0, R.y + R.h);
  g.addColorStop(0, 'rgba(5,9,18,0.86)');
  g.addColorStop(0.34, 'rgba(5,9,18,0.20)');
  g.addColorStop(0.68, 'rgba(5,9,18,0.28)');
  g.addColorStop(1, 'rgba(5,9,18,0.92)');
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);

  let y = R.y + UI.space(8);
  hud.text('GARAGE', cx, y, UI.size.title, UI.color.ink, 'center', UI.weight.bold, UI.track.title);
  y += UI.space(5);
  hud.text((garageIndex + 1) + ' / ' + CARS.length, cx, y, UI.size.label,
    UI.color.inkFaint, 'center', UI.weight.medium, UI.track.label);

  // Left rail: identity + livery chips.
  const railX = R.x + UI.space(5);
  let ly = R.y + R.h * 0.42;
  hud.text(car.name.toUpperCase(), railX, ly, UI.size.title,
    unlocked ? UI.color.ink : UI.color.locked, 'left', UI.weight.bold, 1.2);
  ly += UI.space(5);
  // livery: body + trim, the same two colours the car is actually built from
  c.fillStyle = rgba(car.body, unlocked ? 1 : 0.3);
  hud.roundRect(railX, ly - 6, 26, 12, 6); c.fill();
  c.fillStyle = rgba(car.trim, unlocked ? 1 : 0.3);
  hud.roundRect(railX + 30, ly - 6, 26, 12, 6); c.fill();
  ly += UI.space(6);
  const blurbW = Math.min(240, R.w * 0.3);
  wrapText(car.blurb, railX, ly, blurbW, UI.size.caption,
    unlocked ? UI.color.inkSoft : UI.color.inkFaint, 15);

  // Right rail: stat bars.
  const barW = Math.min(190, R.w * 0.24);
  const bx = R.x + R.w - UI.space(5) - barW;
  let sy = R.y + R.h * 0.42;
  const stats = [['TOP SPEED', car.topSpeed], ['ACCELERATION', car.accel], ['GRIP', car.grip]];
  for (const [label, val] of stats) {
    hud.text(label, bx, sy - 10, UI.size.label, UI.color.inkFaint, 'left', UI.weight.regular, UI.track.label);
    c.fillStyle = 'rgba(255,255,255,0.1)';
    hud.roundRect(bx, sy, barW, 7, 4); c.fill();
    const f = clamp((val - 0.88) / 0.34, 0.05, 1);
    c.fillStyle = rgba(unlocked ? car.body : 0x55606d, 0.95);
    hud.roundRect(bx, sy, barW * f, 7, 4); c.fill();
    sy += UI.space(8);
  }

  // Status line under the car.
  const statusY = R.y + R.h - UI.space(17);
  if (!unlocked) {
    hud.text('LOCKED  -  ' + car.unlock + ' GOLD REQUIRED  (' + goldCount() + '/' + car.unlock + ')',
      cx, statusY, UI.size.caption, hexStr(MEDAL_COLOR.GOLD), 'center', UI.weight.medium, 0.5);
  } else if (save.car === car.id) {
    hud.text('SELECTED', cx, statusY, UI.size.caption, UI.color.positive,
      'center', UI.weight.bold, UI.track.micro);
  }

  const by = R.y + R.h - UI.space(12);
  hud.button('garage-prev', R.x + UI.space(5), by, 52, 38, '<',
    { accent: UI.color.secondary, size: UI.size.sub });
  hud.button('garage-next', R.x + R.w - UI.space(5) - 52, by, 52, 38, '>',
    { accent: UI.color.secondary, size: UI.size.sub });
  hud.button('garage-pick', cx - 78, by, 156, 38,
    unlocked ? (save.car === car.id ? 'IN USE' : 'SELECT') : 'LOCKED',
    {
      accent: unlocked ? UI.color.primary : UI.color.locked,
      solid: unlocked && save.car !== car.id, size: UI.size.body, disabled: !unlocked,
    });
  hud.button('garage-back', cx - 60, R.y + R.h - UI.space(6) - 12, 120, 26, 'BACK',
    { accent: UI.color.locked, size: UI.size.caption, radius: 10 });
}

// Minimal word wrapper for the two places that need running copy.
function wrapText(str, x, y, maxW, size, color, lineH) {
  const c = hud.ctx;
  c.font = UI.weight.regular + ' ' + size + 'px ' + UI.family;
  const words = String(str).split(' ');
  let line = '';
  let cy = y;
  for (let i = 0; i < words.length; i++) {
    const test = line ? line + ' ' + words[i] : words[i];
    if (c.measureText(test).width > maxW && line) {
      hud.text(line, x, cy, size, color, 'left', UI.weight.regular);
      line = words[i];
      cy += lineH;
    } else {
      line = test;
    }
  }
  if (line) hud.text(line, x, cy, size, color, 'left', UI.weight.regular);
  return cy + lineH;
}

// Authored per-circuit preview art, drawn from the same tokens the 3D world is
// built from: sky ramp, sun/moon, cloud band, horizon landmark silhouette,
// surface tone, road wedge and weather. A track is identifiable from its card.
function drawTrackThumb(cfg, x, y, w, h, r) {
  const c = hud.ctx;
  c.save();
  hud.roundRect(x, y, w, h, r == null ? 8 : r);
  c.clip();
  // sky ramp
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, hexStr(cfg.sky.top));
  g.addColorStop(0.62, hexStr(cfg.sky.mid));
  g.addColorStop(1, hexStr(cfg.sky.bot));
  c.fillStyle = g;
  c.fillRect(x, y, w, h);
  const horizon = y + h * 0.58;
  // sun or moon disc, sized from the circuit's own disc token
  if (cfg.sunDisc && cfg.sunDisc.size > 0) {
    const rr = Math.max(2.5, w * 0.055 * (cfg.sunDisc.size / 70));
    const sx = x + w * (cfg.sun.dir[0] > 0 ? 0.72 : 0.28);
    const sy = horizon - h * 0.16 * Math.max(0.2, cfg.sun.dir[1]);
    c.fillStyle = rgba(cfg.sunDisc.glow, 0.35);
    c.beginPath(); c.arc(sx, sy, rr * 2.4, 0, Math.PI * 2); c.fill();
    c.fillStyle = hexStr(cfg.sunDisc.color);
    c.beginPath(); c.arc(sx, sy, rr, 0, Math.PI * 2); c.fill();
  }
  // cloud band
  if (cfg.clouds && cfg.clouds.density > 0.2) {
    c.fillStyle = rgba(cfg.clouds.color, 0.22 + cfg.clouds.density * 0.3);
    const cy0 = y + h * (0.5 - cfg.clouds.band * 0.5);
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      c.ellipse(x + w * (0.2 + i * 0.31), cy0 + i * 2.5, w * 0.16, h * 0.045, 0, 0, Math.PI * 2);
      c.fill();
    }
  }
  // horizon landmark silhouette
  c.fillStyle = rgba(cfg.landmarkColor || cfg.fog, 0.95);
  c.beginPath();
  c.moveTo(x, horizon);
  const kind = cfg.landmark;
  const steps = kind === 'skyline' ? 10 : 6;
  for (let i = 0; i <= steps; i++) {
    const px = x + (i / steps) * w;
    let ph;
    if (kind === 'skyline') ph = ((i * 37) % 11) / 11 * h * 0.22 + h * 0.04;
    else if (kind === 'needles') ph = (i % 2 ? 0.26 : 0.08) * h;
    else if (kind === 'mesa') ph = (i % 3 === 1 ? 0.17 : 0.07) * h;
    else if (kind === 'arches') ph = (i % 2 ? 0.10 : 0.20) * h;
    else ph = (Math.sin(i * 1.7) * 0.5 + 0.5) * h * 0.16 + h * 0.03;
    if (kind === 'skyline') { c.lineTo(px, horizon - ph); c.lineTo(px + w / steps, horizon - ph); }
    else c.lineTo(px, horizon - ph);
  }
  c.lineTo(x + w, horizon); c.lineTo(x + w, y + h); c.lineTo(x, y + h);
  c.closePath(); c.fill();
  // ground + surface tone
  c.fillStyle = hexStr(cfg.ground);
  c.fillRect(x, horizon, w, y + h - horizon);
  // road wedge running to the vanishing point
  c.fillStyle = hexStr(cfg.road);
  c.beginPath();
  c.moveTo(x + w * 0.5 - w * 0.02, horizon);
  c.lineTo(x + w * 0.5 + w * 0.02, horizon);
  c.lineTo(x + w * 0.5 + w * 0.34, y + h);
  c.lineTo(x + w * 0.5 - w * 0.34, y + h);
  c.closePath(); c.fill();
  c.strokeStyle = rgba(cfg.rumbleB, 0.9);
  c.lineWidth = 1.2;
  c.beginPath();
  c.moveTo(x + w * 0.5 - w * 0.02, horizon); c.lineTo(x + w * 0.5 - w * 0.34, y + h);
  c.moveTo(x + w * 0.5 + w * 0.02, horizon); c.lineTo(x + w * 0.5 + w * 0.34, y + h);
  c.stroke();
  // weather
  if (cfg.rain) {
    c.strokeStyle = rgba(cfg.sky.bot, 0.55);
    c.lineWidth = 1;
    c.beginPath();
    for (let i = 0; i < 9; i++) {
      const rx = x + ((i * 53) % 100) / 100 * w;
      const ry = y + ((i * 29) % 100) / 100 * h * 0.8;
      c.moveTo(rx, ry); c.lineTo(rx + 2, ry + 6);
    }
    c.stroke();
  }
  if (cfg.stars && !cfg.rain) {
    c.fillStyle = 'rgba(255,255,255,0.8)';
    for (let i = 0; i < 7; i++) {
      c.fillRect(x + ((i * 71) % 100) / 100 * w, y + ((i * 37) % 100) / 100 * h * 0.4, 1.3, 1.3);
    }
  }
  c.restore();
}

function drawSelect() {
  const c = hud.ctx;
  hud.scrim(0.88);
  const R = hud.safeRect();
  const cx = R.cx;
  let y = R.y + Math.max(20, R.h * 0.07);

  hud.text('CHAMPIONSHIP', cx, y, UI.size.title, UI.color.ink, 'center', UI.weight.bold, UI.track.title);
  y += UI.space(6);
  hud.text(goldCount() + ' GOLD  -  ' + medalCount() + '/' + EVENTS.length + ' MEDALLED',
    cx, y, UI.size.label, UI.color.inkSoft, 'center', UI.weight.regular, 0.8);
  y += UI.space(6);

  // Grid of event cards, paged so cards stay tappable on small screens.
  const cols = R.w > 760 ? 5 : R.w > 560 ? 4 : 3;
  const gap = Math.max(7, R.w * 0.012);
  const gridW = R.w - gap * 2;
  const cardW = (gridW - gap * (cols - 1)) / cols;
  const availH = R.y + R.h - y - 62;
  const rows = Math.max(1, Math.floor(availH / (Math.min(96, availH / 2) + gap)));
  const cardH = Math.min(96, (availH - gap * (rows - 1)) / rows);
  const perPage = cols * rows;
  const pages = Math.ceil(EVENTS.length / perPage);
  selectPage = clamp(selectPage, 0, pages - 1);

  const startIdx = selectPage * perPage;
  for (let i = 0; i < perPage; i++) {
    const idx = startIdx + i;
    if (idx >= EVENTS.length) break;
    const ev = EVENTS[idx];
    const t = TRACKS[ev.trackIndex];
    const rec = save.events[ev.id];
    const col = i % cols, row = Math.floor(i / cols);
    const x = R.x + gap + col * (cardW + gap);
    const cy = y + row * (cardH + gap);

    const isCurrent = ev.id === event.id;
    hud.chip(x, cy, cardW, cardH,
      isCurrent ? rgba(t.accent, 0.16) : UI.color.surfaceDeep,
      isCurrent ? hexStr(t.accent) : UI.color.line, UI.radius.chip);

    // Authored preview: this card is the circuit, not a coloured dot.
    const thumbH = Math.min(38, cardH * 0.42);
    drawTrackThumb(t, x + 6, cy + 6, cardW - 12, thumbH, 7);
    if (ev.reverse) {
      // reverse variants are marked on the art itself
      c.fillStyle = rgba(t.accent, 0.92);
      hud.roundRect(x + cardW - 34, cy + 10, 24, 12, 6); c.fill();
      hud.text('REV', x + cardW - 22, cy + 16, 7, '#0b1220', 'center', UI.weight.bold, 0.8);
    }

    hud.text(ev.code, x + 8, cy + thumbH + 18, UI.size.label, hexStr(t.accent),
      'left', UI.weight.bold, UI.track.label);
    const nameSize = Math.max(10, Math.min(13, cardW * 0.1));
    hud.text(ev.reverse ? t.name : ev.name, x + 8, cy + thumbH + 32, nameSize,
      UI.color.ink, 'left', UI.weight.medium);

    // difficulty pips
    for (let d = 0; d < 6; d++) {
      c.fillStyle = d < ev.difficulty ? rgba(t.accent, 0.95) : 'rgba(255,255,255,0.14)';
      hud.roundRect(x + 8 + d * 7, cy + cardH - 13, 4.5, 4.5, 2);
      c.fill();
    }

    if (rec && rec.medal) {
      const mc = MEDAL_COLOR[rec.medal] || 0xcccccc;
      c.fillStyle = rgba(mc, 1);
      c.beginPath();
      c.arc(x + cardW - 14, cy + cardH - 12, 6.5, 0, Math.PI * 2);
      c.fill();
      hud.text(rec.medal[0], x + cardW - 14, cy + cardH - 12, 8, '#0d1420', 'center', UI.weight.bold);
    }
    hud.text(rec && rec.best ? formatTime(rec.best) : 'NOT SET',
      x + cardW - 26, cy + cardH - 12, UI.size.label,
      rec && rec.best ? UI.color.inkSoft : UI.color.inkFaint, 'right', UI.weight.regular);

    hud.zone('select-event', x, cy, cardW, cardH, ev);
  }

  // Pager
  const footY = R.y + R.h - 46;
  if (pages > 1) {
    const pw = 30, pgap = 8;
    const totalW = pages * pw + (pages - 1) * pgap;
    let px = cx - totalW / 2;
    for (let p = 0; p < pages; p++) {
      hud.button('select-page', px, footY, pw, 26, String(p + 1),
        {
          accent: p === selectPage ? UI.color.ink : UI.color.locked,
          solid: p === selectPage, size: UI.size.caption, data: p, radius: 8,
        });
      px += pw + pgap;
    }
  }
  hud.button('select-back', R.x + gap, footY, 92, 26, 'BACK',
    { accent: UI.color.locked, size: UI.size.caption, radius: 8 });

  // Selected event blurb
  hud.text(event.desc, cx, R.y + R.h - 14, UI.size.label, UI.color.inkFaint, 'center', 600);
}

function drawRaceHud(dt) {
  const c = hud.ctx;
  const cfg = track.cfg;
  const s = hud.safe;
  const accent = hexStr(cfg.accent);
  const pad = Math.max(14, W * 0.022);
  const z = controlZones();

  // --- top-left: event chip
  const chipW = Math.min(228, W * 0.29);
  hud.chip(pad + s.left, pad + s.top, chipW, 44, 'rgba(7,13,22,0.72)', rgba(cfg.accent, 0.35), 12);
  hud.text('REDLINE GT', pad + s.left + 12, pad + s.top + 15, 9, accent, 'left', 900, 1.6);
  hud.text(event.code + '  ' + (event.reverse ? cfg.name.toUpperCase() + ' REV' : cfg.name.toUpperCase()),
    pad + s.left + 12, pad + s.top + 31, 12, '#ffffff', 'left', 800, 0.3);

  // --- top-centre: lap + total time chips. Both slide in from above on the
  // event they report, so a lap change is a movement, not a number swap.
  const lapChipW = 96, lapChipH = 40;
  const lapSlide = chips.lap > 0 ? (1 - EASE.outCubic(1 - chips.lap)) * -18 : 0;
  const lcx = W / 2 - lapChipW - 6;
  hud.chip(lcx, pad + s.top + lapSlide, lapChipW, lapChipH, UI.color.surface, UI.color.line, UI.radius.chip);
  hud.text('LAP', lcx + 12, pad + s.top + 14 + lapSlide, UI.size.label, UI.color.inkSoft,
    'left', UI.weight.medium, UI.track.label);
  hud.text(Math.min(sim.lap, LAPS) + '/' + LAPS, lcx + lapChipW - 12, pad + s.top + 22 + lapSlide,
    18, UI.color.ink, 'right', UI.weight.bold);

  const timeChipW = 128;
  const tcx = W / 2 + 6;
  hud.chip(tcx, pad + s.top, timeChipW, lapChipH, UI.color.surface, rgba(cfg.accent, 0.3), UI.radius.chip);
  hud.text('TIME', tcx + 12, pad + s.top + 14, UI.size.label, UI.color.inkSoft,
    'left', UI.weight.medium, UI.track.label);
  hud.text(formatTime(sim.totalTime, true), tcx + timeChipW - 12, pad + s.top + 26,
    15, accent, 'right', UI.weight.bold);

  // --- live race standing. The old chip called a medal projection a standing
  // even though there were no opponents. This is an actual four-car field.
  const position = racePosition();
  const positionText = position + '/' + FIELD_SIZE;
  const positionCol = position === 1 ? MEDAL_COLOR.GOLD : position === 2 ? MEDAL_COLOR.SILVER : 0xff9d78;
  const pw = 102;
  const pxx = lcx - pw - 6;
  hud.chip(pxx, pad + s.top, pw, lapChipH, UI.color.surface, rgba(positionCol, 0.4), UI.radius.chip);
  hud.text('POSITION', pxx + 10, pad + s.top + 14, UI.size.micro, UI.color.inkSoft,
    'left', UI.weight.medium, UI.track.micro);
  hud.text(positionText, pxx + 10, pad + s.top + 28, UI.size.caption, hexStr(positionCol),
    'left', UI.weight.bold, 0.8);

  // --- ghost status + delta chip
  const gd = ghostDelta();
  const dw = 108;
  const dx = W / 2 - dw / 2;
  const gslide = chips.delta > 0 ? (1 - EASE.outCubic(1 - chips.delta)) * -12 : 0;
  const dy = pad + s.top + lapChipH + 6 + gslide;
  if (gd != null && sim.lap <= LAPS) {
    const good = gd <= 0;
    hud.chip(dx, dy, dw, 24, good ? 'rgba(20,66,42,0.82)' : 'rgba(70,26,30,0.82)',
      good ? 'rgba(110,224,150,0.5)' : 'rgba(240,120,110,0.5)', 8);
    hud.text('GHOST', dx + 10, dy + 12, UI.size.micro, UI.color.inkSoft, 'left', UI.weight.medium, UI.track.micro);
    hud.text(formatDelta(gd), dx + dw - 10, dy + 12, UI.size.body,
      good ? UI.color.positive : UI.color.negative, 'right', UI.weight.bold, 0.4);
  } else if (sim.lap <= LAPS) {
    hud.chip(dx, dy, dw, 24, UI.color.surface, UI.color.line, 8);
    hud.text('NO GHOST YET', dx + dw / 2, dy + 12, UI.size.label, UI.color.inkFaint,
      'center', UI.weight.medium, UI.track.label);
  }

  // --- held item slot. The glyph is procedural and the slot is a real HUD
  // zone, so touch and keyboard use the exact same action path.
  const hasItem = itemState.heldIndex >= 0;
  let preview = itemState.heldIndex;
  if (itemState.rouletteTimer > 0 && itemState.rouletteTarget >= 0) {
    preview = (itemState.rouletteTarget + Math.floor(itemState.rouletteTimer * 38)) % ITEM_COUNT;
  }
  const itemColor = preview >= 0 ? ITEM_DEFS[preview].color : cfg.accent;
  const itemAlpha = hasItem ? 0.22 + itemState.pickupFlash * 0.34 : 0.1;
  c.fillStyle = rgba(itemColor, itemAlpha);
  hud.roundRect(z.item.x, z.item.y, z.item.w, z.item.h, 12); c.fill();
  c.strokeStyle = rgba(itemColor, hasItem ? 0.9 : 0.34); c.lineWidth = 1.5; c.stroke();
  drawItemGlyph(c, z.item.x + 24, z.item.y + 28, itemColor, hasItem ? 1 : 0.45);
  hud.text(itemState.rouletteTimer > 0 ? 'SCANNING' : (hasItem ? ITEM_DEFS[preview].short : 'EMPTY'),
    z.item.x + 43, z.item.y + 21, 9, hasItem ? hexStr(itemColor) : UI.color.inkFaint,
    'left', UI.weight.bold, 0.7);
  hud.text(hasItem ? 'E / TAP' : 'SUPPLY CELL', z.item.x + 43, z.item.y + 38,
    8, UI.color.inkSoft, 'left', UI.weight.medium, 0.4);
  if (mode === 'race' || mode === 'countdown') hud.zone('item-slot', z.item.x, z.item.y, z.item.w, z.item.h);
  if (itemState.incomingFlash > 0 && mode === 'race') {
    const incomingPulse = reducedMotion() ? 0.68 : 0.45 + Math.abs(Math.sin(performance.now() / 80)) * 0.45;
    c.fillStyle = rgba(0xff5f67, itemState.incomingFlash * incomingPulse);
    c.fillRect(z.item.x - 4, z.item.y, 3, z.item.h);
    hud.text('INCOMING', z.item.x + z.item.w / 2, z.item.y - 7, 8,
      rgba(0xff8d8d, itemState.incomingFlash), 'center', UI.weight.bold, 1.1);
  }

  // --- pause button. The finish ceremony has its own buttons and cannot be
  // paused from the keyboard, so the touch zone is not offered there either.
  if (mode !== 'finish') {
    hud.chip(z.pause.x, z.pause.y, z.pause.w, z.pause.h, UI.color.surface, 'rgba(255,255,255,0.16)', 10);
    c.fillStyle = 'rgba(232,240,248,0.9)';
    c.fillRect(z.pause.x + 17, z.pause.y + 12, 4, 16);
    c.fillRect(z.pause.x + 25, z.pause.y + 12, 4, 16);
    hud.zone('pause', z.pause.x, z.pause.y, z.pause.w, z.pause.h);
  }

  // --- bottom-left: speedo + tach arcs (styled arcs, never bare text)
  const gaugeR = Math.min(62, Math.max(44, Math.min(W, H) * 0.115));
  const gx = pad + s.left + gaugeR + 6;
  const gy = H - pad - s.bottom - gaugeR - 4;
  const A0 = Math.PI * 0.78, A1 = Math.PI * 2.22;

  // tach outer arc with redline band
  const rpmFrac = clamp((sim.rpm - 1800) / 5300, 0, 1);
  hud.arc(gx, gy, gaugeR, A0, A1, rpmFrac, 7,
    'rgba(255,255,255,0.10)', accent, 0.82);
  hud.arcTicks(gx, gy, gaugeR - 11, A0, A1, 8, 5, 'rgba(255,255,255,0.22)', 1.5);

  // speed inner arc
  const speedFrac = clamp(sim.speed / (track.maxSpeed * playerSpec.topSpeed), 0, 1);
  hud.arc(gx, gy, gaugeR - 17, A0, A1, speedFrac, 5,
    'rgba(255,255,255,0.08)', 'rgba(232,242,252,0.92)');

  // readouts
  const kmh = Math.round(sim.speed * 0.22);
  hud.text(String(kmh), gx, gy - 4, Math.round(gaugeR * 0.52), '#ffffff', 'center', 900);
  hud.text('KM/H', gx, gy + Math.round(gaugeR * 0.32), 8, 'rgba(190,208,226,0.7)', 'center', 800, 1.4);

  // gear badge
  const gearR = 17;
  const gbx = gx + gaugeR + 4, gby = gy + gaugeR - 26;
  c.fillStyle = rgba(cfg.accent, 0.92);
  c.beginPath(); c.arc(gbx, gby, gearR, 0, Math.PI * 2); c.fill();
  hud.text(String(sim.gear), gbx, gby + 1, 18, '#0a1220', 'center', 900);
  hud.text('GEAR', gbx, gby + gearR + 9, 7, 'rgba(190,208,226,0.7)', 'center', 800, 1);

  // --- bottom-right: pedals
  drawPedal(z.throttle, 'GAS', 0x37d58a, input.throttle);
  drawPedal(z.brake, 'BRAKE', 0xf06368, input.brake);

  // drift indicator glows on the brake pedal when the rear is loose
  if (sim.drifting > 0.15) {
    c.save();
    c.globalAlpha = sim.drifting * 0.6;
    c.strokeStyle = hexStr(cfg.accent);
    c.lineWidth = 3;
    hud.roundRect(z.brake.x - 3, z.brake.y - 3, z.brake.w + 6, z.brake.h + 6, 17);
    c.stroke();
    c.restore();
    hud.text('DRIFT', z.brake.x + z.brake.w / 2, z.brake.y - 14, 10,
      rgba(cfg.accent, sim.drifting), 'center', 900, 1.4);
  }

  // --- lap progress ribbon along the top edge
  const barY = pad + s.top + 48;
  const barX = pad + s.left, barW = chipW;
  c.fillStyle = 'rgba(7,13,22,0.6)';
  hud.roundRect(barX, barY, barW, 5, 3); c.fill();
  c.fillStyle = rgba(cfg.accent, 0.9);
  hud.roundRect(barX, barY, barW * clamp(sim.s / track.center.totalLength, 0, 1), 5, 3); c.fill();

  // --- transient message banner
  if (messageTime > 0) {
    const a = clamp(messageTime, 0, 1);
    const mw = Math.min(340, W * 0.5);
    // The tutorial banner owns H*0.2 while it is up; drop below it.
    const my = tutorial.active ? H * 0.32 : H * 0.2;
    const bg = messageKind === 'good' ? 'rgba(14,52,34,' : messageKind === 'bad' ? 'rgba(62,20,24,' : 'rgba(9,16,26,';
    c.fillStyle = bg + (a * 0.88) + ')';
    hud.roundRect(W / 2 - mw / 2, my, mw, 34, 17); c.fill();
    const fg = messageKind === 'good' ? '#8ef0b4' : messageKind === 'bad' ? '#ff9b8f' : '#fff3b3';
    hud.text(message, W / 2, my + 17, 12, fg, 'center', 900, 0.6);
  }

  // --- impact anticipation. An 80 ms telegraph on the flank about to be
  // struck: the first beat of the impact language, so contact is announced
  // rather than only reported. Reduced motion keeps the marker, drops the
  // pulsing.
  if (view.telegraph > 0.01 && mode === 'race') {
    const tw = Math.max(6, W * 0.012);
    const pulse = reducedMotion() ? 0.55 : 0.35 + Math.abs(Math.sin(performance.now() / 90)) * 0.5;
    c.fillStyle = rgba(0xff6a4a, view.telegraph * pulse);
    const side = sim.lateral >= 0 ? 1 : -1;
    if (side > 0) c.fillRect(W - tw - s.right, H * 0.3, tw, H * 0.4);
    else c.fillRect(s.left, H * 0.3, tw, H * 0.4);
  }

  // --- off-road / damage vignette
  if (sim.offRoad || sim.damage > 0.02) {
    hud.vignette(clamp(sim.offRoad * 0.22 + sim.damage * 0.3, 0, 0.45),
      sim.damage > 0.02 ? 'rgba(90,20,16,' : 'rgba(70,52,20,');
  }
  // Screen flashes are motion: they run through the same reduced-motion switch
  // as shake and hit-stop.
  if (view.flash > 0 && !reducedMotion()) {
    c.fillStyle = 'rgba(255,244,196,' + (view.flash * 0.2) + ')';
    c.fillRect(0, 0, W, H);
  }
  // Lightning is the storm circuit's lighting event: a short full-frame lift
  // with a matching sun-intensity kick applied in the frame loop.
  if (view.lightning > 0 && !reducedMotion()) {
    c.fillStyle = 'rgba(200,220,255,' + (view.lightning * 0.22).toFixed(3) + ')';
    c.fillRect(0, 0, W, H);
  }
}

function drawItemGlyph(c, x, y, color, alpha) {
  c.save();
  c.globalAlpha = alpha;
  c.strokeStyle = hexStr(color);
  c.fillStyle = rgba(color, 0.22);
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(x, y - 10); c.lineTo(x + 9, y); c.lineTo(x, y + 10); c.lineTo(x - 9, y);
  c.closePath(); c.fill(); c.stroke();
  c.beginPath(); c.arc(x, y, 3, 0, Math.PI * 2); c.fill();
  c.restore();
}

function drawPedal(r, label, color, pressed) {
  const c = hud.ctx;
  c.fillStyle = pressed ? rgba(color, 0.9) : 'rgba(7,13,22,0.7)';
  hud.roundRect(r.x, r.y, r.w, r.h, 16);
  c.fill();
  c.strokeStyle = rgba(color, pressed ? 1 : 0.7);
  c.lineWidth = 2;
  c.stroke();
  hud.text(label, r.x + r.w / 2, r.y + r.h / 2, Math.max(11, Math.min(15, r.w * 0.15)),
    pressed ? '#06101a' : hexStr(color), 'center', 900, 1);
}

function drawCountdown() {
  const c = hud.ctx;
  const reduced = reducedMotion();
  const n = Math.ceil(countdown - 0.6);
  if (countdown <= 0.6) {
    // GO! pop
    const t = clamp((0.6 - countdown) / 0.5, 0, 1);
    const scale = reduced ? 1 : EASE.outBack(t);
    const alpha = 1 - clamp((0.6 - countdown - 0.35) / 0.25, 0, 1);
    c.save();
    c.globalAlpha = alpha;
    c.translate(W / 2, H * 0.4);
    c.scale(scale, scale);
    hud.text('GO', 0, 0, Math.min(84, W * 0.13), hexStr(track.cfg.accent), 'center', 900, 8);
    c.restore();
    hud.text('GRID  ' + racePosition() + '/' + FIELD_SIZE + '   HOLD GAS', W / 2, H * 0.49,
      UI.size.caption, UI.color.inkSoft, 'center', UI.weight.bold, 1.2);
    return;
  }
  if (n <= 0 || n > 3) return;
  // Each number pops with ease-out-back then holds.
  const frac = 1 - ((countdown - 0.6) % 1);
  const t = clamp(frac / 0.45, 0, 1);
  const scale = reduced ? 1 : EASE.outBack(t) * (1 - clamp((frac - 0.7) / 0.3, 0, 1) * 0.14);
  c.save();
  c.globalAlpha = reduced ? 1 : 0.4 + 0.6 * clamp(frac / 0.3, 0, 1);
  c.translate(W / 2, H * 0.4);
  c.scale(scale, scale);
  hud.text(String(n), 0, 0, Math.min(96, W * 0.15), UI.color.ink, 'center', UI.weight.bold);
  c.restore();
  hud.text('GRID  ' + racePosition() + '/' + FIELD_SIZE, W / 2, H * 0.49,
    UI.size.caption, UI.color.inkSoft, 'center', UI.weight.bold, 1.2);
  // Ring wipe around the number: motion, so it goes with reduced motion.
  if (!reduced) {
    c.save();
    c.globalAlpha = 0.5 * (1 - frac);
    c.strokeStyle = hexStr(track.cfg.accent);
    c.lineWidth = 3;
    c.beginPath();
    c.arc(W / 2, H * 0.4, 44 + frac * 46, 0, Math.PI * 2);
    c.stroke();
    c.restore();
  }
}

// The ceremony is staged in beats rather than appearing at once: the scrim and
// the result heading, then the medal reveal on its own beat with a ring wipe,
// then the times, then the buttons. The camera swings to its hero angle over
// the same window (see the finish branch of updateView).
function drawCeremony(dt) {
  const c = hud.ctx;
  const reduced = reducedMotion();
  const t = clamp(ceremonyT / 0.5, 0, 1);
  hud.scrim(0.82 * t);
  const R = hud.safeRect();
  const cx = R.cx;
  const slide = reduced ? 0 : (1 - EASE.outCubic(t)) * 40;

  let y = R.y + Math.max(34, R.h * 0.13) - slide;
  const medal = finishInfo.medal;
  const mc = medal ? MEDAL_COLOR[medal] : 0x9fb0c2;

  hud.text('RACE COMPLETE', cx, y, 14, UI.color.inkSoft, 'center', UI.weight.medium, UI.track.title);
  y += UI.space(8);

  const standing = finishInfo.standing || racePosition();
  const suffix = standing === 1 ? 'ST' : standing === 2 ? 'ND' : standing === 3 ? 'RD' : 'TH';
  hud.text(standing + suffix + ' OF ' + (finishInfo.field || FIELD_SIZE), cx, y,
    UI.size.display, UI.color.primary, 'center', UI.weight.bold, 2.5);
  y += UI.space(7);

  // BEAT 2: the medal reveal, on its own delay, with a ring wipe.
  const mt = clamp((ceremonyT - 0.45) / 0.5, 0, 1);
  if (mt > 0) {
    const ms = reduced ? 1 : EASE.outBack(mt);
    if (!reduced && mt < 1) {
      c.save();
      c.globalAlpha = (1 - mt) * 0.8;
      c.strokeStyle = hexStr(mc);
      c.lineWidth = 3;
      c.beginPath();
      c.arc(cx, y + 8, 30 + mt * 40, 0, Math.PI * 2);
      c.stroke();
      c.restore();
    }
    c.save();
    c.translate(cx, y + 8);
    c.scale(ms, ms);
    c.fillStyle = rgba(mc, 1);
    c.beginPath(); c.arc(0, 0, 28, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 2; c.stroke();
    hud.text(medal ? medal[0] : '-', 0, 1, 28, '#0b1220', 'center', UI.weight.bold);
    c.restore();
  }
  y += UI.space(12);
  hud.text(medal || 'NO MEDAL', cx, y, 20, hexStr(mc), 'center', UI.weight.bold, 4);
  y += UI.space(7);

  // BEAT 3: the numbers.
  const nt = clamp((ceremonyT - 0.85) / 0.4, 0, 1);
  c.save();
  c.globalAlpha = reduced ? 1 : nt;
  hud.text(formatTime(finishInfo.total), cx, y, UI.size.display, UI.color.ink, 'center', UI.weight.bold);
  y += UI.space(6);
  hud.text('BEST LAP ' + formatTime(finishInfo.bestLap) + '   -   GOLD ' + formatTime(event.gold),
    cx, y, UI.size.caption, UI.color.inkSoft, 'center', UI.weight.regular, UI.track.caption);
  y += UI.space(5);
  if (finishInfo.improved) {
    hud.text('NEW MEDAL EARNED', cx, y, UI.size.body, UI.color.positive,
      'center', UI.weight.bold, 1.6);
    y += UI.space(5);
  }
  if (finishInfo.unlocked) {
    hud.text('CAR UNLOCKED:  ' + finishInfo.unlocked.name.toUpperCase(), cx, y, UI.size.body,
      hexStr(finishInfo.unlocked.body), 'center', UI.weight.bold, 1.2);
    y += UI.space(5);
  }
  c.restore();

  const bw = Math.min(150, R.w * 0.2), bh = 40, gap = UI.space(2.5);
  const by = Math.min(R.y + R.h - bh - UI.space(4), y + UI.space(3));
  const totalW = bw * 3 + gap * 2;
  let bx = cx - totalW / 2;
  hud.button('finish-retry', bx, by, bw, bh, 'RETRY',
    { accent: UI.color.secondary, size: UI.size.body });
  bx += bw + gap;
  // At the end of the ladder there is no next event, so the primary action
  // becomes the ladder exit instead of silently replaying the same race.
  hud.button('finish-next', bx, by, bw, bh,
    finishInfo.isLast ? 'ALL EVENTS' : 'NEXT EVENT',
    { accent: UI.color.primary, solid: true, size: UI.size.body });
  bx += bw + gap;
  hud.button('finish-menu', bx, by, bw, bh, 'EVENTS',
    { accent: UI.color.secondary, size: UI.size.body });
}

function drawPause() {
  hud.scrim(0.78);
  const R = hud.safeRect();
  const cx = R.cx;
  let y = R.y + R.h * 0.2;
  hud.text('PAUSED', cx, y, 24, UI.color.ink, 'center', UI.weight.bold, 5);
  y += UI.space(9);
  const bw = Math.min(220, R.w * 0.28), bh = 42, gap = UI.space(2.5);
  hud.button('pause-resume', cx - bw / 2, y, bw, bh, 'RESUME',
    { accent: UI.color.primary, solid: true, size: 14 });
  y += bh + gap;
  hud.button('pause-restart', cx - bw / 2, y, bw, bh, 'RESTART',
    { accent: UI.color.secondary, size: UI.size.body });
  y += bh + gap;
  hud.button('pause-settings', cx - bw / 2, y, bw, bh, 'SETTINGS',
    { accent: UI.color.secondary, size: UI.size.body });
  y += bh + gap;
  hud.button('pause-quit', cx - bw / 2, y, bw, bh, 'QUIT TO EVENTS',
    { accent: UI.color.locked, size: 12 });
}

function drawTutorial() {
  const c = hud.ctx;
  const step = tutorial.steps[tutorial.step];
  if (!step) return;
  const t = clamp(tutorial.timer / 0.35, 0, 1);
  const slide = (1 - EASE.outCubic(t)) * 26;

  // Banner sits high on the screen so it never collides with the steer-zone
  // highlight or the pedals in the lower half.
  const bw = Math.min(420, W * 0.5), bh = 44;
  const bx = W / 2 - bw / 2;
  const by = H * 0.2 + slide;
  c.save();
  c.globalAlpha = t;
  c.fillStyle = 'rgba(9,16,28,0.9)';
  hud.roundRect(bx, by, bw, bh, 14); c.fill();
  c.strokeStyle = rgba(track.cfg.accent, 0.6); c.lineWidth = 1.6; c.stroke();
  hud.text('STEP ' + (tutorial.step + 1) + ' OF ' + tutorial.steps.length,
    bx + 14, by + 14, 8, rgba(track.cfg.accent, 0.9), 'left', 900, 1.2);
  hud.text(step.text, bx + 14, by + 30, 12, '#ffffff', 'left', 700);
  c.restore();

  // Pulse the control the step is asking for. The pulse is motion, so under
  // reduced motion the highlight is drawn steady instead of throbbing.
  if (step.hint) {
    const z = controlZones();
    const pulse = reducedMotion() ? 0.5 : 0.5 + Math.sin(performance.now() / 200) * 0.5;
    c.save();
    c.globalAlpha = 0.35 + pulse * 0.45;
    c.strokeStyle = hexStr(track.cfg.accent);
    c.lineWidth = 3;
    if (step.hint === 'throttle') {
      hud.roundRect(z.throttle.x - 4, z.throttle.y - 4, z.throttle.w + 8, z.throttle.h + 8, 18);
      c.stroke();
    } else if (step.hint === 'brake') {
      hud.roundRect(z.brake.x - 4, z.brake.y - 4, z.brake.w + 8, z.brake.h + 8, 18);
      c.stroke();
    } else if (step.hint === 'ghost') {
      // Point at the delta chip the lesson is describing.
      const pad2 = Math.max(14, W * 0.022);
      const gw = 108;
      hud.roundRect(W / 2 - gw / 2 - 4, pad2 + hud.safe.top + 40 + 2, gw + 8, 32, 12);
      c.stroke();
    } else if (step.hint === 'steer') {
      // Sits below the banner and left of the pedals, so nothing overlaps.
      const sw = W * 0.34, sh = H * 0.26;
      const sx = W * 0.05, sy = H * 0.42;
      hud.roundRect(sx, sy, sw, sh, 20);
      c.stroke();
      hud.text('DRAG HERE', sx + sw / 2, sy + sh / 2, 13,
        rgba(track.cfg.accent, 0.9), 'center', 900, 2);
    }
    c.restore();
  }

  // Left of the banner rather than the top-right corner, which the pause
  // button owns.
  hud.button('tutorial-skip', bx - 92, by + bh / 2 - 13, 82, 26, 'SKIP',
    { accent: '#7d90a4', size: 10 });
}

// Teach by doing. Every lesson advances on the player producing the thing the
// lesson is about: the kerb lesson wants an actual off-road event, the ghost
// lesson wants a ghost on screen (or the explicit "no ghost yet" case), and
// the lap lesson wants a line crossing. A long stall still lets the player
// through so nobody is trapped, but the timer is the escape hatch, not the
// mechanism.
function updateTutorial(dt) {
  if (!tutorial.active) return;
  tutorial.timer += dt;
  if (sim.offRoad) tutorial.seen.rumble = true;
  if (ghostState.visible) tutorial.seen.ghost = true;
  if (sim.lap > 1) tutorial.seen.lap = true;
  const step = tutorial.steps[tutorial.step];
  if (!step) { tutorial.active = false; save.tutorialDone = true; persist(); return; }
  let satisfied = false;
  switch (step.key) {
    case 'throttle': satisfied = input.throttle && sim.speed > 90; break;
    case 'steer': satisfied = Math.abs(input.steer) > 0.35 && tutorial.timer > 1.2; break;
    case 'brake': satisfied = input.brake && tutorial.timer > 0.8; break;
    case 'rumble': satisfied = tutorial.seen.rumble || tutorial.timer > 16; break;
    // With no saved ghost there is nothing to show, so the lesson states that
    // and moves on quickly instead of waiting for something impossible.
    case 'ghost': satisfied = tutorial.seen.ghost || (!ghostPlay && tutorial.timer > 4)
      || tutorial.timer > 20; break;
    case 'lap': satisfied = tutorial.seen.lap || tutorial.timer > 40; break;
    default: satisfied = tutorial.timer > 3.4; break;
  }
  if (satisfied && tutorial.timer > 1.0) {
    tutorial.step++;
    tutorial.timer = 0;
    sfx('uitick', { volume: 0.5 });
    if (tutorial.step >= tutorial.steps.length) {
      tutorial.active = false;
      save.tutorialDone = true;
      persist();
      setMessage('TUTORIAL COMPLETE  -  GOOD LUCK', 'good', 2.6);
    }
  }
}

// -------------------------------------------------------------- weather
// The storm circuit's lighting event: a seeded, cosmetic lightning strike that
// lifts the key light and the HUD for a few frames. Gated on reduced motion.
function updateWeather(dt) {
  if (!track || !track.cfg.rain) return;
  if (reducedMotion()) { view.lightning = 0; return; }
  view.lightningNext -= dt;
  if (view.lightningNext <= 0) {
    view.lightningNext = 3.5 + vrand() * 7;
    view.lightning = 1;
  }
  if (view.lightning > 0) {
    view.lightning = Math.max(0, view.lightning - dt * 5.5);
  }
}

// Mirror the kit's audio prefs onto the two graphs the kit does not own.
let _lastMute = null, _lastMusicVol = null, _lastSfxVol = null;
function syncAudioPrefs() {
  const p = kit.audio.prefs;
  if (p.mute === _lastMute && p.music === _lastMusicVol && p.sfx === _lastSfxVol) return;
  _lastMute = p.mute; _lastMusicVol = p.music; _lastSfxVol = p.sfx;
  prefSfx = p.sfx;
  music.applyVolume();
  if (p.mute) engine.suspend();
}

// ------------------------------------------------------------------ loop
let lastTime = performance.now();
let acc = 0;
let musicPoll = 0;
const FIXED = 1 / 120;

function frame(now) {
  requestAnimationFrame(frame);
  // Section timing hook. Off unless a profiler creates window.__prof; the cost
  // when absent is one property read per frame.
  const prof = window.__prof;
  const t0 = prof ? performance.now() : 0;
  let tSim = 0, tRender = 0;
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  if (!(dt > 0)) dt = 0;
  dt = Math.min(dt, 0.05);

  readInput();
  hud.tick(dt);

  // Screen transition clock. The fade runs to full, swaps the mode, then runs
  // back out; the world keeps rendering underneath the whole time.
  if (view.fadeDir !== 0) {
    view.fade += view.fadeDir * dt / 0.11;
    if (view.fade >= 1) {
      view.fade = 1;
      view.fadeDir = -1;
      if (view.fadeNext) { const fn = view.fadeNext; view.fadeNext = null; fn(); }
    } else if (view.fade <= 0) {
      view.fade = 0; view.fadeDir = 0;
    }
  }

  // HUD chip motion decay.
  if (chips.lap > 0) chips.lap = Math.max(0, chips.lap - dt / 0.28);
  if (chips.delta > 0) chips.delta = Math.max(0, chips.delta - dt / 0.28);

  const juice = kit.juice.frame();

  // Audio preference mirror. The kit's Settings shell owns mute and both
  // volumes, but the engine synth and the fallback music bed are not on the
  // kit's buses, so they are re-levelled the moment a pref changes rather
  // than on the next music poll.
  syncAudioPrefs();

  // Music follows the mode. Polled here on a one-second accumulator rather
  // than a standalone setInterval so nothing runs off the render loop.
  musicPoll -= dt;
  if (musicPoll <= 0) {
    musicPoll = 1.0;
    if (!kit.paused) {
      if (mode === 'race' || mode === 'countdown') music.play('race');
      else if (mode !== 'loading') music.play('menu');
    }
  }

  if (!kit.paused && track) {
    menuDrive(dt);
    if (mode === 'countdown') {
      const prev = countdown;
      countdown -= dt;
      // 3-2-1 beeps on each whole-second boundary
      const step = Math.ceil(countdown - 0.6);
      if (step !== countdownStep && step >= 1 && step <= 3) {
        countdownStep = step;
        sfx('beep', { volume: 0.6, rate: 1 + (3 - step) * 0.08 });
      }
      if (prev > 0.6 && countdown <= 0.6) {
        sfx('boost', { volume: 0.55 });
        engine.start();
      }
      if (countdown <= 0) {
        mode = 'race';
        if (!save.tutorialDone) { tutorial.active = true; tutorial.step = 0; tutorial.timer = 0; }
      }
    } else if (mode === 'race') {
      // Hit-stop freezes the COSMETIC clock only; the sim accumulator still
      // drains so lap timing never drifts (house rule 5).
      acc += dt;
      let guard = 0;
      while (acc >= FIXED && guard++ < 8) {
        acc -= FIXED;
        stepSim(FIXED);
        if (sim.finished) break;
      }
      updateGhostRecord(dt);
      updateTutorial(dt);
      messageTime = Math.max(0, messageTime - dt);
      view.flash = Math.max(0, view.flash - dt * 2.2);
      // Delta chip animates when the gap crosses zero, which is the moment
      // that actually matters to the player.
      const gd = ghostDelta();
      if (gd != null) {
        const sgn = gd <= 0 ? 1 : -1;
        if (sgn !== lastDeltaSign) { lastDeltaSign = sgn; chipPop('delta'); }
      }
      updateWeather(dt);
    } else if (mode === 'finish') {
      ceremonyT += dt;
      view.flash = Math.max(0, view.flash - dt * 2.2);
    }

    if (mode !== 'loading') {
      updateTrackFeatureVisuals(dt);
      const place = updateView(juice.frozen ? 0 : dt, juice.frozen, juice);
      updateRivals(juice.frozen ? 0 : dt);
      if (mode === 'race' && !juice.frozen) updateItemWorld(dt);
      else if (mode === 'countdown' && !juice.frozen) updateItemCells(dt);
      if (mode === 'race' || mode === 'countdown') updateGhostPlayback();
      updateRacerFrame(juice.frozen ? 0 : dt, place);
      if (mode === 'race' || mode === 'countdown') {
        engine.update(sim.rpm, input.throttle ? 1 : (input.brake ? 0.1 : 0.3),
          clamp(sim.speed / track.maxSpeed, 0, 1));
      }
    }
  }

  if (prof) tSim = performance.now();
  if (racer) racer.world.render();
  if (prof) tRender = performance.now();
  drawHud(dt);
  if (prof) {
    prof.push([now, t0, tSim - t0, tRender - tSim, performance.now() - tRender, performance.now()]);
    if (prof.length > 4000) prof.splice(0, prof.length - 4000);
  }
}

// ---------------------------------------------------------------- bootstrap
async function boot() {
  resize();
  hud.reducedMotion = reducedMotion();
  loader.show(TRACKS[0]);
  loader.progress(0.1);

  // Warm the title backdrop with the first circuit so the menu is never a
  // flat colour field: the title screen renders a live 3D scene behind it.
  event = EVENTS[0];
  try {
    await buildWorld(event);
    loader.progress(0.6);
    resetSim();
    sim.speed = 300;
    updateView(0, true);
    prewarmScene();
    loader.progress(0.8);
  } catch (err) {
    console.error('[redline-gt] boot failed', err);
  }

  // UI clicks are needed the instant the title paints; the rest of the SFX
  // bank is decoded here too so the first race never waits on it. Music stays
  // lazy until the first gesture per the asset rule.
  await kit.audio.preload(['uitick', 'uiselect', 'beep', 'boost'])
    .catch(() => {});
  loader.progress(1);
  loader.hide();
  mode = 'title';
  kit.registerPWA();
  requestAnimationFrame(frame);
}

// Menu ambience: while in a menu mode the car idles forward slowly so the
// backdrop is a moving 3D scene rather than a still. Driven from the render
// loop; it used to run on its own 60 Hz setTimeout, which kept a second
// macrotask competing with rAF for the whole session.
function menuDrive(dt) {
  if (!track) return;
  if (mode !== 'title' && mode !== 'garage' && mode !== 'select' && mode !== 'credits') return;
  sim.s += 7.5 * dt;
  sim.wheelSpin += 7.5 * dt / playerSpec.wheelRadius;
  sim.lateral = Math.sin(sim.s * 0.012) * 0.25;
  sim.speed = 300;
  sim.rpm = 2600;
}

window.addEventListener('keydown', (e) => {
  const c = e.code;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(c)) e.preventDefault();
  // Command keys are EDGE-triggered. Held down, keyboard auto-repeat delivers
  // a keydown every ~30 ms, which used to restart the race repeatedly as soon
  // as the countdown ended and made P flicker the pause state on and off. Held
  // DRIVING keys are unaffected: those are read from the kit's key set, not
  // from this handler.
  if (e.repeat) return;
  if (kit.paused && c !== 'Escape' && c !== 'KeyP') return;
  if (c === 'Escape' || c === 'KeyP') {
    if (mode === 'race' || mode === 'countdown') {
      if (kit.paused) kit.resume('button'); else kit.pause('button');
    }
  }
  // R restarts from the countdown too: the control is documented as "R
  // restarts the race" and the countdown is part of the race.
  if (c === 'KeyR' && (mode === 'race' || mode === 'countdown' || mode === 'finish')) {
    kit.resume('button');
    kit.restart();
  }
  if (c === 'KeyE' && mode === 'race') useHeldItem();
  if (c === 'Enter') {
    if (mode === 'title') onZone({ id: 'title-start' });
    else if (mode === 'select') onZone({ id: 'select-event', data: event });
    else if (mode === 'finish') onZone({ id: 'finish-next' });
  }
});

boot();
