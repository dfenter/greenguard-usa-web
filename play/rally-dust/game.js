// game.js — Rally Dust. Stylized low-poly 3D stage rally for mobile web.
//
// The archived 2D prototype is the design document. Its handling constants,
// its 90 second stage limit, its three second off-road reset, its seeded stage
// generator, its two-corner-ahead pace-note rule and its rally-total medal
// bands are all carried forward. Rendering is rebuilt as a true 3D chase-cam
// game, and the surface model, jumps, ghost line and livery meta are new.
//
// Structure:
//   stage.js  stage table and seeded simulation layout
//   cars.js   livery roster and handling data
//   GGRacer   shared track, environment, vehicle and speed FX renderer
//   audio.js  synthesised engine, co-driver voice chips, music director
//   hud.js    2D overlay primitives
import { createRacerWorld } from '../_shared/racer/engine.js';
import {
  STAGES, RALLIES, BIOMES, SURFACES, STAGE_LIMIT, WORLD_SCALE,
  buildLayout, featureText, roadSlope, worldYaw,
} from './stage.js';
import { CARS, carById } from './cars.js';
import { EngineSynth, CoDriver, MusicDirector, captureAudioContext } from './audio.js';
import { Hud, EASE, clamp, lerp, formatTime, formatDelta, rgba, hexStr } from './hud.js';

// ------------------------------------------------------------------ config
const SAVE_VERSION = 1;
const TAU = Math.PI * 2;
// Null-prototype lookups: a saved `"medal":"toString"` must not validate off
// Object.prototype and survive into the medal counts.
const MEDAL_ORDER = Object.assign(Object.create(null), { '': 0, BRONZE: 1, SILVER: 2, GOLD: 3 });
const MEDAL_COLOR = Object.assign(Object.create(null),
  { GOLD: 0xffe17c, SILVER: 0xe3f2ff, BRONZE: 0xefa875 });
function medalRank(v) { return Object.hasOwn(MEDAL_ORDER, v) ? MEDAL_ORDER[v] : -1; }
function isMedal(v) { return Object.hasOwn(MEDAL_ORDER, v); }
const GHOST_HZ = 10;
const GHOST_MAX = 10 * 95;          // 95 seconds of samples, hard cap
// A frame gap longer than this while the page is visible is a real stall. The
// physics still steps at the clamped rate, but the elapsed race time is added
// to the stage clock so a hitch can never hand the player a faster result.
const STALL_GAP = 0.12;
const STALL_MAX = 0.75;
// Keyboard parity with the touch pause button: it is drawn in every one of
// these states, so P, Escape and R answer in all of them too.
const PAUSABLE = ['countdown', 'stage', 'recce', 'result', 'summary'];
const RESTARTABLE = ['countdown', 'stage', 'recce', 'result'];

// ------------------------------------------------------------------- setup
const sceneCanvas = document.getElementById('scene');
const hudCanvas = document.getElementById('hud');
const hud = new Hud(hudCanvas);

(function publishSafeArea() {
  const s = document.createElement('style');
  s.textContent = ':root{--sat:env(safe-area-inset-top,0px);--sar:env(safe-area-inset-right,0px);' +
    '--sab:env(safe-area-inset-bottom,0px);--sal:env(safe-area-inset-left,0px);}';
  document.head.appendChild(s);
})();

// --------------------------------------------------------------- save data
function validateSave(o) {
  if (!o || typeof o !== 'object') return false;
  if (o.v !== SAVE_VERSION) return false;
  if (!o.stages || typeof o.stages !== 'object') return false;
  if (!o.rallies || typeof o.rallies !== 'object') return false;
  for (const k of Object.keys(o.stages)) {
    // Persisted ids must validate against the content registry.
    if (!STAGES.some((s) => s.id === k)) return false;
    const r = o.stages[k];
    if (!r || typeof r !== 'object') return false;
    if (r.medal && !isMedal(r.medal)) return false;
    if (r.best != null && (typeof r.best !== 'number' || !isFinite(r.best) || r.best < 0)) return false;
    if (r.ghost != null && !Array.isArray(r.ghost)) return false;
  }
  for (const k of Object.keys(o.rallies)) {
    if (!RALLIES.some((x) => String(x.index) === k)) return false;
    const r = o.rallies[k];
    if (!r || typeof r !== 'object') return false;
    if (r.medal && !isMedal(r.medal)) return false;
    if (r.best != null && (typeof r.best !== 'number' || !isFinite(r.best) || r.best < 0)) return false;
  }
  if (o.car && !CARS.some((c) => c.id === o.car)) return false;
  return true;
}

// Must run before the kit builds its audio graph: everything procedural in
// this title then shares the kit's single context and its suspend contract.
captureAudioContext(window);

const kit = GGKit.create({
  slug: 'rally-dust',
  orientation: 'landscape',
  validateSave,
  onPause() { onPause(); },
  onResume() { onResume(); },
  onRestart() { onRestart(); },
});

const DEFAULT_SAVE = { v: SAVE_VERSION, stages: {}, rallies: {}, car: CARS[0].id, tutorialDone: false };
let save = kit.save.get(null);
if (!validateSave(save)) save = JSON.parse(JSON.stringify(DEFAULT_SAVE));

function persist() { kit.save.set(save); }
function stageRecord(id) {
  if (!save.stages[id]) save.stages[id] = { medal: '', best: 0, ghost: null };
  return save.stages[id];
}
function rallyRecord(i) {
  const k = String(i);
  if (!save.rallies[k]) save.rallies[k] = { medal: '', best: 0 };
  return save.rallies[k];
}
function goldCount() {
  let n = 0;
  for (const s of STAGES) {
    const r = save.stages[s.id];
    if (r && r.medal === 'GOLD') n++;
  }
  return n;
}
function medalCount() {
  let n = 0;
  for (const s of STAGES) {
    const r = save.stages[s.id];
    if (r && r.medal) n++;
  }
  return n;
}
function carUnlocked(c) { return goldCount() >= c.unlock; }
function currentCar() {
  const c = carById(save.car);
  return c && carUnlocked(c) ? c : CARS[0];
}

// ------------------------------------------------------------------ audio
const engine = new EngineSynth(kit);
const coDriver = new CoDriver(kit);
const music = new MusicDirector(kit, { menu: 'mus_menu', stage: ['mus_stage_a', 'mus_stage_b'] });

kit.audio.register({
  mus_menu: 'assets/music/menu.mp3',
  mus_stage_a: 'assets/music/stage_a.mp3',
  mus_stage_b: 'assets/music/stage_b.mp3',
  impact: 'assets/sfx/impact.mp3',
  gravel: 'assets/sfx/gravel.mp3',
  slide: 'assets/sfx/slide.mp3',
  note: 'assets/sfx/note.mp3',
  uitick: 'assets/sfx/uitick.mp3',
  uiselect: 'assets/sfx/uiselect.mp3',
  beep: 'assets/sfx/beep.mp3',
  launch: 'assets/sfx/launch.mp3',
  split: 'assets/sfx/split.mp3',
  stageclear: 'assets/sfx/stageclear.mp3',
  fanfare: 'assets/sfx/fanfare.mp3',
  reset: 'assets/sfx/reset.mp3',
  land: 'assets/sfx/land.mp3',
});
const SFX_BANK = ['impact', 'gravel', 'slide', 'note', 'uitick', 'uiselect', 'beep',
  'launch', 'split', 'stageclear', 'fanfare', 'reset', 'land'];
function sfx(name, opts) { kit.audio.sfx(name, opts); }

// ------------------------------------------------------------------ state
// 'title' | 'rallies' | 'stages' | 'garage' | 'credits' | 'loading'
// | 'countdown' | 'stage' | 'result' | 'summary'
let mode = 'title';
let stageDef = STAGES[0];
let world = null;
let racer = null;
let racerTrackJSON = null;
let carRig = currentCar();
let loading = false;
let rallyRun = null;          // { rally, stageIdx, times: [] } while chaining
let listRally = 0;            // rally being browsed on the stage screen

// Prototype car state, in prototype units on the flat (x, y) plane.
const car = {
  x: 0, y: 0, heading: 0, vx: 0, vy: 0, speed: 0,
  nearest: 8, lateral: 0, offroad: 0, resetTime: 0, drift: 0, bounce: 0,
  // `air` is height above the road; `airborne` is the state. They used to be
  // one field tested as `air > 0.01` against a launch that set exactly 0.01,
  // so the car never actually left the ground.
  air: 0, airborne: false, vv: 0, prevSlope: 0, wheelSpin: 0, sideSpeed: 0,
  surface: 0, segment: 0, dirt: 0,
};

const run = {
  time: 0, finished: false, failed: false, best: false,
  medal: '', delta: 0, splitAt: 0,
};

// Cosmetic springs. Render side only; never fed back into the sim.
const view = {
  // Cosmetic springs only. GGRacer owns the chase camera and car rig.
  lean: 0, leanVel: 0,
  pitch: 0, pitchVel: 0,
  susp: 0, suspVel: 0,
  flash: 0,
};

// `kind` and `dist` drive the pace-note card's urgency states: every call used
// to be drawn identically no matter how close or how serious it was.
const note = { text: '', next: '', t: 0, cursor: 0, kind: '', dist: 0, index: 0 };
// Impact language, beat one and beat two: how close the nearest hazard is
// (anticipation) and a short localized contact accent at the point of contact.
let proximity = 0;
const hitAccent = { t: 0, life: 0, x: 0, y: 0, z: 0, kind: '' };
let countdown = 0;
let countdownStep = -1;
let message = '';
let messageTime = 0;
let messageKind = '';
let ceremonyT = 0;
// One engine model feeds both the tacho arc and the synth, so what the player
// sees and what the player hears can never disagree. `engineRpm` is normalised
// 0..1 against the redline; `engineOverrun` is the on-the-brakes lift state.
let engineRpm = 0.18;
let engineOverrun = 0;
let ghostRecord = null;
let ghostPlay = null;
let ghostPerm = null;
let ghostAccum = 0;

// The recce. It used to be six banners thrown over a live competitive run with
// two steps that simply timed out; now it is a slow reconnaissance lap of the
// opening of the stage, with no clock, no medal and no penalty, that the player
// leaves only by performing each input. `hold` stops the car dead for the
// lessons that are read rather than driven.
const tutorial = {
  active: false, step: 0, timer: 0, hold: false,
  steps: [
    { key: 'intro', title: 'RECCE', hold: true, illo: 'stage',
      text: 'This is a recce. No clock, no penalty. Learn the car, then we run it for real.' },
    { key: 'steer', title: 'STEERING', hold: false, illo: 'drag',
      text: 'Drag anywhere on the left half of the screen. The car turns relative to where you touched down.' },
    { key: 'brake', title: 'BRAKE', hold: false, illo: 'brake',
      text: 'The car pulls its own throttle. Your only pedal is BRAKE, and the tight ones need it.' },
    { key: 'handbrake', title: 'HANDBRAKE', hold: false, illo: 'handbrake',
      text: 'Hold HANDBRAKE to break the rear axle loose and swing the tail into a hairpin.' },
    { key: 'note', title: 'PACE NOTES', hold: true, illo: 'note',
      text: 'Your co-driver calls the road two corners early. The card counts the distance down. Trust the call.' },
    { key: 'edge', title: 'THE EDGE', hold: true, illo: 'edge',
      text: 'Stay inside the marker posts. Deep off road, or a tree, is three seconds and a restart.' },
    { key: 'medal', title: 'THE CLOCK', hold: true, illo: 'medal',
      text: 'Beat the stage par for a medal. Your quickest run leaves a ghost line to chase.' },
  ],
};

const input = {
  steer: 0, brake: false, handbrake: false,
  steerPointerId: null,
};

// ------------------------------------------------------------------ layout
let W = 0, H = 0, dpr = 1;

function resize() {
  const rect = sceneCanvas.getBoundingClientRect();
  W = Math.max(320, rect.width);
  H = Math.max(220, rect.height);
  dpr = GGKit.hiDpi.dpr();
  hud.resize(W, H, dpr);
  if (racer) racer.world.resize();
}
window.addEventListener('resize', resize, { passive: true });
window.addEventListener('orientationchange', resize, { passive: true });

// ------------------------------------------------------------- GGRacer adapter
function disposeWorld() {
  if (racer) racer.world.dispose();
  racer = null;
  racerTrackJSON = null;
  world = null;
  carRig = currentCar();
}

async function buildWorld(def) {
  const layout = buildLayout(def);
  const buckets = new Map();
  // Collision buckets remain title simulation data. GGRacer owns every visible
  // track, environment, vehicle and speed-effect mesh.
  for (const hazard of layout.trees) {
    const hazardState = { x: hazard.x, y: hazard.y, r: hazard.size * 0.9, node: hazard.node, kind: 'tree' };
    const key = hazard.node >> 3;
    let list = buckets.get(key);
    if (!list) { list = []; buckets.set(key, list); }
    list.push(hazardState);
  }
  for (const hazard of layout.rocks) {
    const hazardState = { x: hazard.x, y: hazard.y, r: hazard.size * 1.3, node: hazard.node, kind: 'rock' };
    const key = hazard.node >> 3;
    let list = buckets.get(key);
    if (!list) { list = []; buckets.set(key, list); }
    list.push(hazardState);
  }

  const response = await fetch('./tracks/' + def.id.toLowerCase() + '.json');
  if (!response.ok) throw new Error('missing GGRacer track JSON for ' + def.id);
  racerTrackJSON = await response.json();
  const spec = currentCar();
  racer = createRacerWorld({
    canvas: sceneCanvas,
    trackJSON: racerTrackJSON,
    theme: racerTrackJSON.theme,
    timeOfDay: racerTrackJSON.timeOfDay,
    // The sole adapter actor is reserved for the saved ghost. Rally sim
    // packets still contain no rivals and no AI is advanced.
    rivalCount: 1,
    ggkit: kit,
    paint: spec.body,
    accent: spec.accentTrim,
    seed: def.seed,
  });
  GGKit.hiDpi.three(racer.world.renderer);
  racer.world.resize();

  const ghostActor = racer.world.rivals[0];
  if (ghostActor) {
    ghostActor.setLivery({
      paint: racerTrackJSON.theme === 'night-city' ? 0x7de4eb : 0xf2c34e,
      accent: racerTrackJSON.theme === 'night-city' ? 0xd5fbff : 0xfff0b0,
    });
    ghostActor.root.traverse((object) => {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!material) continue;
        material.transparent = true;
        material.opacity = Math.min(Number(material.opacity) || 1, 0.28);
        material.depthWrite = false;
      }
    });
    ghostActor.root.visible = false;
  }

  const rec = stageRecord(def.id);
  const gdata = validateGhost(rec.ghost);
  if (gdata) {
    ghostPlay = gdata;
    ghostPerm = ghostPermanent(gdata);
  } else {
    ghostPlay = null;
    ghostPerm = null;
  }

  world = {
    def,
    biome: BIOMES[def.biome],
    layout,
    buckets,
    lastNode: layout.path.length - 9,
    notes: mergeNotes(layout),
    ghostActor,
  };
  carRig = spec;
}

