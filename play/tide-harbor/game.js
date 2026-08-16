/* Tide Harbor - game.js
 * Open-ocean sailing trader. Orchestration layer: scene assembly, the fixed
 * simulation tick, input, HUD, and the guarded save.
 *
 * GGKit owns pause/resume/restart, the rotate overlay, visibility pause, guarded
 * saves, audio buses, the loading screen, the settings shell and the juice
 * budget. Nothing here reimplements any of that.
 *
 * POINTER LAW: every pointer claim is made on a WINDOW-level listener that is
 * registered AFTER GGKit init, and this file keeps its OWN gesture map as the
 * authority for releases, because the kit deletes its pointer entry before our
 * listener runs. While the kit is paused it feeds no pointers or keys at all,
 * so every menu button here is a plain DOM listener that works regardless.
 */
import * as THREE from 'three';
import * as bake from './bake.js';
import { createSea, sampleSea, gradeFor } from './sea.js';
import { buildVessel } from './ship.js';
import { buildIslandCluster, buildTown, buildLandmark, buildPier, buildGulls, buildBuoy } from './world.js';
import { createFX } from './fx.js';
import * as econ from './economy.js';

const {
  GOODS, PORTS, UPGRADES, RANKS, FRONTS, CAREER, STANDING, ENCOUNTERS,
  SAVE_VERSION, portById, portIndex, rankFor, freshMarkets, stepMarkets, priceAt,
  applyTrade, recordSighting, bestKnownLeg, freshFronts, stepFronts, forecast,
  frontAt, pickEncounter, freshCareer, activeContract, contractProgress,
  contractSatisfied, upgradeLevel, upgradeStats, nextUpgrade, migrateSave,
} = econ;

const TAU = Math.PI * 2;
const STEP = 1 / 60;
const WORLD = 3000;
const DAY_SECONDS = 420;

/* ------------------------------------------------------------------ dom */
const canvas = document.getElementById('scene');
const ui = {};
['gold-value', 'cargo-value', 'hold-bar', 'integrity-bar', 'rank-value', 'rank-bar',
  'wind-arrow', 'wind-readout', 'trim-meter', 'speed-readout', 'coach', 'chip',
  'port-name', 'career-line', 'trim-control', 'trim-needle', 'trim-knob',
  'pause-button', 'settings-button', 'chart-button', 'chart-panel', 'chart-body',
  'title-panel', 'dock-panel', 'dock-name', 'dock-sub', 'dock-body', 'dock-tabs',
  'encounter-panel', 'encounter-name', 'encounter-copy', 'encounter-a', 'encounter-b',
  'fade', 'clock-value'].forEach((id) => {
  ui[id.replace(/-([a-z])/g, (m, c) => c.toUpperCase())] = document.getElementById(id);
});

/* ---------------------------------------------------------------- utils */
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function damp(a, b, lambda, dt) { return lerp(a, b, 1 - Math.exp(-lambda * dt)); }
function wrapAngle(angle) {
  if (!Number.isFinite(angle)) return 0;
  return ((angle + Math.PI) % TAU + TAU) % TAU - Math.PI;
}
function dist(ax, az, bx, bz) { return Math.hypot(ax - bx, az - bz); }
function fmtGold(value) { return Math.max(0, Math.floor(value)).toLocaleString(); }
function fmtClock(tod) {
  const total = Math.floor(((tod % 1) + 1) % 1 * 1440);
  return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
}
function setText(node, value) { const s = String(value); if (node && node.textContent !== s) node.textContent = s; }
function setBar(node, fraction) { if (node) node.style.transform = 'scaleX(' + clamp(fraction, 0, 1).toFixed(3) + ')'; }

/* ---------------------------------------------------------------- state */
function freshState() {
  return {
    v: SAVE_VERSION,
    mode: 'sailing',
    gold: 260,
    bestGold: 260,
    upgrades: { hull: 0, sails: 0, hold: 0 },
    integrity: UPGRADES.hull.levels[0].integrity,
    cargo: GOODS.map(() => 0),
    markets: freshMarkets(),
    career: freshCareer(),
    rankXp: 0,
    standing: Object.fromEntries(STANDING.map((entry) => [entry.id, { progress: 0, claimed: false }])),
    port: 'lumen',
    tod: 0.34,
    tutorialStage: 0,
    victory: false,
    rng: 0x7f4a7c15,
    caches: [],
    /* live-only mirrors for the probe */
    inFront: null,
    boost: false,
  };
}
function freshVessel() {
  return {
    x: -700, z: -320, heading: 0.55, targetHeading: 0.55, trim: 0.35,
    speed: 0, heel: 0, pitch: 0, roll: 0, heave: 0, rudder: 0,
    boostTimer: 0, impactCooldown: 0, dockQuality: 0, frontClock: 0, encounterClock: 26,
  };
}

let state = freshState();
let vessel = freshVessel();
let simTime = 0;
let fronts = [];
let dockIdx = -1;
let dockTab = 'market';
let encounter = null;
let escortRun = null;
let raceRun = null;
let tradeLeg = null;

/* ------------------------------------------------------------ validation */
function validSave(save) {
  if (!save || typeof save !== 'object') return false;
  if (save.v !== SAVE_VERSION) return false;
  if (!Number.isFinite(save.gold) || save.gold < 0 || save.gold > 1e9) return false;
  if (!Array.isArray(save.cargo) || save.cargo.length !== GOODS.length) return false;
  if (save.cargo.some((n) => !Number.isFinite(n) || n < 0 || n > 200)) return false;
  if (!save.upgrades || typeof save.upgrades !== 'object') return false;
  const tracks = ['hull', 'sails', 'hold'];
  if (tracks.some((t) => !Number.isSafeInteger(save.upgrades[t]) || save.upgrades[t] < 0 || save.upgrades[t] >= UPGRADES[t].levels.length)) return false;
  if (!Number.isFinite(save.rankXp) || save.rankXp < 0 || save.rankXp > 1e8) return false;
  if (!Number.isFinite(save.integrity) || save.integrity < 0 || save.integrity > 1000) return false;
  if (!Number.isFinite(save.tod)) return false;
  if (!save.career || typeof save.career !== 'object' || !Number.isSafeInteger(save.career.index) ||
    save.career.index < 0 || save.career.index > CAREER.length) return false;
  if (!Array.isArray(save.career.visited) || !Array.isArray(save.career.cleared)) return false;
  if (save.markets != null) {
    if (!Array.isArray(save.markets) || save.markets.length !== PORTS.length) return false;
    if (save.markets.some((m) => !m || !Array.isArray(m.stock) || m.stock.length !== GOODS.length ||
      m.stock.some((n) => !Number.isFinite(n) || n < 0 || n > 400))) return false;
  }
  if (!save.vessel || !Number.isFinite(save.vessel.x) || !Number.isFinite(save.vessel.z) ||
    Math.abs(save.vessel.x) > WORLD || Math.abs(save.vessel.z) > WORLD) return false;
  return true;
}

/* GGKit validates on read; anything that fails degrades to a fresh profile. */
const kit = window.GGKit.create({
  slug: 'tide-harbor',
  orientation: 'landscape',
  validateSave(raw) {
    if (validSave(raw)) return true;
    /* Older shapes are repaired on load, not rejected here. */
    return !!raw && Number.isFinite(Number(raw.v)) && Number(raw.v) >= 1 && Number(raw.v) <= SAVE_VERSION;
  },
  onPause(reason) { if (started && reason !== 'title') showChip('PAUSED'); paintPause(); },
  onResume() { paintPause(); },
  onRestart() { resetGame(); },
});
kit.loader.show('TIDE HARBOR');
kit.loader.progress(0.06);
kit.audio.register({
  wind: './assets/wind.mp3', market: './assets/market.mp3', creak: './assets/creak.mp3',
  gulls: './assets/gulls.mp3', storm: './assets/storm.mp3', trim: './assets/trim.mp3',
  dock: './assets/dock.mp3', buy: './assets/buy.mp3', sell: './assets/sell.mp3',
  reef: './assets/reef.mp3', cache: './assets/cache.mp3', boost: './assets/boost.mp3',
  upgrade: './assets/upgrade.mp3', victory: './assets/victory.mp3',
});
const SFX_NAMES = ['trim', 'dock', 'buy', 'sell', 'reef', 'cache', 'boost', 'upgrade', 'victory', 'creak', 'gulls', 'storm'];

/* ---------------------------------------------------------- quality tier */
const qualityPrefs = { tier: 'auto' };
function detectTier() {
  if (qualityPrefs.tier !== 'auto') return qualityPrefs.tier;
  const cores = navigator.hardwareConcurrency || 4;
  const dpr = window.devicePixelRatio || 1;
  if (cores <= 2) return 'low';
  if (cores <= 4 && dpr >= 3) return 'medium';
  return 'high';
}
let tier = 'high';
let motionOverride = false;
let reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

/* ----------------------------------------------------------------- rng */
function simRandom() {
  state.rng = (Math.imul(state.rng, 1664525) + 1013904223) >>> 0;
  return state.rng / 0x100000000;
}

/* ------------------------------------------------------------- 3d scene */
let scene, camera, renderer, sea, fx, gulls;
let playerRig = null;
const rigCache = {};
let boatRoot;
let raycaster, groundPlane;
let piers = [];
let towns = [];
let landmarks = [];
let buoys = [];
let reefs = [];
let caches = [];
let traders = [];
let stormDomes = [];
let frontMarkers = [];
const cameraGoal = new THREE.Vector3();
const cameraLook = new THREE.Vector3();
let cameraDip = 0, cameraDipVel = 0, cameraRoll = 0;
let hullShock = 0, hullShockVel = 0;

const ISLANDS = {
  lumen: { r: 150, palette: { beach: 0xe4d2a4, scrub: 0x6f9a63, rock: 0x8b8570, peak: 0xcfc6ad }, flora: 'pine' },
  gale: { r: 130, palette: { beach: 0xbcb39c, scrub: 0x5c7268, rock: 0x6e6b7d, peak: 0xa9a6b6 }, flora: 'rock' },
  sunken: { r: 140, palette: { beach: 0xf0dcae, scrub: 0x4f9273, rock: 0xa8785d, peak: 0xd8c39a }, flora: 'palm' },
  bluewater: { r: 145, palette: { beach: 0xdfd3ac, scrub: 0x6ca07a, rock: 0x7f8a76, peak: 0xc4cbb2 }, flora: 'palm' },
  ember: { r: 135, palette: { beach: 0x4a4148, scrub: 0x6b4636, rock: 0x59444a, peak: 0xb56a48 }, flora: 'rock' },
  quill: { r: 120, palette: { beach: 0xd6c9a8, scrub: 0x5f7f6a, rock: 0x776f63, peak: 0xb6ad98 }, flora: 'pine' },
};
const LANDMARKS = { lumen: 'lighthouse', gale: 'wreck', sunken: 'market', bluewater: 'beacon', ember: 'beacon', quill: 'wreck' };
const REEF_FIELD = [
  [-1000, -300, 46], [-560, -560, 40], [-330, -980, 44], [40, -640, 42], [300, -900, 38],
  [260, -60, 40], [760, -320, 44], [880, 300, 42], [420, 420, 38], [980, 760, 44],
  [-520, 300, 40], [-980, 260, 42], [-560, 880, 44], [-160, 640, 38], [300, 1040, 42], [-900, 1000, 40],
];
const CACHE_FIELD = [
  [-1150, -640, 240], [-620, -880, 300], [-300, -420, 260], [120, -1040, 340], [420, -560, 280],
  [860, -80, 320], [1020, 500, 400], [400, 760, 260], [-260, 240, 300], [-1060, 40, 250],
  [-980, 820, 360], [80, 1120, 420], [640, 1040, 380], [-380, -1140, 300],
];

