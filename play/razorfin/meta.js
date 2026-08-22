/* Razorfin meta.js (Lane C) - RF.Meta + RF.DevMode.
   Owns: save schema v1, validation + forward migration, economy (xp/levels/
   buying/upgrades), end-of-run settlement, and the two out-of-run Phaser
   scenes (Shop, Results). Registers NO window/document listeners and uses no
   setTimeout/setInterval. Scene classes are handed to game.js on
   RF.Meta.scenes; this file never boots Phaser.

   Save shape (SAVE_VERSION = 1):
     { v:1, coins, xp, level, selected,
       sharks:{ [id]: { owned:bool, up:{bite,speed,boost,power} } },
       best:{ score, biggestTier }, runs, tutorialDone, lastBonusDay }

   Dev overlay law: RF.DevMode.state is NEVER persisted. ownedFor() may report
   true for a shark the profile does not own (forceUnlockAll), but buy() refuses
   to charge for it, select() refuses to write owned:true, and a dev-only pick
   lives on the non-persisted RF.Meta.sessionSelected instead of profile.selected.
   Dev coins are the same idea: sessionCoins is an additive display overlay that
   is spent FIRST, so a dev purchase drains the overlay before it ever touches
   persisted coins. Once the overlay is exhausted, further spending is real. */