function mergeNotes(layout) {
  const list = layout.features.concat(layout.surfaceNotes);
  list.sort((a, b) => a.index - b.index);
  return list.map((feature) => ({
    index: feature.index,
    text: featureText(feature),
    kind: feature.kind,
  }));
}

function prewarmScene() {
  if (!world) return;
  hud.warmFonts([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24, 26, 28, 32, 36, 44, 52, 64]);
}

// A ghost sample is [stageFraction, lateral] with an optional third field, the
// segment counter, which increments every time the recorded run took an
// off-road reset. Two-field samples from an older save are read as segment 0.
function validateGhost(g) {
  if (!Array.isArray(g) || g.length < 4 || g.length > GHOST_MAX) return null;
  for (let i = 0; i < g.length; i++) {
    const f = g[i];
    if (!Array.isArray(f) || f.length < 2 || f.length > 3) return null;
    if (typeof f[0] !== 'number' || !isFinite(f[0]) || f[0] < 0 || f[0] > 1) return null;
    if (typeof f[1] !== 'number' || !isFinite(f[1]) || Math.abs(f[1]) > 500) return null;
    if (f.length === 3 && (typeof f[2] !== 'number' || !isFinite(f[2]) || f[2] < 0 || f[2] > 999)) return null;
  }
  return g;
}

// The recorded fraction track is NOT monotonic: an off-road reset drops the
// ghost eighteen nodes back, so the same fraction occurs more than once and a
// naive binary search picks the wrong crossing. `perm[k]` is the minimum
// fraction over the suffix from k, which IS monotonic, and searching it answers
// the only question that matters: when did the ghost pass this point for good.
function ghostPermanent(samples) {
  const n = samples.length;
  const perm = new Float32Array(n);
  let m = Infinity;
  for (let k = n - 1; k >= 0; k--) {
    if (samples[k][0] < m) m = samples[k][0];
    perm[k] = m;
  }
  return perm;
}

// ------------------------------------------------------------------- sim
function angleDelta(a, b) {
  let d = (a - b + Math.PI) % TAU - Math.PI;
  if (d < -Math.PI) d += TAU;
  return d;
}

function resetSim() {
  const path = world.layout.path;
  const start = path[8];
  car.x = start.x; car.y = start.y; car.heading = start.heading;
  car.vx = 0; car.vy = 0; car.speed = 0; car.sideSpeed = 0;
  car.nearest = 8; car.lateral = 0; car.offroad = 0; car.resetTime = 0;
  car.drift = 0; car.bounce = 0; car.air = 0; car.airborne = false; car.vv = 0;
  car.prevSlope = 0; car.wheelSpin = 0; car.surface = start.surface;
  car.segment = 0; car.dirt = 0;

  run.time = 0; run.finished = false; run.failed = false;
  run.best = false; run.medal = ''; run.delta = 0; run.splitAt = 0;
  run.unlocked = null;
  rockCooldown = 0;
  engineRpm = 0.3; engineOverrun = 0;

  view.lean = 0; view.leanVel = 0;
  view.pitch = 0; view.pitchVel = 0;
  view.susp = 0; view.suspVel = 0;
  view.flash = 0; note.text = ''; note.next = ''; note.t = 0; note.cursor = 0; note.dist = 0;
  message = ''; messageTime = 0; messageKind = '';
  ceremonyT = 0;
  // Sample zero is the grid, taken at time zero. Recording only started after
  // the first tenth of a second, so playback treated the car's position at
  // 0.1 s as its position at 0.0 s and the ghost ran a sample ahead all stage.
  ghostRecord = [[clamp(8 / (path.length - 1), 0, 1), 0, 0]];
  ghostAccum = 0;
  proximity = 0;
  hitAccent.t = 0; hitAccent.life = 0;

  input.steer = 0; input.brake = false; input.handbrake = false;
  input.steerPointerId = null;
  // The kit owns pointer and key state. Clearing only the local mirror left a
  // handbrake that was held through the finish still held on the next grid.
  kit.input.clearAll();

  // The fixed-step accumulator and the frame clock belong to the run, not to
  // the session: a leftover slice from the previous stage used to advance the
  // new one by several steps on its first frame.
  acc = 0;
  lastTime = performance.now();

  if (racer && racer.world.fx.setReducedMotion) racer.world.fx.setReducedMotion(!motionOn());
}

// Surface colouring and dirt accumulation are owned by GGRacer's shared FX lane.
// Prototype nearestOnRoad(), verbatim in its search window and its maths.
function nearestOnRoad() {
  const path = world.layout.path;
  let bestIndex = car.nearest || 8;
  let bestDistance = Infinity;
  const start = clamp(bestIndex - 28, 0, path.length - 1);
  const end = clamp(bestIndex + 65, 0, path.length - 1);
  for (let i = start; i <= end; i += 1) {
    const p = path[i];
    const dx = car.x - p.x;
    const dy = car.y - p.y;
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) { bestDistance = distance; bestIndex = i; }
  }
  const p = path[bestIndex];
  const dx = car.x - p.x;
  const dy = car.y - p.y;
  const normalX = -Math.sin(p.heading);
  const normalY = Math.cos(p.heading);
  car.nearest = bestIndex;
  car.lateral = dx * normalX + dy * normalY;
  return p;
}

// The prototype handling model, with the surface channel folded in. Every
// named constant below is the design document's; the surface multipliers are
// all 1.0 on gravel, so gravel drives exactly as the prototype did.
function stepSim(dt) {
  const def = world.def;
  const spec = carRig;
  const path = world.layout.path;
  // The recce runs the same model with no clock, no limit and no penalty.
  const isRecce = mode === 'recce';

  if (!isRecce) {
    run.time += dt;
    if (run.time >= STAGE_LIMIT) {
      run.time = STAGE_LIMIT;
      failStage();
      return;
    }
  }

  if (car.resetTime > 0) {
    car.resetTime -= dt;
    if (car.resetTime <= 0) { messageTime = 0; }
    return;
  }

  const point = nearestOnRoad();
  car.surface = point.surface;
  const surf = SURFACES[car.surface];

  const forwardX = Math.cos(car.heading);
  const forwardY = Math.sin(car.heading);
  const sideX = -forwardY;
  const sideY = forwardX;
  let forwardSpeed = car.vx * forwardX + car.vy * forwardY;
  let sideSpeed = car.vx * sideX + car.vy * sideY;
  // Recce pace: the car crawls, and stops dead for the lessons that are read
  // rather than driven, so no lesson is delivered over a live corner.
  const recceCap = tutorial.hold ? 26 : 118;
  const maxSpeed = isRecce ? Math.min(def.maxSpeed * spec.topSpeed, recceCap)
    : def.maxSpeed * spec.topSpeed;
  const airborne = car.airborne;

  // Longitudinal. The prototype's car pulls its own throttle; the player only
  // ever slows it. Surface drive scales both the pull and the retardation.
  const drive = airborne ? 0.15 : surf.drive;
  if (input.brake) forwardSpeed -= 420 * drive * spec.accel * dt;
  else forwardSpeed += (370 * drive * spec.accel - forwardSpeed * .48) * dt;
  forwardSpeed = clamp(forwardSpeed, 0, maxSpeed);

  // Lateral. `grip` is the fraction of sideways speed RETAINED per frame, so
  // a grippier surface raises the exponent and kills the slide faster.
  const grip = input.handbrake ? .53 : .79;
  const stick = airborne ? 0.12 : surf.stick * spec.grip;
  sideSpeed *= Math.pow(grip, dt * 60 * stick);

  const turnPower = (.72 + clamp(forwardSpeed / maxSpeed, 0, 1) * 1.34)
    * (input.handbrake ? 2.15 : 1) * (airborne ? 0.28 : surf.turn);
  car.heading += input.steer * turnPower * dt;
  if (!airborne && !input.handbrake && Math.abs(car.lateral) < point.roadHalf * 1.15) {
    car.heading += angleDelta(point.heading, car.heading) * dt * (.2 + forwardSpeed / maxSpeed * .12);
  }

  const newForwardX = Math.cos(car.heading);
  const newForwardY = Math.sin(car.heading);
  const newSideX = -newForwardY;
  const newSideY = newForwardX;
  car.vx = newForwardX * forwardSpeed + newSideX * sideSpeed;
  car.vy = newForwardY * forwardSpeed + newSideY * sideSpeed;
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  car.speed = Math.max(0, forwardSpeed);
  car.sideSpeed = sideSpeed;
  car.wheelSpin += forwardSpeed * WORLD_SCALE * dt / 0.35;   // wheel radius ~0.35 m

  // Vertical: jumps. A crest that flattens out while the car is quick throws
  // it into the air; airborne the car keeps its momentum and barely steers.
  const slope = roadSlope(world.layout, car.nearest);
  if (!airborne) {
    if (car.prevSlope > 0.10 && slope < 0.03 && forwardSpeed > 165) {
      car.vv = (car.prevSlope - slope) * forwardSpeed * 3.4;
      car.air = 0.02;
      car.airborne = true;
      view.suspVel += 5;
      setMessage('AIRBORNE', 'info', 0.9);
    }
  } else {
    car.vv -= 980 * dt;
    car.air += car.vv * dt;
    if (car.air <= 0) {
      car.air = 0; car.vv = 0; car.airborne = false;
      landed(forwardSpeed);
    }
  }
  car.prevSlope = slope;

  const updated = nearestOnRoad();
  const outside = Math.abs(car.lateral) - updated.roadHalf;
  if (outside > 0 && !airborne) {
    car.offroad += dt * (outside > 75 ? 1.9 : .45);
    if (outside > 112) juiceShake(Math.min(H * 0.012, 7), 120);
  } else {
    car.offroad = Math.max(0, car.offroad - dt * 2.8);
  }
  if (car.offroad > .72 && !isRecce) { triggerReset('OFF ROAD'); return; }

  // Scenery contact. Rocks sit on the road itself (they are what CAUTION
  // ROCKS warns about) and cost speed; trees only exist off the road and end
  // the attempt with the prototype's three second reset.
  if (!airborne && !isRecce && checkContact()) return;

  const driftAmount = Math.abs(sideSpeed);
  if (driftAmount > 35 && car.speed > 90) {
    car.drift = clamp(car.drift + dt * driftAmount * .014, 0, 99);
  } else {
    car.drift = Math.max(0, car.drift - dt * 22);
  }
  car.bounce = updated.altitude * .4;

  advanceNotes();

  if (isRecce) return;

  // Split call at the halfway marker.
  const progress = car.nearest / (path.length - 1);
  if (!run.splitAt && progress > 0.5) {
    run.splitAt = run.time;
    sfx('split', { volume: 0.5 });
    const rec = stageRecord(def.id);
    if (rec.best) {
      const d = run.time - rec.best * 0.5;
      setMessage('HALFWAY  ' + formatDelta(d), d <= 0 ? 'good' : 'bad', 2.2);
    } else {
      setMessage('HALFWAY  ' + formatTime(run.time, true), 'info', 2.2);
    }
  }

  if (car.nearest >= world.lastNode) finishStage();
}

let rockCooldown = 0;

// Beat one of the impact language: anticipation. The nearest hazard inside a
// telegraph radius raises `proximity`, which the HUD reads as a warning bloom
// and the co-driver channel reads as a rising tick. Nothing here costs a
// broad-phase pass: it reuses the same three collision buckets as contact.
function checkContact() {
  if (rockCooldown > 0) rockCooldown -= 1 / 120;
  const key = car.nearest >> 3;
  const TELE = 190;             // prototype units, roughly two car lengths out
  let nearest = Infinity;
  let hit = null;
  for (let k = key - 1; k <= key + 1; k++) {
    const list = world.buckets.get(k);
    if (!list) continue;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      const dx = car.x - c.x, dy = car.y - c.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < c.r * c.r) { hit = c; break; }
      const gap = Math.sqrt(d2) - c.r;
      if (gap < nearest) nearest = gap;
    }
    if (hit) break;
  }
  const want = nearest < TELE ? clamp(1 - nearest / TELE, 0, 1) * clamp(car.speed / 200, 0, 1) : 0;
  proximity += (want - proximity) * 0.18;
  if (hit) {
    if (hit.kind === 'tree') { triggerReset('CONTACT', hit); return true; }
    if (rockCooldown <= 0) hitRock(hit);
    return false;
  }
  return false;
}

// Beat two: a short localized accent at the contact point, 50 to 120 ms, with
// surface-specific debris. Beat three is the spring-damped chassis and camera
// overshoot that the suspension and camera springs already carry.
function markAccent(kind, obj, life) {
  hitAccent.kind = kind;
  hitAccent.life = life;
  hitAccent.t = life;
  hitAccent.x = (obj ? obj.x : car.x) * WORLD_SCALE;
  hitAccent.y = roadY() + 0.7;
  hitAccent.z = (obj ? obj.y : car.y) * WORLD_SCALE;
}

function hitRock(obj) {
  rockCooldown = 0.8;
  car.speed *= 0.55;
  car.vx *= 0.55; car.vy *= 0.55;
  flashScreen(0.14);
  view.suspVel -= 8;
  juiceShake(Math.min(H * 0.018, 10), 240);
  juiceHitStop(50);
  if (racer) racer.world.fx.impact(8);
  markAccent('rock', obj, 0.1);
  sfx('impact', { volume: 0.8, rate: 0.95 + Math.random() * 0.2 });
  setMessage('ROCK  -  SPEED LOST', 'bad', 1.2);
  burstDust(14, 2, SURFACES[car.surface]);
  car.dirt = Math.min(1, car.dirt + 0.16);
}