function initScene() {
  tier = detectTier();
  renderer = new THREE.WebGLRenderer({
    canvas,
    /* MSAA is ruinous on a software rasteriser; the dense DPR backing store
     * carries the edge quality instead. */
    antialias: false,
    powerPreference: 'high-performance',
    alpha: false,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = false;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9ed2d8);
  scene.fog = new THREE.Fog(0x9ed2d8, 380, 1850);
  camera = new THREE.PerspectiveCamera(54, 1, 0.6, 4200);
  camera.position.set(vessel.x - 90, 70, vessel.z - 90);
  camera.lookAt(vessel.x, 0, vessel.z);
  raycaster = new THREE.Raycaster();
  groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  sea = createSea(scene, { span: 2600, segments: tier === 'low' ? 72 : tier === 'medium' ? 96 : 128 });
  fx = createFX(scene, tier);
  gulls = buildGulls(tier === 'low' ? 4 : 7);
  scene.add(gulls.group);

  buildWorld();
  buildPlayer();
  resize();
}

function buildWorld() {
  const shores = [];
  PORTS.forEach((port, index) => {
    const spec = ISLANDS[port.id];
    const cluster = buildIslandCluster({
      x: port.x - Math.cos(index) * 120, z: port.z - Math.sin(index) * 120,
      radius: spec.r, palette: spec.palette, flora: spec.flora,
      seed: 11 + index * 13, scatter: tier === 'low' ? 8 : 16,
    });
    scene.add(cluster.group);
    shores.push({ x: cluster.group.position.x, z: cluster.group.position.z, r: spec.r * 1.1, fade: 120 });

    const angle = Math.atan2(port.z - cluster.group.position.z, port.x - cluster.group.position.x);
    const town = buildTown({
      seed: 41 + index * 7, radius: spec.r * 0.62, arc: 2.1, arcStart: angle - 1.05,
      count: tier === 'low' ? 7 : 12, tall: index % 2 === 0, lift: 4,
      accent: [0xf4c66d, 0xed806e, 0x62d5b7, 0x8ec9f4, 0xff9a5e, 0xc48bd8][index],
    });
    town.group.position.copy(cluster.group.position);
    scene.add(town.group);
    towns.push(town);

    const landmark = buildLandmark(LANDMARKS[port.id], 0xf4c66d);
    landmark.group.position.set(
      cluster.group.position.x - Math.cos(angle) * spec.r * 0.55,
      2, cluster.group.position.z - Math.sin(angle) * spec.r * 0.55
    );
    scene.add(landmark.group);
    landmarks.push(landmark);

    const pier = buildPier({ seed: 5 + index * 3, length: 130, width: 28 });
    pier.group.position.set(port.x, 0, port.z);
    pier.group.rotation.y = -angle;
    scene.add(pier.group);
    piers.push(pier);

    /* approach buoys mark the safe water into every port */
    for (let b = 0; b < 3; b++) {
      const t = 1.6 + b * 0.9;
      const buoy = buildBuoy(b % 2 ? 0xed806e : 0x62d5b7);
      buoy.position.set(port.x + Math.cos(angle) * 90 * t, 0, port.z + Math.sin(angle) * 90 * t);
      scene.add(buoy);
      buoys.push(buoy);
    }
  });
  sea.setShores(shores);

  const reefMaterial = new THREE.MeshStandardMaterial({
    color: 0x8c8368, map: bake.rockGrain(0xffffff, 55), roughness: 0.96, metalness: 0.02,
  });
  REEF_FIELD.forEach((entry, index) => {
    const group = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const rock = new THREE.Mesh(new THREE.ConeGeometry(entry[2] * (0.4 - i * 0.09), 16 + i * 7, 6 + i), reefMaterial);
      rock.position.set(Math.cos(i * 2.3) * entry[2] * 0.32, 3 + i * 2, Math.sin(i * 2.3) * entry[2] * 0.32);
      rock.rotation.y = i * 1.1;
      group.add(rock);
    }
    group.position.set(entry[0], 0, entry[1]);
    scene.add(group);
    reefs.push({ x: entry[0], z: entry[1], r: entry[2], group });
    void index;
  });

  const chestBody = new THREE.LatheGeometry([
    new THREE.Vector2(0, 0), new THREE.Vector2(8, 0.6), new THREE.Vector2(9, 7),
    new THREE.Vector2(7.4, 11), new THREE.Vector2(4, 13), new THREE.Vector2(0, 13.4),
  ], 10);
  const chestMaterial = bake.paintMaterial(0xc59a4e, bake.planking(0xc59a4e, 33));
  const glowMaterial = new THREE.SpriteMaterial({
    map: bake.blob('rgba(255,224,150,.95)', 'rgba(255,180,70,.35)'), transparent: true, depthWrite: false, opacity: 0.75,
  });
  CACHE_FIELD.forEach((entry, index) => {
    const group = new THREE.Group();
    const chest = new THREE.Mesh(chestBody, chestMaterial);
    group.add(chest);
    const band = new THREE.Mesh(new THREE.TorusGeometry(8.6, 0.9, 5, 12), bake.trimMaterial(0x3a4450));
    band.rotation.x = Math.PI / 2;
    band.position.y = 6;
    group.add(band);
    const glow = new THREE.Sprite(glowMaterial.clone());
    glow.scale.setScalar(44);
    glow.position.y = 8;
    group.add(glow);
    group.position.set(entry[0], 4, entry[1]);
    scene.add(group);
    caches.push({ x: entry[0], z: entry[1], amount: entry[2], collected: false, group, glow, seed: index * 1.7 });
  });

  /* AI traders working real port-to-port legs: the world has other ships in it */
  const traderCount = tier === 'low' ? 3 : 5;
  for (let i = 0; i < traderCount; i++) {
    const from = i % PORTS.length;
    const to = (i * 3 + 2) % PORTS.length;
    const rig = buildVessel({
      length: 30 + i * 3, beam: 9.5 + i * 0.8,
      hull: [0x7b4a3f, 0x35606b, 0x5f5d87, 0x4a6b4e, 0x8a5d3c][i % 5],
      deck: 0xdcc08a, sail: [0xefe3c4, 0xe4d4b0, 0xf1e8d2][i % 3],
      accent: [0xed806e, 0x62d5b7, 0xf4c66d][i % 3], seed: 200 + i * 9, tier: 1, detail: false,
    });
    scene.add(rig.group);
    traders.push({ rig, from, to, t: (i / traderCount), speed: 0.0075 + i * 0.0012, role: 'trade' });
  }

  /* one dome per weather front, re-skinned as fronts respawn */
  for (let i = 0; i < 5; i++) {
    const group = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10, 0, TAU, 0, Math.PI / 2), new THREE.MeshStandardMaterial({
      color: 0x6a7fb5, transparent: true, opacity: 0.19, roughness: 1, metalness: 0, side: THREE.DoubleSide, depthWrite: false,
    }));
    shell.scale.set(1, 0.78, 1);
    group.add(shell);
    const skirt = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 6, 30), new THREE.MeshBasicMaterial({
      color: 0x6a7fb5, transparent: true, opacity: 0.32, depthWrite: false,
    }));
    skirt.rotation.x = Math.PI / 2;
    group.add(skirt);
    /* A ragged cloud raft rather than a hard ceiling: many overlapping, softly
     * blended pancakes high enough that the camera never clips their rims. */
    for (let c = 0; c < 9; c++) {
      const cloud = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshStandardMaterial({
        color: 0x1b2740, transparent: true, opacity: 0.34, roughness: 1, depthWrite: false,
      }));
      const a = c * 2.31;
      cloud.position.set(Math.cos(a) * (0.18 + (c % 3) * 0.26), 0.66 + (c % 3) * 0.09, Math.sin(a) * (0.18 + (c % 3) * 0.26));
      cloud.scale.set(1.7 + (c % 4) * 0.4, 0.42, 1.5 + (c % 3) * 0.35);
      group.add(cloud);
    }
    scene.add(group);
    stormDomes.push({ group, shell, skirt, clouds: group.children.slice(2) });
  }

  /* everything above is static: freeze its matrices so the frame cost is zero */
  scene.updateMatrixWorld(true);
  [].concat(towns.map((t) => t.group), landmarks.map((l) => l.group)).forEach((group) => {
    group.matrixAutoUpdate = false;
  });
}

function rigFor(hullLevel, sailLevel) {
  const key = hullLevel + ':' + sailLevel;
  if (rigCache[key]) return rigCache[key];
  const TIERS = [
    { length: 32, beam: 10, hull: 0x9a4c4b, deck: 0xf0d39a, accent: 0xed806e },
    { length: 39, beam: 12, hull: 0x2f6f7c, deck: 0xf0d39a, accent: 0x62d5b7 },
    { length: 47, beam: 14.5, hull: 0x574f80, deck: 0xdcbf86, accent: 0xc48bd8 },
    { length: 56, beam: 17.5, hull: 0x1e4463, deck: 0xf3cc72, accent: 0xf4c66d },
  ];
  const SAILS = [0xefe0bc, 0xf3e6c6, 0xdfeef0, 0xe8f4ff];
  const t = TIERS[clamp(hullLevel, 0, 3)];
  const rig = buildVessel({
    length: t.length, beam: t.beam, hull: t.hull, deck: t.deck,
    sail: SAILS[clamp(sailLevel, 0, 3)], accent: t.accent, seed: 7 + hullLevel * 5, tier: hullLevel,
  });
  rigCache[key] = rig;
  boatRoot.add(rig.group);
  rig.group.visible = false;
  return rig;
}

function buildPlayer() {
  boatRoot = new THREE.Group();
  scene.add(boatRoot);
  syncPlayerRig();
}

function syncPlayerRig() {
  const next = rigFor(upgradeLevel(state, 'hull'), upgradeLevel(state, 'sails'));
  if (playerRig === next) return;
  if (playerRig) playerRig.group.visible = false;
  playerRig = next;
  playerRig.group.visible = true;
}

/* ------------------------------------------------------------------ wind */
const wind = { angle: -0.7, speed: 58, gust: 0 };

function updateWind(dt) {
  const base = -0.72 + Math.sin(simTime * 0.021) * 0.52 + Math.sin(simTime * 0.0061) * 0.26;
  let speed = 56 + Math.sin(simTime * 0.031) * 12 + Math.sin(simTime * 0.0082) * 8;
  let angle = base;
  const hit = frontAt(fronts, vessel.x, vessel.z);
  if (hit) {
    speed *= lerp(1, hit.spec.wind, hit.depth);
    angle += Math.sin(simTime * 0.9 + hit.front.seed) * 0.4 * hit.depth;
  }
  wind.gust = damp(wind.gust, Math.sin(simTime * 1.7) * 0.5 + Math.sin(simTime * 0.43) * 0.5, 2.2, dt);
  wind.speed = damp(wind.speed, speed * (1 + wind.gust * 0.07), 1.8, dt);
  wind.angle = wrapAngle(damp(wind.angle, angle, 1.4, dt));
}

/* --------------------------------------------------------------- sailing */
function stats() { return upgradeStats(state); }
function capacity() { return stats().hold.capacity; }
function cargoCount() { return state.cargo.reduce((a, b) => a + b, 0); }
function contrabandCount() { return state.cargo.reduce((total, n, i) => total + (GOODS[i].legal ? 0 : n), 0); }
function maxIntegrity() { return stats().hull.integrity; }

