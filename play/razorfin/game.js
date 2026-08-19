/* Razorfin - game.js (Lane A)
 * Owns: RF.Game, the Phaser scenes (Boot / Menu / Ocean), the fixed-step
 * clock, RF.ctx, the player entity and its controller, eat resolution,
 * hunger, combo/frenzy, and the in-run HUD.
 *
 * Every cross-namespace call into RF.World / RF.Art / RF.Juice / RF.Sound /
 * RF.Music / RF.Fx / RF.Abilities / RF.Meta / RF.DevMode is guarded, so this
 * file boots to a functional degraded state when a sibling lane's file is
 * absent. See SPEC.md for the binding interfaces.
 *
 * Input goes exclusively through kit.input subscriptions (never window
 * listeners) per play/_shared/NOTES.md release-side defect. No setTimeout /
 * setInterval drives game logic; everything schedules off ctx.time.
 */
(function (root) {
  'use strict';

  var RF = root.RF = root.RF || {};
  var RFD = root.RFD || {};

  // ------------------------------------------------------------ constants
  // CSS design baseline. SPEC Rev 3: the game is SIZED in device pixels
  // (W*DPR x H*DPR) and scaled back with zoom = 1/DPR, so every world and
  // UI coordinate below lives in DEVICE pixels. Any number that was authored
  // as a CSS px must therefore pass through S().
  var CSS_W = 844, CSS_H = 390;

  // TITLE-SIDE density factor (SPEC Rev 3). GGKit.hiDpi.dpr() is held at 1 by
  // the 2026-08-17 fleet kill switch and ggkit.js is not ours to change, so
  // razorfin computes and owns its own factor. Exposed as RF.Game.dpr for the
  // sharkart and world lanes, which bake at this density.
  function computeDpr() {
    var d = (root.devicePixelRatio || 1);
    if (!(typeof d === 'number' && isFinite(d) && d > 0)) d = 1;
    return d < 1 ? 1 : (d > 3 ? 3 : d);
  }
  var DPR = computeDpr();
  // S(px): CSS px -> device px. The single conversion used by every layout,
  // font size, hit area and radius in this file.
  function S(px) { return px * DPR; }

  var W = CSS_W * DPR, H = CSS_H * DPR;   // design space, in device px
  var STEP = 1 / 60, MAX_STEPS = 4;
  var ASSET = 'assets/';
  var TAU = Math.PI * 2;

  var KEN_FISH = ['fish_blue', 'fish_brown', 'fish_green', 'fish_grey',
    'fish_grey_long_a', 'fish_orange', 'fish_pink', 'fish_red'];
  var KEN_PROPS = ['bubble_a', 'bubble_b', 'bubble_c', 'rock_a', 'rock_b',
    'seaweed_c', 'seaweed_f'];

  var WORLD_W = (RFD.WORLD && RFD.WORLD.w) || 7200;
  var WORLD_H = (RFD.WORLD && RFD.WORLD.h) || 3600;

  var FRENZY = RFD.FRENZY || {
    comboWindow: 3, steps: [3, 6, 10], mults: [1, 2, 3, 5],
    meterPerEat: 0.06, goldRushDur: 8, goldRushSpeed: 1.4, goldRushCoinMult: 2
  };
  var ECON = RFD.ECONOMY || {};
  var UPEFF = ECON.upgradeEffect || { bite: 0.1, speed: 0.06, boost: 0.12, power: 0.08 };

  // ------------------------------------------------- SPEC Rev 4 controls
  // Floating virtual stick, horde-meridian feel (play/horde-meridian/game.js
  // bindInput ~2415). All radii are CSS px and pass through S() at use.
  var STICK_R_CSS = 62;        // max deflection, CSS px (HM uses 62)
  var STICK_RECENTER = 1.35;   // base follows the finger past this * radius
  var STICK_RING_A = 0.16;     // HM ring alpha
  var STICK_NUB_A = 0.5;       // HM nub alpha
  var STICK_DEAD = 0.12;       // below this magnitude the stick reads as idle
  // Heading alignment. SPEC Rev 4: "turn cap ~2x current rates". The angular
  // ease is scaled by deflection so a small push steers gently and a full
  // push whips the nose around.
  var TURN_BOOSTA = 2.0;       // multiplier on stat.turn
  var TURN_EASE_MIN = 0.45;    // ease factor at the dead zone edge
  var TURN_EASE_MAX = 1.0;     // ease factor at full deflection
  // Release deceleration: the shark coasts down to idle, it never drifts.
  var IDLE_DRAG = 0.80;        // per-60th-second velocity retention when idle

  // ------------------------------------------------- SPEC Rev 4 rig anim
  var TAIL_HZ_IDLE = 2.5, TAIL_HZ_CRUISE = 5.0, TAIL_HZ_BOOST = 8.0;
  var TAIL_AMP_IDLE = 0.10, TAIL_AMP_CRUISE = 0.34, TAIL_AMP_TURN = 0.22;
  var PECT_HZ = 1.7, PECT_AMP = 0.13;
  var BANK_MAX = 0.18;         // rad, capped body roll into a turn
  var BANK_EASE = 6.0;         // per second approach rate
  var JAW_OPEN = 0.42;         // rad at full bite window
  var IDLE_BOB_HZ = 0.9, IDLE_BOB_PX = 1.6, IDLE_SPEED_F = 0.15;

  // ------------------------------------------------------------- helpers
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function css(n) { return '#' + (n >>> 0).toString(16).padStart(6, '0'); }

  // mulberry32: deterministic, no Math.random anywhere in sim code.
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Shortest signed angular delta, used by the steering integrator.
  function angDelta(from, to) {
    var d = (to - from) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return d;
  }

  function sharkById(id) {
    if (RFD.SHARK_BY_ID && RFD.SHARK_BY_ID[id]) return RFD.SHARK_BY_ID[id];
    var list = RFD.SHARKS || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return list[0] || null;
  }
  function creatureById(id) {
    if (RFD.CREATURE_BY_ID && RFD.CREATURE_BY_ID[id]) return RFD.CREATURE_BY_ID[id];
    var all = (RFD.CREATURES || []).concat(RFD.HAZARDS || []);
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }

  // --------------------------------------------------------- guard shims
  // Every sibling namespace is reached through these. A missing lane file
  // degrades to a no-op instead of a TypeError mid-frame.
  // Returns the number of particles the FX lane actually emitted, so a caller
  // can fall back to an older effect family when a newer pool is absent. A
  // missing / throwing / older juice.js all report 0.
  function fxEmit(name, x, y, opts) {
    if (RF.Fx && RF.Fx.emit) {
      try { return num(RF.Fx.emit(name, x, y, opts), 0); } catch (e) { warnOnce('Fx.emit', e); }
    }
    return 0;
  }
  function sfx(name, opts) {
    if (RF.Sound && RF.Sound.play) { try { RF.Sound.play(name, opts); } catch (e) { warnOnce('Sound.play', e); } }
  }
  function musicLayer(layer) {
    if (RF.Music && RF.Music.setLayer) { try { RF.Music.setLayer(layer); } catch (e) { warnOnce('Music.setLayer', e); } }
  }
  function hitStop(ms) {
    if (RF.Juice && RF.Juice.hitStop) { try { RF.Juice.hitStop(ms); } catch (e) { warnOnce('Juice.hitStop', e); } }
  }
  function shake(mag, ms) {
    if (RF.Juice && RF.Juice.shake) { try { RF.Juice.shake(mag, ms); } catch (e) { warnOnce('Juice.shake', e); } }
  }
  function consumeFreeze() {
    if (RF.Juice && RF.Juice.consumeFreeze) {
      try { var v = RF.Juice.consumeFreeze(); return (typeof v === 'number' && isFinite(v) && v > 0) ? v : 0; }
      catch (e) { warnOnce('Juice.consumeFreeze', e); }
    }
    return 0;
  }
  // Lane E's forced teardown: restores ctx.run.timeScale to 1 and clears all
  // player-side ability state (Phase invulnerability, Chrono time scale, fire
  // wakes). Guarded like every other cross-namespace call.
  function abilitiesReset() {
    if (RF.Abilities && RF.Abilities.reset) {
      try { RF.Abilities.reset(ctx); } catch (e) { warnOnce('Abilities.reset', e); }
    }
  }
  var warned = {};
  function warnOnce(tag, err) {
    if (warned[tag]) return;
    warned[tag] = true;
    if (root.console && console.error) console.error('[Razorfin] ' + tag + ' threw', err);
  }

  // Passive struct resolution. abilities.js owns the real one; when it is
  // absent we synthesise a struct from the shark row's own passives array so
  // biteUp / wideBite / slowMetab still behave.
  var NO_PASSIVES = {
    wideBite: false, lunge: false, biteUp: 0, filterFeed: false, ambush: false,
    slowMetab: false, junkEater: false, pressureImmune: false, armored: false,
    coinMagnet: false, fireWake: false, dreadAura: false, undying: false,
    mult: { speed: 1, accel: 1, turn: 1, bite: 1, hp: 1, boost: 1, metab: 1 }
  };
  function resolvePassives(def) {
    var p = null;
    if (RF.Abilities && RF.Abilities.passives) {
      try { p = RF.Abilities.passives(def); } catch (e) { warnOnce('Abilities.passives', e); p = null; }
    }
    if (!p || typeof p !== 'object') {
      // Degraded fallback read straight off the data row.
      var list = (def && def.passives) || [];
      p = {
        wideBite: list.indexOf('wideBite') >= 0,
        lunge: list.indexOf('lunge') >= 0 || list.indexOf('lungeMega') >= 0,
        biteUp: list.indexOf('biteUpX') >= 0 ? 2 : (list.indexOf('biteUp') >= 0 ? 1 : 0),
        filterFeed: list.indexOf('filterFeed') >= 0 || list.indexOf('filterFeedMax') >= 0,
        ambush: list.indexOf('ambush') >= 0,
        slowMetab: list.indexOf('slowMetab') >= 0 || list.indexOf('slowMetabX') >= 0,
        // The NUMBER lives here, matching abilities.js's slowMetabMult.
        slowMetabMult: list.indexOf('slowMetabX') >= 0 ? 0.5 : (list.indexOf('slowMetab') >= 0 ? 0.75 : 1),
        junkEater: list.indexOf('junkEater') >= 0,
        pressureImmune: list.indexOf('pressureImmune') >= 0,
        armored: list.indexOf('armored') >= 0,
        coinMagnet: list.indexOf('coinMagnet') >= 0,
        fireWake: list.indexOf('fireWake') >= 0 || list.indexOf('fireWakeX') >= 0,
        dreadAura: list.indexOf('dreadAura') >= 0 || list.indexOf('dreadAuraX') >= 0,
        undying: list.indexOf('undying') >= 0
      };
    }
    // Normalise the numeric fields so downstream maths can never see NaN.
    // abilities.js publishes its numbers as statMults (speed/bite/boost/hp/
    // metab) and, in the degraded path, this file synthesises them. Normalise
    // both into p.mult so the boot snapshot has a single shape, including the
    // metabolism multiplier that used to have nowhere to live.
    var mult = p.mult && typeof p.mult === 'object' ? p.mult : {};
    var sm = p.statMults && typeof p.statMults === 'object' ? p.statMults : {};
    // slowMetab is a BOOLEAN in the real resolver; slowMetabMult is its number.
    var metab = num(sm.metab, num(p.metabMult, num(p.slowMetabMult,
      (typeof p.slowMetab === 'number' && isFinite(p.slowMetab)) ? p.slowMetab : 1)));
    p.mult = {
      speed: num(sm.speed, num(mult.speed, 1)), accel: num(mult.accel, 1),
      turn: num(mult.turn, 1), bite: num(sm.bite, num(mult.bite, 1)),
      hp: num(sm.hp, num(mult.hp, 1)), boost: num(sm.boost, num(mult.boost, 1)),
      metab: metab > 0 ? metab : 1
    };
    p.biteUp = num(p.biteUp, 0);
    return p;
  }
  function num(v, dflt) { return (typeof v === 'number' && isFinite(v)) ? v : dflt; }

  // RF-TEST-01: never touch the FREE global `GGKit`. In a clean Node load the
  // self-test stubs window.RF but has no GGKit binding, and a bare reference
  // throws ReferenceError (a property miss on root would only be undefined).
  // Everything reaches the kit through these two accessors instead, both of
  // which degrade rather than throw.
  function ggkit() { return root.GGKit || null; }
  function boundedPush(arr, item, cap) {
    var g = ggkit();
    if (g && g.boundedPush) { try { return g.boundedPush(arr, item, cap); } catch (e) { warnOnce('boundedPush', e); } }
    arr.push(item);
    while (arr.length > cap) arr.shift();
    return arr;
  }

  // RF-PASSIVE-01: abilities.js recomputes LIVE stat multipliers every step
  // (zone surface/depth power, combo speed, and the resolved passive
  // multipliers) and publishes them on player.st.statMults. buildPlayer's
  // p.pas.mult is only the boot-time snapshot, so consuming it alone froze
  // Greenland's metabolism, Cookiecutter's bite and every zone/combo power at
  // their level-1 values. liveMult() prefers the live struct and falls back to
  // the snapshot when abilities.js is absent.
  function liveMult(p, key) {
    var st = p && p.st;
    var live = st && st.statMults;
    if (live && typeof live === 'object') {
      var v = live[key];
      if (typeof v === 'number' && isFinite(v) && v > 0) return v;
    }
    var snap = p && p.pas && p.pas.mult;
    return num(snap && snap[key], 1);
  }

  // --------------------------------------------------------------- state
  var kit = null;
  var game = null;
  var scene = null;   // live Ocean scene (set in create, cleared on shutdown)
  var ctx = null;
  var profile = null;
  var selectedSharkId = 'reef';
  var bootedTextures = {};
  var runCount = 0;

  // ------------------------------------------------------- save handling
  function validateSave(obj) {
    // meta.js names its validator validateSave; accept either spelling so a
    // rename on that lane cannot silently downgrade us to accept-anything.
    var fn = RF.Meta && (RF.Meta.validateSave || RF.Meta.validate);
    if (fn) {
      try { return !!fn(obj); } catch (e) { warnOnce('Meta.validateSave', e); }
    }
    // Delegate-or-accept per the lane brief: without meta.js there is no
    // schema authority here, so anything object-shaped is accepted and
    // meta.js migrates it when it lands.
    return !!obj && typeof obj === 'object' && !Array.isArray(obj);
  }
  // Shaped exactly like the meta.js save schema so the degraded path and the
  // real path read through identical accessors (RF-PROFILE-01).
  function fallbackProfile() {
    return {
      v: RFD.SAVE_VERSION || 1, coins: 0, xp: 0, level: 1,
      selected: 'reef',
      sharks: { reef: { owned: true, up: { bite: 0, speed: 0, boost: 0, power: 0 } } },
      best: { score: 0, biggestTier: 0 },
      runs: 0, tutorialDone: false, lastBonusDay: null
    };
  }
  function loadProfile() {
    if (RF.Meta && RF.Meta.load) {
      try {
        var p = RF.Meta.load(kit);
        if (p && typeof p === 'object') return p;
      } catch (e) { warnOnce('Meta.load', e); }
    }
    var stored = kit.save.get(null);
    var base = fallbackProfile();
    if (stored && typeof stored === 'object') {
      var merged = {};
      for (var k in base) merged[k] = base[k];
      for (var j in stored) merged[j] = stored[j];
      if (!merged.sharks || typeof merged.sharks !== 'object') merged.sharks = base.sharks;
      if (!merged.sharks.reef) merged.sharks.reef = base.sharks.reef;
      if (!merged.best || typeof merged.best !== 'object') merged.best = base.best;
      if (typeof merged.selected !== 'string') merged.selected = 'reef';
      return merged;
    }
    return base;
  }
  function commitProfile() {
    if (RF.Meta && RF.Meta.commit) {
      try { RF.Meta.commit(kit, profile); return; } catch (e) { warnOnce('Meta.commit', e); }
    }
    try { kit.save.set(profile); } catch (e) { warnOnce('save.set', e); }
  }
  function ownedFor(id) {
    if (RF.Meta && RF.Meta.ownedFor) {
      try { return !!RF.Meta.ownedFor(profile, id); } catch (e) { warnOnce('Meta.ownedFor', e); }
    }
    if (RF.DevMode && RF.DevMode.state && RF.DevMode.state.forceUnlockAll) return true;
    var row = profile && profile.sharks && profile.sharks[id];
    return !!(row && row.owned);
  }
  function tierUnlocked(tier) {
    if (RF.Meta && RF.Meta.tierUnlocked) {
      try { return !!RF.Meta.tierUnlocked(profile, tier); } catch (e) { warnOnce('Meta.tierUnlocked', e); }
    }
    if (RF.DevMode && RF.DevMode.state && RF.DevMode.state.forceUnlockAll) return true;
    var need = (ECON.tierUnlockLevel || [])[tier];
    if (typeof need !== 'number') return tier <= 1;
    return num(profile && profile.level, 1) >= need;
  }
  // RF-PROFILE-01: upgrade levels live on the persisted row sharks[id].up,
  // per the meta.js save schema. There is no profile.upgrades and never was;
  // reading it silently zeroed every purchased upgrade.
  function upgradeLevel(sharkId, track) {
    var cap = num(ECON.upgradeCosts && ECON.upgradeCosts.levels, 5);
    if (RF.Meta && RF.Meta.upLevel) {
      try { return clamp(num(RF.Meta.upLevel(profile, sharkId, track), 0), 0, cap); }
      catch (e) { warnOnce('Meta.upLevel', e); }
    }
    var row = profile && profile.sharks && profile.sharks[sharkId];
    var up = row && row.up;
    if (!up) return 0;
    return clamp(num(up[track], 0), 0, cap);
  }

  // The shark the run should launch with. meta.js owns the dev-overlay rule
  // (sessionSelected wins, and is never persisted).
  function activeSharkId() {
    if (RF.Meta && RF.Meta.activeShark) {
      try {
        var id = RF.Meta.activeShark(profile);
        if (id && sharkById(id)) return id;
      } catch (e) { warnOnce('Meta.activeShark', e); }
    }
    var sel = profile && profile.selected;
    if (sel && sharkById(sel) && ownedFor(sel)) return sel;
    return 'reef';
  }

  // ------------------------------------------------------ texture baking
  // RF.Art bakes the real silhouettes. Without sharkart.js every entity
  // still needs SOMETHING to draw, so Boot lays down colored-ellipse
  // fallbacks keyed identically, and bakeShark/bakeCreature simply override.
  function fallbackEllipse(scene, key, w, h, base, belly, accent) {
    if (scene.textures.exists(key)) return key;
    // Baked at the TITLE-SIDE density (SPEC Rev 3). GGKit.hiDpi.canvas() is
    // not used here because it internally calls the kill-switched dpr(), which
    // returns 1 and would give a 1x fallback texture on a retina phone.
    var t = denseCanvas(w, h);
    if (!t) return key;
    var c = t.ctx;
    if (!c) return key;
    c.clearRect(0, 0, w, h);
    c.fillStyle = css(base);
    c.beginPath(); c.ellipse(w * 0.5, h * 0.5, w * 0.46, h * 0.4, 0, 0, TAU); c.fill();
    c.fillStyle = css(belly);
    c.beginPath(); c.ellipse(w * 0.5, h * 0.62, w * 0.4, h * 0.2, 0, 0, TAU); c.fill();
    c.fillStyle = css(accent);
    c.beginPath(); c.ellipse(w * 0.2, h * 0.44, w * 0.06, h * 0.07, 0, 0, TAU); c.fill();
    scene.textures.addCanvas(key, t.canvas);
    return key;
  }

  // A 2D canvas whose backing store is DPR times the requested CSS size, with
  // the context pre-scaled so all drawing below is in CSS units. This is the
  // GGKit.hiDpi.canvas() recipe with the title-side factor substituted for the
  // kill-switched one. Returns null when there is no document (headless).
  function denseCanvas(cssW, cssH) {
    var doc = root.document;
    if (!doc || !doc.createElement) return null;
    var c = doc.createElement('canvas');
    c.width = Math.max(1, Math.round(cssW * DPR));
    c.height = Math.max(1, Math.round(cssH * DPR));
    var cx = c.getContext ? c.getContext('2d') : null;
    if (!cx) return null;
    cx.scale(DPR, DPR);
    cx.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in cx) cx.imageSmoothingQuality = 'high';
    return { canvas: c, ctx: cx, dpr: DPR, width: cssW, height: cssH };
  }

  function sharkTexture(scene, def, variant) {
    var key = 'rf_shark_' + def.id + '_' + (variant || 'play');
    if (RF.Art && RF.Art.bakeShark) {
      try {
        var k = RF.Art.bakeShark(scene, def, variant || 'play');
        if (k && scene.textures.exists(k)) return k;
      } catch (e) { warnOnce('Art.bakeShark', e); }
    }
    var pal = def.sil && def.sil.palette ? def.sil.palette : { base: 0x7d8c9e, belly: 0xdfe7ee, accent: 0x4b5c6b };
    var len = variant === 'menu' ? 160 : (variant === 'thumb' ? 84 : 96);
    return fallbackEllipse(scene, key, len, Math.max(18, len * num(def.sil && def.sil.girth, 0.34)),
      pal.base, pal.belly, pal.accent);
  }

  function creatureTexture(scene, def) {
    if (!def) return null;
    if (RF.Art && RF.Art.bakeCreature) {
      try {
        var k = RF.Art.bakeCreature(scene, def);
        if (k && scene.textures.exists(k)) return k;
      } catch (e) { warnOnce('Art.bakeCreature', e); }
    }
    if (def.sprite && scene.textures.exists(def.sprite)) return def.sprite;
    var key = 'rf_crt_' + def.id;
    var size = clamp(20 + num(def.tier, 1) * 9, 20, 120);
    return fallbackEllipse(scene, key, size, Math.max(12, size * 0.55), 0x5a8fa8, 0xcfe6ef, 0x2b4a5c);
  }

  function paletteOf(def) {
    if (RF.Art && RF.Art.paletteOf) {
      try {
        var p = RF.Art.paletteOf(def);
        if (p && typeof p === 'object') return p;
      } catch (e) { warnOnce('Art.paletteOf', e); }
    }
    return (def && def.sil && def.sil.palette) || { base: 0x7d8c9e, belly: 0xdfe7ee, accent: 0x4b5c6b, glow: 0 };
  }

  // ======================================================== Boot scene
  var BootScene = {
    key: 'Boot',
    preload: function () {
      var self = this;
      try { kit.loader.show('Razorfin'); } catch (e) {}
      this.load.on('progress', function (v) { try { kit.loader.progress(v); } catch (e) {} });
      this.load.setPath(ASSET);
      KEN_FISH.forEach(function (n) { self.load.image(n, n + '.png'); });
      KEN_PROPS.forEach(function (n) { self.load.image(n, n + '.png'); });
      // A missing optional asset must not wedge the boot.
      this.load.on('loaderror', function (file) {
        if (root.console && console.warn) console.warn('[Razorfin] asset missing:', file && file.key);
      });
    },
    create: function () {
      // Audio registration is URL-only here; the kit lazy-decodes on demand
      // and unlocks on the first gesture.
      var reg = {};
      var sfxMap = RFD.SFX || {};
      for (var name in sfxMap) if (sfxMap[name]) reg[name] = ASSET + sfxMap[name];
      var musicMap = RFD.MUSIC || {};
      for (var m in musicMap) if (musicMap[m]) reg['music_' + m] = ASSET + musicMap[m];
      try { kit.audio.register(reg); } catch (e) { warnOnce('audio.register', e); }

      // Bake the player-selectable roster lazily: only the menu-visible and
      // the selected shark are baked up front, the rest on demand.
      bakePlayableTextures(this);
      bakeCreatureTextures(this);

      // Idempotent, and repeated here because Menu decides whether to draw
      // the Shop button by asking whether that scene exists. Boot always runs
      // before Menu, so this holds regardless of when 'ready' fired.
      registerMetaScenes();

      try { kit.loader.hide(); } catch (e) {}
      this.scene.start('Menu');
    }
  };

  function bakePlayableTextures(scene) {
    var list = RFD.SHARKS || [];
    for (var i = 0; i < list.length; i++) {
      var d = list[i];
      if (!ownedFor(d.id) && d.tier > 2) continue; // rest bake on demand
      try { bootedTextures[d.id] = sharkTexture(scene, d, 'thumb'); } catch (e) { warnOnce('bake shark', e); }
    }
  }
  function bakeCreatureTextures(scene) {
    var all = (RFD.CREATURES || []).concat(RFD.HAZARDS || []);
    for (var i = 0; i < all.length; i++) {
      try { creatureTexture(scene, all[i]); } catch (e) { warnOnce('bake creature', e); }
    }
  }

  // ======================================================== Menu scene
  var MenuScene = {
    key: 'Menu',
    create: function () {
      var self = this;
      this.cameras.main.setBackgroundColor(0x02101c);
      this.subs = [];

      // Backdrop gradient band, cheap and static.
      var bg = this.add.graphics();
      bg.fillGradientStyle(0x0a2c44, 0x0a2c44, 0x02101c, 0x02101c, 1);
      bg.fillRect(0, 0, W, H);

      this.add.text(S(28), S(18), 'RAZORFIN', txt(30, '#8fe8ff', '800')).setOrigin(0, 0);
      this.add.text(S(30), S(52), 'Eat. Grow. Rule the deep.', txt(12, '#9fc4d4', '600')).setOrigin(0, 0);

      // UI_LAW 8/11: chrome hugs the TOP edge, clear of the thumb shadow that
      // covers the lower edge and both bottom corners on a phone.
      // Shop is meta.js-owned; only offer it when that scene exists.
      var topBtnX = W - S(18);
      if (this.scene.manager.getScene('Shop')) {
        var shopBtn = this.add.text(topBtnX, S(24), 'SHOP', txt(14, '#0a1b26', '800'))
          .setOrigin(1, 0.5).setPadding(S(16), S(11), S(16), S(11)).setBackgroundColor('#ffd98a');
        tapTarget(this, shopBtn, function () { self.scene.start('Shop'); });
        topBtnX -= shopBtn.width + S(10);
      }
      var gear = this.add.text(topBtnX, S(24), 'SETTINGS', txt(14, '#9fc4d4', '800'))
        .setOrigin(1, 0.5).setPadding(S(14), S(11), S(14), S(11))
        .setBackgroundColor('rgba(12,44,64,0.85)');
      tapTarget(this, gear, function () { try { kit.openSettings(); } catch (e) {} });

      var coinsLabel = this.add.text(W / 2, S(24), formatCoins(), txt(14, '#ffd98a', '700'))
        .setOrigin(0.5, 0.5);
      this.coinsLabel = coinsLabel;

      // ---- shark select grid, tier grouped, horizontally scrollable
      this.gridTop = S(88);
      this.gridH = H - this.gridTop - S(46);
      this.buildGrid();

      var play = this.add.text(W / 2, H - S(24), 'TAP A SHARK TO DIVE', txt(13, '#8fd8ea', '800'))
        .setOrigin(0.5, 0.5);
      this.playLabel = play;

      // Keyboard: enter/space starts with the current selection.
      this.subs.push(kit.input.onKeyDown(function (code) {
        if (!self.scene.isActive || !self.scene.isActive('Menu')) return;
        if (code === 'Enter' || code === 'Space') self.launch(selectedSharkId);
      }));

      this.events.once('shutdown', function () {
        self.subs.forEach(function (u) { try { u(); } catch (e) {} });
        self.subs.length = 0;
      });

      // Rev 4 minor: the DEV chip used to land on the same top-right corner as
      // SHOP / SETTINGS and cover them. Anchor it top-LEFT under the title
      // instead, where nothing is tappable.
      if (RF.DevMode && RF.DevMode.state) devChip(this, S(28), S(72), 0);

      // Rev 4 minor: returning from the Shop must re-read the active shark.
      // The Shop can change the selection (and can buy a shark outright), and
      // if it SLEEPS the Menu rather than restarting it, create() does not run
      // again and the ON badge stays on the previous card. wake and resume
      // both resync; both are idempotent.
      this.events.on('wake', function () { self.resyncSelection(); });
      this.events.on('resume', function () { self.resyncSelection(); });

      musicLayer('calm');
    },

    // Re-read the authority (RF.Meta.activeShark via activeSharkId) and repaint
    // the roster. Coins are re-read at the same time because the Shop is the
    // one screen that can spend them.
    resyncSelection: function () {
      profile = loadProfile();
      selectedSharkId = activeSharkId();
      if (this.coinsLabel && this.coinsLabel.setText) {
        try { this.coinsLabel.setText(formatCoins()); } catch (e) { warnOnce('menu coins resync', e); }
      }
      // A shark bought in the Shop flips a card from locked to owned, which
      // paintCards alone cannot express, so rebuild the grid if ownership
      // moved. Cheap: the Menu is not a per-frame surface.
      var changed = false;
      var cards = this.cards || [];
      for (var i = 0; i < cards.length; i++) {
        if (cards[i].owned !== ownedFor(cards[i].def.id)) { changed = true; break; }
      }
      if (changed && this.buildGrid) {
        try { this.buildGrid(); return; } catch (e) { warnOnce('menu grid rebuild', e); }
      }
      this.paintCards();
    },

    buildGrid: function () {
      var self = this;
      var list = (RFD.SHARKS || []).slice();
      // Tier groups in ascending order; unowned but tier-unlocked rows still
      // render (dimmed) so the roster reads as a ladder, not a wall.
      var byTier = {};
      list.forEach(function (d) { (byTier[d.tier] = byTier[d.tier] || []).push(d); });
      var tiers = Object.keys(byTier).map(Number).sort(function (a, b) { return a - b; });

      // Rebuildable (resyncSelection calls this again when Shop ownership
      // moved), so tear the previous strip down rather than stacking a second
      // container of cards on top of it.
      if (this.grid && this.grid.destroy) {
        try { this.grid.destroy(true); } catch (e) { warnOnce('grid destroy', e); }
      }
      var container = this.add.container(0, this.gridTop);
      this.grid = container;
      // Cards are sized in CSS px then converted once: 96 CSS px wide clears
      // the 44px touch minimum on both axes with room to spare.
      var cellW = S(96), cellH = S(112), gap = S(10), headW = S(44);
      var x = S(24);
      var cards = this.cards = [];

      tiers.forEach(function (tier) {
        var unlocked = tierUnlocked(tier);
        var head = self.add.text(x, cellH * 0.5, 'T' + tier, txt(13, unlocked ? '#8fe8ff' : '#415a68', '800'))
          .setOrigin(0, 0.5);
        container.add(head);
        x += headW;
        byTier[tier].forEach(function (def) {
          var owned = ownedFor(def.id);
          var cw = cellW - gap;
          var cell = self.add.container(x, 0);
          var pal = paletteOf(def);
          // Plate is repainted by paintCard so the selected state can change
          // without rebuilding the grid.
          var plate = self.add.graphics();
          cell.add(plate);

          var texKey = bootedTextures[def.id];
          if (!texKey) {
            try { texKey = bootedTextures[def.id] = sharkTexture(self, def, 'thumb'); }
            catch (e) { warnOnce('menu bake', e); texKey = null; }
          }
          if (texKey && self.textures.exists(texKey)) {
            var img = self.add.image(cw / 2, S(44), texKey);
            var maxW = cw - S(14);
            if (img.width > maxW) img.setScale(maxW / img.width);
            if (!owned) img.setTint(0x33505f);
            cell.add(img);
          }
          // UI_LAW: readable text is 14 CSS px minimum (REVIEW-2 RF-UI-01).
          var nm = self.add.text(cw / 2, cellH - S(28), def.name,
            txt(14, owned ? '#dff2f6' : '#5c7787', '700')).setOrigin(0.5, 0.5);
          fitText(nm, cw - S(8));
          cell.add(nm);

          if (!owned) {
            var lock = self.add.text(cw / 2, cellH - S(12),
              unlocked ? String(def.cost) + 'c' : 'Lv ' + ((ECON.tierUnlockLevel || [])[tier] || '?'),
              txt(14, '#7e97a5', '700')).setOrigin(0.5, 0.5);
            cell.add(lock);
          }

          // RF-MENU-01: an explicit selected-state marker, not just a border.
          var tick = self.add.text(cw - S(8), S(8), 'ON', txt(11, '#0a1b26', '800'))
            .setOrigin(1, 0).setPadding(S(5), S(3), S(5), S(3))
            .setBackgroundColor('#5fd6c0').setVisible(false);
          cell.add(tick);

          cards.push({
            def: def, owned: owned, cell: cell, plate: plate, tick: tick,
            pal: pal, w: cw, h: cellH, x: x
          });
          container.add(cell);
          x += cellW;
        });
        x += S(12);
      });

      this.gridWidth = x;
      this.gridScroll = 0;
      this.gridMax = Math.max(0, x - (W - S(24)));
      this.paintCards();

      // ---- one gesture owner for the whole roster strip.
      // RF-INPUT-01: the SAME `moved` accumulator that drives the scroll also
      // decides whether the release counts as a tap. A swipe that scrolled the
      // fleet can never launch a run.
      var dragId = null, dragX = 0, dragY = 0, dragStart = 0, moved = 0;
      this.subs.push(kit.input.onDown(function (p) {
        if (dragId !== null) return;
        var d = toDesign(p);
        if (d.y < self.gridTop || d.y > self.gridTop + self.gridH) return;
        dragId = p.pointerId; dragX = d.x; dragY = d.y;
        dragStart = self.gridScroll; moved = 0;
      }));
      this.subs.push(kit.input.onMove(function (p) {
        if (p.pointerId !== dragId) return;
        var d = toDesign(p);
        var dx = d.x - dragX;
        moved = Math.max(moved, Math.abs(dx) + Math.abs(d.y - dragY));
        self.gridScroll = clamp(dragStart + dx, -self.gridMax, 0);
        container.x = self.gridScroll;
      }));
      this.subs.push(kit.input.onUp(function (p) {
        if (!p || p.pointerId !== dragId) return;
        dragId = null;
        if (moved > S(TAP_SLOP_CSS)) return;           // it was a scroll
        var d = toDesign(p);
        var hit = self.cardAt(d.x, d.y);
        if (!hit) return;
        if (!hit.owned) { self.flashLocked(hit.def); return; }
        self.select(hit.def.id);
        self.launch(hit.def.id);
      }));
    },

    // Hit-tests the roster in design space, accounting for the scroll offset.
    // The rect is padded to the UI_LAW touch minimum like every other control.
    cardAt: function (dx, dy) {
      var cards = this.cards || [];
      var ox = this.gridScroll, oy = this.gridTop;
      for (var i = 0; i < cards.length; i++) {
        var c = cards[i];
        var r = padHit(c.x + ox, oy, c.w, c.h);
        if (inRect(r, dx, dy)) return c;
      }
      return null;
    },

    // RF-MENU-01: selection is a visible state. Owned + selected gets a filled
    // plate, an accent border and an ON tag; owned gets a quiet plate; locked
    // stays dim.
    paintCards: function () {
      var cards = this.cards || [];
      for (var i = 0; i < cards.length; i++) {
        var c = cards[i];
        var sel = c.owned && c.def.id === selectedSharkId;
        var g = c.plate;
        g.clear();
        g.fillStyle(sel ? 0x1b4b5f : (c.owned ? 0x123243 : 0x0b1f2b), 1);
        g.fillRoundedRect(0, 0, c.w, c.h, S(10));
        g.lineStyle(sel ? S(3) : S(1),
          sel ? 0x5fd6c0 : (c.owned ? (c.pal.accent || 0x5fd6c0) : 0x1d3341),
          sel ? 1 : 0.9);
        g.strokeRoundedRect(0, 0, c.w, c.h, S(10));
        if (c.tick) c.tick.setVisible(sel);
      }
    },

    // Records the pick through meta.js (which owns the persisted `selected`
    // field and the non-persisted dev override) and repaints.
    select: function (id) {
      if (!ownedFor(id)) return;
      selectedSharkId = id;
      if (RF.Meta && RF.Meta.select) {
        try { RF.Meta.select(profile, id); commitProfile(); }
        catch (e) { warnOnce('Meta.select', e); }
      }
      this.paintCards();
    },

    flashLocked: function (def) {
      if (this.lockedMsg) this.lockedMsg.destroy();
      var need = tierUnlocked(def.tier) ? ('Costs ' + def.cost + ' coins')
        : ('Unlocks at level ' + ((ECON.tierUnlockLevel || [])[def.tier] || '?'));
      this.lockedMsg = this.add.text(W / 2, S(70), def.name + ': ' + need, txt(12, '#ffd98a', '700'))
        .setOrigin(0.5, 0.5).setPadding(S(10), S(5), S(10), S(5))
        .setBackgroundColor('rgba(2,18,28,0.78)');
      var m = this.lockedMsg;
      this.tweens.add({
        targets: m, alpha: 0, delay: 900, duration: 400,
        onComplete: function () { if (m && m.destroy) m.destroy(); }
      });
    },

    launch: function (id) {
      if (!ownedFor(id)) return;
      selectedSharkId = id;
      this.scene.start('Ocean', { sharkId: id });
    }
  };

  function formatCoins() {
    var n = 0;
    if (RF.Meta && RF.Meta.displayCoins) {
      try { n = num(RF.Meta.displayCoins(profile), 0); } catch (e) { warnOnce('Meta.displayCoins', e); }
    } else {
      n = num(profile && profile.coins, 0);
    }
    return String(n) + ' coins';
  }

  // ------------------------------------------------------------ HUD layer
  // Ocean runs two cameras: the main one is zoomed by DPR and draws the world
  // in design units, hudCam is unzoomed and draws the HUD in device px. An
  // object handed to hudAdd() is drawn by hudCam only; everything else is drawn
  // by the main camera only. Both directions are set explicitly, because a
  // Phaser camera renders every display-list object it has not been told to
  // ignore.
  function hudAdd(sc, obj) {
    if (!obj) return obj;
    if (sc.hudObjects) sc.hudObjects.push(obj);
    try {
      if (sc.cameras && sc.cameras.main && sc.cameras.main.ignore) sc.cameras.main.ignore(obj);
    } catch (e) { warnOnce('hud ignore main', e); }
    return obj;
  }
  // Called once the world and the HUD both exist: hudCam ignores everything
  // that is not HUD. Objects created later are handled by hudAdd + this being
  // re-run at the end of create().
  function hudCamSeal(sc) {
    if (!sc.hudCam || !sc.children) return;
    var hud = sc.hudObjects || [];
    var list = sc.children.list;
    for (var i = 0; i < list.length; i++) {
      if (hud.indexOf(list[i]) < 0) {
        try { sc.hudCam.ignore(list[i]); } catch (e) { warnOnce('hudCam ignore', e); }
      }
    }
  }

  // ------------------------------------------------------- tap targets
  // RF-INPUT-01: every out-of-run button goes through kit.input, and only
  // fires when the pointer that went down inside it came back up inside it
  // having moved less than TAP_SLOP. A drag across a button is a drag, not a
  // tap, which is what makes the roster safely scrollable.
  // UI_LAW 12: the hit rect is grown to at least MIN_TAP CSS px on both axes,
  // independently of how small the drawn element is.
  var TAP_SLOP_CSS = 12;      // CSS px of travel that still counts as a tap
  var MIN_TAP_CSS = 44;       // UI_LAW minimum touch target, CSS px

  // Grows a design-space rect to the minimum touch size about its own center.
  function padHit(x, y, w, h) {
    var min = S(MIN_TAP_CSS);
    var gw = Math.max(w, min), gh = Math.max(h, min);
    return { x: x - (gw - w) / 2, y: y - (gh - h) / 2, w: gw, h: gh };
  }
  function inRect(r, x, y) {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  // Registers a kit-routed tap on an arbitrary design-space rect. Returns
  // nothing; the subscriptions are pushed onto scene.subs and torn down with
  // the scene, so no listener outlives its owner.
  function tapRect(sc, rect, onTap) {
    var id = null, sx = 0, sy = 0, moved = 0;
    sc.subs.push(kit.input.onDown(function (pt) {
      if (id !== null) return;
      var d = toDesign(pt);
      if (!inRect(rect, d.x, d.y)) return;
      id = pt.pointerId; sx = d.x; sy = d.y; moved = 0;
    }));
    sc.subs.push(kit.input.onMove(function (pt) {
      if (pt.pointerId !== id) return;
      var d = toDesign(pt);
      var m = Math.abs(d.x - sx) + Math.abs(d.y - sy);
      if (m > moved) moved = m;
    }));
    sc.subs.push(kit.input.onUp(function (pt) {
      if (!pt || pt.pointerId !== id) return;
      id = null;
      var d = toDesign(pt);
      if (moved > S(TAP_SLOP_CSS)) return;      // it was a drag
      if (!inRect(rect, d.x, d.y)) return;      // released off the control
      onTap();
    }));
  }

  // Convenience for a Phaser text/graphic: derives the rect from its bounds.
  function tapTarget(sc, obj, onTap) {
    var b = obj.getBounds ? obj.getBounds() : { x: obj.x, y: obj.y, width: obj.width, height: obj.height };
    tapRect(sc, padHit(b.x, b.y, b.width, b.height), onTap);
  }
  // txt(size,...) takes a CSS px size and returns a Phaser style in DEVICE px.
  // Every call site in this file passes CSS px, so the retina conversion is
  // in exactly one place and UI_LAW's minimums stay readable as CSS numbers.
  // Shrink-free fit: truncate by MEASURED width so 14px text never overruns
  // its fixed-width home (REVIEW-2 re-check 2, RF-UI-01). Keeps font size legal.
  // <= 5 glyphs for any non-negative count: 0..9999, then 12.3k, 123k, 1.2M.
  function compactNum(n) {
    n = Math.max(0, Math.floor(num(n, 0)));
    if (n < 10000) return String(n);
    if (n < 100000) return (Math.floor(n / 100) / 10).toFixed(1) + 'k';
    if (n < 1000000) return Math.floor(n / 1000) + 'k';
    if (n < 100000000) return (Math.floor(n / 100000) / 10).toFixed(1) + 'M';
    // Saturate: the HUD is a gauge, not a ledger. 5-glyph bound for ALL n.
    return '99M+';
  }

  function fitText(t, maxW) {
    if (!t || !t.width || t.width <= maxW) return t;
    var str = String(t.text);
    while (str.length > 2 && t.width > maxW) {
      str = str.slice(0, -1);
      t.setText(str.replace(/[ .]+$/, '') + '.');
    }
    return t;
  }

  function txt(size, color, weight) {
    return {
      fontFamily: 'Avenir Next, Trebuchet MS, system-ui, sans-serif',
      fontSize: Math.round(S(size)) + 'px', color: color || '#e8f5f4',
      fontStyle: 'normal', fontWeight: weight || '600',
      resolution: 1
    };
  }
  // CSS-pixel rect of the canvas, so kit pointer coordinates (clientX/Y) can
  // be converted into design-space coordinates.
  var RECT = { left: 0, top: 0, scaleX: 1, scaleY: 1 };
  function cssRect() {
    var c = game && game.canvas;
    if (!c || !c.getBoundingClientRect) { RECT.left = 0; RECT.top = 0; RECT.scaleX = 1; RECT.scaleY = 1; return RECT; }
    var b = c.getBoundingClientRect();
    RECT.left = b.left; RECT.top = b.top;
    RECT.scaleX = b.width ? b.width / W : 1;
    RECT.scaleY = b.height ? b.height / H : 1;
    return RECT;
  }
  // RF-DEV-01: a compact badge, never a switch list. UI_LAW 6 bans always-on
  // mode descriptions during play, so the chip says only that dev mode is on
  // (the switches themselves are readable on window.__rf). It sits at the TOP
  // edge, clear of the thumb zone, and is 11 CSS px inside a 24 CSS px chip.
  // Rev 4 minor: on the Menu the chip used to sit at the same top-right corner
  // as the SHOP / SETTINGS buttons and covered them the moment a dev switch
  // went active. Callers pass their own anchor; the Menu anchors it under the
  // button row on the LEFT-hand side of the coin label, where nothing is
  // tappable. Ocean keeps the top-right corner (its chrome is top-LEFT).
  function devChip(scene, x, y, originX) {
    var st = RF.DevMode && RF.DevMode.state;
    if (!st) return null;
    var any = false;
    for (var k in st) { if (st[k]) { any = true; break; } }
    if (!any) return null;
    return scene.add.text(num(x, W - S(10)), num(y, S(6)), 'DEV', txt(11, '#2a0f16', '800'))
      .setOrigin(num(originX, 1), 0).setPadding(S(5), S(3), S(5), S(3))
      .setBackgroundColor('#ffb3c1')
      .setDepth(9999).setScrollFactor(0);
  }

  // ======================================================= Ocean scene
  var OceanScene = {
    key: 'Ocean',

    init: function (data) {
      this.sharkId = (data && data.sharkId) || selectedSharkId;
      this.acc = 0;
      this.freezeMs = 0;
      this.dying = false;
      this.subs = [];
      this.comboQueue = [];
      this.comboChip = null;
      this.comboChipT = 0;
    },

    create: function () {
      var self = this;
      scene = this;
      runCount++;

      this.cameras.main.setBackgroundColor(0x02101c);
      this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
      // SPEC Rev 3 reconciliation. The GAME is sized in device px, so the raw
      // camera would show DPR times as much ocean as the design intends and
      // every world.js entity (whose radii are authored in design units) would
      // shrink to a third of its size on a DPR3 phone. Zooming the world camera
      // by DPR restores the design framing at full backing-store density: world
      // coordinates stay design units for world.js and abilities.js, while the
      // pixels behind them are dense.
      //
      // Screen-space UI is authored in DEVICE px, so it cannot live under that
      // zoom. It goes on a SECOND camera at zoom 1 (hudCam) which renders only
      // the HUD, while the main camera ignores it. That keeps the two coordinate
      // spaces completely separate instead of relying on counter-scaling.
      this.cameras.main.setZoom(DPR);
      this.hudObjects = [];
      this.hudCam = this.cameras.add(0, 0, W, H, false, 'hud');
      this.hudCam.setScroll(0, 0);
      this.hudCam.transparent = true;

      buildContext(this);
      buildPlayer(this, sharkById(this.sharkId));

      // World first (it owns the background layers), then FX on top of it.
      if (RF.World && RF.World.init) {
        try { RF.World.init(this, ctx); } catch (e) { warnOnce('World.init', e); }
      } else {
        this.degradedBackdrop();
      }
      if (RF.Fx && RF.Fx.init) {
        try { RF.Fx.init(this); } catch (e) { warnOnce('Fx.init', e); }
      }

      // The player sprite is created after World.init so it sits above the
      // background layers world.js lays down.
      attachPlayerSprite(this);

      this.cameras.main.startFollow(ctx.player.sprite, false, 0.12, 0.12);
      this.buildHud();
      this.bindInput();
      this.showTutorialIfNeeded();

      // Both cameras now know what they own.
      hudCamSeal(this);

      musicLayer('calm');
      this.musicState = 'calm';

      this.events.once('shutdown', function () {
        self.subs.forEach(function (u) { try { u(); } catch (e) {} });
        self.subs.length = 0;
        // Belt and braces: finishRun already resets, but a run can also leave
        // by restart, by the kit, or by any future exit that does not pass
        // through it. Reset is idempotent, so running it twice is harmless.
        abilitiesReset();
        scene = null;
      });
    },

    // Only used when world.js is missing: enough water to see the shark move.
    degradedBackdrop: function () {
      var g = this.add.graphics();
      var zones = RFD.ZONES || [];
      if (!zones.length) {
        g.fillStyle(0x0d2c40, 1); g.fillRect(0, 0, WORLD_W, WORLD_H);
      } else {
        for (var i = 0; i < zones.length; i++) {
          var z = zones[i];
          var tint = typeof z.tint === 'string' ? parseInt(z.tint, 16) : num(z.tint, 0x0d2c40);
          g.fillStyle(tint, 1);
          g.fillRect(0, z.yMin, WORLD_W, z.yMax - z.yMin);
        }
      }
      g.setDepth(-100);
    },

    // ------------------------------------------------------------- HUD
    buildHud: function () {
      var pal = paletteOf(ctx.player.def);
      var accent = css(num(pal.accent, 0x5fd6c0));

      // RF-UI-01 / UI_LAW 4: ONE corner cluster, top-left, holding health,
      // boost, the power button AND the coin count. There is no second HUD
      // corner and nothing lives along the bottom edge, which belongs to the
      // player's thumbs. Everything here is scrollFactor 0.
      var cluster = hudAdd(this, this.add.container(0, 0).setScrollFactor(0).setDepth(1000));
      this.hud = { cluster: cluster };

      var plate = this.add.graphics();
      plate.fillStyle(0x02121c, 0.52);
      plate.fillRoundedRect(S(10), S(10), S(212), S(64), S(10));
      cluster.add(plate);

      this.hud.hpBar = this.add.graphics();
      cluster.add(this.hud.hpBar);
      this.hud.boostBar = this.add.graphics();
      cluster.add(this.hud.boostBar);

      this.hud.nameLabel = this.add.text(S(18), S(15), ctx.player.def.name, txt(14, accent, '800'));
      fitText(this.hud.nameLabel, S(82)); // coins right-align at S(146); keep clear air between
      cluster.add(this.hud.nameLabel);

      // Coins, folded into the same cluster on the name line.
      this.hud.coins = this.add.text(S(146), S(15), '0', txt(14, '#ffd98a', '800')).setOrigin(1, 0);
      cluster.add(this.hud.coins);

      // Power button, same cluster. 44 CSS px of hit area even though the
      // drawn dial is smaller (UI_LAW 12).
      this.hud.power = this.add.graphics();
      cluster.add(this.hud.power);
      this.hud.powerLabel = this.add.text(S(190), S(42), '', txt(14, '#dff2f6', '800')).setOrigin(0.5, 0.5);
      cluster.add(this.hud.powerLabel);
      this.hud.powerRect = padHit(S(168), S(20), S(44), S(44));

      // Screen-edge red vignette for damage. Edge only, never a center wash.
      this.hud.vignette = hudAdd(this, this.add.graphics().setScrollFactor(0).setDepth(1001));
      this.hud.vignetteA = 0;

      // Gold rush edge tint uses the same edge-only treatment.
      this.hud.rushA = 0;

      // SPEC Rev 4: the floating stick. Under the vignette so damage feedback
      // still reads on top, above everything else on the HUD camera.
      this.stickG = hudAdd(this, this.add.graphics().setScrollFactor(0).setDepth(1000));

      if (RF.DevMode && RF.DevMode.state) this.hud.dev = hudAdd(this, devChip(this));

      // Pooled world-space score popups (zero allocation at eat time): eight
      // rotating text objects, world layer so they track the bite point.
      this.pops = [];
      this.popCursor = 0;
      for (var pi = 0; pi < 8; pi++) {
        var t = this.add.text(0, 0, '', txt(16, '#ffe9a8', '900'));
        t.setOrigin(0.5, 1).setDepth(220).setVisible(false).setActive(false);
        this.pops.push({ t: t, life: 0 });
      }
    },

    showTutorialIfNeeded: function () {
      var done = profile && profile.tutorialDone;
      var suppressed = !!(RF.DevMode && RF.DevMode.state && (RF.DevMode.state.forceSkipTutorial || RF.DevMode.state.notut));
      if (done || suppressed) return;
      // ONE fading top strip, no center banner.
      var strip = hudAdd(this, this.add.text(W / 2, S(24),
        'Hold and drag anywhere to swim. Second finger to boost. Eat to grow.',
        txt(13, '#dff2f6', '700'))
        .setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(1002)
        .setPadding(S(14), S(7), S(14), S(7)).setBackgroundColor('rgba(2,18,28,0.62)'));
      this.tweens.add({
        targets: strip, alpha: 0, delay: 3400, duration: 900,
        onComplete: function () { if (strip && strip.destroy) strip.destroy(); }
      });
      if (profile) { profile.tutorialDone = true; commitProfile(); }
    },

    // ----------------------------------------------------------- input
    bindInput: function () {
      var self = this;
      var p = ctx.player;

      this.subs.push(kit.input.onDown(function (pt) {
        // Power button first: a tap inside the HUD button fires the active.
        var d = toDesign(pt);
        if (self.hud && self.hud.powerRect && inRect(self.hud.powerRect, d.x, d.y)) {
          self.firePower();
          return;
        }
        if (p.ctl.steerId === null) {
          p.ctl.steerId = pt.pointerId;
          self.plantStick(d.x, d.y);
        } else if (p.ctl.boostId === null && pt.pointerId !== p.ctl.steerId) {
          // Second simultaneous pointer boosts while held.
          p.ctl.boostId = pt.pointerId;
        }
      }));
      this.subs.push(kit.input.onMove(function (pt) {
        if (pt.pointerId !== p.ctl.steerId) return;
        var d = toDesign(pt);
        self.dragStick(d.x, d.y);
      }));
      this.subs.push(kit.input.onUp(function (pt) {
        // ggkit fires onUp with a NULL event on cancel (pointercancel, blur,
        // visibility change). A null release clears everything, because the
        // pointer identity is gone and holding the stick would strand the
        // shark at full throttle.
        if (!pt) { self.clearStick(); p.ctl.boostId = null; return; }
        if (pt.pointerId === p.ctl.steerId) self.clearStick();
        if (pt.pointerId === p.ctl.boostId) p.ctl.boostId = null;
      }));
      // Keyboard fallback for desktop. Space fires the power on the rising
      // edge; steering and boost are read as levels inside the step.
      this.subs.push(kit.input.onKeyDown(function (code) {
        if (code === 'Space') self.firePower();
      }));
    },

    // ------------------------------------------------ floating stick
    // SPEC Rev 4. The stick lives entirely in DEVICE px on hudCam (which is
    // unzoomed), so the ring and nub sit exactly under the finger regardless
    // of DPR or where the world camera is looking. No world conversion is
    // involved any more: the stick vector IS the desired velocity direction.
    plantStick: function (dx, dy) {
      var ctl = ctx.player.ctl;
      ctl.active = true;
      ctl.bx = dx; ctl.by = dy;
      ctl.sx = 0; ctl.sy = 0; ctl.mag = 0;
      this.paintStick();
    },

    dragStick: function (px, py) {
      var ctl = ctx.player.ctl;
      if (!ctl.active) return;
      var max = S(STICK_R_CSS);
      var dx = px - ctl.bx, dy = py - ctl.by;
      var len = Math.sqrt(dx * dx + dy * dy);
      if (len > max) { var k = max / len; dx *= k; dy *= k; }
      // Re-centering drag: past 1.35x the radius the base follows the finger,
      // so a long swipe never runs out of stick.
      if (len > max * STICK_RECENTER) { ctl.bx = px - dx; ctl.by = py - dy; }
      ctl.sx = dx / max;
      ctl.sy = dy / max;
      ctl.mag = Math.sqrt(ctl.sx * ctl.sx + ctl.sy * ctl.sy);
      if (ctl.mag > 1) ctl.mag = 1;
      this.paintStick();
    },

    clearStick: function () {
      var ctl = ctx.player.ctl;
      ctl.active = false;
      ctl.steerId = null;
      ctl.sx = 0; ctl.sy = 0; ctl.mag = 0;
      if (this.stickG) this.stickG.clear();
    },

    // Ring + nub, drawn with a HUD graphics object (no generated textures to
    // leak, and nothing to bake at boot). Redrawn only on plant/drag/clear,
    // never per frame, so this costs nothing while the finger is still.
    paintStick: function () {
      var g = this.stickG;
      if (!g) return;
      var ctl = ctx.player.ctl;
      g.clear();
      if (!ctl.active) return;
      var max = S(STICK_R_CSS);
      g.fillStyle(0xdff2f6, STICK_RING_A);
      g.fillCircle(ctl.bx, ctl.by, max);
      g.lineStyle(S(2), 0x8fe8ff, STICK_RING_A * 2);
      g.strokeCircle(ctl.bx, ctl.by, max);
      g.fillStyle(0x8fe8ff, STICK_NUB_A);
      g.fillCircle(ctl.bx + ctl.sx * max, ctl.by + ctl.sy * max, S(22));
    },

    firePower: function () {
      if (!RF.Abilities || !RF.Abilities.fire) return;
      try {
        if (RF.Abilities.canFire && !RF.Abilities.canFire(ctx)) return;
        RF.Abilities.fire(ctx);
      } catch (e) { warnOnce('Abilities.fire', e); }
    },

    // --------------------------------------------------- frame + step
    update: function (timeMs, deltaMs) {
      if (kit.paused) {
        this.acc = 0;                             // pause freezes the sim
        // Rev 4: drop the stick too. Resuming with a stale full deflection
        // would launch the shark before the player touched the glass, and the
        // pointer that planted it is long gone.
        if (ctx.player && ctx.player.ctl.active) {
          this.clearStick();
          ctx.player.ctl.boostId = null;
        }
        return;
      }

      // Hit-stop: consume once per frame and skip that many ms of stepping.
      this.freezeMs += consumeFreeze();
      var dt = deltaMs / 1000;
      if (!isFinite(dt) || dt < 0) dt = 0;
      if (dt > 0.25) dt = 0.25;                    // tab-return / long frame

      if (this.freezeMs > 0) {
        var eat = Math.min(this.freezeMs, deltaMs);
        this.freezeMs -= eat;
        dt -= eat / 1000;
        if (dt < 0) dt = 0;
      }

      this.acc += dt * num(ctx.run.timeScale, 1);
      var steps = 0;
      while (this.acc >= STEP && steps < MAX_STEPS) {
        this.acc -= STEP;
        steps++;
        this.step();
      }
      if (steps === MAX_STEPS) this.acc = 0;       // drop the backlog

      this.render(dt);
    },

    step: function () {
      var t = ctx.time;
      t.dt = STEP;
      t.now += STEP;
      t.frame++;

      var p = ctx.player;
      if (!p || !p.active) return;

      this.stepControl(p);

      this.stepPops(p);
      this.stepMotion(p);
      this.stepAnim(p);

      if (RF.World && RF.World.update) {
        try { RF.World.update(ctx); } catch (e) { warnOnce('World.update', e); }
      }
      if (RF.Abilities && RF.Abilities.update) {
        try { RF.Abilities.update(ctx); } catch (e) { warnOnce('Abilities.update', e); }
      }

      this.stepEat(p);
      // Consumed in the same frame world.js filled it (see stepPlayerHits).
      this.stepPlayerHits(p);
      this.stepHunger(p);
      this.stepCombo();
      this.stepFrenzy();
      this.stepMusic(p);

      if (p.hp <= 0 && !this.dying) this.onDeath();
    },

    // SPEC Rev 4 control model. The stick vector IS the desired velocity:
    // direction gives the heading to align to, magnitude scales the target
    // speed. The old tap-a-point-and-swim-to-it logic is gone entirely (it was
    // what made the shark overshoot the finger and then circle it, which is
    // the "controls feel wrong" the owner hit on device).
    //
    // Zero allocation: everything below is scalars on p / p.ctl.
    stepControl: function (p) {
      var s = p.stat;
      var ctl = p.ctl;

      // Input vector. Touch stick first; keyboard synthesises the same shape,
      // so both paths run through identical maths downstream.
      var ix = ctl.sx, iy = ctl.sy, mag = ctl.mag;
      if (!ctl.active) {
        var kx = 0, ky = 0;
        if (kit.input.keyDown('KeyA') || kit.input.keyDown('ArrowLeft')) kx -= 1;
        if (kit.input.keyDown('KeyD') || kit.input.keyDown('ArrowRight')) kx += 1;
        if (kit.input.keyDown('KeyW') || kit.input.keyDown('ArrowUp')) ky -= 1;
        if (kit.input.keyDown('KeyS') || kit.input.keyDown('ArrowDown')) ky += 1;
        if (kx !== 0 || ky !== 0) {
          var kl = Math.sqrt(kx * kx + ky * ky);
          ix = kx / kl; iy = ky / kl; mag = 1;
        } else { ix = 0; iy = 0; mag = 0; }
      }
      if (mag < STICK_DEAD) { mag = 0; ix = 0; iy = 0; }
      ctl.drive = mag;      // read by the rig animator and the juice hooks

      var boosting = (ctl.boostId !== null)
        || kit.input.keyDown('ShiftLeft') || kit.input.keyDown('ShiftRight');

      // Boost meter: drains while held and above zero, refills slowly.
      if (boosting && ctl.boost > 0.02) {
        ctl.boost = clamp(ctl.boost - STEP * 0.42, 0, 1);
        ctl.boosting = true;
      } else {
        ctl.boost = clamp(ctl.boost + STEP * 0.17, 0, 1);
        ctl.boosting = false;
      }

      // Heading. SPEC Rev 4 raises the effective turn cap ~2x, and eases the
      // approach by deflection so a light push is a gentle arc and a full push
      // whips the nose across. turnIn is retained for the rig animator.
      var turnIn = 0;
      if (mag > 0) {
        var wantAngle = Math.atan2(iy, ix);
        var d = angDelta(p.angle, wantAngle);
        var ease = TURN_EASE_MIN + (TURN_EASE_MAX - TURN_EASE_MIN) * mag;
        var turn = s.turn * TURN_BOOSTA * ease * (ctl.boosting ? 0.85 : 1) * STEP;
        if (d > turn) d = turn; else if (d < -turn) d = -turn;
        p.angle += d;
        if (p.angle > Math.PI) p.angle -= TAU; else if (p.angle < -Math.PI) p.angle += TAU;
        turnIn = turn > 0 ? d / turn : 0;
      }
      ctl.turnIn = turnIn;

      // Live multipliers, not the boot snapshot (RF-PASSIVE-01). s.speed and
      // s.boost already carry the shark row and the purchased upgrades; the
      // ratio against the snapshot is what abilities.js is currently adding.
      var speedM = liveMult(p, 'speed') / num(p.pas.mult.speed, 1);
      var boostM = liveMult(p, 'boost') / num(p.pas.mult.boost, 1);
      var speedCap = s.speed * speedM * (ctl.boosting ? s.boost * boostM : 1)
        * (ctx.run.goldRushT > 0 ? num(FRENZY.goldRushSpeed, 1.4) : 1);

      if (mag > 0) {
        // Desired velocity along the CURRENT heading, scaled by deflection.
        // Using the heading rather than the raw stick keeps the shark moving
        // nose-first while it turns, which is what makes the turn read as a
        // shark banking rather than a cursor sliding.
        var want = speedCap * mag;
        var wx = Math.cos(p.angle) * want;
        var wy = Math.sin(p.angle) * want;
        // Approach the desired velocity at the shark's acceleration. Framed as
        // a capped step toward wx/wy rather than a raw thrust, so the stick
        // magnitude really is a throttle and the shark settles at that speed.
        var ex = wx - p.vx, ey = wy - p.vy;
        var el = Math.sqrt(ex * ex + ey * ey);
        var step = s.accel * speedM * (ctl.boosting ? 1.5 : 1) * STEP;
        if (el > step && el > 0) { var kk = step / el; ex *= kk; ey *= kk; }
        p.vx += ex; p.vy += ey;
      } else {
        // Released: decelerate smoothly to idle. The shark must NEVER keep
        // drifting once the finger is off the glass.
        var idleDrag = Math.pow(IDLE_DRAG, STEP * 60);
        p.vx *= idleDrag; p.vy *= idleDrag;
        if (p.vx * p.vx + p.vy * p.vy < 1) { p.vx = 0; p.vy = 0; }
      }

      // Hard speed cap. Water drag is folded into the velocity approach above,
      // so this only catches external impulses (knockback, abilities).
      var sp2 = p.vx * p.vx + p.vy * p.vy;
      if (sp2 > speedCap * speedCap) {
        var k = speedCap / Math.sqrt(sp2);
        p.vx *= k; p.vy *= k;
      }
      ctl.speedCap = speedCap;
    },

    // SPEC Rev 4 rig animation. Runs in the FIXED STEP, never as a tween, so
    // the motion stays locked to the sim and to hit-stop. All state is scalars
    // on p.anim; nothing is allocated. Safe to run whether or not a rig is
    // actually attached (render() is what consumes it).
    stepAnim: function (p) {
      var pst = ctx && ctx.player && ctx.player.st;
      if (pst && pst.eatPopT > 0) {
        pst.eatPopT -= p;
        var pop = 1 + 0.14 * clamp(pst.eatPopT / 0.16, 0, 1);
        var node = ctx.player.rig ? ctx.player.rig.container : ctx.player.sprite;
        if (node && node.setScale && node.__baseScale == null) node.__baseScale = node.scaleX < 0 ? -node.scaleX : node.scaleX;
        if (node && node.__baseScale != null) {
          var sgn = node.scaleX < 0 ? -1 : 1;
          node.setScale(sgn * node.__baseScale * pop, node.__baseScale * pop);
        }
      }
      if (pst && pst.jawSnapT > 0) pst.jawSnapT -= p;

      var a = p.anim;
      var ctl = p.ctl;
      var sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      var cap = num(ctl.speedCap, p.stat.speed) || 1;
      var f = clamp(sp / cap, 0, 1);              // 0..1 speed fraction
      var turnAbs = Math.abs(num(ctl.turnIn, 0));

      // Tail beat: idle -> cruise -> boost, with amplitude rising on both
      // speed and turn effort (a hard turn is a hard tail stroke).
      var hz = TAIL_HZ_IDLE + (TAIL_HZ_CRUISE - TAIL_HZ_IDLE) * f;
      if (ctl.boosting) hz += (TAIL_HZ_BOOST - TAIL_HZ_CRUISE) * clamp(f, 0.3, 1);
      a.tailPhase += hz * TAU * STEP;
      if (a.tailPhase > TAU) a.tailPhase -= TAU;
      a.tailAmp = TAIL_AMP_IDLE + (TAIL_AMP_CRUISE - TAIL_AMP_IDLE) * f
        + TAIL_AMP_TURN * turnAbs;

      // Pectorals counter-flutter: slow, shallow, and out of phase with the
      // tail so the silhouette never pulses as one block.
      a.pectPhase += PECT_HZ * TAU * STEP;
      if (a.pectPhase > TAU) a.pectPhase -= TAU;

      // Bank into the turn. Smooth approach, hard cap, so a stick flick reads
      // as a roll and not a snap.
      var wantBank = clamp(num(ctl.turnIn, 0), -1, 1) * BANK_MAX * (0.4 + 0.6 * f);
      a.bank += (wantBank - a.bank) * clamp(BANK_EASE * STEP, 0, 1);
      if (a.bank > BANK_MAX) a.bank = BANK_MAX;
      else if (a.bank < -BANK_MAX) a.bank = -BANK_MAX;

      // Jaw opens during the bite cooldown window (that window IS the chomp).
      var jawWant = p.st.biteCd > 0 ? JAW_OPEN * clamp(p.st.biteCd / 0.25, 0, 1) : 0;
      a.jaw += (jawWant - a.jaw) * clamp(14 * STEP, 0, 1);

      // Idle bob: only when genuinely loafing.
      if (f < IDLE_SPEED_F) {
        a.bobPhase += IDLE_BOB_HZ * TAU * STEP;
        if (a.bobPhase > TAU) a.bobPhase -= TAU;
        a.bob = Math.sin(a.bobPhase) * S(IDLE_BOB_PX) * (1 - f / IDLE_SPEED_F);
      } else {
        a.bob *= 0.9;
      }

      // ---- juice hooks (Lane F). All guarded; all no-ops if juice.js is out.
      // Bubble trail is throttled by DISTANCE, not by time, so it stays
      // consistent across speeds and does not spam at a standstill.
      if (!a.trailInit) { a.trailX = p.x; a.trailY = p.y; a.trailInit = true; }
      var tdx = p.x - a.trailX, tdy = p.y - a.trailY;
      if (tdx * tdx + tdy * tdy > 3200) {
        a.trailX = p.x; a.trailY = p.y;
        if (f > 0.18) {
          // FX_OPT is reused scratch: step() must not allocate, and these
          // options bags would otherwise be garbage on every emit.
          FX_OPT.count = ctl.boosting ? 3 : 1;
          FX_OPT.speed = sp;
          FX_OPT.angle = p.angle;
          FX_OPT.up = false;
          // 'swimtrail' is Lane F's purpose-built wake pool (mode 5, reads the
          // angle in radians). It falls through poolFor to null if juice.js is
          // an older build, so 'bubbles' is emitted as the fallback family.
          var wx = p.x - Math.cos(p.angle) * p.r;
          var wy = p.y - Math.sin(p.angle) * p.r;
          if (fxEmit('swimtrail', wx, wy, FX_OPT) === 0) fxEmit('bubbles', wx, wy, FX_OPT);
        }
      }
      if (ctl.boosting && f > 0.5 && (ctx.time.frame % 4) === 0) {
        FX_OPT.count = 1;
        FX_OPT.speed = sp;
        FX_OPT.angle = p.angle;
        FX_OPT.up = false;
        fxEmit('speedlines', p.x, p.y, FX_OPT);
      }
    },

    stepMotion: function (p) {
      p.x += p.vx * STEP;
      p.y += p.vy * STEP;

      // World bounds. The surface is breachable: the shark may rise above
      // y=0 a little, arcs back down, and splashes on re-entry.
      var minY = -46;
      if (p.x < p.r) { p.x = p.r; if (p.vx < 0) p.vx *= -0.3; }
      if (p.x > WORLD_W - p.r) { p.x = WORLD_W - p.r; if (p.vx > 0) p.vx *= -0.3; }
      if (p.y > WORLD_H - p.r) { p.y = WORLD_H - p.r; if (p.vy > 0) p.vy *= -0.3; }
      if (p.y < minY) { p.y = minY; if (p.vy < 0) p.vy *= -0.35; }

      var airborne = p.y < 0;
      if (airborne) {
        p.vy += 900 * STEP;                 // gravity on the jump arc
        if (!p.st.airborne) {
          // Breach: leaving the water. Lane F owns 'splash'; 'bubbles' is the
          // fallback that already exists, and both are guarded no-ops if
          // juice.js is absent.
          // Breach OUT. 'breach' is Lane F's dedicated surface pool; 'bubbles'
          // is the fallback family if juice.js predates it.
          // Breach OUT. 'breach' is Lane F's dedicated surface pool and it
          // plays its OWN 'breach' sound, so game.js only supplies the older
          // 'splash' when that pool declined the emit. Otherwise the surface
          // would sound twice.
          p.st.airborne = true;
          FX_OPT.count = 14; FX_OPT.up = true; FX_OPT.speed = Math.abs(p.vy); FX_OPT.angle = p.angle;
          if (fxEmit('breach', p.x, 0, FX_OPT) === 0) {
            fxEmit('bubbles', p.x, 0, FX_OPT);
            sfx('splash');
          }
        }
      } else if (p.st.airborne) {
        // Re-entry: the bigger of the two, since it carries the whole fall.
        p.st.airborne = false;
        FX_OPT.count = 20; FX_OPT.up = false; FX_OPT.speed = Math.abs(p.vy); FX_OPT.angle = p.angle;
        if (fxEmit('breach', p.x, 0, FX_OPT) === 0) {
          fxEmit('bubbles', p.x, 0, FX_OPT);
          sfx('splash');
        }
      }
    },

    // ---------------------------------------------------------- eating
    stepEat: function (p) {
      if (p.st.biteCd > 0) p.st.biteCd -= STEP;

      // Mouth sensor circle at the nose. Reused scratch, no allocation.
      var reach = p.r * 0.86;
      var mx = p.x + Math.cos(p.angle) * reach;
      var my = p.y + Math.sin(p.angle) * reach;
      var mr = p.mouthR;
      var wide = p.pas.wideBite;
      if (wide) mr *= 1.55;

      var list = null;
      if (RF.World && RF.World.query) {
        try { list = RF.World.query(mx, my, mr); } catch (e) { warnOnce('World.query', e); list = null; }
      }
      if (!list || !list.length) return;

      // world.js returns a SHARED scratch buffer that is only valid until the
      // next query() call, and this loop calls into World.kill and
      // Abilities.chargeFromEat, either of which may query. Copy into a
      // pre-allocated, reused array first: correct, and still zero-alloc.
      var n = list.length;
      if (n > EAT_BUF.length) n = EAT_BUF.length;
      for (var c = 0; c < n; c++) EAT_BUF[c] = list[c];

      var biteUp = num(p.pas.biteUp, 0);
      for (var i = 0; i < n; i++) {
        var e = EAT_BUF[i];
        if (!e || !e.active || e === p || e.kind === 'player') continue;
        if (e.kind === 'pickup') { this.collectPickup(e); continue; }

        // wideBite widens the sensor into a forward arc rather than a bare
        // circle, so a wide-mouth shark eats things beside its nose too.
        if (wide) {
          var ax = e.x - p.x, ay = e.y - p.y;
          var da = Math.abs(angDelta(p.angle, Math.atan2(ay, ax)));
          if (da > 1.05) continue;
        }

        var tier = num(e.tier, 0);
        var isHazard = e.kind === 'hazard';
        // Hazards are tier 99: only a junkEater shark may swallow them.
        if (isHazard && !p.pas.junkEater) continue;

        var eatable = isHazard ? true : (tier <= p.tier + biteUp);
        if (!eatable) continue;

        if (!isHazard && tier <= p.tier - 2) {
          this.swallow(e);                  // two or more tiers below: instant
        } else {
          this.multiBite(e);                // near tier: chew it down
        }
      }
    },

    multiBite: function (e) {
      var p = ctx.player;
      if (p.st.biteCd > 0) return;
      p.st.biteCd = 0.25;                    // 250ms multi-bite cooldown
      e.hp -= p.stat.bite * (liveMult(p, 'bite') / num(p.pas.mult.bite, 1));
      hitStop(40);
      shake(3, 90);
      sfx('chomp', { rate: 0.94 + ctx.rng() * 0.12 });
      fxEmit('chomp', e.x, e.y, { count: 6 });
      if (e.hp <= 0) this.swallow(e);
    },

    swallow: function (e) {
      var p = ctx.player;
      var def = e.def || creatureById(e.defId) || null;
      var mult = comboMult();
      var score = num(def && def.score, 5);
      var coinMult = ctx.run.goldRushT > 0 ? num(FRENZY.goldRushCoinMult, 2) : 1;

      // ---- RF-COINS-01: ONE payout authority for player-eaten prey.
      // Prey the PLAYER swallows pays HERE, on the swallow, so the combo and
      // Gold Rush multipliers apply to it. world.js drops a coin pickup for
      // any kill whose entity still carries `coins`, and pickupAI pays that
      // pickup a second time with no multiplier at all: that is the double
      // payout the review found, and the reason Gold Rush was worth whichever
      // path happened to win.
      //
      // The suppression is deliberate and one-directional: zeroing e.coins
      // before World.kill(e, 'eaten') makes world.js skip dropPickup for this
      // entity only. Kills the player did NOT cause (DoT, mine chains,
      // predator-on-prey) keep their coins, still drop pickups, and are still
      // paid by world.js on collection. So: player swallow pays direct with
      // multipliers, everything else pays via pickups at face value.
      var coins = num(e.coins, num(def && def.coins, 1));

      ctx.run.score += Math.round(score * mult);
      ctx.run.coins += Math.round(coins * mult * coinMult);
      ctx.run.xp += Math.max(1, Math.round(score * 0.25));
      if (num(e.tier, 0) > ctx.run.biggestTier) ctx.run.biggestTier = num(e.tier, 0);

      // Hunger refill scales with the meal.
      p.hp = clamp(p.hp + (6 + num(e.tier, 0) * 3.2), 0, p.maxHp);

      if (RF.Abilities && RF.Abilities.chargeFromEat) {
        try { RF.Abilities.chargeFromEat(ctx, e); } catch (err) { warnOnce('Abilities.chargeFromEat', err); }
      }

      // EAT FEEDBACK (owner: "cannot tell when you eat a fish"). The meal
      // must land: two-stage burst in the prey's own colors sized by the
      // meal, a floating score popup at the bite point, a jaw snap and a
      // scale pop on the shark, and a hit-stop long enough to feel.
      var mealT = num(e.tier, 0);
      var preyTint = (e.def && e.def.tint) || 0xffe9a8;
      fxEmit('deathBurst', e.x, e.y, { count: 14 + mealT * 3, scale: 1 + mealT * 0.12, tint: preyTint });
      fxEmit('motes', e.x, e.y, { count: 8 + mealT * 2, tint: 0xffffff });
      this.scorePopup(e.x, e.y, '+' + Math.round(score * mult), mult > 1);
      if (p.rig && p.rig.jaw) p.st.jawSnapT = 0.18;
      p.st.eatPopT = 0.16;                 // scale pop consumed by stepAnim
      sfx('chomp');
      hitStop(mealT >= p.tier - 1 ? 60 : 40);

      e.coins = 0;                          // suppress world.js's pickup drop
      if (RF.World && RF.World.kill) {
        try { RF.World.kill(e, 'eaten'); } catch (err) { warnOnce('World.kill', err); e.active = false; }
      } else { e.active = false; }

      ctx.run.combo++;
      // RF-BEST-01: Results wants the PEAK combo, not whatever the streak
      // happened to be when the run ended, so the high-water mark is kept
      // here and meta.js reads ctx.run.comboPeak.
      if (ctx.run.combo > num(ctx.run.comboPeak, 0)) ctx.run.comboPeak = ctx.run.combo;
      ctx.run.comboT = num(FRENZY.comboWindow, 3);
      ctx.run.frenzy = clamp(ctx.run.frenzy + num(FRENZY.meterPerEat, 0.06), 0, 1);
      this.queueComboChip();
    },

    scorePopup: function (wx, wy, str, big) {
      if (!this.pops || !this.pops.length) return;
      var rec = this.pops[this.popCursor];
      this.popCursor = (this.popCursor + 1) % this.pops.length;
      rec.life = 0.7;
      rec.t.setText(str);
      rec.t.setPosition(wx, wy - S(6));
      rec.t.setScale((big ? 1.25 : 1) / DPR * 2);   // legible at camera zoom
      rec.t.setAlpha(1).setVisible(true).setActive(true);
    },

    stepPops: function (dt) {
      if (!this.pops) return;
      for (var i = 0; i < this.pops.length; i++) {
        var r = this.pops[i];
        if (r.life <= 0) continue;
        r.life -= dt;
        r.t.y -= 46 * dt;
        r.t.setAlpha(clamp(r.life / 0.7, 0, 1));
        if (r.life <= 0) { r.t.setVisible(false); r.t.setActive(false); }
      }
    },

    // RF-COINS-01, second half of the same rule: COIN PICKUPS ARE WORLD.JS'S.
    // pickupAI() runs the magnet, the grab radius, the coin sfx and the payout
    // every step. If game.js also paid on mouth contact the player would be
    // paid twice for one coin, so this path deliberately does nothing but let
    // the pickup be. The only reason it still exists is to stop stepEat from
    // treating a coin as food.
    collectPickup: function (e) {
      return;
    },

    // ------------------------------------------------------- predators
    // RF-HITS-01: world.js is the SINGLE collision authority for damage to the
    // player. It clears RF.World.playerHits at the top of its update and
    // refills it during the same update with {ent, dmg, x, y, sting?} records
    // for predator bites, mine detonations, jelly stings and puffer spines.
    // game.js consumes that list in the SAME frame, immediately after
    // World.update, and applies the damage.
    //
    // The old independent World.query re-scan is gone. It could not see a
    // mine that had already detonated and released itself, so mines were
    // harmless; it lost the jelly sting flag entirely; and it re-derived
    // damage numbers world.js had already computed, so the two halves could
    // disagree about how hard anything hit.
    stepPlayerHits: function (p) {
      // The invulnerability blink is a player-side timer and must tick on
      // every step, whether or not anything hit this frame.
      if (p.st.invulnT > 0) {
        p.st.invulnT -= STEP;
        if (p.st.invulnT < 0) p.st.invulnT = 0;
      }

      var hits = RF.World && RF.World.playerHits;
      if (!hits || !hits.length) return;

      var invuln = p.st.invulnT > 0
        || ctx.run.goldRushT > 0
        || p.st.phaseT > 0
        || !!(RF.DevMode && RF.DevMode.state && RF.DevMode.state.invincible);

      var total = 0, hx = p.x, hy = p.y, any = false;
      for (var i = 0; i < hits.length; i++) {
        var h = hits[i];
        if (!h) continue;
        var dmg = num(h.dmg, 0);
        if (dmg <= 0) continue;
        if (p.pas.armored) dmg *= 0.5;
        total += dmg;
        if (!any) { hx = num(h.x, p.x); hy = num(h.y, p.y); any = true; }
      }
      // world.js refills the list next update; leaving it as-is is correct and
      // avoids mutating another lane's buffer.
      if (!any || invuln) return;
      // One damage event per frame however many contacts landed: the invuln
      // window is what stops a hazard cluster from deleting the player, and
      // hurt() is the one place that opens it.
      this.hurt(total, hx, hy);
    },

    hurt: function (dmg, hx, hy) {
      var p = ctx.player;
      p.hp -= dmg;
      p.st.invulnT = 0.9;                              // brief invuln blink
      this.hud.vignetteA = 0.5;                        // screen-edge pulse
      hitStop(60);
      shake(7, 180);
      sfx('hurt');
      fxEmit('deathBurst', p.x, p.y, { count: 6, tint: 0xff5a5a });
      // Combo is a feeding streak: taking a hit breaks it.
      ctx.run.combo = 0;
      ctx.run.comboT = 0;
    },

    // ---------------------------------------------------------- hunger
    stepHunger: function (p) {
      // RF-PASSIVE-01: the resolver reports slowMetab as a BOOLEAN and puts
      // the number in statMults.metab (slowMetabMult). Multiplying by the
      // boolean coerced true to 1 and false to 0, so Greenland's 0.5
      // metabolism never applied and a shark without the passive would have
      // drained nothing at all had the fallback not masked it.
      var drain = p.stat.metab * liveMult(p, 'metab');

      // Zone pressure: below your depth grade the metabolism triples.
      // Tier 9 and above, or a pressureImmune shark, ignore it entirely.
      if (p.tier < 9 && !p.pas.pressureImmune) {
        var z = null;
        if (RF.World && RF.World.zoneAt) {
          try { z = RF.World.zoneAt(p.y); } catch (e) { warnOnce('World.zoneAt', e); }
        }
        if (!z) z = zoneAtFallback(p.y);
        if (z && num(z.pressureTier, 0) > p.tier) drain *= 3;
      }
      p.hp -= drain * STEP;
    },

    // ------------------------------------------------- combo / frenzy
    stepCombo: function () {
      if (ctx.run.comboT > 0) {
        ctx.run.comboT -= STEP;
        if (ctx.run.comboT <= 0) { ctx.run.comboT = 0; ctx.run.combo = 0; }
      }
    },

    stepFrenzy: function () {
      var r = ctx.run;
      if (r.goldRushT > 0) {
        r.goldRushT -= STEP;
        if (r.goldRushT <= 0) {
          r.goldRushT = 0;
          r.frenzy = 0;
          musicLayer(this.musicState === 'danger' ? 'danger' : 'calm');
          this.rushWas = false;
        }
      } else if (r.frenzy >= 1) {
        r.goldRushT = num(FRENZY.goldRushDur, 8);
        r.frenzy = 1;
        musicLayer('goldrush');
        sfx('goldrush');
        shake(6, 240);
        this.rushWas = true;
      }
      if (r.slowmoT > 0) {
        r.slowmoT -= STEP;
        if (r.slowmoT <= 0) { r.slowmoT = 0; r.timeScale = 1; }
      }
    },

    stepMusic: function (p) {
      if (ctx.run.goldRushT > 0) return;               // gold rush owns the bus
      var danger = false;
      if (RF.World && RF.World.query) {
        try {
          var near = RF.World.query(p.x, p.y, 500, 'predator');
          if (near) {
            for (var i = 0; i < near.length; i++) {
              if (near[i] && near[i].active && near[i].kind === 'predator'
                && num(near[i].tier, 0) > p.tier) { danger = true; break; }
            }
          }
        } catch (e) { warnOnce('World.query music', e); }
      }
      var want = danger ? 'danger' : 'calm';
      if (want !== this.musicState) {
        this.musicState = want;
        musicLayer(want);
      }
    },

    // ----------------------------------------------------------- death
    onDeath: function () {
      var self = this;
      var p = ctx.player;
      if (p.pas.undying && !p.st.usedUndying) {
        // undying: one free revive, then the passive is spent for the run.
        p.st.usedUndying = true;
        p.hp = p.maxHp * 0.35;
        p.st.invulnT = 2.2;
        shake(10, 400);
        fxEmit('ring', p.x, p.y, { count: 1 });
        return;
      }
      this.dying = true;
      p.active = false;
      sfx('death');
      shake(12, 500);
      fxEmit('deathBurst', p.x, p.y, { count: 24 });
      // RF-CHRONO-01: RF.Juice.slowmo takes (scale, ms) and only queues the
      // request; consumeSlowmo() is what hands it back. Ask for the same
      // 0.32x / 1.2s the death sequence wants, then read the granted values
      // so juice.js remains the authority on what actually applies.
      var sm = null;
      if (RF.Juice && RF.Juice.slowmo) {
        try {
          RF.Juice.slowmo(0.32, 1200);
          if (RF.Juice.consumeSlowmo) sm = RF.Juice.consumeSlowmo();
        } catch (e) { warnOnce('Juice.slowmo', e); }
      }
      ctx.run.timeScale = sm && isFinite(sm.scale) ? clamp(sm.scale, 0.05, 1) : 0.32;
      ctx.run.slowmoT = sm && isFinite(sm.ms) ? clamp(sm.ms / 1000, 0.1, 5) : 1.2;

      // Off the fixed-step clock, not setTimeout: a paused tab must not
      // advance the death sequence.
      this.deathAt = ctx.time.now;
      this.pendingResults = true;
    },

    finishRun: function () {
      this.pendingResults = false;
      // Ability state is torn down BEFORE the scene changes. A death during
      // Chrono or Phase otherwise leaks its time scale and its invulnerability
      // into the next run, because an inactive player never reaches the
      // ability update that would have restored them.
      abilitiesReset();
      var payload = null;
      if (RF.Meta && RF.Meta.endRun) {
        try { payload = RF.Meta.endRun(ctx); } catch (e) { warnOnce('Meta.endRun', e); }
      }
      if (!payload) {
        // Degraded: bank the run locally so coins are not silently lost.
        profile.coins = num(profile.coins, 0) + ctx.run.coins;
        profile.xp = num(profile.xp, 0) + ctx.run.xp;
        profile.runs = num(profile.runs, 0) + 1;
        if (!profile.best || typeof profile.best !== 'object') profile.best = { score: 0, biggestTier: 0 };
        if (ctx.run.score > num(profile.best.score, 0)) profile.best.score = ctx.run.score;
        if (ctx.run.biggestTier > num(profile.best.biggestTier, 0)) profile.best.biggestTier = ctx.run.biggestTier;
        commitProfile();
      }
      ctx.run.timeScale = 1;   // reset() already did this; explicit for the
                               // degraded case where abilities.js is absent
      if (this.scene.manager.getScene('Results')) {
        // RF-RESULT-01: Results reads data.results, not the bare record. A
        // direct payload made the screen fall back to an all-zero result.
        this.scene.start('Results', {
          results: payload || {
            score: ctx.run.score, coins: ctx.run.coins, xp: ctx.run.xp,
            levelUps: 0, unlocks: [], biggestTier: ctx.run.biggestTier,
            bestCombo: num(ctx.run.comboPeak, 0),
            best: { score: num(profile && profile.best && profile.best.score, 0),
                    biggestTier: num(profile && profile.best && profile.best.biggestTier, 0) },
            level: num(profile && profile.level, 1), xpInto: 0, xpNeed: 1,
            dailyBonus: false, bonusCoins: 0, baseCoins: ctx.run.coins
          },
          ctx: ctx
        });
      } else {
        this.scene.start('Menu');
      }
    },

    // ---------------------------------------------------------- render
    render: function (dt) {
      var p = ctx.player;
      if (!p) return;

      if (p.sprite) {
        var a = p.anim;
        var left = Math.abs(p.angle) > Math.PI / 2;
        p.sprite.x = p.x;
        p.sprite.y = p.y + num(a && a.bob, 0);
        var blink = p.st.invulnT > 0 && (Math.floor(ctx.time.now * 14) % 2 === 0);
        p.sprite.setAlpha(blink ? 0.35 : 1);

        if (p.rig) {
          // SPEC Rev 4 rig. The CONTAINER carries the flip (scaleX = -1), not
          // the individual parts: flipping parts would mirror each one about
          // its own pivot and tear the assembly apart. Rotating the container
          // by pi when facing left keeps the sprite upright while scaleX
          // un-mirrors it, which is the standard container-flip pairing.
          var sc = Math.abs(p.sprite.scaleX) || 1;
          p.sprite.scaleX = left ? -sc : sc;
          p.sprite.rotation = left ? (p.angle + Math.PI) : p.angle;
          // Bank is applied on top of the heading. It is a roll read as a
          // small extra rotation, and it must not invert when facing left.
          p.sprite.rotation += (left ? -1 : 1) * num(a.bank, 0);

          var tailR = Math.sin(a.tailPhase) * a.tailAmp;
          if (p.rig.tail) p.rig.tail.rotation = tailR;
          // Pectorals counter-flutter, mirrored about the centreline.
          var pf = Math.sin(a.pectPhase) * PECT_AMP;
          if (p.rig.pectR) p.rig.pectR.rotation = pf;
          if (p.rig.pectL) p.rig.pectL.rotation = -pf;
          if (p.rig.jaw) p.rig.jaw.rotation = num(a.jaw, 0);
        } else {
          // Single-texture fallback (Rev 3 behaviour, unchanged): sprites are
          // drawn nose-right, so flipping Y keeps the belly downward when
          // swimming left instead of rolling the shark upside down.
          if (p.sprite.setFlipY) p.sprite.setFlipY(left);
          p.sprite.rotation = p.angle + (left ? -1 : 1) * num(a && a.bank, 0);
        }
      }

      // Camera shake offset from the kit's juice frame state.
      var jf = kit.juice.frame();
      var cam = this.cameras.main;
      if (jf && (jf.dx || jf.dy)) { cam.setFollowOffset(-jf.dx, -jf.dy); }
      else if (cam.followOffset && (cam.followOffset.x || cam.followOffset.y)) cam.setFollowOffset(0, 0);

      this.paintHud(dt);
      this.tickComboChip(dt);

      if (this.pendingResults && (ctx.time.now - this.deathAt) > 1.1) this.finishRun();
    },

    paintHud: function (dt) {
      var p = ctx.player;
      var h = this.hud;

      // Health bar. All geometry is CSS px through S().
      var hpF = clamp(p.hp / p.maxHp, 0, 1);
      h.hpBar.clear();
      h.hpBar.fillStyle(0x0a2531, 1); h.hpBar.fillRoundedRect(S(18), S(33), S(128), S(11), S(5));
      var hpCol = hpF > 0.45 ? 0x5fd6c0 : (hpF > 0.2 ? 0xffd98a : 0xff6b7a);
      h.hpBar.fillStyle(hpCol, 1);
      if (hpF > 0) h.hpBar.fillRoundedRect(S(18), S(33), Math.max(S(4), S(128) * hpF), S(11), S(5));

      // Boost bar.
      var bF = clamp(p.ctl.boost, 0, 1);
      h.boostBar.clear();
      h.boostBar.fillStyle(0x0a2531, 1); h.boostBar.fillRoundedRect(S(18), S(49), S(128), S(8), S(4));
      h.boostBar.fillStyle(p.ctl.boosting ? 0x8fe8ff : 0x3f8fa8, 1);
      if (bF > 0) h.boostBar.fillRoundedRect(S(18), S(49), Math.max(S(3), S(128) * bF), S(8), S(4));

      // Power button, driven by RF.Abilities.hud.
      var hud = null;
      if (RF.Abilities && RF.Abilities.hud) {
        try { hud = RF.Abilities.hud(ctx); } catch (e) { warnOnce('Abilities.hud', e); }
      }
      h.power.clear();
      if (hud && p.def.active) {
        var charge = clamp(num(hud.charge, 0), 0, 1);
        var tint = num(hud.tint, 0x5fd6c0);
        var pcx = S(190), pcy = S(42);
        h.power.fillStyle(0x0a2531, 1); h.power.fillCircle(pcx, pcy, S(21));
        h.power.lineStyle(S(3), tint, hud.ready ? 1 : 0.4);
        h.power.beginPath();
        h.power.arc(pcx, pcy, S(17), -Math.PI / 2, -Math.PI / 2 + TAU * charge, false);
        h.power.strokePath();
        if (hud.ready) { h.power.fillStyle(tint, 0.24); h.power.fillCircle(pcx, pcy, S(16)); }
        var label = String(hud.id || p.def.active || '').slice(0, 4).toUpperCase();
        if (h.powerLabel.text !== label) h.powerLabel.setText(label);
        h.powerLabel.setAlpha(hud.ready ? 1 : 0.5);
      } else if (h.powerLabel.text !== '') {
        h.powerLabel.setText('');
      }

      // Coins, inside the single cluster. Compact form bounds the label to
      // <= 5 glyphs so it can never grow into the fitted name (REVIEW-2 rc3).
      var cstr = compactNum(ctx.run.coins);
      if (h.coins.text !== cstr) h.coins.setText(cstr);

      // Damage vignette: screen edges only, never a center overlay.
      if (h.vignetteA > 0) h.vignetteA = Math.max(0, h.vignetteA - dt * 1.5);
      var rush = ctx.run.goldRushT > 0 ? 0.3 : 0;
      h.vignette.clear();
      if (h.vignetteA > 0 || rush > 0) {
        var col = h.vignetteA > 0 ? 0xff3b4d : 0xffd98a;
        var a = h.vignetteA > 0 ? h.vignetteA : rush;
        var band = S(26);
        h.vignette.fillStyle(col, a * 0.55);
        h.vignette.fillRect(0, 0, W, band);
        h.vignette.fillRect(0, H - band, W, band);
        h.vignette.fillRect(0, 0, band, H);
        h.vignette.fillRect(W - band, 0, band, H);
      }
    },

    // Combo chips: queued, one at a time, <=24px, <=1s, near the cluster.
    queueComboChip: function () {
      var c = ctx.run.combo;
      var steps = FRENZY.steps || [3, 6, 10];
      // Only announce the meaningful thresholds, so the queue cannot flood.
      if (steps.indexOf(c) < 0) return;
      boundedPush(this.comboQueue, 'x' + comboMult() + ' COMBO', 4);
    },

    tickComboChip: function (dt) {
      if (this.comboChip) {
        this.comboChipT -= dt;
        this.comboChip.setAlpha(clamp(this.comboChipT / 0.35, 0, 1));
        if (this.comboChipT <= 0) { this.comboChip.destroy(); this.comboChip = null; }
        return;
      }
      if (!this.comboQueue.length) return;
      var label = this.comboQueue.shift();
      // Chip sits directly under the one HUD cluster (UI_LAW 3): <=24 CSS px
      // tall, one at a time, one second.
      this.comboChip = hudAdd(this, this.add.text(S(18), S(82), label, txt(12, '#ffd98a', '800'))
        .setOrigin(0, 0).setScrollFactor(0).setDepth(1003)
        .setPadding(S(8), S(4), S(8), S(4)).setBackgroundColor('rgba(2,18,28,0.7)'));
      // A chip created mid-run must be excluded from the world camera and
      // included on hudCam, which hudAdd + this reseal do together.
      hudCamSeal(this);
      this.comboChipT = 1;                     // one second, never stacked
    }
  };

  function zoneAtFallback(y) {
    var zones = RFD.ZONES || [];
    for (var i = 0; i < zones.length; i++) {
      if (y >= zones[i].yMin && y < zones[i].yMax) return zones[i];
    }
    return zones[zones.length - 1] || null;
  }

  function comboMult() {
    var steps = FRENZY.steps || [3, 6, 10];
    var mults = FRENZY.mults || [1, 2, 3, 5];
    var c = ctx.run.combo;
    var m = mults[0] || 1;
    for (var i = 0; i < steps.length; i++) if (c >= steps[i]) m = mults[i + 1] || m;
    return m;
  }

  // ---------------------------------------------------- context/player
  function buildContext(sc) {
    // ONE context object, created here and passed everywhere.
    ctx = RF.ctx = {
      kit: kit,
      scene: sc,
      dpr: DPR,          // SPEC Rev 3: the title-side factor, never GGKit's
      time: { now: 0, dt: STEP, frame: 0 },
      rng: mulberry32(((num(profile && profile.runs, 0) + runCount) * 2654435761) >>> 0),
      player: null,
      save: profile,
      run: {
        score: 0, coins: 0, xp: 0, combo: 0, comboT: 0, comboPeak: 0, frenzy: 0,
        goldRushT: 0, biggestTier: 0, slowmoT: 0, timeScale: 1
      }
    };
    return ctx;
  }

  function buildPlayer(sc, def) {
    if (!def) def = (RFD.SHARKS || [])[0];
    var pas = resolvePassives(def);
    var base = def.stats || {};

    // Upgrade levels scale the base stats via RFD.ECONOMY.upgradeEffect,
    // then abilities.js passive multipliers scale them again.
    // Upgrades are PER SHARK (sharks[id].up), so they are read against the
    // shark actually being built, not a global bag (RF-PROFILE-01).
    var uBite = 1 + upgradeLevel(def.id, 'bite') * num(UPEFF.bite, 0.1);
    var uSpeed = 1 + upgradeLevel(def.id, 'speed') * num(UPEFF.speed, 0.06);
    var uBoost = 1 + upgradeLevel(def.id, 'boost') * num(UPEFF.boost, 0.12);

    var stat = {
      speed: num(base.speed, 230) * uSpeed * pas.mult.speed,
      accel: num(base.accel, 520) * uSpeed * pas.mult.accel,
      turn: num(base.turn, 3.4) * pas.mult.turn,
      bite: num(base.bite, 1) * uBite * pas.mult.bite,
      hp: num(base.hp, 60) * pas.mult.hp,
      metab: num(base.metab, 1.6),
      boost: num(base.boost, 2.2) * uBoost * pas.mult.boost
    };

    var lenPx = 96 * num(def.sil && def.sil.len, 1);
    var p = {
      active: true, id: -1, kind: 'player', defId: def.id, def: def,
      tier: num(def.tier, 1),
      x: WORLD_W * 0.5, y: 260, vx: 0, vy: 0, angle: 0,
      hp: stat.hp, maxHp: stat.hp,
      st: { biteCd: 0, invulnT: 0, phaseT: 0, frozenT: 0, stunT: 0, burnT: 0, poisonT: 0, airborne: false, usedUndying: false },
      sprite: null,
      r: lenPx * 0.42,
      mouthR: clamp(lenPx * 0.22, 14, 90),
      stat: stat,
      pas: pas,
      // Per-shark upgrade snapshot (RF-PROFILE-01 residual): abilities.js reads
      // player.up.power for the charge multiplier; keep all four tracks here.
      up: {
        bite: upgradeLevel(def.id, 'bite'),
        speed: upgradeLevel(def.id, 'speed'),
        boost: upgradeLevel(def.id, 'boost'),
        power: upgradeLevel(def.id, 'power')
      },
      // SPEC Rev 4: the stick vector IS the desired velocity. sx/sy are the
      // normalised deflection (-1..1 each axis, magnitude clamped to 1); bx/by
      // are the floating base in DEVICE px on the HUD camera.
      ctl: {
        steerId: null, boostId: null,
        sx: 0, sy: 0, mag: 0,
        bx: 0, by: 0, active: false,
        boost: 1, boosting: false
      },
      // Rig animation state. Lives on the player so the fixed step owns it and
      // render() only reads it. No allocation once built.
      anim: {
        tailPhase: 0, tailAmp: 0, pectPhase: 0,
        bank: 0, jaw: 0, bob: 0, bobPhase: 0,
        trailX: 0, trailY: 0, trailInit: false
      }
    };
    ctx.player = p;
    return p;
  }

  // SPEC Rev 4: assemble a multi-part shark from RF.Art.bakeSharkRig into a
  // Phaser container, so game.js can animate the tail, fins and jaw on their
  // own pivots. Returns null for ANY shortfall (Lane D not landed, a throw, a
  // malformed record, a missing texture, no container support in the scene)
  // and the caller falls back to the single-texture sprite. The fallback is
  // the mandatory path while Lane D is still in flight.
  //
  // Contract per SPEC Rev 4:
  //   bakeSharkRig(scene, def) -> { body, tail, pect, jaw|null,
  //                                 pivots:{tail:{x,y}, pect:{x,y}, jaw:{x,y}},
  //                                 size:{w,h} }
  // where body/tail/pect/jaw are TEXTURE KEYS and pivots are offsets from the
  // body texture's centre, in the baked texture's own pixels.
  function buildSharkRig(sc, def, depth) {
    if (!RF.Art || !RF.Art.bakeSharkRig) return null;
    if (!sc.add || !sc.add.container || !sc.add.image) return null;
    var rec = null;
    try { rec = RF.Art.bakeSharkRig(sc, def); } catch (e) { warnOnce('Art.bakeSharkRig', e); return null; }
    if (!rec || !rec.body || !rec.tail || !rec.pect || !rec.pivots) return null;
    var pv = rec.pivots;
    if (!pv.tail || !pv.pect) return null;
    if (!sc.textures || !sc.textures.exists(rec.body) ||
        !sc.textures.exists(rec.tail) || !sc.textures.exists(rec.pect)) return null;

    var rig = null;
    try {
      var cont = sc.add.container(0, 0);
      cont.setDepth(num(depth, 50));

      // UNIT CONTRACT (integration fix): Lane D's pivots are BODY-CANVAS
      // ABSOLUTE CSS coordinates (top-left origin), and every part texture is
      // baked at DPR (device px). Normalize everything into CSS units inside
      // the container: each image gets setScale(1/partDpr), positions are
      // pivot-minus-half-body (center-relative CSS), and the container is
      // then scaled from CSS body width to the design length.
      var cssW = num(rec.size && rec.size.w, 0) || 1;
      var cssH = num(rec.size && rec.size.h, 0) || 1;

      var body = sc.add.image(0, 0, rec.body);
      body.setOrigin(0.5, 0.5);
      var bodyDpr = body.width > 0 ? body.width / cssW : 1;
      var inv = 1 / (bodyDpr || 1);
      body.setScale(inv);
      function cx(v) { return num(v, 0) - cssW / 2; }
      function cyv(v) { return num(v, 0) - cssH / 2; }

      // Tail: Lane D bakes the caudal fin with its ATTACHMENT at the LEFT
      // edge centre of the tail canvas, fin sweeping right. The body faces
      // right with the peduncle at the left, so the fin must sweep LEFT:
      // flipX the texture, which moves the attachment to the right edge,
      // and pivot there (origin 1, 0.5). setRotation then swings the fin
      // about the peduncle.
      var tail = sc.add.image(cx(pv.tail.x), cyv(pv.tail.y), rec.tail);
      tail.setOrigin(1, 0.5);
      tail.setFlipX(true);
      tail.setScale(inv);

      // Pectorals: root baked at the canvas top-left area; fin sweeps down-
      // right from it. pv.pect is the below-centre root; mirror partner
      // reflects the y offset about the body centreline.
      var pectYc = cyv(pv.pect.y);
      var pectR = sc.add.image(cx(pv.pect.x), pectYc, rec.pect);
      pectR.setOrigin(0.15, 0.1);
      pectR.setScale(inv);
      var pectL = sc.add.image(cx(pv.pect.x), -pectYc, rec.pect);
      pectL.setOrigin(0.15, 0.1);
      pectL.setFlipY(true);
      pectL.setScale(inv);

      var jaw = null;
      if (rec.jaw && sc.textures.exists(rec.jaw) && pv.jaw) {
        jaw = sc.add.image(cx(pv.jaw.x), cyv(pv.jaw.y), rec.jaw);
        jaw.setOrigin(0.1, 0.1);
        jaw.setScale(inv);
      }

      // Draw order: tail and far pectoral behind, body, near pectoral, jaw.
      cont.add(tail);
      cont.add(pectL);
      cont.add(body);
      cont.add(pectR);
      if (jaw) cont.add(jaw);

      // Scale the whole container so the rig reads at the design length.
      var want = 96 * num(def.sil && def.sil.len, 1);
      cont.setScale(want / cssW);

      rig = {
        container: cont, body: body, tail: tail, jaw: jaw,
        pectR: pectR, pectL: pectL,
        pectY: pectYc
      };
    } catch (e) {
      warnOnce('rig assemble', e);
      return null;
    }
    return rig;
  }

  function attachPlayerSprite(sc) {
    var p = ctx.player;

    // SPEC Rev 4: prefer the animated multi-part rig. Falls back silently.
    p.rig = buildSharkRig(sc, p.def, 50);
    if (p.rig) {
      p.sprite = p.rig.container;
      p.sprite.x = p.x; p.sprite.y = p.y;
      return;
    }

    var key = sharkTexture(sc, p.def, 'play');
    if (key && sc.textures.exists(key)) {
      p.sprite = sc.add.image(p.x, p.y, key).setDepth(50);
      var want = 96 * num(p.def.sil && p.def.sil.len, 1);
      if (p.sprite.width) p.sprite.setScale(want / p.sprite.width);
    } else {
      // Absolute last resort so the run is still playable and visible.
      var g = sc.add.graphics().setDepth(50);
      var pal = paletteOf(p.def);
      g.fillStyle(num(pal.base, 0x7d8c9e), 1);
      g.fillEllipse(0, 0, p.r * 2, p.r * 0.9);
      p.sprite = g;
    }
  }

  // ======================================================== bootstrap
  function onRestart() {
    // kit has already cleared input state before calling this.
    if (!game) return;
    var oc = game.scene.getScene('Ocean');
    if (oc && game.scene.isActive('Ocean')) game.scene.start('Ocean', { sharkId: selectedSharkId });
    else game.scene.start('Menu');
  }

  function boot() {
    if (!root.Phaser || !root.GGKit) {
      if (root.console && console.error) console.error('[Razorfin] Phaser or GGKit missing; cannot boot');
      return null;
    }

    kit = ggkit().create({
      slug: 'razorfin',
      orientation: 'landscape',
      validateSave: validateSave,
      onRestart: onRestart
    });

    if (RF.DevMode && RF.DevMode.init) {
      try { RF.DevMode.init(); } catch (e) { warnOnce('DevMode.init', e); }
    }

    profile = loadProfile();
    // RF-PROFILE-01: the selection comes from meta.js (profile.selected, with
    // the non-persisted dev pick layered on), never from an obsolete
    // profile.lastShark / profile.owned pair.
    selectedSharkId = activeSharkId();
    // Dev coins are meta.js's non-persisted sessionCoins overlay, surfaced by
    // RF.Meta.displayCoins. This file must NOT fabricate a second overlay by
    // adding to profile.coins, which diverged the menu from the shop.

    try { kit.registerPWA(); } catch (e) { warnOnce('registerPWA', e); }

    var scenes = [
      { key: 'Boot', preload: BootScene.preload, create: BootScene.create },
      { key: 'Menu', create: MenuScene.create, extend: MenuScene },
      { key: 'Ocean', init: OceanScene.init, create: OceanScene.create, update: OceanScene.update, extend: OceanScene }
    ];

    // ---------------------------------------------- RF-RETINA-01 / SPEC Rev 3
    // The game is SIZED IN DEVICE PIXELS (W and H are already CSS * DPR) and
    // scaled back down with zoom = 1/DPR, which is the only mechanism Phaser 3
    // still has for a dense backing store: `resolution` was removed after 3.16
    // and is ignored if set.
    //
    // GGKit.hiDpi.phaser() is deliberately NOT used. It derives its factor from
    // hiDpi.dpr(), which the 2026-08-17 fleet kill switch holds at 1, so it
    // would hand back a 1x game on a DPR3 iPhone. The kill switch stays intact
    // for the rest of the fleet; razorfin owns its own factor and its own
    // conversion, and every hard-coded px in this file goes through S().
    //
    // Only the render defaults are borrowed from the kit, smart-merged so the
    // config below wins.
    var g = ggkit();
    var cfg = {
      type: Phaser.AUTO,
      parent: 'game-root',
      backgroundColor: '#02101c',
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: Math.round(W),          // device px
        height: Math.round(H),         // device px
        zoom: 1 / DPR                  // canvas back down to the CSS box
      },
      scene: scenes
    };
    cfg.render = Object.assign({}, (g && g.renderDefaults) || {}, cfg.render || {});
    cfg.ggDpr = DPR;

    game = new Phaser.Game(cfg);
    // RF.Game.game / .kit are getters over these closure vars; never assign them.

    // Scenes owned by meta.js are registered once the game exists, so that
    // lane can attach Shop/Results without touching this file.
    game.events.once('ready', function () {
      registerMetaScenes();
    });
    return game;
  }

  function registerMetaScenes() {
    if (!RF.Meta || !game) return;
    // meta.js exposes RF.Meta.scenes = {Shop, Results} as Phaser.Class scene
    // classes (null when Phaser was absent at its load time). Tolerate the
    // scene<Key> spelling too rather than depending on one shape.
    var bag = RF.Meta.scenes;
    if (!bag && RF.Meta.buildScenes) {
      try { bag = RF.Meta.scenes = RF.Meta.buildScenes(); } catch (e) { warnOnce('Meta.buildScenes', e); }
    }
    ['Shop', 'Results'].forEach(function (key) {
      if (game.scene.getScene(key)) return;
      var s = (bag && bag[key]) || RF.Meta['scene' + key];
      if (!s) return;
      try { game.scene.add(key, s, false); } catch (e) { warnOnce('add scene ' + key, e); }
    });
  }

  function toDesign(pt) {
    var r = cssRect();
    DESIGN.x = (pt.x - r.left) / (r.scaleX || 1);
    DESIGN.y = (pt.y - r.top) / (r.scaleY || 1);
    return DESIGN;
  }
  var DESIGN = { x: 0, y: 0 };

  // Pre-allocated copy target for eat resolution, so step() never allocates
  // and never holds world.js's shared query scratch across a nested query.
  var EAT_BUF = new Array(48);

  // Reused options bag for Fx.emit from inside the fixed step (Rev 4 juice
  // hooks). juice.js reads the fields synchronously and must not retain the
  // object; nothing in the RF.Fx contract says otherwise, and holding it would
  // be a bug on that side regardless of who allocated it.
  var FX_OPT = { count: 0, speed: 0, angle: 0, up: false };

  // ======================================================== self test
  // Headless: stubs kit and the Phaser scene surface, builds a real ctx and
  // a real player, then drives 120 fixed steps of swim-toward-target with a
  // planted meal and a hunger tick. Exercises the real step() path.
  function __selftest() {
    var notes = [];
    var pass = true;
    function check(cond, msg) { if (!cond) { pass = false; notes.push('FAIL ' + msg); } else notes.push('ok ' + msg); }

    var savedCtx = RF.ctx, savedKit = kit, savedProfile = profile, savedGame = game;
    try {
      // ---- stub kit
      var keysDown = {};
      kit = {
        paused: false,
        save: { get: function (f) { return f; }, set: function () {} },
        audio: { register: function () {}, sfx: function () {}, music: function () {} },
        loader: { show: function () {}, progress: function () {}, hide: function () {} },
        juice: { frame: function () { return { dx: 0, dy: 0, frozen: false }; }, shake: function () {}, hitStop: function () {} },
        input: {
          keyDown: function (c) { return !!keysDown[c]; },
          onDown: function () { return function () {}; },
          onMove: function () { return function () {}; },
          onUp: function () { return function () {}; },
          onKeyDown: function () { return function () {}; }
        }
      };
      profile = fallbackProfile();
      game = null;

      // ---- stub scene surface used by step()/render()
      var stubScene = {
        cameras: { main: { scrollX: 0, scrollY: 0, setFollowOffset: function () {}, followOffset: { x: 0, y: 0 } } },
        add: { text: function () { return stubText(); }, graphics: function () { return stubGfx(); } },
        tweens: { add: function () {} },
        textures: { exists: function () { return false; } },
        hud: null
      };
      function stubText() {
        return { text: '', setText: function (v) { this.text = v; return this; }, setOrigin: r(), setScrollFactor: r(), setDepth: r(), setPadding: r(), setBackgroundColor: r(), setAlpha: r(), destroy: function () {} };
      }
      function stubGfx() {
        var g = {};
        ['clear', 'fillStyle', 'fillRect', 'fillRoundedRect', 'fillCircle', 'fillEllipse', 'lineStyle', 'strokeRoundedRect', 'beginPath', 'arc', 'strokePath', 'setDepth', 'setScrollFactor', 'fillGradientStyle'].forEach(function (m) { g[m] = function () { return g; }; });
        return g;
      }
      function r() { return function () { return this; }; }

      // ---- world stub with one edible prey and a hunger sink
      var prey = {
        active: true, id: 1, kind: 'prey', defId: 'minnow', tier: 0,
        x: 0, y: 0, vx: 0, vy: 0, angle: 0, hp: 1, maxHp: 1, st: {}, sprite: null, r: 10,
        def: creatureById('minnow') || { id: 'minnow', tier: 0, score: 5, coins: 1 }
      };
      var killed = [];
      var savedWorld = RF.World;
      // playerHits is the same shape world.js exports: cleared at the top of
      // update, refilled during it, consumed by game.js the same frame.
      var stubHits = [];
      var hitQueue = [];
      RF.World = {
        playerHits: stubHits,
        init: function () {},
        update: function () {
          stubHits.length = 0;
          if (hitQueue.length) stubHits.push(hitQueue.shift());
        },
        query: function (x, y, rr, filter) {
          if (filter === 'predator') return [];
          if (!prey.active) return [];
          var dx = prey.x - x, dy = prey.y - y;
          return (dx * dx + dy * dy) <= (rr + prey.r) * (rr + prey.r) ? [prey] : [];
        },
        kill: function (e, cause) { e.active = false; killed.push(cause); },
        zoneAt: function (y) { return zoneAtFallback(y); },
        entities: [prey]
      };

      // ---- build the real ctx and player, then wire the Ocean methods
      var oc = Object.create(OceanScene);
      for (var k in stubScene) oc[k] = stubScene[k];
      oc.acc = 0; oc.freezeMs = 0; oc.dying = false; oc.subs = [];
      oc.comboQueue = []; oc.comboChip = null; oc.comboChipT = 0;
      oc.add = stubScene.add; oc.tweens = stubScene.tweens;

      buildContext(oc);
      var p = buildPlayer(oc, sharkById('reef'));
      check(!!p && p.kind === 'player', 'player entity built');
      check(isFinite(p.stat.speed) && p.stat.speed > 0, 'stats resolved finite');

      oc.hud = {
        hpBar: stubGfx(), boostBar: stubGfx(), power: stubGfx(), vignette: stubGfx(),
        powerLabel: stubText(), coins: stubText(), nameLabel: stubText(),
        vignetteA: 0, powerRect: null
      };

      var x0 = p.x, y0 = p.y, hp0 = p.hp;

      // SPEC Rev 4: the stick is the control. Push it fully right and put the
      // meal on that line.
      p.ctl.active = true;
      p.ctl.sx = 1; p.ctl.sy = 0; p.ctl.mag = 1;
      prey.x = p.x + 140; prey.y = p.y;

      var score0 = ctx.run.score;
      for (var i = 0; i < 120; i++) oc.step();

      check(Math.abs(p.x - x0) > 20, 'player moved toward target (dx=' + (p.x - x0).toFixed(1) + ')');
      check(!prey.active && killed.indexOf('eaten') >= 0, 'prey was eaten');
      check(ctx.run.score > score0, 'score increased on swallow');
      check(ctx.run.combo >= 1, 'combo incremented');
      check(ctx.run.frenzy > 0, 'frenzy meter charged');

      // Hunger: with nothing left to eat, hp must fall over time.
      var hpAfterEat = p.hp;
      p.hp = p.maxHp;
      for (var j = 0; j < 120; j++) oc.stepHunger(p);
      check(p.hp < p.maxHp, 'hunger drained hp (' + (p.maxHp - p.hp).toFixed(2) + ')');
      check(hpAfterEat !== hp0, 'hp changed across the run');

      // Zone pressure: a tier-1 shark deep down drains faster than up top.
      p.hp = p.maxHp; p.y = 3000;
      for (var q = 0; q < 60; q++) oc.stepHunger(p);
      var deep = p.maxHp - p.hp;
      p.hp = p.maxHp; p.y = 100;
      for (var w2 = 0; w2 < 60; w2++) oc.stepHunger(p);
      var shallow = p.maxHp - p.hp;
      check(deep > shallow * 2.5, 'zone pressure multiplies drain');

      // ---- RF-RETINA-01: the density factor must reach a real font size.
      // txt() is the one conversion point, so a sampled style proves the whole
      // UI moved with it rather than only the constant being present.
      check(RF.Game.dpr === DPR && DPR >= 1 && DPR <= 3,
        'dpr factor exported and in range (' + DPR + ')');
      check(ctx.dpr === DPR, 'ctx.dpr carries the title-side factor');
      var sampled = parseFloat(txt(13, '#fff', '700').fontSize);
      check(sampled === Math.round(13 * DPR),
        'font size scaled by dpr: 13 CSS px -> ' + sampled + ' device px');
      check(W === CSS_W * DPR && H === CSS_H * DPR,
        'design space sized in device px (' + W + 'x' + H + ')');
      // A HUD geometry sample and a hit area sample, so the scaling is proven
      // beyond fonts: the touch minimum stays 44 CSS px in device units.
      var hitSample = padHit(0, 0, S(10), S(10));
      check(Math.abs(hitSample.w - S(MIN_TAP_CSS)) < 0.001,
        'hit areas padded to 44 CSS px (' + hitSample.w.toFixed(1) + ' device px)');

      // ---- RF-HITS-01: world.js is the damage authority and its records are
      // consumed exactly once, in the frame they were produced.
      p.hp = p.maxHp;
      p.st.invulnT = 0;
      p.st.phaseT = 0;
      ctx.run.goldRushT = 0;
      var hpBeforeHit = p.hp;
      hitQueue.push({ ent: prey, dmg: 12, x: p.x + 5, y: p.y });
      oc.step();
      var afterOne = p.hp;
      var dropped = hpBeforeHit - afterOne;
      // Hunger also ticks in a step, so the hit is identified by size, not by
      // equality: 12 damage dwarfs one step of metabolism.
      check(dropped > 10 && dropped < 14,
        'playerHits applied once, hp fell by ' + dropped.toFixed(2));
      check(p.st.invulnT > 0, 'a consumed hit opened the invulnerability window');
      // The SAME record must not be applied again on the following frames.
      var afterConsume = p.hp;
      for (var hs = 0; hs < 3; hs++) oc.step();
      var extra = afterConsume - p.hp;
      check(extra < 1.0,
        'consumed hit was not re-applied on later frames (extra ' + extra.toFixed(3) + ')');

      // ---- RF-COINS-01: a player swallow pays once and suppresses the world
      // pickup by zeroing the entity's coins before World.kill.
      prey.active = true; prey.coins = 6; prey.hp = 1;
      prey.x = p.x + Math.cos(p.angle) * 10; prey.y = p.y + Math.sin(p.angle) * 10;
      var coins0 = ctx.run.coins;
      oc.swallow(prey);
      check(ctx.run.coins > coins0, 'swallow paid coins directly');
      check(prey.coins === 0, 'swallow zeroed entity coins so world drops no pickup');

      // ---- RF-BEST-01: the peak combo is retained across a broken streak.
      var peak = ctx.run.comboPeak;
      check(peak >= ctx.run.combo, 'comboPeak tracks the high-water mark');
      ctx.run.combo = 0;
      check(ctx.run.comboPeak === peak, 'comboPeak survives a broken combo');

      // ---- RF-PASSIVE-01: live statMults are consumed, not the boot snapshot.
      p.st.statMults = { speed: 2, bite: 2, boost: 1, hp: 1, metab: 0.5 };
      check(Math.abs(liveMult(p, 'metab') - 0.5) < 1e-9,
        'live metab multiplier consumed from st.statMults');
      p.hp = p.maxHp;
      for (var m1 = 0; m1 < 60; m1++) oc.stepHunger(p);
      var slowDrain = p.maxHp - p.hp;
      p.st.statMults.metab = 1;
      p.hp = p.maxHp;
      for (var m2 = 0; m2 < 60; m2++) oc.stepHunger(p);
      var fullDrain = p.maxHp - p.hp;
      check(slowDrain > 0 && Math.abs(fullDrain - slowDrain * 2) < fullDrain * 0.05,
        'slowMetab halves hunger drain via the numeric multiplier');
      delete p.st.statMults;

      // ---- RF-PROFILE-01: upgrades read sharks[id].up, not profile.upgrades.
      profile.sharks.reef.up.bite = 3;
      check(upgradeLevel('reef', 'bite') === 3, 'upgradeLevel reads sharks[id].up');
      profile.sharks.reef.up.bite = 0;

      // ---- Ability teardown is wired into the death path. A Chrono/Phase
      // death must not leak its time scale or its invulnerability forward.
      var resetCalls = 0;
      var savedAb = RF.Abilities;
      RF.Abilities = { reset: function () { resetCalls++; ctx.run.timeScale = 1; } };
      ctx.run.timeScale = 0.35;
      oc.pendingResults = true;
      oc.scene = { manager: { getScene: function () { return null; } }, start: function () {} };
      oc.finishRun();
      check(resetCalls === 1, 'finishRun called Abilities.reset before leaving');
      check(ctx.run.timeScale === 1, 'time scale restored on run exit');
      RF.Abilities = savedAb;

      // ---- SPEC Rev 4: floating stick drives desired velocity, and releasing
      // it must bring the shark to rest rather than leaving it drifting.
      // Fresh player so the earlier assertions cannot colour the result.
      var pc = buildPlayer(oc, sharkById('reef'));
      oc.hud = { hpBar: stubGfx(), boostBar: stubGfx(), power: stubGfx(), vignette: stubGfx(),
        powerLabel: stubText(), coins: stubText(), nameLabel: stubText(),
        vignetteA: 0, powerRect: null };
      oc.stickG = null;                 // no HUD graphics in the headless stub
      prey.active = false;              // nothing to eat, this is a motion test
      pc.x = 3000; pc.y = 600; pc.vx = 0; pc.vy = 0; pc.angle = 0;

      // Stick full DOWN-RIGHT (45 degrees), simulated the way the pointer
      // handlers would leave it: normalised deflection, magnitude 1.
      var ang45 = Math.PI / 4;
      pc.ctl.active = true;
      pc.ctl.sx = Math.cos(ang45); pc.ctl.sy = Math.sin(ang45); pc.ctl.mag = 1;
      var sx0 = pc.x, sy0 = pc.y;
      for (var s4 = 0; s4 < 120; s4++) oc.step();
      var mx = pc.x - sx0, my = pc.y - sy0;
      var mlen = Math.sqrt(mx * mx + my * my);
      check(mlen > 40, 'stick input accelerated the player (' + mlen.toFixed(1) + ' px)');
      // Direction: the travel vector must point along the stick, not merely be
      // non-zero. cos of the angle between them.
      var dot = (mx * Math.cos(ang45) + my * Math.sin(ang45)) / (mlen || 1);
      check(dot > 0.9, 'travel followed the stick direction (cos=' + dot.toFixed(3) + ')');
      check(Math.abs(angDelta(pc.angle, ang45)) < 0.2,
        'heading aligned to the stick (err=' + Math.abs(angDelta(pc.angle, ang45)).toFixed(3) + ')');
      var movingSpeed = Math.sqrt(pc.vx * pc.vx + pc.vy * pc.vy);
      check(movingSpeed > 10, 'player is genuinely under way (' + movingSpeed.toFixed(1) + ' px/s)');

      // Magnitude is a throttle: half deflection must settle slower than full.
      pc.ctl.sx = Math.cos(ang45) * 0.5; pc.ctl.sy = Math.sin(ang45) * 0.5; pc.ctl.mag = 0.5;
      for (var s5 = 0; s5 < 120; s5++) oc.step();
      var halfSpeed = Math.sqrt(pc.vx * pc.vx + pc.vy * pc.vy);
      check(halfSpeed < movingSpeed * 0.75,
        'half deflection settles slower (' + halfSpeed.toFixed(1) + ' vs ' + movingSpeed.toFixed(1) + ')');

      // RELEASE: the shark must decelerate to near zero and stay there.
      oc.clearStick();
      check(!pc.ctl.active && pc.ctl.mag === 0, 'clearStick cleared the stick state');
      for (var s6 = 0; s6 < 120; s6++) oc.step();
      var restSpeed = Math.sqrt(pc.vx * pc.vx + pc.vy * pc.vy);
      check(restSpeed < 1.0,
        'player decelerated to rest on release (' + restSpeed.toFixed(4) + ' px/s)');
      var restX = pc.x, restY = pc.y;
      for (var s7 = 0; s7 < 60; s7++) oc.step();
      var drift = Math.abs(pc.x - restX) + Math.abs(pc.y - restY);
      check(drift < 0.5, 'no drift after release (' + drift.toFixed(4) + ' px over 60 steps)');

      // A null release (ggkit fires onUp with a null event on cancel) must
      // clear the stick rather than strand the shark at full throttle.
      pc.ctl.active = true; pc.ctl.sx = 1; pc.ctl.sy = 0; pc.ctl.mag = 1;
      pc.ctl.steerId = 7; pc.ctl.boostId = 9;
      oc.clearStick(); pc.ctl.boostId = null;
      check(pc.ctl.steerId === null && pc.ctl.boostId === null && !pc.ctl.active,
        'cancel path releases both pointers');

      // Stick geometry: the drag handler clamps to the radius and re-centers
      // the base past 1.35x. Exercised through the real handlers.
      oc.plantStick(400, 300);
      check(pc.ctl.active && pc.ctl.bx === 400 && pc.ctl.by === 300,
        'plantStick placed the base under the finger');
      var maxR = S(STICK_R_CSS);
      oc.dragStick(400 + maxR * 4, 300);
      check(Math.abs(pc.ctl.mag - 1) < 1e-9, 'deflection clamped to the stick radius');
      check(Math.abs(pc.ctl.bx - (400 + maxR * 3)) < 1e-6,
        'base re-centered past 1.35x radius (bx=' + pc.ctl.bx.toFixed(1) + ')');
      oc.dragStick(pc.ctl.bx + maxR * 0.5, pc.ctl.by);
      check(Math.abs(pc.ctl.mag - 0.5) < 1e-9,
        'partial deflection reads as partial magnitude (' + pc.ctl.mag.toFixed(3) + ')');
      // Dead zone: a tiny wobble must not creep the shark.
      oc.dragStick(pc.ctl.bx + maxR * 0.05, pc.ctl.by);
      pc.vx = 0; pc.vy = 0;
      for (var s8 = 0; s8 < 30; s8++) oc.step();
      check(Math.sqrt(pc.vx * pc.vx + pc.vy * pc.vy) < 0.5,
        'sub-dead-zone deflection does not creep');
      oc.clearStick();

      // ---- SPEC Rev 4: rig animation advances in the fixed step, and its
      // tail beat scales with speed. A FAKE rig stands in for Lane D.
      function fakePart() {
        return { rotation: 0, x: 0, y: 0, width: 128, setOrigin: r(), setFlipY: r(),
          setDepth: r(), setScale: r(), setAlpha: r() };
      }
      pc.rig = { container: null, body: fakePart(), tail: fakePart(),
        pectR: fakePart(), pectL: fakePart(), jaw: fakePart(), pectY: 8 };
      pc.sprite = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1,
        setAlpha: function () { return this; }, setFlipY: function () { return this; } };

      // Idle beat over a fixed window.
      pc.vx = 0; pc.vy = 0; pc.ctl.active = false; pc.ctl.mag = 0;
      pc.anim.tailPhase = 0;
      var idleTurns = 0, lastPh = 0;
      for (var t1 = 0; t1 < 60; t1++) {
        oc.stepAnim(pc);
        if (pc.anim.tailPhase < lastPh) idleTurns++;
        lastPh = pc.anim.tailPhase;
      }
      var idleAmp = pc.anim.tailAmp;
      check(idleTurns >= 2 && idleTurns <= 3,
        'idle tail beat near 2.5 Hz (' + idleTurns + ' cycles per second)');

      // Cruise beat: same window, shark at full speed. Must be faster.
      pc.ctl.speedCap = pc.stat.speed;
      pc.vx = pc.stat.speed; pc.vy = 0;
      pc.anim.tailPhase = 0; lastPh = 0;
      var cruiseTurns = 0;
      for (var t2 = 0; t2 < 60; t2++) {
        oc.stepAnim(pc);
        if (pc.anim.tailPhase < lastPh) cruiseTurns++;
        lastPh = pc.anim.tailPhase;
        pc.vx = pc.stat.speed; pc.vy = 0;    // hold speed against nothing
      }
      check(cruiseTurns > idleTurns,
        'tail phase advances faster with speed (' + idleTurns + ' -> ' + cruiseTurns + ' Hz)');
      check(pc.anim.tailAmp > idleAmp,
        'tail amplitude rises with speed (' + idleAmp.toFixed(3) + ' -> ' + pc.anim.tailAmp.toFixed(3) + ')');

      // Boost beat must beat cruise.
      pc.ctl.boosting = true;
      pc.anim.tailPhase = 0; lastPh = 0;
      var boostTurns = 0;
      for (var t3 = 0; t3 < 60; t3++) {
        oc.stepAnim(pc);
        if (pc.anim.tailPhase < lastPh) boostTurns++;
        lastPh = pc.anim.tailPhase;
        pc.vx = pc.stat.speed; pc.vy = 0;
      }
      check(boostTurns > cruiseTurns,
        'boost beats faster than cruise (' + cruiseTurns + ' -> ' + boostTurns + ' Hz)');
      pc.ctl.boosting = false;

      // Bank is capped, and a hard turn actually banks.
      pc.ctl.turnIn = 1;
      for (var t4 = 0; t4 < 120; t4++) oc.stepAnim(pc);
      check(Math.abs(pc.anim.bank) > 0.02, 'body banks into a sustained turn');
      check(Math.abs(pc.anim.bank) <= BANK_MAX + 1e-9,
        'bank is capped at ' + BANK_MAX + ' rad (' + pc.anim.bank.toFixed(4) + ')');
      pc.ctl.turnIn = 0;

      // Jaw opens inside the bite cooldown window and shuts after it.
      pc.st.biteCd = 0.25;
      for (var t5 = 0; t5 < 20; t5++) oc.stepAnim(pc);
      check(pc.anim.jaw > 0.05, 'jaw opens during the bite window (' + pc.anim.jaw.toFixed(3) + ')');
      pc.st.biteCd = 0;
      for (var t6 = 0; t6 < 60; t6++) oc.stepAnim(pc);
      check(pc.anim.jaw < 0.02, 'jaw closes after the bite window');

      // Idle bob only when genuinely slow.
      pc.vx = 0; pc.vy = 0;
      for (var t7 = 0; t7 < 40; t7++) oc.stepAnim(pc);
      check(Math.abs(pc.anim.bob) > 0, 'idle bob runs when slow');
      pc.vx = pc.stat.speed; pc.vy = 0;
      for (var t8 = 0; t8 < 120; t8++) { oc.stepAnim(pc); pc.vx = pc.stat.speed; pc.vy = 0; }
      check(Math.abs(pc.anim.bob) < 0.01, 'idle bob decays at speed');

      // render() must drive the rig parts and carry the flip on the CONTAINER
      // (scaleX), never on the individual parts, or the pivots tear apart.
      ctx.player = pc;
      pc.angle = Math.PI;                 // facing left
      pc.anim.tailPhase = Math.PI / 2;    // sin = 1, a definite tail deflection
      pc.anim.tailAmp = 0.3;
      oc.deathAt = 0; oc.pendingResults = false;
      oc.render(STEP);
      check(pc.sprite.scaleX < 0, 'facing left flips the container scaleX');
      check(Math.abs(pc.rig.tail.rotation - 0.3) < 1e-6,
        'render drove the tail rotation from the sim phase (' + pc.rig.tail.rotation.toFixed(4) + ')');
      check(pc.rig.pectL.rotation === -pc.rig.pectR.rotation,
        'pectorals counter-flutter as a mirrored pair');

      // Rig absence is the mandatory fallback: render must still work.
      pc.rig = null;
      var threwFallback = null;
      try { oc.render(STEP); } catch (e) { threwFallback = e; }
      check(!threwFallback, 'render falls back to the single sprite when no rig');
      // buildSharkRig must decline cleanly when Lane D has not landed.
      var savedArt = RF.Art;
      RF.Art = undefined;
      check(buildSharkRig(oc, sharkById('reef'), 50) === null,
        'buildSharkRig returns null without RF.Art.bakeSharkRig');
      RF.Art = { bakeSharkRig: function () { throw new Error('lane D blew up'); } };
      check(buildSharkRig(oc, sharkById('reef'), 50) === null,
        'buildSharkRig survives a throwing bakeSharkRig');
      RF.Art = { bakeSharkRig: function () { return { body: 'b' }; } };
      check(buildSharkRig(oc, sharkById('reef'), 50) === null,
        'buildSharkRig rejects a malformed rig record');
      RF.Art = savedArt;

      // ---- SPEC Rev 4 juice hooks. The newer Lane F pools are preferred and
      // the older families are the fallback, decided on the emit COUNT so an
      // older juice.js still gets a wake and a splash.
      var savedFx = RF.Fx;
      var emits = [];
      // Modern juice.js: swimtrail and breach both accept.
      RF.Fx = { emit: function (n) { emits.push(n); return n === 'swimtrail' || n === 'breach' ? 3 : 1; } };
      pc.rig = null;
      pc.anim.trailInit = true; pc.anim.trailX = 0; pc.anim.trailY = 0;
      pc.x = 3000; pc.y = 600; pc.vx = pc.stat.speed; pc.vy = 0;
      pc.ctl.speedCap = pc.stat.speed;
      oc.stepAnim(pc);
      check(emits.indexOf('swimtrail') >= 0 && emits.indexOf('bubbles') < 0,
        'modern juice.js takes swimtrail and no bubbles fallback');
      // Older juice.js: the new pools decline (0), the old family must fire.
      emits.length = 0;
      RF.Fx = { emit: function (n) { emits.push(n); return n === 'bubbles' ? 3 : 0; } };
      pc.anim.trailX = 0; pc.anim.trailY = 0;
      oc.stepAnim(pc);
      check(emits.indexOf('swimtrail') >= 0 && emits.indexOf('bubbles') >= 0,
        'older juice.js falls back from swimtrail to bubbles');
      // Breach: crossing the surface emits, and the sound is not doubled.
      emits.length = 0;
      var sfxPlayed = [];
      var savedSound = RF.Sound;
      RF.Sound = { play: function (n) { sfxPlayed.push(n); } };
      RF.Fx = { emit: function (n) { emits.push(n); return n === 'breach' ? 5 : 0; } };
      pc.st.airborne = false; pc.y = -10; pc.vy = -200;
      oc.stepMotion(pc);
      check(emits.indexOf('breach') >= 0, 'surface exit emitted a breach');
      check(sfxPlayed.indexOf('splash') < 0,
        'breach pool owns its own sound, game.js does not double it');
      // And with no breach pool the old splash sound still plays.
      emits.length = 0; sfxPlayed.length = 0;
      RF.Fx = { emit: function (n) { emits.push(n); return 0; } };
      pc.st.airborne = false; pc.y = -10; pc.vy = -200;
      oc.stepMotion(pc);
      check(sfxPlayed.indexOf('splash') >= 0, 'splash sound falls back when no breach pool');
      RF.Fx = savedFx; RF.Sound = savedSound;

      // Put the original player back for the degraded sweep below.
      ctx.player = p;

      // Degraded mode: with every sibling namespace gone, step() must not throw.
      var keep = { World: RF.World, Fx: RF.Fx, Juice: RF.Juice, Sound: RF.Sound, Music: RF.Music, Abilities: RF.Abilities, Meta: RF.Meta };
      RF.World = RF.Fx = RF.Juice = RF.Sound = RF.Music = RF.Abilities = RF.Meta = undefined;
      var threw = null;
      try { for (var z = 0; z < 30; z++) oc.step(); } catch (e) { threw = e; }
      for (var kk in keep) RF[kk] = keep[kk];
      check(!threw, 'degraded step (no sibling modules) did not throw' + (threw ? ': ' + threw.message : ''));

      RF.World = savedWorld;
    } catch (err) {
      pass = false;
      notes.push('EXCEPTION ' + (err && err.message ? err.message : String(err)));
    } finally {
      RF.ctx = savedCtx; kit = savedKit; profile = savedProfile; game = savedGame;
    }
    return { pass: pass, notes: notes };
  }

  // ---------------------------------------------------------- exports
  RF.Game = {
    boot: boot,
    __selftest: __selftest,
    // SPEC Rev 3: the title-side density factor. sharkart.js and world.js bake
    // against this (fallback 1), NOT GGKit.hiDpi, which is kill-switched to 1.
    dpr: DPR,
    S: S,               // CSS px -> device px, for any lane that needs it
    CSS_W: CSS_W, CSS_H: CSS_H,
    get ctx() { return ctx; },
    get kit() { return kit; },
    get game() { return game; },
    get profile() { return profile; },
    registerMetaScenes: registerMetaScenes,
    // SPEC Rev 4 hook for world.js: build an animated multi-part shark for an
    // NPC predator. Returns null whenever RF.Art.bakeSharkRig is absent or the
    // record is unusable, so the caller must keep its single-sprite path.
    // world.js also needs to advance the parts itself; game.js only animates
    // the player (it does not own the NPC pool or its update loop).
    buildSharkRig: buildSharkRig,
    STEP: STEP,
    W: W, H: H
  };

  // Auto-boot in a browser. Under node (selftest harness) there is no
  // document, so the module just exports and waits.
  if (typeof document !== 'undefined' && root.Phaser && root.GGKit) boot();

})(typeof window !== 'undefined' ? window : globalThis);
