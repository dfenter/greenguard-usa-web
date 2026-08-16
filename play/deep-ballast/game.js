/* Deep Ballast
 * Submersible exploration lane. Three.js is the only renderer. GGKit owns
 * lifecycle, pointer identity, keyboard input, persistence, audio buses and
 * the PWA shell. The simulation is fixed-step so a slow device becomes
 * slow-motion instead of silently skipping dangerous pressure time.
 */
import * as THREE from 'three';

(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const STEP = 1 / 60;
  const MAX_STEPS = 4;
  const MAX_FAUNA = 12;
  const MAX_CRATES = 8;
  const MAX_SUPPLIES = 16;
  const MAX_BEACONS = 6;
  const MAX_PINGS = 5;

  const ZONES = [
    { key: 'kelp-shelf', name: 'KELP SHELF', tint: 0x2b9b9d, accent: 0x78f0c4, fog: 0x03151d, width: 42, length: 680, redline: 760, pressure: 0.9, fauna: 2, landmark: 'KELP CATHEDRAL', shortcut: 'GREENWATER CUT', shortcutX: 12, landmarkDepth: 245, shortcutDepth: 438,
      crates: [{ d: 150, x: -10 }, { d: 298, x: 11 }, { d: 410, x: -6 }, { d: 530, x: 12 }], supplies: [{ d: 90, x: 10, type: 'air' }, { d: 214, x: -13, type: 'sonar' }, { d: 354, x: 13, type: 'air' }, { d: 494, x: -13, type: 'air' }, { d: 610, x: 10, type: 'sonar' }], beacons: [{ d: 190, x: 14 }, { d: 360, x: -14 }, { d: 520, x: 0 }], faunaTerritories: [{ d: 250, x: -11, r: 28, big: true }, { d: 500, x: 10, r: 30, big: true }] },
    { key: 'wreck-graveyard', name: 'WRECK GRAVEYARD', tint: 0x8f664f, accent: 0xffc27c, fog: 0x110c0d, width: 48, length: 1010, redline: 1040, pressure: 1.0, fauna: 4, landmark: 'THE SUNKEN HAULER', shortcut: 'RUSTED SERVICE TUNNEL', shortcutX: 14, landmarkDepth: 390, shortcutDepth: 704,
      crates: [{ d: 176, x: -14 }, { d: 328, x: 14 }, { d: 482, x: -8 }, { d: 646, x: 10 }, { d: 820, x: -12 }], supplies: [{ d: 106, x: -14, type: 'air' }, { d: 262, x: 14, type: 'air' }, { d: 420, x: -16, type: 'sonar' }, { d: 580, x: 15, type: 'air' }, { d: 742, x: -15, type: 'air' }, { d: 915, x: 14, type: 'sonar' }], beacons: [{ d: 240, x: 17 }, { d: 510, x: -17 }, { d: 780, x: 0 }, { d: 920, x: 17 }], faunaTerritories: [{ d: 310, x: 13, r: 34, big: true }, { d: 560, x: -14, r: 34, big: true }, { d: 840, x: 10, r: 34, big: true }] },
    { key: 'thermal-vent-field', name: 'THERMAL VENT FIELD', tint: 0xc35d3e, accent: 0xffd66d, fog: 0x160b12, width: 54, length: 1360, redline: 1320, pressure: 1.04, fauna: 7, landmark: 'BLACKSMOKE CHIMNEY', shortcut: 'VENTROOT PASSAGE', shortcutX: -16, landmarkDepth: 540, shortcutDepth: 930,
      crates: [{ d: 210, x: -17 }, { d: 390, x: 17 }, { d: 590, x: -11 }, { d: 775, x: 15 }, { d: 980, x: -16 }, { d: 1180, x: 8 }], supplies: [{ d: 125, x: 18, type: 'air' }, { d: 305, x: -18, type: 'air' }, { d: 470, x: 19, type: 'sonar' }, { d: 690, x: -19, type: 'air' }, { d: 870, x: 18, type: 'air' }, { d: 1080, x: -18, type: 'sonar' }, { d: 1260, x: 16, type: 'air' }], beacons: [{ d: 300, x: 19 }, { d: 620, x: -19 }, { d: 920, x: 19 }, { d: 1190, x: -15 }], faunaTerritories: [{ d: 270, x: -17, r: 38, big: true }, { d: 460, x: 18, r: 38, big: true }, { d: 690, x: -15, r: 38, big: true }, { d: 930, x: 17, r: 42, big: true }, { d: 1160, x: -11, r: 42, big: true }] },
    { key: 'abyssal-trench-floor', name: 'ABYSSAL TRENCH FLOOR', tint: 0x5969bb, accent: 0xc496ff, fog: 0x090717, width: 62, length: 1780, redline: 1600, pressure: 1.09, fauna: 10, landmark: 'THE BIOLUMINESCENT CAVERN', shortcut: 'ABYSSAL ROOT TUNNEL', shortcutX: 17, landmarkDepth: 700, shortcutDepth: 1240,
      crates: [{ d: 245, x: -20 }, { d: 450, x: 20 }, { d: 680, x: -15 }, { d: 905, x: 20 }, { d: 1140, x: -20 }, { d: 1410, x: 15 }], supplies: [{ d: 140, x: -20, type: 'air' }, { d: 360, x: 21, type: 'air' }, { d: 570, x: -21, type: 'sonar' }, { d: 820, x: 21, type: 'air' }, { d: 1040, x: -21, type: 'air' }, { d: 1300, x: 20, type: 'sonar' }, { d: 1530, x: -19, type: 'air' }], beacons: [{ d: 370, x: 21 }, { d: 760, x: -21 }, { d: 1130, x: 20 }, { d: 1490, x: -18 }], faunaTerritories: [{ d: 310, x: 20, r: 44, big: true }, { d: 560, x: -21, r: 44, big: true }, { d: 820, x: 19, r: 46, big: true }, { d: 1090, x: -18, r: 48, big: true }, { d: 1360, x: 18, r: 50, big: true }, { d: 1580, x: -10, r: 50, big: true }] }
  ];

  const DIVES = [
    { key: 'salvage', name: 'SALVAGE DIVE', zone: 0, objectiveType: 'crates', objective: 'Recover 3 crates and surface with the haul.', goal: 3, salvageGoal: 3, air: 78, maxDepth: 570, depthGoal: 500, rescue: false },
    { key: 'shelf-sweep', name: 'SHELF SWEEP', zone: 0, objectiveType: 'crates', objective: 'Clear 4 shelf crates, then use the cut to return.', goal: 4, salvageGoal: 4, air: 86, maxDepth: 630, depthGoal: 560, rescue: false },
    { key: 'survey', name: 'DEEP SURVEY', zone: 1, objectiveType: 'beacons', objective: 'Map 3 trench beacons and keep fauna off your wake.', goal: 3, salvageGoal: 2, air: 92, maxDepth: 860, depthGoal: 760, rescue: false },
    { key: 'wreck-haul', name: 'WRECK HAUL', zone: 1, objectiveType: 'crates', objective: 'Recover 4 wreck crates and surface with the haul.', goal: 4, salvageGoal: 4, air: 104, maxDepth: 930, depthGoal: 820, rescue: false },
    { key: 'rescue', name: 'RESCUE DESCENT', zone: 2, objectiveType: 'rescue', objective: 'Reach the rescue pod at max depth and return before the clock dies.', goal: 1, salvageGoal: 1, air: 112, maxDepth: 1180, depthGoal: 1080, rescue: true, timer: 108 },
    { key: 'vent-sweep', name: 'VENTLINE SWEEP', zone: 2, objectiveType: 'beacons', objective: 'Map 3 vent beacons before the thermal pressure peaks.', goal: 3, salvageGoal: 2, air: 124, maxDepth: 1240, depthGoal: 1120, rescue: false },
    { key: 'abyssal', name: 'ABYSSAL DIVE', zone: 3, objectiveType: 'rescue', objective: 'Enter the cavern, recover the black-box core, then surface.', goal: 1, salvageGoal: 3, air: 132, maxDepth: 1600, depthGoal: 1480, rescue: true, timer: 145 },
    { key: 'cavern-relay', name: 'CAVERN RELAY', zone: 3, objectiveType: 'beacons', objective: 'Map 3 abyssal beacons and survive the return climb.', goal: 3, salvageGoal: 3, air: 146, maxDepth: 1660, depthGoal: 1540, rescue: false },
    { key: 'black-current', name: 'BLACK CURRENT', zone: 3, objectiveType: 'crates', objective: 'Recover 5 black-current crates and surface alive.', goal: 5, salvageGoal: 5, air: 154, maxDepth: 1700, depthGoal: 1580, rescue: false },
    { key: 'last-light', name: 'LAST LIGHT', zone: 3, objectiveType: 'rescue', objective: 'Recover the final core below the redline and return.', goal: 1, salvageGoal: 4, air: 166, maxDepth: 1740, depthGoal: 1640, rescue: true, timer: 172 }
  ];

  const COLORS = {
    ink: 0x020814, ice: 0xd8fbff, cyan: 0x67e9f3, teal: 0x54d9ca, amber: 0xffcf76,
    red: 0xff6178, green: 0x8df5c5, steel: 0x28455a, hull: 0x183e55, violet: 0xb998ff
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function damp(a, b, lambda, dt) { return lerp(a, b, 1 - Math.exp(-lambda * dt)); }
  function safeInt(v, min, max) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v >= min && v <= max; }
  function rng32(seed) {
    let x = seed | 0;
    return function () { x = Math.imul(1664525, x) + 1013904223 | 0; return ((x >>> 0) / 4294967296); };
  }
  function zoneAt(value) {
    if (typeof value === 'number' && safeInt(value, 0, ZONES.length - 1)) return ZONES[value];
    if (typeof value === 'string') {
      for (let i = 0; i < ZONES.length; i++) if (ZONES[i].key === value || ZONES[i].name === value) return ZONES[i];
    }
    return ZONES[0];
  }
  function diveAt(value) { return DIVES[safeInt(value, 0, DIVES.length - 1) ? value : 0]; }
  function cloneDefault() { return { v: 2, salvage: 0, unlocked: 0, bestDepth: Array(DIVES.length).fill(0), medals: Array(DIVES.length).fill(0), upgrades: { air: 0, hull: 0 }, tutorialSeen: false }; }
  function validSave(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
    if ((o.v !== 1 && o.v !== 2) || !safeInt(o.salvage, 0, 999999) || !safeInt(o.unlocked, 0, DIVES.length - 1)) return false;
    if (!Array.isArray(o.bestDepth) || (o.bestDepth.length !== 4 && o.bestDepth.length !== DIVES.length) || !Array.isArray(o.medals) || (o.medals.length !== 4 && o.medals.length !== DIVES.length)) return false;
    for (let i = 0; i < o.bestDepth.length; i++) if (!safeInt(o.bestDepth[i], 0, 5000) || !safeInt(o.medals[i], 0, 3)) return false;
    if (!o.upgrades || !safeInt(o.upgrades.air, 0, 5) || !safeInt(o.upgrades.hull, 0, 5)) return false;
    if (o.tutorialSeen != null && typeof o.tutorialSeen !== 'boolean') return false;
    return true;
  }
  function migrateProfile(saved) {
    const next = cloneDefault();
    if (!validSave(saved)) return next;
    next.salvage = saved.salvage;
    next.unlocked = clamp(saved.unlocked, 0, DIVES.length - 1);
    next.upgrades.air = saved.upgrades.air;
    next.upgrades.hull = saved.upgrades.hull;
    next.tutorialSeen = saved.tutorialSeen === true;
    for (let i = 0; i < Math.min(saved.bestDepth.length, next.bestDepth.length); i++) {
      next.bestDepth[i] = saved.bestDepth[i];
      next.medals[i] = saved.medals[i];
    }
    return next;
  }

  const DEBUG_STATE = { mode: 'dock', dive: 'SALVAGE DIVE', depth: 0, air: 0, pressure: 0, salvage: 0, zone: 'kelp-shelf', zoneName: 'KELP SHELF', hull: 100, ballast: 0, trim: 0, rescueTime: 0, survey: 0, contacts: 0, forceZone: null, forceFauna: null };
  if (typeof window !== 'undefined') window.__db = { state: DEBUG_STATE };

  const kit = window.GGKit.create({
    slug: 'deep-ballast',
    orientation: 'landscape',
    validateSave: validSave,
    onPause: function () { pausedByKit = true; },
    onResume: function () { pausedByKit = false; },
    onRestart: function () { startDive(selectedDive); }
  });
  let pausedByKit = false;
  const storedProfile = kit.save.get(null);
  let profile = migrateProfile(storedProfile);
  if (!validSave(storedProfile) || storedProfile.v !== 2 || storedProfile.bestDepth.length !== DIVES.length) kit.save.set(profile);
  function persist() { kit.save.set(profile); }

  const canvas = document.getElementById('stage');
  const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
  GGKit.hiDpi.three(renderer);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.ink);
  scene.fog = new THREE.FogExp2(0x03151d, 0.012);
  scene.add(new THREE.HemisphereLight(0x1a5269, 0x01030a, 0.19));
  const trenchLight = new THREE.DirectionalLight(0x8bd9e8, 0.52);
  trenchLight.position.set(-28, 48, 22);
  scene.add(trenchLight);
  const world = new THREE.Group();
  const entities = new THREE.Group();
  const fx = new THREE.Group();
  scene.add(world, entities, fx);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 2200);
  const cameraGoal = new THREE.Vector3();
  const cameraLook = new THREE.Vector3();
  const playerRig = new THREE.Group();
  entities.add(playerRig);

  function resize() {
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  resize();

  function material(color, opacity, emissive, roughness) {
    return new THREE.MeshStandardMaterial({ color: color, flatShading: true, transparent: opacity < 1, opacity: opacity == null ? 1 : opacity, roughness: roughness == null ? 0.82 : roughness, metalness: 0.14, emissive: emissive || 0x000000, emissiveIntensity: emissive ? 0.42 : 0 });
  }
  function reveal(object, base, kind) {
    const mats = [];
    object.traverse(function (child) {
      if (child.material) {
        const list = Array.isArray(child.material) ? child.material : [child.material];
        for (let i = 0; i < list.length; i++) { list[i].transparent = true; list[i].depthWrite = false; list[i].opacity = 0; mats.push(list[i]); }
      }
    });
    const rec = { object: object, mats: mats, base: base || 1, litAt: -999, kind: kind || 'stone' };
    revealables.push(rec);
    object.userData.reveal = rec;
    return rec;
  }
  function cube(size, color, emissive) { return new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material(color, 1, emissive)); }
  function rock(scale, color) { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), material(color, 1)); m.scale.set(scale[0], scale[1], scale[2]); return m; }
  function addRock(x, y, z, scale, color) { const m = rock(scale, color); m.position.set(x, y, z); world.add(m); reveal(m, 0.72, 'rock'); return m; }
  function clearAuthoredWorld() {
    while (world.children.length) {
      const node = world.children.pop();
      node.traverse(function (child) { if (child.geometry) child.geometry.dispose(); if (child.material) { const list = Array.isArray(child.material) ? child.material : [child.material]; for (let i = 0; i < list.length; i++) list[i].dispose(); } });
    }
    revealables.length = 0;
  }

  let revealables = [];
  let fauna = [];
  let crates = [];
  let supplies = [];
  let beacons = [];
  let rescue = { active: false, recovered: false, group: null, reveal: null };
  let pings = [];
  let lastPingPosition = new THREE.Vector3();
  let lastPingAt = -999;

  function addArch(x, z, color, scale) {
    const g = new THREE.Group();
    const arch = new THREE.Mesh(new THREE.TorusGeometry(5 * scale, 0.62 * scale, 7, 18, Math.PI), material(color, 1, color));
    arch.rotation.z = Math.PI;
    arch.position.y = 0.6 * scale;
    g.add(arch);
    const left = new THREE.Mesh(new THREE.CylinderGeometry(.65 * scale, 1.1 * scale, 7 * scale, 7), material(color, 1));
    const right = left.clone();
    left.position.set(-5 * scale, -3 * scale, 0); right.position.set(5 * scale, -3 * scale, 0); g.add(left, right);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(4.05 * scale, .16 * scale, 6, 18, Math.PI), material(color, 1, color));
    inner.rotation.z = Math.PI; inner.position.y = .58 * scale; g.add(inner);
    for (let i = 0; i < 4; i++) {
      const lamp = new THREE.Mesh(new THREE.OctahedronGeometry(.32 * scale, 0), material(COLORS.ice, 1, color));
      lamp.position.set((i - 1.5) * 2.35 * scale, (i % 2 ? 1.8 : .2) * scale, -.55 * scale);
      g.add(lamp);
    }
    g.position.set(x, 0, z); world.add(g); reveal(g, 0.86, 'landmark'); return g;
  }
  function addTunnel(zone, d, x, scale) {
    const g = new THREE.Group();
    const ribs = [];
    for (let i = 0; i < 3; i++) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(6.2 * scale, .22 * scale, 7, 22, Math.PI), material(zone.accent, .88, zone.accent));
      rib.rotation.z = Math.PI; rib.position.set(0, .4 * scale, (i - 1) * 3.4 * scale); g.add(rib); ribs.push(rib);
    }
    const floor = cube([13 * scale, .32 * scale, 10 * scale], lerpColor(zone.tint, COLORS.ink, .42), zone.accent);
    floor.position.y = -6.5 * scale; g.add(floor);
    for (let side = -1; side <= 1; side += 2) {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(.1 * scale, .16 * scale, 11 * scale, 6), material(zone.accent, 1, zone.accent));
      rail.rotation.x = Math.PI / 2; rail.position.set(side * 5.5 * scale, -5.4 * scale, 0); g.add(rail);
    }
    g.position.set(x, 0, -d); world.add(g); reveal(g, .86, 'shortcut'); return g;
  }
  function addTrenchCable(zone, d, side, seed) {
    const r = rng32(seed);
    const x = side * (zone.width * .5 - 1.2);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x, -8.7, -d - 9),
      new THREE.Vector3(x + side * (r() * 2.5 - 1.25), -5.5 + r() * 2, -d - 3),
      new THREE.Vector3(x - side * (r() * 2.5 - 1.25), -7 + r() * 2, -d + 5),
      new THREE.Vector3(x + side * (r() * 1.5 - .75), -9, -d + 12)
    ]);
    const cable = new THREE.Mesh(new THREE.TubeGeometry(curve, 9, .12, 5, false), material(zone.accent, .72, zone.accent));
    world.add(cable); reveal(cable, .58, 'cable');
  }
  function addKelp(zone, d, side, seed) {
    const r = rng32(seed);
    const x = side * (zone.width * .5 - 3 - r() * 4);
    const g = new THREE.Group();
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(.18, .3, 8 + r() * 5, 6), material(zone.accent, 1, zone.accent));
    stalk.position.y = -1 + r() * 3;
    g.add(stalk);
    for (let i = 0; i < 3; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(.7 + r() * .35, 3.2, 5), material(zone.accent, 1, zone.accent));
      leaf.position.set((r() - .5) * 1.8, 1 + i * 2.2, (r() - .5) * 1.2); leaf.rotation.z = (r() - .5) * .65; g.add(leaf);
    }
    g.position.set(x, 0, -d); world.add(g); reveal(g, .54, 'kelp');
  }
  function addWreck(zone, d, x, scale) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(2.7 * scale, 11 * scale, 5, 10), material(0x6b4239, 1, 0x1c0c0a));
    body.rotation.x = Math.PI / 2; body.rotation.z = .15; g.add(body);
    const deck = cube([3.2 * scale, 1.7 * scale, 5 * scale], 0x8d6046, 0x25120c); deck.position.set(-1 * scale, 2.2 * scale, 0); g.add(deck);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(.16 * scale, .22 * scale, 7 * scale, 6), material(0xc28c63)); mast.position.set(-1.2 * scale, 5 * scale, 0); g.add(mast);
    g.position.set(x, -3, -d); g.rotation.z = -.15; world.add(g); reveal(g, .9, 'wreck');
  }
  function addVent(zone, d, x, scale) {
    const g = new THREE.Group();
    const chimney = new THREE.Mesh(new THREE.CylinderGeometry(1.4 * scale, 2.1 * scale, 10 * scale, 7), material(0x623f49, 1, 0x32151e)); chimney.position.y = 1; g.add(chimney);
    const cap = new THREE.Mesh(new THREE.TorusGeometry(1.6 * scale, .42 * scale, 6, 12), material(zone.accent, 1, zone.accent)); cap.rotation.x = Math.PI / 2; cap.position.y = 6.3 * scale; g.add(cap);
    for (let i = 0; i < 4; i++) { const ember = new THREE.Mesh(new THREE.IcosahedronGeometry(.35 * scale, 1), material(zone.accent, 1, zone.accent)); ember.position.set((i - 1.5) * .8 * scale, 7 + i * 1.9 * scale, (i % 2 ? .6 : -.6) * scale); g.add(ember); }
    g.position.set(x, -4, -d); world.add(g); reveal(g, .95, 'vent');
  }
  function addCavern(zone, d) {
    const g = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.TorusGeometry(10, 1.2, 8, 26, Math.PI), material(0x4a3c85, 1, 0x261b58)); shell.rotation.z = Math.PI; shell.position.y = 1; g.add(shell);
    for (let i = 0; i < 9; i++) { const crystal = new THREE.Mesh(new THREE.ConeGeometry(.7 + (i % 3) * .2, 5 + (i % 4), 6), material(zone.accent, 1, zone.accent)); crystal.position.set(-9 + i * 2.25, -4 + (i % 2) * 1.1, (i % 3 - 1) * 1.4); crystal.rotation.z = (i % 2 ? .17 : -.17); g.add(crystal); }
    g.position.set(0, 0, -d); world.add(g); reveal(g, 1, 'cavern');
  }
  function addSignature(zone, i) {
    const d = zone.landmarkDepth;
    if (i === 0) { addArch(-10, -d, zone.accent, 1.6); for (let n = 0; n < 12; n++) addKelp(zone, d - 40 + n * 8, n % 2 ? 1 : -1, 700 + n); addTunnel(zone, zone.shortcutDepth, zone.shortcutX, 1); }
    if (i === 1) { addWreck(zone, d, -1, 1.25); addWreck(zone, d + 35, 12, .62); addArch(14, -(zone.shortcutDepth), zone.accent, 1.35); addTunnel(zone, zone.shortcutDepth, zone.shortcutX, 1.05); }
    if (i === 2) { addVent(zone, d, 0, 1.5); addVent(zone, d + 30, -10, .65); addVent(zone, d + 42, 11, .72); addArch(-16, -zone.shortcutDepth, zone.accent, 1.45); addTunnel(zone, zone.shortcutDepth, zone.shortcutX, 1.1); }
    if (i === 3) { addCavern(zone, d); addArch(17, -zone.shortcutDepth, zone.accent, 1.7); addTunnel(zone, zone.shortcutDepth, zone.shortcutX, 1.25); }
  }
  function buildZone(index) {
    const zone = zoneAt(index);
    clearAuthoredWorld();
    scene.fog.color.setHex(zone.fog);
    const floorColor = lerpColor(zone.tint, 0x02070d, .55);
    const wallColor = lerpColor(zone.tint, 0x02070d, .3);
    const r = rng32(0x9e3779b9 ^ index * 8831);
    for (let d = 12, row = 0; d < zone.length; d += 28, row++) {
      const floor = cube([zone.width + 10, 1.4, 27], floorColor);
      floor.position.set(0, -10.5 + Math.sin(row * 1.7) * .5, -d); world.add(floor); reveal(floor, .36, 'floor');
      const left = rock([2.8 + r() * 3, 4 + r() * 6, 10 + r() * 7], wallColor); left.position.set(-zone.width * .5 - 2 - r() * 2, -5 + r() * 4, -d); world.add(left); reveal(left, .48, 'wall');
      const right = rock([2.8 + r() * 3, 4 + r() * 6, 10 + r() * 7], wallColor); right.position.set(zone.width * .5 + 2 + r() * 2, -5 + r() * 4, -d - 7); world.add(right); reveal(right, .48, 'wall');
      if (row % 3 === 0) { addRock(-zone.width * .5 + 3 + r() * 4, -7, -d - 6, [1.5 + r() * 2, 2 + r() * 3, 2 + r() * 4], zone.tint); addRock(zone.width * .5 - 3 - r() * 4, -7, -d - 14, [1.5 + r() * 2, 2 + r() * 3, 2 + r() * 4], zone.tint); }
      if (row % 4 === 1) { addTrenchCable(zone, d, -1, index * 9900 + row * 11); addTrenchCable(zone, d + 8, 1, index * 7700 + row * 17); }
    }
    addSignature(zone, index);
    assignRouteEntities(zone, index);
  }
  function lerpColor(a, b, t) {
    const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
    const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
    return ((Math.round(lerp(ar, br, t)) << 16) | (Math.round(lerp(ag, bg, t)) << 8) | Math.round(lerp(ab, bb, t))) >>> 0;
  }

  function setGroupOpacity(group, alpha) { group.traverse(function (child) { if (child.material) child.material.opacity = alpha; }); }
  function makeFaunaPool() {
    for (let i = 0; i < MAX_FAUNA; i++) {
      const g = new THREE.Group();
      const bodyMat = material(0xff6178, 1, 0xff263f);
      const body = new THREE.Mesh(new THREE.SphereGeometry(1, 9, 6), bodyMat); body.scale.set(2.3, .8, 1.05); g.add(body);
      const fin = new THREE.Mesh(new THREE.ConeGeometry(.8, 3.5, 5), bodyMat); fin.rotation.x = Math.PI / 2; fin.position.z = 2.2; g.add(fin);
      const fin2 = fin.clone(); fin2.position.z = -2.2; fin2.rotation.x = -Math.PI / 2; g.add(fin2);
      const jaw = new THREE.Mesh(new THREE.TorusGeometry(.72, .12, 5, 12, Math.PI), material(0x7d2743, 1, 0x2c0917)); jaw.rotation.x = Math.PI / 2; jaw.position.z = -.62; jaw.position.y = -.2; g.add(jaw);
      const eyeMat = material(0xffd27d, 1, 0xffb94e);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(.15, 6, 4), eyeMat); eye.position.set(.7, .25, -.8); g.add(eye);
      const eye2 = eye.clone(); eye2.position.x = -.7; g.add(eye2);
      g.visible = false; entities.add(g); fauna.push({ group: g, body: body, fins: [fin, fin2], eyeMat: eyeMat, active: false, big: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, target: new THREE.Vector3(), homing: false, pendingPing: false, litAt: -999, ph: i * 1.7, hitAt: -999, impactUntil: -999, reveal: null });
    }
  }
  function makeCratePool() {
    for (let i = 0; i < MAX_CRATES; i++) {
      const g = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 2.4), material(COLORS.amber, 1, 0x59360f));
      const crossMat = material(COLORS.ice, 1, COLORS.cyan);
      const crossA = new THREE.Mesh(new THREE.BoxGeometry(.24, 2.8, .15), crossMat);
      const crossB = new THREE.Mesh(new THREE.BoxGeometry(2.8, .24, .15), crossMat);
      g.add(box, crossA, crossB); g.visible = false; entities.add(g);
      crates.push({ group: g, active: false, collected: false, x: 0, y: 0, z: 0, reveal: null });
    }
  }
  function makeSupplyPool() {
    for (let i = 0; i < MAX_SUPPLIES; i++) {
      const g = new THREE.Group();
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(1.1, 0), material(COLORS.green, 1, COLORS.green));
      const halo = new THREE.Mesh(new THREE.TorusGeometry(1.8, .11, 6, 16), material(COLORS.ice, 1, COLORS.cyan)); halo.rotation.x = Math.PI / 2;
      g.add(core, halo); g.visible = false; entities.add(g);
      supplies.push({ group: g, active: false, collected: false, type: 'air', x: 0, y: 0, z: 0, reveal: null, ph: i });
    }
  }
  function makeBeaconPool() {
    for (let i = 0; i < MAX_BEACONS; i++) {
      const g = new THREE.Group();
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(.13, .25, 3.3, 6), material(COLORS.cyan, 1, COLORS.cyan));
      const cap = new THREE.Mesh(new THREE.OctahedronGeometry(.82, 0), material(COLORS.amber, 1, COLORS.amber)); cap.position.y = 2;
      g.add(stem, cap); g.visible = false; entities.add(g);
      beacons.push({ group: g, active: false, mapped: false, x: 0, y: 0, z: 0, reveal: null });
    }
  }
  function makeRescue() {
    const g = new THREE.Group();
    const pod = new THREE.Mesh(new THREE.SphereGeometry(2.1, 10, 7), material(COLORS.amber, 1, 0x754310));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.6, .18, 7, 18), material(COLORS.cyan, 1, COLORS.cyan)); ring.rotation.x = Math.PI / 2;
    g.add(pod, ring); g.visible = false; entities.add(g); rescue.group = g;
  }

  const particleClouds = [];
  function makeParticleCloud(max, color, size) {
    const positions = new Float32Array(max * 3);
    const sizes = new Float32Array(max);
    const alphas = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
    const points = new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uPixelRatio: { value: renderer.getPixelRatio() }, uSize: { value: size } },
      vertexShader: 'attribute float aSize; attribute float aAlpha; varying float vAlpha; uniform float uPixelRatio; uniform float uSize; void main(){vAlpha=aAlpha; vec4 mvPosition=modelViewMatrix*vec4(position,1.0); gl_PointSize=max(1.0,uSize*aSize*uPixelRatio*(92.0/-mvPosition.z)); gl_Position=projectionMatrix*mvPosition;}',
      fragmentShader: 'uniform vec3 uColor; varying float vAlpha; void main(){float d=distance(gl_PointCoord,vec2(.5)); float edge=smoothstep(.5,.12,d); gl_FragColor=vec4(uColor,edge*vAlpha);}',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    fx.add(points);
    const records = [];
    for (let i = 0; i < max; i++) records.push({ active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, age: 0, size: 1 });
    const cloud = { positions: positions, sizes: sizes, alphas: alphas, points: points, records: records, cursor: 0 };
    particleClouds.push(cloud); return cloud;
  }
  function emit(cloud, x, y, z, vx, vy, vz, life, size) {
    if (kit.juice.enabled === false) return;
    const p = cloud.records[cloud.cursor++ % cloud.records.length];
    p.active = true; p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.life = life; p.age = 0; p.size = size || 1;
  }
  function updateParticles(dt) {
    for (let c = 0; c < particleClouds.length; c++) {
      const cloud = particleClouds[c], pos = cloud.positions;
      for (let i = 0; i < cloud.records.length; i++) {
        const p = cloud.records[i]; p.age += p.active ? dt : 0;
        if (p.age >= p.life) p.active = false;
        const j = i * 3;
        if (p.active && kit.juice.enabled) {
          p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; pos[j] = p.x; pos[j + 1] = p.y; pos[j + 2] = p.z;
          cloud.sizes[i] = p.size * (0.72 + (1 - clamp(p.age / Math.max(.01, p.life), 0, 1)) * .78);
          cloud.alphas[i] = clamp(1 - p.age / Math.max(.01, p.life), 0, 1) * .74;
        } else { pos[j] = 9999; pos[j + 1] = 9999; pos[j + 2] = 9999; cloud.sizes[i] = 0; cloud.alphas[i] = 0; }
      }
      cloud.points.geometry.attributes.position.needsUpdate = true;
      cloud.points.geometry.attributes.aSize.needsUpdate = true;
      cloud.points.geometry.attributes.aAlpha.needsUpdate = true;
    }
  }

  const bubbleCloud = makeParticleCloud(110, COLORS.cyan, .24);
  const siltCloud = makeParticleCloud(150, COLORS.amber, .18);
  const pingRingGeometry = new THREE.RingGeometry(.88, 1, 64);
  const pingDiscGeometry = new THREE.CircleGeometry(1, 64);
  const pingsByVisual = [];
  const SONAR_VERTEX = 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}';
  const SONAR_FRAGMENT = 'uniform float uOpacity; uniform vec3 uColor; varying vec2 vUv; void main(){float d=distance(vUv,vec2(.5)); float edge=smoothstep(.5,.37,d); gl_FragColor=vec4(uColor,edge*uOpacity);}';
  const GLOW_FRAGMENT = 'uniform float uOpacity; uniform vec3 uColor; varying vec2 vUv; void main(){float d=distance(vUv,vec2(.5)); float glow=pow(max(0.,1.-d*2.),2.2); gl_FragColor=vec4(uColor,glow*uOpacity*.22);}';
  for (let i = 0; i < MAX_PINGS; i++) {
    const ringMat = new THREE.ShaderMaterial({ uniforms: { uOpacity: { value: 0 }, uColor: { value: new THREE.Color(COLORS.cyan) } }, vertexShader: SONAR_VERTEX, fragmentShader: SONAR_FRAGMENT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const glowMat = new THREE.ShaderMaterial({ uniforms: { uOpacity: { value: 0 }, uColor: { value: new THREE.Color(COLORS.cyan) } }, vertexShader: SONAR_VERTEX, fragmentShader: GLOW_FRAGMENT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(pingRingGeometry, ringMat); const glow = new THREE.Mesh(pingDiscGeometry, glowMat); glow.renderOrder = -1; ring.renderOrder = 0; fx.add(glow, ring);
    pingsByVisual.push({ ring: ring, glow: glow, ringMat: ringMat, glowMat: glowMat });
    pings.push({ active: false, radius: 0, age: 0, speed: 176, max: 320, x: 0, y: 0, z: 0, visual: pingsByVisual[i] });
  }

  function profiledHullGeometry() {
    const profile = [
      new THREE.Vector2(0, -4.9), new THREE.Vector2(.62, -4.65), new THREE.Vector2(1.65, -3.75),
      new THREE.Vector2(2.18, -2.15), new THREE.Vector2(2.3, 0), new THREE.Vector2(2.14, 2.05),
      new THREE.Vector2(1.46, 3.8), new THREE.Vector2(.58, 4.68), new THREE.Vector2(0, 4.9)
    ];
    return new THREE.LatheGeometry(profile, 18);
  }
  function createSub() {
    const g = new THREE.Group();
    const base = new THREE.Mesh(profiledHullGeometry(), material(COLORS.hull, 1, 0x06111b, .62)); base.rotation.x = Math.PI / 2; base.scale.set(1, .92, 1); g.add(base);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(1.8, 2.8, 12), material(0x235d72, 1, 0x0b2e3b)); nose.rotation.x = -Math.PI / 2; nose.position.z = -4.45; g.add(nose);
    const tower = cube([1.05, 1.05, 1.65], 0x2d6479, COLORS.cyan); tower.position.set(0, 1.1, .15); g.add(tower);
    const windowMat = material(COLORS.cyan, 1, COLORS.cyan); const window = new THREE.Mesh(new THREE.SphereGeometry(.42, 10, 6), windowMat); window.scale.set(1, .55, .35); window.position.set(0, 1.48, -.48); g.add(window);
    const stripeMat = material(COLORS.cyan, 1, COLORS.cyan);
    for (let i = 0; i < 5; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(1.98 - i * .03, .09 + i * .02, 7, 24), stripeMat); ring.position.z = -1.25 + i * 1.3; ring.userData.plate = i; ring.visible = i <= profile.upgrades.hull; g.add(ring); }
    const finMat = material(0x1b526a, 1, 0x092430);
    const finL = new THREE.Mesh(new THREE.BoxGeometry(2.1, .16, 1.6), finMat); finL.position.set(-2.1, -.2, .8); finL.rotation.z = -.16;
    const finR = finL.clone(); finR.position.x = 2.1; finR.rotation.z = .16; g.add(finL, finR);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(1.25, 2.2, .18), finMat); tail.position.set(0, .7, 3.4); g.add(tail);
    const tankMat = material(0x2b6980, 1, 0x0d2b39, .56);
    const tankL = new THREE.Mesh(new THREE.CapsuleGeometry(.52, 2.5, 5, 8), tankMat); tankL.rotation.x = Math.PI / 2; tankL.position.set(-2.05, -.55, .1);
    const tankR = tankL.clone(); tankR.position.x = 2.05; g.add(tankL, tankR);
    const tankBandMat = material(COLORS.amber, 1, 0x6a3c12);
    for (let i = 0; i < 2; i++) {
      const bandL = new THREE.Mesh(new THREE.TorusGeometry(.57, .07, 6, 16), tankBandMat); bandL.rotation.x = Math.PI / 2; bandL.position.set(-2.05, -.55, -.6 + i * 1.1);
      const bandR = bandL.clone(); bandR.position.x = 2.05; g.add(bandL, bandR);
    }
    const propeller = new THREE.Group();
    const hub = new THREE.Mesh(new THREE.SphereGeometry(.34, 8, 6), material(COLORS.amber, 1, 0x6a3c12)); propeller.add(hub);
    for (let i = 0; i < 4; i++) { const blade = new THREE.Mesh(new THREE.BoxGeometry(.16, 1.05, .08), material(COLORS.cyan, 1, COLORS.cyan)); blade.rotation.z = i * Math.PI / 2; blade.position.y = .48; propeller.add(blade); }
    propeller.position.set(0, 0, 4.54); propeller.rotation.x = Math.PI / 2; g.add(propeller);
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(.055, .08, 1.8, 6), material(COLORS.amber, 1, COLORS.amber)); antenna.position.set(0, 2.05, .18); g.add(antenna);
    const navLight = new THREE.Mesh(new THREE.SphereGeometry(.16, 7, 5), material(COLORS.green, 1, COLORS.green)); navLight.position.set(0, 2.75, .18); g.add(navLight);
    g.userData.motion = { base: base, tower: tower, propeller: propeller, antenna: antenna, navLight: navLight, window: window, fins: [finL, finR] };
    return g;
  }
  const subModel = createSub(); playerRig.add(subModel);
  const bubbleEngine = new THREE.Object3D(); playerRig.add(bubbleEngine);
  function updateHullPlating() { subModel.traverse(function (child) { if (child.userData && child.userData.plate != null) child.visible = child.userData.plate <= profile.upgrades.hull; }); }

  function updateSubAnimation(dt) {
    const motion = subModel.userData.motion;
    game.animClock += dt;
    const descending = game.vDepth > 1.1;
    const ascending = game.vDepth < -1.1;
    const next = game.cameraDip < -.2 ? 'impact' : descending ? 'descend' : ascending ? 'ascend' : 'idle';
    if (game.animState !== next) { game.animState = next; game.animClock = 0; }
    const breath = kit.juice.enabled ? Math.sin(game.animClock * (next === 'idle' ? 2.2 : 4.8)) : 0;
    motion.propeller.rotation.z += dt * (descending || ascending ? 8 : 3.2);
    motion.tower.position.y = 1.1 + breath * .035;
    motion.antenna.rotation.z = kit.juice.enabled ? Math.sin(game.animClock * 1.7) * .035 : 0;
    motion.navLight.scale.setScalar(1 + (kit.juice.enabled ? Math.max(0, Math.sin(game.animClock * 6)) * .18 : 0));
    motion.window.material.emissiveIntensity = next === 'impact' ? 1.25 : .42;
    motion.fins[0].rotation.z = -.16 - game.trim * .08;
    motion.fins[1].rotation.z = .16 - game.trim * .08;
    const squash = next === 'impact' ? 1.08 : 1;
    motion.base.scale.y = .92 * squash;
  }

  const game = {
    mode: 'dock', diveIndex: 0, zoneIndex: 0, dive: diveAt(0), zone: zoneAt(0), depth: 0, air: 0, airMax: 0, pressure: 0, hull: 1, hullMax: 1,
    carried: 0, survey: 0, rescueRecovered: false, rescueTime: 0, vDepth: 0, x: 0, y: 0, vx: 0, vy: 0, ballast: 0, ballastTarget: 0, trim: 0, pitch: 0,
    pingCharges: 3, pingCooldown: 0, contactWarning: false, message: '', messageUntil: 0, pressureTone: 0, lastSupply: -1, lastLandmark: -1, objectiveComplete: false,
    result: null, forceFaunaApplied: null, shortcutUsed: false, shortcutNotice: 0, animState: 'idle', animClock: 0,
    tutorialStep: 0, tutorialBallastSeen: false, tutorialPingSeen: false, tutorialSteerSeen: false, tutorialPickupSeen: false, cameraDip: 0
  };
  let selectedDive = 0;
  let simTime = 0;
  let queuedAction = null;
  let keyPingWasDown = false;
  let keyLaunchWasDown = false;
  let userInteracted = false;
  let bannerUntil = 0;
  let transientQueue = [];
  let activeTransient = null;
  let coachStep = -1;
  let coachUntil = 0;

  function resetPoolVisibility() {
    for (let i = 0; i < fauna.length; i++) { fauna[i].active = false; fauna[i].pendingPing = false; fauna[i].homing = false; fauna[i].impactUntil = -999; fauna[i].group.visible = false; }
    for (let i = 0; i < crates.length; i++) crates[i].active = false, crates[i].group.visible = false;
    for (let i = 0; i < supplies.length; i++) supplies[i].active = false, supplies[i].group.visible = false;
    for (let i = 0; i < beacons.length; i++) beacons[i].active = false, beacons[i].group.visible = false;
    rescue.active = false; rescue.recovered = false; rescue.group.visible = false;
    for (let i = 0; i < pings.length; i++) pings[i].active = false;
  }
  function assignRouteEntities(zone, zoneIndex) {
    revealables = revealables.filter(function (rec) { return rec.object.parent !== entities; });
    resetPoolVisibility();
    const dive = game.dive;
    for (let i = 0; i < zone.crates.length && i < crates.length; i++) {
      const def = zone.crates[i], c = crates[i]; c.active = true; c.collected = false; c.x = def.x; c.y = -3 + (i % 2) * 1.1; c.z = -def.d; c.group.position.set(c.x, c.y, c.z); c.group.rotation.set(0, i * .7, 0); c.group.visible = true; c.reveal = reveal(c.group, .95, 'salvage');
    }
    for (let i = 0; i < zone.supplies.length && i < supplies.length; i++) {
      const def = zone.supplies[i], s = supplies[i]; s.active = true; s.collected = false; s.type = def.type; s.x = def.x; s.y = -1 + (i % 2); s.z = -def.d; s.group.position.set(s.x, s.y, s.z); s.group.visible = true; s.reveal = reveal(s.group, .8, 'supply'); s.group.children[0].material.color.setHex(def.type === 'air' ? COLORS.green : COLORS.violet); s.group.children[0].material.emissive.setHex(def.type === 'air' ? COLORS.green : COLORS.violet);
    }
    for (let i = 0; i < zone.beacons.length && i < beacons.length; i++) {
      const def = zone.beacons[i], b = beacons[i]; b.active = true; b.mapped = false; b.x = def.x; b.y = -4; b.z = -def.d; b.group.position.set(b.x, b.y, b.z); b.group.visible = dive.key === 'survey' || dive.key === 'abyssal'; b.reveal = b.group.visible ? reveal(b.group, .92, 'survey') : null;
    }
    if (dive.rescue) {
      rescue.active = true; rescue.recovered = false; rescue.group.visible = true; rescue.group.position.set(0, -2, -dive.maxDepth); rescue.reveal = reveal(rescue.group, .98, 'rescue');
    }
    const forced = DEBUG_STATE.forceFauna;
    const count = forced === false ? 0 : forced === true ? Math.min(MAX_FAUNA, Math.max(6, zone.fauna + 3)) : zone.fauna;
    game.forceFaunaApplied = forced;
    const random = rng32(0x61c88647 ^ (zoneIndex + 1) * 19319 ^ (game.diveIndex + 7) * 97);
    let n = 0;
    for (let t = 0; t < zone.faunaTerritories.length && n < count; t++) {
      const territory = zone.faunaTerritories[t];
      const f = fauna[n++]; f.active = true; f.big = territory.big; f.x = territory.x + (random() - .5) * 8; f.y = -1 + (random() - .5) * 5; f.z = -territory.d + (random() - .5) * territory.r; f.vx = 0; f.vy = 0; f.vz = 0; f.homing = false; f.pendingPing = false; f.litAt = -999; f.hitAt = -999; f.impactUntil = -999; f.target.set(f.x, f.y, f.z); f.group.position.set(f.x, f.y, f.z); f.group.scale.setScalar(f.big ? 1.35 : .72); f.group.visible = true; f.reveal = reveal(f.group, f.big ? 1 : .68, 'fauna'); f.reveal.litAt = -999;
    }
    while (n < count) {
      const f = fauna[n++]; f.active = true; f.big = n % 3 !== 0; f.x = (random() - .5) * zone.width * .72; f.y = -2 + (random() - .5) * 5; f.z = -80 - random() * Math.max(120, zone.length - 140); f.vx = 0; f.vy = 0; f.vz = 0; f.homing = false; f.pendingPing = false; f.target.set(f.x, f.y, f.z); f.group.position.set(f.x, f.y, f.z); f.group.scale.setScalar(f.big ? 1.3 : .7); f.group.visible = true; f.reveal = reveal(f.group, f.big ? 1 : .68, 'fauna');
    }
  }

  function surfaceDepth() { return game.depth <= 7 && game.vDepth < -0.8; }
  function redline() { return game.zone.redline + profile.upgrades.hull * 115; }
  function objectiveText() {
    const d = game.dive;
    if (d.objectiveType === 'crates') return '◈ SALVAGE ' + game.carried + '/' + d.goal;
    if (d.objectiveType === 'beacons') return '◆ BEACONS ' + game.survey + '/' + d.goal;
    if (game.rescueRecovered) return '✓ POD SECURED';
    return '◉ POD  ' + Math.max(0, Math.ceil(game.rescueTime)) + 'S';
  }
  function clearTransientQueue() { transientQueue = []; activeTransient = null; }
  function queueTransient(text, duration) {
    if (!text || (activeTransient && activeTransient.text === text)) return;
    for (let i = 0; i < transientQueue.length; i++) if (transientQueue[i].text === text) return;
    if (transientQueue.length >= 4) transientQueue.shift();
    transientQueue.push({ text: String(text), hold: clamp(duration == null ? 1 : duration, .35, 1) });
  }
  function updateTransient() {
    if (activeTransient && activeTransient.until <= simTime) activeTransient = null;
    if (!activeTransient && transientQueue.length) {
      activeTransient = transientQueue.shift();
      activeTransient.until = simTime + activeTransient.hold;
    }
  }
  function setMessage(text, duration) {
    game.message = text;
    game.messageUntil = simTime + (duration || 2.8);
    if (game.mode === 'dive') queueTransient(text, Math.min(1, duration || 1));
  }
  function showBanner(title, sub) {
    clearTransientQueue();
    coachUntil = 0;
    setText(dom.bannerTitle, title); setText(dom.bannerSub, sub || ''); dom.banner.classList.remove('show'); void dom.banner.offsetWidth; dom.banner.classList.add('show'); bannerUntil = simTime + 3.4;
  }
  function setTextIfChanged(node, value) { const text = String(value); if (node.textContent !== text) node.textContent = text; }
  const setText = setTextIfChanged;

  function firePing() {
    if (game.mode !== 'dive' || game.pingCooldown > 0 || game.pingCharges <= 0) return;
    let p = null;
    for (let i = 0; i < pings.length; i++) if (!pings[i].active) { p = pings[i]; break; }
    if (!p) p = pings[0];
    p.active = true; p.radius = 0; p.age = 0; p.x = playerRig.position.x; p.y = playerRig.position.y; p.z = playerRig.position.z; p.visual.ring.position.set(p.x, p.y, p.z); p.visual.glow.position.set(p.x, p.y, p.z); p.visual.ring.scale.set(.01, .01, .01); p.visual.glow.scale.set(.01, .01, .01); p.visual.ringMat.uniforms.uOpacity.value = .82; p.visual.glowMat.uniforms.uOpacity.value = 1;
    lastPingPosition.set(p.x, p.y, p.z); lastPingAt = simTime; game.pingCooldown = 1.25; game.pingCharges--; game.tutorialPingSeen = true; kit.audio.sfx('sonar', { volume: .9 });
    let callers = 0;
    for (let i = 0; i < fauna.length; i++) { const f = fauna[i]; if (!f.active || !f.big) continue; const dist = f.group.position.distanceTo(lastPingPosition); if (dist < p.max) { f.target.copy(lastPingPosition); f.pendingPing = true; callers++; } }
    if (callers) kit.audio.sfx('fauna-call', { volume: .45 });
    setMessage(callers ? 'PING  //  ' + callers + ' CONTACTS' : 'PING  //  TRENCH REVEALED', 2.2);
    if (!kit.juice.enabled) {
      for (let i = 0; i < revealables.length; i++) {
        const rec = revealables[i];
        if (rec.object.position.distanceTo(lastPingPosition) <= p.max) rec.litAt = simTime;
      }
      for (let i = 0; i < fauna.length; i++) {
        const f = fauna[i];
        if (f.active && f.pendingPing && f.reveal) { f.pendingPing = false; f.homing = true; f.reveal.litAt = simTime; }
      }
      p.visual.ringMat.uniforms.uOpacity.value = 0;
      p.visual.glowMat.uniforms.uOpacity.value = 0;
      p.active = false;
    }
  }
  function updatePings(dt) {
    for (let i = 0; i < pings.length; i++) {
      const p = pings[i]; if (!p.active) continue; p.age += dt; p.radius += p.speed * dt; const v = p.visual; v.ring.position.set(p.x, p.y, p.z); v.glow.position.set(p.x, p.y, p.z); v.ring.scale.set(p.radius, p.radius, p.radius); v.glow.scale.set(p.radius * 1.1, p.radius * 1.1, p.radius * 1.1); const fade = clamp(1 - p.radius / p.max, 0, 1); v.ringMat.uniforms.uOpacity.value = fade * .82; v.glowMat.uniforms.uOpacity.value = fade;
      for (let j = 0; j < revealables.length; j++) { const rec = revealables[j]; const d = rec.object.position.distanceTo(p.visual.ring.position); if (d <= p.radius && d > p.radius - p.speed * dt * 1.5) rec.litAt = simTime; }
      for (let j = 0; j < fauna.length; j++) {
        const f = fauna[j]; if (!f.active || !f.pendingPing) continue;
        const d = f.group.position.distanceTo(p.visual.ring.position);
        if (d <= p.radius && d > p.radius - p.speed * dt * 1.5) { f.pendingPing = false; f.homing = true; if (f.reveal) f.reveal.litAt = simTime; }
      }
      if (p.radius >= p.max) p.active = false;
    }
  }

  function controls() {
    let ballast = false, steer = 0;
    for (const p of kit.input.pointers.values()) {
      if (p.zone === 'ballast') ballast = true;
      else if (!p.zone) steer += clamp((p.x - p.startX) / Math.max(80, window.innerWidth * .2), -1, 1);
    }
    if (kit.input.keyDown('Space') || kit.input.keyDown('ArrowDown') || kit.input.keyDown('KeyS')) ballast = true;
    if (kit.input.keyDown('ArrowLeft') || kit.input.keyDown('KeyA')) steer -= 1;
    if (kit.input.keyDown('ArrowRight') || kit.input.keyDown('KeyD')) steer += 1;
    const sonarDown = kit.input.keyDown('KeyE') || kit.input.keyDown('Enter') || kit.input.keyDown('ShiftLeft') || kit.input.keyDown('ShiftRight');
    if (sonarDown && !keyPingWasDown) firePing(); keyPingWasDown = sonarDown;
    const launchDown = kit.input.keyDown('Enter') || kit.input.keyDown('Space');
    if (launchDown && !keyLaunchWasDown && game.mode === 'dock') queuedAction = { type: 'launch' }; keyLaunchWasDown = launchDown;
    if (ballast) game.tutorialBallastSeen = true;
    if (Math.abs(steer) > .18) game.tutorialSteerSeen = true;
    return { ballast: ballast, steer: clamp(steer, -1, 1) };
  }
  function updateSub(dt) {
    const c = controls(); game.ballastTarget = c.ballast ? 1 : 0; game.ballast = damp(game.ballast, game.ballastTarget, 1.65, dt);
    const diveSpeed = 15 + game.zoneIndex * 1.8; const targetV = (game.ballast - .38) * diveSpeed;
    game.vDepth = damp(game.vDepth, targetV, 1.35, dt); game.depth += game.vDepth * dt; game.depth = clamp(game.depth, 0, game.dive.maxDepth + 38);
    game.vx = damp(game.vx, c.steer * (8.4 + game.zoneIndex), 3.8, dt); game.x += game.vx * dt; game.x = clamp(game.x, -game.zone.width * .5 + 3.3, game.zone.width * .5 - 3.3);
    const trimTarget = clamp((game.ballast - .5) * .9 + game.vDepth / 18, -.85, .85); game.trim = damp(game.trim, trimTarget, 1.8, dt); game.y = damp(game.y, -game.trim * 1.3, 2.2, dt); game.vy = damp(game.vy, -game.trim * 2.2, 2, dt);
    game.pitch = damp(game.pitch, -game.trim * .32, 2.5, dt); playerRig.position.set(game.x, game.y, -game.depth); playerRig.rotation.x = game.pitch; playerRig.rotation.z = damp(playerRig.rotation.z, -c.steer * .16, 3, dt); updateSubAnimation(dt);
    if (c.ballast || game.ballast > .5) {
      if (Math.random() < dt * (game.ballast > .65 ? 24 : 11)) emit(bubbleCloud, game.x + (Math.random() - .5) * 1.5, game.y - .1, -game.depth + 3.8, (Math.random() - .5) * .6, .8 + Math.random() * 1.2, .6 + Math.random() * .7, 1.4 + Math.random() * .8, .7);
    }
    if (game.depth > 12 && Math.random() < dt * (3 + Math.abs(game.vDepth) * .7)) emit(siltCloud, game.x + (Math.random() - .5) * 3, -8.7, -game.depth + 2, (Math.random() - .5) * 2, .15 + Math.random() * .5, .5 + Math.random() * 1.6, 1.6 + Math.random() * .8, .8);
  }
  function updatePressure(dt) {
    game.pressure = game.depth / Math.max(1, redline()) * game.zone.pressure;
    const dangerous = game.pressure > .82;
    if (dangerous) {
      game.pressureTone -= dt;
      if (game.pressureTone <= 0) { game.pressureTone = game.pressure > 1 ? .55 : 1.15; kit.audio.sfx('hull-creak', { volume: .48 + Math.min(.35, game.pressure * .2), rate: .84 + Math.random() * .12 }); }
    }
    if (game.pressure > 1) { game.hull -= (game.pressure - 1) * (4.6 + game.zoneIndex * 1.6) * dt; if (Math.random() < dt * 10) emit(siltCloud, game.x, game.y, -game.depth, (Math.random() - .5) * 3, Math.random() * 2, Math.random() * 2, .7, 1.2); }
    if (game.pressure > .96 && game.messageUntil < simTime + .4) setMessage(game.pressure > 1 ? 'REDLINE  //  BLOW BALLAST' : 'PRESSURE  //  REDLINE NEAR', 1.3);
  }
  function updateFauna(dt) {
    let warnings = 0;
    game.cameraDip = damp(game.cameraDip, 0, 8, dt);
    for (let i = 0; i < fauna.length; i++) {
      const f = fauna[i]; if (!f.active) continue; f.ph += dt * (f.big ? 1.4 : 2.5);
      let ax = Math.cos(f.ph + i) * (f.big ? 1.6 : 3.2), ay = Math.sin(f.ph * .7 + i) * 1.2, az = Math.sin(f.ph * .45 + i * 1.4) * 1.4;
      if (f.homing) { const dx = f.target.x - f.group.position.x, dy = f.target.y - f.group.position.y, dz = f.target.z - f.group.position.z, d = Math.hypot(dx, dy, dz) || 1; ax += dx / d * (f.big ? 6.8 : 3.5); ay += dy / d * (f.big ? 3.5 : 2); az += dz / d * (f.big ? 6.8 : 3); }
      f.vx = damp(f.vx, ax, 1.7, dt); f.vy = damp(f.vy, ay, 1.7, dt); f.vz = damp(f.vz, az, 1.7, dt); f.group.position.x += f.vx * dt; f.group.position.y += f.vy * dt; f.group.position.z += f.vz * dt;
      f.group.position.x = clamp(f.group.position.x, -game.zone.width * .5 + 2, game.zone.width * .5 - 2); f.group.position.y = clamp(f.group.position.y, -7, 7); f.group.position.z = clamp(f.group.position.z, -game.zone.length + 12, -18); f.group.rotation.y = Math.atan2(f.vz, f.vx + .01); f.group.rotation.z = Math.sin(f.ph) * .15;
      const revealed = !!(f.reveal && f.reveal.litAt > simTime - 4);
      const distance = f.group.position.distanceTo(playerRig.position); if (revealed && distance < (f.big ? 24 : 15)) warnings++;
      const impact = simTime < f.impactUntil;
      const baseScale = f.big ? 1.35 : .72;
      const swimPulse = kit.juice.enabled ? Math.sin(f.ph * 1.8 + i) * .055 : 0;
      f.group.scale.setScalar(baseScale * (impact ? 1.13 : 1 + swimPulse));
      f.fins[0].rotation.z = kit.juice.enabled ? Math.sin(f.ph * 2.2) * .28 : 0;
      f.fins[1].rotation.z = kit.juice.enabled ? -Math.sin(f.ph * 2.2) * .28 : 0;
      f.body.material.emissiveIntensity = impact ? 1.3 : revealed ? .62 : .42;
      f.eyeMat.emissiveIntensity = revealed ? 1.1 : .42;
      if (f.big && revealed && simTime - f.hitAt > 1.2 && distance < 5.2) {
        f.hitAt = simTime; f.impactUntil = simTime + .2; game.hull -= 0.16; game.vDepth *= -.4; game.cameraDip = -.78;
        if (kit.juice.enabled) { kit.juice.hitStop(60); kit.juice.shake(4, 130); }
        kit.audio.sfx('fauna-call', { volume: .65, rate: .72 }); setMessage('IMPACT  //  PULL AWAY', 1.8);
      }
    }
    game.contactWarning = warnings > 0;
  }
  function updatePickups(dt) {
    for (let i = 0; i < crates.length; i++) {
      const c = crates[i]; if (!c.active || c.collected) continue; c.group.rotation.y += dt * .55; if (c.group.position.distanceTo(playerRig.position) < 5.2) { c.collected = true; c.group.visible = false; game.carried++; game.tutorialPickupSeen = true; kit.audio.sfx('salvage', { volume: .72 }); emit(siltCloud, c.x, c.y, c.z, 0, 2.5, 0, 1.1, 1.6); setMessage('SALVAGE  ' + game.carried + '/' + game.dive.goal, 2.1); if (game.dive.objectiveType === 'crates' && game.carried >= game.dive.goal) game.objectiveComplete = true; }
    }
    for (let i = 0; i < supplies.length; i++) {
      const s = supplies[i]; if (!s.active || s.collected) continue; s.ph += dt * 2; s.group.rotation.y += dt * .7; s.group.position.y = s.y + Math.sin(s.ph) * .45; if (s.group.position.distanceTo(playerRig.position) < 5.3) { s.collected = true; s.group.visible = false; if (s.type === 'air') { game.air = Math.min(game.airMax, game.air + 26); setMessage('AIR  +26S', 1.8); kit.audio.sfx('air-pickup', { volume: .75 }); } else { game.pingCharges = Math.min(6, game.pingCharges + 2); setMessage('SONAR  +2', 1.8); kit.audio.sfx('sonar', { volume: .42, rate: 1.28 }); } }
    }
    for (let i = 0; i < beacons.length; i++) {
      const b = beacons[i]; if (!b.active || b.mapped || !b.group.visible) continue; b.group.rotation.y += dt * .9; if (b.group.position.distanceTo(playerRig.position) < 5.5) { b.mapped = true; game.survey++; setMessage('BEACON  ' + game.survey + '/' + game.dive.goal, 2.1); kit.audio.sfx('survey', { volume: .7 }); if (game.dive.objectiveType === 'beacons' && game.survey >= game.dive.goal) game.objectiveComplete = true; }
    }
    if (rescue.active && !rescue.recovered && rescue.group.position.distanceTo(playerRig.position) < 6) { rescue.recovered = true; game.rescueRecovered = true; game.objectiveComplete = true; rescue.group.visible = false; kit.audio.sfx('rescue', { volume: .9 }); setMessage('POD SECURED  //  SURFACE', 2.8); }
  }
  function updateShortcut() {
    if (game.shortcutUsed) return;
    const zone = game.zone;
    const nearDepth = Math.abs(game.depth - zone.shortcutDepth) < 12;
    const nearMouth = Math.abs(game.x - zone.shortcutX) < 7;
    if (nearDepth && nearMouth && game.shortcutNotice < simTime) {
      game.shortcutNotice = simTime + 2;
      setMessage('CUT OPEN  //  HOLD LINE', 2.2);
    }
    if (game.depth > zone.shortcutDepth + 4 && game.depth < zone.shortcutDepth + 22 && nearMouth && game.vDepth > .2) {
      game.depth = Math.min(game.dive.maxDepth - 8, game.depth + 128);
      game.x = clamp(game.x + (zone.shortcutX > 0 ? -3 : 3), -zone.width * .5 + 3.3, zone.width * .5 - 3.3);
      game.shortcutUsed = true;
      game.cameraDip = -.3;
      kit.audio.sfx('survey', { volume: .48, rate: 1.15 });
      setMessage('ROUTE CUT  +128M', 2.4);
    }
  }
  function updateTutorial() {
    if (profile.tutorialSeen || game.mode !== 'dive') return;
    if (game.tutorialStep === 0 && game.tutorialBallastSeen && game.depth > 5) game.tutorialStep = 1;
    else if (game.tutorialStep === 1 && !game.ballastTarget && game.depth > 8) game.tutorialStep = 2;
    else if (game.tutorialStep === 2 && game.tutorialPingSeen) game.tutorialStep = 3;
    else if (game.tutorialStep === 3 && game.tutorialSteerSeen) game.tutorialStep = 4;
    else if (game.tutorialStep === 4 && game.tutorialPickupSeen) game.tutorialStep = 5;
  }
  function tutorialPrompt() {
    if (game.tutorialStep === 0) return 'HOLD BALLAST TO SINK';
    if (game.tutorialStep === 1) return 'RELEASE TO RISE';
    if (game.tutorialStep === 2) return 'PING TO REVEAL';
    if (game.tutorialStep === 3) return 'DRAG TO STEER';
    if (game.tutorialStep === 4) return 'FOLLOW THE GLOW: TAKE SALVAGE';
    return 'COMPLETE OBJECTIVE, THEN SURFACE';
  }
  function updateEconomy(dt) {
    game.air -= dt * (1 + game.zoneIndex * .11 + game.depth / Math.max(1, game.dive.maxDepth) * .17);
    if (game.dive.rescue && !game.rescueRecovered) game.rescueTime -= dt;
    if (game.air <= 0) { game.air = 0; endDive(false, 'AIR EXHAUSTED'); }
    else if (game.rescueTime <= 0 && game.dive.rescue && !game.rescueRecovered) endDive(false, 'RESCUE WINDOW LOST');
    else if (game.hull <= 0) { game.hull = 0; endDive(false, 'HULL FAILURE'); }
  }
  function updateObjective(dt) {
    if (game.mode !== 'dive') return;
    if (surfaceDepth()) {
      if (game.objectiveComplete) endDive(true, 'SURFACE SECURE');
      else if (game.messageUntil < simTime) setMessage(game.dive.objectiveType === 'beacons' ? 'MORE BEACONS' : 'OBJECTIVE INCOMPLETE', 1.6);
    }
    if (game.depth > game.dive.maxDepth - 6 && !game.objectiveComplete) {
      if (game.dive.objectiveType === 'rescue') setMessage('MAX DEPTH  //  FIND POD', 1.6);
    }
    const lm = game.zone.landmarkDepth;
    if (game.lastLandmark < 0 && game.depth > lm - 8) { game.lastLandmark = game.zoneIndex; setMessage('LANDMARK  //  ' + game.zone.landmark, 2.8); }
  }
  function step(dt) {
    simTime += dt;
    if (game.mode === 'dive') {
      if (DEBUG_STATE.forceZone !== null) { const forced = forcedZoneIndex(); if (forced !== game.zoneIndex) { game.zoneIndex = forced; game.zone = zoneAt(forced); buildZone(forced); } }
      updateSub(dt); updatePings(dt); updatePressure(dt); updateFauna(dt); updatePickups(dt); updateShortcut(); updateTutorial(); updateParticles(dt); updateEconomy(dt); updateObjective(dt);
      if (game.pingCooldown > 0) game.pingCooldown -= dt;
    } else { updateParticles(dt); processDockKeys(); }
    processActions();
    syncDebug(); renderHUD();
  }
  function forcedZoneIndex() { if (DEBUG_STATE.forceZone === null || DEBUG_STATE.forceZone === undefined || DEBUG_STATE.forceZone === '') return game.zoneIndex; const z = zoneAt(DEBUG_STATE.forceZone); for (let i = 0; i < ZONES.length; i++) if (ZONES[i] === z) return i; return 0; }

  function startDive(index) {
    const i = clamp(safeInt(index, 0, DIVES.length - 1) ? index : 0, 0, profile.unlocked);
    selectedDive = i; game.diveIndex = i; game.dive = diveAt(i); const forced = DEBUG_STATE.forceZone !== null ? forcedZoneIndex() : game.dive.zone; game.zoneIndex = forced; game.zone = zoneAt(forced); game.mode = 'dive'; game.depth = 0; game.airMax = game.dive.air + profile.upgrades.air * 18; game.air = game.airMax; game.hullMax = 1; game.hull = 1; game.carried = 0; game.survey = 0; game.rescueRecovered = false; game.rescueTime = game.dive.timer || 0; game.vDepth = 0; game.x = 0; game.y = 0; game.vx = 0; game.vy = 0; game.ballast = 0; game.ballastTarget = 0; game.trim = 0; game.pitch = 0; game.pingCharges = 3; game.pingCooldown = 0; game.contactWarning = false; game.message = ''; game.messageUntil = 0; game.pressureTone = 0; game.lastLandmark = -1; game.objectiveComplete = false; game.result = null; game.shortcutUsed = false; game.shortcutNotice = 0; game.animState = 'idle'; game.animClock = 0; game.cameraDip = 0; game.forceFaunaApplied = null; game.tutorialStep = profile.tutorialSeen ? 5 : 0; game.tutorialBallastSeen = false; game.tutorialPingSeen = false; game.tutorialSteerSeen = false; game.tutorialPickupSeen = false; coachStep = -1; coachUntil = 0; playerRig.position.set(0, 0, 0); playerRig.rotation.set(0, 0, 0); subModel.visible = true; buildZone(forced); showBanner(game.dive.name, game.zone.name + '  //  ' + game.zone.landmark); dom.dock.classList.remove('visible'); dom.result.classList.remove('visible'); dom.controls.style.display = 'flex'; kit.audio.music('deep-drone', 700);
  }
  function endDive(success, reason) {
    if (game.mode !== 'dive') return;
    game.mode = 'result'; game.objectiveComplete = success || game.objectiveComplete; const d = game.dive; const depthTier = game.depth >= d.depthGoal ? 3 : game.depth >= d.depthGoal * .72 ? 2 : 1; const airRatio = game.air / Math.max(1, game.airMax); const airTier = airRatio >= .4 ? 3 : airRatio >= .2 ? 2 : 1; const salvageTier = game.carried >= d.salvageGoal ? 3 : game.carried > 0 ? 2 : 1; const banked = success ? game.carried + (game.rescueRecovered ? 2 : 0) + (game.survey >= d.goal && d.objectiveType === 'beacons' ? 2 : 0) : 0;
    if (success) { profile.salvage = clamp(profile.salvage + banked, 0, 999999); profile.bestDepth[game.diveIndex] = Math.max(profile.bestDepth[game.diveIndex], Math.floor(game.depth)); profile.medals[game.diveIndex] = Math.max(profile.medals[game.diveIndex], Math.min(depthTier, airTier, salvageTier)); if (game.diveIndex === profile.unlocked && profile.unlocked < DIVES.length - 1) profile.unlocked++; if (!profile.tutorialSeen && game.tutorialStep >= 5) profile.tutorialSeen = true; persist(); kit.audio.sfx('surface', { volume: .9 }); } else { kit.audio.sfx('failure', { volume: .8 }); }
    clearTransientQueue();
    coachUntil = 0;
    dom.banner.classList.remove('show');
    bannerUntil = 0;
    game.result = { success: success, reason: reason || (success ? 'SURFACE SECURE' : 'DIVE LOST'), depthTier: depthTier, airTier: airTier, salvageTier: salvageTier, banked: banked };
    dom.result.classList.add('visible'); dom.controls.style.display = 'none'; renderResult();
  }

  function updateRevealVisuals() {
    for (let i = 0; i < revealables.length; i++) {
      const rec = revealables[i]; const distance = rec.object.position.distanceTo(playerRig.position); const near = clamp(1 - distance / 62, 0, 1) * .17; const echo = rec.litAt > -900 ? Math.exp(-Math.max(0, simTime - rec.litAt) / (rec.kind === 'fauna' ? 4.2 : 3.1)) : 0; const alpha = clamp(Math.max(near, echo * rec.base), 0, rec.base); for (let j = 0; j < rec.mats.length; j++) rec.mats[j].opacity = alpha;
    }
  }
  function renderScene(pulse) {
    if (pulse && pulse.frozen) { renderer.render(scene, camera); return; }
    const targetFov = 55 + clamp(Math.abs(game.vDepth) / 18, 0, 1) * 5;
    camera.fov = damp(camera.fov, targetFov, 4, 1 / 60); camera.updateProjectionMatrix();
    game.cameraDip = damp(game.cameraDip, 0, 7, 1 / 60);
    cameraGoal.set(playerRig.position.x + game.vx * .5, playerRig.position.y + 5.1 + game.cameraDip, playerRig.position.z + 13.5);
    camera.position.lerp(cameraGoal, .075);
    cameraLook.set(playerRig.position.x + game.vx * .9, playerRig.position.y - .4 + game.vDepth * .08 + game.cameraDip * .25, playerRig.position.z - 16 - game.vDepth * .16);
    camera.lookAt(cameraLook); camera.position.x += pulse ? pulse.dx * .012 : 0; camera.position.y += pulse ? pulse.dy * .012 : 0;
    updateRevealVisuals(); renderer.render(scene, camera);
  }

  const dom = {
    airValue: document.getElementById('airValue'), airFill: document.getElementById('airFill'), mission: document.getElementById('mission'), missionName: document.getElementById('missionName'), zoneName: document.getElementById('zoneName'), depthValue: document.getElementById('depthValue'), depthFill: document.getElementById('depthFill'), pressureValue: document.getElementById('pressureValue'), pressureFill: document.getElementById('pressureFill'), pressureMeter: document.getElementById('pressureMeter'), pressureTick: document.getElementById('pressureTick'), hullValue: document.getElementById('hullValue'), contactState: document.getElementById('contactState'), objective: document.getElementById('objective'), eventChip: document.getElementById('eventChip'), coach: document.getElementById('coach'), banner: document.getElementById('banner'), bannerTitle: document.getElementById('bannerTitle'), bannerSub: document.getElementById('bannerSub'), ballastLabel: document.getElementById('ballastLabel'), ballastFill: document.getElementById('ballastFill'), sonarText: document.getElementById('sonarText'), controls: document.getElementById('controls'), dock: document.getElementById('dock'), result: document.getElementById('result'), diveCards: document.getElementById('diveCards'), dockStats: document.getElementById('dockStats'), launchButton: document.getElementById('launchButton'), airUpgrade: document.getElementById('airUpgrade'), hullUpgrade: document.getElementById('hullUpgrade'), resultTitle: document.getElementById('resultTitle'), resultSub: document.getElementById('resultSub'), depthMedal: document.getElementById('depthMedal'), airMedal: document.getElementById('airMedal'), salvageMedal: document.getElementById('salvageMedal'), resultNote: document.getElementById('resultNote'), dockButton: document.getElementById('dockButton'), againButton: document.getElementById('againButton'), ballastControl: document.getElementById('ballastControl'), sonarControl: document.getElementById('sonarControl'), settingsControl: document.getElementById('settingsControl')
  };
  function renderHUD() {
    document.documentElement.classList.toggle('reduced-motion', kit.juice.enabled === false);
    const d = game.dive;
    const inDive = game.mode === 'dive';
    const zone = zoneAt(game.zoneIndex);
    if (bannerUntil < simTime) dom.banner.classList.remove('show');
    updateTransient();
    const bannerLive = dom.banner.classList.contains('show') && bannerUntil >= simTime;
    if (inDive && !profile.tutorialSeen && coachStep !== game.tutorialStep && !bannerLive && !activeTransient) {
      coachStep = game.tutorialStep;
      coachUntil = simTime + 3.6;
      dom.coach.classList.remove('show');
      void dom.coach.offsetWidth;
      dom.coach.classList.add('show');
    }
    const coachLive = inDive && !profile.tutorialSeen && !bannerLive && !activeTransient && simTime < coachUntil;
    const chipLive = inDive && !bannerLive && !!activeTransient && !coachLive;
    dom.mission.classList.toggle('in-dive', inDive);
    setText(dom.missionName, inDive ? d.name : game.mode === 'result' ? 'MISSION DEBRIEF' : 'DRY DOCK');
    setText(dom.zoneName, inDive ? zone.name : 'SONAR SYSTEM STANDBY');
    setText(dom.airValue, inDive ? Math.ceil(game.air) : '--');
    dom.airFill.style.width = (inDive ? clamp(game.air / Math.max(1, game.airMax), 0, 1) : 0) * 100 + '%';
    dom.airFill.style.backgroundColor = game.air < 20 && inDive ? '#ff6178' : '#65e5ef';
    setText(dom.depthValue, (inDive ? Math.floor(game.depth) : 0) + ' M');
    dom.depthFill.style.width = (inDive ? clamp(game.depth / Math.max(1, d.maxDepth), 0, 1) : 0) * 100 + '%';
    setText(dom.pressureValue, inDive ? Math.round(game.pressure * 100) + '%' : '0%');
    dom.pressureFill.style.width = (inDive ? clamp(game.pressure, 0, 1.14) / 1.14 : 0) * 100 + '%';
    dom.pressureTick.style.left = (100 / 1.14) + '%';
    dom.pressureMeter.classList.toggle('red', inDive && game.pressure > .96);
    setText(dom.hullValue, inDive ? Math.max(0, Math.round(game.hull * 100)) + '%' : '100%');
    dom.contactState.classList.toggle('show', inDive && game.contactWarning);
    setText(dom.objective, inDive ? objectiveText() : 'CHART A DIVE');
    dom.coach.classList.toggle('show', coachLive);
    setText(dom.coach, inDive ? tutorialPrompt() : '');
    dom.eventChip.classList.toggle('show', chipLive);
    setText(dom.eventChip, chipLive ? activeTransient.text : '');
    setText(dom.ballastLabel, '▼ ' + Math.round(game.ballast * 100) + '%');
    dom.ballastFill.style.width = game.ballast * 100 + '%';
    setText(dom.sonarText, inDive ? game.pingCharges + (game.pingCooldown > 0 ? ' · ' + game.pingCooldown.toFixed(1) : '') : 'READY');
    dom.ballastControl.classList.toggle('held', inDive && game.ballastTarget > .5);
  }
  function renderResult() {
    const r = game.result || { success: false, reason: 'DIVE LOST', depthTier: 1, airTier: 1, salvageTier: 1, banked: 0 }; setText(dom.resultTitle, r.success ? 'SALVAGE BANKED +' + r.banked : r.reason); setText(dom.resultSub, r.success ? game.dive.name + '  //  ' + game.zone.name : 'SALVAGE LOST BELOW THE REDLINE'); setText(dom.depthMedal, r.depthTier + '/3'); setText(dom.airMedal, r.airTier + '/3'); setText(dom.salvageMedal, r.salvageTier + '/3'); setText(dom.resultNote, r.success ? (game.diveIndex < DIVES.length - 1 ? 'Route unlocked: ' + diveAt(game.diveIndex + 1).name : 'Final route complete. Dry dock upgrades remain active.') : 'Use the sonar caches and air tanks. Every route has generous drops.');
  }
  function renderDock() {
    dom.diveCards.replaceChildren();
    for (let i = 0; i < DIVES.length; i++) {
      const d = diveAt(i), z = zoneAt(d.zone), button = document.createElement('button'); button.className = 'dive-card' + (i === selectedDive ? ' selected' : '') + (i > profile.unlocked ? ' locked' : ''); button.type = 'button'; button.dataset.index = i; button.innerHTML = '<b>' + d.name + '</b><em>' + z.name + '</em><span>' + (i > profile.unlocked ? 'LOCKED - COMPLETE THE PREVIOUS ROUTE' : d.objective) + '</span>';
      if (i <= profile.unlocked) bindAction(button, { type: 'select', index: i }, 'dive-card'); dom.diveCards.appendChild(button);
    }
    const d = diveAt(selectedDive), z = zoneAt(d.zone); setText(dom.dockStats, 'BANKED SALVAGE  ' + profile.salvage + '  //  BEST DEPTH  ' + profile.bestDepth[selectedDive] + ' M  //  MEDAL  ' + profile.medals[selectedDive] + '/3\n' + z.landmark + '  //  SHORTCUT: ' + z.shortcut); const airCost = 4 + profile.upgrades.air * 3, hullCost = 5 + profile.upgrades.hull * 4; dom.airUpgrade.disabled = profile.upgrades.air >= 5 || profile.salvage < airCost; dom.hullUpgrade.disabled = profile.upgrades.hull >= 5 || profile.salvage < hullCost; setText(dom.airUpgrade, 'AIR TANKS LV ' + profile.upgrades.air + '  //  COST ' + airCost + '\n+' + 18 + ' SEC PER LEVEL'); setText(dom.hullUpgrade, 'HULL PLATING LV ' + profile.upgrades.hull + '  //  COST ' + hullCost + '\n+' + 115 + ' M REDLINE'); dom.launchButton.disabled = selectedDive > profile.unlocked;
  }
  function showDock() { game.mode = 'dock'; dom.dock.classList.add('visible'); dom.result.classList.remove('visible'); dom.controls.style.display = 'none'; renderDock(); renderHUD(); }

  function bindAction(element, action, zoneName) {
    element.addEventListener('pointerdown', function (event) { event.preventDefault(); queuedAction = action; const p = kit.input.pointers.get(event.pointerId); if (p) p.zone = zoneName || 'ui'; else window.setTimeout(function () { const delayed = kit.input.pointers.get(event.pointerId); if (delayed) delayed.zone = zoneName || 'ui'; }, 0); }, { passive: false });
  }
  window.addEventListener('pointerdown', function (event) {
    userInteracted = true;
    const target = event.target && event.target.closest ? event.target.closest('#ballastControl, #sonarControl, #settingsControl, #launchButton, #airUpgrade, #hullUpgrade, #dockButton, #againButton, .dive-card') : null;
    if (!target) return;
    const pointer = kit.input.pointers.get(event.pointerId);
    if (!pointer) return;
    if (target.id === 'ballastControl') pointer.zone = 'ballast';
    else if (target.id === 'sonarControl') pointer.zone = 'sonar';
    else if (target.classList.contains('dive-card')) pointer.zone = 'dive-card';
    else pointer.zone = 'ui';
  }, { passive: true });
  window.addEventListener('keydown', function () { userInteracted = true; }, { passive: true });
  bindAction(dom.ballastControl, { type: 'noop' }, 'ballast');
  bindAction(dom.sonarControl, { type: 'ping' }, 'sonar');
  bindAction(dom.settingsControl, { type: 'settings' }, 'settings');
  bindAction(dom.launchButton, { type: 'launch' }, 'launch');
  bindAction(dom.airUpgrade, { type: 'upgrade', key: 'air' }, 'upgrade');
  bindAction(dom.hullUpgrade, { type: 'upgrade', key: 'hull' }, 'upgrade');
  bindAction(dom.dockButton, { type: 'dock' }, 'dock');
  bindAction(dom.againButton, { type: 'again' }, 'again');
  function openSettings() {
    kit.openSettings([function (box) {
      function volumeRow(label, get, set) {
        const button = document.createElement('button');
        button.style.cssText = 'font:inherit;font-size:16px;color:#e8eef4;background:#1b2733;border:1px solid #2e3e4e;border-radius:10px;padding:12px 18px;min-width:min(70vw,280px);';
        function paint() { button.textContent = label + ': ' + Math.round(get() * 100) + '%'; }
        button.addEventListener('click', function () { set(get() >= .9 ? 0 : get() + .1); paint(); });
        paint(); box.appendChild(button);
      }
      volumeRow('Music volume', function () { return kit.audio.prefs.music; }, function (v) { kit.audio.setMusicVolume(v); });
      volumeRow('SFX volume', function () { return kit.audio.prefs.sfx; }, function (v) { kit.audio.setSfxVolume(v); });
    }]);
  }
  function processActions() {
    if (!queuedAction) return; const action = queuedAction; queuedAction = null;
    if (action.type === 'ping') firePing();
    else if (action.type === 'settings') openSettings();
    else if (action.type === 'select' && action.index <= profile.unlocked) { selectedDive = action.index; renderDock(); }
    else if (action.type === 'launch') kit.restart();
    else if (action.type === 'dock') { if (userInteracted) kit.audio.music('dry-dock', 500); showDock(); }
    else if (action.type === 'again') kit.restart();
    else if (action.type === 'upgrade') buyUpgrade(action.key);
  }
  function processDockKeys() {
    const launchDown = kit.input.keyDown('Enter') || kit.input.keyDown('Space');
    if (launchDown && !keyLaunchWasDown) queuedAction = { type: 'launch' };
    keyLaunchWasDown = launchDown;
  }
  function buyUpgrade(key) {
    const cost = key === 'air' ? 4 + profile.upgrades.air * 3 : 5 + profile.upgrades.hull * 4; if (profile.upgrades[key] >= 5 || profile.salvage < cost) return; profile.salvage -= cost; profile.upgrades[key]++; updateHullPlating(); persist(); kit.audio.sfx('upgrade', { volume: .8 }); showBanner('UPGRADE INSTALLED', key === 'air' ? 'AIR TANKS LV ' + profile.upgrades.air : 'HULL PLATING LV ' + profile.upgrades.hull); renderDock();
  }
  makeFaunaPool(); makeCratePool(); makeSupplyPool(); makeBeaconPool(); makeRescue();
  const soundMap = { sonar: 'assets/sonar.mp3', 'hull-creak': 'assets/hull-creak.mp3', 'fauna-call': 'assets/fauna-call.mp3', 'deep-drone': 'assets/deep-drone.mp3', 'dry-dock': 'assets/dry-dock.mp3', salvage: 'assets/salvage.mp3', 'air-pickup': 'assets/air-pickup.mp3', survey: 'assets/survey.mp3', rescue: 'assets/rescue.mp3', surface: 'assets/surface.mp3', failure: 'assets/failure.mp3', upgrade: 'assets/upgrade.mp3' };
  kit.audio.register(soundMap);
  kit.loader.show('DEEP BALLAST'); kit.loader.progress(.35); kit.loader.progress(1); kit.loader.hide();
  kit.registerPWA();
  showDock();

  function syncDebug() {
    DEBUG_STATE.mode = game.mode; DEBUG_STATE.dive = game.dive.name; DEBUG_STATE.depth = Math.floor(game.depth); DEBUG_STATE.air = Math.max(0, Math.round(game.air)); DEBUG_STATE.pressure = Number(game.pressure.toFixed(3)); DEBUG_STATE.salvage = game.mode === 'dive' ? game.carried : profile.salvage; DEBUG_STATE.zone = zoneAt(game.zoneIndex).key; DEBUG_STATE.zoneName = zoneAt(game.zoneIndex).name; DEBUG_STATE.hull = Math.max(0, Math.round(game.hull * 100)); DEBUG_STATE.ballast = Number(game.ballast.toFixed(3)); DEBUG_STATE.trim = Number(game.trim.toFixed(3)); DEBUG_STATE.rescueTime = Math.max(0, Number(game.rescueTime.toFixed(2))); DEBUG_STATE.survey = game.survey; let contacts = 0; for (let i = 0; i < fauna.length; i++) if (fauna[i].active) contacts++; DEBUG_STATE.contacts = contacts;
  }

  let last = performance.now();
  let accumulator = 0;
  function frame(now) {
    const elapsed = Math.max(0, Math.min(.066, (now - last) / 1000)); last = now; if (!kit.paused && !pausedByKit) accumulator = Math.min(accumulator + elapsed, STEP * MAX_STEPS); const juice = kit.juice.frame(); let steps = 0; if (!kit.paused && !pausedByKit) { while (accumulator >= STEP && steps < MAX_STEPS) { accumulator -= STEP; steps++; step(STEP); } } renderScene(juice); requestAnimationFrame(frame);
  }
  syncDebug(); requestAnimationFrame(frame);
}());
