/* Aftergate - content tables. Original IP. No network, no CDN.
 * Every keyed lookup in this file has a guarded accessor at the bottom:
 * a variant miss must degrade to a sane default, never freeze the game.
 */
'use strict';
var AG = window.AG || {};
window.AG = AG;

AG.DW = 540;
AG.DH = 960;
AG.STEP = 1 / 60;
AG.MAX_SQUAD = 400;
AG.MAX_TROOPS = 999;
AG.SAVE_V = 3;

/* ------------------------------------------------------------ math bits */
AG.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
AG.lerp = function (a, b, t) { return a + (b - a) * t; };
AG.rnd = function (a, b) { return a + Math.random() * (b - a); };
AG.rndi = function (a, b) { return Math.floor(a + Math.random() * (b - a + 1)); };

/* mulberry32: authored roads want a stable shape per site+run, not noise */
AG.rng = function (seed) {
  var s = (seed >>> 0) || 1;
  return function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    var t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/* ------------------------------------------------------------ gate ops */
AG.applyOp = function (n, op) {
  if (!op) return n;
  var out = n;
  if (op.op === 'mul') out = Math.round(n * op.v);
  else if (op.op === 'div') out = Math.floor(n / op.v);
  else if (op.op === 'add') out = n + op.v;
  else if (op.op === 'sub') out = n - op.v;
  if (!isFinite(out)) out = n;
  return AG.clamp(Math.round(out), 0, AG.MAX_SQUAD);
};
AG.opLabel = function (op) {
  if (!op) return '?';
  if (op.op === 'mul') return 'x' + op.v;
  if (op.op === 'div') return '/' + op.v;
  if (op.op === 'add') return '+' + op.v;
  return '-' + op.v;
};
AG.opGood = function (op) { return !!op && (op.op === 'mul' || op.op === 'add'); };
/* Gates are generous by contract: a bad half can gut the column but can
 * never wipe the run on its own. Only mobs and the wall can end you. */
AG.applyGateOp = function (n, op) {
  var out = AG.applyOp(n, op);
  if (out < 1 && n > 0) out = 1;
  return out;
};

/* --------------------------------------------------------------- roles */
/* dps is honest sustained damage: per-shot damage = dps * cd (see BaseScene) */
AG.ROLES = {
  spear: {
    key: 'spear', name: 'SPEAR', cost: 10, range: 160, dps: 40, cd: 0.50,
    splash: 0, color: 0x3fd18a, css: '#3fd18a', icon: 'ico_spear', shot: 'jab',
    blurb: 'Close guard. Cheap, fast, hits the first body over the parapet.'
  },
  bow: {
    key: 'bow', name: 'BOW', cost: 15, range: 360, dps: 22, cd: 0.70,
    splash: 0, color: 0x5aa9ff, css: '#5aa9ff', icon: 'ico_bow', shot: 'arrow',
    blurb: 'Long reach. Thins the column before it ever touches stone.'
  },
  oil: {
    key: 'oil', name: 'OIL', cost: 24, range: 200, dps: 34, cd: 1.15,
    splash: 74, color: 0xffa04d, css: '#ffa04d', icon: 'ico_oil', shot: 'pot',
    blurb: 'Slow pour, wide burn. The answer to a packed lane.'
  }
};
AG.ROLE_KEYS = ['spear', 'bow', 'oil'];
AG.ROLE_MAX_LVL = 3;
AG.upgradeCost = function (roleKey, lvl) {
  var r = AG.role(roleKey);
  return Math.round(r.cost * (lvl + 1) * 1.3);
};

/* ------------------------------------------------------------- enemies */
AG.ETYPES = {
  grunt: { key: 'grunt', hp: 26, spd: 32, dmg: 10, w: 22, h: 28, color: 0xc04450, sprite: 'foe_grunt', threat: 1, attack: 'melee' },
  runner: { key: 'runner', hp: 15, spd: 68, dmg: 6, w: 18, h: 24, color: 0xd98ac0, sprite: 'foe_runner', threat: 1, attack: 'melee' },
  brute: { key: 'brute', hp: 78, spd: 21, dmg: 24, w: 32, h: 36, color: 0x8f5bd6, sprite: 'foe_brute', threat: 3, attack: 'projectile' },
  ravager: { key: 'ravager', hp: 150, spd: 17, dmg: 34, w: 38, h: 42, color: 0xe0603a, sprite: 'foe_ravager', threat: 5, attack: 'melee' }
};

/* --------------------------------------------------------------- sites */
/* 4 authored road/wall identities. gateGap drives gate-density pacing;
 * mix drives what the road throws at you; each has one signature landmark. */
AG.SITES = [
  {
    id: 'recruit', num: 1, name: 'Recruit Road', wall: 'The Palisade',
    sky: 0x121a28, road: 0x22314a, road2: 0x293c58, rail: 0x3b5170, grass: 0x16241d,
    accent: 0x7ee0a8, accentCss: '#7ee0a8', fog: 0x0e1622,
    landmark: 'lm_cairn', landmarkName: 'Muster Cairn', landmarkAt: 0.52,
    len: 4200, startSquad: 6, gateGap: [300, 350],
    mix: { gate: 0.60, mob: 0.14, saw: 0.08, barricade: 0.04, recruit: 0.14 },
    swing: 0.85,
    waves: [1, 2], wallMax: 160,
    waveMix: { grunt: 0.82, runner: 0.18, brute: 0, ravager: 0 },
    music: 'mus_road'
  },
  {
    id: 'causeway', num: 2, name: 'Ruined Causeway', wall: 'Causeway Redoubt',
    sky: 0x141422, road: 0x2b2a3c, road2: 0x343349, rail: 0x4a4763, grass: 0x1d1b28,
    accent: 0x8fd0ff, accentCss: '#8fd0ff', fog: 0x110f1c,
    landmark: 'lm_arch', landmarkName: 'The Broken Arch', landmarkAt: 0.46,
    len: 4800, startSquad: 8, gateGap: [330, 400],
    mix: { gate: 0.48, mob: 0.14, saw: 0.22, barricade: 0.12, recruit: 0.04 },
    swing: 1.0,
    waves: [3, 4, 5], wallMax: 210,
    waveMix: { grunt: 0.58, runner: 0.30, brute: 0.12, ravager: 0 },
    music: 'mus_road'
  },
  {
    id: 'pass', num: 3, name: 'Mob-Choked Pass', wall: 'Pass Gatehouse',
    sky: 0x1b1418, road: 0x3a2a2c, road2: 0x453235, rail: 0x5e4245, grass: 0x241a1c,
    accent: 0xffa04d, accentCss: '#ffa04d', fog: 0x160f11,
    landmark: 'lm_totem', landmarkName: 'The Bone Totem', landmarkAt: 0.58,
    len: 5200, startSquad: 10, gateGap: [360, 430],
    mix: { gate: 0.42, mob: 0.36, saw: 0.10, barricade: 0.08, recruit: 0.04 },
    swing: 1.15,
    waves: [6, 7, 8], wallMax: 250,
    waveMix: { grunt: 0.44, runner: 0.24, brute: 0.26, ravager: 0.06 },
    music: 'mus_march'
  },
  {
    id: 'siege', num: 4, name: 'Aftergate Approach', wall: 'The Aftergate',
    sky: 0x1a1010, road: 0x392224, road2: 0x452a2c, rail: 0x6b3c34, grass: 0x231416,
    accent: 0xffd479, accentCss: '#ffd479', fog: 0x140a0a,
    landmark: 'lm_gate', landmarkName: 'The Aftergate', landmarkAt: 0.66,
    len: 5600, startSquad: 12, gateGap: [300, 380],
    mix: { gate: 0.50, mob: 0.22, saw: 0.16, barricade: 0.08, recruit: 0.04 },
    swing: 1.35,
    waves: [9, 10], wallMax: 300,
    waveMix: { grunt: 0.32, runner: 0.22, brute: 0.30, ravager: 0.16 },
    music: 'mus_siege'
  }
];
AG.SITE_BY_ID = {};
(function () { for (var i = 0; i < AG.SITES.length; i++) AG.SITE_BY_ID[AG.SITES[i].id] = AG.SITES[i]; })();

/* --------------------------------------------------- Gate Rush roads */
/* Hand-authored short recruit roads. y is metres along the road.
 * Unlock chain: clear road N (bronze or better) to open road N+1. */
function g(y, l, r) { return { k: 'gate', y: y, L: l, R: r }; }
function m(y, side, size) { return { k: 'mob', y: y, side: side, size: size }; }
function sw(y, spd) { return { k: 'saw', y: y, spd: spd }; }
function br(y, side) { return { k: 'barricade', y: y, side: side }; }
function rc(y, v) { return { k: 'recruit', y: y, v: v, side: (Math.abs(y) % 2 ? 'L' : 'R') }; }
function O(o, v) { return { op: o, v: v }; }

AG.RUSH_ROADS = [
  {
    id: 'rr1', name: 'First Muster', site: 'recruit', len: 2200, startSquad: 5,
    hint: 'Every road is a maths problem. Read both halves, then commit.',
    medals: { bronze: 40, silver: 90, gold: 160 },
    nodes: [
      g(520, O('add', 14), O('sub', 8)),
      rc(760, 8),
      g(920, O('mul', 2), O('add', 6)),
      g(1240, O('add', 22), O('div', 2)),
      m(1480, 'L', 12),
      g(1620, O('mul', 2), O('sub', 14)),
      rc(1820, 12),
      g(1960, O('mul', 3), O('add', 18))
    ]
  },
  {
    id: 'rr2', name: 'Toll Bridge', site: 'causeway', len: 2500, startSquad: 6,
    hint: 'Two good halves happen. Take the bigger one anyway.',
    medals: { bronze: 60, silver: 130, gold: 230 },
    nodes: [
      g(500, O('add', 18), O('add', 9)),
      sw(700, 1.2),
      g(860, O('mul', 2), O('add', 24)),
      br(1080, 'R'),
      g(1220, O('add', 30), O('div', 2)),
      sw(1440, 1.5),
      g(1580, O('mul', 2), O('sub', 20)),
      rc(1800, 16),
      g(1940, O('mul', 2), O('add', 26)),
      g(2260, O('mul', 3), O('sub', 30))
    ]
  },
  {
    id: 'rr3', name: 'Saw Gauntlet', site: 'causeway', len: 2700, startSquad: 8,
    hint: 'Blades chip a share of the squad, not a flat number. Grow first.',
    medals: { bronze: 70, silver: 150, gold: 260 },
    nodes: [
      g(480, O('mul', 2), O('add', 12)),
      sw(660, 1.3),
      sw(840, 1.6),
      g(1000, O('add', 34), O('div', 2)),
      sw(1200, 1.8),
      br(1360, 'L'),
      g(1500, O('mul', 2), O('sub', 24)),
      sw(1700, 2.0),
      rc(1880, 20),
      g(2020, O('mul', 2), O('add', 30)),
      sw(2220, 2.2),
      g(2440, O('mul', 3), O('add', 20))
    ]
  },
  {
    id: 'rr4', name: 'Press Gang', site: 'pass', len: 2900, startSquad: 10,
    hint: 'A mob costs exactly its number. Sometimes you can afford it.',
    medals: { bronze: 80, silver: 170, gold: 290 },
    nodes: [
      g(480, O('add', 20), O('mul', 2)),
      m(700, 'L', 18),
      g(860, O('mul', 2), O('sub', 16)),
      m(1080, 'R', 30),
      g(1240, O('add', 40), O('div', 2)),
      m(1460, 'F', 26),
      g(1620, O('mul', 2), O('add', 22)),
      m(1840, 'L', 48),
      rc(2020, 24),
      g(2160, O('mul', 2), O('sub', 34)),
      m(2380, 'R', 60),
      g(2560, O('mul', 3), O('add', 28))
    ]
  },
  {
    id: 'rr5', name: 'Split Causeway', site: 'causeway', len: 3100, startSquad: 10,
    hint: 'Halving hurts most when you are big. Time the doubles.',
    medals: { bronze: 100, silver: 200, gold: 330 },
    nodes: [
      g(460, O('mul', 2), O('add', 16)),
      br(660, 'L'),
      g(800, O('mul', 2), O('div', 2)),
      sw(1000, 1.6),
      g(1160, O('add', 46), O('sub', 22)),
      m(1380, 'F', 34),
      g(1540, O('mul', 2), O('add', 34)),
      br(1740, 'R'),
      g(1880, O('mul', 3), O('div', 2)),
      sw(2080, 2.0),
      rc(2260, 30),
      g(2400, O('mul', 2), O('add', 40)),
      m(2620, 'L', 70),
      g(2800, O('mul', 2), O('sub', 40))
    ]
  },
  {
    id: 'rr6', name: 'Aftergate Approach', site: 'siege', len: 3400, startSquad: 12,
    hint: 'The last road. Everything at once, and the gate is watching.',
    medals: { bronze: 130, silver: 250, gold: 380 },
    nodes: [
      g(460, O('mul', 2), O('add', 24)),
      m(680, 'R', 26),
      g(840, O('mul', 2), O('sub', 28)),
      sw(1040, 1.8),
      g(1200, O('add', 52), O('div', 2)),
      br(1400, 'L'),
      g(1540, O('mul', 2), O('add', 36)),
      m(1760, 'F', 52),
      g(1920, O('mul', 3), O('sub', 44)),
      sw(2120, 2.2),
      rc(2300, 36),
      g(2440, O('mul', 2), O('add', 48)),
      m(2660, 'R', 90),
      g(2840, O('mul', 2), O('div', 2)),
      sw(3040, 2.4),
      g(3200, O('mul', 3), O('add', 40))
    ]
  }
];
AG.RUSH_BY_ID = {};
(function () { for (var i = 0; i < AG.RUSH_ROADS.length; i++) AG.RUSH_BY_ID[AG.RUSH_ROADS[i].id] = AG.RUSH_ROADS[i]; })();

/* -------------------------------------------------------------- modes */
AG.MODES = {
  campaign: {
    key: 'campaign', name: 'AFTERGATE', sub: 'Ten waves. Four walls. One road.',
    icon: 'ico_campaign'
  },
  rush: {
    key: 'rush', name: 'GATE RUSH', sub: 'Short authored roads. Grow the biggest squad.',
    icon: 'ico_rush'
  },
  endless: {
    key: 'endless', name: 'ENDLESS WALL', sub: 'Past wave ten. Hold until it falls.',
    icon: 'ico_endless'
  }
};
AG.MODE_KEYS = ['campaign', 'rush', 'endless'];

/* ------------------------------------------------------------- medals */
AG.MEDAL_ORDER = { '': 0, bronze: 1, silver: 2, gold: 3 };
AG.MEDAL_CSS = { bronze: '#c98a52', silver: '#c8d4e0', gold: '#ffd479' };
AG.MEDAL_COLOR = { bronze: 0xc98a52, silver: 0xc8d4e0, gold: 0xffd479 };

/* Campaign medal reads all three owner axes: waves held, squad size that
 * reached the last wall, and wall integrity left standing. */
AG.campaignMedal = function (st) {
  var waves = st.waves || 0, integrity = st.integrity || 0, squad = st.bestSquad || 0;
  if (waves >= 10 && integrity >= 0.60 && squad >= 120) return 'gold';
  if (waves >= 10) return 'silver';
  if (waves >= 8 || (waves >= 6 && squad >= 90)) return 'bronze';
  if (waves >= 4) return 'bronze';
  return '';
};
AG.rushMedal = function (roadId, squad) {
  var road = AG.rushRoad(roadId);
  if (squad >= road.medals.gold) return 'gold';
  if (squad >= road.medals.silver) return 'silver';
  if (squad >= road.medals.bronze) return 'bronze';
  return '';
};
AG.endlessMedal = function (waves) {
  if (waves >= 20) return 'gold';
  if (waves >= 12) return 'silver';
  if (waves >= 5) return 'bronze';
  return '';
};

/* --------------------------------------------------- wave composition */
/* GENEROUS payouts: every held wave pays troops and repairs stone. */
AG.wavePayout = function (wave) { return 14 + wave * 7; };
AG.waveRepair = function (wallMax) { return Math.round(wallMax * 0.34); };

AG.waveCount = function (wave) { return Math.min(46, 6 + wave * 3); };
AG.waveHpScale = function (wave) { return 1 + (wave - 1) * 0.42; };

AG.rollWaveType = function (mixIn, rand) {
  var mix = mixIn || { grunt: 1 };
  var keys = ['grunt', 'runner', 'brute', 'ravager'];
  var total = 0, i;
  for (i = 0; i < keys.length; i++) total += (mix[keys[i]] || 0);
  if (total <= 0) return 'grunt';
  var r = (rand ? rand() : Math.random()) * total, acc = 0;
  for (i = 0; i < keys.length; i++) {
    acc += (mix[keys[i]] || 0);
    if (r < acc) return keys[i];
  }
  return 'grunt';
};

/* ------------------------------------------------------ save defaults */
AG.defaultSave = function () {
  return {
    v: AG.SAVE_V,
    campaign: { best: 0, medal: '', bestSquad: 0, cleared: false },
    endless: { best: 0, medal: '' },
    rush: {},
    bestSquad: 0,
    tutorialSeen: false,
    tutorial: { steer: false, evade: false, portal: false, garrison: false, wallEvade: false }
  };
};
AG.validateSave = function (o) {
  if (!o || typeof o !== 'object') return false;
  if (o.v !== AG.SAVE_V) return false;
  if (!o.campaign || typeof o.campaign !== 'object') return false;
  if (!o.rush || typeof o.rush !== 'object') return false;
  if (!o.endless || typeof o.endless !== 'object') return false;
  return true;
};
AG.normalizeSave = function (o) {
  var d = AG.defaultSave();
  if (!AG.validateSave(o)) return d;
  d.campaign.best = AG.clamp(Number(o.campaign.best) || 0, 0, 10);
  d.campaign.bestSquad = AG.clamp(Number(o.campaign.bestSquad) || 0, 0, AG.MAX_SQUAD);
  var claimedCampaign = AG.MEDAL_ORDER[o.campaign.medal] ? o.campaign.medal : '';
  var inferredCampaign = AG.campaignMedal({
    waves: d.campaign.best, integrity: 1, bestSquad: d.campaign.bestSquad
  });
  // A save cannot claim a tier that its numeric progress cannot support.
  // Gold is retained only when the old save explicitly earned it and its
  // numeric prerequisites still hold; wall integrity is not persisted.
  d.campaign.medal = claimedCampaign === 'gold' && inferredCampaign === 'gold' ? 'gold' :
    (d.campaign.best >= 10 ? 'silver' : inferredCampaign);
  d.campaign.cleared = !!o.campaign.cleared && d.campaign.best >= 10;
  d.endless.best = AG.clamp(Number(o.endless.best) || 0, 0, 9999);
  d.endless.medal = AG.endlessMedal(d.endless.best);
  d.bestSquad = AG.clamp(Number(o.bestSquad) || 0, 0, AG.MAX_SQUAD);
  d.tutorialSeen = !!o.tutorialSeen;
  var oldTutorial = o.tutorial && typeof o.tutorial === 'object' ? o.tutorial : {};
  for (var tk in d.tutorial) d.tutorial[tk] = !!oldTutorial[tk];
  for (var i = 0; i < AG.RUSH_ROADS.length; i++) {
    var id = AG.RUSH_ROADS[i].id, row = o.rush[id];
    if (row && typeof row === 'object') {
      d.rush[id] = {
        best: AG.clamp(Number(row.best) || 0, 0, AG.MAX_SQUAD),
        medal: AG.rushMedal(id, AG.clamp(Number(row.best) || 0, 0, AG.MAX_SQUAD))
      };
    }
  }
  return d;
};
AG.rushUnlocked = function (save, idx) {
  if (idx <= 0) return true;
  var prev = AG.RUSH_ROADS[idx - 1];
  if (!prev) return false;
  var row = save.rush[prev.id];
  return !!(row && AG.MEDAL_ORDER[row.medal] > 0);
};
AG.rushProgress = function (save) {
  var done = 0;
  for (var i = 0; i < AG.RUSH_ROADS.length; i++) {
    var row = save.rush[AG.RUSH_ROADS[i].id];
    if (row && AG.MEDAL_ORDER[row.medal] > 0) done++;
  }
  return done;
};

/* --------------------------------------------- GUARDED LOOKUPS (bug class) */
/* A FAMILY[variant] miss hard-froze a shipped title. Nothing below can miss. */
AG.role = function (k) { return AG.ROLES[k] || AG.ROLES.spear; };
AG.etype = function (k) { return AG.ETYPES[k] || AG.ETYPES.grunt; };
AG.site = function (id) { return AG.SITE_BY_ID[id] || AG.SITES[0]; };
AG.siteAt = function (i) { return AG.SITES[AG.clamp(i | 0, 0, AG.SITES.length - 1)] || AG.SITES[0]; };
AG.rushRoad = function (id) { return AG.RUSH_BY_ID[id] || AG.RUSH_ROADS[0]; };
AG.rushIndex = function (id) {
  for (var i = 0; i < AG.RUSH_ROADS.length; i++) if (AG.RUSH_ROADS[i].id === id) return i;
  return 0;
};
AG.mode = function (k) { return AG.MODES[k] || AG.MODES.campaign; };