var RF = window.RF = window.RF || {};
(function () {
  'use strict';

  var RFD = window.RFD;
  var SAVE_VERSION = 1;
  var UP_TRACKS = ['bite', 'speed', 'boost', 'power'];
  var COIN_CAP = 1e12;
  var XP_CAP = 1e12;
  var RUNS_CAP = 1e9;
  var SCORE_CAP = 1e12;

  function ECON() { return (RFD && RFD.ECONOMY) || {}; }
  function levelCap() { var n = ECON().levelCap; return isInt(n) && n > 0 ? n : 60; }
  function upLevels() {
    var u = ECON().upgradeCosts;
    return u && isInt(u.levels) && u.levels > 0 ? u.levels : 5;
  }
  function sharkById(id) {
    return (RFD && RFD.SHARK_BY_ID && Object.prototype.hasOwnProperty.call(RFD.SHARK_BY_ID, id))
      ? RFD.SHARK_BY_ID[id] : null;
  }
  function allSharks() { return (RFD && RFD.SHARKS) || []; }

  function isInt(v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v; }
  function counter(v, max) { return isInt(v) && v >= 0 && v <= max; }
  function isPlainObj(o) {
    return !!o && typeof o === 'object' && !Array.isArray(o);
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // RF-SAVE-VAL-01: lastBonusDay is compared for inequality against
  // localDayString(), so any non-date junk stays permanently unequal and hands
  // out the daily bonus on every run. Only a real YYYY-MM-DD calendar day is a
  // legal value; anything else is repaired to null (see repairDayField) rather
  // than sinking the whole profile.
  function isDayString(v) {
    if (typeof v !== 'string' || v.length !== 10) return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    var y = +v.slice(0, 4), m = +v.slice(5, 7), d = +v.slice(8, 10);
    if (y < 1970 || y > 9999) return false;
    if (m < 1 || m > 12) return false;
    if (d < 1 || d > 31) return false;
    // reject impossible calendar days (2026-02-31, 2026-04-31, ...)
    var dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
  }

  // Null out a malformed lastBonusDay in place. Losing the marker at worst
  // grants one extra daily bonus; keeping the junk grants one every run.
  function repairDayField(p) {
    if (!isPlainObj(p)) return p;
    if (p.lastBonusDay == null) { p.lastBonusDay = null; return p; }
    if (!isDayString(p.lastBonusDay)) p.lastBonusDay = null;
    return p;
  }

  // -------------------------------------------------------------- profile
  function defaultProfile() {
    var p = {
      v: SAVE_VERSION,
      coins: 0,
      xp: 0,
      level: 1,
      selected: 'reef',
      sharks: {},
      best: { score: 0, biggestTier: 0 },
      runs: 0,
      tutorialDone: false,
      lastBonusDay: null
    };
    p.sharks.reef = { owned: true, up: { bite: 0, speed: 0, boost: 0, power: 0 } };
    return p;
  }

  function blankUp() { return { bite: 0, speed: 0, boost: 0, power: 0 }; }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // ------------------------------------------------------------ validate
  // Strict. Anything outside the schema rejects the whole record and the
  // caller falls back to a fresh profile. Booleans are the only coerced
  // fields, and only where an older writer could plausibly have stored 0/1.
  function validateSave(obj) {
    if (!isPlainObj(obj)) return false;
    if (obj.v !== SAVE_VERSION) return false;
    if (!counter(obj.coins, COIN_CAP)) return false;
    if (!counter(obj.xp, XP_CAP)) return false;
    if (!isInt(obj.level) || obj.level < 1 || obj.level > levelCap()) return false;
    if (!counter(obj.runs, RUNS_CAP)) return false;
    if (typeof obj.selected !== 'string' || !sharkById(obj.selected)) return false;
    if (!isPlainObj(obj.sharks)) return false;
    if (!isPlainObj(obj.best)) return false;
    if (!counter(obj.best.score, SCORE_CAP)) return false;
    if (!counter(obj.best.biggestTier, 12)) return false;
    if (obj.lastBonusDay != null && !isDayString(obj.lastBonusDay)) return false;
    if (typeof obj.tutorialDone !== 'boolean') {
      if (obj.tutorialDone !== 0 && obj.tutorialDone !== 1) return false;
    }

    var maxUp = upLevels();
    var keys = Object.getOwnPropertyNames(obj.sharks);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (!sharkById(k)) return false;
      var row = obj.sharks[k];
      if (!isPlainObj(row)) return false;
      if (typeof row.owned !== 'boolean') {
        if (row.owned !== 0 && row.owned !== 1) return false;
      }
      if (!isPlainObj(row.up)) return false;
      var upKeys = Object.getOwnPropertyNames(row.up);
      for (var j = 0; j < upKeys.length; j++) {
        if (UP_TRACKS.indexOf(upKeys[j]) < 0) return false;
      }
      for (var t = 0; t < UP_TRACKS.length; t++) {
        var lv = row.up[UP_TRACKS[t]];
        if (lv == null) continue;
        if (!isInt(lv) || lv < 0 || lv > maxUp) return false;
      }
      // Upgrades on a shark that is not owned are not a legal record.
      if (!row.owned) {
        for (var t2 = 0; t2 < UP_TRACKS.length; t2++) {
          if (row.up[UP_TRACKS[t2]] > 0) return false;
        }
      }
    }
    // selected must be owned by the PERSISTED profile (dev picks never land here)
    var sel = obj.sharks[obj.selected];
    if (!sel || !sel.owned) return false;
    return true;
  }

  // Coerce the two boolean-ish fields and backfill missing up tracks. Only
  // ever called on a record that already passed validateSave.
  function normalize(p) {
    p.tutorialDone = !!p.tutorialDone;
    var keys = Object.getOwnPropertyNames(p.sharks);
    for (var i = 0; i < keys.length; i++) {
      var row = p.sharks[keys[i]];
      row.owned = !!row.owned;
      for (var t = 0; t < UP_TRACKS.length; t++) {
        if (!isInt(row.up[UP_TRACKS[t]])) row.up[UP_TRACKS[t]] = 0;
      }
    }
    if (p.lastBonusDay === undefined) p.lastBonusDay = null;
    return p;
  }

  // ------------------------------------------------------------- migrate
  // Forward chain, horde-meridian pattern: each step upgrades exactly one
  // version and falls through to the next. A record with no version marker is
  // a pre-release write; rebuild a default and carry coins/xp only if they are
  // plausible counters. Anything with an unrecognised version is discarded.
  function migrate(obj) {
    if (!isPlainObj(obj)) return null;
    var p = obj;
    if (p.v == null) {
      var rebuilt = defaultProfile();
      if (counter(p.coins, COIN_CAP)) rebuilt.coins = p.coins;
      if (counter(p.xp, XP_CAP)) rebuilt.xp = p.xp;
      rebuilt.level = levelForXp(rebuilt.xp).level;
      if (typeof p.tutorialDone === 'boolean') rebuilt.tutorialDone = p.tutorialDone;
      if (counter(p.runs, RUNS_CAP)) rebuilt.runs = p.runs;
      p = rebuilt;
    }
    // Future steps chain here:
    //   if (p.v === 1) { ...upgrade to 2...; p.v = 2; }
    if (p.v !== SAVE_VERSION) return null;
    // RF-SAVE-VAL-01: repair-not-reject. A junk daily-bonus marker is a
    // single recoverable field, so scrub it here and let the rest of the
    // strict schema check stand unchanged.
    repairDayField(p);
    return p;
  }

  // ---------------------------------------------------------- load/commit
  function load(kit) {
    var raw = null;
    try { raw = kit && kit.save ? kit.save.get(null) : null; } catch (e) { raw = null; }
    if (raw == null) return defaultProfile();
    var migrated = null;
    try { migrated = migrate(raw); } catch (e) { migrated = null; }
    if (!migrated) return defaultProfile();
    if (!validateSave(migrated)) return defaultProfile();
    return normalize(migrated);
  }

  function commit(kit, profile) {
    if (!kit || !kit.save || !isPlainObj(profile)) return false;
    // Never let a session-only pick or overlay coin leak into storage.
    var out = clone(profile);
    out.v = SAVE_VERSION;
    if (!validateSave(out)) return false;
    try { kit.save.set(out); } catch (e) { return false; }
    return true;
  }

  // ------------------------------------------------------------- economy
  // xpForLevel(n) is the CUMULATIVE xp required to have reached level n.
  // Level 1 costs nothing; each subsequent level costs base*growth^(n-2)
  // beyond the previous, so the total to reach n is the geometric sum.
  function xpStep(n) {
    var c = ECON().xpCurve || { base: 100, growth: 1.13 };
    var base = isFinite(c.base) ? c.base : 100;
    var growth = isFinite(c.growth) ? c.growth : 1.13;
    return Math.round(base * Math.pow(growth, n - 1));
  }

  function xpForLevel(n) {
    if (!isFinite(n) || n <= 1) return 0;
    var total = 0;
    var cap = levelCap();
    var top = Math.min(Math.floor(n), cap);
    for (var i = 1; i < top; i++) total += xpStep(i);
    return total;
  }

  // -> { level, into, need } where into/need describe progress inside `level`
  function levelForXp(xp) {
    var cap = levelCap();
    var lv = 1;
    var spent = 0;
    while (lv < cap) {
      var step = xpStep(lv);
      if (xp - spent < step) break;
      spent += step;
      lv++;
    }
    var need = lv >= cap ? 0 : xpStep(lv);
    return { level: lv, into: xp - spent, need: need };
  }

  function addXp(profile, amount) {
    var before = profile.level;
    var add = isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;
    profile.xp = clamp(profile.xp + add, 0, XP_CAP);
    var res = levelForXp(profile.xp);
    profile.level = res.level;
    return { levelUps: Math.max(0, profile.level - before), level: profile.level, xp: profile.xp };
  }

  function tierUnlockLevel(tier) {
    var arr = ECON().tierUnlockLevel || [];
    var v = arr[tier];
    return isInt(v) ? v : 0;
  }

  function tierUnlocked(profile, tier) {
    if (!profile) return false;
    if (DevMode.state.forceUnlockAll) return true;
    return profile.level >= tierUnlockLevel(tier);
  }

  // Cost of taking `track` from level lvl to lvl+1 on a shark of `tier`.
  function upgradeCost(tier, lvl) {
    var u = ECON().upgradeCosts || {};
    var base = isFinite(u.base) ? u.base : 400;
    var growth = isFinite(u.growth) ? u.growth : 1.7;
    var tierMult = isFinite(u.tierMult) ? u.tierMult : 0.6;
    return Math.round(base * Math.pow(growth, lvl) * (1 + tier * tierMult));
  }

  function rowFor(profile, id) {
    if (!profile || !profile.sharks) return null;
    return Object.prototype.hasOwnProperty.call(profile.sharks, id) ? profile.sharks[id] : null;
  }

  function ownedFor(profile, id) {
    var row = rowFor(profile, id);
    if (row && row.owned) return true;
    return !!DevMode.state.forceUnlockAll && !!sharkById(id);
  }

  // True only for the persisted record, ignoring any dev overlay.
  function reallyOwned(profile, id) {
    var row = rowFor(profile, id);
    return !!(row && row.owned);
  }

  function upLevel(profile, id, track) {
    var row = rowFor(profile, id);
    if (!row || !row.up) return 0;
    var v = row.up[track];
    return isInt(v) ? v : 0;
  }

  // Coins the player SEES: persisted coins plus the non-persisted dev overlay.
  function displayCoins(profile) {
    return (profile ? profile.coins : 0) + DevMode.state.sessionCoins;
  }

  // Spend overlay first, then real coins. Returns false without mutating if
  // the combined balance cannot cover the cost.
  function spend(profile, cost) {
    if (displayCoins(profile) < cost) return false;
    var fromOverlay = Math.min(DevMode.state.sessionCoins, cost);
    DevMode.state.sessionCoins -= fromOverlay;
    profile.coins -= (cost - fromOverlay);
    return true;
  }

  // req is { shark:id } or { upgrade:{ id, track } }
  function canBuy(profile, req) {
    if (!isPlainObj(profile) || !isPlainObj(req)) return { ok: false, reason: 'bad-request' };

    if (req.shark != null) {
      var def = sharkById(req.shark);
      if (!def) return { ok: false, reason: 'unknown-shark' };
      // A dev-unlocked shark is not for sale. Rebuying it would write
      // owned:true from an overlay, which the dev law forbids.
      if (reallyOwned(profile, req.shark)) return { ok: false, reason: 'owned' };
      if (DevMode.state.forceUnlockAll) return { ok: false, reason: 'dev-unlocked' };
      if (!tierUnlocked(profile, def.tier)) {
        return { ok: false, reason: 'locked', needLevel: tierUnlockLevel(def.tier) };
      }
      var cost = isFinite(def.cost) ? def.cost : 0;
      if (displayCoins(profile) < cost) return { ok: false, reason: 'coins', cost: cost };
      return { ok: true, cost: cost };
    }

    if (isPlainObj(req.upgrade)) {
      var id = req.upgrade.id, track = req.upgrade.track;
      var sdef = sharkById(id);
      if (!sdef) return { ok: false, reason: 'unknown-shark' };
      if (UP_TRACKS.indexOf(track) < 0) return { ok: false, reason: 'unknown-track' };
      if (!reallyOwned(profile, id)) return { ok: false, reason: 'not-owned' };
      var lvl = upLevel(profile, id, track);
      if (lvl >= upLevels()) return { ok: false, reason: 'maxed' };
      var ucost = upgradeCost(sdef.tier, lvl);
      if (displayCoins(profile) < ucost) return { ok: false, reason: 'coins', cost: ucost };
      return { ok: true, cost: ucost };
    }

    return { ok: false, reason: 'bad-request' };
  }

  function buy(profile, req) {
    var check = canBuy(profile, req);
    if (!check.ok) return check;

    if (req.shark != null) {
      if (!spend(profile, check.cost)) return { ok: false, reason: 'coins', cost: check.cost };
      profile.sharks[req.shark] = { owned: true, up: blankUp() };
      return { ok: true, cost: check.cost, shark: req.shark };
    }

    var id = req.upgrade.id, track = req.upgrade.track;
    if (!spend(profile, check.cost)) return { ok: false, reason: 'coins', cost: check.cost };
    var row = profile.sharks[id];
    if (!row.up) row.up = blankUp();
    row.up[track] = upLevel(profile, id, track) + 1;
    return { ok: true, cost: check.cost, upgrade: { id: id, track: track, level: row.up[track] } };
  }

  // select(): a dev-only pick lives on sessionSelected and is NEVER written to
  // profile.selected, so the persisted record stays honest.
  function select(profile, id) {
    if (!sharkById(id)) return { ok: false, reason: 'unknown-shark' };
    if (reallyOwned(profile, id)) {
      profile.selected = id;
      Meta.sessionSelected = null;
      return { ok: true, persisted: true, id: id };
    }
    if (ownedFor(profile, id)) {
      Meta.sessionSelected = id;
      return { ok: true, persisted: false, id: id };
    }
    return { ok: false, reason: 'not-owned' };
  }

  // The shark the RUN should use: the session (dev) pick wins, else profile.
  function activeShark(profile) {
    if (Meta.sessionSelected && ownedFor(profile, Meta.sessionSelected)) return Meta.sessionSelected;
    return profile ? profile.selected : 'reef';
  }

  // ------------------------------------------------------------- end run
  function localDayString(d) {
    var dt = d || new Date();
    var m = dt.getMonth() + 1, day = dt.getDate();
    return dt.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  // Which sharks/tiers became reachable crossing from oldLevel to newLevel.
  function unlockCallouts(profile, oldLevel, newLevel) {
    var out = [];
    if (newLevel <= oldLevel) return out;
    var arr = ECON().tierUnlockLevel || [];
    for (var tier = 1; tier < arr.length; tier++) {
      var need = arr[tier];
      if (!isInt(need)) continue;
      if (need > oldLevel && need <= newLevel) {
        var names = [];
        var list = allSharks();
        for (var i = 0; i < list.length; i++) {
          if (list[i].tier === tier) names.push(list[i].name);
        }
        out.push({ tier: tier, level: need, count: names.length, names: names.slice(0, 3) });
      }
    }
    return out;
  }

  // RF-BEST-01 seam. Preference order: an explicit peak tracked by game.js,
  // then an explicit bestCombo, then the live counter. Whichever fields exist
  // are maxed together so no source of a higher observed combo is dropped.
  function comboPeakOf(run) {
    var best = 0, i;
    var fields = ['comboPeak', 'bestCombo', 'combo'];
    for (i = 0; i < fields.length; i++) {
      var v = run ? run[fields[i]] : null;
      if (typeof v !== 'number' || !isFinite(v)) continue;
      var n = Math.max(0, Math.floor(v));
      if (n > best) best = n;
    }
    return best;
  }

  function endRun(ctx) {
    var kit = ctx && ctx.kit;
    var profile = (ctx && ctx.save) || defaultProfile();
    var run = (ctx && ctx.run) || {};
    var econ = ECON();

    var rawCoins = isFinite(run.coins) ? Math.max(0, Math.floor(run.coins)) : 0;
    var rawXp = isFinite(run.xp) ? Math.max(0, Math.floor(run.xp)) : 0;
    var score = isFinite(run.score) ? Math.max(0, Math.floor(run.score)) : 0;
    var biggest = isInt(run.biggestTier) ? clamp(run.biggestTier, 0, 12) : 0;
    // RF-BEST-01: report the PEAK combo of the run, never the value left on
    // the counter at death (a late hit resets run.combo to 0). game.js owns
    // the live counter at game.js:978/1039/1064; the preferred seam is for it
    // to track ctx.run.comboPeak alongside it. Read that first, accept an
    // explicit run.bestCombo second, and only then fall back to the final
    // counter -- and when falling back, take the max of every combo-ish field
    // present so a still-running combo is not undercounted.
    var bestCombo = comboPeakOf(run);

    var coinMult = isFinite(econ.coinRunMult) ? econ.coinRunMult : 1;
    var xpMult = isFinite(econ.xpRunMult) ? econ.xpRunMult : 1;
    var bonusMult = isFinite(econ.dailyBonusMult) ? econ.dailyBonusMult : 1.5;

    var today = localDayString();
    var dailyApplied = profile.lastBonusDay !== today;
    var coinsEarned = Math.floor(rawCoins * coinMult * (dailyApplied ? bonusMult : 1));
    var bonusCoins = dailyApplied ? coinsEarned - Math.floor(rawCoins * coinMult) : 0;
    if (dailyApplied) profile.lastBonusDay = today;

    var oldLevel = profile.level;
    var prevBestScore = counter(profile.best && profile.best.score, SCORE_CAP)
      ? profile.best.score : 0;
    profile.coins = clamp(profile.coins + coinsEarned, 0, COIN_CAP);
    var xpRes = addXp(profile, Math.floor(rawXp * xpMult));

    if (score > profile.best.score) profile.best.score = Math.min(score, SCORE_CAP);
    if (biggest > profile.best.biggestTier) profile.best.biggestTier = biggest;
    profile.runs = clamp(profile.runs + 1, 0, RUNS_CAP);

    var unlocks = unlockCallouts(profile, oldLevel, profile.level);
    var lv = levelForXp(profile.xp);

    if (kit) commit(kit, profile);

    return {
      score: score,
      coins: coinsEarned,
      baseCoins: Math.floor(rawCoins * coinMult),
      bonusCoins: bonusCoins,
      dailyBonus: dailyApplied,
      dailyBonusMult: bonusMult,
      xp: Math.floor(rawXp * xpMult),
      levelUps: xpRes.levelUps,
      level: profile.level,
      xpInto: lv.into,
      xpNeed: lv.need,
      unlocks: unlocks,
      best: { score: profile.best.score, biggestTier: profile.best.biggestTier },
      biggestTier: biggest,
      bestCombo: bestCombo,
      // RF-BEST-01: a tie is not a new best. prevBestScore is captured before
      // profile.best.score is raised above, so this is a strict improvement.
      newBest: score > prevBestScore && score > 0
    };
  }

  // ------------------------------------------------------------- DevMode
  var DevMode = {
    state: {
      active: false,
      forceUnlockAll: false,
      forceInvincible: false,
      forceSkipTutorial: false,
      sessionCoins: 0,
      forceGoldRush: false,   // one-shot flag; consumer clears it
      forcePower: '',         // ability id to grant/fire
      forceZone: 0            // 1..4, 0 = off
    },
    switches: {},
    inited: false
  };

  DevMode.init = function () {
    if (DevMode.inited) return DevMode.state;
    DevMode.inited = true;
    var q = null;
    try { q = new URLSearchParams(window.location.search); } catch (e) { q = null; }
    if (q) {
      try {
        var on = function (k) { var v = q.get(k); return v === '' || v === '1' || v === 'true'; };
        if (q.has('unlockall') && on('unlockall')) { DevMode.state.forceUnlockAll = true; DevMode.switches.unlockall = true; }
        if (q.has('invincible') && on('invincible')) { DevMode.state.forceInvincible = true; DevMode.switches.invincible = true; }
        if (q.has('notut') && on('notut')) { DevMode.state.forceSkipTutorial = true; DevMode.switches.notut = true; }
        if (q.has('coins')) {
          var n = parseInt(q.get('coins'), 10);
          DevMode.state.sessionCoins = isFinite(n) && n > 0 ? Math.min(n, 1e9) : 50000;
          DevMode.switches.coins = DevMode.state.sessionCoins;
        }
        if (q.has('zone')) {
          var z = parseInt(q.get('zone'), 10);
          if (isFinite(z) && z >= 1 && z <= 4) { DevMode.state.forceZone = z; DevMode.switches.zone = z; }
        }
      } catch (e) { /* a malformed query string must never block boot */ }
    }
    // Dev switches must survive a PWA relaunch (start_url drops the query) for
    // the TAB session only. sessionStorage, never localStorage or kit.save:
    // dev unlocks are never persisted. ?dev=0 clears the mirror.
    try {
      if (q && q.has('dev') && q.get('dev') === '0') {
        sessionStorage.removeItem('rfDevSession');
        DevMode.switches = {};
        DevMode.state.forceUnlockAll = false;
        DevMode.state.forceInvincible = false;
        DevMode.state.forceSkipTutorial = false;
        DevMode.state.sessionCoins = 0;
        DevMode.state.forceZone = 0;
      } else if (Object.keys(DevMode.switches).length) {
        sessionStorage.setItem('rfDevSession', JSON.stringify(DevMode.switches));
      } else {
        var saved = JSON.parse(sessionStorage.getItem('rfDevSession') || 'null');
        if (saved && typeof saved === 'object') {
          if (saved.unlockall === true) { DevMode.state.forceUnlockAll = true; DevMode.switches.unlockall = true; }
          if (saved.invincible === true) { DevMode.state.forceInvincible = true; DevMode.switches.invincible = true; }
          if (saved.notut === true) { DevMode.state.forceSkipTutorial = true; DevMode.switches.notut = true; }
          var sc = parseInt(saved.coins, 10);
          if (isFinite(sc) && sc > 0) { DevMode.state.sessionCoins = Math.min(sc, 1e9); DevMode.switches.coins = DevMode.state.sessionCoins; }
          var sz = parseInt(saved.zone, 10);
          if (isFinite(sz) && sz >= 1 && sz <= 4) { DevMode.state.forceZone = sz; DevMode.switches.zone = sz; }
        }
      }
    } catch (e) { /* sessionStorage may be absent (node selftest, private Safari) */ }
    DevMode.state.active = !!(DevMode.state.forceUnlockAll || DevMode.state.forceInvincible ||
      DevMode.state.forceSkipTutorial || DevMode.state.sessionCoins > 0 || DevMode.state.forceZone);

    window.__rf = {
      version: 1,
      state: DevMode.state,
      switches: DevMode.switches,
      unlockAll: function () { DevMode.state.forceUnlockAll = true; DevMode.state.active = true; return true; },
      clearDev: function () {
        try { sessionStorage.removeItem('rfDevSession'); } catch (e) {}
        // Empty the switches object IN PLACE: window.__rf.switches holds a
        // reference to it, so reassignment would leave a stale live view.
        for (var k in DevMode.switches) {
          if (Object.prototype.hasOwnProperty.call(DevMode.switches, k)) delete DevMode.switches[k];
        }
        DevMode.state.forceUnlockAll = false;
        DevMode.state.forceInvincible = false;
        DevMode.state.forceSkipTutorial = false;
        DevMode.state.sessionCoins = 0;
        DevMode.state.forceZone = 0;
        DevMode.state.forceGoldRush = false;
        DevMode.state.forcePower = '';
        DevMode.state.active = false;
        return true;
      },
      resetSave: function () {
        var kit = RF.ctx && RF.ctx.kit;
        try { if (kit && kit.save) kit.save.clear(); } catch (e) {}
        if (RF.ctx) RF.ctx.save = defaultProfile();
        Meta.sessionSelected = null;
        try { window.location.reload(); } catch (e) {}
        return true;
      },
      giveCoins: function (n) {
        var v = parseInt(n, 10);
        DevMode.state.sessionCoins += (isFinite(v) ? v : 50000);
        if (DevMode.state.sessionCoins < 0) DevMode.state.sessionCoins = 0;
        DevMode.state.active = true;
        return DevMode.state.sessionCoins;
      },
      forceGoldRush: function () { DevMode.state.forceGoldRush = true; DevMode.state.active = true; return true; },
      forcePower: function (id) { DevMode.state.forcePower = String(id || ''); DevMode.state.active = true; return DevMode.state.forcePower; },
      forceZone: function (n) {
        var v = parseInt(n, 10);
        DevMode.state.forceZone = (isFinite(v) && v >= 1 && v <= 4) ? v : 0;
        DevMode.state.active = true;
        return DevMode.state.forceZone;
      }
    };
    return DevMode.state;
  };

  // ---------------------------------------------------------------- UI kit
  // Shared look for the two out-of-run scenes. Dark water, high contrast,
  // touch targets at or above 44px CSS.
  var UI = {
    bg: 0x02101c,
    panel: 0x0a2233,
    panelHi: 0x123449,
    line: 0x1f5570,
    text: '#e8f5f4',
    dim: '#8fb4c4',
    gold: '#ffd67a',
    good: '#7fe3b0',
    bad: '#ff8b7a',
    font: 'Avenir Next, Trebuchet MS, system-ui, sans-serif',
    TAP: 44
  };

  function actName(act) {
    return act === 1 ? 'Real Sharks' : act === 2 ? 'Monsters' : 'Legends';
  }

  function paletteOf(def) {
    // Cross-namespace guard: Lane D may not be loaded in a headless or
    // partial boot, so fall back to the silhouette palette in data.js.
    try {
      if (RF.Art && typeof RF.Art.paletteOf === 'function') {
        var p = RF.Art.paletteOf(def);
        if (p && isFinite(p.base)) return p;
      }
    } catch (e) { /* fall through */ }
    var sp = (def && def.sil && def.sil.palette) || {};
    return {
      base: isFinite(sp.base) ? sp.base : 0x4a8fb0,
      belly: isFinite(sp.belly) ? sp.belly : 0xdfeef2,
      accent: isFinite(sp.accent) ? sp.accent : 0x2b5f78,
      glow: isFinite(sp.glow) ? sp.glow : 0
    };
  }

  function fmt(n) {
    var v = Math.floor(isFinite(n) ? n : 0);
    var s = String(Math.abs(v)), out = '';
    while (s.length > 3) { out = ',' + s.slice(-3) + out; s = s.slice(0, -3); }
    return (v < 0 ? '-' : '') + s + out;
  }

  // Normalized stat bars. Denominators come from the roster so the bars stay
  // meaningful if data.js is regenerated with different numbers.
  var STAT_MAX = null;
  function statMax() {
    if (STAT_MAX) return STAT_MAX;
    var m = { speed: 1, bite: 1, hp: 1 };
    var list = allSharks();
    for (var i = 0; i < list.length; i++) {
      var s = list[i].stats || {};
      if (s.speed > m.speed) m.speed = s.speed;
      if (s.bite > m.bite) m.bite = s.bite;
      if (s.hp > m.hp) m.hp = s.hp;
    }
    STAT_MAX = m;
    return m;
  }

  function chipText(def) {
    var chips = [];
    var ps = def.passives || [];
    for (var i = 0; i < ps.length && i < 3; i++) chips.push(ps[i]);
    if (def.active && RFD.ABILITIES && RFD.ABILITIES[def.active]) chips.push(RFD.ABILITIES[def.active].name);
    else if (def.active) chips.push(def.active);
    return chips;
  }

  // ----------------------------------------------------------- Shop scene
  function buildScenes() {
    if (typeof Phaser === 'undefined' || !Phaser.Scene) return null;

    var ShopScene = new Phaser.Class({
      Extends: Phaser.Scene,
      initialize: function ShopScene() { Phaser.Scene.call(this, { key: 'Shop' }); },

      init: function (data) {
        this.ctx = (data && data.ctx) || RF.ctx || null;
        this.retTo = (data && data.returnTo) || 'Menu';
        this.scrollY = 0;
        this.maxScroll = 0;
        this.dragFrom = null;
        this.dragStartScroll = 0;
        this.dragged = false;
        this.unsubs = [];
      },

      profile: function () {
        return (this.ctx && this.ctx.save) || (this._fallback || (this._fallback = defaultProfile()));
      },

      create: function () {
        var self = this;
        var W = this.scale.width, H = this.scale.height;
        this.add.rectangle(W / 2, H / 2, W, H, UI.bg).setDepth(-10);
        // Subtle depth banding so the shop still reads as ocean.
        for (var b = 0; b < 4; b++) {
          this.add.rectangle(W / 2, H * (b + 0.5) / 4, W, H / 4, 0x06192b, 0.35 - b * 0.06).setDepth(-9);
        }

        this.headerH = 52;
        this.footerH = 92;
        this.listTop = this.headerH;
        this.listH = H - this.headerH - this.footerH;

        this.listCam = this.cameras.add(0, this.listTop, W, this.listH);
        this.listCam.setScroll(0, this.listTop);

        this.listRoot = this.add.container(0, 0);
        this.chromeRoot = this.add.container(0, 0);

        this.buildChrome(W, H);
        this.buildList(W);

        // Cameras: main renders chrome only, list camera renders the list only.
        this.cameras.main.ignore(this.listRoot);
        this.listCam.ignore(this.chromeRoot);

        this.bindInput();
        this.refresh();

        this.events.once('shutdown', function () {
          for (var i = 0; i < self.unsubs.length; i++) { try { self.unsubs[i](); } catch (e) {} }
          self.unsubs.length = 0;
        });
      },

      // Input: kit subscriptions where available (fleet law), Phaser input as
      // the in-scene fallback. Both paths feed the same handlers.
      bindInput: function () {
        var self = this;
        // Before the first run RF.ctx is null; RF.Game.kit is a live getter
        // from boot, so the kit path works on a fresh boot too (RF-INPUT-01).
        var kit = (this.ctx && this.ctx.kit) || (RF.Game && RF.Game.kit) || null;
        var used = false;
        if (kit && kit.input && typeof kit.input.onDown === 'function') {
          used = true;
          this.unsubs.push(kit.input.onDown(function (p) { self.onDown(p.x, p.y); }));
          this.unsubs.push(kit.input.onMove(function (p) { self.onMove(p.x, p.y); }));
          this.unsubs.push(kit.input.onUp(function (p) { self.onUp(p.x, p.y); }));
        }
        if (!used) {
          this.input.on('pointerdown', function (p) { self.onDown(p.x, p.y); });
          this.input.on('pointermove', function (p) { self.onMove(p.x, p.y); });
          this.input.on('pointerup', function (p) { self.onUp(p.x, p.y); });
        }
      },

      onDown: function (x, y) {
        this.dragFrom = { x: x, y: y };
        this.dragStartScroll = this.scrollY;
        this.dragged = false;
      },

      onMove: function (x, y) {
        if (!this.dragFrom) return;
        var dy = y - this.dragFrom.y;
        if (Math.abs(dy) > 6) this.dragged = true;
        if (y >= this.listTop && y <= this.listTop + this.listH) {
          this.scrollY = clamp(this.dragStartScroll - dy, 0, this.maxScroll);
          this.listCam.setScroll(0, this.listTop + this.scrollY);
        }
      },

      onUp: function (x, y) {
        var wasDrag = this.dragged;
        this.dragFrom = null;
        this.dragged = false;
        if (wasDrag) return;
        this.hitTest(x, y);
      },

      // Rectangles are registered flat; list hits are offset by scroll.
      hitTest: function (x, y) {
        var i, h;
        for (i = 0; i < this.chromeHits.length; i++) {
          h = this.chromeHits[i];
          if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) { h.fn(); return; }
        }
        if (y < this.listTop || y > this.listTop + this.listH) return;
        var ly = y - this.listTop + this.scrollY;
        for (i = 0; i < this.listHits.length; i++) {
          h = this.listHits[i];
          if (x >= h.x && x <= h.x + h.w && ly >= h.y && ly <= h.y + h.h) { h.fn(); return; }
        }
      },

      buildChrome: function (W, H) {
        var self = this;
        this.chromeHits = [];
        var c = this.chromeRoot;

        c.add(this.add.rectangle(W / 2, this.headerH / 2, W, this.headerH, UI.panel).setStrokeStyle(1, UI.line));
        c.add(this.add.text(14, this.headerH / 2, 'SHOP', {
          fontFamily: UI.font, fontSize: '20px', color: UI.text, fontStyle: 'bold'
        }).setOrigin(0, 0.5));

        this.coinLabel = this.add.text(W - 14, this.headerH / 2, '', {
          fontFamily: UI.font, fontSize: '18px', color: UI.gold, fontStyle: 'bold'
        }).setOrigin(1, 0.5);
        c.add(this.coinLabel);

        this.lvlLabel = this.add.text(W / 2, this.headerH / 2, '', {
          fontFamily: UI.font, fontSize: '15px', color: UI.dim
        }).setOrigin(0.5, 0.5);
        c.add(this.lvlLabel);

        // Footer: upgrade panel for the selected shark + back button.
        var fy = H - this.footerH;
        c.add(this.add.rectangle(W / 2, fy + this.footerH / 2, W, this.footerH, UI.panel).setStrokeStyle(1, UI.line));

        this.upTitle = this.add.text(14, fy + 14, '', {
          fontFamily: UI.font, fontSize: '14px', color: UI.text, fontStyle: 'bold'
        }).setOrigin(0, 0);
        c.add(this.upTitle);

        this.upWidgets = [];
        var colW = Math.max(96, Math.floor((W - 150) / 4));
        for (var t = 0; t < UP_TRACKS.length; t++) {
          (function (ti) {
            var track = UP_TRACKS[ti];
            var bx = 14 + ti * colW;
            var by = fy + 36;
            var lbl = self.add.text(bx, by, track.toUpperCase(), {
              fontFamily: UI.font, fontSize: '11px', color: UI.dim
            }).setOrigin(0, 0);
            c.add(lbl);
            var pips = [];
            for (var pi = 0; pi < upLevels(); pi++) {
              var pip = self.add.rectangle(bx + 5 + pi * 13, by + 24, 10, 10, UI.line).setOrigin(0.5);
              c.add(pip);
              pips.push(pip);
            }
            var cost = self.add.text(bx, by + 36, '', {
              fontFamily: UI.font, fontSize: '12px', color: UI.gold
            }).setOrigin(0, 0);
            c.add(cost);
            // Whole column is the tap target, 44px+ tall.
            self.chromeHits.push({
              x: bx - 6, y: by - 6, w: colW - 4, h: 62,
              fn: function () { self.doUpgrade(track); }
            });
            self.upWidgets.push({ track: track, pips: pips, cost: cost, label: lbl });
          }(t));
        }

        var bw = 96, bh = 44;
        var backBg = this.add.rectangle(W - 14 - bw / 2, fy + this.footerH - 12 - bh / 2, bw, bh, UI.panelHi)
          .setStrokeStyle(2, UI.line);
        c.add(backBg);
        var backTx = this.add.text(backBg.x, backBg.y, 'BACK', {
          fontFamily: UI.font, fontSize: '15px', color: UI.text, fontStyle: 'bold'
        }).setOrigin(0.5);
        c.add(backTx);
        this.chromeHits.push({
          x: backBg.x - bw / 2, y: backBg.y - bh / 2, w: bw, h: bh,
          fn: function () { self.leave(); }
        });

        this.toast = this.add.text(W / 2, H - this.footerH - 22, '', {
          fontFamily: UI.font, fontSize: '13px', color: UI.bad, backgroundColor: '#0a2233', padding: { x: 8, y: 4 }
        }).setOrigin(0.5).setAlpha(0);
        c.add(this.toast);
        this.toastT = 0;
      },

      buildList: function (W) {
        var self = this;
        this.listHits = [];
        this.rowViews = [];
        var y = 10;
        var rowH = 78;
        var acts = [1, 2, 3];

        for (var a = 0; a < acts.length; a++) {
          var act = acts[a];
          var list = [];
          var all = allSharks();
          for (var i = 0; i < all.length; i++) if (all[i].act === act) list.push(all[i]);
          list.sort(function (p, q) { return (p.tier - q.tier) || (p.cost - q.cost); });
          if (!list.length) continue;

          var hdr = this.add.text(14, y, actName(act).toUpperCase(), {
            fontFamily: UI.font, fontSize: '15px', color: UI.gold, fontStyle: 'bold'
          }).setOrigin(0, 0);
          this.listRoot.add(hdr);
          this.listRoot.add(this.add.rectangle(W / 2, y + 26, W - 28, 1, UI.line).setOrigin(0.5, 0));
          y += 34;

          for (var j = 0; j < list.length; j++) {
            y = this.buildRow(list[j], y, rowH, W);
          }
          y += 10;
        }
        this.contentH = y;
        this.maxScroll = Math.max(0, y - this.listH);
      },

      buildRow: function (def, y, rowH, W) {
        var self = this;
        var pal = paletteOf(def);
        var root = this.listRoot;
        var bg = this.add.rectangle(W / 2, y + rowH / 2, W - 20, rowH - 6, UI.panel).setStrokeStyle(1, UI.line);
        root.add(bg);

        // Tier badge, tinted with the shark's own palette so rows read apart.
        var badge = this.add.rectangle(30, y + rowH / 2, 34, 34, pal.base).setStrokeStyle(2, pal.accent);
        root.add(badge);
        root.add(this.add.text(30, y + rowH / 2, 'T' + def.tier, {
          fontFamily: UI.font, fontSize: '13px', color: '#02101c', fontStyle: 'bold'
        }).setOrigin(0.5));

        var nameTx = this.add.text(58, y + 12, def.name, {
          fontFamily: UI.font, fontSize: '16px', color: UI.text, fontStyle: 'bold'
        }).setOrigin(0, 0);
        root.add(nameTx);

        // Stat bars: speed / bite / hp normalized against the roster maxima.
        var mx = statMax();
        var bars = [
          ['speed', (def.stats.speed || 0) / mx.speed, 0x7fd4ff],
          ['bite', (def.stats.bite || 0) / mx.bite, 0xff9d7a],
          ['hp', (def.stats.hp || 0) / mx.hp, 0x7fe3b0]
        ];
        var barW = 74;
        for (var b = 0; b < bars.length; b++) {
          var bx = 58, by = y + 36 + b * 9;
          root.add(this.add.rectangle(bx, by, barW, 5, 0x0d2c3f).setOrigin(0, 0.5));
          root.add(this.add.rectangle(bx, by, Math.max(2, barW * clamp(bars[b][1], 0, 1)), 5, bars[b][2]).setOrigin(0, 0.5));
        }

        // Passive/active chips as text.
        var chips = chipText(def);
        var cx = 58 + barW + 10;
        for (var ci = 0; ci < chips.length; ci++) {
          var ct = this.add.text(cx, y + 34 + ci * 15, chips[ci], {
            fontFamily: UI.font, fontSize: '11px', color: UI.dim,
            backgroundColor: '#0d2c3f', padding: { x: 4, y: 1 }
          }).setOrigin(0, 0);
          root.add(ct);
        }

        var stateTx = this.add.text(W - 22, y + 12, '', {
          fontFamily: UI.font, fontSize: '13px', color: UI.dim
        }).setOrigin(1, 0);
        root.add(stateTx);

        var btnW = 96, btnH = 46;
        var btnBg = this.add.rectangle(W - 22 - btnW / 2, y + rowH - 10 - btnH / 2, btnW, btnH, UI.panelHi)
          .setStrokeStyle(2, UI.line);
        root.add(btnBg);
        var btnTx = this.add.text(btnBg.x, btnBg.y, '', {
          fontFamily: UI.font, fontSize: '14px', color: UI.text, fontStyle: 'bold'
        }).setOrigin(0.5);
        root.add(btnTx);

        this.listHits.push({
          x: btnBg.x - btnW / 2, y: btnBg.y - btnH / 2, w: btnW, h: btnH,
          fn: function () { self.onRowButton(def); }
        });

        this.rowViews.push({ def: def, bg: bg, state: stateTx, btnBg: btnBg, btnTx: btnTx, name: nameTx });
        return y + rowH;
      },

      onRowButton: function (def) {
        var p = this.profile();
        if (ownedFor(p, def.id)) {
          var r = select(p, def.id);
          if (r.ok) {
            if (r.persisted && this.ctx && this.ctx.kit) commit(this.ctx.kit, p);
            this.refresh();
          }
          return;
        }
        var res = buy(p, { shark: def.id });
        if (res.ok) {
          select(p, def.id);
          if (this.ctx && this.ctx.kit) commit(this.ctx.kit, p);
          this.refresh();
        } else {
          this.say(res.reason === 'locked' ? ('Reach level ' + res.needLevel)
            : res.reason === 'coins' ? 'Not enough coins'
            : res.reason === 'dev-unlocked' ? 'Dev unlocked, nothing to buy'
            : 'Cannot buy that');
        }
      },

      doUpgrade: function (track) {
        var p = this.profile();
        var id = activeShark(p);
        if (!reallyOwned(p, id)) { this.say('Owned sharks only'); return; }
        var res = buy(p, { upgrade: { id: id, track: track } });
        if (res.ok) {
          if (this.ctx && this.ctx.kit) commit(this.ctx.kit, p);
          this.refresh();
        } else {
          this.say(res.reason === 'maxed' ? 'Already at max' : res.reason === 'coins' ? 'Not enough coins' : 'Cannot upgrade');
        }
      },

      say: function (msg) {
        this.toast.setText(msg).setAlpha(1);
        this.toastT = 1.4;
      },

      refresh: function () {
        var p = this.profile();
        var sel = activeShark(p);
        this.coinLabel.setText(fmt(displayCoins(p)) + ' coins');
        var lv = levelForXp(p.xp);
        this.lvlLabel.setText('Level ' + p.level + (lv.need ? ('   ' + fmt(lv.into) + ' / ' + fmt(lv.need) + ' xp') : '   max level'));

        for (var i = 0; i < this.rowViews.length; i++) {
          var v = this.rowViews[i], def = v.def;
          var owned = ownedFor(p, def.id);
          var unlocked = tierUnlocked(p, def.tier);
          var isSel = (def.id === sel);
          if (owned) {
            v.state.setText(isSel ? 'SELECTED' : 'OWNED').setColor(isSel ? UI.good : UI.dim);
            v.btnTx.setText(isSel ? 'IN USE' : 'SELECT');
            v.btnBg.setFillStyle(isSel ? 0x14503c : UI.panelHi);
          } else if (!unlocked) {
            v.state.setText('LOCKED').setColor(UI.bad);
            v.btnTx.setText('LVL ' + tierUnlockLevel(def.tier));
            v.btnBg.setFillStyle(0x0d2c3f);
          } else {
            v.state.setText(fmt(def.cost) + ' coins').setColor(UI.gold);
            var afford = displayCoins(p) >= def.cost;
            v.btnTx.setText('BUY');
            v.btnBg.setFillStyle(afford ? 0x1d4f6b : 0x0d2c3f);
          }
          v.bg.setFillStyle(isSel ? UI.panelHi : UI.panel);
        }

        var selDef = sharkById(sel);
        this.upTitle.setText('UPGRADES   ' + (selDef ? selDef.name : ''));
        for (var t = 0; t < this.upWidgets.length; t++) {
          var w = this.upWidgets[t];
          var lvl = upLevel(p, sel, w.track);
          for (var pi = 0; pi < w.pips.length; pi++) {
            w.pips[pi].setFillStyle(pi < lvl ? 0x7fe3b0 : UI.line);
          }
          if (!reallyOwned(p, sel)) w.cost.setText('locked').setColor(UI.dim);
          else if (lvl >= upLevels()) w.cost.setText('MAX').setColor(UI.good);
          else w.cost.setText(fmt(upgradeCost(selDef ? selDef.tier : 1, lvl))).setColor(UI.gold);
        }
      },

      update: function (t, dms) {
        if (this.toastT > 0) {
          this.toastT -= dms / 1000;
          if (this.toastT <= 0) { this.toastT = 0; this.toast.setAlpha(0); }
          else this.toast.setAlpha(Math.min(1, this.toastT / 0.4));
        }
      },

      leave: function () {
        this.scene.start(this.retTo, { ctx: this.ctx });
      }
    });

    // -------------------------------------------------------- Results scene
    var ResultsScene = new Phaser.Class({
      Extends: Phaser.Scene,
      initialize: function ResultsScene() { Phaser.Scene.call(this, { key: 'Results' }); },

      init: function (data) {
        this.ctx = (data && data.ctx) || RF.ctx || null;
        this.res = (data && data.results) || null;
        this.unsubs = [];
        this.flourish = 0;
      },

      create: function () {
        var self = this;
        var W = this.scale.width, H = this.scale.height;
        var r = this.res;
        this.add.rectangle(W / 2, H / 2, W, H, UI.bg).setDepth(-10);
        for (var b = 0; b < 4; b++) {
          this.add.rectangle(W / 2, H * (b + 0.5) / 4, W, H / 4, 0x06192b, 0.35 - b * 0.06).setDepth(-9);
        }

        if (!r) {
          // Defensive: a Results start with no payload still renders something
          // usable rather than throwing.
          r = { score: 0, coins: 0, xp: 0, levelUps: 0, unlocks: [], biggestTier: 0,
                bestCombo: 0, best: { score: 0, biggestTier: 0 }, level: 1, xpInto: 0, xpNeed: 1,
                dailyBonus: false, bonusCoins: 0, baseCoins: 0 };
        }

        var left = 24, y = 26;
        this.add.text(left, y, 'RUN COMPLETE', {
          fontFamily: UI.font, fontSize: '15px', color: UI.dim, fontStyle: 'bold'
        }).setOrigin(0, 0);
        y += 22;

        this.add.text(left, y, fmt(r.score), {
          fontFamily: UI.font, fontSize: '46px', color: UI.text, fontStyle: 'bold'
        }).setOrigin(0, 0);
        y += 56;

        if (r.newBest) {
          this.add.text(left, y, 'NEW BEST', {
            fontFamily: UI.font, fontSize: '14px', color: UI.gold, fontStyle: 'bold'
          }).setOrigin(0, 0);
        } else {
          this.add.text(left, y, 'Best ' + fmt(r.best.score), {
            fontFamily: UI.font, fontSize: '14px', color: UI.dim
          }).setOrigin(0, 0);
        }
        y += 24;

        var lines = [
          'Biggest prey tier ' + (r.biggestTier || 0),
          'Best combo x' + (r.bestCombo || 0)
        ];
        for (var i = 0; i < lines.length; i++) {
          this.add.text(left, y, lines[i], { fontFamily: UI.font, fontSize: '14px', color: UI.dim }).setOrigin(0, 0);
          y += 20;
        }
        y += 6;

        this.add.text(left, y, '+' + fmt(r.coins) + ' coins', {
          fontFamily: UI.font, fontSize: '20px', color: UI.gold, fontStyle: 'bold'
        }).setOrigin(0, 0);
        y += 26;
        if (r.dailyBonus && r.bonusCoins > 0) {
          this.add.text(left, y, 'Daily bonus x' + r.dailyBonusMult + ', +' + fmt(r.bonusCoins), {
            fontFamily: UI.font, fontSize: '13px', color: UI.good
          }).setOrigin(0, 0);
          y += 20;
        }

        // XP bar on the right column so the left stays a clean readout.
        var rx = Math.floor(W * 0.56), rw = W - rx - 24;
        var ry = 40;
        this.add.text(rx, ry, 'LEVEL ' + (r.level || 1), {
          fontFamily: UI.font, fontSize: '15px', color: UI.text, fontStyle: 'bold'
        }).setOrigin(0, 0);
        ry += 22;
        this.add.rectangle(rx, ry, rw, 12, 0x0d2c3f).setOrigin(0, 0);
        var frac = r.xpNeed > 0 ? clamp(r.xpInto / r.xpNeed, 0, 1) : 1;
        this.xpFill = this.add.rectangle(rx, ry, Math.max(2, rw * frac), 12, 0x7fd4ff).setOrigin(0, 0);
        ry += 18;
        this.add.text(rx, ry, '+' + fmt(r.xp) + ' xp', {
          fontFamily: UI.font, fontSize: '13px', color: UI.dim
        }).setOrigin(0, 0);
        ry += 20;

        if (r.levelUps > 0) {
          this.levelTx = this.add.text(rx, ry, 'LEVEL UP x' + r.levelUps, {
            fontFamily: UI.font, fontSize: '18px', color: UI.gold, fontStyle: 'bold'
          }).setOrigin(0, 0);
          this.flourish = 1;
          ry += 26;
        }

        var uns = r.unlocks || [];
        for (var u = 0; u < uns.length && u < 3; u++) {
          this.add.text(rx, ry, 'Tier ' + uns[u].tier + ' unlocked, ' + uns[u].count + ' new sharks', {
            fontFamily: UI.font, fontSize: '13px', color: UI.good
          }).setOrigin(0, 0);
          ry += 18;
        }

        // Buttons: 3 across the bottom, 48px tall.
        this.hits = [];
        var btns = [
          ['AGAIN', function () { self.go('Ocean'); }],
          ['SHOP', function () { self.go('Shop'); }],
          ['MENU', function () { self.go('Menu'); }]
        ];
        var bw = Math.min(140, Math.floor((W - 48 - 24) / 3));
        var bh = 48;
        var by = H - 20 - bh;
        for (var k = 0; k < btns.length; k++) {
          var bx = 24 + k * (bw + 12);
          var bg = this.add.rectangle(bx + bw / 2, by + bh / 2, bw, bh, k === 0 ? 0x1d4f6b : UI.panelHi)
            .setStrokeStyle(2, UI.line);
          this.add.text(bg.x, bg.y, btns[k][0], {
            fontFamily: UI.font, fontSize: '15px', color: UI.text, fontStyle: 'bold'
          }).setOrigin(0.5);
          this.hits.push({ x: bx, y: by, w: bw, h: bh, fn: btns[k][1] });
        }

        this.bindInput();
        this.events.once('shutdown', function () {
          for (var s = 0; s < self.unsubs.length; s++) { try { self.unsubs[s](); } catch (e) {} }
          self.unsubs.length = 0;
        });
      },

      bindInput: function () {
        var self = this;
        // Before the first run RF.ctx is null; RF.Game.kit is a live getter
        // from boot, so the kit path works on a fresh boot too (RF-INPUT-01).
        var kit = (this.ctx && this.ctx.kit) || (RF.Game && RF.Game.kit) || null;
        if (kit && kit.input && typeof kit.input.onUp === 'function') {
          this.unsubs.push(kit.input.onUp(function (p) { self.tap(p.x, p.y); }));
        } else {
          this.input.on('pointerup', function (p) { self.tap(p.x, p.y); });
        }
      },

      tap: function (x, y) {
        for (var i = 0; i < this.hits.length; i++) {
          var h = this.hits[i];
          if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) { h.fn(); return; }
        }
      },

      update: function (t, dms) {
        if (this.flourish > 0 && this.levelTx) {
          this.flourish = Math.max(0, this.flourish - dms / 900);
          var s = 1 + this.flourish * 0.25;
          this.levelTx.setScale(s);
          this.levelTx.setAlpha(0.6 + 0.4 * (1 - this.flourish));
        }
      },

      go: function (key) {
        this.scene.start(key, { ctx: this.ctx, returnTo: 'Menu' });
      }
    });

    return { Shop: ShopScene, Results: ResultsScene };
  }

  // ------------------------------------------------------------ selftest
  function stubKit() {
    var store = null;
    return {
      save: {
        get: function (fb) { return store == null ? fb : JSON.parse(store); },
        set: function (o) { store = JSON.stringify(o); },
        clear: function () { store = null; },
        _raw: function () { return store; }
      }
    };
  }

  function __selftest() {
    var notes = [];
    var pass = true;
    function ok(cond, msg) { if (!cond) { pass = false; notes.push('FAIL ' + msg); } else notes.push('ok ' + msg); }

    var devSaved = JSON.parse(JSON.stringify(DevMode.state));
    var selSaved = Meta.sessionSelected;

    try {
      // 1. default profile is valid and round-trips
      var d = defaultProfile();
      ok(validateSave(d), 'default profile validates');
      var kit = stubKit();
      ok(commit(kit, d), 'default commits');
      var back = load(kit);
      ok(back.selected === 'reef' && back.sharks.reef.owned === true, 'default round-trips with reef owned');
      ok(load(stubKit()).coins === 0, 'empty store yields default');

      // 2. corrupted saves each reject to default
      var corrupt = [
        ['NaN coins', function (p) { p.coins = NaN; }],
        ['unknown shark id', function (p) { p.sharks.notashark = { owned: true, up: blankUp() }; }],
        ['up level 9', function (p) { p.sharks.reef.up.bite = 9; }],
        ['selected unowned', function (p) { p.sharks.megalodon = { owned: false, up: blankUp() }; p.selected = 'megalodon'; }],
        ['version 99', function (p) { p.v = 99; }],
        ['negative xp', function (p) { p.xp = -5; }],
        ['level above cap', function (p) { p.level = levelCap() + 1; }],
        ['upgrades on unowned', function (p) { p.sharks.greatwhite = { owned: false, up: { bite: 2, speed: 0, boost: 0, power: 0 } }; }],
        ['unknown up track', function (p) { p.sharks.reef.up.wings = 1; }],
        ['coins over cap', function (p) { p.coins = 1e13; }],
        ['sharks not an object', function (p) { p.sharks = []; }]
      ];
      for (var ci = 0; ci < corrupt.length; ci++) {
        var k2 = stubKit();
        var bad = defaultProfile();
        corrupt[ci][1](bad);
        k2.save.set(bad);
        var loaded = load(k2);
        ok(loaded.coins === 0 && loaded.selected === 'reef' && !loaded.sharks.notashark,
          'rejected to default: ' + corrupt[ci][0]);
      }

      // 3. buy path: earn, unlock tier, buy shark, upgrade to cap, cost growth
      var p2 = defaultProfile();
      p2.coins = 400;
      var r1 = buy(p2, { shark: 'epaulette' });
      ok(r1.ok && p2.coins === 250 && p2.sharks.epaulette.owned === true, 'bought epaulette for 150');
      var r2 = buy(p2, { shark: 'notreal' });
      ok(!r2.ok && r2.reason === 'unknown-shark', 'unknown shark refused');

      // tier gating: find a shark whose tier needs a level we do not have
      var gated = null, allS = allSharks();
      for (var gi = 0; gi < allS.length; gi++) {
        if (tierUnlockLevel(allS[gi].tier) > 1) { gated = allS[gi]; break; }
      }
      ok(!!gated, 'found a level-gated shark for the gating test');
      if (gated) {
        p2.coins = 1e9;
        var g1 = buy(p2, { shark: gated.id });
        ok(!g1.ok && g1.reason === 'locked', 'tier-gated buy refused at level 1 (' + gated.id + ')');
        addXp(p2, xpForLevel(levelCap()));
        ok(p2.level === levelCap(), 'addXp reaches level cap at cumulative xp');
        var g2 = buy(p2, { shark: gated.id });
        ok(g2.ok && p2.sharks[gated.id].owned === true, 'buy succeeds once tier unlocked');
      }

      // upgrade cost growth + cap
      var p3 = defaultProfile();
      p3.coins = 1e9;
      var tierR = sharkById('reef').tier;
      var seq = [];
      for (var ui = 0; ui < upLevels(); ui++) {
        var before = p3.coins;
        var ur = buy(p3, { upgrade: { id: 'reef', track: 'bite' } });
        ok(ur.ok, 'upgrade reef bite step ' + (ui + 1));
        seq.push(before - p3.coins);
        ok(seq[ui] === upgradeCost(tierR, ui), 'upgrade cost matches formula at level ' + ui);
      }
      ok(p3.sharks.reef.up.bite === upLevels(), 'bite track reached cap ' + upLevels());
      var over = buy(p3, { upgrade: { id: 'reef', track: 'bite' } });
      ok(!over.ok && over.reason === 'maxed', 'upgrade past cap refused');
      var grew = true;
      for (var si = 1; si < seq.length; si++) if (seq[si] <= seq[si - 1]) grew = false;
      ok(grew, 'upgrade costs strictly increase');
      var notOwned = buy(p3, { upgrade: { id: 'epaulette', track: 'bite' } });
      ok(!notOwned.ok && notOwned.reason === 'not-owned', 'upgrade on unowned shark refused');

      // 4. dev unlockall never persists
      var p4 = defaultProfile();
      var snapBefore = JSON.stringify(p4);
      DevMode.state.forceUnlockAll = true;
      Meta.sessionSelected = null;
      var legend = null;
      for (var li = 0; li < allS.length; li++) if (allS[li].act === 3) { legend = allS[li]; break; }
      ok(!!legend, 'found a legend for the dev test');
      ok(ownedFor(p4, legend.id) === true, 'ownedFor reports dev-unlocked legend as owned');
      var selRes = select(p4, legend.id);
      ok(selRes.ok && selRes.persisted === false, 'dev select is session-only');
      ok(Meta.sessionSelected === legend.id, 'sessionSelected holds the dev pick');
      ok(activeShark(p4) === legend.id, 'activeShark uses the dev pick at runtime');
      var devBuy = buy(p4, { shark: legend.id });
      ok(!devBuy.ok && devBuy.reason === 'dev-unlocked', 'buy refuses to rebuy a dev-unlocked shark');
      ok(JSON.stringify(p4) === snapBefore, 'profile JSON unchanged after dev ownedFor + select + buy attempt');
      var kd = stubKit();
      commit(kd, p4);
      var rawStr = kd.save._raw();
      ok(rawStr.indexOf(legend.id) < 0, 'committed record does not mention the dev shark');
      ok(JSON.parse(rawStr).selected === 'reef', 'committed selected stays reef');

      // dev sessionCoins overlay is spent first and never persists
      DevMode.state.forceUnlockAll = false;
      Meta.sessionSelected = null;
      var p5 = defaultProfile();
      p5.coins = 100;
      DevMode.state.sessionCoins = 500;
      ok(displayCoins(p5) === 600, 'displayCoins adds the session overlay');
      var b5 = buy(p5, { shark: 'epaulette' });
      ok(b5.ok && DevMode.state.sessionCoins === 350 && p5.coins === 100,
        'overlay spent first, persisted coins untouched');
      var b6 = buy(p5, { shark: 'cookiecutter' });
      ok(b6.ok && DevMode.state.sessionCoins === 50 && p5.coins === 100, 'overlay covers a second buy');
      DevMode.state.sessionCoins = 0;

      // 5. endRun math including the once-per-date daily bonus
      var p6 = defaultProfile();
      var kitR = stubKit();
      var mult = ECON().dailyBonusMult;
      var ctx1 = { kit: kitR, save: p6, run: { score: 1200, coins: 100, xp: 250, biggestTier: 4, bestCombo: 7 } };
      var res1 = endRun(ctx1);
      ok(res1.dailyBonus === true, 'first run of the day gets the daily bonus');
      ok(res1.coins === Math.floor(100 * mult), 'bonus coins = base * ' + mult);
      ok(p6.coins === res1.coins, 'profile coins credited');
      ok(p6.best.score === 1200 && p6.best.biggestTier === 4, 'best updated');
      ok(p6.runs === 1, 'runs incremented');
      ok(res1.bestCombo === 7, 'best combo carried into the payload');
      var lvExpect = levelForXp(250).level;
      ok(p6.level === lvExpect && res1.levelUps === lvExpect - 1, 'level ups computed from xp');

      var res2 = endRun({ kit: kitR, save: p6, run: { score: 500, coins: 100, xp: 10, biggestTier: 2 } });
      ok(res2.dailyBonus === false, 'second run the same day gets no bonus');
      ok(res2.coins === 100, 'second run pays base coins only');
      ok(p6.best.score === 1200, 'best score not lowered by a worse run');
      ok(p6.runs === 2, 'runs incremented again');

      // a new local date re-arms the bonus
      p6.lastBonusDay = '1999-01-01';
      var res3 = endRun({ kit: kitR, save: p6, run: { score: 10, coins: 100, xp: 0, biggestTier: 1 } });
      ok(res3.dailyBonus === true, 'a new date re-arms the daily bonus');

      // persisted record after endRun is still valid
      ok(validateSave(kitR.save.get(null)), 'record persisted by endRun validates');

      // 5b. RF-BEST-01: peak combo is reported, not the final counter
      ok(comboPeakOf({ combo: 0, comboPeak: 14 }) === 14, 'comboPeak wins over a reset counter');
      ok(comboPeakOf({ combo: 3 }) === 3, 'bare combo counter is the fallback');
      ok(comboPeakOf({ combo: 9, bestCombo: 4 }) === 9, 'the highest observed combo field wins');
      ok(comboPeakOf({ comboPeak: -5 }) === 0, 'negative peak floors at 0');
      ok(comboPeakOf({ comboPeak: 6.9 }) === 6, 'peak is floored to an integer');
      ok(comboPeakOf({}) === 0 && comboPeakOf(null) === 0, 'missing combo data reports 0');
      ok(comboPeakOf({ comboPeak: NaN, combo: 2 }) === 2, 'NaN peak ignored, counter used');

      var pB = defaultProfile();
      var kitB = stubKit();
      // died with the counter reset to 0 after peaking at 12
      var resB = endRun({ kit: kitB, save: pB, run: { score: 400, coins: 0, xp: 0, comboPeak: 12, combo: 0 } });
      ok(resB.bestCombo === 12, 'endRun reports the peak combo, not the final combo');
      ok(resB.newBest === true, 'a first scoring run is a new best');
      // exact tie must NOT be announced as a new best
      var resB2 = endRun({ kit: kitB, save: pB, run: { score: 400, coins: 0, xp: 0 } });
      ok(resB2.newBest === false, 'a tied score is not announced as a new best');
      ok(pB.best.score === 400, 'tied score leaves the record unchanged');
      var resB3 = endRun({ kit: kitB, save: pB, run: { score: 401, coins: 0, xp: 0 } });
      ok(resB3.newBest === true, 'beating the record by one point is a new best');
      var resB4 = endRun({ kit: kitB, save: pB, run: { score: 0, coins: 0, xp: 0 } });
      ok(resB4.newBest === false, 'a zero score is never a new best');

      // 5c. RF-SAVE-VAL-01: lastBonusDay must be a real YYYY-MM-DD day
      ok(isDayString('2026-08-19') === true, 'a well formed day validates');
      ok(isDayString('1999-01-01') === true, 'an old but valid day validates');
      ok(isDayString('2024-02-29') === true, 'a leap day validates');
      ok(isDayString('2026-02-30') === false, 'an impossible february day is rejected');
      ok(isDayString('2026-13-01') === false, 'month 13 is rejected');
      ok(isDayString('2026-00-10') === false, 'month 0 is rejected');
      ok(isDayString('2026-04-31') === false, 'april 31 is rejected');
      ok(isDayString('2026-8-19') === false, 'an unpadded month is rejected');
      ok(isDayString('2026-08-19T00:00:00Z') === false, 'a timestamp is rejected');
      ok(isDayString('never') === false && isDayString('') === false, 'junk strings are rejected');
      ok(isDayString(20260819) === false && isDayString(null) === false, 'non-strings are rejected');
      ok(isDayString(localDayString()) === true, 'localDayString output is a legal day');

      var pV = defaultProfile();
      pV.lastBonusDay = 'never';
      ok(validateSave(pV) === false, 'validateSave rejects a junk lastBonusDay');
      pV.lastBonusDay = '2026-08-19';
      ok(validateSave(pV) === true, 'validateSave accepts a real day');
      pV.lastBonusDay = null;
      ok(validateSave(pV) === true, 'validateSave accepts a null day');

      // repair-not-reject: a junk day survives load as a fresh null, and the
      // rest of the profile (coins, owned sharks, level) is preserved.
      var kitV = stubKit();
      var pJunk = defaultProfile();
      pJunk.coins = 4321;
      pJunk.sharks.epaulette = { owned: true, up: { bite: 1, speed: 0, boost: 0, power: 0 } };
      pJunk.lastBonusDay = 'not-a-date';
      kitV.save.set(pJunk);
      var loadedV = load(kitV);
      ok(loadedV.coins === 4321, 'a junk day does NOT wipe the rest of the profile');
      ok(loadedV.sharks.epaulette && loadedV.sharks.epaulette.owned === true, 'owned sharks survive the repair');
      ok(loadedV.lastBonusDay === null, 'the junk day is repaired to null');
      ok(validateSave(loadedV) === true, 'the repaired profile validates');

      // and the repaired profile takes the daily bonus exactly once
      var kitV2 = stubKit();
      var resV1 = endRun({ kit: kitV2, save: loadedV, run: { score: 5, coins: 100, xp: 0 } });
      var resV2 = endRun({ kit: kitV2, save: loadedV, run: { score: 5, coins: 100, xp: 0 } });
      ok(resV1.dailyBonus === true && resV2.dailyBonus === false,
        'a repaired profile gets the daily bonus once, not every run');
      ok(loadedV.lastBonusDay === localDayString(), 'the repaired day marker is rewritten to today');

      // a still-valid day survives the repair untouched
      var kitV3 = stubKit();
      var pGood = defaultProfile();
      pGood.lastBonusDay = '2020-06-15';
      kitV3.save.set(pGood);
      ok(load(kitV3).lastBonusDay === '2020-06-15', 'a legal day is not disturbed by the repair');

      // 6. migration: a versionless record rebuilds and carries plausible coins/xp
      var kitM = stubKit();
      kitM.save.set({ coins: 777, xp: 1500, junk: 'ignored' });
      var mig = load(kitM);
      ok(mig.v === SAVE_VERSION && mig.coins === 777 && mig.xp === 1500, 'versionless save carries coins and xp');
      ok(mig.level === levelForXp(1500).level, 'migrated level recomputed from xp');
      ok(mig.sharks.reef.owned === true, 'migrated profile owns reef');
      var kitM2 = stubKit();
      kitM2.save.set({ coins: 'lots', xp: -1 });
      var mig2 = load(kitM2);
      ok(mig2.coins === 0 && mig2.xp === 0, 'implausible legacy values dropped to zero');

      // 7. xp curve monotonic and cumulative
      ok(xpForLevel(1) === 0, 'xpForLevel(1) is zero');
      ok(xpForLevel(3) === xpStep(1) + xpStep(2), 'xpForLevel is cumulative');
      var mono = true;
      for (var xi = 2; xi <= levelCap(); xi++) if (xpForLevel(xi) <= xpForLevel(xi - 1)) mono = false;
      ok(mono, 'xp curve strictly increases to the cap');
      ok(levelForXp(xpForLevel(10)).level === 10, 'levelForXp inverts xpForLevel');
      ok(levelForXp(1e12).level === levelCap(), 'level clamps at the cap');
    } catch (e) {
      pass = false;
      notes.push('FAIL threw: ' + (e && e.message ? e.message : String(e)));
    }

    // Restore dev state so a selftest run never leaves the session altered.
    DevMode.state.forceUnlockAll = devSaved.forceUnlockAll;
    DevMode.state.forceInvincible = devSaved.forceInvincible;
    DevMode.state.forceSkipTutorial = devSaved.forceSkipTutorial;
    DevMode.state.sessionCoins = devSaved.sessionCoins;
    DevMode.state.forceGoldRush = devSaved.forceGoldRush;
    DevMode.state.forcePower = devSaved.forcePower;
    DevMode.state.forceZone = devSaved.forceZone;
    DevMode.state.active = devSaved.active;
    Meta.sessionSelected = selSaved;

    return { pass: pass, notes: notes };
  }

  // ---------------------------------------------------------------- export
  var Meta = {
    SAVE_VERSION: SAVE_VERSION,
    UP_TRACKS: UP_TRACKS,
    sessionSelected: null,

    defaultProfile: defaultProfile,
    validateSave: validateSave,
    isDayString: isDayString,
    comboPeakOf: comboPeakOf,
    migrate: migrate,
    load: load,
    commit: commit,

    xpForLevel: xpForLevel,
    xpStep: xpStep,
    levelForXp: levelForXp,
    addXp: addXp,
    tierUnlocked: tierUnlocked,
    tierUnlockLevel: tierUnlockLevel,
    upgradeCost: upgradeCost,
    upLevel: upLevel,
    canBuy: canBuy,
    buy: buy,
    ownedFor: ownedFor,
    reallyOwned: reallyOwned,
    select: select,
    activeShark: activeShark,
    displayCoins: displayCoins,
    unlockCallouts: unlockCallouts,
    localDayString: localDayString,
    endRun: endRun,

    scenes: null,
    UI: UI,
    __selftest: __selftest
  };

  Meta.scenes = buildScenes();

  RF.Meta = Meta;
  RF.DevMode = DevMode;
}());
