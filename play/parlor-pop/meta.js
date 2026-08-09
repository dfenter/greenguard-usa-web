/* Parlor Pop - meta.js : persistence + the room-restoration meta layer. */
(function (root) {
  'use strict';
  var KEY = 'parlorpop.save.v1';
  var LEVELS = root.PP.levels;

  /* Three rooms, three slots each, two furnishing variants per slot.
     Everything is bought with stars earned by playing. No currency, ever. */
  var ROOMS = [
    {
      name: 'The Front Parlor', wall: '#4a3b52', floor: '#5b4433',
      slots: [
        { name: 'Hearth', cost: 2, opts: ['Stone Mantel', 'Iron Stove'] },
        { name: 'Seating', cost: 3, opts: ['Wing Chairs', 'Long Settee'] },
        { name: 'Light', cost: 3, opts: ['Brass Sconces', 'Hanging Lamp'] }
      ]
    },
    {
      name: 'The Reading Room', wall: '#3b4a52', floor: '#54402f',
      slots: [
        { name: 'Shelves', cost: 4, opts: ['Open Stacks', 'Glass Cases'] },
        { name: 'Floor', cost: 4, opts: ['Woven Rug', 'Painted Tiles'] },
        { name: 'Window', cost: 5, opts: ['Tall Sash', 'Stained Arch'] }
      ]
    },
    {
      name: 'The Winter Garden', wall: '#3d5244', floor: '#4d4636',
      slots: [
        { name: 'Planting', cost: 5, opts: ['Fern Bank', 'Citrus Trees'] },
        { name: 'Water', cost: 6, opts: ['Tiled Basin', 'Small Fountain'] },
        { name: 'Roof', cost: 6, opts: ['Glass Vault', 'Slatted Shade'] }
      ]
    }
  ];

  function blank() {
    return { stars: {}, best: {}, boost: [0, 0, 0], streak: 0, choice: {}, sound: 1, seen: 0 };
  }

  function isInt(v, lo, hi) {
    return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v >= lo && v <= hi;
  }

  var data = blank();

  function load() {
    data = blank();
    var raw = null;
    try { raw = root.localStorage ? root.localStorage.getItem(KEY) : null; } catch (e) { raw = null; }
    if (!raw || typeof raw !== 'string') return;
    var o = null;
    try { o = JSON.parse(raw); } catch (e) { o = null; }
    if (!o || typeof o !== 'object' || Array.isArray(o)) return;

    var k;
    if (o.stars && typeof o.stars === 'object' && !Array.isArray(o.stars)) {
      for (k in o.stars) {
        var li = parseInt(k, 10);
        if (isInt(li, 0, LEVELS.length - 1) && isInt(o.stars[k], 1, 3)) data.stars[li] = o.stars[k];
      }
    }
    if (o.best && typeof o.best === 'object' && !Array.isArray(o.best)) {
      for (k in o.best) {
        var bi = parseInt(k, 10);
        if (isInt(bi, 0, LEVELS.length - 1) && isInt(o.best[k], 0, 9999999)) data.best[bi] = o.best[k];
      }
    }
    if (Array.isArray(o.boost)) {
      for (var i = 0; i < 3; i++) data.boost[i] = isInt(o.boost[i], 0, 99) ? o.boost[i] : 0;
    }
    if (isInt(o.streak, 0, 999)) data.streak = o.streak;
    if (isInt(o.seen, 0, 1)) data.seen = o.seen;
    data.sound = (o.sound === 0 || o.sound === false) ? 0 : 1;
    if (o.choice && typeof o.choice === 'object' && !Array.isArray(o.choice)) {
      for (k in o.choice) {
        var p = String(k).split('-');
        var r = parseInt(p[0], 10), s = parseInt(p[1], 10);
        if (!isInt(r, 0, ROOMS.length - 1) || !isInt(s, 0, 2)) continue;
        if (isInt(o.choice[k], 0, 1)) data.choice[r + '-' + s] = o.choice[k];
      }
    }
  }

  function save() {
    try {
      if (!root.localStorage) return;
      root.localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) { /* private mode / quota: play on without persistence */ }
  }

  var API = {
    ROOMS: ROOMS,
    load: load,
    save: save,
    data: function () { return data; },
    reset: function () { data = blank(); save(); },

    starsFor: function (i) { return data.stars[i] || 0; },
    bestFor: function (i) { return data.best[i] || 0; },
    totalStars: function () {
      var n = 0; for (var k in data.stars) n += data.stars[k]; return n;
    },
    spentStars: function () {
      var n = 0;
      for (var k in data.choice) {
        var p = k.split('-');
        n += ROOMS[+p[0]].slots[+p[1]].cost;
      }
      return n;
    },
    freeStars: function () { return API.totalStars() - API.spentStars(); },

    // furthest unlocked level index (always at least 0; never gated by lives)
    unlocked: function () {
      var n = 0;
      for (var i = 0; i < LEVELS.length; i++) { if (data.stars[i]) n = i + 1; }
      return Math.min(n, LEVELS.length - 1);
    },
    isUnlocked: function (i) { return i <= API.unlocked(); },

    choiceFor: function (r, s) {
      var v = data.choice[r + '-' + s];
      return (v === 0 || v === 1) ? v : -1;
    },
    setChoice: function (r, s, v) { data.choice[r + '-' + s] = v ? 1 : 0; save(); },
    roomDone: function (r) {
      for (var s = 0; s < 3; s++) if (API.choiceFor(r, s) < 0) return false;
      return true;
    },
    allDone: function () {
      for (var r = 0; r < ROOMS.length; r++) if (!API.roomDone(r)) return false;
      return true;
    },

    boosters: function () { return data.boost; },
    useBooster: function (i) {
      if (data.boost[i] > 0) { data.boost[i]--; save(); return true; }
      return false;
    },

    // Returns a list of booster indices awarded for this result.
    finish: function (levelIdx, stars, score) {
      var got = [];
      var prev = data.stars[levelIdx] || 0;
      if (stars > prev) data.stars[levelIdx] = stars;
      if (score > (data.best[levelIdx] || 0)) data.best[levelIdx] = score;
      if (stars >= 3) {
        data.streak++;
        var b = (data.streak - 1) % 3;
        data.boost[b] = Math.min(99, data.boost[b] + 1);
        got.push(b);
        if (data.streak % 3 === 0) { // full three-in-a-row: one extra, your pick of the cycle
          var b2 = (data.streak / 3) % 3 | 0;
          data.boost[b2] = Math.min(99, data.boost[b2] + 1);
          got.push(b2);
        }
      } else {
        data.streak = 0;
      }
      save();
      return got;
    },
    streak: function () { return data.streak; },
    soundOn: function () { return !!data.sound; },
    setSound: function (v) { data.sound = v ? 1 : 0; save(); },
    markSeen: function () { data.seen = 1; save(); },
    hasSeen: function () { return !!data.seen; }
  };

  root.PP.meta = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
