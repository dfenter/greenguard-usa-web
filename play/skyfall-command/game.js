/* Skyfall Command - game.js
 * Phaser 3 city-defense arcade game. Portrait. GGKit owns lifecycle, audio,
 * input identity, saves, loading, settings and the juice budget.
 *
 * Architecture notes for future maintainers:
 *  - The sim runs on a fixed 60 Hz accumulator; hit-stop freezes the COSMETIC
 *    clock only, never a sim step (ART_DIRECTION rule 5).
 *  - Everything is pooled: threats, interceptors, blasts, score popups,
 *    debris. The hot loop allocates nothing; scratch values are reused.
 *  - Seven pooled particle emitters carry the VFX family (arcade lane floor
 *    is 4-6): trail, exhaust, spark, smoke, debris, ash, shield.
 *  - All prototype tuning constants survive verbatim; see TUNING below.
 *
 *  Preserved run-1 fixes, by name:
 *    * QUEUED-FIRE RACE FIX - the keyboard fire key never fires from the
 *      event handler. keydown only raises a flag; the fixed sim step consumes
 *      it exactly once per step and clears it, and blur/pause/restart clear
 *      it too. See consumeQueuedFire().
 *    * PER-POINTER IDENTITY - aiming and firing read GGKit's pointer map;
 *      a second finger can never steal or duplicate the first one's shot.
 *    * RESTART INPUT-STATE CLEARING - GGKit.restart() clears input before
 *      onRestart runs; resetNight() additionally zeroes the local aim state.
 *    * GUARDED SAVE + VALIDATION - every persisted field is range-checked
 *      against the live content registry before it is trusted.
 */