function landed(forwardSpeed) {
  view.suspVel -= 14 + forwardSpeed * 0.03;
  juiceShake(Math.min(H * 0.016, 9), 200);
  juiceHitStop(45);
  if (racer) racer.world.fx.impact(7);
  markAccent('land', null, 0.12);
  sfx('land', { volume: 0.5, rate: 0.9 + Math.random() * 0.2 });
  const surf = SURFACES[car.surface];
  burstDust(26, 2.4, surf);
  car.dirt = Math.min(1, car.dirt + 0.12);
}

// Prototype triggerReset(): drop back 18 nodes, three second penalty.
function triggerReset(reason, obj) {
  const path = world.layout.path;
  const idx = clamp(car.nearest - 18, 8, path.length - 1);
  const target = path[idx];
  car.x = target.x;
  car.y = target.y;
  car.heading = target.heading;
  car.vx = 0; car.vy = 0; car.speed = 0; car.sideSpeed = 0;
  car.nearest = idx;
  car.lateral = 0;
  car.offroad = 0;
  car.resetTime = 3;
  car.drift = 0;
  car.air = 0; car.airborne = false; car.vv = 0;
  car.segment++;
  // The co-driver re-reads the road from the restart point.
  note.cursor = 0; note.text = ''; note.next = '';
  flashScreen(0.2);
  juiceShake(Math.min(H * 0.02, 12), 300);
  juiceHitStop(60);
  if (racer) racer.world.fx.impact(10);
  markAccent(reason === 'CONTACT' ? 'tree' : 'ground', obj, 0.12);
  sfx(reason === 'CONTACT' ? 'impact' : 'reset', { volume: 0.8, rate: 0.9 + Math.random() * 0.2 });
  setMessage(reason + '   PLUS 3 SECONDS', 'bad', 3);
  burstDust(20, 3, SURFACES[car.surface]);
  car.dirt = Math.min(1, car.dirt + 0.3);
  proximity = 0;
}

// Surface-authored burst. Gravel throws chips, mud throws clods, snow throws
// powder and tarmac throws spray, each into its own pool with its own mass.
// Shared GGRacer supplies pooled dust and impact FX. The rally sim still
// decides when a jump, rock, landing or reset occurs.
function burstDust(n, force) {
  if (!racer || !racer.world.fx) return;
  const position = { x: car.x * WORLD_SCALE, y: roadY() + 0.4, z: car.y * WORLD_SCALE };
  const count = Math.round(n * (motionOn() ? 1 : 0.5));
  for (let i = 0; i < count; i += 1) {
    racer.world.fx.spawnDust(position, {
      x: (Math.random() - 0.5) * force * 5,
      y: 2 + Math.random() * force * 2,
      z: (Math.random() - 0.5) * force * 5,
    });
  }
}

function roadY() {
  const path = world.layout.path;
  const p = path[clamp(car.nearest, 0, path.length - 1)];
  return p.elev * WORLD_SCALE;
}

// Two corners ahead, exactly as the prototype read them: skip anything closer
// than 22 nodes, prefer the SECOND upcoming call, and hold it inside a 270
// node window. The cursor walks forward, so nothing is filtered per frame.
function advanceNotes() {
  const notes = world.notes;
  while (note.cursor < notes.length && notes[note.cursor].index <= car.nearest + 22) note.cursor++;
  const first = notes[note.cursor];
  const second = notes[note.cursor + 1];
  const target = second || first;
  let text = '';
  let follow = '';
  if (target && target.index - car.nearest < 270 && target.index - car.nearest > -12) {
    text = target.text;
    const after = second ? notes[note.cursor + 2] : null;
    follow = after ? after.text : '';
  }
  if (text !== note.text) {
    note.text = text;
    note.next = follow;
    note.kind = target ? target.kind : '';
    note.index = target ? target.index : 0;
    note.t = 0;
    if (text) {
      const urgency = clamp(car.speed / (world.def.maxSpeed || 325), 0, 1);
      coDriver.say(text, urgency);
      sfx('note', { volume: 0.32, rate: 1.0 + urgency * 0.15 });
    }
  } else {
    note.next = follow;
  }
  // Distance to the call, in metres, so the card can count the corner down and
  // switch to its imminent state instead of holding one flat treatment.
  note.dist = note.text && note.index
    ? Math.max(0, (note.index - car.nearest) * world.layout.step * WORLD_SCALE) : 0;
}

// Reduced motion. The shared settings toggle only gated kit.juice.shake, so a
// player who had turned motion off still got the FOV kick, the speed streaks,
// the screen flashes, the HUD pulses and the hit-stop. One predicate now owns
// every one of them.
// Rev model. Six ratios, so the needle sweeps and drops on every shift instead
// of tracking road speed in one flat ramp; on the grid it blips against the
// limiter, and on the brakes it falls into overrun.
const GEARS = 6;
function updateEngineModel(dt) {
  const sf = clamp(car.speed / 325, 0, 1);
  const gear = Math.min(GEARS - 1, Math.floor(sf * GEARS));
  const inGear = sf * GEARS - gear;
  let target = 0.3 + inGear * 0.58;
  let over = 0;
  if (mode === 'countdown') {
    // Launch: the driver holds it against the limiter waiting for the light.
    target = 0.42 + Math.abs(Math.sin(performance.now() / 130)) * 0.5;
  } else if (car.airborne) {
    target = 0.94;                       // wheels unloaded, revs run away
  } else if (input.brake) {
    target *= 0.6;
    over = clamp((engineRpm - 0.5) * 2.2, 0, 1);
  }
  // Falling revs settle faster than rising ones: an engine picks up under load
  // and drops instantly on the lift.
  const k = Math.min(1, dt * (target > engineRpm ? 7 : 11));
  engineRpm += (target - engineRpm) * k;
  engineRpm = clamp(engineRpm, 0, 1);
  engineOverrun += (over - engineOverrun) * Math.min(1, dt * 8);
}

function motionOn() { return kit.juice.enabled; }
function juiceShake(mag, ms) { if (motionOn()) kit.juice.shake(mag, ms); }
function juiceHitStop(ms) { if (motionOn()) kit.juice.hitStop(ms); }
function flashScreen(v) { if (motionOn()) view.flash = Math.max(view.flash, v); }

function setMessage(text, kind, time) {
  message = text; messageKind = kind || 'info'; messageTime = time == null ? 2 : time;
}

function failStage() {
  run.finished = true;
  run.failed = true;
  mode = 'result';
  ceremonyT = 0;
  engine.stop();
  music.play('menu');
  sfx('impact', { volume: 0.5, rate: 0.7 });
}

function finishStage() {
  const def = world.def;
  run.finished = true;
  run.failed = false;
  const rec = stageRecord(def.id);
  const total = run.time;
  const medal = total <= def.gold ? 'GOLD'
    : total <= def.silver ? 'SILVER'
      : total <= def.bronze ? 'BRONZE' : '';
  const beforeGold = goldCount();
  if (medalRank(medal) > medalRank(rec.medal || '')) rec.medal = medal;
  run.medal = medal;
  run.delta = rec.best ? total - rec.best : 0;
  run.best = !rec.best || total < rec.best;
  if (run.best) {
    rec.best = total;
    if (ghostRecord && ghostRecord.length >= 4 && ghostRecord.length <= GHOST_MAX) {
      // The segment counter travels with the sample so a later playback can
      // break the ribbon at a reset instead of drawing a line across the jump.
      rec.ghost = ghostRecord.map((f) => [
        Math.round(f[0] * 10000) / 10000,
        Math.round(f[1] * 100) / 100,
        f[2] | 0,
      ]);
    }
  }
  persist();
  run.unlocked = CARS.find((c) => c.unlock > beforeGold && c.unlock <= goldCount()) || null;

  if (rallyRun) {
    rallyRun.times[rallyRun.stageIdx] = total;
    if (rallyRun.stageIdx >= rallyRun.rally.stageIds.length - 1) closeRally();
  }

  mode = 'result';
  ceremonyT = 0;
  engine.stop();
  flashScreen(0.3);
  sfx('stageclear', { volume: 0.75 });
  if (medal) sfx('fanfare', { volume: 0.6 });
  music.play('menu');
  if (!save.tutorialDone) { save.tutorialDone = true; tutorial.active = false; persist(); }
}

// Prototype medalFor(): the rally total is scored against the sum of the pars.
function rallyMedal(rally, total) {
  if (total <= rally.par * 1.06) return 'GOLD';
  if (total <= rally.par * 1.2) return 'SILVER';
  return 'BRONZE';
}

function closeRally() {
  const rally = rallyRun.rally;
  let total = 0;
  for (let i = 0; i < rally.stageIds.length; i++) total += rallyRun.times[i] || STAGE_LIMIT;
  const rec = rallyRecord(rally.index);
  const medal = rallyMedal(rally, total);
  if (medalRank(medal) > medalRank(rec.medal || '')) rec.medal = medal;
  if (!rec.best || total < rec.best) rec.best = total;
  rallyRun.total = total;
  rallyRun.medal = medal;
  rallyRun.closed = true;
  persist();
}

// ------------------------------------------------------------------- view
// The title sends the unchanged rally state to GGRacer every frame. No title
// code writes camera Euler components; the shared chase camera owns lookAt and
// quaternion-space roll.
const racerFrame = {
  carState: {
    progress: 0, speed: 0, steering: 0, acceleration: 0, lateralG: 0,
    suspension: 0, brake: 0, boost: 0, pitch: 0, roll: 0,
    position: { x: 0, y: 0, z: 0 }, yaw: 0,
  },
  rivals: [{
    progress: 0, speed: 0, steering: 0, acceleration: 0, lateralG: 0,
    suspension: 0, brake: 0, boost: 0, pitch: 0, roll: 0,
    position: { x: 0, y: -100, z: 0 }, yaw: 0,
  }],
};
const ghostState = {
  visible: false,
  progress: 0,
  speed: 0,
  lateral: 0,
  position: { x: 0, y: -100, z: 0 },
  yaw: 0,
};

function spring(obj, valueKey, velocityKey, target, stiffness, damping, dt) {
  const acceleration = (target - obj[valueKey]) * stiffness - obj[velocityKey] * damping;
  obj[velocityKey] += acceleration * dt;
  obj[valueKey] += obj[velocityKey] * dt;
}

function updateView(dt, frozen) {
  if (!racer || !world) return { px: car.x * WORLD_SCALE, py: roadY(), pz: car.y * WORLD_SCALE, speedFrac: 0 };
  const S = WORLD_SCALE;
  const path = world.layout.path;
  const speedFrac = clamp(car.speed / (world.def.maxSpeed * carRig.topSpeed), 0, 1);
  const slideYaw = clamp(Math.atan2(car.sideSpeed, Math.max(60, car.speed)) * 0.9, -0.55, 0.55);
  const heading = car.heading - slideYaw;
  if (!frozen) {
    spring(view, 'lean', 'leanVel', clamp(car.sideSpeed / 260, -1, 1) * 0.16 + input.steer * 0.03, 260, 16, Math.min(dt, 0.05));
    spring(view, 'pitch', 'pitchVel', (input.brake ? -1 : 0.35) * 0.04 * (0.35 + car.speed / 325), 230, 15, Math.min(dt, 0.05));
    spring(view, 'susp', 'suspVel', 0, 190, 13, Math.min(dt, 0.05));
  }
  const actor = racerFrame.carState;
  actor.progress = clamp(car.nearest / Math.max(1, path.length - 1), 0, 1);
  actor.speed = car.speed * S;
  actor.steering = input.steer;
  actor.acceleration = input.brake ? -2 : 1;
  actor.lateralG = car.sideSpeed * S * 0.02;
  actor.suspension = view.susp;
  actor.brake = input.brake ? 1 : 0;
  actor.boost = 0;
  actor.pitch = view.pitch + car.bounce * 0.06;
  actor.roll = motionOn() ? view.lean : 0;
  actor.position.x = car.x * S;
  actor.position.y = roadY() + car.air * S;
  actor.position.z = car.y * S;
  actor.yaw = worldYaw(heading);

  const ghost = racerFrame.rivals[0];
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
    ghost.position.x = 0;
    ghost.position.y = -100;
    ghost.position.z = 0;
    ghost.yaw = 0;
  }
  racer.world.update(racerFrame, Number(dt) || 1 / 60);
  if (world.ghostActor) world.ghostActor.root.visible = ghostState.visible;
  return {
    px: actor.position.x,
    py: actor.position.y,
    pz: actor.position.z,
    heading,
    speedFrac,
  };
}

// GGRacer owns dust, skid, impact, streak and car animation pools. The title
// retains only the rally-specific surface audio cadence.
let skidSfxAt = 0;
let gravelSfxAt = 0;
function updateFx(dt, place) {
  if (!racer || !world) return;
  const slide = Math.abs(car.sideSpeed);
  const offRoad = Math.abs(car.lateral) > world.layout.path[car.nearest].roadHalf;
  const speedFrac = place.speedFrac;
  if (!car.airborne && car.resetTime <= 0 && (slide > 45 || offRoad) && speedFrac > 0.18) {
    racer.world.fx.spawnSkid(
      { x: place.px, y: place.py, z: place.pz },
      worldYaw(car.heading),
    );
    const now = performance.now();
    if (offRoad && now - gravelSfxAt > 380) {
      gravelSfxAt = now;
      sfx('gravel', { volume: 0.22 + speedFrac * 0.2, rate: 0.75 + speedFrac * 0.45 });
    } else if (!offRoad && now - skidSfxAt > 400) {
      skidSfxAt = now;
      sfx('slide', { volume: 0.2 + clamp(slide / 300, 0, 1) * 0.24, rate: 0.85 + speedFrac * 0.4 });
    }
  }
}

// ------------------------------------------------------------------ ghost
// Sample k is taken at exactly k/HZ seconds, starting from the grid sample laid
// down by resetSim at t=0, so playback and recording share one clock.
function updateGhostRecord(dt) {
  if (!ghostRecord) return;
  ghostAccum += dt;
  const step = 1 / GHOST_HZ;
  const n = world.layout.path.length - 1;
  while (ghostAccum >= step) {
    ghostAccum -= step;
    if (ghostRecord.length < GHOST_MAX) {
      ghostRecord.push([clamp(car.nearest / n, 0, 1), car.lateral, car.segment]);
    }
  }
}

