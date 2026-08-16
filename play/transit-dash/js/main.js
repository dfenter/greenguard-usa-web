/* Transit Dash boot. GGKit is created before Phaser and owns every system boundary. */
(function (root) {
  'use strict';

  var TD = root.TD;
  var state = {
    ready: false, mode: 'boot', runType: 'daily', progress: 0, distance: 0, score: 0, health: 0,
    stage: 'yard', stageIndex: 0, multiplier: 1, tokens: 0, speed: 0, forceMode: null, forceStage: null
  };
  var hook = root.__td && typeof root.__td === 'object' ? root.__td : {};
  hook.state = state;
  root.__td = hook;

  var params = null;
  try { params = new URLSearchParams(root.location.search); } catch (e) { params = null; }
  var forcedMode = params && params.get('mode');
  var forcedStage = params && parseInt(params.get('stage'), 10);
  if (!Number.isFinite(forcedStage)) forcedStage = null;

  var runtime = {
    kit: null, scene: null, game: null, ready: false, screen: 'menu', keyPrev: Object.create(null),
    profile: null, forceMode: forcedMode || null, forceStage: forcedStage, initialMode: forcedMode === 'run' || forcedMode === 'daily' ? 'daily' : (forcedMode === 'timeattack' ? 'timeattack' : null)
  };
  // syncHook() in game.js reads this.runtime.state; main.js only ever put the
  // state object on the window hook, so every syncHook threw and the play
  // scene died on create.
  runtime.state = state;
  TD.runtime = runtime;
  state.forceMode = runtime.forceMode;
  state.forceStage = runtime.forceStage;

  function persist() { if (runtime.kit) runtime.kit.save.set(runtime.profile); }
  runtime.persist = persist;

  function clearKeys() { runtime.keyPrev = Object.create(null); }
  runtime.kit = root.GGKit.create({
    slug: 'transit-dash',
    orientation: 'portrait',
    validateSave: TD.validateSave,
    onPause: function () { clearKeys(); if (runtime.scene) runtime.scene.pauseVisual(true); },
    onResume: function () { clearKeys(); if (runtime.scene) runtime.scene.pauseVisual(false); },
    onRestart: function () {
      clearKeys();
      if (runtime.scene && runtime.scene.runner && (runtime.scene.runner.mode === 'run' || runtime.scene.runner.mode === 'timeattack' || runtime.scene.runner.mode === 'results')) {
        runtime.screen = 'play'; runtime.scene.startRun(runtime.scene.runner.runMode || 'daily', runtime.forceStage);
      }
    }
  });
  runtime.profile = TD.normalizeSave(runtime.kit.save.get(null));
  persist();

  /* All registered files are procedural original Transit Dash audio. GGKit's
   * music bus crossfades by line; its SFX bus owns every one-shot. */
  runtime.kit.audio.register({
    'music-yard': 'assets/music-yard.mp3', 'music-tube': 'assets/music-tube.mp3',
    'music-river': 'assets/music-river.mp3', 'music-harbour': 'assets/music-harbour.mp3',
    lane: 'assets/sfx-lane.mp3', vault: 'assets/sfx-vault.mp3', roll: 'assets/sfx-roll.mp3',
    ramp: 'assets/sfx-ramp.mp3', token: 'assets/sfx-token.mp3', power: 'assets/sfx-power.mp3',
    crate: 'assets/sfx-crate.mp3', near: 'assets/sfx-near.mp3', shield: 'assets/sfx-shield.mp3',
    hit: 'assets/sfx-hit.mp3', mission: 'assets/sfx-mission.mp3', finish: 'assets/sfx-finish.mp3'
  });

  function gamePoint(cx, cy) {
    var canvas = runtime.game && runtime.game.canvas;
    if (!canvas) return {x: cx, y: cy};
    var b = canvas.getBoundingClientRect();
    return {x: (cx - b.left) * TD.VW / Math.max(1, b.width), y: (cy - b.top) * TD.VH / Math.max(1, b.height)};
  }

  /* This listener is intentionally registered after GGKit.create. The game
   * owns its release map because GGKit clears its pointer map before window
   * pointerup listeners run. Paused menu taps still work through this map. */
  var gesturePointers = new Map();
  root.addEventListener('pointerdown', function (e) {
    gesturePointers.set(e.pointerId, {x: e.clientX, y: e.clientY, t: performance.now(), moved: false});
  }, {passive: true});
  root.addEventListener('pointermove', function (e) {
    var p = gesturePointers.get(e.pointerId); if (!p) return;
    if (Math.abs(e.clientX - p.x) > 18 || Math.abs(e.clientY - p.y) > 18) p.moved = true;
  }, {passive: true});
  root.addEventListener('pointerup', function (e) {
    var p = gesturePointers.get(e.pointerId); if (!p) return; gesturePointers.delete(e.pointerId);
    var dx = e.clientX - p.x, dy = e.clientY - p.y, elapsed = performance.now() - p.t;
    var scene = runtime.scene, runner = scene && scene.runner;
    if (!scene || !runner) return;
    if (runner.mode === 'run' || runner.mode === 'timeattack') {
      if (Math.max(Math.abs(dx), Math.abs(dy)) >= 24) {
        if (Math.abs(dx) > Math.abs(dy)) runner.queueAction(dx > 0 ? 'right' : 'left');
        else runner.queueAction(dy > 0 ? 'down' : 'up');
      } else if (elapsed < 420) {
        var tap = gamePoint(e.clientX, e.clientY);
        if (!scene.handleTap(tap.x, tap.y)) runner.queueAction('up');
      }
    } else {
      var pt = gamePoint(e.clientX, e.clientY); scene.handleTap(pt.x, pt.y);
    }
  }, {passive: true});
  root.addEventListener('pointercancel', function (e) { gesturePointers.delete(e.pointerId); }, {passive: true});

  hook.forceMode = function (mode) {
    runtime.forceMode = mode == null ? null : String(mode);
    state.forceMode = runtime.forceMode;
    if (!runtime.scene) runtime.initialMode = runtime.forceMode === 'timeattack' ? 'timeattack' : (runtime.forceMode === 'run' || runtime.forceMode === 'daily' || runtime.forceMode === 'play' ? 'daily' : null);
    if (runtime.scene) runtime.scene.forceMode(runtime.forceMode, runtime.forceStage);
    return true;
  };
  hook.forceStage = function (stage) {
    runtime.forceStage = Math.max(0, Math.min(TD.STAGES.length - 1, Math.floor(Number(stage) || 0)));
    state.forceStage = runtime.forceStage;
    if (!runtime.scene && !runtime.initialMode) runtime.initialMode = 'daily';
    if (runtime.scene) runtime.scene.forceMode(runtime.forceMode || 'run', runtime.forceStage);
    return true;
  };
  hook.reset = function () {
    runtime.kit.save.clear(); runtime.profile = TD.defaultSave(); persist(); runtime.forceMode = null; runtime.forceStage = null;
    if (runtime.scene) { runtime.scene.runner.mode = 'menu'; runtime.screen = 'menu'; runtime.scene.showMenu(); }
    return true;
  };
  hook.unlockAll = function () {
    for (var i = 0; i < runtime.profile.characters.length; i++) runtime.profile.characters[i] = true;
    for (var j = 0; j < runtime.profile.boards.length; j++) runtime.profile.boards[j] = true;
    persist(); return true;
  };

  runtime.kit.loader.show('Transit Dash');
  runtime.kit.loader.progress(0.08);
  runtime.game = new root.Phaser.Game({
    type: root.Phaser.AUTO,
    parent: 'game-root',
    backgroundColor: CACHED_COLOR(),
    scale: {mode: root.Phaser.Scale.FIT, autoCenter: root.Phaser.Scale.CENTER_BOTH, width: TD.VW, height: TD.VH},
    render: {antialias: true, antialiasGL: false, roundPixels: false, powerPreference: 'high-performance', batchSize: 2048},
    input: {activePointers: 1},
    audio: {noAudio: true},
    banner: false,
    scene: [TD.BootScene, TD.PlayScene]
  });

  function CACHED_COLOR() { return TD.COLORS.deep; }
  root.addEventListener('load', function () { runtime.kit.registerPWA(); });
})(window);
