/* Aetherfall - original portrait ATB JRPG. Phaser 3 view, fixed-step sim.
 * GGKit owns lifecycle, input, save and audio. No external assets are needed:
 * the spritesheets, portraits, board art and UI icons are authored at boot.
 */
(function () {
  'use strict';

  var W = 390;
  var H = 844;
  var RETINA_FACTOR = GGKit.hiDpi.factor(W, H);
  var BOARD_TOP = 88;
  var BOARD_BOTTOM = 600;
  var STEP = 1 / 60;
  var MAX_STEPS = 4;
  var SAVE_VERSION = 3;
  var TAU = Math.PI * 2;
  var CSS = {
    ink: '#07131c', panel: '#0c202b', panel2: '#102d39', line: '#2b6473',
    text: '#e7fbff', dim: '#91b8bf', cyan: '#6ee7f1', amber: '#ffd36e',
    ember: '#ff926b', rose: '#ff7187', mint: '#9bf2bd', violet: '#c7a2ff'
  };

  var ORBS = {
    ember: { name: 'Ember', icon: '◆', ability: 'Cinder Arc', kind: 'hit', power: 38, color: '#ff8564', desc: 'A focused heat lance.' },
    frost: { name: 'Frost', icon: '◇', ability: 'Rime Lock', kind: 'hit', power: 34, color: '#75d9ff', desc: 'A precise chill strike.' },
    jolt: { name: 'Jolt', icon: '✦', ability: 'Arcflash', kind: 'hit', power: 30, color: '#ffe16c', desc: 'A quick chain spark.' },
    mend: { name: 'Mend', icon: '✚', ability: 'Soft Chord', kind: 'heal', power: 45, color: '#a7f6bd', desc: 'Restore the most wounded ally.' },
    ward: { name: 'Ward', icon: '⬡', ability: 'Prism Guard', kind: 'shield', power: 22, color: '#c4a2ff', desc: 'Shield the party for one beat.' },
    bloom: { name: 'Bloom', icon: '✿', ability: 'Verdant Pulse', kind: 'healAll', power: 22, color: '#74efc0', desc: 'A generous party-wide mend.' },
    flare: { name: 'Flare', icon: '✹', ability: 'Solar Break', kind: 'hitAll', power: 25, color: '#ffb26e', desc: 'A party-wide reactor flare.' }
  };
  var ORB_KEYS = ['ember', 'frost', 'jolt', 'mend', 'ward', 'bloom', 'flare'];

  var PARTY_BLUEPRINT = [
    { id: 'kest', name: 'Kest', role: 'Riftblade', color: '#ff966a', accent: '#ffd074', maxHp: 158, speed: 46, basic: 28, skill: 'Crescent Step' },
    { id: 'vey', name: 'Vey', role: 'Spark scout', color: '#70ddf1', accent: '#b6f8ff', maxHp: 122, speed: 61, basic: 23, skill: 'Threadshot' },
    { id: 'nell', name: 'Nell', role: 'Chime weaver', color: '#9bf2bd', accent: '#e4ffd7', maxHp: 136, speed: 39, basic: 18, skill: 'Choral Mend' }
  ];

  var FLOORS = {
    1: { name: 'Glassline Intake', short: 'INTAKE', accent: '#68e9ef', deep: '#0c2e3c', landmark: 'Siphon Garden', landmarkText: 'A blue pressure garden drinks the city fog.', chest: 'frost', density: 0.105, enemy: 'wisp', hint: 'Follow the coolant veins to the side path.' },
    2: { name: 'Cinder Foundry', short: 'FOUNDRY', accent: '#ff9b6b', deep: '#3a1f27', landmark: 'Chainheart Furnace', landmarkText: 'A sleeping furnace turns without a belt.', chest: 'jolt', density: 0.135, enemy: 'hound', hint: 'The hot route is dense, but the chest path pays well.' },
    3: { name: 'Prism Core', short: 'CORE', accent: '#c59bff', deep: '#211a3e', landmark: 'Sevenfold Lens', landmarkText: 'Seven lenses bend one star into a weapon.', chest: 'ward', density: 0.16, enemy: 'sentinel', hint: 'Attune before the Warden door.' }
  };

  var ENEMIES = {
    wisp: { name: 'Coil Wisp', family: 'wisp', pattern: 'ranged', hp: 104, speed: 38, power: 16, color: '#a98dff', reward: 17 },
    mite: { name: 'Glimmer Mite', family: 'mite', pattern: 'chase', hp: 76, speed: 47, power: 12, color: '#d3f071', reward: 14 },
    hound: { name: 'Cinder Hound', family: 'hound', pattern: 'timing', hp: 148, speed: 34, power: 21, color: '#ff866f', reward: 23 },
    sentinel: { name: 'Prism Sentinel', family: 'sentinel', pattern: 'defense', hp: 186, speed: 31, power: 24, color: '#c59bff', reward: 31 }
  };

  var state = makeState();
  var bootFloor = null;
  var bootEncounter = null;
  var app = { scene: null };

  /* The hook exists before Phaser boots. The same object remains live after
   * boot, so a harness can install switches without racing scene creation. */
  window.__af = {
    state: state,
    forceFloor: function (floor) {
      bootFloor = clamp(Math.floor(Number(floor) || 0), 0, 3);
      if (app.scene && app.scene.forceFloor) app.scene.forceFloor(bootFloor);
    },
    forceEncounter: function (kind) {
      bootEncounter = kind || 'normal';
      if (app.scene && app.scene.forceEncounter) app.scene.forceEncounter(bootEncounter);
    }
  };

  var kit = GGKit.create({
    slug: 'aetherfall',
    orientation: 'portrait',
    validateSave: validateSave,
    onPause: function () { state.pauseHint = true; if (app.scene) app.scene.pauseHint = true; },
    onResume: function () { state.pauseHint = false; if (app.scene) app.scene.pauseHint = false; },
    onRestart: function () { resetKeyEdges(); }
  });
  kit.audio.register({
    plaza: 'assets/plaza.mp3', reactor: 'assets/reactor.mp3', warden: 'assets/warden.mp3',
    select: 'assets/ui.mp3', ready: 'assets/ui.mp3', chest: 'assets/ui.mp3', pickup: 'assets/pickup.mp3', banner: 'assets/ui.mp3', level: 'assets/victory.mp3',
    hit: 'assets/hit.mp3', hurt: 'assets/hurt.mp3', sword: 'assets/sword.mp3', encounter: 'assets/hit.mp3', bossHit: 'assets/hurt.mp3', telegraph: 'assets/telegraph.mp3', boss: 'assets/cast.mp3',
    cast: 'assets/cast.mp3', door: 'assets/door.mp3', secret: 'assets/secret.mp3', step: 'assets/step.mp3', crystal: 'assets/crystal.mp3', victory: 'assets/victory.mp3'
  });

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function safeNumber(n, fallback, min, max) {
    return typeof n === 'number' && isFinite(n) ? clamp(n, min, max) : fallback;
  }
  function safeInt(n, fallback, min, max) {
    return typeof n === 'number' && isFinite(n) ? clamp(Math.floor(n), min, max) : fallback;
  }
  function orbData(id) { return ORBS[id] || ORBS.ember; }
  function floorData(floor) { return FLOORS[floor] || FLOORS[1]; }
  function enemyData(key) { return ENEMIES[key] || ENEMIES.wisp; }
  function fmtTime(seconds) {
    var s = Math.max(0, Math.floor(seconds || 0));
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }
  function setTextIfChanged(obj, value) {
    if (!obj) return false;
    value = String(value);
    if (obj.text !== value) { obj.setText(value); return true; }
    return false;
  }
  function setColorIfChanged(obj, color) {
    if (!obj || obj._afColor === color) return;
    obj._afColor = color;
    obj.setColor(color);
  }
  function dist(a, b, c, d) { return Math.hypot(a - c, b - d); }
  function partyDefault() {
    return PARTY_BLUEPRINT.map(function (p) {
      return { id: p.id, name: p.name, role: p.role, color: p.color, accent: p.accent,
        maxHp: p.maxHp, hp: p.maxHp, speed: p.speed, basic: p.basic, skill: p.skill,
        level: 1, xp: 0, atb: 0, guard: false, guardTime: 0, anim: 'idle', animTime: 0, animFrame: 0, animClock: 0, dir: 'down' };
    });
  }
  function makeState() {
    return {
      version: SAVE_VERSION, mode: 'title', returnMode: 'world', runMode: 'reactor', ngPlus: false,
      area: 'plaza', floor: 0, player: { x: 195, y: 410, tx: 195, ty: 410, dir: 'down', path: [], walkClock: 0, z: 0 },
      party: partyDefault(), atb: [0, 0, 0], orbs: ['ember', 'mend'], equipped: { kest: 'ember', vey: null, nell: 'mend' },
      gil: 52, tonics: 3, chests: {}, crystals: {}, encounterPity: 0, steps: 0, runElapsed: 0,
      floorStartedAt: 0, noWipe: true, floorStats: {}, glyphCount: 0, glyphTotal: 5,
      profile: { clearCount: 0, medals: { 1: 'none', 2: 'none', 3: 'none' }, ascendantUnlocked: false },
      checkpoint: null, combat: null, banner: null, confirm: null, toast: '', toastTime: 0, toastQueue: [], toastColor: CSS.text, toastKind: 'event',
      selectedHero: 0, selectedOrb: null, tipTime: 0, stepClock: 0, pendingNode: null,
      hazards: [], pickups: [], descent: { active: false, z: 0, vz: 0, layer: 0, airflow: 0, landing: 0 },
      transition: null, invuln: 0, hazardClock: 0, tutorialStep: 0, activeElement: null,
      score: 0, lastResult: null, pauseHint: false
    };
  }
  function validateSave(o) {
    var exact = function (obj, keys) { if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false; var actual = Object.keys(obj).sort().join('|'); return actual === keys.slice().sort().join('|'); };
    var finiteRange = function (n, min, max) { return typeof n === 'number' && isFinite(n) && n >= min && n <= max; };
    if (!exact(o, ['version', 'profile', 'checkpoint']) || o.version !== SAVE_VERSION) return false;
    if (!exact(o.profile, ['clearCount', 'medals', 'ascendantUnlocked']) || !finiteRange(o.profile.clearCount, 0, 999) || typeof o.profile.ascendantUnlocked !== 'boolean') return false;
    if (!exact(o.profile.medals, ['1', '2', '3'])) return false;
    if ([1, 2, 3].some(function (f) { return medalValue(o.profile.medals[String(f)]) === 'none' && o.profile.medals[String(f)] !== 'none'; })) return false;
    var s = o.checkpoint;
    var checkpointKeys = ['area', 'floor', 'runMode', 'ngPlus', 'player', 'party', 'gil', 'tonics', 'orbs', 'equipped', 'chests', 'crystals', 'floorStats', 'noWipe', 'glyphCount', 'runElapsed', 'score'];
    if (!exact(s, checkpointKeys)) return false;
    if (['plaza', 'approach', 'reactor'].indexOf(s.area) < 0 || !finiteRange(s.floor, 0, 3) || (s.area === 'plaza' && s.floor !== 0) || (s.area === 'reactor' && s.floor < 1) || ['reactor', 'glyphhunt', 'ngplus', 'ascendant'].indexOf(s.runMode) < 0 || typeof s.ngPlus !== 'boolean') return false;
    if (!exact(s.player, ['x', 'y']) || !finiteRange(s.player.x, 28, W - 28) || !finiteRange(s.player.y, BOARD_TOP + 34, BOARD_BOTTOM - 28)) return false;
    if (!Array.isArray(s.party) || s.party.length !== PARTY_BLUEPRINT.length) return false;
    if (s.party.some(function (p, i) { return !exact(p, ['id', 'hp', 'maxHp', 'level', 'xp']) || p.id !== PARTY_BLUEPRINT[i].id || !finiteRange(p.maxHp, PARTY_BLUEPRINT[i].maxHp, 900) || !finiteRange(p.hp, 0, p.maxHp) || !finiteRange(p.level, 1, 30) || !finiteRange(p.xp, 0, 9999); })) return false;
    if (!Array.isArray(s.orbs) || s.orbs.length < 1 || s.orbs.length > ORB_KEYS.length || s.orbs.some(function (id, i) { return !validOrb(id) || s.orbs.indexOf(id) !== i; })) return false;
    if (!exact(s.equipped, ['kest', 'vey', 'nell']) || ['kest', 'vey', 'nell'].some(function (id) { return s.equipped[id] !== null && (!validOrb(s.equipped[id]) || s.orbs.indexOf(s.equipped[id]) < 0); })) return false;
    if (!finiteRange(s.gil, 0, 999999) || !finiteRange(s.tonics, 0, 99) || !exact(s.chests, Object.keys(s.chests)) || !exact(s.crystals, Object.keys(s.crystals))) return false;
    var mapKeys = ['plaza', 'approach', 'floor1', 'floor2', 'floor3'];
    if (Object.keys(s.chests).some(function (k) { return mapKeys.indexOf(k) < 0 || typeof s.chests[k] !== 'boolean'; }) || Object.keys(s.crystals).some(function (k) { return mapKeys.indexOf(k) < 0 || typeof s.crystals[k] !== 'boolean'; })) return false;
    if (!exact(s.floorStats, Object.keys(s.floorStats)) || Object.keys(s.floorStats).some(function (k) { return ['1', '2', '3'].indexOf(k) < 0 || !exact(s.floorStats[k], ['time', 'chest']) || !finiteRange(s.floorStats[k].time, 0, 999999) || typeof s.floorStats[k].chest !== 'boolean'; })) return false;
    return typeof s.noWipe === 'boolean' && finiteRange(s.glyphCount, 0, 5) && finiteRange(s.runElapsed, 0, 999999) && finiteRange(s.score, 0, 9999999);
  }
  function snapshot() {
    return {
      area: state.area, floor: state.floor, runMode: state.runMode, ngPlus: !!state.ngPlus,
      player: { x: state.player.x, y: state.player.y },
      party: state.party.map(function (p) { return { id: p.id, hp: p.hp, maxHp: p.maxHp, level: p.level, xp: p.xp }; }),
      gil: state.gil, tonics: state.tonics, orbs: state.orbs.slice(), equipped: copyEquipped(),
      chests: copyObject(state.chests), crystals: copyObject(state.crystals), floorStats: copyObject(state.floorStats),
      noWipe: !!state.noWipe, glyphCount: state.glyphCount, runElapsed: state.runElapsed, score: safeInt(state.score, 0, 0, 9999999)
    };
  }
  function copyObject(obj) {
    var out = {};
    if (!obj || typeof obj !== 'object') return out;
    Object.keys(obj).forEach(function (key) { out[key] = obj[key]; });
    return out;
  }
  function copyEquipped() {
    return { kest: validOrb(state.equipped.kest) ? state.equipped.kest : null,
      vey: validOrb(state.equipped.vey) ? state.equipped.vey : null,
      nell: validOrb(state.equipped.nell) ? state.equipped.nell : null };
  }
  function validOrb(id) { return !!(id && ORBS[id]); }
  function persist() {
    state.checkpoint = state.checkpoint || snapshot();
    state.checkpoint.noWipe = !!state.noWipe;
    state.checkpoint.score = safeInt(state.score, 0, 0, 9999999);
    kit.save.set({ version: SAVE_VERSION, profile: state.profile, checkpoint: state.checkpoint });
  }
  function loadPersistent() {
    var raw = kit.save.get(null);
    if (!raw) { state.checkpoint = snapshot(); return; }
    state.profile.clearCount = safeInt(raw.profile.clearCount, 0, 0, 999);
    state.profile.ascendantUnlocked = !!raw.profile.ascendantUnlocked;
    var medals = raw.profile.medals || {};
    [1, 2, 3].forEach(function (f) { state.profile.medals[f] = medalValue(medals[f]); });
    applySnapshot(raw.checkpoint);
    state.mode = 'title';
    state.combat = null;
    state.banner = null;
    state.confirm = null;
    clearTransient();
  }
  function medalValue(value) { return value === 'gold' || value === 'silver' || value === 'bronze' ? value : 'none'; }
  function applySnapshot(snap) {
    if (!snap || typeof snap !== 'object') return;
    state.area = snap.area === 'plaza' || snap.area === 'approach' || snap.area === 'reactor' ? snap.area : 'plaza';
    state.floor = safeInt(snap.floor, 0, 0, 3);
    state.runMode = snap.runMode === 'glyphhunt' || snap.runMode === 'ngplus' || snap.runMode === 'ascendant' ? snap.runMode : 'reactor';
    state.ngPlus = !!snap.ngPlus;
    var pos = snap.player || {};
    state.player.x = safeNumber(pos.x, 195, 28, W - 28); state.player.y = safeNumber(pos.y, 410, BOARD_TOP + 34, BOARD_BOTTOM - 28);
    state.player.tx = state.player.x; state.player.ty = state.player.y;
    var savedParty = Array.isArray(snap.party) ? snap.party : [];
    state.party = PARTY_BLUEPRINT.map(function (base, i) {
      var old = savedParty[i] || {};
      var hpMax = safeInt(old.maxHp, base.maxHp, base.maxHp, 900);
      return { id: base.id, name: base.name, role: base.role, color: base.color, accent: base.accent, maxHp: hpMax,
        hp: safeInt(old.hp, hpMax, 0, hpMax), speed: base.speed, basic: base.basic, skill: base.skill,
        level: safeInt(old.level, 1, 1, 30), xp: safeInt(old.xp, 0, 0, 9999), atb: 0, guard: false, guardTime: 0, anim: 'idle', animTime: 0, animFrame: 0, animClock: 0, dir: 'down' };
    });
    state.orbs = (Array.isArray(snap.orbs) ? snap.orbs : ['ember', 'mend']).filter(validOrb);
    if (!state.orbs.length) state.orbs = ['ember'];
    state.equipped = { kest: null, vey: null, nell: null };
    var eq = snap.equipped || {};
    ['kest', 'vey', 'nell'].forEach(function (id) { state.equipped[id] = validOrb(eq[id]) && state.orbs.indexOf(eq[id]) >= 0 ? eq[id] : null; });
    if (!state.equipped.kest) state.equipped.kest = state.orbs[0];
    state.gil = safeInt(snap.gil, 52, 0, 999999); state.tonics = safeInt(snap.tonics, 3, 0, 99);
    state.chests = copyObject(snap.chests); state.crystals = copyObject(snap.crystals); state.floorStats = copyObject(snap.floorStats);
    state.noWipe = snap.noWipe !== false; state.glyphCount = safeInt(snap.glyphCount, 0, 0, 5); state.runElapsed = safeNumber(snap.runElapsed, 0, 0, 999999); state.score = safeInt(snap.score, 0, 0, 9999999);
    state.player.path = []; state.player.walkClock = 0; state.player.z = 0; state.pendingNode = null; state.transition = null; state.combat = null; state.confirm = null;
    setupHazards(); setupPickups();
  }
  function clearTransient() {
    state.toast = '';
    state.toastTime = 0;
    state.toastQueue = [];
  }
  function startTransient(item) {
    state.toast = item.text;
    state.toastTime = item.duration;
    state.toastColor = item.color || CSS.text;
    state.toastKind = item.kind || 'event';
  }
  function queueTransient(text, duration, color, kind) {
    text = String(text || '').replace(/\s+/g, ' ').trim();
    if (!text) return;
    var item = { text: text, duration: duration, color: color || CSS.text, kind: kind || 'event' };
    if (state.toastTime > 0 || state.toastQueue.length) {
      if (state.toastQueue.length >= 5) state.toastQueue.shift();
      state.toastQueue.push(item);
    } else startTransient(item);
  }
  function updateTransient(dt) {
    if (state.toastTime <= 0) return;
    state.toastTime -= dt;
    if (state.toastTime > 0) return;
    state.toast = '';
    state.toastTime = 0;
    if (state.toastQueue.length) startTransient(state.toastQueue.shift());
  }
  function showToast(text, seconds, color) { queueTransient(text, 1, color || CSS.text, 'event'); }
  function showCoach(text, seconds) { queueTransient(text, Math.min(3.2, seconds == null ? 3 : seconds), CSS.text, 'coach'); }
  function bannerChipText(title, subtitle) {
    var level = String(subtitle || '').match(/^(.+) reaches level (\d+)$/);
    if (title === 'LEVEL UP' && level) return 'LEVEL UP · ' + level[1] + ' LV ' + level[2];
    if (title === 'CRYSTAL ATTUNED') return 'CRYSTAL SAVED · FULL HP';
    if (title === 'ELEMENT COLLECTED') { var active = String(subtitle || '').match(/Active:\s*(.+)$/); return 'ELEMENT · ' + (active ? active[1] : 'COLLECTED'); }
    if (title === 'GLYPH CHEST') { var chest = String(subtitle || '').split('.')[0].replace(' orb joined the satchel', '').replace('Duplicate orb traded for 12 gil', '+12G'); return 'CHEST · ' + chest + ' · +25G +1T'; }
    if (title === 'EMBER INN') return 'INN · PARTY RESTORED';
    if (title === 'LUMEN MART') return 'MART · TONIC +1';
    if (title === 'CONTACT CLEARED') return 'CLEARED · ' + String(subtitle || '').replace(', generous field salvage', '');
    if (title.indexOf('LANDING LAYER') === 0) return 'LANDED · FLOOR ' + title.slice(14);
    if (title.indexOf('WARDEN PHASE') === 0) return title;
    if (title === 'WARDEN CHAMBER' || title === 'WARDEN ASCENDANT') return title;
    return String(title || subtitle || '').replace(/\s+/g, ' ');
  }
  function resetKeyEdges() { keyEdges = {}; pointerClaims = {}; }
  function addOrb(id) {
    if (!validOrb(id)) return false;
    if (state.orbs.indexOf(id) < 0) { state.orbs.push(id); return true; }
    state.gil += 12;
    return false;
  }
  function addXp(hero, amount) {
    hero.xp += amount;
    var needed = hero.level * 90;
    if (hero.xp >= needed) {
      hero.xp -= needed; hero.level++; hero.maxHp += 12; hero.hp = hero.maxHp;
      showBanner('LEVEL UP', hero.name + ' reaches level ' + hero.level, hero.color, 'auto');
      emitBurst(195, 330, hero.color, 18, 'element');
      kit.audio.sfx('level');
    }
  }
  function advanceTutorial(step, message) {
    if (state.tutorialStep >= step) return;
    state.tutorialStep = step;
    if (message) showCoach(message, 3);
  }
  function showBanner(title, subtitle, color, behavior) {
    var boundary = behavior === 'manual' && (state.mode === 'floorclear' || state.mode === 'clear');
    if (!boundary) {
      showToast(bannerChipText(title, subtitle), 1, color || CSS.cyan);
      kit.audio.sfx('banner');
      return;
    }
    clearTransient();
    state.banner = { title: title, subtitle: subtitle, color: color || CSS.cyan, time: behavior === 'manual' ? 99 : 2.15, scale: kit.juice.enabled ? 1.16 : 1, behavior: behavior || 'auto' };
    kit.audio.sfx('banner');
  }
  function setupHazards() {
    var key = state.area === 'approach' ? 'approach' : 'floor' + clamp(state.floor, 1, 3);
    if (state.area === 'plaza') { state.hazards = []; return; }
    var accent = state.area === 'approach' ? '#6ee7f1' : floorData(state.floor).accent;
    var points = state.area === 'approach' ? [[150, 420], [246, 335], [320, 270]] : state.floor === 1 ? [[112, 360], [210, 250], [310, 430]] : state.floor === 2 ? [[92, 280], [200, 435], [306, 300], [170, 185]] : [[112, 420], [205, 300], [302, 190], [286, 440]];
    state.hazards = points.map(function (p, i) { return { id: key + '-' + i, x: p[0], y: p[1], baseX: p[0], baseY: p[1], r: state.floor === 2 ? 24 : 20, type: state.floor === 2 ? 'vent' : state.floor === 3 ? 'lens' : 'pulse', color: accent, phase: i * 0.8, timer: 0.4 + i * 0.35, telegraph: false, active: true }; });
  }
  function setupPickups() {
    if (state.area === 'plaza') { state.pickups = state.chests.plaza ? [] : [{ id: 'plaza-element', x: 170, y: 430, orb: 'frost', active: true }]; return; }
    var orb = state.area === 'approach' ? 'mend' : floorData(state.floor).chest;
    var key = state.area === 'approach' ? 'approach' : 'floor' + state.floor;
    state.pickups = state.chests[key] ? [] : [{ id: key + '-element', x: state.area === 'approach' ? 178 : 188, y: state.area === 'approach' ? 338 : 380, orb: orb, active: true }];
  }
  function beginTransition(area, floor, kind) {
    state.transition = { area: area, floor: floor, kind: kind || 'slide', time: 0.25, max: 0.25, phase: 'out' };
    state.player.path = []; state.pendingNode = null;
    kit.audio.sfx('door', { rate: kind === 'descent' ? 0.82 : 1 });
  }
  function prepareArea(area, floor) {
    state.area = area; state.floor = floor || 0; state.mode = 'world'; state.floorStartedAt = state.floor ? state.runElapsed : state.floorStartedAt;
    state.player.x = area === 'plaza' ? 195 : area === 'approach' ? 32 : 52;
    state.player.y = area === 'plaza' ? 410 : area === 'approach' ? 470 : 500;
    state.player.tx = state.player.x; state.player.ty = state.player.y; state.player.path = []; state.player.z = 0;
    state.encounterPity = 0; state.combat = null; state.confirm = null; state.invuln = 0; state.hazardClock = 0;
    state.descent = { active: area === 'reactor', z: area === 'reactor' ? 132 : 0, vz: area === 'reactor' ? -18 : 0, layer: floor || 0, airflow: 0, landing: area === 'reactor' ? 1.05 : 0 };
    if (state.floor && !state.floorStats[state.floor]) state.floorStats[state.floor] = { time: 0, chest: false };
    setupHazards(); setupPickups();
    persist();
  }
  function awardMedal(floor) {
    var info = floorData(floor), stat = state.floorStats[floor] || {};
    var elapsed = safeNumber(stat.time, 999, 0, 999999);
    var timeTier = elapsed <= 64 ? 3 : elapsed <= 104 ? 2 : 1;
    var wipeTier = state.noWipe ? 3 : 1;
    var glyphTier = state.chests['floor' + floor] ? 3 : 1;
    var tier = Math.min(timeTier, wipeTier, glyphTier);
    var value = tier >= 3 ? 'gold' : tier === 2 ? 'silver' : 'bronze';
    var rank = { none: 0, bronze: 1, silver: 2, gold: 3 };
    if (rank[value] > rank[state.profile.medals[floor]]) state.profile.medals[floor] = value;
    if (state.profile.medals[1] === 'gold' && state.profile.medals[2] === 'gold' && state.profile.medals[3] === 'gold' && state.profile.clearCount > 0) state.profile.ascendantUnlocked = true;
    return { value: value, time: elapsed, name: info.name };
  }
  function enterFloor(floor, immediate) {
    floor = clamp(Math.floor(floor || 1), 1, 3);
    if (!immediate && state.area !== 'reactor') { beginTransition('reactor', floor, 'descent'); return; }
    prepareArea('reactor', floor);
    showCoach('F' + floor + ' ' + floorData(floor).short + ' · follow the lit route.', 3);
    if (app.scene) app.scene.paintWorld(true);
  }
  function startRun(mode) {
    mode = mode || 'reactor';
    state.mode = 'world'; state.returnMode = 'world'; state.runMode = mode; state.ngPlus = mode === 'ngplus';
    state.area = mode === 'ascendant' ? 'reactor' : 'plaza'; state.floor = mode === 'ascendant' ? 3 : 0;
    state.party = partyDefault(); state.gil = mode === 'ascendant' ? 120 : 52; state.tonics = 4;
    state.orbs = mode === 'ngplus' ? ['ember', 'mend', 'jolt'] : mode === 'glyphhunt' ? ['ember', 'frost'] : ['ember', 'mend'];
    if (mode === 'ascendant') state.orbs = ['flare', 'ward', 'bloom', 'jolt'];
    state.equipped = { kest: state.orbs[0], vey: state.orbs[1] || null, nell: mode === 'ascendant' ? 'bloom' : 'mend' };
    state.chests = {}; state.crystals = {}; state.floorStats = {}; state.glyphCount = 0; state.noWipe = true; state.runElapsed = 0; state.floorStartedAt = 0; state.encounterPity = 0; state.score = 0; state.lastResult = null; state.tutorialStep = 0; state.activeElement = null;
    state.player.x = mode === 'ascendant' ? 52 : 195; state.player.y = mode === 'ascendant' ? 500 : 410; state.player.tx = state.player.x; state.player.ty = state.player.y; state.player.path = []; state.player.dir = 'down'; state.player.z = 0;
    state.checkpoint = snapshot(); state.combat = null; state.confirm = null; state.banner = null; clearTransient(); state.selectedHero = 0; state.transition = null; state.descent = { active: false, z: 0, vz: 0, layer: 0, airflow: 0, landing: 0 };
    setupHazards(); setupPickups();
    showCoach(mode === 'reactor' ? 'MOVE TO THE ◆ ELEMENT · avoid red pulses.' : mode === 'glyphhunt' ? 'GLYPH HUNT · collect five chests.' : mode === 'ngplus' ? 'NEW GAME+ · stronger enemies, richer start.' : 'ASCENDANT · floor three is awake.', 3);
    persist();
    if (app.scene) app.scene.paintWorld(true);
    kit.audio.music(mode === 'ascendant' ? 'reactor' : 'plaza');
  }
  function restAtCrystal() {
    state.party.forEach(function (p) { p.hp = p.maxHp; p.guard = false; p.guardTime = 0; p.atb = 0; });
    var crystalKey = state.area === 'plaza' ? 'plaza' : state.area === 'approach' ? 'approach' : 'floor' + state.floor;
    state.crystals[crystalKey] = true;
    state.checkpoint = snapshot();
    state.confirm = null;
    showBanner('CRYSTAL ATTUNED', 'Route saved. Party restored to full.', CSS.cyan, 'auto');
    emitBurst(state.player.x, state.player.y, '#6ee7f1', 24);
    kit.audio.sfx('crystal');
    persist();
  }
  function openChest() {
    var key = state.area === 'plaza' ? 'plaza' : state.area === 'approach' ? 'approach' : 'floor' + state.floor;
    if (state.chests[key]) { showToast('CHEST · EMPTY', 1, CSS.dim); return; }
    var found = state.area === 'plaza' ? 'frost' : state.area === 'approach' ? 'mend' : floorData(state.floor).chest;
    state.chests[key] = true; state.glyphCount = clamp(state.glyphCount + 1, 0, 5);
    var fresh = addOrb(found);
    state.gil += 25; state.tonics += 1;
    if (state.floorStats[state.floor]) state.floorStats[state.floor].chest = true;
    showBanner('GLYPH CHEST', (fresh ? orbData(found).name + ' orb joined the satchel.' : 'Duplicate orb traded for 12 gil.') + ' +25 gil, +1 tonic', orbData(found).color, 'auto');
    emitBurst(state.player.x, state.player.y, orbData(found).color, 28);
    kit.audio.sfx('chest');
    persist();
  }
  function completeFloor() {
    var f = state.floor;
    state.floorStats[f] = state.floorStats[f] || {};
    state.floorStats[f].time = Math.max(0, state.runElapsed - state.floorStartedAt);
    state.floorStats[f].chest = !!state.chests['floor' + f];
    var medal = awardMedal(f);
    state.mode = 'floorclear'; state.returnMode = 'world';
    showBanner('FLOOR ' + f + ' CLEAR', medal.value.toUpperCase() + ' MEDAL  ' + fmtTime(medal.time) + '  ' + floorData(f).landmark, floorData(f).accent, 'manual');
    persist();
  }
  function continueFloor() {
    state.banner = null;
    if (state.floor < 3) { enterFloor(state.floor + 1); return; }
    startBoss(false);
  }
  function nodeList() {
    var pickups = state.pickups.filter(function (p) { return p.active; }).map(function (p) { return { type: 'pickup', x: p.x, y: p.y, label: orbData(p.orb).icon + ' ' + orbData(p.orb).name, pickup: p }; });
    if (state.area === 'plaza') return pickups.concat([
      { type: 'crystal', x: 195, y: 290, label: 'CRYSTAL' }, { type: 'gate', x: 342, y: 250, label: 'GATE' },
      { type: 'landmark', x: 100, y: 205, label: 'EMBER INN' }, { type: 'landmark', x: 275, y: 190, label: 'LUMEN MART' },
      { type: 'chest', x: 118, y: 350, label: 'GLYPH CACHE' }
    ]);
    if (state.area === 'approach') return pickups.concat([
      { type: 'crystal', x: 58, y: 190, label: 'CRYSTAL' }, { type: 'chest', x: 242, y: 410, label: 'GLYPH CHEST' },
      { type: 'reactor', x: 340, y: 220, label: 'REACTOR' }
    ]);
    if (state.floor < 3) return pickups.concat([
      { type: 'crystal', x: 58, y: 190, label: 'CRYSTAL' }, { type: 'chest', x: 242, y: 410, label: 'GLYPH CHEST' },
      { type: 'stair', x: 335, y: 230, label: 'DOWN' }
    ]);
    return pickups.concat([
      { type: 'crystal', x: 58, y: 190, label: 'CRYSTAL' }, { type: 'chest', x: 242, y: 410, label: 'GLYPH CHEST' },
      { type: 'boss', x: 286, y: 190, label: state.runMode === 'ascendant' ? 'ASCENDANT' : 'WARDEN' }
    ]);
  }
  function nodeAt(x, y) {
    var nodes = nodeList();
    for (var i = 0; i < nodes.length; i++) if (dist(x, y, nodes[i].x, nodes[i].y) < 34) return nodes[i];
    return null;
  }
  function blockedPoint(x, y) {
    if (x < 28 || x > W - 28 || y < BOARD_TOP + 34 || y > BOARD_BOTTOM - 28) return true;
    var blocks = state.area === 'plaza' ? [[20, 136, 115, 118], [258, 135, 100, 120]] : state.area === 'approach' ? [[300, 135, 70, 100]] : [[18, 122, 354, 18], [18, 505, 354, 20]];
    return blocks.some(function (b) { return x > b[0] - 12 && x < b[0] + b[2] + 12 && y > b[1] - 12 && y < b[1] + b[3] + 12; });
  }
  function safeRoutePoint(x, y) {
    x = clamp(x, 28, W - 28); y = clamp(y, BOARD_TOP + 34, BOARD_BOTTOM - 28);
    if (!blockedPoint(x, y)) return { x: x, y: y };
    for (var radius = 24; radius <= 120; radius += 24) for (var i = 0; i < 8; i++) {
      var p = { x: clamp(x + Math.cos(i * TAU / 8) * radius, 28, W - 28), y: clamp(y + Math.sin(i * TAU / 8) * radius, BOARD_TOP + 34, BOARD_BOTTOM - 28) };
      if (!blockedPoint(p.x, p.y)) return p;
    }
    return { x: state.player.x, y: state.player.y };
  }
  function moveTo(x, y, node) {
    var target = safeRoutePoint(x, y), start = { x: state.player.x, y: state.player.y };
    var mid = safeRoutePoint(start.x + (target.x - start.x) * 0.45, start.y + (target.y - start.y) * 0.35);
    var mid2 = safeRoutePoint(start.x + (target.x - start.x) * 0.78, start.y + (target.y - start.y) * 0.72);
    state.player.path = [mid, mid2, target]; state.player.tx = mid.x; state.player.ty = mid.y;
    state.player.dir = Math.abs(x - state.player.x) > Math.abs(y - state.player.y) ? (x < state.player.x ? 'left' : 'right') : (y < state.player.y ? 'up' : 'down');
    state.party[0].dir = state.player.dir; state.pendingNode = node || null; state.stepClock = node ? 0 : 0.04;
  }
  function collectPickup(pickup) {
    if (!pickup || !pickup.active) return;
    pickup.active = false; var fresh = addOrb(pickup.orb); state.activeElement = pickup.orb;
    if (!state.equipped.kest) state.equipped.kest = pickup.orb;
    advanceTutorial(1);
    showBanner('ELEMENT COLLECTED', (fresh ? orbData(pickup.orb).name + ' joined the satchel.' : 'Duplicate element converted to 12 gil.') + '  Active: ' + orbData(pickup.orb).ability, orbData(pickup.orb).color, 'auto');
    emitBurst(pickup.x, pickup.y, orbData(pickup.orb).color, 24, 'element'); kit.audio.sfx('pickup'); persist();
  }
  function useInn() {
    if (state.gil < 8) { showToast('INN · NEEDS 8 GIL', 1, CSS.amber); return; }
    state.gil -= 8; state.party.forEach(function (p) { p.hp = p.maxHp; p.guard = false; p.guardTime = 0; p.atb = 0; });
    showBanner('EMBER INN', 'Eight gil buys a warm rest and a clean ATB slate.', CSS.mint, 'auto'); kit.audio.sfx('secret'); persist();
  }
  function buyTonic() {
    if (state.gil < 6) { showToast('MART · NEEDS 6 GIL', 1, CSS.amber); return; }
    state.gil -= 6; state.tonics = clamp(state.tonics + 1, 0, 99); showBanner('LUMEN MART', 'Tonic stocked. Six gil spent.', CSS.amber, 'auto'); kit.audio.sfx('pickup'); persist();
  }
  function arriveAt(node) {
    if (node) {
      if (node.type === 'crystal') state.confirm = { type: 'crystal' };
      else if (node.type === 'chest') openChest();
      else if (node.type === 'pickup') collectPickup(node.pickup);
      else if (node.type === 'gate') { beginTransition('approach', 0, 'slide'); kit.audio.music('reactor'); }
      else if (node.type === 'reactor') enterFloor(1);
      else if (node.type === 'stair') completeFloor();
      else if (node.type === 'boss') { if (state.floor === 3 && state.runMode !== 'ascendant' && !(state.floorStats[3] && state.floorStats[3].time > 0)) completeFloor(); else startBoss(state.runMode === 'ascendant'); }
      else if (node.type === 'landmark') { if (node.label === 'EMBER INN') useInn(); else buyTonic(); }
      state.pendingNode = null;
      return;
    }
    registerStep();
  }
  function registerStep() {
    state.steps++;
    if (state.area === 'plaza') return;
    state.encounterPity++;
    var rate = state.area === 'approach' ? 0.025 : floorData(state.floor).density * 0.18;
    if (state.runMode === 'glyphhunt') rate *= 0.72;
    if (state.encounterPity >= 4 || Math.random() < rate) {
      state.encounterPity = 0;
      startEncounter('normal');
    }
  }
  function makeEnemy(key, boss) {
    var base = enemyData(key);
    if (boss) return { id: 'warden', name: 'The Cinder Warden', family: 'warden', hp: state.runMode === 'ascendant' ? 1180 : 820, maxHp: state.runMode === 'ascendant' ? 1180 : 820, atb: 0, speed: 27, power: state.runMode === 'ascendant' ? 34 : 26, color: '#ff7187', boss: true, phase: 1, telegraph: null, defeated: false, guard: false, knockback: 0, flash: 0 };
    return { id: base.name, name: base.name, family: base.family, pattern: base.pattern, hp: base.hp + state.floor * 14 + (state.ngPlus ? 24 : 0), maxHp: base.hp + state.floor * 14 + (state.ngPlus ? 24 : 0), atb: 0, speed: base.speed, power: base.power + (state.ngPlus ? 4 : 0), color: base.color, boss: false, phase: 1, telegraph: null, defeated: false, guard: false, knockback: 0, flash: 0 };
  }
  function startEncounter(kind) {
    if (state.mode === 'combat') return;
    var key = state.area === 'approach' ? 'mite' : floorData(state.floor).enemy;
    if (key === 'sentinel' && Math.random() < 0.45) key = 'wisp';
    state.combat = { kind: 'normal', phase: 'fight', ui: 'flow', activeHero: -1, focus: 0, targetFocus: 0, pending: null, log: 'A signal tears through the reactor dust.', timer: 0, totalDamage: 0, actions: 0, enemy: makeEnemy(key, false) };
    state.mode = 'combat'; state.party.forEach(function (p) { p.atb = 0; p.guard = false; p.guardTime = 0; });
    state.player.tx = state.player.x; state.player.ty = state.player.y;
    showCoach('ATB LIVE · READY opens commands.', 3);
    kit.audio.sfx('encounter');
    if (app.scene) app.scene.paintCombat(true);
  }
  function startBoss(ascendant) {
    state.combat = { kind: ascendant ? 'ascendant' : 'boss', phase: 'fight', ui: 'flow', activeHero: -1, focus: 0, targetFocus: 0, pending: null, log: ascendant ? 'The sevenfold core opens its final eye.' : 'A furnace-heart wakes beneath the city.', timer: 0, totalDamage: 0, actions: 0, startedAt: state.runElapsed, enemy: makeEnemy('warden', true) };
    state.mode = 'combat'; state.party.forEach(function (p) { p.atb = 0; p.guard = false; p.guardTime = 0; });
    showBanner(ascendant ? 'WARDEN ASCENDANT' : 'WARDEN CHAMBER', ascendant ? 'The medal chain has opened the final phase.' : 'Three reactor floors end here.', CSS.rose, 'auto');
    kit.audio.music('warden'); kit.audio.sfx('boss');
    if (app.scene) app.scene.paintCombat(true);
  }
  function livingParty() { return state.party.filter(function (p) { return p.hp > 0; }); }
  function combatResult(text, x, y, color, icon) {
    if (!state.combat) return;
    queueTransient((icon ? icon + ' ' : '') + text, 1, color || CSS.text, 'event');
  }
  function addEffect(x, y, color, count) {
    if (!app.scene || !app.scene.emit) return;
    app.scene.emit(x, y, color, count || 8, 'power');
  }
  function hurtParty(hero, amount) {
    var index = state.party.indexOf(hero), guarded = !!hero.guard;
    var actual = Math.max(1, Math.round(amount * (guarded ? 0.45 : 1)));
    hero.hp = Math.max(0, hero.hp - actual); hero.atb = Math.max(0, hero.atb - 8); hero.anim = 'hurt'; hero.animTime = 0.38; hero.animFrame = 4; hero.guard = false; hero.guardTime = 0;
    addEffect(78 + index * 106, 540, CSS.rose, 8); combatResult('-' + actual, 78 + index * 106, 568, CSS.rose, guarded ? '⛨' : '✦'); kit.juice.shake(3, 90); kit.audio.sfx('hurt');
    if (state.combat) state.combat.totalDamage += actual;
    return actual;
  }
  function enemyDamage(amount, label, color) {
    var enemy = state.combat && state.combat.enemy;
    if (!enemy) return;
    var defended = !!enemy.guard; var actual = Math.max(1, Math.round((amount + Math.random() * 4) * (defended ? 0.5 : 1))); enemy.hp = Math.max(0, enemy.hp - actual); enemy.flash = 0.14; enemy.knockback = 18; enemy.guard = false;
    state.combat.log = label + ' hits for ' + actual + '.'; state.combat.actions++;
    addEffect(285, 230, color || CSS.amber, 12); combatResult('-' + actual, 285, 190, color || CSS.amber, defended ? '⛨' : '◆'); kit.juice.shake(2, 70); kit.juice.hitStop(65); kit.audio.sfx('sword', { rate: defended ? 0.82 : 1.12 });
    if (enemy.hp <= 0) { enemy.defeated = true; state.combat.log = enemy.name + ' breaks into bright motes.'; addEffect(285, 230, CSS.amber, 28); }
  }
  function selectReadyHero() {
    if (!state.combat || state.combat.activeHero >= 0 || state.combat.phase !== 'fight') return;
    var ready = -1;
    state.party.some(function (p, i) { if (p.hp > 0 && p.atb >= 100) { ready = i; return true; } return false; });
    if (ready >= 0) { state.combat.activeHero = ready; state.combat.ui = 'root'; state.combat.pending = null; state.combat.log = state.party[ready].name + ' is READY. Choose, target, confirm.'; kit.audio.sfx('ready'); }
  }
  function enemyTurn() {
    var c = state.combat, e = c.enemy;
    if (e.boss) {
      var ratio = e.hp / e.maxHp;
      var phase = ratio <= 0.35 ? 3 : ratio <= 0.7 ? 2 : 1;
      if (phase !== e.phase) { e.phase = phase; c.log = phase === 2 ? 'PHASE 2: the reactor vents split the arena.' : 'PHASE 3: the Warden opens the Lattice Eye.'; c.phasePulse = 0.7; showBanner(phase === 2 ? 'WARDEN PHASE 2' : 'WARDEN PHASE 3', c.log, phase === 2 ? CSS.ember : CSS.violet, 'auto'); addEffect(285, 235, phase === 2 ? CSS.ember : CSS.violet, phase === 2 ? 18 : 28); }
      e.telegraph = phase === 1 ? { name: 'EMBER COLUMN', timer: 1.35, kind: 'single', power: e.power + 6 } : phase === 2 ? { name: 'COREQUAKE', timer: 1.65, kind: 'party', power: e.power + 10 } : { name: 'LATTICE BREAK', timer: 1.25, kind: 'party', power: e.power + 18 };
      c.log = e.telegraph.name + ' in ' + e.telegraph.timer.toFixed(1) + 's. Guard or finish the Warden.';
      kit.audio.sfx('telegraph');
    } else {
      var targets = livingParty();
      if (!targets.length) return;
      var target = e.pattern === 'chase' ? targets[0] : targets[Math.floor(Math.random() * targets.length)];
      if (e.pattern === 'defense' && !e.guard) { e.guard = true; c.log = e.name + ' folds its prism plates. The next hit is blunted.'; combatResult('GUARD', 285, 190, CSS.violet, '⛨'); kit.audio.sfx('telegraph', { rate: 0.72 }); return; }
      if (e.pattern === 'ranged' || e.pattern === 'timing' || (e.pattern === 'defense' && c.actions % 2 === 0)) {
        var area = e.pattern === 'timing' && c.actions % 2 === 1;
        e.telegraph = { name: area ? 'CINDER RUSH' : e.pattern === 'ranged' ? 'ARC SHOT' : 'PRISM BITE', timer: e.pattern === 'ranged' ? 1.1 : 0.82, kind: area ? 'party' : 'single', power: e.power + (area ? 5 : e.pattern === 'timing' ? 4 : 2), target: target.id };
        c.log = e.name + ' marks ' + (area ? 'the whole party' : target.name) + '. Guard or move with the read.'; kit.audio.sfx('telegraph', { rate: e.pattern === 'ranged' ? 1.2 : 0.94 });
      } else {
        var actual = hurtParty(target, e.power); c.log = e.name + ' chases ' + target.name + ' for ' + actual + '.';
      }
    }
  }
  function resolveTelegraph() {
    var c = state.combat, e = c.enemy, t = e.telegraph;
    if (!t) return;
    if (t.kind === 'party') {
      state.party.forEach(function (p) { if (p.hp > 0) hurtParty(p, t.power); });
      c.log = t.name + ' lands across the whole party.';
    } else {
      var target = livingParty().sort(function (a, b) { return a.hp / a.maxHp - b.hp / b.maxHp; })[0];
      if (target) c.log = t.name + ' burns ' + target.name + ' for ' + hurtParty(target, t.power) + '.';
    }
    e.telegraph = null; kit.audio.sfx('bossHit');
  }
  function actionFor(hero, type) {
    var orb = orbData(state.equipped[hero.id]);
    if (type === 'attack') return { type: type, label: 'ATTACK', target: 'enemy', power: hero.basic, color: hero.color };
    if (type === 'skill') return { type: type, label: hero.skill.toUpperCase(), target: hero.id === 'nell' ? 'ally' : 'enemy', power: hero.id === 'nell' ? 46 : hero.basic + 24, color: hero.accent };
    if (type === 'orb') return { type: type, label: orb.ability.toUpperCase(), orb: orb, target: orb.kind === 'heal' ? 'ally' : orb.kind === 'healAll' || orb.kind === 'shield' ? 'party' : 'enemy', power: orb.power, color: orb.color };
    if (type === 'item') return { type: type, label: 'TONIC', target: 'ally', power: 48, color: CSS.amber };
    return { type: type, label: 'GUARD', target: 'self', power: 0, color: CSS.cyan };
  }
  function beginAction(type) {
    var c = state.combat, hero = c && state.party[c.activeHero];
    if (!hero) return;
    if (type === 'orb' && !state.equipped[hero.id]) { showToast('ORB · SOCKET REQUIRED', 1, CSS.amber); return; }
    if (type === 'item' && state.tonics <= 0) { showToast('TONIC · SATCHEL EMPTY', 1, CSS.amber); return; }
    var action = actionFor(hero, type); c.pending = { action: action, target: action.target === 'party' || action.target === 'self' ? -1 : null }; c.ui = action.target === 'self' || action.target === 'party' ? 'confirm' : 'target';
    c.log = action.target === 'enemy' ? 'Tap the marked enemy, then confirm the action.' : action.target === 'ally' ? 'Tap an ally, then confirm the action.' : 'Confirm the party-wide action.';
    kit.audio.sfx('select');
  }
  function chooseTarget(index, ally) {
    var c = state.combat;
    if (!c || !c.pending) return;
    if (ally) { if (!state.party[index] || state.party[index].hp <= 0) return; c.pending.target = index; }
    else if (c.enemy && c.enemy.hp > 0) c.pending.target = 0;
    else return;
    c.ui = 'confirm'; c.log = 'Confirm ' + c.pending.action.label + '? Tap CONFIRM or BACK.'; kit.audio.sfx('select');
  }
  function resolveAction() {
    var c = state.combat, pending = c && c.pending, hero = c && state.party[c.activeHero];
    if (!pending || !hero) return;
    var a = pending.action;
    if ((a.target === 'ally' || a.target === 'enemy') && pending.target == null) return;
    hero.anim = a.type === 'orb' ? 'cast' : a.type === 'skill' ? 'attack' : 'attack'; hero.animTime = 0.42;
    if (a.type === 'attack') enemyDamage(a.power + hero.level * 5, hero.name + ' attacks', hero.color);
    else if (a.type === 'skill' && hero.id === 'nell') {
      var ally = state.party[pending.target]; ally.hp = Math.min(ally.maxHp, ally.hp + a.power + hero.level * 4); addEffect(78 + pending.target * 106, 360, hero.color, 16); c.log = hero.name + ' restores ' + ally.name + ' for ' + (a.power + hero.level * 4) + '.';
      combatResult('+' + (a.power + hero.level * 4), 78 + pending.target * 106, 520, hero.color, '+');
    } else if (a.type === 'skill') enemyDamage(a.power + hero.level * 4, hero.name + ' uses ' + hero.skill, a.color);
    else if (a.type === 'orb') resolveOrb(a, pending.target, hero);
    else if (a.type === 'item') { var target = state.party[pending.target]; if (state.tonics > 0 && target) { state.tonics--; target.hp = Math.min(target.maxHp, target.hp + a.power); c.log = hero.name + ' gives ' + target.name + ' a tonic for +' + a.power + '.'; addEffect(78 + pending.target * 106, 540, CSS.amber, 12); combatResult('+' + a.power, 78 + pending.target * 106, 520, CSS.amber, '+'); } }
    else if (a.type === 'guard') { hero.guard = true; hero.guardTime = 2.2; c.log = hero.name + ' raises a prism guard.'; combatResult('GUARD', 78 + c.activeHero * 106, 520, CSS.cyan, '⛨'); }
    hero.atb = 0; if (a.type === 'guard') { hero.guard = true; hero.guardTime = 2.2; } c.activeHero = -1; c.pending = null; c.ui = 'flow'; c.focus = 0; advanceTutorial(4);
    if (c.enemy && c.enemy.hp <= 0) c.phase = 'victory';
    persist();
  }
  function resolveOrb(action, targetIndex, hero) {
    var orb = action.orb || orbData(state.equipped[hero.id]), c = state.combat;
    if (orb.kind === 'hit') enemyDamage(action.power + hero.level * 5, hero.name + ' casts ' + orb.ability, orb.color);
    else if (orb.kind === 'hitAll') { enemyDamage(action.power + hero.level * 3, hero.name + ' casts ' + orb.ability, orb.color); }
    else if (orb.kind === 'heal') { var target = state.party[targetIndex]; target.hp = Math.min(target.maxHp, target.hp + orb.power + hero.level * 4); c.log = orb.ability + ' restores ' + target.name + '.'; addEffect(78 + targetIndex * 106, 540, orb.color, 16); combatResult('+' + (orb.power + hero.level * 4), 78 + targetIndex * 106, 520, orb.color, '+'); }
    else if (orb.kind === 'healAll') { state.party.forEach(function (p) { if (p.hp > 0) { var amount = orb.power + hero.level * 2; p.hp = Math.min(p.maxHp, p.hp + amount); combatResult('+' + amount, 78 + state.party.indexOf(p) * 106, 520, orb.color, '+'); } }); c.log = orb.ability + ' restores every living ally.'; addEffect(195, 540, orb.color, 24); }
    else if (orb.kind === 'shield') { state.party.forEach(function (p) { if (p.hp > 0) { p.guard = true; p.guardTime = 2.2; combatResult('GUARD', 78 + state.party.indexOf(p) * 106, 520, orb.color, '⛨'); } }); c.log = orb.ability + ' braces the party for the next threat.'; addEffect(195, 540, orb.color, 20); }
  }
  function finishCombat() {
    var c = state.combat;
    if (!c) return;
    if (c.kind === 'boss' || c.kind === 'ascendant') {
      var elapsed = Math.max(1, state.runElapsed - (c.startedAt || state.runElapsed));
      var baseScore = c.kind === 'ascendant' ? 7000 : 5000;
      var score = clamp(Math.round(baseScore - elapsed * 8 - c.totalDamage * 3 - c.actions * 2 + (state.noWipe ? 650 : 0) + (c.enemy.phase === 1 ? 0 : c.enemy.phase === 2 ? 180 : 360)), 250, 9999999);
      state.score = score; state.lastResult = { score: score, time: elapsed, damage: c.totalDamage, actions: c.actions };
      state.profile.clearCount++; if (state.profile.clearCount >= 1) state.profile.ascendantUnlocked = state.profile.ascendantUnlocked || (state.profile.medals[1] === 'gold' && state.profile.medals[2] === 'gold' && state.profile.medals[3] === 'gold');
      state.gil += c.kind === 'ascendant' ? 360 : 180; state.orbs.forEach(function (id) { addOrb(id); });
      state.mode = 'clear'; state.combat = null; state.checkpoint = snapshot();
      showBanner(c.kind === 'ascendant' ? 'ASCENDANT WARDEN DEFEAT' : 'WARDEN DEFEAT', 'SCORE ' + score + '  |  ' + fmtTime(elapsed) + '  |  ' + c.totalDamage + ' DAMAGE', CSS.amber, 'manual');
      kit.audio.sfx('victory'); kit.audio.music('plaza'); persist();
    } else {
      var e = c.enemy, xp = 48 + state.floor * 16;
      state.gil += e.reward + 12; state.tonics += Math.random() < 0.58 ? 1 : 0;
      state.party.forEach(function (p) { if (p.hp > 0) addXp(p, xp); });
      if (Math.random() < 0.72) { var drop = state.orbs[Math.floor(Math.random() * state.orbs.length)] || 'ember'; addOrb(drop); }
      c.rewardText = '+' + (e.reward + 12) + ' gil, generous field salvage'; c.timer = 0; c.phase = 'reward';
      showBanner('CONTACT CLEARED', c.rewardText, CSS.mint, 'auto'); kit.audio.sfx('victory'); persist();
    }
  }
  function restoreCheckpoint() {
    if (!state.checkpoint) { startRun('reactor'); return; }
    applySnapshot(state.checkpoint); state.mode = 'world'; state.combat = null; state.confirm = null; state.banner = null; state.noWipe = false; clearTransient();
    state.party.forEach(function (p) { p.atb = 0; p.guard = false; p.guardTime = 0; });
    showCoach('ROUTE RESTORED · no-wipe medal lost.', 3);
    kit.audio.sfx('crystal'); persist();
    if (app.scene) app.scene.paintWorld(true);
  }
  function updateTransition(dt) {
    var tr = state.transition;
    if (!tr) return false;
    tr.time -= dt;
    if (tr.time > 0) return true;
    if (tr.phase === 'out') {
      prepareArea(tr.area, tr.floor);
      tr.phase = 'in'; tr.time = tr.max;
      if (tr.kind === 'descent') advanceTutorial(2);
      return true;
    }
    state.transition = null;
    return false;
  }
  function updateDescent(dt) {
    var d = state.descent;
    if (!d || !d.active) return false;
    d.airflow = Math.sin(state.runElapsed * 4.5 + d.layer) * 16;
    d.vz += 280 * dt;
    d.z += d.vz * dt;
    state.player.x = clamp(state.player.x + d.airflow * dt, 38, W - 38);
    state.player.y = clamp(500 - d.z * 0.32, BOARD_TOP + 48, BOARD_BOTTOM - 28);
    state.player.dir = d.airflow < -2 ? 'left' : d.airflow > 2 ? 'right' : 'down'; state.party[0].dir = state.player.dir;
    d.landing -= dt;
    if (d.z <= 0 || d.landing <= 0) { d.z = 0; d.active = false; d.landing = 0; state.player.y = 500; showBanner('LANDING LAYER ' + d.layer, 'Gravity settles. The route is live.', floorData(state.floor).accent, 'auto'); kit.audio.sfx('step'); advanceTutorial(2); }
    return true;
  }
  function fieldDamage(hazard) {
    if (state.invuln > 0 || !hazard.active || state.mode !== 'world') return;
    var target = state.party[0]; if (!target || target.hp <= 0) return;
    var actual = hurtParty(target, hazard.type === 'vent' ? 13 : 9);
    state.invuln = 1.15; state.noWipe = false; state.hazardClock = 0; hazard.telegraph = false;
    advanceTutorial(3);
    showToast('FIELD HIT · -' + actual + ' HP', 1, CSS.rose);
    emitBurst(state.player.x, state.player.y, CSS.rose, 12, 'hazard'); kit.audio.sfx('hurt');
    persist();
    if (!livingParty().length) state.mode = 'fail';
  }
  function updateHazards(dt) {
    if (state.area === 'plaza' || !state.hazards.length || state.mode !== 'world' || state.descent.active) return;
    state.invuln = Math.max(0, state.invuln - dt);
    state.hazards.forEach(function (h) {
      h.phase += dt; h.timer -= dt;
      if (h.type === 'pulse') { h.x = h.baseX + Math.sin(h.phase * 1.8) * 16; h.y = h.baseY + Math.cos(h.phase * 1.25) * 10; }
      else if (h.type === 'vent') { h.x = h.baseX + Math.sin(h.phase * 1.2) * 9; h.y = h.baseY; }
      else { h.x = h.baseX + Math.cos(h.phase * 0.65) * 18; h.y = h.baseY + Math.sin(h.phase * 0.65) * 18; }
      if (h.timer <= 0) { h.telegraph = !h.telegraph; h.timer = h.telegraph ? 0.58 : h.type === 'vent' ? 1.2 : 1.6; if (h.telegraph) kit.audio.sfx('telegraph', { rate: h.type === 'vent' ? 0.86 : 1.18 }); }
      if (h.telegraph && dist(state.player.x, state.player.y, h.x, h.y) < h.r + 12) fieldDamage(h);
    });
    if (state.invuln <= 0) state.pickups.forEach(function (p) { if (p.active && dist(state.player.x, state.player.y, p.x, p.y) < 24) collectPickup(p); });
  }
  function updateCombat(dt) {
    var c = state.combat;
    if (!c) return;
    if (c.phase === 'fight') {
      state.party.forEach(function (p) { if (p.hp > 0 && p.atb < 100) p.atb = Math.min(100, p.atb + p.speed * dt * (state.ngPlus ? 1.04 : 1)); if (p.guardTime > 0) { p.guardTime -= dt; if (p.guardTime <= 0) p.guard = false; } p.animClock += dt; if (p.animTime > 0) { p.animTime -= dt; p.animFrame = p.anim === 'hurt' ? 4 : p.anim === 'cast' ? 3 : 2; if (p.animTime <= 0) { p.anim = 'idle'; p.animFrame = Math.floor(p.animClock * 2) % 2; } } });
      if (c.enemy && c.enemy.hp > 0 && !c.enemy.telegraph) { c.enemy.atb += c.enemy.speed * dt; if (c.enemy.atb >= 100) { c.enemy.atb = 0; enemyTurn(); } }
      if (c.enemy && c.enemy.telegraph) { c.enemy.telegraph.timer -= dt; if (c.enemy.telegraph.timer <= 0) resolveTelegraph(); }
      selectReadyHero();
      if (!livingParty().length) { c.phase = 'fail'; state.noWipe = false; state.mode = 'fail'; state.banner = null; clearTransient(); c.log = 'The route collapses. Restore to the last crystal or restart the run.'; kit.audio.sfx('hurt'); }
    } else if (c.phase === 'victory') { c.timer += dt; if (c.timer > 0.8) finishCombat(); }
    else if (c.phase === 'reward') { c.timer += dt; if (c.timer > 1.9) { state.mode = 'world'; state.combat = null; if (app.scene) app.scene.paintWorld(true); } }
    if (c.enemy) { c.enemy.flash = Math.max(0, c.enemy.flash - dt); c.enemy.knockback = Math.max(0, c.enemy.knockback - dt * 70); }
  }
  function updateWorld(dt) {
    if (updateDescent(dt)) return;
    var dx = state.player.tx - state.player.x, dy = state.player.ty - state.player.y, d = Math.hypot(dx, dy);
    if (d > 2) {
      var speed = 148; var move = Math.min(d, speed * dt); state.player.x += dx / d * move; state.player.y += dy / d * move;
      state.player.walkClock += dt; state.party[0].anim = 'walk'; state.party[0].animClock = state.player.walkClock; state.party[0].animFrame = 1 + (Math.floor(state.player.walkClock * 9) % 2);
      if (Math.abs(dx) > Math.abs(dy)) state.player.dir = dx < 0 ? 'left' : 'right'; else state.player.dir = dy < 0 ? 'up' : 'down'; state.party[0].dir = state.player.dir;
    } else if (state.pendingNode || state.stepClock > 0) {
      if (state.player.path && state.player.path.length) { var next = state.player.path.shift(); state.player.tx = next.x; state.player.ty = next.y; }
      else if (state.pendingNode) { var n = state.pendingNode; state.pendingNode = null; arriveAt(n); }
      else { state.stepClock = 0; arriveAt(null); }
    }
    if (state.stepClock > 0) state.stepClock -= dt;
    updateHazards(dt);
    if (state.party[0].anim !== 'walk' && state.party[0].animTime <= 0) { state.party[0].anim = 'idle'; state.party[0].animFrame = Math.floor(state.runElapsed * 2) % 2; }
  }
  function updateBanner(dt) {
    if (!state.banner) return;
    if (state.banner.time < 90) state.banner.time -= dt;
    if (kit.juice.enabled && state.banner.scale > 1) state.banner.scale = Math.max(1, state.banner.scale - dt * 1.5);
    if (state.banner.time <= 0) state.banner = null;
  }
  function stepSim(dt) {
    updateTransient(dt);
    if (state.tipTime > 0) state.tipTime -= dt;
    state.runElapsed += state.mode === 'world' || state.mode === 'combat' ? dt : 0;
    if (state.transition && updateTransition(dt)) { readInput(); return; }
    updateBanner(dt);
    if (state.mode === 'world' && !state.confirm && !state.banner) updateWorld(dt);
    if (state.mode === 'combat' && !state.banner) updateCombat(dt);
    readInput();
    state.atb = state.party.map(function (p) { return Math.round(p.atb * 10) / 10; });
  }

  var keyEdges = {};
  var pointerClaims = {};
  var gamepadEdges = {};
  function keyPressed(code) {
    var down = kit.input.keyDown(code);
    var pressed = down && !keyEdges[code]; keyEdges[code] = down;
    return pressed;
  }
  function pointerLocal(p) {
    var rect = app.scene && app.scene.game && app.scene.game.canvas ? app.scene.game.canvas.getBoundingClientRect() : null;
    if (!rect) return { x: W / 2, y: H / 2 };
    return { x: clamp((p.x - rect.left) * W / Math.max(1, rect.width), 0, W), y: clamp((p.y - rect.top) * H / Math.max(1, rect.height), 0, H) };
  }
  function pollGamepad() {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    var pads = navigator.getGamepads(), pad = null; if (!pads) return;
    for (var i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected) { pad = pads[i]; break; }
    if (!pad) return;
    var dead = function (v) { return Math.abs(v) < 0.25 ? 0 : v; };
    var ax = dead(pad.axes[0] || 0), ay = dead(pad.axes[1] || 0);
    var pressed = function (index) { var down = !!(pad.buttons[index] && pad.buttons[index].pressed); var edge = down && !gamepadEdges[index]; gamepadEdges[index] = down; return edge; };
    if (pressed(9) || pressed(8)) { handleGamepadAction('pause'); return; }
    if (pressed(0)) handleGamepadAction('confirm');
    if (pressed(1)) handleGamepadAction('back');
    if (Math.abs(ax) > Math.abs(ay) && Math.abs(ax) > 0) handleGamepadAction(ax < 0 ? 'left' : 'right');
    else if (Math.abs(ay) > 0) handleGamepadAction(ay < 0 ? 'up' : 'down');
  }
  function handleGamepadAction(action) {
    if (state.mode === 'world' && !state.confirm && (action === 'left' || action === 'right' || action === 'up' || action === 'down')) {
      var dx = action === 'left' ? -1 : action === 'right' ? 1 : 0, dy = action === 'up' ? -1 : action === 'down' ? 1 : 0;
      if (!state.pendingNode) moveTo(state.player.x + dx * 62, state.player.y + dy * 62, null);
      return;
    }
    if (app.scene) app.scene.handleKey(action);
  }
  function readInput() {
    if (!app.scene || kit.paused) return;
    if (state.banner || state.transition) { kit.input.pointers.forEach(function (p, id) { pointerClaims[id] = p.downAt; }); keyEdges = {}; return; }
    kit.input.pointers.forEach(function (p, id) {
      if (pointerClaims[id] !== p.downAt) {
        pointerClaims[id] = p.downAt;
        var pos = pointerLocal(p); app.scene.handleTap(pos.x, pos.y);
      }
    });
    Object.keys(pointerClaims).forEach(function (id) { if (!kit.input.pointers.has(Number(id)) && !kit.input.pointers.has(id)) delete pointerClaims[id]; });
    if (keyPressed('Enter') || keyPressed('Space')) app.scene.handleKey('confirm');
    if (keyPressed('Escape') || keyPressed('KeyX')) app.scene.handleKey('back');
    if (keyPressed('ArrowUp') || keyPressed('KeyW')) app.scene.handleKey('up');
    if (keyPressed('ArrowDown') || keyPressed('KeyS')) app.scene.handleKey('down');
    if (keyPressed('ArrowLeft') || keyPressed('KeyA')) app.scene.handleKey('left');
    if (keyPressed('ArrowRight') || keyPressed('KeyD')) app.scene.handleKey('right');
    if (keyPressed('KeyP')) app.scene.handleKey('pause');
    pollGamepad();
    var moveX = (kit.input.keyDown('ArrowRight') || kit.input.keyDown('KeyD') ? 1 : 0) - (kit.input.keyDown('ArrowLeft') || kit.input.keyDown('KeyA') ? 1 : 0);
    var moveY = (kit.input.keyDown('ArrowDown') || kit.input.keyDown('KeyS') ? 1 : 0) - (kit.input.keyDown('ArrowUp') || kit.input.keyDown('KeyW') ? 1 : 0);
    if (state.mode === 'world' && !state.confirm && state.descent.active && (moveX || moveY)) { state.player.x = clamp(state.player.x + moveX * 7, 38, W - 38); state.player.dir = moveX < 0 ? 'left' : moveX > 0 ? 'right' : state.player.dir; state.party[0].dir = state.player.dir; }
    else if (state.mode === 'world' && !state.confirm && !state.descent.active && (moveX || moveY) && !state.pendingNode) { moveTo(state.player.x + moveX * 62, state.player.y + moveY * 62, null); state.stepClock = 0.04; }
  }

  function emitBurst(x, y, color, count, family) {
    if (app.scene && app.scene.emit) app.scene.emit(x, y, color, count || 10, family || 'power');
  }
  function handleWorldTap(scene, x, y) {
    if (state.banner || state.transition) return;
    if (state.descent.active) { if (y < BOARD_TOP || y > BOARD_BOTTOM) return; var oldX = state.player.x; state.player.x = clamp(x, 38, W - 38); state.player.dir = x < oldX ? 'left' : x > oldX ? 'right' : state.player.dir; state.party[0].dir = state.player.dir; return; }
    if (y > 704) {
      if (x < 133) { state.returnMode = 'world'; state.mode = 'loadout'; return; }
      if (x < 260) { state.returnMode = 'world'; state.mode = 'medals'; return; }
      if (x < 370) { showToast(state.runMode === 'glyphhunt' ? 'GLYPHS · ' + state.glyphCount + '/' + state.glyphTotal : 'CRYSTAL SAVE · GATE DESCEND', 1, CSS.dim); return; }
    }
    if (y < BOARD_TOP || y > BOARD_BOTTOM) return;
    var node = nodeAt(x, y);
    moveTo(x, y, node);
  }
  function handleCombatTap(scene, x, y) {
    var c = state.combat; if (!c) return;
    if (c.phase !== 'fight' || c.activeHero < 0 || state.banner) return;
    if (c.ui === 'root') {
      if (y >= 676 && y < 744) { var col = clamp(Math.floor((x - 10) / 74), 0, 4); c.focus = col; beginAction(['attack', 'skill', 'orb', 'item', 'guard'][col]); }
      return;
    }
    if (c.ui === 'target') {
      var hero = state.party[c.activeHero]; var action = c.pending && c.pending.action;
      if (action && action.target === 'enemy' && x > 220 && y > 122 && y < 430) chooseTarget(0, false);
      else if (action && action.target === 'ally' && y > 560 && y < 650) chooseTarget(clamp(Math.floor((x - 8) / 128), 0, 2), true);
      else if (y >= 744) { c.pending = null; c.ui = 'root'; c.log = 'Choose a new action.'; }
      return;
    }
    if (c.ui === 'confirm') {
      if (y >= 744 && y < 828 && x < 205) resolveAction();
      else if (y >= 744 && y < 828) { c.pending = null; c.ui = 'root'; c.log = 'Action canceled.'; }
    }
  }
  function handleLoadoutTap(x, y) {
    if (x > 325 && y < 115) { state.mode = state.returnMode || 'world'; return; }
    if (y >= 160 && y < 350) { state.selectedHero = clamp(Math.floor((y - 160) / 62), 0, 2); return; }
    if (y >= 400 && y < 690) {
      var idx = clamp(Math.floor((y - 400) / 56), 0, state.orbs.length - 1); var orb = state.orbs[idx];
      if (!validOrb(orb)) return;
      var hero = state.party[state.selectedHero]; var displaced = state.equipped[hero.id];
      state.party.forEach(function (p) { if (p.id !== hero.id && state.equipped[p.id] === orb) state.equipped[p.id] = displaced || null; });
      state.equipped[hero.id] = orb; state.selectedOrb = orb; showToast(orbData(orb).icon + ' ' + orbData(orb).name + ' → ' + hero.name, 1, orbData(orb).color); kit.audio.sfx('select'); persist();
    }
  }
  function handleMedalsTap(x, y) { if (x > 320 && y < 115 || y > 720) state.mode = state.returnMode || 'world'; }
  function handleConfirmTap(x, y) {
    if (!state.confirm) return;
    if (y >= 632 && y < 708 && x < 205) { restAtCrystal(); return; }
    if (y >= 632 && y < 708) { state.confirm = null; showToast('CRYSTAL · WAITING', 1, CSS.dim); }
  }
  function handleTitleTap(x, y) {
    if (y >= 430 && y < 510) startRun('reactor');
    else if (y >= 520 && y < 600) startRun('glyphhunt');
    else if (y >= 610 && y < 690 && state.profile.clearCount > 0) startRun('ngplus');
    else if (y >= 700 && y < 770 && state.profile.ascendantUnlocked) startRun('ascendant');
  }
  function handleFailTap(x, y) {
    if (y >= 650 && y < 730 && x < 205) { restoreCheckpoint(); return; }
    if (y >= 650 && y < 730) { startRun(state.runMode || 'reactor'); return; }
  }
  function handleClearTap(x, y) { if (y >= 626 && y < 708) { state.banner = null; clearTransient(); state.mode = 'title'; } }
  function handleCombatKey(action) {
    var c = state.combat;
    if (!c) return;
    if (action === 'back') {
      if (c.ui === 'confirm' || c.ui === 'target') { c.pending = null; c.ui = 'root'; c.log = 'Choose a new action.'; }
      else { c.activeHero = -1; c.ui = 'flow'; }
      return;
    }
    if (c.activeHero < 0 || c.phase !== 'fight') return;
    var actions = ['attack', 'skill', 'orb', 'item', 'guard'];
    if (c.ui === 'root') {
      if (action === 'left') c.focus = (c.focus + 4) % 5;
      else if (action === 'right') c.focus = (c.focus + 1) % 5;
      else if (action === 'up') c.focus = (c.focus + 3) % 5;
      else if (action === 'down') c.focus = (c.focus + 2) % 5;
      else if (action === 'confirm') beginAction(actions[c.focus]);
      return;
    }
    if (c.ui === 'target') {
      var a = c.pending && c.pending.action;
      if (a && a.target === 'enemy' && (action === 'left' || action === 'right' || action === 'up' || action === 'down' || action === 'confirm')) chooseTarget(0, false);
      else if (a && a.target === 'ally') {
        if (action === 'left' || action === 'up') c.targetFocus = (c.targetFocus + 2) % 3;
        if (action === 'right' || action === 'down') c.targetFocus = (c.targetFocus + 1) % 3;
        if (action === 'confirm') chooseTarget(c.targetFocus, true);
      }
      return;
    }
    if (c.ui === 'confirm' && action === 'confirm') resolveAction();
  }

  var BootScene = {
    key: 'Boot',
    create: function () { this.cameras.main.setZoom(RETINA_FACTOR); this.scene.start('Play'); }
  };
  var PlayScene = {
    key: 'Play',
    create: function () {
      this.cameras.main.setZoom(RETINA_FACTOR);
      app.scene = this;
      this.acc = 0; this.lastMode = ''; this.pauseHint = false; this.bgKey = ''; this.audioReady = false;
      this.makeTextures(); this.makeObjects();
      loadPersistent();
      if (bootFloor != null) this.forceFloor(bootFloor);
      if (bootEncounter != null) this.forceEncounter(bootEncounter);
      bootFloor = null; bootEncounter = null;
      kit.loader.show('AETHERFALL'); kit.loader.progress(0.35);
      kit.audio.preload(['plaza', 'reactor', 'warden', 'select', 'ready', 'chest', 'pickup', 'banner', 'level', 'hit', 'hurt', 'sword', 'encounter', 'bossHit', 'telegraph', 'boss', 'cast', 'door', 'secret', 'step', 'crystal', 'victory']).then(function () {
        if (!app.scene) return; app.scene.audioReady = true; kit.loader.progress(1); kit.loader.hide(); app.scene.paintAll(true);
      });
      kit.registerPWA();
    },
    makeTextures: function () {
      var scene = this;
      ['plaza', 'approach', 'floor1', 'floor2', 'floor3', 'combat'].forEach(function (name) { bakeBackground(scene, 'bg-' + name, name); });
      makeHeroSheet(scene, 'hero-kest', PARTY_BLUEPRINT[0].color, PARTY_BLUEPRINT[0].accent, 'blade');
      makeHeroSheet(scene, 'hero-vey', PARTY_BLUEPRINT[1].color, PARTY_BLUEPRINT[1].accent, 'scout');
      makeHeroSheet(scene, 'hero-nell', PARTY_BLUEPRINT[2].color, PARTY_BLUEPRINT[2].accent, 'weaver');
      PARTY_BLUEPRINT.forEach(function (p) { makePortrait(scene, 'portrait-' + p.id, p.color, p.accent, p.role); });
      makeNodeTexture(scene, 'node-crystal', 'crystal'); makeNodeTexture(scene, 'node-chest', 'chest'); makeNodeTexture(scene, 'node-gate', 'gate'); makeNodeTexture(scene, 'node-stair', 'stair'); makeNodeTexture(scene, 'node-boss', 'boss');
      makeEnemyTexture(scene, 'enemy-wisp', 'wisp', '#a98dff'); makeEnemyTexture(scene, 'enemy-mite', 'mite', '#d3f071'); makeEnemyTexture(scene, 'enemy-hound', 'hound', '#ff866f'); makeEnemyTexture(scene, 'enemy-sentinel', 'sentinel', '#c59bff'); makeEnemyTexture(scene, 'enemy-warden', 'warden', '#ff7187');
      makeTinyTexture(scene, 'spark', 8, 8, '#ffffff'); makeFxTexture(scene, 'fx-element', 'diamond'); makeFxTexture(scene, 'fx-power', 'circle'); makeFxTexture(scene, 'fx-hazard', 'triangle'); makeRingTexture(scene, 'ring', 160, '#ff7187');
      makeTinyTexture(scene, 'pickup', 22, 22, '#ffffff');
    },
    makeObjects: function () {
      var s = this;
      s.bg = s.add.image(W / 2, H / 2, 'bg-plaza').setDepth(0);
      s.combatBack = s.add.image(W / 2, H / 2, 'bg-combat').setDepth(0).setVisible(false);
      s.phaseGlow = s.add.rectangle(195, 320, 350, 260, 0xff7187, 0.05).setDepth(1).setVisible(false);
      s.worldHero = s.add.sprite(195, 410, 'hero-kest', 0).setDepth(8).setScale(0.82);
      s.worldShadow = s.add.ellipse(195, 426, 28, 9, 0x000000, 0.32).setDepth(6);
      s.layerBands = [s.add.rectangle(195, 145, 340, 32, 0x6ee7f1, 0.08).setDepth(2), s.add.rectangle(195, 265, 340, 24, 0xff9b6b, 0.06).setDepth(2), s.add.rectangle(195, 470, 340, 34, 0xc7a2ff, 0.06).setDepth(2)];
      s.hazardSprites = []; for (var hz = 0; hz < 8; hz++) s.hazardSprites.push(s.add.image(0, 0, 'fx-hazard').setDepth(4).setVisible(false));
      s.pickupSprites = []; for (var pu = 0; pu < 3; pu++) s.pickupSprites.push(s.add.image(0, 0, 'fx-element').setDepth(6).setVisible(false).setScale(1.35));
      s.nodes = []; s.nodeLabels = [];
      for (var i = 0; i < 8; i++) { s.nodes.push(s.add.image(0, 0, 'node-crystal').setDepth(5).setVisible(false)); s.nodeLabels.push(s.add.text(0, 0, '', style(8, CSS.dim)).setOrigin(0.5).setDepth(9).setVisible(false)); }
      s.combatHeroes = PARTY_BLUEPRINT.map(function (p, i) { return s.add.sprite(78 + i * 106, 350, 'hero-' + p.id, 0).setDepth(8).setScale(0.95).setVisible(false); });
      s.enemySprite = s.add.sprite(285, 230, 'enemy-wisp').setDepth(8).setVisible(false);
      s.enemyRing = s.add.image(285, 230, 'ring').setDepth(7).setVisible(false).setAlpha(0.35);
      s.hud = {};
      s.hud.mode = s.add.text(16, 18, '', style(14, CSS.cyan, true)).setDepth(20);
      s.hud.area = s.add.text(16, 43, '', style(14, CSS.text, true)).setDepth(20);
      s.hud.gil = s.add.text(374, 20, '', style(14, CSS.amber, true)).setOrigin(1, 0).setDepth(20);
      s.hud.time = s.add.text(374, 44, '', style(14, CSS.dim)).setOrigin(1, 0).setDepth(20);
      s.hud.tip = s.add.text(195, 70, '', singleLineStyle(14, CSS.text, true)).setOrigin(0.5).setDepth(25);
      s.hud.bottom = s.add.text(374, 70, '', singleLineStyle(14, CSS.dim)).setOrigin(1, 0.5).setDepth(20);
      s.hud.transientBack = s.add.rectangle(195, 70, 358, 30, 0x08141e, 0.92).setStrokeStyle(1, 0x2b6473, 1).setDepth(24).setVisible(false);
      s.hud.party = PARTY_BLUEPRINT.map(function (p, i) {
        var x = 8 + i * 128;
        var card = s.add.rectangle(x + 60, 620, 120, 52, 0x0b1c27, 0.96).setStrokeStyle(1, 0x2b6473, 0.9).setDepth(18);
        var portrait = s.add.image(x + 22, 620, 'portrait-' + p.id).setDisplaySize(30, 30).setDepth(19);
        var name = s.add.text(x + 42, 602, p.name, style(14, p.color, true)).setDepth(19);
        var hp = s.add.text(x + 42, 618, '', style(14, CSS.text)).setDepth(19);
        var atb = s.add.text(x + 42, 635, '', style(14, CSS.cyan, true)).setDepth(19);
        var atbBack = s.add.rectangle(x + 42, 650, 72, 5, 0x07131c, 1).setOrigin(0, 0.5).setDepth(19);
        var atbFill = s.add.rectangle(x + 42, 650, 1, 5, 0x6ee7f1, 1).setOrigin(0, 0.5).setDepth(20);
        var ready = s.add.rectangle(x + 113, 620, 4, 42, 0xffd36e, 1).setDepth(20).setVisible(false);
        return { card: card, portrait: portrait, name: name, hp: hp, atb: atb, atbBack: atbBack, atbFill: atbFill, ready: ready, x: x };
      });
      s.command = [];
      ['ATTACK', 'SKILL', 'ORB', 'ITEM', 'GUARD'].forEach(function (label, i) {
        var x = 10 + i * 74; var rect = s.add.rectangle(x + 34, 706, 68, 54, 0x102d39, 1).setStrokeStyle(1, 0x2b6473, 1).setDepth(25);
        var txt = s.add.text(x + 34, 706, label, style(14, CSS.cyan, true)).setOrigin(0.5).setDepth(26);
        var sub = s.add.text(x + 34, 720, '', style(7, CSS.dim)).setOrigin(0.5).setDepth(26).setVisible(false);
        s.command.push({ rect: rect, text: txt, sub: sub });
      });
      s.confirmPanel = s.add.rectangle(195, 780, 370, 66, 0x08131c, 0.98).setStrokeStyle(1, 0x6ee7f1, 1).setDepth(30);
      s.confirmText = s.add.text(195, 764, '', style(14, CSS.text, true)).setOrigin(0.5).setDepth(31);
      s.confirmSub = s.add.text(195, 782, '', style(8, CSS.dim)).setOrigin(0.5).setDepth(31).setVisible(false);
      s.confirmYes = s.add.text(110, 806, 'CONFIRM', style(14, CSS.mint, true)).setOrigin(0.5).setDepth(31);
      s.confirmNo = s.add.text(282, 806, 'BACK', style(14, CSS.rose, true)).setOrigin(0.5).setDepth(31);
      s.bossIntent = s.add.text(195, 337, '', singleLineStyle(14, CSS.rose, true)).setOrigin(0.5).setDepth(24);
      s.enemyHpBack = s.add.rectangle(225, 292, 120, 8, 0x07131c, 1).setOrigin(0, 0.5).setDepth(24);
      s.enemyHpFill = s.add.rectangle(225, 292, 120, 8, 0xff7187, 1).setOrigin(0, 0.5).setDepth(25);
      s.enemyHpText = s.add.text(285, 307, '', style(14, CSS.dim, true)).setOrigin(0.5).setDepth(25);
      s.allyMarkers = PARTY_BLUEPRINT.map(function (p, i) { return s.add.rectangle(78 + i * 106, 540, 92, 70, Phaser.Display.Color.HexStringToColor(p.color).color, 0.14).setStrokeStyle(2, Phaser.Display.Color.HexStringToColor(p.color).color, 0.9).setDepth(23).setVisible(false); });
      s.modalDim = s.add.rectangle(195, 422, W, H, 0x02070c, 0.72).setDepth(40).setVisible(false);
      s.modal = s.add.rectangle(195, 424, 350, 690, 0x0a1c27, 0.98).setStrokeStyle(1, 0x6ee7f1, 1).setDepth(41).setVisible(false);
      s.modalTitle = s.add.text(38, 102, '', style(20, CSS.cyan, true)).setDepth(42).setVisible(false);
      s.modalClose = s.add.text(350, 102, 'X', style(18, CSS.rose, true)).setOrigin(0.5).setDepth(42).setVisible(false);
      s.modalBody = s.add.text(38, 132, '', style(10, CSS.dim)).setDepth(42).setVisible(false);
      s.crystalAction = s.add.text(110, 675, 'SAVE + RESTORE', style(10, CSS.mint, true)).setOrigin(0.5).setDepth(43).setVisible(false);
      s.crystalCancel = s.add.text(280, 675, 'CANCEL', style(10, CSS.rose, true)).setOrigin(0.5).setDepth(43).setVisible(false);
      s.modalRows = [];
      for (var r = 0; r < 9; r++) s.modalRows.push(s.add.text(38, 170 + r * 56, '', style(10, CSS.text)).setDepth(42).setVisible(false));
      s.titleTexts = [
        s.add.text(195, 168, 'AETHERFALL', style(34, CSS.text, true)).setOrigin(0.5).setDepth(50),
        s.add.text(195, 204, 'THE REACTOR RUN', style(11, CSS.ember, true)).setOrigin(0.5).setDepth(50),
        s.add.text(195, 258, 'Three floors. One Warden. A party that learns to listen.', style(10, CSS.dim)).setOrigin(0.5).setDepth(50),
        s.add.text(195, 288, 'Tap a tile to walk. READY opens ATB commands.', style(10, CSS.dim)).setOrigin(0.5).setDepth(50)
      ];
      s.titleButtons = [];
      ['REACTOR RUN', 'GLYPH HUNT', 'NEW GAME+', 'WARDEN ASCENDANT'].forEach(function (label, i) {
        var y = 470 + i * 76; var rect = s.add.rectangle(195, y, 274, 54, 0x102d39, 1).setStrokeStyle(1, i === 0 ? 0x6ee7f1 : 0x2b6473, 1).setDepth(50); var text = s.add.text(195, y, label, style(11, i === 0 ? CSS.cyan : CSS.text, true)).setOrigin(0.5).setDepth(51); s.titleButtons.push({ rect: rect, text: text });
      });
      s.titleFoot = s.add.text(195, 790, 'ORBS change the command icon and ability in combat.', style(9, CSS.dim)).setOrigin(0.5).setDepth(50);
      s.bannerBack = s.add.rectangle(195, 410, 286, 108, 0x08141e, 0.96).setStrokeStyle(2, 0x6ee7f1, 1).setDepth(60).setVisible(false);
      s.bannerTitle = s.add.text(195, 393, '', style(22, CSS.text, true)).setOrigin(0.5).setDepth(61).setVisible(false);
      s.bannerSub = s.add.text(195, 430, '', style(9, CSS.dim)).setOrigin(0.5).setDepth(61).setVisible(false);
      s.clearTexts = [s.add.text(195, 170, 'AETHERFALL', style(28, CSS.text, true)).setOrigin(0.5).setDepth(55), s.add.text(195, 214, 'WARDEN SILENCED', style(14, CSS.amber, true)).setOrigin(0.5).setDepth(55), s.add.text(195, 286, '', style(11, CSS.text)).setOrigin(0.5).setDepth(55), s.add.text(195, 320, '', style(10, CSS.dim)).setOrigin(0.5).setDepth(55), s.add.text(195, 665, 'RETURN TO PLAZA', style(11, CSS.cyan, true)).setOrigin(0.5).setDepth(55)];
      s.clearPanel = s.add.rectangle(195, 665, 280, 58, 0x102d39, 1).setStrokeStyle(1, 0x6ee7f1, 1).setDepth(54).setVisible(false);
      s.failBack = s.add.rectangle(195, 430, 350, 360, 0x091923, 0.98).setStrokeStyle(2, 0xff7187, 1).setDepth(56).setVisible(false);
      s.failTitle = s.add.text(195, 282, 'ROUTE COLLAPSED', style(24, CSS.rose, true)).setOrigin(0.5).setDepth(57).setVisible(false);
      s.failBody = s.add.text(195, 350, '', style(10, CSS.text)).setOrigin(0.5).setDepth(57).setVisible(false);
      s.failRestore = s.add.text(110, 688, 'RESTORE CRYSTAL', style(10, CSS.mint, true)).setOrigin(0.5).setDepth(57).setVisible(false);
      s.failRestart = s.add.text(280, 688, 'RESTART RUN', style(10, CSS.amber, true)).setOrigin(0.5).setDepth(57).setVisible(false);
      s.pauseBack = s.add.rectangle(195, 420, 320, 180, 0x07131c, 0.96).setStrokeStyle(2, 0x6ee7f1, 1).setDepth(90).setVisible(false);
      s.pauseTitle = s.add.text(195, 374, 'PAUSED', style(24, CSS.cyan, true)).setOrigin(0.5).setDepth(91).setVisible(false);
      s.pauseSub = s.add.text(195, 430, 'Settings are open. Resume from the settings shell.', style(9, CSS.dim)).setOrigin(0.5).setDepth(91).setVisible(false);
      s.transitionRect = s.add.rectangle(195, 422, W, H, 0x000000, 1).setDepth(100).setVisible(false);
      s.particlePools = { element: [], power: [], hazard: [] }; s.particleIndex = { element: 0, power: 0, hazard: 0 };
      ['element', 'power', 'hazard'].forEach(function (family) { for (var q = 0; q < 36; q++) s.particlePools[family].push(s.add.image(0, 0, 'fx-' + family).setDepth(70).setVisible(false)); });
    },
    handleTap: function (x, y) {
      if (state.pauseHint) return;
      if (state.mode === 'title') { handleTitleTap(x, y); return; }
      if (state.mode === 'world') { if (state.confirm) handleConfirmTap(x, y); else handleWorldTap(this, x, y); return; }
      if (state.mode === 'combat') { handleCombatTap(this, x, y); return; }
      if (state.mode === 'loadout') { handleLoadoutTap(x, y); return; }
      if (state.mode === 'medals') { handleMedalsTap(x, y); return; }
      if (state.mode === 'floorclear') { if (y > 610) continueFloor(); return; }
      if (state.mode === 'clear') { handleClearTap(x, y); return; }
      if (state.mode === 'fail') { handleFailTap(x, y); }
    },
    handleKey: function (action) {
      if (action === 'pause') { if (!kit.paused && state.mode !== 'title') kit.openSettings(); return; }
      if (state.confirm) { if (action === 'confirm') restAtCrystal(); else if (action === 'back') { state.confirm = null; showToast('CRYSTAL · WAITING', 1, CSS.dim); } return; }
      if (state.mode === 'title' && action === 'confirm') startRun('reactor');
      else if (state.mode === 'world' && action === 'confirm' && !state.descent.active && !state.banner && !state.transition) { var near = nodeAt(state.player.x, state.player.y); if (near) arriveAt(near); }
      else if (state.mode === 'combat') handleCombatKey(action);
      else if ((state.mode === 'loadout' || state.mode === 'medals') && action === 'back') state.mode = state.returnMode || 'world';
      else if (state.mode === 'floorclear' && action === 'confirm') continueFloor();
      else if (state.mode === 'clear' && action === 'confirm') state.mode = 'title';
      else if (state.mode === 'fail' && action === 'confirm') restoreCheckpoint();
    },
    forceFloor: function (floor) { if (state.mode === 'title' || state.mode === 'clear' || state.mode === 'fail') startRun('reactor'); state.combat = null; state.confirm = null; state.banner = null; state.pendingNode = null; state.transition = null; if (floor <= 0) { prepareArea('plaza', 0); } else enterFloor(floor, true); showToast('FLOOR ' + floor + ' LOADED', 1, CSS.cyan); },
    forceEncounter: function (kind) { if (state.mode === 'title' || state.mode === 'clear' || state.mode === 'fail') startRun('reactor'); state.banner = null; state.confirm = null; if (kind === 'boss' || kind === 'warden' || kind === 'ascendant') startBoss(kind === 'ascendant'); else startEncounter('normal'); },
    emit: function (x, y, color, count, family) { if (!kit.juice.enabled) return; family = this.particlePools[family] ? family : 'power'; var pool = this.particlePools[family]; for (var i = 0; i < count; i++) { var p = pool[this.particleIndex[family]++ % pool.length]; p.setPosition(x, y).setTint(Phaser.Display.Color.HexStringToColor(color).color).setScale(family === 'element' ? 0.55 + Math.random() * 0.85 : family === 'hazard' ? 0.7 + Math.random() * 0.7 : 0.45 + Math.random() * 0.8).setAlpha(0.9).setVisible(true); p._vx = family === 'hazard' ? (Math.random() - 0.5) * 80 : (Math.random() - 0.5) * 150; p._vy = family === 'element' ? -40 - Math.random() * 90 : (Math.random() - 0.5) * 150; p._life = family === 'hazard' ? 0.45 + Math.random() * 0.5 : family === 'element' ? 0.5 + Math.random() * 0.5 : 0.25 + Math.random() * 0.4; p._max = p._life; } },
    paintAll: function (force) { this.paintTitle(); this.paintWorld(force); this.paintCombat(force); this.paintModal(force); this.paintClear(); this.paintFail(); this.paintPause(); this.paintTransition(); this.paintBanner(force); },
    paintTitle: function () {
      var active = state.mode === 'title';
      this.titleTexts.forEach(function (t) { t.setVisible(active); });
      this.titleButtons.forEach(function (b, i) {
        b.rect.setVisible(active); b.text.setVisible(active);
        if (active && i > 1 && state.profile.clearCount <= 0) { b.rect.setAlpha(0.25); b.text.setAlpha(0.35); }
        else if (active) { b.rect.setAlpha(1); b.text.setAlpha(1); }
      });
      this.titleFoot.setVisible(active);
    },
    paintWorld: function (force) {
      var visible = state.mode === 'world' || state.mode === 'loadout' || state.mode === 'medals' || state.mode === 'floorclear';
      var areaKey = state.area === 'plaza' ? 'plaza' : state.area === 'approach' ? 'approach' : 'floor' + clamp(state.floor, 1, 3);
      if (this.bgKey !== areaKey && visible) { this.bgKey = areaKey; this.bg.setTexture('bg-' + areaKey); }
      this.bg.setVisible(visible && state.mode !== 'title' && state.mode !== 'clear' && state.mode !== 'fail'); this.worldHero.setVisible(visible && state.mode !== 'title' && state.mode !== 'clear' && state.mode !== 'fail'); this.worldShadow.setVisible(this.worldHero.visible && !state.descent.active);
      this.layerBands.forEach(function (band, i) { band.setY(145 + i * 150 + ((state.descent.z || 0) * (i + 1) * 0.22) % 36); band.setVisible(visible && state.area !== 'plaza'); });
      if (this.worldHero.visible) { this.worldHero.setPosition(state.player.x, state.player.y - 4 - (state.descent.z || 0) * 0.05); this.worldShadow.setPosition(state.player.x, state.player.y + 14); this.worldHero.setTexture('hero-' + state.party[0].id); this.worldHero.setFrame(frameFor(state.party[0], state.party[0].anim === 'walk')); this.worldHero.setAlpha(state.invuln > 0 ? 0.55 : 1); }
      this.hud.mode.setVisible(visible); this.hud.area.setVisible(visible); this.hud.gil.setVisible(visible); this.hud.time.setVisible(visible); this.hud.tip.setVisible(false); this.hud.transientBack.setVisible(false); this.hud.bottom.setVisible(visible && state.mode === 'world');
      this.hud.party.forEach(function (card, i) { card.card.setVisible(visible); card.portrait.setVisible(visible); card.name.setVisible(visible); card.hp.setVisible(visible); card.atb.setVisible(visible); card.atbBack.setVisible(visible); card.atbFill.setVisible(visible); card.ready.setVisible(false); });
      this.command.forEach(function (c) { c.rect.setVisible(false); c.text.setVisible(false); c.sub.setVisible(false); }); this.confirmPanel.setVisible(false); this.confirmText.setVisible(false); this.confirmSub.setVisible(false); this.confirmYes.setVisible(false); this.confirmNo.setVisible(false); this.bossIntent.setVisible(false); this.enemySprite.setVisible(false); this.enemyRing.setVisible(false); this.combatHeroes.forEach(function (s) { s.setVisible(false); });
      if (!visible) return;
      setTextIfChanged(this.hud.mode, state.runMode === 'reactor' ? 'REACTOR' : state.runMode === 'glyphhunt' ? 'GLYPH HUNT' : state.runMode === 'ngplus' ? 'NEW GAME+' : 'ASCENDANT');
      setTextIfChanged(this.hud.area, state.area === 'plaza' ? 'PLAZA' : state.area === 'approach' ? 'APPROACH' : 'F' + state.floor + ' · ' + floorData(state.floor).short);
      setTextIfChanged(this.hud.gil, '◈ ' + state.gil);
      setTextIfChanged(this.hud.time, '◷ ' + fmtTime(state.runElapsed) + (state.area === 'reactor' ? '  ✦ ' + state.glyphCount + '/' + state.glyphTotal : ''));
      setTextIfChanged(this.hud.bottom, '◒  ◇  ?  ⚙');
      this.hud.party.forEach(function (card, i) { var p = state.party[i], ratio = clamp(p.atb / 100, 0, 1); setTextIfChanged(card.name, p.name); setTextIfChanged(card.hp, '♥ ' + Math.max(0, p.hp) + '/' + p.maxHp); setTextIfChanged(card.atb, p.atb >= 100 ? 'READY' : ''); card.atbFill.setDisplaySize(Math.max(2, 72 * ratio), 5); card.atbFill.setFillStyle(p.atb >= 100 ? 0xffd36e : Phaser.Display.Color.HexStringToColor(p.color).color, 1); setColorIfChanged(card.atb, p.atb >= 100 ? CSS.amber : CSS.cyan); });
      var nodes = nodeList(); for (var i = 0; i < this.nodes.length; i++) { var node = nodes[i]; if (!node) { this.nodes[i].setVisible(false); this.nodeLabels[i].setVisible(false); continue; } var tex = node.type === 'crystal' ? 'node-crystal' : node.type === 'chest' ? 'node-chest' : node.type === 'pickup' ? 'fx-element' : node.type === 'gate' || node.type === 'reactor' ? 'node-gate' : node.type === 'boss' ? 'node-boss' : 'node-stair'; this.nodes[i].setTexture(tex).setPosition(node.x, node.y).setVisible(node.type !== 'pickup').setScale(node.type === 'pickup' ? 1.15 : 1); this.nodeLabels[i].setVisible(false); }
      for (i = nodes.length; i < this.nodes.length; i++) { this.nodes[i].setVisible(false); this.nodeLabels[i].setVisible(false); }
      for (i = 0; i < this.hazardSprites.length; i++) { var hz = state.hazards[i]; if (!hz || !hz.active) { this.hazardSprites[i].setVisible(false); continue; } this.hazardSprites[i].setPosition(hz.x, hz.y).setTint(Phaser.Display.Color.HexStringToColor(hz.color).color).setScale(hz.telegraph ? 1.35 : 0.9).setAlpha(hz.telegraph ? 0.95 : 0.48).setVisible(visible && state.area !== 'plaza'); }
      for (i = 0; i < this.pickupSprites.length; i++) { var pu = state.pickups[i]; if (!pu || !pu.active) { this.pickupSprites[i].setVisible(false); continue; } this.pickupSprites[i].setPosition(pu.x, pu.y + Math.sin(state.runElapsed * 3 + i) * 5).setTint(Phaser.Display.Color.HexStringToColor(orbData(pu.orb).color).color).setVisible(visible); }
      this.paintModal(force); this.paintTransient(); this.paintBanner(force);
    },
    paintCombat: function (force) {
      var active = state.mode === 'combat';
      this.combatBack.setVisible(active); this.phaseGlow.setVisible(active); if (active && state.combat) { var phaseTint = state.combat.enemy.phase === 3 ? 0xc7a2ff : state.combat.enemy.phase === 2 ? 0xff9b6b : 0x6ee7f1; this.phaseGlow.setFillStyle(phaseTint, state.combat.enemy.phase === 3 ? 0.12 : 0.07); }
      this.combatHeroes.forEach(function (s, i) { s.setVisible(active); if (active) { var p = state.party[i]; s.setTexture('hero-' + p.id).setFrame(frameFor(p, false)).setPosition(78 + i * 106, 500); s.setAlpha(p.hp > 0 ? 1 : 0.3); } });
      this.enemySprite.setVisible(active); this.enemyRing.setVisible(active && state.combat && state.combat.pending && state.combat.pending.action.target === 'enemy');
      this.hud.bottom.setVisible(false); this.bossIntent.setVisible(false); this.enemyHpBack.setVisible(active); this.enemyHpFill.setVisible(active); this.enemyHpText.setVisible(active); this.hud.party.forEach(function (card) { card.card.setVisible(active); card.portrait.setVisible(active); card.name.setVisible(active); card.hp.setVisible(active); card.atb.setVisible(active); card.atbBack.setVisible(active); card.atbFill.setVisible(active); });
      this.command.forEach(function (c) { c.rect.setVisible(active); c.text.setVisible(active); c.sub.setVisible(false); });
      this.confirmPanel.setVisible(active); this.confirmText.setVisible(active); this.confirmSub.setVisible(false); this.confirmYes.setVisible(active); this.confirmNo.setVisible(active);
      this.allyMarkers.forEach(function (m) { m.setVisible(false); });
      this.paintTransient();
      if (!active || !state.combat) return;
      var c = state.combat, e = c.enemy, ed = e.boss ? 'enemy-warden' : 'enemy-' + enemyData(e.family).family;
      var enemyX = 285 + (e.knockback || 0) * 0.35; this.enemySprite.setTexture(ed).setPosition(enemyX, e.boss ? 235 : 246).setScale(e.boss ? 1.15 : 0.92).setAlpha(e.hp > 0 ? 1 : 0.22); this.enemyRing.setPosition(285, e.boss ? 235 : 246).setScale(e.boss ? 1.0 : 0.7); this.enemyRing.setVisible(!!(c.pending && c.pending.action.target === 'enemy')); if (e.flash > 0) this.enemySprite.setTint(0xffffff); else this.enemySprite.clearTint();
      var enemyRatio = clamp(e.hp / e.maxHp, 0, 1); this.enemyHpFill.setDisplaySize(Math.max(2, 120 * enemyRatio), 8); this.enemyHpFill.setFillStyle(e.phase === 3 ? 0xc7a2ff : e.phase === 2 ? 0xff9b6b : 0xff7187, 1); setTextIfChanged(this.enemyHpText, e.boss ? 'WARDEN' : e.name);
      setTextIfChanged(this.bossIntent, e.telegraph ? '⚠ ' + e.telegraph.name + '  ' + Math.max(0, e.telegraph.timer).toFixed(1) + 's' : ''); this.bossIntent.setVisible(active && !!e.telegraph); setColorIfChanged(this.bossIntent, CSS.rose);
      this.hud.party.forEach(function (card, i) { var p = state.party[i], ratio = clamp(p.atb / 100, 0, 1); setTextIfChanged(card.name, p.name); setTextIfChanged(card.hp, '♥ ' + Math.max(0, p.hp) + '/' + p.maxHp); setTextIfChanged(card.atb, p.atb >= 100 ? 'READY' : ''); card.atbFill.setDisplaySize(Math.max(2, 72 * ratio), 5); card.atbFill.setFillStyle(p.atb >= 100 ? 0xffd36e : Phaser.Display.Color.HexStringToColor(p.color).color, 1); card.ready.setVisible(p.atb >= 100); card.ready.setAlpha(c.activeHero === i ? 1 : 0.42); setColorIfChanged(card.atb, p.atb >= 100 ? CSS.amber : CSS.cyan); });
      if (c.pending && c.pending.action.target === 'ally') { var targetIndex = c.pending.target == null ? c.targetFocus : c.pending.target; if (targetIndex >= 0) this.allyMarkers[targetIndex].setVisible(true); }
      var activeHero = c.activeHero >= 0 ? state.party[c.activeHero] : null;
      for (var i = 0; i < this.command.length; i++) { var label = i === 2 && activeHero ? orbData(state.equipped[activeHero.id]).icon + ' ORB' : i === 3 ? 'ITEM ' + state.tonics : ['ATTACK', 'SKILL', '', '', 'GUARD'][i]; setTextIfChanged(this.command[i].text, label); setTextIfChanged(this.command[i].sub, ''); setColorIfChanged(this.command[i].text, activeHero ? (i === 2 ? orbData(state.equipped[activeHero.id]).color : CSS.cyan) : CSS.dim); this.command[i].rect.setStrokeStyle(i === c.focus && c.ui === 'root' ? 2 : 1, i === c.focus && c.ui === 'root' ? 0xffd36e : 0x2b6473, 1); }
      if (!activeHero) { setTextIfChanged(this.confirmText, 'ATB FLOWING'); setTextIfChanged(this.confirmYes, ''); setTextIfChanged(this.confirmNo, ''); }
      else if (c.ui === 'root') { setTextIfChanged(this.confirmText, activeHero.name + ' READY'); setTextIfChanged(this.confirmYes, ''); setTextIfChanged(this.confirmNo, ''); }
      else if (c.ui === 'target') { setTextIfChanged(this.confirmText, c.pending.action.label + ' · TARGET'); setTextIfChanged(this.confirmYes, 'BACK'); setTextIfChanged(this.confirmNo, ''); }
      else { setTextIfChanged(this.confirmText, 'CONFIRM ' + c.pending.action.label + '?'); setTextIfChanged(this.confirmYes, 'CONFIRM'); setTextIfChanged(this.confirmNo, 'BACK'); }
      this.paintBanner(force);
    },
    paintTransient: function () {
      var active = (state.mode === 'world' || state.mode === 'combat') && state.toastTime > 0 && !!state.toast;
      this.hud.tip.setVisible(active); this.hud.transientBack.setVisible(active); if (active) this.hud.bottom.setVisible(false);
      if (!active) return;
      var coach = state.toastKind === 'coach';
      this.hud.transientBack.setPosition(coach ? 195 : 264, 70).setDisplaySize(coach ? 358 : 220, 30);
      this.hud.tip.setPosition(coach ? 195 : 374, 70).setOrigin(coach ? 0.5 : 1, 0.5);
      setTextIfChanged(this.hud.tip, state.toast); setColorIfChanged(this.hud.tip, state.toastColor || CSS.text);
      var fade = coach ? 0.65 : 0.22;
      var alpha = kit.juice.enabled ? clamp(state.toastTime / fade, 0, 1) : 1;
      this.hud.tip.setAlpha(alpha); this.hud.transientBack.setAlpha(alpha * 0.92);
    },
    paintModal: function (force) {
      var crystal = !!state.confirm;
      var modal = state.mode === 'loadout' || state.mode === 'medals' || crystal;
      this.modalDim.setVisible(modal); this.modal.setVisible(modal); this.modalTitle.setVisible(modal); this.modalClose.setVisible(modal && !crystal); this.modalBody.setVisible(modal); this.modalRows.forEach(function (r) { r.setVisible(modal); }); this.crystalAction.setVisible(crystal); this.crystalCancel.setVisible(crystal);
      if (!modal) return;
      setTextIfChanged(this.modalTitle, crystal ? 'CRYSTAL SAVE' : state.mode === 'loadout' ? 'ORB LOADOUT' : 'MEDAL CHAIN'); setTextIfChanged(this.modalBody, crystal ? 'Attune this crystal to save the route and restore every party member to full HP.' : state.mode === 'loadout' ? 'Select a hero, then socket an orb. Combat icons update immediately.' : 'Floor medals use time, no-wipe, and glyph completion. Gold on all three unlocks the Ascendant finale.');
      if (crystal) { this.modalRows.forEach(function (r, i) { setTextIfChanged(r, i === 0 ? 'SAVE BEAT\n    Party restored to full. Route locked to this crystal.' : i === 1 ? 'This is safe to confirm. The crystal only changes the local route.' : ''); }); return; }
      if (state.mode === 'loadout') {
        this.modalRows.forEach(function (r, i) { if (i < 3) { var p = state.party[i], orb = state.equipped[p.id]; setTextIfChanged(r, (i === state.selectedHero ? '▶ ' : '  ') + p.name + '  ' + p.role + '\n    SOCKET  ' + (orb ? orbData(orb).icon + ' ' + orbData(orb).name : 'EMPTY')); setColorIfChanged(r, i === state.selectedHero ? p.color : CSS.text); } else if (i === 3) setTextIfChanged(r, 'ORB SATCHEL'); else { var oi = i - 4; if (oi < state.orbs.length) { var od = orbData(state.orbs[oi]); setTextIfChanged(r, '  ' + od.icon + '  ' + od.name + '  |  ' + od.ability + '\n      ' + od.desc); setColorIfChanged(r, od.color); } else setTextIfChanged(r, ''); } });
      } else {
        this.modalRows.forEach(function (r, i) { if (i < 3) { var f = i + 1, info = floorData(f), stat = state.floorStats[f] || {}, medal = state.profile.medals[f]; setTextIfChanged(r, 'FLOOR ' + f + '  ' + info.short + '   ' + medal.toUpperCase() + '\n    ' + (stat.time ? fmtTime(stat.time) : '--:--') + ' time   ' + (stat.chest ? 'GLYPH FOUND' : 'GLYPH OPEN') + '   ' + (state.noWipe ? 'NO-WIPE' : 'WIPE')); setColorIfChanged(r, medal === 'gold' ? CSS.amber : medal === 'silver' ? CSS.cyan : medal === 'bronze' ? CSS.ember : CSS.dim); } else if (i === 4) setTextIfChanged(r, 'CLEARS  ' + state.profile.clearCount + '     SCORE  ' + state.score + '     GLYPHS ' + state.glyphCount + '/' + state.glyphTotal); else if (i === 5) setTextIfChanged(r, state.profile.ascendantUnlocked ? 'ASCENDANT FINALE  UNLOCKED' : 'ASCENDANT FINALE  LOCKED'); else setTextIfChanged(r, ''); });
      }
    },
    paintBanner: function () {
      var b = state.banner; var visible = !!b && (state.mode === 'floorclear' || state.mode === 'clear'); this.bannerBack.setVisible(visible); this.bannerTitle.setVisible(visible); this.bannerSub.setVisible(visible); if (!visible) return;
      var scale = b.scale || 1; this.bannerBack.setScale(scale); this.bannerTitle.setScale(scale); this.bannerSub.setScale(scale); this.bannerBack.setStrokeStyle(2, Phaser.Display.Color.HexStringToColor(b.color).color, 1); setTextIfChanged(this.bannerTitle, b.title); setTextIfChanged(this.bannerSub, b.subtitle); setColorIfChanged(this.bannerTitle, b.color); if (b.behavior === 'manual') setTextIfChanged(this.bannerSub, b.subtitle + '  |  TAP TO CONTINUE');
    },
    paintClear: function () {
      var active = state.mode === 'clear';
      this.clearPanel.setVisible(active); this.clearTexts.forEach(function (t) { t.setVisible(active); });
      if (!active) return;
      setTextIfChanged(this.clearTexts[2], 'CLEAR ' + state.profile.clearCount + '     GIL ' + state.gil + '     SCORE ' + state.score);
      setTextIfChanged(this.clearTexts[3], state.profile.ascendantUnlocked ? 'Warden Ascendant is unlocked by the gold medal chain.' : 'New Game+ is unlocked. Gold all floors to open the Ascendant finale.');
    },
    paintFail: function () {
      var active = state.mode === 'fail';
      this.failBack.setVisible(active); this.failTitle.setVisible(active); this.failBody.setVisible(active); this.failRestore.setVisible(active); this.failRestart.setVisible(active);
      if (active) setTextIfChanged(this.failBody, 'The party fell before the reactor could answer.\nRestore the last crystal, or restart with a clean route.\n\nSCORE  ' + state.score + '     NO-WIPE  LOST');
    },
    paintPause: function () {
      var active = !!state.pauseHint;
      this.pauseBack.setVisible(active); this.pauseTitle.setVisible(active); this.pauseSub.setVisible(active);
    },
    paintTransition: function () {
      var tr = state.transition, visible = !!tr;
      this.transitionRect.setVisible(visible); if (!visible) return;
      var alpha = tr.phase === 'out' ? 1 - clamp(tr.time / tr.max, 0, 1) : clamp(tr.time / tr.max, 0, 1);
      this.transitionRect.setAlpha(alpha);
    },
    updateParticles: function (dt) { var scene = this; Object.keys(this.particlePools).forEach(function (family) { scene.particlePools[family].forEach(function (p) { if (!p.visible) return; p.x += p._vx * dt; p.y += p._vy * dt; p._life -= dt; p.setAlpha(clamp(p._life / p._max, 0, 1)); if (p._life <= 0) p.setVisible(false); }); }); },
    update: function (time, delta) {
      var dt = Math.min(0.08, Math.max(0, delta / 1000)); if (kit.paused) { this.paintAll(false); return; }
      var juice = kit.juice.frame(); if (juice.frozen) { this.updateParticles(0); this.paintAll(false); return; } this.acc += dt; var steps = 0;
      while (this.acc >= STEP && steps < MAX_STEPS) { this.acc -= STEP; stepSim(STEP); steps++; }
      /* If a device falls behind, leave time in the accumulator. The sim does
       * not jump ahead to real time, so the game becomes slow motion instead
       * of skipping clocks or encounter checks. */
      if (this.acc > STEP * MAX_STEPS) this.acc = STEP * MAX_STEPS;
      this.updateParticles(dt); this.paintAll(false);
    }
  };

  function style(size, color, bold) { return { fontFamily: 'monospace', fontSize: size + 'px', color: color, fontStyle: bold ? 'bold' : 'normal', stroke: '#061018', strokeThickness: bold ? 2 : 0, wordWrap: { width: 320 } }; }
  function singleLineStyle(size, color, bold) { return { fontFamily: 'monospace', fontSize: size + 'px', color: color, fontStyle: bold ? 'bold' : 'normal', stroke: '#061018', strokeThickness: bold ? 2 : 0 }; }
  function frameFor(hero, walking) {
    var dir = hero.dir === 'left' ? 1 : hero.dir === 'right' ? 2 : hero.dir === 'up' ? 3 : 0;
    var frame = hero.animFrame == null ? (hero.anim === 'hurt' ? 4 : hero.anim === 'cast' ? 3 : hero.anim === 'attack' ? 2 : hero.anim === 'victory' ? 5 : walking ? 1 : 0) : hero.animFrame;
    return dir * 6 + clamp(Math.floor(frame), 0, 5);
  }
  function makeHeroSheet(scene, key, color, accent, role) {
    var canvas = document.createElement('canvas'); canvas.width = 64 * 6; canvas.height = 64 * 4; var c = canvas.getContext('2d'); c.imageSmoothingEnabled = false;
    for (var dir = 0; dir < 4; dir++) for (var frame = 0; frame < 6; frame++) { var ox = frame * 64, oy = dir * 64; c.save(); c.translate(ox, oy); c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(16, 54, 32, 5); c.fillStyle = color; c.fillRect(22, 16, 20, 22); c.fillStyle = '#09151f'; c.fillRect(25, 11, 14, 11); c.fillStyle = accent; c.fillRect(29, 15, 4, 4); c.fillStyle = color; c.fillRect(16, 25, 8, 5); c.fillRect(40, 25, 8, 5); c.fillRect(24, 38, 7, 14); c.fillRect(34, 38, 7, 14);
      c.strokeStyle = accent; c.lineWidth = 3; c.beginPath(); if (role === 'blade') { c.moveTo(44, frame === 2 ? 18 : 29); c.lineTo(frame === 2 ? 61 : 55, frame === 2 ? 9 : 30); } else if (role === 'scout') { c.moveTo(44, 27); c.lineTo(60, 20); c.lineTo(60, 34); } else { c.arc(50, 25, 9, 0, TAU); } c.stroke();
      if (frame === 1) { c.fillStyle = accent; c.fillRect(18, 51, 9, 3); c.fillRect(37, 49, 9, 3); } if (frame === 3) { c.fillStyle = accent; c.globalAlpha = 0.6; c.fillRect(10, 8, 5, 5); c.fillRect(50, 4, 4, 4); c.globalAlpha = 1; } if (frame === 4) { c.fillStyle = '#ff7187'; c.fillRect(13, 20, 5, 3); } if (frame === 5) { c.fillStyle = accent; c.fillRect(9, 8, 7, 3); c.fillRect(48, 8, 7, 3); } c.restore(); }
    scene.textures.addSpriteSheet(key, canvas, { frameWidth: 64, frameHeight: 64, endFrame: 23 });
  }
  function makePortrait(scene, key, color, accent, role) { var canvas = document.createElement('canvas'); canvas.width = 80; canvas.height = 80; var c = canvas.getContext('2d'); c.fillStyle = '#102d39'; c.fillRect(0, 0, 80, 80); c.strokeStyle = accent; c.lineWidth = 3; c.strokeRect(4, 4, 72, 72); c.fillStyle = color; c.fillRect(23, 24, 34, 35); c.fillStyle = '#09151f'; c.fillRect(30, 18, 20, 14); c.fillStyle = accent; c.fillRect(35, 23, 4, 4); c.fillStyle = color; c.fillRect(19, 35, 8, 6); c.fillRect(53, 35, 8, 6); c.fillStyle = accent; c.fillRect(27, 61, 10, 8); c.fillRect(43, 61, 10, 8); scene.textures.addCanvas(key, canvas); }
  function makeNodeTexture(scene, key, type) { var g = scene.make.graphics({ x: 0, y: 0, add: false }); if (type === 'crystal') { g.fillStyle(0x6ee7f1, 1); g.fillTriangle(24, 2, 42, 24, 34, 48); g.fillStyle(0xe7fbff, 0.8); g.fillTriangle(24, 8, 28, 29, 20, 25); } else if (type === 'chest') { g.fillStyle(0xffb56e, 1); g.fillRect(4, 14, 40, 24); g.lineStyle(2, 0xffe16c, 1); g.strokeRect(4, 14, 40, 24); g.fillStyle(0x102d39, 1); g.fillRect(22, 24, 5, 7); } else if (type === 'gate') { g.lineStyle(4, 0x6ee7f1, 1); g.strokeRect(7, 4, 34, 46); g.lineStyle(1, 0x2b6473, 1); for (var y = 13; y < 47; y += 9) g.lineBetween(8, y, 40, y); } else if (type === 'stair') { g.fillStyle(0xc7a2ff, 1); for (var i = 0; i < 5; i++) g.fillRect(5 + i * 7, 40 - i * 7, 30, 6); } else { g.fillStyle(0xff7187, 1); g.fillTriangle(24, 2, 47, 45, 1, 45); g.lineStyle(2, 0xffd36e, 1); g.strokeTriangle(24, 2, 47, 45, 1, 45); } g.generateTexture(key, 48, 52); g.destroy(); }
  function makeEnemyTexture(scene, key, type, color) { var canvas = document.createElement('canvas'); canvas.width = 96; canvas.height = 96; var c = canvas.getContext('2d'); c.fillStyle = color; c.strokeStyle = '#ffe6a8'; c.lineWidth = 3; c.beginPath(); if (type === 'wisp') { c.arc(48, 46, 27, 0, TAU); c.fill(); c.stroke(); c.fillStyle = '#15132a'; c.fillRect(35, 40, 8, 5); c.fillRect(53, 40, 8, 5); } else if (type === 'mite') { c.moveTo(48, 12); c.lineTo(76, 45); c.lineTo(65, 78); c.lineTo(31, 78); c.lineTo(20, 45); c.closePath(); c.fill(); c.stroke(); } else if (type === 'hound') { c.moveTo(16, 70); c.lineTo(22, 32); c.lineTo(40, 42); c.lineTo(52, 20); c.lineTo(73, 41); c.lineTo(82, 72); c.closePath(); c.fill(); c.stroke(); } else if (type === 'sentinel') { c.rect(22, 18, 52, 56); c.fill(); c.stroke(); c.fillStyle = '#111828'; c.fillRect(32, 39, 12, 7); c.fillRect(52, 39, 12, 7); } else { c.moveTo(48, 6); c.lineTo(78, 28); c.lineTo(70, 79); c.lineTo(25, 79); c.lineTo(18, 28); c.closePath(); c.fill(); c.stroke(); c.fillStyle = '#211321'; c.fillRect(29, 37, 13, 7); c.fillRect(54, 37, 13, 7); c.fillStyle = '#ffe16c'; c.fillRect(32, 38, 7, 4); c.fillRect(54, 38, 7, 4); } c.closePath(); scene.textures.addCanvas(key, canvas); }
  function makeTinyTexture(scene, key, w, h, color) { var g = scene.make.graphics({ x: 0, y: 0, add: false }); g.fillStyle(0xffffff, 1); g.fillRect(0, 0, w, h); g.generateTexture(key, w, h); g.destroy(); }
  function makeFxTexture(scene, key, shape) { var g = scene.make.graphics({ x: 0, y: 0, add: false }); g.fillStyle(0xffffff, 1); if (shape === 'diamond') g.fillTriangle(10, 0, 20, 10, 10, 20), g.fillTriangle(10, 20, 0, 10, 10, 0); else if (shape === 'triangle') g.fillTriangle(10, 0, 20, 20, 0, 20); else g.fillCircle(10, 10, 8); g.generateTexture(key, 20, 20); g.destroy(); }
  function makeRingTexture(scene, key, size, color) { var canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size; var c = canvas.getContext('2d'); c.strokeStyle = color; c.lineWidth = 5; c.globalAlpha = 0.85; c.beginPath(); c.arc(size / 2, size / 2, size / 2 - 10, 0, TAU); c.stroke(); scene.textures.addCanvas(key, canvas); }
  function bakeBackground(scene, key, kind) { var g = scene.make.graphics({ x: 0, y: 0, add: false }); g.fillStyle(kind === 'plaza' ? 0x17323a : kind === 'approach' ? 0x10353a : kind === 'combat' ? 0x10172b : floorData(Number(kind.slice(-1))).deep, 1); g.fillRect(0, 0, W, H); g.fillStyle(kind === 'plaza' ? 0x224e55 : kind === 'approach' ? 0x1b5a54 : kind === 'combat' ? 0x241631 : 0x16243a, 1); g.fillRect(0, BOARD_TOP, W, BOARD_BOTTOM - BOARD_TOP);
    for (var x = 0; x < W; x += 30) { g.lineStyle(1, kind === 'plaza' ? 0x2f6265 : 0x25485a, 0.55); g.lineBetween(x, BOARD_TOP, x, BOARD_BOTTOM); } for (var y = BOARD_TOP; y < BOARD_BOTTOM; y += 30) { g.lineStyle(1, kind === 'plaza' ? 0x2f6265 : 0x25485a, 0.55); g.lineBetween(0, y, W, y); }
    for (var tx = 16; tx < W; tx += 48) for (var ty = BOARD_TOP + 16; ty < BOARD_BOTTOM; ty += 48) { g.fillStyle((tx / 48 + ty / 48) % 2 ? 0x1d4552 : 0x183b49, 0.34); g.fillRect(tx, ty, 28, 3); g.fillRect(tx + 12, ty + 3, 3, 20); }
    g.fillStyle(0x6ee7f1, kind === 'combat' ? 0.12 : 0.06); g.fillEllipse(195, 260, 270, 180); g.fillStyle(0xffd36e, 0.07); g.fillEllipse(88, 420, 150, 90);
    if (kind === 'plaza') { g.fillStyle(0x2c685f, 1); g.fillRect(20, 150, 115, 100); g.fillStyle(0x8bcf9a, 1); g.fillRect(32, 136, 92, 12); g.fillStyle(0x3d7270, 1); g.fillRect(258, 135, 100, 105); g.fillStyle(0xffd36e, 1); g.fillRect(270, 121, 76, 14); g.fillStyle(0x0c202b, 1); g.fillRect(45, 184, 64, 66); g.fillRect(276, 182, 64, 58); g.lineStyle(5, 0x6ee7f1, 1); g.lineBetween(340, 150, 340, 300); } else if (kind === 'approach') { g.fillStyle(0x153e42, 1); g.fillTriangle(0, 500, 168, 326, 390, 270); g.fillStyle(0x1b6670, 1); g.fillTriangle(0, 493, 150, 340, 390, 292); g.lineStyle(3, 0x6ee7f1, 0.8); g.lineBetween(12, 488, 180, 332); g.lineBetween(180, 332, 370, 285); g.fillStyle(0x273c50, 1); g.fillRect(300, 135, 70, 100); g.lineStyle(3, 0xff9b6b, 1); g.strokeRect(300, 135, 70, 100); } else if (kind !== 'combat') { g.fillStyle(0x0d1624, 1); g.fillRect(18, 122, 354, 410); g.lineStyle(2, 0x3e5e77, 1); g.strokeRect(18, 122, 354, 410); g.fillStyle(kind === 'floor1' ? 0x236f76 : kind === 'floor2' ? 0x713d35 : 0x563c87, 0.28); g.fillRect(32, 145, 326, 360); g.fillStyle(0x1c3245, 1); g.fillRect(64, 295, 230, 26); g.fillRect(108, 210, 28, 190); g.fillRect(248, 170, 28, 220); g.lineStyle(3, kind === 'floor1' ? 0x68e9ef : kind === 'floor2' ? 0xff9b6b : 0xc59bff, 0.7); g.lineBetween(32, 260, 355, 260); } else { g.fillStyle(0x151f37, 1); g.fillEllipse(200, 370, 330, 80); g.lineStyle(2, 0x3b5d78, 1); g.strokeEllipse(200, 370, 330, 80); }
    if (kind === 'floor1') { g.lineStyle(2, 0x6ee7f1, 0.65); for (var b1 = 0; b1 < 5; b1++) g.strokeCircle(70 + b1 * 72, 170 + (b1 % 2) * 260, 18); g.lineStyle(1, 0x9bf2bd, 0.5); g.lineBetween(44, 180, 340, 475); }
    if (kind === 'floor2') { g.fillStyle(0xff9b6b, 0.12); for (var b2 = 0; b2 < 4; b2++) g.fillCircle(70 + b2 * 88, 185 + (b2 % 2) * 260, 26); g.lineStyle(3, 0xffd36e, 0.45); g.lineBetween(52, 470, 338, 165); }
    if (kind === 'floor3') { g.lineStyle(2, 0xc7a2ff, 0.7); for (var b3 = 0; b3 < 5; b3++) { g.strokeRect(54 + b3 * 66, 165 + (b3 % 2) * 250, 24, 24); g.lineBetween(32, 240 + b3 * 52, 356, 240 + b3 * 52); } }
    g.lineStyle(2, 0x2b6473, 1); g.lineBetween(0, BOARD_TOP, W, BOARD_TOP); g.lineBetween(0, BOARD_BOTTOM, W, BOARD_BOTTOM); g.generateTexture('bg-' + key, W, H); g.destroy(); }

  function toScene(cfg) { var Klass = function () { Phaser.Scene.call(this, { key: cfg.key }); }; Klass.prototype = Object.create(Phaser.Scene.prototype); Klass.prototype.constructor = Klass; Object.keys(cfg).forEach(function (key) { if (key !== 'key') Klass.prototype[key] = cfg[key]; }); return Klass; }
  var config = { type: Phaser.AUTO, parent: document.body, backgroundColor: CSS.ink, scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: W, height: H }, fps: { target: 60, min: 30 }, scene: [toScene(BootScene), toScene(PlayScene)] };
  config.scale.width = Math.round(W * RETINA_FACTOR);
  config.scale.height = Math.round(H * RETINA_FACTOR);
  config.render = Object.assign({}, GGKit.renderDefaults, config.render || {});
  new Phaser.Game(config);
  window.__AF_READY = true;
})();
