/* Reef Tiles - state, persistence, screens, main loop */
(function () {
  'use strict';
  var G = window.G, T = G.tank, B = G.board;
  var KEY = 'reefTiles.v1';

  G.state = { pearls: 12, stars: [], best: [] };
  for (var i = 0; i < G.LEVELS; i++) { G.state.stars.push(0); G.state.best.push(0); }

  G.saveGame = function () {
    G.store.set(KEY, {
      p: G.int(G.state.pearls, 0, 0, 999999),
      s: G.state.stars.slice(0, G.LEVELS),
      b: G.state.best.slice(0, G.LEVELS),
      t: T.serialize()
    });
  };
  function loadGame() {
    var o = G.store.get(KEY, null, function (v) { return typeof v === 'object'; });
    if (!o) { T.load(null); return; }
    G.state.pearls = G.int(o.p, 12, 0, 999999);
    for (var i = 0; i < G.LEVELS; i++) {
      G.state.stars[i] = G.int(Array.isArray(o.s) ? o.s[i] : 0, 0, 0, 3);
      G.state.best[i] = G.int(Array.isArray(o.b) ? o.b[i] : 0, 0, 0, 9999999);
    }
    T.load(o.t && typeof o.t === 'object' ? o.t : null);
  }

  /* ---- toast ---- */
  G.toastMsg = ''; G.toastT = 0;
  G.toast = function (m) { G.toastMsg = String(m).slice(0, 80); G.toastT = 2.6; };

  /* ---- navigation ---- */
  G.screen = 'map';
  G.go = function (name) {
    if (!G.screens[name]) return;
    var cur = G.screens[G.screen];
    if (cur && cur.leave) cur.leave();
    G.clearTimers();
    G.input.reset();
    B.resetInput(); T.resetInput();
    G.ui.reset();
    G.screen = name;
    G.saveGame();
  };

  G.startLevel = function (i) {
    i = G.clamp(i | 0, 0, G.LEVELS - 1);
    G.clearTimers();
    G.input.reset();
    B.resetInput(); T.resetInput();
    G.ui.reset();
    G.parts.length = 0;
    G.shake = 0;
    G.screen = 'level';
    B.layout();
    B.start(i);
  };

  G.onLevelWin = function (idx, stars, score) {
    var prev = G.state.stars[idx] || 0;
    var cfg = B.cfg;
    var gain;
    if (prev === 0) gain = cfg.pearls + stars * 6;
    else gain = 5 + Math.max(0, stars - prev) * 6;
    B.pearlsWon = gain;
    G.state.pearls = Math.min(999999, G.state.pearls + gain);
    G.state.stars[idx] = Math.max(prev, stars);
    G.state.best[idx] = Math.max(G.state.best[idx] || 0, score);
    G.saveGame();
    var pa = G.LAY.play;
    for (var i = 0; i < 22; i++) {
      G.spark(pa.x + pa.w / 2 + (Math.random() - 0.5) * 160, pa.y + pa.h * 0.4, i % 2 ? '#ffe9a8' : '#7effc0', 2, 200, 0.9, 160, 3.5);
    }
  };

  /* ---- pause / overlays ---- */
  G.started = false;
  G.paused = function () { return !G.started || G.landscape || document.hidden; };
  G.firstGesture = function () {
    G.audio.init();
    if (!G.started && !G.landscape) {
      G.started = true;
      G.ui.reset();
    }
  };

  function drawStart() {
    var c = G.ctx;
    c.fillStyle = 'rgba(3,18,28,0.9)'; c.fillRect(0, 0, G.W, G.H);
    var cy = G.H * 0.42;
    G.text('REEF TILES', G.W / 2, cy - 70, 34, '#6fe0ff', 'center');
    G.text('match-3 expeditions • living aquarium', G.W / 2, cy - 38, 14, '#bfeeff', 'center', '600');
    var pulse = 0.6 + Math.sin(performance.now() * 0.004) * 0.4;
    c.globalAlpha = pulse;
    G.text('TAP TO START', G.W / 2, cy + 30, 24, '#ffe9a8', 'center');
    c.globalAlpha = 1;
    G.text('Swipe tiles to match 3+ • earn pearls • grow your reef', G.W / 2, cy + 76, 13, '#78b6cd', 'center', '600');
    G.text('Everything is free — no energy, no timers, no money', G.W / 2, cy + 98, 12, '#4f93ab', 'center', '600');
    T.drawFishAt(0, G.W * 0.3, cy + 150, 1.6);
    T.drawFishAt(4, G.W * 0.62, cy + 176, 1.4);
  }

  function drawRotate() {
    var c = G.ctx;
    c.fillStyle = '#04141c'; c.fillRect(0, 0, G.W, G.H);
    var cx = G.W / 2, cy = G.H / 2;
    c.save(); c.translate(cx, cy - 20);
    c.rotate(Math.sin(performance.now() * 0.002) * 0.4);
    c.strokeStyle = '#6fe0ff'; c.lineWidth = 4;
    G.rr(-34, -54, 68, 108, 10); c.stroke();
    c.restore();
    G.text('ROTATE TO PORTRAIT', cx, cy + 78, 18, '#bfeeff', 'center');
    G.text('paused', cx, cy + 104, 13, '#78b6cd', 'center', '600');
  }

  /* ---- loop ---- */
  var last = 0, wasPaused = false;
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = (now - last) / 1000;
    last = now;
    if (!isFinite(dt) || dt < 0) dt = 0;
    dt = Math.min(0.05, dt);

    var c = G.ctx;
    c.setTransform(G.scale, 0, 0, G.scale, 0, 0);
    c.fillStyle = '#04141c';
    c.fillRect(0, 0, G.W, G.H);

    var pausedNow = G.paused();
    if (pausedNow && !wasPaused) G.releaseAll();
    wasPaused = pausedNow;

    if (G.landscape) {
      G.ui.clearFrame();
      drawRotate();
      return;
    }

    if (!pausedNow) {
      T.t += dt;
      G.updateParts(dt);
      G.shake = Math.max(0, G.shake - dt * 42);
      if (G.screen === 'level') B.update(dt);
      if (G.screen === 'tank') T.update(dt);
      if (G.toastT > 0) G.toastT -= dt;
    }

    G.ui.clearFrame();
    c.save();
    if (G.shake > 0.2) {
      c.translate((Math.random() - 0.5) * G.shake, (Math.random() - 0.5) * G.shake);
    }
    var s = G.screens[G.screen];
    if (s && s.draw) s.draw(dt);
    G.drawParts();
    c.restore();

    G.drawHUD();
    G.drawNav();

    if (G.toastT > 0) {
      var a = Math.min(1, G.toastT * 2);
      c.globalAlpha = a;
      var tw = Math.min(G.W - 24, 320);
      var tx = (G.W - tw) / 2, ty = G.H - G.LAY.nav - 52;
      c.fillStyle = '#0b3d51'; G.rr(tx, ty, tw, 38, 10); c.fill();
      c.strokeStyle = '#2ea9cc'; c.lineWidth = 2; G.rr(tx, ty, tw, 38, 10); c.stroke();
      G.text(G.toastMsg, G.W / 2, ty + 19, 12.5, '#eaf6ff', 'center', '600');
      c.globalAlpha = 1;
    }

    if (!G.started) { G.ui.clearFrame(); drawStart(); }
  }

  /* ---- boot ---- */
  G.resize();
  loadGame();
  T.rectCalc();
  B.layout();
  if (!T.fish.length && !T.decor.length) {
    // starter reef so the tank is alive from the first second
    T.addDecor(0, 1, 0.22, 0.9);
    T.addDecor(7, 0, 0.72, 0.93);
    T.addFish(0, 0, 0); T.addFish(0, 0, 0); T.addFish(0, 0, 0);
    var r = T.rect;
    for (var i2 = 0; i2 < T.fish.length; i2++) {
      T.fish[i2].x = r.x + 40 + Math.random() * (r.w - 80);
      T.fish[i2].y = r.y + 40 + Math.random() * (r.h - 90);
    }
    G.saveGame();
  }
  G.screen = 'map';
  requestAnimationFrame(frame);
})();