function updateGhostPlayback() {
  if (!ghostPlay || !ghostPlay.length || !world) {
    ghostState.visible = false;
    return;
  }
  const idx = run.time * GHOST_HZ;
  if (idx >= ghostPlay.length - 1) {
    ghostState.visible = false;
    return;
  }
  const i = Math.floor(idx);
  const f = idx - i;
  const a = ghostPlay[i], b = ghostPlay[i + 1];
  const frac = a[0] + (b[0] - a[0]) * f;
  const lat = a[1] + (b[1] - a[1]) * f;
  const path = world.layout.path;
  const n = path.length - 1;
  const fi = clamp(frac, 0, 1) * n;
  const pi = Math.min(n - 1, Math.floor(fi));
  const mix = fi - pi;
  const p0 = path[pi], p1 = path[pi + 1];
  const h = p0.heading;
  const nx = -Math.sin(h), nz = Math.cos(h);
  ghostState.visible = true;
  ghostState.progress = frac;
  ghostState.lateral = lat;
  ghostState.position.x = ((p0.x + (p1.x - p0.x) * mix) + nx * lat) * WORLD_SCALE;
  ghostState.position.y = (p0.elev + (p1.elev - p0.elev) * mix) * WORLD_SCALE + 0.03;
  ghostState.position.z = ((p0.y + (p1.y - p0.y) * mix) + nz * lat) * WORLD_SCALE;
  ghostState.yaw = worldYaw(h);
  ghostState.speed = Math.max(0, ((b[0] - a[0]) * n * world.layout.step * WORLD_SCALE) * GHOST_HZ);
}

function ghostDelta() {
  if (!ghostPlay || !ghostPlay.length || !ghostPerm) return null;
  const frac = car.nearest / (world.layout.path.length - 1);
  const last = ghostPerm.length - 1;
  if (frac >= ghostPerm[last]) return run.time - last / GHOST_HZ;
  if (frac <= ghostPerm[0]) return run.time;
  let lo = 0, hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ghostPerm[mid] <= frac) lo = mid; else hi = mid;
  }
  const a = ghostPerm[lo], b = ghostPerm[hi];
  const span = b - a;
  const f = span > 0 ? clamp((frac - a) / span, 0, 1) : 0;
  return run.time - (lo + f) / GHOST_HZ;
}

// ------------------------------------------------------------------ input
function inRect(p, r) {
  return r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

// Control rects depend only on the viewport, so they are solved once per
// resize; this runs twice a frame and used to allocate on every call.
const _zones = {
  handbrake: { x: 0, y: 0, w: 0, h: 0 },
  brake: { x: 0, y: 0, w: 0, h: 0 },
  pause: { x: 0, y: 0, w: 0, h: 0 },
  key: '',
};
function controlZones() {
  const s = hud.safe;
  const key = W + 'x' + H + ':' + s.top + ',' + s.right + ',' + s.bottom + ',' + s.left;
  if (_zones.key === key) return _zones;
  _zones.key = key;
  const pad = Math.max(14, W * 0.022);
  const bw = Math.max(80, Math.min(124, W * 0.118));
  const bh = Math.max(74, Math.min(104, H * 0.2));
  const by = H - bh - pad - s.bottom;
  const t = _zones.handbrake, b = _zones.brake, p = _zones.pause;
  t.x = W - pad - s.right - bw; t.y = by; t.w = bw; t.h = bh;
  b.x = W - pad - s.right - bw * 2 - 12; b.y = by; b.w = bw; b.h = bh;
  p.x = W - pad - s.right - 46; p.y = pad + s.top; p.w = 46; p.h = 40;
  return _zones;
}

function readInput() {
  if (mode !== 'stage' && mode !== 'countdown') {
    input.steer = 0; input.brake = false; input.handbrake = false;
    input.steerPointerId = null;
    return;
  }
  const zones = controlZones();
  let handbrake = false, brake = false, steer = 0, steering = false;
  for (const [id, p] of kit.input.pointers) {
    if (inRect(p, zones.handbrake)) { handbrake = true; continue; }
    if (inRect(p, zones.brake)) { brake = true; continue; }
    if (inRect(p, zones.pause)) continue;
    // Prototype steer zone: the left side of the screen, drag relative to the
    // touch-down point. The first pointer inside owns steering until it lifts.
    // The design document says the LEFT HALF; 0.55 was a quiet drift from it.
    if (p.x < W * 0.5) {
      if (input.steerPointerId === null || input.steerPointerId === id) {
        input.steerPointerId = id;
        steer = clamp((p.x - p.startX) / Math.max(80, W * 0.12), -1, 1);
        steering = true;
      }
    }
  }
  if (!steering) input.steerPointerId = null;

  const k = kit.input;
  let keySteer = 0;
  if (k.keyDown('ArrowLeft') || k.keyDown('KeyA')) keySteer -= 1;
  if (k.keyDown('ArrowRight') || k.keyDown('KeyD')) keySteer += 1;
  const keyBrake = k.keyDown('ArrowDown') || k.keyDown('KeyS');
  const keyHand = k.keyDown('Space') || k.keyDown('Enter') || k.keyDown('ArrowUp') || k.keyDown('KeyW');

  input.steer = clamp(steer + keySteer, -1, 1);
  input.brake = brake || keyBrake;
  input.handbrake = handbrake || keyHand;
}

// Press and release, not fire-on-touch. A menu control now lights while it is
// held and only acts when the finger lifts on it, so every button has a real
// press state and a drag off it cancels, which is what a player expects from a
// premium touch UI.
const press = { id: null, x: 0, y: 0 };
function pressedId() { return press.id; }
hud.pressedId = pressedId;

function localPoint(e) {
  const rect = sceneCanvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

sceneCanvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  const p = localPoint(e);
  const z = hud.hit(p.x, p.y);
  if (!z) { press.id = null; return; }
  if (kit.paused && !PAUSED_OK.has(z.id)) { press.id = null; return; }
  press.id = z.id; press.x = p.x; press.y = p.y;
  sfx('uitick', { volume: 0.28 });
}, { passive: false });

sceneCanvas.addEventListener('pointerup', (e) => {
  e.preventDefault();
  const held = press.id;
  press.id = null;
  if (!held) return;
  const p = localPoint(e);
  const z = hud.hit(p.x, p.y);
  if (z && z.id === held) handleTap(p.x, p.y);
}, { passive: false });

for (const ev of ['pointercancel', 'pointerleave']) {
  sceneCanvas.addEventListener(ev, () => { press.id = null; });
}
sceneCanvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
sceneCanvas.addEventListener('contextmenu', (e) => e.preventDefault());

// Menu taps must work while the kit is paused, otherwise the pause menu is
// unclickable. Only pause-menu ids are honoured in that state, so a paused sim
// can never be driven.
const PAUSED_OK = new Set(['pause-resume', 'pause-restart', 'pause-settings', 'pause-quit']);

function handleTap(x, y) {
  const z = hud.hit(x, y);
  if (!z) return;
  if (kit.paused && !PAUSED_OK.has(z.id)) return;
  // A screen that is still easing in cannot be actioned. The transition moves
  // the layout by a few pixels, so firing mid-slide could hit the wrong control.
  if (modeT < MODE_FADE * 0.6) return;
  sfx(z.id.indexOf('nav') === 0 ? 'uitick' : 'uiselect', { volume: 0.5 });
  onZone(z);
}

let garageIndex = 0;

function onZone(z) {
  switch (z.id) {
    case 'title-start':
      if (!save.tutorialDone) { startRally(RALLIES[0], true); }
      else { mode = 'rallies'; music.play('menu'); }
      break;
    case 'title-garage': mode = 'garage'; break;
    case 'title-settings': openSettings(); break;
    case 'title-credits': mode = 'credits'; break;
    case 'credits-back': mode = 'title'; break;
    case 'garage-back': mode = 'title'; break;
    case 'garage-prev': garageIndex = (garageIndex - 1 + CARS.length) % CARS.length; break;
    case 'garage-next': garageIndex = (garageIndex + 1) % CARS.length; break;
    case 'garage-pick': {
      const c = CARS[garageIndex];
      if (carUnlocked(c) && save.car !== c.id) {
        save.car = c.id;
        persist();
        swapCar(c);
      }
      break;
    }
    case 'rallies-back': mode = 'title'; break;
    case 'rally-run': startRally(RALLIES[z.data], false); break;
    case 'rally-stages': listRally = z.data; mode = 'stages'; break;
    case 'stages-back': mode = 'rallies'; break;
    case 'stage-pick': rallyRun = null; startStage(STAGES.find((s) => s.id === z.data)); break;
    case 'result-retry': startStage(stageDef); break;
    case 'result-next': {
      if (rallyRun && !rallyRun.closed) {
        rallyRun.stageIdx++;
        const id = rallyRun.rally.stageIds[rallyRun.stageIdx];
        startStage(STAGES.find((s) => s.id === id));
      } else if (rallyRun && rallyRun.closed) {
        mode = 'summary';
        ceremonyT = 0;
      } else {
        const i = STAGES.indexOf(stageDef);
        // The last standalone stage used to restart itself forever; there is
        // nothing after it, so the button goes back to the season.
        if (i >= STAGES.length - 1) { mode = 'rallies'; music.play('menu'); }
        else startStage(STAGES[i + 1]);
      }
      break;
    }
    case 'result-quit': rallyRun = null; mode = 'rallies'; music.play('menu'); break;
    case 'summary-again': startRally(rallyRun.rally, false); break;
    case 'summary-next': {
      const nextIdx = rallyRun.rally.index + 1;
      // No rally follows the last one: the button is hidden there, and this
      // guard keeps a keyboard Enter from restarting the final rally.
      if (nextIdx >= RALLIES.length) { rallyRun = null; mode = 'rallies'; music.play('menu'); break; }
      startRally(RALLIES[nextIdx], false);
      break;
    }
    case 'summary-menu': rallyRun = null; mode = 'rallies'; music.play('menu'); break;
    case 'pause': kit.pause('button'); break;
    case 'pause-resume': kit.resume('button'); break;
    case 'pause-restart':
      // kit.restart() alone left the 'button' pause reason set, so the fresh
      // countdown started frozen behind the pause overlay. Unrelated reasons
      // (visibility, orientation) are deliberately left alone.
      kit.resume('button');
      kit.restart();
      break;
    case 'pause-settings': openSettings(); break;
    case 'pause-quit':
      kit.resume('button');
      rallyRun = null;
      mode = 'rallies';
      engine.stop();
      music.play('menu');
      break;
    case 'tutorial-skip':
      tutorial.active = false;
      save.tutorialDone = true;
      persist();
      break;
    default: break;
  }
}

// Swap the livery on the GGRacer car without rebuilding the simulation.
let swapping = false;
async function swapCar(spec) {
  if (swapping) return;
  swapping = true;
  try {
    carRig = spec;
    if (racer && racer.world.mainCar) {
      racer.world.mainCar.setLivery({ paint: spec.body, accent: spec.accentTrim });
    }
    setMessage(spec.name.toUpperCase() + ' READY', 'good', 2);
  } finally {
    swapping = false;
  }
}

function openSettings() {
  kit.openSettings([
    (box, row) => {
      row('Music', () => music.mode !== null && !kit.audio.prefs.mute,
        (v) => { kit.audio.setMusicVolume(v ? 0.7 : 0); music.applyVolume(); });
    },
  ]);
}

