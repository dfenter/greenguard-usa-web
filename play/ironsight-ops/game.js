/* Ironsight Ops - game.js
 * Phaser 3 presentation layer. Landscape top down tactical shooter.
 *
 * GGKit owns lifecycle, pause, rotate, per pointer identity, guarded saves,
 * audio buses, the loading screen, the settings shell and the juice budget.
 * Nothing in this file re-implements any of those.
 *
 * ARCHITECTURE NOTES, each tied to a defect class this fleet has shipped:
 *
 *  FIXED SIM STEP. The sim runs on a 60 Hz accumulator with a hard step
 *  ceiling. simT lives in io_sim and is advanced only by IORules.step; the
 *  art clock is advanced only alongside it, so a stall can never become a
 *  time skip and no clock can run past the stepped sim.
 *
 *  RENDER STATE IS NEVER ON THE SIM ENTITY. Hostiles are index paired with
 *  sprite pairs held in this file. The sim records hold no Phaser object
 *  and the sprites hold no gameplay field.
 *
 *  ONE POOL, INCLUDING FOR THE HARNESS. window.__io.state is the live sim
 *  summary object, allocated once before Phaser boots and mutated in place.
 *  Force switches are readable from the boot fallback AND the live scene:
 *  calls made before the scene exists are queued and drained on ready.
 *
 *  NO LIVE GRAPHICS. There is not one Phaser Graphics object here. Static
 *  level geometry is baked once into a RenderTexture; rings, plates, bars,
 *  sticks and icons are textures from io_art.js.
 *
 *  POINTER IDENTITY. Touch is read from kit.input.pointers, GGKit's own
 *  WINDOW level map created at kit init. This file adds no canvas level
 *  pointerdown handler for gameplay, so nothing can claim a pointer before
 *  GGKit sees it. Menu screens, which run while the kit is paused, use the
 *  Phaser pointer instead and never touch the gameplay zones.
 */
