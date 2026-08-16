(() => {
  'use strict';

  const VIEW_W = 540;
  const VIEW_H = 960;
  const WORLD_W = 900;
  const WORLD_H = 1500;
  const WORLD_PAD = 34;
  const TAU = Math.PI * 2;
  const MAX_SHELLS = 48;
  const MAX_TRANSIENT_QUEUE = 6;
  const MAX_MINES = 12;
  let DPR = 1;

  const C = {
    ink: 0x071017, field: 0x0b1b27, fieldDeep: 0x08141e,
    grid: 0x153140, gridBright: 0x244959, wall: 0x324955,
    wallLight: 0x7ca3a7, shadow: 0x02070b, white: 0xe7ffff,
    cyan: 0x4de7dc, cyanHot: 0xcffffa, amber: 0xffbb55,
    red: 0xff6474, redHot: 0xffd1d6, purple: 0xc780ff,
    green: 0x83f092, blue: 0x62a8ff, orange: 0xff835f,
    shell: 0xfff5a8, smoke: 0x9bb4bc, water: 0x1f6680,
    glass: 0x102a38, danger: 0xff405a
  };

  const AI_CLASSES = {
    scout: { label: 'SCOUT', color: C.green, accent: C.cyan, hp: 2, speed: 78, turn: 2.8, fire: 1.65, radius: 21, silhouette: 'scout' },
    brawler: { label: 'BRAWLER', color: C.red, accent: C.orange, hp: 4, speed: 46, turn: 1.7, fire: 1.35, radius: 27, silhouette: 'brawler' },
    sniper: { label: 'SNIPER', color: C.purple, accent: C.white, hp: 3, speed: 37, turn: 1.8, fire: 2.7, radius: 22, silhouette: 'sniper' },
    siege: { label: 'SIEGE', color: C.amber, accent: C.redHot, hp: 6, speed: 30, turn: 1.2, fire: 2.2, radius: 31, silhouette: 'siege' }
  };

  const VALID_UNLOCKS = Object.keys(AI_CLASSES);
  const VALID_MEDAL_KEYS = ['duel-1', 'duel-2', 'duel-3', 'duel-4', 'trial', 'gauntlet'];
  const MEDAL_RANK = { C: 0, B: 1, A: 2, S: 3 };

  const ARENA_ALIASES = {
    rubble: 'rubble-alley', alley: 'rubble-alley',
    dockyard: 'dockyard-maze', docks: 'dockyard-maze',
    courtyard: 'open-courtyard', open: 'open-courtyard',
    chamber: 'ricochet-chamber', ricochet: 'ricochet-chamber'
  };

  const rootProbe = window.__ia && typeof window.__ia === 'object' ? window.__ia : {};
  const bootQuery = new URLSearchParams(window.location.search);
  const bootSwitches = {
    arena: rootProbe.forceArena || window.forceArena || bootQuery.get('forceArena') || '',
    aiClass: rootProbe.forceAIClass || window.forceAIClass || bootQuery.get('forceAIClass') || ''
  };

  function validSave(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    if (!Number.isInteger(value.best) || value.best < 0 || value.best > 999999999) return false;
    if (!Array.isArray(value.unlocked) || value.unlocked.length > VALID_UNLOCKS.length) return false;
    if (new Set(value.unlocked).size !== value.unlocked.length || value.unlocked.some((v) => !VALID_UNLOCKS.includes(v))) return false;
    if (typeof value.tutorialSeen !== 'boolean') return false;
    if (!value.medals || typeof value.medals !== 'object' || Array.isArray(value.medals)) return false;
    return Object.keys(value.medals).every((key) => VALID_MEDAL_KEYS.includes(key) && MEDAL_RANK[value.medals[key]] != null);
  }

  const kit = GGKit.create({
    slug: 'ironclad-alley',
    orientation: 'portrait',
    validateSave: validSave,
    onRestart: () => { if (window.__iaScene) window.__iaScene.startMode('campaign'); },
    onPause: () => { if (window.__iaScene) window.__iaScene.pauseReason = 'kit'; },
    onResume: () => { if (window.__iaScene) window.__iaScene.pauseReason = ''; }
  });
  // Keep gamepad polling behind the GGKit input facade beside pointers and keys.
  kit.input.readGamepad = () => {
    if (!navigator.getGamepads) return null;
    let pads;
    try { pads = navigator.getGamepads(); } catch (e) { return null; }
    const pad = Array.from(pads || []).find((candidate) => candidate && candidate.connected);
    if (!pad) return null;
    const axis = (index) => Math.abs(pad.axes[index] || 0) < .16 ? 0 : clamp(pad.axes[index] || 0, -1, 1);
    const button = (index) => !!(pad.buttons[index] && pad.buttons[index].pressed);
    return {
      moveX: axis(0), moveY: axis(1), aimX: axis(2), aimY: axis(3),
      fire: button(0), smoke: button(1), mine: button(2), restart: button(8), start: button(9)
    };
  };
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) kit.juice.enabled = false;

  kit.audio.register({
    engineIdle: 'assets/engine-idle.mp3',
    engineRev: 'assets/engine-rev.mp3',
    cannon: 'assets/cannon.mp3',
    ricochet: 'assets/ricochet.mp3',
    explosion: 'assets/explosion.mp3',
    pickup: 'assets/pickup.mp3',
    damage: 'assets/ricochet.mp3',
    mine: 'assets/explosion.mp3',
    ui: 'assets/pickup.mp3',
    level: 'assets/explosion.mp3'
  });

  function registerPWA() {
    if (!('serviceWorker' in navigator) || location.protocol !== 'https:') return;
    const worker = new URL('sw.js', document.baseURI);
    navigator.serviceWorker.register(worker, { scope: '/play/ironclad-alley/' }).catch(() => kit.registerPWA());
  }
  registerPWA();

  const saved = kit.save.get({
    best: 0,
    unlocked: ['scout'],
    tutorialSeen: false,
    medals: {}
  });
  const profile = {
    best: Number.isFinite(saved.best) ? saved.best : 0,
    unlocked: Array.isArray(saved.unlocked) ? saved.unlocked.filter((v) => VALID_UNLOCKS.includes(v)) : ['scout'],
    tutorialSeen: saved.tutorialSeen === true,
    medals: saved.medals && typeof saved.medals === 'object' && !Array.isArray(saved.medals) ? Object.assign({}, saved.medals) : {}
  };
  if (!profile.unlocked.includes('scout')) profile.unlocked.unshift('scout');

  const probeState = {
    mode: 'campaign', score: 0, lives: 3, level: 1, aiClass: 'scout',
    arena: 'rubble-alley', phase: 'boot', shotsFired: 0, hitsLanded: 0
  };
  window.__ia = Object.assign(rootProbe, {
    state: probeState,
    forceArena: rootProbe.forceArena || bootSwitches.arena || null,
    forceAIClass: rootProbe.forceAIClass || bootSwitches.aiClass || null
  });

  function hashSeed(value) {
    let h = 2166136261 >>> 0;
    const text = String(value);
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    return h >>> 0;
  }

  function rngFrom(seed) {
    let n = seed >>> 0;
    return () => {
      n = (n + 0x6D2B79F5) | 0;
      let t = Math.imul(n ^ (n >>> 15), 1 | n);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function approach(value, target, amount) { return value + clamp(target - value, -amount, amount); }
  function normAngle(angle) {
    while (angle > Math.PI) angle -= TAU;
    while (angle < -Math.PI) angle += TAU;
    return angle;
  }
  function approachAngle(value, target, amount) { return value + clamp(normAngle(target - value), -amount, amount); }
  function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function angleTo(a, b) { return Math.atan2(b.y - a.y, b.x - a.x); }
  function canonicalArena(value) {
    const key = String(value || '').toLowerCase();
    const alias = ARENA_ALIASES[key] || key;
    return ARENA_FAMILIES[alias] ? alias : 'rubble-alley';
  }
  function canonicalAI(value) { return AI_CLASSES[value] ? value : 'scout'; }
  function setTextIfChanged(text, value) { if (text.text !== value) text.setText(value); }

  function addRect(walls, x, y, w, h, kind) {
    if (w > 0 && h > 0) walls.push({ type: 'rect', x, y, w, h, kind: kind || 'cover' });
  }
  function addSegment(walls, x1, y1, x2, y2, kind) {
    walls.push({ type: 'segment', x1, y1, x2, y2, kind: kind || 'angle' });
  }

  const ARENA_FAMILIES = {
    'rubble-alley': {
      label: 'RUBBLE ALLEY', accent: C.orange,
      build: (r) => {
        const walls = [];
        addRect(walls, 220, 170, 28, 330, 'rubble');
        addRect(walls, 650, 250, 28, 330, 'rubble');
        addRect(walls, 270, 650, 210, 26, 'rubble');
        addRect(walls, 500, 850, 210, 26, 'rubble');
        addRect(walls, 170, 1060, 28, 260, 'rubble');
        addRect(walls, 690, 1120, 28, 220, 'rubble');
        addRect(walls, 355, 360 + Math.floor(r() * 80), 90, 24, 'crate');
        addRect(walls, 490, 1030 + Math.floor(r() * 90), 90, 24, 'crate');
        return { walls, props: ['rubble', 'rubble', 'rubble'], floor: 'dust' };
      }
    },
    'dockyard-maze': {
      label: 'DOCKYARD MAZE', accent: C.water,
      build: (r) => {
        const walls = [];
        addRect(walls, 135, 190, 260, 34, 'container');
        addRect(walls, 505, 190, 260, 34, 'container');
        addRect(walls, 135, 410, 34, 310, 'container');
        addRect(walls, 365, 450, 34, 330, 'container');
        addRect(walls, 600, 390, 34, 300, 'container');
        addRect(walls, 735, 670, 34, 350, 'container');
        addRect(walls, 190, 930, 270, 34, 'container');
        addRect(walls, 520, 1080, 270, 34, 'container');
        addRect(walls, 180, 1240, 170, 28, 'crate');
        addRect(walls, 500 + Math.floor(r() * 90), 690, 120, 26, 'crate');
        return { walls, props: ['water', 'water', 'water'], floor: 'dock' };
      }
    },
    'open-courtyard': {
      label: 'OPEN COURTYARD', accent: C.green,
      build: (r) => {
        const walls = [];
        addRect(walls, 135, 300, 130, 90, 'planter');
        addRect(walls, 635, 300, 130, 90, 'planter');
        addRect(walls, 135, 880, 130, 90, 'planter');
        addRect(walls, 635, 880, 130, 90, 'planter');
        addRect(walls, 350, 540, 200, 28, 'low');
        addRect(walls, 350, 1130, 200, 28, 'low');
        addRect(walls, 255, 145 + Math.floor(r() * 60), 390, 20, 'low');
        return { walls, props: ['court', 'court', 'court'], floor: 'stone' };
      }
    },
    'ricochet-chamber': {
      label: 'RICOCHET CHAMBER', accent: C.purple,
      build: (r) => {
        const walls = [];
        addSegment(walls, 120, 300, 340, 190, 'angled');
        addSegment(walls, 560, 190, 780, 300, 'angled');
        addSegment(walls, 125, 670, 315, 790, 'angled');
        addSegment(walls, 585, 790, 775, 670, 'angled');
        addSegment(walls, 170, 1120, 350, 1010, 'angled');
        addSegment(walls, 550, 1010, 730, 1120, 'angled');
        addRect(walls, 410, 360, 80, 22, 'bank');
        addRect(walls, 410, 910, 80, 22, 'bank');
        addRect(walls, 250, 500 + Math.floor(r() * 60), 72, 22, 'bank');
        return { walls, props: ['angles', 'angles', 'angles'], floor: 'chamber' };
      }
    }
  };

  function circleRect(x, y, radius, rect) {
    const nx = clamp(x, rect.x, rect.x + rect.w);
    const ny = clamp(y, rect.y, rect.y + rect.h);
    return Math.hypot(x - nx, y - ny) < radius;
  }
  function pointSegmentDistance(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSq = dx * dx + dy * dy || 1;
    const t = clamp(((px - x1) * dx + (py - y1) * dy) / lengthSq, 0, 1);
    return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
  }
  function pointBlocked(x, y, radius, walls) {
    if (x - radius < WORLD_PAD || y - radius < WORLD_PAD || x + radius > WORLD_W - WORLD_PAD || y + radius > WORLD_H - WORLD_PAD) return true;
    return walls.some((wall) => wall.type === 'rect'
      ? circleRect(x, y, radius, wall)
      : pointSegmentDistance(x, y, wall.x1, wall.y1, wall.x2, wall.y2) < radius + 2);
  }
  function openPosition(candidate, walls, fallback) {
    if (!pointBlocked(candidate.x, candidate.y, 28, walls)) return { x: candidate.x, y: candidate.y };
    for (let radius = 40; radius < 260; radius += 28) {
      for (let i = 0; i < 12; i++) {
        const a = i * TAU / 12;
        const p = { x: candidate.x + Math.cos(a) * radius, y: candidate.y + Math.sin(a) * radius };
        if (!pointBlocked(p.x, p.y, 28, walls)) return p;
      }
    }
    return fallback;
  }

  function makeArena(name, seed) {
    const familyName = canonicalArena(name);
    const family = ARENA_FAMILIES[familyName] || ARENA_FAMILIES['rubble-alley'];
    const built = family.build(rngFrom(seed));
    const pickupTypes = ['mine', 'armor', 'shell', 'smoke', 'speed', 'mine', 'shell', 'armor'];
    const candidates = [
      { x: 100, y: 260 }, { x: 450, y: 280 }, { x: 800, y: 300 },
      { x: 110, y: 650 }, { x: 760, y: 630 }, { x: 460, y: 760 },
      { x: 115, y: 1040 }, { x: 780, y: 1060 }, { x: 440, y: 1230 }
    ];
    const pickups = [];
    for (let i = 0; i < candidates.length; i++) {
      const p = candidates[i];
      if (!pointBlocked(p.x, p.y, 18, built.walls) && distance(p, { x: 450, y: 1320 }) > 120) {
        pickups.push({ x: p.x, y: p.y, type: pickupTypes[i % pickupTypes.length], phase: i * 0.7, collected: false });
      }
    }
    return {
      name: familyName,
      label: family.label,
      accent: family.accent,
      floor: built.floor,
      walls: built.walls,
      props: built.props,
      pickups,
      seed
    };
  }

  function rayRect(origin, direction, rect) {
    let min = -Infinity;
    let max = Infinity;
    let nearAxis = '';
    if (Math.abs(direction.x) < 0.00001) {
      if (origin.x < rect.x || origin.x > rect.x + rect.w) return null;
    } else {
      const tx1 = (rect.x - origin.x) / direction.x;
      const tx2 = (rect.x + rect.w - origin.x) / direction.x;
      const near = Math.min(tx1, tx2);
      const far = Math.max(tx1, tx2);
      if (near > min) { min = near; nearAxis = 'x'; }
      max = Math.min(max, far);
    }
    if (Math.abs(direction.y) < 0.00001) {
      if (origin.y < rect.y || origin.y > rect.y + rect.h) return null;
    } else {
      const ty1 = (rect.y - origin.y) / direction.y;
      const ty2 = (rect.y + rect.h - origin.y) / direction.y;
      const near = Math.min(ty1, ty2);
      const far = Math.max(ty1, ty2);
      if (near > min) { min = near; nearAxis = 'y'; }
      max = Math.min(max, far);
    }
    if (max < Math.max(min, 0.001)) return null;
    const t = min > 0.001 ? min : max;
    if (!(t > 0.001)) return null;
    const hit = { x: origin.x + direction.x * t, y: origin.y + direction.y * t };
    let normal = nearAxis === 'x' ? { x: direction.x > 0 ? -1 : 1, y: 0 } : { x: 0, y: direction.y > 0 ? -1 : 1 };
    if (Math.abs(direction.x) < 0.00001) normal = { x: 0, y: direction.y > 0 ? -1 : 1 };
    if (Math.abs(direction.y) < 0.00001) normal = { x: direction.x > 0 ? -1 : 1, y: 0 };
    return { t, hit, normal, wall: rect };
  }
  function cross(ax, ay, bx, by) { return ax * by - ay * bx; }
  function raySegment(origin, direction, wall) {
    const sx = wall.x2 - wall.x1;
    const sy = wall.y2 - wall.y1;
    const denominator = cross(direction.x, direction.y, sx, sy);
    if (Math.abs(denominator) < 0.00001) return null;
    const qx = wall.x1 - origin.x;
    const qy = wall.y1 - origin.y;
    const t = cross(qx, qy, sx, sy) / denominator;
    const u = cross(qx, qy, direction.x, direction.y) / denominator;
    if (t <= 0.001 || u < -0.02 || u > 1.02) return null;
    const length = Math.hypot(sx, sy) || 1;
    let normal = { x: -sy / length, y: sx / length };
    if (normal.x * direction.x + normal.y * direction.y > 0) normal = { x: -normal.x, y: -normal.y };
    return { t, hit: { x: origin.x + direction.x * t, y: origin.y + direction.y * t }, normal, wall };
  }
  function rayBoundary(origin, direction) {
    const hits = [];
    if (direction.x > 0) hits.push({ t: (WORLD_W - WORLD_PAD - origin.x) / direction.x, normal: { x: -1, y: 0 } });
    if (direction.x < 0) hits.push({ t: (WORLD_PAD - origin.x) / direction.x, normal: { x: 1, y: 0 } });
    if (direction.y > 0) hits.push({ t: (WORLD_H - WORLD_PAD - origin.y) / direction.y, normal: { x: 0, y: -1 } });
    if (direction.y < 0) hits.push({ t: (WORLD_PAD - origin.y) / direction.y, normal: { x: 0, y: 1 } });
    const best = hits.filter((h) => h.t > 0.001).sort((a, b) => a.t - b.t)[0];
    if (!best) return null;
    return { t: best.t, hit: { x: origin.x + direction.x * best.t, y: origin.y + direction.y * best.t }, normal: best.normal, boundary: true };
  }
  function nearestRayHit(origin, direction, walls) {
    let best = rayBoundary(origin, direction);
    for (const wall of walls) {
      const hit = wall.type === 'rect' ? rayRect(origin, direction, wall) : raySegment(origin, direction, wall);
      if (hit && (!best || hit.t < best.t)) best = hit;
    }
    return best;
  }
  function tracePreview(origin, angle, walls, maxBounces) {
    const points = [];
    let position = { x: origin.x, y: origin.y };
    let direction = { x: Math.cos(angle), y: Math.sin(angle) };
    for (let bounce = 0; bounce <= maxBounces; bounce++) {
      const hit = nearestRayHit(position, direction, walls);
      if (!hit || hit.t > 1350) {
        points.push({ x: position.x + direction.x * 1350, y: position.y + direction.y * 1350 });
        break;
      }
      points.push(hit.hit);
      if (bounce === maxBounces) break;
      position = { x: hit.hit.x + hit.normal.x * 3, y: hit.hit.y + hit.normal.y * 3 };
      const dot = direction.x * hit.normal.x + direction.y * hit.normal.y;
      direction = { x: direction.x - 2 * dot * hit.normal.x, y: direction.y - 2 * dot * hit.normal.y };
    }
    return points;
  }

  function isLineBlocked(from, to, walls) {
    const direction = { x: to.x - from.x, y: to.y - from.y };
    const length = Math.hypot(direction.x, direction.y) || 1;
    direction.x /= length; direction.y /= length;
    const hit = nearestRayHit(from, direction, walls);
    return !!hit && hit.t < length - 18;
  }

  function rotated(tank, x, y) {
    const c = Math.cos(tank.angle);
    const s = Math.sin(tank.angle);
    return { x: tank.x + x * c - y * s, y: tank.y + x * s + y * c };
  }
  function addPoly(g, points, fill, alpha, stroke, strokeAlpha) {
    g.fillStyle(fill, alpha == null ? 1 : alpha);
    g.fillPoints(points, true);
    if (stroke != null) { g.lineStyle(2, stroke, strokeAlpha == null ? 1 : strokeAlpha); g.strokePoints(points, true); }
  }

  class IroncladScene extends Phaser.Scene {
    constructor() { super({ key: 'IroncladScene' }); }

    preload() {
      const art = {
        'arena-surface': 'assets/arena-surface.svg',
        'wall-plate': 'assets/wall-plate.svg',
        'wall-angle': 'assets/wall-angle.svg',
        'tank-player-idle': 'assets/tank-player-idle.svg',
        'tank-player-drive': 'assets/tank-player-drive.svg',
        'tank-player-hit': 'assets/tank-player-hit.svg',
        'tank-player-wreck': 'assets/tank-player-wreck.svg',
        'tank-scout': 'assets/tank-scout.svg',
        'tank-brawler': 'assets/tank-brawler.svg',
        'tank-sniper': 'assets/tank-sniper.svg',
        'tank-siege': 'assets/tank-siege.svg',
        'tank-hit': 'assets/tank-hit.svg',
        'tank-wreck': 'assets/tank-wreck.svg',
        'pickup-mine': 'assets/pickup-mine.svg',
        'pickup-armor': 'assets/pickup-armor.svg',
        'pickup-shell': 'assets/pickup-shell.svg',
        'pickup-smoke': 'assets/pickup-smoke.svg',
        'pickup-speed': 'assets/pickup-speed.svg',
        shell: 'assets/shell.svg',
        'fx-spark': 'assets/fx-spark.svg',
        'fx-dust': 'assets/fx-dust.svg',
        'fx-smoke': 'assets/fx-smoke.svg',
        'fx-ring': 'assets/fx-ring.svg',
        'fx-shard': 'assets/fx-shard.svg',
        'fx-glint': 'assets/fx-glint.svg'
      };
      Object.keys(art).forEach((key) => this.load.image(key, art[key]));
    }

    create() {
      window.__iaScene = this;
      this.pauseReason = '';
      this.phase = 'boot';
      this.activeMode = 'campaign';
      this.level = 1;
      this.score = 0;
      this.lives = 3;
      this.kills = 0;
      this.activeArenaName = 'rubble-alley';
      this.activeAiClass = 'scout';
      this.runSeed = hashSeed(Date.now() + ':' + Math.random());
      this.arena = null;
      this.player = this.makePlayer();
      this.enemies = [];
      this.mines = [];
      this.shells = Array.from({ length: MAX_SHELLS }, () => this.makeShell());
      this.transientQueue = [];
      this.activeTransient = null;
      this.transientAge = 0;
      this.shotStats = { elapsed: 0, shots: 0, hits: 0, bankHits: 0 };
      this.trialTime = 0;
      this.clearTimer = 0;
      this.respawnTimer = 0;
      this.tutorialStage = 0;
      this.tutorialFade = 0;
      this.keyLatch = Object.create(null);
      this.padLatch = Object.create(null);
      this.padState = null;
      this.seenPointers = new Map();
      this.currentEngineBus = '';
      this.juiceFrame = { dx: 0, dy: 0, frozen: false };
      this.damageFlash = 0;
      this.damageBlink = 0;
      this.shellJamTimer = 0;
      this.uiW = VIEW_W;
      this.uiH = VIEW_H;
      this.lastSwitchArena = canonicalArena(bootSwitches.arena || '');
      this.lastSwitchAI = canonicalAI(bootSwitches.aiClass || '');
      this.camera = this.cameras.main;
      this.camera.centerOn(VIEW_W / 2, VIEW_H / 2);
      this.scale.on('resize', () => this.applyViewport());
      this.applyViewport();
      this.floorSprite = this.add.tileSprite(WORLD_W / 2, WORLD_H / 2, WORLD_W, WORLD_H, 'arena-surface').setDepth(0);
      this.arenaArt = this.add.container(0, 0).setDepth(2);
      this.worldG = this.add.graphics().setDepth(1);
      this.previewG = this.add.graphics().setDepth(5);
      this.fxG = this.add.graphics().setDepth(8);
      this.uiG = this.add.graphics().setScrollFactor(0).setDepth(20);
      this.emitters = {
        sparks: this.add.particles(0, 0, 'fx-spark', { lifespan: { min: 180, max: 360 }, speed: { min: 80, max: 210 }, scale: { start: .42, end: 0 }, alpha: { start: .9, end: 0 }, rotate: { min: 0, max: 360 }, blendMode: Phaser.BlendModes.ADD, emitting: false, maxAliveParticles: 96 }).setDepth(8),
        dust: this.add.particles(0, 0, 'fx-dust', { lifespan: { min: 260, max: 520 }, speed: { min: 18, max: 58 }, scale: { start: .45, end: .08 }, alpha: { start: .48, end: 0 }, rotate: { min: 0, max: 360 }, blendMode: Phaser.BlendModes.ADD, emitting: false, maxAliveParticles: 48 }).setDepth(8),
        smoke: this.add.particles(0, 0, 'fx-smoke', { lifespan: { min: 620, max: 980 }, speed: { min: 12, max: 70 }, scale: { start: .28, end: .75 }, alpha: { start: .45, end: 0 }, rotate: { min: 0, max: 360 }, blendMode: Phaser.BlendModes.ADD, emitting: false, maxAliveParticles: 48 }).setDepth(8),
        rings: this.add.particles(0, 0, 'fx-ring', { lifespan: 520, speed: 0, scale: { start: .25, end: 1.15 }, alpha: { start: .8, end: 0 }, blendMode: Phaser.BlendModes.ADD, emitting: false, maxAliveParticles: 24 }).setDepth(8),
        shards: this.add.particles(0, 0, 'fx-shard', { lifespan: { min: 300, max: 620 }, speed: { min: 90, max: 260 }, scale: { start: .32, end: 0 }, alpha: { start: .95, end: 0 }, rotate: { min: 0, max: 360 }, blendMode: Phaser.BlendModes.ADD, emitting: false, maxAliveParticles: 32 }).setDepth(8),
        glints: this.add.particles(0, 0, 'fx-glint', { lifespan: { min: 180, max: 340 }, speed: { min: 20, max: 90 }, scale: { start: .45, end: 0 }, alpha: { start: 1, end: 0 }, rotate: { min: 0, max: 360 }, blendMode: Phaser.BlendModes.ADD, emitting: false, maxAliveParticles: 24 }).setDepth(8)
      };
      this.createUI();
      this.layoutUI();
      kit.loader.progress(.55);
      kit.audio.preload().then(() => {
        kit.loader.progress(1);
        kit.loader.hide();
        this.startMode('campaign');
      });
    }

    applyViewport() {
      const width = Math.max(1, (this.scale.width || VIEW_W * DPR) / DPR);
      const height = Math.max(1, (this.scale.height || VIEW_H * DPR) / DPR);
      const fit = Math.min(width / VIEW_W, height / VIEW_H) || 1;
      const zoom = DPR * fit;
      this.camera && this.camera.setZoom(zoom).centerOn(VIEW_W / 2, VIEW_H / 2);
      this.uiW = width / fit;
      this.uiH = height / fit;
      if (this.camera && this.player) {
        const desiredX = clamp(this.player.x - this.uiW / 2, 0, Math.max(0, WORLD_W - this.uiW));
        const desiredY = clamp(this.player.y - this.uiH * .62, 0, Math.max(0, WORLD_H - this.uiH));
        this.camera.setScroll(desiredX, desiredY);
      }
      if (this.hudStats) this.layoutUI();
    }

    rebuildArenaArt() {
      if (!this.arenaArt || !this.arena) return;
      this.arenaArt.removeAll(true);
      for (const wall of this.arena.walls) {
        if (wall.type === 'rect') {
          const texture = wall.kind === 'angled' ? 'wall-angle' : 'wall-plate';
          const plate = this.add.tileSprite(wall.x + wall.w / 2, wall.y + wall.h / 2, wall.w, wall.h, texture).setAlpha(.92);
          plate.setTint(wall.kind === 'container' ? C.water : wall.kind === 'planter' ? C.green : wall.kind === 'bank' ? C.purple : C.wallLight);
          this.arenaArt.add(plate);
        } else {
          const length = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
          const plate = this.add.image((wall.x1 + wall.x2) / 2, (wall.y1 + wall.y2) / 2, 'wall-angle')
            .setDisplaySize(length, 24).setRotation(Math.atan2(wall.y2 - wall.y1, wall.x2 - wall.x1)).setAlpha(.96);
          plate.setTint(C.purple);
          this.arenaArt.add(plate);
        }
      }
      for (const pickup of this.arena.pickups) {
        pickup.sprite = this.add.image(pickup.x, pickup.y, 'pickup-' + pickup.type).setDepth(4).setBlendMode(Phaser.BlendModes.ADD);
        this.arenaArt.add(pickup.sprite);
      }
      this.floorSprite.setTint(this.arena.floor === 'dock' ? C.water : this.arena.floor === 'chamber' ? C.purple : this.arena.floor === 'stone' ? C.green : C.orange);
    }

    makePlayer() {
      return {
        x: 450, y: 1320, angle: -Math.PI / 2, turretAngle: -Math.PI / 2, turretTarget: -Math.PI / 2,
        radius: 24, color: C.cyan, hp: 3, maxHp: 3, armorPlates: 1, mineCount: 2,
        shellDamage: 1, smokeCount: 1, speedTimer: 0, smokeTimer: 0, invuln: 0,
        alive: true, trackLeft: 0, trackRight: 0, speed: 0, angularVelocity: 0,
        dustTimer: 0, hitFlash: 0, requestedShot: 0, requestedAim: -Math.PI / 2,
        deployedMines: 0, shotQueued: false, shotCooldown: 0,
        sprite: this.add.image(450, 1320, 'tank-player-idle').setDepth(6)
      };
    }

    makeShell() {
      return {
        active: false, x: 0, y: 0, prevX: 0, prevY: 0, vx: 0, vy: 0,
        owner: null, color: C.shell, r: 5, bounces: 0, life: 0, damage: 1,
        trail: new Float32Array(10),
        sprite: this.add.image(0, 0, 'shell').setVisible(false).setDepth(6).setBlendMode(Phaser.BlendModes.ADD)
      };
    }

    createUI() {
      const textStyle = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: '20px', color: '#b7d3d6' };
      const titleStyle = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: '22px', color: '#d9fffb', fontStyle: 'bold' };
      this.hudStats = this.add.text(18, 14, '', { ...textStyle, color: '#d9fffb', fontStyle: 'bold' }).setScrollFactor(0).setDepth(22);
      this.hudClass = this.add.text(18, 39, '', { ...textStyle }).setScrollFactor(0).setDepth(22);
      this.hudRight = this.add.text(424, 14, '', { ...textStyle, fontStyle: 'bold' }).setOrigin(1, 0).setScrollFactor(0).setDepth(22);
      this.hudHint = this.add.text(270, 720, '', { ...textStyle, color: '#d9fffb', fontStyle: 'bold' }).setOrigin(.5, .5).setScrollFactor(0).setDepth(22);
      this.tutorialText = this.add.text(270, 94, '', { ...textStyle, fontSize: '20px', color: '#e4ffff' }).setOrigin(.5, .5).setScrollFactor(0).setDepth(24);
      this.menuTitle = this.add.text(270, 198, 'IRONCLAD\nALLEY', { ...titleStyle, fontSize: '40px', align: 'center', color: '#d9fffb' }).setOrigin(.5).setScrollFactor(0).setDepth(22);
      this.menuSub = this.add.text(270, 300, '', { ...textStyle, fontSize: '14px', align: 'center', color: '#8cb5bb' }).setOrigin(.5).setScrollFactor(0).setDepth(22);
      this.menuButtons = [
        this.add.text(270, 442, 'CAMPAIGN DUEL', { ...titleStyle, fontSize: '18px', align: 'center' }).setOrigin(.5).setScrollFactor(0).setDepth(22),
        this.add.text(270, 542, 'RICOCHET TRIAL', { ...titleStyle, fontSize: '18px', align: 'center' }).setOrigin(.5).setScrollFactor(0).setDepth(22),
        this.add.text(270, 642, 'GAUNTLET FINALE', { ...titleStyle, fontSize: '18px', align: 'center' }).setOrigin(.5).setScrollFactor(0).setDepth(22)
      ];
      this.menuUnlock = this.add.text(270, 728, '', { ...textStyle, fontSize: '12px', align: 'center', color: '#9bd7cf' }).setOrigin(.5).setScrollFactor(0).setDepth(22);
      this.menuFoot = this.add.text(270, 830, 'TAP A MODE  /  SETTINGS TOP RIGHT', { ...textStyle, fontSize: '12px', align: 'center', color: '#6f9299' }).setOrigin(.5).setScrollFactor(0).setDepth(22);
      this.settingsText = this.add.text(522, 14, '⚙', { ...textStyle, fontSize: '22px', color: '#73b7bd' }).setOrigin(1, 0).setScrollFactor(0).setDepth(22);
      this.modeText = this.add.text(466, 14, '≡', { ...textStyle, fontSize: '24px', color: '#73b7bd' }).setOrigin(1, 0).setScrollFactor(0).setDepth(22);
      this.actionLabels = [
        this.add.text(82, 856, '↕', { ...textStyle, fontSize: '22px', color: '#4de7dc', fontStyle: 'bold' }).setOrigin(.5).setScrollFactor(0).setDepth(22),
        this.add.text(374, 856, '', { ...textStyle, fontSize: '20px', color: '#c780ff', fontStyle: 'bold' }).setOrigin(.5).setScrollFactor(0).setDepth(22),
        this.add.text(466, 856, '', { ...textStyle, fontSize: '20px', color: '#83f092', fontStyle: 'bold' }).setOrigin(.5).setScrollFactor(0).setDepth(22)
      ];
      this.bannerBg = this.add.graphics();
      this.bannerTitle = this.add.text(0, -20, '', { ...titleStyle, fontSize: '22px', align: 'center' }).setOrigin(.5);
      this.bannerSub = this.add.text(0, 18, '', { ...textStyle, fontSize: '20px', align: 'center', color: '#c1e6e6' }).setOrigin(.5);
      this.banner = this.add.container(270, 460, [this.bannerBg, this.bannerTitle, this.bannerSub]).setScrollFactor(0).setDepth(30).setVisible(false);
      this.eventChipBg = this.add.graphics();
      this.eventChipText = this.add.text(12, 0, '', { ...textStyle, fontSize: '20px', fontStyle: 'bold' }).setOrigin(0, .5);
      this.eventChip = this.add.container(18, 88, [this.eventChipBg, this.eventChipText]).setScrollFactor(0).setDepth(30).setVisible(false);
      this.menuTitle.setVisible(false); this.menuSub.setVisible(false); this.menuUnlock.setVisible(false); this.menuFoot.setVisible(false);
      this.menuButtons.forEach((button) => button.setVisible(false));
      this.actionLabels.forEach((label) => label.setVisible(false));
    }

    layoutUI() {
      if (!this.hudStats) return;
      const center = this.uiW / 2;
      const right = this.uiW - 18;
      this.hudRight.setX(this.uiW - 116);
      this.hudHint.setPosition(center, this.uiH * .68);
      this.tutorialText.setPosition(center, 94);
      this.menuTitle.setX(center); this.menuSub.setX(center); this.menuUnlock.setX(center); this.menuFoot.setX(center);
      this.menuButtons.forEach((button) => button.setX(center));
      this.settingsText.setPosition(right, 14);
      this.modeText.setPosition(this.uiW - 66, 14);
      this.actionLabels[0].setPosition(82, this.uiH - 104);
      this.actionLabels[1].setPosition(this.uiW - 166, this.uiH - 104);
      this.actionLabels[2].setPosition(this.uiW - 74, this.uiH - 104);
      this.banner.setPosition(center, this.uiH * .46);
      this.eventChip.setPosition(18, 88);
    }

    screenLocal(x, y) {
      const canvas = this.game.canvas;
      const rect = canvas.getBoundingClientRect();
      const zoom = this.camera.zoom || 1;
      return {
        x: clamp((x - rect.left) / Math.max(.001, zoom), 0, this.uiW),
        y: clamp((y - rect.top) / Math.max(.001, zoom), 0, this.uiH)
      };
    }

    zoneForLocal(x, y) {
      if (this.phase === 'menu') return 'menu';
      if (x > this.uiW - 82 && y < 95) return 'settings';
      if (x > this.uiW - 165 && y < 95) return 'mode';
      if (y > this.uiH - 155 && x > this.uiW - 110) return 'mine';
      if (y > this.uiH - 155 && x > this.uiW - 230) return 'smoke';
      if (y > 560) return 'drive';
      return 'fire';
    }

    readLiveSwitches() {
      const probe = window.__ia || {};
      const query = new URLSearchParams(window.location.search);
      return {
        arena: canonicalArena(probe.forceArena || window.forceArena || query.get('forceArena') || this.lastSwitchArena),
        aiClass: canonicalAI(probe.forceAIClass || window.forceAIClass || query.get('forceAIClass') || this.lastSwitchAI)
      };
    }

    canEnterMode(mode) {
      if (mode === 'trial') return profile.unlocked.includes('brawler');
      if (mode === 'gauntlet') return profile.unlocked.includes('siege');
      return true;
    }

    updateProbe() {
      const probe = window.__ia || (window.__ia = {});
      probe.state = probeState;
      probeState.mode = this.phase === 'menu' ? 'menu' : this.activeMode;
      probeState.score = Math.floor(this.score);
      probeState.lives = this.lives;
      probeState.level = this.level;
      probeState.aiClass = this.activeAiClass;
      probeState.arena = this.activeArenaName;
      probeState.phase = this.phase;
      probeState.shotsFired = this.shotStats.shots;
      probeState.hitsLanded = this.shotStats.hits;
    }

    startMode(mode) {
      this.activeMode = mode === 'trial' || mode === 'gauntlet' ? mode : 'campaign';
      if (!this.canEnterMode(this.activeMode)) { this.openMenu(); return; }
      this.clearTransients();
      this.phase = 'play';
      this.level = 1;
      this.score = 0;
      this.kills = 0;
      this.lives = 3;
      this.runSeed = hashSeed(Date.now() + ':' + Math.random() + ':' + this.activeMode);
      if (this.player && this.player.sprite) this.player.sprite.destroy();
      this.player = this.makePlayer();
      this.shotStats = { elapsed: 0, shots: 0, hits: 0, bankHits: 0 };
      this.trialTime = this.activeMode === 'trial' ? 70 : 0;
      this.seenPointers.clear();
      for (const shell of this.shells) shell.active = false;
      for (const mine of this.mines) if (mine.sprite) mine.sprite.destroy();
      this.mines.length = 0;
      this.createLevel();
      this.playEngineBus('idle');
      this.showBanner(this.activeMode === 'campaign' ? 'SECTOR 01' : this.activeMode === 'trial' ? 'BANK-SHOT TRIAL' : 'GAUNTLET', this.arena.label, this.arena.accent, 1.45);
      if (this.activeMode === 'campaign' && !profile.tutorialSeen) {
        this.phase = 'tutorial';
        this.tutorialStage = 0;
        this.tutorialFade = 0;
      }
      this.updateProbe();
    }

    openMenu() {
      this.phase = 'menu';
      this.clearTransients();
      this.menuTitle.setVisible(true); this.menuSub.setVisible(true); this.menuUnlock.setVisible(true); this.menuFoot.setVisible(true);
      this.menuButtons.forEach((button) => button.setVisible(true));
      setTextIfChanged(this.menuSub, 'PORTRAIT DUELS  /  FLEET F3\nRICOCHET SHELLS  /  SEE THE ANGLE');
      const unlocked = profile.unlocked.map((name) => AI_CLASSES[name] ? AI_CLASSES[name].label : '').filter(Boolean).join('  /  ');
      const trial = this.canEnterMode('trial') ? 'READY' : 'LOCKED  CLEAR SECTOR 02';
      const gauntlet = this.canEnterMode('gauntlet') ? 'READY' : 'LOCKED  CLEAR CAMPAIGN';
      setTextIfChanged(this.menuButtons[1], 'RICOCHET TRIAL  /  ' + trial);
      setTextIfChanged(this.menuButtons[2], 'GAUNTLET FINALE  /  ' + gauntlet);
      setTextIfChanged(this.menuUnlock, 'UNLOCKED  ' + unlocked + '\nTRIAL ' + trial + '  /  GAUNTLET ' + gauntlet + '\nBEST SCORE  ' + String(Math.floor(profile.best)).padStart(5, '0'));
      this.updateProbe();
    }

    createLevel() {
      const switches = this.readLiveSwitches();
      this.lastSwitchArena = switches.arena;
      this.lastSwitchAI = switches.aiClass;
      const sequence = ['rubble-alley', 'dockyard-maze', 'open-courtyard', 'ricochet-chamber'];
      let desiredArena = switches.arena;
      if (!window.__ia.forceArena && !window.forceArena && !bootSwitches.arena) {
        desiredArena = this.activeMode === 'trial' ? 'ricochet-chamber' : this.activeMode === 'gauntlet' ? 'open-courtyard' : sequence[(this.level - 1) % sequence.length];
      }
      this.activeArenaName = canonicalArena(desiredArena);
      this.arena = makeArena(this.activeArenaName, this.runSeed + this.level * 9176);
      let className = switches.aiClass;
      if (this.activeMode === 'gauntlet') className = switches.aiClass || 'siege';
      else if (!window.__ia.forceAIClass && !window.forceAIClass && !bootSwitches.aiClass) className = sequenceAI(this.level);
      this.activeAiClass = canonicalAI(className);
      this.player.x = openPosition({ x: 450, y: 1340 }, this.arena.walls, { x: 450, y: 1320 }).x;
      this.player.y = openPosition({ x: 450, y: 1340 }, this.arena.walls, { x: 450, y: 1320 }).y;
      this.player.alive = true;
      this.player.hp = this.player.maxHp;
      this.player.invuln = 0.8;
      this.player.angle = -Math.PI / 2; this.player.turretAngle = -Math.PI / 2; this.player.turretTarget = -Math.PI / 2;
      this.player.mineCount = clamp(this.player.mineCount + (this.level > 1 ? 2 : 0), 0, 6);
      this.player.smokeCount = clamp(this.player.smokeCount + (this.level > 1 ? 1 : 0), 0, 4);
      for (const enemy of this.enemies) {
        if (enemy.sprite) enemy.sprite.destroy();
        if (enemy.label) enemy.label.destroy();
      }
      this.enemies.length = 0;
      this.rebuildArenaArt();
      const candidates = [
        { x: 450, y: 155 }, { x: 130, y: 220 }, { x: 770, y: 240 },
        { x: 135, y: 760 }, { x: 770, y: 800 }, { x: 450, y: 570 }
      ];
      const count = this.activeMode === 'gauntlet' ? 4 : this.activeMode === 'trial' ? 3 : 1;
      for (let i = 0; i < count; i++) {
        const requestedClass = this.activeMode === 'gauntlet' ? ['scout', 'brawler', 'sniper', 'siege'][i] : this.activeAiClass;
        const classNameForTank = canonicalAI(switches.aiClass && this.activeMode === 'gauntlet' ? switches.aiClass : requestedClass);
        let spawn = candidates[i % candidates.length];
        for (let j = 0; j < candidates.length; j++) {
          const candidate = candidates[(i + j) % candidates.length];
          if (!pointBlocked(candidate.x, candidate.y, AI_CLASSES[classNameForTank].radius, this.arena.walls) &&
              distance(candidate, this.player) > 360 && this.enemies.every((enemy) => distance(candidate, enemy) > 150)) { spawn = candidate; break; }
        }
        const def = AI_CLASSES[classNameForTank];
        this.enemies.push({
          x: spawn.x, y: spawn.y, anchor: { x: spawn.x, y: spawn.y }, angle: i % 2 ? Math.PI / 2 : 0,
          turretAngle: Math.PI / 2, turretTarget: Math.PI / 2, radius: def.radius, color: def.color,
          accent: def.accent, className: classNameForTank, hp: def.hp, maxHp: def.hp, alive: true,
          cooldown: .8 + i * .6, phase: i * 2.1, trackLeft: 0, trackRight: 0, speed: 0,
          angularVelocity: 0, dustTimer: 0, hitFlash: 0, invuln: 0, stuck: 0,
          sprite: this.add.image(spawn.x, spawn.y, 'tank-' + classNameForTank).setDepth(6),
          label: null
        });
      }
      this.shotStats = { elapsed: 0, shots: 0, hits: 0, bankHits: 0 };
      for (const mine of this.mines) if (mine.sprite) mine.sprite.destroy();
      this.mines.length = 0;
      this.camera.setScroll(clamp(this.player.x - this.uiW / 2, 0, Math.max(0, WORLD_W - this.uiW)), clamp(this.player.y - this.uiH * .62, 0, Math.max(0, WORLD_H - this.uiH)));
      this.updateProbe();
    }

    sequenceAI(level) {
      return ['scout', 'brawler', 'sniper', 'siege'][clamp(level - 1, 0, 3)];
    }

    updateLiveSwitches() {
      const switches = this.readLiveSwitches();
      if (switches.arena !== this.lastSwitchArena || switches.aiClass !== this.lastSwitchAI) {
        this.lastSwitchArena = switches.arena;
        this.lastSwitchAI = switches.aiClass;
        if (this.phase !== 'menu' && this.phase !== 'fail') this.createLevel();
      }
    }

    claimNewPointers() {
      for (const [id, pointer] of kit.input.pointers) {
        if (this.seenPointers.has(id)) continue;
        const local = this.screenLocal(pointer.x, pointer.y);
        pointer.zone = pointer.zone || this.zoneForLocal(local.x, local.y);
        this.seenPointers.set(id, pointer.downAt || performance.now());
        this.handlePointerPress(pointer, local);
      }
      for (const id of this.seenPointers.keys()) if (!kit.input.pointers.has(id)) this.seenPointers.delete(id);
    }

    handlePointerPress(pointer, local) {
      if (this.phase === 'menu') {
        if (local.y > 390 && local.y < 490) this.startMode('campaign');
        else if (local.y >= 490 && local.y < 590) this.startMode('trial');
        else if (local.y >= 590 && local.y < 690) this.startMode('gauntlet');
        return;
      }
      if (pointer.zone === 'settings') { kit.openSettings(); return; }
      if (pointer.zone === 'mode') { this.openMenu(); return; }
      if (this.phase === 'fail') { kit.restart(); return; }
      if (pointer.zone === 'mine') { this.dropMine(); return; }
      if (pointer.zone === 'smoke') { this.deploySmoke(); return; }
      if (pointer.zone === 'fire' && this.phase !== 'clear') {
        this.requestShot(this.screenToWorld(local.x, local.y));
      }
    }

    updateKeyboard() {
      const edges = [
        ['Space', 'shoot'], ['KeyM', 'mine'], ['KeyN', 'smoke'], ['Enter', 'enter'], ['KeyR', 'restart']
      ];
      this.padState = kit.input.readGamepad();
      for (const [code, action] of edges) {
        const down = kit.input.keyDown(code);
        if (down && !this.keyLatch[code]) {
          if (action === 'shoot' && (this.phase === 'play' || this.phase === 'tutorial')) {
            this.requestShot({ x: this.player.x + Math.cos(this.player.turretAngle) * 480, y: this.player.y + Math.sin(this.player.turretAngle) * 480 });
          }
          if (action === 'mine') this.dropMine();
          if (action === 'smoke') this.deploySmoke();
          if (action === 'enter' && (this.phase === 'menu' || this.phase === 'fail')) this.startMode('campaign');
          if (action === 'restart' && this.phase === 'fail') kit.restart();
        }
        this.keyLatch[code] = down;
      }
      const pad = this.padState;
      if (pad) {
        const padEdges = [['fire', pad.fire], ['mine', pad.mine], ['smoke', pad.smoke], ['start', pad.start], ['restart', pad.restart]];
        for (const [action, down] of padEdges) {
          if (down && !this.padLatch[action]) {
            if (action === 'fire' && (this.phase === 'play' || this.phase === 'tutorial')) this.requestShot({ x: this.player.x + Math.cos(this.player.turretAngle) * 480, y: this.player.y + Math.sin(this.player.turretAngle) * 480 });
            if (action === 'mine') this.dropMine();
            if (action === 'smoke') this.deploySmoke();
            if (action === 'start' && (this.phase === 'menu' || this.phase === 'fail')) this.startMode('campaign');
            if (action === 'restart' && this.phase === 'fail') kit.restart();
          }
          this.padLatch[action] = down;
        }
      } else this.padLatch = Object.create(null);
      let aimX = 0; let aimY = 0;
      if (kit.input.keyDown('KeyJ')) aimX -= 1;
      if (kit.input.keyDown('KeyL')) aimX += 1;
      if (kit.input.keyDown('KeyI')) aimY -= 1;
      if (kit.input.keyDown('KeyK')) aimY += 1;
      if (pad && (pad.aimX || pad.aimY)) { aimX = pad.aimX; aimY = pad.aimY; }
      if (this.player && (aimX || aimY)) this.player.turretTarget = Math.atan2(aimY, aimX);
    }

    screenToWorld(x, y) { return { x: this.camera.scrollX + x, y: this.camera.scrollY + y }; }

    driveInput() {
      let forward = 0;
      let turn = 0;
      if (kit.input.keyDown('KeyW') || kit.input.keyDown('ArrowUp')) forward += 1;
      if (kit.input.keyDown('KeyS') || kit.input.keyDown('ArrowDown')) forward -= 1;
      if (kit.input.keyDown('KeyA') || kit.input.keyDown('ArrowLeft')) turn -= 1;
      if (kit.input.keyDown('KeyD') || kit.input.keyDown('ArrowRight')) turn += 1;
      if (this.padState && (this.padState.moveX || this.padState.moveY)) {
        forward = clamp(-this.padState.moveY, -1, 1);
        turn = clamp(this.padState.moveX, -1, 1);
      }
      for (const pointer of kit.input.pointers.values()) {
        if (pointer.zone !== 'drive') continue;
        const dx = clamp((pointer.x - pointer.startX) / 110, -1, 1);
        const dy = clamp((pointer.y - pointer.startY) / 110, -1, 1);
        forward = clamp(-dy, -1, 1);
        turn = clamp(dx, -1, 1);
        break;
      }
      return { left: clamp(forward - turn * .82, -1, 1), right: clamp(forward + turn * .82, -1, 1) };
    }

    moveTank(tank, tracks, dt, maxSpeed, turnRate) {
      tank.trackLeft = approach(tank.trackLeft, tracks.left, dt * 3.8);
      tank.trackRight = approach(tank.trackRight, tracks.right, dt * 3.8);
      const mean = (tank.trackLeft + tank.trackRight) * .5;
      const differential = tank.trackRight - tank.trackLeft;
      const targetSpeed = mean * maxSpeed;
      tank.speed = lerp(tank.speed, targetSpeed, 1 - Math.exp(-dt * 5.2));
      const radiusFactor = .38 + Math.min(1, Math.abs(tank.speed) / Math.max(1, maxSpeed)) * .72;
      const targetAngular = differential * turnRate * radiusFactor;
      tank.angularVelocity = lerp(tank.angularVelocity, targetAngular, 1 - Math.exp(-dt * 4.3));
      tank.angle = normAngle(tank.angle + tank.angularVelocity * dt);
      const distanceStep = tank.speed * dt;
      const steps = Math.max(1, Math.ceil(Math.abs(distanceStep) / 10));
      let moved = false;
      for (let i = 0; i < steps; i++) {
        const step = distanceStep / steps;
        const nx = tank.x + Math.cos(tank.angle) * step;
        const ny = tank.y + Math.sin(tank.angle) * step;
        if (!pointBlocked(nx, tank.y, tank.radius, this.arena.walls)) { tank.x = nx; moved = true; }
        if (!pointBlocked(tank.x, ny, tank.radius, this.arena.walls)) { tank.y = ny; moved = true; }
        if (!moved) tank.speed *= .25;
      }
      if (Math.abs(tank.speed) > 8) {
        tank.dustTimer -= dt;
        if (tank.dustTimer <= 0) { this.spawnDust(tank); tank.dustTimer = .065; }
      }
      return moved;
    }

    updatePlayer(dt) {
      const p = this.player;
      if (!p.alive) {
        this.respawnTimer -= dt;
        if (this.respawnTimer <= 0 && this.lives > 0) {
          const spawn = openPosition({ x: 450, y: 1320 }, this.arena.walls, { x: 450, y: 1320 });
          p.alive = true; p.hp = p.maxHp; p.invuln = 1.2; p.x = spawn.x; p.y = spawn.y; p.angle = -Math.PI / 2;
          this.showPopup(p.x, p.y, 'REDEPLOYED  ·  ' + this.lives + ' LEFT', '#9ff5d9');
        }
        return;
      }
      p.invuln = Math.max(0, p.invuln - dt);
      p.hitFlash = Math.max(0, p.hitFlash - dt);
      p.shotCooldown = Math.max(0, p.shotCooldown - dt);
      p.speedTimer = Math.max(0, p.speedTimer - dt);
      p.smokeTimer = Math.max(0, p.smokeTimer - dt);
      const tracks = this.driveInput();
      const maxSpeed = p.speedTimer > 0 ? 112 : 72;
      this.moveTank(p, tracks, dt, maxSpeed, 1.65);
      p.turretAngle = approachAngle(p.turretAngle, p.turretTarget, dt * 3.4);
      if (p.shotQueued) {
        p.requestedShot -= dt;
        if (Math.abs(normAngle(p.turretAngle - p.turretTarget)) < .24 && p.shotCooldown <= 0) {
          this.fireShell(p, p.turretAngle);
          p.shotQueued = false;
          p.requestedShot = 0;
        } else if (p.requestedShot <= 0) {
          p.shotQueued = false;
          this.showPopup(p.x, p.y - 42, 'AIM LOCK', '#ffca6a');
        }
      }
      this.updatePickups();
      this.updateTutorial();
    }

    requestShot(target) {
      if (this.phase !== 'play' && this.phase !== 'tutorial') return;
      if (!this.player.alive) return;
      this.player.turretTarget = angleTo(this.player, target);
      this.player.requestedAim = this.player.turretTarget;
      this.player.requestedShot = 1.2;
      this.player.shotQueued = true;
      this.tutorialFade = 0;
    }

    findBankAngle(tank, target) {
      const direct = angleTo(tank, target);
      const candidates = [direct - .82, direct + .82, direct - .48, direct + .48, direct];
      let best = direct;
      let bestDistance = Infinity;
      for (const angle of candidates) {
        const points = tracePreview({ x: tank.x, y: tank.y }, angle, this.arena.walls, 1);
        const end = points[points.length - 1];
        const score = distance(end, target) + (points.length < 2 ? 260 : 0);
        if (score < bestDistance) { bestDistance = score; best = angle; }
      }
      return best;
    }

    updateAI(tank, dt) {
      if (!tank.alive || !this.player.alive) return;
      const def = AI_CLASSES[tank.className] || AI_CLASSES.scout;
      tank.cooldown -= dt;
      tank.hitFlash = Math.max(0, tank.hitFlash - dt);
      tank.invuln = Math.max(0, tank.invuln - dt);
      if (this.activeMode === 'trial') {
        tank.turretTarget = angleTo(tank, this.player);
        tank.turretAngle = approachAngle(tank.turretAngle, tank.turretTarget, dt * def.turn);
        return;
      }
      const d = distance(tank, this.player);
      const direct = angleTo(tank, this.player);
      let goal = tank.anchor;
      let forward = .35;
      let turn = 0;
      if (tank.className === 'scout') {
        const side = Math.sin(tank.phase) < 0 ? -1 : 1;
        goal = { x: this.player.x - Math.sin(direct) * 240 * side, y: this.player.y + Math.cos(direct) * 240 * side };
        forward = .8; tank.phase += dt * .7;
      } else if (tank.className === 'brawler') {
        goal = { x: this.player.x - Math.cos(direct) * 220, y: this.player.y - Math.sin(direct) * 220 };
        forward = d > 260 ? .75 : -.3; tank.phase += dt * .2;
      } else if (tank.className === 'sniper') {
        const side = Math.cos(tank.phase) < 0 ? -1 : 1;
        goal = { x: this.player.x + Math.cos(direct) * 430 + Math.sin(direct) * 150 * side, y: this.player.y + Math.sin(direct) * 430 - Math.cos(direct) * 150 * side };
        forward = d < 360 ? -.5 : .42; tank.phase += dt * .18;
      } else {
        const side = Math.sin(tank.phase * .7) < 0 ? -1 : 1;
        goal = { x: this.player.x + Math.cos(direct) * 320 + Math.sin(direct) * 180 * side, y: this.player.y + Math.sin(direct) * 320 - Math.cos(direct) * 180 * side };
        forward = d > 430 ? .55 : .15; tank.phase += dt * .12;
      }
      const desiredBody = angleTo(tank, goal);
      const error = normAngle(desiredBody - tank.angle);
      turn = clamp(error * 1.8, -1, 1);
      if (Math.abs(error) > 1.9) forward *= .18;
      this.moveTank(tank, { left: clamp(forward - turn * .78, -1, 1), right: clamp(forward + turn * .78, -1, 1) }, dt, def.speed, def.turn);
      let shotAngle = direct;
      if (tank.className === 'siege' || (tank.className === 'sniper' && isLineBlocked(tank, this.player, this.arena.walls))) shotAngle = this.findBankAngle(tank, this.player);
      tank.turretTarget = shotAngle;
      tank.turretAngle = approachAngle(tank.turretAngle, shotAngle, dt * def.turn * 1.2);
      const hidden = this.player.smokeTimer > 0 && distance(this.player, { x: tank.x, y: tank.y }) < 175;
      if (tank.cooldown <= 0 && d < (tank.className === 'sniper' ? 930 : 760) && !hidden && Math.abs(normAngle(tank.turretAngle - shotAngle)) < .2) {
        this.fireShell(tank, tank.turretAngle);
        tank.cooldown = def.fire;
      }
    }

    fireShell(owner, angle) {
      const shell = this.shells.find((candidate) => !candidate.active);
      if (!shell) {
        if (owner === this.player) {
          this.shellJamTimer = .55;
          this.showPopup(owner.x, owner.y - 42, 'RELOAD CHANNEL', '#ffca6a');
          kit.audio.sfx('ui', { volume: .4, rate: .72 });
        }
        return;
      }
      const muzzleDistance = owner.radius + 12;
      shell.active = true;
      shell.x = owner.x + Math.cos(angle) * muzzleDistance;
      shell.y = owner.y + Math.sin(angle) * muzzleDistance;
      shell.prevX = shell.x; shell.prevY = shell.y;
      shell.vx = Math.cos(angle) * 570; shell.vy = Math.sin(angle) * 570;
      shell.owner = owner; shell.color = owner === this.player ? C.shell : owner.color;
      shell.r = owner === this.player ? 5 : 5.5; shell.bounces = 0; shell.life = 3.6;
      shell.damage = owner === this.player ? this.player.shellDamage : 1;
      if (owner === this.player) this.player.shotCooldown = .18;
      for (let i = 0; i < 5; i++) { shell.trail[i * 2] = shell.x; shell.trail[i * 2 + 1] = shell.y; }
      if (owner === this.player) {
        this.shotStats.shots++;
        kit.audio.sfx('cannon', { volume: .6, rate: .96 + (this.shotStats.shots % 3) * .03 });
      } else kit.audio.sfx('cannon', { volume: .23, rate: .8 });
      this.spawnBurst(shell.x, shell.y, owner === this.player ? C.cyanHot : owner.color, 7, 85);
      if (this.player.speed > 9 && owner === this.player) this.playEngineBus('rev');
    }

    updateShells(dt) {
      for (const shell of this.shells) {
        if (!shell.active) continue;
        shell.life -= dt;
        if (shell.life <= 0) { shell.active = false; continue; }
        const distanceStep = Math.hypot(shell.vx, shell.vy) * dt;
        const steps = Math.max(1, Math.ceil(distanceStep / 9));
        let hitEntity = false;
        for (let step = 0; step < steps && shell.active && !hitEntity; step++) {
          shell.prevX = shell.x; shell.prevY = shell.y;
          shell.x += shell.vx * dt / steps;
          shell.y += shell.vy * dt / steps;
          for (let trail = 4; trail > 0; trail--) {
            shell.trail[trail * 2] = shell.trail[(trail - 1) * 2];
            shell.trail[trail * 2 + 1] = shell.trail[(trail - 1) * 2 + 1];
          }
          shell.trail[0] = shell.x; shell.trail[1] = shell.y;
          const movement = { x: shell.x - shell.prevX, y: shell.y - shell.prevY };
          let bestWall = null;
          if (shell.x < WORLD_PAD + shell.r) bestWall = { hit: { x: WORLD_PAD, y: shell.y }, normal: { x: 1, y: 0 }, boundary: true };
          else if (shell.x > WORLD_W - WORLD_PAD - shell.r) bestWall = { hit: { x: WORLD_W - WORLD_PAD, y: shell.y }, normal: { x: -1, y: 0 }, boundary: true };
          else if (shell.y < WORLD_PAD + shell.r) bestWall = { hit: { x: shell.x, y: WORLD_PAD }, normal: { x: 0, y: 1 }, boundary: true };
          else if (shell.y > WORLD_H - WORLD_PAD - shell.r) bestWall = { hit: { x: shell.x, y: WORLD_H - WORLD_PAD }, normal: { x: 0, y: -1 }, boundary: true };
          for (const wall of this.arena.walls) {
            const candidate = wall.type === 'rect' ? circleRect(shell.x, shell.y, shell.r + 1, wall) : pointSegmentDistance(shell.x, shell.y, wall.x1, wall.y1, wall.x2, wall.y2) < shell.r + 2;
            if (candidate) {
              let candidateHit = null;
              if (wall.type === 'rect') {
                const dx = shell.x - shell.prevX; const dy = shell.y - shell.prevY;
                candidateHit = nearestRayHit({ x: shell.prevX, y: shell.prevY }, { x: dx || .001, y: dy || .001 }, [wall]);
              } else {
                const dx = wall.x2 - wall.x1; const dy = wall.y2 - wall.y1;
                const len = Math.hypot(dx, dy) || 1;
                let normal = { x: -dy / len, y: dx / len };
                if (normal.x * shell.vx + normal.y * shell.vy > 0) normal = { x: -normal.x, y: -normal.y };
                candidateHit = { hit: { x: shell.x, y: shell.y }, normal, wall };
              }
              if (candidateHit && (!bestWall || distance({ x: shell.prevX, y: shell.prevY }, candidateHit.hit) < distance({ x: shell.prevX, y: shell.prevY }, bestWall.hit))) bestWall = candidateHit;
            }
          }
          if (bestWall && (bestWall.boundary || bestWall.wall)) {
            if (shell.bounces >= 2) {
              this.spawnBurst(shell.x, shell.y, shell.color, 10, 110);
              shell.active = false;
              break;
            }
            const dot = shell.vx * bestWall.normal.x + shell.vy * bestWall.normal.y;
            shell.vx -= 2 * dot * bestWall.normal.x;
            shell.vy -= 2 * dot * bestWall.normal.y;
            shell.x += bestWall.normal.x * 5; shell.y += bestWall.normal.y * 5;
            shell.bounces++;
            kit.audio.sfx('ricochet', { volume: .55, rate: .9 + shell.bounces * .07 });
            this.spawnRicochet(shell.x, shell.y, bestWall.normal, shell.color);
          }
          if (shell.active && shell.owner !== this.player && this.player.alive && this.player.invuln <= 0 && distance(shell, this.player) < this.player.radius + shell.r) {
            this.takeDamage(this.player, shell, true);
            hitEntity = true;
          } else if (shell.active && shell.owner === this.player) {
            for (const enemy of this.enemies) {
              if (enemy.alive && enemy.invuln <= 0 && distance(shell, enemy) < enemy.radius + shell.r) {
                this.takeDamage(enemy, shell, false);
                hitEntity = true;
                break;
              }
            }
          }
        }
        if (hitEntity) shell.active = false;
      }
    }

    takeDamage(target, shell, playerHit) {
      const incoming = Math.atan2(-shell.vy, -shell.vx);
      const relative = Math.abs(normAngle(incoming - target.angle));
      const facing = relative < Math.PI / 3 ? 'FRONT ARMOR' : relative < Math.PI * 2 / 3 ? 'FLANK' : 'REAR CRIT';
      const multiplier = relative < Math.PI / 3 ? .7 : relative < Math.PI * 2 / 3 ? 1.25 : 1.8;
      let damage = Math.max(1, Math.round(shell.damage * multiplier));
      if (playerHit && this.player.armorPlates > 0) { this.player.armorPlates--; damage = Math.min(damage, 1); }
      target.hp -= damage;
      target.invuln = playerHit ? .72 : .14;
      target.hitFlash = .22;
      this.shotStats.hits += shell.owner === this.player ? 1 : 0;
      if (shell.owner === this.player) {
        const bankBonus = shell.bounces > 0 ? shell.bounces * 120 : 0;
        this.score += 40 + bankBonus;
        if (shell.bounces > 0) this.shotStats.bankHits += 1;
      }
      this.showPopup(target.x, target.y - target.radius - 12, facing + '  ' + damage, facing === 'REAR CRIT' ? '#ff8c75' : facing === 'FLANK' ? '#ffca6a' : '#b8eff0');
      this.spawnBurst(target.x, target.y, facing === 'REAR CRIT' ? C.orange : C.white, facing === 'REAR CRIT' ? 18 : 11, 150);
      kit.juice.hitStop(playerHit ? 55 : 38);
      kit.juice.shake(playerHit ? 7 : 4, playerHit ? 150 : 90);
      if (playerHit) {
        this.damageFlash = Math.max(this.damageFlash, .48);
        this.damageBlink = Math.max(this.damageBlink, .72);
        kit.audio.sfx('damage', { volume: .75, rate: .65 });
        if (target.hp <= 0) this.loseLife();
      } else {
        kit.audio.sfx('ricochet', { volume: .35, rate: 1.1 });
        if (target.hp <= 0) this.destroyEnemy(target);
      }
    }

    loseLife() {
      if (!this.player.alive) return;
      this.player.alive = false;
      this.lives--;
      this.respawnTimer = 1.25;
      for (const shell of this.shells) if (shell.owner !== this.player) shell.active = false;
      this.spawnExplosion(this.player.x, this.player.y, C.cyan);
      if (this.lives <= 0) {
        this.phase = 'fail';
        this.saveProfile();
        this.showBanner('HULL LOST', '◆' + Math.floor(this.score) + '  ·  TAP TO RESTART', C.red, 999);
      } else {
        this.showPopup(this.player.x, this.player.y, 'HULL BREACH  ·  ' + this.lives + ' LEFT', '#ff9aa5');
      }
    }

    destroyEnemy(enemy) {
      if (!enemy.alive) return;
      enemy.alive = false;
      this.kills++;
      this.score += 250 + enemy.maxHp * 25;
      this.spawnExplosion(enemy.x, enemy.y, enemy.color);
      this.showPopup(enemy.x, enemy.y - 44, '+' + String(250 + enemy.maxHp * 25), '#d9fffb');
      if (this.enemies.every((candidate) => !candidate.alive)) this.completeDuel();
    }

    completeDuel() {
      if (this.phase === 'clear') return;
      this.phase = 'clear';
      this.clearTimer = this.activeMode === 'campaign' ? 2.55 : 3.0;
      const elapsed = this.shotStats.elapsed;
      const accuracy = this.shotStats.shots ? this.shotStats.hits / this.shotStats.shots : 0;
      let medal = 'C';
      if (elapsed < 36 && this.shotStats.shots <= 9 && accuracy >= .65) medal = 'S';
      else if (elapsed < 55 && this.shotStats.shots <= 14 && accuracy >= .45) medal = 'A';
      else if (elapsed < 78 && accuracy >= .28) medal = 'B';
      const key = this.activeMode === 'campaign' ? 'duel-' + this.level : this.activeMode;
      if (!profile.medals[key] || MEDAL_RANK[medal] > MEDAL_RANK[profile.medals[key]]) profile.medals[key] = medal;
      if (this.activeMode === 'campaign') {
        const next = ['scout', 'brawler', 'sniper', 'siege'][this.level];
        if (next && !profile.unlocked.includes(next)) profile.unlocked.push(next);
      }
      this.score += medal === 'S' ? 900 : medal === 'A' ? 600 : medal === 'B' ? 350 : 150;
      this.saveProfile();
      kit.audio.sfx('explosion', { volume: .75, rate: 1.05 });
      kit.audio.sfx('pickup', { volume: .5, rate: medal === 'S' ? 1.35 : 1.15 });
      kit.audio.sfx('level', { volume: .35, rate: medal === 'S' ? 1.28 : 1.08 });
      kit.juice.shake(10, 220);
      this.showBanner('DUEL WON', 'MEDAL ' + medal + '  /  ' + Math.round(elapsed) + 's  /  ' + this.shotStats.shots + ' SHOTS', C.cyan, this.clearTimer);
    }

    completeTrialTimeout() {
      if (this.phase !== 'play') return;
      this.phase = 'clear';
      this.clearTimer = 2.8;
      const medal = this.shotStats.bankHits >= 4 ? 'S' : this.shotStats.bankHits >= 2 ? 'A' : 'B';
      if (!profile.medals.trial || MEDAL_RANK[medal] > MEDAL_RANK[profile.medals.trial]) profile.medals.trial = medal;
      this.score += Math.floor(this.shotStats.bankHits * 180) + (medal === 'S' ? 700 : 250);
      this.saveProfile();
      this.showBanner('TRIAL COMPLETE', 'MEDAL ' + medal + '  /  BANKS ' + Math.floor(this.shotStats.bankHits), C.purple, this.clearTimer);
    }

    saveProfile() {
      profile.best = Math.max(profile.best, Math.floor(this.score));
      kit.save.set({
        best: clamp(Math.floor(profile.best), 0, 999999999),
        unlocked: Array.from(new Set(profile.unlocked.filter((name) => VALID_UNLOCKS.includes(name)))),
        tutorialSeen: profile.tutorialSeen === true,
        medals: Object.keys(profile.medals).reduce((result, key) => {
          if (VALID_MEDAL_KEYS.includes(key) && MEDAL_RANK[profile.medals[key]] != null) result[key] = profile.medals[key];
          return result;
        }, {})
      });
    }

    updatePickups() {
      for (const pickup of this.arena.pickups) {
        if (pickup.collected || distance(pickup, this.player) > 38) continue;
        pickup.collected = true;
        if (pickup.type === 'mine') this.player.mineCount = clamp(this.player.mineCount + 2, 0, 6);
        if (pickup.type === 'armor') this.player.armorPlates = clamp(this.player.armorPlates + 1, 0, 3);
        if (pickup.type === 'shell') this.player.shellDamage = clamp(this.player.shellDamage + 1, 1, 3);
        if (pickup.type === 'smoke') this.player.smokeCount = clamp(this.player.smokeCount + 1, 0, 4);
        if (pickup.type === 'speed') this.player.speedTimer = Math.min(22, this.player.speedTimer + 9);
        this.score += 35;
        kit.audio.sfx('pickup', { volume: .55, rate: 1 + pickup.phase * .02 });
        this.spawnBurst(pickup.x, pickup.y, pickupColor(pickup.type), 15, 105);
        this.showPopup(pickup.x, pickup.y - 24, pickup.type.toUpperCase() + ' +', '#a7f4d5');
      }
    }

    dropMine() {
      if ((this.phase !== 'play' && this.phase !== 'tutorial') || !this.player.alive || this.player.mineCount <= 0 || this.mines.length >= MAX_MINES) return;
      const p = this.player;
      p.mineCount--;
      const mine = { x: p.x - Math.cos(p.angle) * 25, y: p.y - Math.sin(p.angle) * 25, arm: .72, pulse: 0, radius: 82, active: true, sprite: this.add.image(p.x, p.y, 'pickup-mine').setDepth(4).setBlendMode(Phaser.BlendModes.ADD) };
      this.mines.push(mine);
      p.deployedMines++;
      this.showPopup(mine.x, mine.y - 20, 'MINE ARMING', '#9ff5ae');
      this.spawnBurst(mine.x, mine.y, C.green, 9, 75);
      kit.audio.sfx('mine', { volume: .45, rate: .7 });
    }

    deploySmoke() {
      if ((this.phase !== 'play' && this.phase !== 'tutorial') || !this.player.alive || this.player.smokeCount <= 0) return;
      this.player.smokeCount--;
      this.player.smokeTimer = Math.max(this.player.smokeTimer, 7.5);
      this.spawnBurst(this.player.x, this.player.y, C.smoke, 30, 52);
      this.showPopup(this.player.x, this.player.y - 30, 'SMOKE SCREEN', '#c7d7d8');
    }

    updateMines(dt) {
      for (let i = this.mines.length - 1; i >= 0; i--) {
        const mine = this.mines[i];
        mine.arm -= dt; mine.pulse += dt;
        if (mine.arm > 0) continue;
        let triggered = false;
        for (const enemy of this.enemies) {
          if (enemy.alive && distance(mine, enemy) < mine.radius) { this.takeMineDamage(enemy, mine); triggered = true; }
        }
        if (triggered) {
          this.spawnExplosion(mine.x, mine.y, C.green);
          if (mine.sprite) mine.sprite.destroy();
          this.mines.splice(i, 1);
        }
      }
    }

    takeMineDamage(enemy, mine) {
      if (!enemy.alive) return;
      enemy.hp -= 2;
      enemy.hitFlash = .3;
      this.score += 100;
      this.showPopup(enemy.x, enemy.y - 38, 'MINE BLAST 2', '#9ff5ae');
      if (enemy.hp <= 0) this.destroyEnemy(enemy);
    }

    updateTutorial() {
      if (this.phase !== 'tutorial') return;
      const p = this.player;
      if (this.tutorialStage === 0 && Math.abs(p.speed) > 4) { this.tutorialStage = 1; this.tutorialFade = 0; }
      else if (this.tutorialStage === 1 && this.shotStats.shots > 0) { this.tutorialStage = 2; this.tutorialFade = 0; }
      else if (this.tutorialStage === 2 && this.shotStats.bankHits > 0) { this.tutorialStage = 3; this.tutorialFade = 0; }
      else if (this.tutorialStage === 3 && p.deployedMines > 0) {
        this.tutorialStage = 4;
        profile.tutorialSeen = true;
        this.saveProfile();
        this.phase = 'play';
        this.showPopup(this.player.x, this.player.y, 'LIVE ROUND', '#9ff5d9');
      }
    }

    playEngineBus(bus) {
      if (this.currentEngineBus === bus) return;
      this.currentEngineBus = bus;
      kit.audio.music(bus === 'rev' ? 'engineRev' : 'engineIdle', 350);
    }

    spawnFx(x, y, color, count, force, kind) {
      const systemName = kind === 'dust' ? 'dust' : kind === 'smoke' ? 'smoke' : kind === 'ring' ? 'rings' : kind === 'shard' ? 'shards' : kind === 'glint' ? 'glints' : 'sparks';
      const emitter = this.emitters[systemName];
      if (!emitter || typeof emitter.emitParticleAt !== 'function') return;
      const amount = kit.juice.enabled ? count : Math.max(1, Math.floor(count * .2));
      if (typeof emitter.setParticleTint === 'function') emitter.setParticleTint(color);
      emitter.emitParticleAt(x, y, amount);
    }

    spawnBurst(x, y, color, count, force) { this.spawnFx(x, y, color, count, force, 'spark'); }
    spawnDust(tank) { this.spawnFx(tank.x - Math.cos(tank.angle) * tank.radius, tank.y - Math.sin(tank.angle) * tank.radius, C.wallLight, 2, 24, 'dust'); }
    spawnRicochet(x, y, normal, color) {
      this.spawnFx(x, y, C.shell, 18, 135);
      this.spawnFx(x + normal.x * 4, y + normal.y * 4, color, 8, 75, 'spark');
      this.spawnFx(x, y, color, 1, 0, 'ring');
      this.spawnFx(x, y, C.white, 2, 40, 'glint');
      kit.juice.shake(4, 110);
    }
    spawnExplosion(x, y, color) {
      this.spawnFx(x, y, C.orange, 46, 230);
      this.spawnFx(x, y, color, 32, 135, 'smoke');
      this.spawnFx(x, y, C.orange, 1, 0, 'ring');
      this.spawnFx(x, y, color, 10, 150, 'shard');
      this.spawnFx(x, y, C.white, 4, 80, 'glint');
      kit.audio.sfx('explosion', { volume: .7, rate: .85 + (x % 7) * .03 });
      kit.juice.hitStop(80); kit.juice.shake(11, 260);
    }

    updateFx(dt) {
      this.damageFlash = Math.max(0, this.damageFlash - dt);
      this.damageBlink = Math.max(0, this.damageBlink - dt);
      this.shellJamTimer = Math.max(0, this.shellJamTimer - dt);
      if (this.phase === 'tutorial') this.tutorialFade = Math.min(6, this.tutorialFade + dt);
      this.updateTransient(dt);
    }

    showPopup(x, y, text, color) {
      if (this.phase === 'menu' || this.phase === 'tutorial' || this.phase === 'clear' || this.phase === 'fail') return;
      const compact = String(text).replace('RELOAD CHANNEL', 'RELOAD').replace('SMOKE SCREEN', 'SMOKE').replace('MINE ARMING', 'MINE ARM').replace('MINE BLAST', 'MINE').replace(/\s+/g, ' ').trim();
      this.enqueueTransient({ kind: 'chip', text: compact, color });
    }

    showBanner(title, subtitle, color, duration) {
      const item = { kind: 'boundary', title, subtitle, color, duration: duration || 1.5 };
      this.transientQueue = this.transientQueue.filter((candidate) => candidate.kind === 'boundary');
      if (this.activeTransient && this.activeTransient.kind === 'chip') {
        this.activeTransient = null;
        this.eventChip.setVisible(false);
      }
      this.transientQueue.unshift(item);
      this.startNextTransient();
    }

    clearTransients() {
      this.transientQueue.length = 0;
      this.activeTransient = null;
      this.transientAge = 0;
      this.banner.setVisible(false);
      this.eventChip.setVisible(false);
    }

    enqueueTransient(item) {
      if (this.activeTransient && this.activeTransient.kind === item.kind && this.activeTransient.text === item.text) return;
      if (this.transientQueue.some((candidate) => candidate.kind === item.kind && candidate.text === item.text)) return;
      if (this.transientQueue.length >= MAX_TRANSIENT_QUEUE) return;
      this.transientQueue.push(item);
      this.startNextTransient();
    }

    startNextTransient() {
      if (this.activeTransient || !this.transientQueue.length) return;
      this.activeTransient = this.transientQueue.shift();
      this.transientAge = 0;
      if (this.activeTransient.kind === 'boundary') {
        const item = this.activeTransient;
        this.bannerBg.clear();
        this.bannerBg.fillStyle(C.glass, .96);
        this.bannerBg.fillRoundedRect(-220, -52, 440, 104, 10);
        this.bannerBg.lineStyle(2, item.color, .9);
        this.bannerBg.strokeRoundedRect(-220, -52, 440, 104, 10);
        setTextIfChanged(this.bannerTitle, item.title);
        setTextIfChanged(this.bannerSub, item.subtitle);
        this.bannerTitle.setColor('#' + item.color.toString(16).padStart(6, '0'));
        this.banner.setScale(kit.juice.enabled ? .7 : 1).setVisible(true);
        this.eventChip.setVisible(false);
      } else {
        const width = Math.min(330, Math.max(180, this.uiW - 36));
        const chipColor = typeof this.activeTransient.color === 'number'
          ? this.activeTransient.color
          : parseInt(String(this.activeTransient.color).replace('#', ''), 16) || C.white;
        this.eventChipBg.clear();
        this.eventChipBg.fillStyle(C.glass, .92);
        this.eventChipBg.fillRoundedRect(0, -15, width, 30, 6);
        this.eventChipBg.lineStyle(1, chipColor, .72);
        this.eventChipBg.strokeRoundedRect(.5, -14.5, width - 1, 29, 6);
        setTextIfChanged(this.eventChipText, this.activeTransient.text);
        this.eventChipText.setColor(this.activeTransient.color);
        this.eventChip.setVisible(true).setAlpha(1);
        this.banner.setVisible(false);
      }
    }

    updateTransient(dt) {
      if (!this.activeTransient) this.startNextTransient();
      if (!this.activeTransient) return;
      this.transientAge += dt;
      const item = this.activeTransient;
      if (item.kind === 'boundary') {
        const inT = clamp(this.transientAge / .32, 0, 1);
        const ease = kit.juice.enabled ? Phaser.Math.Easing.Back.Out(inT) : inT;
        this.banner.setScale(kit.juice.enabled ? .7 + ease * .3 : 1);
        if (this.transientAge > item.duration) this.finishTransient();
      } else {
        if (kit.juice.enabled) {
          const fadeIn = clamp(this.transientAge / .12, 0, 1);
          const fadeOut = clamp((1 - this.transientAge) / .18, 0, 1);
          this.eventChip.setAlpha(Math.min(fadeIn, fadeOut));
        }
        if (this.transientAge > 1) this.finishTransient();
      }
    }

    finishTransient() {
      if (!this.activeTransient) return;
      if (this.activeTransient.kind === 'boundary') this.banner.setVisible(false);
      else this.eventChip.setVisible(false);
      this.activeTransient = null;
      this.transientAge = 0;
      this.startNextTransient();
    }

    updateCamera(dt) {
      const target = this.player && this.player.alive ? this.player : { x: 450, y: 700 };
      const desiredX = clamp(target.x - this.uiW / 2, 0, Math.max(0, WORLD_W - this.uiW));
      const desiredY = clamp(target.y - this.uiH * .62, 0, Math.max(0, WORLD_H - this.uiH));
      if (!kit.juice.enabled) { this.camera.scrollX = desiredX; this.camera.scrollY = desiredY; return; }
      this.camera.scrollX = lerp(this.camera.scrollX, desiredX, 1 - Math.exp(-dt * 4.2));
      this.camera.scrollY = lerp(this.camera.scrollY, desiredY, 1 - Math.exp(-dt * 4.2));
    }

    drawArena() {
      const g = this.worldG;
      const cam = this.camera;
      g.clear();
      g.fillStyle(this.arena ? (this.arena.floor === 'dock' ? C.fieldDeep : C.field) : C.ink, .28); g.fillRect(0, 0, WORLD_W, WORLD_H);
      const left = Math.floor(cam.scrollX / 48) * 48 - 48;
      const top = Math.floor(cam.scrollY / 48) * 48 - 48;
      g.lineStyle(1, C.grid, .55);
      for (let x = left; x < cam.scrollX + this.uiW + 48; x += 48) g.lineBetween(x, top, x, cam.scrollY + this.uiH + 48);
      for (let y = top; y < cam.scrollY + this.uiH + 48; y += 48) g.lineBetween(left, y, cam.scrollX + this.uiW + 48, y);
      g.lineStyle(3, C.gridBright, .95); g.strokeRect(WORLD_PAD, WORLD_PAD, WORLD_W - WORLD_PAD * 2, WORLD_H - WORLD_PAD * 2);
      if (this.arena.floor === 'dock') {
        g.lineStyle(2, C.water, .24);
        for (let y = 70; y < WORLD_H; y += 74) g.lineBetween(40, y, WORLD_W - 40, y);
      } else if (this.arena.floor === 'chamber') {
        g.lineStyle(2, C.purple, .13); g.strokeCircle(450, 750, 300); g.strokeCircle(450, 750, 420);
      } else if (this.arena.floor === 'stone') {
        g.lineStyle(2, C.green, .11); g.strokeRect(85, 115, 730, 1270);
      }
      for (const wall of this.arena.walls) {
        if (wall.type === 'rect') {
          g.fillStyle(C.shadow, .32); g.fillRect(wall.x + 8, wall.y + 9, wall.w, wall.h);
          const color = wall.kind === 'container' ? C.water : wall.kind === 'angled' ? C.purple : wall.kind === 'planter' ? C.green : C.wall;
          g.fillStyle(color, .24); g.fillRect(wall.x, wall.y, wall.w, wall.h);
          g.fillStyle(C.wallLight, .38); g.fillRect(wall.x, wall.y, wall.w, Math.min(3, wall.h));
          g.lineStyle(1, C.white, .22); g.strokeRect(wall.x + .5, wall.y + .5, wall.w - 1, wall.h - 1);
          if (wall.kind === 'container') { g.lineStyle(2, C.white, .14); for (let x = wall.x + 18; x < wall.x + wall.w; x += 26) g.lineBetween(x, wall.y + 3, x, wall.y + wall.h - 3); }
        } else {
          g.lineStyle(20, C.shadow, .28); g.lineBetween(wall.x1 + 7, wall.y1 + 9, wall.x2 + 7, wall.y2 + 9);
          g.lineStyle(16, C.purple, .3); g.lineBetween(wall.x1, wall.y1, wall.x2, wall.y2);
          g.lineStyle(3, C.white, .55); g.lineBetween(wall.x1, wall.y1, wall.x2, wall.y2);
        }
      }
      if (this.arena.floor === 'dust') {
        for (let i = 0; i < 10; i++) { const x = 75 + i * 83; const y = 120 + ((i * 197) % 1220); g.fillStyle(C.orange, .1); g.fillCircle(x, y, 4 + (i % 3)); }
      }
      if (this.arena.floor === 'chamber') {
        g.lineStyle(3, C.amber, .4);
        g.lineBetween(380, 410, 450, 360); g.lineBetween(450, 360, 520, 410);
        g.lineBetween(380, 1080, 450, 1130); g.lineBetween(450, 1130, 520, 1080);
      }
    }

    drawPreview() {
      this.previewG.clear();
      if (!this.player.alive || (this.phase !== 'play' && this.phase !== 'tutorial')) return;
      const start = { x: this.player.x + Math.cos(this.player.turretAngle) * 32, y: this.player.y + Math.sin(this.player.turretAngle) * 32 };
      const points = tracePreview(start, this.player.turretAngle, this.arena.walls, 2);
      let from = start;
      this.previewG.lineStyle(3, C.cyan, .2);
      for (const to of points) { this.previewG.lineBetween(from.x, from.y, to.x, to.y); from = to; }
      from = start;
      this.previewG.lineStyle(2, C.cyanHot, .88);
      for (const to of points) {
        const length = distance(from, to);
        const dx = (to.x - from.x) / Math.max(1, length); const dy = (to.y - from.y) / Math.max(1, length);
        for (let d = 0; d < length; d += 24) this.previewG.lineBetween(from.x + dx * d, from.y + dy * d, from.x + dx * Math.min(d + 10, length), from.y + dy * Math.min(d + 10, length));
        from = to;
      }
      if (points.length > 1) for (let i = 0; i < points.length - 1; i++) { this.previewG.fillStyle(C.amber, .9); this.previewG.fillCircle(points[i].x, points[i].y, 6); }
    }

    drawPickups() {
      const g = this.worldG;
      for (const pickup of this.arena.pickups) {
        if (pickup.collected) { if (pickup.sprite) pickup.sprite.setVisible(false); continue; }
        const pulse = kit.juice.enabled ? 1 + Math.sin(this.time.now * .004 + pickup.phase) * .12 : 1;
        const color = pickupColor(pickup.type);
        g.fillStyle(color, .12); g.fillCircle(pickup.x, pickup.y, 26 * pulse);
        g.lineStyle(2, color, .95); g.strokeCircle(pickup.x, pickup.y, 14 * pulse);
        if (pickup.sprite) pickup.sprite.setVisible(true).setPosition(pickup.x, pickup.y).setTint(color).setScale(.82 * pulse);
      }
    }

    drawMines() {
      const g = this.worldG;
      for (const mine of this.mines) {
        const pulse = kit.juice.enabled ? 1 + Math.sin(mine.pulse * 7) * .12 : 1;
        if (mine.sprite) mine.sprite.setVisible(true).setPosition(mine.x, mine.y).setScale(.7 * pulse).setAlpha(mine.arm > 0 ? .55 : 1);
        g.fillStyle(C.green, mine.arm > 0 ? .18 : .3); g.fillCircle(mine.x, mine.y, 20 * pulse);
        g.lineStyle(2, mine.arm > 0 ? C.green : C.danger, .95); g.strokeCircle(mine.x, mine.y, mine.arm > 0 ? 16 * pulse : mine.radius);
        if (mine.arm > 0) { g.lineStyle(2, C.green, .8); g.strokeCircle(mine.x, mine.y, 26 + (mine.arm * 18)); }
        else { g.lineStyle(2, C.danger, .32); g.strokeCircle(mine.x, mine.y, mine.radius + 8); }
      }
    }

    drawShells() {
      const g = this.worldG;
      for (const shell of this.shells) {
        if (!shell.active) { shell.sprite.setVisible(false); continue; }
        for (let i = 4; i >= 1; i--) { g.lineStyle(2 + i * .7, shell.color, .08 + (5 - i) * .04); g.lineBetween(shell.trail[i * 2], shell.trail[i * 2 + 1], shell.trail[(i - 1) * 2], shell.trail[(i - 1) * 2 + 1]); }
        shell.sprite.setVisible(true).setPosition(shell.x, shell.y).setRotation(Math.atan2(shell.vy, shell.vx)).setTint(shell.color).setScale(.52);
      }
    }

    drawTank(tank, isPlayer) {
      if (!tank.alive && tank.hitFlash <= 0) { if (tank.sprite) tank.sprite.setVisible(false); if (tank.label) tank.label.setVisible(false); return; }
      const g = this.worldG;
      const def = isPlayer ? { color: C.cyan, accent: C.cyanHot, radius: 24, silhouette: 'player' } : (AI_CLASSES[tank.className] || AI_CLASSES.scout);
      const alpha = tank.alive ? 1 : .3;
      g.fillStyle(C.shadow, .55 * alpha); g.fillEllipse(tank.x + 6, tank.y + 8, tank.radius * 2.15, tank.radius * 1.4);
      const state = isPlayer ? (tank.hitFlash > 0 ? 'tank-player-hit' : !tank.alive ? 'tank-player-wreck' : Math.abs(tank.speed) > 8 ? 'tank-player-drive' : 'tank-player-idle') : (tank.hitFlash > 0 ? 'tank-hit' : !tank.alive ? 'tank-wreck' : 'tank-' + tank.className);
      const blinking = isPlayer && this.damageBlink > 0 && Math.floor(this.time.now / 70) % 2 === 0;
      if (tank.sprite) {
        tank.sprite.setTexture(state).setPosition(tank.x, tank.y).setRotation(tank.angle).setAlpha(blinking ? 0 : alpha).setDisplaySize(tank.radius * 2.65, tank.radius * 1.9).setVisible(!blinking);
        if (state === 'tank-hit' || state === 'tank-player-hit') tank.sprite.setTint(C.white);
        else tank.sprite.clearTint();
      }
      if (tank.label) tank.label.setVisible(false);
      const turretLength = tank.className === 'sniper' ? 40 : tank.className === 'siege' ? 34 : 29;
      const turretColor = isPlayer ? C.cyanHot : def.accent;
      const tx = tank.x + Math.cos(tank.turretAngle) * turretLength;
      const ty = tank.y + Math.sin(tank.turretAngle) * turretLength;
      g.lineStyle(tank.className === 'siege' ? 9 : 6, C.shadow, alpha); g.lineBetween(tank.x, tank.y, tx, ty);
      g.lineStyle(tank.className === 'siege' ? 5 : 3, turretColor, alpha); g.lineBetween(tank.x, tank.y, tx, ty);
      g.fillStyle(turretColor, alpha); g.fillCircle(tank.x, tank.y, tank.className === 'siege' ? 12 : 9);
      g.lineStyle(2, C.white, .75 * alpha); g.strokeCircle(tank.x, tank.y, tank.className === 'siege' ? 12 : 9);
      if (isPlayer && this.player.smokeTimer > 0) { g.fillStyle(C.smoke, .1); g.fillCircle(tank.x, tank.y, 78); g.lineStyle(2, C.smoke, .32); g.strokeCircle(tank.x, tank.y, 78); }
      if (isPlayer && this.player.invuln > 0) { g.lineStyle(2, C.cyanHot, .5); g.strokeCircle(tank.x, tank.y, 34); }
      if (!isPlayer && tank.alive) {
        g.fillStyle(C.shadow, .75); g.fillRect(tank.x - 30, tank.y - tank.radius - 18, 60, 5);
        g.fillStyle(tank.color, .95); g.fillRect(tank.x - 29, tank.y - tank.radius - 17, 58 * clamp(tank.hp / tank.maxHp, 0, 1), 3);
        g.fillStyle(tank.color, .9); g.fillRect(tank.x - 25, tank.y - tank.radius - 31, 50, 3);
        g.fillStyle(C.white, .9); g.fillRect(tank.x - 25, tank.y - tank.radius - 31, 50 * (tank.className === this.activeAiClass ? 1 : .6), 3);
      }
    }

    drawFx() {
      this.fxG.clear();
    }

    drawUI() {
      const g = this.uiG;
      g.clear();
      const inMenu = this.phase === 'menu';
      if (inMenu) {
        this.hudStats.setVisible(false); this.hudClass.setVisible(false); this.hudRight.setVisible(false); this.hudHint.setVisible(false); this.settingsText.setVisible(false); this.modeText.setVisible(false); this.actionLabels.forEach((label) => label.setVisible(false)); this.tutorialText.setVisible(false);
        g.fillStyle(C.fieldDeep, 1); g.fillRect(0, 0, this.uiW, this.uiH);
        g.lineStyle(2, C.cyan, .2); g.strokeRect(35, 110, this.uiW - 70, Math.min(720, this.uiH - 150));
        for (let i = 0; i < 3; i++) { const y = 390 + i * 100; g.fillStyle(i === 0 ? C.glass : C.field, .95); g.fillRoundedRect(72, y, this.uiW - 144, 70, 9); g.lineStyle(2, [C.cyan, C.purple, C.orange][i], .68); g.strokeRoundedRect(72, y, this.uiW - 144, 70, 9); }
        this.menuTitle.setVisible(true); this.menuSub.setVisible(true); this.menuUnlock.setVisible(true); this.menuFoot.setVisible(true); this.menuButtons.forEach((button) => button.setVisible(true));
        return;
      }
      g.fillStyle(C.ink, .86); g.fillRoundedRect(12, 10, this.uiW - 24, 62, 8); g.lineStyle(1, C.cyan, .24); g.strokeRoundedRect(12.5, 10.5, this.uiW - 25, 61, 8);
      this.hudStats.setVisible(true); this.hudClass.setVisible(true); this.hudRight.setVisible(this.activeMode === 'trial'); this.hudHint.setVisible(false); this.settingsText.setVisible(true); this.modeText.setVisible(true);
      this.actionLabels.forEach((label) => label.setVisible(this.phase === 'play' || this.phase === 'tutorial'));
      this.menuTitle.setVisible(false); this.menuSub.setVisible(false); this.menuUnlock.setVisible(false); this.menuFoot.setVisible(false); this.menuButtons.forEach((button) => button.setVisible(false));
      setTextIfChanged(this.hudStats, '◆' + String(Math.floor(this.score)).padStart(5, '0') + '  L' + String(this.level).padStart(2, '0') + '  ♥' + String(Math.max(0, this.lives)));
      setTextIfChanged(this.hudClass, '♥' + this.player.hp + '/' + this.player.maxHp + '  ▣' + this.player.armorPlates + '  ◇' + this.player.shellDamage);
      setTextIfChanged(this.hudRight, this.activeMode === 'trial' ? '◷' + Math.ceil(Math.max(0, this.trialTime)) : '');
      setTextIfChanged(this.modeText, '≡'); setTextIfChanged(this.settingsText, '⚙');
      setTextIfChanged(this.actionLabels[0], '↕');
      setTextIfChanged(this.actionLabels[1], 'S' + this.player.smokeCount);
      setTextIfChanged(this.actionLabels[2], 'M' + this.player.mineCount);
      if (this.phase === 'tutorial' && !this.activeTransient) {
        g.fillStyle(C.glass, .88); g.fillRoundedRect(18, 78, this.uiW - 36, 32, 6); g.lineStyle(1, C.cyan, .42); g.strokeRoundedRect(18.5, 78.5, this.uiW - 37, 31, 6);
        const tips = [
          '1/4  MOVE',
          '2/4  AIM + FIRE',
          '3/4  CYAN = BANK',
          '4/4  MINE  ·  RED = DANGER'
        ];
        setTextIfChanged(this.tutorialText, tips[Math.min(3, this.tutorialStage)]);
        this.tutorialText.setVisible(true);
        this.tutorialText.alpha = kit.juice.enabled ? clamp(1 - Math.max(0, this.tutorialFade - 1.5) / 1.5, .08, 1) : .32;
      } else this.tutorialText.setVisible(false);
      if (this.damageFlash > 0) { g.fillStyle(C.red, clamp(this.damageFlash / .48, 0, 1) * .24); g.fillRect(0, 0, this.uiW, this.uiH); }
      if (this.phase === 'fail') {
        g.fillStyle(C.red, .12); g.fillRect(0, 0, this.uiW, this.uiH);
      }
      if (this.phase === 'play' || this.phase === 'tutorial') this.drawControlPads(g);
    }

    drawControlPads(g) {
      const driveX = 82; const smokeX = this.uiW - 166; const mineX = this.uiW - 74; const y = this.uiH - 104;
      g.lineStyle(2, C.cyan, .42); g.strokeCircle(driveX, y, 54); g.lineStyle(1, C.cyan, .28); g.strokeCircle(driveX, y, 28);
      g.fillStyle(C.cyan, .25); g.fillCircle(driveX, y, 14);
      let drivePointer = null;
      for (const p of kit.input.pointers.values()) if (p.zone === 'drive') { drivePointer = p; break; }
      if (drivePointer) { const zoom = this.camera.zoom || 1; const dx = clamp((drivePointer.x - drivePointer.startX) / zoom, -32, 32); const dy = clamp((drivePointer.y - drivePointer.startY) / zoom, -32, 32); g.fillStyle(C.cyan, .75); g.fillCircle(driveX + dx, y + dy, 16); }
      g.fillStyle(C.green, this.player.mineCount > 0 ? .22 : .08); g.fillCircle(mineX, y, 38); g.lineStyle(2, this.player.mineCount > 0 ? C.green : C.wallLight, .75); g.strokeCircle(mineX, y, 38);
      g.fillStyle(C.purple, this.player.smokeCount > 0 ? .16 : .06); g.fillCircle(smokeX, y, 32); g.lineStyle(2, this.player.smokeCount > 0 ? C.purple : C.wallLight, .7); g.strokeCircle(smokeX, y, 32);
      this.drawButtonLabel(g, 'DRIVE', driveX, this.uiH - 28, C.cyan);
      this.drawButtonLabel(g, 'SMOKE', smokeX, this.uiH - 108, C.purple);
      this.drawButtonLabel(g, 'MINE', mineX, this.uiH - 108, C.green);
    }

    drawButtonLabel(g, label, x, y, color) {
      if (label === 'SMOKE') { g.fillStyle(color, .75); g.fillCircle(x - 8, y - 22, 4); g.fillCircle(x, y - 26, 5); g.fillCircle(x + 8, y - 22, 4); }
      if (label === 'MINE') { g.fillStyle(color, .82); g.fillCircle(x, y - 22, 7); g.lineStyle(2, color, .85); g.strokeCircle(x, y - 22, 11); }
    }

    draw() {
      if (!this.arena) return;
      this.camera.setPosition(this.juiceFrame.dx, this.juiceFrame.dy);
      this.drawArena();
      this.drawPickups(); this.drawMines(); this.drawPreview(); this.drawShells();
      for (const enemy of this.enemies) this.drawTank(enemy, false);
      if (this.player.alive || this.phase === 'fail') this.drawTank(this.player, true);
      this.drawFx(); this.drawUI();
    }

    update(time, delta) {
      const dt = clamp(delta / 1000, 0, .034);
      this.juiceFrame = kit.juice.frame();
      this.claimNewPointers();
      this.updateKeyboard();
      if (!kit.paused && !this.pauseReason && !this.juiceFrame.frozen) {
        this.updateLiveSwitches();
        if (this.phase === 'play' || this.phase === 'tutorial') {
          this.shotStats.elapsed += dt;
          if (this.activeMode === 'trial') { this.trialTime -= dt; if (this.trialTime <= 0) this.completeTrialTimeout(); }
          this.updatePlayer(dt);
          for (const enemy of this.enemies) this.updateAI(enemy, dt);
          this.updateShells(dt);
          this.updateMines(dt);
          this.updateEngine(dt);
        } else if (this.phase === 'clear') {
          this.clearTimer -= dt;
          if (this.clearTimer <= 0) {
            if (this.activeMode === 'campaign' && this.level < 4) { this.level++; this.phase = 'play'; this.createLevel(); this.showBanner('LEVEL UP', 'NEXT CLASS  ' + AI_CLASSES[this.sequenceAI(this.level)].label, this.arena.accent, 1.5); }
            else this.openMenu();
          }
        }
        this.updateFx(dt);
        this.updateCamera(dt);
      }
      this.updateProbe();
      this.draw();
    }

    updateEngine(dt) {
      if (this.player.speed > 16) this.playEngineBus('rev');
      else if (this.currentEngineBus !== 'idle' && this.player.speed < 5) this.playEngineBus('idle');
    }
  }

  function sequenceAI(level) { return ['scout', 'brawler', 'sniper', 'siege'][clamp(level - 1, 0, 3)]; }
  function pickupColor(type) { return type === 'mine' ? C.green : type === 'armor' ? C.blue : type === 'shell' ? C.shell : type === 'smoke' ? C.purple : C.orange; }

  kit.loader.show('IRONCLAD ALLEY');
  kit.loader.progress(.2);
  const view = {
    width: document.documentElement.clientWidth || VIEW_W,
    height: document.documentElement.clientHeight || VIEW_H
  };
  function installDenseText() {
    const proto = Phaser.GameObjects.GameObjectFactory.prototype;
    if (proto.__iaDenseText) return;
    const original = proto.text;
    proto.text = function (x, y, value, style) {
      const next = Object.assign({}, style || {});
      const size = parseFloat(next.fontSize);
      if (Number.isFinite(size)) next.fontSize = Math.round(size * DPR) + 'px';
      delete next.resolution;
      const text = original.call(this, x, y, value, next);
      text.setScale(1 / DPR);
      return text;
    };
    proto.__iaDenseText = true;
  }
  const cfg = GGKit.hiDpi.phaser({
    type: Phaser.CANVAS,
    parent: 'game',
    backgroundColor: '#071017',
    render: Object.assign({}, GGKit.renderDefaults, { transparent: false }),
    input: { active: false },
    scale: { mode: Phaser.Scale.NONE, autoCenter: Phaser.Scale.CENTER_BOTH, width: view.width, height: view.height },
    scene: [IroncladScene]
  });
  DPR = cfg.ggDpr;
  installDenseText();
  const game = new Phaser.Game(cfg);
  window.__iaGame = game;
})();
