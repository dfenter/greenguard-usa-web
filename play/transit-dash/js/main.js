/* Transit Dash - boot, loop, overlays */
(function (g) {
  'use strict';
  var TD = g.TD, Game = TD.Game, Input = TD.Input;

  var cv = document.getElementById('cv');
  var ovStart = document.getElementById('ovStart');
  var ovOver = document.getElementById('ovOver');
  var ovPause = document.getElementById('ovPause');
  var ovRotate = document.getElementById('ovRotate');
  var overTitle = document.getElementById('overTitle');
  var overStats = document.getElementById('overStats');
  var overMissions = document.getElementById('overMissions');
  var pauseMissions = document.getElementById('pauseMissions');
  var startStats = document.getElementById('startStats');
  var btnPause = document.getElementById('btnPause');

  var paused = false, rotated = false, last = 0, acc = 0;

  Game.init(cv);
  Input.attach(cv);

  function show(el, on) { el.classList[on ? 'remove' : 'add']('hidden'); }
  function anyOverlay() {
    return rotated || paused || document.hidden || Game.state !== 'run';
  }

  function syncInput() { Input.enabled = Game.state === 'run' && !paused && !rotated && !document.hidden; }

  function missionHtml() {
    var s = TD.Save.data, out = '';
    for (var i = 0; i < s.missions.length; i++) {
      var m = s.missions[i], goal = TD.missionGoal(m);
      var pct = Math.min(100, Math.round(m.prog / goal * 100));
      out += '<div class="mrow' + (pct >= 100 ? ' done' : '') + '">' +
        TD.missionText(m) + ' &mdash; ' + Math.min(m.prog, goal) + '/' + goal +
        '<span class="bar"><i style="width:' + pct + '%"></i></span></div>';
    }
    return out;
  }

  function refreshStart() {
    var s = TD.Save.data;
    startStats.innerHTML = 'BEST ' + s.best + 'm &middot; ' + s.coins + ' tokens banked<br>' +
      'ROUTE: ' + Game.th().name + ' &middot; daily seed #' + (s.day % 1000) +
      '<br>complete a mission to shift the route';
  }

  /* ---------- state transitions ---------- */
  function startRun() {
    TD.Audio.unlock();
    Game.start();
    Input.enabled = true;
    paused = false;
    syncInput();
    show(ovStart, false); show(ovOver, false); show(ovPause, false);
    last = performance.now(); acc = 0;
  }

  function toMenu() {
    Game.reset(false);
    Game.state = 'menu';
    Input.enabled = false;
    paused = false;
    syncInput();
    refreshStart();
    show(ovOver, false); show(ovPause, false); show(ovStart, true);
  }

  Game.onGameOver = function (completed) {
    var s = TD.Save.data;
    overTitle.textContent = Game.stumbles >= 2 ? 'CAUGHT' : 'RUN OVER';
    overStats.innerHTML = '<b>' + Math.floor(Game.dist) + ' m</b> &middot; ' + Game.coins + ' tokens<br>' +
      'best ' + s.best + 'm &middot; ' + s.coins + ' banked &middot; run #' + s.runs +
      (completed.length ? '<br><span style="color:#4fd08a">' + completed.length + ' mission(s) cleared</span>' : '');
    overMissions.innerHTML = missionHtml();
    show(ovOver, true);
  };

  function togglePause(force) {
    if (Game.state !== 'run') return;
    paused = (typeof force === 'boolean') ? force : !paused;
    show(ovPause, paused);
    if (paused) { pauseMissions.innerHTML = missionHtml(); Input.releaseAll(); }
    else { last = performance.now(); acc = 0; }
    syncInput();
  }

  /* ---------- rotate gate (hardening #1) ---------- */
  function checkRotate() {
    var w = window.innerWidth, h = window.innerHeight;
    var bad = w > h;
    if (bad !== rotated) {
      rotated = bad;
      show(ovRotate, rotated);
      if (rotated) Input.releaseAll();
      else { last = performance.now(); acc = 0; }
      syncInput();
    }
  }

  /* ---------- buttons ---------- */
  document.getElementById('btnStart').addEventListener('click', startRun);
  ovStart.addEventListener('click', function (e) { if (e.target === ovStart) startRun(); });
  document.getElementById('btnAgain').addEventListener('click', startRun);
  document.getElementById('btnHome').addEventListener('click', toMenu);
  document.getElementById('btnResume').addEventListener('click', function () { togglePause(false); });
  document.getElementById('btnQuit').addEventListener('click', function () {
    togglePause(false);
    Game.state = 'over';
    var done = Game.commit();
    Input.enabled = false;
    Game.onGameOver(done);
  });
  btnPause.addEventListener('click', function () {
    if (Game.state === 'run') togglePause();
  });

  Input.onPause = function () {
    if (!document.hidden && !rotated && Game.state === 'run') togglePause();
  };
  Input.onRestart = function () {
    if (!document.hidden && !rotated && Game.state !== 'menu') startRun();
  };

  /* tap anywhere on the menu starts (audio gesture) */
  cv.addEventListener('pointerup', function () {
    if (Game.state === 'menu') startRun();
  });

  window.addEventListener('resize', function () { Game.resize(); checkRotate(); });
  window.addEventListener('orientationchange', function () {
    setTimeout(function () { Game.resize(); checkRotate(); }, 220);
  });
  window.addEventListener('blur', function () {
    if (Game.state === 'run' && !paused) togglePause(true);
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) Input.releaseAll();
    else { last = performance.now(); acc = 0; }
    syncInput();
  });
  window.addEventListener('pagehide', function () { TD.Save.save(); });

  /* ---------- loop ---------- */
  var STEP = 1 / 120, MAXF = 0.1;
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = (now - last) / 1000;
    last = now;
    if (!isFinite(dt) || dt < 0) dt = 0;
    if (dt > MAXF) dt = MAXF;

    if (!anyOverlay()) {
      acc += dt;
      var guard = 0;
      while (acc >= STEP && guard++ < 16) { Game.update(STEP); acc -= STEP; }
    } else {
      acc = 0;
    }
    Game.render();
  }

  refreshStart();
  checkRotate();
  last = performance.now();
  requestAnimationFrame(frame);
})(window);