function sailData() {
  const s = stats();
  const rel = wrapAngle(wind.angle - vessel.heading);
  const point = Math.abs(rel);
  const noGo = s.sails.point;
  const closeReach = clamp((point - noGo) / 0.64, 0, 1);
  const broadReach = Math.sin(clamp(point, 0, Math.PI));
  const idealTrim = clamp(rel * 0.72, -1.45, 1.45);
  const trimError = Math.abs(wrapAngle(vessel.trim - idealTrim));
  const trimEff = clamp(1 - trimError / 1.55, 0, 1);
  const pointEff = point < noGo ? 0.045 + closeReach * 0.11 : 0.35 + broadReach * 0.68;
  const luff = point < noGo ? clamp(1 - point / noGo, 0, 1) : 0;
  /* Preserved from the accepted build: the same speed and heel curve shape. */
  const speed = 15 + 56 * s.sails.speed * pointEff * (0.27 + trimEff * 0.73);
  const heel = clamp((Math.sin(rel) * 0.17 + wrapAngle(vessel.trim - idealTrim) * 0.11) * (speed / 55), -0.26, 0.26);
  let mode = 'RUNNING';
  if (luff > 0.45) mode = 'LUFFING';
  else if (point < 0.92) mode = 'CLOSE REACH';
  else if (point < 2.12) mode = 'BEAM REACH';
  return { rel, point, luff, speed, heel, trimEff, mode, idealTrim };
}

function poseName() {
  if (dockIdx >= 0) return 'DOCKED';
  if (vessel.boostTimer > 0) return 'BOOST';
  if (state.inFront && (state.inFront.kind === 'squall' || state.inFront.kind === 'gale')) return 'STORM RUN';
  if (vessel.speed < 4) return 'IDLE';
  return 'SAILING';
}

function updateControls(dt) {
  let steer = 0;
  if (kit.input.keyDown('ArrowRight') || kit.input.keyDown('KeyD')) steer += 1;
  if (kit.input.keyDown('ArrowLeft') || kit.input.keyDown('KeyA')) steer -= 1;
  let trim = 0;
  if (kit.input.keyDown('ArrowUp') || kit.input.keyDown('KeyW')) trim += 1;
  if (kit.input.keyDown('ArrowDown') || kit.input.keyDown('KeyS')) trim -= 1;
  if (steer) { vessel.targetHeading = wrapAngle(vessel.targetHeading + steer * 1.22 * dt); advanceTutorial(1); }
  if (trim) { vessel.trim = clamp(vessel.trim + trim * 1.08 * dt, -1.45, 1.45); advanceTutorial(2); }
  for (const p of gestures.values()) if (p.zone === 'trim') applyTrim(p.x, p.y);
  const before = vessel.heading;
  vessel.heading = wrapAngle(damp(vessel.heading, vessel.targetHeading, 3.2, dt));
  vessel.rudder = damp(vessel.rudder, clamp(wrapAngle(vessel.targetHeading - before) * 3.4, -1, 1), 6, dt);
}

function updateSailing(dt) {
  updateControls(dt);
  const sail = sailData();
  const hit = frontAt(fronts, vessel.x, vessel.z);
  state.inFront = hit ? hit.front : null;
  const boost = hit ? lerp(1, hit.spec.boost, hit.depth) : 1;
  const laneBoost = vessel.boostTimer > 0 ? 1.28 : 1;
  const windFactor = clamp(wind.speed / 58, 0.28, 1.5);
  const target = sail.speed * windFactor * boost * laneBoost;
  vessel.speed = damp(vessel.speed, target, 3.5, dt);

  const pier = nearestPort();
  if (pier && dist(vessel.x, vessel.z, pier.x, pier.z) < 170) {
    vessel.speed = damp(vessel.speed, Math.min(vessel.speed, 30), 1.8, dt);
  }
  vessel.x = clamp(vessel.x + Math.cos(vessel.heading) * vessel.speed * dt, -WORLD / 2, WORLD / 2);
  vessel.z = clamp(vessel.z + Math.sin(vessel.heading) * vessel.speed * dt, -WORLD / 2, WORLD / 2);
  vessel.impactCooldown = Math.max(0, vessel.impactCooldown - dt);

  for (let i = 0; i < reefs.length; i++) {
    const reef = reefs[i];
    const dx = vessel.x - reef.x, dz = vessel.z - reef.z;
    const d = Math.hypot(dx, dz);
    const min = reef.r * 0.62 + 14;
    if (d >= min) continue;
    const nx = d ? dx / d : 1, nz = d ? dz / d : 0;
    vessel.x = reef.x + nx * min;
    vessel.z = reef.z + nz * min;
    const force = vessel.speed;
    vessel.speed *= 0.28;
    vessel.targetHeading = wrapAngle(Math.atan2(nz, nx) + 0.75);
    if (vessel.impactCooldown <= 0) {
      vessel.impactCooldown = 0.45;
      const damage = (5 + force * 0.22) * stats().hull.reef;
      damageHull(damage, 'REEF');
      impact(2.4, force);
      kit.audio.sfx('reef', { volume: 0.72, rate: 0.88 });
    }
  }

  /* weather damage and cargo spill */
  if (hit) {
    vessel.frontClock += dt;
    if (vessel.frontClock < dt * 1.5) enterFront(hit);
    hit.front.hitTimer -= dt;
    if (hit.front.hitTimer <= 0) {
      hit.front.hitTimer = 3.6;
      const spec = hit.spec;
      if (spec.damage > 0) damageHull(spec.damage * hit.depth, spec.name);
      if (spec.spill > 0 && cargoCount() > 0 && simRandom() < spec.spill * hit.depth) {
        const loaded = state.cargo.findIndex((n) => n > 0);
        if (loaded >= 0) {
          state.cargo[loaded]--;
          showChip('SPILL · 1 ' + GOODS[loaded].short, 'bad');
          kit.audio.sfx('creak', { volume: 0.8, rate: 0.8 });
          fx.burstSplash(vessel.x, 6, vessel.z, 1.2, GOODS[loaded].color);
        }
      }
    }
  } else vessel.frontClock = 0;

  vessel.boostTimer = Math.max(0, vessel.boostTimer - dt);
  vessel.heel = damp(vessel.heel, sail.heel, 4.4, dt);

  updateCaches();
  updateEncounterClock(dt);
  maybeDock();
}

function damageHull(amount, source) {
  if (amount <= 0) return;
  state.integrity = clamp(state.integrity - amount, 0, maxIntegrity());
  if (state.integrity <= 0) {
    state.integrity = maxIntegrity() * 0.25;
    const lost = Math.ceil(cargoCount() * 0.5);
    let removed = 0;
    for (let i = 0; i < state.cargo.length && removed < lost; i++) {
      const take = Math.min(state.cargo[i], lost - removed);
      state.cargo[i] -= take;
      removed += take;
    }
    const port = nearestPort();
    vessel.x = port.x - 150;
    vessel.z = port.z - 90;
    vessel.speed = 0;
    showChip('HULLED · TOWED IN, ' + removed + ' LOST', 'bad', 2);
    kit.audio.sfx('creak', { volume: 0.9, rate: 0.6 });
    saveGame();
  } else if (source) {
    showChip(source + ' · HULL ' + Math.round(state.integrity), 'bad');
  }
}

function impact(magnitude, force) {
  hullShockVel += magnitude * 0.8;
  cameraDipVel -= magnitude * 0.5;
  fx.burstSplash(vessel.x + Math.cos(vessel.heading) * 14, 4, vessel.z + Math.sin(vessel.heading) * 14, clamp(force / 40, 0.6, 2), 0xf2fffb);
  if (!reducedMotion) {
    kit.juice.hitStop(55);
    kit.juice.shake(Math.min(2.4, magnitude), 180);
  }
}

/* ---------------------------------------------------------------- caches */
function updateCaches() {
  for (let i = 0; i < caches.length; i++) {
    const c = caches[i];
    if (c.collected) continue;
    if (dist(vessel.x, vessel.z, c.x, c.z) > 32) continue;
    c.collected = true;
    c.group.visible = false;
    state.gold += c.amount;
    state.bestGold = Math.max(state.bestGold, state.gold);
    progressStanding('caches');
    showChip('+' + c.amount + 'G CACHE', 'good');
    kit.audio.sfx('cache', { volume: 0.55, rate: 1.1 });
    fx.burstSparkle(c.x, 6, c.z, 1.4, 0xffd27a);
  }
}

/* ------------------------------------------------------------ encounters */
function updateEncounterClock(dt) {
  if (encounter || dockIdx >= 0) return;
  vessel.encounterClock -= dt * (state.inFront ? 1.6 : 1);
  if (vessel.encounterClock > 0) return;
  vessel.encounterClock = 34 + simRandom() * 46;
  const rank = rankFor(state.rankXp);
  const key = pickEncounter(simRandom, {
    rank, cargo: cargoCount(), cargoRoom: capacity() - cargoCount(),
    contraband: contrabandCount(), inFront: !!state.inFront,
  });
  openEncounter(key);
}

function openEncounter(key) {
  const spec = ENCOUNTERS[key];
  if (!spec) return;
  encounter = { key, spec };
  setText(ui.encounterName, spec.name);
  setText(ui.encounterCopy, spec.copy);
  setText(ui.encounterA, spec.a.label);
  setText(ui.encounterB, spec.b.label);
  ui.encounterA.dataset.hint = spec.a.hint;
  ui.encounterB.dataset.hint = spec.b.hint;
  ui.encounterPanel.classList.remove('hidden');
  requestAnimationFrame(() => ui.encounterPanel.classList.add('in'));
  kit.audio.sfx('gulls', { volume: 0.45, rate: 0.9 });
  kit.pause('encounter');
}

function closeEncounter() {
  if (!encounter) return;
  encounter = null;
  ui.encounterPanel.classList.remove('in');
  setTimeout(() => ui.encounterPanel.classList.add('hidden'), 200);
  kit.resume('encounter');
}

function resolveEncounter(choice) {
  if (!encounter) return;
  const key = encounter.key;
  const speedEdge = stats().sails.speed + upgradeLevel(state, 'hull') * 0.06;
  const roll = simRandom();
  if (key === 'smuggler') {
    if (choice === 'a') {
      const toll = Math.min(state.gold, 80 + Math.floor(state.gold * 0.06));
      state.gold -= toll;
      showChip('PAID ' + toll + 'G TOLL', 'bad', 1.4);
    } else if (roll < clamp(0.34 + (speedEdge - 1) * 0.9, 0.2, 0.86)) {
      vessel.boostTimer = 4;
      state.career.lifetimeProfit += 0;
      showChip('OUTSAILED THEM', 'good', 1.4);
      kit.audio.sfx('boost', { volume: 0.6, rate: 1.1 });
      awardXp(45);
    } else {
      const stolen = Math.min(cargoCount(), 3);
      let taken = 0;
      for (let i = 0; i < state.cargo.length && taken < stolen; i++) {
        const take = Math.min(state.cargo[i], stolen - taken);
        state.cargo[i] -= take; taken += take;
      }
      damageHull(12, 'BOARDED');
      showChip('BOARDED · ' + taken + ' TAKEN', 'bad', 1.6);
    }
  } else if (key === 'patrol') {
    const contraband = contrabandCount();
    if (choice === 'a') {
      if (contraband > 0) {
        for (let i = 0; i < state.cargo.length; i++) if (!GOODS[i].legal) state.cargo[i] = 0;
        showChip('SEIZED · ' + contraband + ' TIDESILK', 'bad', 1.6);
      } else {
        awardXp(30);
        showChip('PAPERS IN ORDER', 'good', 1.4);
      }
    } else if (roll < clamp(0.30 + (speedEdge - 1) * 0.85, 0.18, 0.8)) {
      showChip('LOST THEM IN THE HAZE', 'good', 1.4);
      awardXp(70);
    } else {
      const fine = Math.min(state.gold, 220 + contraband * 90);
      state.gold -= fine;
      for (let i = 0; i < state.cargo.length; i++) if (!GOODS[i].legal) state.cargo[i] = 0;
      showChip('FINED ' + fine + 'G', 'bad', 1.6);
    }
  } else if (key === 'escort') {
    if (choice === 'a') {
      const target = Math.floor(simRandom() * PORTS.length);
      escortRun = { port: target, reward: 260 + Math.floor(simRandom() * 220), started: simTime };
      const trader = traders[0];
      if (trader) { trader.role = 'escort'; trader.t = 0; }
      showChip('ESCORT TO ' + PORTS[target].short, 'good', 1.6);
    } else showChip('SAILED ON', '', 1.2);
  } else if (key === 'derelict') {
    if (choice === 'a') {
      if (roll < 0.24) {
        damageHull(18, 'ROTTEN DECK');
      } else {
        const good = Math.floor(simRandom() * GOODS.length);
        const room = capacity() - cargoCount();
        const take = Math.min(room, 2 + Math.floor(simRandom() * 3));
        if (take > 0) {
          state.cargo[good] += take;
          showChip('SALVAGED ' + take + ' ' + GOODS[good].short, 'good', 1.6);
        } else {
          state.gold += 180;
          showChip('HOLD FULL · +180G', 'good', 1.6);
        }
        state.career.salvage++;
        awardXp(60);
        fx.burstSparkle(vessel.x, 8, vessel.z, 1.6, 0x9fe6d4);
      }
    } else showChip('LEFT HER TO THE SEA', '', 1.2);
  } else if (key === 'race') {
    if (choice === 'a') {
      const target = Math.floor(simRandom() * PORTS.length);
      raceRun = { port: target, deadline: simTime + 130, stake: 300 };
      showChip('RACE TO ' + PORTS[target].short, 'good', 1.6);
    } else showChip('WAVED HER ON', '', 1.2);
  } else if (key === 'pilot') {
    if (choice === 'a' && state.gold >= 90) {
      state.gold -= 90;
      const near = nearestPortIndex();
      const other = (near + 1 + Math.floor(simRandom() * (PORTS.length - 1))) % PORTS.length;
      recordSighting(state.markets, other, simTime);
      recordSighting(state.markets, near, simTime);
      showChip('PRICES LOGGED · ' + PORTS[other].short, 'good', 1.6);
    } else showChip('TRUSTING THE CHARTS', '', 1.2);
  }
  state.bestGold = Math.max(state.bestGold, state.gold);
  closeEncounter();
  saveGame();
  paintHud();
}