// -------------------------------------------------------- branded loading
// The shared GGKit loader is a black field and a green bar: correct, and
// anonymous. This title paints its own composition over it (biome key art, the
// stage name, a car silhouette and a running dust motif) and drives it from
// the same progress calls, so the kit still owns the loading contract.
const loader = (function makeLoader() {
  let box = null, canvas = null, ctx = null, raf = 0;
  let target = 0, shown = 0, t = 0, def = null, biome = null, done = false;
  const PHASES = ['READING THE STAGE', 'BUILDING THE ROAD', 'SETTING THE SCENE',
    'LOADING THE CREW', 'ON THE START LINE'];

  function paint() {
    if (!ctx) return;
    const w = canvas.width, h = canvas.height;
    const s = w / 900;
    shown += (target - shown) * 0.14;
    t += 1 / 60;
    const sky = biome ? biome.sky : { top: 0x1f4f86, mid: 0x8aa6b6, bot: 0xf3c184 };
    const acc = biome ? biome.accent : 0xffc768;
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, hexStr(sky.top));
    grad.addColorStop(0.55, hexStr(sky.mid));
    grad.addColorStop(1, hexStr(sky.bot));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Horizon silhouette in the biome's own profile.
    const hy = h * 0.62;
    ctx.fillStyle = 'rgba(18,14,12,0.55)';
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 12) {
      const u = x / w * 12;
      const id = biome ? biome.id : 'pine';
      const p = id === 'canyon' ? Math.round((0.5 + Math.sin(u * 1.4) * 0.3) * 4) / 4
        : id === 'alpine' ? 0.4 + Math.abs(Math.sin(u * 0.9)) * 0.6
          : id === 'coast' ? 0.2 + Math.abs(Math.sin(u * 0.6)) * 0.2
            : 0.34 + Math.abs(Math.sin(u * 2.1)) * 0.3;
      ctx.lineTo(x, hy - p * h * 0.24);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();

    // Road running to the vanishing point, with the tyre grooves the stage has.
    ctx.fillStyle = 'rgba(38,28,19,0.94)';
    ctx.beginPath();
    ctx.moveTo(w * 0.5 - 8 * s, hy);
    ctx.lineTo(w * 0.5 + 8 * s, hy);
    ctx.lineTo(w * 0.92, h);
    ctx.lineTo(w * 0.08, h);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,14,9,0.8)';
    ctx.lineWidth = 6 * s;
    for (const k of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(w * 0.5 + k * 3 * s, hy);
      ctx.lineTo(w * 0.5 + k * 0.19 * w, h);
      ctx.stroke();
    }

    // Dust motif: a rolling plume that runs while the stage builds.
    for (let i = 0; i < 26; i++) {
      const ph = (t * 0.5 + i * 0.16) % 1;
      const rad = (10 + ph * 90) * s;
      const cx = w * 0.5 + Math.sin(i * 2.1 + t * 0.6) * ph * w * 0.36;
      const cy = hy + ph * (h - hy) * 0.9;
      ctx.fillStyle = 'rgba(216,189,138,' + (0.3 * (1 - ph)).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill();
    }

    // Car silhouette on the crest.
    const cw = 150 * s, ch = 52 * s;
    const cx = w * 0.5, cy = hy + (h - hy) * 0.42;
    ctx.fillStyle = 'rgba(14,10,8,0.92)';
    ctx.beginPath();
    ctx.moveTo(cx - cw / 2, cy + ch * 0.5);
    ctx.lineTo(cx - cw * 0.4, cy - ch * 0.1);
    ctx.lineTo(cx - cw * 0.16, cy - ch * 0.5);
    ctx.lineTo(cx + cw * 0.2, cy - ch * 0.5);
    ctx.lineTo(cx + cw * 0.42, cy - ch * 0.05);
    ctx.lineTo(cx + cw / 2, cy + ch * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = hexStr(acc);
    ctx.fillRect(cx - cw * 0.3, cy - ch * 0.62, cw * 0.6, ch * 0.1);

    // Type block.
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const px = 42 * s, py = h - 96 * s;
    ctx.fillStyle = hexStr(acc);
    ctx.font = '900 ' + Math.round(15 * s) + 'px -apple-system, system-ui, Arial, sans-serif';
    ctx.fillText('RALLY DUST', px, py - 30 * s);
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 ' + Math.round(38 * s) + 'px -apple-system, system-ui, Arial, sans-serif';
    ctx.fillText(def ? def.name : 'STAGE', px, py);
    ctx.fillStyle = 'rgba(238,232,220,0.82)';
    ctx.font = '700 ' + Math.round(15 * s) + 'px -apple-system, system-ui, Arial, sans-serif';
    ctx.fillText((def ? def.rallyName.toUpperCase() : '') + '   SS' + ((def ? def.tier : 0) + 1)
      + '   PAR ' + formatTime(def ? def.par : 0), px, py + 24 * s);

    // Branded progress with named build phases.
    const bw = w - px * 2, bh = 8 * s, by = h - 40 * s;
    ctx.fillStyle = 'rgba(12,10,8,0.7)';
    ctx.fillRect(px, by, bw, bh);
    ctx.fillStyle = hexStr(acc);
    ctx.fillRect(px, by, bw * clamp(shown, 0, 1), bh);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '800 ' + Math.round(12 * s) + 'px -apple-system, system-ui, Arial, sans-serif';
    const phase = PHASES[Math.min(PHASES.length - 1, Math.floor(shown * PHASES.length))];
    ctx.fillText(done ? 'READY' : phase, px, by - 10 * s);
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(clamp(shown, 0, 1) * 100) + '%', px + bw, by - 10 * s);

    raf = requestAnimationFrame(paint);
  }

  return {
    show(stageDefIn, biomeIn) {
      def = stageDefIn; biome = biomeIn; target = 0; shown = 0; done = false;
      if (box) return;
      box = document.createElement('div');
      box.style.cssText = 'position:fixed;inset:0;z-index:9100;background:#120d09;';
      canvas = document.createElement('canvas');
      canvas.style.cssText = 'width:100%;height:100%;display:block;';
      const r = GGKit.hiDpi.dpr();
      canvas.width = Math.round(window.innerWidth * r);
      canvas.height = Math.round(window.innerHeight * r);
      box.appendChild(canvas);
      document.body.appendChild(box);
      ctx = canvas.getContext('2d');
      raf = requestAnimationFrame(paint);
    },
    progress(f) { target = Math.max(target, f); },
    // Hold the composition until the bar has visibly filled, so the branded
    // screen is never a single frame flash on a warm cache.
    finish() {
      done = true; target = 1;
      return new Promise((res) => setTimeout(res, 320));
    },
    hide() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (box) { box.remove(); box = null; canvas = null; ctx = null; }
    },
  };
}());

// ------------------------------------------------------------- lifecycle
function onPause() { engine.suspend(); if (racer) racer.world.setPaused(true); }
function onResume() {
  if (racer) racer.world.setPaused(false);
  if (mode === 'stage') engine.start();
  // Visibility resumes before the next frame is scheduled. Without resetting
  // the frame clock the first resumed frame carried the whole background
  // interval, clamped to 50 ms, and quietly advanced the race.
  lastTime = performance.now();
  acc = 0;
}
function onRestart() { if (world) startStage(stageDef); }

function startRally(rally, isTutorial) {
  rallyRun = { rally, stageIdx: 0, times: [], closed: false, total: 0, medal: '' };
  const first = STAGES.find((s) => s.id === rally.stageIds[0]);
  startStage(first, isTutorial);
}

async function startStage(def, isTutorial) {
  if (loading || !def) return;
  loading = true;
  stageDef = def;
  mode = 'loading';
  // Every route into a new stage clears input, not only kit.restart(): a
  // handbrake or a Space held through the finish used to arrive on the next
  // grid still held, because resetSim only cleared this file's own mirror.
  kit.input.clearAll();
  // A stage started from the pause menu must not inherit the pause. Unrelated
  // reasons (visibility, orientation) stay set and keep the sim frozen.
  kit.resume('button');
  loader.show(def, BIOMES[def.biome]);
  kit.loader.show('Rally Dust');
  progress(0.05);
  try {
    disposeWorld();
    progress(0.18);
    await buildWorld(def);
    progress(0.58);
    // Every clip the stage can trigger is decoded here, on the loading screen.
    // A lazy decode mid-stage costs a multi-hundred-millisecond stall.
    await kit.audio.preload(SFX_BANK);
    progress(0.78);
    await music.preloadFor('stage');
    progress(0.9);
    resetSim();
    // Place the camera before the first render so frame 1 is never a flash of
    // the clear colour.
    updateView(0, true);
    prewarmScene();
    progress(0.97);
    countdown = 3.6;
    countdownStep = -1;
    // The recce is a staged pre-stage lesson now, not six banners thrown over a
    // live competitive run; see startRecce().
    if (isTutorial || !save.tutorialDone) startRecce(); else mode = 'countdown';
    music.play('stage');
    progress(1);
    await loader.finish();
  } catch (err) {
    setMessage('STAGE FAILED TO LOAD', 'bad', 4);
    mode = 'rallies';
    loader.hide();
  } finally {
    kit.loader.hide();
    loader.hide();
    loading = false;
    lastTime = performance.now();
    acc = 0;
  }
}

function progress(f) { kit.loader.progress(f); loader.progress(f); }

// ------------------------------------------------------------------- HUD
function accentOf() { return (world ? world.biome : BIOMES.pine).accent; }
function accentStr() { return hexStr(accentOf()); }

// Screen transitions. Menu changes used to be hard cuts: the whole overlay
// swapped between one frame and the next. Every screen now eases in on an
// ease-out cubic, fade plus a short rise, and taps are refused until it lands.
const MODE_FADE = 0.22;
let modeT = MODE_FADE;
let drawnMode = '';

function drawHud(dt) {
  hud.clear();
  if (mode !== drawnMode) { drawnMode = mode; modeT = 0; }
  modeT = Math.min(MODE_FADE + 1, modeT + dt);
  const menu = mode === 'title' || mode === 'rallies' || mode === 'stages'
    || mode === 'garage' || mode === 'credits';

  if (menu) {
    const c = hud.ctx;
    const e = EASE.outCubic(clamp(modeT / MODE_FADE, 0, 1));
    c.save();
    c.globalAlpha = e;
    c.translate(0, (1 - e) * 16);
    if (mode === 'title') drawTitle();
    else if (mode === 'rallies') drawRallies();
    else if (mode === 'stages') drawStages();
    else if (mode === 'garage') drawGarage();
    else drawCredits();
    c.restore();
    return;
  }
  if (mode === 'loading') return;

  drawStageHud(dt);
  if (mode === 'countdown') drawCountdown();
  if (mode === 'result') drawResult(dt);
  if (mode === 'summary') drawSummary(dt);
  if (tutorial.active && mode === 'stage') drawTutorial();
  if (kit.paused && !document.hidden) drawPause();
}

function drawTitle() {
  const c = hud.ctx;
  const cx = W / 2;
  const accent = hexStr(accentOf());
  hud.scrim(0.5);
  const t = performance.now() / 1000;

  const titleY = H * 0.26;
  // The wordmark uses the title display treatment: raked competition plate
  // type with the stage running live through the stencil slot.
  hud.display('RALLY', cx, titleY, Math.min(60, W * 0.09), '#ffffff', 'center');
  hud.display('DUST', cx, titleY + Math.min(50, W * 0.075), Math.min(50, W * 0.075),
    accent, 'center');
  const barW = Math.min(300, W * 0.34) * (0.94 + Math.sin(t * 1.6) * 0.06);
  c.fillStyle = rgba(accentOf(), 0.85);
  hud.roundRect(cx - barW / 2, titleY + Math.min(82, W * 0.115), barW, 3, 2);
  c.fill();

  const bw = Math.min(250, W * 0.31), bh = 46, gap = 11;
  let by = H * 0.55;
  hud.button('title-start', cx - bw / 2, by, bw, bh,
    save.tutorialDone ? 'RALLY' : 'START THE SEASON',
    { accent, solid: true, size: 16 });
  by += bh + gap;
  const halfW = (bw - gap) / 2;
  hud.button('title-garage', cx - bw / 2, by, halfW, 40, 'GARAGE', { accent: '#cbb79a', size: 12 });
  hud.button('title-settings', cx + gap / 2, by, halfW, 40, 'SETTINGS', { accent: '#cbb79a', size: 12 });
  by += 40 + gap;
  hud.button('title-credits', cx - bw / 2, by, bw, 32, 'CREDITS', { accent: '#8b8172', size: 11 });

  const stats = medalCount() + ' of ' + STAGES.length + ' stages medalled  -  '
    + goldCount() + ' gold  -  ' + CARS.filter(carUnlocked).length + ' of ' + CARS.length + ' liveries';
  hud.text(stats, cx, H - 22 - hud.safe.bottom, 11, 'rgba(224,214,198,0.75)', 'center', 700, 0.4);
}

function drawCredits() {
  hud.scrim(0.9);
  const cx = W / 2;
  let y = Math.max(46, H * 0.13) + hud.safe.top;
  hud.display('CREDITS', cx, y, 22, '#ffffff', 'center', accentStr());
  y += 32;
  const lines = [
    ['Design, code and art direction', 'GreenGuard Studio'],
    ['Vehicle models', 'Quaternius Cars Pack (CC0)'],
    ['Sound effects', 'Kenney Impact, Interface, Digital and Jingle packs (CC0)'],
    ['Music', 'cynicmusic, of-far-different-nature and ferk (CC0, OpenGameArt)'],
    ['Engine', 'Three.js r160'],
  ];
  for (const [k, v] of lines) {
    hud.text(k, cx, y, 11, 'rgba(196,184,166,0.85)', 'center', 700, 0.5);
    y += 16;
    hud.text(v, cx, y, 14, '#ffffff', 'center', 800);
    y += 25;
  }
  hud.text('The co-driver voice is synthesised in the browser. Full per-file licensing is in LICENSES.md',
    cx, y + 4, 10, 'rgba(180,170,155,0.7)', 'center', 600);
  hud.button('credits-back', cx - 70, H - 56 - hud.safe.bottom, 140, 40, 'BACK',
    { accent: '#cbb79a', size: 13 });
}

function drawRallies() {
  const c = hud.ctx;
  const s = hud.safe;
  hud.scrim(0.86);
  const cx = W / 2;
  let y = Math.max(28, H * 0.075) + s.top;
  hud.display('THE SEASON', cx, y, 19, '#ffffff', 'center', accentStr());
  y += 20;
  hud.text(goldCount() + ' GOLD  -  ' + medalCount() + '/' + STAGES.length + ' STAGES MEDALLED',
    cx, y, 10, 'rgba(212,200,182,0.75)', 'center', 700, 0.8);
  y += 20;

  const gap = Math.max(8, W * 0.014);
  const availW = W - gap * 2 - s.left - s.right;
  const cardW = (availW - gap * 3) / 4;
  const cardH = Math.min(150, H - y - 66 - s.bottom);

  for (let i = 0; i < RALLIES.length; i++) {
    const r = RALLIES[i];
    const b = BIOMES[r.biome];
    const rec = save.rallies[String(i)];
    const x = gap + s.left + i * (cardW + gap);
    hud.chip(x, y, cardW, cardH, 'rgba(16,14,12,0.92)', rgba(b.accent, 0.4), 13);
    // Sky swatch so the biome reads from the menu.
    c.fillStyle = rgba(b.sky.mid, 1);
    hud.roundRect(x + 1.5, y + 1.5, cardW - 3, 22, 11); c.fill();
    hud.text(b.timeOfDay.toUpperCase(), x + 10, y + 12, 8, 'rgba(10,10,14,0.85)', 'left', 900, 1.4);

    hud.text('RALLY ' + (i + 1), x + 10, y + 38, 9, hexStr(b.accent), 'left', 900, 1.4);
    hud.text(r.name, x + 10, y + 56, Math.max(11, Math.min(15, cardW * 0.115)), '#ffffff', 'left', 800);

    let done = 0;
    for (const id of r.stageIds) { const sr = save.stages[id]; if (sr && sr.medal) done++; }
    hud.text(done + '/4 MEDALLED', x + 10, y + 74, 9, 'rgba(200,190,172,0.7)', 'left', 700, 0.6);
    hud.bar(x + 10, y + 82, cardW - 20, 5, done / 4, 'rgba(255,255,255,0.12)', rgba(b.accent, 0.9));

    hud.text('PAR ' + formatTime(r.par), x + 10, y + 98, 9, 'rgba(200,190,172,0.62)', 'left', 700, 0.5);
    hud.text(rec && rec.best ? formatTime(rec.best) : '--:--.--',
      x + cardW - 10, y + 98, 11, rec && rec.best ? '#ffffff' : 'rgba(180,170,155,0.5)', 'right', 800);
    if (rec && rec.medal) {
      const mc = MEDAL_COLOR[rec.medal] || 0xcccccc;
      c.fillStyle = rgba(mc, 1);
      c.beginPath(); c.arc(x + cardW - 18, y + 40, 8, 0, TAU); c.fill();
      hud.text(rec.medal[0], x + cardW - 18, y + 40, 9, '#12100c', 'center', 900);
    }

    const byy = y + cardH - 32;
    const halfW = (cardW - 24) / 2;
    hud.button('rally-run', x + 8, byy, halfW, 24, 'RUN', { accent: hexStr(b.accent), solid: true, size: 10, data: i, radius: 9 });
    hud.button('rally-stages', x + 16 + halfW, byy, halfW, 24, 'STAGES', { accent: '#cbb79a', size: 10, data: i, radius: 9 });
  }

  hud.text(RALLIES[clamp(listRally, 0, RALLIES.length - 1)].blurb,
    cx, H - 42 - s.bottom, 11, 'rgba(210,200,184,0.78)', 'center', 600);
  hud.button('rallies-back', gap + s.left, H - 30 - s.bottom, 92, 26, 'BACK', { accent: '#8b8172', size: 10 });
}

