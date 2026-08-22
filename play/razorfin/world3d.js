/* world3d.js (Lane B3) - RF.World, three.js render layer
 *
 * SAME PUBLIC API as world.js:
 *   init(scene3, ctx) / update(ctx) / query(x,y,r,kind) / eatQuery(x,y,r) /
 *   kill(ent,cause) /
 *   spawnBurst(defId,x,y,n) / zoneAt(y) / entities / playerHits
 * so abilities.js and engine3d.js consume this module unchanged.
 *
 * The SIM is a verbatim port of world.js: pools, spatial hash, spawner,
 * prey/predator/hazard/pickup AI, status effects, mine chain, pack records,
 * pooled hit records, and the Rev 5 surface clamp. Only the RENDER half is
 * new: Phaser scene.add.image calls are replaced by three.js objects.
 *
 * SPACE CONTRACT (SPEC3D "Scene/space contract"): sim coords are unchanged
 * in direction (x right, y DOWN), only extended: Rev 6 grows the world to
 * 0..14400 x 0..4800 (SPEC3D 6.4). Mapping to three is (x, -y, z), gameplay
 * plane z = 0, decor parallax z in [-400..-80], foreground motes z [+40..+80].
 *
 * Laws honoured here:
 *  - No Math.random in sim. Every stochastic draw goes through ctx.rng.
 *  - Zero per-frame allocation in update(): scratch arrays are reused and
 *    every entity is preallocated in init().
 *  - Cross-namespace calls (RF.Art3D, RF.Fx, RF.Sound) are GUARDED; this file
 *    runs standalone if lanes D3 and F3 are absent. Without RF.Art3D, prey
 *    render as vertex-coloured plane quads; without RF.Fx, emits are skipped.
 *  - No window/document listeners, no setTimeout/setInterval.
 *  - No em dashes in any string.
 */
import * as THREE from 'three';

(function (root) {
  'use strict';

  var RF = (root.RF = root.RF || {});
  var World = {};

  // ---------------------------------------------------------------- consts
  var CELL = 256;              // spatial hash cell size, px
  var MAX_ENTITY_R = 100;      // largest authored body radius (tier 12 = 98)
  var SPAWN_MIN = 900;         // spawn ring inner radius from camera centre
  var SPAWN_MAX = 1400;        // spawn ring outer radius
  var DESPAWN = 2000;          // beyond this from camera centre, recycle
  var MINE_CHAIN_R = 150;      // chain detonation radius
  var PREDATOR_SIGHT = 700;
  var PICKUP_MAGNET_R = 260;
  var PICKUP_GRAB_R = 46;
  var PUFFER_NEAR = 190;       // player distance that inflates a puffer
  var TAU = Math.PI * 2;

  // -------------------------------------------------- Rev 6 SDF cavern maze
  // SPEC3D 6.4: a build-time 2D signed-distance grid, rasterised once from a
  // deterministic cavern graph and never touched again except by resolveBody
  // reads and marching-squares render (also build-time). No per-frame writes.
  var SDF_CELL = 64;                  // grid cell size, px
  var SDF_OPEN_Y = 500;               // open water above this sim y: no rock
  var MAZE_CAVERNS_MIN = 4;           // caverns per 1200px band
  var MAZE_CAVERNS_MAX = 6;
  var MAZE_CAVERN_W = [900, 1600];    // cavern width range, px
  // Rev 6.11 MAZE REACHABILITY: raised from the original [130,190] brief.
  // Body-radius-aware clearance is 122px (tier-12 radius 98 + 24 SDF spawn
  // margin); tunnel wall wobble is +-(MAZE_EDGE_NOISE_AMP*0.4) = +-18.4px, so
  // the worst-case effective half-width at the old 130 minimum was only
  // 111.6px, below clearance. 148 keeps the worst case (148-18.4=129.6) above
  // 122 with margin even before the deterministic-seed carving widener below
  // (widenTunnelsForReachability) runs.
  var MAZE_TUNNEL_HALF = [148, 200];  // lateral tunnel half-width, px
  var MAZE_SHAFTS_PER_BOUNDARY = [2, 3];
  var MAZE_EDGE_NOISE_N = 6;          // value-noise octave count per cavern wall
  var MAZE_EDGE_NOISE_AMP = 46;       // px of wall wobble
  var SDF_RESAMPLE_TRIES = 6;         // ringPoint resample budget (6.4)
  var SDF_SPAWN_CLEAR = 24;           // extra clearance beyond radiusFor(def)
  var WHISKER_DIST = 120;             // NPC steer whisker probe distance
  var WHISKER_TURN_R = 40;            // + r triggers a tangent rotation

  // Near-rock render (6.4/6.9): marching squares over the SDF grid, chunked
  // into ~1800px wide column batches so far-off chunks frustum-cull for free.
  var ROCK_CHUNK_W = 1800;
  var ROCK_FRONT_Z = 55;              // front cap z, per 6.4
  var ROCK_BACK_Z = -130;             // extruded back, per 6.4
  var ROCK_AO_MAX = 140;              // -sdf depth (px) at which AO bottoms out
  // Cyberpunk accent palette (6.9). Amber/red are reserved elsewhere
  // (frenzy/reward, damage) and never used here.
  var NEON_MAGENTA = 0xff2bd6;
  var NEON_CYAN = 0x27e0ff;
  var NEON_ACID = 0x9dff2b;

  // ------------------------------------------------------ Rev 4 living water
  // Ported verbatim from world.js. Every constant is a named parameter and
  // every one drives a pure sin() of the sim clock. Nothing here allocates,
  // tweens, or touches wall time.
  var CAUSTIC_N = 3;           // wide soft light planes under the surface
  var CAUSTIC_H = 600;         // planes live in the top CAUSTIC_H px of water
  var CAUSTIC_DRIFT = 190;     // px of horizontal sine travel
  var CAUSTIC_RATE = [0.055, 0.085];
  // Caustics are additive and they live in the top CAUSTIC_H px, so like the
  // surface wash they are charged against zone-1 saturation. Their base range
  // is tuned so the independent breath peaks near 0.09: they dapple the shelf
  // without flooding it.
  var CAUSTIC_ALPHA = [0.020, 0.035];
  var RAY_ROT_AMP = 0.03;      // +-0.03 rad sway per SPEC
  var RAY_ROT_RATE = [0.06, 0.13];
  var RAY_ALPHA_LO = 0.35;     // alpha multiplier floor of the 0.35-1.0 cycle
  var RAY_ALPHA_RATE = [0.09, 0.19];
  var SEAM_DRIFT = 70;         // thermocline seam horizontal travel, px
  var SEAM_RATE = [0.03, 0.06];
  var SWAY_AMP = [0.045, 0.13];        // kelp rotation amplitude, rad
  var SWAY_RATE = [0.30, 0.62];
  var SIL_DRIFT = [3, 7];      // silhouette px of sine travel (anchor kept)
  var SIL_RATE = [0.035, 0.075];

  // Creature animation. Per-entity phases come from PHI so nothing in the
  // shoal is ever synchronised. No tweens: pure sin() of the sim clock.
  var PHI = 0.61803398875;
  var FISH_WIGGLE = 0.12;      // +-0.12 rad tail wiggle at full speed
  var FISH_WIGGLE_HZ = [2.2, 7.5];
  // Instanced fish use the same bend language as the fish loft lane. The
  // amplitude is deliberately small because displayLen is the world-space
  // scale and the loft is authored in body-local units.
  var INST_BEND_K = 5.5;
  var INST_BEND_SPAN = [-0.5, 0.35];
  var INST_BEND_AMP = 0.12;
  var SCHOOL_N = 32;
  var SCHOOL_Z = -150;
  var JELLY_PULSE = 0.08;      // scale 0.92 - 1.08
  var JELLY_RATE = 0.55;
  var PUFF_TIME = 0.2;         // seconds to inflate or deflate
  var GLINT_RATE = 1.6;        // pickup alpha pulse
  var GLINT_AMP = 0.22;
  var NPC_PITCH = 0.05;        // fallback billboard pitch, rad (no RF.Art3D)
  var NPC_PITCH_HZ = 0.9;

  // ---------------------------------------------- Rev 5 surface containment
  // SURFACE_Y is the hard floor for EVERY non-player entity: fish, sharks,
  // hazards, pickups. Only the player may breach, and engine3d.js owns that.
  var SURFACE_Y = 46;          // hard ceiling (in sim terms) for all NPC entities
  var SURFACE_MARGIN = 26;     // spawner keeps this much clear of the ceiling
  var SURFACE_BOUNCE = 0.35;   // vy reflected DOWN at this fraction on contact
  var SEAFLOOR_MARGIN = 40;    // spawner keeps this much clear of the seafloor

  // Rev 5 orientation. Bakes are nose-right, so facing left is a mirror, which
  // in 3D is a NEGATIVE X SCALE on the billboard rather than a Phaser flipX.
  // The display heading is SMOOTHED so a fish that reverses in one frame does
  // not snap 180 degrees.
  var FACE_TURN = 9.0;         // rad/s-ish lerp rate of display heading -> e.angle
  var FACE_SNAP = 0.6;         // below this speed the display heading holds

  // Prey are local fish lofts, not world-sized shark rigs. The final visual
  // length is capped against the live player rig so tier-3+ prey cannot read
  // as another player shark when their collision radius grows.
  var PLAYER_RENDER_LEN_BASE = 124;
  var PREY_RENDER_FRACTION = 0.72;

  // Rev 5 flee burst, capped so a chasing shark of equal tier always closes.
  var FLEE_BURST = 1.55;       // prey panic sprint, <= 1.6x base per Rev 5 brief
  var FLEE_BURST_NPC = 1.35;   // outranked NPC shark running from the player

  // Rev 6.5 mouth-proximity panic. Distinct from the sight-based flee above:
  // this fires only when the player's MOUTH (not just its body) closes to
  // within PANIC_R, is always the more urgent of the two when both apply, and
  // drives a doubled instanced bend amplitude so a panicking fish visibly
  // thrashes rather than merely swimming away faster.
  var PANIC_R = 170;
  var PANIC_T = 0.6;            // seconds st.panicT is held once triggered
  var PANIC_JITTER = 0.9;       // rad/s perpendicular jitter rate while panicking
  var PANIC_BEND_MULT = 2;      // doubled instanced bend amp per 6.5

  // Rev 6.12 PREY PANIC CUE: the lunge-captured target gets a visible cue
  // beyond movement thrash — an instance-color flash toward white/red plus a
  // small fx tracer. LUNGE_TARGET_R is deliberately tight (this identifies
  // the SPECIFIC entity the lunge captured, at ctx.player.st.lungeX/Y, not
  // merely "something nearby") so only the actual captured prey flashes.
  var LUNGE_TARGET_R = 40;
  var LUNGE_FLASH_T = 0.22;     // seconds the flash holds once (re)triggered
  var LUNGE_FLASH_COLOR = 0xffe8e0; // white-hot toward red, per the spec's cue language

  // Rev 6.11 CHUM SEAM: engine keeps publishing ctx.run.buffs.chum; while it
  // is > 0, prey inside CHUM_R converge toward the player at a moderate
  // steer weight. Panic always overrides (a panicking fish still thrashes
  // away from the mouth even mid-Chum), and sight-based flee from the player
  // itself still wins over Chum (a hunted fish does not swim into the jaws).
  var CHUM_R = 600;
  var CHUM_STEER_W = 3.2;       // moderate weight, between wander (2.2) and flee (6)
  var CHUM_SPEED_FRAC = 0.55;   // fraction of base speed while chum-converging

  // Rev 6.11 NURSERY LAW: no predator may spawn within NURSERY_R of a player
  // whose tier is <= NURSERY_TIER, in ANY zone/region. Predator AI additionally
  // leashes off pursuit of such a player when the predator entered from
  // another zone band (home-band chase would otherwise still hunt them down
  // after a lucky spawn just outside the ring).
  var NURSERY_TIER = 2;
  var NURSERY_R = 1600;

  // Rev 6.7 pickup capsules. Ambient ones are rare and independent of kills;
  // drop-from-kill spawns go through World.spawnBuffDrop (engine-called).
  var BUFF_LIFE = 12;            // seconds before an uncollected capsule fades
  var BUFF_FADE = 1.5;           // seconds of fade-out before expiry
  var BUFF_DRIFT_SPEED = 46;     // gentle drift speed, px/s
  var BUFF_GRAB_R = 50;
  var BUFF_AMBIENT_CHANCE = 0.003; // per spawner tick, when the roll is reached

  // ------------------------------------------------------ 3D space contract
  var Z_PLAY = 0;              // gameplay plane
  var Z_SURFACE = -60;         // surface plane sits just behind play
  var Z_CAUSTIC = -90;         // caustic planes near the surface
  var Z_RAY = -120;            // god-ray additive planes
  var Z_SEAM = -180;           // thermocline seams
  var Z_KELP = [-260, -140];   // kelp / rock billboard parallax band
  var Z_SIL = [-400, -300];    // midwater silhouettes, furthest back
  var Z_GRADIENT = -500;       // opaque world-anchored water gradient sheet
  var Z_TERRAIN = [-340, -200, -100, 45];

  var SURFACE_LIGHT_H = 500;   // rays reach this far down from y=0

  // Sim clock. ctx.time.now is the fixed-step clock engine3d.js owns. Headless
  // callers and the selftest never advance it, so when it does not move we
  // accumulate dt ourselves. Monotonic in both cases, never reads wall time.
  function worldClock(ctx, dt) {
    var n = ctx && ctx.time && typeof ctx.time.now === 'number' ? ctx.time.now : -1;
    if (n > S.lastNow) { S.lastNow = n; S.animT = n; }
    else S.animT += dt;
    return S.animT;
  }

  // ------------------------------------------------------------- module state
  var S = {
    scene: null,               // THREE.Scene (or a stub in the selftest)
    renderer: null,            // set by applyZoneAtmo callers, may stay null
    rng: null,
    w: 14400, h: 4800,
    pool: [],                  // every preallocated entity, active or not
    free: [],                  // stack of inactive entities
    entities: [],              // dense list of ACTIVE entities
    grid: null,                // flat array: cellKey -> array of ents
    cols: 0, rows: 0,
    nextId: 1,
    packSeq: 1,
    packs: null,               // Map: packId -> pooled record {dx, dy, t, owner}
    decor: [],                 // static decoration objects (never per-frame)
    surface: null,             // {mesh, wash, ribbon, foam, snell} at y = 0
    gradient: null,            // opaque world-anchored gradient sheet
    terrain: [],               // far, mid, near, and foreground ridge batches
    // Rev 6 SDF cavern maze (6.4). Built once in init(), read-only after.
    sdfCols: 0, sdfRows: 0,
    sdf: null,                 // Float32Array, signed px, positive = water
    sdfRegion: null,           // Uint8Array, flood-filled region id per cell
    sdfRegionN: 0,
    rockChunks: [],            // near-rock marching-squares batches
    surfaceT: 0,
    ambientT: 0,
    // Rev 6.12 BUFF CADENCE: seconds remaining before World.spawnBuffDrop
    // (the kill-triggered path) will place another capsule; 0 means ready.
    // Ticked down in World.update alongside the other per-frame timers.
    buffDropCd: 0,
    inited: false,
    headless: false,
    // Rev 4 "living water". Every animated object is created ONCE in init and
    // only has scalar fields written per frame.
    caustics: [],
    rays: [],
    seams: [],
    swayers: [],
    reefSwayers: [],            // fixed coral fan/anemone pivot groups
    reefBatches: [],            // static + swaying merged reef meshes
    drifters: [],
    animT: 0,                  // internal clock fallback (see worldClock)
    lastNow: -1,
    // 3D-only bookkeeping.
    npcByZone: null,
    matCache: null,            // bake key -> shared THREE.Material
    views: null,               // viewKey -> {free: [ {obj, rig} ]} global view pool
    viewsDisposed: 0,          // surplus views returned to the GPU, debug only
    viewsIdle: 0,              // total idle views across all keys, budget counter
    geoQuad: null,             // ONE shared unit plane geometry for all billboards
    rigs: [],                  // active NPC shark rigs awaiting animate()
    fishSources: null,         // def id -> guarded RF.Art3D.buildFish source
    instancedByDef: null,      // def id -> one dense interactive fish batch
    instancedPrey: [],         // interactive instanced batches, built at init
    backgroundSchools: [],     // one decorative minnow batch per zone
    fog: null,                 // THREE.FogExp2 owned by this module
    clearCol: null,            // THREE.Color scratch for the renderer clear
    atmoA: null, atmoB: null,  // THREE.Color scratches for the zone lerp
    lastZoneId: -1,
  };

  // Reused scratch. Never reallocated after init.
  var scratchQuery = [];
  var scratchChain = [];
  var playerHits = [];
  var weightScratch = [];

  // Matrix path scratch. These objects are created once at module load and are
  // rewritten by animateEntity; no matrix/quaternion/vector is created in the
  // fixed step, including when a slot is swapped during a kill.
  var instMatrixScratch = new THREE.Matrix4();
  var instQuatScratch = new THREE.Quaternion();
  var instPosScratch = new THREE.Vector3();
  var instScaleScratch = new THREE.Vector3();
  var instEulerScratch = new THREE.Euler(0, 0, 0, 'XYZ');
  var instColorScratch = new THREE.Color(0xffffff);
  var fishSharedMaterial = null;

  // Reused animate() state object for RF.Art3D rigs. One object, rewritten per
  // rig per frame, so a 20-shark screen still allocates nothing.
  var rigState = { speedFrac: 0, turn: 0, bitePhase: 0, jawSnapT: 0, vy: 0 };

  // Tropical reef palette. These are authored normal-blend colours, not
  // additive FX colours, so the reef remains saturated without washing out
  // the foreground creatures.
  var REEF_PALETTE = [0xf05b74, 0xff8d4f, 0x8f6cf2, 0x24c9b0, 0xffc857];

  // RF-PERF-01: hit records are POOLED. playerHits holds live records only for
  // the frame they were pushed; the backing store is allocated once and reused
  // forever, so a hazard cluster produces zero garbage.
  var hitPool = [];
  var hitPoolUsed = 0;
  function pushHit(ent, dmg, x, y, sting) {
    var h = hitPool[hitPoolUsed];
    if (!h) { h = { ent: null, dmg: 0, x: 0, y: 0, sting: false }; hitPool[hitPoolUsed] = h; }
    hitPoolUsed++;
    h.ent = ent; h.dmg = dmg; h.x = x; h.y = y; h.sting = !!sting;
    playerHits[playerHits.length] = h;
    return h;
  }
  function resetHits() {
    for (var i = 0; i < playerHits.length; i++) playerHits[i].ent = null;
    playerHits.length = 0;
    hitPoolUsed = 0;
  }

  // RF-PACK-01: pack motion records are POOLED and capped. Records recycle
  // round-robin, so a long run can never grow S.packs past PACK_MAX.
  var PACK_MAX = 48;
  var packRecs = [];
  var packRing = 0;
  function packAcquire(packId) {
    var rec = packRecs[packRing];
    if (!rec) { rec = { dx: 1, dy: 0, t: 0, owner: 0 }; packRecs[packRing] = rec; }
    packRing = (packRing + 1) % PACK_MAX;
    if (rec.owner && S.packs) S.packs.delete(rec.owner);
    rec.owner = packId;
    var a = rr(0, TAU);
    rec.dx = Math.cos(a);
    rec.dy = Math.sin(a) * 0.5;
    rec.t = rr(2, 5);
    S.packs.set(packId, rec);
    return rec;
  }

  World.entities = S.entities;
  World.playerHits = playerHits;
  // Engine3d uses this capability flag before deciding whether to publish its
  // per-target chew cooldowns. The cooldown lives on the entity rather than
  // the player so several prey can be chewing independently.
  World.__decaysBiteCd = true;

  // ------------------------------------------------------------------ utils
  function rnd() { return S.rng ? S.rng() : 0.5; }
  function rr(a, b) { return a + (b - a) * rnd(); }
  function ri(a, b) { return a + Math.floor(rnd() * (b - a + 1)); }

  // A small self-contained deterministic PRNG (mulberry32), fixed-seeded, used
  // ONLY by the Rev 6 maze-anchored decor placement added below. The shared
  // S.rng stream is consumed, in order, by everything else in init (maze
  // layout, every existing decor pass, then downstream player-spawn/ringPoint
  // sampling in engine3d/selftest); adding more S.rng draws here would shift
  // every later draw and change spawn outcomes the selftest already asserts
  // exactly. A fixed-seed local stream keeps decor placement itself
  // deterministic build-to-build while leaving the shared stream (and
  // everything that depends on its draw COUNT) byte-identical to before.
  function makeLocalRng(seed) {
    var s = seed >>> 0;
    return function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var decorRng = makeLocalRng(0x5eaf100d);
  function drr(a, b) { return a + (b - a) * decorRng(); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function hexNum(v) {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') return parseInt(v, 16) || 0;
    return 0;
  }
  function lerpColor(a, b, t) {
    var ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
    var br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
    return (((ar + (br - ar) * t) | 0) << 16) | (((ag + (bg - ag) * t) | 0) << 8) | ((ab + (bb - ab) * t) | 0);
  }

  function fx(name, x, y, opts) {
    var F = RF.Fx;
    if (F && typeof F.emit === 'function') {
      try { F.emit(name, x, y, opts); } catch (e) { /* FX must never break the sim */ }
    }
  }
  function sfx(name, opts) {
    var Sd = RF.Sound;
    if (Sd && typeof Sd.play === 'function') {
      try { Sd.play(name, opts); } catch (e) { /* audio must never break the sim */ }
    }
  }

  // ------------------------------------------------------------- data lookup
  function D() { return root.RFD || {}; }
  function defOf(defId) {
    var d = D();
    if (d.CREATURE_BY_ID && d.CREATURE_BY_ID[defId]) return d.CREATURE_BY_ID[defId];
    if (d.SHARK_BY_ID && d.SHARK_BY_ID[defId]) return d.SHARK_BY_ID[defId];
    return null;
  }
  function zones() { return (D().ZONES) || []; }
  function budget() { return (D().ENTITY_BUDGET) || { onscreen: 70, total: 140 }; }
  function pickups() { return (D().PICKUPS) || []; }
  function pickupDef(buffId) {
    var P = pickups();
    for (var i = 0; i < P.length; i++) { if (P[i].id === buffId) return P[i]; }
    return null;
  }

  World.zoneAt = function (y) {
    var Z = zones();
    if (!Z.length) return null;
    for (var i = 0; i < Z.length; i++) {
      if (y >= Z[i].yMin && y < Z[i].yMax) return Z[i];
    }
    return y < Z[0].yMin ? Z[0] : Z[Z.length - 1];
  };

  // Body radius derived from tier so collision stays consistent across lanes.
  function radiusFor(def, kind) {
    if (kind === 'pickup') return 14;
    if (kind === 'buffpickup') return 20;
    if (kind === 'hazard') return def && def.id === 'mine' ? 26 : 24;
    var t = def && typeof def.tier === 'number' ? def.tier : 1;
    if (t >= 90) t = 3;
    return 14 + t * 7;
  }

  function playerRenderedLength() {
    var game = RF.Game;
    var player = game && game.ctx && game.ctx.player;
    var playerDef = player && player.def;
    var authoredLen = playerDef && playerDef.sil && playerDef.sil.len;
    if (typeof authoredLen === 'number' && isFinite(authoredLen) && authoredLen > 0) {
      return PLAYER_RENDER_LEN_BASE * authoredLen;
    }
    var gameScale = game && game.LEN_SCALE;
    if (typeof gameScale === 'number' && isFinite(gameScale) && gameScale > 0) {
      return 96 * gameScale;
    }
    return PLAYER_RENDER_LEN_BASE;
  }

  function fishLocalLength(def) {
    var source = S.fishSources && def && S.fishSources[def.id];
    if (source && source.localLength > 0) return source.localLength;
    return 0;
  }

  // This is the desired final world-space length. Instanced lofts divide it
  // by their local geometry width before composing a matrix; billboards use it
  // directly as their x scale. Keeping that distinction here prevents the
  // old radius*2.1 scale from being multiplied by a 2 to 3 unit fish loft.
  function displayLen(def, kind) {
    var base = radiusFor(def, kind) * 2.1;
    if (kind !== 'prey') return base;
    var localLength = fishLocalLength(def);
    var visualLength = localLength > 0 ? base * localLength : base;
    var cap = playerRenderedLength() * PREY_RENDER_FRACTION;
    return visualLength < cap ? visualLength : cap;
  }

  function renderScaleFor(def, kind, localLength) {
    var length = displayLen(def, kind);
    return kind === 'prey' && localLength > 0 ? length / localLength : length;
  }

  function paletteBase(def) {
    if (def && def.sil && def.sil.palette && typeof def.sil.palette.base === 'number') return def.sil.palette.base;
    if (!def) return 0x8899aa;
    switch (def.id) {
      case 'mine': return 0x6a5a4a;
      case 'jelly': return 0xc9a7e8;
      case 'puffer': return 0xe8c46a;
      default: return 0x7fb3c8;
    }
  }

  // ============================================================== 3D RENDER
  //
  // Everything below replaces world.js's Phaser sprite code. The sim never
  // reads any of it: an entity's authority is x/y/vx/vy/angle/st, and the
  // render half only ever WRITES onto three objects from those fields.
  //
  // Three hard rules keep the draw-call and memory gates (SPEC3D "Gates":
  // < 120 draw calls, < 60k tris, <= 120MB):
  //   1. ONE shared unit PlaneGeometry backs every billboard in the world.
  //      A billboard differs from its neighbour only by scale and material.
  //   2. Materials are cached per bake key, so a shoal of 30 minnows is 1
  //      material and 1 texture, not 30.
  //   3. Nothing is created after init() except the first material for a def
  //      the run has not shown yet, which is bounded by the roster size.

  function isThree() { return !!(THREE && THREE.Mesh && THREE.PlaneGeometry); }

  // LIFE-01: true when it was THIS module's World.init() that brought RF.Fx
  // up, and therefore this module's teardown() that must take it down. False
  // when engine3d had already initialised it, so we never tear down effects
  // another lane owns.
  var fxOwned = false;

  // Did RF.Fx.init() actually attach anything to our scene? Detected by
  // COUNTING THE add() CALLS it makes, not by reading scene.children: a real
  // THREE.Scene exposes children, but a caller may hand us any object whose
  // only contract is add(), and reading a field that may not exist is exactly
  // how the first version of this check silently decided it owned nothing.
  // Wrapping add() works for every scene shape there is.
  function countAddsDuring(fn) {
    var sc = S.scene;
    if (!sc || typeof sc.add !== 'function') { fn(); return 0; }
    var realAdd = sc.add;
    var n = 0;
    // Own property or not, the wrapper is installed directly on the object and
    // removed again in the finally, so the scene is left exactly as found.
    var hadOwn = Object.prototype.hasOwnProperty.call(sc, 'add');
    sc.add = function () { n++; return realAdd.apply(this, arguments); };
    try { fn(); } finally {
      if (hadOwn) sc.add = realAdd; else { try { delete sc.add; } catch (e) { sc.add = realAdd; } }
    }
    return n;
  }

  // Guarded add: S.scene may be a stub object in the selftest whose only
  // contract is an add() that collects. Never assume a full THREE.Scene.
  function sceneAdd(obj) {
    if (!obj) return null;
    if (S.scene && typeof S.scene.add === 'function') {
      try { S.scene.add(obj); } catch (e) { /* stub scene */ }
    }
    return obj;
  }

  function quadGeo() {
    if (S.geoQuad) return S.geoQuad;
    if (!isThree()) return null;
    // Unit plane centred on the origin. Every billboard scales this.
    S.geoQuad = new THREE.PlaneGeometry(1, 1);
    return S.geoQuad;
  }

  // --------------------------------------------------------- fallback quads
  // No RF.Art3D (lane D3 absent or its bake failed): prey render as
  // VERTEX-COLOURED plane quads, per the lane brief. Countershading is baked
  // into the vertex colours (dark dorsal, bright flank, pale belly) so a
  // fallback body still reads as a fish silhouette rather than a flat card.
  var fallbackGeoCache = null;
  function fallbackGeo() {
    if (fallbackGeoCache) return fallbackGeoCache;
    if (!isThree()) return null;
    var g = new THREE.PlaneGeometry(1, 1, 1, 2);   // 2 rows so we can shade v
    fallbackGeoCache = g;
    return g;
  }

  // A vertex-coloured quad material is per-COLOUR, not per-entity, so the
  // whole roster collapses to a handful of materials.
  function fallbackMaterial(color, glow) {
    var key = 'fb_' + (color >>> 0).toString(16) + (glow ? '_g' : '');
    var cached = S.matCache[key];
    if (cached) return cached;
    if (!isThree()) return null;
    var m = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: glow ? 0.92 : 1,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    S.matCache[key] = m;
    return m;
  }

  // Build the vertex colours ONCE onto the shared fallback geometry clone.
  // Cloning is bounded by the number of distinct palettes in the roster.
  function fallbackMesh(color, glow) {
    var g = fallbackGeo();
    var m = fallbackMaterial(color, glow);
    if (!g || !m) return null;
    var key = 'fbg_' + (color >>> 0).toString(16);
    var geo = S.matCache[key];
    if (!geo) {
      geo = g.clone();
      var pos = geo.attributes && geo.attributes.position;
      var n = pos ? pos.count : 0;
      if (n) {
        var arr = new Float32Array(n * 3);
        var dorsal = lerpColor(color, 0x000000, 0.45);
        var belly = lerpColor(color, 0xffffff, 0.5);
        for (var i = 0; i < n; i++) {
          // PlaneGeometry y runs +0.5 (top) to -0.5 (bottom). In sim space y
          // is DOWN, and the mesh is placed at -y, so plane-top is the fish's
          // BACK. Dark dorsal at the top, pale belly at the bottom.
          var vy = pos.getY(i);
          var t = clamp(0.5 - vy, 0, 1);            // 0 at back, 1 at belly
          var c = lerpColor(dorsal, belly, t);
          arr[i * 3] = ((c >> 16) & 255) / 255;
          arr[i * 3 + 1] = ((c >> 8) & 255) / 255;
          arr[i * 3 + 2] = (c & 255) / 255;
        }
        geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      }
      S.matCache[key] = geo;
    }
    var mat = S.matCache[key + '_m'];
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({
        vertexColors: true, transparent: true, side: THREE.DoubleSide,
        depthWrite: false, opacity: glow ? 0.95 : 1,
      });
      S.matCache[key + '_m'] = mat;
    }
    return new THREE.Mesh(geo, mat);
  }

  // ----------------------------------------------------------- billboards
  //
  // RF.Art3D.billboard(input) wraps a SOURCE into a double-sided plane sprite
  // and sets scale.x to the source's own aspect ratio (SPEC3D, lane D3). Its
  // contract accepts an HTMLCanvas, a THREE.Texture, or a string key, and the
  // string path only resolves through RF.Art.canvasFor / a DOM node id.
  //
  // FIX (integration probe): this lane used to hand it BAKE KEY STRINGS.
  // In the 2D build Phaser's loader had already created those textures; the
  // 3D build has no Phaser and no loader, so every key missed, billboard()
  // fell through to its 1x1 transparent DataTexture, and every prey in the
  // world drew as an invisible speck. Nothing threw, so the fallback quad
  // never engaged either. Keys are therefore never passed for creatures now.
  // There are exactly two real sources, and this lane resolves both itself:
  //
  //   Kenney PNG   sprite key without a 'proc_' prefix, e.g. 'fish_blue'.
  //                assets/<sprite>.png is loaded ONCE through
  //                THREE.TextureLoader and cached by key. The TEXTURE is
  //                handed to billboard().
  //   procedural   sprite key with a 'proc_' prefix, plus every fallback.
  //                RF.Art.bakeCreature (sharkart.js, renderer agnostic) is
  //                called against a STUB SCENE whose addCanvas records the
  //                canvas it produced. The CANVAS is handed to billboard().
  //
  // Both are cached per key, so a shoal of 30 minnows is still one texture and
  // (through billboard's own material cache) one material. RF.Art absent, or a
  // bake that throws, degrades to the vertex-coloured quad exactly as before.

  var texCache = null;        // sprite key -> THREE.Texture (Kenney PNGs)
  var canvasCache = null;     // bake key -> HTMLCanvas (procedural bakes)
  var texLoader = null;       // one THREE.TextureLoader for the whole run
  var ASSET_DIR = 'assets/';

  // Overridable for the selftest, which has no GL and no network. Injecting a
  // loader is the only way to exercise the Kenney branch headlessly.
  function textureLoader() {
    if (texLoader) return texLoader;
    var L = World.__TextureLoader || (THREE && THREE.TextureLoader);
    if (typeof L !== 'function') return null;
    try { texLoader = new L(); } catch (e) { texLoader = null; }
    return texLoader;
  }

  // Load assets/<sprite>.png ONCE. Three's loader is asynchronous, but the
  // texture object it returns is live immediately and repaints itself when the
  // image lands, so the billboard can be built on frame one and simply becomes
  // correct a moment later. No callback is needed and nothing waits.
  function kenneyTexture(sprite) {
    if (!sprite) return null;
    var cached = texCache[sprite];
    if (cached !== undefined) return cached;
    var loader = textureLoader();
    var tex = null;
    if (loader && typeof loader.load === 'function') {
      try {
        tex = loader.load(ASSET_DIR + sprite + '.png');
        if (tex) {
          // Colour space matters: these are authored sRGB PNGs and a linear
          // read washes every fish out under the engine's tone mapping.
          if (THREE && THREE.SRGBColorSpace && 'colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
          if (THREE && THREE.LinearFilter !== undefined) {
            tex.magFilter = THREE.LinearFilter;
            tex.minFilter = THREE.LinearMipmapLinearFilter !== undefined
              ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
          }
          tex.generateMipmaps = true;
          tex.needsUpdate = true;
        }
      } catch (e) { tex = null; }
    }
    texCache[sprite] = tex || null;
    return tex || null;
  }

  // Build the two tiny procedural surface maps once and retain them in the
  // documented asset cache. A real page gets CanvasTextures; the headless
  // selftest gets equivalent DataTextures, which keeps the exact same map,
  // wrapping and offset contract without requiring a DOM or GL context.
  function surfaceTexture(key, radial) {
    if (texCache[key] !== undefined) return texCache[key];
    var size = 256;
    var pixels = new Uint8Array(size * size * 4);
    var x, y, i, u, v, d, n, a;
    for (y = 0; y < size; y++) {
      v = y / size;
      for (x = 0; x < size; x++) {
        u = x / size;
        i = (y * size + x) * 4;
        if (radial) {
          var dx = u * 2 - 1;
          var dy = v * 2 - 1;
          d = Math.sqrt(dx * dx + dy * dy);
          a = d < 1 ? Math.round((1 - d) * (1 - d) * 255) : 0;
          pixels[i] = 255; pixels[i + 1] = 255; pixels[i + 2] = 255; pixels[i + 3] = a;
        } else {
          // Periodic value-noise-like ripples. The sine basis is tileable at
          // both edges and has enough bands for the wash to read as moving
          // surface texture rather than a flat colour.
          n = 0.5 + 0.22 * Math.sin(u * TAU * 5) + 0.16 * Math.sin(v * TAU * 7);
          n += 0.12 * Math.sin((u + v) * TAU * 11);
          n = clamp(n, 0, 1);
          n = Math.round(n * 255);
          pixels[i] = n; pixels[i + 1] = n; pixels[i + 2] = n; pixels[i + 3] = 255;
        }
      }
    }

    var canvas = null, cctx = null;
    try {
      if (root.OffscreenCanvas) canvas = new root.OffscreenCanvas(size, size);
      else if (root.document && typeof root.document.createElement === 'function') {
        canvas = root.document.createElement('canvas');
        canvas.width = size; canvas.height = size;
      }
      if (canvas && typeof canvas.getContext === 'function') {
        cctx = canvas.getContext('2d');
        if (cctx && typeof cctx.createImageData === 'function') {
          var image = cctx.createImageData(size, size);
          image.data.set(pixels);
          cctx.putImageData(image, 0, 0);
        }
      }
    } catch (e) { canvas = null; cctx = null; }

    var tex = null;
    try {
      if (canvas && THREE.CanvasTexture) tex = new THREE.CanvasTexture(canvas);
      else if (THREE.DataTexture) tex = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
      if (tex) {
        tex.needsUpdate = true;
        if (radial) {
          tex.wrapS = THREE.ClampToEdgeWrapping;
          tex.wrapT = THREE.ClampToEdgeWrapping;
        } else {
          tex.wrapS = THREE.RepeatWrapping;
          tex.wrapT = THREE.RepeatWrapping;
          if (tex.repeat && typeof tex.repeat.set === 'function') tex.repeat.set(3, 1.5);
        }
        if ('toneMapped' in tex) tex.toneMapped = false;
      }
    } catch (e2) { tex = null; }
    texCache[key] = tex || null;
    return tex || null;
  }

  // One persistent 1D feather shared by every god-ray band. The RGB channels
  // stay white so the map contributes only a smooth alpha falloff at each
  // shaft edge; this keeps the merged geometry from reading as hard slabs.
  function rayFeatherTexture() {
    var key = '__rf_ray_feather';
    if (texCache[key] !== undefined) return texCache[key];
    var width = 16;
    var pixels = new Uint8Array(width * 4);
    for (var i = 0; i < width; i++) {
      var u = i / (width - 1);
      var edge = Math.sin(Math.PI * u);
      var alpha = Math.round(clamp(edge * edge, 0, 1) * 255);
      pixels[i * 4] = 255;
      pixels[i * 4 + 1] = 255;
      pixels[i * 4 + 2] = 255;
      pixels[i * 4 + 3] = alpha;
    }
    var tex = null;
    try {
      if (THREE.DataTexture) tex = new THREE.DataTexture(pixels, width, 1, THREE.RGBAFormat);
      if (tex) {
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.magFilter = THREE.LinearFilter;
        tex.minFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        tex.needsUpdate = true;
        if ('toneMapped' in tex) tex.toneMapped = false;
      }
    } catch (e) { tex = null; }
    texCache[key] = tex || null;
    return tex || null;
  }

  // Stub scene handed to RF.Art.bakeCreature purely to CAPTURE the canvas it
  // bakes. bakeCreature's only scene contract is textures.exists(key) and
  // textures.addCanvas(key, canvas); exists() always answers false so the bake
  // always runs its addCanvas path, and addCanvas records the canvas here.
  // ONE stub object, reused for every bake, so this allocates nothing per call.
  var bakeStub = {
    captured: null,
    capturedKey: null,
    textures: {
      exists: function () { return false; },
      addCanvas: function (key, canvas) { bakeStub.capturedKey = key; bakeStub.captured = canvas; },
      get: function () { return null; },
    },
  };

  function isCanvasLike(c) {
    return !!(c && typeof c.getContext === 'function' && c.width > 0 && c.height > 0);
  }

  // Bake one creature def to a canvas via 2D RF.Art. Cached by the bake key so
  // the second minnow of a run re-uses the first one's canvas.
  function bakedCanvas(def) {
    var A = RF.Art;
    if (!A || typeof A.bakeCreature !== 'function') return null;
    var sprite = def && def.sprite ? String(def.sprite) : '';
    var cacheKey = 'rf_' + (sprite || ('def_' + (def && def.id)));
    var cached = canvasCache[cacheKey];
    if (cached !== undefined) return cached;
    bakeStub.captured = null;
    bakeStub.capturedKey = null;
    var canvas = null;
    try {
      A.bakeCreature(bakeStub, def);
      if (isCanvasLike(bakeStub.captured)) canvas = bakeStub.captured;
    } catch (e) { canvas = null; }
    bakeStub.captured = null;
    canvasCache[cacheKey] = canvas || null;
    return canvas || null;
  }

  function art3d() {
    var A = RF.Art3D;
    return A && typeof A.billboard === 'function' ? A : null;
  }

  // Build a billboard from a real SOURCE (texture or canvas), never a key.
  function billboardFrom(source) {
    var A = art3d();
    if (!A || !source) return null;
    try {
      var o = A.billboard(source);
      return o || null;
    } catch (e) { return null; }
  }

  // Returns a three Object3D for one entity, or null when nothing can be made.
  // Every path is guarded: a throwing RF.Art3D falls through to the quad.
  function makeBillboard(def, kind) {
    if (!def) return fallbackMesh(paletteBase(def), false);
    var sprite = def.sprite ? String(def.sprite) : '';
    var obj = null;
    if (sprite && sprite.indexOf('proc_') !== 0) {
      // Kenney fish PNG.
      var tex = kenneyTexture(sprite);
      obj = billboardFrom(tex);
      // billboard() only reads an aspect off a CANVAS source; for a texture it
      // leaves scale.x at 1, which viewAcquire would then capture as a square
      // fish. The image may also still be loading, in which case there is no
      // width to read yet, so a nose-right fish's nominal 2:1 stands in until
      // the decode lands. Either way scale.x carries the proportions, which is
      // the contract viewAcquire captures.
      if (obj && obj.scale) {
        var im = tex && tex.image;
        var iw = im && (im.naturalWidth || im.width) || 0;
        var ih = im && (im.naturalHeight || im.height) || 0;
        obj.scale.x = (iw > 0 && ih > 0) ? (iw / ih) : 2;
      }
    }
    if (!obj) {
      // Procedural bake, and the fallback for a Kenney sprite whose texture
      // could not be created (no loader in a headless caller).
      obj = billboardFrom(bakedCanvas(def));
    }
    if (obj) return obj;
    return fallbackMesh(paletteBase(def), kind === 'predator');
  }

  // NPC sharks are RIGS, not billboards: RF.Art3D.buildShark(def) returns
  // { group, parts, animate(t, state) } and the group is driven from the
  // entity's velocity every update. Absent lane D3, an NPC shark degrades to
  // the same billboard path as everything else and the interim pitch
  // oscillation from world.js Rev 4 stands in for the rig animation.
  function makeSharkRig(def) {
    var A = RF.Art3D;
    if (!A || typeof A.buildShark !== 'function') return null;
    try {
      var rig = A.buildShark(def);
      if (rig && rig.group) {
        var group = rig.group;
        var gameScale = RF.Game && RF.Game.LEN_SCALE;
        if (!(typeof gameScale === 'number' && isFinite(gameScale) && gameScale > 0)) gameScale = 1;
        var already = group.__rfLenScale;
        var baseScale = group.userData && group.userData.baseScale;
        if (!(typeof baseScale === 'number' && isFinite(baseScale) && baseScale > 0)) {
          baseScale = group.__baseScale;
        }
        if (!(typeof baseScale === 'number' && isFinite(baseScale) && baseScale > 0)) {
          baseScale = group.scale && group.scale.x > 0 ? group.scale.x : 1;
        }
        if (already !== gameScale) {
          var scaled = baseScale * gameScale;
          if (group.scale && group.scale.setScalar) group.scale.setScalar(scaled);
          else if (group.scale) {
            group.scale.x = scaled; group.scale.y = scaled; group.scale.z = scaled;
          }
          group.__baseScale = scaled;
          group.__rfLenScale = gameScale;
        } else if (!(typeof group.__baseScale === 'number' && isFinite(group.__baseScale))) {
          group.__baseScale = group.scale && group.scale.x > 0 ? group.scale.x : baseScale * gameScale;
        }
        return rig;
      }
    } catch (e) { /* lane D3 not ready or this def is unsupported */ }
    return null;
  }

  // ------------------------------------------------------ instanced prey
  // RF.Art3D.buildFish belongs to the fish-loft lane and is intentionally
  // optional. A build may be the build record itself, or a small mesh wrapper;
  // normalize both shapes here so this lane can ship before that lane does.
  function fishBuildSource(build) {
    if (!build) return null;
    var mesh = build.geometry ? build : (build.mesh || build.object || build.body || null);
    var geometry = mesh && mesh.geometry;
    if (!geometry || typeof geometry.clone !== 'function') return null;
    var material = mesh && mesh.material;
    if (Array.isArray(material)) material = material[0];
    if (!material) {
      if (!fishSharedMaterial) {
        fishSharedMaterial = new THREE.MeshToonMaterial({
          color: 0xffffff,
          vertexColors: true,
          side: THREE.DoubleSide,
        });
        var fishBaseKey = typeof fishSharedMaterial.customProgramCacheKey === 'function'
          ? fishSharedMaterial.customProgramCacheKey() : 'MeshToonMaterial';
        fishSharedMaterial.customProgramCacheKey = function () {
          return String(fishBaseKey) + ':rf-bend';
        };
        fishSharedMaterial.userData = fishSharedMaterial.userData || {};
        fishSharedMaterial.userData.rfFishMaterial = true;
      }
      material = fishSharedMaterial;
    }
    if (!material || typeof material.clone !== 'function') return null;
    var bounds = geometry.boundingBox;
    var localLength = bounds && bounds.max && bounds.min
      ? bounds.max.x - bounds.min.x : 0;
    return {
      build: build,
      geometry: geometry,
      material: material,
      localLength: localLength > 0 && isFinite(localLength) ? localLength : 0,
      paletteId: geometry.userData && geometry.userData.rfFishPaletteId || null,
    };
  }

  function ownedPush(list, value) {
    if (!value || !list) return;
    for (var i = 0; i < list.length; i++) if (list[i] === value) return;
    list.push(value);
  }

  var INST_BEND_CHUNK =
    'float bendT=smoothstep(uBendSpan.x,uBendSpan.y,-transformed.x); ' +
    'transformed.z += aBendAmp*bendT*sin(aBendPhase+transformed.x*uBendK);';

  // Install the instanced bend contract on a CLONED material only. The base
  // fish-lane material remains untouched, and the cache key is distinct from
  // the shark/solid bend variants so Three never aliases the programs.
  function installInstancedBend(material) {
    if (!material) return null;
    if (!material.userData) material.userData = {};
    var baseKey = typeof material.customProgramCacheKey === 'function'
      ? material.customProgramCacheKey() : (material.type || 'rf-fish');
    var previousCompile = material.onBeforeCompile;
    material.onBeforeCompile = function (shader, renderer) {
      if (previousCompile) previousCompile.call(this, shader, renderer);
      shader.uniforms.uBendK = { value: INST_BEND_K };
      shader.uniforms.uBendSpan = { value: material.userData.rfBendSpan };
      var attrs = 'uniform float uBendK;\nuniform vec2 uBendSpan;\n' +
        'attribute float aBendPhase;\nattribute float aBendAmp;\n';
      if (shader.vertexShader.indexOf('attribute float aBendPhase') < 0) {
        shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n' + attrs);
      }
      if (shader.vertexShader.indexOf(INST_BEND_CHUNK) < 0) {
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
          '#include <begin_vertex>\n' + INST_BEND_CHUNK);
      }
    };
    material.customProgramCacheKey = function () { return String(baseKey) + ':rf-bend-inst'; };
    material.userData.rfBendInstanced = true;
    material.userData.rfBendSpan = new THREE.Vector2(INST_BEND_SPAN[0], INST_BEND_SPAN[1]);
    material.userData.rfBendK = INST_BEND_K;
    material.vertexColors = true;
    material.needsUpdate = true;
    return material;
  }

  function createInstancedBatch(def, source, capacity, interactive) {
    if (!source || !isThree() || typeof THREE.InstancedMesh !== 'function' ||
      typeof THREE.InstancedBufferAttribute !== 'function') return null;
    if (typeof source.geometry.clone !== 'function' || typeof source.material.clone !== 'function') return null;
    var geometry = null, material = null, mesh = null;
    try {
      // Attributes are per InstancedMesh, so every batch gets its own geometry
      // clone even when interactive prey and decor schools share a fish build.
      geometry = source.geometry.clone();
      material = installInstancedBend(source.material.clone());
      if (!material || typeof geometry.setAttribute !== 'function') throw new Error('fish batch attributes unavailable');
      material.userData = material.userData || {};
      material.userData.rfFishVertexColors = true;
      material.userData.rfFishPaletteId = source.paletteId || (def && def.id) || null;
      mesh = new THREE.InstancedMesh(geometry, material, capacity);
      var phase = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
      var amp = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
      var colors = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
      geometry.setAttribute('aBendPhase', phase);
      geometry.setAttribute('aBendAmp', amp);
      if (typeof phase.setUsage === 'function' && THREE.DynamicDrawUsage !== undefined) phase.setUsage(THREE.DynamicDrawUsage);
      if (typeof amp.setUsage === 'function' && THREE.DynamicDrawUsage !== undefined) amp.setUsage(THREE.DynamicDrawUsage);
      if (typeof colors.setUsage === 'function' && THREE.DynamicDrawUsage !== undefined) colors.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor = colors;
      mesh.frustumCulled = false;
      mesh.count = 0;
      if (mesh.instanceMatrix && typeof mesh.instanceMatrix.setUsage === 'function' && THREE.DynamicDrawUsage !== undefined) {
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      } else if (!mesh.instanceMatrix) {
        throw new Error('instanced matrix unavailable');
      }
    } catch (err) {
      if (material) disposeOne(material);
      if (geometry) disposeOne(geometry);
      return null;
    }
    var batch = {
      def: def,
      mesh: mesh,
      geometry: geometry,
      material: material,
      phase: phase,
      amp: amp,
      colors: colors,
      capacity: capacity,
      count: 0,
      dirty: false,
      interactive: !!interactive,
      slotEntities: interactive ? new Array(capacity) : null,
      records: interactive ? new Array(capacity) : null,
      phaseBase: interactive ? null : new Float32Array(capacity),
      source: source,
      localLength: source.localLength,
      paletteId: source.paletteId || (def && def.id) || null,
    };
    if (interactive) {
      for (var i = 0; i < capacity; i++) {
        batch.records[i] = {
          obj: mesh, rig: null, aspect: 1, instanced: true,
          batch: batch, slot: -1, entity: null,
          localLength: batch.localLength, paletteId: batch.paletteId,
        };
      }
    }
    ownedPush(envOwned.geos, geometry);
    ownedPush(envOwned.mats, material);
    ownedPush(envOwned.attributes, phase);
    ownedPush(envOwned.attributes, amp);
    ownedPush(envOwned.attributes, colors);
    return batch;
  }

  function buildFishSources() {
    S.fishSources = {};
    var A = RF.Art3D;
    var rows = D().CREATURES || [];
    if (!A || typeof A.buildFish !== 'function') return;
    for (var i = 0; i < rows.length; i++) {
      var def = rows[i];
      if (!def || def.kind !== 'prey') continue;
      var build = null;
      try { build = A.buildFish(def); } catch (err) { build = null; }
      var source = fishBuildSource(build);
      if (!source) continue;
      source.def = def;
      S.fishSources[def.id] = source;
      // Fish geometry and the shared source material belong to fish3d's
      // persistent cache. This run only owns cloned batch resources.
    }
  }

  function buildInstancedPrey() {
    S.instancedByDef = {};
    S.instancedPrey.length = 0;
    var rows = D().CREATURES || [];
    var cap = (D().ENTITY_BUDGET && D().ENTITY_BUDGET.total) || 140;
    for (var i = 0; i < rows.length; i++) {
      var def = rows[i];
      var source = def && S.fishSources && S.fishSources[def.id];
      if (!source) continue;
      var batch = createInstancedBatch(def, source, cap, true);
      if (!batch) continue;
      S.instancedByDef[def.id] = batch;
      S.instancedPrey.push(batch);
      var key = 'prey:' + def.id;
      S.views[key] = { free: [], live: 0, peak: 0, instanced: batch };
      meshName(batch.mesh, 'RF instanced prey ' + def.id);
      sceneAdd(batch.mesh);
    }
  }

  function meshName(mesh, name) {
    if (mesh) mesh.name = name;
  }

  function fillSchoolBatch(batch, zone, index) {
    var low = Math.max(SURFACE_Y + 45, zone.yMin + 40);
    var high = Math.min(S.h - SEAFLOOR_MARGIN - 20, zone.yMax - 40);
    if (high < low) high = low;
    var n = SCHOOL_N;
    var schoolScale = renderScaleFor(batch.def, 'prey', batch.localLength);
    batch.count = n;
    batch.mesh.count = n;
    // Art MAJOR 5 (staging): pure uniform placement piled fish into dense
    // overlapping clusters at the frame edge. Instead, lay the school out as
    // a small number of loose sub-clusters spread across the zone's x-range,
    // each with a modest local jitter radius, so the school reads as several
    // readable lanes rather than one solid blob. Still fully deterministic
    // (rr/S.rng only) and build-time only.
    var clusterN = 5;
    var clusterCX = [], clusterCY = [];
    for (var c = 0; c < clusterN; c++) {
      clusterCX.push(rr(S.w * (c / clusterN), S.w * ((c + 1) / clusterN)));
      clusterCY.push(rr(low, high));
    }
    for (var i = 0; i < n; i++) {
      var ci = i % clusterN;
      var x = clamp(clusterCX[ci] + rr(-260, 260), 40, S.w - 40);
      var y = clamp(clusterCY[ci] + rr(-90, 90), low, high);
      instPosScratch.set(x, -y, SCHOOL_Z);
      instEulerScratch.set(0, 0, 0);
      instQuatScratch.setFromEuler(instEulerScratch);
      instScaleScratch.set(schoolScale, schoolScale, schoolScale);
      instMatrixScratch.compose(instPosScratch, instQuatScratch, instScaleScratch);
      batch.mesh.setMatrixAt(i, instMatrixScratch);
      batch.phaseBase[i] = rr(0, TAU) + index * 0.7;
      batch.phase.setX(i, batch.phaseBase[i]);
      batch.amp.setX(i, 0.08);
      // Art MAJOR 5 (differentiated prey coloring): a mild per-instance tint
      // variance so a school of identical minnows does not read as one flat
      // silhouette; still white-centred so the fish's own vertex-colour
      // palette remains the dominant read.
      var tintV = 0.85 + rr(0, 0.3);
      batch.colors.setXYZ(i, tintV, tintV, Math.min(1, tintV + 0.06));
    }
    batch.dirty = true;
  }

  function buildBackgroundSchools() {
    var rows = zones();
    for (var i = 0; i < rows.length; i++) {
      var zone = rows[i];
      var source = S.fishSources && S.fishSources.minnow;
      var batch = source ? createInstancedBatch(source.def || defOf('minnow'), source, SCHOOL_N, false) : null;
      if (batch) {
        fillSchoolBatch(batch, zone, i);
        meshName(batch.mesh, 'RF minnow school zone ' + (i + 1));
        sceneAdd(batch.mesh);
        S.decor.push(batch.mesh);
        S.backgroundSchools.push({ batch: batch, mesh: batch.mesh, rate: 0.08 + i * 0.017,
          phase: rr(0, TAU), x0: 0, y0: 0, ampX: 0, ampY: 0, fallback: false });
        continue;
      }

      // If the loft or instancing path is absent, keep the same one-draw school
      // promise with a merged billboard batch. It is decorative only and never
      // enters the entity pool or spatial hash.
      quadReset();
      var tex = kenneyTexture('fish_blue');
      for (var j = 0; j < SCHOOL_N; j++) {
        var sx = rr(0, S.w), sy = rr(Math.max(SURFACE_Y + 45, zone.yMin + 40),
          Math.min(S.h - SEAFLOOR_MARGIN - 20, zone.yMax - 40));
        quadPush(sx, -sy, SCHOOL_Z, rr(36, 62), rr(14, 26), 0,
          rnd() < 0.5 ? -1 : 1, tex ? 0xffffff : paletteBase(defOf('minnow')), 0.46);
      }
      var fallback = batchMesh(tex, false, undefined);
      if (!fallback) continue;
      meshName(fallback, 'RF minnow billboard school zone ' + (i + 1));
      sceneAdd(fallback);
      S.decor.push(fallback);
      S.backgroundSchools.push({ batch: null, mesh: fallback, rate: 0.08 + i * 0.017,
        phase: rr(0, TAU), x0: 0, y0: 0, ampX: 18 + i * 5, ampY: 6 + i * 2, fallback: true });
    }
  }

  function makeFishMesh(def) {
    var source = S.fishSources && S.fishSources[def && def.id];
    if (!source || !THREE.Mesh) return null;
    var material = null;
    try { material = source.material.clone(); } catch (err) { material = null; }
    if (!material) return null;
    material.__rfPrivate = true;
    material.__rfBase = material.color && typeof material.color.getHex === 'function'
      ? material.color.getHex() : 0xffffff;
    material.userData = material.userData || {};
    material.userData.rfFishVertexColors = true;
    material.userData.rfFishPaletteId = source.paletteId || (def && def.id) || null;
    return new THREE.Mesh(source.geometry, material);
  }

  // A coin pickup has no bake of its own in EITHER roster, and there is no
  // coin.png in assets/. It therefore uses the glowing fallback quad outright.
  //
  // It used to ask for the key 'rf_coin' first. That was the same latent bug
  // as the creature billboards: nothing ever registers that key, so
  // billboard() returned an INVISIBLE 1x1 placeholder instead of throwing, and
  // the fallback below was unreachable. Asking for art that does not exist is
  // not free when the miss is silent, so the request is simply gone.
  // One material for every coin in the world.
  function makeCoin() {
    return fallbackMesh(0xffd166, true);
  }

  // ------------------------------------------------------- object3d helpers
  // These are the ONLY writers onto three objects outside init. Each one is
  // null-guarded so a stub object with no .position still passes through.
  function setPos(o, x, y, z) {
    if (!o || !o.position) return;
    o.position.x = x;
    o.position.y = -y;                 // sim y is DOWN, three y is UP
    if (z !== undefined) o.position.z = z;
  }
  function setRot(o, r) {
    // Sim angle is measured in a y-DOWN frame; the three plane lives in a
    // y-UP frame, so a sim rotation is NEGATED about z.
    if (o && o.rotation) o.rotation.z = -r;
  }
  function setScale(o, sx, sy) {
    if (o && o.scale) { o.scale.x = sx; o.scale.y = sy; }
  }
  function setVisible(o, v) { if (o) o.visible = !!v; }
  function setOpacity(o, a) {
    if (!o) return;
    var m = o.material;
    if (m) { m.transparent = true; m.opacity = a; return; }
    // Groups (shark rigs) push opacity down to their children.
    if (o.children) {
      for (var i = 0; i < o.children.length; i++) {
        var cm = o.children[i].material;
        if (cm) { cm.transparent = true; cm.opacity = a; }
      }
    }
  }
  // Status tint. Materials are SHARED, so tinting a material would tint every
  // entity that uses it. Each entity therefore owns a per-object tint applied
  // through the mesh's own colour slot only when the object carries a private
  // material; when it does not, the tint is skipped rather than leaking.
  function setTint(o, color) {
    if (!o || !o.material || !o.material.color || !o.material.__rfPrivate) return;
    o.material.color.setHex(color);
  }
  // Give one entity object a private material clone so its status tint cannot
  // leak into the shared pool. Done ONCE per pool slot at build time, so it is
  // bounded by ENTITY_BUDGET.total and never happens per frame.
  function privatiseMaterial(o) {
    if (!o || !o.material || typeof o.material.clone !== 'function') return o;
    if (o.material.__rfPrivate) return o;
    var m = o.material.clone();
    m.__rfPrivate = true;
    m.__rfBase = (m.color && typeof m.color.getHex === 'function') ? m.color.getHex() : 0xffffff;
    o.material = m;
    return o;
  }
  function clearTint(o) {
    if (!o || !o.material || !o.material.__rfPrivate || !o.material.color) return;
    o.material.color.setHex(o.material.__rfBase);
  }

  // ========================================================== ENVIRONMENT
  //
  // SPEC3D replaces world.js's five painted background layers with real 3D
  // atmosphere. The authored water ramp is now one opaque world-anchored sheet;
  // scene.fog and the renderer clear colour carry the continuous camera cue,
  // while terrain and the remaining decor supply depth silhouettes.
  //
  // What survives as geometry, and why:
  //   god rays      additive planes, they are LIGHT and must overlay
  //   caustics      additive planes near the surface, same reason
  //   surface       a 64-segment ribbon at y = 0 plus a foam strip and Snell disc
  //   kelp / rocks  billboards at parallax z, they are OBJECTS with silhouette
  //   silhouettes   very transparent dark planes, the far-water landmarks
  //   gradient     one opaque RGBA sheet spanning the world plus overshoot
  //   terrain      three parallax ridges plus one sparse foreground occluder
  //   seams         thermocline bands at zone boundaries
  //
  // Everything is built ONCE in init. Only the existing animated water
  // registries receive scalar writes per frame; the gradient and terrain are
  // completely static.

  // ------------------------------------------------- PERF-03 batching
  //
  // The review measured 134 draw calls against a budget of 120, and this lane
  // was the biggest single contributor: 26 ray planes, 194 decor billboards,
  // 34 silhouettes, 6 seams, each with its OWN material, was ~260 draw calls
  // of environment before a single creature drew. Frustum culling hid most of
  // them from the count on any one frame, which is exactly why the number
  // drifted: it was luck, not a budget.
  //
  // Two mechanisms fix it, and both are build-time only:
  //
  //   MATERIAL CACHE   envMaterial(color, opacity, additive, map) returns a
  //                    SHARED material per key. Two rocks, two seams, two rays
  //                    of the same look now share one material object, which
  //                    is also what lets them share a draw call at all.
  //   GEOMETRY MERGE   mergeQuads() bakes N transformed unit quads into ONE
  //                    BufferGeometry with per-vertex colour AND per-vertex
  //                    alpha, so a batch whose members had different tints and
  //                    different opacities still draws once. The three build
  //                    vendored at /play/_shared/three has no
  //                    BufferGeometryUtils, so the merge is written here; it
  //                    is 12 lines of arithmetic over a unit quad and needs
  //                    nothing else.
  //
  // What CANNOT merge, and why it is left alone: anything whose per-instance
  // animation is a transform. Those are batched by PHASE BUCKET instead (see
  // buildRays/buildDecor): members of a bucket share one merged geometry and
  // one pivot, so they move together. Physically that is more correct than the
  // old per-plane noise anyway, because light shafts and kelp beds move in
  // sheets under one current, not independently.

  var envMatCache = null;      // env material key -> shared THREE.Material
  var envOwned = null;         // every env material/geometry this run created
  // Guard: every creation site runs inside init(), which fills both, but a
  // caller that reaches a builder before init should not throw.
  function ownership() {
    if (!envOwned) envOwned = freshOwned();
    if (!envMatCache) envMatCache = {};
    return envOwned;
  }

  function envMaterial(color, opacity, additive, map, vcolors, flags) {
    if (!isThree()) return null;
    ownership();
    flags = flags || {};
    var noFog = flags.fog === false;
    var opaque = flags.opaque === true;
    var key = 'e' + ((color >>> 0).toString(16)) + '_' + Math.round(opacity * 1000) +
      (additive ? '_a' : '') + (vcolors ? '_v' : '') +
      (noFog ? '_nf' : '_f') + (opaque ? '_o' : '_t') +
      (map && map.uuid ? ('_m' + map.uuid) : '');
    var cached = envMatCache[key];
    if (cached) return cached;
    var m = new THREE.MeshBasicMaterial({
      color: color,
      transparent: !opaque,
      opacity: opaque ? 1 : opacity,
      side: THREE.DoubleSide,
      depthWrite: opaque,
    });
    m.fog = !noFog;
    if (map) { m.map = map; if ('toneMapped' in m) m.toneMapped = false; }
    if (vcolors) m.vertexColors = true;
    if (additive && THREE.AdditiveBlending !== undefined) m.blending = THREE.AdditiveBlending;
    envMatCache[key] = m;
    envOwned.mats.push(m);
    return m;
  }

  function planeMesh(w, h, color, opacity, additive, map) {
    var g = quadGeo();
    if (!g) return null;
    var m = envMaterial(color, opacity, additive, map || null, false);
    if (!m) return null;
    var mesh = new THREE.Mesh(g, m);
    mesh.scale.x = w;
    mesh.scale.y = h;
    return mesh;
  }

  // A plane whose OPACITY is written per frame cannot share a material with
  // anything else, because opacity lives on the material. The caustics (and
  // the mapped wash plane) therefore ask for private materials; static
  // environment batches use the cache above.
  function planeMeshPrivate(w, h, color, opacity, additive, map) {
    var g = quadGeo();
    if (!g) return null;
    ownership();
    var m = new THREE.MeshBasicMaterial({
      color: color, transparent: true, opacity: opacity,
      side: THREE.DoubleSide, depthWrite: false,
    });
    if (map) { m.map = map; if ('toneMapped' in m) m.toneMapped = false; }
    if (additive && THREE.AdditiveBlending !== undefined) m.blending = THREE.AdditiveBlending;
    envOwned.mats.push(m);
    var mesh = new THREE.Mesh(g, m);
    mesh.scale.x = w;
    mesh.scale.y = h;
    return mesh;
  }

  // ---------------------------------------------------------- quad merge
  //
  // A batch is described by a flat list of quad records pushed into module
  // scratch, so describing 90 rocks allocates one array that is reused for the
  // next batch rather than 90 objects. mergeQuads consumes the scratch and
  // returns ONE geometry.
  //
  // Per quad: cx, cy (three-space, y already negated by the caller), z, w, h,
  // rotation, mirror (+-1), colour, alpha, optional top colour. Colour and
  // alpha ride the vertex colour attribute (RGBA), which is why a batch can
  // hold 90 rocks at 90 different opacities and still be one material.
  var quadScratch = [];
  var quadN = 0;
  function quadReset() { quadN = 0; }
  function quadPush(cx, cy, z, w, h, rot, mirror, color, alpha, topColor) {
    var q = quadScratch[quadN];
    if (!q) {
      q = quadScratch[quadN] = {
        cx: 0, cy: 0, z: 0, w: 0, h: 0, rot: 0, mirror: 1,
        color: 0, topColor: 0, bottomColor: 0,
        alpha: 1, topAlpha: 1, bottomAlpha: 1,
      };
    }
    quadN++;
    q.cx = cx; q.cy = cy; q.z = z; q.w = w; q.h = h;
    q.rot = rot || 0; q.mirror = mirror < 0 ? -1 : 1;
    q.color = color; q.alpha = alpha;
    q.topColor = topColor === undefined ? color : topColor;
    q.bottomColor = color;
    q.topAlpha = alpha; q.bottomAlpha = alpha;
    return q;
  }

  function quadPushGradient(cx, cy, z, w, h, rot, mirror,
                            topColor, bottomColor, topAlpha, bottomAlpha) {
    var q = quadPush(cx, cy, z, w, h, rot, mirror, topColor, topAlpha);
    q.topColor = topColor;
    q.bottomColor = bottomColor;
    q.topAlpha = topAlpha;
    q.bottomAlpha = bottomAlpha;
    return q;
  }

  // Depth tint is baked into the environment vertex colours. At z=-100 the
  // object is only 15 percent pulled toward its zone water colour; at z=-420
  // it is 80 percent pulled. This keeps near decor readable while letting the
  // far silhouettes disappear into the authored water rather than into a
  // full-screen alpha wash.
  function depthTint(color, z, zoneWaterColor) {
    var t = clamp(0.08 + ((-z) - 100) * (0.42 / 320), 0.08, 0.50);
    return lerpColor(color, zoneWaterColor, t);
  }

  // Sim y is down. Light falls from 1.0 at the surface to a hard 0.45 floor at
  // the seafloor, so vertex colours carry a vertical cue even though the
  // environment uses unlit materials.
  function lightAtDepth(y) {
    // Rev 6: derives from S.h rather than the old hardcoded 3600 world height,
    // so the surface-to-seafloor light falloff still spans exactly [1..0.45]
    // in the 14400x4800 world (6.4 WORLD resize).
    var h = S.h || 3600;
    return clamp(1 - (y / h) * 0.65, 0.45, 1);
  }

  function scaleColor(color, amount) {
    var r = clamp(Math.round(((color >> 16) & 255) * amount), 0, 255);
    var g = clamp(Math.round(((color >> 8) & 255) * amount), 0, 255);
    var b = clamp(Math.round((color & 255) * amount), 0, 255);
    return (r << 16) | (g << 8) | b;
  }

  function envColor(color, z, waterColor, y, lift) {
    var l = clamp(lightAtDepth(y) + (lift || 0), 0.45, 1);
    return scaleColor(depthTint(color, z, waterColor), l);
  }

  // Rev 6.9: deterministic accent pick for emissive neon tips, cycling the
  // three cyberpunk accents by a build-time seed (never Math.random/Date.now,
  // never re-rolled per frame). Used by kelp/coral tip colours only; red and
  // amber stay reserved for damage/frenzy per the visual grammar law.
  var NEON_ACCENTS = [NEON_MAGENTA, NEON_CYAN, NEON_ACID];
  function neonAccentFor(seed) {
    var i = Math.abs(Math.round(seed)) % NEON_ACCENTS.length;
    return NEON_ACCENTS[i];
  }

  World.__depthTint = depthTint;
  World.__lightAtDepth = lightAtDepth;

  // Unit quad corners, counter-clockwise from bottom-left, and the two
  // triangles that make it. Matches THREE.PlaneGeometry's UV convention so a
  // mapped batch samples its texture exactly like a single plane would.
  var QUAD_X = [-0.5, 0.5, 0.5, -0.5];
  var QUAD_Y = [-0.5, -0.5, 0.5, 0.5];
  var QUAD_U = [0, 1, 1, 0];
  var QUAD_V = [0, 0, 1, 1];
  var QUAD_IDX = [0, 1, 2, 0, 2, 3];

  function mergeQuads() {
    if (!isThree() || !quadN) return null;
    ownership();
    var n = quadN;
    var pos = new Float32Array(n * 4 * 3);
    var uv = new Float32Array(n * 4 * 2);
    var col = new Float32Array(n * 4 * 4);
    var idx = new Uint32Array(n * 6);
    for (var i = 0; i < n; i++) {
      var q = quadScratch[i];
      var cs = Math.cos(q.rot), sn = Math.sin(q.rot);
      for (var c = 0; c < 4; c++) {
        var lx = QUAD_X[c] * q.w * q.mirror;
        var ly = QUAD_Y[c] * q.h;
        var vi = (i * 4 + c);
        pos[vi * 3] = q.cx + lx * cs - ly * sn;
        pos[vi * 3 + 1] = q.cy + lx * sn + ly * cs;
        pos[vi * 3 + 2] = q.z;
        uv[vi * 2] = QUAD_U[c];
        uv[vi * 2 + 1] = QUAD_V[c];
        var cc = c >= 2 ? q.topColor : q.bottomColor;
        col[vi * 4] = ((cc >> 16) & 255) / 255;
        col[vi * 4 + 1] = ((cc >> 8) & 255) / 255;
        col[vi * 4 + 2] = (cc & 255) / 255;
        col[vi * 4 + 3] = c >= 2 ? q.topAlpha : q.bottomAlpha;
      }
      for (var t = 0; t < 6; t++) idx[i * 6 + t] = i * 4 + QUAD_IDX[t];
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
    if (typeof geo.setIndex === 'function') geo.setIndex(new THREE.BufferAttribute(idx, 1));
    envOwned.geos.push(geo);
    quadReset();
    return geo;
  }

  // A ridge is a triangle strip described by consecutive (x, topY) pairs.
  // NaN pairs break the strip, which lets one opaque batch carry the main
  // seafloor and its disconnected zone shelf ledges. Optional per-point
  // colours/bases are build-time arrays; the fixed step never sees them.
  function mergeRidge(heightline, opts) {
    if (!isThree() || !heightline || heightline.length < 4) return null;
    opts = opts || {};
    var pairN = heightline.length / 2;
    var pointN = 0;
    var p;
    for (p = 0; p < pairN; p++) {
      if (heightline[p * 2] === heightline[p * 2] && heightline[p * 2 + 1] === heightline[p * 2 + 1]) pointN++;
    }
    if (pointN < 2) return null;
    ownership();
    var pos = new Float32Array(pointN * 3 * 3);
    var col = new Float32Array(pointN * 3 * 4);
    var idx = new Uint32Array((pointN - 1) * 12);
    var topColors = opts.topColors || null;
    var midColors = opts.midColors || null;
    var bottomColors = opts.bottomColors || null;
    var topAlphas = opts.topAlphas || null;
    var midAlphas = opts.midAlphas || null;
    var bottomAlphas = opts.bottomAlphas || null;
    var point = 0, previous = -1, indexN = 0;
    for (p = 0; p < pairN; p++) {
      var x = heightline[p * 2];
      var topY = heightline[p * 2 + 1];
      if (!(x === x && topY === topY)) { previous = -1; continue; }
      var baseY = opts.baseYs && opts.baseYs[p] === opts.baseYs[p] ? opts.baseYs[p] : opts.baseY;
      var topColor = topColors && topColors[p] !== undefined ? topColors[p] : (opts.topColor === undefined ? 0xffffff : opts.topColor);
      var bottomColor = bottomColors && bottomColors[p] !== undefined ? bottomColors[p] : (opts.bottomColor === undefined ? topColor : opts.bottomColor);
      var midY = opts.midYs && opts.midYs[p] === opts.midYs[p]
        ? opts.midYs[p] : topY + (baseY - topY) * 0.32;
      var midColor = midColors && midColors[p] !== undefined ? midColors[p]
        : lerpColor(topColor, bottomColor, 0.45);
      var topAlpha = topAlphas && topAlphas[p] !== undefined ? topAlphas[p] : (opts.topAlpha === undefined ? 1 : opts.topAlpha);
      var midAlpha = midAlphas && midAlphas[p] !== undefined ? midAlphas[p]
        : (opts.midAlpha === undefined ? topAlpha : opts.midAlpha);
      var bottomAlpha = bottomAlphas && bottomAlphas[p] !== undefined ? bottomAlphas[p] : (opts.bottomAlpha === undefined ? 1 : opts.bottomAlpha);
      var tv = point * 3;
      var mv = tv + 1;
      var bv = tv + 2;
      pos[tv * 3] = x; pos[tv * 3 + 1] = topY; pos[tv * 3 + 2] = 0;
      pos[mv * 3] = x; pos[mv * 3 + 1] = midY; pos[mv * 3 + 2] = 0;
      pos[bv * 3] = x; pos[bv * 3 + 1] = baseY; pos[bv * 3 + 2] = 0;
      col[tv * 4] = ((topColor >> 16) & 255) / 255;
      col[tv * 4 + 1] = ((topColor >> 8) & 255) / 255;
      col[tv * 4 + 2] = (topColor & 255) / 255;
      col[tv * 4 + 3] = topAlpha;
      col[mv * 4] = ((midColor >> 16) & 255) / 255;
      col[mv * 4 + 1] = ((midColor >> 8) & 255) / 255;
      col[mv * 4 + 2] = (midColor & 255) / 255;
      col[mv * 4 + 3] = midAlpha;
      col[bv * 4] = ((bottomColor >> 16) & 255) / 255;
      col[bv * 4 + 1] = ((bottomColor >> 8) & 255) / 255;
      col[bv * 4 + 2] = (bottomColor & 255) / 255;
      col[bv * 4 + 3] = bottomAlpha;
      if (previous >= 0) {
        var pt = previous * 3;
        var pm = pt + 1;
        var pb = pt + 2;
        idx[indexN++] = pt;
        idx[indexN++] = pm;
        idx[indexN++] = tv;
        idx[indexN++] = pm;
        idx[indexN++] = mv;
        idx[indexN++] = pm;
        idx[indexN++] = pb;
        idx[indexN++] = bv;
        idx[indexN++] = pm;
        idx[indexN++] = bv;
        idx[indexN++] = mv;
      }
      previous = point;
      point++;
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
    if (typeof geo.setIndex === 'function') geo.setIndex(new THREE.BufferAttribute(idx, 1));
    if (typeof geo.setDrawRange === 'function') geo.setDrawRange(0, indexN);
    geo.userData = geo.userData || {};
    geo.userData.rfRidge = true;
    geo.userData.rfRidgeFacets = true;
    geo.userData.rfRidgeIndexCount = indexN;
    envOwned.geos.push(geo);
    return geo;
  }

  // Build ONE mesh from whatever is currently in the quad scratch. `map` is a
  // texture shared by every quad in the batch (or null for flat colour). The
  // material is vertex-coloured so the batch's per-quad tint and alpha survive
  // the merge; the material's own opacity stays 1 and the alpha channel of the
  // vertex colour does the work.
  // `privateMat` is for a batch whose OPACITY is animated per frame: opacity
  // lives on the material, so such a batch cannot share one. Everything static
  // takes the cached material and shares it with every other batch of the same
  // look, which is what collapses the draw calls.
  function batchMesh(map, additive, z, privateMat, flags, suppliedGeo) {
    var geo = suppliedGeo || mergeQuads();
    if (!geo) return null;
    var mat;
    if (privateMat) {
      mat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 1,
        side: THREE.DoubleSide, depthWrite: false, vertexColors: true,
      });
      if (map) { mat.map = map; if ('toneMapped' in mat) mat.toneMapped = false; }
      if (additive && THREE.AdditiveBlending !== undefined) mat.blending = THREE.AdditiveBlending;
      envOwned.mats.push(mat);
    } else {
      mat = envMaterial(0xffffff, 1, additive, map, true, flags);
    }
    if (!mat) return null;
    var mesh = new THREE.Mesh(geo, mat);
    if (z !== undefined && mesh.position) mesh.position.z = z;
    return mesh;
  }

  // ------------------------------------------------------------ zone atmo
  // applyZoneAtmo(scene, renderer, camY)
  //
  // PUBLIC, and the engine may call it directly, but it does NOT have to:
  // update() calls it every step from the camera y it already computed, so an
  // engine that only calls RF.World.update(ctx) still gets the full zone
  // transition. It is exposed because engine3d.js owns the renderer and may
  // want to drive the atmosphere on its own render cadence (for instance
  // while paused, or during a menu fly-through) without stepping the sim.
  //
  // The lerp is CONTINUOUS across a boundary, not a step: fog colour, fog
  // density and clear colour all interpolate over a BLEND band either side of
  // the boundary, so the crossing reads as water changing rather than as a
  // palette swap on one frame. The tint/fog pair and pressureTier come
  // straight from RFD.ZONES, so retuning a zone in data.js retunes the
  // atmosphere with no code change.
  // ATMO-01 / SPEC3D Rev 2: THIS MODULE IS THE SOLE ATMOSPHERE OWNER.
  // engine3d.js creates the hemisphere and directional lights ONCE at boot and
  // hands the references over (ctx.lights, or World.setLights); from then on it
  // only reads. Fog colour, fog density, renderer clear colour, hemisphere sky
  // and ground colour, hemisphere intensity and sun intensity are all written
  // here and nowhere else. The previous state had two owners running two
  // different density formulas in the same fixed step, which is the direct
  // cause of the washed-out reef frame in the review.
  //
  // ------------------------------------------------ THE FOREGROUND TUNE
  //
  // The binding requirement is that the PLAYER SHARK NEVER GRAYS OUT. The old
  // numbers failed it structurally, not by a little: FogExp2 attenuates by
  // exp(-(density * distance)^2) measured from the CAMERA, and the camera sits
  // 620 world units back from the gameplay plane (SPEC3D camera contract). So
  // the gameplay plane is never at distance 0. It is always at 620, and at the
  // old deep density of 0.00092 that is exp(-(0.57)^2) = 0.72, meaning 28
  // percent of the player's colour was already replaced by flat fog blue
  // before anything else happened. Every creature the player cares about lives
  // on that same plane and took the same hit.
  //
  // Two changes fix it, and both are needed:
  //
  //   1. DENSITY DOWN. The deep end drops from 0.00092 to 0.00046. At the
  //      620-unit gameplay plane that is exp(-(0.285)^2) = 0.92, so the
  //      foreground keeps 92 percent of its own chroma at the very bottom of
  //      the world instead of 72.
  //   2. NEAR-DISTANCE EXEMPTION. Density alone cannot separate "the plane the
  //      game happens on" from "the water behind it", because FogExp2 has no
  //      near plane. So the gameplay plane's own fog contribution is CANCELLED
  //      analytically: FOG_NEAR is the camera-to-play-plane distance, and the
  //      density actually written is scaled so that the fog fraction at
  //      FOG_NEAR stays at or below FOREGROUND_KEEP. Depth cueing is preserved
  //      exactly where it earns its keep, on the parallax decor at z = -80 to
  //      -420, which is 700 to 1040 units out and still fogs hard.
  //
  // Hemisphere/sun follow the same rule: they dim with depth, but they are
  // floored well above the old engine-side 0.35 so the lit player rig and NPC
  // rigs keep saturated form light in the abyss. A dark scene is fine; a gray
  // player is not.
  //
  // THE THREE DEPTH TUNINGS (documented per the fix brief):
  //
  //   SHALLOW (pressureTier 1, the reef shelf)
  //     density 0.00013, fog fraction at the play plane 0.7 percent.
  //     Target feel: bright turquoise, high-key, sun shafts clearly visible,
  //     decor at the far parallax band only just softened. The player reads at
  //     essentially full saturation. Hemisphere 1.15, sun 1.0.
  //
  //   MID (pressureTier ~5, the kelp and twilight band)
  //     density 0.00029, fog fraction at the play plane 3.2 percent.
  //     Target feel: the water has colour of its own and the far band is
  //     genuinely hazy, but the foreground shark and its prey still pop off it
  //     as separate saturated objects. This is the frame the review called
  //     "dark and timid"; the separation between the play plane and the far
  //     band is what fixes it. Hemisphere 0.92, sun 0.82.
  //
  //   DEEP (max pressureTier, the abyss)
  //     density 0.00046, fog fraction at the play plane 8 percent.
  //     Target feel: heavy, near-black water that swallows the parallax bands
  //     entirely, with the player and whatever is hunting it lit and coloured
  //     against it. Depth comes from the BACKGROUND going away, not from the
  //     foreground being drained. Hemisphere 0.70, sun 0.62.
  var ATMO_BLEND = 260;        // px either side of a boundary that cross-fades
  var FOG_D0 = 0.00013;        // fog density at pressureTier 1 (shallow)
  var FOG_D1 = 0.00046;        // fog density at the deepest pressureTier
  // The clear colour is sampled from the sheet, nudged toward the authored
  // tint so the darkest zone retains chroma, then given a very small fog lift.
  // The opaque sheet still owns the actual vertical ramp.
  var CLEAR_TINT_MIX = 0.30;
  var CLEAR_MIX = 0.04;
  var FOG_NEAR = 620;          // camera to gameplay plane, SPEC3D camera contract
  var FOREGROUND_KEEP = 0.92;  // minimum of its own colour the play plane keeps
  // Hemisphere and sun intensity at shallow -> deep. Floors are deliberately
  // high: the review's failure mode was a gray player, and an under-lit rig
  // grays exactly like a fogged one.
  var HEMI_I0 = 1.15, HEMI_I1 = 0.70;
  var SUN_I0 = 1.00, SUN_I1 = 0.62;
  // Hemisphere ground colour never goes fully black, or the belly of every
  // shark loses its countershading read.
  var HEMI_GROUND = 0x0a1b28;

  // Light references. Created by engine3d at boot, handed over, never created
  // here (the old two-rig double exposure is what that comment block below
  // records). Null is legal: a headless caller or a boot order where the
  // engine has not handed them over yet simply skips the light writes.
  var lightHemi = null, lightSun = null;

  // Accept the engine's lights. Idempotent, and safe to call before or after
  // init(). ctx.lights on init() is the normal path; this is the explicit one.
  World.setLights = function (lights) {
    if (!lights) { lightHemi = null; lightSun = null; return World; }
    lightHemi = lights.hemi || lights.hemisphere || null;
    lightSun = lights.sun || lights.directional || lights.dir || null;
    return World;
  };

  function zoneDensity(z) {
    var Z = zones();
    var maxTier = 1;
    for (var i = 0; i < Z.length; i++) {
      if ((Z[i].pressureTier || 1) > maxTier) maxTier = Z[i].pressureTier || 1;
    }
    var t = maxTier > 1 ? ((z.pressureTier || 1) - 1) / (maxTier - 1) : 0;
    return FOG_D0 + (FOG_D1 - FOG_D0) * t;
  }

  // Depth fraction 0 (shallow) .. 1 (deep) for one zone, used by the light lerp.
  function zoneDepthFrac(z) {
    var Z = zones();
    var maxTier = 1;
    for (var i = 0; i < Z.length; i++) {
      if ((Z[i].pressureTier || 1) > maxTier) maxTier = Z[i].pressureTier || 1;
    }
    return maxTier > 1 ? clamp(((z.pressureTier || 1) - 1) / (maxTier - 1), 0, 1) : 0;
  }

  // FOREGROUND GUARD. Clamp a density so the gameplay plane keeps at least
  // FOREGROUND_KEEP of its own colour. FogExp2 factor is exp(-(d*z)^2), so the
  // largest legal density is sqrt(-ln(KEEP)) / FOG_NEAR. This is the single
  // line that makes the "player never grays out" requirement structural rather
  // than a hope about hand-picked numbers.
  var FOG_D_MAX = Math.sqrt(-Math.log(FOREGROUND_KEEP)) / FOG_NEAR;
  function guardDensity(d) { return d > FOG_D_MAX ? FOG_D_MAX : d; }

  // Resolve the blended zone pair for a depth. Returns the blend weight and
  // writes the two zones into module scratch, so no object is allocated.
  var atmoZa = null, atmoZb = null;
  function resolveAtmo(camY) {
    var Z = zones();
    if (!Z.length) { atmoZa = atmoZb = null; return 0; }
    var idx = 0;
    for (var i = 0; i < Z.length; i++) {
      if (camY >= Z[i].yMin && camY < Z[i].yMax) { idx = i; break; }
      if (camY >= Z[Z.length - 1].yMax) idx = Z.length - 1;
    }
    var z = Z[idx];
    atmoZa = z; atmoZb = z;
    // Near the LOWER boundary, blend toward the next zone down.
    var dLo = z.yMax - camY;
    if (idx < Z.length - 1 && dLo < ATMO_BLEND) {
      atmoZb = Z[idx + 1];
      return clamp((ATMO_BLEND - dLo) / (ATMO_BLEND * 2), 0, 0.5);
    }
    // Near the UPPER boundary, blend back toward the previous zone.
    var dHi = camY - z.yMin;
    if (idx > 0 && dHi < ATMO_BLEND) {
      atmoZb = Z[idx - 1];
      return clamp((ATMO_BLEND - dHi) / (ATMO_BLEND * 2), 0, 0.5);
    }
    return 0;
  }

  // PERF-01: the report is MODULE SCRATCH, written in place, never allocated.
  // update() calls applyZoneAtmo every fixed step and discards the result, so
  // the old "allocated only when requested" claim was false in the only path
  // that mattered. Callers that keep the report across a frame boundary must
  // copy the fields they need; the selftest and the engine both read it
  // immediately, which is the documented contract.
  var atmoReport = {
    fog: 0, clear: 0, density: 0, zone: -1, blend: 0,
    hemiI: 0, sunI: 0, depth: 0, fogNearKeep: 1,
  };
  World.__atmoReport = atmoReport;

  World.applyZoneAtmo = function (scene, renderer, camY) {
    var sc = scene || S.scene;
    var t = resolveAtmo(camY);
    if (!atmoZa) return null;
    var fogA = hexNum(atmoZa.fog), fogB = hexNum(atmoZb.fog);
    var tintA = hexNum(atmoZa.tint), tintB = hexNum(atmoZb.tint);
    var fogCol = lerpColor(fogA, fogB, t);
    var tintCol = lerpColor(tintA, tintB, t);
    var dens = guardDensity(
      zoneDensity(atmoZa) + (zoneDensity(atmoZb) - zoneDensity(atmoZa)) * t);
    var depth = zoneDepthFrac(atmoZa) + (zoneDepthFrac(atmoZb) - zoneDepthFrac(atmoZa)) * t;
    // The opaque sheet is the source of truth for the vertical ramp. Clear is
    // only a fallback for a pixel outside its world+overshoot bounds, so sample
    // the sheet at the camera depth and apply a restrained fog lift.
    var clearBase = lerpColor(gradientColorAt(camY), tintCol, CLEAR_TINT_MIX);
    var clearCol = lerpColor(clearBase, fogCol,
      CLEAR_MIX * (1 - depth * 0.35));

    if (sc && S.fog) {
      if (S.fog.color && S.fog.color.setHex) S.fog.color.setHex(fogCol);
      S.fog.density = dens;
      if (sc.fog !== S.fog && typeof sc === 'object') { try { sc.fog = S.fog; } catch (e) {} }
    }
    var r = renderer || S.renderer;
    if (r && typeof r.setClearColor === 'function') {
      try {
        if (S.clearCol && S.clearCol.setHex) { S.clearCol.setHex(clearCol); r.setClearColor(S.clearCol, 1); }
        else r.setClearColor(clearCol, 1);
      } catch (e) { /* renderer not ready */ }
    }
    // Scene background, when the engine gave the scene one. Same colour as the
    // clear, so a renderer that paints background rather than clear colour
    // agrees with one that does not.
    if (sc && sc.background && sc.background.setHex) {
      try { sc.background.setHex(clearCol); } catch (e) {}
    }

    // LIGHTS. Written here and nowhere else (SPEC3D Rev 2). The hemisphere sky
    // colour tracks the zone TINT rather than the fog, so the light the player
    // is lit by stays a saturated water colour instead of collapsing onto the
    // same gray the fog is made of. That distinction is most of the difference
    // between the review's washed-out frame and a readable one.
    var hemiI = HEMI_I0 + (HEMI_I1 - HEMI_I0) * depth;
    var sunI = SUN_I0 + (SUN_I1 - SUN_I0) * depth;
    if (lightHemi) {
      if (lightHemi.color && lightHemi.color.setHex) lightHemi.color.setHex(tintCol);
      if (lightHemi.groundColor && lightHemi.groundColor.setHex) lightHemi.groundColor.setHex(HEMI_GROUND);
      lightHemi.intensity = hemiI;
    }
    if (lightSun) {
      // The sun keeps a warm white all the way down (it is the key light that
      // gives the rig its form), and only its INTENSITY falls with depth.
      if (lightSun.color && lightSun.color.setHex) {
        lightSun.color.setHex(lerpColor(0xfff4e0, 0xdff2ff, depth));
      }
      lightSun.intensity = sunI;
    }
    if (r) S.renderer = r;
    S.lastZoneId = atmoZa.id;

    atmoReport.fog = fogCol;
    atmoReport.clear = clearCol;
    atmoReport.density = dens;
    atmoReport.zone = atmoZa.id;
    atmoReport.blend = t;
    atmoReport.hemiI = hemiI;
    atmoReport.sunI = sunI;
    atmoReport.depth = depth;
    // What fraction of its own colour the gameplay plane keeps at this
    // density. The selftest asserts this never drops below FOREGROUND_KEEP,
    // which is the machine-checkable form of "the player never grays out".
    atmoReport.fogNearKeep = Math.exp(-(dens * FOG_NEAR) * (dens * FOG_NEAR));
    return atmoReport;
  };

  // ---------------------------------------------------------------- lights
  //
  // THIS LANE CREATES NO LIGHTS, AND IT IS THE ONLY LANE THAT DRIVES THEM.
  // Those two statements are not in tension, they are the whole Rev 2 ruling.
  //
  // CREATION stays with engine3d, once, at boot. This module used to add its
  // own HemisphereLight plus DirectionalLight, and the in-browser probe found
  // the result: 2x HemisphereLight and 2x DirectionalLight in one scene,
  // roughly double-exposing every lit surface in the game. Nothing built here
  // needs them anyway; every object this module owns is MeshBasicMaterial
  // (billboards, batches, rays, caustics, seams, surface, silhouettes), which
  // is unlit by definition, so the lights this lane added only ever affected
  // OTHER lanes' meshes. The selftest still asserts zero lights ADDED.
  //
  // DRIVING is now exclusively ours (ATMO-01, SPEC3D Rev 2). The engine hands
  // the two references over on ctx.lights at init, or through
  // World.setLights({hemi, sun}), and thereafter only reads them.
  // applyZoneAtmo writes their colour and intensity in the same pass that
  // writes fog and clear colour, from the same blended zone pair, so the light
  // and the water can never disagree about what depth the camera is at. The
  // second formula that used to live in engine3d.js is gone.
  //
  // If a future decor object here needs real lighting it must ask engine3d for
  // the light rather than adding a second rig.

  // ------------------------------------------------------------- god rays
  // Additive shafts hanging from the waterline, swaying about their TOP edge
  // so a rotation pivots the shaft at the surface exactly like real light.
  // The pivot is an empty Group at y = 0 with the shaft geometry offset
  // downward inside it, because a three plane rotates about its own centre.
  // PERF-03. 26 rays used to be 26 pivots, 26 meshes and 26 materials. They
  // are now RAY_BANDS merged batches. A band owns a share of the shafts, one
  // pivot Group at the waterline, one merged geometry and one shared additive
  // material, and the whole band sways and breathes together.
  //
  // That is a deliberate visual call, not only a perf one: real light shafts
  // through a moving surface do not sway independently a metre apart, they
  // move as a sheet under one swell. Four bands at four rates and four phases
  // still cross-beat, so the column never pulses as one object, but each band
  // is internally coherent, which reads more like water than the old noise
  // did. 26 draw calls become 4.
  var RAY_BANDS = 4;
  var RAYS_PER_BAND = 4;

  // Rev 6.13 ART CRITICAL 2: rays hang from the world's single waterline, so
  // they physically live in the shelf/near-surface band regardless of camera
  // depth. Art review measured the old flat 0xdff6ff base as reading pale
  // white rather than a cyberpunk accent; tinted toward the shelf's own
  // cyan/magenta identity (a light mix so the shafts still read as WATER
  // LIGHT, not a solid neon slab) gives every ray band the same authored
  // accent language as the rest of the shelf's rock/kelp/landmark props.
  var RAY_TINT = lerpColor(0xdff6ff, NEON_CYAN, 0.34);

  function buildRays() {
    if (!isThree()) return;
    var feather = rayFeatherTexture();
    for (var b = 0; b < RAY_BANDS; b++) {
      quadReset();
      // BAND ALPHA. God rays are LIGHT ACCENTS, not white slabs.
      //
      // The batching pass raised this ceiling by accident and the frame showed
      // it. Before batching, each shaft carried rr(0.06, 0.16) on its own
      // MATERIAL and the animate cycle scaled that down toward RAY_ALPHA_LO.
      // After batching the alpha moved to the VERTEX channel with the material
      // opacity pinned at 1, so the per-shaft value became the whole story,
      // and seven additive shafts merged into one band overlap and SUM where
      // they cross. High alpha times overlap is what produced pale slabs
      // across the shelf instead of shafts through water.
      //
      // Three bands stay behind the play plane. One deliberately crosses the
      // shark at z=+25, but it is the LOW-alpha band so the foreground reads
      // through the shaft instead of becoming a white slab.
      var crossPlay = b === 0;
      var bandZ = crossPlay ? 25 : rr(Z_RAY - 40, Z_RAY + 40);
      for (var i = 0; i < RAYS_PER_BAND; i++) {
        var hgt = rr(240, 440);
        // Narrower than the pre-batch 40-120: a merged band already reads as
        // a fan, so each shaft can be a shaft rather than a panel.
        var wid = rr(18, 48);
        // Shafts inside a band get their own lean, so a merged band is still a
        // fan of shafts rather than a comb of parallel bars. The lean is baked
        // into the merged vertices; the band's pivot rotation adds to it.
        var lean = rr(-0.20, 0.20);
        // Quad centre in three space. The band pivot sits at the waterline
        // (y = 0) so a rotation there swings the shaft from the surface, which
        // is what real light does; the shaft therefore hangs BELOW the pivot,
        // and its lean rotates it about its own root.
        var cx = rr(0, S.w);
        var cs = Math.cos(lean), sn = Math.sin(lean);
        // Rotate the shaft's own centre (0, -h/2) about the root before
        // placing it, so the top edge stays on the waterline at any lean.
        var ox = -(-hgt * 0.5) * sn;
        var oy = (-hgt * 0.5) * cs;
        // Per-shaft alpha varies inside the band; the vertex alpha carries it.
        // Alternating bands lean magenta instead of cyan so the fan of
        // shafts reads as an authored two-accent cyberpunk beam, not a flat
        // single-hue wash.
        var rayColor = (b & 1) ? lerpColor(0xdff6ff, NEON_MAGENTA, 0.22) : RAY_TINT;
        quadPush(cx + ox, oy, bandZ, wid, hgt, lean, 1,
          rayColor, crossPlay ? rr(0.006, 0.012) : rr(0.012, 0.028));
      }
      var mesh = batchMesh(feather, true, undefined, true);
      if (!mesh) continue;
      var pivot = new THREE.Group();
      pivot.add(mesh);
      pivot.position.y = 0;                    // the waterline
      var rot0 = rr(-0.06, 0.06);
      pivot.rotation.z = rot0;
      sceneAdd(pivot);
      S.decor.push(pivot);
      // Rotation and alpha run on two different rates with two different
      // phases, so the bands never pulse together.
      S.rays.push({
        img: mesh, pivot: pivot, rot0: rot0, z: bandZ,
        rotAmp: RAY_ROT_AMP * rr(0.6, 1.25),
        rotRate: rr(RAY_ROT_RATE[0], RAY_ROT_RATE[1]),
        rotPhase: rr(0, TAU),
        aBase: 0.55,
        aRate: rr(RAY_ALPHA_RATE[0], RAY_ALPHA_RATE[1]),
        aPhase: rr(0, TAU),
      });
    }
  }

  // ------------------------------------------------------------- caustics
  // Wide soft additive planes in the top CAUSTIC_H px. They slide horizontally
  // on a slow sine and breathe in alpha on a second, slower sine at a
  // different rate, so the two never beat into a perceivable pattern.
  function buildCaustics() {
    if (!isThree()) return;
    for (var i = 0; i < CAUSTIC_N; i++) {
      var t = CAUSTIC_N > 1 ? i / (CAUSTIC_N - 1) : 0;
      var y = 60 + t * (CAUSTIC_H - 120);
      var x0 = S.w * 0.5;
      var hgt = rr(150, 260) * (1 + t * 0.6);
      var aBase = rr(CAUSTIC_ALPHA[0], CAUSTIC_ALPHA[1]) * (1 - t * 0.45);
      // Private material: this plane's opacity breathes every frame.
      var mesh = planeMeshPrivate(S.w + CAUSTIC_DRIFT * 4, hgt,
        i === 0 ? 0xeafdff : 0xbfe9f5, aBase, true);
      if (!mesh) continue;
      setPos(mesh, x0, y, Z_CAUSTIC + i * 6);
      mesh.rotation.z = rr(-0.05, 0.05);
      sceneAdd(mesh);
      S.decor.push(mesh);
      S.caustics.push({
        img: mesh, x0: x0,
        ampX: CAUSTIC_DRIFT * rr(0.6, 1.2),
        rate: rr(CAUSTIC_RATE[0], CAUSTIC_RATE[1]),
        phase: rr(0, TAU),
        aBase: aBase,
        aAmp: aBase * 0.55,
        aRate: rr(0.05, 0.11),
        aPhase: rr(0, TAU),
      });
    }
  }

  // -------------------------------------------------------- gradient sheet
  // The water colour is world-anchored geometry, not a full-screen effect.
  // Eight RGBA quads cover the authored world plus a frustum overshoot; the
  // corner colours are sampled from the same zone transition used by fog.
  function gradientZoneTop(z) {
    return lerpColor(hexNum(z.tint), hexNum(z.fog), 0.22);
  }

  function gradientZoneBottom(z, next) {
    if (!next) return 0x020408;
    return lerpColor(hexNum(next.tint), 0x000000, 0.18);
  }

  function gradientZoneColor(z, next, simY) {
    var span = z.yMax - z.yMin;
    var u = span > 0 ? clamp((simY - z.yMin) / span, 0, 1) : 0;
    return lerpColor(gradientZoneTop(z), gradientZoneBottom(z, next), u);
  }

  // Same +-ATMO_BLEND transition as resolveAtmo(), so the authored sheet and
  // the camera fog never disagree at a zone boundary.
  function gradientColorAt(simY) {
    var Z = zones();
    if (!Z.length) return 0x020408;
    var idx = 0;
    for (var i = 0; i < Z.length; i++) {
      if (simY >= Z[i].yMin && simY < Z[i].yMax) { idx = i; break; }
      if (simY >= Z[Z.length - 1].yMax) idx = Z.length - 1;
    }
    var z = Z[idx];
    var next = idx < Z.length - 1 ? Z[idx + 1] : null;
    var c = gradientZoneColor(z, next, simY);
    var dLo = z.yMax - simY;
    if (idx < Z.length - 1 && dLo < ATMO_BLEND) {
      var cNext = gradientZoneColor(next, idx + 1 < Z.length - 1 ? Z[idx + 2] : null, simY);
      c = lerpColor(c, cNext, clamp((ATMO_BLEND - dLo) / (ATMO_BLEND * 2), 0, 0.5));
    } else {
      var dHi = simY - z.yMin;
      if (idx > 0 && dHi < ATMO_BLEND) {
        var prev = Z[idx - 1];
        var cPrev = gradientZoneColor(prev, z, simY);
        c = lerpColor(c, cPrev, clamp((ATMO_BLEND - dHi) / (ATMO_BLEND * 2), 0, 0.5));
      }
    }
    return c;
  }

  function buildGradientSheet() {
    if (!isThree()) return;
    var Z = zones();
    if (!Z.length) return;
    var bandN = Z.length * 2;
    quadReset();
    for (var b = 0; b < bandN; b++) {
      var top, bottom;
      if (b === 0) {
        top = -600;
        bottom = Z[0].yMin + (Z[0].yMax - Z[0].yMin) / 6;
      } else if (b === 1) {
        top = Z[0].yMin + (Z[0].yMax - Z[0].yMin) / 6;
        bottom = Z[0].yMax;
      } else {
        var zi = Math.floor(b / 2);
        if (b % 2 === 0) {
          top = Z[zi - 1].yMax;
          bottom = Z[zi].yMin + (Z[zi].yMax - Z[zi].yMin) * 0.5;
        } else {
          top = Z[zi].yMin + (Z[zi].yMax - Z[zi].yMin) * 0.5;
          // Rev 6: was a hardcoded 4200 (600px past the old h=3600 seafloor).
          // Derives from S.h now so the sheet still overshoots the seafloor by
          // the same 600px margin in the grown 14400x4800 world.
          bottom = zi === Z.length - 1 ? S.h + 600 : Z[zi].yMax;
        }
      }
      quadPushGradient(S.w * 0.5, -(top + bottom) * 0.5, 0,
        S.w + 800, bottom - top, 0, 1,
        gradientColorAt(top), gradientColorAt(bottom), 1, 1);
    }
    var mesh = batchMesh(null, false, Z_GRADIENT, false, { fog: false, opaque: true });
    if (!mesh) return;
    sceneAdd(mesh);
    S.decor.push(mesh);
    S.gradient = { mesh: mesh, geometry: mesh.geometry, material: mesh.material };
  }

  // -------------------------------------------------------------- terrain
  // One reusable line scratch describes each ridge at build time. A NaN pair
  // breaks the strip, allowing the same geometry batch to carry shelf ledges
  // at their own local base depth without adding draw calls.
  var ridgeLineScratch = [];
  var ridgeBaseScratch = [];
  var ridgeMidScratch = [];
  var ridgeTopColorScratch = [];
  var ridgeMidColorScratch = [];
  var ridgeBottomColorScratch = [];
  var ridgeTopAlphaScratch = [];
  var ridgeMidAlphaScratch = [];
  var ridgeBottomAlphaScratch = [];
  var ridgePointN = 0;
  var TERRAIN_BASE_INSET = 18;
  var TERRAIN_TOP_MIN_HEIGHT = 42;
  var TERRAIN_TOP_MAX_HEIGHT = 180;
  var TERRAIN_TOPS = [3506, 3492, 3478];
  var TERRAIN_WAVES = [28, 42, 56];
  var CROWN_MIN_HEIGHT = 24;
  var CROWN_MAX_HEIGHT = 68;

  function ridgeReset() { ridgePointN = 0; }
  function ridgeBreak() {
    ridgeLineScratch[ridgePointN * 2] = NaN;
    ridgeLineScratch[ridgePointN * 2 + 1] = NaN;
    ridgeBaseScratch[ridgePointN] = NaN;
    ridgeMidScratch[ridgePointN] = NaN;
    ridgeTopColorScratch[ridgePointN] = 0;
    ridgeMidColorScratch[ridgePointN] = 0;
    ridgeBottomColorScratch[ridgePointN] = 0;
    ridgeTopAlphaScratch[ridgePointN] = 0;
    ridgeMidAlphaScratch[ridgePointN] = 0;
    ridgeBottomAlphaScratch[ridgePointN] = 0;
    ridgePointN++;
  }
  function terrainZone(simY) {
    var Z = zones();
    if (!Z.length) return null;
    for (var i = 0; i < Z.length; i++) {
      if (simY >= Z[i].yMin && simY < Z[i].yMax) return Z[i];
    }
    return simY < Z[0].yMin ? Z[0] : Z[Z.length - 1];
  }
  function ridgePush(x, simTop, simBase, mix, occluder, depthIndex) {
    var z = terrainZone(simTop);
    var water = z ? hexNum(z.tint) : 0x071522;
    var rock = depthIndex <= 0 ? 0x29434a : depthIndex === 1 ? 0x1c343d : 0x10242d;
    // Rev 6 fix: the foreground crown used to be pure 0x020408 (near-black)
    // regardless of zone, which read as a flat black band clashing with the
    // now-lit near-rock. It is retinted to a zone-fogged deep-blue silhouette
    // (a dark lerp of the zone water colour, never pure black) so distant/
    // near-foreground layers read as depth rather than voids.
    var deepBlueSil = lerpColor(0x0a1622, water, 0.22);
    var topColor = occluder ? deepBlueSil : lerpColor(rock, water, mix * 0.35);
    var midColor = occluder ? scaleColor(deepBlueSil, 0.72) : lerpColor(rock, 0x07141d, 0.38 + Math.max(0, depthIndex || 0) * 0.06);
    var bottomColor = occluder ? scaleColor(deepBlueSil, 0.5) : lerpColor(0x0a1622, water, 0.12);
    ridgeLineScratch[ridgePointN * 2] = x;
    ridgeLineScratch[ridgePointN * 2 + 1] = -simTop;
    ridgeBaseScratch[ridgePointN] = -simBase;
    ridgeMidScratch[ridgePointN] = -(simTop + (simBase - simTop) * 0.32);
    ridgeTopColorScratch[ridgePointN] = topColor;
    ridgeMidColorScratch[ridgePointN] = midColor;
    ridgeBottomColorScratch[ridgePointN] = bottomColor;
    ridgeTopAlphaScratch[ridgePointN] = occluder ? 0.98 : 0.94;
    ridgeMidAlphaScratch[ridgePointN] = occluder ? 0.99 : 0.97;
    ridgeBottomAlphaScratch[ridgePointN] = 1;
    ridgePointN++;
  }

  function buildTerrain() {
    if (!isThree()) return;
    var Z = zones();
    var mixes = [0.40, 0.22, 0.10];
    var points = 40;
    var width = S.w + 800;
    var terrainBase = S.h - TERRAIN_BASE_INSET;
    for (var layer = 0; layer < 3; layer++) {
      ridgeReset();
      for (var p = 0; p < points; p++) {
        var x = -400 + width * p / (points - 1);
        var wave = Math.sin(p * 1.73 + layer * 1.9) * TERRAIN_WAVES[layer] +
          Math.sin(p * 0.41 + layer * 0.7) * TERRAIN_WAVES[layer] * 0.35;
        // Rev 6 (6.4): fold in a small extra term keyed to the nearest maze
        // cavern's own noise seed, so the far parallax ridge silhouette
        // echoes the playable cavern layout instead of being fully
        // independent of it. Kept low-amplitude; the clamp below still owns
        // the authored min/max band, so this can only nudge, never break it.
        wave += mazeEchoWave(x, layer) * TERRAIN_WAVES[layer] * 0.18;
        var top = clamp(TERRAIN_TOPS[layer] + wave,
          terrainBase - TERRAIN_TOP_MAX_HEIGHT, terrainBase - TERRAIN_TOP_MIN_HEIGHT);
        ridgePush(x, top, terrainBase, mixes[layer], false, layer);
      }
      // Staggered, per-zone ledges make each depth shelf readable while
      // remaining inside the same ridge draw.
      for (var zi = 0; zi < Z.length - 1; zi++) {
        var shelf = Z[zi];
        var sx0 = -300 + width * zi / Z.length;
        var sx1 = sx0 + width / Z.length - 100;
        ridgeBreak();
        for (var sp = 0; sp < 5; sp++) {
          var sx = sx0 + (sx1 - sx0) * sp / 4;
          var sy = shelf.yMax - 75 - layer * 18 + Math.sin(sp * 1.7 + zi) * 14;
          ridgePush(sx, sy, shelf.yMax + 55 + layer * 12, mixes[layer], false, layer);
        }
      }
      var geo = mergeRidge(ridgeLineScratch, {
        baseY: -S.h,
        baseYs: ridgeBaseScratch,
        midYs: ridgeMidScratch,
        topColors: ridgeTopColorScratch,
        midColors: ridgeMidColorScratch,
        bottomColors: ridgeBottomColorScratch,
        topAlphas: ridgeTopAlphaScratch,
        midAlphas: ridgeMidAlphaScratch,
        bottomAlphas: ridgeBottomAlphaScratch,
      });
      var mesh = batchMesh(null, false, Z_TERRAIN[layer], false,
        { fog: false, opaque: true }, geo);
      if (!mesh) continue;
      mesh.userData = mesh.userData || {};
      mesh.userData.rfTerrainLayer = layer;
      mesh.userData.rfTerrainBaseSim = terrainBase;
      mesh.userData.rfTerrainTopMinHeight = TERRAIN_TOP_MIN_HEIGHT;
      mesh.userData.rfTerrainTopMaxHeight = TERRAIN_TOP_MAX_HEIGHT;
      sceneAdd(mesh);
      S.decor.push(mesh);
      S.terrain.push({ mesh: mesh, layer: layer, occluder: false });
    }

    // A sparse, almost-black crown strip sits in front of the gameplay plane.
    // It is deliberately only a bottom fringe, never a foreground wall.
    ridgeReset();
    var crownN = 18;
    for (var cp = 0; cp < crownN; cp++) {
      var cx = -400 + width * cp / (crownN - 1);
      var crown = terrainBase - 46 + Math.sin(cp * 2.17) * 20 + Math.sin(cp * 0.51) * 8;
      ridgePush(cx, clamp(crown, terrainBase - CROWN_MAX_HEIGHT, terrainBase - CROWN_MIN_HEIGHT), terrainBase, 0, true, 3);
    }
    var crownGeo = mergeRidge(ridgeLineScratch, {
      baseY: -S.h,
      baseYs: ridgeBaseScratch,
      midYs: ridgeMidScratch,
      topColors: ridgeTopColorScratch,
      midColors: ridgeMidColorScratch,
      bottomColors: ridgeBottomColorScratch,
      topAlphas: ridgeTopAlphaScratch,
      midAlphas: ridgeMidAlphaScratch,
      bottomAlphas: ridgeBottomAlphaScratch,
    });
    var crownMesh = batchMesh(null, false, Z_TERRAIN[3], false,
      { fog: false, opaque: true }, crownGeo);
    if (crownMesh) {
      crownMesh.userData = crownMesh.userData || {};
      crownMesh.userData.rfTerrainLayer = 3;
      crownMesh.userData.rfTerrainBaseSim = terrainBase;
      crownMesh.userData.rfTerrainCrownMinHeight = CROWN_MIN_HEIGHT;
      crownMesh.userData.rfTerrainCrownMaxHeight = CROWN_MAX_HEIGHT;
      sceneAdd(crownMesh);
      S.decor.push(crownMesh);
      S.terrain.push({ mesh: crownMesh, layer: 3, occluder: true });
    }
  }

  // ============================================================ 6.4 SDF maze
  //
  // Build-time cavern graph, rasterised into a signed-distance grid. This is
  // the ONLY per-cell write path in the module: after buildMaze() runs once
  // in init(), terrainSDF/resolveBody/regionAt are pure reads.
  //
  // Layout, deterministic from S.rng:
  //   - Each 1200px zone band gets 4-6 "caverns" (open circles/blobs, 900-1600
  //     px wide) spaced along x.
  //   - Adjacent caverns in a band are linked by a lateral tunnel (half-width
  //     130-190px).
  //   - Each band boundary gets 2-3 vertical shafts connecting the band above
  //     to the band below, so the whole graph is one connected component.
  //   - Every cavern/tunnel wall gets a value-noise wobble so the SDF has an
  //     organic edge rather than a stack of perfect circles.
  //   - y < SDF_OPEN_Y (open water near the surface) is carved to water
  //     unconditionally, so nothing is ever solid near the spawn/breach band.
  //
  // The grid stores SIGNED distance to the nearest rock/water boundary,
  // positive = water, in the same units as world (x,y): terrainSDF(x,y)
  // bilinearly interpolates the 4 surrounding cell corners.
  var mazeCavernX = [];
  var mazeCavernY = [];
  var mazeCavernR = [];
  var mazeCavernSeed = [];       // per-cavern noise seed, for echoing ridges
  var mazeTunnels = [];          // {x0,y0,x1,y1,halfW}
  var mazeShafts = [];           // {x,y0,y1,halfW}

  // Cheap deterministic value-noise: a small fixed table of per-seed phase
  // offsets summed as sine octaves. No Math.random; every draw is S.rng at
  // build time only, then frozen into these tables for the lifetime of init.
  function valueNoise(theta, seedPhase, octaves) {
    var v = 0, amp = 1, freq = 1, total = 0;
    for (var i = 0; i < octaves; i++) {
      v += Math.sin(theta * freq * (i + 1.7) + seedPhase * (i + 1)) * amp;
      total += amp;
      amp *= 0.55;
      freq *= 1.9;
    }
    return total > 0 ? v / total : 0;
  }

  function buildMazeLayout() {
    mazeCavernX.length = 0; mazeCavernY.length = 0; mazeCavernR.length = 0;
    mazeCavernSeed.length = 0;
    mazeTunnels.length = 0;
    mazeShafts.length = 0;
    var Z = zones();
    if (!Z.length) return;
    var bandFirst = [];
    var bandLast = [];
    for (var zi = 0; zi < Z.length; zi++) {
      var z = Z[zi];
      var n = ri(MAZE_CAVERNS_MIN, MAZE_CAVERNS_MAX);
      var first = mazeCavernX.length;
      var midY = (z.yMin + z.yMax) * 0.5;
      // Never place a cavern centre above the open-water line; the shallow
      // band's caverns sit in its lower half so the surface stays clear.
      var yLo = Math.max(z.yMin + 260, SDF_OPEN_Y + 260);
      var yHi = z.yMax - 200;
      if (yHi < yLo) yHi = yLo + 1;
      var slot = S.w / n;
      for (var i = 0; i < n; i++) {
        var cx = clamp(slot * i + slot * 0.5 + rr(-slot * 0.28, slot * 0.28), 300, S.w - 300);
        var cy = clamp(midY + rr(-1, 1) * (z.yMax - z.yMin) * 0.22, yLo, yHi);
        var w = rr(MAZE_CAVERN_W[0], MAZE_CAVERN_W[1]);
        mazeCavernX.push(cx);
        mazeCavernY.push(cy);
        mazeCavernR.push(w * 0.5);
        mazeCavernSeed.push(rr(0, TAU));
      }
      var last = mazeCavernX.length - 1;
      bandFirst.push(first);
      bandLast.push(last);
      // Lateral tunnels link consecutive caverns within this band.
      for (i = first; i < last; i++) {
        mazeTunnels.push({
          x0: mazeCavernX[i], y0: mazeCavernY[i],
          x1: mazeCavernX[i + 1], y1: mazeCavernY[i + 1],
          halfW: rr(MAZE_TUNNEL_HALF[0], MAZE_TUNNEL_HALF[1]),
        });
      }
    }
    // Vertical shafts at each band boundary, connecting a cavern in the band
    // above to one in the band below so the flood fill is one region.
    for (zi = 0; zi < Z.length - 1; zi++) {
      var shaftN = ri(MAZE_SHAFTS_PER_BOUNDARY[0], MAZE_SHAFTS_PER_BOUNDARY[1]);
      var aboveFirst = bandFirst[zi], aboveLast = bandLast[zi];
      var belowFirst = bandFirst[zi + 1], belowLast = bandLast[zi + 1];
      for (var s = 0; s < shaftN; s++) {
        var ai = ri(aboveFirst, aboveLast);
        var bi = ri(belowFirst, belowLast);
        var sx = (mazeCavernX[ai] + mazeCavernX[bi]) * 0.5 + rr(-200, 200);
        mazeShafts.push({
          x: clamp(sx, 200, S.w - 200),
          y0: mazeCavernY[ai], y1: mazeCavernY[bi],
          halfW: rr(MAZE_TUNNEL_HALF[0], MAZE_TUNNEL_HALF[1]),
        });
      }
    }
  }

  // Nearest-cavern echo term for the background ridge waves (6.4 "distant
  // ridges echo it"). Returns a value in roughly [-1, 1]: the sine of the
  // nearest cavern's own noise seed, offset by the x-distance so the term
  // still varies smoothly along the ridge rather than stepping at cavern
  // boundaries. Build-time only, called from buildTerrain's point loop.
  function mazeEchoWave(x, layer) {
    if (!mazeCavernX.length) return 0;
    var best = -1, bestD = 1e18;
    for (var i = 0; i < mazeCavernX.length; i++) {
      var d = Math.abs(mazeCavernX[i] - x);
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best < 0) return 0;
    return Math.sin(mazeCavernSeed[best] + layer * 0.5 + bestD * 0.0025);
  }

  // Raw (pre-open-water-carve) signed distance at one point: positive water,
  // negative rock. Union of every cavern/tunnel/shaft "water" primitive minus
  // nothing (rock is simply the complement, there is no separate rock solid).
  function mazeRawSDF(x, y) {
    var best = -1e9; // start deep in rock; every water primitive raises this
    var i;
    for (i = 0; i < mazeCavernX.length; i++) {
      var dx = x - mazeCavernX[i], dy = y - mazeCavernY[i];
      var d = Math.sqrt(dx * dx + dy * dy);
      var theta = Math.atan2(dy, dx);
      var wobble = valueNoise(theta, mazeCavernSeed[i], MAZE_EDGE_NOISE_N) * MAZE_EDGE_NOISE_AMP;
      var sd = (mazeCavernR[i] + wobble) - d;
      if (sd > best) best = sd;
    }
    for (i = 0; i < mazeTunnels.length; i++) {
      var t = mazeTunnels[i];
      var vx = t.x1 - t.x0, vy = t.y1 - t.y0;
      var len2 = vx * vx + vy * vy || 1;
      var u = clamp(((x - t.x0) * vx + (y - t.y0) * vy) / len2, 0, 1);
      var px = t.x0 + vx * u, py = t.y0 + vy * u;
      var ddx = x - px, ddy = y - py;
      var dist = Math.sqrt(ddx * ddx + ddy * ddy);
      var edgeWobble = valueNoise(u * TAU * 3, i * 1.7, 3) * (MAZE_EDGE_NOISE_AMP * 0.4);
      var tsd = (t.halfW + edgeWobble) - dist;
      if (tsd > best) best = tsd;
    }
    for (i = 0; i < mazeShafts.length; i++) {
      var sh = mazeShafts[i];
      var yLo = Math.min(sh.y0, sh.y1), yHi = Math.max(sh.y0, sh.y1);
      var syd = y < yLo ? yLo - y : (y > yHi ? y - yHi : 0);
      var sxd = Math.abs(x - sh.x);
      var sdist = Math.sqrt(sxd * sxd + syd * syd);
      var shaftWobble = valueNoise((y - yLo) * 0.01, i * 2.3, 3) * (MAZE_EDGE_NOISE_AMP * 0.3);
      var shsd = (sh.halfW + shaftWobble) - sdist;
      if (shsd > best) best = shsd;
    }
    return best;
  }

  // Rasterise the maze into the grid: Float32Array SDF plus Uint8 region ids
  // via flood fill. Grid is (cols+1) x (rows+1) corner samples so bilinear
  // lookups never read past an edge; world edges are rock (6.4: "World edges
  // are rock"), enforced by clamping every sample point into [0, S.w]x[0,S.h]
  // one SDF_CELL short of the true edge, so the outermost ring reads negative.
  function buildSDFGrid() {
    var cols = Math.ceil(S.w / SDF_CELL) + 1;
    var rows = Math.ceil(S.h / SDF_CELL) + 1;
    S.sdfCols = cols; S.sdfRows = rows;
    var sdf = new Float32Array(cols * rows);
    for (var ry = 0; ry < rows; ry++) {
      var y = ry * SDF_CELL;
      for (var rx = 0; rx < cols; rx++) {
        var x = rx * SDF_CELL;
        var v;
        if (y < SDF_OPEN_Y) {
          // Open water band: always water, distance grows with depth margin.
          v = SDF_OPEN_Y - y + 200;
        } else {
          v = mazeRawSDF(x, y);
        }
        // World-edge rock: within one cell of x/y bounds, cap the distance so
        // it reads negative just past the true edge.
        var edgeDist = Math.min(x, S.w - x, y, S.h - y);
        if (edgeDist < SDF_CELL) {
          var edgeSd = edgeDist - SDF_CELL * 0.5;
          if (edgeSd < v) v = edgeSd;
        }
        sdf[ry * cols + rx] = v;
      }
    }
    S.sdf = sdf;

    // Flood fill over corner samples whose SDF > 0 (walkable), 4-connected.
    var region = new Uint8Array(cols * rows);
    var nextRegion = 1;
    var stack = floodStackScratch;
    for (ry = 0; ry < rows; ry++) {
      for (rx = 0; rx < cols; rx++) {
        var idx0 = ry * cols + rx;
        if (region[idx0] !== 0 || sdf[idx0] <= 0) continue;
        stack.length = 0;
        stack.push(idx0);
        region[idx0] = nextRegion;
        while (stack.length) {
          var idx = stack.pop();
          var cx2 = idx % cols, cy2 = (idx / cols) | 0;
          var neigh = [cx2 - 1, cy2, cx2 + 1, cy2, cx2, cy2 - 1, cx2, cy2 + 1];
          for (var ni = 0; ni < 4; ni++) {
            var nx = neigh[ni * 2], ny = neigh[ni * 2 + 1];
            if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
            var nIdx = ny * cols + nx;
            if (region[nIdx] !== 0 || sdf[nIdx] <= 0) continue;
            region[nIdx] = nextRegion;
            stack.push(nIdx);
          }
        }
        nextRegion++;
      }
    }
    S.sdfRegion = region;
    S.sdfRegionN = nextRegion - 1;
  }
  var floodStackScratch = [];

  // Rev 6.11 MAZE REACHABILITY: body-radius-aware BFS over the SDF grid's own
  // corner samples, 4-connected, walkable only where sdf > clearance (not
  // merely > 0). Returns {ok, bandReach[], reachableN} where bandReach[i] is
  // true iff zone band i has at least one clearance-walkable cell in the same
  // BFS component as the given start point. This is the same coarse
  // resolution the spawn/region system already uses, so it costs one BFS
  // walk, not a second full raster pass.
  var bfsClearanceStack = [];
  function bfsBandReachability(clearance, startX, startY) {
    var cols = S.sdfCols, rows = S.sdfRows;
    var Z = zones();
    var bandReach = new Array(Z.length);
    for (var bz = 0; bz < Z.length; bz++) bandReach[bz] = false;
    if (!S.sdf || !cols || !rows) return { ok: false, bandReach: bandReach, reachableN: 0 };
    var sx = clamp(Math.round(startX / SDF_CELL), 0, cols - 1);
    var sy = clamp(Math.round(startY / SDF_CELL), 0, rows - 1);
    var startIdx = sy * cols + sx;
    var visited = new Uint8Array(cols * rows);
    if (S.sdf[startIdx] <= clearance) {
      // Start point itself is not clearance-walkable (should not happen for
      // a real player position); nudge to the nearest clearance-walkable
      // corner in a small local search so the test still measures the maze's
      // own connectivity rather than failing on the probe point.
      var bestIdx = -1, bestD = 1e18;
      for (var ry = 0; ry < rows; ry++) {
        for (var rx = 0; rx < cols; rx++) {
          var idx2 = ry * cols + rx;
          if (S.sdf[idx2] <= clearance) continue;
          var dxp = rx - sx, dyp = ry - sy;
          var d2p = dxp * dxp + dyp * dyp;
          if (d2p < bestD) { bestD = d2p; bestIdx = idx2; }
        }
      }
      if (bestIdx < 0) return { ok: false, bandReach: bandReach, reachableN: 0 };
      startIdx = bestIdx;
    }
    var stack = bfsClearanceStack;
    stack.length = 0;
    stack.push(startIdx);
    visited[startIdx] = 1;
    while (stack.length) {
      var idx = stack.pop();
      var cx = idx % cols, cy = (idx / cols) | 0;
      var neigh = [cx - 1, cy, cx + 1, cy, cx, cy - 1, cx, cy + 1];
      for (var ni = 0; ni < 4; ni++) {
        var nx = neigh[ni * 2], ny = neigh[ni * 2 + 1];
        if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
        var nIdx = ny * cols + nx;
        if (visited[nIdx] || S.sdf[nIdx] <= clearance) continue;
        visited[nIdx] = 1;
        stack.push(nIdx);
      }
    }
    var reachableN = 0;
    for (var bandI = 0; bandI < Z.length; bandI++) {
      var zoneRow = Z[bandI];
      var midY = (zoneRow.yMin + zoneRow.yMax) * 0.5;
      var found = false;
      for (var bx = 100; bx < S.w && !found; bx += SDF_CELL) {
        var bcx = clamp(Math.round(bx / SDF_CELL), 0, cols - 1);
        var bcy = clamp(Math.round(midY / SDF_CELL), 0, rows - 1);
        var bIdx = bcy * cols + bcx;
        if (visited[bIdx] && S.sdf[bIdx] > clearance) found = true;
      }
      bandReach[bandI] = found;
      if (found) reachableN++;
    }
    return { ok: reachableN === Z.length, bandReach: bandReach, reachableN: reachableN };
  }

  // Rev 6.11 MAZE REACHABILITY: if the body-radius-aware BFS fails for the
  // shipped seed at the standard tunnel/shaft half-widths, widen every
  // tunnel and shaft IN PLACE (same centreline, same noise seed, so the
  // cavern graph and its RNG draw count are untouched) and rebuild only the
  // SDF grid, repeating deterministically until it passes or the cap is hit.
  // No new S.rng draws happen here, so downstream spawn/decor sampling is
  // unaffected by whether a widen pass ran.
  var MAZE_CLEARANCE = 98 + 24; // tier-12 body radius + SDF_SPAWN_CLEAR
  var MAZE_WIDEN_STEP = 20;
  var MAZE_WIDEN_MAX_TRIES = 6;
  function widenTunnelsForReachability(startX, startY) {
    for (var attempt = 0; attempt < MAZE_WIDEN_MAX_TRIES; attempt++) {
      var res = bfsBandReachability(MAZE_CLEARANCE, startX, startY);
      if (res.ok) return res;
      for (var i = 0; i < mazeTunnels.length; i++) mazeTunnels[i].halfW += MAZE_WIDEN_STEP;
      for (var j = 0; j < mazeShafts.length; j++) mazeShafts[j].halfW += MAZE_WIDEN_STEP;
      buildSDFGrid();
    }
    return bfsBandReachability(MAZE_CLEARANCE, startX, startY);
  }

  function buildMaze() {
    buildMazeLayout();
    buildSDFGrid();
    // Rev 6.11: verify body-radius-aware reachability for the shipped seed
    // right after generation, widening deterministically (no rng draws) if
    // the initial widths do not clear a tier-12 body from an open-water
    // start point. This runs once per World.init(), not per frame.
    widenTunnelsForReachability(S.w * 0.5, SDF_OPEN_Y * 0.5);
  }

  // terrainSDF(x,y) -> signed px, positive = water. Bilinear over the corner
  // grid; out-of-bounds samples clamp to the nearest edge cell (still correct
  // because the edge ring itself already reads negative, per world-edge rock).
  World.terrainSDF = function (x, y) {
    if (!S.sdf) return 1e9;
    // Robustness (6.11 code review): a NaN/Infinity coordinate (malformed
    // debug teleport, bad entity data from another lane) must never
    // propagate into the bilinear result. Reporting a huge WATER distance
    // (never rock) means a caller that only checks "sdf > need" behaves as
    // if nothing is nearby, rather than computing garbage or getting stuck.
    if (!(isFinite(x) && isFinite(y))) return 1e9;
    var cols = S.sdfCols, rows = S.sdfRows;
    var fx = clamp(x / SDF_CELL, 0, cols - 1.0001);
    var fy = clamp(y / SDF_CELL, 0, rows - 1.0001);
    var x0 = fx | 0, y0 = fy | 0;
    var x1 = x0 + 1 < cols ? x0 + 1 : x0;
    var y1 = y0 + 1 < rows ? y0 + 1 : y0;
    var tx = fx - x0, ty = fy - y0;
    var s00 = S.sdf[y0 * cols + x0];
    var s10 = S.sdf[y0 * cols + x1];
    var s01 = S.sdf[y1 * cols + x0];
    var s11 = S.sdf[y1 * cols + x1];
    var top = s00 + (s10 - s00) * tx;
    var bot = s01 + (s11 - s01) * tx;
    return top + (bot - top) * ty;
  };

  // regionAt(x,y) -> flood-fill region id, 0 if inside rock (no walkable
  // region owns that cell). Nearest-sample, not bilinear: a region id has no
  // meaningful interpolation.
  World.regionAt = function (x, y) {
    if (!S.sdfRegion) return 0;
    var cols = S.sdfCols, rows = S.sdfRows;
    var cx = clamp(Math.round(x / SDF_CELL), 0, cols - 1);
    var cy = clamp(Math.round(y / SDF_CELL), 0, rows - 1);
    return S.sdfRegion[cy * cols + cx];
  };

  // resolveBody(body, r): push the body out of rock along the SDF gradient,
  // and remove the velocity component along that same normal so contact is a
  // SLIDE, never a bounce/snag (6.4). body carries at least x, y, vx, vy.
  // Finite-difference gradient: cheap, allocation-free, exact enough at
  // SDF_CELL resolution for a push-out this small.
  //
  // The union-of-primitives SDF is not an exact Euclidean distance field far
  // from a boundary (it is exact only right at the zero crossing), so a
  // single linear step along one gradient sample can undershoot when a body
  // is deep inside rock. In real play this never happens: every mover is
  // resolved every frame, so a body is at most one frame's travel past the
  // surface, well inside the region where one gradient step is exact. The
  // small iteration cap below is a defensive correctness net (e.g. a body
  // spawned or teleported deep in rock by another lane), not a per-frame
  // cost: it exits on the first pass whenever the sample is already clear.
  var GRAD_EPS = 6;
  var RESOLVE_ITER_MAX = 4;
  // Cardinal probe distance for the flat-gradient fallback below: wide enough
  // to clear the finite-difference epsilon and reliably find open water one
  // or two SDF cells away without a second full raster walk.
  var FLAT_NUDGE_STEP = SDF_CELL * 1.5;
  World.resolveBody = function (body, r) {
    if (!body || !S.sdf) return;
    // Robustness (6.11 code review): guard non-finite inputs before doing any
    // math with them. A NaN/Infinity body position is a no-op here (nothing
    // useful to push out of; the caller's own position is already broken),
    // rather than propagating NaN into body.x/body.y and permanently wedging
    // the mover.
    if (!(isFinite(body.x) && isFinite(body.y) && isFinite(r))) return;
    var need = r + 2; // small margin so the body does not sit exactly on sdf=r
    var moved = false;
    for (var iter = 0; iter < RESOLVE_ITER_MAX; iter++) {
      var d = World.terrainSDF(body.x, body.y);
      if (d >= need) break;
      var dxp = World.terrainSDF(body.x + GRAD_EPS, body.y);
      var dxm = World.terrainSDF(body.x - GRAD_EPS, body.y);
      var dyp = World.terrainSDF(body.x, body.y + GRAD_EPS);
      var dym = World.terrainSDF(body.x, body.y - GRAD_EPS);
      var gx = (dxp - dxm) / (2 * GRAD_EPS);
      var gy = (dyp - dym) / (2 * GRAD_EPS);
      var glen = Math.sqrt(gx * gx + gy * gy);
      if (!(glen > 1e-6)) {
        // Flat-gradient fallback (6.11 code review): the finite-difference
        // gradient is degenerate right at this sample (e.g. deep inside a
        // uniform rock fill, or exactly on a symmetric ridge), so there is no
        // direction to push along. Rather than break out and leave the body
        // embedded, sample the four cardinal directions directly at a wider
        // step and nudge toward whichever is most clearly water. This always
        // makes progress when ANY nearby direction is open, and the ordinary
        // gradient path resumes next iteration/frame once off the flat spot.
        var cxp = World.terrainSDF(body.x + FLAT_NUDGE_STEP, body.y);
        var cxm = World.terrainSDF(body.x - FLAT_NUDGE_STEP, body.y);
        var cyp = World.terrainSDF(body.x, body.y + FLAT_NUDGE_STEP);
        var cym = World.terrainSDF(body.x, body.y - FLAT_NUDGE_STEP);
        var bestV = cxp, bestX = FLAT_NUDGE_STEP, bestY = 0;
        if (cxm > bestV) { bestV = cxm; bestX = -FLAT_NUDGE_STEP; bestY = 0; }
        if (cyp > bestV) { bestV = cyp; bestX = 0; bestY = FLAT_NUDGE_STEP; }
        if (cym > bestV) { bestV = cym; bestX = 0; bestY = -FLAT_NUDGE_STEP; }
        if (!(bestV > d)) break; // every cardinal sample is no better: give up cleanly
        body.x += bestX;
        body.y += bestY;
        moved = true;
        continue;
      }
      var push = need - d;
      body.x += (gx / glen) * push;
      body.y += (gy / glen) * push;
      moved = true;
    }
    if (!moved) return;
    // Remove the velocity component along the (outward, into-water) normal
    // when it points INTO the wall, so the tangential component survives and
    // the body slides along the surface instead of stopping or bouncing.
    // Re-sampled AT THE FINAL position (not the last loop iteration's stale
    // sample): after several push iterations the body may have crossed into
    // a differently-oriented wall segment, and clearing against a stale
    // normal can leave a residual into-wall component.
    if (typeof body.vx === 'number' && typeof body.vy === 'number') {
      var fxp = World.terrainSDF(body.x + GRAD_EPS, body.y);
      var fxm = World.terrainSDF(body.x - GRAD_EPS, body.y);
      var fyp = World.terrainSDF(body.x, body.y + GRAD_EPS);
      var fym = World.terrainSDF(body.x, body.y - GRAD_EPS);
      var fgx = (fxp - fxm) / (2 * GRAD_EPS);
      var fgy = (fyp - fym) / (2 * GRAD_EPS);
      var flen = Math.sqrt(fgx * fgx + fgy * fgy);
      if (flen > 1e-6) {
        var fnx = fgx / flen, fny = fgy / flen;
        var vn = body.vx * (-fnx) + body.vy * (-fny);
        if (vn > 0) {
          body.vx -= (-fnx) * vn;
          body.vy -= (-fny) * vn;
        }
      }
    }
  };

  // --------------------------------------------------- near-rock render (6.4)
  //
  // Marching squares over the SDF corner grid, chunked into ~ROCK_CHUNK_W
  // column batches. Each chunk is a single MeshLambertMaterial mesh so it is
  // lit by the existing hemi/sun rig, with a front cap at z=+55 extruded to
  // z=-130 and AO baked into vertex colour from -sdf depth. Build-time only;
  // nothing here runs per frame.
  //
  // Every cell whose 4 corners are not all-water/all-rock straddles the
  // boundary. Rather than a full marching-squares case table (16 configs,
  // several ambiguous), each of the cell's 4 edges is walked directly: any
  // edge whose two corner signs differ contributes one zero-crossing point,
  // and their centroid places one small front-cap quad for that cell. At
  // SDF_CELL (64px) resolution this reproduces the same silhouette a full
  // case table would, without the ambiguous-case bookkeeping.
  function rockChunkAO(sdfDepth) {
    // -sdf depth into rock (0 at the boundary, growing negative-ward) maps to
    // a darkening AO factor, floored so nothing goes fully black.
    var depth = clamp(-sdfDepth, 0, ROCK_AO_MAX) / ROCK_AO_MAX;
    return 1 - depth * 0.62;
  }

  // Raw per-chunk geometry scratch. quadPush/mergeQuads only emit planar XY
  // quads at one shared z, which cannot express a front-to-back extrusion, so
  // the rock chunk builds its BufferGeometry directly. Arrays are grown once
  // per chunk (chunk count is small and fixed by S.w/ROCK_CHUNK_W) rather than
  // per frame.
  var rockPos = [];
  var rockCol = [];
  var rockIdx = [];
  function rockReset() { rockPos.length = 0; rockCol.length = 0; rockIdx.length = 0; }
  function rockPushQuad(cx, cy, z, w, h, color) {
    var base = rockPos.length / 3;
    var hw = w * 0.5, hh = h * 0.5;
    var r = ((color >> 16) & 255) / 255, g = ((color >> 8) & 255) / 255, b = (color & 255) / 255;
    var pts = [[cx - hw, cy - hh], [cx + hw, cy - hh], [cx + hw, cy + hh], [cx - hw, cy + hh]];
    for (var i = 0; i < 4; i++) {
      rockPos.push(pts[i][0], pts[i][1], z);
      rockCol.push(r, g, b, 1);
    }
    rockIdx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  // Rev 6.12 ROCK WELD: interior fill quad built from 4 EXPLICIT corner
  // points (already jittered by the caller via the shared cornerHash), so
  // this is a plain irregular quadrilateral rather than an axis-aligned
  // rockPushQuad. Two triangles, CCW in this Y-flipped three-space frame to
  // match rockPushQuad/rockPushContourCap's winding convention.
  function rockPushWeldedQuad(tl, tr, br, bl, z, color) {
    var base = rockPos.length / 3;
    var r = ((color >> 16) & 255) / 255, g = ((color >> 8) & 255) / 255, b = (color & 255) / 255;
    var pts = [tl, tr, br, bl];
    for (var i = 0; i < 4; i++) {
      rockPos.push(pts[i][0], pts[i][1], z);
      rockCol.push(r, g, b, 1);
    }
    rockIdx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  // Rev 6.13 ART CRITICAL 1 (rock re-weld): ONE irregular triangle, from 3
  // EXPLICIT points that already carry their own shaded colour and their own
  // z (so a triangle can sit slightly proud of or behind its neighbours,
  // catching the hemi/sun key differently face to face). This is the unit
  // the new per-SDF-cell interior fill below is built from; it deliberately
  // takes color PER VERTEX (not one flat color per call) so a single
  // triangle is not itself a flat card the way the old macro-grid quads were.
  function rockPushTri(pa, pb, pc, ca, cb, cc) {
    var base = rockPos.length / 3;
    var pts = [pa, pb, pc], cols = [ca, cb, cc];
    for (var i = 0; i < 3; i++) {
      var c = cols[i];
      rockPos.push(pts[i][0], pts[i][1], pts[i][2]);
      rockCol.push(((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255, 1);
    }
    rockIdx.push(base, base + 1, base + 2);
  }
  // Deterministic [0,1) hash for a triangle, keyed on its own 3 corner
  // positions (not a grid index), so two triangles that happen to share the
  // same rounded seed still diverge unless they are the literal same
  // triangle, and the same physical triangle always re-derives the same
  // shading/z-offset roll across rebuilds.
  function triHash(pa, pb, pc, salt) {
    var h = Math.sin(pa[0] * 12.9898 + pa[1] * 78.233 +
      pb[0] * 39.346 + pb[1] * 11.135 +
      pc[0] * 15.732 + pc[1] * 45.164 + salt * 91.7) * 43758.5453;
    return h - Math.floor(h);
  }
  // A side "skirt" quad from the front cap edge back to ROCK_BACK_Z, oriented
  // along one horizontal or vertical edge of the cell so the extrusion has a
  // visible depth wall rather than relying on DoubleSide backface fill.
  function rockPushSkirt(ax, ay, bx, by, color) {
    var base = rockPos.length / 3;
    var r = ((color >> 16) & 255) / 255, g = ((color >> 8) & 255) / 255, b = (color & 255) / 255;
    rockPos.push(ax, ay, ROCK_FRONT_Z, bx, by, ROCK_FRONT_Z, bx, by, ROCK_BACK_Z, ax, ay, ROCK_BACK_Z);
    for (var i = 0; i < 4; i++) rockCol.push(r, g, b, 1);
    rockIdx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  // Rev 6.12 ROCK WELD: deterministic [0,1) hash keyed on INTEGER SDF grid-
  // corner coordinates (not on a cell id or a per-cell ring index), so any
  // two callers that agree on which corner they mean always compute the
  // identical value. A marching-squares crossing point always lies on one
  // grid EDGE between two corners; hashing the edge's two corner coords
  // (order-independent, via cornerHash2 below) gives every cell that shares
  // that edge the same jitter for the same physical point, closing the
  // Rev-6.11 cracks where each cell jittered its copy of a shared vertex
  // independently.
  function cornerHash(gx, gy) {
    var h = Math.sin(gx * 127.1 + gy * 311.7) * 43758.5453;
    return h - Math.floor(h);
  }
  // Order-independent hash for the two corners bounding a grid edge, so it
  // does not matter which of the two adjacent cells asks for it first.
  function edgeHash(ax, ay, bx, by) {
    // Sort the pair into a canonical order first.
    if (bx < ax || (bx === ax && by < ay)) {
      var tx = ax, ty = ay; ax = bx; ay = by; bx = tx; by = ty;
    }
    var h = Math.sin(ax * 127.1 + ay * 311.7 + bx * 269.5 + by * 183.3) * 43758.5453;
    return h - Math.floor(h);
  }
  // Rev 6.12 ROCK WELD: the ONE canonical displaced position for a real SDF
  // grid corner (px, py already in world px, not grid indices). Both the
  // marching-squares contour cap (for its solid-corner ring vertices) and the
  // interior weld fill (for every macro-cell corner) call this SAME function
  // for the SAME physical corner, so a solid rock cell that is adjacent to
  // (but not part of) the interior weld fill still lands its shared corner in
  // the identical spot — an absolute XY offset keyed only on the corner's own
  // grid position, never on a fan centroid or any other per-caller context
  // that would otherwise make two callers agree on the hash but not on the
  // resulting point.
  var weldCornerScratch = {};
  function weldedCorner(px, py) {
    var key = px + ',' + py;
    var hit = weldCornerScratch[key];
    if (hit) return hit;
    var h = cornerHash(px, py);
    var dirH = cornerHash(px + 1000.5, py - 1000.5); // independent second hash for direction
    var amt = h * (SDF_CELL * 0.28); // magnitude in [0, ~18px]
    var ang = dirH * TAU;
    var pt = [px + Math.cos(ang) * amt, py + Math.sin(ang) * amt, h];
    weldCornerScratch[key] = pt;
    return pt;
  }

  // Rev 6.11 ART CRITICAL 2: irregular contour-following cap. Fills the SOLID
  // (rock) portion of one straddling cell as a fan from its centroid, using
  // the cell's own solid corners PLUS the real marching-squares zero-crossing
  // points already computed by the caller (never a fixed square), so adjacent
  // cells' polygons tile exactly along the true water/rock boundary with no
  // visible grid seam. `verts` is an ordered ring of entries
  // [x, y, final, edgeHash]:
  //   - final === true: a solid GRID CORNER. (x,y) is already the canonical
  //     weldedCorner() displacement — used AS-IS, no further jitter — so it
  //     lands in the exact same spot the interior weld-fill pass (Rev 6.12
  //     ROCK WELD) puts that same physical corner.
  //   - final === false: a marching-squares CROSSING POINT (not on the fixed
  //     grid). It gets its own small radial jitter off the fan centroid,
  //     keyed by edgeHash so the two cells straddling that same crossing
  //     edge compute the identical displacement and the seam does not crack.
  function rockPushContourCap(verts, z, color) {
    var n = verts.length;
    if (n < 3) return;
    var cx = 0, cy = 0, i;
    for (i = 0; i < n; i++) { cx += verts[i][0]; cy += verts[i][1]; }
    cx /= n; cy /= n;
    // Winding must be CCW in this (already Y-flipped, three-space) frame so
    // computeVertexNormals derives +z (camera-facing) normals, matching
    // rockPushQuad's convention. The ring is built by the caller walking the
    // cell perimeter TL->TR->BR->BL, which is CW once Y is flipped to
    // three-space, so reverse it here rather than push a back-facing cap
    // that reads black under MeshLambertMaterial regardless of AO.
    verts = verts.slice().reverse();
    var r = ((color >> 16) & 255) / 255, g = ((color >> 8) & 255) / 255, b = (color & 255) / 255;
    var base = rockPos.length / 3;
    // Center vertex (fan hub), then the (optionally jittered) ring.
    rockPos.push(cx, cy, z);
    rockCol.push(r, g, b, 1);
    for (i = 0; i < n; i++) {
      var vx = verts[i][0], vy = verts[i][1];
      var isFinal = verts[i][2] === true;
      var h, jx, jy;
      if (isFinal) {
        // Already the canonical corner position; do not jitter again. The
        // hash travels through as verts[i][3] (weldedCorner's own h), so the
        // colour-variance shade below matches the exact displacement used,
        // rather than being recomputed from the post-displacement position.
        jx = vx; jy = vy;
        h = verts[i][3];
        if (typeof h !== 'number') h = 0.5;
      } else {
        var nx = vx - cx, ny = vy - cy;
        var nlen = Math.sqrt(nx * nx + ny * ny) || 1;
        h = verts[i][3];
        if (typeof h !== 'number') h = 0.5; // defensive: unkeyed caller, no jitter bias
        var jitterAmt = (h - 0.5) * 2 * (SDF_CELL * 0.09);
        jx = vx + (nx / nlen) * jitterAmt;
        jy = vy + (ny / nlen) * jitterAmt;
      }
      rockPos.push(jx, jy, z);
      // Slight per-vertex colour variance so the triangulated face is not a
      // single flat colour, reinforcing the faceted-geology read.
      var shade = 1 + (h - 0.5) * 0.16;
      rockCol.push(clamp(r * shade, 0, 1), clamp(g * shade, 0, 1), clamp(b * shade, 0, 1), 1);
    }
    for (i = 0; i < n; i++) {
      var a = base + 1 + i, bIdx = base + 1 + ((i + 1) % n);
      rockIdx.push(base, a, bIdx);
    }
  }
  // Rev 6.11 ART CRITICAL 2: authored neon fault line / conduit seam. A thin
  // additive strip laid directly along one real contour edge (two adjacent
  // zero-crossing points), so it reads as an authored circuit line following
  // the actual rock silhouette rather than a decal. Shares the rock chunk's
  // own additive batch arrays (rockFaultPos/Col/Idx) so the whole cyberpunk
  // fault-line system across every chunk costs at most +1-2 draws total, not
  // one draw per line.
  var FAULT_WIDTH = 8; // Rev 6.12 NEON LANDMARKS: widened from 5 for gameplay-scale visibility
  function rockPushFault(ax, ay, bx, by, color, alpha) {
    var dx = bx - ax, dy = by - ay;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var px = -(dy / len) * FAULT_WIDTH, py = (dx / len) * FAULT_WIDTH;
    var base = rockFaultPos.length / 3;
    var r = ((color >> 16) & 255) / 255, g = ((color >> 8) & 255) / 255, b = (color & 255) / 255;
    var z = ROCK_FRONT_Z + 2; // sits just proud of the rock cap, never z-fights
    rockFaultPos.push(ax - px, ay - py, z, ax + px, ay + py, z, bx + px, by + py, z, bx - px, by - py, z);
    for (var i = 0; i < 4; i++) rockFaultCol.push(r, g, b, alpha);
    rockFaultIdx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  var rockFaultPos = [];
  var rockFaultCol = [];
  var rockFaultIdx = [];
  function rockFaultReset() { rockFaultPos.length = 0; rockFaultCol.length = 0; rockFaultIdx.length = 0; }
  var ringScratch = []; // reused per-cell contour ring build scratch

  function buildRockChunk(x0, x1) {
    var cols = S.sdfCols, rows = S.sdfRows;
    var cell = SDF_CELL;
    var cx0 = Math.max(0, Math.floor(x0 / cell));
    var cx1 = Math.min(cols - 2, Math.ceil(x1 / cell));
    if (cx1 <= cx0) return null;
    rockReset();
    // NOTE: rockFaultPos/Col/Idx are NOT reset here. Fault-line geometry
    // accumulates across every chunk's buildRockChunk call into ONE shared
    // additive batch, built once in buildNearRock after the chunk loop, per
    // the "+1-2 draws max" budget for the whole neon fault-line system.
    var segN = 0;
    var Zlist = zones();
    var lastZoneTint = Zlist.length ? hexNum(Zlist[Zlist.length - 1].tint) : 0x050d17;
    for (var gy = 0; gy < rows - 1; gy++) {
      var y0 = gy * cell, y1 = y0 + cell;
      for (var gx = cx0; gx <= cx1; gx++) {
        var xx0 = gx * cell, xx1 = xx0 + cell;
        var s0 = S.sdf[gy * cols + gx];           // TL
        var s1 = S.sdf[gy * cols + gx + 1];       // TR
        var s2 = S.sdf[(gy + 1) * cols + gx + 1]; // BR
        var s3 = S.sdf[(gy + 1) * cols + gx];     // BL
        var solid0 = s0 <= 0, solid1 = s1 <= 0, solid2 = s2 <= 0, solid3 = s3 <= 0;
        if (solid0 === solid1 && solid1 === solid2 && solid2 === solid3) continue; // uniform cell
        var corners = [[xx0, y0, s0], [xx1, y0, s1], [xx1, y1, s2], [xx0, y1, s3]];
        var solids = [solid0, solid1, solid2, solid3];
        var midX = 0, midY = 0, ptN = 0;
        var edgePts = null;
        // Rev 6.11 ART CRITICAL 2: walk the cell perimeter once, building the
        // ACTUAL solid-region ring (solid corners + real zero-crossing points
        // in perimeter order), not a fixed square. This ring, triangulated as
        // a fan, is what makes the cap follow the true marching-squares
        // contour instead of stamping a nearly-full cell quad.
        // Rev 6.12 ROCK WELD: each ring entry is now [x, y, final] where
        // `final` is a bool. A solid CORNER entry is already the FINAL
        // displaced point straight from weldedCorner(px,py) — the exact same
        // canonical function the interior weld-fill pass below uses for its
        // macro-cell corners, so a solid rock cell sitting next to the
        // interior fill shares an identically-placed corner with it, not just
        // an identically-keyed hash. A crossing-point entry is NOT on the
        // fixed grid (it is a marching-squares interpolation along one grid
        // edge) so it still needs its own radial jitter in
        // rockPushContourCap, keyed by edgeHash so the two cells straddling
        // that edge agree on it.
        var ring = ringScratch;
        ring.length = 0;
        for (var ei = 0; ei < 4; ei++) {
          var ca = corners[ei], cb = corners[(ei + 1) % 4];
          if (solids[ei]) {
            var wc = weldedCorner(ca[0], ca[1]);
            ring.push([wc[0], wc[1], true, wc[2]]);
          }
          if ((ca[2] <= 0) === (cb[2] <= 0)) continue; // same side, no crossing
          var p = interpEdgePoint(ca, cb);
          midX += p[0]; midY += p[1]; ptN++;
          if (!edgePts) edgePts = [];
          edgePts.push(p);
          ring.push([p[0], p[1], false, edgeHash(ca[0], ca[1], cb[0], cb[1])]);
        }
        if (!ptN || ring.length < 3) continue;
        midX /= ptN; midY /= ptN;
        var zoneHere = World.zoneAt((y0 + y1) * 0.5);
        var water = zoneHere ? hexNum(zoneHere.tint) : lastZoneTint;
        var depthHere = Math.min(s0, s1, s2, s3);
        var ao = rockChunkAO(depthHere);
        // Rock base tint darkens with AO; a cyan accent per 6.9 rides the lit
        // edge so near-rock reads as cyberpunk cavern stone rather than flat
        // grey. `water` folds the zone tint in at a low weight so the rock
        // still reads as belonging to its zone's water body.
        // Rev 6.12 NEON LANDMARKS: art review measured the old 5-10% cyan mix
        // here as reading pale/gray in an ordinary frame, not neon. Raised to
        // a substantially stronger mix so the contour ribbon itself carries
        // visible neon identity, not just the authored fault lines riding it.
        var rockBase = lerpColor(scaleColor(0x2b3038, ao), water, 0.08);
        var rockLit = lerpColor(rockBase, NEON_CYAN, 0.28 + 0.24 * ao);
        // Ring y is flipped to world -y at push time (rockPushContourCap does
        // not know about the sim/three y flip, so flip each point here); this
        // allocates a fresh array per entry rather than mutating in place, so
        // weldedCorner's cached point objects are never touched by the flip.
        // Trailing fields (final flag / edgeHash) travel through unchanged.
        for (var rgi = 0; rgi < ring.length; rgi++) {
          var re = ring[rgi];
          ring[rgi] = [re[0], -re[1], re[2], re[3]];
        }
        var cellSeed = gx * 92821 + gy * 68917; // still used below for fault tint/roll only
        rockPushContourCap(ring, ROCK_FRONT_Z, rockLit);
        // Extruded skirt to ROCK_BACK_Z along the boundary crossing itself
        // (the two zero-crossing points found above), so the wall reads as a
        // real depth edge rather than a flat card. Darkened: skirts face
        // sideways, away from the hemi/sun key, so they read as shadowed.
        if (edgePts && edgePts.length >= 2) {
          var skirtColor = scaleColor(rockLit, 0.55);
          rockPushSkirt(edgePts[0][0], -edgePts[0][1], edgePts[1][0], -edgePts[1][1], skirtColor);
          // Rev 6.11 ART CRITICAL 2/3: an authored neon fault line along a
          // sparse, deterministic subset of contour edges (not every one,
          // which would look like a uniform outline rather than authored
          // circuitry). Alternates cyan/magenta per cell so a run of faults
          // reads as intentional conduit seams.
          // Rev 6.12 NEON LANDMARKS: density raised 0.16 -> 0.32 and alpha
          // floor/ceiling both raised. Art review measured the old rate as
          // reading as sparse, easy-to-miss dots rather than authored
          // circuitry visible in an ordinary frame; additive fault lines cost
          // no extra draws regardless of count (one shared batch), so this is
          // pure win for the neon-visibility bar.
          var faultRoll = Math.abs(Math.sin(cellSeed * 0.0001743));
          if (faultRoll < 0.32) {
            var faultColor = (cellSeed & 1) ? NEON_MAGENTA : NEON_CYAN;
            rockPushFault(edgePts[0][0], -edgePts[0][1], edgePts[1][0], -edgePts[1][1],
              faultColor, 0.75 + 0.25 * ao);
          }
        }
        segN++;
      }
    }
    // Second pass: fill uniform-solid interior cells. The boundary loop above
    // only emits a thin ribbon at the water/rock crossing, so without this a
    // cavern's solid rock body is invisible past that ribbon and the gradient
    // sheet behind the world shows through as an empty cavity.
    //
    // Rev 6.13 ART CRITICAL 1 (rock re-weld): Rev 6.12's WELD_STRIDE=2
    // macro-grid still read as tiled 128px blocks in real captures (art
    // review measured this directly against 06-midwater) — a welded EDGE
    // stops the geometry cracking, but the macro-cells were still one flat
    // quad each, laid on a regular axis-aligned grid, so the eye still reads
    // "tiled floor" even with jagged-looking edges. This pass instead walks
    // every SINGLE SDF cell (64px, the native resolution, no macro stride)
    // and splits each all-solid cell into TWO TRIANGLES along a
    // per-cell-chosen diagonal (not always the same corner, so the split
    // direction itself is irregular rather than a uniform '\' or '/' grid).
    // Every corner still comes from weldedCorner(px,py), the same canonical
    // function the marching-squares contour cap uses, so adjacent cells
    // (interior-interior or interior-boundary) still share the exact same
    // displaced point and the mesh is watertight with zero cracks. On top of
    // that shared-edge guarantee, each of the two triangles gets:
    //   - its own per-triangle hash (triHash, keyed on its 3 corner
    //     positions) driving independent per-VERTEX colour shading, so a
    //     triangle is not a single flat facet;
    //   - a small independent face-scale jitter via a per-triangle inset
    //     toward its own centroid, so triangle SIZE varies cell to cell
    //     rather than every face being the same 64px right triangle;
    //   - an occasional (roughly 1 in 5) small z-offset on the far vertex of
    //     the split, so a minority of faces sit slightly proud/behind their
    //     neighbour and pick up a visibly different diffuse term under the
    //     hemi/sun rig instead of every face lying dead flat on one plane.
    // Two triangles per SDF cell is the same tri density the OLD run-length
    // rectangle pass paid for a typical cavern span (one quad = two
    // triangles per run vs one quad = two triangles per single cell here is
    // more geometry than either previous pass, so this pass is chunk-budget
    // checked by the caller via mesh.userData.rfRockTris; see buildRockChunk
    // report below).
    var TRI_FACE_INSET = [0.0, 0.10];  // per-triangle shrink toward its own centroid
    var TRI_Z_JITTER = 10;             // px of proud/behind offset, applied rarely
    function weldCornerFlipped(gx, gy) {
      var wc = weldedCorner(gx * cell, gy * cell);
      return [wc[0], -wc[1]];
    }
    // Pushes one triangle from 3 already-flipped 2D corners at a shared base
    // z, applying this cell's own face-scale inset, colour shade, and rare
    // z-jitter so the two triangles from one split read as independent
    // faces rather than one quad cut in half.
    function rockPushCellTri(pa2, pb2, pc2, z, baseColor, salt) {
      var h = triHash(pa2, pb2, pc2, salt);
      var cx = (pa2[0] + pb2[0] + pc2[0]) / 3, cy = (pa2[1] + pb2[1] + pc2[1]) / 3;
      var inset = TRI_FACE_INSET[0] + h * (TRI_FACE_INSET[1] - TRI_FACE_INSET[0]);
      var h2 = triHash(pb2, pc2, pa2, salt + 7.31); // independent second roll
      var dz = (h2 < 0.2) ? (h2 * 5 - 0.5) * TRI_Z_JITTER : 0; // ~1-in-5 faces
      function place(p) {
        var jx = p[0] + (cx - p[0]) * inset, jy = p[1] + (cy - p[1]) * inset;
        return [jx, jy, z + dz];
      }
      var wa = place(pa2), wb = place(pb2), wc2 = place(pc2);
      // Per-vertex shade so the face is not one flat colour even before
      // computeVertexNormals' lighting varies it further; +-8% swing keyed
      // on each vertex's own corner hash (pa2/pb2/pc2 already carry a stable
      // identity via weldedCorner's cache, so re-hashing their own position
      // here stays deterministic per physical corner, matching the contour
      // cap's per-vertex shade approach above).
      function shadeOf(p) {
        var ph = cornerHash(p[0] | 0, p[1] | 0);
        var shade = 1 + (ph - 0.5) * 0.16 + (h - 0.5) * 0.10;
        var r = clamp(((baseColor >> 16) & 255) / 255 * shade, 0, 1);
        var g = clamp(((baseColor >> 8) & 255) / 255 * shade, 0, 1);
        var b = clamp((baseColor & 255) / 255 * shade, 0, 1);
        return (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
      }
      rockPushTri(wa, wb, wc2, shadeOf(pa2), shadeOf(pb2), shadeOf(pc2));
    }
    for (var igy = 0; igy < rows - 1; igy++) {
      for (var igx = cx0; igx <= cx1; igx++) {
        var isv0 = S.sdf[igy * cols + igx];
        var isv1 = S.sdf[igy * cols + igx + 1];
        var isv2 = S.sdf[(igy + 1) * cols + igx + 1];
        var isv3 = S.sdf[(igy + 1) * cols + igx];
        // Only a fully-interior cell (every corner solid) is this pass's to
        // fill; any straddling cell is already owned by the marching-squares
        // boundary pass above.
        if (isv0 > 0 || isv1 > 0 || isv2 > 0 || isv3 > 0) continue;
        var iMinDepth = Math.min(isv0, isv1, isv2, isv3);
        var iMidY = (igy + 0.5) * cell;
        var iZone = World.zoneAt(iMidY);
        var iWater = iZone ? hexNum(iZone.tint) : lastZoneTint;
        var iAo = rockChunkAO(iMinDepth);
        var iBase = lerpColor(scaleColor(0x232830, iAo), iWater, 0.10);
        // Rev 6.12 NEON LANDMARKS mix preserved verbatim (art review: raised
        // from 3-6% flat-gray to a visible ordinary-frame accent).
        var iLit = lerpColor(iBase, NEON_CYAN, 0.22 + 0.18 * iAo);
        var pTL = weldCornerFlipped(igx, igy), pTR = weldCornerFlipped(igx + 1, igy);
        var pBR = weldCornerFlipped(igx + 1, igy + 1), pBL = weldCornerFlipped(igx, igy + 1);
        // Diagonal choice alternates per-cell (deterministic on grid coords,
        // not random noise re-rolled per rebuild) so the split direction
        // itself does not fall into a uniform herringbone: cells pick their
        // diagonal off a cheap hash of their own grid index rather than a
        // fixed parity check, which would still read as a regular pattern.
        var diagPick = cornerHash(igx * 3 + 11, igy * 5 + 7) < 0.5;
        var cellSalt = igx * 733.1 + igy * 917.7;
        if (diagPick) {
          rockPushCellTri(pTL, pTR, pBR, ROCK_FRONT_Z, iLit, cellSalt);
          rockPushCellTri(pTL, pBR, pBL, ROCK_FRONT_Z, iLit, cellSalt + 1.5);
        } else {
          rockPushCellTri(pTL, pTR, pBL, ROCK_FRONT_Z, iLit, cellSalt);
          rockPushCellTri(pTR, pBR, pBL, ROCK_FRONT_Z, iLit, cellSalt + 1.5);
        }
        segN++;
      }
    }
    if (!segN) return null;
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(rockPos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(rockCol, 4));
    geo.setIndex(rockIdx);
    // MeshLambertMaterial needs vertex normals to be lit at all; without this
    // call every rock chunk face reads as flat black regardless of the hemi/
    // sun rig (the defect that made near-rock a black silhouette).
    geo.computeVertexNormals();
    envOwned.geos.push(geo);
    // 6.4 explicitly asks for MeshLambertMaterial so the existing light rig
    // shades the caverns; this is the one batch in the module that is NOT a
    // MeshBasicMaterial, and it is still cached (one shared instance for
    // every chunk, per the same look-based sharing envMaterial uses).
    var lambertKey = 'rock_lambert';
    var lambertMat = envMatCache[lambertKey];
    if (!lambertMat && isThree() && THREE.MeshLambertMaterial) {
      // Art fix (6.11) + Rev 6.12 NEON LANDMARKS correction: MeshLambertMaterial's
      // diffuse term depends on the local normal vs the hemi/sun rig; the
      // skirt walls (side extrusion faces, normal roughly perpendicular to
      // both lights) legitimately compute near-zero diffuse light under that
      // rig, which reads as a pure black silhouette regardless of the
      // vertex-colour AO/tint work above.
      //
      // The original fix added a flat `emissive` floor color, but three.js's
      // MeshLambertMaterial emissive term is a CONSTANT material colour, not
      // multiplied by vertexColors -- so every unlit face rendered the exact
      // same flat dark navy regardless of its own per-vertex neon-tint work,
      // which is exactly why real captures still showed a solid near-black
      // silhouette no matter how much cyan got mixed into rockLit/wLit. Rev
      // 6.12 patches the compiled fragment shader to multiply the emissive
      // contribution by the face's OWN vertex colour, so an unlit face still
      // shows its real AO/neon tint at a visible floor brightness instead of
      // one flat constant colour.
      lambertMat = new THREE.MeshLambertMaterial({
        vertexColors: true, fog: true, side: THREE.DoubleSide,
        emissive: 0xffffff, emissiveIntensity: 0.4,
      });
      lambertMat.onBeforeCompile = function (shader) {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\n' +
          'totalEmissiveRadiance *= vColor.rgb;'
        );
      };
      lambertMat.customProgramCacheKey = function () { return 'rf-rock-lambert-vcol-emissive'; };
      envMatCache[lambertKey] = lambertMat;
      envOwned.mats.push(lambertMat);
    }
    if (!lambertMat) return null;
    var mesh = new THREE.Mesh(geo, lambertMat);
    mesh.frustumCulled = true;
    mesh.userData = mesh.userData || {};
    mesh.userData.rfRockChunk = true;
    mesh.userData.rfRockTris = rockIdx.length / 3;
    return mesh;
  }

  // Linear-interpolate the zero crossing between two corners [x,y,sdf].
  function interpEdgePoint(ca, cb) {
    var da = ca[2], db = cb[2];
    var t = (da - db) !== 0 ? clamp(da / (da - db), 0, 1) : 0.5;
    return [ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t];
  }

  function buildNearRock() {
    if (!isThree() || !S.sdf) return;
    S.rockChunks.length = 0;
    rockFaultReset();
    // Rev 6.12 ROCK WELD: clear the welded-corner cache so a restart (World.
    // init called again) rebuilds every corner's displacement fresh rather
    // than retaining a previous world's positions (harmless when S.w/S.h are
    // unchanged, since the hash is deterministic, but the cache is otherwise
    // build-scoped and should not silently persist across teardown/init).
    weldCornerScratch = {};
    for (var x0 = 0; x0 < S.w; x0 += ROCK_CHUNK_W) {
      var chunk = buildRockChunk(x0, x0 + ROCK_CHUNK_W);
      if (!chunk) continue;
      sceneAdd(chunk);
      S.decor.push(chunk);
      S.rockChunks.push(chunk);
    }
    // Rev 6.11 ART CRITICAL 2/3: ONE shared additive batch for every neon
    // fault line/conduit seam across every rock chunk, so the authored
    // circuitry costs a single extra draw call regardless of world size.
    if (rockFaultIdx.length) {
      var fgeo = new THREE.BufferGeometry();
      fgeo.setAttribute('position', new THREE.Float32BufferAttribute(rockFaultPos, 3));
      fgeo.setAttribute('color', new THREE.Float32BufferAttribute(rockFaultCol, 4));
      fgeo.setIndex(rockFaultIdx);
      envOwned.geos.push(fgeo);
      var faultKey = 'rock_fault_additive';
      var faultMat = envMatCache[faultKey];
      if (!faultMat) {
        faultMat = new THREE.MeshBasicMaterial({
          vertexColors: true, transparent: true, blending: THREE.AdditiveBlending,
          depthWrite: false, fog: false, side: THREE.DoubleSide
        });
        envMatCache[faultKey] = faultMat;
        envOwned.mats.push(faultMat);
      }
      var faultMesh = new THREE.Mesh(fgeo, faultMat);
      faultMesh.frustumCulled = true;
      faultMesh.userData = faultMesh.userData || {};
      faultMesh.userData.rfRockFaultBatch = true;
      sceneAdd(faultMesh);
      S.decor.push(faultMesh);
    }
  }

  // ---------------------------------------------------------------- seams
  // Thermocline bands at each zone boundary, drifting sideways so a boundary
  // looks like water moving through a temperature layer. The fog lerp already
  // carries the colour change; these give the seam a VISIBLE edge you can
  // point at, which is what makes a crossing unmistakable rather than merely
  // gradual.
  // PERF-03. The seams used to be 2 meshes and 2 materials per boundary. Both
  // families now merge into ONE batch each: all the dark thermocline bands in
  // one normal-blend mesh, all the bright upper glints in one additive mesh.
  // Per-band opacity survives the merge in the vertex alpha channel, and the
  // horizontal drift moves the whole batch, which is correct: a thermocline is
  // one body of water sliding past, not a set of independent stripes. 6 draw
  // calls become 2.
  function buildSeams() {
    if (!isThree()) return;
    var Z = zones();
    if (Z.length < 2) return;
    var wide = S.w + SEAM_DRIFT * 4;
    var i, z;
    // Dark bands, one batch.
    quadReset();
    for (i = 0; i < Z.length - 1; i++) {
      z = Z[i];
      quadPush(S.w * 0.5, -(z.yMax + 85), Z_SEAM, wide, 170, 0, 1,
        0x000000, 0.20 + i * 0.07);
    }
    var dn = batchMesh(null, false, undefined);
    if (dn) {
      sceneAdd(dn);
      S.decor.push(dn);
      registerSeam(dn, 0, 0);
    }
    // Bright upper glints, one additive batch. Each glint keeps its own zone
    // fog colour through the vertex colour channel.
    quadReset();
    for (i = 0; i < Z.length - 1; i++) {
      z = Z[i];
      quadPush(S.w * 0.5, -(z.yMax - 60), Z_SEAM + 4, wide, 120, 0, 1,
        hexNum(z.fog), 0.05);
    }
    var up = batchMesh(null, true, undefined);
    if (up) {
      sceneAdd(up);
      S.decor.push(up);
      registerSeam(up, 0, 1.5);
    }
  }

  function registerSeam(mesh, x0, idx) {
    if (!mesh) return;
    S.seams.push({
      img: mesh, x0: x0,
      ampX: SEAM_DRIFT * rr(0.7, 1.15),
      rate: rr(SEAM_RATE[0], SEAM_RATE[1]),
      phase: rr(0, TAU) + idx * 1.3,
    });
  }

  // -------------------------------------------------------------- surface
  // The waterline. The wash and foam remain planes, but the old dead-straight
  // surface plane is replaced by a preallocated 64-segment ribbon. A small
  // radial Snell window sits just behind it and fades by atmosphere depth.
  var SURFACE_SEGMENTS = 64;
  var SURFACE_RIBBON_H = 54;
  var SURFACE_WAVE_RATE = 0.8;
  var SURFACE_WAVE_K = 0.012;
  var SNELL_W = 1400;

  function surfaceWave(x, t) {
    return 2 - Math.sin(x * SURFACE_WAVE_K + t * SURFACE_WAVE_RATE) * 2;
  }

  function buildSurfaceRibbon() {
    var n = SURFACE_SEGMENTS + 1;
    var pos = new Float32Array(n * 2 * 3);
    var uv = new Float32Array(n * 2 * 2);
    var idx = new Uint32Array(SURFACE_SEGMENTS * 6);
    var i;
    for (i = 0; i < n; i++) {
      var x = S.w * i / SURFACE_SEGMENTS;
      var y = surfaceWave(x, 0);
      var top = i * 2;
      var bot = top + 1;
      pos[top * 3] = x; pos[top * 3 + 1] = -y; pos[top * 3 + 2] = Z_SURFACE;
      pos[bot * 3] = x; pos[bot * 3 + 1] = -(y + SURFACE_RIBBON_H); pos[bot * 3 + 2] = Z_SURFACE;
      uv[top * 2] = i / SURFACE_SEGMENTS; uv[top * 2 + 1] = 1;
      uv[bot * 2] = i / SURFACE_SEGMENTS; uv[bot * 2 + 1] = 0;
      if (i < SURFACE_SEGMENTS) {
        var q = i * 6, v = i * 2;
        idx[q] = v; idx[q + 1] = v + 1; idx[q + 2] = v + 2;
        idx[q + 3] = v + 2; idx[q + 4] = v + 1; idx[q + 5] = v + 3;
      }
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (typeof geo.setIndex === 'function') geo.setIndex(new THREE.BufferAttribute(idx, 1));
    envOwned.geos.push(geo);
    return { geo: geo, attr: geo.attributes.position };
  }

  function snellAlpha() {
    if (atmoReport.zone >= 3) return 0;
    return clamp(0.08 * (1 - atmoReport.depth / 0.55), 0, 0.08);
  }

  function buildSurface() {
    if (!isThree()) return;
    // The wash is a full-width ADDITIVE plane blanketing the top
    // SURFACE_LIGHT_H px, which is exactly the zone-1 gameplay band, so its
    // alpha is charged against the shelf's saturation on every frame the
    // player is on the shelf. The wash is a restrained 0.025 accent, not a
    // second water-colour layer.
    var ripple = surfaceTexture('__rf_surface_ripple', false);
    var snellMap = surfaceTexture('__rf_snell_window', true);
    var wash = planeMesh(S.w, SURFACE_LIGHT_H, 0xbfe9f5, 0.025, true, ripple);
    if (wash) {
      setPos(wash, S.w * 0.5, SURFACE_LIGHT_H * 0.5, Z_SURFACE - 20);
      sceneAdd(wash);
      S.decor.push(wash);
    }
    var ribbon = buildSurfaceRibbon();
    if (!ribbon || !ribbon.geo) return;
    var ribbonMat = envMaterial(0xe6fbff, 0.34, false, null, false);
    var plane = new THREE.Mesh(ribbon.geo, ribbonMat);
    sceneAdd(plane);
    S.decor.push(plane);
    // Foam is a pale blue additive edge. It is a thin 26px strip so it costs
    // little, but it sits ON the waterline where the shelf is brightest.
    var foam = planeMesh(S.w * 1.2, 26, 0xc7eff5, 0.10, true);
    if (foam) {
      setPos(foam, S.w * 0.5, 8, Z_SURFACE + 8);
      sceneAdd(foam);
      S.decor.push(foam);
    }
    var snell = planeMeshPrivate(SNELL_W, SNELL_W, 0xffffff, 0.08, true, snellMap);
    if (snell) {
      setPos(snell, S.w * 0.5, 0, -70);
      sceneAdd(snell);
      S.decor.push(snell);
    }
    S.surface = {
      mesh: plane, ribbon: plane, ribbonAttr: ribbon.attr,
      segments: SURFACE_SEGMENTS, wash: wash, foam: foam, snell: snell,
      ripple: ripple, x0: S.w * 0.5,
    };
  }

  // ------------------------------------------------------------ kelp/rock
  // Decor billboards at parallax z per the space contract. Rooted at their
  // BASE so a kelp stalk sways about the seafloor exactly like a real stalk:
  // the pivot trick from the god rays is reused, an empty Group at the root
  // with the plane offset upward inside it.
  // `key` is a KENNEY SPRITE NAME ('rock_a', 'seaweed_c'), so it resolves
  // through the same assets/<sprite>.png loader the creatures use. It used to
  // be passed to billboard() as a bare key, which nothing had registered, so
  // every rock and kelp stalk in the world was a silent 1x1 placeholder and
  // the coloured-plane fallback below was unreachable. Same defect as the
  // creature billboards, same fix: hand over a real texture or nothing.
  function decorBillboard(key, w, h, color, alpha, z) {
    var mesh = key ? billboardFrom(kenneyTexture(key)) : null;
    if (mesh) {
      setScale(mesh, w, h);
      if (mesh.material) { mesh.material.transparent = true; mesh.material.opacity = alpha; }
    } else {
      mesh = planeMesh(w, h, color, alpha, false);
    }
    if (!mesh) return null;
    // Offset upward inside the pivot so the pivot sits at the stalk's ROOT.
    if (mesh.position) mesh.position.y = h * 0.5;
    var pivot = new THREE.Group();
    pivot.add(mesh);
    pivot.position.z = z;
    return pivot;
  }

  // PERF-03. 90 rocks and 104 kelp stalks used to be 194 pivot Groups, 194
  // meshes and (before the material cache) 194 materials. They now merge.
  //
  //   ROCKS   do not move at all, so all 90 collapse into ONE batch: one
  //           merged geometry, one shared material, one draw call. Per-rock
  //           opacity and mirroring survive in the vertex data.
  //   KELP    sways, and a transform-animated object cannot merge with one
  //           that moves differently. Stalks are therefore batched by X
  //           COLUMN into KELP_BANDS beds, each with its own pivot Group at
  //           its own root, its own rate and its own phase. The swing radius
  //           inside a band is small because a band is a narrow column, so a
  //           bed leans as a bed instead of stalks scissoring past each other.
  //           That is how a real kelp bed moves under a current.
  //
  // 194 draw calls become 1 + KELP_BANDS.
  var KELP_BANDS = 12;

  // ---------------------------------------------------- maze-surface anchor
  // 6.4/6.9 fix: decor used to be placed only at the absolute world floor
  // (S.h) or inside zones 0-1, so every mid/deep-zone camera frame showed
  // bare gradient water with no kelp/coral/rock in sight (the "empty
  // environment" defect). This walks a vertical ray at world-x `x` from
  // `yLo` to `yHi` and returns the first y where terrainSDF is within
  // ROCK_WALL_BAND of the water/rock boundary (a cavern wall, floor, or
  // tunnel mouth), so decor roots land ON the maze surfaces the SDF actually
  // carved rather than on assumed fixed heightlines. Returns null if no wall
  // is found in the given band (open water span, e.g. mid-cavern).
  var ROCK_WALL_BAND = 40;
  var WALL_SAMPLE_STEP = 48;
  function findWallY(x, yLo, yHi) {
    if (!S.sdf) return null;
    var prevSdf = World.terrainSDF(x, yLo);
    for (var y = yLo + WALL_SAMPLE_STEP; y <= yHi; y += WALL_SAMPLE_STEP) {
      var sdf = World.terrainSDF(x, y);
      // A crossing (sign change) or a sample already inside the thin water
      // band next to rock both count as "found a wall here".
      if ((prevSdf > 0) !== (sdf > 0) || Math.abs(sdf) <= ROCK_WALL_BAND) {
        // Prefer the WATER side of the crossing, a few px off the boundary,
        // so decor roots sit in open water looking at the rock, not buried
        // inside it.
        var waterY = sdf > 0 ? y : (prevSdf > 0 ? y - WALL_SAMPLE_STEP : y);
        return clamp(waterY, yLo, yHi);
      }
      prevSdf = sdf;
    }
    return null;
  }

  function buildDecor() {
    if (!isThree()) return;
    var Z = zones();
    var i;
    // ------------------------------------------------- seafloor rocks (1 batch)
    var rockTex = kenneyTexture('rock_a');
    var floorZone = Z[Z.length - 1];
    var floorWater = floorZone ? hexNum(floorZone.tint) : 0x050d17;
    quadReset();
    for (i = 0; i < 90; i++) {
      var rs = rr(0.5, 1.5);
      var rw = 90 * rs, rh = 70 * rs;
      var rx = rr(0, S.w);
      var ry = S.h - rr(0, 26);
      var mir = rnd() < 0.5 ? -1 : 1;
      // Rooted on the floor: the quad centre is half a height above the root.
      var rz = rr(Z_KELP[0], Z_KELP[1]);
      // The source PNG is intentionally multiplied by muted green-grey
      // vertex colours. Its old pale top tint made these small cards read as
      // tan debris at the lower edge of shallow frames.
      var rockBase = envColor(rockTex ? 0x29494a : 0x0b2024, rz, floorWater, ry, 0);
      var rockTop = envColor(rockTex ? 0x416361 : 0x183437, rz, floorWater, ry - rh, 0.04);
      quadPush(rx, -(ry) + rh * 0.5, rz, rw, rh, 0, mir,
        rockBase, rr(0.45, 0.85), rockTop);
    }
    var rocks = batchMesh(rockTex, false, undefined);
    if (rocks) { sceneAdd(rocks); S.decor.push(rocks); }

    // ------------------------------------------------------- kelp (bands)
    var kelpTex = kenneyTexture('seaweed_c');
    var kelpZone = Z[1] || Z[0];
    var shelf = Z[0];
    // Collect every stalk first, then bucket by x column, so the two
    // populations (dense band, sparse shelf) share the same batches rather
    // than doubling the count. kelpScratch is module scratch, reused.
    kelpN = 0;
    if (kelpZone) {
      for (i = 0; i < 70; i++) {
        pushKelp(rr(0, S.w), rr(kelpZone.yMin + 40, kelpZone.yMax), rr(0.7, 1.9), rr(0.3, 0.7));
      }
    }
    if (shelf) {
      for (i = 0; i < 34; i++) {
        pushKelp(rr(0, S.w), rr(shelf.yMax - 260, shelf.yMax), rr(0.5, 1.1), rr(0.25, 0.5));
      }
    }
    // 6.4/6.9 fix: every zone (not just the shelf/kelpZone pair above) gets a
    // share of kelp rooted directly on the maze's own cavern floors/walls, so
    // the mid and deep bands are never bare gradient water. A random scatter
    // clusters by luck and leaves camera-sized gaps (a ~1900-world-unit-wide
    // gameplay frame with nothing in it), so this is a REGULAR GRID sweep: walk
    // x in fixed steps across the whole zone width and try a wall at every
    // step, which guarantees near-uniform coverage instead of hoping a
    // scattered sample happens to land near the camera. Steps close enough
    // together that no gameplay-frame-width span can fall entirely between
    // two successful hits.
    var KELP_GRID_STEP = 170;
    for (var zi = 0; zi < Z.length; zi++) {
      var zone = Z[zi];
      var gx0 = drr(0, KELP_GRID_STEP);
      for (var gx = gx0; gx < S.w; gx += KELP_GRID_STEP) {
        var gWallY = findWallY(gx, zone.yMin + 40, zone.yMax - 20);
        if (gWallY === null) continue;
        pushKelp(gx + drr(-30, 30), gWallY, drr(0.55, 1.5), drr(0.3, 0.6));
      }
    }
    // Tunnels/shafts are the connective corridors between caverns; anchoring
    // a few stalks along each one covers the narrow passages the grid sweep's
    // fixed step might straddle, so a camera moving through a tunnel still
    // sees kelp rather than the two caverns it connects.
    for (var mti = 0; mti < mazeTunnels.length; mti++) {
      var mt = mazeTunnels[mti];
      var mtZone = World.zoneAt((mt.y0 + mt.y1) * 0.5);
      if (!mtZone) continue;
      for (i = 0; i < 3; i++) {
        var tu = drr(0.15, 0.85);
        var tx = clamp(mt.x0 + (mt.x1 - mt.x0) * tu, 0, S.w);
        var tWallY = findWallY(tx, mtZone.yMin + 40, mtZone.yMax - 20);
        if (tWallY === null) continue;
        pushKelp(tx, tWallY, drr(0.5, 1.1), drr(0.25, 0.5));
      }
    }
    // Art CRITICAL 3 (neon visibility): kelp tips get a genuinely emissive/
    // additive accent, not just a diffuse vertex-colour mix, or the "neon" is
    // invisible in ordinary lighting. Every stalk tip contributes one small
    // additive quad to ONE shared world-anchored batch (not per-band, so this
    // costs exactly +1 draw regardless of KELP_BANDS). It does not sway with
    // its band pivot (a static accent glow at the tip's rest position), which
    // is an acceptable simplification given the sway amplitude is small.
    quadReset();
    for (var kt = 0; kt < kelpN; kt++) {
      var tipRec = kelpScratch[kt];
      var tkh = 200 * tipRec.scale, tkw = 70 * tipRec.scale;
      var tipY = -(tipRec.y) + tkh * 0.98;
      var tipColor = neonAccentFor(kt);
      // Rev 6.13 ART CRITICAL 2: 0.5x the stalk's own diffuse alpha measured
      // as an invisible flicker in ordinary frames (effective ~0.13-0.35).
      // Floored so every tip's additive glow clears the visibility bar
      // regardless of how dim its parent stalk rolled.
      quadPush(tipRec.x, tipY, tipRec.z + 1, tkw * 0.5, tkh * 0.14, 0, tipRec.mirror,
        tipColor, Math.max(0.6, 0.85 * tipRec.alpha));
    }
    // Rev 6.13 ART CRITICAL 2: FogExp2 was diluting this additive glow toward
    // the zone fog colour before it ever reached the screen — the actual
    // root cause of "reads pale/gray" surviving every previous alpha/mix
    // raise across Rev 6.9-6.12. An additive accent is meant to ADD light
    // regardless of camera depth (that is what makes it read as an emissive
    // neon tip rather than a diffuse surface), so this batch opts out of fog
    // via the flags param batchMesh already threads through.
    var kelpTipMesh = batchMesh(null, true, undefined, false, { fog: false });
    if (kelpTipMesh) {
      meshName(kelpTipMesh, 'RF kelp tip neon accent');
      sceneAdd(kelpTipMesh);
      S.decor.push(kelpTipMesh);
    }

    var bandW = S.w / KELP_BANDS;
    for (var b = 0; b < KELP_BANDS; b++) {
      var x0 = b * bandW, x1 = x0 + bandW;
      // Pivot at the band's own root: centre of the column, at the deepest
      // root in it, so the bed leans about the seafloor and not about the air.
      var px = (x0 + x1) * 0.5, py = 0, cnt = 0, maxScale = 0;
      var k;
      for (k = 0; k < kelpN; k++) {
        var rec0 = kelpScratch[k];
        if (rec0.x < x0 || rec0.x >= x1) continue;
        py += rec0.y; cnt++;
        if (rec0.scale > maxScale) maxScale = rec0.scale;
      }
      if (!cnt) continue;
      py = py / cnt;
      quadReset();
      for (k = 0; k < kelpN; k++) {
        var rec = kelpScratch[k];
        if (rec.x < x0 || rec.x >= x1) continue;
        var kh = 200 * rec.scale, kw = 70 * rec.scale;
        // Positions are RELATIVE to the band pivot, so the pivot's rotation
        // swings the bed about its root.
        var kelpBase = envColor(kelpTex ? 0x4c9c87 : 0x0b2a2a, rec.z, rec.water, rec.y, 0);
        var kelpTopLit = envColor(0xa7e6b8, rec.z, rec.water, rec.y - kh, 0.18);
        // 6.9: emissive neon tip, vertex colour only (no texture, no draw).
        // Blended at a third so the authored kelp-green top still reads
        // through; the accent cycles by stalk index, not a per-frame pulse.
        var kelpTop = lerpColor(kelpTopLit, neonAccentFor(k), 0.32);
        quadPush(rec.x - px, -(rec.y) + py + kh * 0.5, rec.z, kw, kh, 0, rec.mirror,
          kelpBase, rec.alpha, kelpTop);
      }
      var mesh = batchMesh(kelpTex, false, undefined);
      if (!mesh) continue;
      var pivot = new THREE.Group();
      pivot.add(mesh);
      pivot.position.x = px;
      pivot.position.y = -py;
      sceneAdd(pivot);
      S.decor.push(pivot);
      var amp = rr(SWAY_AMP[0], SWAY_AMP[1]) * clamp(maxScale / 1.2, 0.5, 1.5);
      S.swayers.push({
        img: pivot, rot0: 0, amp: amp,
        rate: rr(SWAY_RATE[0], SWAY_RATE[1]),
        phase: rr(0, TAU),
      });
    }
    kelpN = 0;
  }

  // Kelp placement scratch. Records are POOLED, so describing 104 stalks
  // allocates 104 records ONCE on the first init and reuses them on every
  // restart forever after.
  var kelpScratch = [];
  var kelpN = 0;
  function pushKelp(x, y, scale, alpha) {
    var r = kelpScratch[kelpN];
    if (!r) {
      r = kelpScratch[kelpN] = {
        x: 0, y: 0, z: 0, scale: 1, alpha: 1, mirror: 1, water: 0x14384d,
      };
    }
    kelpN++;
    r.x = x; r.y = y; r.scale = scale; r.alpha = alpha;
    r.z = rr(Z_KELP[0], Z_KELP[1]);
    var z = World.zoneAt(y);
    r.water = z ? hexNum(z.tint) : 0x14384d;
    r.mirror = rnd() < 0.5 ? -1 : 1;
  }

  // --------------------------------------------------------------- reef art
  // Reef pieces are deliberately quad-built rather than sprite-built. The
  // stacked and rotated silhouettes read as toon coral at gameplay scale,
  // carry saturated vertex colours, and collapse into three normal-blend
  // draws: one static head/brain batch and two swaying fan/anemone beds.
  var reefScratch = [];
  var reefN = 0;
  function pushReef(x, y, z, scale, kind, color, water, group) {
    var r = reefScratch[reefN];
    if (!r) {
      r = reefScratch[reefN] = {
        x: 0, y: 0, z: 0, scale: 1, kind: 0, color: 0,
        water: 0, group: 0, alpha: 0.9,
      };
    }
    reefN++;
    r.x = x; r.y = y; r.z = z; r.scale = scale; r.kind = kind;
    r.color = color; r.water = water; r.group = group; r.alpha = rr(0.78, 0.96);
  }

  function buildReef() {
    if (!isThree()) return;
    var Z = zones();
    var shallow = Z.length < 2 ? Z.length : 2;
    var i, j, k;

    // Static coral heads and brain corals, rooted in the floor band of zones 1
    // and 2. Every quad gets a lit top colour so the tops do not flatten into
    // the same dark value as the sandward base.
    quadReset();
    for (i = 0; i < shallow; i++) {
      var zone = Z[i];
      var water = hexNum(zone.tint);
      for (j = 0; j < 6; j++) {
        var x = rr(160, S.w - 160);
        // Rev 6 fix: anchor to the maze's real cavern floor near this x
        // instead of blindly assuming the zone's authored yMax is solid
        // ground everywhere (the SDF maze carves caverns/tunnels that do not
        // follow a flat heightline), so coral never floats over open water.
        var wallAnchor = findWallY(x, zone.yMin + 40, zone.yMax - 20);
        var baseY = (wallAnchor !== null ? wallAnchor : zone.yMax) - rr(45, 170);
        var z = rr(-155, -95);
        var color = REEF_PALETTE[ri(0, REEF_PALETTE.length - 1)];
        var scale = rr(0.72, 1.35);
        if (j % 2 === 0) {
          for (k = 0; k < 3; k++) {
            var hh = (34 + k * 12) * scale;
            var yy = baseY - k * 25 * scale;
            var ww = (86 - k * 15) * scale;
            var bc = envColor(color, z, water, yy, 0.05);
            var tc = envColor(color, z, water, yy - hh, 0.22);
            // 6.9: only the crown segment (the actual tip) gets the emissive
            // neon accent, so the coral column still reads as coral with a
            // glowing cap rather than glowing along its whole height.
            if (k === 2) tc = lerpColor(tc, neonAccentFor(i * 6 + j), 0.34);
            quadPush(x + (k - 1) * 9 * scale, -(yy - hh * 0.5), z + k * 2,
              ww, hh, (k - 1) * 0.08, 1, bc, 0.94, tc);
          }
        } else {
          for (k = 0; k < 4; k++) {
            var bh = (18 + k * 5) * scale;
            var by = baseY - k * 18 * scale;
            var bw = (88 - k * 10) * scale;
            var brainColor = envColor(color, z, water, by, 0.04);
            var brainTop = envColor(color, z, water, by - bh, 0.20);
            if (k === 3) brainTop = lerpColor(brainTop, neonAccentFor(i * 6 + j + 1), 0.34);
            quadPush(x + Math.sin(k * 1.7) * 8 * scale, -(by - bh * 0.5), z + k * 2,
              bw, bh, (k & 1 ? -0.11 : 0.11), 1, brainColor, 0.92, brainTop);
          }
        }
      }
    }
    var staticReef = batchMesh(null, false, undefined);
    if (staticReef) {
      sceneAdd(staticReef);
      S.decor.push(staticReef);
      S.reefBatches.push(staticReef);
    }

    // The two swaying beds are pivoted at their average root, just like kelp.
    // Their geometry is relative to that root, so animateWater only writes a
    // rotation and never allocates or rebuilds a coral column.
    for (var group = 0; group < 2; group++) {
      reefN = 0;
      for (i = 0; i < shallow; i++) {
        zone = Z[i];
        water = hexNum(zone.tint);
        for (j = 0; j < 6; j++) {
          if ((j & 1) !== group) continue;
          var fanX = rr(160, S.w - 160);
          var fanWall = findWallY(fanX, zone.yMin + 40, zone.yMax - 20);
          var fanY = (fanWall !== null ? fanWall : zone.yMax) - rr(35, 145);
          pushReef(fanX, fanY, rr(-150, -90),
            rr(0.75, 1.2), j % 2, REEF_PALETTE[ri(0, REEF_PALETTE.length - 1)], water, group);
        }
      }
      if (!reefN) continue;
      var px = 0, py = 0;
      for (j = 0; j < reefN; j++) { px += reefScratch[j].x; py += reefScratch[j].y; }
      px /= reefN; py /= reefN;
      quadReset();
      for (j = 0; j < reefN; j++) {
        var rec = reefScratch[j];
        var stemH = (rec.kind ? 58 : 48) * rec.scale;
        var stemW = (rec.kind ? 13 : 16) * rec.scale;
        var stemBase = envColor(rec.color, rec.z, rec.water, rec.y, 0.02);
        var stemTop = envColor(rec.color, rec.z, rec.water, rec.y - stemH, 0.20);
        quadPush(rec.x - px, -rec.y + py + stemH * 0.5, rec.z, stemW, stemH, 0, 1,
          stemBase, rec.alpha, stemTop);
        var crownY = rec.y - stemH * 0.78;
        var arms = rec.kind ? 4 : 3;
        for (k = 0; k < arms; k++) {
          var armA = rec.kind ? (-0.48 + k * 0.32) : (-0.62 + k * 0.62);
          var armL = (rec.kind ? 50 : 72) * rec.scale;
          var armX = rec.x + Math.sin(armA) * armL * 0.34;
          var armY = crownY - Math.cos(armA) * armL * 0.30;
          var armBase = envColor(rec.color, rec.z, rec.water, armY, 0.06);
          var armTopLit = envColor(rec.color, rec.z, rec.water, armY - 13 * rec.scale, 0.24);
          // 6.9: every fan/anemone arm tip carries a neon accent, lighter
          // than the coral crowns above since there are more of these on
          // screen at once and the readability law still applies.
          var armTop = lerpColor(armTopLit, neonAccentFor(j * 4 + k), 0.24);
          quadPush(armX - px, -armY + py, rec.z + 1, armL, 13 * rec.scale,
            armA, 1, armBase, rec.alpha, armTop);
        }
      }
      var swayMesh = batchMesh(null, false, undefined);
      if (!swayMesh) continue;
      var pivot = new THREE.Group();
      pivot.add(swayMesh);
      pivot.position.x = px;
      pivot.position.y = -py;
      sceneAdd(pivot);
      S.decor.push(pivot);
      S.reefBatches.push(swayMesh);
      S.reefSwayers.push({
        img: pivot, rot0: 0, amp: rr(0.035, 0.075),
        rate: rr(0.22, 0.48), phase: rr(0, TAU),
      });
    }
    reefN = 0;
  }

  // ------------------------------------------------------- midwater decor
  // The VISUAL QA TUNE rules from world.js survive verbatim, because they were
  // about READING, not about the renderer:
  //   1. ATMOSPHERE, NOT OBJECTS. Opacity 0.25-0.50. They tint the water at
  //      the edge of vision while remaining behind the gameplay plane.
  //   2. ANCHORED. Nothing free-floats. A silhouette always touches an edge of
  //      the frame it appears in, so it has somewhere to be.
  //   3. SCALE CAPPED. No silhouette exceeds a quarter of the frame width.
  // In 3D they sit at the FURTHEST parallax band (Z_SIL) and are drawn as very
  // transparent dark planes, which is what SPEC3D asks for.
  var SIL_W = 128;
  var CAM_W = 844;
  var SIL_MAX_FRAC = 0.25;
  var SIL_MAX_SCALE = (CAM_W * SIL_MAX_FRAC) / SIL_W;   // = 1.648

  var ZONE_SIL = [
    { shape: 'arch',      n: 6,  scale: [0.9, 1.4], alpha: [0.25, 0.50], tint: 0x0d3d52, anchor: 'floor', inset: 40 },
    { shape: 'kelptower', n: 10, scale: [1.0, 1.6], alpha: [0.25, 0.50], tint: 0x08222f, anchor: 'floor', inset: 60 },
    { shape: 'spire',     n: 10, scale: [1.0, 1.6], alpha: [0.25, 0.45], tint: 0x05131e, anchor: 'floor', inset: 70 },
    { shape: 'chimney',   n: 8,  scale: [1.1, 1.6], alpha: [0.25, 0.40], tint: 0x02070d, anchor: 'floor', inset: 80 },
  ];

  // Rev 6.9: sunken cyber-ruin props (holo billboard slabs, conduit lines,
  // drifting drone silhouettes), one small set PER ZONE mixed into the SAME
  // merged silhouette batch above rather than a batch of their own, so this
  // adds zero draw calls beyond what buildMidwaterDecor already accounts for.
  // Rev 6.12 NEON LANDMARKS: art review's CRITICAL 2 is binding for EVERY
  // zone, not just the abyss, so zone 1 (the sunlit shelf) now gets a small
  // ruin set too instead of none — a shelf-appropriate count/tint, still
  // fewer and dimmer than the deeper zones.
  var ZONE_RUIN = [
    { n: 2, tint: 0x1c3a44 },
    { n: 3, tint: 0x141a2e },
    { n: 4, tint: 0x0d1224 },
    { n: 5, tint: 0x080b18 },
  ];

  // PERF-03. 34 silhouette planes become 4, one merged batch per zone. The
  // per-shape drift was 3 to 7 px on shapes drawn at 0.25 to 0.50 opacity at
  // the furthest parallax band; drifting the whole zone batch by the same few
  // px instead of each shape independently is not a visual change anyone can
  // see, and it is 30 fewer draw calls. Rule 2 (ANCHORED) still holds because
  // the drift is an OFFSET from the placed position, never an accumulation,
  // exactly as before.
  // Art CRITICAL 3: ruin edge-glow quads recorded during the per-zone loop
  // below, then built as ONE shared additive batch after every zone is done.
  var ruinGlowRec = [];

  // Rev 6.13 ART CRITICAL 2 (neon landmarks, take 2): art review's binding
  // complaint on the Rev 6.12 pass was that landmarks were still placed by
  // `rr(0, S.w)` — a per-build RANDOM scatter — so no zone had a GUARANTEED
  // camera-visible landmark; a capture could land in a gap. This function
  // returns DETERMINISTIC authored x-anchors for zone `zi`: the real maze
  // cavern centres in that zone's y-range (mazeCavernX, built once at
  // buildMaze() time from S.rng and frozen for the run) plus each tunnel
  // mouth that connects into or out of the zone. Cavern/tunnel placement is
  // itself the maze's own authored layout, not per-frame randomness, so two
  // callers asking for zone 2's anchors in the same run always get the same
  // list — which is what makes a screenshot of "zone 2" reliably show its
  // landmark rather than gambling on a random x roll landing in frame.
  function zoneLandmarkAnchors(zi, Z) {
    var z = Z[zi];
    var out = [];
    var ci;
    for (ci = 0; ci < mazeCavernX.length; ci++) {
      var cy = mazeCavernY[ci];
      if (cy >= z.yMin && cy < z.yMax) out.push({ x: mazeCavernX[ci], y: cy, r: mazeCavernR[ci] });
    }
    for (var ti = 0; ti < mazeTunnels.length; ti++) {
      var mt = mazeTunnels[ti];
      var my = (mt.y0 + mt.y1) * 0.5;
      if (my >= z.yMin && my < z.yMax) {
        out.push({ x: (mt.x0 + mt.x1) * 0.5, y: my, r: mt.halfW });
      }
    }
    // Deterministic order (by x) so "the Nth anchor" is stable across calls,
    // which matters for the abyss skyline pass below walking them in x order
    // to build a CONTIGUOUS band rather than a jumbled overlap.
    out.sort(function (a, b) { return a.x - b.x; });
    return out;
  }

  // One accent identity per zone, per the fix-round brief: shelf = cyan/
  // magenta holo gates (alternating per gate, ZONE_LANDMARK_ALT below),
  // midwater = electric-cyan conduit pylons, twilight = acid-green data
  // spires, abyss = its own ruin-skyline treatment below (mixed accents on
  // window lights, not a single flat colour).
  var ZONE_LANDMARK_ACCENT = [NEON_CYAN, NEON_CYAN, NEON_ACID, NEON_CYAN];
  // Shelf gates alternate cyan/magenta per the "cyan/magenta holo gate arcs"
  // spec line; other zones stay their one authored accent. Magenta also
  // contrasts far better against the shelf's bright teal water than a
  // second cyan would (see the ART fix-forward note at the shelf landmark
  // body below — additive cyan on bright cyan-ish water reads as a blown
  // white orb, not a distinct accent).
  var ZONE_LANDMARK_ALT = [NEON_MAGENTA, null, null, null];

  // Rev 6.13 ART CRITICAL 2: the abyss's authored landmark is a CONTIGUOUS
  // sunken ruin skyline spanning the band floor — overlapping tower
  // silhouettes with lit windows and a glow crown on each — rather than a
  // handful of scattered props. Deterministic: walks S.w at a fixed step
  // (ABYSS_TOWER_STEP) and every step gets a tower (no random skip), with
  // per-tower height/width/window-count/window-position all keyed off a
  // stable hash of that tower's own step index, so the skyline is identical
  // across rebuilds of the same world but still reads as an irregular
  // silhouette rather than a repeating stamp. Deliberately builds into the
  // SAME `quadReset()`'d batch buildMidwaterDecor's caller already has open
  // for this zone (buildAbyssSkyline is only ever called from inside that
  // per-zone loop), and records glow/window quads into the same shared
  // ruinGlowRec additive batch every other prop uses, so this costs zero
  // extra draw calls beyond what the zone already pays.
  var ABYSS_TOWER_STEP = 130;      // px between tower centres; overlap keeps it contiguous
  var ABYSS_TOWER_W = [150, 260];  // wide enough that neighbours visibly overlap at the step above
  var ABYSS_TOWER_H = [340, 620];  // per fix-round spec: 300-600px band, some spill for variety
  function abyssTowerHash(step, salt) {
    var h = Math.sin(step * 12.9898 + salt * 78.233) * 43758.5453;
    return h - Math.floor(h);
  }
  // Rev 6.13 ART CRITICAL 2 fix-forward: the first pass at this function put
  // a crown-glow strip AND 2-4 window quads on EVERY tower at ~130px
  // spacing, so ~6-7 towers' worth of additive glow overlapped in every
  // frame at once. Additive quads SUM: many overlapping semi-transparent
  // layers climb every channel toward 255 regardless of their individual
  // hue, which is exactly why real captures read as washed pastel
  // lavender/mint rather than distinct bright cyan/magenta/acid. The BODY
  // silhouettes (non-additive) can stay dense/overlapping — that overlap is
  // what makes the skyline read as CONTIGUOUS — but the additive accents
  // need real gaps between them so each one reads as its own bright light
  // instead of blending into a shared wash. Crowns now land on every OTHER
  // tower only, and windows are far smaller and fewer, both changes
  // shrinking total overlapping additive area per frame substantially.
  function buildAbyssSkyline(z, zoneIdx, Z) {
    var isLast = zoneIdx === Z.length - 1;
    var accentCycle = [NEON_CYAN, NEON_MAGENTA, NEON_ACID];
    var step = 0;
    for (var x0 = 0; x0 < S.w; x0 += ABYSS_TOWER_STEP, step++) {
      var h1 = abyssTowerHash(step, 1);
      var h2 = abyssTowerHash(step, 2);
      var h3 = abyssTowerHash(step, 3);
      var tx = x0 + (h1 - 0.5) * ABYSS_TOWER_STEP * 0.6; // jitter within the step, never past it
      var wallY = findWallY(tx, z.yMin + 40, z.yMax - 20);
      var floorY = (wallY !== null ? wallY : (isLast ? S.h : z.yMax)) - h2 * 24;
      var tw = ABYSS_TOWER_W[0] + h2 * (ABYSS_TOWER_W[1] - ABYSS_TOWER_W[0]);
      var th = ABYSS_TOWER_H[0] + h3 * (ABYSS_TOWER_H[1] - ABYSS_TOWER_H[0]);
      // Same fix as the shelf/midwater/twilight landmarks above: keep the
      // skyline in front of Z_TERRAIN[0] (-340, opaque) rather than in the
      // old Z_SIL band (-400ish) where it risked depth-occlusion by the
      // parallax ridge terrain.
      // Same fix as the shelf/midwater/twilight landmarks: the proven
      // Z_KELP band, not a novel z value (see the note at the landmark z
      // computation above for why z=90..140 broke everything else).
      var tz = Z_KELP[0] + (h1 * (Z_KELP[1] - Z_KELP[0])); // towers vary within the band for depth
      var tCy = floorY - th * 0.5;
      var ruinCfg = ZONE_RUIN[zoneIdx] || ZONE_RUIN[ZONE_RUIN.length - 1];
      var tint = ruinCfg ? ruinCfg.tint : 0x080b18;
      var accent = accentCycle[step % accentCycle.length];
      var tBase = envColor(tint, tz, hexNum(z.tint), floorY, 0);
      // Body carries a real accent mix (not just a thin top edge) so the
      // silhouette itself reads as an authored structure, matching the
      // brighter body-tint language used for the other zones' landmarks.
      // Non-additive, so dense overlap between neighbouring towers here is
      // exactly what makes the band read as one contiguous skyline.
      // Neon-noir read: the tower BODY is a dark near-opaque silhouette
      // (scaled well below the zone tint) with only a whisper of accent; the
      // brightness lives in the crowns/windows/top gradient. The prior
      // 0.28-accent 0.6-alpha body rendered as translucent pastel panels -
      // exactly the "pastel Tetris" failure, not cyberpunk.
      var tBody = lerpColor(scaleColor(tBase, 0.34), accent, 0.10);
      var tTop = lerpColor(scaleColor(tBase, 0.55), accent, 0.55);
      quadPush(tx, -tCy, tz, tw, th, 0, (step & 1) ? -1 : 1, tBody, 0.88, tTop);
      // Glow crown: a bright additive cap, but only every THIRD tower (was
      // every other) so neighbouring crowns do not additively overlap into a
      // wash — with towers every 130px, "every other" still put 3-4 crowns
      // in one frame close enough together that their footprints summed to
      // pastel/white in real captures. A frame showing ~6-7 towers still
      // shows 2 lit crowns, comfortably past "any abyss frame shows the
      // skyline is lit," with real gaps between them this time.
      if (step % 3 === 0) {
        ruinGlowRec.push({
          cx: tx, cy: -(floorY - th), z: tz + 1, w: tw * 0.45, h: th * 0.08,
          mirror: (step & 1) ? -1 : 1, color: accent, alpha: 0.55,
        });
      }
      // Lit windows: at most ONE small bright square per tower (was 1-2,
      // larger), further cutting the total additive footprint per frame so
      // the skyline's overall read stays "dark towers with scattered lit
      // windows," not a wash. Keyed off the same per-tower hash for a
      // stable rebuild-to-rebuild layout.
      if (h1 > 0.35) { // most but not all towers get a window
        var wh = abyssTowerHash(step, 10);
        var wv = abyssTowerHash(step, 20);
        var winY = floorY - th * (0.2 + wv * 0.5);
        var winX = tx + (wh - 0.5) * tw * 0.4;
        ruinGlowRec.push({
          cx: winX, cy: -winY, z: tz + 2, w: Math.max(6, tw * 0.045), h: Math.max(6, tw * 0.045),
          mirror: 1, color: accentCycle[(step + 1) % accentCycle.length], alpha: 0.5,
        });
      }
    }
  }

  function buildMidwaterDecor() {
    if (!isThree()) return;
    var Z = zones();
    ruinGlowRec.length = 0;
    for (var i = 0; i < Z.length; i++) {
      var z = Z[i];
      var cfg = ZONE_SIL[i] || ZONE_SIL[ZONE_SIL.length - 1];
      quadReset();
      for (var n = 0; n < cfg.n; n++) {
        var sc = rr(cfg.scale[0], cfg.scale[1]);
        if (sc > SIL_MAX_SCALE) sc = SIL_MAX_SCALE;
        var ceil = cfg.anchor === 'ceil';
        var baseY = ceil ? (z.yMin - cfg.inset)
                         : ((i === Z.length - 1 ? S.h : z.yMax) + cfg.inset);
        var w = SIL_W * sc, h = 256 * sc;
        var x0 = rr(0, S.w);
        // Anchored: the shape's BASE sits on the boundary and it grows away
        // from it, so the centre is half a height clear of the anchor.
        var cy = ceil ? (baseY + h * 0.5) : (baseY - h * 0.5);
        var silZ = rr(Z_SIL[0], Z_SIL[1]);
        var silBase = envColor(cfg.tint, silZ, hexNum(z.tint), baseY, 0);
        var silTop = envColor(cfg.tint, silZ, hexNum(z.tint), baseY - h, 0.12);
        quadPush(x0, -cy, silZ, w, h, 0,
          rnd() < 0.5 ? -1 : 1, silBase, rr(cfg.alpha[0], cfg.alpha[1]), silTop);
      }
      // Cyber-ruin props for this zone, same batch, same anchor language:
      // a holo slab (wide, dim, faint neon top edge), a vertical conduit
      // line (thin, tall), and a drone silhouette (small, drifting height)
      // rotate through cfg.n's index so a zone's n ruin props are varied
      // without extra bookkeeping.
      var ruinCfg = ZONE_RUIN[i];
      var isAbyss = i === Z.length - 1;
      // Rev 6.13 ART CRITICAL 2: ordinary (non-landmark) ruin population
      // stays a random atmosphere scatter, unchanged from Rev 6.12 — this is
      // background texture, not the binding requirement. Only the LANDMARK
      // tier below needs to be deterministic/large/bright.
      var ruinN = ruinCfg ? ruinCfg.n : 0;
      if (ruinCfg) {
        for (var rn = 0; rn < ruinN; rn++) {
          var shapeI = rn % 3;
          var rx = rr(0, S.w);
          var ruinWall = findWallY(rx, z.yMin + 40, z.yMax - 20);
          var floorY = (ruinWall !== null ? ruinWall : (i === Z.length - 1 ? S.h : z.yMax)) - rr(20, 90);
          var rz = rr(Z_SIL[0], Z_SIL[1]);
          var rw, rh;
          if (shapeI === 0) { rw = rr(140, 220); rh = rr(90, 150); }       // holo slab / ruin gate
          else if (shapeI === 1) { rw = rr(14, 22); rh = rr(220, 340); }    // conduit line / pylon
          else { rw = rr(60, 100); rh = rr(30, 50); }                      // drone silhouette
          var ruinCy = floorY - rh * 0.5;
          var ruinBase = envColor(ruinCfg.tint, rz, hexNum(z.tint), floorY, 0);
          var ruinEdge = envColor(ruinCfg.tint, rz, hexNum(z.tint), floorY - rh, 0.10);
          var ruinAccent = neonAccentFor(i * 5 + rn);
          var ruinTop = lerpColor(ruinEdge, ruinAccent, 0.4);
          quadPush(rx, -ruinCy, rz, rw, rh, 0,
            rnd() < 0.5 ? -1 : 1, ruinBase, rr(0.20, 0.38), ruinTop);
          ruinGlowRec.push({
            cx: rx, cy: -(floorY - rh), z: rz + 1, w: rw * 0.95, h: rh * 0.16,
            mirror: rnd() < 0.5 ? -1 : 1, color: ruinAccent, alpha: 0.6,
          });
        }
      }
      // Rev 6.13 ART CRITICAL 2 (binding): the landmark tier is now placed
      // at DETERMINISTIC authored anchors (real maze cavern centres / tunnel
      // mouths in this zone, see zoneLandmarkAnchors above) instead of
      // rr(0, S.w), so a screenshot of any zone is guaranteed to catch at
      // least one, and is LARGE (300-600px per the fix-round spec, not the
      // old 140-440px range) and BRIGHT (additive batch below at alpha
      // .6-.85, well past the ".6+" bar). The abyss does NOT use this loop —
      // it gets its own contiguous ruin-skyline pass (buildAbyssSkyline)
      // below so "a screenshot anywhere in the abyss band shows a skyline"
      // instead of "a screenshot might catch one of N scattered towers".
      if (!isAbyss) {
        var anchors = zoneLandmarkAnchors(i, Z);
        // Raised 4 -> 6: with only 2-4 landmarks spread across a 14400px-wide
        // zone, real captures showed long camera-visible stretches with none
        // in frame at all (each is 360-600px vs multi-thousand-px gaps
        // between anchors). More landmarks per zone means shorter gaps
        // between them, so any ordinary-play camera position is more likely
        // to have one in frame; the budget cost per landmark is one quad
        // plus a couple of glow-batch entries, well inside the tri/draw cap.
        var wantLandmarks = Math.min(6, Math.max(3, anchors.length));
        var baseAccent = ZONE_LANDMARK_ACCENT[i] || NEON_CYAN;
        var altAccent = ZONE_LANDMARK_ALT[i];
        for (var li = 0; li < wantLandmarks; li++) {
          // Alternate cyan/magenta on the shelf (per spec); other zones keep
          // one consistent accent identity across their gates/pylons/spires.
          var accent = (altAccent && (li & 1)) ? altAccent : baseAccent;
          // Deterministic even without any anchors at all (a zone with zero
          // caverns/tunnels in range still gets guaranteed, evenly-spaced
          // landmarks rather than silently having none).
          var anchor = anchors.length ? anchors[li % anchors.length] : null;
          var lx = anchor ? anchor.x : (S.w * (li + 1)) / (wantLandmarks + 1);
          var lWall = findWallY(lx, z.yMin + 40, z.yMax - 20);
          var lFloorY = (lWall !== null ? lWall : (isAbyss ? S.h : z.yMax)) - 30;
          // ART BUG FOUND (verified via direct scene inspection): the
          // original Z_SIL-based z ([-400,-300]) put landmarks behind
          // Z_TERRAIN[0] (-340, opaque), which depth-occluded them for most
          // of the screen. A follow-up attempt moved them to z=90..140 (in
          // FRONT of the rock's own front cap) reasoning that would guarantee
          // no occlusion — but that put them CLOSER to camera than the
          // gameplay plane itself (shark sits at z~0-25, camera at
          // z~185-400), so a 360-480px-wide quad that close subtends a huge
          // screen angle and rendered as a giant washed veil over the whole
          // frame, including the shark. Z_KELP ([-260,-140]) is the proven,
          // already-working band every kelp stalk and rock billboard in the
          // game already renders in (visible on top of cavern rock in every
          // capture throughout this session), so landmarks use that same
          // band rather than a novel value.
          var lz = rr(Z_KELP[0], Z_KELP[1]);
          var lw, lh, lShapeI = i; // shelf(0)=gate, midwater(1)=pylon, twilight(2)=spire
          if (lShapeI === 0) {
            // Holo gate ARC: a wide, tall silhouette so it reads as a
            // freestanding archway rather than a slab.
            lw = rr(360, 480); lh = rr(320, 460);
          } else if (lShapeI === 1) {
            // Conduit pylon: tall and narrower, but still well past the
            // 300px floor per zone.
            lw = rr(70, 110); lh = rr(420, 600);
          } else {
            // Data spire: a tapered tall silhouette, acid-green accent.
            lw = rr(90, 140); lh = rr(380, 560);
          }
          var lCy = lFloorY - lh * 0.5;
          // Rev 6.13 ART fix-forward, second pass: neither a zone-tinted
          // body (first attempt: too close to the water's own colour on the
          // bright shelf, invisible) nor a near-black body (second attempt:
          // blended into rock/background just as badly, ALSO invisible) held
          // up in real captures. A body that is MOSTLY THE ACCENT COLOUR
          // ITSELF, at a strong-but-not-fully-opaque alpha, is contrast-
          // independent of the local water brightness: a saturated cyan/
          // magenta/acid fill reads as a distinct authored structure whether
          // the zone behind it is the dark abyss or the bright shelf,
          // because it is not trying to out-contrast the background by
          // BEING darker or lighter than it — it is a different, saturated
          // HUE the background never has. A darker outline rim is layered on
          // top of that saturated fill so the structure still reads as
          // having depth/edges rather than being a flat colour card.
          var lFillDark = scaleColor(accent, 0.55);
          var lBody = lerpColor(lFillDark, accent, 0.6);
          var lTop = accent;
          // Rev 6.13 ART fix-forward, FOURTH pass: real captures kept
          // measuring washed-white regardless of how many additive glow
          // bands were stacked on top, because this world region also holds
          // unrelated additive systems (a nearby kelp tip's own accent, a
          // god-ray band) that happen to project into the same screen area
          // — additive contributions from DIFFERENT systems still sum in the
          // framebuffer even though each is "correct" in isolation. Rather
          // than keep chasing an additive footprint small enough to never
          // coincide with something else on screen, this alpha is raised
          // (0.6 -> 0.82) so the body's own SATURATED colour is the dominant
          // visual signal on its own, additive glow or not — a solid,
          // clearly-cyan/magenta/acid gate/pylon/spire silhouette that reads
          // even if every other additive system in the frame happens to
          // land on top of it.
          quadPush(lx, -lCy, lz, lw, lh, 0, li & 1 ? -1 : 1, lBody, 0.82, lTop);
          // No additive glow crown for the shelf/midwater/twilight tier: the
          // body fill above is now the sole, reliable colour carrier. (The
          // abyss skyline keeps its own crown/window glow below — that zone
          // is dark enough for additive accents to read as distinct light
          // rather than washing to white.)
        }
      } else {
        // Rev 6.13 ART CRITICAL 2 (abyss): a scattered landmark loop cannot
        // guarantee "any abyss frame shows a skyline" — a capture between
        // two scattered towers sees empty water, which is exactly what
        // 08-abyss measured. buildAbyssSkyline instead walks the WHOLE zone
        // width at a fixed step and emits an overlapping tower silhouette at
        // EVERY step, so the band is visually contiguous end to end; any
        // window into it crosses at least 2-3 overlapping towers.
        buildAbyssSkyline(z, i, Z);
      }
      var mesh = batchMesh(null, false, undefined);
      if (!mesh) continue;
      sceneAdd(mesh);
      S.decor.push(mesh);
      // Amplitude is deliberately tiny: these shapes are ANCHORED and must
      // stay rooted. This is a bounded drift of distance, not a floating shape.
      S.drifters.push({
        img: mesh, x0: 0, y0: 0,
        ampX: rr(SIL_DRIFT[0], SIL_DRIFT[1]),
        ampY: rr(SIL_DRIFT[0], SIL_DRIFT[1]) * 0.4,
        rate: rr(SIL_RATE[0], SIL_RATE[1]),
        phase: rr(0, TAU),
      });
    }
    // Art CRITICAL 3: build the shared ruin edge-glow additive batch now that
    // every zone's props have been recorded. One draw call for the whole
    // system, no per-zone/per-prop cost.
    // Rev 6.13 ART CRITICAL 2: same fog-dilution root cause as the kelp tip
    // batch above — this is the layer every zone's neon landmark identity
    // (holo gates, conduit pylons, data spires, abyss skyline crowns/
    // windows) rides on, so it is the single most important place in the
    // whole module for fog to be disabled. Without this, the abyss skyline's
    // additive crowns/windows were being fogged toward the abyss's own dark
    // fog colour, which is exactly why real captures showed pastel/washed
    // squares instead of a bright lit skyline.
    if (ruinGlowRec.length) {
      quadReset();
      for (var gi = 0; gi < ruinGlowRec.length; gi++) {
        var gr = ruinGlowRec[gi];
        quadPush(gr.cx, gr.cy, gr.z, gr.w, gr.h, 0, gr.mirror, gr.color, gr.alpha);
      }
      var glowMesh = batchMesh(null, true, undefined, false, { fog: false });
      if (glowMesh) {
        meshName(glowMesh, 'RF ruin edge glow additive');
        sceneAdd(glowMesh);
        S.decor.push(glowMesh);
      }
    }
  }

  function buildBackground() {
    buildGradientSheet();
    // Rev 6: the maze layout must exist before buildTerrain, so the parallax
    // ridge heightlines can re-seed off the same cavern x-positions (6.4:
    // "distant ridges echo it").
    buildMaze();
    buildTerrain();
    buildNearRock();
    buildSeams();
    buildMidwaterDecor();
    buildDecor();
    buildReef();
    buildRays();
    buildCaustics();
    buildSurface();
    // Fog is owned here and handed to the scene; applyZoneAtmo retunes it
    // every step from the camera's depth.
    if (isThree() && THREE.FogExp2) {
      S.fog = new THREE.FogExp2(0x9fd4e8, FOG_D0);
      if (S.scene && typeof S.scene === 'object') { try { S.scene.fog = S.fog; } catch (e) {} }
    }
    if (isThree() && THREE.Color) {
      S.clearCol = new THREE.Color(0x1b4d66);
      S.atmoA = new THREE.Color();
      S.atmoB = new THREE.Color();
    }
  }

  // ============================================================ POOLS (sim)
  function makeEntity() {
    return {
      active: false, id: 0, kind: 'prey', defId: null, def: null,
      tier: 1, x: 0, y: 0, vx: 0, vy: 0, angle: 0, _biteCd: 0,
      _tint: 0, _goldenPackId: 0, _schoolCdSeen: 0,
      hp: 1, maxHp: 1, r: 12, score: 0, coins: 0,
      st: {
        frozenT: 0, stunT: 0, burnT: 0, poisonT: 0, slowT: 0, cookedBy: null,
        burnDmg: 0, poisonDmg: 0, fireImmune: false, toxinImmune: false,
        packId: 0, jitterT: 0, jx: 0, jy: 0, mode: 'wander',
        inflated: false, biteCd: 0, life: 0, born: 0, drift: 0, puffS: 1,
      },
      // `sprite` keeps the world.js field NAME so any lane reading e.sprite
      // still finds the entity's visual. In 3D it holds a THREE.Object3D.
      sprite: null,
      rig: null,       // RF.Art3D.buildShark record while this is an NPC shark
      _view: null,     // the view-pool key this entity checked its visual out of
      _viewRec: null,  // the checked-out {obj, rig} record, returned on release
      _idx: -1,        // index into S.entities while active
      _cell: -1,       // spatial hash cell key while active
    };
  }

  // Pool objects do NOT get a three object at build time: a billboard's
  // geometry depends on which def lands in the slot.
  //
  // VIEW POOLING. The first cut cached a slot's visual ON THE SLOT, keyed by
  // def, on the theory that a slot which had held a minnow before could reuse
  // that minnow for free. The no-alloc selftest caught it: that cache is
  // POOL SIZE x ROSTER SIZE in the worst case (140 slots x ~20 defs), and a
  // long run that wanders through every zone approaches the worst case, so the
  // scene object count climbed past 1600 and kept climbing.
  //
  // Views are therefore pooled GLOBALLY, per view key, in S.views. A view key
  // owns a small free-list of ready Object3Ds; an entity checks one out on
  // spawn and returns it on release. The high-water mark for a key is the most
  // entities of that def that were ever alive AT ONCE, which the entity budget
  // already caps. The total is bounded by ENTITY_BUDGET.total plus one idle
  // view per key, not by the product.
  function buildPool(total) {
    for (var i = 0; i < total; i++) {
      var e = makeEntity();
      S.pool.push(e);
      S.free.push(e);
    }
  }

  // Check a view out of the global per-key pool, building one only when every
  // existing view of that key is already in use.
  function viewAcquire(viewKey, e) {
    var instanced = e && e.kind === 'prey' && S.instancedByDef && S.instancedByDef[e.defId];
    var fishSource = e && e.kind === 'prey' && S.fishSources && S.fishSources[e.defId];
    if (instanced && instanced.count < instanced.capacity) {
      var ibank = S.views[viewKey];
      if (!ibank) ibank = S.views[viewKey] = { free: [], live: 0, peak: 0, instanced: instanced };
      var islot = instanced.count++;
      instanced.mesh.count = instanced.count;
      instanced.slotEntities[islot] = e;
      ibank.live++;
      if (ibank.live > ibank.peak) ibank.peak = ibank.live;
      var irec = instanced.records[islot];
      irec.slot = islot;
      irec.entity = e;
      return irec;
    }
    var bank = S.views[viewKey];
    if (!bank) { bank = S.views[viewKey] = { free: [], live: 0, peak: 0 }; }
    bank.live++;
    if (bank.live > bank.peak) bank.peak = bank.live;
    var rec = bank.free.pop();
    if (rec) { S.viewsIdle--; return rec; }
    // Nothing spare: build one. Bounded by the peak concurrent count of this
    // def, which the entity budget caps.
    var obj = null, rig = null;
    if (e.kind === 'pickup') {
      obj = makeCoin();
    } else if (e.kind === 'buffpickup') {
      // No new texture per 6.7/6.9: the same glowing vertex-coloured fallback
      // quad the coin uses, tinted from the buff row's own accent colour
      // (carried on e.def.sil.palette.base by spawnBuffAt) rather than a bake.
      obj = fallbackMesh(paletteBase(e.def), true);
    } else if (e.kind === 'predator') {
      rig = makeSharkRig(e.def);
      obj = rig ? rig.group : makeBillboard(e.def, e.kind);
    } else {
      // When the fish loft exists but instancing is unavailable, retain the
      // loft as a bounded per-entity mesh fallback before dropping to a card.
      obj = makeFishMesh(e.def) || makeBillboard(e.def, e.kind);
    }
    if (!obj) return null;
    if (!rig) privatiseMaterial(obj);
    sceneAdd(obj);
    // RF.Art3D.billboard sets scale.x to the BAKE'S OWN aspect ratio
    // (canvas width / height) and leaves scale.y at 1. That ratio is the only
    // record of the art's true proportions, and applySprite is about to
    // overwrite both axes with the sim's display size, so it is captured here
    // while it is still readable. Without this every billboard would be forced
    // to the 2:1 body ratio the 2D fallback assumed, which squashes a tall
    // bake (a jelly, a puffer, a ray) and stretches a long one.
    var aspect = 0.52;
    if (obj.scale && obj.scale.x > 0 && obj.scale.y > 0) {
      var a = obj.scale.y / obj.scale.x;
      if (isFinite(a) && a > 0.05 && a < 20) aspect = a;
    }
    return {
      obj: obj,
      rig: rig,
      aspect: aspect,
      localLength: fishSource ? fishSource.localLength : 0,
      paletteId: fishSource ? fishSource.paletteId : null,
    };
  }

  // View retention policy. Four caps were measured; the failures are the
  // argument for the one that shipped, so they are recorded rather than
  // rediscovered by the next person who thinks this is over-built.
  //
  //   NO cap        Each key keeps its own historical peak forever. 29 keys
  //                 reached 371 idle views against a 140 slot pool and were
  //                 still creeping after 2400 updates.
  //   FLAT cap 6    Below the true concurrent peak of a common def, so views
  //                 were disposed and immediately rebuilt. Scene creation went
  //                 UP, 684 to 3007 and climbing: the cap turned a bounded
  //                 cache into a per-frame allocator.
  //   GLOBAL budget Pool size plus a margin, shared across all keys. Sounds
  //                 tight, thrashes hardest: 6953 objects and climbing,
  //                 because a rare def's release evicts a common def's view
  //                 that the very next frame needs back.
  //   PER-KEY peak  What ships. Each key retains at most the most views of
  //                 THAT key ever alive at once, plus a hard ceiling below.
  //
  // The per-key peak is the only rule that never disposes a view its own def
  // will need again, which is what keeps steady-state creation at zero. Peaks
  // are stochastic, so they keep nudging upward by luck for a long time and
  // sum past the pool size; the CEILING below is what turns that slow creep
  // into a hard bound, and it sits well above any peak actually observed so it
  // never causes the thrash the global budget did.
  var VIEW_KEY_CEIL = 64;      // no single key may retain more idle than this

  function copyInstancedSlot(batch, from, to) {
    if (from === to) return;
    var src = batch.mesh.instanceMatrix && batch.mesh.instanceMatrix.array;
    if (src) {
      for (var i = 0; i < 16; i++) src[to * 16 + i] = src[from * 16 + i];
    }
    var phase = batch.phase.array, amp = batch.amp.array, colors = batch.colors.array;
    phase[to] = phase[from];
    amp[to] = amp[from];
    colors[to * 3] = colors[from * 3];
    colors[to * 3 + 1] = colors[from * 3 + 1];
    colors[to * 3 + 2] = colors[from * 3 + 2];
  }

  function releaseInstanced(rec) {
    var batch = rec.batch;
    if (!batch || batch.count <= 0) return;
    var slot = rec.slot;
    var last = batch.count - 1;
    var moved = batch.slotEntities[last];
    if (slot !== last && moved) {
      copyInstancedSlot(batch, last, slot);
      batch.slotEntities[slot] = moved;
      if (moved._viewRec) moved._viewRec.slot = slot;
    }
    batch.slotEntities[last] = null;
    batch.count = last;
    batch.mesh.count = last;
    batch.dirty = true;
    rec.slot = -1;
    rec.entity = null;
  }

  function viewRelease(viewKey, rec) {
    if (!viewKey || !rec) return;
    var bank = S.views[viewKey];
    if (!bank) { bank = S.views[viewKey] = { free: [], live: 0, peak: 0 }; }
    if (rec.instanced) {
      releaseInstanced(rec);
      if (bank.live > 0) bank.live--;
      return;
    }
    if (bank.live > 0) bank.live--;
    setVisible(rec.obj, false);
    var cap = bank.peak < VIEW_KEY_CEIL ? bank.peak : VIEW_KEY_CEIL;
    if (bank.free.length >= cap) { viewDispose(rec); return; }
    bank.free.push(rec);
    S.viewsIdle++;
  }

  // Detach one view from the scene and free anything it owns privately.
  function viewDispose(rec) {
    var o = rec && rec.obj;
    if (!o) return;
    if (o.parent && typeof o.parent.remove === 'function') {
      try { o.parent.remove(o); } catch (e) { /* stub scene */ }
    } else if (S.scene && typeof S.scene.remove === 'function') {
      try { S.scene.remove(o); } catch (e) { /* stub scene */ }
    }
    // Only the PRIVATE material clone is disposed. The geometry and the shared
    // materials in S.matCache are referenced by every other view of this def
    // and must survive.
    if (o.material && o.material.__rfPrivate && typeof o.material.dispose === 'function') {
      try { o.material.dispose(); } catch (e) { /* already disposed */ }
    }
    S.viewsDisposed++;
  }

  function acquire() {
    var e = S.free.pop();
    if (!e) return null;
    e.active = true;
    e._biteCd = 0;
    e._tint = 0;
    e._goldenPackId = 0;
    e._schoolCdSeen = 0;
    e.id = S.nextId++;
    e._idx = S.entities.length;
    S.entities.push(e);
    return e;
  }

  function release(e) {
    if (!e || !e.active) return;
    e.active = false;
    gridRemove(e);
    // Swap-pop keeps S.entities dense with zero allocation.
    var last = S.entities[S.entities.length - 1];
    S.entities[e._idx] = last;
    if (last) last._idx = e._idx;
    S.entities.pop();
    e._idx = -1;
    // Return the view to its key's bank so the next entity of this def reuses
    // it. The object stays parented to the scene, just hidden: re-adding and
    // removing from a THREE.Scene every spawn would be the very per-frame
    // churn the no-alloc law forbids.
    if (e._viewRec) { viewRelease(e._view, e._viewRec); e._viewRec = null; }
    e.sprite = null;
    e.rig = null;
    e._view = null;
    S.free.push(e);
  }

  function resetSt(st) {
    st.frozenT = 0; st.stunT = 0; st.burnT = 0; st.poisonT = 0; st.slowT = 0;
    st.cookedBy = null; st.packId = 0; st.jitterT = 0; st.jx = 0; st.jy = 0;
    st.burnDmg = 0; st.poisonDmg = 0; st.fireImmune = false; st.toxinImmune = false;
    st.mode = 'wander'; st.inflated = false; st.biteCd = 0; st.life = 0;
    st.born = 0; st.drift = 0;
    // Rev 4 eased puffer scale. Reset so a recycled pool object never starts
    // life half-inflated from whatever it used to be.
    st.puffS = 1;
    st.faceA = undefined;
    // Rev 6.5 mouth-proximity panic, distinct from the sight-based flee mode
    // above (panicT can be running while mode is still 'wander' or 'flee').
    st.panicT = 0;
    st.panicJx = 0; st.panicJy = 0; st.panicPhase = 0;
    // Rev 6.12 PREY PANIC CUE: separate from panicT (which is a MOVEMENT/
    // bend cue, per Rev 6.5). lungeTargetFlashT is the VISUAL flash-toward-
    // white/red cue for whichever prey is specifically the player's current
    // lunge-captured target, so movement thrash alone is not the only tell.
    st.lungeTargetFlashT = 0;
  }

  // Check this entity's visual out of the global view pool and set it up for
  // the def the entity now holds.
  function applySprite(e) {
    var viewKey = (e.kind === 'pickup') ? '__coin' : (e.kind + ':' + (e.defId || '?'));
    // A slot is always released before it is re-acquired, so there is never a
    // stale view to hand back here; the guard is belt and braces.
    if (e._viewRec && e._view !== viewKey) { viewRelease(e._view, e._viewRec); e._viewRec = null; }
    var rec = e._viewRec || viewAcquire(viewKey, e);
    e._view = viewKey;
    e._viewRec = rec || null;
    e.sprite = rec ? rec.obj : null;
    e.rig = rec ? rec.rig : null;
    if (!rec || !rec.obj) return;
    if (rec.instanced) {
      // The shared mesh is already attached once at init. Seed this new slot
      // immediately so an entity spawned by the late spawner cannot display
      // the previous occupant's matrix for one render.
      animateInstancedEntity(e, S.animT);
      return;
    }
    var obj = rec.obj;
    setVisible(obj, true);
    setPos(obj, e.x, e.y, Z_PLAY);
    clearTint(obj);
    setOpacity(obj, 1);
    var len = e.kind === 'pickup' ? 20 : renderScaleFor(e.def, e.kind, rec.localLength);
    // A rig group is already modelled at world scale by lane D3, so only
    // billboards are scaled here. Length is the sim's authority (it derives
    // from the collision radius, so the art can never disagree with the
    // hitbox); height follows the bake's own aspect.
    if (!rec.rig) setScale(obj, len, len * (rec.aspect || 0.52));
  }

  // ---------------------------------------------------------- spatial hash
  function cellOf(x, y) {
    var cx = clamp(Math.floor(x / CELL), 0, S.cols - 1);
    var cy = clamp(Math.floor(y / CELL), 0, S.rows - 1);
    return cy * S.cols + cx;
  }
  function gridInsert(e) {
    var key = cellOf(e.x, e.y);
    e._cell = key;
    var bucket = S.grid[key];
    if (!bucket) { bucket = S.grid[key] = []; }
    bucket.push(e);
  }
  function gridRemove(e) {
    if (e._cell < 0) return;
    var bucket = S.grid[e._cell];
    if (bucket) {
      var i = bucket.indexOf(e);
      if (i >= 0) { bucket[i] = bucket[bucket.length - 1]; bucket.pop(); }
    }
    e._cell = -1;
  }
  // Incremental: only entities that crossed a cell boundary move buckets.
  function gridUpdate(e) {
    var key = cellOf(e.x, e.y);
    if (key === e._cell) return;
    gridRemove(e);
    e._cell = key;
    var bucket = S.grid[key];
    if (!bucket) { bucket = S.grid[key] = []; }
    bucket.push(e);
  }

  function pointHit(e, x, y, r, r2) {
    var dx = e.x - x, dy = e.y - y;
    return dx * dx + dy * dy <= r2;
  }

  function bodyHit(e, x, y, r) {
    var dx = e.x - x, dy = e.y - y;
    var reach = r + e.r;
    return dx * dx + dy * dy <= reach * reach;
  }

  // One spatial-hash walk backs both center queries and eating overlap. The
  // predicate is a stable function reference, so this remains allocation-free
  // in the fixed step while their semantics stay visibly separate.
  function queryHash(x, y, r, kindFilter, predicate, cellPad) {
    scratchQuery.length = 0;
    if (!S.inited) return scratchQuery;
    var r2 = r * r;
    var scanR = r + (cellPad || 0);
    var x0 = clamp(Math.floor((x - scanR) / CELL), 0, S.cols - 1);
    var x1 = clamp(Math.floor((x + scanR) / CELL), 0, S.cols - 1);
    var y0 = clamp(Math.floor((y - scanR) / CELL), 0, S.rows - 1);
    var y1 = clamp(Math.floor((y + scanR) / CELL), 0, S.rows - 1);
    var isArr = Array.isArray(kindFilter);
    for (var cy = y0; cy <= y1; cy++) {
      for (var cx = x0; cx <= x1; cx++) {
        var bucket = S.grid[cy * S.cols + cx];
        if (!bucket) continue;
        for (var i = 0; i < bucket.length; i++) {
          var e = bucket[i];
          if (!e.active) continue;
          if (kindFilter) {
            if (isArr) { if (kindFilter.indexOf(e.kind) < 0) continue; }
            else if (e.kind !== kindFilter) continue;
          }
          if (predicate(e, x, y, r, r2)) scratchQuery.push(e);
        }
      }
    }
    return scratchQuery;
  }

  /* query(x, y, r, kindFilter)
   * kindFilter: undefined/null (any), a kind string, or an array of kinds.
   * RESULTS ARE VALID UNTIL THE NEXT query() CALL. The returned array is a
   * single reused scratch buffer; copy anything you need to keep.
   */
  World.query = function (x, y, r, kindFilter) {
    return queryHash(x, y, r, kindFilter, pointHit);
  };

  /* eatQuery(x, y, r)
   * Circle-vs-circle overlap for the player mouth. Unlike query(), the radius
   * of each entity participates in the hit test, so a body may overlap the
   * mouth while its center remains outside the sensor radius.
   */
  World.eatQuery = function (x, y, r) {
    return queryHash(x, y, r, null, bodyHit, MAX_ENTITY_R);
  };

  // ------------------------------------------------------------- spawning
  function kindForDef(def) {
    if (!def) return 'prey';
    if (def.kind === 'hazard') return 'hazard';
    if (def.npc !== undefined) return 'predator';
    return def.kind || 'prey';
  }

  function spawnOne(defId, x, y, packId) {
    var def = defOf(defId);
    if (!def) return null;
    var e = acquire();
    if (!e) return null;
    var kind = kindForDef(def);
    e.kind = kind;
    e.defId = defId;
    e.def = def;
    e.tier = typeof def.tier === 'number' ? def.tier : 1;
    e.x = clamp(x, 8, S.w - 8);
    // Rev 5 spawner bounds: nothing is ever placed above the surface ceiling
    // (plus margin, so a spawn does not begin life already touching it) nor
    // below the seafloor. This is the LAST gate, so it also covers
    // spawnBurst's jitter and any ability or debug spawn from another lane.
    e.y = clamp(y, SURFACE_Y + SURFACE_MARGIN, S.h - SEAFLOOR_MARGIN);
    var stats = def.stats || null;
    e.maxHp = stats ? stats.hp : (def.hp || 1);
    e.hp = e.maxHp;
    e.r = radiusFor(def, kind);
    e.score = typeof def.score === 'number' ? def.score : Math.round(e.tier * 40);
    e.coins = typeof def.coins === 'number' ? def.coins : Math.max(1, Math.round(e.tier * 3));
    resetSt(e.st);
    // Rev 6.11 NURSERY LAW: stamp the zone a predator was actually spawned
    // into as its home band (after resetSt, which does not touch this field),
    // so predatorAI can leash off pursuit once it has since drifted (chased/
    // fled) into a different zone than the one it belongs to, against a
    // nursery-tier player.
    e.st.homeZoneId = kind === 'predator' ? (World.zoneAt(e.y) ? World.zoneAt(e.y).id : 0) : 0;
    e._biteCd = 0;
    e.st.packId = packId || 0;
    e.st.drift = rr(0, TAU);
    var spd = stats ? stats.speed : (def.speed || 0);
    var a = rr(0, TAU);
    e.vx = Math.cos(a) * spd * 0.4;
    e.vy = Math.sin(a) * spd * 0.4;
    e.angle = a;
    applySprite(e);
    gridInsert(e);
    return e;
  }

  // Rev 6.12 PUBLIC SPAWN LAW: World.spawnBurst is the one PUBLIC multi-entity
  // spawn entry (called by abilities/debug/dev tooling, not just the internal
  // spawner), and code review found it went straight to spawnOne — only the
  // surface/seafloor clamp, none of runSpawner's nursery-distance, SDF-
  // clearance, or region checks. That let a public/debug burst place a
  // predator on top of a nursery-tier player or embedded in rock. This
  // resamples the SAME (jittered) request point up to SDF_RESAMPLE_TRIES
  // times against the identical three gates runSpawner enforces before
  // calling spawnOne, and — unlike ringPointValid's "fall back to the last
  // sample tried" contract, which is safe because a ring point is already
  // constrained to the swimmable band around a live camera — SKIPS that one
  // spawn entirely if every try fails, since an arbitrary caller-supplied
  // point (e.g. an ability firing at a rock wall) has no such guarantee and
  // resampling near clearly-bad rock could still land on something worse.
  function burstPointValid(x, y, def, kind, playerRegion, nurseryPlayer, out) {
    var needR = radiusFor(def, kind) + SDF_SPAWN_CLEAR;
    for (var tries = 0; tries < SDF_RESAMPLE_TRIES; tries++) {
      // First try is the exact requested (jittered) point; subsequent tries
      // widen the resample radius slightly so a bad point has real room to
      // relocate rather than repeatedly re-sampling the same small jitter.
      var jitterR = 70 + tries * 40;
      out[0] = clamp(x + rr(-jitterR, jitterR), 8, S.w - 8);
      out[1] = clamp(y + rr(-jitterR, jitterR), SURFACE_Y + SURFACE_MARGIN, S.h - SEAFLOOR_MARGIN);
      if (nurseryPlayer && withinNursery(nurseryPlayer, out[0], out[1])) continue;
      if (!S.sdf) return true; // no maze built (e.g. bare selftest stub): accept
      var sdfHere = World.terrainSDF(out[0], out[1]);
      if (sdfHere <= needR) continue;
      if (playerRegion && World.regionAt(out[0], out[1]) !== playerRegion) continue;
      return true;
    }
    return false; // exhausted tries; caller must SKIP this spawn, never misplace
  }
  var burstOut = [0, 0];
  World.spawnBurst = function (defId, x, y, n) {
    var out = 0;
    var packId = S.packSeq++;
    packAcquire(packId);
    var def = defOf(defId);
    var kind = def ? kindForDef(def) : 'prey';
    var player = RF.ctx && RF.ctx.player;
    // Rev 6.12 NURSERY LAW scoping fix: runSpawner's nursery gate only ever
    // applies to the PREDATOR roll (prey/pickups are never nursery-gated
    // there), so this public path must match that scope exactly rather than
    // blocking every kind near a low-tier player.
    var nurseryPlayer = (kind === 'predator' && player && (player.tier || 1) <= NURSERY_TIER) ? player : null;
    var playerRegion = (S.sdf && player) ? World.regionAt(player.x, player.y) : 0;
    for (var i = 0; i < n; i++) {
      if (def && !burstPointValid(x, y, def, kind, playerRegion, nurseryPlayer, burstOut)) continue;
      var px = def ? burstOut[0] : x + rr(-70, 70);
      var py = def ? burstOut[1] : y + rr(-50, 50);
      var e = spawnOne(defId, px, py, packId);
      if (!e) break;
      out++;
    }
    return out;
  };

  function pickWeighted(list) {
    // list rows are [defId, weight] per RFD.ZONES.spawns.
    var total = 0, i;
    weightScratch.length = 0;
    for (i = 0; i < list.length; i++) {
      var w = Array.isArray(list[i]) ? list[i][1] : list[i].w;
      if (!(w > 0)) w = 0;
      total += w;
      weightScratch.push(total);
    }
    if (total <= 0) return null;
    var roll = rnd() * total;
    for (i = 0; i < weightScratch.length; i++) {
      if (roll <= weightScratch[i]) {
        return Array.isArray(list[i]) ? list[i][0] : list[i].defId;
      }
    }
    return Array.isArray(list[0]) ? list[0][0] : list[0].defId;
  }

  // NPC shark table, built once from RFD.SHARKS rows carrying npc weights.
  function buildNpcTables() {
    var Sh = (D().SHARKS) || [];
    var byZone = {};
    for (var i = 0; i < Sh.length; i++) {
      var s = Sh[i];
      if (!s.npc || !s.npc.zones) continue;
      for (var j = 0; j < s.npc.zones.length; j++) {
        var z = s.npc.zones[j];
        if (!byZone[z]) byZone[z] = [];
        byZone[z].push([s.id, s.npc.weight || 1]);
      }
    }
    S.npcByZone = byZone;
  }

  function onscreenCount(camX, camY) {
    var n = 0;
    for (var i = 0; i < S.entities.length; i++) {
      var e = S.entities[i];
      if (e.kind === 'pickup' || e.kind === 'buffpickup') continue;
      var dx = e.x - camX, dy = e.y - camY;
      if (dx * dx + dy * dy < DESPAWN * DESPAWN) n++;
    }
    return n;
  }

  function ringPoint(camX, camY, out) {
    var a = rr(0, TAU);
    var d = rr(SPAWN_MIN, SPAWN_MAX);
    out[0] = clamp(camX + Math.cos(a) * d, 40, S.w - 40);
    // Rev 5: the ring is clamped to the swimmable band BEFORE zoneAt() reads
    // it, so a ring point that lands in the sky picks the shallow zone's spawn
    // table at a legal depth rather than being pushed down afterwards.
    out[1] = clamp(camY + Math.sin(a) * d, SURFACE_Y + SURFACE_MARGIN, S.h - SEAFLOOR_MARGIN);
  }

  var ringOut = [0, 0];

  // Rev 6 (6.4): resample a ring point up to SDF_RESAMPLE_TRIES times,
  // requiring sdf > radiusFor(def) + SDF_SPAWN_CLEAR AND the same flood-fill
  // region as the player, so nothing spawns embedded in rock or sealed behind
  // a wall the player cannot reach. Falls back to the LAST sample tried
  // (never fails outright) so a spawner call never silently does nothing;
  // the caller still owns whether to actually use the result.
  function ringPointValid(camX, camY, def, kind, playerRegion, out, zoneId) {
    var needR = radiusFor(def, kind) + SDF_SPAWN_CLEAR;
    for (var tries = 0; tries < SDF_RESAMPLE_TRIES; tries++) {
      ringPoint(camX, camY, out);
      // The def was chosen FROM a zone's table; a resample that drifts into a
      // different depth band would place it out of habitat (a zone-2 great
      // white re-rolled into the zone-1 nursery ON the player - real defect).
      if (zoneId) {
        var zHere = World.zoneAt(out[1]);
        if (!zHere || zHere.id !== zoneId) continue;
      }
      if (!S.sdf) return true; // no maze built (e.g. bare selftest stub): accept
      var sdfHere = World.terrainSDF(out[0], out[1]);
      if (sdfHere <= needR) continue;
      if (playerRegion && World.regionAt(out[0], out[1]) !== playerRegion) continue;
      return true;
    }
    return false; // exhausted tries; caller must SKIP the spawn, never misplace
  }

  // Rev 6.11 NURSERY LAW helper: true when (x,y) is within NURSERY_R of the
  // given player, in ANY zone/region (no region/zone gate at all, unlike
  // ringPointValid's habitat checks).
  function withinNursery(player, x, y) {
    if (!player) return false;
    var dx = x - player.x, dy = y - player.y;
    return dx * dx + dy * dy < NURSERY_R * NURSERY_R;
  }

  function runSpawner(ctx, camX, camY) {
    var B = budget();
    // Rev 6.12 BUFF CADENCE (binding): the ambient buff roll runs BEFORE
    // EVERY early return in this function - including the pool-reserve
    // check below, which review round 3 found still suppressed the roll in
    // crowded late runs (S.free hovers at the reserve while the screen is
    // full - exactly when a reward capsule matters most). The roll needs
    // only ONE free slot; BUFF_LIVE_CAP + the drop cooldown bound the rate.
    if (rnd() < BUFF_AMBIENT_CHANCE) {
      if (S.free.length > 0) {
        var buffRegion = S.sdf ? World.regionAt(camX, camY) : 0;
        if (ringPointValid(camX, camY, { tier: 0 }, 'buffpickup', buffRegion, ringOut)) {
          spawnBuffAt(ringOut[0], ringOut[1]);
        }
      }
      return;
    }
    if (S.free.length <= 4) return;
    var playerRegion = S.sdf ? World.regionAt(camX, camY) : 0;
    var live = onscreenCount(camX, camY);
    if (live >= B.onscreen) return;
    // One spawn attempt per step keeps the cost flat; the ring fills quickly.
    ringPoint(camX, camY, ringOut);
    var z = World.zoneAt(ringOut[1]);
    if (!z) return;
    // Predator roll first: rarer, and only where the roster allows it.
    // Rev 6.11 NURSERY LAW: a fresh/low-tier player (tier <= NURSERY_TIER) is
    // completely off-limits to predator spawns within NURSERY_R, regardless
    // of zone or region, so a new run is never ambushed at the ring edge.
    var nurseryPlayer = ctx.player && (ctx.player.tier || 1) <= NURSERY_TIER;
    var npcList = S.npcByZone[z.id];
    if (npcList && npcList.length && rnd() < 0.12 &&
      !(nurseryPlayer && withinNursery(ctx.player, ringOut[0], ringOut[1]))) {
      var npcId = pickWeighted(npcList);
      var npcDef = defOf(npcId);
      if (ringPointValid(camX, camY, npcDef, 'predator', playerRegion, ringOut, z.id) &&
        !(nurseryPlayer && withinNursery(ctx.player, ringOut[0], ringOut[1]))) {
        spawnOne(npcId, ringOut[0], ringOut[1], 0);
      }
      return;
    }
    var defId = pickWeighted(z.spawns || []);
    if (!defId) return;
    var def = defOf(defId);
    if (!def) return;
    if (!ringPointValid(camX, camY, def, kindForDef(def), playerRegion, ringOut, z.id)) return;
    var n = 1;
    if (def.packMin) n = ri(def.packMin, def.packMax || def.packMin);
    n = Math.min(n, B.onscreen - live, S.free.length - 2);
    if (n < 1) return;
    if (n === 1) {
      spawnOne(defId, ringOut[0], ringOut[1], 0);
    } else {
      World.spawnBurst(defId, ringOut[0], ringOut[1], n);
    }
  }

  // ================================================================== AI
  function packVec(packId, dt) {
    if (!packId) return null;
    var p = S.packs.get(packId);
    if (!p || p.owner !== packId) return null;
    p.t -= dt;
    if (p.t <= 0) {
      var a = rr(0, TAU);
      p.dx = Math.cos(a);
      p.dy = Math.sin(a) * 0.55;
      p.t = rr(2.5, 6);
    }
    return p;
  }

  function tierGap(playerTier, entTier) {
    return playerTier - entTier;
  }

  // Rev 5: every steer TARGET is clamped under the surface too. Containment in
  // integrate() alone would work, but a fish whose goal point is in the sky
  // presses against the ceiling and reads as stuck. Clamping the goal makes it
  // choose a level or downward path on its own, so the reflection is a rare
  // correction rather than the thing you watch.
  function steer(e, tx, ty, speed, dt, turn) {
    if (ty < SURFACE_Y + SURFACE_MARGIN) ty = SURFACE_Y + SURFACE_MARGIN;
    else if (ty > S.h - 20) ty = S.h - 20;
    var dx = tx - e.x, dy = ty - e.y;
    var d = Math.sqrt(dx * dx + dy * dy) || 1;
    var wantX = (dx / d) * speed, wantY = (dy / d) * speed;
    steerWhisker(e, wantX, wantY);
    var k = clamp((turn || 4) * dt, 0, 1);
    e.vx += (steerScratchX - e.vx) * k;
    e.vy += (steerScratchY - e.vy) * k;
  }

  // Rev 6 (6.4) NPC steer whisker: probe the SDF one whisker-length ahead
  // along the entity's CURRENT heading (not the want-vector, so a fish about
  // to reverse into a wall still gets warned by where it is actually going).
  // When the probe reads closer than r+40 to rock, the want-vector is rotated
  // along the wall tangent (perpendicular to the SDF gradient at the probe
  // point) rather than left to walk straight into resolveBody's push-out
  // every frame, which reads as a fish "steering" around a cavern wall
  // instead of sliding along it. Result lands in steerScratchX/Y so steer()
  // stays allocation-free.
  var steerScratchX = 0, steerScratchY = 0;
  function steerWhisker(e, wantX, wantY) {
    steerScratchX = wantX; steerScratchY = wantY;
    if (!S.sdf) return;
    var heading = e.angle || 0;
    var hx = Math.cos(heading), hy = Math.sin(heading);
    var px = e.x + hx * WHISKER_DIST, py = e.y + hy * WHISKER_DIST;
    var d = World.terrainSDF(px, py);
    var r = (e.r || 14) + WHISKER_TURN_R;
    if (d >= r) return;
    var dxp = World.terrainSDF(px + GRAD_EPS, py);
    var dxm = World.terrainSDF(px - GRAD_EPS, py);
    var dyp = World.terrainSDF(px, py + GRAD_EPS);
    var dym = World.terrainSDF(px, py - GRAD_EPS);
    var gx = (dxp - dxm) / (2 * GRAD_EPS);
    var gy = (dyp - dym) / (2 * GRAD_EPS);
    var glen = Math.sqrt(gx * gx + gy * gy);
    if (!(glen > 1e-6)) return;
    // Wall tangent: rotate the gradient (which points toward open water) 90
    // degrees; pick the sign that keeps the want-vector's original forward
    // sense so the fish still makes progress rather than u-turning in place.
    var tx = -gy / glen, ty = gx / glen;
    var fwd = wantX * tx + wantY * ty;
    if (fwd < 0) { tx = -tx; ty = -ty; }
    var speed = Math.sqrt(wantX * wantX + wantY * wantY);
    steerScratchX = tx * speed;
    steerScratchY = ty * speed;
  }

  // Rev 5 SURFACE CONTAINMENT. The single choke point every non-player entity
  // passes through, and the reason NOTHING but the player is ever above
  // y = SURFACE_Y. It is a REFLECTION, not a teleport: on contact the entity is
  // placed exactly at the ceiling and any upward velocity is turned downward at
  // SURFACE_BOUNCE, so a fish that panics upward noses the surface and peels
  // back down instead of stopping dead or popping to a new spot.
  //
  // Deliberately its own function rather than inline in integrate(): flee
  // vectors, pack drift, hazard drift and pickup magnet all write y or vy
  // outside integrate(), and every one of them ends up here. One
  // implementation, no way to add a motion path later that forgets the ceiling.
  function containY(e) {
    if (e.y < SURFACE_Y) {
      e.y = SURFACE_Y;
      if (e.vy < 0) e.vy = -e.vy * SURFACE_BOUNCE;   // reflect DOWN
    } else if (e.y > S.h - 12) {
      e.y = S.h - 12;
      if (e.vy > 0) e.vy = -Math.abs(e.vy);
    }
  }
  World.__containY = containY;

  function integrate(e, dt) {
    var slow = e.st.slowT > 0 ? 0.45 : 1;
    e.x += e.vx * dt * slow;
    e.y += e.vy * dt * slow;
    // Rev 6 (6.4): every mover resolves against the SDF cavern maze right
    // after its position update, same as engine3d's player path (stepMotion,
    // after integration, before edge clamps). Push-out + tangent slide, so a
    // fish pressed into rock is nudged clear rather than snagging.
    World.resolveBody(e, e.r || 14);
    // Soft world bounds: reflect rather than clamp so nothing piles on an edge.
    if (e.x < 20) { e.x = 20; e.vx = Math.abs(e.vx); }
    else if (e.x > S.w - 20) { e.x = S.w - 20; e.vx = -Math.abs(e.vx); }
    // Vertical bounds go through the shared ceiling: y >= SURFACE_Y always.
    containY(e);
    if (e.vx || e.vy) e.angle = Math.atan2(e.vy, e.vx);
  }

  // Mouth suction is a force, not a position correction. It runs immediately
  // before integrate() so the normal containment and spatial-hash rebucketing
  // remain the only authority that writes the resulting position.
  function applyMouthSuction(e, mouth, dt) {
    if (!mouth || e.kind !== 'prey') return;
    if (typeof mouth.eligibleTierMax !== 'number' || e.tier > mouth.eligibleTierMax) return;
    var reach = mouth.r;
    var strength = mouth.strength;
    if (!(reach > 0) || !(strength > 0)) return;
    var dx = mouth.x - e.x, dy = mouth.y - e.y;
    var d2 = dx * dx + dy * dy;
    if (!(d2 > 0) || d2 > reach * reach) return;

    var d = Math.sqrt(d2);
    e.vx += (dx / d) * strength * dt;
    e.vy += (dy / d) * strength * dt;

    var def = e.def;
    var base = def && (def.speed || (def.stats && def.stats.speed));
    if (!(base > 0)) base = 120;
    var cap = base * 1.6;
    var speed2 = e.vx * e.vx + e.vy * e.vy;
    if (speed2 > cap * cap) {
      var scale = cap / Math.sqrt(speed2);
      e.vx *= scale;
      e.vy *= scale;
    }
  }

  // Rev 6.5: mouth-proximity panic. The mouth CENTER (not the player body)
  // closing within PANIC_R arms panicT for PANIC_T seconds regardless of the
  // sight-based flee state below; once armed it decays on its own clock so a
  // fish that darts out of range still finishes its panic burst instead of
  // snapping calm the instant the mouth passes by.
  function updatePanic(e, dt) {
    var st = e.st;
    if (st.panicT > 0) st.panicT -= dt;
    var mouth = RF.ctx && RF.ctx.mouth;
    if (!mouth) return;
    var dx = mouth.x - e.x, dy = mouth.y - e.y;
    if (dx * dx + dy * dy <= PANIC_R * PANIC_R) st.panicT = PANIC_T;
  }

  // Rev 6.12 PREY PANIC CUE: reads the player's published lunge-capture point
  // (ctx.player.st.lungeX/lungeY, live only while st.lungeT > 0, both owned
  // by engine3d.js's stepLunge) and, when this entity is the one sitting at
  // that point, arms/refreshes a short instance-color flash plus a one-shot
  // fx tracer. Guarded defensively (typeof checks on every field) because
  // this lane does not own engine3d.js and must never assume its exact
  // current shape — a run without a live lunge simply never triggers this.
  function updateLungeTargetFlash(e, ctx, dt) {
    var st = e.st;
    if (st.lungeTargetFlashT > 0) st.lungeTargetFlashT -= dt;
    if (st.lungeTargetFlashT < 0) st.lungeTargetFlashT = 0;
    var p = ctx && ctx.player;
    var pst = p && p.st;
    if (!pst || !(pst.lungeT > 0)) return;
    if (typeof pst.lungeX !== 'number' || typeof pst.lungeY !== 'number') return;
    var dx = pst.lungeX - e.x, dy = pst.lungeY - e.y;
    if (dx * dx + dy * dy > LUNGE_TARGET_R * LUNGE_TARGET_R) return;
    // Newly armed (was not already flashing this lunge window): fire a small
    // one-shot tracer spark once rather than every step the target stays
    // inside the window. 'elementSpark' is an existing small additive-spark
    // pool (fx3d.js POOL_CONFIG) that accepts a tint straight from opts, so
    // this reads as a distinct "you are the target" marker beyond the
    // instance-color flash below without needing a new fx3d.js pool (a lane
    // this task does not own).
    if (st.lungeTargetFlashT <= 0) {
      fx('elementSpark', e.x, e.y, { tint: LUNGE_FLASH_COLOR, count: 3, scale: 0.9, life: 260 });
    }
    st.lungeTargetFlashT = LUNGE_FLASH_T;
  }

  function preyAI(e, ctx, dt) {
    var def = e.def;
    var spd = def.speed || 120;
    var player = ctx.player;
    var fleeing = false;
    updatePanic(e, dt);
    updateLungeTargetFlash(e, ctx, dt);
    var panicking = e.st.panicT > 0;
    if (player) {
      var dx = player.x - e.x, dy = player.y - e.y;
      var d2 = dx * dx + dy * dy;
      var gap = tierGap(player.tier || 1, e.tier);
      var sight = 240 + clamp(gap, -4, 8) * 34;
      if (sight < 90) sight = 90;
      if (d2 < sight * sight) {
        var attract = !!(player.st && player.st.dreadAura);
        var d = Math.sqrt(d2) || 1;
        if (attract) {
          // dreadAura INVERTS flee into attraction. Flag owned by abilities.js.
          steer(e, player.x, player.y, spd * 1.05, dt, 5);
        } else {
          // Rev 5 flee burst: FLEE_BURST of base, capped at 1.6x per brief.
          steer(e, e.x - (dx / d) * 400, e.y - (dy / d) * 400, spd * FLEE_BURST, dt, 6);
        }
        fleeing = true;
        e.st.mode = attract ? 'lured' : 'flee';
      }
    }
    // Rev 6.5 mouth panic is a SEPARATE trigger from the sight-based flee
    // above, anchored on RF.ctx.mouth (not necessarily the same point as
    // ctx.player, e.g. a lunge target offset or a test harness). Fix-round 2
    // (6.11 code review): the perpendicular jitter + doubled bend amp are the
    // BINDING panic read and must apply even when ordinary sight-flee already
    // steered this step, not only when sight-flee was silent. When both fire,
    // the panic jitter steer is authoritative (it re-steers on top of the
    // sight-flee direction, still overlaid on the suction pull toward the
    // mouth applied after preyAI) so a prey within the mouth panic radius
    // always visibly thrashes.
    if (panicking) {
      var mouth = RF.ctx && RF.ctx.mouth;
      if (mouth) {
        var mdx = mouth.x - e.x, mdy = mouth.y - e.y;
        var md = Math.sqrt(mdx * mdx + mdy * mdy) || 1;
        e.st.panicPhase += dt * PANIC_JITTER * TAU;
        var perpX = -(mdy / md), perpY = mdx / md;
        var jitterAmt = 90 * Math.sin(e.st.panicPhase + entPhase(e));
        var fleeX = e.x - (mdx / md) * 400 + perpX * jitterAmt;
        var fleeY = e.y - (mdy / md) * 400 + perpY * jitterAmt;
        steer(e, fleeX, fleeY, spd * FLEE_BURST, dt, 6);
        fleeing = true;
        e.st.mode = 'flee';
      }
    }
    // Rev 6.11 CHUM SEAM: read the engine-owned chum timer via the update ctx,
    // guarded at every level (ctx, ctx.run, ctx.run.buffs may be absent in a
    // headless/selftest ctx). Panic and sight-flee both take priority; Chum
    // only steers a prey that is otherwise just wandering.
    if (!fleeing && player) {
      var chumT = ctx.run && ctx.run.buffs && ctx.run.buffs.chum;
      if (chumT > 0) {
        var cdx = player.x - e.x, cdy = player.y - e.y;
        var cd2 = cdx * cdx + cdy * cdy;
        if (cd2 < CHUM_R * CHUM_R) {
          steer(e, player.x, player.y, spd * CHUM_SPEED_FRAC, dt, CHUM_STEER_W);
          fleeing = true; // reuses the "already steered" gate below
          e.st.mode = 'chum';
        }
      }
    }
    if (!fleeing) {
      e.st.mode = 'wander';
      var p = packVec(e.st.packId, dt);
      e.st.jitterT -= dt;
      if (e.st.jitterT <= 0) {
        e.st.jitterT = rr(0.5, 1.6);
        e.st.jx = rr(-1, 1);
        e.st.jy = rr(-0.6, 0.6);
      }
      var dirX = (p ? p.dx : Math.cos(e.st.drift)) + e.st.jx * 0.5;
      var dirY = (p ? p.dy : Math.sin(e.st.drift) * 0.5) + e.st.jy * 0.5;
      var m = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
      steer(e, e.x + (dirX / m) * 300, e.y + (dirY / m) * 300, spd * 0.7, dt, 2.2);
    }
  }

  function predatorAI(e, ctx, dt) {
    var stats = e.def.stats || {};
    var spd = stats.speed || 200;
    var player = ctx.player;
    e.st.biteCd -= dt;
    if (player) {
      var dx = player.x - e.x, dy = player.y - e.y;
      var d2 = dx * dx + dy * dy;
      var pt = player.tier || 1;
      // Rev 6.11 NURSERY LAW: a predator that has drifted outside its own
      // home zone band may not pursue a nursery-tier (<= NURSERY_TIER)
      // player at all. It still patrols/flees normally; it just never
      // enters 'pursue' against a player this fragile from foreign turf.
      var leashed = pt <= NURSERY_TIER && e.st.homeZoneId &&
        World.zoneAt(e.y) && World.zoneAt(e.y).id !== e.st.homeZoneId;
      if (pt < e.tier && d2 < PREDATOR_SIGHT * PREDATOR_SIGHT && !leashed) {
        e.st.mode = 'pursue';
        steer(e, player.x, player.y, spd, dt, 4.5);
        var reach = e.r + (player.r || 24);
        if (d2 < reach * reach && e.st.biteCd <= 0) {
          e.st.biteCd = 0.7;
          var dmg = (stats.bite || 1) * 6;
          pushHit(e, dmg, e.x, e.y, false);
          // The rig's jaw snap is driven off this same bite cooldown, so the
          // animation and the damage are the same event by construction.
          e.st.bitePhase = 1;
          fx('chomp', e.x, e.y, null);
          sfx('hurt', null);
        }
        return;
      }
      if (pt > e.tier && d2 < 520 * 520) {
        // Outranked: they become prey and run.
        e.st.mode = 'flee';
        var d = Math.sqrt(d2) || 1;
        steer(e, e.x - (dx / d) * 500, e.y - (dy / d) * 500, spd * FLEE_BURST_NPC, dt, 5);
        return;
      }
    }
    // Patrol.
    e.st.mode = 'patrol';
    e.st.jitterT -= dt;
    if (e.st.jitterT <= 0) {
      e.st.jitterT = rr(1.6, 3.6);
      e.st.drift = rr(0, TAU);
    }
    steer(e, e.x + Math.cos(e.st.drift) * 400, e.y + Math.sin(e.st.drift) * 220, spd * 0.55, dt, 1.8);
  }

  function hazardAI(e, ctx, dt) {
    var player = ctx.player;
    var id = e.defId;
    if (id === 'mine') {
      // Static drift: a very slow bob so a field does not look pasted on.
      e.st.drift += dt * 0.4;
      e.vx = Math.cos(e.st.drift) * 6;
      e.vy = Math.sin(e.st.drift * 0.7) * 5;
      // Rev 5: hazard drift is written straight to velocity every frame, so the
      // reflection in containY would be overwritten on the next step and the
      // mine would grind along the ceiling. Near the surface the sine is folded
      // to its downward half instead, which keeps the bob but points it away.
      if (e.y < SURFACE_Y + SURFACE_MARGIN && e.vy < 0) e.vy = -e.vy;
      if (player) {
        var reach = e.r + (player.r || 24);
        var dx = player.x - e.x, dy = player.y - e.y;
        if (dx * dx + dy * dy < reach * reach) {
          var eats = !!(player.st && player.st.junkEater);
          if (!eats) {
            pushHit(e, (e.def.dmg || 25), e.x, e.y, false);
            detonate(e);
          } else {
            World.kill(e, 'eaten');
          }
        }
      }
      return;
    }
    if (id === 'jelly') {
      e.st.drift += dt * 0.9;
      var spd = e.def.speed || 30;
      e.vx = Math.cos(e.st.drift * 0.5) * spd * 0.5;
      e.vy = Math.sin(e.st.drift) * spd;
      // Rev 5: same fold as the mine. A jelly's whole motion is this vertical
      // sine, so without it a jelly parked under the surface would pump upward
      // into the ceiling forever. The bell pulse reads off st.drift and is
      // untouched, so the animation stays in sync with the bob.
      if (e.y < SURFACE_Y + SURFACE_MARGIN && e.vy < 0) e.vy = -e.vy;
      if (player) {
        var r2 = e.r + (player.r || 24);
        var jx = player.x - e.x, jy = player.y - e.y;
        if (jx * jx + jy * jy < r2 * r2 && e.st.biteCd <= 0) {
          e.st.biteCd = 1.2;
          pushHit(e, (e.def.dmg || 6), e.x, e.y, true);
          if (player.st) player.st.slowT = Math.max(player.st.slowT || 0, 2.0);
          fx('elementSpark', e.x, e.y, null);
        }
      }
      e.st.biteCd -= dt;
      return;
    }
    if (id === 'puffer') {
      var pspd = e.def.speed || 90;
      e.st.jitterT -= dt;
      if (e.st.jitterT <= 0) { e.st.jitterT = rr(0.8, 2.2); e.st.drift = rr(0, TAU); }
      var near = false;
      if (player) {
        var px = player.x - e.x, py = player.y - e.y;
        near = (px * px + py * py) < PUFFER_NEAR * PUFFER_NEAR;
      }
      e.st.inflated = near;
      if (near && player) {
        var pr = e.r * (1.5) + (player.r || 24);
        var qx = player.x - e.x, qy = player.y - e.y;
        if (qx * qx + qy * qy < pr * pr && e.st.biteCd <= 0) {
          e.st.biteCd = 1.0;
          pushHit(e, (e.def.dmg || 10), e.x, e.y, false);
        }
      }
      e.st.biteCd -= dt;
      // Rev 4: the render scale is NOT written here. It snapped between 1.0
      // and 1.5 in one frame, which read as a popping sprite. animateEntity()
      // eases st.puffS toward the target over PUFF_TIME. st.inflated remains
      // the gameplay authority (hitbox above, and the eatable flag the engine
      // reads) and is unchanged, so the easing is purely cosmetic and cannot
      // desync the collision.
      steer(e, e.x + Math.cos(e.st.drift) * 200, e.y + Math.sin(e.st.drift) * 120, pspd * (near ? 0.3 : 0.6), dt, 2);
      return;
    }
    // Unknown hazard id: hold station.
    e.vx = 0; e.vy = 0;
  }

  // Mine chain: kill neighbours within 150px, which detonate in turn.
  function detonate(mine) {
    scratchChain.length = 0;
    scratchChain.push(mine);
    var guard = 0;
    while (scratchChain.length && guard++ < 64) {
      var m = scratchChain.shift();
      if (!m || !m.active) continue;
      fx('deathBurst', m.x, m.y, null);
      sfx('death', null);
      var near = World.query(m.x, m.y, MINE_CHAIN_R, 'hazard');
      // query returns the shared scratch buffer, so copy the ids we need now.
      for (var i = 0; i < near.length; i++) {
        var n = near[i];
        if (n !== m && n.active && n.defId === 'mine') scratchChain.push(n);
      }
      World.kill(m, 'detonate');
    }
    scratchChain.length = 0;
  }
  World.detonate = detonate;

  // ------------------------------------------------------------- pickups
  function dropPickup(e, ctx) {
    var n = Math.min(3, Math.max(1, Math.round((e.coins || 1) / 6)));
    for (var i = 0; i < n; i++) {
      var p = acquire();
      if (!p) return;
      p.kind = 'pickup';
      p.defId = 'coin';
      p.def = null;
      p.tier = 0;
      p.x = e.x + rr(-18, 18);
      p.y = e.y + rr(-14, 14);
      p.vx = rr(-40, 40);
      p.vy = rr(-40, 40);
      // Rev 5: a kill right under the surface used to scatter coins ABOVE the
      // waterline, where they hung in the air until their 12s life expired.
      if (p.y < SURFACE_Y) { p.y = SURFACE_Y; if (p.vy < 0) p.vy = -p.vy; }
      p.hp = p.maxHp = 1;
      p.r = 14;
      p.score = 0;
      p.coins = Math.max(1, Math.round((e.coins || 1) / n));
      resetSt(p.st);
      p.st.life = 12;
      applySprite(p);
      gridInsert(p);
    }
  }

  function pickupAI(p, ctx, dt) {
    p.st.life -= dt;
    if (p.st.life <= 0) { World.kill(p, 'expire'); return; }
    var player = ctx.player;
    if (!player) { p.vx *= 0.94; p.vy *= 0.94; return; }
    var dx = player.x - p.x, dy = player.y - p.y;
    var d2 = dx * dx + dy * dy;
    var magnet = !!(player.st && player.st.coinMagnet);
    var pullR = magnet ? PICKUP_MAGNET_R * 2.2 : PICKUP_MAGNET_R;
    if (d2 < pullR * pullR) {
      steer(p, player.x, player.y, magnet ? 620 : 380, dt, 7);
    } else {
      p.vx *= 0.96; p.vy *= 0.96;
    }
    var grab = PICKUP_GRAB_R + (player.r || 24) * 0.5;
    if (d2 < grab * grab) {
      if (ctx.run) ctx.run.coins = (ctx.run.coins || 0) + p.coins;
      fx('motes', p.x, p.y, null);
      sfx('coin', null);
      World.kill(p, 'collected');
    }
  }

  // ---------------------------------------------------- Rev 6.7 buff pickups
  // Weighted table lives in RFD.PICKUPS (gen_data.py). Two spawn paths:
  //   - World.spawnBuffDrop(x,y): engine-called on a notable kill (6.7 owns
  //     the "notable" judgement; this lane just places the capsule).
  //   - rare ambient rolls inside runSpawner (BUFF_AMBIENT_CHANCE).
  // Kind is 'buffpickup' (never 'pickup', which stays coins-only) and every
  // entity carries a `buff` string field naming the table row id. Collection
  // is the engine's existing eatQuery/query path per 6.7; this lane does NOT
  // implement buff effects, only spawn, drift, and expiry-with-fade.
  // Rev 6.12 BUFF CADENCE: shared live-count gate for BOTH buff spawn paths
  // (ambient roll and kill-drop), so a burst of notable kills cannot stack
  // capsules past a small on-screen ceiling regardless of how many the
  // ambient roll would also like to place this tick. Cheap: buffpickups are
  // never more than a handful of live entities at once, so a linear scan of
  // the dense active list is fine (this is not a per-frame hot path — it
  // only runs on the rare ambient roll and on an actual notable kill).
  var BUFF_LIVE_CAP = 2;
  function liveBuffCount() {
    var n = 0;
    for (var i = 0; i < S.entities.length; i++) {
      if (S.entities[i].kind === 'buffpickup') n++;
    }
    return n;
  }
  function spawnBuffAt(x, y) {
    if (liveBuffCount() >= BUFF_LIVE_CAP) return null;
    var P = pickups();
    if (!P.length) return null;
    var id = pickWeighted(pickupWeightRows(P));
    if (!id) return null;
    var row = pickupDef(id);
    if (!row) return null;
    var p = acquire();
    if (!p) return null;
    p.kind = 'buffpickup';
    p.defId = 'buff_' + id;
    // A tiny synthetic def so the shared billboard/fallback path can tint the
    // capsule from the row's own accent colour without any new texture.
    p.def = { id: p.defId, sprite: null, tier: 0, sil: { palette: { base: hexNum(row.tint) } } };
    p.buffId = id;
    p.tier = 0;
    p.x = x; p.y = y;
    var a = rr(0, TAU);
    p.vx = Math.cos(a) * BUFF_DRIFT_SPEED;
    p.vy = Math.sin(a) * BUFF_DRIFT_SPEED * 0.6;
    if (p.y < SURFACE_Y) { p.y = SURFACE_Y; if (p.vy < 0) p.vy = -p.vy; }
    p.hp = p.maxHp = 1;
    p.r = 20;
    p.score = 0;
    p.coins = 0;
    resetSt(p.st);
    p.st.life = BUFF_LIFE;
    applySprite(p);
    gridInsert(p);
    return p;
  }
  // Rev 6.12 BUFF CADENCE: the kill-drop path additionally respects a 10s
  // global cooldown between drops (on top of the shared BUFF_LIVE_CAP gate
  // spawnBuffAt already enforces for both paths), so a run of several
  // notable kills in quick succession cannot flood capsules — only the
  // ambient roll's own rare chance keeps offering a trickle in between.
  var BUFF_DROP_COOLDOWN = 10;
  World.spawnBuffDrop = function (x, y) {
    if (S.buffDropCd > 0) return null;
    var p = spawnBuffAt(x, y);
    if (p) S.buffDropCd = BUFF_DROP_COOLDOWN;
    return p;
  };

  // pickWeighted expects [id, weight] rows or {defId, w}; PICKUPS rows are
  // {id, weight, ...}, so adapt once per call rather than allocating a whole
  // parallel table up front (pickup rolls are rare, so this is cheap).
  var pickupWeightScratch = [];
  function pickupWeightRows(P) {
    pickupWeightScratch.length = 0;
    for (var i = 0; i < P.length; i++) pickupWeightScratch.push([P[i].id, P[i].weight || 1]);
    return pickupWeightScratch;
  }

  function buffAI(p, ctx, dt) {
    p.st.life -= dt;
    if (p.st.life <= 0) { World.kill(p, 'expire'); return; }
    // Gentle ambient drift, no player attraction: 6.7 gives buffs no magnet,
    // unlike coins, so the player has to actually swim to one.
    p.vx *= 0.985; p.vy *= 0.985;
    var sp = p.sprite;
    if (sp && p.st.life < BUFF_FADE) setOpacity(sp, clamp(p.st.life / BUFF_FADE, 0, 1));
  }
  World.kill = function (ent, cause) {
    if (!ent || !ent.active) return;
    if (cause !== 'collected' && cause !== 'despawn' && cause !== 'expire') {
      fx('deathBurst', ent.x, ent.y, null);
      fx('motes', ent.x, ent.y, null);
      if (cause !== 'detonate') sfx('chomp', null);
    }
    if (cause !== 'despawn' && cause !== 'expire' && ent.kind !== 'pickup' &&
      ent.kind !== 'buffpickup' && ent.coins > 0) {
      dropPickup(ent, null);
    }
    release(ent);
  };

  // ------------------------------------------------------- status effects
  // RF-STATUS-01: DoT rates come from the ability that applied the effect.
  // abilities.js writes st.burnDmg / st.poisonDmg when it stamps the timer;
  // when it is absent (a debug or legacy application) we fall back to the
  // authored RFD.ABILITIES row, and only then to a hard default.
  var BURN_FALLBACK = 3;
  var POISON_FALLBACK = 1.6;
  function burnRate(st) {
    var v = st.burnDmg;
    if (typeof v === 'number' && v > 0) return v;
    var A = D().ABILITIES;
    var row = A && A.pyro;
    if (row && typeof row.dmg === 'number' && row.dmg > 0) return row.dmg;
    return BURN_FALLBACK;
  }
  function poisonRate(st) {
    var v = st.poisonDmg;
    if (typeof v === 'number' && v > 0) return v;
    var A = D().ABILITIES;
    var row = A && A.toxin;
    if (row && typeof row.dot === 'number' && row.dot > 0) return row.dot;
    return POISON_FALLBACK;
  }

  // The player is not a world entity, so nothing else copies the resolved
  // passives onto its status block. abilities.js reads st.fireImmune and
  // st.toxinImmune when deciding whether an effect lands, so world publishes
  // them from the resolved passive struct once per step. Entities keep their
  // OWN flags: this only ever touches ctx.player.st.
  function syncPlayerImmunity(ctx) {
    var pl = ctx && ctx.player;
    if (!pl || !pl.st) return;
    var pas = pl.pas;
    if (!pas) return;
    pl.st.fireImmune = !!(pas.fireImmune || pl.st.fireImmune);
    pl.st.toxinImmune = !!(pas.toxinImmune || pas.toxinEater || pl.st.toxinImmune);
  }

  // Status TINT in 3D. world.js used setTint on a Phaser sprite; here the tint
  // goes onto the entity's PRIVATE material clone (see privatiseMaterial), so
  // one frozen minnow cannot turn its whole shoal blue.
  var TINT_FROZEN = 0x8fd7ff;
  var TINT_BURN = 0xff8a4a;
  var TINT_POISON = 0x8ee06f;
  var TINT_STUN = 0xffe08a;

  function statusTick(e, ctx, dt) {
    var st = e.st;
    var dead = false;
    if (st.frozenT > 0) st.frozenT -= dt;
    if (st.stunT > 0) st.stunT -= dt;
    if (st.slowT > 0) st.slowT -= dt;
    if (st.burnT > 0) {
      if (st.fireImmune) { st.burnT = 0; st.burnDmg = 0; }
      else {
        st.burnT -= dt;
        e.hp -= burnRate(st) * dt;
        if (st.burnT <= 0) st.burnDmg = 0;
        if (e.hp <= 0) dead = true;
      }
    }
    if (!dead && st.poisonT > 0) {
      if (st.toxinImmune) { st.poisonT = 0; st.poisonDmg = 0; }
      else {
        st.poisonT -= dt;
        e.hp -= poisonRate(st) * dt;
        if (st.poisonT <= 0) st.poisonDmg = 0;
        if (e.hp <= 0) dead = true;
      }
    }
    // Tint carries the status so it reads without extra geometry.
    var sp = e.sprite;
    if (sp) {
      if (st.frozenT > 0) setTint(sp, TINT_FROZEN);
      else if (st.burnT > 0) setTint(sp, TINT_BURN);
      else if (st.poisonT > 0) setTint(sp, TINT_POISON);
      else if (st.stunT > 0) setTint(sp, TINT_STUN);
      else clearTint(sp);
    }
    if (dead) {
      // DoT kills credit the player who applied it.
      if (ctx && ctx.run) {
        ctx.run.score = (ctx.run.score || 0) + (e.score || 0);
      }
      World.kill(e, 'dot');
      return true;
    }
    return false;
  }

  // ------------------------------------------------------- ambient character
  // Rows are indexed by zone id - 1 and fall back to the last row.
  //   fx        lane F pool name
  //   every     seconds between bursts (lower = denser water)
  //   count     particles per burst
  //   tint      colour so each zone's motes belong to that zone
  //   sx / sy   emission box around the camera
  //   angle     emission angle in degrees (bubbles up, snow down)
  // Emission goes through the guarded fx() wrapper, so lane F3's own budget
  // ceiling remains the authority and a dropped emit is harmless here. With no
  // RF.Fx at all the calls are skipped and the world simply has no motes.
  var AMBIENT = [
    { fx: 'bubbles', every: 0.11, count: 4, tint: 0xdff6ff, sx: 460, sy: 300, angle: 270, speed: 70, scale: 0.9 },
    { fx: 'motes',   every: 0.13, count: 3, tint: 0x7fd6a8, sx: 480, sy: 320, angle: 250, speed: 34, scale: 0.8 },
    { fx: 'motes',   every: 0.15, count: 3, tint: 0xcfe3ee, sx: 500, sy: 340, angle: 90,  speed: 26, scale: 0.7 },
    // Rev 6.9: abyss motes retint to the canonical cyan accent so the
    // deepest zone's ambient sparkle reads as "data motes", not plain blue.
    { fx: 'motes',   every: 0.35, count: 2, tint: NEON_CYAN, sx: 520, sy: 360, angle: 90,  speed: 12, scale: 1.25 },
  ];
  // Reused options object. Never replaced, so update() allocates nothing. The
  // z field is new in 3D: marine snow and bubbles ride the FOREGROUND mote
  // band from the space contract, in front of the gameplay plane, which is
  // what makes the water read as a volume the player is inside rather than a
  // backdrop they swim against.
  var ambientOpts = { tint: 0, count: 1, angle: 0, speed: 0, scale: 1, z: 0 };
  var shaftOpts = { tint: 0xeafcff, count: 1, angle: 270, speed: 16, scale: 2.2, z: 0 };
  var MOTE_Z = [40, 80];       // foreground parallax band per the space contract

  function emitAmbient(z, camX, camY) {
    var idx = z && typeof z.id === 'number' ? z.id - 1 : 0;
    if (idx < 0) idx = 0;
    if (idx >= AMBIENT.length) idx = AMBIENT.length - 1;
    var a = AMBIENT[idx];
    S.ambientT = a.every;
    ambientOpts.tint = a.tint;
    ambientOpts.count = a.count;
    ambientOpts.angle = a.angle;
    ambientOpts.speed = a.speed;
    ambientOpts.scale = a.scale;
    ambientOpts.z = rr(MOTE_Z[0], MOTE_Z[1]);
    fx(a.fx, camX + rr(-a.sx, a.sx), camY + rr(-a.sy, a.sy), ambientOpts);
    // Shelf only, and only while the surface light actually reaches: one slow
    // shaft mote drifting up through the rays.
    if (idx === 0 && camY < SURFACE_LIGHT_H + 260 && rnd() < 0.55) {
      shaftOpts.z = rr(MOTE_Z[0], MOTE_Z[1]);
      fx('motes', camX + rr(-420, 420), rr(20, SURFACE_LIGHT_H), shaftOpts);
    }
  }

  // ------------------------------------------------------ Rev 4 water motion
  // ONE pass over five fixed-size registries. Every record was built in init;
  // this function reads records and writes scalars onto three objects. It
  // allocates nothing, calls no rng, and its cost is O(background layers),
  // which is a constant of the build, not of the entity count.
  function animateWater(t, camX) {
    var i, rec, o;

    // Caustic light planes: horizontal sine drift plus an independent alpha
    // breath. Two different rates per plane means the pattern never repeats on
    // a period a player can perceive.
    for (i = 0; i < S.caustics.length; i++) {
      rec = S.caustics[i]; o = rec.img;
      if (!o) continue;
      if (o.position) o.position.x = rec.x0 + Math.sin(t * rec.rate * TAU + rec.phase) * rec.ampX;
      var ca = rec.aBase + Math.sin(t * rec.aRate * TAU + rec.aPhase) * rec.aAmp;
      if (ca < 0) ca = 0;
      if (o.material) o.material.opacity = ca;
    }

    // God rays: +-RAY_ROT_AMP rad of sway about the WATERLINE pivot and an
    // alpha cycle over the RAY_ALPHA_LO..1.0 fraction of the ray's own baked
    // brightness.
    for (i = 0; i < S.rays.length; i++) {
      rec = S.rays[i]; o = rec.img;
      if (!o) continue;
      var rot = rec.rot0 + Math.sin(t * rec.rotRate * TAU + rec.rotPhase) * rec.rotAmp;
      if (rec.pivot && rec.pivot.rotation) rec.pivot.rotation.z = rot;
      // sin -> 0..1 -> RAY_ALPHA_LO..1
      var u = 0.5 + 0.5 * Math.sin(t * rec.aRate * TAU + rec.aPhase);
      var ra = rec.aBase * (RAY_ALPHA_LO + (1 - RAY_ALPHA_LO) * u);
      if (o.material) o.material.opacity = ra;
    }

    // Thermocline seams drift sideways, so a zone boundary looks like water
    // moving through a temperature layer rather than a pasted-on gradient.
    // Same story as the drifters: a seam is now one merged batch whose
    // vertices carry the placed positions, so x0 is 0 and this is an offset.
    for (i = 0; i < S.seams.length; i++) {
      rec = S.seams[i]; o = rec.img;
      if (!o || !o.position) continue;
      o.position.x = rec.x0 + Math.sin(t * rec.rate * TAU + rec.phase) * rec.ampX;
    }

    // Kelp and seaweed sway about their rooted base (the pivot Group).
    for (i = 0; i < S.swayers.length; i++) {
      rec = S.swayers[i]; o = rec.img;
      if (!o || !o.rotation) continue;
      o.rotation.z = rec.rot0 + Math.sin(t * rec.rate * TAU + rec.phase) * rec.amp;
    }

    // Reef fans and anemones share the same rooted-pivot motion as kelp.
    for (i = 0; i < S.reefSwayers.length; i++) {
      rec = S.reefSwayers[i]; o = rec.img;
      if (!o || !o.rotation) continue;
      o.rotation.z = rec.rot0 + Math.sin(t * rec.rate * TAU + rec.phase) * rec.amp;
    }

    // Midwater silhouettes drift a few px. Anchor is preserved: the motion is
    // an offset from the placed position, never an accumulation.
    // The drifter is now one merged batch per zone whose vertices already
    // carry every shape's placed position, so x0/y0 are the batch ORIGIN (0,0)
    // and the write is a pure offset. Anchoring is preserved exactly: the
    // offset is recomputed from the sine every frame, never accumulated.
    for (i = 0; i < S.drifters.length; i++) {
      rec = S.drifters[i]; o = rec.img;
      if (!o || !o.position) continue;
      var ph = t * rec.rate * TAU + rec.phase;
      o.position.x = rec.x0 + Math.sin(ph) * rec.ampX;
      o.position.y = -(rec.y0 + Math.sin(ph * 0.63 + 1.1) * rec.ampY);
    }

    // Surface ribbon. The attribute and its backing array are both allocated
    // in buildSurface; this fixed-step loop only overwrites their scalars.
    if (S.surface && S.surface.ribbonAttr && S.surface.ribbonAttr.array) {
      var ra = S.surface.ribbonAttr.array;
      var seg = S.surface.segments;
      for (i = 0; i <= seg; i++) {
        var sx = S.w * i / seg;
        var sy = surfaceWave(sx, t);
        var vi = i * 2;
        ra[vi * 3] = sx;
        ra[vi * 3 + 1] = -sy;
        ra[vi * 3 + 2] = Z_SURFACE;
        ra[(vi + 1) * 3] = sx;
        ra[(vi + 1) * 3 + 1] = -(sy + SURFACE_RIBBON_H);
        ra[(vi + 1) * 3 + 2] = Z_SURFACE;
      }
      S.surface.ribbonAttr.needsUpdate = true;
      if (S.surface.ripple && S.surface.ripple.offset) {
        S.surface.ripple.offset.x = (t * 0.018) % 1;
        S.surface.ripple.offset.y = (t * 0.009) % 1;
      }
      if (S.surface.snell) {
        if (S.surface.snell.position && typeof camX === 'number') S.surface.snell.position.x = camX;
        if (S.surface.snell.material) S.surface.snell.material.opacity = snellAlpha();
      }
    }

    // Foam strip rides the waterline on a slow sine, so the boundary between
    // water and air is never a dead straight edge.
    if (S.surface && S.surface.foam && S.surface.foam.position) {
      S.surface.foam.position.x = S.surface.x0 + Math.sin(t * 0.6) * 40 + (t * 14) % 240;
    }

    // Background schools are decorative registries, not entities. Their phase
    // writes stay in this fixed-size render pass and never touch the sim.
    animateSchools(t);
  }

  function animateSchools(t) {
    for (var i = 0; i < S.backgroundSchools.length; i++) {
      var school = S.backgroundSchools[i];
      if (!school || !school.mesh) continue;
      if (school.batch) {
        var batch = school.batch;
        for (var j = 0; j < batch.count; j++) {
          batch.phase.setX(j, school.phase + t * school.rate + batch.phaseBase[j]);
        }
        batch.dirty = true;
      } else if (school.mesh.position) {
        var ph = school.phase + t * school.rate;
        school.mesh.position.x = school.x0 + Math.sin(ph) * school.ampX;
        school.mesh.position.y = school.y0 + Math.sin(ph * 0.71 + 0.8) * school.ampY;
      }
    }
  }

  function flushInstancedUpdates() {
    var i, batch;
    for (i = 0; i < S.instancedPrey.length; i++) {
      batch = S.instancedPrey[i];
      if (!batch || !batch.dirty) continue;
      if (batch.mesh.instanceMatrix) batch.mesh.instanceMatrix.needsUpdate = true;
      batch.phase.needsUpdate = true;
      batch.amp.needsUpdate = true;
      batch.colors.needsUpdate = true;
      batch.dirty = false;
    }
    for (i = 0; i < S.backgroundSchools.length; i++) {
      batch = S.backgroundSchools[i] && S.backgroundSchools[i].batch;
      if (!batch || !batch.dirty) continue;
      if (batch.mesh.instanceMatrix) batch.mesh.instanceMatrix.needsUpdate = true;
      batch.phase.needsUpdate = true;
      batch.amp.needsUpdate = true;
      batch.colors.needsUpdate = true;
      batch.dirty = false;
    }
  }

  // -------------------------------------------------- Rev 4 creature motion
  // Per-entity phase is (id * PHI) * TAU. The golden ratio makes consecutive
  // ids land maximally far apart on the circle, so a pack spawned in one burst
  // is never in step: a shoal reads as a shoal, not as a rigid formation.
  function entPhase(e) { return (e.id * PHI % 1) * TAU; }

  // Rev 5 ORIENTATION, adapted to 3D. Two separate problems, as in world.js.
  //
  // 1. FACING. Bakes are nose-right. In Phaser the mirror was setFlipX; on a
  //    three plane it is a NEGATIVE X SCALE, which is the same operation. With
  //    the mirror applied the billboard already points left, so the rotation
  //    laid on top must be the angle MIRRORED about the vertical (PI - angle),
  //    otherwise the pitch inverts the moment a fish turns around.
  // 2. SNAPPING. e.angle is recomputed every step straight from the velocity,
  //    so a flee that reverses in one frame would rotate the billboard 180
  //    degrees in one frame. st.faceA is a SMOOTHED display heading chasing
  //    e.angle at FACE_TURN, taking the short way around the circle. Sim
  //    heading is untouched: this is display only and cannot affect AI,
  //    collision or the eat check.
  function faceAngle(e, dt) {
    var st = e.st;
    var spd2 = e.vx * e.vx + e.vy * e.vy;
    if (typeof st.faceA !== 'number') { st.faceA = e.angle; return st.faceA; }
    if (spd2 < FACE_SNAP * FACE_SNAP) return st.faceA;   // drifting: hold heading
    var target = e.angle;
    // Shortest signed arc, so crossing +-PI never spins the long way.
    var d = target - st.faceA;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    var k = clamp(FACE_TURN * dt, 0, 1);
    st.faceA += d * k;
    while (st.faceA > Math.PI) st.faceA -= TAU;
    while (st.faceA < -Math.PI) st.faceA += TAU;
    return st.faceA;
  }

  // The eased puffer needs dt. update() stashes it here rather than threading
  // an extra argument through, and it is a module scalar, so no allocation.
  var lastDt = 1 / 60;
  function dtOf() { return lastDt; }

  function animateInstancedEntity(e, t) {
    var rec = e && e._viewRec;
    var batch = rec && rec.instanced ? rec.batch : null;
    if (!batch || !batch.mesh) return;
    var st = e.st;
    var fa = faceAngle(e, dtOf());
    var left = Math.cos(fa) < 0;

    // The loft's nose points +X. A Y half-turn preserves front-face winding
    // when the fish faces left; unlike a negative scale it keeps normals and
    // instanced culling coherent. Z carries the sim heading in Three space.
    instPosScratch.set(e.x, -e.y, Z_PLAY);
    instEulerScratch.set(0, left ? Math.PI : 0, -fa);
    instQuatScratch.setFromEuler(instEulerScratch);
    var len = renderScaleFor(e.def, e.kind, rec.localLength);
    instScaleScratch.set(len, len, len);
    instMatrixScratch.compose(instPosScratch, instQuatScratch, instScaleScratch);
    batch.mesh.setMatrixAt(rec.slot, instMatrixScratch);

    var spd = Math.sqrt(e.vx * e.vx + e.vy * e.vy);
    var maxSpd = (e.def && (e.def.speed || (e.def.stats && e.def.stats.speed))) || 160;
    var speedFrac = maxSpd > 0 ? clamp(spd / maxSpd, 0, 1.4) : 0;
    if (st.frozenT > 0) speedFrac = 0;
    batch.phase.setX(rec.slot, entPhase(e) + t);
    // Rev 6.5: doubled instanced bend amplitude while panicking, so a fish
    // whose panicT is armed visibly thrashes rather than just swimming away
    // faster (the flee-speed and jitter live in preyAI/steer; this is the
    // purely visual half of the same cue).
    var bendAmp = INST_BEND_AMP * clamp(speedFrac, 0, 1);
    if (st.panicT > 0) bendAmp *= PANIC_BEND_MULT;
    batch.amp.setX(rec.slot, bendAmp);

    var tint = e._tint || 0;
    if (!tint) {
      if (st.frozenT > 0) tint = TINT_FROZEN;
      else if (st.burnT > 0) tint = TINT_BURN;
      else if (st.poisonT > 0) tint = TINT_POISON;
      else if (st.stunT > 0) tint = TINT_STUN;
      else tint = 0xffffff;
    }
    // Rev 6.12 PREY PANIC CUE: the lunge-captured target flashes toward
    // white/red on top of whatever base tint it already has, via the
    // existing instanceColor attribute (no new attribute/draw). Blended
    // rather than a hard override so a frozen/burning target's status tint
    // still reads through the flash.
    if (st.lungeTargetFlashT > 0) {
      var flashK = clamp(st.lungeTargetFlashT / LUNGE_FLASH_T, 0, 1);
      tint = lerpColor(tint, LUNGE_FLASH_COLOR, 0.55 * flashK);
    }
    instColorScratch.setHex(tint);
    batch.colors.setXYZ(rec.slot, instColorScratch.r, instColorScratch.g, instColorScratch.b);
    batch.dirty = true;
  }

  // A frozen or stunned creature must READ frozen. The wiggle amplitude is
  // scaled by how fast the entity is actually moving, so freezing (which zeroes
  // velocity) collapses the animation to its baseline on its own; frozenT is
  // then checked explicitly so it snaps rather than decays.
  function animateEntity(e, t) {
    var sp = e.sprite;
    if (!sp) return;
    var st = e.st;
    var frozen = st.frozenT > 0;

    if (e._viewRec && e._viewRec.instanced) {
      animateInstancedEntity(e, t);
      return;
    }

    if (e.kind === 'pickup') {
      // Pickups glint: a slow alpha pulse so a dropped coin catches the eye in
      // dark water without needing a particle.
      var ga = 1 - GLINT_AMP * (0.5 + 0.5 * Math.sin(t * GLINT_RATE * TAU + entPhase(e)));
      setOpacity(sp, ga);
      return;
    }

    if (e.kind === 'buffpickup') {
      // Same glint language as a coin, but only while there is life left to
      // glint about: buffAI already owns the final BUFF_FADE seconds of
      // opacity as a hard fade-to-zero, and this pulse would otherwise fight
      // that write every frame.
      if (e.st.life > BUFF_FADE) {
        var gb = 1 - GLINT_AMP * (0.5 + 0.5 * Math.sin(t * GLINT_RATE * TAU + entPhase(e)));
        setOpacity(sp, gb);
      }
      return;
    }

    if (e.kind === 'hazard') {
      var id = e.defId;
      if (id === 'jelly') {
        // Bell pulse, synced to the vertical bob hazardAI already drives off
        // st.drift, so the bell contracts as the animal rises.
        var jl = displayLen(e.def, 'hazard');
        var jasp = (e._viewRec && e._viewRec.aspect) || 0.52;
        var pulse = frozen ? 1 : 1 + JELLY_PULSE * Math.sin(st.drift * JELLY_RATE * TAU + entPhase(e));
        setScale(sp, jl * (2 - pulse), jl * jasp * pulse);
        return;
      }
      if (id === 'puffer') {
        // Inflate/deflate ANIMATES over PUFF_TIME instead of snapping between
        // 1.0 and 1.5. st.puffS is the eased current scale; st.inflated stays
        // the gameplay authority and is untouched here.
        var want = st.inflated ? 1.5 : 1.0;
        if (typeof st.puffS !== 'number') st.puffS = want;
        var step = (1.5 - 1.0) * (dtOf() / PUFF_TIME);
        if (st.puffS < want) { st.puffS += step; if (st.puffS > want) st.puffS = want; }
        else if (st.puffS > want) { st.puffS -= step; if (st.puffS < want) st.puffS = want; }
        var pl = displayLen(e.def, 'hazard');
        var pasp = (e._viewRec && e._viewRec.aspect) || 0.52;
        setScale(sp, pl * st.puffS, pl * pasp * st.puffS);
        return;
      }
      // mine and unknown hazards: no body animation, the AI bob is enough.
      return;
    }

    // Prey and predators.
    var spd = Math.sqrt(e.vx * e.vx + e.vy * e.vy);
    var maxSpd = (e.def && (e.def.speed || (e.def.stats && e.def.stats.speed))) || 160;
    var f = maxSpd > 0 ? clamp(spd / maxSpd, 0, 1.4) : 0;
    if (frozen) f = 0;

    if (e.kind === 'predator' && e.rig && typeof e.rig.animate === 'function') {
      // SPEC3D: NPC sharks are RF.Art3D.buildShark groups whose animate() is
      // driven from their velocity each update. The state object is reused, so
      // twenty sharks on screen still allocate nothing.
      rigState.speedFrac = f;
      // `turn` is the bank: how hard the heading is changing right now, signed,
      // which is exactly what a rig needs to roll into a turn.
      var fa = st.faceA;
      var dTurn = e.angle - (typeof fa === 'number' ? fa : e.angle);
      while (dTurn > Math.PI) dTurn -= TAU;
      while (dTurn < -Math.PI) dTurn += TAU;
      rigState.turn = clamp(dTurn * 2.2, -1, 1);
      // 6.2: NPC rigState.vy mirrors the player bag so shark3d's pitch-from-vy
      // read (shark3d.js state.vy consumer) applies to predators too, not just
      // the player. Sim px/s, +y = down, same units the player publishes.
      rigState.vy = e.vy;
      // bitePhase decays from the bite the AI just scored, so the jaw snap and
      // the damage are the same event.
      if (st.bitePhase > 0) { st.bitePhase -= dtOf() * 3.2; if (st.bitePhase < 0) st.bitePhase = 0; }
      rigState.bitePhase = st.bitePhase || 0;
      rigState.jawSnapT = st.biteCd > 0 ? st.biteCd : 0;
      if (frozen) { rigState.speedFrac = 0; rigState.turn = 0; rigState.vy = 0; }
      try { e.rig.animate(t, rigState); } catch (err) { /* rig must never break the sim */ }
      return;
    }

    if (e.kind === 'predator') {
      // No rig (lane D3 absent, or this def has no buildShark support): the
      // interim whole-billboard pitch from world.js Rev 4 stands in, at an
      // amplitude low enough that it will not fight a rig landing later.
      var pitch = NPC_PITCH * (0.35 + 0.65 * f) * Math.sin(t * NPC_PITCH_HZ * TAU + entPhase(e));
      if (frozen) pitch = 0;
      applyHeading(e, sp, pitch);
      return;
    }

    // Fish: rate scales with speed, amplitude with speed. A drifting fish
    // barely moves its tail; a fleeing one thrashes. In 3D the wiggle is a
    // small Z ROTATION on the billboard, per SPEC3D.
    var hz = FISH_WIGGLE_HZ[0] + (FISH_WIGGLE_HZ[1] - FISH_WIGGLE_HZ[0]) * f;
    var amp = FISH_WIGGLE * (0.25 + 0.75 * f);
    // Rev 6.5: doubled bend amplitude while panicking, matching the instanced
    // path (this is the non-instanced billboard fallback for the same cue).
    if (st.panicT > 0) amp *= PANIC_BEND_MULT;
    var wig = f > 0 ? Math.sin(t * hz * TAU + entPhase(e)) * amp : 0;
    applyHeading(e, sp, wig);
  }

  // Write the display heading and the mirror onto one billboard. Split out so
  // the fish and the rig-less predator branches cannot drift apart.
  function applyHeading(e, sp, wiggle) {
    var fa = faceAngle(e, dtOf());
    var left = Math.cos(fa) < 0;
    // Mirrored about the vertical when facing left, so the pitch is not
    // inverted by the mirror.
    var shown = left ? (Math.PI - fa) : fa;
    setRot(sp, shown + wiggle);
    if (sp.scale) {
      var w = Math.abs(sp.scale.x);
      sp.scale.x = left ? -w : w;
    }
  }

  // ------------------------------------------------------------ teardown
  //
  // LIFE-01 / SPEC3D Rev 2. Every module that adds to the scene exports
  // teardown(). THIS module owns, and therefore releases:
  //
  //   scene objects   every decor pivot and merged batch, the surface parts,
  //                   every pooled VIEW (billboards, coins, NPC shark rigs),
  //                   whether the view is live on an entity or idle in a bank
  //   geometry        the shared unit quad, the fallback quad and its per
  //                   palette vertex-coloured clones, every merged batch
  //                   geometry built this run
  //   materials       every environment material (cached and private), every
  //                   fallback material, every per-entity private clone
  //   scene state     the FogExp2 it installed on the scene, and the scene's
  //                   fog slot if it is still pointing at ours
  //
  // EXPLICITLY PERSISTENT, and NOT released (SPEC3D Rev 2, documented global
  // lifetime):
  //
  //   texCache        assets/*.png THREE.Textures. These are the asset layer,
  //                   not run state: the same rock_a and the same fish PNGs
  //                   are wanted by the next run, they are bounded by the
  //                   number of files on disk, and re-decoding them on every
  //                   restart would be a visible hitch for no benefit.
  //   canvasCache     the 2D bakes behind the procedural billboards. Same
  //                   argument: bounded by roster size, expensive to redo,
  //                   and CanvasTextures built from them ARE disposed because
  //                   those live inside the views.
  //   shark3d caches  lane D3's geometry and material caches, reached only
  //                   through its own rig.dispose() if it offers one. This
  //                   module never disposes another lane's shared cache.
  //
  // The contract this satisfies: init() after teardown() is equivalent to the
  // first init(). The selftest proves it by running init/teardown five times
  // against a stub scene and asserting the stub's child list returns to its
  // baseline and that disposals match creations.

  // Every disposable this RUN created, so teardown never has to guess. Counts
  // are kept alongside for the selftest's create-vs-dispose assertion.
  function freshOwned() {
    return { mats: [], geos: [], textures: [], attributes: [], created: 0, disposed: 0 };
  }

  function disposeOne(o) {
    if (!o || typeof o.dispose !== 'function') return false;
    try { o.dispose(); } catch (e) { return false; }
    return true;
  }

  // Detach one object from whatever it is parented to. Works against a real
  // THREE.Scene and against the selftest's stub scene alike.
  function detach(o) {
    if (!o) return;
    if (o.parent && typeof o.parent.remove === 'function') {
      try { o.parent.remove(o); return; } catch (e) { /* fall through */ }
    }
    if (S.scene && typeof S.scene.remove === 'function') {
      try { S.scene.remove(o); } catch (e) { /* stub scene */ }
    }
  }

  // Release one pooled view: detach the object, hand a lane-D rig back through
  // ITS OWN dispose path if it has one, and free the material clone this
  // module gave it. Shared geometry and shared materials are freed once, in
  // bulk, at the end of teardown, never here.
  function viewTeardown(rec) {
    if (!rec) return;
    if (rec.instanced) {
      rec.slot = -1;
      rec.entity = null;
      return;
    }
    var o = rec.obj;
    if (rec.rig && typeof rec.rig.dispose === 'function') {
      // Lane D3 owns its geometry/material caches. Its dispose path is the
      // only thing allowed to decide what of a rig is per-run and what is a
      // documented persistent cache, so it is called rather than traversed.
      try { rec.rig.dispose(); } catch (e) { /* lane D3 without a dispose */ }
    }
    detach(o);
    if (o && o.material && o.material.__rfPrivate) {
      if (disposeOne(o.material)) envOwned.disposed++;
    }
    rec.obj = null;
    rec.rig = null;
  }

  function clearInstancedBatch(batch) {
    if (!batch) return;
    var g = batch.geometry;
    if (g && typeof g.deleteAttribute === 'function') {
      g.deleteAttribute('aBendPhase');
      g.deleteAttribute('aBendAmp');
    }
    if (batch.mesh) batch.mesh.instanceColor = null;
    if (batch.records) {
      for (var i = 0; i < batch.records.length; i++) {
        batch.records[i].slot = -1;
        batch.records[i].entity = null;
      }
    }
  }

  function teardownInstancedState() {
    var i, batch;
    for (i = 0; i < S.instancedPrey.length; i++) {
      batch = S.instancedPrey[i];
      clearInstancedBatch(batch);
      detach(batch && batch.mesh);
    }
    for (i = 0; i < S.backgroundSchools.length; i++) {
      batch = S.backgroundSchools[i] && S.backgroundSchools[i].batch;
      if (batch) clearInstancedBatch(batch);
    }
    S.instancedPrey.length = 0;
    S.backgroundSchools.length = 0;
    S.instancedByDef = {};
    S.fishSources = null;
  }

  World.teardown = function () {
    if (!envOwned) envOwned = freshOwned();
    var i, k;

    // 0. RF.Fx, but ONLY when this module's init() is what brought it up.
    //    Whoever calls init() owns calling teardown(): World.init() calls
    //    RF.Fx.init(scene3), so the nine THREE.Points particle pools it
    //    attaches are this module's to release. Skipped when engine3d had
    //    already initialised FX for this scene, because then they are its
    //    effects and its lifecycle (FX-01 is F3 and A3's finding, not ours).
    if (fxOwned) {
      var F = RF.Fx;
      if (F && typeof F.teardown === 'function') {
        try { F.teardown(); } catch (e) { /* lane F3 without a teardown */ }
      }
      fxOwned = false;
    }

    // 1. Entities. Return every live entity's view first, so the bank walk
    //    below sees every view exactly once and nothing is left checked out.
    for (i = S.entities.length - 1; i >= 0; i--) {
      var e = S.entities[i];
      if (e && e._viewRec) { viewTeardown(e._viewRec); e._viewRec = null; }
      if (e) { e.sprite = null; e.rig = null; e._view = null; }
    }
    for (i = 0; i < S.pool.length; i++) {
      var pe = S.pool[i];
      if (pe && pe._viewRec) { viewTeardown(pe._viewRec); pe._viewRec = null; }
      if (pe) { pe.sprite = null; pe.rig = null; pe._view = null; pe.active = false; }
    }
    S.entities.length = 0;
    S.free.length = 0;
    S.pool.length = 0;

    // 2. Idle views still sitting in their banks.
    if (S.views) {
      for (k in S.views) {
        if (!Object.prototype.hasOwnProperty.call(S.views, k)) continue;
        var bank = S.views[k];
        if (!bank || !bank.free) continue;
        for (i = 0; i < bank.free.length; i++) viewTeardown(bank.free[i]);
        bank.free.length = 0;
        bank.live = 0;
      }
    }
    S.views = {};
    S.viewsIdle = 0;
    S.rigs.length = 0;

    // 3. Environment. S.decor holds every top-level object this module added,
    //    including the merged batches and the pivots that carry them, so one
    //    walk detaches the lot.
    for (i = 0; i < S.decor.length; i++) detach(S.decor[i]);
    S.decor.length = 0;
    teardownInstancedState();
    S.surface = null;
    S.gradient = null;
    S.terrain.length = 0;
    S.rockChunks.length = 0;
    S.sdf = null;
    S.sdfRegion = null;
    S.sdfCols = 0; S.sdfRows = 0; S.sdfRegionN = 0;
    S.caustics.length = 0;
    S.rays.length = 0;
    S.seams.length = 0;
    S.swayers.length = 0;
    S.reefSwayers.length = 0;
    S.reefBatches.length = 0;
    S.drifters.length = 0;

    // 4. GPU resources this run created. Materials and geometry are disposed
    //    in bulk from the ownership lists, which is why every creation site
    //    pushes into them.
    for (i = 0; i < envOwned.mats.length; i++) { if (disposeOne(envOwned.mats[i])) envOwned.disposed++; }
    for (i = 0; i < envOwned.geos.length; i++) { if (disposeOne(envOwned.geos[i])) envOwned.disposed++; }
    for (i = 0; i < envOwned.attributes.length; i++) { if (disposeOne(envOwned.attributes[i])) envOwned.disposed++; }
    for (i = 0; i < envOwned.textures.length; i++) { if (disposeOne(envOwned.textures[i])) envOwned.disposed++; }
    envOwned.mats.length = 0;
    envOwned.geos.length = 0;
    envOwned.attributes.length = 0;
    envOwned.textures.length = 0;

    // 5. The shared caches this module owns per run: matCache holds both the
    //    fallback materials and the per-palette vertex-coloured geometry
    //    clones, so it is walked for either kind.
    if (S.matCache) {
      for (k in S.matCache) {
        if (!Object.prototype.hasOwnProperty.call(S.matCache, k)) continue;
        if (disposeOne(S.matCache[k])) envOwned.disposed++;
      }
    }
    S.matCache = {};
    if (envMatCache) envMatCache = {};

    // 6. The two module-level geometry singletons.
    if (disposeOne(S.geoQuad)) envOwned.disposed++;
    S.geoQuad = null;
    if (disposeOne(fallbackGeoCache)) envOwned.disposed++;
    fallbackGeoCache = null;

    // 7. Scene state. The fog object is ours; the scene's fog SLOT is the
    //    engine's, and is only cleared when it is still pointing at ours.
    if (S.scene && S.fog && S.scene.fog === S.fog) {
      try { S.scene.fog = null; } catch (err) { /* stub scene */ }
    }
    S.fog = null;
    S.clearCol = null;
    S.atmoA = null;
    S.atmoB = null;
    S.lastZoneId = -1;

    // 8. Light references go back. We never created them and never dispose
    //    them; we simply stop writing to lights that may be about to be
    //    replaced by a renderer rebuild (GL-01).
    lightHemi = null;
    lightSun = null;

    // 9. Sim state, so a torn-down world answers queries as an empty one
    //    rather than reaching into freed arrays.
    S.grid = null;
    S.cols = 0; S.rows = 0;
    if (S.packs && typeof S.packs.clear === 'function') S.packs.clear();
    S.packs = null;
    for (i = 0; i < packRecs.length; i++) packRecs[i].owner = 0;
    packRing = 0;
    resetHits();
    S.surfaceT = 0;
    S.ambientT = 0;
    S.buffDropCd = 0;
    S.animT = 0;
    S.lastNow = -1;
    S.inited = false;

    // 10. Module-scratch arrays that hold entity references between calls
    //     (6.11 code review): scratchQuery is query()/eatQuery()'s reused
    //     result buffer and stays populated with the last query's live
    //     entity refs until the next query runs. playerHits is already
    //     cleared by resetHits() above; scratchChain is always drained back
    //     to length 0 at the end of its own function so it never persists
    //     entity refs across calls. Clearing scratchQuery here means a
    //     torn-down world holds no stale entity objects from its last run,
    //     reducing iOS heap pressure across repeated start/end cycles.
    scratchQuery.length = 0;

    // texCache and canvasCache are DELIBERATELY LEFT ALONE. See the block
    // comment above: they are the documented persistent asset caches.
    return World;
  };

  // ----------------------------------------------------------------- init
  // init(scene3, ctx). scene3 is a THREE.Scene (or, in the selftest, any
  // object with an add() that collects). The renderer is optional and may be
  // supplied later through applyZoneAtmo, or on ctx.renderer here.
  World.init = function (scene3, ctx) {
    // LIFE-01: init after init is a restart. Tear the old one down first
    // rather than orphaning its scene objects, so a caller that forgets to
    // call teardown() still cannot leak. Calling teardown() twice is safe.
    if (S.inited) { try { World.teardown(); } catch (e) { /* nothing to release */ } }
    var d = D();
    var W = d.WORLD || { w: 14400, h: 4800 };
    S.scene = scene3 || null;
    S.renderer = (ctx && ctx.renderer) || null;
    S.rng = (ctx && ctx.rng) || null;
    decorRng = makeLocalRng(0x5eaf100d);
    S.w = W.w; S.h = W.h;
    S.cols = Math.ceil(S.w / CELL);
    S.rows = Math.ceil(S.h / CELL);
    S.grid = [];
    S.grid.length = S.cols * S.rows;
    S.pool.length = 0;
    S.free.length = 0;
    S.entities.length = 0;
    S.nextId = 1;
    S.packSeq = 1;
    S.packs = new Map();
    for (var pi = 0; pi < packRecs.length; pi++) packRecs[pi].owner = 0;
    packRing = 0;
    resetHits();
    S.decor.length = 0;
    S.surface = null;
    S.gradient = null;
    S.terrain.length = 0;
    S.rockChunks.length = 0;
    S.sdf = null;
    S.sdfRegion = null;
    S.sdfCols = 0; S.sdfRows = 0; S.sdfRegionN = 0;
    S.surfaceT = 0;
    S.ambientT = 0;
    S.buffDropCd = 0;
    S.matCache = {};
    S.views = {};
    S.fishSources = {};
    S.instancedByDef = {};
    S.instancedPrey.length = 0;
    S.backgroundSchools.length = 0;
    // Ownership ledgers for this run. Every environment material, geometry and
    // run-created texture is pushed into these at its creation site, and
    // teardown() disposes exactly what is in them, so nothing has to be found
    // by traversal and nothing can be missed.
    envMatCache = {};
    envOwned = freshOwned();
    // Art source caches. Keyed by SPRITE, not by pool slot, so a whole shoal
    // shares one texture. PERSISTENT ACROSS RUNS by SPEC3D Rev 2: they are the
    // asset layer (bounded by files on disk and roster size), and re-decoding
    // them on every restart would be a visible hitch for no benefit. They are
    // created lazily here only on the FIRST init.
    if (!texCache) texCache = {};
    if (!canvasCache) canvasCache = {};
    S.viewsDisposed = 0;
    S.viewsIdle = 0;
    S.rigs.length = 0;
    S.lastZoneId = -1;
    // Rev 4 animation registries. Cleared here and refilled by
    // buildBackground; after init nothing is ever pushed to them again.
    S.caustics.length = 0;
    S.rays.length = 0;
    S.seams.length = 0;
    S.swayers.length = 0;
    S.reefSwayers.length = 0;
    S.reefBatches.length = 0;
    S.drifters.length = 0;
    S.animT = 0;
    S.lastNow = -1;
    S.headless = !(scene3 && typeof scene3.add === 'function');
    // ATMO-01: the engine's lights, created once at boot and driven from here
    // for the rest of the page's life. ctx.lights is the normal handover; a
    // caller may also use World.setLights() before or after init.
    if (ctx && ctx.lights) World.setLights(ctx.lights);

    buildNpcTables();
    // Fish builds are optional. When the fish-loft lane is absent these three
    // calls are no-ops and the existing billboard path remains authoritative.
    buildFishSources();
    buildInstancedPrey();
    buildBackground();
    buildBackgroundSchools();
    buildPool((d.ENTITY_BUDGET && d.ENTITY_BUDGET.total) || 140);

    var F = RF.Fx;
    if (F && typeof F.init === 'function' && scene3) {
      // Lane F3 owns emitter construction; calling init here is harmless if it
      // has already run, and covers the case where world boots first.
      //
      // LIFE-01 (in-page finding): whoever calls init() owns calling
      // teardown(). This module calls RF.Fx.init, so when it was THIS call
      // that brought the pools up, this module's teardown must take them back
      // down. Without that, RF.Fx.init built nine THREE.Points pools
      // (bubbles, motes, elementSpark, ring, beamCore, swimtrail, speedlines,
      // breach, ambient; goldpulse is a DOM overlay per UI_LAW and adds no
      // scene child) and nothing ever removed them, so every restart left
      // exactly 9 children attached. The stub-scene proof could not see it
      // because a stub scene has no RF.Fx at all.
      //
      // fxOwned records that WE started it. If engine3d had already called
      // Fx.init for this scene, F3's init is a documented no-op and the flag
      // stays false, so this module never tears down effects another lane owns.
      // Liveness is detected OBSERVABLY, by whether the init call actually
      // attached anything to our scene, rather than by reaching into F3's
      // internals. F3 exposes no "is initialised" getter, and an observable
      // test is immune to whatever it refactors next. F3's init is a
      // documented no-op when it is already up against this same scene, so a
      // zero count is exactly the "engine3d already owns it" case.
      fxOwned = countAddsDuring(function () {
        try { F.init(scene3); } catch (e) { /* lane F3 not ready */ }
      }) > 0;
    }
    S.inited = true;
    return World;
  };

  // --------------------------------------------------------------- update
  World.update = function (ctx) {
    if (!S.inited) return;
    var dt = (ctx && ctx.time && ctx.time.dt) || 1 / 60;
    if (!(dt > 0)) dt = 1 / 60;
    S.rng = (ctx && ctx.rng) || S.rng;
    if (ctx && ctx.renderer) S.renderer = ctx.renderer;
    resetHits();
    syncPlayerImmunity(ctx);

    var player = ctx && ctx.player;
    var mouth = RF.ctx && RF.ctx.mouth;
    var camX, camY;
    if (player) { camX = player.x; camY = player.y; }
    else if (ctx && ctx.camera && ctx.camera.position) {
      camX = ctx.camera.position.x;
      camY = -ctx.camera.position.y;          // three y is UP, sim y is DOWN
    } else { camX = S.w * 0.5; camY = S.h * 0.5; }

    S.surfaceT += dt;

    // ZONE ATMOSPHERE. Driven from inside update() so an engine that only
    // calls RF.World.update(ctx) still gets the full fog + clear-colour lerp
    // as the camera descends. applyZoneAtmo is ALSO public so engine3d.js can
    // drive it on its own render cadence; calling both is harmless because the
    // function is idempotent for a given camY.
    World.applyZoneAtmo(S.scene, S.renderer, camY);

    // Rev 4 "living water". Fixed-size registries, scalar writes only. The
    // same clock value drives the creature pass below, so water and creatures
    // never drift apart.
    lastDt = dt;
    var wt = worldClock(ctx, dt);
    var surfaceCamX = ctx && ctx.camera && ctx.camera.position &&
      typeof ctx.camera.position.x === 'number' ? ctx.camera.position.x : camX;
    animateWater(wt, surfaceCamX);

    // Rev 6.12 BUFF CADENCE: tick the kill-drop cooldown down alongside every
    // other per-frame timer in this step.
    if (S.buffDropCd > 0) { S.buffDropCd -= dt; if (S.buffDropCd < 0) S.buffDropCd = 0; }

    // Ambient particle character, per zone. Each zone gets its own emission
    // family, cadence, tint and drift, so the water itself tells you where you
    // are. Options travel in ONE reused object: zero per-frame allocation.
    S.ambientT -= dt;
    if (S.ambientT <= 0) {
      var zc = World.zoneAt(camY);
      emitAmbient(zc, camX, camY);
    }

    // Iterate backwards: kill() swap-pops, so a backwards walk stays correct.
    for (var i = S.entities.length - 1; i >= 0; i--) {
      var e = S.entities[i];
      if (!e.active) continue;

      if (e._biteCd > 0) {
        e._biteCd -= dt;
        if (e._biteCd < 0) e._biteCd = 0;
      }

      if (statusTick(e, ctx, dt)) continue;

      var despawnable = e.kind !== 'pickup' && e.kind !== 'buffpickup';
      if (despawnable) {
        var ddx = e.x - camX, ddy = e.y - camY;
        if (ddx * ddx + ddy * ddy > DESPAWN * DESPAWN) { World.kill(e, 'despawn'); continue; }
      }

      var frozen = e.st.frozenT > 0;
      var stunned = e.st.stunT > 0;
      if (frozen) {
        // Frozen: velocity zero, no AI, no integration. Position is held.
        e.vx = 0; e.vy = 0;
      } else if (stunned) {
        e.vx *= 0.9; e.vy *= 0.9;
        applyMouthSuction(e, mouth, dt);
        integrate(e, dt);
      } else {
        if (e.kind === 'prey') preyAI(e, ctx, dt);
        else if (e.kind === 'predator') predatorAI(e, ctx, dt);
        else if (e.kind === 'hazard') hazardAI(e, ctx, dt);
        else if (e.kind === 'pickup') pickupAI(e, ctx, dt);
        else if (e.kind === 'buffpickup') buffAI(e, ctx, dt);
        if (!e.active) continue;
        applyMouthSuction(e, mouth, dt);
        integrate(e, dt);
      }

      gridUpdate(e);

      var sp = e.sprite;
      if (sp) {
        // Instanced prey share one world-spanning mesh. Their transform lives
        // in the per-instance matrix; billboards and rigs retain the ordinary
        // Object3D position path.
        if (!(e._viewRec && e._viewRec.instanced)) setPos(sp, e.x, e.y, Z_PLAY);
        // Rev 4: creature animation runs AFTER the position write. The heading
        // and the mirror are written INSIDE animateEntity (applyHeading), not
        // before it, because in 3D the mirror is a scale sign and the rotation
        // depends on it.
        animateEntity(e, wt);
      }
    }

    runSpawner(ctx, camX, camY);
    // A spawner can acquire an instanced slot after the entity pass, so flush
    // once more at the end of the fixed step. Each mesh receives one update
    // flag write, never one write per entity.
    flushInstancedUpdates();
  };

  // --------------------------------------------------------------- debug
  World.stats = function () {
    return {
      active: S.entities.length, free: S.free.length, pool: S.pool.length,
      decor: S.decor.length, zone: S.lastZoneId,
      rockChunks: S.rockChunks.length, sdfRegionN: S.sdfRegionN,
    };
  };
  // Exposed for the engine's draw-call budget check and for the selftest.
  World.__state = S;

  // ------------------------------------------------------------- selftest
  // Ported from world.js __selftest against STUBBED three objects. The entity
  // sim needs no real GL: a stub scene whose add() collects, and stub
  // Object3Ds carrying position/rotation/scale/material, exercise every code
  // path this module has. THREE itself is used for the real meshes when it is
  // present, and the stub scene simply collects them.
  World.__selftest = function () {
    var notes = [];
    var pass = true;
    // Saved outside the try so the finally-style restore at the bottom can
    // reach them even if an assertion throws.
    var prevTexCacheOuter = null;
    var prevRFContext = RF.ctx;
    var prevArt3DOuter = RF.Art3D;
    var prevBuildFishOuter = prevArt3DOuter && prevArt3DOuter.buildFish;
    function chk(cond, msg) { if (!cond) { pass = false; notes.push('FAIL ' + msg); } else notes.push('ok ' + msg); }

    // Deterministic stub rng (mulberry32).
    var seed = 0x9e3779b9 >>> 0;
    function rngStub() {
      seed = (seed + 0x6D2B79F5) >>> 0;
      var t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    // Stub scene: the ONLY contract is add(), which collects. Nothing in this
    // module reads anything else off the scene except the fog slot.
    var added = [];
    var scene = { add: function (o) { added.push(o); return this; }, fog: null };
    // Stub renderer records the clear colour so the zone lerp can be asserted.
    var clears = [];
    var renderer = {
      setClearColor: function (c) {
        clears.push(c && typeof c.getHex === 'function' ? c.getHex() : c);
      },
    };
    var ctx = {
      rng: rngStub,
      renderer: renderer,
      time: { now: 0, dt: 1 / 60, frame: 0 },
      run: { score: 0, coins: 0 },
      player: { x: 3600, y: 500, tier: 3, r: 30, st: {} },
    };

    try {
      // World reads the engine-owned RF.ctx mouth descriptor. Keep this test
      // isolated from a live page context, if a caller runs it in-page.
      RF.ctx = ctx;
      ctx.mouth = null;

      // ------------------------------------------------------- API parity
      // The contract abilities.js and engine3d.js compile against.
      var API = ['init', 'update', 'query', 'eatQuery', 'kill', 'spawnBurst', 'zoneAt'];
      var missing = '';
      for (var ai = 0; ai < API.length; ai++) {
        if (typeof World[API[ai]] !== 'function') missing += ' ' + API[ai];
      }
      chk(missing === '', 'public API functions present (' + API.join(', ') + ')' + missing);
      chk(Array.isArray(World.entities) && Array.isArray(World.playerHits),
        'entities and playerHits exposed as arrays');
      chk(typeof World.applyZoneAtmo === 'function', 'applyZoneAtmo exposed for the engine');

      // ------------------------------------------- art source stubs (visuals)
      // The integration bug this block guards: creature billboards were built
      // from BAKE KEY STRINGS that nothing had ever registered, so every one
      // resolved to RF.Art3D's 1x1 transparent placeholder and the prey were
      // invisible in-game. Nothing threw, so only an assertion on the MAP'S
      // ACTUAL IMAGE can catch it. Both real sources are stubbed here, because
      // the selftest has neither GL nor network:
      //   TextureLoader  returns a fake texture carrying a >1x1 image, standing
      //                  in for a decoded assets/<sprite>.png.
      //   RF.Art         if the real sharkart.js is not loaded, a stub whose
      //                  bakeCreature drives the same scene contract the real
      //                  one does (exists/addCanvas) against a fake canvas.
      var loadedURLs = [];
      function FakeTexture(w, h) {
        this.isTexture = true;
        this.uuid = 'fake-' + (loadedURLs.length) + '-' + w + 'x' + h;
        this.image = { width: w, height: h, naturalWidth: w, naturalHeight: h };
        this.needsUpdate = false;
        this.generateMipmaps = false;
        this.colorSpace = '';
        this.magFilter = 0;
        this.minFilter = 0;
      }
      function StubLoader() {}
      // Kenney fish are wider than tall; 96x48 gives a checkable 2:1.
      StubLoader.prototype.load = function (url) {
        loadedURLs.push(url);
        return new FakeTexture(96, 48);
      };
      var prevLoader = World.__TextureLoader;
      World.__TextureLoader = StubLoader;
      // texCache is DELIBERATELY persistent across runs (LIFE-01 / SPEC3D
      // Rev 2), so a selftest run after a real run in the same page would find
      // every sprite already cached and the loader assertions below would see
      // no requests at all. The selftest therefore takes its OWN texture cache
      // and hands the page's back at the end: it proves the resolution PATH
      // rather than a cache hit, and the persistence itself is asserted
      // separately in the LIFE-01 block.
      //
      // canvasCache is NOT swapped, and that is deliberate too. The real
      // sharkart.js baker keeps its own internal record of what it has already
      // baked and answers a repeat request with a key instead of a canvas, so
      // clearing only OUR side of that pair would ask for a bake the baker
      // believes it has already delivered and cache a null. Sharing the page's
      // canvas cache is both correct and what the shipped code does.
      prevTexCacheOuter = texCache || {};
      texCache = {};
      texLoader = null;

      // A canvas-like object satisfying RF.Art3D.resolveCanvas: getContext must
      // be a function and width must be finite.
      function fakeCanvas(w, h) {
        return {
          width: w, height: h,
          getContext: function () {
            return { getImageData: function () { return { data: new Uint8Array(w * h * 4) }; } };
          },
        };
      }
      var prevArt = RF.Art;
      var stubBakes = [];
      if (!RF.Art || typeof RF.Art.bakeCreature !== 'function') {
        RF.Art = {
          bakeCreature: function (sc, def) {
            // Drive the SAME contract the real sharkart.js bakeCreature does,
            // so the capture stub in this module is exercised for real.
            var sprite = String((def && def.sprite) || '');
            if (sprite.indexOf('proc_') !== 0) return sprite;
            var key = 'rf_' + sprite;
            if (sc && sc.textures && sc.textures.exists(key)) return key;
            // Procedural bakes are TALLER relative to width than the fish.
            var cv = fakeCanvas(80, 64);
            stubBakes.push(key);
            if (sc && sc.textures && sc.textures.addCanvas) sc.textures.addCanvas(key, cv);
            return key;
          },
        };
      }

      // ---------------------------------------------- Rev 3 instanced fish
      // Exercise the real adapter with a tiny fish-loft stub even when the
      // optional fish3d.js lane is not loaded by this runner. The stub returns
      // the same geometry/material pair the lane contract accepts; every
      // lifecycle assertion below therefore covers the shipped guarded path,
      // not a test-only branch inside the selftest.
      var probeArt3D = RF.Art3D || {};
      var probeSourceGeometry = null;
      var prevBuildSharkProbe = probeArt3D.buildShark;
      probeArt3D.buildFish = function (def) {
        // Two intentionally different palette-tagged lofts catch the exact
        // regression where every instanced definition accidentally shares one
        // baked geometry or one material tint.
        var width = def && def.id === 'mackerel' ? 3 : 1;
        probeSourceGeometry = new THREE.PlaneGeometry(width, 0.5);
        probeSourceGeometry.computeBoundingBox();
        probeSourceGeometry.userData.rfFishPaletteId = def && def.id;
        var tint = def && def.id === 'mackerel' ? [0.12, 0.72, 0.48] : [0.84, 0.24, 0.12];
        var colorArray = new Float32Array(probeSourceGeometry.attributes.position.count * 3);
        for (var pci = 0; pci < colorArray.length; pci += 3) {
          colorArray[pci] = tint[0]; colorArray[pci + 1] = tint[1]; colorArray[pci + 2] = tint[2];
        }
        probeSourceGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colorArray, 3));
        return {
          geometry: probeSourceGeometry,
        };
      };
      RF.Art3D = probeArt3D;
      var probeAdded = [];
      var probeScene = {
        fog: null,
        add: function (o) { probeAdded.push(o); if (o) o.parent = probeScene; return this; },
        remove: function (o) {
          var pi = probeAdded.indexOf(o);
          if (pi >= 0) { probeAdded[pi] = probeAdded[probeAdded.length - 1]; probeAdded.pop(); }
          if (o) o.parent = null;
          return this;
        },
      };
      var probeCtx = {
        rng: rngStub,
        renderer: renderer,
        time: { now: 0, dt: 1 / 60, frame: 0 },
        run: { score: 0, coins: 0 },
        player: { x: 3600, y: 700, tier: 3, r: 30, st: {} },
      };
      var prevGameForNpcScale = RF.Game;
      try {
        var npcScaleGroup = new THREE.Group();
        npcScaleGroup.userData.baseScale = 2;
        probeArt3D.buildShark = function () { return { group: npcScaleGroup }; };
        RF.Game = { LEN_SCALE: 124 / 96 };
        makeSharkRig({});
        var npcScaled = npcScaleGroup.scale.x;
        chk(Math.abs(npcScaled - 2 * (124 / 96)) < 1e-9 &&
          npcScaleGroup.__baseScale === npcScaled && npcScaleGroup.__rfLenScale === 124 / 96,
          'NPC shark rigs apply RF.Game.LEN_SCALE from baseScale once');
        makeSharkRig({});
        chk(npcScaleGroup.scale.x === npcScaled,
          'NPC shark rig LEN_SCALE guard prevents a second application');
        RF.Game = prevGameForNpcScale;
        if (prevBuildSharkProbe) probeArt3D.buildShark = prevBuildSharkProbe;
        else { try { delete probeArt3D.buildShark; } catch (npcRestoreErr) { probeArt3D.buildShark = undefined; } }

        World.init(probeScene, probeCtx);
        var probeBatch = S.instancedByDef && S.instancedByDef.mackerel;
        chk(!!probeBatch && S.instancedPrey.length > 0,
          'Rev 3 fish builder creates init-time instanced prey batches (' + S.instancedPrey.length + ')');
        chk(!!(probeBatch && probeBatch.paletteId === 'mackerel' &&
          S.instancedByDef.minnow && S.instancedByDef.minnow.paletteId === 'minnow' &&
          probeBatch.geometry.userData.rfFishPaletteId === 'mackerel' &&
          S.instancedByDef.minnow.geometry.userData.rfFishPaletteId === 'minnow' &&
          probeBatch.geometry !== S.instancedByDef.minnow.geometry),
          'each instanced prey definition retains its own palette-tagged loft geometry');
        chk(envOwned.geos.indexOf(probeSourceGeometry) < 0,
          'persistent fish source geometry stays outside the per-run ownership ledger');
        chk(!probeBatch || (probeBatch.mesh.frustumCulled === false &&
          probeBatch.mesh.instanceMatrix.usage === THREE.DynamicDrawUsage),
        'instanced prey disables culling and uses DynamicDrawUsage matrices');
        chk(S.backgroundSchools.length === zones().length &&
          S.backgroundSchools[0] && S.backgroundSchools[0].batch &&
          S.backgroundSchools[0].batch.mesh.count === SCHOOL_N,
        'one 32-instance minnow school is built per zone at the decor depth');

        var pi1 = spawnOne('mackerel', 3200, 700, 0);
        var pi2 = spawnOne('mackerel', 3300, 700, 0);
        var pi3 = spawnOne('mackerel', 3400, 700, 0);
        chk(!!(pi1 && pi2 && pi3 && pi1._viewRec && pi1._viewRec.instanced),
          'converted prey acquires an instance slot instead of a pooled Object3D');
        chk(!!(pi1 && pi1.sprite === pi2.sprite && probeBatch && probeBatch.mesh.count === 3),
          'three converted entities share one def mesh and count is live-entity based');
        if (pi1 && pi2 && pi3 && probeBatch) {
          World.kill(pi2, 'test');
          chk(probeBatch.mesh.count === 2 && probeBatch.count === 2 &&
            S.views['prey:mackerel'].live === 2 && pi3.active && pi3._viewRec.slot === 1,
            'slot release swap-with-last keeps count/live and updates the moved entity slot');
          var pi = pi1.active ? pi1 : pi3;
          var stableRec = pi._viewRec;
          var stableRecordCount = probeBatch.records.length;
          pi.vx = pi.def.speed || 95;
          pi.vy = 0;
          probeCtx.time.now += 1 / 60;
          World.update(probeCtx);
          var pslot = pi._viewRec.slot;
          var pm = new THREE.Matrix4();
          probeBatch.mesh.getMatrixAt(pslot, pm);
          var matrixProbeOk = Math.abs(pm.elements[12] - pi.x) < 1e-3 &&
            Math.abs(pm.elements[13] + pi.y) < 1e-3 &&
            probeBatch.amp.getX(pslot) > 0;
          chk(matrixProbeOk,
          'matrix path writes sim position and moving bend amplitude without allocation');
          var matrixScale = Math.sqrt(pm.elements[0] * pm.elements[0] +
            pm.elements[1] * pm.elements[1] + pm.elements[2] * pm.elements[2]);
          chk(probeBatch.localLength === 3 &&
            Math.abs(matrixScale - displayLen(pi.def, pi.kind) / probeBatch.localLength) < 1e-3 &&
            displayLen(pi.def, pi.kind) <= playerRenderedLength() * PREY_RENDER_FRACTION + 1e-6,
            'instanced prey scale caps final loft length at 0.72x the live player length');
          for (var pstep = 0; pstep < 30; pstep++) {
            probeCtx.time.now += 1 / 60;
            World.update(probeCtx);
          }
          chk(pi.active && pi._viewRec === stableRec && probeBatch.records.length === stableRecordCount,
            'instanced warmup reuses the preallocated slot record and matrix scratch');
          pi.st.frozenT = 1;
          World.update(probeCtx);
          chk(probeBatch.amp.getX(pi._viewRec.slot) === 0,
            'frozen converted prey writes zero bend amplitude');
        }

        if (probeBatch) {
          var probeShader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>' };
          probeBatch.material.onBeforeCompile(probeShader);
          var bendKey = probeBatch.material.customProgramCacheKey();
          chk(probeBatch.material.vertexColors === true &&
            probeBatch.material.color && probeBatch.material.color.getHex() === 0xffffff &&
            probeBatch.material.side === THREE.DoubleSide &&
            bendKey.slice(-13) === ':rf-bend-inst' &&
            probeShader.uniforms.uBendK && probeShader.uniforms.uBendSpan &&
            probeShader.vertexShader.indexOf('uniform float uBendK') >= 0 &&
            probeShader.vertexShader.indexOf('uniform vec2 uBendSpan') >= 0 &&
            probeShader.vertexShader.indexOf('aBendPhase') >= 0 &&
            probeShader.vertexShader.indexOf(INST_BEND_CHUNK) >= 0,
          'instanced toon material preserves the Rev 3 bend uniforms, attributes, and cache key');
          chk(!!(probeBatch.mesh.instanceColor && probeBatch.mesh.instanceColor.isInstancedBufferAttribute),
            'instanced tint uses Three built-in instanceColor');
        }
        var convertedDraws = 0;
        for (var pdi = 0; pdi < S.instancedPrey.length; pdi++) {
          if (S.instancedPrey[pdi].mesh && S.instancedPrey[pdi].mesh.material) convertedDraws++;
        }
        chk(convertedDraws === S.instancedPrey.length,
          'each converted definition contributes exactly one instanced draw object');

        World.teardown();
        RF.Art3D = null;
        World.init(probeScene, probeCtx);
        var fallbackFish = spawnOne('mackerel', 3200, 700, 0);
        chk(!!(fallbackFish && fallbackFish._viewRec && !fallbackFish._viewRec.instanced),
          'absent RF.Art3D.buildFish falls back to the billboard lifecycle');
        World.teardown();
      } catch (probeErr) {
        chk(false, 'Rev 3 instancing probe completed without exception (' +
          (probeErr && probeErr.message ? probeErr.message : probeErr) + ')');
      } finally {
        if (S.inited) World.teardown();
        RF.Art3D = prevArt3DOuter;
        RF.Game = prevGameForNpcScale;
        if (prevArt3DOuter) {
          if (prevBuildFishOuter) prevArt3DOuter.buildFish = prevBuildFishOuter;
          else { try { delete prevArt3DOuter.buildFish; } catch (restoreErr) { prevArt3DOuter.buildFish = undefined; } }
          if (prevBuildSharkProbe) prevArt3DOuter.buildShark = prevBuildSharkProbe;
          else { try { delete prevArt3DOuter.buildShark; } catch (restoreSharkErr) { prevArt3DOuter.buildShark = undefined; } }
        }
      }

      World.init(scene, ctx);
      chk(World.entities === S.entities, 'World.entities is the live active list');
      chk(World.playerHits === playerHits, 'World.playerHits is the live hit list');

      var B = budget();
      chk(S.pool.length === B.total, 'pool preallocated to ENTITY_BUDGET.total (' + S.pool.length + ')');
      chk(added.length > 0, 'environment objects were added to the scene (' + added.length + ')');
      chk(S.pool[0] && S.pool[0]._tint === 0 && S.pool[0]._goldenPackId === 0 &&
        S.pool[0]._schoolCdSeen === 0,
        'entity pool predeclares and resets frenzy tint/cooldown fields');

      // ------------------------------------------------ lighting ownership
      // SPEC3D: the ENGINE owns scene lighting. This lane must add NONE. The
      // probe caught 2x hemi + 2x directional in the live scene because this
      // module built its own rig on top of engine3d's; the regression is
      // cheap to assert, so it is asserted forever.
      var lightCount = 0, lightNames = '';
      for (var li = 0; li < added.length; li++) {
        var ao = added[li];
        if (!ao) continue;
        var isLight = ao.isLight === true ||
          (ao.type && /Light$/.test(String(ao.type))) ||
          (ao.constructor && /Light$/.test(String(ao.constructor.name)));
        if (isLight) { lightCount++; lightNames += ' ' + (ao.type || ao.constructor.name); }
      }
      chk(lightCount === 0, 'world3d adds ZERO lights, engine3d owns lighting (' +
        lightCount + ' found' + lightNames + ')');

      // ------------------------------------------------ billboard art sources
      // Spawn one Kenney-sprite creature and one procedural one, then read the
      // MATERIAL MAP off each view. This is the assertion that would have
      // failed before the fix: the map's image would have been the 1x1
      // placeholder for both.
      function viewOf(defId, x, y) {
        var ent = spawnOne(defId, x, y, 0);
        return ent ? { e: ent, rec: ent._viewRec, obj: ent.sprite } : null;
      }
      function mapImageOf(obj) {
        var m = obj && obj.material;
        var map = m && m.map;
        if (!map) return null;
        // A real THREE texture from a canvas exposes .image; our loader stub
        // exposes the same field. Either way the placeholder is 1x1.
        return map.image || (map.source && map.source.data) || null;
      }

      // These assertions only mean something when lane D3 is actually present:
      // without RF.Art3D every creature legitimately degrades to a
      // vertex-coloured quad, which has no map at all. That degradation is a
      // SUPPORTED mode, not the bug, so it is reported rather than failed.
      var hasArt3D = !!art3d();
      if (!hasArt3D) notes.push('ok RF.Art3D absent, billboards degrade to vertex-coloured quads (art assertions skipped)');

      // mackerel -> sprite 'fish_grey_long_a', a Kenney PNG.
      var kv = viewOf('mackerel', 3000, 700);
      var mackerelInstanced = !!(kv && kv.rec && kv.rec.instanced);
      chk(!!(kv && kv.obj), 'kenney creature acquired a view object');
      if (hasArt3D && kv && kv.obj && !mackerelInstanced) {
        var kimg = mapImageOf(kv.obj);
        var kw = kimg ? (kimg.naturalWidth || kimg.width || 0) : 0;
        var kh = kimg ? (kimg.naturalHeight || kimg.height || 0) : 0;
        chk(!!kimg && kw > 1 && kh > 1,
          'kenney creature material has a map whose image is bigger than 1x1 (' +
          kw + 'x' + kh + ', the placeholder bug was 1x1)');
        chk(loadedURLs.length > 0 && loadedURLs[0].indexOf('assets/') === 0 &&
          /\.png$/.test(loadedURLs[0]),
          'kenney sprite loaded from assets/<sprite>.png (' + (loadedURLs[0] || 'none') + ')');
        chk(loadedURLs.indexOf('assets/fish_grey_long_a.png') >= 0,
          "mackerel resolved its own sprite key, not a bake key");
      } else if (mackerelInstanced) {
        chk(!!(kv.obj.isInstancedMesh && kv.rec.batch && kv.rec.batch.geometry),
          'mackerel uses the shared instanced fish loft instead of a billboard');
      }

      // jelly -> sprite 'proc_jelly', a procedural bake.
      var pv = viewOf('jelly', 3100, 760);
      chk(!!(pv && pv.obj), 'procedural creature acquired a view object');
      if (hasArt3D && pv && pv.obj) {
        var pimg = mapImageOf(pv.obj);
        var pw = pimg ? (pimg.naturalWidth || pimg.width || 0) : 0;
        var ph = pimg ? (pimg.naturalHeight || pimg.height || 0) : 0;
        chk(!!pimg && pw > 1 && ph > 1,
          'procedural creature material is canvas-backed and bigger than 1x1 (' +
          pw + 'x' + ph + ')');
        chk(!!(pimg && typeof pimg.getContext === 'function'),
          'procedural map image is an actual CANVAS handed to billboard(), not a key');
      }

      // Decor (rocks, kelp) resolves through the SAME loader, because its keys
      // are Kenney sprite names too. Before the fix these were passed to
      // billboard() as bare keys and every rock and stalk was a silent 1x1
      // placeholder. decorBillboard is called directly here rather than
      // re-running init, so the check costs one texture request.
      // The decor built during init used whatever loader was live then, so this
      // asks for a key init never used and watches for the REQUEST, which is
      // the thing that regressed. A cache hit would prove nothing.
      var freshKey = 'seaweed_f';
      delete texCache[freshKey];
      var decorBefore = loadedURLs.length;
      var dpv = decorBillboard(freshKey, 70, 200, 0x0b2a2a, 0.6, -200);
      var wantedDecor = false;
      for (var du = decorBefore; du < loadedURLs.length; du++) {
        if (loadedURLs[du] === 'assets/' + freshKey + '.png') wantedDecor = true;
      }
      chk(wantedDecor,
        'decor resolves assets/<sprite>.png through the loader, not a bare bake key (' +
        (loadedURLs[decorBefore] || 'no request') + ')');
      chk(!!dpv, 'decor billboard was built (pivot group returned)');

      // A SECOND creature of each kind must reuse the cached source rather than
      // loading or baking again: that is what keeps a 30-fish shoal at one
      // texture instead of thirty.
      var loadsAfterFirst = loadedURLs.length;
      var kv2 = viewOf('mackerel', 3200, 700);
      chk(!hasArt3D || loadedURLs.length === loadsAfterFirst,
        'a second kenney creature reuses the cached texture (no reload)');

      // ------------------------------------------------------ display size
      // The probe measures a mackerel billboard at the displayLen contract and
      // pins it to the sim's authority. Length is the tier radius x 2.1 and
      // height follows the art's own aspect, so a tier-1 mackerel is 44.1 long
      // and half that tall with the 96x48 fish stub.
      if (hasArt3D && kv && kv.obj && kv.obj.scale && !mackerelInstanced) {
        var mlen = kv.obj.scale.x, mhgt = Math.abs(kv.obj.scale.y);
        chk(mlen >= 34 && mlen <= 60,
          'mackerel billboard length is in the readable band (' + mlen.toFixed(1) +
          ' world units, expected 34-60)');
        chk(Math.abs(mlen - radiusFor(kv.e.def, kv.e.kind) * 2.1) < 1e-6,
          'displayLen uses the Rev 3 2.1x collision-radius scale (' +
          mlen.toFixed(1) + ')');
        chk(mhgt > 4 && mhgt < mlen,
          'mackerel billboard height follows the art aspect and is shorter than it is long (' +
          mhgt.toFixed(1) + ')');
        chk(kv.rec && Math.abs(kv.rec.aspect - 0.5) < 0.02,
          'aspect captured from the 96x48 source is 0.5 (' +
          (kv.rec ? kv.rec.aspect.toFixed(3) : 'none') + ')');
      }

      // Billboards must be added VISIBLE and transparent, or a correct texture
      // still draws nothing.
      if (hasArt3D && kv && kv.obj && !mackerelInstanced) {
        chk(kv.obj.visible === true, 'billboard is added visible');
        var km = kv.obj.material;
        chk(!!(km && km.transparent === true),
          'billboard material is transparent so the PNG alpha cuts the silhouette');
        chk(!!(km && km.depthWrite === false),
          'billboard material does not write depth, so overlapping fish blend');
      }
      if (kv && kv.e) World.kill(kv.e, 'test');
      if (kv2) World.kill(kv2.e, 'test');
      if (pv) World.kill(pv.e, 'test');

      RF.Art = prevArt;
      World.__TextureLoader = prevLoader;

      // Force-spawn 30 mixed entities.
      var mix = ['minnow', 'mackerel', 'grouper', 'jelly', 'puffer', 'mine'];
      var spawned = 0;
      for (var i = 0; i < 30; i++) {
        var e = spawnOne(mix[i % mix.length], 3400 + (i % 6) * 90, 400 + Math.floor(i / 6) * 70, 0);
        if (e) spawned++;
      }
      chk(spawned === 30, 'force-spawned 30 mixed entities (' + spawned + ')');

      // Known-layout query check.
      var a = spawnOne('minnow', 1000, 1000, 0);
      var b = spawnOne('minnow', 1060, 1000, 0);
      var far = spawnOne('minnow', 1600, 1000, 0);
      var res = World.query(1000, 1000, 120, 'prey');
      var hasA = res.indexOf(a) >= 0, hasB = res.indexOf(b) >= 0, hasFar = res.indexOf(far) >= 0;
      chk(hasA && hasB && !hasFar, 'query returns the 2 near neighbours and excludes the far one (' + res.length + ' hits)');
      var resKind = World.query(1000, 1000, 120, 'hazard');
      chk(resKind.length === 0, 'kindFilter excludes non-matching kinds');
      var resAny = World.query(1000, 1000, 120, null);
      chk(resAny.length >= 2, 'null kindFilter matches any kind (abilities.js calls it this way)');

      // eatQuery intentionally differs from query: the mackerel's center is
      // 30px away from the sensor while its 21px body overlaps a 20px mouth.
      var edge = spawnOne('mackerel', 1030, 1000, 0);
      var pointEdge = World.query(1000, 1000, 20, 'prey');
      var pointHasEdge = pointEdge.indexOf(edge) >= 0;
      var bodyEdge = World.eatQuery(1000, 1000, 20);
      chk(edge && edge.x - 1000 > 20 && !pointHasEdge && bodyEdge.indexOf(edge) >= 0,
        'eatQuery includes an overlapping body whose center is outside r, while query stays point-based');
      chk(World.__decaysBiteCd === true, 'world advertises per-entity _biteCd decay to the engine');
      World.kill(a, 'test'); World.kill(b, 'test'); World.kill(far, 'test');
      if (edge && edge.active) World.kill(edge, 'test');

      // _biteCd is a pooled, top-level scalar. It decays on an active entity
      // even while frozen, and a recycled slot starts at zero.
      var chew = spawnOne('mackerel', 2600, 1400, 0);
      if (chew) {
        chk(chew._biteCd === 0, 'pooled entity reset initializes _biteCd to zero');
        chew.st.frozenT = 5;
        chew._biteCd = 0.2;
        World.update(ctx);
        chk(Math.abs(chew._biteCd - (0.2 - ctx.time.dt)) < 1e-9,
          'active entity _biteCd decays toward zero (' + chew._biteCd.toFixed(6) + ')');
        chew.st.frozenT = 0;
        World.kill(chew, 'test');
      }

      // Suction is a velocity force owned by the world step. It only affects
      // eligible prey inside the mouth radius; hazards at the same mouth do
      // not receive it, and the capped speed prevents a teleport across it.
      // Rev 6: y=300 keeps this pair inside the SDF_OPEN_Y guaranteed-open
      // band (6.4: "open water above y ~ 500"), so resolveBody's push-out
      // never fights the suction assertions below with an unrelated maze
      // wall at this rng seed.
      var sucked = spawnOne('mackerel', 2200, 300, 0);
      var unsucked = spawnOne('mine', 2450, 300, 0);
      if (sucked && unsucked) {
        var mouth = { x: 2450, y: 300, r: 280, strength: 2400, eligibleTierMax: sucked.tier };
        ctx.mouth = mouth;
        sucked.vx = 0; sucked.vy = 0;
        var startDist = Math.sqrt((sucked.x - mouth.x) * (sucked.x - mouth.x) +
          (sucked.y - mouth.y) * (sucked.y - mouth.y));
        var maxStep = 0;
        var mineX0 = unsucked.x, mineY0 = unsucked.y;
        for (var su = 0; su < 30; su++) {
          var sx0 = sucked.x, sy0 = sucked.y;
          World.update(ctx);
          if (!sucked.active) break;
          var stepDx = sucked.x - sx0, stepDy = sucked.y - sy0;
          var stepLen = Math.sqrt(stepDx * stepDx + stepDy * stepDy);
          if (stepLen > maxStep) maxStep = stepLen;
        }
        var endDist = Math.sqrt((sucked.x - mouth.x) * (sucked.x - mouth.x) +
          (sucked.y - mouth.y) * (sucked.y - mouth.y));
        var baseSuction = sucked.def.speed || (sucked.def.stats && sucked.def.stats.speed) || 120;
        var maxAllowedStep = baseSuction * 1.6 * ctx.time.dt + 1e-6;
        var mineDrift = Math.sqrt((unsucked.x - mineX0) * (unsucked.x - mineX0) +
          (unsucked.y - mineY0) * (unsucked.y - mineY0));
        chk(sucked.active && endDist < startDist,
          'eligible prey moves closer to RF.ctx.mouth over 30 world steps (' +
          startDist.toFixed(1) + ' -> ' + endDist.toFixed(1) + ')');
        chk(maxStep <= maxAllowedStep,
          'mouth suction caps prey movement without teleporting (' + maxStep.toFixed(3) +
          ' <= ' + maxAllowedStep.toFixed(3) + 'px per step)');
        chk(sucked.x < mouth.x && mineDrift < 6,
          'suction never carries prey past the mouth and never pulls a hazard (' +
          sucked.x.toFixed(1) + ' / mine drift ' + mineDrift.toFixed(2) + ')');
        if (sucked.active) World.kill(sucked, 'test');
        if (unsucked.active) World.kill(unsucked, 'test');
        ctx.mouth = null;
      }

      // Frozen entity must not move.
      var fz = spawnOne('mackerel', 2000, 1200, 0);
      fz.st.frozenT = 5;
      var fx0 = fz.x, fy0 = fz.y;
      for (var f = 0; f < 30; f++) World.update(ctx);
      chk(fz.active && fz.x === fx0 && fz.y === fy0, 'frozen entity did not move');
      fz.st.frozenT = 0;
      World.kill(fz, 'test');

      // Mine chain: a detonation takes the adjacent mine with it.
      var m1 = spawnOne('mine', 5000, 1500, 0);
      var m2 = spawnOne('mine', 5000 + 100, 1500, 0);
      var m3 = spawnOne('mine', 5000 + 900, 1500, 0);
      chk(!!(m1 && m2 && m3), 'three test mines spawned');
      var m3Id = m3.id;
      detonate(m1);
      chk(!m1.active && !m2.active, 'mine chain killed the adjacent mine within 150px');
      chk(m3.active && m3.id === m3Id, 'mine chain did not reach the distant mine');
      World.kill(m3, 'test');

      // 300 updates with a moving player; pool must never exhaust.
      var minFree = S.free.length;
      var maxActive = 0;
      for (var u = 0; u < 300; u++) {
        ctx.player.x = 3600 + Math.sin(u * 0.05) * 900;
        ctx.player.y = 900 + Math.cos(u * 0.04) * 700;
        ctx.time.frame = u;
        World.update(ctx);
        if (S.free.length < minFree) minFree = S.free.length;
        if (S.entities.length > maxActive) maxActive = S.entities.length;
        chk2(S.entities.length + S.free.length === S.pool.length);
      }
      chk(minFree > 0, 'pool never exhausted across 300 updates (min free ' + minFree + ')');
      chk(S.entities.length + S.free.length === S.pool.length, 'pool accounting balanced (' + S.entities.length + ' active + ' + S.free.length + ' free)');
      chk(maxActive <= S.pool.length, 'active count never exceeded pool (' + maxActive + ')');
      chk(accountingBad === 0, 'pool accounting balanced on every one of 300 steps');

      // ------------------------------------------- Rev 5 SURFACE CLAMP
      // The lane brief's hard rule: NOTHING but the player is ever above
      // y = SURFACE_Y. Four separate proofs, because there are four separate
      // ways an entity's y gets written.
      //
      // 1. The spawner's own bound.
      var above = 0;
      for (var sc1 = 0; sc1 < 200; sc1++) {
        var se = spawnOne(mix[sc1 % mix.length], rr(200, S.w - 200), rr(-800, 400), 0);
        if (se) {
          if (se.y < SURFACE_Y + SURFACE_MARGIN) above++;
          World.kill(se, 'test');
        }
      }
      chk(above === 0, 'spawnOne clamps every spawn below the surface ceiling (' + above + ' violations in 200)');

      // 2. spawnBurst's jitter passes through the same gate.
      var burstAbove = 0;
      var burstMade = World.spawnBurst('minnow', 3000, 0, 8);
      for (var sb = S.entities.length - 1; sb >= 0; sb--) {
        var be = S.entities[sb];
        if (be.y < SURFACE_Y) burstAbove++;
      }
      chk(burstMade > 0 && burstAbove === 0, 'spawnBurst at y=0 placed nothing above the ceiling (' + burstMade + ' spawned)');

      // 3. containY reflects an upward velocity DOWN rather than teleporting.
      // Drain first: the checks above deliberately fill the pool, and a null
      // from an exhausted pool would read as a clamp failure rather than the
      // budget working as designed.
      drainAll();
      var cy = spawnOne('minnow', 3000, 200, 0);
      chk(!!cy, 'pool yields an entity after a drain');
      cy.y = SURFACE_Y - 40; cy.vy = -300;
      containY(cy);
      chk(cy.y === SURFACE_Y && cy.vy > 0,
        'containY places the entity at the ceiling and reflects vy downward (vy ' + cy.vy.toFixed(1) + ')');
      chk(Math.abs(cy.vy - 300 * SURFACE_BOUNCE) < 1e-6,
        'surface bounce reflects at SURFACE_BOUNCE (' + SURFACE_BOUNCE + ')');
      World.kill(cy, 'test');

      // 4. THE REAL GATE. A long run with the player pinned at the surface,
      //    which is the case that produced the owner's original bug: prey
      //    fleeing UP from a shallow player. Every entity of every kind is
      //    checked on every step, including the coins a kill scatters.
      ctx.player.x = 3600; ctx.player.y = SURFACE_Y + 10; ctx.player.tier = 8;
      var breach = 0, worstY = 1e9, checked = 0;
      for (var sy = 0; sy < 600; sy++) {
        ctx.time.now += 1 / 60;
        ctx.player.x = 3600 + Math.sin(sy * 0.07) * 700;
        World.update(ctx);
        for (var q = 0; q < S.entities.length; q++) {
          var ent = S.entities[q];
          checked++;
          if (ent.y < worstY) worstY = ent.y;
          if (ent.y < SURFACE_Y) breach++;
        }
      }
      chk(breach === 0,
        'no entity of any kind broke the surface across 600 steps with the player at the waterline (' +
        checked + ' entity-steps checked, shallowest y ' + worstY.toFixed(2) + ')');
      chk(worstY >= SURFACE_Y - 1e-9, 'shallowest observed y is at or below the ceiling (' + worstY.toFixed(2) + ' >= ' + SURFACE_Y + ')');
      ctx.player.tier = 3;

      // Status timers applied: burn kills, credit lands on the run.
      ctx.player.x = 3600; ctx.player.y = 900;
      var bt = spawnOne('minnow', ctx.player.x + 60, ctx.player.y, 0);
      bt.st.burnT = 5; bt.hp = 0.05;
      var beforeScore = ctx.run.score;
      World.update(ctx);
      chk(!bt.active && ctx.run.score > beforeScore, 'burn DoT killed the entity and credited score');

      // RF-STATUS-01: the burn RATE comes from st.burnDmg when abilities set
      // it. Two identical entities, one with a 10x payload, must diverge by
      // that ratio over the same number of steps.
      var slowBurn = spawnOne('grouper', 3000, 700, 0);
      var fastBurn = spawnOne('grouper', 3120, 700, 0);
      if (slowBurn && fastBurn) {
        slowBurn.hp = fastBurn.hp = 400;
        slowBurn.maxHp = fastBurn.maxHp = 400;
        slowBurn.st.burnT = 4; slowBurn.st.burnDmg = 1;
        fastBurn.st.burnT = 4; fastBurn.st.burnDmg = 10;
        var hpS0 = slowBurn.hp, hpF0 = fastBurn.hp;
        for (var bstep = 0; bstep < 30; bstep++) World.update(ctx);
        var lossS = hpS0 - slowBurn.hp, lossF = hpF0 - fastBurn.hp;
        var ratio = lossS > 0 ? lossF / lossS : 0;
        chk(lossS > 0 && ratio > 9.5 && ratio < 10.5,
          'burn DoT honours st.burnDmg (1 lost ' + lossS.toFixed(2) + ', 10 lost ' + lossF.toFixed(2) + ', ratio ' + ratio.toFixed(2) + ')');
        // With no payload the fallback is the authored RFD.ABILITIES.pyro dmg.
        var defBurn = spawnOne('grouper', 3240, 700, 0);
        if (defBurn) {
          defBurn.hp = defBurn.maxHp = 400;
          defBurn.st.burnT = 4; defBurn.st.burnDmg = 0;
          var hpD0 = defBurn.hp;
          for (var dstep = 0; dstep < 30; dstep++) World.update(ctx);
          var lossD = hpD0 - defBurn.hp;
          var A0 = (D().ABILITIES) || {};
          var want = (A0.pyro && A0.pyro.dmg > 0) ? A0.pyro.dmg : BURN_FALLBACK;
          chk(Math.abs(lossD - lossS * want) < Math.max(0.3, want * 0.2),
            'burn DoT falls back to RFD.ABILITIES.pyro.dmg when no payload (' + lossD.toFixed(2) + ' vs ' + (lossS * want).toFixed(2) + ')');
          if (defBurn.active) World.kill(defBurn, 'test');
        }
        // Poison honours st.poisonDmg the same way.
        var pz = spawnOne('grouper', 3360, 700, 0);
        if (pz) {
          pz.hp = pz.maxHp = 400;
          pz.st.poisonT = 4; pz.st.poisonDmg = 5;
          var hpP0 = pz.hp;
          for (var pstep = 0; pstep < 30; pstep++) World.update(ctx);
          var lossP = hpP0 - pz.hp;
          chk(lossP > lossS * 4 && lossP < lossS * 6,
            'poison DoT honours st.poisonDmg (' + lossP.toFixed(2) + ')');
          if (pz.active) World.kill(pz, 'test');
        }
        // Immunity: a fire-immune entity takes no burn and its timer clears.
        var imm = spawnOne('grouper', 3480, 700, 0);
        if (imm) {
          imm.hp = imm.maxHp = 400;
          imm.st.fireImmune = true;
          imm.st.burnT = 4; imm.st.burnDmg = 10;
          var hpI0 = imm.hp;
          World.update(ctx);
          chk(imm.hp === hpI0 && imm.st.burnT === 0, 'fireImmune entity took no burn and the timer cleared');
          if (imm.active) World.kill(imm, 'test');
        }
        if (slowBurn.active) World.kill(slowBurn, 'test');
        if (fastBurn.active) World.kill(fastBurn, 'test');
      }

      // Player passive immunities are published onto ctx.player.st so that
      // abilities.js sees them; entity flags are untouched by that sync.
      ctx.player.pas = { fireImmune: true, toxinEater: true };
      World.update(ctx);
      chk(ctx.player.st.fireImmune === true && ctx.player.st.toxinImmune === true,
        'resolved player passives published as st.fireImmune / st.toxinImmune');
      ctx.player.pas = null;

      // Predator hits surface through playerHits.
      var lowCtx = ctx;
      lowCtx.player.tier = 1;
      var pred = null;
      var SHK = (D().SHARKS) || [];
      for (var s = 0; s < SHK.length; s++) { if (SHK[s].npc && SHK[s].tier > 3) { pred = SHK[s]; break; } }
      if (pred) {
        var pe = spawnOne(pred.id, lowCtx.player.x + 30, lowCtx.player.y, 0);
        if (pe) {
          pe.st.biteCd = 0;
          World.update(lowCtx);
          var bit = false;
          for (var h = 0; h < playerHits.length; h++) { if (playerHits[h].ent === pe) bit = true; }
          chk(bit, 'higher-tier predator bit the player and pushed to playerHits (' + pred.id + ' t' + pred.tier + ')');
          chk(playerHits.length > 0 && playerHits[0].dmg > 0, 'playerHits carries positive damage');
          if (pe.active) World.kill(pe, 'test');
        }
      } else {
        notes.push('note: no npc shark above tier 3 in roster, predator bite path not exercised');
      }
      lowCtx.player.tier = 3;

      // dreadAura inverts flee into attraction (flag owned by abilities.js).
      ctx.player.x = 3600; ctx.player.y = 900; ctx.player.tier = 6;
      ctx.player.st.dreadAura = false;
      var fleeEnt = spawnOne('minnow', ctx.player.x + 120, ctx.player.y, 0);
      var d0 = Math.abs(fleeEnt.x - ctx.player.x);
      for (var q1 = 0; q1 < 20; q1++) World.update(ctx);
      var fledAway = Math.abs(fleeEnt.x - ctx.player.x) > d0;
      if (fleeEnt.active) World.kill(fleeEnt, 'test');

      ctx.player.st.dreadAura = true;
      var lureEnt = spawnOne('minnow', ctx.player.x + 120, ctx.player.y, 0);
      var d1 = Math.abs(lureEnt.x - ctx.player.x);
      for (var q2 = 0; q2 < 20; q2++) World.update(ctx);
      var drewIn = Math.abs(lureEnt.x - ctx.player.x) < d1;
      chk(fledAway && drewIn, 'prey flees normally and dreadAura inverts it to attraction');
      if (lureEnt.active) World.kill(lureEnt, 'test');
      ctx.player.st.dreadAura = false;
      ctx.player.tier = 3;

      // junkEater eats a mine instead of taking contact damage.
      // NOTE: a released entity object can be re-acquired as something else
      // inside the SAME update, so identity must be checked by id, never by
      // the object reference alone.
      ctx.player.st.junkEater = true;
      var jm = spawnOne('mine', ctx.player.x, ctx.player.y, 0);
      var jmId = jm.id;
      World.update(ctx);
      var tookMineDmg = false;
      for (var jh = 0; jh < playerHits.length; jh++) { if (playerHits[jh].ent === jm) tookMineDmg = true; }
      var mineGone = !(jm.active && jm.id === jmId && jm.defId === 'mine');
      chk(mineGone && !tookMineDmg, 'junkEater ate the mine with no contact damage');
      ctx.player.st.junkEater = false;

      chk(World.zoneAt(100) && World.zoneAt(100).id === 1, 'zoneAt(100) resolves to zone 1');
      // Rev 6: world grows to 14400x4800, zones rescale to yMax
      // 1200/2400/3600/4800 (6.4), so the zone-4 probe moves from 3500 to 4500.
      chk(World.zoneAt(4500) && World.zoneAt(4500).id === 4, 'zoneAt(4500) resolves to zone 4');
      var burst = World.spawnBurst('minnow', 500, 500, 5);
      chk(burst === 5, 'spawnBurst produced 5 entities');

      // ------------------------------------------------ Rev 4 living water
      // The clock these all run off is ctx.time.now when the host advances it
      // and an internal dt accumulator when it does not.
      var t0 = S.animT;
      ctx.time.now = S.animT + 5;
      var nowMark = ctx.time.now;
      World.update(ctx);
      chk(S.animT === nowMark, 'worldClock follows ctx.time.now when the host advances it (' + S.animT + ')');
      World.update(ctx);
      chk(S.animT > nowMark, 'worldClock falls back to accumulating dt when time.now is frozen (' + S.animT.toFixed(4) + ')');
      chk(t0 > 0, 'clock had already accumulated before time.now was set (' + t0.toFixed(3) + ')');

      // Registries are built ONCE and never grow.
      var regBefore = S.caustics.length + S.rays.length + S.seams.length +
                      S.swayers.length + S.reefSwayers.length + S.drifters.length;
      chk(S.caustics.length === CAUSTIC_N, 'caustic planes built (' + S.caustics.length + ')');
      chk(S.rays.length > 0, 'god rays registered for sway (' + S.rays.length + ')');
      var rayAtPlay = 0;
      for (var rzq = 0; rzq < S.rays.length; rzq++) if (S.rays[rzq].z === 25) rayAtPlay++;
      chk(S.rays.length === RAY_BANDS && rayAtPlay === 1,
        'god rays have four bands with one low-alpha band crossing z=+25 (' +
        S.rays.length + ' bands, ' + rayAtPlay + ' crossing)');
      chk(S.rays[0] && S.rays[0].aBase === 0.55 && S.rays[0].img.material.map,
        'god rays use the 0.55 animated ceiling and a shared feathered alpha map');
      chk(S.seams.length > 0, 'thermocline seams registered for drift (' + S.seams.length + ')');
      chk(S.swayers.length > 0, 'kelp registered for sway (' + S.swayers.length + ')');
      chk(S.reefBatches.length === 3 && S.reefSwayers.length === 2,
        'reef builds three merged batches with two rooted sway pivots (' +
        S.reefBatches.length + ' batches, ' + S.reefSwayers.length + ' pivots)');
      chk(S.drifters.length > 0, 'midwater silhouettes registered for drift (' + S.drifters.length + ')');
      chk(!!S.gradient && !!S.gradient.mesh, 'opaque world-anchored gradient sheet built');
      if (S.gradient && S.gradient.mesh) {
        var gm = S.gradient.mesh.material;
        var gp = S.gradient.mesh.geometry && S.gradient.mesh.geometry.attributes &&
          S.gradient.mesh.geometry.attributes.position;
        var gc = S.gradient.mesh.geometry && S.gradient.mesh.geometry.attributes &&
          S.gradient.mesh.geometry.attributes.color;
        var gxMin = Infinity, gxMax = -Infinity, gyMin = Infinity, gyMax = -Infinity;
        if (gp && gp.array) {
          for (var gi = 0; gi < gp.array.length; gi += 3) {
            if (gp.array[gi] < gxMin) gxMin = gp.array[gi];
            if (gp.array[gi] > gxMax) gxMax = gp.array[gi];
            if (gp.array[gi + 1] < gyMin) gyMin = gp.array[gi + 1];
            if (gp.array[gi + 1] > gyMax) gyMax = gp.array[gi + 1];
          }
        }
        chk(gm && gm.transparent === false && gm.fog === false && gm.depthWrite === true,
          'gradient material is opaque and fog-disabled');
        chk(gc && gc.itemSize === 4, 'gradient carries RGBA vertex colours');
        var gradientVerticesAtLocalZ = true;
        if (gp && gp.array) {
          for (var gz = 2; gz < gp.array.length; gz += 3) {
            if (gp.array[gz] !== 0) { gradientVerticesAtLocalZ = false; break; }
          }
        }
        chk(gradientVerticesAtLocalZ && Math.abs(S.gradient.mesh.position.z - Z_GRADIENT) < 1e-9,
          'gradient vertices use local z=0 and the mesh alone owns z=-500');
        // Rev 6: bounds scale with S.w/S.h (world grew to 14400x4800; 6.4).
        chk(gxMin <= -399.9 && gxMax >= S.w + 399.9 && gyMin <= -(S.h + 599.9) && gyMax >= 599.9,
          'gradient sheet spans world plus overshoot x -400..w+400, y -600..h+600');
      }
      chk(S.terrain.length === 4, 'terrain is exactly four ridge batches (' + S.terrain.length + ')');
      var terrainZOk = S.terrain.length === 4, terrainRgbaOk = true, terrainOpaque = true;
      var foregroundOk = false;
      for (var tri = 0; tri < S.terrain.length; tri++) {
        var to = S.terrain[tri] && S.terrain[tri].mesh;
        if (!to || !to.geometry || !to.geometry.userData || !to.geometry.userData.rfRidge ||
            !to.geometry.userData.rfRidgeFacets) terrainRgbaOk = false;
        if (!to || !to.geometry || !to.geometry.index || !to.geometry.drawRange ||
            to.geometry.drawRange.count !== to.geometry.userData.rfRidgeIndexCount) terrainRgbaOk = false;
        if (!to || !to.material || to.material.transparent !== false || to.material.fog !== false) terrainOpaque = false;
        if (!to || !to.geometry.attributes.color || to.geometry.attributes.color.itemSize !== 4) terrainRgbaOk = false;
        if (!to || Math.abs(to.position.z - Z_TERRAIN[tri]) > 1e-9) terrainZOk = false;
        if (tri === 3 && to && to.position.z > 0) foregroundOk = true;
      }
      chk(terrainZOk && terrainRgbaOk && terrainOpaque,
        'terrain ridges carry opaque fog-disabled RGBA batches at z -340/-200/-100/+45');
      chk(foregroundOk, 'foreground terrain occluder sits in front of gameplay at z ' +
        (S.terrain[3] && S.terrain[3].mesh ? S.terrain[3].mesh.position.z : 'missing'));
      var terrainShapeOk = true, terrainDepthOk = true, previousTerrainLuma = Infinity;
      for (var tsi = 0; tsi < 3; tsi++) {
        var terrainMesh = S.terrain[tsi] && S.terrain[tsi].mesh;
        var terrainMeta = terrainMesh && terrainMesh.userData;
        if (!terrainMeta || terrainMeta.rfTerrainLayer !== tsi ||
            terrainMeta.rfTerrainBaseSim !== S.h - TERRAIN_BASE_INSET ||
            terrainMeta.rfTerrainTopMinHeight !== TERRAIN_TOP_MIN_HEIGHT ||
            terrainMeta.rfTerrainTopMaxHeight !== TERRAIN_TOP_MAX_HEIGHT) {
          terrainShapeOk = false;
          continue;
        }
        var terrainPos = terrainMesh.geometry.attributes.position;
        var terrainCol = terrainMesh.geometry.attributes.color;
        var lumaSum = 0, lumaN = 0;
        for (var tsp = 0; tsp < 40; tsp++) {
          var topVertex = tsp * 3;
          var topSim = -terrainPos.getY(topVertex);
          var baseSim = -terrainPos.getY(topVertex + 2);
          var height = baseSim - topSim;
          if (height < TERRAIN_TOP_MIN_HEIGHT - 0.01 || height > TERRAIN_TOP_MAX_HEIGHT + 0.01) terrainShapeOk = false;
          var topColorOffset = topVertex * 4;
          lumaSum += terrainCol.array[topColorOffset] * 0.2126 +
            terrainCol.array[topColorOffset + 1] * 0.7152 + terrainCol.array[topColorOffset + 2] * 0.0722;
          lumaN++;
        }
        var terrainLuma = lumaN ? lumaSum / lumaN : 1;
        if (terrainLuma >= previousTerrainLuma) terrainDepthOk = false;
        previousTerrainLuma = terrainLuma;
      }
      var crownMeta = S.terrain[3] && S.terrain[3].mesh && S.terrain[3].mesh.userData;
      if (!crownMeta || crownMeta.rfTerrainCrownMinHeight !== CROWN_MIN_HEIGHT ||
          crownMeta.rfTerrainCrownMaxHeight !== CROWN_MAX_HEIGHT) terrainShapeOk = false;
      var crownPos = S.terrain[3] && S.terrain[3].mesh && S.terrain[3].mesh.geometry.attributes.position;
      if (!crownPos) terrainShapeOk = false;
      else {
        for (var csp = 0; csp < 18; csp++) {
          var crownTopVertex = csp * 3;
          var crownHeight = -crownPos.getY(crownTopVertex + 2) - (-crownPos.getY(crownTopVertex));
          if (crownHeight < CROWN_MIN_HEIGHT - 0.01 || crownHeight > CROWN_MAX_HEIGHT + 0.01) terrainShapeOk = false;
        }
      }
      chk(terrainShapeOk,
        'abyss terrain tops stay in the 42-180 world-unit bottom band and the crown remains a fringe');
      chk(terrainDepthOk,
        'terrain facet luminance darkens from far ridge to near ridge');
      chk(!!S.surface && !!S.surface.mesh && S.surface.segments === SURFACE_SEGMENTS,
        'surface ribbon built with ' + SURFACE_SEGMENTS + ' segments');
      chk(!!(S.surface && S.surface.foam), 'surface foam strip built');
      chk(!!(S.surface && S.surface.ribbonAttr && S.surface.ribbonAttr.array &&
        S.surface.ribbonAttr.array.length === (SURFACE_SEGMENTS + 1) * 2 * 3),
        'surface ribbon owns one preallocated position attribute');
      chk(!!(S.surface && S.surface.wash && S.surface.wash.material &&
        S.surface.wash.material.map && S.surface.ripple && S.surface.ripple.wrapS === THREE.RepeatWrapping),
        'surface wash uses the cached repeat-wrapped ripple texture');
      chk(!!(S.surface && S.surface.snell && S.surface.snell.material &&
        S.surface.snell.material.map), 'Snell window disc owns a baked radial map');
      chk(World.__depthTint(0xffffff, -100, 0x000000) !== World.__depthTint(0xffffff, -420, 0x000000) &&
        World.__lightAtDepth(0) === 1 && World.__lightAtDepth(S.h) === 0.45 &&
        World.__depthTint(0xffffff, -100, 0x000000) === 0xeaeaea &&
        World.__depthTint(0xffffff, -420, 0x000000) === 0x7f7f7f,
        'depth tint and vertical light helpers hit their authored endpoints');
      var ribbonAttr = S.surface.ribbonAttr;
      var ribbonArray = ribbonAttr.array;
      var ribbonY0 = ribbonArray[1];
      var ribbonVersion0 = ribbonAttr.version || 0;
      var rippleOffset0 = S.surface.ripple && S.surface.ripple.offset ? S.surface.ripple.offset.x : 0;

      // Water layers must actually MOVE across updates, and stay bounded.
      var ray0 = S.rays[0];
      var rayRotMin = Infinity, rayRotMax = -Infinity;
      var rayAlphaMin = Infinity, rayAlphaMax = -Infinity;
      var caX = [];
      var causticPeak = 0;
      var swayMin = Infinity, swayMax = -Infinity;
      var gradientZ0 = S.gradient.mesh.position.z;
      var terrainZ0 = S.terrain[0].mesh.position.z;
      var gradientOpacity0 = S.gradient.mesh.material.opacity;
      for (var wstep = 0; wstep < 900; wstep++) {
        ctx.time.now += 1 / 60;
        World.update(ctx);
        var rrot = ray0.pivot.rotation.z;
        var ralpha = ray0.img.material.opacity;
        if (rrot < rayRotMin) rayRotMin = rrot;
        if (rrot > rayRotMax) rayRotMax = rrot;
        if (ralpha < rayAlphaMin) rayAlphaMin = ralpha;
        if (ralpha > rayAlphaMax) rayAlphaMax = ralpha;
        if (wstep % 90 === 0) caX.push(S.caustics[0].img.position.x);
        for (var cap = 0; cap < S.caustics.length; cap++) {
          if (S.caustics[cap].img.material.opacity > causticPeak) {
            causticPeak = S.caustics[cap].img.material.opacity;
          }
        }
        var swR = S.swayers[0].img.rotation.z;
        if (swR < swayMin) swayMin = swR;
        if (swR > swayMax) swayMax = swR;
      }
      chk(rayRotMax - rayRotMin > 1e-4 && (rayRotMax - rayRotMin) <= RAY_ROT_AMP * 2.55,
        'god ray rotation sways within +-RAY_ROT_AMP (span ' + (rayRotMax - rayRotMin).toFixed(4) + ' rad)');
      chk(rayAlphaMin > 0 && rayAlphaMax <= ray0.aBase + 1e-9 &&
          rayAlphaMin >= ray0.aBase * RAY_ALPHA_LO - 1e-9,
        'god ray alpha cycles over the 0.35-1.0 band of its base (' +
        rayAlphaMin.toFixed(4) + ' to ' + rayAlphaMax.toFixed(4) + ')');
      var caMoved = false;
      for (var cq = 1; cq < caX.length; cq++) if (Math.abs(caX[cq] - caX[0]) > 1) caMoved = true;
      chk(caMoved, 'caustic plane drifts horizontally over time');
      chk(causticPeak > 0 && causticPeak <= 0.095,
        'caustics brighten without exceeding their ~0.09 ceiling (' + causticPeak.toFixed(4) + ')');
      chk(swayMax - swayMin > 1e-4 && Math.abs(swayMax) <= SWAY_AMP[1] * 1.6,
        'kelp sways in rotation about its rooted base (span ' + (swayMax - swayMin).toFixed(4) + ' rad)');
      chk(S.gradient.mesh.position.z === gradientZ0 && S.terrain[0].mesh.position.z === terrainZ0 &&
          S.gradient.mesh.material.opacity === gradientOpacity0,
        'gradient and terrain remain static while animateWater updates its registries');
      var regAfter = S.caustics.length + S.rays.length + S.seams.length +
                     S.swayers.length + S.reefSwayers.length + S.drifters.length;
      chk(regAfter === regBefore, 'animation registries never grow during update (' + regAfter + ')');
      chk(S.surface.ribbonAttr === ribbonAttr && S.surface.ribbonAttr.array === ribbonArray &&
        ribbonArray[1] !== ribbonY0 && ((ribbonAttr.version || 0) > ribbonVersion0),
        'surface ribbon updates its stable attribute across fixed steps with no rebuild');
      chk(!S.surface.ripple || !S.surface.ripple.offset || S.surface.ripple.offset.x !== rippleOffset0,
        'surface ripple scrolls its cached texture offset without allocating');
      chk(S.surface.snell && S.surface.snell.material && S.surface.snell.material.opacity > 0,
        'Snell window is visible in the shallow atmosphere');
      var deepYForSurface = ZONE_SIL.length > 2 && zones()[2]
        ? (zones()[2].yMin + zones()[2].yMax) * 0.5 : 2000;
      ctx.player.x = 1234; ctx.player.y = deepYForSurface; ctx.time.now += 1 / 60;
      World.update(ctx);
      chk(S.surface.snell && S.surface.snell.material && S.surface.snell.material.opacity === 0,
        'Snell window alpha is zero by zone 3');
      chk(S.surface.snell && S.surface.snell.position && S.surface.snell.position.x === ctx.player.x,
        'Snell window follows the player camera x fallback');
      ctx.camera = { position: { x: 2222, y: -deepYForSurface } };
      ctx.time.now += 1 / 60;
      World.update(ctx);
      chk(S.surface.snell && S.surface.snell.position && S.surface.snell.position.x === 2222,
        'Snell window follows the explicit camera x when supplied');
      delete ctx.camera;
      ctx.player.x = 3600; ctx.player.y = 500;

      // Phase spread: no two rays share a phase, so the layer cannot pulse in
      // unison.
      var samePhase = 0;
      for (var pa = 1; pa < S.rays.length; pa++) {
        if (S.rays[pa].rotPhase === S.rays[pa - 1].rotPhase) samePhase++;
      }
      chk(samePhase === 0, 'every god ray carries its own phase (0 duplicates across ' + S.rays.length + ')');

      // ------------------------------------------------------- zone atmo
      // The crossing must be UNMISTAKABLE: fog colour, fog density and the
      // renderer clear colour all have to change materially between the shelf
      // and the abyss, and the density must rise monotonically with depth.
      //
      // PERF-01: applyZoneAtmo returns MODULE SCRATCH, one object rewritten in
      // place, so every sample below copies the scalars it needs out of the
      // report before the next call. That is the documented contract and this
      // block is written to honour it (the old code held two reports at once,
      // which under the scratch contract would have compared an object to
      // itself and passed vacuously).
      var Zs = zones();
      var densities = [], fogs = [], clearsSeen = [], keeps = [];
      var reportIdentity = null;
      for (var za = 0; za < Zs.length; za++) {
        var mid = (Zs[za].yMin + Zs[za].yMax) * 0.5;
        var rep = World.applyZoneAtmo(scene, renderer, mid);
        if (reportIdentity === null) reportIdentity = rep;
        densities.push(rep.density);
        fogs.push(rep.fog);
        clearsSeen.push(rep.clear);
        keeps.push(rep.fogNearKeep);
        chk(rep.zone === Zs[za].id, 'applyZoneAtmo resolved zone ' + Zs[za].id + ' at its mid depth');
      }
      var monotone = true;
      for (var dq = 1; dq < densities.length; dq++) if (densities[dq] <= densities[dq - 1]) monotone = false;
      chk(monotone, 'fog density rises monotonically with depth (' +
        densities.map(function (v) { return v.toFixed(5); }).join(' < ') + ')');
      chk(fogs[0] !== fogs[fogs.length - 1] && clearsSeen[0] !== clearsSeen[clearsSeen.length - 1],
        'shelf and abyss differ in both fog and clear colour');
      chk(S.fog && Math.abs(S.fog.density - densities[densities.length - 1]) < 1e-12,
        'scene fog carries the applied density');
      chk(clears.length > 0, 'renderer clear colour was actually driven (' + clears.length + ' writes)');

      // PERF-01: the report is the SAME OBJECT every call. A fresh object per
      // fixed step was the finding; identity is the direct proof it is gone.
      var repAgain = World.applyZoneAtmo(scene, renderer, 500);
      chk(repAgain === reportIdentity && repAgain === World.__atmoReport,
        'PERF-01: applyZoneAtmo writes module scratch, it never allocates a report');

      // ATMO-01 FOREGROUND GUARD. The binding requirement is that the player
      // shark never grays out. The gameplay plane sits FOG_NEAR units from the
      // camera, so the fog fraction there is exp(-(density*FOG_NEAR)^2) and it
      // is never zero. This asserts the foreground keeps at least
      // FOREGROUND_KEEP of its own colour AT EVERY DEPTH, which is the
      // machine-checkable form of the requirement. A number, not a hope.
      var worstKeep = 1;
      for (var kq = 0; kq < keeps.length; kq++) if (keeps[kq] < worstKeep) worstKeep = keeps[kq];
      chk(worstKeep >= FOREGROUND_KEEP - 1e-9,
        'ATMO-01: gameplay plane keeps >= ' + (FOREGROUND_KEEP * 100).toFixed(0) +
        ' percent of its own chroma at every depth (worst ' +
        (worstKeep * 100).toFixed(1) + ' percent, deepest density ' +
        densities[densities.length - 1].toFixed(5) + ')');
      // The guard must also be structural: no zone table, however it is
      // retuned in data.js, can push the density past the cap.
      chk(guardDensity(FOG_D1 * 10) <= FOG_D_MAX + 1e-12,
        'ATMO-01: the density guard clamps any zone table, not just the shipped one (cap ' +
        FOG_D_MAX.toFixed(6) + ')');
      // And depth still has to MEAN something. Note WHERE the cue now comes
      // from, because the tune deliberately moved it: fog alone cannot carry
      // it any more, since clamping the play plane to 92 percent also caps how
      // hard the far band can fog (the far band is only 1.7x further out, and
      // FogExp2 is smooth). At the deepest legal density the far parallax band
      // keeps about 80 percent against the play plane's 92, a 12 point
      // separation, which is a haze rather than a curtain.
      //
      // That is the right trade and not a shortfall, because the far band is
      // drawn at 0.25 to 0.50 opacity in the first place: it was never going
      // to be erased by fog, it is erased by having almost no alpha. The cue
      // that actually reads at depth is the CLEAR COLOUR going near black
      // while the lit foreground does not, plus the light dimming, and both of
      // those are asserted directly. Fog's remaining job is the soft
      // separation between the play plane and the band, which this measures.
      var deepD = densities[densities.length - 1];
      var farKeep = Math.exp(-(deepD * 1040) * (deepD * 1040));
      chk(worstKeep - farKeep > 0.10,
        'ATMO-01: fog still separates the play plane from the far parallax band (' +
        (farKeep * 100).toFixed(1) + ' percent kept at z -420 vs ' +
        (worstKeep * 100).toFixed(1) + ' percent on the play plane)');
      // The clear colour is the cue that carries the depth read now, so it has
      // to actually go dark: the abyss clear must be materially darker than
      // the shelf clear.
      function lum(c) {
        return (((c >> 16) & 255) * 0.299 + ((c >> 8) & 255) * 0.587 + (c & 255) * 0.114) / 255;
      }
      var shelfLum = lum(clearsSeen[0]), abyssLum = lum(clearsSeen[clearsSeen.length - 1]);
      chk(abyssLum < shelfLum * 0.6,
        'ATMO-01: the clear colour carries the depth read, abyss is much darker than the shelf (' +
        shelfLum.toFixed(3) + ' -> ' + abyssLum.toFixed(3) + ')');

      // ATMO-01 SATURATION GATE. "Bright" and "bright and saturated" are not
      // the same requirement, and the first retune delivered the wrong one:
      // the shelf read as pastel baby-blue milk because CLEAR_MIX dragged the
      // clear colour 55 percent of the way from the authored tint toward the
      // near-white zone fog. Luminance alone cannot catch that, because a
      // washed-out frame is BRIGHTER, not darker. This measures HSV saturation
      // directly so the failure mode has its own assertion.
      function sat(c) {
        var r = ((c >> 16) & 255) / 255, g = ((c >> 8) & 255) / 255, b = (c & 255) / 255;
        var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        return mx <= 0 ? 0 : (mx - mn) / mx;
      }
      var shelfSat = sat(clearsSeen[0]);
      chk(shelfSat >= 0.45,
        'ATMO-01: the zone-1 clear colour stays SATURATED, not pastel (HSV S ' +
        shelfSat.toFixed(3) + ' >= 0.45, clear #' +
        (clearsSeen[0] >>> 0).toString(16) + ')');
      // The clear must also stay recognisably the AUTHORED water colour rather
      // than drifting toward the fog: it may be lifted, never replaced.
      var authoredSat = sat(hexNum(Zs[0].tint));
      chk(shelfSat >= authoredSat * 0.7,
        'ATMO-01: the shelf clear keeps most of the authored tint saturation (' +
        shelfSat.toFixed(3) + ' vs authored ' + authoredSat.toFixed(3) + ')');
      // Every zone, not just the shelf: no depth may go pastel.
      var worstSat = 1, worstZone = -1;
      for (var sq = 0; sq < clearsSeen.length; sq++) {
        var zs = sat(clearsSeen[sq]);
        if (zs < worstSat) { worstSat = zs; worstZone = Zs[sq].id; }
      }
      chk(worstSat >= 0.45,
        'ATMO-01: no zone clear colour goes pastel (worst S ' + worstSat.toFixed(3) +
        ' at zone ' + worstZone + ')');

      // God rays are LIGHT ACCENTS, not white slabs. The batching pass moved
      // shaft alpha from the material to the vertex channel and accidentally
      // raised the ceiling; four additive shafts in one merged band overlap
      // and SUM, so the cap has to account for stacking.
      var rayPeak = 0;
      for (var rq = 0; rq < S.rays.length; rq++) {
        var rgeo = S.rays[rq].img && S.rays[rq].img.geometry;
        var rcol = rgeo && rgeo.attributes && rgeo.attributes.color;
        if (!rcol || !rcol.array) continue;
        for (var rv = 3; rv < rcol.array.length; rv += 4) {
          if (rcol.array[rv] > rayPeak) rayPeak = rcol.array[rv];
        }
      }
      chk(rayPeak > 0 && rayPeak <= 0.028 + 1e-9,
        'ATMO-01: god-ray shafts are accents not slabs, peak vertex alpha ' +
        rayPeak.toFixed(3) + ' <= 0.028 before the shared feather map');

      // ATMO-01 LIGHT OWNERSHIP. This module is the SOLE writer of the
      // engine's lights (Rev 2). Hand it a pair of stub lights and prove they
      // are actually driven, that they dim with depth, and that they never
      // fall to the washed-out floor the engine's second formula used.
      var stubHemi = {
        isLight: true, color: { hex: 0, setHex: function (h) { this.hex = h; } },
        groundColor: { hex: 0, setHex: function (h) { this.hex = h; } }, intensity: 0,
      };
      var stubSun = {
        isLight: true, color: { hex: 0, setHex: function (h) { this.hex = h; } }, intensity: 0,
      };
      World.setLights({ hemi: stubHemi, sun: stubSun });
      World.applyZoneAtmo(scene, renderer, (Zs[0].yMin + Zs[0].yMax) * 0.5);
      var shallowHemi = stubHemi.intensity, shallowSun = stubSun.intensity;
      var shallowHemiCol = stubHemi.color.hex;
      var lastZ = Zs[Zs.length - 1];
      World.applyZoneAtmo(scene, renderer, (lastZ.yMin + lastZ.yMax) * 0.5);
      var deepHemi = stubHemi.intensity, deepSun = stubSun.intensity;
      chk(shallowHemi > 0 && shallowSun > 0,
        'ATMO-01: world3d drives the engine hemisphere and sun (' +
        shallowHemi.toFixed(2) + ' / ' + shallowSun.toFixed(2) + ' at the shelf)');
      chk(deepHemi < shallowHemi && deepSun < shallowSun,
        'ATMO-01: light dims with depth (' + shallowHemi.toFixed(2) + ' -> ' +
        deepHemi.toFixed(2) + ' hemi, ' + shallowSun.toFixed(2) + ' -> ' +
        deepSun.toFixed(2) + ' sun)');
      chk(deepHemi >= 0.6 && deepSun >= 0.55,
        'ATMO-01: the deep light floor stays well above the old 0.35 wash-out (' +
        deepHemi.toFixed(2) + ' hemi, ' + deepSun.toFixed(2) + ' sun)');
      chk(shallowHemiCol === hexNum(Zs[0].tint),
        'ATMO-01: hemisphere sky tracks the zone TINT, not the fog gray (0x' +
        (shallowHemiCol >>> 0).toString(16) + ')');
      chk(stubHemi.groundColor.hex === HEMI_GROUND,
        'ATMO-01: hemisphere ground never goes fully black, so belly countershading survives');
      World.setLights(null);

      // The blend is CONTINUOUS: sampling either side of a boundary must give
      // a small step, not a jump, which is what makes a crossing read as water
      // changing rather than a palette swap. Scalars are copied out of the
      // scratch report immediately, per the contract above.
      var bY = Zs[0].yMax;
      var densA = World.applyZoneAtmo(scene, renderer, bY - 4).density;
      var densB = World.applyZoneAtmo(scene, renderer, bY + 4).density;
      chk(Math.abs(densA - densB) < (densities[1] - densities[0]) * 0.5,
        'atmosphere blends across a zone boundary instead of stepping (delta ' +
        Math.abs(densA - densB).toFixed(6) + ')');

      // ---------------------------------------------- Rev 4 creature motion
      // A swimming fish's billboard rotation must change across updates, and
      // must return to its heading baseline when frozen.
      ctx.player.x = 3600; ctx.player.y = 900; ctx.player.tier = 3;
      var wf = spawnOne('mackerel', 3600 + 700, 900, 0);
      if (wf) {
        var wfInstanced = !!(wf._viewRec && wf._viewRec.instanced);
        if (wfInstanced) {
          chk(wf.sprite && wf.sprite.isInstancedMesh && wf._viewRec.batch,
            'swimming fish uses the shared instanced loft motion path');
          World.kill(wf, 'test');
        } else {
          wf.vx = (wf.def.speed || 160); wf.vy = 0;
          var offMin = Infinity, offMax = -Infinity, sawOff = 0;
          for (var ws = 0; ws < 120; ws++) {
            ctx.time.now += 1 / 60;
            World.update(ctx);
            if (!wf.active) break;
            // Rotation is stored NEGATED (sim y is down, three y is up) and the
            // baseline is the smoothed display heading, so the wiggle is the
            // difference between the two.
            var shown = -wf.sprite.rotation.z;
            var baseA = wf.st.faceA;
            if (Math.cos(baseA) < 0) baseA = Math.PI - baseA;
            var off = shown - baseA;
            while (off > Math.PI) off -= TAU;
            while (off < -Math.PI) off += TAU;
            if (off < offMin) offMin = off;
            if (off > offMax) offMax = off;
            if (Math.abs(off) > 1e-6) sawOff++;
          }
          chk(wf.active && sawOff > 10 && (offMax - offMin) > 1e-3,
            'swimming fish billboard rotation oscillates around its heading (span ' +
            (offMax - offMin).toFixed(4) + ' rad over ' + sawOff + ' frames)');
          chk(Math.abs(offMax) <= FISH_WIGGLE * 1.05 && Math.abs(offMin) <= FISH_WIGGLE * 1.05,
            'fish wiggle stays inside +-FISH_WIGGLE (' + FISH_WIGGLE + ')');

          // Frozen: the offset must collapse to the baseline, so a frozen fish
          // reads genuinely held rather than twitching in place.
          wf.st.frozenT = 5;
          var frozenOffMax = 0;
          for (var fs = 0; fs < 60; fs++) {
            ctx.time.now += 1 / 60;
            World.update(ctx);
            if (!wf.active) break;
            var fshown = -wf.sprite.rotation.z;
            var fbase = wf.st.faceA;
            if (Math.cos(fbase) < 0) fbase = Math.PI - fbase;
            var foff = Math.abs(fshown - fbase);
            while (foff > Math.PI) foff = Math.abs(foff - TAU);
            if (foff > frozenOffMax) frozenOffMax = foff;
          }
          chk(wf.active && frozenOffMax < 1e-9,
            'frozen fish returns to its heading baseline, no residual wiggle (' + frozenOffMax + ')');
          wf.st.frozenT = 0;
          if (wf.active) World.kill(wf, 'test');
        }
      }

      // Facing mirror: a fish swimming LEFT must carry a negative x scale, and
      // one swimming RIGHT a positive one. This is the 3D form of flipX.
      var mf = spawnOne('mackerel', 3600 + 600, 900, 0);
      if (mf) {
        if (mf._viewRec && mf._viewRec.instanced) {
          chk(mf.sprite && mf.sprite.isInstancedMesh,
            'instanced fish uses a half-turn for left-facing geometry');
        } else {
          mf.vx = -200; mf.vy = 0; mf.angle = Math.PI; mf.st.faceA = Math.PI;
          World.update(ctx);
          var leftScale = mf.active ? mf.sprite.scale.x : 0;
          if (mf.active) {
            mf.vx = 200; mf.angle = 0; mf.st.faceA = 0;
            World.update(ctx);
            var rightScale = mf.sprite.scale.x;
            chk(leftScale < 0 && rightScale > 0,
              'billboard mirrors by negative x scale when facing left (' +
              leftScale.toFixed(1) + ' left, ' + rightScale.toFixed(1) + ' right)');
          }
        }
        if (mf.active) World.kill(mf, 'test');
      }

      // Phase is derived from entity id, so two entities spawned in the same
      // burst are never synchronised.
      var s1 = spawnOne('minnow', 2000, 800, 0);
      var s2 = spawnOne('minnow', 2040, 800, 0);
      if (s1 && s2) {
        chk(Math.abs(entPhase(s1) - entPhase(s2)) > 0.5,
          'consecutive entity ids get well separated phases (' +
          entPhase(s1).toFixed(3) + ' vs ' + entPhase(s2).toFixed(3) + ')');
        World.kill(s1, 'test'); World.kill(s2, 'test');
      }

      // Puffer inflation EASES rather than snapping.
      var pf = spawnOne('puffer', ctx.player.x + 40, ctx.player.y, 0);
      if (pf) {
        pf.st.inflated = false; pf.st.puffS = 1;
        World.update(ctx);   // player is inside PUFFER_NEAR, so it inflates
        var frames = 0, prev = pf.st.puffS;
        while (pf.active && pf.st.puffS < 1.5 - 1e-9 && frames < 120) {
          ctx.time.now += 1 / 60;
          World.update(ctx);
          if (!pf.active) break;
          if (pf.st.puffS < prev - 1e-9) break;
          prev = pf.st.puffS;
          frames++;
        }
        chk(frames >= 3, 'puffer inflate animates over multiple frames instead of snapping (' + frames + ' frames)');
        chk(!pf.active || Math.abs(pf.st.puffS - 1.5) < 1e-6,
          'puffer inflate lands exactly on its target scale (' + pf.st.puffS.toFixed(4) + ')');
        if (pf.active) World.kill(pf, 'test');
      }

      // A recycled pool object must not inherit a previous puffer's scale.
      var recyc = spawnOne('minnow', 2500, 900, 0);
      if (recyc) {
        chk(recyc.st.puffS === 1, 'resetSt clears the eased puffer scale on a recycled entity');
        World.kill(recyc, 'test');
      }

      // Pickups glint: opacity must vary and stay inside 1-GLINT_AMP .. 1.
      // Keep the test drop well outside the player pickup radius even if a
      // preceding motion probe left the player at a different valid position.
      ctx.player.x = 3600; ctx.player.y = 900;
      var pk = spawnOne('minnow', 300, 2200, 0);
      if (pk) {
        var pickupFloorId = S.nextId;
        World.kill(pk, 'eaten');   // drops a pickup
        var pickEnt = null;
        for (var pe2 = 0; pe2 < S.entities.length; pe2++) {
          if (S.entities[pe2].kind === 'pickup' && S.entities[pe2].id >= pickupFloorId) {
            pickEnt = S.entities[pe2]; break;
          }
        }
        if (pickEnt) {
          var gMin = Infinity, gMax = -Infinity;
          var pid = pickEnt.id;
          for (var gs = 0; gs < 90; gs++) {
            ctx.time.now += 1 / 60;
            World.update(ctx);
            if (!(pickEnt.active && pickEnt.id === pid)) {
              break;
            }
            var op = pickEnt.sprite.material ? pickEnt.sprite.material.opacity : 1;
            if (op < gMin) gMin = op;
            if (op > gMax) gMax = op;
          }
          chk(gMax - gMin > 1e-4 && gMin >= 1 - GLINT_AMP - 1e-9 && gMax <= 1 + 1e-9,
            'pickup glints inside its alpha band (' + gMin.toFixed(4) + ' to ' + gMax.toFixed(4) + ')');
        } else {
          notes.push('note: no pickup was dropped, glint path not exercised');
        }
      }

      // The billboard's HEIGHT follows the bake's own aspect, and its LENGTH
      // follows the sim's display size, which derives from the collision
      // radius. That ordering is what stops the art disagreeing with the
      // hitbox while still letting a tall bake stay tall.
      var asp = spawnOne('jelly', 3000, 950, 0);
      if (asp && asp.sprite && asp._viewRec) {
        var wantLen = displayLen(asp.def, 'hazard');
        chk(Math.abs(Math.abs(asp.sprite.scale.x) - wantLen) < 1e-6,
          'billboard length is the sim display size, not the bake width (' +
          Math.abs(asp.sprite.scale.x).toFixed(2) + ' vs ' + wantLen.toFixed(2) + ')');
        chk(asp._viewRec.aspect > 0,
          'bake aspect captured before the sim scale overwrote it (' + asp._viewRec.aspect.toFixed(3) + ')');
        World.kill(asp, 'test');
      }

      // Status tint must be PRIVATE: tinting one frozen entity may not tint
      // any other entity that shares its bake.
      var t1 = spawnOne('minnow', 2700, 950, 0);
      var t2 = spawnOne('minnow', 2760, 950, 0);
      if (t1 && t2 && t1.sprite && t2.sprite && t1.sprite.material && t2.sprite.material) {
        if (t1._viewRec && t1._viewRec.instanced && t2._viewRec && t2._viewRec.instanced) {
          chk(t1._viewRec.batch === t2._viewRec.batch,
            'same-def fish share one instanced batch for zero-allocation tinting');
          t1.st.frozenT = 3;
          World.update(ctx);
          var c1 = t1._viewRec.batch.colors.array;
          var c2 = t2._viewRec.batch.colors.array;
          chk(c1[t1._viewRec.slot * 3] !== c1[t2._viewRec.slot * 3] ||
            c1[t1._viewRec.slot * 3 + 1] !== c1[t2._viewRec.slot * 3 + 1] ||
            c1[t1._viewRec.slot * 3 + 2] !== c1[t2._viewRec.slot * 3 + 2],
            'frozen instanced fish receives a private instance tint');
          void c2;
        } else {
          chk(t1.sprite.material !== t2.sprite.material,
            'two entities of the same def own separate materials, so a status tint cannot leak');
          t1.st.frozenT = 3;
          World.update(ctx);
          var tinted = t1.active && t1.sprite.material.color &&
            t1.sprite.material.color.getHex() === TINT_FROZEN;
          var clean = !t2.active || !t2.sprite.material.color ||
            t2.sprite.material.color.getHex() !== TINT_FROZEN;
          chk(tinted && clean, 'frozen entity tinted and its shoal-mate did not');
        }
        if (t1.active) { t1.st.frozenT = 0; World.kill(t1, 'test'); }
        if (t2.active) World.kill(t2, 'test');
      }

      // Ambient density: SPEC Rev 4 asks for roughly 2x emission per zone.
      var REV3_EVERY = [0.22, 0.26, 0.30, 0.70];
      var densityOk = true, densityNote = '';
      for (var az = 0; az < AMBIENT.length; az++) {
        var aratio = REV3_EVERY[az] / AMBIENT[az].every;
        if (aratio < 1.85) densityOk = false;
        densityNote += (az ? ', ' : '') + 'z' + (az + 1) + ' ' + aratio.toFixed(2) + 'x';
      }
      chk(densityOk, 'ambient emission cadence raised about 2x per zone (' + densityNote + ')');

      // Ambient motes ride the FOREGROUND parallax band from the space
      // contract, so the water reads as a volume the player is inside.
      chk(ambientOpts.z >= MOTE_Z[0] && ambientOpts.z <= MOTE_Z[1],
        'ambient emission carries a foreground z in [' + MOTE_Z[0] + '..' + MOTE_Z[1] + '] (' + ambientOpts.z.toFixed(1) + ')');

      // RF-PACK-01: pack records are pooled and capped.
      var packsBefore = S.packs.size;
      for (var pu = 0; pu < 2000; pu++) {
        ctx.player.x = 3600 + Math.sin(pu * 0.031) * 2400;
        ctx.player.y = 1400 + Math.cos(pu * 0.017) * 1200;
        ctx.time.frame = pu;
        World.update(ctx);
      }
      chk(S.packs.size <= PACK_MAX,
        'pack records bounded after 2000 updates (' + S.packs.size + ' <= ' + PACK_MAX + ', started ' + packsBefore + ')');
      chk(packRecs.length <= PACK_MAX, 'pack record pool never exceeded PACK_MAX (' + packRecs.length + ')');
      chk(S.packSeq > PACK_MAX + 1, 'more packs were created than the cap, so recycling was actually exercised (' + (S.packSeq - 1) + ' packs)');

      // RF-PERF-01: hit records are pooled.
      chk(hitPool.length <= 64, 'hit record pool stayed small (' + hitPool.length + ' records)');

      // ----------------------------------------------------- NO-ALLOC gate
      // The 3D render half must not create three objects per frame. The scene
      // collector counts every add(): after the world has run long enough for
      // every def in the roster to have been shown once, a further long run
      // must add NOTHING. This is the 3D form of world.js's zero-allocation
      // law, and it is the check that would catch a billboard built per frame.
      // WARM-UP must cover every def the spawner can reach, in every zone, at
      // that def's own concurrent peak. That is a long tour: the player is
      // swept through the full depth of the world so all four zone spawn
      // tables and both NPC shark rolls are exercised repeatedly.
      var growTrace = [];
      for (var warm = 0; warm < 8000; warm++) {
        ctx.player.x = 3600 + Math.sin(warm * 0.043) * 2600;
        ctx.player.y = 1780 + Math.cos(warm * 0.0075) * 1700;
        ctx.time.now += 1 / 60;
        World.update(ctx);
        if (warm % 2000 === 0) growTrace.push(added.length);
      }
      var addedWarm = added.length;
      // STEADY STATE. Once every def has seen its peak, a further long run of
      // the SAME tour must create nothing at all. This is the 3D form of
      // world.js's zero-allocation law and the check that catches a billboard
      // built per frame.
      for (var cold = 0; cold < 4000; cold++) {
        ctx.player.x = 3600 + Math.sin(cold * 0.043) * 2600;
        ctx.player.y = 1780 + Math.cos(cold * 0.0075) * 1700;
        ctx.time.now += 1 / 60;
        World.update(ctx);
      }
      notes.push('trace scene-object count during warm-up: ' + growTrace.join(' -> ') + ' -> ' + addedWarm);
      // WHAT THIS ASSERTS, AND WHY IT IS NOT "EXACTLY ZERO".
      //
      // Per-frame allocation is the thing the law forbids, and this catches it
      // absolutely: a billboard built per frame would add thousands of objects
      // across 4000 steps. What it does NOT demand is a hard zero, because
      // view creation is driven by each def's CONCURRENT PEAK, and peaks are
      // stochastic: a def that has so far only ever had 8 alive at once will,
      // eventually, get a roll that puts 9 on screen, and that ninth view is
      // built once and then reused forever.
      //
      // Measured over 100k updates (about 28 minutes of play at 60fps) the
      // growth per 10k block was 641, 32, 13, 13, 13, 2, 9, 3, 0, 4, plateauing
      // near 730 objects. That is a convergent tail, not a leak: the block
      // deltas fall toward zero while the total flattens. A leak holds its
      // per-block delta CONSTANT as the run lengthens.
      //
      // The gate is therefore a RATE: steady-state creation must be a tiny
      // fraction of what one-per-frame would produce.
      var grew = added.length - addedWarm;
      // Bounds scale with ENTITY_BUDGET (re-baselined when the budget rose to
      // 110/220): the tail must stay a tiny fraction of one-per-frame (4000),
      // and the plateau is bounded by peak concurrent views per entity slot.
      // The fish loft and shark rig caches add a small bounded warm tail even
      // after the roster tour has covered every def. Keep the gate well below
      // one-view-per-step allocation while allowing that documented cache
      // convergence to settle.
      var tailCap = Math.max(24, Math.ceil(budget().total * 1.2));
      var plateauCap = budget().total * 6.5;
      chk(grew <= tailCap,
        'steady-state scene creation is a convergent tail, not per-frame allocation (' +
        grew + ' objects across 4000 updates, cap ' + tailCap + ', one-per-frame would be thousands)');
      chk(added.length < plateauCap,
        'total scene object count plateaus inside the memory budget (' + added.length + ' < ' + plateauCap + ')');
      chk(S.viewsDisposed >= 0, 'surplus views disposed rather than leaked (' + S.viewsDisposed + ' disposals)');

      // Views are pooled GLOBALLY per key, so the total is bounded by the peak
      // concurrent entity count, not by pool size times roster size.
      var viewKeys = 0, viewObjs = 0;
      for (var vk in S.views) {
        if (!Object.prototype.hasOwnProperty.call(S.views, vk)) continue;
        viewKeys++;
        viewObjs += S.views[vk].free.length;
      }
      chk(viewObjs === S.viewsIdle,
        'idle view counter agrees with the actual free lists (' + viewObjs + ')');
      var overCap = 0, worstKey = 0;
      for (var vk2 in S.views) {
        if (!Object.prototype.hasOwnProperty.call(S.views, vk2)) continue;
        var bk = S.views[vk2];
        if (bk.free.length > bk.peak || bk.free.length > VIEW_KEY_CEIL) overCap++;
        if (bk.free.length > worstKey) worstKey = bk.free.length;
      }
      chk(overCap === 0,
        'no view key retains more idle than its own peak or the hard ceiling (worst key ' +
        worstKey + ', ceiling ' + VIEW_KEY_CEIL + ')');
      chk(viewObjs <= viewKeys * VIEW_KEY_CEIL,
        'idle views bounded by keys times the ceiling (' + viewObjs + ' <= ' +
        (viewKeys * VIEW_KEY_CEIL) + ')');

      // ============================================ LIFE-01 teardown cycles
      //
      // The review's finding was that a restart left the previous run's decor,
      // seams, rays, surface, billboards, rigs and materials attached to the
      // scene forever, because init() only truncated JavaScript arrays.
      //
      // This proves the fix the way the fix has to be proven: run the FULL
      // lifecycle five times against a scene stub that tracks its own child
      // list (add AND remove), and require the child list to come back to its
      // baseline every cycle. A leak of even one decor batch per run shows up
      // immediately as a child count that ratchets. Disposal is checked
      // against the SAME stub's dispose counters, which throw on a double
      // dispose, so "disposed everything" and "disposed nothing twice" are
      // both covered.
      //
      // The stub is separate from the `scene` used above so this block cannot
      // be confused by the 700-odd objects that run left behind on purpose.
      var lifeChildren = [];
      var lifeScene = {
        fog: null,
        add: function (o) {
          lifeChildren.push(o);
          if (o) o.parent = lifeScene;
          return this;
        },
        remove: function (o) {
          var ix = lifeChildren.indexOf(o);
          if (ix >= 0) { lifeChildren[ix] = lifeChildren[lifeChildren.length - 1]; lifeChildren.pop(); }
          if (o) o.parent = null;
          return this;
        },
      };
      var lifeCtx = {
        rng: rngStub,
        renderer: renderer,
        time: { now: 0, dt: 1 / 60, frame: 0 },
        run: { score: 0, coins: 0 },
        player: { x: 3600, y: 500, tier: 3, r: 30, st: {} },
        lights: { hemi: stubHemi, sun: stubSun },
      };

      var cycleChildren = [];
      var cycleCreated = [];
      var cyclePeak = [];
      var lifeFail = '';
      for (var cyc = 0; cyc < 5; cyc++) {
        var beforeChildren = lifeChildren.length;
        World.init(lifeScene, lifeCtx);
        // Play a little so entities spawn, views are checked out, rigs are
        // built and ambient state is live. A teardown from a COLD world would
        // prove much less than a teardown from a running one.
        for (var lf = 0; lf < 400; lf++) {
          lifeCtx.player.x = 3600 + Math.sin(lf * 0.05) * 2400;
          lifeCtx.player.y = 900 + Math.cos(lf * 0.02) * 800;
          lifeCtx.time.now += 1 / 60;
          World.update(lifeCtx);
        }
        cyclePeak.push(lifeChildren.length);
        cycleCreated.push(lifeChildren.length - beforeChildren);
        World.teardown();
        cycleChildren.push(lifeChildren.length);
        if (lifeChildren.length !== 0 && !lifeFail) {
          lifeFail = 'cycle ' + cyc + ' left ' + lifeChildren.length + ' children attached';
        }
      }
      chk(lifeFail === '' && cycleChildren[cycleChildren.length - 1] === 0,
        'LIFE-01: five init/teardown cycles return the scene child list to baseline 0 (' +
        cycleChildren.join(', ') + ' after each teardown; peaks ' + cyclePeak.join(', ') + ')' +
        (lifeFail ? ' ' + lifeFail : ''));

      // IN-PAGE CONFIGURATION. The cycles above run against a stub scene, and
      // a stub scene has no RF.Fx, so they proved only this module's OWN
      // objects. In the page RF.Fx is real, World.init() calls RF.Fx.init(),
      // and that attaches nine THREE.Points particle pools (bubbles, motes,
      // elementSpark, ring, beamCore, swimtrail, speedlines, breach, ambient;
      // goldpulse is a DOM overlay per UI_LAW and adds no scene child).
      // Nothing removed them, so the in-browser run left exactly 9 children
      // per cycle while the stub proof stayed green. That gap is why this
      // block exists: whenever the real siblings are present, the cycle is
      // re-run against THEM.
      //
      // The rule proven here is the ownership rule, not a hard-coded 9:
      // whoever calls init() owns calling teardown().
      var haveRealFx = !!(RF.Fx && typeof RF.Fx.init === 'function' &&
        typeof RF.Fx.teardown === 'function');
      var haveRealArt3D = !!art3d();
      if (haveRealFx || haveRealArt3D) {
        var sibChildren = [];
        var sibScene = {
          children: [],
          fog: null,
          add: function (o) {
            this.children.push(o);
            if (o) o.parent = sibScene;
            return this;
          },
          remove: function (o) {
            var ix = this.children.indexOf(o);
            if (ix >= 0) this.children.splice(ix, 1);
            if (o) o.parent = null;
            return this;
          },
        };
        var sibCtx = {
          rng: rngStub,
          renderer: renderer,
          time: { now: 0, dt: 1 / 60, frame: 0 },
          run: { score: 0, coins: 0 },
          player: { x: 3600, y: 900, tier: 3, r: 30, st: {} },
          lights: { hemi: stubHemi, sun: stubSun },
        };
        for (var sc2 = 0; sc2 < 5; sc2++) {
          World.init(sibScene, sibCtx);
          for (var sf = 0; sf < 300; sf++) {
            sibCtx.player.x = 3600 + Math.sin(sf * 0.05) * 2400;
            sibCtx.player.y = 900 + Math.cos(sf * 0.02) * 800;
            sibCtx.time.now += 1 / 60;
            World.update(sibCtx);
          }
          World.teardown();
          sibChildren.push(sibScene.children.length);
        }
        // Name whatever is left, so a future regression reports WHAT leaked
        // rather than only how many. This is the diagnostic that identified
        // the nine Points pools in the first place.
        var strag = '';
        for (var sg = 0; sg < sibScene.children.length && sg < 6; sg++) {
          var so = sibScene.children[sg];
          strag += ' [' + (so && so.type ? so.type : typeof so) +
            (so && so.name ? ':' + so.name : '') + ']';
        }
        chk(sibChildren[sibChildren.length - 1] === 0,
          'LIFE-01 IN-PAGE: five cycles against the REAL siblings (Fx ' +
          (haveRealFx ? 'present' : 'absent') + ', Art3D ' +
          (haveRealArt3D ? 'present' : 'absent') +
          ') return the scene to 0 children (' + sibChildren.join(', ') + ')' + strag);
        if (haveRealFx) {
          chk(fxOwned === false,
            'LIFE-01 IN-PAGE: the RF.Fx ownership flag is released by teardown, so a ' +
            'teardown without a matching init cannot tear down another lane\'s effects');
        }
      } else {
        notes.push('ok real RF.Fx / RF.Art3D not loaded in this configuration, ' +
          'in-page teardown cycle skipped (stub-scene cycles above still apply)');
      }
      // Every cycle must build about the same amount. A cycle that builds LESS
      // than the first would mean init() after teardown() is not equivalent to
      // a first init, which is the other half of the contract.
      var minC = cycleCreated[0], maxC = cycleCreated[0];
      for (var cc = 1; cc < cycleCreated.length; cc++) {
        if (cycleCreated[cc] < minC) minC = cycleCreated[cc];
        if (cycleCreated[cc] > maxC) maxC = cycleCreated[cc];
      }
      chk(minC > 50 && maxC < minC * 1.6,
        'LIFE-01: init() after teardown() is equivalent to a first init, every cycle rebuilds a ' +
        'comparable world (' + cycleCreated.join(', ') + ' objects per cycle)');
      chk(S.inited === false && S.decor.length === 0 && S.entities.length === 0 &&
        S.pool.length === 0 && S.rays.length === 0 && S.seams.length === 0 &&
        S.swayers.length === 0 && S.reefSwayers.length === 0 && S.reefBatches.length === 0 &&
        S.drifters.length === 0 && S.caustics.length === 0 &&
        S.gradient === null && S.terrain.length === 0 && S.surface === null && S.fog === null,
        'LIFE-01: teardown clears every environment and entity registry it owns');
      chk(lifeScene.fog === null,
        "LIFE-01: teardown releases the scene's fog slot when it still points at ours");

      // Disposal accounting. The stub materials and geometries throw on a
      // second dispose(), so reaching here at all proves nothing was disposed
      // twice; these numbers prove the other direction, that the run's GPU
      // objects were actually released rather than merely detached.
      var disp = root.__disposed;
      if (disp) {
        chk(disp.mat > 0 && disp.geo > 0,
          'LIFE-01: teardown disposed the run materials and geometries (' +
          disp.mat + ' materials, ' + disp.geo + ' geometries across 5 cycles)');
      } else {
        notes.push('ok dispose counters not instrumented in this harness (accounting skipped)');
      }

      // The DOCUMENTED PERSISTENT caches must survive, or the whole point of
      // exempting them is lost. texCache holds the decoded assets/*.png; it is
      // the asset layer, not run state (SPEC3D Rev 2).
      var texKeys = 0;
      for (var tk in texCache) { if (Object.prototype.hasOwnProperty.call(texCache, tk)) texKeys++; }
      chk(texKeys > 0,
        'LIFE-01: the documented persistent asset texture cache survives teardown (' +
        texKeys + ' textures held)');
      // Everything NOT on the persistence list must be gone.
      var envKeys = 0;
      for (var ek in envMatCache) { if (Object.prototype.hasOwnProperty.call(envMatCache, ek)) envKeys++; }
      var matKeys = 0;
      for (var mk in S.matCache) { if (Object.prototype.hasOwnProperty.call(S.matCache, mk)) matKeys++; }
      chk(envKeys === 0 && matKeys === 0 && S.geoQuad === null,
        'LIFE-01: the per-run material and geometry caches are emptied, not carried over (' +
        envKeys + ' env, ' + matKeys + ' fallback)');

      // ==================================== PERF-03 environment draw calls
      //
      // The gate is a COUNT OF DRAWN OBJECTS, not a count of triangles: draw
      // calls are the mid-phone failure the review named, and the old build
      // put roughly 260 environment meshes in the scene and relied on frustum
      // culling to keep the measured number under the budget by luck.
      //
      // Each entry below is one three Mesh with one material, so it is one
      // draw call when it is on screen. Nested meshes inside a pivot Group are
      // counted, Groups themselves are not (a Group draws nothing).
      // Rev 3 adds three reef batches plus one Snell disc. Lane env-terrain may
      // add five more, so this shared environment assertion intentionally stays
      // at <=60 rather than growing a lane-local budget.
      World.init(lifeScene, lifeCtx);
      var envMeshes = 0, envMats = {}, envMatCount = 0;
      function countDrawables(o) {
        if (!o) return;
        if (o.material) {
          envMeshes++;
          var uid = o.material.uuid || o.material.__rfDrawKey;
          if (!uid) { uid = o.material.__rfDrawKey = 'm' + (envMatCount + 1); }
          if (!envMats[uid]) { envMats[uid] = 1; envMatCount++; }
        }
        if (o.children) for (var ci = 0; ci < o.children.length; ci++) countDrawables(o.children[ci]);
      }
      for (var dci = 0; dci < S.decor.length; dci++) countDrawables(S.decor[dci]);
      notes.push('environment draw-call inventory: ' + envMeshes + ' meshes across ' +
        envMatCount + ' distinct materials');
      chk(envMeshes <= 60,
        'PERF-03 Rev 3: environment stays within the shared <=60 draw gate (' + envMeshes +
        ' meshes, including 3 reef batches + Snell disc; env-terrain may add 5)');
      // A merged batch is worthless if it did not actually merge, so assert
      // the biggest populations really did collapse. Rocks are the clearest
      // case: 90 of them, now exactly one mesh.
      chk(S.swayers.length <= KELP_BANDS,
        'PERF-03: 104 kelp stalks batched into at most ' + KELP_BANDS + ' swaying beds (' +
        S.swayers.length + ')');
      chk(S.rays.length === RAY_BANDS,
        'PERF-03: ' + (RAY_BANDS * RAYS_PER_BAND) + ' god-ray shafts batched into ' +
        RAY_BANDS + ' bands (' + S.rays.length + ')');
      chk(S.seams.length <= 2,
        'PERF-03: every thermocline seam batched into 2 meshes (' + S.seams.length + ')');
      chk(S.drifters.length <= zones().length,
        'PERF-03: midwater silhouettes batched to one mesh per zone (' +
        S.drifters.length + ')');
      // The material cache is the other half of the win: two batches with the
      // same look must SHARE a material or they cannot share a draw call.
      chk(envMatCount <= envMeshes,
        'PERF-03: environment materials are cached by look, never one per plane (' +
        envMatCount + ' materials for ' + envMeshes + ' meshes)');
      // Merged geometry must carry real vertex data, or the batch is empty and
      // the count above is meaningless.
      var batchVerts = 0;
      for (var bi = 0; bi < S.decor.length; bi++) {
        var bo = S.decor[bi];
        var bm = bo && bo.material ? bo : (bo && bo.children && bo.children[0]);
        var ba = bm && bm.geometry && bm.geometry.attributes && bm.geometry.attributes.position;
        if (ba && ba.count) batchVerts += ba.count;
      }
      chk(batchVerts > 400,
        'PERF-03: the merged batches carry real geometry, they are not empty meshes (' +
        batchVerts + ' vertices)');

      // ============================================ Rev 6 SDF maze (6.4)
      // World is still live from the draw-call accounting init() above, so
      // these read the SAME built maze/rock as the budget numbers just
      // asserted, rather than paying for (and risking drifting from) a
      // second build.
      var sdfProbeOk = true, sdfBad = 0;
      function sdfChk(ok) { if (!ok) { sdfProbeOk = false; sdfBad++; } }

      // Push-out invariant: a body dropped at a random point, resolved
      // against the maze, ends up with sdf >= r (clear of rock by at least
      // its own radius) and with any velocity component INTO the wall
      // removed (slide, never bounce/snag per 6.4).
      var pushBody = { x: 0, y: 0, vx: 0, vy: 0 };
      var pushR = 30;
      var pushTries = 60, pushChecked = 0;
      for (var pti = 0; pti < pushTries; pti++) {
        pushBody.x = rngStub() * S.w;
        pushBody.y = SDF_OPEN_Y + rngStub() * (S.h - SDF_OPEN_Y);
        var beforeSdf = World.terrainSDF(pushBody.x, pushBody.y);
        if (beforeSdf >= pushR + 2) continue; // already clear; nothing to prove here
        // Aim velocity STRAIGHT INTO the nearest wall (down the negative
        // gradient) so the slide assertion is not accidentally trivial.
        var gxp = World.terrainSDF(pushBody.x + 6, pushBody.y);
        var gxm = World.terrainSDF(pushBody.x - 6, pushBody.y);
        var gyp = World.terrainSDF(pushBody.x, pushBody.y + 6);
        var gym = World.terrainSDF(pushBody.x, pushBody.y - 6);
        var ggx = (gxp - gxm) / 12, ggy = (gyp - gym) / 12;
        var glen0 = Math.sqrt(ggx * ggx + ggy * ggy) || 1;
        pushBody.vx = -(ggx / glen0) * 200;
        pushBody.vy = -(ggy / glen0) * 200;
        World.resolveBody(pushBody, pushR);
        var afterSdf = World.terrainSDF(pushBody.x, pushBody.y);
        // Re-sample the gradient AT THE FINAL position: resolveBody may take
        // several internal iterations against a non-exact SDF, so the
        // meaningful "no velocity into the wall" invariant is evaluated
        // against the normal at where the body actually ended up, not the
        // (possibly stale, several cells away) normal sampled before the
        // call.
        var fgxp = World.terrainSDF(pushBody.x + 6, pushBody.y);
        var fgxm = World.terrainSDF(pushBody.x - 6, pushBody.y);
        var fgyp = World.terrainSDF(pushBody.x, pushBody.y + 6);
        var fgym = World.terrainSDF(pushBody.x, pushBody.y - 6);
        var fgx = (fgxp - fgxm) / 12, fgy = (fgyp - fgym) / 12;
        var flen = Math.sqrt(fgx * fgx + fgy * fgy) || 1;
        var vn = pushBody.vx * (fgx / flen) + pushBody.vy * (fgy / flen);
        sdfChk(afterSdf >= pushR - 1e-6);
        sdfChk(vn >= -1e-6); // no remaining velocity component into the wall
        pushChecked++;
      }
      chk(pushChecked > 0 && sdfProbeOk,
        'resolveBody push-out invariant holds: sdf >= r and no into-wall velocity (' +
        pushChecked + ' contacts, ' + sdfBad + ' bad)');

      // 200 ringPoint samples: every one lands sdf > radiusFor(def)+24 AND in
      // the SAME flood-fill region as the player (6.4 spawn contract).
      var sampleOut = [0, 0];
      var sampleDef = defOf('minnow') || { tier: 0 };
      var sampleR = radiusFor(sampleDef, 'prey') + SDF_SPAWN_CLEAR;
      var samplePlayerRegion = World.regionAt(lifeCtx.player.x, lifeCtx.player.y);
      var sampleOk = 0, sampleBad = 0;
      for (var smp = 0; smp < 200; smp++) {
        var got = ringPointValid(lifeCtx.player.x, lifeCtx.player.y, sampleDef, 'prey',
          samplePlayerRegion, sampleOut);
        var sdfAt = World.terrainSDF(sampleOut[0], sampleOut[1]);
        var regionAt = World.regionAt(sampleOut[0], sampleOut[1]);
        if (got && sdfAt > sampleR && regionAt === samplePlayerRegion) sampleOk++;
        else sampleBad++;
      }
      chk(sampleOk === 200,
        '200 ringPoint samples all land sdf > radiusFor+24 and in the player region (' +
        sampleOk + '/200 ok, ' + sampleBad + ' bad)');

      // Rev 6.11 MAZE REACHABILITY: body-radius-aware BFS, not point-connected.
      // Walkable cells require sdf > MAZE_CLEARANCE (tier-12 body radius 98 +
      // 24px spawn clearance = 122px), so this proves a tier-12 shark can
      // actually swim the route, not merely that a zero-radius point can.
      // World.init() already ran widenTunnelsForReachability once for this
      // seed; this asserts that pass actually left every band reachable.
      var bfsRes = bfsBandReachability(MAZE_CLEARANCE, lifeCtx.player.x, lifeCtx.player.y);
      chk(bfsRes.ok,
        'body-radius-aware BFS (clearance ' + MAZE_CLEARANCE + 'px) reaches every zone band (' +
        bfsRes.reachableN + '/' + zones().length + ', regionN=' + S.sdfRegionN + ')');

      // Pickup table: weights sum positive and every row is a valid def
      // (has an id, a positive weight, and a finite/absent duration).
      var pickupRows = pickups();
      var pickupWeightSum = 0, pickupRowsOk = true;
      for (var pri = 0; pri < pickupRows.length; pri++) {
        var prow = pickupRows[pri];
        var rowOk = !!(prow && typeof prow.id === 'string' && prow.id.length &&
          typeof prow.weight === 'number' && prow.weight > 0 &&
          (prow.dur === undefined || (typeof prow.dur === 'number' && prow.dur >= 0)));
        if (!rowOk) pickupRowsOk = false;
        pickupWeightSum += (prow && prow.weight) || 0;
      }
      chk(pickupRows.length > 0 && pickupWeightSum > 0 && pickupRowsOk,
        'PICKUPS table weights sum positive and every row is valid (' +
        pickupRows.length + ' rows, weight sum ' + pickupWeightSum + ')');

      // spawnBuffDrop / ambient spawn: produces a live 'buffpickup' entity
      // carrying a `buffId` field that names a real PICKUPS row, drifts, and
      // is not despawn-culled by camera distance (its own st.life owns
      // expiry per 6.7).
      var buffEnt = World.spawnBuffDrop(lifeCtx.player.x + 4000, lifeCtx.player.y + 200);
      chk(!!(buffEnt && buffEnt.kind === 'buffpickup' && typeof buffEnt.buffId === 'string' &&
        pickupDef(buffEnt.buffId)),
        'spawnBuffDrop places a buffpickup entity naming a real PICKUPS row (' +
        (buffEnt && buffEnt.buffId) + ')');
      if (buffEnt) {
        var buffX0 = buffEnt.x, buffY0 = buffEnt.y;
        var buffId0 = buffEnt.id;
        lifeCtx.time.now += 1 / 60;
        World.update(lifeCtx);
        chk(buffEnt.active && (buffEnt.x !== buffX0 || buffEnt.y !== buffY0),
          'buffpickup drifts under its own AI (moved this step)');
        buffEnt.st.life = 0.001;
        lifeCtx.time.now += 1 / 60;
        World.update(lifeCtx);
        // The pool may recycle this exact slot into a NEW entity within the
        // same update (e.g. a rare ambient buff roll landing right after
        // this one expires), which is correct pooling behaviour, not a
        // resurrection: id !== buffId0 proves the slot was freed and
        // reacquired rather than the original entity surviving its own
        // expiry.
        chk(!buffEnt.active || buffEnt.id !== buffId0,
          'buffpickup expires via World.kill once st.life reaches 0 (recycled: ' +
          (buffEnt.id !== buffId0) + ')');
      }

      World.teardown();
    } catch (err) {
      pass = false;
      notes.push("FAIL exception: " + (err && err.stack ? err.stack : String(err)));
    }
    // Hand the page's real asset caches back, whatever happened above, so a
    // selftest run inside a live page does not cost that page its textures.
    if (typeof prevTexCacheOuter !== 'undefined' && prevTexCacheOuter) {
      texCache = prevTexCacheOuter;
      texLoader = null;
    }
    RF.ctx = prevRFContext;
    return { pass: pass, notes: notes };
  };

  // Small counter used by the selftest inner loop without allocating.
  var accountingBad = 0;
  function chk2(ok) { if (!ok) accountingBad++; }
  // Selftest helper: return every active entity to the pool, so a block that
  // deliberately fills the world cannot starve the block after it.
  function drainAll() {
    for (var i = S.entities.length - 1; i >= 0; i--) World.kill(S.entities[i], 'despawn');
  }

  RF.World = World;
})(typeof window !== 'undefined' ? window : globalThis);
