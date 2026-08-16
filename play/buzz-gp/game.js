/* Buzz Grand Prix. Original mascot kart racer built on the shared GGRacer lane. */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const sceneCanvas = $('scene');
  const hudCanvas = $('hud');
  const fallbackCanvas = $('fallback');
  const fallbackCtx = fallbackCanvas.getContext('2d');
  const hudCtx = hudCanvas.getContext('2d');
  const menu = $('menu');
  const menuPanel = menu.querySelector('.panel');
  const pauseCard = $('pause-card');
  const coach = $('coach');
  const baseMenuMarkup = menuPanel.innerHTML;
  const STEP = 1 / 60;
  const MAX_STEPS = 4;
  const LAPS = 3;
  const FIELD_SIZE = 8;
  const SAVE_VERSION = 2;
  const COLORS = { ink: '#102d32', cream: '#fff5d6', honey: '#ffca3a', mint: '#9be28f', coral: '#f46e5f', violet: '#8a72e8', cyan: '#63d6d2' };

  const TRACKS = [
    { id: 'garden-sprint', name: 'Garden Sprint', cup: 0, index: 0 },
    { id: 'picnic-chicane', name: 'Picnic Chicane', cup: 0, index: 1 },
    { id: 'compost-canyon', name: 'Compost Canyon', cup: 0, index: 2 },
    { id: 'gutter-run', name: 'Gutter Run', cup: 0, index: 3 },
    { id: 'toolshed-twilight', name: 'Toolshed Twilight', cup: 1, index: 4 },
    { id: 'pond-skim', name: 'Pond Skim', cup: 1, index: 5 },
    { id: 'anthill-spiral', name: 'Anthill Spiral', cup: 1, index: 6 },
    { id: 'queens-throne', name: "Queen's Throne", cup: 1, index: 7 },
    { id: 'firefly-loop', name: 'Firefly Loop', cup: 2, index: 8 },
    { id: 'hosepipe-heights', name: 'Hosepipe Heights', cup: 2, index: 9 },
    { id: 'seed-packet-speedway', name: 'Seed Packet Speedway', cup: 2, index: 10 },
    { id: 'wheelbarrow-wilds', name: 'Wheelbarrow Wilds', cup: 2, index: 11 },
  ];
  const CUPS = [
    { id: 'sprout', name: 'Sprout Cup', tracks: [0, 1, 2, 3] },
    { id: 'backyard', name: 'Backyard Cup', tracks: [4, 5, 6, 7] },
    { id: 'moonlit', name: 'Moonlit Cup', tracks: [8, 9, 10, 11] },
  ];
  const BATTLE_TRACKS = ['battle-lily-pad', 'battle-toolshed'];
  const RACERS = [
    { id: 'zip', name: 'Zip', kind: 'dragonfly', trait: 'speed', paint: 0x32b8d1, accent: 0xffe15a, speed: 1.09, handling: .82, aggression: .28 },
    { id: 'bumble', name: 'Bumble', kind: 'bee', trait: 'balanced', paint: 0xf4b62f, accent: 0x173437, speed: 1.0, handling: 1.0, aggression: .48 },
    { id: 'stag', name: 'Stag', kind: 'stag beetle', trait: 'heavyweight', paint: 0x673b2f, accent: 0xff8d52, speed: .95, handling: .72, aggression: .78 },
    { id: 'glow', name: 'Glow', kind: 'firefly', trait: 'night specialist', paint: 0x9fe653, accent: 0x59f5d0, speed: 1.03, handling: .96, aggression: .4 },
    { id: 'skeet', name: 'Skeet', kind: 'mosquito', trait: 'acceleration', paint: 0xb64c99, accent: 0xf2a2d0, speed: 1.02, handling: .9, aggression: .67 },
    { id: 'madam-web', name: 'Madam Web', kind: 'spider', trait: 'handling', paint: 0x7a6ce0, accent: 0xffc4e7, speed: .98, handling: 1.16, aggression: .52 },
    { id: 'tick-tock', name: 'Tick-Tock', kind: 'tick', trait: 'tiny nimble', paint: 0x8b6a4d, accent: 0x74d7a4, speed: .99, handling: 1.24, aggression: .45 },
    { id: 'duke-dung', name: 'Duke Dung', kind: 'dung beetle', trait: 'tank', paint: 0x403238, accent: 0xcf9c55, speed: .93, handling: .68, aggression: .84 },
    { id: 'moss-mantis', name: 'Moss Mantis', kind: 'mantis', trait: 'hidden', paint: 0x4baf69, accent: 0xf1db76, speed: 1.04, handling: 1.02, aggression: .58, hidden: true },
    { id: 'bramble-bug', name: 'Bramble Bug', kind: 'thorn bug', trait: 'hidden', paint: 0xe76e59, accent: 0x8a72e8, speed: 1.07, handling: .86, aggression: .72, hidden: true },
  ];
  const ITEMS = [
    { id: 'acorn-shot', name: 'Acorn Shot', short: 'ACORN', color: '#b9824b' },
    { id: 'homing-hornet', name: 'Homing Hornet', short: 'HORNET', color: '#ffd43b' },
    { id: 'sap-slick', name: 'Sap Slick', short: 'SAP', color: '#df9d52' },
    { id: 'bubble-shield', name: 'Bubble Shield', short: 'BUBBLE', color: '#78e5ef' },
    { id: 'nectar-boost', name: 'Nectar Boost', short: 'NECTAR', color: '#ff8f68' },
    { id: 'swarm-surge', name: 'Swarm Surge', short: 'SWARM', color: '#f05b8a' },
    { id: 'pebble-triple', name: 'Pebble Triple', short: 'PEBBLES', color: '#98a9ae' },
  ];
  const ITEM_WEIGHTS = [
    [38, 10, 4, 28, 14, 0, 6],
    [28, 18, 8, 18, 14, 0, 14],
    [20, 24, 12, 14, 12, 2, 16],
    [12, 28, 18, 9, 9, 8, 16],
    [8, 22, 24, 7, 8, 17, 14],
    [5, 16, 30, 5, 7, 23, 14],
    [5, 12, 24, 5, 8, 31, 15],
    [4, 10, 20, 4, 7, 39, 16],
  ];
  const SKINS = [
    { id: 'classic', name: 'Classic tin', paint: 0xd44738, accent: 0xf2c34e },
    { id: 'mint', name: 'Mint leaf', paint: 0x4fbf8a, accent: 0xffe27a, unlock: 'cup-1' },
    { id: 'berry', name: 'Berry jam', paint: 0x9a527f, accent: 0x8fe6e0, unlock: 'cup-2' },
    { id: 'moon', name: 'Moon glow', paint: 0x385b9f, accent: 0xf4f3a7, unlock: '150cc' },
  ];
  const CUP_NAMES = CUPS.map((cup) => cup.name);
  const DEFAULT_SAVE = { v: SAVE_VERSION, racer: 'bumble', skin: 'classic', unlockedRacers: ['zip', 'bumble', 'stag', 'glow', 'skeet', 'madam-web', 'tick-tock', 'duke-dung'], skins: ['classic'], unlocked150: false, medals: {}, bestTT: {}, ghosts: {} };
  const DEBUG_STATE = { mode: 'boot', raceMode: 'grand-prix', cup: 0, track: 'garden-sprint', lap: 0, pos: 8, item: '', cc: 100, battle: false, balloons: 3, driftTier: 0, speed: 0 };
  const FORCE = { track: 'garden-sprint', cup: 0, item: '', battle: false };
  const FALLBACK_TRACK = {
    version: 1, id: 'garden-sprint', name: 'Garden Sprint', width: 13, sampleCount: 128, theme: 'coastal', timeOfDay: 'noon',
    controlPoints: [{ x: 0, z: -112 }, { x: 62, z: -94, elevation: 2, banking: 5, curb: true }, { x: 104, z: -36, elevation: 4, banking: 12, curb: true }, { x: 91, z: 42, elevation: 1, banking: -8 }, { x: 28, z: 99, curb: true }, { x: -48, z: 89, elevation: 3, banking: 4 }, { x: -106, z: 35, banking: -10, curb: true }, { x: -98, z: -45, banking: 7 }, { x: -52, z: -100, elevation: 2, curb: true }],
    sectors: [{ id: 1, at: 0 }, { id: 2, at: .34 }, { id: 3, at: .68 }], racingLine: [{ at: 0, lateral: .5 }, { at: .25, lateral: -1.2 }, { at: .5, lateral: 1.4 }, { at: .75, lateral: -.8 }],
    itemRows: [.08, .17, .26, .39, .51, .63, .75, .88], shortcuts: [{ at: .58, lateral: 4.6, length: .09 }], hazards: [{ at: .36, kind: 'sprinkler', lanes: [-2.8, 2.8] }], jumpRamps: [{ at: .22, lateral: 0, boost: .18 }], dressing: ['flower', 'sprinkler', 'fence'],
  };

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const wrap = (value) => { value %= 1; return value < 0 ? value + 1 : value; };
  const safeNumber = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const known = (list, value) => list.some((entry) => entry.id === value);
  const validSave = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.v !== SAVE_VERSION) return false;
    if (!known(RACERS, value.racer) || !known(SKINS, value.skin) || !Array.isArray(value.unlockedRacers) || !Array.isArray(value.skins) || typeof value.unlocked150 !== 'boolean' || !value.medals || typeof value.medals !== 'object' || !value.bestTT || typeof value.bestTT !== 'object' || !value.ghosts || typeof value.ghosts !== 'object') return false;
    if (value.unlockedRacers.length < 8 || value.unlockedRacers.some((id) => !known(RACERS, id)) || value.skins.length < 1 || value.skins.some((id) => !known(SKINS, id))) return false;
    for (const key of Object.keys(value.medals)) if (!TRACKS.some((track) => track.id === key) || !['bronze', 'silver', 'gold'].includes(value.medals[key])) return false;
    for (const key of Object.keys(value.bestTT)) if (!TRACKS.some((track) => track.id === key) || !Number.isFinite(value.bestTT[key]) || value.bestTT[key] < 0 || value.bestTT[key] > 3600) return false;
    for (const key of Object.keys(value.ghosts)) { if (!TRACKS.some((track) => track.id === key) || !Array.isArray(value.ghosts[key]) || value.ghosts[key].length > 3600) return false; for (const sample of value.ghosts[key]) if (!sample || !Number.isFinite(sample.t) || !Number.isFinite(sample.p) || !Number.isFinite(sample.l) || !Number.isFinite(sample.d) || sample.t < 0 || sample.p < 0 || sample.p > 1 || sample.l < -6 || sample.l > 6 || sample.d < 0) return false; }
    return true;
  };
  const freshSave = () => clone(DEFAULT_SAVE);

  let save;
  let THREE = null;
  let createRacerWorld = null;
  let racer = null;
  let titleArt = null;
  let bugRigs = [];
  let itemBoxes = [];
  let projectiles = [];
  let hazards = [];
  let bursts = [];
  let trackData = FALLBACK_TRACK;
  let minimap = [];
  let liveRenderer = false;
  let currentRaceId = '';
  let currentCupTrackIndex = 0;
  let raceMode = 'grand-prix';
  let currentCup = 0;
  let currentCC = 100;
  let engineError = '';
  let lastFrameAt = 0;
  let accumulator = 0;
  let raceSeed = 0x813f27;
  let rngState = raceSeed;
  let menuToast = '';
  let toastTimer = 0;
  let ghostRecord = [];
  let ghostReplay = [];
  let ghostSampleTimer = 0;
  let resultMarkup = '';
  let sampleCache = null;
  let playerFrame = null;
  let rivalFrameStates = [];
  let input = { left: false, right: false, hop: false, item: false, pause: false };
  const touchPointers = new Map();
  const sim = {
    phase: 'menu', mode: 'grand-prix', progress: 0, distance: 0, lap: 1, pos: 8, time: 0, lapTime: 0, speed: 0, steer: 0, lateral: 0, drift: false, driftCharge: 0, driftTier: 0, hop: 0, hopCooldown: 0, jump: 0, trick: 0, boost: 0, hit: 0, spin: 0, spinDir: 1, draft: 0, item: -1, shield: 0, balloons: 3, battleTime: 0, countdown: 3.0, countdownTick: 3, jumpHeld: false, itemHeld: false, finishReason: '', sector: -1,
  };
  const ai = [];
  for (let i = 0; i < 7; i += 1) ai.push({ index: i, racer: RACERS[(i + 2) % 8], distance: -(i + 1) * .024, progress: 0, lateral: (i % 3 - 1) * 1.5, speed: 0, steer: 0, item: -1, itemCooldown: 2 + i * .5, hit: 0, spin: 0, balloons: 3, aggression: 0, personality: 0 });

  const kit = GGKit.create({
    slug: 'buzz-gp', orientation: 'landscape', validateSave: validSave,
    onPause() { clearTouchControls(); if (racer) racer.world.setPaused(true); if (sim.phase === 'race') { pauseCard.style.display = 'flex'; } },
    onResume() { if (racer) racer.world.setPaused(false); pauseCard.style.display = 'none'; },
    onRestart() { if (sim.phase === 'race' || sim.phase === 'finish') startRace({ trackId: currentRaceId, cup: currentCup, cc: currentCC, mode: raceMode }); },
  });
  kit.audio.register({
    menu: 'assets/music_menu.mp3', raceA: 'assets/music_race_a.mp3', raceB: 'assets/music_race_b.mp3',
    item: 'assets/sfx_item.mp3', hit: 'assets/sfx_hit.mp3', drift: 'assets/sfx_drift.mp3', boost: 'assets/sfx_boost.mp3', jump: 'assets/sfx_jump.mp3', pickup: 'assets/sfx_pickup.mp3', shield: 'assets/sfx_shield.mp3', hornet: 'assets/sfx_hornet.mp3', sap: 'assets/sfx_sap.mp3', swarm: 'assets/sfx_swarm.mp3', pebble: 'assets/sfx_pebble.mp3', lap: 'assets/sfx_lap.mp3', fanfare: 'assets/sfx_fanfare.mp3', ui: 'assets/sfx_ui.mp3',
  });
  save = kit.save.get(null);
  if (!validSave(save)) save = freshSave();
  if (!save.unlockedRacers.includes(save.racer)) save.racer = 'bumble';
  if (!save.skins.includes(save.skin)) save.skin = 'classic';
  if (!save.unlocked150) currentCC = 100;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) kit.juice.enabled = false;

  function persist() { kit.save.set(save); }
  function sfx(name, options) { kit.audio.sfx(name, options || {}); }
  function rand() { rngState = (rngState * 1664525 + 1013904223) >>> 0; return rngState / 4294967296; }
  function resetRandom(seed) { rngState = (seed >>> 0) || 1; }
  function setToast(text, seconds) { menuToast = text; toastTimer = seconds || 1; }
  function formatTime(value) { const mins = Math.floor(value / 60); const secs = value - mins * 60; return `${mins}:${secs.toFixed(2).padStart(5, '0')}`; }
  function itemById(id) { return ITEMS.find((item) => item.id === id) || null; }
  function racerById(id) { return RACERS.find((racerEntry) => racerEntry.id === id) || RACERS[1]; }
  function skinById(id) { return SKINS.find((skin) => skin.id === id) || SKINS[0]; }
  function currentRacer() { const entry = racerById(save.racer); return save.unlockedRacers.includes(entry.id) ? entry : RACERS[1]; }
  function medalFor(time) { if (time <= 74) return 'gold'; if (time <= 102) return 'silver'; return 'bronze'; }
  function saveMedal(trackId, medal) { const rank = { bronze: 1, silver: 2, gold: 3 }; if (!save.medals[trackId] || rank[medal] > rank[save.medals[trackId]]) save.medals[trackId] = medal; }
  function updateUnlocks() {
    const golds = Object.values(save.medals).filter((medal) => medal === 'gold').length;
    const silvers = Object.values(save.medals).filter((medal) => medal === 'silver' || medal === 'gold').length;
    if (silvers >= 4) save.unlocked150 = true;
    if (golds >= 4 && !save.unlockedRacers.includes('moss-mantis')) save.unlockedRacers.push('moss-mantis');
    if (golds >= 8 && !save.unlockedRacers.includes('bramble-bug')) save.unlockedRacers.push('bramble-bug');
    if (golds >= 4 && !save.skins.includes('mint')) save.skins.push('mint');
    if (golds >= 8 && !save.skins.includes('berry')) save.skins.push('berry');
    if (save.unlocked150 && !save.skins.includes('moon')) save.skins.push('moon');
  }

  function updateDebug() {
    DEBUG_STATE.mode = sim.mode === 'battle' ? 'battle' : sim.phase === 'menu' ? 'menu' : sim.phase;
    DEBUG_STATE.raceMode = raceMode;
    DEBUG_STATE.cup = currentCup;
    DEBUG_STATE.track = currentRaceId || FORCE.track;
    DEBUG_STATE.lap = sim.phase === 'menu' ? 0 : sim.lap;
    DEBUG_STATE.pos = sim.pos;
    DEBUG_STATE.item = sim.item >= 0 ? ITEMS[sim.item].id : '';
    DEBUG_STATE.cc = currentCC;
    DEBUG_STATE.battle = sim.mode === 'battle';
    DEBUG_STATE.balloons = sim.balloons;
    DEBUG_STATE.driftTier = sim.driftTier;
    DEBUG_STATE.speed = Math.round(sim.speed * 10) / 10;
  }
  window.__bg = {};
  Object.defineProperty(window.__bg, 'state', { enumerable: true, get: () => DEBUG_STATE });
  Object.defineProperty(window.__bg, 'force', { enumerable: true, get: () => ({ track: FORCE.track, cup: FORCE.cup, item: FORCE.item, battle: FORCE.battle }) });
  window.__bg.forceTrack = (value) => { const resolved = resolveTrack(value); FORCE.track = resolved.id; DEBUG_STATE.track = resolved.id; if (sim.phase !== 'menu') startRace({ trackId: resolved.id, cup: resolved.cup, cc: currentCC, mode: raceMode }); return resolved.id; };
  window.__bg.forceCup = (value) => { const cup = clamp(Math.floor(Number(value) || 0), 0, 2); FORCE.cup = cup; currentCup = cup; DEBUG_STATE.cup = cup; if (sim.phase !== 'menu') startRace({ trackId: TRACKS[CUPS[cup].tracks[0]].id, cup, cc: currentCC, mode: 'grand-prix' }); return cup; };
  window.__bg.forceItem = (value) => { const id = typeof value === 'number' ? ITEMS[clamp(value, 0, ITEMS.length - 1)].id : String(value || ''); const index = ITEMS.findIndex((item) => item.id === id || item.short.toLowerCase() === id.toLowerCase() || item.name.toLowerCase() === id.toLowerCase()); FORCE.item = index >= 0 ? ITEMS[index].id : ''; if (index >= 0) sim.item = index; updateDebug(); return FORCE.item; };
  window.__bg.forceBattle = (value) => { FORCE.battle = value === true || value === 1 || value === '1' || value === 'true' || value === 'battle'; if (FORCE.battle) startRace({ trackId: BATTLE_TRACKS[0], cup: 0, cc: currentCC, mode: 'battle' }); return FORCE.battle; };

  function resolveTrack(value) {
    if (typeof value === 'number') return TRACKS[clamp(Math.floor(value), 0, TRACKS.length - 1)];
    const id = String(value || '');
    return TRACKS.find((track) => track.id === id || track.name.toLowerCase() === id.toLowerCase()) || TRACKS[0];
  }
  function fallbackFor(id) { const entry = resolveTrack(id); const copy = clone(FALLBACK_TRACK); copy.id = entry.id; copy.name = entry.name; return copy; }
  async function loadTrack(id) {
    const fallback = fallbackFor(id);
    try {
      const response = await fetch(`tracks/${id}.json`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`track ${response.status}`);
      const data = await response.json();
      if (!data || !Array.isArray(data.controlPoints) || data.controlPoints.length < 4) throw new Error('invalid track');
      return data;
    } catch (error) {
      engineError = `${id}: ${error.message}`;
      return fallback;
    }
  }

  function resizeCanvas(canvas, ctx) {
    const rect = canvas.getBoundingClientRect();
    const dpr = GGKit.hiDpi.dpr();
    const width = Math.max(1, Math.floor(rect.width * dpr));
    const height = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { width: rect.width, height: rect.height, dpr };
  }

  function drawFallback(now) {
    const size = resizeCanvas(fallbackCanvas, fallbackCtx);
    const w = size.width; const h = size.height;
    const g = fallbackCtx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#77d8d5'); g.addColorStop(.58, '#d6f29a'); g.addColorStop(.59, '#68b766'); g.addColorStop(1, '#2f634b'); fallbackCtx.fillStyle = g; fallbackCtx.fillRect(0, 0, w, h);
    fallbackCtx.fillStyle = 'rgba(255,246,192,.7)'; fallbackCtx.beginPath(); fallbackCtx.arc(w * .78, h * .2, Math.min(w, h) * .08, 0, Math.PI * 2); fallbackCtx.fill();
    const roadY = h * .56; const sway = Math.sin(now * .00035) * w * .12; fallbackCtx.fillStyle = '#4d5351'; fallbackCtx.beginPath(); fallbackCtx.moveTo(w * .39 + sway, 0); fallbackCtx.lineTo(w * .61 + sway, 0); fallbackCtx.lineTo(w * .94, h); fallbackCtx.lineTo(w * .06, h); fallbackCtx.closePath(); fallbackCtx.fill();
    fallbackCtx.strokeStyle = '#f8e6a9'; fallbackCtx.lineWidth = Math.max(3, w * .006); fallbackCtx.setLineDash([18, 22]); fallbackCtx.beginPath(); fallbackCtx.moveTo(w * .5 + sway * .4, 0); fallbackCtx.lineTo(w * .5, h); fallbackCtx.stroke(); fallbackCtx.setLineDash([]);
    for (let i = 0; i < 18; i += 1) { const x = (i * 83) % Math.max(1, w); const y = roadY + ((i * 47) % Math.max(1, h - roadY)); fallbackCtx.fillStyle = i % 2 ? '#f6a7b2' : '#ffe26c'; fallbackCtx.beginPath(); fallbackCtx.arc(x, y, 5 + (i % 3) * 2, 0, Math.PI * 2); fallbackCtx.fill(); fallbackCtx.strokeStyle = '#2f805b'; fallbackCtx.lineWidth = 2; fallbackCtx.beginPath(); fallbackCtx.moveTo(x, y + 5); fallbackCtx.lineTo(x, y + 28); fallbackCtx.stroke(); }
    const bugX = w * .5 + Math.sin(now * .001) * 15; const bugY = h * .69; fallbackCtx.fillStyle = '#f4b62f'; fallbackCtx.beginPath(); fallbackCtx.ellipse(bugX, bugY, 25, 18, 0, 0, Math.PI * 2); fallbackCtx.fill(); fallbackCtx.fillStyle = '#173437'; fallbackCtx.fillRect(bugX - 23, bugY - 5, 46, 7); fallbackCtx.fillStyle = '#fff5d6'; fallbackCtx.beginPath(); fallbackCtx.arc(bugX - 8, bugY - 22, 7, 0, Math.PI * 2); fallbackCtx.arc(bugX + 8, bugY - 22, 7, 0, Math.PI * 2); fallbackCtx.fill();
    fallbackCtx.fillStyle = '#173437'; fallbackCtx.beginPath(); fallbackCtx.arc(bugX - 8, bugY - 22, 2.5, 0, Math.PI * 2); fallbackCtx.arc(bugX + 8, bugY - 22, 2.5, 0, Math.PI * 2); fallbackCtx.fill();
    if (!liveRenderer && engineError) { fallbackCtx.fillStyle = 'rgba(16,45,50,.76)'; fallbackCtx.fillRect(16, h - 42, Math.min(w - 32, 420), 28); fallbackCtx.fillStyle = '#fff5d6'; fallbackCtx.font = '12px system-ui'; fallbackCtx.fillText('Boot fallback active. ' + engineError.slice(0, 44), 28, h - 23); }
  }

  function createMaterial(color, options) { return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: .58, metalness: .08, flatShading: true }, options || {})); }
  function addBox(parent, geometry, material, position, scale) { const mesh = new THREE.Mesh(geometry, material); mesh.position.set(position[0], position[1], position[2]); if (scale) mesh.scale.set(scale[0], scale[1], scale[2]); parent.add(mesh); return mesh; }
  function makeBugRig(spec, root, isPlayer) {
    const rig = new THREE.Group(); rig.name = `${spec.name} articulated mascot rig`; rig.position.set(0, 1.52, .2); root.add(rig);
    const bodyMat = createMaterial(spec.paint, { roughness: .42, metalness: .06 }); const accentMat = createMaterial(spec.accent, { roughness: .32, metalness: .1 }); const darkMat = createMaterial(0x173437, { roughness: .38 }); const eyeMat = createMaterial(0xfff7d4, { roughness: .2 }); const pupilMat = createMaterial(0x122b30, { roughness: .25 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(.48, 12, 8), bodyMat); body.scale.set(1.1, .92, .9); body.position.y = .18; rig.add(body);
    const head = new THREE.Group(); head.position.set(0, .68, .18); rig.add(head);
    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(.54, 12, 8), bodyMat); headMesh.scale.set(1.15, 1, .95); head.add(headMesh);
    const eyeGeometry = new THREE.SphereGeometry(.13, 8, 6);
    for (const side of [-1, 1]) { const eye = new THREE.Mesh(eyeGeometry, eyeMat); eye.position.set(side * .21, .1, .47); head.add(eye); const pupil = new THREE.Mesh(new THREE.SphereGeometry(.055, 7, 5), pupilMat); pupil.position.set(side * .21, .09, .575); head.add(pupil); }
    const antennaMat = createMaterial(spec.accent, { roughness: .5 });
    for (const side of [-1, 1]) { const stalk = new THREE.Mesh(new THREE.CylinderGeometry(.035, .05, .4, 6), antennaMat); stalk.position.set(side * .23, .53, .18); stalk.rotation.z = side * -.38; head.add(stalk); const tip = new THREE.Mesh(new THREE.SphereGeometry(.07, 7, 5), accentMat); tip.position.set(side * .31, .74, .18); head.add(tip); }
    const wings = new THREE.Group(); wings.position.y = .35; rig.add(wings);
    const wingMat = createMaterial(spec.kind === 'dragonfly' || spec.kind === 'firefly' ? 0xbbefff : 0x241d2c, { transparent: true, opacity: spec.kind === 'dragonfly' || spec.kind === 'firefly' ? .62 : .32, side: THREE.DoubleSide });
    for (const side of [-1, 1]) { const wing = new THREE.Mesh(new THREE.SphereGeometry(.38, 8, 6), wingMat); wing.scale.set(.16, .45, .7); wing.position.set(side * .43, .18, -.08); wing.rotation.z = side * .34; wings.add(wing); }
    if (spec.kind === 'stag beetle' || spec.kind === 'dung beetle') { for (const side of [-1, 1]) { const horn = new THREE.Mesh(new THREE.TorusGeometry(.2, .035, 5, 8, Math.PI), accentMat); horn.position.set(side * .2, .92, .48); horn.rotation.z = side * .7; head.add(horn); } }
    if (spec.kind === 'spider') { for (let i = 0; i < 4; i += 1) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(.025, .04, .56, 5), accentMat); const side = i % 2 ? 1 : -1; leg.position.set(side * (.42 + (i % 3) * .04), .2, (i - 1.5) * .22); leg.rotation.z = side * .95; rig.add(leg); } }
    if (spec.kind === 'mosquito') { const proboscis = new THREE.Mesh(new THREE.CylinderGeometry(.025, .035, .45, 5), accentMat); proboscis.rotation.x = Math.PI * .5; proboscis.position.set(0, .62, .68); head.add(proboscis); }
    const rigState = { root: rig, body, head, wings, hit: 0, overtake: 0, win: 0, phase: isPlayer ? 0 : .7, materials: [bodyMat, accentMat, darkMat, eyeMat, pupilMat, wingMat], update(dt, speed, steering) { this.phase += dt * (2 + Math.abs(speed) * .04); this.hit = Math.max(0, this.hit - dt); this.overtake = Math.max(0, this.overtake - dt); this.win = Math.max(0, this.win - dt); const bounce = Math.sin(this.phase * 7) * .035; this.root.position.y = 1.52 + bounce + (this.win > 0 ? Math.sin(this.phase * 10) * .11 : 0); this.head.rotation.z = (this.hit > 0 ? Math.sin(this.phase * 19) * .32 : 0) - steering * .1; this.head.rotation.x = this.hit > 0 ? -.15 : 0; this.wings.rotation.y = Math.sin(this.phase * 6) * .06; this.body.rotation.z = -steering * .12; } };
    return rigState;
  }

  function disposeGroup(group) { if (!group) return; group.traverse((object) => { if (object.geometry) object.geometry.dispose(); if (object.material) { const materials = Array.isArray(object.material) ? object.material : [object.material]; materials.forEach((material) => material.dispose()); } }); }
  function sampleTrack(progress, lateral, out) { racer.world.track.sampleAt(wrap(progress), out); out.position.addScaledVector(out.right, lateral || 0); return out; }
  function addSceneProp(group, progress, lateral, builder) { const frame = { position: new THREE.Vector3(), tangent: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3() }; racer.world.track.sampleAt(progress, frame); const prop = builder(); prop.position.copy(frame.position).addScaledVector(frame.right, lateral); prop.position.y += .05; prop.rotation.y = Math.atan2(frame.tangent.x, frame.tangent.z); group.add(prop); return prop; }
  function makeFlower() { const group = new THREE.Group(); const petal = createMaterial(0xff8da1); const center = createMaterial(0xffd95c); for (let i = 0; i < 5; i += 1) { const p = new THREE.Mesh(new THREE.SphereGeometry(.22, 7, 5), petal); p.position.set(Math.cos(i * 1.256) * .28, .8 + Math.sin(i * 1.256) * .08, Math.sin(i * 1.256) * .28); group.add(p); } group.add(addBox(group, new THREE.CylinderGeometry(.045, .06, 1.2, 6), createMaterial(0x2f8a5d), [0, .3, 0])); group.add(new THREE.Mesh(new THREE.SphereGeometry(.16, 7, 5), center)); return group; }
  function makeLantern() { const group = new THREE.Group(); group.add(addBox(group, new THREE.CylinderGeometry(.06, .08, 1.1, 6), createMaterial(0x40545a), [0, .45, 0])); const glow = createMaterial(0x8ff6c8, { emissive: 0x43eaa5, emissiveIntensity: 2.6, toneMapped: false }); group.add(addBox(group, new THREE.SphereGeometry(.26, 8, 6), glow, [0, 1.1, 0])); return group; }
  function makeTool() { const group = new THREE.Group(); group.add(addBox(group, new THREE.BoxGeometry(.16, .16, 1.7), createMaterial(0x8c5b38), [0, .52, 0])); group.add(addBox(group, new THREE.BoxGeometry(.5, .16, .22), createMaterial(0xd1d7d0, { metalness: .55 }), [0, 1.3, 0])); return group; }
  function makePicket() { const group = new THREE.Group(); const wood = createMaterial(0xead095); for (const side of [-1, 1]) group.add(addBox(group, new THREE.BoxGeometry(.15, .8, .15), wood, [side * .48, .4, 0])); group.add(addBox(group, new THREE.BoxGeometry(1.2, .18, .12), wood, [0, .55, 0])); return group; }
  function makeLily() { const group = new THREE.Group(); const green = createMaterial(0x55b86e); group.add(addBox(group, new THREE.CylinderGeometry(.55, .55, .08, 8), green, [0, .05, 0])); group.add(addBox(group, new THREE.ConeGeometry(.22, .38, 6), createMaterial(0xf4a5cf), [.1, .28, .05])); return group; }
  function buildTrackArt(data) {
    if (!racer) return;
    titleArt = new THREE.Group(); titleArt.name = 'Buzz GP authored backyard dressing';
    const dressing = data.dressing || [];
    for (let i = 0; i < 34; i += 1) { const progress = (i * .037 + .015) % 1; const side = i % 2 ? 1 : -1; const lateral = side * (8.5 + (i % 4) * 1.1); const type = dressing[i % dressing.length] || 'flower'; const builder = type === 'lantern' || type === 'firefly' || type === 'jar' ? makeLantern : type === 'tool' || type === 'hose' || type === 'wheelbarrow' ? makeTool : type === 'lily' || type === 'pond' || type === 'cattail' ? makeLily : type === 'fence' || type === 'packet' ? makePicket : makeFlower; const prop = addSceneProp(titleArt, progress, lateral, builder); const scale = .72 + (i % 5) * .1; prop.scale.setScalar(scale); if (type === 'lantern' || type === 'firefly') prop.position.y += .4; }
    for (const feature of data.hazards || []) { const lanes = feature.lanes || [0]; for (const lane of lanes) { const prop = addSceneProp(titleArt, feature.at, lane * 1.15 + (lane >= 0 ? 3.8 : -3.8), feature.kind === 'hammer' || feature.kind === 'barrow' ? makeTool : feature.kind === 'lilypad' ? makeLily : makeFlower); prop.scale.setScalar(1.45); } }
    racer.world.scene.add(titleArt);
  }
  function buildItemBoxes(data) {
    itemBoxes = [];
    if (!racer) return;
    const boxGeometry = new THREE.BoxGeometry(.66, .66, .66); const boxMaterial = createMaterial(0xffca3a, { emissive: 0x8c4e12, emissiveIntensity: .45, metalness: .22 }); const ringGeometry = new THREE.TorusGeometry(.22, .055, 6, 10); const ringMaterial = createMaterial(0xfff4bb, { emissive: 0xffca3a, emissiveIntensity: 1.6, toneMapped: false });
    const rows = data.itemRows || [.1, .23, .36, .5, .64, .78, .9];
    const lanes = [-3.35, 0, 3.35];
    for (let row = 0; row < rows.length; row += 1) for (let lane = 0; lane < lanes.length; lane += 1) { const group = new THREE.Group(); group.name = 'pooled item box'; group.add(new THREE.Mesh(boxGeometry, boxMaterial)); const ring = new THREE.Mesh(ringGeometry, ringMaterial); ring.rotation.x = Math.PI * .5; group.add(ring); const frame = { position: new THREE.Vector3(), tangent: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3() }; racer.world.track.sampleAt(rows[row], frame); group.position.copy(frame.position).addScaledVector(frame.right, lanes[lane]); group.position.y += .86; group.rotation.y = Math.atan2(frame.tangent.x, frame.tangent.z); racer.world.scene.add(group); itemBoxes.push({ group, progress: rows[row], lane: lanes[lane], baseY: group.position.y, active: true, cooldown: 0, phase: row * .8 + lane }); }
  }
  function buildHazards(data) { hazards = []; for (const feature of data.hazards || []) for (const lane of feature.lanes || [0]) hazards.push({ progress: feature.at, lane, kind: feature.kind, cooldown: 0 }); }
  function buildBursts() { bursts = []; if (!racer) return; const geometry = new THREE.IcosahedronGeometry(.12, 0); const material = createMaterial(0xffe07b, { emissive: 0xff8e2e, emissiveIntensity: 1.8, toneMapped: false }); for (let i = 0; i < 36; i += 1) { const mesh = new THREE.Mesh(geometry, material); mesh.visible = false; racer.world.scene.add(mesh); bursts.push({ mesh, life: 0, max: 0, vx: 0, vy: 0, vz: 0 }); } }
  function spawnBurst(progress, lateral, color) { if (!racer || !kit.juice.enabled) return; let burst = bursts.find((entry) => entry.life <= 0); if (!burst) burst = bursts[0]; sampleTrack(progress, lateral, sampleCache); burst.mesh.position.copy(sampleCache.position).addScaledVector(sampleCache.up, 1.1); burst.mesh.material.color.set(color || 0xffe07b); burst.mesh.visible = true; burst.life = .34; burst.max = .34; burst.vx = (rand() - .5) * 5; burst.vy = 2 + rand() * 3; burst.vz = (rand() - .5) * 5; }
  function updateBursts(dt) { for (const burst of bursts) { if (burst.life <= 0) continue; burst.life -= dt; burst.mesh.position.x += burst.vx * dt; burst.mesh.position.y += burst.vy * dt; burst.mesh.position.z += burst.vz * dt; burst.vy -= 9 * dt; const alpha = clamp(burst.life / burst.max, 0, 1); burst.mesh.scale.setScalar(.4 + (1 - alpha) * .8); burst.mesh.visible = burst.life > 0; } }

  function makeProjectile() { const group = new THREE.Group(); const body = new THREE.Mesh(new THREE.SphereGeometry(.22, 8, 6), createMaterial(0xffc33e, { emissive: 0xff7a2e, emissiveIntensity: 1.8, toneMapped: false })); group.add(body); const trail = new THREE.Mesh(new THREE.SphereGeometry(.08, 6, 5), createMaterial(0xfff4b4, { emissive: 0xffca3a, emissiveIntensity: 2, toneMapped: false })); trail.position.z = -.3; group.add(trail); group.visible = false; racer.world.scene.add(group); return { group, active: false, progress: 0, lateral: 0, speed: .18, type: '', owner: 'player', target: -1, age: 0 }; }
  function buildProjectiles() { projectiles = []; if (!racer) return; for (let i = 0; i < 24; i += 1) projectiles.push(makeProjectile()); }
  function spawnProjectile(type, lateral, target) { const projectile = projectiles.find((entry) => !entry.active) || projectiles[0]; projectile.active = true; projectile.type = type; projectile.owner = 'player'; projectile.progress = sim.progress + .012; projectile.lateral = lateral == null ? sim.lateral : lateral; projectile.speed = type === 'homing-hornet' ? .24 : .22; projectile.target = target == null ? -1 : target; projectile.age = 0; projectile.group.visible = true; sfx(type === 'homing-hornet' ? 'hornet' : type === 'pebble-triple' ? 'pebble' : 'item'); }
  function hitTarget(target, type) { if (target === 'player') { if (sim.shield > 0) { sim.shield = 0; sfx('shield'); setToast('Bubble blocked the hit', .85); spawnBurst(sim.progress, sim.lateral, 0x78e5ef); if (racer) racer.world.fx.impact(3); return; } sim.hit = .5; sim.spin = .62; sim.spinDir = rand() > .5 ? 1 : -1; sim.speed *= .68; spawnBurst(sim.progress, sim.lateral, 0xf46e5f); sfx('hit'); if (racer) racer.world.fx.impact(7); if (bugRigs[0]) bugRigs[0].hit = .5; setToast('Buzzed!', .65); return; } const rival = ai[target]; if (!rival || rival.balloons <= 0) return; rival.hit = .45; rival.spin = .58; rival.speed *= .7; if (raceMode === 'battle') rival.balloons = Math.max(0, rival.balloons - 1); if (bugRigs[target + 1]) bugRigs[target + 1].hit = .45; spawnBurst(rival.progress, rival.lateral, 0xffc33e); }
  function updateProjectiles(dt) { for (const projectile of projectiles) { if (!projectile.active) continue; projectile.age += dt; if (projectile.type === 'homing-hornet' && projectile.target >= 0 && ai[projectile.target]) { const target = ai[projectile.target]; let delta = target.lateral - projectile.lateral; projectile.lateral += clamp(delta, -dt * 7, dt * 7); } projectile.progress = wrap(projectile.progress + projectile.speed * dt); sampleTrack(projectile.progress, projectile.lateral, sampleCache); projectile.group.position.copy(sampleCache.position).addScaledVector(sampleCache.up, .9); projectile.group.rotation.y = Math.atan2(sampleCache.tangent.x, sampleCache.tangent.z); let hit = false; const progressDelta = (a, b) => Math.abs(wrap(a - b)) < .012 || Math.abs(wrap(b - a)) < .012; if (projectile.owner === 'player') { if (progressDelta(projectile.progress, sim.progress) && Math.abs(projectile.lateral - sim.lateral) < 1.3 && projectile.age > .15) { hitTarget('player', projectile.type); hit = true; } for (let i = 0; i < ai.length && !hit; i += 1) if (progressDelta(projectile.progress, ai[i].progress) && Math.abs(projectile.lateral - ai[i].lateral) < 1.5 && projectile.age > .15) { hitTarget(i, projectile.type); hit = true; } } if (projectile.age > 1.8 || hit) { projectile.active = false; projectile.group.visible = false; } } }

  function weightedItem(position) { const weights = ITEM_WEIGHTS[clamp(position - 1, 0, ITEM_WEIGHTS.length - 1)]; let total = 0; for (const weight of weights) total += weight; let pick = rand() * total; for (let i = 0; i < weights.length; i += 1) { pick -= weights[i]; if (pick <= 0) return i; } return weights.length - 1; }
  function collectItem() { for (const box of itemBoxes) { if (!box.active || Math.abs(wrap(sim.progress - box.progress)) > .017 || Math.abs(sim.lateral - box.lane) > 2.15) continue; box.active = false; box.cooldown = 1.35; sim.item = FORCE.item ? ITEMS.findIndex((item) => item.id === FORCE.item) : weightedItem(sim.pos); FORCE.item = ''; box.group.visible = false; setToast(ITEMS[sim.item].name, .8); sfx('pickup'); spawnBurst(sim.progress, sim.lateral, ITEMS[sim.item].color); return; } }
  function useHeldItem() { if (sim.item < 0 || sim.phase !== 'race') return; const item = ITEMS[sim.item]; sim.item = -1; if (item.id === 'acorn-shot') spawnProjectile(item.id, sim.lateral, -1); else if (item.id === 'homing-hornet') { let target = -1; let best = 1; for (let i = 0; i < ai.length; i += 1) { const delta = wrap(ai[i].progress - sim.progress); if (delta > .01 && delta < best) { target = i; best = delta; } } spawnProjectile(item.id, sim.lateral, target); } else if (item.id === 'sap-slick') { hazards.push({ progress: wrap(sim.progress - .025), lane: sim.lateral, kind: 'sap', cooldown: .2 }); sfx('sap'); setToast('Sap Slick dropped', .8); } else if (item.id === 'bubble-shield') { sim.shield = 8; sfx('shield'); setToast('Bubble Shield', .8); } else if (item.id === 'nectar-boost') { sim.boost = Math.max(sim.boost, 1.8); sim.speed += 10; sfx('boost'); setToast('Nectar Boost', .8); } else if (item.id === 'swarm-surge') { for (let i = 0; i < ai.length; i += 1) if (ai[i].distance > sim.distance) hitTarget(i, item.id); sfx('swarm'); setToast('Swarm Surge!', 1); } else if (item.id === 'pebble-triple') { spawnProjectile(item.id, sim.lateral - 1.1, -1); spawnProjectile(item.id, sim.lateral, -1); spawnProjectile(item.id, sim.lateral + 1.1, -1); sfx('pebble'); setToast('Pebble Triple', .8); } }

  function clearTouchControls() { touchPointers.clear(); input.left = false; input.right = false; input.hop = false; input.item = false; input.pause = false; }
  function bindTouchButton(id, zone) { const button = $(id); button.addEventListener('pointerdown', (event) => { if (kit.paused) return; event.preventDefault(); event.stopPropagation(); kit.input.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, downAt: performance.now(), zone }); touchPointers.set(event.pointerId, zone); if (zone === 'item') input.item = true; }); button.addEventListener('pointerup', (event) => { const active = touchPointers.get(event.pointerId); touchPointers.delete(event.pointerId); kit.input.pointers.delete(event.pointerId); if (active === 'left') input.left = false; if (active === 'right') input.right = false; if (active === 'hop') input.hop = false; if (active === 'item') input.item = false; }); button.addEventListener('pointercancel', (event) => { const active = touchPointers.get(event.pointerId); touchPointers.delete(event.pointerId); kit.input.pointers.delete(event.pointerId); if (active === 'left') input.left = false; if (active === 'right') input.right = false; if (active === 'hop') input.hop = false; if (active === 'item') input.item = false; }); button.addEventListener('pointerleave', (event) => { if (event.buttons === 0) button.dispatchEvent(new PointerEvent('pointerup', event)); }); if (zone === 'left' || zone === 'right' || zone === 'hop') button.addEventListener('pointerdown', () => { if (zone === 'left') input.left = true; if (zone === 'right') input.right = true; if (zone === 'hop') input.hop = true; }); }
  function readInput() { let left = input.left || kit.input.keyDown('ArrowLeft') || kit.input.keyDown('KeyA'); let right = input.right || kit.input.keyDown('ArrowRight') || kit.input.keyDown('KeyD'); const hop = input.hop || kit.input.keyDown('Space') || kit.input.keyDown('ArrowUp'); const item = input.item || kit.input.keyDown('Enter') || kit.input.keyDown('KeyE'); try { const pad = navigator.getGamepads && navigator.getGamepads()[0]; if (pad) { left = left || pad.axes[0] < -.25 || pad.buttons[14]?.pressed; right = right || pad.axes[0] > .25 || pad.buttons[15]?.pressed; } } catch (error) { /* no gamepad */ } return { left: !!left, right: !!right, hop: !!hop, item: !!item }; }

  function resetRaceState(mode) { sim.phase = 'race'; sim.mode = mode; sim.progress = 0; sim.distance = 0; sim.lap = 1; sim.pos = 8; sim.time = 0; sim.lapTime = 0; sim.speed = 0; sim.steer = 0; sim.lateral = 0; sim.drift = false; sim.driftCharge = 0; sim.driftTier = 0; sim.hop = 0; sim.hopCooldown = 0; sim.jump = 0; sim.trick = 0; sim.boost = 0; sim.hit = 0; sim.spin = 0; sim.spinDir = 1; sim.draft = 0; sim.item = FORCE.item ? ITEMS.findIndex((item) => item.id === FORCE.item) : -1; sim.shield = 0; sim.balloons = 3; sim.battleTime = 0; sim.countdown = 3; sim.countdownTick = 3; sim.jumpHeld = false; sim.itemHeld = false; sim.finishReason = ''; sim.sector = -1; ghostSampleTimer = 0; ghostRecord = []; ghostReplay = raceMode === 'time-trial' ? (save.ghosts[currentRaceId] || []) : []; currentRaceId = currentRaceId || TRACKS[0].id; resetRandom(raceSeed); for (let i = 0; i < ai.length; i += 1) { const entry = ai[i]; entry.distance = -(i + 1) * .024 + (i % 2) * .006; entry.progress = wrap(entry.distance); entry.lateral = (i % 3 - 1) * 1.35; entry.speed = 0; entry.steer = 0; entry.item = -1; entry.itemCooldown = 2.2 + i * .45; entry.hit = 0; entry.spin = 0; entry.balloons = 3; entry.aggression = entry.racer.aggression; entry.personality = i % 4; } updateDebug(); }
  function updateCountdown(dt) { if (sim.countdown <= 0) return false; const before = Math.ceil(sim.countdown); sim.countdown -= dt; const now = Math.ceil(Math.max(0, sim.countdown)); if (now !== before && now >= 1) { sim.countdownTick = now; sfx('ui', { rate: 1 + (3 - now) * .12 }); setToast(String(now), .55); } if (sim.countdown <= 0 && before > 0) { sim.countdownTick = 0; setToast('GO', .6); sfx('fanfare', { volume: .3 }); } return true; }
  function updatePlayer(dt) {
    const controls = readInput(); const steerInput = (controls.left ? -1 : 0) + (controls.right ? 1 : 0); sim.steer += (steerInput - sim.steer) * Math.min(1, dt * 12); const ccScale = currentCC / 100; const entry = currentRacer(); const maxSpeed = (24 + currentCC * .1) * entry.speed; const accelerating = sim.countdown <= 0; const targetSpeed = accelerating ? maxSpeed + (sim.boost > 0 ? 13 : 0) : 0; const accel = entry.id === 'skeet' ? 4.8 : 3.3; sim.speed += (targetSpeed - sim.speed) * Math.min(1, dt * accel); if (sim.hit > 0) sim.hit = Math.max(0, sim.hit - dt); if (sim.spin > 0) { sim.spin -= dt; sim.speed *= Math.max(.86, 1 - dt * .4); } if (sim.boost > 0) sim.boost = Math.max(0, sim.boost - dt); if (sim.shield > 0) sim.shield = Math.max(0, sim.shield - dt); if (sim.hopCooldown > 0) sim.hopCooldown -= dt; if (sim.hop > 0) sim.hop -= dt;
    const pressedHop = controls.hop && !sim.jumpHeld; const releasedHop = !controls.hop && sim.jumpHeld; sim.jumpHeld = controls.hop; if (pressedHop && sim.hopCooldown <= 0 && sim.speed > 5) { sim.hop = .18; sim.hopCooldown = .42; if (Math.abs(sim.steer) > .12) { sim.drift = true; sim.driftCharge = Math.max(sim.driftCharge, .05); sfx('drift'); } }
    if (sim.drift) { sim.driftCharge += dt * (.95 + Math.abs(sim.steer) * .72); sim.driftTier = sim.driftCharge > 1.05 ? 2 : sim.driftCharge > .42 ? 1 : 0; if (kit.juice.enabled && sim.driftTier > 0 && racer) racer.world.fx.spawnSpark(racer.world.mainCar.root.position, { x: 0, y: .7, z: 0 }); }
    if (releasedHop && sim.drift) { if (sim.driftTier === 1) { sim.boost = .6; sim.speed += 6; setToast('Mini turbo', .6); sfx('boost'); } else if (sim.driftTier === 2) { sim.boost = 1.05; sim.speed += 10; setToast('Super mini turbo', .75); sfx('boost', { rate: 1.15 }); } sim.drift = false; sim.driftCharge = 0; sim.driftTier = 0; }
    sim.lateral += sim.steer * (3.1 + sim.speed * .055) * dt * entry.handling; sim.lateral = clamp(sim.lateral, -5.25, 5.25); sim.progress = wrap(sim.progress + sim.speed * dt / Math.max(1, racer ? racer.world.track.length : 720)); sim.distance += sim.speed * dt / Math.max(1, racer ? racer.world.track.length : 720); sim.time += dt; sim.lapTime += dt; sim.lap = Math.floor(sim.distance) + 1;
    const jump = (trackData.jumpRamps || []).find((ramp) => Math.abs(wrap(sim.progress - ramp.at)) < .014 && Math.abs(sim.lateral - (ramp.lateral || 0)) < 3.2); if (jump && sim.jump <= 0) { sim.jump = .48; sim.trick = controls.hop ? .4 : 0; sfx('jump'); setToast('Trick boost', .55); }
    if (sim.jump > 0) { sim.jump -= dt; if (controls.hop && Math.abs(sim.steer) > .2) sim.trick = Math.max(sim.trick, .18); if (sim.jump <= 0 && sim.trick > 0) { sim.boost = Math.max(sim.boost, .8); sim.speed += 7; setToast('Trick boost', .6); } }
    const offroad = racer && racer.trackQueries.isOffroad ? racer.trackQueries.isOffroad(playerFrame.position) : Math.abs(sim.lateral) > 5.8; if (offroad) sim.speed *= Math.max(.78, 1 - dt * 1.8);
    if (controls.item && !sim.itemHeld) useHeldItem(); sim.itemHeld = controls.item; collectItem();
    if (sim.distance >= LAPS && raceMode !== 'battle') finishRace('finish');
    if (sim.mode === 'battle') { sim.battleTime += dt; if (sim.balloons <= 0 || sim.battleTime > 150) finishRace(sim.balloons <= 0 ? 'buzzed out' : 'time'); }
  }
  function updateAI(dt) {
    const trackLength = racer ? racer.world.track.length : 720; const trackGhost = raceMode === 'time-trial' && ghostReplay.length > 0; for (let i = 0; i < ai.length; i += 1) { const rival = ai[i]; if (trackGhost && i === 0) { const sample = ghostReplay[Math.min(ghostReplay.length - 1, Math.floor(sim.time * 10))]; rival.distance = sample.d; rival.progress = sample.p; rival.lateral = sample.l; rival.speed = Math.max(0, (ghostReplay[Math.min(ghostReplay.length - 1, Math.floor(sim.time * 10) + 1)]?.d || sample.d) - sample.d) * trackLength * 10; rival.steer = 0; continue; } rival.hit = Math.max(0, rival.hit - dt); rival.spin = Math.max(0, rival.spin - dt); const behind = sim.distance - rival.distance; const rubber = clamp(behind * .32, -.09, .12); const target = (19 + currentCC * .085) * rival.racer.speed * (1 + rubber); const response = rival.racer.id === 'skeet' ? 4.1 : 2.8; rival.speed += (target - rival.speed) * Math.min(1, dt * response); if (rival.hit > 0) rival.speed *= .93; rival.progress = wrap(rival.distance); const line = racer && racer.world.track.data.racingLine && racer.world.track.data.racingLine.length ? racer.world.track.data.racingLine[(i + Math.floor(sim.time * 2)) % racer.world.track.data.racingLine.length].lateral : 0; const weave = Math.sin(sim.time * (1.2 + rival.personality * .15) + i) * (rival.racer.handling > 1 ? .65 : .35); rival.lateral += (clamp(line + weave, -3.8, 3.8) - rival.lateral) * Math.min(1, dt * (3 + rival.racer.handling)); rival.steer = clamp((line + weave - rival.lateral) * .3, -1, 1); rival.distance += rival.speed * dt / Math.max(1, trackLength); rival.progress = wrap(rival.distance); rival.itemCooldown -= dt; if (rival.item < 0 && rival.itemCooldown <= 0) { const chance = rival.racer.aggression * dt * .28; if (rand() < chance) rival.item = weightedItem(rival.distance > sim.distance ? 4 : 7); rival.itemCooldown = 3 + rand() * 5; } if (rival.item >= 0 && rival.racer.aggression > .45 && rand() < dt * .07) { const item = ITEMS[rival.item]; if (item.id === 'nectar-boost') rival.speed += 5; else if (item.id === 'homing-hornet' && rival.distance < sim.distance && wrap(sim.progress - rival.progress) < .18) hitTarget('player', item.id); else if (item.id === 'swarm-surge' && rival.distance < sim.distance && rival.distance < -.01) hitTarget('player', item.id); rival.item = -1; } if (rival.progress < .02 && rival.distance > 1) sfx('lap', { volume: .14 }); }
    if (raceMode !== 'battle') { let playerAhead = 0; for (const rival of ai) if (rival.distance > sim.distance) playerAhead += 1; sim.pos = playerAhead + 1; } else { let ahead = 0; for (const rival of ai) if (rival.balloons > sim.balloons || rival.balloons === sim.balloons && rival.distance > sim.distance) ahead += 1; sim.pos = ahead + 1; }
  }
  function updateTrackSystems(dt) { for (const box of itemBoxes) { if (box.cooldown > 0) { box.cooldown -= dt; if (box.cooldown <= 0) { box.active = true; box.group.visible = true; } } box.phase += dt * 3; if (box.group.visible) box.group.position.y = box.baseY + Math.sin(box.phase) * .08; } for (const hazard of hazards) { hazard.cooldown = Math.max(0, hazard.cooldown - dt); if (hazard.cooldown <= 0 && Math.abs(wrap(sim.progress - hazard.progress)) < .014 && Math.abs(sim.lateral - hazard.lane) < 1.9) { hazard.cooldown = 1.4; if (hazard.kind === 'sap') sim.speed *= .72; else { sim.hit = .3; sim.spin = .4; sim.speed *= .82; } if (bugRigs[0]) bugRigs[0].hit = .35; spawnBurst(sim.progress, sim.lateral, hazard.kind === 'sap' ? 0xdf9d52 : 0xf46e5f); sfx('hit', { volume: .55 }); setToast(hazard.kind === 'sap' ? 'Sticky sap' : 'Watch the set piece', .65); } } let draftTarget = false; for (const rival of ai) if (rival.distance > sim.distance && rival.distance - sim.distance < .055 && Math.abs(rival.lateral - sim.lateral) < 1.7) draftTarget = true; sim.draft = draftTarget ? sim.draft + dt : Math.max(0, sim.draft - dt * 1.5); if (sim.draft > .9) { sim.boost = Math.max(sim.boost, .35); sim.draft = 0; setToast('Slipstream', .55); sfx('boost', { rate: 1.3, volume: .35 }); } if (racer && racer.world.fx && sim.drift && sim.driftTier > 0) racer.world.fx.spawnSkid(racer.world.mainCar.root.position, racer.world.mainCar.root.rotation.y); updateProjectiles(dt); updateBursts(dt); if (raceMode === 'time-trial') { ghostSampleTimer -= dt; if (ghostSampleTimer <= 0) { ghostSampleTimer = .1; ghostRecord.push({ t: sim.time, p: sim.progress, l: sim.lateral, d: sim.distance }); if (ghostRecord.length > 3600) ghostRecord.shift(); } } }

  function updateFrames() { if (!racer || !sampleCache) return; racer.world.track.sampleAt(sim.progress, sampleCache); playerFrame.position.copy(sampleCache.position).addScaledVector(sampleCache.right, sim.lateral); playerFrame.yaw = Math.atan2(sampleCache.tangent.x, sampleCache.tangent.z) + sim.steer * .05 + (sim.spin > 0 ? sim.spinDir * sim.spin * 5 : 0); playerFrame.progress = sim.progress; playerFrame.speed = sim.speed; playerFrame.steering = sim.steer; playerFrame.acceleration = sim.boost > 0 ? 6 : 1; playerFrame.lateralG = sim.steer * sim.speed * .03; playerFrame.suspension = sim.jump > 0 ? .16 : Math.sin(sim.time * 12) * .025; playerFrame.pitch = sim.jump > 0 ? -.12 : 0; playerFrame.roll = -sim.steer * .08; playerFrame.boost = sim.boost > 0 ? 1 : 0; for (let i = 0; i < ai.length; i += 1) { const rival = ai[i]; const frame = rivalFrameStates[i]; racer.world.track.sampleAt(rival.progress, sampleCache); frame.position.copy(sampleCache.position).addScaledVector(sampleCache.right, rival.lateral); frame.yaw = Math.atan2(sampleCache.tangent.x, sampleCache.tangent.z) + rival.steer * .04; frame.progress = rival.progress; frame.speed = rival.speed; frame.steering = rival.steer; frame.acceleration = 1; frame.lateralG = rival.steer * rival.speed * .025; frame.suspension = Math.sin(sim.time * 8 + i) * .018; frame.boost = 0; } }
  function updateRigs(dt) { for (let i = 0; i < bugRigs.length; i += 1) { const entry = i === 0 ? { speed: sim.speed, steer: sim.steer } : { speed: ai[i - 1].speed, steer: ai[i - 1].steer }; bugRigs[i].update(dt, entry.speed, entry.steer); } if (sim.phase === 'finish' && bugRigs[0]) bugRigs[0].win = 2; }
  function stepSim(dt) { if (sim.phase !== 'race' || kit.paused) return; if (updateCountdown(dt)) { updateFrames(); return; } updatePlayer(dt); updateAI(dt); updateTrackSystems(dt); updateFrames(); updateRigs(dt); if (sim.lap > 1 && sim.lapTime < .04) { sfx('lap'); setToast(`Lap ${Math.min(LAPS, sim.lap)}`, .7); } updateDebug(); }

  function makeFramePacket() { return { carState: playerFrame, rivals: rivalFrameStates }; }
  const framePacket = makeFramePacket();
  function renderWorld() { if (racer) { framePacket.carState = playerFrame; framePacket.rivals = rivalFrameStates; const juice = kit.juice.frame(); if (!juice.frozen) racer.world.update(framePacket, 1 / 60); racer.world.render(); } drawHud(); }

  function drawRoundRect(ctx, x, y, w, h, r, fill, stroke) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); } }
  function drawHud() { const size = resizeCanvas(hudCanvas, hudCtx); const w = size.width; const h = size.height; hudCtx.clearRect(0, 0, w, h); if (sim.phase !== 'race' && sim.phase !== 'finish') return; const top = 14 + parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-top') || '0'); hudCtx.font = '800 14px system-ui, sans-serif'; hudCtx.textBaseline = 'middle'; drawRoundRect(hudCtx, 12, top, 130, 48, 13, 'rgba(16,45,50,.78)', 'rgba(255,245,214,.22)'); hudCtx.fillStyle = COLORS.cream; hudCtx.fillText(`P${sim.pos}/${FIELD_SIZE}`, 24, top + 17); hudCtx.fillStyle = '#a9d8c2'; hudCtx.font = '800 12px system-ui, sans-serif'; hudCtx.fillText(raceMode === 'battle' ? `BALLOONS ${sim.balloons}` : `LAP ${Math.min(LAPS, sim.lap)}/${LAPS}`, 24, top + 36); const boxW = 136; drawRoundRect(hudCtx, w - boxW - 12, top, boxW, 48, 13, sim.item >= 0 ? 'rgba(255,202,58,.9)' : 'rgba(16,45,50,.78)', sim.item >= 0 ? 'rgba(255,246,192,.92)' : 'rgba(255,245,214,.22)'); hudCtx.fillStyle = sim.item >= 0 ? COLORS.ink : COLORS.cream; hudCtx.font = '900 12px system-ui, sans-serif'; hudCtx.fillText(sim.item >= 0 ? ITEMS[sim.item].short : 'ITEM SLOT', w - boxW + 1, top + 24); if (sim.shield > 0) { hudCtx.fillStyle = '#78e5ef'; hudCtx.beginPath(); hudCtx.arc(w - 25, top + 24, 8, 0, Math.PI * 2); hudCtx.fill(); }
    if (racer && minimap.length) { const mapW = Math.min(180, w * .24); const mapH = 64; const mx = w * .5 - mapW * .5; const my = top + 5; drawRoundRect(hudCtx, mx - 8, my - 5, mapW + 16, mapH + 10, 14, 'rgba(16,45,50,.58)', 'rgba(255,245,214,.2)'); let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity; for (const point of minimap) { minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x); minZ = Math.min(minZ, point.z); maxZ = Math.max(maxZ, point.z); } const scale = Math.min((mapW - 12) / Math.max(1, maxX - minX), (mapH - 12) / Math.max(1, maxZ - minZ)); const mapPoint = (point) => [mx + 6 + (point.x - minX) * scale, my + 6 + (point.z - minZ) * scale]; hudCtx.strokeStyle = 'rgba(255,245,214,.7)'; hudCtx.lineWidth = 3; hudCtx.beginPath(); for (let i = 0; i < minimap.length; i += 1) { const p = mapPoint(minimap[i]); if (i === 0) hudCtx.moveTo(p[0], p[1]); else hudCtx.lineTo(p[0], p[1]); } hudCtx.closePath(); hudCtx.stroke(); const playerIndex = Math.floor(sim.progress * minimap.length) % minimap.length; const pp = mapPoint(minimap[playerIndex]); hudCtx.fillStyle = COLORS.honey; hudCtx.beginPath(); hudCtx.arc(pp[0], pp[1], 4, 0, Math.PI * 2); hudCtx.fill(); }
    const speedX = w * .5; const speedY = h - 29; hudCtx.strokeStyle = 'rgba(255,245,214,.25)'; hudCtx.lineWidth = 4; hudCtx.beginPath(); hudCtx.arc(speedX, speedY, 28, Math.PI * 1.1, Math.PI * 1.9); hudCtx.stroke(); hudCtx.strokeStyle = COLORS.honey; hudCtx.beginPath(); hudCtx.arc(speedX, speedY, 28, Math.PI * 1.1, Math.PI * (1.1 + .8 * clamp(sim.speed / 40, 0, 1))); hudCtx.stroke(); hudCtx.fillStyle = COLORS.cream; hudCtx.font = '900 12px system-ui, sans-serif'; hudCtx.textAlign = 'center'; hudCtx.fillText(`${Math.round(sim.speed * 3.6)}`, speedX, speedY - 2); hudCtx.font = '800 9px system-ui, sans-serif'; hudCtx.fillStyle = '#a9d8c2'; hudCtx.fillText('KM/H', speedX, speedY + 12); hudCtx.textAlign = 'left'; if (sim.driftTier > 0) { const driftW = 92; drawRoundRect(hudCtx, 14, h - 42, driftW, 8, 4, 'rgba(16,45,50,.72)'); hudCtx.fillStyle = sim.driftTier === 2 ? '#f46e5f' : '#ffca3a'; hudCtx.fillRect(14, h - 42, driftW * clamp(sim.driftCharge / 1.05, 0, 1), 8); }
    if (toastTimer > 0 && menuToast) { const toastW = Math.min(w - 32, Math.max(110, hudCtx.measureText(menuToast).width + 34)); drawRoundRect(hudCtx, w * .5 - toastW * .5, top + 76, toastW, 30, 11, 'rgba(255,245,214,.9)'); hudCtx.fillStyle = COLORS.ink; hudCtx.font = '900 13px system-ui, sans-serif'; hudCtx.textAlign = 'center'; hudCtx.fillText(menuToast, w * .5, top + 91); hudCtx.textAlign = 'left'; }
    if (sim.countdown > 0) { hudCtx.textAlign = 'center'; hudCtx.fillStyle = COLORS.cream; hudCtx.font = '900 54px ui-rounded, system-ui, sans-serif'; hudCtx.fillText(String(Math.ceil(sim.countdown)), w * .5, h * .42); hudCtx.textAlign = 'left'; }
  }

  function renderRoster() { const roster = $('roster'); if (!roster) return; roster.innerHTML = ''; for (const entry of RACERS) { const chip = document.createElement('div'); chip.className = 'racer-chip'; const swatch = document.createElement('div'); swatch.className = 'swatch'; swatch.style.background = `#${entry.paint.toString(16).padStart(6, '0')}`; chip.appendChild(swatch); const name = document.createElement('strong'); name.textContent = save.unlockedRacers.includes(entry.id) ? entry.name : '???'; chip.appendChild(name); const trait = document.createElement('span'); trait.textContent = save.unlockedRacers.includes(entry.id) ? entry.trait : 'earn 4 gold medals'; chip.appendChild(trait); chip.addEventListener('click', () => { if (!save.unlockedRacers.includes(entry.id)) return; save.racer = entry.id; persist(); renderMenu(); setToast(`${entry.name} selected`, .8); }); roster.appendChild(chip); } }
  function renderMenu() { $('mode-select').value = raceMode; $('cup-select').value = String(currentCup); $('cc-select').value = String(currentCC); $('cc-select').disabled = !save.unlocked150; $('save-summary').textContent = `${Object.keys(save.medals).length}/12 medals  |  ${save.unlocked150 ? '150cc unlocked' : 'Earn 4 silver medals to unlock 150cc'}  |  ${currentRacer().name} / ${skinById(save.skin).name}`; renderRoster(); }
  function showMenu() { menuPanel.innerHTML = baseMenuMarkup; menu.style.display = 'flex'; pauseCard.style.display = 'none'; $('touch-left').style.display = 'none'; $('touch-right').style.display = 'none'; $('touch-hop').style.display = 'none'; $('touch-item').style.display = 'none'; bindMenu(); renderMenu(); if (racer) { racer.world.setPaused(true); } sim.phase = 'menu'; sim.mode = 'grand-prix'; updateDebug(); }
  function bindMenu() { $('start-button').addEventListener('click', () => { raceMode = $('mode-select').value; currentCup = Number($('cup-select').value); currentCC = Number($('cc-select').value); if (!save.unlocked150 && currentCC === 150) currentCC = 100; const selectedTrack = raceMode === 'battle' ? BATTLE_TRACKS[0] : raceMode === 'time-trial' ? TRACKS[CUPS[currentCup].tracks[0]].id : TRACKS[CUPS[currentCup].tracks[0]].id; startRace({ trackId: selectedTrack, cup: currentCup, cc: currentCC, mode: raceMode }); }); $('garage-button').addEventListener('click', () => { const next = save.skins[(save.skins.indexOf(save.skin) + 1) % save.skins.length]; save.skin = next; persist(); renderMenu(); setToast(`${skinById(next).name} skin equipped`, .8); }); $('settings-button').addEventListener('click', () => kit.openSettings([{ label: 'Class: ' + currentCC, get: () => currentCC === 150, set: () => { if (save.unlocked150) currentCC = currentCC === 150 ? 100 : 150; renderMenu(); } }])); }
  function showRaceControls() { for (const id of ['touch-left', 'touch-right', 'touch-hop', 'touch-item']) $(id).style.display = 'block'; }
  function showCoach(text) { coach.textContent = text; coach.classList.add('visible'); window.clearTimeout(showCoach.timer); showCoach.timer = window.setTimeout(() => coach.classList.remove('visible'), 3100); }
  function showFinishCard(reason) { menuPanel.innerHTML = ''; const eyebrow = document.createElement('p'); eyebrow.className = 'eyebrow'; eyebrow.textContent = raceMode === 'battle' ? 'Balloon Battle' : `${CUP_NAMES[currentCup]} boundary`; menuPanel.appendChild(eyebrow); const title = document.createElement('h2'); title.textContent = reason === 'finish' ? (raceMode === 'grand-prix' ? 'Podium ceremony' : 'Run complete') : reason === 'buzzed out' ? 'Buzzy finish' : 'Time called'; menuPanel.appendChild(title); const body = document.createElement('p'); body.className = 'tagline'; body.textContent = raceMode === 'grand-prix' ? `${TRACKS.find((track) => track.id === currentRaceId)?.name || 'Track'} complete. ${formatTime(sim.time)}. ${medalFor(sim.time).toUpperCase()} medal pace.` : raceMode === 'time-trial' ? `Best line: ${formatTime(sim.time)}. Ghost recorded through GGKit save.` : `${sim.balloons} balloons remain. Last bug buzzing wins the pond.`; menuPanel.appendChild(body); const standings = document.createElement('div'); standings.className = 'small'; const field = [{ name: currentRacer().name, distance: sim.distance, balloons: sim.balloons }].concat(ai.map((entry) => ({ name: entry.racer.name, distance: entry.distance, balloons: entry.balloons }))).sort((a, b) => raceMode === 'battle' ? b.balloons - a.balloons || b.distance - a.distance : b.distance - a.distance); standings.innerHTML = field.slice(0, 4).map((entry, index) => `${index + 1}. ${entry.name} <span style="color:${index === 0 ? COLORS.honey : '#a9d8c2'}">${raceMode === 'battle' ? '●'.repeat(entry.balloons) : formatTime(Math.max(0, sim.time - index * .07))}</span>`).join('<br>'); menuPanel.appendChild(standings); const row = document.createElement('div'); row.className = 'menu-row'; const action = document.createElement('button'); action.className = 'primary'; const nextIndex = currentCupTrackIndex + 1; if (raceMode === 'grand-prix' && nextIndex < 4) { action.textContent = 'Next track'; action.addEventListener('click', () => startRace({ trackId: TRACKS[CUPS[currentCup].tracks[nextIndex]].id, cup: currentCup, cc: currentCC, mode: raceMode, cupTrackIndex: nextIndex })); } else { action.textContent = 'Return to menu'; action.addEventListener('click', () => showMenu()); } row.appendChild(action); const restart = document.createElement('button'); restart.className = 'secondary'; restart.textContent = 'Race again'; restart.addEventListener('click', () => startRace({ trackId: currentRaceId, cup: currentCup, cc: currentCC, mode: raceMode, cupTrackIndex: currentCupTrackIndex })); row.appendChild(restart); menuPanel.appendChild(row); menu.style.display = 'flex'; $('touch-left').style.display = 'none'; $('touch-right').style.display = 'none'; $('touch-hop').style.display = 'none'; $('touch-item').style.display = 'none'; }

  function finishRace(reason) { if (sim.phase !== 'race') return; sim.phase = 'finish'; sim.finishReason = reason; if (raceMode === 'grand-prix' || raceMode === 'time-trial') { const medal = medalFor(sim.time); saveMedal(currentRaceId, medal); if (raceMode === 'time-trial' && (!save.bestTT[currentRaceId] || sim.time < save.bestTT[currentRaceId])) { save.bestTT[currentRaceId] = sim.time; save.ghosts[currentRaceId] = ghostRecord.slice(0, 3600); } updateUnlocks(); persist(); } if (racer) racer.world.fx.impact(2); sfx('fanfare'); showFinishCard(reason); updateDebug(); }

  async function ensureWorld(data) { if (!THREE || !createRacerWorld) return false; if (racer) { racer.world.dispose(); racer = null; } trackData = data; const entry = currentRacer(); const skin = skinById(save.skin); try { racer = createRacerWorld({ canvas: sceneCanvas, trackJSON: data, theme: data.theme || 'coastal', timeOfDay: data.timeOfDay || 'dusk', ggkit: kit, rivalCount: 7, carName: `${entry.name} kart`, paint: skin.paint, accent: skin.accent, seed: raceSeed }); GGKit.hiDpi.three(racer.world.renderer); racer.world.resize(); racer.world.mainCar.setLivery({ paint: skin.paint, accent: skin.accent }); for (let i = 0; i < racer.world.rivals.length; i += 1) racer.world.rivals[i].setLivery({ paint: ai[i].racer.paint, accent: ai[i].racer.accent }); sampleCache = { position: new THREE.Vector3(), tangent: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3() }; playerFrame = { position: new THREE.Vector3(), yaw: 0, progress: 0, speed: 0, steering: 0, acceleration: 0, lateralG: 0, suspension: 0, pitch: 0, roll: 0, boost: 0 }; rivalFrameStates = []; for (let i = 0; i < 7; i += 1) rivalFrameStates.push({ position: new THREE.Vector3(), yaw: 0, progress: 0, speed: 0, steering: 0, acceleration: 0, lateralG: 0, suspension: 0, boost: 0 }); minimap = racer.minimap; buildTrackArt(data); buildItemBoxes(data); buildHazards(data); buildBursts(); buildProjectiles(); bugRigs = [makeBugRig(entry, racer.world.mainCar.root, true)]; for (let i = 0; i < 7; i += 1) bugRigs.push(makeBugRig(ai[i].racer, racer.world.rivals[i].root, false)); liveRenderer = true; sceneCanvas.style.display = 'block'; fallbackCanvas.style.visibility = 'hidden'; return true; } catch (error) { engineError = error.message; liveRenderer = false; racer = null; return false; } }
  async function startRace(options) { const entry = options || {}; currentRaceId = entry.trackId || currentRaceId || TRACKS[0].id; if (entry.mode) raceMode = entry.mode; currentCup = safeNumber(entry.cup, currentCup); currentCC = save.unlocked150 ? safeNumber(entry.cc, currentCC) : Math.min(100, safeNumber(entry.cc, currentCC)); currentCupTrackIndex = safeNumber(entry.cupTrackIndex, CUPS[currentCup]?.tracks.indexOf(resolveTrack(currentRaceId).index) || 0); if (raceMode === 'battle') currentRaceId = BATTLE_TRACKS.includes(currentRaceId) ? currentRaceId : BATTLE_TRACKS[0]; kit.loader.show('LOADING TRACK'); kit.loader.progress(.18); trackData = await loadTrack(currentRaceId); kit.loader.progress(.48); const worldReady = await ensureWorld(trackData); kit.loader.progress(1); kit.loader.hide(); menu.style.display = 'none'; pauseCard.style.display = 'none'; showRaceControls(); if (racer) racer.world.setPaused(false); if (!worldReady) fallbackCanvas.style.visibility = 'visible'; resetRaceState(raceMode); if (raceMode === 'time-trial') { ghostReplay = save.ghosts[currentRaceId] || []; showCoach('Thin line: hop into a drift, hold it for two spark tiers, release for turbo.'); } else if (raceMode === 'battle') showCoach('Three balloons. Roll position-weighted items and keep buzzing.'); else showCoach('Dense item rows, shortcuts, ramps. The top line gets weaker rolls.'); kit.audio.music(raceMode === 'battle' ? 'raceB' : 'raceA', 500); updateDebug(); }

  $('resume-button').addEventListener('click', () => kit.resume('manual'));
  $('quit-button').addEventListener('click', () => { kit.resume('manual'); showMenu(); });
  for (const spec of [['touch-left', 'left'], ['touch-right', 'right'], ['touch-hop', 'hop'], ['touch-item', 'item']]) bindTouchButton(spec[0], spec[1]);
  window.addEventListener('keydown', (event) => { if (event.code === 'Escape' && sim.phase === 'race') { if (kit.paused) kit.resume('manual'); else kit.pause('manual'); } });
  window.addEventListener('resize', () => { if (racer) racer.world.resize(); });

  function loop(now) { drawFallback(now); if (!lastFrameAt) lastFrameAt = now; const elapsed = Math.min(80, Math.max(0, now - lastFrameAt)) / 1000; lastFrameAt = now; if (!kit.paused) accumulator += elapsed; let steps = 0; while (accumulator >= STEP && steps < MAX_STEPS) { accumulator -= STEP; stepSim(STEP); steps += 1; } if (steps === MAX_STEPS && accumulator >= STEP) accumulator = STEP * .9; if (toastTimer > 0 && !kit.paused) toastTimer = Math.max(0, toastTimer - elapsed); if (racer && sim.phase !== 'menu') { updateFrames(); updateRigs(elapsed); renderWorld(); } else drawHud(); requestAnimationFrame(loop); }

  async function boot() { kit.loader.show('BUZZ GRAND PRIX'); kit.loader.progress(.1); bindMenu(); renderMenu(); updateDebug(); const params = new URLSearchParams(location.search); if (params.get('forceTrack')) FORCE.track = resolveTrack(params.get('forceTrack')).id; if (params.get('forceCup')) FORCE.cup = clamp(Number(params.get('forceCup')) || 0, 0, 2); if (params.get('forceItem')) FORCE.item = params.get('forceItem'); if (params.get('forceBattle')) FORCE.battle = true; try { const modules = await Promise.all([import('three'), import('../_shared/racer/engine.js')]); THREE = modules[0]; createRacerWorld = modules[1].createRacerWorld; kit.loader.progress(.76); } catch (error) { engineError = error.message; } kit.loader.progress(1); kit.loader.hide(); kit.registerPWA(); if (FORCE.battle) startRace({ trackId: BATTLE_TRACKS[0], cup: 0, cc: currentCC, mode: 'battle' }); else if (params.get('autostart')) startRace({ trackId: FORCE.track, cup: FORCE.cup, cc: currentCC, mode: 'grand-prix' }); requestAnimationFrame(loop); }
  boot();
})();