function drawStages() {
  const c = hud.ctx;
  const s = hud.safe;
  hud.scrim(0.88);
  const cx = W / 2;
  const r = RALLIES[listRally];
  const b = BIOMES[r.biome];
  let y = Math.max(26, H * 0.07) + s.top;
  hud.display(r.name.toUpperCase(), cx, y, 18, '#ffffff', 'center', hexStr(b.accent));
  y += 18;
  hud.text(r.blurb, cx, y, 10, 'rgba(200,190,172,0.7)', 'center', 600);
  y += 20;

  const gap = Math.max(8, W * 0.014);
  const availW = W - gap * 2 - s.left - s.right;
  const cardW = (availW - gap * 3) / 4;
  const cardH = Math.min(130, H - y - 56 - s.bottom);

  r.stageIds.forEach((id, i) => {
    const def = STAGES.find((x) => x.id === id);
    const rec = save.stages[id];
    const x = gap + s.left + i * (cardW + gap);
    hud.chip(x, y, cardW, cardH, 'rgba(16,14,12,0.92)', rgba(b.accent, 0.32), 12);
    hud.text('SS' + (i + 1), x + 10, y + 15, 9, hexStr(b.accent), 'left', 900, 1.4);
    hud.text(def.name, x + 10, y + 34, Math.max(10, Math.min(14, cardW * 0.1)), '#ffffff', 'left', 800);

    // Difficulty pips from the stage tier plus the rally index.
    const diff = Math.min(6, 1 + def.tier + def.rally);
    for (let d = 0; d < 6; d++) {
      c.fillStyle = d < diff ? rgba(b.accent, 0.95) : 'rgba(255,255,255,0.14)';
      hud.roundRect(x + 10 + d * 7, y + 48, 4.5, 4.5, 2);
      c.fill();
    }

    hud.text('GOLD  ' + formatTime(def.gold), x + 10, y + 68, 9, rgba(MEDAL_COLOR.GOLD, 0.85), 'left', 700, 0.5);
    hud.text('BEST', x + 10, y + 84, 9, 'rgba(200,190,172,0.6)', 'left', 700, 0.6);
    hud.text(rec && rec.best ? formatTime(rec.best) : '--:--.--',
      x + cardW - 10, y + 84, 12, rec && rec.best ? '#ffffff' : 'rgba(180,170,155,0.5)', 'right', 800);
    if (rec && rec.medal) {
      const mc = MEDAL_COLOR[rec.medal] || 0xcccccc;
      c.fillStyle = rgba(mc, 1);
      c.beginPath(); c.arc(x + cardW - 17, y + 16, 7.5, 0, TAU); c.fill();
      hud.text(rec.medal[0], x + cardW - 17, y + 16, 9, '#12100c', 'center', 900);
    }
    if (rec && rec.ghost) {
      hud.text('GHOST LINE SAVED', x + 10, y + cardH - 30, 8, rgba(b.accent, 0.8), 'left', 800, 0.8);
    }
    hud.button('stage-pick', x + 8, y + cardH - 22, cardW - 16, 20, 'DRIVE',
      { accent: hexStr(b.accent), solid: true, size: 10, data: id, radius: 8 });
  });

  hud.button('stages-back', gap + s.left, H - 30 - s.bottom, 92, 26, 'BACK', { accent: '#8b8172', size: 10 });
}

function drawGarage() {
  const c = hud.ctx;
  hud.scrim(0.86);
  const cx = W / 2;
  const spec = CARS[garageIndex];
  const unlocked = carUnlocked(spec);
  let y = Math.max(34, H * 0.09) + hud.safe.top;

  hud.display('GARAGE', cx, y, 20, '#ffffff', 'center', accentStr());
  y += 26;

  const cardW = Math.min(430, W * 0.6), cardH = Math.min(178, H * 0.44);
  const cardX = cx - cardW / 2, cardY = y;
  hud.chip(cardX, cardY, cardW, cardH, 'rgba(16,14,12,0.92)', rgba(spec.body, unlocked ? 0.8 : 0.3), 16);

  c.fillStyle = rgba(spec.body, unlocked ? 1 : 0.35);
  hud.roundRect(cardX + 18, cardY + 16, 54, 40, 10); c.fill();
  c.fillStyle = rgba(spec.trim, unlocked ? 1 : 0.3);
  hud.roundRect(cardX + 18, cardY + 50, 54, 12, 5); c.fill();
  c.fillStyle = rgba(spec.accentTrim, unlocked ? 1 : 0.3);
  hud.roundRect(cardX + 18, cardY + 64, 54, 6, 3); c.fill();

  hud.text(spec.name, cardX + 86, cardY + 30, 18, unlocked ? '#ffffff' : 'rgba(255,255,255,0.4)', 'left', 900);
  hud.text(spec.blurb, cardX + 86, cardY + 52, 11,
    unlocked ? 'rgba(214,204,188,0.85)' : 'rgba(214,204,188,0.35)', 'left', 600);

  const stats = [['TOP SPEED', spec.topSpeed], ['ACCELERATION', spec.accel], ['GRIP', spec.grip]];
  let sy = cardY + 86;
  for (const [label, val] of stats) {
    hud.text(label, cardX + 18, sy, 9, 'rgba(200,190,172,0.8)', 'left', 700, 0.6);
    const bx = cardX + 122, bw = cardW - 142;
    const f = clamp((val - 0.9) / 0.34, 0.05, 1);
    hud.bar(bx, sy - 4, bw, 8, f, 'rgba(255,255,255,0.1)', rgba(unlocked ? spec.body : 0x5c5245, 0.95));
    sy += 25;
  }

  if (!unlocked) {
    hud.text('LOCKED  -  ' + spec.unlock + ' STAGE GOLDS  (' + goldCount() + '/' + spec.unlock + ')',
      cx, cardY + cardH - 16, 11, hexStr(MEDAL_COLOR.GOLD), 'center', 800, 0.5);
  } else if (save.car === spec.id) {
    hud.text('IN THE SERVICE PARK', cx, cardY + cardH - 16, 11, '#8fe3a8', 'center', 900, 1.2);
  }

  const by = cardY + cardH + 14;
  hud.button('garage-prev', cardX, by, 54, 38, '<', { accent: '#cbb79a', size: 16 });
  hud.button('garage-next', cardX + cardW - 54, by, 54, 38, '>', { accent: '#cbb79a', size: 16 });
  hud.button('garage-pick', cx - 78, by, 156, 38,
    unlocked ? (save.car === spec.id ? 'IN USE' : 'SELECT') : 'LOCKED',
    { accent: unlocked ? hexStr(spec.body) : '#5c5245', solid: unlocked && save.car !== spec.id, size: 13, disabled: !unlocked });
  hud.button('garage-back', cx - 60, H - 40 - hud.safe.bottom, 120, 30, 'BACK', { accent: '#8b8172', size: 11 });
  hud.text((garageIndex + 1) + ' / ' + CARS.length, cx, by + 50, 10, 'rgba(196,184,166,0.7)', 'center', 700, 1);
}

function drawStageHud(dt) {
  const c = hud.ctx;
  const s = hud.safe;
  const accentHex = accentOf();
  const accent = hexStr(accentHex);
  const pad = Math.max(14, W * 0.022);
  const def = world.def;
  const rec = save.stages[def.id];
  const path = world.layout.path;

  // --- top left: stage chip and progress ribbon
  // Race-HUD type law: nothing actionable under 11px, and the low-value
  // secondary labels (the game's own name, "STAGE CLOCK") are gone from the
  // driving frame entirely rather than shrunk to fit.
  const chipW = Math.min(230, W * 0.29);
  hud.chip(pad + s.left, pad + s.top, chipW, 38, 'rgba(12,10,8,0.74)', rgba(accentHex, 0.35), 12);
  hud.text('SS' + (def.tier + 1) + '  ' + def.name, pad + s.left + 12, pad + s.top + 19, 14, '#ffffff', 'left', 800, 0.3);
  const progress = clamp(car.nearest / (path.length - 1), 0, 1);
  hud.bar(pad + s.left, pad + s.top + 42, chipW, 5, progress, 'rgba(12,10,8,0.6)', rgba(accentHex, 0.9));

  // --- top centre: clock
  const timeW = 136;
  const tcx = W / 2 - timeW / 2;
  const danger = run.time > 75;
  hud.chip(tcx, pad + s.top, timeW, 38, 'rgba(12,10,8,0.74)',
    danger ? 'rgba(240,110,96,0.8)' : rgba(accentHex, 0.3), 11);
  hud.text(formatTime(run.time, true), tcx + timeW / 2, pad + s.top + 20, 20,
    danger ? '#ff9b8f' : accent, 'center', 900);

  // --- ghost delta chip
  const gd = ghostDelta();
  if (gd != null && !run.finished) {
    const good = gd <= 0;
    const dw = 78;
    const dx = W / 2 - dw / 2;
    const dy = pad + s.top + 42;
    hud.chip(dx, dy, dw, 22, good ? 'rgba(20,60,40,0.84)' : 'rgba(66,24,28,0.84)',
      good ? 'rgba(110,224,150,0.5)' : 'rgba(240,120,110,0.5)', 8);
    hud.text(formatDelta(gd), dx + dw / 2, dy + 11, 13, good ? '#7fe8a6' : '#ff9b8f', 'center', 900, 0.4);
  }

  // --- top right: best + surface chip, then the pause button
  const z = controlZones();
  const infoW = 116;
  const ix = z.pause.x - infoW - 8;
  hud.chip(ix, pad + s.top, infoW, 38, 'rgba(12,10,8,0.7)', 'rgba(255,255,255,0.14)', 11);
  hud.text('BEST', ix + 10, pad + s.top + 19, 11, 'rgba(214,204,188,0.85)', 'left', 800, 0.8);
  hud.text(rec && rec.best ? formatTime(rec.best) : '--:--.--', ix + infoW - 10, pad + s.top + 19,
    14, '#ffffff', 'right', 800);

  const surf = SURFACES[car.surface];
  const surfW = 104;
  hud.chip(ix + infoW - surfW, pad + s.top + 42, surfW, 22, rgba(surf.road, 0.85), rgba(surf.edge, 0.9), 7);
  hud.text(surf.name, ix + infoW - surfW / 2, pad + s.top + 53, 11,
    car.surface === 4 ? '#221c14' : '#ffffff', 'center', 900, 1);

  hud.chip(z.pause.x, z.pause.y, z.pause.w, z.pause.h, 'rgba(12,10,8,0.7)', 'rgba(255,255,255,0.16)', 10);
  c.fillStyle = 'rgba(238,230,216,0.9)';
  c.fillRect(z.pause.x + 17, z.pause.y + 12, 4, 16);
  c.fillRect(z.pause.x + 25, z.pause.y + 12, 4, 16);
  hud.zone('pause', z.pause.x, z.pause.y, z.pause.w, z.pause.h);

  // --- pace note card, left edge under the stage chip. The card carries its
  // own urgency now: hazard colour, direction arrow, grade pill and a live
  // distance countdown that flips it into an imminent state near the corner.
  if (note.text) {
    const nw = Math.min(260, Math.max(180, W * 0.32));
    hud.noteCard(pad + s.left, pad + s.top + 56, nw, 48,
      clamp(note.t / 0.22, 0, 1), note, accent, motionOn());
  }

  // --- bottom left: speed arc
  const gaugeR = Math.min(60, Math.max(42, Math.min(W, H) * 0.112));
  const gx = pad + s.left + gaugeR + 4;
  const gy = H - pad - s.bottom - gaugeR - 4;
  const A0 = Math.PI * 0.78, A1 = Math.PI * 2.22;
  const maxSpeed = def.maxSpeed * carRig.topSpeed;
  const speedFrac = clamp(car.speed / maxSpeed, 0, 1);
  hud.arc(gx, gy, gaugeR, A0, A1, speedFrac, 7, 'rgba(255,255,255,0.10)', accent, 0.86);
  hud.arcTicks(gx, gy, gaugeR - 11, A0, A1, 8, 5, 'rgba(255,255,255,0.22)', 1.5);
  // Inner arc: how sideways the car is, the drift read.
  const driftFrac = clamp(Math.abs(car.sideSpeed) / 220, 0, 1);
  hud.arc(gx, gy, gaugeR - 16, A0, A1, driftFrac, 5, 'rgba(255,255,255,0.08)',
    driftFrac > 0.55 ? '#ffd166' : 'rgba(236,228,212,0.9)');
  // The prototype's readout factor, preserved.
  hud.text(String(Math.round(car.speed * 0.72)), gx, gy - 4, Math.round(gaugeR * 0.5), '#ffffff', 'center', 900);
  hud.text('KM/H', gx, gy + Math.round(gaugeR * 0.31), 11, 'rgba(214,204,188,0.85)', 'center', 800, 1.2);

  // --- tachometer, outside the speed arc. With the throttle on autopilot the
  // rev counter is the only engine channel the player can read, so it is drawn
  // rather than left to the synth: a redline band, a lit overrun pip when the
  // brake is loading the engine, and the launch blips during the countdown.
  const tachR = gaugeR + 9;
  const REDLINE = 0.9;
  const hot = engineRpm > REDLINE;
  hud.arc(gx, gy, tachR, A0, A1, engineRpm, 4.5, 'rgba(255,255,255,0.07)',
    hot ? '#ff6f5c' : 'rgba(255,214,140,0.92)', REDLINE);
  if (engineOverrun > 0.02) {
    // Overrun pip: the engine is being driven by the wheels, not the throttle.
    hud.text('OVERRUN', gx, gy + Math.round(gaugeR * 0.31) + 15, 11,
      rgba(0xff9b8f, 0.35 + engineOverrun * 0.6), 'center', 900, 1);
  }

  // --- bottom right: pedals
  drawPedal(z.brake, 'BRAKE', 0xf06368, input.brake);
  drawPedal(z.handbrake, 'HANDBRAKE', 0xffc768, input.handbrake);
  if (driftFrac > 0.2) {
    c.save();
    c.globalAlpha = driftFrac * 0.65;
    c.strokeStyle = accent;
    c.lineWidth = 3;
    hud.roundRect(z.handbrake.x - 3, z.handbrake.y - 3, z.handbrake.w + 6, z.handbrake.h + 6, 17);
    c.stroke();
    c.restore();
    hud.text('SIDEWAYS', z.handbrake.x + z.handbrake.w / 2, z.handbrake.y - 14, 11,
      rgba(accentHex, driftFrac), 'center', 900, 1.4);
  }

  // --- reset countdown (never under the results overlay)
  if (car.resetTime > 0 && !run.finished) {
    hud.text('RESTARTING  ' + car.resetTime.toFixed(1), W / 2, H * 0.46, 18, '#ff9b8f', 'center', 900, 2);
  }

  // --- transient message banner
  if (messageTime > 0) {
    const a = clamp(messageTime, 0, 1);
    const mw = Math.min(340, W * 0.5);
    // Mid-lower centre: clear of the pace-note card, the gauge, the pedals and
    // the recce banner in every layout.
    const my = H * 0.58;
    const bg = messageKind === 'good' ? 'rgba(14,50,32,' : messageKind === 'bad' ? 'rgba(60,20,22,' : 'rgba(14,12,10,';
    c.fillStyle = bg + (a * 0.88) + ')';
    hud.roundRect(W / 2 - mw / 2, my, mw, 32, 16); c.fill();
    const fg = messageKind === 'good' ? '#8ef0b4' : messageKind === 'bad' ? '#ff9b8f' : '#ffe9b3';
    hud.text(message, W / 2, my + 16, 12, fg, 'center', 900, 0.6);
  }

  // --- off-road vignette + reset flash
  if (car.offroad > 0.02 || car.resetTime > 0) {
    hud.vignette(clamp(car.offroad * 0.4 + (car.resetTime > 0 ? 0.2 : 0), 0, 0.45),
      car.resetTime > 0 ? 'rgba(86,20,14,' : 'rgba(64,44,16,');
  }
  if (view.flash > 0) {
    c.fillStyle = 'rgba(255,240,196,' + (view.flash * 0.2) + ')';
    c.fillRect(0, 0, W, H);
  }
}

