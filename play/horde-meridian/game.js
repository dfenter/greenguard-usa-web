/* Horde Meridian — game.js
 * Phaser 3 survivors-genre run game. Portrait. GGKit owns lifecycle/audio/input.
 *
 * Architecture notes for future maintainers:
 *  - EVERYTHING is pooled: enemies, gems, shots, particles, damage texts. The
 *    hot loop performs zero allocations; vectors are scratch objects reused.
 *  - Systems are plain functions over pool arrays, not Phaser Groups with
 *    physics. Collision is a uniform spatial hash rebuilt once per frame.
 *  - Sim runs on a fixed 60 Hz accumulator so feel is frame-rate independent
 *    and hit-stop can freeze the COSMETIC clock without skipping sim steps
 *    (ART_DIRECTION rule 5).
 *  - Preserved run-1 fixes, by name:
 *      * GEM GROWTH CAP  — see dropGem(): live gem count is hard-capped and
 *        the oldest gems are recycled, never allowed to grow unbounded.
 *      * RESTART INPUT-STATE CLEARING — GGKit.restart() clears input before
 *        onRestart fires; resetRun() additionally zeroes the local stick.
 *      * PER-POINTER IDENTITY — movement stick binds one pointerId and
 *        ignores every other pointer (kit.input carries the identity map).
 */
(function () {
  'use strict';

  var HM_DATA = window.__HM_DATA;
  var TAU = Math.PI * 2;
  var WORLD = 12600;             // three-times the authored arena footprint
  var EDGE = WORLD / 2 - 40;
  var REGION_WIDTH = WORLD / 5;
  var STEP = 1 / 60;             // fixed sim step
  var MAX_STEPS = 4;             // hard catch-up cap; covers ~15fps devices without backlog
  var RUN_SECONDS = 600;         // 10 minutes -> boss
  var MAX_ENEMIES = 260;
  var MAX_GEMS = 220;            // GEM GROWTH CAP: hard ceiling on live gems
  var MAX_BONUS_PICKUPS = HM_DATA.DROP_TUNING.fieldCap;
  var MAX_WEAPON_DROPS = 5;      // weapon drops use their own framed pickup lane
  var BONUS_DROP_CAP = HM_DATA.DROP_TUNING.cap;
  var WEAPON_DROP_CAP = 24;  // owner: 'weapon drops are non existent amp it up'
  var MAX_SHOTS = 160;           // one shared lane for all three weapon slots; hard live cap
  var PROJECTILE_SOFT_CAP = Math.floor(MAX_SHOTS * 0.85);
  var MAX_EBOLTS = 160;
  var MAX_TEXTS = 40;
  var MAX_MINIMAP_DOTS = 32;
  var MAX_LANDMARKS = 28;        // recycled between authored worlds
  var CELL = 96;                 // spatial hash cell size
  var TIDE_DROP_GAP = 90;        // one rescue pickup can land per 90 seconds
  var TIDE_CAP_FRACTION = 0.38;  // Purge-style per-target cap for tide damage

  var WING_SLOTS = HM_DATA.WING_SLOTS;
  var BASE_TYPES = HM_DATA.BASE_TYPES;
  var BASE_SCHEDULE = HM_DATA.BASE_SCHEDULE;
  var REGIONS = HM_DATA.REGIONS;
  var REGION_ANCHORS = HM_DATA.REGION_ANCHORS;
  var REGION_BY_KEY = HM_DATA.REGION_BY_KEY;
  var regionIndexAtX = HM_DATA.regionIndexAtX;
  var regionAtX = HM_DATA.regionAtX;
  var noise01 = HM_DATA.noise01;
  var FONT_DISPLAY = HM_DATA.FONT_DISPLAY;
  var FONT_BODY = HM_DATA.FONT_BODY;
  var TYPE = HM_DATA.TYPE;
  var LINE = HM_DATA.LINE;
  var SAFE = HM_DATA.SAFE;
  var readSafeArea = HM_DATA.readSafeArea;
  var FAMILY = HM_DATA.FAMILY;
  var WAVES = HM_DATA.WAVES;
  var BONUS = HM_DATA.BONUS;
  var BONUS_BUFFS = HM_DATA.BONUS_BUFFS;
  var BONUS_TIMED = HM_DATA.BONUS_TIMED;
  var BONUS_DEBUG_KEYS = HM_DATA.BONUS_DEBUG_KEYS;
  var BONUS_BY_KEY = HM_DATA.BONUS_BY_KEY;
  var TIDE_TURNERS = HM_DATA.TIDE_TURNERS;
  var TIDE_BY_KEY = HM_DATA.TIDE_BY_KEY;
  var TIDE_HUD = HM_DATA.TIDE_HUD;
  var WEAPONS = HM_DATA.WEAPONS;
  var WEAPON_BY_KEY = HM_DATA.WEAPON_BY_KEY;
  var UPGRADES = HM_DATA.UPGRADES;
  var UPGRADE_BY_KEY = HM_DATA.UPGRADE_BY_KEY;
  var RARITY_STYLE = HM_DATA.RARITY_STYLE;
  var META = HM_DATA.META;
  var META_BY_KEY = HM_DATA.META_BY_KEY;
  var HANGAR_TRACKS = HM_DATA.HANGAR_TRACKS;
  var HANGAR_BY_KEY = HM_DATA.HANGAR_BY_KEY;
  var HULL_PAINTS = HM_DATA.HULL_PAINTS;
  var PAINT_BY_KEY = HM_DATA.PAINT_BY_KEY;
  var TRIMS = HM_DATA.TRIMS;
  var TRIM_BY_KEY = HM_DATA.TRIM_BY_KEY;
  var HULL_FRAMES = HM_DATA.HULL_FRAMES;
  var FRAME_BY_KEY = HM_DATA.FRAME_BY_KEY;
  var PROFILE_VERSION = HM_DATA.PROFILE_VERSION;
  var BANK_RATE = HM_DATA.BANK_RATE;
  var REGION_ENEMIES = HM_DATA.REGION_ENEMIES;
  var REGION_ENEMY_BY_KEY = HM_DATA.REGION_ENEMY_BY_KEY;
  var REGION_BOSSES = HM_DATA.REGION_BOSSES;
  var REGION_BOSS_BY_KEY = HM_DATA.REGION_BOSS_BY_KEY;
  var REGION_BOSS_BY_BOSS_KEY = HM_DATA.REGION_BOSS_BY_BOSS_KEY;
  var REGION_WEAPON_KEYS = HM_DATA.REGION_WEAPON_KEYS;
  var REGION_BOSS_SCHEDULE = HM_DATA.REGION_BOSS_SCHEDULE;
  var DROP_TUNING = HM_DATA.DROP_TUNING;
  var OPENING_BEATS = HM_DATA.OPENING_BEATS;
  var ARSENAL_III = HM_DATA.ARSENAL_III;
  var ATLAS_FRAME_MAP = HM_DATA.ATLAS_FRAME_MAP;
  function makeDefaultHangar() {
    var tiers = {};
    for (var i = 0; i < HANGAR_TRACKS.length; i++) tiers[HANGAR_TRACKS[i].key] = 0;
    return {
      balance: 0, tiers: tiers, equippedWeapon: 'bolt-lance',
      weaponsSeen: { 'bolt-lance': true }, paint: 'teal', trim: 'mint', frame: 'classic'
    };
  }
  function makeDefaultCampaign() {
    return { unlocked: 1, stars: {}, bestTimes: {} };
  }
  function makeDefaultProfile() {
    return { version: PROFILE_VERSION, best: 0, meta: {}, runs: 0, tutorialDone: false,
      hangar: makeDefaultHangar(), campaign: makeDefaultCampaign() };
  }

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function mixColor(a, b, t) {
    var ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
    var br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
    return (Math.round(ar + (br - ar) * t) << 16) |
      (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
  }
  function fmtTime(s) {
    var t = Math.max(0, Math.floor(s));
    return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
  }

  function clearHashBucket(arr) { arr.length = 0; }

  // Spread offsets are shared by every weapon lane. Build them once so
  // Arsenal III firing does not recreate centered/fan arithmetic per shot.
  var SHOT_PATTERNS = [];
  for (var patternCount = 1; patternCount <= 12; patternCount++) {
    var centered = [], normalized = [];
    for (var patternIndex = 0; patternIndex < patternCount; patternIndex++) {
      var centeredOffset = patternIndex - (patternCount - 1) / 2;
      centered.push(centeredOffset);
      normalized.push(centeredOffset / Math.max(1, patternCount - 1));
    }
    SHOT_PATTERNS[patternCount] = { centered: centered, normalized: normalized };
  }
  var ARSENAL_SLOT_PATTERNS = [
    { damage: 1, cadence: 1 },
    { damage: 0.55, cadence: 0.90 },
    { damage: 0.35, cadence: 0.84 }
  ];

  var _seed = 0x4d657269;
  function srand() {
    _seed = (_seed + 0x6D2B79F5) | 0;
    var t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function resetSeed() { _seed = 0x4d657269; }

  (function sanitizePrefs() {
    var specs = [
      ['gg-horde-meridian-audio', { mute: 'boolean', music: 'unit', sfx: 'unit' }],
      ['gg-horde-meridian-ui', { juice: 'boolean' }]
    ];
    for (var i = 0; i < specs.length; i++) {
      var key = specs[i][0], shape = specs[i][1], raw = null;
      try { raw = localStorage.getItem(key); } catch (e) { continue; }
      if (raw == null) continue;
      var ok = false, obj = null;
      try { obj = JSON.parse(raw); } catch (e) { obj = null; }
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        ok = true;
        for (var k in shape) {
          if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
          var v = obj[k];
          if (shape[k] === 'boolean' && typeof v !== 'boolean') { ok = false; break; }
          if (shape[k] === 'unit' && (typeof v !== 'number' || !isFinite(v) || v < 0 || v > 1)) { ok = false; break; }
        }
      }
      if (!ok) { try { localStorage.removeItem(key); } catch (e) {} }
    }
  }());

  var kit = GGKit.create({
    slug: 'horde-meridian',
    orientation: 'portrait',
    validateSave: function (o) {
      function counter(v, max) {
        return typeof v === 'number' && isFinite(v) && Math.floor(v) === v &&
          v >= 0 && v <= max;
      }
      if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
      if (o.version == null) {
        if (!counter(o.gems, 1e9)) return false;
        if (!counter(o.best, 1e9)) return false;
      } else if (o.version !== PROFILE_VERSION && o.version !== 2) return false;
      if (!counter(o.best, 1e9)) return false;
      if (!o.meta || typeof o.meta !== 'object' || Array.isArray(o.meta)) return false;
      var keys = Object.getOwnPropertyNames(o.meta);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (!Object.prototype.hasOwnProperty.call(META_BY_KEY, k)) return false;
        if (!counter(o.meta[k], META_BY_KEY[k].max)) return false;
      }
      if (o.runs != null && !counter(o.runs, 1e9)) return false;
      if (o.tutorialDone != null && typeof o.tutorialDone !== 'boolean') return false;
      if (o.version == null) return true;
      var h = o.hangar;
      if (!h || typeof h !== 'object' || Array.isArray(h) || !counter(h.balance, 1e9)) return false;
      if (!HANGAR_BY_KEY || !h.tiers || typeof h.tiers !== 'object' || Array.isArray(h.tiers)) return false;
      var tierKeys = Object.getOwnPropertyNames(h.tiers);
      for (var ti = 0; ti < tierKeys.length; ti++) {
        var tk = tierKeys[ti];
        if (!Object.prototype.hasOwnProperty.call(HANGAR_BY_KEY, tk)) return false;
        if (!counter(h.tiers[tk], HANGAR_BY_KEY[tk].max)) return false;
      }
      for (var ti2 = 0; ti2 < HANGAR_TRACKS.length; ti2++) {
        var requiredTier = HANGAR_TRACKS[ti2].key;
        if (h.tiers[requiredTier] == null && requiredTier === 'gunDeck') continue;
        if (!counter(h.tiers[requiredTier], HANGAR_TRACKS[ti2].max)) return false;
      }
      if (!WEAPON_BY_KEY[h.equippedWeapon]) return false;
      if (!h.weaponsSeen || typeof h.weaponsSeen !== 'object' || Array.isArray(h.weaponsSeen)) return false;
      var seenKeys = Object.getOwnPropertyNames(h.weaponsSeen);
      for (var si = 0; si < seenKeys.length; si++) {
        if (!WEAPON_BY_KEY[seenKeys[si]] || h.weaponsSeen[seenKeys[si]] !== true) return false;
      }
      if (h.weaponsSeen[h.equippedWeapon] !== true) return false;
      if (!PAINT_BY_KEY[h.paint] || !TRIM_BY_KEY[h.trim] || !FRAME_BY_KEY[h.frame]) return false;
      if (o.campaign != null) {
        var cg = o.campaign;
        if (typeof cg !== 'object' || Array.isArray(cg)) return false;
        if (!counter(cg.unlocked, 9) || cg.unlocked < 1) return false;
        if (!cg.stars || typeof cg.stars !== 'object' || Array.isArray(cg.stars)) return false;
        if (!cg.bestTimes || typeof cg.bestTimes !== 'object' || Array.isArray(cg.bestTimes)) return false;
        var cgKeys = Object.getOwnPropertyNames(cg.stars);
        for (var cgi = 0; cgi < cgKeys.length; cgi++) {
          var cgk = Number(cgKeys[cgi]);
          if (!counter(cgk, 9) || cgk < 1 || !counter(cg.stars[cgKeys[cgi]], 3)) return false;
        }
        var btKeys = Object.getOwnPropertyNames(cg.bestTimes);
        for (var bti = 0; bti < btKeys.length; bti++) {
          var btk = Number(btKeys[bti]);
          if (!counter(btk, 9) || btk < 1 || !counter(cg.bestTimes[btKeys[bti]], 36000)) return false;
        }
      } else if (o.version === PROFILE_VERSION) return false;
      return true;
    },
    onPause: function () { if (Game.scene) Game.scene.setPaused(true); },
    onResume: function () { if (Game.scene) Game.scene.setPaused(false); },
    onRestart: function () { if (Game.scene) Game.scene.hardRestart(); }
  });

  var DEFAULT_PROFILE = makeDefaultProfile();
  var profile = kit.save.get(null);
  var didMigrate = false;
  if (!profile) profile = JSON.parse(JSON.stringify(DEFAULT_PROFILE));
  if (profile.version == null) {
    var migrated = makeDefaultProfile();
    migrated.best = profile.best || 0;
    migrated.meta = profile.meta || {};
    migrated.runs = profile.runs || 0;
    migrated.tutorialDone = !!profile.tutorialDone;
    migrated.hangar.balance = profile.gems || 0;
    profile = migrated;
    didMigrate = true;
  }
  if (profile.version === 2) {
    profile.version = PROFILE_VERSION;
    profile.campaign = makeDefaultCampaign();
    didMigrate = true;
  }
  if (!profile.campaign) { profile.campaign = makeDefaultCampaign(); didMigrate = true; }
  if (typeof profile.runs !== 'number') profile.runs = 0;
  if (typeof profile.tutorialDone !== 'boolean') profile.tutorialDone = false;
  if (!profile.hangar) profile.hangar = makeDefaultHangar();
  if (profile.hangar.tiers.gunDeck == null) { profile.hangar.tiers.gunDeck = 0; didMigrate = true; }
  if (!profile.hangar.weaponsSeen['bolt-lance']) profile.hangar.weaponsSeen['bolt-lance'] = true;
  if (!profile.hangar.equippedWeapon || !profile.hangar.weaponsSeen[profile.hangar.equippedWeapon]) {
    profile.hangar.equippedWeapon = 'bolt-lance';
  }
  function saveProfile() { kit.save.set(profile); }
  function metaLevel(key) { return profile.meta[key] || 0; }
  function hangarLevel(key) { return profile.hangar.tiers[key] || 0; }
  function hangarBalance() { return profile.hangar.balance; }
  function markWeaponSeen(key) {
    if (!WEAPON_BY_KEY[key] || profile.hangar.weaponsSeen[key]) return;
    profile.hangar.weaponsSeen[key] = true;
    saveProfile();
  }

  // ---------------------------------------------------------------------------
  // Campaign framework. Level definitions are fully declarative files under
  // levels/ (see LEVELS_SPEC.md, the binding contract). Each is validated here
  // at boot; a malformed level is excluded with a console warning rather than
  // shipped broken.
  var CAMPAIGN_MAX_LEVELS = 9;
  function validEnemyKey(k) {
    return (Object.prototype.hasOwnProperty.call(FAMILY, k) && k !== 'boss') ||
      Object.prototype.hasOwnProperty.call(REGION_ENEMY_BY_KEY, k);
  }
  function inRange(v, a, b) { return typeof v === 'number' && isFinite(v) && v >= a && v <= b; }
  function isInt(v, a, b) { return inRange(v, a, b) && Math.floor(v) === v; }
  function upperStr(v, max) { return typeof v === 'string' && v.length > 0 && v.length <= max; }
  function validateLevel(def, id) {
    function bad(msg) { try { console.warn('[hm campaign] level ' + id + ' rejected: ' + msg); } catch (e) {} return null; }
    if (!def || typeof def !== 'object') return bad('not an object');
    if (def.id !== id) return bad('id mismatch');
    if (!upperStr(def.key, 40) || !upperStr(def.name, 18) || !upperStr(def.tagline, 34)) return bad('name/key/tagline');
    if (!Array.isArray(def.briefing) || def.briefing.length < 1 || def.briefing.length > 3) return bad('briefing');
    for (var bi = 0; bi < def.briefing.length; bi++) if (!upperStr(def.briefing[bi], 44)) return bad('briefing line');
    if (!REGION_BY_KEY[def.region]) return bad('region ' + def.region);
    if (!isInt(def.duration, 120, 560)) return bad('duration');
    if (!Array.isArray(def.waves) || def.waves.length < 3 || def.waves.length > 14) return bad('waves length');
    var lastAt = -1;
    for (var wi = 0; wi < def.waves.length; wi++) {
      var row = def.waves[wi];
      if (!row || !inRange(row.at, 0, def.duration) || row.at <= lastAt) return bad('wave at ' + wi);
      if (wi === 0 && row.at !== 0) return bad('first wave at != 0');
      lastAt = row.at;
      if (!inRange(row.rate, 0.22, 1.4) || !isInt(row.pack, 1, 5)) return bad('wave rate/pack ' + wi);
      if (!Array.isArray(row.pool) || !row.pool.length || row.pool.length > 8) return bad('wave pool ' + wi);
      for (var pi = 0; pi < row.pool.length; pi++) if (!validEnemyKey(row.pool[pi])) return bad('pool key ' + row.pool[pi]);
    }
    var mods = def.mods || {};
    var modKeys = ['enemyHp', 'enemyDmg', 'enemySpeed', 'spawnRate', 'xp'];
    for (var mi2 = 0; mi2 < modKeys.length; mi2++) {
      var mv = mods[modKeys[mi2]];
      if (mv != null && !inRange(mv, 0.5, 2.5)) return bad('mods.' + modKeys[mi2]);
    }
    var bases = def.bases || [];
    if (!Array.isArray(bases) || bases.length > 6) return bad('bases');
    for (var bi2 = 0; bi2 < bases.length; bi2++) {
      var bs = bases[bi2];
      if (!bs || !BASE_TYPES[bs.type] || !inRange(bs.at, 0, def.duration) ||
          !inRange(bs.x, -6100, 6100) || !inRange(bs.y, -2400, 2400)) return bad('base ' + bi2);
    }
    var rbs = def.regionBosses || [];
    if (!Array.isArray(rbs) || rbs.length > 5) return bad('regionBosses');
    var rbSeen = {};
    for (var ri = 0; ri < rbs.length; ri++) {
      var rb = rbs[ri];
      if (!rb || !REGION_BOSS_BY_KEY[rb.region] || rbSeen[rb.region] ||
          !inRange(rb.at, 0, def.duration) || !inRange(rb.x, -6200, 6200) || !inRange(rb.y, -2500, 2500)) return bad('regionBoss ' + ri);
      if (rb.hpMul != null && !inRange(rb.hpMul, 0.5, 2.5)) return bad('regionBoss hpMul');
      if (rb.dmgMul != null && !inRange(rb.dmgMul, 0.5, 2.5)) return bad('regionBoss dmgMul');
      rbSeen[rb.region] = true;
    }
    var fb = def.finalBoss || null;
    if (fb) {
      if (fb.type !== 'core' && fb.type !== 'region') return bad('finalBoss type');
      if (fb.type === 'region' && !REGION_BOSS_BY_KEY[fb.region]) return bad('finalBoss region');
      if (fb.at !== 'duration' && !inRange(fb.at, 30, def.duration)) return bad('finalBoss at');
      if (fb.hpMul != null && !inRange(fb.hpMul, 0.5, 3.0)) return bad('finalBoss hpMul');
      if (fb.dmgMul != null && !inRange(fb.dmgMul, 0.5, 3.0)) return bad('finalBoss dmgMul');
      var esc = fb.escorts || [];
      if (!Array.isArray(esc) || esc.length > 2) return bad('escorts');
      for (var ei = 0; ei < esc.length; ei++) if (!REGION_BOSS_BY_KEY[esc[ei]]) return bad('escort ' + esc[ei]);
    }
    if (!Array.isArray(def.objectives) || def.objectives.length < 1 || def.objectives.length > 4) return bad('objectives');
    var objIds = {}, hasBossObj = false, totalBossKills = 0;
    for (var oi = 0; oi < def.objectives.length; oi++) {
      var ob = def.objectives[oi];
      if (!ob || !upperStr(ob.id, 30) || objIds[ob.id] || !upperStr(ob.label, 30)) return bad('objective ' + oi);
      objIds[ob.id] = true;
      if (ob.type === 'survive') {}
      else if (ob.type === 'boss') {
        if (hasBossObj) return bad('multiple boss objectives');
        if (!isInt(ob.count, 1, 6)) return bad('boss count');
        hasBossObj = true; totalBossKills = ob.count;
      }
      else if (ob.type === 'bases') { if (!isInt(ob.count, 1, 6) || ob.count > bases.length) return bad('bases count'); }
      else if (ob.type === 'kills') { if (!isInt(ob.count, 20, 900)) return bad('kills count'); }
      else return bad('objective type ' + ob.type);
    }
    if (fb && !hasBossObj) return bad('finalBoss without boss objective');
    var availableBossKills = rbs.length + (fb ? 1 + (fb.escorts ? fb.escorts.length : 0) : 0);
    if (hasBossObj && totalBossKills > availableBossKills) return bad('boss count exceeds scheduled bosses');
    if (!Array.isArray(def.stars) || def.stars.length !== 3 || !def.stars[0] || def.stars[0].type !== 'win') return bad('stars');
    for (var si2 = 0; si2 < 3; si2++) {
      var st = def.stars[si2];
      if (!st || !upperStr(st.label, 34)) return bad('star label ' + si2);
      if (si2 === 0) continue;
      if (st.type === 'hull') { if (!inRange(st.pct, 10, 90)) return bad('star hull'); }
      else if (st.type === 'time') { if (!inRange(st.under, 30, 3600)) return bad('star time'); }
      else if (st.type === 'kills') { if (!isInt(st.atLeast, 1, 2000)) return bad('star kills'); }
      else if (st.type === 'level') { if (!isInt(st.atLeast, 2, 60)) return bad('star level'); }
      else if (st.type === 'noWingLost') {}
      else return bad('star type ' + st.type);
    }
    var evs = def.events || [];
    if (!Array.isArray(evs) || evs.length > 24) return bad('events');
    var lastEv = -1;
    for (var vi = 0; vi < evs.length; vi++) {
      var ev = evs[vi];
      if (!ev || !inRange(ev.at, 0, def.duration + 120) || ev.at < lastEv) return bad('event at ' + vi);
      lastEv = ev.at;
      if (ev.banner && (!Array.isArray(ev.banner) || ev.banner.length !== 2 ||
          !upperStr(ev.banner[0], 24) || !upperStr(ev.banner[1], 40))) return bad('event banner ' + vi);
      if (ev.spawnPack && (!validEnemyKey(ev.spawnPack.key) || !isInt(ev.spawnPack.count, 1, 12) ||
          (ev.spawnPack.elite != null && typeof ev.spawnPack.elite !== 'boolean'))) return bad('event pack ' + vi);
      if (ev.heat != null && typeof ev.heat !== 'boolean') return bad('event heat ' + vi);
      if (ev.spawnBase && (!BASE_TYPES[ev.spawnBase.type] || !inRange(ev.spawnBase.x, -6100, 6100) ||
          !inRange(ev.spawnBase.y, -2400, 2400))) return bad('event base ' + vi);
      if (ev.grantBonus && !BONUS_BY_KEY[ev.grantBonus]) return bad('event bonus ' + vi);
      if (ev.gems && (!isInt(ev.gems.count, 1, 12) || !isInt(ev.gems.value, 1, 3))) return bad('event gems ' + vi);
      if (ev.callout && !upperStr(ev.callout, 60)) return bad('event callout ' + vi);
    }
    if (def.music != null && def.music !== 'base' && def.music !== 'heat') return bad('music');
    return def;
  }
  var CAMPAIGN_LEVELS = {};
  var CAMPAIGN_LEVEL_COUNT = 0;
  (function loadLevels() {
    var reg = window.__HM_LEVELS || {};
    for (var id = 1; id <= CAMPAIGN_MAX_LEVELS; id++) {
      var def = validateLevel(reg[id], id);
      if (def) { CAMPAIGN_LEVELS[id] = def; CAMPAIGN_LEVEL_COUNT++; }
      else if (!reg[id]) { try { console.warn('[hm campaign] level ' + id + ' missing'); } catch (e) {} }
    }
  }());
  function campaignStars(id) { return profile.campaign.stars[id] || 0; }
  function campaignUnlocked(id) { return id >= 1 && id <= profile.campaign.unlocked; }
  function recordCampaignResult(levelId, won, starCount, time) {
    var cg = profile.campaign;
    if (!won) return;
    if (starCount > (cg.stars[levelId] || 0)) cg.stars[levelId] = starCount;
    var t = Math.max(1, Math.round(time));
    if (!cg.bestTimes[levelId] || t < cg.bestTimes[levelId]) cg.bestTimes[levelId] = t;
    if (levelId < CAMPAIGN_MAX_LEVELS && cg.unlocked < levelId + 1) cg.unlocked = levelId + 1;
  }
  window.__HM_CAMPAIGN = {
    levels: function () {
      var out = [];
      for (var id = 1; id <= CAMPAIGN_MAX_LEVELS; id++) {
        var def = CAMPAIGN_LEVELS[id];
        if (!def) continue;
        var starRules = [];
        for (var s = 0; s < def.stars.length; s++) starRules.push(def.stars[s].label);
        out.push({
          id: id, name: def.name, tagline: def.tagline, briefing: def.briefing.slice(),
          region: def.region, duration: def.duration,
          unlocked: campaignUnlocked(id), stars: campaignStars(id),
          bestTime: profile.campaign.bestTimes[id] || 0, starRules: starRules
        });
      }
      return out;
    },
    start: function (id) {
      var def = CAMPAIGN_LEVELS[id];
      if (!def || !campaignUnlocked(id)) return false;
      Game.pendingLevel = def;
      var mgr = Game.phaser && Game.phaser.scene;
      if (!mgr) return false;
      if (Game.scene && Game.scene.scene && Game.scene.state === 'over') {
        Game.scene.scene.start('play');
        return true;
      }
      ['missions', 'title', 'shop'].forEach(function (k) {
        if (mgr.isActive(k)) mgr.stop(k);
      });
      mgr.start('play');
      return true;
    },
    totalStars: function () {
      var n = 0;
      for (var id = 1; id <= CAMPAIGN_MAX_LEVELS; id++) n += campaignStars(id);
      return n;
    },
    sfx: function (name) { sfx(name); }
  };

  var HM_DEBUG_STATE = {
    currentWave: 0, activeBuffs: {}, wingCount: 0, equippedWeapon: 'bolt-lance',
    weaponsSeen: 1, draftOptions: [], livePickups: [], bases: [],
    region: 'meridian-verge', regionsSeen: 1,
    regionEnemiesSeen: {}, regionBossActive: '', weaponSlots: ['bolt-lance', '', ''], slotsUnlocked: 1,
    forceGenerousDrops: false, forceWingDrop: false, forceWeaponDrop: false,
    forceTideDrop: false, forceSpectacle: false, tideOdds: 0, lastTideTurner: '',
    forceDraft: false, forceGrantGems: false, forceRegionTour: false, forceRegionBoss: false,
    forceMission: false, forceCompleteObjectives: false,
    campaign: { levelId: 0, unlocked: 1, totalStars: 0, objectives: [
      { id: '', type: '', progress: 0, count: 0, done: false },
      { id: '', type: '', progress: 0, count: 0, done: false },
      { id: '', type: '', progress: 0, count: 0, done: false },
      { id: '', type: '', progress: 0, count: 0, done: false }
    ], objectiveCount: 0 },
    hangar: { balance: 0, tiers: {}, equippedWeapon: 'bolt-lance', paint: 'teal' },
    watchdog: {
      maxStepMs: 0,
      lastBeatAgoMs: 0,
      longSteps: [
        { atRunTime: 0, ms: 0, phase: '' },
        { atRunTime: 0, ms: 0, phase: '' },
        { atRunTime: 0, ms: 0, phase: '' },
        { atRunTime: 0, ms: 0, phase: '' },
        { atRunTime: 0, ms: 0, phase: '' }
      ]
    }
  };
  function updateHangarDebugState(st) {
    if (!st) return;
    var h = profile.hangar;
    if (!st.hangar) st.hangar = { balance: 0, tiers: {}, equippedWeapon: 'bolt-lance', paint: 'teal' };
    st.hangar.balance = Math.floor(h.balance);
    st.hangar.equippedWeapon = h.equippedWeapon;
    st.hangar.paint = h.paint;
    for (var i = 0; i < HANGAR_TRACKS.length; i++) {
      var key = HANGAR_TRACKS[i].key;
      st.hangar.tiers[key] = h.tiers[key] || 0;
    }
    st.weaponsSeen = Object.keys(h.weaponsSeen).length;
    st.equippedWeapon = h.equippedWeapon;
  }
  function consumeForceGrantGems(st) {
    if (!st) return false;
    var request = st.forceGrantGems;
    var amount = request === true ? 1000 : (typeof request === 'number' ? Math.floor(request) : 0);
    if (amount <= 0) return false;
    profile.hangar.balance = Math.min(1e9, profile.hangar.balance + amount);
    st.forceGrantGems = false;
    saveProfile();
    updateHangarDebugState(st);
    return true;
  }
  updateHangarDebugState(HM_DEBUG_STATE);
  if (didMigrate) saveProfile();

  var SFX_GAP = { hit: 45, death: 60, gem: 40, shoot: 34, enemyShoot: 60 };
  var WEAPON_CUE_GAP = 52;
  var _sfxLast = {};
  var _weaponCueLast = -1e9;
  function sfx(name, opts) {
    var gap = SFX_GAP[name];
    if (gap) {
      var now = performance.now();
      if (now - (_sfxLast[name] || -1e9) < gap) return;
      _sfxLast[name] = now;
    }
    kit.audio.sfx(name, opts);
  }
  function weaponSfx(name, opts) {
    var now = performance.now();
    if (now - _weaponCueLast < WEAPON_CUE_GAP) return;
    _weaponCueLast = now;
    sfx(name, opts);
  }

  function volumeRow(box, label, get, set, preview) {
    var wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;align-items:center;gap:10px;background:#1b2733;' +
      'border:1px solid #2e3e4e;border-radius:10px;padding:10px 14px;min-width:min(70vw,280px);' +
      'font:inherit;font-size:16px;color:#e8eef4;';
    var name = document.createElement('span');
    name.style.cssText = 'flex:0 0 auto;';
    var slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0'; slider.max = '100'; slider.step = '5';
    slider.value = String(Math.round(get() * 100));
    slider.style.cssText = 'flex:1 1 auto;accent-color:#39d353;min-width:110px;';
    slider.setAttribute('aria-label', label);
    function paint() { name.textContent = label + ' ' + slider.value + '%'; }
    paint();
    slider.addEventListener('input', function () {
      set(Number(slider.value) / 100);
      paint();
    });
    slider.addEventListener('change', function () { if (preview) preview(); });
    wrap.appendChild(name);
    wrap.appendChild(slider);
    box.appendChild(wrap);
  }
  function openSettings() {
    return kit.openSettings([function (box) {
      volumeRow(box, 'Music', function () { return kit.audio.prefs.music; },
        function (v) { kit.audio.setMusicVolume(v); });
      volumeRow(box, 'Effects', function () { return kit.audio.prefs.sfx; },
        function (v) { kit.audio.setSfxVolume(v); },
        function () { kit.audio.sfx('select'); });
    }, function (box, row) {
      row('Fullscreen', function () { return !!document.fullscreenElement; },
        function (v) { if (v) kit.requestFullscreen(); else if (document.exitFullscreen) document.exitFullscreen(); });
    }]);
  }

  var Game = { scene: null, phaser: null, pendingLevel: null, hasMissions: false };

  var BootScene = {
    key: 'boot',
    preload: function () {
      kit.loader.show('Horde Meridian');
      this.load.on('progress', function (p) { kit.loader.progress(p * 0.85); });
      this.load.atlas('atlas', 'assets/atlas.png', 'assets/atlas.json');
      this.load.image('ground', 'assets/ground.png');
      this.load.image('disc', 'assets/disc.png');
      this.load.image('edge', 'assets/edge.png');
      var parts = ['p_spark', 'p_flare', 'p_smoke', 'p_star', 'p_muzzle', 'p_magic'];
      for (var i = 0; i < parts.length; i++) this.load.image(parts[i], 'assets/' + parts[i] + '.png');
    },
    create: function () {
      kit.audio.register({
        shoot: 'assets/sfx_shoot.mp3',
        hit: 'assets/sfx_hit.mp3',
        death: 'assets/sfx_death.mp3',
        eliteDeath: 'assets/sfx_elite_death.mp3',
        bossDeath: 'assets/sfx_boss_death.mp3',
        gem: 'assets/sfx_gem.mp3',
        levelup: 'assets/sfx_levelup.mp3',
        select: 'assets/sfx_select.mp3',
        click: 'assets/sfx_click.mp3',
        hurt: 'assets/sfx_hurt.mp3',
        wave: 'assets/sfx_wave.mp3',
        telegraph: 'assets/sfx_telegraph.mp3',
        pulse: 'assets/sfx_pulse.mp3',
        unlock: 'assets/sfx_unlock.mp3',
        enemyShoot: 'assets/sfx_enemy_shoot.mp3',
        musicBase: 'assets/music_base.mp3',
        musicHeat: 'assets/music_heat.mp3'
      });
      kit.loader.progress(0.92);
      var boot = this;
      // Decode every registered cue and both music stems before title/play
      // can start. No first-use audio load may run in the simulation.
      kit.audio.preload().then(function () {
        kit.loader.progress(1);
        kit.loader.hide();
        boot.scene.start('title');
      });
    }
  };

  function neonText(scene, x, y, str, size, color, weight, face) {
    var px = Math.max(TYPE.micro, size);
    var t = scene.add.text(x, y, str, {
      fontFamily: face === 'body' ? FONT_BODY : FONT_DISPLAY,
      fontSize: px + 'px',
      color: color || '#e7fff7',
      fontStyle: weight || 'bold',
      align: 'center',
      lineSpacing: Math.round(px * (LINE - 1))
    }).setOrigin(0.5);
    return t;
  }
  function bodyText(scene, x, y, str, size, color, weight) {
    return neonText(scene, x, y, str, size, color, weight || 'normal', 'body');
  }

  function setTextIfChanged(obj, str) {
    if (obj._hmLast === str) return false;
    obj._hmLast = str;
    obj.setText(str);
    return true;
  }

  function makeButton(scene, x, y, w, h, label, onTap, tone, iconFrame) {
    var c = scene.add.container(x, y);
    var hot = tone === 'primary';
    var off = tone === 'disabled';
    var idle = off ? 'btn_off' : (hot ? 'btn_hot' : 'btn');
    var bg = scene.add.image(0, 0, 'atlas', idle).setDisplaySize(w, h);
    var glow = scene.add.image(0, 0, 'disc')
      .setDisplaySize(w * 1.06, h * 1.9)
      .setTint(hot ? 0x8effd8 : 0x4b6c7e)
      .setAlpha(off ? 0 : (hot ? 0.16 : 0.08))
      .setBlendMode(Phaser.BlendModes.ADD);
    var lx = 0;
    var ic = null;
    if (iconFrame) {
      ic = scene.add.image(-w / 2 + 30, 0, 'atlas', iconFrame).setScale(0.52);
      lx = 14;
    }
    var txt = neonText(scene, lx, 0, label, hot ? TYPE.sub : TYPE.body,
      off ? '#5e7280' : (hot ? '#dcfff2' : '#b9d6e2'));
    c.add(ic ? [glow, bg, ic, txt] : [glow, bg, txt]);
    if (off) { c.hitBg = bg; c.label = txt; return c; }

    bg.setInteractive({ useHandCursor: true });
    function up() { bg.setFrame(idle); }
    bg.on('pointerover', function () { bg.setFrame(hot ? 'btn_hot' : 'btn'); bg.setTint(0xdfffff); });
    bg.on('pointerout', function () { bg.clearTint(); up(); });
    bg.on('pointerup', function () { bg.clearTint(); up(); });
    bg.on('pointerdown', function () {
      sfx('click');
      bg.setFrame('btn_press');
      scene.tweens.add({
        targets: c, scaleX: 0.96, scaleY: 0.92, duration: 70, yoyo: true,
        ease: 'Quad.easeOut', onComplete: function () { bg.clearTint(); up(); }
      });
      onTap();
    });
    c.hitBg = bg;
    c.label = txt;
    return c;
  }

  function menuBackdrop(scene) {
    var w = scene.scale.width, h = scene.scale.height;
    scene.cameras.main.setBackgroundColor('#050a10');
    var g = scene.add.graphics();
    for (var i = 0; i < 40; i++) {
      var f = i / 39;
      var r = Math.floor(6 + f * 10), gg = Math.floor(16 + (1 - f) * 26), b = Math.floor(30 + (1 - f) * 30);
      g.fillStyle((r << 16) | (gg << 8) | b, 1);
      g.fillRect(0, h * f, w, h / 39 + 1);
    }
    resetSeed();
    for (var s = 0; s < 90; s++) {
      var st = scene.add.image(srand() * w, srand() * h, 'p_flare')
        .setScale(0.05 + srand() * 0.14)
        .setAlpha(0.2 + srand() * 0.5)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint([0x8fe7ff, 0xa7ffe0, 0xc480ff, 0xffc361][Math.floor(srand() * 4)]);
      scene.tweens.add({
        targets: st, alpha: st.alpha * 0.35,
        duration: 1400 + srand() * 2600, yoyo: true, repeat: -1,
        delay: srand() * 2000, ease: 'Sine.easeInOut'
      });
    }
    var arc = scene.add.image(w / 2, h * 1.05, 'disc')
      .setDisplaySize(w * 2.2, h * 0.9)
      .setTint(0x1d6fa0).setAlpha(0.3).setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({ targets: arc, alpha: 0.16, duration: 3600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    return g;
  }

  var TitleScene = {
    key: 'title',
    create: function () {
      var scene = this;
      Game.pendingLevel = null;   // the title is neutral ground: consume any stale mission token
      var w = this.scale.width, h = this.scale.height;
      menuBackdrop(this);
      kit.audio.music('musicBase', 900);

      var mark = this.add.image(w / 2, h * 0.27, 'atlas', 'boss')
        .setScale(0.95).setTint(0x9fd8ff).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.85);
      this.tweens.add({ targets: mark, angle: 360, duration: 42000, repeat: -1 });
      this.tweens.add({ targets: mark, scale: 1.03, duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      var warden = this.add.image(w / 2, h * 0.27, 'atlas', 'hero_idle').setScale(1.5);
      this.tweens.add({ targets: warden, y: h * 0.27 - 8, duration: 2000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

      var t1 = neonText(this, w / 2, h * 0.46, 'HORDE', TYPE.hero, '#c9ffe9');
      var t2 = neonText(this, w / 2, h * 0.46 + 42, 'MERIDIAN', TYPE.title + 4, '#7ad8ff');
      var rule = this.add.image(w / 2, h * 0.46 + 66, 'edge')
        .setDisplaySize(Math.min(230, w * 0.62), 3).setTint(0x7ad8ff).setAlpha(0)
        .setBlendMode(Phaser.BlendModes.ADD);
      var rule2 = this.add.image(w / 2, h * 0.46 + 66, 'edge')
        .setDisplaySize(Math.min(230, w * 0.62), 3).setTint(0x7ad8ff).setAlpha(0)
        .setFlipX(true).setBlendMode(Phaser.BlendModes.ADD);
      t1.setAlpha(0); t2.setAlpha(0);
      this.tweens.add({ targets: t1, alpha: 1, y: h * 0.46 - 4, duration: 620, ease: 'Cubic.easeOut' });
      this.tweens.add({ targets: t2, alpha: 1, y: h * 0.46 + 38, duration: 620, delay: 120, ease: 'Cubic.easeOut' });
      this.tweens.add({ targets: [rule, rule2], alpha: 0.75, duration: 500, delay: 320 });

      bodyText(this, w / 2, h * 0.585, 'Survive ten minutes. Break the Core.', TYPE.label, '#8fb6c8');

      var by = h * 0.645;
      var bw = Math.min(268, w * 0.74);
      var play = makeButton(this, w / 2, by, bw, 54, 'CAMPAIGN', function () {
        if (Game.hasMissions) { scene.scene.start('missions'); return; }
        var lv = window.__HM_CAMPAIGN.levels(), target = 0;
        for (var li = 0; li < lv.length; li++) if (lv[li].unlocked) target = lv[li].id;
        if (target) window.__HM_CAMPAIGN.start(target);
      }, 'primary', 'ic_lance');
      play.setAlpha(0);
      this.tweens.add({ targets: play, alpha: 1, duration: 400, delay: 300 });
      var cgStars = window.__HM_CAMPAIGN.totalStars();
      if (cgStars > 0) {
        neonText(this, w / 2, by - 26, 'CAMPAIGN ' + cgStars + '/27 STARS', TYPE.micro, '#ffd67a');
      }

      makeButton(this, w / 2, by + 62, bw, 46, 'CLASSIC RUN', function () {
        Game.pendingLevel = null; scene.scene.start('play');
      }, null, 'ic_beam');
      makeButton(this, w / 2, by + 116, bw, 44, 'HANGAR', function () {
        scene.scene.start('shop');
      }, null, 'ic_speed');
      makeButton(this, w / 2, by + 168, bw, 44, 'SETTINGS', openSettings, null, 'ic_regen');

      var stats = 'BEST ' + profile.best + '   ·   ' + Math.floor(hangarBalance()) + ' GEMS BANKED';
      try {
        var bb = JSON.parse(localStorage.getItem('hm_blackbox') || 'null');
        if (bb && !bb.clean) {
          this.add.text(w / 2, h - 64,
            'LAST RUN DIED @' + bb.t + 's  phase:' + bb.phase + '  region:' + bb.region +
            (bb.boss ? '  boss:' + bb.boss : '') + '  max:' + bb.max + 'ms',
            { fontFamily: 'monospace', fontSize: '10px', color: '#ff8d7a',
              backgroundColor: '#160a0aee', padding: { x: 6, y: 3 } }).setOrigin(0.5);
        }
      } catch (bbe) {}
      neonText(this, w / 2, h - 56 - SAFE.bottom, stats, TYPE.label, '#7fa3b5');
      bodyText(this, w / 2, h - 32 - SAFE.bottom,
        'Drag to move  ·  WASD or arrows  ·  Weapons auto-fire', TYPE.micro, '#5d7f90');

      this.input.keyboard.on('keydown-ENTER', function () { Game.pendingLevel = null; scene.scene.start('play'); });
      this.input.keyboard.on('keydown-SPACE', function () { Game.pendingLevel = null; scene.scene.start('play'); });
    },
    update: function () {
      consumeForceGrantGems(HM_DEBUG_STATE);
      if (HM_DEBUG_STATE.forceMission) {
        var fmId = Number(HM_DEBUG_STATE.forceMission);
        HM_DEBUG_STATE.forceMission = false;
        window.__HM_CAMPAIGN.start(fmId);
      }
    }
  };

  var ShopScene = {
    key: 'shop',
    create: function () {
      var scene = this;
      var w = this.scale.width, h = this.scale.height;
      menuBackdrop(this);
      this.hangarClock = 0;
      this.thrustT = 0;
      this.thrustHeld = false;
      this.page = 'modules';

      var head = 31 + SAFE.top;
      neonText(this, w / 2, head, 'HANGAR', TYPE.head, '#c9ffe9');
      this.balanceText = neonText(this, w / 2, head + 27, '', TYPE.sub, '#ffd67a');
      this.noticeText = bodyText(this, w / 2, head + 48, '75% of run gems bank here. Cosmetics are visual only.', TYPE.micro, '#7fa3b5');
      this.refreshBalance = function () {
        setTextIfChanged(scene.balanceText, Math.floor(hangarBalance()) + ' GEMS BANKED');
      };
      this.refreshBalance();

      var tabs = [
        ['MODULES', 'modules'], ['LOADOUT', 'loadout'], ['STYLE', 'style'], ['CORE', 'core']
      ];
      var tabW = Math.min(83, (w - 24) / 4);
      tabs.forEach(function (tab, i) {
        var x = 12 + tabW / 2 + i * tabW;
        var bg = scene.add.image(x, head + 75, 'atlas', 'btn').setDisplaySize(tabW - 4, 34);
        var txt = neonText(scene, x, head + 75, tab[0], TYPE.micro,
          scene.page === tab[1] ? '#8effd8' : '#8fb3c4');
        bg.setDepth(30); txt.setDepth(31);
        bg.setInteractive({ useHandCursor: true });
        bg.on('pointerdown', function () { scene.setPage(tab[1]); });
        scene['tab_' + tab[1]] = { bg: bg, txt: txt };
      });

      this.preview = this.add.container(w / 2, 166);
      this.previewGlow = this.add.image(0, 0, 'disc').setDisplaySize(154, 154)
        .setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.2);
      this.previewMarker = this.add.image(0, 0, 'atlas', 'hero_marker')
        .setScale(1.05).setAlpha(0.62).setBlendMode(Phaser.BlendModes.ADD);
      this.previewShip = this.add.image(0, 0, 'atlas', 'hero_idle').setScale(2.15);
      this.previewEngine = this.add.image(0, 27, 'p_flare').setScale(0.9)
        .setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.55);
      this.previewTrim = this.add.image(0, 0, 'atlas', 'ring').setScale(1.15)
        .setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.2);
      this.preview.add([this.previewGlow, this.previewTrim, this.previewMarker,
        this.previewEngine, this.previewShip]);
      this.previewHit = this.add.rectangle(w / 2, 178, 150, 108, 0x000000, 0.001)
        .setInteractive({ useHandCursor: true });
      this.previewHit.on('pointerover', function () { scene.thrustHeld = true; });
      this.previewHit.on('pointerout', function () { scene.thrustHeld = false; });
      this.previewHit.on('pointerdown', function () {
        scene.thrustT = 0.95;
        scene.thrustHeld = true;
        sfx('pulse', { volume: 0.3, rate: 1.22 });
      });
      this.previewHit.on('pointerup', function () { scene.thrustHeld = false; });
      this.previewLabel = bodyText(this, w / 2, 246, 'TAP SHIP FOR THRUST TEST', TYPE.micro, '#8fb3c4');
      this.renderPreview();

      this.pageGroup = null;
      this.renderPage();
      makeButton(this, w / 2, h - 85 - SAFE.bottom, Math.min(112, w * 0.32), 40, 'TITLE', function () {
        scene.scene.start('title');
      }, null);
      makeButton(this, w / 2, h - 35 - SAFE.bottom, Math.min(250, w * 0.7), 46, 'FLY NOW', function () {
        Game.pendingLevel = null; scene.scene.start('play');
      }, 'primary', 'ic_lance');
      this.input.keyboard.on('keydown-ESC', function () { scene.scene.start('title'); });
      this.input.keyboard.on('keydown-ENTER', function () { Game.pendingLevel = null; scene.scene.start('play'); });
    },

    update: function (now, delta) {
      if (consumeForceGrantGems(HM_DEBUG_STATE)) this.refreshBalance();
      var dt = Math.min(0.05, (delta || 16) / 1000);
      this.hangarClock += dt;
      if (!this.previewShip) return;
      var reduced = !kit.juice.enabled;
      var bob = reduced ? 0 : Math.sin(this.hangarClock * 1.35) * 4;
      var thrust = this.thrustT > 0;
      if (this.thrustHeld) this.thrustT = Math.max(this.thrustT, 0.35);
      else this.thrustT = Math.max(0, this.thrustT - dt * 1.8);
      var push = this.thrustT * (reduced ? 3 : 9);
      this.previewShip.setPosition(push * 0.3, bob - push * 0.18)
        .setRotation(reduced ? 0 : Math.sin(this.hangarClock * 1.1) * 0.035 - this.thrustT * 0.045);
      this.previewMarker.setPosition(push * 0.3, bob - push * 0.18)
        .setRotation(-this.hangarClock * 0.55);
      this.previewGlow.setPosition(push * 0.3, bob - push * 0.18)
        .setScale(1 + this.thrustT * 0.12);
      this.previewEngine.setPosition(-push * 0.55, bob + 27 + push * 0.12)
        .setAlpha(0.38 + this.thrustT * 0.52).setScale(0.82 + this.thrustT * 0.72);
      this.previewTrim.setPosition(push * 0.3, bob - push * 0.18)
        .setRotation(this.hangarClock * 0.4);
    },

    setPage: function (page) {
      if (this.page === page && this.pageGroup) return;
      this.page = page;
      var names = ['modules', 'loadout', 'style', 'core'];
      for (var i = 0; i < names.length; i++) {
        var tab = this['tab_' + names[i]];
        if (!tab) continue;
        tab.txt.setColor(names[i] === page ? '#8effd8' : '#8fb3c4');
        tab.bg.setFrame(names[i] === page ? 'btn_hot' : 'btn');
      }
      this.renderPage();
      sfx('click', { volume: 0.7 });
    },

    setNotice: function (text, color) {
      setTextIfChanged(this.noticeText, text);
      this.noticeText.setColor(color || '#7fa3b5');
    },

    renderPreview: function () {
      var h = profile.hangar;
      var paint = PAINT_BY_KEY[h.paint] || HULL_PAINTS[0];
      var trim = TRIM_BY_KEY[h.trim] || TRIMS[0];
      var frame = FRAME_BY_KEY[h.frame] || HULL_FRAMES[0];
      this.previewShip.setTexture('atlas', frame.idle).setTint(paint.tint);
      this.previewGlow.setTint(trim.color);
      this.previewTrim.setTint(trim.color);
      this.previewMarker.setTint(trim.color);
      this.previewEngine.setTint(trim.color);
      setTextIfChanged(this.previewLabel, frame.name.toUpperCase() + ' HULL  ·  ' + paint.name.toUpperCase() + ' PAINT');
    },

    clearPage: function () {
      if (this.pageGroup) this.pageGroup.destroy(true);
      this.pageGroup = this.add.container(0, 0);
    },

    cardBase: function (group, x, y, w, h, hot) {
      var bg = this.add.image(x, y, 'atlas', hot ? 'card_hot' : 'card').setDisplaySize(w, h);
      group.add(bg);
      return bg;
    },

    renderPage: function () {
      var scene = this, w = this.scale.width, h = this.scale.height;
      this.clearPage();
      var g = this.pageGroup;
      var top = 282;
      if (this.page === 'modules') {
        g.add(bodyText(this, w / 2, top - 20, 'PERMANENT MODULES', TYPE.label, '#8effd8'));
        var gap = 8, cardW = (w - 28 - gap) / 2, moduleRows = Math.ceil(HANGAR_TRACKS.length / 2);
        var cardH = Math.min(64, (h - top - 124) / moduleRows);
        for (var i = 0; i < HANGAR_TRACKS.length; i++) {
          var t = HANGAR_TRACKS[i], col = i % 2, row = Math.floor(i / 2);
          var x = 14 + cardW / 2 + col * (cardW + gap), y = top + row * (cardH + 7) + cardH / 2;
          var lv = hangarLevel(t.key), maxed = lv >= t.max;
          var bg = this.cardBase(g, x, y, cardW, cardH, false);
          var ic = this.add.image(x - cardW / 2 + 24, y - 8, 'atlas', t.icon).setScale(0.48).setTint(t.color);
          var nm = neonText(this, x - cardW / 2 + 48, y - 20, t.name.toUpperCase(), TYPE.micro, '#d8f5ff');
          nm.setOrigin(0, 0.5);
          var nmMax = cardW - 48 - 54;
          if (nm.width > nmMax) nm.setScale(nmMax / nm.width);
          var bl = bodyText(this, x - cardW / 2 + 48, y - 4, t.blurb, TYPE.micro, '#8fb3c4');
          bl.setOrigin(0, 0.5).setScale(Math.min(0.88, (cardW - 58) / bl.width));
          var pips = [];
          for (var p = 0; p < t.max; p++) pips.push(this.add.rectangle(x - cardW / 2 + 49 + p * 9, y + 16, 7, 4, p < lv ? t.color : 0x2b4756));
          var price = maxed ? 'MAXED' : String(t.cost(lv));
          var pr = neonText(this, x + cardW / 2 - 9, y - 17, price, TYPE.micro, maxed ? '#8effd8' : '#ffd67a');
          pr.setOrigin(1, 0.5);
          var gem = this.add.image(x + cardW / 2 - 8, y + 4, 'atlas', 'hi_gem').setScale(0.25).setVisible(!maxed);
          g.add([ic, nm, bl].concat(pips).concat([pr, gem]));
          if (!maxed) {
            bg.setInteractive({ useHandCursor: true });
            bg.on('pointerdown', function (trackKey) { return function () { scene.buyTrack(trackKey); }; }(t.key));
          }
        }
        this.setNotice('Each tier is a permanent 4 to 7% class step.', '#7fa3b5');
      } else if (this.page === 'loadout') {
        g.add(bodyText(this, w / 2, top - 20, 'STARTING PRIMARY', TYPE.label, '#8effd8'));
        g.add(bodyText(this, w / 2, top - 2, 'Encounter a weapon in a run to unlock it here.', TYPE.micro, '#7fa3b5'));
        var gap2 = 7, loadoutRows = Math.ceil(WEAPONS.length / 2);
        var cw = (w - 28 - gap2) / 2, ch = Math.min(57, (h - top - 128) / loadoutRows);
        for (var wi = 0; wi < WEAPONS.length; wi++) {
          var weapon = WEAPONS[wi], seen = !!profile.hangar.weaponsSeen[weapon.key];
          var wc = wi % 2, wr = Math.floor(wi / 2);
          var wx = 14 + cw / 2 + wc * (cw + gap2), wy = top + 19 + wr * (ch + 5) + ch / 2;
          var selected = seen && profile.hangar.equippedWeapon === weapon.key;
          var wbg = this.cardBase(g, wx, wy, cw, ch, selected);
          var wic = this.add.image(wx - cw / 2 + 23, wy, 'atlas', seen ? weapon.glyph : 'ic_lock')
            .setScale(0.43).setTint(seen ? weapon.color : 0x526572).setAlpha(seen ? 1 : 0.7);
          var regionHint = weapon.regionKey && REGION_BY_KEY[weapon.regionKey] ? 'FOUND IN THE ' + REGION_BY_KEY[weapon.regionKey].name : 'ENCOUNTER TO UNLOCK';
          var wn = neonText(this, wx - cw / 2 + 44, wy - 9,
            seen ? weapon.name.toUpperCase() : (weapon.tier === 'upgraded' ? regionHint : 'UNKNOWN PRIMARY'), TYPE.micro,
            seen ? '#d8f5ff' : '#718897');
          wn.setOrigin(0, 0.5);
          var weaponNameMax = cw - 51;
          if (wn.width > weaponNameMax) wn.setScale(weaponNameMax / wn.width);
          var ws = bodyText(this, wx - cw / 2 + 44, wy + 10, selected ? 'EQUIPPED' : (seen ? 'TAP TO EQUIP' : 'ENCOUNTER TO UNLOCK'),
            TYPE.micro, selected ? '#8effd8' : '#7fa3b5');
          ws.setOrigin(0, 0.5).setScale(Math.min(0.86, Math.max(0.66, (ch - 5) / 38)));
          if (weapon.tier === 'upgraded' && seen) wbg.setTint(0xffd67a);
          g.add([wic, wn, ws]);
          if (seen) {
            wbg.setInteractive({ useHandCursor: true });
            wbg.on('pointerdown', function (weaponKey) { return function () { scene.selectWeapon(weaponKey); }; }(weapon.key));
          }
        }
        this.setNotice('LOADOUT  ·  COSMETIC SHIP STYLE DOES NOT CHANGE STATS.', '#7fa3b5');
      } else if (this.page === 'style') {
        g.add(bodyText(this, w / 2, top - 20, 'SHIP CUSTOMIZE', TYPE.label, '#8effd8'));
        g.add(bodyText(this, w / 2, top - 2, 'PAINT, TRIM, AND FRAME ARE COSMETIC ONLY.', TYPE.micro, '#7fa3b5'));
        var paintW = (w - 32) / 3;
        for (var pi = 0; pi < HULL_PAINTS.length; pi++) {
          var paint = HULL_PAINTS[pi], pc = pi % 3, prr = Math.floor(pi / 3);
          var px = 8 + paintW / 2 + pc * paintW, py = top + 34 + prr * 63;
          var pbg = this.cardBase(g, px, py, paintW - 6, 54, profile.hangar.paint === paint.key);
          var sw = this.add.rectangle(px, py - 8, 28, 28, paint.tint, 1).setStrokeStyle(2, 0xe7fff7, 0.45);
          var pn = neonText(this, px, py + 15, paint.name.toUpperCase(), TYPE.micro,
            profile.hangar.paint === paint.key ? '#8effd8' : '#b9d6e2');
          g.add([sw, pn]);
          pbg.setInteractive({ useHandCursor: true });
          pbg.on('pointerdown', function (paintKey) { return function () { scene.selectPaint(paintKey); }; }(paint.key));
        }
        g.add(bodyText(this, w / 2, top + 165, 'ENGINE TRIM', TYPE.label, '#8effd8'));
        for (var ti = 0; ti < TRIMS.length; ti++) {
          var trim = TRIMS[ti], tx = 34 + ti * ((w - 68) / 4), ty = top + 193;
          if (ti === 4) tx = w - 34;
          var trimDot = this.add.circle(tx, ty, 15, trim.color, 1).setStrokeStyle(2, 0xe7fff7, profile.hangar.trim === trim.key ? 0.9 : 0.25);
          trimDot.setInteractive({ useHandCursor: true });
          trimDot.on('pointerdown', function (trimKey) { return function () { scene.selectTrim(trimKey); }; }(trim.key));
          g.add(trimDot);
        }
        g.add(bodyText(this, w / 2, top + 235, 'HULL FRAME', TYPE.label, '#8effd8'));
        var fw = Math.min(112, (w - 36) / 3);
        for (var fi = 0; fi < HULL_FRAMES.length; fi++) {
          var frame = HULL_FRAMES[fi], fx = 18 + fw / 2 + fi * (fw + 1), fy = top + 274;
          var fbg = this.cardBase(g, fx, fy, fw - 5, 58, profile.hangar.frame === frame.key);
          var fs = this.add.image(fx - 25, fy, 'atlas', frame.idle).setScale(0.43).setTint((PAINT_BY_KEY[profile.hangar.paint] || HULL_PAINTS[0]).tint);
          var fn = neonText(this, fx + 18, fy, frame.name.toUpperCase(), TYPE.micro,
            profile.hangar.frame === frame.key ? '#8effd8' : '#b9d6e2');
          fn.setOrigin(0, 0.5).setScale(0.82);
          fbg.setInteractive({ useHandCursor: true });
          fbg.on('pointerdown', function (frameKey) { return function () { scene.selectFrame(frameKey); }; }(frame.key));
          g.add([fs, fn]);
        }
        this.setNotice('STYLE  ·  PAINT, TRIM, AND FRAME NEVER BUY POWER.', '#7fa3b5');
      } else {
        g.add(bodyText(this, w / 2, top - 20, 'CORE SYSTEMS', TYPE.label, '#8effd8'));
        g.add(bodyText(this, w / 2, top - 2, 'THE ORIGINAL SIX META MODULES REMAIN ONLINE.', TYPE.micro, '#7fa3b5'));
        var mgap = 8, mw = (w - 28 - mgap) / 2, mh = Math.min(70, (h - top - 124) / 3);
        for (var mi2 = 0; mi2 < META.length; mi2++) {
          var m = META[mi2], mc = mi2 % 2, mr = Math.floor(mi2 / 2);
          var mx = 14 + mw / 2 + mc * (mw + mgap), my = top + 24 + mr * (mh + 7) + mh / 2;
          var mlv = metaLevel(m.key), mmax = mlv >= m.max;
          var mbg = this.cardBase(g, mx, my, mw, mh, false);
          var mic = this.add.image(mx - mw / 2 + 23, my - 8, 'atlas', m.icon).setScale(0.46);
          var mn = neonText(this, mx - mw / 2 + 46, my - 18, m.name.toUpperCase(), TYPE.micro, '#d8f5ff');
          mn.setOrigin(0, 0.5);
          var mnMax = mw - 46 - 54;
          if (mn.width > mnMax) mn.setScale(mnMax / mn.width);
          var mbl = bodyText(this, mx - mw / 2 + 46, my - 2, m.blurb, TYPE.micro, '#8fb3c4');
          mbl.setOrigin(0, 0.5).setScale(Math.min(0.78, (mw - 54) / mbl.width));
          var mpips = [];
          for (var mp = 0; mp < m.max; mp++) mpips.push(this.add.rectangle(mx - mw / 2 + 47 + mp * 9, my + 18, 7, 4, mp < mlv ? 0x8effd8 : 0x2b4756));
          var mprice = neonText(this, mx + mw / 2 - 9, my - 17, mmax ? 'MAXED' : String(m.cost(mlv)), TYPE.micro, mmax ? '#8effd8' : '#ffd67a');
          mprice.setOrigin(1, 0.5);
          g.add([mic, mn, mbl].concat(mpips).concat([mprice]));
          if (!mmax) {
            mbg.setInteractive({ useHandCursor: true });
            mbg.on('pointerdown', function (metaKey) { return function () { scene.buyMeta(metaKey); }; }(m.key));
          }
        }
        this.setNotice('CORE  ·  LEGACY META PROGRESSION PRESERVED.', '#7fa3b5');
      }
    },

    buyTrack: function (key) {
      var t = HANGAR_BY_KEY[key], lv = hangarLevel(key);
      if (!t || lv >= t.max) { sfx('click', { rate: 0.7 }); return; }
      var cost = t.cost(lv);
      if (hangarBalance() < cost) {
        this.setNotice('NEED ' + cost + ' GEMS FOR NEXT TIER.', '#ff9a8f');
        sfx('click', { rate: 0.6 });
        return;
      }
      profile.hangar.balance -= cost;
      profile.hangar.tiers[key] = lv + 1;
      saveProfile();
      updateHangarDebugState(HM_DEBUG_STATE);
      this.refreshBalance();
      this.renderPage();
      sfx('unlock');
      kit.juice.shake(4, 140);
      this.setNotice(t.name.toUpperCase() + ' TIER ' + (lv + 1) + ' ONLINE.', '#8effd8');
    },

    buyMeta: function (key) {
      var m = META_BY_KEY[key], lv = metaLevel(key);
      if (!m || lv >= m.max) { sfx('click', { rate: 0.7 }); return; }
      var cost = m.cost(lv);
      if (hangarBalance() < cost) {
        this.setNotice('NEED ' + cost + ' GEMS FOR CORE SYSTEM.', '#ff9a8f');
        sfx('click', { rate: 0.6 });
        return;
      }
      profile.hangar.balance -= cost;
      profile.meta[key] = lv + 1;
      saveProfile();
      updateHangarDebugState(HM_DEBUG_STATE);
      this.refreshBalance();
      this.renderPage();
      sfx('unlock');
      kit.juice.shake(4, 140);
    },

    selectWeapon: function (key) {
      if (!WEAPON_BY_KEY[key] || !profile.hangar.weaponsSeen[key]) return;
      profile.hangar.equippedWeapon = key;
      saveProfile();
      updateHangarDebugState(HM_DEBUG_STATE);
      this.renderPage();
      this.renderPreview();
      sfx('select');
      this.setNotice(WEAPON_BY_KEY[key].name.toUpperCase() + ' READY AT LAUNCH.', '#8effd8');
    },

    selectPaint: function (key) {
      if (!PAINT_BY_KEY[key]) return;
      profile.hangar.paint = key;
      saveProfile();
      updateHangarDebugState(HM_DEBUG_STATE);
      this.renderPreview();
      this.renderPage();
      sfx('select', { rate: 1.08 });
    },

    selectTrim: function (key) {
      if (!TRIM_BY_KEY[key]) return;
      profile.hangar.trim = key;
      saveProfile();
      updateHangarDebugState(HM_DEBUG_STATE);
      this.renderPreview();
      this.renderPage();
      sfx('select', { rate: 1.14 });
    },

    selectFrame: function (key) {
      if (!FRAME_BY_KEY[key]) return;
      profile.hangar.frame = key;
      saveProfile();
      updateHangarDebugState(HM_DEBUG_STATE);
      this.renderPreview();
      this.renderPage();
      sfx('select', { rate: 0.92 });
    }
  };

  var PlayScene = {
    key: 'play',

    create: function () {
      Game.scene = this;
      var scene = this;
      var w = this.scale.width, h = this.scale.height;

      this.cameras.main.setBackgroundColor('#04080e');
      this.frozenBySystem = false;
      this.accum = 0;
      this.lastNow = performance.now();
      this.timers = [];
      this.runToken = 0;
      this.pendingEnd = null;
      this.inSim = false;
      this.watchdog = HM_DEBUG_STATE.watchdog;
      this.watchdog.maxStepMs = 0;
      this.watchdog.lastBeatAgoMs = 0;
      for (var wdi = 0; wdi < this.watchdog.longSteps.length; wdi++) {
        this.watchdog.longSteps[wdi].atRunTime = 0;
        this.watchdog.longSteps[wdi].ms = 0;
        this.watchdog.longSteps[wdi].phase = '';
      }
      this.watchdogLastFrameAt = this.lastNow;
      this.watchdogPhase = 'boot';

      this.ground = this.add.tileSprite(0, 0, w, h, 'ground').setOrigin(0, 0).setScrollFactor(0).setDepth(-100);
      // The ground is screen-locked for parallax, but it belongs to the world
      // camera. Every other scrollFactor-0 object in this scene is UI.
      this.ground._hmWorld = true;

      resetSeed();

      this.landmarkDefs = [];
      for (var ri = 0; ri < REGIONS.length; ri++) {
        var regionDef = REGIONS[ri];
        for (var ai = 0; ai < REGION_ANCHORS.length; ai++) {
          var anchor = REGION_ANCHORS[ai];
          var ld = regionDef.landmarks[ai % regionDef.landmarks.length];
          this.landmarkDefs.push({
            region: regionDef.key, x: regionDef.minX + 180 + anchor[0] * (REGION_WIDTH - 360),
            y: anchor[1] * EDGE * 0.82, frame: ld.frame, tint: ld.tint,
            scale: ld.scale * (1 + ((ai + ri) % 3) * 0.08), rot: ld.rot + (ri - 2) * 0.12,
            alpha: ld.frame === 'disc' ? 0.16 : 0.72
          });
        }
      }
      this.landmarkPool = [];
      for (var lpi = 0; lpi < MAX_LANDMARKS; lpi++) {
        var landmarkSpr = this.add.image(0, 0, 'atlas', 'deco_plate').setDepth(-94)
          .setVisible(false);
        this.landmarkPool.push({ active: false, defIndex: -1, spr: landmarkSpr });
        this.park(landmarkSpr);
      }

      this.regionBackground = [
        { par: 0.72, spr: this.add.image(0, 0, 'disc').setDepth(-99).setDisplaySize(7600, 9800)
          .setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.16) },
        { par: 0.84, spr: this.add.image(0, 0, 'disc').setDepth(-98).setDisplaySize(5200, 7200)
          .setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.18) },
        { par: 0.94, spr: this.add.image(0, 0, 'disc').setDepth(-97).setDisplaySize(3300, 5200)
          .setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.18) }
      ];
      for (var rbp = 0; rbp < this.regionBackground.length; rbp++) this.park(this.regionBackground[rbp].spr);
      this.activeRegionKey = '';

      this.coreMount = this.add.image(0, 0, 'atlas', 'deco_core').setDepth(-94)
        .setScale(1.6).setAlpha(0.85);
      this.coreMount.wx = 0; this.coreMount.wy = 0;
      this.park(this.coreMount);

      this.marks = [];
      for (var i = 0; i < 150; i++) {
        var m = this.add.image(0, 0, 'p_flare')
          .setBlendMode(Phaser.BlendModes.ADD).setDepth(-90)
          .setTint(0x54d6ff);
        m.wx = (srand() - 0.5) * REGION_WIDTH;
        m.wy = (srand() - 0.5) * EDGE * 1.5;
        m.layer = i % 3;
        m.par = [0.28, 0.54, 0.82][m.layer];
        m.baseScale = [0.08, 0.16, 0.28][m.layer] + srand() * [0.12, 0.22, 0.38][m.layer];
        m.setScale(m.baseScale).setAlpha([0.16, 0.22, 0.3][m.layer] + srand() * 0.18);
        m.phase = srand() * TAU;
        this.marks.push(m);
      }

      this.debris = [];
      for (var di0 = 0; di0 < 36; di0++) {
        var debris = this.add.image(0, 0, 'p_flare').setDepth(-89)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(di0 % 2 ? 0x9a6b52 : 0x4e9eae);
        debris.wx = (srand() - 0.5) * REGION_WIDTH;
        debris.wy = (srand() - 0.5) * EDGE * 1.5;
        debris.dx = (srand() - 0.5) * 18;
        debris.dy = (srand() - 0.5) * 18;
        debris.par = 0.42 + (di0 % 3) * 0.18;
        debris.baseScale = 0.22 + srand() * 0.48;
        debris.spin = (srand() - 0.5) * 0.9;
        debris.setScale(debris.baseScale).setAlpha(0.22 + srand() * 0.22);
        this.debris.push(debris);
        this.park(debris);
      }

      this.boundary = this.add.graphics().setDepth(-80);
      this.boundary.fillStyle(0x2f8fa8, 0.10);
      this.boundary.fillRect(-EDGE - 90, -EDGE - 90, EDGE * 2 + 180, 90);
      this.boundary.fillRect(-EDGE - 90, EDGE, EDGE * 2 + 180, 90);
      this.boundary.fillRect(-EDGE - 90, -EDGE, 90, EDGE * 2);
      this.boundary.fillRect(EDGE, -EDGE, 90, EDGE * 2);
      this.boundary.lineStyle(4, 0x54d6ff, 0.6);
      this.boundary.strokeRect(-EDGE, -EDGE, EDGE * 2, EDGE * 2);
      this.boundary.lineStyle(1, 0x8fe7ff, 0.35);
      this.boundary.strokeRect(-EDGE - 8, -EDGE - 8, EDGE * 2 + 16, EDGE * 2 + 16);
      for (var cq = 0; cq < 4; cq++) {
        var sx = cq % 2 ? 1 : -1, sy = cq < 2 ? -1 : 1;
        this.boundary.lineStyle(5, 0x8effd8, 0.8);
        this.boundary.beginPath();
        this.boundary.moveTo(sx * EDGE - sx * 70, sy * EDGE);
        this.boundary.lineTo(sx * EDGE, sy * EDGE);
        this.boundary.lineTo(sx * EDGE, sy * EDGE - sy * 70);
        this.boundary.strokePath();
      }

      this.regionWalls = this.add.graphics().setDepth(-79);
      for (var rw = 0; rw < REGIONS.length - 1; rw++) {
        var wallX = REGIONS[rw].maxX;
        for (var wb = 0; wb < 3; wb++) {
          var half = 120 - wb * 34;
          this.regionWalls.fillStyle(REGIONS[rw + 1].palette.border, 0.045 + wb * 0.025);
          this.regionWalls.fillRect(wallX - half, -EDGE, half * 2, WORLD);
        }
        this.regionWalls.lineStyle(3, REGIONS[rw + 1].palette.border, 0.52);
        this.regionWalls.lineBetween(wallX, -EDGE, wallX, EDGE);
        this.regionWalls.lineStyle(1, REGIONS[rw].palette.border, 0.25);
        this.regionWalls.lineBetween(wallX - 104, -EDGE, wallX - 104, EDGE);
        this.regionWalls.lineBetween(wallX + 104, -EDGE, wallX + 104, EDGE);
      }

      this.initPools();

      this.playerMark = this.add.image(0, 0, 'atlas', 'hero_marker').setDepth(48)
        .setAlpha(0.9).setScale(0.82);
      this.player = this.add.image(0, 0, 'atlas', 'hero_idle').setDepth(50);
      this.playerHeading = 0;
      this.playerBank = 0;
      this.playerGlow = this.add.image(0, 0, 'disc').setDepth(47)
        .setTint(0x6df0bf).setAlpha(0.22).setDisplaySize(96, 96)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.magnetRing = this.add.image(0, 0, 'disc').setDepth(-60)
        .setTint(0x3c9fd0).setAlpha(0.07).setBlendMode(Phaser.BlendModes.ADD);

      this.orbitBlades = [];
      for (var b = 0; b < 8; b++) {
        var bl = this.add.image(0, 0, 'atlas', 'shard').setDepth(52)
          .setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
        this.orbitBlades.push(bl);
      }

      this.fx = {};
      this.fx.death = this.add.particles(0, 0, 'p_spark', {
        lifespan: 460, speed: { min: 60, max: 250 }, scale: { start: 0.32, end: 0 },
        alpha: { start: 1, end: 0 }, blendMode: 'ADD', emitting: false, quantity: 8
      }).setDepth(60);
      this.fx.impact = this.add.particles(0, 0, 'p_muzzle', {
        lifespan: 220, speed: { min: 30, max: 130 }, scale: { start: 0.22, end: 0 },
        alpha: { start: 0.9, end: 0 }, blendMode: 'ADD', emitting: false, quantity: 3
      }).setDepth(60);
      this.fx.gem = this.add.particles(0, 0, 'p_star', {
        lifespan: 380, speed: { min: 20, max: 90 }, scale: { start: 0.2, end: 0 },
        alpha: { start: 1, end: 0 }, blendMode: 'ADD', emitting: false, quantity: 4
      }).setDepth(60);
      this.fx.level = this.add.particles(0, 0, 'p_magic', {
        lifespan: 900, speed: { min: 90, max: 320 }, scale: { start: 0.42, end: 0 },
        alpha: { start: 1, end: 0 }, blendMode: 'ADD', emitting: false, quantity: 26,
        tint: 0xa7ffe0
      }).setDepth(62);
      this.fx.trail = this.add.particles(0, 0, 'p_flare', {
        lifespan: 340, speed: { min: 6, max: 34 }, scale: { start: 0.2, end: 0 },
        alpha: { start: 0.55, end: 0 }, blendMode: 'ADD', emitting: false, quantity: 1,
        tint: 0x6df0bf
      }).setDepth(45);
      this.fx.smoke = this.add.particles(0, 0, 'p_smoke', {
        lifespan: 900, speed: { min: 14, max: 70 }, scale: { start: 0.28, end: 0.62 },
        alpha: { start: 0.42, end: 0 }, blendMode: 'ADD', emitting: false, quantity: 5,
        tint: 0x6a5f9c
      }).setDepth(58);

      this.buildHud();

      this.buildDraftUI();

      this.stick = { active: false, id: null, bx: 0, by: 0, dx: 0, dy: 0 };
      this.stickRing = this.add.image(0, 0, 'disc').setScrollFactor(0).setDepth(300)
        .setTint(0x8effd8).setAlpha(0).setDisplaySize(118, 118).setBlendMode(Phaser.BlendModes.ADD);
      this.stickNub = this.add.image(0, 0, 'p_flare').setScrollFactor(0).setDepth(301)
        .setTint(0xc9ffe9).setAlpha(0).setScale(0.5).setBlendMode(Phaser.BlendModes.ADD);
      this.bindInput();
      this.setupRenderCameras();

      this.campaignObjText = this.add.text(this.scale.width / 2, SAFE.top + 74, '', {
        fontFamily: FONT_DISPLAY, fontSize: TYPE.label + 'px', color: '#ffd67a', fontStyle: 'bold'
      }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(120).setVisible(false);
      this.registerUiObject(this.campaignObjText);

      this.debugState = HM_DEBUG_STATE;
      this.debugPickupRecords = [];
      for (var dsi = 0; dsi < MAX_BONUS_PICKUPS + MAX_WEAPON_DROPS; dsi++) {
        this.debugPickupRecords.push({ type: '', tier: '', x: 0, y: 0 });
      }
      this.debugBaseRecords = [];
      for (var dsb = 0; dsb < Math.max(6, BASE_SCHEDULE.length); dsb++) {
        this.debugBaseRecords.push({ type: '', hp: 0, x: 0, y: 0 });
      }
      this.debugDraftRecords = [];
      for (var dsd = 0; dsd < 3; dsd++) {
        this.debugDraftRecords.push({ key: '', name: '', rarity: '', rank: 0 });
      }
      this.debugState.livePickups = [];
      this.debugState.bases = [];
      this.debugState.draftOptions = [];
      updateHangarDebugState(this.debugState);
      if (!window.__hm) window.__hm = {};
      window.__hm.state = this.debugState;

      this.resetRun();

      this.tutorial = null;
      if (!profile.tutorialDone) this.startTutorial();

      kit.audio.music('musicBase', 700);

      this.events.on('shutdown', function () {
        scene.input.keyboard.removeAllKeys(true);
        scene.releaseAll();
        if (scene.winRelease) {
          window.removeEventListener('pointercancel', scene.winRelease);
          window.removeEventListener('lostpointercapture', scene.winRelease);
          window.removeEventListener('blur', scene.winRelease);
          document.removeEventListener('visibilitychange', scene.winRelease);
          scene.winRelease = null;
        }
        if (scene.draftHold) { clearTimeout(scene.draftHold); scene.draftHold = null; }
        (scene.uiTimeouts || []).forEach(clearTimeout);
        scene.uiTimeouts = [];
        scene.timers.length = 0;
        if (scene.uiResize) {
          scene.scale.off('resize', scene.uiResize);
          scene.uiResize = null;
        }
        scene.draftUI = null;
        scene.overlay = null;
        Game.scene = null;
      });
    },

    setupRenderCameras: function () {
      var ui = [], world = [];
      // Stall/error debug readout (screenshot-diagnosable on device).
      this.stallDebugText = this.add.text(8, 70, '', {
        fontFamily: 'monospace', fontSize: '11px', color: '#ff8d7a',
        backgroundColor: '#160a0aee', padding: { x: 6, y: 3 },
      }).setScrollFactor(0).setDepth(400).setVisible(false);
      var list = this.children.list;
      for (var i = 0; i < list.length; i++) {
        var obj = list[i];
        var screenLocked = obj.scrollFactorX === 0 && obj.scrollFactorY === 0;
        if (screenLocked && !obj._hmWorld) ui.push(obj);
        else world.push(obj);
      }
      this.cameras.main.ignore(ui);
      this.uiCam = this.cameras.add(0, 0, this.scale.width, this.scale.height);
      this.uiCam.setScroll(0, 0).setZoom(1);
      this.uiCam.ignore(world);
      var scene = this;
      this.uiResize = function (gameSize) {
        if (!scene.uiCam) return;
        scene.uiCam.setSize(gameSize.width, gameSize.height).setScroll(0, 0).setZoom(1);
      };
      this.scale.on('resize', this.uiResize);
    },

    registerUiObject: function (obj) {
      if (!obj || !this.uiCam) return obj;
      this.cameras.main.ignore(obj);
      if (obj.list) this.cameras.main.ignore(obj.list);
      return obj;
    },

    registerWorldObject: function (obj) {
      if (!obj || !this.uiCam) return obj;
      this.uiCam.ignore(obj);
      return obj;
    },

    initPools: function () {
      var i;
      this.enemies = [];
      for (i = 0; i < MAX_ENEMIES; i++) {
        this.enemies.push({
          alive: false, x: 0, y: 0, vx: 0, vy: 0, hp: 0, maxHp: 0, r: 10,
          speed: 0, dmg: 0, xp: 1, fam: 'drifter', elite: false, boss: false,
          phase: 0, phaseStage: 0, phaseBeat: 0, flash: 0, cd: 0, hitAt: -1, id: i, tint: 0xffffff,
          regionKey: 'meridian-verge', variant: false, behavior: '', regionBoss: false, bossKey: '', egg: false,
          hatchT: 0, latchT: 0, refractT: 0, blinkT: 0,
          squash: 0, squashA: 0, wind: 0,
          tideSingularityId: -1, tideSingularityDamage: 0,
          callInId: -1, callInDamage: 0,
          spr: this.add.image(0, 0, 'atlas', 'drifter').setDepth(40).setVisible(false),
          aura: this.add.image(0, 0, 'atlas', 'elite_aura').setDepth(39)
            .setBlendMode(Phaser.BlendModes.ADD).setVisible(false)
        });
      }
      this.enemyCount = 0;
      this.hatchQueue = [];
      for (i = 0; i < MAX_ENEMIES; i++) {
        this.hatchQueue.push({ active: false, fam: 'salvage-swarm', x: 0, y: 0 });
      }

      this.gems = [];
      for (i = 0; i < MAX_GEMS; i++) {
        this.gems.push({
          alive: false, x: 0, y: 0, vx: 0, vy: 0, value: 1, tier: 0, born: 0,
          spr: this.add.image(0, 0, 'atlas', 'gem0').setDepth(20).setVisible(false)
            .setBlendMode(Phaser.BlendModes.ADD)
        });
      }
      this.gemHead = 0;   // ring cursor used by the GEM GROWTH CAP recycle

      this.bonuses = [];
      for (i = 0; i < MAX_BONUS_PICKUPS; i++) {
        this.bonuses.push({
          alive: false, kind: 'aegis', tide: false, x: 0, y: 0, vx: 0, vy: 0,
          life: 0, born: 0,
          spr: this.add.image(0, 0, 'atlas', 'ic_armor').setDepth(25)
            .setBlendMode(Phaser.BlendModes.ADD).setVisible(false),
          halo: this.add.image(0, 0, 'disc').setDepth(24)
            .setBlendMode(Phaser.BlendModes.ADD).setVisible(false),
          beacon: this.add.image(0, 0, 'edge').setDepth(23)
            .setBlendMode(Phaser.BlendModes.ADD).setVisible(false),
          ring: this.add.image(0, 0, 'atlas', 'ring_thick').setDepth(26)
            .setBlendMode(Phaser.BlendModes.ADD).setVisible(false),
          crown: this.add.image(0, 0, 'atlas', 'elite_crown').setDepth(27)
            .setBlendMode(Phaser.BlendModes.ADD).setVisible(false)
        });
      }
      this.weaponDrops = [];
      for (i = 0; i < MAX_WEAPON_DROPS; i++) {
        this.weaponDrops.push({
          alive: false, weapon: 'bolt-lance', tier: 'base', x: 0, y: 0, vx: 0, vy: 0, life: 0, born: 0,
          spr: this.add.image(0, 0, 'atlas', 'ic_lance').setDepth(27)
            .setBlendMode(Phaser.BlendModes.ADD).setVisible(false),
          ring: this.add.image(0, 0, 'atlas', 'ring_thick').setDepth(26)
            .setBlendMode(Phaser.BlendModes.ADD).setVisible(false),
          beacon: this.add.image(0, 0, 'edge').setDepth(25)
            .setBlendMode(Phaser.BlendModes.ADD).setVisible(false)
        });
      }

      this.bases = [];
      for (i = 0; i < Math.max(6, BASE_SCHEDULE.length); i++) {
        this.bases.push({
          alive: false, destroying: false, type: 'hive', x: 0, y: 0, hp: 0,
          maxHp: 0, r: 70, cd: 0, spawnT: 0, alarm: 0, born: 0,
          collapseT: 0, collapseStage: 0,
          spr: this.add.image(0, 0, 'atlas', 'deco_core').setDepth(38).setVisible(false),
          ring: this.add.image(0, 0, 'atlas', 'ring_thick').setDepth(37)
            .setBlendMode(Phaser.BlendModes.ADD).setVisible(false),
          alarmSpr: this.add.image(0, 0, 'atlas', 'ring').setDepth(39)
            .setBlendMode(Phaser.BlendModes.ADD).setVisible(false),
          pillar: this.add.image(0, 0, 'edge').setDepth(58)
            .setBlendMode(Phaser.BlendModes.ADD).setVisible(false),
          barBg: this.add.image(0, 0, 'atlas', 'chip').setDepth(56).setVisible(false),
          barFill: this.add.image(0, 0, 'edge').setDepth(57).setVisible(false)
        });
      }
      this.baseCount = 0;
      this.scratchBases = [];

      this.ambientEvents = [];
      for (i = 0; i < 4; i++) {
        this.ambientEvents.push({
          alive: false, kind: 'meteor', x: 0, y: 0, vx: 0, vy: 0,
          life: 0, rot: 0, tint: 0xffc361, slot: i,
          spr: this.add.image(0, 0, 'p_flare').setDepth(-87)
            .setBlendMode(Phaser.BlendModes.ADD).setVisible(false)
        });
      }

      this.wings = [];
      for (i = 0; i < WING_SLOTS.length; i++) {
        this.wings.push({
          alive: false, slot: i, x: 0, y: 0, vx: 0, vy: 0, r: 13,
          heading: 0, bank: 0, face: 0, moving: false, thrust: 0,
          joinT: 0, joinDur: 0.92, joinX: 0, joinY: 0,
          spr: this.add.image(0, 0, 'atlas', 'wingman').setDepth(49)
            .setVisible(false),
          halo: this.add.image(0, 0, 'disc').setDepth(46)
            .setBlendMode(Phaser.BlendModes.ADD).setVisible(false)
        });
      }

      this.shots = [];
      for (i = 0; i < MAX_SHOTS; i++) {
        this.shots.push({
          pool: 'shot', alive: false, kind: 'bolt', weapon: '', x: 0, y: 0, vx: 0, vy: 0, r: 5,
          life: 0, age: 0, dmg: 0, pierce: 0, hitMask: 0, gravity: 0, bounces: 0,
          returning: false, lastHitId: -1, lastHitT: -1, forceCrit: false,
          targetRef: null, targetRetargetT: 0, ox: 0, oy: 0, orbitRadius: 0, orbitAngle: 0, orbitDir: 1,
          splitDepth: 0, respawned: false, forked: false, rangeBurst: false,
          burstRadius: 0, burstDmg: 0, variant: 0,
          spr: this.add.image(0, 0, 'atlas', 'bolt').setDepth(44)
            .setBlendMode(Phaser.BlendModes.ADD).setVisible(false)
        });
      }
      this.liveShots = 0;

      this.ebolts = [];
      for (i = 0; i < MAX_EBOLTS; i++) {
        this.ebolts.push({
          alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, dmg: 0,
          spr: this.add.image(0, 0, 'atlas', 'ebolt').setDepth(43)
            .setBlendMode(Phaser.BlendModes.ADD).setVisible(false)
        });
      }

      this.mines = [];
      for (i = 0; i < 24; i++) {
        this.mines.push({
          alive: false, weapon: '', webId: 0, webIndex: 0, webTriggered: false, linkT: 0,
          x: 0, y: 0, fuse: 0, dmg: 0, radius: 0, forceCrit: false,
          spr: this.add.image(0, 0, 'atlas', 'ic_mine').setDepth(18).setScale(0.5)
            .setBlendMode(Phaser.BlendModes.ADD).setVisible(false)
        });
      }
      this.pulses = [];
      for (i = 0; i < 8; i++) {
        this.pulses.push({
          alive: false, x: 0, y: 0, r: 0, max: 0, dmg: 0, stamp: 0, forceCrit: false,
          mode: 'normal', tint: 0x9fffe2,
          spr: this.add.image(0, 0, 'atlas', 'ring').setDepth(46)
            .setBlendMode(Phaser.BlendModes.ADD).setVisible(false)
        });
      }
      this.beams = [];
      for (i = 0; i < 4; i++) {
        this.beams.push({
          alive: false, x: 0, y: 0, ang: 0, life: 0, dmg: 0, len: 0, wid: 0, stamp: 0,
          refract: false,
          spr: this.add.image(0, 0, 'p_flare').setDepth(47)
            .setBlendMode(Phaser.BlendModes.ADD).setVisible(false)
        });
      }

      this.arcLines = [];
      for (i = 0; i < 8; i++) {
        this.arcLines.push({
          alive: false, life: 0, x1: 0, y1: 0, x2: 0, y2: 0,
          spr: this.add.image(0, 0, 'edge').setDepth(47)
            .setBlendMode(Phaser.BlendModes.ADD).setVisible(false)
        });
      }
      this.purgeRings = [];
      for (i = 0; i < 3; i++) {
        this.purgeRings.push({
          alive: false,
          spr: this.add.image(0, 0, 'atlas', 'ring_thick').setDepth(222)
            .setScrollFactor(0).setBlendMode(Phaser.BlendModes.ADD).setVisible(false)
        });
      }
      this.bossSpokes = [];
      for (i = 0; i < 14; i++) {
        this.bossSpokes.push(this.add.image(0, 0, 'edge')
          .setDepth(41).setBlendMode(Phaser.BlendModes.ADD)
          .setTint(0xff5a4a).setVisible(false));
      }
      this.bossSpokeCount = 0;
      this.regionBossParts = {
        wingL: this.add.image(0, 0, 'atlas', 'shard').setDepth(41)
          .setBlendMode(Phaser.BlendModes.ADD).setVisible(false),
        wingR: this.add.image(0, 0, 'atlas', 'shard').setDepth(41)
          .setBlendMode(Phaser.BlendModes.ADD).setVisible(false),
        abdomen: this.add.image(0, 0, 'atlas', 'ring_thick').setDepth(42)
          .setBlendMode(Phaser.BlendModes.ADD).setVisible(false),
        proboscis: this.add.image(0, 0, 'atlas', 'ic_lance').setDepth(43)
          .setBlendMode(Phaser.BlendModes.ADD).setVisible(false)
      };
      this.decoy = {
        spr: this.add.image(0, 0, 'atlas', 'ic_wisp').setDepth(44)
          .setBlendMode(Phaser.BlendModes.ADD).setVisible(false),
        halo: this.add.image(0, 0, 'disc').setDepth(43)
          .setBlendMode(Phaser.BlendModes.ADD).setVisible(false)
      };
      this.drone = {
        active: false, angle: 0, cd: 0, x: 0, y: 0,
        spr: this.add.image(0, 0, 'atlas', 'ic_wisp').setDepth(48)
          .setBlendMode(Phaser.BlendModes.ADD).setVisible(false),
        halo: this.add.image(0, 0, 'disc').setDepth(45)
          .setBlendMode(Phaser.BlendModes.ADD).setVisible(false)
      };
      this.strike = {
        active: false, t: 0, afterT: 0, dur: 0.68, x: 0, y: 0, ang: 0, len: 1040,
        line: this.add.image(0, 0, 'edge').setDepth(46)
          .setBlendMode(Phaser.BlendModes.ADD).setVisible(false),
        flash: this.add.image(0, 0, 'disc').setDepth(45)
          .setBlendMode(Phaser.BlendModes.ADD).setVisible(false),
        skyLine: this.add.image(0, 0, 'edge').setScrollFactor(0).setDepth(216)
          .setBlendMode(Phaser.BlendModes.ADD).setVisible(false),
        skyGlow: this.add.image(0, 0, 'disc').setScrollFactor(0).setDepth(215)
          .setBlendMode(Phaser.BlendModes.ADD).setVisible(false)
      };
      this.airStrike = {
        active: false, t: 0, dur: 2.35, dir: 1, startX: 0, span: 0, centerY: 0,
        nextDrop: 0, dropIndex: 0, dropCount: 0, token: 0, bombers: [], contrails: [], arrows: []
      };
      for (i = 0; i < 3; i++) {
        this.airStrike.bombers.push(this.add.image(0, 0, 'atlas', 'wingman').setDepth(44)
          .setVisible(false));
        this.airStrike.contrails.push(this.add.image(0, 0, 'edge').setDepth(45)
          .setBlendMode(Phaser.BlendModes.ADD).setVisible(false));
      }
      for (i = 0; i < 2; i++) {
        this.airStrike.arrows.push(this.add.image(0, 0, 'atlas', 'ic_lance').setScrollFactor(0).setDepth(216)
          .setBlendMode(Phaser.BlendModes.ADD).setVisible(false));
      }
      this.airBombs = [];
      for (i = 0; i < 16; i++) {
        this.airBombs.push({
          alive: false, detonated: false, x: 0, y: 0, fuse: 0, life: 0, radius: 0, dmg: 0, id: 0,
          spr: this.add.image(0, 0, 'atlas', 'ic_mine').setDepth(53)
            .setBlendMode(Phaser.BlendModes.ADD).setVisible(false),
          ring: this.add.image(0, 0, 'atlas', 'ring_thick').setDepth(52)
            .setBlendMode(Phaser.BlendModes.ADD).setVisible(false),
          scorch: this.add.image(0, 0, 'disc').setDepth(51)
            .setBlendMode(Phaser.BlendModes.NORMAL).setVisible(false)
        });
      }
      this.cluster = { active: false, t: 0, next: 0, index: 0, x: 0, y: 0, serial: 0 };
      this.clusterSites = [];
      for (i = 0; i < 10; i++) this.clusterSites.push({ x: 0, y: 0, delay: 0 });

      this.spectacle = {
        active: false, t: 0, dur: 0, color: 0x8effd8, scale: 1, tide: false,
        queued: false, qDelay: 0, qAge: 0, qTitle: '', qColor: 0x8effd8, qScale: 1, qTide: false,
        ring: this.add.image(0, 0, 'atlas', 'ring_thick').setScrollFactor(0).setDepth(218)
          .setBlendMode(Phaser.BlendModes.ADD).setVisible(false),
        flashA: this.add.image(0, 0, 'disc').setScrollFactor(0).setDepth(217)
          .setBlendMode(Phaser.BlendModes.ADD).setVisible(false),
        flashB: this.add.image(0, 0, 'disc').setScrollFactor(0).setDepth(216)
          .setBlendMode(Phaser.BlendModes.ADD).setVisible(false),
        flashWhite: this.add.image(0, 0, 'disc').setScrollFactor(0).setDepth(215)
          .setBlendMode(Phaser.BlendModes.ADD).setVisible(false),
        edges: []
      };
      var spectacleStrips = [[0, 0, 0], [0, 0, 90], [0, 0, 180], [0, 0, 270]];
      for (i = 0; i < spectacleStrips.length; i++) {
        this.spectacle.edges.push(this.add.image(0, 0, 'edge').setScrollFactor(0).setDepth(219)
          .setBlendMode(Phaser.BlendModes.ADD).setVisible(false));
      }
      this.eliteBursts = [];
      for (i = 0; i < 5; i++) {
        this.eliteBursts.push({
          active: false, t: 0, dur: 0.65, x: 0, y: 0, color: 0xffd67a,
          ring: this.add.image(0, 0, 'atlas', 'ring_thick').setDepth(58)
            .setBlendMode(Phaser.BlendModes.ADD).setVisible(false),
          flare: this.add.image(0, 0, 'disc').setDepth(57)
            .setBlendMode(Phaser.BlendModes.ADD).setVisible(false)
        });
      }
      this.bossPhaseFx = {
        active: false, t: 0, dur: 1.15, phase: 0,
        veil: this.add.image(0, 0, 'disc').setScrollFactor(0).setDepth(196)
          .setBlendMode(Phaser.BlendModes.NORMAL).setVisible(false),
        glow: this.add.image(0, 0, 'disc').setScrollFactor(0).setDepth(197)
          .setBlendMode(Phaser.BlendModes.ADD).setVisible(false), beams: []
      };
      for (i = 0; i < 8; i++) {
        this.bossPhaseFx.beams.push(this.add.image(0, 0, 'edge').setDepth(55)
          .setBlendMode(Phaser.BlendModes.ADD).setVisible(false));
      }
      this.singularity = {
        active: false, t: 0, tick: 0, x: 0, y: 0, id: 0,
        spr: this.add.image(0, 0, 'disc').setDepth(45)
          .setBlendMode(Phaser.BlendModes.ADD).setVisible(false),
        ring: this.add.image(0, 0, 'atlas', 'ring_thick').setDepth(44)
          .setBlendMode(Phaser.BlendModes.ADD).setVisible(false),
        flash: this.add.image(0, 0, 'disc').setDepth(46)
          .setBlendMode(Phaser.BlendModes.ADD).setVisible(false)
      };
      this.rewindFx = {
        t: 0,
        ring: this.add.image(0, 0, 'atlas', 'ring_thick').setDepth(52)
          .setBlendMode(Phaser.BlendModes.ADD).setVisible(false),
        flash: this.add.image(0, 0, 'disc').setDepth(51)
          .setBlendMode(Phaser.BlendModes.ADD).setVisible(false)
      };
      this.mirrors = [];
      for (i = 0; i < 2; i++) {
        this.mirrors.push({
          active: false, x: 0, y: 0, heading: 0, cd: 0, side: i === 0 ? -1 : 1,
          spr: this.add.image(0, 0, 'atlas', 'hero_idle').setDepth(48)
            .setBlendMode(Phaser.BlendModes.ADD).setVisible(false),
          halo: this.add.image(0, 0, 'disc').setDepth(47)
            .setBlendMode(Phaser.BlendModes.ADD).setVisible(false)
        });
      }
      this.tideTargets = new Array(MAX_ENEMIES);
      this.tideTargetCount = 0;

      this.texts = [];
      for (i = 0; i < MAX_TEXTS; i++) {
        this.texts.push({
          alive: false, life: 0, vy: 0,
          obj: this.add.text(0, 0, '', {
            fontFamily: FONT_DISPLAY, fontSize: TYPE.micro + 'px',
            color: '#ffffff', fontStyle: 'bold'
          }).setOrigin(0.5).setDepth(70).setVisible(false)
        });
      }

      var pools = [this.enemies, this.gems, this.bonuses, this.weaponDrops, this.bases, this.wings, this.mirrors, this.shots,
                   this.ebolts, this.mines, this.pulses, this.beams];
      for (var pi = 0; pi < pools.length; pi++) {
        for (var pj = 0; pj < pools[pi].length; pj++) {
          this.park(pools[pi][pj].spr);
          if (pools[pi][pj].aura) this.park(pools[pi][pj].aura);
          if (pools[pi][pj].halo) this.park(pools[pi][pj].halo);
          if (pools[pi][pj].beacon) this.park(pools[pi][pj].beacon);
          if (pools[pi][pj].ring) this.park(pools[pi][pj].ring);
          if (pools[pi][pj].pillar) this.park(pools[pi][pj].pillar);
          if (pools[pi][pj].scorch) this.park(pools[pi][pj].scorch);
          if (pools[pi][pj].alarmSpr) this.park(pools[pi][pj].alarmSpr);
          if (pools[pi][pj].barBg) this.park(pools[pi][pj].barBg);
          if (pools[pi][pj].barFill) this.park(pools[pi][pj].barFill);
          if (pools[pi][pj].crown) this.park(pools[pi][pj].crown);
        }
      }
      for (i = 0; i < this.ambientEvents.length; i++) this.park(this.ambientEvents[i].spr);
      for (i = 0; i < this.texts.length; i++) this.park(this.texts[i].obj);
      for (i = 0; i < this.arcLines.length; i++) this.park(this.arcLines[i].spr);
      for (i = 0; i < this.purgeRings.length; i++) this.park(this.purgeRings[i].spr);
      for (i = 0; i < this.bossSpokes.length; i++) this.park(this.bossSpokes[i]);
      this.park(this.decoy.spr); this.park(this.decoy.halo);
      this.park(this.regionBossParts.wingL); this.park(this.regionBossParts.wingR);
      this.park(this.regionBossParts.abdomen); this.park(this.regionBossParts.proboscis);
      this.park(this.drone.spr); this.park(this.drone.halo);
      this.park(this.strike.line); this.park(this.strike.flash);
      this.park(this.strike.skyLine); this.park(this.strike.skyGlow);
      for (i = 0; i < this.airStrike.bombers.length; i++) {
        this.park(this.airStrike.bombers[i]); this.park(this.airStrike.contrails[i]);
      }
      for (i = 0; i < this.airStrike.arrows.length; i++) this.park(this.airStrike.arrows[i]);
      for (i = 0; i < this.airBombs.length; i++) this.killSprite(this.airBombs[i]);
      for (i = 0; i < this.spectacle.edges.length; i++) this.park(this.spectacle.edges[i]);
      this.park(this.spectacle.ring); this.park(this.spectacle.flashA);
      this.park(this.spectacle.flashB); this.park(this.spectacle.flashWhite);
      for (i = 0; i < this.eliteBursts.length; i++) {
        this.park(this.eliteBursts[i].ring); this.park(this.eliteBursts[i].flare);
      }
      this.park(this.bossPhaseFx.veil); this.park(this.bossPhaseFx.glow);
      for (i = 0; i < this.bossPhaseFx.beams.length; i++) this.park(this.bossPhaseFx.beams[i]);
      this.park(this.singularity.spr); this.park(this.singularity.ring); this.park(this.singularity.flash);
      this.park(this.rewindFx.ring); this.park(this.rewindFx.flash);

      this.rings = [];
      for (i = 0; i < 18; i++) {
        this.rings.push({
          alive: false, t: 0, dur: 0.3, from: 20, to: 70, alpha: 0.9,
          spr: this.add.image(0, 0, 'atlas', 'ring_thick').setDepth(59)
            .setBlendMode(Phaser.BlendModes.ADD).setVisible(false)
        });
      }
      this.husks = [];
      for (i = 0; i < 20; i++) {
        this.husks.push({
          alive: false, t: 0, dur: 0.34, x: 0, y: 0, spin: 0, scale0: 1,
          spr: this.add.image(0, 0, 'atlas', 'drifter').setDepth(41).setVisible(false)
        });
      }
      this.hpPips = [];
      for (i = 0; i < 16; i++) {
        this.hpPips.push({
          owner: null,
          crown: this.add.image(0, 0, 'atlas', 'elite_crown').setDepth(42).setVisible(false),
          bg: this.add.image(0, 0, 'atlas', 'chip').setDepth(56).setVisible(false),
          fill: this.add.image(0, 0, 'edge').setDepth(57).setVisible(false)
        });
      }

      this.hash = new Map();
      this.scratch = [];
    },

    contactRing: function (x, y, from, to, dur, tint, alpha) {
      for (var i = 0; i < this.rings.length; i++) {
        var r = this.rings[i];
        if (r.alive) continue;
        r.alive = true; r.t = 0; r.dur = dur; r.from = from; r.to = to;
        r.alpha = alpha == null ? 0.85 : alpha;
        this.unpark(r.spr);
        r.spr.setPosition(x, y).setTint(tint).setAlpha(r.alpha)
          .setDisplaySize(from, from);
        return r;
      }
      return null;
    },

    spawnHusk: function (e) {
      for (var i = 0; i < this.husks.length; i++) {
        var hk = this.husks[i];
        if (hk.alive) continue;
        hk.alive = true; hk.t = 0;
        hk.dur = e.boss ? 0.9 : (e.elite ? 0.45 : 0.26);
        hk.x = e.x; hk.y = e.y;
        hk.spin = (Math.random() < 0.5 ? -1 : 1) * (e.boss ? 2.2 : 7.5);
        hk.scale0 = e.spr.scaleX;
        this.unpark(hk.spr);
        // Region variants and Swarm Lords have fams outside FAMILY - the
        // husk must wear whatever frame the corpse was already wearing.
        // (FAMILY[e.fam] was undefined for them: first variant kill threw
        // and froze the sim - the owner's 1-minute freeze.)
        hk.spr.setTexture('atlas', e.spr.frame && e.spr.frame.name
          ? e.spr.frame.name
          : (FAMILY[e.fam] || FAMILY.drifter).frame)
          .setPosition(e.x, e.y).setRotation(e.spr.rotation)
          .setScale(hk.scale0).setAlpha(0.9)
          .setTintFill(0xffffff);
        return hk;
      }
      return null;
    },

    spawnWingHusk: function (w) {
      for (var i = 0; i < this.husks.length; i++) {
        var hk = this.husks[i];
        if (hk.alive) continue;
        hk.alive = true; hk.t = 0; hk.dur = 0.24;
        hk.x = w.x; hk.y = w.y;
        hk.spin = 6.5;
        hk.scale0 = 0.64;
        this.unpark(hk.spr);
        hk.spr.setTexture('atlas', 'wingman')
          .setPosition(w.x, w.y).setRotation(w.spr.rotation)
          .setScale(hk.scale0).setAlpha(0.82)
          .setTintFill(0xffffff);
        return hk;
      }
      return null;
    },

    buildHud: function () {
      var hudScene = this;
      var w = this.scale.width, h = this.scale.height;
      var L = 12 + SAFE.left;
      var R = w - 12 - SAFE.right;
      var top = 8 + SAFE.top;
      var innerW = R - L;
      this.hudTop = top;
      this.hud = this.add.container(0, 0).setScrollFactor(0).setDepth(200);

      // The primary HUD is deliberately one compact row. Progress that is
      // not actionable every second is represented by the draft/banner flow,
      // not a second permanent meter band.
      var bandH = 42 + SAFE.top;
      var bar = this.add.rectangle(w / 2, bandH / 2, w, bandH, 0x030a12, 0.78).setScrollFactor(0);
      var barEdge = this.add.image(w / 2, bandH, 'edge').setDisplaySize(w, 3)
        .setTint(0x54d6ff).setAlpha(0.55).setScrollFactor(0)
        .setBlendMode(Phaser.BlendModes.ADD);

      var primaryY = top + 17;
      var hpY = primaryY;
      this.hpIcon = this.add.image(L + 9, hpY, 'atlas', 'hi_hp').setScrollFactor(0).setScale(0.47);
      var barX = L + 24;
      var barW = Math.max(60, Math.min(116, innerW * 0.30) - 24);
      this.hpTrack = this.add.image(barX, hpY, 'atlas', 'bar_hp').setOrigin(0, 0.5)
        .setDisplaySize(barW, 16).setScrollFactor(0);
      this.hpGhost = this.add.rectangle(barX + 2, hpY, barW - 4, 10, 0xff5a6a, 0.5)
        .setOrigin(0, 0.5).setScrollFactor(0);
      this.hpFill = this.add.rectangle(barX + 2, hpY, barW - 4, 10, 0x39e08a)
        .setOrigin(0, 0.5).setScrollFactor(0);
      this.hpText = this.add.text(L + 20 + barW, hpY, '100', {
        fontFamily: FONT_DISPLAY, fontSize: TYPE.micro + 'px', color: '#eaf7ff', fontStyle: 'bold'
      }).setOrigin(1, 0.5).setScrollFactor(0);
      this.hpBarX = barX; this.hpBarW = barW;

      // Inline chips share the primary line with the timer and score. Kill
      // count leaves the live HUD; it remains available on pause/end screens.
      var lvX = L + Math.min(112, Math.max(86, innerW * 0.30)) + 16;
      this.lvChip = this.add.image(lvX, primaryY, 'atlas', 'chip')
        .setDisplaySize(34, 21).setScrollFactor(0).setAlpha(0.82);
      this.lvText = this.add.text(lvX, primaryY, 'LV1', {
        fontFamily: FONT_DISPLAY, fontSize: TYPE.micro + 'px', color: '#8effd8', fontStyle: 'bold'
      }).setOrigin(0.5).setScrollFactor(0);

      this.timeIcon = this.add.image(w / 2 - 28, primaryY, 'atlas', 'hi_time')
        .setScrollFactor(0).setScale(0.34).setAlpha(0.78);
      this.timeText = this.add.text(w / 2 + 2, primaryY, '00:00', {
        fontFamily: FONT_DISPLAY, fontSize: TYPE.head + 'px', color: '#e7fff7', fontStyle: 'bold'
      }).setOrigin(0.5).setScrollFactor(0);

      this.gemIcon = this.add.image(w / 2 + 29, primaryY, 'atlas', 'hi_gem')
        .setScrollFactor(0).setScale(0.34).setAlpha(0.82);
      this.gemChip = this.add.text(w / 2 + 39, primaryY, '0', {
        fontFamily: FONT_DISPLAY, fontSize: TYPE.micro + 'px', color: '#ffd67a', fontStyle: 'bold'
      }).setOrigin(0, 0.5).setScrollFactor(0);
      this.comboChip = this.add.text(w / 2 + 66, primaryY, '', {
        fontFamily: FONT_DISPLAY, fontSize: TYPE.micro + 'px', color: '#ffb45a', fontStyle: 'bold'
      }).setOrigin(0, 0.5).setScrollFactor(0).setAlpha(0);
      this.scoreText = this.add.text(R, primaryY, 'S 0', {
        fontFamily: FONT_DISPLAY, fontSize: TYPE.micro + 'px', color: '#ffd67a', fontStyle: 'bold'
      }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(200);

      // Objective is an edge cue beside the radar. Its icon rotates toward
      // the target; the old explanatory text is intentionally gone.
      this.objectiveHud = this.add.container(R - 48, h - 151 - SAFE.bottom).setScrollFactor(0).setDepth(207);
      this.objectiveChevron = this.add.text(-17, 0, '>', {
        fontFamily: FONT_DISPLAY, fontSize: TYPE.body + 'px', color: '#ffd67a', fontStyle: 'bold'
      }).setOrigin(0.5);
      this.objectiveArrow = this.add.image(0, 0, 'atlas', 'ic_lance').setScale(0.25)
        .setTint(0xffd67a).setBlendMode(Phaser.BlendModes.ADD);
      this.objectiveColor = '#ffd67a';
      this.objectiveHud.add([this.objectiveChevron, this.objectiveArrow]);
      this.lockToScreen(this.objectiveHud);
      this.comboHero = neonText(this, w / 2, h * 0.49, '', TYPE.hero, '#ffd67a');
      this.comboHero.setScrollFactor(0).setDepth(218).setVisible(false);
      this.comboHeroT = 0;
      this.hudPopTexts = [this.lvText, this.gemChip, this.comboChip, this.scoreText];

      this.buffHud = this.add.container(L, bandH + 40).setScrollFactor(0).setDepth(206);
      this.buffSlots = [];
      var buffCols = Math.min(4, BONUS_BUFFS.length);
      var slotW = innerW / buffCols;
      for (var bsi = 0; bsi < BONUS_BUFFS.length; bsi++) {
        var bd = BONUS_BUFFS[bsi];
        var bc = bsi % buffCols, br = Math.floor(bsi / buffCols);
        var slot = this.add.container(slotW / 2 + bc * slotW, br * 34).setVisible(false);
        var sbg = this.add.image(0, 0, 'atlas', 'chip').setDisplaySize(Math.min(82, slotW - 4), 31)
          .setAlpha(0.94);
        var sic = this.add.image(-slotW * 0.29, -2, 'atlas', bd.frame).setScale(0.43)
          .setTint(bd.color).setBlendMode(Phaser.BlendModes.ADD);
        var stimer = this.add.text(slotW * 0.05, -6, '0', {
          fontFamily: FONT_DISPLAY, fontSize: TYPE.micro + 'px', color: '#e7fff7', fontStyle: 'bold'
        }).setOrigin(0, 0.5);
        var spips = [];
        for (var bpi = 0; bpi < 5; bpi++) {
          spips.push(this.add.rectangle(slotW * 0.05 + bpi * 7, 9, 5, 4, 0x2b4756));
        }
        slot.add([sbg, sic, stimer].concat(spips));
        this.buffHud.add(slot);
        this.buffSlots.push({ slot: slot, icon: sic, timer: stimer, pips: spips, max: bd.cap || 1, lit: -1 });
      }
      this.lockToScreen(this.buffHud);

      this.tideHud = this.add.container(L, bandH + 76).setScrollFactor(0).setDepth(207);
      this.tideSlots = [];
      var tideSlotW = innerW / TIDE_HUD.length;
      for (var tsi = 0; tsi < TIDE_HUD.length; tsi++) {
        var td = TIDE_HUD[tsi];
        var tideSlot = this.add.container(tideSlotW / 2 + tsi * tideSlotW, 0).setVisible(false);
        var tideFrame = this.add.image(0, 0, 'atlas', 'ring_thick')
          .setDisplaySize(Math.min(90, tideSlotW - 3), 34).setTint(0xffd67a).setAlpha(0.72)
          .setBlendMode(Phaser.BlendModes.ADD);
        var tideIcon = this.add.image(-tideSlotW * 0.29, -1, 'atlas', td.frame)
          .setScale(0.43).setTint(td.color).setBlendMode(Phaser.BlendModes.ADD);
        var tideTimer = this.add.text(tideSlotW * 0.02, -6, '0', {
          fontFamily: FONT_DISPLAY, fontSize: TYPE.micro + 'px', color: '#fff3bf', fontStyle: 'bold'
        }).setOrigin(0, 0.5);
        var tidePips = [];
        for (var tpi = 0; tpi < 4; tpi++) {
          tidePips.push(this.add.rectangle(tideSlotW * 0.02 + tpi * 7, 9, 5, 4, 0x6b5730));
        }
        tideSlot.add([tideFrame, tideIcon, tideTimer].concat(tidePips));
        this.tideHud.add(tideSlot);
        this.tideSlots.push({ slot: tideSlot, icon: tideIcon, timer: tideTimer, pips: tidePips, lit: -1 });
      }
      this.lockToScreen(this.tideHud);

      // One icon-only secondary cluster. The pips and weapon glyphs carry
      // the meaning; label and unlock-detail text now live in banners.
      var clusterY = bandH + 13;
      this.clusterHud = this.add.container(L, clusterY).setScrollFactor(0).setDepth(206);
      var clusterBg = this.add.image(innerW / 2, 0, 'atlas', 'chip')
        .setDisplaySize(innerW, 22).setAlpha(0.64);
      this.clusterHud.add(clusterBg);
      this.formationPips = [];
      for (var fpi = 0; fpi < WING_SLOTS.length; fpi++) {
        this.formationPips.push(this.add.rectangle(13 + fpi * 10, 0, 6, 6, 0x2b4756));
      }
      this.strikePips = [];
      for (var spi = 0; spi < 4; spi++) {
        this.strikePips.push(this.add.rectangle(59 + spi * 10, 0, 6, 6, 0x2b4756));
      }
      this.strikePipsLit = -1;
      var railStart = Math.min(124, Math.max(96, innerW * 0.42));
      var railW = Math.max(76, innerW - railStart - 18);
      this.weaponSlotsHud = [];
      var railStep = railW / 3;
      for (var wsi = 0; wsi < 3; wsi++) {
        var wx = railStart + railStep * (wsi + 0.5);
        var wslotBg = this.add.image(wx, 0, 'atlas', wsi === 0 ? 'card_hot' : 'card')
          .setDisplaySize(24, 21).setAlpha(0.72);
        var wslotTrim = this.add.image(wx, 0, 'atlas', 'ring').setScale(0.17)
          .setTint(0xffd67a).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
        var wslotIcon = this.add.image(wx, 0, 'atlas', wsi === 0 ? 'ic_lance' : 'ic_lock')
          .setScale(0.22).setTint(0x7f99a7).setBlendMode(Phaser.BlendModes.ADD);
        this.clusterHud.add([wslotBg, wslotTrim, wslotIcon]);
        this.weaponSlotsHud.push({ bg: wslotBg, trim: wslotTrim, icon: wslotIcon, text: null, hint: null });
      }
      this.weaponIcon = this.weaponSlotsHud[0].icon;
      this.weaponGlyphTrim = this.weaponSlotsHud[0].trim;
      this.weaponText = this.weaponSlotsHud[0].text;
      this.weaponSwapButton = this.add.image(innerW - 9, 0, 'atlas', 'ic_orbit').setScale(0.17)
        .setTint(0xffd67a).setAlpha(0.84).setBlendMode(Phaser.BlendModes.ADD).setInteractive({ useHandCursor: true });
      this.weaponSwapButton.on('pointerdown', function () {
        if (hudScene && typeof hudScene.rotateWeaponSlots === 'function') hudScene.rotateWeaponSlots();
      });
      this.clusterHud.add(this.formationPips.concat(this.strikePips, [this.weaponSwapButton]));
      this.formationHud = this.clusterHud;
      this.strikeHud = this.clusterHud;
      this.weaponHud = this.clusterHud;
      this.lockToScreen(this.clusterHud);

      this.aegisShell = this.add.image(0, 0, 'atlas', 'ring_thick').setDepth(49)
        .setTint(0x6de8ff).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
      this.aegisTimerRing = this.add.image(0, 0, 'atlas', 'ring').setDepth(51)
        .setTint(0xd9fbff).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
      this.purgeShock = this.add.image(w / 2, h / 2, 'atlas', 'ring_thick')
        .setScrollFactor(0).setDepth(222).setTint(0x8effd8)
        .setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
      this.purgeFlash = this.add.image(w / 2, h / 2, 'disc')
        .setScrollFactor(0).setDepth(221).setTint(0x8effd8)
        .setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
      this.park(this.purgeShock);
      this.park(this.purgeFlash);
      this.tideBeatRing = this.add.image(w / 2, h / 2, 'atlas', 'ring_thick')
        .setScrollFactor(0).setDepth(218).setTint(0xffd67a)
        .setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
      this.tideBeatFlash = this.add.image(w / 2, h / 2, 'disc')
        .setScrollFactor(0).setDepth(217).setTint(0xffd67a)
        .setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
      this.park(this.tideBeatRing);
      this.park(this.tideBeatFlash);

      this.banner = this.add.container(w / 2, h * 0.3).setScrollFactor(0).setDepth(210).setAlpha(0);
      var bnW = Math.min(Math.max(248, w * 0.76), 360);
      var bnBg = this.add.image(0, 0, 'atlas', 'panel').setDisplaySize(bnW, 62);
      var bnGlow = this.add.image(0, 0, 'disc').setDisplaySize(bnW * 1.1, 110)
        .setTint(0x54d6ff).setAlpha(0.16).setBlendMode(Phaser.BlendModes.ADD);
      this.bannerTitle = neonText(this, 0, -10, '', TYPE.sub, '#c9ffe9');
      this.bannerSub = bodyText(this, 0, 12, '', TYPE.micro, '#8fb3c4');
      this.banner.add([bnGlow, bnBg, this.bannerTitle, this.bannerSub]);
      this.bannerBg = bnBg;
      this.bannerGlow = bnGlow;
      this.bannerWide = bnW;
      this.bannerActive = false;
      this.bannerT = 0;
      this.bannerDur = 0;
      this.bannerGiant = false;

      var bbW = Math.min(320, w - 24);
      this.bossBar = this.add.container(w / 2, h - 46 - SAFE.bottom)
        .setScrollFactor(0).setDepth(205).setVisible(false);
      var bbBg = this.add.image(0, 0, 'atlas', 'bar_hp').setDisplaySize(bbW, 16).setTint(0x9b7ad0);
      this.bossFill = this.add.rectangle(-bbW / 2 + 2, 0, bbW - 4, 10, 0xd59cff).setOrigin(0, 0.5);
      var bbTxt = neonText(this, 0, -18, 'MERIDIAN CORE', TYPE.micro, '#efcfff');
      this.bossBarTitle = bbTxt;
      this.bossBar.add([bbBg, this.bossFill, bbTxt]);

      this.vignette = this.add.image(w / 2, h / 2, 'disc').setScrollFactor(0).setDepth(220)
        .setDisplaySize(w * 2.4, h * 2.4).setTint(0xff2a3a).setAlpha(0)
        .setBlendMode(Phaser.BlendModes.ADD);

      this.dangerEdges = [];
      var strips = [
        [w / 2, 0, w, 120, 90], [w / 2, h, w, 120, 270],
        [0, h / 2, h, 110, 0], [w, h / 2, h, 110, 180]
      ];
      for (var si = 0; si < strips.length; si++) {
        var st = strips[si];
        var img = this.add.image(st[0], st[1], 'edge')
          .setScrollFactor(0).setDepth(198).setBlendMode(Phaser.BlendModes.ADD)
          .setTint(0xff5a4a).setAlpha(0).setVisible(false);
        img.setAngle(st[4]);
        img.setDisplaySize(st[3], st[2]);
        this.dangerEdges.push(img);
      }
      this.buffGlowEdges = [];
      for (var bge = 0; bge < strips.length; bge++) {
        var bst = strips[bge];
        var bgEdge = this.add.image(bst[0], bst[1], 'edge')
          .setScrollFactor(0).setDepth(219).setBlendMode(Phaser.BlendModes.ADD)
          .setAlpha(0).setVisible(false);
        bgEdge.setAngle(bst[4]).setDisplaySize(bst[3], bst[2]);
        this.buffGlowEdges.push(bgEdge);
        this.park(bgEdge);
      }
      this.frameVig = this.add.image(w / 2, h / 2, 'disc').setScrollFactor(0).setDepth(197)
        .setDisplaySize(w * 2.9, h * 2.1).setTint(0x000000).setAlpha(0);
      this.frameVigEdges = [];
      var vstrips = [
        [w / 2, 0, w, 150, 90], [w / 2, h, w, 190, 270],
        [0, h / 2, h, 120, 0], [w, h / 2, h, 120, 180]
      ];
      for (var vi = 0; vi < vstrips.length; vi++) {
        var vs = vstrips[vi];
        var vg = this.add.image(vs[0], vs[1], 'edge')
          .setScrollFactor(0).setDepth(196).setTint(0x02060b).setAlpha(0.62);
        vg.setAngle(vs[4]);
        vg.setDisplaySize(vs[3], vs[2]);
        this.frameVigEdges.push(vg);
      }

      this.minimap = this.add.container(R - 48, h - 92 - SAFE.bottom)
        .setScrollFactor(0).setDepth(207);
      var radarBg = this.add.image(0, 0, 'atlas', 'panel_deep')
        .setDisplaySize(96, 96).setAlpha(0.86);
      this.radarRing = this.add.image(0, 0, 'atlas', 'ring')
        .setDisplaySize(82, 82).setTint(0x54d6ff).setAlpha(0.3)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.minimap.add([radarBg, this.radarRing]);
      this.radarDots = [];
      for (var mdi = 0; mdi < MAX_MINIMAP_DOTS; mdi++) {
        var dot = this.add.rectangle(0, 0, 5, 5, 0xff756a).setAlpha(0.9);
        this.radarDots.push(dot);
        this.minimap.add(dot);
      }
      this.radarPlayer = this.add.rectangle(0, 0, 7, 7, 0x8effd8).setDepth(2);
      this.minimap.add(this.radarPlayer);
      this.radarLabel = bodyText(this, 0, 44, 'RADAR', TYPE.micro, '#6f93a5');
      this.radarRegion = neonText(this, 0, -43, 'MVR', TYPE.micro, '#8effd8');
      this.radarMode = bodyText(this, 0, 54, 'REGION RING', TYPE.micro, '#6f93a5');
      this.minimap.add([this.radarLabel, this.radarRegion, this.radarMode]);
      this.lockToScreen(this.minimap);

      var pauseBtn = this.add.container(R - 22, bandH + 20).setScrollFactor(0).setDepth(230);
      var pbg = this.add.image(0, 0, 'atlas', 'chip').setDisplaySize(44, 34).setAlpha(0.92);
      var pico = this.add.text(0, 0, '| |', {
        fontFamily: FONT_DISPLAY, fontSize: TYPE.label + 'px', color: '#bcd9e6', fontStyle: 'bold'
      }).setOrigin(0.5);
      pauseBtn.add([pbg, pico]);
      pbg.setInteractive({ useHandCursor: true });
      var scene = this;
      pbg.on('pointerdown', function () { scene.openPause(); });
      this.pauseBtn = pauseBtn;

      this.hud.add([bar, barEdge]);
    },

    bindInput: function () {
      var scene = this;
      this.input.on('pointerdown', function (p) {
        if (scene.state !== 'playing') return;
        if (scene.stick.active) return;
        scene.stick.active = true;
        scene.stick.id = p.id;
        scene.stick.bx = p.x;
        scene.stick.by = p.y;
        scene.stick.dx = 0;
        scene.stick.dy = 0;
        scene.stickRing.setPosition(p.x, p.y).setAlpha(0.16);
        scene.stickNub.setPosition(p.x, p.y).setAlpha(0.5);
      });
      this.input.on('pointermove', function (p) {
        if (!scene.stick.active || p.id !== scene.stick.id) return;
        var dx = p.x - scene.stick.bx, dy = p.y - scene.stick.by;
        var len = Math.sqrt(dx * dx + dy * dy);
        var max = 62;
        if (len > max) { dx = dx / len * max; dy = dy / len * max; }
        if (len > max * 1.35) {
          scene.stick.bx = p.x - dx;
          scene.stick.by = p.y - dy;
          scene.stickRing.setPosition(scene.stick.bx, scene.stick.by);
        }
        scene.stick.dx = dx / max;
        scene.stick.dy = dy / max;
        scene.stickNub.setPosition(scene.stick.bx + dx, scene.stick.by + dy);
      });
      function release(p) {
        if (p && scene.state === 'playing' && p.id === scene.stick.id) {
          var held = p.upTime - p.downTime;
          var moved = Phaser.Math.Distance.Between(p.x, p.y, p.downX, p.downY);
          if (held < 260 && moved < 18) {
            if (scene.lastTapAt && p.upTime - scene.lastTapAt < 340 &&
                Phaser.Math.Distance.Between(p.x, p.y, scene.lastTapX, scene.lastTapY) < 90) {
              scene.lastTapAt = 0;
              scene.tryCallAirstrike();
            } else {
              scene.lastTapAt = p.upTime; scene.lastTapX = p.x; scene.lastTapY = p.y;
            }
          } else scene.lastTapAt = 0;
        }
        if (p && p.id !== scene.stick.id) return;
        scene.clearStick();
      }
      this.input.on('pointerup', release);
      this.input.on('pointerupoutside', release);

      this.winRelease = function () { scene.clearStick(); };
      window.addEventListener('pointercancel', this.winRelease, { passive: true });
      window.addEventListener('lostpointercapture', this.winRelease, { passive: true });
      window.addEventListener('blur', this.winRelease);
      document.addEventListener('visibilitychange', this.winRelease);

      this.keys = this.input.keyboard.addKeys({
        up: 'W', down: 'S', left: 'A', right: 'D',
        aup: 'UP', adown: 'DOWN', aleft: 'LEFT', aright: 'RIGHT',
        one: 'ONE', two: 'TWO', three: 'THREE',
        pause: 'ESC', enter: 'ENTER', space: 'SPACE'
      });
      this.input.keyboard.on('keydown-ESC', function () { scene.togglePause(); });
      this.input.keyboard.on('keydown-P', function () { scene.togglePause(); });
    },

    clearStick: function () {
      this.stick.active = false;
      this.stick.id = null;
      this.stick.dx = 0;
      this.stick.dy = 0;
      if (this.stickRing) { this.stickRing.setAlpha(0); this.stickNub.setAlpha(0); }
    },

    clearKeys: function () {
      if (!this.keys) return;
      for (var k in this.keys) {
        if (this.keys[k] && this.keys[k].reset) this.keys[k].reset();
      }
    },

    resetRun: function () {
      var i;
      resetSeed();
      for (i = 0; i < this.enemies.length; i++) this.killSprite(this.enemies[i]);
      for (i = 0; i < this.gems.length; i++) this.killSprite(this.gems[i]);
      for (i = 0; i < this.bonuses.length; i++) this.killSprite(this.bonuses[i]);
      for (i = 0; i < this.weaponDrops.length; i++) this.killSprite(this.weaponDrops[i]);
      for (i = 0; i < this.bases.length; i++) {
        this.killSprite(this.bases[i]);
        this.bases[i].destroying = false;
        this.bases[i].collapseT = 0;
      }
      for (i = 0; i < this.ambientEvents.length; i++) {
        this.ambientEvents[i].alive = false;
        this.park(this.ambientEvents[i].spr);
      }
      for (i = 0; i < this.wings.length; i++) this.killSprite(this.wings[i]);
      for (i = 0; i < this.mirrors.length; i++) {
        this.mirrors[i].active = false;
        this.killSprite(this.mirrors[i]);
      }
      for (i = 0; i < this.shots.length; i++) this.killSprite(this.shots[i]);
      this.liveShots = 0;
      for (i = 0; i < this.ebolts.length; i++) this.killSprite(this.ebolts[i]);
      for (i = 0; i < this.mines.length; i++) this.killSprite(this.mines[i]);
      for (i = 0; i < this.pulses.length; i++) this.killSprite(this.pulses[i]);
      for (i = 0; i < this.beams.length; i++) this.killSprite(this.beams[i]);
      for (i = 0; i < this.texts.length; i++) { this.texts[i].alive = false; this.park(this.texts[i].obj); }
      for (i = 0; i < this.rings.length; i++) this.killSprite(this.rings[i]);
      for (i = 0; i < this.husks.length; i++) this.killSprite(this.husks[i]);
      for (i = 0; i < this.arcLines.length; i++) this.killSprite(this.arcLines[i]);
      for (i = 0; i < this.purgeRings.length; i++) this.killSprite(this.purgeRings[i]);
      for (i = 0; i < this.bossSpokes.length; i++) this.park(this.bossSpokes[i]);
      this.bossSpokeCount = 0;
      this.park(this.decoy.spr); this.park(this.decoy.halo);
      this.park(this.regionBossParts.wingL); this.park(this.regionBossParts.wingR);
      this.park(this.regionBossParts.abdomen); this.park(this.regionBossParts.proboscis);
      this.park(this.drone.spr); this.park(this.drone.halo);
      this.drone.active = false;
      this.park(this.strike.line); this.park(this.strike.flash);
      this.park(this.strike.skyLine); this.park(this.strike.skyGlow);
      this.strike.active = false;
      this.strike.afterT = 0;
      this.airStrike.active = false;
      this.airStrike.t = 0;
      this.cluster.active = false;
      for (i = 0; i < this.airStrike.bombers.length; i++) {
        this.park(this.airStrike.bombers[i]); this.park(this.airStrike.contrails[i]);
      }
      for (i = 0; i < this.airStrike.arrows.length; i++) this.park(this.airStrike.arrows[i]);
      for (i = 0; i < this.airBombs.length; i++) this.killSprite(this.airBombs[i]);
      this.spectacle.active = false; this.spectacle.queued = false; this.spectacle.qDelay = 0; this.spectacle.qAge = 0;
      this.bannerActive = false; this.bannerT = 0; this.bannerDur = 0;
      this.banner.setAlpha(0).setScale(1).setX(this.scale.width / 2);
      this.park(this.spectacle.ring); this.park(this.spectacle.flashA);
      this.park(this.spectacle.flashB); this.park(this.spectacle.flashWhite);
      for (i = 0; i < this.spectacle.edges.length; i++) this.park(this.spectacle.edges[i]);
      for (i = 0; i < this.eliteBursts.length; i++) {
        this.eliteBursts[i].active = false;
        this.park(this.eliteBursts[i].ring); this.park(this.eliteBursts[i].flare);
      }
      this.bossPhaseFx.active = false;
      this.park(this.bossPhaseFx.veil); this.park(this.bossPhaseFx.glow);
      for (i = 0; i < this.bossPhaseFx.beams.length; i++) this.park(this.bossPhaseFx.beams[i]);
      this.cameraZoomT = 0; this.cameraZoomDur = 0; this.cameraZoomAmount = 0;
      this.singularity.active = false;
      this.singularity.t = 0;
      this.rewindFx.t = 0;
      this.park(this.singularity.spr); this.park(this.singularity.ring); this.park(this.singularity.flash);
      this.park(this.rewindFx.ring); this.park(this.rewindFx.flash);
      for (i = 0; i < this.hpPips.length; i++) {
        this.hpPips[i].owner = null;
        this.park(this.hpPips[i].bg);
        this.park(this.hpPips[i].fill);
        this.park(this.hpPips[i].crown);
      }
      this.enemyCount = 0;
      this.baseCount = 0;
      this.gemHead = 0;
      this.bossRef = null;
      this.regionBossRef = null;
      this.suppressBonusDrops = false;
      for (i = 0; i < this.landmarkPool.length; i++) {
        this.landmarkPool[i].active = false;
        this.landmarkPool[i].defIndex = -1;
        this.park(this.landmarkPool[i].spr);
      }
      this.activeRegionKey = '';
      this.regionFieldTask = null;
      for (i = 0; i < this.hatchQueue.length; i++) this.hatchQueue[i].active = false;

      this.runToken = (this.runToken || 0) + 1;
      this.timers.length = 0;
      this.pendingEnd = null;
      this.watchdog.maxStepMs = 0;
      this.watchdog.lastBeatAgoMs = 0;
      for (var wdr = 0; wdr < this.watchdog.longSteps.length; wdr++) {
        this.watchdog.longSteps[wdr].atRunTime = 0;
        this.watchdog.longSteps[wdr].ms = 0;
        this.watchdog.longSteps[wdr].phase = '';
      }
      this.watchdogLastFrameAt = performance.now();
      this.watchdogPhase = 'reset';
      if (this.telRing) { this.telRing.destroy(); this.telRing = null; }
      if (this.telZone) { this.telZone.destroy(); this.telZone = null; }
      if (this.telCount) { this.telCount.destroy(); this.telCount = null; }

      this.clearStick();
      this.clearKeys();
      kit.input.clearAll();

      var mPower = metaLevel('power'), mVigor = metaLevel('vigor');
      var mHaste = metaLevel('haste'), mDraw = metaLevel('draw');
      var mFortune = metaLevel('fortune');
      var hHull = hangarLevel('hull'), hReactor = hangarLevel('reactor');
      var hThrusters = hangarLevel('thrusters'), hMagnet = hangarLevel('magnet');
      var hWingBay = hangarLevel('wingBay'), hFortune = hangarLevel('fortune');
      var hGunDeck = hangarLevel('gunDeck');
      var startingWeapon = profile.hangar.equippedWeapon;
      if (!WEAPON_BY_KEY[startingWeapon] || !profile.hangar.weaponsSeen[startingWeapon]) startingWeapon = 'bolt-lance';
      var seenWeapons = {};
      var seenCount = 0;
      for (var hwi = 0; hwi < WEAPONS.length; hwi++) {
        var seenKey = WEAPONS[hwi].key;
        if (profile.hangar.weaponsSeen[seenKey]) { seenWeapons[seenKey] = true; seenCount++; }
      }

      // Campaign wiring: a pending level swaps the run's schedule tables and
      // difficulty envelope; null means the classic ten-minute Core run.
      this.level = Game.pendingLevel || null;
      var L = this.level;
      this.activeWaves = L ? L.waves : WAVES;
      this.activeRunSeconds = L ? L.duration : RUN_SECONDS;
      this.activeBases = L ? (L.bases || []).slice() : BASE_SCHEDULE;
      this.activeRegionBossSchedule = L ? (L.regionBosses || []) : [];
      this.campaignFinal = L ? (L.finalBoss || null) : null;
      this.campaignObjHudKey = -2;
      var lm = L && L.mods ? L.mods : null;
      this.levelMods = {
        enemyHp: (lm && lm.enemyHp) || 1, enemyDmg: (lm && lm.enemyDmg) || 1,
        enemySpeed: (lm && lm.enemySpeed) || 1, spawnRate: (lm && lm.spawnRate) || 1,
        xp: (lm && lm.xp) || 1
      };

      this.p = {
        x: 0, y: 0, vx: 0, vy: 0, r: 15,
        hp: Math.round((100 + mVigor * 15) * (1 + hHull * 0.06)),
        maxHp: Math.round((100 + mVigor * 15) * (1 + hHull * 0.06)),
        speed: 196 * (1 + mHaste * 0.05) * (1 + hThrusters * 0.05),
        magnet: (96 + mDraw * 25) * (1 + hMagnet * 0.06),
        damage: 1 * (1 + mPower * 0.08),
        armor: 0, crit: 0, regen: 0, weaponRate: 0, hangarRate: hReactor * 0.05, multishot: 0,
        projectileDamage: 1, projectileSpeed: 1, projectileSize: 1, pierce: 0,
        primaryCrit: 0, wingDamage: 0.56, wingRevive: 0, wingReviveUsed: false,
        drift: 0,
        gemBonus: 1 + mFortune * 0.10 + hFortune * 0.06,
        hangarDropLuck: hFortune * 0.07,
        hangarWingBay: hWingBay,
        hangarGunDeck: hGunDeck,
        face: 0, iframes: 0, failsafe: metaLevel('second') > 0,
        ranks: {}, hurtT: 0
      };
      this.p.damageBase = this.p.damage;
      this.p.speedBase = this.p.speed;
      for (i = 0; i < UPGRADES.length; i++) this.p.ranks[UPGRADES[i].key] = 0;
      this.p.ranks.lance = 1;   // Bolt Lance mastery also calibrates the primary lane
      this.p.ranks.weapon_bolt = 1;
      for (i = 0; i < UPGRADES.length; i++) {
        if (UPGRADES[i].weapon === startingWeapon) this.p.ranks[UPGRADES[i].key] = 1;
      }

      this.cool = { primary: 0.25, primarySlots: [0.25, 0.52, 0.78], orbit: 0, pulse: 1.2, wisp: 0.9, beam: 2.0, mine: 1.6 };
      this.orbitAngle = 0;
      this.hudTimeValue = -1;

      this.run = {
        time: 0, kills: 0, level: 1, xp: 0, xpNext: 15,
        gems: 0, combo: 0, comboT: 0, wave: 0, waveIdx: 0,
        spawnT: 1.0, eliteMin: 0, bossUp: false, bossPending: false, bossDown: false,
        score: 0, bonus: 0, scoreFlareBank: 0, danger: 0, bonusDrops: 0, bonusSeen: false,
        bonusLastDrop: -99, musicHeat: false, wings: 0, bossPhase: 0,
        regionKey: 'meridian-verge', regionsSeen: 1, regionSeen: { 'meridian-verge': true },
        landmarkGemsSeen: {},
        strikeSerial: 0,
        strikeCharges: 3, openingAirstrikeDone: false, openingDropDone: false, openingEnemyDone: false,
        equippedWeapon: startingWeapon, weaponSlots: [startingWeapon, '', ''],
        slotsUnlocked: hGunDeck > 0 ? (hGunDeck > 1 ? 3 : 2) : 1,
        weaponSeen: seenWeapons, weaponsSeen: seenCount,
        weaponDrops: 0, weaponLastDrop: -99, weaponDropCursor: 1, weaponSerial: 0, weaponGuaranteeDone: false, weaponGuarantee2Done: false,
        regionEnemiesSeen: {}, regionBossActive: '', regionBossSeen: {}, regionBossDefeated: {},
        regionBossKills: 0, regionWeaponRewarded: {}, drainMark: 0, drainMarkX: 0, drainMarkY: 0,
        overcharge: 0, wingReviveUsed: false,
        wingGuaranteeDone: false, wingRecoveryDue: -1, wingRecoveryArmed: false,
        baseSpawned: new Array(this.activeBases.length), basePressure: 0, relayBoost: 0,
        campaignEventIdx: 0, campaignRbSpawned: new Array(this.activeRegionBossSchedule.length),
        campaignFinalSpawned: false, campaignEscortIdx: 0, campaignEscortCd: 0,
        campaignObjs: [], surviveDone: false, wingLost: false, campaignObjCursor: 0,
        ambientT: 13, ambientKind: 0,
        basesKilled: 0, lastTideDrop: -99, tideDrops: 0, tideOdds: 0, tideWeight: 0,
        lastTideTurner: '', lastWingLoss: -99, tideBeatT: 0, tideBeatDur: 0,
        tideBeatColor: 0xffd67a, tideSerial: 0, tideBursting: false, tideEffectBusy: false,
        hullHistoryCursor: 0, hullHistoryCount: 0,
        tides: { 'last-stand': 0, 'singularity-core': 0, 'rally-beacon': 0,
          'chrono-rewind': 0, 'mirror-squadron': 0, 'bounty-frenzy': 0 },
        buffs: { aegis: 0, overdrive: 0, arsenal: 0, chain: 0, dilation: 0,
          magnet: 0, decoy: 0, flare: 0, drone: 0, freeze: 0, doubler: 0,
          vampire: 0, reflector: 0, gravity: 0, cloak: 0 }
      };
      this.state = 'playing';
      this.activeRegionKey = '';
      this.regionTourActive = false;
      this.regionTourStep = 0;
      this.regionTourT = 0;
      this.draftCards = null;
      this.hpShown = 1;
      this.playerHeading = 0;
      this.playerBank = 0;
      this.trailT = 0;
      this.buffGlowT = 0;
      this.minimapT = 0;
      this.purgePre = 0;
      this.decoyX = 0; this.decoyY = 0;
      if (!this.hullHistoryHp) {
        this.hullHistoryHp = new Array(600);
        this.hullHistoryTime = new Array(600);
      }
      for (i = 0; i < this.hullHistoryHp.length; i++) {
        this.hullHistoryHp[i] = this.p.hp;
        this.hullHistoryTime[i] = -10;
      }

      if (L) {
        var startRegion = REGION_BY_KEY[L.region];
        this.p.x = clamp((startRegion.minX + startRegion.maxX) / 2, -EDGE + 220, EDGE - 220);
        this.p.y = 0;
        for (i = 0; i < L.objectives.length; i++) {
          var objDef = L.objectives[i];
          this.run.campaignObjs.push({
            id: objDef.id, type: objDef.type, label: objDef.label,
            count: objDef.count || 0, progress: 0, done: false
          });
        }
        if (L.music === 'heat') { kit.audio.music('musicHeat', 900); this.run.musicHeat = true; }
      }
      this.player.setTexture('atlas', (FRAME_BY_KEY[profile.hangar.frame] || HULL_FRAMES[0]).idle)
        .setPosition(this.p.x, this.p.y).setAngle(0).clearTint();
      this.player.setTint((PAINT_BY_KEY[profile.hangar.paint] || HULL_PAINTS[0]).tint);
      this.fx.trail.setParticleTint((TRIM_BY_KEY[profile.hangar.trim] || TRIMS[0]).color);
      if (hWingBay > 0) this.addWing();
      this.cameras.main.centerOn(this.p.x, this.p.y);
      this.bossBar.setVisible(false);
      this.vignette.setAlpha(0);
      this.park(this.aegisShell);
      this.park(this.aegisTimerRing);
      this.park(this.purgeShock);
      this.park(this.purgeFlash);
      this.park(this.tideBeatRing); this.park(this.tideBeatFlash);
      this.park(this.comboHero);
      this.comboHeroT = 0;
      for (i = 0; i < this.buffGlowEdges.length; i++) this.park(this.buffGlowEdges[i]);
      this.purgeT = 0;
      this.arsenalFlashT = 0;
      this.updateHud();
      this.updateDebugState();
      this.enterRegion(regionAtX(this.p.x), true);
      if (L) {
        this.showBanner('MISSION ' + L.id + ' // ' + L.name, L.tagline);
      } else {
        this.showBanner('MERIDIAN VERGE', 'STABLE GRID // THE CORE DESCENDS AT 10:00');
      }
      this.updateCampaignObjText();
    },

    park: function (obj) {
      if (!obj || !obj.parkedOut) {
        if (obj) { obj.setVisible(false); this.children.remove(obj); obj.parkedOut = true; }
      }
    },

    unpark: function (obj) {
      if (obj && obj.parkedOut) { this.children.add(obj); obj.parkedOut = false; }
      if (obj) obj.setVisible(true);
    },

    killSprite: function (o) {
      if (o.alive && o.pool === 'shot') this.liveShots = Math.max(0, this.liveShots - 1);
      o.alive = false;
      if (o.spr) this.park(o.spr);
      if (o.aura) this.park(o.aura);
      if (o.halo) this.park(o.halo);
      if (o.beacon) this.park(o.beacon);
      if (o.ring) this.park(o.ring);
      if (o.pillar) this.park(o.pillar);
      if (o.scorch) this.park(o.scorch);
      if (o.crown) this.park(o.crown);
      if (o.alarmSpr) this.park(o.alarmSpr);
      if (o.barBg) this.park(o.barBg);
      if (o.barFill) this.park(o.barFill);
    },

    lockToScreen: function (obj) {
      if (!obj || !obj.setScrollFactor) return obj;
      obj.setScrollFactor(0);
      if (obj.list) for (var i = 0; i < obj.list.length; i++) this.lockToScreen(obj.list[i]);
      return obj;
    },

    closeOverlay: function () {
      if (!this.overlay) return;
      if (this.overlay === this.draftUI) this.overlay.setVisible(false);
      else this.overlay.destroy();
      this.overlay = null;
    },

    hardRestart: function () {
      this.releaseAll();
      this.closeOverlay();
      this.resetRun();
    },

    reasons: null,
    holdPause: function (reason) {
      if (!this.reasons) this.reasons = {};
      if (this.reasons[reason]) return;
      this.reasons[reason] = true;
      kit.pause(reason);
    },
    releasePause: function (reason) {
      if (!this.reasons || !this.reasons[reason]) return;
      delete this.reasons[reason];
      kit.resume(reason);
    },
    releaseAll: function () {
      for (var r in (this.reasons || {})) kit.resume(r);
      this.reasons = {};
    },

    refreshWatchdogAge: function (now) {
      if (!this.watchdog || !this.watchdogLastFrameAt) return;
      this.watchdog.lastBeatAgoMs = Math.max(0, Math.round(now - this.watchdogLastFrameAt));
    },

    recordWatchdogStep: function (ms) {
      var wd = this.watchdog;
      if (!wd) return;
      if (ms > wd.maxStepMs) wd.maxStepMs = Math.round(ms * 100) / 100;
      if (ms < 8) return;
      var steps = wd.longSteps;
      for (var i = 1; i < steps.length; i++) {
        steps[i - 1].atRunTime = steps[i].atRunTime;
        steps[i - 1].ms = steps[i].ms;
        steps[i - 1].phase = steps[i].phase;
      }
      var run = this.run;
      var last = steps[steps.length - 1];
      last.atRunTime = run ? Math.round(run.time * 1000) / 1000 : 0;
      last.ms = Math.round(ms * 100) / 100;
      last.phase = this.watchdogPhase || 'sim';
    },

    setPaused: function (v) {
      this.frozenBySystem = v;
      this.clearStick();
      this.clearKeys();
      if (!v) {
        this.accum = 0;
        this.lastNow = performance.now();
      }
    },

    update: function (now) {
      this.refreshWatchdogAge(now);
      consumeForceGrantGems(this.debugState || HM_DEBUG_STATE);
      var j = kit.juice.frame();
      var dtReal = Math.min(0.1, (now - this.lastNow) / 1000);
      this.lastNow = now;

      if (!this.frozenBySystem && this.state === 'playing' && !j.frozen) {
        this.accum += dtReal;
        var steps = 0;
        while (this.accum >= STEP && steps < MAX_STEPS) {
          // Exception trap: an error thrown mid-step on a device we cannot
          // attach to (iOS Safari) otherwise freezes the sim silently while
          // rAF keeps painting. Capture it, surface it on the debug overlay
          // (screenshot-diagnosable), and keep the game alive.
          try {
            this.simStep(STEP);
          } catch (simErr) {
            this.simError = (simErr && simErr.message ? simErr.message : String(simErr)) +
              ' @' + (this.watchdogPhase || '?');
            this.inSim = false;
            this.accum = 0;
            break;
          }
          this.accum -= STEP;
          steps++;
          this.lastSimAdvanceAt = performance.now();
          if (this.state !== 'playing') break;
        }
        if (steps >= MAX_STEPS) {
          // Discard the excess WITHOUT charging it to the run clock. Charging
          // it (advanceClock) let run.time race ahead of the stepped sim on
          // slow devices: spawns thinned out and every sim-clocked beat
          // (banners, spectacle queue, strikes) starved - which presented as
          // a total freeze the moment the 50s wing-guarantee beat queued
          // behind a crawling banner. Slow-motion under load is the correct
          // degradation; the run clock stays in lockstep with the sim.
          this.accum = 0;
        }
      }
      if (this.pendingEnd) this.finishRun();

      this.renderStep(dtReal, j);
      this.watchdogLastFrameAt = performance.now();
      // Flight recorder: checkpoint phase to localStorage twice a second so a
      // full main-thread freeze (invisible to every overlay) still leaves a
      // black box readable on the next boot.
      if (this.state === 'playing' && (!this._bbAt || now - this._bbAt > 500)) {
        this._bbAt = now;
        try {
          localStorage.setItem('hm_blackbox', JSON.stringify({
            t: Math.floor(this.run ? this.run.time : 0),
            phase: this.watchdogPhase || '?',
            region: HM_DEBUG_STATE.region || '?',
            boss: HM_DEBUG_STATE.regionBossActive || null,
            max: Math.round((HM_DEBUG_STATE.watchdog || {}).maxStepMs || 0),
            clean: false,
          }));
        } catch (bbErr) {}
      }
      // On-screen stall/error readout: if the sim stops advancing while the
      // game believes it is playing, say so where a phone screenshot can
      // capture it - phase tag and max step time included.
      if (this.stallDebugText) {
        var stalled = this.state === 'playing' && !kit.paused && !j.frozen &&
          this.lastSimAdvanceAt && (performance.now() - this.lastSimAdvanceAt) > 2500;
        if (this.simError) {
          this.stallDebugText.setVisible(true);
          setTextIfChanged(this.stallDebugText, 'SIM ERROR: ' + this.simError.slice(0, 90));
        } else if (stalled) {
          var wd = HM_DEBUG_STATE.watchdog || {};
          this.stallDebugText.setVisible(true);
          setTextIfChanged(this.stallDebugText, 'SIM STALL @' + Math.floor(this.run ? this.run.time : 0) +
            's phase:' + (this.watchdogPhase || '?') + ' max:' + Math.round(wd.maxStepMs || 0) + 'ms');
        } else if (this.stallDebugText.visible && !this.simError) {
          this.stallDebugText.setVisible(false);
        }
      }
    },

    advanceClock: function (dt) {
      var run = this.run;
      run.time += dt;
      run.spawnT -= dt;
      this.stepTimers(dt);
      if (!this.level && run.time >= RUN_SECONDS && !run.bossUp && !run.bossPending && !run.regionBossActive) this.spawnBoss();
    },

    after: function (seconds, fn, phase) {
      this.timers.push({ t: seconds, fn: fn, token: this.runToken, phase: phase || 'timer' });
      return this.timers[this.timers.length - 1];
    },
    stepTimers: function (dt) {
      var list = this.timers;
      for (var i = list.length - 1; i >= 0; i--) {
        var tm = list[i];
        if (tm.token !== this.runToken) { list.splice(i, 1); continue; }
        tm.t -= dt;
        if (tm.t > 0) continue;
        list.splice(i, 1);
        this.watchdogPhase = tm.phase || 'timer';
        tm.fn();
      }
    },

    simStep: function (dt) {
      var run = this.run, p = this.p;
      var stepStart = performance.now();
      this.watchdogPhase = 'sim';
      this.inSim = true;
      run.time += dt;
      this.recordHull(dt);

      if (this.debugState && this.debugState.forceDraft && this.state === 'playing') {
        this.debugState.forceDraft = false;
        run.xp = run.xpNext;
        this.checkLevel();
        if (this.state !== 'playing') {
          this.inSim = false;
          this.recordWatchdogStep(performance.now() - stepStart);
          return;
        }
      }

      this.watchdogPhase = 'timers';
      this.stepTimers(dt);
      this.stepBanner(dt);
      this.watchdogPhase = 'bonuses';
      this.stepBonuses(dt);
      this.watchdogPhase = 'spectacle';
      this.stepSpectacle(dt);
      this.watchdogPhase = 'strike';
      this.stepAirStrikes(dt);
      this.watchdogPhase = 'input';
      this.stepInput(dt);
      this.stepRegionTour(dt);
      this.enterRegion(regionAtX(this.p.x), false);
      this.watchdogPhase = 'wing';
      this.stepFormation(dt);
      this.stepBases(dt);
      this.stepAmbient(dt);
      this.watchdogPhase = 'boss-approach';
      this.stepWaves(dt);
      this.buildHash();
      this.stepWeapons(dt);
      this.stepShots(dt);
      this.watchdogPhase = 'enemies';
      this.stepEnemies(dt);
      this.buildHash();
      this.stepTideTurners(dt);
      this.stepEbolts(dt);
      this.stepMines(dt);
      this.stepPulses(dt);
      this.stepBeams(dt);
      this.stepGems(dt);

      if (p.iframes > 0) p.iframes -= dt;
      if (p.hurtT > 0) p.hurtT -= dt;
      if (p.regen > 0 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + p.regen * dt);
      if (run.comboT > 0) {
        run.comboT -= dt;
        if (run.comboT <= 0) run.combo = 0;
      }
      this.rescore();

      if (this.tutorial) this.stepTutorial(dt);
      this.inSim = false;
      this.recordWatchdogStep(performance.now() - stepStart);
    },

    rescore: function () {
      var run = this.run;
      run.score = Math.floor(run.time) * 2 + run.kills * 3 + Math.floor(run.gems) +
        (run.bonus || 0) + Math.floor(run.scoreFlareBank || 0);
    },

    recordHull: function () {
      var run = this.run;
      if (!this.hullHistoryHp || !this.hullHistoryTime) return;
      run.hullHistoryCursor = (run.hullHistoryCursor + 1) % this.hullHistoryHp.length;
      this.hullHistoryHp[run.hullHistoryCursor] = this.p.hp;
      this.hullHistoryTime[run.hullHistoryCursor] = run.time;
      run.hullHistoryCount = Math.min(run.hullHistoryCount + 1, this.hullHistoryHp.length);
    },

    tidePressure: function () {
      var run = this.run, p = this.p;
      var hull = 1 - clamp(p.hp / p.maxHp, 0, 1);
      var enemies = clamp(this.enemyCount / 120, 0, 1);
      var bases = clamp(this.baseCount / Math.max(1, this.activeBases.length), 0, 1);
      var wingLoss = run.time - run.lastWingLoss < 12 ? 1 : 0;
      var localDanger = clamp(run.danger, 0, 1);
      var pressure = clamp(hull * 0.44 + enemies * 0.24 + bases * 0.16 +
        wingLoss * 0.28 + localDanger * 0.18, 0, 1);
      run.tideWeight = pressure;
      run.tideOdds = 0.0012 + pressure * 0.0128;
      return run.tideOdds;
    },

    copyTideTargets: function (x, y, radius) {
      var list = this.query(x, y, radius), count = Math.min(list.length, this.tideTargets.length);
      for (var i = 0; i < count; i++) this.tideTargets[i] = list[i];
      this.tideTargetCount = count;
      return count;
    },

    tideDamageMultiplier: function () {
      var t = this.run.tides['last-stand'];
      return t > 0 ? (this.run.lastStandDamage || 2.25) : 1;
    },

    tideDamage: function (e, raw, hx, hy, effectId) {
      if (!e || !e.alive || e.maxHp <= 0) return;
      var mult = this.tideDamageMultiplier();
      if (effectId != null) {
        if (e.tideSingularityId !== effectId) {
          e.tideSingularityId = effectId;
          e.tideSingularityDamage = 0;
        }
        var remaining = e.maxHp * TIDE_CAP_FRACTION - e.tideSingularityDamage;
        if (remaining <= 0) return;
        raw = Math.min(raw, remaining / mult);
        e.tideSingularityDamage += raw * mult;
      } else {
        raw = Math.min(raw, e.maxHp * TIDE_CAP_FRACTION / mult);
      }
      if (raw > 0) this.damage(e, raw, hx, hy, true);
    },

    triggerTideBeat: function (data) {
      var quiet = !kit.juice.enabled;
      this.run.tideBeatDur = 0;
      this.run.tideBeatT = 0;
      this.run.tideBeatColor = data.color;
      this.triggerBuffGlow(0xffd67a);
      this.queueSpectacleBeat(data.name, data.color, 1.42, true);
      this.showBanner(data.name, data.subtitle, true, true);
      sfx('unlock', { volume: 0.78, rate: quiet ? 0.92 : 0.74 });
      sfx('telegraph', { volume: 0.42, rate: quiet ? 1.0 : 0.68 });
      sfx('pulse', { volume: 0.36, rate: quiet ? 1.0 : 0.58 });
      if (!quiet) kit.juice.shake(9, 260);
    },

    startSingularity: function () {
      var s = this.singularity, p = this.p, run = this.run;
      s.active = true;
      s.t = 3;
      s.tick = 0;
      s.x = p.x;
      s.y = p.y;
      s.id = ++run.tideSerial;
      run.tides['singularity-core'] = s.t;
      this.unpark(s.spr); this.unpark(s.ring); this.unpark(s.flash);
      s.spr.setPosition(s.x, s.y).setTint(0x05030c).setBlendMode(Phaser.BlendModes.NORMAL)
        .setAlpha(0.92).setDisplaySize(58, 58);
      s.ring.setPosition(s.x, s.y).setTint(0xbca8ff).setAlpha(0.76).setDisplaySize(250, 250);
      s.flash.setPosition(s.x, s.y).setTint(0xdcc8ff).setAlpha(0.22).setDisplaySize(300, 300);
      if (kit.juice.enabled) kit.juice.shake(7, 220);
    },

    detonateSingularity: function () {
      var s = this.singularity, p = this.p, run = this.run;
      var count = this.copyTideTargets(s.x, s.y, 440);
      for (var i = 0; i < count; i++) {
        var e = this.tideTargets[i];
        if (!e.alive) continue;
        var dx = e.x - s.x, dy = e.y - s.y;
        if (dx * dx + dy * dy < (440 + e.r) * (440 + e.r)) {
          this.tideDamage(e, 74 * p.damage, e.x, e.y, s.id);
        }
      }
      this.contactRing(s.x, s.y, 42, 500, 0.55, 0xbca8ff, 0.92);
      this.contactRing(s.x, s.y, 22, 250, 0.34, 0xffffff, 0.78);
      this.fx.level.setParticleTint(0xbca8ff);
      this.fx.level.emitParticleAt(s.x, s.y, kit.juice.enabled ? 28 : 7);
      sfx('bossDeath', { volume: 0.38, rate: 1.35 });
      if (kit.juice.enabled) kit.juice.shake(10, 300);
      s.active = false;
      run.tides['singularity-core'] = 0;
      this.park(s.spr); this.park(s.ring); this.park(s.flash);
    },

    startRally: function () {
      var p = this.p, run = this.run;
      var target = Math.min(3, this.wingCapacity()), missing = Math.max(0, target - run.wings);
      for (var i = 0; i < missing; i++) this.addWing();
      p.hp = Math.min(p.maxHp, p.hp + 28 + missing * 10);
      this.contactRing(p.x, p.y, 32, 300, 0.48, 0x8effd8, 0.92);
      this.fx.level.setParticleTint(0x8effd8);
      this.fx.level.emitParticleAt(p.x, p.y, kit.juice.enabled ? 24 : 6);
      this.floatText(p.x, p.y - 30, '+' + (28 + missing * 10) + ' HULL', '#8effd8', TYPE.body);
      sfx('pulse', { volume: 0.64, rate: 1.12 });
      if (kit.juice.enabled) kit.juice.shake(6, 200);
    },

    startChronoRewind: function () {
      var run = this.run, peak = this.p.hp;
      var cutoff = run.time - 10;
      for (var i = 0; i < this.hullHistoryHp.length; i++) {
        if (this.hullHistoryTime[i] >= cutoff && this.hullHistoryTime[i] <= run.time + 0.01) {
          peak = Math.max(peak, this.hullHistoryHp[i]);
        }
      }
      var restored = Math.max(0, peak - this.p.hp);
      this.p.hp = peak;
      this.rewindFx.t = kit.juice.enabled ? 0.9 : 0.38;
      this.unpark(this.rewindFx.ring); this.unpark(this.rewindFx.flash);
      this.rewindFx.ring.setTint(0x7ad8ff).setAlpha(0.9);
      this.rewindFx.flash.setTint(0xc9f4ff).setAlpha(0.34);
      this.floatText(this.p.x, this.p.y - 30, '+' + Math.ceil(restored) + ' HULL', '#7ad8ff', TYPE.body);
      sfx('telegraph', { volume: 0.62, rate: 0.62 });
      sfx('pulse', { volume: 0.46, rate: 1.28 });
      if (kit.juice.enabled) kit.juice.shake(7, 220);
    },

    fireMirrorWeapon: function (g) {
      var p = this.p, run = this.run, data = WEAPON_BY_KEY[run.equippedWeapon] || WEAPONS[0];
      var target = this.nearestEnemy(g.x, g.y, 900);
      if (!target) return;
      var r = p.ranks, mastery = 1 + Math.min(7, Math.floor(Math.max(0, (r.lance || 1) - 1) / 2));
      var angle = Math.atan2(target.y - g.y, target.x - g.x);
      var arsenal = run.buffs.arsenal > 0;
      var base = 9 * p.damage * p.projectileDamage * 0.40 * (arsenal ? 1.45 : 1) * (1 + mastery * 0.18);
      var speed = p.projectileSpeed, i, spread, sa;
      if (data.key === 'bolt-lance') {
        this.fireShot('bolt', g.x, g.y, Math.cos(angle) * 560 * speed, Math.sin(angle) * 560 * speed,
          base, 5 * p.projectileSize, p.pierce, data.key, true);
      } else if (data.key === 'scatter-volley') {
        spread = 0.72;
        for (i = 0; i < 3; i++) {
          sa = angle + (i - 1) * spread / 2;
          this.fireShot('scatter', g.x, g.y, Math.cos(sa) * 450 * speed, Math.sin(sa) * 450 * speed,
            base * 0.56, 5 * p.projectileSize, p.pierce, data.key, true);
        }
      } else if (data.key === 'rail-piercer') {
        this.fireShot('rail', g.x, g.y, Math.cos(angle) * 760 * speed, Math.sin(angle) * 760 * speed,
          base * 1.75, 7 * p.projectileSize, 3 + p.pierce, data.key, true);
      } else if (data.key === 'seeker-swarm') {
        for (i = 0; i < 2; i++) {
          sa = angle + (i - 0.5) * 0.42;
          this.fireShot('seeker', g.x, g.y, Math.cos(sa) * 240 * speed, Math.sin(sa) * 240 * speed,
            base * 0.72, 8 * p.projectileSize, p.pierce, data.key, true);
        }
      } else if (data.key === 'plasma-mortar') {
        this.fireShot('mortar', g.x, g.y, Math.cos(angle) * 360 * speed, Math.sin(angle) * 360 * speed - 230,
          base * 1.45, 12 * p.projectileSize, p.pierce, data.key, true);
      } else if (data.key === 'sweep-beam') {
        this.fireBeam(angle, base * 1.14, 430 + mastery * 25, 24 + mastery * 4,
          data.key, p.pierce, g.x, g.y, true);
      } else if (data.key === 'glaive-return') {
        this.fireShot('glaive', g.x, g.y, Math.cos(angle) * 500 * speed, Math.sin(angle) * 500 * speed,
          base * 1.24, 10 * p.projectileSize, 2 + p.pierce, data.key, true);
      } else if (data.key === 'mine-layer') {
        this.dropMine(base * 1.18, 100 + mastery * 8, g.x, g.y, data.key, true);
      } else if (data.key === 'ricochet-shard') {
        this.fireShot('ricochet', g.x, g.y, Math.cos(angle) * 520 * speed, Math.sin(angle) * 520 * speed,
          base * 0.96, 7 * p.projectileSize, 1 + p.pierce, data.key, true);
      } else if (data.key === 'twin-phase') {
        for (i = -1; i <= 1; i += 2) {
          sa = angle + i * 0.09;
          this.fireShot('twin', g.x, g.y, Math.cos(sa) * 610 * speed, Math.sin(sa) * 610 * speed,
            base * 0.76, 5 * p.projectileSize, p.pierce, data.key, true);
        }
      } else if (data.key === 'storm-coil') {
        this.fireShot('coil', g.x, g.y, Math.cos(angle) * 500 * speed, Math.sin(angle) * 500 * speed,
          base * 1.05, 7 * p.projectileSize, p.pierce, data.key, true);
      } else if (data.key === 'lance-array-mk2') {
        var mirrorElite = this.nearestElite(g.x, g.y, 980), mirrorAngle = mirrorElite ?
          Math.atan2(mirrorElite.y - g.y, mirrorElite.x - g.x) : angle;
        for (i = -1; i <= 1; i++) {
          sa = mirrorAngle + i * 0.16;
          var mirrorLance = this.fireShot('lance-array', g.x, g.y, Math.cos(sa) * 620 * speed,
            Math.sin(sa) * 620 * speed, base * 0.52, 6 * p.projectileSize, 1 + p.pierce, data.key, true);
          if (mirrorLance) mirrorLance.targetRef = mirrorElite;
        }
      } else if (data.key === 'nova-scatter') {
        for (i = 0; i < 5; i++) {
          sa = angle + (i - 2) * 0.20;
          var mirrorNova = this.fireShot('nova-scatter', g.x, g.y, Math.cos(sa) * 480 * speed,
            Math.sin(sa) * 480 * speed, base * 0.34, 5 * p.projectileSize, p.pierce, data.key, true);
          if (mirrorNova) { mirrorNova.rangeBurst = true; mirrorNova.burstRadius = 96; mirrorNova.burstDmg = base * 0.14; }
        }
      } else if (data.key === 'rail-storm') {
        this.fireShot('rail-storm', g.x, g.y, Math.cos(angle) * 820 * speed, Math.sin(angle) * 820 * speed,
          base * 1.86, 8 * p.projectileSize, 4 + p.pierce, data.key, true);
      } else if (data.key === 'swarm-matrix') {
        for (i = 0; i < 2; i++) {
          sa = angle + (i - 0.5) * 0.34;
          this.fireShot('swarm-dart', g.x, g.y, Math.cos(sa) * 285 * speed, Math.sin(sa) * 285 * speed,
            base * 0.62, 8 * p.projectileSize, p.pierce, data.key, true);
        }
      } else if (data.key === 'mortar-cascade') {
        for (i = -1; i <= 1; i++) {
          sa = angle + i * 0.28;
          this.fireShot('mortar-cascade', g.x, g.y, Math.cos(sa) * 390 * speed,
            Math.sin(sa) * 390 * speed - 250, base * 0.42, 12 * p.projectileSize,
            p.pierce, data.key, true);
        }
      } else if (data.key === 'prism-beam') {
        this.fireBeam(angle, base * 1.28, 560 + mastery * 28, 30 + mastery * 4,
          data.key, 1 + p.pierce, g.x, g.y, true);
      } else if (data.key === 'glaive-cyclone') {
        for (i = 0; i < 2; i++) {
          var mirrorGlaive = this.fireShot('cyclone-glaive', g.x, g.y, 0, 0, base * 0.86,
            10 * p.projectileSize, 2 + p.pierce, data.key, true, i);
          if (mirrorGlaive) {
            mirrorGlaive.orbitAngle = angle + i * Math.PI;
            mirrorGlaive.orbitRadius = 28; mirrorGlaive.orbitDir = i ? -1 : 1;
            mirrorGlaive.ox = g.x; mirrorGlaive.oy = g.y;
          }
        }
      } else if (data.key === 'minefield-web') {
        var mirrorWeb = ++run.weaponSerial;
        for (i = -1; i <= 1; i++) {
          var webAngle = angle + Math.PI + i * 0.42;
          this.dropMine(base * 0.45, 116 + mastery * 8,
            g.x - Math.cos(webAngle) * (38 + (i + 1) * 22), g.y - Math.sin(webAngle) * (38 + (i + 1) * 22),
            data.key, true, mirrorWeb, i + 1);
        }
      } else if (data.key === 'ricochet-prism') {
        this.fireShot('prism-ricochet', g.x, g.y, Math.cos(angle) * 560 * speed,
          Math.sin(angle) * 560 * speed, base * 1.25, 8 * p.projectileSize,
          3 + p.pierce, data.key, true);
      } else if (data.key === 'coil-tempest') {
        this.fireShot('coil-tempest', g.x, g.y, Math.cos(angle) * 720 * speed, Math.sin(angle) * 720 * speed,
          base * 1.34, 7 * p.projectileSize, 1 + p.pierce, data.key, true);
        this.arcLine(g.x, g.y, target.x, target.y, data.color, 0.16);
      }
      weaponSfx(data.cue, { volume: 0.09, rate: data.rate });
    },

    stepMirrorSquadron: function (dt) {
      var p = this.p, run = this.run, cs = Math.cos(p.face), sn = Math.sin(p.face);
      for (var i = 0; i < this.mirrors.length; i++) {
        var g = this.mirrors[i];
        if (!g.active) continue;
        var side = g.side * 72, back = 48;
        var tx = p.x + cs * back - sn * side, ty = p.y + sn * back + cs * side;
        g.x += (tx - g.x) * Math.min(1, dt * 8);
        g.y += (ty - g.y) * Math.min(1, dt * 8);
        g.heading = p.face;
        g.cd -= dt;
        if (g.cd <= 0) {
          this.fireMirrorWeapon(g);
          g.cd = Math.max(0.24, (0.60 - Math.min(7, Math.floor((p.ranks.lance || 1) - 1) / 2) * 0.045) /
            ((WEAPON_BY_KEY[run.equippedWeapon] || WEAPONS[0]).rate || 1));
        }
      }
    },

    bountyBurst: function (x, y, source) {
      var run = this.run;
      if (run.tideBursting) return;
      run.tideBursting = true;
      var count = this.copyTideTargets(x, y, 210), used = 0;
      for (var i = 0; i < count && used < 8; i++) {
        var e = this.tideTargets[i];
        if (!e.alive || e === source) continue;
        var dx = e.x - x, dy = e.y - y;
        if (dx * dx + dy * dy > (210 + e.r) * (210 + e.r)) continue;
        this.arcLine(x, y, e.x, e.y);
        this.tideDamage(e, 48 * this.p.damage, e.x, e.y, null);
        this.contactRing(e.x, e.y, 8, 72, 0.18, 0xffd67a, 0.72);
        this.fx.impact.setParticleTint(0xfff0b0);
        this.fx.impact.emitParticleAt(e.x, e.y, 2);
        used++;
      }
      this.contactRing(x, y, 18, 176, 0.28, 0xffd67a, 0.88);
      this.fx.level.setParticleTint(0xffc361);
      this.fx.level.emitParticleAt(x, y, kit.juice.enabled ? Math.min(12, 4 + used) : 4);
      if (used) sfx('pulse', { volume: 0.17, rate: 1.42 });
      run.tideBursting = false;
    },

    stepTideTurners: function (dt) {
      var run = this.run;
      if (run.tideBeatT > 0) run.tideBeatT = Math.max(0, run.tideBeatT - dt);
      if (this.rewindFx.t > 0) this.rewindFx.t = Math.max(0, this.rewindFx.t - dt);
      for (var i = 0; i < TIDE_TURNERS.length; i++) {
        var data = TIDE_TURNERS[i], key = data.key;
        if (run.tides[key] <= 0) continue;
        run.tides[key] -= dt;
        if (run.tides[key] <= 0) {
          run.tides[key] = 0;
          if (key === 'mirror-squadron') {
            for (var mi = 0; mi < this.mirrors.length; mi++) {
              this.mirrors[mi].active = false;
              this.killSprite(this.mirrors[mi]);
            }
          }
          if (key === 'last-stand') {
            run.lastStandDamage = 1;
            run.lastStandResist = 0;
          }
          if (this.state === 'playing' && data.duration > 0) this.floatText(this.p.x, this.p.y - 26,
            data.name + ' OFF', '#ffd67a', TYPE.micro);
        }
      }
      var s = this.singularity;
      if (s.active) {
        run.tideEffectBusy = true;
        s.t -= dt;
        s.tick -= dt;
        var count = this.copyTideTargets(s.x, s.y, 330);
        for (var si = 0; si < count; si++) {
          var e = this.tideTargets[si];
          if (!e.alive) continue;
          var dx = s.x - e.x, dy = s.y - e.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
          if (d < 330 + e.r && d > 4) {
            var pull = (1 - clamp(d / 330, 0, 1)) * 360;
            e.x += dx / d * pull * dt;
            e.y += dy / d * pull * dt;
          }
        }
        if (s.tick <= 0) {
          s.tick = 0.22;
          for (var si2 = 0; si2 < count; si2++) {
            var crush = this.tideTargets[si2];
            if (!crush || !crush.alive) continue;
            var cdx = crush.x - s.x, cdy = crush.y - s.y;
            if (cdx * cdx + cdy * cdy < 330 * 330) this.tideDamage(crush, 15 * this.p.damage,
              crush.x, crush.y, s.id);
          }
        }
        run.tides['singularity-core'] = Math.max(0, s.t);
        if (s.t <= 0) this.detonateSingularity();
        run.tideEffectBusy = false;
      }
      if (run.tides['mirror-squadron'] > 0) this.stepMirrorSquadron(dt);
    },

    stepBonuses: function (dt) {
      // Guaranteed weapon cadence (owner directive #4): per-kill rolls alone
      // leave droughts. If no weapon drop has landed for 25s and the field
      // has room, one spawns near the player regardless of kill luck.
      var wrun = this.run;
      if (this.state === 'playing' && wrun && wrun.time - wrun.weaponLastDrop > 25 &&
          wrun.weaponDrops < WEAPON_DROP_CAP) {
        var wLive = 0;
        for (var wdi = 0; wdi < this.weaponDrops.length; wdi++) if (this.weaponDrops[wdi].alive) wLive++;
        if (wLive < 3) {
          var wTier = wrun.wave >= 3 && srand() < 0.32 ? 'upgraded' : 'base';
          this.spawnWeaponDrop(this.nextWeaponDrop(null, wTier),
            this.p.x + (srand() - 0.5) * 320, this.p.y + (srand() - 0.5) * 320);
        }
      }

      var run = this.run, buffs = run.buffs, p = this.p;
      var b;
      for (var bi = 0; bi < BONUS_TIMED.length; bi++) {
        var timed = BONUS_TIMED[bi];
        if (buffs[timed.key] <= 0) continue;
        buffs[timed.key] -= dt;
        if (buffs[timed.key] <= 0) {
          buffs[timed.key] = 0;
          this.expireBonus(timed.key);
        }
      }

      if (buffs.decoy > 0) {
        this.decoyX = clamp(p.x + Math.cos(run.time * 1.35) * 150, -EDGE + 28, EDGE - 28);
        this.decoyY = clamp(p.y + Math.sin(run.time * 1.35) * 150, -EDGE + 28, EDGE - 28);
      }
      if (buffs.drone > 0) {
        this.drone.active = true;
        this.drone.angle += dt * 2.2;
        this.drone.x = p.x + Math.cos(this.drone.angle) * 92;
        this.drone.y = p.y + Math.sin(this.drone.angle) * 92;
        this.drone.cd -= dt;
        if (this.drone.cd <= 0) {
          var droneTarget = this.nearestEnemy(this.drone.x, this.drone.y, 620);
          if (droneTarget) {
            var da = Math.atan2(droneTarget.y - this.drone.y, droneTarget.x - this.drone.x);
            this.fireShot('drone', this.drone.x, this.drone.y, Math.cos(da) * 330,
              Math.sin(da) * 330, 8 * p.damage, 5, 0, 'seeker-swarm');
            sfx('shoot', { volume: 0.12, rate: 1.45 });
          }
          this.drone.cd = 0.68;
        }
      } else if (this.drone.active) {
        this.drone.active = false;
        this.park(this.drone.spr); this.park(this.drone.halo);
      }
      if (buffs.flare > 0) run.scoreFlareBank += dt * 1.3;
      if (this.buffGlowT > 0) this.buffGlowT = Math.max(0, this.buffGlowT - dt);

      for (var ali = 0; ali < this.arcLines.length; ali++) {
        var arc = this.arcLines[ali];
        if (!arc.alive) continue;
        arc.life -= dt;
        if (arc.life <= 0) this.killSprite(arc);
      }
      if (this.strike.active) this.strike.t += dt;
      else if (this.strike.afterT > 0) this.strike.afterT = Math.max(0, this.strike.afterT - dt);

      if (this.purgeT > 0) {
        this.purgeT -= dt;
        if (this.purgeT <= 0) {
          this.purgeT = 0;
          this.park(this.purgeShock);
          this.park(this.purgeFlash);
          for (var pri = 0; pri < this.purgeRings.length; pri++) this.killSprite(this.purgeRings[pri]);
        }
      }

      for (var i = 0; i < this.bonuses.length; i++) {
        b = this.bonuses[i];
        if (!b.alive) continue;
        b.life -= dt;
        var dx = p.x - b.x, dy = p.y - b.y;
        var d2 = dx * dx + dy * dy;
        if (d2 < 190 * 190) {
          var d = Math.sqrt(d2) || 1;
          var pull = clamp(1 - d / 190, 0.18, 1);
          b.vx += dx / d * (520 + pull * 720) * dt;
          b.vy += dy / d * (520 + pull * 720) * dt;
        }
        var damp = Math.pow(0.035, dt);
        b.vx *= damp; b.vy *= damp;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (d2 < (p.r + 22) * (p.r + 22)) {
          this.activateBonus(b.kind);
          continue;
        }
        if (b.life <= 0) this.killSprite(b);
      }
      for (var wi = 0; wi < this.weaponDrops.length; wi++) {
        var wd = this.weaponDrops[wi];
        if (!wd.alive) continue;
        wd.life -= dt;
        var wdx = p.x - wd.x, wdy = p.y - wd.y;
        var wd2 = wdx * wdx + wdy * wdy;
        if (wd2 < 220 * 220) {
          var wdDist = Math.sqrt(wd2) || 1;
          var wdPull = clamp(1 - wdDist / 220, 0.16, 1);
          wd.vx += wdx / wdDist * (580 + wdPull * 760) * dt;
          wd.vy += wdy / wdDist * (580 + wdPull * 760) * dt;
        }
        var wdDamp = Math.pow(0.035, dt);
        wd.vx *= wdDamp; wd.vy *= wdDamp;
        wd.x += wd.vx * dt; wd.y += wd.vy * dt;
        if (wd2 < (p.r + 24) * (p.r + 24)) {
          this.activateWeaponDrop(wd.weapon);
          continue;
        }
        if (wd.life <= 0) this.killSprite(wd);
      }
    },

    queueSpectacleBeat: function (title, color, scale, tide) {
      if (!kit.juice.enabled) return;
      var s = this.spectacle;
      if (s.active || this.purgeT > 0 || this.bossPhaseFx.active || this.strike.active) {
        if (!s.queued) s.qAge = 0;
        s.queued = true; s.qDelay = Math.max(s.qDelay, 0.25);
        s.qTitle = title; s.qColor = color; s.qScale = scale || 1; s.qTide = !!tide;
        return;
      }
      this.beginSpectacleBeat(title, color, scale, tide);
    },

    beginSpectacleBeat: function (title, color, scale, tide) {
      var s = this.spectacle;
      s.active = true; s.t = 0; s.dur = tide ? 1.18 : 0.84;
      s.qAge = 0;
      s.color = color || 0x8effd8; s.scale = scale || 1; s.tide = !!tide;
      this.punchZoom(tide ? 0.028 : 0.018, tide ? 1.18 : 0.76);
    },

    punchZoom: function (amount, dur) {
      if (!kit.juice.enabled || this.strike.active) return;
      this.cameraZoomAmount = Math.max(this.cameraZoomAmount || 0, amount);
      this.cameraZoomDur = Math.max(this.cameraZoomDur || 0, dur);
      this.cameraZoomT = Math.max(this.cameraZoomT || 0, dur);
    },

    stepSpectacle: function (dt) {
      var s = this.spectacle;
      this.watchdogPhase = 'spectacle';
      if (s.active) {
        s.t += dt;
        if (s.t >= s.dur) {
          s.active = false;
          this.park(s.ring); this.park(s.flashA); this.park(s.flashB); this.park(s.flashWhite);
          for (var ei = 0; ei < s.edges.length; ei++) this.park(s.edges[ei]);
          if (s.queued) s.qDelay = Math.max(s.qDelay, 0.25);
        }
      }
      if (!s.active && s.queued) {
        s.qAge += dt;
        s.qDelay -= dt;
        var blocked = this.purgeT > 0 || this.bossPhaseFx.active || this.strike.active;
        // The queue is simulation-time bounded. A skipped/late visual
        // completion on Safari cannot leave a beat waiting forever.
        if (s.qDelay <= 0 && (!blocked || s.qAge >= 3.0)) {
          s.queued = false;
          this.beginSpectacleBeat(s.qTitle, s.qColor, s.qScale, s.qTide);
        }
      }
      if (this.cameraZoomT > 0) {
        this.cameraZoomT = Math.max(0, this.cameraZoomT - dt);
        if (this.cameraZoomT <= 0) this.cameraZoomAmount = 0;
      }
      if (this.comboHeroT > 0) {
        this.comboHeroT = Math.max(0, this.comboHeroT - dt);
        if (this.comboHeroT <= 0) this.park(this.comboHero);
      }
      for (var bi = 0; bi < this.eliteBursts.length; bi++) {
        var burst = this.eliteBursts[bi];
        if (!burst.active) continue;
        burst.t += dt;
        if (burst.t >= burst.dur) {
          burst.active = false;
          this.park(burst.ring); this.park(burst.flare);
        }
      }
      if (this.bossPhaseFx.active) {
        this.bossPhaseFx.t += dt;
        if (this.bossPhaseFx.t >= this.bossPhaseFx.dur) {
          this.bossPhaseFx.active = false;
          this.park(this.bossPhaseFx.veil); this.park(this.bossPhaseFx.glow);
          for (var pbi = 0; pbi < this.bossPhaseFx.beams.length; pbi++) this.park(this.bossPhaseFx.beams[pbi]);
        }
      }
    },

    spawnEliteBurst: function (e) {
      if (!kit.juice.enabled) return;
      for (var i = 0; i < this.eliteBursts.length; i++) {
        var burst = this.eliteBursts[i];
        if (burst.active) continue;
        burst.active = true; burst.t = 0; burst.x = e.x; burst.y = e.y; burst.color = e.boss ? 0xd6a4ff : 0xffd67a;
        this.unpark(burst.ring); this.unpark(burst.flare);
        burst.ring.setPosition(e.x, e.y).setTint(burst.color).setDisplaySize(64, 64).setAlpha(0.9);
        burst.flare.setPosition(e.x, e.y).setTint(burst.color).setDisplaySize(120, 120).setAlpha(0.28);
        return;
      }
    },

    comboMilestone: function (value) {
      var color = value >= 50 ? 0xefcfff : (value >= 25 ? 0xffd67a : 0xffb45a);
      this.comboHero.setColor(value >= 50 ? '#efcfff' : (value >= 25 ? '#ffd67a' : '#ffb45a'));
      setTextIfChanged(this.comboHero, 'x' + value);
      this.comboHero.setPosition(this.scale.width / 2, this.scale.height * 0.49)
        .setVisible(true).setAlpha(1).setScale(kit.juice.enabled ? 0.42 : 1);
      this.unpark(this.comboHero);
      this.comboHeroT = kit.juice.enabled ? 1.08 : 0.82;
      this.queueSpectacleBeat('COMBO x' + value, color, value >= 50 ? 1.28 : 1.08, false);
      sfx('wave', { volume: value >= 50 ? 0.72 : 0.56, rate: value >= 50 ? 0.62 : 0.82 });
      if (kit.juice.enabled) kit.juice.shake(value >= 50 ? 11 : 7, 260);
    },

    callInDamage: function (e, raw, hx, hy, id) {
      if (!e || !e.alive) return;
      var mult = this.tideDamageMultiplier();
      if (e.callInId !== id) { e.callInId = id; e.callInDamage = 0; }
      if (e.boss) {
        var remaining = e.maxHp * TIDE_CAP_FRACTION - e.callInDamage;
        if (remaining <= 0) return;
        raw = Math.min(raw, remaining / mult);
        e.callInDamage += raw * mult;
      }
      if (raw > 0) this.damage(e, raw, hx, hy, true);
    },

    spawnAirBomb: function (x, y, dmg, radius, fuse) {
      var bomb = null;
      for (var i = 0; i < this.airBombs.length; i++) {
        if (!this.airBombs[i].alive) { bomb = this.airBombs[i]; break; }
      }
      if (!bomb) return null;
      bomb.alive = true; bomb.detonated = false; bomb.x = x; bomb.y = y;
      bomb.dmg = dmg; bomb.radius = radius; bomb.fuse = fuse; bomb.life = 0;
      bomb.id = this.run.strikeSerial;
      this.unpark(bomb.spr); this.unpark(bomb.ring); this.park(bomb.scorch);
      bomb.spr.setPosition(x, y).setTint(0xff9a5a).setAlpha(1).setScale(0.62);
      bomb.ring.setPosition(x, y).setTint(0xffc361).setDisplaySize(radius * 1.35, radius * 1.35).setAlpha(0.32);
      return bomb;
    },

    detonateAirBomb: function (bomb) {
      if (!bomb.alive || bomb.detonated) return;
      bomb.detonated = true; bomb.life = kit.juice.enabled ? 0.46 : 0.24;
      this.park(bomb.spr); this.unpark(bomb.ring); this.unpark(bomb.scorch);
      bomb.ring.setPosition(bomb.x, bomb.y).setTint(0xff9a5a).setDisplaySize(28, 28).setAlpha(0.84);
      bomb.scorch.setPosition(bomb.x, bomb.y).setTint(0x2b1b1b)
        .setDisplaySize(bomb.radius * 1.15, bomb.radius * 1.15).setAlpha(0.48);
      var list = this.query(bomb.x, bomb.y, bomb.radius + 40);
      for (var i = 0; i < list.length; i++) {
        var e = list[i];
        if (!e.alive) continue;
        var dx = e.x - bomb.x, dy = e.y - bomb.y, rr = bomb.radius + e.r;
        if (dx * dx + dy * dy < rr * rr) this.callInDamage(e, bomb.dmg, e.x, e.y, bomb.id);
      }
      var bases = this.baseQuery(bomb.x, bomb.y, bomb.radius + 100);
      for (var bi = 0; bi < bases.length; bi++) {
        var b = bases[bi], bdx = b.x - bomb.x, bdy = b.y - bomb.y;
        if (bdx * bdx + bdy * bdy < (bomb.radius + b.r) * (bomb.radius + b.r)) {
          this.damageBase(b, bomb.dmg * 0.7, b.x, b.y, true);
        }
      }
      this.fx.death.setParticleTint(0xff9a5a);
      this.fx.death.emitParticleAt(bomb.x, bomb.y, kit.juice.enabled ? 14 : 4);
      this.fx.smoke.setParticleTint(0x6f6262);
      this.fx.smoke.emitParticleAt(bomb.x, bomb.y, kit.juice.enabled ? 5 : 2);
      this.contactRing(bomb.x, bomb.y, 18, bomb.radius * 1.45, kit.juice.enabled ? 0.34 : 0.2, 0xff9a5a, 0.78);
      if (bomb.id % 3 === 0) sfx('death', { volume: 0.22, rate: 0.62 });
    },

    stepAirStrikes: function (dt) {
      var p = this.p, run = this.run, as = this.airStrike;
      if (as.active) {
        as.t += dt;
        var u = clamp(as.t / as.dur, 0, 1);
        if (as.t >= as.nextDrop && as.dropIndex < as.dropCount) {
          var lane = (as.dropIndex % 3 - 1) * 82;
          var bx = as.startX + as.dir * as.span * u;
          this.spawnAirBomb(bx, as.centerY + lane, 48 * p.damage * p.projectileDamage, 116,
            0.22 + (as.dropIndex % 3) * 0.05);
          as.dropIndex++; as.nextDrop += 0.17;
        }
        if (as.t >= as.dur) {
          as.active = false;
          for (var ai = 0; ai < as.bombers.length; ai++) {
            this.park(as.bombers[ai]); this.park(as.contrails[ai]);
          }
          for (var ar = 0; ar < as.arrows.length; ar++) this.park(as.arrows[ar]);
        }
      }
      var cluster = this.cluster;
      if (cluster.active) {
        cluster.t += dt;
        while (cluster.index < this.clusterSites.length && cluster.t >= this.clusterSites[cluster.index].delay) {
          var site = this.clusterSites[cluster.index];
          this.spawnAirBomb(site.x, site.y, 44 * p.damage * p.projectileDamage, 112,
            0.18 + (cluster.index % 4) * 0.06);
          cluster.index++;
        }
        if (cluster.index >= this.clusterSites.length && cluster.t > 1.45) cluster.active = false;
      }
      for (var i = 0; i < this.airBombs.length; i++) {
        var bomb = this.airBombs[i];
        if (!bomb.alive) continue;
        if (!bomb.detonated) {
          bomb.fuse -= dt;
          if (bomb.fuse <= 0) this.detonateAirBomb(bomb);
        } else {
          bomb.life -= dt;
          if (bomb.life <= 0) this.killSprite(bomb);
        }
      }
    },

    tryCallAirstrike: function () {
      var run = this.run;
      if (this.state !== 'playing' || !run) return;
      if (this.airStrike.active) return;
      if ((run.strikeCharges || 0) <= 0) {
        sfx('click', { volume: 0.4, rate: 0.7 });
        this.floatText(this.p.x, this.p.y - 30, 'NO STRIKE CHARGES', '#8fb3c4', TYPE.micro);
        return;
      }
      run.strikeCharges--;
      this.startStrikeWing();
      this.showBanner('AIRSTRIKE CALLED', 'WARDEN BOMBERS INBOUND', false, true);
    },

    startOpeningAirstrike: function () {
      if (this.airStrike.active) return;
      this.startStrikeWing();
      // The opening is a scripted board-clearing beat, not a second charge.
      this.purgeBoard();
      if (!kit.juice.enabled) {
        this.airStrike.dur = 0.9;
        this.airStrike.dropCount = 6;
      }
      sfx('unlock', { volume: 0.42, rate: 0.58 });
    },

    startStrikeWing: function () {
      var as = this.airStrike, p = this.p;
      if (as.active) return;
      as.active = true; as.t = 0; as.dur = kit.juice.enabled ? 2.35 : 0.9;
      as.dir = Math.sin(this.run.time * 1.7) > 0 ? 1 : -1;
      as.span = this.scale.width + 420; as.startX = p.x - as.dir * as.span * 0.5;
      as.centerY = p.y; as.nextDrop = 0.34; as.dropIndex = 0; as.dropCount = 11;
      this.run.strikeSerial++;
      for (var i = 0; i < as.arrows.length; i++) {
        this.unpark(as.arrows[i]);
        as.arrows[i].setTint(0xffc361).setDisplaySize(46, 46).setAlpha(0.9);
      }
      sfx('telegraph', { volume: 0.72, rate: 0.54 });
      sfx('enemyShoot', { volume: 0.24, rate: 0.52 });
      this.queueSpectacleBeat('STRIKE WING', 0xffc361, 1.12, false);
    },

    startClusterBarrage: function () {
      var c = this.cluster, p = this.p;
      if (c.active) return;
      c.active = true; c.t = 0; c.index = 0; c.x = p.x + Math.cos(p.face) * 110; c.y = p.y + Math.sin(p.face) * 110;
      this.run.strikeSerial++;
      for (var i = 0; i < this.clusterSites.length; i++) {
        var a = i * TAU / this.clusterSites.length + this.run.time * 0.22;
        var r = i === 0 ? 0 : 48 + (i % 3) * 54;
        this.clusterSites[i].x = clamp(c.x + Math.cos(a) * r, -EDGE + 36, EDGE - 36);
        this.clusterSites[i].y = clamp(c.y + Math.sin(a) * r, -EDGE + 36, EDGE - 36);
        this.clusterSites[i].delay = i * 0.11;
      }
      sfx('telegraph', { volume: 0.68, rate: 0.62 });
      sfx('enemyShoot', { volume: 0.3, rate: 0.58 });
      this.queueSpectacleBeat('CLUSTER BARRAGE', 0xff8f6b, 1.08, false);
    },

    expireBonus: function (kind) {
      if (this.state !== 'playing') return;
      var data = BONUS_BY_KEY[kind];
      if (!data) return;
      sfx('click', { volume: 0.34, rate: 0.76 });
      this.floatText(this.p.x, this.p.y - 26, data.name + ' OFF', '#8fb3c4', TYPE.micro);
    },

    triggerBuffGlow: function (color) {
      this.buffGlowT = 0.48;
      this.buffGlowColor = color;
    },

    arcLine: function (x1, y1, x2, y2, tint, life) {
      for (var i = 0; i < this.arcLines.length; i++) {
        var arc = this.arcLines[i];
        if (arc.alive) continue;
        var dx = x2 - x1, dy = y2 - y1, len = Math.sqrt(dx * dx + dy * dy) || 1;
        arc.alive = true; arc.life = life == null ? 0.22 : life;
        arc.x1 = x1; arc.y1 = y1; arc.x2 = x2; arc.y2 = y2;
        this.unpark(arc.spr);
        arc.spr.setPosition((x1 + x2) * 0.5, (y1 + y2) * 0.5)
          .setDisplaySize(len, 7).setRotation(Math.atan2(dy, dx))
          .setTint(tint || 0x8effd8).setAlpha(0.92);
        return arc;
      }
      return null;
    },

    chainTarget: function (x, y, radius, a, b, c) {
      var list = this.query(x, y, radius), best = null, bestD = radius * radius;
      for (var i = 0; i < list.length; i++) {
        var e = list[i];
        if (!e.alive || e === a || e === b || e === c) continue;
        var dx = e.x - x, dy = e.y - y, d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = e; }
      }
      return best;
    },

    chainArc: function (first, damage) {
      var fromX = this.p.x, fromY = this.p.y, a = first, b = null, c = null;
      for (var link = 0; link < 3; link++) {
        var target = link === 0 ? first : this.chainTarget(fromX, fromY, 235, a, b, c);
        if (!target) break;
        this.arcLine(fromX, fromY, target.x, target.y);
        this.damage(target, damage * (link === 0 ? 0.55 : 0.38), target.x, target.y, true);
        fromX = target.x; fromY = target.y;
        if (link === 0) a = target;
        else if (link === 1) b = target;
        else c = target;
      }
    },

    startLanceStrike: function () {
      if (this.strike.active) return;
      var p = this.p, target = this.nearestEnemy(p.x, p.y, 920), scene = this;
      var token = this.runToken;
      var ang = target ? Math.atan2(target.y - p.y, target.x - p.x) : p.face;
      this.strike.active = true;
      this.strike.t = 0;
      this.strike.afterT = 0;
      this.strike.x = p.x; this.strike.y = p.y; this.strike.ang = ang;
      this.unpark(this.strike.line); this.unpark(this.strike.flash);
      if (kit.juice.enabled) { this.unpark(this.strike.skyLine); this.unpark(this.strike.skyGlow); }
      this.strike.line.setTint(0xffd67a).setAlpha(0.15);
      this.strike.flash.setTint(0xffd67a).setAlpha(0.08);
      sfx('telegraph', { volume: 0.65, rate: 1.2 });
      this.queueSpectacleBeat('ORBITAL LANCE', 0xffd67a, 1.08, false);
      this.showBanner('ORBITAL LANCE', 'LINE LOCKED. CLEARING AHEAD.', false, true);
      this.triggerBuffGlow(0xffd67a);
      this.after(0.54, function () {
        if (scene.runToken !== token || !scene.strike.active) return;
        scene.fireLanceStrike();
      }, 'strike');
    },

    fireLanceStrike: function () {
      if (!this.strike.active) return;
      var p = this.p, st = this.strike, cs = Math.cos(st.ang), sn = Math.sin(st.ang);
      var midX = st.x + cs * st.len * 0.5, midY = st.y + sn * st.len * 0.5;
      var list = this.query(midX, midY, st.len * 0.5 + 70);
      for (var i = 0; i < list.length; i++) {
        var e = list[i];
        if (!e.alive) continue;
        var rx = e.x - st.x, ry = e.y - st.y;
        var along = rx * cs + ry * sn, side = -rx * sn + ry * cs;
        if (along > -e.r && along < st.len && Math.abs(side) < 54 + e.r) {
          this.damage(e, 78 * p.damage, e.x, e.y, true);
        }
      }
      this.contactRing(midX, midY, 56, 260, 0.42, 0xffd67a, 0.9);
      this.fx.level.setParticleTint(0xffd67a);
      this.fx.level.emitParticleAt(midX, midY, kit.juice.enabled ? 26 : 7);
      sfx('pulse', { volume: 0.7, rate: 0.72 });
      kit.juice.shake(12, 260);
      this.strike.active = false;
      this.strike.afterT = kit.juice.enabled ? 0.34 : 0.12;
      this.park(st.line); this.park(st.flash);
    },

    wingCapacity: function () {
      var extra = this.p && this.p.ranks ? (this.p.ranks.wingCap || 0) : 0;
      var hangar = this.p ? (this.p.hangarWingBay || 0) : 0;
      return Math.min(WING_SLOTS.length, 3 + extra + hangar);
    },

    updateSlotUnlocks: function (forced) {
      var run = this.run, old = run.slotsUnlocked || 1;
      var unlocked = Math.max(old, this.p && this.p.hangarGunDeck ? this.p.hangarGunDeck : 1);
      if (forced || (this.debugState && this.debugState.forceWeaponDrop)) unlocked = 3;
      if (run.wave >= ARSENAL_III.unlockWave[1] || run.regionBossKills >= ARSENAL_III.bossKills[1]) unlocked = Math.max(unlocked, 2);
      if (run.wave >= ARSENAL_III.unlockWave[2] || run.regionBossKills >= ARSENAL_III.bossKills[2]) unlocked = 3;
      run.slotsUnlocked = Math.min(ARSENAL_III.maxSlots, unlocked);
      if (run.slotsUnlocked > old) {
        var label = run.slotsUnlocked === 2 ? 'SECONDARY ONLINE' : 'TERTIARY ONLINE';
        this.showBanner(label, 'GUN DECK BROADSIDE // ALL AUTO-FIRE', false, true);
        sfx('unlock', { volume: 0.55, rate: run.slotsUnlocked === 2 ? 1.1 : 1.24 });
      }
    },

    bonusWeight: function (data) {
      if (data.key === 'strike-wing' || data.key === 'cluster-barrage') {
        return data.weight * (1 + clamp(this.run.tideWeight, 0, 1) * 0.28);
      }
      return data.weight;
    },

    chooseBonusKind: function (early) {
      var total = 0, data, fallback = null;
      for (var i = 0; i < BONUS.length; i++) {
        data = BONUS[i];
        if (early && (data.key === 'purge' || data.key === 'lance' || data.key === 'strike-wing' || data.key === 'cluster-barrage')) continue;
        if (data.key === 'wing' && this.run.wings >= this.wingCapacity()) continue;
        var liveSame = false;
        for (var j = 0; j < this.bonuses.length; j++) {
          if (this.bonuses[j].alive && this.bonuses[j].kind === data.key) { liveSame = true; break; }
        }
        if (!liveSame) { total += this.bonusWeight(data); fallback = data.key; }
      }
      if (total <= 0) return null;
      var pick = srand() * total;
      for (var k = 0; k < BONUS.length; k++) {
        data = BONUS[k];
        if (early && (data.key === 'purge' || data.key === 'lance' || data.key === 'strike-wing' || data.key === 'cluster-barrage')) continue;
        if (data.key === 'wing' && this.run.wings >= this.wingCapacity()) continue;
        liveSame = false;
        for (var m = 0; m < this.bonuses.length; m++) {
          if (this.bonuses[m].alive && this.bonuses[m].kind === data.key) { liveSame = true; break; }
        }
        if (liveSame) continue;
        pick -= this.bonusWeight(data);
        if (pick <= 0) return data.key;
      }
      return fallback;
    },

    weaponKeyForUpgrade: function (weaponKey) {
      for (var i = 0; i < UPGRADES.length; i++) {
        if (UPGRADES[i].weapon === weaponKey) return UPGRADES[i].key;
      }
      return null;
    },

    equipWeapon: function (weaponKey, source, preferredSlot) {
      var data = WEAPON_BY_KEY[weaponKey];
      if (!data || (this.state !== 'playing' && this.state !== 'draft')) return false;
      var run = this.run;
      this.updateSlotUnlocks(false);
      var held = -1;
      for (var hi = 0; hi < run.weaponSlots.length; hi++) {
        if (run.weaponSlots[hi] === weaponKey) { held = hi; break; }
      }
      if (held >= 0) {
        run.gems += 8;
        run.score += 180;
        this.floatText(this.p.x, this.p.y - 28, '+8 GEMS', '#ffd67a', TYPE.body);
        this.showBanner('DUPLICATE CONVERTED', data.name.toUpperCase() + ' // GEM CACHE', false, true);
        sfx('gem', { volume: 0.32, rate: 1.24 });
        this.updateHud();
        return false;
      }
      var slot = preferredSlot == null ? -1 : preferredSlot;
      if (slot < 0 || slot >= run.slotsUnlocked || run.weaponSlots[slot]) {
        slot = -1;
        for (var si = 0; si < run.slotsUnlocked; si++) {
          if (!run.weaponSlots[si]) { slot = si; break; }
        }
      }
      if (slot < 0) {
        run.gems += 8;
        this.showBanner('GUN DECK FULL', data.name.toUpperCase() + ' // CONVERTED TO GEMS');
        sfx('gem', { volume: 0.32, rate: 1.24 });
        return false;
      }
      run.weaponSlots[slot] = weaponKey;
      run.equippedWeapon = run.weaponSlots[0] || weaponKey;
      if (!run.weaponSeen[weaponKey]) {
        run.weaponSeen[weaponKey] = true;
        run.weaponsSeen++;
        markWeaponSeen(weaponKey);
      }
      var upgradeKey = this.weaponKeyForUpgrade(weaponKey);
      if (upgradeKey) this.p.ranks[upgradeKey] = 1;
      if (source) this.floatText(this.p.x, this.p.y - 28, data.name.toUpperCase(), '#e7fff7', TYPE.body);
      this.showBanner(slot === 0 ? 'PRIMARY EQUIPPED' : (slot === 1 ? 'SECONDARY ONLINE' : 'TERTIARY ONLINE'),
        data.tier === 'upgraded' ? data.name.toUpperCase() + ' // UPGRADED' : data.name.toUpperCase());
      this.updateHud();
      return true;
    },

    rotateWeaponSlots: function () {
      var run = this.run;
      if (!run || run.slotsUnlocked < 2) return;
      var held = [];
      for (var i = 0; i < run.slotsUnlocked; i++) if (run.weaponSlots[i]) held.push(run.weaponSlots[i]);
      if (held.length < 2) return;
      var first = held.shift();
      held.push(first);
      for (var j = 0; j < run.slotsUnlocked; j++) run.weaponSlots[j] = j < held.length ? held[j] : '';
      run.equippedWeapon = run.weaponSlots[0] || 'bolt-lance';
      this.showBanner('PRIMARY PROMOTED', (WEAPON_BY_KEY[run.equippedWeapon] || WEAPONS[0]).name.toUpperCase());
      this.updateHud();
    },

    nextWeaponDrop: function (requested, tier) {
      var run = this.run, key = requested;
      if (key && WEAPON_BY_KEY[key]) {
        var requestedHeld = false;
        for (var rsi = 0; rsi < run.weaponSlots.length; rsi++) if (run.weaponSlots[rsi] === key) requestedHeld = true;
        if (!requestedHeld) return key;
      }
      if (!requested && tier === 'upgraded') {
        var regionalKeys = REGION_WEAPON_KEYS[this.run.regionKey] || [];
        for (var rwi = 0; rwi < regionalKeys.length; rwi++) {
          var regionalKey = regionalKeys[(this.run.weaponDropCursor + rwi) % regionalKeys.length];
          var regionalHeld = false;
          for (var rsi = 0; rsi < this.run.weaponSlots.length; rsi++) if (this.run.weaponSlots[rsi] === regionalKey) regionalHeld = true;
          if (!regionalHeld && !this.run.weaponSeen[regionalKey]) return regionalKey;
        }
        for (var rwi2 = 0; rwi2 < regionalKeys.length; rwi2++) {
          var fallbackRegional = regionalKeys[rwi2], fallbackHeld = false;
          for (var rsi2 = 0; rsi2 < this.run.weaponSlots.length; rsi2++) if (this.run.weaponSlots[rsi2] === fallbackRegional) fallbackHeld = true;
          if (!fallbackHeld) return fallbackRegional;
        }
      }
      var start = run.weaponDropCursor || 0;
      for (var pass = 0; pass < 2; pass++) {
        for (var i = 0; i < WEAPONS.length; i++) {
          var at = (start + i) % WEAPONS.length;
          var candidateData = WEAPONS[at], candidate = candidateData.key;
          if (tier && (candidateData.tier || 'base') !== tier) continue;
          var held = false;
          for (var si = 0; si < run.weaponSlots.length; si++) if (run.weaponSlots[si] === candidate) held = true;
          if (held) continue;
          if (pass === 0 && run.weaponSeen[candidate]) continue;
          run.weaponDropCursor = (at + 1) % WEAPONS.length;
          return candidate;
        }
      }
      for (var fi = 0; fi < WEAPONS.length; fi++) {
        if (!tier || (WEAPONS[fi].tier || 'base') === tier) return WEAPONS[fi].key;
      }
      return run.equippedWeapon === 'bolt-lance' ? 'scatter-volley' : 'bolt-lance';
    },

    spawnWeaponDrop: function (weaponKey, atX, atY) {
      var data = WEAPON_BY_KEY[weaponKey];
      var run = this.run;
      if (!data || run.weaponDrops >= WEAPON_DROP_CAP) return null;
      for (var q = 0; q < this.weaponDrops.length; q++) {
        if (this.weaponDrops[q].alive && this.weaponDrops[q].weapon === weaponKey) return null;
      }
      var drop = null;
      for (var i = 0; i < this.weaponDrops.length; i++) {
        if (!this.weaponDrops[i].alive) { drop = this.weaponDrops[i]; break; }
      }
      if (!drop) return null;
      if (atX == null || atY == null) {
        var a = srand() * TAU;
        atX = clamp(this.p.x + Math.cos(a) * 260, -EDGE + 30, EDGE - 30);
        atY = clamp(this.p.y + Math.sin(a) * 260, -EDGE + 30, EDGE - 30);
      }
      drop.alive = true;
      drop.weapon = weaponKey;
      drop.tier = data.tier || 'base';
      drop.x = clamp(atX, -EDGE + 22, EDGE - 22);
      drop.y = clamp(atY, -EDGE + 22, EDGE - 22);
      drop.vx = (srand() - 0.5) * 80;
      drop.vy = (srand() - 0.5) * 80;
      drop.life = 30;
      drop.born = run.time;
      this.unpark(drop.spr); this.unpark(drop.ring); this.unpark(drop.beacon);
      var upgraded = data.tier === 'upgraded';
      drop.spr.setTexture('atlas', data.glyph).setPosition(drop.x, drop.y)
        .setTint(upgraded ? 0xfff0b0 : data.color).setAlpha(1).setScale(upgraded ? 1.02 : 0.9).setRotation(0);
      drop.ring.setPosition(drop.x, drop.y).setTint(upgraded ? 0xffd67a : data.color)
        .setAlpha(upgraded ? 0.84 : 0.55).setDisplaySize(upgraded ? 104 : 86, upgraded ? 104 : 86);
      drop.beacon.setPosition(drop.x, drop.y - 54).setDisplaySize(9, 118)
        .setTint(upgraded ? 0xffd67a : data.color).setAlpha(upgraded ? 0.68 : 0.48).setRotation(0);
      run.weaponDrops++;
      run.weaponLastDrop = run.time;
      return drop;
    },

    activateWeaponDrop: function (weaponKey) {
      var data = WEAPON_BY_KEY[weaponKey];
      if (!data || this.state !== 'playing') return;
      for (var i = 0; i < this.weaponDrops.length; i++) {
        if (this.weaponDrops[i].alive && this.weaponDrops[i].weapon === weaponKey) {
          this.killSprite(this.weaponDrops[i]);
          break;
        }
      }
      if (!this.equipWeapon(weaponKey, true)) return;
      weaponSfx(data.cue, { volume: 0.52, rate: data.rate });
      this.triggerBuffGlow(data.color);
      var revealTitle = data.tier === 'upgraded' ? 'UPGRADED // ' + data.name.toUpperCase() : data.name.toUpperCase();
      this.queueSpectacleBeat(revealTitle, data.tier === 'upgraded' ? 0xffd67a : data.color,
        data.tier === 'upgraded' ? 1.18 : 1.0, false);
      this.showBanner(data.tier === 'upgraded' ? 'UPGRADED PRIMARY' : data.name.toUpperCase(),
        data.tier === 'upgraded' ? data.name.toUpperCase() + ' // LATE-RUN PRIZE' : 'ARSENAL PRIMARY EQUIPPED', false, true);
    },

    tryDropWeapon: function (e) {
      var run = this.run, forced = this.debugState && this.debugState.forceWeaponDrop;
      if (run.weaponDrops >= WEAPON_DROP_CAP) return false;
      var liveCount = 0;
      for (var i = 0; i < this.weaponDrops.length; i++) if (this.weaponDrops[i].alive) liveCount++;
      if (liveCount >= 3 && !forced) return false;
      if (forced || (run.time >= 30 && run.weaponsSeen < 2 && !run.weaponGuaranteeDone) ||
          (run.time >= 90 && run.weaponsSeen < 3 && !run.weaponGuarantee2Done)) {
        var wanted = typeof forced === 'string' && WEAPON_BY_KEY[forced] ? forced : null;
        var forcedTier = forced === 'upgraded' ? 'upgraded' : (forced === 'base' ? 'base' : null);
        var key = this.nextWeaponDrop(wanted, forcedTier);
        var drop = this.spawnWeaponDrop(key, e.x, e.y);
        if (drop) { if (run.weaponGuaranteeDone) run.weaponGuarantee2Done = true; run.weaponGuaranteeDone = true; }
        return !!drop;
      }
      if (run.time - run.weaponLastDrop < 5) return false;
      var pressure = clamp(run.waveIdx / (WAVES.length - 1), 0, 1);
      // Owner generosity directive #4: weapons must be a steady presence.
      var chance = 0.05 + pressure * 0.045 + clamp(run.combo / 12, 0, 1) * 0.025;
      if (this.p.ranks.dropLuck) chance *= 1 + this.p.ranks.dropLuck * 0.11;
      chance *= 1 + (this.p.hangarDropLuck || 0);
      if (srand() > chance) return false;
      var normalTier = run.wave >= 3 && srand() < 0.32 ? 'upgraded' : 'base';
      return !!this.spawnWeaponDrop(this.nextWeaponDrop(null, normalTier), e.x, e.y);
    },

    spawnBonus: function (kind, atX, atY) {
      var data = BONUS_BY_KEY[kind];
      if (!data || this.run.bonusDrops >= BONUS_DROP_CAP) return null;
      if (kind === 'wing' && this.run.wings >= this.wingCapacity()) return null;
      for (var q = 0; q < this.bonuses.length; q++) {
        if (this.bonuses[q].alive && this.bonuses[q].kind === kind) return null;
      }
      var b = null;
      for (var i = 0; i < this.bonuses.length; i++) {
        if (!this.bonuses[i].alive) { b = this.bonuses[i]; break; }
      }
      if (!b) return null;
      if (atX == null || atY == null) {
        var a = srand() * TAU;
        atX = clamp(this.p.x + Math.cos(a) * 260, -EDGE + 30, EDGE - 30);
        atY = clamp(this.p.y + Math.sin(a) * 260, -EDGE + 30, EDGE - 30);
      }
      b.alive = true;
      b.kind = kind;
      b.tide = false;
      b.x = clamp(atX, -EDGE + 22, EDGE - 22);
      b.y = clamp(atY, -EDGE + 22, EDGE - 22);
      b.vx = (srand() - 0.5) * 80;
      b.vy = (srand() - 0.5) * 80;
      b.life = 30;
      b.born = this.run.time;
      this.unpark(b.spr); this.unpark(b.halo); this.unpark(b.beacon);
      this.park(b.ring); this.park(b.crown);
      b.spr.setTexture('atlas', data.frame).setPosition(b.x, b.y)
        .setTint(data.color).setAlpha(1).setScale(1.0).setRotation(0);
      b.halo.setPosition(b.x, b.y).setTint(data.color).setAlpha(0.36).setDisplaySize(108, 108);
      b.beacon.setPosition(b.x, b.y - 52).setDisplaySize(7, 104)
        .setTint(data.color).setAlpha(0.38).setRotation(0);
      this.run.bonusDrops++;
      this.run.bonusSeen = true;
      this.run.bonusLastDrop = this.run.time;
      return b;
    },

    chooseTideKind: function () {
      var total = 0, fallback = null;
      for (var i = 0; i < TIDE_TURNERS.length; i++) {
        var data = TIDE_TURNERS[i], live = false;
        for (var j = 0; j < this.bonuses.length; j++) {
          if (this.bonuses[j].alive && this.bonuses[j].tide && this.bonuses[j].kind === data.key) {
            live = true; break;
          }
        }
        if (!live) { total += data.weight; fallback = data.key; }
      }
      if (total <= 0) return null;
      var pick = srand() * total;
      for (var k = 0; k < TIDE_TURNERS.length; k++) {
        var candidate = TIDE_TURNERS[k], same = false;
        for (var m = 0; m < this.bonuses.length; m++) {
          if (this.bonuses[m].alive && this.bonuses[m].tide && this.bonuses[m].kind === candidate.key) {
            same = true; break;
          }
        }
        if (same) continue;
        pick -= candidate.weight;
        if (pick <= 0) return candidate.key;
      }
      return fallback;
    },

    spawnTideDrop: function (kind, atX, atY) {
      var data = TIDE_BY_KEY[kind], run = this.run;
      if (!data || run.time - run.lastTideDrop < TIDE_DROP_GAP) return null;
      for (var q = 0; q < this.bonuses.length; q++) {
        if (this.bonuses[q].alive && this.bonuses[q].tide) return null;
      }
      var b = null;
      for (var i = 0; i < this.bonuses.length; i++) {
        if (!this.bonuses[i].alive) { b = this.bonuses[i]; break; }
      }
      if (!b) return null;
      if (atX == null || atY == null) {
        var a = srand() * TAU;
        atX = clamp(this.p.x + Math.cos(a) * 260, -EDGE + 30, EDGE - 30);
        atY = clamp(this.p.y + Math.sin(a) * 260, -EDGE + 30, EDGE - 30);
      }
      b.alive = true; b.tide = true; b.kind = kind;
      b.x = clamp(atX, -EDGE + 24, EDGE - 24);
      b.y = clamp(atY, -EDGE + 24, EDGE - 24);
      b.vx = (srand() - 0.5) * 70; b.vy = (srand() - 0.5) * 70;
      b.life = 36; b.born = run.time;
      this.unpark(b.spr); this.unpark(b.halo); this.unpark(b.beacon);
      this.unpark(b.ring); this.unpark(b.crown);
      b.spr.setTexture('atlas', data.frame).setPosition(b.x, b.y)
        .setTint(data.color).setAlpha(1).setScale(1.15).setRotation(0);
      b.halo.setPosition(b.x, b.y).setTint(0xffd67a).setAlpha(0.20).setDisplaySize(142, 142);
      b.ring.setPosition(b.x, b.y).setTint(0xffd67a).setAlpha(0.74).setDisplaySize(132, 132);
      b.crown.setPosition(b.x, b.y - 30).setTint(0xfff8d98d).setAlpha(0.95).setScale(0.72);
      b.beacon.setPosition(b.x, b.y - 70).setDisplaySize(12, 142)
        .setTint(0xfff8d98d).setAlpha(0.55).setRotation(0);
      run.lastTideDrop = run.time;
      run.tideDrops++;
      this.tidePressure();
      return b;
    },

    tryDropTide: function (e) {
      var run = this.run, debug = this.debugState || HM_DEBUG_STATE;
      if (run.time < 28 && !(debug && debug.forceTideDrop)) return false;
      if (run.time - run.lastTideDrop < TIDE_DROP_GAP) return false;
      var forced = debug && debug.forceTideDrop;
      var kind = forced && typeof forced === 'string' && TIDE_BY_KEY[forced] ? forced : this.chooseTideKind();
      if (!kind) return false;
      if (!forced && srand() > this.tidePressure()) return false;
      var drop = this.spawnTideDrop(kind, e && e.x, e && e.y);
      if (drop && forced) debug.forceTideDrop = false;
      return !!drop;
    },

    ensureWingDrop: function (atX, atY, reason) {
      var run = this.run;
      if (run.wings >= this.wingCapacity()) return null;
      for (var i = 0; i < this.bonuses.length; i++) {
        if (this.bonuses[i].alive && this.bonuses[i].kind === 'wing') return this.bonuses[i];
      }
      var b = this.spawnBonus('wing', atX, atY);
      if (!b) return null;
      run.wingGuaranteeDone = true;
      run.wingRecoveryDue = -1;
      if (reason) {
        this.showBanner('WING SIGNAL // GUARANTEED', reason);
        sfx('unlock', { volume: 0.54, rate: 1.1 });
      }
      return b;
    },

    tryDropBonus: function (e) {
      var run = this.run;
      if (this.suppressBonusDrops || run.bonusDrops >= BONUS_DROP_CAP) return;
      var forced = this.debugState && this.debugState.forceGenerousDrops;
      if (this.debugState && this.debugState.forceWingDrop) {
        this.debugState.forceWingDrop = false;
        this.ensureWingDrop(e.x, e.y, 'SCRIPTED FORMATION TEST');
        return;
      }
      if (forced && run.wings === 0) {
        this.ensureWingDrop(e.x, e.y, 'FORCED-GENEROUS FORMATION TEST');
        return;
      }
      if (this.tryDropWeapon(e)) return;
      if (run.wings === 0 && run.time >= 50 && !run.wingGuaranteeDone) {
        this.ensureWingDrop(e.x, e.y, 'FIRST WING BY WAVE 2');
        return;
      }
      if (run.wingRecoveryDue > 0 && run.time >= run.wingRecoveryDue && run.wings === 0) {
        this.ensureWingDrop(e.x, e.y, 'WING RECOVERY SIGNAL');
        return;
      }
      if (run.time - run.bonusLastDrop < DROP_TUNING.spacing && !forced) return;
      var early = !run.bonusSeen;
      var guarantee = forced || (early && run.time >= DROP_TUNING.floorTime && run.kills >= DROP_TUNING.floorKills);
      var pressure = clamp(run.waveIdx / (WAVES.length - 1), 0, 1);
      var streak = clamp(run.combo / 8, 0, 1);
      var chance = DROP_TUNING.bonusBase + pressure * DROP_TUNING.bonusPressure + streak * DROP_TUNING.bonusStreak;
      if (this.p.ranks.dropLuck) chance *= 1 + this.p.ranks.dropLuck * 0.12;
      chance *= 1 + (this.p.hangarDropLuck || 0);
      if (forced) chance = 1;
      if (!guarantee && srand() > chance) return;
      var kind = this.chooseBonusKind(early);
      if (kind) this.spawnBonus(kind, e.x, e.y);
    },

    activateBonus: function (kind) {
      if (TIDE_BY_KEY[kind]) {
        this.activateTideTurner(kind);
        return;
      }
      var data = BONUS_BY_KEY[kind];
      if (!data || this.state !== 'playing') return;
      for (var i = 0; i < this.bonuses.length; i++) {
        if (this.bonuses[i].alive && this.bonuses[i].kind === kind) {
          this.killSprite(this.bonuses[i]);
          break;
        }
      }
      sfx('unlock', { volume: 0.6, rate: kind === 'purge' ? 0.78 : 1.0 });
      if (kind === 'purge') {
        this.purgeBoard();
        sfx('pulse', { volume: 0.72, rate: 0.58 });
        this.triggerBuffGlow(data.color);
        this.showBanner('PURGE WAVE', 'MERIDIAN FIELD CLEARED', false, true);
        return;
      }
      if (kind === 'wing') {
        if (!this.addWing()) return;
        this.triggerBuffGlow(data.color);
        this.queueSpectacleBeat('WINGMAN ONLINE', data.color, 1.0, false);
        sfx('pulse', { volume: 0.55, rate: 1.12 });
        this.showBanner('WINGMAN ONLINE', 'FORMATION LINK ESTABLISHED', false, true);
        this.floatText(this.p.x, this.p.y - 26, 'WINGMAN JOINED', '#8effd8', TYPE.body);
        return;
      }
      if (kind === 'lance') {
        this.startLanceStrike();
        return;
      }
      if (kind === 'strike-wing') {
        this.run.strikeCharges = Math.min(4, (this.run.strikeCharges || 0) + 1);
        this.triggerBuffGlow(data.color);
        this.showBanner('STRIKE CHARGE BANKED', 'DOUBLE-TAP TO CALL THE WING', false, true);
        sfx('unlock', { volume: 0.5, rate: 1.05 });
        return;
      }
      if (kind === 'cluster-barrage') {
        this.startClusterBarrage();
        this.triggerBuffGlow(data.color);
        this.showBanner('CLUSTER BARRAGE', 'STAGGERED IMPACT GRID ARMED', false, true);
        return;
      }
      if (kind === 'carpet') {
        this.bombCarpet();
        this.triggerBuffGlow(data.color);
        this.queueSpectacleBeat('BOMB CARPET', data.color, 1.0, false);
        this.showBanner('BOMB CARPET', 'CHARGES DEPLOYED', false, true);
        return;
      }
      if (kind === 'overcharge') {
        this.run.overcharge = Math.min(data.cap, this.run.overcharge + data.cap);
        this.triggerBuffGlow(data.color);
        this.queueSpectacleBeat('OVERCHARGE', data.color, 1.0, false);
        this.showBanner('OVERCHARGE', 'NEXT 10 SHOTS CRIT', false, true);
        this.floatText(this.p.x, this.p.y - 26, 'CRIT WINDOW', '#fff36a', TYPE.body);
        return;
      }
      var old = this.run.buffs[kind] || 0;
      var duration = data.duration;
      if (kind === 'aegis') duration += (this.p.ranks.aegisDuration || 0) * 1.5;
      this.run.buffs[kind] = Math.min(data.cap + (kind === 'aegis' ? (this.p.ranks.aegisDuration || 0) * 1.5 : 0), old + duration);
      sfx('pulse', { volume: 0.42, rate: kind === 'aegis' ? 1.15 : 0.86 });
      this.triggerBuffGlow(data.color);
      this.queueSpectacleBeat(data.name, data.color, 0.98, false);
      this.showBanner(data.name, 'SYSTEM BOOST ONLINE', false, true);
      this.floatText(this.p.x, this.p.y - 26, data.name, '#a7ffe0', TYPE.body);
      if (kind === 'arsenal') this.arsenalFlashT = 0.45;
      if (kind === 'decoy') {
        this.decoyX = clamp(this.p.x + Math.cos(this.p.face) * 150, -EDGE + 28, EDGE - 28);
        this.decoyY = clamp(this.p.y + Math.sin(this.p.face) * 150, -EDGE + 28, EDGE - 28);
      }
    },

    activateTideTurner: function (kind) {
      var data = TIDE_BY_KEY[kind], run = this.run, p = this.p;
      if (!data || this.state !== 'playing') return;
      for (var i = 0; i < this.bonuses.length; i++) {
        if (this.bonuses[i].alive && this.bonuses[i].tide && this.bonuses[i].kind === kind) {
          this.killSprite(this.bonuses[i]);
          break;
        }
      }
      run.lastTideTurner = kind;
      this.triggerTideBeat(data);
      if (kind === 'last-stand') {
        var critical = 1 - clamp(p.hp / p.maxHp, 0, 1);
        run.tides[kind] = 8;
        run.lastStandDamage = clamp(2.25 + critical * 0.90, 2.25, 3.15);
        run.lastStandResist = Math.min(0.70, 0.48 + critical * 0.22);
        this.floatText(p.x, p.y - 28, 'DAMAGE x' + run.lastStandDamage.toFixed(2), '#fff3bf', TYPE.body);
      } else if (kind === 'singularity-core') {
        this.startSingularity();
      } else if (kind === 'rally-beacon') {
        run.tides[kind] = 0.9;
        this.startRally();
      } else if (kind === 'chrono-rewind') {
        run.tides[kind] = 0.9;
        this.startChronoRewind();
      } else if (kind === 'mirror-squadron') {
        run.tides[kind] = 10;
        for (var mi = 0; mi < this.mirrors.length; mi++) {
          var ghost = this.mirrors[mi];
          ghost.active = true;
          ghost.cd = 0.18 + mi * 0.12;
          ghost.x = p.x;
          ghost.y = p.y;
          this.unpark(ghost.spr); this.unpark(ghost.halo);
        }
      } else if (kind === 'bounty-frenzy') {
        run.tides[kind] = 8;
        this.floatText(p.x, p.y - 28, 'CHAIN KILLS ONLINE', '#ffc361', TYPE.body);
      }
    },

    bombCarpet: function () {
      var p = this.p, dmg = 34 * p.damage * p.projectileDamage;
      for (var i = 0; i < 7; i++) {
        var a = i * TAU / 7 + this.run.time * 0.2;
        this.dropMine(dmg, 104, p.x + Math.cos(a) * (70 + (i % 2) * 44),
          p.y + Math.sin(a) * (70 + (i % 2) * 44), 'mine-layer');
      }
      sfx('pulse', { volume: 0.62, rate: 0.62 });
      this.fx.level.setParticleTint(0xff9a5a);
      this.fx.level.emitParticleAt(p.x, p.y, kit.juice.enabled ? 24 : 6);
      kit.juice.shake(8, 230);
    },

    triggerPurgeFx: function () {
      var quiet = !kit.juice.enabled;
      if (this.spectacle.active) {
        this.spectacle.active = false;
        this.park(this.spectacle.ring); this.park(this.spectacle.flashA);
        this.park(this.spectacle.flashB); this.park(this.spectacle.flashWhite);
        for (var si = 0; si < this.spectacle.edges.length; si++) this.park(this.spectacle.edges[si]);
      }
      this.purgeDur = quiet ? 0.5 : 1.0;
      this.purgePre = quiet ? 0.12 : 0.2;
      this.purgeT = this.purgeDur;
      this.unpark(this.purgeShock); this.unpark(this.purgeFlash);
      this.purgeShock.setPosition(this.scale.width / 2, this.scale.height / 2)
        .setDisplaySize(34, 34).setAlpha(quiet ? 0.32 : 0.78);
      this.purgeFlash.setPosition(this.scale.width / 2, this.scale.height / 2)
        .setDisplaySize(this.scale.width * 0.65, this.scale.height * 0.65)
        .setAlpha(quiet ? 0.05 : 0.18);
      for (var i = 0; i < this.purgeRings.length; i++) {
        if (quiet && i > 0) { this.killSprite(this.purgeRings[i]); continue; }
        var ring = this.purgeRings[i];
        ring.alive = true;
        this.unpark(ring.spr);
        ring.spr.setPosition(this.scale.width / 2, this.scale.height / 2)
          .setDisplaySize(24, 24).setTint(0x8effd8)
          .setAlpha(quiet ? 0.28 : 0.72);
      }
      this.fx.level.setParticleTint(0x8effd8);
      this.fx.level.emitParticleAt(this.p.x, this.p.y, quiet ? 8 : 42);
      if (!quiet) kit.juice.shake(13, 360);
    },

    purgeBoard: function () {
      var killed = 0;
      this.triggerPurgeFx();
      this.suppressBonusDrops = true;
      for (var i = 0; i < this.enemies.length; i++) {
        var e = this.enemies[i];
        if (!e.alive) continue;
        if (e.boss) this.damage(e, e.maxHp * 0.38, e.x, e.y, true);
        else { this.defeat(e, e.x, e.y); killed++; }
      }
      this.suppressBonusDrops = false;
      this.run.bonus += 120 + killed * 2;
      this.floatText(this.p.x, this.p.y - 52, 'PURGE  +' + killed, '#8effd8', TYPE.head);
      sfx('death', { volume: 0.42, rate: 0.62 });
      this.rescore();
    },

    stepFormation: function (dt) {
      var p = this.p, heading = p.face, cs = Math.cos(heading), sn = Math.sin(heading);
      var follow = Math.min(1, dt * 8.5);
      for (var i = 0; i < this.wings.length; i++) {
        var w = this.wings[i];
        if (!w.alive) continue;
        var slot = WING_SLOTS[w.slot];
        var tx = p.x + cs * slot.back - sn * slot.side;
        var ty = p.y + sn * slot.back + cs * slot.side;
        if (w.joinT > 0) {
          w.joinT = Math.max(0, w.joinT - dt);
          var joinF = 1 - clamp(w.joinT / w.joinDur, 0, 1);
          var joinEase = 1 - Math.pow(1 - joinF, 3);
          w.x = w.joinX + (tx - w.joinX) * joinEase;
          w.y = w.joinY + (ty - w.joinY) * joinEase;
        }
        var dx = tx - w.x, dy = ty - w.y;
        if (w.joinT <= 0) {
          w.x += dx * follow;
          w.y += dy * follow;
        }
        w.vx = dx * follow / dt;
        w.vy = dy * follow / dt;
        var speed2 = w.vx * w.vx + w.vy * w.vy;
        w.moving = speed2 > 180;
        w.face = w.moving ? Math.atan2(w.vy, w.vx) : heading;
        w.thrust = clamp(Math.sqrt(speed2) / (p.speed || 1), 0, 1);
      }
    },

    formationTarget: function (w) {
      var p = this.p, heading = p.face, cs = Math.cos(heading), sn = Math.sin(heading);
      var slot = WING_SLOTS[w.slot];
      w.x = p.x + cs * slot.back - sn * slot.side;
      w.y = p.y + sn * slot.back + cs * slot.side;
      w.vx = 0; w.vy = 0; w.face = heading; w.heading = heading;
      w.bank = 0; w.moving = false; w.thrust = 0;
    },

    repackWings: function () {
      var next = 0;
      for (var i = 0; i < this.wings.length; i++) {
        if (!this.wings[i].alive) continue;
        this.wings[i].slot = next++;
      }
      this.run.wings = next;
    },

    addWing: function () {
      if (this.run.wings >= this.wingCapacity()) return null;
      var w = null;
      for (var i = 0; i < this.wings.length; i++) {
        if (!this.wings[i].alive) { w = this.wings[i]; break; }
      }
      if (!w) return null;
      w.alive = true;
      this.repackWings();
      var cs = Math.cos(this.p.face), sn = Math.sin(this.p.face);
      w.joinX = clamp(this.p.x - cs * 760, -EDGE - 40, EDGE + 40);
      w.joinY = clamp(this.p.y - sn * 760, -EDGE - 40, EDGE + 40);
      w.joinT = w.joinDur;
      this.formationTarget(w);
      w.x = w.joinX; w.y = w.joinY;
      this.unpark(w.spr); this.unpark(w.halo);
      w.spr.setTexture('atlas', 'wingman').setPosition(w.x, w.y)
        .setScale(0.78).setAlpha(0.96).clearTint().setRotation(w.heading);
      w.halo.setPosition(w.x, w.y).setDisplaySize(54, 54)
        .setTint((TRIM_BY_KEY[profile.hangar.trim] || TRIMS[0]).color).setAlpha(0.22);
      return w;
    },

    wingAt: function (x, y, radius) {
      var best = null, bestD = 1e30;
      for (var i = 0; i < this.wings.length; i++) {
        var w = this.wings[i];
        if (!w.alive) continue;
        var dx = w.x - x, dy = w.y - y, d = dx * dx + dy * dy;
        if (d < (radius + w.r) * (radius + w.r) && d < bestD) {
          best = w; bestD = d;
        }
      }
      return best;
    },

    loseWing: function (w) {
      if (!w || !w.alive || this.run.buffs.aegis > 0) return false;
      var x = w.x, y = w.y;
      this.run.lastWingLoss = this.run.time;
      this.run.wingLost = true;
      this.spawnWingHusk(w);
      this.killSprite(w);
      this.repackWings();
      this.contactRing(x, y, 14, 58, 0.24, 0x6de8ff, 0.78);
      this.fx.death.setParticleTint(0x6de8ff);
      this.fx.death.emitParticleAt(x, y, 5);
      this.fx.impact.setParticleTint(0xffc361);
      this.fx.impact.emitParticleAt(x, y, 2);
      sfx('death', { volume: 0.22, rate: 1.28 });
      this.floatText(x, y - 18, 'WING LOST', '#8effd8', TYPE.micro);
      if (this.run.wings === 0) {
        if (this.p.ranks.wingRevive > 0 && !this.run.wingReviveUsed) {
          this.run.wingReviveUsed = true;
          this.addWing();
          this.showBanner('WING REVIVAL', 'FORMATION LINK RESTORED');
          sfx('unlock', { volume: 0.48, rate: 1.18 });
          return true;
        }
        this.run.wingRecoveryDue = this.run.time + 4.5;
        this.run.wingRecoveryArmed = true;
      }
      kit.juice.shake(2.5, 110);
      return true;
    },

    interceptWingHit: function (x, y, radius) {
      var w = this.wingAt(x, y, radius);
      if (!w) return false;
      if (this.run.buffs.aegis <= 0) this.loseWing(w);
      return true;
    },

    spawnBase: function (index) {
      var spec = this.activeBases[index], data = spec && BASE_TYPES[spec.type], b = this.bases[index];
      if (!spec || !data || !b || b.alive || b.destroying) return null;
      b.alive = true;
      b.destroying = false;
      b.type = spec.type;
      b.x = clamp(spec.x, -EDGE + 100, EDGE - 100);
      b.y = clamp(spec.y, -EDGE + 100, EDGE - 100);
      b.maxHp = data.hp * (1 + this.run.time / this.activeRunSeconds * 0.18);
      b.hp = b.maxHp;
      b.r = data.r;
      b.cd = 1.25;
      b.spawnT = 1.5;
      b.alarm = 1;
      b.born = this.run.time;
      b.collapseT = 0;
      b.collapseStage = 0;
      b.flash = 0;
      this.baseCount++;
      this.unpark(b.spr); this.unpark(b.ring); this.unpark(b.alarmSpr); this.park(b.pillar);
      this.unpark(b.barBg); this.unpark(b.barFill);
      b.spr.setTexture('atlas', data.frame).setPosition(b.x, b.y)
        .setScale(data.scale).setTint(data.color).setAlpha(1).setRotation(spec.type === 'bastion' ? 0.2 : 0);
      b.ring.setPosition(b.x, b.y).setDisplaySize(data.r * 2.9, data.r * 2.9)
        .setTint(data.color).setAlpha(0.42);
      b.alarmSpr.setPosition(b.x, b.y).setDisplaySize(data.r * 2.35, data.r * 2.35)
        .setTint(0xff5a6a).setAlpha(0.36);
      b.barBg.setPosition(b.x, b.y - data.r - 30).setDisplaySize(88, 10).setAlpha(0.9);
      b.barFill.setPosition(b.x - 41, b.y - data.r - 30).setOrigin(0, 0.5)
        .setDisplaySize(82, 5).setTint(data.color).setAlpha(1);

      for (var g = 0; g < 6; g++) {
        var ga = g * TAU / 6 + (index + 1) * 0.7;
        var gx = clamp(b.x + Math.cos(ga) * 152, -EDGE, EDGE);
        var gy = clamp(b.y + Math.sin(ga) * 152, -EDGE, EDGE);
        this.spawn(this.regionEnemyFor(data.guard[g % data.guard.length], b.x), g === 0 && index > 0, gx, gy, false);
      }
      this.run.baseSpawned[index] = true;
      this.showBanner('OUTER SECTOR // ' + data.name, data.subtitle);
      sfx('telegraph', { volume: 0.42, rate: 0.82 + index * 0.08 });
      this.contactRing(b.x, b.y, data.r * 0.8, data.r * 2.4, 0.5, data.color, 0.8);
      return b;
    },

    baseQuery: function (x, y, radius) {
      var out = this.scratchBases;
      out.length = 0;
      var r2 = radius * radius;
      for (var i = 0; i < this.bases.length; i++) {
        var b = this.bases[i];
        if (!b.alive) continue;
        var dx = b.x - x, dy = b.y - y;
        if (dx * dx + dy * dy < r2) out.push(b);
      }
      return out;
    },

    relayAt: function (x, y) {
      for (var i = 0; i < this.bases.length; i++) {
        var b = this.bases[i];
        if (!b.alive || b.type !== 'relay') continue;
        var dx = b.x - x, dy = b.y - y;
        if (dx * dx + dy * dy < 330 * 330) return b;
      }
      return null;
    },

    fireBaseBolt: function (b) {
      var dx = this.p.x - b.x, dy = this.p.y - b.y;
      var d = Math.sqrt(dx * dx + dy * dy) || 1;
      this.fireEbolt(b, dx / d, dy / d, b.type === 'bastion' ? 28 : 18);
    },

    stepBases: function (dt) {
      var run = this.run, hiveCount = 0, relayCount = 0;
      for (var si = 0; si < this.activeBases.length; si++) {
        if (!run.baseSpawned[si] && run.time >= this.activeBases[si].at) this.spawnBase(si);
      }
      for (var i = 0; i < this.bases.length; i++) {
        var b = this.bases[i];
        if (b.destroying) {
          b.collapseT -= dt;
          var collapseElapsed = 1.45 - b.collapseT;
          if (b.collapseStage === 0 && collapseElapsed > 0.28) {
            b.collapseStage = 1;
            this.contactRing(b.x, b.y, 55, 250, 0.34, BASE_TYPES[b.type].color, 0.9);
          }
          if (b.collapseStage === 1 && collapseElapsed > 0.72) {
            b.collapseStage = 2;
            this.fx.smoke.emitParticleAt(b.x, b.y, kit.juice.enabled ? 12 : 3);
            this.fx.death.setParticleTint(BASE_TYPES[b.type].color);
            this.fx.death.emitParticleAt(b.x, b.y, kit.juice.enabled ? 22 : 6);
          }
          if (b.collapseStage === 2 && collapseElapsed > 1.08) {
            b.collapseStage = 3;
            this.contactRing(b.x, b.y, 30, 440, 0.52, 0xffd67a, 0.86);
          }
          if (b.collapseT <= 0) {
            b.destroying = false;
            this.park(b.spr); this.park(b.ring); this.park(b.alarmSpr);
            this.park(b.barBg); this.park(b.barFill);
          }
          continue;
        }
        if (!b.alive) continue;
        if (b.flash > 0) b.flash -= dt;
        if (b.type === 'hive') {
          hiveCount++;
          b.spawnT -= dt;
          b.alarm = 1 + Math.sin(run.time * 7) * 0.25;
          if (b.spawnT <= 0) {
            b.spawnT = 2.45;
            var data = BASE_TYPES.hive;
            for (var hs = 0; hs < 2; hs++) {
              var ha = run.time * 0.7 + hs * Math.PI;
              this.spawn(this.regionEnemyFor(data.guard[(Math.floor(run.time) + hs) % data.guard.length], b.x), false,
                clamp(b.x + Math.cos(ha) * 92, -EDGE, EDGE),
                clamp(b.y + Math.sin(ha) * 92, -EDGE, EDGE), false);
            }
          }
        } else if (b.type === 'bastion') {
          b.cd -= dt;
          b.alarm = b.cd < 0.45 ? 1 : 0.55;
          if (b.cd <= 0) {
            b.cd = 2.15;
            this.fireBaseBolt(b);
            this.contactRing(b.x, b.y, 22, 68, 0.18, 0xff756a, 0.6);
          }
        } else if (b.type === 'relay') {
          relayCount++;
          b.alarm = 0.55 + Math.sin(run.time * 4.4) * 0.2;
        }
      }
      run.basePressure = hiveCount;
      run.relayBoost = relayCount ? 1 : 0;
    },

    damageBase: function (b, amount, hx, hy, noCrit) {
      if (!b || !b.alive || this.state !== 'playing') return;
      var amt = amount * this.tideDamageMultiplier();
      if (!noCrit && this.p.crit > 0 && Math.random() < this.p.crit) amt *= 3;
      b.hp -= amt;
      b.flash = 0.12;
      this.fx.impact.setParticleTint(0xffd67a);
      this.fx.impact.emitParticleAt(hx == null ? b.x : hx, hy == null ? b.y : hy, 4);
      if (b.hp <= 0) this.defeatBase(b);
    },

    defeatBase: function (b) {
      if (!b || !b.alive) return;
      var data = BASE_TYPES[b.type], run = this.run;
      b.alive = false;
      b.destroying = true;
      b.collapseT = 1.45;
      b.collapseStage = 0;
      b.flash = 0;
      this.baseCount = Math.max(0, this.baseCount - 1);
      run.basesKilled++;
      this.contactRing(b.x, b.y, 74, 420, 0.46, data.color, 1);
      this.contactRing(b.x, b.y, 34, 220, 0.28, 0xffffff, 0.9);
      this.fx.level.setParticleTint(data.color);
      this.fx.level.emitParticleAt(b.x, b.y, kit.juice.enabled ? 28 : 7);
      this.fx.smoke.emitParticleAt(b.x, b.y, kit.juice.enabled ? 8 : 2);
      sfx('bossDeath', { volume: 0.42, rate: b.type === 'hive' ? 1.2 : 1.05 });
      kit.juice.shake(b.type === 'bastion' ? 12 : 9, 360);
      if (kit.juice.enabled) kit.juice.hitStop(70);
      this.tryDropTide(b);

      var wingLive = false;
      for (var wi = 0; wi < this.bonuses.length; wi++) {
        if (this.bonuses[wi].alive && this.bonuses[wi].kind === 'wing') { wingLive = true; break; }
      }
      var reward = run.wings < this.wingCapacity() && !wingLive ? 'wing' : this.chooseBonusKind(false);
      if (reward) this.spawnBonus(reward, b.x, b.y);
      this.grantRegionWeapons(regionAtX(b.x).key, 1, b.x, b.y);
      this.dropGem({ x: b.x, y: b.y, elite: true, xp: 5 });
      run.bonus = (run.bonus || 0) + 180;
      if (!run.wingGuaranteeDone && run.wings === 0) this.ensureWingDrop(b.x, b.y, 'FIRST BASE WING');
      this.showBanner(data.name + ' DOWN', 'REWARD BURST // SECTOR PRESSURE RELIEVED');
      this.rescore();
    },

    stepAmbient: function (dt) {
      var run = this.run, region = regionAtX(this.p.x);
      run.ambientT -= dt;
      if (run.ambientT <= 0) {
        run.ambientT = (region.key === 'ember-drift' ? 13 : 16) + srand() * 9;
        var nearBase = null;
        for (var nb = 0; nb < this.bases.length; nb++) {
          var baseNear = this.bases[nb];
          if (!baseNear.alive) continue;
          var bdxNear = baseNear.x - this.p.x, bdyNear = baseNear.y - this.p.y;
          if (bdxNear * bdxNear + bdyNear * bdyNear < 820 * 820) { nearBase = baseNear; break; }
        }
        var convoy = (run.ambientKind++ % 2) === 0;
        var skirmish = !!nearBase && run.ambientKind % 3 === 0;
        var count = convoy || skirmish ? 3 : 1;
        var startX = this.p.x - 720, startY = clamp(this.p.y - 260 + srand() * 520, -EDGE, EDGE);
        if (skirmish) { startX = nearBase.x - 180; startY = nearBase.y; }
        var eventKind = skirmish ? 'skirmish' : (convoy ? 'convoy' : 'meteor');
        if (!convoy && !skirmish && region.key === 'void-rift') eventKind = 'rift';
        else if (!convoy && !skirmish && region.key === 'crystal-shoals') eventKind = 'shard';
        var eventFrame = eventKind === 'skirmish' ? 'ic_wisp' : (eventKind === 'rift' ? 'ring' : (eventKind === 'shard' ? 'deco_hazard' : (convoy ? 'deco_grate' : 'p_flare')));
        var eventTint = eventKind === 'rift' ? region.palette.border :
          (eventKind === 'shard' ? 0xc9ffff : (eventKind === 'skirmish' ? 0xff756a : (convoy ? region.palette.near : 0xffc361)));
        for (var i = 0; i < this.ambientEvents.length; i++) {
          var ev = this.ambientEvents[i];
          if (i >= count) { ev.alive = false; this.park(ev.spr); continue; }
          ev.alive = true; ev.kind = eventKind; ev.tint = eventTint;
          ev.x = startX - i * 62; ev.y = startY + (convoy ? i * 20 - 20 : 0);
          ev.vx = convoy ? 94 : (eventKind === 'skirmish' ? 80 : (eventKind === 'shard' ? 280 : 420));
          ev.vy = convoy ? Math.sin(run.time) * 5 : (eventKind === 'skirmish' ? (i % 2 ? -48 : 42) : (eventKind === 'rift' ? 36 : -170));
          ev.life = convoy ? 9.5 : (eventKind === 'skirmish' ? 6.8 : (eventKind === 'rift' ? 3.8 : 2.4));
          ev.rot = convoy ? 0 : (eventKind === 'rift' ? run.time * 0.7 : -0.38);
          this.unpark(ev.spr);
          ev.spr.setTexture('atlas', eventFrame).setTint(eventTint)
            .setScale(convoy ? 0.34 : (eventKind === 'rift' ? 0.72 : 0.9))
            .setAlpha(convoy ? 0.7 : 0.9);
        }
        if (skirmish && nearBase) {
          for (var sk = 0; sk < 3; sk++) {
            var skA = sk * TAU / 3 + run.time;
            this.spawn(this.regionEnemyFor('drifter', nearBase.x, true), false,
              nearBase.x + Math.cos(skA) * 190, nearBase.y + Math.sin(skA) * 190, false);
          }
        }
        this.showBanner(skirmish ? 'BASE SKIRMISH' : (convoy ? 'WARDEN CONVOY' : (eventKind === 'rift' ? 'VOID EDDY' : (eventKind === 'shard' ? 'CRYSTAL DRIFT' : 'METEOR STREAK'))),
          skirmish ? region.name + ' // DRONES UNDER FIRE' : (convoy ? region.mechanic + ' // SUPPLY DRIFT' : region.flavor));
      }
      for (var j = 0; j < this.ambientEvents.length; j++) {
        var e = this.ambientEvents[j];
        if (!e.alive) continue;
        e.life -= dt;
        e.x += e.vx * dt; e.y += e.vy * dt;
        if (e.life <= 0 || e.x > EDGE + 800 || e.x < -EDGE - 800 ||
            e.y > EDGE + 500 || e.y < -EDGE - 500) {
          e.alive = false; this.park(e.spr);
        }
      }
    },

    stepInput: function (dt) {
      var p = this.p, kx = 0, ky = 0, k = this.keys;
      if (k.left.isDown || k.aleft.isDown) kx -= 1;
      if (k.right.isDown || k.aright.isDown) kx += 1;
      if (k.up.isDown || k.aup.isDown) ky -= 1;
      if (k.down.isDown || k.adown.isDown) ky += 1;
      var dx = kx, dy = ky;
      if (this.stick.active) { dx += this.stick.dx; dy += this.stick.dy; }
      var len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0.03) {
        var boostSpeed = this.run.buffs.overdrive > 0 ? 1.42 : 1;
        var sp = p.speed * boostSpeed * Math.min(1, len);
        var tx = dx / len * sp, ty = dy / len * sp;
        if (this.run.buffs.overdrive > 0) {
          var accel = 860 * dt;
          var dvx = clamp(tx - p.vx, -accel, accel);
          var dvy = clamp(ty - p.vy, -accel, accel);
          p.vx += dvx; p.vy += dvy;
        } else {
          p.vx = tx;
          p.vy = ty;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.face = Math.atan2(dy, dx);
        p.moving = true;
      } else {
        if (this.run.buffs.overdrive > 0) {
          var brake = Math.max(0, 1 - dt * 8.5);
          p.vx *= brake; p.vy *= brake;
        } else if (p.drift > 0) {
          var driftBrake = Math.max(0, 1 - dt * (9.5 - p.drift * 1.1));
          p.vx *= driftBrake; p.vy *= driftBrake;
        } else {
          p.vx = 0; p.vy = 0;
        }
        if (p.drift > 0 || this.run.buffs.overdrive > 0) {
          p.x += p.vx * dt; p.y += p.vy * dt;
        }
        p.moving = false;
      }
      p.x = clamp(p.x, -EDGE, EDGE);
      p.y = clamp(p.y, -EDGE, EDGE);
    },

    pickRegionEnemy: function (fallback, regionKey) {
      var choices = REGION_ENEMIES[regionKey];
      if (!choices || !choices.length) return fallback;
      var pick = choices[Math.floor(srand() * choices.length)];
      if (this.run && this.run.regionEnemiesSeen) this.run.regionEnemiesSeen[pick.key] = true;
      return pick.key;
    },

    regionEnemyFor: function (fallback, x, forceVariant) {
      var region = regionAtX(x == null ? this.p.x : x);
      if (!forceVariant && (srand() > 0.46 || !REGION_ENEMIES[region.key])) return fallback;
      return this.pickRegionEnemy(fallback, region.key);
    },

    stepRegionBossSchedule: function () {
      var run = this.run, region = regionAtX(this.p.x);
      if (run.bossUp || run.bossPending || run.regionBossActive) return;
      var forced = this.debugState && this.debugState.forceRegionBoss;
      if (forced) {
        var forcedKey = typeof forced === 'string' && REGION_BOSS_BY_KEY[forced] ? forced : region.key;
        var forcedDef = REGION_BOSS_BY_KEY[forcedKey];
        if (forcedDef) {
          this.debugState.forceRegionBoss = false;
          this.spawnRegionBoss(forcedKey, this.p.x + 260, this.p.y);
          return;
        }
      }
      for (var i = 0; i < REGION_BOSS_SCHEDULE.length; i++) {
        var spec = REGION_BOSS_SCHEDULE[i];
        if (spec.region !== region.key || run.time < spec.at || run.regionBossDefeated[spec.region] || run.regionBossSeen[spec.region]) continue;
        this.spawnRegionBoss(spec.region, spec.x, spec.y);
        break;
      }
    },

    spawnRegionBoss: function (regionKey, atX, atY) {
      var run = this.run, def = REGION_BOSS_BY_KEY[regionKey];
      if (!def || run.regionBossActive || run.bossUp || run.bossPending) return null;
      var boss = this.spawn(def.key, false, atX, atY, true);
      if (!boss) return null;
      run.regionBossActive = regionKey;
      run.regionBossSeen[regionKey] = true;
      run.bossPhase = 0;
      this.regionBossRef = boss;
      this.bossRef = boss;
      this.bossBarTitle.setText(def.name);
      this.bossBar.setVisible(true);
      this.showBanner('SWARM LORD // ' + def.name, def.title, false, true);
      sfx('telegraph', { volume: 0.72, rate: 0.54 });
      this.contactRing(boss.x, boss.y, 80, 560, 0.66, def.tint, 0.92);
      this.fx.smoke.emitParticleAt(boss.x, boss.y, kit.juice.enabled ? 12 : 3);
      kit.juice.shake(13, 420);
      return boss;
    },

    grantRegionWeapons: function (regionKey, count, atX, atY) {
      var keys = REGION_WEAPON_KEYS[regionKey] || [], run = this.run, granted = 0;
      var already = run.regionWeaponRewarded[regionKey] || 0;
      for (var i = already; i < keys.length && granted < count; i++) {
        var key = keys[i], live = false;
        for (var j = 0; j < this.weaponDrops.length; j++) {
          if (this.weaponDrops[j].alive && this.weaponDrops[j].weapon === key) { live = true; break; }
        }
        if (run.weaponSeen[key] || live) continue;
        var dx = atX + (granted === 0 ? -46 : 46), dy = atY;
        if (this.spawnWeaponDrop(key, dx, dy)) granted++;
      }
      run.regionWeaponRewarded[regionKey] = already + granted;
      return granted;
    },

    // ------------------------------------------------------------------
    // Campaign engine. Declarative level defs (LEVELS_SPEC.md) drive timed
    // events, scheduled Swarm Lords, the final encounter, objectives, and
    // star scoring. Everything runs off the simulation clock.
    campaignBossPoint: function (x, y) {
      var dx = x - this.p.x, dy = y - this.p.y, d = Math.sqrt(dx * dx + dy * dy);
      if (d <= 760) return { x: clamp(x, -EDGE, EDGE), y: clamp(y, -EDGE, EDGE) };
      var s = 620 / d;
      return { x: clamp(this.p.x + dx * s, -EDGE, EDGE), y: clamp(this.p.y + dy * s, -EDGE, EDGE) };
    },

    fireCampaignEvent: function (ev) {
      var run = this.run, i;
      if (ev.banner) this.showBanner(ev.banner[0], ev.banner[1]);
      if (ev.callout) this.floatText(this.p.x, this.p.y - 64, ev.callout.toUpperCase(), '#8effd8', TYPE.body);
      if (ev.spawnPack) {
        var eliteCut = ev.spawnPack.elite ? Math.ceil(ev.spawnPack.count / 3) : 0;
        for (i = 0; i < ev.spawnPack.count; i++) {
          this.spawn(ev.spawnPack.key, i < eliteCut, null, null, false);
        }
      }
      if (ev.spawnBase && this.activeBases.length < this.bases.length) {
        this.activeBases.push({ at: ev.at, type: ev.spawnBase.type, x: ev.spawnBase.x, y: ev.spawnBase.y });
        this.spawnBase(this.activeBases.length - 1);
      }
      if (ev.grantBonus) {
        this.spawnBonus(ev.grantBonus, clamp(this.p.x + 120, -EDGE + 30, EDGE - 30), this.p.y);
      }
      if (ev.gems) {
        for (i = 0; i < ev.gems.count; i++) {
          var ga = i * TAU / ev.gems.count;
          this.dropGem({ x: clamp(this.p.x + Math.cos(ga) * 140, -EDGE, EDGE),
            y: clamp(this.p.y + Math.sin(ga) * 140, -EDGE, EDGE), elite: false, xp: ev.gems.value });
        }
      }
      if (ev.heat === true && !run.musicHeat) { kit.audio.music('musicHeat', 900); run.musicHeat = true; }
      else if (ev.heat === false && run.musicHeat) { kit.audio.music('musicBase', 900); run.musicHeat = false; }
    },

    spawnCampaignEscort: function (regionKey, fb) {
      var def = REGION_BOSS_BY_KEY[regionKey];
      if (!def) return null;
      var run = this.run;
      var ex = clamp(this.p.x + (srand() < 0.5 ? -340 : 340), -EDGE, EDGE);
      var ey = clamp(this.p.y - 200, -EDGE, EDGE);
      var e = this.spawn(def.key, false, ex, ey, true);
      if (!e) return null;
      e.maxHp *= 0.6 * ((fb && fb.hpMul) || 1);
      e.hp = e.maxHp;
      run.regionBossActive = regionKey;
      run.regionBossSeen[regionKey] = true;
      this.regionBossRef = e;
      if (!this.bossRef || !this.bossRef.alive) {
        // The Core is down: the escort takes over the boss bar.
        this.bossRef = e;
        if (this.bossBarTitle) this.bossBarTitle.setText(def.name);
        this.bossBar.setVisible(true);
      }
      this.showBanner('ESCORT // ' + def.name, def.title, false, true);
      sfx('telegraph', { volume: 0.7, rate: 0.6 });
      this.contactRing(e.x, e.y, 80, 520, 0.6, def.tint, 0.9);
      return e;
    },

    stepCampaign: function (dt) {
      var run = this.run, L = this.level, i;
      if (!L || this.state !== 'playing') return;

      if (this.debugState && this.debugState.forceCompleteObjectives) {
        this.debugState.forceCompleteObjectives = false;
        for (i = 0; i < run.campaignObjs.length; i++) run.campaignObjs[i].done = true;
        run.campaignFinalSpawned = true;
        this.endRun(true);
        return;
      }

      var evs = L.events || [];
      while (run.campaignEventIdx < evs.length && run.time >= evs[run.campaignEventIdx].at) {
        this.fireCampaignEvent(evs[run.campaignEventIdx]);
        run.campaignEventIdx++;
      }

      if (!run.bossUp && !run.bossPending && !run.regionBossActive) {
        var sched = this.activeRegionBossSchedule;
        for (i = 0; i < sched.length; i++) {
          if (run.campaignRbSpawned[i] || run.time < sched[i].at) continue;
          var spec = sched[i];
          var pt = this.campaignBossPoint(spec.x, spec.y);
          var boss = this.spawnRegionBoss(spec.region, pt.x, pt.y);
          if (boss) {
            run.campaignRbSpawned[i] = true;
            if (spec.hpMul) { boss.maxHp *= spec.hpMul; boss.hp = boss.maxHp; }
            if (spec.dmgMul) { boss.dmg *= spec.dmgMul; boss.baseDmg = boss.dmg; }
          }
          break;
        }
      }

      var fb = this.campaignFinal;
      if (fb && !run.campaignFinalSpawned && !run.bossUp && !run.bossPending && !run.regionBossActive) {
        var fbAt = fb.at === 'duration' ? L.duration : fb.at;
        if (run.time >= fbAt) {
          run.campaignFinalSpawned = true;
          if (fb.type === 'core') this.spawnBoss();
          else {
            var fboss = this.spawnRegionBoss(fb.region,
              clamp(this.p.x + 320, -EDGE, EDGE), clamp(this.p.y - 160, -EDGE, EDGE));
            if (fboss) {
              if (fb.hpMul) { fboss.maxHp *= fb.hpMul; fboss.hp = fboss.maxHp; }
              if (fb.dmgMul) { fboss.dmg *= fb.dmgMul; fboss.baseDmg = fboss.dmg; }
            } else run.campaignFinalSpawned = false;
          }
        }
      }

      if (fb && fb.type === 'core' && run.campaignFinalSpawned && fb.escorts &&
          (run.bossUp || run.bossDown) && run.campaignEscortIdx < fb.escorts.length &&
          !run.regionBossActive && (!this.regionBossRef || !this.regionBossRef.alive)) {
        run.campaignEscortCd -= dt;
        if (run.campaignEscortCd <= 0) {
          if (this.spawnCampaignEscort(fb.escorts[run.campaignEscortIdx], fb)) {
            run.campaignEscortIdx++;
            run.campaignEscortCd = 9;
          } else run.campaignEscortCd = 2;
        }
      }

      var bossKills = run.regionBossKills + (run.bossDown ? 1 : 0);
      var othersTotal = 0, othersDone = 0;
      for (i = 0; i < run.campaignObjs.length; i++) {
        var oc = run.campaignObjs[i];
        if (oc.type === 'survive') continue;
        othersTotal++;
        if (oc.done ||
            (oc.type === 'boss' && bossKills >= oc.count) ||
            (oc.type === 'bases' && run.basesKilled >= oc.count) ||
            (oc.type === 'kills' && run.kills >= oc.count)) othersDone++;
      }
      // A mission with combat objectives ends when they are all cleared: the
      // survive clock is a ceiling, not a sentence. Pure survival missions
      // still run the full duration.
      var finalDead = !fb || (run.campaignFinalSpawned &&
        (fb.type === 'core' ? run.bossDown : !!run.regionBossDefeated[fb.region]) &&
        (!fb.escorts || run.campaignEscortIdx >= fb.escorts.length) &&
        (!this.regionBossRef || !this.regionBossRef.alive));
      var areaSecured = othersTotal > 0 && othersDone === othersTotal && finalDead;
      for (i = 0; i < run.campaignObjs.length; i++) {
        var o = run.campaignObjs[i];
        if (o.done) continue;
        var wasDone = false;
        if (o.type === 'survive') {
          o.progress = run.time;
          wasDone = run.time >= this.activeRunSeconds || areaSecured;
        }
        else if (o.type === 'boss') { o.progress = bossKills; wasDone = bossKills >= o.count; }
        else if (o.type === 'bases') { o.progress = run.basesKilled; wasDone = run.basesKilled >= o.count; }
        else if (o.type === 'kills') { o.progress = run.kills; wasDone = run.kills >= o.count; }
        if (wasDone) {
          o.done = true;
          this.showBanner('OBJECTIVE COMPLETE',
            o.type === 'survive' && areaSecured && run.time < this.activeRunSeconds ? 'AREA SECURED' : o.label);
          sfx('unlock', { volume: 0.5 });
        }
      }
      this.updateCampaignObjText();
      this.checkCampaignWin();
    },

    checkCampaignWin: function () {
      if (!this.level || this.state !== 'playing') return;
      var run = this.run;
      var bossKills = run.regionBossKills + (run.bossDown ? 1 : 0);
      var surviveHeld = false, othersTotal = 0, othersDone = 0;
      for (var i = 0; i < run.campaignObjs.length; i++) {
        var o = run.campaignObjs[i];
        if (o.type === 'survive') {
          if (!o.done && run.time < this.activeRunSeconds) surviveHeld = true;
          continue;
        }
        othersTotal++;
        if (o.done ||
            (o.type === 'boss' && bossKills >= o.count) ||
            (o.type === 'bases' && run.basesKilled >= o.count) ||
            (o.type === 'kills' && run.kills >= o.count)) othersDone++;
        else return;
      }
      if (surviveHeld && othersTotal === 0) return;
      var fb = this.campaignFinal;
      if (fb) {
        if (!run.campaignFinalSpawned) return;
        if (fb.type === 'core' && !run.bossDown) return;
        if (fb.type === 'region' && !run.regionBossDefeated[fb.region]) return;
        if (fb.type === 'core' && fb.escorts &&
            (run.campaignEscortIdx < fb.escorts.length ||
             (this.regionBossRef && this.regionBossRef.alive))) return;
      }
      this.endRun(true);
    },

    updateCampaignObjText: function () {
      if (!this.campaignObjText) return;
      if (!this.level || !this.run || this.state === 'over') {
        if (this.campaignObjText.visible) this.campaignObjText.setVisible(false);
        return;
      }
      var run = this.run, label = '';
      var bossKills = run.regionBossKills + (run.bossDown ? 1 : 0);
      var hudIdx = -1, hudVal = 0, hudObj = null;
      for (var i = 0; i < run.campaignObjs.length; i++) {
        var o = run.campaignObjs[i];
        if (o.done) continue;
        hudIdx = i; hudObj = o;
        if (o.type === 'survive') hudVal = Math.max(0, Math.floor(this.activeRunSeconds - run.time));
        else if (o.type === 'boss') hudVal = Math.min(o.count, bossKills);
        else if (o.type === 'bases') hudVal = Math.min(o.count, run.basesKilled);
        else hudVal = Math.min(o.count, run.kills);
        break;
      }
      // Rebuild the string only when the displayed value moves; the HUD text
      // itself is already guarded by setTextIfChanged.
      var hudKey = hudIdx * 10000000 + hudVal;
      if (hudKey === this.campaignObjHudKey && hudIdx >= 0) return;
      this.campaignObjHudKey = hudKey;
      if (hudObj) {
        if (hudObj.type === 'survive') label = 'SURVIVE ' + fmtTime(hudVal);
        else label = hudObj.label + '  ' + hudVal + '/' + hudObj.count;
      }
      if (!label) {
        if (this.campaignObjText.visible) this.campaignObjText.setVisible(false);
        return;
      }
      if (!this.campaignObjText.visible) this.campaignObjText.setVisible(true);
      setTextIfChanged(this.campaignObjText, label);
    },

    evalCampaignStars: function (won) {
      var L = this.level, run = this.run, p = this.p, out = [];
      if (!L) return out;
      for (var i = 0; i < L.stars.length; i++) {
        var st = L.stars[i], earned = false;
        if (won) {
          if (st.type === 'win') earned = true;
          else if (st.type === 'hull') earned = p.hp / p.maxHp * 100 >= st.pct;
          else if (st.type === 'time') earned = run.time < st.under;
          else if (st.type === 'kills') earned = run.kills >= st.atLeast;
          else if (st.type === 'level') earned = run.level >= st.atLeast;
          else if (st.type === 'noWingLost') earned = !run.wingLost;
        }
        out.push({ label: st.label, earned: earned });
      }
      return out;
    },

    stepWaves: function (dt) {
      var run = this.run;
      this.updateSlotUnlocks(false);
      if (!this.level) this.stepRegionBossSchedule();
      else this.stepCampaign(dt);
      if (!run.openingEnemyDone && run.time >= OPENING_BEATS.firstEnemy) {
        run.openingEnemyDone = true;
        this.spawn(this.regionEnemyFor('drifter', this.p.x, true), false,
          clamp(this.p.x + 300, -EDGE + 30, EDGE - 30), this.p.y, true);
      }
      if (!run.openingDropDone && run.time >= OPENING_BEATS.firstDrop) {
        run.openingDropDone = true;
        if (this.spawnBonus('overdrive', clamp(this.p.x + 116, -EDGE + 30, EDGE - 30), this.p.y)) {
          this.showBanner('OPENING CACHE', 'OVERDRIVE // KEEP THE BOARD MOVING');
          sfx('unlock', { volume: 0.38, rate: 1.24 });
        }
      }
      if (!run.openingAirstrikeDone && run.time >= OPENING_BEATS.airstrike) {
        run.openingAirstrikeDone = true;
        run.strikeCharges = Math.max(0, run.strikeCharges - 1);
        this.showBanner('WARDEN WING ON STATION', 'FREE OPENING STRIKE // BOARD CLEAR');
        this.startOpeningAirstrike();
      }
      if (this.debugState && this.debugState.forceSpectacle && this.state === 'playing') {
        this.debugState.forceSpectacle = false;
        var scene = this, token = this.runToken;
        this.triggerTideBeat(TIDE_TURNERS[1]);
        this.after(1.42, function () {
          if (scene.runToken !== token || scene.state !== 'playing') return;
          scene.run.combo = 25; scene.run.comboT = 2.6; scene.comboMilestone(25);
        }, 'spectacle');
        this.after(2.86, function () {
          if (scene.runToken !== token || scene.state !== 'playing') return;
          scene.triggerPurgeFx();
        }, 'spectacle');
      }
      while (run.waveIdx + 1 < this.activeWaves.length && run.time >= this.activeWaves[run.waveIdx + 1].at) {
        run.waveIdx++;
        run.wave++;
        this.showBanner('WAVE ' + String(run.wave).padStart(2, '0'), 'PRESSURE RISING');
        sfx('wave');
        this.burst(3 + Math.min(9, run.wave));
      }
      var row = this.activeWaves[run.waveIdx];

      if (this.debugState && this.debugState.forceGenerousDrops && run.wings === 0 && !run.wingGuaranteeDone) {
        this.ensureWingDrop(clamp(this.p.x + 120, -EDGE + 30, EDGE - 30), this.p.y,
          'FORCED-GENEROUS FORMATION TEST');
      }
      if (run.wings === 0 && run.time >= 50 && !run.wingGuaranteeDone) {
        this.ensureWingDrop(clamp(this.p.x + 120, -EDGE + 30, EDGE - 30), this.p.y,
          'FIRST WING BY WAVE 2');
      }
      if (run.wingRecoveryDue > 0 && run.time >= run.wingRecoveryDue && run.wings === 0) {
        this.ensureWingDrop(clamp(this.p.x + 220, -EDGE + 30, EDGE - 30), this.p.y,
          'WING RECOVERY SIGNAL');
      }
      if (this.debugState && this.debugState.forceWeaponDrop && run.slotsUnlocked >= 3 &&
          run.weaponSlots[0] && run.weaponSlots[1] && run.weaponSlots[2]) {
        this.debugState.forceWeaponDrop = false;
      }
      if (this.debugState && this.debugState.forceWeaponDrop && run.weaponDrops < WEAPON_DROP_CAP) {
        var hasWeaponDrop = false;
        for (var wfi = 0; wfi < this.weaponDrops.length; wfi++) {
          if (this.weaponDrops[wfi].alive) { hasWeaponDrop = true; break; }
        }
        if (!hasWeaponDrop) {
          var forcedWeapon = typeof this.debugState.forceWeaponDrop === 'string' &&
            WEAPON_BY_KEY[this.debugState.forceWeaponDrop] ? this.debugState.forceWeaponDrop : null;
          var forcedTier = this.debugState.forceWeaponDrop === 'upgraded' ? 'upgraded' :
            (this.debugState.forceWeaponDrop === 'base' ? 'base' : null);
          this.spawnWeaponDrop(this.nextWeaponDrop(forcedWeapon, forcedTier),
            clamp(this.p.x + 120, -EDGE + 30, EDGE - 30), this.p.y);
        }
      }
      if (this.debugState && this.debugState.forceTideDrop &&
          run.time - run.lastTideDrop >= TIDE_DROP_GAP) {
        var forcedTide = typeof this.debugState.forceTideDrop === 'string' &&
          TIDE_BY_KEY[this.debugState.forceTideDrop] ? this.debugState.forceTideDrop : this.chooseTideKind();
        if (forcedTide) this.spawnTideDrop(forcedTide,
          clamp(this.p.x + 120, -EDGE + 30, EDGE - 30), this.p.y);
        if (this.debugState.forceTideDrop && this.run.lastTideDrop === run.time) {
          this.debugState.forceTideDrop = false;
        }
      }

      run.spawnT -= dt;
      if (run.spawnT <= 0 && !run.bossUp && !run.bossPending && !run.regionBossActive) {
        run.spawnT = row.rate * (0.75 + srand() * 0.5) /
          (1 + Math.min(0.7, run.basePressure * 0.28)) / this.levelMods.spawnRate;
        var n = row.pack + (srand() < 0.2 ? 1 : 0) + (run.basePressure > 0 && srand() < 0.28 ? 1 : 0);
        for (var i = 0; i < n; i++) this.spawn(this.regionEnemyFor(row.pool[Math.floor(srand() * row.pool.length)]), false);
      }

      var minute = Math.floor(run.time / 60);
      if (minute > run.eliteMin && minute < 10) {
        run.eliteMin = minute;
        var pool = row.pool;
        var fam = this.regionEnemyFor(pool[Math.floor(srand() * pool.length)]);
        this.spawn(fam, true);
        if (minute >= 4) this.spawn(this.regionEnemyFor(pool[Math.floor(srand() * pool.length)]), true);
        this.burst(2 + Math.min(6, minute));
        this.showBanner('ELITE SPIKE', 'MINUTE ' + minute);
        sfx('telegraph');
        kit.juice.shake(7, 260);
      }

      if (!this.level && run.time >= RUN_SECONDS && !run.bossUp && !run.bossPending && !run.regionBossActive) this.spawnBoss();
    },

    burst: function (n) {
      for (var i = 0; i < Math.min(n, 16); i++) {
        var row = this.activeWaves[this.run.waveIdx];
        this.spawn(this.regionEnemyFor(row.pool[Math.floor(srand() * row.pool.length)]), false);
      }
    },

    evictFurthest: function () {
      var best = null, bestD = -1;
      for (var i = 0; i < this.enemies.length; i++) {
        var e = this.enemies[i];
        if (!e.alive || e.boss || e.elite) continue;
        var dx = e.x - this.p.x, dy = e.y - this.p.y, d = dx * dx + dy * dy;
        if (d > bestD) { bestD = d; best = e; }
      }
      if (best) this.retire(best);
      return !!best;
    },

    queueHatchling: function (fam, x, y) {
      for (var i = 0; i < this.hatchQueue.length; i++) {
        var slot = this.hatchQueue[i];
        if (slot.active) continue;
        slot.active = true; slot.fam = fam; slot.x = x; slot.y = y;
        return true;
      }
      return false;
    },

    stepHatchQueue: function () {
      this.watchdogPhase = 'hatch';
      var free = MAX_ENEMIES - this.enemyCount;
      if (free <= 0) return;
      for (var i = 0; i < this.hatchQueue.length && free > 0; i++) {
        var slot = this.hatchQueue[i];
        if (!slot.active) continue;
        if (!this.spawn(slot.fam, false, slot.x, slot.y, false)) break;
        slot.active = false;
        free--;
      }
    },

    spawn: function (fam, elite, atX, atY, force) {
      if (this.enemyCount >= MAX_ENEMIES && !force) return null;
      var e = null;
      for (var i = 0; i < this.enemies.length; i++) {
        if (!this.enemies[i].alive) { e = this.enemies[i]; break; }
      }
      if (!e && force) {
        this.evictFurthest();
        for (var f = 0; f < this.enemies.length; f++) {
          if (!this.enemies[f].alive) { e = this.enemies[f]; break; }
        }
      }
      if (!e) return null;
      var bossData = REGION_BOSS_BY_BOSS_KEY[fam] || null;
      var variantData = REGION_ENEMY_BY_KEY[fam] || null;
      var base = bossData || variantData || FAMILY[fam] || FAMILY.drifter;
      var spawnRegion = regionAtX(atX != null ? atX : this.p.x);
      var isRegionBoss = !!bossData;
      var diff = 1 + this.run.time / 460;         // difficulty ramp multiplier
      var ef = elite && !isRegionBoss ? 3.2 : 1;

      if (atX != null) { e.x = atX; e.y = atY; }
      else {
        var minD = base.boss ? 300 : 230;
        var ok = false;
        for (var tries = 0; tries < 8 && !ok; tries++) {
          var a = srand() * TAU;
          var rad = base.boss ? 420 : 400 + srand() * 260;
          e.x = clamp(this.p.x + Math.cos(a) * rad, -EDGE, EDGE);
          e.y = clamp(this.p.y + Math.sin(a) * rad, -EDGE, EDGE);
          var ddx = e.x - this.p.x, ddy = e.y - this.p.y;
          ok = ddx * ddx + ddy * ddy >= minD * minD;
        }
        if (!ok) {
          var il = Math.sqrt(this.p.x * this.p.x + this.p.y * this.p.y);
          var nx = il > 1 ? -this.p.x / il : 1, ny = il > 1 ? -this.p.y / il : 0;
          e.x = clamp(this.p.x + nx * minD * 1.4, -EDGE, EDGE);
          e.y = clamp(this.p.y + ny * minD * 1.4, -EDGE, EDGE);
        }
      }
      e.alive = true;
      e.fam = fam;
      e.elite = !!elite && !isRegionBoss;
      e.boss = !!base.boss || isRegionBoss;
      e.regionBoss = isRegionBoss;
      e.bossKey = isRegionBoss ? base.key : (base.boss ? 'meridian-core' : '');
      e.regionKey = isRegionBoss ? base.region : spawnRegion.key;
      e.variant = !!variantData;
      e.behavior = base.behavior || (base.boss ? 'core' : 'classic');
      e.egg = !!base.egg;
      e.hatchT = e.egg ? 4.6 : 0;
      e.latchT = 0; e.refractT = 0; e.blinkT = 0;
      e.r = base.r * (elite ? 1.22 : 1);
      e.maxHp = base.hp * (base.boss || isRegionBoss ? 1 : diff) * ef;
      e.hp = e.maxHp;
      e.speed = base.speed * (base.boss || isRegionBoss ? 1 : Math.min(1.55, diff)) * (elite ? 0.9 : 1);
      e.dmg = base.dmg * (elite ? 1.3 : 1) * Math.min(2.2, diff * 0.85);
      e.baseSpeed = e.speed;
      e.baseDmg = e.dmg;
      e.xp = (base.xp || 1) * (elite ? 5 : 1);
      if (this.level && !e.boss) {
        var lmod = this.levelMods;
        e.maxHp *= lmod.enemyHp; e.hp = e.maxHp;
        e.speed *= lmod.enemySpeed; e.baseSpeed = e.speed;
        e.dmg *= lmod.enemyDmg; e.baseDmg = e.dmg;
        e.xp = Math.max(1, Math.round(e.xp * lmod.xp));
      }
      e.tint = base.tint;
      e.phase = srand() * TAU;
      e.phaseStage = 0;
      e.phaseBeat = 0;
      e.flash = 0;
      e.cd = srand() * 1.2;
      e.hitAt = -1;
      e.tideSingularityId = -1;
      e.tideSingularityDamage = 0;
      e.callInId = -1;
      e.callInDamage = 0;
      e.vx = 0; e.vy = 0;

      var s = e.spr;
      this.unpark(s);
      s.setTexture('atlas', base.frame)
        .setScale(isRegionBoss ? 1.28 : (base.boss ? 1 : (elite ? 1.3 : (variantData && variantData.scale ? variantData.scale : 1))))
        .setTint(elite ? 0xfff0c6 : base.tint)
        .setAlpha(1).setAngle(0).setBlendMode(Phaser.BlendModes.NORMAL);
      s.setPosition(e.x, e.y);
      if (elite || e.boss) {
        this.unpark(e.aura);
        e.aura.setPosition(e.x, e.y)
          .setScale((e.r / 40) * (e.boss ? (isRegionBoss ? 2.5 : 2.1) : 1.25))
          .setTint(e.boss ? (isRegionBoss ? base.tint : 0xd6a4ff) : 0xffd67a).setAlpha(0.75);
        if (!e.boss) this.claimPip(e);
      } else {
        this.park(e.aura);
      }

      this.enemyCount++;
      return e;
    },

    claimPip: function (e) {
      for (var i = 0; i < this.hpPips.length; i++) {
        var pip = this.hpPips[i];
        if (pip.owner && pip.owner.alive) continue;
        pip.owner = e;
        this.unpark(pip.bg); this.unpark(pip.fill); this.unpark(pip.crown);
        pip.crown.setAlpha(0.95).setScale(0.9);
        return pip;
      }
      return null;
    },

    spawnBoss: function () {
      var run = this.run, scene = this;
      if (run.bossUp || run.bossPending) return;
      if (run.regionBossActive) return;
      run.bossPending = true;                 // stops normal spawning at once
      run.bossCount = 3;
      this.showBanner('THE MERIDIAN CORE', 'BREAK IT OR BE BROKEN');
      sfx('telegraph');
      kit.juice.shake(16, 900);

      var bx = 0, by = 0;
      this.bossLandX = bx; this.bossLandY = by;
      this.telZone = this.add.image(bx, by, 'atlas', 'zone').setDepth(-92)
        .setAlpha(0).setScale(0.4).setBlendMode(Phaser.BlendModes.ADD);
      this.telRing = this.add.image(bx, by, 'atlas', 'ring').setDepth(48)
        .setBlendMode(Phaser.BlendModes.ADD).setTint(0xd6a4ff).setScale(7).setAlpha(0.9);
      this.telCount = this.add.text(bx, by - 40, '3', {
        fontFamily: FONT_DISPLAY, fontSize: '64px', color: '#f0d4ff', fontStyle: 'bold'
      }).setOrigin(0.5).setDepth(49).setAlpha(0.9);
      this.registerWorldObject(this.telZone);
      this.registerWorldObject(this.telRing);
      this.registerWorldObject(this.telCount);
      this.telT = 0;
      this.telDur = 2.6;

      for (var n = 1; n <= 2; n++) {
        (function (k) {
          scene.after(k * 0.87, function () {
            if (!scene.telCount) return;
            scene.telCount.setText(String(3 - k));
            sfx('telegraph', { volume: 0.35, rate: 1 + k * 0.1 });
            kit.juice.shake(4 + k * 3, 200);
          }, 'boss-approach');
        }(n));
      }

      this.after(this.telDur, function () {
        if (scene.telRing) { scene.telRing.destroy(); scene.telRing = null; }
        if (scene.telCount) { scene.telCount.destroy(); scene.telCount = null; }
        if (scene.telZone) { scene.telZone.destroy(); scene.telZone = null; }
        var b = scene.spawn('boss', true, bx, by, true);
        run.bossPending = false;
        if (!b) {
          run.bossUp = false;
          if (scene.level) run.campaignFinalSpawned = false;   // retry next step
          return;
        }
        run.bossUp = true;
        scene.bossRef = b;
        if (scene.level && scene.campaignFinal && scene.campaignFinal.type === 'core') {
          b.maxHp *= scene.campaignFinal.hpMul || 1; b.hp = b.maxHp;
          b.dmg *= scene.campaignFinal.dmgMul || 1; b.baseDmg = b.dmg;
        }
        if (scene.bossBarTitle) scene.bossBarTitle.setText('MERIDIAN CORE');
        scene.bossBar.setVisible(true);
        kit.juice.shake(20, 500);
        scene.contactRing(b.x, b.y, 90, 620, 0.75, 0xd6a4ff, 0.95);
        scene.fx.smoke.emitParticleAt(b.x, b.y, 18);
        scene.burst(10);
      }, 'boss-approach');

      kit.audio.music('musicHeat', 1200);
      run.musicHeat = true;
    },

    buildHash: function () {
      var hash = this.hash;
      hash.forEach(clearHashBucket);
      for (var i = 0; i < this.enemies.length; i++) {
        var e = this.enemies[i];
        if (!e.alive) continue;
        var key = ((Math.floor(e.x / CELL) & 0xffff) << 16) | (Math.floor(e.y / CELL) & 0xffff);
        var b = hash.get(key);
        if (!b) { b = []; hash.set(key, b); }
        b.push(e);
      }
    },

    query: function (x, y, radius) {
      var out = this.scratch;
      out.length = 0;
      var cx0 = Math.floor((x - radius) / CELL), cx1 = Math.floor((x + radius) / CELL);
      var cy0 = Math.floor((y - radius) / CELL), cy1 = Math.floor((y + radius) / CELL);
      for (var cx = cx0; cx <= cx1; cx++) {
        for (var cy = cy0; cy <= cy1; cy++) {
          var b = this.hash.get(((cx & 0xffff) << 16) | (cy & 0xffff));
          if (!b) continue;
          for (var i = 0; i < b.length; i++) out.push(b[i]);
        }
      }
      return out;
    },

    nearestEnemy: function (x, y, maxDist) {
      var best = null, bestD = maxDist * maxDist;
      var list = this.query(x, y, maxDist);
      for (var i = 0; i < list.length; i++) {
        var e = list[i];
        var dx = e.x - x, dy = e.y - y;
        var d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = e; }
      }
      for (var bi = 0; bi < this.bases.length; bi++) {
        var base = this.bases[bi];
        if (!base.alive) continue;
        var bdx = base.x - x, bdy = base.y - y;
        var bd = bdx * bdx + bdy * bdy;
        if (bd < bestD) { bestD = bd; best = base; }
      }
      return best;
    },

    nearestElite: function (x, y, maxDist) {
      var best = null, bestD = maxDist * maxDist;
      var list = this.query(x, y, maxDist);
      for (var i = 0; i < list.length; i++) {
        var e = list[i];
        if (!e.alive || (!e.elite && !e.boss)) continue;
        var dx = e.x - x, dy = e.y - y, d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = e; }
      }
      return best || this.nearestEnemy(x, y, maxDist);
    },

    stepPrimaryWeapon: function (dt, slotIndex) {
      var p = this.p, r = p.ranks, run = this.run;
      var weaponKey = run.weaponSlots[slotIndex] || (slotIndex === 0 ? run.equippedWeapon : '');
      if (!weaponKey) return;
      var data = WEAPON_BY_KEY[weaponKey] || WEAPONS[0];
      var c = this.cool, arsenal = run.buffs.arsenal > 0;
      var slotPattern = ARSENAL_SLOT_PATTERNS[slotIndex] || ARSENAL_SLOT_PATTERNS[0];
      var slotDamage = slotPattern.damage;
      var slotCadence = slotPattern.cadence;
      var mastery = 1 + Math.min(7, Math.floor(Math.max(0, (r.lance || 1) - 1) / 2));
      var interval = Math.max(0.12, (0.60 - mastery * 0.045) * (1 - p.weaponRate * 0.07) *
        (1 - (p.hangarRate || 0)) *
        (arsenal ? 0.62 : 1) / data.rate / slotCadence);
      c.primarySlots[slotIndex] -= dt;
      if (c.primarySlots[slotIndex] > 0) return;
      var target = this.nearestEnemy(p.x, p.y, 900);
      if (!target) { c.primarySlots[slotIndex] = 0.08; return; }
      var ang = Math.atan2(target.y - p.y, target.x - p.x);
      var base = 9 * p.damage * p.projectileDamage * slotDamage * (arsenal ? 1.45 : 1) * (1 + mastery * 0.18);
      var speed = p.projectileSpeed;
      var multi = p.multishot + (arsenal ? 1 : 0);
      var fired = false;
      var i, n, sa, spread, shell, shot, pattern;

      if (data.key === 'bolt-lance') {
        n = Math.min(7, 1 + Math.floor((mastery - 1) / 3) + multi);
        spread = arsenal ? 0.20 : 0.14;
        pattern = SHOT_PATTERNS[n].centered;
        for (i = 0; i < n; i++) {
          sa = ang + pattern[i] * spread;
          fired = !!this.fireShot('bolt', p.x, p.y, Math.cos(sa) * 560 * speed, Math.sin(sa) * 560 * speed,
            base, 5 * p.projectileSize, p.pierce, data.key) || fired;
        }
      } else if (data.key === 'scatter-volley') {
        n = Math.min(9, 5 + mastery % 3 + multi + (arsenal ? 1 : 0));
        spread = 0.72 + (arsenal ? 0.12 : 0);
        pattern = SHOT_PATTERNS[n].normalized;
        for (i = 0; i < n; i++) {
          sa = ang + pattern[i] * spread;
          fired = !!this.fireShot('scatter', p.x, p.y, Math.cos(sa) * 450 * speed, Math.sin(sa) * 450 * speed,
            base * 0.56, 5 * p.projectileSize, p.pierce, data.key) || fired;
        }
      } else if (data.key === 'rail-piercer') {
        fired = !!this.fireShot('rail', p.x, p.y, Math.cos(ang) * 760 * speed, Math.sin(ang) * 760 * speed,
          base * 1.75, 7 * p.projectileSize, 3 + p.pierce, data.key);
      } else if (data.key === 'seeker-swarm') {
        n = Math.min(7, 3 + Math.floor(mastery / 3) + multi);
        pattern = SHOT_PATTERNS[n].centered;
        for (i = 0; i < n; i++) {
          sa = ang + pattern[i] * 0.42;
          fired = !!this.fireShot('seeker', p.x + Math.cos(sa) * 18, p.y + Math.sin(sa) * 18,
            Math.cos(sa) * 240 * speed, Math.sin(sa) * 240 * speed, base * 0.72, 8 * p.projectileSize,
            p.pierce, data.key) || fired;
        }
      } else if (data.key === 'plasma-mortar') {
        shell = this.fireShot('mortar', p.x, p.y, Math.cos(ang) * 360 * speed, Math.sin(ang) * 360 * speed - 230,
          base * 1.45, 12 * p.projectileSize, p.pierce, data.key);
        fired = !!shell;
      } else if (data.key === 'sweep-beam') {
        var sweepAng = run.time * 2.25 + Math.sin(run.time * 0.8) * 0.32;
        fired = !!this.fireBeam(sweepAng, base * 1.14, 430 + mastery * 25, 24 + mastery * 4, data.key, p.pierce);
      } else if (data.key === 'glaive-return') {
        fired = !!this.fireShot('glaive', p.x, p.y, Math.cos(ang) * 500 * speed, Math.sin(ang) * 500 * speed,
          base * 1.24, 10 * p.projectileSize, 2 + p.pierce, data.key);
      } else if (data.key === 'mine-layer') {
        n = Math.min(4, 1 + Math.floor(mastery / 3) + Math.floor(multi / 2));
        for (i = 0; i < n; i++) {
          var ma = p.face + Math.PI + (i - (n - 1) / 2) * 0.38;
          fired = !!this.dropMine(base * 1.18, 100 + mastery * 8,
            p.x - Math.cos(ma) * (28 + i * 18), p.y - Math.sin(ma) * (28 + i * 18), data.key) || fired;
        }
      } else if (data.key === 'ricochet-shard') {
        fired = !!this.fireShot('ricochet', p.x, p.y, Math.cos(ang) * 520 * speed, Math.sin(ang) * 520 * speed,
          base * 0.96, 7 * p.projectileSize, 1 + p.pierce, data.key);
      } else if (data.key === 'twin-phase') {
        for (i = -1; i <= 1; i += 2) {
          sa = ang + i * 0.09;
          fired = !!this.fireShot('twin', p.x + Math.cos(sa) * 8, p.y + Math.sin(sa) * 8,
            Math.cos(sa) * 610 * speed, Math.sin(sa) * 610 * speed, base * 0.76, 5 * p.projectileSize,
            p.pierce, data.key) || fired;
        }
      } else if (data.key === 'storm-coil') {
        fired = !!this.fireShot('coil', p.x, p.y, Math.cos(ang) * 500 * speed, Math.sin(ang) * 500 * speed,
          base * 1.05, 7 * p.projectileSize, p.pierce, data.key);
      } else if (data.key === 'lance-array-mk2') {
        var eliteTarget = this.nearestElite(p.x, p.y, 980);
        var eliteAng = eliteTarget ? Math.atan2(eliteTarget.y - p.y, eliteTarget.x - p.x) : ang;
        n = 3 + Math.min(2, multi);
        pattern = SHOT_PATTERNS[n].centered;
        for (i = 0; i < n; i++) {
          sa = eliteAng + pattern[i] * 0.16;
          shot = this.fireShot('lance-array', p.x, p.y, Math.cos(sa) * 620 * speed, Math.sin(sa) * 620 * speed,
            base * 0.52, 6 * p.projectileSize, 1 + p.pierce, data.key);
          if (shot) { shot.targetRef = eliteTarget; fired = true; }
        }
      } else if (data.key === 'nova-scatter') {
        n = Math.min(12, 9 + multi + (arsenal ? 1 : 0));
        spread = 0.92 + (arsenal ? 0.12 : 0);
        pattern = SHOT_PATTERNS[n].normalized;
        for (i = 0; i < n; i++) {
          sa = ang + pattern[i] * spread;
          shot = this.fireShot('nova-scatter', p.x, p.y, Math.cos(sa) * 480 * speed, Math.sin(sa) * 480 * speed,
            base * 0.34, 5 * p.projectileSize, p.pierce, data.key);
          if (shot) { shot.rangeBurst = true; shot.burstRadius = 96; shot.burstDmg = base * 0.14; fired = true; }
        }
      } else if (data.key === 'rail-storm') {
        fired = !!this.fireShot('rail-storm', p.x, p.y, Math.cos(ang) * 820 * speed, Math.sin(ang) * 820 * speed,
          base * 1.86, 8 * p.projectileSize, 4 + p.pierce, data.key);
      } else if (data.key === 'swarm-matrix') {
        n = Math.min(8, 4 + Math.floor(multi * 1.2));
        pattern = SHOT_PATTERNS[n].centered;
        for (i = 0; i < n; i++) {
          sa = ang + pattern[i] * 0.34;
          fired = !!this.fireShot('swarm-dart', p.x + Math.cos(sa) * 18, p.y + Math.sin(sa) * 18,
            Math.cos(sa) * 285 * speed, Math.sin(sa) * 285 * speed, base * 0.62,
            8 * p.projectileSize, p.pierce, data.key) || fired;
        }
      } else if (data.key === 'mortar-cascade') {
        n = 3 + Math.min(1, multi);
        pattern = SHOT_PATTERNS[n].centered;
        for (i = 0; i < n; i++) {
          sa = ang + pattern[i] * 0.28;
          fired = !!this.fireShot('mortar-cascade', p.x, p.y, Math.cos(sa) * 390 * speed,
            Math.sin(sa) * 390 * speed - 250 - i * 10, base * 0.42,
            12 * p.projectileSize, p.pierce, data.key) || fired;
        }
      } else if (data.key === 'prism-beam') {
        var prismAng = run.time * 2.6 + Math.sin(run.time * 0.9) * 0.38;
        fired = !!this.fireBeam(prismAng, base * 1.28, 560 + mastery * 28, 30 + mastery * 4,
          data.key, 1 + p.pierce);
      } else if (data.key === 'glaive-cyclone') {
        for (i = 0; i < 2 + Math.min(1, multi); i++) {
          shot = this.fireShot('cyclone-glaive', p.x, p.y, 0, 0, base * 0.86,
            10 * p.projectileSize, 2 + p.pierce, data.key, false, i);
          if (shot) {
            shot.orbitAngle = ang + i * TAU / (2 + Math.min(1, multi));
            shot.orbitRadius = 28;
            shot.orbitDir = i % 2 === 0 ? 1 : -1;
            shot.ox = p.x; shot.oy = p.y;
            fired = true;
          }
        }
      } else if (data.key === 'minefield-web') {
        var webId = ++run.weaponSerial;
        n = 3 + Math.min(1, multi);
        for (i = 0; i < n; i++) {
          var webAng = p.face + Math.PI + (i - (n - 1) / 2) * 0.42;
          var webMine = this.dropMine(base * 0.45, 116 + mastery * 8,
            p.x - Math.cos(webAng) * (38 + i * 22), p.y - Math.sin(webAng) * (38 + i * 22),
            data.key, false, webId, i);
          fired = !!webMine || fired;
        }
      } else if (data.key === 'ricochet-prism') {
        fired = !!this.fireShot('prism-ricochet', p.x, p.y, Math.cos(ang) * 560 * speed,
          Math.sin(ang) * 560 * speed, base * 1.25, 8 * p.projectileSize,
          3 + p.pierce, data.key);
      } else if (data.key === 'coil-tempest') {
        fired = this.fireCoilTempest(base * 1.34, data);
      }
      if (fired) {
        if (slotIndex === 0) this.fireWingVolley(ang, base * p.wingDamage);
        this.fx.impact.setParticleTint(data.muzzle || data.color);
        this.fx.impact.emitParticleAt(p.x + Math.cos(ang) * 16, p.y + Math.sin(ang) * 16,
          data.tier === 'upgraded' ? 5 : 2);
        if (data.tier === 'upgraded') this.contactRing(p.x + Math.cos(ang) * 16, p.y + Math.sin(ang) * 16,
          8, 28, 0.16, data.muzzle || data.color, 0.58);
        weaponSfx(data.cue, { volume: slotIndex === 0 ? 0.22 : (slotIndex === 1 ? 0.14 : 0.10), rate: data.rate });
      }
      c.primarySlots[slotIndex] = interval;
    },

    fireCoilTempest: function (damage, data) {
      var p = this.p, target = this.nearestEnemy(p.x, p.y, 360);
      if (!target) return false;
      var dx = target.x - p.x, dy = target.y - p.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      var shot = this.fireShot('coil-tempest', p.x, p.y, dx / d * 720 * p.projectileSpeed,
        dy / d * 720 * p.projectileSpeed, damage, 7 * p.projectileSize, 1 + p.pierce, data.key);
      if (!shot) return false;
      this.arcLine(p.x, p.y, target.x, target.y, data.color, 0.18);
      var second = this.chainTarget(target.x, target.y, 190, target, null, null);
      if (second) {
        this.arcLine(target.x, target.y, second.x, second.y, data.impact, 0.18);
        this.damage(second, damage * 0.46, second.x, second.y, true);
      }
      return true;
    },

    stepWeapons: function (dt) {
      var p = this.p, r = p.ranks, c = this.cool;
      var arsenal = this.run.buffs.arsenal > 0;
      var dmg = p.damage * (arsenal ? 1.45 : 1);

      var slotCount = Math.min(this.run.slotsUnlocked || 1, ARSENAL_III.maxSlots);
      for (var si = 0; si < slotCount; si++) {
        // Preserve the primary lane first; shed lower-priority Arsenal lanes
        // before the shared projectile pool reaches its hard ceiling.
        if (si > 0 && this.liveShots >= PROJECTILE_SOFT_CAP) {
          this.cool.primarySlots[si] = Math.max(this.cool.primarySlots[si], 0.08);
          continue;
        }
        this.stepPrimaryWeapon(dt, si);
      }

      if (r.wisp > 0) {
        c.wisp -= dt;
        if (c.wisp <= 0) {
          var tw = this.nearestEnemy(p.x, p.y, 640);
          if (tw) {
            var n = 1 + Math.floor(r.wisp / 4) + (arsenal ? 1 : 0);
            for (var wi = 0; wi < n; wi++) {
              var wa = Math.atan2(tw.y - p.y, tw.x - p.x) + (wi - (n - 1) / 2) * 0.5;
              this.fireShot('wisp', p.x + Math.cos(wa) * 18, p.y + Math.sin(wa) * 18,
                Math.cos(wa) * 230, Math.sin(wa) * 230,
                14 * dmg * (1 + r.wisp * 0.24), 8, 0);
            }
          }
          c.wisp = Math.max(0.25, (1.25 - r.wisp * 0.10) * (arsenal ? 0.72 : 1));
        }
      }

      if (r.pulse > 0) {
        c.pulse -= dt;
        if (c.pulse <= 0) {
          this.firePulse(140 + r.pulse * 26 + (arsenal ? 24 : 0), 17 * dmg * (1 + r.pulse * 0.18));
          c.pulse = Math.max(0.65, (2.4 - r.pulse * 0.16) * (arsenal ? 0.72 : 1));
        }
      }

      if (r.beam > 0) {
        c.beam -= dt;
        if (c.beam <= 0) {
          var tb = this.nearestEnemy(p.x, p.y, 900);
          var ba = tb ? Math.atan2(tb.y - p.y, tb.x - p.x) : p.face;
          this.fireBeam(ba, 22 * dmg * (1 + r.beam * 0.26), 520 + r.beam * 40 + (arsenal ? 50 : 0), 26 + r.beam * 5 + (arsenal ? 5 : 0));
          c.beam = Math.max(0.8, (3.2 - r.beam * 0.24) * (arsenal ? 0.74 : 1));
        }
      }

      if (r.mine > 0) {
        c.mine -= dt;
        if (c.mine <= 0) {
          this.dropMine(28 * dmg * (1 + r.mine * 0.22), 92 + r.mine * 9 + (arsenal ? 16 : 0));
          c.mine = Math.max(0.42, (1.7 - r.mine * 0.14) * (arsenal ? 0.76 : 1));
        }
      }

      if (r.orbit > 0) {
        this.orbitAngle += dt * (1.5 + r.orbit * 0.13);
        c.orbit -= dt;
        if (c.orbit <= 0) {
          c.orbit = 0.09;
          var count = Math.min(8, 1 + r.orbit);
          var rad = 44 + r.orbit * 4;
            var odmg = 15 * dmg * (1 + r.orbit * 0.22);
          for (var oi = 0; oi < count; oi++) {
            var oa = this.orbitAngle + oi * TAU / count;
            var bx = p.x + Math.cos(oa) * rad, by = p.y + Math.sin(oa) * rad;
            var near = this.query(bx, by, 26);
            for (var ni = 0; ni < near.length; ni++) {
              var en = near[ni];
              if (!en.alive) continue;
              var ddx = en.x - bx, ddy = en.y - by, rr = en.r + 13;
              if (ddx * ddx + ddy * ddy < rr * rr && en.hitAt < this.run.time - 0.24) {
                en.hitAt = this.run.time;
                this.damage(en, odmg, bx, by);
              }
            }
          }
        }
      }
    },

    fireWingVolley: function (ang, dmg) {
      for (var i = 0; i < this.wings.length; i++) {
        var w = this.wings[i];
        if (!w.alive) continue;
        var spread = w.slot === 0 ? -0.16 : (w.slot === 1 ? 0.16 : (w.slot === 3 ? -0.28 : 0));
        var sa = ang + spread;
        this.fireShot('wing', w.x + Math.cos(sa) * 13, w.y + Math.sin(sa) * 13,
          Math.cos(sa) * 560, Math.sin(sa) * 560, dmg, 4, 0);
      }
    },

    fireShot: function (kind, x, y, vx, vy, dmg, r, pierce, weaponKey, mirror, variant) {
      if (this.liveShots >= MAX_SHOTS) return null;
      for (var i = 0; i < this.shots.length; i++) {
        var s = this.shots[i];
        if (s.alive) continue;
        var style = weaponKey && WEAPON_BY_KEY[weaponKey] ? WEAPON_BY_KEY[weaponKey] : null;
        s.alive = true; this.liveShots++; s.kind = kind; s.weapon = weaponKey || ''; s.x = x; s.y = y; s.vx = vx; s.vy = vy;
        s.r = r; s.dmg = dmg; s.pierce = pierce; s.age = 0; s.gravity = kind === 'mortar' ? 460 : 0;
        if (kind === 'mortar-cascade') s.gravity = 460;
        s.bounces = kind === 'ricochet' || kind === 'prism-ricochet' ? 3 + pierce : 0; s.returning = false;
        s.lastHitId = -1; s.lastHitT = -1;
        s.targetRef = null; s.targetRetargetT = 0; s.ox = x; s.oy = y; s.orbitRadius = 0; s.orbitAngle = 0; s.orbitDir = 1;
        s.splitDepth = 0; s.respawned = false; s.forked = false; s.rangeBurst = false;
        s.burstRadius = 0; s.burstDmg = 0; s.variant = variant || 0;
        s.life = kind === 'seeker' || kind === 'swarm-dart' || kind === 'drone' || kind === 'wisp' ? 3.6 :
          (kind === 'glaive' || kind === 'cyclone-glaive' ? 2.8 :
            (kind === 'mortar' || kind === 'mortar-cascade' ? 2.4 : (kind === 'coil-tempest' ? 1.0 : 1.7)));
        s.boosted = this.run.buffs.arsenal > 0;
        s.forceCrit = !!(!mirror && this.run.overcharge > 0 && kind !== 'drone' && weaponKey);
        if (s.forceCrit) this.run.overcharge--;
        var frame = style ? style.frame : (kind === 'seeker' || kind === 'swarm-dart' || kind === 'wisp' ? 'wisp' :
          (kind === 'mortar' || kind === 'mortar-cascade' ? 'ic_pulse' : (kind === 'wing' ? 'bolt' : 'bolt')));
        var tint = s.boosted ? 0xffd67a : (style ? style.color : (kind === 'wing' ? 0x8effd8 : 0xffffff));
        s.visualScale = (style ? (s.boosted ? 1.18 : (style.tier === 'upgraded' ? 1.08 : 1.0)) :
          (kind === 'wing' ? 0.94 : 1.1)) * (r / 5);
        this.unpark(s.spr);
        s.spr.setTexture('atlas', frame)
          .setPosition(x, y).setAlpha(1)
          .setTint(tint)
          .setScale(s.visualScale)
          .setRotation(Math.atan2(vy, vx));
        return s;
      }
      return null;
    },

    firePulse: function (max, dmg, atX, atY, tint, mode) {
      for (var i = 0; i < this.pulses.length; i++) {
        var q = this.pulses[i];
        if (q.alive) continue;
        q.alive = true; q.x = atX == null ? this.p.x : atX; q.y = atY == null ? this.p.y : atY;
        q.r = 8; q.max = max; q.dmg = dmg; q.stamp = this.run.time; q.forceCrit = false;
        q.mode = mode || 'normal'; q.tint = tint || (this.run.buffs.arsenal > 0 ? 0xffd67a : 0x9fffe2);
        this.unpark(q.spr);
        q.spr.setPosition(q.x, q.y)
          .setScale(0.1).setAlpha(0.9)
          .setTint(q.tint);
        weaponSfx('pulse', { volume: 0.4 });
        kit.juice.shake(4, 130);
        return q;
      }
      return null;
    },

    burstShot: function (shot) {
      var data = WEAPON_BY_KEY[shot.weapon] || WEAPONS[0];
      if (!shot.rangeBurst) return;
      this.firePulse(shot.burstRadius || 90, shot.burstDmg || shot.dmg * 0.5,
        shot.x, shot.y, data.impact || data.color, 'nova');
      this.contactRing(shot.x, shot.y, 14, shot.burstRadius || 90, 0.26, data.impact || data.color, 0.82);
      this.fx.death.setParticleTint(data.impact || data.color);
      this.fx.death.emitParticleAt(shot.x, shot.y, kit.juice.enabled ? 9 : 3);
    },

    forkRail: function (shot, e) {
      if (shot.forked) return;
      shot.forked = true;
      var data = WEAPON_BY_KEY[shot.weapon] || WEAPONS[0], baseAngle = Math.atan2(shot.vy, shot.vx);
      for (var i = -1; i <= 1; i += 2) {
        var a = baseAngle + i * 0.32;
        this.fireShot('rail-fork', e.x, e.y, Math.cos(a) * 690 * this.p.projectileSpeed,
          Math.sin(a) * 690 * this.p.projectileSpeed, shot.dmg * 0.42,
          5 * this.p.projectileSize, 1 + this.p.pierce, data.key);
      }
      this.arcLine(e.x, e.y, e.x + Math.cos(baseAngle - 0.32) * 120, e.y + Math.sin(baseAngle - 0.32) * 120,
        data.impact || data.color, 0.20);
      this.arcLine(e.x, e.y, e.x + Math.cos(baseAngle + 0.32) * 120, e.y + Math.sin(baseAngle + 0.32) * 120,
        data.impact || data.color, 0.20);
    },

    respawnSwarmDart: function (shot, e) {
      if (shot.respawned) return;
      shot.respawned = true;
      var data = WEAPON_BY_KEY[shot.weapon] || WEAPONS[0], target = this.nearestEnemy(e.x, e.y, 760);
      var a = target ? Math.atan2(target.y - e.y, target.x - e.x) : Math.atan2(shot.vy, shot.vx);
      var child = this.fireShot('swarm-dart', e.x, e.y, Math.cos(a) * 315 * this.p.projectileSpeed,
        Math.sin(a) * 315 * this.p.projectileSpeed, shot.dmg * 0.82, shot.r, this.p.pierce, data.key);
      if (child) {
        child.respawned = false;
        this.arcLine(e.x, e.y, target ? target.x : e.x + Math.cos(a) * 80,
          target ? target.y : e.y + Math.sin(a) * 80, data.impact || data.color, 0.16);
      }
    },

    splitPrism: function (shot) {
      if (shot.splitDepth >= 2) return;
      var data = WEAPON_BY_KEY[shot.weapon] || WEAPONS[0], baseAngle = Math.atan2(shot.vy, shot.vx);
      for (var i = -1; i <= 1; i += 2) {
        var a = baseAngle + i * 0.28;
        var child = this.fireShot('prism-ricochet', shot.x, shot.y, Math.cos(a) * 520 * this.p.projectileSpeed,
          Math.sin(a) * 520 * this.p.projectileSpeed, shot.dmg * 0.48, shot.r * 0.88,
          Math.max(0, shot.pierce - 1), data.key);
        if (child) {
          child.splitDepth = shot.splitDepth + 1;
          child.bounces = Math.max(0, shot.bounces);
        }
      }
      this.fx.impact.setParticleTint(data.impact || data.color);
      this.fx.impact.emitParticleAt(shot.x, shot.y, 5);
    },

    fireBeam: function (ang, dmg, len, wid, weaponKey, pierce, originX, originY, mirror) {
      for (var i = 0; i < this.beams.length; i++) {
        var b = this.beams[i];
        if (b.alive) continue;
        var beamStyle = weaponKey && WEAPON_BY_KEY[weaponKey] ? WEAPON_BY_KEY[weaponKey] : null;
        var ox = originX == null ? this.p.x : originX, oy = originY == null ? this.p.y : originY;
        b.alive = true; b.x = ox; b.y = oy; b.ang = ang; b.dmg = dmg; b.len = len; b.wid = wid; b.life = 0.34;
        b.refract = !!(beamStyle && beamStyle.key === 'prism-beam' && !mirror);
        b.forceCrit = !!(!mirror && this.run.overcharge > 0 && weaponKey);
        if (b.forceCrit) this.run.overcharge--;
        this.unpark(b.spr);
        b.spr.setPosition(ox + Math.cos(ang) * len / 2, oy + Math.sin(ang) * len / 2)
          .setRotation(ang).setDisplaySize(len, wid).setAlpha(0.95)
          .setTint(this.run.buffs.arsenal > 0 ? 0xffd67a : (beamStyle ? beamStyle.color : 0xff8fd0));
        if (!mirror) {
          weaponSfx('pulse', { volume: 0.35, rate: 0.7 });
          kit.juice.shake(5, 150);
        }
        var list = this.query(ox + Math.cos(ang) * len / 2, oy + Math.sin(ang) * len / 2, len / 2 + 40);
        var cs = Math.cos(-ang), sn = Math.sin(-ang);
        var prismHits = 0;
        for (var k = 0; k < list.length; k++) {
          var e = list[k];
          if (!e.alive) continue;
          var rx = e.x - ox, ry = e.y - oy;
          var lx = rx * cs - ry * sn, ly = rx * sn + ry * cs;
          if (lx > -e.r && lx < len && Math.abs(ly) < wid / 2 + e.r) {
            this.damage(e, dmg * (b.forceCrit ? 3 : 1), e.x, e.y, b.forceCrit);
            this.fx.impact.setParticleTint(beamStyle ? (beamStyle.impact || beamStyle.color) : 0xff8fd0);
            this.fx.impact.emitParticleAt(e.x, e.y, beamStyle && beamStyle.tier === 'upgraded' ? 5 : 2);
            if (b.refract && prismHits < 2) {
              this.fireBeam(ang + (prismHits === 0 ? 0.42 : -0.42), dmg * 0.10, len * 0.58,
                wid * 0.72, weaponKey, Math.max(0, pierce - 1), e.x, e.y, true);
              prismHits++;
            }
          }
        }
        var beamBases = this.baseQuery(ox + Math.cos(ang) * len / 2,
          oy + Math.sin(ang) * len / 2, len / 2 + 100);
        for (var kb = 0; kb < beamBases.length; kb++) {
          var base2 = beamBases[kb];
          if (!base2.alive) continue;
          var brx = base2.x - ox, bry = base2.y - oy;
          var blx = brx * cs - bry * sn, bly = brx * sn + bry * cs;
          if (blx > -base2.r && blx < len && Math.abs(bly) < wid / 2 + base2.r) {
            this.damage(base2, dmg * (b.forceCrit ? 3 : 1), base2.x, base2.y, b.forceCrit);
          }
        }
        return b;
      }
      return null;
    },

    dropMine: function (dmg, radius, atX, atY, weaponKey, mirror, webId, webIndex) {
      for (var i = 0; i < this.mines.length; i++) {
        var m = this.mines[i];
        if (m.alive) continue;
        m.alive = true; m.weapon = weaponKey || ''; m.webId = webId || 0; m.webIndex = webIndex || 0;
        m.webTriggered = false; m.linkT = 0;
        m.x = atX == null ? this.p.x : atX; m.y = atY == null ? this.p.y : atY;
        m.fuse = webId ? 1.32 + (webIndex || 0) * 0.16 : (weaponKey === 'mine-layer' ? 1.15 : 1.4);
        m.dmg = dmg; m.radius = radius;
        m.forceCrit = !!(!mirror && this.run.overcharge > 0 && weaponKey);
        if (m.forceCrit) this.run.overcharge--;
        this.unpark(m.spr);
        m.spr.setPosition(m.x, m.y).setScale(0.45).setAlpha(0.9)
          .setTint(this.run.buffs.arsenal > 0 ? 0xffd67a :
            (weaponKey === 'minefield-web' ? 0xffc68a : (weaponKey === 'mine-layer' ? 0xffb45a : 0xff9a5a)));
        return m;
      }
      return null;
    },

    stepShots: function (dt) {
      for (var i = 0; i < this.shots.length; i++) {
        var s = this.shots[i];
        if (!s.alive) continue;
        s.life -= dt;
        s.age += dt;
        if (s.kind === 'lance-array' && s.targetRef && s.targetRef.alive && s.age < 0.72) {
          var tx0 = s.targetRef.x - s.x, ty0 = s.targetRef.y - s.y;
          var tl0 = Math.sqrt(tx0 * tx0 + ty0 * ty0) || 1, tf0 = Math.min(1, dt * 3.6);
          s.vx += (tx0 / tl0 * 620 * this.p.projectileSpeed - s.vx) * tf0;
          s.vy += (ty0 / tl0 * 620 * this.p.projectileSpeed - s.vy) * tf0;
        }
        if (s.kind === 'seeker' || s.kind === 'swarm-dart' || s.kind === 'drone' || s.kind === 'wisp') {
          s.targetRetargetT -= dt;
          if (!s.targetRef || !s.targetRef.alive || s.targetRetargetT <= 0) {
            s.targetRef = this.nearestEnemy(s.x, s.y, 520);
            s.targetRetargetT = 0.12; // ~8.3 Hz; homing does not query every step
          }
          var t = s.targetRef;
          if (t) {
            var dx = t.x - s.x, dy = t.y - s.y;
            var l = Math.sqrt(dx * dx + dy * dy) || 1;
            var f = Math.min(1, dt * 4.2);
            s.vx += (dx / l * 260 - s.vx) * f;
            s.vy += (dy / l * 260 - s.vy) * f;
          }
        }
        if (s.gravity) s.vy += s.gravity * dt;
        if (s.kind === 'cyclone-glaive') {
          s.orbitRadius += dt * 168;
          s.orbitAngle += s.orbitDir * dt * 5.4;
          s.x = s.ox + Math.cos(s.orbitAngle) * s.orbitRadius;
          s.y = s.oy + Math.sin(s.orbitAngle) * s.orbitRadius;
          s.vx = -Math.sin(s.orbitAngle) * s.orbitDir * 168;
          s.vy = Math.cos(s.orbitAngle) * s.orbitDir * 168;
        } else if (s.kind === 'glaive') {
          if (!s.returning && s.age > 0.46) s.returning = true;
          if (s.returning) {
            var gx = this.p.x - s.x, gy = this.p.y - s.y, gl = Math.sqrt(gx * gx + gy * gy) || 1;
            s.vx += (gx / gl * 560 - s.vx) * Math.min(1, dt * 8);
            s.vy += (gy / gl * 560 - s.vy) * Math.min(1, dt * 8);
            if (gl < this.p.r + s.r + 12) { this.killSprite(s); continue; }
          }
        }
        if (s.kind !== 'cyclone-glaive') {
          s.x += s.vx * dt;
          s.y += s.vy * dt;
        }

        if ((s.kind === 'ricochet' || s.kind === 'prism-ricochet') &&
            (s.x < -EDGE || s.x > EDGE || s.y < -EDGE || s.y > EDGE)) {
          if (s.x < -EDGE || s.x > EDGE) s.vx *= -1;
          if (s.y < -EDGE || s.y > EDGE) s.vy *= -1;
          s.x = clamp(s.x, -EDGE, EDGE); s.y = clamp(s.y, -EDGE, EDGE);
          s.bounces--;
          sfx('hit', { volume: 0.12, rate: 1.5 });
          if (s.kind === 'prism-ricochet') this.splitPrism(s);
          if (s.bounces < 0) { this.killSprite(s); continue; }
        }

        if ((s.kind === 'mortar' || s.kind === 'mortar-cascade') && s.life <= 0) {
          var mortarData = WEAPON_BY_KEY[s.weapon] || WEAPONS[0];
          this.firePulse(122 + this.p.ranks.lance * 8, s.dmg * 0.72, s.x, s.y,
            mortarData.impact || 0xff8f6b, s.kind === 'mortar-cascade' ? 'rolling' : 'normal');
          this.contactRing(s.x, s.y, 22, s.kind === 'mortar-cascade' ? 178 : 150, 0.28,
            mortarData.impact || 0xff8f6b, 0.8);
          this.fx.death.setParticleTint(mortarData.impact || 0xff8f6b);
          this.fx.death.emitParticleAt(s.x, s.y, s.kind === 'mortar-cascade' ? 12 : 7);
          this.killSprite(s);
          continue;
        }
        if (s.life <= 0 && s.rangeBurst) {
          this.burstShot(s);
          s.rangeBurst = false;
        }

        var hit = false;
        var near = this.query(s.x, s.y, s.r + 30);
        for (var n = 0; n < near.length; n++) {
          var e = near[n];
          if (!e.alive) continue;
          var ex = e.x - s.x, ey = e.y - s.y, rr = e.r + s.r;
          if (ex * ex + ey * ey < rr * rr &&
              !(s.lastHitId === e.id && this.run.time - s.lastHitT < 0.18)) {
            var shotCrit = s.forceCrit || (s.weapon && this.p.primaryCrit > 0 && Math.random() < this.p.primaryCrit);
            this.damage(e, s.dmg * (shotCrit ? 3 : 1), s.x, s.y, shotCrit);
            s.lastHitId = e.id; s.lastHitT = this.run.time;
            if (!e.alive && s.kind === 'rail-storm') this.forkRail(s, e);
            if (!e.alive && s.kind === 'swarm-dart') this.respawnSwarmDart(s, e);
            if (this.run.buffs.chain > 0 && s.kind !== 'wing') this.chainArc(e, s.dmg * 0.42);
            if (s.kind === 'coil') this.chainArc(e, s.dmg * 0.68);
            if (s.kind === 'mortar' || s.kind === 'mortar-cascade') {
              var hitMortarData = WEAPON_BY_KEY[s.weapon] || WEAPONS[0];
              this.firePulse(122 + this.p.ranks.lance * 8, s.dmg * 0.72, s.x, s.y,
                hitMortarData.impact || 0xff8f6b, s.kind === 'mortar-cascade' ? 'rolling' : 'normal');
              hit = true;
            }
            var shotData = s.weapon && WEAPON_BY_KEY[s.weapon] ? WEAPON_BY_KEY[s.weapon] : null;
            this.fx.impact.setParticleTint(shotData ? (shotData.impact || shotData.color) :
              (s.kind === 'seeker' || s.kind === 'swarm-dart' || s.kind === 'drone' || s.kind === 'wisp' ? 0xbd8dff :
                (s.kind === 'wing' ? 0x8effd8 : 0xe5fff7)));
            this.fx.impact.emitParticleAt(s.x, s.y, shotData && shotData.tier === 'upgraded' ? 6 : 3);
            if (s.pierce > 0) { s.pierce--; } else { hit = true; }
            break;
          }
        }
        if (!hit) {
          var nearBases = this.baseQuery(s.x, s.y, s.r + 90);
          for (var bn = 0; bn < nearBases.length; bn++) {
            var base = nearBases[bn];
            if (!base.alive) continue;
            var bx = base.x - s.x, by = base.y - s.y, brr = base.r * 0.72 + s.r;
            if (bx * bx + by * by < brr * brr) {
              var baseCrit = s.forceCrit || (s.weapon && this.p.primaryCrit > 0 && Math.random() < this.p.primaryCrit);
              this.damage(base, s.dmg * (baseCrit ? 3 : 1), s.x, s.y, baseCrit);
              if (!base.alive && s.kind === 'rail-storm') this.forkRail(s, base);
              var baseShotData = s.weapon && WEAPON_BY_KEY[s.weapon] ? WEAPON_BY_KEY[s.weapon] : null;
              this.fx.impact.setParticleTint(baseShotData ? (baseShotData.impact || baseShotData.color) : 0xffd67a);
              this.fx.impact.emitParticleAt(s.x, s.y, baseShotData && baseShotData.tier === 'upgraded' ? 7 : 4);
              if (s.pierce > 0) s.pierce--; else hit = true;
              break;
            }
          }
        }
        if (hit || s.life <= 0 ||
            ((s.kind !== 'ricochet' && s.kind !== 'prism-ricochet') && Math.abs(s.x - this.p.x) > 900) ||
            ((s.kind !== 'ricochet' && s.kind !== 'prism-ricochet') && Math.abs(s.y - this.p.y) > 900)) {
          this.killSprite(s);
        }
      }
    },

    stepEbolts: function (dt) {
      var p = this.p;
      for (var i = 0; i < this.ebolts.length; i++) {
        var s = this.ebolts[i];
        if (!s.alive) continue;
        s.life -= dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        if (this.interceptWingHit(s.x, s.y, 8)) {
          this.killSprite(s);
          continue;
        }
        var dx = s.x - p.x, dy = s.y - p.y, rr = p.r + 8;
        if (dx * dx + dy * dy < rr * rr) {
          this.hurt(s.dmg);
          this.killSprite(s);
          continue;
        }
        if (s.life <= 0) this.killSprite(s);
      }
    },

    stepMines: function (dt) {
      for (var i = 0; i < this.mines.length; i++) {
        var m = this.mines[i];
        if (!m.alive) continue;
        m.fuse -= dt;
        if (m.webId) {
          m.linkT -= dt;
          if (m.linkT <= 0) {
            for (var li = 0; li < this.mines.length; li++) {
              var link = this.mines[li];
              if (!link.alive || link.webId !== m.webId || link === m) continue;
              if (link.webIndex <= m.webIndex) continue;
              this.arcLine(m.x, m.y, link.x, link.y, 0xffd67a, 0.18);
              break;
            }
            m.linkT = 0.14;
          }
        }
        var near = this.query(m.x, m.y, 30);
        var touched = false;
        for (var n = 0; n < near.length; n++) {
          var e = near[n];
          if (!e.alive) continue;
          var dx = e.x - m.x, dy = e.y - m.y, rr = e.r + 14;
          if (dx * dx + dy * dy < rr * rr) { touched = true; break; }
        }
        if (touched || m.fuse <= 0) {
          if (m.webId && !m.webTriggered) {
            m.webTriggered = true;
            for (var wi = 0; wi < this.mines.length; wi++) {
              var webMine = this.mines[wi];
              if (!webMine.alive || webMine.webId !== m.webId || webMine === m) continue;
              webMine.fuse = Math.min(webMine.fuse, 0.14 + Math.abs(webMine.webIndex - m.webIndex) * 0.17);
              this.arcLine(m.x, m.y, webMine.x, webMine.y, 0xffe7a6, 0.30);
            }
          }
          var blast = this.query(m.x, m.y, m.radius + 30);
          for (var k = 0; k < blast.length; k++) {
            var b = blast[k];
            if (!b.alive) continue;
            var bx = b.x - m.x, by = b.y - m.y, br = m.radius + b.r;
            if (bx * bx + by * by < br * br) {
              this.damage(b, m.dmg * (m.forceCrit ? 3 : 1), b.x, b.y, m.forceCrit);
            }
          }
          var mineBases = this.baseQuery(m.x, m.y, m.radius + 100);
          for (var mb = 0; mb < mineBases.length; mb++) {
            var mineBase = mineBases[mb];
            if (!mineBase.alive) continue;
            var mdx = mineBase.x - m.x, mdy = mineBase.y - m.y;
            var mrr = m.radius + mineBase.r;
            if (mdx * mdx + mdy * mdy < mrr * mrr) {
              this.damage(mineBase, m.dmg * (m.forceCrit ? 3 : 1), mineBase.x, mineBase.y, m.forceCrit);
            }
          }
          var mineData = m.weapon && WEAPON_BY_KEY[m.weapon] ? WEAPON_BY_KEY[m.weapon] : null;
          var mineColor = mineData ? (mineData.impact || mineData.color) : 0xff9a5a;
          this.fx.death.setParticleTint(mineColor);
          this.fx.death.emitParticleAt(m.x, m.y, m.webId ? 20 : 14);
          this.fx.smoke.emitParticleAt(m.x, m.y, 4);
          this.contactRing(m.x, m.y, 18, m.webId ? m.radius * 1.22 : m.radius, 0.28, mineColor, 0.82);
          kit.juice.shake(5, 150);
          this.killSprite(m);
        }
      }
    },

    stepPulses: function (dt) {
      for (var i = 0; i < this.pulses.length; i++) {
        var q = this.pulses[i];
        if (!q.alive) continue;
        q.r += (q.max / 0.42) * dt;
        var list = this.query(q.x, q.y, q.r + 40);
        for (var n = 0; n < list.length; n++) {
          var e = list[n];
          if (!e.alive) continue;
          var dx = e.x - q.x, dy = e.y - q.y;
          var d = Math.sqrt(dx * dx + dy * dy);
          if (d < q.r + e.r && d > q.r - 34 - e.r && e.hitAt < q.stamp) {
            e.hitAt = q.stamp;
            this.damage(e, q.dmg, e.x, e.y);
          }
        }
        var pulseBases = this.baseQuery(q.x, q.y, q.r + 100);
        for (var pb = 0; pb < pulseBases.length; pb++) {
          var pulseBase = pulseBases[pb];
          if (!pulseBase.alive) continue;
          var pdx = pulseBase.x - q.x, pdy = pulseBase.y - q.y;
          var pd = Math.sqrt(pdx * pdx + pdy * pdy);
          if (pd < q.r + pulseBase.r && pd > q.r - 34 - pulseBase.r && pulseBase.hitAt !== q.stamp) {
            pulseBase.hitAt = q.stamp;
            this.damage(pulseBase, q.dmg, pulseBase.x, pulseBase.y);
          }
        }
        if (q.r >= q.max) this.killSprite(q);
      }
    },

    stepBeams: function (dt) {
      for (var i = 0; i < this.beams.length; i++) {
        var b = this.beams[i];
        if (!b.alive) continue;
        b.life -= dt;
        if (b.life <= 0) this.killSprite(b);
      }
    },

    stepEnemies: function (dt) {
      var p = this.p, run = this.run;
      this.stepHatchQueue();
      for (var i = 0; i < this.enemies.length; i++) {
        var e = this.enemies[i];
        if (!e.alive) continue;
        if (e.flash > 0) e.flash -= dt;
        var enemyClock = run.buffs.freeze > 0 ? 0.20 : (run.buffs.dilation > 0 ? 0.56 : 1);
        if (e.egg) {
          e.hatchT -= dt * enemyClock;
          if (e.hatchT <= 0) {
            var hatchCount = e.regionKey === 'aurelion-graveyard' ? 3 : 2;
            var freeHatchSlots = Math.max(0, MAX_ENEMIES - this.enemyCount + 1);
            var immediateHatches = Math.min(hatchCount, freeHatchSlots);
            var eggX = e.x, eggY = e.y, eggPhase = e.phase, eggRegion = e.regionKey;
            // Release the egg slot before admitting children. Children never
            // force-evict an existing enemy; overflow waits in the fixed queue.
            this.retire(e);
            for (var hi0 = 0; hi0 < hatchCount; hi0++) {
              var ha0 = hi0 * TAU / hatchCount + eggPhase;
              var hatchFam = this.pickRegionEnemy('salvage-swarm', eggRegion);
              var hx0 = eggX + Math.cos(ha0) * 42, hy0 = eggY + Math.sin(ha0) * 42;
              if (hi0 < immediateHatches && this.spawn(hatchFam, false, hx0, hy0, false)) continue;
              this.queueHatchling(hatchFam, hx0, hy0);
            }
            this.contactRing(eggX, eggY, 24, 150, 0.28, 0xffb47e, 0.82);
            this.fx.smoke.emitParticleAt(eggX, eggY, kit.juice.enabled ? 7 : 2);
          }
          continue;
        }
        var relay = run.relayBoost > 0 ? this.relayAt(e.x, e.y) : null;
        var relayFactor = relay ? 1.18 : 1;
        e.speed = e.baseSpeed * relayFactor;
        e.dmg = e.baseDmg * relayFactor;
        e.cd -= dt * enemyClock;

        var phaseHidden = run.buffs.cloak > 0;
        var targetX = phaseHidden ? e.x : (run.buffs.decoy > 0 ? this.decoyX : p.x);
        var targetY = phaseHidden ? e.y : (run.buffs.decoy > 0 ? this.decoyY : p.y);
        var dx = targetX - e.x, dy = targetY - e.y;
        var dist = Math.sqrt(dx * dx + dy * dy) || 1;
        var sp = e.speed * enemyClock;

        if (e.regionBoss) {
          this.watchdogPhase = e.behavior === 'latch' && e.latchT > 0 ? 'latch' : 'boss-approach';
          this.stepRegionBoss(e, dt, enemyClock, phaseHidden, targetX, targetY, dx, dy, dist);
          continue;
        }

        if (e.behavior === 'blink') {
          if (e.cd <= 0 && !phaseHidden) {
            e.cd = 2.8;
            var blinkA = Math.atan2(targetY - e.y, targetX - e.x) + Math.PI + (srand() - 0.5) * 0.7;
            e.x = clamp(p.x + Math.cos(blinkA) * (250 + srand() * 110), -EDGE + 50, EDGE - 50);
            e.y = clamp(p.y + Math.sin(blinkA) * (250 + srand() * 110), -EDGE + 50, EDGE - 50);
            this.contactRing(e.x, e.y, 12, 72, 0.18, e.tint, 0.58);
          }
          sp *= 0.62;
        } else if (e.behavior === 'kamikaze') {
          sp *= 1.32 + Math.sin(run.time * 7 + e.phase) * 0.12;
        } else if (e.behavior === 'gravity-mite') {
          if (dist < 250) { p.vx *= Math.max(0, 1 - dt * 1.7); p.vy *= Math.max(0, 1 - dt * 1.7); }
          sp *= 0.82;
        } else if (e.behavior === 'refract-drone') {
          var refractWant = 285;
          if (dist > refractWant + 35) { e.x += dx / dist * sp * dt; e.y += dy / dist * sp * dt; }
          else if (dist < refractWant - 70) { e.x -= dx / dist * sp * dt; e.y -= dy / dist * sp * dt; }
          if (e.cd <= 0 && !phaseHidden) {
            e.cd = 2.8;
            this.fireEbolt(e, dx / dist, dy / dist, e.dmg * 0.62);
          }
          this.clampEnemy(e);
          continue;
        }

        if (e.behavior === 'wraith' || e.behavior === 'glasswing' || e.behavior === 'salvage' || e.behavior === 'null-leech') {
          var variantTang = Math.atan2(dy, dx) + (dist > 180 ? 0.35 : 1.18);
          e.x += Math.cos(variantTang) * sp * dt;
          e.y += Math.sin(variantTang) * sp * dt;
          this.clampEnemy(e);
          this.enemyContact(e, dt);
          continue;
        } else if (e.fam === 'sprinter') {
          sp *= 1 + Math.sin(run.time * 4.4 + e.phase) * 0.2;   // lunging gait
        } else if (e.fam === 'weaver') {
          var tang = Math.atan2(dy, dx) + (dist > 190 ? 0 : 1.25);
          e.x += Math.cos(tang) * sp * dt;
          e.y += Math.sin(tang) * sp * dt;
          this.clampEnemy(e);
          this.enemyContact(e, dt);
          continue;
        } else if (e.fam === 'lancer') {
          var want = 250;
          if (dist > want + 30) { e.x += dx / dist * sp * dt; e.y += dy / dist * sp * dt; }
          else if (dist < want - 60) { e.x -= dx / dist * sp * dt; e.y -= dy / dist * sp * dt; }
          if (e.cd <= 0 && !phaseHidden) {
            e.cd = 2.1;
            this.fireEbolt(e, dx / dist, dy / dist, e.dmg * 0.7);
          }
          this.clampEnemy(e);
          continue;
        } else if (e.boss) {
          sp *= 1 + Math.sin(run.time * 0.9) * 0.14;
          if (e.cd <= 0) {
            e.cd = 4.2;
            this.bossTelegraph(e);
          }
        }

        if (dist > p.r + e.r * 0.7) {
          e.x += dx / dist * sp * dt;
          e.y += dy / dist * sp * dt;
        }
        if (run.buffs.gravity > 0 && !phaseHidden && dist < 520 && dist > p.r + e.r) {
          e.x += (p.x - e.x) / dist * 92 * dt;
          e.y += (p.y - e.y) / dist * 92 * dt;
        }
        this.clampEnemy(e);
        this.enemyContact(e, dt);
      }
    },

    stepRegionBoss: function (e, dt, enemyClock, phaseHidden, targetX, targetY, dx, dy, dist) {
      var p = this.p, run = this.run;
      if (e.refractT > 0) e.refractT -= dt;
      var sp = e.speed * enemyClock * (1 + (e.phaseStage || 0) * 0.10);
      if (e.behavior === 'blink-mark' && run.drainMark > 0) {
        run.drainMark -= dt;
        var mdx = p.x - run.drainMarkX, mdy = p.y - run.drainMarkY;
        if (mdx * mdx + mdy * mdy > 260 * 260) run.drainMark = 0;
        else this.hurt(4.8 * dt, e);
      }
      if (e.behavior === 'latch' && e.latchT > 0) {
        e.latchT -= dt;
        if (Math.abs(p.vx) + Math.abs(p.vy) > 135) {
          e.latchT = 0;
          this.showBanner('LATCH BROKEN', 'KEEP MOVING TO SHAKE PROBOSCIS PRIME');
          this.contactRing(p.x, p.y, 24, 130, 0.22, 0x8effd8, 0.8);
        } else {
          e.x = p.x - dx * 0.06; e.y = p.y - dy * 0.06;
          this.hurt(7.2 * dt, e);
        }
      } else if (dist > p.r + e.r * 0.65) {
        e.x += dx / dist * sp * dt;
        e.y += dy / dist * sp * dt;
      }
      if (e.behavior === 'dive' && e.phaseStage > 0) {
        e.x += dx / dist * 38 * dt;
        e.y += dy / dist * 38 * dt;
      }
      if (run.buffs.gravity > 0 && !phaseHidden && dist < 520 && dist > p.r + e.r) {
        e.x += (p.x - e.x) / dist * 72 * dt;
        e.y += (p.y - e.y) / dist * 72 * dt;
      }
      if (e.cd <= 0 && !phaseHidden) {
        e.cd = e.phaseStage > 0 ? 2.35 : 3.15;
        this.regionBossTelegraph(e);
      }
      this.clampEnemy(e);
      this.enemyContact(e, dt);
    },

    regionBossTelegraph: function (e) {
      var scene = this, token = this.runToken, p = this.p, def = REGION_BOSS_BY_BOSS_KEY[e.bossKey];
      if (!def) return;
      e.wind = kit.juice.enabled ? 0.72 : 0.36;
      // These are event cues, never render-loop audio. BootScene has already
      // decoded both buffers before play, so iOS Safari does not fetch or
      // build a cue graph while the boss is closing on the player.
      sfx('telegraph', { volume: 0.56, rate: 0.48 + (e.phaseStage || 0) * 0.08 });
      sfx('enemyShoot', { volume: 0.28, rate: 0.38 + (e.phaseStage || 0) * 0.06 });
      if (def.behavior === 'latch') {
        this.after(0.48, function () {
          if (scene.runToken !== token || !e.alive || scene.state !== 'playing') return;
          var dx = scene.p.x - e.x, dy = scene.p.y - e.y;
          if (dx * dx + dy * dy < 360 * 360) {
            e.latchT = 2.6;
            scene.showBanner('PROBOSCIS LATCH', 'MOVE TO SHAKE FREE // HULL DRAIN ACTIVE');
            scene.contactRing(scene.p.x, scene.p.y, 24, 128, 0.24, 0xffd67a, 0.84);
          }
        }, 'latch');
      } else if (def.behavior === 'dive') {
        this.contactRing(p.x, p.y, 34, 190, 0.48, 0xff756a, 0.72);
        this.after(0.52, function () {
          if (scene.runToken !== token || !e.alive || scene.state !== 'playing') return;
          scene.spawnAirBomb(scene.p.x, scene.p.y, 72 * scene.p.damage, 178, 0.12);
          scene.showBanner('CINDER DIVE', 'EMBER STRIPS IGNITING');
        }, 'boss-approach');
      } else if (def.behavior === 'refract') {
        e.refractT = 2.7;
        for (var i = 0; i < 4; i++) {
          var a = i * TAU / 4 + e.phase;
          this.fireEbolt(e, Math.cos(a), Math.sin(a), e.dmg * 0.34);
        }
        for (var j = 0; j < (e.phaseStage > 0 ? 3 : 2); j++) {
          var sa = j * TAU / Math.max(1, e.phaseStage > 0 ? 3 : 2) + e.phase * 0.4;
          this.spawn('shard-larva', false, e.x + Math.cos(sa) * 78, e.y + Math.sin(sa) * 78, true);
        }
        this.showBanner('GLASSWING REFRACTION', 'SHOT SPLIT // LARVAE SWARMING');
      } else if (def.behavior === 'blink-mark') {
        this.after(0.34, function () {
          if (scene.runToken !== token || !e.alive || scene.state !== 'playing') return;
          scene.run.drainMark = 4.8;
          scene.run.drainMarkX = scene.p.x;
          scene.run.drainMarkY = scene.p.y;
          var a = Math.atan2(scene.p.y - e.y, scene.p.x - e.x) + Math.PI;
          e.x = clamp(scene.p.x + Math.cos(a) * 300, -EDGE + 80, EDGE - 80);
          e.y = clamp(scene.p.y + Math.sin(a) * 300, -EDGE + 80, EDGE - 80);
          scene.showBanner('NULL MARK', 'OUTRUN THE DRAIN VECTOR');
          scene.contactRing(e.x, e.y, 30, 180, 0.3, 0xc480ff, 0.86);
        }, 'boss-approach');
      } else if (def.behavior === 'hatchery') {
        var eggs = e.phaseStage > 0 ? 4 : 3;
        var eggSlots = Math.max(0, MAX_ENEMIES - this.enemyCount);
        var eggsToSpawn = Math.min(eggs, eggSlots);
        for (var k = 0; k < eggsToSpawn; k++) {
          var ea = k * TAU / eggs + e.phase;
          this.spawn('grave-egg', false, e.x + Math.cos(ea) * 142, e.y + Math.sin(ea) * 142, false);
        }
        this.showBanner('CARRION HATCHERIES', 'EGG CLUSTERS LIVE ON THE WRECKS');
      }
      if (kit.juice.enabled) kit.juice.shake(6, 190);
    },

    clampEnemy: function (e) {
      e.x = clamp(e.x, -EDGE - 60, EDGE + 60);
      e.y = clamp(e.y, -EDGE - 60, EDGE + 60);
    },

    enemyContact: function (e, dt) {
      var p = this.p;
      var dx = p.x - e.x, dy = p.y - e.y;
      var wing = this.wingAt(e.x, e.y, e.r * 0.72);
      if (wing) {
        if (this.run.buffs.aegis > 0) {
          if (e.boss) {
            if (e.cd <= 0) {
              e.cd = 0.5;
              this.damage(e, e.maxHp * 0.06, wing.x, wing.y, true);
            }
          } else this.defeat(e, wing.x, wing.y);
        } else {
          this.loseWing(wing);
          e.cd = Math.max(e.cd, 0.65);
        }
        return;
      }
      var rr = p.r + e.r * 0.72;
      if (dx * dx + dy * dy > rr * rr) return;
      if (this.run.buffs.aegis > 0) {
        if (e.boss) {
          if (e.cd <= 0) {
            e.cd = 0.5;
            this.damage(e, e.maxHp * 0.06, p.x, p.y, true);
          }
        } else this.defeat(e, p.x, p.y);
        return;
      }
      if (e.fam === 'sapper' || e.behavior === 'kamikaze') {
        this.explodeSapper(e);
        return;
      }
      if (e.cd > 0) return;
      e.cd = e.boss ? 0.5 : 0.7;
      this.hurt(e.dmg, e);
    },

    fireEbolt: function (e, nx, ny, dmg) {
      var s = null;
      for (var i = 0; i < this.ebolts.length; i++) {
        if (!this.ebolts[i].alive) { s = this.ebolts[i]; break; }
      }
      if (!s) {
        for (var k = 0; k < this.ebolts.length; k++) {
          var b = this.ebolts[k];
          if (b.alive && (!s || b.life < s.life)) s = b;
        }
        if (!s) return;
      }
      s.alive = true; s.x = e.x + nx * 20; s.y = e.y + ny * 20;
      s.vx = nx * 230; s.vy = ny * 230; s.life = 3.4; s.dmg = dmg;
      this.unpark(s.spr);
      s.spr.setPosition(s.x, s.y).setAlpha(1).setScale(1)
        .setRotation(Math.atan2(ny, nx));
      sfx('enemyShoot', { volume: 0.18 });
    },

    bossTelegraph: function (e) {
      var scene = this;
      var token = this.runToken;
      sfx('telegraph', { volume: 0.5 });
      e.wind = 0.86;                       // beat 1: the Core swells (render)
      var base = e.phase;
      for (var i = 0; i < 14; i++) {
        var a = i * TAU / 14 + base;
        var sp = this.bossSpokes[i];
        this.unpark(sp);
        sp.setPosition(e.x + Math.cos(a) * 150, e.y + Math.sin(a) * 150)
          .setAlpha(0.0).setDisplaySize(300, 5).setRotation(a);
      }
      this.bossSpokeCount = 14;
      this.after(0.86, function () {
        for (var s = 0; s < scene.bossSpokeCount; s++) scene.park(scene.bossSpokes[s]);
        scene.bossSpokeCount = 0;
        if (token !== scene.runToken || !e.alive) return;
        scene.contactRing(e.x, e.y, 70, 340, 0.34, 0xff7ac0, 0.9);
        for (var i2 = 0; i2 < 14; i2++) {
          var a2 = i2 * TAU / 14 + base;
          scene.fireEbolt(e, Math.cos(a2), Math.sin(a2), e.dmg * 0.45);
        }
        kit.juice.shake(9, 260);
      }, 'boss-approach');
    },

    explodeSapper: function (e) {
      var p = this.p;
      var radius = e.r * 3.1;
      var dx = p.x - e.x, dy = p.y - e.y, rr = radius + p.r;
      if (dx * dx + dy * dy < rr * rr) this.hurt(e.dmg * 0.85);
      var near = this.query(e.x, e.y, radius + 30);
      for (var i = 0; i < near.length; i++) {
        var o = near[i];
        if (!o.alive || o === e) continue;
        var ox = o.x - e.x, oy = o.y - e.y, orr = radius + o.r;
        if (ox * ox + oy * oy < orr * orr) this.damage(o, e.dmg * 0.6, o.x, o.y);
      }
      this.fx.death.setParticleTint(0xff735f);
      this.fx.death.emitParticleAt(e.x, e.y, 18);
      this.fx.smoke.emitParticleAt(e.x, e.y, 4);
      kit.juice.shake(7, 180);
      sfx('eliteDeath', { volume: 0.35, rate: 1.15 });
      this.dropGem(e);
      this.run.kills++;
      this.tryDropBonus(e);
      this.retire(e);
    },

    bossPhaseChange: function (e, phase) {
      var quiet = !kit.juice.enabled;
      e.phaseStage = phase;
      this.run.bossPhase = phase;
      e.phaseBeat = quiet ? 0.38 : 1.05;
      e.wind = quiet ? 0.42 : 0.86;
      this.bossPhaseFx.active = !quiet;
      this.bossPhaseFx.t = 0;
      this.bossPhaseFx.dur = quiet ? 0.38 : 1.15;
      this.bossPhaseFx.phase = phase;
      this.punchZoom(0.03, 1.28);
      var color = phase === 1 ? 0xffd67a : 0xd6a4ff;
      this.contactRing(e.x, e.y, quiet ? 66 : 86, quiet ? 360 : (phase === 1 ? 520 : 680),
        quiet ? 0.32 : 0.58, color, quiet ? 0.65 : 0.95);
      this.contactRing(e.x, e.y, quiet ? 38 : 46, quiet ? 210 : (phase === 1 ? 280 : 380),
        quiet ? 0.22 : 0.34, 0xffffff, quiet ? 0.6 : 0.86);
      this.fx.level.setParticleTint(color);
      this.fx.level.emitParticleAt(e.x, e.y, quiet ? 8 : (phase === 1 ? 30 : 42));
      this.fx.smoke.emitParticleAt(e.x, e.y, quiet ? 2 : (phase === 1 ? 8 : 12));
      this.triggerBuffGlow(color);
      var bossLabel = e.regionBoss && REGION_BOSS_BY_BOSS_KEY[e.bossKey] ? REGION_BOSS_BY_BOSS_KEY[e.bossKey].name : 'CORE';
      var phaseSub = e.regionBoss ? (phase === 1 ? 'APEX HUNTER // SECOND PATTERN' : 'APEX HUNTER // DEATH PATTERN') :
        (phase === 1 ? 'OUTER SHELL FRACTURED' : 'MERIDIAN HEART EXPOSED');
      this.showBanner(bossLabel + ' PHASE ' + (phase + 1), phaseSub, false, true);
      if (this.bossBarTitle) this.bossBarTitle.setText(bossLabel);
      sfx('telegraph', { volume: 0.72, rate: phase === 1 ? 0.82 : 0.66 });
      kit.juice.shake(12 + phase * 3, 360);
    },

    damage: function (e, amount, hx, hy, noCrit) {
      if (!e.alive || this.state !== 'playing') return;
      if (e.type && BASE_TYPES[e.type] && e.maxHp != null) {
        this.damageBase(e, amount, hx, hy, noCrit);
        return;
      }
      var amt = amount * this.tideDamageMultiplier();
      var crit = !noCrit && this.p.crit > 0 && Math.random() < this.p.crit;
      if (crit) amt *= 3;
      e.hp -= amt;
      e.flash = 0.12;
      e.squash = crit ? 0.42 : 0.27;
      e.squashA = Math.atan2(e.y - hy, e.x - hx);
      if (e.regionBoss && e.behavior === 'refract' && e.refractT > 0 && !noCrit &&
          this.run.time - (e.hitAt || -99) > 0.24) {
        e.hitAt = this.run.time;
        var splitAngle = Math.atan2(hy - e.y, hx - e.x);
        this.fireEbolt(e, Math.cos(splitAngle + 0.42), Math.sin(splitAngle + 0.42), e.dmg * 0.22);
        this.fireEbolt(e, Math.cos(splitAngle - 0.42), Math.sin(splitAngle - 0.42), e.dmg * 0.22);
        this.contactRing(e.x, e.y, 24, 90, 0.2, 0xc9ffff, 0.62);
      }
      this.fx.impact.setParticleTint(e.boss ? 0xe6bbff : (e.elite ? 0xffd67a : 0xe5fff7));
      this.fx.impact.emitParticleAt(hx, hy, e.boss ? 7 : (e.elite ? 5 : 2));
      if (e.boss && e.hp > 0) {
        var nextPhase = e.regionBoss ? (e.hp <= e.maxHp * 0.5 ? 1 : 0) :
          (e.hp <= e.maxHp * 0.34 ? 2 : (e.hp <= e.maxHp * 0.67 ? 1 : 0));
        if (nextPhase > (e.phaseStage || 0)) this.bossPhaseChange(e, nextPhase);
      }
      if (crit) this.floatText(hx, hy, Math.round(amt), '#fff36a', TYPE.sub);
      if (e.hp <= 0) this.defeat(e, hx, hy);
      else if (!e.boss) sfx('hit', { volume: 0.11, rate: 0.9 + Math.random() * 0.25 });
    },

    defeat: function (e, hx, hy) {
      var run = this.run;
      var px = hx == null ? e.x : hx, py = hy == null ? e.y : hy;
      if (e.egg) {
        this.dropGem({ x: e.x, y: e.y, elite: false, xp: e.xp || 3 });
        this.contactRing(e.x, e.y, 18, 112, 0.24, e.tint, 0.72);
        this.fx.death.setParticleTint(e.tint);
        this.fx.death.emitParticleAt(e.x, e.y, kit.juice.enabled ? 10 : 3);
        this.retire(e);
        return;
      }
      if (e.regionBoss) {
        var regionDef = REGION_BOSS_BY_BOSS_KEY[e.bossKey];
        this.contactRing(e.x, e.y, 118, 840, 0.86, regionDef ? regionDef.tint : e.tint, 1);
        this.contactRing(e.x, e.y, 58, 480, 0.48, 0xffffff, 0.88);
        this.fx.death.setParticleTint(regionDef ? regionDef.tint : e.tint);
        this.fx.death.emitParticleAt(e.x, e.y, kit.juice.enabled ? 52 : 12);
        this.fx.smoke.emitParticleAt(e.x, e.y, kit.juice.enabled ? 18 : 4);
        this.fx.level.emitParticleAt(e.x, e.y, kit.juice.enabled ? 32 : 8);
        this.spawnHusk(e);
        this.floatText(e.x, e.y - 48, 'SWARM LORD DOWN', '#ffd67a', TYPE.head);
        run.kills++;
        run.regionBossKills++;
        run.regionBossActive = '';
        run.regionBossDefeated[e.regionKey] = true;
        run.regionWeaponRewarded[e.regionKey] = 0;
        run.bonus = (run.bonus || 0) + 900;
        this.dropGem({ x: e.x, y: e.y, elite: true, xp: 6 });
        this.spawnBonus('strike-wing', e.x, e.y);
        this.grantRegionWeapons(e.regionKey, 2, e.x, e.y);
        this.updateSlotUnlocks(true);
        this.showBanner('REWARD CACHE UNSEALED', 'FOUND IN THE ' + (REGIONS[regionIndexAtX(e.x)].name || e.regionKey), false, true);
        kit.juice.shake(20, 600);
        kit.juice.hitStop(100);
        sfx('bossDeath', { volume: 0.8, rate: 0.72 });
        this.retire(e);
        if (!run.bossUp) this.bossBar.setVisible(false);
        if (this.bossBarTitle && !run.bossUp) this.bossBarTitle.setText('MERIDIAN CORE');
        if (this.level) this.checkCampaignWin();
        return;
      }
      if (e.boss) {
        this.contactRing(e.x, e.y, 100, 900, 0.9, 0xe6bbff, 1);
        this.contactRing(e.x, e.y, 60, 520, 0.55, 0xffffff, 0.9);
        this.fx.death.setParticleTint(0xe6bbff);
        this.fx.death.emitParticleAt(e.x, e.y, 60);
        this.fx.smoke.emitParticleAt(e.x, e.y, 16);
        this.fx.level.emitParticleAt(e.x, e.y, 40);
        this.spawnHusk(e);
        this.floatText(e.x, e.y - 40, '+2000', '#efcfff', TYPE.head);
        kit.juice.shake(24, 700);
        kit.juice.hitStop(120);
        sfx('bossDeath');
        run.bossDown = true;
        run.kills++;
        run.bonus = (run.bonus || 0) + 2000;   // clearing the Core is the payoff
        this.retire(e);
        if (this.level) {
          run.bossUp = false;      // later scheduled lords and waves may resume
          this.checkCampaignWin();
        } else this.endRun(true);
        return;
      }
      run.kills++;
      run.combo++;
      run.comboT = 2.6;
      if (run.combo === 10 || run.combo === 25 || run.combo === 50) this.comboMilestone(run.combo);
      if (run.buffs.vampire > 0) this.p.hp = Math.min(this.p.maxHp, this.p.hp + (e.elite ? 4 : 1.6));
      if (run.buffs.flare > 0) run.scoreFlareBank += 3 * 0.65;
      this.dropGem(e);
      if (run.tides['bounty-frenzy'] > 0 && !run.tideBursting && !run.tideEffectBusy) this.bountyBurst(e.x, e.y, e);
      this.tryDropTide(e);
      this.tryDropBonus(e);

      this.fx.death.setParticleTint(e.tint);
      this.fx.death.emitParticleAt(e.x, e.y, e.elite ? 22 : 7);
      this.spawnHusk(e);
      if (e.elite) {
        this.spawnEliteBurst(e);
        this.contactRing(e.x, e.y, 40, 250, 0.42, 0xffd67a, 0.95);
        this.fx.smoke.emitParticleAt(e.x, e.y, 5);
        kit.juice.shake(8, 220);
        kit.juice.hitStop(70);
        sfx('eliteDeath', { volume: 0.5 });
        this.floatText(e.x, e.y - 18, 'ELITE DOWN', '#ffd67a', TYPE.body);
      } else {
        this.contactRing(px, py, 18, 96, 0.24, e.tint, 0.7);
        kit.juice.shake(1.4, 70);
        sfx('death', { volume: 0.16, rate: 0.92 + Math.random() * 0.2 });
        var nowT = run.time;
        if (nowT - (this.popT || -9) > 0.14) {
          this.popT = nowT;
          if (run.combo > 2) this.floatText(e.x, e.y - 14, '+3 x' + run.combo, '#ffb45a', TYPE.micro);
          else this.floatText(e.x, e.y - 14, '+3', '#cfe6f0', TYPE.micro);
        }
      }
      this.retire(e);
    },

    retire: function (e) {
      if (!e.alive) return;
      this.killSprite(e);
      this.enemyCount--;
      if (e === this.bossRef) this.bossRef = null;
    },

    hurt: function (amount, source) {
      var p = this.p;
      if (this.state !== 'playing' || p.iframes > 0 || this.run.buffs.aegis > 0) return;
      if (this.run.buffs.reflector > 0) {
        p.iframes = 0.32;
        var reflected = source && source.alive ? source : this.nearestEnemy(p.x, p.y, 260);
        if (reflected) this.damage(reflected, amount * 0.82, p.x, p.y, true);
        this.contactRing(p.x, p.y, 34, 150, 0.24, 0xffc4ff, 0.82);
        sfx('hit', { volume: 0.22, rate: 1.34 });
        return;
      }
      var resist = this.run.tides['last-stand'] > 0 ? Math.min(0.70, this.run.lastStandResist || 0) : 0;
      var amt = amount * (1 - p.armor) * (1 - resist);
      p.hp -= amt;
      p.iframes = 0.45;
      p.hurtT = 0.35;
      kit.juice.shake(9, 240);
      sfx('hurt', { volume: 0.5 });
      this.fx.death.setParticleTint(0xff746a);
      this.fx.death.emitParticleAt(p.x, p.y, 10);
      this.contactRing(p.x, p.y, 30, 150, 0.28, 0xff5a6a, 0.8);
      if (kit.juice.enabled) {
        this.tweens.add({ targets: this.vignette, alpha: 0.30, duration: 70, yoyo: true, ease: 'Quad.easeOut' });
      }
      if (p.hp <= 0) {
        if (p.failsafe) {
          p.failsafe = false;
          p.hp = p.maxHp * 0.35;
          p.iframes = 2.0;
          this.firePulse(260, 60 * p.damage);
          this.showBanner('FAILSAFE', 'SYSTEMS REBOOTED');
          sfx('unlock');
          kit.juice.shake(18, 500);
          return;
        }
        p.hp = 0;
        this.endRun(false);
      }
    },

    dropGem: function (e) {
      var count = e.elite ? 3 : 1;
      var tier = e.elite ? 2 : (e.xp >= 3 ? 1 : 0);
      for (var c = 0; c < count; c++) {
        var g = null;
        for (var i = 0; i < this.gems.length; i++) {
          if (!this.gems[i].alive) { g = this.gems[i]; break; }
        }
        if (!g) {
          for (var j = 0; j < this.gems.length; j++) {
            var cand = this.gems[j];
            if (!cand.alive) continue;
            if (!g || cand.born < g.born) g = cand;
          }
          if (!g) g = this.gems[0];
        }
        g.alive = true;
        g.x = e.x + (srand() - 0.5) * 18;
        g.y = e.y + (srand() - 0.5) * 18;
        g.vx = (srand() - 0.5) * 70;
        g.vy = (srand() - 0.5) * 70;
        g.value = (e.elite ? 5 : e.xp) * this.p.gemBonus * (1 + (this.p.ranks.gemValue || 0) * 0.10)
          * (this.run.buffs.doubler > 0 ? 2 : 1);
        g.tier = tier;
        g.born = this.run.time;
        this.unpark(g.spr);
        g.spr.setTexture('atlas', 'gem' + tier)
          .setPosition(g.x, g.y).setAlpha(1).setScale(1);
      }
    },

    stepGems: function (dt) {
      var p = this.p;
      var magnet = p.magnet * (this.run.buffs.magnet > 0 ? 2.35 : 1);
      var mag2 = magnet * magnet;
      for (var i = 0; i < this.gems.length; i++) {
        var g = this.gems[i];
        if (!g.alive) continue;
        var dx = p.x - g.x, dy = p.y - g.y;
        var d2 = dx * dx + dy * dy;
        if (d2 < mag2) {
          var d = Math.sqrt(d2) || 1;
          var pull = clamp(1 - d / magnet, 0.15, 1);
          g.vx += dx / d * (460 + pull * 380) * dt;
          g.vy += dy / d * (460 + pull * 380) * dt;
        }
        var damp = Math.pow(0.04, dt);
        g.vx *= damp; g.vy *= damp;
        g.x += g.vx * dt;
        g.y += g.vy * dt;
        if (d2 < (p.r + 14) * (p.r + 14)) {
          this.run.xp += g.value;
          this.run.gems += g.value;
          if (this.run.buffs.flare > 0) this.run.scoreFlareBank += g.value * 0.65;
          this.fx.gem.setParticleTint([0x8fe7ff, 0xa7ffe0, 0xffd07a][g.tier]);
          this.fx.gem.emitParticleAt(g.x, g.y, 3);
          sfx('gem', { volume: 0.10, rate: 1.0 + Math.min(0.5, this.run.combo * 0.02) });
          this.killSprite(g);
          this.checkLevel();
          if (this.state !== 'playing') return;
        }
      }
    },

    checkLevel: function () {
      var run = this.run;
      if (run.xp < run.xpNext || this.state !== 'playing') return;
      run.xp -= run.xpNext;
      run.level++;
      run.xpNext = Math.floor(13 + run.level * 7 + run.level * run.level * 0.9);
      if (this.availableUpgrades().length === 0) {
        this.p.hp = this.p.maxHp;
        run.bonus = (run.bonus || 0) + 250;
        this.rescore();
        sfx('levelup');
        this.fx.level.emitParticleAt(this.p.x, this.p.y, 24);
        this.contactRing(this.p.x, this.p.y, 30, 260, 0.45, 0x8effd8, 0.9);
        this.floatText(this.p.x, this.p.y - 30, 'MASTERED  +250', '#a7ffe0', TYPE.body);
        this.showBanner('LEVEL ' + run.level, 'ALL SYSTEMS MASTERED. INTEGRITY RESTORED.');
        return;
      }
      this.openDraft();
    },

    availableUpgrades: function () {
      var out = [];
      for (var i = 0; i < UPGRADES.length; i++) {
        var u = UPGRADES[i];
        if (u.upgraded && (!this.run || this.run.wave < 4)) continue;
        if ((this.p.ranks[u.key] || 0) < u.max) out.push(u);
      }
      return out;
    },

    buildDraftUI: function () {
      if (this.draftUI) return this.draftUI;
      var scene = this;
      var w = this.scale.width, h = this.scale.height;
      var TXT = FONT_BODY;
      var ov = this.add.container(0, 0).setScrollFactor(0).setDepth(400).setVisible(false);
      ov.add(this.add.rectangle(w / 2, h / 2, w, h, 0x03080e, 0.88).setInteractive());
      ov.add(this.add.image(w / 2, h * 0.17, 'disc').setDisplaySize(w * 1.5, h * 0.45)
        .setTint(0x2ad0a8).setAlpha(0.16).setBlendMode(Phaser.BlendModes.ADD));

      var title = neonText(this, w / 2, h * 0.17, '', TYPE.title, '#8effd8');
      var sub = neonText(this, w / 2, h * 0.17 + 30, 'CHOOSE ONE UPGRADE', TYPE.label, '#8fb3c4');
      var trule = this.add.image(w / 2, h * 0.17 + 50, 'edge')
        .setDisplaySize(Math.min(240, w * 0.66), 3).setTint(0x8effd8).setAlpha(0.5)
        .setBlendMode(Phaser.BlendModes.ADD);
      var hint = bodyText(this, w / 2, 0, 'Tap a card, or press 1 / 2 / 3', TYPE.micro, '#6f93a5');
      ov.add([title, sub, trule, hint]);

      var cards = [];
      for (var idx = 0; idx < 3; idx++) {
        var card = this.add.container(w / 2, 0);
        var glow = this.add.image(0, 0, 'disc').setTint(0x54a6d6).setAlpha(0.10)
          .setBlendMode(Phaser.BlendModes.ADD);
        var bg = this.add.image(0, 0, 'atlas', 'card');
        var ic = this.add.image(0, 0, 'atlas', 'ic_lance').setScale(0.92);
        var nm = this.add.text(0, 0, '', { fontFamily: FONT_DISPLAY, fontSize: TYPE.sub + 'px', color: '#d8f5ff', fontStyle: 'bold' });
        var tag = this.add.text(0, 0, '', { fontFamily: FONT_DISPLAY, fontSize: TYPE.micro + 'px', color: '#8fb3c4', fontStyle: 'bold' }).setOrigin(1, 0);
        var ds = this.add.text(0, 0, '', { fontFamily: FONT_BODY, fontSize: TYPE.micro + 'px', color: '#9fc0cf', lineSpacing: 4 });
        var num = this.add.text(0, 0, String(idx + 1), { fontFamily: FONT_DISPLAY, fontSize: TYPE.micro + 'px', color: '#5d7f90', fontStyle: 'bold' });
        var pips = [];
        for (var q = 0; q < 8; q++) pips.push(this.add.rectangle(0, 0, 6, 5, 0x2b4756));
        card.add([glow, bg, ic, nm, tag, ds, num].concat(pips));
        ov.add(card);

        bg.setInteractive({ useHandCursor: true });
        (function (b, i) {
          b.on('pointerover', function () { b.setTint(0xdfffff); });
          b.on('pointerout', function () { b.clearTint(); });
          b.on('pointerdown', function () { scene.pickUpgrade(i); });
        })(bg, idx);
        this.tweens.add({ targets: glow, alpha: 0.20, duration: 1300 + idx * 170, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

        cards.push({ card: card, glow: glow, bg: bg, ic: ic, nm: nm, tag: tag, ds: ds, num: num, pips: pips });
      }
      this.lockToScreen(ov);
      this.draftUI = ov;
      this.draftUI.title = title;
      this.draftUI.hint = hint;
      this.draftUI.cards = cards;
      return ov;
    },

    openDraft: function () {
      var scene = this;
      this.state = 'draft';
      sfx('levelup');
      if (this.draftHold) clearTimeout(this.draftHold);
      this.draftHold = setTimeout(function () {
        scene.draftHold = null;
        if (scene.state === 'draft') scene.holdPause('draft');
      }, 460);
      this.fx.level.emitParticleAt(this.p.x, this.p.y, 30);
      kit.juice.shake(6, 200);

      var pool = this.availableUpgrades();
      var picks = [];
      var copy = pool.slice();
      while (picks.length < 3 && copy.length) {
        picks.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
      }
      this.draftCards = picks;

      var w = this.scale.width, h = this.scale.height;
      var ov = this.buildDraftUI();
      ov.setVisible(true).setAlpha(kit.juice.enabled ? 0 : 1).setScale(kit.juice.enabled ? 0.94 : 1);
      this.children.bringToTop(ov);
      this.overlay = ov;
      this.tweens.killTweensOf(ov);
      if (kit.juice.enabled) this.tweens.add({ targets: ov, alpha: 1, scale: 1, duration: 360, ease: 'Back.easeOut' });

      setTextIfChanged(ov.title, 'LEVEL ' + this.run.level);
      ov.title.setScale(kit.juice.enabled ? 0.58 : 1);
      this.tweens.killTweensOf(ov.title);
      if (kit.juice.enabled) this.tweens.add({ targets: ov.title, scale: 1, duration: 400, ease: 'Back.easeOut' });

      var cardW = Math.min(320, w - 26);
      var cardH = Math.min(104, (h * 0.52) / Math.max(1, picks.length) - 10);
      var startY = h * 0.32;

      for (var idx = 0; idx < ov.cards.length; idx++) {
        var c = ov.cards[idx];
        if (idx >= picks.length) { c.card.setVisible(false); continue; }
        c.card.setVisible(true).setScale(kit.juice.enabled ? 0.84 : 1);
        var u = picks[idx];
        var rank = this.p.ranks[u.key] || 0;
        var isNew = rank === 0;
        var isUpgradedWeapon = u.type === 'weapon' && !!u.upgraded;
        var rarity = RARITY_STYLE[u.rarity] ? u.rarity : 'common';
        var rarityStyle = RARITY_STYLE[rarity];

        c.card.setY(startY + idx * (cardH + 14) + cardH / 2).setX(w / 2 + w);
        c.card.setScale(kit.juice.enabled ? (isUpgradedWeapon ? 0.70 : 0.84) : 1);
        c.bg.setFrame(isNew ? 'card_hot' : 'card').setDisplaySize(cardW, cardH).setTint(rarityStyle.tint);
        c.glow.setDisplaySize(cardW * (isUpgradedWeapon ? 1.34 : 1.15), cardH * (isUpgradedWeapon ? 1.78 : 1.5))
          .setTint(isUpgradedWeapon ? 0xffd67a : (isNew ? 0x8effd8 : rarityStyle.tint));
        c.ic.setFrame(u.icon).setPosition(-cardW / 2 + 36, 0).setScale(isUpgradedWeapon ? 1.12 : 0.92)
          .setTint(isUpgradedWeapon ? 0xfff0b0 : 0xffffff);
        c.nm.setPosition(-cardW / 2 + 68, -cardH / 2 + 14).setColor(isUpgradedWeapon ? '#fff3bf' : (isNew ? '#c9ffe9' : '#d8f5ff')).setText(u.name);
        c.tag.setPosition(cardW / 2 - 14, -cardH / 2 + 14).setColor(rarityStyle.color)
          .setText(isUpgradedWeapon ? 'EPIC // UPGRADED' : rarity.toUpperCase() + (isNew ? ' // NEW' : ' // RANK ' + (rank + 1)));
        c.ds.setPosition(-cardW / 2 + 68, -cardH / 2 + 36)
          .setWordWrapWidth(cardW - 86).setText(u.desc(rank));
        c.num.setPosition(-cardW / 2 + 12, cardH / 2 - 18);
        for (var q = 0; q < c.pips.length; q++) {
          var pip = c.pips[q];
          if (q >= u.max) { pip.setVisible(false); continue; }
          pip.setVisible(true)
            .setPosition(cardW / 2 - 12 - (u.max - 1 - q) * 9, cardH / 2 - 14)
            .setFillStyle(q < rank ? 0x8effd8 : 0x2b4756);
        }

        this.tweens.killTweensOf(c.card);
        if (kit.juice.enabled) {
          this.tweens.add({ targets: c.card, x: w / 2, scale: isUpgradedWeapon ? 1.06 : 1, duration: isUpgradedWeapon ? 560 : 430,
            delay: idx * 80, ease: 'Back.easeOut' });
        } else c.card.setX(w / 2);
      }

      ov.hint.setY(h * 0.32 + picks.length * (cardH + 14) + 22);
    },

    pickUpgrade: function (idx) {
      if (this.state !== 'draft' || !this.draftCards || !this.draftCards[idx]) return;
      var u = this.draftCards[idx];
      var p = this.p;
      p.ranks[u.key] = (p.ranks[u.key] || 0) + 1;
      var r = p.ranks[u.key];

      if (u.type === 'weapon') this.equipWeapon(u.weapon, false);
      else if (u.key === 'damage') p.damage = p.damageBase * (1 + 0.16 * r);
      else if (u.key === 'speed') p.speed = p.speedBase * (1 + 0.11 * r);
      else if (u.key === 'magnet') p.magnet += 46;
      else if (u.key === 'armor') p.armor = Math.min(0.62, 1 - Math.pow(0.88, r));
      else if (u.key === 'vitality') { p.maxHp += 22; p.hp = Math.min(p.maxHp, p.hp + 22); }
      else if (u.key === 'crit') p.crit = Math.min(0.5, r * 0.08);
      else if (u.key === 'regen') p.regen = r * 1.6;
      else if (u.key === 'fireRate') p.weaponRate = r;
      else if (u.key === 'multishot') p.multishot = r;
      else if (u.key === 'projDamage') p.projectileDamage = 1 + r * 0.12;
      else if (u.key === 'projSpeed') p.projectileSpeed = 1 + r * 0.10;
      else if (u.key === 'projSize') p.projectileSize = 1 + r * 0.08;
      else if (u.key === 'pierce') p.pierce = r;
      else if (u.key === 'primaryCrit') p.primaryCrit = Math.min(0.25, r * 0.05);
      else if (u.key === 'hull') { p.maxHp += 18; p.hp = Math.min(p.maxHp, p.hp + 18); }
      else if (u.key === 'wingDamage') p.wingDamage = 0.56 + r * 0.12;
      else if (u.key === 'wingRevive') p.wingRevive = r;
      else if (u.key === 'gemValue') p.gemBonus = 1 + metaLevel('fortune') * 0.10 + hangarLevel('fortune') * 0.06;
      else if (u.key === 'drift') p.drift = r;

      this.closeOverlay();
      this.draftCards = null;
      this.state = 'playing';
      if (this.draftHold) { clearTimeout(this.draftHold); this.draftHold = null; }
      this.releasePause('draft');
      this.accum = 0;              // do not bank draft time into the sim
      this.lastNow = performance.now();

      sfx('select');
      this.fx.level.emitParticleAt(p.x, p.y, 22);
      this.contactRing(p.x, p.y, 24, 200, 0.38, 0xa7ffe0, 0.85);
      kit.juice.shake(6, 180);
      this.floatText(p.x, p.y - 26, u.name.toUpperCase(), '#a7ffe0', TYPE.body);
      if (u.type === 'weapon' && u.upgraded) {
        var upgradedData = WEAPON_BY_KEY[u.weapon];
        this.queueSpectacleBeat('UPGRADED // ' + u.name.toUpperCase(), upgradedData ? upgradedData.color : 0xffd67a, 1.18, false);
        this.showBanner('UPGRADED PRIMARY', u.name.toUpperCase() + ' // LATE-RUN PRIZE', false, true);
      }
      this.updateHud();
      this.checkLevel();
      if (this.tutorial && this.tutorial.step === 3) this.tutorialAdvance();
    },

    togglePause: function () {
      if (this.state === 'playing') this.openPause();
      else if (this.state === 'paused' && this.pauseResume) this.pauseResume();
    },

    openPause: function () {
      if (this.state !== 'playing') return;
      var scene = this;
      this.refreshWatchdogAge(performance.now());
      this.state = 'paused';
      this.holdPause('menu');
      var w = this.scale.width, h = this.scale.height;
      var ov = this.add.container(0, 0).setScrollFactor(0).setDepth(400);
      this.overlay = ov;
      ov.add(this.add.rectangle(w / 2, h / 2, w, h, 0x03080e, 0.9).setInteractive());
      var pw = Math.min(300, w - 32);
      ov.add(this.add.image(w / 2, h * 0.28, 'atlas', 'panel').setDisplaySize(pw, 130));
      ov.add(neonText(this, w / 2, h * 0.28 - 26, 'PAUSED', TYPE.title - 2, '#c9ffe9'));
      ov.add(bodyText(this, w / 2, h * 0.28 + 8,
        fmtTime(this.run.time) + '   ·   Level ' + this.run.level + '   ·   ' + this.run.kills + ' kills',
        TYPE.label, '#8fb3c4'));
      ov.add(bodyText(this, w / 2, h * 0.28 + 32,
        'Score ' + this.run.score + '   ·   ' + Math.floor(this.run.gems) + ' gems this run',
        TYPE.micro, '#6f93a5'));
      ov.add(bodyText(this, w / 2, h - 18 - SAFE.bottom,
        'WATCHDOG MAX STEP ' + this.watchdog.maxStepMs.toFixed(2) + 'MS',
        TYPE.micro, '#526b7a'));

      function close() {
        scene.closeOverlay();
        scene.state = 'playing';
        scene.releasePause('menu');
        scene.accum = 0;
        scene.lastNow = performance.now();
        scene.clearStick();
        scene.clearKeys();
        scene.pauseResume = null;
      }
      var bw = Math.min(258, w * 0.72);
      ov.add(makeButton(this, w / 2, h * 0.46, bw, 52, 'RESUME', close, 'primary'));
      ov.add(makeButton(this, w / 2, h * 0.46 + 64, bw, 46, 'SETTINGS', openSettings, null, 'ic_regen'));
      ov.add(makeButton(this, w / 2, h * 0.46 + 122, bw, 46, 'ABANDON RUN', function () {
        close();
        scene.endRun(false, true);
      }));
      this.lockToScreen(ov);
      this.registerUiObject(ov);
      this.pauseResume = close;
    },

    endRun: function (won, abandoned) {
      if (this.state === 'over' || this.pendingEnd) return;
      this.pendingEnd = { won: !!won, abandoned: !!abandoned };
      this.state = 'over';
      if (!this.inSim) this.finishRun();
    },

    finishRun: function () {
      try { var bb = JSON.parse(localStorage.getItem('hm_blackbox') || 'null'); if (bb) { bb.clean = true; localStorage.setItem('hm_blackbox', JSON.stringify(bb)); } } catch (e) {}
      var end = this.pendingEnd;
      if (!end) return;
      this.pendingEnd = null;
      var scene = this;
      var run = this.run;
      var won = end.won, abandoned = end.abandoned;

      this.rescore();

      var banked = Math.floor(run.gems * BANK_RATE);
      profile.hangar.balance = Math.min(1e9, profile.hangar.balance + banked);
      profile.runs++;
      if (run.score > profile.best) profile.best = run.score;
      if (!profile.tutorialDone) profile.tutorialDone = true;
      var cStars = null, cStarCount = 0, cLevel = this.level;
      if (cLevel) {
        cStars = this.evalCampaignStars(won);
        for (var csi = 0; csi < cStars.length; csi++) if (cStars[csi].earned) cStarCount++;
        recordCampaignResult(cLevel.id, won, cStarCount, run.time);
      }
      saveProfile();
      updateHangarDebugState(HM_DEBUG_STATE);

      this.releaseAll();
      if (this.campaignObjText && this.campaignObjText.visible) this.campaignObjText.setVisible(false);
      kit.audio.music('musicBase', 1400);
      this.clearStick();
      this.clearKeys();
      this.closeOverlay();
      this.timers.length = 0;

      var w = this.scale.width, h = this.scale.height;
      var ov = this.add.container(0, 0).setScrollFactor(0).setDepth(400);
      this.overlay = ov;
      ov.add(this.add.rectangle(w / 2, h / 2, w, h, 0x03080e, 0.93).setInteractive());

      var eyebrow = won ? 'MERIDIAN STABLE' : (abandoned ? 'RUN ABANDONED' : 'SIGNAL LOST');
      var title = won ? 'CORE CLEARED' : 'RUN OVER';
      if (cLevel) {
        eyebrow = 'MISSION ' + cLevel.id + ' // ' + cLevel.name;
        title = won ? 'MISSION COMPLETE' : (abandoned ? 'MISSION ABANDONED' : 'MISSION FAILED');
      }
      var col = won ? '#8effd8' : '#ff9a8f';
      var bloom = this.add.image(w / 2, h * 0.24, 'disc')
        .setDisplaySize(w * (won ? 2.0 : 1.3), h * (won ? 0.7 : 0.4))
        .setTint(won ? 0x2fd0a0 : 0x6a1420)
        .setAlpha(won ? 0.30 : 0.34).setBlendMode(Phaser.BlendModes.ADD);
      ov.add(bloom);
      var mark = this.add.image(w / 2, h * 0.215, 'atlas', won ? 'boss' : 'hero_hurt')
        .setScale(won ? 0.9 : 1.5).setAlpha(won ? 0.30 : 0.42)
        .setTint(won ? 0x8effd8 : 0xff8878);
      ov.add(mark);
      this.tweens.add({
        targets: mark, angle: won ? 360 : 0, scale: mark.scale * (won ? 1.08 : 1.14),
        alpha: won ? 0.18 : 0.22, duration: won ? 9000 : 2600,
        yoyo: !won, repeat: -1, ease: won ? 'Linear' : 'Sine.easeInOut'
      });

      ov.add(neonText(this, w / 2, h * 0.2, eyebrow, TYPE.micro, '#8fb3c4'));
      var t = neonText(this, w / 2, h * 0.2 + 34, title, TYPE.title, col);
      t.setScale(0.7);
      ov.add(t);
      this.tweens.add({ targets: t, scale: 1, duration: 420, ease: 'Back.easeOut' });
      var urule = this.add.image(w / 2, h * 0.2 + 58, 'edge')
        .setDisplaySize(Math.min(220, w * 0.6), 3).setTint(won ? 0x8effd8 : 0xff9a8f)
        .setAlpha(0.55).setBlendMode(Phaser.BlendModes.ADD);
      ov.add(urule);
      if (cStars) {
        for (var spi = 0; spi < cStars.length; spi++) {
          var pip = this.add.image(w / 2 + (spi - 1) * 34, h * 0.2 + 80, 'p_star')
            .setScale(cStars[spi].earned ? 0.42 : 0.3)
            .setTint(cStars[spi].earned ? 0xffd67a : 0x2e3e4e)
            .setAlpha(cStars[spi].earned ? 1 : 0.55)
            .setBlendMode(cStars[spi].earned ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
          ov.add(pip);
          if (cStars[spi].earned) {
            pip.setScale(0.12);
            this.tweens.add({ targets: pip, scale: 0.42, duration: 340, delay: 300 + spi * 180, ease: 'Back.easeOut' });
          }
        }
      }

      var rows = [
        ['TIME', fmtTime(run.time)],
        ['KILLS', String(run.kills)],
        ['LEVEL', String(run.level)],
        ['SCORE', String(run.score)],
        ['GEMS BANKED', '+' + banked]
      ];
      var panelH = rows.length * 28 + 30;
      ov.add(this.add.image(w / 2, h * 0.335 + panelH / 2 - 14, 'atlas', 'panel_deep')
        .setDisplaySize(Math.min(310, w - 28), panelH).setAlpha(0.96));
      rows.forEach(function (r, i) {
        var y = h * 0.335 + i * 28;
        var l = scene.add.text(w / 2 - Math.min(126, w * 0.35), y, r[0], {
          fontFamily: FONT_BODY, fontSize: TYPE.micro + 'px', color: '#7fa3b5'
        }).setOrigin(0, 0.5);
        var v = scene.add.text(w / 2 + Math.min(126, w * 0.35), y, r[1], {
          fontFamily: FONT_DISPLAY, fontSize: TYPE.body + 'px',
          color: i === 4 ? '#ffd67a' : '#e7fff7', fontStyle: 'bold'
        }).setOrigin(1, 0.5);
        l.setAlpha(0); v.setAlpha(0);
        scene.tweens.add({ targets: [l, v], alpha: 1, duration: 260, delay: 220 + i * 90 });
        ov.add([l, v]);
      });
      ov.add(bodyText(this, w / 2, h * 0.335 + rows.length * 28 + 6,
        'Best ' + profile.best + '   ·   Bank ' + Math.floor(hangarBalance()) + ' gems',
        TYPE.micro, '#6f93a5'));
      if (cStars && won && cStarCount < 3) {
        var starHint = '';
        for (var shi = 0; shi < cStars.length; shi++) {
          if (!cStars[shi].earned) { starHint = 'NEXT STAR: ' + cStars[shi].label; break; }
        }
        if (starHint) ov.add(bodyText(this, w / 2, h * 0.335 + rows.length * 28 + 26,
          starHint, TYPE.micro, '#8fb3c4'));
      }

      var bw = Math.min(258, w * 0.72);
      var by = h * 0.685;
      if (cLevel) {
        var nextDef = won ? CAMPAIGN_LEVELS[cLevel.id + 1] : null;
        var missionsKey = Game.hasMissions ? 'missions' : 'title';
        if (nextDef && campaignUnlocked(nextDef.id)) {
          ov.add(makeButton(this, w / 2, by, bw, 54, 'NEXT MISSION', function () {
            Game.pendingLevel = nextDef;
            kit.restart();
          }, 'primary', 'ic_lance'));
        } else {
          ov.add(makeButton(this, w / 2, by, bw, 54, won ? 'FLY AGAIN' : 'RETRY MISSION', function () {
            kit.restart();
          }, 'primary', 'ic_lance'));
        }
        ov.add(makeButton(this, w / 2, by + 66, bw, 46, 'MISSIONS', function () {
          scene.scene.start(missionsKey);
        }, null, 'ic_speed'));
        ov.add(makeButton(this, w / 2, by + 124, bw, 46, 'TITLE', function () {
          scene.scene.start('title');
        }));
      } else {
        ov.add(makeButton(this, w / 2, by, bw, 54, 'RUN AGAIN', function () {
          kit.restart();
        }, 'primary', 'ic_lance'));
        ov.add(makeButton(this, w / 2, by + 66, bw, 46, 'HANGAR', function () {
          scene.scene.start('shop');
        }, null, 'ic_speed'));
        ov.add(makeButton(this, w / 2, by + 124, bw, 46, 'TITLE', function () {
          scene.scene.start('title');
        }));
      }

      this.lockToScreen(ov);

      if (won) {
        var cheer = this.add.particles(0, 0, 'p_star', {
          lifespan: 1100, speed: { min: 140, max: 420 },
          scale: { start: 0.34, end: 0 }, alpha: { start: 0.95, end: 0 },
          blendMode: 'ADD', emitting: false, quantity: 14, tint: 0xa7ffe0
        }).setDepth(401).setScrollFactor(0);
        ov.add(cheer);
        cheer.emitParticleAt(w / 2, h * 0.2 + 34, 16);
        this.after0(320, function () { cheer.emitParticleAt(w * 0.24, h * 0.26, 10); });
        this.after0(620, function () { cheer.emitParticleAt(w * 0.76, h * 0.22, 10); });
        sfx('unlock');
      }
      this.registerUiObject(ov);
    },

    after0: function (ms, fn) {
      var id = setTimeout(function () { fn(); }, ms);
      (this.uiTimeouts = this.uiTimeouts || []).push(id);
      return id;
    },

    startTutorial: function () {
      var w = this.scale.width, h = this.scale.height;
      this.tutorial = { step: 0, t: 0, ack: false, moved: 0, kills0: 0, gems0: 0, lvl0: 1 };
      // Owner directive 2026-08-08: the old h*0.74 panel blocked the bottom
      // half of the playfield. The coach mark is now a compact strip tucked
      // under the HUD that fades to a whisper a few seconds after each step.
      var box = this.add.container(w / 2, 252).setScrollFactor(0).setDepth(250);
      var bw = Math.min(340, w - 20);
      var bg = this.add.image(0, 0, 'atlas', 'panel').setDisplaySize(bw, 48).setAlpha(0.82);
      var glow = this.add.image(0, 0, 'disc').setDisplaySize(bw * 1.05, 74)
        .setTint(0x54d6ff).setAlpha(0.10).setBlendMode(Phaser.BlendModes.ADD);
      this.tutTitle = neonText(this, 0, -11, '', TYPE.micro, '#8effd8');
      this.tutBody = bodyText(this, 0, 8, '', TYPE.micro, '#a9c9d8');
      this.tutBody.setWordWrapWidth(bw - 28);
      box.add([glow, bg, this.tutTitle, this.tutBody]);
      this.tutBox = box;
      this.tutHand = this.add.image(0, 0, 'atlas', 'ring').setDepth(249)
        .setDisplaySize(96, 96).setTint(0x8effd8).setAlpha(0)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.registerUiObject(box);
      this.registerUiObject(this.tutHand);
      this.tutTarget = null;
      this.setTutorial('MOVE', 'Drag anywhere on the screen to fly. Try it now.');
      this.tweens.add({ targets: this.tutHand, alpha: 0.55, duration: 700,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.tutHand.setAlpha(0.3);
      this.tutPointAt({ x: 0, y: 0, screen: true });
    },

    tutPointAt: function (target) {
      this.tutTarget = target;
      if (!target) { this.tutHand.setAlpha(0); return; }
      this.tutHand.setAlpha(0.3);
    },

    setTutorial: function (title, body) {
      this.tutTitle.setText(title);
      this.tutBody.setText(body);
      this.tutBox.setAlpha(0).setScale(0.9);
      if (this.tutFadeTween) { this.tutFadeTween.remove(); this.tutFadeTween = null; }
      this.tweens.add({ targets: this.tutBox, alpha: 1, scale: 1, duration: 300, ease: 'Back.easeOut' });
      // Fade to a whisper after a beat so the hint never occludes play.
      this.tutFadeTween = this.tweens.add({
        targets: this.tutBox, alpha: 0.22, duration: 600, delay: 3200,
      });
      sfx('click', { volume: 0.3 });
    },

    tutorialAdvance: function () {
      var t = this.tutorial;
      if (!t) return;
      t.step++;
      t.t = 0;
      t.kills0 = this.run.kills;
      t.gems0 = this.run.gems;
      t.lvl0 = this.run.level;
      if (t.step === 1) {
        var ang = this.p.face || 0;
        var mark = this.spawn('drifter', false,
          clamp(this.p.x + Math.cos(ang) * 230, -EDGE, EDGE),
          clamp(this.p.y + Math.sin(ang) * 230, -EDGE, EDGE));
        this.tutPointAt(mark || null);
        this.setTutorial('AUTO-FIRE', 'Your Bolt Lance fires by itself. Aim by moving. Break that one.');
      } else if (t.step === 2) {
        this.setTutorial('COLLECT', 'Gems drop from kills. Fly over one to absorb it.');
        this.tutPointAt(this.nearestGem());
      } else if (t.step === 3) {
        this.tutPointAt(null);
        this.setTutorial('LEVEL UP', 'Each level you draft one of three upgrades. Take one.');
      } else if (t.step === 4) {
        this.tutPointAt({ x: 0, y: 0 });     // the Meridian mount at origin
        this.setTutorial('THE CORE', 'The Core descends onto that mount at 10:00. Survive to the first wave.');
      } else {
        var scene = this;
        this.tweens.add({
          targets: this.tutBox, alpha: 0, y: this.tutBox.y + 20, duration: 400,
          onComplete: function () { scene.tutBox.destroy(); scene.tutHand.destroy(); }
        });
        this.tutHand.setAlpha(0);
        this.tutTarget = null;
        this.tutorial = null;
        profile.tutorialDone = true;
        saveProfile();
      }
    },

    nearestGem: function () {
      var best = null, bestD = Infinity;
      for (var i = 0; i < this.gems.length; i++) {
        var g = this.gems[i];
        if (!g.alive) continue;
        var dx = g.x - this.p.x, dy = g.y - this.p.y, d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = g; }
      }
      return best;
    },

    stepTutorial: function (dt) {
      var t = this.tutorial;
      t.t += dt;
      if (t.step === 0) {
        if (this.p.moving) t.moved += dt;
        if (t.moved > 1.1) this.tutorialAdvance();
      } else if (t.step === 1) {
        if (this.tutTarget && !this.tutTarget.alive) this.tutPointAt(this.nearestEnemy(this.p.x, this.p.y, 900));
        if (this.run.kills > t.kills0) this.tutorialAdvance();
      } else if (t.step === 2) {
        if (!this.tutTarget || !this.tutTarget.alive) this.tutPointAt(this.nearestGem());
        if (this.run.gems > t.gems0) this.tutorialAdvance();
      } else if (t.step === 3) {
        if (this.run.level > t.lvl0 + 1) this.tutorialAdvance();
      } else if (t.step === 4) {
        if (this.run.wave >= 1) this.tutorialAdvance();
      }
    },

    floatText: function (x, y, str, color, size) {
      for (var i = 0; i < this.texts.length; i++) {
        var t = this.texts[i];
        if (t.alive) continue;
        t.alive = true; t.life = 0.85; t.vy = -46; t.pop = 0;
        this.unpark(t.obj);
        var col = color || '#ffffff';
        var px = Math.max(TYPE.micro, size || TYPE.micro) + 'px';
        if (t.col !== col) { t.obj.setColor(col); t.col = col; }
        if (t.px !== px) { t.obj.setFontSize(px); t.px = px; }
        t.obj.setText(String(str)).setPosition(x, y).setAlpha(1).setScale(0.6);
        return;
      }
    },

    showBanner: function (title, sub, tide, huge) {
      var h = this.scale.height, w = this.scale.width;
      var giant = !!huge || !!tide;
      this.watchdogPhase = 'banner';
      setTextIfChanged(this.bannerTitle, title);
      setTextIfChanged(this.bannerSub, sub || '');
      this.bannerTitle.setColor(tide ? '#fff3bf' : '#c9ffe9')
        .setFontSize((giant ? (tide ? 32 : 30) : TYPE.sub) + 'px')
        .setPosition(0, giant ? -16 : -10);
      this.bannerSub.setColor(tide ? '#ffd67a' : '#8fb3c4')
        .setPosition(0, giant ? 20 : 12);
      var bw = giant ? Math.min(w * 0.62, 340) : this.bannerWide;
      this.bannerBg.setDisplaySize(bw, giant ? 82 : 62);
      this.bannerGlow.setDisplaySize(bw * 1.14, giant ? 144 : 110);
      // Banners are simulation-time presentation state. A Safari timer
      // throttle can skip a Phaser tween callback, but it cannot strand this
      // bounded clock while the sim is making progress.
      this.bannerActive = true;
      this.bannerT = 0;
      this.bannerGiant = giant;
      this.bannerDur = kit.juice.enabled ? (giant ? 1.54 : 1.18) : (tide ? 1.05 : 1.55);
      this.banner.setY(h * 0.3).setX(w / 2).setScale(kit.juice.enabled ? (giant ? 0.84 : 0.9) : 1)
        .setAlpha(kit.juice.enabled ? 0 : 1);
    },

    stepBanner: function (dt) {
      if (!this.bannerActive) return;
      this.watchdogPhase = 'banner';
      this.bannerT += dt;
      if (this.bannerT >= this.bannerDur) {
        this.bannerActive = false;
        this.banner.setAlpha(0);
      }
    },

    renderBanner: function () {
      if (!this.bannerActive) {
        this.banner.setAlpha(0);
        return;
      }
      if (!kit.juice.enabled) {
        this.banner.setAlpha(1);
        return;
      }
      var enter = clamp(this.bannerT / 0.24, 0, 1);
      var exit = clamp((this.bannerDur - this.bannerT) / 0.34, 0, 1);
      var fade = Math.min(enter, exit);
      var travel = this.bannerGiant ? 0.16 : 0.10;
      this.banner.setX(this.scale.width / 2 - (1 - enter) * this.scale.width * travel)
        .setScale((this.bannerGiant ? 0.84 : 0.9) + enter * (this.bannerGiant ? 0.16 : 0.1))
        .setAlpha(fade);
    },

    renderSpectacle: function (run, w, h) {
      var s = this.spectacle;
      if (s.active && kit.juice.enabled) {
        var f = clamp(s.t / s.dur, 0, 1);
        var ease = 1 - Math.pow(1 - f, 3);
        var fade = 1 - f;
        var diag = Math.sqrt(w * w + h * h);
        var ringSize = 42 + diag * (0.34 + ease * 1.18 * s.scale);
        this.unpark(s.ring); this.unpark(s.flashA); this.unpark(s.flashB); this.unpark(s.flashWhite);
        s.ring.setPosition(w / 2, h / 2).setTint(s.color).setDisplaySize(ringSize, ringSize)
          .setAlpha((s.tide ? 0.92 : 0.72) * fade);
        s.flashA.setPosition(w / 2 - (1 - f) * 16, h / 2).setTint(0x19dfff)
          .setDisplaySize(w * (1.15 + f * 0.55), h * (1.08 + f * 0.42))
          .setAlpha((s.tide ? 0.18 : 0.11) * fade);
        s.flashB.setPosition(w / 2 + (1 - f) * 16, h / 2).setTint(0xff3ca6)
          .setDisplaySize(w * (1.12 + f * 0.5), h * (1.06 + f * 0.4))
          .setAlpha((s.tide ? 0.14 : 0.08) * fade);
        s.flashWhite.setPosition(w / 2, h / 2).setTint(s.color)
          .setDisplaySize(w * (0.58 + f * 0.54), h * (0.58 + f * 0.54))
          .setAlpha((s.tide ? 0.18 : 0.1) * fade);
        var edgeAlpha = (s.tide ? 0.84 : 0.62) * fade;
        for (var ei = 0; ei < s.edges.length; ei++) {
          var edge = s.edges[ei], ex, ey, ew, eh, ea;
          if (ei === 0) { ex = w / 2; ey = 0; ew = w; eh = 150; ea = 90; }
          else if (ei === 1) { ex = w / 2; ey = h; ew = w; eh = 150; ea = 270; }
          else if (ei === 2) { ex = 0; ey = h / 2; ew = h; eh = 132; ea = 0; }
          else { ex = w; ey = h / 2; ew = h; eh = 132; ea = 180; }
          this.unpark(edge);
          edge.setPosition(ex, ey).setAngle(ea).setDisplaySize(eh, ew)
            .setTint(s.color).setAlpha(edgeAlpha);
        }
      } else {
        this.park(s.ring); this.park(s.flashA); this.park(s.flashB); this.park(s.flashWhite);
        for (var pi = 0; pi < s.edges.length; pi++) this.park(s.edges[pi]);
      }
      if (this.comboHeroT > 0 && this.comboHero.visible) {
        var comboF = clamp(1 - this.comboHeroT / 1.08, 0, 1);
        var comboPop = kit.juice.enabled ? (0.42 + comboF * 0.58 + Math.sin(comboF * Math.PI) * 0.22) : 1;
        this.comboHero.setScale(comboPop).setAlpha(clamp(this.comboHeroT / 0.34, 0, 1));
      }
    },

    renderAirStrike: function (run, w, h, cmx, cmy, cullX, cullY) {
      var as = this.airStrike;
      if (as.active) {
        var u = clamp(as.t / as.dur, 0, 1);
        var x0 = as.startX + as.dir * as.span * u;
        for (var i = 0; i < as.bombers.length; i++) {
          var y = as.centerY + (i - 1) * 82;
          var bx = x0 - as.dir * i * 56;
          if (Math.abs(bx - cmx) > cullX + 120 || Math.abs(y - cmy) > cullY + 80) {
            this.park(as.bombers[i]); this.park(as.contrails[i]); continue;
          }
          this.unpark(as.bombers[i]); this.unpark(as.contrails[i]);
          as.bombers[i].setPosition(bx, y).setRotation(as.dir > 0 ? 0 : Math.PI)
            .setScale(1.28 + Math.sin(run.time * 10 + i) * 0.06)
            .setTint(i === 1 ? 0xfff0c6 : 0xffc361).setAlpha(0.94);
          as.contrails[i].setPosition(bx - as.dir * 88, y).setRotation(as.dir > 0 ? 0 : Math.PI)
            .setDisplaySize(176, 7).setTint(0xffd67a).setAlpha(0.44);
        }
        if (kit.juice.enabled && as.t < 0.58) {
          for (var ai = 0; ai < as.arrows.length; ai++) {
            var arrow = as.arrows[ai];
            this.unpark(arrow);
            arrow.setPosition(as.dir > 0 ? 26 : w - 26, h * (0.32 + ai * 0.36))
              .setRotation(as.dir > 0 ? 0 : Math.PI)
              .setAlpha(0.55 + Math.abs(Math.sin(run.time * 16)) * 0.4);
          }
        } else {
          for (var aj = 0; aj < as.arrows.length; aj++) this.park(as.arrows[aj]);
        }
      } else {
        for (var bi = 0; bi < as.bombers.length; bi++) {
          this.park(as.bombers[bi]); this.park(as.contrails[bi]);
        }
        for (var bj = 0; bj < as.arrows.length; bj++) this.park(as.arrows[bj]);
      }
      for (var k = 0; k < this.airBombs.length; k++) {
        var bomb = this.airBombs[k];
        if (!bomb.alive) continue;
        if (Math.abs(bomb.x - cmx) > cullX + bomb.radius || Math.abs(bomb.y - cmy) > cullY + bomb.radius) {
          this.park(bomb.spr); this.park(bomb.ring); this.park(bomb.scorch); continue;
        }
        if (!bomb.detonated) {
          this.unpark(bomb.spr); this.unpark(bomb.ring); this.park(bomb.scorch);
          var urgency = 1 - clamp(bomb.fuse / 0.42, 0, 1);
          bomb.spr.setPosition(bomb.x, bomb.y).setScale(0.62 + urgency * 0.16)
            .setAlpha(0.82 + Math.abs(Math.sin(run.time * (8 + urgency * 18))) * 0.18);
          bomb.ring.setPosition(bomb.x, bomb.y).setDisplaySize(bomb.radius * (1.18 + urgency * 0.24), bomb.radius * (1.18 + urgency * 0.24))
            .setTint(0xffc361).setAlpha(0.22 + urgency * 0.28);
        } else {
          this.park(bomb.spr); this.unpark(bomb.ring); this.unpark(bomb.scorch);
          var blastF = clamp(bomb.life / (kit.juice.enabled ? 0.46 : 0.24), 0, 1);
          bomb.ring.setPosition(bomb.x, bomb.y).setDisplaySize(bomb.radius * (1.42 - blastF * 0.3), bomb.radius * (1.42 - blastF * 0.3))
            .setTint(0xff9a5a).setAlpha(blastF * 0.78);
          bomb.scorch.setPosition(bomb.x, bomb.y).setDisplaySize(bomb.radius * (1.1 + (1 - blastF) * 0.2), bomb.radius * (1.1 + (1 - blastF) * 0.2))
            .setAlpha(blastF * 0.44);
        }
      }
    },

    renderEliteBursts: function (run, cmx, cmy, cullX, cullY) {
      for (var i = 0; i < this.eliteBursts.length; i++) {
        var burst = this.eliteBursts[i];
        if (!burst.active) continue;
        if (Math.abs(burst.x - cmx) > cullX + 220 || Math.abs(burst.y - cmy) > cullY + 220) {
          this.park(burst.ring); this.park(burst.flare); continue;
        }
        var f = clamp(burst.t / burst.dur, 0, 1), ease = 1 - Math.pow(1 - f, 3);
        this.unpark(burst.ring); this.unpark(burst.flare);
        burst.ring.setPosition(burst.x, burst.y).setDisplaySize(62 + ease * 360, 62 + ease * 360)
          .setTint(burst.color).setAlpha(0.82 * (1 - f));
        burst.flare.setPosition(burst.x, burst.y).setDisplaySize(112 + ease * 250, 112 + ease * 250)
          .setTint(0xffffff).setAlpha(0.22 * (1 - f));
      }
    },

    renderBossPhaseFx: function (run, w, h, cmx, cmy) {
      var fx = this.bossPhaseFx, boss = this.bossRef;
      if (!fx.active || !boss || !kit.juice.enabled) {
        this.park(fx.veil); this.park(fx.glow);
        for (var pi = 0; pi < fx.beams.length; pi++) this.park(fx.beams[pi]);
        return;
      }
      var f = clamp(fx.t / fx.dur, 0, 1), pulse = Math.sin(f * Math.PI);
      this.unpark(fx.veil); this.unpark(fx.glow);
      fx.veil.setPosition(w / 2, h / 2).setDisplaySize(w * 2.2, h * 2.2).setTint(0x02030a)
        .setAlpha(0.18 + pulse * 0.22);
      fx.glow.setPosition(w / 2 + boss.x - cmx, h / 2 + boss.y - cmy)
        .setDisplaySize(260 + pulse * 140, 260 + pulse * 140).setTint(fx.phase === 1 ? 0xffd67a : 0xd6a4ff)
        .setAlpha(0.14 + pulse * 0.14);
      for (var i = 0; i < fx.beams.length; i++) {
        var a = i * TAU / fx.beams.length + fx.phase * 0.18;
        var beam = fx.beams[i];
        this.unpark(beam);
        beam.setPosition(boss.x + Math.cos(a) * 245, boss.y + Math.sin(a) * 245)
          .setRotation(a).setDisplaySize(500, 7 + pulse * 10)
          .setTint(fx.phase === 1 ? 0xffd67a : 0xd6a4ff).setAlpha(0.34 + pulse * 0.38);
      }
    },

    renderTideEffects: function (dt, run, w, h, cmx, cmy, cullX, cullY) {
      var p = this.p;
      var mirrorFrame = (FRAME_BY_KEY[profile.hangar.frame] || HULL_FRAMES[0]).idle;
      for (var i = 0; i < this.mirrors.length; i++) {
        var g = this.mirrors[i];
        if (!g.active || run.tides['mirror-squadron'] <= 0) {
          this.park(g.spr); this.park(g.halo); continue;
        }
        if (Math.abs(g.x - cmx) > cullX || Math.abs(g.y - cmy) > cullY) {
          this.park(g.spr); this.park(g.halo); continue;
        }
        this.unpark(g.spr); this.unpark(g.halo);
        g.spr.setTexture('atlas', mirrorFrame).setPosition(g.x, g.y)
          .setRotation(g.heading).setTint(0xc480ff)
          .setAlpha(0.36 + Math.sin(run.time * 7 + i) * 0.06).setScale(0.88);
        g.halo.setPosition(g.x, g.y)
          .setDisplaySize(72 + Math.sin(run.time * 6 + i) * 8, 72 + Math.sin(run.time * 6 + i) * 8)
          .setTint(0xc480ff).setAlpha(0.16);
      }

      var s = this.singularity;
      if (s.active && Math.abs(s.x - cmx) <= cullX && Math.abs(s.y - cmy) <= cullY) {
        var sf = clamp(s.t / 3, 0, 1), collapse = 1 + (1 - sf) * 0.18;
        this.unpark(s.spr); this.unpark(s.ring); this.unpark(s.flash);
        s.spr.setPosition(s.x, s.y).setDisplaySize(64 + Math.sin(run.time * 12) * 6,
          64 + Math.sin(run.time * 12) * 6).setTint(0x05030c)
          .setBlendMode(Phaser.BlendModes.NORMAL).setAlpha(0.96);
        s.ring.setPosition(s.x, s.y).setDisplaySize(230 * collapse, 230 * collapse)
          .setTint(0xbca8ff).setAlpha(0.48 + (1 - sf) * 0.3).setRotation(run.time * 1.7);
        s.flash.setPosition(s.x, s.y).setDisplaySize(270 + Math.sin(run.time * 8) * 20,
          270 + Math.sin(run.time * 8) * 20).setTint(0xdcc8ff).setAlpha(0.10 + (1 - sf) * 0.12);
      } else {
        this.park(s.spr); this.park(s.ring); this.park(s.flash);
      }

      if (this.rewindFx.t > 0) {
        var rewindDur = kit.juice.enabled ? 0.9 : 0.38;
        var rf = clamp(1 - this.rewindFx.t / rewindDur, 0, 1);
        this.unpark(this.rewindFx.ring); this.unpark(this.rewindFx.flash);
        this.rewindFx.ring.setPosition(p.x, p.y).setTint(0x7ad8ff)
          .setDisplaySize(kit.juice.enabled ? 46 + rf * 230 : 116, kit.juice.enabled ? 46 + rf * 230 : 116)
          .setAlpha(kit.juice.enabled ? 0.86 * (1 - rf) : 0.5);
        this.rewindFx.flash.setPosition(p.x, p.y).setTint(0xc9f4ff)
          .setDisplaySize(kit.juice.enabled ? 70 + rf * 180 : 96, kit.juice.enabled ? 70 + rf * 180 : 96)
          .setAlpha(kit.juice.enabled ? 0.28 * (1 - rf) : 0.12);
      } else {
        this.park(this.rewindFx.ring); this.park(this.rewindFx.flash);
      }

      if (run.tideBeatT > 0 && kit.juice.enabled) {
        var beatF = clamp(1 - run.tideBeatT / run.tideBeatDur, 0, 1);
        this.unpark(this.tideBeatRing); this.unpark(this.tideBeatFlash);
        this.tideBeatRing.setPosition(w / 2, h / 2).setTint(0xffd67a)
          .setDisplaySize(80 + beatF * Math.max(w, h) * 0.82, 80 + beatF * Math.max(w, h) * 0.82)
          .setAlpha(0.72 * (1 - beatF));
        this.tideBeatFlash.setPosition(w / 2, h / 2).setTint(0xfff3c766)
          .setDisplaySize(w * (0.55 + beatF * 0.32), h * (0.55 + beatF * 0.32))
          .setAlpha(0.18 * (1 - beatF));
      } else {
        this.park(this.tideBeatRing); this.park(this.tideBeatFlash);
      }
    },

    enterRegion: function (region, initial) {
      if (!region || !this.run) return;
      var changed = this.run.regionKey !== region.key;
      this.run.regionKey = region.key;
      if (!this.run.regionSeen) this.run.regionSeen = {};
      if (!this.run.regionSeen[region.key]) {
        this.run.regionSeen[region.key] = true;
        this.run.regionsSeen = (this.run.regionsSeen || 0) + 1;
      }
      if (!this.run.landmarkGemsSeen[region.key]) this.seedLandmarkGems(region);
      if (changed && !initial) {
        this.showBanner('SECTOR // ' + region.name, region.flavor);
        sfx('wave', { volume: 0.34, rate: 0.78 + regionIndexAtX(this.p.x) * 0.07 });
      }
    },

    seedLandmarkGems: function (region) {
      if (!region || this.run.landmarkGemsSeen[region.key]) return;
      this.run.landmarkGemsSeen[region.key] = true;
      var seeded = 0;
      for (var i = 0; i < this.landmarkDefs.length && seeded < DROP_TUNING.landmarkGemCount; i++) {
        var landmark = this.landmarkDefs[i];
        if (landmark.region !== region.key) continue;
        this.dropGem({ x: landmark.x, y: landmark.y, elite: false, xp: DROP_TUNING.landmarkGemValue });
        seeded++;
      }
    },

    reseedRegionField: function (region) {
      var ri = regionIndexAtX((region.minX + region.maxX) * 0.5);
      var span = region.maxX - region.minX;
      this.regionFieldTask = { region: region, ri: ri, span: span, mark: 0, debris: 0 };
    },

    stepRegionFieldReseed: function () {
      var task = this.regionFieldTask;
      if (!task) return;
      var region = task.region, ri = task.ri, span = task.span;
      var markBudget = 24;
      while (task.mark < this.marks.length && markBudget-- > 0) {
        var mi = task.mark++, m = this.marks[mi];
        m.wx = region.minX + 80 + noise01(ri * 701 + mi * 17 + 1) * (span - 160);
        m.wy = -EDGE * 0.96 + noise01(ri * 907 + mi * 23 + 3) * EDGE * 1.92;
        m.setTint(region.palette.stars[mi % region.palette.stars.length]);
      }
      var debrisBudget = 6;
      while (task.debris < this.debris.length && debrisBudget-- > 0) {
        var di = task.debris++, debris = this.debris[di];
        debris.wx = region.minX + noise01(ri * 1103 + di * 29 + 5) * span;
        debris.wy = -EDGE + noise01(ri * 1301 + di * 31 + 7) * WORLD;
        debris.dx = (noise01(ri * 1601 + di * 37 + 9) - 0.5) * (region.key === 'ember-drift' ? 30 : 18);
        debris.dy = (noise01(ri * 1901 + di * 41 + 11) - 0.5) * 18;
        debris.setTint(region.palette.stars[(di + 1) % region.palette.stars.length]);
      }
      if (task.mark >= this.marks.length && task.debris >= this.debris.length) this.regionFieldTask = null;
    },

    updateRegionPresentation: function (region, cmx, cmy) {
      if (!region) return;
      if (this.activeRegionKey !== region.key) {
        this.activeRegionKey = region.key;
        this.ground.setTint(region.palette.ground);
        for (var i = 0; i < this.regionBackground.length; i++) {
          var layer = this.regionBackground[i];
          layer.spr.setTint(i === 0 ? region.palette.far : (i === 1 ? region.palette.mid : region.palette.near));
          layer.spr.setAlpha(i === 0 ? 0.16 : 0.18);
          this.unpark(layer.spr);
        }
        this.reseedRegionField(region);
        if (this.frameVig) this.frameVig.setAlpha(region.key === 'void-rift' ? 0.14 : 0);
      }
      this.stepRegionFieldReseed();
      for (var j = 0; j < this.regionBackground.length; j++) {
        var bg = this.regionBackground[j];
        bg.spr.setPosition(cmx * bg.par, cmy * bg.par)
          .setAlpha((j === 0 ? 0.16 : 0.18) + (region.key === 'void-rift' ? 0.025 : 0));
      }
    },

    renderRegionLandmarks: function (cmx, cmy, cullX, cullY) {
      var used = 0;
      for (var i = 0; i < this.landmarkDefs.length; i++) {
        var def = this.landmarkDefs[i];
        var margin = def.frame === 'disc' ? 140 : 90;
        if (Math.abs(def.x - cmx) > cullX + margin || Math.abs(def.y - cmy) > cullY + margin) continue;
        if (used >= this.landmarkPool.length) break;
        var slot = this.landmarkPool[used++];
        if (slot.defIndex !== i) {
          slot.defIndex = i;
          slot.spr.setTexture('atlas', def.frame).setTint(def.tint)
            .setScale(def.scale).setRotation(def.rot).setAlpha(def.alpha);
        }
        if (!slot.active) { slot.active = true; this.unpark(slot.spr); }
        slot.spr.setPosition(def.x, def.y);
      }
      for (var p = used; p < this.landmarkPool.length; p++) {
        var parked = this.landmarkPool[p];
        if (parked.active) {
          parked.active = false;
          parked.defIndex = -1;
          this.park(parked.spr);
        }
      }
    },

    stepRegionTour: function (dt) {
      var st = this.debugState;
      if (!st) return;
      if (st.forceRegionTour) {
        st.forceRegionTour = false;
        this.regionTourActive = true;
        this.regionTourStep = 0;
        this.regionTourStart = regionIndexAtX(this.p.x);
        this.regionTourT = 0;
      }
      if (!this.regionTourActive) return;
      this.regionTourT -= dt;
      if (this.regionTourT > 0) return;
      this.regionTourT = 1.05;
      this.regionTourStep++;
      if (this.regionTourStep > REGIONS.length) {
        this.regionTourActive = false;
        return;
      }
      var targetIndex = (this.regionTourStart + this.regionTourStep) % REGIONS.length;
      var target = REGIONS[targetIndex];
      this.p.x = target.minX + 360;
      this.p.y = (targetIndex % 2 ? -260 : 260);
      this.p.vx = 0; this.p.vy = 0; this.p.moving = false;
      this.enterRegion(target, false);
    },

    renderStep: function (dt, j) {
      var p = this.p, run = this.run;
      var cam = this.cameras.main;
      var w = this.scale.width, h = this.scale.height;

      // Mobile plays zoomed out 25% (owner directive 2026-08-08): phones need
      // more situational awareness in the big arena; the punch-zoom beats ride
      // on top of the base zoom.
      var baseZoom = w <= 520 ? 0.8 : 1;
      if (kit.juice.enabled && this.cameraZoomT > 0 && !this.strike.active) {
        var zoomF = clamp(1 - this.cameraZoomT / (this.cameraZoomDur || 1), 0, 1);
        cam.setZoom(baseZoom * (1 + (this.cameraZoomAmount || 0) * Math.sin(zoomF * Math.PI)));
      } else cam.setZoom(baseZoom);
      var lookX = p.x + p.vx * 0.14, lookY = p.y + p.vy * 0.14;
      var curX = cam.midPoint.x, curY = cam.midPoint.y;
      var f = Math.min(1, dt * 7.5);
      cam.centerOn(curX + (lookX - curX) * f + j.dx, curY + (lookY - curY) * f + j.dy);

      var cmx = cam.midPoint.x, cmy = cam.midPoint.y;
      var cullX = w / 2 + 90, cullY = h / 2 + 90;

      var region = REGION_BY_KEY[run.regionKey] || regionAtX(p.x);
      this.updateRegionPresentation(region, cmx, cmy);

      this.ground.tilePositionX = cam.scrollX * 0.92;
      this.ground.tilePositionY = cam.scrollY * 0.92;
      for (var i = 0; i < this.marks.length; i++) {
        var m = this.marks[i];
        var mx = m.wx * m.par + cmx * (1 - m.par);
        var my = m.wy * m.par + cmy * (1 - m.par);
        if (Math.abs(mx - cmx) > cullX || Math.abs(my - cmy) > cullY) { this.park(m); continue; }
        this.unpark(m);
        m.x = mx; m.y = my;
        m.setScale(m.baseScale * (1 + Math.sin(run.time * 1.3 + m.phase) * 0.16));
      }
      for (var dj = 0; dj < this.debris.length; dj++) {
        var debris = this.debris[dj];
        debris.wx += debris.dx * dt;
        debris.wy += debris.dy * dt;
        if (debris.wx > region.maxX + 180) debris.wx = region.minX - 180;
        else if (debris.wx < region.minX - 180) debris.wx = region.maxX + 180;
        if (debris.wy > EDGE + 180) debris.wy = -EDGE - 180;
        else if (debris.wy < -EDGE - 180) debris.wy = EDGE + 180;
        var dxDebris = debris.wx * debris.par + cmx * (1 - debris.par);
        var dyDebris = debris.wy * debris.par + cmy * (1 - debris.par);
        if (Math.abs(dxDebris - cmx) > cullX || Math.abs(dyDebris - cmy) > cullY) {
          this.park(debris); continue;
        }
        this.unpark(debris);
        debris.setPosition(dxDebris, dyDebris)
          .setRotation(debris.rotation + debris.spin * dt)
          .setScale(debris.baseScale * (1 + Math.sin(run.time * 2 + dj) * 0.12));
      }

      this.renderRegionLandmarks(cmx, cmy, cullX, cullY);
      if (this.coreMount && Math.abs(this.coreMount.wx - cmx) <= cullX + 100 &&
          Math.abs(this.coreMount.wy - cmy) <= cullY + 100) {
        this.unpark(this.coreMount);
        this.coreMount.setPosition(this.coreMount.wx, this.coreMount.wy);
        var heat = clamp(run.time / this.activeRunSeconds, 0, 1);
        this.coreMount.setAlpha(0.6 + heat * 0.35 + Math.sin(run.time * 1.1) * 0.05);
      } else if (this.coreMount) this.park(this.coreMount);
      this.renderAmbient(cmx, cmy, cullX, cullY);
      this.renderBases(run, cmx, cmy, cullX, cullY);

      var hullFrame = FRAME_BY_KEY[profile.hangar.frame] || HULL_FRAMES[0];
      var frame;
      if (p.hurtT > 0) frame = 'hero_hurt';
      else if (p.moving) frame = (Math.floor(run.time * 11) % 2) ? hullFrame.move : hullFrame.idle;
      else frame = hullFrame.idle;
      if (this.player.frame.name !== frame) this.player.setTexture('atlas', frame);
      this.player.setPosition(p.x, p.y);
      var thrust = clamp(Math.sqrt(p.vx * p.vx + p.vy * p.vy) / (p.speed || 1), 0, 1);
      var lowIntegrity = p.hp > 0 && p.hp / p.maxHp < 0.3;
      this.playerMark.setPosition(p.x, p.y)
        .setRotation(-run.time * 0.55)
        .setScale(0.82 + (p.hurtT > 0 ? 0.1 : 0) + Math.sin(run.time * 2.2) * 0.015)
        .setAlpha(p.hurtT > 0 ? 1 : 0.85);
      if (p.moving) {
        var target = p.face;
        var diff = Phaser.Math.Angle.Wrap(target - this.playerHeading);
        this.playerHeading += diff * Math.min(1, dt * 12);
        this.playerBank += (clamp(diff * 2.4, -0.3, 0.3) - this.playerBank) * Math.min(1, dt * 14);
      } else {
        this.playerBank += (0 - this.playerBank) * Math.min(1, dt * 8);
      }
      this.player.setRotation(this.playerHeading + this.playerBank);
      var paint = PAINT_BY_KEY[profile.hangar.paint] || HULL_PAINTS[0];
      if (lowIntegrity && p.hurtT <= 0) this.player.setTint(paint.lowTint);
      else this.player.setTint(paint.tint);
      this.player.setAlpha(
        (run.buffs.cloak > 0 ? 0.48 + Math.sin(run.time * 9) * 0.12 : 1) *
        ((p.iframes > 0 && kit.juice.enabled) ? (Math.floor(run.time * 22) % 2 ? 0.35 : 1) : 1));
      this.playerGlow.setPosition(p.x, p.y)
        .setDisplaySize(96 * (1 + thrust * 0.16), 96 * (1 + thrust * 0.16))
        .setAlpha(0.18 + Math.sin(run.time * 3) * 0.05 + thrust * 0.08 +
          (p.hurtT > 0 ? 0.2 : 0) + (lowIntegrity ? 0.07 : 0))
        .setTint(p.hurtT > 0 || lowIntegrity ? 0xff5a6a :
          (run.tides['last-stand'] > 0 ? 0xffd67a : (run.tides['bounty-frenzy'] > 0 ? 0xffc361 :
            (run.buffs.flare > 0 ? 0xffc361 : (run.buffs.overdrive > 0 ? 0xffd67a :
              (TRIM_BY_KEY[profile.hangar.trim] || TRIMS[0]).color)))));
      this.magnetRing.setPosition(p.x, p.y).setDisplaySize(p.magnet * 2.1, p.magnet * 2.1)
        .setTint(run.buffs.gravity > 0 ? 0xb18cff : (run.buffs.dilation > 0 ? 0x7ad8ff : 0x3c9fd0))
        .setAlpha(run.buffs.gravity > 0 ? 0.16 : (run.buffs.dilation > 0 ? 0.13 : 0.07));
      this.renderFormation(dt, run, cmx, cmy, cullX, cullY);
      this.renderTideEffects(dt, run, w, h, cmx, cmy, cullX, cullY);
      this.renderSpectacle(run, w, h);
      this.renderAirStrike(run, w, h, cmx, cmy, cullX, cullY);
      this.renderEliteBursts(run, cmx, cmy, cullX, cullY);
      this.renderBossPhaseFx(run, w, h, cmx, cmy);
      this.renderBanner();

      if (this.drone.active && run.buffs.drone > 0) {
        this.unpark(this.drone.spr); this.unpark(this.drone.halo);
        this.drone.spr.setPosition(this.drone.x, this.drone.y)
          .setRotation(this.drone.angle + Math.PI / 2).setScale(0.72 + Math.sin(run.time * 8) * 0.05)
          .setTint(0x6df0bf).setAlpha(0.96);
        this.drone.halo.setPosition(this.drone.x, this.drone.y)
          .setDisplaySize(58 + Math.sin(run.time * 6) * 6, 58 + Math.sin(run.time * 6) * 6)
          .setTint(0x6df0bf).setAlpha(0.22);
      } else {
        this.park(this.drone.spr); this.park(this.drone.halo);
      }

      if (run.buffs.decoy > 0) {
        this.unpark(this.decoy.spr); this.unpark(this.decoy.halo);
        this.decoy.spr.setPosition(this.decoyX, this.decoyY)
          .setRotation(run.time * 2.4).setScale(0.9 + Math.sin(run.time * 8) * 0.08)
          .setTint(0xc480ff).setAlpha(0.95);
        this.decoy.halo.setPosition(this.decoyX, this.decoyY)
          .setDisplaySize(90 + Math.sin(run.time * 6) * 10, 90 + Math.sin(run.time * 6) * 10)
          .setTint(0xc480ff).setAlpha(0.2 + Math.sin(run.time * 5) * 0.05);
      } else {
        this.park(this.decoy.spr); this.park(this.decoy.halo);
      }

      var aegisLeft = run.buffs.aegis;
      if (aegisLeft > 0) {
        var aegisFrac = clamp(aegisLeft / BONUS_BY_KEY.aegis.cap, 0, 1);
        this.unpark(this.aegisShell); this.unpark(this.aegisTimerRing);
        this.aegisShell.setPosition(p.x, p.y)
          .setDisplaySize(104 + Math.sin(run.time * 7) * 6, 104 + Math.sin(run.time * 7) * 6)
          .setAlpha(0.38 + aegisFrac * 0.42)
          .setRotation(run.time * 0.75);
        this.aegisTimerRing.setPosition(p.x, p.y)
          .setDisplaySize(76 + aegisFrac * 30, 76 + aegisFrac * 30)
          .setAlpha(0.22 + aegisFrac * 0.66)
          .setRotation(-run.time * 1.25);
      } else {
        this.park(this.aegisShell); this.park(this.aegisTimerRing);
      }

      this.fx.trail.setScale(0.72 + thrust * 0.9 + (run.buffs.overdrive > 0 ? 0.48 : 0));
      if (p.moving && this.state === 'playing') {
        this.trailT = (this.trailT || 0) - dt;
        if (this.trailT <= 0) {
          this.trailT = (run.buffs.overdrive > 0 ? 0.045 : 0.07) - thrust * 0.02;
          this.fx.trail.emitParticleAt(p.x - Math.cos(p.face) * 16, p.y - Math.sin(p.face) * 16, 1);
        }
      }

      if (this.purgeT > 0) {
        var purgeElapsed = this.purgeDur - this.purgeT;
        var purgeF = clamp(purgeElapsed / this.purgeDur, 0, 1);
        var quietPurge = !kit.juice.enabled;
        var maxPurge = Math.sqrt(w * w + h * h) * (quietPurge ? 1.08 : 1.42);
        this.unpark(this.purgeShock); this.unpark(this.purgeFlash);
        var preF = clamp(purgeElapsed / (this.purgePre || 0.2), 0, 1);
        this.purgeShock.setPosition(w / 2, h / 2)
          .setDisplaySize(34 + maxPurge * clamp((purgeElapsed - this.purgePre) / (this.purgeDur - this.purgePre), 0, 1),
            34 + maxPurge * clamp((purgeElapsed - this.purgePre) / (this.purgeDur - this.purgePre), 0, 1))
          .setAlpha((quietPurge ? 0.32 : 0.78) * (1 - purgeF) * (purgeElapsed > this.purgePre ? 1 : 0));
        this.purgeFlash.setPosition(w / 2, h / 2)
          .setDisplaySize(w * (0.72 + preF * 0.34), h * (0.72 + preF * 0.34))
          .setAlpha((quietPurge ? 0.12 : 0.42) * (1 - preF) * (purgeElapsed <= this.purgePre ? 1 : 0));
        for (var pri2 = 0; pri2 < this.purgeRings.length; pri2++) {
          var prg = this.purgeRings[pri2];
          if (!prg.alive) continue;
          var ringF = clamp((purgeElapsed - this.purgePre - pri2 * 0.08) /
            (this.purgeDur - this.purgePre), 0, 1);
          prg.spr.setPosition(w / 2, h / 2)
            .setDisplaySize(24 + maxPurge * ringF, 24 + maxPurge * ringF)
            .setAlpha((quietPurge ? 0.28 : 0.72) * (1 - ringF));
        }
      }

      if (this.buffGlowT > 0 && kit.juice.enabled && !this.spectacle.active) {
        this.unpark(this.buffGlowEdges[0]);
        var glowAlpha = clamp(this.buffGlowT / 0.48, 0, 1) * 0.72;
        for (var bgi = 0; bgi < this.buffGlowEdges.length; bgi++) {
          var ge = this.buffGlowEdges[bgi];
          this.unpark(ge);
          ge.setTint(this.buffGlowColor || 0x8effd8).setAlpha(glowAlpha);
        }
      } else {
        for (var bgi2 = 0; bgi2 < this.buffGlowEdges.length; bgi2++) this.park(this.buffGlowEdges[bgi2]);
      }

      if (this.strike.active || this.strike.afterT > 0) {
        var stf = this.strike.active ? clamp(this.strike.t / this.strike.dur, 0, 1) :
          clamp(this.strike.afterT / 0.34, 0, 1);
        var stx = this.strike.x + Math.cos(this.strike.ang) * this.strike.len * 0.5;
        var sty = this.strike.y + Math.sin(this.strike.ang) * this.strike.len * 0.5;
        if (this.strike.active) {
          this.unpark(this.strike.line); this.unpark(this.strike.flash);
          this.strike.line.setPosition(stx, sty).setRotation(this.strike.ang)
            .setDisplaySize(this.strike.len, 6 + stf * 14)
            .setAlpha(0.18 + stf * 0.7);
          this.strike.flash.setPosition(stx, sty)
            .setDisplaySize(80 + stf * 240, 80 + stf * 240)
            .setAlpha(0.06 + stf * 0.2);
        } else { this.park(this.strike.line); this.park(this.strike.flash); }
        if (kit.juice.enabled) {
          var skyLen = Math.sqrt(w * w + h * h) * 1.55;
          this.unpark(this.strike.skyLine); this.unpark(this.strike.skyGlow);
          this.strike.skyLine.setPosition(w / 2, h / 2).setRotation(this.strike.ang)
            .setDisplaySize(skyLen, 10 + stf * 28).setTint(0xffe7a6)
            .setAlpha(0.18 + stf * 0.66);
          this.strike.skyGlow.setPosition(w / 2, h / 2).setTint(0xffd67a)
            .setDisplaySize(w * (0.42 + stf * 0.72), h * (0.42 + stf * 0.72))
            .setAlpha(0.06 + stf * 0.14);
        } else {
          this.park(this.strike.skyLine); this.park(this.strike.skyGlow);
        }
      } else {
        this.park(this.strike.skyLine); this.park(this.strike.skyGlow);
      }

      var orbitRank = p.ranks.orbit || 0;
      var obCount = orbitRank > 0 ? Math.min(8, 1 + orbitRank) : 0;
      var obRad = 44 + orbitRank * 4;
      for (var b = 0; b < this.orbitBlades.length; b++) {
        var bl = this.orbitBlades[b];
        if (b >= obCount) { this.park(bl); continue; }
        var a = this.orbitAngle + b * TAU / obCount;
        this.unpark(bl);
        bl.setPosition(p.x + Math.cos(a) * obRad, p.y + Math.sin(a) * obRad)
          .setRotation(a + Math.PI / 2)
          .setScale(1 + Math.sin(run.time * 8 + b) * 0.08);
      }

      var danger = 0;
      for (var ei = 0; ei < this.enemies.length; ei++) {
        var e = this.enemies[ei];
        if (!e.alive) continue;
        var ddx0 = e.x - p.x, ddy0 = e.y - p.y;
        if (ddx0 * ddx0 + ddy0 * ddy0 < 180 * 180) danger += e.boss ? 6 : (e.elite ? 3 : 1);
        if (e.squash > 0) e.squash = Math.max(0, e.squash - dt * 3.4);
        if (e.wind > 0) e.wind = Math.max(0, e.wind - dt);
        if (e.phaseBeat > 0) e.phaseBeat = Math.max(0, e.phaseBeat - dt);
        if (Math.abs(e.x - cmx) > cullX + e.r || Math.abs(e.y - cmy) > cullY + e.r) {
          this.park(e.spr); this.park(e.aura); continue;
        }
        var s = e.spr;
        this.unpark(s);
        s.setPosition(e.x, e.y);
        if (e.flash > 0) s.setTintFill(0xffffff);
        else s.setTint(e.tint);

        var baseScale = e.regionBoss ? 1.28 : (e.boss ? 1 : (e.elite ? 1.3 : 1));
        if (e.regionBoss) {
          s.setRotation(Math.atan2(p.y - e.y, p.x - e.x) + Math.sin(run.time * 1.8 + e.phase) * 0.04);
        } else if (e.fam === 'sprinter' || e.fam === 'lancer' || e.behavior === 'kamikaze' ||
            e.behavior === 'blink' || e.behavior === 'salvage-dash' || e.behavior === 'refract-drone') {
          s.setRotation(Math.atan2(p.y - e.y, p.x - e.x));
        } else if (e.boss) {
          s.setRotation(s.rotation + dt * 0.35);
          baseScale *= 1 + (e.wind > 0 ? Math.sin((0.86 - e.wind) / 0.86 * Math.PI) * 0.2 : 0);
          baseScale *= 1 + (e.phaseBeat > 0 ? Math.sin((1.05 - e.phaseBeat) / 1.05 * Math.PI) * 0.28 : 0);
        } else if (e.fam === 'sapper') {
          s.setRotation(e.phase + run.time * 0.8);
        } else if (e.fam === 'bulwark') {
          s.setRotation(e.phase * 0.12 + Math.sin(run.time * 0.8 + e.phase) * 0.05);
        } else {
          s.setRotation(e.phase + Math.sin(run.time * 0.9 + e.phase) * 0.35);
        }
        if (e.regionBoss) {
          baseScale *= 1 + Math.sin(run.time * 3.4 + e.phase) * 0.06 + (e.latchT > 0 ? 0.08 : 0);
        } else if (e.fam === 'drifter') {
          baseScale *= 1 + Math.sin(run.time * 2.4 + e.phase) * 0.07;   // breathing blob
        } else if (e.fam === 'weaver') {
          baseScale *= 1 + Math.sin(run.time * 6.2 + e.phase) * 0.06;   // fluttering star
        } else if (e.fam === 'sprinter') {
          baseScale *= 1 + Math.sin(run.time * 9 + e.phase) * 0.05;     // lunging gait
        } else if (e.fam === 'bulwark') {
          baseScale *= 1 + Math.sin(run.time * 1.2 + e.phase) * 0.025;
        } else if (e.fam === 'sapper') {
          baseScale *= 1 + Math.sin(run.time * 4.8 + e.phase) * 0.08;
        } else if (e.fam === 'lancer' || e.behavior === 'refract-drone') {
          baseScale *= 1 + Math.sin(run.time * 3.1 + e.phase) * 0.035;
        } else if (e.behavior === 'wraith' || e.behavior === 'null-leech') {
          baseScale *= 1 + Math.sin(run.time * 5.5 + e.phase) * 0.12;
        } else if (e.behavior === 'gravity-mite' || e.behavior === 'salvage') {
          baseScale *= 1 + Math.sin(run.time * 8.2 + e.phase) * 0.08;
        } else if (e.egg) {
          baseScale *= 1 + Math.sin(run.time * 4.4 + e.phase) * 0.06;
        }
        if (e.squash > 0) {
          var q = e.squash;
          s.setScale(baseScale * (1 + q * 0.55), baseScale * (1 - q * 0.35));
          s.x += Math.cos(e.squashA) * q * 18;
          s.y += Math.sin(e.squashA) * q * 18;
        } else {
          s.setScale(baseScale);
        }
        if (e.elite || e.boss) {
          this.unpark(e.aura);
          e.aura.setPosition(e.x, e.y)
            .setRotation(e.aura.rotation + dt * (e.boss ? 0.5 : 1.1))
            .setAlpha(0.5 + Math.sin(run.time * 4 + e.phase) * 0.2);
        }
      }

      var insect = this.regionBossRef;
      if (insect && insect.alive && Math.abs(insect.x - cmx) <= cullX + 180 && Math.abs(insect.y - cmy) <= cullY + 180) {
        var ib = this.regionBossParts, idef = REGION_BOSS_BY_BOSS_KEY[insect.bossKey];
        var insectColor = idef ? idef.tint : 0x8effd8;
        var insectAng = Math.atan2(p.y - insect.y, p.x - insect.x);
        this.unpark(ib.wingL); this.unpark(ib.wingR); this.unpark(ib.abdomen); this.unpark(ib.proboscis);
        ib.wingL.setPosition(insect.x - 38, insect.y - 8).setRotation(insectAng - 0.55)
          .setDisplaySize(96, 48).setTint(insectColor).setAlpha(0.52 + Math.sin(run.time * 14) * 0.14);
        ib.wingR.setPosition(insect.x + 38, insect.y - 8).setRotation(insectAng + 0.55)
          .setDisplaySize(96, 48).setTint(insectColor).setAlpha(0.52 + Math.sin(run.time * 14 + 1) * 0.14);
        ib.abdomen.setPosition(insect.x - Math.cos(insectAng) * 54, insect.y - Math.sin(insectAng) * 54)
          .setDisplaySize(56, 112).setRotation(insectAng).setTint(0x351525).setAlpha(0.9);
        ib.proboscis.setPosition(insect.x + Math.cos(insectAng) * 70, insect.y + Math.sin(insectAng) * 70)
          .setDisplaySize(18, 122).setRotation(insectAng + Math.PI / 2)
          .setTint(insect.latchT > 0 ? 0xffd67a : insectColor).setAlpha(0.94);
      } else {
        this.park(this.regionBossParts.wingL); this.park(this.regionBossParts.wingR);
        this.park(this.regionBossParts.abdomen); this.park(this.regionBossParts.proboscis);
      }

      for (var pi2 = 0; pi2 < this.hpPips.length; pi2++) {
        var pip = this.hpPips[pi2];
        var o = pip.owner;
        if (!o || !o.alive || o.boss ||
            Math.abs(o.x - cmx) > cullX || Math.abs(o.y - cmy) > cullY) {
          if (!o || !o.alive) pip.owner = null;
          this.park(pip.bg); this.park(pip.fill); this.park(pip.crown);
          continue;
        }
        this.unpark(pip.bg); this.unpark(pip.fill); this.unpark(pip.crown);
        pip.crown.setPosition(o.x, o.y - o.r - 14 - Math.sin(run.time * 3 + o.phase) * 2);
        var pw = 42, py2 = o.y - o.r - 26;
        pip.bg.setPosition(o.x, py2).setDisplaySize(pw + 6, 9).setAlpha(0.85);
        var frac = clamp(o.hp / o.maxHp, 0, 1);
        pip.fill.setPosition(o.x - pw / 2, py2).setOrigin(0, 0.5)
          .setDisplaySize(pw * frac, 5)
          .setTint(frac > 0.5 ? 0xffd67a : (frac > 0.22 ? 0xff9a5a : 0xff5a6a))
          .setAlpha(0.95);
      }

      for (var ri = 0; ri < this.rings.length; ri++) {
        var rg = this.rings[ri];
        if (!rg.alive) continue;
        rg.t += dt;
        var f2 = clamp(rg.t / rg.dur, 0, 1);
        var eased = 1 - (1 - f2) * (1 - f2) * (1 - f2);
        var sz = rg.from + (rg.to - rg.from) * eased;
        rg.spr.setDisplaySize(sz, sz).setAlpha(rg.alpha * (1 - f2));
        if (f2 >= 1) this.killSprite(rg);
      }
      for (var hi = 0; hi < this.husks.length; hi++) {
        var hk = this.husks[hi];
        if (!hk.alive) continue;
        hk.t += dt;
        var f3 = clamp(hk.t / hk.dur, 0, 1);
        hk.spr.setRotation(hk.spr.rotation + hk.spin * dt)
          .setScale(hk.scale0 * (1 + f3 * 0.35) * (1 - f3 * 0.9))
          .setAlpha((1 - f3) * 0.9);
        if (f3 >= 1) this.killSprite(hk);
      }

      if (this.telZone) {
        this.telT = (this.telT || 0) + dt;
        var tf = clamp(this.telT / (this.telDur || 3), 0, 1);
        this.telZone.setAlpha(0.25 + tf * 0.5 + Math.sin(run.time * 9) * 0.06 * tf)
          .setScale(0.5 + tf * 1.5)
          .setRotation(this.telZone.rotation + dt * 0.6);
        if (this.telRing) {
          this.telRing.setScale(7 - tf * 6).setAlpha(0.35 + tf * 0.55);
        }
        if (this.telCount) {
          var beat = 1 - (this.telT % 1);
          this.telCount.setScale(1 + beat * 0.5).setAlpha(0.35 + beat * 0.6);
        }
      }
      if (this.bossSpokeCount > 0) {
        for (var sp2 = 0; sp2 < this.bossSpokeCount; sp2++) {
          var spk = this.bossSpokes[sp2];
          spk.setAlpha(Math.min(0.55, spk.alpha + dt * 1.4));
          if (this.bossRef) {
            var aa = spk.rotation;
            spk.setPosition(this.bossRef.x + Math.cos(aa) * 150,
                            this.bossRef.y + Math.sin(aa) * 150);
          }
        }
      }

      var k;
      for (k = 0; k < this.shots.length; k++) {
        var sh = this.shots[k];
        if (!sh.alive) continue;
        if (Math.abs(sh.x - cmx) > cullX || Math.abs(sh.y - cmy) > cullY) { this.park(sh.spr); continue; }
        this.unpark(sh.spr);
        sh.spr.setPosition(sh.x, sh.y);
        if (sh.kind === 'seeker' || sh.kind === 'swarm-dart' || sh.kind === 'drone' || sh.kind === 'wisp') {
          sh.spr.setScale(sh.visualScale * (1 + Math.sin(run.time * 14 + sh.variant) * 0.13));
        } else if (sh.kind === 'cyclone-glaive') {
          sh.spr.setRotation(sh.orbitAngle + Math.PI / 2)
            .setScale(sh.visualScale * (1.08 + Math.sin(run.time * 12) * 0.10));
        } else if (sh.kind === 'coil-tempest') {
          sh.spr.setRotation(Math.atan2(sh.vy, sh.vx))
            .setScale(sh.visualScale * (1.15 + Math.sin(run.time * 24) * 0.18));
        } else if (sh.kind === 'nova-scatter' || sh.kind === 'prism-ricochet') {
          sh.spr.setRotation(Math.atan2(sh.vy, sh.vx))
            .setScale(sh.visualScale * (1 + Math.sin(run.time * 18 + sh.x * 0.01) * 0.12));
        } else sh.spr.setRotation(Math.atan2(sh.vy, sh.vx));
      }
      for (k = 0; k < this.ebolts.length; k++) {
        var eb = this.ebolts[k];
        if (!eb.alive) continue;
        if (Math.abs(eb.x - cmx) > cullX || Math.abs(eb.y - cmy) > cullY) { this.park(eb.spr); continue; }
        this.unpark(eb.spr);
        eb.spr.setPosition(eb.x, eb.y).setScale(1 + Math.sin(run.time * 16) * 0.16);
      }
      for (k = 0; k < this.arcLines.length; k++) {
        var ar = this.arcLines[k];
        if (!ar.alive) continue;
        if ((Math.abs((ar.x1 + ar.x2) * 0.5 - cmx) > cullX) ||
            (Math.abs((ar.y1 + ar.y2) * 0.5 - cmy) > cullY)) {
          this.park(ar.spr); continue;
        }
        this.unpark(ar.spr);
        ar.spr.setAlpha(clamp(ar.life / 0.12, 0, 1));
      }
      for (k = 0; k < this.mines.length; k++) {
        var mn = this.mines[k];
        if (!mn.alive) continue;
        if (Math.abs(mn.x - cmx) > cullX || Math.abs(mn.y - cmy) > cullY) { this.park(mn.spr); continue; }
        this.unpark(mn.spr);
        var urgency = 1 - clamp(mn.fuse / 1.4, 0, 1);
        mn.spr.setPosition(mn.x, mn.y)
          .setAlpha(0.55 + Math.abs(Math.sin(run.time * (6 + urgency * 22))) * 0.45)
          .setScale(0.45 + urgency * 0.14);
      }
      for (k = 0; k < this.pulses.length; k++) {
        var pu = this.pulses[k];
        if (!pu.alive) continue;
        pu.spr.setPosition(pu.x, pu.y)
          .setDisplaySize(pu.r * (pu.mode === 'rolling' ? 2.58 : (pu.mode === 'nova' ? 2.42 : 2.3)),
            pu.r * (pu.mode === 'rolling' ? 2.58 : (pu.mode === 'nova' ? 2.42 : 2.3)))
          .setAlpha(clamp(1 - pu.r / pu.max, 0.05, 0.85));
      }
      for (k = 0; k < this.beams.length; k++) {
        var bm = this.beams[k];
        if (!bm.alive) continue;
        var lf = clamp(bm.life / 0.34, 0, 1);
        bm.spr.setPosition(bm.x + Math.cos(bm.ang) * bm.len / 2, bm.y + Math.sin(bm.ang) * bm.len / 2)
          .setDisplaySize(bm.len, bm.wid * lf).setAlpha(lf * 0.95);
      }
      for (k = 0; k < this.gems.length; k++) {
        var g = this.gems[k];
        if (!g.alive) continue;
        if (Math.abs(g.x - cmx) > cullX || Math.abs(g.y - cmy) > cullY) { this.park(g.spr); continue; }
        this.unpark(g.spr);
        var pulseF = 1 + Math.sin(run.time * 6 + g.x * 0.03) * 0.14;
        var speed2 = g.vx * g.vx + g.vy * g.vy;
        g.spr.setPosition(g.x, g.y)
          .setScale(pulseF, pulseF * (1 + Math.sin(run.time * 7 + g.y * 0.02) * 0.08))
          .setRotation(Math.sin(run.time * 2 + g.x * 0.02) * 0.12)
          .setAlpha(0.85 + Math.sin(run.time * 8 + g.y * 0.02) * 0.15);
        if (speed2 > 90000) {
          this.gemTrailT = (this.gemTrailT || 0) - dt;
          if (this.gemTrailT <= 0) {
            this.gemTrailT = 0.05;
            this.fx.gem.setParticleTint([0x8fe7ff, 0xa7ffe0, 0xffd07a][g.tier]);
            this.fx.gem.emitParticleAt(g.x, g.y, 1);
          }
        }
      }
      for (k = 0; k < this.bonuses.length; k++) {
        var bo = this.bonuses[k];
        if (!bo.alive) continue;
        if (Math.abs(bo.x - cmx) > cullX || Math.abs(bo.y - cmy) > cullY) {
          this.park(bo.spr); this.park(bo.halo); this.park(bo.beacon);
          this.park(bo.ring); this.park(bo.crown); continue;
        }
        this.unpark(bo.spr); this.unpark(bo.halo); this.unpark(bo.beacon);
        var bd = bo.tide ? TIDE_BY_KEY[bo.kind] : BONUS_BY_KEY[bo.kind];
        var blink = bo.life < 4 && Math.floor(run.time * 12) % 2;
        var bob = 1 + Math.sin(run.time * 5 + bo.born) * 0.08;
        bo.spr.setPosition(bo.x, bo.y).setScale((bo.tide ? 1.15 : 1.0) * bob)
          .setRotation(run.time * 0.55 + bo.born * 0.2)
          .setTint(bd.color).setAlpha(blink ? 0.22 : 1);
        if (bo.tide) {
          var tidePulse = 1 + Math.sin(run.time * 5.2 + bo.born) * 0.08;
          this.unpark(bo.ring); this.unpark(bo.crown);
          bo.halo.setPosition(bo.x, bo.y).setDisplaySize(144 * tidePulse, 144 * tidePulse)
            .setTint(0xffd67a).setAlpha(blink ? 0.08 : 0.22 + Math.sin(run.time * 4 + bo.born) * 0.06);
          bo.ring.setPosition(bo.x, bo.y)
            .setDisplaySize(132 + Math.sin(run.time * 7 + bo.born) * 12,
              132 + Math.sin(run.time * 7 + bo.born) * 12)
            .setTint(0xffd67a).setAlpha(blink ? 0.12 : 0.68 + Math.sin(run.time * 4.5) * 0.10)
            .setRotation(run.time * 0.42);
          bo.crown.setPosition(bo.x, bo.y - 30 - Math.sin(run.time * 5 + bo.born) * 3)
            .setTint(0xfff8d98d).setAlpha(blink ? 0.16 : 0.92).setScale(0.72 * tidePulse)
            .setRotation(Math.sin(run.time * 2.2) * 0.08);
          bo.beacon.setPosition(bo.x, bo.y - 72)
            .setDisplaySize(12 + Math.sin(run.time * 8 + bo.born) * 3,
              142 + Math.sin(run.time * 5 + bo.born) * 18)
            .setTint(Math.sin(run.time * 6) > 0 ? 0xffffff : 0xffd67a)
            .setAlpha(blink ? 0.10 : 0.48 + Math.sin(run.time * 7) * 0.10);
        } else {
          this.park(bo.ring); this.park(bo.crown);
          bo.halo.setPosition(bo.x, bo.y)
            .setDisplaySize(108 + Math.sin(run.time * 6 + bo.born) * 10, 108 + Math.sin(run.time * 6 + bo.born) * 10)
            .setTint(bd.color).setAlpha(blink ? 0.08 : 0.25 + Math.sin(run.time * 4 + bo.born) * 0.08);
          bo.beacon.setPosition(bo.x, bo.y - 54)
            .setDisplaySize(7 + Math.sin(run.time * 8 + bo.born) * 2,
              108 + Math.sin(run.time * 5 + bo.born) * 14)
            .setTint(bd.color).setAlpha(blink ? 0.08 : 0.3 + Math.sin(run.time * 7 + bo.born) * 0.08);
        }
      }
      for (k = 0; k < this.weaponDrops.length; k++) {
        var wd = this.weaponDrops[k];
        if (!wd.alive) continue;
        if (Math.abs(wd.x - cmx) > cullX || Math.abs(wd.y - cmy) > cullY) {
          this.park(wd.spr); this.park(wd.ring); this.park(wd.beacon); continue;
        }
        this.unpark(wd.spr); this.unpark(wd.ring); this.unpark(wd.beacon);
        var wdata = WEAPON_BY_KEY[wd.weapon];
        var goldDrop = wdata.tier === 'upgraded';
        var wblink = wd.life < 4 && Math.floor(run.time * 12) % 2;
        var wbob = 1 + Math.sin(run.time * 5.6 + wd.born) * 0.10;
        wd.spr.setPosition(wd.x, wd.y).setScale((goldDrop ? 1.02 : 0.9) * wbob)
          .setRotation(-run.time * 0.7 + wd.born * 0.18)
          .setTint(goldDrop ? 0xfff0b0 : wdata.color).setAlpha(wblink ? 0.24 : 1);
        wd.ring.setPosition(wd.x, wd.y)
          .setDisplaySize((goldDrop ? 98 : 78) + Math.sin(run.time * 7 + wd.born) * (goldDrop ? 11 : 9),
            (goldDrop ? 98 : 78) + Math.sin(run.time * 7 + wd.born) * (goldDrop ? 11 : 9))
          .setTint(goldDrop ? 0xffd67a : wdata.color).setAlpha(wblink ? 0.10 : (goldDrop ? 0.74 : 0.42) + Math.sin(run.time * 4.5 + wd.born) * 0.08)
          .setRotation(run.time * 0.38);
        wd.beacon.setPosition(wd.x, wd.y - 58)
          .setDisplaySize(9 + Math.sin(run.time * 8 + wd.born) * 2, 118 + Math.sin(run.time * 5 + wd.born) * 14)
          .setTint(goldDrop ? 0xffd67a : wdata.color).setAlpha(wblink ? 0.08 : (goldDrop ? 0.62 : 0.42) + Math.sin(run.time * 7 + wd.born) * 0.08);
      }
      for (k = 0; k < this.texts.length; k++) {
        var tx = this.texts[k];
        if (!tx.alive) continue;
        tx.life -= dt;
        tx.obj.y += tx.vy * dt;
        tx.vy *= 0.94;
        if (tx.pop < 1) {
          tx.pop = Math.min(1, tx.pop + dt * 5);
          var q = 1 - tx.pop;
          tx.obj.setScale(0.6 + 0.4 * (1 - q * q * q) + Math.sin(tx.pop * Math.PI) * 0.12);
        }
        tx.obj.setAlpha(clamp(tx.life / 0.5, 0, 1));
        if (tx.life <= 0) { tx.alive = false; this.park(tx.obj); }
      }

      run.danger += (Math.min(1, danger / 16) - run.danger) * Math.min(1, dt * 2);
      this.tidePressure();
      var tideEdge = clamp(run.tideWeight, 0, 1);
      var dEdge = Math.max(run.danger * 0.55, tideEdge * 0.16);
      var edgeTint = mixColor(0xff5a4a, 0xffd67a, tideEdge);
      var pulse2 = 1 + Math.sin(run.time * 7) * 0.18 * run.danger;
      for (var de = 0; de < this.dangerEdges.length; de++) {
        var ed = this.dangerEdges[de];
        if (dEdge < 0.01) { if (ed.visible) ed.setVisible(false); continue; }
        if (!ed.visible) ed.setVisible(true);
        ed.setTint(edgeTint).setAlpha(dEdge * pulse2);
      }
      if (this.state === 'playing') {
        var wantHeat = run.danger > 0.55 || run.bossUp;
        if (wantHeat && !run.musicHeat) { kit.audio.music('musicHeat', 1400); run.musicHeat = true; }
        else if (!wantHeat && run.musicHeat && run.danger < 0.22 && !run.bossUp) {
          kit.audio.music('musicBase', 1800); run.musicHeat = false;
        }
      }

      if (this.tutorial && this.tutHand && this.tutTarget) {
        var tt = this.tutTarget;
        if (tt.screen) {
          this.tutHand.setScrollFactor(0).setPosition(w / 2, h * 0.5);
        } else {
          this.tutHand.setScrollFactor(1)
            .setPosition(tt.x, tt.y)
            .setDisplaySize(96 + Math.sin(run.time * 4) * 12, 96 + Math.sin(run.time * 4) * 12);
        }
      }

      this.updateMinimap(dt);
      this.stepHudPops(dt);
      this.updateHud();
      this.updateDebugState();
    },

    renderAmbient: function (cmx, cmy, cullX, cullY) {
      for (var i = 0; i < this.ambientEvents.length; i++) {
        var ev = this.ambientEvents[i];
        if (!ev.alive || Math.abs(ev.x - cmx) > cullX + 80 || Math.abs(ev.y - cmy) > cullY + 80) {
          if (!ev.alive || !ev.spr.parkedOut) this.park(ev.spr);
          continue;
        }
        this.unpark(ev.spr);
        var fade = (ev.kind === 'meteor' || ev.kind === 'rift' || ev.kind === 'shard') ?
          clamp(ev.life / 0.45, 0, 1) : clamp(ev.life / 1.5, 0, 1);
        ev.spr.setPosition(ev.x, ev.y).setRotation(ev.rot)
          .setTint(ev.tint).setAlpha(fade * (ev.kind === 'convoy' ? 0.7 : (ev.kind === 'skirmish' ? 0.84 : 0.95)));
      }
    },

    renderBases: function (run, cmx, cmy, cullX, cullY) {
      for (var i = 0; i < this.bases.length; i++) {
        var b = this.bases[i];
        if (!b.alive && !b.destroying) continue;
        var data = BASE_TYPES[b.type];
        if (Math.abs(b.x - cmx) > cullX + b.r || Math.abs(b.y - cmy) > cullY + b.r) {
          this.park(b.spr); this.park(b.ring); this.park(b.alarmSpr);
          this.park(b.pillar);
          this.park(b.barBg); this.park(b.barFill);
          continue;
        }
        this.unpark(b.spr); this.unpark(b.ring); this.unpark(b.alarmSpr); this.park(b.pillar);
        this.unpark(b.barBg); this.unpark(b.barFill);
        if (b.destroying) {
          var collapseF = clamp((1.45 - b.collapseT) / 1.45, 0, 1);
          var collapsePulse = 1 + Math.sin(collapseF * Math.PI * 7) * (1 - collapseF) * 0.12;
          b.spr.setPosition(b.x, b.y).setRotation(collapseF * 1.8)
            .setScale(data.scale * (1 + collapseF * 0.42) * collapsePulse)
            .setTint(collapseF > 0.55 ? 0xffd67a : data.color)
            .setAlpha(1 - collapseF * 0.62);
          b.ring.setPosition(b.x, b.y).setDisplaySize(data.r * (2.1 + collapseF * 2.4),
            data.r * (2.1 + collapseF * 2.4)).setTint(data.color).setAlpha(0.6 * (1 - collapseF));
          b.alarmSpr.setPosition(b.x, b.y).setDisplaySize(data.r * 2.4, data.r * 2.4)
            .setTint(0xffd67a).setAlpha(0.45 * (1 - collapseF));
          this.unpark(b.pillar);
          b.pillar.setPosition(b.x, b.y - data.r * 1.45)
            .setDisplaySize(14 + collapseF * 16, data.r * (3.4 + collapseF * 3.4))
            .setTint(collapseF > 0.42 ? 0xffd67a : data.color)
            .setAlpha((kit.juice.enabled ? 0.26 : 0.12) * (1 - collapseF * 0.62));
          this.park(b.barBg); this.park(b.barFill);
          continue;
        }
        var frac = clamp(b.hp / b.maxHp, 0, 1);
        var alarm = b.alarm * (0.55 + Math.abs(Math.sin(run.time * 5.5 + i)) * 0.45);
        var hurtTint = b.flash > 0 ? 0xffffff : (frac > 0.66 ? data.color : (frac > 0.32 ? 0xffc361 : 0xff5a6a));
        b.spr.setPosition(b.x, b.y).setRotation(Math.sin(run.time * 0.7 + i) * 0.04)
          .setScale(data.scale * (1 + Math.sin(run.time * 3.5 + i) * 0.035))
          .setTint(hurtTint).setAlpha(1);
        b.ring.setPosition(b.x, b.y)
          .setDisplaySize(data.r * (2.65 + Math.sin(run.time * 3 + i) * 0.12),
            data.r * (2.65 + Math.sin(run.time * 3 + i) * 0.12))
          .setTint(frac > 0.32 ? data.color : 0xff5a6a).setAlpha(0.28 + (1 - frac) * 0.24);
        b.alarmSpr.setPosition(b.x, b.y)
          .setDisplaySize(data.r * (2.15 + Math.sin(run.time * 7 + i) * 0.08),
            data.r * (2.15 + Math.sin(run.time * 7 + i) * 0.08))
          .setTint(frac > 0.32 ? 0xff5a6a : 0xffffff).setAlpha(alarm * 0.5);
        b.barBg.setPosition(b.x, b.y - b.r - 30).setDisplaySize(88, 10).setAlpha(0.9);
        b.barFill.setPosition(b.x - 41, b.y - b.r - 30).setOrigin(0, 0.5)
          .setDisplaySize(82 * frac, 5).setTint(hurtTint).setAlpha(0.96);
      }
    },

    renderFormation: function (dt, run, cmx, cmy, cullX, cullY) {
      var arsenal = run.buffs.arsenal > 0;
      var trimColor = (TRIM_BY_KEY[profile.hangar.trim] || TRIMS[0]).color;
      for (var i = 0; i < this.wings.length; i++) {
        var w = this.wings[i];
        if (!w.alive) continue;
        if (Math.abs(w.x - cmx) > cullX || Math.abs(w.y - cmy) > cullY) {
          this.park(w.spr); this.park(w.halo); continue;
        }
        this.unpark(w.spr); this.unpark(w.halo);
        var target = w.moving ? w.face : this.p.face;
        var diff = Phaser.Math.Angle.Wrap(target - w.heading);
        w.heading += diff * Math.min(1, dt * 12);
        w.bank += (clamp(diff * 2.4, -0.3, 0.3) - w.bank) * Math.min(1, dt * 14);
        var pulse = 1 + Math.sin(run.time * 4.5 + i) * 0.06;
        var joinF = w.joinT > 0 ? 1 - clamp(w.joinT / w.joinDur, 0, 1) : 1;
        w.spr.setPosition(w.x, w.y)
          .setRotation(w.heading + w.bank)
          .setScale((0.72 + w.thrust * 0.08 + (1 - joinF) * 0.12) * pulse)
          .setTint(arsenal ? 0xffd67a : 0xffffff)
          .setAlpha(0.78 + joinF * 0.22);
        w.halo.setPosition(w.x, w.y)
          .setDisplaySize((64 + w.thrust * 12 + (1 - joinF) * 20) * pulse,
            (64 + w.thrust * 12 + (1 - joinF) * 20) * pulse)
          .setTint(arsenal ? 0xffd67a : trimColor)
          .setAlpha(0.2 + w.thrust * 0.10 + (1 - joinF) * 0.12);
      }
    },

    updateDebugState: function () {
      var st = this.debugState;
      if (!st || !this.run) return;
      updateHangarDebugState(st);
      st.currentWave = this.run.wave;
      st.wingCount = this.run.wings || 0;
      st.weaponDropsSpawned = this.run.weaponDrops || 0;
      st.region = this.run.regionKey || 'meridian-verge';
      st.regionsSeen = this.run.regionsSeen || 1;
      st.regionEnemiesSeen = this.run.regionEnemiesSeen || {};
      st.regionBossActive = this.run.regionBossActive || '';
      st.campaign.levelId = this.level ? this.level.id : 0;
      st.campaign.unlocked = profile.campaign.unlocked;
      st.campaign.totalStars = window.__HM_CAMPAIGN.totalStars();
      st.campaign.objectiveCount = this.run.campaignObjs.length;
      for (var co0 = 0; co0 < st.campaign.objectives.length; co0++) {
        var coRec = st.campaign.objectives[co0], coSrc = this.run.campaignObjs[co0];
        coRec.id = coSrc ? coSrc.id : '';
        coRec.type = coSrc ? coSrc.type : '';
        coRec.progress = coSrc ? Math.floor(coSrc.progress) : 0;
        coRec.count = coSrc ? coSrc.count : 0;
        coRec.done = coSrc ? coSrc.done : false;
      }
      if (!st.weaponSlots) st.weaponSlots = ['', '', ''];
      for (var ws0 = 0; ws0 < 3; ws0++) st.weaponSlots[ws0] = this.run.weaponSlots[ws0] || '';
      st.slotsUnlocked = this.run.slotsUnlocked || 1;
      st.equippedWeapon = this.run.equippedWeapon;
      st.weaponsSeen = this.run.weaponsSeen;
      st.tideOdds = this.tidePressure();
      st.lastTideTurner = this.run.lastTideTurner || '';
      var active = st.activeBuffs;
      for (var i = 0; i < BONUS_DEBUG_KEYS.length; i++) active[BONUS_DEBUG_KEYS[i]] = this.run.buffs[BONUS_DEBUG_KEYS[i]] || 0;
      active.overcharge = this.run.overcharge || 0;
      var pickupCount = 0;
      for (var j = 0; j < this.bonuses.length; j++) {
        var b = this.bonuses[j];
        if (!b.alive) continue;
        var rec = this.debugPickupRecords[pickupCount];
        rec.type = b.tide ? 'tide:' + b.kind : b.kind; rec.tier = b.tide ? 'tide' : 'bonus';
        rec.x = Math.round(b.x); rec.y = Math.round(b.y);
        st.livePickups[pickupCount++] = rec;
      }
      for (var wj = 0; wj < this.weaponDrops.length; wj++) {
        var wd = this.weaponDrops[wj];
        if (!wd.alive) continue;
        var wrec = this.debugPickupRecords[pickupCount];
        wrec.type = 'weapon:' + wd.weapon; wrec.tier = wd.tier || 'base';
        wrec.x = Math.round(wd.x); wrec.y = Math.round(wd.y);
        st.livePickups[pickupCount++] = wrec;
      }
      st.livePickups.length = pickupCount;
      var draftCount = 0;
      if (this.state === 'draft' && this.draftCards) {
        for (var di = 0; di < this.draftCards.length && di < this.debugDraftRecords.length; di++) {
          var draft = this.draftCards[di], drec = this.debugDraftRecords[di];
          drec.key = draft.key; drec.name = draft.name; drec.rarity = draft.rarity; drec.rank = this.p.ranks[draft.key] || 0;
          st.draftOptions[draftCount++] = drec;
        }
      }
      st.draftOptions.length = draftCount;
      var baseCount = 0;
      for (var k = 0; k < this.bases.length; k++) {
        var base = this.bases[k];
        if (!base.alive) continue;
        var brec = this.debugBaseRecords[baseCount];
        brec.type = base.type; brec.hp = Math.max(0, Math.round(base.hp));
        brec.x = Math.round(base.x); brec.y = Math.round(base.y);
        st.bases[baseCount++] = brec;
      }
      st.bases.length = baseCount;
    },

    updateObjectiveCompass: function () {
      if (!this.objectiveArrow || !this.run || !this.p) return;
      var run = this.run, p = this.p, tx = 0, ty = 0;
      var best = null, bestD = Infinity;
      if (run.bossUp && this.bossRef && this.bossRef.alive) {
        tx = this.bossRef.x; ty = this.bossRef.y;
      } else if (run.regionBossActive && this.regionBossRef && this.regionBossRef.alive) {
        tx = this.regionBossRef.x; ty = this.regionBossRef.y;
      } else if (run.bossPending) {
      } else {
        for (var i = 0; i < this.bases.length; i++) {
          var b = this.bases[i];
          if (!b.alive) continue;
          var bdx = b.x - p.x, bdy = b.y - p.y, bd = bdx * bdx + bdy * bdy;
          if (bd < bestD) { bestD = bd; best = b; }
        }
        if (best) {
          tx = best.x; ty = best.y;
        } else {
          for (var si = 0; si < this.activeBases.length; si++) {
            if (run.baseSpawned[si]) continue;
            tx = this.activeBases[si].x; ty = this.activeBases[si].y;
            break;
          }
        }
      }
      var objectiveColor = run.bossUp || run.bossPending ? '#efcfff' : (run.regionBossActive ? '#ffb47e' : '#ffd67a');
      this.objectiveArrow.setRotation(Math.atan2(ty - p.y, tx - p.x) + Math.PI / 2)
        .setTint(run.bossUp || run.bossPending ? 0xd6a4ff : (run.regionBossActive ? 0xffb47e : 0xffd67a));
      if (this.objectiveColor !== objectiveColor) {
        this.objectiveChevron.setColor(objectiveColor);
        this.objectiveColor = objectiveColor;
      }
    },

    updateMinimap: function (dt) {
      if (!this.minimap || this.state !== 'playing') return;
      this.minimapT -= dt;
      if (this.minimapT > 0) return;
      this.minimapT = 0.08;
      var range = REGION_WIDTH * 1.45, radius = 38, count = 0;
      var cx = 0, cy = 0;
      var region = regionAtX(this.p.x);
      setTextIfChanged(this.radarRegion, region.code);
      var radarColor = '#' + region.palette.border.toString(16).padStart(6, '0');
      if (this.radarRegionColor !== radarColor) {
        this.radarRegion.setColor(radarColor);
        this.radarRegionColor = radarColor;
      }
      this.radarRing.setTint(region.palette.border);
      for (var bi = 0; bi < this.bases.length && count < this.radarDots.length; bi++) {
        var base = this.bases[bi];
        if (!base.alive) continue;
        var bdx = base.x - this.p.x, bdy = base.y - this.p.y;
        var bd = Math.sqrt(bdx * bdx + bdy * bdy) || 1;
        var bs = Math.min(1, range / bd);
        var bdot = this.radarDots[count++];
        bdot.setPosition(cx + clamp(bdx * bs / range * radius, -radius, radius),
          cy + clamp(bdy * bs / range * radius, -radius, radius));
        bdot.setFillStyle(BASE_TYPES[base.type].color).setDisplaySize(9, 9)
          .setScale(base.type === 'bastion' ? 1.35 : 1.15)
          .setAlpha(bd > range ? 0.62 : 1).setVisible(true);
      }
      for (var pass = 0; pass < 2; pass++) {
        for (var i = 0; i < this.enemies.length && count < this.radarDots.length; i++) {
          var e = this.enemies[i];
          if (!e.alive || (pass === 0 ? (!e.elite && !e.boss) : (e.elite || e.boss))) continue;
          var dx = e.x - this.p.x, dy = e.y - this.p.y;
          var d = Math.sqrt(dx * dx + dy * dy) || 1;
          var scale = Math.min(1, range / d);
          var dot = this.radarDots[count++];
          dot.setPosition(cx + clamp(dx * scale / range * radius, -radius, radius),
            cy + clamp(dy * scale / range * radius, -radius, radius));
          dot.setFillStyle(e.boss ? 0xd6a4ff : (e.elite ? 0xffd67a : 0xff756a));
          dot.setDisplaySize(5, 5);
          dot.setScale(e.boss ? 2 : (e.elite ? 1.45 : 1));
          dot.setAlpha(d > range ? 0.48 : 0.9).setVisible(true);
        }
      }
      for (var j = count; j < this.radarDots.length; j++) this.radarDots[j].setVisible(false);
      this.radarPlayer.setPosition(cx, cy);
    },

    popHudText: function (obj, scale) {
      if (!kit.juice.enabled) return;
      obj._hmPopT = 0;
      obj._hmPopScale = scale || 1.2;
    },

    stepHudPops: function (dt) {
      for (var i = 0; i < this.hudPopTexts.length; i++) {
        var obj = this.hudPopTexts[i];
        if (obj._hmPopT == null) obj._hmPopT = 1;
        if (!kit.juice.enabled) { obj.setScale(1); continue; }
        if (obj._hmPopT < 1) {
          obj._hmPopT = Math.min(1, obj._hmPopT + dt * 7);
          obj.setScale(1 + Math.sin(obj._hmPopT * Math.PI) * (obj._hmPopScale || 0.2));
        }
      }
    },

    updateHud: function () {
      var run = this.run, p = this.p;
      var full = this.hpBarW - 4;

      this.updateObjectiveCompass();

      var wholeTime = Math.max(0, Math.floor(run.time));
      if (this.hudTimeValue !== wholeTime) {
        this.hudTimeValue = wholeTime;
        setTextIfChanged(this.timeText, fmtTime(wholeTime));
      }
      if (setTextIfChanged(this.lvText, 'LV' + run.level)) this.popHudText(this.lvText, 0.18);
      if (setTextIfChanged(this.gemChip, String(Math.floor(run.gems)))) this.popHudText(this.gemChip, 0.18);
      if (setTextIfChanged(this.scoreText, 'S ' + run.score)) this.popHudText(this.scoreText, 0.2);
      for (var wui = 0; wui < 3; wui++) {
        var wslot = this.weaponSlotsHud[wui], wkey = run.weaponSlots[wui], wdata = wkey ? WEAPON_BY_KEY[wkey] : null;
        var unlocked = wui < (run.slotsUnlocked || 1);
        if (wdata) {
          if (wslot.icon.frame.name !== wdata.glyph) wslot.icon.setTexture('atlas', wdata.glyph);
          wslot.icon.setTint(wdata.color).setAlpha(1);
          wslot.trim.setVisible(wdata.tier === 'upgraded').setAlpha(wdata.tier === 'upgraded' ? 0.92 : 0);
        } else {
          var emptyFrame = unlocked ? 'ic_orbit' : 'ic_lock';
          if (wslot.icon.frame.name !== emptyFrame) wslot.icon.setTexture('atlas', emptyFrame);
          wslot.icon.setTint(unlocked ? 0x8effd8 : 0x526572).setAlpha(unlocked ? 0.28 : 0.72);
          wslot.trim.setVisible(false).setAlpha(0);
        }
        wslot.bg.setTint(wui === 0 ? 0x397b84 : (unlocked ? 0x1f4a5b : 0x172a35));
      }
      this.weaponIcon = this.weaponSlotsHud[0].icon;
      this.weaponGlyphTrim = this.weaponSlotsHud[0].trim;
      this.weaponText = this.weaponSlotsHud[0].text;

      var hf = clamp(p.hp / p.maxHp, 0, 1);
      this.hpFill.width = full * hf;
      this.hpShown += (hf - this.hpShown) * 0.08;
      if (this.hpShown < hf) this.hpShown = hf;
      this.hpGhost.width = full * this.hpShown;
      this.hpFill.setFillStyle(hf > 0.55 ? 0x39e08a : (hf > 0.25 ? 0xffc361 : 0xff5a6a));
      setTextIfChanged(this.hpText, String(Math.max(0, Math.ceil(p.hp))));
      this.hpIcon.setScale(hf < 0.3
        ? 0.47 + Math.abs(Math.sin(run.time * 7)) * 0.10 : 0.47);

      if (run.combo > 2) {
        if (setTextIfChanged(this.comboChip, 'x' + run.combo)) this.popHudText(this.comboChip, 0.28);
        this.comboChip.setAlpha(clamp(run.comboT / 1.2, 0, 1));
      } else this.comboChip.setAlpha(0);

      for (var bi2 = 0; bi2 < BONUS_BUFFS.length; bi2++) {
        var bd2 = BONUS_BUFFS[bi2], bs = this.buffSlots[bi2];
        var left = run.buffs[bd2.key] || 0;
        if (left <= 0) { bs.slot.setVisible(false); continue; }
        bs.slot.setVisible(true);
        setTextIfChanged(bs.timer, String(Math.ceil(left)));
        var lit = Math.ceil(clamp(left / bd2.cap, 0, 1) * bs.pips.length);
        if (bs.lit !== lit) {
          for (var bpi2 = 0; bpi2 < bs.pips.length; bpi2++) {
            bs.pips[bpi2].setFillStyle(bpi2 < lit ? bd2.color : 0x2b4756);
          }
          bs.lit = lit;
        }
      }

      for (var tsi2 = 0; tsi2 < TIDE_HUD.length; tsi2++) {
        var td2 = TIDE_HUD[tsi2], ts = this.tideSlots[tsi2];
        var tideLeft = run.tides[td2.key] || 0;
        if (tideLeft <= 0) { ts.slot.setVisible(false); continue; }
        ts.slot.setVisible(true);
        setTextIfChanged(ts.timer, String(Math.ceil(tideLeft)));
        var tideLit = Math.ceil(clamp(tideLeft / Math.max(0.01, td2.duration), 0, 1) * ts.pips.length);
        if (ts.lit !== tideLit) {
          for (var tpi2 = 0; tpi2 < ts.pips.length; tpi2++) {
            ts.pips[tpi2].setFillStyle(tpi2 < tideLit ? 0xffe7a6 : 0x6b5730);
          }
          ts.lit = tideLit;
        }
      }

      var wingCount = run.wings || 0;
      var strikeCharges = this.run ? (this.run.strikeCharges || 0) : 0;
      if (this.strikePips && this.strikePipsLit !== strikeCharges) {
        this.strikePipsLit = strikeCharges;
        for (var scp = 0; scp < this.strikePips.length; scp++) {
          this.strikePips[scp].setFillStyle(scp < strikeCharges ? 0xffc361 : 0x2b4756);
        }
      }
      if (this.formationPips && this.formationPipsLit !== wingCount) {
        for (var wpi = 0; wpi < this.formationPips.length; wpi++) {
          this.formationPips[wpi].setFillStyle(wpi < wingCount ? 0x8effd8 : 0x2b4756);
        }
        this.formationPipsLit = wingCount;
      }

      if (this.bossRef && this.bossRef.alive) {
        var bbW = Math.min(320, this.scale.width - 24);
        this.bossFill.width = (bbW - 2) * clamp(this.bossRef.hp / this.bossRef.maxHp, 0, 1);
      } else if (this.bossBar.visible && this.run.bossDown) {
        this.bossBar.setVisible(false);
      }
    }
  };

  document.addEventListener('keydown', function (ev) {
    var s = Game.scene;
    if (!s || s.state !== 'draft') return;
    var n = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[ev.code];
    if (n != null) { ev.preventDefault(); s.pickUpgrade(n); }
  });

  function toScene(cfg) {
    var Klass = function () { Phaser.Scene.call(this, { key: cfg.key }); };
    Klass.prototype = Object.create(Phaser.Scene.prototype);
    Klass.prototype.constructor = Klass;
    for (var k in cfg) {
      if (k === 'key') continue;
      Klass.prototype[k] = cfg[k];
    }
    return Klass;
  }

  readSafeArea();

  Game.phaser = new Phaser.Game({
    type: Phaser.AUTO,
    parent: document.body,
    backgroundColor: '#04080e',
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: window.innerWidth,
      height: window.innerHeight
    },
    render: { antialias: true, powerPreference: 'high-performance', roundPixels: false },
    fps: { target: 60, min: 30 },
    scene: (function () {
      var list = [toScene(BootScene), toScene(TitleScene), toScene(ShopScene), toScene(PlayScene)];
      var ui = window.__HM_CAMPAIGN_UI;
      if (ui && typeof ui === 'object' && ui.key === 'missions' && typeof ui.create === 'function') {
        list.push(toScene(ui));
        Game.hasMissions = true;
      }
      return list;
    }())
  });

  kit.registerPWA();
  window.__HORDE_READY = true;
  window.__HORDE = { kit: kit, game: Game, profile: profile };
  updateHangarDebugState(HM_DEBUG_STATE);
  window.__hm = { state: HM_DEBUG_STATE };
}());