(function () {
  'use strict';

  var C = IOContent, A = IOArt, K = IOSim, R = IORules;
  var S = K.state, P = S.player;
  var TAU = Math.PI * 2;
  var STEP = 1 / 60;
  var MAX_STEPS = 5;
  var SAVE_VERSION = 1;
  var VERSION = '2026-08-13-aaa';

  var GH = 390;
  var GW = (function () {
    var w = window.innerWidth || 844, h = window.innerHeight || 390;
    var aspect = w / Math.max(1, h);
    if (!isFinite(aspect) || aspect <= 0) aspect = 2.16;
    aspect = Math.max(1.35, Math.min(2.4, aspect));
    return Math.round(GH * aspect);
  })();

  var FONT = 'Verdana, Geneva, system-ui, sans-serif';
  var CSS = A.CSS;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function setTextIfChanged(o, v) { var s = String(v); if (o && o.text !== s) o.setText(s); }
  function setFrameIfChanged(o, f) { if (o && o.frame && o.frame.name !== f) o.setFrame(f); }
  function setTintIfChanged(o, t) { if (o && o._ioTint !== t) { o.setTint(t); o._ioTint = t; } }
  function setColorIfChanged(o, c) { if (o && o._ioColor !== c) { o.setColor(c); o._ioColor = c; } }
  function setVis(o, v) { if (o && o.visible !== v) o.setVisible(v); }
  function fmtTime(t) {
    var s = Math.max(0, Math.floor(t));
    var m = (s / 60) | 0;
    var r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }

  /* ------------------------------------------------------------ saves */
  function defaultSave() {
    return {
      v: SAVE_VERSION, medals: {}, best: { survival: 0, trial: 0 }, scores: {},
      loadout: { primary: 'ar', secondary: 'pistol', gadget: 'frag' },
      tutorial: false, assist: true, totalScore: 0
    };
  }
  function validateSave(o) {
    if (!o || typeof o !== 'object' || o.v !== SAVE_VERSION) return false;
    if (!o.medals || typeof o.medals !== 'object') return false;
    if (!o.best || typeof o.best !== 'object') return false;
    if (!o.loadout || typeof o.loadout !== 'object') return false;
    /* persisted ids must validate against the live content registry */
    if (!C.WEAPONS[o.loadout.primary] || C.WEAPONS[o.loadout.primary].slot !== 'primary') return false;
    if (!C.WEAPONS[o.loadout.secondary] || C.WEAPONS[o.loadout.secondary].slot !== 'secondary') return false;
    if (!C.GADGETS[o.loadout.gadget]) return false;
    for (var k in o.medals) {
      if (!o.medals.hasOwnProperty(k)) continue;
      if (!isFinite(o.medals[k]) || o.medals[k] < 0 || o.medals[k] > 3) return false;
    }
    return true;
  }

  /* ------------------------------------------------- harness contract */
  var HS = {
    ready: false, version: VERSION, mode: 'boot', screen: 'boot',
    mission: -1, missionName: '', stage: 0, stageKind: '', stageText: '',
    progress: 0, score: 0, health: 100, ammo: 0, reserve: 0, weapon: 'ar',
    enemies: 0, wave: 0, time: 0, medals: 0, intel: 0, intelNeeded: 0,
    accuracy: 0, paused: false, result: '', frame: 0, unlocked: 0
  };
  var forceQueue = [];
  var liveScene = null;
  window.__io = {
    state: HS,
    version: VERSION,
    forceMode: function (mode, arg) {
      if (liveScene && HS.ready) return liveScene.forceMode(mode, arg);
      forceQueue.push(['mode', mode, arg]);
      return true;
    },
    forceStage: function (n) {
      if (liveScene && HS.ready) return liveScene.forceStage(n);
      forceQueue.push(['stage', n, 0]);
      return true;
    }
  };

  /* --------------------------------------------------------- GGKit */
  var kit = GGKit.create({
    slug: 'ironsight-ops',
    orientation: 'landscape',
    validateSave: validateSave,
    onPause: function () { HS.paused = true; if (liveScene) liveScene.onKitPause(); },
    onResume: function () { HS.paused = false; if (liveScene) liveScene.onKitResume(); },
    onRestart: function () { if (liveScene) liveScene.restartRun(); }
  });

  var profile = kit.save.get(defaultSave());
  if (!validateSave(profile)) profile = defaultSave();
  function saveProfile() { kit.save.set(profile); }
  function totalMedals() {
    var t = 0;
    for (var k in profile.medals) if (profile.medals.hasOwnProperty(k)) t += profile.medals[k] | 0;
    return t;
  }
  function unlocked() { return C.unlockedIds(totalMedals()); }
  function missionOpen(i) {
    if (i <= 0) return true;
    var prev = C.mission(i - 1);
    return (profile.medals[prev.id] | 0) > 0;
  }

  var AUDIO = {
    m_menu: 'assets/m_menu.mp3', m_ops: 'assets/m_ops.mp3', m_contact: 'assets/m_contact.mp3',
    shot_ar: 'assets/shot_ar.mp3', shot_smg: 'assets/shot_smg.mp3', shot_dmr: 'assets/shot_dmr.mp3',
    shot_sg: 'assets/shot_sg.mp3', shot_pistol: 'assets/shot_pistol.mp3',
    hit_body: 'assets/hit_body.mp3', hit_wall: 'assets/hit_wall.mp3', kill: 'assets/kill.mp3',
    reload: 'assets/reload.mp3', swap: 'assets/swap.mp3', explode: 'assets/explode.mp3',
    flash: 'assets/flash.mp3', ping: 'assets/ping.mp3', objective: 'assets/objective.mp3',
    medal: 'assets/medal.mp3', hurt: 'assets/hurt.mp3', down: 'assets/down.mp3',
    empty: 'assets/empty.mp3', vault: 'assets/vault.mp3', ui: 'assets/ui.mp3',
    breach: 'assets/breach.mp3', alarm: 'assets/alarm.mp3'
  };

  function style(size, color, weight) {
    return {
      fontFamily: FONT, fontSize: size + 'px', fontStyle: weight || 'bold',
      color: color || CSS.text, stroke: '#04080c', strokeThickness: 3,
      shadow: { offsetX: 0, offsetY: 1, color: '#000000', blur: 4, fill: true }
    };
  }

  /* =================================================== the one scene */
  var Scene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function IronsightScene() {
      Phaser.Scene.call(this, { key: 'ironsight' });
    },

    create: function () {
      liveScene = this;
      var self = this;
      this.screen = 'boot';
      this.acc = 0;
      this.artT = 0;
      this.bootDone = false;
      this.screenObjs = [];
      this.screenButtons = [];
      this.chipQueue = [];
      this.chipT = 0;
      this.bannerT = 0;
      this.coachT = 0;
      this.coachKey = '';
      this.tutorialStep = -1;
      this.tutorialT = 0;
      this.moveHeld = 0;
      this.shotsFired = 0;
      this.flashT = 0;
      this.dmgT = 0;
      this.hitmarkT = 0;
      this.musicMode = '';
      this.contactT = 0;
      this.pendingResult = null;
      this.worldBuilt = false;
      this.btnEdge = {};
      this.prevKeys = {};
      this.crect = { x: 0, y: 0, sx: 1, sy: 1 };
      this.ctl = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, fireEdge: false };
      this.stickL = { active: false, ox: 0, oy: 0, x: 0, y: 0 };
      this.stickR = { active: false, ox: 0, oy: 0, x: 0, y: 0 };

      kit.loader.show('Ironsight Ops');
      kit.loader.progress(0.04);

      /* Art is baked in stages so the loading bar shows real progress. */
      A.build(this, C, function (f) { kit.loader.progress(0.05 + f * 0.55); });

      kit.audio.register(AUDIO);

      this.buildWorldLayers();
      this.buildHud();
      this.buildControls();
      this.layout();

      this.input.on('pointerdown', function (p) { self.onScreenTap(p.x, p.y); });
      this.scale.on('resize', function () { self.scale.updateBounds(); self.updateCanvasRect(); });
      this.updateCanvasRect();

      /* UI keys are read from a window listener added AFTER GGKit init, so
       * menus still answer while the kit holds the sim paused. */
      window.addEventListener('keydown', function (e) { self.onUiKey(e); });

      /* Only the cues needed on the first frame are fetched during boot; the
       * three music loops lazy load on their first play, after the first
       * interaction has unlocked audio. */
      var sfxNames = Object.keys(AUDIO).filter(function (k) { return k.indexOf('m_') !== 0; });
      kit.audio.preload(sfxNames).then(function () {
        kit.loader.progress(1);
        self.finishBoot();
      }, function () {
        kit.loader.progress(1);
        self.finishBoot();
      });
      /* Never let a stalled decode hold the title on a loading screen. */
      this.time.delayedCall(4500, function () { self.finishBoot(); });

      kit.registerPWA();
    },

    finishBoot: function () {
      if (this.bootDone) return;
      this.bootDone = true;
      kit.loader.hide();
      HS.ready = true;
      this.showMenu();
      for (var i = 0; i < forceQueue.length; i++) {
        var q = forceQueue[i];
        if (q[0] === 'mode') this.forceMode(q[1], q[2]);
        else this.forceStage(q[1]);
      }
      forceQueue.length = 0;
    },

    /* ------------------------------------------------- world layers */
    buildWorldLayers: function () {
      var i;
      this.levelRt = null;
      this.propSprites = [];
      this.barrelSprites = [];
      this.lampSprites = [];
      this.intelSprites = [];

      this.legPool = [];
      this.torsoPool = [];
      this.markPool = [];
      for (i = 0; i < K.MAX_ENT; i++) {
        var legs = this.add.image(-999, -999, 'io_legs', 'stand').setDepth(18).setVisible(false).setScale(1.55);
        var torso = this.add.image(-999, -999, 'io_foe', 'idle').setDepth(20).setVisible(false).setScale(1.55);
        this.legPool.push(legs);
        this.torsoPool.push(torso);
      }
      for (i = 0; i < 14; i++) {
        this.markPool.push(this.add.image(-999, -999, 'io_marker', 'm1').setDepth(34).setVisible(false).setScale(0.55));
      }
      this.tracerPool = [];
      this.tracerLive = [];
      for (i = 0; i < K.MAX_TRACER; i++) {
        var t = this.add.image(-999, -999, 'io_tracer').setDepth(30).setVisible(false).setOrigin(1, 0.5);
        if (t.setBlendMode) t.setBlendMode(Phaser.BlendModes.ADD);
        this.tracerPool.push(t);
      }
      this.casings = [];
      for (i = 0; i < 18; i++) {
        this.casings.push({
          img: this.add.image(-999, -999, 'io_chip').setDepth(16).setVisible(false).setScale(0.5),
          x: 0, y: 0, vx: 0, vy: 0, life: 0, rot: 0
        });
      }
      this.ordSprites = [];
      for (i = 0; i < K.MAX_ORD; i++) {
        this.ordSprites.push(this.add.image(-999, -999, 'io_icons', 'frag').setDepth(26).setVisible(false).setScale(0.42));
      }
      this.smokeSprites = [];
      for (i = 0; i < K.MAX_SMOKE; i++) {
        this.smokeSprites.push(this.add.image(-999, -999, 'io_smoke').setDepth(44).setVisible(false).setAlpha(0));
      }

      /* Player rig: legs, torso and the aim reticle. */
      this.pLegs = this.add.image(-999, -999, 'io_legs', 'stand').setDepth(21).setScale(1.75);
      this.pTorso = this.add.image(-999, -999, 'io_torso', 'idle').setDepth(23).setScale(1.75);
      this.pShadow = this.add.image(-999, -999, 'io_dot').setDepth(16).setAlpha(0.34).setScale(1.5, 1.0).setTint(0x000000);
      this.pBase = this.add.image(-999, -999, 'io_base').setDepth(17).setAlpha(0.85).setTint(0x57d6b6).setScale(0.95);
      this.reticle = this.add.image(-999, -999, 'io_ring', 'r0').setDepth(35).setAlpha(0.9);
      this.hitmark = this.add.image(-999, -999, 'io_hitmark').setDepth(36).setVisible(false);
      this.objMarker = this.add.image(-999, -999, 'io_marker', 'm0').setDepth(33).setVisible(false);
      this.objArrow = this.add.image(0, 0, 'io_arrow').setDepth(58).setScrollFactor(0).setVisible(false);

      /* Six pooled particle systems: impact sparks, blood, splinters,
       * explosion fire, smoke and muzzle dust. */
      this.fx = {};
      this.fx.spark = this.add.particles(0, 0, 'io_spark', {
        lifespan: { min: 90, max: 240 }, speed: { min: 90, max: 320 }, quantity: 1,
        scale: { start: 0.9, end: 0.05 }, alpha: { start: 1, end: 0 }, rotate: { min: 0, max: 360 },
        emitting: false, maxAliveParticles: 90, tint: 0xdfe9f2, blendMode: 'ADD'
      }).setDepth(31);
      this.fx.blood = this.add.particles(0, 0, 'io_dot', {
        lifespan: { min: 180, max: 420 }, speed: { min: 40, max: 190 }, quantity: 1,
        scale: { start: 0.28, end: 0.02 }, alpha: { start: 0.95, end: 0 },
        emitting: false, maxAliveParticles: 90, tint: 0xc8353f
      }).setDepth(29);
      this.fx.splinter = this.add.particles(0, 0, 'io_chip', {
        lifespan: { min: 220, max: 520 }, speed: { min: 40, max: 210 }, quantity: 1,
        scale: { start: 0.8, end: 0.15 }, alpha: { start: 1, end: 0 }, rotate: { min: 0, max: 360 },
        gravityY: 120, emitting: false, maxAliveParticles: 80, tint: 0xc79a5c
      }).setDepth(29);
      this.fx.fire = this.add.particles(0, 0, 'io_dot', {
        lifespan: { min: 240, max: 620 }, speed: { min: 80, max: 340 }, quantity: 1,
        scale: { start: 0.75, end: 0.05 }, alpha: { start: 1, end: 0 },
        emitting: false, maxAliveParticles: 140, tint: [0xfff0c0, 0xffb457, 0xff6a3c], blendMode: 'ADD'
      }).setDepth(32);
      this.fx.smoke = this.add.particles(0, 0, 'io_smoke', {
        lifespan: { min: 700, max: 1500 }, speed: { min: 8, max: 70 }, quantity: 1,
        scale: { start: 0.5, end: 1.5 }, alpha: { start: 0.42, end: 0 },
        emitting: false, maxAliveParticles: 80, tint: 0x9fb2ba
      }).setDepth(43);
      this.fx.dust = this.add.particles(0, 0, 'io_dot', {
        lifespan: { min: 90, max: 220 }, speed: { min: 20, max: 120 }, quantity: 1,
        scale: { start: 0.30, end: 0.02 }, alpha: { start: 0.7, end: 0 },
        emitting: false, maxAliveParticles: 70, tint: 0xffe0a8, blendMode: 'ADD'
      }).setDepth(31);

      /* Screen space mood layers. */
      this.ambient = this.add.image(0, 0, 'io_px').setOrigin(0, 0).setScrollFactor(0).setDepth(40).setAlpha(0);
      this.vignette = this.add.image(0, 0, 'io_vignette').setOrigin(0, 0).setScrollFactor(0).setDepth(46).setAlpha(0.9);
      this.dmgFlash = this.add.image(0, 0, 'io_px').setOrigin(0, 0).setScrollFactor(0).setDepth(47)
        .setTint(0xd32f3a).setAlpha(0);
      this.whiteFlash = this.add.image(0, 0, 'io_px').setOrigin(0, 0).setScrollFactor(0).setDepth(48)
        .setTint(0xffffff).setAlpha(0);
    },

    /* --------------------------------------------------------- HUD */
    buildHud: function () {
      var d = 60;
      this.hud = {};
      this.hud.root = [];
      var self = this;
      function reg(o) { o.setScrollFactor(0).setDepth(d); self.hud.root.push(o); return o; }

      this.hud.hpIcon = reg(this.add.image(0, 0, 'io_icons', 'health').setScale(0.36).setTint(0x7ce6a4));
      this.hud.hpBack = reg(this.add.image(0, 0, 'io_px').setOrigin(0, 0.5).setTint(0x0d161c).setAlpha(0.8));
      this.hud.hpFill = reg(this.add.image(0, 0, 'io_px').setOrigin(0, 0.5).setTint(0x7ce6a4));
      this.hud.hpText = reg(this.add.text(0, 0, '100', style(14, CSS.text)).setOrigin(0, 0.5));

      this.hud.objIcon = reg(this.add.image(0, 0, 'io_icons', 'extract').setScale(0.42).setTint(0xf0b256));
      this.hud.objText = reg(this.add.text(0, 0, '', style(14, CSS.text)).setOrigin(0, 0.5));
      this.hud.objBack = reg(this.add.image(0, 0, 'io_px').setOrigin(0, 0.5).setTint(0x0d161c).setAlpha(0.8));
      this.hud.objFill = reg(this.add.image(0, 0, 'io_px').setOrigin(0, 0.5).setTint(0xf0b256));

      this.hud.foeIcon = reg(this.add.image(0, 0, 'io_icons', 'skull').setScale(0.32).setTint(0xff8d7a));
      this.hud.foeText = reg(this.add.text(0, 0, '0', style(14, CSS.text)).setOrigin(0, 0.5));
      this.hud.timeText = reg(this.add.text(0, 0, '0:00', style(14, CSS.dim)).setOrigin(1, 0.5));

      this.hud.ammoText = reg(this.add.text(0, 0, '30', style(20, CSS.text)).setOrigin(1, 0.5));
      this.hud.resText = reg(this.add.text(0, 0, '/ 210', style(14, CSS.dim)).setOrigin(1, 0.5));
      this.hud.wpnText = reg(this.add.text(0, 0, '', style(14, CSS.dim)).setOrigin(1, 0.5));

      this.hud.chip = reg(this.add.text(0, 0, '', style(14, CSS.mint)).setOrigin(1, 0.5).setAlpha(0));
      this.hud.coach = reg(this.add.text(0, 0, '', style(14, CSS.text)).setOrigin(0.5, 0.5).setAlpha(0));

      this.hud.banner = reg(this.add.text(0, 0, '', style(30, CSS.text)).setOrigin(0.5, 0.5).setAlpha(0).setDepth(80));
      this.hud.bannerSub = reg(this.add.text(0, 0, '', style(15, CSS.amber)).setOrigin(0.5, 0.5).setAlpha(0).setDepth(80));

      this.hud.reloadBack = reg(this.add.image(0, 0, 'io_px').setOrigin(0, 0.5).setTint(0x0d161c).setAlpha(0.85).setVisible(false));
      this.hud.reloadFill = reg(this.add.image(0, 0, 'io_px').setOrigin(0, 0.5).setTint(0x7fc4ff).setVisible(false));
    },

    buildControls: function () {
      var d = 55;
      var self = this;
      function reg(o) { o.setScrollFactor(0).setDepth(d); return o; }
      this.ctlUi = {};
      this.ctlUi.baseL = reg(this.add.image(0, 0, 'io_stick').setAlpha(0.22).setScale(0.62));
      this.ctlUi.knobL = reg(this.add.image(0, 0, 'io_knob').setAlpha(0.32).setScale(0.42));
      this.ctlUi.baseR = reg(this.add.image(0, 0, 'io_stick').setAlpha(0.22).setScale(0.62));
      this.ctlUi.knobR = reg(this.add.image(0, 0, 'io_knob').setAlpha(0.32).setScale(0.42));

      this.buttons = {};
      var names = [
        ['gadget', 'frag', 30], ['reload', 'reload', 26], ['swap', 'swap', 24],
        ['vault', 'vault', 24], ['pause', 'pause', 22]
      ];
      for (var i = 0; i < names.length; i++) {
        var n = names[i];
        var bg = reg(this.add.image(0, 0, 'io_btn', 'b0').setScale(n[2] * 2 / 128));
        var ic = reg(this.add.image(0, 0, 'io_icons', n[1]).setScale(n[2] * 0.042));
        var tx = reg(this.add.text(0, 0, '', style(14, CSS.text)).setOrigin(0.5, 0.5));
        this.buttons[n[0]] = { bg: bg, icon: ic, text: tx, r: n[2], x: 0, y: 0, on: true, down: 0 };
      }
      this.buttons.pause.text.setVisible(false);
    },

    /* ------------------------------------------------------ layout */
    layout: function () {
      var W = GW, H = GH;
      var h = this.hud, b = this.buttons;
      h.hpIcon.setPosition(20, 20);
      h.hpBack.setPosition(32, 20).setDisplaySize(120, 9);
      h.hpFill.setPosition(32, 20).setDisplaySize(120, 9);
      h.hpText.setPosition(158, 20);

      var cx = W * 0.5;
      h.foeIcon.setPosition(216, 20);
      h.foeText.setPosition(228, 20);

      h.objIcon.setPosition(cx - 118, 20);
      h.objText.setPosition(cx - 102, 15);
      h.objBack.setPosition(cx - 102, 30).setDisplaySize(210, 5);
      h.objFill.setPosition(cx - 102, 30).setDisplaySize(0, 5);

      h.ammoText.setPosition(W - 118, 18);
      h.resText.setPosition(W - 114, 20).setOrigin(0, 0.5);
      h.wpnText.setPosition(W - 118, 40);
      h.timeText.setPosition(W - 114, 40).setOrigin(0, 0.5);

      h.chip.setPosition(W - 40, 64);
      h.coach.setPosition(cx, 54);
      h.banner.setPosition(cx, H * 0.44);
      h.bannerSub.setPosition(cx, H * 0.44 + 30);

      h.reloadBack.setPosition(cx - 44, H - 34).setDisplaySize(88, 7);
      h.reloadFill.setPosition(cx - 44, H - 34).setDisplaySize(0, 7);

      this.ctlUi.baseL.setPosition(96, H - 96);
      this.ctlUi.knobL.setPosition(96, H - 96);
      this.ctlUi.baseR.setPosition(W - 210, H - 96);
      this.ctlUi.knobR.setPosition(W - 210, H - 96);

      this.placeButton(b.gadget, W - 46, H - 150);
      this.placeButton(b.reload, W - 46, H - 84);
      this.placeButton(b.swap, W - 104, H - 58);
      this.placeButton(b.vault, W - 104, H - 122);
      this.placeButton(b.pause, W - 30, 24);

      this.ambient.setDisplaySize(W, H);
      this.vignette.setDisplaySize(W, H);
      this.dmgFlash.setDisplaySize(W, H);
      this.whiteFlash.setDisplaySize(W, H);
    },
    placeButton: function (btn, x, y) {
      btn.x = x; btn.y = y;
      btn.bg.setPosition(x, y);
      btn.icon.setPosition(x, y);
      btn.text.setPosition(x + btn.r * 0.72, y + btn.r * 0.72);
    },

    updateCanvasRect: function () {
      var cv = this.game.canvas;
      if (!cv) return;
      var r = cv.getBoundingClientRect();
      this.crect.x = r.left; this.crect.y = r.top;
      this.crect.sx = r.width > 0 ? GW / r.width : 1;
      this.crect.sy = r.height > 0 ? GH / r.height : 1;
    },
    toVX: function (clientX) { return (clientX - this.crect.x) * this.crect.sx; },
    toVY: function (clientY) { return (clientY - this.crect.y) * this.crect.sy; },

    /* =============================================== mission control */
    startRun: function (mode, missionIndex) {
      this.pendingResult = null;
      var lo = profile.loadout;
      var un = unlocked();
      /* guarded: a loadout that lost its unlock falls back to the starter */
      if (!un[lo.primary]) lo.primary = 'ar';
      if (!un[lo.secondary]) lo.secondary = 'pistol';
      if (!un[lo.gadget]) lo.gadget = 'frag';
      R.startMission(mode, missionIndex, lo);
      this.buildWorld();
      this.screen = 'play';
      this.hideScreens();
      this.acc = 0;
      this.chipQueue.length = 0;
      this.chipT = 0;
      this.contactT = 0;
      this.flashT = 0; this.dmgT = 0;
      this.shotsFired = 0; this.moveHeld = 0;
      this.tutorialStep = (mode === 'campaign' && missionIndex === 0 && !profile.tutorial) ? 0 : -1;
      this.tutorialT = 0;
      this.coachT = 0;
      var name = mode === 'campaign' ? ('Operation ' + S.mission.no)
        : (mode === 'survival' ? 'Survival' : 'Shoot House');
      var sub = mode === 'campaign' ? S.mission.name
        : (mode === 'survival' ? 'Hold the harbour' : 'Beat the clock');
      this.showBanner(name, sub, 1.9);
      this.setMusic('ops');
      this.updateHudLabels();
    },
    restartRun: function () {
      if (S.mode === 'campaign') this.startRun('campaign', S.missionIndex);
      else this.startRun(S.mode, 0);
    },

    buildWorld: function () {
      this.clearWorld();
      var th = S.theatre, m = th.mood;
      var W = K.WORLD_W, H = K.WORLD_H, CELL = K.CELL;
      var rt = this.add.renderTexture(0, 0, W, H).setOrigin(0, 0).setDepth(0);
      this.levelRt = rt;
      rt.fill(m.floor, 1, 0, 0, W, H);
      var x, y;
      /* The whole static level is ONE batched draw list. Unbatched, the
       * eight hundred odd calls below cost a 280 ms frame at 4x throttle. */
      var batched = typeof rt.beginDraw === 'function';
      if (batched) rt.beginDraw();
      function put(key, px, py, alpha) {
        if (batched) rt.batchDraw(key, px, py, alpha);
        else rt.draw(key, px, py, alpha);
      }
      for (y = 0; y < H; y += 80) for (x = 0; x < W; x += 80) put('io_floor_' + th.id, x, y, 1);
      /* authored floor markings, deterministic by cell so a rebuild matches */
      for (y = 0; y < K.ROWS; y += 2) {
        for (x = 0; x < K.COLS; x += 3) {
          if (((x * 7 + y * 13) % 3) !== 0) continue;
          if (S.grid[K.idx(x, y)] !== K.FLOOR) continue;
          put('io_deco_' + th.id, x * CELL - 4, y * CELL - 4, 1);
        }
      }
      /* wall drop shadows then wall tops */
      for (y = 0; y < K.ROWS; y++) {
        for (x = 0; x < K.COLS; x++) {
          if (S.cellKind[K.idx(x, y)] !== K.WALL) continue;
          put('io_shadow', x * CELL - 1, y * CELL + 3, 1);
        }
      }
      for (y = 0; y < K.ROWS; y++) {
        for (x = 0; x < K.COLS; x++) {
          if (S.cellKind[K.idx(x, y)] !== K.WALL) continue;
          put('io_wall_' + th.id, x * CELL, y * CELL, 1);
        }
      }
      if (batched) rt.endDraw();
      /* Theatre mood is baked into the level rather than composited as a
       * full screen quad every frame, which also lets bodies and VFX sit
       * brighter than the floor they stand on. */
      rt.fill(m.ambient, m.ambientAlpha, 0, 0, W, H);

      /* destructible cells and barrels as sprites */
      var i;
      for (y = 0; y < K.ROWS; y++) {
        for (x = 0; x < K.COLS; x++) {
          var ci = K.idx(x, y), kind = S.cellKind[ci];
          if (kind !== K.CRATE && kind !== K.GLASS) continue;
          var key = kind === K.CRATE ? 'io_crate' : 'io_glass';
          var img = this.add.image(x * CELL + 20, y * CELL + 20, key, kind === K.CRATE ? 'c0' : 'g0').setDepth(12);
          this.propSprites.push({ img: img, ci: ci, kind: kind });
        }
      }
      for (i = 0; i < S.barrels.length; i++) {
        var br = S.barrels[i];
        this.barrelSprites.push(this.add.image(br.cx * CELL + 20, br.cy * CELL + 20, 'io_barrel', 'b0').setDepth(13));
      }
      for (i = 0; i < S.lamps.length; i++) {
        var lp = S.lamps[i];
        var li = this.add.image(lp.cx * CELL + 20, lp.cy * CELL + 20, 'io_lamp').setDepth(42)
          .setTint(m.lamp).setAlpha(m.lampAlpha).setScale(1.9);
        if (li.setBlendMode) li.setBlendMode(Phaser.BlendModes.ADD);
        this.lampSprites.push(li);
      }
      for (i = 0; i < S.intel.length; i++) {
        var it = S.intel[i];
        var si = this.add.image(-999, -999, 'io_intel').setDepth(15).setVisible(false);
        this.intelSprites.push(si);
        if (it.active) si.setPosition(it.x, it.y).setVisible(true);
      }

      this.ambient.setTint(m.ambient).setAlpha(m.ambientAlpha * 0.28);
      this.cameras.main.setBounds(0, 0, W, H);
      this.cameras.main.setBackgroundColor(m.floor);
      this.worldBuilt = true;
    },
    clearWorld: function () {
      var i;
      if (this.levelRt) { this.levelRt.destroy(); this.levelRt = null; }
      for (i = 0; i < this.propSprites.length; i++) this.propSprites[i].img.destroy();
      for (i = 0; i < this.barrelSprites.length; i++) this.barrelSprites[i].destroy();
      for (i = 0; i < this.lampSprites.length; i++) this.lampSprites[i].destroy();
      for (i = 0; i < this.intelSprites.length; i++) this.intelSprites[i].destroy();
      this.propSprites.length = 0; this.barrelSprites.length = 0;
      this.lampSprites.length = 0; this.intelSprites.length = 0;
      this.worldBuilt = false;
    },

    /* ==================================================== main loop */
    update: function (time, delta) {
      HS.frame++;
      if ((HS.frame % 45) === 0) this.updateCanvasRect();
      var dt = Math.min(0.05, delta / 1000);

      if (this.screen === 'play' && !kit.paused && S.running) {
        this.readControls();
        this.acc += dt;
        var steps = 0;
        var juice = kit.juice.frame();
        while (this.acc >= STEP && steps < MAX_STEPS) {
          this.acc -= STEP;
          steps++;
          if (juice.frozen) { this.artT += STEP; continue; }
          R.step(STEP, this.ctl);
          this.artT += STEP;
          this.drainSim();
          if (!S.running) break;
        }
        if (this.acc > STEP * MAX_STEPS) this.acc = 0;
        this.updateTutorial(dt);
        this.updateContactMusic(dt);
      } else {
        kit.juice.frame();
      }

      if (this.screen === 'play') {
        this.renderWorld(dt);
        this.updateHud(dt);
        if (!S.running && !this.pendingResult) this.finishRun();
      }
      this.updateTransients(dt);
      this.publish();
    },

    /* ------------------------------------------------------ controls */
    readControls: function () {
      var c = this.ctl;
      var prevFire = c.fire;
      c.moveX = 0; c.moveY = 0; c.aimX = 0; c.aimY = 0; c.fire = false;
      var self = this;
      var claimedMove = false, claimedAim = false;
      this.stickL.active = false; this.stickR.active = false;

      kit.input.pointers.forEach(function (p) {
        if (p.zone == null) p.zone = self.claimZone(p);
        var vx = self.toVX(p.x), vy = self.toVY(p.y);
        var ox = self.toVX(p.startX), oy = self.toVY(p.startY);
        if (p.zone === 'move' && !claimedMove) {
          claimedMove = true;
          var dx = vx - ox, dy = vy - oy;
          var l = Math.hypot(dx, dy), r = 46;
          var k = l > r ? r / l : 1;
          c.moveX = dx * k / r; c.moveY = dy * k / r;
          self.stickL.active = true; self.stickL.ox = ox; self.stickL.oy = oy;
          self.stickL.x = ox + dx * k; self.stickL.y = oy + dy * k;
        } else if (p.zone === 'aim' && !claimedAim) {
          claimedAim = true;
          var ax = vx - ox, ay = vy - oy;
          var al = Math.hypot(ax, ay), ar = 46;
          var ak = al > ar ? ar / al : 1;
          c.aimX = ax * ak / ar; c.aimY = ay * ak / ar;
          if (al > 7) c.fire = true;
          self.stickR.active = true; self.stickR.ox = ox; self.stickR.oy = oy;
          self.stickR.x = ox + ax * ak; self.stickR.y = oy + ay * ak;
        }
      });

      /* keyboard, fully wired beside touch */
      var kx = 0, ky = 0;
      if (kit.input.keyDown('KeyW') || kit.input.keyDown('KeyZ')) ky -= 1;
      if (kit.input.keyDown('KeyS')) ky += 1;
      if (kit.input.keyDown('KeyA') || kit.input.keyDown('KeyQ')) kx -= 1;
      if (kit.input.keyDown('KeyD')) kx += 1;
      if (kx || ky) {
        var kl = Math.hypot(kx, ky) || 1;
        c.moveX = kx / kl; c.moveY = ky / kl;
      }
      var ax2 = 0, ay2 = 0;
      if (kit.input.keyDown('ArrowLeft')) ax2 -= 1;
      if (kit.input.keyDown('ArrowRight')) ax2 += 1;
      if (kit.input.keyDown('ArrowUp')) ay2 -= 1;
      if (kit.input.keyDown('ArrowDown')) ay2 += 1;
      if (ax2 || ay2) {
        var al2 = Math.hypot(ax2, ay2) || 1;
        c.aimX = ax2 / al2; c.aimY = ay2 / al2;
        c.fire = true;
      }
      if (kit.input.keyDown('Space') && !this.prevKeys.space) R.startVault();
      this.prevKeys.space = kit.input.keyDown('Space');
      if (kit.input.keyDown('KeyR') && !this.prevKeys.r) R.startReload();
      this.prevKeys.r = kit.input.keyDown('KeyR');
      if ((kit.input.keyDown('Tab') || kit.input.keyDown('KeyF')) && !this.prevKeys.tab) R.swapWeapon();
      this.prevKeys.tab = kit.input.keyDown('Tab') || kit.input.keyDown('KeyF');
      if (kit.input.keyDown('KeyG') && !this.prevKeys.g) R.useGadget();
      this.prevKeys.g = kit.input.keyDown('KeyG');

      c.assist = profile.assist !== false;
      c.fireEdge = c.fire && !prevFire;
      if (c.moveX || c.moveY) this.moveHeld += STEP;
    },

    claimZone: function (p) {
      var vx = this.toVX(p.startX), vy = this.toVY(p.startY);
      if (this.screen !== 'play') return 'ui';
      var names = ['pause', 'gadget', 'reload', 'swap', 'vault'];
      for (var i = 0; i < names.length; i++) {
        var b = this.buttons[names[i]];
        if (!b.on) continue;
        var dx = vx - b.x, dy = vy - b.y;
        var hit = Math.max(b.r, 23);
        if (dx * dx + dy * dy <= hit * hit) {
          this.pressButton(names[i]);
          return 'btn';
        }
      }
      return vx < GW * 0.46 ? 'move' : 'aim';
    },

    pressButton: function (name) {
      var b = this.buttons[name];
      if (b) b.down = 0.14;
      if (name === 'pause') { this.openPause(); return; }
      if (!S.running) return;
      if (name === 'gadget') R.useGadget();
      else if (name === 'reload') R.startReload();
      else if (name === 'swap') R.swapWeapon();
      else if (name === 'vault') R.startVault();
      kit.audio.sfx('ui', { volume: 0.4 });
    },

    onUiKey: function (e) {
      if (!this.bootDone) return;
      var code = e.code;
      if (code === 'Escape' || code === 'KeyP') {
        if (this.screen === 'play' && !kit.paused) this.openPause();
        else if (this.screen === 'pause') this.closePause();
        else if (this.screen !== 'menu') this.showMenu();
        return;
      }
      if (this.screen === 'play' || this.screen === 'boot') return;
      if (code === 'Enter' || code === 'Space' || code === 'NumpadEnter') {
        var b = this.screenButtons[this.screenCursor || 0];
        if (b && b.enabled !== false && b.onTap) { kit.audio.sfx('ui'); b.onTap(); }
        e.preventDefault();
      } else if (code === 'ArrowDown' || code === 'ArrowRight' || code === 'Tab') {
        this.moveCursor(1); e.preventDefault();
      } else if (code === 'ArrowUp' || code === 'ArrowLeft') {
        this.moveCursor(-1); e.preventDefault();
      }
    },
    moveCursor: function (d) {
      if (!this.screenButtons.length) return;
      var n = this.screenButtons.length;
      var c = ((this.screenCursor || 0) + d + n) % n;
      this.screenCursor = c;
      for (var i = 0; i < n; i++) {
        var b = this.screenButtons[i];
        if (b.plate) setFrameIfChanged(b.plate, '__BASE');
        if (b.plate) b.plate.setTexture(i === c ? 'io_plate_hi' : (b.style || 'io_plate'));
      }
      kit.audio.sfx('ui', { volume: 0.5 });
    },
    onScreenTap: function (vx, vy) {
      if (this.screen === 'play') return;
      for (var i = 0; i < this.screenButtons.length; i++) {
        var b = this.screenButtons[i];
        if (vx < b.x - b.w / 2 || vx > b.x + b.w / 2) continue;
        if (vy < b.y - b.h / 2 || vy > b.y + b.h / 2) continue;
        if (b.enabled === false) { kit.audio.sfx('empty'); return; }
        kit.audio.sfx('ui');
        if (b.onTap) b.onTap();
        return;
      }
    },

    /* ------------------------------------------------ sim event drain */
    drainSim: function () {
      var evs = S.events, n = S.eventCount;
      var juice = kit.juice.enabled;
      for (var i = 0; i < n; i++) {
        var e = evs[i];
        switch (e.type) {
          case 'tracer': this.spawnTracer(e.x, e.y, e.a, e.b, e.tint); break;
          case 'muzzle':
            this.fx.dust.explode(juice ? 4 : 2, e.x, e.y);
            this.spawnMuzzle(e.x, e.y, e.a);
            break;
          case 'casing': this.spawnCasing(e.x, e.y, e.a); break;
          case 'impact':
            this.fx.spark.explode(juice ? 6 : 3, e.x, e.y);
            break;
          case 'splinter': this.fx.splinter.explode(juice ? 5 : 3, e.x, e.y); break;
          case 'glass': this.fx.spark.explode(juice ? 7 : 3, e.x, e.y); break;
          case 'blood':
            this.fx.blood.explode(juice ? 8 : 4, e.x, e.y);
            break;
          case 'break':
            this.fx.splinter.explode(juice ? 14 : 6, e.x, e.y);
            this.fx.smoke.explode(2, e.x, e.y);
            break;
          case 'kill':
            this.fx.blood.explode(juice ? 16 : 6, e.x, e.y);
            this.fx.spark.explode(juice ? 8 : 3, e.x, e.y);
            kit.juice.hitStop(45);
            kit.juice.shake(2.6, 150);
            kit.audio.sfx('kill', { volume: 0.55 });
            this.hitmarkT = 0.22;
            break;
          case 'hitmark': this.hitmarkT = 0.14; break;
          case 'explode':
            this.fx.fire.explode(juice ? 30 : 12, e.x, e.y);
            this.fx.smoke.explode(juice ? 10 : 4, e.x, e.y);
            this.fx.spark.explode(juice ? 14 : 6, e.x, e.y);
            kit.juice.shake(6.5, 260);
            kit.juice.hitStop(35);
            break;
          case 'smokepop': this.fx.smoke.explode(juice ? 14 : 6, e.x, e.y); break;
          case 'flashbang':
            this.fx.fire.explode(juice ? 18 : 8, e.x, e.y);
            kit.juice.shake(3, 160);
            break;
          case 'playerflash': this.flashT = Math.max(this.flashT, 0.55 * e.a); break;
          case 'playerhit':
            this.dmgT = 0.45;
            kit.juice.shake(3.2, 180);
            kit.audio.sfx('hurt', { volume: 0.6 });
            break;
          case 'playerdown':
            this.fx.blood.explode(juice ? 22 : 8, e.x, e.y);
            kit.juice.shake(8, 400);
            kit.audio.sfx('down');
            break;
          case 'civdown': kit.audio.sfx('down', { volume: 0.7 }); break;
          case 'intel':
            this.fx.spark.explode(juice ? 12 : 5, e.x, e.y);
            break;
          case 'ping':
            this.fx.spark.explode(juice ? 10 : 4, e.x, e.y);
            break;
          case 'spawn': this.fx.smoke.explode(2, e.x, e.y); break;
          case 'shake': kit.juice.shake(e.a, 90); break;
          case 'sfx': kit.audio.sfx(e.text, { volume: 0.55 }); break;
          case 'chip': this.pushChip(e.text); break;
          case 'wave':
            this.pushChip(e.text);
            break;
          case 'stage':
            this.updateHudLabels();
            break;
          case 'finish': break;
          default: break;
        }
      }
      K.drainEvents();
    },

    spawnTracer: function (x1, y1, x2, y2, tint) {
      var img = null;
      for (var i = 0; i < this.tracerPool.length; i++) {
        if (!this.tracerPool[i].visible) { img = this.tracerPool[i]; break; }
      }
      if (!img) img = this.tracerPool[(HS.frame % this.tracerPool.length)];
      var dx = x2 - x1, dy = y2 - y1;
      var len = Math.max(6, Math.hypot(dx, dy));
      img.setVisible(true).setPosition(x2, y2).setRotation(Math.atan2(dy, dx));
      img.setDisplaySize(len, 5);
      img.setTint(tint);
      img.setAlpha(0.95);
      img._life = 0.075;
      if (this.tracerLive.indexOf(img) < 0) this.tracerLive.push(img);
    },
    spawnMuzzle: function (x, y, ang) {
      var m = this.muzzle;
      if (!m) {
        m = this.muzzle = this.add.image(-999, -999, 'io_muzzle').setDepth(33).setVisible(false);
        if (m.setBlendMode) m.setBlendMode(Phaser.BlendModes.ADD);
      }
      m.setVisible(true).setPosition(x, y).setRotation(ang).setAlpha(1).setScale(0.55 + Math.random() * 0.2);
      this.muzzleT = 0.055;
    },
    spawnCasing: function (x, y, ang) {
      for (var i = 0; i < this.casings.length; i++) {
        var c = this.casings[i];
        if (c.life > 0) continue;
        c.x = x; c.y = y;
        var a = ang + Math.PI / 2 + (Math.random() - 0.5) * 0.5;
        c.vx = Math.cos(a) * (60 + Math.random() * 60);
        c.vy = Math.sin(a) * (60 + Math.random() * 60);
        c.life = 0.85; c.rot = Math.random() * TAU;
        c.img.setVisible(true).setTint(0xd8c07a);
        return;
      }
    },

    /* --------------------------------------------------- rendering */
    renderWorld: function (dt) {
      var i, cam = this.cameras.main;
      var juice = kit.juice.frame();
      var lookX = P.x + Math.cos(P.angle) * 46;
      var lookY = P.y + Math.sin(P.angle) * 46;
      var tx = lookX - GW * 0.5, ty = lookY - GH * 0.5;
      cam.scrollX += (tx - cam.scrollX) * Math.min(1, dt * 9);
      cam.scrollY += (ty - cam.scrollY) * Math.min(1, dt * 9);
      cam.setScroll(cam.scrollX + juice.dx, cam.scrollY + juice.dy);

      /* player rig */
      this.pLegs.setPosition(P.x, P.y).setRotation(P.moveAngle);
      setFrameIfChanged(this.pLegs, P.legAnim);
      this.pTorso.setPosition(P.x + Math.cos(P.angle + Math.PI / 2) * P.lean * 5,
        P.y + Math.sin(P.angle + Math.PI / 2) * P.lean * 5).setRotation(P.angle);
      setFrameIfChanged(this.pTorso, P.alive ? P.anim : 'down');
      this.pShadow.setPosition(P.x + 2, P.y + 4);
      this.pBase.setPosition(P.x, P.y)
        .setAlpha(P.alive ? 0.55 + 0.18 * Math.sin(this.artT * 3) : 0.2);
      setTintIfChanged(this.pBase, P.hp < 35 ? 0xe0715f : 0x57d6b6);
      setTintIfChanged(this.pTorso, P.hurtT > 0 ? 0xffb0b0 : 0xffffff);

      /* reticle in world space so the aim reads without a crosshair overlay */
      var w = R.weaponOf(P);
      var spread = w.spread + P.bloom;
      var fi = clamp(Math.round(spread / 0.19 * 7), 0, 7);
      var rx = P.x + Math.cos(P.angle) * 74, ry = P.y + Math.sin(P.angle) * 74;
      this.reticle.setPosition(rx, ry).setVisible(P.alive);
      setFrameIfChanged(this.reticle, 'r' + fi);
      setTintIfChanged(this.reticle, P.reloadT > 0 ? 0x7fc4ff : 0xffffff);
      if (this.hitmarkT > 0) {
        this.hitmarkT -= dt;
        this.hitmark.setVisible(true).setPosition(rx, ry).setAlpha(clamp(this.hitmarkT * 6, 0, 1));
      } else setVis(this.hitmark, false);

      if (this.muzzleT > 0) {
        this.muzzleT -= dt;
        if (this.muzzle) this.muzzle.setAlpha(clamp(this.muzzleT * 18, 0, 1));
        if (this.muzzleT <= 0 && this.muzzle) this.muzzle.setVisible(false);
      }

      /* hostiles and civilians, index paired with the pools */
      for (i = 0; i < S.ents.length; i++) {
        var e = S.ents[i];
        var legs = this.legPool[i], torso = this.torsoPool[i];
        if (!e.active) { setVis(legs, false); setVis(torso, false); continue; }
        setVis(legs, !e.civ);
        setVis(torso, true);
        if (e.civ) {
          torso.setTexture('io_civ', (e.kind === 'vip' ? 'vip' : 'hostage') + (e.moveMag > 0 ? '_move' : ''));
          torso.setPosition(e.x, e.y).setRotation(e.angle);
          setTintIfChanged(torso, e.hurtT > 0 ? 0xffaaaa : 0xffffff);
          continue;
        }
        if (torso.texture.key !== 'io_foe') torso.setTexture('io_foe', 'idle');
        legs.setPosition(e.x, e.y).setRotation(e.moveMag > 0 ? Math.atan2(e.goalY - e.y, e.goalX - e.x) : e.angle);
        setFrameIfChanged(legs, e.alive ? (e.moveMag > 0 ? 'run' + (Math.floor(e.animT * 2) % 4) : 'stand') : 'stand');
        torso.setPosition(e.x, e.y).setRotation(e.angle);
        var frame = !e.alive ? 'down' : (e.hurtT > 0 ? 'flinch' : (e.anim === 'fire' ? 'fire' : 'idle'));
        setFrameIfChanged(torso, frame);
        var tint = C.enemy(e.kind).tint;
        if (!e.alive) tint = 0x6b7078;
        else if (e.blind > 0) tint = 0xfff3c4;
        else if (e.suppress > 0.5) tint = 0xb9a2a2;
        setTintIfChanged(torso, tint);
        torso.setAlpha(e.alive ? 1 : clamp(e.deadT / 3, 0, 1));
        legs.setAlpha(torso.alpha);
      }

      /* ping markers over marked hostiles */
      var mi = 0;
      for (i = 0; i < S.ents.length && mi < this.markPool.length; i++) {
        var me = S.ents[i];
        if (!me.active || !me.alive || me.civ || me.marked <= 0) continue;
        var mk = this.markPool[mi++];
        mk.setVisible(true).setPosition(me.x, me.y - 22)
          .setAlpha(clamp(me.marked, 0, 1) * (0.6 + 0.4 * Math.sin(this.artT * 8)));
      }
      for (; mi < this.markPool.length; mi++) setVis(this.markPool[mi], false);

      /* tracers */
      for (i = this.tracerLive.length - 1; i >= 0; i--) {
        var tr = this.tracerLive[i];
        tr._life -= dt;
        if (tr._life <= 0) {
          tr.setVisible(false);
          this.tracerLive.splice(i, 1);
        } else tr.setAlpha(clamp(tr._life * 13, 0, 1));
      }

      /* casings */
      for (i = 0; i < this.casings.length; i++) {
        var cs = this.casings[i];
        if (cs.life <= 0) { setVis(cs.img, false); continue; }
        cs.life -= dt;
        cs.x += cs.vx * dt; cs.y += cs.vy * dt;
        cs.vx *= 0.90; cs.vy *= 0.90;
        cs.rot += dt * 9;
        cs.img.setPosition(cs.x, cs.y).setRotation(cs.rot).setAlpha(clamp(cs.life * 2, 0, 1));
        if (cs.life <= 0) cs.img.setVisible(false);
      }

      /* thrown ordnance */
      for (i = 0; i < S.ord.length; i++) {
        var o = S.ord[i], oi = this.ordSprites[i];
        if (!o.active) { setVis(oi, false); continue; }
        oi.setVisible(true).setPosition(o.x, o.y - Math.sin(clamp(o.t / 0.32, 0, 1) * Math.PI) * 16)
          .setRotation(this.artT * 9);
        setFrameIfChanged(oi, o.type === 'chain' ? 'frag' : (C.GADGETS[o.type] ? C.GADGETS[o.type].icon : 'frag'));
        setTintIfChanged(oi, C.gadget(o.type === 'chain' ? 'frag' : o.type).tint);
      }

      /* smoke volumes */
      for (i = 0; i < S.smokes.length; i++) {
        var sm = S.smokes[i], si = this.smokeSprites[i];
        if (!sm.active) { setVis(si, false); continue; }
        si.setVisible(true).setPosition(sm.x, sm.y);
        si.setDisplaySize(sm.r * 2.6, sm.r * 2.6);
        si.setAlpha(clamp(Math.min(sm.life, 1.4) * 0.5, 0, 0.7));
        if (Math.random() < 0.25) this.fx.smoke.explode(1, sm.x + (Math.random() - 0.5) * sm.r, sm.y + (Math.random() - 0.5) * sm.r);
      }

      /* destructible props follow their cell health */
      for (i = 0; i < this.propSprites.length; i++) {
        var pr = this.propSprites[i];
        var hp = S.cellHp[pr.ci], max = S.cellMaxHp[pr.ci];
        if (S.grid[pr.ci] === K.FLOOR) { setVis(pr.img, false); continue; }
        setVis(pr.img, true);
        if (pr.kind === K.CRATE) {
          var f = hp > max * 0.66 ? 'c0' : (hp > max * 0.33 ? 'c1' : 'c2');
          setFrameIfChanged(pr.img, f);
        } else {
          setFrameIfChanged(pr.img, hp > max * 0.6 ? 'g0' : 'g1');
        }
      }
      for (i = 0; i < this.barrelSprites.length; i++) {
        var bs = this.barrelSprites[i], bd = S.barrels[i];
        if (!bd) continue;
        setFrameIfChanged(bs, bd.alive ? 'b0' : 'b1');
      }
      for (i = 0; i < this.intelSprites.length; i++) {
        var it = S.intel[i], is = this.intelSprites[i];
        if (!it || !it.active) { setVis(is, false); continue; }
        is.setVisible(true).setPosition(it.x, it.y + Math.sin(this.artT * 3 + it.phase) * 2.5)
          .setScale(0.8 + Math.sin(this.artT * 4 + it.phase) * 0.06);
      }

      /* objective marker and the offscreen pointer to it */
      var anc = R.stageAnchor();
      if (anc && S.running) {
        this.objMarker.setVisible(true).setPosition(anc.x, anc.y - 6 - Math.sin(this.artT * 3) * 3);
        setFrameIfChanged(this.objMarker, S.stage && S.stage.kind === 'extract' ? 'm2' : 'm0');
        var sx = anc.x - cam.scrollX, sy = anc.y - cam.scrollY;
        var off = sx < 20 || sx > GW - 20 || sy < 48 || sy > GH - 20;
        if (off) {
          var ang = Math.atan2(sy - GH * 0.5, sx - GW * 0.5);
          var px = GW * 0.5 + Math.cos(ang) * (GW * 0.5 - 26);
          var py = GH * 0.5 + Math.sin(ang) * (GH * 0.5 - 26);
          this.objArrow.setVisible(true).setPosition(clamp(px, 22, GW - 22), clamp(py, 52, GH - 22))
            .setRotation(ang).setTint(0xf0b256);
        } else setVis(this.objArrow, false);
      } else {
        setVis(this.objMarker, false);
        setVis(this.objArrow, false);
      }

      /* screen mood */
      if (this.dmgT > 0) { this.dmgT -= dt; this.dmgFlash.setAlpha(clamp(this.dmgT * 0.55, 0, 0.4)); }
      else this.dmgFlash.setAlpha(P.hp < 35 && P.alive ? 0.10 + Math.sin(this.artT * 4) * 0.04 : 0);
      if (this.flashT > 0) { this.flashT -= dt; this.whiteFlash.setAlpha(clamp(this.flashT, 0, 0.85)); }
      else this.whiteFlash.setAlpha(0);
    },

    /* --------------------------------------------------------- HUD */
    updateHudLabels: function () {
      var h = this.hud;
      var st = S.stage;
      if (!st) return;
      setFrameIfChanged(h.objIcon, st.icon || 'extract');
      setTextIfChanged(h.objText, st.text || '');
    },

    updateHud: function (dt) {
      var h = this.hud, b = this.buttons;
      var hpF = clamp(P.hp / P.maxHp, 0, 1);
      h.hpFill.setDisplaySize(120 * hpF, 9);
      setTintIfChanged(h.hpFill, hpF > 0.5 ? 0x7ce6a4 : (hpF > 0.25 ? 0xf0b256 : 0xe0715f));
      setTextIfChanged(h.hpText, Math.ceil(P.hp));

      h.objFill.setDisplaySize(210 * clamp(S.stageProgress, 0, 1), 5);
      setTextIfChanged(h.foeText, S.mode === 'trial' ? S.targetsLeft : S.enemiesAlive);
      if (S.mode === 'survival') setTextIfChanged(h.timeText, 'W' + S.wave);
      else if (S.mode === 'trial') setTextIfChanged(h.timeText, fmtTime(S.trialT));
      else setTextIfChanged(h.timeText, fmtTime(S.timeElapsed));

      var id = R.currentWeaponId();
      var w = C.weapon(id);
      setTextIfChanged(h.ammoText, P.mag[id] | 0);
      setTextIfChanged(h.resText, '/ ' + (P.reserve[id] | 0));
      setTextIfChanged(h.wpnText, w.name);
      setColorIfChanged(h.ammoText, (P.mag[id] | 0) <= w.mag * 0.25 ? CSS.rust : CSS.text);

      var reloading = P.reloadT > 0;
      setVis(h.reloadBack, reloading);
      setVis(h.reloadFill, reloading);
      if (reloading) h.reloadFill.setDisplaySize(88 * clamp(1 - P.reloadT / Math.max(0.01, P.reloadTotal), 0, 1), 7);

      /* action buttons */
      setFrameIfChanged(b.gadget.icon, C.gadget(P.gadget).icon);
      setTintIfChanged(b.gadget.icon, P.charges > 0 ? C.gadget(P.gadget).tint : 0x6c7a83);
      setTextIfChanged(b.gadget.text, P.charges);
      var canVault = !!R.vaultTarget();
      b.vault.on = canVault;
      setVis(b.vault.bg, canVault); setVis(b.vault.icon, canVault);
      setVis(b.vault.text, false);
      setTextIfChanged(b.reload.text, '');
      setTintIfChanged(b.reload.icon, (P.mag[id] | 0) < w.mag && (P.reserve[id] | 0) > 0 ? 0xffffff : 0x6c7a83);
      setTextIfChanged(b.swap.text, '');
      var names = ['gadget', 'reload', 'swap', 'vault', 'pause'];
      for (var i = 0; i < names.length; i++) {
        var bb = this.buttons[names[i]];
        if (bb.down > 0) { bb.down -= dt; setFrameIfChanged(bb.bg, 'b1'); }
        else setFrameIfChanged(bb.bg, 'b0');
      }

      /* sticks */
      var L = this.stickL, Rr = this.stickR;
      this.ctlUi.baseL.setPosition(L.active ? L.ox : 96, L.active ? L.oy : GH - 96).setAlpha(L.active ? 0.34 : 0.16);
      this.ctlUi.knobL.setPosition(L.active ? L.x : 96, L.active ? L.y : GH - 96).setAlpha(L.active ? 0.5 : 0.22);
      this.ctlUi.baseR.setPosition(Rr.active ? Rr.ox : GW - 210, Rr.active ? Rr.oy : GH - 96).setAlpha(Rr.active ? 0.34 : 0.16);
      this.ctlUi.knobR.setPosition(Rr.active ? Rr.x : GW - 210, Rr.active ? Rr.y : GH - 96).setAlpha(Rr.active ? 0.5 : 0.22);
    },

    setHudVisible: function (v) {
      for (var i = 0; i < this.hud.root.length; i++) {
        var o = this.hud.root[i];
        if (o === this.hud.banner || o === this.hud.bannerSub) continue;
        setVis(o, v);
      }
      if (!v) { setVis(this.hud.reloadBack, false); setVis(this.hud.reloadFill, false); }
      var names = ['gadget', 'reload', 'swap', 'vault', 'pause'];
      for (var j = 0; j < names.length; j++) {
        var b = this.buttons[names[j]];
        setVis(b.bg, v); setVis(b.icon, v); setVis(b.text, v && names[j] !== 'pause');
      }
      setVis(this.ctlUi.baseL, v); setVis(this.ctlUi.knobL, v);
      setVis(this.ctlUi.baseR, v); setVis(this.ctlUi.knobR, v);
      setVis(this.reticle, v); setVis(this.pLegs, v); setVis(this.pTorso, v);
      setVis(this.pShadow, v); setVis(this.pBase, v);
      this.ambient.setAlpha(v && S.theatre ? S.theatre.mood.ambientAlpha * 0.28 : 0);
      this.vignette.setAlpha(v ? 0.9 : 0);
      if (!v) {
        setVis(this.objMarker, false); setVis(this.objArrow, false);
        for (var t = 0; t < this.torsoPool.length; t++) { setVis(this.torsoPool[t], false); setVis(this.legPool[t], false); }
        for (var m = 0; m < this.markPool.length; m++) setVis(this.markPool[m], false);
        for (var s = 0; s < this.smokeSprites.length; s++) setVis(this.smokeSprites[s], false);
        for (var o2 = 0; o2 < this.ordSprites.length; o2++) setVis(this.ordSprites[o2], false);
      }
    },

    /* --------------------------------------------------- transients */
    pushChip: function (text) {
      if (!text) return;
      /* one transient at a time: a new chip replaces the queue tail */
      if (this.chipQueue.length > 2) this.chipQueue.length = 2;
      this.chipQueue.push(text);
    },
    showBanner: function (title, sub, secs) {
      this.hud.banner.setText(title);
      this.hud.bannerSub.setText(sub || '');
      this.bannerT = secs || 1.6;
      this.bannerMax = this.bannerT;
    },
    showCoach: function (key, text) {
      if (this.coachKey === key) return;
      this.coachKey = key;
      this.hud.coach.setText(text);
      this.coachT = 3.4;
    },
    updateTransients: function (dt) {
      var h = this.hud;
      if (this.chipT > 0) {
        this.chipT -= dt;
        h.chip.setAlpha(clamp(this.chipT * 3, 0, 1));
        if (this.chipT <= 0) h.chip.setAlpha(0);
      } else if (this.chipQueue.length) {
        h.chip.setText(this.chipQueue.shift());
        this.chipT = 1.0;
      }
      if (this.coachT > 0) {
        this.coachT -= dt;
        h.coach.setAlpha(clamp(this.coachT * 1.6, 0, 1) * 0.95);
      } else if (h.coach.alpha !== 0) h.coach.setAlpha(0);

      if (this.bannerT > 0) {
        this.bannerT -= dt;
        var k = 1 - this.bannerT / Math.max(0.01, this.bannerMax);
        var pop = k < 0.22 ? 1 + (1 - k / 0.22) * 0.35 : 1;
        var a = clamp(Math.min(k * 6, this.bannerT * 3), 0, 1);
        h.banner.setAlpha(a).setScale(kit.juice.enabled ? pop : 1);
        h.bannerSub.setAlpha(a * 0.9);
      } else if (h.banner.alpha !== 0) {
        h.banner.setAlpha(0); h.bannerSub.setAlpha(0);
      }
    },

    updateTutorial: function (dt) {
      if (this.tutorialStep < 0) return;
      this.tutorialT += dt;
      var step = this.tutorialStep;
      if (step === 0) {
        this.showCoach('t0', 'Drag the left side to move');
        if (this.moveHeld > 1.4) { this.tutorialStep = 1; this.tutorialT = 0; }
      } else if (step === 1) {
        this.showCoach('t1', 'Drag the right side to aim and fire');
        if (P.shots >= 6) { this.tutorialStep = 2; this.tutorialT = 0; }
      } else if (step === 2) {
        this.showCoach('t2', 'Short bursts keep the reticle tight');
        if (this.tutorialT > 5) { this.tutorialStep = 3; this.tutorialT = 0; }
      } else if (step === 3) {
        this.showCoach('t3', 'Tap reload before the magazine runs dry');
        if (P.reloadT > 0 || this.tutorialT > 8) { this.tutorialStep = 4; this.tutorialT = 0; }
      } else if (step === 4) {
        this.showCoach('t4', 'Stand on the marker to work the objective');
        if (this.tutorialT > 6) {
          this.tutorialStep = -1;
          profile.tutorial = true;
          saveProfile();
        }
      }
    },

    updateContactMusic: function (dt) {
      var threat = 0;
      for (var i = 0; i < S.ents.length; i++) {
        var e = S.ents[i];
        if (e.active && e.alive && !e.civ && !e.inert && e.targetSeen) threat++;
      }
      this.contactT = threat > 0 ? 3.0 : Math.max(0, this.contactT - dt);
      this.setMusic(this.contactT > 0 ? 'contact' : 'ops');
    },
    setMusic: function (name) {
      if (this.musicMode === name) return;
      this.musicMode = name;
      kit.audio.music(name === 'menu' ? 'm_menu' : (name === 'contact' ? 'm_contact' : 'm_ops'), 900);
    },

    /* ------------------------------------------------------ results */
    finishRun: function () {
      var res = S.result || 'complete';
      var acc = P.shots > 0 ? P.hits / P.shots : 0;
      var stars = 0, score = R.finalScore(S.timeElapsed);
      if (S.mode === 'campaign' && res === 'complete') {
        stars = R.medalsFor(S.missionIndex, S.timeElapsed, S.intelTaken, acc);
        var m = C.mission(S.missionIndex);
        var prev = profile.medals[m.id] | 0;
        if (stars > prev) profile.medals[m.id] = stars;
        if (!profile.scores[m.id] || score > profile.scores[m.id]) profile.scores[m.id] = score;
      } else if (S.mode === 'survival') {
        if (S.wave > (profile.best.survival | 0)) profile.best.survival = S.wave;
      } else if (S.mode === 'trial' && res === 'complete') {
        var t = Math.round(S.trialT * 10) / 10;
        if (!profile.best.trial || t < profile.best.trial) profile.best.trial = t;
      }
      profile.totalScore = (profile.totalScore | 0) + score;
      saveProfile();
      this.pendingResult = { res: res, stars: stars, score: score, acc: acc, time: S.timeElapsed, wave: S.wave };
      this.showResults();
    },

    /* ====================================================== screens */
    hideScreens: function () {
      for (var i = 0; i < this.screenObjs.length; i++) this.screenObjs[i].destroy();
      this.screenObjs.length = 0;
      this.screenButtons.length = 0;
      this.screenCursor = 0;
    },
    panel: function (x, y, w, h, key) {
      var img;
      try {
        img = this.add.nineslice(x, y, key || 'io_plate', undefined, w, h, 18, 18, 18, 18);
      } catch (err) {
        img = this.add.image(x, y, key || 'io_plate').setDisplaySize(w, h);
      }
      img.setScrollFactor(0).setDepth(90);
      this.screenObjs.push(img);
      return img;
    },
    label: function (x, y, text, size, color, origin) {
      var t = this.add.text(x, y, text, style(size, color)).setOrigin(origin == null ? 0.5 : origin, 0.5)
        .setScrollFactor(0).setDepth(92);
      this.screenObjs.push(t);
      return t;
    },
    icon: function (x, y, frame, scale, tint) {
      var i = this.add.image(x, y, 'io_icons', frame).setScale(scale || 0.5).setScrollFactor(0).setDepth(92);
      if (tint != null) i.setTint(tint);
      this.screenObjs.push(i);
      return i;
    },
    button: function (x, y, w, h, text, iconFrame, onTap, enabled) {
      var plate = this.panel(x, y, w, h, enabled === false ? 'io_slot' : 'io_plate');
      var objs = [plate];
      var tx = x;
      if (iconFrame) {
        var ic = this.icon(x - w * 0.5 + 24, y, iconFrame, h * 0.011, enabled === false ? 0x6c7a83 : 0xdff0f6);
        objs.push(ic);
        tx = x + 10;
      }
      var lbl = this.label(tx, y, text, h > 44 ? 17 : 15, enabled === false ? CSS.dim : CSS.text);
      objs.push(lbl);
      var rec = { x: x, y: y, w: w, h: h, onTap: onTap, enabled: enabled !== false, plate: plate, style: 'io_plate' };
      this.screenButtons.push(rec);
      return rec;
    },

    showMenu: function () {
      this.hideScreens();
      this.screen = 'menu';
      this.setHudVisible(false);
      this.clearWorld();
      this.cameras.main.setScroll(0, 0);
      this.cameras.main.setBackgroundColor(0x0a1219);
      this.setMusic('menu');
      var cx = GW * 0.5, cy = GH * 0.5;
      var bg = this.add.image(GW * 0.5, GH * 0.5, 'io_px').setDisplaySize(GW, GH)
        .setTint(0x0a1219).setScrollFactor(0).setDepth(85);
      this.screenObjs.push(bg);
      var mark = this.add.image(GW * 0.26, cy - 6, 'io_mark').setScale(0.72).setScrollFactor(0).setDepth(88).setAlpha(0.95);
      this.screenObjs.push(mark);
      this.label(GW * 0.26, cy + 84, 'IRONSIGHT OPS', 22, CSS.text);
      this.label(GW * 0.26, cy + 108, 'Tactical response, one floor at a time', 14, CSS.dim);

      var bx = GW * 0.68, w = Math.min(320, GW * 0.42), h = 46;
      var y0 = 72, gap = 54;
      var self = this;
      this.button(bx, y0, w, h, 'Operations', 'play', function () { self.showOps(); });
      this.button(bx, y0 + gap, w, h, 'Survival', 'skull', function () { self.startRun('survival', 0); });
      this.button(bx, y0 + gap * 2, w, h, 'Shoot House', 'clear', function () { self.startRun('trial', 0); });
      this.button(bx, y0 + gap * 3, w, h, 'Armory', 'ammo', function () { self.showArmory(); });
      this.button(bx, y0 + gap * 4, w, h, 'Settings', 'gear', function () { self.openSettings(); });

      var med = totalMedals();
      this.label(GW * 0.68, GH - 22, med + ' of 27 medals earned', 14, CSS.amber);
      HS.screen = 'menu';
    },

    showOps: function () {
      this.hideScreens();
      this.screen = 'ops';
      var self = this;
      var bg = this.add.image(GW * 0.5, GH * 0.5, 'io_px').setDisplaySize(GW, GH)
        .setTint(0x0a1219).setScrollFactor(0).setDepth(85);
      this.screenObjs.push(bg);
      this.label(GW * 0.5, 26, 'OPERATIONS', 20, CSS.text);
      var cols = 3, rows = 3;
      var cw = Math.min(196, (GW - 80) / cols), ch = 74;
      var x0 = GW * 0.5 - cw * (cols - 1) * 0.55, y0 = 84;
      for (var i = 0; i < 9; i++) {
        (function (i) {
          var m = C.mission(i);
          var open = missionOpen(i);
          var cxp = x0 + (i % cols) * cw * 1.1;
          var cyp = y0 + Math.floor(i / cols) * (ch + 10);
          var rec = self.button(cxp, cyp, cw, ch, '', null, function () { if (open) self.showBrief(i); }, open);
          self.label(cxp - cw * 0.5 + 14, cyp - 18, (m.no) + '. ' + m.name, 15, open ? CSS.text : CSS.dim, 0);
          self.label(cxp - cw * 0.5 + 14, cyp + 2, C.theatre(m.theatre).name, 14, CSS.dim, 0);
          var stars = profile.medals[m.id] | 0;
          for (var s = 0; s < 3; s++) {
            self.icon(cxp - cw * 0.5 + 22 + s * 20, cyp + 24, 'star', 0.30, s < stars ? 0xf0b256 : 0x39505c);
          }
          if (!open) self.icon(cxp + cw * 0.5 - 22, cyp - 18, 'lock', 0.32, 0x6c7a83);
          rec.style = 'io_plate';
        })(i);
      }
      this.button(GW * 0.5, GH - 26, 150, 38, 'Back', 'left', function () { self.showMenu(); });
      HS.screen = 'ops';
    },

    showBrief: function (index) {
      this.hideScreens();
      this.screen = 'brief';
      var self = this;
      var m = C.mission(index);
      var bg = this.add.image(GW * 0.5, GH * 0.5, 'io_px').setDisplaySize(GW, GH)
        .setTint(0x0a1219).setScrollFactor(0).setDepth(85);
      this.screenObjs.push(bg);
      this.panel(GW * 0.5, GH * 0.46, Math.min(560, GW - 80), 210);
      this.label(GW * 0.5, GH * 0.46 - 76, 'OPERATION ' + m.no + '  ' + m.name.toUpperCase(), 19, CSS.text);
      this.label(GW * 0.5, GH * 0.46 - 50, C.theatre(m.theatre).name, 14, CSS.mint);
      var words = m.brief.split(' ');
      var line = '', lines = [];
      for (var i = 0; i < words.length; i++) {
        if ((line + ' ' + words[i]).length > 54) { lines.push(line); line = words[i]; }
        else line = line ? line + ' ' + words[i] : words[i];
      }
      if (line) lines.push(line);
      for (var l = 0; l < lines.length; l++) this.label(GW * 0.5, GH * 0.46 - 22 + l * 20, lines[l], 14, CSS.dim);
      this.label(GW * 0.5, GH * 0.46 + 44, 'Par ' + fmtTime(m.par) + '   Intel ' + m.intel + '   Threat ' + Math.round(m.difficulty * 100) + '%', 14, CSS.amber);
      this.button(GW * 0.5 - 90, GH - 34, 160, 42, 'Deploy', 'play', function () { self.startRun('campaign', index); });
      this.button(GW * 0.5 + 90, GH - 34, 160, 42, 'Back', 'left', function () { self.showOps(); });
      HS.screen = 'brief';
    },

    showArmory: function () {
      this.hideScreens();
      this.screen = 'armory';
      var self = this;
      var un = unlocked();
      var bg = this.add.image(GW * 0.5, GH * 0.5, 'io_px').setDisplaySize(GW, GH)
        .setTint(0x0a1219).setScrollFactor(0).setDepth(85);
      this.screenObjs.push(bg);
      this.label(GW * 0.5, 22, 'ARMORY', 20, CSS.text);
      var rows = [
        { title: 'Primary', list: C.PRIMARY_ORDER, key: 'primary' },
        { title: 'Sidearm', list: C.SECONDARY_ORDER, key: 'secondary' },
        { title: 'Gadget', list: C.GADGET_ORDER, key: 'gadget' }
      ];
      var y = 62;
      for (var r = 0; r < rows.length; r++) {
        (function (row, y) {
          self.label(28, y, row.title, 14, CSS.dim, 0);
          for (var i = 0; i < row.list.length; i++) {
            (function (i) {
              var id = row.list[i];
              var def = row.key === 'gadget' ? C.gadget(id) : C.weapon(id);
              var open = !!un[id];
              var w = Math.min(150, (GW - 140) / 4);
              var x = 120 + i * (w + 10) + w * 0.5;
              var sel = profile.loadout[row.key] === id;
              var rec = self.button(x, y, w, 40, def.name, row.key === 'gadget' ? def.icon : 'ammo',
                function () {
                  if (!open) { self.pushChip('Locked'); return; }
                  profile.loadout[row.key] = id;
                  saveProfile();
                  self.showArmory();
                }, open);
              if (sel && rec.plate) rec.plate.setTexture('io_plate_hi');
              if (!open) {
                var need = 0;
                for (var u = 0; u < C.UNLOCKS.length; u++) if (C.UNLOCKS[u].id === id) need = C.UNLOCKS[u].medals;
                self.label(x, y + 24, need + ' medals', 14, CSS.dim);
              }
            })(i);
          }
        })(rows[r], y);
        y += 78;
      }
      var cur = C.weapon(profile.loadout.primary);
      this.label(GW * 0.5, GH - 58, cur.name + ': ' + cur.desc, 14, CSS.dim);
      var nx = C.nextUnlock(totalMedals());
      if (nx) this.label(GW * 0.5, GH - 40, 'Next unlock: ' + nx.name + ' at ' + nx.medals + ' medals', 14, CSS.amber);
      this.button(GW * 0.5, GH - 20, 150, 34, 'Back', 'left', function () { self.showMenu(); });
      HS.screen = 'armory';
    },

    showResults: function () {
      var r = this.pendingResult;
      this.hideScreens();
      this.screen = 'results';
      this.setHudVisible(false);
      var self = this;
      var win = r.res === 'complete';
      var bg = this.add.image(GW * 0.5, GH * 0.5, 'io_px').setDisplaySize(GW, GH)
        .setTint(0x070d12).setScrollFactor(0).setDepth(85).setAlpha(0.94);
      this.screenObjs.push(bg);
      this.panel(GW * 0.5, GH * 0.44, Math.min(520, GW - 90), 200);
      var title = win ? 'MISSION COMPLETE' : (r.res === 'failed_escort' ? 'ASSET LOST' : (r.res === 'failed_time' ? 'TIME UP' : 'OPERATOR DOWN'));
      this.label(GW * 0.5, GH * 0.44 - 70, title, 24, win ? CSS.mint : CSS.rust);
      if (S.mode === 'campaign') {
        for (var s = 0; s < 3; s++) {
          this.icon(GW * 0.5 - 44 + s * 44, GH * 0.44 - 30, 'star', 0.62, s < r.stars ? 0xf0b256 : 0x33474f);
        }
      } else if (S.mode === 'survival') {
        this.label(GW * 0.5, GH * 0.44 - 30, 'Wave ' + r.wave + '   Best ' + (profile.best.survival | 0), 16, CSS.amber);
      } else {
        this.label(GW * 0.5, GH * 0.44 - 30, 'Time ' + (Math.round(r.time * 10) / 10) + 's   Best ' + (profile.best.trial || '-'), 16, CSS.amber);
      }
      this.label(GW * 0.5, GH * 0.44 + 6, 'Score ' + r.score + '    Kills ' + P.kills + '    Accuracy ' + Math.round(r.acc * 100) + '%', 15, CSS.text);
      this.label(GW * 0.5, GH * 0.44 + 30, 'Time ' + fmtTime(r.time) + '    Intel ' + S.intelTaken + ' of ' + S.intelNeeded, 14, CSS.dim);
      var med = totalMedals();
      var nx = C.nextUnlock(med);
      this.label(GW * 0.5, GH * 0.44 + 54, nx ? ('Next unlock: ' + nx.name + ' at ' + nx.medals + ' medals') : 'All hardware unlocked', 14, CSS.mint);

      var bw = 150, by = GH - 30;
      if (S.mode === 'campaign' && win && S.missionIndex < C.MISSIONS.length - 1) {
        this.button(GW * 0.5 - 168, by, bw, 40, 'Next', 'play', function () { self.startRun('campaign', S.missionIndex + 1); });
      }
      this.button(GW * 0.5, by, bw, 40, 'Retry', 'reload', function () { self.restartRun(); });
      this.button(GW * 0.5 + 168, by, bw, 40, 'Base', 'left', function () { self.showMenu(); });

      if (win) {
        kit.audio.sfx('medal');
        if (S.mode === 'campaign') {
          for (var st = 0; st < r.stars; st++) {
            this.time.delayedCall(260 + st * 240, function () { kit.audio.sfx('objective', { volume: 0.6 }); });
          }
        }
      } else kit.audio.sfx('down');
      this.setMusic('menu');
      HS.screen = 'results';
    },

    openPause: function () {
      if (this.screen !== 'play') return;
      kit.pause('menu');
      this.screen = 'pause';
      var self = this;
      this.hideScreens();
      var bg = this.add.image(GW * 0.5, GH * 0.5, 'io_px').setDisplaySize(GW, GH)
        .setTint(0x060b10).setScrollFactor(0).setDepth(85).setAlpha(0.86);
      this.screenObjs.push(bg);
      this.label(GW * 0.5, GH * 0.24, 'PAUSED', 24, CSS.text);
      var m = S.mission;
      this.label(GW * 0.5, GH * 0.24 + 26, m ? (m.name + '   ' + (S.stage ? S.stage.text : '')) : (S.mode === 'survival' ? 'Survival' : 'Shoot House'), 14, CSS.dim);
      var y = GH * 0.46, gap = 46, w = 220;
      this.button(GW * 0.5, y, w, 40, 'Resume', 'play', function () { self.closePause(); });
      this.button(GW * 0.5, y + gap, w, 40, 'Restart', 'reload', function () { self.closePause(); kit.restart(); });
      this.button(GW * 0.5, y + gap * 2, w, 40, 'Settings', 'gear', function () { self.openSettings(); });
      this.button(GW * 0.5, y + gap * 3, w, 40, 'Abort mission', 'left', function () {
        R.finish('aborted');
        self.closePause();
        self.showMenu();
      });
      HS.screen = 'pause';
    },
    closePause: function () {
      this.hideScreens();
      if (S.running) {
        this.screen = 'play';
        this.setHudVisible(true);
        this.acc = 0;
        HS.screen = 'play';
      } else {
        this.screen = 'menu';
      }
      kit.resume('menu');
    },
    openSettings: function () {
      kit.openSettings([function (box, row) {
        row('Aim assist', function () { return profile.assist !== false; }, function (v) {
          profile.assist = v; saveProfile();
        });
      }]);
    },

    onKitPause: function () { },
    onKitResume: function () { this.acc = 0; this.updateCanvasRect(); },

    /* ------------------------------------------------ harness hooks */
    forceMode: function (mode, arg) {
      if (!this.bootDone) { forceQueue.push(['mode', mode, arg]); return true; }
      if (mode === 'menu') { this.showMenu(); return true; }
      if (mode === 'campaign') { this.startRun('campaign', (arg | 0) || 0); return true; }
      if (mode === 'survival') { this.startRun('survival', 0); return true; }
      if (mode === 'trial') { this.startRun('trial', 0); return true; }
      if (mode === 'armory') { this.showArmory(); return true; }
      if (mode === 'ops') { this.showOps(); return true; }
      return false;
    },
    forceStage: function (n) {
      if (!this.bootDone) { forceQueue.push(['stage', n, 0]); return true; }
      var idx = clamp(n | 0, 0, C.MISSIONS.length - 1);
      this.startRun('campaign', idx);
      return true;
    },

    publish: function () {
      HS.mode = S.mode;
      HS.screen = this.screen;
      HS.mission = S.missionIndex;
      HS.missionName = S.mission ? S.mission.name
        : (S.mode === 'survival' ? 'Survival' : (S.mode === 'trial' ? 'Shoot House' : ''));
      HS.stage = S.stageIndex;
      HS.stageKind = S.stage ? S.stage.kind : '';
      HS.stageText = S.stage ? S.stage.text : '';
      HS.progress = Math.round(clamp(S.stageProgress, 0, 1) * 1000) / 1000;
      HS.score = S.score;
      HS.health = Math.round(P.hp);
      HS.weapon = R.currentWeaponId();
      HS.ammo = P.mag[HS.weapon] | 0;
      HS.reserve = P.reserve[HS.weapon] | 0;
      HS.enemies = S.enemiesAlive;
      HS.wave = S.wave;
      HS.time = Math.round(S.timeElapsed * 10) / 10;
      HS.medals = totalMedals();
      HS.intel = S.intelTaken;
      HS.intelNeeded = S.intelNeeded;
      HS.accuracy = P.shots > 0 ? Math.round(P.hits / P.shots * 100) / 100 : 0;
      HS.paused = !!kit.paused;
      HS.result = S.result;
      var un = unlocked(), c = 0;
      for (var k in un) if (un.hasOwnProperty(k)) c++;
      HS.unlocked = c;
    }
  });

  /* Restore the HUD when a run screen opens. */
  var origStart = Scene.prototype.startRun;
  Scene.prototype.startRun = function (mode, i) {
    origStart.call(this, mode, i);
    this.setHudVisible(true);
    this.updateHudLabels();
  };

  new Phaser.Game({
    type: Phaser.AUTO,
    width: GW,
    height: GH,
    parent: document.body,          // never null: null SKIPS mounting the canvas
    backgroundColor: '#0a1219',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { antialias: true, powerPreference: 'high-performance' },
    audio: { noAudio: true },       // GGKit owns every sound in this title
    banner: false,
    scene: [Scene]
  });
})();
