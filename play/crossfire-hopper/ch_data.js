/* ch_data.js - authored Crossfire Hopper content and guarded pure helpers. */
(function (root) {
  'use strict';

  var CH = {};
  var own = Object.prototype.hasOwnProperty;

  CH.MODES = {
    run: { key: 'run', name: 'Band Run', short: 'RUN', blurb: 'Clear four authored crossfire bands with three lives.', lives: 3, goal: 12, seeded: false, medalsPerBand: true },
    daily: { key: 'daily', name: 'Daily Time Attack', short: 'DAILY', blurb: 'The same twelve waves for everyone today. Move fast.', lives: 1, goal: 12, seeded: true, medalsPerBand: false },
    endless: { key: 'endless', name: 'Endless Climb', short: 'ENDLESS', blurb: 'One life. Infinite platforms. How far can you hop?', lives: 1, goal: 0, seeded: false, medalsPerBand: false },
  };
  CH.MODE_ORDER = ['run', 'daily', 'endless'];
  CH.modeDef = function (key) { return CH.MODES[key] || CH.MODES.run; };

  CH.BANDS = [
    { key: 'meadow', name: 'Meadow Circuit', start: 0, end: 2, tag: 'Wide green platforms and gentle scout bursts.', sky: [0x0b2435, 0x14516b, 0x0a1828], ground: 0x215a55, platform: 0x3c9b79, accent: 0x74f3b0, danger: 0xff8b72, enemy: 0x6be6c2, music: 'music_calm' },
    { key: 'bend', name: 'Flooded Bend', start: 3, end: 5, tag: 'Moving shelves and crossfire from both banks.', sky: [0x092d45, 0x0f6074, 0x071827], ground: 0x17677b, platform: 0x45b8c3, accent: 0x6fe6f5, danger: 0xff837a, enemy: 0x68d7ed, music: 'music_calm' },
    { key: 'railyard', name: 'Rail Yard', start: 6, end: 8, tag: 'Tight shelves, sniper sights, and signal pulses.', sky: [0x171d34, 0x35305d, 0x0e1227], ground: 0x3d405b, platform: 0xc59f5d, accent: 0xffc663, danger: 0xff5f65, enemy: 0xffb864, music: 'music_storm' },
    { key: 'storm', name: 'Storm Line', start: 9, end: Infinity, tag: 'Fast platforms and a full screen crossfire.', sky: [0x241832, 0x5d2865, 0x100d22], ground: 0x4c285d, platform: 0xb885e8, accent: 0xc8a0ff, danger: 0xff597d, enemy: 0xff81c6, music: 'music_storm' },
  ];
  CH.bandIndexAt = function (wave) {
    var w = typeof wave === 'number' && isFinite(wave) ? Math.max(0, Math.floor(wave)) : 0;
    for (var i = 0; i < CH.BANDS.length; i++) if (w >= CH.BANDS[i].start && w <= CH.BANDS[i].end) return i;
    return CH.BANDS.length - 1;
  };
  CH.bandAt = function (wave) { return CH.BANDS[CH.bandIndexAt(wave)]; };
  CH.bandByKey = function (key) {
    for (var i = 0; i < CH.BANDS.length; i++) if (CH.BANDS[i].key === key) return CH.BANDS[i];
    return CH.BANDS[0];
  };

  CH.SKINS = [
    { key: 'sprout', name: 'Meadow Sprout', need: 0, body: 0x74f3b0, belly: 0x49c996, dark: 0x14332d, eye: 0xecfff1, tuft: 0xb8ffda },
    { key: 'copper', name: 'Copper Hopper', need: 3, body: 0xf0a15c, belly: 0xc9773c, dark: 0x3a2114, eye: 0xfff3e2, tuft: 0xffd18a },
    { key: 'jade', name: 'River Jade', need: 6, body: 0x62d6e8, belly: 0x3aa6c4, dark: 0x123640, eye: 0xeafcff, tuft: 0xaef2ff },
    { key: 'iron', name: 'Rail Iron', need: 9, body: 0xb9c3d4, belly: 0x8894a8, dark: 0x1e2431, eye: 0xf6faff, tuft: 0xe6edf7 },
    { key: 'violet', name: 'Storm Violet', need: 12, body: 0xb08cf5, belly: 0x7f5cd0, dark: 0x241a3d, eye: 0xf3ecff, tuft: 0xd9c6ff },
    { key: 'prism', name: 'Aurora Prism', need: 18, body: 0xfff1a8, belly: 0xf0c65e, dark: 0x3a2f10, eye: 0xfffdf0, tuft: 0xffffff },
  ];
  CH.SKIN_BY_KEY = {};
  for (var s = 0; s < CH.SKINS.length; s++) CH.SKIN_BY_KEY[CH.SKINS[s].key] = CH.SKINS[s];
  CH.skinDef = function (key) { return CH.SKIN_BY_KEY[key] || CH.SKINS[0]; };
  CH.unlockedSkins = function (bestHeight) {
    var h = typeof bestHeight === 'number' && isFinite(bestHeight) ? Math.max(0, bestHeight) : 0;
    var out = [];
    for (var i = 0; i < CH.SKINS.length; i++) if (h >= CH.SKINS[i].need) out.push(CH.SKINS[i].key);
    return out;
  };

  CH.MEDALS = {
    none: { key: 'none', name: 'Unranked', rank: 0, color: 0x64798c },
    bronze: { key: 'bronze', name: 'Bronze', rank: 1, color: 0xcd8a4e },
    silver: { key: 'silver', name: 'Silver', rank: 2, color: 0xcfd9e6 },
    gold: { key: 'gold', name: 'Gold', rank: 3, color: 0xffd35e },
  };
  CH.medalDef = function (key) { return CH.MEDALS[key] || CH.MEDALS.none; };
  CH.bandMedal = function (band, wavesCleared, damageTaken) {
    if ((damageTaken || 0) === 0 && wavesCleared >= 3) return 'gold';
    if ((damageTaken || 0) <= 1 || wavesCleared >= 2) return 'silver';
    return 'bronze';
  };
  CH.DAILY_TIERS = { gold: 72, silver: 100 };
  CH.dailyMedal = function (seconds) {
    if (!(seconds > 0)) return 'none';
    if (seconds <= CH.DAILY_TIERS.gold) return 'gold';
    if (seconds <= CH.DAILY_TIERS.silver) return 'silver';
    return 'bronze';
  };

  CH.ENEMIES = {
    scout: { hp: 1, fire: 'burst', color: 0x68e6c2, label: 'SCOUT' },
    turret: { hp: 2, fire: 'cross', color: 0xffbd65, label: 'TURRET' },
    sniper: { hp: 2, fire: 'line', color: 0xff79bb, label: 'SNIPER' },
    prism: { hp: 3, fire: 'ring', color: 0xc59fff, label: 'PRISM' },
  };
  CH.enemyDef = function (key) { return CH.ENEMIES[key] || CH.ENEMIES.scout; };
  CH.POWERUPS = {
    shield: { key: 'shield', name: 'Aegis', color: 0x72e8ff, desc: 'Ignore one hit for six seconds.' },
    pulse: { key: 'pulse', name: 'Pulse', color: 0xffd35e, desc: 'Clear hostile bolts and stun every enemy.' },
    dash: { key: 'dash', name: 'Dash', color: 0xff8fba, desc: 'Your next dodge travels farther and lasts longer.' },
  };
  CH.powerDef = function (key) { return CH.POWERUPS[key] || CH.POWERUPS.shield; };

  // Authored platform strips. y is local to a wave, ordered from the spawn
  // shelf upward. The first shelf is always safe and the last is a clear pad.
  CH.WAVES = [
    { key: 'crosswind', name: 'Crosswind', platforms: [
      { x: 270, y: 690, w: 390, safe: true }, { x: 130, y: 570, w: 190 }, { x: 410, y: 450, w: 188 },
      { x: 190, y: 330, w: 178, safe: true }, { x: 370, y: 210, w: 220, finish: true },
    ], enemies: [{ platform: 1, x: 130, kind: 'scout', delay: 1.8 }], pickups: [{ platform: 2, type: 'shield' }] },
    { key: 'splitcurrent', name: 'Split Current', platforms: [
      { x: 270, y: 690, w: 390, safe: true }, { x: 400, y: 570, w: 175 }, { x: 150, y: 450, w: 168 },
      { x: 360, y: 330, w: 170 }, { x: 180, y: 210, w: 180, finish: true },
    ], enemies: [{ platform: 1, x: 400, kind: 'scout', delay: 1.2 }, { platform: 2, x: 150, kind: 'turret', delay: 3.5 }], pickups: [{ platform: 3, type: 'pulse' }] },
    { key: 'highbridge', name: 'High Bridge', platforms: [
      { x: 270, y: 690, w: 390, safe: true }, { x: 115, y: 555, w: 150 }, { x: 400, y: 420, w: 166 },
      { x: 170, y: 285, w: 154 }, { x: 380, y: 150, w: 205, finish: true },
    ], enemies: [{ platform: 1, x: 115, kind: 'turret', delay: 1.8 }, { platform: 2, x: 400, kind: 'scout', delay: 2.8 }], pickups: [{ platform: 1, type: 'dash' }] },
    { key: 'signalbreak', name: 'Signal Break', platforms: [
      { x: 270, y: 690, w: 390, safe: true }, { x: 410, y: 550, w: 150 }, { x: 120, y: 410, w: 148 },
      { x: 390, y: 270, w: 150 }, { x: 180, y: 130, w: 176, finish: true },
    ], enemies: [{ platform: 1, x: 410, kind: 'sniper', delay: 2.0 }, { platform: 2, x: 120, kind: 'turret', delay: 2.2 }, { platform: 3, x: 390, kind: 'scout', delay: 3.2 }], pickups: [{ platform: 2, type: 'shield' }] },
    { key: 'redline', name: 'Redline', platforms: [
      { x: 270, y: 690, w: 390, safe: true }, { x: 130, y: 550, w: 142 }, { x: 405, y: 410, w: 142 },
      { x: 150, y: 270, w: 142 }, { x: 390, y: 130, w: 172, finish: true },
    ], enemies: [{ platform: 1, x: 130, kind: 'sniper', delay: 1.2 }, { platform: 2, x: 405, kind: 'turret', delay: 1.7 }, { platform: 3, x: 150, kind: 'scout', delay: 2.5 }], pickups: [{ platform: 3, type: 'pulse' }] },
    { key: 'crosstalk', name: 'Crosstalk', platforms: [
      { x: 270, y: 690, w: 390, safe: true }, { x: 395, y: 555, w: 140 }, { x: 140, y: 420, w: 140 },
      { x: 400, y: 285, w: 140 }, { x: 160, y: 150, w: 164, finish: true },
    ], enemies: [{ platform: 1, x: 395, kind: 'sniper', delay: 1.0 }, { platform: 2, x: 140, kind: 'sniper', delay: 2.0 }, { platform: 3, x: 400, kind: 'turret', delay: 2.8 }], pickups: [{ platform: 1, type: 'dash' }] },
    { key: 'nightshift', name: 'Night Shift', platforms: [
      { x: 270, y: 690, w: 390, safe: true }, { x: 120, y: 545, w: 132 }, { x: 410, y: 400, w: 132 },
      { x: 125, y: 255, w: 132 }, { x: 395, y: 110, w: 158, finish: true },
    ], enemies: [{ platform: 1, x: 120, kind: 'turret', delay: 0.8 }, { platform: 2, x: 410, kind: 'sniper', delay: 1.4 }, { platform: 3, x: 125, kind: 'prism', delay: 3.0 }], pickups: [{ platform: 2, type: 'shield' }] },
    { key: 'aurora', name: 'Aurora Crossfire', platforms: [
      { x: 270, y: 690, w: 390, safe: true }, { x: 410, y: 555, w: 130 }, { x: 130, y: 420, w: 130 },
      { x: 410, y: 285, w: 130 }, { x: 130, y: 150, w: 150, finish: true },
    ], enemies: [{ platform: 1, x: 410, kind: 'prism', delay: 0.7 }, { platform: 2, x: 130, kind: 'sniper', delay: 1.1 }, { platform: 3, x: 410, kind: 'turret', delay: 1.8 }], pickups: [{ platform: 2, type: 'pulse' }, { platform: 3, type: 'dash' }] },
  ];
  CH.OPENING = ['safe-launch', 'crosswind'];
  CH.waveDef = function (index) {
    var i = typeof index === 'number' && isFinite(index) ? Math.max(0, Math.floor(index)) : 0;
    return CH.WAVES[i % CH.WAVES.length] || CH.WAVES[0];
  };
  CH.MILESTONES = [3, 6, 9, 12];
  CH.TUTORIAL = [
    { key: 'move', text: 'Move left/right · swipe or arrows' },
    { key: 'hop', text: 'Jump · swipe up or press up' },
    { key: 'dodge', text: 'Dodge · down or space when red locks on' },
    { key: 'power', text: 'Collect power · tap the bolt to use it' },
  ];

  CH.SCORE = { wave: 150, enemy: 40, pickup: 25, dodge: 8, damage: 0 };
  CH.scoreOf = function (waves, enemies, pickups, dodges) {
    return Math.max(0, Math.round((waves || 0) * 150 + (enemies || 0) * 40 + (pickups || 0) * 25 + (dodges || 0) * 8));
  };
  CH.dailySeedFor = function (date) {
    var d = date || new Date();
    return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  };
  CH.dailyLabelFor = function (date) {
    var d = date || new Date();
    var mm = ('0' + (d.getUTCMonth() + 1)).slice(-2);
    var dd = ('0' + d.getUTCDate()).slice(-2);
    return d.getUTCFullYear() + '-' + mm + '-' + dd;
  };
  CH.formatTime = function (seconds) {
    var s = Math.max(0, Number(seconds) || 0);
    var m = Math.floor(s / 60), r = s - m * 60;
    return m + ':' + (r < 10 ? '0' : '') + r.toFixed(1);
  };
  CH.rngFrom = function (seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  CH.rowRng = function (seed, wave) {
    return CH.rngFrom(((seed >>> 0) ^ Math.imul((wave | 0) + 1, 0x9E3779B1)) >>> 0);
  };

  CH.SAVE_VERSION = 4;
  CH.defaultSave = function () {
    return { v: CH.SAVE_VERSION, bestHeight: 0, bestScore: 0, bestEndless: 0,
      runBest: 0, runMedals: {}, daily: {}, skin: 'sprout', unlocked: ['sprout'],
      tutorialDone: false, totalCoins: 0, runs: 0 };
  };
  function nonNegativeInt(v, max) { return typeof v === 'number' && isFinite(v) && v >= 0 && Math.floor(v) === v && v <= max; }
  function validMedal(v) { return v === 'none' || v === 'bronze' || v === 'silver' || v === 'gold'; }
  CH.validateSave = function (o) {
    if (!o || typeof o !== 'object' || Array.isArray(o) || o.v !== CH.SAVE_VERSION) return false;
    if (!nonNegativeInt(o.bestHeight, 100000) || !nonNegativeInt(o.bestScore, 100000000) || !nonNegativeInt(o.bestEndless, 100000)) return false;
    if (!nonNegativeInt(o.runBest, 100000) || !nonNegativeInt(o.totalCoins, 100000000) || !nonNegativeInt(o.runs, 1000000)) return false;
    if (typeof o.tutorialDone !== 'boolean' || !CH.SKIN_BY_KEY[o.skin] || !Array.isArray(o.unlocked) || o.unlocked.length < 1 || o.unlocked.length > CH.SKINS.length) return false;
    var seen = {};
    for (var i = 0; i < o.unlocked.length; i++) {
      if (!CH.SKIN_BY_KEY[o.unlocked[i]] || seen[o.unlocked[i]]) return false;
      seen[o.unlocked[i]] = true;
    }
    if (!seen[o.skin] || !o.runMedals || typeof o.runMedals !== 'object' || Array.isArray(o.runMedals)) return false;
    for (var bandKey in o.runMedals) {
      var knownBand = false;
      for (var bi = 0; bi < CH.BANDS.length; bi++) if (CH.BANDS[bi].key === bandKey) knownBand = true;
      if (own.call(o.runMedals, bandKey) && (!knownBand || !validMedal(o.runMedals[bandKey]))) return false;
    }
    if (!o.daily || typeof o.daily !== 'object' || Array.isArray(o.daily)) return false;
    for (var day in o.daily) {
      if (!own.call(o.daily, day) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
      var record = o.daily[day];
      if (!record || typeof record !== 'object' || typeof record.time !== 'number' || !isFinite(record.time) || record.time < 0 || record.time > 86400 || !validMedal(record.medal)) return false;
    }
    return true;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CH;
  root.CHDATA = CH;
})(typeof window !== 'undefined' ? window : globalThis);
