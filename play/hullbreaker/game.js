/* game.js — Hullbreaker (AAA rebuild, fleet F3).
 *
 * Seeded asteroid-field survival. Phaser 3.87 from /play/_shared/, GGKit as
 * the sole lifecycle / input / save / audio implementation.
 *
 * Layout of this file:
 *   1. constants + pure helpers
 *   2. HB_STATE (verification hook) and the test-switch reader
 *   3. GGKit wiring, tap layer, layout
 *   4. BootScene / TitleScene / SelectScene
 *   5. PlayScene   (hb_play.js appends its methods to PLAY)
 *   6. boot
 */
(function () {
  'use strict';

  var D = window.HB_DATA;
  var STEP = 1 / 60;
  var MAX_STEPS = 5;

  // ------------------------------------------------------------ tuning
  var SHIP = {
    r: 15,
    thrust: 560,          // px/s^2 along the nose
    retro: 300,           // counter-thrust when the stick opposes travel
    turn: 6.2,            // rad/s toward the stick heading
    maxSpeed: 360,
    drag: 0.62,           // per second, exponential; sectors may soften it
    dashSpeed: 780,
    dashTime: 0.20,
    dashIFrame: 0.28,
    dashRecharge: 2.3,
    hitIFrame: 1.35,
    criticalIFrame: 2.2   // the run-ending hit is telegraphed, not sprung
  };
  var HEAT_CAP = 100;
  var HEAT_COOL = 30;     // per second while not firing
  var HEAT_COOL_FIRING = 9;
  var VENT_LOCK = 1.5;
  var MAGNET_R = 130;
  var DROP_LIFE = 14;
  var OVERCHARGE_TIME = 6;

  var MAX_ROCKS = 96;
  var MAX_SHOTS = 72;
  var MAX_PICKUPS = 96;
  var MAX_HAZARDS = 24;
  var MAX_GHOSTS = 40;

  var SAVE_VERSION = 5;

  // -------------------------------------------------------- pure helpers
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function angDiff(a, b) { return Math.atan2(Math.sin(b - a), Math.cos(b - a)); }

  function wrapDelta(a, b, size) {
    var d = a - b;
    if (d > size * 0.5) d -= size;
    else if (d < -size * 0.5) d += size;
    return d;
  }

  // mulberry32: every field, drop roll and hazard placement is seeded from
  // (sector seed, wave), so a forced wave reproduces the shipped content.
  function mulberry32(seed) {
    var t = seed >>> 0;
    return function () {
      t = (t + 0x6D2B79F5) >>> 0;
      var x = Math.imul(t ^ (t >>> 15), t | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rngRange(rng, a, b) { return a + (b - a) * rng(); }
  function rngPick(rng, arr) {
    if (!arr || !arr.length) return null;
    return arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))];
  }

  // Text writes are the top source of avoidable layout work in this fleet.
  function setTextIfChanged(obj, value) {
    if (!obj) return;
    if (obj.__hbText !== value) { obj.__hbText = value; obj.setText(value); }
  }
  // setColor rebuilds the text's canvas texture, so it needs the same guard
  // the string itself gets.
  function setColorIfChanged(obj, css) {
    if (!obj) return;
    if (obj.__hbColor !== css) { obj.__hbColor = css; obj.setColor(css); }
  }
  function pad(n, w) {
    var s = String(Math.max(0, Math.floor(n)));
    while (s.length < w) s = '0' + s;
    return s;
  }
  function mmss(sec) {
    var s = Math.max(0, Math.floor(sec));
    return Math.floor(s / 60) + ':' + pad(s % 60, 2);
  }

  // =====================================================================
  // 2. verification hook
  // =====================================================================
  // ONE object, mutated in place. The boot fallback below publishes it and
  // the live scene never replaces it, so a probe that grabbed window.__hb
  // during boot keeps reading fresh values. Debug array views are rebuilt
  // as fresh arrays every refresh; they are never aliases of a live pool.
  var HB_STATE = {
    ready: false,
    mode: 'boot',
    sector: 1,
    sectorId: '',
    sectorName: '',
    family: '',
    wave: 0,
    waveKind: '',
    waveName: '',
    score: 0,
    ore: 0,
    runOre: 0,
    shield: 0,
    shieldMax: 0,
    weapon: 'pulse',
    weapons: [],
    heat: 0,
    vented: false,
    overcharge: 0,
    dashCharge: 0,
    dashMax: 0,
    rocks: 0,
    hazards: 0,
    livePickups: [],
    poolDrops: {},
    bossPhase: 0,
    bossHp: 0,
    bossHpMax: 0,
    runTime: 0,
    medal: 'none',
    salvage: 0,
    refits: { hull: 0, coil: 0, drive: 0, magnet: 0 },
    ladderStage: 0,
    ladderSeed: 0,
    unlocked: 1,
    medals: {},
    tutorialStep: -1,
    reducedMotion: false,
    // test switches: honoured by the boot fallback AND re-read live
    forceSector: 0,        // 1..5, 0 = off
    forceWave: 0,          // 1..8, 0 = off
    forceUnlockAll: false,
    forceGenerousDrops: false,
    forceWeapon: '',       // weapon id to grant immediately
    forceSkipTutorial: false,
    forceClearWave: false, // one-shot: clears the current wave
    forceInvincible: false
  };
  window.__hb = { state: HB_STATE };

  // URL switches are read once at boot and folded into the same state
  // object, so ?sector=4&wave=8 and window.__hb.state.forceSector are the
  // same lever from the scene's point of view.
  (function readUrlSwitches() {
    var q;
    try { q = new URLSearchParams(window.location.search); } catch (e) { return; }
    function num(k) { var v = parseInt(q.get(k), 10); return isFinite(v) ? v : 0; }
    if (q.has('sector')) HB_STATE.forceSector = clamp(num('sector'), 0, D.SECTORS.length);
    if (q.has('wave')) HB_STATE.forceWave = clamp(num('wave'), 0, D.WAVES_PER_SECTOR);
    if (q.get('unlock') === '1' || q.get('unlockall') === '1') HB_STATE.forceUnlockAll = true;
    if (q.get('drops') === '1') HB_STATE.forceGenerousDrops = true;
    if (q.get('notut') === '1') HB_STATE.forceSkipTutorial = true;
    if (q.get('invincible') === '1') HB_STATE.forceInvincible = true;
    if (q.has('weapon')) HB_STATE.forceWeapon = String(q.get('weapon') || '');
  }());

  // =====================================================================
  // 3. kit, tap layer, layout
  // =====================================================================
  var Game = { phaser: null, play: null, scene: null };

  var kit = window.GGKit.create({
    slug: 'hullbreaker',
    orientation: 'landscape',
    validateSave: function (o) {
      var ids = Object.create(null), medals = D.MEDAL_RANK;
      var i, k, v;
      // v4 is the shipped shape. Accept it long enough for loadSave() to
      // migrate it; malformed records still fall back to a fresh profile via
      // GGKit's guarded save reader.
      if (!o || (o.v !== 4 && o.v !== SAVE_VERSION) || !Number.isInteger(o.unlocked) ||
          o.unlocked < 1 || o.unlocked > D.SECTORS.length ||
          !o.best || Object.prototype.toString.call(o.best) !== '[object Object]' ||
          !o.medals || Object.prototype.toString.call(o.medals) !== '[object Object]') return false;
      for (i = 0; i < D.SECTORS.length; i++) ids[D.SECTORS[i].id] = true;
      for (k in o.best) {
        if (!ids[k]) return false;
        v = o.best[k];
        if (!Number.isFinite(v) || !Number.isSafeInteger(v) || v < 0) return false;
      }
      for (k in o.medals) {
        if (!ids[k] || !Object.prototype.hasOwnProperty.call(medals, o.medals[k])) return false;
      }
      if (o.tutorial != null && typeof o.tutorial !== 'boolean') return false;
      if (o.reducedMotion != null && typeof o.reducedMotion !== 'boolean') return false;
      if (o.seen != null && Object.prototype.toString.call(o.seen) !== '[object Object]') return false;
      if (o.v === SAVE_VERSION) {
        if (!Number.isSafeInteger(o.salvage) || o.salvage < 0 || o.salvage > 1000000) return false;
        if (!o.refits || Object.prototype.toString.call(o.refits) !== '[object Object]') return false;
        var refitIds = D.REFIT_ORDER || ['hull', 'coil', 'drive', 'magnet'];
        for (i = 0; i < refitIds.length; i++) {
          v = o.refits[refitIds[i]];
          if (!Number.isSafeInteger(v) || v < 0 || v > 3) return false;
        }
        if (!Number.isSafeInteger(o.ladderBest) || o.ladderBest < 0 || o.ladderBest > 1000000000) return false;
      }
      return true;
    },
    onPause: function () { if (Game.play) Game.play.onKitPause(); },
    onResume: function () { if (Game.play) Game.play.onKitResume(); },
    onRestart: function () { if (Game.play) Game.play.restartRun(); }
  });

  function loadSave() {
    var s = kit.save.get(null);
    var migrated = false;
    if (!s) s = {
      v: SAVE_VERSION, unlocked: 1, best: {}, medals: {}, tutorial: false,
      reducedMotion: false, seen: {}, salvage: 80,
      refits: { hull: 0, coil: 0, drive: 0, magnet: 0 }, ladderBest: 0
    };
    else if (s.v === 4) {
      // Preserve every v4 progression field, then add only the new economy
      // fields. Existing players get a small starter salvage reserve so the
      // refit loop is immediately playable without changing run controls.
      s = {
        v: SAVE_VERSION, unlocked: s.unlocked, best: s.best, medals: s.medals,
        tutorial: s.tutorial, reducedMotion: s.reducedMotion, seen: s.seen,
        salvage: 80, refits: { hull: 0, coil: 0, drive: 0, magnet: 0 }, ladderBest: 0
      };
      migrated = true;
    }
    if (!s.best) s.best = {};
    if (!s.medals) s.medals = {};
    if (!s.seen) s.seen = {};
    if (!Number.isSafeInteger(s.salvage) || s.salvage < 0) s.salvage = 0;
    if (!s.refits || Object.prototype.toString.call(s.refits) !== '[object Object]') {
      s.refits = { hull: 0, coil: 0, drive: 0, magnet: 0 };
    }
    (D.REFIT_ORDER || ['hull', 'coil', 'drive', 'magnet']).forEach(function (id) {
      if (!Number.isSafeInteger(s.refits[id])) s.refits[id] = 0;
      s.refits[id] = clamp(s.refits[id], 0, 3);
    });
    if (!Number.isSafeInteger(s.ladderBest) || s.ladderBest < 0) s.ladderBest = 0;
    if (!Number.isInteger(s.unlocked) || s.unlocked < 1) s.unlocked = 1;
    s.unlocked = clamp(Math.floor(s.unlocked), 1, D.SECTORS.length);
    if (typeof s.tutorial !== 'boolean') s.tutorial = false;
    if (typeof s.reducedMotion !== 'boolean') s.reducedMotion = false;
    s.v = SAVE_VERSION;
    if (migrated) { try { kit.save.set(s); } catch (e) {} }
    return s;
  }
  var PROFILE = loadSave();
  function saveProfile() { kit.save.set(PROFILE); }

  function unlockedCount() {
    return HB_STATE.forceUnlockAll ? D.SECTORS.length : PROFILE.unlocked;
  }

  // Weapons follow the unlock chain; a run can also be handed one by a drop.
  function unlockedWeapons() {
    var list = ['pulse'];
    var n = unlockedCount();
    for (var i = 0; i < D.SECTORS.length && i < n - 1; i++) {
      var w = D.SECTORS[i].weaponUnlock;
      if (w && list.indexOf(w) < 0) list.push(w);
    }
    return list;
  }

  // ------------------------------------------------------ reduced motion
  function systemReduced() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch (e) { return false; }
  }
  var REDUCED = PROFILE.reducedMotion || systemReduced();
  var juiceBeforeReduced = kit.juice.enabled;
  HB_STATE.reducedMotion = REDUCED;
  function setReduced(v) {
    var next = !!v;
    if (next && !REDUCED) juiceBeforeReduced = kit.juice.enabled;
    REDUCED = next;
    HB_STATE.reducedMotion = REDUCED;
    PROFILE.reducedMotion = REDUCED;
    saveProfile();
    kit.juice.enabled = REDUCED ? false : juiceBeforeReduced;
  }
  if (REDUCED) kit.juice.enabled = false;
  function fxCount(n) { return REDUCED ? Math.max(1, Math.round(n * 0.34)) : n; }
  function shake(mag, ms) { if (!REDUCED) kit.juice.shake(mag, ms); }
  function hitStop(ms) { if (!REDUCED) kit.juice.hitStop(ms); }

  function openSettings() {
    kit.openSettings([function (box, row) {
      row('Reduced motion', function () { return REDUCED; }, function (v) { setReduced(v); });
    }]);
  }

  // --------------------------------------------------------- tap layer
  // Every button in the game is hit-tested against kit.input.pointers. The
  // kit owns pointer lifecycle; this layer only turns its live map into
  // stable per-frame press/release records for the scene button code.
  var Tap = {
    rect: { left: 0, top: 0, width: 1, height: 1 },
    live: new Map(),      // id -> {x,y,sx,sy,claim}
    pressed: [],          // this frame's new pointers
    released: [],         // this frame's ended pointers
    refreshRect: function () {
      var c = Game.phaser && Game.phaser.canvas;
      if (!c) return;
      var r = c.getBoundingClientRect();
      this.rect = { left: r.left, top: r.top, width: r.width || 1, height: r.height || 1 };
    },
    make: function (id, cx, cy) {
      var gx = cx - this.rect.left, gy = cy - this.rect.top;
      return { x: gx, y: gy, sx: gx, sy: gy, claim: null, id: id };
    },
    update: function () {
      this.pressed.length = 0;
      this.released.length = 0;
      var src = kit.input.pointers;
      var seen = this.live;
      var tap = this;
      var i, rec;

      // Positions come from the kit map, which is the live authority. A
      // record first seen here is a press; a record absent on the next poll
      // is a release. No parallel DOM pointer state is maintained.
      src.forEach(function (p, key) {
        var r = seen.get(key);
        if (!r) {
          r = Tap.make(key, p.x, p.y);
          seen.set(key, r);
          Tap.pressed.push(r);
        } else { r.x = p.x - Tap.rect.left; r.y = p.y - Tap.rect.top; }
      });

      // Anything the kit dropped (up, cancel, blur, pause) is a release.
      var dead = null;
      seen.forEach(function (r, key) { if (!src.has(key)) (dead || (dead = [])).push(key); });
      if (dead) {
        for (i = 0; i < dead.length; i++) {
          tap.released.push(seen.get(dead[i]));
          seen.delete(dead[i]);
        }
      }
      return this;
    },
    clear: function () {
      this.live.clear();
      this.pressed.length = 0; this.released.length = 0;
    }
  };
  window.addEventListener('resize', function () { Tap.refreshRect(); });
  window.addEventListener('orientationchange', function () { Tap.refreshRect(); });

  // GGKit's shared input surface predates gamepad support. Keep the standard
  // browser poll behind kit.input so gameplay still has one input authority.
  kit.input.gamepad = function () {
    var pads, i, p;
    try { pads = window.navigator && window.navigator.getGamepads && window.navigator.getGamepads(); }
    catch (e) { return null; }
    if (!pads) return null;
    for (i = 0; i < pads.length; i++) {
      p = pads[i];
      if (p && p.connected) {
        return {
          axes: [p.axes[0] || 0, p.axes[1] || 0],
          buttons: [0, 1, 4, 5, 7, 9, 14, 15].map(function (n) {
            var b = p.buttons[n];
            return !!(b && (b.pressed || b.value > 0.5));
          })
        };
      }
    }
    return null;
  };

  function inCircle(p, c) {
    var dx = p.x - c.x, dy = p.y - c.y;
    return dx * dx + dy * dy <= c.r * c.r;
  }
  function inRect(p, r) {
    return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  }

  // --------------------------------------------------------- safe area
  function safeInsets() {
    var cs;
    try { cs = window.getComputedStyle(document.body); } catch (e) { return { t: 0, r: 0, b: 0, l: 0 }; }
    function px(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }
    return { t: px(cs.paddingTop), r: px(cs.paddingRight), b: px(cs.paddingBottom), l: px(cs.paddingLeft) };
  }

  // =====================================================================
  // 4. scenes: boot, title, select
  // =====================================================================
  var FONT = 'Verdana, Geneva, system-ui, sans-serif';

  function txt(scene, x, y, s, size, color, weight) {
    var t = scene.add.text(x, y, s, {
      fontFamily: FONT, fontSize: Math.round(size) + 'px', color: color || '#dff4ff',
      fontStyle: weight || '700'
    });
    t.__hbText = s;
    return t;
  }

  // Every gameplay sprite lives in one atlas. A belt field mixes five rock
  // textures at once, and as separate images that was five batch flushes
  // per frame; from the atlas the whole field is one draw call.
  // Two sheets: the rock families, and everything else. A frame is resolved
  // through OWNER once at boot, so a lookup is a map hit rather than a
  // texture scan, and an unknown frame lands on the placeholder.
  var ATLASES = ['atlas', 'atlas2'];
  var OWNER = Object.create(null);
  var ASSET_IMAGES = ['stars', 'neb', 'logo'];

  var BootScene = {
    key: 'Boot',
    preload: function () {
      kit.loader.show('HULLBREAKER');
      var scene = this;
      this.load.on('progress', function (p) { kit.loader.progress(p); });
      var i;
      this.load.atlas('atlas', 'assets/atlas.png', 'assets/atlas.json');
      this.load.atlas('atlas2', 'assets/atlas2.png', 'assets/atlas2.json');
      for (i = 0; i < ASSET_IMAGES.length; i++) this.load.image(ASSET_IMAGES[i], 'assets/' + ASSET_IMAGES[i] + '.png');
      this.load.on('loaderror', function (f) {
        // A missing texture must not take the boot down: the scene falls
        // back to a generated placeholder in create().
        if (window.console) console.warn('hullbreaker: asset missing', f && f.key);
      });
    },
    create: function () {
      // guaranteed placeholder for any texture that failed to load
      var g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0x7fa8c0, 1); g.fillCircle(16, 16, 15);
      g.lineStyle(2, 0xdff4ff, 1); g.strokeCircle(16, 16, 15);
      g.generateTexture('__missing', 32, 32);
      g.destroy();

      // frame ownership map, built once from whatever actually loaded
      for (var ai = 0; ai < ATLASES.length; ai++) {
        var key = ATLASES[ai];
        if (!this.textures.exists(key)) continue;
        var names = this.textures.get(key).getFrameNames();
        for (var fi = 0; fi < names.length; fi++) OWNER[names[fi]] = key;
      }

      kit.audio.register({
        pulse: 'assets/sfx_pulse.mp3', spread: 'assets/sfx_spread.mp3',
        laser: 'assets/sfx_laser.mp3', homing: 'assets/sfx_homing.mp3',
        fracBig: 'assets/sfx_frac_big.mp3', fracMed: 'assets/sfx_frac_med.mp3',
        fracSmall: 'assets/sfx_frac_small.mp3', dash: 'assets/sfx_dash.mp3',
        shield: 'assets/sfx_shield.mp3', critical: 'assets/sfx_critical.mp3',
        ore: 'assets/sfx_ore.mp3', pickup: 'assets/sfx_pickup.mp3',
        upgrade: 'assets/sfx_upgrade.mp3', banner: 'assets/sfx_banner.mp3',
        boss: 'assets/sfx_boss.mp3', ui: 'assets/sfx_ui.mp3',
        overheat: 'assets/sfx_overheat.mp3', medal: 'assets/sfx_medal.mp3',
        lose: 'assets/sfx_lose.mp3', engine: 'assets/sfx_engine.mp3',
        musicField: 'assets/music_field.mp3', musicBoss: 'assets/music_boss.mp3',
        musicIntensity: 'assets/music_intensity.mp3'
      });
      kit.loader.hide();
      Tap.refreshRect();
      HB_STATE.ready = true;
      HB_STATE.unlocked = unlockedCount();
      HB_STATE.medals = PROFILE.medals;
      this.scene.start('Title');
    }
  };

  function tex(scene, key) {
    return scene.textures.exists(key) ? key : '__missing';
  }

  // Guarded atlas lookup. A frame that is not in the atlas resolves to the
  // generated placeholder rather than throwing inside the renderer, which
  // is what a missing keyed lookup has cost this fleet before.
  function frameOwner(frame) { return OWNER[frame] || null; }
  function frameOk(scene, frame) { return !!OWNER[frame]; }
  function img(scene, x, y, frame) {
    var own = OWNER[frame];
    if (own) return scene.add.image(x, y, own, frame);
    return scene.add.image(x, y, '__missing');
  }
  function setFrame(spr, scene, frame) {
    var own = OWNER[frame];
    if (own) {
      if (spr.texture.key !== own) spr.setTexture(own, frame);
      else if (spr.frame.name !== frame) spr.setFrame(frame);
    } else if (spr.texture.key !== '__missing') {
      spr.setTexture('__missing');
    }
    return spr;
  }

  // Shared starfield + nebula backdrop used by every scene.
  //
  // Fill rate is the dominant cost on a soft rasteriser, so the backdrop is
  // exactly two full-screen quads: the base colour comes from the camera
  // (free) and the two parallax planes are packed into one star layer plus
  // the nebula.
  function makeBackdrop(scene, sector) {
    var W = scene.scale.width, H = scene.scale.height;
    var base = sector ? sector.bg : 0x081420;
    scene.cameras.main.setBackgroundColor(base);
    var neb = scene.add.tileSprite(0, 0, W, H, tex(scene, 'neb'))
      .setOrigin(0).setDepth(-90).setAlpha(0.5)
      .setBlendMode(Phaser.BlendModes.ADD);
    if (sector) neb.setTint(sector.neb);
    var near = scene.add.tileSprite(0, 0, W, H, tex(scene, 'stars'))
      .setOrigin(0).setDepth(-70).setAlpha(0.9);
    if (sector) near.setTint(sector.star);
    return {
      neb: neb, near: near,
      resize: function (w, h) { neb.setSize(w, h); near.setSize(w, h); },
      tick: function (dt, vx, vy) {
        if (REDUCED || !dt) return;
        neb.tilePositionX += vx * dt * 0.03; neb.tilePositionY += vy * dt * 0.03;
        near.tilePositionX += vx * dt * 0.14; near.tilePositionY += vy * dt * 0.14;
      },
      setSector: function (s) {
        scene.cameras.main.setBackgroundColor(s.bg);
        neb.setTint(s.neb); near.setTint(s.star);
      }
    };
  }

  window.HB_INTERNAL = {
    D: D, STEP: STEP, MAX_STEPS: MAX_STEPS, SHIP: SHIP,
    HEAT_CAP: HEAT_CAP, HEAT_COOL: HEAT_COOL, HEAT_COOL_FIRING: HEAT_COOL_FIRING,
    VENT_LOCK: VENT_LOCK, MAGNET_R: MAGNET_R, DROP_LIFE: DROP_LIFE,
    OVERCHARGE_TIME: OVERCHARGE_TIME,
    MAX_ROCKS: MAX_ROCKS, MAX_SHOTS: MAX_SHOTS, MAX_PICKUPS: MAX_PICKUPS,
    MAX_HAZARDS: MAX_HAZARDS, MAX_GHOSTS: MAX_GHOSTS,
    clamp: clamp, lerp: lerp, angDiff: angDiff, wrapDelta: wrapDelta,
    mulberry32: mulberry32, rngRange: rngRange, rngPick: rngPick,
    setTextIfChanged: setTextIfChanged, setColorIfChanged: setColorIfChanged,
    pad: pad, mmss: mmss,
    HB_STATE: HB_STATE, Game: Game, kit: kit, Tap: Tap,
    PROFILE: PROFILE, saveProfile: saveProfile,
    unlockedCount: unlockedCount, unlockedWeapons: unlockedWeapons,
    isReduced: function () { return REDUCED; }, setReduced: setReduced,
    fxCount: fxCount, shake: shake, hitStop: hitStop, openSettings: openSettings,
    inCircle: inCircle, inRect: inRect, safeInsets: safeInsets,
    FONT: FONT, txt: txt, tex: tex, ATLASES: ATLASES, frameOwner: frameOwner,
    frameOk: frameOk, img: img, setFrame: setFrame, makeBackdrop: makeBackdrop,
    BootScene: BootScene
  };
}());