/* --------------------------------------------------------------- docking */
function nearestPortIndex() {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < PORTS.length; i++) {
    const d = dist(vessel.x, vessel.z, PORTS[i].x, PORTS[i].z);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}
function nearestPort() { return PORTS[nearestPortIndex()]; }

function dockQuality(port) {
  const dx = port.x - vessel.x, dz = port.z - vessel.z;
  const desired = Math.atan2(dz, dx);
  const alignment = (Math.cos(wrapAngle(vessel.heading - desired)) + 1) / 2;
  const distanceScore = 1 - clamp((Math.hypot(dx, dz) - 30) / 130, 0, 1);
  return clamp((1 - vessel.speed / 38) * 0.48 + alignment * 0.27 + distanceScore * 0.25, 0, 1);
}

function maybeDock() {
  const index = nearestPortIndex();
  const port = PORTS[index];
  const d = dist(vessel.x, vessel.z, port.x, port.z);
  if (d < 170 && vessel.speed < 32) {
    vessel.dockQuality = dockQuality(port);
    if (d < 58 && vessel.speed < 24) openDock(index, vessel.dockQuality);
  }
}

function tryDock() {
  if (dockIdx >= 0) { closeDock(); return; }
  const index = nearestPortIndex();
  const port = PORTS[index];
  if (dist(vessel.x, vessel.z, port.x, port.z) > 165) { showChip('NO PORT IN REACH', 'bad'); return; }
  if (vessel.speed > 40) { vessel.speed *= 0.45; showChip('EASE THE HELM', 'bad'); return; }
  openDock(index, dockQuality(port));
}

function openDock(index, quality) {
  /* Never stack the port screen on top of an open encounter. Unreachable in
   * normal play because an encounter pauses the sim, but the probe can drive
   * both, and a stacked modal is a real UI-law violation. */
  if (dockIdx >= 0 || encounter) return;
  const port = PORTS[index];
  const rank = rankFor(state.rankXp);
  if (rank < port.rank) {
    showChip(port.short + ' NEEDS ' + RANKS[port.rank].name, 'bad', 1.8);
    vessel.speed = Math.min(vessel.speed, 12);
    vessel.targetHeading = wrapAngle(vessel.targetHeading + Math.PI * 0.6);
    return;
  }
  dockIdx = index;
  state.mode = 'docked';
  state.port = port.id;
  state.inFront = null;
  vessel.speed = 0;
  vessel.frontClock = 0;
  recordSighting(state.markets, index, simTime);
  if (state.career.visited.indexOf(port.id) < 0) state.career.visited.push(port.id);
  if (quality > 0.72) {
    const bonus = 45 + Math.floor(quality * 70);
    state.gold += bonus;
    progressStanding('glides');
    showChip('CLEAN GLIDE +' + bonus + 'G', 'good', 1.4);
    fx.burstSparkle(vessel.x, 8, vessel.z, 1.3, 0x9fe6d4);
    kit.audio.sfx('dock', { volume: 0.6, rate: 1.2 });
  } else kit.audio.sfx('creak', { volume: 0.7, rate: 0.92 });
  if (escortRun && escortRun.port === index) {
    state.gold += escortRun.reward;
    state.career.escorts++;
    awardXp(120);
    showChip('ESCORT LANDED +' + escortRun.reward + 'G', 'good', 1.8);
    celebrate(2);
    escortRun = null;
    const trader = traders[0];
    if (trader) trader.role = 'trade';
  }
  if (raceRun && raceRun.port === index) {
    if (simTime <= raceRun.deadline) {
      state.gold += raceRun.stake * 2;
      awardXp(110);
      showChip('RACE WON +' + raceRun.stake * 2 + 'G', 'good', 1.8);
      celebrate(2);
    } else showChip('RACE LOST', 'bad', 1.4);
    raceRun = null;
  }
  fadeTo(() => {
    ui.dockPanel.classList.remove('hidden');
    requestAnimationFrame(() => ui.dockPanel.classList.add('in'));
    dockTab = 'market';
    renderDock(true);
  });
  kit.audio.music('market', 600);
  advanceTutorial(3);
  checkCareer();
  saveGame();
  paintHud();
}

function closeDock() {
  if (dockIdx < 0) return;
  dockIdx = -1;
  state.mode = 'sailing';
  ui.dockPanel.classList.remove('in');
  setTimeout(() => ui.dockPanel.classList.add('hidden'), 220);
  kit.audio.music('wind', 700);
  showChip('CAST OFF', '', 1);
  saveGame();
}

/* ---------------------------------------------------------------- trade */
function buy(goodIdx) {
  if (dockIdx < 0) return;
  if (cargoCount() >= capacity()) { showChip('HOLD FULL', 'bad'); return; }
  const price = priceAt(state.markets, dockIdx, goodIdx, true);
  if (state.gold < price) { showChip('NEED ' + price + 'G', 'bad'); return; }
  state.gold -= price;
  state.cargo[goodIdx]++;
  applyTrade(state.markets, dockIdx, goodIdx, 1);
  if (!tradeLeg || tradeLeg.good !== goodIdx) tradeLeg = { good: goodIdx, cost: 0, units: 0 };
  tradeLeg.cost += price;
  tradeLeg.units++;
  kit.audio.sfx('buy', { volume: 0.44, rate: 1.1 });
  advanceTutorial(4);
  renderDock(true);
  paintHud();
  saveGame();
}

function sell(goodIdx) {
  if (dockIdx < 0 || state.cargo[goodIdx] <= 0) { showChip('NO ' + GOODS[goodIdx].short, 'bad'); return; }
  const price = priceAt(state.markets, dockIdx, goodIdx, false);
  state.cargo[goodIdx]--;
  state.gold += price;
  state.bestGold = Math.max(state.bestGold, state.gold);
  applyTrade(state.markets, dockIdx, goodIdx, -1);
  progressStanding('sales');
  if (tradeLeg && tradeLeg.good === goodIdx && tradeLeg.units > 0) {
    const unitCost = tradeLeg.cost / tradeLeg.units;
    const margin = price - unitCost;
    if (margin > 0) {
      state.career.lifetimeProfit += margin;
      state.career.bestSingleTrade = Math.max(state.career.bestSingleTrade, margin * Math.min(tradeLeg.units, state.cargo[goodIdx] + 1));
    }
    tradeLeg.units--;
    tradeLeg.cost -= unitCost;
  } else {
    state.career.lifetimeProfit += price * 0.45;
  }
  const active = activeContract(state.career, rankFor(state.rankXp));
  if (active && !active.locked && active.type === 'deliver' && active.good === goodIdx && PORTS[dockIdx].id === active.port) {
    state.career.progress = Math.min(active.qty, state.career.progress + 1);
  }
  kit.audio.sfx('sell', { volume: 0.48, rate: 1.22 });
  fx.burstSparkle(vessel.x, 10, vessel.z, 0.7, 0xffd27a);
  advanceTutorial(5);
  checkCareer();
  renderDock(true);
  paintHud();
  saveGame();
}

function repair() {
  if (dockIdx < 0) return;
  const missing = maxIntegrity() - state.integrity;
  if (missing < 1) { showChip('HULL SOUND', ''); return; }
  const cost = Math.ceil(missing * 2.4);
  if (state.gold < cost) { showChip('REPAIR NEEDS ' + cost + 'G', 'bad'); return; }
  state.gold -= cost;
  state.integrity = maxIntegrity();
  kit.audio.sfx('upgrade', { volume: 0.6, rate: 1.15 });
  showChip('HULL MADE GOOD', 'good');
  renderDock(true);
  paintHud();
  saveGame();
}

function refit(track) {
  const next = nextUpgrade(state, track);
  if (!next) { showChip(UPGRADES[track].name + ' AT BEST', ''); return; }
  const rank = rankFor(state.rankXp);
  if (rank < next.rank) { showChip('NEEDS ' + RANKS[next.rank].name, 'bad', 1.6); return; }
  if (state.gold < next.cost) { showChip('NEEDS ' + next.cost + 'G', 'bad'); return; }
  state.gold -= next.cost;
  state.upgrades[track] = upgradeLevel(state, track) + 1;
  if (track === 'hull') state.integrity = maxIntegrity();
  progressStanding('upgrades');
  syncPlayerRig();
  awardXp(140);
  showChip(next.name + ' FITTED', 'good', 1.8);
  celebrate(3);
  kit.audio.sfx('upgrade', { volume: 0.78, rate: 0.72 });
  renderDock(true);
  paintHud();
  saveGame();
}

/* -------------------------------------------------------------- progress */
function awardXp(amount) {
  const before = rankFor(state.rankXp);
  state.rankXp += amount;
  const after = rankFor(state.rankXp);
  if (after > before) {
    showChip('RANK · ' + RANKS[after].name, 'good', 2.2);
    celebrate(3);
    kit.audio.sfx('victory', { volume: 0.85, rate: 1.25 });
  }
}

function progressStanding(id) {
  const entry = state.standing[id];
  const spec = STANDING.find((s) => s.id === id);
  if (!entry || !spec || entry.claimed) return;
  entry.progress = clamp(entry.progress + 1, 0, spec.target);
}

function claimStanding(id) {
  const entry = state.standing[id];
  const spec = STANDING.find((s) => s.id === id);
  if (!entry || !spec || entry.claimed || entry.progress < spec.target) return;
  entry.claimed = true;
  state.gold += spec.reward;
  awardXp(90);
  showChip(spec.name + ' +' + spec.reward + 'G', 'good', 1.8);
  celebrate(2);
  kit.audio.sfx('cache', { volume: 0.6, rate: 1.2 });
  renderDock(true);
  paintHud();
  saveGame();
}

function enterFront(hit) {
  const kind = hit.front.kind;
  state.career.fronts[kind] = (state.career.fronts[kind] || 0) + 1;
  progressStanding('fronts');
  showChip(FRONTS[kind].name + ' AHEAD', kind === 'calm' ? '' : 'bad', 1.4);
  kit.audio.sfx('storm', { volume: 0.55 });
  if (kind === 'squall' || kind === 'gale') impact(1.5, 30);
  checkCareer();
}

