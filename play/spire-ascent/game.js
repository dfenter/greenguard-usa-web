/* Spire Ascent - AAA rebuild (original work).
 *
 * Endless tower climber.  Phaser 3 from /play/_shared/ plus GGKit as the sole
 * lifecycle, input, save and audio implementation.  Nothing is fetched from a
 * network at runtime; every image and every audio file ships in assets/ and is
 * generated procedurally (see LICENSES.md).
 *
 * Architecture notes that matter for the fleet's catalogued defect classes:
 *   - The simulation runs on a FIXED step inside step().  Every clock the game
 *     owns (run time, doom line, generation, cosmetic timers) advances only
 *     there, and the substep budget is capped, so a degraded device gets
 *     slow motion and never a time skip.
 *   - Sim entities are plain records in preallocated pools.  The view binds a
 *     pooled display object to a record per frame and stores nothing on the
 *     record, so no render state ever rides on an entity.
 *   - The debug/verification view (window.__sa) exposes COPIES, never a pool
 *     alias, and is readable from the boot fallback and from the live scene.
 *   - No persistent Graphics object exists.  All board, frame and HUD chrome
 *     is a baked texture; rings are pip sprites, never Graphics.arc.
 *   - The scene uses a real second camera for the HUD split.
 */
'use strict';
(function () {

  // =========================================================== constants
  var SLUG = 'spire-ascent';
  var VW = 390;           // virtual play-column width, world units
  var WALL = 16;          // wall thickness
  var ROW = 76;           // vertical spacing between generated rows
  var PT = 20;            // platform thickness
  var PPM = 11;           // world units per metre of climb
  var START_Y = 0;

  var GRAV = 2100;
  var RUN = 182;
  var JUMP_MIN = 640;     // instant launch power: a bare tap clears the opening row
  var HOLD_G = 0.30;      // gravity multiplier while the charge is held
  var HOLD_MAX = 0.24;    // seconds of charge; the readout maps to this
  var SPRING = 1040;
  var DASH_V = 500, DASH_T = 0.20, DASH_MEMO = 0.34, DASH_WINDOW = 0.32;
  var WKICK = 660;
  var CRUMBLE_TELL = 0.55;
  var HW = 9, PHH = 26;   // climber half width / height
  var TERM_V = 1280;

  var STEP = 1 / 60;
  var MAX_SUB = 4;        // substep cap: slow motion, never a time skip

  var PLAT_MAX = 260, WIND_MAX = 26, SPIKE_MAX = 26, EMBER_MAX = 64;
  var ENEMY_MAX = 24, BOLT_MAX = 20, POWERUP_MAX = 18;

  // Parallax weights.  The near layer sits well under the platform read: the
  // player must never mistake a background beam for a ledge.
  var BG_FAR_A = 0.40, BG_NEAR_A = 0.30;

  // -------------------------------------------------------------- bands
  // Four authored tower bands.  Past the summit the tower cycles bands 1-3
  // as BEYOND THE CROWN with an escalation multiplier, so an endless run
  // never runs out of authored identity.
  var BANDS = [
    {
      key: 'scaffold', name: 'FOUNDATION SCAFFOLDS', sub: 'Timber gantries, lamp oil and rope',
      top: 280, tex: 0, accent: 0xffba60, lamp: 0xffd080, hazardTint: 0xff8a5a,
      wide: [70, 122], spring: 0.20, crumble: 0.10, mover: 0.12,
      wind: 0.03, updraft: 0.00, spikes: 0.02, plateSpike: 0.03, ember: 0.36,
      second: 0.52, doom: 1.00, piece: 'gantry', pieceName: 'LAMPLIT GANTRY',
      shortcut: 'hoist', shortName: 'CARGO HOIST'
    },
    {
      key: 'windswept', name: 'WINDSWEPT MID-SPIRE', sub: 'Banner decks in a crosswind',
      top: 620, tex: 1, accent: 0x7ee0ff, lamp: 0xa0ecff, hazardTint: 0xff6880,
      wide: [62, 108], spring: 0.18, crumble: 0.12, mover: 0.26,
      wind: 0.20, updraft: 0.06, spikes: 0.05, plateSpike: 0.06, ember: 0.34,
      second: 0.46, doom: 1.10, piece: 'bridge', pieceName: 'BANNER BRIDGE',
      shortcut: 'flue', shortName: 'UPDRAFT FLUE'
    },
    {
      key: 'ruins', name: 'CRUMBLING UPPER RUINS', sub: 'Nothing here holds for long',
      top: 1020, tex: 2, accent: 0xe29aff, lamp: 0xe89eff, hazardTint: 0xff5860,
      wide: [56, 100], spring: 0.17, crumble: 0.34, mover: 0.18,
      wind: 0.10, updraft: 0.02, spikes: 0.13, plateSpike: 0.12, ember: 0.34,
      second: 0.42, doom: 1.20, piece: 'nave', pieceName: 'COLLAPSING NAVE',
      shortcut: 'arch', shortName: 'FALLEN ARCH'
    },
    {
      key: 'summit', name: 'STORM-LASHED SUMMIT', sub: 'Wind, spikes and open sky',
      top: 1500, tex: 3, accent: 0xbad0ff, lamp: 0xd6e4ff, hazardTint: 0xff7860,
      wide: [52, 92], spring: 0.19, crumble: 0.22, mover: 0.30,
      wind: 0.26, updraft: 0.10, spikes: 0.17, plateSpike: 0.13, ember: 0.32,
      second: 0.38, doom: 1.34, piece: 'lightning', pieceName: 'LIGHTNING SPIRE',
      shortcut: 'eye', shortName: 'STORM EYE'
    }
  ];
  var CYCLE_FROM = 1500;   // metres where BEYOND THE CROWN begins
  var CYCLE_SPAN = 380;

  // Explicit rooms give authored sections a readable identity while the
  // row generator continues beyond the crown.  Room boundaries are also the
  // only places where a run writes a checkpoint.
  var ROOMS = [
    { key: 'first_lift', name: 'THE FIRST LIFT', sub: 'Leap, charge and find your footing', start: 0, end: 180 },
    { key: 'banner_decks', name: 'BANNER DECKS', sub: 'Dash the crosswind and read the gaps', start: 180, end: 420 },
    { key: 'broken_nave', name: 'THE BROKEN NAVE', sub: 'Crumblers, embers and a safe shortcut', start: 420, end: 760 },
    { key: 'storm_eye', name: 'THE STORM EYE', sub: 'Wall-kick through the lightning', start: 760, end: 1200 },
    { key: 'crown_gate', name: 'THE CROWN GATE', sub: 'The summit is above the weather', start: 1200, end: 1500 }
  ];
  function roomAtHeight(h) {
    for (var i = 0; i < ROOMS.length; i++) {
      if (h >= ROOMS[i].start && h < ROOMS[i].end) return i;
    }
    return ROOMS.length + Math.max(0, Math.floor((h - CYCLE_FROM) / CYCLE_SPAN));
  }
  function roomDef(index) {
    return ROOMS[index] || { key: 'beyond_' + index, name: 'BEYOND THE CROWN', sub: 'Every rung is newly authored', start: CYCLE_FROM, end: Infinity };
  }

  function bandIndexAt(h) {
    if (h < BANDS[0].top) return 0;
    if (h < BANDS[1].top) return 1;
    if (h < BANDS[2].top) return 2;
    if (h < CYCLE_FROM) return 3;
    return 1 + (Math.floor((h - CYCLE_FROM) / CYCLE_SPAN) % 3);
  }
  // Guarded lookup: a band index miss must never hard-freeze the title.
  function BAND(i) {
    var b = BANDS[i | 0];
    return b || BANDS[0];
  }
  function beyond(h) { return h >= CYCLE_FROM; }
  function escalation(h) {
    if (h < CYCLE_FROM) return 0;
    return Math.min(1, (h - CYCLE_FROM) / 2600);
  }

  // ---------------------------------------------------------- cosmetics
  var SKINS = [
    { key: 'emberling', name: 'EMBERLING', need: 0, tint: 0xffffff, note: 'The lamplighter who started the climb' },
    { key: 'warden', name: 'SLATE WARDEN', need: 250, tint: 0xffffff, note: 'Helm of the foundation watch' },
    { key: 'vane', name: 'AURORA VANE', need: 600, tint: 0xffffff, note: 'Finned for the crosswind decks' },
    { key: 'stormcaller', name: 'STORMCALLER', need: 1200, tint: 0xffffff, note: 'Horns that read the storm' },
    { key: 'crown', name: 'CROWNBEARER', need: 2200, tint: 0xffffff, note: 'Only the summit grants it' }
  ];
  var TRAILS = [
    { key: 'dust', name: 'DUST', need: 0, frame: 'p_dust', tint: 0xffe0b0, add: false },
    { key: 'ribbon', name: 'CYAN RIBBON', need: 400, frame: 'p_ribbon', tint: 0x8fe9ff, add: true },
    { key: 'ember', name: 'EMBER WAKE', need: 900, frame: 'p_spark', tint: 0xffa84a, add: true },
    { key: 'voltaic', name: 'VOLTAIC', need: 1600, frame: 'p_bolt', tint: 0xc9b0ff, add: true },
    { key: 'prism', name: 'PRISM', need: 2600, frame: 'p_shard', tint: 0xffffff, add: true }
  ];
  function SKIN(key) {
    for (var i = 0; i < SKINS.length; i++) if (SKINS[i].key === key) return SKINS[i];
    return SKINS[0];
  }
  function TRAIL(key) {
    for (var i = 0; i < TRAILS.length; i++) if (TRAILS[i].key === key) return TRAILS[i];
    return TRAILS[0];
  }

  var MEDALS = [
    { key: 'bronze', name: 'BRONZE', need: 250, frame: 'medal_bronze', color: 0xffb070 },
    { key: 'silver', name: 'SILVER', need: 500, frame: 'medal_silver', color: 0xdfe9f5 },
    { key: 'gold', name: 'GOLD', need: 1000, frame: 'medal_gold', color: 0xffdc80 },
    { key: 'plat', name: 'PLATINUM', need: 1750, frame: 'medal_plat', color: 0xa8ecec },
    { key: 'crown', name: 'CROWN', need: 2500, frame: 'medal_crown', color: 0xeda0ff }
  ];
  function medalAt(h) {
    var m = null;
    for (var i = 0; i < MEDALS.length; i++) if (h >= MEDALS[i].need) m = MEDALS[i];
    return m;
  }

  var DAILY_GOAL = 1200;   // metres that close a daily seed run
  var DAILY_PAR = 210;     // seconds; beating par pays the time bonus

  // ---------------------------------------------------------- utilities
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function makeRng(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function dailySeed() {
    var d = new Date();
    return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  }
  function dailyLabel() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
  }

  // Change guards.  setText and setColor/setTint are both expensive enough on
  // a throttled device to matter at HUD update rates.
  function setTextIfChanged(o, v) {
    if (!o) return;
    if (o.__t !== v) { o.__t = v; o.setText(v); }
  }
  function setTintIfChanged(o, v) {
    if (!o) return;
    if (o.__tint !== v) { o.__tint = v; o.setTint(v); }
  }
  function setColorIfChanged(o, v) {
    if (!o) return;
    if (o.__col !== v) { o.__col = v; o.setColor(v); }
  }
  function setVisibleIfChanged(o, v) {
    if (!o) return;
    v = !!v;
    if (o.__vis !== v) { o.__vis = v; o.setVisible(v); }
  }
  function setFrameIfChanged(o, v) {
    if (!o) return;
    if (o.__frm !== v) { o.__frm = v; o.setFrame(v); }
  }
  // NineSlice.setSize and TileSprite.setSize both rebuild vertex data, so a
  // blind per-frame call on every pooled object was the single largest cost
  // in the frame budget.  Sizes only change when the layout or the platform
  // bound to a slot changes, so they are guarded like every other setter.
  function setDisplayIfChanged(o, w, h) {
    if (!o) return;
    if (o.__dw !== w || o.__dh !== h) { o.__dw = w; o.__dh = h; o.setDisplaySize(w, h); }
  }
  function setSizeIfChanged(o, w, h) {
    if (!o) return;
    if (o.__w !== w || o.__h !== h) { o.__w = w; o.__h = h; o.setSize(w, h); }
  }

  function heightOf(y) { return Math.max(0, (START_Y - y) / PPM); }
  function yOfHeight(h) { return START_Y - h * PPM; }

  // ------------------------------------------------------------- saving
  var SAVE_VERSION = 2;
  function defaultSave() {
    return {
      v: SAVE_VERSION,
      bestEndless: 0, bestDailyScore: 0, bestDailySeed: 0, bestDailyTime: 0,
      bestHeight: 0, runs: 0, medals: {}, shortcuts: {},
      skin: 'emberling', trail: 'dust', mode: 'endless',
      seenCoach: false, flash: true, checkpoint: null
    };
  }
  function validateSave(o) {
    if (!o || typeof o !== 'object') return false;
    if (o.v !== SAVE_VERSION) return false;
    var nums = ['bestEndless', 'bestDailyScore', 'bestDailySeed', 'bestDailyTime', 'bestHeight', 'runs'];
    for (var i = 0; i < nums.length; i++) {
      var v = o[nums[i]];
      if (typeof v !== 'number' || !isFinite(v) || v < 0) return false;
    }
    // A persisted cosmetic id must validate against the live registry, never
    // be trusted: a renamed skin would otherwise index nothing.
    if (typeof o.skin !== 'string' || SKIN(o.skin).key !== o.skin) return false;
    if (typeof o.trail !== 'string' || TRAIL(o.trail).key !== o.trail) return false;
    if (o.mode !== 'endless' && o.mode !== 'daily') return false;
    if (!o.medals || typeof o.medals !== 'object' || Array.isArray(o.medals)) return false;
    if (!o.shortcuts || typeof o.shortcuts !== 'object' || Array.isArray(o.shortcuts)) return false;
    var medalKeys = {};
    for (var m = 0; m < MEDALS.length; m++) medalKeys[MEDALS[m].key] = true;
    for (var medalKey in o.medals) {
      if (!medalKeys[medalKey] || typeof o.medals[medalKey] !== 'boolean') return false;
    }
    var shortcutKeys = {};
    for (var b = 0; b < BANDS.length; b++) shortcutKeys[BANDS[b].shortcut] = true;
    for (var shortcutKey in o.shortcuts) {
      if (!shortcutKeys[shortcutKey] || typeof o.shortcuts[shortcutKey] !== 'boolean') return false;
    }
    if (o.checkpoint !== null) {
      var cp = o.checkpoint;
      if (!cp || typeof cp !== 'object' || typeof cp.active !== 'boolean' || (cp.mode !== 'endless' && cp.mode !== 'daily') ||
          typeof cp.seed !== 'number' || !isFinite(cp.seed) || cp.seed < 1 ||
          typeof cp.room !== 'number' || cp.room < 0 || cp.room > 10000 ||
          typeof cp.height !== 'number' || !isFinite(cp.height) || cp.height < 0 ||
          typeof cp.x !== 'number' || !isFinite(cp.x) || cp.x < WALL || cp.x > VW - WALL ||
          typeof cp.y !== 'number' || !isFinite(cp.y)) return false;
      if (cp.mode === 'daily' && (typeof cp.dailySeed !== 'number' || !isFinite(cp.dailySeed) || cp.dailySeed < 1)) return false;
    }
    return true;
  }

  // ================================================================ kit
  var Game = { phaser: null, play: null, title: null };

  var kit = GGKit.create({
    slug: SLUG,
    orientation: 'portrait',
    validateSave: validateSave,
    onPause: function () {
      var s = Game.play;
      if (s && s.scene && s.scene.isActive()) { s.releaseAll(); s.scene.pause(); }
    },
    onResume: function () {
      var s = Game.play;
      if (s && s.scene && s.scene.isPaused()) s.scene.resume();
    },
    onRestart: function () {
      var s = Game.play;
      if (s && s.restartRun) s.restartRun();
    }
  });

  var profile = kit.save.get(null);
  if (!profile) profile = defaultSave();
  function persist() { kit.save.set(profile); }
  function usableCheckpoint(cp, mode) {
    return !!(cp && cp.active && cp.mode === mode && cp.seed > 0 &&
      (mode !== 'daily' || cp.dailySeed === dailySeed()) && cp.room >= 0 && cp.height >= 0 &&
      cp.x >= WALL && cp.x <= VW - WALL && isFinite(cp.y));
  }
  function bestHeightEver() { return profile.bestHeight || 0; }
  function unlockedSkins() {
    var out = [];
    for (var i = 0; i < SKINS.length; i++) if (bestHeightEver() >= SKINS[i].need) out.push(SKINS[i].key);
    return out;
  }
  function unlockedTrails() {
    var out = [];
    for (var i = 0; i < TRAILS.length; i++) if (bestHeightEver() >= TRAILS[i].need) out.push(TRAILS[i].key);
    return out;
  }

  // Accessibility routes through one pair of switches.  kit.juice.enabled is
  // the kit's shake/hit-stop flag; the title routes its own flash plate,
  // banner overshoot, vignette pulse and particle counts through the same
  // pair so the toggle covers everything the player actually sees.
  function motionOn() { return kit.juice.enabled !== false; }
  function flashOn() { return motionOn() && profile.flash !== false; }
  function fxCount(n) {
    if (!flashOn()) return 0;
    return Math.max(1, Math.round(n * (motionOn() ? 1 : 0.34)));
  }

  function openSettings() {
    var box = kit.openSettings([function (parent, row) {
      row('Flash effects', function () { return profile.flash !== false; }, function (v) {
        profile.flash = !!v; persist();
        if (Game.title && Game.title.embers) Game.title.embers.setVisible(flashOn());
      });
    }]);
    skinOverlay(box, 'SETTINGS');
    return box;
  }

  // GGKit owns the loader and the settings shell; the title only restyles the
  // DOM they produce so no screen ships in the kit's default utility grey.
  function skinOverlay(box, title) {
    if (!box) return box;
    box.style.background = 'radial-gradient(130% 80% at 50% 8%, #2a1740 0%, #150d28 46%, #0a0713 100%)';
    box.style.color = '#f4ecff';
    box.style.gap = '13px';
    var kids = box.children;
    for (var i = 0; i < kids.length; i++) {
      var c = kids[i];
      if (c.tagName === 'BUTTON') {
        c.style.background = 'rgba(20,13,38,0.86)';
        c.style.border = '1px solid rgba(226,154,255,0.34)';
        c.style.color = '#f4ecff';
        c.style.letterSpacing = '0.05em';
        c.style.borderRadius = '12px';
      } else if (i === 0 && title) {
        c.textContent = title;
        c.style.letterSpacing = '0.16em';
        c.style.color = '#ffba60';
      }
    }
    var last = kids[kids.length - 1];
    if (last && last.tagName === 'BUTTON') {
      last.style.background = 'linear-gradient(180deg,#ffc978,#ff9a3c)';
      last.style.color = '#1a0f05';
      last.style.border = '0';
      last.style.fontWeight = '800';
    }
    return box;
  }

  // ==================================================== verification hook
  // One object, shared by the boot fallback and by the live scene, so a probe
  // reads the same shape either way.  Every array here is a rebuilt COPY; a
  // reader can never truncate or mutate a live entity pool through it.
  var SA_STATE = {
    ready: false, phase: 'boot',
    mode: 'endless', height: 0, bestHeight: 0, combo: 0, bestCombo: 0,
    band: 0, bandKey: 'scaffold', bandName: BANDS[0].name, beyond: false,
    score: 0, best: 0, seed: 0, elapsed: 0, doomGap: 0, doomProx: 0,
    charge: 0, dashReady: true, wind: 0, updraft: 0, grounded: true,
    medal: '', medals: [], shortcuts: [], shortcutsThisRun: 0, why: '',
    skin: 'emberling', trail: 'dust', unlockedSkins: [], unlockedTrails: [],
    platforms: 0, embers: 0, enemies: 0, powerups: 0, hp: 2, room: 0, roomKey: ROOMS[0].key,
    checkpointRoom: 0, power: '', powerTime: 0, dead: false, dailyGoal: DAILY_GOAL, dailyDone: false,
    // switches the orchestrator can drive
    forceMode: null, forceBand: null, forceGenerous: false, forceUnlockAll: false
  };
  // Verification controls are opt-in and never mutate a live release.  The
  // fleet probe can set this flag before loading the title in its test build.
  var TEST_HOOKS = typeof window !== 'undefined' && window.__SA_TEST__ === true;
  if (typeof window !== 'undefined') window.__sa = { state: SA_STATE };

  // Collection fields on the debug view are rebuilt on change, never per
  // frame.  They are always fresh COPIES, so a reader can hold one without
  // ever touching a live pool or the saved profile.
  var debugCollectionsDirty = true;
  function markDebugCollections() { debugCollectionsDirty = true; }
  function rebuildDebugCollections() {
    debugCollectionsDirty = false;
    SA_STATE.medals = Object.keys(profile.medals);
    SA_STATE.shortcuts = Object.keys(profile.shortcuts);
    SA_STATE.unlockedSkins = unlockedSkins();
    SA_STATE.unlockedTrails = unlockedTrails();
  }
  rebuildDebugCollections();

  // Frame-name registries, built once.  A miss falls back instead of asking
  // the texture manager on every platform on every frame (and a FAMILY-style
  // key miss can never hard-freeze the title).
  var PLAT_FRAME = {}, CLIMBER_FRAME = {};
  (function () {
    var kinds = ['ledge', 'crumble', 'mover', 'spring'];
    for (var b = 0; b < 4; b++) {
      for (var k = 0; k < kinds.length; k++) {
        PLAT_FRAME[kinds[k] + '_' + b] = 'plat_' + kinds[k] + '_' + b;
      }
    }
    var poses = ['idle', 'walk', 'run', 'rise', 'fall', 'dash', 'land', 'hurt'];
    for (var i = 0; i < SKINS.length; i++) {
      for (var j = 0; j < poses.length; j++) {
        var pose = poses[j];
        // The shipped atlas has authored contact poses rather than a second
        // duplicate sheet.  Idle, walk and hurt use those poses as their
        // keyframes, while the state timer supplies the animation cadence.
        var atlasPose = pose === 'idle' ? 'land' : pose === 'walk' ? 'run' : pose === 'hurt' ? 'dash' : pose;
        CLIMBER_FRAME[SKINS[i].key + '_' + pose] = 'climber_' + SKINS[i].key + '_' + atlasPose;
      }
    }
  })();

  // ============================================================== tower
  // Pooled, seeded generation.  Records are plain data; the view never writes
  // to them and they never hold a display object.
  function Tower() {
    var i;
    this.plats = new Array(PLAT_MAX);
    for (i = 0; i < PLAT_MAX; i++) {
      this.plats[i] = {
        active: false, x: 0, y: 0, w: 0, kind: 'ledge', band: 0, dead: false,
        sp: 0, amp: 0, bx: 0, ph: 0, dx: 0, tmr: 0, cracked: false,
        spike: 0, spw: 0, shortcut: false, piece: false, landed: false
      };
    }
    this.winds = new Array(WIND_MAX);
    for (i = 0; i < WIND_MAX; i++) {
      this.winds[i] = { active: false, y: 0, h: 0, fx: 0, fy: 0, t: 0, band: 0 };
    }
    this.spikes = new Array(SPIKE_MAX);
    for (i = 0; i < SPIKE_MAX; i++) {
      this.spikes[i] = { active: false, side: 0, y: 0, h: 0, band: 0 };
    }
    this.embers = new Array(EMBER_MAX);
    for (i = 0; i < EMBER_MAX; i++) {
      this.embers[i] = { active: false, x: 0, y: 0, taken: false, t: 0, big: false };
    }
    this.enemies = new Array(ENEMY_MAX);
    for (i = 0; i < ENEMY_MAX; i++) {
      this.enemies[i] = {
        active: false, x: 0, y: 0, bx: 0, w: 24, h: 28, dir: 1,
        speed: 34, range: 42, phase: 0, attackT: 1.2, telegraph: 0,
        armed: false, dead: false, hitT: 0, band: 0
      };
    }
    this.bolts = new Array(BOLT_MAX);
    for (i = 0; i < BOLT_MAX; i++) {
      this.bolts[i] = { active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, band: 0 };
    }
    this.powerups = new Array(POWERUP_MAX);
    for (i = 0; i < POWERUP_MAX; i++) {
      this.powerups[i] = { active: false, x: 0, y: 0, t: 0, kind: 'guard', band: 0 };
    }
    this.pc = this.wc = this.sc = this.ec = this.npc = this.nbc = this.nuc = 0;
    this.reset(1);
  }

  Tower.prototype.reset = function (seed) {
    var i;
    for (i = 0; i < PLAT_MAX; i++) this.plats[i].active = false;
    for (i = 0; i < WIND_MAX; i++) this.winds[i].active = false;
    for (i = 0; i < SPIKE_MAX; i++) this.spikes[i].active = false;
    for (i = 0; i < EMBER_MAX; i++) this.embers[i].active = false;
    for (i = 0; i < ENEMY_MAX; i++) this.enemies[i].active = false;
    for (i = 0; i < BOLT_MAX; i++) this.bolts[i].active = false;
    for (i = 0; i < POWERUP_MAX; i++) this.powerups[i].active = false;
    this.rng = makeRng(seed);
    this.seed = seed >>> 0;
    this.genY = START_Y;
    this.lastBand = -1;
    this.pieceCountdown = 3;
    this.shortCountdown = 9;
    this.piecesPlaced = {};
    this.shortsPlaced = {};
    this.lastSpikeY = [1e9, 1e9];
    this.rowsSinceEmber = 0;
    this.rowsGenerated = 0;
    this.generous = false;

    // Guaranteed launch pad: no seed can open on a gap, and the climber
    // starts standing on it rather than already falling.
    var p = this.takePlat();
    if (p) {
      p.x = WALL + 4; p.y = START_Y; p.w = VW - WALL * 2 - 8; p.kind = 'ledge'; p.band = 0;
    }
    this.startPad = p;
    for (i = 0; i < 16; i++) this.genRow();
  };

  Tower.prototype.takePlat = function () {
    for (var n = 0; n < PLAT_MAX; n++) {
      this.pc = (this.pc + 1) % PLAT_MAX;
      var p = this.plats[this.pc];
      if (!p.active) {
        p.active = true; p.dead = false; p.kind = 'ledge'; p.sp = 0; p.amp = 0;
        p.bx = 0; p.ph = 0; p.dx = 0; p.tmr = 0; p.cracked = false; p.spike = 0;
        p.spw = 0; p.shortcut = false; p.piece = false; p.landed = false; p.w = 60;
        return p;
      }
    }
    return null;
  };
  Tower.prototype.takeWind = function () {
    for (var n = 0; n < WIND_MAX; n++) {
      this.wc = (this.wc + 1) % WIND_MAX;
      var w = this.winds[this.wc];
      if (!w.active) { w.active = true; w.t = 0; w.fx = 0; w.fy = 0; return w; }
    }
    return null;
  };
  Tower.prototype.takeSpike = function () {
    for (var n = 0; n < SPIKE_MAX; n++) {
      this.sc = (this.sc + 1) % SPIKE_MAX;
      var s = this.spikes[this.sc];
      if (!s.active) { s.active = true; return s; }
    }
    return null;
  };
  Tower.prototype.takeEmber = function () {
    for (var n = 0; n < EMBER_MAX; n++) {
      this.ec = (this.ec + 1) % EMBER_MAX;
      var e = this.embers[this.ec];
      if (!e.active) { e.active = true; e.taken = false; e.t = 0; e.big = false; return e; }
    }
    return null;
  };

  Tower.prototype.takeEnemy = function () {
    for (var n = 0; n < ENEMY_MAX; n++) {
      this.npc = (this.npc + 1) % ENEMY_MAX;
      var e = this.enemies[this.npc];
      if (!e.active) { e.active = true; e.dead = false; e.telegraph = 0; e.armed = false; e.hitT = 0; return e; }
    }
    return null;
  };
  Tower.prototype.takeBolt = function () {
    for (var n = 0; n < BOLT_MAX; n++) {
      this.nbc = (this.nbc + 1) % BOLT_MAX;
      var b = this.bolts[this.nbc];
      if (!b.active) { b.active = true; b.life = 0; return b; }
    }
    return null;
  };
  Tower.prototype.takePowerup = function () {
    for (var n = 0; n < POWERUP_MAX; n++) {
      this.nuc = (this.nuc + 1) % POWERUP_MAX;
      var p = this.powerups[this.nuc];
      if (!p.active) { p.active = true; p.t = 0; return p; }
    }
    return null;
  };
  Tower.prototype.addEnemy = function (x, y, band) {
    var e = this.takeEnemy();
    if (!e) return null;
    e.x = e.bx = clamp(x, WALL + 18, VW - WALL - 18);
    e.y = y; e.band = band; e.dir = this.rng() < 0.5 ? -1 : 1;
    e.speed = 28 + this.rng() * 26; e.range = 24 + this.rng() * 46;
    e.phase = this.rng() * 6.283; e.attackT = 1.0 + this.rng() * 1.4;
    return e;
  };
  Tower.prototype.addPowerup = function (x, y, band) {
    var p = this.takePowerup();
    if (!p) return null;
    p.x = clamp(x, WALL + 14, VW - WALL - 14); p.y = y; p.band = band;
    p.kind = ['guard', 'surge', 'magnet'][Math.floor(this.rng() * 3)];
    return p;
  };

  Tower.prototype.spikeSafeX = function (y, w) {
    // Never park a platform inside a wall-spike band.
    var minX = WALL + 8, maxX = VW - WALL - 8 - w;
    var x = minX + this.rng() * Math.max(1, maxX - minX);
    for (var i = 0; i < SPIKE_MAX; i++) {
      var s = this.spikes[i];
      if (!s.active) continue;
      if (y > s.y - 30 && y < s.y + s.h + 30) {
        if (s.side === 0) x = Math.max(x, WALL + 48);
        else x = Math.min(x, VW - WALL - 48 - w);
      }
    }
    return clamp(x, minX, Math.max(minX, maxX));
  };

  Tower.prototype.mkPlat = function (y, w, band, d) {
    var r = this.rng;
    var p = this.takePlat();
    if (!p) return null;
    p.y = y; p.w = w; p.band = band;
    p.x = this.spikeSafeX(y, w);
    p.bx = p.x;
    var b = BAND(band);
    var q = r();
    var springChance = b.spring + (this.generous ? 0.14 : 0);
    var moverChance = b.mover + (this.generous ? 0.06 : 0);
    if (q < springChance) {
      p.kind = 'spring';
    } else if (q < springChance + b.crumble * (0.7 + 0.6 * d)) {
      p.kind = 'crumble';
    } else if (q < springChance + b.crumble * (0.7 + 0.6 * d) + moverChance) {
      p.kind = 'mover';
      var minX = WALL + 8, maxX = VW - WALL - 8 - w;
      p.amp = Math.min(50 + r() * 48, Math.max(4, (maxX - minX) / 2));
      p.bx = clamp(p.x, minX + p.amp, Math.max(minX + p.amp, maxX - p.amp));
      p.x = p.bx;
      p.ph = r() * 6.283;
      p.sp = (0.55 + r() * 0.75 + 0.3 * d) * (r() < 0.5 ? -1 : 1);
    }
    if (p.kind !== 'spring' && r() < b.plateSpike * (0.5 + 0.9 * d)) {
      p.spike = r() < 0.5 ? -1 : 1;             // -1 left edge, +1 right edge
      p.spw = p.w * (0.26 + r() * 0.14);
    }
    return p;
  };

  Tower.prototype.addEmber = function (x, y, big) {
    var e = this.takeEmber();
    if (!e) return null;
    e.x = clamp(x, WALL + 12, VW - WALL - 12);
    e.y = y;
    e.big = !!big;
    this.rowsSinceEmber = 0;
    return e;
  };

  // --------------------------------------------------------- set-pieces
  // Each authored band gets one signature arrangement and one discoverable
  // shortcut route.  Both emit their own rows and then hand genY back.
  Tower.prototype.emitPiece = function (band) {
    var b = BAND(band), r = this.rng, y = this.genY, i, p;
    var key = b.piece;
    if (key === 'gantry') {
      // Lamplit Gantry: a five-step staircase alternating sides, every step
      // solid, with a lamp ember on the third.  The band's welcome mat.
      for (i = 0; i < 5; i++) {
        p = this.takePlat();
        if (!p) break;
        p.y = y - i * 62; p.w = 84; p.band = band; p.piece = true;
        p.x = (i % 2 === 0) ? WALL + 20 : VW - WALL - 104;
        p.bx = p.x;
        if (i === 4) { p.kind = 'spring'; }
        if (i === 2) this.addEmber(p.x + p.w / 2, p.y - 34, true);
      }
      y -= 4 * 62;
    } else if (key === 'bridge') {
      // Banner Bridge: one very long mover crossing the shaft, flanked by two
      // small static perches so a mistimed jump still has an out.
      p = this.takePlat();
      if (p) {
        p.y = y - 60; p.w = 172; p.band = band; p.piece = true; p.kind = 'mover';
        p.amp = (VW - WALL * 2 - 172) / 2 - 2;
        p.bx = VW / 2 - 86; p.x = p.bx; p.ph = 0; p.sp = 0.72;
      }
      for (i = 0; i < 2; i++) {
        p = this.takePlat();
        if (!p) break;
        p.y = y - 120 - i * 58; p.w = 56; p.band = band; p.piece = true;
        p.x = i === 0 ? WALL + 12 : VW - WALL - 68;
        p.bx = p.x;
      }
      this.addEmber(VW / 2, y - 96, true);
      y -= 178;
    } else if (key === 'nave') {
      // Collapsing Nave: a six-plank crumbling cascade that must be run, not
      // rested on, ending on one solid landing.
      for (i = 0; i < 6; i++) {
        p = this.takePlat();
        if (!p) break;
        p.y = y - i * 54; p.w = 72; p.band = band; p.piece = true; p.kind = 'crumble';
        p.x = clamp(VW / 2 - 36 + Math.sin(i * 1.15) * 96, WALL + 10, VW - WALL - 82);
        p.bx = p.x;
      }
      p = this.takePlat();
      if (p) {
        p.y = y - 6 * 54; p.w = 104; p.band = band; p.piece = true;
        p.x = VW / 2 - 52; p.bx = p.x;
      }
      this.addEmber(VW / 2, y - 6 * 54 - 34, true);
      y -= 6 * 54;
    } else {
      // Lightning Spire: narrow alternating perches between two spike walls,
      // with a spring escape at the top.
      for (i = 0; i < 2; i++) {
        var s = this.takeSpike();
        if (!s) break;
        s.side = i; s.y = y - 40 - i * 90; s.h = 96; s.band = band;
        this.lastSpikeY[i] = s.y;
      }
      for (i = 0; i < 5; i++) {
        p = this.takePlat();
        if (!p) break;
        p.y = y - i * 58; p.w = 58; p.band = band; p.piece = true;
        p.x = (i % 2 === 0) ? WALL + 52 : VW - WALL - 110;
        p.bx = p.x;
        if (i === 4) p.kind = 'spring';
      }
      this.addEmber(VW / 2, y - 2 * 58 - 30, true);
      y -= 4 * 58;
    }
    this.genY = y - ROW;
  };

  Tower.prototype.emitShortcut = function (band) {
    var b = BAND(band), y = this.genY, i, p, w;
    var key = b.shortcut;
    if (key === 'hoist') {
      // Cargo Hoist: three springs stacked tight on the left wall.  Cheap to
      // spot, expensive to commit to, and it skips a whole band segment.
      for (i = 0; i < 3; i++) {
        p = this.takePlat();
        if (!p) break;
        p.y = y - i * 104; p.w = 52; p.band = band; p.kind = 'spring';
        p.x = WALL + 4; p.bx = p.x; p.shortcut = true;
      }
      this.addEmber(WALL + 34, y - 2 * 104 - 40, true);
      y -= 2 * 104;
    } else if (key === 'flue') {
      // Updraft Flue: a lift column hugging the right wall with three narrow
      // rungs inside it.  The lift does most of the work if you stay in it.
      w = this.takeWind();
      if (w) {
        w.y = y - 330; w.h = 340; w.fx = 22; w.fy = -290; w.band = band;
      }
      for (i = 0; i < 3; i++) {
        p = this.takePlat();
        if (!p) break;
        p.y = y - 40 - i * 112; p.w = 46; p.band = band;
        p.x = VW - WALL - 54; p.bx = p.x; p.shortcut = true;
      }
      this.addEmber(VW - WALL - 30, y - 2 * 112 - 70, true);
      y -= 2 * 112 + 40;
    } else if (key === 'arch') {
      // Fallen Arch: three solid stone slabs on the left wall in a band where
      // nothing else is solid.  The safe line through the ruins.
      for (i = 0; i < 3; i++) {
        p = this.takePlat();
        if (!p) break;
        p.y = y - i * 74; p.w = 66; p.band = band;
        p.x = WALL + 6 + i * 4; p.bx = p.x; p.shortcut = true;
      }
      this.addEmber(WALL + 40, y - 2 * 74 - 36, true);
      y -= 2 * 74;
    } else {
      // Storm Eye: a still column at the centre of the storm, four springs.
      for (i = 0; i < 4; i++) {
        p = this.takePlat();
        if (!p) break;
        p.y = y - i * 96; p.w = 48; p.band = band; p.kind = 'spring';
        p.x = VW / 2 - 24; p.bx = p.x; p.shortcut = true;
      }
      this.addEmber(VW / 2, y - 3 * 96 - 40, true);
      y -= 3 * 96;
    }
    this.genY = y - ROW;
  };

  // ------------------------------------------------------- ordinary row
  Tower.prototype.genRow = function () {
    var r = this.rng;
    this.genY -= ROW;
    this.rowsGenerated++;
    var y = this.genY;
    var h = heightOf(y);
    var band = bandIndexAt(h);
    var b = BAND(band);
    var esc = escalation(h);
    var d = clamp(h / 1400, 0, 1) + esc * 0.5;
    d = clamp(d, 0, 1.4);

    // Six deterministic onboarding rows teach the core verbs in a safe
    // sequence.  The first four are wide and central, then the line shifts
    // toward each wall for dash and wall-kick practice.  No seed can place a
    // mover, crumbler, spike, wind field, enemy or pickup in this room.
    if (this.rowsGenerated <= 6) {
      var tutorial = this.takePlat();
      if (tutorial) {
        tutorial.y = y; tutorial.w = this.rowsGenerated < 4 ? 148 : 94;
        tutorial.x = this.rowsGenerated < 4 ? VW / 2 - tutorial.w / 2
          : (this.rowsGenerated % 2 ? WALL + 24 : VW - WALL - tutorial.w - 24);
        tutorial.bx = tutorial.x; tutorial.band = 0; tutorial.kind = 'ledge';
      }
      if (this.rowsGenerated === 3 || this.rowsGenerated === 6) {
        this.addEmber(VW / 2, y - 38, false);
      }
      return;
    }

    if (band !== this.lastBand) {
      this.lastBand = band;
      var tag = band + '@' + Math.floor(h / CYCLE_SPAN);
      this.pieceCountdown = this.piecesPlaced[tag] ? -1 : 2;
      this.shortCountdown = this.shortsPlaced[tag] ? -1 : 9;
      this.pieceTag = tag;
    }
    if (this.pieceCountdown === 0) {
      this.pieceCountdown = -1;
      this.piecesPlaced[this.pieceTag] = true;
      this.emitPiece(band);
      return;
    }
    if (this.pieceCountdown > 0) this.pieceCountdown--;
    if (this.shortCountdown === 0) {
      this.shortCountdown = -1;
      this.shortsPlaced[this.pieceTag] = true;
      this.emitShortcut(band);
      return;
    }
    if (this.shortCountdown > 0) this.shortCountdown--;

    // wall spike band, placed above this row so platforms route around it
    if (r() < b.spikes * (0.6 + 0.8 * d)) {
      var side = r() < 0.5 ? 0 : 1;
      if (this.lastSpikeY[side] - (y - 30) > 250) {
        var s = this.takeSpike();
        if (s) {
          var sh = 44 + r() * 56 + 26 * esc;
          s.side = side; s.y = y - 30 - sh; s.h = sh; s.band = band;
          this.lastSpikeY[side] = s.y;
        }
      }
    }

    var w1 = b.wide[0] + r() * (b.wide[1] - b.wide[0]) - 14 * d;
    var a = this.mkPlat(y, Math.max(42, w1), band, d);

    if (a && r() < b.second) {
      var bw = Math.max(40, b.wide[0] * 0.86 + r() * 40 - 12 * d);
      var b2 = this.mkPlat(y - 12 - r() * 24, bw, band, d);
      if (b2 && Math.abs((b2.x + b2.w / 2) - (a.x + a.w / 2)) < 96) b2.active = false;
    }

    // wind zone
    if (r() < b.wind) {
      var w = this.takeWind();
      if (w) {
        w.y = y - 40; w.h = 150 + r() * 140; w.band = band;
        w.fx = (r() < 0.5 ? -1 : 1) * (66 + r() * 74 + 30 * esc);
        w.fy = 0;
      }
    }
    if (r() < b.updraft) {
      var u = this.takeWind();
      if (u) {
        u.y = y - 60; u.h = 170 + r() * 120; u.band = band;
        u.fx = (r() < 0.5 ? -1 : 1) * 20;
        u.fy = -(190 + r() * 110);
      }
    }

    // combo-refresh embers: on-route and generous, with a guaranteed drop if
    // the player has gone a long dry stretch.
    this.rowsSinceEmber++;
    var eChance = b.ember + (this.generous ? 0.2 : 0);
    if (a && (r() < eChance || this.rowsSinceEmber >= 5)) {
      this.addEmber(a.x + a.w / 2 + (r() - 0.5) * 40, a.y - 40 - r() * 26, false);
    }
    if (a && this.rowsGenerated > 7 && this.rowsGenerated % 7 === 0) {
      this.addPowerup(a.x + a.w / 2, a.y - 34, band);
    }
    if (a && this.rowsGenerated > 8 && this.rowsGenerated % 5 === 0 && a.w >= 74) {
      this.addEnemy(a.x + a.w * (r() < 0.5 ? 0.30 : 0.70), a.y - 28, band);
    }
  };

  Tower.prototype.ensure = function (topY) {
    var guard = 0;
    while (this.genY > topY && guard++ < 300) this.genRow();
  };

  Tower.prototype.cull = function (botY) {
    var i;
    for (i = 0; i < PLAT_MAX; i++) {
      var p = this.plats[i];
      if (p.active && p.y > botY) p.active = false;
    }
    for (i = 0; i < WIND_MAX; i++) {
      var w = this.winds[i];
      if (w.active && w.y > botY) w.active = false;
    }
    for (i = 0; i < SPIKE_MAX; i++) {
      var s = this.spikes[i];
      if (s.active && s.y > botY) s.active = false;
    }
    for (i = 0; i < EMBER_MAX; i++) {
      var e = this.embers[i];
      if (e.active && e.y > botY) e.active = false;
    }
    for (i = 0; i < ENEMY_MAX; i++) {
      var en = this.enemies[i];
      if (en.active && en.y > botY) en.active = false;
    }
    for (i = 0; i < BOLT_MAX; i++) {
      var bo = this.bolts[i];
      if (bo.active && bo.y > botY) bo.active = false;
    }
    for (i = 0; i < POWERUP_MAX; i++) {
      var pu = this.powerups[i];
      if (pu.active && pu.y > botY) pu.active = false;
    }
  };

  Tower.prototype.step = function (dt) {
    var i;
    for (i = 0; i < PLAT_MAX; i++) {
      var p = this.plats[i];
      if (!p.active) continue;
      var px = p.x;
      if (p.kind === 'mover' && !p.dead) {
        p.ph += dt * p.sp * 1.5;
        p.x = p.bx + Math.sin(p.ph) * p.amp;
      }
      if (p.kind === 'crumble' && p.tmr > 0) {
        p.tmr -= dt;
        if (p.tmr <= 0) { p.dead = true; p.tmr = 0; }
      }
      p.dx = p.x - px;
    }
    for (i = 0; i < WIND_MAX; i++) if (this.winds[i].active) this.winds[i].t += dt;
    for (i = 0; i < EMBER_MAX; i++) if (this.embers[i].active) this.embers[i].t += dt;
    for (i = 0; i < POWERUP_MAX; i++) if (this.powerups[i].active) this.powerups[i].t += dt;
  };

  Tower.prototype.stepEnemies = function (dt, playerX, playerY) {
    var i;
    for (i = 0; i < ENEMY_MAX; i++) {
      var e = this.enemies[i];
      if (!e.active || e.dead) continue;
      e.hitT = Math.max(0, e.hitT - dt);
      e.attackT -= dt;
      if (e.telegraph > 0) {
        e.telegraph -= dt;
        if (e.telegraph <= 0 && e.armed) {
          e.armed = false;
          var bolt = this.takeBolt();
          if (bolt) {
            bolt.x = e.x; bolt.y = e.y - 18;
            var dx = playerX - bolt.x, dy = playerY - bolt.y;
            var len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
            bolt.vx = dx / len * 180; bolt.vy = dy / len * 180;
            bolt.life = 2.1; bolt.band = e.band;
          }
        }
      } else if (e.attackT <= 0 && Math.abs(playerX - e.x) < 170 && Math.abs(playerY - e.y) < 150) {
        e.telegraph = 0.42;
        e.armed = true;
        e.attackT = 2.2;
      }
      e.phase += dt * 1.8;
      e.x = e.bx + Math.sin(e.phase) * e.range;
      if (e.x < WALL + 16 || e.x > VW - WALL - 16) e.dir *= -1;
    }
    for (i = 0; i < BOLT_MAX; i++) {
      var b = this.bolts[i];
      if (!b.active) continue;
      b.life -= dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.life <= 0 || b.x < WALL - 30 || b.x > VW - WALL + 30) b.active = false;
    }
  };

  Tower.prototype.fieldAt = function (x, y, out) {
    out.fx = 0; out.fy = 0; out.n = 0;
    for (var i = 0; i < WIND_MAX; i++) {
      var w = this.winds[i];
      if (!w.active) continue;
      if (y > w.y && y < w.y + w.h) { out.fx += w.fx; out.fy += w.fy; out.n++; }
    }
    return out;
  };

  // ====================================================== number display
  // Bundled bitmap numerals.  Every HUD number is drawn with pooled glyph
  // images and repainted only when the string actually changes.
  var GLYPH_ORDER = '0123456789+-.:/xm%';
  var GLYPH_W = 22, GLYPH_H = 30;

  function NumberDisplay(scene, layer, height, tint, align) {
    this.scene = scene;
    // Glyph images are created lazily as a number grows a digit, so they must
    // NOT be appended straight to the shared UI layer: a glyph added later
    // would sit in front of everything added in between (the first digit of
    // the final score rendered BEHIND the game-over dim plate before this).
    // Each display owns a container claimed at construction time, so its
    // depth is fixed no matter when a glyph appears.
    this.box = scene.add.container(0, 0);
    if (layer && layer.add) layer.add(this.box);
    this.layer = this.box;
    this.scale = height / GLYPH_H;
    this.tint = tint == null ? 0xffffff : tint;
    this.align = align || 'left';   // left | center | right
    this.imgs = [];
    this.shown = null;
    this.x = 0; this.y = 0;
    this.alpha = 1;
    this.spacing = 1;
    this.visible = true;
  }
  NumberDisplay.prototype.setPosition = function (x, y) {
    if (this.x === x && this.y === y) return this;
    this.x = x; this.y = y; this.layout();
    return this;
  };
  NumberDisplay.prototype.setScaleH = function (h) {
    var s = h / GLYPH_H;
    if (s === this.scale) return this;
    this.scale = s;
    for (var i = 0; i < this.imgs.length; i++) this.imgs[i].setScale(s);
    this.layout();
    return this;
  };
  NumberDisplay.prototype.setTint = function (t) {
    if (this.tint === t) return this;
    this.tint = t;
    for (var i = 0; i < this.imgs.length; i++) this.imgs[i].setTint(t);
    return this;
  };
  NumberDisplay.prototype.setAlpha = function (a) {
    if (this.alpha === a) return this;
    this.alpha = a;
    for (var i = 0; i < this.imgs.length; i++) this.imgs[i].setAlpha(a);
    return this;
  };
  NumberDisplay.prototype.setVisible = function (v) {
    v = !!v;
    if (this.visible === v) return this;
    this.visible = v;
    for (var i = 0; i < this.imgs.length; i++) this.imgs[i].setVisible(v && i < this.usedCount);
    return this;
  };
  NumberDisplay.prototype.usedCount = 0;
  NumberDisplay.prototype.setText = function (str) {
    str = String(str);
    if (str === this.shown) return this;
    this.shown = str;
    var i, img;
    while (this.imgs.length < str.length) {
      img = this.scene.add.image(0, 0, 'digits', 0).setOrigin(0, 0.5);
      img.setScale(this.scale).setTint(this.tint).setAlpha(this.alpha);
      this.layer.add(img);
      this.imgs.push(img);
    }
    var n = 0;
    for (i = 0; i < str.length; i++) {
      var idx = GLYPH_ORDER.indexOf(str.charAt(i));
      img = this.imgs[i];
      if (idx < 0) { img.setVisible(false); continue; }   // guarded: unknown glyph
      img.setFrame(idx);
      img.setVisible(this.visible);
      n++;
    }
    for (i = str.length; i < this.imgs.length; i++) this.imgs[i].setVisible(false);
    this.usedCount = str.length;
    this.layout();
    return this;
  };
  NumberDisplay.prototype.width = function () {
    var str = this.shown || '';
    return str.length * (GLYPH_W * this.scale + this.spacing);
  };
  NumberDisplay.prototype.layout = function () {
    var str = this.shown || '';
    var adv = GLYPH_W * this.scale + this.spacing;
    var total = str.length * adv;
    var x0 = this.x;
    if (this.align === 'center') x0 -= total / 2;
    else if (this.align === 'right') x0 -= total;
    for (var i = 0; i < str.length && i < this.imgs.length; i++) {
      this.imgs[i].setPosition(x0 + i * adv, this.y);
    }
  };
  NumberDisplay.prototype.destroy = function () {
    for (var i = 0; i < this.imgs.length; i++) this.imgs[i].destroy();
    this.imgs.length = 0;
    if (this.box) { this.box.destroy(); this.box = null; }
  };

  // ================================================================ boot
  var FONT = 'Verdana, Geneva, system-ui, sans-serif';

  var BootScene = {
    key: 'Boot',
    preload: function () {
      kit.loader.show('SPIRE ASCENT');
      var self = this;
      this.load.on('progress', function (p) { kit.loader.progress(p * 0.98); });

      this.load.atlas('atlas', 'assets/atlas.png', 'assets/atlas.json');
      this.load.spritesheet('digits', 'assets/digits.png',
        { frameWidth: GLYPH_W, frameHeight: GLYPH_H });
      this.load.image('logo', 'assets/logo.png');
      this.load.image('lava', 'assets/lava.png');
      this.load.image('vignette', 'assets/vignette.png');
      this.load.image('windfield', 'assets/windfield.png');
      for (var i = 0; i < 4; i++) {
        this.load.image('sky' + i, 'assets/sky_' + i + '.png');
        this.load.image('far' + i, 'assets/far_' + i + '.png');
        this.load.image('near' + i, 'assets/near_' + i + '.png');
        this.load.image('wall' + i, 'assets/wall_' + i + '.png');
      }
      this.load.on('complete', function () { self.registerAudio(); });
    },
    registerAudio: function () {
      var map = {
        jump: 'assets/sfx_jump.mp3', jumpBig: 'assets/sfx_jump_big.mp3',
        charge: 'assets/sfx_charge.mp3', dash: 'assets/sfx_dash.mp3',
        land: 'assets/sfx_land.mp3', wallkick: 'assets/sfx_wallkick.mp3',
        spring: 'assets/sfx_spring.mp3', crumble: 'assets/sfx_crumble.mp3',
        crack: 'assets/sfx_crack.mp3', wind: 'assets/sfx_wind.mp3',
        rumble: 'assets/sfx_rumble.mp3', ember: 'assets/sfx_ember.mp3',
        milestone: 'assets/sfx_milestone.mp3', medal: 'assets/sfx_medal.mp3',
        unlock: 'assets/sfx_unlock.mp3', best: 'assets/sfx_best.mp3',
        death: 'assets/sfx_death.mp3', spike: 'assets/sfx_spike.mp3',
        ui: 'assets/sfx_ui.mp3', start: 'assets/sfx_start.mp3',
        climb: 'assets/music_climb.mp3', peril: 'assets/music_peril.mp3'
      };
      for (var i = 0; i < 5; i++) map['combo' + i] = 'assets/sfx_combo' + i + '.mp3';
      kit.audio.register(map);
    },
    create: function () {
      kit.loader.progress(1);
      kit.loader.hide();
      SA_STATE.ready = true;
      SA_STATE.phase = 'title';
      this.scene.start('Title');
    }
  };

  // =============================================================== title
  var TitleScene = {
    key: 'Title',

    create: function () {
      Game.title = this;
      SA_STATE.phase = 'title';
      markDebugCollections();
      rebuildDebugCollections();
      SA_STATE.skin = profile.skin;
      SA_STATE.trail = profile.trail;
      SA_STATE.bestHeight = bestHeightEver();

      var self = this;
      this.cameras.main.setBackgroundColor('#0a0713');

      this.bg = this.add.image(0, 0, 'sky3').setOrigin(0, 0);
      this.bgNear = this.add.image(0, 0, 'near3').setOrigin(0, 0).setAlpha(0.5);
      this.logo = this.add.image(0, 0, 'logo').setOrigin(0.5, 0.5);

      this.title = this.add.text(0, 0, 'SPIRE ASCENT', {
        fontFamily: FONT, fontSize: '30px', fontStyle: 'bold', color: '#ffd9a0'
      }).setOrigin(0.5, 0.5);
      this.title.setShadow(0, 3, '#000000', 10, false, true);
      this.tagline = this.add.text(0, 0, 'CLIMB UNTIL THE LAVA WINS', {
        fontFamily: FONT, fontSize: '12px', color: '#c9b7e8'
      }).setOrigin(0.5, 0.5);

      this.rows = [];
      this.buttons = [];

      this.modeBtn = this.mkButton('ENDLESS CLIMB', 'Escalating doom line, no ceiling', function () {
        self.setMode('endless');
      });
      this.dailyBtn = this.mkButton('DAILY SEED', 'Same tower for everyone today', function () {
        self.setMode('daily');
      });
      this.playBtn = this.mkButton('CLIMB', '', function () { self.start(); }, true);
      this.setBtn = this.mkButton('SETTINGS', '', function () { kit.audio.sfx('ui'); openSettings(); });

      this.statLine = this.add.text(0, 0, '', {
        fontFamily: FONT, fontSize: '12px', color: '#9f8fc4', align: 'center'
      }).setOrigin(0.5, 0.5);

      this.gearLabel = this.add.text(0, 0, 'CLIMBER', {
        fontFamily: FONT, fontSize: '10px', color: '#7f6fa8'
      }).setOrigin(0.5, 0.5);
      this.trailLabel = this.add.text(0, 0, 'TRAIL', {
        fontFamily: FONT, fontSize: '10px', color: '#7f6fa8'
      }).setOrigin(0.5, 0.5);

      this.skinChips = [];
      for (var i = 0; i < SKINS.length; i++) this.skinChips.push(this.mkChip(SKINS[i], 'skin', i));
      this.trailChips = [];
      for (var j = 0; j < TRAILS.length; j++) this.trailChips.push(this.mkChip(TRAILS[j], 'trail', j));

      this.gearNote = this.add.text(0, 0, '', {
        fontFamily: FONT, fontSize: '11px', color: '#cbb9ee', align: 'center'
      }).setOrigin(0.5, 0.5);

      this.medalRow = [];
      for (var m = 0; m < MEDALS.length; m++) {
        var im = this.add.image(0, 0, 'atlas', MEDALS[m].frame).setOrigin(0.5, 0.5).setScale(0.62);
        this.medalRow.push(im);
      }

      this.embers = this.add.particles(0, 0, 'atlas', {
        frame: 'p_dust', lifespan: 4200, speedY: { min: -26, max: -9 },
        speedX: { min: -12, max: 12 }, scale: { start: 0.5, end: 0 },
        alpha: { start: 0.5, end: 0 }, tint: 0xffb870, quantity: 1,
        frequency: 240, blendMode: 'ADD'
      });

      this.layout();
      this.scale.on('resize', this.layout, this);
      this.events.once('shutdown', function () {
        self.scale.off('resize', self.layout, self);
      });

      this.refresh();
      kit.audio.music('climb', 900);
      kit.registerPWA();
    },

    mkButton: function (label, sub, onTap, primary) {
      var g = this.add.container(0, 0);
      // A dark plate multiplied by a warm tint stays dark, so the primary and
      // selected lanes get the light plate base instead of a tinted dark one.
      var bg = this.add.image(0, 0, 'atlas', primary ? 'panel_lit' : 'panel').setOrigin(0.5, 0.5);
      bg.setDisplaySize(260, sub ? 56 : 46);
      var t = this.add.text(0, sub ? -9 : 0, label, {
        fontFamily: FONT, fontSize: primary ? '19px' : '15px', fontStyle: 'bold',
        color: primary ? '#1a0f05' : '#f2e8ff'
      }).setOrigin(0.5, 0.5);
      g.add(bg); g.add(t);
      var s = null;
      if (sub) {
        s = this.add.text(0, 12, sub, {
          fontFamily: FONT, fontSize: '10px', color: '#a292c8'
        }).setOrigin(0.5, 0.5);
        g.add(s);
      }
      if (primary) bg.setTint(0xffc978);
      bg.setInteractive({ useHandCursor: true });
      var self = this;
      bg.on('pointerdown', function () {
        self.tweens.add({ targets: g, scale: 0.96, duration: 70, yoyo: true, ease: 'Quad.easeOut' });
        onTap();
      });
      g.__bg = bg; g.__t = t; g.__s = s; g.__primary = !!primary;
      this.buttons.push(g);
      return g;
    },

    mkChip: function (item, kind, index) {
      var g = this.add.container(0, 0);
      var bg = this.add.image(0, 0, 'atlas', 'panel').setOrigin(0.5, 0.5);
      bg.setDisplaySize(58, 58);
      var icon;
      if (kind === 'skin') {
        icon = this.add.image(0, -2, 'atlas', 'climber_' + item.key + '_run').setOrigin(0.5, 0.5);
        icon.setScale(0.78);
      } else {
        icon = this.add.image(0, -2, 'atlas', item.frame).setOrigin(0.5, 0.5);
        icon.setScale(1.5).setTint(item.tint);
      }
      var lock = this.add.text(0, 18, '', {
        fontFamily: FONT, fontSize: '9px', color: '#9a8ac0'
      }).setOrigin(0.5, 0.5);
      g.add(bg); g.add(icon); g.add(lock);
      g.__bg = bg; g.__icon = icon; g.__lock = lock; g.__item = item; g.__kind = kind;
      bg.setInteractive({ useHandCursor: true });
      var self = this;
      bg.on('pointerdown', function () {
        if (bestHeightEver() < item.need) {
          kit.audio.sfx('ui', { volume: 0.5 });
          setTextIfChanged(self.gearNote, 'LOCKED  reach ' + item.need + 'm to unlock ' + item.name);
          return;
        }
        kit.audio.sfx('ui');
        if (kind === 'skin') profile.skin = item.key; else profile.trail = item.key;
        persist();
        self.refresh();
      });
      return g;
    },

    paintModeBtn: function (btn, selected, tint, darkText) {
      setFrameIfChanged(btn.__bg, selected ? 'panel_lit' : 'panel');
      btn.__bg.setTint(selected ? tint : 0xffffff);
      btn.__bg.setAlpha(selected ? 1 : 0.78);
      setColorIfChanged(btn.__t, selected ? darkText : '#f2e8ff');
      if (btn.__s) setColorIfChanged(btn.__s, selected ? '#4a3410' : '#a292c8');
    },

    setMode: function (m) {
      profile.mode = m;
      persist();
      kit.audio.sfx('ui');
      this.refresh();
    },

    start: function () {
      kit.audio.sfx('start');
      SA_STATE.phase = 'play';
      this.scene.start('Play', { mode: profile.mode });
    },

    refresh: function () {
      var i, c;
      var m = profile.mode;
      this.paintModeBtn(this.modeBtn, m === 'endless', 0xffba60, '#2a1704');
      this.paintModeBtn(this.dailyBtn, m === 'daily', 0x7ee0ff, '#04202a');

      var best = m === 'daily'
        ? (profile.bestDailySeed === dailySeed() ? profile.bestDailyScore : 0)
        : profile.bestEndless;
      var line = 'BEST ' + Math.floor(best) + '   HIGH MARK ' + Math.floor(bestHeightEver()) + 'm   RUNS ' + (profile.runs | 0);
      if (m === 'daily') line += '\nSEED ' + dailyLabel() + '   GOAL ' + DAILY_GOAL + 'm';
      setTextIfChanged(this.statLine, line);

      for (i = 0; i < this.skinChips.length; i++) {
        c = this.skinChips[i];
        var un = bestHeightEver() >= c.__item.need;
        c.__icon.setAlpha(un ? 1 : 0.22);
        setTextIfChanged(c.__lock, un ? '' : c.__item.need + 'm');
        var sel = profile.skin === c.__item.key;
        c.__bg.setTint(sel ? 0xffba60 : 0xffffff);
        c.__bg.setAlpha(sel ? 0.95 : 0.6);
      }
      for (i = 0; i < this.trailChips.length; i++) {
        c = this.trailChips[i];
        var un2 = bestHeightEver() >= c.__item.need;
        c.__icon.setAlpha(un2 ? 1 : 0.22);
        setTextIfChanged(c.__lock, un2 ? '' : c.__item.need + 'm');
        var sel2 = profile.trail === c.__item.key;
        c.__bg.setTint(sel2 ? 0x7ee0ff : 0xffffff);
        c.__bg.setAlpha(sel2 ? 0.95 : 0.6);
      }
      setTextIfChanged(this.gearNote, SKIN(profile.skin).note + '  ·  ' + TRAIL(profile.trail).name + ' trail');

      for (i = 0; i < this.medalRow.length; i++) {
        var got = !!profile.medals[MEDALS[i].key];
        this.medalRow[i].setAlpha(got ? 1 : 0.18);
      }
      SA_STATE.skin = profile.skin;
      SA_STATE.trail = profile.trail;
      markDebugCollections();
      rebuildDebugCollections();
      SA_STATE.mode = profile.mode;
    },

    layout: function () {
      var W = this.scale.width, H = this.scale.height;
      var cx = W / 2;
      var s = Math.max(W / 240, H / 480);
      this.bg.setScale(s).setPosition((W - 240 * s) / 2, (H - 480 * s) / 2);
      this.bgNear.setScale(s).setPosition((W - 240 * s) / 2, (H - 480 * s) / 2);

      var pad = 14;
      var top = 26 + (this.insetTop || 0);
      var compact = H < 660;
      var ultra = H < 600;

      this.logo.setPosition(cx, top + 62).setScale(compact ? 0.42 : 0.54);
      this.title.setPosition(cx, top + (compact ? 116 : 138));
      this.tagline.setPosition(cx, top + (compact ? 138 : 162));

      var y = top + (compact ? 168 : 196);
      this.modeBtn.setPosition(cx, y); y += compact ? 62 : 68;
      this.dailyBtn.setPosition(cx, y); y += compact ? 58 : 64;
      this.statLine.setPosition(cx, y + 6); y += compact ? 44 : 50;

      this.gearLabel.setPosition(cx, y); y += 16;
      var n = this.skinChips.length;
      var cw = Math.min(62, (W - pad * 2) / n);
      for (var i = 0; i < n; i++) {
        this.skinChips[i].setPosition(cx + (i - (n - 1) / 2) * cw, y + 26);
        this.skinChips[i].setScale(Math.min(1, cw / 62));
      }
      y += 60;
      this.trailLabel.setPosition(cx, y); y += 16;
      var n2 = this.trailChips.length;
      for (var j = 0; j < n2; j++) {
        this.trailChips[j].setPosition(cx + (j - (n2 - 1) / 2) * cw, y + 26);
        this.trailChips[j].setScale(Math.min(1, cw / 62));
      }
      y += 58;
      this.gearNote.setPosition(cx, y).setWordWrapWidth(W - 40);
      y += 26;
      for (var k = 0; k < this.medalRow.length; k++) {
        this.medalRow[k].setPosition(cx + (k - 2) * 34, y);
      }
      y += 34;

      for (var q = 0; q < this.skinChips.length; q++) this.skinChips[q].setVisible(!ultra);
      for (var q2 = 0; q2 < this.trailChips.length; q2++) this.trailChips[q2].setVisible(!ultra);
      for (var q3 = 0; q3 < this.medalRow.length; q3++) this.medalRow[q3].setVisible(!ultra);
      this.gearLabel.setVisible(!ultra); this.trailLabel.setVisible(!ultra); this.gearNote.setVisible(!ultra);
      this.playBtn.setPosition(cx, ultra ? H - 86 : Math.min(y + 12, H - 78));
      this.setBtn.setPosition(cx, ultra ? H - 34 : Math.min(y + 66, H - 30));

      if (this.embers) {
        this.embers.setVisible(flashOn());
        this.embers.setPosition(0, H + 10);
        this.embers.setParticleGravity(0, 0);
        if (this.embers.setEmitZone) {
          this.embers.setEmitZone({ type: 'random', source: new Phaser.Geom.Rectangle(0, 0, W, 8) });
        }
      }
    }
  };

  // ================================================================ play
  var PlayScene = {
    key: 'Play',

    init: function (data) {
      var forced = TEST_HOOKS ? SA_STATE.forceMode : null;
      var m = (forced === 'endless' || forced === 'daily') ? forced
        : ((data && data.mode) || profile.mode || 'endless');
      this.mode = m;
      if (TEST_HOOKS) SA_STATE.forceMode = null;
    },

    create: function () {
      Game.play = this;
      var self = this;
      this.debugState = SA_STATE;

      this.tower = new Tower();
      this.field = { fx: 0, fy: 0, n: 0 };
      this.acc = 0;
      this.lastNow = 0;

      this.cameras.main.setBackgroundColor('#0a0713');

      this.world = this.add.container(0, 0);
      this.ui = this.add.container(0, 0);

      this.buildWorld();
      this.buildHud();

      // Real second camera for the HUD split.  Each camera is told exactly
      // which layer to ignore, so neither list can silently render twice.
      this.uiCam = this.cameras.add(0, 0, this.scale.width, this.scale.height);
      this.uiCam.setName('hud');
      this.uiCam.setScroll(0, 0);
      this.cameras.main.ignore(this.ui);
      this.uiCam.ignore(this.world);

      this.bindInput();
      this.layout();
      this.scale.on('resize', this.layout, this);

      this.events.once('shutdown', function () {
        self.scale.off('resize', self.layout, self);
        self.unbindInput();
        Game.play = null;
      });

      this.startRun();
    },

    // ------------------------------------------------------ world layer
    buildWorld: function () {
      var i;
      // Two full parallax stacks so a band change crossfades instead of
      // popping.  All six are scrollFactor 0 and are scrolled by hand.
      this.bgA = { sky: null, far: null, near: null, wl: null, wr: null };
      this.bgB = { sky: null, far: null, near: null, wl: null, wr: null };
      var mk = function (scene, tex, alpha) {
        var t = scene.add.tileSprite(0, 0, VW, 480, tex).setOrigin(0, 0);
        t.setScrollFactor(0).setAlpha(alpha);
        scene.world.add(t);
        return t;
      };
      this.bgA.sky = mk(this, 'sky0', 1);
      this.bgB.sky = mk(this, 'sky1', 0);
      this.bgA.far = mk(this, 'far0', BG_FAR_A);
      this.bgB.far = mk(this, 'far1', 0);
      this.bgA.near = mk(this, 'near0', BG_NEAR_A);
      this.bgB.near = mk(this, 'near1', 0);

      this.bgA.wl = this.add.tileSprite(0, 0, WALL, 480, 'wall0').setOrigin(0, 0).setScrollFactor(0);
      this.bgA.wr = this.add.tileSprite(0, 0, WALL, 480, 'wall0').setOrigin(0, 0).setScrollFactor(0).setFlipX(true);
      this.bgB.wl = this.add.tileSprite(0, 0, WALL, 480, 'wall1').setOrigin(0, 0).setScrollFactor(0).setAlpha(0);
      this.bgB.wr = this.add.tileSprite(0, 0, WALL, 480, 'wall1').setOrigin(0, 0).setScrollFactor(0).setFlipX(true).setAlpha(0);
      this.world.add(this.bgA.wl); this.world.add(this.bgA.wr);
      this.world.add(this.bgB.wl); this.world.add(this.bgB.wr);
      this.bgFade = 1;   // 1 = A fully shown

      // wind zones: pooled panels plus a shared chevron pool
      this.windPool = [];
      for (i = 0; i < 5; i++) {
        var wt = this.add.tileSprite(0, 0, VW - WALL * 2, 100, 'windfield').setOrigin(0, 0);
        wt.setVisible(false).setAlpha(0.5).setBlendMode(Phaser.BlendModes.ADD);
        this.world.add(wt);
        this.windPool.push(wt);
      }
      this.chevPool = [];
      for (i = 0; i < 24; i++) {
        var cv = this.add.image(0, 0, 'atlas', 'chevron').setVisible(false);
        cv.setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.6);
        this.world.add(cv);
        this.chevPool.push(cv);
      }

      // wall spikes
      this.spikePool = [];
      for (i = 0; i < 10; i++) {
        var sp = this.add.tileSprite(0, 0, 20, 60, 'atlas', 'wall_spike').setOrigin(0, 0);
        sp.setVisible(false);
        this.world.add(sp);
        this.spikePool.push(sp);
      }

      // platforms as nine slices, plus edge spikes and spring caps
      // Platforms are single stretched images, not nine slices.  A nine
      // slice is nine quads; thirty of them was 270 quads of vertex work
      // every frame for a 4 px corner radius nobody can see.  Only the
      // horizontal axis is scaled, so the cap and shadow bands keep their
      // exact pixel thickness.
      this.platPool = [];
      for (i = 0; i < 30; i++) {
        var ns = this.add.image(0, 0, 'atlas', 'plat_ledge_0').setOrigin(0, 0);
        ns.setVisible(false);
        this.world.add(ns);
        this.platPool.push(ns);
      }
      this.edgeSpikePool = [];
      for (i = 0; i < 14; i++) {
        var es = this.add.tileSprite(0, 0, 30, 16, 'atlas', 'spike_strip').setOrigin(0, 1);
        es.setVisible(false);
        this.world.add(es);
        this.edgeSpikePool.push(es);
      }
      this.springPool = [];
      for (i = 0; i < 12; i++) {
        var sc = this.add.image(0, 0, 'atlas', 'spring_cap').setOrigin(0.5, 1).setVisible(false);
        this.world.add(sc);
        this.springPool.push(sc);
      }
      this.markPool = [];
      for (i = 0; i < 10; i++) {
        var mk2 = this.add.image(0, 0, 'atlas', 'chevron').setOrigin(0.5, 0.5).setVisible(false);
        mk2.setAngle(-90).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.7);
        this.world.add(mk2);
        this.markPool.push(mk2);
      }

      // embers
      this.emberPool = [];
      for (i = 0; i < 18; i++) {
        var ep = this.add.image(0, 0, 'atlas', 'ember').setOrigin(0.5, 0.5).setVisible(false);
        ep.setBlendMode(Phaser.BlendModes.ADD);
        this.world.add(ep);
        this.emberPool.push(ep);
      }

      // lava
      this.lavaGlow = this.add.image(0, 0, 'atlas', 'p_disc').setOrigin(0.5, 0.5);
      this.lavaGlow.setBlendMode(Phaser.BlendModes.ADD).setTint(0xff7a20).setAlpha(0.5);
      this.world.add(this.lavaGlow);
      this.lava = this.add.tileSprite(0, 0, VW, 200, 'lava').setOrigin(0, 0);
      this.world.add(this.lava);

      // climber
      this.climber = this.add.image(0, 0, 'atlas', 'climber_emberling_run').setOrigin(0.5, 1);
      this.world.add(this.climber);
      // Hostile pool.  Enemies use the authored atlas glints as compact
      // original silhouettes, keeping the fleet payload under the image
      // budget while still giving patrol, telegraph and projectile states a
      // dedicated view.
      this.enemyPool = [];
      for (i = 0; i < ENEMY_MAX; i++) {
        var en = this.add.image(0, 0, 'atlas', 'p_disc').setOrigin(0.5, 0.5).setVisible(false);
        en.setBlendMode(Phaser.BlendModes.ADD);
        this.world.add(en); this.enemyPool.push(en);
      }
      this.boltPool = [];
      for (i = 0; i < BOLT_MAX; i++) {
        var bo = this.add.image(0, 0, 'atlas', 'p_bolt').setOrigin(0.5, 0.5).setVisible(false);
        bo.setBlendMode(Phaser.BlendModes.ADD); this.world.add(bo); this.boltPool.push(bo);
      }
      this.powerupPool = [];
      for (i = 0; i < POWERUP_MAX; i++) {
        var pu = this.add.image(0, 0, 'atlas', 'p_bolt').setOrigin(0.5, 0.5).setVisible(false);
        pu.setBlendMode(Phaser.BlendModes.ADD); this.world.add(pu); this.powerupPool.push(pu);
      }
      this.pips = [];
      for (i = 0; i < 12; i++) {
        var pip = this.add.image(0, 0, 'atlas', 'pip').setOrigin(0.5, 0.5).setVisible(false);
        pip.setBlendMode(Phaser.BlendModes.ADD);
        this.world.add(pip);
        this.pips.push(pip);
      }
      this.dashMark = [];
      for (i = 0; i < 2; i++) {
        var dm = this.add.image(0, 0, 'atlas', 'chevron').setOrigin(0.5, 0.5).setVisible(false);
        dm.setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.85).setScale(0.7);
        this.world.add(dm);
        this.dashMark.push(dm);
      }

      // particle systems (pooled emitters, six of them)
      this.fxDust = this.add.particles(0, 0, 'atlas', {
        frame: 'p_dust', lifespan: 520, speed: { min: 20, max: 110 },
        scale: { start: 0.7, end: 0 }, alpha: { start: 0.85, end: 0 },
        gravityY: 320, emitting: false, tint: 0xffe3bb
      });
      this.fxSpark = this.add.particles(0, 0, 'atlas', {
        frame: 'p_spark', lifespan: 460, speed: { min: 80, max: 300 },
        scale: { start: 0.9, end: 0.1 }, alpha: { start: 1, end: 0 },
        rotate: { onEmit: function (p) { return Phaser.Math.RadToDeg(Math.atan2(p.velocityY, p.velocityX)); } },
        blendMode: 'ADD', emitting: false, tint: 0xfff0b0
      });
      this.fxShard = this.add.particles(0, 0, 'atlas', {
        frame: 'p_shard', lifespan: 900, speed: { min: 40, max: 220 },
        scale: { start: 0.9, end: 0.2 }, alpha: { start: 1, end: 0 },
        gravityY: 720, rotate: { start: 0, end: 360 }, emitting: false, tint: 0xd8b48a
      });
      this.fxTrail = this.add.particles(0, 0, 'atlas', {
        frame: 'p_dust', lifespan: 420, speed: { min: 4, max: 30 },
        scale: { start: 0.55, end: 0 }, alpha: { start: 0.6, end: 0 },
        emitting: false, tint: 0xffe0b0
      });
      this.fxWind = this.add.particles(0, 0, 'atlas', {
        frame: 'p_streak', lifespan: 700, speedX: { min: -10, max: 10 },
        scale: { start: 0.8, end: 0.2 }, alpha: { start: 0.55, end: 0 },
        blendMode: 'ADD', emitting: false, tint: 0xbfe9ff
      });
      this.fxGlow = this.add.particles(0, 0, 'atlas', {
        frame: 'p_disc', lifespan: 620, speed: { min: 10, max: 70 },
        scale: { start: 0.5, end: 0 }, alpha: { start: 0.75, end: 0 },
        blendMode: 'ADD', emitting: false, tint: 0xffc060
      });
      this.world.add(this.fxDust); this.world.add(this.fxSpark);
      this.world.add(this.fxShard); this.world.add(this.fxTrail);
      this.world.add(this.fxWind); this.world.add(this.fxGlow);
    },

    // -------------------------------------------------------- hud layer
    buildHud: function () {
      var self = this;
      var i;

      this.vignette = this.add.image(0, 0, 'vignette').setOrigin(0.5, 0.5);
      this.vignette.setTint(0xff3a10).setAlpha(0);
      this.ui.add(this.vignette);

      this.flashPlate = this.add.rectangle(0, 0, 10, 10, 0xffffff).setOrigin(0, 0).setAlpha(0);
      this.ui.add(this.flashPlate);

      this.scorePanel = this.add.image(0, 0, 'atlas', 'panel').setOrigin(0, 0);
      this.scorePanel.setDisplaySize(132, 46);
      this.ui.add(this.scorePanel);
      this.scoreLabel = this.add.text(0, 0, 'SCORE', {
        fontFamily: FONT, fontSize: '9px', color: '#a695c8'
      }).setOrigin(0, 0).setVisible(false);
      this.ui.add(this.scoreLabel);
      this.scoreNum = new NumberDisplay(this, this.ui, 24, 0xffffff, 'left');
      this.scoreNum.setText('0');

      this.heightNum = new NumberDisplay(this, this.ui, 15, 0xffc98a, 'left');
      this.heightNum.setText('0m');

      this.rightPanel = this.add.image(0, 0, 'atlas', 'panel').setOrigin(1, 0);
      this.rightPanel.setDisplaySize(120, 46).setVisible(false);
      this.ui.add(this.rightPanel);
      this.modeText = this.add.text(0, 0, 'ENDLESS', {
        fontFamily: FONT, fontSize: '10px', fontStyle: 'bold', color: '#ffba60'
      }).setOrigin(1, 0).setVisible(false);
      this.ui.add(this.modeText);
      this.bestLabel = this.add.text(0, 0, 'BEST', {
        fontFamily: FONT, fontSize: '9px', color: '#a695c8'
      }).setOrigin(1, 0).setVisible(false);
      this.ui.add(this.bestLabel);
      this.bestNum = new NumberDisplay(this, this.ui, 16, 0xe8dcff, 'right');
      this.bestNum.setText('0');
      this.bestNum.setVisible(false);

      // The world palette and results screen carry band identity; the active
      // HUD does not repeat a long room name over the playfield.
      this.bandChip = this.add.image(0, 0, 'atlas', 'panel').setOrigin(0.5, 0);
      this.bandChip.setDisplaySize(210, 24).setAlpha(0).setVisible(false);
      this.ui.add(this.bandChip);
      this.bandText = this.add.text(0, 0, '', {
        fontFamily: FONT, fontSize: '10px', fontStyle: 'bold', color: '#ffba60'
      }).setOrigin(0.5, 0.5).setVisible(false);
      this.ui.add(this.bandText);

      // combo chip
      this.comboChip = this.add.image(0, 0, 'atlas', 'panel').setOrigin(0.5, 0.5);
      this.comboChip.setDisplaySize(72, 28).setAlpha(0);
      this.ui.add(this.comboChip);
      this.comboNum = new NumberDisplay(this, this.ui, 19, 0x9fe8ff, 'center');
      this.comboNum.setText('x0');
      this.comboNum.setAlpha(0);
      this.comboLabel = this.add.text(0, 0, 'COMBO', {
        fontFamily: FONT, fontSize: '8px', color: '#8fd8ff'
      }).setOrigin(0.5, 0.5).setAlpha(0).setVisible(false);
      this.ui.add(this.comboLabel);

      // charge readout
      this.chargeFrame = this.add.image(0, 0, 'atlas', 'bar_frame').setOrigin(0, 0.5);
      this.chargeFrame.setDisplaySize(104, 12);
      this.ui.add(this.chargeFrame);
      this.chargeFill = this.add.image(0, 0, 'atlas', 'px').setOrigin(0, 0.5);
      this.chargeFill.setDisplaySize(2, 6).setTint(0xffd070);
      this.ui.add(this.chargeFill);
      this.chargeLabel = this.add.text(0, 0, 'CHARGE', {
        fontFamily: FONT, fontSize: '8px', color: '#c9b7e8'
      }).setOrigin(0, 0.5).setVisible(false);
      this.ui.add(this.chargeLabel);
      this.chargeIcon = this.add.image(0, 0, 'atlas', 'pip').setOrigin(0.5, 0.5)
        .setScale(1.15).setTint(0xffc060);
      this.ui.add(this.chargeIcon);

      // dash readout
      this.dashFrame = this.add.image(0, 0, 'atlas', 'bar_frame').setOrigin(0, 0.5);
      this.dashFrame.setDisplaySize(72, 12);
      this.ui.add(this.dashFrame);
      this.dashFill = this.add.image(0, 0, 'atlas', 'px').setOrigin(0, 0.5);
      this.dashFill.setDisplaySize(2, 6).setTint(0x8fe9ff);
      this.ui.add(this.dashFill);
      this.dashLabel = this.add.text(0, 0, 'DASH', {
        fontFamily: FONT, fontSize: '8px', color: '#9fdcff'
      }).setOrigin(0, 0.5).setVisible(false);
      this.ui.add(this.dashLabel);
      this.dashIcon = this.add.image(0, 0, 'atlas', 'chevron').setOrigin(0.5, 0.5)
        .setScale(0.48).setTint(0x8fe9ff);
      this.ui.add(this.dashIcon);

      // wind chip
      this.windChip = this.add.image(0, 0, 'atlas', 'panel').setOrigin(1, 0.5);
      this.windChip.setDisplaySize(82, 24).setAlpha(0);
      this.ui.add(this.windChip);
      this.windText = this.add.text(0, 0, 'WIND', {
        fontFamily: FONT, fontSize: '9px', fontStyle: 'bold', color: '#bfe9ff'
      }).setOrigin(1, 0.5).setAlpha(0).setVisible(false);
      this.ui.add(this.windText);
      this.windArrows = [];
      for (i = 0; i < 3; i++) {
        var wa = this.add.image(0, 0, 'atlas', 'chevron').setOrigin(0.5, 0.5).setAlpha(0);
        wa.setTint(0xbfe9ff).setScale(0.6);
        this.ui.add(wa);
        this.windArrows.push(wa);
      }

      // Active power-up and damage status stay in the same HUD lane as the
      // wind readout, so a timed effect is never invisible to the player.
      this.powerChip = this.add.image(0, 0, 'atlas', 'panel').setOrigin(1, 0.5);
      this.powerChip.setDisplaySize(112, 24).setAlpha(0);
      this.ui.add(this.powerChip);
      this.powerText = this.add.text(0, 0, '', {
        fontFamily: FONT, fontSize: '14px', fontStyle: 'bold', color: '#ffe6a0'
      }).setOrigin(1, 0.5).setAlpha(0);
      this.ui.add(this.powerText);
      this.hpText = this.add.text(0, 0, '♥♥', {
        fontFamily: FONT, fontSize: '17px', color: '#ffb0a0'
      }).setOrigin(1, 0.5);
      this.ui.add(this.hpText);

      // Doom is a meter and a vignette state; its repeating words are gone.
      this.doomFrame = this.add.image(0, 0, 'atlas', 'bar_frame').setOrigin(0.5, 0.5);
      this.doomFrame.setDisplaySize(180, 12);
      this.ui.add(this.doomFrame);
      this.doomFill = this.add.image(0, 0, 'atlas', 'px').setOrigin(0, 0.5);
      this.doomFill.setDisplaySize(2, 7).setTint(0xff6a30);
      this.ui.add(this.doomFill);
      this.doomText = this.add.text(0, 0, 'DOOM LINE', {
        fontFamily: FONT, fontSize: '9px', fontStyle: 'bold', color: '#ffb08a'
      }).setOrigin(0.5, 0.5).setVisible(false);
      this.ui.add(this.doomText);

      // daily clock
      this.clockNum = new NumberDisplay(this, this.ui, 15, 0x7ee0ff, 'center');
      this.clockNum.setText('0:00');
      this.clockNum.setVisible(false);

      // Center banners are reserved for run boundaries and medal ceremonies.
      this.banner = this.add.container(0, 0);
      this.bannerPlate = this.add.image(0, 0, 'atlas', 'banner').setOrigin(0.5, 0.5);
      this.bannerT1 = this.add.text(0, -12, '', {
        fontFamily: FONT, fontSize: '19px', fontStyle: 'bold', color: '#ffffff'
      }).setOrigin(0.5, 0.5);
      this.bannerT2 = this.add.text(0, 12, '', {
        fontFamily: FONT, fontSize: '14px', color: '#d8c8f4'
      }).setOrigin(0.5, 0.5);
      this.bannerIcon = this.add.image(0, 0, 'atlas', 'medal_gold').setOrigin(0.5, 0.5).setVisible(false);
      this.banner.add(this.bannerPlate);
      this.banner.add(this.bannerIcon);
      this.banner.add(this.bannerT1);
      this.banner.add(this.bannerT2);
      this.banner.setAlpha(0);
      this.ui.add(this.banner);

      // coach strip: a thin fading strip high on the screen.  It never covers
      // the play area centre or the bottom half.
      this.coach = this.add.container(0, 0);
      this.coachPlate = this.add.image(0, 0, 'atlas', 'panel').setOrigin(0.5, 0.5);
      this.coachPlate.setDisplaySize(300, 26).setAlpha(0.88);
      this.coachText = this.add.text(0, 0, '', {
        fontFamily: FONT, fontSize: '14px', color: '#f0e6ff'
      }).setOrigin(0.5, 0.5);
      this.coach.add(this.coachPlate);
      this.coach.add(this.coachText);
      this.coach.setAlpha(0);
      this.ui.add(this.coach);

      // In-play events use one small edge chip.  It shares the transient
      // queue with the coach strip and boundary banner, so nothing stacks.
      this.toast = this.add.container(0, 0);
      this.toastPlate = this.add.image(0, 0, 'atlas', 'panel').setOrigin(1, 0.5);
      this.toastPlate.setDisplaySize(120, 28).setAlpha(0.9);
      this.toastText = this.add.text(-12, 0, '', {
        fontFamily: FONT, fontSize: '14px', fontStyle: 'bold', color: '#f0e6ff'
      }).setOrigin(1, 0.5);
      this.toast.add(this.toastPlate); this.toast.add(this.toastText);
      this.toast.setAlpha(0);
      this.ui.add(this.toast);
      this.transientQueue = [];
      this.transientActive = null;

      // pause button
      this.pauseBtn = this.add.image(0, 0, 'atlas', 'panel').setOrigin(0.5, 0.5);
      this.pauseBtn.setDisplaySize(44, 44).setAlpha(0.8);
      this.pauseBtn.setInteractive({ useHandCursor: true });
      this.pauseBtn.on('pointerdown', function () { kit.audio.sfx('ui'); openSettings(); });
      this.ui.add(this.pauseBtn);
      this.pauseGlyph = this.add.text(0, 0, '=', {
        fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: '#e8dcff'
      }).setOrigin(0.5, 0.5);
      this.ui.add(this.pauseGlyph);

      // game over card
      this.over = this.add.container(0, 0);
      this.overDim = this.add.rectangle(0, 0, 10, 10, 0x07040f).setOrigin(0.5, 0.5).setAlpha(0.82);
      this.overPlate = this.add.image(0, 0, 'atlas', 'panel').setOrigin(0.5, 0.5);
      this.overTitle = this.add.text(0, 0, 'THE SPIRE WINS', {
        fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: '#ff7a52'
      }).setOrigin(0.5, 0.5);
      this.overWhy = this.add.text(0, 0, '', {
        fontFamily: FONT, fontSize: '11px', color: '#c9b7e8'
      }).setOrigin(0.5, 0.5);
      this.overMedal = this.add.image(0, 0, 'atlas', 'medal_bronze').setOrigin(0.5, 0.5).setVisible(false);
      this.overStats = this.add.text(0, 0, '', {
        fontFamily: FONT, fontSize: '12px', color: '#e6dcf8', align: 'center'
      }).setOrigin(0.5, 0.5);
      this.overBest = this.add.text(0, 0, '', {
        fontFamily: FONT, fontSize: '13px', fontStyle: 'bold', color: '#ffd84d'
      }).setOrigin(0.5, 0.5);
      this.over.add(this.overDim); this.over.add(this.overPlate);
      this.over.add(this.overTitle); this.over.add(this.overWhy);
      this.over.add(this.overMedal); this.over.add(this.overStats); this.over.add(this.overBest);
      this.over.setVisible(false);
      this.ui.add(this.over);
      this.overScore = new NumberDisplay(this, this.ui, 46, 0xffffff, 'center');
      this.overScore.setText('0');

      this.againBtn = this.add.container(0, 0);
      var ab = this.add.image(0, 0, 'atlas', 'panel_lit').setOrigin(0.5, 0.5);
      ab.setDisplaySize(196, 46).setTint(0xffc978);
      var at = this.add.text(0, 0, 'CLIMB AGAIN', {
        fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: '#1a0f05'
      }).setOrigin(0.5, 0.5);
      this.againBtn.add(ab); this.againBtn.add(at);
      ab.setInteractive({ useHandCursor: true });
      ab.on('pointerdown', function () { self.restartRun(); });
      this.againBtn.setVisible(false);
      this.ui.add(this.againBtn);

      this.menuBtn = this.add.container(0, 0);
      var mb = this.add.image(0, 0, 'atlas', 'panel').setOrigin(0.5, 0.5);
      mb.setDisplaySize(196, 38);
      var mt = this.add.text(0, 0, 'TOWER MENU', {
        fontFamily: FONT, fontSize: '13px', color: '#e8dcff'
      }).setOrigin(0.5, 0.5);
      this.menuBtn.add(mb); this.menuBtn.add(mt);
      mb.setInteractive({ useHandCursor: true });
      mb.on('pointerdown', function () {
        kit.audio.sfx('ui');
        self.releaseAll();
        self.scene.start('Title');
      });
      this.menuBtn.setVisible(false);
      this.ui.add(this.menuBtn);
    },

    // ------------------------------------------------------------ input
    // GGKit owns the raw event listeners, pointer identity map and key set.
    // The scene only samples that state, which keeps pause and restart edge
    // handling in one place and avoids a second competing input system.
    bindInput: function () {
      this.press = false;
      this.pressId = null;
      this.lastTapAt = -9;
      this.tapArmed = false;
      this.keyHeld = false;
      this.lastR = false;
      this.lastPause = false;
    },

    unbindInput: function () {
      this.press = false;
      this.pressId = null;
      this.keyHeld = false;
    },

    syncInput: function () {
      var r = this.run;
      if (!r || kit.paused) return;
      var jump = kit.input.keyDown('Space') || kit.input.keyDown('ArrowUp') ||
        kit.input.keyDown('KeyW') || kit.input.keyDown('Enter') || kit.input.keyDown('NumpadEnter');
      var activeId = null, pointer = null;
      for (var entry of kit.input.pointers.entries()) {
        activeId = entry[0]; pointer = entry[1]; break;
      }
      var active = jump || activeId !== null;
      if (active && !this.press) this.onPress();
      if (!active && this.press) this.onRelease();
      this.press = active;
      this.pressId = activeId;
      this.keyHeld = jump;

      // A held touch steers from its starting point.  This gives touch users
      // the same wall and enemy control that A and D provide on a keyboard.
      if (pointer && !r.dead) {
        var dx = pointer.x - pointer.startX;
        if (Math.abs(dx) > 18) r.dir = dx < 0 ? -1 : 1;
      }
      if (kit.input.keyDown('ArrowLeft') || kit.input.keyDown('KeyA')) r.dir = -1;
      if (kit.input.keyDown('ArrowRight') || kit.input.keyDown('KeyD')) r.dir = 1;

      var restart = kit.input.keyDown('KeyR');
      if (restart && !this.lastR) this.restartRun();
      this.lastR = restart;
      var pause = kit.input.keyDown('Escape') || kit.input.keyDown('KeyP');
      if (pause && !this.lastPause) openSettings();
      this.lastPause = pause;
    },

    releaseAll: function () {
      this.press = false;
      this.pressId = null;
      this.keyHeld = false;
      this.lastR = false;
      this.lastPause = false;
      if (this.run) { this.run.holding = false; }
    },

    onPress: function () {
      var r = this.run;
      if (!r) return;
      if (r.dead) {
        if (r.deadT > 0.45) this.restartRun();
        return;
      }
      this.press = true;
      var now = r.tm;
      var airborne = !r.plat && r.coyote <= 0;
      // Double-tap dash.  The window is measured on the sim clock, so a
      // throttled frame slows the whole game rather than eating an input.
      if (airborne && r.dashOk && (now - this.lastTapAt) < DASH_WINDOW) {
        this.doDash();
        this.lastTapAt = -9;
        return;
      }
      this.lastTapAt = now;
      r.buffer = 0.14;
      r.holding = true;
    },

    onRelease: function () {
      this.press = false;
      if (this.run) this.run.holding = false;
    },

    // ------------------------------------------------------------- run
    startRun: function () {
      // The mode switch is honoured here as well as in init(), because a
      // restart is now an in-place reset and never re-runs init().
      var forced = TEST_HOOKS ? SA_STATE.forceMode : null;
      if (forced === 'endless' || forced === 'daily') {
        this.mode = forced;
        if (TEST_HOOKS) SA_STATE.forceMode = null;
      }
      var resume = usableCheckpoint(profile.checkpoint, this.mode);
      if (!resume && profile.checkpoint && profile.checkpoint.mode !== this.mode) {
        profile.checkpoint = null;
      }
      var seed = resume ? profile.checkpoint.seed
        : (this.mode === 'daily' ? dailySeed() : ((Math.random() * 4294967295) >>> 0));
      this.tower.generous = TEST_HOOKS && !!SA_STATE.forceGenerous;
      this.tower.reset(seed);
      this.seed = seed;

      this.run = {
        x: WALL + 28, y: START_Y, vx: 0, vy: 0, dir: 1, plat: this.tower.startPad || null,
        coyote: 0.1, buffer: 0, holding: false, holdT: 0, charge: 0, charged: false,
        dashT: 0, dashOk: true, dashMemo: 0, dashCool: 0,
        bestY: START_Y, tm: 0, elapsed: 0, dead: false, deadT: 0, why: '',
        combo: 0, comboBank: 0, bestCombo: 0, bonus: 0, score: 0,
        lava: START_Y + 760, lavaSpd: 34, shortcutHits: 0, shortcutsFound: 0,
        band: 0, lastBand: -1, medalIdx: -1, dailyDone: false, dailyBonus: 0,
        chargeTick: 0, windSfx: 0, rumbleSfx: 0, lastComboSfx: 0, newBest: false,
        landAngle: 0, lean: 0, sq: 0, trailT: 0, warpTo: null,
        hp: 2, maxHp: 2, hurtT: 0, invuln: 0, deaths: 0, checkpointUses: 0,
        room: 0, checkpointRoom: 0, power: '', powerT: 0, powerTick: 0,
        magnetT: 0, surgeT: 0, guardT: 0, complete: false
      };
      if (resume) {
        var cp = profile.checkpoint;
        this.run.x = clamp(cp.x, WALL + HW, VW - WALL - HW);
        this.run.y = cp.y;
        this.run.bestY = yOfHeight(cp.height);
        this.run.room = cp.room;
        this.run.checkpointRoom = cp.room;
        this.run.lava = this.run.y + 760;
        this.tower.genY = this.run.y + ROW;
        var cpPad = this.tower.takePlat();
        if (cpPad) {
          cpPad.x = clamp(this.run.x - 66, WALL + 4, VW - WALL - 136);
          cpPad.y = this.run.y; cpPad.w = 136; cpPad.band = bandIndexAt(cp.height);
        }
        this.run.plat = cpPad || null;
        this.tower.ensure(this.run.y - 900);
        profile.checkpoint = null;
      }
      this.camY = START_Y - 300;
      this.doomProx = 0;
      this.flash = 0;
      this.tintPulse = 0;
      this.acc = 0;
      this.lastNow = 0;
      this.musicMode = '';
      this.over.setVisible(false);
      this.againBtn.setVisible(false);
      this.menuBtn.setVisible(false);
      this.overScore.setVisible(false);
      this.clearTransients();

      profile.runs = (profile.runs | 0) + 1;
      persist();

      SA_STATE.phase = 'play';
      SA_STATE.mode = this.mode;
      SA_STATE.seed = seed;
      SA_STATE.dead = false;
      SA_STATE.dailyDone = false;
      SA_STATE.shortcutsThisRun = 0;

      this.applySkin();
      this.setBanner(this.mode === 'daily' ? 'DAILY SEED' : 'ENDLESS CLIMB',
        this.mode === 'daily' ? dailyLabel() + '  ·  ' + DAILY_GOAL + 'm goal' : 'climb past the doom line',
        0xffba60);
      if (resume) this.showToast('CHECKPOINT', 'RESTORED', 0x7ee0ff);
      else if (!profile.seenCoach) this.showCoach('TAP: LEAP  ·  HOLD: CHARGE', 3);
      this.coachStage = profile.seenCoach ? 3 : 1;
      kit.audio.music('climb', 700);
      this.musicMode = 'climb';
      this.layout();
    },

    // Restarting in place.  A scene.restart tears down and rebuilds every
    // pool, nine slice and emitter in the title, which cost a 300 ms hitch at
    // 4x throttle and showed up as the dominant frame spike in the trace.
    // startRun already resets every piece of run state, so the display layer
    // is simply returned to its opening condition instead.
    restartRun: function () {
      kit.audio.sfx('ui');
      this.releaseAll();
      profile.checkpoint = null;
      persist();
      this.tweens.killTweensOf([this.over, this.againBtn, this.menuBtn]);
      this.clearTransients();
      this.resetBands();
      this.lastTapAt = -9;
      this.flash = 0;
      this.doomProx = 0;
      this.startRun();
    },

    // Both parallax stacks back to the opening band, stack A showing.
    resetBands: function () {
      var b = BAND(0);
      var a = this.bgA, bb = this.bgB;
      a.sky.setTexture('sky' + b.tex); a.far.setTexture('far' + b.tex);
      a.near.setTexture('near' + b.tex);
      a.wl.setTexture('wall' + b.tex); a.wr.setTexture('wall' + b.tex);
      a.sky.setAlpha(1); a.far.setAlpha(BG_FAR_A); a.near.setAlpha(BG_NEAR_A);
      a.wl.setAlpha(1); a.wr.setAlpha(1);
      bb.sky.setAlpha(0); bb.far.setAlpha(0); bb.near.setAlpha(0);
      bb.wl.setAlpha(0); bb.wr.setAlpha(0);
      this.bgFade = 1;
    },

    applySkin: function () {
      var sk = SKIN(profile.skin);
      if (bestHeightEver() < sk.need) sk = SKINS[0];
      this.skinKey = sk.key;
      var tr = TRAIL(profile.trail);
      if (bestHeightEver() < tr.need) tr = TRAILS[0];
      this.trailDef = tr;
      this.fxTrail.setConfig({
        frame: tr.frame, lifespan: 420, speed: { min: 4, max: 30 },
        scale: { start: tr.key === 'dust' ? 0.55 : 0.8, end: 0 },
        alpha: { start: 0.7, end: 0 }, emitting: false, tint: tr.tint,
        blendMode: tr.add ? 'ADD' : 'NORMAL'
      });
      SA_STATE.skin = sk.key;
      SA_STATE.trail = tr.key;
      setFrameIfChanged(this.climber, 'climber_' + sk.key + '_run');
    },

    // ------------------------------------------------------------- sim
    doDash: function () {
      var r = this.run;
      r.dashT = DASH_T; r.dashOk = false; r.dashMemo = DASH_MEMO;
      r.vy = -110; r.vx = r.dir * DASH_V * (r.surgeT > 0 ? 1.12 : 1);
      r.holding = false; r.holdT = 0; r.charge = 0;
      this.burst(this.fxSpark, r.x - r.dir * 10, r.y - PHH / 2, fxCount(12), 0x8fe9ff);
      if (motionOn()) kit.juice.shake(3.5, 140);
      if (motionOn()) kit.juice.hitStop(48);
      kit.audio.sfx('dash', { volume: 0.85 });
    },

    saveCheckpoint: function (room, safeY) {
      var r = this.run;
      var def = roomDef(room);
      var y = safeY == null ? r.y : safeY;
      profile.checkpoint = {
        active: true, mode: this.mode, seed: this.seed, dailySeed: dailySeed(),
        room: room, height: Math.max(def.start + 2, heightOf(y)),
        x: clamp(r.x, WALL + HW, VW - WALL - HW), y: y
      };
      r.checkpointRoom = room;
      persist();
    },

    respawnCheckpoint: function () {
      var r = this.run, cp = profile.checkpoint;
      if (!usableCheckpoint(cp, this.mode) || cp.seed !== this.seed) {
        profile.checkpoint = null; r.checkpointRoom = 0;
        this.die('lava');
        return;
      }
      var pad = this.tower.takePlat();
      if (pad) {
        pad.x = clamp(cp.x - 66, WALL + 4, VW - WALL - 136);
        pad.y = cp.y; pad.w = 136; pad.band = bandIndexAt(cp.height);
      }
      r.x = clamp(cp.x, WALL + HW, VW - WALL - HW); r.y = cp.y;
      r.vx = 0; r.vy = 0; r.plat = pad || null; r.coyote = 0.12;
      r.dead = false; r.deadT = 0; r.why = ''; r.hp = r.maxHp;
      r.hurtT = 0; r.invuln = 1.1; r.dashT = 0; r.dashMemo = 0; r.dashOk = true;
      r.holding = false; r.holdT = 0; r.charge = 0; r.combo = 0;
      r.lava = r.y + 760; r.deaths++;
      this.camY = r.y - this.visH * 0.72;
      this.doomProx = 0;
      this.showToast('CHECKPOINT', 'ROOM ' + (cp.room + 1), 0x7ee0ff);
      kit.audio.sfx('start', { volume: 0.8 });
      if (motionOn()) { kit.juice.shake(5, 180); kit.juice.hitStop(58); }
    },

    takeDamage: function (why, lethal) {
      var r = this.run;
      if (r.dead || r.invuln > 0 || r.guardT > 0) return false;
      r.hp = Math.max(0, r.hp - 1);
      r.hurtT = 0.42; r.invuln = 1.05; r.vx = (r.x < VW / 2 ? 1 : -1) * 250; r.vy = -390;
      r.plat = null; r.coyote = 0; r.holding = false; r.charge = 0;
      this.flash = flashOn() ? 0.22 : 0;
      this.burst(this.fxShard, r.x, r.y - PHH / 2, fxCount(12), 0xffa070);
      kit.audio.sfx(why === 'spike' ? 'spike' : 'death', { volume: 0.72 });
      if (motionOn()) { kit.juice.shake(6, 220); kit.juice.hitStop(55); }
      if (lethal || r.hp <= 0) { this.die(why); return true; }
      if (why === 'lava') r.y = r.lava - PHH - 6;
      this.showToast('HIT', r.hp + ' ARMOR', 0xffa070);
      return true;
    },

    die: function (why) {
      var r = this.run;
      if (r.dead) return;
      if (why !== 'summit' && r.checkpointRoom > 0 && r.checkpointUses < 2) {
        r.checkpointUses++;
        this.respawnCheckpoint();
        return;
      }
      r.dead = true; r.deadT = 0; r.why = why;
      this.burst(this.fxShard, r.x, r.y - PHH / 2, fxCount(22), 0xffa070);
      this.burst(this.fxSpark, r.x, r.y - PHH / 2, fxCount(18), 0xff6a3a);
      if (motionOn()) kit.juice.shake(11, 420);
      kit.audio.sfx(why === 'spike' ? 'spike' : 'death');
      this.finishRun();
    },

    completeRun: function () {
      var r = this.run;
      if (r.dead || r.complete) return;
      r.complete = true; r.dead = true; r.deadT = 0; r.why = 'summit';
      this.burst(this.fxGlow, r.x, r.y - 20, fxCount(28), 0x7ee0ff);
      if (motionOn()) { kit.juice.shake(7, 260); kit.juice.hitStop(64); }
      kit.audio.sfx('milestone', { volume: 1 });
      this.finishRun();
    },

    finishRun: function () {
      var r = this.run;
      var h = Math.floor(heightOf(r.bestY));
      var total = Math.floor(r.score + r.dailyBonus);
      r.newBest = false;
      if (this.mode === 'daily') {
        if (profile.bestDailySeed !== this.seed) {
          profile.bestDailySeed = this.seed;
          profile.bestDailyScore = 0;
          profile.bestDailyTime = 0;
        }
        if (total > profile.bestDailyScore) {
          profile.bestDailyScore = total;
          profile.bestDailyTime = r.elapsed;
          r.newBest = true;
        }
      } else if (total > profile.bestEndless) {
        profile.bestEndless = total;
        r.newBest = true;
      }
      if (h > profile.bestHeight) profile.bestHeight = h;
      profile.checkpoint = null;
      persist();
      SA_STATE.dead = true;
      SA_STATE.bestHeight = profile.bestHeight;
      markDebugCollections();
      if (r.newBest) kit.audio.sfx('best');
      this.clearTransients();
      this.showOver();
      kit.audio.music('climb', 900);
      this.musicMode = 'climb';
    },

    land: function (p) {
      var r = this.run;
      r.y = p.y; r.vy = 0; r.plat = p; r.dashT = 0; r.dashOk = true;
      r.dashMemo = 0; r.holdT = 0; r.charge = 0; r.charged = false; r.sq = 1;

      if (p.spike) {
        var sx = p.spike < 0 ? p.x : p.x + p.w - p.spw;
        if (r.x + HW * 0.5 > sx && r.x - HW * 0.5 < sx + p.spw) {
          this.takeDamage('spike', false); return;
        }
      }

      if (p.shortcut && !p.landed) {
        p.landed = true;
        r.shortcutHits++;
        if (r.shortcutHits === 3) {
          r.shortcutsFound++;
          r.shortcutHits = 0;
          var b = BAND(r.band);
          profile.shortcuts[b.shortcut] = true;
          persist();
          markDebugCollections();
          r.bonus += 260;
          SA_STATE.shortcutsThisRun = r.shortcutsFound;
          this.showToast('SHORTCUT', '+260', b.accent);
          kit.audio.sfx('unlock');
          this.burst(this.fxGlow, r.x, r.y - 14, fxCount(14), b.accent);
        }
      }

      if (p.kind === 'spring') {
        r.vy = -SPRING; r.plat = null; r.coyote = 0; r.dashOk = true; r.sq = 0;
        this.addCombo(p);
        this.burst(this.fxGlow, r.x, p.y, fxCount(14), 0x6dffc0);
        this.burst(this.fxDust, r.x, p.y, fxCount(8), 0xbfffe0);
        if (motionOn()) kit.juice.shake(4, 150);
        kit.audio.sfx('spring');
        return;
      }

      if (p.kind === 'crumble') {
        if (p.tmr <= 0 && !p.dead) {
          p.tmr = CRUMBLE_TELL;
          p.cracked = true;
          kit.audio.sfx('crack', { volume: 0.7 });
        }
        this.breakCombo();
        this.burst(this.fxDust, r.x, p.y, fxCount(7), 0xe8a35c);
        kit.audio.sfx('land', { volume: 0.6, rate: 0.86 });
        return;
      }

      this.addCombo(p);
      this.burst(this.fxDust, r.x, p.y, fxCount(6), 0xffe3bb);
      kit.audio.sfx('land', { volume: 0.75 });
    },

    addCombo: function (p) {
      var r = this.run;
      r.combo++;
      if (r.combo > r.bestCombo) r.bestCombo = r.combo;
      r.bonus += r.combo * 1.6;
      var step = Math.min(4, Math.floor((r.combo - 1) / 3));
      if (r.combo > 1 && r.tm - r.lastComboSfx > 0.05) {
        r.lastComboSfx = r.tm;
        kit.audio.sfx('combo' + step, { volume: 0.55 });
      }
      if (r.combo > 0 && r.combo % 5 === 0) {
        this.flash = flashOn() ? 0.22 : 0;
        if (motionOn()) kit.juice.shake(3, 130);
        this.burst(this.fxSpark, r.x, r.y - 12, fxCount(10), 0xffd84d);
      }
    },

    breakCombo: function () {
      var r = this.run;
      if (r.combo > 0) r.comboBank = Math.max(r.comboBank, r.combo);
      r.combo = 0;
    },

    grabEmber: function (e) {
      var r = this.run;
      e.taken = true;
      e.active = false;
      var restored = r.comboBank;
      r.bonus += e.big ? 120 : 45;
      if (restored > r.combo) {
        r.combo = restored;
        if (r.combo > r.bestCombo) r.bestCombo = r.combo;
        this.showToast('COMBO RESTORED', 'x' + r.combo, 0xffba60);
      } else {
        r.combo++;
        if (r.combo > r.bestCombo) r.bestCombo = r.combo;
      }
      r.comboBank = 0;
      this.burst(this.fxGlow, e.x, e.y, fxCount(e.big ? 16 : 9), 0xffc060);
      kit.audio.sfx('ember', { volume: e.big ? 0.9 : 0.65 });
      if (e.big && motionOn()) kit.juice.shake(2.5, 110);
    },

    grabPowerup: function (p) {
      var r = this.run;
      p.active = false;
      r.power = p.kind; r.powerT = 8; r.powerTick = 0;
      if (p.kind === 'guard') r.guardT = 8;
      else if (p.kind === 'surge') r.surgeT = 8;
      else r.magnetT = 8;
      this.showToast(p.kind === 'guard' ? 'WARD' : p.kind === 'surge' ? 'SURGE' : 'MAGNET',
        '8s', p.kind === 'guard' ? 0x9fe8ff : p.kind === 'surge' ? 0xffd070 : 0xffa84a);
      this.burst(this.fxGlow, p.x, p.y, fxCount(16), p.kind === 'guard' ? 0x9fe8ff : p.kind === 'surge' ? 0xffd070 : 0xffa84a);
      kit.audio.sfx('unlock', { volume: 0.72 });
      if (motionOn()) kit.juice.hitStop(42);
    },

    enterRoom: function (room, oldRoom) {
      if (room > oldRoom) {
        this.exitRoom(oldRoom);
        this.saveCheckpoint(room, this.run.plat && !this.run.plat.dead ? this.run.plat.y : this.run.y);
        this.showToast('CHECKPOINT', 'ROOM ' + (room + 1), BAND(this.run.band).accent);
        kit.audio.sfx('milestone', { volume: 0.72 });
        this.flash = flashOn() ? 0.16 : 0;
      }
    },

    exitRoom: function (room) {
      // Room exit is explicit even though the tower has no loading seam. It
      // resets the room-local shortcut chain and makes the transition safe to
      // inspect or extend with another authored manifest later.
      if (room >= 0) this.run.shortcutHits = 0;
    },

    step: function (dt) {
      var r = this.run;
      var i, p;
      r.tm += dt;

      if (r.dead) { r.deadT += dt; return; }

      r.elapsed += dt;
      r.hurtT = Math.max(0, r.hurtT - dt);
      r.invuln = Math.max(0, r.invuln - dt);
      r.powerT = Math.max(0, r.powerT - dt);
      r.guardT = Math.max(0, r.guardT - dt);
      r.surgeT = Math.max(0, r.surgeT - dt);
      r.magnetT = Math.max(0, r.magnetT - dt);
      this.tower.step(dt);
      this.tower.stepEnemies(dt, r.x, r.y - PHH * 0.5);

      // orchestrator warp switch, applied on the sim clock
      if (TEST_HOOKS && SA_STATE.forceBand !== null && SA_STATE.forceBand !== undefined) {
        var fb = SA_STATE.forceBand | 0;
        SA_STATE.forceBand = null;
        var targetH = fb <= 0 ? 4 : (BANDS[Math.max(0, Math.min(3, fb)) - 1] || BANDS[0]).top + 6;
        if (fb >= 4) targetH = CYCLE_FROM + 6;
        r.y = yOfHeight(targetH);
        r.x = VW / 2;
        r.bestY = Math.min(r.bestY, r.y);
        r.vy = 0; r.vx = 0; r.coyote = 0.2;
        r.dashT = 0; r.dashMemo = 0; r.dashOk = true;
        r.holding = false; r.holdT = 0; r.charge = 0;
        r.lava = r.y + 740;
        this.camY = r.y - 300;
        this.tower.reset(this.seed);
        this.tower.genY = r.y + ROW;
        this.tower.lastBand = -1;
        // The warp needs a pad under it, or the probe lands on nothing and
        // the switch reads as an instant death instead of a band change.
        var pad = this.tower.takePlat();
        if (pad) {
          pad.x = VW / 2 - 66; pad.y = r.y; pad.w = 132;
          pad.band = bandIndexAt(targetH);
        }
        r.plat = pad;
        this.tower.ensure(r.y - this.visH * 2);
      }

      // ------------------------------------------------------ horizontal
      r.dashT = Math.max(0, r.dashT - dt);
      r.dashMemo = Math.max(0, r.dashMemo - dt);
      this.tower.fieldAt(r.x, r.y - PHH / 2, this.field);
      var wind = this.field.fx;
      var lift = this.field.fy;

      var targetV = r.dir * RUN + wind;
      if (r.dashT > 0) {
        r.vx *= (1 - 1.2 * dt);
      } else {
        r.vx += (targetV - r.vx) * Math.min(1, dt * 12);
      }
      var vx = r.vx;
      r.x += (vx + (r.dashT > 0 ? wind : 0)) * dt;
      if (r.plat && !r.plat.dead) r.x += r.plat.dx || 0;

      // wall spikes stick 13 units out of the wall
      for (i = 0; i < SPIKE_MAX; i++) {
        var s = this.tower.spikes[i];
        if (!s.active) continue;
        if (r.y < s.y || r.y - PHH > s.y + s.h) continue;
        if (s.side === 0 ? (r.x - HW < WALL + 13) : (r.x + HW > VW - WALL - 13)) {
          this.takeDamage('spike', false); return;
        }
      }

      // Enemy contact and telegraphed bolts use the same damage lane as
      // spikes.  A dash is an intentional counter and clears the attacker.
      for (i = 0; i < ENEMY_MAX; i++) {
        var enemy = this.tower.enemies[i];
        if (!enemy.active || enemy.dead) continue;
        if (Math.abs(r.x - enemy.x) < HW + enemy.w * 0.5 &&
            Math.abs((r.y - PHH * 0.5) - enemy.y) < PHH * 0.5 + enemy.h * 0.5) {
          if (r.dashT > 0) {
            enemy.dead = true; enemy.active = false; r.bonus += 80;
            this.burst(this.fxSpark, enemy.x, enemy.y, fxCount(10), 0xffd84d);
            kit.audio.sfx('combo2', { volume: 0.55 });
            if (motionOn()) kit.juice.hitStop(48);
          } else {
            this.takeDamage('enemy', false); return;
          }
        }
      }
      for (i = 0; i < BOLT_MAX; i++) {
        var bolt = this.tower.bolts[i];
        if (!bolt.active) continue;
        var bdx = bolt.x - r.x, bdy = bolt.y - (r.y - PHH * 0.5);
        if (bdx * bdx + bdy * bdy < 18 * 18) {
          bolt.active = false; this.takeDamage('bolt', false); return;
        }
      }

      // ----------------------------------------------------------- walls
      var hitWall = 0;
      if (r.x - HW < WALL) { r.x = WALL + HW; hitWall = -1; }
      else if (r.x + HW > VW - WALL) { r.x = VW - WALL - HW; hitWall = 1; }
      if (hitWall) {
        if (r.dashT > 0 || r.dashMemo > 0) {
          r.vy = -WKICK; r.dashT = 0; r.dashMemo = 0; r.dashOk = true; r.plat = null;
          r.dir = -hitWall; r.holdT = 0; r.charge = 0; r.holding = false; r.coyote = 0;
          this.burst(this.fxSpark, r.x + hitWall * 8, r.y - PHH / 2, fxCount(14), 0xffe27a);
          if (motionOn()) { kit.juice.shake(5, 180); kit.juice.hitStop(52); }
          this.flash = flashOn() ? 0.18 : 0;
          kit.audio.sfx('wallkick');
          this.addCombo(null);
        } else if (r.dir === hitWall) {
          r.dir = -hitWall;
          if (r.dashT <= 0) r.vx = 0;
          this.burst(this.fxDust, r.x + hitWall * 8, r.y - PHH / 2, fxCount(3), 0xb9a7ff);
        }
      }

      // -------------------------------------------------------- vertical
      var prevY = r.y;
      if (r.plat) {
        if (r.plat.dead || !r.plat.active) { r.plat = null; r.coyote = 0.06; }
        else {
          r.y = r.plat.y;
          if (r.x + HW < r.plat.x + 1 || r.x - HW > r.plat.x + r.plat.w - 1) {
            r.plat = null; r.coyote = 0.09;
          }
        }
      }
      if (!r.plat) {
        var gm = 1;
        if (r.dashT > 0) gm = 0.15;
        else if (r.holding && r.vy < 0 && r.holdT < HOLD_MAX) {
          gm = HOLD_G;
          r.holdT += dt;
          var c0 = r.charge;
          r.charge = clamp(r.holdT / HOLD_MAX, 0, 1);
          // charge readout ticks so the meter is audible as well as visible
          r.chargeTick += dt;
          if (r.charge < 1 && r.chargeTick > 0.09) {
            r.chargeTick = 0;
            kit.audio.sfx('charge', { volume: 0.16 + 0.22 * r.charge, rate: 0.85 + 0.6 * r.charge });
          }
          if (c0 < 1 && r.charge >= 1 && !r.charged) {
            r.charged = true;
            kit.audio.sfx('jumpBig', { volume: 0.65 });
            this.burst(this.fxGlow, r.x, r.y - PHH * 0.5, fxCount(8), 0xffd070);
          }
        }
        r.vy += GRAV * gm * dt + lift * dt;
        if (r.vy > TERM_V) r.vy = TERM_V;
        r.y += r.vy * dt;
        r.coyote = Math.max(0, r.coyote - dt);
      } else {
        r.vy = 0; r.coyote = 0.09; r.charge = 0; r.holdT = 0; r.charged = false;
      }

      // ------------------------------------------------------------ jump
      r.buffer = Math.max(0, r.buffer - dt);
      if (r.buffer > 0 && (r.plat || r.coyote > 0)) {
        r.vy = -JUMP_MIN * (r.surgeT > 0 ? 1.26 : 1); r.plat = null; r.coyote = 0; r.buffer = 0;
        r.holdT = 0; r.charge = 0; r.charged = false; r.sq = -1;
        this.burst(this.fxDust, r.x, r.y, fxCount(6), 0xcfe0ff);
        kit.audio.sfx('jump', { volume: 0.7 });
      }

      // --------------------------------------------------------- landing
      if (!r.plat && r.vy > 0) {
        for (i = 0; i < PLAT_MAX; i++) {
          p = this.tower.plats[i];
          if (!p.active || p.dead) continue;
          if (prevY <= p.y + 1 && r.y >= p.y && r.x + HW > p.x && r.x - HW < p.x + p.w) {
            this.land(p);
            break;
          }
        }
        if (r.dead) return;
      }

      // Edge spikes are solid hazard volumes, not landing-only decoration.
      // Check them after landing and during flight so running across a strip
      // cannot bypass the damage model.
      if (!r.dead) {
        for (i = 0; i < PLAT_MAX; i++) {
          p = this.tower.plats[i];
          if (!p.active || p.dead || !p.spike) continue;
          var edgeX = p.spike < 0 ? p.x : p.x + p.w - p.spw;
          if (r.x + HW * 0.5 > edgeX && r.x - HW * 0.5 < edgeX + p.spw &&
              r.y - PHH < p.y + 18 && r.y > p.y - 18) {
            this.takeDamage('spike', false); return;
          }
        }
      }

      // ---------------------------------------------------------- embers
      for (i = 0; i < EMBER_MAX; i++) {
        var e = this.tower.embers[i];
        if (!e.active || e.taken) continue;
        var dx = e.x - r.x, dy = e.y - (r.y - PHH / 2);
        var rad = e.big ? 26 : (r.magnetT > 0 ? 42 : 20);
        if (dx * dx + dy * dy < rad * rad) this.grabEmber(e);
      }

      // Timed power-ups are intentionally simple and legible: guard absorbs
      // contact damage, surge extends jump and dash power, magnet widens the
      // ember pickup radius.  Every effect has an explicit expiry timer.
      for (i = 0; i < POWERUP_MAX; i++) {
        var power = this.tower.powerups[i];
        if (!power.active) continue;
        var pdx = power.x - r.x, pdy = power.y - (r.y - PHH * 0.5);
        if (pdx * pdx + pdy * pdy < 24 * 24) this.grabPowerup(power);
      }

      // ---------------------------------------------------- height/score
      if (r.y < r.bestY) r.bestY = r.y;
      var h = heightOf(r.bestY);
      r.score = Math.max(r.score, h + r.bonus);

      var band = bandIndexAt(h);
      r.band = band;
      var room = roomAtHeight(h);
      if (room !== r.room) {
        var oldRoom = r.room;
        r.room = room;
        this.enterRoom(room, oldRoom);
      }
      if (band !== r.lastBand) {
        var wasFirst = r.lastBand < 0;
        r.lastBand = band;
        if (!wasFirst) this.onBandChange(band, h);
      }

      var md = medalAt(h);
      var mi = md ? MEDALS.indexOf(md) : -1;
      if (mi > r.medalIdx) {
        r.medalIdx = mi;
        profile.medals[md.key] = true;
        persist();
        SA_STATE.medal = md.key;
        markDebugCollections();
        r.bonus += 150 + mi * 120;
        this.setBanner(md.name + ' MEDAL', Math.floor(md.need) + 'm reached', md.color, md.frame);
        kit.audio.sfx('medal');
        this.burst(this.fxGlow, r.x, r.y - 20, fxCount(20), md.color);
        if (motionOn()) kit.juice.shake(4, 200);
        this.checkUnlocks(h);
      }

      // ---------------------------------------------------- daily finish
      if (this.mode === 'daily' && !r.dailyDone && h >= DAILY_GOAL) {
        r.dailyDone = true;
        SA_STATE.dailyDone = true;
        r.dailyBonus = Math.max(0, Math.round((DAILY_PAR - r.elapsed) * 10));
        kit.audio.sfx('milestone');
        this.flash = flashOn() ? 0.3 : 0;
        this.completeRun();
        return;
      }

      // ------------------------------------------------------------ doom
      var esc = escalation(h);
      var bandDoom = BAND(band).doom;
      // A skilled climb chains full-charge jumps at roughly 250 units per
      // second, so the doom line is tuned to top out just under that: it can
      // punish a stall or a long fall but it can never outrun a clean climb.
      if (this.mode === 'daily') {
        r.lavaSpd = 38 + Math.min(r.elapsed, 190) * 0.40;
      } else {
        r.lavaSpd = (30 + Math.min(r.elapsed, 220) * 0.40) * bandDoom * (1 + esc * 0.30);
      }
      r.lava -= r.lavaSpd * dt;
      if (r.lava > r.bestY + 780) r.lava = r.bestY + 780;
      if (r.y > r.lava) {
        this.takeDamage('lava', r.hp <= 1);
        if (r.dead) return;
        r.y = r.lava - PHH - 6;
      }

      var gap = r.lava - r.y;
      this.doomProx = clamp(1 - gap / 420, 0, 1);
      if (this.doomProx > 0.55) {
        r.rumbleSfx -= dt;
        if (r.rumbleSfx <= 0) {
          r.rumbleSfx = 1.4 - this.doomProx * 0.6;
          kit.audio.sfx('rumble', { volume: 0.25 + this.doomProx * 0.5 });
          if (motionOn()) kit.juice.shake(1.4 + this.doomProx * 3.2, 260);
        }
        if (this.musicMode !== 'peril') { kit.audio.music('peril', 900); this.musicMode = 'peril'; }
      } else if (this.doomProx < 0.32 && this.musicMode !== 'climb') {
        kit.audio.music('climb', 1100); this.musicMode = 'climb';
      }

      // wind cue, throttled so a long zone does not machine gun the bus
      if (this.field.n > 0) {
        r.windSfx -= dt;
        if (r.windSfx <= 0) {
          r.windSfx = 1.5;
          kit.audio.sfx('wind', { volume: 0.32 + Math.min(0.3, Math.abs(wind) / 400) });
        }
        if (flashOn() && r.windSfx < 0.25) {
          this.fxWind.emitParticleAt(r.x, r.y - PHH * 0.5, 1);
        }
      } else {
        r.windSfx = 0;
      }

      // ---------------------------------------------------------- camera
      var target = r.y - this.visH * 0.58;
      if (target < this.camY) this.camY += (target - this.camY) * Math.min(1, dt * 9);
      if (r.y - this.camY > this.visH * 0.86) this.camY = r.y - this.visH * 0.86;
      if (r.lava - this.camY < this.visH * 0.30) this.camY = r.lava - this.visH * 0.30;

      this.tower.ensure(this.camY - this.visH * 1.6);
      this.tower.cull(r.lava + 220);

      if (r.dashT <= 0 && (r.plat || r.coyote > 0)) r.dashOk = true;
      if (r.sq > 0) r.sq = Math.max(0, r.sq - dt * 5);
      else if (r.sq < 0) r.sq = Math.min(0, r.sq + dt * 5);
      r.lean += ((wind / 220) - r.lean) * Math.min(1, dt * 6);

      // trail
      r.trailT -= dt;
      if (r.trailT <= 0 && flashOn()) {
        r.trailT = r.dashT > 0 ? 0.016 : 0.05;
        this.fxTrail.emitParticleAt(r.x, r.y - PHH * 0.5, 1);
      }

      // Tutorial progression stays in one thin top strip and only appears for
      // a first-time player; the results screen carries the durable details.
      if (!profile.seenCoach && this.coachStage === 1 && h > 40) {
        this.coachStage = 2;
        this.showCoach('DOUBLE-TAP: DASH  ·  WALL: KICK', 3);
      } else if (!profile.seenCoach && this.coachStage === 2 && h > 130) {
        this.coachStage = 3;
        this.showCoach('EMBER: RESTORE COMBO', 3);
        profile.seenCoach = true; persist();
      }

      if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 3.2);
    },

    onBandChange: function (band) {
      kit.audio.sfx('milestone', { volume: 0.7 });
      this.flash = flashOn() ? 0.2 : 0;
      this.crossfadeBand(band);
      this.run.shortcutHits = 0;
    },

    checkUnlocks: function (h) {
      var i, gained = null;
      for (i = 0; i < SKINS.length; i++) {
        if (SKINS[i].need > 0 && h >= SKINS[i].need && profile.bestHeight < SKINS[i].need) gained = SKINS[i].name + ' climber';
      }
      for (i = 0; i < TRAILS.length; i++) {
        if (TRAILS[i].need > 0 && h >= TRAILS[i].need && profile.bestHeight < TRAILS[i].need) gained = TRAILS[i].name + ' trail';
      }
      if (gained) {
        this.showToast('UNLOCKED', gained.replace(' climber', '').replace(' trail', ''), 0xffd84d);
        kit.audio.sfx('unlock');
      }
    },

    // ------------------------------------------------------------ juice
    burst: function (emitter, x, y, n, tint) {
      if (!emitter || n <= 0) return;
      if (tint != null) emitter.setParticleTint(tint);
      emitter.emitParticleAt(x, y, n);
    },

    clearTransients: function () {
      this.transientQueue.length = 0;
      this.transientActive = null;
      this.tweens.killTweensOf([this.banner, this.coach, this.toast]);
      this.banner.setAlpha(0);
      this.coach.setAlpha(0);
      this.toast.setAlpha(0);
    },

    queueTransient: function (item) {
      if (!item) return;
      if (this.transientActive) {
        if (this.transientQueue.length < 8) this.transientQueue.push(item);
        return;
      }
      this.presentTransient(item);
    },

    finishTransient: function (item) {
      if (this.transientActive !== item) return;
      this.transientActive = null;
      this.banner.setAlpha(0);
      this.coach.setAlpha(0);
      this.toast.setAlpha(0);
      var next = this.transientQueue.shift();
      if (next) this.presentTransient(next);
    },

    presentTransient: function (item) {
      this.transientActive = item;
      if (item.kind === 'banner') this.presentBanner(item);
      else if (item.kind === 'coach') this.presentCoach(item);
      else this.presentToast(item);
    },

    // Center-stage treatment is intentionally limited to run start and medal
    // ceremony calls. Everything else is routed through the edge chip below.
    setBanner: function (t1, t2, color, iconFrame) {
      this.queueTransient({ kind: 'banner', title: t1, detail: t2 || '',
        color: color || 0xffffff, iconFrame: iconFrame || null });
    },

    showToast: function (title, detail, color) {
      this.queueTransient({ kind: 'toast', title: title, detail: detail || '',
        color: color || 0xffffff });
    },

    showCoach: function (msg, secs) {
      this.queueTransient({ kind: 'coach', title: msg, hold: Math.min(3, secs || 3) });
    },

    presentBanner: function (item) {
      var self = this, W = this.scale.width;
      var plateW = Math.min(Math.round(W * 0.60), W - 32);
      this.bannerPlate.setDisplaySize(plateW, 76);
      this.bannerPlate.setTint(item.color || 0xffffff).setAlpha(0.9);
      setTextIfChanged(this.bannerT1, item.title);
      setTextIfChanged(this.bannerT2, item.detail || '');
      this.bannerT1.setWordWrapWidth(plateW - 20);
      this.bannerT2.setWordWrapWidth(plateW - 20);
      if (item.iconFrame) {
        setFrameIfChanged(this.bannerIcon, item.iconFrame);
        this.bannerIcon.setVisible(true).setPosition(-plateW / 2 + 30, 0).setScale(0.7);
        this.bannerT1.setX(16); this.bannerT2.setX(16);
      } else {
        this.bannerIcon.setVisible(false);
        this.bannerT1.setX(0); this.bannerT2.setX(0);
      }
      this.tweens.killTweensOf(this.banner);
      this.banner.setAlpha(0);
      var y = this.hudTop + 154;
      this.banner.setPosition(W / 2, y - 14);
      if (flashOn()) {
        this.banner.setScale(0.9);
        this.tweens.add({
          targets: this.banner, alpha: 1, scale: 1, y: y,
          duration: 260, ease: 'Back.easeOut'
        });
      } else {
        this.banner.setScale(1).setY(y);
        this.tweens.add({ targets: this.banner, alpha: 1, duration: 0 });
      }
      this.tweens.add({
        targets: this.banner, alpha: 0, delay: 1250, duration: flashOn() ? 300 : 0,
        ease: 'Cubic.easeIn', onComplete: function () { self.finishTransient(item); }
      });
    },

    presentToast: function (item) {
      var self = this, W = this.scale.width;
      var msg = item.title + (item.detail ? '  ·  ' + item.detail : '');
      setTextIfChanged(this.toastText, msg);
      var pw = Math.min(W - 24, Math.max(112, this.toastText.width + 24));
      this.toastPlate.setDisplaySize(pw, 28).setTint(item.color || 0xffffff);
      this.toast.setAlpha(0);
      this.toast.setScale(flashOn() ? 0.98 : 1);
      this.tweens.killTweensOf(this.toast);
      this.tweens.add({
        targets: this.toast, alpha: 1, scale: 1, duration: flashOn() ? 100 : 0
      });
      this.tweens.add({
        targets: this.toast, alpha: 0, delay: 760, duration: flashOn() ? 140 : 0,
        ease: 'Cubic.easeIn', onComplete: function () { self.finishTransient(item); }
      });
    },

    presentCoach: function (item) {
      var self = this, W = this.scale.width;
      setTextIfChanged(this.coachText, item.title);
      this.coachPlate.setDisplaySize(W - 24, 26);
      this.tweens.killTweensOf(this.coach);
      this.coach.setAlpha(0);
      this.tweens.add({ targets: this.coach, alpha: 1, duration: flashOn() ? 120 : 0 });
      this.tweens.add({
        targets: this.coach, alpha: 0.08, delay: Math.max(0, item.hold * 1000 - 400),
        duration: flashOn() ? 400 : 0, ease: 'Cubic.easeIn',
        onComplete: function () { self.finishTransient(item); }
      });
    },

    crossfadeBand: function (band) {
      var b = BAND(band);
      var toB = this.bgFade > 0.5;
      var dst = toB ? this.bgB : this.bgA;
      var src = toB ? this.bgA : this.bgB;
      dst.sky.setTexture('sky' + b.tex);
      dst.far.setTexture('far' + b.tex);
      dst.near.setTexture('near' + b.tex);
      dst.wl.setTexture('wall' + b.tex);
      dst.wr.setTexture('wall' + b.tex);
      var self = this;
      var o = { t: 0 };
      this.tweens.killTweensOf(o);
      this.tweens.add({
        targets: o, t: 1, duration: 900, ease: 'Sine.easeInOut',
        onUpdate: function () {
          var f = o.t;
          dst.sky.setAlpha(f); src.sky.setAlpha(1 - f);
          dst.far.setAlpha(BG_FAR_A * f); src.far.setAlpha(BG_FAR_A * (1 - f));
          dst.near.setAlpha(BG_NEAR_A * f); src.near.setAlpha(BG_NEAR_A * (1 - f));
          dst.wl.setAlpha(f); dst.wr.setAlpha(f);
          src.wl.setAlpha(1 - f); src.wr.setAlpha(1 - f);
        },
        onComplete: function () { self.bgFade = toB ? 0 : 1; }
      });
    },

    // ------------------------------------------------------------- view
    // Display objects are bound to sim records here, per frame, by index.
    // Nothing is written back onto a record, so no render state can ride on
    // an entity and a pool can never be aliased into the debug view.
    paint: function () {
      var r = this.run, i, j;
      var camY = this.camY;
      var visH = this.visH;
      var top = camY, bot = camY + visH;

      // parallax
      // A stack that has faded out is hidden outright.  Six full-screen tile
      // sprites is three too many: the idle stack contributes nothing but
      // fill cost, which dominates on a software rasteriser.
      var sets = [this.bgA, this.bgB];
      for (i = 0; i < 2; i++) {
        var st = sets[i];
        var shown = st.sky.alpha > 0.01;
        setVisibleIfChanged(st.sky, shown);
        setVisibleIfChanged(st.far, st.far.alpha > 0.01);
        setVisibleIfChanged(st.near, st.near.alpha > 0.01);
        setVisibleIfChanged(st.wl, st.wl.alpha > 0.01);
        setVisibleIfChanged(st.wr, st.wr.alpha > 0.01);
        if (!shown && st.far.alpha <= 0.01 && st.near.alpha <= 0.01) continue;
        setSizeIfChanged(st.sky, VW, visH);
        st.sky.tilePositionY = camY * 0.10;
        setSizeIfChanged(st.far, VW, visH);
        st.far.tilePositionY = camY * 0.30;
        setSizeIfChanged(st.near, VW, visH);
        st.near.tilePositionY = camY * 0.58;
        setSizeIfChanged(st.wl, WALL, visH); st.wl.setPosition(0, 0);
        st.wl.tilePositionY = camY;
        setSizeIfChanged(st.wr, WALL, visH); st.wr.setPosition(VW - WALL, 0);
        st.wr.tilePositionY = camY;
      }

      // wind zones
      var wi = 0, ci = 0;
      for (i = 0; i < WIND_MAX; i++) {
        var w = this.tower.winds[i];
        if (!w.active || w.y > bot || w.y + w.h < top) continue;
        if (wi < this.windPool.length) {
          var wt = this.windPool[wi++];
          wt.setVisible(true);
          wt.setPosition(WALL, w.y);
          setSizeIfChanged(wt, VW - WALL * 2, w.h);
          wt.tilePositionX = -w.t * (w.fx * 0.8);
          wt.tilePositionY = -w.t * (w.fy * 0.6);
          wt.setTint(w.fy < 0 ? 0x9fffd8 : 0xbfe9ff);
          wt.setAlpha(0.34);
        }
        var chevN = 4;
        for (j = 0; j < chevN && ci < this.chevPool.length; j++) {
          var cv = this.chevPool[ci++];
          var span = w.fy < 0 ? w.h : (VW - WALL * 2);
          var t = ((w.t * (w.fy < 0 ? 150 : Math.abs(w.fx)) * 1.1) / span + j / chevN) % 1;
          cv.setVisible(true);
          cv.setTint(w.fy < 0 ? 0x9fffd8 : 0xbfe9ff);
          if (w.fy < 0) {
            cv.setPosition(WALL + 24 + ((j * 71) % (VW - WALL * 2 - 48)), w.y + w.h - t * w.h);
            cv.setAngle(-90);
          } else {
            var dirx = w.fx > 0 ? 1 : -1;
            cv.setPosition(WALL + (dirx > 0 ? t * span : span - t * span),
              w.y + 26 + ((j * 53) % Math.max(20, w.h - 44)));
            cv.setAngle(dirx > 0 ? 0 : 180);
          }
          cv.setAlpha(0.35 + 0.3 * Math.sin(t * Math.PI));
        }
      }
      for (; wi < this.windPool.length; wi++) setVisibleIfChanged(this.windPool[wi], false);
      for (; ci < this.chevPool.length; ci++) setVisibleIfChanged(this.chevPool[ci], false);

      // wall spikes
      var si = 0;
      for (i = 0; i < SPIKE_MAX; i++) {
        var s = this.tower.spikes[i];
        if (!s.active || s.y > bot || s.y + s.h < top) continue;
        if (si >= this.spikePool.length) break;
        var sp = this.spikePool[si++];
        sp.setVisible(true);
        setSizeIfChanged(sp, 20, s.h);
        sp.setPosition(s.side === 0 ? WALL : VW - WALL - 20, s.y);
        sp.setFlipX(s.side !== 0);
        sp.setTint(BAND(s.band).hazardTint);
      }
      for (; si < this.spikePool.length; si++) setVisibleIfChanged(this.spikePool[si], false);

      // Enemies, telegraph glints and projectiles
      var eni = 0, boi = 0;
      for (i = 0; i < ENEMY_MAX; i++) {
        var en = this.tower.enemies[i];
        if (!en.active || en.dead || en.y > bot + 40 || en.y < top - 40) continue;
        if (eni >= this.enemyPool.length) break;
        var esprite = this.enemyPool[eni++];
        esprite.setVisible(true).setPosition(en.x, en.y);
        esprite.setScale(en.telegraph > 0 ? 1.05 + 0.08 * Math.sin(r.tm * 28) : 0.9);
        esprite.setTint(en.telegraph > 0 ? 0xff6a60 : BAND(en.band).hazardTint);
        esprite.setAlpha(en.telegraph > 0 ? 0.55 + 0.45 * Math.abs(Math.sin(r.tm * 18)) : 0.9);
        esprite.setAngle(r.tm * 55 * en.dir);
      }
      for (; eni < this.enemyPool.length; eni++) setVisibleIfChanged(this.enemyPool[eni], false);
      for (i = 0; i < BOLT_MAX; i++) {
        var shot = this.tower.bolts[i];
        if (!shot.active || shot.y > bot + 30 || shot.y < top - 30) continue;
        if (boi >= this.boltPool.length) break;
        var bsprite = this.boltPool[boi++];
        bsprite.setVisible(true).setPosition(shot.x, shot.y).setAngle(Math.atan2(shot.vy, shot.vx) * 180 / Math.PI);
        bsprite.setTint(BAND(shot.band).hazardTint).setScale(0.75);
      }
      for (; boi < this.boltPool.length; boi++) setVisibleIfChanged(this.boltPool[boi], false);

      // platforms
      var pi = 0, ei = 0, spi = 0, mi = 0;
      for (i = 0; i < PLAT_MAX; i++) {
        var p = this.tower.plats[i];
        if (!p.active || p.dead) continue;
        if (p.y > bot + 30 || p.y < top - 40) continue;
        if (pi >= this.platPool.length) break;
        var ns = this.platPool[pi++];
        var frame = PLAT_FRAME[p.kind + '_' + (BAND(p.band).tex | 0)] || 'plat_ledge_0';  // guarded
        setFrameIfChanged(ns, frame);
        var jitter = 0;
        if (p.kind === 'crumble' && p.tmr > 0) {
          var f = 1 - p.tmr / CRUMBLE_TELL;
          jitter = flashOn() ? Math.sin(r.tm * 31 + p.y * 0.17 + p.x * 0.11) * (1.5 + 5 * f) : 0;
          ns.setTint(Phaser.Display.Color.GetColor(255, Math.round(210 - 130 * f), Math.round(160 - 130 * f)));
          ns.setAlpha(0.72 + 0.28 * Math.abs(Math.sin(p.tmr * 26)));
        } else {
          ns.setTint(p.shortcut ? 0xffe6b0 : 0xffffff);
          ns.setAlpha(1);
        }
        ns.setVisible(true);
        setDisplayIfChanged(ns, Math.max(30, p.w), PT);
        ns.setPosition(p.x + jitter, p.y);

        if (p.kind === 'spring' && spi < this.springPool.length) {
          var scp = this.springPool[spi++];
          scp.setVisible(true);
          scp.setPosition(p.x + p.w / 2, p.y + 1);
          scp.setScale(clamp(p.w / 90, 0.6, 1.2));
        }
        if (p.spike && ei < this.edgeSpikePool.length) {
          var es = this.edgeSpikePool[ei++];
          es.setVisible(true);
          setSizeIfChanged(es, Math.max(10, p.spw), 16);
          es.setPosition((p.spike < 0 ? p.x : p.x + p.w - p.spw) + jitter, p.y + 1);
          es.setTint(BAND(p.band).hazardTint);
        }
        if (p.shortcut && mi < this.markPool.length) {
          var mk = this.markPool[mi++];
          mk.setVisible(true);
          mk.setPosition(p.x + p.w / 2, p.y - 16 + Math.sin(r.tm * 3 + p.y * 0.03) * 3);
          mk.setTint(BAND(p.band).accent);
        }
      }
      for (; pi < this.platPool.length; pi++) setVisibleIfChanged(this.platPool[pi], false);
      for (; spi < this.springPool.length; spi++) setVisibleIfChanged(this.springPool[spi], false);
      for (; ei < this.edgeSpikePool.length; ei++) setVisibleIfChanged(this.edgeSpikePool[ei], false);
      for (; mi < this.markPool.length; mi++) setVisibleIfChanged(this.markPool[mi], false);

      // embers
      var bi = 0;
      for (i = 0; i < EMBER_MAX; i++) {
        var em = this.tower.embers[i];
        if (!em.active || em.taken || em.y > bot || em.y < top - 20) continue;
        if (bi >= this.emberPool.length) break;
        var ep = this.emberPool[bi++];
        ep.setVisible(true);
        ep.setPosition(em.x, em.y + Math.sin(em.t * 3 + em.x * 0.05) * 4);
        ep.setScale((em.big ? 1.25 : 0.9) * (1 + 0.08 * Math.sin(em.t * 6)));
        ep.setAngle(em.t * 60);
        ep.setTint(em.big ? 0xffe8a0 : 0xffc060);
      }
      for (; bi < this.emberPool.length; bi++) setVisibleIfChanged(this.emberPool[bi], false);

      // power-ups share the atlas glints but carry a distinct tint and a
      // stable vertical bob, so their timed effect reads before pickup.
      var pui = 0;
      for (i = 0; i < POWERUP_MAX; i++) {
        var pwr = this.tower.powerups[i];
        if (!pwr.active || pwr.y > bot || pwr.y < top - 24) continue;
        if (pui >= this.powerupPool.length) break;
        var pws = this.powerupPool[pui++];
        var pcol = pwr.kind === 'guard' ? 0x9fe8ff : pwr.kind === 'surge' ? 0xffd070 : 0xffa84a;
        pws.setVisible(true).setPosition(pwr.x, pwr.y + Math.sin(pwr.t * 4) * 5);
        pws.setTint(pcol).setScale(1.05 + 0.12 * Math.sin(pwr.t * 7));
      }
      for (; pui < this.powerupPool.length; pui++) setVisibleIfChanged(this.powerupPool[pui], false);

      // lava: only drawn when the pool is anywhere near the view
      var lavaTop = r.lava;
      var lavaVisible = lavaTop < bot + 120;
      setVisibleIfChanged(this.lava, lavaVisible);
      setVisibleIfChanged(this.lavaGlow, lavaVisible);
      if (!lavaVisible) { this.paintClimber(r); return; }
      this.lava.setPosition(0, lavaTop);
      // Quantised so a scrolling camera does not rebuild the strip every frame.
      setSizeIfChanged(this.lava, VW, Math.ceil(Math.max(60, bot - lavaTop + 80) / 48) * 48);
      this.lava.tilePositionX = r.tm * 22;
      this.lava.tilePositionY = r.tm * 6;
      this.lavaGlow.setPosition(VW / 2, lavaTop);
      this.lavaGlow.setDisplaySize(VW * 2.1, 300);
      this.lavaGlow.setAlpha(0.28 + 0.34 * this.doomProx);

      this.paintClimber(r);
    },

    paintClimber: function (r) {
      var i;
      var sk = 'climber_' + (this.skinKey || 'emberling') + '_';
      var pose = Math.abs(r.vx) < 24 ? 'idle' : 'walk';
      if (r.hurtT > 0) pose = 'hurt';
      else if (r.dashT > 0) pose = 'dash';
      else if (r.sq > 0.25) pose = 'land';
      else if (!r.plat && r.vy < -30) pose = 'rise';
      else if (!r.plat && r.vy > 60) pose = 'fall';
      var displayPose = pose;
      if (pose === 'idle') displayPose = Math.floor(r.tm * 2) % 2 ? 'idle' : 'run';
      else if (pose === 'walk') displayPose = Math.floor(r.tm * 8) % 2 ? 'walk' : 'land';
      else if (pose === 'hurt') displayPose = Math.floor(r.tm * 12) % 2 ? 'hurt' : 'fall';
      var frameName = CLIMBER_FRAME[(this.skinKey || 'emberling') + '_' + displayPose] ||
        'climber_emberling_run';   // guarded
      setFrameIfChanged(this.climber, frameName);
      setTintIfChanged(this.climber, r.hurtT > 0 ? 0xff8a70 : 0xffffff);
      this.climber.setVisible(!r.dead || r.deadT < 0.12);
      this.climber.setPosition(r.x + (r.hurtT > 0 ? Math.sin(r.tm * 42) * 2 : 0), r.y + 1);
      this.climber.setFlipX(r.dir < 0);
      var sq = r.sq > 0 ? r.sq : 0, st = r.sq < 0 ? -r.sq : 0;
      this.climber.setScale(1 + sq * 0.26 - st * 0.14, 1 - sq * 0.22 + st * 0.18);
      this.climber.setAngle(clamp(r.lean * 16, -22, 22) + (r.dashT > 0 ? r.dir * 8 : 0));

      // charge ring pips around the climber
      var lit = Math.round(r.charge * 12);
      for (i = 0; i < 12; i++) {
        var pip = this.pips[i];
        var on = i < lit && !r.dead;
        if (pip.__on !== on) { pip.__on = on; pip.setVisible(on); }
        if (!on) continue;
        var ang = -Math.PI / 2 + (i / 12) * Math.PI * 2;
        var rad = 24;
        pip.setPosition(r.x + Math.cos(ang) * rad, r.y - PHH * 0.55 + Math.sin(ang) * rad);
        pip.setScale(r.charge >= 1 ? 1.5 : 1.05);
        pip.setTint(r.charge >= 1 ? 0xfff0b0 : 0xffc060);
      }

      // dash-ready chevrons
      var dashShow = r.dashOk && !r.plat && r.dashT <= 0 && !r.dead;
      for (i = 0; i < 2; i++) {
        var dm = this.dashMark[i];
        setVisibleIfChanged(dm, dashShow);
        if (!dashShow) continue;
        var side = i === 0 ? -1 : 1;
        dm.setPosition(r.x + side * (20 + 2 * Math.sin(r.tm * 8)), r.y - PHH * 0.55);
        dm.setAngle(side > 0 ? 0 : 180);
        dm.setTint(0x8fe9ff);
      }
    },

    clockStr: function (t) {
      var m = Math.floor(t / 60), s = Math.floor(t % 60);
      return m + ':' + (s < 10 ? '0' : '') + s;
    },

    paintHud: function () {
      var r = this.run;
      var W = this.scale.width, H = this.scale.height;

      this.scoreNum.setText(String(Math.floor(r.score + r.dailyBonus)));
      this.heightNum.setText(Math.floor(heightOf(r.bestY)) + 'm');

      // combo chip
      var showCombo = r.combo > 1 && !r.dead;
      var ca = showCombo ? 1 : 0;
      var pulse = showCombo ? 1 + 0.08 * Math.sin(r.tm * 11) : 1;
      this.comboChip.setAlpha(showCombo ? 0.85 : 0);
      this.comboChip.setScale(pulse, 1);
      this.comboNum.setText('x' + r.combo);
      this.comboNum.setAlpha(ca);
      this.comboNum.setTint(r.combo >= 10 ? 0xffd84d : r.combo >= 5 ? 0xffe6a0 : 0x9fe8ff);

      // charge bar
      var cw = 104 - 8;
      this.chargeFill.setDisplaySize(Math.max(1, cw * r.charge), 8);
      this.chargeFill.setTint(r.charge >= 1 ? 0xfff0b0 : 0xffc060);
      this.chargeFrame.setAlpha(r.dead ? 0.25 : 0.95);

      // dash bar: full when ready, refilling while on cooldown
      var dashF = r.dashOk ? 1 : (r.dashT > 0 ? 0 : 0.35);
      this.dashFill.setDisplaySize(Math.max(1, (72 - 8) * dashF), 8);
      this.dashFill.setTint(r.dashOk ? 0x8fe9ff : 0x4a6a80);

      // wind chip
      var windOn = this.field.n > 0 && !r.dead;
      this.windChip.setAlpha(windOn ? 0.86 : 0);
      var upd = this.field.fy < -20;
      var strength = clamp((Math.abs(this.field.fx) + Math.abs(this.field.fy) * 0.6) / 130, 0, 3);
      for (var i = 0; i < 3; i++) {
        var ar = this.windArrows[i];
        var on = windOn && i < Math.max(1, Math.ceil(strength));
        ar.setAlpha(on ? 0.55 + 0.45 * Math.abs(Math.sin(r.tm * 6 - i * 0.6)) : 0);
        ar.setAngle(upd ? -90 : (this.field.fx >= 0 ? 0 : 180));
        ar.setTint(upd ? 0x9fffd8 : 0xbfe9ff);
      }

      var hasPower = r.powerT > 0 && !r.dead;
      this.powerChip.setAlpha(hasPower ? 0.86 : 0);
      this.powerText.setAlpha(hasPower ? 1 : 0);
      setTextIfChanged(this.powerText, (r.power === 'guard' ? 'WARD ' : r.power === 'surge' ? 'SURGE ' : 'MAGNET ') +
        Math.ceil(r.powerT) + 's');
      setColorIfChanged(this.powerText, r.power === 'guard' ? '#9fe8ff' : r.power === 'surge' ? '#ffe0a0' : '#ffbd70');
      setTextIfChanged(this.hpText, r.hp > 1 ? '♥♥' : r.hp > 0 ? '♥·' : '··');
      setColorIfChanged(this.hpText, r.hurtT > 0 ? '#fff0a0' : '#ffb0a0');

      // doom readout
      var dp = this.doomProx;
      this.doomFill.setDisplaySize(Math.max(1, (180 - 10) * dp), 7);
      this.doomFill.setTint(dp > 0.75 ? 0xff3a1a : dp > 0.45 ? 0xff7a30 : 0xffb060);
      this.doomFrame.setAlpha(0.5 + 0.5 * dp);

      // vignette + flash plate
      var vAlpha = dp * dp * 0.7;
      if (flashOn() && dp > 0.6) vAlpha *= 0.9 + 0.16 * Math.sin(r.tm * 9);
      this.vignette.setAlpha(vAlpha);
      setVisibleIfChanged(this.vignette, vAlpha > 0.012);
      var fa = flashOn() ? Math.min(0.55, this.flash) : 0;
      this.flashPlate.setAlpha(fa);
      setVisibleIfChanged(this.flashPlate, fa > 0.012);

      // daily clock
      if (this.mode === 'daily') {
        this.clockNum.setVisible(true);
        this.clockNum.setText(this.clockStr(r.elapsed));
        this.clockNum.setTint(r.elapsed > DAILY_PAR ? 0xff8a70 : 0x7ee0ff);
      } else {
        this.clockNum.setVisible(false);
      }
    },

    showOver: function () {
      var r = this.run;
      var h = Math.floor(heightOf(r.bestY));
      var total = Math.floor(r.score + r.dailyBonus);
      var md = medalAt(h);
      var why = r.why === 'spike' ? 'Impaled on the spire'
        : r.why === 'summit' ? 'Summit reached'
          : 'The lava caught you';
      setTextIfChanged(this.overTitle, r.why === 'summit' ? 'SUMMIT REACHED' : 'THE SPIRE WINS');
      setColorIfChanged(this.overTitle, r.why === 'summit' ? '#7ee0ff' : '#ff7a52');
      setTextIfChanged(this.overWhy, why);
      this.overScore.setText(String(total));
      this.overScore.setVisible(true);
      var stats = h + 'm climbed   ·   best combo x' + r.bestCombo +
        '\n' + BAND(r.band).name.toLowerCase() +
        (r.shortcutsFound ? '\n' + r.shortcutsFound + ' shortcut' + (r.shortcutsFound > 1 ? 's' : '') + ' found' : '') +
        (this.mode === 'daily' ? '\ntime ' + this.clockStr(r.elapsed) +
          (r.dailyBonus ? '   time bonus +' + r.dailyBonus : '') : '');
      setTextIfChanged(this.overStats, stats);
      if (md) {
        this.overMedal.setVisible(true);
        setFrameIfChanged(this.overMedal, md.frame);
      } else {
        this.overMedal.setVisible(false);
      }
      setTextIfChanged(this.overBest, r.newBest ? 'NEW BEST' : 'BEST ' + Math.floor(
        this.mode === 'daily' ? profile.bestDailyScore : profile.bestEndless));
      setColorIfChanged(this.overBest, r.newBest ? '#ffd84d' : '#b6a6d8');
      this.over.setVisible(true);
      this.againBtn.setVisible(true);
      this.menuBtn.setVisible(true);
      this.over.setAlpha(0);
      this.againBtn.setAlpha(0);
      this.menuBtn.setAlpha(0);
      this.tweens.add({ targets: [this.over, this.againBtn, this.menuBtn], alpha: 1, duration: 320, delay: 260 });
      this.layout();
    },

    // ----------------------------------------------------------- layout
    layout: function () {
      var W = this.scale.width, H = this.scale.height;
      var colW = Math.min(W, H * 0.62);
      var zoom = colW / VW;
      var cam = this.cameras.main;
      cam.setViewport(Math.round((W - colW) / 2), 0, Math.round(colW), H);
      cam.setZoom(zoom);
      this.visH = H / zoom;
      if (this.uiCam) this.uiCam.setViewport(0, 0, W, H);

      var inset = this.readInsets();
      var top = inset.top + 10;
      this.hudTop = top;
      var left = inset.left + 10;
      var right = W - inset.right - 10;
      var bottom = H - inset.bottom - 10;

      this.scorePanel.setPosition(left, top);
      this.scoreLabel.setPosition(left + 10, top + 6);
      this.scoreNum.setPosition(left + 10, top + 22);
      this.heightNum.setPosition(left + 92, top + 24);

      this.rightPanel.setPosition(right, top);
      this.modeText.setPosition(right - 10, top + 6);
      this.bestLabel.setPosition(right - 10, top + 22);
      this.bestNum.setPosition(right - 10, top + 38);

      // Essential meters stay in the safe top cluster; the bottom corners are
      // deliberately empty for thumbs and the tap-anywhere control.
      this.comboChip.setPosition(W / 2, top + 48);
      this.comboNum.setPosition(W / 2, top + 48);

      this.chargeIcon.setPosition(left + 6, top + 58);
      this.chargeFrame.setPosition(left + 16, top + 58);
      this.chargeFill.setPosition(left + 20, top + 58);
      this.chargeLabel.setPosition(left + 18, top + 58);

      this.dashIcon.setPosition(left + 6, top + 76);
      this.dashFrame.setPosition(left + 16, top + 76);
      this.dashFill.setPosition(left + 20, top + 76);
      this.dashLabel.setPosition(left + 18, top + 76);

      this.windChip.setPosition(right, top + 58);
      this.windText.setPosition(right - 10, top + 58);
      for (var i = 0; i < 3; i++) this.windArrows[i].setPosition(right - 60 + i * 18, top + 58);
      this.powerChip.setPosition(right, top + 86);
      this.powerText.setPosition(right - 10, top + 86);
      this.hpText.setPosition(right - 10, top + 114);

      this.doomFrame.setPosition(W / 2, top + 128);
      this.doomFill.setPosition(W / 2 - 85, top + 128);
      this.doomText.setPosition(W / 2, top + 128);

      this.clockNum.setPosition(right - 54, top + 24);

      this.pauseBtn.setPosition(right - 22, top + 24);
      this.pauseGlyph.setPosition(right - 22, top + 24);

      this.vignette.setPosition(W / 2, H / 2).setDisplaySize(W * 1.02, H * 1.02);
      this.flashPlate.setPosition(0, 0).setSize(W, H);
      if (this.flashPlate.setDisplaySize) this.flashPlate.setDisplaySize(W, H);

      // game over card
      var cy = H * 0.44;
      this.overDim.setPosition(W / 2, H / 2).setSize(W, H);
      if (this.overDim.setDisplaySize) this.overDim.setDisplaySize(W, H);
      var pw = Math.min(320, W - 32);
      this.overPlate.setPosition(W / 2, cy).setDisplaySize(pw, 250);
      this.overTitle.setPosition(W / 2, cy - 104);
      this.overWhy.setPosition(W / 2, cy - 84);
      this.overScore.setPosition(W / 2, cy - 34);
      this.overMedal.setPosition(W / 2 - pw / 2 + 40, cy - 34).setScale(0.72);
      this.overStats.setPosition(W / 2, cy + 34);
      this.overBest.setPosition(W / 2, cy + 96);
      this.againBtn.setPosition(W / 2, Math.min(cy + 168, bottom - 62));
      this.menuBtn.setPosition(W / 2, Math.min(cy + 218, bottom - 16));

      this.banner.setPosition(W / 2, top + 154);
      this.coach.setPosition(W / 2, top + 154);
      this.toast.setPosition(right, top + 154);
    },

    readInsets: function () {
      if (this._insets) return this._insets;
      var probe = document.createElement('div');
      probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;' +
        'padding-top:env(safe-area-inset-top);padding-right:env(safe-area-inset-right);' +
        'padding-bottom:env(safe-area-inset-bottom);padding-left:env(safe-area-inset-left);';
      document.body.appendChild(probe);
      var cs = getComputedStyle(probe);
      this._insets = {
        top: parseFloat(cs.paddingTop) || 0,
        right: parseFloat(cs.paddingRight) || 0,
        bottom: parseFloat(cs.paddingBottom) || 0,
        left: parseFloat(cs.paddingLeft) || 0
      };
      probe.remove();
      return this._insets;
    },

    // -------------------------------------------------------- main loop
    update: function (time, delta) {
      var r = this.run;
      if (!r) return;

      this.syncInput();

      // GGKit's pointer map is the authority on which pointers are still
      // down.  If a pointerup is ever lost (an OS gesture, a pause, a
      // dropped event) the claim is released here instead of stranding the
      // climb button for the rest of the run.
      if (this.pressId !== null && !kit.input.pointers.has(this.pressId)) {
        this.pressId = null;
        this.onRelease();
      }
      if (kit.paused && (this.press || this.keyHeld)) this.releaseAll();

      var j = kit.juice.frame();

      // Fixed step with a hard substep cap.  A device that cannot keep up
      // runs in slow motion; no clock the game owns ever skips ahead.
      if (!j.frozen) {
        this.acc += Math.min(delta, 250) / 1000;
        var n = 0;
        while (this.acc >= STEP && n < MAX_SUB) {
          this.step(STEP);
          this.acc -= STEP;
          n++;
          if (r.dead && n > 0) break;
        }
        if (this.acc > STEP * MAX_SUB) this.acc = STEP * MAX_SUB;
      }

      var cam = this.cameras.main;
      cam.centerOn(VW / 2 + (j.dx || 0) / (cam.zoom || 1), this.camY + this.visH / 2 + (j.dy || 0) / (cam.zoom || 1));

      this.paint();
      this.paintHud();
      this.syncDebug();
    },

    // Debug view: rebuilt copies only.  A reader can hold this object for as
    // long as it likes without ever touching a live pool.
    syncDebug: function () {
      var r = this.run;
      var st = this.debugState;
      var h = heightOf(r.bestY);
      st.ready = true;
      st.phase = r.dead ? 'over' : 'play';
      st.mode = this.mode;
      st.height = Math.floor(h);
      st.bestHeight = profile.bestHeight | 0;
      st.combo = r.combo;
      st.bestCombo = r.bestCombo;
      st.band = r.band;
      st.bandKey = BAND(r.band).key;
      st.bandName = BAND(r.band).name;
      st.beyond = beyond(h);
      st.score = Math.floor(r.score + r.dailyBonus);
      st.best = Math.floor(this.mode === 'daily' ? profile.bestDailyScore : profile.bestEndless);
      st.seed = this.seed;
      st.elapsed = Math.round(r.elapsed * 100) / 100;
      st.doomGap = Math.round(r.lava - r.y);
      st.doomProx = Math.round(this.doomProx * 1000) / 1000;
      st.charge = Math.round(r.charge * 1000) / 1000;
      st.dashReady = !!r.dashOk;
      st.wind = Math.round(this.field.fx);
      st.updraft = Math.round(this.field.fy);
      st.grounded = !!r.plat;
      st.hp = r.hp;
      st.room = r.room;
      st.roomKey = roomDef(r.room).key;
      st.checkpointRoom = r.checkpointRoom;
      st.power = r.powerT > 0 ? r.power : '';
      st.powerTime = Math.round(r.powerT * 10) / 10;
      st.dead = !!r.dead;
      st.why = r.why || '';
      st.dailyDone = !!r.dailyDone;
      st.shortcutsThisRun = r.shortcutsFound;
      st.skin = this.skinKey;
      st.trail = this.trailDef ? this.trailDef.key : 'dust';
      var i, np = 0, ne = 0;
      for (i = 0; i < PLAT_MAX; i++) if (this.tower.plats[i].active && !this.tower.plats[i].dead) np++;
      for (i = 0; i < EMBER_MAX; i++) if (this.tower.embers[i].active && !this.tower.embers[i].taken) ne++;
      st.platforms = np;
      st.embers = ne;
      var nn = 0, npu = 0;
      for (i = 0; i < ENEMY_MAX; i++) if (this.tower.enemies[i].active && !this.tower.enemies[i].dead) nn++;
      for (i = 0; i < POWERUP_MAX; i++) if (this.tower.powerups[i].active) npu++;
      st.enemies = nn; st.powerups = npu;
      // The collection fields are rebuilt only when they actually change.
      // Rebuilding four arrays every frame was pure allocation churn and it
      // showed up as periodic collection spikes in the frame trace.
      if (TEST_HOOKS && SA_STATE.forceUnlockAll && profile.bestHeight < 3000) {
        profile.bestHeight = 3000;
        persist();
        markDebugCollections();
      }
      if (debugCollectionsDirty) rebuildDebugCollections();
    }
  };

  // ================================================================ boot
  // Phaser only wires preload/create/update from a plain config object, so
  // every scene literal is promoted to a real Scene subclass with its whole
  // method set on the prototype.
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

  Game.phaser = new Phaser.Game({
    type: Phaser.AUTO,
    parent: document.body,
    backgroundColor: '#0a0713',
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: window.innerWidth,
      height: window.innerHeight
    },
    render: {
      antialias: false, antialiasGL: false, pixelArt: true,
      powerPreference: 'high-performance', roundPixels: true, batchSize: 4096
    },
    fps: { target: 60, min: 30 },
    scene: [toScene(BootScene), toScene(TitleScene), toScene(PlayScene)]
  });

  window.__SPIRE_READY = true;
  window.__SPIRE_SCENE = function () { return Game.play; };

})();
