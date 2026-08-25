/* Razorfin meta.js (Lane C) - RF.Meta + RF.DevMode.
   Owns: save schema v1, validation + forward migration, economy (xp/levels/
   buying/upgrades), end-of-run settlement, and the two out-of-run Phaser
   scenes (Shop, Results). Registers NO window/document listeners and uses no
   setTimeout/setInterval. Scene classes are handed to game.js on
   RF.Meta.scenes; this file never boots Phaser.

   Save shape (SAVE_VERSION = 2, Rev 7 -- see meta.js save schema additions in
   SPEC.md for the gems/relics/skins/missions fields added on top of v1):
     { v:2, coins, xp, level, selected,
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
  var SAVE_VERSION = 3;
  var UP_TRACKS = ['bite', 'speed', 'boost', 'power'];
  var COIN_CAP = 1e12;
  var XP_CAP = 1e12;
  var RUNS_CAP = 1e9;
  var SCORE_CAP = 1e12;
  var GEMS_CAP = 1e9;
  var MISSION_PROGRESS_CAP = 1e9;
  var ACTIVE_MISSIONS_N = 3;

  function zoneIds() {
    var zones = (RFD && RFD.ZONES) || [];
    var out = [];
    for (var i = 0; i < zones.length; i++) if (isInt(zones[i].id)) out.push(zones[i].id);
    return out;
  }
  // Rev 12: RFD.LEVELS is the data lane's 12-location table (id, name, sky
  // preset, unlock cost, etc -- see SPEC3D.md 12.1). It may not exist yet
  // (parallel lane), so every reader here treats a missing/empty table as
  // "no levels" and degrades gracefully rather than throwing.
  function levelList() {
    return (RFD && Array.isArray(RFD.LEVELS)) ? RFD.LEVELS : [];
  }
  function levelIds() {
    var lv = levelList();
    var out = [];
    for (var i = 0; i < lv.length; i++) if (lv[i] && typeof lv[i].id === 'string') out.push(lv[i].id);
    return out;
  }
  function levelById(id) {
    var lv = levelList();
    for (var i = 0; i < lv.length; i++) if (lv[i] && lv[i].id === id) return lv[i];
    return null;
  }
  // First level is the default unlocked/selected one. Falls back to a
  // stable literal id if the data lane hasn't landed LEVELS yet -- the
  // profile field still round-trips fine even if levelById() can't resolve it.
  function firstLevelId() {
    var ids = levelIds();
    return ids.length ? ids[0] : 'hawaii';
  }
  function defaultLevels() {
    var out = {};
    var ids = levelIds();
    var first = firstLevelId();
    if (ids.indexOf(first) < 0) ids = [first].concat(ids);
    for (var i = 0; i < ids.length; i++) {
      out[ids[i]] = { best: 0, unlocked: ids[i] === first };
    }
    return out;
  }
  function relicsByZone(zoneId) {
    var rz = (RFD && RFD.RELICS_BY_ZONE) || {};
    return rz[zoneId] || [];
  }
  function missionById(id) {
    var list = (RFD && RFD.MISSIONS) || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function skinById(id) {
    var list = (RFD && RFD.SKINS) || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

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
  function defaultRelics() {
    var out = {};
    var ids = zoneIds();
    for (var i = 0; i < ids.length; i++) out[ids[i]] = [false, false, false];
    return out;
  }

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
      lastBonusDay: null,
      gems: 0,
      relics: defaultRelics(),
      skins: { owned: [], selectedSkin: null },
      missions: { active: [], progress: {}, completed: {} },
      levels: defaultLevels(),
      selectedLevel: firstLevelId()
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

    // ---- Rev 7 additions: gems, relics, skins, missions ----
    if (!counter(obj.gems, GEMS_CAP)) return false;

    if (!isPlainObj(obj.relics)) return false;
    var zids = zoneIds();
    var relicKeys = Object.getOwnPropertyNames(obj.relics);
    for (var rk = 0; rk < relicKeys.length; rk++) {
      var zk = relicKeys[rk];
      if (zids.indexOf(Number(zk)) < 0 && zids.indexOf(zk) < 0) return false;
      var arr = obj.relics[zk];
      if (!Array.isArray(arr) || arr.length !== 3) return false;
      for (var ai = 0; ai < arr.length; ai++) {
        if (typeof arr[ai] !== 'boolean' && arr[ai] !== 0 && arr[ai] !== 1) return false;
      }
    }

    if (!isPlainObj(obj.skins)) return false;
    if (!Array.isArray(obj.skins.owned)) return false;
    for (var si = 0; si < obj.skins.owned.length; si++) {
      if (typeof obj.skins.owned[si] !== 'string' || !skinById(obj.skins.owned[si])) return false;
    }
    if (obj.skins.selectedSkin != null) {
      if (typeof obj.skins.selectedSkin !== 'string') return false;
      if (!skinById(obj.skins.selectedSkin)) return false;
      if (obj.skins.owned.indexOf(obj.skins.selectedSkin) < 0) return false;
    }

    if (!isPlainObj(obj.missions)) return false;
    if (!Array.isArray(obj.missions.active) || obj.missions.active.length > ACTIVE_MISSIONS_N) return false;
    for (var mi = 0; mi < obj.missions.active.length; mi++) {
      if (typeof obj.missions.active[mi] !== 'string' || !missionById(obj.missions.active[mi])) return false;
    }
    if (!isPlainObj(obj.missions.progress)) return false;
    var progKeys = Object.getOwnPropertyNames(obj.missions.progress);
    for (var pk = 0; pk < progKeys.length; pk++) {
      if (!missionById(progKeys[pk])) return false;
      if (!counter(obj.missions.progress[progKeys[pk]], MISSION_PROGRESS_CAP)) return false;
    }
    if (!isPlainObj(obj.missions.completed)) return false;
    var compKeys = Object.getOwnPropertyNames(obj.missions.completed);
    for (var ck = 0; ck < compKeys.length; ck++) {
      if (!missionById(compKeys[ck])) return false;
      if (obj.missions.completed[compKeys[ck]] !== true && obj.missions.completed[compKeys[ck]] !== 1) return false;
    }

    // ---- Rev 12 additions: levels (save schema v3) ----
    if (!isPlainObj(obj.levels)) return false;
    var lids = levelIds();
    var lvKeys = Object.getOwnPropertyNames(obj.levels);
    for (var lk = 0; lk < lvKeys.length; lk++) {
      var lid = lvKeys[lk];
      // If the data lane hasn't landed RFD.LEVELS yet, accept any string key
      // rather than rejecting every save -- defensive per SPEC3D 12.6.
      if (lids.length && lids.indexOf(lid) < 0) return false;
      var lrow = obj.levels[lid];
      if (!isPlainObj(lrow)) return false;
      if (!counter(lrow.best, SCORE_CAP)) return false;
      if (typeof lrow.unlocked !== 'boolean') {
        if (lrow.unlocked !== 0 && lrow.unlocked !== 1) return false;
      }
    }
    if (typeof obj.selectedLevel !== 'string') return false;
    if (!obj.levels[obj.selectedLevel]) return false;

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

    // Rev 7: coerce boolean-ish relic flags, backfill any zone missing from
    // the persisted record (e.g. a zone added after the save was written).
    if (!isPlainObj(p.relics)) p.relics = defaultRelics();
    var zids = zoneIds();
    for (var zi = 0; zi < zids.length; zi++) {
      var zk = zids[zi];
      if (!Array.isArray(p.relics[zk]) || p.relics[zk].length !== 3) p.relics[zk] = [false, false, false];
      else for (var ai = 0; ai < 3; ai++) p.relics[zk][ai] = !!p.relics[zk][ai];
    }
    if (!isPlainObj(p.skins)) p.skins = { owned: [], selectedSkin: null };
    if (!Array.isArray(p.skins.owned)) p.skins.owned = [];
    if (p.skins.selectedSkin === undefined) p.skins.selectedSkin = null;
    if (!isPlainObj(p.missions)) p.missions = { active: [], progress: {}, completed: {} };
    if (!Array.isArray(p.missions.active)) p.missions.active = [];
    if (!isPlainObj(p.missions.progress)) p.missions.progress = {};
    if (!isPlainObj(p.missions.completed)) p.missions.completed = {};
    if (!isInt(p.gems) || p.gems < 0) p.gems = 0;

    // Rev 12: backfill any level missing from the persisted record (e.g. a
    // location added after the save was written), coerce boolean-ish flags.
    if (!isPlainObj(p.levels)) p.levels = defaultLevels();
    var lids2 = levelIds();
    var haveAny = false;
    for (var li = 0; li < lids2.length; li++) {
      var lid2 = lids2[li];
      if (!isPlainObj(p.levels[lid2])) {
        p.levels[lid2] = { best: 0, unlocked: lid2 === firstLevelId() };
      } else {
        if (!isInt(p.levels[lid2].best) || p.levels[lid2].best < 0) p.levels[lid2].best = 0;
        p.levels[lid2].unlocked = !!p.levels[lid2].unlocked;
      }
      haveAny = true;
    }
    // Always coerce existing entries even when RFD.LEVELS hasn't landed.
    var existingLevelKeys = Object.getOwnPropertyNames(p.levels);
    for (var ek = 0; ek < existingLevelKeys.length; ek++) {
      var row2 = p.levels[existingLevelKeys[ek]];
      if (!isPlainObj(row2)) { p.levels[existingLevelKeys[ek]] = { best: 0, unlocked: false }; continue; }
      if (!isInt(row2.best) || row2.best < 0) row2.best = 0;
      row2.unlocked = !!row2.unlocked;
    }
    if (!haveAny && !Object.getOwnPropertyNames(p.levels).length) p.levels = defaultLevels();
    if (typeof p.selectedLevel !== 'string' || !p.levels[p.selectedLevel]) {
      var fallback = firstLevelId();
      if (!p.levels[fallback]) {
        var anyKey = Object.getOwnPropertyNames(p.levels)[0];
        fallback = anyKey || fallback;
        if (!p.levels[fallback]) p.levels[fallback] = { best: 0, unlocked: true };
      }
      p.selectedLevel = fallback;
    }
    if (!p.levels[p.selectedLevel].unlocked) p.levels[p.selectedLevel].unlocked = true;

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
    // Rev 7: v1 -> v2 adds gems/relics/skins/missions. coins/xp/level/sharks/
    // best/runs/tutorialDone/lastBonusDay are untouched by this step.
    if (p.v === 1) {
      p.gems = 0;
      p.relics = defaultRelics();
      p.skins = { owned: [], selectedSkin: null };
      p.missions = { active: [], progress: {}, completed: {} };
      p.v = 2;
    }
    // Rev 12: v2 -> v3 adds levels/selectedLevel (save schema v3). Everything
    // else on the profile (coins/xp/sharks/gems/relics/skins/missions/etc)
    // is preserved untouched by this step.
    if (p.v === 2) {
      p.levels = defaultLevels();
      p.selectedLevel = firstLevelId();
      p.v = 3;
    }
    // Future steps chain here:
    //   if (p.v === 3) { ...upgrade to 4...; p.v = 4; }
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

  // ------------------------------------------------------------- levels
  // Rev 12 (12.1/12.6): level select lives in ui3d/meta; engine/world just
  // consume ctx.level. Every function here is defensive against RFD.LEVELS
  // not existing yet (parallel data lane) -- an unrecognised id is simply
  // treated as "not a real level" rather than thrown on.
  function ensureLevelRow(profile, id) {
    if (!isPlainObj(profile.levels)) profile.levels = defaultLevels();
    if (!isPlainObj(profile.levels[id])) profile.levels[id] = { best: 0, unlocked: false };
    return profile.levels[id];
  }

  function levelBest(profile, id) {
    if (!profile || !isPlainObj(profile.levels) || !profile.levels[id]) return 0;
    return counter(profile.levels[id].best, SCORE_CAP) ? profile.levels[id].best : 0;
  }

  function levelUnlocked(profile, id) {
    // Rev 12: dev unlock-all (?unlockall=1) is a runtime overlay that must
    // apply to levels too, and from ONE authority, so the UI's copy and the
    // engine's profile can never disagree about what is selectable.
    try { if (typeof DevMode !== 'undefined' && DevMode && DevMode.state && DevMode.state.forceUnlockAll && levelById(id)) return true; } catch (e) {}
    if (!profile || !isPlainObj(profile.levels)) return id === firstLevelId();
    var row = profile.levels[id];
    return !!(row && row.unlocked);
  }

  // unlockLevel is coin/gem-cost aware when the data lane provides an
  // `unlock` field (12.1: "coins or gems or prior-level score"); a level
  // with no recognised cost shape unlocks for free rather than blocking.
  function unlockLevel(kit, profile, id) {
    var lvl = levelById(id);
    if (!lvl && levelIds().length) return { ok: false, reason: 'unknown-level' };
    if (levelUnlocked(profile, id)) return { ok: true, already: true, id: id };

    // RFD.LEVELS unlock shape (12.1, gen_data.py): {type:'coins'|'gems'|
    // 'score', n, levelId}. A cost with an unrecognised/missing type or a
    // zero/negative n is treated as free rather than blocking.
    var cost = lvl && lvl.unlock;
    if (cost && isPlainObj(cost) && isFinite(cost.n) && cost.n > 0) {
      if (cost.type === 'coins') {
        var haveCoins = isFinite(profile.coins) ? profile.coins : 0;
        if (haveCoins < cost.n) return { ok: false, reason: 'insufficient-coins' };
        profile.coins = clamp(profile.coins - cost.n, 0, COIN_CAP);
      } else if (cost.type === 'gems') {
        var gr = spendGems(kit, profile, cost.n, 'unlockLevel:' + id);
        if (!gr.ok) return gr;
      } else if (cost.type === 'score') {
        var priorId = typeof cost.levelId === 'string' ? cost.levelId : null;
        if (priorId && levelBest(profile, priorId) < cost.n) {
          return { ok: false, reason: 'score-gate' };
        }
      }
    }

    ensureLevelRow(profile, id).unlocked = true;
    if (kit) commit(kit, profile);
    return { ok: true, already: false, id: id };
  }

  function selectLevel(profile, id) {
    if (levelIds().length && !levelById(id)) return { ok: false, reason: 'unknown-level' };
    if (!levelUnlocked(profile, id)) return { ok: false, reason: 'locked' };
    profile.selectedLevel = id;
    return { ok: true, id: id };
  }

  // -------------------------------------------------------------- gems
  // Single spend authority (D5/7.6 law). reason is a short string for
  // future logging/analytics; not persisted anywhere today.
  function spendGems(kit, profile, n, reason) {
    var cost = isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
    if (!isPlainObj(profile)) return { ok: false, reason: 'bad-profile' };
    if (profile.gems < cost) return { ok: false, reason: 'gems', cost: cost };
    profile.gems = clamp(profile.gems - cost, 0, GEMS_CAP);
    if (kit) commit(kit, profile);
    return { ok: true, cost: cost, spentFor: reason || null, gems: profile.gems };
  }

  // Single award authority. Gems are NEVER purchasable; every credit path
  // (frenzy completion, daily bonus, mission reward, gempickup) funnels here.
  function addGems(profile, n) {
    var add = isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
    profile.gems = clamp(profile.gems + add, 0, GEMS_CAP);
    return profile.gems;
  }

  // Buy/unlock a skin with gems. Global skins (sharkId:null) are usable on
  // any owned shark; shark-locked skins require that shark to be owned first.
  function buySkin(kit, profile, skinId) {
    var def = skinById(skinId);
    if (!def) return { ok: false, reason: 'unknown-skin' };
    if (profile.skins.owned.indexOf(skinId) >= 0) return { ok: false, reason: 'owned' };
    if (def.sharkId && !reallyOwned(profile, def.sharkId)) return { ok: false, reason: 'shark-not-owned' };
    var res = spendGems(null, profile, def.cost, 'skin:' + skinId);
    if (!res.ok) return res;
    profile.skins.owned.push(skinId);
    if (kit) commit(kit, profile);
    return { ok: true, skin: skinId, cost: def.cost };
  }

  function selectSkin(kit, profile, skinId) {
    if (skinId != null && profile.skins.owned.indexOf(skinId) < 0) return { ok: false, reason: 'not-owned' };
    profile.skins.selectedSkin = skinId || null;
    if (kit) commit(kit, profile);
    return { ok: true, skin: profile.skins.selectedSkin };
  }

  // relicSetCount: number of zones where the player has all 3 relics.
  function relicSetCount(profile) {
    var zids = zoneIds();
    var n = 0;
    for (var i = 0; i < zids.length; i++) {
      var arr = profile.relics[zids[i]];
      if (arr && arr[0] && arr[1] && arr[2]) n++;
    }
    return n;
  }

  function secretSharkUnlocked(profile, sharkId) {
    var list = (RFD && RFD.SECRET_SHARKS) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].sharkId !== sharkId) continue;
      if (relicSetCount(profile) >= list[i].relicSets) return true;
      return false; // gemCost path is an explicit purchase, not passive ownedFor
    }
    return null; // not a secret shark
  }

  // Attempt the gems-only unlock path for a secret shark (used from Shop/UI).
  function unlockSecretSharkWithGems(kit, profile, sharkId) {
    var list = (RFD && RFD.SECRET_SHARKS) || [];
    var row = null;
    for (var i = 0; i < list.length; i++) if (list[i].sharkId === sharkId) { row = list[i]; break; }
    if (!row) return { ok: false, reason: 'not-secret' };
    if (reallyOwned(profile, sharkId)) return { ok: false, reason: 'owned' };
    var res = spendGems(null, profile, row.gemCost, 'secretshark:' + sharkId);
    if (!res.ok) return res;
    profile.sharks[sharkId] = { owned: true, up: blankUp() };
    if (kit) commit(kit, profile);
    return { ok: true, shark: sharkId, cost: row.gemCost };
  }

  // Relic-set unlocks that just became newly true this run (zones that
  // reached 3/3 for the first time). Returns skin/shark unlock records;
  // called from endRun. Does not mutate ownership itself for skins (skins
  // stay gem-purchases) -- but auto-grants the relic-count secret sharks
  // whose relicSets threshold is now met and are not yet owned.
  function relicSetUnlocks(profile, previouslyCompleteZones) {
    var out = [];
    var zids = zoneIds();
    for (var i = 0; i < zids.length; i++) {
      var zk = zids[i];
      var arr = profile.relics[zk];
      var complete = !!(arr && arr[0] && arr[1] && arr[2]);
      var wasComplete = previouslyCompleteZones.indexOf(zk) >= 0 || previouslyCompleteZones.indexOf(Number(zk)) >= 0;
      if (complete && !wasComplete) out.push({ type: 'relicSet', zoneId: zk });
    }
    if (out.length) {
      var count = relicSetCount(profile);
      var secrets = (RFD && RFD.SECRET_SHARKS) || [];
      for (var s = 0; s < secrets.length; s++) {
        var row = secrets[s];
        if (count >= row.relicSets && !reallyOwned(profile, row.sharkId)) {
          profile.sharks[row.sharkId] = { owned: true, up: blankUp() };
          out.push({ type: 'sharkUnlock', sharkId: row.sharkId, via: 'relicSet' });
        }
      }
    }
    return out;
  }

  // ---------------------------------------------------------- missions
  // Choose ACTIVE_MISSIONS_N missions for the upcoming run. Deterministic
  // given no rng arg (falls back to Math.random); pass ctx.rng (mulberry32)
  // when available so the pick is seed-reproducible in headless tests.
  function rollMissions(profile, rng) {
    var pool = ((RFD && RFD.MISSIONS) || []).slice();
    var rand = typeof rng === 'function' ? rng : Math.random;
    // Fisher-Yates partial shuffle, skipping already-completed missions first
    // so a fresh 3 favors uncompleted goals; falls back to the full pool if
    // fewer than N remain uncompleted.
    var uncompleted = pool.filter(function (m) { return !profile.missions.completed[m.id]; });
    var source = uncompleted.length >= ACTIVE_MISSIONS_N ? uncompleted : pool;
    var arr = source.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    var picked = arr.slice(0, Math.min(ACTIVE_MISSIONS_N, arr.length)).map(function (m) { return m.id; });
    profile.missions.active = picked;
    for (var p = 0; p < picked.length; p++) {
      if (!isInt(profile.missions.progress[picked[p]])) profile.missions.progress[picked[p]] = 0;
    }
    return picked;
  }

  // Mission progress API, consumed by the engine/world via the existing kit
  // bus. type in 'eat' | 'relic' | 'zoneTime' | 'score'. payload shapes:
  //   eat:      { defId }                (one eat event; missions with
  //                                        target.defId===null match any)
  //   relic:    { zoneId }                (one relic collected)
  //   zoneTime: { zoneId, seconds }       (cumulative seconds this run in
  //                                        that zone; caller may call once
  //                                        per fixed step with a running total
  //                                        -- progress is set to max(), not
  //                                        summed, so repeated calls are safe)
  //   score:    { score }                 (current run score, monotonic)
  // Returns the list of mission ids that just completed on this call (empty
  // if none). ctx.run.gems accumulates completion rewards; ctx.run.missionResults
  // collects {id, name, gems} records for the Results payload (S4 reads this).
  function missionEvent(ctx, type, payload) {
    var run = ctx && ctx.run;
    var profile = ctx && ctx.save;
    if (!run || !profile || !isPlainObj(profile.missions)) return [];
    if (!Array.isArray(run.missionResults)) run.missionResults = [];
    if (!isFinite(run.gems)) run.gems = 0;

    var justCompleted = [];
    var active = profile.missions.active || [];
    for (var i = 0; i < active.length; i++) {
      var id = active[i];
      if (profile.missions.completed[id]) continue;
      var def = missionById(id);
      if (!def) continue;
      var cur = isInt(profile.missions.progress[id]) ? profile.missions.progress[id] : 0;
      var next = cur;
      var target = def.target || {};

      if (def.type === 'eatCount' && type === 'eat') {
        if (target.defId == null || target.defId === payload.defId) next = cur + 1;
      } else if (def.type === 'findRelic' && type === 'relic') {
        if (target.zoneId == null || target.zoneId === payload.zoneId) next = cur + 1;
      } else if (def.type === 'surviveZone' && type === 'zoneTime') {
        if (target.zoneId === payload.zoneId) next = Math.max(cur, Math.floor(payload.seconds || 0));
      } else if (def.type === 'score' && type === 'score') {
        next = Math.max(cur, Math.floor(payload.score || 0));
      }

      if (next !== cur) profile.missions.progress[id] = clamp(next, 0, MISSION_PROGRESS_CAP);

      var done = false;
      if (def.type === 'eatCount') done = profile.missions.progress[id] >= target.n;
      else if (def.type === 'findRelic') done = profile.missions.progress[id] >= target.n;
      else if (def.type === 'surviveZone') done = profile.missions.progress[id] >= target.seconds;
      else if (def.type === 'score') done = profile.missions.progress[id] >= target.n;

      if (done) {
        profile.missions.completed[id] = true;
        run.gems += def.gems;
        run.missionResults.push({ id: id, name: def.name, gems: def.gems });
        justCompleted.push(id);
      }
    }
    return justCompleted;
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

  // Rev 7 B4: Meta.endRun is a public, re-entrant payout primitive. Any
  // retry/restore/future UI path calling it twice on the same run bag must
  // not double-pay coins/xp/gems/runs/daily/frenzy. Stamp the run bag with a
  // settlement token on first call and return the cached result verbatim on
  // re-entry. Deliberately does NOT consult the engine's separate `running`
  // flag -- that guard lives in a different module and this primitive must
  // be safe even if that guard is bypassed or absent.
  var SETTLED_KEY = '__metaSettled';

  function endRun(ctx) {
    var run = (ctx && ctx.run) || {};
    if (run[SETTLED_KEY] && run.__metaSettledResult) return run.__metaSettledResult;

    var kit = ctx && ctx.kit;
    var profile = (ctx && ctx.save) || defaultProfile();
    var econ = ECON();

    // Rev 7: snapshot which zones already had a full relic set BEFORE this
    // run's finds are applied, so relicSetUnlocks() can tell "just completed"
    // apart from "was already complete".
    var previouslyCompleteZones = [];
    (function () {
      var zids = zoneIds();
      for (var i = 0; i < zids.length; i++) {
        var arr = profile.relics[zids[i]];
        if (arr && arr[0] && arr[1] && arr[2]) previouslyCompleteZones.push(zids[i]);
      }
    }());

    // ctx.run.relics: array of {relicId, zoneId} collected this run (engine/
    // world push via missionEvent('relic',...) AND here directly). Mark them
    // owned on the persisted profile.
    var relicFinds = Array.isArray(run.relics) ? run.relics : [];
    for (var rf = 0; rf < relicFinds.length; rf++) {
      var find = relicFinds[rf];
      if (!find || find.zoneId == null) continue;
      var zoneRelics = relicsByZone(find.zoneId);
      var idx = -1;
      for (var zi2 = 0; zi2 < zoneRelics.length; zi2++) {
        if (zoneRelics[zi2].id === find.relicId) { idx = zi2; break; }
      }
      if (idx < 0) continue;
      if (!Array.isArray(profile.relics[find.zoneId]) || profile.relics[find.zoneId].length !== 3) {
        profile.relics[find.zoneId] = [false, false, false];
      }
      profile.relics[find.zoneId][idx] = true;
    }

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

    // Rev 12: record this run's score as the per-level best. ctx.level (or
    // run.level, whichever the engine ends up publishing -- defensive
    // against either seam) falls back to the profile's selected level.
    var runLevelId = (ctx && ctx.level) || run.level || profile.selectedLevel;
    if (typeof runLevelId === 'string') {
      var lrow = ensureLevelRow(profile, runLevelId);
      lrow.unlocked = true;
      if (score > lrow.best) lrow.best = Math.min(score, SCORE_CAP);
    }

    var unlocks = unlockCallouts(profile, oldLevel, profile.level);
    var lv = levelForXp(profile.xp);

    // Rev 7: gem accounting. run.gems already carries mission-completion
    // gems (missionEvent adds them as it fires); this adds frenzy-completion
    // and daily-bonus gems, then credits the profile once.
    var gemsCfg = (RFD && RFD.GEMS) || { frenzy: {}, daily: 0, gempickup: 0 };
    var runGems = isFinite(run.gems) ? Math.max(0, Math.floor(run.gems)) : 0;
    var frenzyGems = 0;
    if (run.frenzyCompletions && isPlainObj(run.frenzyCompletions)) {
      var fk = ['goldrush', 'blood', 'school'];
      for (var fi = 0; fi < fk.length; fi++) {
        var n = run.frenzyCompletions[fk[fi]];
        if (isFinite(n) && n > 0) {
          frenzyGems += Math.floor(n) * (isFinite(gemsCfg.frenzy[fk[fi]]) ? gemsCfg.frenzy[fk[fi]] : 0);
        }
      }
    }
    var dailyGems = dailyApplied && isFinite(gemsCfg.daily) ? gemsCfg.daily : 0;
    var totalGems = runGems + frenzyGems + dailyGems;
    addGems(profile, totalGems);

    var relicUnlocks = relicSetUnlocks(profile, previouslyCompleteZones);
    var missionResults = Array.isArray(run.missionResults) ? run.missionResults : [];

    if (kit) commit(kit, profile);

    var result = {
      score: score,
      gems: totalGems,
      gemsBreakdown: { missions: runGems, frenzy: frenzyGems, daily: dailyGems },
      missionResults: missionResults,
      relicFinds: relicFinds,
      relicUnlocks: relicUnlocks,
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

    // B4: stamp the settlement token + cache the result on the run bag
    // itself (not a module-level map) so it travels with the run and is
    // naturally scoped/GC'd with it. Re-entrant calls short-circuit above.
    run[SETTLED_KEY] = true;
    run.__metaSettledResult = result;

    return result;
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
    return act === 1 ? 'Real Sharks' : act === 2 ? 'Monsters' : act === 3 ? 'Legends'
      : act === 4 ? 'Pantheon' : act === 5 ? 'Underworld' : ('Act ' + act);
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
        var all0 = allSharks();
        var actSet = {}, acts = [];
        for (var ai = 0; ai < all0.length; ai++) {
          var aa = all0[ai].act;
          if (!actSet[aa]) { actSet[aa] = true; acts.push(aa); }
        }
        acts.sort(function (x, y2) { return x - y2; });

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

      // 8. Rev 7: old-save (v1) fixture survives migration with data intact
      var oldSave = {
        v: 1, coins: 5000, xp: 3400, level: 5, selected: 'mako',
        sharks: {
          reef: { owned: true, up: { bite: 1, speed: 0, boost: 0, power: 0 } },
          mako: { owned: true, up: { bite: 2, speed: 1, boost: 0, power: 0 } }
        },
        best: { score: 900, biggestTier: 3 },
        runs: 12, tutorialDone: true, lastBonusDay: '2026-08-01'
      };
      var kitOld = stubKit();
      kitOld.save.set(oldSave);
      var migrated1 = load(kitOld);
      ok(migrated1.v === SAVE_VERSION, 'v1 fixture migrates to current SAVE_VERSION');
      ok(migrated1.coins === 5000, 'v1->v2 migration preserves coins');
      ok(migrated1.xp === 3400, 'v1->v2 migration preserves xp');
      ok(migrated1.level === 5, 'v1->v2 migration preserves level');
      ok(migrated1.selected === 'mako', 'v1->v2 migration preserves selected shark');
      ok(migrated1.sharks.mako && migrated1.sharks.mako.owned === true && migrated1.sharks.mako.up.bite === 2,
        'v1->v2 migration preserves owned sharks and upgrade levels');
      ok(migrated1.best.score === 900 && migrated1.best.biggestTier === 3, 'v1->v2 migration preserves best');
      ok(migrated1.runs === 12, 'v1->v2 migration preserves runs');
      ok(migrated1.gems === 0, 'v1->v2 migration backfills gems to 0');
      ok(isPlainObj(migrated1.relics), 'v1->v2 migration backfills a relics object');
      var zidsChk = zoneIds();
      for (var zci = 0; zci < zidsChk.length; zci++) {
        ok(Array.isArray(migrated1.relics[zidsChk[zci]]) && migrated1.relics[zidsChk[zci]].length === 3
          && migrated1.relics[zidsChk[zci]].every(function (b) { return b === false; }),
          'v1->v2 migration backfills relics[' + zidsChk[zci] + '] to [false,false,false]');
      }
      ok(Array.isArray(migrated1.skins.owned) && migrated1.skins.owned.length === 0 && migrated1.skins.selectedSkin === null,
        'v1->v2 migration backfills empty skins');
      ok(Array.isArray(migrated1.missions.active) && migrated1.missions.active.length === 0,
        'v1->v2 migration backfills empty active missions');
      ok(validateSave(migrated1), 'migrated v1->v2 profile validates');

      // 8b. Rev 12: v2 fixture migrates to v3 (levels save schema), everything
      // else preserved untouched.
      var oldSave2 = {
        v: 2, coins: 8000, xp: 4200, level: 6, selected: 'mako',
        sharks: {
          reef: { owned: true, up: { bite: 0, speed: 0, boost: 0, power: 0 } },
          mako: { owned: true, up: { bite: 3, speed: 1, boost: 0, power: 0 } }
        },
        best: { score: 2200, biggestTier: 5 },
        runs: 30, tutorialDone: true, lastBonusDay: '2026-08-10',
        gems: 42,
        relics: defaultRelics(),
        skins: { owned: [], selectedSkin: null },
        missions: { active: [], progress: {}, completed: {} }
      };
      var kitOld2 = stubKit();
      kitOld2.save.set(oldSave2);
      var migrated2 = load(kitOld2);
      ok(migrated2.v === SAVE_VERSION, 'v2 fixture migrates to current SAVE_VERSION (3)');
      ok(migrated2.coins === 8000 && migrated2.xp === 4200 && migrated2.level === 6,
        'v2->v3 migration preserves coins/xp/level');
      ok(migrated2.selected === 'mako', 'v2->v3 migration preserves selected shark');
      ok(migrated2.sharks.mako && migrated2.sharks.mako.up.bite === 3,
        'v2->v3 migration preserves owned sharks and upgrades');
      ok(migrated2.best.score === 2200 && migrated2.runs === 30, 'v2->v3 migration preserves best/runs');
      ok(migrated2.gems === 42, 'v2->v3 migration preserves gems');
      ok(isPlainObj(migrated2.levels), 'v2->v3 migration backfills a levels object');
      ok(typeof migrated2.selectedLevel === 'string' && !!migrated2.levels[migrated2.selectedLevel],
        'v2->v3 migration backfills a valid selectedLevel');
      ok(migrated2.levels[migrated2.selectedLevel].unlocked === true,
        'v2->v3 migration unlocks the default/selected level');
      ok(validateSave(migrated2), 'migrated v2->v3 profile validates');

      // 8c. Rev 12: level select / unlock / best round-trip
      var pL = defaultProfile();
      var firstLv = firstLevelId();
      ok(pL.levels[firstLv] && pL.levels[firstLv].unlocked === true, 'default profile starts with the first level unlocked');
      ok(levelUnlocked(pL, firstLv) === true, 'levelUnlocked reports the starter level unlocked');
      ok(levelBest(pL, 'no-such-level') === 0, 'levelBest is 0 for an unknown level');
      var kitL = stubKit();
      var ctxL1 = { kit: kitL, save: pL, level: firstLv, run: { score: 300, coins: 10, xp: 5, biggestTier: 1 } };
      endRun(ctxL1);
      ok(pL.levels[firstLv].best === 300, 'endRun records the per-level best score');
      var ctxL2 = { kit: kitL, save: pL, level: firstLv, run: { score: 100, coins: 10, xp: 5, biggestTier: 1 } };
      endRun(ctxL2);
      ok(pL.levels[firstLv].best === 300, 'endRun does not lower an existing per-level best');
      var otherIds = levelIds();
      if (otherIds.length > 1) {
        var second = otherIds[1];
        ok(levelUnlocked(pL, second) === false, 'a second level starts locked');
        var selLocked = selectLevel(pL, second);
        ok(!selLocked.ok && selLocked.reason === 'locked', 'selectLevel refuses a locked level');
        pL.coins = 1e9; // enough to cover any coin-gated level's unlock cost
        var unlockRes = unlockLevel(kitL, pL, second);
        ok(unlockRes.ok, 'unlockLevel succeeds on a recognised level');
        ok(levelUnlocked(pL, second) === true, 'unlockLevel marks the level unlocked');
        var selOk = selectLevel(pL, second);
        ok(selOk.ok && pL.selectedLevel === second, 'selectLevel switches the profile selection');
        var alreadyRes = unlockLevel(kitL, pL, second);
        ok(alreadyRes.ok && alreadyRes.already === true, 'unlockLevel is idempotent on an already-unlocked level');
      }
      var selUnknown = selectLevel(pL, 'totally-not-a-level');
      ok(!selUnknown.ok, 'selectLevel refuses an unrecognised level id');

      // 9. gem accounting: spendGems/addGems single authority
      var pG = defaultProfile();
      ok(addGems(pG, 10) === 10, 'addGems credits and returns new total');
      ok(addGems(pG, 3) === 13, 'addGems accumulates');
      var spendOk = spendGems(null, pG, 5, 'test');
      ok(spendOk.ok && pG.gems === 8, 'spendGems deducts on success');
      var spendFail = spendGems(null, pG, 999, 'test');
      ok(!spendFail.ok && spendFail.reason === 'gems' && pG.gems === 8, 'spendGems refuses and does not mutate on insufficient gems');
      ok(addGems(pG, -50) === 8, 'addGems ignores a negative amount');

      // skin buy/select via gems
      var skinsList = (RFD && RFD.SKINS) || [];
      var globalSkin = null;
      for (var sgi = 0; sgi < skinsList.length; sgi++) if (!skinsList[sgi].sharkId) { globalSkin = skinsList[sgi]; break; }
      ok(!!globalSkin, 'found a global (any-shark) skin for the skin test');
      if (globalSkin) {
        var pS = defaultProfile();
        pS.gems = globalSkin.cost + 5;
        var buyRes = buySkin(null, pS, globalSkin.id);
        ok(buyRes.ok && pS.skins.owned.indexOf(globalSkin.id) >= 0 && pS.gems === 5, 'buySkin spends gems and grants ownership');
        var rebuy = buySkin(null, pS, globalSkin.id);
        ok(!rebuy.ok && rebuy.reason === 'owned', 'buySkin refuses to rebuy an owned skin');
        var selRes2 = selectSkin(null, pS, globalSkin.id);
        ok(selRes2.ok && pS.skins.selectedSkin === globalSkin.id, 'selectSkin selects an owned skin');
        var selFail = selectSkin(null, pS, 'skin_not_owned_xyz');
        ok(!selFail.ok && selFail.reason === 'not-owned', 'selectSkin refuses an unowned skin');
      }

      // 10. mission roll / progress / complete
      var pM = defaultProfile();
      var picked = rollMissions(pM, function () { return 0.42; });
      ok(Array.isArray(picked) && picked.length === Math.min(ACTIVE_MISSIONS_N, ((RFD && RFD.MISSIONS) || []).length),
        'rollMissions picks up to ' + ACTIVE_MISSIONS_N + ' active missions');
      ok(pM.missions.active.length === picked.length, 'rollMissions writes profile.missions.active');
      for (var pmi = 0; pmi < picked.length; pmi++) {
        ok(pM.missions.progress[picked[pmi]] === 0, 'rollMissions initializes progress to 0 for ' + picked[pmi]);
      }

      // find an eatCount mission with no defId restriction to drive to completion
      var anyEatMission = null;
      var allMissions = (RFD && RFD.MISSIONS) || [];
      for (var ami = 0; ami < allMissions.length; ami++) {
        if (allMissions[ami].type === 'eatCount' && allMissions[ami].target.defId == null) { anyEatMission = allMissions[ami]; break; }
      }
      ok(!!anyEatMission, 'found an any-prey eatCount mission for the progress test');
      if (anyEatMission) {
        var pM2 = defaultProfile();
        pM2.missions.active = [anyEatMission.id];
        pM2.missions.progress[anyEatMission.id] = 0;
        var ctxM = { save: pM2, run: {} };
        var completed = [];
        for (var ei = 0; ei < anyEatMission.target.n; ei++) {
          completed = missionEvent(ctxM, 'eat', { defId: 'reeffish' });
        }
        ok(pM2.missions.progress[anyEatMission.id] === anyEatMission.target.n, 'missionEvent increments eatCount progress to target');
        ok(pM2.missions.completed[anyEatMission.id] === true, 'missionEvent marks the mission completed');
        ok(completed.indexOf(anyEatMission.id) >= 0, 'missionEvent returns the just-completed mission id');
        ok(ctxM.run.gems === anyEatMission.gems, 'missionEvent credits ctx.run.gems with the mission reward');
        ok(ctxM.run.missionResults.length === 1 && ctxM.run.missionResults[0].id === anyEatMission.id,
          'missionEvent records a missionResults entry');
        // further eat events must not double-award
        missionEvent(ctxM, 'eat', { defId: 'reeffish' });
        ok(ctxM.run.gems === anyEatMission.gems, 'a completed mission does not re-award on further matching events');
      }

      // findRelic mission progress
      var anyRelicMission = null;
      for (var ari = 0; ari < allMissions.length; ari++) {
        if (allMissions[ari].type === 'findRelic' && allMissions[ari].target.zoneId == null && allMissions[ari].target.n === 1) { anyRelicMission = allMissions[ari]; break; }
      }
      if (anyRelicMission) {
        var pM3 = defaultProfile();
        pM3.missions.active = [anyRelicMission.id];
        var ctxM3 = { save: pM3, run: {} };
        var comp3 = missionEvent(ctxM3, 'relic', { zoneId: 1 });
        ok(comp3.indexOf(anyRelicMission.id) >= 0, 'missionEvent completes a findRelic mission on a relic event');
      }

      // 11. relic set unlock via endRun (relicFinds + relicSetCount + secret shark)
      var secretList = (RFD && RFD.SECRET_SHARKS) || [];
      ok(secretList.length > 0, 'RFD.SECRET_SHARKS has at least one gated shark for the unlock test');
      if (secretList.length) {
        var lowestGate = secretList[0];
        for (var sli = 1; sli < secretList.length; sli++) if (secretList[sli].relicSets < lowestGate.relicSets) lowestGate = secretList[sli];
        var zidsAll = zoneIds();
        ok(zidsAll.length >= lowestGate.relicSets, 'enough zones exist to satisfy the lowest relicSets gate');

        var pR = defaultProfile();
        var kitR2 = stubKit();
        ok(reallyOwned(pR, lowestGate.sharkId) === false, 'the secret shark starts unowned');

        // Complete relicSets zones worth of relic finds across separate runs
        // (each run only reports the finds made during that run).
        for (var zsi = 0; zsi < lowestGate.relicSets; zsi++) {
          var zid = zidsAll[zsi];
          var zoneRelics2 = relicsByZone(zid);
          ok(zoneRelics2.length === 3, 'zone ' + zid + ' has exactly 3 relics in the table');
          var runFinds = zoneRelics2.map(function (r) { return { relicId: r.id, zoneId: zid }; });
          var resR = endRun({ kit: kitR2, save: pR, run: { score: 1, coins: 0, xp: 0, relics: runFinds } });
          var gotZoneUnlock = resR.relicUnlocks.some(function (u) { return u.type === 'relicSet' && String(u.zoneId) === String(zid); });
          ok(gotZoneUnlock, 'endRun reports a relicSet unlock the run a zone reaches 3/3 (zone ' + zid + ')');
        }
        ok(relicSetCount(pR) === lowestGate.relicSets, 'relicSetCount matches the number of completed zones');
        ok(reallyOwned(pR, lowestGate.sharkId) === true, 'the secret shark auto-unlocks once its relicSets threshold is met');

        // completing the same zone set again must not re-report the unlock
        var zid0 = zidsAll[0];
        var resAgain = endRun({ kit: kitR2, save: pR, run: { score: 1, coins: 0, xp: 0, relics: relicsByZone(zid0).map(function (r) { return { relicId: r.id, zoneId: zid0 }; }) } });
        var reReported = resAgain.relicUnlocks.some(function (u) { return u.type === 'relicSet' && String(u.zoneId) === String(zid0); });
        ok(!reReported, 'an already-complete relic set is not re-reported as a new unlock');
      }

      // 12. gems flow through endRun (frenzy + daily + mission)
      var pE = defaultProfile();
      var kitE = stubKit();
      var gemsCfgChk = (RFD && RFD.GEMS) || { frenzy: { goldrush: 0, blood: 0, school: 0 }, daily: 0 };
      var resE = endRun({
        kit: kitE, save: pE,
        run: {
          score: 10, coins: 0, xp: 0,
          gems: 2, missionResults: [{ id: 'x', name: 'x', gems: 2 }],
          frenzyCompletions: { goldrush: 1, blood: 1, school: 0 }
        }
      });
      var expectFrenzy = (gemsCfgChk.frenzy.goldrush || 0) + (gemsCfgChk.frenzy.blood || 0);
      var expectDaily = gemsCfgChk.daily || 0; // first run of the day
      ok(resE.gems === 2 + expectFrenzy + expectDaily, 'endRun totals mission + frenzy + daily gems');
      ok(pE.gems === resE.gems, 'endRun credits total gems to the profile');
      ok(resE.gemsBreakdown.missions === 2 && resE.gemsBreakdown.frenzy === expectFrenzy && resE.gemsBreakdown.daily === expectDaily,
        'endRun reports a gems breakdown by source');
      ok(resE.missionResults.length === 1 && resE.missionResults[0].id === 'x', 'endRun payload carries missionResults through');
      ok(validateSave(kitE.save.get(null)), 'record persisted by endRun with gems/relics/skins/missions validates');

      // 13. B4: Meta.endRun is re-entrant-safe -- calling it twice on the SAME
      // run bag must settle exactly once. A retry/restore/future UI path can
      // call the public endRun again; the second call must return the
      // identical cached payload and must not touch the profile a second
      // time (no double coins/xp/gems/runs/daily/frenzy).
      var pF = defaultProfile();
      var kitF = stubKit();
      var runF = {
        score: 250, coins: 100, xp: 50, biggestTier: 3, comboPeak: 7,
        gems: 3, missionResults: [{ id: 'y', name: 'y', gems: 3 }],
        frenzyCompletions: { goldrush: 1, blood: 0, school: 1 }
      };
      var firstF = endRun({ kit: kitF, save: pF, run: runF });
      var coinsAfterFirst = pF.coins, xpAfterFirst = pF.xp, gemsAfterFirst = pF.gems,
        runsAfterFirst = pF.runs, dayAfterFirst = pF.lastBonusDay;
      var secondF = endRun({ kit: kitF, save: pF, run: runF });
      ok(JSON.stringify(firstF) === JSON.stringify(secondF),
        'B4: a second endRun call on the same run bag returns the identical cached payload');
      ok(secondF === firstF, 'B4: the second call returns the exact same cached object, not a recomputation');
      ok(pF.coins === coinsAfterFirst && pF.xp === xpAfterFirst && pF.gems === gemsAfterFirst &&
        pF.runs === runsAfterFirst && pF.lastBonusDay === dayAfterFirst,
        'B4: profile (coins/xp/gems/runs/daily) is unchanged by the second call -- no double payout');
      ok(pF.runs === 1, 'B4: runs incremented exactly once across both calls');
      ok(runF.__metaSettled === true, 'B4: the run bag is stamped with a settlement token on first call');
      // A THIRD call, and one against a run bag whose engine `running` flag
      // (a field this primitive intentionally never reads) has been reset to
      // simulate a bypassed/absent engine guard, both still short-circuit.
      runF.running = false;
      var thirdF = endRun({ kit: kitF, save: pF, run: runF });
      ok(thirdF === firstF, 'B4: a third call (with run.running reset) still returns the cached result, not a fresh recompute');
      ok(pF.runs === 1, 'B4: a third call still does not re-increment runs');

      // Pantheon/Underworld: actName covers acts 4-5, not just the old 3.
      ok(actName(1) === 'Real Sharks' && actName(2) === 'Monsters' && actName(3) === 'Legends',
        'actName: acts 1-3 unchanged');
      ok(actName(4) === 'Pantheon', 'actName: act 4 is Pantheon');
      ok(actName(5) === 'Underworld', 'actName: act 5 is Underworld');
      var allSChk = allSharks();
      ok(allSChk.length === 85, 'roster carries all 85 sharks (61 base + 24 Pantheon/Underworld)');
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

    spendGems: spendGems,
    addGems: addGems,
    buySkin: buySkin,
    selectSkin: selectSkin,
    relicSetCount: relicSetCount,
    secretSharkUnlocked: secretSharkUnlocked,
    unlockSecretSharkWithGems: unlockSecretSharkWithGems,
    rollMissions: rollMissions,
    missionEvent: missionEvent,

    levelIds: levelIds,
    levelById: levelById,
    firstLevelId: firstLevelId,
    levelBest: levelBest,
    levelUnlocked: levelUnlocked,
    unlockLevel: unlockLevel,
    selectLevel: selectLevel,

    scenes: null,
    UI: UI,
    __selftest: __selftest
  };

  Meta.scenes = buildScenes();

  RF.Meta = Meta;
  RF.DevMode = DevMode;
}());