function checkCareer() {
  const rank = rankFor(state.rankXp);
  const active = activeContract(state.career, rank);
  if (!active || active.locked) return;
  if (!contractSatisfied(active, state.career)) return;
  state.gold += active.gold;
  state.bestGold = Math.max(state.bestGold, state.gold);
  state.career.cleared.push(active.id);
  state.career.index++;
  state.career.progress = 0;
  progressStanding('career');
  awardXp(active.xp);
  showChip(active.name + ' CLEARED +' + active.gold + 'G', 'good', 2.2);
  celebrate(4);
  kit.audio.sfx('victory', { volume: 0.9, rate: 1.4 });
  if (state.career.index >= CAREER.length && !state.victory) {
    state.victory = true;
    showChip('HARBOURMASTER · CAREER COMPLETE', 'good', 2.6);
    celebrate(6);
  }
  saveGame();
}

/** Escalating reward celebration: sparkles, embers, shake, then a light pop. */
function celebrate(level) {
  if (reducedMotion) return;
  fx.burstSparkle(vessel.x, 14, vessel.z, 0.9 + level * 0.35, 0xffd27a);
  if (level >= 2) fx.burstSparkle(vessel.x, 26, vessel.z, 0.7 + level * 0.3, 0x9fe6d4);
  if (level >= 3) fx.burstEmber(vessel.x, 18, vessel.z, level * 0.5);
  if (level >= 4) fx.strike(vessel.x, vessel.z, 5 + level);
  kit.juice.shake(Math.min(2.6, 0.6 + level * 0.35), 160 + level * 40);
}

/* -------------------------------------------------------------- tutorial */
const TUTORIAL = [
  'TAP THE WATER TO SET A COURSE',
  'DRAG THE TRIM RING FOR SPEED',
  'GLIDE SLOWLY INTO A PORT',
  'BUY LOW: WATCH THE STOCK BAR',
  'SELL HIGH AT A PORT THAT IS SHORT',
  'CHART SHOWS WEATHER AND KNOWN PRICES',
];
function advanceTutorial(stage) {
  if (state.tutorialStage >= stage) return;
  state.tutorialStage = stage;
  showCoach(TUTORIAL[clamp(stage, 0, TUTORIAL.length - 1)]);
  saveGame();
}

/* ------------------------------------------------------------ transients */
/* UI LAW: exactly one transient at a time, corner chip during play, thin top
 * strip for coaching. Nothing centre-stage except run boundaries. */
let chipQueue = [];
let chipActive = null;
let coachUntil = 0;
/* Transients run on the wall clock, not the sim clock, so a chip raised while
 * the kit is paused still expires instead of sticking on screen. */
function nowSeconds() { return performance.now() / 1000; }

function showChip(text, tone, seconds) {
  const value = String(text || '').trim();
  if (!value) return;
  if (chipActive && chipActive.text === value) { chipActive.until = nowSeconds() + (seconds || 1.2); return; }
  chipQueue = chipQueue.filter((c) => c.text !== value);
  chipQueue.push({ text: value, tone: tone || '', duration: clamp(seconds || 1.2, 0.7, 2.6) });
  if (chipQueue.length > 4) chipQueue.shift();
  pumpChip();
}
function pumpChip() {
  if (chipActive || !chipQueue.length || !ui.chip) return;
  const next = chipQueue.shift();
  setText(ui.chip, next.text);
  ui.chip.className = 'show ' + next.tone;
  chipActive = { ...next, until: nowSeconds() + next.duration };
}
function updateChip() {
  const t = nowSeconds();
  if (chipActive && t >= chipActive.until) {
    ui.chip.className = '';
    chipActive = null;
  }
  pumpChip();
  if (ui.coach && coachUntil && t >= coachUntil) {
    ui.coach.className = '';
    coachUntil = 0;
  }
}
function showCoach(text) {
  if (!ui.coach) return;
  setText(ui.coach, text);
  ui.coach.className = 'show';
  coachUntil = nowSeconds() + 4.2;
}

/** Animated screen transition. Never a hard cut. */
function fadeTo(mid) {
  if (!ui.fade) { if (mid) mid(); return; }
  ui.fade.classList.add('on');
  setTimeout(() => {
    if (mid) mid();
    ui.fade.classList.remove('on');
  }, 190);
}

/* ------------------------------------------------------------------ save */
function saveGame() {
  state.bestGold = Math.max(state.bestGold, state.gold);
  kit.save.set({
    v: SAVE_VERSION,
    gold: Math.floor(state.gold),
    bestGold: Math.floor(state.bestGold),
    upgrades: { ...state.upgrades },
    integrity: Math.round(state.integrity),
    cargo: state.cargo.map((n) => Math.floor(n)),
    markets: state.markets.map((m) => ({ stock: m.stock.map((n) => +n.toFixed(2)), shock: m.shock.map((n) => +n.toFixed(3)), seen: m.seen })),
    career: JSON.parse(JSON.stringify(state.career)),
    rankXp: Math.floor(state.rankXp),
    standing: JSON.parse(JSON.stringify(state.standing)),
    port: state.port,
    tod: +state.tod.toFixed(4),
    tutorialStage: state.tutorialStage,
    victory: !!state.victory,
    rng: state.rng,
    simTime,
    caches: caches.map((c) => c.collected),
    vessel: { x: vessel.x, z: vessel.z, heading: vessel.heading, trim: vessel.trim },
  });
}

function loadGame() {
  const raw = kit.save.get(null);
  if (!raw) return;
  let save = raw;
  if (raw.v !== SAVE_VERSION) {
    save = migrateSave(raw);
    if (!save) { showCoach('SAVE UNREADABLE · FRESH VOYAGE'); return; }
    showChip('VOYAGE MIGRATED TO v' + SAVE_VERSION, 'good', 2);
  }
  if (!validSave(save)) { showCoach('SAVE UNREADABLE · FRESH VOYAGE'); return; }
  state.gold = Math.max(0, Math.floor(save.gold));
  state.bestGold = Math.max(state.gold, Math.floor(save.bestGold || save.gold));
  state.upgrades = {
    hull: clamp(Math.floor(save.upgrades.hull), 0, 3),
    sails: clamp(Math.floor(save.upgrades.sails), 0, 3),
    hold: clamp(Math.floor(save.upgrades.hold), 0, 3),
  };
  state.integrity = clamp(Number(save.integrity) || maxIntegrity(), 1, maxIntegrity());
  state.cargo = GOODS.map((g, i) => clamp(Math.floor(Number(save.cargo[i]) || 0), 0, capacity()));
  if (Array.isArray(save.markets) && save.markets.length === PORTS.length) {
    state.markets = save.markets.map((m, i) => ({
      stock: GOODS.map((g, gi) => clamp(Number(m.stock[gi]) || 26, 3, 130)),
      shock: GOODS.map((g, gi) => clamp(Number((m.shock || [])[gi]) || 0, -0.85, 0.85)),
      seen: m.seen && Array.isArray(m.seen.buy) && m.seen.buy.length === GOODS.length ? m.seen : null,
    }));
  }
  const career = save.career;
  state.career = {
    index: clamp(Math.floor(career.index), 0, CAREER.length),
    cleared: career.cleared.filter((id) => typeof id === 'string').slice(0, CAREER.length),
    progress: clamp(Math.floor(career.progress) || 0, 0, 999),
    visited: career.visited.filter((id) => PORTS.some((p) => p.id === id)),
    lifetimeProfit: Math.max(0, Number(career.lifetimeProfit) || 0),
    bestSingleTrade: Math.max(0, Number(career.bestSingleTrade) || 0),
    escorts: Math.max(0, Math.floor(Number(career.escorts) || 0)),
    salvage: Math.max(0, Math.floor(Number(career.salvage) || 0)),
    fronts: career.fronts && typeof career.fronts === 'object' ? career.fronts : {},
  };
  state.rankXp = clamp(Number(save.rankXp) || 0, 0, 1e8);
  STANDING.forEach((spec) => {
    const entry = (save.standing || {})[spec.id];
    state.standing[spec.id] = {
      progress: entry ? clamp(Math.floor(Number(entry.progress) || 0), 0, spec.target) : 0,
      claimed: !!(entry && entry.claimed),
    };
  });
  state.port = PORTS.some((p) => p.id === save.port) ? save.port : 'lumen';
  state.tod = ((Number(save.tod) || 0.34) % 1 + 1) % 1;
  state.tutorialStage = clamp(Math.floor(Number(save.tutorialStage) || 0), 0, TUTORIAL.length);
  state.victory = save.victory === true;
  state.rng = Number.isSafeInteger(save.rng) ? save.rng >>> 0 : state.rng;
  simTime = clamp(Number(save.simTime) || 0, 0, 1e7);
  if (save.vessel) {
    vessel.x = clamp(Number(save.vessel.x) || vessel.x, -WORLD / 2, WORLD / 2);
    vessel.z = clamp(Number(save.vessel.z) || vessel.z, -WORLD / 2, WORLD / 2);
    vessel.heading = wrapAngle(Number(save.vessel.heading) || vessel.heading);
    vessel.targetHeading = vessel.heading;
    vessel.trim = clamp(Number(save.vessel.trim) || vessel.trim, -1.45, 1.45);
  }
  if (Array.isArray(save.caches)) caches.forEach((c, i) => { c.collected = !!save.caches[i]; });
  syncPlayerRig();
}

function resetGame() {
  kit.input.clearAll();
  gestures.clear();
  state = freshState();
  probe.state = state;
  vessel = freshVessel();
  simTime = 0;
  dockIdx = -1;
  encounter = null;
  escortRun = raceRun = tradeLeg = null;
  fronts = freshFronts(simRandom);
  caches.forEach((c) => { c.collected = false; c.group.visible = true; });
  ui.dockPanel.classList.remove('in');
  ui.dockPanel.classList.add('hidden');
  ui.encounterPanel.classList.remove('in');
  ui.encounterPanel.classList.add('hidden');
  if (fx) fx.clear();
  syncPlayerRig();
  showChip('FRESH TIDE', 'good', 1.6);
  showCoach(TUTORIAL[0]);
  kit.audio.music('wind', 500);
  saveGame();
  paintHud();
}

/* ------------------------------------------------------------------- HUD */
function paintPause() {
  if (!ui.pauseButton) return;
  setText(ui.pauseButton, kit.paused ? '▶' : 'Ⅱ');
  ui.pauseButton.setAttribute('aria-label', kit.paused ? 'Resume voyage' : 'Pause voyage');
}

let hudKey = '';
function paintHud() {
  const s = stats();
  const rank = rankFor(state.rankXp);
  const sail = sailData();
  setText(ui.goldValue, fmtGold(state.gold) + 'g');
  setText(ui.cargoValue, cargoCount() + '/' + capacity());
  setBar(ui.holdBar, cargoCount() / capacity());
  setBar(ui.integrityBar, state.integrity / maxIntegrity());
  ui.integrityBar.dataset.low = state.integrity / maxIntegrity() < 0.34 ? '1' : '0';
  setText(ui.rankValue, RANKS[rank].name);
  const nextRank = RANKS[rank + 1];
  setBar(ui.rankBar, nextRank ? (state.rankXp - RANKS[rank].xp) / (nextRank.xp - RANKS[rank].xp) : 1);
  ui.windArrow.style.transform = 'rotate(' + (wind.angle * 180 / Math.PI).toFixed(1) + 'deg)';
  setText(ui.windReadout, Math.round(wind.speed));
  setBar(ui.trimMeter, sail.trimEff);
  setText(ui.speedReadout, Math.round(vessel.speed) + ' kt');
  setText(ui.clockValue, fmtClock(state.tod));
  const trimAngle = vessel.trim * 180 / Math.PI;
  ui.trimNeedle.style.transform = 'rotate(' + trimAngle.toFixed(1) + 'deg)';
  ui.trimKnob.style.transform = 'rotate(' + trimAngle.toFixed(1) + 'deg) translateY(-1px)';
  const port = nearestPort();
  setText(ui.portName, port.short + (state.inFront ? ' · ' + FRONTS[state.inFront.kind].name : ''));
  const active = activeContract(state.career, rank);
  const line = active ? (active.locked ? active.name + ' · NEEDS ' + RANKS[active.rank].name : contractProgress(active, state.career).text) : 'CAREER COMPLETE';
  const key = line + '|' + rank + '|' + state.career.index;
  if (key !== hudKey) { hudKey = key; setText(ui.careerLine, line); }
  paintPause();
}