function drawPedal(r, label, color, pressed) {
  const c = hud.ctx;
  c.fillStyle = pressed ? rgba(color, 0.9) : 'rgba(12,10,8,0.7)';
  hud.roundRect(r.x, r.y, r.w, r.h, 16);
  c.fill();
  c.strokeStyle = rgba(color, pressed ? 1 : 0.7);
  c.lineWidth = 2;
  c.stroke();
  hud.text(label, r.x + r.w / 2, r.y + r.h / 2, Math.max(11, Math.min(14, r.w * 0.135)),
    pressed ? '#0d0a06' : hexStr(color), 'center', 900, 1);
}

function drawCountdown() {
  const c = hud.ctx;
  const accent = hexStr(accentOf());
  const n = Math.ceil(countdown - 0.6);
  if (countdown <= 0.6) {
    const t = clamp((0.6 - countdown) / 0.5, 0, 1);
    const scale = EASE.outBack(t);
    const alpha = 1 - clamp((0.6 - countdown - 0.35) / 0.25, 0, 1);
    c.save();
    c.globalAlpha = alpha;
    c.translate(W / 2, H * 0.4);
    c.scale(scale, scale);
    hud.text('GO', 0, 0, Math.min(84, W * 0.13), accent, 'center', 900, 8);
    c.restore();
    return;
  }
  if (n <= 0 || n > 3) return;
  const frac = 1 - ((countdown - 0.6) % 1);
  const t = clamp(frac / 0.45, 0, 1);
  const scale = EASE.outBack(t) * (1 - clamp((frac - 0.7) / 0.3, 0, 1) * 0.14);
  c.save();
  c.globalAlpha = 0.4 + 0.6 * clamp(frac / 0.3, 0, 1);
  c.translate(W / 2, H * 0.4);
  c.scale(scale, scale);
  hud.text(String(n), 0, 0, Math.min(96, W * 0.15), '#ffffff', 'center', 900);
  c.restore();
  c.save();
  c.globalAlpha = 0.5 * (1 - frac);
  c.strokeStyle = accent;
  c.lineWidth = 3;
  c.beginPath();
  c.arc(W / 2, H * 0.4, 44 + frac * 46, 0, TAU);
  c.stroke();
  c.restore();
}

function drawResult(dt) {
  const c = hud.ctx;
  const s = hud.safe;
  const t = clamp(ceremonyT / 0.5, 0, 1);
  hud.scrim(0.84 * t);
  const cx = W / 2;
  const slide = (1 - EASE.outCubic(t)) * 38;
  const def = world.def;
  const rec = save.stages[def.id];
  // Clear of the stage clock chip: the ceremony used to start high enough to
  // print its header straight through the running time.
  let y = Math.max(62, H * 0.17) + s.top - slide;

  if (run.failed) {
    hud.display('STAGE TIMEOUT', cx, y, 14, 'rgba(224,214,198,0.9)', 'center', '#ff9b8f');
    y += 34;
    hud.display('DUSTED OUT', cx, y, 26, '#ff9b8f', 'center');
    y += 30;
    hud.text('The clock won this one. Reset the line and attack it again.',
      cx, y, 11, 'rgba(206,196,178,0.8)', 'center', 600);
    y += 26;
    hud.text(formatTime(STAGE_LIMIT) + ' LIMIT', cx, y, 13, 'rgba(214,204,188,0.7)', 'center', 800, 1.4);
    y += 30;
  } else {
    const medal = run.medal;
    const mc = medal ? MEDAL_COLOR[medal] : 0xa89c8a;
    hud.display('STAGE COMPLETE', cx, y, 14, 'rgba(224,214,198,0.9)', 'center', hexStr(mc));
    y += 32;

    // The result is choreographed on one clock rather than dropped in whole:
    // the time counts up first, then the medal slams in with a burst ring, and
    // the livery unlock card arrives last on its own beat.
    const CT_TIME = 0.28, CT_MEDAL = 0.92, CT_UNLOCK = 1.6;
    const mt = clamp((ceremonyT - CT_MEDAL) / 0.42, 0, 1);
    if (mt > 0) {
      const ms = EASE.outBack(mt);
      // Burst: a ring that snaps out of the disc and fades, the impact of the
      // medal landing.
      const bt = clamp((ceremonyT - CT_MEDAL) / 0.5, 0, 1);
      if (bt < 1 && motionOn()) {
        c.save();
        c.globalAlpha = (1 - bt) * 0.75;
        c.strokeStyle = rgba(mc, 1);
        c.lineWidth = 3.5 * (1 - bt) + 1;
        c.beginPath(); c.arc(cx, y + 6, 27 + bt * 46, 0, TAU); c.stroke();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * TAU + 0.2;
          const r0 = 30 + bt * 22, r1 = r0 + 12 * (1 - bt);
          c.beginPath();
          c.moveTo(cx + Math.cos(a) * r0, y + 6 + Math.sin(a) * r0);
          c.lineTo(cx + Math.cos(a) * r1, y + 6 + Math.sin(a) * r1);
          c.stroke();
        }
        c.restore();
      }
      c.save();
      c.translate(cx, y + 6);
      c.scale(ms, ms);
      c.fillStyle = rgba(mc, 1);
      c.beginPath(); c.arc(0, 0, 27, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 2; c.stroke();
      hud.text(medal ? medal[0] : '-', 0, 1, 27, '#12100c', 'center', 900);
      c.restore();
    }
    y += 46;
    if (mt > 0.35) hud.text(medal || 'NO MEDAL', cx, y, 18, hexStr(mc), 'center', 900, 4);
    y += 27;
    // Counted time: the clock runs up to the result rather than appearing.
    const ct = clamp((ceremonyT - CT_TIME) / 0.55, 0, 1);
    const shown = motionOn() ? run.time * EASE.outQuint(ct) : run.time;
    hud.text(formatTime(shown), cx, y, 25, ct < 1 ? 'rgba(255,255,255,0.82)' : '#ffffff', 'center', 900);
    y += 23;
    const detail = 'BEST ' + formatTime(rec && rec.best) + '   -   GOLD ' + formatTime(def.gold);
    hud.text(detail, cx, y, 11, 'rgba(206,196,178,0.8)', 'center', 700, 0.4);
    y += 20;
    if (run.best) {
      // Ghost confirmation lands with the medal, not before it.
      const gt = clamp((ceremonyT - CT_MEDAL - 0.2) / 0.3, 0, 1);
      c.save();
      c.globalAlpha = gt;
      hud.text('NEW BEST LINE  -  GHOST SAVED', cx, y, 12, '#8ef0b4', 'center', 900, 1.4);
      c.restore();
      y += 18;
    } else if (run.delta) {
      hud.text(formatDelta(run.delta) + ' ON YOUR BEST', cx, y, 11, '#ffc768', 'center', 800, 1);
      y += 18;
    }
    if (run.unlocked) {
      // Unlock card: the last beat of the ceremony, a card that slides up under
      // everything else rather than one more line of text.
      const ut = clamp((ceremonyT - CT_UNLOCK) / 0.4, 0, 1);
      if (ut > 0) {
        const uw = Math.min(300, W * 0.4), uh = 34;
        const ux = cx - uw / 2;
        const uy = y - 6 + (1 - EASE.outCubic(ut)) * 18;
        c.save();
        c.globalAlpha = ut;
        hud.chip(ux, uy, uw, uh, rgba(run.unlocked.body, 0.22), rgba(run.unlocked.body, 0.9), 10);
        c.fillStyle = rgba(run.unlocked.body, 1);
        hud.roundRect(ux + 8, uy + 8, 18, uh - 16, 4); c.fill();
        hud.text('LIVERY UNLOCKED', ux + 34, uy + 12, 11, 'rgba(226,218,204,0.85)', 'left', 800, 1);
        hud.text(run.unlocked.name.toUpperCase(), ux + 34, uy + 25, 13,
          hexStr(run.unlocked.body), 'left', 900, 0.6);
        c.restore();
      }
      y += 40;
    }
  }

  // Running rally tally.
  if (rallyRun) {
    let tally = 0;
    for (let i = 0; i <= rallyRun.stageIdx; i++) tally += rallyRun.times[i] || 0;
    hud.text('RALLY SO FAR  ' + formatTime(tally) + '   OF PAR ' + formatTime(rallyRun.rally.par),
      cx, y, 10, 'rgba(196,184,166,0.75)', 'center', 700, 0.6);
    y += 18;
  }

  const bw = Math.min(148, W * 0.2), bh = 38, gap = 10;
  const by = Math.min(H - bh - 16 - s.bottom, y + 8);
  const more = rallyRun && !rallyRun.closed && !run.failed;
  const label = more ? 'NEXT STAGE' : (rallyRun && rallyRun.closed ? 'RALLY RESULT' : 'NEXT STAGE');
  const showNext = !run.failed;
  const count = showNext ? 3 : 2;
  const totalW = bw * count + gap * (count - 1);
  let bx = cx - totalW / 2;
  hud.button('result-retry', bx, by, bw, bh, 'RETRY', { accent: '#cbb79a', size: 13 });
  bx += bw + gap;
  if (showNext) {
    hud.button('result-next', bx, by, bw, bh, label,
      { accent: hexStr(accentOf()), solid: true, size: 13 });
    bx += bw + gap;
  }
  hud.button('result-quit', bx, by, bw, bh, 'THE SEASON', { accent: '#cbb79a', size: 13 });
}

function drawSummary(dt) {
  const c = hud.ctx;
  const s = hud.safe;
  const t = clamp(ceremonyT / 0.5, 0, 1);
  hud.scrim(0.9 * t);
  const cx = W / 2;
  const rally = rallyRun.rally;
  const medal = rallyRun.medal;
  const mc = MEDAL_COLOR[medal] || 0xa89c8a;
  let y = Math.max(34, H * 0.1) + s.top;

  hud.display('RALLY COMPLETE', cx, y, 14, 'rgba(224,214,198,0.9)', 'center', accentStr());
  y += 26;
  hud.text(rally.name.toUpperCase(), cx, y, 22, '#ffffff', 'center', 900, 3);
  y += 26;

  const rowH = Math.min(22, (H - y - 84 - s.bottom) / 5);
  const listW = Math.min(420, W * 0.55);
  rally.stageIds.forEach((id, i) => {
    const def = STAGES.find((x) => x.id === id);
    const time = rallyRun.times[i];
    hud.text('SS' + (i + 1) + '  ' + def.name, cx - listW / 2, y + 8, 11,
      'rgba(214,204,188,0.85)', 'left', 700);
    hud.text(formatTime(time), cx + listW / 2, y + 8, 12, '#ffffff', 'right', 800);
    y += rowH;
  });
  c.strokeStyle = 'rgba(255,255,255,0.16)';
  c.lineWidth = 1;
  c.beginPath(); c.moveTo(cx - listW / 2, y + 1); c.lineTo(cx + listW / 2, y + 1); c.stroke();
  y += 6;
  hud.text('RALLY TOTAL', cx - listW / 2, y + 10, 11, hexStr(accentOf()), 'left', 900, 1);
  hud.text(formatTime(rallyRun.total), cx + listW / 2, y + 10, 16, '#ffffff', 'right', 900);
  y += 28;

  const mt = clamp((ceremonyT - 0.2) / 0.45, 0, 1);
  if (mt > 0) {
    const ms = EASE.outBack(mt);
    c.save();
    c.translate(cx, y + 8);
    c.scale(ms, ms);
    c.fillStyle = rgba(mc, 1);
    c.beginPath(); c.arc(0, 0, 20, 0, TAU); c.fill();
    hud.text(medal[0], 0, 1, 20, '#12100c', 'center', 900);
    c.restore();
  }
  y += 32;
  hud.text(medal + ' MEDAL   -   PAR ' + formatTime(rally.par), cx, y, 12, hexStr(mc), 'center', 900, 1.6);

  const bw = Math.min(148, W * 0.2), bh = 36, gap = 10;
  const by = H - bh - 14 - s.bottom;
  const totalW = bw * 3 + gap * 2;
  let bx = cx - totalW / 2;
  hud.button('summary-again', bx, by, bw, bh, 'RUN AGAIN', { accent: '#cbb79a', size: 12 });
  bx += bw + gap;
  hud.button('summary-next', bx, by, bw, bh, 'NEXT RALLY',
    { accent: hexStr(accentOf()), solid: true, size: 12 });
  bx += bw + gap;
  hud.button('summary-menu', bx, by, bw, bh, 'THE SEASON', { accent: '#cbb79a', size: 12 });
}

