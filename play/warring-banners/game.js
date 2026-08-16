/* Warring Banners - Phaser 3 tactics build.
 * GGKit owns the lifecycle, pointer identity, saves, audio buses and juice.
 * engine.js owns the simulation, art.js owns every baked pixel.
 */
'use strict';

(function () {
  var E = window.WBEngine;
  var A = window.WBArt;
  var GAME_W = 1280, GAME_H = 720;
  var RETINA_FACTOR = GGKit.hiDpi.factor(GAME_W, GAME_H);
  var STEP = 1 / 60, MAX_STEPS = 5;
  var HEXR = A.HEXR;
  var FONT = '"Trebuchet MS", "Avenir Next", Arial, sans-serif';
  var CSS = {
    text: '#e8f3fb', muted: '#93aabd', cyan: '#43c7f4', pale: '#bfeeff',
    coral: '#ff665c', amber: '#e0a34a', bone: '#d8c38c', green: '#8dd6a8',
    ink: '#0a151f'
  };
  var HEX_COL = { cyan: 0x43c7f4, blue: 0x3864e8, coral: 0xff665c, wine: 0xb72e4d,
                  amber: 0xe0a34a, bone: 0xd8c38c, white: 0xffffff, slate: 0x718092,
                  green: 0x8dd6a8, ink: 0x0a151f };

  var AUDIO = {
    'music-campaign': 'assets/audio/music-campaign.mp3',
    'music-battle': 'assets/audio/music-battle.mp3',
    'music-siege': 'assets/audio/music-siege.mp3',
    select: 'assets/audio/select.mp3', move: 'assets/audio/move.mp3',
    cancel: 'assets/audio/cancel.mp3', attack: 'assets/audio/attack.mp3',
    hit: 'assets/audio/hit.mp3', kill: 'assets/audio/kill.mp3',
    heal: 'assets/audio/heal.mp3', card: 'assets/audio/card.mp3',
    warn: 'assets/audio/warn.mp3', endturn: 'assets/audio/endturn.mp3',
    victory: 'assets/audio/victory.mp3', defeat: 'assets/audio/defeat.mp3',
    claim: 'assets/audio/claim.mp3', arrow: 'assets/audio/arrow.mp3'
  };
  var SFX_KEYS = ['select', 'move', 'cancel', 'attack', 'hit', 'kill', 'heal',
                  'card', 'warn', 'endturn', 'victory', 'defeat', 'claim', 'arrow'];

  // ------------------------------------------------------- headless hook
  var hook = window.__wb || {};
  hook.state = hook.state || {
    mode: 'boot', stage: 0, progress: 0, score: 0, health: 100,
    turn: 0, turns: 0, objective: '', result: null, wins: 0, ready: false
  };
  hook._pending = hook._pending || { mode: null, stage: null };
  hook.forceMode = function (m) {
    if (typeof m !== 'string') return false;
    if (hook._scene && hook._scene.forceMode) return hook._scene.forceMode(m);
    hook._pending.mode = m;
    return true;
  };
  hook.forceStage = function (n) {
    n = parseInt(n, 10);
    if (!isFinite(n)) return false;
    if (hook._scene && hook._scene.forceStage) return hook._scene.forceStage(n);
    hook._pending.stage = n;
    return true;
  };
  window.__wb = hook;

  var Game = { phaser: null, scene: null };

  var textFactory = Phaser.GameObjects.GameObjectFactory.prototype.text;
  Phaser.GameObjects.GameObjectFactory.prototype.text = function (x, y, text, style) {
    return textFactory.call(this, x, y, text, Object.assign({ resolution: RETINA_FACTOR }, style || {}));
  };
  var kit = GGKit.create({
    slug: 'warring-banners',
    orientation: 'landscape',
    validateSave: E.validSave,
    onPause: function () { if (Game.scene && Game.scene.scene.isActive()) Game.scene.scene.pause(); },
    onResume: function () { if (Game.scene && Game.scene.scene.isPaused()) Game.scene.scene.resume(); },
    onRestart: function () { if (Game.scene) Game.scene.restartTitle(); }
  });
  kit.audio.register(AUDIO);

  var profile = kit.save.get(null);
  if (!E.validSave(profile)) profile = E.repairSave(profile);
  kit.save.set(profile);

  var uiPrefs = { veteran: false };
  (function () {
    var raw = null;
    try { raw = localStorage.getItem('gg-warring-banners-diff'); } catch (e) { raw = null; }
    uiPrefs.veteran = raw === 'veteran';
  }());
  function saveDifficulty() {
    try { localStorage.setItem('gg-warring-banners-diff', uiPrefs.veteran ? 'veteran' : 'captain'); } catch (e) {}
  }

  // ------------------------------------------------------------- helpers
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function setTextIfChanged(obj, value) {
    value = String(value);
    if (obj.text !== value) obj.setText(value);
  }
  function setColorIfChanged(obj, value) {
    if (obj.__wbColor !== value) { obj.setColor(value); obj.__wbColor = value; }
  }
  function setVis(obj, on) {
    if (obj && obj.visible !== on) obj.setVisible(on);
  }
  function pct(v) { return Math.round(v * 100) / 100; }
  function fmtMul(m) {
    if (m >= 1) return 'x' + (Math.round(m * 100) / 100);
    return 'x' + (Math.round(m * 100) / 100);
  }
  function titleCase(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  var OBJ_ICON = { rout: 'rout', hold: 'hold', escort: 'escort', siege: 'siege' };
  var OBJ_NAME = { rout: 'Rout', hold: 'Hold', escort: 'Escort', siege: 'Siege' };
  var OBJ_HINT = {
    rout: 'Break every enemy banner.',
    hold: 'Stand on the marked ground when the clock runs out.',
    escort: 'Walk the carts to the far road.',
    siege: 'Break the gates, then stand in the keep. Bring a siege engine.'
  };

  // ============================================================== scene
  function WBScene() { Phaser.Scene.call(this, { key: 'wb' }); }
  WBScene.prototype = Object.create(Phaser.Scene.prototype);
  WBScene.prototype.constructor = WBScene;

  WBScene.prototype.create = function () {
    this.cameras.main.setZoom(RETINA_FACTOR);
    Game.scene = this;
    hook._scene = this;
    var self = this;

    this.accumulator = 0;
    this.clock = 0;
    this.mode = 'title';
    this.battle = null;
    this.boardInfo = null;
    this.sel = null;
    this.preview = null;
    this.reachData = null;
    this.targetSet = {};
    this.healSet = {};
    this.cardMode = null;
    this.showThreat = false;
    this.aiQueue = [];
    this.aiTimer = 0;
    this.pointerClaims = {};
    this.keyEdges = {};
    this.cursor = { q: 0, r: 0 };
    this.toastQueue = [];
    this.toast = null;
    this.banner = null;
    this.coach = { text: '', t: 0, step: 0 };
    this.tutorialStep = profile.tutorial ? 99 : 0;
    this.pinch = null;
    this.lastTapId = null;
    this.ready = false;
    this.skirmish = false;
    this.decalDirty = true;
    this.shakeX = 0;
    this.shakeY = 0;
    this.sprites = {};
    this.aiGhost = null;
    this.resultNote = '';
    this.weatherClock = 0;
    this.hookClock = 0;
    this.sortDirty = true;
    this.stageSel = 1;
    this.skirmishSel = { map: 0, level: 0 };
    this.menuNodes = [];
    this.dirty = true;
    this.musicKey = null;

    kit.loader.progress(0.25);
    A.bakeShapes(this);
    kit.loader.progress(0.4);
    A.bakeChrome(this);
    kit.loader.progress(0.55);
    A.bakeIcons(this);
    kit.loader.progress(0.7);
    A.bakeUnits(this);
    kit.loader.progress(0.8);

    this.buildWorld();
    this.buildHud();
    this.buildMenus();
    kit.loader.progress(0.9);

    kit.audio.preload(SFX_KEYS).then(function () {
      kit.loader.progress(1);
      window.setTimeout(function () { kit.loader.hide(); }, 60);
      self.ready = true;
      hook.state.ready = true;
    });

    this.installPointer();
    this.setMode('title');
    kit.registerPWA();

    if (hook._pending.mode) { this.forceMode(hook._pending.mode); hook._pending.mode = null; }
    if (hook._pending.stage != null) { this.forceStage(hook._pending.stage); hook._pending.stage = null; }
  };

  // ------------------------------------------------------------- world
  WBScene.prototype.buildWorld = function () {
    this.sky = this.add.image(GAME_W / 2, GAME_H / 2, 'sky').setDepth(0);

    this.world = this.add.container(0, 0).setDepth(2);
    this.board = this.add.image(0, 0, 'hex-fill').setOrigin(0, 0).setVisible(false);
    this.world.add(this.board);

    this.layerDecal = this.add.container(0, 0);
    this.layerZone = this.add.container(0, 0);
    this.layerUnits = this.add.container(0, 0);
    this.layerFx = this.add.container(0, 0);
    this.world.add(this.layerZone);
    this.world.add(this.layerDecal);
    this.world.add(this.layerUnits);
    this.world.add(this.layerFx);

    this.view = { x: 0, y: 0, zoom: 1, minZoom: 0.55, maxZoom: 1.7 };

    // pooled overlays
    var i;
    this.reachPool = [];
    for (i = 0; i < 170; i++) {
      var img = this.add.image(0, 0, 'hex-soft').setVisible(false).setAlpha(0.34);
      img.setBlendMode(Phaser.BlendModes.ADD);
      this.layerDecal.add(img);
      this.reachPool.push(img);
    }
    this.ringPool = [];
    for (i = 0; i < 60; i++) {
      var ring = this.add.image(0, 0, 'hex-ring').setVisible(false);
      this.layerDecal.add(ring);
      this.ringPool.push(ring);
    }
    this.zonePool = [];
    for (i = 0; i < 60; i++) {
      var z = this.add.image(0, 0, 'hex-ring-thin').setVisible(false);
      this.layerZone.add(z);
      this.zonePool.push(z);
    }
    this.threatPool = [];
    for (i = 0; i < 130; i++) {
      var th = this.add.image(0, 0, 'hex-dash').setVisible(false).setAlpha(0.5).setTint(HEX_COL.coral);
      this.layerZone.add(th);
      this.threatPool.push(th);
    }
    this.pathPool = [];
    for (i = 0; i < 26; i++) {
      var pd = this.add.image(0, 0, 'p-dot').setVisible(false).setScale(0.5).setTint(HEX_COL.pale);
      this.layerDecal.add(pd);
      this.pathPool.push(pd);
    }
    this.selKey = this.add.image(0, 0, 'hex-key').setVisible(false).setTint(HEX_COL.white);
    this.layerDecal.add(this.selKey);
    this.cursorRing = this.add.image(0, 0, 'hex-ring-thin').setVisible(false).setAlpha(0.8);
    this.layerDecal.add(this.cursorRing);

    // unit sprites
    this.unitPool = [];
    for (i = 0; i < 26; i++) this.unitPool.push(this.makeUnitSprite());

    // the player proxy: a campaign standard that reacts to every command
    this.proxy = this.makeProxy();

    // particle systems: sparks, dust, debris, trails, bursts, weather
    this.particles = [];
    this.systems = { spark: 0, dust: 0, debris: 0, trail: 0, burst: 0, weather: 0 };
    for (i = 0; i < 120; i++) {
      var p = this.add.image(0, 0, 'p-dot').setVisible(false);
      this.layerFx.add(p);
      this.particles.push({ img: p, a: false, sys: 'spark', x: 0, y: 0, vx: 0, vy: 0,
                            life: 0, max: 1, size: 1, dsize: 0, rot: 0, vr: 0, grav: 0,
                            drag: 1, alpha: 1 });
    }
    this.fx = [];
    for (i = 0; i < 26; i++) {
      var f = this.add.image(0, 0, 'p-ring').setVisible(false);
      this.layerFx.add(f);
      this.fx.push({ img: f, a: false, life: 0, max: 1, s0: 1, s1: 2, a0: 1, rot: 0, vr: 0 });
    }
    this.dmgPool = [];
    for (i = 0; i < 10; i++) {
      var d = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '34px', fontStyle: 'bold', color: CSS.text })
        .setOrigin(0.5).setVisible(false);
      d.setStroke('#08131c', 5);
      this.layerFx.add(d);
      this.dmgPool.push({ t: d, a: false, life: 0, max: 1, x: 0, y: 0, vy: 0 });
    }
  };

  WBScene.prototype.makeUnitSprite = function () {
    var c = this.add.container(0, 0);
    var base = this.add.image(0, 6, 'base-0').setScale(0.62);
    var body = this.add.image(0, 0, 'u-spear-0').setOrigin(0.5, 1).setScale(0.62);
    var barBg = this.add.image(0, 8, 'bar').setDisplaySize(38, 6).setTint(0x0a151f).setAlpha(0.9);
    var barFg = this.add.image(-19, 8, 'bar').setOrigin(0, 0.5).setDisplaySize(38, 6).setTint(HEX_COL.cyan);
    var icon = this.add.image(14, -34, 'ic-star').setScale(0.36).setVisible(false);
    c.add(base); c.add(body); c.add(barBg); c.add(barFg); c.add(icon);
    c.setVisible(false);
    this.layerUnits.add(c);
    return { c: c, base: base, body: body, barBg: barBg, barFg: barFg, icon: icon,
             id: 0, x: 0, y: 0, tx: 0, ty: 0, follow: true, phase: Math.random() * 6.28,
             state: 'idle', st: 0, flash: 0, dying: 0, dead: false, lean: 0 };
  };

  WBScene.prototype.makeProxy = function () {
    var c = this.add.container(0, 0).setDepth(3);
    var pole = this.add.image(0, 0, 'bar').setOrigin(0.5, 1).setDisplaySize(4, 62).setTint(0xc8b184);
    var cloth = this.add.image(2, -58, 'ic-banner').setOrigin(0, 0.5).setScale(0.85).setTint(HEX_COL.cyan);
    var glow = this.add.image(0, -30, 'p-dot').setScale(2.2).setTint(HEX_COL.cyan).setAlpha(0.25);
    c.add(glow); c.add(pole); c.add(cloth);
    c.setVisible(false);
    // the proxy lives in screen space so it can headline the title screen too
    c.setDepth(6);
    return { c: c, pole: pole, cloth: cloth, glow: glow, state: 'idle', t: 0, x: 0, y: 0, tx: 0, ty: 0 };
  };

  // --------------------------------------------------------------- HUD
  WBScene.prototype.chip = function (x, y, w, iconKey, depth) {
    var c = this.add.container(x, y).setDepth(depth || 30);
    var bg = this.add.image(0, 0, 'chip').setDisplaySize(w, 56);
    var ic = this.add.image(-w / 2 + 26, 0, iconKey).setScale(0.62).setTint(HEX_COL.pale);
    var tx = this.add.text(-w / 2 + 52, 0, '', { fontFamily: FONT, fontSize: '24px', fontStyle: 'bold', color: CSS.text })
      .setOrigin(0, 0.5);
    c.add(bg); c.add(ic); c.add(tx);
    return { c: c, bg: bg, icon: ic, text: tx };
  };

  WBScene.prototype.button = function (x, y, w, h, label, iconKey, tex) {
    var c = this.add.container(x, y).setDepth(31);
    var bg = this.add.image(0, 0, tex || 'btn').setDisplaySize(w, h);
    c.add(bg);
    var ic = null, tx = null;
    if (iconKey) {
      ic = this.add.image(label ? -w / 2 + 30 : 0, 0, iconKey).setScale(0.62);
      c.add(ic);
    }
    if (label) {
      tx = this.add.text(iconKey ? -w / 2 + 56 : 0, 0, label, {
        fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: CSS.text
      }).setOrigin(iconKey ? 0 : 0.5, 0.5);
      c.add(tx);
    }
    return { c: c, bg: bg, icon: ic, text: tx, x: x, y: y, w: w, h: h, press: 0 };
  };

  WBScene.prototype.hitButton = function (b, x, y) {
    if (!b || !b.c.visible) return false;
    var hw = Math.max(b.w, 68) / 2, hh = Math.max(b.h, 68) / 2;
    return x >= b.x - hw && x <= b.x + hw && y >= b.y - hh && y <= b.y + hh;
  };

  WBScene.prototype.buildHud = function () {
    var i;
    this.hud = this.add.container(0, 0).setDepth(30);

    this.turnChip = this.chip(258, 52, 220, 'ic-sun');
    this.objChip = this.chip(GAME_W - 172, 52, 260, 'ic-rout');
    this.objChip.text.setOrigin(0, 0.5);

    // selected banner readout, bottom left, out of the thumb line
    this.selPanel = this.add.container(190, GAME_H - 84).setDepth(30);
    var sp = this.add.image(0, 0, 'chip-wide').setDisplaySize(330, 92);
    this.selIcon = this.add.image(-134, -4, 'u-spear-0').setOrigin(0.5, 0.5).setScale(0.34);
    this.selName = this.add.text(-96, -26, '', { fontFamily: FONT, fontSize: '23px', fontStyle: 'bold', color: CSS.text }).setOrigin(0, 0.5);
    this.selHpBg = this.add.image(-96, 6, 'bar').setOrigin(0, 0.5).setDisplaySize(190, 12).setTint(0x0a151f);
    this.selHpFg = this.add.image(-96, 6, 'bar').setOrigin(0, 0.5).setDisplaySize(190, 12).setTint(HEX_COL.cyan);
    this.selHpText = this.add.text(-96, 30, '', { fontFamily: FONT, fontSize: '19px', color: CSS.muted }).setOrigin(0, 0.5);
    this.selPanel.add(sp); this.selPanel.add(this.selIcon); this.selPanel.add(this.selName);
    this.selPanel.add(this.selHpBg); this.selPanel.add(this.selHpFg); this.selPanel.add(this.selHpText);
    this.selPanel.setVisible(false);

    // command rail, bottom right, 44px plus targets with safe margins
    this.btnEnd = this.button(GAME_W - 130, GAME_H - 76, 200, 76, 'END TURN', 'ic-end', 'btn');
    this.btnUndo = this.button(GAME_W - 274, GAME_H - 76, 84, 76, null, 'ic-undo', 'btn-slate');
    this.btnThreat = this.button(GAME_W - 368, GAME_H - 76, 84, 76, null, 'ic-eye', 'btn-slate');
    this.btnMenu = this.button(74, 52, 84, 76, null, 'ic-gear', 'btn-slate');

    // tactic cards above the rail
    this.cardBtns = [];
    for (i = 0; i < 3; i++) {
      var cx = GAME_W - 130 - i * 128;
      var cardC = this.add.container(cx, GAME_H - 190).setDepth(31);
      var bg = this.add.image(0, 0, 'card').setDisplaySize(118, 96);
      var ic = this.add.image(0, -16, 'ic-rally').setScale(0.68).setTint(HEX_COL.pale);
      var nm = this.add.text(0, 28, '', { fontFamily: FONT, fontSize: '19px', fontStyle: 'bold', color: CSS.text }).setOrigin(0.5);
      cardC.add(bg); cardC.add(ic); cardC.add(nm);
      cardC.setVisible(false);
      this.cardBtns.push({ c: cardC, bg: bg, icon: ic, text: nm, x: cx, y: GAME_H - 190, w: 118, h: 96, idx: i });
    }

    // damage forecast tray, only while a target is previewed
    this.fcPanel = this.add.container(GAME_W / 2, 138).setDepth(32);
    var fbg = this.add.image(0, 0, 'panel').setDisplaySize(470, 132);
    this.fcDmg = this.add.text(-190, -22, '', { fontFamily: FONT, fontSize: '46px', fontStyle: 'bold', color: CSS.coral }).setOrigin(0, 0.5);
    this.fcSub = this.add.text(-190, 18, '', { fontFamily: FONT, fontSize: '20px', color: CSS.muted }).setOrigin(0, 0.5);
    this.fcPanel.add(fbg); this.fcPanel.add(this.fcDmg); this.fcPanel.add(this.fcSub);
    this.fcParts = [];
    for (i = 0; i < 5; i++) {
      var px = -40 + (i % 3) * 118, py = -30 + Math.floor(i / 3) * 42;
      var pc = this.add.container(px, py);
      var pi = this.add.image(0, 0, 'ic-star').setScale(0.44).setTint(HEX_COL.pale);
      var pt = this.add.text(20, 0, '', { fontFamily: FONT, fontSize: '19px', fontStyle: 'bold', color: CSS.text }).setOrigin(0, 0.5);
      pc.add(pi); pc.add(pt);
      pc.setVisible(false);
      this.fcPanel.add(pc);
      this.fcParts.push({ c: pc, icon: pi, text: pt });
    }
    this.fcHint = this.add.text(0, 48, '', { fontFamily: FONT, fontSize: '19px', color: CSS.amber }).setOrigin(0.5);
    this.fcPanel.add(this.fcHint);
    this.fcPanel.setVisible(false);

    // one transient at a time: a small corner toast chip
    this.toastC = this.add.container(GAME_W / 2, 128).setDepth(33);
    var tb = this.add.image(0, 0, 'chip-wide').setDisplaySize(360, 50);
    this.toastIcon = this.add.image(-152, 0, 'ic-star').setScale(0.5).setTint(HEX_COL.amber);
    this.toastText = this.add.text(-126, 0, '', { fontFamily: FONT, fontSize: '21px', fontStyle: 'bold', color: CSS.text }).setOrigin(0, 0.5);
    this.toastC.add(tb); this.toastC.add(this.toastIcon); this.toastC.add(this.toastText);
    this.toastC.setVisible(false);

    // thin coach strip, top edge, one line, fades
    this.coachC = this.add.container(GAME_W / 2, 112).setDepth(33);
    var cb = this.add.image(0, 0, 'chip-wide').setDisplaySize(700, 46).setAlpha(0.9);
    this.coachText = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '21px', color: CSS.pale }).setOrigin(0.5);
    this.coachC.add(cb); this.coachC.add(this.coachText);
    this.coachC.setVisible(false);

    // run boundary banner, 60 percent width, overshoot, boundaries only
    this.bannerC = this.add.container(GAME_W / 2, GAME_H / 2 - 40).setDepth(34);
    var bb = this.add.image(0, 0, 'banner');
    this.bannerTitle = this.add.text(0, -18, '', { fontFamily: FONT, fontSize: '44px', fontStyle: 'bold', color: CSS.text }).setOrigin(0.5);
    this.bannerSub = this.add.text(0, 28, '', { fontFamily: FONT, fontSize: '22px', color: CSS.pale }).setOrigin(0.5);
    this.bannerC.add(bb); this.bannerC.add(this.bannerTitle); this.bannerC.add(this.bannerSub);
    this.bannerC.setVisible(false);

    this.hudItems = [this.turnChip.c, this.objChip.c, this.selPanel, this.btnEnd.c,
                     this.btnUndo.c, this.btnThreat.c, this.btnMenu.c];
  };

  WBScene.prototype.showHud = function (on) {
    for (var i = 0; i < this.hudItems.length; i++) setVis(this.hudItems[i], on);
    if (!on) {
      setVis(this.fcPanel, false);
      setVis(this.selPanel, false);
      for (var k = 0; k < this.cardBtns.length; k++) setVis(this.cardBtns[k].c, false);
    }
  };

  // --------------------------------------------------------------- menus
  /* Menus are pooled and rebuilt only when something changes, never per
   * frame. Every rebuild also rebuilds the hit list, so a stale button can
   * never stay tappable. */
  WBScene.prototype.buildMenus = function () {
    var i;
    this.menuC = this.add.container(0, 0).setDepth(20);
    this.menuImgs = [];
    this.menuTexts = [];
    for (i = 0; i < 110; i++) {
      var im = this.add.image(0, 0, 'chip').setVisible(false);
      this.menuC.add(im);
      this.menuImgs.push(im);
    }
    for (i = 0; i < 110; i++) {
      var tx = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '22px', color: CSS.text }).setVisible(false);
      this.menuC.add(tx);
      this.menuTexts.push(tx);
    }
    this.menuHits = [];
    this.mi = 0; this.mt = 0;
  };

  WBScene.prototype.mBegin = function () {
    this.mi = 0; this.mt = 0;
    this.menuHits.length = 0;
  };
  WBScene.prototype.mEnd = function () {
    for (var i = this.mi; i < this.menuImgs.length; i++) setVis(this.menuImgs[i], false);
    for (var j = this.mt; j < this.menuTexts.length; j++) setVis(this.menuTexts[j], false);
  };
  WBScene.prototype.mImg = function (key, x, y, w, h, tint, alpha) {
    if (this.mi >= this.menuImgs.length) return null;
    var im = this.menuImgs[this.mi++];
    if (im.texture.key !== key) im.setTexture(key);
    im.setPosition(x, y);
    if (w) im.setDisplaySize(w, h);
    im.setTint(tint == null ? 0xffffff : tint);
    im.setAlpha(alpha == null ? 1 : alpha);
    im.setOrigin(0.5);
    setVis(im, true);
    return im;
  };
  WBScene.prototype.mText = function (str, x, y, size, color, origin, bold) {
    if (this.mt >= this.menuTexts.length) return null;
    var t = this.menuTexts[this.mt++];
    setTextIfChanged(t, str);
    if (t.__size !== size) { t.setFontSize(size); t.__size = size; }
    setColorIfChanged(t, color || CSS.text);
    if (t.__bold !== !!bold) { t.setFontStyle(bold ? 'bold' : ''); t.__bold = !!bold; }
    t.setOrigin(origin == null ? 0.5 : origin, 0.5);
    t.setPosition(x, y);
    setVis(t, true);
    return t;
  };
  WBScene.prototype.mHit = function (x, y, w, h, action, arg) {
    this.menuHits.push({ x: x, y: y, w: Math.max(w, 68), h: Math.max(h, 68), action: action, arg: arg });
  };
  WBScene.prototype.mButton = function (label, x, y, w, h, iconKey, style, action, arg, dim) {
    this.mImg(style || 'btn', x, y, w, h, dim ? 0x8899aa : 0xffffff, dim ? 0.6 : 1);
    if (iconKey) this.mImg(iconKey, x - (label ? w / 2 - 34 : 0), y, 30, 30, 0xffffff, dim ? 0.6 : 1);
    if (label) this.mText(label, x + (iconKey ? 18 : 0), y, 22, dim ? CSS.muted : CSS.text, 0.5, true);
    if (action) this.mHit(x, y, w, h, action, arg);
  };

  WBScene.prototype.setMode = function (mode) {
    this.mode = mode;
    this.dirty = true;
    var battleish = mode === 'battle' || mode === 'result';
    setVis(this.sky, true);
    if (battleish && this.battle) {
      var sk = this.battle.prov.sky[0];
      this.sky.setTint(Phaser.Display.Color.HexStringToColor(sk).color);
      this.sky.setAlpha(0.85);
    } else {
      this.sky.setTint(0xffffff);
      this.sky.setAlpha(1);
    }
    setVis(this.world, battleish);
    setVis(this.menuC, !battleish || mode === 'result');
    this.showHud(mode === 'battle');
    setVis(this.bannerC, false);
    setVis(this.toastC, false);
    setVis(this.coachC, false);
    setVis(this.proxy.c, mode === 'battle' || mode === 'title');
    if (mode !== 'battle') { this.sel = null; this.preview = null; this.cardMode = null; }
    this.ensureMusic();
    this.syncHook();
    this.rebuildMenu();
  };

  WBScene.prototype.ensureMusic = function () {
    var want = 'music-campaign';
    if (this.mode === 'battle' && this.battle) {
      want = (this.battle.def.prov >= 2 || this.battle.objective.kind === 'siege') ? 'music-siege' : 'music-battle';
    } else if (this.mode === 'result' && this.battle && this.battle.result === 'win') {
      want = 'music-campaign';
    }
    if (this.musicKey === want) return;
    this.musicKey = want;
    kit.audio.music(want, 900);
  };

  WBScene.prototype.rebuildMenu = function () {
    if (this.mode === 'battle') { this.mBegin(); this.mEnd(); return; }
    this.mBegin();
    if (this.mode === 'title') this.drawTitle();
    else if (this.mode === 'map') this.drawMap();
    else if (this.mode === 'army') this.drawArmy();
    else if (this.mode === 'skirmish') this.drawSkirmish();
    else if (this.mode === 'result') this.drawResult();
    this.mEnd();
  };

  WBScene.prototype.drawTitle = function () {
    this.mImg('banner', GAME_W / 2, 190, 900, 150, 0xffffff, 0.9);
    this.mText('WARRING BANNERS', GAME_W / 2, 168, 62, CSS.text, 0.5, true);
    this.mText('Hex campaign tactics', GAME_W / 2, 218, 24, CSS.pale, 0.5, false);

    var wins = profile.wins;
    this.mButton('CAMPAIGN', GAME_W / 2 - 220, 400, 260, 82, 'ic-banner', 'btn', 'campaign');
    this.mButton('SKIRMISH', GAME_W / 2 + 80, 400, 260, 82, 'ic-rout', 'btn-slate', 'skirmish');
    this.mButton('SETTINGS', GAME_W / 2 - 220, 506, 260, 82, 'ic-gear', 'btn-slate', 'settings');
    this.mButton(uiPrefs.veteran ? 'VETERAN' : 'CAPTAIN', GAME_W / 2 + 80, 506, 260, 82,
                 'ic-shield', uiPrefs.veteran ? 'btn-amber' : 'btn-slate', 'difficulty');

    this.mImg('chip-wide', GAME_W / 2, 618, 620, 54, 0xffffff, 0.85);
    var vet = E.veterancy(wins);
    this.mText('Victories ' + wins + ' of ' + E.BATTLES.length + '     Veterancy +' + vet.hpPct + '% health, +' + vet.atkPct + '% strike',
               GAME_W / 2, 618, 21, CSS.muted, 0.5, false);
    this.mText('Generals ' + E.unlockedGenerals(wins).length + ' of 8     Tactic cards ' + E.unlockedCards(wins).length + ' of 8',
               GAME_W / 2, 668, 20, CSS.muted, 0.5, false);
  };

  WBScene.prototype.drawMap = function () {
    this.mText('THE SEASON', 60, 62, 38, CSS.text, 0, true);
    this.mText('Four provinces, twenty battles', 60, 104, 21, CSS.muted, 0, false);
    this.mButton(null, GAME_W - 62, 62, 84, 76, 'ic-back', 'btn-slate', 'title');

    var next = Math.min(E.BATTLES.length, profile.wins + 1);
    for (var p = 0; p < 4; p++) {
      var y = 190 + p * 122;
      var prov = E.PROVINCES[p];
      this.mText(prov.name.toUpperCase(), 60, y - 44, 22, CSS.bone, 0, true);
      this.mText(prov.motif, 60, y - 16, 18, CSS.muted, 0, false);
      for (var i = 0; i < 5; i++) {
        var id = p * 5 + i + 1;
        var def = E.battleOf(id);
        var x = 424 + i * 166;
        var done = profile.cleared.indexOf(id) >= 0;
        var open = id <= next;
        var key = done ? 'node-done' : (id === next ? 'node-on' : 'node');
        this.mImg(key, x, y, 152, 96, 0xffffff, open ? 1 : 0.45);
        this.mText(String(id), x - 56, y - 26, 22, done ? CSS.green : (open ? CSS.cyan : CSS.muted), 0, true);
        this.mImg(A.iconKey(OBJ_ICON[def.obj.kind] || 'rout'), x + 54, y - 24, 26, 26,
                  done ? 0x8dd6a8 : (open ? 0x43c7f4 : 0x718092), open ? 1 : 0.6);
        this.mText(def.name, x, y + 6, 17, open ? CSS.text : CSS.muted, 0.5, false);
        this.mImg(A.iconKey(E.weatherOf(def.weather).icon), x - 52, y + 32, 22, 22, 0xd8c38c, open ? 0.9 : 0.4);
        if (!open) this.mImg('ic-lock', x + 56, y + 30, 24, 24, 0x718092, 0.8);
        else if (done) this.mImg('ic-star', x + 56, y + 30, 24, 24, 0x8dd6a8, 1);
        if (open) this.mHit(x, y, 152, 96, 'stage', id);
      }
    }
  };

  WBScene.prototype.drawArmy = function () {
    var def = E.battleOf(this.stageSel);
    var wins = profile.wins;
    this.mText(this.mode === 'army' && this.skirmish ? 'SKIRMISH ARMY' : def.name.toUpperCase(), 60, 60, 34, CSS.text, 0, true);
    this.mText(def.brief, 60, 100, 20, CSS.muted, 0, false);
    this.mButton(null, GAME_W - 62, 60, 84, 76, 'ic-back', 'btn-slate', this.skirmish ? 'skirmish' : 'map');

    // generals, left column
    this.mText('GENERAL', 60, 146, 20, CSS.bone, 0, true);
    for (var g = 0; g < E.GENERALS.length; g++) {
      var gen = E.GENERALS[g];
      var open = gen.unlock <= wins;
      var on = profile.general === gen.id;
      var gy = 186 + g * 54;
      this.mImg(on ? 'slot-on' : 'slot', 210, gy, 296, 48, 0xffffff, open ? 1 : 0.4);
      this.mText(gen.name, 80, gy - 8, 19, open ? (on ? CSS.cyan : CSS.text) : CSS.muted, 0, true);
      this.mText(open ? gen.title : 'Win ' + gen.unlock + ' battles', 80, gy + 13, 15, CSS.muted, 0, false);
      if (!open) this.mImg('ic-lock', 336, gy, 20, 20, 0x718092, 0.8);
      if (open) this.mHit(210, gy, 296, 48, 'general', gen.id);
    }
    var passive = E.generalOf(profile.general);
    this.mText(passive.passiveText, 62, 640, 17, CSS.green, 0, false);

    // army column: the fielded five and the supply budget
    var army = profile.army;
    var fielded = E.affordable(army.slice(0, 5), def.budget);
    var cost = E.armyCost(fielded);
    this.mText('ARMY', 420, 146, 20, CSS.bone, 0, true);
    this.mText(cost + ' of ' + def.budget + ' supply', 510, 146, 19,
               E.armyCost(army) > def.budget ? CSS.amber : CSS.muted, 0, false);
    var used = [], i2;
    for (i2 = 0; i2 < fielded.length; i2++) used.push(fielded[i2]);
    for (var s = 0; s < 5; s++) {
      var sx = 460 + s * 84, sy = 230;
      var cls = army[s];
      var fits = false;
      if (cls) {
        var at = used.indexOf(cls);
        if (at >= 0) { fits = true; used.splice(at, 1); }
      }
      this.mImg(cls ? 'slot-on' : 'slot', sx, sy, 76, 122, 0xffffff, cls ? (fits ? 1 : 0.4) : 0.7);
      if (cls) {
        this.mImg('u-' + cls + '-0', sx, sy + 8, A.UNIT_W * 0.56, A.UNIT_H * 0.56, 0xffffff, fits ? 1 : 0.45);
        this.mText(E.unitOf(cls).name, sx, sy + 50, 15, fits ? CSS.text : CSS.muted, 0.5, true);
        this.mText(String(E.unitOf(cls).cost), sx + 24, sy - 46, 16, fits ? CSS.amber : CSS.muted, 0.5, true);
        this.mHit(sx, sy, 76, 122, 'unslot', s);
      } else {
        this.mText('open', sx, sy, 16, CSS.muted, 0.5, false);
      }
    }
    this.mText('Tap a banner to drop it, tap a class below to add one.', 422, 312, 16, CSS.muted, 0, false);
    this.mText('RECRUIT', 422, 348, 18, CSS.bone, 0, true);
    for (var c = 0; c < E.PICKABLE.length; c++) {
      var pc = E.PICKABLE[c], px = 460 + c * 84, py = 410;
      var u = E.unitOf(pc);
      var afford = E.armyCost(army) + u.cost <= def.budget && army.length < 5;
      this.mImg('slot', px, py, 76, 108, 0xffffff, afford ? 1 : 0.45);
      this.mImg('u-' + pc + '-0', px, py + 4, A.UNIT_W * 0.5, A.UNIT_H * 0.5, 0xffffff, afford ? 1 : 0.45);
      this.mText(u.name, px, py + 42, 15, afford ? CSS.text : CSS.muted, 0.5, true);
      this.mText(String(u.cost), px + 26, py - 40, 16, CSS.amber, 0.5, true);
      this.mHit(px, py, 76, 108, 'addunit', pc);
    }
    this.mText(E.unitOf(army[army.length - 1] || 'spear').blurb, 422, 486, 16, CSS.muted, 0, false);

    // battle brief, right column
    var kind = def.obj.kind;
    this.mImg('panel', 1032, 300, 392, 340);
    this.mImg(A.iconKey(OBJ_ICON[kind]), 878, 168, 30, 30, 0x43c7f4);
    this.mText(OBJ_NAME[kind] + (def.obj.need ? '  ' + def.obj.need : ''), 902, 168, 22, CSS.cyan, 0, true);
    this.mText(OBJ_HINT[kind], 860, 204, 17, CSS.text, 0, false);
    this.mImg(A.iconKey(E.weatherOf(def.weather).icon), 878, 250, 26, 26, 0xd8c38c);
    this.mText(E.weatherOf(def.weather).note, 902, 250, 17, CSS.bone, 0, false);
    this.mText('Turn limit ' + def.turns, 860, 288, 17, CSS.muted, 0, false);
    var vet = E.veterancy(wins);
    this.mText('Veterans +' + vet.hpPct + '% health, +' + vet.atkPct + '% strike', 860, 316, 17, CSS.green, 0, false);
    this.mText('TACTIC CARDS', 860, 356, 17, CSS.bone, 0, true);
    var hand = E.handFor(profile.general, wins);
    for (var h = 0; h < hand.length; h++) {
      var card = E.cardOf(hand[h]);
      this.mImg(A.iconKey(card.icon), 876, 392 + h * 34, 24, 24, 0xbfeeff);
      this.mText(card.name, 898, 392 + h * 34, 17, CSS.text, 0, false);
    }

    this.mButton('TAKE THE FIELD', 1058, GAME_H - 76, 320, 84, 'ic-banner', 'btn', 'deploy');
    this.mButton('RESET ARMY', 700, GAME_H - 76, 230, 84, 'ic-undo', 'btn-slate', 'resetarmy');
  };

  WBScene.prototype.drawSkirmish = function () {
    this.mText('SKIRMISH', 60, 60, 34, CSS.text, 0, true);
    this.mText('Pick the ground and the odds. Nothing is locked here.', 60, 100, 20, CSS.muted, 0, false);
    this.mButton(null, GAME_W - 62, 60, 84, 76, 'ic-back', 'btn-slate', 'title');

    this.mText('MAP', 60, 170, 21, CSS.bone, 0, true);
    for (var i = 0; i < E.SKIRMISH.length; i++) {
      var sk = E.SKIRMISH[i];
      var map = E.mapOf(sk.map);
      var x = 200 + (i % 3) * 300, y = 250 + Math.floor(i / 3) * 120;
      var on = this.skirmishSel.map === i;
      this.mImg(on ? 'node-on' : 'node', x, y, 270, 96);
      this.mText(map.name, x - 108, y - 18, 22, on ? CSS.cyan : CSS.text, 0, true);
      this.mText(E.PROVINCES[map.prov].name, x - 108, y + 10, 18, CSS.muted, 0, false);
      this.mImg(A.iconKey(OBJ_ICON[sk.obj]), x + 100, y, 30, 30, on ? 0x43c7f4 : 0x718092);
      this.mHit(x, y, 270, 96, 'skmap', i);
    }
    this.mText('ODDS', 60, 500, 21, CSS.bone, 0, true);
    for (var l = 0; l < E.SKIRMISH_LEVELS.length; l++) {
      var lx = 200 + l * 230;
      var lon = this.skirmishSel.level === l;
      this.mImg(lon ? 'node-on' : 'node', lx, 560, 200, 78);
      this.mText(E.SKIRMISH_LEVELS[l], lx, 560, 22, lon ? CSS.cyan : CSS.text, 0.5, true);
      this.mHit(lx, 560, 200, 78, 'sklevel', l);
    }
    this.mText('Best skirmish score ' + profile.skirmish, 200, 626, 19, CSS.muted, 0.5, false);
    this.mButton('ARMY', GAME_W - 420, 560, 220, 86, 'ic-banner', 'btn-slate', 'skarmy');
    this.mButton('FIGHT', GAME_W - 170, 560, 220, 86, 'ic-rout', 'btn', 'skdeploy');
  };

  WBScene.prototype.drawResult = function () {
    var b = this.battle;
    if (!b) return;
    var win = b.result === 'win';
    var rate = E.rateBattle(b);
    this.mImg('panel-wide', GAME_W / 2, GAME_H / 2, 820, 440, 0xffffff, 0.96);
    this.mText(win ? 'THE FIELD IS YOURS' : 'THE BANNERS FALL', GAME_W / 2, 200, 46, win ? CSS.cyan : CSS.coral, 0.5, true);
    this.mText(win ? b.def.name : (b.lossReason || 'The army is broken.'), GAME_W / 2, 250, 22, CSS.muted, 0.5, false);

    for (var s = 0; s < 3; s++) {
      var on = win && rate.stars > s;
      this.mImg('ic-star', GAME_W / 2 - 70 + s * 70, 316, 52, 52, on ? 0xe0a34a : 0x2c4b62, on ? 1 : 0.7);
    }
    this.mText('Banners broken ' + b.kills + '     Banners lost ' + b.losses + '     Turns ' + b.turn + ' of ' + b.turnLimit,
               GAME_W / 2, 384, 21, CSS.text, 0.5, false);
    this.mText('Score ' + rate.score, GAME_W / 2, 420, 26, CSS.amber, 0.5, true);
    if (this.resultNote) this.mText(this.resultNote, GAME_W / 2, 462, 21, CSS.green, 0.5, true);

    if (b.mode === 'skirmish') {
      this.mButton('SKIRMISH', GAME_W / 2 - 150, 552, 260, 82, 'ic-back', 'btn-slate', 'skirmish');
      this.mButton('AGAIN', GAME_W / 2 + 150, 552, 260, 82, 'ic-rout', 'btn', 'skdeploy');
    } else {
      this.mButton('THE SEASON', GAME_W / 2 - 150, 552, 260, 82, 'ic-back', 'btn-slate', 'map');
      this.mButton(win ? 'NEXT BATTLE' : 'TRY AGAIN', GAME_W / 2 + 150, 552, 260, 82, 'ic-banner', 'btn', win ? 'nextbattle' : 'deploy');
    }
  };

  // --------------------------------------------------------- menu actions
  WBScene.prototype.menuAction = function (action, arg) {
    kit.audio.sfx('select', { volume: 0.7 });
    if (action === 'campaign') {
      this.skirmish = false;
      this.setMode('map');
    } else if (action === 'skirmish') {
      this.skirmish = true;
      this.setMode('skirmish');
    } else if (action === 'title') {
      this.skirmish = false;
      this.setMode('title');
    } else if (action === 'map') {
      this.skirmish = false;
      this.setMode('map');
    } else if (action === 'settings') {
      this.openSettings();
    } else if (action === 'difficulty') {
      uiPrefs.veteran = !uiPrefs.veteran;
      saveDifficulty();
      this.dirty = true;
    } else if (action === 'stage') {
      this.stageSel = arg;
      this.skirmish = false;
      this.setMode('army');
    } else if (action === 'skarmy') {
      this.stageSel = Math.min(E.BATTLES.length, profile.wins + 1);
      this.setMode('army');
    } else if (action === 'general') {
      profile.general = arg;
      kit.save.set(profile);
      this.dirty = true;
    } else if (action === 'unslot') {
      if (profile.army.length > 1 && arg < profile.army.length) {
        profile.army.splice(arg, 1);
        kit.save.set(profile);
        this.dirty = true;
      } else kit.audio.sfx('cancel', { volume: 0.6 });
    } else if (action === 'addunit') {
      var def = E.battleOf(this.stageSel);
      if (profile.army.length < 5 && E.armyCost(profile.army) + E.unitOf(arg).cost <= def.budget) {
        profile.army.push(arg);
        kit.save.set(profile);
        this.dirty = true;
      } else kit.audio.sfx('cancel', { volume: 0.6 });
    } else if (action === 'resetarmy') {
      profile.army = E.DEFAULT_ARMY.slice();
      kit.save.set(profile);
      this.dirty = true;
    } else if (action === 'deploy') {
      this.startBattle(this.stageSel, false);
    } else if (action === 'nextbattle') {
      this.stageSel = Math.min(E.BATTLES.length, profile.wins + 1);
      this.setMode('army');
    } else if (action === 'skmap') {
      this.skirmishSel.map = arg;
      this.dirty = true;
    } else if (action === 'sklevel') {
      this.skirmishSel.level = arg;
      this.dirty = true;
    } else if (action === 'skdeploy') {
      this.startBattle(0, true);
    }
  };

  WBScene.prototype.openSettings = function () {
    var self = this;
    kit.openSettings([function (box, row) {
      row('Veteran odds', function () { return uiPrefs.veteran; }, function (v) {
        uiPrefs.veteran = v; saveDifficulty(); self.dirty = true;
      });
      row('Threat overlay', function () { return self.showThreat; }, function (v) {
        self.showThreat = v;
      });
    }]);
  };

  // ======================================================== battle setup
  WBScene.prototype.startBattle = function (stage, isSkirmish) {
    var def;
    if (isSkirmish) {
      var sk = E.SKIRMISH[clamp(this.skirmishSel.map, 0, E.SKIRMISH.length - 1)];
      var lvl = clamp(this.skirmishSel.level, 0, E.SKIRMISH_FOES.length - 1);
      var map = E.mapOf(sk.map);
      def = {
        id: 6 + lvl * 4, prov: map.prov, map: sk.map, mirror: lvl % 2 === 1,
        obj: { kind: sk.obj, need: sk.obj === 'hold' ? 3 + lvl : 0, zone: 'mark' },
        weather: ['clear', 'rain', 'snow', 'wind'][lvl], turns: 14, budget: 30,
        foes: E.SKIRMISH_FOES[lvl],
        name: map.name + ' // ' + E.SKIRMISH_LEVELS[lvl],
        brief: 'A skirmish on open ground. Nothing is banked but the score.'
      };
    } else {
      def = E.battleOf(stage);
    }
    this.battle = E.createBattle({
      battle: def, army: profile.army, general: profile.general, wins: profile.wins,
      mode: isSkirmish ? 'skirmish' : 'campaign', level: this.skirmishSel.level,
      difficulty: uiPrefs.veteran ? 'veteran' : 'captain'
    });
    this.resultNote = '';
    this.sel = null; this.preview = null; this.cardMode = null;
    this.reachData = null; this.targetSet = {}; this.healSet = {};
    this.aiQueue.length = 0; this.aiTimer = 0; this.aiGhost = null;
    this.releaseAllSprites();
    var g = E.generalOfSide(this.battle, 0);
    this.cursor = g ? { q: g.q, r: g.r } : { q: 0, r: 0 };

    this.boardInfo = A.bakeBoard(this, 'board-live', this.battle, E);
    this.board.setTexture('board-live');
    this.board.setVisible(true);
    this.fitCamera();
    this.decalDirty = true;
    this.setMode('battle');
    this.bannerShow(def.name.toUpperCase(), OBJ_HINT[this.battle.objective.kind]);
    if (this.tutorialStep < 99) this.coachSay('Tap one of your banners to see where it can march.', true);
    this.spawnWeather(true);
  };

  WBScene.prototype.fitCamera = function () {
    var bi = this.boardInfo;
    if (!bi) return;
    var availW = GAME_W - 36, availH = GAME_H - 176;
    var z = Math.min(availW / bi.w, availH / bi.h);
    this.view.minZoom = clamp(z * 0.8, 0.35, 1);
    this.view.zoom = clamp(z, this.view.minZoom, this.view.maxZoom);
    this.view.x = GAME_W / 2 - (bi.w / 2) * this.view.zoom;
    this.view.y = (GAME_H + 28) / 2 - (bi.h / 2) * this.view.zoom;
    this.applyView();
  };
  WBScene.prototype.applyView = function () {
    var bi = this.boardInfo;
    if (bi) {
      var w = bi.w * this.view.zoom, h = bi.h * this.view.zoom;
      var padX = Math.max(120, GAME_W * 0.35), padY = Math.max(90, GAME_H * 0.3);
      this.view.x = clamp(this.view.x, GAME_W - w - padX, padX);
      this.view.y = clamp(this.view.y, GAME_H - h - padY, padY);
    }
    this.world.setPosition(this.view.x + this.shakeX, this.view.y + this.shakeY);
    this.world.setScale(this.view.zoom);
  };
  WBScene.prototype.worldPos = function (q, r) {
    var p = E.toPix(q, r, HEXR);
    var t = this.battle ? E.tileAt(this.battle, q, r) : null;
    var lift = t && t.elev ? t.elev * 3 : 0;
    return { x: p.x + this.boardInfo.ox, y: p.y + this.boardInfo.oy - lift };
  };
  WBScene.prototype.screenToAxial = function (sx, sy) {
    var wx = (sx - this.world.x) / this.view.zoom - this.boardInfo.ox;
    var wy = (sy - this.world.y) / this.view.zoom - this.boardInfo.oy;
    return E.fromPix(wx, wy, HEXR);
  };

  // ------------------------------------------------------------ sprites
  WBScene.prototype.releaseAllSprites = function () {
    this.sprites = {};
    for (var i = 0; i < this.unitPool.length; i++) {
      this.unitPool[i].id = 0;
      setVis(this.unitPool[i].c, false);
    }
  };
  WBScene.prototype.spriteFor = function (u) {
    var s = this.sprites[u.id];
    if (s) return s;
    for (var i = 0; i < this.unitPool.length; i++) {
      if (!this.unitPool[i].id) {
        s = this.unitPool[i];
        s.id = u.id;
        s.dead = false; s.dying = 0; s.flash = 0; s.state = 'idle'; s.st = 0; s.lean = 0;
        s.hold = null;
        var p = this.worldPos(u.q, u.r);
        s.x = p.x; s.y = p.y; s.tx = p.x; s.ty = p.y;
        s.body.setTexture('u-' + u.cls + '-' + u.side);
        s.base.setTexture('base-' + u.side);
        s.barFg.setTint(u.side === 0 ? HEX_COL.cyan : HEX_COL.coral);
        s.c.setAlpha(1);
        s.c.setScale(1);
        setVis(s.c, true);
        this.sprites[u.id] = s;
        return s;
      }
    }
    return null;
  };

  // -------------------------------------------------------------- input
  /* Pointer identity is GGKit's, but a tap must never be missed between two
   * polled frames, so claims are made on WINDOW listeners installed AFTER
   * GGKit init. Every claim seeds kit.input.pointers, so the kit stays the
   * single source of truth and a canvas-level handler can never race it. */
  WBScene.prototype.installPointer = function () {
    var self = this;
    function toGame(e) {
      var rect = self.game.canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) * GAME_W / Math.max(1, rect.width),
        y: (e.clientY - rect.top) * GAME_H / Math.max(1, rect.height)
      };
    }
    function onCanvas(e) { return e.target === self.game.canvas; }

    window.addEventListener('pointerdown', function (e) {
      if (kit.paused || !onCanvas(e)) return;
      if (!kit.input.pointers.has(e.pointerId)) {
        kit.input.pointers.set(e.pointerId, {
          x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY,
          downAt: performance.now(), zone: null
        });
      }
      var g = toGame(e);
      self.pointerClaims[e.pointerId] = {
        sx: g.x, sy: g.y, lx: g.x, ly: g.y, x: g.x, y: g.y,
        t: performance.now(), moved: 0
      };
      self.pinch = null;
    }, { passive: true });

    window.addEventListener('pointermove', function (e) {
      var c = self.pointerClaims[e.pointerId];
      if (!c || kit.paused) return;
      var g = toGame(e);
      c.moved += Math.abs(g.x - c.lx) + Math.abs(g.y - c.ly);
      c.x = g.x; c.y = g.y;
      var ids = Object.keys(self.pointerClaims);
      if (self.mode === 'battle' && ids.length === 1) {
        if (c.moved > 14) {
          self.view.x += c.x - c.lx;
          self.view.y += c.y - c.ly;
          self.applyView();
        }
      } else if (self.mode === 'battle' && ids.length >= 2) {
        var a = self.pointerClaims[ids[0]], b2 = self.pointerClaims[ids[1]];
        var d = Math.hypot(a.x - b2.x, a.y - b2.y);
        if (self.pinch) self.zoomBy(d / Math.max(20, self.pinch), (a.x + b2.x) / 2, (a.y + b2.y) / 2);
        self.pinch = d;
      }
      c.lx = c.x; c.ly = c.y;
    }, { passive: true });

    function release(e) {
      var c = self.pointerClaims[e.pointerId];
      if (!c) return;
      delete self.pointerClaims[e.pointerId];
      if (!Object.keys(self.pointerClaims).length) self.pinch = null;
      if (kit.paused) return;
      if (c.moved < 18 && performance.now() - c.t < 800) self.handleTap(c.x, c.y);
    }
    window.addEventListener('wheel', function (e) {
      if (self.mode !== 'battle' || kit.paused || !onCanvas(e)) return;
      var g = toGame(e);
      self.zoomBy(e.deltaY > 0 ? 0.9 : 1.11, g.x, g.y);
    }, { passive: true });
    window.addEventListener('pointerup', release, { passive: true });
    window.addEventListener('pointercancel', function (e) {
      delete self.pointerClaims[e.pointerId];
      self.pinch = null;
    }, { passive: true });
    // a pause or a restart drops every live claim with the kit's own state
    window.addEventListener('blur', function () {
      self.pointerClaims = {};
      self.pinch = null;
    });
  };

  WBScene.prototype.pollInput = function () {
    if (kit.paused) this.pointerClaims = {};
    this.pollKeys();
  };

  WBScene.prototype.zoomBy = function (f, cx, cy) {
    var z0 = this.view.zoom;
    var z1 = clamp(z0 * f, this.view.minZoom, this.view.maxZoom);
    if (z1 === z0) return;
    this.view.x = cx - (cx - this.view.x) * (z1 / z0);
    this.view.y = cy - (cy - this.view.y) * (z1 / z0);
    this.view.zoom = z1;
    this.applyView();
  };

  var KEY_DIRS = {
    ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0],
    ArrowUp: [0, -1], KeyW: [1, -1], ArrowDown: [0, 1], KeyS: [-1, 1]
  };
  var KEY_CODES = ['Enter', 'Space', 'Escape', 'KeyU', 'KeyT', 'KeyE', 'KeyM', 'KeyR',
                   'Digit1', 'Digit2', 'Digit3', 'Equal', 'Minus', 'KeyF'];
  WBScene.prototype.pollKeys = function () {
    var code;
    for (code in KEY_DIRS) {
      var down = kit.input.keyDown(code), was = !!this.keyEdges[code];
      if (down && !was) this.moveCursor(KEY_DIRS[code][0], KEY_DIRS[code][1]);
      this.keyEdges[code] = down;
    }
    for (var i = 0; i < KEY_CODES.length; i++) {
      code = KEY_CODES[i];
      var d2 = kit.input.keyDown(code), w2 = !!this.keyEdges[code];
      if (d2 && !w2) this.handleKey(code);
      this.keyEdges[code] = d2;
    }
  };

  WBScene.prototype.moveCursor = function (dq, dr) {
    if (this.mode !== 'battle' || !this.battle) return;
    var q = this.cursor.q + dq, r = this.cursor.r + dr;
    if (!E.tileAt(this.battle, q, r)) return;
    this.cursor.q = q; this.cursor.r = r;
    this.proxy.state = 'command'; this.proxy.t = 0.4;
    this.decalDirty = true;
    var u = E.unitAt(this.battle, q, r);
    if (u && u.side === 1 && this.sel && this.targetSet[E.key(q, r)]) this.setPreview(u);
    else if (this.preview) { this.preview = null; this.decalDirty = true; }
  };

  WBScene.prototype.handleKey = function (code) {
    if (this.mode !== 'battle') {
      if (code === 'Enter' || code === 'Space') {
        if (this.menuHits.length) this.menuAction(this.menuHits[this.menuHits.length - 1].action, this.menuHits[this.menuHits.length - 1].arg);
      } else if (code === 'Escape') {
        if (this.mode !== 'title') this.setMode('title');
      } else if (code === 'KeyM') this.openSettings();
      return;
    }
    if (code === 'Escape') { this.clearSelection(); kit.audio.sfx('cancel', { volume: 0.6 }); }
    else if (code === 'Enter' || code === 'Space') this.confirmAt(this.cursor.q, this.cursor.r);
    else if (code === 'KeyU') this.doUndo();
    else if (code === 'KeyT') { this.showThreat = !this.showThreat; this.decalDirty = true; }
    else if (code === 'KeyE' || code === 'KeyR') this.doEndTurn();
    else if (code === 'KeyM') this.openSettings();
    else if (code === 'KeyF') this.fitCamera();
    else if (code === 'Equal') this.zoomBy(1.15, GAME_W / 2, GAME_H / 2);
    else if (code === 'Minus') this.zoomBy(0.87, GAME_W / 2, GAME_H / 2);
    else if (code === 'Digit1') this.tapCard(0);
    else if (code === 'Digit2') this.tapCard(1);
    else if (code === 'Digit3') this.tapCard(2);
  };

  WBScene.prototype.handleTap = function (x, y) {
    if (!this.ready) return;
    if (this.mode !== 'battle') {
      for (var i = this.menuHits.length - 1; i >= 0; i--) {
        var h = this.menuHits[i];
        if (x >= h.x - h.w / 2 && x <= h.x + h.w / 2 && y >= h.y - h.h / 2 && y <= h.y + h.h / 2) {
          this.menuAction(h.action, h.arg);
          return;
        }
      }
      return;
    }
    // rail first, the board never steals a control tap
    if (this.hitButton(this.btnMenu, x, y)) { this.openSettings(); return; }
    if (this.hitButton(this.btnEnd, x, y)) { this.doEndTurn(); return; }
    if (this.hitButton(this.btnUndo, x, y)) { this.doUndo(); return; }
    if (this.hitButton(this.btnThreat, x, y)) {
      this.showThreat = !this.showThreat;
      this.decalDirty = true;
      kit.audio.sfx('select', { volume: 0.6 });
      return;
    }
    for (var c = 0; c < this.cardBtns.length; c++) {
      if (this.cardBtns[c].c.visible && this.hitButton(this.cardBtns[c], x, y)) { this.tapCard(c); return; }
    }
    if (this.aiQueue.length) { this.flushAI(); return; }
    var ax = this.screenToAxial(x, y);
    if (!E.tileAt(this.battle, ax.q, ax.r)) { this.clearSelection(); return; }
    this.cursor.q = ax.q; this.cursor.r = ax.r;
    this.confirmAt(ax.q, ax.r);
  };

  // ----------------------------------------------------------- commands
  WBScene.prototype.confirmAt = function (q, r) {
    var b = this.battle;
    if (!b || b.result || b.phase !== 'player') return;
    var key = E.key(q, r);
    var target = E.unitAt(b, q, r);

    if (this.cardMode) { this.playCardAt(q, r, target); return; }
    if (this.sel && target && target.side === 0 && this.healSet[key]) { this.doHeal(target); return; }
    if (this.sel && target && target.side === 1 && this.targetSet[key]) {
      if (this.preview && this.preview.def === target) this.commitAttack();
      else this.setPreview(target);
      return;
    }
    if (target && target.side === 0) { this.selectUnit(target); return; }
    if (this.sel && this.reachData && this.reachData.cells[key] !== undefined) { this.doMove(q, r); return; }
    this.clearSelection();
  };

  WBScene.prototype.selectUnit = function (u) {
    if (u.structure || u.side !== 0) return;
    this.sel = u;
    this.preview = null;
    this.cardMode = null;
    this.reachData = E.reach(this.battle, u);
    this.refreshTargets();
    this.decalDirty = true;
    this.proxy.state = 'command';
    this.proxy.t = 0.45;
    kit.audio.sfx('select', { volume: 0.75 });
    if (this.tutorialStep === 0) { this.tutorialStep = 1; this.coachSay('Tap a lit hex to march. Undo sits on the rail.', true); }
  };
  WBScene.prototype.clearSelection = function () {
    if (!this.sel && !this.preview && !this.cardMode) return;
    this.sel = null; this.preview = null; this.cardMode = null;
    this.reachData = null; this.targetSet = {}; this.healSet = {};
    this.decalDirty = true;
  };
  WBScene.prototype.refreshTargets = function () {
    this.targetSet = {}; this.healSet = {};
    if (!this.sel) return;
    var t = E.targetsFor(this.battle, this.sel), i;
    for (i = 0; i < t.length; i++) this.targetSet[E.key(t[i].q, t[i].r)] = t[i];
    var h = E.healTargets(this.battle, this.sel);
    for (i = 0; i < h.length; i++) this.healSet[E.key(h[i].q, h[i].r)] = h[i];
  };

  WBScene.prototype.doMove = function (q, r) {
    var b = this.battle, u = this.sel;
    if (!u || u.acted) return;
    var key = E.key(q, r);
    var left = this.reachData.cells[key];
    if (left === undefined) return;
    var path = E.pathTo(this.reachData, key);
    E.moveUnit(b, u, q, r, left, path.length - 1);
    var s = this.sprites[u.id];
    if (s) { s.state = 'move'; s.st = 0.3; }
    kit.audio.sfx('move', { volume: 0.7, rate: 0.95 + Math.random() * 0.1 });
    this.puff(q, r, 6);
    this.reachData = E.reach(b, u);
    this.refreshTargets();
    this.preview = null;
    this.decalDirty = true;
    this.proxy.state = 'command';
    this.proxy.t = 0.4;
    if (this.tutorialStep === 1) {
      this.tutorialStep = 2;
      this.coachSay('Tap a ringed foe to read the forecast, tap again to commit.', true);
    }
    this.checkEnd();
  };

  WBScene.prototype.doUndo = function () {
    var u = this.sel;
    if (!u || !u.pre) { kit.audio.sfx('cancel', { volume: 0.6 }); return; }
    E.undoMove(this.battle, u);
    var s = this.sprites[u.id];
    if (s) { s.state = 'move'; s.st = 0.25; }
    this.reachData = E.reach(this.battle, u);
    this.refreshTargets();
    this.preview = null;
    this.decalDirty = true;
    kit.audio.sfx('cancel', { volume: 0.8 });
    this.toast('Move undone', 'undo');
  };

  WBScene.prototype.setPreview = function (target) {
    if (!this.sel) return;
    this.preview = E.forecast(this.battle, this.sel, target);
    this.decalDirty = true;
    kit.audio.sfx('select', { volume: 0.5, rate: 1.2 });
  };

  WBScene.prototype.commitAttack = function () {
    var fc = this.preview;
    if (!fc) return;
    var b = this.battle;
    var atk = fc.atk, def = fc.def;
    var fresh = E.forecast(b, atk, def);
    var events = E.applyAttack(b, fresh);
    this.playAttackFx(atk, def, fresh, events);
    this.preview = null;
    this.sel = atk.alive ? atk : null;
    if (this.sel) { this.reachData = E.reach(b, this.sel); this.refreshTargets(); }
    else { this.reachData = null; this.targetSet = {}; this.healSet = {}; }
    this.decalDirty = true;
    if (this.tutorialStep === 2) {
      this.tutorialStep = 3;
      this.coachSay('A tactic card is once per battle. End Turn when your banners are spent.', true);
      profile.tutorial = true;
      kit.save.set(profile);
    }
    this.checkEnd();
  };

  WBScene.prototype.doHeal = function (target) {
    var res = E.applyHeal(this.battle, this.sel, target);
    kit.audio.sfx('heal', { volume: 0.85 });
    var p = this.worldPos(target.q, target.r);
    this.burst(p.x, p.y - 20, HEX_COL.green, 10, 'burst');
    this.dmgNumber(p.x, p.y - 40, '+' + res.healed, CSS.green);
    this.clearSelection();
    this.decalDirty = true;
  };

  WBScene.prototype.tapCard = function (idx) {
    var b = this.battle;
    if (!b || b.phase !== 'player' || b.result) return;
    var slot = b.cards[idx];
    if (!slot) return;
    if (slot.used || b.generalDown) { kit.audio.sfx('cancel', { volume: 0.7 }); return; }
    var card = E.cardOf(slot.id);
    if (card.target === 'none') {
      this.resolveCard(idx, null);
      return;
    }
    this.cardMode = { idx: idx, card: card };
    this.sel = null;
    this.reachData = null;
    this.targetSet = {}; this.healSet = {};
    this.decalDirty = true;
    this.toast(card.target === 'hex' ? 'Pick a hex' : 'Pick a target', card.icon);
  };
  WBScene.prototype.playCardAt = function (q, r, target) {
    var cm = this.cardMode;
    if (!cm) return;
    var arg = cm.card.target === 'hex' ? { q: q, r: r } : target;
    if (cm.card.target === 'enemy' && (!target || target.side !== 1)) {
      kit.audio.sfx('cancel', { volume: 0.6 });
      this.cardMode = null;
      this.decalDirty = true;
      return;
    }
    this.resolveCard(cm.idx, arg);
  };
  WBScene.prototype.resolveCard = function (idx, arg) {
    var b = this.battle;
    var res = E.playCard(b, idx, arg);
    this.cardMode = null;
    if (!res) { kit.audio.sfx('cancel', { volume: 0.7 }); this.decalDirty = true; return; }
    kit.audio.sfx('card', { volume: 0.9 });
    kit.juice.shake(5, 180);
    var i, p;
    for (i = 0; i < res.heals.length; i++) {
      p = this.worldPos(res.heals[i].u.q, res.heals[i].u.r);
      this.burst(p.x, p.y - 20, HEX_COL.green, 8, 'burst');
      if (res.heals[i].amount > 0) this.dmgNumber(p.x, p.y - 40, '+' + res.heals[i].amount, CSS.green);
    }
    for (i = 0; i < res.hits.length; i++) {
      var hit = res.hits[i];
      p = this.worldPos(hit.u.q, hit.u.r);
      if (hit.kill) { this.burst(p.x, p.y - 20, HEX_COL.coral, 12, 'debris'); kit.audio.sfx('kill', { volume: 0.8 }); }
      else if (hit.dmg > 0) {
        this.burst(p.x, p.y - 20, HEX_COL.amber, 8, 'spark');
        this.dmgNumber(p.x, p.y - 40, String(hit.dmg), CSS.coral);
        var s = this.sprites[hit.u.id];
        if (s) s.flash = 0.22;
      }
    }
    if (res.hex) {
      p = this.worldPos(res.hex.q, res.hex.r);
      this.ringFx(p.x, p.y, HEX_COL.amber, 1.4);
      this.burst(p.x, p.y, HEX_COL.amber, 18, 'debris');
      kit.juice.shake(8, 260);
    }
    this.toast(res.card.name, res.card.icon);
    if (this.sel) { this.reachData = E.reach(b, this.sel); this.refreshTargets(); }
    this.decalDirty = true;
    this.checkEnd();
  };

  // ---------------------------------------------------------- turn flow
  WBScene.prototype.doEndTurn = function () {
    var b = this.battle;
    if (!b || b.result) return;
    if (this.aiQueue.length) { this.flushAI(); return; }
    if (b.phase !== 'player') return;
    this.clearSelection();
    kit.audio.sfx('endturn', { volume: 0.85 });
    E.endTurn(b);
    this.decalDirty = true;
    this.snapshotGhosts();
    var acts = E.aiPlan(b);
    this.aiQueue = acts;
    this.aiTimer = 0.25;
    if (!acts.length) this.finishEnemyTurn();
    this.syncHook();
  };

  WBScene.prototype.snapshotGhosts = function () {
    var g = {};
    for (var i = 0; i < this.battle.units.length; i++) {
      var u = this.battle.units[i];
      g[u.id] = { q: u.q, r: u.r, alive: u.alive };
      var s = this.sprites[u.id];
      if (s) s.hold = { q: u.q, r: u.r };
    }
    this.aiGhost = g;
  };

  WBScene.prototype.stepAI = function (dt) {
    if (!this.aiQueue.length) return;
    this.aiTimer -= dt;
    if (this.aiTimer > 0) return;
    var act = this.aiQueue.shift();
    this.aiTimer = 0.3;
    if (act.kind === 'move') {
      var s = this.sprites[act.unit.id];
      if (s) { s.hold = null; s.state = 'move'; s.st = 0.3; }
      this.puff(act.q, act.r, 5);
      kit.audio.sfx('move', { volume: 0.5, rate: 0.9 + Math.random() * 0.15 });
      this.focusOn(act.q, act.r);
      this.aiTimer = 0.26;
    } else if (act.kind === 'attack') {
      var sa = this.sprites[act.unit.id];
      if (sa) sa.hold = null;
      this.playAttackFx(act.unit, act.target, act.fc, null);
      this.focusOn(act.target.q, act.target.r);
      this.aiTimer = 0.42;
    } else if (act.kind === 'heal') {
      var ph = this.worldPos(act.target.q, act.target.r);
      this.burst(ph.x, ph.y - 20, HEX_COL.green, 8, 'burst');
      kit.audio.sfx('heal', { volume: 0.6 });
    } else if (act.kind === 'card') {
      this.toast('Rival rally', 'rally');
      kit.audio.sfx('card', { volume: 0.7 });
    }
    this.decalDirty = true;
    if (!this.aiQueue.length) this.finishEnemyTurn();
  };
  WBScene.prototype.flushAI = function () {
    while (this.aiQueue.length) {
      var act = this.aiQueue.shift();
      var s = this.sprites[act.unit && act.unit.id];
      if (s) s.hold = null;
    }
    this.finishEnemyTurn();
  };
  WBScene.prototype.finishEnemyTurn = function () {
    var b = this.battle;
    this.aiGhost = null;
    for (var id in this.sprites) this.sprites[id].hold = null;
    if (!b || b.result) { this.checkEnd(); return; }
    if (b.phase !== 'enemy') return;
    var res = E.endTurn(b);
    this.decalDirty = true;
    if (res === 'player') {
      if (b.turn === b.turnLimit) { this.toast('Last turn', 'warn'); kit.audio.sfx('warn', { volume: 0.8 }); }
      else if (b.turn === b.turnLimit - 2) this.toast('Two turns left', 'warn');
    }
    this.checkEnd();
    this.syncHook();
  };

  WBScene.prototype.focusOn = function (q, r) {
    var p = this.worldPos(q, r);
    var sx = p.x * this.view.zoom + this.view.x;
    var sy = p.y * this.view.zoom + this.view.y;
    var m = 150;
    if (sx < m) this.view.x += (m - sx);
    if (sx > GAME_W - m) this.view.x -= (sx - (GAME_W - m));
    if (sy < m) this.view.y += (m - sy);
    if (sy > GAME_H - m - 60) this.view.y -= (sy - (GAME_H - m - 60));
    this.applyView();
  };

  WBScene.prototype.checkEnd = function () {
    var b = this.battle;
    if (!b || !b.result || this.mode === 'result') return;
    this.finishBattle();
  };

  WBScene.prototype.finishBattle = function () {
    var b = this.battle;
    var win = b.result === 'win';
    var rate = E.rateBattle(b);
    this.resultNote = '';
    if (b.mode === 'campaign' && win) {
      if (profile.cleared.indexOf(b.def.id) < 0) {
        profile.cleared.push(b.def.id);
        profile.cleared.sort(function (x, y) { return x - y; });
        profile.wins = profile.cleared.length;
        var newGen = null, i;
        for (i = 0; i < E.GENERALS.length; i++) {
          if (E.GENERALS[i].unlock === profile.wins) newGen = E.GENERALS[i];
        }
        var newCard = null;
        for (i = 0; i < E.CARD_ORDER.length; i++) {
          var cd = E.cardOf(E.CARD_ORDER[i]);
          if (cd.unlock === profile.wins) newCard = cd;
        }
        if (newGen) this.resultNote = 'General unlocked: ' + newGen.name;
        else if (newCard) this.resultNote = 'Tactic card unlocked: ' + newCard.name;
      }
      profile.best = Math.max(profile.best, rate.score);
      kit.save.set(profile);
    } else if (b.mode === 'skirmish' && win) {
      profile.skirmish = Math.max(profile.skirmish, rate.score);
      kit.save.set(profile);
    }
    kit.audio.sfx(win ? 'victory' : 'defeat', { volume: 1 });
    if (win) {
      var g = E.generalOfSide(b, 0);
      if (g) {
        var p = this.worldPos(g.q, g.r);
        this.burst(p.x, p.y - 30, HEX_COL.amber, 26, 'burst');
        this.ringFx(p.x, p.y, HEX_COL.amber, 2.2);
      }
      this.proxy.state = 'victory';
      this.proxy.t = 3;
    }
    kit.juice.shake(win ? 6 : 10, 320);
    this.bannerShow(win ? 'THE FIELD IS YOURS' : 'THE BANNERS FALL',
                    win ? b.def.name : (b.lossReason || 'The army is broken.'));
    this.setMode('result');
  };

  WBScene.prototype.restartTitle = function () {
    this.battle = null;
    this.releaseAllSprites();
    this.setMode('title');
  };

  // ==================================================== particles and fx
  /* Six pooled systems share one array and one update pass: contact sparks,
   * ground dust, debris, command trails, reward bursts and the weather bed. */
  var SYS_CAP = { spark: 26, dust: 22, debris: 26, trail: 20, burst: 26, weather: 26 };
  WBScene.prototype.emit = function (sys, x, y, opt) {
    if (this.systems[sys] >= SYS_CAP[sys]) return null;
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      if (p.a) continue;
      p.a = true; p.sys = sys;
      this.systems[sys]++;
      p.x = x; p.y = y;
      p.vx = opt.vx || 0; p.vy = opt.vy || 0;
      p.life = 0; p.max = opt.max || 0.5;
      p.size = opt.size || 1; p.dsize = opt.dsize == null ? -0.9 : opt.dsize;
      p.rot = opt.rot || 0; p.vr = opt.vr || 0;
      p.grav = opt.grav || 0; p.drag = opt.drag == null ? 0.96 : opt.drag;
      p.alpha = opt.alpha == null ? 1 : opt.alpha;
      if (p.img.texture.key !== (opt.tex || 'p-dot')) p.img.setTexture(opt.tex || 'p-dot');
      p.img.setTint(opt.tint == null ? 0xffffff : opt.tint);
      p.img.setBlendMode(opt.blend === false ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.ADD);
      p.img.setVisible(true);
      return p;
    }
    return null;
  };
  WBScene.prototype.burst = function (x, y, tint, n, sys) {
    if (!kit.juice.enabled) n = Math.ceil(n * 0.5);
    var kinds = {
      spark: { tex: 'p-spark', max: 0.36, size: 1.1, grav: 300, spd: 190 },
      debris: { tex: 'p-shard', max: 0.62, size: 1.2, grav: 520, spd: 210 },
      burst: { tex: 'p-dot', max: 0.55, size: 1.3, grav: -30, spd: 130 },
      dust: { tex: 'p-dot', max: 0.7, size: 1.5, grav: -18, spd: 60 }
    };
    var k = kinds[sys] || kinds.spark;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, sp = k.spd * (0.4 + Math.random() * 0.8);
      this.emit(sys, x, y, {
        tex: k.tex, tint: tint, max: k.max * (0.7 + Math.random() * 0.6),
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, grav: k.grav,
        size: k.size * (0.6 + Math.random() * 0.7), vr: (Math.random() - 0.5) * 12,
        rot: Math.random() * 6.28
      });
    }
  };
  WBScene.prototype.puff = function (q, r, n) {
    var p = this.worldPos(q, r);
    for (var i = 0; i < n; i++) {
      this.emit('dust', p.x + (Math.random() - 0.5) * 26, p.y + 6, {
        tex: 'p-dot', tint: 0xd8c38c, max: 0.5 + Math.random() * 0.3,
        vx: (Math.random() - 0.5) * 40, vy: -20 - Math.random() * 30,
        size: 0.7 + Math.random() * 0.6, alpha: 0.5, grav: 20
      });
    }
  };
  WBScene.prototype.trailTo = function (x0, y0, x1, y1, tint) {
    var n = 7;
    for (var i = 0; i < n; i++) {
      var f = i / n;
      this.emit('trail', x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, {
        tex: 'p-streak', tint: tint, max: 0.22 + f * 0.1, size: 1, dsize: -1.4,
        rot: Math.atan2(y1 - y0, x1 - x0), drag: 0.9
      });
    }
  };
  WBScene.prototype.ringFx = function (x, y, tint, scale) {
    if (!kit.juice.enabled) return;
    for (var i = 0; i < this.fx.length; i++) {
      var f = this.fx[i];
      if (f.a) continue;
      f.a = true; f.life = 0; f.max = 0.45;
      f.s0 = 0.15; f.s1 = (scale || 1) * 0.9; f.a0 = 0.85; f.rot = 0; f.vr = 0;
      if (f.img.texture.key !== 'p-ring') f.img.setTexture('p-ring');
      f.img.setPosition(x, y).setTint(tint).setBlendMode(Phaser.BlendModes.ADD).setVisible(true);
      return;
    }
  };
  WBScene.prototype.slashFx = function (x, y, tint, angle) {
    for (var i = 0; i < this.fx.length; i++) {
      var f = this.fx[i];
      if (f.a) continue;
      f.a = true; f.life = 0; f.max = 0.3;
      f.s0 = 0.9; f.s1 = 1.75; f.a0 = 1; f.rot = angle; f.vr = 0;
      if (f.img.texture.key !== 'p-slash') f.img.setTexture('p-slash');
      f.img.setPosition(x, y).setTint(tint).setRotation(angle).setBlendMode(Phaser.BlendModes.ADD).setVisible(true);
      return;
    }
  };
  WBScene.prototype.dmgNumber = function (x, y, str, color) {
    for (var i = 0; i < this.dmgPool.length; i++) {
      var d = this.dmgPool[i];
      if (d.a) continue;
      d.a = true; d.life = 0; d.max = 0.85; d.x = x; d.y = y; d.vy = -54;
      setTextIfChanged(d.t, str);
      setColorIfChanged(d.t, color || CSS.text);
      d.t.setPosition(x, y).setAlpha(1).setScale(1).setVisible(true);
      return;
    }
  };

  WBScene.prototype.spawnWeather = function (reset) {
    if (reset) {
      for (var i = 0; i < this.particles.length; i++) {
        if (this.particles[i].a && this.particles[i].sys === 'weather') {
          this.particles[i].a = false;
          this.particles[i].img.setVisible(false);
          this.systems.weather--;
        }
      }
    }
  };
  WBScene.prototype.weatherTick = function (dt) {
    if (!this.battle || this.mode !== 'battle') return;
    var w = this.battle.weather.id;
    this.weatherClock -= dt;
    if (this.weatherClock > 0) return;
    var bi = this.boardInfo;
    var rate = w === 'rain' ? 0.05 : w === 'snow' ? 0.08 : w === 'wind' ? 0.16 : 0.5;
    this.weatherClock = rate;
    var x = Math.random() * bi.w, y = -20;
    if (w === 'rain') {
      this.emit('weather', x, y, { tex: 'p-streak', tint: 0x9fc4dd, max: 1.2, size: 1.1,
        dsize: 0, vx: -40, vy: 620, rot: 1.63, drag: 1, alpha: 0.5, blend: false });
    } else if (w === 'snow') {
      this.emit('weather', x, y, { tex: 'p-flake', tint: 0xe8f3fb, max: 3.4, size: 0.9,
        dsize: 0, vx: -18 + Math.random() * 36, vy: 60 + Math.random() * 30, drag: 1, alpha: 0.75, blend: false });
    } else if (w === 'wind') {
      this.emit('weather', x, Math.random() * bi.h, { tex: 'p-streak', tint: 0xd8c38c, max: 1.1, size: 1.3,
        dsize: 0, vx: 260, vy: 12, drag: 1, alpha: 0.3, blend: false });
    } else {
      this.emit('weather', x, Math.random() * bi.h * 0.6, { tex: 'p-flake', tint: 0x9ac47a, max: 3.2, size: 0.7,
        dsize: 0, vx: 40 + Math.random() * 20, vy: 26, drag: 1, alpha: 0.4, blend: false });
    }
  };

  WBScene.prototype.playAttackFx = function (atk, def, fc, events) {
    var pa = this.worldPos(atk.q, atk.r), pd = this.worldPos(def.q, def.r);
    var sa = this.sprites[atk.id];
    var ang = Math.atan2(pd.y - pa.y, pd.x - pa.x);
    if (sa) { sa.state = 'attack'; sa.st = 0.38; sa.lean = Math.cos(ang) > 0 ? 1 : -1; }
    var ranged = E.dist(atk.q, atk.r, def.q, def.r) > 1;
    if (ranged) {
      this.trailTo(pa.x, pa.y - 28, pd.x, pd.y - 28, atk.side === 0 ? HEX_COL.pale : 0xffd0c9);
      kit.audio.sfx('arrow', { volume: 0.7, rate: 0.95 + Math.random() * 0.12 });
    } else {
      kit.audio.sfx('attack', { volume: 0.8, rate: 0.95 + Math.random() * 0.12 });
    }
    this.slashFx(pd.x, pd.y - 26, atk.side === 0 ? HEX_COL.pale : HEX_COL.coral, ang);
    this.ringFx(pd.x, pd.y - 18, atk.side === 0 ? HEX_COL.cyan : HEX_COL.coral, 0.75);
    this.burst(pd.x, pd.y - 26, atk.side === 0 ? HEX_COL.cyan : HEX_COL.coral, 8, 'spark');
    this.burst(pd.x, pd.y + 2, 0xd8c38c, 4, 'dust');
    this.dmgNumber(pd.x, pd.y - 52, String(fc.dmg), def.side === 0 ? CSS.coral : CSS.amber);
    var sd = this.sprites[def.id];
    if (sd) sd.flash = 0.24;
    kit.audio.sfx('hit', { volume: 0.75, rate: 0.92 + Math.random() * 0.16 });
    kit.juice.hitStop(52);
    kit.juice.shake(4, 150);

    if (!def.alive) {
      this.burst(pd.x, pd.y - 26, def.structure ? 0xd8c38c : HEX_COL.wine, def.structure ? 18 : 11, 'debris');
      this.ringFx(pd.x, pd.y, def.structure ? HEX_COL.amber : HEX_COL.coral, def.structure ? 1.9 : 1.2);
      kit.audio.sfx('kill', { volume: 0.9 });
      kit.juice.hitStop(def.structure ? 110 : 66);
      kit.juice.shake(def.structure ? 10 : 6, def.structure ? 300 : 200);
      if (def.structure) this.toast('Gate broken', 'siege');
      if (def.cls === 'general' && def.side === 1) this.toast('Rival command broken', 'warcry');
      if (def.cls === 'general' && def.side === 0) this.toast('Your general has fallen', 'warn');
    } else if (fc.canRetal && fc.retal > 0 && !atk.alive) {
      this.burst(pa.x, pa.y - 26, HEX_COL.wine, 11, 'debris');
      kit.audio.sfx('kill', { volume: 0.85 });
    } else if (fc.canRetal && fc.retal > 0) {
      this.dmgNumber(pa.x, pa.y - 52, String(fc.retal), atk.side === 0 ? CSS.coral : CSS.amber);
      this.burst(pa.x, pa.y - 26, HEX_COL.amber, 4, 'spark');
      if (sa) sa.flash = 0.2;
    }
    if (events) {
      for (var i = 0; i < events.length; i++) if (events[i].t === 'morale') this.toast('Enemy morale broken', 'warcry');
    }
  };

  // -------------------------------------------------------- transients
  WBScene.prototype.toast = function (text, icon) {
    this.toastQueue.push({ text: text, icon: icon || 'star' });
    if (this.toastQueue.length > 3) this.toastQueue.splice(0, this.toastQueue.length - 3);
  };
  WBScene.prototype.bannerShow = function (title, sub) {
    this.banner = { title: title, sub: sub || '', t: 0, max: kit.juice.enabled ? 2.1 : 1.5 };
  };
  WBScene.prototype.coachSay = function (text, force) {
    if (this.tutorialStep >= 99 && !force) return;
    this.coach.text = text;
    this.coach.t = 3.6;
  };

  // ============================================================== update
  WBScene.prototype.update = function (time, delta) {
    var frame = clamp(delta / 1000, 0, 0.2);
    this.pollInput();
    var jf = kit.juice.frame();
    this.shakeX = jf.dx;
    this.shakeY = jf.dy;
    this.accumulator += frame;
    var steps = 0;
    if (jf.frozen) {
      // cosmetic freeze: hold the accumulator so no clock runs past the sim
      if (this.accumulator > STEP) this.accumulator = STEP;
    } else {
      while (this.accumulator >= STEP && steps < MAX_STEPS) {
        this.advance(STEP);
        this.accumulator -= STEP;
        steps++;
      }
      if (steps === MAX_STEPS && this.accumulator >= STEP) this.accumulator = STEP * 0.9;
    }
    this.renderFrame();
  };

  WBScene.prototype.advance = function (dt) {
    this.clock += dt;
    if (this.mode === 'battle') {
      this.stepAI(dt);
      this.weatherTick(dt);
    }
    var i;
    // particles
    for (i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      if (!p.a) continue;
      p.life += dt;
      if (p.life >= p.max) {
        p.a = false;
        this.systems[p.sys]--;
        p.img.setVisible(false);
        continue;
      }
      p.vy += p.grav * dt;
      p.vx *= p.drag; p.vy *= p.drag;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    // fx
    for (i = 0; i < this.fx.length; i++) {
      var f = this.fx[i];
      if (!f.a) continue;
      f.life += dt;
      if (f.life >= f.max) { f.a = false; f.img.setVisible(false); }
    }
    for (i = 0; i < this.dmgPool.length; i++) {
      var d = this.dmgPool[i];
      if (!d.a) continue;
      d.life += dt;
      d.y += d.vy * dt;
      d.vy += 40 * dt;
      if (d.life >= d.max) { d.a = false; d.t.setVisible(false); }
    }
    // sprites
    for (var id in this.sprites) {
      var s = this.sprites[id];
      s.st -= dt;
      if (s.st <= 0 && s.state !== 'idle') { s.state = 'idle'; s.st = 0; }
      if (s.flash > 0) s.flash -= dt;
      if (s.dead) s.dying += dt;
      s.phase += dt;
    }
    // proxy
    this.proxy.t -= dt;
    if (this.proxy.t <= 0 && this.proxy.state !== 'idle') { this.proxy.state = 'idle'; this.proxy.t = 0; }
    // transients
    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.t >= this.banner.max) this.banner = null;
    }
    if (this.toast) {
      this.toast.t -= dt;
      if (this.toast.t <= 0) this.toast = null;
    } else if (this.toastQueue.length && !this.banner) {
      var n = this.toastQueue.shift();
      this.toast = { text: n.text, icon: n.icon, t: 1.15, max: 1.15 };
    }
    if (this.coach.t > 0) this.coach.t -= dt;
    this.hookClock = (this.hookClock || 0) + dt;
    if (this.hookClock >= 0.1) { this.hookClock = 0; this.syncHook(); }
  };

  // ============================================================== render
  WBScene.prototype.renderFrame = function () {
    if (this.mode === 'battle' || this.mode === 'result') {
      this.world.setPosition(this.view.x + this.shakeX, this.view.y + this.shakeY);
      if (this.decalDirty) { this.rebuildDecals(); this.decalDirty = false; }
      this.renderUnits();
      this.renderParticles();
    }
    this.renderProxy();
    if (this.dirty) { this.rebuildMenu(); this.dirty = false; }
    this.renderTransients();
    if (this.mode === 'battle') this.renderHud();
  };

  WBScene.prototype.rebuildDecals = function () {
    var b = this.battle, i;
    var ri = 0, ki = 0, zi = 0, ti = 0, pi = 0;
    var self = this;
    function reachCell(q, r, tint, alpha) {
      if (ri >= self.reachPool.length) return;
      var im = self.reachPool[ri++];
      var p = self.worldPos(q, r);
      im.setPosition(p.x, p.y).setTint(tint).setAlpha(alpha).setVisible(true);
    }
    function ringCell(q, r, tint, alpha, tex) {
      if (ki >= self.ringPool.length) return;
      var im = self.ringPool[ki++];
      var p = self.worldPos(q, r);
      if (im.texture.key !== (tex || 'hex-ring')) im.setTexture(tex || 'hex-ring');
      im.setPosition(p.x, p.y).setTint(tint).setAlpha(alpha).setVisible(true);
    }
    function zoneCell(q, r, tint, alpha) {
      if (zi >= self.zonePool.length) return;
      var im = self.zonePool[zi++];
      var p = self.worldPos(q, r);
      im.setPosition(p.x, p.y).setTint(tint).setAlpha(alpha).setVisible(true);
    }
    if (b) {
      // objective ground is always legible, it is the reason the battle exists
      var kind = b.objective.kind;
      if (kind === 'hold') {
        var z = E.zoneTiles(b);
        for (i = 0; i < z.length; i++) zoneCell(z[i].q, z[i].r, HEX_COL.amber, 0.85);
      } else if (kind === 'escort') {
        var ex = E.exitTiles(b);
        for (i = 0; i < ex.length && i < 20; i++) zoneCell(ex[i].q, ex[i].r, HEX_COL.amber, 0.8);
      } else if (kind === 'siege') {
        var kt = E.keepTiles(b);
        for (i = 0; i < kt.length; i++) zoneCell(kt[i].q, kt[i].r, HEX_COL.amber, 0.7);
      }
      // burning ground from a fire attack
      for (i = 0; i < b.tiles.length; i++) {
        if (b.tiles[i].burn > 0) zoneCell(b.tiles[i].q, b.tiles[i].r, 0xff8a3c, 0.85);
      }
      if (this.showThreat) {
        var threat = {};
        var foes = E.side(b, 1);
        for (i = 0; i < foes.length; i++) {
          var f = foes[i];
          if (f.convoy) continue;
          var rg = E.rangeOf(b, f);
          var span = rg.max + (f.structure ? 0 : E.movePoints(b, f));
          for (var t2 = 0; t2 < b.tiles.length; t2++) {
            var tl = b.tiles[t2];
            if (!E.terrOf(tl.terr).pass) continue;
            if (E.dist(f.q, f.r, tl.q, tl.r) <= span) threat[E.key(tl.q, tl.r)] = 1;
          }
        }
        for (var tk in threat) {
          if (ti >= this.threatPool.length) break;
          var parts = tk.split(',');
          var im2 = this.threatPool[ti++];
          var pp = this.worldPos(parseInt(parts[0], 10), parseInt(parts[1], 10));
          im2.setPosition(pp.x, pp.y).setVisible(true);
        }
      }
      if (this.sel && this.reachData) {
        for (var k in this.reachData.cells) {
          var pr = k.split(',');
          reachCell(parseInt(pr[0], 10), parseInt(pr[1], 10), HEX_COL.cyan, 0.32);
        }
        var sp = this.worldPos(this.sel.q, this.sel.r);
        this.selKey.setPosition(sp.x, sp.y).setVisible(true);
        for (var tkey in this.targetSet) {
          var tp = tkey.split(',');
          ringCell(parseInt(tp[0], 10), parseInt(tp[1], 10), HEX_COL.coral, 0.95);
        }
        for (var hkey in this.healSet) {
          var hp = hkey.split(',');
          ringCell(parseInt(hp[0], 10), parseInt(hp[1], 10), HEX_COL.green, 0.9);
        }
        // march preview to the cursor
        var ck = E.key(this.cursor.q, this.cursor.r);
        if (this.reachData.cells[ck] !== undefined) {
          var path = E.pathTo(this.reachData, ck);
          for (i = 1; i < path.length && pi < this.pathPool.length; i++) {
            var pcs = path[i].split(',');
            var ppp = this.worldPos(parseInt(pcs[0], 10), parseInt(pcs[1], 10));
            var dot = this.pathPool[pi++];
            dot.setPosition(ppp.x, ppp.y + 4).setVisible(true);
          }
        }
      } else {
        this.selKey.setVisible(false);
      }
      if (this.cardMode) {
        var col = this.cardMode.card.target === 'hex' ? HEX_COL.amber : HEX_COL.coral;
        if (this.cardMode.card.target === 'enemy') {
          var fl = E.side(b, 1);
          for (i = 0; i < fl.length; i++) ringCell(fl[i].q, fl[i].r, col, 0.95);
        }
      }
      if (E.tileAt(b, this.cursor.q, this.cursor.r)) {
        var cp = this.worldPos(this.cursor.q, this.cursor.r);
        this.cursorRing.setPosition(cp.x, cp.y).setTint(HEX_COL.bone).setVisible(true);
      } else this.cursorRing.setVisible(false);
    } else {
      this.selKey.setVisible(false);
      this.cursorRing.setVisible(false);
    }
    for (i = ri; i < this.reachPool.length; i++) setVis(this.reachPool[i], false);
    for (i = ki; i < this.ringPool.length; i++) setVis(this.ringPool[i], false);
    for (i = zi; i < this.zonePool.length; i++) setVis(this.zonePool[i], false);
    for (i = ti; i < this.threatPool.length; i++) setVis(this.threatPool[i], false);
    for (i = pi; i < this.pathPool.length; i++) setVis(this.pathPool[i], false);
  };

  WBScene.prototype.renderUnits = function () {
    var b = this.battle;
    if (!b) return;
    var i, id;
    for (i = 0; i < b.units.length; i++) {
      var u = b.units[i];
      var s = this.sprites[u.id];
      if (!u.alive) {
        if (s && !s.dead) { s.dead = true; s.dying = 0; }
        if (s && this.aiGhost && this.aiGhost[u.id] && this.aiGhost[u.id].alive && this.aiQueue.length) {
          // hold the corpse until its own event plays back
          s.dead = false;
        }
        if (!s) continue;
      } else if (!s) {
        s = this.spriteFor(u);
        if (!s) continue;
      }
      var srcQ = u.q, srcR = u.r;
      if (s.hold) { srcQ = s.hold.q; srcR = s.hold.r; }
      var p = this.worldPos(srcQ, srcR);
      s.tx = p.x; s.ty = p.y;
      var k = s.state === 'move' ? 0.32 : 0.22;
      s.x += (s.tx - s.x) * k;
      s.y += (s.ty - s.y) * k;

      var bob = Math.sin(this.clock * 2.4 + s.phase) * 1.6;
      var lunge = 0, squash = 1;
      if (s.state === 'attack') {
        var f = clamp(1 - s.st / 0.38, 0, 1);
        // anticipation, contact, follow through
        lunge = f < 0.35 ? -f * 18 : (f < 0.6 ? (f - 0.35) * 90 : (1 - f) * 34);
        squash = f < 0.35 ? 1 - f * 0.12 : 1 + (1 - Math.abs(f - 0.5) * 2) * 0.08;
        lunge *= s.lean || 1;
      }
      if (s.state === 'move') {
        bob += Math.sin(this.clock * 22) * 2.2;
      }
      if (Math.abs(s.c.y - (s.y + bob)) > 0.75) this.sortDirty = true;
      s.c.setPosition(s.x + lunge, s.y + bob);
      s.c.setScale(1, squash);
      var alpha = 1;
      if (s.dead) {
        alpha = clamp(1 - s.dying / 0.55, 0, 1);
        s.c.setScale(1 - s.dying * 0.3, squash * (1 - s.dying * 0.5));
        s.c.y += s.dying * 26;
      }
      if (u.alive && u.acted && b.phase === 'player' && u.side === 0) alpha *= 0.72;
      s.c.setAlpha(alpha);

      var tint = 0xffffff;
      if (s.flash > 0) tint = 0xffffff;
      s.body.setTintFill ? null : null;
      if (s.flash > 0) s.body.setTint(0xffd8d0); else s.body.setTint(0xffffff);
      if (!u.supplied && u.alive && !u.structure) s.body.setTint(0x9fb0bf);

      // health only when it matters, per the bible
      var hurt = u.hp < u.maxHp;
      var showBar = hurt || this.sel === u;
      setVis(s.barBg, showBar);
      setVis(s.barFg, showBar);
      if (showBar) {
        var frac = clamp(u.hp / u.maxHp, 0, 1);
        s.barFg.setDisplaySize(38 * frac, 6);
        s.barFg.setTint(u.side === 0 ? (frac < 0.35 ? HEX_COL.amber : HEX_COL.cyan)
                                     : (frac < 0.35 ? HEX_COL.amber : HEX_COL.coral));
        s.barBg.y = 8; s.barFg.y = 8;
      }
      var iconKey = null;
      if (u.alive && !u.supplied && !u.structure) iconKey = 'ic-supply';
      else if (u.alive && u.cls === 'general') iconKey = null;
      if (iconKey) {
        if (s.icon.texture.key !== iconKey) s.icon.setTexture(iconKey);
        s.icon.setTint(HEX_COL.amber);
        setVis(s.icon, true);
      } else setVis(s.icon, false);

      if (s.dead && s.dying > 0.6) {
        setVis(s.c, false);
        s.id = 0;
        delete this.sprites[u.id];
      }
    }
    // depth sort only when a banner actually changed row, not every frame
    if (this.sortDirty) {
      this.layerUnits.list.sort(function (a2, b2) { return a2.y - b2.y; });
      this.sortDirty = false;
    }
  };

  WBScene.prototype.renderProxy = function () {
    var b = this.battle;
    if (!b || this.mode !== 'battle') {
      if (this.mode === 'title') {
        this.proxy.c.setVisible(true);
        this.proxy.c.setPosition(186, 600 + Math.sin(this.clock * 1.4) * 4);
        this.proxy.c.setScale(2.1);
        this.proxy.cloth.setTint(HEX_COL.cyan);
        this.proxy.cloth.setRotation(Math.sin(this.clock * 1.6) * 0.09);
        this.proxy.glow.setAlpha(0.18 + Math.sin(this.clock * 2) * 0.07);
      } else setVis(this.proxy.c, false);
      return;
    }
    var anchor = this.sel || E.generalOfSide(b, 0);
    if (!anchor) { setVis(this.proxy.c, false); return; }
    var p = this.worldPos(anchor.q, anchor.r);
    // world to screen: the proxy is drawn in screen space above the board
    this.proxy.tx = (p.x - 34) * this.view.zoom + this.view.x + this.shakeX;
    this.proxy.ty = (p.y - 6) * this.view.zoom + this.view.y + this.shakeY;
    this.proxy.x += (this.proxy.tx - this.proxy.x) * 0.18;
    this.proxy.y += (this.proxy.ty - this.proxy.y) * 0.18;
    var lift = 0, sway = Math.sin(this.clock * 1.8) * 0.07;
    if (this.proxy.state === 'command') { lift = -8; sway = Math.sin(this.clock * 12) * 0.16; }
    else if (this.proxy.state === 'victory') { lift = -14 + Math.sin(this.clock * 6) * 4; sway = Math.sin(this.clock * 8) * 0.22; }
    this.proxy.c.setVisible(true);
    this.proxy.c.setPosition(this.proxy.x, this.proxy.y + lift);
    this.proxy.c.setScale(0.8 * this.view.zoom);
    this.proxy.cloth.setRotation(sway);
    this.proxy.cloth.setTint(b.generalDown ? HEX_COL.slate : HEX_COL.cyan);
    this.proxy.glow.setAlpha(this.proxy.state === 'idle' ? 0.16 : 0.34);
  };

  WBScene.prototype.renderParticles = function () {
    var i;
    for (i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      if (!p.a) continue;
      var f = p.life / p.max;
      p.img.setPosition(p.x, p.y);
      p.img.setScale(p.size * (1 + p.dsize * f));
      p.img.setAlpha(p.alpha * (1 - f * f));
      p.img.setRotation(p.rot);
    }
    for (i = 0; i < this.fx.length; i++) {
      var fx = this.fx[i];
      if (!fx.a) continue;
      var t = fx.life / fx.max;
      fx.img.setScale(fx.s0 + (fx.s1 - fx.s0) * t);
      fx.img.setAlpha(fx.a0 * (1 - t));
    }
    for (i = 0; i < this.dmgPool.length; i++) {
      var d = this.dmgPool[i];
      if (!d.a) continue;
      var td = d.life / d.max;
      d.t.setPosition(d.x, d.y);
      d.t.setAlpha(1 - td * td);
      d.t.setScale(1 + (1 - Math.min(1, td * 4)) * 0.35);
    }
  };

  WBScene.prototype.renderTransients = function () {
    // one transient at a time: the banner outranks the toast, the toast the coach
    var showBanner = !!this.banner;
    setVis(this.bannerC, showBanner);
    if (showBanner) {
      var f = this.banner.t / this.banner.max;
      var s = f < 0.22 ? 0.86 + (f / 0.22) * 0.2 : (f < 0.32 ? 1.06 - (f - 0.22) / 0.1 * 0.06 : 1);
      setTextIfChanged(this.bannerTitle, this.banner.title);
      setTextIfChanged(this.bannerSub, this.banner.sub);
      this.bannerC.setScale(s);
      this.bannerC.setAlpha(f > 0.82 ? (1 - f) / 0.18 : 1);
    }
    var showToast = !showBanner && !!this.toast;
    setVis(this.toastC, showToast);
    if (showToast) {
      setTextIfChanged(this.toastText, this.toast.text);
      var ik = A.iconKey(this.toast.icon);
      if (this.toastIcon.texture.key !== ik) this.toastIcon.setTexture(ik);
      var tf = this.toast.t / this.toast.max;
      this.toastC.setAlpha(tf < 0.25 ? tf / 0.25 : 1);
    }
    var showCoach = !showBanner && !showToast && this.coach.t > 0 && this.mode === 'battle';
    setVis(this.coachC, showCoach);
    if (showCoach) {
      setTextIfChanged(this.coachText, this.coach.text);
      this.coachC.setAlpha(clamp(this.coach.t / 1.2, 0.08, 1));
    }
  };

  WBScene.prototype.renderHud = function () {
    var b = this.battle;
    if (!b) return;
    var wk = A.iconKey(b.weather.icon);
    if (this.turnChip.icon.texture.key !== wk) this.turnChip.icon.setTexture(wk);
    setTextIfChanged(this.turnChip.text, 'Turn ' + Math.min(b.turn, b.turnLimit) + '/' + b.turnLimit);
    setColorIfChanged(this.turnChip.text, b.turn >= b.turnLimit - 1 ? CSS.amber : CSS.text);

    var prog = E.objectiveProgress(b);
    var ok = A.iconKey(OBJ_ICON[b.objective.kind]);
    if (this.objChip.icon.texture.key !== ok) this.objChip.icon.setTexture(ok);
    var label;
    if (b.objective.kind === 'escort') label = 'Carts ' + (prog.hexes === 99 ? '-' : prog.hexes + ' hexes');
    else label = prog.label + ' ' + prog.have + '/' + prog.need;
    setTextIfChanged(this.objChip.text, label);

    var sel = this.sel;
    setVis(this.selPanel, !!sel);
    if (sel) {
      var bk = 'u-' + sel.cls + '-0';
      if (this.selIcon.texture.key !== bk) this.selIcon.setTexture(bk);
      setTextIfChanged(this.selName, E.unitOf(sel.cls).name + (sel.acted ? ' - spent' : ''));
      var frac = clamp(sel.hp / sel.maxHp, 0, 1);
      this.selHpFg.setDisplaySize(190 * frac, 12);
      this.selHpFg.setTint(frac < 0.35 ? HEX_COL.amber : HEX_COL.cyan);
      setTextIfChanged(this.selHpText, sel.hp + '/' + sel.maxHp + '   move ' + sel.mp +
        (sel.supplied ? '' : '   cut off'));
    }

    var i, hand = b.cards;
    for (i = 0; i < this.cardBtns.length; i++) {
      var cb = this.cardBtns[i];
      var slot = hand[i];
      setVis(cb.c, !!slot);
      if (!slot) continue;
      var card = E.cardOf(slot.id);
      var spent = slot.used || b.generalDown;
      if (cb.bg.texture.key !== (spent ? 'card-spent' : 'card')) cb.bg.setTexture(spent ? 'card-spent' : 'card');
      cb.bg.setDisplaySize(118, 96);
      var ck = A.iconKey(card.icon);
      if (cb.icon.texture.key !== ck) cb.icon.setTexture(ck);
      cb.icon.setTint(spent ? HEX_COL.slate : (this.cardMode && this.cardMode.idx === i ? HEX_COL.amber : 0xbfeeff));
      setTextIfChanged(cb.text, card.name);
      setColorIfChanged(cb.text, spent ? CSS.muted : CSS.text);
    }

    var fc = this.preview;
    setVis(this.fcPanel, !!fc);
    if (fc) {
      setTextIfChanged(this.fcDmg, String(fc.dmg));
      setColorIfChanged(this.fcDmg, fc.kill ? CSS.amber : CSS.coral);
      setTextIfChanged(this.fcSub, fc.kill ? 'breaks the banner' : 'of ' + fc.def.hp + ' health' +
        (fc.retal ? '   answer ' + fc.retal : ''));
      for (i = 0; i < this.fcParts.length; i++) {
        var part = fc.parts[i];
        setVis(this.fcParts[i].c, !!part);
        if (!part) continue;
        var pk = A.iconKey(part.icon);
        if (this.fcParts[i].icon.texture.key !== pk) this.fcParts[i].icon.setTexture(pk);
        this.fcParts[i].icon.setTint(part.mul > 1 ? HEX_COL.green : HEX_COL.coral);
        setTextIfChanged(this.fcParts[i].text, fmtMul(part.mul));
        setColorIfChanged(this.fcParts[i].text, part.mul > 1 ? CSS.green : CSS.coral);
      }
      setTextIfChanged(this.fcHint, 'Tap again to commit');
    }

    this.btnUndo.bg.setAlpha(this.sel && this.sel.pre ? 1 : 0.45);
    this.btnThreat.icon.setTint(this.showThreat ? HEX_COL.amber : 0xffffff);
    this.btnEnd.bg.setAlpha(b.phase === 'player' ? 1 : 0.5);
  };

  // --------------------------------------------------------------- hook
  WBScene.prototype.syncHook = function () {
    var st = hook.state;
    st.mode = this.mode;
    st.wins = profile.wins;
    st.ready = !!this.ready;
    var b = this.battle;
    if (b) {
      st.stage = b.def.id;
      st.turn = b.turn;
      st.turns = b.turnLimit;
      st.objective = b.objective.kind;
      st.result = b.result;
      var prog = E.objectiveProgress(b);
      st.progress = prog.need ? clamp(prog.have / prog.need, 0, 1) : 0;
      st.score = b.score;
      var hp = 0, max = 0;
      var mine = E.side(b, 0);
      for (var i = 0; i < mine.length; i++) { hp += mine[i].hp; max += mine[i].maxHp; }
      st.health = max ? Math.round(hp / max * 100) : 0;
      st.units = mine.length;
      st.enemies = E.side(b, 1).length;
    } else {
      st.stage = this.stageSel;
      st.turn = 0; st.turns = 0; st.result = null;
      st.progress = profile.wins / E.BATTLES.length;
      st.score = profile.best;
      st.health = 100;
    }
  };
  WBScene.prototype.forceMode = function (m) {
    var ok = ['title', 'map', 'army', 'skirmish', 'battle', 'result'];
    if (ok.indexOf(m) < 0) return false;
    if (m === 'battle') { this.startBattle(this.stageSel, false); return true; }
    if (m === 'result') {
      if (!this.battle) this.startBattle(this.stageSel, false);
      this.battle.result = this.battle.result || 'win';
      this.finishBattle();
      return true;
    }
    this.setMode(m);
    return true;
  };
  WBScene.prototype.forceStage = function (n) {
    n = clamp(n | 0, 1, E.BATTLES.length);
    this.stageSel = n;
    if (this.mode === 'battle' || this.mode === 'result') this.startBattle(n, false);
    else this.dirty = true;
    this.syncHook();
    return true;
  };

  // --------------------------------------------------------------- boot
  var config = {
    type: Phaser.AUTO,
    parent: 'game',
    width: GAME_W,
    height: GAME_H,
    backgroundColor: '#0a151f',
    render: {},
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: Math.round(GAME_W * RETINA_FACTOR), height: Math.round(GAME_H * RETINA_FACTOR) },
    scene: [WBScene]
  };
  config.render = Object.assign({}, GGKit.renderDefaults, config.render || {});
  kit.loader.show('WARRING BANNERS');
  kit.loader.progress(0.1);
  Game.phaser = new Phaser.Game(config);
  window.__WB_READY = true;
}());