/* ------------------------------------------------------------ dock panel */
let dockKey = '';
function renderDock(force) {
  if (dockIdx < 0) return;
  const rank = rankFor(state.rankXp);
  const key = [dockTab, dockIdx, Math.floor(state.gold), state.cargo.join(','), state.upgrades.hull,
    state.upgrades.sails, state.upgrades.hold, Math.round(state.integrity), state.career.index, rank,
    Math.floor(simTime / 4)].join('|');
  if (!force && key === dockKey) return;
  dockKey = key;
  const port = PORTS[dockIdx];
  setText(ui.dockName, port.name);
  setText(ui.dockSub, port.blurb + ' Harbourmaster: ' + RANKS[rank].name + '.');
  ui.dockTabs.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === dockTab));

  let html = '';
  if (dockTab === 'market') {
    const leg = bestKnownLeg(state.markets, dockIdx);
    html += '<div class="hint">' + (leg
      ? 'Best known leg: buy ' + GOODS[leg.good].name + ' here, sell at ' + PORTS[leg.to].short + ' for about ' + Math.round(leg.margin) + 'g a unit.'
      : 'Visit more ports to learn where these goods are short.') + '</div>';
    html += '<div class="trade-head"><span>GOOD</span><span>STOCK</span><span>BUY</span><span>SELL</span></div>';
    GOODS.forEach((good, i) => {
      const buyPrice = priceAt(state.markets, dockIdx, i, true);
      const sellPrice = priceAt(state.markets, dockIdx, i, false);
      const stock = state.markets[dockIdx].stock[i];
      const glut = clamp(stock / 52, 0.04, 1);
      const locked = !good.legal && rank < 3;
      html += '<div class="trade-row' + (locked ? ' locked' : '') + '">' +
        '<div class="good"><span class="dot" style="background:#' + good.color.toString(16).padStart(6, '0') + '"></span>' +
        '<span class="gname">' + good.name + '</span><span class="gheld">hold ' + state.cargo[i] + '</span></div>' +
        '<div class="stock"><span class="stockbar"><i style="transform:scaleX(' + glut.toFixed(3) + ')"></i></span>' +
        '<em>' + (stock < 14 ? 'SHORT' : stock > 40 ? 'GLUT' : 'STEADY') + '</em></div>' +
        '<button class="mini buy" data-act="buy" data-good="' + i + '"' + (locked ? ' disabled' : '') + '>' + buyPrice + 'g</button>' +
        '<button class="mini sell" data-act="sell" data-good="' + i + '"' + (locked ? ' disabled' : '') + '>' + sellPrice + 'g</button>' +
        '</div>';
    });
    html += '<div class="hint">Every trade moves the ledger here. Buy enough and you push the price up against yourself.</div>';
  } else if (dockTab === 'yard') {
    const missing = maxIntegrity() - state.integrity;
    html += '<div class="hint">Hull ' + Math.round(state.integrity) + ' / ' + maxIntegrity() + '.</div>';
    html += '<button class="wide" data-act="repair"' + (missing < 1 ? ' disabled' : '') + '>' +
      (missing < 1 ? 'HULL SOUND' : 'REPAIR ' + Math.ceil(missing * 2.4) + 'G') + '</button>';
    ['hull', 'sails', 'hold'].forEach((track) => {
      const spec = UPGRADES[track];
      const level = upgradeLevel(state, track);
      const current = spec.levels[level];
      const next = nextUpgrade(state, track);
      const blocked = next && rank < next.rank;
      html += '<div class="card"><div class="card-head"><span>' + spec.icon + ' ' + spec.name + '</span>' +
        '<span class="pips">' + '●'.repeat(level + 1) + '○'.repeat(spec.levels.length - level - 1) + '</span></div>' +
        '<div class="card-copy">' + current.name + '. ' + current.blurb + '</div>' +
        (next
          ? '<button class="wide" data-act="refit" data-track="' + track + '"' +
            (blocked || state.gold < next.cost ? ' disabled' : '') + '>' +
            (blocked ? 'NEEDS ' + RANKS[next.rank].name : next.name + ' · ' + next.cost + 'G') + '</button>'
          : '<button class="wide" disabled>BEST FIT</button>') +
        '</div>';
    });
  } else {
    const active = activeContract(state.career, rank);
    if (active) {
      const p = contractProgress(active, state.career);
      html += '<div class="card highlight"><div class="card-head"><span>' + (state.career.index + 1) + ' / ' + CAREER.length + ' · ' + active.name + '</span>' +
        '<span class="pips">' + active.gold + 'g</span></div>' +
        '<div class="card-copy">' + active.copy + '</div>' +
        '<div class="progress"><i style="transform:scaleX(' + clamp(p.done / p.need, 0, 1).toFixed(3) + ')"></i></div>' +
        '<div class="card-copy small">' + (active.locked ? 'Sealed until ' + RANKS[active.rank].name + '.' : p.text) + '</div></div>';
    } else {
      html += '<div class="card highlight"><div class="card-head"><span>CAREER COMPLETE</span></div>' +
        '<div class="card-copy">All twenty charters cleared. The harbour is yours; keep trading for the ledger.</div></div>';
    }
    const nextRank = RANKS[rank + 1];
    html += '<div class="hint">' + RANKS[rank].name + '. ' +
      (nextRank ? Math.max(0, Math.ceil(nextRank.xp - state.rankXp)) + ' to ' + nextRank.name + ': ' + nextRank.unlock + '.' : 'Top rank held.') + '</div>';
    STANDING.forEach((spec) => {
      const entry = state.standing[spec.id];
      const done = entry.progress >= spec.target;
      html += '<div class="card' + (entry.claimed ? ' done' : '') + '"><div class="card-head"><span>' + spec.name + '</span>' +
        '<span class="pips">' + entry.progress + ' / ' + spec.target + '</span></div>' +
        '<div class="card-copy">' + spec.copy + ' Pays ' + spec.reward + 'g.</div>' +
        '<button class="wide" data-act="claim" data-id="' + spec.id + '"' + (!done || entry.claimed ? ' disabled' : '') + '>' +
        (entry.claimed ? 'CLAIMED' : done ? 'CLAIM ' + spec.reward + 'G' : 'IN PROGRESS') + '</button></div>';
    });
  }
  ui.dockBody.innerHTML = html;
  bindActions(ui.dockBody);
}

/* ----------------------------------------------------------- chart panel */
function renderChart() {
  const rank = rankFor(state.rankXp);
  let html = '<div class="chart-grid">';
  html += '<div class="chart-col"><h3>WEATHER, NEXT 60s</h3>';
  fronts.forEach((front) => {
    const spec = FRONTS[front.kind];
    const now = dist(vessel.x, vessel.z, front.x, front.z);
    const ahead = forecast(front, 60);
    const later = dist(vessel.x, vessel.z, ahead.x, ahead.z);
    const closing = later < now;
    html += '<div class="front-row"><span class="dot" style="background:#' + spec.color.toString(16).padStart(6, '0') + '"></span>' +
      '<span class="fname">' + spec.name + '</span>' +
      '<span class="fdist">' + Math.round(now) + ' → ' + Math.round(later) + '</span>' +
      '<span class="ftag ' + (closing ? 'bad' : 'good') + '">' + (closing ? 'CLOSING' : 'CLEARING') + '</span></div>';
  });
  html += '<div class="hint">Distances are in leagues from your position now and in sixty seconds. Route around a closing gale or ride a squall for the boost.</div></div>';
  html += '<div class="chart-col"><h3>KNOWN PRICES</h3>';
  PORTS.forEach((port, i) => {
    const seen = state.markets[i].seen;
    const locked = rank < port.rank;
    html += '<div class="port-row' + (locked ? ' locked' : '') + '"><span class="pname">' + port.short + '</span>';
    if (locked) html += '<span class="pnote">sealed · ' + RANKS[port.rank].name + '</span>';
    else if (!seen) html += '<span class="pnote">never called</span>';
    else {
      html += '<span class="prices">';
      GOODS.forEach((good, g) => {
        html += '<em style="color:#' + good.color.toString(16).padStart(6, '0') + '">' + good.short + ' ' + seen.sell[g] + '</em>';
      });
      html += '</span>';
    }
    html += '</div>';
  });
  html += '<div class="hint">Prices are what you saw when you last called. They drift while you are away.</div></div>';
  html += '</div>';
  ui.chartBody.innerHTML = html;
}

function toggleChart() {
  const open = ui.chartPanel.classList.contains('hidden');
  if (open) {
    renderChart();
    ui.chartPanel.classList.remove('hidden');
    requestAnimationFrame(() => ui.chartPanel.classList.add('in'));
    kit.pause('chart');
    advanceTutorial(6);
  } else {
    ui.chartPanel.classList.remove('in');
    setTimeout(() => ui.chartPanel.classList.add('hidden'), 200);
    kit.resume('chart');
  }
}

/* ----------------------------------------------------------------- input */
/* Our own gesture map. Registered on WINDOW, AFTER kit init. The kit deletes
 * its own pointer entry before our listener runs, so releases are resolved
 * against this map, never against kit.input.pointers. */
const gestures = new Map();
let started = false;

function zoneFor(event) {
  const target = event.target;
  if (target && target.closest) {
    if (target.closest('#trim-control')) return 'trim';
    if (target.closest('button, input, select, textarea, .panel, #title-panel, #chart-panel, #dock-panel, #encounter-panel')) return 'ui';
  }
  return 'canvas';
}

window.addEventListener('pointerdown', (event) => {
  const zone = zoneFor(event);
  gestures.set(event.pointerId, {
    x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY,
    downAt: performance.now(), zone,
  });
  startAudio();
  if (zone === 'trim') { applyTrim(event.clientX, event.clientY); event.preventDefault(); }
}, { passive: false });

window.addEventListener('pointermove', (event) => {
  const g = gestures.get(event.pointerId);
  if (!g) return;
  g.x = event.clientX;
  g.y = event.clientY;
  if (g.zone === 'trim') applyTrim(event.clientX, event.clientY);
}, { passive: true });

function releasePointer(event) {
  const g = gestures.get(event.pointerId);
  if (!g) return;
  gestures.delete(event.pointerId);
  if (g.zone !== 'canvas' || kit.paused || dockIdx >= 0) return;
  if (Math.hypot(event.clientX - g.startX, event.clientY - g.startY) > 18) return;
  setCourseFromScreen(event.clientX, event.clientY);
}
window.addEventListener('pointerup', releasePointer, { passive: true });
window.addEventListener('pointercancel', (event) => { gestures.delete(event.pointerId); }, { passive: true });
window.addEventListener('blur', () => gestures.clear());

let trimSfx = 0;
function applyTrim(x, y) {
  if (!ui.trimControl) return;
  const rect = ui.trimControl.getBoundingClientRect();
  const dx = x - (rect.left + rect.width / 2);
  const dy = y - (rect.top + rect.height / 2);
  if (Math.hypot(dx, dy) < 14) return;
  const before = vessel.trim;
  vessel.trim = clamp(wrapAngle(Math.atan2(dx, -dy)), -1.45, 1.45);
  if (Math.abs(vessel.trim - before) > 0.08 && trimSfx <= 0) {
    kit.audio.sfx('trim', { volume: 0.16, rate: 1 + Math.abs(vessel.trim) * 0.08 });
    trimSfx = 0.18;
  }
  advanceTutorial(2);
}

