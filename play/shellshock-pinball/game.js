/* Shellshock Pinball - game loop, input, render */
(function (SS) {
  'use strict';

  var CWID = SS.W, TH = SS.H, HUD = 84, CH = TH + HUD;
  var cv = document.getElementById('cv'), g = cv.getContext('2d');
  var view = { f: 1 };
  var G = 1500, VMAX = 1750, BALLR = 9.5;
  var COL = {
    bg0: '#111a2b', bg1: '#070a12', wall: '#46597a', rail: '#8fa8cc',
    cy: '#4fd8ff', mg: '#ff5aa8', am: '#ffc24f', gr: '#6ef07a', wt: '#eaf2ff'
  };

  var MISSIONS = [
    { k: 'ramp', need: 3, label: 'SHOOT 3 RAMPS' },
    { k: 'pop', need: 14, label: 'HIT 14 BUMPERS' },
    { k: 'spin', need: 24, label: 'SPIN 24 TIMES' },
    { k: 'bank', need: 2, label: 'CLEAR 2 BANKS' },
    { k: 'hole', need: 2, label: 'LOCK 2 IN THE HOLE' }
  ];

  var T, ball, S, parts, pops = [], shake = 0, nudgeOff = { x: 0, y: 0, vx: 0, vy: 0 };
  var seedNum = 0;

  /* ---------------- setup ---------------- */
  function newGame(seed) {
    clearInput();
    seedNum = seed >>> 0;
    SS.saveSeed(seedNum);
    T = SS.genTable(seedNum);
    parts = SS.Particles(180);
    S = {
      score: 0, balls: 3, ball: 1, over: false, level: 1, tilt: false,
      mode: { on: false, idx: 0, prog: 0, time: 0 }, nudges: [], msg: '', msgT: 0,
      best: SS.best(seedNum), launchPow: 0, plunging: false, plungerId: null, t: 0
    };
    pops = [];
    serve();
  }
  function serve() {
    ball = {
      x: 401, y: 714.5 - 0, vx: 0, vy: 0, r: BALLR, state: 'ready',
      trail: [], stillT: 0, rd: 0, rs: 0, hold: 0
    };
    S.tilt = false; S.nudges = []; S.launchPow = 0;
    T.flipL.on = T.flipR.on = false;
    T.kick.charged = true;
    T.banks.forEach(function (b) {
      b.targets.forEach(function (t) { t.down = false; t.seg.down = false; });
      b.done = false; b.resetAt = 0;
    });
    if (T.hole) { T.hole.lit = false; }
  }

  /* ---------------- scoring ---------------- */
  function addScore(n, x, y, txt) {
    if (S.tilt) return;
    S.score += n;
    if (txt) popup(x, y, txt);
  }
  function popup(x, y, txt, col) {
    pops.push({ x: x, y: y, txt: txt, life: 1.1, col: col || COL.wt });
    if (pops.length > 14) pops.shift();
  }
  function banner(t, dur) { S.msg = t; S.msgT = dur || 2.2; }

  function progress(kind, x, y) {
    var m = S.mode;
    if (!m.on) return false;
    if (MISSIONS[m.idx].k !== kind) return false;
    m.prog++;
    addScore(3000 * S.level, x, y, '+' + (3000 * S.level));
    if (m.prog >= MISSIONS[m.idx].need) {
      var jack = 25000 * S.level;
      addScore(jack, 195, 300, 'JACKPOT ' + jack);
      banner('JACKPOT! ' + jack.toLocaleString(), 3);
      m.on = false; S.level++;
      shake = Math.max(shake, 16);
      parts.burst(195, 300, 60, COL.am, 460, 0.9);
      SS.SFX.jack();
    }
    return true;
  }

  function bankDone(b) {
    b.done = true; b.resetAt = S.t + 1.5; b.flash = 1;
    addScore(5000 * S.level, b.x, b.y, 'BANK ' + (5000 * S.level));
    SS.SFX.bank();
    shake = Math.max(shake, 9);
    parts.burst(b.x, b.y, 26, COL.gr, 340, 0.7);
    T.kick.charged = true;
    if (!progress('bank', b.x, b.y) && !S.mode.on && T.hole) {
      T.hole.lit = true;
      banner('MISSION LIT - SHOOT THE HOLE', 2.6);
    }
  }

  function startMission() {
    var m = S.mode;
    m.idx = Math.floor(Math.random() * MISSIONS.length);
    m.on = true; m.prog = 0; m.time = 60;
    T.hole.lit = false;
    banner(MISSIONS[m.idx].label, 3);
    SS.SFX.jack();
  }

  /* ---------------- physics ---------------- */
  function flipperStep(f, dt) {
    var target = (f.on && !S.tilt) ? f.up : f.rest;
    var sp = 27, d = target - f.angle;
    var step = sp * dt;
    if (Math.abs(d) <= step) { f.omega = d / Math.max(dt, 1e-4); f.angle = target; }
    else { var s = d > 0 ? 1 : -1; f.angle += s * step; f.omega = s * sp; }
    f.omega = SS.clamp(f.omega, -sp, sp);
  }

  function collide() {
    var i, h, s;
    for (i = 0; i < T.segs.length; i++) {
      s = T.segs[i];
      h = SS.hitSeg(ball, s);
      if (!h) continue;
      if (s.kind === 'target' && s.target && !s.target.down) {
        s.target.down = true; s.down = true; s.target.flash = 1;
        addScore(500 * S.level, s.target.cx, s.target.cy, '500');
        SS.SFX.target();
        parts.burst(s.target.cx, s.target.cy, 10, COL.gr, 240, 0.45);
        var b = s.target.bank, all = true;
        for (var k = 0; k < b.targets.length; k++) if (!b.targets[k].down) all = false;
        if (all) bankDone(b);
      } else if (s.kind === 'sling') {
        s.ref.flash = 1;
        addScore(50, (s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2, '');
        SS.SFX.sling();
        parts.burst(ball.x, ball.y, 6, COL.mg, 260, 0.35);
        shake = Math.max(shake, 3);
      } else if (h.speed > 260) {
        SS.SFX.wall(h.speed);
      }
    }
    for (i = 0; i < T.circles.length; i++) {
      var c = T.circles[i];
      h = SS.hitCircle(ball, c);
      if (!h) continue;
      if (c.kind === 'pop') {
        c.flash = 1; c.hits++;
        addScore(100 * S.level, c.x, c.y, '');
        SS.SFX.pop();
        parts.burst(c.x, c.y, 8, COL.cy, 300, 0.4);
        shake = Math.max(shake, 4);
        progress('pop', c.x, c.y);
      } else if (c.kind === 'post') { c.flash = 1; }
    }
    h = SS.hitFlipper(ball, T.flipL); if (h && h.speed > 200) SS.SFX.wall(h.speed);
    h = SS.hitFlipper(ball, T.flipR); if (h && h.speed > 200) SS.SFX.wall(h.speed);
  }

  function sensors(px, py) {
    // ramp mouth (crossing upward)
    var R = T.ramp;
    if (R && ball.state === 'live') {
      var m = R.mouth;
      if (py > m.y1 && ball.y <= m.y1 && ball.vy < 0 &&
        ball.x > m.x1 - 4 && ball.x < m.x2 + 4) {
        var sp = Math.hypot(ball.vx, ball.vy);
        if (sp > 520) {
          ball.state = 'ramp'; ball.rd = 0; ball.rs = SS.clamp(sp * 0.85, 520, 1150);
          R.flash = 1; SS.SFX.ramp();
        } else {
          ball.y = m.y1 + 2; ball.vy = Math.abs(ball.vy) * 0.4 + 40;
        }
      }
    }
    // spinner
    var sp2 = T.spinner;
    if (sp2 && ball.state === 'live') {
      var d = Math.hypot(ball.x - sp2.x, ball.y - sp2.y);
      if (d < sp2.r + ball.r) {
        if (!sp2.inside) {
          sp2.inside = true;
          sp2.vel += Math.min(46, Math.hypot(ball.vx, ball.vy) * 0.045) * (ball.vy > 0 ? 1 : -1);
          sp2.flash = 1;
        }
      } else sp2.inside = false;
    }
    // mode hole
    var ho = T.hole;
    if (ho && ball.state === 'live' && !(ball.holeCool > 0)) {
      if (Math.hypot(ball.x - ho.x, ball.y - ho.y) < ho.r) {
        ball.state = 'saucer'; ball.hold = 0.85;
        ball.vx = ball.vy = 0; ball.x = ho.x; ball.y = ho.y;
        ho.flash = 1; SS.SFX.hole();
        if (ho.lit && !S.mode.on) startMission();
        else if (!progress('hole', ho.x, ho.y)) addScore(1000 * S.level, ho.x, ho.y, '1000');
      }
    }
    // kickback
    var kb = T.kick;
    if (kb && ball.state === 'live' && Math.hypot(ball.x - kb.x, ball.y - kb.y) < kb.r + ball.r) {
      if (kb.charged && !S.tilt) {
        kb.charged = false; kb.flash = 1;
        ball.x = 52; ball.y = 654;
        ball.vx = -420; ball.vy = -1290;
        SS.SFX.kickb(); shake = Math.max(shake, 8);
        banner('KICKBACK!', 1.4);
        parts.burst(kb.x, kb.y, 18, COL.am, 380, 0.6);
      }
    }
  }

  function drain() {
    SS.SFX.drain();
    shake = Math.max(shake, 10);
    S.mode.on = false;
    S.ball++;
    if (S.ball > S.balls) {
      S.over = true;
      if (S.score > S.best) { S.best = S.score; SS.setBest(seedNum, S.score); }
    } else {
      banner('BALL ' + S.ball, 1.6);
      serve();
    }
  }

  function physics(dt) {
    flipperStep(T.flipL, dt);
    flipperStep(T.flipR, dt);

    if (ball.state === 'ready') {
      ball.x = 401; ball.y = 714.5;
      ball.trail.length = 0;
    } else if (ball.state === 'saucer') {
      ball.hold -= dt;
      if (ball.hold <= 0) {
        ball.state = 'live';
        var a = T.hole.ejectAng;
        ball.vx = Math.cos(a) * 820; ball.vy = Math.sin(a) * 820;
        ball.x = T.hole.x + Math.cos(a) * 34; ball.y = T.hole.y + Math.sin(a) * 34;
        ball.holeCool = 0.45;
        parts.burst(T.hole.x, T.hole.y, 12, '#ff5aa8', 320, 0.5);
      }
    } else if (ball.state === 'ramp') {
      var R = T.ramp;
      ball.rs = Math.max(360, ball.rs - 150 * dt);
      ball.rd += ball.rs * dt;
      if (ball.rd >= R.len) {
        var n = R.path.length;
        var a1 = R.path[n - 2], a2 = R.path[n - 1];
        var dx = a2[0] - a1[0], dy = a2[1] - a1[1], L = Math.hypot(dx, dy) || 1;
        ball.x = a2[0]; ball.y = a2[1];
        ball.vx = dx / L * 300; ball.vy = dy / L * 300 + 60;
        ball.state = 'live';
        addScore(2500 * S.level, ball.x, ball.y, 'RAMP ' + (2500 * S.level));
        progress('ramp', ball.x, ball.y);
        parts.burst(ball.x, ball.y, 12, COL.cy, 260, 0.5);
      } else {
        var p = samplePath(R, ball.rd);
        ball.x = p[0]; ball.y = p[1];
      }
      ball.trail.push([ball.x, ball.y]);
      if (ball.trail.length > 9) ball.trail.shift();
    } else {
      if (ball.holeCool > 0) ball.holeCool -= dt;
      var STEPS = 8, h = dt / STEPS;
      for (var i = 0; i < STEPS; i++) {
        var px = ball.x, py = ball.y;
        ball.vy += G * h;
        var damp = 1 - 0.16 * h;
        ball.vx *= damp; ball.vy *= damp;
        var sp = Math.hypot(ball.vx, ball.vy);
        if (sp > VMAX) { ball.vx *= VMAX / sp; ball.vy *= VMAX / sp; }
        ball.x += ball.vx * h; ball.y += ball.vy * h;
        collide();
        sensors(px, py);
        if (ball.state !== 'live') break;
      }
      ball.trail.push([ball.x, ball.y]);
      if (ball.trail.length > 9) ball.trail.shift();
      // anti-wedge: if the ball has barely moved, shake it loose
      var moved = Math.hypot(ball.x - (ball.lx === undefined ? 1e9 : ball.lx), ball.y - (ball.ly === undefined ? 0 : ball.ly));
      ball.lx = ball.x; ball.ly = ball.y;
      if (moved < 0.9) {
        ball.stillT += dt;
        if (ball.stillT > 1.4) {
          ball.vx = (Math.random() - 0.5) * 420; ball.vy = -260; ball.stillT = 0;
          ball.y -= 2;
        }
      } else ball.stillT = 0;
      // a weak plunge rolls back into the lane: allow a re-plunge
      if (ball.x > 386 && ball.y > 688 && Math.hypot(ball.vx, ball.vy) < 70) {
        ball.state = 'ready'; ball.vx = ball.vy = 0; S.launchPow = 0; ball.stillT = 0;
      }
      if (ball.y > 716 && ball.x < 372) drain();
      if (ball.y > 900) drain();
    }
  }

  function samplePath(R, d) {
    var c = R.cum, p = R.path;
    var lo = 0, hi = c.length - 1;
    while (lo < hi - 1) { var mid = (lo + hi) >> 1; if (c[mid] <= d) lo = mid; else hi = mid; }
    var t = (d - c[lo]) / Math.max(1e-6, c[hi] - c[lo]);
    return [SS.lerp(p[lo][0], p[hi][0], t), SS.lerp(p[lo][1], p[hi][1], t)];
  }

  /* ---------------- update ---------------- */
  function update(dt) {
    S.t += dt;
    if (S.over) { parts.update(dt); decay(dt); return; }

    physics(dt);
    parts.update(dt);
    decay(dt);

    // spinner rotation & scoring
    var sp = T.spinner;
    if (sp) {
      var prev = sp.rot;
      sp.rot += sp.vel * dt;
      sp.vel *= (1 - 1.15 * dt);
      if (Math.abs(sp.vel) < 0.25) sp.vel = 0;
      var half = Math.PI;
      if (Math.floor(Math.abs(sp.rot) / half) !== Math.floor(Math.abs(prev) / half)) {
        sp.spins++;
        addScore(130 * S.level, sp.x, sp.y, '');
        SS.SFX.spin();
        progress('spin', sp.x, sp.y);
      }
    }
    // bank auto-reset
    for (var i = 0; i < T.banks.length; i++) {
      var b = T.banks[i];
      if (b.done && S.t > b.resetAt) {
        b.done = false;
        for (var k = 0; k < b.targets.length; k++) { b.targets[k].down = false; b.targets[k].seg.down = false; }
      }
    }
    // mission timer
    if (S.mode.on) {
      S.mode.time -= dt;
      if (S.mode.time <= 0) { S.mode.on = false; banner('MISSION OVER', 1.8); }
    }
    // nudge spring
    var n = nudgeOff;
    n.vx += -n.x * 260 * dt - n.vx * 9 * dt;
    n.vy += -n.y * 260 * dt - n.vy * 9 * dt;
    n.x += n.vx * dt; n.y += n.vy * dt;
  }

  function decay(dt) {
    shake = Math.max(0, shake - shake * 6 * dt - 2 * dt);
    if (S.msgT > 0) S.msgT -= dt;
    var f = function (o) { if (o && o.flash > 0) o.flash = Math.max(0, o.flash - dt * 3.2); };
    T.circles.forEach(f); T.slings.forEach(f); T.banks.forEach(f);
    T.banks.forEach(function (b) { b.targets.forEach(f); });
    f(T.spinner); f(T.hole); f(T.kick); f(T.ramp);
    for (var i = pops.length - 1; i >= 0; i--) {
      pops[i].life -= dt; pops[i].y -= 26 * dt;
      if (pops[i].life <= 0) pops.splice(i, 1);
    }
  }

  /* ---------------- input ---------------- */
  var pointers = {};
  function clearInput() {
    pointers = {}; keys = {}; nudgeOff.x = 0; nudgeOff.y = 0; nudgeOff.vx = 0; nudgeOff.vy = 0;
    if (T) { T.flipL.on = false; T.flipR.on = false; }
    if (S) { S.plunging = false; S.plungerId = null; S.launchPow = 0; }
  }
  window.addEventListener('blur', clearInput);
  function toLocal(e) {
    var r = cv.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / r.width * CWID,
      y: (e.clientY - r.top) / r.height * CH
    };
  }
  function inRect(p, x, y, w, h) { return p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h; }

  function press(p, id) {
    SS.audioInit();
    // HUD buttons
    if (inRect(p, 314, 0, 116, 58)) { newGame((Math.random() * 4294967295) >>> 0); return; }
    if (inRect(p, 266, 0, 48, 58)) { SS.setMuted(!SS.isMuted()); return; }
    if (S.over) {
      if (inRect(p, 65, 470, 300, 56)) { newGame(seedNum); return; }
      if (inRect(p, 65, 540, 300, 56)) { newGame((Math.random() * 4294967295) >>> 0); return; }
      return;
    }
    if (p.y < HUD) return;
    var ty = p.y - HUD;
    // plunger drag zone (generous: bottom-right quadrant while ball waits)
    if (ball.state === 'ready' && p.x > 292 && ty > 470) {
      if (S.plungerId !== null) return;
      pointers[id] = { role: 'plunge', sx: p.x, sy: p.y, t: performance.now(), moved: 0 };
      S.plungerId = id;
      S.plunging = true;
      return;
    }
    var role = p.x < CWID / 2 ? 'L' : 'R';
    pointers[id] = { role: role, sx: p.x, sy: p.y, t: performance.now(), moved: 0, swiped: false };
    if (role === 'L') { T.flipL.on = true; } else { T.flipR.on = true; }
    if (!S.tilt) SS.SFX.flip();
  }
  function move(p, id) {
    var q = pointers[id]; if (!q) return;
    var dx = p.x - q.sx, dy = p.y - q.sy;
    q.moved = Math.hypot(dx, dy);
    if (q.role === 'plunge') {
      S.launchPow = SS.clamp(dy / 110, 0, 1);
    } else if (!q.swiped && q.moved > 34 && performance.now() - q.t < 320) {
      q.swiped = true;
      nudge(dx, dy);
    }
  }
  function release(id, canceled) {
    var q = pointers[id]; if (!q) return;
    delete pointers[id];
    if (q.role === 'plunge') {
      if (S.plungerId !== id) return;
      S.plungerId = null;
      S.plunging = false;
      if (!canceled) launch(); else S.launchPow = 0;
    } else {
      var still = false;
      for (var k in pointers) if (pointers[k].role === q.role) still = true;
      if (!still) { if (q.role === 'L') T.flipL.on = false; else T.flipR.on = false; }
    }
  }
  function launch() {
    if (ball.state !== 'ready') { S.launchPow = 0; return; }
    var pow = S.launchPow;
    ball.state = 'live';
    ball.vy = -(1370 + 380 * pow);
    ball.vx = 0;
    S.launchPow = 0;
    SS.SFX.launch();
    parts.burst(401, 716, 10, COL.am, 200, 0.4);
  }
  function nudge(dx, dy) {
    if (S.tilt || S.over) return;
    var L = Math.hypot(dx, dy) || 1;
    var ux = dx / L, uy = dy / L;
    if (ball.state === 'live') { ball.vx += ux * 190; ball.vy += uy * 120 - 60; }
    nudgeOff.vx -= ux * 130; nudgeOff.vy -= uy * 90;
    shake = Math.max(shake, 5);
    var now = performance.now();
    S.nudges.push(now);
    S.nudges = S.nudges.filter(function (t) { return now - t < 2600; });
    if (S.nudges.length > 3) {
      S.tilt = true;
      T.flipL.on = T.flipR.on = false;
      banner('TILT', 3);
      SS.SFX.tilt();
      shake = Math.max(shake, 18);
    }
  }

  cv.addEventListener('pointerdown', function (e) {
    e.preventDefault(); cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
    press(toLocal(e), e.pointerId);
  }, { passive: false });
  cv.addEventListener('pointermove', function (e) {
    e.preventDefault(); if (pointers[e.pointerId]) move(toLocal(e), e.pointerId);
  }, { passive: false });
  ['pointerup', 'pointercancel'].forEach(function (n) {
    cv.addEventListener(n, function (e) { e.preventDefault(); release(e.pointerId, n === 'pointercancel'); }, { passive: false });
  });
  document.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); }, { passive: false });

  var keys = {};
  window.addEventListener('keydown', function (e) {
    if (keys[e.code]) return;
    keys[e.code] = true;
    SS.audioInit();
    switch (e.code) {
      case 'ShiftLeft': case 'ArrowLeft': case 'KeyA': case 'KeyZ':
        T.flipL.on = true; if (!S.tilt) SS.SFX.flip(); e.preventDefault(); break;
      case 'ShiftRight': case 'ArrowRight': case 'KeyD': case 'KeySlash': case 'Slash':
        T.flipR.on = true; if (!S.tilt) SS.SFX.flip(); e.preventDefault(); break;
      case 'Space': case 'Enter':
        if (S.over) { newGame(seedNum); }
        else if (ball.state === 'ready' && S.plungerId === null) { S.plungerId = 'key'; S.plunging = true; }
        e.preventDefault(); break;
      case 'KeyQ': nudge(-1, -0.4); break;
      case 'KeyE': nudge(1, -0.4); break;
      case 'ArrowUp': case 'KeyW': nudge(0, -1); e.preventDefault(); break;
      case 'KeyN': newGame((Math.random() * 4294967295) >>> 0); break;
      case 'KeyM': SS.setMuted(!SS.isMuted()); break;
    }
  });
  window.addEventListener('keyup', function (e) {
    keys[e.code] = false;
    switch (e.code) {
      case 'ShiftLeft': case 'ArrowLeft': case 'KeyA': case 'KeyZ': T.flipL.on = false; break;
      case 'ShiftRight': case 'ArrowRight': case 'KeyD': case 'KeySlash': case 'Slash': T.flipR.on = false; break;
      case 'Space': case 'Enter': if (S.plungerId === 'key') { S.plungerId = null; S.plunging = false; launch(); } break;
    }
  });

  /* ---------------- render ---------------- */
  function resize() {
    var vw = window.innerWidth, vh = window.innerHeight;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var scale = Math.min(vw / CWID, vh / CH);
    var cssW = Math.floor(CWID * scale), cssH = Math.floor(CH * scale);
    cv.style.width = cssW + 'px'; cv.style.height = cssH + 'px';
    var backing = Math.min(cssH * dpr, 960);
    var f = backing / CH;
    cv.width = Math.round(CWID * f); cv.height = Math.round(CH * f);
    view.f = f;
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', function () { setTimeout(resize, 120); });

  function fmt(n) { return n.toLocaleString('en-US'); }

  function drawHUD() {
    g.save();
    g.fillStyle = '#0a0e18';
    g.fillRect(0, 0, CWID, HUD);
    g.fillStyle = '#1b2740'; g.fillRect(0, HUD - 2, CWID, 2);
    // score
    g.fillStyle = COL.wt; g.font = 'bold 30px ui-monospace,Menlo,monospace';
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillText(fmt(S.score), 12, 36);
    g.font = '11px ui-monospace,Menlo,monospace'; g.fillStyle = '#7d90b3';
    g.fillText('BEST ' + fmt(S.best) + '  x' + S.level, 12, 52);
    // balls
    for (var i = 0; i < S.balls; i++) {
      var used = i < S.ball - 1;
      g.beginPath(); g.arc(206 + i * 18, 26, 6, 0, SS.TAU);
      g.fillStyle = used ? '#26324a' : COL.am; g.fill();
    }
    g.font = '10px ui-monospace,Menlo,monospace'; g.fillStyle = '#7d90b3'; g.textAlign = 'center';
    g.fillText('BALL ' + Math.min(S.ball, S.balls), 224, 46);
    // mute
    g.fillStyle = '#16203a'; roundRect(276, 8, 32, 38, 6); g.fill();
    g.fillStyle = SS.isMuted() ? '#54637f' : COL.cy;
    g.font = 'bold 13px ui-monospace,monospace';
    g.fillText(SS.isMuted() ? 'X' : '((', 292, 32);
    // new table btn
    g.fillStyle = '#182a44'; roundRect(322, 8, 96, 38, 7); g.fill();
    g.strokeStyle = COL.cy; g.lineWidth = 1.4; roundRect(322, 8, 96, 38, 7); g.stroke();
    g.fillStyle = COL.cy; g.font = 'bold 12px ui-monospace,monospace';
    g.fillText('NEW TABLE', 370, 27);
    g.font = '9px ui-monospace,monospace'; g.fillStyle = '#5d6f92';
    g.fillText('#' + seedNum.toString(36).toUpperCase().slice(0, 6), 370, 40);

    // line 2: mission / message / hint
    var y = 66;
    g.textAlign = 'left';
    if (S.msgT > 0) {
      g.fillStyle = COL.am; g.font = 'bold 15px ui-monospace,monospace';
      g.textAlign = 'center'; g.fillText(S.msg, CWID / 2, y + 4);
    } else if (S.mode.on) {
      var M = MISSIONS[S.mode.idx];
      g.fillStyle = COL.mg; g.font = 'bold 13px ui-monospace,monospace';
      g.fillText(M.label + '  ' + S.mode.prog + '/' + M.need, 12, y);
      g.fillStyle = '#22304d'; g.fillRect(12, y + 6, CWID - 24, 5);
      g.fillStyle = COL.mg; g.fillRect(12, y + 6, (CWID - 24) * SS.clamp(S.mode.time / 60, 0, 1), 5);
      g.textAlign = 'right'; g.fillStyle = '#7d90b3'; g.font = '10px ui-monospace,monospace';
      g.fillText(Math.ceil(S.mode.time) + 's', CWID - 12, y);
    } else {
      g.fillStyle = '#6d80a3'; g.font = '11px ui-monospace,monospace';
      g.textAlign = 'center';
      var hint = ball.state === 'ready'
        ? 'DRAG DOWN THE RIGHT LANE TO LAUNCH'
        : (T.hole && T.hole.lit ? 'MISSION LIT - SHOOT THE MODE HOLE'
          : 'TAP LEFT / RIGHT = FLIPPERS   SWIPE = NUDGE');
      g.fillText(hint, CWID / 2, y + 3);
    }
    g.restore();
  }

  function roundRect(x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
    g.closePath();
  }

  function drawPlayfield() {
    var grd = g.createLinearGradient(0, 0, 0, TH);
    grd.addColorStop(0, COL.bg0); grd.addColorStop(1, COL.bg1);
    g.fillStyle = grd; g.fillRect(0, 0, CWID, TH);
    // subtle arcs
    g.strokeStyle = 'rgba(120,160,220,0.05)'; g.lineWidth = 1;
    for (var i = 1; i <= 5; i++) {
      g.beginPath(); g.arc(195, 300, i * 70, 0, SS.TAU); g.stroke();
    }
    // lane shading
    g.fillStyle = 'rgba(10,16,28,0.7)'; g.fillRect(380, 150, 42, 580);
  }

  function drawSegs() {
    g.lineCap = 'round';
    for (var i = 0; i < T.segs.length; i++) {
      var s = T.segs[i];
      if (s.kind === 'target' || s.kind === 'sling' || s.kind === 'slingedge') continue;
      if (s.kind === 'gate') {
        g.strokeStyle = 'rgba(180,210,255,0.35)'; g.lineWidth = 3;
      } else {
        g.strokeStyle = COL.wall; g.lineWidth = (s.r || 4) * 2;
      }
      g.beginPath(); g.moveTo(s.x1, s.y1); g.lineTo(s.x2, s.y2); g.stroke();
    }
    // rail highlight
    g.strokeStyle = 'rgba(180,208,255,0.16)'; g.lineWidth = 1.4;
    for (i = 0; i < T.segs.length; i++) {
      var q = T.segs[i];
      if (q.kind !== 'wall') continue;
      g.beginPath(); g.moveTo(q.x1, q.y1); g.lineTo(q.x2, q.y2); g.stroke();
    }
  }

  function drawSlings() {
    T.slings.forEach(function (sl) {
      g.beginPath();
      g.moveTo(sl.p[0][0], sl.p[0][1]);
      g.lineTo(sl.p[1][0], sl.p[1][1]);
      g.lineTo(sl.p[2][0], sl.p[2][1]);
      g.closePath();
      g.fillStyle = '#1d2b45'; g.fill();
      g.lineWidth = 6; g.lineJoin = 'round';
      g.strokeStyle = sl.flash > 0 ? '#fff' : COL.mg;
      g.globalAlpha = sl.flash > 0 ? 1 : 0.85;
      g.stroke(); g.globalAlpha = 1;
    });
  }

  function drawBanks() {
    T.banks.forEach(function (b) {
      var dx = Math.cos(b.ang), dy = Math.sin(b.ang), nx = -dy, ny = dx;
      b.targets.forEach(function (t) {
        var down = t.down;
        g.save();
        g.translate(t.cx, t.cy);
        g.rotate(b.ang);
        var w = 16, hgt = down ? 2.5 : 8;
        g.fillStyle = down ? '#243349' : (t.flash > 0 ? '#ffffff' : COL.gr);
        g.fillRect(-w / 2, -hgt / 2, w, hgt);
        if (!down) {
          g.fillStyle = 'rgba(255,255,255,0.35)';
          g.fillRect(-w / 2, -hgt / 2, w, 2);
        }
        g.restore();
      });
      // bank base line
      g.strokeStyle = 'rgba(110,240,122,0.18)'; g.lineWidth = 1;
      var L = (b.targets.length * 21) / 2;
      g.beginPath();
      g.moveTo(b.x - dx * L + nx * 8, b.y - dy * L + ny * 8);
      g.lineTo(b.x + dx * L + nx * 8, b.y + dy * L + ny * 8);
      g.stroke();
    });
  }

  function drawPops() {
    T.pops.forEach(function (p) {
      var fl = p.flash;
      g.beginPath(); g.arc(p.x, p.y, p.r + 3 + fl * 5, 0, SS.TAU);
      g.fillStyle = 'rgba(79,216,255,' + (0.10 + fl * 0.4) + ')'; g.fill();
      g.beginPath(); g.arc(p.x, p.y, p.r, 0, SS.TAU);
      var gr = g.createRadialGradient(p.x - 4, p.y - 5, 2, p.x, p.y, p.r);
      gr.addColorStop(0, fl > 0 ? '#ffffff' : '#7ee6ff');
      gr.addColorStop(1, fl > 0 ? '#7ee6ff' : '#1c5f80');
      g.fillStyle = gr; g.fill();
      g.strokeStyle = COL.cy; g.lineWidth = 2; g.stroke();
      g.beginPath(); g.arc(p.x, p.y, 4.5, 0, SS.TAU);
      g.fillStyle = '#0b1520'; g.fill();
    });
    T.posts.forEach(function (p) {
      g.beginPath(); g.arc(p.x, p.y, p.r, 0, SS.TAU);
      g.fillStyle = p.flash > 0 ? '#fff' : '#c9d8ee'; g.fill();
      g.strokeStyle = '#6c7f9e'; g.lineWidth = 1.5; g.stroke();
    });
  }

  function drawSpinner() {
    var s = T.spinner; if (!s) return;
    g.save();
    g.translate(s.x, s.y);
    g.rotate(s.ang);
    g.strokeStyle = 'rgba(255,194,79,0.25)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, -s.r - 6); g.lineTo(0, s.r + 6); g.stroke();
    var sc = Math.abs(Math.cos(s.rot));
    g.fillStyle = Math.abs(s.vel) > 0.4 ? '#fff' : COL.am;
    g.fillRect(-s.r, -9 * sc - 1, s.r * 2, Math.max(1.5, 18 * sc));
    g.strokeStyle = COL.am; g.lineWidth = 1.6;
    g.strokeRect(-s.r, -9 * sc - 1, s.r * 2, Math.max(1.5, 18 * sc));
    g.restore();
    g.fillStyle = 'rgba(255,194,79,0.55)'; g.font = '8px ui-monospace,monospace'; g.textAlign = 'center';
    g.fillText('SPIN ' + s.spins, s.x, s.y + s.r + 18);
  }

  function drawHole() {
    var h = T.hole; if (!h) return;
    var lit = h.lit || S.mode.on;
    g.beginPath(); g.arc(h.x, h.y, h.r + 7 + h.flash * 6, 0, SS.TAU);
    g.fillStyle = lit ? 'rgba(255,90,168,' + (0.22 + 0.14 * Math.sin(S.t * 7)) + ')' : 'rgba(120,150,200,0.10)';
    g.fill();
    g.beginPath(); g.arc(h.x, h.y, h.r, 0, SS.TAU);
    g.fillStyle = '#05070c'; g.fill();
    g.strokeStyle = lit ? COL.mg : '#5a6d8d'; g.lineWidth = 2.5; g.stroke();
    g.fillStyle = lit ? COL.mg : '#5a6d8d';
    g.font = 'bold 8px ui-monospace,monospace'; g.textAlign = 'center';
    g.fillText(lit ? 'MISSION' : 'HOLE', h.x, h.y + h.r + 13);
  }

  function drawKick() {
    var k = T.kick;
    g.beginPath(); g.arc(k.x, k.y, k.r, 0, SS.TAU);
    g.fillStyle = k.charged ? 'rgba(255,194,79,' + (0.2 + k.flash * 0.6) + ')' : 'rgba(90,109,141,0.12)';
    g.fill();
    g.strokeStyle = k.charged ? COL.am : '#3d4a63'; g.lineWidth = 2; g.stroke();
    g.fillStyle = k.charged ? COL.am : '#3d4a63';
    g.font = 'bold 8px ui-monospace,monospace'; g.textAlign = 'center';
    g.fillText('KICK', k.x, k.y + 3);
  }

  function drawRamp() {
    var R = T.ramp; if (!R) return;
    var p = R.path;
    g.lineJoin = 'round'; g.lineCap = 'round';
    g.beginPath(); g.moveTo(p[0][0], p[0][1]);
    for (var i = 1; i < p.length; i++) g.lineTo(p[i][0], p[i][1]);
    g.strokeStyle = 'rgba(79,216,255,' + (0.13 + R.flash * 0.35) + ')'; g.lineWidth = 30; g.stroke();
    g.strokeStyle = 'rgba(10,16,28,0.82)'; g.lineWidth = 24; g.stroke();
    g.strokeStyle = 'rgba(143,168,204,0.45)'; g.lineWidth = 1.5; g.stroke();
    // mouth arrow
    var m = R.mouth;
    var lit = S.mode.on && MISSIONS[S.mode.idx].k === 'ramp';
    g.strokeStyle = lit ? COL.mg : COL.cy;
    g.globalAlpha = lit ? 0.6 + 0.4 * Math.sin(S.t * 8) : 0.7;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(m.x1 + 8, m.y1 + 16); g.lineTo((m.x1 + m.x2) / 2, m.y1 + 2); g.lineTo(m.x2 - 8, m.y1 + 16);
    g.stroke();
    g.globalAlpha = 1;
    g.fillStyle = lit ? COL.mg : 'rgba(79,216,255,0.7)';
    g.font = 'bold 9px ui-monospace,monospace'; g.textAlign = 'center';
    g.fillText('RAMP', (m.x1 + m.x2) / 2, m.y1 + 30);
  }

  function drawFlipper(f) {
    var a = f.angle;
    var ex = f.x + Math.cos(a) * f.len, ey = f.y + Math.sin(a) * f.len;
    g.lineCap = 'round';
    g.strokeStyle = S.tilt ? '#4a5468' : '#e8f1ff';
    g.lineWidth = f.r * 2;
    g.beginPath(); g.moveTo(f.x, f.y); g.lineTo(ex, ey); g.stroke();
    g.strokeStyle = S.tilt ? '#333c4d' : (f.on ? COL.am : '#8ea6c8');
    g.lineWidth = f.r * 2 - 5;
    g.beginPath(); g.moveTo(f.x, f.y); g.lineTo(ex, ey); g.stroke();
    g.beginPath(); g.arc(f.x, f.y, 4, 0, SS.TAU); g.fillStyle = '#0b111c'; g.fill();
  }

  function drawBall() {
    for (var i = 0; i < ball.trail.length; i++) {
      var t = ball.trail[i], a = (i + 1) / ball.trail.length;
      g.beginPath(); g.arc(t[0], t[1], ball.r * (0.35 + a * 0.6), 0, SS.TAU);
      g.fillStyle = 'rgba(200,225,255,' + (a * 0.16) + ')'; g.fill();
    }
    var gr = g.createRadialGradient(ball.x - 3.5, ball.y - 4, 1, ball.x, ball.y, ball.r);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.55, '#cfe0f5'); gr.addColorStop(1, '#5f7391');
    g.beginPath(); g.arc(ball.x, ball.y, ball.r, 0, SS.TAU);
    g.fillStyle = gr; g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 1; g.stroke();
  }

  function drawPlunger() {
    // lane plunger rod + power meter
    var pull = S.launchPow * 40;
    g.fillStyle = '#2a3a58';
    g.fillRect(394, 720 + pull * 0.2, 14, 10);
    g.fillStyle = '#8ea6c8';
    g.fillRect(399, 726, 4, 6);
    if (ball.state === 'ready') {
      var bx = 386, by = 560, bw = 30, bh = 150;
      g.fillStyle = 'rgba(10,16,28,0.75)'; g.fillRect(bx, by, bw, bh);
      g.strokeStyle = '#2c3d5c'; g.lineWidth = 1; g.strokeRect(bx, by, bw, bh);
      g.fillStyle = S.launchPow > 0.85 ? COL.mg : COL.am;
      g.fillRect(bx + 2, by + bh - 2 - (bh - 4) * S.launchPow, bw - 4, (bh - 4) * S.launchPow);
      g.save();
      g.translate(bx + bw / 2, by - 8);
      g.fillStyle = '#7d90b3'; g.font = 'bold 10px ui-monospace,monospace'; g.textAlign = 'center';
      g.fillText('PULL', 0, 0);
      g.restore();
    }
  }

  function drawPops2() {
    g.textAlign = 'center';
    for (var i = 0; i < pops.length; i++) {
      var p = pops[i];
      if (!p.txt) continue;
      g.globalAlpha = SS.clamp(p.life, 0, 1);
      g.fillStyle = p.col;
      g.font = 'bold 13px ui-monospace,monospace';
      g.fillText(p.txt, p.x, p.y);
    }
    g.globalAlpha = 1;
  }

  function drawOverlay() {
    if (!S.over) return;
    g.fillStyle = 'rgba(4,7,14,0.86)';
    g.fillRect(0, 0, CWID, CH);
    g.textAlign = 'center';
    g.fillStyle = COL.mg; g.font = 'bold 34px ui-monospace,monospace';
    g.fillText('GAME OVER', CWID / 2, 300);
    g.fillStyle = COL.wt; g.font = 'bold 44px ui-monospace,monospace';
    g.fillText(fmt(S.score), CWID / 2, 366);
    g.fillStyle = '#7d90b3'; g.font = '13px ui-monospace,monospace';
    g.fillText('TABLE ' + T.name, CWID / 2, 398);
    g.fillText('BEST ON THIS TABLE  ' + fmt(S.best), CWID / 2, 420);
    btn(65, 470, 300, 56, 'PLAY THIS TABLE', COL.cy);
    btn(65, 540, 300, 56, 'NEW TABLE', COL.am);
  }
  function btn(x, y, w, h, label, col) {
    g.fillStyle = 'rgba(20,32,54,0.95)'; roundRect(x, y, w, h, 10); g.fill();
    g.strokeStyle = col; g.lineWidth = 2; roundRect(x, y, w, h, 10); g.stroke();
    g.fillStyle = col; g.font = 'bold 17px ui-monospace,monospace'; g.textAlign = 'center';
    g.fillText(label, x + w / 2, y + h / 2 + 6);
  }

  function render() {
    g.setTransform(view.f, 0, 0, view.f, 0, 0);
    g.clearRect(0, 0, CWID, CH);
    g.fillStyle = '#07080d'; g.fillRect(0, 0, CWID, CH);
    drawHUD();
    g.save();
    g.beginPath(); g.rect(0, HUD, CWID, TH); g.clip();
    var sx = (Math.random() - 0.5) * shake + nudgeOff.x;
    var sy = (Math.random() - 0.5) * shake + nudgeOff.y;
    g.translate(sx, HUD + sy);
    drawPlayfield();
    drawSegs();
    drawSlings();
    drawBanks();
    drawPops();
    drawSpinner();
    drawHole();
    drawKick();
    drawPlunger();
    drawFlipper(T.flipL); drawFlipper(T.flipR);
    if (ball.state !== 'ramp') drawBall();
    drawRamp();
    if (ball.state === 'ramp') drawBall();
    parts.draw(g);
    drawPops2();
    if (S.tilt) {
      g.fillStyle = 'rgba(255,60,60,0.10)'; g.fillRect(0, 0, CWID, TH);
      g.fillStyle = '#ff5a5a'; g.font = 'bold 40px ui-monospace,monospace'; g.textAlign = 'center';
      g.fillText('TILT', 195, 380);
    }
    g.restore();
    drawOverlay();
  }

  /* ---------------- loop ---------------- */
  var last = 0;
  function frame(ts) {
    if (!last) last = ts;
    var dt = (ts - last) / 1000; last = ts;
    if (dt > 0.05) dt = 0.05;
    if (S.plunging && ball.state === 'ready') S.launchPow = SS.clamp(S.launchPow + dt * 1.3, 0, 1);
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  SS.debug = function () { return { S: S, ball: ball, T: T, nudge: nudge, launch: launch }; };

  /* ---------------- boot ---------------- */
  var stored = SS.lastSeed();
  var startSeed = stored ? (parseInt(stored, 10) >>> 0) : ((Math.random() * 4294967295) >>> 0);
  if (!startSeed) startSeed = 12345;
  newGame(startSeed);
  resize();
  requestAnimationFrame(frame);
})(SS);
