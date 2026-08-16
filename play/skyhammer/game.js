/* Skyhammer - game.js
 * Phaser 3 vertical bullet hell. Portrait. GGKit owns lifecycle, pause,
 * input identity, saves, audio and the juice budget; nothing in this file
 * re-implements any of those.
 *
 * ARCHITECTURE, and the defect classes each decision exists to prevent:
 *
 *  FIXED SIM STEP. The sim runs at a fixed 60 Hz accumulator. When a
 *  degraded device cannot keep up, the leftover accumulator is DISCARDED,
 *  which makes the game run in slow motion. No clock in this file is allowed
 *  to advance past the stepped sim, so a stall can never become a time skip:
 *  simT advances only inside step(), artT advances only inside step(), and
 *  hit-stop halts simT while artT keeps running.
 *
 *  RENDER STATE IS NEVER ON THE SIM ENTITY. Bullets are Blitter Bobs and
 *  enemies are Sprites, but every one of them is index-paired with a plain
 *  record in a preallocated array. The renderer object holds no gameplay
 *  fields and the gameplay record holds no Phaser object.
 *
 *  ONE POOL, INCLUDING FOR DEBUG. window.__sh.state is a single preallocated
 *  object, created before Phaser boots and mutated in place by the live
 *  scene. A harness reading it can never truncate or alias a live pool.
 *
 *  NO LIVE GRAPHICS. Phaser Graphics replays its whole command list every
 *  frame and Graphics.arc walks a sweep in 0.01 rad steps. Every ring,
 *  plate, band, button and shockwave in this game is a texture baked once by
 *  sh_art.js and drawn as an Image. There is not one Graphics object here.
 *
 *  GUARDED KEYED LOOKUPS. Every variant lookup (pattern kind, enemy kind,
 *  bullet lane, boss art, stage index, save field) resolves through an
 *  accessor with a fallback. A FAMILY[variant] miss hard-froze a shipped
 *  title in this fleet and it does not get to happen twice.
 *
 *  SCENE EVENTS. Phaser Scene Systems emits 'prerender' and 'render', never
 *  'postrender'. This file subscribes to neither; all drawing is game
 *  objects, so there is no callback to lose.
 */
