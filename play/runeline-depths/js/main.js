/* Runeline Depths - boot and lifecycle.
 * GGKit is created first and owns pause, resume, restart, rotate overlay,
 * visibility pause, pointer identity, guarded saves, audio buses, the
 * loading screen, settings and the juice budget. Phaser is created after
 * the kit so every window level listener the kit installs sees pointer
 * events before the game does.
 */
(function (root) {
  'use strict';

  var RD = root.RD || {}; root.RD = RD;
  function cssViewport() { return { width: document.documentElement.clientWidth || root.innerWidth || 390, height: document.documentElement.clientHeight || root.innerHeight || 844 }; }
  function resizeHiDpi(game, width, height) { var view = width && height ? { width: width, height: height } : cssViewport(); return GGKit.hiDpi.resize(game, view.width, view.height); }
  function bindHiDpiResize(game) { var apply = function () { resizeHiDpi(game); }; root.addEventListener('resize', apply); root.addEventListener('orientationchange', apply); document.addEventListener('visibilitychange', apply); apply(); }

  /* verification hook the orchestrator can probe headlessly */
  RD.hook = {
    mode: 'boot', stage: 0, phase: 'boot', progress: 0,
    room: 0, rooms: 0, combo: 0, health: 0, foeHp: 0
  };

  var kit = GGKit.create({
    slug: 'runeline-depths',
    orientation: 'portrait',
    validateSave: RD.validateProfile,
    onPause: function () { if (kit && kit.onPauseHook) kit.onPauseHook(); },
    onResume: function () { },
    onRestart: function () { if (kit && kit.onRestartHook) kit.onRestartHook(); }
  });
  RD.kit = kit;

  /* ------------------------------------------------------------ profile */
  RD.profile = RD.normalizeProfile(kit.save.get(null));
  RD.saveProfile = function () {
    RD.profile.v = RD.SAVE_VERSION;
    kit.save.set(RD.profile);
  };
  RD.saveProfile();

  /* ----------------------------------------------------- lazy music law */
  /* Music files are only fetched after the first interaction, so a cold
     load never spends bandwidth on a track the player has not unlocked. */
  RD.wantMusic = null;
  RD.unlocked = false;
  RD.music = function (name) {
    RD.wantMusic = name;
    if (RD.unlocked) kit.audio.music(name);
  };
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (t) {
    window.addEventListener(t, function () {
      if (RD.unlocked) return;
      RD.unlocked = true;
      if (RD.wantMusic) kit.audio.music(RD.wantMusic);
    }, { once: true, passive: true });
  });

  /* ------------------------------------------------------- run starters */
  RD.startDungeon = function (id) {
    if (!RD.game) return;
    var d = RD.dungeon(id);
    RD.game.scene.start('play', { mode: 'dungeon', dungeonId: d.id });
  };
  RD.startDescent = function () {
    if (!RD.game) return;
    RD.game.scene.start('play', { mode: 'descent' });
  };

  /* --------------------------------------------------------- test hooks */
  /* Readable from the boot fallback and from a live scene. */
  var params = null;
  try { params = new URLSearchParams(window.location.search); } catch (e) { params = null; }
  RD.force = {
    mode: params && params.get('mode') || null,
    stage: params && parseInt(params.get('stage'), 10) || 0
  };

  function switchTo(mode, stage) {
    if (!RD.game || !RD.booted) { RD.force.mode = mode; RD.force.stage = stage || 0; return false; }
    if (mode === 'play' || mode === 'dungeon') {
      RD.game.scene.stop('menu'); RD.game.scene.stop('play');
      RD.game.scene.start('play', { mode: 'dungeon', dungeonId: stage || RD.force.stage || 1 });
      return true;
    }
    if (mode === 'descent') {
      RD.game.scene.stop('menu'); RD.game.scene.stop('play');
      RD.game.scene.start('play', { mode: 'descent' });
      return true;
    }
    RD.game.scene.stop('play');
    RD.game.scene.start('menu', { screen: mode === 'menu' ? 'title' : mode });
    return true;
  }
  RD.applyForce = function () {
    if (!RD.force.mode) return;
    var m = RD.force.mode, s = RD.force.stage;
    RD.force.mode = null;
    switchTo(m, s);
  };

  root.__rd = {
    state: RD.hook,
    get profile() { return RD.profile; },
    get run() { return RD.run || null; },
    forceMode: function (m, s) { return switchTo(m, s); },
    forceStage: function (n) { return switchTo('play', n); },
    unlockAll: function () {
      for (var i = 1; i <= RD.DUNGEONS.length; i++) {
        if (!RD.profile.cleared[i]) RD.profile.cleared[i] = 1;
      }
      RD.RUNEGUARDS.forEach(function (g) {
        if (RD.profile.roster.indexOf(g.id) < 0) RD.profile.roster.push(g.id);
      });
      RD.profile.runes += 5000;
      RD.saveProfile();
      return true;
    },
    reset: function () {
      kit.save.clear();
      RD.profile = RD.defaultProfile();
      RD.saveProfile();
      return switchTo('menu');
    }
  };

  /* --------------------------------------------------------------- game */
  kit.loader.show('Runeline Depths');
  kit.loader.progress(0.02);

  RD.booted = false;
  RD.game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: document.body,
    backgroundColor: '#0B1224',
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.NO_CENTER,
      width: window.innerWidth,
      height: window.innerHeight
    },
    render: Object.assign({}, GGKit.renderDefaults),
    input: { activePointers: 3, touch: { capture: true } },
    banner: false,
    audio: { noAudio: true },   /* GGKit owns every sound in this title */
    scene: [RD.BootScene, RD.MenuScene, RD.PlayScene]
  });
  bindHiDpiResize(RD.game);

  /* GGKit pause must freeze the sim: Phaser scenes stop stepping. */
  var origPause = kit.pause, origResume = kit.resume;
  kit.pause = function (reason) {
    origPause(reason);
    if (RD.game && RD.game.loop && reason !== 'menu') RD.game.loop.sleep();
  };
  kit.resume = function (reason) {
    origResume(reason);
    if (RD.game && RD.game.loop && !kit.paused) RD.game.loop.wake();
  };

  window.addEventListener('load', function () { kit.registerPWA(); });
})(typeof window !== 'undefined' ? window : globalThis);
