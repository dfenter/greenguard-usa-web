import { createRacerWorld } from '../_shared/racer/engine.js';

(() => {
  'use strict';

  const root = document.getElementById('app');
  const canvas = document.getElementById('game');
  const fallback = document.getElementById('fallback');
  const fallbackCopy = document.getElementById('fallback-copy');
  const regionTabs = document.getElementById('region-tabs');
  const eventTabs = document.getElementById('event-tabs');
  const eventName = document.getElementById('event-name');
  const checkpointReadout = document.getElementById('checkpoint-readout');
  const timerReadout = document.getElementById('timer-readout');
  const landmarkLabel = document.getElementById('landmark-label');
  const medalLabel = document.getElementById('medal-label');
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const fuelFill = document.getElementById('fuel-fill');
  const fuelNumber = document.getElementById('fuel-number');
  const coachStrip = document.getElementById('coach-strip');
  const steerZone = document.getElementById('steer-zone');
  const steerKnob = document.getElementById('steer-knob');
  const throttleButton = document.getElementById('throttle');
  const brakeButton = document.getElementById('brake');
  const settingsButton = document.getElementById('settings');
  const routeToggle = document.getElementById('route-toggle');
  const statusEl = document.getElementById('status');
  const banner = document.getElementById('banner');
  const bannerKicker = document.getElementById('banner-kicker');
  const bannerTitle = document.getElementById('banner-title');
  const bannerCopy = document.getElementById('banner-copy');
  const result = document.getElementById('result');
  const resultKicker = document.getElementById('result-kicker');
  const resultTitle = document.getElementById('result-title');
  const resultCopy = document.getElementById('result-copy');
  const resultAction = document.getElementById('result-action');
  const resultSecondary = document.getElementById('result-secondary');
  const compassArrow = document.getElementById('compass-arrow');
  const compassDistance = document.getElementById('compass-distance');
  const contactFlash = document.getElementById('contact-flash');
  const liveryButton = document.getElementById('livery-button');
  const endRunButton = document.getElementById('end-run');
  const pauseButton = document.getElementById('pause-button');
  const titleScreen = document.getElementById('title-screen');
  const titlePlay = document.getElementById('title-play');
  const tutorialScreen = document.getElementById('tutorial-screen');
  const tutorialStart = document.getElementById('tutorial-start');
  const tutorialSteps = [...document.querySelectorAll('.tutorial-step')];
  const pausePanel = document.getElementById('pause-panel');
  const pauseResume = document.getElementById('pause-resume');
  const pauseRestart = document.getElementById('pause-restart');
  const pauseBank = document.getElementById('pause-bank');

  const TAU = Math.PI * 2;
  const STEP = 1 / 60;
  const WORLD_LIMIT = 35;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
  const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
  const direction = (angle) => ({ x: Math.sin(angle), z: Math.cos(angle) });
  const rightOf = (angle) => ({ x: Math.cos(angle), z: -Math.sin(angle) });
  const setTextIfChanged = (element, value) => {
    const next = String(value);
    if (element.textContent !== next) element.textContent = next;
  };

  const NIGHT_SHOWCASE_ROUTE = [
    { x: -25, z: 18 }, { x: -17, z: 5 }, { x: -7, z: -9 }, { x: 8, z: -16 }, { x: 23, z: -8 },
    { x: 24, z: 8 }, { x: 13, z: 19 }, { x: -6, z: 23 }, { x: -22, z: 14 }, { x: -30, z: 2 }, { x: -20, z: -12 },
  ];

  const REGIONS = [
    {
      id: 'dawn-dune-sea', short: 'DAWN SEA', name: 'DAWN DUNE SEA', subtitle: 'Amber first light', landmark: 'DUNE ARCH',
      origin: { x: -105, z: -48 }, start: { x: -25, z: 22 },
      palette: { sky: '#d9966a', horizon: '#f4c68f', ground: '#b67846', road: '#dca66a', trim: '#f6d28d', accent: '#ffd064', fog: '#d99c70' },
      route: [{ x: -25, z: 22 }, { x: -14, z: 13 }, { x: 2, z: 10 }, { x: 21, z: 1 }, { x: 12, z: -14 }, { x: -6, z: -17 }, { x: -25, z: -5 }],
      shortcut: { from: { x: -18, z: 10 }, to: { x: 2, z: -1 }, label: 'ARCH CUT' },
      oasis: { x: -27, z: 24, name: 'CINDER WELL' },
      event: { id: 'checkpoint-raid', kind: 'raid', label: 'CHECKPOINT RAID', time: 78, gold: 38, silver: 20, hazardCount: 1, rivalPace: .068 },
      events: [
        { id: 'checkpoint-raid', kind: 'raid', label: 'CHECKPOINT RAID', time: 78, gold: 38, silver: 20, hazardCount: 1, rivalPace: .068 },
        { id: 'arch-sprint', kind: 'time', label: 'ARCH SPRINT', time: 74, gold: 42, silver: 58, hazardCount: 2, rivalPace: .092 },
        { id: 'cinder-salvage', kind: 'salvage', label: 'CINDER SALVAGE', time: 90, gold: 62, silver: 34, hazardCount: 2, rivalPace: .06 },
      ],
      landmarkPos: { x: 15, z: -4 },
    },
    {
      id: 'redglass-wash', short: 'REDGLASS', name: 'REDGLASS WASH', subtitle: 'Canyon wall draft', landmark: 'WRECK FIELD',
      origin: { x: 105, z: -48 }, start: { x: -25, z: 21 },
      palette: { sky: '#a75e58', horizon: '#e29a72', ground: '#70453e', road: '#bc7954', trim: '#f1b27a', accent: '#ff9c61', fog: '#a9655d' },
      route: [{ x: -25, z: 21 }, { x: -13, z: 14 }, { x: 2, z: 15 }, { x: 22, z: 7 }, { x: 18, z: -7 }, { x: 3, z: -16 }, { x: -16, z: -15 }, { x: -27, z: -3 }],
      shortcut: { from: { x: -6, z: 14 }, to: { x: 8, z: -1 }, label: 'WRECK CUT' },
      oasis: { x: -27, z: 23, name: 'REDGLASS SPRING' },
      event: { id: 'time-attack', kind: 'time', label: 'TIME ATTACK', time: 82, gold: 46, silver: 62, hazardCount: 2, rivalPace: .098 },
      events: [
        { id: 'time-attack', kind: 'time', label: 'TIME ATTACK', time: 82, gold: 46, silver: 62, hazardCount: 2, rivalPace: .098 },
        { id: 'wreck-raid', kind: 'raid', label: 'WRECK RAID', time: 86, gold: 45, silver: 26, hazardCount: 3, rivalPace: .075 },
      ],
      landmarkPos: { x: 13, z: 5 },
    },
    {
      id: 'white-salt-flat', short: 'SALT FLAT', name: 'WHITE SALT FLAT', subtitle: 'Hardpack horizon', landmark: 'SALT NEEDLES',
      origin: { x: -105, z: 58 }, start: { x: -25, z: 20 },
      palette: { sky: '#8ca9b2', horizon: '#d9e1d2', ground: '#c0c8b2', road: '#eff0d1', trim: '#ffffff', accent: '#8ce7dd', fog: '#b7c8c2' },
      route: [{ x: -25, z: 20 }, { x: -9, z: 18 }, { x: 9, z: 20 }, { x: 26, z: 11 }, { x: 17, z: -2 }, { x: -1, z: -10 }, { x: -22, z: -6 }, { x: -27, z: 8 }],
      shortcut: { from: { x: -4, z: 18 }, to: { x: 12, z: 5 }, label: 'SALT SLING' },
      oasis: { x: -27, z: 22, name: 'MIRROR TANK' },
      event: { id: 'salvage-run', kind: 'salvage', label: 'SALVAGE RUN', time: 96, gold: 52, silver: 29, hazardCount: 2, rivalPace: .07 },
      events: [
        { id: 'salvage-run', kind: 'salvage', label: 'SALVAGE RUN', time: 96, gold: 52, silver: 29, hazardCount: 2, rivalPace: .07 },
        { id: 'needle-sprint', kind: 'time', label: 'NEEDLE SPRINT', time: 88, gold: 48, silver: 66, hazardCount: 3, rivalPace: .105 },
      ],
      landmarkPos: { x: 18, z: -12 },
    },
    {
      id: 'night-oasis-ring', short: 'NIGHT RING', name: 'NIGHT OASIS RING', subtitle: 'Blue hour floodline', landmark: 'OASIS GROVE',
      origin: { x: 105, z: 58 }, start: { x: -25, z: 18 },
      palette: { sky: '#17284a', horizon: '#315e76', ground: '#3a4f4b', road: '#6d8b7c', trim: '#9cd8c3', accent: '#72e6dd', fog: '#254654' },
      route: [{ x: -25, z: 18 }, { x: -17, z: 5 }, { x: -7, z: -9 }, { x: 8, z: -16 }, { x: 23, z: -8 }, { x: 24, z: 8 }, { x: 13, z: 19 }, { x: -6, z: 23 }],
      showcaseRoute: NIGHT_SHOWCASE_ROUTE,
      shortcut: { from: { x: 1, z: 18 }, to: { x: 8, z: 2 }, label: 'PALM CUT' },
      oasis: { x: 1, z: 4, name: 'BLUE HOLLOW' },
      event: { id: 'night-raid', kind: 'raid', label: 'NIGHT RAID', time: 90, gold: 47, silver: 25, hazardCount: 3, rivalPace: .082 },
      events: [
        { id: 'night-raid', kind: 'raid', label: 'NIGHT RAID', time: 90, gold: 47, silver: 25, hazardCount: 3, rivalPace: .082 },
        { id: 'oasis-loop', kind: 'time', label: 'OASIS LOOP', time: 104, gold: 55, silver: 78, hazardCount: 4, rivalPace: .11 },
        { id: 'showcase-raid', kind: 'showcase', label: 'SHOWCASE RAID', time: 112, gold: 61, silver: 36, hazardCount: 5, rivalPace: .09, route: NIGHT_SHOWCASE_ROUTE },
      ],
      final: { id: 'showcase-raid', kind: 'showcase', label: 'SHOWCASE RAID', time: 112, gold: 61, silver: 36, hazardCount: 5, rivalPace: .09, route: NIGHT_SHOWCASE_ROUTE },
      landmarkPos: { x: 1, z: 4 },
    },
  ];

  const MEDAL_RANK = { unset: 0, bronze: 1, silver: 2, gold: 3 };
  const VALID_LIVERIES = new Set(['sandfox', 'saltline', 'nightburn']);
  const VALID_MEDALS = new Set(['bronze', 'silver', 'gold']);
  const VALID_EVENT_KEYS = new Set(REGIONS.flatMap((region) => (region.events || [region.event, region.final].filter(Boolean)).map((event) => region.id + ':' + event.id)));
  const defaultProgress = {
    best: 0,
    regionUnlocked: 0,
    showcaseUnlocked: false,
    livery: 'sandfox',
    tutorialSeen: false,
    unlockedLiveries: ['sandfox'],
    medals: {},
    bestTimes: {},
  };
  const isRecord = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
  const isValidSave = (value) => {
    if (!isRecord(value) || !Number.isFinite(value.best) || value.best < 0 || !Number.isInteger(value.regionUnlocked) || value.regionUnlocked < 0 || value.regionUnlocked > REGIONS.length || typeof value.showcaseUnlocked !== 'boolean' || !VALID_LIVERIES.has(value.livery) || typeof value.tutorialSeen !== 'boolean' || !Array.isArray(value.unlockedLiveries) || value.unlockedLiveries.length < 1 || !value.unlockedLiveries.includes(value.livery) || value.unlockedLiveries.some((livery) => !VALID_LIVERIES.has(livery)) || !isRecord(value.medals) || !isRecord(value.bestTimes)) return false;
    return Object.entries(value.medals).every(([key, medal]) => VALID_EVENT_KEYS.has(key) && VALID_MEDALS.has(medal)) && Object.entries(value.bestTimes).every(([key, time]) => VALID_EVENT_KEYS.has(key) && Number.isFinite(time) && time >= 0);
  };

  const kit = GGKit.create({
    slug: 'dune-runner',
    orientation: 'landscape',
    validateSave: isValidSave,
    onPause: () => { root.classList.add('kit-paused'); if (racer) racer.world.setPaused(true); },
    onResume: () => { root.classList.remove('kit-paused'); if (racer) racer.world.setPaused(false); },
    onRestart: () => { launchEvent(activeRegionIndex, activeEventId, false); },
  });

  const loaded = kit.save.get(defaultProgress);
  const progress = {
    best: Number(loaded.best) || 0,
    regionUnlocked: clamp(Math.floor(Number(loaded.regionUnlocked) || 0), 0, REGIONS.length),
    showcaseUnlocked: loaded.showcaseUnlocked === true,
    livery: VALID_LIVERIES.has(loaded.livery) ? loaded.livery : 'sandfox',
    tutorialSeen: loaded.tutorialSeen === true,
    unlockedLiveries: [...new Set((loaded.unlockedLiveries || ['sandfox']).filter((livery) => VALID_LIVERIES.has(livery)))],
    medals: { ...(loaded.medals || {}) },
    bestTimes: { ...(loaded.bestTimes || {}) },
  };
  const probeState = { mode: 'boot', fuel: 100, checkpoint: 0, region: REGIONS[0].id, score: 0 };
  const bootRequest = window.__dr && typeof window.__dr._boot === 'function' ? window.__dr._boot() : {};

  let racer = null;
  let racerTrackJSON = null;
  const trackDataByEvent = new Map();
  const racerFrame = {
    carState: { position: { x: 0, y: 0, z: 0 }, progress: 0, speed: 0, steering: 0, acceleration: 0, lateralG: 0, suspension: 0, brake: 0, boost: 0, yaw: 0, pitch: 0, roll: 0 },
    rivals: [{ progress: 0, speed: 0, steering: 0, brake: 0, boost: 0 }],
  };
  let reducedMotion = false;
  let motionQuery = null;
  let activeRegionIndex = 0;
  let activeEventId = REGIONS[0].event.id;
  let currentRegion = REGIONS[0];
  let currentEvent = REGIONS[0].event;
  let simClock = 0;
  let score = 0;
  let statusUntil = 0;
  let statusMessage = '';
  const statusQueue = [];
  let coachUntil = 3;
  let lastUiClock = -1;
  let lowFuelCooldown = 0;
  let oasisSoundCooldown = 0;
  let surfaceName = '';
  let bannerSerial = 0;
  let accumulator = 0;
  let lastFrame = performance.now();
  let lastForcedEvent = null;
  let titleActive = true;
  let resultContext = 'event';
  let tutorialChoice = 'steer';
  let visualSeed = 0x9e3779b9;
  let gamepadConnected = false;
  let lastControls = { steer: 0, throttle: false, brake: false };

  const player = {
    x: REGIONS[0].start.x, z: REGIONS[0].start.z, yaw: 0.68,
    vx: 0, vz: 0, fuel: 100, airTime: 0, airHeight: 0, verticalSpeed: 0,
    speed: 0, slip: 0, boost: 0, landingQuality: 0, lastHeight: 0, jumpCooldown: 0,
  };
  const visual = {
    roll: 0, pitch: 0, targetRoll: 0, targetPitch: 0, landingDip: 0,
    steering: 0, previousSpeed: 0,
  };
  const run = {
    mode: 'countdown', countdown: 2.5, timer: 78, checkpoint: 0, lap: 0, collected: 0,
    total: 0, elapsed: 0, scoreAtStart: 0, medal: 'unset', stranded: 0,
    shortcutUsed: false, boostTimer: 0, hazardCooldown: 0, rivalProgress: 0, rivalFinished: false,
  };

  function visualRandom() {
    visualSeed = (Math.imul(1664525, visualSeed) + 1013904223) >>> 0;
    return visualSeed / 4294967296;
  }

  function saveProgress() {
    kit.save.set({ ...progress, medals: { ...progress.medals }, bestTimes: { ...progress.bestTimes } });
  }

  function clearStatus() {
    statusQueue.length = 0;
    statusMessage = '';
    statusUntil = 0;
    statusEl.classList.remove('show');
  }

  function pumpStatus() {
    if (statusUntil > simClock || banner.classList.contains('show')) return;
    const next = statusQueue.shift();
    if (!next) {
      statusEl.classList.remove('show');
      return;
    }
    statusMessage = next.message;
    statusUntil = simClock + next.hold;
    statusEl.classList.add('show');
    setTextIfChanged(statusEl, statusMessage);
  }

  function showStatus(message, seconds = 1) {
    const nextMessage = String(message || '').trim();
    if (!nextMessage || (statusMessage === nextMessage && statusUntil > simClock) || statusQueue.some((item) => item.message === nextMessage)) return;
    statusQueue.push({ message: nextMessage, hold: clamp(Number(seconds) || 1, .35, 1) });
    if (statusQueue.length > 4) statusQueue.shift();
    pumpStatus();
  }

  function showBanner(kicker, title, copy = '') {
    if (run.mode === 'running') return;
    clearStatus();
    bannerSerial += 1;
    const serial = bannerSerial;
    bannerKicker.textContent = kicker;
    bannerTitle.textContent = title;
    bannerCopy.textContent = copy;
    const reducedMotion = !kit.juice.enabled || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    banner.classList.toggle('reduced-motion', reducedMotion);
    banner.classList.remove('show');
    void banner.offsetWidth;
    banner.classList.add('show');
    window.setTimeout(() => { if (serial === bannerSerial) banner.classList.remove('show'); }, reducedMotion ? 1100 : 1300);
  }

  function regionFor(value) {
    if (Number.isFinite(Number(value))) return REGIONS[clamp(Math.floor(Number(value)), 0, REGIONS.length - 1)];
    const raw = String(value || '').toLowerCase().replace(/[ _]+/g, '-');
    return REGIONS.find((region) => region.id === raw || region.short.toLowerCase() === raw || region.name.toLowerCase() === raw || region.id.includes(raw)) || REGIONS[0];
  }

  function regionEvents(region) {
    return region.events || [region.event, region.final].filter(Boolean);
  }

  function activeRoute(region = currentRegion, event = currentEvent) {
    return region === currentRegion && event && event.route ? event.route : region.route;
  }

  function eventFor(region, value) {
    const raw = String(value || '').toLowerCase().replace(/[ _]+/g, '-');
    const choices = regionEvents(region);
    return choices.find((event) => event.id === raw || event.kind === raw || event.label.toLowerCase() === raw || event.id.includes(raw)) || region.event;
  }

  function eventKey(region, event) { return region.id + ':' + event.id; }

  function isEventUnlocked(regionIndex, event) {
    if (event.kind === 'showcase') return progress.showcaseUnlocked || regionIndex === activeRegionIndex && lastForcedEvent === event.id;
    return regionIndex <= progress.regionUnlocked || regionIndex === activeRegionIndex;
  }

  function routeDistance(region, x, z) {
    let best = Infinity;
    const route = activeRoute(region);
    const event = region === currentRegion ? currentEvent : region.event;
    const segmentCount = event.kind === 'time' ? route.length : route.length - 1;
    for (let i = 0; i < segmentCount; i += 1) {
      const a = route[i]; const b = route[(i + 1) % route.length];
      const dx = b.x - a.x; const dz = b.z - a.z;
      const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz), 0, 1);
      best = Math.min(best, dist2(x, z, a.x + dx * t, a.z + dz * t));
    }
    return best;
  }

  function terrainHeight(region, x, z) {
    if (region.id === 'dawn-dune-sea') {
      return 1.1 * Math.sin(x * .16 + z * .025) + .72 * Math.cos(z * .2) + .35 * Math.sin((x + z) * .34) + .08 * Math.sin(x * .8);
    }
    if (region.id === 'redglass-wash') {
      const walls = Math.max(0, Math.abs(x) - 13) * .18;
      return walls + .55 * Math.sin(z * .17) + .27 * Math.cos(x * .3) + .13 * Math.sin((x - z) * .4);
    }
    if (region.id === 'white-salt-flat') {
      return .18 * Math.sin(x * .22) + .12 * Math.cos(z * .21) + .06 * Math.sin((x + z) * .5);
    }
    const ring = Math.hypot(x - 1, z - 4);
    return .38 * Math.sin(ring * .45) + .3 * Math.cos(x * .25) + .18 * Math.sin(z * .3) + (ring < 6 ? -.28 : 0);
  }

  function surfaceAt(region, x, z) {
    const routeMatch = routeDistance(region, x, z) < 3.5;
    const engineMatch = racer && racer.trackQueries
      ? !racer.trackQueries.isOffroad(worldPosition(x, z))
      : routeMatch;
    const onRoute = routeMatch && engineMatch;
    if (region.id === 'white-salt-flat') return { name: 'SALT HARDPACK', grip: .94, drag: .12, onRoute };
    if (region.id === 'redglass-wash' && onRoute) return { name: 'CANYON HARDPACK', grip: .82, drag: .18, onRoute };
    if (region.id === 'night-oasis-ring' && onRoute) return { name: 'OASIS HARDPACK', grip: .76, drag: .22, onRoute };
    return { name: 'LOOSE SAND', grip: .43, drag: .31, onRoute };
  }

  function worldPosition(x = player.x, z = player.z, yOffset = 0) {
    return { x: currentRegion.origin.x + x, y: terrainHeight(currentRegion, x, z) + yOffset, z: currentRegion.origin.z + z };
  }

  function trackIdFor(region = currentRegion, event = currentEvent) {
    return region.id + '-' + event.id;
  }

  function liveryPaint(name = progress.livery) {
    const swatches = { sandfox: 0xc67b43, saltline: 0x76c3bd, nightburn: 0xc45b63 };
    return swatches[name] || swatches.sandfox;
  }

  function buildRegionRuntime(region) {
    const route = region.route;
    const pickupData = [];
    for (let i = 1; i < route.length; i += 1) pickupData.push({ type: 'fuel', x: route[i].x + (i % 2 ? 2.6 : -2.6), z: route[i].z + (i % 2 ? -1.4 : 1.4) });
    for (let i = 0; i < route.length; i += 2) pickupData.push({ type: 'flare', x: route[i].x + 1.6, z: route[i].z - 1.8 });
    for (let i = 1; i < route.length - 1; i += 2) pickupData.push({ type: 'boost', x: route[i].x - 1.1, z: route[i].z + 1.1 });
    route.forEach((point, index) => pickupData.push({ type: 'crate', x: point.x + (index % 2 ? 4.2 : -4.2), z: point.z + (index % 3 - 1) * 2.7 }));
    return {
      flags: (region.showcaseRoute || route).map((point, index) => ({ x: point.x, z: point.z, index, active: true, progress: index / Math.max(1, (region.showcaseRoute || route).length - 1) })),
      pickups: pickupData.map((item, index) => ({ ...item, index, active: true })),
      hazards: region.route.slice(2).map((point, index) => ({ x: point.x + (index % 2 ? 1.8 : -1.8), z: point.z + (index % 3 - 1) * 1.4, index, active: false })),
    };
  }

  function initializeRegionRuntimes() {
    REGIONS.forEach((region) => { region.runtime = buildRegionRuntime(region); });
  }

  function setLivery(name) {
    const chosen = VALID_LIVERIES.has(name) && progress.unlockedLiveries.includes(name) ? name : 'sandfox';
    progress.livery = chosen;
    if (racer && racer.world.mainCar) racer.world.mainCar.setLivery({ paint: liveryPaint(chosen), accent: racerTrackJSON && racerTrackJSON.accent ? racerTrackJSON.accent : 0xf2c34e });
    saveProgress();
  }

  function cycleLivery() {
    if (progress.unlockedLiveries.length < 2) { showStatus('KIT LOCKED', 1); return; }
    const currentIndex = progress.unlockedLiveries.indexOf(progress.livery);
    const next = progress.unlockedLiveries[(currentIndex + 1) % progress.unlockedLiveries.length];
    setLivery(next); showStatus('KIT // ' + next.toUpperCase(), 1);
  }

  function refreshTrackAnchors() {
    if (!racer || !currentRegion.runtime) return;
    const runtime = currentRegion.runtime;
    runtime.flags.forEach((flag) => {
      const sample = racer.trackQueries.closestPoint(worldPosition(flag.x, flag.z));
      flag.progress = sample.progress;
    });
    runtime.pickups.forEach((pickup) => {
      const sample = racer.trackQueries.closestPoint(worldPosition(pickup.x, pickup.z));
      pickup.progress = sample.progress;
    });
    runtime.hazards.forEach((hazard) => {
      const sample = racer.trackQueries.closestPoint(worldPosition(hazard.x, hazard.z));
      hazard.progress = sample.progress;
    });
  }

  function updateRacerFrame(dt = 1 / 60) {
    if (!racer) return;
    const position = worldPosition(player.x, player.z, player.airHeight + 0.18);
    const closest = racer.trackQueries.closestPoint(position);
    const safeDt = Math.max(1 / 120, Math.min(0.05, Number(dt) || 1 / 60));
    const acceleration = (player.speed - visual.previousSpeed) / safeDt;
    racerFrame.carState.position.x = position.x;
    racerFrame.carState.position.y = position.y;
    racerFrame.carState.position.z = position.z;
    racerFrame.carState.progress = closest.progress;
    racerFrame.carState.speed = player.speed;
    racerFrame.carState.steering = visual.steering;
    racerFrame.carState.acceleration = acceleration;
    racerFrame.carState.lateralG = player.slip * player.speed;
    racerFrame.carState.suspension = player.airHeight > 0 ? 0.16 : 0;
    racerFrame.carState.brake = lastControls.brake ? 1 : 0;
    racerFrame.carState.boost = run.boostTimer > 0 ? 1 : 0;
    racerFrame.carState.yaw = player.yaw;
    racerFrame.carState.pitch = visual.pitch + visual.landingDip;
    racerFrame.carState.roll = visual.roll;
    const route = activeRoute();
    const segments = currentEvent.kind === 'time' ? route.length : Math.max(1, route.length - 1);
    const targetDistance = segments * (currentEvent.kind === 'time' ? 2 : 1);
    const rival = racerFrame.rivals[0];
    rival.progress = targetDistance > 0 ? clamp(run.rivalProgress / targetDistance, 0, 1) : 0;
    rival.speed = run.rivalFinished ? 0 : Math.max(0, currentEvent.rivalPace || 0.08) * 42;
    rival.steering = 0;
    rival.brake = 0;
    rival.boost = 0;
    if (racer.world.rivals[0]) racer.world.rivals[0].root.visible = !titleActive && run.mode !== 'result' && run.mode !== 'stranded';
    racer.world.update(racerFrame, safeDt);
  }

  function buildRacerWorld() {
    const data = trackDataByEvent.get(trackIdFor());
    if (!data) throw new Error('missing GGRacer track data for ' + trackIdFor());
    if (racer) racer.world.dispose();
    racerTrackJSON = data;
    racer = createRacerWorld({
      canvas,
      trackJSON: data,
      theme: data.theme || 'desert',
      timeOfDay: data.timeOfDay || (data.theme === 'night-city' ? 'night' : 'dusk'),
      rivalCount: 1,
      ggkit: kit,
      reducedMotion,
      paint: liveryPaint(),
      accent: data.accent || 0xf2c34e,
      seed: (activeRegionIndex + 1) * 977 + currentEvent.id.length,
    });
    racer.world.mainCar.setLivery({ paint: liveryPaint(), accent: data.accent || 0xf2c34e });
    racer.world.fx.setReducedMotion(reducedMotion);
    racer.world.setPaused(Boolean(kit.paused));
    refreshTrackAnchors();
    updateRacerFrame(1 / 60);
    racer.world.render();
  }

  function configureRegionVisuals() {
    currentRegion = REGIONS[activeRegionIndex] || REGIONS[0];
    buildRacerWorld();
  }

  function makeScene() {
    motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    reducedMotion = Boolean(motionQuery && motionQuery.matches);
    if (motionQuery && motionQuery.addEventListener) motionQuery.addEventListener('change', (event) => {
      reducedMotion = event.matches;
      if (racer) racer.world.fx.setReducedMotion(reducedMotion);
    });
    initializeRegionRuntimes();
    buildRacerWorld();
    racer.world.resize();
    kit.loader.progress(.86);
  }

  function resize() {
    if (racer) racer.world.resize();
  }

  function claimPointer(event, zone) {
    const existing = kit.input.pointers.get(event.pointerId);
    const pointer = existing || { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, downAt: performance.now(), zone: null };
    pointer.x = event.clientX; pointer.y = event.clientY; pointer.zone = zone;
    kit.input.pointers.set(event.pointerId, pointer);
    queueMicrotask(() => {
      const live = kit.input.pointers.get(event.pointerId);
      if (live) { live.x = event.clientX; live.y = event.clientY; live.zone = zone; }
    });
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function updateSteerKnob(value) {
    const radius = Math.max(22, steerZone.clientWidth * .33);
    steerKnob.style.transform = 'translate(calc(-50% + ' + (value * radius).toFixed(1) + 'px), -50%)';
  }

  function inputState() {
    const keys = (code) => kit.input.keyDown(code);
    let steer = (keys('ArrowRight') || keys('KeyD') ? 1 : 0) - (keys('ArrowLeft') || keys('KeyA') ? 1 : 0);
    let throttle = keys('ArrowUp') || keys('KeyW') || keys('Space');
    let brake = keys('ArrowDown') || keys('KeyS');
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    const pad = [...pads].find((candidate) => candidate && candidate.connected);
    if (pad) {
      gamepadConnected = true;
      if (Math.abs(pad.axes[0] || 0) > .12) steer = clamp(pad.axes[0], -1, 1);
      throttle = throttle || Boolean(pad.buttons[0]?.pressed || pad.buttons[7]?.pressed);
      brake = brake || Boolean(pad.buttons[1]?.pressed || pad.buttons[6]?.pressed);
    } else gamepadConnected = false;
    for (const pointer of kit.input.pointers.values()) {
      if (pointer.zone === 'steer') {
        const rect = steerZone.getBoundingClientRect();
        steer = clamp((pointer.x - (rect.left + rect.width * .5)) / (rect.width * .38), -1, 1);
      } else if (pointer.zone === 'throttle') throttle = true;
      else if (pointer.zone === 'brake') brake = true;
    }
    steer = clamp(steer, -1, 1);
    updateSteerKnob(steer);
    throttleButton.classList.toggle('pressed', throttle);
    brakeButton.classList.toggle('pressed', brake);
    lastControls = { steer, throttle, brake };
    return lastControls;
  }

  function bindInput() {
    steerZone.addEventListener('pointerdown', (event) => claimPointer(event, 'steer'), { passive: false });
    throttleButton.addEventListener('pointerdown', (event) => claimPointer(event, 'throttle'), { passive: false });
    brakeButton.addEventListener('pointerdown', (event) => claimPointer(event, 'brake'), { passive: false });
    root.addEventListener('pointerdown', (event) => {
      const existing = kit.input.pointers.get(event.pointerId);
      if (existing && existing.zone) return;
      if (event.clientX >= window.innerWidth * .52) return;
      const target = event.target;
      if (target && target.closest && target.closest('button, #route-dock, #hud-right, #result, #title-screen, #tutorial-screen, #pause-panel')) return;
      claimPointer(event, 'steer');
    }, { passive: false });
    root.addEventListener('pointermove', (event) => { if (kit.input.pointers.has(event.pointerId)) event.preventDefault(); }, { passive: false });
    root.addEventListener('pointerup', (event) => { if (kit.input.pointers.has(event.pointerId)) event.preventDefault(); }, { passive: false });
    root.addEventListener('pointercancel', (event) => { if (kit.input.pointers.has(event.pointerId)) event.preventDefault(); }, { passive: false });
    settingsButton.addEventListener('click', () => kit.openSettings());
    routeToggle.addEventListener('click', () => root.classList.toggle('route-open'));
    liveryButton.addEventListener('click', cycleLivery);
    pauseButton.addEventListener('click', openPauseMenu);
    endRunButton.addEventListener('click', bankSession);
    window.addEventListener('gamepadconnected', () => { gamepadConnected = true; }, { passive: true });
    window.addEventListener('gamepaddisconnected', () => { gamepadConnected = false; clearRunInput(); }, { passive: true });
  }

  function resetPickups() {
    const runtime = currentRegion.runtime;
    runtime.pickups.forEach((pickup) => { pickup.active = true; });
  }

  function syncMarkers() {
    REGIONS.forEach((region) => {
      const runtime = region.runtime;
      if (!runtime) return;
      const active = region === currentRegion;
      const route = activeRoute(region);
      runtime.flags.forEach((flag, index) => {
        const passed = index < run.checkpoint && (currentEvent.kind === 'raid' || currentEvent.kind === 'showcase' || currentEvent.kind === 'time');
        flag.active = active && index < route.length && !passed;
      });
      runtime.pickups.forEach((pickup) => { pickup.active = active && pickup.active; });
      runtime.hazards.forEach((hazard, index) => {
        hazard.active = active && index < (currentEvent.hazardCount || 0);
      });
    });
  }

  function resetPlayer() {
    const start = currentRegion.start;
    player.x = start.x; player.z = start.z; player.yaw = Math.atan2(currentRegion.route[1].x - start.x, currentRegion.route[1].z - start.z);
    player.vx = 0; player.vz = 0; player.fuel = 100; player.airTime = 0; player.airHeight = 0; player.verticalSpeed = 0; player.speed = 0; player.slip = 0; player.boost = 0; player.landingQuality = 0; player.jumpCooldown = 0;
    visual.roll = 0; visual.pitch = 0; visual.targetRoll = 0; visual.targetPitch = 0; visual.landingDip = 0; visual.steering = 0; visual.previousSpeed = 0;
  }

  function eventIsCurrent(event) { return currentEvent && currentEvent.id === event.id; }

  function launchEvent(regionIndex, eventId, announce = true) {
    activeRegionIndex = clamp(Math.floor(Number(regionIndex) || 0), 0, REGIONS.length - 1);
    currentRegion = REGIONS[activeRegionIndex];
    currentEvent = eventFor(currentRegion, eventId);
    activeEventId = currentEvent.id;
    lastForcedEvent = currentEvent.id;
    configureRegionVisuals();
    resetPlayer(); resetPickups();
    run.mode = 'countdown'; run.countdown = 2.5; run.timer = currentEvent.time; run.checkpoint = 0; run.lap = 0; run.collected = 0; run.total = activeRoute().length; run.elapsed = 0; run.scoreAtStart = score; run.medal = 'unset'; run.stranded = 0; run.shortcutUsed = false; run.boostTimer = 0; run.hazardCooldown = 0; run.rivalProgress = 0; run.rivalFinished = false;
    root.classList.remove('route-open');
    syncMarkers(); updateTabs(); hideResult();
    clearStatus();
    coachUntil = simClock + 3;
    coachStrip.classList.remove('faded');
    if (announce) showBanner('RUN START', currentEvent.label, currentRegion.short);
    kit.audio.music(currentEvent.kind === 'time' || currentEvent.kind === 'showcase' ? 'drive' : 'engine', 350);
    kit.audio.sfx('wind', { volume: .45 });
    updateProbe(); updateUi(true);
  }

  function defaultEventForRegion(index) { return REGIONS[index].event.id; }

  function nextEventTarget() {
    const events = regionEvents(currentRegion);
    const currentIndex = events.findIndex((event) => event.id === currentEvent.id);
    if (currentIndex >= 0 && currentIndex < events.length - 1 && (progress.showcaseUnlocked || events[currentIndex + 1].kind !== 'showcase')) return { region: activeRegionIndex, event: events[currentIndex + 1].id };
    if (activeRegionIndex < REGIONS.length - 1) return { region: activeRegionIndex + 1, event: defaultEventForRegion(activeRegionIndex + 1) };
    return { region: 3, event: REGIONS[3].final.id };
  }

  function medalFor(event, success) {
    if (!success) return 'unset';
    if (event.kind === 'time') {
      if (run.elapsed <= event.gold) return 'gold';
      if (run.elapsed <= event.silver) return 'silver';
      return 'bronze';
    }
    if (event.kind === 'salvage') {
      if (player.fuel >= 52) return 'gold';
      if (player.fuel >= 25) return 'silver';
      return 'bronze';
    }
    if (run.timer >= event.gold) return 'gold';
    if (run.timer >= event.silver) return 'silver';
    return 'bronze';
  }

  function clearRunInput() {
    kit.input.clearAll();
    updateSteerKnob(0);
    throttleButton.classList.remove('pressed');
    brakeButton.classList.remove('pressed');
  }

  function restartCurrentEvent() {
    kit.restart();
  }

  function bankSession() {
    if (titleActive || run.mode === 'result') return;
    clearRunInput();
    run.mode = 'result'; run.medal = 'unset'; resultContext = 'session';
    progress.best = Math.max(progress.best, score); saveProgress();
    resultKicker.textContent = 'SESSION SCORE // ' + score;
    resultTitle.textContent = 'BANKED';
    resultCopy.textContent = 'Your score is safe in the route ledger. Start a fresh session or keep this route open.';
    resultAction.textContent = 'START NEW SESSION';
    resultAction.onclick = () => { score = 0; restartCurrentEvent(); };
    resultSecondary.textContent = 'KEEP DRIVING';
    kit.audio.stopMusic(300);
    showResult(); updateProbe(); updateUi(true);
  }

  function finishEvent(success, reason) {
    if (run.mode === 'result') return;
    run.mode = 'result';
    resultContext = 'event';
    resultSecondary.textContent = 'RESTART EVENT';
    const medal = medalFor(currentEvent, success);
    run.medal = medal;
    if (success) {
      const bonus = Math.max(80, Math.round(run.timer * 9)) + (medal === 'gold' ? 240 : medal === 'silver' ? 130 : 70);
      score += bonus;
      const key = eventKey(currentRegion, currentEvent);
      if (MEDAL_RANK[medal] > MEDAL_RANK[progress.medals[key] || 'unset']) progress.medals[key] = medal;
      if (currentEvent.kind === 'time') progress.bestTimes[key] = Math.min(progress.bestTimes[key] || Infinity, run.elapsed);
      if (activeRegionIndex < REGIONS.length - 1) progress.regionUnlocked = Math.max(progress.regionUnlocked, activeRegionIndex + 1);
      if (activeRegionIndex === REGIONS.length - 1 && currentEvent.kind === 'raid') progress.showcaseUnlocked = true;
      if (currentEvent.kind === 'showcase') progress.showcaseUnlocked = true;
      if (activeRegionIndex >= 1 && !progress.unlockedLiveries.includes('saltline')) progress.unlockedLiveries.push('saltline');
      if (activeRegionIndex >= 3 && !progress.unlockedLiveries.includes('nightburn')) progress.unlockedLiveries.push('nightburn');
      resultKicker.textContent = currentRegion.name + ' // ' + currentEvent.label;
      resultTitle.textContent = medal.toUpperCase();
      resultCopy.textContent = reason + ' You banked +' + bonus + ' score. Choose the next route when ready.';
      resultAction.textContent = activeRegionIndex < REGIONS.length - 1 ? 'TAKE NEXT REGION' : currentEvent.kind === 'raid' ? 'UNLOCK SHOWCASE' : 'RUN IT AGAIN';
      resultAction.onclick = () => { const next = nextEventTarget(); clearRunInput(); launchEvent(next.region, next.event, true); };
    } else {
      resultKicker.textContent = currentRegion.name + ' // ' + currentEvent.label;
      resultTitle.textContent = 'RUN BACK';
      resultCopy.textContent = reason + ' No medal banked. Your score stays safe.';
      resultAction.textContent = 'RETRY EVENT';
      resultAction.onclick = restartCurrentEvent;
    }
    progress.best = Math.max(progress.best, score); saveProgress();
    clearStatus();
    kit.audio.stopMusic(400); kit.audio.sfx(success ? 'medal' : 'impact', { volume: .8 });
    showResult(); updateTabs(); updateProbe(); updateUi(true);
  }

  function showResult() { result.classList.remove('hidden'); }
  function hideResult() { result.classList.add('hidden'); }

  function beginRun(regionIndex = activeRegionIndex, eventId = activeEventId, announce = true) {
    if (titleActive) {
      titleActive = false;
      titleScreen.classList.add('hidden');
      tutorialScreen.classList.add('hidden');
      kit.resume('title');
    }
    progress.tutorialSeen = true;
    saveProgress();
    launchEvent(regionIndex, eventId, announce);
  }

  function openPauseMenu() {
    if (titleActive || run.mode === 'result' || kit.paused) return;
    clearRunInput();
    pausePanel.classList.remove('hidden');
    kit.pause('manual');
  }

  function closePauseMenu() {
    pausePanel.classList.add('hidden');
    kit.resume('manual');
  }

  function bindScreens() {
    titlePlay.addEventListener('click', () => {
      kit.audio.music('menu', 120);
      if (progress.tutorialSeen) beginRun(0, REGIONS[0].event.id, true);
      else { titleScreen.classList.add('hidden'); tutorialScreen.classList.remove('hidden'); }
    });
    tutorialSteps.forEach((step) => step.addEventListener('click', () => {
      tutorialChoice = step.dataset.step || 'steer';
      tutorialSteps.forEach((candidate) => candidate.classList.toggle('active', candidate === step));
    }));
    tutorialStart.addEventListener('click', () => beginRun(0, REGIONS[0].event.id, true));
    pauseResume.addEventListener('click', closePauseMenu);
    pauseRestart.addEventListener('click', () => { closePauseMenu(); restartCurrentEvent(); });
    pauseBank.addEventListener('click', () => { closePauseMenu(); bankSession(); });
  }

  function triggerImpact(magnitude = .08) {
    if (!kit.juice.enabled) return;
    contactFlash.classList.remove('pop');
    void contactFlash.offsetWidth;
    contactFlash.classList.add('pop');
  }

  function collectPickup(pickup) {
    pickup.active = false;
    const type = pickup.type;
    if (type === 'fuel') { player.fuel = Math.min(100, player.fuel + 24); score += 35; showStatus('FUEL +24%', 1); kit.audio.sfx('oasis', { volume: .55 }); }
    else if (type === 'flare') { score += 90; showStatus('FLARE +90', 1); kit.audio.sfx('medal', { volume: .5, rate: 1.3 }); }
    else if (type === 'boost') { run.boostTimer = 2.2; score += 25; showStatus('BOOST +25', 1); kit.audio.sfx('sand', { volume: .6, rate: 1.2 }); }
    else { run.collected += 1; score += 55; showStatus('CRATE ' + run.collected + '/' + run.total, 1); kit.audio.sfx('medal', { volume: .45 }); }
    triggerImpact(.1); kit.juice.hitStop(44); kit.juice.shake(1.4, 130);
  }

  function checkPickups() {
    const runtime = currentRegion.runtime;
    runtime.pickups.forEach((pickup) => {
      if (!pickup.active) return;
      if (dist2(player.x, player.z, pickup.x, pickup.z) < (pickup.type === 'boost' ? 3.1 : 2.55)) collectPickup(pickup);
    });
  }

  function checkHazards(dt) {
    run.hazardCooldown = Math.max(0, run.hazardCooldown - dt);
    const runtime = currentRegion.runtime;
    const hazardCount = Math.min(runtime.hazards.length, currentEvent.hazardCount || 0);
    if (run.hazardCooldown > 0) return;
    for (let i = 0; i < hazardCount; i += 1) {
      const hazard = runtime.hazards[i];
      if (dist2(player.x, player.z, hazard.x, hazard.z) < 2.1) {
        player.vx *= .42; player.vz *= .42; player.speed *= .42; run.timer = Math.max(0, run.timer - 2.2); run.hazardCooldown = 1.35;
        showStatus('ROCK -2.2s', 1); kit.audio.sfx('impact', { volume: .64 }); triggerImpact(.15); kit.juice.hitStop(52); kit.juice.shake(1.8, 150);
        break;
      }
    }
  }

  function updateShortcut() {
    if (run.shortcutUsed) return;
    const p = currentRegion.shortcut.from;
    if (dist2(player.x, player.z, p.x, p.z) < 3.8) {
      run.shortcutUsed = true; score += 120; run.timer = Math.min(currentEvent.time, run.timer + 4); showStatus(currentRegion.shortcut.label + ' +120 · +4s', 1); kit.audio.sfx('medal', { volume: .6, rate: .8 });
    }
  }

  function routePointAt(region, distance) {
    const route = activeRoute(region);
    const segments = currentEvent.kind === 'time' ? route.length : route.length - 1;
    const local = ((distance % segments) + segments) % segments;
    const index = Math.min(segments - 1, Math.floor(local));
    const a = route[index]; const b = route[(index + 1) % route.length];
    const t = local - index;
    return { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), yaw: Math.atan2(b.x - a.x, b.z - a.z) };
  }

  function updateRival(dt) {
    const route = activeRoute();
    const segments = currentEvent.kind === 'time' ? route.length : route.length - 1;
    const targetDistance = segments * (currentEvent.kind === 'time' ? 2 : 1);
    if (run.mode === 'running' && !run.rivalFinished) {
      run.rivalProgress += dt * (currentEvent.rivalPace || .08) * (currentEvent.kind === 'time' ? 2 : 1);
      if (run.rivalProgress >= targetDistance) { run.rivalProgress = targetDistance; run.rivalFinished = true; showStatus('RIVAL FINISH', 1); }
    }
  }

  function updateEvent(dt) {
    updateRival(dt);
    if (run.mode === 'countdown') {
      run.countdown -= dt;
      if (run.countdown <= 0) { run.mode = 'running'; run.countdown = 0; root.classList.remove('route-open'); coachUntil = simClock + 3; coachStrip.classList.remove('faded'); }
      return;
    }
    if (run.mode === 'stranded') {
      run.stranded -= dt;
      if (run.stranded <= 0) {
        const oasis = currentRegion.oasis; player.x = oasis.x; player.z = oasis.z; player.fuel = 100; player.vx = 0; player.vz = 0; player.speed = 0; score = Math.max(0, score - 25); run.mode = 'running'; showStatus('WALK-BACK -25', 1);
      }
      return;
    }
    if (run.mode !== 'running') return;
    run.elapsed += dt; run.timer -= dt; run.boostTimer = Math.max(0, run.boostTimer - dt);
    if (run.timer <= 0) { run.timer = 0; finishEvent(false, 'TIMER EXPIRED'); return; }
    checkPickups(); checkHazards(dt); updateShortcut();
    const route = activeRoute();
    const target = route[run.checkpoint];
    if (currentEvent.kind === 'salvage') {
      if (run.collected >= run.total) { finishEvent(true, 'All crates recovered before the storm closed.'); return; }
    } else if (target && dist2(player.x, player.z, target.x, target.z) < 3.25) {
      run.checkpoint += 1; score += currentEvent.kind === 'time' ? 35 : 80; kit.audio.sfx('medal', { volume: .38, rate: 1.1 }); triggerImpact(.06); kit.juice.shake(.7, 75);
      if (currentEvent.kind === 'time') {
        if (run.checkpoint >= route.length) {
          run.lap += 1; run.checkpoint = 0; showStatus('LAP ' + run.lap + '/2', 1);
          if (run.lap >= 2) { finishEvent(true, 'Two laps stitched through the hardpack.'); return; }
        } else showStatus('CP ' + run.checkpoint + '/' + route.length, .8);
      } else if (run.checkpoint >= route.length) {
        finishEvent(true, 'Every gold flag is tagged.'); return;
      } else showStatus('FLAG ' + run.checkpoint + '/' + route.length, .9);
    }
  }

  function stepVehicle(dt) {
    const controls = inputState();
    if (run.mode !== 'running') return;
    const surface = surfaceAt(currentRegion, player.x, player.z);
    const forward = direction(player.yaw); const right = rightOf(player.yaw);
    let forwardSpeed = player.vx * forward.x + player.vz * forward.z;
    let lateralSpeed = player.vx * right.x + player.vz * right.z;
    const speedMagnitude = Math.hypot(player.vx, player.vz);
    const throttleForce = run.boostTimer > 0 ? 31 : 23;
    if (controls.throttle && player.fuel > 0) {
      forwardSpeed += throttleForce * dt;
      player.fuel = Math.max(0, player.fuel - (1.45 + Math.max(0, forwardSpeed) * .025) * dt);
    } else forwardSpeed -= Math.sign(forwardSpeed) * Math.min(Math.abs(forwardSpeed), (surface.drag * 10 + 3) * dt);
    if (controls.brake) forwardSpeed -= Math.sign(forwardSpeed || 1) * Math.min(Math.abs(forwardSpeed), 31 * dt);
    if (run.boostTimer > 0) forwardSpeed += 12 * dt;
    const airborne = player.airTime > 0;
    const grip = airborne ? .08 : surface.grip;
    lateralSpeed = damp(lateralSpeed, 0, 5.5 * grip, dt);
    if (!airborne && surface.name === 'LOOSE SAND' && Math.abs(controls.steer) > .22 && speedMagnitude > 9) lateralSpeed += controls.steer * speedMagnitude * .42 * dt;
    const steerAuthority = clamp(Math.abs(forwardSpeed) / 12, 0, 1.25);
    player.yaw += controls.steer * (0.9 + steerAuthority * .82) * (airborne ? .55 : 1) * dt;
    const newForward = direction(player.yaw); const newRight = rightOf(player.yaw);
    player.vx = newForward.x * forwardSpeed + newRight.x * lateralSpeed;
    player.vz = newForward.z * forwardSpeed + newRight.z * lateralSpeed;
    player.x += player.vx * dt; player.z += player.vz * dt;
    if (player.x < -WORLD_LIMIT || player.x > WORLD_LIMIT) { player.x = clamp(player.x, -WORLD_LIMIT, WORLD_LIMIT); player.vx *= -.35; player.yaw = -player.yaw; triggerImpact(.12); kit.juice.shake(1.2, 100); }
    if (player.z < -WORLD_LIMIT || player.z > WORLD_LIMIT) { player.z = clamp(player.z, -WORLD_LIMIT, WORLD_LIMIT); player.vz *= -.35; player.yaw = Math.PI - player.yaw; triggerImpact(.12); kit.juice.shake(1.2, 100); }
    player.speed = Math.hypot(player.vx, player.vz);
    player.slip = clamp(Math.abs(lateralSpeed) / (Math.abs(forwardSpeed) + 2), 0, 1.6);
    visual.targetRoll = -controls.steer * .08 - lateralSpeed * .018;
    visual.targetPitch = clamp((visual.previousSpeed - player.speed) * .025, -.18, .18);
    visual.steering = controls.steer;
    visual.previousSpeed = player.speed;

    player.jumpCooldown = Math.max(0, player.jumpCooldown - dt);
    const currentHeight = terrainHeight(currentRegion, player.x, player.z);
    const aheadHeight = terrainHeight(currentRegion, player.x + newForward.x * 3.4, player.z + newForward.z * 3.4);
    const crestHeight = terrainHeight(currentRegion, player.x + newForward.x * 6.4, player.z + newForward.z * 6.4);
    const jumpLine = currentRegion.route.some((point, index) => (index === 1 || index === Math.floor(currentRegion.route.length * .62)) && dist2(player.x, player.z, point.x, point.z) < 3.4);
    if (!airborne && player.jumpCooldown <= 0 && player.speed > 16 && (jumpLine || (aheadHeight - currentHeight > .32 && crestHeight < aheadHeight - .08))) {
      player.jumpCooldown = 1.35; player.airTime = clamp(.62 + player.speed * .008, .62, 1.18); player.airHeight = .04; player.verticalSpeed = 3.4 + player.speed * .05; showStatus('CREST', 1); kit.audio.sfx('air', { volume: .52, rate: .8 + player.speed / 90 });
    }
    if (airborne) {
      player.airTime -= dt; player.airHeight += player.verticalSpeed * dt; player.verticalSpeed -= 10.5 * dt;
      if (player.airTime <= 0 || player.airHeight <= 0) {
        const quality = clamp(1 - Math.abs(player.airHeight) * .6 - Math.abs(visual.roll) * .7, 0, 1); player.airTime = 0; player.airHeight = 0; player.verticalSpeed = 0; player.landingQuality = quality;
        if (quality > .72) { score += 75; showStatus('LAND +75', 1); kit.audio.sfx('land', { volume: .65, rate: 1.2 }); }
        else { player.speed *= .74; showStatus('LAND SLOW', 1); kit.audio.sfx('impact', { volume: .52 }); }
        triggerImpact(quality > .72 ? .06 : .14); kit.juice.shake(quality > .72 ? .5 : 1.7, quality > .72 ? 70 : 150); kit.juice.hitStop(quality > .72 ? 32 : 55); visual.landingDip = quality > .72 ? .04 : .13;
      }
    }
    player.lastHeight = currentHeight;
    if (player.fuel <= 0 && player.speed < 2) {
      player.fuel = 0; run.mode = 'stranded'; run.stranded = 2.8; showStatus('FUEL EMPTY', 1); kit.audio.sfx('lowFuel', { volume: .8, rate: .6 });
    }
    const oasis = currentRegion.oasis;
    if (!controls.throttle && !controls.brake && dist2(player.x, player.z, oasis.x, oasis.z) < 5.7 && player.fuel < 100) {
      player.fuel = Math.min(100, player.fuel + 15 * dt);
      if (oasisSoundCooldown <= 0) { kit.audio.sfx('oasis', { volume: .5 }); oasisSoundCooldown = 2.4; }
      showStatus('REFUEL', .5);
    }
    if (player.fuel < 22 && lowFuelCooldown <= 0) { lowFuelCooldown = 4.5; kit.audio.sfx('lowFuel', { volume: .62 }); showStatus('LOW FUEL', 1); }
    if (surface.name !== surfaceName) { surfaceName = surface.name; showStatus((surface.name === 'LOOSE SAND' ? 'SAND' : 'HARDPACK') + ' · GRIP ' + Math.round(surface.grip * 100) + '%', 1); kit.audio.sfx('sand', { volume: .35, rate: surface.grip > .7 ? 1.25 : .82 }); }
    lowFuelCooldown -= dt; oasisSoundCooldown -= dt;
    spawnDrivingParticles(dt, controls, surface);
  }

  function spawnDrivingParticles() {
    // GGRacer owns dust, spray, skid and speed FX. The title keeps only the
    // simulation triggers and audio cues that feed those visual states.
  }

  function updatePresentation(dt) {
    visual.roll = damp(visual.roll, visual.targetRoll, 7, dt);
    visual.pitch = damp(visual.pitch, visual.targetPitch, 7, dt);
    visual.landingDip = damp(visual.landingDip, 0, 6, dt);
  }

  function render(dt, frozen = false) {
    if (!racer) return;
    if (!frozen) updateRacerFrame(dt);
    racer.world.render();
  }

  function updateProbe() {
    probeState.mode = titleActive ? 'title' : run.mode;
    probeState.fuel = Math.round(player.fuel * 10) / 10;
    probeState.checkpoint = run.checkpoint;
    probeState.region = currentRegion.id;
    probeState.score = score;
    probeState.event = currentEvent.id;
    probeState.timer = Math.max(0, Math.round(run.timer * 10) / 10);
    probeState.medal = run.medal;
    probeState.livery = progress.livery;
  }

  function updateCompass() {
    const route = activeRoute();
    let target = route[Math.min(run.checkpoint, route.length - 1)];
    if (currentEvent.kind === 'salvage') {
      const nextCrate = currentRegion.runtime && currentRegion.runtime.pickups.find((pickup) => pickup.active && pickup.type === 'crate');
      if (nextCrate) target = nextCrate;
    }
    if (!target) return;
    const distance = dist2(player.x, player.z, target.x, target.z);
    const angle = Math.atan2(target.x - player.x, target.z - player.z) - player.yaw;
    compassArrow.style.transform = 'rotate(' + angle.toFixed(3) + 'rad)';
    setTextIfChanged(compassDistance, Math.round(distance) + 'm');
  }

  function updateUi(force = false) {
    if (!force && simClock - lastUiClock < .1) return;
    lastUiClock = simClock;
    root.classList.toggle('play-live', !titleActive && run.mode === 'running' && !kit.paused);
    setTextIfChanged(scoreEl, score);
    setTextIfChanged(bestEl, Math.max(progress.best, score));
    setTextIfChanged(fuelNumber, Math.round(player.fuel) + '%');
    fuelFill.style.width = clamp(player.fuel, 0, 100).toFixed(1) + '%';
    fuelFill.style.background = player.fuel < 22 ? '#ff684d' : player.fuel < 48 ? '#ffaf55' : '#ffca67';
    setTextIfChanged(eventName, currentEvent.label);
    const route = activeRoute();
    let checkpointText = currentEvent.kind === 'salvage' ? 'CR ' + run.collected + '/' + run.total : currentEvent.kind === 'time' ? 'L' + Math.min(2, run.lap + 1) + ' CP ' + (run.checkpoint + 1) + '/' + route.length : 'CP ' + Math.min(route.length, run.checkpoint + 1) + '/' + route.length;
    if (run.mode === 'result') checkpointText = run.medal === 'unset' ? 'RUN BACK' : run.medal.toUpperCase() + ' MEDAL';
    if (run.mode === 'stranded') checkpointText = 'WALK-BACK ' + Math.ceil(run.stranded) + 's';
    setTextIfChanged(checkpointReadout, checkpointText);
    setTextIfChanged(timerReadout, currentEvent.kind === 'time' ? run.elapsed.toFixed(1) + 's' : Math.ceil(Math.max(0, run.timer)) + 's');
    setTextIfChanged(landmarkLabel, 'LANDMARK // ' + currentRegion.landmark);
    const medal = progress.medals[eventKey(currentRegion, currentEvent)] || 'UNSET';
    setTextIfChanged(medalLabel, 'MEDAL // ' + String(medal).toUpperCase());
    updateCompass();
    pumpStatus();
    setTextIfChanged(statusEl, statusMessage);
    if (coachUntil <= simClock) coachStrip.classList.add('faded');
    updateProbe();
  }

  function updateTabs() {
    regionTabs.replaceChildren(); eventTabs.replaceChildren();
    REGIONS.forEach((region, index) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'tab' + (index === activeRegionIndex ? ' active' : ''); button.textContent = region.short;
      const locked = index > progress.regionUnlocked && index !== activeRegionIndex;
      if (locked) { button.disabled = true; button.classList.add('locked'); button.textContent += ' // LOCKED'; }
      button.addEventListener('click', () => { if (!locked) launchEvent(index, defaultEventForRegion(index), true); });
      regionTabs.appendChild(button);
    });
    const events = regionEvents(currentRegion);
    events.forEach((event) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'tab' + (event.id === activeEventId ? ' active' : ''); button.textContent = event.label;
      const locked = event.kind === 'showcase' && !progress.showcaseUnlocked;
      if (locked) { button.disabled = true; button.classList.add('locked'); button.textContent = 'SHOWCASE // LOCKED'; }
      button.addEventListener('click', () => { if (!locked) launchEvent(activeRegionIndex, event.id, true); });
      eventTabs.appendChild(button);
    });
  }

  function forceEvent(value) {
    const raw = String(value || '').toLowerCase().replace(/[ _]+/g, '-');
    if (raw.includes('showcase')) { activeRegionIndex = 3; currentRegion = REGIONS[3]; }
    else {
      const matchingRegion = REGIONS.findIndex((region) => regionEvents(region).some((event) => event.id === raw || event.kind === raw || event.id.includes(raw)));
      if (matchingRegion >= 0) { activeRegionIndex = matchingRegion; currentRegion = REGIONS[matchingRegion]; }
    }
    const event = eventFor(currentRegion, value);
    if (event.kind === 'showcase') progress.showcaseUnlocked = true;
    beginRun(activeRegionIndex, event.id, true);
    return event.id;
  }

  function forceRegion(value) {
    const region = regionFor(value); const index = REGIONS.indexOf(region);
    progress.regionUnlocked = Math.max(progress.regionUnlocked, index);
    beginRun(index, defaultEventForRegion(index), true);
    return region.id;
  }

  function setupProbe() {
    const existing = window.__dr || {};
    existing.state = probeState;
    existing.forceEvent = forceEvent;
    existing.forceRegion = forceRegion;
    window.__dr = existing;
  }

  async function loadTracks() {
    const requests = [];
    REGIONS.forEach((region) => regionEvents(region).forEach((event) => {
      const id = trackIdFor(region, event);
      requests.push({ id, path: './tracks/' + id + '.json' });
    }));
    for (let index = 0; index < requests.length; index += 1) {
      const request = requests[index];
      const response = await fetch(request.path);
      if (!response.ok) throw new Error('missing track JSON: ' + request.path);
      trackDataByEvent.set(request.id, await response.json());
      kit.loader.progress(.14 + .48 * ((index + 1) / requests.length));
    }
  }

  async function start() {
    kit.loader.show('DUNE RUNNER // BUILDING ROUTE'); kit.loader.progress(.06);
    kit.audio.register({
      engine: 'assets/engine.mp3', wind: 'assets/wind.mp3', sand: 'assets/sand.mp3', oasis: 'assets/oasis.mp3',
      lowFuel: 'assets/low-fuel.mp3', impact: 'assets/impact.mp3', medal: 'assets/medal.mp3', air: 'assets/air.mp3', land: 'assets/land.mp3',
      menu: 'assets/menu.mp3', drive: 'assets/drive.mp3',
    });
    kit.loader.progress(.12);
    try { await loadTracks(); makeScene(); } catch (error) {
      fallback.classList.remove('hidden'); fallbackCopy.textContent = 'WebGL could not start in this browser. Try a current browser with hardware acceleration enabled.'; setupProbe(); return;
    }
    kit.loader.progress(.94); bindInput(); bindScreens(); setupProbe(); kit.registerPWA(); kit.loader.progress(1); kit.loader.hide();
    kit.pause('title');
    if (bootRequest.region != null || bootRequest.event != null) {
      const region = bootRequest.region == null ? currentRegion : regionFor(bootRequest.region);
      const event = bootRequest.event == null ? region.event : eventFor(region, bootRequest.event);
      beginRun(REGIONS.indexOf(region), event.id, true);
    } else { updateProbe(); updateUi(true); }
  }

  function step(dt, freezeVisual = false) {
    simClock += dt;
    if (run.mode === 'running') stepVehicle(dt);
    updateEvent(dt);
    if (!freezeVisual) {
      updatePresentation(dt); syncMarkers();
    }
    updateUi();
  }

  function frame(now) {
    const wallDt = clamp((now - lastFrame) / 1000, 0, .05); lastFrame = now;
    const juice = kit.juice.frame();
    if (!kit.paused && fallback.classList.contains('hidden')) {
      accumulator += wallDt;
      while (accumulator >= STEP) { step(STEP, juice.frozen); accumulator -= STEP; }
    }
    render(wallDt, juice.frozen); requestAnimationFrame(frame);
  }

  resultSecondary.addEventListener('click', () => { if (resultContext === 'session') { hideResult(); run.mode = 'running'; clearRunInput(); } else restartCurrentEvent(); });
  start();
  requestAnimationFrame(frame);
})();