(function () {
  'use strict';

  /* ====================================================== constants */
  var TAU = Math.PI * 2;
  var STEP = 1 / 60;
  var MAX_STEPS = 5;
  var SAVE_VERSION = 1;

  var GW = 360;
  var GH = (function () {
    var w = window.innerWidth || 360, h = window.innerHeight || 640;
    var v = Math.round(360 * (h / Math.max(1, w)));
    return Math.max(560, Math.min(800, v));
  })();
  // Skyhammer designs at a FIXED 360-wide world and fits it to the panel, so
  // on a 390 CSS-pt phone the FIT upscale (390/360 = 1.083) happens BEFORE the
  // display's own dpr. GGKit.hiDpi.factor() clamps its result at dpr, which is
  // right when the design box is WIDER than the display box but leaves this
  // title 8% short: 360 x 3 = 1080 backing pixels spread over a 390-pt box is
  // 2.77x, not native. The correct multiplier on the DESIGN width is
  // (displayed CSS width * dpr) / designWidth, i.e. factor() without the upper
  // clamp, which lands the backing store exactly on the panel's pixel count
  // (1170 x 2530 for 390 x 844 @3) and never above it.
  var RETINA_FACTOR = (function () {
    var d = GGKit.hiDpi.dpr();
    var clamped = GGKit.hiDpi.factor(GW, GH);
    var vw = window.innerWidth || GW, vh = window.innerHeight || GH;
    var shownW = Math.min(vw, vh * (GW / GH));
    var exact = (shownW * d) / GW;
    return Math.max(1, clamped, isFinite(exact) ? exact : 1);
  })();

  /* Pool ceilings. Pools grow one object at a time on demand so the first
   * frame never builds hundreds of game objects at once. */
  var MAX_EB = 1100;      // enemy bullets on screen
  var MAX_PB = 220;       // player shots
  var MAX_EN = 44;        // enemies
  var MAX_DROPS = 26;
  var MAX_PODS = 6;
  var INIT_EB = 220, INIT_PB = 48, INIT_EN = 12, INIT_DROPS = 6;

  var PLAYER_R = 2.6;         // the true hitbox, shown in focus mode
  var GRAZE_R = 12.5;
  var GRAZE_R_FOCUS = 16.0;
  var MULT_MAX = 8;
  var METER_MAX = 90;
  var METER_DECAY = 5;        // per second
  var METER_PER_GRAZE = 2.5;
  var MAX_POWER = 5;
  var MAX_BOMBS = 5;
  var MAX_LIVES = 6;
  var START_LIVES = 3;
  var START_BOMBS = 3;
  var CONTINUES = 3;
  var GRAZE_LOG = 96;         // bounded ring buffer of graze times

  var CSS = SHArt.CSS;
  var FONT = 'Verdana, Geneva, system-ui, sans-serif';

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function pad(n, w) {
    var s = String(Math.max(0, Math.round(n)));
    while (s.length < w) s = '0' + s;
    return s;
  }
  function commas(n) {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /* =================================================== debug / verify */
  /* Boot fallback AND the live scene share this exact object, so a harness
   * that probes before PlayScene exists still reads and writes the same
   * switches the scene will honour. */
  var SH_STATE = {
    ready: false,
    mode: 'menu',            // menu | run | rush | 1cc
    scene: 'boot',
    stage: 0,
    stageKey: '',
    stageName: '',
    phase: 'boot',           // intro | waves | warn | boss | clear | dead | over | win
    lives: 0,
    bombs: 0,
    power: 1,
    multiplier: 1,
    meter: 0,
    graze: 0,
    score: 0,
    best: 0,
    bossPhase: -1,
    bossHp: 0,
    bossMaxHp: 0,
    bossName: '',
    podsAlive: 0,
    bullets: 0,
    medals: [0, 0, 0, 0, 0],
    unlocks: { bossRush: false, ironMeridian: false, finale: false, oneCC: false },
    seed: 0,
    noContinue: true,
    reducedMotion: false,
    // ---- test switches, honoured by the orchestrator ----
    forceStage: null,        // number: begin a run at this stage index
    forceBoss: false,        // skip the wave block, go straight to the boss
    forceGenerousDrops: false,
    forceUnlockAll: false,
    forceGrazeGate: false
  };
  if (typeof window !== 'undefined') window.__sh = { state: SH_STATE };

  /* ============================================================ kit */
  var kit = GGKit.create({
    slug: 'skyhammer',
    orientation: 'portrait',
    validateSave: function (o) {
      return !!o && typeof o === 'object' && o.v === SAVE_VERSION && Object.prototype.toString.call(o.medals) === '[object Array]';
    },
    onPause: function () { if (activePlay) activePlay.onKitPause(); },
    onResume: function () { if (activePlay) activePlay.onKitResume(); },
    onRestart: function () { if (activePlay) activePlay.onKitRestart(); }
  });

  var activePlay = null;

  /* ----------------------------------------------------------- save */
  var DEFAULT_SAVE = {
    v: SAVE_VERSION, best: 0, medals: [0, 0, 0, 0, 0],
    cleared: false, oneCC: false, runs: 0, totalGraze: 0, lastSeed: 0
  };
  function loadSave() {
    var raw = kit.save.get(null);
    var s = { v: SAVE_VERSION, best: 0, medals: [0, 0, 0, 0, 0], cleared: false, oneCC: false, runs: 0, totalGraze: 0, lastSeed: 0 };
    if (raw && typeof raw === 'object') {
      s.best = Math.max(0, Math.min(99999999, raw.best | 0));
      s.cleared = !!raw.cleared;
      s.oneCC = !!raw.oneCC;
      s.runs = Math.max(0, Math.min(999999, raw.runs | 0));
      s.totalGraze = Math.max(0, Math.min(99999999, raw.totalGraze | 0));
      s.lastSeed = raw.lastSeed >>> 0;
      if (Object.prototype.toString.call(raw.medals) === '[object Array]') {
        for (var i = 0; i < 5; i++) {
          // Every persisted id is range checked against the live registry.
          var m = raw.medals[i] | 0;
          s.medals[i] = (m >= 0 && m <= 3) ? m : 0;
        }
      }
    }
    return s;
  }
  var save = loadSave();
  function persist() {
    save.v = SAVE_VERSION;
    kit.save.set(save);
    syncMeta();
  }
  function syncMeta() {
    SH_STATE.best = save.best;
    for (var i = 0; i < 5; i++) SH_STATE.medals[i] = save.medals[i] | 0;
    var u = SHContent.unlocks(SH_STATE.forceUnlockAll ? { cleared: true, medals: [3, 3, 3, 3, 3] } : save);
    SH_STATE.unlocks.bossRush = u.bossRush;
    SH_STATE.unlocks.ironMeridian = u.ironMeridian;
    SH_STATE.unlocks.finale = u.finale;
    SH_STATE.unlocks.oneCC = u.oneCC;
  }
  function effectiveSave() {
    return SH_STATE.forceUnlockAll ? { cleared: true, medals: [3, 3, 3, 3, 3] } : save;
  }
  syncMeta();

  /* -------------------------------------------------- accessibility */
  /* ONE motion switch. kit.juice.enabled is GGKit's shake and hit-stop flag,
   * and this title routes its own banner overshoot, flashes, particle counts
   * and score pops through the same boolean, so the accessibility toggle
   * really covers everything the player sees.
   *
   * The OS preference drives that switch rather than being a second, parallel
   * condition. An earlier version asked "is juice enabled AND is the OS not
   * asking for reduce", which could never fire: GGKit's default for juice is
   * already true, so there was no value that meant "the player has not
   * chosen". Forcing the switch off when the OS asks, and letting the
   * Settings row turn it back on for the session, is unambiguous. */
  var reduceQuery = (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)')) || null;
  function applyOsReduce() {
    if (reduceQuery && reduceQuery.matches) kit.juice.enabled = false;
  }
  applyOsReduce();
  if (reduceQuery) {
    if (reduceQuery.addEventListener) reduceQuery.addEventListener('change', applyOsReduce);
    else if (reduceQuery.addListener) reduceQuery.addListener(applyOsReduce);
  }
  function motionOn() { return kit.juice.enabled !== false; }
  function fxCount(n) { return motionOn() ? n : Math.max(1, Math.round(n * 0.3)); }
  SH_STATE.reducedMotion = !motionOn();

  /* -------------------------------------------------- input mapping */
  /* GGKit tracks pointers in CSS pixels. Phaser's scale manager converts to
   * game units. Doing it here means the ship's 1:1 drag is 1:1 on the actual
   * glass, not 1:1 in an arbitrary virtual space. */
  var gameRef = null;
  function pxToGame(cx, cy, out) {
    out = out || { x: 0, y: 0 };
    var sm = gameRef && gameRef.scale;
    if (!sm) { out.x = cx; out.y = cy; return out; }
    var b = sm.canvasBounds, d = sm.displayScale;
    out.x = (cx + (window.pageXOffset || 0) - b.x) * d.x;
    out.y = (cy + (window.pageYOffset || 0) - b.y) * d.y;
    return out;
  }
  var _tmpPt = { x: 0, y: 0 };

  /* Edge-triggered keys. The keydown listener lives in GGKit and only sets
   * a flag; the fixed sim step consumes the edge exactly once, which is the
   * queued-fire race fix carried across this fleet. */
  var keyPrev = {};
  function keyEdge(code) {
    var now = kit.input.keyDown(code);
    var was = !!keyPrev[code];
    keyPrev[code] = now;
    return now && !was;
  }
  function keyHeld(code) { return kit.input.keyDown(code); }
  function anyKeyEdge(codes) {
    var hit = false;
    for (var i = 0; i < codes.length; i++) if (keyEdge(codes[i])) hit = true;
    return hit;
  }

  /* --------------------------------------------------------- gamepad bridge */
  /* GGKit owns keyboard and pointer identity. The browser is the only
   * portable source for a controller, so this small adapter turns the first
   * connected pad into the same fixed-step axes and edges used by PlayScene. */
  function padButton(gp, i) {
    return !!(gp && gp.buttons && gp.buttons[i] && gp.buttons[i].pressed);
  }
  function padAxis(v) {
    v = Number(v) || 0;
    if (Math.abs(v) < 0.18) return 0;
    var sign = v < 0 ? -1 : 1;
    return sign * ((Math.abs(v) - 0.18) / 0.82);
  }
  function readGamepad() {
    var empty = { connected: false, x: 0, y: 0, focus: false, bomb: false, pause: false };
    if (!navigator.getGamepads) return empty;
    var pads;
    try { pads = navigator.getGamepads(); } catch (e) { return empty; }
    var gp = null;
    for (var i = 0; i < pads.length; i++) {
      if (pads[i] && pads[i].connected) { gp = pads[i]; break; }
    }
    if (!gp) return empty;
    var x = padAxis(gp.axes && gp.axes[0]);
    var y = padAxis(gp.axes && gp.axes[1]);
    if (padButton(gp, 14)) x = -1;
    if (padButton(gp, 15)) x = 1;
    if (padButton(gp, 12)) y = -1;
    if (padButton(gp, 13)) y = 1;
    return {
      connected: true, x: clamp(x, -1, 1), y: clamp(y, -1, 1),
      focus: padButton(gp, 1) || padButton(gp, 4) || padButton(gp, 5),
      bomb: padButton(gp, 0) || padButton(gp, 2),
      pause: padButton(gp, 9)
    };
  }

  /* ------------------------------------------------- text utilities */
  function mkText(scene, x, y, str, size, color, align, weight) {
    var t = scene.add.text(x, y, str, {
      fontFamily: FONT, fontSize: size + 'px',
      fontStyle: weight || '700', color: color || CSS.text, resolution: RETINA_FACTOR
    });
    t.setOrigin(align === 'center' ? 0.5 : (align === 'right' ? 1 : 0), 0.5);
    // Keep text at the title's measured retina factor so HUD glyphs are baked
    // at device density while their design-space positions remain unchanged.
    return t;
  }
  function setTextIfChanged(obj, value) {
    var next = String(value);
    if (obj.__lastText !== next) { obj.__lastText = next; obj.setText(next); }
    return obj;
  }
  /* A row of pooled glyph Images from the baked font atlas. Every HUD value
   * that changes during play uses one of these instead of a Text object: a
   * Text setText rebuilds a canvas and re-uploads a texture, which is a
   * per-frame cost the score readout alone would pay forever. */
  function makeGlyphRow(scene, x, y, maxChars, scale, tint, align, depth) {
    var imgs = [], i;
    for (i = 0; i < maxChars; i++) {
      var im = scene.add.image(-200, -200, 'sh_font', 'g_0');
      im.setOrigin(0, 0.5).setScale(scale).setTint(tint).setDepth(depth).setVisible(false);
      imgs.push(im);
    }
    var cw = SHArt.FCELL_W * scale;
    var lastText = null, lastTint = tint, baseScale = scale;
    return {
      imgs: imgs,
      width: function () { return (lastText ? Math.min(lastText.length, maxChars) : 0) * cw; },
      setText: function (str) {
        str = String(str);
        if (str === lastText) return;
        lastText = str;
        var n = Math.min(str.length, maxChars);
        var total = n * cw;
        var sx = align === 'right' ? x - total : (align === 'center' ? x - total / 2 : x);
        for (var k = 0; k < maxChars; k++) {
          var g = imgs[k];
          if (k >= n) { if (g.visible) g.visible = false; continue; }
          var f = SHArt.fontFrame(str.charAt(k));
          if (g.frame.name !== f) g.setFrame(f);
          g.x = sx + k * cw;
          g.y = y;
          if (!g.visible) g.visible = true;
        }
      },
      setTint: function (c) {
        if (c === lastTint) return;
        lastTint = c;
        for (var k = 0; k < imgs.length; k++) imgs[k].setTint(c);
      },
      pop: function (scene2, mag) {
        for (var k = 0; k < imgs.length; k++) {
          if (!imgs[k].visible) continue;
          imgs[k].setScale(baseScale * mag);
          scene2.tweens.killTweensOf(imgs[k]);
          scene2.tweens.add({ targets: imgs[k], scaleX: baseScale, scaleY: baseScale, duration: 220, ease: 'Back.easeOut' });
        }
      },
      setVisible: function (v) { for (var k = 0; k < imgs.length; k++) imgs[k].setVisible(v && !!lastText); }
    };
  }

  function setColorIfChanged(obj, color) {
    // setColor has the same change guard as setText: both rebuild the text
    // canvas, and a per-frame colour write is as expensive as a text write.
    if (obj.__lastColor !== color) { obj.__lastColor = color; obj.setColor(color); }
    return obj;
  }

  /* ================================================== boot scene */
  var BootScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function BootScene() { Phaser.Scene.call(this, { key: 'Boot' }); },

    create: function () {
      this.cameras.main.setZoom(RETINA_FACTOR); this.cameras.main.centerOn(GW / 2, GH / 2);
      SH_STATE.scene = 'boot';
      kit.loader.show('SKYHAMMER');
      kit.loader.progress(0.1);
      var self = this;
      // Baking every texture in one frame would be the worst frame in the
      // trace, so the work is split across ticks with the loader visible.
      var audioNames = [];
      var steps = [
        function () {
          SHArt.build(self, GW, GH);
          var required = ['sh_ship', 'sh_flame', 'sh_enemies', 'sh_pods',
            'sh_drops', 'sh_bullets', 'sh_font', 'sh_white', 'sh_hudtop',
            'sh_hudbot', 'sh_bombbtn', 'sh_focusring', 'sh_hitdot', 'sh_shock',
            'sh_banner', 'sh_plate', 'sh_medal', 'sh_pip', 'sh_gate', 'sh_vig',
            'sh_logo', 'sh_bg_far', 'sh_bg_near', 'sh_bg_neb', 'sh_bg_band'];
          for (var r = 0; r < required.length; r++) {
            if (!self.textures.exists(required[r])) throw new Error('Missing texture ' + required[r]);
          }
          for (r = 0; r < SHArt.BOSS_KEYS.length; r++) {
            if (!self.textures.exists('sh_boss_' + SHArt.BOSS_KEYS[r])) {
              throw new Error('Missing boss texture ' + SHArt.BOSS_KEYS[r]);
            }
          }
        },
        function () {
          audioNames = SHArt.buildAudio(kit);
          if (!audioNames || audioNames.length < 1) throw new Error('Audio registration failed');
          return kit.audio.preload(audioNames);
        },
        function () { kit.registerPWA(); }
      ];
      var i = 0, busy = false, failed = false, retryClaimed = false;
      function showFailure(error) {
        failed = true;
        SH_STATE.ready = false;
        SH_STATE.scene = 'boot-error';
        kit.loader.hide();
        var detail = error && error.message ? error.message : 'Unknown startup error';
        var title = self.add.text(GW / 2, GH * 0.34, 'SKYHAMMER COULD NOT START', {
          fontFamily: FONT, fontSize: '18px', fontStyle: '700', color: CSS.rose,
          align: 'center', resolution: RETINA_FACTOR
        }).setOrigin(0.5);
        var body = self.add.text(GW / 2, GH * 0.47,
          'Startup stopped safely.\nTap or press ENTER to retry.', {
            fontFamily: FONT, fontSize: '12px', fontStyle: '400', color: CSS.text,
            align: 'center', wordWrap: { width: GW - 44 }, resolution: RETINA_FACTOR
          }).setOrigin(0.5);
        var cause = self.add.text(GW / 2, GH * 0.62, detail.slice(0, 100), {
          fontFamily: FONT, fontSize: '9px', fontStyle: '400', color: CSS.dim,
          align: 'center', wordWrap: { width: GW - 52 }, resolution: RETINA_FACTOR
        }).setOrigin(0.5);
        self.bootErrorText = [title, body, cause];
      }
      function run() {
        if (failed || busy) return;
        if (i >= steps.length) {
          kit.loader.progress(1);
          kit.loader.hide();
          SH_STATE.ready = true;
          self.scene.start('Menu');
          return;
        }
        busy = true;
        Promise.resolve().then(steps[i]).then(function () {
          busy = false;
          i++;
          kit.loader.progress(0.1 + 0.9 * (i / steps.length));
          self.time.delayedCall(16, run);
        }).catch(showFailure);
      }
      this.time.delayedCall(16, run);
    },

    update: function () {
      if (!this.bootErrorText || this.bootRetryClaimed) return;
      var pressed = false;
      kit.input.pointers.forEach(function () { pressed = true; });
      if (pressed || anyKeyEdge(['Enter', 'KeyR'])) {
        this.bootRetryClaimed = true;
        kit.restart();
        this.scene.restart();
      }
    }
  });

  /* ================================================== menu scene */
  var MenuScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function MenuScene() { Phaser.Scene.call(this, { key: 'Menu' }); },

    create: function () {
      this.cameras.main.setZoom(RETINA_FACTOR); this.cameras.main.centerOn(GW / 2, GH / 2);
      SH_STATE.scene = 'menu';
      SH_STATE.mode = 'menu';
      SH_STATE.phase = 'menu';
      syncMeta();
      var self = this;
      this.claimed = {};
      this.cursor = 0;

      this.cameras.main.setBackgroundColor(CSS.ink);

      // Backdrop. Tile sprites, not Graphics.
      var th = SHContent.stageAt(0).theme;
      this.neb = this.add.tileSprite(0, 0, GW, GH, 'sh_bg_neb').setOrigin(0, 0).setTint(th.neb).setAlpha(0.42);
      this.far = this.add.tileSprite(0, 0, GW, GH, 'sh_bg_far').setOrigin(0, 0).setTint(th.star).setAlpha(0.6);
      this.near = this.add.tileSprite(0, 0, GW, GH, 'sh_bg_near').setOrigin(0, 0).setTint(0xffffff).setAlpha(0.5);

      var logo = this.add.image(GW / 2, 92, 'sh_logo');
      logo.setScale(Math.min(1, (GW * 0.9) / 320));
      if (motionOn()) {
        this.tweens.add({ targets: logo, y: 96, duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }

      mkText(this, GW / 2, 152, 'BEST  ' + commas(save.best), 12, CSS.amber, 'center');

      // Medal row.
      var mrow = 196;
      mkText(this, GW / 2, mrow - 22, 'STAGE MEDALS', 9, CSS.dim, 'center');
      var names = ['I', 'II', 'III', 'IV', 'PRIME'];
      for (var m = 0; m < 5; m++) {
        var mx = GW / 2 + (m - 2) * 44;
        var img = this.add.image(mx, mrow, 'sh_medal', 'medal_' + SHContent.medalName(save.medals[m] | 0));
        img.setScale(0.9);
        mkText(this, mx, mrow + 20, names[m], 8, CSS.dim, 'center', '400');
      }

      // Mode buttons.
      var u = SHContent.unlocks(effectiveSave());
      this.buttons = [];
      var by = 258;
      this.addButton(GW / 2, by, 'STAGE RUN', 'Seeded stages, continues allowed', true, function () {
        self.launch('run');
      });
      this.addButton(GW / 2, by + 62, 'BOSS RUSH', u.bossRush ? 'Every boss, back to back' : 'Locked: clear a Stage Run', u.bossRush, function () {
        self.launch('rush');
      });
      this.addButton(GW / 2, by + 124, '1CC CHALLENGE', u.oneCC ? 'No continues. The top medal.' : 'Locked: clear a Stage Run', u.oneCC, function () {
        self.launch('1cc');
      });

      var hy = by + 186;
      this.hint = mkText(this, GW / 2, hy, SHContent.unlockHint(effectiveSave()), 9.5, CSS.mint, 'center', '400');
      this.hint.setWordWrapWidth(GW - 40);
      this.hint.setAlign('center');

      mkText(this, GW / 2, hy + 30,
        'Drag anywhere to fly. Second finger holds FOCUS.', 9.5, CSS.text, 'center', '400');
      mkText(this, GW / 2, hy + 46,
        'Tap BOMB to clear the screen. Fire is automatic.', 9.5, CSS.text, 'center', '400');
      mkText(this, GW / 2, hy + 62,
        'Keys: arrows or WASD, Shift focus, Space bomb.', 9, CSS.dim, 'center', '400');
      mkText(this, GW / 2, hy + 80,
        'Skim bullets to graze and drive the multiplier to x8.', 9.5, CSS.amber, 'center', '400');
      mkText(this, GW / 2, hy + 106,
        'RUNS CLEARED ' + save.runs + '     LIFETIME GRAZE ' + commas(save.totalGraze),
        8.5, CSS.dim, 'center', '400');

      this.addButton(GW / 2, GH - 46, 'SETTINGS', '', true, function () {
        kit.audio.sfx('ui');
        kit.openSettings();
      }, 0.7);

      this.selectMark = this.add.image(0, 0, 'sh_medal', 'medal_gold').setScale(0.6).setAlpha(0.9);
      this.updateCursor();

      kit.audio.music('m_menu', 900);

      this.events.once('shutdown', function () { self.claimed = {}; });
    },

    addButton: function (x, y, label, sub, enabled, onTap, scale) {
      var s = scale || 1;
      var w = Math.min(300, GW - 44), h = 50 * s;
      var plate = this.add.image(x, y, 'sh_plate');
      plate.setDisplaySize(w, h);
      plate.setAlpha(enabled ? 0.95 : 0.45);
      var t = mkText(this, x, y - (sub ? 7 : 0), label, 16 * s, enabled ? CSS.text : CSS.dim, 'center');
      if (sub) mkText(this, x, y + 12, sub, 8.5, enabled ? CSS.dim : SHArt.mix(CSS.dim, CSS.ink, 0.4), 'center', '400');
      this.buttons.push({
        x: x, y: y, w: w, h: h, enabled: enabled, onTap: onTap, plate: plate, label: t
      });
      return this.buttons.length - 1;
    },

    updateCursor: function () {
      var b = this.buttons[this.cursor];
      if (!b) return;
      this.selectMark.setPosition(b.x - b.w / 2 - 12, b.y);
    },

    launch: function (mode) {
      kit.audio.sfx('ui');
      var seed = (Math.random() * 0xFFFFFFFF) >>> 0;
      save.lastSeed = seed;
      persist();
      this.scene.start('Play', { mode: mode, seed: seed });
    },

    update: function (time, delta) {
      if (kit.paused) return;
      var sp = (delta || 16) / 1000;
      this.neb.tilePositionY -= 6 * sp;
      this.far.tilePositionY -= 16 * sp;
      this.near.tilePositionY -= 42 * sp;

      // Pointer taps: a pointer id appearing in the kit map is a press.
      var self = this;
      var live = {};
      kit.input.pointers.forEach(function (p, id) {
        live[id] = true;
        if (self.claimed[id]) return;
        self.claimed[id] = true;
        pxToGame(p.x, p.y, _tmpPt);
        for (var i = 0; i < self.buttons.length; i++) {
          var b = self.buttons[i];
          if (_tmpPt.x >= b.x - b.w / 2 && _tmpPt.x <= b.x + b.w / 2 &&
              _tmpPt.y >= b.y - b.h / 2 && _tmpPt.y <= b.y + b.h / 2) {
            self.cursor = i; self.updateCursor();
            if (b.enabled) { b.onTap(); } else { kit.audio.sfx('hit'); }
            return;
          }
        }
      });
      for (var id in this.claimed) if (!live[id]) delete this.claimed[id];

      if (anyKeyEdge(['ArrowDown', 'KeyS'])) {
        this.cursor = (this.cursor + 1) % this.buttons.length; this.updateCursor(); kit.audio.sfx('ui');
      }
      if (anyKeyEdge(['ArrowUp', 'KeyW'])) {
        this.cursor = (this.cursor + this.buttons.length - 1) % this.buttons.length; this.updateCursor(); kit.audio.sfx('ui');
      }
      if (anyKeyEdge(['Enter', 'Space'])) {
        var b = this.buttons[this.cursor];
        if (b && b.enabled) b.onTap(); else kit.audio.sfx('hit');
      }
    }
  });

  /* ================================================== play scene */
  var PlayScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function PlayScene() { Phaser.Scene.call(this, { key: 'Play' }); },

    /* ------------------------------------------------------ init */
    init: function (data) {
      this.mode = (data && data.mode) || 'run';
      if (this.mode !== 'run' && this.mode !== 'rush' && this.mode !== '1cc') this.mode = 'run';
      this.seed = (data && data.seed) ? (data.seed >>> 0) : 1;
    },

    create: function () {
      this.cameras.main.setZoom(RETINA_FACTOR); this.cameras.main.centerOn(GW / 2, GH / 2);
      // centerOn() is what keeps the zoomed camera pointed at the middle of the
      // 360 x GH design box. Remember the scroll it produced: the shake below
      // must be an OFFSET from it, not an absolute setScroll(dx, dy), which
      // would snap the camera back to 0,0 and push the whole playfield into a
      // corner of the canvas the moment the retina zoom is anything but 1.
      this.camBaseX = this.cameras.main.scrollX;
      this.camBaseY = this.cameras.main.scrollY;
      activePlay = this;
      var self = this;
      SH_STATE.scene = 'play';
      SH_STATE.mode = this.mode;
      SH_STATE.seed = this.seed;

      this.cameras.main.setBackgroundColor(CSS.ink);

      /* ---- background layers ---- */
      this.neb = this.add.tileSprite(0, 0, GW, GH, 'sh_bg_neb').setOrigin(0, 0).setDepth(-30).setAlpha(0.5);
      this.band = this.add.tileSprite(0, 0, GW, GH, 'sh_bg_band').setOrigin(0, 0).setDepth(-28).setAlpha(0.34);
      this.far = this.add.tileSprite(0, 0, GW, GH, 'sh_bg_far').setOrigin(0, 0).setDepth(-26).setAlpha(0.6);
      this.near = this.add.tileSprite(0, 0, GW, GH, 'sh_bg_near').setOrigin(0, 0).setDepth(-24).setAlpha(0.5);

      /* ---- bullet blitters (renderer only, zero sim state) ----
       * Built BEFORE the pools, because the pools populate them. */
      this.pbBlit = this.add.blitter(0, 0, 'sh_bullets').setDepth(10);
      this.ebBlit = this.add.blitter(0, 0, 'sh_bullets').setDepth(14);

      /* ---- pools ---- */
      this.buildPools();

      /* ---- particle systems (six, per the arcade lane floor) ---- */
      this.fxMuzzle = this.add.particles(0, 0, 'sh_spark', {
        speed: { min: 30, max: 130 }, lifespan: 240, quantity: 1, scale: { start: 0.55, end: 0 },
        blendMode: 'ADD', emitting: false
      }).setDepth(9);
      this.fxGraze = this.add.particles(0, 0, 'sh_star4', {
        speed: { min: 40, max: 150 }, lifespan: 380, quantity: 1, scale: { start: 0.6, end: 0 },
        rotate: { start: 0, end: 180 }, blendMode: 'ADD', emitting: false
      }).setDepth(13);
      this.fxHit = this.add.particles(0, 0, 'sh_spark', {
        speed: { min: 60, max: 190 }, lifespan: 300, quantity: 1, scale: { start: 0.7, end: 0 },
        tint: 0xfff2a8, blendMode: 'ADD', emitting: false
      }).setDepth(9);
      this.fxBoom = this.add.particles(0, 0, 'sh_glow', {
        speed: { min: 40, max: 230 }, lifespan: 560, quantity: 1, scale: { start: 0.75, end: 0 },
        blendMode: 'ADD', emitting: false
      }).setDepth(9);
      this.fxShard = this.add.particles(0, 0, 'sh_shard', {
        speed: { min: 90, max: 320 }, lifespan: 700, quantity: 1, scale: { start: 0.9, end: 0.1 },
        rotate: { min: -220, max: 220 }, gravityY: 130, emitting: false
      }).setDepth(9);
      this.fxSmoke = this.add.particles(0, 0, 'sh_smoke', {
        speed: { min: 10, max: 60 }, lifespan: 900, quantity: 1, scale: { start: 0.5, end: 1.4 },
        alpha: { start: 0.4, end: 0 }, emitting: false
      }).setDepth(8);

      /* ---- graze route gate ---- */
      this.gate = { active: false, x: 0, y: 0, w: SHContent.GATE.width, life: 0, taken: false };
      this.gateL = this.add.image(-100, -100, 'sh_gate').setDepth(3).setVisible(false);
      this.gateR = this.add.image(-100, -100, 'sh_gate').setDepth(3).setVisible(false);

      /* ---- boss ---- */
      this.bossSpr = this.add.image(GW / 2, -200, 'sh_boss_kestrel', 'boss_0');
      this.bossSpr.setDepth(4).setScale(0.72).setVisible(false);
      this.podSpr = [];
      for (var p = 0; p < MAX_PODS; p++) {
        var ps = this.add.image(-100, -100, 'sh_pods', 'pod_0');
        ps.setDepth(6).setVisible(false);
        this.podSpr.push(ps);
      }
      this.podBar = [];
      for (p = 0; p < MAX_PODS; p++) {
        var pb = this.add.image(-100, -100, 'sh_white').setDepth(6).setVisible(false).setTint(0xffd166);
        this.podBar.push(pb);
      }

      /* ---- player ---- */
      this.flame = this.add.image(GW / 2, GH - 108, 'sh_flame', 'flame_0').setDepth(10).setOrigin(0.5, 0);
      this.ship = this.add.image(GW / 2, GH - 120, 'sh_ship', 'ship_0').setDepth(11);
      this.focusRing = this.add.image(GW / 2, GH - 120, 'sh_focusring').setDepth(12).setVisible(false);
      this.hitDot = this.add.image(GW / 2, GH - 120, 'sh_hitdot').setDepth(12).setVisible(false);

      /* ---- screen effects ---- */
      this.flashPlate = this.add.image(GW / 2, GH / 2, 'sh_white').setDepth(26).setAlpha(0);
      this.flashPlate.setDisplaySize(GW, GH);
      this.vignette = this.add.image(GW / 2, GH / 2, 'sh_vig').setDepth(25).setAlpha(0);
      this.vignette.setDisplaySize(GW, GH);
      this.shockPool = [];
      for (var s = 0; s < 3; s++) {
        var sk = this.add.image(-500, -500, 'sh_shock').setDepth(15).setVisible(false).setBlendMode(Phaser.BlendModes.ADD);
        this.shockPool.push(sk);
      }

      this.buildHUD();
      this.buildBanner();
      this.buildOverlay();

      /* ---- run state ---- */
      this.resetRun();

      this.events.once('shutdown', function () {
        if (activePlay === self) activePlay = null;
      });
      this.events.once('destroy', function () {
        if (activePlay === self) activePlay = null;
      });
    },

    /* =================================================== pools */
    buildPools: function () {
      var i;
      // Enemy bullets: record array + Bob array, index paired, never merged.
      this.ebD = new Array(MAX_EB);
      this.ebB = new Array(MAX_EB);
      for (i = 0; i < MAX_EB; i++) {
        this.ebD[i] = { x: 0, y: 0, vx: 0, vy: 0, r: 4, curve: 0, accel: 0, grazed: 0, frame: 'b_aimed_m' };
        this.ebB[i] = null;
      }
      this.ebN = 0;
      this.ebBuilt = 0;
      this.growEB(INIT_EB);

      this.pbD = new Array(MAX_PB);
      this.pbB = new Array(MAX_PB);
      for (i = 0; i < MAX_PB; i++) {
        this.pbD[i] = { x: 0, y: 0, vx: 0, vy: 0, dmg: 1, frame: 'pb_0' };
        this.pbB[i] = null;
      }
      this.pbN = 0;
      this.pbBuilt = 0;
      this.growPB(INIT_PB);

      this.enD = new Array(MAX_EN);
      this.enS = new Array(MAX_EN);
      for (i = 0; i < MAX_EN; i++) {
        this.enD[i] = this.blankEnemy();
        this.enS[i] = null;
      }
      this.enN = 0;
      this.enBuilt = 0;
      this.growEN(INIT_EN);

      this.dpD = new Array(MAX_DROPS);
      this.dpS = new Array(MAX_DROPS);
      for (i = 0; i < MAX_DROPS; i++) {
        this.dpD[i] = { x: 0, y: 0, vx: 0, vy: 0, kind: 'score', life: 0, mag: 0 };
        this.dpS[i] = null;
      }
      this.dpN = 0;
      this.dpBuilt = 0;
      this.growDrops(INIT_DROPS);

    },
    blankEnemy: function () {
      return {
        x: 0, y: 0, tx: 0, ty: 0, speed: 0, hold: 0, holdT: 0, ovx: 0, ovy: 0,
        hp: 1, maxhp: 1, r: 12, kind: 'drone', score: 0, sway: 0, drop: null,
        st: 'wait', wait: 0, life: 0, flash: 0, pat: null,
        pa: 0, pt: 0, burst: 0, burstT: 0, prng: null
      };
    },
    growEB: function (n) {
      while (this.ebBuilt < n && this.ebBuilt < MAX_EB) {
        var b = this.ebBlit.create(-500, -500, 'b_aimed_m');
        b.visible = false;
        this.ebB[this.ebBuilt] = b;
        this.ebBuilt++;
      }
    },
    growPB: function (n) {
      while (this.pbBuilt < n && this.pbBuilt < MAX_PB) {
        var b = this.pbBlit.create(-500, -500, 'pb_0');
        b.visible = false;
        this.pbB[this.pbBuilt] = b;
        this.pbBuilt++;
      }
    },
    growEN: function (n) {
      while (this.enBuilt < n && this.enBuilt < MAX_EN) {
        var s = this.add.image(-200, -200, 'sh_enemies', 'drone_0');
        s.setDepth(5).setVisible(false);
        this.enS[this.enBuilt] = s;
        this.enBuilt++;
      }
    },
    growDrops: function (n) {
      while (this.dpBuilt < n && this.dpBuilt < MAX_DROPS) {
        var s = this.add.image(-200, -200, 'sh_drops', 'drop_score');
        s.setDepth(7).setVisible(false);
        this.dpS[this.dpBuilt] = s;
        this.dpBuilt++;
      }
    },

    /* =================================================== HUD */
    buildHUD: function () {
      var D = 20;
      this.hudTop = this.add.image(0, 0, 'sh_hudtop').setOrigin(0, 0).setDepth(D);

      // Live values: pooled glyphs. The top edge is the only persistent HUD;
      // icons and bars carry state that used to need repeated label text.
      this.gScore = makeGlyphRow(this, 8, 15, 8, 0.72, 0xffffff, 'left', D + 1);
      this.gMult = makeGlyphRow(this, GW - 8, 15, 5, 0.82, 0x8fa6c8, 'right', D + 1);
      this.tStage = mkText(this, GW / 2, 14, '1/1', 14, CSS.cyan, 'center').setDepth(D + 1);
      this.meterBarBg = this.add.image(GW - 8, 32, 'sh_white').setOrigin(1, 0.5)
        .setDepth(D + 1).setTint(0x1d2943).setAlpha(0.9);
      this.meterBarBg.setDisplaySize(82, 4);
      this.meterBar = this.add.image(GW - 90, 32, 'sh_white').setOrigin(0, 0.5)
        .setDepth(D + 2).setTint(0x7cf5c0).setAlpha(0.95);
      this.meterBar.setDisplaySize(1, 4);

      // Boss bar. Two stretched white images, tinted. No Graphics.
      this.bossBarBg = this.add.image(GW / 2, 54, 'sh_white').setDepth(D + 1).setTint(0x101a30).setAlpha(0.85).setVisible(false);
      this.bossBarBg.setDisplaySize(GW - 40, 8);
      this.bossBar = this.add.image(20, 54, 'sh_white').setOrigin(0, 0.5).setDepth(D + 2).setVisible(false);
      this.bossBar.setDisplaySize(GW - 40, 8);
      this.bossPips = [];
      for (var i = 0; i < 4; i++) {
        var pip = this.add.image(20 + i * 10, 65, 'sh_white').setOrigin(0, 0.5).setDepth(D + 2).setVisible(false);
        pip.setDisplaySize(7, 3);
        this.bossPips.push(pip);
      }

      // Lives, bombs, and power stay on the top edge, away from touch zones.
      this.lifePips = []; this.bombPips = [];
      for (i = 0; i < MAX_LIVES; i++) {
        var lp = this.add.image(10 + i * 14, 32, 'sh_pip', 'pip_life').setDepth(D + 1).setVisible(false);
        this.lifePips.push(lp);
      }
      for (i = 0; i < MAX_BOMBS; i++) {
        var bp = this.add.image(108 + i * 14, 32, 'sh_pip', 'pip_bomb').setDepth(D + 1).setVisible(false);
        this.bombPips.push(bp);
      }
      this.powerPips = [];
      for (i = 0; i < MAX_POWER; i++) {
        var pp = this.add.image(190 + i * 8, 32, 'sh_white').setOrigin(0, 0.5)
          .setDepth(D + 1).setDisplaySize(6, 4);
        this.powerPips.push(pp);
      }

      // Bomb button.
      this.bombBtn = this.add.image(GW - 48, GH - 58, 'sh_bombbtn', 'bomb_1').setDepth(D + 1);
      this.gBombN = makeGlyphRow(this, GW - 48, GH - 45, 1, 0.7, 0xffffff, 'center', D + 2);
      this.bombRect = { x: GW - 92, y: GH - 102, w: 88, h: 88 };

      // One thin, single-line tutorial strip near the top edge.
      this.coach = mkText(this, GW / 2, 84, '', 14, CSS.amber, 'center', '400').setDepth(D + 3);
      this.coach.setAlpha(0);
    },

    buildBanner: function () {
      var D = 22;
      this.bannerBox = this.add.container(GW / 2, GH * 0.36).setDepth(D).setAlpha(0);
      this.bannerPlate = this.add.image(0, 0, 'sh_banner');
      this.bannerPlate.setDisplaySize(248, 58);
      this.bannerMain = mkText(this, 0, -7, '', 18, CSS.white, 'center');
      this.bannerBox.add([this.bannerPlate, this.bannerMain]);
      this.bannerBaseScale = 1;
      this.bannerTween = null;

      // In-play events use one compact corner chip, never the center banner.
      this.chipBox = this.add.container(GW - 8, 84).setDepth(D + 1).setAlpha(0);
      this.chipPlate = this.add.image(0, 0, 'sh_plate').setOrigin(1, 0.5);
      this.chipPlate.setDisplaySize(224, 32).setAlpha(0.92);
      this.chipText = mkText(this, -10, 0, '', 14, CSS.white, 'right', '700');
      this.chipBox.add([this.chipPlate, this.chipText]);
    },

    buildOverlay: function () {
      var D = 30;
      this.overlay = this.add.container(GW / 2, GH / 2).setDepth(D).setVisible(false);
      var dim = this.add.image(0, 0, 'sh_white').setTint(0x03050c).setAlpha(0.82);
      dim.setDisplaySize(GW, GH);
      this.ovTitle = mkText(this, 0, -GH * 0.18, '', 28, CSS.cyan, 'center');
      this.ovSub = mkText(this, 0, -GH * 0.18 + 26, '', 11, CSS.amber, 'center', '400');
      this.ovBody = mkText(this, 0, -20, '', 12, CSS.text, 'center', '400');
      this.ovBody.setAlign('center');
      this.ovMedal = this.add.image(0, 52, 'sh_medal', 'medal_none').setScale(1.4).setVisible(false);
      this.ovPrompt = mkText(this, 0, GH * 0.22, '', 12, CSS.white, 'center');
      this.overlay.add([dim, this.ovTitle, this.ovSub, this.ovBody, this.ovMedal, this.ovPrompt]);
      this.ovPromptT = 0;
    },

    /* =================================================== run reset */
    resetRun: function () {
      var eff = effectiveSave();
      this.stageList = (this.mode === 'rush') ? SHContent.bossRushStages(eff) : SHContent.runStages(eff);
      if (SH_STATE.forceStage != null) {
        var fs = SH_STATE.forceStage | 0;
        if (fs >= 0 && fs < SHContent.STAGES.length) this.stageList = [fs];
      }
      if (!this.stageList.length) this.stageList = [0];
      this.stagePos = 0;

      this.score = 0;
      this.lives = START_LIVES;
      this.bombs = START_BOMBS;
      this.power = this.mode === 'rush' ? 3 : 1;
      this.meter = 0;
      this.grazeTotal = 0;
      this.continuesLeft = (this.mode === '1cc') ? 0 : CONTINUES;
      this.usedContinue = false;
      this.shield = 0;

      this.simT = 0;
      this.artT = 0;
      this.acc = 0;
      this.hitStop = 0;
      this.shakeMag = 0; this.shakeT = 0;
      this.flash = 0; this.dmgVig = 0;
      this.grazeTimes = new Array(GRAZE_LOG);
      this.grazeHead = 0; this.grazeCount = 0;
      this.multShown = 1;

      this.px = GW / 2; this.py = GH - 130;
      this.pInv = 2.2; this.pFocus = false; this.pFire = 0; this.pAlive = true;
      this.driveId = null; this.anchorX = 0; this.anchorY = 0;
      this.roles = {};
      this.bombLatch = false;

      this.sfxCd = 0; this.grazeSfxCd = 0;

      this.overlayMode = null;
      this.clearNotices();
      this.overlay.setVisible(false);

      this.startStage(0);
    },

    /* =================================================== stage */
    startStage: function (pos) {
      this.stagePos = pos;
      var idx = this.stageList[pos];
      if (idx == null) idx = 0;
      this.stageIdx = idx;
      var def = SHContent.stageAt(idx);
      this.stageDef = def;
      this.stage = SHContent.makeStage(idx, this.seed + pos * 7919);
      this.stageT = 0;
      this.waveIdx = 0;
      this.bossWarn = 0;
      this.boss = null;
      this.clearT = 0;
      this.stageStats = { score: 0, graze: 0, bombsUsed: 0 };
      this.phase = 'intro';
      this.introT = 2.4;

      this.clearField();
      this.bombs = Math.max(this.bombs, START_BOMBS);
      this.pInv = Math.max(this.pInv, 1.8);

      // Stage identity: recolour the shared background tiles.
      var th = def.theme;
      this.neb.setTint(th.neb);
      this.band.setTint(th.band);
      this.far.setTint(th.star);
      this.near.setTint(0xffffff);
      this.cameras.main.setBackgroundColor(th.top);

      var label = (pos + 1) + '/' + this.stageList.length;
      this.showBoundary(def.name, 2.2);
      setTextIfChanged(this.tStage, label);

      if (pos === 0 && this.mode !== 'rush') this.showCoach('DRAG TO FLY • 2ND FINGER = FOCUS', 2.5);

      kit.audio.music('m_field', 700);

      if (this.mode === 'rush' || SH_STATE.forceBoss || !this.stage.waves.length) {
        this.waveIdx = this.stage.waves.length;
        this.stageT = this.stage.bossAt - 0.4;
      }
    },

    clearField: function () {
      this.ebN = 0; this.pbN = 0; this.enN = 0; this.dpN = 0;
      this.hideFrom(this.ebB, 0, this.ebBuilt);
      this.hideFrom(this.pbB, 0, this.pbBuilt);
      this.hideFrom(this.enS, 0, this.enBuilt);
      this.hideFrom(this.dpS, 0, this.dpBuilt);
      this.gate.active = false;
      this.gateL.setVisible(false); this.gateR.setVisible(false);
      this.bossSpr.setVisible(false);
      for (var i = 0; i < MAX_PODS; i++) { this.podSpr[i].setVisible(false); this.podBar[i].setVisible(false); }
      this.bossBar.setVisible(false); this.bossBarBg.setVisible(false);
      for (i = 0; i < this.bossPips.length; i++) this.bossPips[i].setVisible(false);
    },
    hideFrom: function (arr, from, to) {
      for (var i = from; i < to; i++) if (arr[i]) arr[i].visible = false;
    },

    /* =================================================== lifecycle */
    onKitPause: function () {
      this.acc = 0;
      this.roles = {};
      this.driveId = null;
      keyPrev = {};
    },
    onKitResume: function () { this.acc = 0; },
    onKitRestart: function () { this.resetRun(); },

    /* =================================================== main loop */
    update: function (time, delta) {
      if (kit.paused) return;
      var dt = (delta || 16) / 1000;
      if (dt > 0.25) dt = 0.25;
      this.acc += dt;
      var steps = 0;
      while (this.acc >= STEP && steps < MAX_STEPS) {
        this.step(STEP);
        this.acc -= STEP;
        steps++;
      }
      // A device that cannot keep up gets SLOW MOTION, never a time skip:
      // the leftover backlog is dropped instead of being replayed.
      if (steps >= MAX_STEPS) this.acc = 0;
      this.render();
    },

    step: function (dt) {
      this.artT += dt;
      if (this.sfxCd > 0) this.sfxCd -= dt;
      if (this.grazeSfxCd > 0) this.grazeSfxCd -= dt;
      if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.4);
      if (this.dmgVig > 0) this.dmgVig = Math.max(0, this.dmgVig - dt * 1.5);
      if (this.shakeT > 0) { this.shakeT -= dt; if (this.shakeT <= 0) this.shakeMag = 0; }

      if (this.hitStop > 0) { this.hitStop -= dt; return; }

      this.simT += dt;
      this.readInput(dt);

      if (this.overlayMode) { this.stepOverlay(dt); return; }

      if (this.phase === 'intro') {
        this.introT -= dt;
        this.stepPlayer(dt);
        this.stepBullets(dt);
        this.stepDrops(dt);
        // Always hand off to 'waves', even on a stage that HAS no waves.
        // Handing straight to 'warn' softlocked the boss-only finale: the
        // warning trigger in stepWaves refuses to fire when the phase is
        // already 'warn', so nothing ever summoned the boss.
        if (this.introT <= 0) this.phase = 'waves';
        return;
      }

      if (this.phase === 'clear') {
        this.clearT -= dt;
        this.stepPlayer(dt);
        this.stepBullets(dt);
        this.stepDrops(dt);
        if (this.clearT <= 0) this.advanceStage();
        return;
      }

      this.stageT += dt;
      this.meter = Math.max(0, this.meter - METER_DECAY * dt);

      this.stepPlayer(dt);
      this.stepWaves(dt);
      this.stepEnemies(dt);
      this.stepBoss(dt);
      this.stepGate(dt);
      this.stepBullets(dt);
      this.stepDrops(dt);
      this.collide();
    },

    /* =================================================== input */
    readInput: function (dt) {
      var self = this;
      var live = {};
      var pointers = kit.input.pointers;

      pointers.forEach(function (p, id) {
        live[id] = true;
        if (self.roles[id]) return;
        // CLAIM TIME. Roles are decided the moment a pointer appears and are
        // never re-decided, so a second finger can never steal the drag.
        pxToGame(p.x, p.y, _tmpPt);
        var r = self.bombRect;
        if (_tmpPt.x >= r.x && _tmpPt.x <= r.x + r.w && _tmpPt.y >= r.y && _tmpPt.y <= r.y + r.h) {
          self.roles[id] = 'bomb';
          self.useBomb();
          return;
        }
        if (self.overlayMode) { self.roles[id] = 'ui'; self.overlayTap(); return; }
        if (self.driveId == null) {
          self.roles[id] = 'drive';
          self.driveId = id;
          self.anchorX = _tmpPt.x; self.anchorY = _tmpPt.y;
        } else {
          self.roles[id] = 'focus';
        }
      });

      // Release. Promote a focus finger to drive so lifting the drag finger
      // while the second one is down does not drop control.
      for (var id in this.roles) {
        if (live[id]) continue;
        var was = this.roles[id];
        delete this.roles[id];
        if (was === 'drive' && String(this.driveId) === String(id)) {
          this.driveId = null;
          var promoted = null;
          for (var oid in this.roles) {
            if (this.roles[oid] === 'focus') { promoted = oid; break; }
          }
          if (promoted != null) {
            var pp = null;
            pointers.forEach(function (p, pid) { if (String(pid) === String(promoted)) pp = p; });
            if (pp) {
              this.roles[promoted] = 'drive';
              this.driveId = promoted;
              pxToGame(pp.x, pp.y, _tmpPt);
              this.anchorX = _tmpPt.x; this.anchorY = _tmpPt.y;
            }
          }
        }
      }

      // Focus: any non-drive, non-bomb finger, or a Shift key.
      var extra = 0;
      for (var rid in this.roles) if (this.roles[rid] === 'focus') extra++;
      this.pFocus = (extra > 0) || keyHeld('ShiftLeft') || keyHeld('ShiftRight');

      // Keyboard bomb, edge triggered inside the fixed step.
      if (anyKeyEdge(['Space', 'KeyZ', 'KeyX'])) this.useBomb();
      if (this.overlayMode && anyKeyEdge(['Enter', 'KeyR'])) this.overlayTap();
      if (anyKeyEdge(['Escape', 'KeyP'])) {
        kit.audio.sfx('ui');
        kit.openSettings();
      }
    },

    /* =================================================== player */
    stepPlayer: function (dt) {
      if (this.pInv > 0) this.pInv -= dt;
      if (this.shield > 0) this.shield -= dt;

      // 1:1 drag follow. The delta in game units equals the delta the finger
      // travelled on glass; focus scales it down for fine placement.
      if (this.driveId != null) {
        var d = null, self = this;
        kit.input.pointers.forEach(function (p, id) { if (String(id) === String(self.driveId)) d = p; });
        if (d) {
          pxToGame(d.x, d.y, _tmpPt);
          var f = this.pFocus ? 0.42 : 1;
          this.px += (_tmpPt.x - this.anchorX) * f;
          this.py += (_tmpPt.y - this.anchorY) * f;
          this.anchorX = _tmpPt.x; this.anchorY = _tmpPt.y;
        } else {
          this.driveId = null;
        }
      }

      var kx = (keyHeld('ArrowRight') || keyHeld('KeyD') ? 1 : 0) - (keyHeld('ArrowLeft') || keyHeld('KeyA') ? 1 : 0);
      var ky = (keyHeld('ArrowDown') || keyHeld('KeyS') ? 1 : 0) - (keyHeld('ArrowUp') || keyHeld('KeyW') ? 1 : 0);
      if (kx || ky) {
        var m = Math.sqrt(kx * kx + ky * ky) || 1;
        var sp = this.pFocus ? 112 : 262;
        this.px += (kx / m) * sp * dt;
        this.py += (ky / m) * sp * dt;
      }
      this.px = clamp(this.px, 12, GW - 12);
      this.py = clamp(this.py, 52, GH - 18);

      if (this.phase === 'dead') return;

      this.pFire -= dt;
      if (this.pFire <= 0) {
        this.fireShots();
        this.pFire = this.pFocus ? 0.072 : 0.086;
      }
    },

    fireShots: function () {
      var lv = clamp(this.power, 1, MAX_POWER);
      var x = this.px, y = this.py;
      var dmg = 1.15;
      if (this.pFocus) {
        this.spawnPB(x, y - 12, 0, -790, dmg * 1.35, 'pb_2');
        this.spawnPB(x - 5, y - 8, 0, -770, dmg, 'pb_2');
        this.spawnPB(x + 5, y - 8, 0, -770, dmg, 'pb_2');
        if (lv >= 3) {
          this.spawnPB(x - 10, y - 4, -40, -740, dmg * 0.8, 'pb_1');
          this.spawnPB(x + 10, y - 4, 40, -740, dmg * 0.8, 'pb_1');
        }
        if (lv >= 5) this.spawnPB(x, y - 18, 0, -820, dmg * 1.5, 'pb_3');
      } else {
        this.spawnPB(x - 6, y - 8, 0, -710, dmg, 'pb_0');
        this.spawnPB(x + 6, y - 8, 0, -710, dmg, 'pb_0');
        if (lv >= 2) {
          this.spawnPB(x - 10, y - 4, -160, -650, dmg * 0.65, 'pb_1');
          this.spawnPB(x + 10, y - 4, 160, -650, dmg * 0.65, 'pb_1');
        }
        if (lv >= 3) this.spawnPB(x, y - 12, 0, -740, dmg * 1.1, 'pb_0');
        if (lv >= 4) {
          this.spawnPB(x - 14, y, -280, -600, dmg * 0.55, 'pb_1');
          this.spawnPB(x + 14, y, 280, -600, dmg * 0.55, 'pb_1');
        }
        if (lv >= 5) {
          this.spawnPB(x - 3, y - 14, 0, -780, dmg * 1.2, 'pb_3');
          this.spawnPB(x + 3, y - 14, 0, -780, dmg * 1.2, 'pb_3');
        }
      }
      if (motionOn()) this.fxMuzzle.explode(1, x, y - 12);
      if (this.sfxCd <= 0) {
        kit.audio.sfx(this.pFocus ? 'shotFocus' : 'shot', { volume: 0.42 });
        this.sfxCd = 0.055;
      }
    },

    /* =================================================== bomb */
    useBomb: function () {
      if (this.overlayMode) { this.overlayTap(); return; }
      if (this.phase === 'dead' || this.bombs <= 0) { kit.audio.sfx('hit', { volume: 0.4 }); return; }
      this.bombs--;
      this.stageStats.bombsUsed++;
      this.pInv = Math.max(this.pInv, 1.9);
      kit.audio.sfx('bomb');
      this.shake(13, 0.55);
      this.flash = motionOn() ? 0.7 : 0.25;
      this.spawnShock(this.px, this.py);

      // Every live bullet pays out, then the screen clears.
      var mult = this.mult();
      for (var i = 0; i < this.ebN; i++) {
        this.addScore(20 * mult);
        if (motionOn() && (i % 5) === 0) this.fxGraze.explode(1, this.ebD[i].x, this.ebD[i].y);
      }
      this.ebN = 0;
      for (i = this.enN - 1; i >= 0; i--) this.damageEnemy(i, 46);
      if (this.boss && (this.boss.state === 'fight')) {
        this.damageBoss(95);
        for (var k = 0; k < this.boss.pods.length; k++) {
          var pod = this.boss.pods[k];
          if (pod.hp > 0) { pod.hp -= 70; pod.flash = 0.1; if (pod.hp <= 0) this.podDestroyed(k); }
        }
      }
      this.hitStopFor(0.06);
    },

    spawnShock: function (x, y) {
      var s = null;
      for (var i = 0; i < this.shockPool.length; i++) {
        if (!this.shockPool[i].visible) { s = this.shockPool[i]; break; }
      }
      if (!s) s = this.shockPool[0];
      s.setPosition(x, y).setVisible(true).setAlpha(0.95).setScale(0.08);
      this.tweens.killTweensOf(s);
      this.tweens.add({
        targets: s, scale: motionOn() ? 4.2 : 2.4, alpha: 0,
        duration: motionOn() ? 640 : 380, ease: 'Cubic.easeOut',
        onComplete: function () { s.setVisible(false); }
      });
    },

    /* =================================================== waves */
    stepWaves: function (dt) {
      var st = this.stage;
      while (this.waveIdx < st.waves.length && this.stageT >= st.waves[this.waveIdx].t) {
        this.spawnWave(st.waves[this.waveIdx]);
        this.waveIdx++;
      }
      if (!this.boss && this.waveIdx >= st.waves.length && this.stageT >= st.bossAt) {
        if (this.bossWarn === 0 && this.phase !== 'warn') {
          this.bossWarn = 2.3;
          this.phase = 'warn';
          kit.audio.sfx('warn');
          kit.audio.music('m_boss', 900);
          this.showChip(st.boss.name + ' INBOUND', CSS.rose);
        }
      }
      if (this.bossWarn > 0) {
        this.bossWarn -= dt;
        if (this.bossWarn <= 0) { this.spawnBoss(); this.bossWarn = 0; }
      }
    },

    spawnWave: function (wv) {
      for (var i = 0; i < wv.list.length; i++) {
        var d = wv.list[i];
        if (this.enN >= MAX_EN) break;
        if (this.enN >= this.enBuilt) this.growEN(this.enBuilt + 1);
        var e = this.enD[this.enN];
        e.x = d.x; e.y = d.y; e.tx = d.tx; e.ty = d.ty;
        e.speed = d.speed; e.hold = d.hold; e.holdT = d.hold;
        e.ovx = d.ovx; e.ovy = d.ovy;
        e.hp = d.hp; e.maxhp = d.hp; e.r = d.r;
        e.kind = d.kind; e.score = d.score; e.sway = d.sway;
        e.drop = SH_STATE.forceGenerousDrops ? (d.drop || SHContent.rollDrop(SHContent.rngObj(this.enN + this.waveIdx * 31))) : d.drop;
        e.pat = d.pat;
        e.st = 'wait'; e.wait = d.delay; e.life = 0; e.flash = 0;
        e.pa = (this.enN * 0.7) % TAU; e.pt = d.pat ? d.pat.period * 0.5 : 1;
        e.burst = 0; e.burstT = 0;
        e.prng = SHContent.rngObj((d.pat && d.pat.seed) || (this.waveIdx * 977 + i * 31 + 7));
        this.enN++;
      }
      if (wv.gate || SH_STATE.forceGrazeGate) this.spawnGate();
    },

    /* =================================================== graze route */
    spawnGate: function () {
      if (this.gate.active) return;
      var g = this.gate;
      g.active = true; g.taken = false;
      g.w = SHContent.GATE.width;
      g.x = clamp(60 + Math.abs(Math.sin(this.simT * 7.13)) * (GW - 120), 60, GW - 60);
      g.y = -60;
      g.life = SHContent.GATE.life;
      this.gateL.setVisible(true);
      this.gateR.setVisible(true);
      this.showChip('GRAZE ROUTE', CSS.mint);
    },
    stepGate: function (dt) {
      var g = this.gate;
      if (!g.active) return;
      g.y += SHContent.GATE.speed * dt;
      g.life -= dt;
      if (g.life <= 0 || g.y > GH + 60) {
        g.active = false;
        this.gateL.setVisible(false); this.gateR.setVisible(false);
        return;
      }
      if (!g.taken && Math.abs(this.py - g.y) < 8 && Math.abs(this.px - g.x) < g.w * 0.5) {
        g.taken = true;
        var recent = this.grazesWithin(SHContent.GATE.grazeWindow);
        var bonus = Math.min(SHContent.GATE.maxBonus,
          Math.round((SHContent.GATE.baseBonus + recent * SHContent.GATE.perGraze) * this.mult()));
        this.addScore(bonus);
        this.meter = Math.min(METER_MAX, this.meter + 18);
        kit.audio.sfx('gate');
        this.showChip('GATE +' + commas(bonus), CSS.mint);
        this.dropAt(this.px, this.py - 10, 'power');
        this.dropAt(this.px + 18, this.py - 10, 'bomb');
        if (motionOn()) this.fxGraze.explode(fxCount(18), this.px, this.py);
        this.shake(6, 0.25);
      }
    },
    grazesWithin: function (window) {
      var n = 0, cutoff = this.simT - window;
      for (var i = 0; i < this.grazeCount; i++) {
        if (this.grazeTimes[i] >= cutoff) n++;
      }
      return n;
    },
    logGraze: function () {
      // Bounded ring buffer. It never grows past GRAZE_LOG entries.
      this.grazeTimes[this.grazeHead] = this.simT;
      this.grazeHead = (this.grazeHead + 1) % GRAZE_LOG;
      if (this.grazeCount < GRAZE_LOG) this.grazeCount++;
    },

    /* =================================================== enemies */
    stepEnemies: function (dt) {
      for (var i = this.enN - 1; i >= 0; i--) {
        var e = this.enD[i];
        e.life += dt;
        if (e.flash > 0) e.flash -= dt;
        if (e.st === 'wait') {
          e.wait -= dt;
          if (e.wait <= 0) e.st = 'in';
          continue;
        }
        if (e.st === 'in') {
          var dx = e.tx - e.x, dy = e.ty - e.y;
          var d = Math.sqrt(dx * dx + dy * dy);
          if (d < 3) { e.st = 'hold'; e.holdT = e.hold; e.x = e.tx; e.y = e.ty; }
          else { e.x += dx / d * e.speed * dt; e.y += dy / d * e.speed * dt; }
        } else if (e.st === 'hold') {
          e.holdT -= dt;
          if (e.sway) e.x = e.tx + Math.sin(e.life * 1.5) * 26;
          if (e.holdT <= 0) e.st = 'out';
        } else {
          e.x += e.ovx * dt; e.y += e.ovy * dt;
        }
        if (e.y > 14 && e.st !== 'out') this.runPattern(e, e.pat, dt, e.x, e.y);
        if (e.y > GH + 60 || e.x < -80 || e.x > GW + 80) this.removeEnemy(i);
      }
    },

    removeEnemy: function (i) {
      var last = this.enN - 1;
      if (i !== last) {
        var tmp = this.enD[i];
        this.enD[i] = this.enD[last];
        this.enD[last] = tmp;
      }
      this.enN--;
      if (this.enS[this.enN]) this.enS[this.enN].visible = false;
    },

    damageEnemy: function (i, dmg) {
      var e = this.enD[i];
      e.hp -= dmg;
      e.flash = 0.09;
      if (e.hp > 0) return false;
      var mult = this.mult();
      this.addScore(e.score * mult);
      this.burst(e.x, e.y, e.kind === 'orb' || e.kind === 'block' ? 'big' : 'small');
      kit.audio.sfx('boom', { volume: 0.55 });
      this.shake(4, 0.16);
      if (e.drop) this.dropAt(e.x, e.y, e.drop);
      this.removeEnemy(i);
      return true;
    },

    burst: function (x, y, size) {
      var big = size === 'big';
      if (motionOn()) {
        this.fxBoom.explode(fxCount(big ? 14 : 8), x, y);
        this.fxShard.explode(fxCount(big ? 10 : 5), x, y);
        this.fxSmoke.explode(fxCount(big ? 5 : 2), x, y);
      } else {
        this.fxBoom.explode(fxCount(4), x, y);
      }
    },

    /* =================================================== boss */
    spawnBoss: function () {
      var def = this.stage.boss;
      this.boss = {
        def: def, name: def.name, art: def.art,
        phaseIdx: 0, hp: def.phases[0].hp, maxhp: def.phases[0].hp,
        x: GW / 2, y: -90, t: 0, state: 'enter',
        moveIdx: 0, moveT: 0, flash: 0, dieT: 0, brkT: 0,
        pods: [],
        src: { pa: 0, pt: 0.25, burst: 0, burstT: 0, prng: SHContent.rngObj(this.seed ^ 0x5A5A) }
      };
      this.makePods();
      this.phase = 'boss';
      this.bossSpr.setTexture(SHArt.bossTexture(def.art), 'boss_0');
      this.bossSpr.setVisible(true);
      this.bossBar.setVisible(true); this.bossBarBg.setVisible(true);
      for (var i = 0; i < this.bossPips.length; i++) {
        this.bossPips[i].setVisible(i < def.phases.length);
      }
      kit.audio.music('m_boss', 600);
    },

    makePods: function () {
      var b = this.boss;
      var ph = b.def.phases[b.phaseIdx] || b.def.phases[0];
      b.pods.length = 0;
      var n = clamp(ph.pods | 0, 1, MAX_PODS);
      for (var i = 0; i < n; i++) {
        var t = n === 1 ? 0 : (i / (n - 1) - 0.5) * 2;
        b.pods.push({
          ox: t * ph.podSpread, oy: 12 + Math.abs(t) * -6,
          hp: ph.podHP, maxhp: ph.podHP, r: 14, flash: 0,
          pa: i * 0.6, pt: 1.1 + i * 0.35, burst: 0, burstT: 0,
          prng: SHContent.rngObj(31 + i * 17)
        });
      }
      for (i = 0; i < MAX_PODS; i++) {
        this.podSpr[i].setVisible(i < n);
        this.podBar[i].setVisible(i < n);
      }
    },

    stepBoss: function (dt) {
      var b = this.boss;
      if (!b) return;
      b.t += dt;
      if (b.flash > 0) b.flash -= dt;

      if (b.state === 'enter') {
        b.y += 92 * dt;
        if (b.y >= 118) { b.y = 118; b.state = 'fight'; b.moveIdx = 0; b.moveT = 0; }
        return;
      }
      if (b.state === 'break') {
        b.brkT -= dt;
        b.y = 118 - Math.sin(Math.max(0, b.brkT) * 3) * 7;
        if (b.brkT <= 0) {
          b.phaseIdx++;
          var ph = b.def.phases[b.phaseIdx] || b.def.phases[b.def.phases.length - 1];
          b.hp = ph.hp; b.maxhp = ph.hp;
          this.makePods();
          b.state = 'fight'; b.moveIdx = 0; b.moveT = 0;
          b.src.pa = 0; b.src.pt = 0.25; b.src.burst = 0; b.src.burstT = 0;
          kit.audio.sfx('phase');
          this.showChip('PHASE ' + (b.phaseIdx + 1), CSS.amber);
        }
        return;
      }
      if (b.state === 'dying') {
        b.dieT -= dt;
        if (motionOn() && Math.random() < 0.55) {
          this.fxBoom.explode(fxCount(4), b.x + (Math.random() - 0.5) * 130, b.y + (Math.random() - 0.5) * 60);
        }
        this.shake(7, 0.2);
        if (b.dieT <= 0) this.bossDefeated();
        return;
      }

      /* fight */
      var sp = 0.42 + b.phaseIdx * 0.15;
      b.x = GW / 2 + Math.sin(b.t * sp) * (84 - b.phaseIdx * 5);
      b.y = 118 + Math.sin(b.t * sp * 1.7) * 12;

      var phase = b.def.phases[b.phaseIdx] || b.def.phases[0];
      var moves = phase.moves && phase.moves.length ? phase.moves : [SHContent.makeMove('aimed', 1, SHContent.rngObj(1))];
      var mv = moves[b.moveIdx % moves.length];
      b.moveT += dt;
      if (b.moveT > mv.dur) {
        b.moveT = 0; b.moveIdx++;
        b.src.pa = 0; b.src.pt = 0.2; b.src.burst = 0; b.src.burstT = 0;
      }

      // Pods still alive throttle the main gun: destroying them is worth it.
      var alive = 0;
      for (var i = 0; i < b.pods.length; i++) if (b.pods[i].hp > 0) alive++;
      var rate = 1 - 0.2 * (b.pods.length - alive);
      if (rate < 0.4) rate = 0.4;
      this.runPattern(b.src, mv, dt * rate, b.x, b.y + 12);

      for (i = 0; i < b.pods.length; i++) {
        var pod = b.pods[i];
        if (pod.hp <= 0) continue;
        if (pod.flash > 0) pod.flash -= dt;
        this.runPattern(pod, {
          kind: 'aimed', lane: 'pod', size: 's',
          period: Math.max(0.6, 1.5 - this.stageIdx * 0.18),
          n: 2 + Math.min(3, this.stageIdx), spread: 0.16, burst: 1,
          speed: 120 + this.stageIdx * 16
        }, dt, b.x + pod.ox, b.y + pod.oy);
      }
    },

    damageBoss: function (dmg) {
      var b = this.boss;
      if (!b || b.state !== 'fight') return;
      var alive = 0;
      for (var i = 0; i < b.pods.length; i++) if (b.pods[i].hp > 0) alive++;
      var real = dmg * (alive === 0 ? 1.35 : 1);
      b.hp -= real;
      b.flash = 0.07;
      this.addScore(real * 7 * this.mult());
      if (b.hp <= 0) {
        this.ebN = 0;
        if (b.phaseIdx >= b.def.phases.length - 1) {
          b.state = 'dying'; b.dieT = 1.8;
          kit.audio.sfx('boom');
          this.flash = motionOn() ? 0.8 : 0.3;
          this.shake(16, 0.7);
          this.hitStopFor(0.1);
        } else {
          b.state = 'break'; b.brkT = 1.5;
          kit.audio.sfx('podbreak');
          this.flash = motionOn() ? 0.55 : 0.22;
          this.shake(13, 0.5);
          this.burst(b.x, b.y, 'big');
          this.addScore(6000 * this.mult());
          this.hitStopFor(0.08);
        }
      }
    },

    podDestroyed: function (k) {
      var b = this.boss;
      if (!b) return;
      var pod = b.pods[k];
      if (!pod) return;
      this.addScore(3200 * this.mult());
      this.showChip('POD DOWN', CSS.amber);
      this.burst(b.x + pod.ox, b.y + pod.oy, 'big');
      kit.audio.sfx('podbreak');
      this.shake(8, 0.28);
      this.hitStopFor(0.05);
      if (this.podSpr[k]) this.podSpr[k].setVisible(false);
      if (this.podBar[k]) this.podBar[k].setVisible(false);
      this.dropAt(b.x + pod.ox, b.y + pod.oy, 'bomb');
    },

    bossDefeated: function () {
      var b = this.boss;
      if (motionOn()) {
        this.fxBoom.explode(fxCount(34), b.x, b.y);
        this.fxShard.explode(fxCount(22), b.x, b.y);
        this.fxSmoke.explode(fxCount(10), b.x, b.y);
      }
      kit.audio.sfx('bomb');
      this.flash = motionOn() ? 1 : 0.35;
      this.spawnShock(b.x, b.y);
      this.addScore(20000 + this.lives * 5000 + this.bombs * 2000);
      this.boss = null;
      this.ebN = 0;
      this.clearField2();
      this.phase = 'clear';
      this.clearT = 3.2;

      // Medal award for this stage.
      var medal = 0;
      if (this.mode !== 'rush') {
        medal = SHContent.medalFor(this.stageIdx, this.stageStats);
        if (medal > (save.medals[this.stageIdx] | 0)) {
          save.medals[this.stageIdx] = medal;
          persist();
        }
      }
      this.lastMedal = medal;
      kit.audio.sfx('clear');
      if (medal > 0) this.time.delayedCall(600, function () { kit.audio.sfx('medal'); });
      this.showBoundary(
        this.stagePos >= this.stageList.length - 1 ? 'ALL CLEAR' : 'STAGE CLEAR',
        3.0, medal === 3 ? CSS.amber : CSS.cyan
      );
      // Generous: a clear always pays a refill.
      this.dropAt(GW * 0.35, 160, 'bomb');
      this.dropAt(GW * 0.65, 160, 'power');
    },
    clearField2: function () {
      this.bossSpr.setVisible(false);
      for (var i = 0; i < MAX_PODS; i++) { this.podSpr[i].setVisible(false); this.podBar[i].setVisible(false); }
      this.bossBar.setVisible(false); this.bossBarBg.setVisible(false);
      for (i = 0; i < this.bossPips.length; i++) this.bossPips[i].setVisible(false);
      this.gate.active = false;
      this.gateL.setVisible(false); this.gateR.setVisible(false);
    },

    advanceStage: function () {
      if (this.stagePos >= this.stageList.length - 1) {
        this.winRun();
      } else {
        this.startStage(this.stagePos + 1);
      }
    },

    /* =================================================== patterns */
    /* One pattern runner for enemies, pods and the boss gun. The emitter
     * state lives on the record passed in (pa, pt, burst, burstT, prng) and
     * the position comes in as arguments, so the same code drives a moving
     * boss turret and a static drone without either owning a position. */
    runPattern: function (o, pat, dt, ox, oy) {
      if (!pat) return;
      var kind = pat.kind;
      var lane = pat.lane || 'aimed';
      var size = pat.size || 'm';
      var frame = SHArt.bulletFrame(lane, size);
      var r = SHArt.SIZE_R[size] || 4.6;
      var i, a;

      if (kind === 'arms') {
        o.pa += (pat.rate || 2) * dt;
        o.pt -= dt;
        if (o.pt <= 0) {
          o.pt += pat.period;
          var arms = clamp(pat.arms | 0, 1, 12);
          for (i = 0; i < arms; i++) {
            a = o.pa + i * TAU / arms;
            if (pat.sweep) a += Math.sin(o.pa * 0.5) * 0.6;
            this.spawnEB(ox, oy, a, pat.speed, r, frame, 0, 0);
          }
        }
        return;
      }

      o.pt -= dt;
      if (o.pt <= 0) {
        o.pt += pat.period;
        if (kind === 'aimed') {
          o.burst = pat.burst || 1;
          o.burstT = 0;
        } else if (kind === 'fan') {
          var base = this.aimAt(ox, oy);
          var n = clamp(pat.n | 0, 1, 40);
          if (pat.sweep) base += Math.sin(o.pa) * 0.5;
          o.pa += 0.5;
          for (i = 0; i < n; i++) {
            a = base + (n === 1 ? 0 : (i / (n - 1) - 0.5) * pat.spread);
            this.spawnEB(ox, oy, a, pat.speed, r, frame, 0, 0);
          }
        } else if (kind === 'ring') {
          var off = pat.aim ? this.aimAt(ox, oy) : 0;
          o.pa += pat.spin || 0;
          var rn = clamp(pat.n | 0, 3, 48);
          for (i = 0; i < rn; i++) {
            this.spawnEB(ox, oy, off + o.pa + i * TAU / rn, pat.speed, r, frame, 0, 0);
          }
        } else if (kind === 'wall') {
          var prng = o.prng || (o.prng = SHContent.rngObj(pat.seed || 7));
          var count = clamp(pat.count | 0, 4, 40);
          var gapCentre;
          if (pat.orbit) {
            o.pa += 0.9;
            gapCentre = GW * 0.5 + Math.sin(o.pa) * (GW * 0.34);
          } else {
            gapCentre = 40 + prng.r() * (GW - 80);
          }
          var stepX = GW / count;
          for (i = 0; i < count; i++) {
            var wx = stepX * 0.5 + i * stepX;
            if (Math.abs(wx - gapCentre) < pat.gap * 0.5) continue;
            var ang = Math.PI / 2 + (pat.drift ? pat.drift / 400 : 0);
            this.spawnEB(wx, oy < 0 ? 0 : oy, ang, pat.speed, r, frame, 0, 0);
          }
        } else if (kind === 'rain') {
          var prng2 = o.prng || (o.prng = SHContent.rngObj(pat.seed || 11));
          var rx = 16 + prng2.r() * (GW - 32);
          this.spawnEB(rx, -8, Math.PI / 2 + (prng2.r() - 0.5) * 0.5, pat.speed, r, frame, 0, 0);
        }
      }

      if (o.burst > 0) {
        o.burstT -= dt;
        if (o.burstT <= 0) {
          o.burstT = 0.1;
          o.burst--;
          var b0 = this.aimAt(ox, oy);
          var bn = clamp(pat.n | 0, 1, 20);
          for (i = 0; i < bn; i++) {
            a = b0 + (bn === 1 ? 0 : (i / (bn - 1) - 0.5) * pat.spread * bn * 0.5);
            this.spawnEB(ox, oy, a, pat.speed, r, frame, 0, 0);
          }
        }
      }
    },
    aimAt: function (x, y) { return Math.atan2(this.py - y, this.px - x); },

    /* =================================================== bullets */
    spawnEB: function (x, y, ang, speed, r, frame, curve, accel) {
      if (this.ebN >= MAX_EB) return;
      if (this.ebN >= this.ebBuilt) this.growEB(this.ebBuilt + 1);
      var d = this.ebD[this.ebN];
      d.x = x; d.y = y;
      d.vx = Math.cos(ang) * speed; d.vy = Math.sin(ang) * speed;
      d.r = r; d.curve = curve || 0; d.accel = accel || 0;
      d.grazed = 0; d.frame = frame;
      this.ebN++;
    },
    spawnPB: function (x, y, vx, vy, dmg, frame) {
      if (this.pbN >= MAX_PB) return;
      if (this.pbN >= this.pbBuilt) this.growPB(this.pbBuilt + 1);
      var d = this.pbD[this.pbN];
      d.x = x; d.y = y; d.vx = vx; d.vy = vy; d.dmg = dmg; d.frame = frame;
      this.pbN++;
    },
    removeEB: function (i) {
      var last = this.ebN - 1;
      if (i !== last) { var t = this.ebD[i]; this.ebD[i] = this.ebD[last]; this.ebD[last] = t; }
      this.ebN--;
    },
    removePB: function (i) {
      var last = this.pbN - 1;
      if (i !== last) { var t = this.pbD[i]; this.pbD[i] = this.pbD[last]; this.pbD[last] = t; }
      this.pbN--;
    },

    stepBullets: function (dt) {
      var i, d;
      for (i = this.pbN - 1; i >= 0; i--) {
        d = this.pbD[i];
        d.x += d.vx * dt; d.y += d.vy * dt;
        if (d.y < -24 || d.x < -24 || d.x > GW + 24 || d.y > GH + 24) this.removePB(i);
      }
      for (i = this.ebN - 1; i >= 0; i--) {
        d = this.ebD[i];
        if (d.curve) {
          var c = Math.cos(d.curve * dt), s = Math.sin(d.curve * dt);
          var nx = d.vx * c - d.vy * s, ny = d.vx * s + d.vy * c;
          d.vx = nx; d.vy = ny;
        }
        if (d.accel) { d.vx *= 1 + d.accel * dt; d.vy *= 1 + d.accel * dt; }
        d.x += d.vx * dt; d.y += d.vy * dt;
        if (d.x < -34 || d.x > GW + 34 || d.y < -52 || d.y > GH + 44) this.removeEB(i);
      }
    },

    /* =================================================== drops */
    dropAt: function (x, y, kind) {
      if (this.dpN >= MAX_DROPS) return;
      if (this.dpN >= this.dpBuilt) this.growDrops(this.dpBuilt + 1);
      var d = this.dpD[this.dpN];
      d.x = x; d.y = y;
      d.vx = (Math.random() - 0.5) * 40;
      d.vy = -60 - Math.random() * 30;
      d.kind = kind || 'score';
      d.life = 12; d.mag = 0;
      this.dpN++;
    },
    removeDrop: function (i) {
      var last = this.dpN - 1;
      if (i !== last) { var t = this.dpD[i]; this.dpD[i] = this.dpD[last]; this.dpD[last] = t; }
      this.dpN--;
      if (this.dpS[this.dpN]) this.dpS[this.dpN].visible = false;
    },
    stepDrops: function (dt) {
      for (var i = this.dpN - 1; i >= 0; i--) {
        var d = this.dpD[i];
        d.life -= dt;
        // Magnetise once the ship is close, so a generous drop is never lost.
        var dx = this.px - d.x, dy = this.py - d.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 76 || d.mag) {
          d.mag = 1;
          var k = 340;
          d.vx += (dx / (dist || 1)) * k * dt;
          d.vy += (dy / (dist || 1)) * k * dt;
          d.vx *= 0.94; d.vy *= 0.94;
        } else {
          d.vy += 130 * dt;
          if (d.vy > 90) d.vy = 90;
          d.vx *= 0.99;
        }
        d.x += d.vx * dt; d.y += d.vy * dt;
        if (d.x < 10) { d.x = 10; d.vx = Math.abs(d.vx); }
        if (d.x > GW - 10) { d.x = GW - 10; d.vx = -Math.abs(d.vx); }
        if (dist < 15) { this.collectDrop(d.kind, d.x, d.y); this.removeDrop(i); continue; }
        if (d.life <= 0 || d.y > GH + 30) this.removeDrop(i);
      }
    },
    collectDrop: function (kind, x, y) {
      var mult = this.mult();
      if (kind === 'power') {
        if (this.power < MAX_POWER) {
          this.power++;
        } else {
          this.addScore(2500 * mult);
        }
        kit.audio.sfx('pickup');
      } else if (kind === 'bomb') {
        if (this.bombs < MAX_BOMBS) {
          this.bombs++;
        } else {
          this.addScore(3000 * mult);
        }
        kit.audio.sfx('pickup');
      } else if (kind === 'shield') {
        this.shield = 6;
        this.pInv = Math.max(this.pInv, 0.4);
        kit.audio.sfx('pickup');
      } else if (kind === 'extend') {
        if (this.lives < MAX_LIVES) {
          this.lives++;
        } else {
          this.addScore(8000 * mult);
        }
        kit.audio.sfx('extend');
      } else {
        var v = 1800 * mult;
        this.addScore(v);
        this.meter = Math.min(METER_MAX, this.meter + 6);
        kit.audio.sfx('pickup');
      }
      if (motionOn()) this.fxGraze.explode(fxCount(6), x, y);
    },

    /* =================================================== collision */
    collide: function () {
      var i, j, d, e;

      // Player shots against enemies, pods, boss.
      for (i = this.pbN - 1; i >= 0; i--) {
        d = this.pbD[i];
        var consumed = false;
        for (j = this.enN - 1; j >= 0; j--) {
          e = this.enD[j];
          if (e.st === 'wait') continue;
          var dx = d.x - e.x, dy = d.y - e.y;
          if (dx * dx + dy * dy < e.r * e.r) {
            this.damageEnemy(j, d.dmg);
            if (motionOn()) this.fxHit.explode(1, d.x, d.y);
            if (this.sfxCd <= 0) { kit.audio.sfx('hit', { volume: 0.3 }); this.sfxCd = 0.04; }
            consumed = true;
            break;
          }
        }
        if (consumed) { this.removePB(i); continue; }

        var b = this.boss;
        if (b && (b.state === 'fight' || b.state === 'break')) {
          var hitPod = false;
          for (var k = 0; k < b.pods.length; k++) {
            var pod = b.pods[k];
            if (pod.hp <= 0) continue;
            var pdx = d.x - (b.x + pod.ox), pdy = d.y - (b.y + pod.oy);
            if (pdx * pdx + pdy * pdy < pod.r * pod.r) {
              pod.hp -= d.dmg;
              pod.flash = 0.08;
              this.addScore(d.dmg * 6 * this.mult());
              if (motionOn()) this.fxHit.explode(1, d.x, d.y);
              if (pod.hp <= 0) this.podDestroyed(k);
              hitPod = true;
              break;
            }
          }
          if (hitPod) { this.removePB(i); continue; }
          if (b.state === 'fight') {
            var bdx = d.x - b.x, bdy = (d.y - b.y) * 1.4;
            if (bdx * bdx + bdy * bdy < 42 * 42) {
              this.damageBoss(d.dmg);
              if (motionOn()) this.fxHit.explode(1, d.x, d.y);
              if (this.sfxCd <= 0) { kit.audio.sfx('hit', { volume: 0.25 }); this.sfxCd = 0.04; }
              this.removePB(i);
              continue;
            }
          }
        }
      }

      if (this.phase === 'dead') return;

      // Enemy bullets: hit, then graze.
      var grazeR = this.pFocus ? GRAZE_R_FOCUS : GRAZE_R;
      var invulnerable = this.pInv > 0 || this.shield > 0;
      for (i = this.ebN - 1; i >= 0; i--) {
        d = this.ebD[i];
        var ddx = d.x - this.px, ddy = d.y - this.py;
        var dd = ddx * ddx + ddy * ddy;
        var hr = d.r + PLAYER_R;
        if (dd < hr * hr) {
          if (!invulnerable) { this.playerHit(); return; }
          continue;
        }
        var gr = d.r + grazeR;
        if (!d.grazed && dd < gr * gr && !invulnerable) {
          d.grazed = 1;
          this.grazeTotal++;
          this.stageStats.graze++;
          this.logGraze();
          this.meter = Math.min(METER_MAX, this.meter + METER_PER_GRAZE);
          this.addScore(30 * this.mult());
          if (this.grazeSfxCd <= 0) { kit.audio.sfx('graze', { volume: 0.35 }); this.grazeSfxCd = 0.055; }
          if (motionOn()) this.fxGraze.explode(1, d.x, d.y);
        }
      }

      // Enemy bodies.
      for (j = this.enN - 1; j >= 0; j--) {
        e = this.enD[j];
        if (e.st === 'wait') continue;
        var edx = e.x - this.px, edy = e.y - this.py;
        var er = e.r + PLAYER_R;
        if (edx * edx + edy * edy < er * er && !invulnerable) { this.playerHit(); return; }
      }
      var bb = this.boss;
      if (bb && bb.state === 'fight' && !invulnerable) {
        var cdx = bb.x - this.px, cdy = (bb.y - this.py) * 1.4;
        if (cdx * cdx + cdy * cdy < 34 * 34) this.playerHit();
      }
    },

    playerHit: function () {
      this.lives--;
      this.meter = 0;
      this.power = Math.max(1, this.power - 1);
      this.pInv = 2.7;
      this.dmgVig = 1;
      this.flash = motionOn() ? 0.5 : 0.2;
      this.shake(16, 0.6);
      this.hitStopFor(0.09);
      kit.audio.sfx('death');
      if (motionOn()) {
        this.fxBoom.explode(fxCount(22), this.px, this.py);
        this.fxShard.explode(fxCount(14), this.px, this.py);
      }
      this.ebN = 0;
      this.bombs = Math.max(this.bombs, START_BOMBS);
      this.px = GW / 2; this.py = GH - 120;
      this.driveId = null;
      this.roles = {};
      if (this.lives <= 0) this.runOver();
    },

    /* =================================================== score */
    mult: function () { return 1 + Math.min(MULT_MAX - 1, this.meter * 0.08); },
    addScore: function (v) {
      var n = Math.round(v);
      this.score += n;
      this.stageStats.score += n;
      if (this.score > 99999999) this.score = 99999999;
    },

    shake: function (mag, ms) {
      if (!motionOn()) return;
      this.shakeMag = Math.max(this.shakeMag, mag);
      this.shakeT = Math.max(this.shakeT, ms);
      kit.juice.shake(mag, ms * 1000);
    },
    hitStopFor: function (s) {
      if (!motionOn()) return;
      this.hitStop = Math.max(this.hitStop, s);
    },

    /* =================================================== notices */
    /* One notice owns the transient slot. Boundary beats use the small center
     * plate only at stage/run boundaries; live events use the corner chip.
     * Coach copy shares the same queue, so it can never overlap either one. */
    queueNotice: function (kind, main, sub, hold, color, priority) {
      if (!main) return;
      if (!this.noticeQueue) this.noticeQueue = [];
      var item = {
        kind: kind, main: String(main), sub: sub || '',
        hold: hold || (kind === 'chip' ? 0.82 : 2.5), color: color || CSS.white
      };
      if (priority) {
        this.noticeQueue.length = 0;
        if (this.noticeActive) this.endNotice();
        this.noticeQueue.push(item);
      } else if (kind === 'chip') {
        var queuedChips = 0, i;
        if (this.noticeActive && this.noticeActive.kind === 'chip' && this.noticeActive.main === item.main) return;
        for (i = 0; i < this.noticeQueue.length; i++) {
          if (this.noticeQueue[i].kind !== 'chip') continue;
          queuedChips++;
          if (this.noticeQueue[i].main === item.main) return;
        }
        if (queuedChips >= 3) return;
        this.noticeQueue.push(item);
      } else {
        this.noticeQueue.push(item);
      }
      this.pumpNotice();
    },
    showBoundary: function (main, hold, color) {
      this.queueNotice('boundary', main, '', hold || 2.2, color || CSS.white, true);
    },
    showChip: function (text, color) {
      this.queueNotice('chip', text, '', 0.82, color || CSS.white, false);
    },
    showCoach: function (text, secs) {
      if (text) this.queueNotice('coach', text, '', Math.min(2.6, secs || 2.5), CSS.amber, false);
    },
    pumpNotice: function () {
      if (this.noticeActive || !this.noticeQueue || !this.noticeQueue.length || this.overlayMode) return;
      this.noticeActive = this.noticeQueue.shift();
      if (this.noticeActive.kind === 'boundary') this.startBoundaryNotice(this.noticeActive);
      else if (this.noticeActive.kind === 'chip') this.startChipNotice(this.noticeActive);
      else this.startCoachNotice(this.noticeActive);
    },
    endNotice: function () {
      if (this.bannerTween) { this.bannerTween.remove(); this.bannerTween = null; }
      this.tweens.killTweensOf(this.bannerBox);
      this.tweens.killTweensOf(this.chipBox);
      this.tweens.killTweensOf(this.coach);
      this.bannerBox.setAlpha(0);
      this.chipBox.setAlpha(0);
      this.coach.setAlpha(0);
      this.noticeActive = null;
    },
    clearNotices: function () {
      this.noticeQueue = [];
      this.endNotice();
    },
    startBoundaryNotice: function (item) {
      var self = this, box = this.bannerBox, base = this.bannerBaseScale;
      var inDur = motionOn() ? 260 : 120, outDur = motionOn() ? 280 : 140;
      setTextIfChanged(this.bannerMain, item.main);
      setColorIfChanged(this.bannerMain, item.color);
      box.setAlpha(0).setScale(motionOn() ? base * 0.72 : base, motionOn() ? 0.82 : 1);
      this.bannerTween = this.tweens.add({
        targets: box, scaleX: base, scaleY: 1, alpha: 1,
        duration: inDur, ease: motionOn() ? 'Back.easeOut' : 'Linear',
        onComplete: function () {
          self.bannerTween = self.tweens.add({
            targets: box, alpha: 0, scaleY: motionOn() ? 0.82 : 1,
            delay: Math.max(0, item.hold * 1000 - inDur - outDur), duration: outDur,
            ease: 'Cubic.easeIn',
            onComplete: function () { self.endNotice(); self.pumpNotice(); }
          });
        }
      });
    },
    startChipNotice: function (item) {
      var self = this, box = this.chipBox;
      var inDur = motionOn() ? 90 : 45, outDur = motionOn() ? 150 : 80;
      setTextIfChanged(this.chipText, item.main);
      setColorIfChanged(this.chipText, item.color);
      box.setAlpha(0).setScale(1);
      this.tweens.add({
        targets: box, alpha: 1, duration: inDur,
        onComplete: function () {
          self.tweens.add({
            targets: box, alpha: 0,
            delay: Math.max(0, item.hold * 1000 - inDur - outDur), duration: outDur,
            ease: 'Cubic.easeIn',
            onComplete: function () { self.endNotice(); self.pumpNotice(); }
          });
        }
      });
    },
    startCoachNotice: function (item) {
      var self = this, inDur = motionOn() ? 180 : 80, outDur = motionOn() ? 480 : 220;
      setTextIfChanged(this.coach, item.main);
      setColorIfChanged(this.coach, item.color);
      this.coach.setAlpha(0);
      this.tweens.add({
        targets: this.coach, alpha: 0.9, duration: inDur,
        onComplete: function () {
          self.tweens.add({
            targets: self.coach, alpha: 0.05,
            delay: Math.max(0, item.hold * 1000), duration: outDur,
            ease: 'Cubic.easeIn',
            onComplete: function () { self.endNotice(); self.pumpNotice(); }
          });
        }
      });
    },

    /* =================================================== end states */
    runOver: function () {
      this.phase = 'dead';
      this.pAlive = false;
      kit.audio.stopMusic(600);
      kit.audio.sfx('gameover');
      if (this.score > save.best) { save.best = this.score; }
      save.totalGraze += this.grazeTotal;
      persist();
      var canContinue = this.continuesLeft > 0 && this.mode !== '1cc';
      this.openOverlay(canContinue ? 'continue' : 'gameover');
    },

    winRun: function () {
      this.phase = 'win';
      kit.audio.stopMusic(800);
      kit.audio.sfx('clear');
      if (this.score > save.best) save.best = this.score;
      save.totalGraze += this.grazeTotal;
      save.runs++;
      if (this.mode === 'run' || this.mode === '1cc') save.cleared = true;
      if (this.mode === '1cc' && !this.usedContinue) save.oneCC = true;
      persist();
      this.openOverlay('win');
    },

    openOverlay: function (mode) {
      this.clearNotices();
      this.overlayMode = mode;
      this.ovPromptT = 0.8;
      this.overlay.setVisible(true);
      var medal = this.lastMedal || 0;
      if (mode === 'continue') {
        setTextIfChanged(this.ovTitle, 'SHIP LOST');
        setColorIfChanged(this.ovTitle, CSS.rose);
        setTextIfChanged(this.ovSub, this.continuesLeft + ' continue' + (this.continuesLeft === 1 ? '' : 's') + ' left');
        setTextIfChanged(this.ovBody,
          'SCORE ' + commas(this.score) + '\nGRAZE ' + commas(this.grazeTotal) +
          '\n\nA continue keeps your score\nbut ends the 1CC run.');
        this.ovMedal.setVisible(false);
        setTextIfChanged(this.ovPrompt, 'TAP or ENTER to continue');
      } else if (mode === 'gameover') {
        setTextIfChanged(this.ovTitle, 'GAME OVER');
        setColorIfChanged(this.ovTitle, CSS.rose);
        setTextIfChanged(this.ovSub, this.mode === '1cc' ? '1CC attempt ended' : 'No continues left');
        setTextIfChanged(this.ovBody,
          'SCORE ' + commas(this.score) + '\nBEST  ' + commas(save.best) +
          '\nGRAZE ' + commas(this.grazeTotal));
        this.ovMedal.setVisible(false);
        setTextIfChanged(this.ovPrompt, 'TAP or ENTER for the menu');
      } else {
        var oneCC = this.mode === '1cc' && !this.usedContinue;
        setTextIfChanged(this.ovTitle, oneCC ? '1CC CLEAR' : 'ALL CLEAR');
        setColorIfChanged(this.ovTitle, oneCC ? CSS.amber : CSS.cyan);
        setTextIfChanged(this.ovSub, oneCC ? 'The top medal is yours' : (this.mode === 'rush' ? 'Boss Rush complete' : 'Stage Run complete'));
        setTextIfChanged(this.ovBody,
          'SCORE ' + commas(this.score) + '\nBEST  ' + commas(save.best) +
          '\nGRAZE ' + commas(this.grazeTotal) +
          '\n\n' + SHContent.unlockHint(effectiveSave()));
        this.ovMedal.setVisible(medal > 0);
        this.ovMedal.setFrame('medal_' + SHContent.medalName(medal));
        setTextIfChanged(this.ovPrompt, 'TAP or ENTER for the menu');
      }
    },
    stepOverlay: function (dt) {
      if (this.ovPromptT > 0) this.ovPromptT -= dt;
    },
    overlayTap: function () {
      if (this.ovPromptT > 0) return;
      var mode = this.overlayMode;
      this.overlayMode = null;
      this.overlay.setVisible(false);
      kit.audio.sfx('ui');
      if (mode === 'continue') {
        this.continuesLeft--;
        this.usedContinue = true;
        this.lives = START_LIVES;
        this.bombs = START_BOMBS;
        this.power = Math.max(this.power, 2);
        this.pInv = 2.6;
        this.phase = this.boss ? 'boss' : (this.stage.waves.length && this.waveIdx < this.stage.waves.length ? 'waves' : 'warn');
        this.pAlive = true;
        this.ebN = 0;
        kit.audio.music(this.boss ? 'm_boss' : 'm_field', 500);
        this.showChip('CONTINUE USED', CSS.rose);
      } else {
        this.scene.start('Menu');
      }
    },

    /* =================================================== render */
    render: function () {
      var i, d;
      var t = this.artT;

      // Parallax. Speed is a stage identity, not a global.
      var sc = (this.stageDef && this.stageDef.scroll) || 1;
      this.neb.tilePositionY -= 7 * sc * STEP;
      this.band.tilePositionY -= 34 * sc * STEP;
      this.far.tilePositionY -= 58 * sc * STEP;
      this.near.tilePositionY -= 128 * sc * STEP;

      // Camera shake, read from the kit so the accessibility switch owns it.
      var jf = kit.juice.frame();
      this.cameras.main.setScroll(this.camBaseX + jf.dx * 0.6, this.camBaseY + jf.dy * 0.6);

      // Enemy bullets.
      var n = this.ebN;
      for (i = 0; i < n; i++) {
        var bob = this.ebB[i];
        if (!bob) continue;
        d = this.ebD[i];
        bob.x = d.x - 11;
        bob.y = d.y - 11;
        if (!bob.visible) bob.visible = true;
        if (bob.frame && bob.frame.name !== d.frame) bob.setFrame(d.frame);
      }
      for (i = n; i < this.ebBuilt; i++) {
        if (this.ebB[i] && this.ebB[i].visible) this.ebB[i].visible = false; else break;
      }

      // Player shots.
      n = this.pbN;
      for (i = 0; i < n; i++) {
        var pbob = this.pbB[i];
        if (!pbob) continue;
        d = this.pbD[i];
        pbob.x = d.x - 11;
        pbob.y = d.y - 11;
        if (!pbob.visible) pbob.visible = true;
        if (pbob.frame && pbob.frame.name !== d.frame) pbob.setFrame(d.frame);
      }
      for (i = n; i < this.pbBuilt; i++) {
        if (this.pbB[i] && this.pbB[i].visible) this.pbB[i].visible = false; else break;
      }

      // Enemies.
      n = this.enN;
      for (i = 0; i < n; i++) {
        var spr = this.enS[i];
        if (!spr) continue;
        var e = this.enD[i];
        if (e.st === 'wait') { if (spr.visible) spr.visible = false; continue; }
        spr.x = e.x; spr.y = e.y;
        if (!spr.visible) spr.visible = true;
        var wanted = SHArt.enemyFrame(e.kind, e.flash > 0 ? 1 : 0);
        if (spr.frame.name !== wanted) spr.setFrame(wanted);
        spr.rotation = e.kind === 'orb' ? e.life * 1.4 : 0;
      }
      for (i = n; i < this.enBuilt; i++) {
        if (this.enS[i] && this.enS[i].visible) this.enS[i].visible = false; else break;
      }

      // Drops.
      n = this.dpN;
      for (i = 0; i < n; i++) {
        var ds = this.dpS[i];
        if (!ds) continue;
        d = this.dpD[i];
        ds.x = d.x; ds.y = d.y;
        if (!ds.visible) ds.visible = true;
        var df = SHArt.dropFrame(d.kind);
        if (ds.frame.name !== df) ds.setFrame(df);
        ds.rotation = Math.sin(t * 3 + d.x * 0.05) * 0.25;
        ds.setAlpha(d.life < 2 ? (Math.floor(t * 12) % 2 ? 0.35 : 1) : 1);
      }
      for (i = n; i < this.dpBuilt; i++) {
        if (this.dpS[i] && this.dpS[i].visible) this.dpS[i].visible = false; else break;
      }

      // Gate.
      if (this.gate.active) {
        this.gateL.setPosition(this.gate.x - this.gate.w / 2, this.gate.y);
        this.gateR.setPosition(this.gate.x + this.gate.w / 2, this.gate.y);
        var ga = this.gate.taken ? 0.25 : (0.6 + Math.sin(t * 8) * 0.3);
        this.gateL.setAlpha(ga); this.gateR.setAlpha(ga);
      }

      // Boss.
      var b = this.boss;
      if (b) {
        this.bossSpr.setPosition(b.x, b.y);
        var bstate = b.flash > 0 ? 1 : (b.state === 'dying' ? 2 : 0);
        if (this.bossSpr.frame.name !== 'boss_' + bstate) this.bossSpr.setFrame('boss_' + bstate);
        var podsAlive = 0;
        for (i = 0; i < MAX_PODS; i++) {
          var pod = b.pods[i];
          if (!pod || pod.hp <= 0) {
            if (this.podSpr[i].visible) this.podSpr[i].visible = false;
            if (this.podBar[i].visible) this.podBar[i].visible = false;
            continue;
          }
          podsAlive++;
          var px = b.x + pod.ox, py = b.y + pod.oy;
          this.podSpr[i].setPosition(px, py).setVisible(true);
          this.podSpr[i].rotation = t * 1.1 * (i % 2 ? -1 : 1);
          var pf = SHArt.podFrame(pod.hp / pod.maxhp, pod.flash > 0);
          if (this.podSpr[i].frame.name !== pf) this.podSpr[i].setFrame(pf);
          var frac = clamp(pod.hp / pod.maxhp, 0, 1);
          this.podBar[i].setVisible(true).setPosition(px - 13, py - 22).setOrigin(0, 0.5);
          this.podBar[i].setDisplaySize(Math.max(1, 26 * frac), 3);
          this.podBar[i].setTint(frac > 0.6 ? 0xffd166 : (frac > 0.3 ? 0xff8a4c : 0xff4d6d));
        }
        SH_STATE.podsAlive = podsAlive;
      } else {
        SH_STATE.podsAlive = 0;
      }

      // Player.
      var blink = this.pInv > 0 && (Math.floor(t * 22) % 2 === 0);
      this.ship.setPosition(this.px, this.py);
      this.ship.setAlpha(this.phase === 'dead' ? 0 : (blink ? 0.4 : 1));
      var sf = this.phase === 'dead' ? 'ship_2' : 'ship_0';
      if (this.ship.frame.name !== sf) this.ship.setFrame(sf);
      this.flame.setPosition(this.px, this.py + 10);
      this.flame.setVisible(this.phase !== 'dead');
      var ff = 'flame_' + (Math.floor(t * 24) % 2);
      if (this.flame.frame.name !== ff) this.flame.setFrame(ff);
      this.flame.setScale(this.pFocus ? 0.6 : 1);
      this.focusRing.setPosition(this.px, this.py).setVisible(this.pFocus && this.phase !== 'dead');
      this.focusRing.rotation = t * 0.8;
      this.hitDot.setPosition(this.px, this.py).setVisible(this.pFocus && this.phase !== 'dead');
      if (this.shield > 0) {
        this.focusRing.setVisible(true);
        this.focusRing.setAlpha(0.5 + Math.sin(t * 10) * 0.3);
      } else if (this.pFocus) {
        this.focusRing.setAlpha(1);
      }

      // Screen effects.
      this.flashPlate.setAlpha(Math.min(0.72, this.flash));
      this.vignette.setAlpha(Math.min(0.85, this.dmgVig));

      this.renderHUD();
    },

    renderHUD: function () {
      this.gScore.setText(pad(this.score, 8));
      var m = this.mult();
      this.gMult.setText('x' + m.toFixed(1));
      this.gMult.setTint(m >= 7.5 ? 0xffd166 : (m > 1.05 ? 0x7cf5c0 : 0x8fa6c8));
      this.meterBar.setDisplaySize(Math.max(1, 82 * clamp(this.meter / METER_MAX, 0, 1)), 4);
      this.meterBar.setTint(m >= 7.5 ? 0xffd166 : (m > 1.05 ? 0x7cf5c0 : 0x54607a));
      if (Math.abs(m - this.multShown) > 0.35) {
        this.multShown = m;
        if (motionOn()) this.gMult.pop(this, 1.35);
      }

      var i;
      for (i = 0; i < MAX_LIVES; i++) this.lifePips[i].setVisible(i < this.lives);
      for (i = 0; i < MAX_BOMBS; i++) this.bombPips[i].setVisible(i < this.bombs);
      for (i = 0; i < MAX_POWER; i++) {
        this.powerPips[i].setTint(i < this.power ? 0x7cf5c0 : 0x263451);
      }

      var bf = this.bombs > 0 ? 'bomb_1' : 'bomb_0';
      if (this.bombBtn.frame.name !== bf) this.bombBtn.setFrame(bf);
      this.gBombN.setText(String(this.bombs));

      var b = this.boss;
      if (b && b.state !== 'enter') {
        var frac = clamp(b.hp / b.maxhp, 0, 1);
        this.bossBar.setDisplaySize(Math.max(1, (GW - 40) * frac), 8);
        this.bossBar.setTint([0xff5f9e, 0xffd166, 0x62e8ff, 0xb07cff][b.phaseIdx % 4]);
        for (i = 0; i < this.bossPips.length; i++) {
          if (!this.bossPips[i].visible) continue;
          this.bossPips[i].setTint(i <= b.phaseIdx ? 0xffffff : 0x54607a);
        }
      }

      // Verification hook, mutated in place.
      SH_STATE.stage = this.stageIdx;
      SH_STATE.stageKey = this.stageDef ? this.stageDef.key : '';
      SH_STATE.stageName = this.stageDef ? this.stageDef.name : '';
      SH_STATE.phase = this.overlayMode ? this.overlayMode : this.phase;
      SH_STATE.lives = this.lives;
      SH_STATE.bombs = this.bombs;
      SH_STATE.power = this.power;
      SH_STATE.multiplier = Math.round(m * 100) / 100;
      SH_STATE.meter = Math.round(this.meter);
      SH_STATE.graze = this.grazeTotal;
      SH_STATE.score = this.score;
      SH_STATE.bossPhase = b ? b.phaseIdx : -1;
      SH_STATE.bossHp = b ? Math.max(0, Math.round(b.hp)) : 0;
      SH_STATE.bossMaxHp = b ? b.maxhp : 0;
      SH_STATE.bossName = b ? b.name : '';
      SH_STATE.bullets = this.ebN;
      SH_STATE.noContinue = !this.usedContinue;
      SH_STATE.reducedMotion = !motionOn();
    }
  });

  /* ================================================== boot phaser */
  var config = {
    type: Phaser.AUTO,
    parent: document.body,
    backgroundColor: CSS.ink,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: GW,
      height: GH
    },
    // GGKit is the sole input implementation in this title. Phaser's own
    // listeners are switched off so there is exactly one pointer identity map.
    input: { keyboard: false, mouse: false, touch: false, gamepad: false },
    render: { antialias: true, roundPixels: false, powerPreference: 'high-performance' },
    fps: { target: 60, min: 20 },
    scene: [BootScene, MenuScene, PlayScene]
  };
  config.scale.width = Math.round(GW * RETINA_FACTOR);
  config.scale.height = Math.round(GH * RETINA_FACTOR);
  config.render = Object.assign({}, GGKit.renderDefaults, config.render || {});

  gameRef = new Phaser.Game(config);
  window.__sh.game = gameRef;
})();