function drawPause() {
  hud.scrim(0.8);
  const cx = W / 2;
  let y = H * 0.28;
  hud.text('PAUSED', cx, y, 24, '#ffffff', 'center', 900, 5);
  y += 38;
  const bw = Math.min(220, W * 0.28), bh = 40, gap = 9;
  hud.button('pause-resume', cx - bw / 2, y, bw, bh, 'RESUME',
    { accent: hexStr(accentOf()), solid: true, size: 14 });
  y += bh + gap;
  hud.button('pause-restart', cx - bw / 2, y, bw, bh, 'RESTART STAGE', { accent: '#cbb79a', size: 12 });
  y += bh + gap;
  hud.button('pause-settings', cx - bw / 2, y, bw, bh, 'SETTINGS', { accent: '#cbb79a', size: 12 });
  y += bh + gap;
  hud.button('pause-quit', cx - bw / 2, y, bw, bh, 'QUIT TO THE SEASON', { accent: '#8b8172', size: 11 });
}

function drawTutorial() {
  const c = hud.ctx;
  const step = tutorial.steps[tutorial.step];
  if (!step) return;
  const accentHex = accentOf();
  const t = clamp(tutorial.timer / 0.35, 0, 1);
  const slide = (1 - EASE.outCubic(t)) * 26;
  // The banner lives in the strip between the speed gauge and the pedals, so
  // it can never collide with the pace-note card in the top left corner.
  const z = controlZones();
  const gaugeR = Math.min(60, Math.max(42, Math.min(W, H) * 0.112));
  const leftEdge = Math.max(14, W * 0.022) + hud.safe.left + gaugeR * 2 + 16;
  const bh = 46;
  const bw = Math.max(200, Math.min(430, z.brake.x - 12 - leftEdge));
  const bx = leftEdge;
  const by = H - bh - 14 - hud.safe.bottom + slide;
  c.save();
  c.globalAlpha = t;
  c.fillStyle = 'rgba(14,12,10,0.92)';
  hud.roundRect(bx, by, bw, bh, 14); c.fill();
  c.strokeStyle = rgba(accentHex, 0.6); c.lineWidth = 1.6; c.stroke();
  hud.text('RECCE ' + (tutorial.step + 1) + ' OF ' + tutorial.steps.length,
    bx + 14, by + 14, 8, rgba(accentHex, 0.9), 'left', 900, 1.2);
  hud.text(step.text, bx + 14, by + 31, Math.max(10, Math.min(12, bw * 0.031)),
    '#ffffff', 'left', 700);
  c.restore();

  if (step.hint) {
    const pulse = 0.5 + Math.sin(performance.now() / 200) * 0.5;
    c.save();
    c.globalAlpha = 0.35 + pulse * 0.45;
    c.strokeStyle = hexStr(accentHex);
    c.lineWidth = 3;
    if (step.hint === 'handbrake') {
      hud.roundRect(z.handbrake.x - 4, z.handbrake.y - 4, z.handbrake.w + 8, z.handbrake.h + 8, 18);
      c.stroke();
    } else if (step.hint === 'brake') {
      hud.roundRect(z.brake.x - 4, z.brake.y - 4, z.brake.w + 8, z.brake.h + 8, 18);
      c.stroke();
    } else if (step.hint === 'steer') {
      const sw = W * 0.32, sh = H * 0.21;
      const sx = W * 0.06, sy = H * 0.33;
      hud.roundRect(sx, sy, sw, sh, 20);
      c.stroke();
      hud.text('DRAG HERE', sx + sw / 2, sy + sh / 2, 13, rgba(accentHex, 0.9), 'center', 900, 2);
    } else if (step.hint === 'note') {
      const nw = Math.min(250, W * 0.31);
      hud.roundRect(Math.max(14, W * 0.022) + hud.safe.left - 4,
        Math.max(14, W * 0.022) + hud.safe.top + 58, nw + 8, 52, 16);
      c.stroke();
    }
    c.restore();
  }

  // SKIP sits inside the banner on its right edge; there is no room beside it.
  hud.button('tutorial-skip', bx + bw - 72, by + bh / 2 - 12, 60, 24, 'SKIP',
    { accent: '#8b8172', size: 10, radius: 9 });
}

function startRecce() {
  tutorial.active = true; tutorial.step = 0; tutorial.timer = 0; tutorial.hold = true;
  mode = 'recce';
}

function endRecce() {
  tutorial.active = false;
  tutorial.hold = false;
  save.tutorialDone = true;
  persist();
  resetSim();
  countdown = 3.6;
  countdownStep = -1;
  mode = 'countdown';
  setMessage('RECCE DONE  -  NOW FOR THE CLOCK', 'good', 2.6);
}

function updateTutorial(dt) {
  if (!tutorial.active) return;
  tutorial.timer += dt;
  const step = tutorial.steps[tutorial.step];
  if (!step) { endRecce(); return; }
  tutorial.hold = !!step.hold;
  let satisfied = false;
  switch (step.key) {
    case 'intro': satisfied = tutorial.timer > 3.2; break;
    case 'steer': satisfied = Math.abs(input.steer) > 0.35 && tutorial.timer > 1.2; break;
    case 'brake': satisfied = input.brake && tutorial.timer > 0.8; break;
    case 'handbrake': satisfied = input.handbrake && tutorial.timer > 0.8; break;
    // A pace note is introduced BEFORE the first competitive run: the recce
    // holds the car until the co-driver has actually made a call.
    case 'note': satisfied = !!note.text && tutorial.timer > 2.4; break;
    default: satisfied = tutorial.timer > 3.6; break;
  }
  if (satisfied && tutorial.timer > 1.0) {
    tutorial.step++;
    tutorial.timer = 0;
    sfx('uitick', { volume: 0.5 });
    if (tutorial.step >= tutorial.steps.length) endRecce();
  }
}

// ------------------------------------------------------------------ loop
let lastTime = performance.now();
let acc = 0;
let musicPoll = 0;
const FIXED = 1 / 120;
const _rd = { mode: '', speed: 0, off: 0, reset: 0, dust: 0, grit: 0, streak: 0, skid: 0, tut: false, dpr: 1 };
window.__rd = _rd;

// Menu ambience: in a menu the car idles forward along the stage, so the
// backdrop is a moving 3D scene rather than a still frame. Driven from the
// render loop so nothing competes with rAF for a macrotask.
function menuDrive(dt) {
  if (!world) return;
  if (mode !== 'title' && mode !== 'rallies' && mode !== 'stages'
    && mode !== 'garage' && mode !== 'credits') return;
  const path = world.layout.path;
  const step = 62 * dt;
  const p = path[car.nearest];
  car.x += Math.cos(p.heading) * step;
  car.y += Math.sin(p.heading) * step;
  car.heading = p.heading;
  car.wheelSpin += step * WORLD_SCALE / 0.35;
  car.speed = 190;
  car.sideSpeed = Math.sin(performance.now() / 2600) * 30;
  nearestOnRoad();
  if (car.nearest >= path.length - 24) {
    const start = path[8];
    car.x = start.x; car.y = start.y; car.nearest = 8;
    }
  car.surface = path[car.nearest].surface;
}

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  if (!(dt > 0)) dt = 0;
  // A visible-frame stall is real elapsed race time. The simulation still steps
  // at the clamped rate so a hitch cannot explode the physics, but the time the
  // player was not driving is charged to the stage clock rather than forgiven:
  // otherwise a 500 ms hang handed out 450 ms of free time on a time attack.
  // Anything past STALL_MAX is treated as a suspended tab, not a stall.
  const stall = dt > STALL_GAP ? Math.min(dt, STALL_MAX) - 0.05 : 0;
  dt = Math.min(dt, 0.05);

  readInput();
  const juice = kit.juice.frame();

  // Music follows the mode, polled on a one second accumulator rather than a
  // standalone interval so nothing runs off the render loop.
  musicPoll -= dt;
  if (musicPoll <= 0) {
    musicPoll = 1.0;
    if (!kit.paused) {
      if (mode === 'stage' || mode === 'countdown') music.play('stage');
      else if (mode !== 'loading') music.play('menu');
    }
  }

  if (!kit.paused && world) {
    menuDrive(dt);
    if (mode === 'countdown') {
      const prev = countdown;
      countdown -= dt;
      const step = Math.ceil(countdown - 0.6);
      if (step !== countdownStep && step >= 1 && step <= 3) {
        countdownStep = step;
        sfx('beep', { volume: 0.6, rate: 1 + (3 - step) * 0.08 });
      }
      if (prev > 0.6 && countdown <= 0.6) {
        sfx('launch', { volume: 0.55 });
        engine.start();
      }
      if (countdown <= 0) mode = 'stage';
    } else if (mode === 'stage' || mode === 'recce') {
      // The recce steps the same fixed sim (stepSim's isRecce path drops the
      // clock/penalties). It was omitted here, which froze first runs on a
      // static screen: recce is the mandatory first-launch mode.
      // Hit-stop freezes the cosmetic clock only; the sim accumulator still
      // drains, so stage timing never drifts.
      acc += dt;
      let guard = 0;
      while (acc >= FIXED && guard++ < 8) {
        acc -= FIXED;
        stepSim(FIXED);
        if (run.finished) break;
      }
      // Charge the swallowed stall time to the clock, and let it fail the run
      // on the limit exactly as driven time would.
      if (stall > 0 && !run.finished && mode === 'stage') {
        run.time += stall;
        if (run.time >= STAGE_LIMIT) { run.time = STAGE_LIMIT; failStage(); }
      }
      if (!run.finished) {
        if (mode === 'stage') updateGhostRecord(dt);
        updateTutorial(dt);
      }
      note.t += dt;
      messageTime = Math.max(0, messageTime - dt);
      view.flash = Math.max(0, view.flash - dt * 2.2);
    } else if (mode === 'result' || mode === 'summary') {
      ceremonyT += dt;
      messageTime = Math.max(0, messageTime - dt);
      view.flash = Math.max(0, view.flash - dt * 2.2);
    }

    if (mode === 'stage' || mode === 'countdown') updateGhostPlayback();
    else ghostState.visible = false;
    const place = updateView(juice.frozen ? 0 : dt, juice.frozen);
    if (mode === 'stage' || mode === 'countdown') {
      if (!juice.frozen && !window.__noFx) updateFx(dt, place);
      updateEngineModel(dt);
      engine.update(
        1500 + engineRpm * 5600,
        input.brake ? 0.08 : (car.airborne ? 0.2 : 0.85),
        clamp(car.speed / 325, 0, 1),
        SURFACES[car.surface].grit);
    }
  }

  // The probe hook is written into one preallocated object. It used to build a
  // fresh literal on every single frame, which is the one allocation the render
  // loop had left.
  _rd.mode = mode; _rd.speed = car.speed; _rd.off = car.offroad; _rd.reset = car.resetTime;
  _rd.dust = racer ? 1 : 0;
  _rd.grit = 0; _rd.streak = 0; _rd.skid = 0;
  _rd.tut = tutorial.active; _rd.dpr = dpr;
  if (racer && !window.__noRender) racer.world.render();
  if (!window.__noHud) drawHud(dt); else hud.clear();
}

// ---------------------------------------------------------------- bootstrap
async function boot() {
  resize();
  kit.loader.show('Rally Dust');
  kit.loader.progress(0.1);

  // Warm the title backdrop with the opening stage so the menu is never a flat
  // colour field: the title screen renders a live 3D scene behind it.
  stageDef = STAGES[0];
  try {
    await buildWorld(stageDef);
    kit.loader.progress(0.6);
    resetSim();
    car.speed = 190;
    updateView(0, true);
    prewarmScene();
    kit.loader.progress(0.8);
  } catch (err) {
    // A failed boot still paints the menus; the loader is always dismissed.
  }

  // UI clicks are needed the instant the title paints. Music stays lazy until
  // the first gesture per the asset rule.
  await kit.audio.preload(['uitick', 'uiselect', 'beep', 'launch']).catch(() => {});
  kit.loader.progress(1);
  kit.loader.hide();
  mode = 'title';
  kit.registerPWA();
  requestAnimationFrame(frame);
}

window.addEventListener('keydown', (e) => {
  const c = e.code;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].indexOf(c) >= 0) e.preventDefault();
  if (kit.paused && c !== 'Escape' && c !== 'KeyP') return;
  // Every in-stage state is pausable and restartable from the keyboard, the
  // finish ceremony and the recce included: the touch pause button was already
  // live in those states, so the keyboard used to be the odd one out.
  if (c === 'Escape' || c === 'KeyP') {
    if (PAUSABLE.indexOf(mode) >= 0) {
      if (kit.paused) kit.resume('button'); else kit.pause('button');
    }
  }
  if (c === 'KeyR' && RESTARTABLE.indexOf(mode) >= 0) { kit.resume('button'); kit.restart(); }
  if (c === 'Enter') {
    if (mode === 'title') onZone({ id: 'title-start' });
    else if (mode === 'rallies') onZone({ id: 'rally-run', data: 0 });
    else if (mode === 'stages') onZone({ id: 'stage-pick', data: RALLIES[listRally].stageIds[0] });
    else if (mode === 'result') onZone({ id: 'result-next' });
    else if (mode === 'summary') onZone({ id: 'summary-next' });
  }
});

boot();