function setCourseFromScreen(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const point = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(groundPlane, point)) return;
  vessel.targetHeading = Math.atan2(point.z - vessel.z, point.x - vessel.x);
  kit.audio.sfx('trim', { volume: 0.2, rate: 1.35 });
  advanceTutorial(1);
}

/* Menu buttons are plain DOM listeners: they must work while the kit is paused. */
const ALWAYS = { begin: 1, settings: 1, 'toggle-pause': 1, chart: 1, 'close-chart': 1, 'enc-a': 1, 'enc-b': 1 };
function bindActions(root) {
  root.querySelectorAll('[data-act]').forEach((node) => {
    if (node.dataset.bound === '1') return;
    node.dataset.bound = '1';
    node.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      startAudio();
      handleAction(node.dataset.act, node.dataset);
    });
  });
}

function handleAction(act, data) {
  /* Menu and modal actions always run; live-play actions are blocked while the
   * kit is paused, EXCEPT the dock screen, which is itself a paused context. */
  const dockAction = dockIdx >= 0 && !encounter;
  if (kit.paused && !ALWAYS[act] && !dockAction) return;
  switch (act) {
    case 'begin':
      started = true;
      ui.titlePanel.classList.add('out');
      setTimeout(() => ui.titlePanel.classList.add('hidden'), 420);
      kit.resume('title');
      showCoach(TUTORIAL[clamp(state.tutorialStage, 0, TUTORIAL.length - 1)]);
      kit.audio.music('wind', 900);
      break;
    case 'settings': openSettings(); break;
    case 'toggle-pause': if (kit.paused) kit.resume('manual'); else kit.pause('manual'); paintPause(); break;
    case 'chart': case 'close-chart': toggleChart(); break;
    case 'tab': dockTab = data.tab; renderDock(true); break;
    case 'buy': buy(Number(data.good)); break;
    case 'sell': sell(Number(data.good)); break;
    case 'repair': repair(); break;
    case 'refit': refit(data.track); break;
    case 'claim': claimStanding(data.id); break;
    case 'close-dock': closeDock(); break;
    case 'enc-a': resolveEncounter('a'); break;
    case 'enc-b': resolveEncounter('b'); break;
    default: break;
  }
}

window.addEventListener('keydown', (event) => {
  if (event.target && event.target.closest && event.target.closest('button, input, select, textarea')) return;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) event.preventDefault();
  if (encounter) {
    if (event.code === 'Digit1' || event.code === 'KeyY') resolveEncounter('a');
    if (event.code === 'Digit2' || event.code === 'KeyN') resolveEncounter('b');
    return;
  }
  if (event.code === 'KeyC') { toggleChart(); return; }
  if (kit.paused && event.code !== 'Escape') return;
  if (event.code === 'KeyR') kit.restart();
  if (event.code === 'KeyE' || event.code === 'Enter' || event.code === 'Space') { startAudio(); tryDock(); }
});

let audioStarted = false;
function startAudio() {
  if (audioStarted) return;
  audioStarted = true;
  kit.audio.resume();
  if (started) kit.audio.music('wind', 900);
}

/* -------------------------------------------------------------- settings */
function settingsButton(box, label, action) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.style.cssText = 'font:inherit;font-size:16px;color:#0b0f14;background:#4fd0b6;border:0;border-radius:10px;padding:13px 18px;min-width:min(70vw,280px);min-height:46px;font-weight:700;';
  button.addEventListener('click', action);
  box.appendChild(button);
}
function settingsSlider(box, label, value, setter) {
  const wrap = document.createElement('label');
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;width:min(70vw,280px);font-size:15px;text-align:left;';
  const text = document.createElement('span');
  text.textContent = label + ': ' + Math.round(value * 100) + '%';
  const input = document.createElement('input');
  input.type = 'range'; input.min = '0'; input.max = '1'; input.step = '.05';
  input.value = String(value); input.style.width = '100%'; input.style.height = '30px';
  input.addEventListener('input', () => {
    const next = Number(input.value);
    setter(next);
    text.textContent = label + ': ' + Math.round(next * 100) + '%';
  });
  wrap.append(text, input);
  box.appendChild(wrap);
}
function openSettings() {
  kit.openSettings([(box, row) => {
    row('Reduced motion', () => reducedMotion, (v) => { reducedMotion = v; motionOverride = true; if (v) fx.clear(); });
    settingsSlider(box, 'Music volume', kit.audio.prefs.music, (v) => kit.audio.setMusicVolume(v));
    settingsSlider(box, 'SFX volume', kit.audio.prefs.sfx, (v) => kit.audio.setSfxVolume(v));
    settingsButton(box, 'RESTART VOYAGE', () => kit.restart());
    settingsButton(box, 'FULLSCREEN', () => kit.requestFullscreen());
  }]);
}

/* ----------------------------------------------------------------- probe */
const probe = {
  state,
  get debug() {
    return {
      speed: vessel.speed, heading: vessel.heading, simTime, tod: state.tod,
      rank: rankFor(state.rankXp), career: state.career.index, dock: dockIdx,
      fronts: fronts.map((f) => f.kind), encounter: encounter ? encounter.key : null,
      integrity: state.integrity, tier, dpr: renderer ? renderer.getPixelRatio() : 0,
      canvasW: canvas.width, canvasH: canvas.height,
    };
  },
  marketSnapshot() {
    return PORTS.map((p, i) => ({
      port: p.short,
      buy: GOODS.map((g, gi) => priceAt(state.markets, i, gi, true)),
      sell: GOODS.map((g, gi) => priceAt(state.markets, i, gi, false)),
    }));
  },
  triggerEvent(type) {
    if (type === 'storm' || type === 'front') {
      const f = fronts[0];
      f.kind = 'squall'; f.x = vessel.x; f.z = vessel.z; f.r = 260; f.strength = 1;
      return 'front moved onto the vessel';
    }
    if (type === 'cache') {
      const c = caches.find((entry) => !entry.collected);
      if (c) { vessel.x = c.x; vessel.z = c.z; }
      return 'teleported to cache';
    }
    if (type === 'encounter') { openEncounter(pickEncounter(simRandom, { rank: 9, cargo: cargoCount(), cargoRoom: 9, contraband: 0, inFront: false })); return 'encounter open'; }
    if (type === 'dock') {
      const p = nearestPort();
      vessel.x = p.x - 20; vessel.z = p.z - 20; vessel.speed = 0;
      openDock(nearestPortIndex(), 0.8);
      return 'docked';
    }
    if (type === 'gold') { state.gold += 5000; awardXp(900); return 'gold granted'; }
    return 'unknown event';
  },
};
window.__th = probe;

/* --------------------------------------------------------------- visuals */
const sampleA = { y: 0 };
function hullSample(x, z, energy) {
  const s = sampleSea(x, z, simTime, energy);
  sampleA.y = s.y;
  return s;
}

function updateVessel3D(dt) {
  const energy = seaEnergy();
  const s = stats();
  const L = 26 + upgradeLevel(state, 'hull') * 8;
  const B = 8 + upgradeLevel(state, 'hull') * 2.4;
  const cos = Math.cos(vessel.heading), sin = Math.sin(vessel.heading);
  /* Sample the real surface at bow, stern and both quarters, then let the hull
   * ride the wave normal rather than a fake sine bob. */
  const bow = hullSample(vessel.x + cos * L * 0.45, vessel.z + sin * L * 0.45, energy).y;
  const stern = hullSample(vessel.x - cos * L * 0.45, vessel.z - sin * L * 0.45, energy).y;
  const port = hullSample(vessel.x - sin * B * 0.5, vessel.z + cos * B * 0.5, energy).y;
  const stbd = hullSample(vessel.x + sin * B * 0.5, vessel.z - cos * B * 0.5, energy).y;
  const heave = (bow + stern + port + stbd) / 4;
  const wavePitch = Math.atan2(bow - stern, L * 0.9);
  const waveRoll = Math.atan2(port - stbd, B);

  hullShockVel += -hullShock * 260 * dt;
  hullShockVel *= Math.exp(-17 * dt);
  hullShock += hullShockVel * dt;
  if (reducedMotion) { hullShock = 0; hullShockVel = 0; }

  vessel.heave = damp(vessel.heave, heave, 9, dt);
  vessel.pitch = damp(vessel.pitch, wavePitch * (reducedMotion ? 0.25 : 1), 7, dt);
  vessel.roll = damp(vessel.roll, waveRoll * (reducedMotion ? 0.25 : 0.85) + vessel.heel, 6, dt);

  boatRoot.position.set(vessel.x, vessel.heave + 1.2 + hullShock * 0.5, vessel.z);
  /* YXZ: yaw first, then roll about the (longitudinal) X axis, then pitch. */
  boatRoot.rotation.order = 'YXZ';
  boatRoot.rotation.y = -vessel.heading;
  boatRoot.rotation.x = vessel.roll;
  boatRoot.rotation.z = vessel.pitch;
  boatRoot.scale.setScalar(clamp(1 + hullShock * 0.01, 0.97, 1.03));

  const sail = sailData();
  const grade = sea.grade;
  playerRig.pose({
    time: simTime, pose: poseName(), luff: sail.luff, trim: -vessel.trim * 0.62,
    rudder: vessel.rudder, speed: vessel.speed, lampAlpha: grade.lamps, reduced: reducedMotion,
  });
  void s;
}

function seaEnergy() {
  const hit = frontAt(fronts, vessel.x, vessel.z);
  const base = 0.72 + clamp(wind.speed / 120, 0, 0.7);
  return hit ? base * lerp(1, hit.spec.wave, hit.depth) : base;
}

let wakeAcc = 0, sprayAcc = 0, foamAcc = 0;
function updateFX(dt) {
  const energy = seaEnergy();
  const heavy = !reducedMotion && vessel.speed > 6 && dockIdx < 0;
  const hullLevel = upgradeLevel(state, 'hull');
  const back = 20 + hullLevel * 5;
  wakeAcc += dt;
  if (heavy && wakeAcc > 0.04) {
    wakeAcc = 0;
    fx.wake.push(vessel.x - Math.cos(vessel.heading) * back, vessel.z - Math.sin(vessel.heading) * back, 6 + vessel.speed * 0.22 + hullLevel * 1.4);
    fx.bowWake.push(vessel.x + Math.cos(vessel.heading) * back * 0.62, vessel.z + Math.sin(vessel.heading) * back * 0.62, 3.4 + vessel.speed * 0.14);
  }
  fx.wake.update(dt, sampleSea, simTime, energy, heavy);
  fx.bowWake.update(dt, sampleSea, simTime, energy, heavy);

  if (heavy) {
    /* Spray and foam scale with speed: a drifting hull throws almost nothing,
     * a boosted one is buried in it. */
    sprayAcc += dt * clamp(vessel.speed / 4.5, 0, 18);
    while (sprayAcc > 1) {
      sprayAcc -= 1;
      fx.emitSpray(vessel.x + Math.cos(vessel.heading) * (10 + hullLevel * 3), vessel.heave + 2.5, vessel.z + Math.sin(vessel.heading) * (10 + hullLevel * 3), vessel.heading, vessel.speed, 2);
    }
    foamAcc += dt * clamp(vessel.speed / 5, 0, 14);
    while (foamAcc > 1) {
      foamAcc -= 1;
      const spread = (Math.random() - 0.5) * back;
      fx.emitFoam(
        vessel.x - Math.cos(vessel.heading) * back * 1.2 - Math.sin(vessel.heading) * spread,
        vessel.z - Math.sin(vessel.heading) * back * 1.2 + Math.cos(vessel.heading) * spread,
        vessel.heave + 0.7, 16 + vessel.speed * 0.32
      );
    }
  }

  /* rain and lightning ride the nearest wet front */
  let wet = null;
  let wetDist = Infinity;
  for (let i = 0; i < fronts.length; i++) {
    const f = fronts[i];
    if (f.kind !== 'squall' && f.kind !== 'gale') continue;
    const d = dist(vessel.x, vessel.z, f.x, f.z);
    if (d < wetDist) { wetDist = d; wet = f; }
  }
  const rainOn = !reducedMotion && wet && wetDist < wet.r + 320;
  if (rainOn !== fx.rain.active) {
    fx.rain.active = rainOn;
    if (rainOn) fx.rain.seed(vessel.x, vessel.z, 620, 300);
  }
  if (rainOn) {
    fx.rain.update(dt, vessel.x, vessel.z, 620, 300, clamp(1 - (wetDist - wet.r) / 320, 0.25, 1));
    if (simRandom() < dt * 0.34) {
      fx.strike(wet.x + (simRandom() - 0.5) * wet.r, wet.z + (simRandom() - 0.5) * wet.r, 9);
      if (!reducedMotion) kit.juice.shake(1.1, 110);
    }
  }
  fx.update(dt, reducedMotion);
  fx.setFog(sea.grade.fog, 0.35);
}

