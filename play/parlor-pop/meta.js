/* GGKit-backed campaign, daily, mastery and furnishing state. */
(function (root) {
  'use strict';
  var LEVELS = root.PP.levels;
  var ROOMS = root.PP.rooms;
  var DAILY = root.PP.daily;
  var kit = null;
  var data = null;
  var KEY_VERSION = 2;

  function int(v, lo, hi) {
    return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v >= lo && v <= hi;
  }
  function blank() {
    return { version: KEY_VERSION, stars: {}, best: {}, daily: {}, mastery: {},
      choices: {}, boosters: { hammer: 0, rocket: 0, shuffle: 0 }, threeAwarded: {},
      tutorial: false, motionSet: false, motionEnabled: true };
  }
  function own(o, key) { return Object.prototype.hasOwnProperty.call(o, key); }
  function validDateKey(key) {
    var m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(key), y, mo, d, date;
    if (!m) return false;
    y = +m[1]; mo = +m[2]; d = +m[3];
    if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return false;
    date = new Date(Date.UTC(y, mo - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
  }
  function knownLevel(id) { return levelIndex(id) >= 0; }
  function validMapKeys(map, test) {
    for (var key in map) if (own(map, key) && !test(key)) return false;
    return true;
  }
  function valid(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o) || o.version !== KEY_VERSION) return false;
    var top = ['version', 'stars', 'best', 'daily', 'mastery', 'choices', 'boosters', 'threeAwarded', 'tutorial', 'motionSet', 'motionEnabled'];
    for (var topKey in o) if (own(o, topKey) && top.indexOf(topKey) < 0) return false;
    var maps = ['stars', 'best', 'daily', 'mastery', 'choices', 'threeAwarded'];
    for (var m = 0; m < maps.length; m++) if (!o[maps[m]] || typeof o[maps[m]] !== 'object' || Array.isArray(o[maps[m]])) return false;
    if (!o.boosters || typeof o.boosters !== 'object' || Array.isArray(o.boosters)) return false;
    for (var b in o.boosters) if (own(o.boosters, b) && b !== 'hammer' && b !== 'rocket' && b !== 'shuffle') return false;
    if (!int(o.boosters.hammer, 0, 99) || !int(o.boosters.rocket, 0, 99) || !int(o.boosters.shuffle, 0, 99)) return false;
    if (typeof o.tutorial !== 'boolean' || typeof o.motionSet !== 'boolean' || typeof o.motionEnabled !== 'boolean') return false;
    if (!validMapKeys(o.stars, knownLevel)) return false;
    if (!validMapKeys(o.best, function (key) { return knownLevel(key) || (key.indexOf('mastery-') === 0 && knownLevel(key.slice(8))); })) return false;
    if (!validMapKeys(o.mastery, knownLevel)) return false;
    if (!validMapKeys(o.threeAwarded, knownLevel)) return false;
    if (!validMapKeys(o.daily, validDateKey)) return false;
    if (!validMapKeys(o.choices, function (key) {
      var parts = key.split('-'), r = +parts[0], s = +parts[1];
      return parts.length === 2 && String(r) === parts[0] && String(s) === parts[1] && !!ROOMS[r] && !!ROOMS[r].slots[s];
    })) return false;
    for (var i = 0; i < LEVELS.length; i++) {
      var id = LEVELS[i].id;
      if (o.stars[id] != null && !int(o.stars[id], 1, 3)) return false;
      if (o.best[id] != null && !int(o.best[id], 0, 99999999)) return false;
      if (o.mastery[id] != null && !int(o.mastery[id], 1, 3)) return false;
      if (o.threeAwarded[id] != null && o.threeAwarded[id] !== true) return false;
      if (o.best['mastery-' + id] != null && !int(o.best['mastery-' + id], 0, 99999999)) return false;
    }
    for (var r = 0; r < ROOMS.length; r++) for (var s = 0; s < 3; s++) {
      var ck = r + '-' + s;
      if (o.choices[ck] != null && !int(o.choices[ck], 0, 1)) return false;
    }
    for (var day in o.daily) if (own(o.daily, day)) {
      var record = o.daily[day];
      if (!record || typeof record !== 'object' || Array.isArray(record) || !int(record.stars, 0, 3) || !int(record.best, 0, 99999999)) return false;
      for (var dayKey in record) if (own(record, dayKey) && dayKey !== 'stars' && dayKey !== 'best') return false;
    }
    return true;
  }
  function save() { if (kit && data) kit.save.set(data); }
  function levelIndex(id) { for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i].id === id) return i; return -1; }
  function roomForLevel(i) { var l = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, i | 0))]; return l ? l.room : 0; }
  function todayKey() {
    var d = new Date();
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
  }
  function starsFor(id) { return knownLevel(id) ? data.stars[id] || 0 : 0; }
  function totalStars() { var n = 0; for (var k in data.stars) if (own(data.stars, k) && knownLevel(k)) n += data.stars[k] || 0; return n; }
  function spentStars() {
    var n = 0;
    for (var k in data.choices) if (own(data.choices, k)) {
      var p = k.split('-'), r = +p[0], s = +p[1];
      if (ROOMS[r] && ROOMS[r].slots[s]) n += ROOMS[r].slots[s].cost;
    }
    return n;
  }
  function roomDone(r) { for (var s = 0; s < 3; s++) if (data.choices[r + '-' + s] == null) return false; return true; }
  function isRoomUnlocked(r) { return r <= 0 || roomDone(r - 1); }
  function isLevelUnlocked(i) {
    if (i <= 0) return true;
    var previous = LEVELS[i - 1];
    return isRoomUnlocked(roomForLevel(i)) && !!data.stars[previous.id];
  }
  function nextChoice(r) {
    for (var s = 0; s < 3; s++) if (data.choices[r + '-' + s] == null) return s;
    return -1;
  }
  function awardCampaign(id, stars, score) {
    var old = starsFor(id), gained = [];
    if (stars > old) data.stars[id] = Math.min(3, stars);
    if (score > (data.best[id] || 0)) data.best[id] = Math.min(99999999, score | 0);
    if (stars >= 3 && !data.threeAwarded[id]) {
      data.threeAwarded[id] = true;
      var keys = ['hammer', 'rocket', 'shuffle'];
      var key = keys[levelIndex(id) % keys.length];
      data.boosters[key] = Math.min(99, data.boosters[key] + 1);
      gained.push(key);
    }
    save();
    return gained;
  }
  function awardDaily(stars, score) {
    var k = todayKey(), old = data.daily[k] || { stars: 0, best: 0 };
    old.stars = Math.max(old.stars, stars);
    old.best = Math.max(old.best, score | 0);
    data.daily[k] = old;
    save();
  }
  function awardMastery(id, stars, score) {
    data.mastery[id] = Math.max(data.mastery[id] || 0, stars);
    var key = 'mastery-' + id;
    data.best[key] = Math.max(data.best[key] || 0, score | 0);
    save();
  }

  var API = {
    init: function (gk) {
      kit = gk;
      var loaded = kit.save.get(null);
      data = valid(loaded) ? loaded : blank();
      save();
      return API;
    },
    data: function () { return data; },
    persist: save,
    reset: function () { data = blank(); save(); },
    rooms: ROOMS,
    daily: DAILY,
    starsFor: starsFor,
    totalStars: totalStars,
    spentStars: spentStars,
    freeStars: function () { return Math.max(0, totalStars() - spentStars()); },
    roomDone: roomDone,
    roomUnlocked: isRoomUnlocked,
    levelUnlocked: isLevelUnlocked,
    choiceFor: function (r, s) { return !ROOMS[r] || !ROOMS[r].slots[s] || data.choices[r + '-' + s] == null ? -1 : data.choices[r + '-' + s]; },
    canChoose: function (r, s) { return !!ROOMS[r] && !!ROOMS[r].slots[s] && !roomDone(r) && data.choices[r + '-' + s] == null && API.freeStars() >= ROOMS[r].slots[s].cost; },
    choose: function (r, s, v) {
      if (!API.canChoose(r, s) || (v !== 0 && v !== 1)) return false;
      data.choices[r + '-' + s] = v; save(); return true;
    },
    nextChoice: nextChoice,
    boosters: function () { return data.boosters; },
    useBooster: function (key, allowed) {
      if (allowed === false || !data.boosters[key] || data.boosters[key] < 1) return false;
      data.boosters[key]--; save(); return true;
    },
    refundBooster: function (key) {
      if (key !== 'hammer' && key !== 'rocket' && key !== 'shuffle') return false;
      data.boosters[key] = Math.min(99, data.boosters[key] + 1); save(); return true;
    },
    record: function (mode, id, stars, score) {
      if (mode === 'daily') { awardDaily(stars, score); return []; }
      if (mode === 'mastery') { awardMastery(id, stars, score); return []; }
      return awardCampaign(id, stars, score);
    },
    dailyResult: function () { return data.daily[todayKey()] || { stars: 0, best: 0 }; },
    masteryFor: function (id) { return data.mastery[id] || 0; },
    tutorialSeen: function () { return data.tutorial; },
    markTutorial: function () { data.tutorial = true; save(); },
    motionConfigured: function () { return data.motionSet; },
    motionEnabled: function () { return data.motionEnabled; },
    setMotion: function (v) { data.motionSet = true; data.motionEnabled = !!v; save(); }
  };
  root.PP = root.PP || {};
  root.PP.meta = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
