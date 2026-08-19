/* world.js (Lane B) - RF.World
 *
 * Owns: layered zone background, entity pools, spatial hash, spawner,
 * prey/predator AI, hazards, status-effect application, pickups, despawn.
 *
 * Laws honoured here:
 *  - No Math.random in sim. Every stochastic draw goes through ctx.rng.
 *  - Zero per-frame allocation in update(): scratch arrays are reused and
 *    every entity is preallocated in init().
 *  - Cross-namespace calls (RF.Fx, RF.Art, RF.Sound) are guarded; this file
 *    runs standalone if the other lanes are absent.
 *  - No window/document listeners, no setTimeout/setInterval.
 *  - No em dashes in any string.
 */
(function (root) {
  'use strict';

  var RF = (root.RF = root.RF || {});
  var World = {};

  // ---------------------------------------------------------------- consts
  var CELL = 256;              // spatial hash cell size, px
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
  // SPEC Rev 4: "the world reads static and flat, it must be ALIVE". Every
  // constant below is a named parameter so the owner can retune by reading
  // this block, and every one of them drives a pure sin() of the sim clock.
  // Nothing here allocates, tweens, or touches wall time.
  var CAUSTIC_N = 3;           // wide soft light strips under the surface
  var CAUSTIC_H = 600;         // strips live in the top CAUSTIC_H px of water
  var CAUSTIC_DRIFT = 190;     // px of horizontal sine travel
  var CAUSTIC_RATE = [0.055, 0.085];   // Hz-ish, deliberately very slow
  var CAUSTIC_ALPHA = [0.05, 0.12];    // breathing band, ADD blended
  var RAY_ROT_AMP = 0.03;      // +-0.03 rad sway per SPEC
  var RAY_ROT_RATE = [0.06, 0.13];
  var RAY_ALPHA_LO = 0.5;      // alpha multiplier floor of the 0.5-1.0 cycle
  var RAY_ALPHA_RATE = [0.09, 0.19];
  var SHIMMER_ALPHA = [0.012, 0.05];   // whole-water tint breath, very low
  var SHIMMER_RATE = 0.043;
  var SEAM_DRIFT = 70;         // thermocline seam horizontal travel, px
  var SEAM_RATE = [0.03, 0.06];
  var SWAY_AMP = [0.045, 0.13];        // kelp rotation amplitude, rad
  var SWAY_RATE = [0.30, 0.62];
  var SIL_DRIFT = [3, 7];      // silhouette px of sine travel (anchor kept)
  var SIL_RATE = [0.035, 0.075];

  // Creature animation. All per-entity phases come from PHI so nothing in the
  // shoal is ever synchronised. No tweens: pure sin() of the sim clock.
  var PHI = 0.61803398875;
  var FISH_WIGGLE = 0.12;      // +-0.12 rad tail wiggle at full speed
  var FISH_WIGGLE_HZ = [2.2, 7.5];     // rate scales with speed/max speed
  var JELLY_PULSE = 0.08;      // scale 0.92 - 1.08
  var JELLY_RATE = 0.55;
  var PUFF_TIME = 0.2;         // seconds to inflate or deflate (was a snap)
  var GLINT_RATE = 1.6;        // pickup alpha pulse
  var GLINT_AMP = 0.22;
  var NPC_PITCH = 0.05;        // predator whole-sprite pitch, rad
  var NPC_PITCH_HZ = 0.9;

  // Sim clock for all of the above. ctx.time.now is the fixed-step clock game.js
  // owns (seconds, += STEP per step), which is exactly what SPEC Rev 4 asks for
  // ("offsets from ctx time not wall clock"). Headless callers and the selftest
  // never advance it, so when it does not move we accumulate dt ourselves. The
  // result is monotonic in both cases and never reads Date/performance.
  function worldClock(ctx, dt) {
    var n = ctx && ctx.time && typeof ctx.time.now === 'number' ? ctx.time.now : -1;
    if (n > S.lastNow) { S.lastNow = n; S.animT = n; }
    else S.animT += dt;
    return S.animT;
  }

  // ------------------------------------------------------------- module state
  var S = {
    scene: null,
    rng: null,
    w: 7200, h: 3600,
    pool: [],                  // every preallocated entity, active or not
    free: [],                  // stack of inactive entities
    entities: [],              // dense list of ACTIVE entities
    grid: null,                // Map: cellKey -> array of ents
    cols: 0, rows: 0,
    nextId: 1,
    packSeq: 1,
    packs: null,               // Map: packId -> pooled record {dx, dy, t, owner}
    texCache: null,            // defId -> texture key
    decor: [],                 // static decoration images (never per-frame)
    surface: null,
    surfaceT: 0,
    fogRects: [],
    ambientT: 0,
    inited: false,
    headless: false,
    // Rev 4 "living water". Every animated object below is created ONCE in
    // init and only has scalar fields written per frame.
    caustics: [],              // {img, x0, ampX, rate, phase, aBase, aAmp, aRate}
    rays: [],                  // {img, rot0, rotAmp, rotRate, aBase, aAmp, aRate, phase}
    shimmer: null,             // whole-water tint overlay, alpha cycles
    seams: [],                 // {img, x0, ampX, rate, phase}
    swayers: [],               // {img, rot0, amp, rate, phase} kelp/seaweed
    drifters: [],              // {img, x0, y0, ampX, ampY, rate, phase} silhouettes
    animT: 0,                  // internal clock fallback (see worldClock)
    lastNow: -1,
  };

  // Reused scratch. Never reallocated after init.
  var scratchQuery = [];
  var scratchChain = [];
  var scratchSpawns = [];
  var playerHits = [];
  var weightScratch = [];

  // RF-PERF-01: hit records are POOLED. playerHits holds live records only for
  // the frame they were pushed; the backing store below is allocated once and
  // reused forever, so a hazard cluster produces zero garbage.
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

  // Rev 3 density: world bakes use RF.Game.dpr (title-side factor), NOT
  // GGKit.hiDpi, which the 2026-08-17 fleet kill switch clamps to 1.
  function bakeDpr() {
    var g = RF.Game;
    var d = g && typeof g.dpr === 'number' ? g.dpr : 1;
    if (!(d > 0) || !isFinite(d)) d = 1;
    return clamp(d, 1, 3);
  }
  // Returns {canvas, ctx} pre-scaled so all drawing is in CSS units, or null
  // when there is no document (headless self-test).
  function bakeCanvas(cssW, cssH) {
    var doc = root.document;
    if (!doc || !doc.createElement) return null;
    var d = bakeDpr();
    var c = doc.createElement('canvas');
    c.width = Math.max(1, Math.round(cssW * d));
    c.height = Math.max(1, Math.round(cssH * d));
    var ctx = c.getContext ? c.getContext('2d') : null;
    if (!ctx) return null;
    ctx.scale(d, d);
    ctx.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
    return { canvas: c, ctx: ctx, dpr: d, width: cssW, height: cssH };
  }
  function hexStr(v) { return '#' + ('000000' + (v >>> 0).toString(16)).slice(-6); }

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
  function displayLen(def, kind) { return radiusFor(def, kind) * 2.4; }

  // ------------------------------------------------------------- textures
  // Fallback bake: one tinted ellipse texture per def, generated ONCE.
  function ellipseTexture(scene, key, w, h, color, glow) {
    if (!scene || !scene.textures) return key;
    if (scene.textures.exists && scene.textures.exists(key)) return key;
    if (!scene.textures.addCanvas) return key;
    var t = bakeCanvas(w, h);
    if (!t) return key;
    var c = t.ctx;
    var cx = w / 2, cy = h / 2;
    var base = hexStr(color);
    var belly = hexStr(lerpColor(color, 0xffffff, 0.45));
    if (glow) {
      c.globalAlpha = 0.35;
      c.fillStyle = base;
      c.beginPath(); c.ellipse(cx, cy, w * 0.5, h * 0.5, 0, 0, TAU); c.fill();
      c.globalAlpha = 1;
    }
    var g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, base);
    g.addColorStop(1, belly);
    c.fillStyle = g;
    c.beginPath(); c.ellipse(cx, cy, w * 0.44, h * 0.4, 0, 0, TAU); c.fill();
    // Tail wedge so orientation reads at a glance.
    c.fillStyle = base;
    c.beginPath();
    c.moveTo(w * 0.06, cy);
    c.lineTo(w * 0.22, cy - h * 0.3);
    c.lineTo(w * 0.22, cy + h * 0.3);
    c.closePath(); c.fill();
    try { scene.textures.addCanvas(key, t.canvas); } catch (e) { /* key already taken */ }
    return key;
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

  function textureFor(def, kind) {
    if (!def) return null;
    var key = S.texCache[def.id];
    if (key) return key;
    var A = RF.Art;
    if (kind === 'predator' && A && typeof A.bakeShark === 'function') {
      try { key = A.bakeShark(S.scene, def, 'play'); } catch (e) { key = null; }
    } else if (A && typeof A.bakeCreature === 'function') {
      try { key = A.bakeCreature(S.scene, def); } catch (e) { key = null; }
    }
    if (!key) {
      var len = displayLen(def, kind);
      key = ellipseTexture(S.scene, 'rf_fb_' + def.id, Math.max(16, Math.round(len)),
        Math.max(10, Math.round(len * 0.5)), paletteBase(def), kind === 'predator');
    }
    S.texCache[def.id] = key;
    return key;
  }

  function coinTexture() {
    if (S.texCache.__coin) return S.texCache.__coin;
    var key = ellipseTexture(S.scene, 'rf_fb_coin', 20, 20, 0xffd166, true);
    S.texCache.__coin = key;
    return key;
  }

  // --------------------------------------------------------------- background
  //
  // RF-WORLD-DEPTH-01. Depth has to READ, not merely exist in data. Five
  // cheap, static layers do the work, all built once in init():
  //   -100 zone gradient band, contrast-stretched per zone so a boundary is a
  //         visible step, not a slow fade.
  //    -95 boundary seam: a short blend strip either side of each zone edge so
  //         the step reads as water changing, not as a texture join.
  //    -90 fog wash, alpha ramped hard with depth.
  //    -88 depth vignette: two edge bars per zone, darker the deeper you are.
  //    -86 midwater silhouettes: pooled static decor so open water is never a
  //         flat field (kelp towers, reef spires, abyssal chimneys).
  //    -80 surface light: the ribbon plus wide rays over the top ~500px.
  // Nothing here is touched per frame except one tileSprite scroll offset.

  var SURFACE_LIGHT_H = 500;   // rays reach this far down from y=0

  // Per-zone gradient contrast. Each zone starts near its own tint and ends
  // notably darker than the next zone's tint, so crossing a boundary is a
  // step change in value rather than a continuous ramp.
  function zoneTopColor(z, i) {
    var base = hexNum(z.tint);
    // Shallow zones lift toward their own fog colour: brighter, airier.
    var lift = i === 0 ? 0.34 : (i === 1 ? 0.20 : (i === 2 ? 0.10 : 0.05));
    return lerpColor(base, hexNum(z.fog), lift);
  }
  function zoneBotColor(z, i, Z) {
    var next = Z[i + 1] ? hexNum(Z[i + 1].tint) : 0x01040a;
    // Land ON the next zone's tint and then push past it toward black, so the
    // bottom of each band is darker than the top of the band below it.
    return lerpColor(next, 0x01040a, i === 3 ? 0.55 : 0.28);
  }

  function bandTexture(scene, key, topColor, botColor) {
    if (!scene || !scene.textures || !scene.textures.addCanvas) return null;
    if (scene.textures.exists && scene.textures.exists(key)) return key;
    var t = bakeCanvas(8, 256);
    if (!t) return null;
    var g = t.ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, hexStr(topColor));
    g.addColorStop(1, hexStr(botColor));
    t.ctx.fillStyle = g;
    t.ctx.fillRect(0, 0, 8, 256);
    try { scene.textures.addCanvas(key, t.canvas); } catch (e) { return key; }
    return key;
  }

  // Vertical fade strip, opaque `color` at one end to transparent at the
  // other. Used for the boundary seam, the vignette bars and the light rays.
  function fadeTexture(scene, key, color, fromTop) {
    if (!scene || !scene.textures || !scene.textures.addCanvas) return null;
    if (scene.textures.exists && scene.textures.exists(key)) return key;
    var t = bakeCanvas(8, 128);
    if (!t) return null;
    var g = t.ctx.createLinearGradient(0, 0, 0, 128);
    var c = hexStr(color);
    g.addColorStop(0, fromTop ? c : 'rgba(0,0,0,0)');
    g.addColorStop(1, fromTop ? 'rgba(0,0,0,0)' : c);
    t.ctx.fillStyle = g;
    t.ctx.fillRect(0, 0, 8, 128);
    try { scene.textures.addCanvas(key, t.canvas); } catch (e) { return key; }
    return key;
  }

  // Horizontal fade, opaque at the left edge. Two mirrored copies make a
  // cheap vignette without a full-screen shader or a per-frame draw.
  function sideFadeTexture(scene, key, color) {
    if (!scene || !scene.textures || !scene.textures.addCanvas) return null;
    if (scene.textures.exists && scene.textures.exists(key)) return key;
    var t = bakeCanvas(128, 8);
    if (!t) return null;
    var g = t.ctx.createLinearGradient(0, 0, 128, 0);
    g.addColorStop(0, hexStr(color));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    t.ctx.fillStyle = g;
    t.ctx.fillRect(0, 0, 128, 8);
    try { scene.textures.addCanvas(key, t.canvas); } catch (e) { return key; }
    return key;
  }

  // Rev 4: caustic strip. Soft on ALL FOUR edges, so a wide strip stretched
  // across the water reads as a band of refracted sunlight rather than a
  // rectangle with visible ends. Baked once and shared by every strip; the
  // strips differ only in position, scale, drift rate and alpha.
  function causticTexture(scene, key) {
    if (!scene || !scene.textures || !scene.textures.addCanvas) return null;
    if (scene.textures.exists && scene.textures.exists(key)) return key;
    var W = 256, H = 64;
    var t = bakeCanvas(W, H);
    if (!t) return null;
    // Vertical soft falloff first.
    var gv = t.ctx.createLinearGradient(0, 0, 0, H);
    gv.addColorStop(0, 'rgba(255,255,255,0)');
    gv.addColorStop(0.5, 'rgba(255,255,255,1)');
    gv.addColorStop(1, 'rgba(255,255,255,0)');
    t.ctx.fillStyle = gv;
    t.ctx.fillRect(0, 0, W, H);
    // Then mask the horizontal ends away, so the band fades out sideways too.
    if (t.ctx.globalCompositeOperation !== undefined) {
      t.ctx.globalCompositeOperation = 'destination-in';
      var gh = t.ctx.createLinearGradient(0, 0, W, 0);
      gh.addColorStop(0, 'rgba(0,0,0,0)');
      gh.addColorStop(0.35, 'rgba(0,0,0,1)');
      gh.addColorStop(0.65, 'rgba(0,0,0,1)');
      gh.addColorStop(1, 'rgba(0,0,0,0)');
      t.ctx.fillStyle = gh;
      t.ctx.fillRect(0, 0, W, H);
      t.ctx.globalCompositeOperation = 'source-over';
    }
    try { scene.textures.addCanvas(key, t.canvas); } catch (e) { return key; }
    return key;
  }

  // Soft-edged silhouette shapes for midwater decor. Baked once per shape,
  // reused by every instance, drawn dark so they read as distance.
  function silhouetteTexture(scene, shape) {
    var key = 'rf_sil_' + shape;
    if (!scene || !scene.textures || !scene.textures.addCanvas) return null;
    if (scene.textures.exists && scene.textures.exists(key)) return key;
    var w = 128, h = 256;
    var t = bakeCanvas(w, h);
    if (!t) return null;
    var c = t.ctx;
    c.fillStyle = '#000000';
    if (shape === 'kelptower') {
      // Three tapering stalks with leaf nubs: the midwater kelp mass.
      for (var k = 0; k < 3; k++) {
        var bx = 34 + k * 30;
        c.beginPath();
        c.moveTo(bx - 7, h);
        c.quadraticCurveTo(bx + (k - 1) * 26, h * 0.45, bx + (k - 1) * 12, h * 0.06);
        c.quadraticCurveTo(bx + (k - 1) * 30, h * 0.5, bx + 7, h);
        c.closePath(); c.fill();
        for (var lf = 0; lf < 5; lf++) {
          var ly = h * (0.16 + lf * 0.16);
          var lx = bx + (k - 1) * 18 * (1 - ly / h);
          c.beginPath();
          c.ellipse(lx + (lf % 2 ? 13 : -13), ly, 13, 4.5, lf % 2 ? 0.4 : -0.4, 0, TAU);
          c.fill();
        }
      }
    } else if (shape === 'spire') {
      // Reef spire: a leaning rock finger with a shoulder.
      c.beginPath();
      c.moveTo(30, h);
      c.lineTo(52, h * 0.30);
      c.lineTo(66, h * 0.05);
      c.lineTo(78, h * 0.34);
      c.lineTo(96, h);
      c.closePath(); c.fill();
      c.beginPath();
      c.moveTo(14, h);
      c.lineTo(40, h * 0.62);
      c.lineTo(58, h);
      c.closePath(); c.fill();
    } else if (shape === 'chimney') {
      // Abyssal vent chimney with a plume shoulder.
      c.beginPath();
      c.moveTo(40, h);
      c.lineTo(50, h * 0.34);
      c.lineTo(62, h * 0.12);
      c.lineTo(76, h * 0.36);
      c.lineTo(88, h);
      c.closePath(); c.fill();
      c.globalAlpha = 0.5;
      c.beginPath();
      c.ellipse(63, h * 0.10, 22, 12, 0, 0, TAU);
      c.fill();
      c.globalAlpha = 1;
    } else if (shape === 'arch') {
      // Shelf rock arch: a hole in the silhouette reads instantly as scale.
      c.beginPath();
      c.moveTo(10, h);
      c.lineTo(24, h * 0.30);
      c.quadraticCurveTo(64, h * 0.02, 104, h * 0.30);
      c.lineTo(118, h);
      c.closePath(); c.fill();
      c.globalCompositeOperation = 'destination-out';
      c.beginPath();
      c.moveTo(40, h);
      c.quadraticCurveTo(64, h * 0.36, 88, h);
      c.closePath(); c.fill();
      c.globalCompositeOperation = 'source-over';
    } else {
      c.beginPath(); c.ellipse(w / 2, h * 0.7, 40, h * 0.3, 0, 0, TAU); c.fill();
    }
    try { scene.textures.addCanvas(key, t.canvas); } catch (e) { return key; }
    return key;
  }

  function addStatic(img, depth, alpha, tint) {
    if (!img) return null;
    if (img.setOrigin) img.setOrigin(0, 0);
    if (img.setDepth) img.setDepth(depth);
    if (alpha != null && img.setAlpha) img.setAlpha(alpha);
    if (tint != null && img.setTint) img.setTint(tint);
    S.decor.push(img);
    return img;
  }

  function buildBackground() {
    var scene = S.scene;
    if (!scene || !scene.add) return;
    var Z = zones();
    for (var i = 0; i < Z.length; i++) {
      var z = Z[i];
      var top = zoneTopColor(z, i);
      var bot = zoneBotColor(z, i, Z);
      var h = z.yMax - z.yMin;
      var key = bandTexture(scene, 'rf_band_' + z.id, top, bot);
      if (key && scene.add.image) {
        var img = scene.add.image(0, z.yMin, key);
        if (img) {
          if (img.setOrigin) img.setOrigin(0, 0);
          if (img.setDisplaySize) img.setDisplaySize(S.w, h);
          if (img.setDepth) img.setDepth(-100);
          if (img.setScrollFactor) img.setScrollFactor(1);
        }
      } else if (scene.add.rectangle) {
        var r0 = scene.add.rectangle(0, z.yMin, S.w, h, top);
        if (r0 && r0.setOrigin) r0.setOrigin(0, 0);
        if (r0 && r0.setDepth) r0.setDepth(-100);
      }

      // Boundary seam: a dark lip below the join and a lighter lift above the
      // next zone, so the transition reads as a thermocline.
      if (i < Z.length - 1 && scene.add.image) {
        // Rev 4: the seams DRIFT horizontally. They are 2.4x wider than the
        // world and start pulled left, so a slow sine slide never exposes an
        // end of the strip at either world edge.
        var seamDown = fadeTexture(scene, 'rf_seam_dn', 0x000000, true);
        if (seamDown) {
          var sd = scene.add.image(-SEAM_DRIFT * 2, z.yMax, seamDown);
          if (sd && sd.setDisplaySize) sd.setDisplaySize(S.w + SEAM_DRIFT * 4, 170);
          addStatic(sd, -95, 0.20 + i * 0.07, null);
          registerSeam(sd, -SEAM_DRIFT * 2, i);
        }
        var seamUp = fadeTexture(scene, 'rf_seam_up', 0xffffff, false);
        if (seamUp) {
          var su = scene.add.image(-SEAM_DRIFT * 2, z.yMax - 120, seamUp);
          if (su && su.setDisplaySize) su.setDisplaySize(S.w + SEAM_DRIFT * 4, 120);
          addStatic(su, -95, 0.05, hexNum(z.fog));
          registerSeam(su, -SEAM_DRIFT * 2, i + 0.5);
        }
      }

      // Fog overlay: alpha ramps hard so the abyss reads heavy.
      if (scene.add.rectangle) {
        var fogA = 0.06 + i * i * 0.055 + i * 0.06;
        var fogRect = scene.add.rectangle(0, z.yMin, S.w, h, hexNum(z.fog), fogA);
        if (fogRect) {
          if (fogRect.setOrigin) fogRect.setOrigin(0, 0);
          if (fogRect.setDepth) fogRect.setDepth(-90);
          S.fogRects.push(fogRect);
        }
      }

      // Depth vignette: mirrored side bars, stronger every zone down. The
      // camera is 844 wide, so bars this size always touch the view edges.
      if (i > 0 && scene.add.image) {
        var vk = sideFadeTexture(scene, 'rf_vig', 0x000000);
        if (vk) {
          var vA = 0.10 + i * 0.13;
          var vW = 300;
          var stepY = 900;
          for (var vy = z.yMin; vy < z.yMax; vy += stepY) {
            var vh = Math.min(stepY, z.yMax - vy);
            var vl = scene.add.image(0, vy, vk);
            if (vl && vl.setDisplaySize) vl.setDisplaySize(vW, vh);
            addStatic(vl, -88, vA, null);
            var vr = scene.add.image(S.w, vy, vk);
            if (vr) {
              if (vr.setOrigin) vr.setOrigin(0, 0);
              if (vr.setDisplaySize) vr.setDisplaySize(-vW, vh);
              if (vr.setDepth) vr.setDepth(-88);
              if (vr.setAlpha) vr.setAlpha(vA);
              S.decor.push(vr);
            }
          }
        }
      }
    }
    buildDecor();
    buildMidwaterDecor();
    buildSurface();
    buildCaustics();
    buildShimmer();
  }

  // ------------------------------------------------ Rev 4 animation registry
  // Every animated background object is described by ONE record, allocated
  // here in init and then only READ per frame. update() writes scalars onto
  // the Phaser object and never creates anything.

  function registerSeam(img, x0, idx) {
    if (!img) return;
    S.seams.push({
      img: img, x0: x0,
      ampX: SEAM_DRIFT * rr(0.7, 1.15),
      rate: rr(SEAM_RATE[0], SEAM_RATE[1]),
      phase: rr(0, TAU) + idx * 1.3,
    });
  }

  // Caustics: a few very wide, very soft light strips in the top CAUSTIC_H px.
  // They slide horizontally on a slow sine and breathe in alpha on a second,
  // slower sine with a different rate, so the two never beat into a visible
  // repeating pattern. ADD blend, guarded, because a renderer without ADD must
  // not take the layer down with it.
  function buildCaustics() {
    var scene = S.scene;
    if (!scene || !scene.add || !scene.add.image) return;
    var key = causticTexture(scene, 'rf_caustic');
    if (!key) return;
    for (var i = 0; i < CAUSTIC_N; i++) {
      // Spread the strips down through the caustic band, brightest at the top.
      var t = CAUSTIC_N > 1 ? i / (CAUSTIC_N - 1) : 0;
      var y = 60 + t * (CAUSTIC_H - 120);
      var x0 = S.w * 0.5;
      var img = scene.add.image(x0, y, key);
      if (!img) continue;
      // Strips are wider than the world so the drift never shows an edge.
      if (img.setDisplaySize) img.setDisplaySize(S.w + CAUSTIC_DRIFT * 4, rr(150, 260) * (1 + t * 0.6));
      if (img.setRotation) img.setRotation(rr(-0.05, 0.05));
      if (img.setTint) img.setTint(i === 0 ? 0xeafdff : 0xbfe9f5);
      if (img.setBlendMode) { try { img.setBlendMode('ADD'); } catch (e) { /* renderer without ADD */ } }
      if (img.setDepth) img.setDepth(-83);
      if (img.setScrollFactor) img.setScrollFactor(rr(0.55, 0.85));
      var aBase = rr(CAUSTIC_ALPHA[0], CAUSTIC_ALPHA[1]) * (1 - t * 0.45);
      if (img.setAlpha) img.setAlpha(aBase);
      S.decor.push(img);
      S.caustics.push({
        img: img, x0: x0,
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

  // Whole-water tint shimmer: ONE full-world overlay whose alpha breathes at a
  // very low amplitude. Cheap (one rectangle, one alpha write per frame) and
  // it stops the column reading as a dead flat fill even where no other
  // animated layer is on screen.
  function buildShimmer() {
    var scene = S.scene;
    if (!scene || !scene.add || !scene.add.rectangle) return;
    var r = scene.add.rectangle(0, 0, S.w, S.h, 0x2ea3c8, SHIMMER_ALPHA[0]);
    if (!r) return;
    if (r.setOrigin) r.setOrigin(0, 0);
    if (r.setDepth) r.setDepth(-84);
    if (r.setBlendMode) { try { r.setBlendMode('ADD'); } catch (e) { /* renderer without ADD */ } }
    S.decor.push(r);
    S.shimmer = { img: r, aBase: SHIMMER_ALPHA[0], aAmp: SHIMMER_ALPHA[1] - SHIMMER_ALPHA[0], rate: SHIMMER_RATE, phase: 0.7 };
  }

  // Sparse static decoration: seafloor rocks plus a kelp band. Pooled images,
  // created once, never touched per frame.
  function buildDecor() {
    var scene = S.scene;
    if (!scene || !scene.add || !scene.add.image) return;
    var Z = zones();
    var have = scene.textures && scene.textures.exists;
    // `sway` (Rev 4): kelp is rooted at its base (origin 0.5,1 already) and
    // oscillates in ROTATION about that root, which is exactly how a stalk
    // moves in a current. Amplitude scales with the stalk's own height so a
    // tall stalk leans further than a stub, and the phase is drawn from the
    // seeded rng per instance so no two stalks are in step.
    function place(keys, x, y, scale, alpha, depth, flip, sway) {
      var k = null;
      for (var i = 0; i < keys.length; i++) {
        if (!have || scene.textures.exists(keys[i])) { k = keys[i]; break; }
      }
      if (!k) return;
      var img = scene.add.image(x, y, k);
      if (!img) return;
      if (img.setOrigin) img.setOrigin(0.5, 1);
      if (img.setScale) img.setScale(scale * (flip ? -1 : 1), scale);
      if (img.setAlpha) img.setAlpha(alpha);
      if (img.setDepth) img.setDepth(depth);
      S.decor.push(img);
      if (sway) {
        var amp = rr(SWAY_AMP[0], SWAY_AMP[1]) * clamp(scale / 1.2, 0.5, 1.5);
        S.swayers.push({
          img: img, rot0: 0, amp: amp,
          rate: rr(SWAY_RATE[0], SWAY_RATE[1]),
          phase: rr(0, TAU),
        });
      }
    }
    // Seafloor: rocks along the bottom of the world.
    var rockCount = 90;
    for (var i = 0; i < rockCount; i++) {
      place(['rock_a', 'rock_b'], rr(0, S.w), S.h - rr(0, 26), rr(0.5, 1.5), rr(0.45, 0.85), -85, rnd() < 0.5);
    }
    // Kelp band: dense in zone 2, sparse in zone 1.
    var kelpZone = Z[1] || Z[0];
    if (kelpZone) {
      for (var j = 0; j < 70; j++) {
        var y = rr(kelpZone.yMin + 40, kelpZone.yMax);
        place(['seaweed_c', 'seaweed_f'], rr(0, S.w), y, rr(0.7, 1.9), rr(0.3, 0.7), -86, rnd() < 0.5, true);
      }
    }
    var shelf = Z[0];
    if (shelf) {
      for (var k = 0; k < 34; k++) {
        place(['seaweed_f', 'seaweed_c'], rr(0, S.w), rr(shelf.yMax - 260, shelf.yMax), rr(0.5, 1.1), rr(0.25, 0.5), -86, rnd() < 0.5, true);
      }
    }
  }

  // Midwater silhouettes. Open water must never be an empty teal field, so
  // every zone gets its OWN landmark shape at its own value, scattered across
  // the full width and the full height of the zone. Static images, created
  // once; they never enter the entity pool or the per-frame loop.
  // VISUAL QA TUNE (844x390 live frame, zone 1): the first pass put 70
  // silhouettes at alpha 0.14-0.58 anywhere in a zone's vertical span, which
  // read as large dark ovals floating mid-column and made the water murky
  // instead of deep. Three rules now govern them:
  //
  //  1. ATMOSPHERE, NOT OBJECTS. Alpha is 0.04-0.09. They tint the water at
  //     the edge of vision; they are never a thing you look at.
  //  2. ANCHORED. Nothing free-floats. `anchor` is 'floor' (rises from the
  //     seafloor or the zone's lower boundary) or 'ceil' (descends from the
  //     surface light or the zone's upper boundary). A silhouette always
  //     touches an edge of the frame it appears in, so it has somewhere to be.
  //  3. SCALE CAPPED. The camera shows CAM_W design units across (world
  //     coordinates stay design units under game.js's cameras.main.setZoom
  //     (DPR), so screen fraction is measured against the DESIGN width, not
  //     the device-px backing store). No silhouette exceeds SIL_MAX_FRAC of
  //     that width. The source canvas is SIL_W wide, so the scale ceiling is
  //     derived, never hand-tuned.
  //
  // Count is halved, 70 to 34.
  var SIL_W = 128;             // silhouette source canvas width, CSS px
  var CAM_W = 844;             // design units visible across the camera
  var SIL_MAX_FRAC = 0.25;     // no silhouette wider than a quarter of frame
  var SIL_MAX_SCALE = (CAM_W * SIL_MAX_FRAC) / SIL_W;   // = 1.648

  //   n       instances in the zone
  //   scale   min/max, hard-clamped to SIL_MAX_SCALE below
  //   alpha   min/max, atmosphere range only
  //   anchor  'floor' rises from the bottom edge, 'ceil' descends from the top
  //   inset   how far the anchored base sits past the boundary, so a shape is
  //           rooted in the seam rather than balanced exactly on the line
  var ZONE_SIL = [
    { shape: 'arch',      n: 6,  scale: [0.9, 1.4], alpha: [0.05, 0.09], tint: 0x0d3d52, anchor: 'floor', inset: 40 },
    { shape: 'kelptower', n: 10, scale: [1.0, 1.6], alpha: [0.05, 0.09], tint: 0x08222f, anchor: 'floor', inset: 60 },
    { shape: 'spire',     n: 10, scale: [1.0, 1.6], alpha: [0.04, 0.08], tint: 0x05131e, anchor: 'floor', inset: 70 },
    { shape: 'chimney',   n: 8,  scale: [1.1, 1.6], alpha: [0.04, 0.07], tint: 0x02070d, anchor: 'floor', inset: 80 },
  ];

  function buildMidwaterDecor() {
    var scene = S.scene;
    if (!scene || !scene.add || !scene.add.image) return;
    var Z = zones();
    for (var i = 0; i < Z.length; i++) {
      var z = Z[i];
      var cfg = ZONE_SIL[i] || ZONE_SIL[ZONE_SIL.length - 1];
      var key = silhouetteTexture(scene, cfg.shape);
      if (!key) continue;
      for (var n = 0; n < cfg.n; n++) {
        var sc = rr(cfg.scale[0], cfg.scale[1]);
        if (sc > SIL_MAX_SCALE) sc = SIL_MAX_SCALE;
        var ceil = cfg.anchor === 'ceil';
        // Anchored: the base sits ON the zone boundary (plus a small inset so
        // it roots into the seam), and the shape grows away from it. The last
        // zone anchors to the world floor, which is where the rock decor is.
        var baseY = ceil ? (z.yMin - cfg.inset)
                         : ((i === Z.length - 1 ? S.h : z.yMax) + cfg.inset);
        var img = scene.add.image(rr(0, S.w), baseY, key);
        if (!img) continue;
        // Origin at the shape's base. A 'floor' shape rises upward from it; a
        // 'ceil' shape is Y-flipped below so it hangs downward instead.
        if (img.setOrigin) img.setOrigin(0.5, 1);
        // Negative Y scale flips a 'ceil' shape so its wide base is at the
        // top edge it hangs from. Origin stays at the anchored edge either
        // way, so the flip and the origin do not fight each other.
        if (img.setScale) img.setScale(sc * (rnd() < 0.5 ? -1 : 1), ceil ? -sc : sc);
        if (img.setAlpha) img.setAlpha(rr(cfg.alpha[0], cfg.alpha[1]));
        if (img.setTint) img.setTint(cfg.tint);
        // Parallax retained. Scroll factor is applied in WORLD units and the
        // main camera keeps world coordinates in design units under its DPR
        // zoom, so these values behave identically at any DPR.
        if (img.setScrollFactor) img.setScrollFactor(rr(0.55, 0.8));
        if (img.setDepth) img.setDepth(-86);
        S.decor.push(img);
        // Rev 4: silhouettes DRIFT a few px so the far water is never frozen.
        // Amplitude is deliberately tiny (SIL_DRIFT) because these shapes are
        // ANCHORED to a boundary by the tune pass and must stay rooted; this
        // is a shimmer of distance, not a shape that floats off its seam.
        S.drifters.push({
          img: img, x0: img.x, y0: baseY,
          ampX: rr(SIL_DRIFT[0], SIL_DRIFT[1]),
          ampY: rr(SIL_DRIFT[0], SIL_DRIFT[1]) * 0.4,
          rate: rr(SIL_RATE[0], SIL_RATE[1]),
          phase: rr(0, TAU),
        });
      }
    }
  }

  // Surface: the ribbon at y=0 plus a light field that stays legible from the
  // top ~500px of water, which is where the whole of zone 1 is played.
  function buildSurface() {
    var scene = S.scene;
    if (!scene || !scene.add) return;

    // 1. Wide light wash under the surface, so "up" is bright from far below.
    var washKey = fadeTexture(scene, 'rf_surf_wash', 0xbfe9f5, true);
    if (washKey && scene.add.image) {
      var wash = scene.add.image(0, 0, washKey);
      if (wash && wash.setDisplaySize) wash.setDisplaySize(S.w, SURFACE_LIGHT_H);
      addStatic(wash, -82, 0.22, null);
    }

    // 2. God rays: slanted bars fading downward. Static, tinted, cheap.
    var rayKey = fadeTexture(scene, 'rf_surf_ray', 0xdff6ff, true);
    if (rayKey && scene.add.image) {
      var rays = 26;
      for (var i = 0; i < rays; i++) {
        var ray = scene.add.image(rr(0, S.w), 0, rayKey);
        if (!ray) continue;
        if (ray.setOrigin) ray.setOrigin(0.5, 0);
        if (ray.setDisplaySize) ray.setDisplaySize(rr(40, 120), rr(300, SURFACE_LIGHT_H));
        var rot0 = rr(-0.22, 0.22);
        if (ray.setRotation) ray.setRotation(rot0);
        var rayA = rr(0.06, 0.16);
        if (ray.setAlpha) ray.setAlpha(rayA);
        if (ray.setBlendMode) { try { ray.setBlendMode('ADD'); } catch (e) { /* renderer without ADD */ } }
        if (ray.setDepth) ray.setDepth(-81);
        if (ray.setScrollFactor) ray.setScrollFactor(rr(0.7, 0.95));
        S.decor.push(ray);
        // Rev 4: rays SWAY. Rotation and alpha run on two different rates with
        // two different phases, so 26 rays never pulse together. Origin is
        // (0.5, 0) at the waterline, so a rotation pivots the ray about the
        // surface exactly like a real shaft of light.
        S.rays.push({
          img: ray, rot0: rot0,
          rotAmp: RAY_ROT_AMP * rr(0.6, 1.25),
          rotRate: rr(RAY_ROT_RATE[0], RAY_ROT_RATE[1]),
          rotPhase: rr(0, TAU),
          aBase: rayA,
          aRate: rr(RAY_ALPHA_RATE[0], RAY_ALPHA_RATE[1]),
          aPhase: rr(0, TAU),
        });
      }
    }

    // 3. The ribbon itself: a bright scrolling band at the waterline.
    var key = bandTexture(scene, 'rf_surface', 0xe6fbff, 0x2f86a8);
    if (key && scene.add.tileSprite) {
      var ts = scene.add.tileSprite(0, 0, S.w, 54, key);
      if (ts) {
        if (ts.setOrigin) ts.setOrigin(0, 0);
        if (ts.setDepth) ts.setDepth(-80);
        if (ts.setAlpha) ts.setAlpha(0.72);
        S.surface = ts;
        return;
      }
    }
    if (scene.add.rectangle) {
      var r0 = scene.add.rectangle(0, 0, S.w, 54, 0xe6fbff, 0.5);
      if (r0 && r0.setOrigin) r0.setOrigin(0, 0);
      if (r0 && r0.setDepth) r0.setDepth(-80);
      S.surface = r0;
    }
  }

  // --------------------------------------------------------------- pools
  function makeEntity() {
    return {
      active: false, id: 0, kind: 'prey', defId: null, def: null,
      tier: 1, x: 0, y: 0, vx: 0, vy: 0, angle: 0,
      hp: 1, maxHp: 1, r: 12, score: 0, coins: 0,
      st: {
        frozenT: 0, stunT: 0, burnT: 0, poisonT: 0, slowT: 0, cookedBy: null,
        burnDmg: 0, poisonDmg: 0, fireImmune: false, toxinImmune: false,
        packId: 0, jitterT: 0, jx: 0, jy: 0, mode: 'wander',
        inflated: false, biteCd: 0, life: 0, born: 0, drift: 0, puffS: 1,
      },
      sprite: null,
      _idx: -1,   // index into S.entities while active
      _cell: -1,  // spatial hash cell key while active
    };
  }

  function buildPool(total) {
    var scene = S.scene;
    for (var i = 0; i < total; i++) {
      var e = makeEntity();
      if (scene && scene.add && scene.add.image) {
        var sp = scene.add.image(0, 0, '__DEFAULT');
        if (sp) {
          if (sp.setVisible) sp.setVisible(false);
          if (sp.setActive) sp.setActive(false);
          if (sp.setDepth) sp.setDepth(0);
          e.sprite = sp;
        }
      }
      S.pool.push(e);
      S.free.push(e);
    }
  }

  function acquire() {
    var e = S.free.pop();
    if (!e) return null;
    e.active = true;
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
    if (e.sprite) {
      if (e.sprite.setVisible) e.sprite.setVisible(false);
      if (e.sprite.setActive) e.sprite.setActive(false);
    }
    S.free.push(e);
  }

  function resetSt(st) {
    st.frozenT = 0; st.stunT = 0; st.burnT = 0; st.poisonT = 0; st.slowT = 0;
    st.cookedBy = null; st.packId = 0; st.jitterT = 0; st.jx = 0; st.jy = 0;
    st.burnDmg = 0; st.poisonDmg = 0; st.fireImmune = false; st.toxinImmune = false;
    st.mode = 'wander'; st.inflated = false; st.biteCd = 0; st.life = 0;
    st.born = 0; st.drift = 0;
    // Rev 4: eased puffer scale. Reset so a recycled pool object never starts
    // life half-inflated from whatever it used to be.
    st.puffS = 1;
  }

  function applySprite(e) {
    var sp = e.sprite;
    if (!sp) return;
    var key = textureFor(e.def, e.kind);
    if (key && sp.setTexture) { try { sp.setTexture(key); } catch (err) { /* missing key */ } }
    if (sp.setPosition) sp.setPosition(e.x, e.y);
    if (sp.setVisible) sp.setVisible(true);
    if (sp.setActive) sp.setActive(true);
    if (sp.setDepth) sp.setDepth(e.kind === 'pickup' ? 8 : 4 + Math.min(3, e.tier * 0.1));
    if (sp.clearTint) sp.clearTint();
    if (sp.setDisplaySize) {
      var len = displayLen(e.def, e.kind);
      sp.setDisplaySize(len, len * 0.52);
    }
    if (sp.setAlpha) sp.setAlpha(1);
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

  /* query(x, y, r, kindFilter)
   * kindFilter: undefined (any), a kind string, or an array of kind strings.
   * RESULTS ARE VALID UNTIL THE NEXT query() CALL. The returned array is a
   * single reused scratch buffer; copy anything you need to keep.
   */
  World.query = function (x, y, r, kindFilter) {
    scratchQuery.length = 0;
    if (!S.inited) return scratchQuery;
    var r2 = r * r;
    var x0 = clamp(Math.floor((x - r) / CELL), 0, S.cols - 1);
    var x1 = clamp(Math.floor((x + r) / CELL), 0, S.cols - 1);
    var y0 = clamp(Math.floor((y - r) / CELL), 0, S.rows - 1);
    var y1 = clamp(Math.floor((y + r) / CELL), 0, S.rows - 1);
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
          var dx = e.x - x, dy = e.y - y;
          if (dx * dx + dy * dy <= r2) scratchQuery.push(e);
        }
      }
    }
    return scratchQuery;
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
    e.y = clamp(y, 8, S.h - 8);
    var stats = def.stats || null;
    e.maxHp = stats ? stats.hp : (def.hp || 1);
    e.hp = e.maxHp;
    e.r = radiusFor(def, kind);
    e.score = typeof def.score === 'number' ? def.score : Math.round(e.tier * 40);
    e.coins = typeof def.coins === 'number' ? def.coins : Math.max(1, Math.round(e.tier * 3));
    resetSt(e.st);
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
    out[1] = clamp(camY + Math.sin(a) * d, 40, S.h - 40);
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

  // ------------------------------------------------------------------ AI
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
    var g = playerTier - entTier;
    return g;
  }

  function steer(e, tx, ty, speed, dt, turn) {
    var dx = tx - e.x, dy = ty - e.y;
    var d = Math.sqrt(dx * dx + dy * dy) || 1;
    var wantX = (dx / d) * speed, wantY = (dy / d) * speed;
    var k = clamp((turn || 4) * dt, 0, 1);
    e.vx += (wantX - e.vx) * k;
    e.vy += (wantY - e.vy) * k;
  }

  function integrate(e, dt) {
    var slow = e.st.slowT > 0 ? 0.45 : 1;
    e.x += e.vx * dt * slow;
    e.y += e.vy * dt * slow;
    // Soft world bounds: reflect rather than clamp so nothing piles on an edge.
    if (e.x < 20) { e.x = 20; e.vx = Math.abs(e.vx); }
    else if (e.x > S.w - 20) { e.x = S.w - 20; e.vx = -Math.abs(e.vx); }
    if (e.y < 12) { e.y = 12; e.vy = Math.abs(e.vy); }
    else if (e.y > S.h - 12) { e.y = S.h - 12; e.vy = -Math.abs(e.vy); }
    if (e.vx || e.vy) e.angle = Math.atan2(e.vy, e.vx);
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
          steer(e, e.x - (dx / d) * 400, e.y - (dy / d) * 400, spd * 1.35, dt, 6);
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
          fx('chomp', e.x, e.y, null);
          sfx('hurt', null);
        }
        return;
      }
      if (pt > e.tier && d2 < 520 * 520) {
        // Outranked: they become prey and run.
        e.st.mode = 'flee';
        var d = Math.sqrt(d2) || 1;
        steer(e, e.x - (dx / d) * 500, e.y - (dy / d) * 500, spd * 1.15, dt, 5);
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
      // Rev 4: the sprite scale is NOT written here any more. It snapped
      // between 1.0 and 1.5 in one frame, which read as a popping sprite.
      // animateEntity() now eases st.puffS toward the target over PUFF_TIME.
      // st.inflated remains the gameplay authority (hitbox above, and the
      // eatable/not-eatable flag game.js reads) and is unchanged, so the
      // easing is purely cosmetic and cannot desync the collision.
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
      p.hp = p.maxHp = 1;
      p.r = 14;
      p.score = 0;
      p.coins = Math.max(1, Math.round((e.coins || 1) / n));
      resetSt(p.st);
      p.st.life = 12;
      var sp = p.sprite;
      if (sp) {
        var key = coinTexture();
        if (key && sp.setTexture) { try { sp.setTexture(key); } catch (err) {} }
        if (sp.setPosition) sp.setPosition(p.x, p.y);
        if (sp.setVisible) sp.setVisible(true);
        if (sp.setActive) sp.setActive(true);
        if (sp.setDepth) sp.setDepth(8);
        if (sp.clearTint) sp.clearTint();
        if (sp.setDisplaySize) sp.setDisplaySize(20, 20);
        if (sp.setAlpha) sp.setAlpha(1);
      }
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
    // Tint carries the status so it reads without extra sprites.
    var sp = e.sprite;
    if (sp && sp.setTint && sp.clearTint) {
      if (st.frozenT > 0) sp.setTint(0x8fd7ff);
      else if (st.burnT > 0) sp.setTint(0xff8a4a);
      else if (st.poisonT > 0) sp.setTint(0x8ee06f);
      else if (st.stunT > 0) sp.setTint(0xffe08a);
      else sp.clearTint();
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
  //   spread    emission box around the camera
  //   rise      emission angle in degrees (bubbles up, snow down)
  // Rev 4: density raised ~2x per zone. `every` is halved so bursts arrive
  // twice as often; `count` is raised where the pool can carry it. The zone
  // CHARACTER curve is preserved: the shelf is still busy and the abyss is
  // still sparse relative to it, the whole curve just sits higher. Emission
  // still goes through the guarded fx() wrapper, so lane F's own budget
  // ceiling remains the authority and a dropped emit is harmless here.
  var AMBIENT = [
    { fx: 'bubbles', every: 0.11, count: 4, tint: 0xdff6ff, sx: 460, sy: 300, angle: 270, speed: 70, scale: 0.9 },
    { fx: 'motes',   every: 0.13, count: 3, tint: 0x7fd6a8, sx: 480, sy: 320, angle: 250, speed: 34, scale: 0.8 },
    { fx: 'motes',   every: 0.15, count: 3, tint: 0xcfe3ee, sx: 500, sy: 340, angle: 90,  speed: 26, scale: 0.7 },
    { fx: 'motes',   every: 0.35, count: 2, tint: 0x6fd0ff, sx: 520, sy: 360, angle: 90,  speed: 12, scale: 1.25 },
  ];
  // Reused options object. Never replaced, so update() allocates nothing.
  var ambientOpts = { tint: 0, count: 1, angle: 0, speed: 0, scale: 1 };
  // Secondary pass in the shelf: light shafts read as bubbles plus a wide,
  // bright mote so the surface band has visible activity under it.
  var shaftOpts = { tint: 0xeafcff, count: 1, angle: 270, speed: 16, scale: 2.2 };

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
    fx(a.fx, camX + rr(-a.sx, a.sx), camY + rr(-a.sy, a.sy), ambientOpts);
    // Shelf only, and only while the surface light actually reaches: one slow
    // shaft mote drifting up through the rays.
    if (idx === 0 && camY < SURFACE_LIGHT_H + 260 && rnd() < 0.55) {
      fx('motes', camX + rr(-420, 420), rr(20, SURFACE_LIGHT_H), shaftOpts);
    }
  }

  // ------------------------------------------------------ Rev 4 water motion
  // ONE pass over five fixed-size registries. Every record was built in init;
  // this function reads records and writes scalars onto Phaser objects. It
  // allocates nothing, calls no rng, and its cost is O(background layers),
  // which is a constant of the build, not of the entity count.
  //
  // The registry sizes at ship settings: 3 caustics, 26 rays, 6 seams,
  // 104 swayers, 34 drifters = 173 objects touched per frame, each one or two
  // property writes. That is far below the per-frame cost of the 70 on-screen
  // entities and does not move the perf gate.
  function animateWater(t) {
    var i, rec, o;

    // Caustic light bands: horizontal sine drift plus an independent alpha
    // breath. Two different rates per strip means the pattern never repeats
    // on a period a player can perceive.
    for (i = 0; i < S.caustics.length; i++) {
      rec = S.caustics[i]; o = rec.img;
      if (!o) continue;
      o.x = rec.x0 + Math.sin(t * rec.rate * TAU + rec.phase) * rec.ampX;
      var ca = rec.aBase + Math.sin(t * rec.aRate * TAU + rec.aPhase) * rec.aAmp;
      if (ca < 0) ca = 0;
      if (o.setAlpha) o.setAlpha(ca); else o.alpha = ca;
    }

    // God rays: +-RAY_ROT_AMP rad of sway and an alpha cycle over the
    // RAY_ALPHA_LO..1.0 fraction of the ray's own baked-in brightness.
    for (i = 0; i < S.rays.length; i++) {
      rec = S.rays[i]; o = rec.img;
      if (!o) continue;
      var rot = rec.rot0 + Math.sin(t * rec.rotRate * TAU + rec.rotPhase) * rec.rotAmp;
      if (o.setRotation) o.setRotation(rot); else o.rotation = rot;
      // sin -> 0..1 -> RAY_ALPHA_LO..1
      var u = 0.5 + 0.5 * Math.sin(t * rec.aRate * TAU + rec.aPhase);
      var ra = rec.aBase * (RAY_ALPHA_LO + (1 - RAY_ALPHA_LO) * u);
      if (o.setAlpha) o.setAlpha(ra); else o.alpha = ra;
    }

    // Whole-water tint shimmer. One rectangle, one alpha write.
    if (S.shimmer && S.shimmer.img) {
      rec = S.shimmer;
      var sa = rec.aBase + (0.5 + 0.5 * Math.sin(t * rec.rate * TAU + rec.phase)) * rec.aAmp;
      if (rec.img.setAlpha) rec.img.setAlpha(sa); else rec.img.alpha = sa;
    }

    // Thermocline seams drift sideways, so a zone boundary looks like water
    // moving through a temperature layer instead of a pasted-on gradient.
    for (i = 0; i < S.seams.length; i++) {
      rec = S.seams[i]; o = rec.img;
      if (!o) continue;
      o.x = rec.x0 + Math.sin(t * rec.rate * TAU + rec.phase) * rec.ampX;
    }

    // Kelp and seaweed sway about their rooted base.
    for (i = 0; i < S.swayers.length; i++) {
      rec = S.swayers[i]; o = rec.img;
      if (!o) continue;
      var sw = rec.rot0 + Math.sin(t * rec.rate * TAU + rec.phase) * rec.amp;
      if (o.setRotation) o.setRotation(sw); else o.rotation = sw;
    }

    // Midwater silhouettes drift a few px. Anchor is preserved: the motion is
    // an offset from the placed position, never an accumulation.
    for (i = 0; i < S.drifters.length; i++) {
      rec = S.drifters[i]; o = rec.img;
      if (!o) continue;
      var ph = t * rec.rate * TAU + rec.phase;
      o.x = rec.x0 + Math.sin(ph) * rec.ampX;
      o.y = rec.y0 + Math.sin(ph * 0.63 + 1.1) * rec.ampY;
    }
  }

  // -------------------------------------------------- Rev 4 creature motion
  // Called once per entity per frame from the SAME loop that already writes
  // the sprite position, so it costs one extra branch and a couple of sin()
  // calls per active entity. O(active entities), zero allocation, no tweens.
  //
  // Per-entity phase is (id * PHI) * TAU. The golden ratio makes consecutive
  // ids land maximally far apart on the circle, so a pack spawned in one
  // burst is never in step: a shoal reads as a shoal, not as a rigid formation.
  function entPhase(e) { return (e.id * PHI % 1) * TAU; }

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
      // Pickups glint: a slow alpha pulse so a dropped coin catches the eye
      // in dark water without needing a particle.
      if (sp.setAlpha) {
        var ga = 1 - GLINT_AMP * (0.5 + 0.5 * Math.sin(t * GLINT_RATE * TAU + entPhase(e)));
        sp.setAlpha(ga);
      }
      return;
    }

    if (e.kind === 'hazard') {
      var id = e.defId;
      if (id === 'jelly') {
        // Bell pulse, synced to the vertical bob hazardAI already drives off
        // st.drift, so the bell contracts as the animal rises.
        var jl = displayLen(e.def, 'hazard');
        var pulse = frozen ? 1 : 1 + JELLY_PULSE * Math.sin(st.drift * JELLY_RATE * TAU + entPhase(e));
        if (sp.setDisplaySize) sp.setDisplaySize(jl * (2 - pulse), jl * 0.52 * pulse);
        return;
      }
      if (id === 'puffer') {
        // Inflate/deflate ANIMATES over PUFF_TIME instead of snapping between
        // 1.0 and 1.5. st.puffS is the eased current scale; st.inflated stays
        // the gameplay authority for game.js and is untouched here.
        var want = st.inflated ? 1.5 : 1.0;
        if (typeof st.puffS !== 'number') st.puffS = want;
        var step = (1.5 - 1.0) * (dtOf() / PUFF_TIME);
        if (st.puffS < want) { st.puffS += step; if (st.puffS > want) st.puffS = want; }
        else if (st.puffS > want) { st.puffS -= step; if (st.puffS < want) st.puffS = want; }
        var pl = displayLen(e.def, 'hazard');
        if (sp.setDisplaySize) sp.setDisplaySize(pl * st.puffS, pl * 0.52 * st.puffS);
        return;
      }
      // mine and unknown hazards: no body animation, the AI bob is enough.
      return;
    }

    // Prey and predators: tail wiggle as a rotation offset ON TOP of the
    // heading the sim computed. The sprite's rotation is set from e.angle by
    // the caller immediately before this runs, so we add to it.
    var spd = Math.sqrt(e.vx * e.vx + e.vy * e.vy);
    var maxSpd = (e.def && (e.def.speed || (e.def.stats && e.def.stats.speed))) || 160;
    var f = maxSpd > 0 ? clamp(spd / maxSpd, 0, 1.4) : 0;
    if (frozen) f = 0;

    if (e.kind === 'predator') {
      // NPC sharks: Lane D's bakeSharkRig / Lane A's rig animation is the real
      // answer here. Until a rig hook exists this is a subtle whole-sprite
      // pitch so a patrolling shark never reads frozen, at an amplitude low
      // enough that it will not fight a rig that lands later.
      var pitch = NPC_PITCH * (0.35 + 0.65 * f) * Math.sin(t * NPC_PITCH_HZ * TAU + entPhase(e));
      if (frozen) pitch = 0;
      if (sp.setRotation) sp.setRotation(e.angle + pitch);
      return;
    }

    // Fish: rate scales with speed, amplitude with speed. A drifting fish
    // barely moves its tail; a fleeing one thrashes.
    var hz = FISH_WIGGLE_HZ[0] + (FISH_WIGGLE_HZ[1] - FISH_WIGGLE_HZ[0]) * f;
    var amp = FISH_WIGGLE * (0.25 + 0.75 * f);
    var wig = f > 0 ? Math.sin(t * hz * TAU + entPhase(e)) * amp : 0;
    if (sp.setRotation) sp.setRotation(e.angle + wig);
  }

  // The eased puffer needs dt. update() stashes it here rather than threading
  // an extra argument through, and it is a module scalar, so no allocation.
  var lastDt = 1 / 60;
  function dtOf() { return lastDt; }

  // ----------------------------------------------------------------- init
  World.init = function (scene, ctx) {
    var d = D();
    var W = d.WORLD || { w: 7200, h: 3600 };
    S.scene = scene || null;
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
    S.texCache = {};
    S.decor.length = 0;
    S.fogRects.length = 0;
    S.surface = null;
    S.surfaceT = 0;
    S.ambientT = 0;
    // Rev 4 animation registries. Cleared here and refilled by buildBackground;
    // after init nothing is ever pushed to them again.
    S.caustics.length = 0;
    S.rays.length = 0;
    S.seams.length = 0;
    S.swayers.length = 0;
    S.drifters.length = 0;
    S.shimmer = null;
    S.animT = 0;
    S.lastNow = -1;
    S.headless = !(scene && scene.add);

    buildNpcTables();
    buildBackground();
    buildPool((d.ENTITY_BUDGET && d.ENTITY_BUDGET.total) || 140);

    if (scene && scene.cameras && scene.cameras.main && scene.cameras.main.setBounds) {
      scene.cameras.main.setBounds(0, 0, S.w, S.h);
    }
    if (scene && scene.physics && scene.physics.world && scene.physics.world.setBounds) {
      scene.physics.world.setBounds(0, 0, S.w, S.h);
    }
    var F = RF.Fx;
    if (F && typeof F.init === 'function' && scene) {
      // Lane F owns emitter construction; calling init here is harmless if it
      // has already run, and covers the case where world boots first.
      try { F.init(scene); } catch (e) { /* lane F not ready */ }
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
    resetHits();
    syncPlayerImmunity(ctx);

    var player = ctx && ctx.player;
    var camX, camY;
    if (player) { camX = player.x; camY = player.y; }
    else if (S.scene && S.scene.cameras && S.scene.cameras.main) {
      var c = S.scene.cameras.main;
      camX = c.scrollX + c.width * 0.5;
      camY = c.scrollY + c.height * 0.5;
    } else { camX = S.w * 0.5; camY = S.h * 0.5; }

    // Surface highlight: cheap sine scroll, no allocation.
    S.surfaceT += dt;
    if (S.surface && S.surface.tilePositionX !== undefined) {
      S.surface.tilePositionX = Math.sin(S.surfaceT * 0.6) * 40 + S.surfaceT * 14;
    }

    // Rev 4 "living water". Fixed-size registries, scalar writes only. The
    // same clock value drives the creature pass below, so water and creatures
    // never drift apart.
    lastDt = dt;
    var wt = worldClock(ctx, dt);
    animateWater(wt);

    // Ambient particle character, per zone. Each zone gets its own emission
    // family, cadence, tint and drift, so the water itself tells you where
    // you are. Options travel in ONE reused object: zero per-frame allocation.
    S.ambientT -= dt;
    if (S.ambientT <= 0) {
      var zc = World.zoneAt(camY);
      emitAmbient(zc, camX, camY);
    }

    // Iterate backwards: kill() swap-pops, so a backwards walk stays correct.
    for (var i = S.entities.length - 1; i >= 0; i--) {
      var e = S.entities[i];
      if (!e.active) continue;

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
        integrate(e, dt);
      } else {
        if (e.kind === 'prey') preyAI(e, ctx, dt);
        else if (e.kind === 'predator') predatorAI(e, ctx, dt);
        else if (e.kind === 'hazard') hazardAI(e, ctx, dt);
        else if (e.kind === 'pickup') pickupAI(e, ctx, dt);
        if (!e.active) continue;
        integrate(e, dt);
      }

      gridUpdate(e);

      var sp = e.sprite;
      if (sp) {
        if (sp.setPosition) sp.setPosition(e.x, e.y);
        else { sp.x = e.x; sp.y = e.y; }
        if (e.kind !== 'pickup') {
          if (sp.setRotation) sp.setRotation(e.angle);
          if (sp.setFlipY) sp.setFlipY(Math.cos(e.angle) < 0);
        }
        // Rev 4: creature animation runs AFTER the heading write, because the
        // wiggle is an offset on top of e.angle.
        animateEntity(e, wt);
      }
    }

    runSpawner(ctx, camX, camY);
  };

  // --------------------------------------------------------------- debug
  World.stats = function () {
    return { active: S.entities.length, free: S.free.length, pool: S.pool.length };
  };

  // ------------------------------------------------------------- selftest
  World.__selftest = function () {
    var notes = [];
    var pass = true;
    function chk(cond, msg) { if (!cond) { pass = false; notes.push('FAIL ' + msg); } else notes.push('ok ' + msg); }

    // Deterministic stub rng (mulberry32), stub scene, stub ctx.
    var seed = 0x9e3779b9 >>> 0;
    function rngStub() {
      seed = (seed + 0x6D2B79F5) >>> 0;
      var t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    // Rev 4: the stub now RECORDS rotation, alpha, scroll factor, blend mode
    // and display size, because the animation assertions read them back.
    function stubGO() {
      var g = {
        x: 0, y: 0, visible: false, tex: null, tint: -1,
        rotation: 0, alpha: 1, dw: 0, dh: 0, sf: 1, blend: null, depth: 0,
        setPosition: function (x, y) { this.x = x; this.y = y; return this; },
        setVisible: function (v) { this.visible = v; return this; },
        setActive: function () { return this; },
        setDepth: function (d) { this.depth = d; return this; },
        setOrigin: function () { return this; },
        setScale: function () { return this; },
        setAlpha: function (a) { this.alpha = a; return this; },
        setRotation: function (r) { this.rotation = r; return this; },
        setFlipY: function () { return this; },
        setDisplaySize: function (w, h) { this.dw = w; this.dh = h; return this; },
        setScrollFactor: function (s) { this.sf = s; return this; },
        setBlendMode: function (b) { this.blend = b; return this; },
        setTexture: function (k) { this.tex = k; return this; },
        setTint: function (t) { this.tint = t; return this; },
        clearTint: function () { this.tint = -1; return this; },
      };
      return g;
    }
    var scene = {
      textures: { exists: function () { return true; }, addCanvas: function () {} },
      add: {
        image: function () { return stubGO(); },
        rectangle: function () { return stubGO(); },
        tileSprite: function () { var g = stubGO(); g.tilePositionX = 0; return g; },
      },
      cameras: { main: { setBounds: function () {}, scrollX: 0, scrollY: 0, width: 844, height: 390 } },
    };
    var ctx = {
      rng: rngStub,
      time: { now: 0, dt: 1 / 60, frame: 0 },
      run: { score: 0, coins: 0 },
      player: { x: 3600, y: 500, tier: 3, r: 30, st: {} },
    };

    var savedState = null;
    try {
      World.init(scene, ctx);
      var B = budget();
      chk(S.pool.length === B.total, 'pool preallocated to ENTITY_BUDGET.total (' + S.pool.length + ')');

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
      World.kill(a, 'test'); World.kill(b, 'test'); World.kill(far, 'test');

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

      // Status timers applied: burn kills, credit lands on the run.
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
      for (var q = 0; q < 20; q++) World.update(ctx);
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
      // and an internal dt accumulator when it does not. The stub ctx above
      // leaves time.now at 0, so this exercises the fallback path; advancing
      // time.now below proves the primary path is preferred.
      var t0 = S.animT;
      ctx.time.now = 5;
      World.update(ctx);
      chk(S.animT === 5, 'worldClock follows ctx.time.now when the host advances it (' + S.animT + ')');
      ctx.time.now = 5;
      World.update(ctx);
      chk(S.animT > 5, 'worldClock falls back to accumulating dt when time.now is frozen (' + S.animT.toFixed(4) + ')');
      chk(t0 > 0, 'clock had already accumulated before time.now was set (' + t0.toFixed(3) + ')');

      // Registries are built ONCE and never grow. Snapshot their lengths,
      // run a long stretch of updates, and require them unchanged.
      var regBefore = S.caustics.length + S.rays.length + S.seams.length +
                      S.swayers.length + S.drifters.length;
      chk(S.caustics.length === CAUSTIC_N, 'caustic strips built (' + S.caustics.length + ')');
      chk(S.rays.length > 0, 'god rays registered for sway (' + S.rays.length + ')');
      chk(S.seams.length > 0, 'thermocline seams registered for drift (' + S.seams.length + ')');
      chk(S.swayers.length > 0, 'kelp/seaweed registered for sway (' + S.swayers.length + ')');
      chk(S.drifters.length > 0, 'midwater silhouettes registered for drift (' + S.drifters.length + ')');
      chk(!!S.shimmer, 'whole-water tint shimmer overlay built');

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
        if (ray0.img.rotation < rayRotMin) rayRotMin = ray0.img.rotation;
        if (ray0.img.rotation > rayRotMax) rayRotMax = ray0.img.rotation;
        if (ray0.img.alpha < rayAlphaMin) rayAlphaMin = ray0.img.alpha;
        if (ray0.img.alpha > rayAlphaMax) rayAlphaMax = ray0.img.alpha;
        if (wstep % 90 === 0) caX.push(S.caustics[0].img.x);
        if (S.shimmer.img.alpha < shimMin) shimMin = S.shimmer.img.alpha;
        if (S.shimmer.img.alpha > shimMax) shimMax = S.shimmer.img.alpha;
        if (S.swayers[0].img.rotation < swayMin) swayMin = S.swayers[0].img.rotation;
        if (S.swayers[0].img.rotation > swayMax) swayMax = S.swayers[0].img.rotation;
      }
      chk(rayRotMax - rayRotMin > 1e-4 && (rayRotMax - rayRotMin) <= RAY_ROT_AMP * 2.55,
        'god ray rotation sways within +-RAY_ROT_AMP (span ' + (rayRotMax - rayRotMin).toFixed(4) + ' rad)');
      chk(rayAlphaMin > 0 && rayAlphaMax <= ray0.aBase + 1e-9 &&
          rayAlphaMin >= ray0.aBase * RAY_ALPHA_LO - 1e-9,
        'god ray alpha cycles over the 0.5-1.0 band of its base (' +
        rayAlphaMin.toFixed(4) + ' to ' + rayAlphaMax.toFixed(4) + ')');
      var caMoved = false;
      for (var cq = 1; cq < caX.length; cq++) if (Math.abs(caX[cq] - caX[0]) > 1) caMoved = true;
      chk(caMoved, 'caustic band drifts horizontally over time');
      chk(shimMax - shimMin > 1e-4 && shimMax <= SHIMMER_ALPHA[1] + 1e-9 && shimMin >= 0,
        'water tint shimmer breathes inside its authored alpha band (' +
        shimMin.toFixed(4) + ' to ' + shimMax.toFixed(4) + ')');
      chk(swayMax - swayMin > 1e-4 && Math.abs(swayMax) <= SWAY_AMP[1] * 1.6,
        'kelp sways in rotation about its rooted base (span ' + (swayMax - swayMin).toFixed(4) + ' rad)');
      var regAfter = S.caustics.length + S.rays.length + S.seams.length +
                     S.swayers.length + S.drifters.length;
      chk(regAfter === regBefore, 'animation registries never grow during update (' + regAfter + ')');

      // Phase spread: no two rays or drifters share a phase, so the layer
      // cannot pulse in unison.
      var samePhase = 0;
      for (var pa = 1; pa < S.rays.length; pa++) {
        if (S.rays[pa].rotPhase === S.rays[pa - 1].rotPhase) samePhase++;
      }
      chk(samePhase === 0, 'every god ray carries its own phase (0 duplicates across ' + S.rays.length + ')');

      // ---------------------------------------------- Rev 4 creature motion
      // A swimming fish's sprite rotation must change across updates, and must
      // return to its heading baseline when frozen.
      ctx.player.x = 3600; ctx.player.y = 900; ctx.player.tier = 3;
      var wf = spawnOne('mackerel', 3600 + 700, 900, 0);
      if (wf) {
        wf.vx = (wf.def.speed || 160); wf.vy = 0;
        var offMin = Infinity, offMax = -Infinity, sawOff = 0;
        for (var ws = 0; ws < 120; ws++) {
          ctx.time.now += 1 / 60;
          World.update(ctx);
          if (!wf.active) break;
          var off = wf.sprite.rotation - wf.angle;
          if (off < offMin) offMin = off;
          if (off > offMax) offMax = off;
          if (Math.abs(off) > 1e-6) sawOff++;
        }
        chk(wf.active && sawOff > 10 && (offMax - offMin) > 1e-3,
          'swimming fish sprite rotation oscillates around its heading (span ' +
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
          var foff = Math.abs(wf.sprite.rotation - wf.angle);
          if (foff > frozenOffMax) frozenOffMax = foff;
        }
        chk(wf.active && frozenOffMax < 1e-9,
          'frozen fish returns to its heading baseline, no residual wiggle (' + frozenOffMax + ')');
        wf.st.frozenT = 0;
        if (wf.active) World.kill(wf, 'test');
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

      // Puffer inflation EASES rather than snapping. It must take multiple
      // frames to cross the 1.0 -> 1.5 range and must land exactly on target.
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

      // Pickups glint: alpha must vary and stay inside 1-GLINT_AMP .. 1.
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
            if (pickEnt.sprite.alpha < gMin) gMin = pickEnt.sprite.alpha;
            if (pickEnt.sprite.alpha > gMax) gMax = pickEnt.sprite.alpha;
          }
          chk(gMax - gMin > 1e-4 && gMin >= 1 - GLINT_AMP - 1e-9 && gMax <= 1 + 1e-9,
            'pickup glints inside its alpha band (' + gMin.toFixed(4) + ' to ' + gMax.toFixed(4) + ')');
        } else {
          notes.push('note: no pickup was dropped, glint path not exercised');
        }
      }

      // Ambient density: SPEC Rev 4 asks for roughly 2x emission per zone.
      // Assert against the Rev 3 cadences the tune pass shipped.
      var REV3_EVERY = [0.22, 0.26, 0.30, 0.70];
      var densityOk = true, densityNote = '';
      for (var az = 0; az < AMBIENT.length; az++) {
        var ratio = REV3_EVERY[az] / AMBIENT[az].every;
        if (ratio < 1.85) densityOk = false;
        densityNote += (az ? ', ' : '') + 'z' + (az + 1) + ' ' + ratio.toFixed(2) + 'x';
      }
      chk(densityOk, 'ambient emission cadence raised about 2x per zone (' + densityNote + ')');

      // RF-PACK-01: pack records are pooled and capped, so a long run cannot
      // grow S.packs. 2000 updates is far more than the ring can hold.
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

      // RF-PERF-01: hit records are pooled, so the backing store stops growing
      // once the worst frame has been seen.
      chk(hitPool.length <= 64, 'hit record pool stayed small (' + hitPool.length + ' records)');
    } catch (err) {
      pass = false;
      notes.push('FAIL exception: ' + (err && err.message ? err.message : String(err)));
    }
    if (savedState) { /* nothing to restore */ }
    return { pass: pass, notes: notes };
  };

  // Small counter used by the selftest inner loop without allocating.
  var accountingBad = 0;
  function chk2(ok) { if (!ok) accountingBad++; }

  RF.World = World;
})(typeof window !== 'undefined' ? window : globalThis);
