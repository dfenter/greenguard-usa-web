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
 * (x right 0..7200, y DOWN 0..3600). Mapping to three is (x, -y, z), gameplay
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

  // ------------------------------------------------------ Rev 4 living water
  // Ported verbatim from world.js. Every constant is a named parameter and
  // every one drives a pure sin() of the sim clock. Nothing here allocates,
  // tweens, or touches wall time.
  var CAUSTIC_N = 3;           // wide soft light planes under the surface
  var CAUSTIC_H = 600;         // planes live in the top CAUSTIC_H px of water
  var CAUSTIC_DRIFT = 190;     // px of horizontal sine travel
  var CAUSTIC_RATE = [0.055, 0.085];
  // Caustics are additive and they live in the top CAUSTIC_H px, so like the
  // surface wash they are charged against zone-1 saturation. Trimmed from
  // [0.05, 0.12] as part of the same anti-wash pass: they should dapple the
  // shelf, not flood it.
  var CAUSTIC_ALPHA = [0.028, 0.065];
  var RAY_ROT_AMP = 0.03;      // +-0.03 rad sway per SPEC
  var RAY_ROT_RATE = [0.06, 0.13];
  var RAY_ALPHA_LO = 0.5;      // alpha multiplier floor of the 0.5-1.0 cycle
  var RAY_ALPHA_RATE = [0.09, 0.19];
  var SHIMMER_ALPHA = [0.012, 0.05];
  var SHIMMER_RATE = 0.043;
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

  // Rev 5 flee burst, capped so a chasing shark of equal tier always closes.
  var FLEE_BURST = 1.55;       // prey panic sprint, <= 1.6x base per Rev 5 brief
  var FLEE_BURST_NPC = 1.35;   // outranked NPC shark running from the player

  // ------------------------------------------------------ 3D space contract
  var Z_PLAY = 0;              // gameplay plane
  var Z_SURFACE = -60;         // surface plane sits just behind play
  var Z_CAUSTIC = -90;         // caustic planes near the surface
  var Z_RAY = -120;            // god-ray additive planes
  var Z_SEAM = -180;           // thermocline seams
  var Z_KELP = [-260, -140];   // kelp / rock billboard parallax band
  var Z_SIL = [-400, -300];    // midwater silhouettes, furthest back
  var Z_SHIMMER = -420;        // whole-water tint, behind everything

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
    w: 7200, h: 3600,
    pool: [],                  // every preallocated entity, active or not
    free: [],                  // stack of inactive entities
    entities: [],              // dense list of ACTIVE entities
    grid: null,                // flat array: cellKey -> array of ents
    cols: 0, rows: 0,
    nextId: 1,
    packSeq: 1,
    packs: null,               // Map: packId -> pooled record {dx, dy, t, owner}
    decor: [],                 // static decoration objects (never per-frame)
    surface: null,             // {mesh, foam} surface plane at y = 0
    surfaceT: 0,
    ambientT: 0,
    inited: false,
    headless: false,
    // Rev 4 "living water". Every animated object is created ONCE in init and
    // only has scalar fields written per frame.
    caustics: [],
    rays: [],
    shimmer: null,
    seams: [],
    swayers: [],
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

  // Reused animate() state object for RF.Art3D rigs. One object, rewritten per
  // rig per frame, so a 20-shark screen still allocates nothing.
  var rigState = { speedFrac: 0, turn: 0, bitePhase: 0, jawSnapT: 0 };

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
    if (kind === 'hazard') return def && def.id === 'mine' ? 26 : 24;
    var t = def && typeof def.tier === 'number' ? def.tier : 1;
    if (t >= 90) t = 3;
    return 14 + t * 7;
  }
  function displayLen(def, kind) { return radiusFor(def, kind) * 2.1; }

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
      if (rig && rig.group) return rig;
    } catch (e) { /* lane D3 not ready or this def is unsupported */ }
    return null;
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
  // atmosphere. The zone gradient bands, fog rects and vignette bars are GONE:
  // scene.fog plus the renderer clear colour now do that work, and they do it
  // better because they respond to the camera's actual depth rather than to a
  // painted band the camera happens to be in front of.
  //
  // What survives as geometry, and why:
  //   god rays      additive planes, they are LIGHT and must overlay
  //   caustics      additive planes near the surface, same reason
  //   surface       an actual plane at y = 0 plus a foam strip
  //   kelp / rocks  billboards at parallax z, they are OBJECTS with silhouette
  //   silhouettes   very transparent dark planes, the far-water landmarks
  //   shimmer       one huge very faint additive plane, the water's own breath
  //   seams         thermocline bands at zone boundaries
  //
  // Everything is built ONCE in init and only has scalars written per frame.

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

  function envMaterial(color, opacity, additive, map, vcolors) {
    if (!isThree()) return null;
    ownership();
    var key = 'e' + ((color >>> 0).toString(16)) + '_' + Math.round(opacity * 1000) +
      (additive ? '_a' : '') + (vcolors ? '_v' : '') +
      (map && map.uuid ? ('_m' + map.uuid) : '');
    var cached = envMatCache[key];
    if (cached) return cached;
    var m = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    if (map) { m.map = map; if ('toneMapped' in m) m.toneMapped = false; }
    if (vcolors) m.vertexColors = true;
    if (additive && THREE.AdditiveBlending !== undefined) m.blending = THREE.AdditiveBlending;
    envMatCache[key] = m;
    envOwned.mats.push(m);
    return m;
  }

  function planeMesh(w, h, color, opacity, additive) {
    var g = quadGeo();
    if (!g) return null;
    var m = envMaterial(color, opacity, additive, null, false);
    if (!m) return null;
    var mesh = new THREE.Mesh(g, m);
    mesh.scale.x = w;
    mesh.scale.y = h;
    return mesh;
  }

  // A plane whose OPACITY is written per frame cannot share a material with
  // anything else, because opacity lives on the material. The handful of
  // objects that breathe (caustics, shimmer) therefore ask for a private one.
  function planeMeshPrivate(w, h, color, opacity, additive) {
    var g = quadGeo();
    if (!g) return null;
    ownership();
    var m = new THREE.MeshBasicMaterial({
      color: color, transparent: true, opacity: opacity,
      side: THREE.DoubleSide, depthWrite: false,
    });
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
  // rotation, mirror (+-1), colour, alpha. Colour and alpha ride the vertex
  // colour attribute (RGBA), which is why a batch can hold 90 rocks at 90
  // different opacities and still be one material.
  var quadScratch = [];
  var quadN = 0;
  function quadReset() { quadN = 0; }
  function quadPush(cx, cy, z, w, h, rot, mirror, color, alpha) {
    var q = quadScratch[quadN];
    if (!q) { q = quadScratch[quadN] = { cx: 0, cy: 0, z: 0, w: 0, h: 0, rot: 0, mirror: 1, color: 0, alpha: 1 }; }
    quadN++;
    q.cx = cx; q.cy = cy; q.z = z; q.w = w; q.h = h;
    q.rot = rot || 0; q.mirror = mirror < 0 ? -1 : 1;
    q.color = color; q.alpha = alpha;
    return q;
  }

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
      var r = ((q.color >> 16) & 255) / 255;
      var g = ((q.color >> 8) & 255) / 255;
      var b = (q.color & 255) / 255;
      for (var c = 0; c < 4; c++) {
        var lx = QUAD_X[c] * q.w * q.mirror;
        var ly = QUAD_Y[c] * q.h;
        var vi = (i * 4 + c);
        pos[vi * 3] = q.cx + lx * cs - ly * sn;
        pos[vi * 3 + 1] = q.cy + lx * sn + ly * cs;
        pos[vi * 3 + 2] = q.z;
        uv[vi * 2] = QUAD_U[c];
        uv[vi * 2 + 1] = QUAD_V[c];
        col[vi * 4] = r; col[vi * 4 + 1] = g; col[vi * 4 + 2] = b; col[vi * 4 + 3] = q.alpha;
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

  // Build ONE mesh from whatever is currently in the quad scratch. `map` is a
  // texture shared by every quad in the batch (or null for flat colour). The
  // material is vertex-coloured so the batch's per-quad tint and alpha survive
  // the merge; the material's own opacity stays 1 and the alpha channel of the
  // vertex colour does the work.
  // `privateMat` is for a batch whose OPACITY is animated per frame: opacity
  // lives on the material, so such a batch cannot share one. Everything static
  // takes the cached material and shares it with every other batch of the same
  // look, which is what collapses the draw calls.
  function batchMesh(map, additive, z, privateMat) {
    var geo = mergeQuads();
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
      mat = envMaterial(0xffffff, 1, additive, map, true);
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
  // CLEAR_MIX: how far the clear colour travels from the authored zone TINT
  // toward that zone's pale FOG colour.
  //
  // This was 0.55 and it is the single number that made the retuned zone 1
  // read as pastel baby-blue milk. The authored shelf tint 0x1b4d66 is a rich
  // blue at HSV saturation 0.735; the shelf fog 0x9fd4e8 is nearly white at
  // 0.315. Travelling 55 percent of that distance lands on 0x6497ae, S 0.425,
  // which is below the 0.45 bar and reads as milk rather than water. Bright
  // and SATURATED was the requirement; 0.55 delivered bright and washed.
  //
  // At 0.22 the shelf clear is 0x376a82 at S 0.573, comfortably saturated,
  // still clearly lighter and airier than the raw tint so the shelf does not
  // read as heavy. The authored palette does the work; the fog lift is now an
  // accent on it rather than a replacement for it.
  var CLEAR_MIX = 0.22;        // clear colour sits near the authored tint
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
    // The water the camera sits in: mostly the zone tint, lifted toward its
    // own fog so a shallow zone reads airy and the abyss reads heavy. The
    // clear colour is NOT pushed all the way to the fog colour, because the
    // clear colour is what the far parallax band silhouettes against and a
    // clear identical to the fog erases that band entirely.
    var clearCol = lerpColor(tintCol, fogCol, CLEAR_MIX * (1 - depth * 0.35));

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
  var RAYS_PER_BAND = 7;

  function buildRays() {
    if (!isThree()) return;
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
      // 0.030 to 0.075 is roughly half the old per-shaft ceiling, which is the
      // right correction for a batch whose members can stack. A shaft now
      // brightens the water it crosses instead of painting over it, and the
      // saturated clear colour behind it survives.
      var bandA = rr(0.030, 0.075);
      for (var i = 0; i < RAYS_PER_BAND; i++) {
        var hgt = rr(300, SURFACE_LIGHT_H);
        // Narrower than the pre-batch 40-120: a merged band already reads as
        // a fan, so each shaft can be a shaft rather than a panel.
        var wid = rr(28, 74);
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
        quadPush(cx + ox, oy, rr(Z_RAY - 40, Z_RAY + 40), wid, hgt, lean, 1,
          0xdff6ff, bandA * rr(0.7, 1.3));
      }
      var mesh = batchMesh(null, true, undefined, true);
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
        img: mesh, pivot: pivot, rot0: rot0,
        rotAmp: RAY_ROT_AMP * rr(0.6, 1.25),
        rotRate: rr(RAY_ROT_RATE[0], RAY_ROT_RATE[1]),
        rotPhase: rr(0, TAU),
        aBase: 1,
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

  // -------------------------------------------------------------- shimmer
  // ONE huge, very faint additive plane behind everything, whose opacity
  // breathes at a low amplitude. It stops the column reading as a dead flat
  // fill even where no other animated layer is on screen. One mesh, one
  // opacity write per frame.
  function buildShimmer() {
    if (!isThree()) return;
    // Private material: this plane's opacity breathes every frame.
    var mesh = planeMeshPrivate(S.w, S.h, 0x2ea3c8, SHIMMER_ALPHA[0], true);
    if (!mesh) return;
    setPos(mesh, S.w * 0.5, S.h * 0.5, Z_SHIMMER);
    sceneAdd(mesh);
    S.decor.push(mesh);
    S.shimmer = {
      img: mesh, aBase: SHIMMER_ALPHA[0],
      aAmp: SHIMMER_ALPHA[1] - SHIMMER_ALPHA[0],
      rate: SHIMMER_RATE, phase: 0.7,
    };
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
  // The waterline. Three parts, all at y = 0:
  //   wash   a wide bright plane just under the surface, so "up" reads bright
  //          from far below and the player always knows which way out is
  //   plane  the surface itself, a long thin bright plane ON y = 0
  //   foam   a soft strip riding the surface, scrolled by a sine so the
  //          waterline is never a dead straight edge
  // The foam strip is what sells the boundary in 3D: the plane alone reads as
  // a drawn line, the moving strip reads as water meeting air.
  function buildSurface() {
    if (!isThree()) return;
    // The wash is a full-width ADDITIVE plane blanketing the top
    // SURFACE_LIGHT_H px, which is exactly the zone-1 gameplay band, so its
    // alpha is charged against the shelf's saturation on every frame the
    // player is on the shelf. At 0.16 it was the single largest contributor to
    // the pastel read. 0.075 still says "up is bright" from far below, which
    // is the only job it has, without bleaching the water it sits in.
    var wash = planeMesh(S.w, SURFACE_LIGHT_H, 0xbfe9f5, 0.075, true);
    if (wash) {
      setPos(wash, S.w * 0.5, SURFACE_LIGHT_H * 0.5, Z_SURFACE - 20);
      sceneAdd(wash);
      S.decor.push(wash);
    }
    var plane = planeMesh(S.w, 54, 0xe6fbff, 0.72, false);
    if (!plane) return;
    setPos(plane, S.w * 0.5, 27, Z_SURFACE);
    sceneAdd(plane);
    S.decor.push(plane);
    // Foam is pure white and additive. It is a thin 26px strip so it costs
    // little, but it sits ON the waterline where the shelf is brightest.
    var foam = planeMesh(S.w * 1.2, 26, 0xffffff, 0.30, true);
    if (foam) {
      setPos(foam, S.w * 0.5, 8, Z_SURFACE + 8);
      sceneAdd(foam);
      S.decor.push(foam);
    }
    S.surface = { mesh: plane, foam: foam, x0: S.w * 0.5 };
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

  function buildDecor() {
    if (!isThree()) return;
    var Z = zones();
    var i;
    // ------------------------------------------------- seafloor rocks (1 batch)
    var rockTex = kenneyTexture('rock_a');
    quadReset();
    for (i = 0; i < 90; i++) {
      var rs = rr(0.5, 1.5);
      var rw = 90 * rs, rh = 70 * rs;
      var rx = rr(0, S.w);
      var ry = S.h - rr(0, 26);
      var mir = rnd() < 0.5 ? -1 : 1;
      // Rooted on the floor: the quad centre is half a height above the root.
      quadPush(rx, -(ry) + rh * 0.5, rr(Z_KELP[0], Z_KELP[1]), rw, rh, 0, mir,
        rockTex ? 0xffffff : 0x0a1a24, rr(0.45, 0.85));
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
        quadPush(rec.x - px, -(rec.y) + py + kh * 0.5, rec.z, kw, kh, 0, rec.mirror,
          kelpTex ? 0xffffff : 0x0b2a2a, rec.alpha);
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
    if (!r) { r = kelpScratch[kelpN] = { x: 0, y: 0, z: 0, scale: 1, alpha: 1, mirror: 1 }; }
    kelpN++;
    r.x = x; r.y = y; r.scale = scale; r.alpha = alpha;
    r.z = rr(Z_KELP[0], Z_KELP[1]);
    r.mirror = rnd() < 0.5 ? -1 : 1;
  }

  // ------------------------------------------------------- midwater decor
  // The VISUAL QA TUNE rules from world.js survive verbatim, because they were
  // about READING, not about the renderer:
  //   1. ATMOSPHERE, NOT OBJECTS. Opacity 0.04-0.09. They tint the water at
  //      the edge of vision; they are never a thing you look at.
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
    { shape: 'arch',      n: 6,  scale: [0.9, 1.4], alpha: [0.05, 0.09], tint: 0x0d3d52, anchor: 'floor', inset: 40 },
    { shape: 'kelptower', n: 10, scale: [1.0, 1.6], alpha: [0.05, 0.09], tint: 0x08222f, anchor: 'floor', inset: 60 },
    { shape: 'spire',     n: 10, scale: [1.0, 1.6], alpha: [0.04, 0.08], tint: 0x05131e, anchor: 'floor', inset: 70 },
    { shape: 'chimney',   n: 8,  scale: [1.1, 1.6], alpha: [0.04, 0.07], tint: 0x02070d, anchor: 'floor', inset: 80 },
  ];

  // PERF-03. 34 silhouette planes become 4, one merged batch per zone. The
  // per-shape drift was 3 to 7 px on shapes drawn at 0.04 to 0.09 opacity at
  // the furthest parallax band; drifting the whole zone batch by the same few
  // px instead of each shape independently is not a visual change anyone can
  // see, and it is 30 fewer draw calls. Rule 2 (ANCHORED) still holds because
  // the drift is an OFFSET from the placed position, never an accumulation,
  // exactly as before.
  function buildMidwaterDecor() {
    if (!isThree()) return;
    var Z = zones();
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
        quadPush(x0, -cy, rr(Z_SIL[0], Z_SIL[1]), w, h, 0,
          rnd() < 0.5 ? -1 : 1, cfg.tint, rr(cfg.alpha[0], cfg.alpha[1]));
      }
      var mesh = batchMesh(null, false, undefined);
      if (!mesh) continue;
      sceneAdd(mesh);
      S.decor.push(mesh);
      // Amplitude is deliberately tiny: these shapes are ANCHORED and must
      // stay rooted. This is a shimmer of distance, not a floating shape.
      S.drifters.push({
        img: mesh, x0: 0, y0: 0,
        ampX: rr(SIL_DRIFT[0], SIL_DRIFT[1]),
        ampY: rr(SIL_DRIFT[0], SIL_DRIFT[1]) * 0.4,
        rate: rr(SIL_RATE[0], SIL_RATE[1]),
        phase: rr(0, TAU),
      });
    }
  }

  function buildBackground() {
    buildShimmer();
    buildSeams();
    buildMidwaterDecor();
    buildDecor();
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
    } else if (e.kind === 'predator') {
      rig = makeSharkRig(e.def);
      obj = rig ? rig.group : makeBillboard(e.def, e.kind);
    } else {
      obj = makeBillboard(e.def, e.kind);
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
    return { obj: obj, rig: rig, aspect: aspect };
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

  function viewRelease(viewKey, rec) {
    if (!viewKey || !rec) return;
    var bank = S.views[viewKey];
    if (!bank) { bank = S.views[viewKey] = { free: [], live: 0, peak: 0 }; }
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
    var obj = rec.obj;
    setVisible(obj, true);
    setPos(obj, e.x, e.y, Z_PLAY);
    clearTint(obj);
    setOpacity(obj, 1);
    var len = e.kind === 'pickup' ? 20 : displayLen(e.def, e.kind);
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

  World.spawnBurst = function (defId, x, y, n) {
    var out = 0;
    var packId = S.packSeq++;
    packAcquire(packId);
    for (var i = 0; i < n; i++) {
      var e = spawnOne(defId, x + rr(-70, 70), y + rr(-50, 50), packId);
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
      if (e.kind === 'pickup') continue;
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

  function runSpawner(ctx, camX, camY) {
    var B = budget();
    if (S.free.length <= 4) return;
    var live = onscreenCount(camX, camY);
    if (live >= B.onscreen) return;
    // One spawn attempt per step keeps the cost flat; the ring fills quickly.
    ringPoint(camX, camY, ringOut);
    var z = World.zoneAt(ringOut[1]);
    if (!z) return;
    // Predator roll first: rarer, and only where the roster allows it.
    var npcList = S.npcByZone[z.id];
    if (npcList && npcList.length && rnd() < 0.12) {
      spawnOne(pickWeighted(npcList), ringOut[0], ringOut[1], 0);
      return;
    }
    var defId = pickWeighted(z.spawns || []);
    if (!defId) return;
    var def = defOf(defId);
    if (!def) return;
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
    var k = clamp((turn || 4) * dt, 0, 1);
    e.vx += (wantX - e.vx) * k;
    e.vy += (wantY - e.vy) * k;
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

  function preyAI(e, ctx, dt) {
    var def = e.def;
    var spd = def.speed || 120;
    var player = ctx.player;
    var fleeing = false;
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
      if (pt < e.tier && d2 < PREDATOR_SIGHT * PREDATOR_SIGHT) {
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

  // ---------------------------------------------------------------- kill
  World.kill = function (ent, cause) {
    if (!ent || !ent.active) return;
    if (cause !== 'collected' && cause !== 'despawn' && cause !== 'expire') {
      fx('deathBurst', ent.x, ent.y, null);
      fx('motes', ent.x, ent.y, null);
      if (cause !== 'detonate') sfx('chomp', null);
    }
    if (cause !== 'despawn' && cause !== 'expire' && ent.kind !== 'pickup' && ent.coins > 0) {
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
    { fx: 'motes',   every: 0.35, count: 2, tint: 0x6fd0ff, sx: 520, sy: 360, angle: 90,  speed: 12, scale: 1.25 },
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
  function animateWater(t) {
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

    // Whole-water tint shimmer. One plane, one opacity write.
    if (S.shimmer && S.shimmer.img) {
      rec = S.shimmer;
      var sa = rec.aBase + (0.5 + 0.5 * Math.sin(t * rec.rate * TAU + rec.phase)) * rec.aAmp;
      if (rec.img.material) rec.img.material.opacity = sa;
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

    // Surface foam strip rides the waterline on a slow sine, so the boundary
    // between water and air is never a dead straight edge.
    if (S.surface && S.surface.foam && S.surface.foam.position) {
      S.surface.foam.position.x = S.surface.x0 + Math.sin(t * 0.6) * 40 + (t * 14) % 240;
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

  // A frozen or stunned creature must READ frozen. The wiggle amplitude is
  // scaled by how fast the entity is actually moving, so freezing (which zeroes
  // velocity) collapses the animation to its baseline on its own; frozenT is
  // then checked explicitly so it snaps rather than decays.
  function animateEntity(e, t) {
    var sp = e.sprite;
    if (!sp) return;
    var st = e.st;
    var frozen = st.frozenT > 0;

    if (e.kind === 'pickup') {
      // Pickups glint: a slow alpha pulse so a dropped coin catches the eye in
      // dark water without needing a particle.
      var ga = 1 - GLINT_AMP * (0.5 + 0.5 * Math.sin(t * GLINT_RATE * TAU + entPhase(e)));
      setOpacity(sp, ga);
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
      // bitePhase decays from the bite the AI just scored, so the jaw snap and
      // the damage are the same event.
      if (st.bitePhase > 0) { st.bitePhase -= dtOf() * 3.2; if (st.bitePhase < 0) st.bitePhase = 0; }
      rigState.bitePhase = st.bitePhase || 0;
      rigState.jawSnapT = st.biteCd > 0 ? st.biteCd : 0;
      if (frozen) { rigState.speedFrac = 0; rigState.turn = 0; }
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
    return { mats: [], geos: [], textures: [], created: 0, disposed: 0 };
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
    S.surface = null;
    S.caustics.length = 0;
    S.rays.length = 0;
    S.seams.length = 0;
    S.swayers.length = 0;
    S.drifters.length = 0;
    S.shimmer = null;

    // 4. GPU resources this run created. Materials and geometry are disposed
    //    in bulk from the ownership lists, which is why every creation site
    //    pushes into them.
    for (i = 0; i < envOwned.mats.length; i++) { if (disposeOne(envOwned.mats[i])) envOwned.disposed++; }
    for (i = 0; i < envOwned.geos.length; i++) { if (disposeOne(envOwned.geos[i])) envOwned.disposed++; }
    for (i = 0; i < envOwned.textures.length; i++) { if (disposeOne(envOwned.textures[i])) envOwned.disposed++; }
    envOwned.mats.length = 0;
    envOwned.geos.length = 0;
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
    S.animT = 0;
    S.lastNow = -1;
    S.inited = false;

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
    var W = d.WORLD || { w: 7200, h: 3600 };
    S.scene = scene3 || null;
    S.renderer = (ctx && ctx.renderer) || null;
    S.rng = (ctx && ctx.rng) || null;
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
    S.surfaceT = 0;
    S.ambientT = 0;
    S.matCache = {};
    S.views = {};
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
    S.drifters.length = 0;
    S.shimmer = null;
    S.animT = 0;
    S.lastNow = -1;
    S.headless = !(scene3 && typeof scene3.add === 'function');
    // ATMO-01: the engine's lights, created once at boot and driven from here
    // for the rest of the page's life. ctx.lights is the normal handover; a
    // caller may also use World.setLights() before or after init.
    if (ctx && ctx.lights) World.setLights(ctx.lights);

    buildNpcTables();
    buildBackground();
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
    animateWater(wt);

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

      var despawnable = e.kind !== 'pickup';
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
        if (!e.active) continue;
        applyMouthSuction(e, mouth, dt);
        integrate(e, dt);
      }

      gridUpdate(e);

      var sp = e.sprite;
      if (sp) {
        setPos(sp, e.x, e.y, Z_PLAY);
        // Rev 4: creature animation runs AFTER the position write. The heading
        // and the mirror are written INSIDE animateEntity (applyHeading), not
        // before it, because in 3D the mirror is a scale sign and the rotation
        // depends on it.
        animateEntity(e, wt);
      }
    }

    runSpawner(ctx, camX, camY);
  };

  // --------------------------------------------------------------- debug
  World.stats = function () {
    return {
      active: S.entities.length, free: S.free.length, pool: S.pool.length,
      decor: S.decor.length, zone: S.lastZoneId,
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
      World.init(scene, ctx);
      chk(World.entities === S.entities, 'World.entities is the live active list');
      chk(World.playerHits === playerHits, 'World.playerHits is the live hit list');

      var B = budget();
      chk(S.pool.length === B.total, 'pool preallocated to ENTITY_BUDGET.total (' + S.pool.length + ')');
      chk(added.length > 0, 'environment objects were added to the scene (' + added.length + ')');

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
      chk(!!(kv && kv.obj), 'kenney creature acquired a view object');
      if (hasArt3D && kv && kv.obj) {
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
      if (hasArt3D && kv && kv.obj && kv.obj.scale) {
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
      if (hasArt3D && kv && kv.obj) {
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
      var sucked = spawnOne('mackerel', 2200, 1400, 0);
      var unsucked = spawnOne('mine', 2450, 1400, 0);
      if (sucked && unsucked) {
        var mouth = { x: 2450, y: 1400, r: 280, strength: 2400, eligibleTierMax: sucked.tier };
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
      chk(World.zoneAt(3500) && World.zoneAt(3500).id === 4, 'zoneAt(3500) resolves to zone 4');
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
                      S.swayers.length + S.drifters.length;
      chk(S.caustics.length === CAUSTIC_N, 'caustic planes built (' + S.caustics.length + ')');
      chk(S.rays.length > 0, 'god rays registered for sway (' + S.rays.length + ')');
      chk(S.seams.length > 0, 'thermocline seams registered for drift (' + S.seams.length + ')');
      chk(S.swayers.length > 0, 'kelp registered for sway (' + S.swayers.length + ')');
      chk(S.drifters.length > 0, 'midwater silhouettes registered for drift (' + S.drifters.length + ')');
      chk(!!S.shimmer, 'whole-water tint shimmer plane built');
      chk(!!S.surface && !!S.surface.mesh, 'surface plane built at the waterline');
      chk(!!(S.surface && S.surface.foam), 'surface foam strip built');
      chk(!!S.surface && Math.abs(S.surface.mesh.position.y + 27) < 1e-6,
        'surface plane sits at the waterline (three y ' + S.surface.mesh.position.y + ' for sim y 27)');

      // Water layers must actually MOVE across updates, and stay bounded.
      var ray0 = S.rays[0];
      var rayRotMin = Infinity, rayRotMax = -Infinity;
      var rayAlphaMin = Infinity, rayAlphaMax = -Infinity;
      var caX = [];
      var shimMin = Infinity, shimMax = -Infinity;
      var swayMin = Infinity, swayMax = -Infinity;
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
        var shA = S.shimmer.img.material.opacity;
        if (shA < shimMin) shimMin = shA;
        if (shA > shimMax) shimMax = shA;
        var swR = S.swayers[0].img.rotation.z;
        if (swR < swayMin) swayMin = swR;
        if (swR > swayMax) swayMax = swR;
      }
      chk(rayRotMax - rayRotMin > 1e-4 && (rayRotMax - rayRotMin) <= RAY_ROT_AMP * 2.55,
        'god ray rotation sways within +-RAY_ROT_AMP (span ' + (rayRotMax - rayRotMin).toFixed(4) + ' rad)');
      chk(rayAlphaMin > 0 && rayAlphaMax <= ray0.aBase + 1e-9 &&
          rayAlphaMin >= ray0.aBase * RAY_ALPHA_LO - 1e-9,
        'god ray alpha cycles over the 0.5-1.0 band of its base (' +
        rayAlphaMin.toFixed(4) + ' to ' + rayAlphaMax.toFixed(4) + ')');
      var caMoved = false;
      for (var cq = 1; cq < caX.length; cq++) if (Math.abs(caX[cq] - caX[0]) > 1) caMoved = true;
      chk(caMoved, 'caustic plane drifts horizontally over time');
      chk(shimMax - shimMin > 1e-4 && shimMax <= SHIMMER_ALPHA[1] + 1e-9 && shimMin >= 0,
        'water tint shimmer breathes inside its authored alpha band (' +
        shimMin.toFixed(4) + ' to ' + shimMax.toFixed(4) + ')');
      chk(swayMax - swayMin > 1e-4 && Math.abs(swayMax) <= SWAY_AMP[1] * 1.6,
        'kelp sways in rotation about its rooted base (span ' + (swayMax - swayMin).toFixed(4) + ' rad)');
      var regAfter = S.caustics.length + S.rays.length + S.seams.length +
                     S.swayers.length + S.drifters.length;
      chk(regAfter === regBefore, 'animation registries never grow during update (' + regAfter + ')');

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
      // drawn at 0.04 to 0.09 opacity in the first place: it was never going
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
      // raised the ceiling; seven additive shafts in one merged band overlap
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
      chk(rayPeak > 0 && rayPeak <= 0.11,
        'ATMO-01: god-ray shafts are accents not slabs, peak vertex alpha ' +
        rayPeak.toFixed(3) + ' <= 0.11 (two overlapping shafts stay under 0.22)');

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

      // Facing mirror: a fish swimming LEFT must carry a negative x scale, and
      // one swimming RIGHT a positive one. This is the 3D form of flipX.
      var mf = spawnOne('mackerel', 3600 + 600, 900, 0);
      if (mf) {
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
      var pk = spawnOne('minnow', 2600, 950, 0);
      if (pk) {
        World.kill(pk, 'eaten');   // drops a pickup
        var pickEnt = null;
        for (var pe2 = 0; pe2 < S.entities.length; pe2++) {
          if (S.entities[pe2].kind === 'pickup') { pickEnt = S.entities[pe2]; break; }
        }
        if (pickEnt) {
          var gMin = Infinity, gMax = -Infinity;
          var pid = pickEnt.id;
          for (var gs = 0; gs < 90; gs++) {
            ctx.time.now += 1 / 60;
            World.update(ctx);
            if (!(pickEnt.active && pickEnt.id === pid)) break;
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
        chk(t1.sprite.material !== t2.sprite.material,
          'two entities of the same def own separate materials, so a status tint cannot leak');
        t1.st.frozenT = 3;
        World.update(ctx);
        var tinted = t1.active && t1.sprite.material.color &&
          t1.sprite.material.color.getHex() === TINT_FROZEN;
        var clean = !t2.active || !t2.sprite.material.color ||
          t2.sprite.material.color.getHex() !== TINT_FROZEN;
        chk(tinted && clean, 'frozen entity tinted and its shoal-mate did not');
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
      chk(grew <= 20,
        'steady-state scene creation is a convergent tail, not per-frame allocation (' +
        grew + ' objects across 4000 updates, one-per-frame would be thousands)');
      chk(added.length < 900,
        'total scene object count plateaus inside the memory budget (' + added.length + ')');
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
        S.swayers.length === 0 && S.drifters.length === 0 && S.caustics.length === 0 &&
        S.shimmer === null && S.surface === null && S.fog === null,
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
        'PERF-03: the environment contributes at most 60 draw calls (' + envMeshes +
        ' meshes, was about 260 before batching)');
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