function updateWorldVisuals(dt) {
  const grade = sea.grade;
  const time = simTime;
  const energy = seaEnergy();
  /* Only animate the port that is actually on screen. Beyond the fog wall the
   * geometry is culled anyway, so its animation is pure waste. */
  const NEAR = 1200;
  for (let i = 0; i < PORTS.length; i++) {
    const near = dist(vessel.x, vessel.z, PORTS[i].x, PORTS[i].z) < NEAR;
    if (towns[i]) { towns[i].group.visible = near; if (near) towns[i].update(time, grade.lamps, reducedMotion); }
    if (landmarks[i]) { landmarks[i].group.visible = near; if (near) landmarks[i].update(time, grade.lamps, reducedMotion); }
    if (piers[i]) { piers[i].group.visible = near; if (near) piers[i].update(time, grade.lamps, reducedMotion, energy); }
  }
  gulls.update(time, vessel.x, vessel.z, reducedMotion);

  for (let i = 0; i < buoys.length; i++) {
    const b = buoys[i];
    const s = sampleSea(b.position.x, b.position.z, time, energy);
    b.position.y = s.y;
    b.rotation.z = reducedMotion ? 0 : Math.atan2(s.nx, s.ny);
    b.rotation.x = reducedMotion ? 0 : Math.atan2(s.nz, s.ny);
    b.userData.lampMaterial.emissiveIntensity = grade.lamps * (1.6 + Math.sin(time * 2 + i) * 0.5);
  }
  for (let i = 0; i < caches.length; i++) {
    const c = caches[i];
    if (c.collected) continue;
    const s = sampleSea(c.x, c.z, time, energy);
    c.group.position.y = s.y + 3 + (reducedMotion ? 0 : Math.sin(time * 2.2 + c.seed) * 1.4);
    c.group.rotation.y = time * 0.4;
    c.glow.material.opacity = 0.45 + (reducedMotion ? 0.2 : Math.sin(time * 3 + c.seed) * 0.22 + 0.22);
  }

  /* AI traders working real legs between ports */
  for (let i = 0; i < traders.length; i++) {
    const t = traders[i];
    if (t.role === 'escort' && escortRun) {
      const target = { x: vessel.x - Math.cos(vessel.heading) * 90, z: vessel.z - Math.sin(vessel.heading) * 90 };
      t.rig.group.position.x = damp(t.rig.group.position.x, target.x, 1.4, dt);
      t.rig.group.position.z = damp(t.rig.group.position.z, target.z, 1.4, dt);
      t.rig.group.rotation.y = -vessel.heading;
    } else {
      t.t += t.speed * dt;
      if (t.t >= 1) { t.t = 0; t.from = t.to; t.to = (t.to + 1 + Math.floor(Math.random() * (PORTS.length - 1))) % PORTS.length; }
      const from = PORTS[t.from], to = PORTS[t.to];
      const arc = Math.sin(t.t * Math.PI) * 180;
      const nx = -(to.z - from.z), nz = to.x - from.x;
      const nl = Math.hypot(nx, nz) || 1;
      const x = lerp(from.x, to.x, t.t) + (nx / nl) * arc;
      const z = lerp(from.z, to.z, t.t) + (nz / nl) * arc;
      const heading = Math.atan2(z - t.rig.group.position.z, x - t.rig.group.position.x);
      t.rig.group.position.x = x;
      t.rig.group.position.z = z;
      t.rig.group.rotation.y = -heading;
    }
    const s = sampleSea(t.rig.group.position.x, t.rig.group.position.z, time, energy);
    t.rig.group.position.y = s.y + 1;
    t.rig.group.rotation.z = reducedMotion ? 0 : Math.atan2(s.nx, s.ny) * 0.8;
    t.rig.group.rotation.x = reducedMotion ? 0 : Math.atan2(s.nz, s.ny) * 0.6;
    const visible = dist(vessel.x, vessel.z, t.rig.group.position.x, t.rig.group.position.z) < 1300;
    t.rig.group.visible = visible;
    if (visible) {
      t.rig.pose({
        time: time + i * 3, pose: 'SAILING', luff: 0.05, trim: 0.5,
        rudder: 0, speed: 30, lampAlpha: grade.lamps, reduced: reducedMotion,
      });
    }
  }

  /* weather-front domes */
  for (let i = 0; i < stormDomes.length; i++) {
    const dome = stormDomes[i];
    const front = fronts[i];
    if (!front) { dome.group.visible = false; continue; }
    const spec = FRONTS[front.kind];
    const far = dist(vessel.x, vessel.z, front.x, front.z) > front.r + 1500;
    dome.group.visible = !far;
    if (far) continue;
    dome.group.position.set(front.x, 2, front.z);
    dome.group.scale.setScalar(front.r);
    dome.shell.material.color.setHex(spec.color);
    dome.shell.material.opacity = (front.kind === 'fog' ? 0.28 : front.kind === 'calm' ? 0.09 : 0.19) * front.strength;
    dome.skirt.material.color.setHex(spec.color);
    dome.skirt.material.opacity = 0.3 * front.strength;
    dome.skirt.rotation.z = reducedMotion ? 0 : time * 0.18;
    for (let c = 0; c < dome.clouds.length; c++) {
      dome.clouds[c].visible = front.kind === 'squall' || front.kind === 'gale' || front.kind === 'fog';
      dome.clouds[c].material.opacity = (front.kind === 'fog' ? 0.2 : 0.34) * front.strength;
      if (!reducedMotion) dome.clouds[c].position.y = 0.66 + (c % 3) * 0.09 + Math.sin(time * 0.5 + c) * 0.035;
    }
  }
}

function updateCamera(dt) {
  cameraDipVel += -cameraDip * 250 * dt;
  cameraDipVel *= Math.exp(-19 * dt);
  cameraDip += cameraDipVel * dt;
  if (reducedMotion) { cameraDip = 0; cameraDipVel = 0; }
  /* Low chase camera: close enough that the hull reads, low enough that the
   * horizon and the swell stay in frame. */
  const scale = 1 + upgradeLevel(state, 'hull') * 0.16;
  const back = (62 + vessel.speed * 0.34) * scale;
  cameraGoal.set(
    vessel.x - Math.cos(vessel.heading) * back,
    (26 + vessel.speed * 0.14) * scale + vessel.heave * 0.7 + cameraDip,
    vessel.z - Math.sin(vessel.heading) * back
  );
  camera.position.lerp(cameraGoal, reducedMotion ? 0.2 : 0.08);
  const lookAhead = reducedMotion ? 24 : 24 + vessel.speed * 0.42;
  cameraLook.set(
    vessel.x + Math.cos(vessel.heading) * lookAhead,
    vessel.heave + 14 + cameraDip * 0.3,
    vessel.z + Math.sin(vessel.heading) * lookAhead
  );
  camera.lookAt(cameraLook);
  cameraRoll = damp(cameraRoll, reducedMotion ? 0 : -vessel.rudder * 0.06, 4, dt);
  camera.rotation.z += cameraRoll;
  camera.fov = 54 + (reducedMotion ? 0 : clamp(vessel.speed / 62, 0, 1) * 5);
  camera.updateProjectionMatrix();
}

/* ---------------------------------------------------------------- frames */
let saveClock = 0;
function stepSim(dt) {
  simTime += dt;
  state.tod = (state.tod + dt / DAY_SECONDS) % 1;
  updateWind(dt);
  stepFronts(fronts, dt, simRandom, WORLD * 0.72);
  stepMarkets(state.markets, dt, simRandom);
  trimSfx = Math.max(0, trimSfx - dt);
  if (dockIdx < 0) updateSailing(dt);
  if (raceRun && simTime > raceRun.deadline) { showChip('RACE LOST', 'bad', 1.4); raceRun = null; }
  state.boost = vessel.boostTimer > 0;
  saveClock += dt;
  if (saveClock > 9) { saveClock = 0; saveGame(); }
}

function resize() {
  const width = Math.max(320, window.innerWidth);
  const height = Math.max(240, window.innerHeight);
  /* Owner delta 2026-08-16: render at the real device pixel ratio. An iPhone is
   * a 2x or 3x panel; rendering at 1x is what reads as soft. */
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  renderer.setPixelRatio(dpr);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  if (!motionOverride) reducedMotion = systemReducedMotion();
}
function systemReducedMotion() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}
window.addEventListener('resize', resize);
window.addEventListener('beforeunload', saveGame);
window.addEventListener('pagehide', saveGame);
document.addEventListener('visibilitychange', () => { if (document.hidden && booted) saveGame(); });

let frameLast = 0;
let accumulator = 0;
let booted = false;
function frame(now) {
  if (!sea || !renderer) return; /* boot failed before the scene existed */
  if (!frameLast) frameLast = now;
  const delta = Math.min(0.12, Math.max(0, (now - frameLast) / 1000));
  frameLast = now;
  const juice = kit.juice.frame();
  if (!kit.paused && !juice.frozen) {
    accumulator += delta;
    let steps = 0;
    while (accumulator >= STEP && steps < 6) { stepSim(STEP); accumulator -= STEP; steps++; }
  } else accumulator = 0;

  const visualDt = Math.min(0.05, delta);
  sea.update(simTime, state.tod, scene);
  sea.setEnergy(seaEnergy());
  sea.setStormMix(state.inFront && (state.inFront.kind === 'squall' || state.inFront.kind === 'gale') ? 1 : 0);
  sea.follow(vessel.x, vessel.z);
  renderer.toneMappingExposure = sea.grade.exposure;
  updateVessel3D(visualDt);
  updateWorldVisuals(visualDt);
  updateFX(kit.paused ? 0 : visualDt);
  updateCamera(visualDt);
  updateChip();
  if (!kit.paused) paintHud();
  if (dockIdx >= 0) renderDock(false);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

/* ------------------------------------------------------------------ boot */
async function boot() {
  kit.loader.progress(0.1);
  initScene();
  kit.loader.progress(0.36);
  fronts = freshFronts(simRandom);
  await kit.audio.preload(SFX_NAMES);
  kit.loader.progress(0.62);
  loadGame();
  caches.forEach((c) => { c.group.visible = !c.collected; });
  kit.loader.progress(0.76);
  /* Every pool is warmed and every shader compiled before the first play frame. */
  fx.prewarm(renderer, camera);
  sea.update(0, state.tod, scene);
  renderer.compile(scene, camera);
  kit.loader.progress(0.9);
  bindActions(document);
  kit.registerPWA();
  kit.pause('title');
  booted = true;
  paintHud();
  kit.loader.progress(1);
  kit.loader.hide();
  requestAnimationFrame(frame);
}

boot().catch((error) => {
  if (window.console && console.error) console.error('tide-harbor boot', error);
  kit.loader.hide();
  booted = true;
  kit.pause('title');
  requestAnimationFrame(frame);
});