(function () {
  'use strict';

  // ============================================================== constants
  var TAU = Math.PI * 2;
  var STEP = 1 / 60;
  var MAX_STEPS = 5;

  // ---- TUNING: carried verbatim from the archived prototype -------------
  var SHOT_SPEED = 390;          // interceptor travel speed, px/s
  var BLAST_GROW = 0.28;         // seconds for a blast to reach full radius
  var BLAST_LIFE = 1.0;          // total blast lifetime, seconds
  var BLAST_BASE_R = 46;         // base blast radius
  var BLAST_TIER_R = 1.6;        // radius gained per difficulty tier
  var BLAST_TIER_CAP = 19;       // cap on the tier contribution
  var AIM_STEP = 18;             // keyboard crosshair step, px per keydown
  var AIM_TOP = 28;              // crosshair clamp, top
  var AIM_BOTTOM_FRAC = 0.72;    // crosshair clamp, fraction of height
  var AIM_SIDE = 18;             // crosshair clamp, sides
  var BASE_AMMO = 6;             // interceptors per battery per volley
  var SPAWN_SPACING_BASE = 1.16;
  var SPAWN_SPACING_K = 0.026;
  var SPAWN_SPACING_MIN = 0.44;
  var VOLLEY_COUNT_BASE = 5;
  var VOLLEY_COUNT_K = 1.65;
  var SPLIT_MIN = 0.43, SPLIT_MAX = 0.57;   // MIRV split progress window
  var EVADE_RANGE = 70;          // wraith blast-avoidance radius margin
  var EVADE_PUSH = 85;           // wraith lateral acceleration
  var EVADE_RAMP = 2.8;          // wraith dodge spin-up per second
  var CLEAR_DELAY = 1.25;        // quiet seconds before a volley counts clear
  var DISTRICT_XS = [0.08, 0.22, 0.35, 0.65, 0.78, 0.92];
  var BATTERY_XS = [0.29, 0.50, 0.71];
  // -----------------------------------------------------------------------

  // Pool sizes. MAX_SHOTS is the hard ceiling on interceptors in the air
  // (3 batteries x the largest possible magazine, plus headroom), and
  // MAX_BLASTS is sized to MAX_SHOTS + headroom so a detonation can NEVER
  // land on a live blast and erase it (fix round 1, code review).
  var MAX_THREATS = 96;
  var MAX_SHOTS = 40;
  var MAX_BLASTS = 44;
  var MAX_POPS = 14;
  var MAX_RIBBONS = 110;         // pooled trail segments (see emitRibbon)

  // FEEL GATE: the pools above are the CEILINGS, not the build sizes. Building
  // all of them up front meant PlayScene.create() constructed close to four
  // hundred Phaser game objects inside a single frame, and on a 4x throttled
  // CPU that one frame was the 183 ms worst frame in the trace - and it landed
  // again on every retry and every night transition, because a scene restart
  // destroys the lot. The pools now start small and grow by ONE object at a
  // time, on demand, so the cost is amortised over the first volley instead of
  // being paid in the first frame. Nothing about the pooling contract changes:
  // the hot loop still never allocates once a pool has reached its high-water
  // mark, and MAX_BLASTS still exceeds MAX_SHOTS so a detonation can never
  // overwrite a live blast (fix round 1, feel gate).
  var INIT_THREATS = 24;
  var INIT_SHOTS = 12;
  var INIT_BLASTS = 14;
  var INIT_POPS = 6;
  var INIT_RIBBONS = 32;
  var COMBO_WINDOW = 1.2;        // seconds between kills to keep a chain
  var COMBO_MAX = 5;
  var SPAWN_IMMUNE_STEPS = 2;    // sim steps a fresh threat ignores blasts

  // Round 1 uplift pools. Pickups share one bounded parachute/pod pool, while
  // every interceptor still uses the existing shared shot pool. The ceilings
  // are deliberately generous, but the factories grow on demand so the
  // repaired first-frame feel budget stays intact.
  var MAX_PICKUPS = 14;
  var MAX_ESCORTS = 7;
  var MAX_LINE_FX = 8;
  var POWER_DROP_CAP = 12;
  var WEAPON_DROP_CAP = 10;
  var TIDE_GATE = 90;
  var TIDE_DROP_GAP = 90;

  var SAVE_VERSION = 5;
  var MAX_SALVAGE = 999999;      // policy bound on the economy
  var MAX_SCORE = 99999999;

  // ---------------------------------------------------------------- palette
  // One palette for art, VFX and UI so every screen reads as the same product.
  var PAL = {
    ice: 0xd9fdff, cyan: 0x6ef6ff, teal: 0x6ce4db, deep: 0x123a52,
    night: 0x081426, amber: 0xffd978, ember: 0xff8a4c, rose: 0xff5e72,
    violet: 0xec9bff, green: 0x8ff5d2, steel: 0x2b4358
  };
  var CSS = {
    ice: '#d9fdff', cyan: '#6ef6ff', text: '#dff6ff', dim: '#9fc7d8',
    amber: '#ffd978', green: '#8ff5d2', rose: '#ff8092', violet: '#ec9bff'
  };

  // ---------------------------------------------------------- hangar meta
  // The field refit tracks below are preserved from uplift round 1. The
  // hangar is a separate permanent layer so old saves and the field economy
  // keep their exact behavior while the new command-center tracks grow from
  // zero to five tiers.
  var HANGAR_UPGRADES = [
    { key: 'output', name: 'BATTERY OUTPUT', short: 'DAMAGE', max: 5,
      desc: 'Interceptor damage per hit.', values: ['+10%', '+20%', '+30%', '+40%', '+50%'],
      cost: [45, 72, 116, 188, 310] },
    { key: 'reload', name: 'RELOAD COILS', short: 'FIRE RATE', max: 5,
      desc: 'Faster battery cycling and fire rhythm.', values: ['+8%', '+16%', '+24%', '+32%', '+40%'],
      cost: [45, 72, 116, 188, 310] },
    { key: 'plating', name: 'CITY PLATING', short: 'DISTRICT HP', max: 5,
      desc: 'Extra direct strikes each district can take.', values: ['+1', '+2', '+3', '+4', '+5'],
      cost: [55, 84, 128, 204, 310] },
    { key: 'radar', name: 'RADAR NET', short: 'TELEGRAPH', max: 5,
      desc: 'Threats signal their approach earlier.', values: ['+0.10s', '+0.20s', '+0.30s', '+0.40s', '+0.50s'],
      cost: [45, 70, 112, 182, 300] },
    { key: 'salvage', name: 'SALVAGE', short: 'EARNINGS', max: 5,
      desc: 'More scrap banks from every run.', values: ['+10%', '+20%', '+30%', '+40%', '+50%'],
      cost: [50, 78, 122, 196, 310] },
    { key: 'squadron', name: 'SQUADRON BAY', short: 'ESCORT CAP', max: 5,
      desc: 'Start with escorts and raise the formation cap.', values: ['1 start / +1 cap', '2 start / +2 cap', '3 start / +3 cap', '4 start / +4 cap', '5 start / +5 cap'],
      cost: [60, 92, 140, 220, 310] }
  ];
  var HANGAR_KEYS = HANGAR_UPGRADES.map(function (u) { return u.key; });

  var SKY_STYLES = [
    { key: 'aurora', name: 'AURORA GRID', city: 0x74dcff, accent: 0x6ef6ff },
    { key: 'ember', name: 'EMBER FRONT', city: 0xffa36b, accent: 0xffc36e },
    { key: 'violet', name: 'VIOLET HOUR', city: 0xd697ff, accent: 0xec9bff },
    { key: 'verdant', name: 'VERDANT SIGNAL', city: 0x75efc1, accent: 0x8ff5d2 },
    { key: 'moonsteel', name: 'MOONSTEEL', city: 0xb9d6ee, accent: 0xd9fdff },
    { key: 'sunset', name: 'SUNSET ARRAY', city: 0xff7682, accent: 0xffd978 }
  ];
  var SKY_STYLE_BY_KEY = {};
  for (var ssi = 0; ssi < SKY_STYLES.length; ssi++) SKY_STYLE_BY_KEY[SKY_STYLES[ssi].key] = SKY_STYLES[ssi];
  var TRAIL_STYLES = [
    { key: 'cyan', name: 'ION CYAN', tint: 0x6ef6ff },
    { key: 'amber', name: 'SOLAR AMBER', tint: 0xffd978 },
    { key: 'violet', name: 'PLASMA VIOLET', tint: 0xec9bff },
    { key: 'mint', name: 'MINT ARC', tint: 0x8ff5d2 },
    { key: 'rose', name: 'ROSE FLARE', tint: 0xff8092 },
    { key: 'ice', name: 'ICE WHITE', tint: 0xd9fdff }
  ];
  var TRAIL_STYLE_BY_KEY = {};
  for (var tsi = 0; tsi < TRAIL_STYLES.length; tsi++) TRAIL_STYLE_BY_KEY[TRAIL_STYLES[tsi].key] = TRAIL_STYLES[tsi];

  // ------------------------------------------------------------ threat data
  // Six threat families plus the supply pod. Each reads by silhouette and by
  // colour family per ART_arcade2d.md; the collision radii are the
  // prototype's (fast 7, child 6, standard 9) with the two new classes sized
  // to their sprites.
  var THREAT = {
    shard:   { frame: 'shard',   r: 9,  hp: 1, score: 110, sBase: 61,  sK: 2.4, tint: 0xff5e72, scale: 1.0 },
    streak:  { frame: 'streak',  r: 7,  hp: 1, score: 145, sBase: 122, sK: 3.0, tint: 0xffbd66, scale: 1.0 },
    hydra:   { frame: 'hydra',   r: 11, hp: 1, score: 185, sBase: 58,  sK: 2.2, tint: 0xff6f91, scale: 1.0, splits: 3 },
    wraith:  { frame: 'wraith',  r: 10, hp: 1, score: 175, sBase: 74,  sK: 2.0, tint: 0xec9bff, scale: 1.0, evades: true },
    swarm:   { frame: 'swarm',   r: 6,  hp: 1, score: 90,  sBase: 94,  sK: 2.0, tint: 0xffda76, scale: 1.0 },
    cruiser: { frame: 'cruiser', r: 13, hp: 2, score: 220, sBase: 52,  sK: 1.6, tint: 0xff8a4c, scale: 1.0, armoured: true },
    pod:     { frame: 'pod',     r: 10, hp: 1, score: 60,  sBase: 46,  sK: 0.8, tint: 0x7ef0a8, scale: 1.0, supply: true }
  };

  // ------------------------------------------------------------- campaign
  // Twelve seeded nights. `tier` drives every prototype difficulty formula;
  // each volley inside a night adds 0.9 to it, so the ramp is continuous
  // across the campaign rather than stepping at night boundaries.
  // ------------------------------------------------------- interceptor kit
  // All eight primaries are in-run acquisitions. They share the existing
  // interceptor pool, but each has a distinct skin, trail tint, impact tint
  // and collision behavior. No new asset family is needed for the uplift.
  var INTERCEPTORS = [
    { key: 'standard-bolt', name: 'STANDARD BOLT', frame: 'shard', tint: 0xd9fdff,
      speed: 1.00, radius: 0, life: 1.0, cue: 'sfx_launch', desc: 'Balanced city-defense bolt.' },
    { key: 'flak-burst', name: 'FLAK BURST', frame: 'ic_blast', tint: 0xffc36e,
      speed: 0.82, radius: 34, life: 1.18, cue: 'sfx_airburst', desc: 'Proximity burst with a wide blast.' },
    { key: 'rail-lance', name: 'RAIL LANCE', frame: 'beam', tint: 0x8fe7ff,
      speed: 1.00, radius: 8, life: 0.72, cue: 'sfx_armor', line: true, desc: 'Instant line strike through the sky.' },
    { key: 'seeker-salvo', name: 'SEEKER SALVO', frame: 'wraith', tint: 0xec9bff,
      speed: 0.72, radius: 8, life: 1.05, salvo: 3, seeker: true, cue: 'sfx_wraith', desc: 'Three smart darts bend toward threats.' },
    { key: 'emp-web', name: 'EMP WEB', frame: 'ic_shield', tint: 0x7ad8ff,
      speed: 0.66, radius: 25, life: 2.8, emp: true, cue: 'sfx_shield', desc: 'Slows a whole cluster in the web.' },
    { key: 'incendiary-arc', name: 'INCENDIARY ARC', frame: 'pod', tint: 0xff8a4c,
      speed: 0.58, radius: 30, life: 3.6, burn: true, cue: 'sfx_impact', desc: 'Leaves a burning zone behind.' },
    { key: 'twin-stream', name: 'TWIN STREAM', frame: 'streak', tint: 0x8ff5d2,
      speed: 0.94, radius: -6, life: 0.92, twin: true, cue: 'sfx_splinter', desc: 'Two parallel bolts for reliable coverage.' },
    { key: 'heavy-bunker-shell', name: 'HEAVY BUNKER SHELL', frame: 'cruiser', tint: 0xffd978,
      speed: 0.36, radius: 62, life: 1.55, heavy: true, cue: 'sfx_cruiser', desc: 'Slow shell with a huge blast.' }
  ];
  var INTERCEPTOR_BY_KEY = {};
  for (var ii = 0; ii < INTERCEPTORS.length; ii++) INTERCEPTOR_BY_KEY[INTERCEPTORS[ii].key] = INTERCEPTORS[ii];

  // Friendly field drops. Timed entries merge into capped HUD timers. Instant
  // entries resolve on pickup, so the player is never asked to manage a card
  // menu in this tap-to-fire defense game.
  var POWERS = [
    { key: 'aegis-dome', frame: 'ic_shield', name: 'AEGIS DOME', color: 0x6ef6ff, duration: 10, cap: 14, weight: 0.11 },
    { key: 'overdrive', frame: 'ic_speed', name: 'OVERDRIVE', color: 0xffd978, duration: 9, cap: 14, weight: 0.10 },
    { key: 'chain-lightning', frame: 'ic_blast', name: 'CHAIN LIGHTNING', color: 0x8ff5d2, duration: 9, cap: 13, weight: 0.08 },
    { key: 'time-dilation', frame: 'ic_rebuild', name: 'TIME DILATION', color: 0x7ad8ff, duration: 8, cap: 12, weight: 0.08 },
    { key: 'repair-crews', frame: 'ic_rebuild', name: 'REPAIR CREWS', color: 0x8ff5d2, instant: true, weight: 0.09 },
    { key: 'score-flare', frame: 'ic_mag', name: 'SCORE FLARE', color: 0xffc36e, duration: 12, cap: 18, weight: 0.07 },
    { key: 'scrap-doubler', frame: 'ic_mag', name: 'SCRAP DOUBLER', color: 0xffe28a, duration: 16, cap: 22, weight: 0.07 },
    { key: 'drone-escort', frame: 'pod', name: 'DRONE ESCORT', color: 0x6ce4db, duration: 15, cap: 20, weight: 0.07 },
    { key: 'purge-sky', frame: 'ic_blast', name: 'PURGE SKY', color: 0xfff0b0, instant: true, rare: true, weight: 0.035 },
    { key: 'orbital-lance', frame: 'ic_rebuild', name: 'ORBITAL LANCE', color: 0xffd978, instant: true, rare: true, weight: 0.035 },
    { key: 'decoy-flares', frame: 'wraith', name: 'DECOY FLARES', color: 0xec9bff, duration: 8, cap: 12, weight: 0.06 },
    { key: 'wing-squadron', frame: 'streak', name: 'WING SQUADRON', color: 0x8ff5d2, instant: true, weight: 0.08 },
    { key: 'strike-wing', frame: 'cruiser', name: 'STRIKE WING', color: 0xffc36e, instant: true, weight: 0.06 },
    { key: 'cluster-barrage', frame: 'ic_blast', name: 'CLUSTER BARRAGE', color: 0xff8a4c, instant: true, weight: 0.06 }
  ];
  var POWER_BY_KEY = {};
  for (var pi0 = 0; pi0 < POWERS.length; pi0++) POWER_BY_KEY[POWERS[pi0].key] = POWERS[pi0];
  var TIMED_POWER_KEYS = ['aegis-dome', 'overdrive', 'chain-lightning', 'time-dilation',
    'score-flare', 'scrap-doubler', 'drone-escort', 'decoy-flares'];

  // Danger-weighted comeback drops. These are gold-edged in the field and
  // gated until roughly 90 seconds in a normal defense, with the test switch
  // allowed to bypass the gate for deterministic verification.
  var TIDE_TURNERS = [
    { key: 'last-bastion', frame: 'ic_shield', name: 'LAST BASTION', color: 0xffd978, weight: 0.28 },
    { key: 'sky-purge', frame: 'ic_blast', name: 'SKY PURGE', color: 0xfff0b0, weight: 0.25 },
    { key: 'rally-squadron', frame: 'streak', name: 'RALLY SQUADRON', color: 0x8ff5d2, weight: 0.24 },
    { key: 'chrono-repair', frame: 'ic_rebuild', name: 'CHRONO REPAIR', color: 0x7ad8ff, weight: 0.23 }
  ];
  var TIDE_BY_KEY = {};
  for (var ti = 0; ti < TIDE_TURNERS.length; ti++) TIDE_BY_KEY[TIDE_TURNERS[ti].key] = TIDE_TURNERS[ti];

  // Boot fallback and live-scene hook share this object. The debug view arrays
  // are replaced with preallocated records in PlayScene, never with a pool
  // alias, so a harness cannot truncate a live entity pool by reading state.
  var SC_DEBUG_STATE = {
    wave: 0, pressure: 0, equippedInterceptor: 'standard-bolt', livePickups: [],
    escortCount: 0, tideOdds: 0, lastTideTurner: '',
    forceGenerousDrops: false, forceWeaponDrop: false, forceTideDrop: false,
    forceGrantScrap: 0, forceSpectacle: false, weaponsSeen: 1,
    hangar: {
      balance: 0, tiers: { output: 0, reload: 0, plating: 0, radar: 0, salvage: 0, squadron: 0 },
      equipped: 'standard-bolt', style: { palette: 'aurora', trail: 'cyan' }
    }
  };
  if (typeof window !== 'undefined') window.__sc = { state: SC_DEBUG_STATE };

  var NIGHTS = [
    { name: 'FIRST SIREN',   sub: 'Coastal grid, light contact',   volleys: 3, tier: 1.0,  seed: 0x51F17,
      mix: ['shard'] },
    { name: 'HARBOR WATCH',  sub: 'Fast movers on the approach',   volleys: 3, tier: 2.4,  seed: 0x6A21D,
      mix: ['shard', 'shard', 'streak'] },
    { name: 'EMBER RAIN',    sub: 'Hydra shells in the mix',       volleys: 4, tier: 3.8,  seed: 0x7C3B9,
      mix: ['shard', 'shard', 'streak', 'hydra'] },
    { name: 'SPLIT SKY',     sub: 'Shells over everything',        volleys: 4, tier: 5.2,  seed: 0x8D4E5,
      mix: ['shard', 'hydra', 'hydra', 'streak'] },
    { name: 'GHOST SIGNAL',  sub: 'Wraiths read your blasts',      volleys: 4, tier: 6.6,  seed: 0x9E5F1,
      mix: ['shard', 'streak', 'wraith', 'hydra'] },
    { name: 'LONG APPROACH', sub: 'Armoured cruisers inbound',     volleys: 4, tier: 8.0,  seed: 0xAF60D,
      mix: ['shard', 'streak', 'cruiser', 'hydra'] },
    { name: 'BLACKOUT',      sub: 'Grid down, blasts fade fast',   volleys: 4, tier: 9.4,  seed: 0xB0719,
      mix: ['shard', 'streak', 'hydra', 'wraith'], mod: 'blackout' },
    { name: 'CROSSWIND',     sub: 'Everything drifts',             volleys: 5, tier: 10.8, seed: 0xC1825,
      mix: ['shard', 'streak', 'hydra', 'wraith', 'cruiser'], mod: 'wind' },
    { name: 'SATURATION',    sub: 'They stopped spacing them out', volleys: 5, tier: 12.2, seed: 0xD2931,
      mix: ['shard', 'streak', 'hydra', 'swarm', 'wraith'], mod: 'barrage' },
    { name: 'THE LONG NIGHT', sub: 'Every class, no let up',       volleys: 5, tier: 13.6, seed: 0xE3A4D,
      mix: ['shard', 'streak', 'hydra', 'wraith', 'cruiser'] },
    { name: 'LAST LIGHT',    sub: 'Hold the line until dawn',      volleys: 5, tier: 15.0, seed: 0xF4B59,
      mix: ['streak', 'hydra', 'wraith', 'cruiser', 'shard'], mod: 'wind' },
    { name: 'THE OBELISK',   sub: 'It came down with the volley',  volleys: 3, tier: 16.4, seed: 0x05C65,
      mix: ['streak', 'hydra', 'wraith', 'cruiser'], boss: true }
  ];

  // ------------------------------------------------------------- upgrades
  var UPGRADES = [
    { key: 'mag',      name: 'Magazine Racks',  max: 5,
      desc: 'Plus one interceptor in every battery.',
      cost: [60, 110, 180, 270, 380] },
    { key: 'blast',    name: 'Warhead Yield',   max: 5,
      desc: 'Nine percent wider airburst per level.',
      cost: [70, 120, 190, 280, 400] },
    { key: 'speed',    name: 'Boost Motors',    max: 4,
      desc: 'Twelve percent faster interceptors.',
      cost: [60, 110, 180, 270] },
    { key: 'resupply', name: 'Resupply Drone',  max: 3,
      desc: 'Refills every battery when you run dry.',
      cost: [90, 170, 290] },
    { key: 'shield',   name: 'District Shield', max: 3,
      desc: 'Absorbs one strike on a district.',
      cost: [120, 230, 380] },
    { key: 'rebuild',  name: 'Rebuild Crews',   max: 3,
      desc: 'Raises a lost district between volleys.',
      cost: [150, 280, 460] }
  ];
  var UP_KEYS = UPGRADES.map(function (u) { return u.key; });

  // ================================================================ helpers
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  // Deterministic per-volley RNG, identical algorithm to the prototype's so
  // a given seed produces the same sky it always did.
  function makeRng(seed) {
    var value = seed >>> 0;
    return function () {
      value += 0x6D2B79F5;
      var t = value;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function upMax(key) {
    for (var i = 0; i < UPGRADES.length; i++) if (UPGRADES[i].key === key) return UPGRADES[i].max;
    return 0;
  }

  function defaultHangar() {
    var tiers = {};
    for (var i = 0; i < HANGAR_KEYS.length; i++) tiers[HANGAR_KEYS[i]] = 0;
    return {
      tiers: tiers,
      equipped: 'standard-bolt',
      style: { palette: 'aurora', trail: 'cyan' },
      seen: { 'standard-bolt': true }
    };
  }

  function defaultSave() {
    var up = {};
    for (var i = 0; i < UP_KEYS.length; i++) up[UP_KEYS[i]] = 0;
    return { v: SAVE_VERSION, night: 1, salvage: 0, best: 0, siege: 0, tut: false,
      flash: true, up: up, hangar: defaultHangar() };
  }

  function safeInt(v, lo, hi) {
    return typeof v === 'number' && isFinite(v) && Math.floor(v) === v &&
      v >= lo && v <= hi;
  }

  // GUARDED SAVE + VALIDATION. Anything that fails a range check against the
  // live content registry sends the whole record back to defaults rather than
  // letting a stale or hand-edited profile unlock content that does not exist.
  // Every field must be a SAFE INTEGER inside an explicit policy bound, and
  // the record must carry no fields the current build does not know about: a
  // fractional or astronomically large salvage value used to pass validation
  // and then be trusted by the shop (fix round 1, code review).
  var SAVE_KEYS = ['v', 'night', 'salvage', 'best', 'siege', 'tut', 'flash', 'up', 'hangar'];
  function validStyle(style) {
    return style && typeof style === 'object' &&
      Object.keys(style).every(function (k) { return k === 'palette' || k === 'trail'; }) &&
      typeof style.palette === 'string' && !!SKY_STYLE_BY_KEY[style.palette] &&
      typeof style.trail === 'string' && !!TRAIL_STYLE_BY_KEY[style.trail];
  }
  function validHangar(h) {
    if (!h || typeof h !== 'object') return false;
    var k;
    for (k in h) if (Object.prototype.hasOwnProperty.call(h, k) && ['tiers', 'equipped', 'style', 'seen'].indexOf(k) < 0) return false;
    if (!h.tiers || typeof h.tiers !== 'object' || !validStyle(h.style)) return false;
    for (k in h.tiers) {
      if (Object.prototype.hasOwnProperty.call(h.tiers, k) && HANGAR_KEYS.indexOf(k) < 0) return false;
    }
    for (var i = 0; i < HANGAR_KEYS.length; i++) if (!safeInt(h.tiers[HANGAR_KEYS[i]], 0, 5)) return false;
    if (typeof h.equipped !== 'string' || !INTERCEPTOR_BY_KEY[h.equipped]) return false;
    if (!h.seen || typeof h.seen !== 'object') return false;
    for (k in h.seen) {
      if (Object.prototype.hasOwnProperty.call(h.seen, k) && !INTERCEPTOR_BY_KEY[k]) return false;
      if (Object.prototype.hasOwnProperty.call(h.seen, k) && typeof h.seen[k] !== 'boolean') return false;
    }
    if (!h.seen['standard-bolt']) return false;
    return true;
  }
  function validateSave(o) {
    if (!o || typeof o !== 'object' || (o.v !== 4 && o.v !== SAVE_VERSION)) return false;
    var k;
    for (k in o) if (Object.prototype.hasOwnProperty.call(o, k) && SAVE_KEYS.indexOf(k) < 0) return false;
    if (!safeInt(o.night, 1, NIGHTS.length + 1)) return false;
    if (!safeInt(o.salvage, 0, MAX_SALVAGE)) return false;
    if (!safeInt(o.best, 0, MAX_SCORE)) return false;
    if (!safeInt(o.siege, 0, MAX_SCORE)) return false;
    if (typeof o.tut !== 'boolean') return false;
    if (typeof o.flash !== 'boolean') return false;
    if (!o.up || typeof o.up !== 'object') return false;
    for (k in o.up) {
      if (Object.prototype.hasOwnProperty.call(o.up, k) && UP_KEYS.indexOf(k) < 0) return false;
    }
    for (var i = 0; i < UP_KEYS.length; i++) {
      if (!safeInt(o.up[UP_KEYS[i]], 0, upMax(UP_KEYS[i]))) return false;
    }
    if (o.v === SAVE_VERSION && !validHangar(o.hangar)) return false;
    return true;
  }

  // ---------------------------------------------------------- safe insets
  // Read the real safe-area insets once so the HUD can sit clear of a notch
  // without hard-coding a device.
  function readInsets() {
    var probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;' +
      'padding:env(safe-area-inset-top) env(safe-area-inset-right) ' +
      'env(safe-area-inset-bottom) env(safe-area-inset-left);';
    document.body.appendChild(probe);
    var cs = getComputedStyle(probe);
    var out = {
      top: parseFloat(cs.paddingTop) || 0,
      right: parseFloat(cs.paddingRight) || 0,
      bottom: parseFloat(cs.paddingBottom) || 0,
      left: parseFloat(cs.paddingLeft) || 0
    };
    probe.remove();
    return out;
  }

  // =============================================================== profile
  var kit = GGKit.create({
    slug: 'skyfall-command',
    orientation: 'portrait',
    validateSave: validateSave,
    onPause: function () {
      var s = Game.play;
      if (s && s.scene.isActive()) { s.keyFire = false; s.scene.pause(); }
    },
    onResume: function () {
      var s = Game.play;
      if (s && s.scene.isPaused()) s.scene.resume();
    },
    onRestart: function () {
      var s = Game.play;
      if (s) { s.keyFire = false; s.scene.restart({ night: s.nightIndex, mode: s.mode }); }
    }
  });

  var Game = { phaser: null, play: null, insets: readInsets() };
  var profile = kit.save.get(null);
  if (!profile) profile = defaultSave();
  if (profile.v !== SAVE_VERSION) {
    profile.v = SAVE_VERSION;
    profile.hangar = defaultHangar();
    persist();
  }
  if (!profile.hangar) profile.hangar = defaultHangar();
  function syncHangarDebug() {
    var hs = SC_DEBUG_STATE.hangar;
    hs.balance = profile.salvage;
    for (var hsi = 0; hsi < HANGAR_KEYS.length; hsi++) hs.tiers[HANGAR_KEYS[hsi]] = profile.hangar.tiers[HANGAR_KEYS[hsi]];
    hs.equipped = profile.hangar.equipped;
    hs.style.palette = profile.hangar.style.palette;
    hs.style.trail = profile.hangar.style.trail;
  }
  syncHangarDebug();
  function persist() { kit.save.set(profile); }

  function upLevel(key) { return profile.up[key] || 0; }
  function upCost(u) { return u.cost[profile.up[u.key] || 0]; }
  function hangarLevel(key) {
    return profile.hangar && profile.hangar.tiers[key] ? profile.hangar.tiers[key] : 0;
  }
  function hangarUpgrade(key) {
    for (var i = 0; i < HANGAR_UPGRADES.length; i++) if (HANGAR_UPGRADES[i].key === key) return HANGAR_UPGRADES[i];
    return null;
  }
  function hangarCost(u) { return u.cost[hangarLevel(u.key)]; }
  function stylePalette() { return SKY_STYLE_BY_KEY[profile.hangar.style.palette] || SKY_STYLES[0]; }
  function styleTrail() { return TRAIL_STYLE_BY_KEY[profile.hangar.style.trail] || TRAIL_STYLES[0]; }
  function bankRunEarnings(n) {
    var boosted = n * (1 + hangarLevel('salvage') * 0.10);
    // The bank is intentionally 75% of the run result. The remaining quarter
    // is the command center's operating cut and never enters the save.
    var banked = Math.max(0, Math.round(boosted * 0.75));
    grantSalvage(banked);
    return banked;
  }
  function grantSalvage(n) {
    profile.salvage = clamp(Math.round(profile.salvage + n), 0, MAX_SALVAGE);
    syncHangarDebug();
  }

  // ------------------------------------------------- accessibility routing
  // ONE reduced-motion configuration. kit.juice.enabled is GGKit's shake and
  // hit-stop switch; the title routes its own flash plate, red vignette,
  // bloom intensity and particle counts through the same pair of settings so
  // the toggle actually covers everything the player sees (fix round 1).
  function motionOn() { return kit.juice.enabled !== false; }
  function flashOn() { return motionOn() && profile.flash !== false; }
  function fxScale() { return motionOn() ? 1 : 0.34; }   // particle-count scale
  function fxCount(n) { return Math.max(1, Math.round(n * fxScale())); }

  // Every settings entry point in the game goes through here so the extra
  // Skyfall row exists on the title, in the pause menu and everywhere else.
  function openSettings() {
    var box = kit.openSettings([function (parent, row) {
      row('Flash effects', function () { return profile.flash !== false; }, function (v) {
        profile.flash = !!v; persist();
      });
    }]);
    themeOverlay(box, 'SETTINGS');
    return box;
  }

  // ---------------------------------------------------------- DOM theming
  // GGKit still owns the loader, the settings shell and pause lifecycle; the
  // title only restyles the DOM they produce so no screen ships in the kit's
  // default utility grey (fix round 1, art review).
  var SKIN = {
    bg: 'radial-gradient(120% 80% at 50% 12%, #12244a 0%, #0a1430 45%, #050a1a 100%)',
    font: 'Verdana, Geneva, system-ui, sans-serif'
  };
  function skylineStrip() {
    // A CSS skyline so every overlay sits over the same city, with no extra
    // image request and no canvas work.
    var s = document.createElement('div');
    s.style.cssText = 'position:absolute;left:0;right:0;bottom:0;height:92px;pointer-events:none;' +
      'background:repeating-linear-gradient(90deg,' +
      'rgba(10,22,44,.95) 0 9px, rgba(0,0,0,0) 9px 12px,' +
      'rgba(14,30,56,.95) 12px 26px, rgba(0,0,0,0) 26px 30px,' +
      'rgba(8,18,38,.95) 30px 51px, rgba(0,0,0,0) 51px 55px);' +
      '-webkit-mask-image:linear-gradient(180deg,rgba(0,0,0,0) 0%,#000 55%);' +
      'mask-image:linear-gradient(180deg,rgba(0,0,0,0) 0%,#000 55%);opacity:.85;';
    return s;
  }
  function themeOverlay(box, title) {
    if (!box || box.__skinned) return box;
    box.__skinned = true;
    box.style.background = SKIN.bg;
    box.style.fontFamily = SKIN.font;
    box.style.color = CSS.text;
    box.appendChild(skylineStrip());
    // Cyan horizon rule under the heading, plus Skyfall button styling.
    var kids = box.querySelectorAll('div, button');
    for (var i = 0; i < kids.length; i++) {
      var e = kids[i];
      if (e.tagName === 'BUTTON') {
        var primary = /back|resume/i.test(e.textContent);
        e.style.cssText += ';position:relative;font-family:' + SKIN.font +
          ';letter-spacing:1px;font-weight:700;border-radius:10px;' +
          'border:1px solid ' + (primary ? CSS.cyan : '#2e5e74') + ';' +
          'background:' + (primary ? 'linear-gradient(180deg,#164a63,#0d2b3d)'
            : 'linear-gradient(180deg,#132842,#0b1a2e)') + ';color:' + CSS.ice + ';' +
          'box-shadow:0 0 18px rgba(110,246,255,' + (primary ? '.28' : '.10') + ') inset;';
      } else if (i === 0 && title) {
        e.style.cssText += ';letter-spacing:4px;color:' + CSS.ice +
          ';text-shadow:0 0 18px rgba(110,246,255,.55);';
      }
    }
    if (title) {
      var rule = document.createElement('div');
      rule.style.cssText = 'width:min(70vw,300px);height:2px;margin:-4px 0 8px;' +
        'background:linear-gradient(90deg,rgba(110,246,255,0),' + CSS.cyan + ',rgba(110,246,255,0));';
      if (box.firstChild && box.firstChild.nextSibling) box.insertBefore(rule, box.firstChild.nextSibling);
    }
    return box;
  }

  // ================================================================ assets
  var SFX = ['sfx_launch', 'sfx_airburst', 'sfx_splinter', 'sfx_impact', 'sfx_district',
    'sfx_dry', 'sfx_reload', 'sfx_siren', 'sfx_clear', 'sfx_defeat', 'sfx_buy',
    'sfx_ui', 'sfx_shield', 'sfx_wraith', 'sfx_cruiser', 'sfx_armor', 'sfx_pod'];

  // ============================================================ Boot scene
  // The loader is GGKit's, skinned into the Skyfall grade: logo lockup, city
  // horizon, cyan progress with a travelling highlight (fix round 1).
  function themeLoader() {
    var box = document.body.lastElementChild;
    if (!box || box.__skinned) return;
    box.__skinned = true;
    box.style.background = SKIN.bg;
    box.style.fontFamily = SKIN.font;
    box.appendChild(skylineStrip());
    var head = box.firstElementChild;
    if (head) {
      head.style.cssText = 'font-size:26px;font-weight:700;letter-spacing:7px;margin-bottom:6px;' +
        'color:' + CSS.ice + ';text-shadow:0 0 22px rgba(110,246,255,.6);z-index:1;';
      var sub = document.createElement('div');
      sub.textContent = 'HOLD THE SKY OVER SIX DISTRICTS';
      sub.style.cssText = 'font-size:12px;letter-spacing:3px;color:' + CSS.cyan +
        ';margin-bottom:22px;opacity:.85;z-index:1;';
      head.parentNode.insertBefore(sub, head.nextSibling);
    }
    var track = box.querySelector('div > div') && box.children[box.children.length - 2];
    for (var i = 0; i < box.children.length; i++) {
      var e = box.children[i];
      if (e.style && e.style.height === '8px') { track = e; break; }
    }
    if (track) {
      track.style.cssText = 'width:min(70vw,320px);height:10px;border-radius:5px;position:relative;' +
        'background:rgba(12,28,48,.9);border:1px solid rgba(110,246,255,.35);overflow:hidden;z-index:1;';
      var bar = track.firstElementChild;
      if (bar) {
        bar.style.cssText = 'width:0%;height:100%;transition:width .18s;' +
          'background:linear-gradient(90deg,#1d6f8e,' + CSS.cyan + ');' +
          'box-shadow:0 0 14px rgba(110,246,255,.8);';
      }
      var label = document.createElement('div');
      label.textContent = 'ARMING BATTERIES';
      label.style.cssText = 'font-size:11px;letter-spacing:3px;color:#7fb6cc;margin-top:14px;z-index:1;';
      box.appendChild(label);
    }
  }

  var BootScene = {
    key: 'boot',
    preload: function () {
      kit.loader.show('SKYFALL COMMAND');
      themeLoader();
      var self = this;
      this.load.on('progress', function (p) { kit.loader.progress(p * 0.62); });
      this.load.atlas('atlas', 'assets/atlas.png', 'assets/atlas.json');
      this.load.atlas('digits', 'assets/digits.png', 'assets/digits.json');
      this.load.image('stars', 'assets/stars.png');
      this.load.image('neb', 'assets/neb.png');
      this.load.image('city_far', 'assets/city_far.png');
      this.load.image('city_mid', 'assets/city_mid.png');
      this.load.image('city_near', 'assets/city_near.png');
      this.load.image('ground', 'assets/ground.png');
      this.load.image('clouds', 'assets/clouds.png');
      this.load.image('aurora', 'assets/aurora.png');
      this.load.image('logo', 'assets/logo.png');
      this.load.image('disc', 'assets/disc.png');
      this.load.image('p_spark', 'assets/p_spark.png');
      this.load.image('p_flare', 'assets/p_flare.png');
      this.load.image('p_smoke', 'assets/p_smoke.png');
      this.load.image('p_ember', 'assets/p_ember.png');
      this.load.image('p_shard', 'assets/p_shard.png');
      this.load.image('p_ribbon', 'assets/p_ribbon.png');
      this.load.image('p_fire', 'assets/p_fire.png');
      this.load.on('complete', function () { self.filesDone = true; });
    },

    create: function () {
      var self = this;

      // Muzzle flash is a real three-frame animation on the battery.
      this.anims.create({
        key: 'muzzle',
        frames: [{ key: 'atlas', frame: 'flash1' }, { key: 'atlas', frame: 'flash2' },
                 { key: 'atlas', frame: 'flash3' }],
        frameRate: 26, repeat: 0, hideOnComplete: true
      });

      // Pre-warm: touch every texture once through the renderer so the first
      // gameplay frame never pays an upload cost mid-volley (feel gate).
      var warm = this.add.container(0, 0).setAlpha(0.001);
      var frames = ['turret_idle', 'turret_charge', 'turret_empty', 'turret_dead', 'barrel',
        'flash1', 'flash2', 'flash3', 'dist_a', 'dist_b', 'dist_c',
        'dist_a_dmg', 'dist_b_dmg', 'dist_c_dmg', 'dist_a_ruin', 'dist_b_ruin', 'dist_c_ruin',
        'plinth', 'beam', 'chev', 'shield_hi', 'ic_mag', 'ic_blast', 'ic_speed',
        'ic_resupply', 'ic_shield', 'ic_rebuild', 'shard',
        'streak', 'hydra', 'wraith', 'swarm', 'cruiser', 'pod', 'obelisk', 'crosshair',
        'ring', 'shield'];
      for (var i = 0; i < frames.length; i++) warm.add(this.add.image(4, 4, 'atlas', frames[i]));
      var singles = ['stars', 'neb', 'city_far', 'city_mid', 'city_near', 'ground', 'clouds',
        'aurora', 'logo', 'disc', 'p_spark', 'p_flare', 'p_smoke', 'p_ember', 'p_shard',
        'p_ribbon', 'p_fire'];
      for (var j = 0; j < singles.length; j++) warm.add(this.add.image(4, 4, singles[j]));
      for (var g = 0; g < 10; g++) warm.add(this.add.image(4, 4, 'digits', String(g)));
      kit.loader.progress(0.7);

      // Register audio with GGKit's buses. SFX are decoded now so the first
      // airburst does not hitch; music lazy-loads after the first interaction
      // per the payload rule.
      var reg = { music_night: 'assets/music_night.mp3', music_alert: 'assets/music_alert.mp3' };
      for (var s = 0; s < SFX.length; s++) reg[SFX[s]] = 'assets/' + SFX[s] + '.mp3';
      kit.audio.register(reg);

      var done = 0;
      Promise.all(SFX.map(function (n) {
        return kit.audio.preload([n]).then(function () {
          done++;
          kit.loader.progress(0.7 + 0.3 * (done / SFX.length));
        });
      })).then(function () {
        kit.loader.progress(1);
        warm.destroy(true);
        // FEEL GATE: both music stems are fetched and DECODED here, in the
        // background, while the title screen is on. They used to decode
        // lazily - music_night on the first tap and music_alert the moment
        // the sky got busy - and a 270 KB mp3 decode landing mid-volley was
        // the single worst frame in the trace. Nothing awaits this promise,
        // so it never delays the boot either.
        kit.audio.preload(['music_night', 'music_alert']);
        self.time.delayedCall(60, function () {
          kit.loader.hide();
          self.scene.start('title');
        });
      });
    }
  };

  // ================================================== shared sky backdrop
  // Title, Command and Play all sit under the same night sky so the product
  // reads as one place.
  //
  // PERFORMANCE NOTE: the gradient, both nebula washes and the horizon glow
  // never move, and every one of them is a full-screen additive quad. Blended
  // full-screen layers are the single biggest frame cost on software
  // rasterisers and throttled CPUs, so they are composited ONCE into an
  // opaque canvas texture at load and drawn as a single unblended quad. Only
  // the layers that actually parallax stay live.
  // Night grades. Each modifier and the boss finale get their OWN sky, baked
  // once, so "blackout" or "the Obelisk is here" is a look and not just a
  // rule change (fix round 1, art review). Cost at runtime: zero.
  var GRADES = {
    clear:    { stops: ['#050a1a', '#0a1638', '#14224e', '#2c1e44', '#4a243e'],
                neb: 1.00, star: 0.85, glow: 0.30, city: 0.62, tint: 0xffffff },
    dim:      { stops: ['#03060f', '#060d22', '#0b1430', '#181026', '#2a1626'],
                neb: 0.52, star: 0.50, glow: 0.16, city: 0.34, tint: 0x8fa6c8 },
    blackout: { stops: ['#02040c', '#050a1c', '#080f28', '#120c20', '#241322'],
                neb: 0.40, star: 1.00, glow: 0.10, city: 0.30, tint: 0x7f93b4 },
    wind:     { stops: ['#060b1c', '#0c1a3c', '#183056', '#35284c', '#5a3446'],
                neb: 1.20, star: 0.70, glow: 0.36, city: 0.66, tint: 0xd8e6ff },
    barrage:  { stops: ['#0c0714', '#1a0f2c', '#26184a', '#3c1c40', '#5c2436'],
                neb: 1.10, star: 0.55, glow: 0.48, city: 0.70, tint: 0xffd0c0 },
    late:     { stops: ['#04070f', '#0a1226', '#131f42', '#2a1c3e', '#4a2338'],
                neb: 0.85, star: 0.95, glow: 0.26, city: 0.58, tint: 0xc8d8f0 },
    storm:    { stops: ['#0a0414', '#1a0a2c', '#2a1048', '#4a1440', '#701c38'],
                neb: 1.35, star: 0.35, glow: 0.62, city: 0.74, tint: 0xff9ec4 }
  };

  function bakeSkyBase(scene, w, h, gradeKey) {
    var g = GRADES[gradeKey] || GRADES.clear;
    var key = 'skybase_' + w + 'x' + h + '_' + gradeKey;
    if (scene.textures.exists(key)) return key;
    var tex = scene.textures.createCanvas(key, w, h);
    var ctx = tex.getContext();

    var grad = ctx.createLinearGradient(0, 0, 0, h);
    var stops = [0.00, 0.30, 0.58, 0.82, 1.00];
    for (var si = 0; si < stops.length; si++) grad.addColorStop(stops[si], g.stops[si]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Nebula washes and the horizon glow, additively composited into the bake.
    var neb = scene.textures.get('neb').getSourceImage();
    var disc = scene.textures.get('disc').getSourceImage();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.34 * g.neb;
    ctx.drawImage(neb, -w * 0.25, h * 0.26 - h * 0.31, w * 1.5, h * 0.62);
    ctx.globalAlpha = 0.20 * g.neb;
    ctx.drawImage(neb, w * 0.2 - w * 0.55, h * 0.42 - h * 0.20, w * 1.1, h * 0.40);
    ctx.globalAlpha = g.glow;
    ctx.drawImage(disc, w * 0.5 - w * 0.8, h * 0.72 + 6 - 110, w * 1.6, 220);

    // Star field and the farthest skyline layer bake in too. They drift so
    // slowly that nothing reads as lost, and each one removed is a
    // full-width blended layer and a texture bind off every single frame.
    var starPat = ctx.createPattern(scene.textures.get('stars').getSourceImage(), 'repeat');
    ctx.globalAlpha = g.star;
    ctx.fillStyle = starPat;
    ctx.fillRect(0, 0, w, h * 0.70);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = g.city;
    var farImg = scene.textures.get('city_far').getSourceImage();
    var fy = h * 0.72 - 108;
    for (var fx = 0; fx < w; fx += farImg.width) ctx.drawImage(farImg, fx, fy);
    ctx.globalAlpha = 1;

    tex.refresh();
    return key;
  }

  function buildSky(scene, opts) {
    var w = scene.scale.width, h = scene.scale.height;
    var o = opts || {};
    var gradeKey = o.grade || (o.dim ? 'dim' : 'clear');
    var g = GRADES[gradeKey] || GRADES.clear;
    var sky = { grade: gradeKey, style: null };

    sky.base = scene.add.image(0, 0, bakeSkyBase(scene, Math.ceil(w), Math.ceil(h), gradeKey))
      .setOrigin(0, 0).setDepth(-100).setDisplaySize(w, h);

    var horizon = h * 0.72;

    // Ion haze: the slowest parallax layer, and the one that gives the sky
    // depth between the baked stars and the skyline.
    sky.haze = scene.add.tileSprite(0, horizon - 250, w, 128, 'clouds').setOrigin(0, 0)
      .setDepth(-94).setAlpha(gradeKey === 'blackout' ? 0.34 : 0.62)
      .setBlendMode(Phaser.BlendModes.ADD).setTint(g.tint);
    sky.haze2 = scene.add.tileSprite(0, horizon - 150, w, 128, 'clouds').setOrigin(0, 0)
      .setDepth(-92).setAlpha(gradeKey === 'blackout' ? 0.22 : 0.40)
      .setBlendMode(Phaser.BlendModes.ADD).setTint(g.tint).setScale(1, 0.7);

    // Night twelve only: a storm curtain behind the skyline.
    sky.aurora = null;
    if (gradeKey === 'storm') {
      sky.aurora = scene.add.tileSprite(0, horizon - 300, w, 160, 'aurora').setOrigin(0, 0)
        .setDepth(-95).setAlpha(0.55).setBlendMode(Phaser.BlendModes.ADD);
    }

    sky.mid = scene.add.tileSprite(0, horizon - 118, w, 150, 'city_mid').setOrigin(0, 0)
      .setDepth(-88).setAlpha(g.city > 0.5 ? 0.82 : 0.50).setTint(g.tint);
    sky.near = scene.add.tileSprite(0, horizon - 96, w, 176, 'city_near').setOrigin(0, 0)
      .setDepth(-86).setAlpha(g.city > 0.5 ? 1 : 0.72).setTint(g.tint);

    // Skyline palette is a live cosmetic layer. The baked grade remains the
    // authored night lighting, while these tints let the hangar theme travel
    // from command center preview into the next run without new assets.
    sky.setStyle = function (key) {
      var st = SKY_STYLE_BY_KEY[key] || SKY_STYLES[0];
      sky.style = st.key;
      sky.haze.setTint(st.city);
      sky.haze2.setTint(st.city);
      sky.mid.setTint(st.city);
      sky.near.setTint(st.city);
      if (sky.aurora) sky.aurora.setTint(st.accent);
      return sky;
    };
    sky.setStyle(o.style || profile.hangar.style.palette);

    // Far-star twinkle: eight pooled points on the baked field, so the sky is
    // never a dead still image even with everything else frozen.
    sky.stars = [];
    for (var i = 0; i < 8; i++) {
      var sx = w * (0.08 + (i * 0.127) % 0.86);
      var sy = h * (0.06 + ((i * 0.31) % 1) * 0.44);
      sky.stars.push({
        spr: scene.add.image(sx, sy, 'p_ember').setDepth(-96)
          .setBlendMode(Phaser.BlendModes.ADD).setScale(0.16).setAlpha(0.2),
        p: i * 0.83, k: 0.7 + i * 0.11
      });
    }

    // Ambient ash drifting across the sky.
    sky.ash = scene.add.particles(0, 0, 'p_ember', {
      x: { min: -20, max: w + 20 }, y: { min: -20, max: h * 0.7 },
      lifespan: { min: 4200, max: 8000 },
      speedX: { min: -14, max: 14 }, speedY: { min: 6, max: 24 },
      scale: { start: 0.10, end: 0.02 }, alpha: { start: 0.42, end: 0 },
      tint: [0xffc98a, 0x8fd8ff, 0xffffff], quantity: 1,
      frequency: Math.round(340 / fxScale()),
      maxAliveParticles: fxCount(22), blendMode: 'ADD'
    }).setDepth(-80);

    sky.t = 0;
    sky.tick = function (dt, drift) {
      var d = drift || 1;
      sky.t += dt;
      sky.haze.tilePositionX += dt * 1.7 * d;
      sky.haze2.tilePositionX += dt * 3.1 * d;
      if (sky.aurora) {
        sky.aurora.tilePositionX += dt * 5.5;
        sky.aurora.setAlpha(0.42 + 0.16 * Math.sin(sky.t * 0.8));
      }
      sky.mid.tilePositionX += dt * 5.4 * d;
      sky.near.tilePositionX += dt * 8.2 * d;
      for (var i = 0; i < sky.stars.length; i++) {
        var s = sky.stars[i];
        s.spr.setAlpha(0.16 + 0.5 * Math.pow(Math.max(0, Math.sin(sky.t * s.k + s.p)), 6));
      }
    };
    sky.resize = function (nw, nh) {
      sky.base.setDisplaySize(nw, nh);
      var hz = nh * 0.72;
      sky.haze.setSize(nw, 128).setPosition(0, hz - 250);
      sky.haze2.setSize(nw, 128).setPosition(0, hz - 150);
      if (sky.aurora) sky.aurora.setSize(nw, 160).setPosition(0, hz - 300);
      sky.mid.setSize(nw, 150).setPosition(0, hz - 118);
      sky.near.setSize(nw, 176).setPosition(0, hz - 96);
      for (var i = 0; i < sky.stars.length; i++) {
        sky.stars[i].spr.setPosition(nw * (0.08 + (i * 0.127) % 0.86),
          nh * (0.06 + ((i * 0.31) % 1) * 0.44));
      }
    };
    return sky;
  }

  // ------------------------------------------------------ bitmap numerals
  // Every number on the HUD is drawn from the bundled display face instead of
  // a Phaser Text object. Two reasons: 9-10px Verdana was below the legible
  // floor at 390px (art review), and a Text re-renders its canvas and
  // re-uploads a texture on EVERY value change, which is a frame spike on a
  // throttled device (feel gate).
  var GLYPH_W = 20, GLYPH_H = 28;
  function makeNumber(scene, x, y, height, tint, align) {
    var n = {
      x: x, y: y, h: height, align: align || 0,   // 0 left, 1 right, 0.5 centre
      scale: height / GLYPH_H, imgs: [], shown: null, depth: 101, sf: 1,
      alpha: 1, extra: 1
    };
    n.setDepth = function (d) { n.depth = d; for (var i = 0; i < n.imgs.length; i++) n.imgs[i].setDepth(d); return n; };
    n.setScrollFactor = function (s) { n.sf = s; for (var i = 0; i < n.imgs.length; i++) n.imgs[i].setScrollFactor(s); return n; };
    n.setTint = function (t) { tint = t; for (var i = 0; i < n.imgs.length; i++) n.imgs[i].setTint(t); return n; };
    n.setAlpha = function (a) { n.alpha = a; for (var i = 0; i < n.imgs.length; i++) n.imgs[i].setAlpha(a); return n; };
    n.setVisible = function (v) {
      n.visible = v;
      for (var i = 0; i < n.imgs.length; i++) n.imgs[i].setVisible(v && i < (n.shown ? n.shown.length : 0));
      return n;
    };
    n.setPosition = function (px, py) { n.x = px; n.y = py; n.layout(); return n; };
    n.setPop = function (k) { n.extra = k; n.layout(); return n; };
    // Popups rise by writing y directly, exactly like a Text object, so the
    // two popup paths share one animation.
    Object.defineProperty(n, 'y', {
      get: function () { return n._y; },
      set: function (v) { n._y = v; n.layout(); }
    });
    n._y = y;
    n.layout = function () {
      var s = n.scale * n.extra;
      var adv = GLYPH_W * s * 0.86;
      var text = n.shown || '';
      var total = text.length * adv;
      var sx = n.x - total * n.align;
      for (var i = 0; i < text.length; i++) {
        n.imgs[i].setPosition(sx + adv * (i + 0.5), n.y).setScale(s);
      }
    };
    n.setText = function (text) {
      text = String(text);
      if (text === n.shown) return n;
      var i;
      for (i = n.imgs.length; i < text.length; i++) {
        n.imgs.push(scene.add.image(0, 0, 'digits', '0').setOrigin(0.5, 0.5)
          .setDepth(n.depth).setScrollFactor(n.sf).setTint(tint).setAlpha(n.alpha));
      }
      for (i = 0; i < n.imgs.length; i++) {
        if (i < text.length) {
          var ch = text.charAt(i);
          if (!scene.textures.get('digits').has(ch)) ch = '-';
          n.imgs[i].setFrame(ch).setVisible(n.visible !== false);
        } else {
          n.imgs[i].setVisible(false);
        }
      }
      n.shown = text;
      n.layout();
      return n;
    };
    n.destroy = function () { for (var i = 0; i < n.imgs.length; i++) n.imgs[i].destroy(); n.imgs.length = 0; };
    return n;
  }

  // ------------------------------------------------------------- UI atoms
  // A Phaser Graphics object re-tessellates its whole command list every
  // frame, and rounded corners mean arc tessellation. Anything that is on
  // screen DURING GAMEPLAY is therefore built from Rectangles instead, which
  // ride the normal quad batch. Graphics is still fine on the static menus.
  function plate(scene, x, y, w, h, fill, alpha, stroke, strokeAlpha) {
    var c = scene.add.container(x, y);
    c.add(scene.add.rectangle(0, 0, w, h, fill, alpha == null ? 0.9 : alpha).setOrigin(0, 0));
    if (stroke != null) {
      var sa = strokeAlpha == null ? 0.8 : strokeAlpha;
      c.add(scene.add.rectangle(0, 0, w, 1, stroke, sa).setOrigin(0, 0));
      c.add(scene.add.rectangle(0, h - 1, w, 1, stroke, sa).setOrigin(0, 0));
      c.add(scene.add.rectangle(0, 0, 1, h, stroke, sa).setOrigin(0, 0));
      c.add(scene.add.rectangle(w - 1, 0, 1, h, stroke, sa).setOrigin(0, 0));
    }
    return c;
  }

  // Rectangle-based button for the in-play HUD (see plate()).
  function flatButton(scene, x, y, w, h, text, onTap, opts) {
    var o = opts || {};
    var c = scene.add.container(x, y);
    c.add(scene.add.rectangle(0, 0, w, h, o.fill == null ? 0x14243c : o.fill, 0.95));
    c.add(scene.add.rectangle(0, -h / 2, w, 1, o.stroke == null ? 0x6ef6ff : o.stroke, 0.85));
    c.add(scene.add.rectangle(0, h / 2, w, 1, o.stroke == null ? 0x6ef6ff : o.stroke, 0.85));
    c.add(label(scene, 0, 0, text, o.size || 14, o.color || '#e8ffff', 'bold').setOrigin(0.5));
    c.setSize(w, h);
    c.setInteractive(new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h), Phaser.Geom.Rectangle.Contains);
    c.on('pointerdown', function (p, lx, ly, ev) {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      kit.audio.sfx('sfx_ui', { volume: 0.5 });
      onTap();
    });
    return c;
  }

  function panel(scene, x, y, w, h, opts) {
    var o = opts || {};
    var g = scene.add.graphics();
    g.fillStyle(o.fill == null ? 0x0c1830 : o.fill, o.alpha == null ? 0.86 : o.alpha);
    g.fillRoundedRect(x, y, w, h, o.radius == null ? 12 : o.radius);
    g.lineStyle(o.lw == null ? 1.5 : o.lw, o.stroke == null ? 0x3fa9c4 : o.stroke,
      o.strokeAlpha == null ? 0.7 : o.strokeAlpha);
    g.strokeRoundedRect(x, y, w, h, o.radius == null ? 12 : o.radius);
    return g;
  }

  function label(scene, x, y, text, size, color, weight) {
    return scene.add.text(x, y, text, {
      fontFamily: 'Verdana, Geneva, system-ui, sans-serif',
      fontSize: size + 'px',
      fontStyle: weight || 'normal',
      color: color || '#dff6ff'
    });
  }

  function setTextIfChanged(textObject, value) {
    var next = String(value);
    if (textObject.text !== next) textObject.setText(next);
    return textObject;
  }

  // Menu cards get a real width budget. Text is scaled down to the available
  // column rather than clipped under a price button or allowed to collide
  // with the next line at the narrow portrait breakpoint.
  function fitLabel(textObject, maxWidth, maxSize, minSize) {
    var size = maxSize || 13;
    var floor = minSize || 9;
    textObject.setFontSize(size + 'px');
    while (size > floor && textObject.width > maxWidth) {
      size -= 1;
      textObject.setFontSize(size + 'px');
    }
    return textObject;
  }

  // A tappable UI button drawn from primitives, with a press pop and a tick.
  function button(scene, x, y, w, h, text, onTap, opts) {
    var o = opts || {};
    var c = scene.add.container(x, y);
    var g = scene.add.graphics();
    var fill = o.fill == null ? 0x123a52 : o.fill;
    var stroke = o.stroke == null ? 0x6ef6ff : o.stroke;
    g.fillStyle(fill, o.alpha == null ? 0.95 : o.alpha);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 10);
    g.lineStyle(1.6, stroke, 0.9);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 10);
    c.add(g);
    var t = label(scene, 0, 0, text, o.size || 15, o.color || '#e8ffff', 'bold').setOrigin(0.5);
    c.add(t);
    c.setSize(w, h);
    c.label = t;
    if (o.disabled) { c.setAlpha(0.42); return c; }
    c.setInteractive(new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h), Phaser.Geom.Rectangle.Contains);
    c.on('pointerdown', function (p, lx, ly, ev) {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      kit.audio.sfx('sfx_ui', { volume: 0.5 });
      scene.tweens.add({ targets: c, scale: 0.94, duration: 70, yoyo: true, ease: 'Quad.easeOut' });
      onTap();
    });
    return c;
  }

  // =========================================================== Title scene
  var TitleScene = {
    key: 'title',

    create: function () {
      var self = this;
      var w = this.scale.width, h = this.scale.height;
      var top = Game.insets.top;
      this.sky = buildSky(this);
      this.cameras.main.setBackgroundColor('#050a1a');

      // A slow ambient interception loop behind the logo so the title screen
      // is never a still image.
      this.demo = this.add.particles(0, 0, 'p_spark', {
        lifespan: 900, speed: { min: 40, max: 220 }, scale: { start: 0.26, end: 0 },
        alpha: { start: 1, end: 0 }, rotate: { min: 0, max: 360 },
        blendMode: 'ADD', emitting: false, quantity: 12
      }).setDepth(20);
      this.demoRing = this.add.image(0, 0, 'atlas', 'ring').setDepth(19)
        .setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
      this.demoT = 0.9;

      // ---- logo block: the bespoke lockup, not a system-font word mark.
      var cy = h * 0.30 + top * 0.4;
      var glow = this.add.image(w / 2, cy - 4, 'disc').setDisplaySize(w * 0.95, 190)
        .setTint(0x2b7fb0).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD).setDepth(28);
      var logoW = Math.min(w * 0.86, 330);
      var logo = this.add.image(w / 2, cy, 'logo').setDepth(30)
        .setDisplaySize(logoW, logoW * (132 / 340));
      label(this, w / 2, cy + logoW * 0.24, 'HOLD THE SKY OVER SIX DISTRICTS', 12, '#8fd0e4')
        .setOrigin(0.5).setDepth(30);

      // Entrance: the lockup drops in on its own trajectory, the glow blooms
      // behind it, then it settles into a slow breathing loop.
      logo.setAlpha(0).setY(cy - 46);
      this.tweens.add({ targets: logo, alpha: 1, y: cy, duration: 640, ease: 'Back.easeOut' });
      this.tweens.add({ targets: glow, alpha: 0.30, duration: 900, delay: 180, ease: 'Cubic.easeOut' });
      this.tweens.add({ targets: logo, scale: logo.scale * 1.016, duration: 2600, yoyo: true,
        repeat: -1, delay: 700, ease: 'Sine.easeInOut' });

      // ---- progress readout
      var doneAll = profile.night > NIGHTS.length;
      var nightNo = Math.min(profile.night, NIGHTS.length);
      var statusY = h * 0.53;
      panel(this, w * 0.12, statusY - 26, w * 0.76, 62, { alpha: 0.55 }).setDepth(29);
      label(this, w / 2, statusY - 14,
        doneAll ? 'CAMPAIGN COMPLETE' : 'NIGHT ' + nightNo + '  ' + NIGHTS[nightNo - 1].name,
        13, doneAll ? CSS.green : CSS.amber, 'bold').setOrigin(0.5).setDepth(30);
      label(this, w * 0.5 - 78, statusY + 12, 'BEST', 12, CSS.dim).setOrigin(1, 0.5).setDepth(30);
      makeNumber(this, w * 0.5 - 72, statusY + 12, 15, PAL.ice, 0).setDepth(30)
        .setText(String(profile.best));
      label(this, w * 0.5 + 78, statusY + 12, 'SCRAP', 12, CSS.dim).setOrigin(0, 0.5).setDepth(30);
      makeNumber(this, w * 0.5 + 72, statusY + 12, 15, PAL.amber, 1).setDepth(30)
        .setText(String(profile.salvage));

      // ---- primary action: an authored CTA, not a blinking text line. A tap
      // anywhere outside the buttons deploys too, so the fastest path from
      // cold boot to gameplay is still a single touch.
      var cw = Math.min(268, w * 0.72), chh = 56, cyb = h * 0.645;
      var cta = this.add.container(w / 2, cyb).setDepth(31);
      var cg = this.add.graphics();
      cg.fillStyle(0x0d3a52, 0.96);
      cg.fillRoundedRect(-cw / 2, -chh / 2, cw, chh, 12);
      cg.fillStyle(0x6ef6ff, 0.12);
      cg.fillRoundedRect(-cw / 2, -chh / 2, cw, chh * 0.46, 12);
      cg.lineStyle(2, 0x6ef6ff, 0.95);
      cg.strokeRoundedRect(-cw / 2, -chh / 2, cw, chh, 12);
      cta.add(cg);
      cta.add(this.add.image(-cw / 2 + 30, 0, 'atlas', 'chev').setRotation(Math.PI / 2).setScale(0.8));
      cta.add(this.add.image(cw / 2 - 30, 0, 'atlas', 'chev').setRotation(Math.PI / 2).setScale(0.8));
      cta.add(label(this, 0, 0, 'DEPLOY', 22, '#eaffff', 'bold').setOrigin(0.5));
      // Light sweep across the plate: the CTA is never static.
      var sweep = this.add.rectangle(-cw / 2, 0, 26, chh - 6, 0x9ff8ff, 0.22).setBlendMode(Phaser.BlendModes.ADD);
      cta.add(sweep);
      this.tweens.add({ targets: sweep, x: cw / 2, duration: 1400, repeat: -1,
        repeatDelay: 1500, ease: 'Cubic.easeInOut' });
      this.tweens.add({ targets: cta, scale: 1.025, duration: 1100, yoyo: true, repeat: -1,
        ease: 'Sine.easeInOut' });
      cta.setSize(cw, chh);
      cta.setInteractive(new Phaser.Geom.Rectangle(-cw / 2, -chh / 2, cw, chh),
        Phaser.Geom.Rectangle.Contains);
      cta.on('pointerdown', function (p, lx, ly, ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        self.go('play');
      });
      cta.setAlpha(0).setY(cyb + 26);
      this.tweens.add({ targets: cta, alpha: 1, y: cyb, duration: 460, delay: 220,
        ease: 'Back.easeOut' });

      var by = h * 0.775, bw = Math.min(150, w * 0.40), bh = 44;
      var b1 = button(this, w / 2 - bw / 2 - 6, by, bw, bh, 'COMMAND', function () {
        self.go('command');
      }, { fill: 0x14243c }).setDepth(30);
      var b2 = button(this, w / 2 + bw / 2 + 6, by, bw, bh, 'SETTINGS', function () {
        openSettings();
      }, { fill: 0x14243c }).setDepth(30);
      [b1, b2].forEach(function (b, i) {
        b.setAlpha(0);
        self.tweens.add({ targets: b, alpha: 1, duration: 340, delay: 380 + i * 90 });
      });

      label(this, w / 2, h - 22 - Game.insets.bottom,
        'Tap the sky to intercept. Keys: arrows or WASD aim, space fires.',
        12, '#7fa6bb').setOrigin(0.5).setDepth(30);

      this.input.on('pointerdown', function () { self.go('play'); });
      this.input.keyboard.on('keydown-ENTER', function () { self.go('play'); });
      this.input.keyboard.on('keydown-SPACE', function () { self.go('play'); });

      this.started = false;
    },

    go: function (which) {
      var self = this;
      if (this.started) return;
      this.started = true;
      // The stems were decoded during boot, so this only starts playback.
      kit.audio.music('music_night', 900);
      kit.audio.sfx('sfx_ui');
      // Authored hand-off: a launch streak, a cyan wash and a fade, so the
      // storefront hands over to the night instead of cutting.
      this.demo.emitParticleAt(this.scale.width / 2, this.scale.height * 0.62, fxCount(14));
      if (flashOn()) this.cameras.main.flash(160, 110, 246, 255);
      this.cameras.main.fadeOut(260, 3, 8, 20);
      this.time.delayedCall(280, function () {
        if (which === 'command') self.scene.start('command');
        else self.scene.start('play', { night: Math.min(profile.night, NIGHTS.length), mode: 'campaign' });
      });
    },

    update: function (time, delta) {
      var dt = delta / 1000;
      this.sky.tick(dt, 1);
      var j = kit.juice.frame();
      this.cameras.main.setScroll(j.dx, j.dy);

      // Idle interception: a burst somewhere in the upper sky every ~2.6 s.
      this.demoT -= dt;
      if (this.demoT <= 0) {
        this.demoT = 2.0 + Math.random() * 1.6;
        var x = this.scale.width * (0.15 + Math.random() * 0.7);
        var y = this.scale.height * (0.10 + Math.random() * 0.30);
        this.demo.emitParticleAt(x, y, fxCount(12));
        this.demoRing.setPosition(x, y).setVisible(true).setAlpha(0.85).setScale(0.08);
        this.tweens.add({ targets: this.demoRing, scale: 0.7, alpha: 0, duration: 620,
          ease: 'Cubic.easeOut', onComplete: function (tw, tg) { tg[0].setVisible(false); } });
      }
    }
  };

  // ========================================================= Command scene
  // Night select plus the refit shop. Both live here so the player never has
  // to leave a screen to decide what to spend salvage on before a night.
  var CommandScene = {
    key: 'command',

    create: function () {
      var self = this;
      this.sky = buildSky(this, { dim: true });
      this.cameras.main.setBackgroundColor('#050a1a');
      this.tab = 'hangar';
      this.layer = this.add.container(0, 0).setDepth(40);
      this.buildChrome();
      this.buildTab();
      this.input.keyboard.on('keydown-ESC', function () { self.back(); });
    },

    back: function () { kit.audio.sfx('sfx_ui'); this.scene.start('title'); },

    buildChrome: function () {
      var self = this;
      var w = this.scale.width;
      var top = Game.insets.top + 10;
      panel(this, 0, -20, w, top + 120, { radius: 0, alpha: 0.72, stroke: 0x2c6f88 }).setDepth(38);
      label(this, 16, top + 6, 'COMMAND CENTER', 16, '#e9feff', 'bold').setDepth(41);
      label(this, w - 82, top + 3, 'SCRAP BANK', 10, CSS.dim).setOrigin(1, 0).setDepth(41);
      this.salvageNum = makeNumber(this, w - 82, top + 18, 17, PAL.amber, 1).setDepth(41)
        .setText(String(profile.salvage));
      button(this, w - 32, top + 24, 54, 28, 'BACK', function () { self.back(); },
        { fill: 0x14243c, size: 11 }).setDepth(41);

      // Tabs own a dedicated row below the header. Their hit rectangles are
      // above the page layer and never share a y-band with BACK or content.
      // This makes every tab switch deterministic on a 390px viewport.
      this.tabKeys = ['nights', 'hangar', 'loadout', 'style', 'refit'];
      this.tabNames = ['NIGHTS', 'HANGAR', 'LOADOUT', 'STYLE', 'REFIT'];
      this.tabBtns = [];
      var gap = 4, pad = 8, tabY = top + 78;
      var tabW = (w - pad * 2 - gap * (this.tabKeys.length - 1)) / this.tabKeys.length;
      for (var i = 0; i < this.tabKeys.length; i++) {
        (function (i) {
          var cx = pad + tabW / 2 + i * (tabW + gap);
          var b = button(self, cx, tabY, tabW, 30, self.tabNames[i], function () {
            self.setTab(self.tabKeys[i]);
          }, { size: 10, fill: 0x14243c });
          b.setDepth(90); // tab chrome is above every content interaction
          self.tabBtns.push(b);
        })(i);
      }
      this.tabBar = this.add.rectangle(pad + tabW / 2, tabY + 17, tabW, 3, PAL.cyan, 1).setDepth(91);
      this.tabW = tabW;
      this.tabY = tabY;
      this.paintTabs(true);
    },

    paintTabs: function (instant) {
      var at = this.tabKeys.indexOf(this.tab);
      if (at < 0) at = 0;
      for (var i = 0; i < this.tabBtns.length; i++) this.tabBtns[i].setAlpha(i === at ? 1 : 0.55);
      var x = 8 + this.tabW / 2 + at * (this.tabW + 4);
      if (instant) { this.tabBar.x = x; return; }
      this.tweens.killTweensOf(this.tabBar);
      this.tweens.add({ targets: this.tabBar, x: x, scaleX: 1, duration: 260, ease: 'Back.easeOut' });
      this.tweens.add({ targets: this.tabBar, scaleX: 1.35, duration: 130, yoyo: true });
    },

    setTab: function (t) {
      if (this.tab === t) return;
      this.tab = t;
      this.paintTabs();
      this.buildTab();
    },

    buildTab: function () {
      var self = this;
      this.layer.removeAll(true);
      if (this.tab === 'nights') this.buildNights();
      else if (this.tab === 'hangar') this.buildHangar();
      else if (this.tab === 'loadout') this.buildLoadout();
      else if (this.tab === 'style') this.buildStyle();
      else this.buildRefit();
      // Tab content slides in behind the underline sweep.
      this.layer.setAlpha(0);
      this.layer.x = this.tab === 'nights' ? -14 : 14;
      this.tweens.killTweensOf(this.layer);
      this.tweens.add({ targets: this.layer, alpha: 1, x: 0, duration: 240, ease: 'Cubic.easeOut' });
    },

    buildHangar: function () {
      var self = this;
      var w = this.scale.width, h = this.scale.height;
      var y = Game.insets.top + 126;
      var gap = 7;
      var rowH = clamp((h - y - 24 - gap * 5) / 6, 78, 101);
      this.layer.add(label(this, 16, y - 18, 'PERMANENT SYSTEMS', 11, CSS.cyan, 'bold'));
      for (var i = 0; i < HANGAR_UPGRADES.length; i++) {
        (function (i) {
          var u = HANGAR_UPGRADES[i];
          var lv = hangarLevel(u.key);
          var maxed = lv >= u.max;
          var cost = maxed ? 0 : hangarCost(u);
          var afford = !maxed && profile.salvage >= cost;
          var ry = y + i * (rowH + gap);
          var card = self.add.container(0, 0);
          var g = self.add.graphics();
          g.fillStyle(maxed ? 0x123c3c : 0x0d1e36, 0.96);
          g.fillRoundedRect(10, ry, w - 20, rowH, 10);
          g.fillStyle(maxed ? PAL.green : (afford ? PAL.cyan : PAL.steel), 0.9);
          g.fillRoundedRect(10, ry, 4, rowH, 2);
          g.lineStyle(1.4, maxed ? PAL.green : (afford ? 0x4bb6d4 : 0x2a4c60), 0.85);
          g.strokeRoundedRect(10, ry, w - 20, rowH, 10);
          card.add(g);
          var iconFrame = { output: 'blast', reload: 'speed', plating: 'shield', radar: 'rebuild',
            salvage: 'mag', squadron: 'resupply' }[u.key];
          card.add(self.add.image(38, ry + 29, 'atlas', 'ic_' + iconFrame)
            .setScale(0.78).setTint(maxed || afford ? PAL.cyan : PAL.steel).setAlpha(maxed || afford ? 1 : 0.62));
          var name = label(self, 60, ry + 9, u.name, 12, '#dff6ff', 'bold');
          fitLabel(name, w - 142, 12, 9);
          card.add(name);
          var effect = label(self, 60, ry + 27, 'TIER ' + lv + '  ' + (lv ? u.values[lv - 1] : 'ONLINE READY') +
            ' ' + u.short, 10, afford || maxed ? CSS.green : '#8bb2c4');
          fitLabel(effect, w - 142, 10, 8);
          card.add(effect);
          var pips = self.add.graphics();
          for (var p = 0; p < u.max; p++) {
            pips.fillStyle(p < lv ? PAL.cyan : 0x274a5e, 1);
            pips.fillRoundedRect(60 + p * 14, ry + rowH - 18, 10, 5, 2);
          }
          card.add(pips);
          if (maxed) {
            var maxText = label(self, w - 57, ry + rowH * 0.5, 'MAX', 11, CSS.green, 'bold').setOrigin(0.5);
            card.add(maxText);
          } else {
            var b = button(self, w - 57, ry + rowH * 0.5, 76, 30, String(cost), function () {
              self.buyHangar(u);
            }, { size: 12, fill: afford ? 0x145c46 : 0x2a2030,
              stroke: afford ? PAL.green : 0x5b4a5a, disabled: !afford });
            card.add(b);
          }
          self.layer.add(card);
        })(i);
      }
      this.layer.add(label(this, w / 2, Math.min(y + 6 * (rowH + gap) + 3, h - 22),
        '75% of each run result banks as command scrap.', 11, '#5d7c8f').setOrigin(0.5, 0));
    },

    buyHangar: function (u) {
      var lv = hangarLevel(u.key), cost = hangarCost(u);
      if (lv >= u.max || profile.salvage < cost) return;
      grantSalvage(-cost);
      profile.hangar.tiers[u.key] = lv + 1;
      persist();
      syncHangarDebug();
      kit.audio.sfx('sfx_buy');
      kit.juice.shake(4, 140);
      this.salvageNum.setText(String(profile.salvage)).setPop(1.28);
      this.tweens.addCounter({ from: 128, to: 100, duration: 260, ease: 'Back.easeOut',
        onUpdate: function (t) { this.salvageNum.setPop(t.getValue() / 100); }.bind(this) });
      this.buildTab();
    },

    buildLoadout: function () {
      var self = this;
      var w = this.scale.width, h = this.scale.height;
      var y = Game.insets.top + 128, gap = 8, cols = 2, pad = 10;
      var cw = (w - pad * 2 - gap) / cols;
      var ch = clamp((h - y - 30) / 4, 112, 132);
      this.layer.add(label(this, 16, y - 20, 'STARTING INTERCEPTOR', 11, CSS.cyan, 'bold'));
      this.layer.add(label(this, w - 16, y - 20, 'ENCOUNTERS PERSIST', 10, CSS.dim).setOrigin(1, 0));
      for (var i = 0; i < INTERCEPTORS.length; i++) {
        (function (i) {
          var d = INTERCEPTORS[i], seen = !!profile.hangar.seen[d.key];
          var cx = pad + (i % cols) * (cw + gap), cy = y + Math.floor(i / cols) * (ch + gap);
          var g = self.add.graphics();
          g.fillStyle(seen ? 0x0e2942 : 0x0a1424, seen ? 0.96 : 0.82);
          g.fillRoundedRect(cx, cy, cw, ch, 10);
          g.lineStyle(1.3, profile.hangar.equipped === d.key ? PAL.green : (seen ? 0x3b91af : 0x274156), 0.9);
          g.strokeRoundedRect(cx, cy, cw, ch, 10);
          self.layer.add(g);
          var icon = self.add.image(cx + 28, cy + 30, 'atlas', d.frame).setScale(0.44)
            .setTint(seen ? d.tint : 0x3c5262).setAlpha(seen ? 1 : 0.72)
            .setBlendMode(Phaser.BlendModes.ADD);
          self.layer.add(icon);
          var nm = label(self, cx + 52, cy + 14, d.name, 10, seen ? '#dff6ff' : '#587284', 'bold');
          fitLabel(nm, cw - 60, 10, 8);
          self.layer.add(nm);
          var desc = label(self, cx + 12, cy + 64, seen ? d.desc : 'SILHOUETTE SIGNAL', 9,
            seen ? '#8bb2c4' : '#587284');
          desc.setWordWrapWidth(cw - 24).setAlign('center');
          self.layer.add(desc);
          var lock = label(self, cx + cw / 2, cy + ch - 17,
            seen ? (profile.hangar.equipped === d.key ? 'EQUIPPED' : 'SELECT') : 'ENCOUNTER TO UNLOCK',
            9, profile.hangar.equipped === d.key ? CSS.green : (seen ? CSS.cyan : '#587284'), 'bold').setOrigin(0.5);
          fitLabel(lock, cw - 18, 9, 7);
          self.layer.add(lock);
          if (seen) {
            var z = self.add.zone(cx, cy, cw, ch).setOrigin(0, 0).setInteractive();
            z.on('pointerdown', function (p, lx, ly, ev) {
              if (ev && ev.stopPropagation) ev.stopPropagation();
              profile.hangar.equipped = d.key;
              persist();
              syncHangarDebug();
              kit.audio.sfx('sfx_ui');
              self.buildTab();
            });
            self.layer.add(z);
          }
        })(i);
      }
    },

    buildStyle: function () {
      var self = this;
      var w = this.scale.width, h = this.scale.height;
      var y = Game.insets.top + 132;
      this.layer.add(label(this, 16, y - 24, 'CITY SKYLINE PALETTE', 11, CSS.cyan, 'bold'));
      this.layer.add(label(this, 16, y - 5, 'Live preview applies to this command center and the next run.', 10, CSS.dim));
      for (var i = 0; i < SKY_STYLES.length; i++) {
        (function (i) {
          var st = SKY_STYLES[i], cy = y + i * 45, selected = profile.hangar.style.palette === st.key;
          var g = self.add.graphics();
          g.fillStyle(selected ? 0x153951 : 0x0d1e36, 0.96);
          g.fillRoundedRect(14, cy, w - 28, 36, 8);
          g.lineStyle(1.2, selected ? PAL.green : 0x2a536a, 0.9);
          g.strokeRoundedRect(14, cy, w - 28, 36, 8);
          self.layer.add(g);
          self.layer.add(self.add.rectangle(31, cy + 18, 22, 14, st.city, 0.9));
          self.layer.add(self.add.rectangle(55, cy + 18, 8, 14, st.accent, 1));
          var nm = label(self, 78, cy + 18, st.name, 11, selected ? CSS.green : CSS.ice, 'bold').setOrigin(0, 0.5);
          fitLabel(nm, w - 118, 11, 8);
          self.layer.add(nm);
          var z = self.add.zone(14, cy, w - 28, 36).setOrigin(0, 0).setInteractive();
          z.on('pointerdown', function (p, lx, ly, ev) {
            if (ev && ev.stopPropagation) ev.stopPropagation();
            profile.hangar.style.palette = st.key;
            persist();
            syncHangarDebug();
            self.sky.setStyle(st.key);
            self.buildTab();
          });
          self.layer.add(z);
        })(i);
      }
      var ty = y + SKY_STYLES.length * 45 + 22;
      this.layer.add(label(this, 16, ty, 'INTERCEPTOR TRAIL COLOR', 11, CSS.cyan, 'bold'));
      var tw = (w - 32 - 10) / 2;
      for (var j = 0; j < TRAIL_STYLES.length; j++) {
        (function (j) {
          var tr = TRAIL_STYLES[j], cx = 16 + (j % 2) * (tw + 10), cy = ty + 22 + Math.floor(j / 2) * 34;
          var selected = profile.hangar.style.trail === tr.key;
          var b = button(self, cx + tw / 2, cy + 14, tw, 28, tr.name, function () {
            profile.hangar.style.trail = tr.key;
            persist();
            syncHangarDebug();
            self.buildTab();
          }, { size: 9, fill: selected ? 0x145c46 : 0x14243c, stroke: tr.tint, color: '#e8ffff' });
          b.setDepth(45);
          self.layer.add(b);
        })(j);
      }
      this.layer.add(label(this, w / 2, h - 28, 'Cosmetic only. Every theme keeps the same combat rules.', 10, '#5d7c8f').setOrigin(0.5));
    },

    buildNights: function () {
      var self = this;
      var w = this.scale.width, h = this.scale.height;
      var y0 = Game.insets.top + 116;
      var cols = 3;
      var pad = 10;
      var cw = (w - pad * (cols + 1)) / cols;
      var ch = Math.min(76, (h - y0 - 120) / 4 - pad);
      for (var i = 0; i < NIGHTS.length; i++) {
        (function (i) {
          var n = NIGHTS[i];
          var cx = pad + (i % cols) * (cw + pad);
          var cy = y0 + Math.floor(i / cols) * (ch + pad);
          var unlocked = (i + 1) <= profile.night;
          var cleared = (i + 1) < profile.night;
          var g = self.add.graphics();
          g.fillStyle(unlocked ? (n.boss ? 0x2a1440 : 0x0e2440) : 0x0a1424, unlocked ? 0.94 : 0.6);
          g.fillRoundedRect(cx, cy, cw, ch, 10);
          g.lineStyle(1.6, cleared ? 0x8ff5d2 : (unlocked ? 0x6ef6ff : 0x2b4358), unlocked ? 0.9 : 0.5);
          g.strokeRoundedRect(cx, cy, cw, ch, 10);
          self.layer.add(g);
          self.layer.add(label(self, cx + cw / 2, cy + 8,
            unlocked ? 'NIGHT ' + (i + 1) : 'LOCKED', 12,
            cleared ? '#8ff5d2' : (unlocked ? '#ffd978' : '#4d6a7d'), 'bold').setOrigin(0.5, 0));
          var nm = label(self, cx + cw / 2, cy + 26, unlocked ? n.name : '- - -', 12,
            unlocked ? '#dff6ff' : '#3d5668', 'bold').setOrigin(0.5, 0);
          nm.setWordWrapWidth(cw - 8);
          nm.setAlign('center');
          self.layer.add(nm);
          if (unlocked) {
            self.layer.add(label(self, cx + cw / 2, cy + ch - 18,
              n.boss ? 'FINALE' : n.volleys + ' VOLLEYS', 12, '#79a6bd').setOrigin(0.5, 0));
            var z = self.add.zone(cx, cy, cw, ch).setOrigin(0, 0).setInteractive();
            z.on('pointerdown', function () {
              kit.audio.sfx('sfx_ui');
              self.scene.start('play', { night: i + 1, mode: 'campaign' });
            });
            self.layer.add(z);
          }
        })(i);
      }
      var sy = y0 + Math.ceil(NIGHTS.length / cols) * (ch + pad) + 6;
      if (profile.night > NIGHTS.length) {
        this.layer.add(button(this, w / 2, sy + 24, Math.min(240, w * 0.7), 42, 'SIEGE MODE', function () {
          self.scene.start('play', { night: 1, mode: 'siege' });
        }, { fill: 0x2a1440, stroke: 0xec9bff }));
        this.layer.add(label(this, w / 2, sy + 54,
          'Endless escalating waves. Best ' + profile.siege, 12, '#b48fd0').setOrigin(0.5, 0));
      } else {
        this.layer.add(label(this, w / 2, sy + 18,
          'Clear night 12 to unlock Siege Mode.', 12, '#5d7c8f').setOrigin(0.5, 0));
      }
    },

    // Next-level effect, in the player's units, so a card shows what the
    // purchase actually buys instead of a bare price (fix round 1).
    statDelta: function (key, lv) {
      if (key === 'mag') return [String(BASE_AMMO + lv), String(BASE_AMMO + lv + 1), 'ROUNDS'];
      if (key === 'blast') return [Math.round(BLAST_BASE_R * (1 + 0.09 * lv)) + '',
        Math.round(BLAST_BASE_R * (1 + 0.09 * (lv + 1))) + '', 'RADIUS'];
      if (key === 'speed') return [Math.round(SHOT_SPEED * (1 + 0.12 * lv)) + '',
        Math.round(SHOT_SPEED * (1 + 0.12 * (lv + 1))) + '', 'SPEED'];
      return [String(lv), String(lv + 1), 'USES PER NIGHT'];
    },

    buildRefit: function () {
      var self = this;
      var w = this.scale.width;
      var y = Game.insets.top + 118;
      var rowH = Math.min(74, (this.scale.height - y - 40) / UPGRADES.length);
      this.cards = [];
      for (var i = 0; i < UPGRADES.length; i++) {
        (function (i) {
          var u = UPGRADES[i];
          var lv = upLevel(u.key);
          var maxed = lv >= u.max;
          var cost = maxed ? 0 : upCost(u);
          var afford = !maxed && profile.salvage >= cost;
          var ry = y + i * rowH;
          var card = self.add.container(0, 0);
          var g = self.add.graphics();
          g.fillStyle(0x0d1e36, 0.94);
          g.fillRoundedRect(10, ry, w - 20, rowH - 8, 10);
          // Left accent bar keyed to the track, so the six cards are not six
          // identical rectangles.
          g.fillStyle(maxed ? PAL.green : (afford ? PAL.cyan : PAL.steel), afford || maxed ? 0.9 : 0.5);
          g.fillRoundedRect(10, ry, 4, rowH - 8, 2);
          g.lineStyle(1.4, maxed ? PAL.green : (afford ? 0x4bb6d4 : 0x2a4c60), 0.85);
          g.strokeRoundedRect(10, ry, w - 20, rowH - 8, 10);
          card.add(g);
          // Authored icon per track.
          card.add(self.add.image(38, ry + (rowH - 8) / 2, 'atlas', 'ic_' + u.key)
            .setScale(0.92).setAlpha(maxed || afford ? 1 : 0.5));
          var refitName = label(self, 62, ry + 8, u.name, 13, '#dff6ff', 'bold');
          fitLabel(refitName, w - 150, 13, 9);
          card.add(refitName);
          var refitDesc = label(self, 62, ry + 26, u.desc, 11, '#8bb2c4');
          fitLabel(refitDesc, w - 150, 11, 8);
          card.add(refitDesc);
          // Level pips.
          var pg = self.add.graphics();
          for (var p = 0; p < u.max; p++) {
            pg.fillStyle(p < lv ? PAL.cyan : 0x274a5e, 1);
            pg.fillRoundedRect(62 + p * 14, ry + rowH - 26, 10, 5, 2);
          }
          card.add(pg);
          // Stat visualisation: current -> next.
          if (!maxed) {
            var d = self.statDelta(u.key, lv);
            card.add(label(self, 62 + u.max * 14 + 10, ry + rowH - 30, d[0] + ' > ' + d[1] + ' ' + d[2],
              12, afford ? CSS.green : '#6d8ea1'));
          }
          var bx = w - 62;
          if (maxed) {
            card.add(label(self, bx, ry + (rowH - 8) / 2, 'MAX', 13, CSS.green, 'bold').setOrigin(0.5));
          } else {
            var b = button(self, bx, ry + (rowH - 8) / 2, 84, 32,
              String(cost), function () { self.buy(u, card, bx, ry + (rowH - 8) / 2); },
              { size: 13, fill: afford ? 0x145c46 : 0x2a2030,
                stroke: afford ? PAL.green : 0x5b4a5a, disabled: !afford });
            card.add(b);
          }
          self.layer.add(card);
          self.cards.push(card);
        })(i);
      }
      this.layer.add(label(this, w / 2, y + UPGRADES.length * rowH + 4,
        'Salvage is earned every night. Replays pay less.', 12, '#5d7c8f').setOrigin(0.5, 0));
    },

    buy: function (u, card, bx, by) {
      var self = this;
      var lv = upLevel(u.key);
      if (lv >= u.max) return;
      var cost = upCost(u);
      if (profile.salvage < cost) return;
      grantSalvage(-cost);
      profile.up[u.key] = lv + 1;
      persist();
      kit.audio.sfx('sfx_buy');
      kit.juice.shake(4, 140);

      // Purchase beat: the salvage counter pops down, the card flashes, and
      // the installed level is celebrated before the tab rebuilds.
      this.salvageNum.setText(String(profile.salvage)).setPop(1.35);
      this.tweens.addCounter({ from: 135, to: 100, duration: 260, ease: 'Back.easeOut',
        onUpdate: function (t) { self.salvageNum.setPop(t.getValue() / 100); } });
      if (card) {
        var fl = this.add.image(bx, by, 'disc').setDisplaySize(160, 120).setTint(PAL.green)
          .setAlpha(0.8).setBlendMode(Phaser.BlendModes.ADD).setDepth(60);
        this.tweens.add({ targets: fl, alpha: 0, scale: fl.scale * 1.6, duration: 420,
          ease: 'Cubic.easeOut', onComplete: function () { fl.destroy(); } });
        var burst = this.add.particles(bx, by, 'p_spark', {
          lifespan: 520, speed: { min: 40, max: 170 }, scale: { start: 0.24, end: 0 },
          alpha: { start: 1, end: 0 }, rotate: { min: 0, max: 360 }, blendMode: 'ADD',
          emitting: false, tint: PAL.green
        }).setDepth(61);
        burst.explode(fxCount(14));
        this.time.delayedCall(700, function () { burst.destroy(); });
      }
      this.time.delayedCall(260, function () { self.buildTab(); });
    },

    update: function (time, delta) {
      this.sky.tick(delta / 1000, 0.4);
      var j = kit.juice.frame();
      this.cameras.main.setScroll(j.dx, j.dy);
    }
  };

  // ============================================================ Play scene
  var PlayScene = {
    key: 'play',

    init: function (data) {
      this.mode = (data && data.mode) || 'campaign';
      this.nightIndex = clamp((data && data.night) || 1, 1, NIGHTS.length);
      Game.play = this;
    },

    // ------------------------------------------------------------- create
    create: function () {
      var self = this;
      var w = this.scale.width, h = this.scale.height;
      this.W = w; this.H = h;
      this.cameras.main.setBackgroundColor('#050a1a');

      this.night = NIGHTS[this.nightIndex - 1];
      this.mod = this.mode === 'siege' ? null : this.night.mod;
      this.sky = buildSky(this, { grade: this.gradeKey() });

      this.baseY = h - clamp(h * 0.09, 48, 72);
      this.aimMaxY = h * AIM_BOTTOM_FRAC;
      this.blastSeq = 0;

      this.buildWorld();
      this.buildPools();
      this.buildFx();
      this.buildHud();
      this.bindInput();

      this.resetNight();

      // Interactive first-run tutorial, night one only.
      this.tut = null;
      if (!profile.tut && this.mode === 'campaign' && this.nightIndex === 1) this.startTutorial();

      // RESIZE: the scene used to capture W/H/baseY/aim limits once at create
      // and keep them forever, so a rotate or a browser-chrome height change
      // left the whole world laid out for a viewport that no longer existed
      // (fix round 1, code + art review).
      this.onResize = function (gameSize) { self.relayout(gameSize.width, gameSize.height); };
      this.scale.on('resize', this.onResize);

      this.events.on('shutdown', function () {
        self.input.keyboard.removeAllListeners();
        self.scale.off('resize', self.onResize);
        // The blur closure used to be added on every scene create and removed
        // never, so every retry leaked another listener (fix round 1).
        window.removeEventListener('blur', self.clearQueued);
        if (Game.play === self) Game.play = null;
      });
    },

    // The night's visual grade: modifiers, the boss and the late campaign all
    // get their own sky rather than only their own rules.
    gradeKey: function () {
      if (this.mode === 'siege') return 'late';
      if (this.night.boss) return 'storm';
      if (this.mod === 'blackout') return 'blackout';
      if (this.mod === 'wind') return 'wind';
      if (this.mod === 'barrage') return 'barrage';
      return this.nightIndex >= 9 ? 'late' : 'clear';
    },

    // ------------------------------------------------------------- resize
    relayout: function (w, h) {
      var i;
      if (!w || !h || (w === this.W && h === this.H)) return;
      this.W = w; this.H = h;
      this.baseY = h - clamp(h * 0.09, 48, 72);
      this.aimMaxY = h * AIM_BOTTOM_FRAC;
      this.canvasRect = this.game.canvas.getBoundingClientRect();
      this.sky.resize(w, h);

      this.ground.setSize(w, this.H - this.baseY + 30).setPosition(0, this.baseY - 16);
      this.groundLine.setSize(w, 2).setPosition(0, this.baseY + 13);
      this.groundGlow.setPosition(w / 2, this.baseY + 10).setDisplaySize(w * 1.3, 120);

      var dScale = clamp(w * 0.145 / 66, 0.52, 1.0);
      for (i = 0; i < this.districts.length; i++) {
        var d = this.districts[i];
        d.x = w * DISTRICT_XS[i];
        d.y = this.baseY + 16;
        d.spr.setPosition(d.x, d.y).setScale(dScale);
        d.plinth.setPosition(d.x, d.y + 2).setScale(dScale);
        d.shadow.setPosition(d.x, d.y + 4).setDisplaySize(66 * dScale * 1.5, 16 * dScale);
        d.shield.setPosition(d.x, this.baseY + 18).setScale(dScale * 0.92);
        d.halfW = d.spr.displayWidth * 0.5;
      }
      var bScale = clamp(w * 0.135 / 56, 0.55, 1.0);
      for (i = 0; i < this.batteries.length; i++) {
        var b = this.batteries[i];
        b.x = w * BATTERY_XS[i];
        b.y = this.baseY + 6;
        b.scale = bScale;
        b.base.setPosition(b.x, this.baseY + 18).setScale(bScale);
        b.barrel.setScale(bScale);
        b.flash.setScale(bScale * 0.9);
        b.ammo0.setPosition(b.x - 13, this.baseY + 26);
      }
      this.vignette.setPosition(w / 2, h / 2).setDisplaySize(w * 1.35, h * 1.35);
      this.flashPlate.setPosition(w / 2, h / 2).setSize(w, h);
      this.boss.spr.setScale(clamp(w * 0.62 / 130, 0.5, 1.05));
      this.boss.portX = this.boss.spr.displayWidth * 0.5 * 0.62;
      for (i = 0; i < this.districts.length; i++) {
        this.districts[i].shieldHi.setPosition(this.districts[i].x, this.baseY + 4)
          .setScale(dScale * 0.9);
      }
      this.layoutHud();
      this.setAim(this.aimX, this.aimY);
      this.hudCache.score = -1; this.hudCache.districts = -1;
      this.hudCache.volley = -1; this.hudCache.combo = -1; this.hudCache.best = -1;
      this.hudCache.strike = -1;
    },

    // ------------------------------------------------------- world layout
    buildWorld: function () {
      var w = this.W;
      var i;

      // AUTHORED FOREGROUND. The lower playfield used to be one flat
      // rectangle, which read as greybox next to the skyline. It is now a
      // rooftop layer lit from the city below, a horizon rim light and a
      // reflected glow pool, with every district standing on a lit plinth and
      // casting a contact shadow (fix round 1, art review).
      this.ground = this.add.tileSprite(0, this.baseY - 16, w, this.H - this.baseY + 30, 'ground')
        .setOrigin(0, 0).setDepth(4);
      this.groundGlow = this.add.image(w / 2, this.baseY + 10, 'disc')
        .setDisplaySize(w * 1.3, 120).setTint(stylePalette().city).setAlpha(0.22)
        .setBlendMode(Phaser.BlendModes.ADD).setDepth(5);
      this.groundLine = this.add.rectangle(0, this.baseY + 13, w, 2, stylePalette().accent, 0.55)
        .setOrigin(0, 0).setDepth(7);

      var dScale = clamp(w * 0.145 / 66, 0.52, 1.0);
      this.districts = [];
      var faces = ['a', 'b', 'c'];
      for (i = 0; i < 6; i++) {
        var dx = w * DISTRICT_XS[i];
        var face = faces[i % 3];
        var shadow = this.add.image(dx, this.baseY + 20, 'disc')
          .setDisplaySize(66 * dScale * 1.5, 16 * dScale).setTint(0x000000)
          .setAlpha(0.45).setDepth(5);
        var plinth = this.add.image(dx, this.baseY + 18, 'atlas', 'plinth')
          .setOrigin(0.5, 1).setScale(dScale).setDepth(6);
        var spr = this.add.image(dx, this.baseY + 16, 'atlas', 'dist_' + face)
          .setOrigin(0.5, 1).setScale(dScale).setDepth(6);
        var shield = this.add.image(dx, this.baseY + 18, 'atlas', 'shield')
          .setOrigin(0.5, 1).setScale(dScale * 0.92).setDepth(8)
          .setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setVisible(false);
        var shieldHi = this.add.image(dx, this.baseY + 4, 'atlas', 'shield_hi')
          .setOrigin(0.5, 1).setScale(dScale * 0.9).setDepth(9)
          .setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setVisible(false);
        this.districts.push({
          x: dx, y: this.baseY + 16, alive: true, spr: spr, shield: shield,
          shieldHi: shieldHi, shieldT: 0, plinth: plinth, shadow: shadow,
          face: face, state: 0, halfW: spr.displayWidth * 0.5,
          phase: i * 0.7, bob: 0, fireT: 0, maxHp: 1, hp: 1
        });
      }

      var bScale = clamp(w * 0.135 / 56, 0.55, 1.0);
      this.batteries = [];
      for (i = 0; i < 3; i++) {
        var bx = w * BATTERY_XS[i];
        var barrel = this.add.image(bx, this.baseY + 6, 'atlas', 'barrel')
          .setOrigin(0.5, 1).setScale(bScale).setDepth(8);
        var base = this.add.image(bx, this.baseY + 18, 'atlas', 'turret_idle')
          .setOrigin(0.5, 1).setScale(bScale).setDepth(9);
        var flash = this.add.sprite(bx, this.baseY - 24, 'atlas', 'flash1')
          .setScale(bScale * 0.9).setDepth(11).setVisible(false)
          .setBlendMode(Phaser.BlendModes.ADD);
        var ammo0 = makeNumber(this, bx - 13, this.baseY + 26, 13, 0xb7ecff, 0).setDepth(12);
        this.batteries.push({
          x: bx, y: this.baseY + 6, ammo: BASE_AMMO, cap: BASE_AMMO, alive: true,
          base: base, barrel: barrel, flash: flash, ammo0: ammo0, ammoShown: -1,
          state: 'idle', stateShown: '', aimA: 0, aimTarget: 0,
          recoil: 0, recoilV: 0, chargeT: 0, fireLock: 0, scale: bScale
        });
      }

      // Crosshair.
      this.reticle = this.add.image(this.W / 2, this.H * 0.33, 'atlas', 'crosshair')
        .setDepth(70).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.9);
      this.reticleSpin = 0;

      // Damage vignette.
      this.vignette = this.add.image(this.W / 2, this.H / 2, 'disc')
        .setDisplaySize(this.W * 1.35, this.H * 1.35).setTint(0xff3050)
        .setAlpha(0).setDepth(150).setScrollFactor(0)
        .setBlendMode(Phaser.BlendModes.ADD);

      // Full-screen flash plate for big detonations.
      this.flashPlate = this.add.rectangle(this.W / 2, this.H / 2, this.W, this.H, 0xffffff)
        .setAlpha(0).setDepth(151).setScrollFactor(0).setBlendMode(Phaser.BlendModes.ADD);

      // One pooled spectacle lane for the biggest beats. The banner is 60%
      // of the viewport, the rings and edge washes are additive, and the
      // state gate below refuses a second full-screen beat until this one has
      // finished.
      this.spectacle = { active: false, t: 0, duration: 1.08, kind: '', x: 0, y: 0, color: PAL.cyan };
      var sw = Math.min(this.W * 0.60, 320);
      this.specWash = [
        this.add.rectangle(this.W / 2, 0, this.W, 18, PAL.cyan, 0).setOrigin(0.5, 0)
          .setDepth(176).setScrollFactor(0).setBlendMode(Phaser.BlendModes.ADD),
        this.add.rectangle(this.W / 2, this.H, this.W, 18, PAL.cyan, 0).setOrigin(0.5, 1)
          .setDepth(176).setScrollFactor(0).setBlendMode(Phaser.BlendModes.ADD),
        this.add.rectangle(0, this.H / 2, 18, this.H, PAL.cyan, 0).setOrigin(0, 0.5)
          .setDepth(176).setScrollFactor(0).setBlendMode(Phaser.BlendModes.ADD),
        this.add.rectangle(this.W, this.H / 2, 18, this.H, PAL.cyan, 0).setOrigin(1, 0.5)
          .setDepth(176).setScrollFactor(0).setBlendMode(Phaser.BlendModes.ADD)
      ];
      this.specRing = this.add.image(0, 0, 'atlas', 'ring').setDepth(177).setScrollFactor(0)
        .setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
      this.specRing2 = this.add.image(0, 0, 'atlas', 'ring').setDepth(177).setScrollFactor(0)
        .setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
      this.specBanner = this.add.container(this.W / 2, this.H * 0.34).setDepth(178).setScrollFactor(0)
        .setVisible(false);
      this.specBanner.add(this.add.rectangle(0, 0, sw, 76, 0x071426, 0.9));
      this.specBanner.add(this.add.rectangle(0, -38, sw, 2, PAL.cyan, 0.95));
      this.specBanner.add(this.add.rectangle(0, 38, sw, 2, PAL.cyan, 0.95));
      this.specBanner.add(this.add.rectangle(-sw / 2, 0, 2, 76, PAL.cyan, 0.72));
      this.specBanner.add(this.add.rectangle(sw / 2, 0, 2, 76, PAL.cyan, 0.72));
      this.specBannerT1 = label(this, 0, -13, '', 19, '#e8ffff', 'bold').setOrigin(0.5);
      this.specBannerT2 = label(this, 0, 14, '', 10, '#8fd0e4').setOrigin(0.5);
      fitLabel(this.specBannerT1, sw - 24, 19, 11);
      fitLabel(this.specBannerT2, sw - 24, 10, 8);
      this.specBanner.add(this.specBannerT1);
      this.specBanner.add(this.specBannerT2);
      this.specZoom = 0;

      // Boss, hidden until night twelve calls it.
      this.boss = {
        active: false, spr: null, hp: 0, maxHp: 0, x: 0, y: 0, phase: 0,
        fireT: 0, hitCool: 0, drift: 0, entering: false
      };
      this.boss.spr = this.add.image(this.W / 2, -200, 'atlas', 'obelisk')
        .setDepth(30).setVisible(false).setScale(clamp(this.W * 0.62 / 130, 0.5, 1.05));
      this.bossGlow = this.add.image(this.W / 2, -200, 'disc').setDepth(29)
        .setTint(0xd06ff0).setAlpha(0).setDisplaySize(280, 280)
        .setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
      // PORT TELEGRAPHS. Night twelve used to give no warning that the Obelisk
      // was about to open its ports: the volley simply appeared. Each port now
      // charges a warning beam down the playfield for the last half second
      // before it fires, so the finale has its own attack language and the
      // player can read and answer it (fix round 1, art review).
      this.bossBeams = [];
      for (i = 0; i < 2; i++) {
        this.bossBeams.push(this.add.image(0, 0, 'atlas', 'beam').setOrigin(0.5, 0)
          .setDepth(28).setVisible(false).setBlendMode(Phaser.BlendModes.ADD)
          .setTint(0xff8ad0));
      }

      // Strike Wing owns one pooled lane and one bomber silhouette. The lane
      // is telegraphed before the sweep so the instant clear still reads as a
      // decision rather than an invisible rules shortcut.
      this.strikeLane = this.add.rectangle(0, 0, w, 46, 0xffc36e, 0.12)
        .setOrigin(0.5, 0.5).setDepth(25).setVisible(false)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.strikeEdge = this.add.rectangle(0, 0, w, 2, 0xfff0b0, 0.8)
        .setOrigin(0.5, 0.5).setDepth(26).setVisible(false)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.strikeShip = this.add.image(-80, 0, 'atlas', 'cruiser')
        .setDepth(27).setVisible(false).setTint(0xffd978)
        .setBlendMode(Phaser.BlendModes.ADD).setScale(1.2);
    },

    // ------------------------------------------------------------- pools
    // Pool factories. Each one builds exactly one entry, so the same function
    // serves the initial fill and every later on-demand growth step.
    newThreat: function () {
      return {
        alive: false, type: 'shard', x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0,
        district: null, speed: 0, dist: 0, total: 1, splitAt: 1, split: false,
        dodge: 0, hp: 1, wob: 0, trailT: 0, trailN: 0, hitFlash: 0, lastBlast: 0,
        imm: 0, rot: 0, empT: 0, burnT: 0, burnTick: 0, warnT: 0, introT: 0,
        warn: this.add.image(0, 0, 'atlas', 'ring').setDepth(38).setVisible(false)
          .setBlendMode(Phaser.BlendModes.ADD),
        spr: this.add.image(0, 0, 'atlas', 'shard').setDepth(40).setVisible(false)
      };
    },
    newShot: function () {
      return {
        alive: false, sx: 0, sy: 0, tx: 0, ty: 0, x: 0, y: 0, t: 0, speed: SHOT_SPEED,
        bat: null, interceptor: 'standard-bolt', escort: false, seeker: false, trailT: 0,
        spr: this.add.image(0, 0, 'p_ember').setDepth(44).setVisible(false)
          .setBlendMode(Phaser.BlendModes.ADD).setTint(0xd9fdff).setScale(0.5)
      };
    },
    // Each blast owns its whole staged bloom: a hard core flash, a fireball
    // that overshoots and settles, and an expanding shock ring. Pooled, so
    // the timeline costs no allocations (fix round 1, art review).
    newBlast: function () {
      return {
        alive: false, id: 0, x: 0, y: 0, r: 0, maxR: 0, age: 0, duration: 1, opacity: 1,
        interceptor: 'standard-bolt', effect: '', color: 0xd9fdff, damage: 1, hitBoss: false,
        smoke1: false, smoke2: false,
        flash: this.add.image(0, 0, 'p_fire').setDepth(48).setVisible(false)
          .setBlendMode(Phaser.BlendModes.ADD),
        core: this.add.image(0, 0, 'p_fire').setDepth(46).setVisible(false)
          .setBlendMode(Phaser.BlendModes.ADD),
        ring: this.add.image(0, 0, 'atlas', 'ring').setDepth(47).setVisible(false)
          .setBlendMode(Phaser.BlendModes.ADD)
      };
    },
    newPickup: function () {
      return {
        alive: false, category: 'power', kind: '', tide: false, x: 0, y: 0,
        targetY: 0, vx: 0, vy: 0, life: 0, age: 0, bob: 0, magnetT: 0,
        magnetX: 0, magnetY: 0,
        spr: this.add.image(0, 0, 'atlas', 'ic_shield').setDepth(64)
          .setBlendMode(Phaser.BlendModes.ADD).setVisible(false),
        halo: this.add.image(0, 0, 'disc').setDepth(63).setVisible(false)
          .setBlendMode(Phaser.BlendModes.ADD),
        ring: this.add.image(0, 0, 'atlas', 'ring').setDepth(62).setVisible(false)
          .setBlendMode(Phaser.BlendModes.ADD),
        beacon: this.add.rectangle(0, 0, 7, 104, 0x6ef6ff, 0.42)
          .setDepth(61).setVisible(false).setBlendMode(Phaser.BlendModes.ADD),
        parachute: this.add.image(0, 0, 'atlas', 'pod').setDepth(65).setVisible(false)
          .setTint(0xd9fdff).setScale(0.55)
      };
    },
    newEscort: function () {
      return {
        alive: false, kind: 'wing', x: 0, y: 0, tx: 0, ty: 0, fireT: 0, life: 0,
        spr: this.add.image(0, 0, 'atlas', 'streak').setDepth(37).setVisible(false)
          .setBlendMode(Phaser.BlendModes.ADD),
        halo: this.add.image(0, 0, 'disc').setDepth(36).setVisible(false)
          .setBlendMode(Phaser.BlendModes.ADD)
      };
    },
    newLineFx: function () {
      return {
        alive: false, age: 0, life: 0.22, x: 0, y: 0, len: 0,
        spr: this.add.image(0, 0, 'atlas', 'beam').setDepth(45).setVisible(false)
          .setOrigin(0.5, 0.5).setBlendMode(Phaser.BlendModes.ADD)
      };
    },
    // TRAIL RIBBONS. Interceptors and threats used to drop an unrotated
    // round blob every 40 ms. Each entity now lays down velocity-aligned
    // tapered ribbon segments, tinted to its family, that shrink and fade
    // along their own length (fix round 1, art review).
    newRibbon: function () {
      return {
        alive: false, age: 0, life: 0.34, len: 20, wide: 1, a0: 0.9,
        spr: this.add.image(0, 0, 'p_ribbon').setOrigin(1, 0.5).setDepth(42)
          .setVisible(false).setBlendMode(Phaser.BlendModes.ADD)
      };
    },
    // FEEL GATE: a Phaser Text re-renders its backing canvas and re-uploads a
    // GPU texture on EVERY setText, and the score popup fired on every single
    // kill. That upload is one of the worst things you can do on a throttled
    // CPU and it was landing dozens of times a volley. Numeric popups - which
    // is nearly all of them - are now bitmap numerals from the bundled digits
    // face and cost nothing but a few quad positions. The handful of worded
    // callouts a night still use Text (fix round 1, feel gate).
    newPop: function () {
      return {
        alive: false, age: 0, vy: 0, useNum: false,
        n: makeNumber(this, 0, 0, 15, 0xffffff, 0.5).setDepth(80).setVisible(false),
        t: label(this, 0, 0, '', 13, '#ffffff', 'bold').setOrigin(0.5).setDepth(80).setVisible(false)
      };
    },

    // Take a free entry, growing the pool by one if every entry is live and
    // the ceiling has not been reached. Returns null only at the ceiling, so
    // every caller's overflow policy still applies.
    poolTake: function (arr, max, factory) {
      for (var i = 0; i < arr.length; i++) if (!arr[i].alive) return arr[i];
      if (arr.length >= max) return null;
      var made = factory.call(this);
      arr.push(made);
      return made;
    },

    fill: function (max, n, factory) {
      var a = [];
      for (var i = 0; i < Math.min(n, max); i++) a.push(factory.call(this));
      return a;
    },

    buildPools: function () {
      this.threats = this.fill(MAX_THREATS, INIT_THREATS, this.newThreat);
      this.shots = this.fill(MAX_SHOTS, INIT_SHOTS, this.newShot);
      this.blasts = this.fill(MAX_BLASTS, INIT_BLASTS, this.newBlast);
      this.ribbons = this.fill(MAX_RIBBONS, INIT_RIBBONS, this.newRibbon);
      this.ribbonNext = 0;
      this.pops = this.fill(MAX_POPS, INIT_POPS, this.newPop);
      this.pickups = this.fill(MAX_PICKUPS, 6, this.newPickup);
      this.escorts = this.fill(MAX_ESCORTS, MAX_ESCORTS, this.newEscort);
      this.lineFx = this.fill(MAX_LINE_FX, 2, this.newLineFx);
      this.lineFxNext = 0;

      // Debug records are a separate view pool. They are never assigned to
      // `this.pickups`, `this.shots`, or any other live simulation array.
      this.debugPickupRecords = [];
      for (var i = 0; i < MAX_PICKUPS; i++) this.debugPickupRecords.push({ type: '', x: 0, y: 0 });
      this.debugState = SC_DEBUG_STATE;
      this.debugState.livePickups = [];
      if (typeof window !== 'undefined') window.__sc = { state: this.debugState };
    },

    // -------------------------------------------------- particle systems
    // Seven pooled emitters. Every one of them is a member of the same
    // family: additive, soft-edged, colour-ramped from the threat or
    // interceptor palette. Nothing here allocates during play.
    // Seven pooled emitters plus the ribbon pool and the ambient ash. Every
    // texture in the family now comes from the same core-plus-halo generator,
    // so a tinted particle always keeps a hot filament and reads as neon; the
    // shapes are directional wherever the motion is (needle shrapnel,
    // tapered ribbons, angular debris) and smoke is the one NON-additive
    // member so it occludes instead of glowing (fix round 1, art review).
    buildFx: function () {
      this.fx = {};
      // 1. interceptor exhaust flame (the ribbon carries the shape)
      this.fx.trail = this.add.particles(0, 0, 'p_flare', {
        lifespan: 380, speed: { min: 4, max: 26 }, scale: { start: 0.17, end: 0 },
        alpha: { start: 0.7, end: 0 }, blendMode: 'ADD', emitting: false, quantity: 1,
        maxAliveParticles: 44, tint: 0x8ffaff
      }).setDepth(43);
      // 2. threat exhaust, tinted per family at emit time
      this.fx.exhaust = this.add.particles(0, 0, 'p_flare', {
        lifespan: 380, speed: { min: 2, max: 16 }, scale: { start: 0.14, end: 0 },
        alpha: { start: 0.5, end: 0 }, blendMode: 'ADD', emitting: false, quantity: 1,
        maxAliveParticles: 48
      }).setDepth(39);
      // 3. airburst shrapnel: needles, rotated to their own velocity
      this.fx.spark = this.add.particles(0, 0, 'p_spark', {
        lifespan: 520, speed: { min: 70, max: 300 }, scale: { start: 0.30, end: 0.04 },
        alpha: { start: 1, end: 0 }, rotate: { min: 0, max: 360 },
        blendMode: 'ADD', emitting: false, quantity: 10, maxAliveParticles: 84
      }).setDepth(50);
      // 4. explosion smoke: NORMAL blend, cool slate, drifts up and spreads
      this.fx.smoke = this.add.particles(0, 0, 'p_smoke', {
        lifespan: 1300, speedX: { min: -26, max: 26 }, speedY: { min: -46, max: -8 },
        scale: { start: 0.26, end: 0.86 }, alpha: { start: 0.62, end: 0 },
        rotate: { min: -20, max: 20 }, blendMode: 'NORMAL', emitting: false, quantity: 3,
        maxAliveParticles: 30, tint: 0x9aa8c8
      }).setDepth(45);
      // 5. debris rain, gravity on, spun by its own tumble
      this.fx.debris = this.add.particles(0, 0, 'p_shard', {
        lifespan: 1400, speed: { min: 40, max: 190 }, gravityY: 300,
        scale: { start: 0.24, end: 0.05 }, alpha: { start: 1, end: 0.1 },
        rotate: { start: 0, end: 360 }, blendMode: 'NORMAL', emitting: false, quantity: 8,
        maxAliveParticles: 64, tint: 0xffab6a
      }).setDepth(49);
      // 6. ground fire and city embers
      this.fx.ember = this.add.particles(0, 0, 'p_ember', {
        lifespan: 1600, speedX: { min: -18, max: 18 }, speedY: { min: -70, max: -20 },
        scale: { start: 0.20, end: 0 }, alpha: { start: 0.9, end: 0 },
        blendMode: 'ADD', emitting: false, quantity: 6, maxAliveParticles: 54,
        tint: [0xffd27a, 0xff7a4a]
      }).setDepth(52);
      // 7. district shield shimmer
      this.fx.shield = this.add.particles(0, 0, 'p_ember', {
        lifespan: 700, speed: { min: 20, max: 90 }, scale: { start: 0.22, end: 0 },
        alpha: { start: 1, end: 0 }, blendMode: 'ADD', emitting: false, quantity: 14,
        maxAliveParticles: 48, tint: 0x8cf4e2
      }).setDepth(53);
    },

    // Every burst in the game goes through here, so the reduced-motion
    // setting scales particle counts once instead of at 20 call sites.
    burst: function (emitter, x, y, n, tint) {
      if (tint != null) emitter.setParticleTint(tint);
      emitter.emitParticleAt(x, y, fxCount(n));
    },

    // ---------------------------------------------------------- ribbons
    emitRibbon: function (x, y, vx, vy, len, wide, tint, life, alpha) {
      var r = null, i, n = this.ribbons.length;
      for (i = 0; i < n; i++) {
        var cand = this.ribbons[(this.ribbonNext + i) % n];
        if (!cand.alive) { r = cand; this.ribbonNext = (this.ribbonNext + i + 1) % n; break; }
      }
      if (!r) r = this.poolTake(this.ribbons, MAX_RIBBONS, this.newRibbon);
      if (!r) return;                        // ceiling reached: drop the segment
      r.alive = true;
      r.age = 0;
      r.life = life || 0.30;
      r.len = len;
      r.wide = wide;
      r.a0 = alpha == null ? 0.85 : alpha;
      r.spr.setPosition(x, y).setRotation(Math.atan2(vy, vx))
        .setTint(tint).setVisible(true).setAlpha(r.a0)
        .setDisplaySize(len, wide);
    },

    stepRibbons: function (dt) {
      for (var i = 0; i < this.ribbons.length; i++) {
        var r = this.ribbons[i];
        if (!r.alive) continue;
        r.age += dt;
        var k = r.age / r.life;
        if (k >= 1) { r.alive = false; r.spr.setVisible(false); continue; }
        // Taper: the segment shortens and thins as it cools, so a chain of
        // them forms one contrail that narrows behind the nose.
        r.spr.setAlpha(r.a0 * (1 - k) * (1 - k))
          .setDisplaySize(r.len * (1 - 0.45 * k), r.wide * (1 - 0.75 * k));
      }
    },

    // --------------------------------------------------------------- HUD
    // HUD LAYOUT (fix round 1, art review): the pause control owns a reserved
    // cell on the right that nothing else may enter, the chain multiplier
    // moved out of that column into its own centre chip, every number is
    // bitmap display type, and no secondary label is below 12px.
    PAUSE_CELL: 52,

    buildHud: function () {
      var self = this;
      var w = this.W;
      var top = Game.insets.top;
      var bandH = 70 + top;
      this.hud = {};
      this.hud.band = this.add.rectangle(0, 0, w, bandH, 0x040a16, 0.66).setOrigin(0, 0)
        .setScrollFactor(0).setDepth(100);
      this.hud.bandLine = this.add.rectangle(0, bandH, w, 1, 0x3fa9c4, 0.4).setOrigin(0, 0)
        .setScrollFactor(0).setDepth(100);

      this.hud.title = label(this, 14, top + 8, 'SKYFALL COMMAND', 12, '#d8f8ff', 'bold')
        .setScrollFactor(0).setDepth(101);
      this.hud.night = label(this, 14, top + 26, '', 12, '#78dbe8')
        .setScrollFactor(0).setDepth(101);
      this.hud.score = makeNumber(this, w - 14 - this.PAUSE_CELL, top + 16, 20, 0xf3fbff, 1)
        .setScrollFactor(0).setDepth(101);
      this.hud.bestLabel = label(this, w - 14 - this.PAUSE_CELL, top + 32, 'BEST', 12, '#9fc7d8')
        .setOrigin(1, 0).setScrollFactor(0).setDepth(101);
      this.hud.best = makeNumber(this, w - 14 - this.PAUSE_CELL, top + 46, 13, 0x9fc7d8, 1)
        .setScrollFactor(0).setDepth(101);

      // District pips: the survival readout, one rectangle each so nothing
      // is re-tessellated per frame.
      this.hud.pips = [];
      for (var pi = 0; pi < 6; pi++) {
        this.hud.pips.push(this.add.rectangle(14 + pi * 15, top + 62, 11, 5, 0x6ce4db, 1)
          .setOrigin(0, 0).setScrollFactor(0).setDepth(101));
      }
      this.hud.strikeLabel = label(this, 108, top + 61, 'STRIKE', 10, CSS.amber, 'bold')
        .setScrollFactor(0).setDepth(101);
      this.hud.strikePips = [];
      for (var si = 0; si < 4; si++) {
        this.hud.strikePips.push(this.add.rectangle(151 + si * 13, top + 62, 9, 5, 0x4a3d2a, 1)
          .setOrigin(0, 0).setScrollFactor(0).setDepth(101));
      }
      this.hud.volleyT = label(this, 14, top + 44, '', 12, '#ffd978', 'bold')
        .setScrollFactor(0).setDepth(101);

      // Chain chip: its own centred object under the band, so the multiplier
      // can never collide with the pause button.
      var chipY = bandH + 18;
      this.hud.chipBg = this.add.rectangle(w / 2, chipY, 106, 26, 0x1b1230, 0.92)
        .setScrollFactor(0).setDepth(103);
      this.hud.chipTop = this.add.rectangle(w / 2, chipY - 13, 106, 1.5, PAL.amber, 0.9)
        .setScrollFactor(0).setDepth(103);
      this.hud.chipBot = this.add.rectangle(w / 2, chipY + 13, 106, 1.5, PAL.amber, 0.9)
        .setScrollFactor(0).setDepth(103);
      this.hud.chipNum = makeNumber(this, w / 2 - 20, chipY, 16, PAL.amber, 0.5)
        .setScrollFactor(0).setDepth(104);
      this.hud.chipText = label(this, w / 2 + 4, chipY, 'CHAIN', 12, CSS.amber, 'bold')
        .setOrigin(0, 0.5).setScrollFactor(0).setDepth(104);
      this.hud.chipParts = [this.hud.chipBg, this.hud.chipTop, this.hud.chipBot,
        this.hud.chipText];
      this.setChipAlpha(0);

      // Equipped interceptor readout. The weapon name is intentionally
      // visible during combat so a pickup swap changes the player's decision
      // language immediately, not only in the debug hook.
      this.hud.weaponBg = this.add.rectangle(w / 2, chipY + 40, 220, 24, 0x0b2033, 0.88)
        .setScrollFactor(0).setDepth(103);
      this.hud.weaponIcon = this.add.image(w / 2 - 92, chipY + 40, 'atlas', 'shard')
        .setScale(0.34).setTint(PAL.ice).setScrollFactor(0).setDepth(104)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.hud.weaponT = label(this, w / 2 - 78, chipY + 40, 'STANDARD BOLT', 11, CSS.ice, 'bold')
        .setOrigin(0, 0.5).setScrollFactor(0).setDepth(104);
      this.hud.buffT = label(this, w / 2, chipY + 58, '', 10, CSS.green, 'bold')
        .setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(104).setVisible(false);

      // Pause button: reserved cell, thumb-sized, clear of the notch.
      this.pauseBtn = flatButton(this, w - 28, top + 34, 44, 40, 'II', function () {
        self.openPause();
      }, { size: 15, fill: 0x14243c }).setScrollFactor(0).setDepth(102);
      this.hud.bandH = bandH;

      // Banner used for night and volley announcements.
      this.banner = this.add.container(w / 2, this.H * 0.22).setScrollFactor(0)
        .setDepth(120).setAlpha(0);
      // Rectangles, not Graphics: a Graphics object re-tessellates its whole
      // command list every frame it renders, and rounded corners mean arc
      // tessellation. The banner is on screen during gameplay, so it follows
      // the same rule as the rest of the in-play HUD (fix round 1, feel gate).
      var bnw = Math.min(w - 40, 320);
      this.bannerFill = this.add.rectangle(0, -3, bnw, 62, 0x071426, 0.86);
      this.bannerEdge = [
        this.add.rectangle(0, -34, bnw, 1.6, 0x6ef6ff, 0.85),
        this.add.rectangle(0, 28, bnw, 1.6, 0x6ef6ff, 0.85),
        this.add.rectangle(-bnw / 2, -3, 1.6, 62, 0x6ef6ff, 0.55),
        this.add.rectangle(bnw / 2, -3, 1.6, 62, 0x6ef6ff, 0.55)
      ];
      this.banner.add(this.bannerFill);
      for (var bi = 0; bi < this.bannerEdge.length; bi++) this.banner.add(this.bannerEdge[bi]);
      this.bannerT1 = label(this, 0, -16, '', 20, '#e8ffff', 'bold').setOrigin(0.5);
      this.bannerT2 = label(this, 0, 10, '', 12, '#8fd0e4').setOrigin(0.5);
      this.banner.add(this.bannerT1);
      this.banner.add(this.bannerT2);

      this.hudCache = { score: -1, best: -1, combo: -1, districts: -1, volley: -1,
        weapon: '', buffs: '', strike: -1 };
    },

    setChipAlpha: function (a) {
      for (var i = 0; i < this.hud.chipParts.length; i++) this.hud.chipParts[i].setAlpha(a);
      this.hud.chipNum.setAlpha(a);
      this.hud.chipNum.setVisible(a > 0.01);
    },

    layoutHud: function () {
      var w = this.W;
      var top = Game.insets.top;
      var bandH = 70 + top;
      this.hud.bandH = bandH;
      this.hud.band.setSize(w, bandH);
      this.hud.bandLine.setSize(w, 1).setPosition(0, bandH);
      this.hud.score.setPosition(w - 14 - this.PAUSE_CELL, top + 16);
      this.hud.bestLabel.setPosition(w - 14 - this.PAUSE_CELL, top + 32);
      this.hud.best.setPosition(w - 14 - this.PAUSE_CELL, top + 46);
      var chipY = bandH + 18;
      var bnw = Math.min(w - 40, 320);
      this.bannerFill.setSize(bnw, 62);
      this.bannerEdge[0].setSize(bnw, 1.6);
      this.bannerEdge[1].setSize(bnw, 1.6);
      this.bannerEdge[2].setPosition(-bnw / 2, -3);
      this.bannerEdge[3].setPosition(bnw / 2, -3);
      this.hud.chipBg.setPosition(w / 2, chipY);
      this.hud.chipTop.setPosition(w / 2, chipY - 13);
      this.hud.chipBot.setPosition(w / 2, chipY + 13);
      this.hud.chipNum.setPosition(w / 2 - 20, chipY);
      this.hud.chipText.setPosition(w / 2 + 4, chipY);
      this.hud.weaponBg.setPosition(w / 2, chipY + 40);
      this.hud.weaponIcon.setPosition(w / 2 - 92, chipY + 40);
      this.hud.weaponT.setPosition(w / 2 - 78, chipY + 40);
      this.hud.buffT.setPosition(w / 2, chipY + 58);
      this.hud.strikeLabel.setPosition(108, top + 61);
      for (var si = 0; si < this.hud.strikePips.length; si++) this.hud.strikePips[si].setPosition(151 + si * 13, top + 62);
      this.pauseBtn.setPosition(w - 28, top + 34);
      this.banner.setPosition(w / 2, this.H * 0.22);
    },

    setBanner: function (t1, t2, color) {
      var c = color || 0x6ef6ff;
      for (var i = 0; i < this.bannerEdge.length; i++) this.bannerEdge[i].setFillStyle(c, i < 2 ? 0.85 : 0.55);
      this.bannerT1.setText(t1);
      this.bannerT2.setText(t2 || '');
      this.banner.setAlpha(0).setScale(0.9);
      this.banner.y = this.H * 0.20;
      this.tweens.killTweensOf(this.banner);
      this.tweens.add({ targets: this.banner, alpha: 1, scale: 1, y: this.H * 0.22,
        duration: 320, ease: 'Back.easeOut' });
      this.tweens.add({ targets: this.banner, alpha: 0, delay: 1500, duration: 420,
        ease: 'Cubic.easeIn' });
    },

    // Full-screen activation beat. Every caller shares this one lane, so a
    // tide turner cannot stack over a strike or a boss entrance. Reduced
    // motion removes the rings, edge washes and punch zoom as one unit.
    triggerSpectacle: function (kind, x, y, color, t1, t2) {
      if (!motionOn() || !this.spectacle || this.spectacle.active) return false;
      var s = this.spectacle;
      s.active = true; s.t = 0; s.kind = kind || 'beat'; s.x = x == null ? this.W / 2 : x;
      s.y = y == null ? this.H * 0.35 : y; s.color = color || PAL.cyan;
      this.specBannerT1.setText(t1 || 'INTERCEPTION');
      this.specBannerT2.setText(t2 || 'SKYFALL COMMAND');
      fitLabel(this.specBannerT1, Math.min(this.W * 0.60, 320) - 24, 19, 11);
      fitLabel(this.specBannerT2, Math.min(this.W * 0.60, 320) - 24, 10, 8);
      this.specBanner.setPosition(this.W / 2, this.H * 0.34).setScale(0.72).setAlpha(1).setVisible(true);
      this.specRing.setPosition(s.x, s.y).setTint(s.color).setScale(0.05).setAlpha(0.86).setVisible(true);
      this.specRing2.setPosition(s.x, s.y).setTint(s.color).setScale(0.05).setAlpha(0.62).setVisible(true);
      for (var i = 0; i < this.specWash.length; i++) this.specWash[i].setFillStyle(s.color, 0.72);
      this.specZoom = (kind === 'boss' || kind === 'heavy' || kind === 'strike') ? 0.025 : 0.018;
      this.cameras.main.setZoom(1 + this.specZoom * 0.3);
      kit.audio.sfx(kind === 'strike' ? 'sfx_siren' : 'sfx_airburst', { volume: 0.42, rate: kind === 'boss' ? 0.76 : 1.0 });
      return true;
    },

    paintSpectacle: function (dt) {
      var s = this.spectacle;
      if (!s || !s.active) return;
      if (!motionOn()) {
        s.active = false;
        this.specBanner.setVisible(false);
        this.specRing.setVisible(false);
        this.specRing2.setVisible(false);
        for (var rm = 0; rm < this.specWash.length; rm++) this.specWash[rm].setAlpha(0);
        this.cameras.main.setZoom(1);
        return;
      }
      s.t += dt;
      var k = clamp(s.t / s.duration, 0, 1);
      var overshoot = k < 0.34 ? lerp(0.72, 1.10, k / 0.34) : lerp(1.10, 1.0, (k - 0.34) / 0.66);
      var fade = k < 0.28 ? 1 : 1 - (k - 0.28) / 0.72;
      this.specBanner.setScale(overshoot).setAlpha(clamp(fade, 0, 1));
      this.specRing.setScale(lerp(0.05, 1.18, Math.min(1, k * 1.3))).setAlpha(0.86 * (1 - k));
      this.specRing2.setScale(lerp(0.05, 0.84, Math.min(1, k * 1.8))).setAlpha(0.62 * (1 - k));
      for (var i = 0; i < this.specWash.length; i++) this.specWash[i].setAlpha(0.72 * (1 - k) * (1 - k));
      var punch = 1 + this.specZoom * Math.sin(Math.min(1, k * 1.5) * Math.PI);
      this.cameras.main.setZoom(punch);
      if (k >= 1) {
        s.active = false;
        this.specBanner.setVisible(false);
        this.specRing.setVisible(false);
        this.specRing2.setVisible(false);
        for (var j = 0; j < this.specWash.length; j++) this.specWash[j].setAlpha(0);
        this.cameras.main.setZoom(1);
      }
    },

    // -------------------------------------------------------------- input
    // GGKit is the authority on which pointers are live: it keys them by
    // pointerId and clears the whole map on pause, restart and blur. The game
    // now CONSUMES that map instead of trusting Phaser's own pointer state,
    // so a touch held across a pause or a REDEPLOY can no longer keep aiming
    // the next run. Coordinates come in as client px, are mapped through the
    // cached canvas rect, and are finally converted through the camera so a
    // tap during shake detonates where the player actually touched
    // (fix round 1, code + QA review).
    // Phaser does not normalise its input to PointerEvents: depending on the
    // browser the object behind p.event is a PointerEvent, a TouchEvent or a
    // MouseEvent. Reading only `event.pointerId` therefore rejected EVERY
    // touch, which is every phone. This resolves the client-space position out
    // of whichever family arrived, and records the id when there is one.
    clientOf: function (p) {
      var ev = p && p.event;
      this._pid = null;
      if (!ev) return false;
      if (ev.pointerId != null) {
        this._pid = ev.pointerId;
        this._cx = ev.clientX; this._cy = ev.clientY;
        return true;
      }
      if (ev.changedTouches) {
        var list = ev.changedTouches, t = null, i;
        for (i = 0; i < list.length; i++) {
          if (list[i].identifier === p.identifier) { t = list[i]; break; }
        }
        if (!t) t = list[0];
        if (!t) return false;
        this._cx = t.clientX; this._cy = t.clientY;
        return true;
      }
      if (ev.clientX != null) { this._cx = ev.clientX; this._cy = ev.clientY; return true; }
      return false;
    },

    // The live GGKit pointer behind this event, by id where the browser gives
    // one and by proximity otherwise (a touch identifier is not a pointerId,
    // so the two id spaces cannot be compared). The kit's map is small - one
    // entry per finger actually down - so the scan is trivial.
    kitLive: function () {
      if (this._pid != null) {
        var byId = kit.input.pointers.get(this._pid);
        if (byId) return byId;
      }
      this._near = null;
      this._nearD = 56 * 56;
      kit.input.pointers.forEach(this._scan);
      return this._near;
    },

    // GGKit is the authority on which pointers are live: it keys them by
    // pointerId and clears the whole map on pause, restart and blur. The game
    // CONSUMES that map instead of trusting Phaser's own pointer state, so a
    // touch held across a pause or a REDEPLOY can no longer keep aiming the
    // next run. Coordinates are mapped through the cached canvas rect and are
    // finally converted through the camera, so a tap during shake detonates
    // where the player actually touched (fix round 1, code + QA review).
    kitPointer: function (p) {
      if (!this.clientOf(p)) return null;
      var cx = this._cx, cy = this._cy;
      var live = this.kitLive();
      if (live) {
        cx = live.x; cy = live.y;             // the kit's position wins
      } else if (p.isDown) {
        // Down, but the kit is not tracking it: this is a pointer the kit has
        // already retired. A hovering mouse never reaches here because it is
        // not down, and it has no identity to steal.
        return null;
      }
      var r = this.canvasRect;
      if (!r || !r.width || !r.height) return null;
      var sx = (cx - r.left) * (this.W / r.width);
      var sy = (cy - r.top) * (this.H / r.height);
      return this.cameras.main.getWorldPoint(sx, sy, this._wp);
    },

    bindInput: function () {
      var self = this;
      this._wp = new Phaser.Math.Vector2();
      this._pid = null; this._cx = 0; this._cy = 0;
      // Bound once so the per-event proximity scan allocates no closure.
      this._near = null;
      this._nearD = 0;
      this._scan = function (q) {
        var dx = q.x - self._cx, dy = q.y - self._cy;
        var d = dx * dx + dy * dy;
        if (d <= self._nearD) { self._nearD = d; self._near = q; }
      };
      // Cached once here and refreshed on resize, so no input handler and no
      // frame ever forces a synchronous layout.
      this.canvasRect = this.game.canvas.getBoundingClientRect();

      this.input.on('pointerdown', function (p) {
        if (kit.paused) return;
        var wp = self.kitPointer(p);
        if (!wp) return;
        self.onTap(wp.x, wp.y);
      });
      this.input.on('pointermove', function (p) {
        if (kit.paused) return;
        // A touch that is not down is not aiming; a mouse hover is.
        if (!p.isDown && p.wasTouch) return;
        var wp = self.kitPointer(p);
        if (!wp) return;
        self.setAim(wp.x, wp.y);
      });

      var kb = this.input.keyboard;
      kb.on('keydown', function (e) {
        if (kit.paused) return;
        var c = e.code;
        if (c === 'ArrowLeft' || c === 'KeyA') { self.moveAim(-AIM_STEP, 0); e.preventDefault(); }
        else if (c === 'ArrowRight' || c === 'KeyD') { self.moveAim(AIM_STEP, 0); e.preventDefault(); }
        else if (c === 'ArrowUp' || c === 'KeyW') { self.moveAim(0, -AIM_STEP); e.preventDefault(); }
        else if (c === 'ArrowDown' || c === 'KeyS') { self.moveAim(0, AIM_STEP); e.preventDefault(); }
        else if (c === 'Space' || c === 'Enter') {
          e.preventDefault();
          // QUEUED-FIRE RACE FIX: the handler NEVER fires. It raises a flag
          // that the fixed sim step consumes exactly once. Firing from the
          // handler let a key repeat land between the phase change and the
          // render, producing shots the sim had not authorised.
          if (self.phase === 'fight' || self.phase === 'intro') self.keyFire = true;
          else if (self.phase === 'lost' || self.phase === 'won') self.onOverlayConfirm();
        } else if (c === 'Escape' || c === 'KeyP') {
          e.preventDefault();
          self.openPause();
        }
      });

      // QUEUED-FIRE RACE FIX (part two): a queued shot must never survive a
      // focus loss, a pause or a restart.
      window.addEventListener('blur', this.clearQueued = function () { self.keyFire = false; });
    },

    consumeQueuedFire: function () {
      if (!this.keyFire) return;
      this.keyFire = false;                 // cleared BEFORE the shot resolves
      // Parity with touch: fire() accepts the intro/tutorial phase, so the
      // keyboard must too (fix round 1, code review).
      if (this.phase !== 'fight' && this.phase !== 'intro') return;
      this.fire(this.aimX, this.aimY);
    },

    onTap: function (x, y) {
      if (this.phase === 'lost' || this.phase === 'won') { this.onOverlayConfirm(); return; }
      if (this.tut && this.tut.awaitTap) { this.tutAdvance(); return; }
      if (this.phase !== 'fight' && this.phase !== 'intro') return;
      var now = this.time.now;
      var doubleTap = this.lastTapAt > 0 && now - this.lastTapAt < 320 && this.phase === 'fight';
      this.lastTapAt = now;
      if (doubleTap) {
        this.magnetizePickupAt(x, y);
        this.setAim(x, y);
        if (this.callStrike(y)) return;
      }
      this.magnetizePickupAt(x, y);
      this.setAim(x, y);
      this.fire(x, y);
    },

    setAim: function (x, y) {
      this.aimX = clamp(x, AIM_SIDE, this.W - AIM_SIDE);
      this.aimY = clamp(y, AIM_TOP, this.aimMaxY);
    },

    moveAim: function (dx, dy) { this.setAim(this.aimX + dx, this.aimY + dy); },

    // ---------------------------------------------------------- night set
    resetNight: function () {
      var i;
      this.phase = 'intro';
      this.phaseT = 0;
      this.score = 0;
      this.combo = 0;
      this.comboT = 0;
      this.shotsFired = 0;
      this.kills = 0;
      this.volley = 0;
      this.volleyClearT = 0;
      this.spawnT = 0;
      this.spawned = 0;
      this.volleyTotal = 0;
      this.tier = 0;
      this.wind = 0;
      this.spawnHold = false;
      this.hitFlash = 0;
      this.chipPop = 1;
      this.frozen = false;
      this.alertLevel = 0;
      this.musicStem = '';
      this.runTime = 0;
      this.nextPowerDrop = 14;
      this.nextWeaponDrop = 24;
      this.lastPowerDrop = -99;
      this.lastWeaponDrop = -99;
      this.lastDropX = this.W / 2;
      this.lastDropY = this.H * 0.3;
      this.powerDrops = 0;
      this.weaponDrops = 0;
      this.tideDrops = 0;
      this.lastTideDrop = -99;
      this.lastTideTurner = '';
      this.equippedInterceptor = profile.hangar.equipped || 'standard-bolt';
      this.weaponsSeen = {};
      for (var wi = 0; wi < INTERCEPTORS.length; wi++) {
        if (profile.hangar.seen[INTERCEPTORS[wi].key]) this.weaponsSeen[INTERCEPTORS[wi].key] = true;
      }
      this.weaponsSeen['standard-bolt'] = true;
      this.weaponSeenCount = 0;
      for (var wk in this.weaponsSeen) if (this.weaponsSeen[wk]) this.weaponSeenCount++;
      this.buffs = {};
      this.lastBastionT = 0;
      this.decoyT = 0;
      this.droneCd = 0;
      this.wingRecoveryDue = -1;
      this.lastEscortLoss = -99;
      this.strike = { active: false, t: 0, laneY: 0, resolved: false };
      this.strikeCharges = 2;
      this.strikeCap = 4;
      this.lastTapAt = 0;
      this.resupplyLeft = upLevel('resupply');
      this.shieldLeft = upLevel('shield');
      this.rebuildLeft = upLevel('rebuild');
      this.siegeWave = 0;
      this.siegeAmmoBonus = 0;
      this.keyFire = false;                  // RESTART INPUT-STATE CLEARING
      kit.input.clearAll();

      this.aimX = this.W / 2;
      this.aimY = this.H * 0.33;

      for (i = 0; i < this.threats.length; i++) {
        this.killThreatSprite(this.threats[i]);
        this.threats[i].hitFlash = 0;
        this.threats[i].lastBlast = 0;
        this.threats[i].spr.clearTint();
      }
      for (i = 0; i < this.shots.length; i++) { this.shots[i].alive = false; this.shots[i].spr.setVisible(false); }
      for (i = 0; i < this.blasts.length; i++) {
        this.blasts[i].alive = false;
        this.blasts[i].core.setVisible(false);
        this.blasts[i].ring.setVisible(false);
        this.blasts[i].flash.setVisible(false);
      }
      for (i = 0; i < this.ribbons.length; i++) {
        this.ribbons[i].alive = false; this.ribbons[i].spr.setVisible(false);
      }
      for (i = 0; i < this.pops.length; i++) {
        this.pops[i].alive = false;
        this.pops[i].n.setVisible(false);
        this.pops[i].t.setVisible(false);
      }
      for (i = 0; i < this.pickups.length; i++) {
        this.pickups[i].alive = false;
        this.pickups[i].spr.setVisible(false);
        this.pickups[i].halo.setVisible(false);
        this.pickups[i].ring.setVisible(false);
        this.pickups[i].beacon.setVisible(false);
        this.pickups[i].parachute.setVisible(false);
      }
      for (i = 0; i < this.escorts.length; i++) {
        this.escorts[i].alive = false;
        this.escorts[i].spr.setVisible(false);
        this.escorts[i].halo.setVisible(false);
      }
      for (i = 0; i < this.lineFx.length; i++) {
        this.lineFx[i].alive = false;
        this.lineFx[i].spr.setVisible(false);
      }
      this.blastSeq = 0;

      for (i = 0; i < this.districts.length; i++) {
        var d = this.districts[i];
        d.alive = true;
        // state and the shield highlight are part of the district's damage
        // identity, so a retry has to clear them too or a rebuilt district
        // would come back already scorched and could never be damaged again.
        d.state = 0;
        d.maxHp = 1 + hangarLevel('plating');
        d.hp = d.maxHp;
        d.fireT = 0;
        d.shieldT = 0;
        d.spr.setFrame('dist_' + d.face).setAlpha(1);
        d.shield.setVisible(false).setAlpha(0);
        d.shieldHi.setVisible(false).setAlpha(0);
      }
      for (i = 0; i < this.batteries.length; i++) {
        var b = this.batteries[i];
        b.alive = true; b.cap = this.ammoCap(); b.ammo = b.cap;
        b.state = 'idle'; b.aimA = 0; b.recoil = 0; b.recoilV = 0; b.chargeT = 0; b.fireLock = 0;
        b.flash.setVisible(false);
      }

      this.boss.active = false;
      this.boss.dead = false;
      this.boss.entering = false;
      this.boss.portX = 0;
      this.pendingBoss = false;
      this.boss.spr.setVisible(false);
      this.bossGlow.setVisible(false);
      this.bossBeams[0].setVisible(false);
      this.bossBeams[1].setVisible(false);
      this.strike.active = false;
      this.strikeLane.setVisible(false);
      this.strikeEdge.setVisible(false);
      this.strikeShip.setVisible(false);
      this.specBanner.setVisible(false);
      this.specRing.setVisible(false);
      this.specRing2.setVisible(false);
      for (i = 0; i < this.specWash.length; i++) this.specWash[i].setAlpha(0);
      this.spectacle.active = false;
      this.cameras.main.setZoom(1);

      // Squadron Bay is a run-start formation bonus. The field drop and
      // recovery rules still use the same pooled escorts as round 1.
      var startEscorts = Math.min(this.escortCap(), hangarLevel('squadron'));
      for (i = 0; i < startEscorts; i++) {
        var starter = this.escorts[i];
        starter.alive = true; starter.kind = 'wing'; starter.x = this.W / 2;
        starter.y = this.baseY - 90 - i * 30; starter.fireT = 0.34 + i * 0.14;
        starter.spr.setVisible(true); starter.halo.setVisible(true);
      }

      this.vignette.setAlpha(0);
      this.flashPlate.setAlpha(0);

      this.acc = 0;
      this.hudCache.score = -1;
      this.hudCache.districts = -1;
      this.hudCache.volley = -1;
      this.hudCache.combo = -1;
      this.hudCache.best = -1;
      this.hudCache.weapon = '';
      this.hudCache.buffs = '';
      this.hudCache.strike = -1;
      this.hud.night.setText(this.modeLabel());
      this.updateDebugState();

      this.setBanner(
        this.mode === 'siege' ? 'SIEGE' : 'NIGHT ' + this.nightIndex,
        this.mode === 'siege' ? 'Endless. Hold as long as you can.' : this.night.name + ' - ' + this.night.sub,
        this.night.boss && this.mode === 'campaign' ? 0xec9bff : 0x6ef6ff);
      kit.audio.sfx('sfx_siren');
    },

    modeLabel: function () {
      if (this.mode === 'siege') return 'SIEGE GRID // WAVE ' + Math.max(1, this.siegeWave);
      return this.night.name + ' // ' + (this.mod ? this.mod.toUpperCase() : 'CLEAR SKIES');
    },

    ammoCap: function () { return BASE_AMMO + upLevel('mag') + this.siegeAmmoBonus; },
    shotSpeed: function () { return SHOT_SPEED * (1 + 0.12 * upLevel('speed')) * (1 + hangarLevel('reload') * 0.08); },
    damageOutput: function () { return 1 + hangarLevel('output') * 0.10; },
    radarLead: function () { return 0.18 + hangarLevel('radar') * 0.10; },
    escortCap: function () { return Math.min(MAX_ESCORTS, 2 + hangarLevel('squadron')); },
    blastRadius: function () {
      var base = BLAST_BASE_R + Math.min(BLAST_TIER_CAP, this.tier * BLAST_TIER_R);
      return base * (1 + 0.09 * upLevel('blast'));
    },
    blastLife: function () { return this.mod === 'blackout' ? BLAST_LIFE * 0.72 : BLAST_LIFE; },
    aliveDistricts: function () {
      var n = 0;
      for (var i = 0; i < this.districts.length; i++) if (this.districts[i].alive) n++;
      return n;
    },

    // ------------------------------------------------------------ volleys
    beginVolley: function () {
      if (this.mode === 'siege') {
        this.siegeWave++;
        this.tier = 3 + (this.siegeWave - 1) * 0.85;
        this.rng = makeRng(0x51F17 + this.siegeWave * 7919);
        this.volleyTotal = VOLLEY_COUNT_BASE + Math.floor(this.tier * VOLLEY_COUNT_K);
        this.hud.night.setText(this.modeLabel());
      } else {
        this.tier = this.night.tier + this.volley * 0.9;
        this.rng = makeRng((this.night.seed + this.volley * 7919) >>> 0);
        this.volleyTotal = VOLLEY_COUNT_BASE + Math.floor(this.tier * VOLLEY_COUNT_K);
      }
      this.spawned = 0;
      this.spawnT = 0.45;
      this.volleyClearT = 0;
      this.wind = this.mod === 'wind' ? (this.rng() < 0.5 ? -1 : 1) * (14 + this.rng() * 20) : 0;

      // Every battery reloads between volleys, exactly as the prototype
      // reloaded between waves.
      for (var i = 0; i < this.batteries.length; i++) {
        var b = this.batteries[i];
        b.cap = this.ammoCap();
        if (b.alive) b.ammo = b.cap;
      }
      this.phase = 'fight';
      this.hudCache.volley = -1;
    },

    volleyCleared: function () {
      var i;
      var survivors = this.aliveDistricts();
      var mult = this.mode === 'siege' ? this.siegeWave : this.nightIndex;
      this.addScore(survivors * 50 * mult, this.W / 2, this.H * 0.38, '+' + (survivors * 50 * mult));
      this.triggerSpectacle('wave', this.W / 2, this.H * 0.34, PAL.cyan,
        'WAVE CLEAR', survivors + '/6 DISTRICTS STILL STANDING');

      if (this.mode === 'siege') {
        // Prototype behaviour, preserved verbatim in the endless mode it came
        // from: every fifth cleared wave adds ammo capacity and raises one
        // destroyed district.
        if (this.siegeWave % 5 === 0) {
          this.siegeAmmoBonus += 2;
          var raised = false;
          for (i = 0; i < this.districts.length; i++) {
            if (!this.districts[i].alive) { this.reviveDistrict(this.districts[i]); raised = true; break; }
          }
          this.setBanner('REINFORCEMENTS', raised ? 'Extra interceptors and one district raised'
            : 'Extra interceptors', 0x8ff5d2);
          kit.audio.sfx('sfx_reload');
        }
        this.phase = 'gap';
        this.phaseT = 1.4;
        return;
      }

      // Rebuild crews work between volleys.
      if (this.rebuildLeft > 0) {
        for (i = 0; i < this.districts.length; i++) {
          if (!this.districts[i].alive) {
            this.reviveDistrict(this.districts[i]);
            this.rebuildLeft--;
            this.setBanner('REBUILD CREW', 'A district is back on the grid', 0x8ff5d2);
            kit.audio.sfx('sfx_reload');
            break;
          }
        }
      }

      this.volley++;
      if (this.night.boss && this.volley >= this.night.volleys && !this.boss.active && !this.boss.dead) {
        this.phase = 'gap';
        this.phaseT = 1.6;
        this.pendingBoss = true;
        return;
      }
      if (this.volley >= this.night.volleys && !this.night.boss) { this.winNight(); return; }
      if (this.night.boss && this.boss.dead) { this.winNight(); return; }
      this.phase = 'gap';
      this.phaseT = 1.6;
      this.setBanner('VOLLEY ' + (this.volley + 1), 'Batteries reloaded', 0x6ef6ff);
    },

    reviveDistrict: function (d) {
      d.alive = true;
      d.state = 0;
      d.maxHp = 1 + hangarLevel('plating');
      d.hp = d.maxHp;
      d.fireT = 0;
      d.spr.setFrame('dist_' + d.face).setAlpha(0);
      this.tweens.add({ targets: d.spr, alpha: 1, duration: 500, ease: 'Cubic.easeOut' });
      this.burst(this.fx.shield, d.x, d.y - 20, 16);
      this.triggerSpectacle('save', d.x, d.y - 18, PAL.green, 'DISTRICT RESTORED', 'THE GRID COMES BACK ONLINE');
      this.hudCache.districts = -1;
    },

    // ------------------------------------------------------------ spawning
    // Counts the live districts and walks to the Nth one. The old version
    // built a throwaway array for every single spawn, which contradicted the
    // no-allocation hot-loop rule (fix round 1, code review).
    pickDistrict: function () {
      var i, n = 0;
      for (i = 0; i < this.districts.length; i++) if (this.districts[i].alive) n++;
      if (!n) return this.districts[Math.floor(this.rng() * this.districts.length)];
      var want = Math.floor(this.rng() * n);
      for (i = 0; i < this.districts.length; i++) {
        if (!this.districts[i].alive) continue;
        if (want === 0) return this.districts[i];
        want--;
      }
      return this.districts[0];
    },

    pickType: function () {
      // Roll the prototype's escalation curve first, then map it onto the
      // night's declared threat mix so each night reads as its own sky.
      var mix = this.mode === 'siege' ? ['shard', 'streak', 'hydra', 'wraith', 'cruiser', 'swarm']
        : this.night.mix;
      if (this.mode === 'siege') {
        var roll = this.rng();
        if (this.tier >= 9 && roll < 0.12) return 'cruiser';
        if (this.tier >= 6 && roll < 0.28) return 'wraith';
        if (this.tier >= 4 && roll < 0.48) return 'streak';
        if (this.tier >= 2 && roll < 0.70) return 'hydra';
        return 'shard';
      }
      if (this.rng() < 0.05 && this.tier > 2) return 'pod';
      return mix[Math.floor(this.rng() * mix.length)];
    },

    freeThreat: function () {
      return this.poolTake(this.threats, MAX_THREATS, this.newThreat);
    },

    spawnThreat: function (type, ox, oy, target) {
      var t = this.freeThreat();
      if (!t) return null;
      var def = THREAT[type];
      var d = target || this.pickDistrict();
      var margin = Math.min(34, this.W * 0.1);
      var x = ox == null ? lerp(margin, this.W - margin, this.rng()) : ox;
      var y = oy == null ? -14 : oy;
      var tx = d.x + lerp(-10, 10, this.rng());
      var ty = d.y - 12;
      var dx = tx - x, dy = ty - y;
      var len = Math.hypot(dx, dy) || 1;
      var speed = def.sBase + this.tier * def.sK;

      t.alive = true;
      t.type = type;
      t.x = x; t.y = y; t.tx = tx; t.ty = ty;
      t.district = d;
      t.speed = speed;
      t.vx = dx / len * speed;
      t.vy = dy / len * speed;
      t.dist = 0;
      t.total = len;
      t.splitAt = lerp(SPLIT_MIN, SPLIT_MAX, this.rng());
      t.split = false;
      t.dodge = 0;
      t.hp = def.hp;
      t.wob = this.rng() * TAU;
      t.trailT = this.rng() * 0.1;
      t.hitFlash = 0;
      t.lastBlast = 0;
      t.empT = 0;
      t.burnT = 0;
      t.burnTick = 0;
      t.warnT = this.radarLead();
      t.introT = type === 'cruiser' ? 0.30 : 0;
      // SPAWN IMMUNITY. MIRV children are created from inside the blast that
      // killed their parent, at the blast centre, while that same blast is
      // still being processed - they died on the frame they were born. Two
      // sim steps of immunity lets the split actually happen (fix round 1).
      t.imm = SPAWN_IMMUNE_STEPS;
      t.rot = Math.atan2(t.vy, t.vx) + Math.PI / 2;
      t.spr.setFrame(def.frame).setVisible(true).setAlpha(1).setScale(def.scale)
        .setPosition(x, y).setRotation(t.rot);
      t.warn.setPosition(x, Math.max(38, y + 28)).setScale(0.22).setTint(def.tint)
        .setAlpha(0.72).setVisible(true);
      if (type === 'cruiser') {
        kit.audio.sfx('sfx_cruiser', { volume: 0.45 });
        this.triggerSpectacle('heavy', x, Math.max(70, y + 40), def.tint, 'HEAVY CONTACT', 'ARMOUR ON APPROACH');
      }
      return t;
    },

    killThreatSprite: function (t) {
      t.alive = false;
      t.spr.setVisible(false);
      t.warn.setVisible(false);
    },

    splitHydra: function (parent) {
      var n = THREAT.hydra.splits;
      var made = 0;
      for (var i = 0; i < n; i++) {
        var d = this.pickDistrict();
        var child = this.spawnThreat('swarm', parent.x, parent.y, d);
        if (!child) break;                     // pool exhausted: fewer children
        made++;
        // Fan the children out so the split reads as three separate threats,
        // and push them clear of the parent's blast centre.
        var spread = (i - (n - 1) / 2) * 26;
        child.x = parent.x + spread * 0.5;
        child.y = parent.y - 6;
        child.tx = clamp(child.tx + spread, 12, this.W - 12);
        var dx = child.tx - child.x, dy = child.ty - child.y;
        var len = Math.hypot(dx, dy) || 1;
        child.total = len;
        child.vx = dx / len * child.speed;
        child.vy = dy / len * child.speed;
        child.rot = Math.atan2(child.vy, child.vx) + Math.PI / 2;
        child.spr.setPosition(child.x, child.y).setRotation(child.rot);
      }
      if (made) {
        this.burst(this.fx.spark, parent.x, parent.y, 12, THREAT.hydra.tint);
        this.burst(this.fx.ember, parent.x, parent.y, 6, THREAT.hydra.tint);
        kit.audio.sfx('sfx_splinter', { volume: 0.7 });
        kit.juice.shake(3, 120);
      }
    },

    // ------------------------------------------------------------- firing
    interceptorData: function (key) {
      return INTERCEPTOR_BY_KEY[key] || INTERCEPTORS[0];
    },

    equipInterceptor: function (key, source) {
      var data = INTERCEPTOR_BY_KEY[key];
      if (!data) return false;
      this.equippedInterceptor = key;
      if (!this.weaponsSeen[key]) {
        this.weaponsSeen[key] = true;
        this.weaponSeenCount++;
        profile.hangar.seen[key] = true;
        persist();
      }
      if (source) {
        this.setBanner(data.name, 'INTERCEPTOR BATTERY ONLINE', data.tint);
        kit.audio.sfx('sfx_pod', { volume: 0.62, rate: 0.82 + (this.weaponSeenCount % 4) * 0.05 });
        this.burst(this.fx.shield, this.W / 2, this.H * 0.34, 14, data.tint);
        this.triggerSpectacle('intercept', this.W / 2, this.H * 0.34, data.tint,
          data.name, 'INTERCEPTOR BATTERY ONLINE');
      }
      this.hudCache.weapon = '';
      this.updateDebugState();
      return true;
    },

    nextInterceptor: function (requested) {
      if (requested && INTERCEPTOR_BY_KEY[requested]) return requested;
      for (var i = 0; i < INTERCEPTORS.length; i++) {
        var data = INTERCEPTORS[i];
        if (!this.weaponsSeen[data.key]) return data.key;
      }
      var at = (this.weaponSeenCount + this.powerDrops) % INTERCEPTORS.length;
      return INTERCEPTORS[at].key;
    },

    freeLineFx: function () {
      for (var i = 0; i < this.lineFx.length; i++) {
        var at = (this.lineFxNext + i) % this.lineFx.length;
        if (!this.lineFx[at].alive) {
          this.lineFxNext = (at + 1) % this.lineFx.length;
          return this.lineFx[at];
        }
      }
      return this.poolTake(this.lineFx, MAX_LINE_FX, this.newLineFx);
    },

    spawnInterceptor: function (sx, sy, tx, ty, key, escort) {
      var data = this.interceptorData(key);
      var shot = this.poolTake(this.shots, MAX_SHOTS, this.newShot);
      if (!shot) return null;
      shot.alive = true;
      shot.sx = sx; shot.sy = sy; shot.tx = tx; shot.ty = ty;
      shot.x = sx; shot.y = sy; shot.t = 0;
      shot.speed = this.shotSpeed() * data.speed;
      shot.bat = null;
      shot.interceptor = data.key;
      shot.escort = !!escort;
      shot.seeker = !!data.seeker;
      shot.trailT = 0;
      shot.spr.setTexture('atlas', data.frame).setVisible(true)
        .setPosition(sx, sy).setAlpha(1).setTint(data.tint)
        .setScale(data.heavy ? 0.58 : (data.line ? 0.34 : (data.twin ? 0.46 : 0.5)))
        .setRotation(Math.atan2(ty - sy, tx - sx) + (data.line ? Math.PI / 2 : 0));
      return shot;
    },

    fireRail: function (battery, x, y) {
      var data = this.interceptorData('rail-lance');
      var ox = battery.x, oy = battery.y - 18;
      var dx = x - ox, dy = y - oy, len = Math.hypot(dx, dy) || 1;
      var fx = this.freeLineFx();
      if (fx) {
        fx.alive = true; fx.age = 0; fx.life = data.life; fx.x = (ox + x) * 0.5; fx.y = (oy + y) * 0.5; fx.len = len;
        fx.spr.setVisible(true).setPosition(fx.x, fx.y).setRotation(Math.atan2(dy, dx) + Math.PI / 2)
          .setDisplaySize(10, len).setTint(data.tint).setAlpha(0.95);
      }
      var c = Math.cos(Math.atan2(dy, dx)), s = Math.sin(Math.atan2(dy, dx));
      for (var i = 0; i < this.threats.length; i++) {
        var t = this.threats[i];
        if (!t.alive) continue;
        var rx = t.x - ox, ry = t.y - oy;
        var along = rx * c + ry * s, side = Math.abs(rx * s - ry * c);
        if (along > -t.r && along < len + t.r && side < 16 + t.r) this.damageThreat(t, this.damageOutput(), data.tint);
      }
      if (this.boss.active && Math.abs(y - this.boss.y) < this.boss.spr.displayHeight * 0.55) {
        var fake = this.detonate(x, y, 'rail-lance');
        if (fake) this.damageBoss(fake);
      } else {
        this.detonate(x, y, 'rail-lance');
      }
      this.burst(this.fx.spark, x, y, 12, data.tint);
      kit.audio.sfx(data.cue, { volume: 0.66, rate: 0.86 });
    },

    fire: function (x, y) {
      if (this.phase !== 'fight' && this.phase !== 'intro') return;
      this.setAim(x, y);

      // Nearest battery with ammo, by horizontal distance, exactly the
      // prototype's selection rule.
      var best = null, bestD = Infinity;
      for (var i = 0; i < this.batteries.length; i++) {
        var b = this.batteries[i];
        if (!b.alive || b.ammo <= 0 || b.fireLock > 0) continue;
        var d = Math.abs(b.x - this.aimX);
        if (d < bestD) { bestD = d; best = b; }
      }
      if (!best) {
        if (flashOn()) this.hitFlash = Math.max(this.hitFlash, 0.12);
        kit.audio.sfx('sfx_dry', { volume: 0.6 });
        this.tryResupply();
        return;
      }
      var data = this.interceptorData(this.equippedInterceptor);
      best.ammo--;
      best.chargeT = 0.20;
      best.fireLock = hangarLevel('reload') > 0 ? 0.055 / (1 + hangarLevel('reload') * 0.08) : 0;
      best.recoilV = -34;                    // spring-damped recoil, one overshoot
      best.flash.setPosition(best.x + Math.sin(best.aimA) * 26, best.y - Math.cos(best.aimA) * 26);
      best.flash.setVisible(true).setRotation(best.aimA).play('muzzle');

      if (data.line) {
        this.fireRail(best, this.aimX, this.aimY);
      } else {
        var count = data.salvo || (data.twin ? 2 : 1);
        if (this.buffs.overdrive > 0 && !data.twin && !data.salvo) count++;
        var made = 0;
        for (var si = 0; si < count; si++) {
          var spread = data.twin ? (si === 0 ? -12 : 12) : (data.salvo ? (si - 1) * 13 : 0);
          var shot = this.spawnInterceptor(best.x, best.y - 18, this.aimX + spread,
            this.aimY, data.key, false);
          if (shot) {
            made++;
            this.burst(this.fx.trail, shot.sx, shot.sy, data.heavy ? 5 : 2, data.tint);
          }
        }
        if (!made) { best.ammo++; return; }
      }
      this.shotsFired++;
      kit.audio.sfx(data.cue, { volume: data.heavy ? 0.68 : 0.55,
        rate: 0.92 + Math.random() * 0.12 });
      if (this.tut) this.tutNotify('fire');
    },

    tryResupply: function () {
      if (this.resupplyLeft <= 0) return;
      var any = false;
      for (var i = 0; i < this.batteries.length; i++) if (this.batteries[i].alive && this.batteries[i].ammo > 0) any = true;
      if (any) return;
      var live = false;
      for (var t = 0; t < this.threats.length; t++) if (this.threats[t].alive) live = true;
      if (!live && !this.boss.active) return;
      this.resupplyLeft--;
      for (var b = 0; b < this.batteries.length; b++) {
        if (this.batteries[b].alive) this.batteries[b].ammo = this.batteries[b].cap;
        this.burst(this.fx.shield, this.batteries[b].x, this.batteries[b].y - 10, 10);
      }
      kit.audio.sfx('sfx_reload');
      this.setBanner('RESUPPLY DRONE', 'Every battery reloaded', 0x8ff5d2);
    },

    // --------------------------------------------------------- detonation
    // HERO AIRBURST. A staged timeline, not one disc plus a spark burst:
    //   0-70 ms   hard white core flash, over-scaled and gone
    //   0-280 ms  fireball eases past full radius and settles back
    //   0-1.0 s   shock ring expands and thins
    //   0 ms      16 ballistic embers + 8 debris chips thrown outward
    //   180/420ms two delayed smoke puffs that rise after the light dies
    // The blast pool is sized above the shot pool, so a detonation NEVER
    // overwrites a live blast and erases its collision coverage
    // (fix round 1, code + art review).
    detonate: function (x, y, interceptor) {
      var data = this.interceptorData(interceptor || 'standard-bolt');
      var b = this.poolTake(this.blasts, MAX_BLASTS, this.newBlast);
      if (!b) return null;                   // ceiling exceeds MAX_SHOTS, so unreachable
      b.alive = true;
      b.id = ++this.blastSeq;
      b.x = x; b.y = y;
      b.maxR = Math.max(18, this.blastRadius() + data.radius);
      b.r = 3;
      b.age = 0;
      b.duration = Math.max(BLAST_GROW + 0.08, data.life || this.blastLife());
      b.opacity = 1;
      b.interceptor = data.key;
      b.effect = data.emp ? 'emp' : (data.burn ? 'burn' : '');
      b.color = data.tint;
      b.damage = this.damageOutput();
      b.hitBoss = false;
      b.smoke1 = false;
      b.smoke2 = false;
      b.core.setVisible(true).setPosition(x, y).setAlpha(0.95)
        .setDisplaySize(10, 10).setTint(0xffffff);
      b.ring.setVisible(true).setPosition(x, y).setAlpha(0.95).setScale(0.05);
      b.flash.setVisible(true).setPosition(x, y).setAlpha(1)
        .setDisplaySize(b.maxR * 3.0, b.maxR * 3.0).setTint(0xffffff);

      if (flashOn()) this.flashPlate.setAlpha(Math.min(0.24, this.flashPlate.alpha + 0.13));
      this.burst(this.fx.spark, x, y, data.heavy ? 20 : (data.emp || data.burn ? 16 : 12), data.tint);
      this.burst(this.fx.ember, x, y, data.heavy ? 16 : 10, data.tint);
      this.burst(this.fx.debris, x, y, data.heavy ? 12 : 7, data.tint);
      if (this.buffs['chain-lightning'] > 0) this.chainLightning(x, y, data.tint);
      kit.juice.shake(data.heavy ? 4.4 : 2.2, data.heavy ? 180 : 130);
      return b;
    },

    // ------------------------------------------------------------- scoring
    addScore: function (n, x, y, text, color, tint) {
      this.score = clamp(this.score + n, 0, MAX_SCORE);
      if (text) this.popText(x, y, text, color, tint);
    },

    // Every glyph the bundled numeral face carries. Anything outside this set
    // has to fall back to a Text object.
    NUM_GLYPHS: '0123456789+-./x',

    popText: function (x, y, text, color, tint) {
      var p = this.poolTake(this.pops, MAX_POPS, this.newPop);
      if (!p) return;
      p.alive = true;
      p.age = 0;
      p.vy = -54;
      var bitmap = true;
      for (var i = 0; i < text.length; i++) {
        if (this.NUM_GLYPHS.indexOf(text.charAt(i)) < 0) { bitmap = false; break; }
      }
      p.useNum = bitmap;
      if (bitmap) {
        p.t.setVisible(false);
        p.n.setText(text).setTint(tint == null ? 0xdff6ff : tint)
          .setPosition(x, y).setVisible(true).setAlpha(1).setPop(0.4);
      } else {
        p.n.setVisible(false);
        p.t.setText(text).setColor(color || '#dff6ff').setPosition(x, y)
          .setVisible(true).setAlpha(1).setScale(0.4);
      }
    },

    damageThreat: function (t, amount, tint) {
      if (!t || !t.alive) return;
      t.hp -= amount || 1;
      if (t.hp > 0) {
        t.hitFlash = 0.18;
        this.burst(this.fx.spark, t.x, t.y, 4, tint || THREAT[t.type].tint);
        kit.audio.sfx('sfx_armor', { volume: 0.36 });
      } else {
        this.registerKill(t);
      }
    },

    registerKill: function (t) {
      var def = THREAT[t.type];
      this.kills++;
      this.comboT = COMBO_WINDOW;
      this.combo = Math.min(COMBO_MAX, this.combo + 1);
      var mult = Math.max(1, this.combo);
      var pts = def.score * mult * (this.buffs['score-flare'] > 0 ? 1.5 : 1);
      this.addScore(pts, t.x, t.y, '+' + pts, mult > 1 ? '#ffd978' : '#dff6ff',
        mult > 1 ? PAL.amber : PAL.ice);

      this.burst(this.fx.spark, t.x, t.y, def.armoured ? 14 : 8, def.tint);
      this.burst(this.fx.debris, t.x, t.y, def.armoured ? 7 : 4, def.tint);
      kit.juice.shake(def.armoured ? 3.4 : 1.4, 110);
      kit.juice.hitStop(def.armoured ? 46 : 0);
      if (def.armoured) {
        this.triggerSpectacle('heavy', t.x, t.y, def.tint, 'HEAVY INTERCEPTED', 'ARMOUR BREAK CONFIRMED');
      } else if (this.combo >= 3) {
        this.triggerSpectacle('combo', t.x, t.y, PAL.amber, 'COMBO x' + this.combo, 'SKYLANE COLLAPSE');
      }

      if (def.supply) {
        for (var i = 0; i < this.batteries.length; i++) {
          var b = this.batteries[i];
          if (b.alive) b.ammo = Math.min(b.cap, b.ammo + 2);
        }
        kit.audio.sfx('sfx_pod');
        this.popText(t.x, t.y - 18, 'SUPPLY +2', '#8ff5d2');
      }
      if (t.type === 'hydra' && !t.split) this.splitHydra(t);
      this.killThreatSprite(t);
      this.tryDropPackage(t.x, t.y);
      if (this.tut) this.tutNotify('kill');
    },

    // ------------------------------------------------------- uplift drops
    livePickup: function (category, kind) {
      for (var i = 0; i < this.pickups.length; i++) {
        var p = this.pickups[i];
        if (p.alive && p.category === category && p.kind === kind) return p;
      }
      return null;
    },

    spawnPickup: function (category, kind, atX, atY, tide) {
      var data = category === 'weapon' ? this.interceptorData(kind) :
        (category === 'tide' ? TIDE_BY_KEY[kind] : POWER_BY_KEY[kind]);
      if (!data) return null;
      if (category === 'power' && this.powerDrops >= POWER_DROP_CAP) return null;
      if (category === 'weapon' && this.weaponDrops >= WEAPON_DROP_CAP) return null;
      if (this.livePickup(category, kind)) return null;
      var p = null;
      for (var i = 0; i < this.pickups.length; i++) {
        if (!this.pickups[i].alive) { p = this.pickups[i]; break; }
      }
      if (!p) p = this.poolTake(this.pickups, MAX_PICKUPS, this.newPickup);
      if (!p) return null;
      var rand = this.rng ? this.rng() : Math.random();
      p.alive = true;
      p.category = category;
      p.kind = kind;
      p.tide = !!tide || category === 'tide';
      p.x = clamp(atX == null ? this.W * (0.18 + rand * 0.64) : atX, 26, this.W - 26);
      p.y = clamp(atY == null ? this.H * 0.28 : atY - 18, 78, this.baseY - 118);
      p.targetY = clamp(p.y + 74, 104, this.baseY - 74);
      p.vx = (rand - 0.5) * 18;
      p.vy = 48 + rand * 18;
      p.life = p.tide ? 34 : (category === 'weapon' ? 30 : 26);
      p.age = 0; p.bob = rand * TAU; p.magnetT = 0;
      var color = p.tide ? data.color : data.color;
      var frame = category === 'weapon' ? data.frame : data.frame;
      p.spr.setTexture('atlas', frame).setPosition(p.x, p.y).setTint(color)
        .setScale(category === 'weapon' ? 0.52 : (p.tide ? 0.76 : 0.62))
        .setVisible(true).setAlpha(1);
      p.halo.setPosition(p.x, p.y).setTint(p.tide ? 0xffd978 : color)
        .setDisplaySize(p.tide ? 126 : 92, p.tide ? 126 : 92).setAlpha(p.tide ? 0.24 : 0.3).setVisible(true);
      p.ring.setPosition(p.x, p.y).setTint(p.tide ? 0xffd978 : color)
        .setScale(p.tide ? 1.02 : 0.72).setAlpha(p.tide ? 0.86 : 0.62).setVisible(true);
      p.beacon.setPosition(p.x, p.y - (p.tide ? 66 : 46)).setSize(p.tide ? 11 : 7, p.tide ? 132 : 92)
        .setFillStyle(p.tide ? 0xffd978 : color, p.tide ? 0.62 : 0.4).setVisible(true);
      p.parachute.setPosition(p.x, p.y - 30).setTint(p.tide ? 0xfff0b0 : color).setVisible(true);
      if (category === 'power') this.powerDrops++;
      if (category === 'weapon') this.weaponDrops++;
      if (category === 'tide') this.tideDrops++;
      this.lastDropX = p.x; this.lastDropY = p.y;
      kit.audio.sfx('sfx_pod', { volume: p.tide ? 0.72 : 0.46, rate: p.tide ? 0.72 : 1.04 });
      return p;
    },

    choosePower: function () {
      var total = 0, fallback = 'overdrive';
      for (var i = 0; i < POWERS.length; i++) {
        var data = POWERS[i];
        if (data.rare && this.runTime < 34) continue;
        if (this.livePickup('power', data.key)) continue;
        total += data.weight;
        fallback = data.key;
      }
      if (!total) return fallback;
      var pick = (this.rng ? this.rng() : Math.random()) * total;
      for (var j = 0; j < POWERS.length; j++) {
        var candidate = POWERS[j];
        if (candidate.rare && this.runTime < 34) continue;
        if (this.livePickup('power', candidate.key)) continue;
        pick -= candidate.weight;
        if (pick <= 0) return candidate.key;
      }
      return fallback;
    },

    tryDropPackage: function (x, y) {
      if (this.phase !== 'fight' && this.phase !== 'intro') return;
      this.lastDropX = x == null ? (this.lastDropX || this.W / 2) : x;
      this.lastDropY = y == null ? (this.lastDropY || this.H * 0.3) : y;
      var debug = this.debugState || SC_DEBUG_STATE;
      if ((this.runTime >= this.nextPowerDrop || debug.forceGenerousDrops) && this.powerDrops < POWER_DROP_CAP) {
        var key = this.choosePower();
        var drop = this.spawnPickup('power', key, this.lastDropX, this.lastDropY, false);
        this.nextPowerDrop = this.runTime + (debug.forceGenerousDrops ? 6 : 15 + (this.rng ? this.rng() * 5 : Math.random() * 5));
        if (drop && debug.forceGenerousDrops && key === 'wing-squadron') this.setBanner('WING SIGNAL', 'First squadron is on approach', 0x8ff5d2);
      }
      if (this.runTime >= 56 && this.escortCount() === 0 && !this.livePickup('power', 'wing-squadron') && this.powerDrops < POWER_DROP_CAP) {
        this.spawnPickup('power', 'wing-squadron', this.lastDropX, this.lastDropY, false);
      }
      if ((this.runTime >= this.nextWeaponDrop || debug.forceWeaponDrop) && this.weaponDrops < WEAPON_DROP_CAP) {
        var forced = debug.forceWeaponDrop;
        var requested = typeof forced === 'string' && INTERCEPTOR_BY_KEY[forced] ? forced : null;
        var weaponKey = this.nextInterceptor(requested);
        var wd = this.spawnPickup('weapon', weaponKey, this.lastDropX, this.lastDropY, false);
        this.nextWeaponDrop = this.runTime + (forced ? 5 : 18);
        if (wd && typeof forced === 'string') debug.forceWeaponDrop = false;
      }
    },

    tidePressure: function () {
      if (this.runTime < TIDE_GATE) return 0;
      var live = 0, damaged = 0, lost = 0;
      for (var i = 0; i < this.threats.length; i++) if (this.threats[i].alive) live++;
      for (var j = 0; j < this.districts.length; j++) {
        if (!this.districts[j].alive) lost++;
        else if (this.districts[j].state === 1) damaged++;
      }
      return clamp(0.04 + (this.runTime - TIDE_GATE) * 0.0007 + lost * 0.14 + damaged * 0.065
        + clamp(live / 18, 0, 1) * 0.26 + clamp(this.tier / 16, 0, 1) * 0.12, 0.04, 0.88);
    },

    chooseTide: function () {
      var total = 0, fallback = 'last-bastion';
      for (var i = 0; i < TIDE_TURNERS.length; i++) {
        if (this.livePickup('tide', TIDE_TURNERS[i].key)) continue;
        total += TIDE_TURNERS[i].weight; fallback = TIDE_TURNERS[i].key;
      }
      if (!total) return fallback;
      var pick = (this.rng ? this.rng() : Math.random()) * total;
      for (var j = 0; j < TIDE_TURNERS.length; j++) {
        if (this.livePickup('tide', TIDE_TURNERS[j].key)) continue;
        pick -= TIDE_TURNERS[j].weight;
        if (pick <= 0) return TIDE_TURNERS[j].key;
      }
      return fallback;
    },

    tryDropTide: function () {
      var debug = this.debugState || SC_DEBUG_STATE;
      var forced = debug.forceTideDrop;
      if (this.runTime - this.lastTideDrop < TIDE_DROP_GAP) return false;
      if (!forced && (this.runTime < TIDE_GATE || (this.rng ? this.rng() : Math.random()) > this.tidePressure())) return false;
      var requested = typeof forced === 'string' && TIDE_BY_KEY[forced] ? forced : this.chooseTide();
      var p = this.spawnPickup('tide', requested, this.lastDropX || this.W / 2,
        this.lastDropY || this.H * 0.3, true);
      if (!p) return false;
      this.lastTideDrop = this.runTime;
      if (typeof forced === 'string') debug.forceTideDrop = false;
      return true;
    },

    magnetizePickupAt: function (x, y) {
      for (var i = 0; i < this.pickups.length; i++) {
        var p = this.pickups[i];
        if (!p.alive) continue;
        var dx = x - p.x, dy = y - p.y;
        if (dx * dx + dy * dy < 96 * 96) {
          p.magnetT = 1.2; p.magnetX = x; p.magnetY = y;
          p.vx = 0; p.vy = 0;
        }
      }
    },

    stepBonuses: function (dt) {
      this.runTime += dt;
      for (var i = 0; i < TIMED_POWER_KEYS.length; i++) {
        var key = TIMED_POWER_KEYS[i];
        if (this.buffs[key] > 0) this.buffs[key] = Math.max(0, this.buffs[key] - dt);
      }
      this.lastBastionT = Math.max(0, this.lastBastionT - dt);
      this.decoyT = Math.max(0, this.decoyT - dt);
      this.tryDropPackage(null, null);
      this.tryDropTide();

      for (i = 0; i < this.pickups.length; i++) {
        var p = this.pickups[i];
        if (!p.alive) continue;
        p.age += dt; p.life -= dt;
        if (p.magnetT > 0) {
          p.magnetT = Math.max(0, p.magnetT - dt);
          var mdx = p.magnetX - p.x, mdy = p.magnetY - p.y, ml = Math.hypot(mdx, mdy) || 1;
          p.vx = mdx / ml * 310; p.vy = mdy / ml * 310;
          if (ml < 22) { this.collectPickup(p); continue; }
        } else if (p.y < p.targetY) {
          p.vy = Math.min(58, p.vy + 24 * dt);
        } else {
          p.vy = 0;
          p.vx *= Math.pow(0.04, dt);
        }
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.y >= p.targetY) { p.y = p.targetY; p.vy = 0; }
        if (p.life <= 0) this.collectPickup(p, true);
      }
    },

    collectPickup: function (p, expired) {
      if (!p.alive) return;
      var category = p.category, kind = p.kind, x = p.x, y = p.y;
      p.alive = false;
      p.spr.setVisible(false); p.halo.setVisible(false); p.ring.setVisible(false);
      p.beacon.setVisible(false); p.parachute.setVisible(false);
      if (expired) return;
      if (category === 'weapon') {
        this.equipInterceptor(kind, true);
      } else if (category === 'tide') {
        this.activateTide(kind, x, y);
      } else {
        this.activatePower(kind, x, y);
      }
    },

    activatePower: function (key, x, y) {
      var data = POWER_BY_KEY[key];
      if (!data) return;
      if (data.duration) this.buffs[key] = Math.min(data.cap, (this.buffs[key] || 0) + data.duration);
      if (key === 'aegis-dome') this.shieldLeft = Math.max(this.shieldLeft, 2);
      else if (key === 'repair-crews') this.repairDistricts(2);
      else if (key === 'wing-squadron') this.restoreEscorts('wing');
      else if (key === 'purge-sky') this.purgeSky();
      else if (key === 'orbital-lance') this.orbitalLance(this.aimX, this.aimY);
      else if (key === 'strike-wing') {
        this.strikeCharges = Math.min(this.strikeCap, this.strikeCharges + 1);
        this.triggerSpectacle('strike', x, y, data.color, 'STRIKE WING', 'CHARGE BANKED');
      }
      else if (key === 'cluster-barrage') this.clusterBarrage(this.aimX, this.aimY);
      this.setBanner(data.name, data.instant ? 'FIELD PACKAGE RESOLVED' : 'SYSTEM BOOST ACTIVE', data.color);
      this.burst(this.fx.shield, x, y, data.rare ? 20 : 12, data.color);
      kit.audio.sfx(data.instant ? 'sfx_clear' : 'sfx_shield', { volume: 0.58 });
      this.updateDebugState();
    },

    activateTide: function (key, x, y) {
      var data = TIDE_BY_KEY[key];
      if (!data) return;
      this.lastTideTurner = key;
      if (key === 'last-bastion') {
        this.lastBastionT = 10;
        this.buffs.overdrive = Math.max(this.buffs.overdrive || 0, 10);
        this.shieldLeft = Math.max(this.shieldLeft, 3);
      } else if (key === 'sky-purge') {
        this.purgeSky();
      } else if (key === 'rally-squadron') {
        this.restoreEscorts('wing');
      } else if (key === 'chrono-repair') {
        this.repairDistricts(3);
      }
      this.setBanner(data.name, 'TIDE TURNER // THE CITY HOLDS', data.color);
      this.burst(this.fx.shield, x, y, 24, data.color);
      kit.audio.sfx('sfx_siren', { volume: 0.68, rate: 0.76 });
      this.updateDebugState();
    },

    chainLightning: function (x, y, tint) {
      var hits = 0;
      for (var pass = 0; pass < 3; pass++) {
        var nearest = null, bestD = 116 * 116;
        for (var i = 0; i < this.threats.length; i++) {
          var t = this.threats[i];
          if (!t.alive) continue;
          var dx = t.x - x, dy = t.y - y, dd = dx * dx + dy * dy;
          if (dd < bestD) { bestD = dd; nearest = t; }
        }
        if (!nearest) break;
        this.damageThreat(nearest, 1, tint || 0x8ff5d2);
        this.burst(this.fx.spark, nearest.x, nearest.y, 5, tint || 0x8ff5d2);
        x = nearest.x; y = nearest.y; hits++;
      }
      if (hits) kit.audio.sfx('sfx_splinter', { volume: 0.52, rate: 1.28 });
    },

    repairDistricts: function (count) {
      var repaired = 0;
      for (var i = 0; i < this.districts.length && repaired < count; i++) {
        var d = this.districts[i];
        if (!d.alive) { this.reviveDistrict(d); repaired++; }
      }
      for (i = 0; i < this.districts.length && repaired < count; i++) {
        d = this.districts[i];
        if (d.alive && d.state === 1) { d.state = 0; d.spr.setFrame('dist_' + d.face); repaired++; }
      }
      if (repaired) { this.hudCache.districts = -1; kit.audio.sfx('sfx_reload'); }
    },

    purgeSky: function () {
      for (var i = 0; i < this.threats.length; i++) {
        var t = this.threats[i];
        if (!t.alive) continue;
        if (THREAT[t.type].armoured) {
          this.damageThreat(t, 1, 0xffd978);
        } else {
          if (t.type === 'hydra') t.split = true;
          this.burst(this.fx.spark, t.x, t.y, 5, 0xfff0b0);
          this.registerKill(t);
        }
      }
      // Purge-class effects never one-shot the Obelisk. Heavy cruisers and the
      // boss retain a meaningful remaining health bar after the rescue.
      if (this.boss.active) {
        this.boss.hp = Math.max(1, this.boss.hp - Math.max(1, Math.floor(this.boss.maxHp * 0.18)));
        this.hudCache.volley = -1;
      }
      this.flashPlate.setAlpha(flashOn() ? 0.42 : 0);
      kit.juice.shake(7, 300);
    },

    orbitalLance: function (x, y) {
      var fx = this.freeLineFx();
      if (fx) {
        fx.alive = true; fx.age = 0; fx.life = 0.42; fx.x = x; fx.y = this.baseY * 0.5; fx.len = this.baseY;
        fx.spr.setVisible(true).setPosition(x, fx.y).setRotation(0).setDisplaySize(14, this.baseY)
          .setTint(0xffd978).setAlpha(0.9);
      }
      for (var i = 0; i < this.threats.length; i++) {
        var t = this.threats[i];
        if (!t.alive || Math.abs(t.x - x) > 44 + THREAT[t.type].r) continue;
        if (THREAT[t.type].armoured) this.damageThreat(t, 1, 0xffd978);
        else this.registerKill(t);
      }
      if (this.boss.active && Math.abs(this.boss.x - x) < this.boss.spr.displayWidth * 0.5) {
        this.boss.hp = Math.max(1, this.boss.hp - 3); this.hudCache.volley = -1;
      }
      this.burst(this.fx.spark, x, y, 20, 0xffd978);
    },

    clusterBarrage: function (x, y) {
      for (var i = 0; i < 8; i++) {
        var a = i * TAU / 8;
        this.detonate(x + Math.cos(a) * 34, y + Math.sin(a) * 34, 'flak-burst');
      }
      kit.audio.sfx('sfx_airburst', { volume: 0.7, rate: 0.78 });
      kit.juice.shake(6, 260);
    },

    escortCount: function () {
      var n = 0;
      for (var i = 0; i < this.escorts.length; i++) if (this.escorts[i].alive) n++;
      return n;
    },

    restoreEscorts: function (kind) {
      var cap = this.escortCap();
      for (var i = 0; i < this.escorts.length; i++) {
        var e = this.escorts[i];
        if (i >= cap) {
          e.alive = false; e.spr.setVisible(false); e.halo.setVisible(false);
          continue;
        }
        e.alive = true; e.kind = kind || 'wing'; e.x = this.W / 2; e.y = this.baseY - 90 - i * 30;
        e.fireT = 0.25 + i * 0.18; e.life = 0;
        e.spr.setVisible(true); e.halo.setVisible(true);
      }
      this.wingRecoveryDue = -1;
      kit.audio.sfx('sfx_reload', { volume: 0.7, rate: 1.15 });
    },

    loseEscort: function (e) {
      e.alive = false; e.spr.setVisible(false); e.halo.setVisible(false);
      this.lastEscortLoss = this.runTime;
      if (!this.escortCount() && this.buffs['drone-escort'] <= 0) this.wingRecoveryDue = this.runTime + 10;
      this.burst(this.fx.spark, e.x, e.y, 10, 0xff8a4c);
      kit.audio.sfx('sfx_impact', { volume: 0.44 });
    },

    stepEscorts: function (dt) {
      if (this.buffs['drone-escort'] > 0 && this.escortCount() === 0) this.restoreEscorts('drone');
      if (this.wingRecoveryDue > 0 && this.runTime >= this.wingRecoveryDue && this.escortCount() === 0) {
        this.restoreEscorts('wing');
        this.setBanner('WING RECOVERY', 'Two escorts are back in formation', 0x8ff5d2);
      }
      for (var i = 0; i < this.escorts.length; i++) {
        var e = this.escorts[i];
        if (!e.alive) continue;
        var side = i % 2 === 0 ? -1 : 1;
        var slot = Math.floor(i / 2);
        e.tx = this.W / 2 + side * Math.min(92, this.W * 0.16 + slot * 24);
        e.ty = this.baseY - 82 - slot * 22 - (motionOn() ? Math.sin(this.runTime * 2 + i) * 12 : 0);
        e.x += (e.tx - e.x) * Math.min(1, dt * 4.8);
        e.y += (e.ty - e.y) * Math.min(1, dt * 4.8);
        e.fireT -= dt;
        if (e.fireT <= 0) {
          var target = null, bestD = Infinity;
          for (var j = 0; j < this.threats.length; j++) {
            var t = this.threats[j];
            if (!t.alive) continue;
            var dx = t.x - e.x, dy = t.y - e.y, dd = dx * dx + dy * dy;
            if (dd < bestD) { bestD = dd; target = t; }
          }
          if (target) this.spawnInterceptor(e.x, e.y, target.x, target.y, 'standard-bolt', true);
          e.fireT = e.kind === 'drone' ? 0.92 : 0.68;
        }
      }
    },

    stepStrike: function (dt) {
      if (!this.strike.active) return;
      this.strike.t += dt;
      if (!this.strike.resolved && this.strike.t >= 0.38) {
        this.strike.resolved = true;
        var lane = this.strike.laneY;
        for (var i = 0; i < this.threats.length; i++) {
          var t = this.threats[i];
          if (!t.alive || Math.abs(t.y - lane) > 62) continue;
          if (THREAT[t.type].armoured) this.damageThreat(t, 1, 0xffd978);
          else this.registerKill(t);
        }
        if (this.boss.active && Math.abs(this.boss.y - lane) < 82) {
          this.boss.hp = Math.max(1, this.boss.hp - 4); this.hudCache.volley = -1;
        }
        this.triggerSpectacle('strike', this.W / 2, lane, PAL.amber, 'STRIKE WING', 'ALLIED BOMBER SWEEP');
        kit.audio.sfx('sfx_clear', { volume: 0.64, rate: 1.22 });
      }
      if (this.strike.t >= 1.35) this.strike.active = false;
    },

    callStrike: function (laneY) {
      if (this.strike.active || this.strikeCharges <= 0) {
        if (this.strikeCharges <= 0) {
          this.setBanner('STRIKE WING EMPTY', 'Collect a Strike Wing pickup', 0xff8092);
          kit.audio.sfx('sfx_dry', { volume: 0.46 });
        }
        return false;
      }
      this.strikeCharges--;
      this.startStrike(laneY);
      this.lastTapAt = 0;
      return true;
    },

    startStrike: function (laneY) {
      this.strike.active = true; this.strike.t = 0; this.strike.resolved = false;
      this.strike.laneY = clamp(laneY == null ? this.aimY : laneY, 110, this.baseY - 76);
      this.triggerSpectacle('strike', this.W / 2, this.strike.laneY, PAL.amber, 'STRIKE WING', 'BOMBER SWEEP ARMED');
      kit.audio.sfx('sfx_siren', { volume: 0.58, rate: 1.24 });
    },

    paintPickups: function (dt) {
      for (var i = 0; i < this.pickups.length; i++) {
        var p = this.pickups[i];
        if (!p.alive) continue;
        var blink = p.life < 4 && Math.floor(p.life * 8) % 2 === 0;
        var bob = motionOn() ? Math.sin(p.age * 3.2 + p.bob) * 3 : 0;
        p.spr.setPosition(p.x, p.y + bob).setRotation(motionOn() ? Math.sin(p.age * 1.8 + p.bob) * 0.06 : 0).setVisible(!blink);
        p.halo.setPosition(p.x, p.y + bob).setAlpha((p.tide ? 0.22 : 0.28) + (motionOn() ? Math.sin(p.age * 4) * 0.06 : 0)).setVisible(!blink);
        p.ring.setPosition(p.x, p.y + bob).setRotation(motionOn() ? p.age * (p.tide ? 0.8 : 0.45) : 0).setVisible(!blink);
        p.beacon.setPosition(p.x, p.y - (p.tide ? 66 : 46)).setVisible(!blink);
        p.parachute.setPosition(p.x, p.y - 30 + bob).setVisible(!blink && p.y < p.targetY - 3);
      }
    },

    paintEscorts: function () {
      for (var i = 0; i < this.escorts.length; i++) {
        var e = this.escorts[i];
        if (!e.alive) continue;
        var tint = e.kind === 'drone' ? 0x6ce4db : 0x8ff5d2;
        e.spr.setPosition(e.x, e.y).setRotation(motionOn() ? Math.sin(this.runTime * 2 + i) * 0.12 : 0)
          .setTint(tint).setAlpha(0.9);
        e.halo.setPosition(e.x, e.y).setDisplaySize(44, 44).setTint(tint)
          .setAlpha(0.18 + (motionOn() ? Math.sin(this.runTime * 5 + i) * 0.04 : 0));
      }
    },

    paintStrike: function () {
      if (!this.strike.active) {
        this.strikeLane.setVisible(false); this.strikeEdge.setVisible(false); this.strikeShip.setVisible(false);
        return;
      }
      var k = clamp(this.strike.t / 1.35, 0, 1);
      var shipX = lerp(-48, this.W + 48, k);
      this.strikeLane.setVisible(true).setPosition(this.W / 2, this.strike.laneY)
        .setSize(this.W, 46).setAlpha(this.strike.t < 0.38 ? 0.12 + this.strike.t * 0.5 : 0.28);
      this.strikeEdge.setVisible(true).setPosition(this.W / 2, this.strike.laneY - 24)
        .setSize(this.W, 2).setAlpha(0.5 + (motionOn() ? Math.sin(this.runTime * 18) * 0.25 : 0));
      this.strikeShip.setVisible(true).setPosition(shipX, this.strike.laneY - 44)
        .setRotation(k < 0.5 ? 0.08 : -0.08);
    },

    stepLineFx: function (dt) {
      for (var i = 0; i < this.lineFx.length; i++) {
        var fx = this.lineFx[i];
        if (!fx.alive) continue;
        fx.age += dt;
        if (fx.age >= fx.life) {
          fx.alive = false; fx.spr.setVisible(false); continue;
        }
        fx.spr.setAlpha(0.92 * (1 - fx.age / fx.life));
      }
    },

    updateDebugState: function () {
      var st = this.debugState || SC_DEBUG_STATE;
      if (!this.pickups || !this.districts) return;
      if (st.forceGrantScrap) {
        var grant = typeof st.forceGrantScrap === 'number' ? st.forceGrantScrap : 500;
        if (grant > 0) grantSalvage(grant);
        st.forceGrantScrap = 0;
        persist();
      }
      if (st.forceSpectacle && !this.spectacle.active) {
        var sk = typeof st.forceSpectacle === 'string' ? st.forceSpectacle : 'tide';
        var forced = sk === 'strike' ? ['strike', PAL.amber, 'STRIKE WING', 'FORCED SPECTACLE']
          : sk === 'boss' ? ['boss', PAL.violet, 'THE OBELISK', 'FORCED ENTRANCE']
          : ['tide', PAL.amber, 'TIDE TURNER', 'FORCED CITY SAVE'];
        if (this.triggerSpectacle(forced[0], this.W / 2, this.H * 0.34, forced[1], forced[2], forced[3])) {
          st.forceSpectacle = false;
        }
      }
      st.wave = this.mode === 'siege' ? this.siegeWave : Math.max(1, this.volley + 1);
      var live = 0, damaged = 0;
      for (var i = 0; i < this.threats.length; i++) if (this.threats[i].alive) live++;
      for (var j = 0; j < this.districts.length; j++) if (this.districts[j].state === 1) damaged++;
      st.pressure = clamp(live / 14 + damaged * 0.12 + (6 - this.aliveDistricts()) * 0.18 + this.tier * 0.018, 0, 1);
      st.equippedInterceptor = this.equippedInterceptor;
      st.weaponsSeen = this.weaponSeenCount;
      st.escortCount = this.escortCount();
      st.tideOdds = this.tidePressure();
      st.lastTideTurner = this.lastTideTurner || '';
      syncHangarDebug();
      var count = 0;
      for (var k = 0; k < this.pickups.length; k++) {
        var p = this.pickups[k];
        if (!p.alive) continue;
        var rec = this.debugPickupRecords[count];
        rec.type = p.category + ':' + p.kind; rec.x = Math.round(p.x); rec.y = Math.round(p.y);
        st.livePickups[count++] = rec;
      }
      st.livePickups.length = count;
    },

    // A warhead only destroys the district it actually lands on. It used to
    // be enough to reach the district's Y: a wraith that had dodged halfway
    // across the screen, or anything blown sideways by a crosswind night,
    // still levelled its original target, and if that district was already
    // gone the hit was RETARGETED onto the first surviving one, which could
    // even consume that district's shield. Both are gone: the impact is a
    // real overlap test against the target's footprint, and a miss is a miss
    // (fix round 1, code review).
    groundImpact: function (x, y, near) {
      this.burst(this.fx.debris, x, y, 12, 0xffab6a);
      this.burst(this.fx.smoke, x, y - 6, 4);
      this.burst(this.fx.ember, x, y, 10);
      this.burst(this.fx.spark, x, y, 12, 0xff7a4a);
      kit.juice.shake(near ? 7 : 3.4, near ? 260 : 150);
      kit.audio.sfx('sfx_impact', { volume: near ? 0.75 : 0.42 });
    },

    strikeDistrict: function (t) {
      var d = t.district;
      var hit = d && d.alive && Math.abs(t.x - d.x) <= d.halfW + THREAT[t.type].r;

      if (!hit) {
        // Off target: it hits the rooftops between districts. Scorches the
        // nearest surviving district but never destroys it.
        this.groundImpact(t.x, Math.min(t.y, this.baseY + 12), false);
        if (flashOn()) this.hitFlash = Math.max(this.hitFlash, 0.12);
        var closest = null, cd = Infinity;
        for (var i = 0; i < this.districts.length; i++) {
          var c = this.districts[i];
          if (!c.alive) continue;
          var dd = Math.abs(c.x - t.x);
          if (dd < cd) { cd = dd; closest = c; }
        }
        if (closest && cd < closest.halfW * 2.2) this.damageDistrict(closest);
        this.killThreatSprite(t);
        return;
      }

      this.combo = 0;
      this.comboT = 0;

      if (this.lastBastionT > 0 || this.buffs['aegis-dome'] > 0) {
        this.burst(this.fx.shield, t.x, t.y, 20, this.lastBastionT > 0 ? 0xffd978 : 0x6ef6ff);
        kit.audio.sfx('sfx_shield', { volume: 0.7, rate: this.lastBastionT > 0 ? 0.72 : 1.12 });
        this.popText(d.x, d.y - 46, this.lastBastionT > 0 ? 'BASTION HELD' : 'AEGIS HELD', '#8cf4e2');
        this.triggerSpectacle('save', d.x, d.y - 18, this.lastBastionT > 0 ? PAL.amber : PAL.cyan,
          'CITY SAVE', this.lastBastionT > 0 ? 'LAST BASTION HOLDS' : 'AEGIS DOME HOLDS');
        this.killThreatSprite(t);
        return;
      }

      if (this.shieldLeft > 0) {
        this.shieldLeft--;
        d.shieldT = 1.0;                       // drives the scanning highlight
        d.shield.setVisible(true).setAlpha(0.95);
        d.shieldHi.setVisible(true).setAlpha(0.9);
        this.tweens.add({ targets: d.shield, alpha: 0, duration: 700, ease: 'Cubic.easeOut',
          onComplete: function (tw, tg) { tg[0].setVisible(false); } });
        this.burst(this.fx.shield, t.x, t.y, 18);
        kit.audio.sfx('sfx_shield');
        kit.juice.shake(3, 160);
        this.popText(d.x, d.y - 46, 'SHIELD HELD', '#8cf4e2');
        this.triggerSpectacle('save', d.x, d.y - 18, PAL.teal, 'CITY SAVE', 'DISTRICT SHIELD HOLDS');
        this.damageDistrict(d);
        this.killThreatSprite(t);
        return;
      }

      // City Plating turns direct impacts into a real hit-point track. The
      // base tier remains the round 1 one-hit rule; later tiers leave the
      // district standing through additional direct strikes.
      if (d.hp > 1) {
        d.hp--;
        this.groundImpact(t.x, t.y, true);
        this.damageDistrict(d);
        this.triggerSpectacle('save', d.x, d.y - 18, PAL.green, 'CITY SAVE', 'PLATING ABSORBED THE STRIKE');
        this.popText(d.x, d.y - 46, 'PLATING HELD', '#8cf4e2');
        this.killThreatSprite(t);
        return;
      }

      // Ground impact: the second hero VFX after the airburst.
      this.groundImpact(t.x, t.y, true);
      if (flashOn()) this.hitFlash = 0.28;
      kit.juice.hitStop(70);

      d.alive = false;
      d.state = 2;
      d.spr.setFrame('dist_' + d.face + '_ruin');
      d.shield.setVisible(false);
      d.shieldHi.setVisible(false);
      d.fireT = 0;
      this.hudCache.districts = -1;
      kit.audio.sfx('sfx_district', { volume: 0.6 });
      this.popText(d.x, d.y - 46, 'DISTRICT LOST', '#ff8092');
      this.killThreatSprite(t);
      // NOTE: the prototype awarded score for a district being destroyed.
      // That was a scoring defect, not a design choice, and is not carried.
      if (this.aliveDistricts() <= 0) this.loseNight();
    },

    // A near miss or a shielded hit leaves the district standing but visibly
    // hurt: blackout floors, a snapped antenna and a roof fire.
    damageDistrict: function (d) {
      if (!d.alive || d.state !== 0) return;
      d.state = 1;
      d.spr.setFrame('dist_' + d.face + '_dmg');
      this.burst(this.fx.ember, d.x, d.y - 24, 6);
    },

    // ----------------------------------------------------------- boss night
    startBoss: function () {
      var b = this.boss;
      b.active = true;
      b.dead = false;
      b.maxHp = 26;
      b.hp = b.maxHp;
      b.x = this.W / 2;
      b.y = -140;
      b.phase = 1;
      b.fireT = 2.0;
      b.hitCool = 0;
      b.drift = 0;
      b.entering = true;
      b.spr.setVisible(true).setPosition(b.x, b.y).setAlpha(1).setTint(0xffffff);
      b.portX = b.spr.displayWidth * 0.5 * 0.62;
      this.bossGlow.setVisible(true).setAlpha(0.3).setPosition(b.x, b.y);
      this.setBanner('THE OBELISK', 'It is the launcher. Break it.', 0xec9bff);
      this.triggerSpectacle('boss', b.x, this.H * 0.25, PAL.violet, 'THE OBELISK', 'BOSS ENTRANCE');
      kit.audio.sfx('sfx_siren');
      this.hudCache.volley = -1;
    },

    bossStep: function (dt) {
      var b = this.boss;
      if (!b.active) return;
      var restY = this.H * 0.22;
      if (b.entering) {
        b.y += (restY - b.y) * Math.min(1, dt * 1.6);
        if (restY - b.y < 2) { b.entering = false; b.y = restY; }
      } else {
        b.drift += dt;
        b.x = this.W / 2 + Math.sin(b.drift * 0.6) * this.W * 0.20;
        b.y = restY + Math.sin(b.drift * 1.1) * 8;
      }
      b.spr.setPosition(b.x, b.y);
      this.bossGlow.setPosition(b.x, b.y)
        .setAlpha(0.22 + 0.10 * Math.sin(b.drift * 3.4));
      if (b.hitCool > 0) b.hitCool -= dt;

      var frac = b.hp / b.maxHp;
      var want = frac < 0.30 ? 3 : (frac < 0.62 ? 2 : 1);
      if (want !== b.phase) {
        b.phase = want;
        this.setBanner('PORTS OPEN', 'The Obelisk is firing harder', 0xec9bff);
        kit.audio.sfx('sfx_cruiser');
        this.burst(this.fx.spark, b.x, b.y, 20, 0xec9bff);
        kit.juice.shake(5, 220);
      }

      if (b.entering) return;
      b.fireT -= dt;
      if (b.fireT <= 0) {
        b.fireT = (b.phase === 3 ? 1.15 : b.phase === 2 ? 1.55 : 2.0);
        var n = b.phase === 3 ? 3 : b.phase === 2 ? 2 : 2;
        var pool = b.phase === 3 ? ['hydra', 'wraith', 'streak']
          : b.phase === 2 ? ['wraith', 'streak', 'shard'] : ['shard', 'streak'];
        var halfW = b.spr.displayWidth * 0.5;
        // The ports fire where the telegraph beams just charged, and each one
        // discharges with a flare so the warning pays off visually.
        for (var k = 0; k < 2; k++) {
          this.burst(this.fx.spark, b.x + (k ? 1 : -1) * b.portX, b.y + 14, 8, 0xff9ad8);
        }
        kit.juice.shake(3.2, 150);
        for (var i = 0; i < n; i++) {
          var side = (i % 2 === 0) ? -1 : 1;
          var px = b.x + side * halfW * 0.62;
          var py = b.y + (i - n / 2) * 12;
          this.spawnThreat(pool[Math.floor(this.rng() * pool.length)], px, py, null);
          this.burst(this.fx.exhaust, px, py, 4, 0xff96c0);
        }
      }
    },

    damageBoss: function (blast) {
      var b = this.boss;
      if (!b.active || b.dead || blast.hitBoss) return;
      var hw = b.spr.displayWidth * 0.42, hh = b.spr.displayHeight * 0.42;
      if (Math.abs(blast.x - b.x) > hw + blast.r || Math.abs(blast.y - b.y) > hh + blast.r) return;
      blast.hitBoss = true;
      b.hp -= blast.damage || 1;
      this.addScore(120, b.x, b.y + 20, '+120');
      this.burst(this.fx.spark, blast.x, blast.y, 10, 0xffd0f0);
      b.spr.setTint(0xffb0d8);
      kit.audio.sfx('sfx_armor', { volume: 0.6 });
      kit.juice.shake(2.6, 120);
      var spr = b.spr;
      this.time.delayedCall(70, function () { if (spr) spr.setTint(0xffffff); });
      this.hudCache.volley = -1;
      if (b.hp <= 0) this.killBoss();
    },

    killBoss: function () {
      var self = this;
      var b = this.boss;
      b.dead = true;
      b.active = false;
      this.triggerSpectacle('boss', b.x, b.y, PAL.violet, 'OBELISK DOWN', 'THE SKY IS OURS');
      this.bossBeams[0].setVisible(false);
      this.bossBeams[1].setVisible(false);
      if (flashOn()) this.flashPlate.setAlpha(0.7);
      kit.juice.shake(12, 900);
      kit.juice.hitStop(110);
      kit.audio.sfx('sfx_defeat', { volume: 0.5 });
      kit.audio.sfx('sfx_airburst');
      var bx = b.x, by = b.y;
      for (var i = 0; i < 7; i++) {
        (function (i) {
          self.time.delayedCall(i * 130, function () {
            var x = bx + (Math.random() * 2 - 1) * 60;
            var y = by + (Math.random() * 2 - 1) * 60;
            self.burst(self.fx.spark, x, y, 16, 0xffd0f0);
            self.burst(self.fx.smoke, x, y, 5);
            self.burst(self.fx.debris, x, y, 10, 0xd08fff);
            kit.juice.shake(6, 220);
            kit.audio.sfx('sfx_airburst', { volume: 0.5, rate: 0.7 + Math.random() * 0.3 });
          });
        })(i);
      }
      this.tweens.add({ targets: [b.spr, this.bossGlow], alpha: 0, duration: 900,
        ease: 'Cubic.easeIn', onComplete: function () { b.spr.setVisible(false); } });
      this.addScore(3000, this.W / 2, this.H * 0.4, 'OBELISK DOWN +3000', '#ec9bff');
      this.time.delayedCall(1900, function () {
        // Clear the sky it launched before it died.
        for (var t = 0; t < self.threats.length; t++) {
          if (self.threats[t].alive) {
            self.burst(self.fx.spark, self.threats[t].x, self.threats[t].y, 6);
            self.killThreatSprite(self.threats[t]);
          }
        }
        self.winNight();
      });
    },

    // ------------------------------------------------------------- outcome
    winNight: function () {
      if (this.phase === 'won' || this.phase === 'lost') return;
      this.phase = 'won';
      this.phaseT = 0;
      kit.audio.sfx('sfx_clear');
      kit.audio.music('music_night', 900);

      var survivors = this.aliveDistricts();
      // ACCURACY IS A RATIO, NOT A KILL COUNT. kills/shotsFired routinely goes
      // ABOVE one - one blast can take a hydra and all three of its children -
      // so the "40 point accuracy contribution" was unbounded and a single
      // lucky chain paid more than the whole rest of the night. Clamped to the
      // 0-1 it was always documented as (fix round 1, code review).
      var acc = this.shotsFired ? clamp(this.kills / this.shotsFired, 0, 1) : 0;

      if (this.mode === 'siege') {
        if (this.score > profile.siege) profile.siege = clamp(this.score, 0, MAX_SCORE);
        persist();
        this.showOverlay('WAVE ' + this.siegeWave + ' HELD', 'Score ' + this.score, 'CONTINUE');
        return;
      }

      var replay = this.nightIndex < profile.night;
      var salvage = Math.round((25 + this.nightIndex * 12 + survivors * 18 + acc * 40 +
        (survivors === 6 ? 60 : 0)) * (replay ? 0.4 : 1));
      if (this.buffs['scrap-doubler'] > 0) salvage *= 2;
      // Every write to the economy goes through the same policy bound the save
      // validator enforces. The command bank keeps 75% of the run result.
      var banked = bankRunEarnings(salvage);
      if (this.score > profile.best) profile.best = clamp(this.score, 0, MAX_SCORE);
      if (this.nightIndex >= profile.night) profile.night = Math.min(NIGHTS.length + 1, this.nightIndex + 1);
      persist();

      var done = this.nightIndex === NIGHTS.length;
      this.showOverlay(done ? 'THE SKY IS CLEAR' : 'NIGHT ' + this.nightIndex + ' HELD',
        'Districts ' + survivors + '/6   Score ' + this.score + '   Scrap +' + banked,
        done ? 'RETURN TO COMMAND' : 'CONTINUE');
    },

    loseNight: function () {
      if (this.phase === 'lost' || this.phase === 'won') return;
      this.phase = 'lost';
      this.phaseT = 0;
      this.keyFire = false;
      kit.audio.sfx('sfx_defeat');
      kit.audio.stopMusic(700);
      if (flashOn()) this.flashPlate.setAlpha(0.5);
      kit.juice.shake(10, 700);
      for (var i = 0; i < this.threats.length; i++) if (this.threats[i].alive) this.killThreatSprite(this.threats[i]);
      this.burst(this.fx.ember, this.W / 2, this.baseY, 26);

      if (this.mode === 'siege') {
        if (this.score > profile.siege) profile.siege = clamp(this.score, 0, MAX_SCORE);
      } else if (this.score > profile.best) {
        profile.best = clamp(this.score, 0, MAX_SCORE);
      }
      // A lost night still pays a reduced salvage cut so a hard night is
      // never a dead end.
      var lossBanked = 0;
      if (this.mode === 'campaign') {
        lossBanked = bankRunEarnings(10 + this.nightIndex * 4);
      }
      persist();
      this.showOverlay('COMMAND LOST',
        'Score ' + this.score + (this.mode === 'campaign' ? '   Scrap +' + lossBanked : ''),
        'REDEPLOY');
    },

    showOverlay: function (title, sub, action) {
      var self = this;
      var w = this.W, h = this.H;
      if (this.overlay) this.overlay.destroy(true);
      var c = this.add.container(0, 0).setScrollFactor(0).setDepth(200);
      var dim = this.add.rectangle(w / 2, h / 2, w, h, 0x040a16, 0.78);
      c.add(dim);
      var pw = Math.min(w - 40, 320);
      var g = this.add.graphics();
      g.fillStyle(0x081426, 0.96);
      g.fillRoundedRect(w / 2 - pw / 2, h * 0.32, pw, 190, 14);
      g.lineStyle(1.8, 0x6ef6ff, 0.8);
      g.strokeRoundedRect(w / 2 - pw / 2, h * 0.32, pw, 190, 14);
      c.add(g);
      var t1 = label(this, w / 2, h * 0.32 + 30, title, 21,
        this.phase === 'lost' ? '#ff8092' : '#8ff5d2', 'bold').setOrigin(0.5);
      t1.setScale(0.6);
      c.add(t1);
      this.tweens.add({ targets: t1, scale: 1, duration: 360, ease: 'Back.easeOut' });
      var t2 = label(this, w / 2, h * 0.32 + 62, sub, 11, '#a8cfe0').setOrigin(0.5);
      t2.setWordWrapWidth(pw - 30);
      t2.setAlign('center');
      c.add(t2);

      c.add(button(this, w / 2, h * 0.32 + 118, pw - 60, 42, action, function () {
        self.onOverlayConfirm();
      }));
      c.add(button(this, w / 2, h * 0.32 + 166, pw - 60, 34, 'COMMAND', function () {
        kit.audio.sfx('sfx_ui');
        self.scene.start('command');
      }, { fill: 0x14243c, size: 12 }));
      this.overlay = c;
    },

    onOverlayConfirm: function () {
      var self = this;
      if (this.phase === 'lost') {
        kit.audio.sfx('sfx_ui');
        // REDEPLOY goes through GGKit, not straight to scene.restart: the kit
        // clears its pointer map and key set BEFORE onRestart runs, so a
        // finger still held on the screen from the losing frame cannot carry
        // its aim into the new run (fix round 1, code review).
        this.keyFire = false;
        kit.restart();
        return;
      }
      if (this.phase === 'won') {
        kit.audio.sfx('sfx_ui');
        this.keyFire = false;
        kit.input.clearAll();               // same rule on the advance path
        if (this.mode === 'siege') {
          // Siege never ends; roll straight into the next wave.
          if (this.overlay) { this.overlay.destroy(true); this.overlay = null; }
          this.phase = 'gap';
          this.phaseT = 1.0;
          return;
        }
        if (this.nightIndex >= NIGHTS.length) { this.scene.start('command'); return; }
        this.scene.restart({ night: this.nightIndex + 1, mode: 'campaign' });
      }
    },

    openPause: function () {
      var self = this;
      if (this.phase === 'lost' || this.phase === 'won') return;
      kit.audio.sfx('sfx_ui');
      kit.pause('menu');
      var w = this.W, h = this.H;
      var box = document.createElement('div');
      box.style.cssText = 'position:fixed;inset:0;z-index:9300;display:flex;flex-direction:column;' +
        'align-items:center;justify-content:center;gap:14px;overflow:hidden;' +
        'background:' + SKIN.bg + ';' +
        'color:#e8ffff;font-family:' + SKIN.font + ';text-align:center;' +
        'padding:env(safe-area-inset-top) env(safe-area-inset-right) ' +
        'env(safe-area-inset-bottom) env(safe-area-inset-left);';
      // The pause screen sits over the same city horizon as the loader, the
      // settings sheet and the title, so no screen in the game ships in the
      // kit's default utility grey (fix round 1, art review).
      box.appendChild(skylineStrip());
      var head = document.createElement('div');
      head.textContent = 'PAUSED';
      head.style.cssText = 'font-size:22px;font-weight:700;letter-spacing:4px;z-index:1;' +
        'color:' + CSS.ice + ';text-shadow:0 0 18px rgba(110,246,255,.55);';
      box.appendChild(head);
      var rule = document.createElement('div');
      rule.style.cssText = 'width:min(70vw,300px);height:2px;z-index:1;' +
        'background:linear-gradient(90deg,rgba(110,246,255,0),' + CSS.cyan + ',rgba(110,246,255,0));';
      box.appendChild(rule);
      var subLine = document.createElement('div');
      subLine.textContent = (this.mode === 'siege' ? 'Siege wave ' + this.siegeWave
        : 'Night ' + this.nightIndex + ' - ' + this.night.name) + '   Score ' + this.score;
      subLine.style.cssText = 'font-size:12px;letter-spacing:1px;color:' + CSS.cyan +
        ';margin-bottom:6px;z-index:1;';
      box.appendChild(subLine);

      function row(text, fn, accent) {
        var b = document.createElement('button');
        b.textContent = text;
        b.style.cssText = 'font:inherit;font-size:15px;font-weight:700;letter-spacing:1px;' +
          'min-width:min(70vw,260px);z-index:1;position:relative;' +
          'padding:13px 18px;border-radius:10px;border:1px solid ' +
          (accent ? CSS.cyan : '#2e5e74') + ';background:' +
          (accent ? 'linear-gradient(180deg,#164a63,#0d2b3d)'
                  : 'linear-gradient(180deg,#132842,#0b1a2e)') +
          ';color:' + CSS.ice + ';box-shadow:0 0 18px rgba(110,246,255,' +
          (accent ? '.28' : '.10') + ') inset;';
        b.addEventListener('click', fn);
        box.appendChild(b);
      }
      function close() { box.remove(); kit.resume('menu'); }
      row('RESUME', function () { kit.audio.sfx('sfx_ui'); close(); }, true);
      row('SETTINGS', function () { kit.audio.sfx('sfx_ui'); openSettings(); });
      row('RESTART NIGHT', function () {
        kit.audio.sfx('sfx_ui');
        close();
        kit.restart();
      });
      row('FULLSCREEN', function () { kit.requestFullscreen(); });
      row('COMMAND', function () {
        kit.audio.sfx('sfx_ui');
        close();
        self.scene.start('command');
      });
      document.body.appendChild(box);
    },

    // ------------------------------------------------------------ tutorial
    startTutorial: function () {
      this.spawnHold = true;
      this.tut = {
        step: -1, awaitTap: false, timer: 0, fired: 0, killed: 0,
        box: null, t1: null, t2: null, hand: null
      };
      var w = this.W;
      // The panel used to sit at 0.60 H, straight across the middle of the
      // active playfield, so training text covered the very warheads it was
      // describing. It now sits low, under the aiming clamp and above the
      // skyline, and the teaching is done by coach marks - a numbered step
      // counter, the pulsing reticle ring, and an arrow that points at the
      // exact HUD element each step is about (fix round 1, art review).
      var c = this.add.container(w / 2, this.H * 0.79).setScrollFactor(0).setDepth(140);
      var pw = Math.min(w - 36, 320);
      c.add(this.add.rectangle(0, 0, pw, 68, 0x071426, 0.9));
      c.add(this.add.rectangle(0, -34, pw, 1.6, 0xffd978, 0.85));
      c.add(this.add.rectangle(0, 34, pw, 1.6, 0xffd978, 0.85));
      this.tut.t1 = label(this, 0, -24, 'TRAINING', 12, '#ffd978', 'bold').setOrigin(0.5, 0);
      this.tut.t2 = label(this, 0, 2, '', 12, '#e8ffff').setOrigin(0.5, 0);
      this.tut.t2.setWordWrapWidth(pw - 24);
      this.tut.t2.setAlign('center');
      c.add(this.tut.t1);
      c.add(this.tut.t2);
      this.tut.box = c;

      this.tut.hand = this.add.image(w / 2, this.H * 0.34, 'atlas', 'ring')
        .setScrollFactor(0).setDepth(139).setBlendMode(Phaser.BlendModes.ADD)
        .setScale(0.28).setAlpha(0.8).setVisible(false);
      this.tweens.add({ targets: this.tut.hand, scale: 0.44, alpha: 0.15, duration: 900,
        yoyo: true, repeat: -1, ease: 'Sine.easeOut' });

      // Coach-mark arrow: a chevron that parks under whatever the current step
      // is talking about and bobs toward it.
      this.tut.arrow = this.add.image(0, 0, 'atlas', 'chev')
        .setScrollFactor(0).setDepth(141).setBlendMode(Phaser.BlendModes.ADD)
        .setTint(0xffd978).setScale(0.9).setVisible(false);
      this.tut.arrowY = 0;
      this.tut.arrowT = 0;

      this.tutStep(0);
    },

    TUT_STEPS: [
      { text: 'Tap the sky to launch an interceptor from the nearest battery.', hand: true },
      { text: 'The blast destroys anything caught inside. Aim ahead of the warhead.', hand: true },
      { text: 'Each battery carries limited interceptors. Watch the counters below.',
        point: 'ammo' },
      { text: 'Six districts are your lifeline. Lose them all and the night is lost.',
        point: 'pips', tap: true }
    ],

    // Where the coach-mark arrow parks for a given step, and which way it
    // points. Returned in screen space; the arrow is scroll-locked.
    tutTarget: function (kind) {
      if (kind === 'ammo') {
        var b = this.batteries[1];
        return { x: b.x, y: this.baseY + 52, up: true };
      }
      if (kind === 'pips') {
        return { x: 14 + 2.5 * 15 + 5, y: Game.insets.top + 62 + 26, up: true };
      }
      return null;
    },

    tutStep: function (i) {
      if (!this.tut) return;
      if (i >= this.TUT_STEPS.length) { this.tutFinish(); return; }
      var s = this.TUT_STEPS[i];
      this.tut.step = i;
      this.tut.timer = 0;
      this.tut.awaitTap = !!s.tap;
      this.tut.t1.setText('TRAINING   ' + (i + 1) + ' / ' + this.TUT_STEPS.length);
      this.tut.t2.setText(s.text);
      this.tut.box.setAlpha(0).setScale(0.94);
      this.tweens.add({ targets: this.tut.box, alpha: 1, scale: 1, duration: 260,
        ease: 'Back.easeOut' });
      this.tut.hand.setVisible(!!s.hand);
      var tgt = s.point ? this.tutTarget(s.point) : null;
      if (tgt) {
        this.tut.arrowY = tgt.y;
        this.tut.arrow.setVisible(true).setPosition(tgt.x, tgt.y)
          .setRotation(tgt.up ? 0 : Math.PI).setAlpha(0.95);
      } else {
        this.tut.arrow.setVisible(false);
      }
      if (i === 0 || i === 1) {
        // Give the trainee something to shoot at.
        var live = false;
        for (var t = 0; t < this.threats.length; t++) if (this.threats[t].alive) live = true;
        if (!live) {
          this.rng = makeRng(0x7A11 + i);
          this.tier = 0.4;
          var th = this.spawnThreat('shard', this.W * (0.3 + 0.4 * i), -14, this.districts[i === 0 ? 1 : 4]);
          if (th) { th.speed *= 0.55; th.vx *= 0.55; th.vy *= 0.55; }
        }
      }
      if (i >= 2) {
        this.tut.hand.setVisible(false);
      }
    },

    tutAdvance: function () {
      if (!this.tut) return;
      kit.audio.sfx('sfx_ui', { volume: 0.6 });
      this.tutStep(this.tut.step + 1);
    },

    tutNotify: function (what) {
      if (!this.tut) return;
      if (what === 'fire') {
        this.tut.fired++;
        if (this.tut.step === 0) this.tutStep(1);
      } else if (what === 'kill') {
        this.tut.killed++;
        if (this.tut.step === 1) this.tutStep(2);
      }
    },

    tutStepTick: function (dt) {
      if (!this.tut) return;
      this.tut.timer += dt;
      var s = this.TUT_STEPS[this.tut.step];
      if (!s) return;
      if (this.tut.step === 2 && this.tut.timer > 3.0) this.tutStep(3);
      // Keep a target on screen during the aiming steps.
      if (this.tut.step <= 1 && this.tut.timer > 4.5) {
        var live = false;
        for (var t = 0; t < this.threats.length; t++) if (this.threats[t].alive) live = true;
        if (!live) {
          this.tut.timer = 0;
          var th = this.spawnThreat('shard', this.W * (0.25 + Math.random() * 0.5), -14, null);
          if (th) { th.speed *= 0.55; th.vx *= 0.55; th.vy *= 0.55; }
        }
      }
    },

    tutFinish: function () {
      if (!this.tut) return;
      var box = this.tut.box, hand = this.tut.hand, arrow = this.tut.arrow;
      this.tweens.add({ targets: [box, hand, arrow], alpha: 0, duration: 300,
        onComplete: function () { box.destroy(true); hand.destroy(); arrow.destroy(); } });
      this.tut = null;
      this.spawnHold = false;
      profile.tut = true;
      persist();
      // Start the real first volley. Training used to hand back with
      // volleyTotal still 0, so stepVolley immediately declared an empty
      // volley clear, ticked the counter to 1 and skipped straight to the
      // SECOND volley - night one only ever ran two of its three
      // (fix round 1, code review).
      this.volley = 0;
      this.beginVolley();
      this.setBanner('VOLLEY 1', 'Incoming on the coastal grid', 0x6ef6ff);
    },

    // ============================================================ sim step
    step: function (dt) {
      var i, j;

      // Phase clock -------------------------------------------------------
      if (this.phase === 'intro') {
        this.phaseT += dt;
        if (this.phaseT > 1.4) {
          this.phaseT = 0;
          if (this.tut) { this.phase = 'fight'; }
          else { this.beginVolley(); }
        }
      } else if (this.phase === 'gap') {
        this.phaseT -= dt;
        if (this.phaseT <= 0) {
          if (this.pendingBoss) { this.pendingBoss = false; this.startBoss(); this.phase = 'fight'; }
          else this.beginVolley();
        }
      }

      // QUEUED-FIRE RACE FIX: consumed here, once, inside the sim step.
      this.consumeQueuedFire();

      if (this.tut) this.tutStepTick(dt);

      if (this.phase === 'fight') this.stepVolley(dt);
      this.stepBonuses(dt);
      this.stepStrike(dt);
      this.stepEscorts(dt);
      this.stepShots(dt);
      this.stepThreats(dt);
      this.stepBlasts(dt);
      if (this.boss.active) this.bossStep(dt);
      this.stepBatteries(dt);

      // Combo decay.
      if (this.comboT > 0) {
        this.comboT -= dt;
        if (this.comboT <= 0) this.combo = 0;
      }
      this.hitFlash = Math.max(0, this.hitFlash - dt);

      // Music intensity: the alert stem takes over when the sky is busy or
      // the city is burning. GGKit crossfades between the phase-locked stems.
      var live = 0;
      for (i = 0; i < this.threats.length; i++) if (this.threats[i].alive) live++;
      var danger = live / 8 + (6 - this.aliveDistricts()) * 0.22 + (this.boss.active ? 1 : 0);
      this.alertLevel = lerp(this.alertLevel, danger, dt * 1.2);
      var want = this.alertLevel > 1.0 ? 'music_alert' : 'music_night';
      if (want !== this.musicStem && this.phase !== 'lost') {
        this.musicStem = want;
        kit.audio.music(want, 1200);
      }
    },

    stepVolley: function (dt) {
      if (this.spawnHold) return;
      if (this.boss.active) return;

      if (this.spawned < this.volleyTotal) {
        this.spawnT -= dt;
        if (this.spawnT <= 0) {
          // The spawn counter only advances on a SUCCESSFUL allocation. It
          // used to advance regardless, so a full threat pool silently
          // deleted scheduled threats and the volley readout stopped matching
          // the sky; a failed spawn is now simply retried (fix round 1).
          if (this.spawnThreat(this.pickType(), null, null, null)) {
            this.spawned++;
            var spacing = clamp(SPAWN_SPACING_BASE - this.tier * SPAWN_SPACING_K,
              SPAWN_SPACING_MIN, SPAWN_SPACING_BASE);
            if (this.mod === 'barrage') spacing *= 0.72;
            this.spawnT = spacing * lerp(0.78, 1.18, this.rng());
          } else {
            this.spawnT = 0.25;
          }
        }
        return;
      }
      // Volley is spent: wait for the sky to clear.
      var busy = false, i;
      for (i = 0; i < this.threats.length; i++) if (this.threats[i].alive) { busy = true; break; }
      if (!busy) for (i = 0; i < this.shots.length; i++) if (this.shots[i].alive) { busy = true; break; }
      if (!busy) for (i = 0; i < this.blasts.length; i++) if (this.blasts[i].alive) { busy = true; break; }
      if (busy) { this.volleyClearT = 0; return; }
      this.volleyClearT += dt;
      if (this.volleyClearT > CLEAR_DELAY) this.volleyCleared();
    },

    stepShots: function (dt) {
      for (var i = 0; i < this.shots.length; i++) {
        var s = this.shots[i];
        if (!s.alive) continue;
        var sdata = this.interceptorData(s.interceptor);
        if (s.seeker) {
          var near = null, nearD = 130 * 130;
          for (var ni = 0; ni < this.threats.length; ni++) {
            var nt = this.threats[ni];
            if (!nt.alive) continue;
            var ndx = nt.x - s.x, ndy = nt.y - s.y, nd2 = ndx * ndx + ndy * ndy;
            if (nd2 < nearD) { nearD = nd2; near = nt; }
          }
          if (near) { s.tx = near.x; s.ty = near.y; }
        }
        var dx = s.tx - s.sx, dy = s.ty - s.sy;
        var len = Math.hypot(dx, dy) || 1;
        var px = s.x, py = s.y;
        s.t += s.speed * dt / len;
        s.x = lerp(s.sx, s.tx, s.t);
        s.y = lerp(s.sy, s.ty, s.t);

        // Velocity-aligned tapered ribbon segments, laid down along the real
        // flight path, plus a small flame at the nozzle.
        s.trailT -= dt;
        if (s.trailT <= 0) {
          s.trailT = 0.032;
          var trailTint = styleTrail().tint;
          this.emitRibbon(s.x, s.y, s.x - px, s.y - py, sdata.heavy ? 34 : 26,
            sdata.heavy ? 10 : 7, trailTint, 0.30, 0.85);
          this.fx.trail.setParticleTint(trailTint);
          this.fx.trail.emitParticleAt(s.x, s.y, 1);
        }
        if (s.t >= 1) {
          s.alive = false;
          s.spr.setVisible(false);
          this.detonate(s.tx, s.ty, s.interceptor);
        }
      }
    },

    stepThreats: function (dt) {
      var i, j;
      for (i = 0; i < this.threats.length; i++) {
        var t = this.threats[i];
        if (!t.alive) continue;
        var def = THREAT[t.type];
        var vx = t.vx, vy = t.vy;
        var speedMul = 1;
        if (t.warnT > 0) t.warnT = Math.max(0, t.warnT - dt);
        if (t.introT > 0) t.introT = Math.max(0, t.introT - dt);
        if (t.empT > 0) { t.empT = Math.max(0, t.empT - dt); speedMul *= 0.42; }
        if (this.buffs['time-dilation'] > 0) speedMul *= 0.56;
        if (this.decoyT > 0) speedMul *= 0.68;
        if (t.burnT > 0) {
          t.burnT = Math.max(0, t.burnT - dt);
          t.burnTick -= dt;
          if (t.burnTick <= 0) {
            t.burnTick = 0.48;
            this.damageThreat(t, 1, 0xff8a4c);
            if (!t.alive) continue;
          }
        }

        // Wraith evasion: steer away from any blast whose edge is close.
        if (def.evades) {
          var near = null, nearD = Infinity;
          for (j = 0; j < this.blasts.length; j++) {
            var bl = this.blasts[j];
            if (!bl.alive) continue;
            var d = Math.hypot(t.x - bl.x, t.y - bl.y);
            if (d < nearD) { nearD = d; near = bl; }
          }
          if (near && nearD < near.r + EVADE_RANGE) {
            var ax = t.x - near.x, ay = t.y - near.y;
            var al = Math.hypot(ax, ay) || 1;
            t.dodge = clamp(t.dodge + dt * EVADE_RAMP, 0, 1);
            vx += ax / al * EVADE_PUSH * t.dodge;
            vy += ay / al * EVADE_PUSH * t.dodge;
            if (t.dodge > 0.6 && Math.random() < dt * 1.6) {
              kit.audio.sfx('sfx_wraith', { volume: 0.35 });
            }
          } else {
            t.dodge = Math.max(0, t.dodge - dt * 1.8);
          }
        }

        // Crosswind modifier: a slow lateral push on everything in the sky.
        if (this.wind) {
          t.wob += dt;
          vx += this.wind * (0.6 + 0.4 * Math.sin(t.wob * 0.8));
        }

        if (t.imm > 0) t.imm--;
        if (t.hitFlash > 0) t.hitFlash = Math.max(0, t.hitFlash - dt);

        var vl = Math.hypot(vx, vy) || 1;
        var sx = vx / vl * t.speed * speedMul * dt;
        var sy = vy / vl * t.speed * speedMul * dt;
        t.x += sx;
        t.y += sy;
        t.dist += Math.hypot(sx, sy);
        // Pose is STATE, not a transform: paint() applies it, so hit-stop can
        // freeze the rendered world (fix round 1, art review).
        t.rot = Math.atan2(vy, vx) + Math.PI / 2;

        // Exhaust: a family-tinted tapered ribbon plus a flame, staggered per
        // threat so the emitters never spike.
        t.trailT -= dt;
        if (t.trailT <= 0) {
          t.trailT = 0.055;
          this.emitRibbon(t.x - sx, t.y - sy, sx, sy, 18, 6, def.tint, 0.26, 0.55);
          if (t.trailN === undefined) t.trailN = 0;
          if ((t.trailN = (t.trailN + 1) % 3) === 0) {
            this.fx.exhaust.setParticleTint(def.tint);
            this.fx.exhaust.emitParticleAt(t.x - sx * 4, t.y - sy * 4, 1);
          }
        }

        // MIRV split at the tuned progress window.
        if (def.splits && !t.split && (t.dist / t.total) > t.splitAt) {
          t.split = true;
          this.splitHydra(t);
          this.killThreatSprite(t);
          continue;
        }
        if (t.y >= t.ty) {
          if (def.supply) { this.killThreatSprite(t); continue; }  // a missed pod is just lost
          this.strikeDistrict(t);
          continue;
        }
        for (j = 0; j < this.escorts.length; j++) {
          var escort = this.escorts[j];
          if (!escort.alive) continue;
          var ex = escort.x - t.x, ey = escort.y - t.y;
          if (ex * ex + ey * ey < 24 * 24) {
            this.loseEscort(escort);
            this.burst(this.fx.spark, t.x, t.y, 8, 0xffd978);
            this.killThreatSprite(t);
            break;
          }
        }
        if (!t.alive) continue;
        if (t.x < -60 || t.x > this.W + 60 || t.y > this.H + 60) this.killThreatSprite(t);
      }
    },

    stepBlasts: function (dt) {
      var i, j;
      for (i = 0; i < this.blasts.length; i++) {
        var b = this.blasts[i];
        if (!b.alive) continue;
        var life = b.duration || this.blastLife();
        b.age += dt;
        b.r = b.age < BLAST_GROW ? lerp(3, b.maxR, b.age / BLAST_GROW) : b.maxR;
        b.opacity = Math.max(0, 1 - Math.max(0, b.age - BLAST_GROW) / Math.max(0.08, life - BLAST_GROW));

        // Delayed smoke: it rises AFTER the light has died, which is what
        // makes the bloom read as staged rather than simultaneous.
        if (!b.smoke1 && b.age >= 0.18) { b.smoke1 = true; this.burst(this.fx.smoke, b.x, b.y, 3); }
        if (!b.smoke2 && b.age >= 0.42) {
          b.smoke2 = true;
          this.burst(this.fx.smoke, b.x + (Math.random() * 2 - 1) * b.maxR * 0.5,
            b.y - b.maxR * 0.2, 2);
        }

        // Kills inside the blast. A blast may damage any given threat ONCE:
        // an armoured cruiser used to lose both hit points to a single
        // interceptor because the check ran every sim tick while it sat
        // inside the radius (fix round 1, code review).
        for (j = 0; j < this.threats.length; j++) {
          var t = this.threats[j];
          if (!t.alive || t.imm > 0 || t.lastBlast === b.id) continue;
          var def = THREAT[t.type];
          var d = Math.hypot(b.x - t.x, b.y - t.y);
          // Wraiths ignore the outer shell of a young blast, the prototype's
          // "smart margin" that made them feel slippery rather than unfair.
          var margin = def.evades ? 12 : 0;
          if (d <= b.r - margin + def.r) {
            if (def.evades && d > b.r - 9 && b.age < 0.48) continue;
            t.lastBlast = b.id;
            t.hp -= this.damageOutput();
            if (t.hp > 0) {
              this.burst(this.fx.spark, t.x, t.y, 5, def.tint);
              t.hitFlash = 0.18;
              kit.audio.sfx('sfx_armor', { volume: 0.45 });
              continue;
            }
            this.registerKill(t);
          }
          if (t.alive && b.effect === 'emp') t.empT = Math.max(t.empT, 2.8);
          if (t.alive && b.effect === 'burn') {
            t.burnT = Math.max(t.burnT, 3.2);
            t.burnTick = Math.min(t.burnTick || 0.08, 0.08);
          }
        }
        if (this.boss.active) this.damageBoss(b);

        if (b.age > life) {
          b.alive = false;
          b.core.setVisible(false);
          b.ring.setVisible(false);
          b.flash.setVisible(false);
        }
      }
    },

    // The blast's own render pass, on the cosmetic clock so hit-stop really
    // freezes it.
    paintBlasts: function () {
      for (var i = 0; i < this.blasts.length; i++) {
        var b = this.blasts[i];
        if (!b.alive) continue;
        var life = b.duration || this.blastLife();
        var f = clamp(b.age / life, 0, 1);
        // Core flash: 70 ms of hard white, over-scaled, gone before the eye
        // resolves it.
        if (b.age < 0.075) {
          var fk = 1 - b.age / 0.075;
          b.flash.setVisible(true).setPosition(b.x, b.y).setAlpha(fk)
            .setDisplaySize(b.maxR * (2.2 + fk * 1.4), b.maxR * (2.2 + fk * 1.4));
        } else if (b.flash.visible) {
          b.flash.setVisible(false);
        }
        // Fireball: eased overshoot past full radius, then settle.
        var grow = clamp(b.age / BLAST_GROW, 0, 1);
        var over = 1 + 0.16 * Math.sin(Math.min(1, grow) * Math.PI);
        var tint = f < 0.16 ? 0xffffff : (f < 0.34 ? 0xfff0c8
          : (f < 0.58 ? 0x9ef4ff : 0x4aa8ff));
        b.core.setPosition(b.x, b.y)
          .setDisplaySize(b.r * 2.1 * over, b.r * 2.1 * over)
          .setAlpha(0.9 * b.opacity)
          .setTint(f < 0.12 ? 0xffffff : b.color || tint);
        // Shock ring: outruns the fireball and thins as it goes.
        b.ring.setPosition(b.x, b.y)
          .setScale((b.r * (2.35 + f * 1.1)) / 128)
          .setTint(b.color || 0x9ffaff)
          .setAlpha(0.95 * b.opacity * b.opacity);
      }
    },

    stepBatteries: function (dt) {
      for (var i = 0; i < this.batteries.length; i++) {
        var b = this.batteries[i];

        // Aim: the barrel tracks the reticle with an eased turn, then a
        // spring-damped recoil with a single overshoot (house motion rule 1).
        var want = Math.atan2(this.aimX - b.x, b.y - this.aimY);
        b.aimTarget = clamp(want, -1.25, 1.25);
        b.aimA += (b.aimTarget - b.aimA) * Math.min(1, dt * 9);
        b.recoilV += (-b.recoil * 320 - b.recoilV * 18) * dt;
        b.recoil += b.recoilV * dt;

        if (b.chargeT > 0) b.chargeT -= dt;
        if (b.fireLock > 0) b.fireLock = Math.max(0, b.fireLock - dt);
        var state = !b.alive ? 'dead' : (b.chargeT > 0 ? 'charge' : (b.ammo <= 0 ? 'empty' : 'idle'));
        b.state = state;
      }
    },

    // ============================================================== render
    // Everything that only affects how a frame looks lives here, so the sim
    // step above stays free of view work.
    // HIT-STOP AND THE RENDERED WORLD. The simulation used to move sprites
    // directly inside step(), so hit-stop - which only zeroes the cosmetic
    // clock - never actually froze anything the player could see. Position and
    // rotation are now SIM STATE, and this pass is the only thing that writes
    // them onto a sprite. When the cosmetic clock is frozen the transforms are
    // simply not written, so the world genuinely holds still for the duration
    // of the impact while the fixed step keeps running underneath and no sim
    // step is ever skipped (fix round 1, art review).
    paint: function (dt, alpha) {
      var i;
      var now = this.time.now / 1000;
      var moving = !this.frozen;

      for (i = 0; i < this.batteries.length; i++) {
        var b = this.batteries[i];
        if (b.state !== b.stateShown) {
          b.stateShown = b.state;
          b.base.setFrame('turret_' + b.state);
        }
        if (moving) {
          b.barrel.setRotation(b.aimA)
            .setPosition(b.x - Math.sin(b.aimA) * b.recoil, b.y + Math.cos(b.aimA) * b.recoil)
            .setVisible(b.alive);
        }
        if (b.ammo !== b.ammoShown) {
          b.ammoShown = b.ammo;
          b.ammo0.setText(String(b.ammo))
            .setTint(b.ammo > 0 ? 0xb7ecff : 0xff6478);
        }
      }

      // Threats. Pose comes straight from sim state; the family tint flashes
      // white for a moment when armour soaks a hit.
      if (moving) {
        for (i = 0; i < this.threats.length; i++) {
          var t = this.threats[i];
          if (!t.alive) continue;
          t.spr.setPosition(t.x, t.y).setRotation(t.rot);
          if (t.introT > 0 && t.type === 'cruiser') {
            var introK = 1 - t.introT / 0.30;
            t.spr.setScale(lerp(0.56, THREAT[t.type].scale, introK));
          } else if (t.type === 'cruiser') {
            t.spr.setScale(THREAT[t.type].scale);
          }
          t.warn.setPosition(t.x, Math.max(38, t.y + 28)).setScale(0.22 + (this.radarLead() - t.warnT) * 0.18)
            .setAlpha(t.warnT > 0 ? 0.22 + t.warnT * 0.86 : 0).setVisible(t.warnT > 0);
          if (t.hitFlash > 0) t.spr.setTint(0xffffff);
          else if (t.spr.isTinted) t.spr.clearTint();
        }
        // Interceptors in flight.
        for (i = 0; i < this.shots.length; i++) {
          var sh = this.shots[i];
          if (!sh.alive) continue;
          sh.spr.setPosition(sh.x, sh.y);
        }
      }

      // The staged airburst bloom and the tapered trail ribbons both run on
      // the cosmetic clock, so hit-stop holds them too.
      this.paintBlasts();
      this.stepRibbons(dt);
      this.stepLineFx(dt);
      if (moving) {
        this.paintPickups(dt);
        this.paintEscorts();
        this.paintStrike();
      }

      // Districts. Intact ones breathe; a shielded hit sends a bright
      // highlight scanning up the dome; a ruin burns.
      for (i = 0; i < this.districts.length; i++) {
        var d = this.districts[i];
        if (d.shieldT > 0) {
          d.shieldT = Math.max(0, d.shieldT - dt * 1.45);
          var sk = 1 - d.shieldT;
          d.shieldHi.setVisible(true)
            .setPosition(d.x, this.baseY + 6 - 34 * sk)
            .setAlpha(0.9 * d.shieldT * (0.55 + 0.45 * Math.sin(sk * 9)));
          if (d.shieldT <= 0) d.shieldHi.setVisible(false);
        }
        if (!d.alive) {
          // Ruined districts keep burning, so a lost district reads as a lost
          // district for the rest of the night and not just a swapped frame.
          d.fireT -= dt;
          if (d.fireT <= 0) {
            d.fireT = 0.42 + Math.random() * 0.5;
            this.burst(this.fx.ember, d.x + (Math.random() * 2 - 1) * d.halfW * 0.7,
              d.y - 8 - Math.random() * 14, 2);
            if (Math.random() < 0.4) this.burst(this.fx.smoke, d.x, d.y - 20, 1);
          }
          continue;
        }
        d.spr.setAlpha(0.94 + 0.06 * Math.sin(now * 1.3 + d.phase));
        if (d.state === 1) {
          // A damaged district smoulders at a much lower rate than a ruin.
          d.fireT -= dt;
          if (d.fireT <= 0) {
            d.fireT = 1.1 + Math.random() * 0.9;
            this.burst(this.fx.ember, d.x + (Math.random() * 2 - 1) * d.halfW * 0.5,
              d.y - 26, 1);
          }
        }
      }

      // Boss port telegraphs: both beams charge for the last half second
      // before the Obelisk opens fire.
      var bo = this.boss;
      if (bo.active && !bo.entering) {
        var warn = clamp(1 - bo.fireT / 0.55, 0, 1);
        for (i = 0; i < 2; i++) {
          var bm = this.bossBeams[i];
          if (warn <= 0) { if (bm.visible) bm.setVisible(false); continue; }
          bm.setVisible(true)
            .setPosition(bo.x + (i ? 1 : -1) * bo.portX, bo.y + 10)
            .setAlpha(0.10 + 0.42 * warn * (0.55 + 0.45 * Math.sin(now * 24)))
            .setDisplaySize(8 + 20 * warn, Math.max(20, this.baseY - bo.y));
        }
      } else if (this.bossBeams[0].visible) {
        this.bossBeams[0].setVisible(false);
        this.bossBeams[1].setVisible(false);
      }

      // Score popups: ease-out-back pop, then rise and fade.
      for (i = 0; i < this.pops.length; i++) {
        var p = this.pops[i];
        if (!p.alive) continue;
        p.age += dt;
        var k = clamp(p.age / 0.22, 0, 1);
        var s = k < 1 ? 1.18 * (1 - Math.pow(1 - k, 3)) : lerp(1.18, 1, clamp((p.age - 0.22) / 0.2, 0, 1));
        var pa = clamp(1 - (p.age - 0.5) / 0.5, 0, 1);
        if (p.useNum) {
          p.n.y += p.vy * dt;
          p.n.setPop(s).setAlpha(pa);
        } else {
          p.t.setScale(s);
          p.t.y += p.vy * dt;
          p.t.setAlpha(pa);
        }
        p.vy *= 0.94;
        if (p.age > 1.0) {
          p.alive = false;
          p.n.setVisible(false);
          p.t.setVisible(false);
        }
      }

      // Reticle: slow counter-spin plus a pulse tied to available ammo.
      this.reticleSpin += dt * 0.5;
      var ready = false;
      for (i = 0; i < this.batteries.length; i++) if (this.batteries[i].alive && this.batteries[i].ammo > 0) ready = true;
      this.reticle.setPosition(this.aimX, this.aimY)
        .setRotation(this.reticleSpin)
        .setAlpha(ready ? 0.75 + 0.2 * Math.sin(now * 4) : 0.35)
        .setTint(ready ? 0xffffff : 0xff8092)
        .setVisible(this.phase === 'fight' || this.phase === 'intro');
      if (this.tut && this.tut.hand.visible) {
        this.tut.hand.setPosition(this.aimX, this.aimY);
      }

      this.paintSpectacle(dt);

      // Chain chip: a pooled scale pop with no tween allocation per kill.
      if (this.chipPop > 1) {
        this.chipPop = Math.max(1, this.chipPop - dt * 1.9);
        this.hud.chipNum.setPop(this.chipPop);
      }

      // Damage vignette + flash plate decay.
      this.vignette.setAlpha(this.hitFlash * 0.55);
      if (this.flashPlate.alpha > 0) {
        this.flashPlate.setAlpha(Math.max(0, this.flashPlate.alpha - dt * 2.2));
      }

      this.paintHud();
    },

    paintHud: function () {
      var c = this.hudCache;
      if (this.score !== c.score) {
        c.score = this.score;
        this.hud.score.setText(String(this.score).padStart(6, '0'));
      }
      var best = this.mode === 'siege' ? profile.siege : profile.best;
      if (best !== c.best) {
        c.best = best;
        // The BEST word is its own label; this object is a bitmap numeral and
        // the digits face carries no letter glyphs, so it gets digits only.
        this.hud.best.setText(String(best).padStart(6, '0'));
      }
      if (this.combo !== c.combo) {
        c.combo = this.combo;
        if (this.combo > 1) {
          this.hud.chipNum.setText('x' + this.combo);
          this.setChipAlpha(1);
          this.chipPop = 1.35;
        } else {
          this.setChipAlpha(0);
          this.chipPop = 1;
        }
      }
      var alive = this.aliveDistricts();
      if (alive !== c.districts) {
        c.districts = alive;
        for (var i = 0; i < 6; i++) {
          this.hud.pips[i].setFillStyle(this.districts[i].alive ? 0x6ce4db : 0x4a2430, 1);
        }
      }
      if (this.strikeCharges !== c.strike) {
        c.strike = this.strikeCharges;
        for (var si = 0; si < this.hud.strikePips.length; si++) {
          this.hud.strikePips[si].setFillStyle(si < this.strikeCharges ? PAL.amber : 0x4a3d2a,
            si < this.strikeCharges ? 1 : 0.72);
        }
      }
      var vkey = this.boss.active ? -this.boss.hp : (this.mode === 'siege' ? this.siegeWave : this.volley);
      if (vkey !== c.volley) {
        c.volley = vkey;
        if (this.boss.active) {
          this.hud.volleyT.setText('OBELISK ' + this.boss.hp + '/' + this.boss.maxHp)
            .setColor('#ec9bff');
        } else if (this.mode === 'siege') {
          this.hud.volleyT.setText('WAVE ' + Math.max(1, this.siegeWave)).setColor('#ffd978');
        } else {
          this.hud.volleyT.setText('VOLLEY ' + Math.min(this.night.volleys, this.volley + 1) +
            '/' + this.night.volleys).setColor('#ffd978');
        }
      }
      var weapon = this.interceptorData(this.equippedInterceptor);
      if (weapon.key !== c.weapon) {
        c.weapon = weapon.key;
        this.hud.weaponIcon.setTexture('atlas', weapon.frame).setTint(weapon.tint);
        setTextIfChanged(this.hud.weaponT, weapon.name);
      }
      var activeText = '';
      for (var bi = 0; bi < TIMED_POWER_KEYS.length; bi++) {
        var bk = TIMED_POWER_KEYS[bi];
        if (this.buffs[bk] > 0) {
          var bd = POWER_BY_KEY[bk];
          activeText = bd.name + ' ' + Math.ceil(this.buffs[bk]) + 's';
          break;
        }
      }
      if (this.lastBastionT > 0) activeText = 'LAST BASTION ' + Math.ceil(this.lastBastionT) + 's';
      if (activeText !== c.buffs) {
        c.buffs = activeText;
        setTextIfChanged(this.hud.buffT, activeText);
        this.hud.buffT.setVisible(!!activeText);
      }
      this.updateDebugState();
    },

    // =============================================================== update
    update: function (time, delta) {
      var dt = Math.min(0.05, delta / 1000);

      // Hit-stop freezes the COSMETIC clock only. The accumulator still
      // drains, so no sim step is ever skipped.
      var j = kit.juice.frame();
      this.cameras.main.setScroll(j.dx, j.dy);

      this.acc += dt;
      var steps = 0;
      while (this.acc >= STEP && steps < MAX_STEPS) {
        this.acc -= STEP;
        steps++;
        if (this.phase !== 'lost' && this.phase !== 'won') this.step(STEP);
      }

      var vdt = j.frozen ? 0 : dt;
      this.frozen = j.frozen;
      this.sky.tick(vdt, this.boss.active ? 2.2 : 1);
      this.paint(vdt, this.acc / STEP);
    }
  };

  // ================================================================= boot
  // Phaser only wires preload/create/update from a plain config object, so
  // each scene literal is promoted to a real Scene subclass with its whole
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
    backgroundColor: '#050a1a',
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: window.innerWidth,
      height: window.innerHeight
    },
    // antialias keeps LINEAR texture filtering (the art is supersampled, so
    // it needs it); antialiasGL:false drops multisampling on the default
    // framebuffer, which is pure cost on a software rasteriser and buys
    // nothing when every edge already comes from a filtered texture.
    render: {
      antialias: true, antialiasGL: false, powerPreference: 'high-performance',
      roundPixels: false, batchSize: 4096
    },
    fps: { target: 60, min: 30 },
    scene: [toScene(BootScene), toScene(TitleScene), toScene(CommandScene), toScene(PlayScene)]
  });

  kit.registerPWA();
  window.__SKYFALL_READY = true;
  // Harness hook: the live PlayScene, so a frame trace can drive the game
  // from inside the page instead of paying a CDP round trip per input.
  window.__SKY_SCENE = function () { return Game.play; };
  window.__SKY_DBG = function () {
    var s = Game.play; if (!s) return 'noscene';
    var th = 0, bl = 0, sh = 0, i;
    for (i = 0; i < s.threats.length; i++) if (s.threats[i].alive) th++;
    for (i = 0; i < s.blasts.length; i++) if (s.blasts[i].alive) bl++;
    for (i = 0; i < s.shots.length; i++) if (s.shots[i].alive) sh++;
    return s.phase + ' th' + th + ' bl' + bl + ' sh' + sh + ' hf' + s.hitFlash.toFixed(2) +
      ' fp' + s.flashPlate.alpha.toFixed(2) + ' d' + s.aliveDistricts() + ' tut' + (s.tut ? s.tut.step : '-');
  };
}());
