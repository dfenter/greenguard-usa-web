/* Skyhammer - game */
(function (SH) {
  'use strict';
  var ctx = SH.ctx, view = SH.view, input = SH.input, TAU = SH.TAU, clamp = SH.clamp;

  var BEST_KEY = 'skyhammer.best.v1';
  var best = 0;
  try { best = parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0; } catch (e) { best = 0; }
  function saveBest(v) { try { localStorage.setItem(BEST_KEY, String(v)); } catch (e) { } }

  var G = null;
  var stars = [];
  var shake = 0, shakeT = 0, flash = 0, hitFlash = 0;
  var soundCd = 0, grazeCd = 0;

  function W() { return view.W; }
  function H() { return view.H; }

  /* ---------------- setup ---------------- */
  function makeStars() {
    stars.length = 0;
    for (var i = 0; i < 64; i++) {
      stars.push({ x: Math.random() * 360, y: Math.random() * 800, s: 0.6 + Math.random() * 1.8, v: 20 + Math.random() * 90 });
    }
  }
  makeStars();

  function newGame() {
    input.keys = Object.create(null); input.pointers.length = 0; input.anyInput = false; SH.parts.length = 0; shake = 0; shakeT = 0; flash = 0; hitFlash = 0; soundCd = 0; grazeCd = 0;
    G = {
      state: 'play',
      t: 0, stageT: 0, stageIdx: 0,
      stage: SH.makeStage(0),
      waveIdx: 0,
      score: 0, meter: 0, grazes: 0,
      lives: 3, bombs: 3,
      p: {
        x: 180, y: H() - 130, vx: 0, vy: 0, r: 2.6,
        fire: 0, focus: false, inv: 2.0, alive: true, hurt: 0
      },
      eb: [], pb: [], en: [], boss: null,
      bossWarn: 0, banner: 'STAGE 1 — ' + SH.makeStage(0).theme.name, bannerT: 2.6,
      intro: 5.0, overT: 0, bombFx: 0, driveId: null, dragX: 0, dragY: 0, anchorX: 0, anchorY: 0,
      bossDeath: 0, clearT: 0
    };
  }

  function beginStage(i) {
    G.stageIdx = i;
    G.stage = SH.makeStage(i);
    G.stageT = 0; G.waveIdx = 0;
    G.en.length = 0; G.eb.length = 0; G.pb.length = 0;
    G.boss = null; G.bossWarn = 0; G.bossDeath = 0;
    G.bombs = 3;
    G.banner = 'STAGE ' + (i + 1) + ' — ' + G.stage.theme.name;
    G.bannerT = 2.6;
    G.p.inv = Math.max(G.p.inv, 1.5);
  }

  /* ---------------- input wiring ---------------- */
  function bombBtn() { return { x: W() - 44, y: H() - 54, r: 32 }; }

  input.onDown = function (p) {
    if (G.state === 'over' || G.state === 'win') { if (G.overT > 0.6) { newGame(); input.pointers.push(p); G.driveId = p.id; G.anchorX = p.x; G.anchorY = p.y; } return; }
    var b = bombBtn();
    if ((p.x - b.x) * (p.x - b.x) + (p.y - b.y) * (p.y - b.y) < (b.r + 12) * (b.r + 12)) {
      p.bomb = true; useBomb(); return;
    }
    if (G.driveId === null) {
      G.driveId = p.id;
      G.anchorX = p.x; G.anchorY = p.y;
      G.dragX = G.p.x; G.dragY = G.p.y;
    }
  };
  input.onUp = function (p) {
    if (p.id === G.driveId) {
      G.driveId = null;
      // promote another non-bomb pointer to drive
      for (var i = 0; i < input.pointers.length; i++) {
        var q = input.pointers[i];
        if (!q.bomb) { G.driveId = q.id; G.anchorX = q.x; G.anchorY = q.y; G.dragX = G.p.x; G.dragY = G.p.y; break; }
      }
    }
  };
  input.onKey = function (code) {
    if (G.state === 'over' || G.state === 'win') {
      if ((code === 'Enter' || code === 'Space' || code === 'KeyR') && G.overT > 0.6) newGame();
      return;
    }
    if (code === 'Space' || code === 'KeyZ' || code === 'KeyX') useBomb();
  };
  input.onBlur = function () { if (G) { G.driveId = null; G.anchorX = 0; G.anchorY = 0; } };

  function key(a, b, c) { return input.keys[a] || input.keys[b] || input.keys[c]; }

  /* ---------------- helpers ---------------- */
  function eb(x, y, a, sp, r, c, curve, acc) {
    if (G.eb.length > 1200) return;
    G.eb.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: r, c: c, gz: 0, cu: curve || 0, ac: acc || 0 });
  }
  function pb(x, y, vx, vy, d) {
    if (G.pb.length >= 400) return;
    G.pb.push({ x: x, y: y, vx: vx, vy: vy, d: d });
  }
  function mult() { return 1 + Math.min(7, G.meter * 0.08); }
  function addScore(v) { G.score += Math.round(v); }

  function sfx(name) {
    if (soundCd > 0 && (name === 'shot' || name === 'hit')) return;
    if (name === 'shot') { SH.tone(880, 0.045, 'square', 0.035, 620); soundCd = 0.05; }
    else if (name === 'hit') { SH.tone(320, 0.04, 'square', 0.05, 200); soundCd = 0.03; }
    else if (name === 'boom') { SH.noise(0.32, 0.4, 1800); SH.tone(160, 0.28, 'sawtooth', 0.14, 50); }
    else if (name === 'death') { SH.noise(0.6, 0.5, 900); SH.tone(220, 0.6, 'sawtooth', 0.2, 40); }
    else if (name === 'bomb') { SH.noise(0.8, 0.5, 2600); SH.tone(90, 0.7, 'sawtooth', 0.22, 35); }
    else if (name === 'graze') { SH.tone(1650, 0.03, 'sine', 0.03); }
    else if (name === 'warn') { SH.tone(440, 0.18, 'square', 0.09, 660); }
    else if (name === 'clear') { SH.tone(523, 0.14, 'triangle', 0.16); SH.tone(784, 0.3, 'triangle', 0.14); }
  }

  function useBomb() {
    if (G.state !== 'play' || G.bombs <= 0 || !G.p.alive) return;
    G.bombs--;
    G.bombFx = 0.75;
    G.p.inv = Math.max(G.p.inv, 1.8);
    shake = Math.max(shake, 12); shakeT = 0.5; flash = 0.7;
    sfx('bomb');
    for (var i = 0; i < G.eb.length; i++) {
      var b = G.eb[i];
      addScore(20 * mult());
      if (i % 3 === 0) SH.spawnParts(b.x, b.y, 1, b.c, 70, 3, 0.35);
    }
    G.eb.length = 0;
    for (var j = G.en.length - 1; j >= 0; j--) damageEnemy(G.en[j], 42, j);
    if (G.boss && G.boss.state === 'fight') {
      G.boss.hp -= 90;
      for (var k = 0; k < G.boss.pods.length; k++) if (G.boss.pods[k].hp > 0) G.boss.pods[k].hp -= 60;
      SH.spawnParts(G.boss.x, G.boss.y, 14, '#ffffff', 130, 3, 0.5);
    }
  }

  /* ---------------- patterns ---------------- */
  function aimAt(x, y) { return Math.atan2(G.p.y - y, G.p.x - x); }

  function runPattern(o, pat, dt) {
    if (!pat) return;
    if (o.sa === undefined) { o.sa = Math.random() * TAU; o.ft = pat.period * 0.5; o.bl = 0; o.bt = 0; o.wr = SH.rngObj(pat.seed || 7); }
    var k = pat.kind;
    if (k === 'spiral' || k === 'arms') {
      o.sa += pat.rate * dt;
      o.ft -= dt;
      if (o.ft <= 0) {
        o.ft += pat.period;
        var arms = pat.arms;
        for (var i = 0; i < arms; i++) {
          var a = o.sa + i * TAU / arms;
          if (pat.sweep) a += Math.sin(o.sa * 0.5) * 0.6;
          eb(o.x, o.y, a, pat.speed, pat.r, pat.c);
        }
      }
      return;
    }
    o.ft -= dt;
    if (o.ft <= 0) {
      o.ft += pat.period;
      if (k === 'aimed') { o.bl = pat.burst || 1; o.bt = 0; }
      else if (k === 'fan') {
        var base = aimAt(o.x, o.y), n = pat.n;
        for (var f = 0; f < n; f++) {
          var ang = base + (f / (n - 1) - 0.5) * pat.spread;
          eb(o.x, o.y, ang, pat.speed, pat.r, pat.c);
        }
      } else if (k === 'ring') {
        var off = pat.aim ? aimAt(o.x, o.y) : 0;
        o.sa = (o.sa || 0) + (pat.spin || 0);
        for (var g = 0; g < pat.n; g++) {
          eb(o.x, o.y, off + o.sa + g * TAU / pat.n, pat.speed, pat.r, pat.c);
        }
      } else if (k === 'wall') {
        var gc = 40 + o.wr.r() * (W() - 80);
        var step = W() / pat.count;
        for (var w = 0; w < pat.count; w++) {
          var wx = step * 0.5 + w * step;
          if (Math.abs(wx - gc) < pat.gap * 0.5) continue;
          eb(wx, o.y, Math.PI / 2, pat.speed, pat.r, pat.c);
        }
      } else if (k === 'rain') {
        var rx = 16 + o.wr.r() * (W() - 32);
        eb(rx, -8, Math.PI / 2 + (o.wr.r() - 0.5) * 0.5, pat.speed, pat.r, pat.c);
      }
    }
    if (o.bl > 0) {
      o.bt -= dt;
      if (o.bt <= 0) {
        o.bt = 0.1;
        o.bl--;
        var b0 = aimAt(o.x, o.y), nn = pat.n;
        for (var q = 0; q < nn; q++) {
          var aa = b0 + (nn === 1 ? 0 : (q / (nn - 1) - 0.5) * pat.spread * nn * 0.5);
          eb(o.x, o.y, aa, pat.speed, pat.r, pat.c);
        }
      }
    }
  }

  /* ---------------- spawning ---------------- */
  function spawnWave(wv) {
    for (var i = 0; i < wv.list.length; i++) {
      var d = wv.list[i];
      G.en.push({
        x: d.x, y: d.y, tx: d.tx, ty: d.ty, speed: d.speed, hold: d.hold,
        ovx: d.ovx, ovy: d.ovy, hp: d.hp, maxhp: d.hp, r: d.r, kind: d.kind,
        color: d.color, pat: d.pat, score: d.score, sway: d.sway,
        st: 'wait', wait: d.delay, life: 0, flash: 0, rot: Math.random() * TAU
      });
    }
  }

  function spawnBoss() {
    var bs = G.stage.boss;
    G.boss = {
      name: bs.name, def: bs, phaseIdx: 0,
      hp: bs.phases[0].hp, maxhp: bs.phases[0].hp,
      x: W() * 0.5, y: -70, t: 0, state: 'enter',
      moveIdx: 0, moveT: 0, flash: 0,
      pods: [], sub: {}, ph: 0
    };
    makePods();
  }
  function makePods() {
    var ph = G.boss.def.phases[G.boss.phaseIdx];
    G.boss.pods = [];
    for (var i = 0; i < ph.pods; i++) {
      G.boss.pods.push({ ox: (i === 0 ? -48 : 48), oy: 8, hp: ph.podHP, maxhp: ph.podHP, r: 13, flash: 0, o: {} });
    }
  }

  /* ---------------- damage ---------------- */
  function damageEnemy(e, d, idx) {
    e.hp -= d; e.flash = 0.09;
    if (e.hp <= 0) {
      addScore(e.score * mult());
      SH.spawnParts(e.x, e.y, 14, e.color, 150, 3.5, 0.55);
      SH.spawnParts(e.x, e.y, 6, '#ffffff', 90, 2.5, 0.3);
      shake = Math.max(shake, 4); shakeT = Math.max(shakeT, 0.16);
      sfx('boom');
      G.en.splice(idx === undefined ? G.en.indexOf(e) : idx, 1);
    }
  }

  function playerHit() {
    var p = G.p;
    if (p.inv > 0 || !p.alive || G.state !== 'play') return;
    G.lives--;
    G.meter = 0;
    p.inv = 2.6; p.hurt = 0.5;
    shake = 16; shakeT = 0.6; flash = 0.5; hitFlash = 0.6;
    sfx('death');
    SH.spawnParts(p.x, p.y, 30, '#7ef9ff', 190, 4, 0.7);
    SH.spawnParts(p.x, p.y, 16, '#ffffff', 120, 3, 0.5);
    G.eb.length = 0;
    G.bombs = 3;
    p.x = W() * 0.5; p.y = H() - 120;
    G.driveId = null;
    if (G.lives <= 0) {
      G.state = 'over'; G.overT = 0;
      if (G.score > best) { best = G.score; saveBest(best); }
    }
  }

  /* ---------------- update ---------------- */
  function update(dt) {
    G.t += dt;
    if (soundCd > 0) soundCd -= dt;
    if (grazeCd > 0) grazeCd -= dt;
    if (shakeT > 0) { shakeT -= dt; if (shakeT <= 0) shake = 0; } else shake *= Math.pow(0.02, dt);
    flash = Math.max(0, flash - dt * 2.2);
    hitFlash = Math.max(0, hitFlash - dt * 1.6);
    if (G.bombFx > 0) G.bombFx -= dt;
    if (G.bannerT > 0) G.bannerT -= dt;
    if (G.intro > 0) G.intro -= dt;
    SH.updateParts(dt);

    for (var s = 0; s < stars.length; s++) {
      var st = stars[s];
      st.y += st.v * dt * (1 + G.stageIdx * 0.15);
      if (st.y > H() + 4) { st.y = -4; st.x = Math.random() * W(); }
    }

    if (G.state === 'over' || G.state === 'win') { G.overT += dt; return; }

    if (G.state === 'clear') {
      G.clearT -= dt;
      updateBullets(dt, true);
      if (G.clearT <= 0) {
        if (G.stageIdx >= 2) {
          G.state = 'win'; G.overT = 0;
          if (G.score > best) { best = G.score; saveBest(best); }
        } else { G.state = 'play'; beginStage(G.stageIdx + 1); }
      }
      return;
    }

    G.stageT += dt;
    G.meter = Math.max(0, G.meter - 5 * dt);
    updatePlayer(dt);

    // waves
    var stg = G.stage;
    while (G.waveIdx < stg.waves.length && G.stageT >= stg.waves[G.waveIdx].t) {
      spawnWave(stg.waves[G.waveIdx]); G.waveIdx++;
    }
    if (!G.boss && G.waveIdx >= stg.waves.length && G.stageT >= stg.bossAt) {
      if (G.bossWarn === 0) { G.bossWarn = 2.2; sfx('warn'); }
    }
    if (G.bossWarn > 0 && !G.boss) {
      G.bossWarn -= dt;
      if (G.bossWarn <= 0) { spawnBoss(); G.bossWarn = 0; }
    }

    updateEnemies(dt);
    updateBoss(dt);
    updateBullets(dt, false);
    collide();
  }

  function updatePlayer(dt) {
    var p = G.p;
    if (p.inv > 0) p.inv -= dt;
    if (p.hurt > 0) p.hurt -= dt;

    // focus: 2nd finger down, or shift
    var extra = 0;
    for (var i = 0; i < input.pointers.length; i++) if (!input.pointers[i].bomb && input.pointers[i].id !== G.driveId) extra++;
    p.focus = extra > 0 || !!(input.keys['ShiftLeft'] || input.keys['ShiftRight']);

    // relative drag: ship follows the finger 1:1 from wherever it was grabbed
    if (G.driveId !== null) {
      var d = null;
      for (var j = 0; j < input.pointers.length; j++) if (input.pointers[j].id === G.driveId) d = input.pointers[j];
      if (d) {
        var f = p.focus ? 0.42 : 1;
        p.x += (d.x - G.anchorX) * f;
        p.y += (d.y - G.anchorY) * f;
        G.anchorX = d.x; G.anchorY = d.y;
        G.dragX = p.x; G.dragY = p.y;
      }
    }
    // keyboard
    var kx = (key('ArrowRight', 'KeyD') ? 1 : 0) - (key('ArrowLeft', 'KeyA') ? 1 : 0);
    var ky = (key('ArrowDown', 'KeyS') ? 1 : 0) - (key('ArrowUp', 'KeyW') ? 1 : 0);
    if (kx || ky) {
      var m = Math.sqrt(kx * kx + ky * ky) || 1;
      var sp = p.focus ? 108 : 258;
      p.x += (kx / m) * sp * dt; p.y += (ky / m) * sp * dt;
      G.dragX = p.x; G.dragY = p.y;
    }
    p.x = clamp(p.x, 10, W() - 10);
    p.y = clamp(p.y, 20, H() - 16);

    // auto fire
    p.fire -= dt;
    if (p.fire <= 0) {
      if (p.focus) {
        p.fire = 0.07;
        pb(p.x, p.y - 10, 0, -760, 1.5);
        pb(p.x - 5, p.y - 6, 0, -740, 1.1);
        pb(p.x + 5, p.y - 6, 0, -740, 1.1);
      } else {
        p.fire = 0.085;
        pb(p.x - 6, p.y - 8, 0, -700, 1.2);
        pb(p.x + 6, p.y - 8, 0, -700, 1.2);
        pb(p.x - 9, p.y - 4, -150, -640, 0.7);
        pb(p.x + 9, p.y - 4, 150, -640, 0.7);
      }
      sfx('shot');
    }
  }

  function updateEnemies(dt) {
    for (var i = G.en.length - 1; i >= 0; i--) {
      var e = G.en[i];
      e.life += dt;
      if (e.flash > 0) e.flash -= dt;
      e.rot += dt * 1.6;
      if (e.st === 'wait') {
        e.wait -= dt;
        if (e.wait <= 0) e.st = 'in';
        continue;
      }
      if (e.st === 'in') {
        var dx = e.tx - e.x, dy = e.ty - e.y, d = Math.sqrt(dx * dx + dy * dy);
        if (d < 3) { e.st = 'hold'; e.holdT = e.hold; e.x = e.tx; e.y = e.ty; }
        else { e.x += dx / d * e.speed * dt; e.y += dy / d * e.speed * dt; }
      } else if (e.st === 'hold') {
        e.holdT -= dt;
        if (e.sway) e.x = e.tx + Math.sin(e.life * 1.5) * 26;
        if (e.holdT <= 0) e.st = 'out';
      } else {
        e.x += e.ovx * dt; e.y += e.ovy * dt;
      }
      if (e.y > 12 && e.st !== 'out') runPattern(e, e.pat, dt);
      if (e.y > H() + 50 || e.x < -70 || e.x > W() + 70) G.en.splice(i, 1);
    }
  }

  function updateBoss(dt) {
    var b = G.boss;
    if (!b) return;
    b.t += dt;
    if (b.flash > 0) b.flash -= dt;
    if (b.state === 'enter') {
      b.y += 90 * dt;
      if (b.y >= 104) { b.y = 104; b.state = 'fight'; b.moveT = 0; b.moveIdx = 0; b.sub = {}; }
      return;
    }
    if (b.state === 'dying') {
      b.dieT -= dt;
      if (Math.random() < 0.5) {
        SH.spawnParts(b.x + (Math.random() - 0.5) * 80, b.y + (Math.random() - 0.5) * 46, 5, '#ffdca8', 160, 4, 0.6);
      }
      shake = Math.max(shake, 7); shakeT = Math.max(shakeT, 0.2);
      if (b.dieT <= 0) {
        SH.spawnParts(b.x, b.y, 60, '#ffffff', 260, 5, 0.9);
        sfx('bomb'); flash = 1;
        addScore(20000 + G.lives * 5000 + G.bombs * 2000);
        G.boss = null; G.eb.length = 0;
        G.state = 'clear'; G.clearT = 2.8;
        G.banner = G.stageIdx >= 2 ? 'ALL CLEAR' : 'STAGE ' + (G.stageIdx + 1) + ' CLEAR';
        G.bannerT = 2.8; sfx('clear');
      }
      return;
    }
    if (b.state === 'break') {
      b.brk -= dt;
      b.y = 104 - Math.sin(Math.max(0, b.brk) * 3) * 6;
      if (b.brk <= 0) {
        b.phaseIdx++;
        var ph = b.def.phases[b.phaseIdx];
        b.hp = ph.hp; b.maxhp = ph.hp;
        makePods();
        b.state = 'fight'; b.moveIdx = 0; b.moveT = 0; b.sub = {};
      }
      return;
    }

    // fight movement
    var sp = 0.42 + b.phaseIdx * 0.16;
    b.x = W() * 0.5 + Math.sin(b.t * sp) * (86 - b.phaseIdx * 6);
    b.y = 104 + Math.sin(b.t * sp * 1.7) * 12;

    var ph2 = b.def.phases[b.phaseIdx];
    var mv = ph2.moves[b.moveIdx % ph2.moves.length];
    b.moveT += dt;
    if (b.moveT > mv.dur) {
      b.moveT = 0; b.moveIdx++; b.sub = {};
      G.eb.length = Math.min(G.eb.length, 900);
    }
    // pods alive scale fire
    var alive = 0;
    for (var i = 0; i < b.pods.length; i++) if (b.pods[i].hp > 0) alive++;
    var rate = 1 - 0.22 * (b.pods.length - alive);

    var src = b.sub;
    src.x = b.x; src.y = b.y + 8;
    if (src.sa === undefined) { src.sa = 0; src.ft = 0.25; src.bl = 0; src.bt = 0; src.wr = SH.rngObj(mv.seed || 11); }
    runPattern(src, mv, dt * rate);

    // pods fire a simple aimed pop
    for (var k = 0; k < b.pods.length; k++) {
      var pod = b.pods[k];
      if (pod.hp <= 0) continue;
      if (pod.flash > 0) pod.flash -= dt;
      var o = pod.o;
      o.x = b.x + pod.ox; o.y = b.y + pod.oy;
      if (o.sa === undefined) { o.sa = 0; o.ft = 1.2 + k * 0.4; o.bl = 0; o.bt = 0; o.wr = SH.rngObj(31 + k); }
      runPattern(o, {
        kind: 'aimed', period: 1.5 - G.stageIdx * 0.2, n: 2 + G.stageIdx, spread: 0.16,
        burst: 1, speed: 120 + G.stageIdx * 20, c: '#ff9ad1', r: 3.6
      }, dt);
    }
  }

  function updateBullets(dt, freeze) {
    var i, b;
    for (i = G.pb.length - 1; i >= 0; i--) {
      b = G.pb[i];
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.y < -20 || b.x < -20 || b.x > W() + 20) G.pb.splice(i, 1);
    }
    for (i = G.eb.length - 1; i >= 0; i--) {
      b = G.eb[i];
      if (b.cu) {
        var c = Math.cos(b.cu * dt), s = Math.sin(b.cu * dt);
        var nx = b.vx * c - b.vy * s, ny = b.vx * s + b.vy * c;
        b.vx = nx; b.vy = ny;
      }
      if (b.ac) { b.vx *= 1 + b.ac * dt; b.vy *= 1 + b.ac * dt; }
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.x < -30 || b.x > W() + 30 || b.y < -46 || b.y > H() + 40) G.eb.splice(i, 1);
    }
  }

  function collide() {
    var i, j, b, e, dx, dy, p = G.p;
    // player bullets vs enemies / boss
    for (i = G.pb.length - 1; i >= 0; i--) {
      b = G.pb[i];
      var gone = false;
      for (j = G.en.length - 1; j >= 0; j--) {
        e = G.en[j];
        if (e.st === 'wait') continue;
        dx = b.x - e.x; dy = b.y - e.y;
        if (dx * dx + dy * dy < e.r * e.r) {
          damageEnemy(e, b.d, j);
          SH.spawnParts(b.x, b.y, 1, '#fff2a8', 60, 2, 0.18);
          sfx('hit');
          gone = true; break;
        }
      }
      if (gone) { G.pb.splice(i, 1); continue; }
      var bo = G.boss;
      if (bo && (bo.state === 'fight' || bo.state === 'break')) {
        var hitPod = false;
        for (var k = 0; k < bo.pods.length; k++) {
          var pod = bo.pods[k];
          if (pod.hp <= 0) continue;
          dx = b.x - (bo.x + pod.ox); dy = b.y - (bo.y + pod.oy);
          if (dx * dx + dy * dy < pod.r * pod.r) {
            pod.hp -= b.d; pod.flash = 0.08;
            addScore(b.d * 6 * mult());
            SH.spawnParts(b.x, b.y, 1, '#fff2a8', 60, 2, 0.18);
            if (pod.hp <= 0) {
              SH.spawnParts(bo.x + pod.ox, bo.y + pod.oy, 22, '#ffd0a0', 180, 4, 0.65);
              addScore(3000 * mult()); sfx('boom');
              shake = Math.max(shake, 8); shakeT = 0.25;
            }
            hitPod = true; break;
          }
        }
        if (hitPod) { G.pb.splice(i, 1); continue; }
        if (bo.state === 'fight') {
          dx = b.x - bo.x; dy = (b.y - bo.y) * 1.5;
          if (dx * dx + dy * dy < 34 * 34) {
            var podsLeft = 0;
            for (var q = 0; q < bo.pods.length; q++) if (bo.pods[q].hp > 0) podsLeft++;
            var dmg = b.d * (podsLeft === 0 ? 1.35 : 1);
            bo.hp -= dmg; bo.flash = 0.06;
            addScore(dmg * 8 * mult());
            SH.spawnParts(b.x, b.y, 1, '#fff2a8', 60, 2, 0.2);
            sfx('hit');
            G.pb.splice(i, 1);
            if (bo.hp <= 0) {
              if (bo.phaseIdx >= bo.def.phases.length - 1) {
                bo.state = 'dying'; bo.dieT = 1.7; G.eb.length = 0; sfx('boom');
              } else {
                bo.state = 'break'; bo.brk = 1.5; G.eb.length = 0;
                flash = 0.6; shake = 14; shakeT = 0.5; sfx('boom');
                SH.spawnParts(bo.x, bo.y, 36, '#ffffff', 200, 4, 0.7);
                addScore(6000 * mult());
              }
            }
            continue;
          }
        }
      }
    }

    // enemy bullets vs player (graze + hit)
    if (!p.alive) return;
    for (i = G.eb.length - 1; i >= 0; i--) {
      b = G.eb[i];
      dx = b.x - p.x; dy = b.y - p.y;
      var d2 = dx * dx + dy * dy;
      var hr = b.r + p.r;
      if (d2 < hr * hr) {
        if (p.inv <= 0) { playerHit(); return; }
      } else {
        var gr = b.r + (p.focus ? 15 : 12);
        if (!b.gz && d2 < gr * gr && p.inv <= 0) {
          b.gz = 1; G.grazes++;
          G.meter = Math.min(90, G.meter + 2.5);
          addScore(30 * mult());
          if (grazeCd <= 0) { sfx('graze'); grazeCd = 0.05; }
          SH.spawnParts(b.x, b.y, 1, '#ffffff', 40, 2, 0.2);
        }
      }
    }
    // body collision with enemies
    for (j = G.en.length - 1; j >= 0; j--) {
      e = G.en[j];
      if (e.st === 'wait') continue;
      dx = e.x - p.x; dy = e.y - p.y;
      if (dx * dx + dy * dy < (e.r + p.r) * (e.r + p.r)) { if (p.inv <= 0) { playerHit(); return; } }
    }
    var bb = G.boss;
    if (bb && bb.state === 'fight') {
      dx = bb.x - p.x; dy = (bb.y - p.y) * 1.4;
      if (dx * dx + dy * dy < 30 * 30 && p.inv <= 0) playerHit();
    }
  }

  /* ---------------- draw ---------------- */
  function drawBG() {
    var th = G.stage.theme;
    var g = ctx.createLinearGradient(0, 0, 0, H());
    g.addColorStop(0, th.sky[0]); g.addColorStop(1, th.sky[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W(), H());
    // parallax bands
    ctx.fillStyle = th.band;
    ctx.globalAlpha = 0.25;
    for (var i = 0; i < 5; i++) {
      var y = ((G.t * (18 + i * 12) + i * 190) % (H() + 240)) - 120;
      var w = 90 + i * 34;
      ctx.fillRect(((i * 97) % W()) - w * 0.2, y, w, 5);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = th.star;
    for (var s = 0; s < stars.length; s++) {
      var st = stars[s];
      ctx.globalAlpha = 0.25 + st.s * 0.28;
      ctx.fillRect(st.x, st.y, st.s, st.s * 2.2);
    }
    ctx.globalAlpha = 1;
  }

  function drawShip(x, y, focus, alpha) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#0d1b2c';
    ctx.beginPath();
    ctx.moveTo(x, y - 14); ctx.lineTo(x + 11, y + 10); ctx.lineTo(x, y + 5); ctx.lineTo(x - 11, y + 10);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = focus ? '#ffd166' : '#7ef9ff';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.fillStyle = focus ? '#ffd166' : '#7ef9ff';
    ctx.beginPath(); ctx.moveTo(x, y - 10); ctx.lineTo(x + 4, y + 3); ctx.lineTo(x - 4, y + 3); ctx.closePath(); ctx.fill();
    // thruster
    ctx.globalAlpha = alpha * (0.5 + Math.random() * 0.5);
    ctx.fillStyle = '#ff9a5c';
    ctx.fillRect(x - 2, y + 8, 4, 6 + Math.random() * 5);
    ctx.globalAlpha = alpha;
    if (focus) {
      ctx.strokeStyle = 'rgba(255,209,102,0.85)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, 13, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(x, y, 3, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawEnemy(e) {
    var c = e.flash > 0 ? '#ffffff' : e.color;
    ctx.fillStyle = c;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 1.5;
    ctx.save();
    ctx.translate(e.x, e.y);
    if (e.kind === 'drone') {
      ctx.beginPath();
      ctx.moveTo(0, e.r); ctx.lineTo(e.r, -e.r * 0.7); ctx.lineTo(0, -e.r * 0.2); ctx.lineTo(-e.r, -e.r * 0.7);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (e.kind === 'pod') {
      ctx.beginPath(); ctx.ellipse(0, 0, e.r, e.r * 0.78, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath(); ctx.arc(0, 0, e.r * 0.4, 0, TAU); ctx.fill();
    } else if (e.kind === 'orb') {
      ctx.rotate(e.rot);
      ctx.beginPath();
      for (var i = 0; i < 6; i++) {
        var a = i * TAU / 6;
        ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * e.r, Math.sin(a) * e.r);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath(); ctx.arc(0, 0, e.r * 0.3, 0, TAU); ctx.fill();
    } else {
      ctx.fillRect(-e.r, -e.r * 0.8, e.r * 2, e.r * 1.6);
      ctx.strokeRect(-e.r, -e.r * 0.8, e.r * 2, e.r * 1.6);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(-e.r * 0.5, -e.r * 0.3, e.r, e.r * 0.6);
    }
    ctx.restore();
    // hp pip
    if (e.hp < e.maxhp) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(e.x - e.r, e.y - e.r - 6, e.r * 2, 2.5);
      ctx.fillStyle = '#8dff9c';
      ctx.fillRect(e.x - e.r, e.y - e.r - 6, e.r * 2 * Math.max(0, e.hp / e.maxhp), 2.5);
    }
  }

  function drawBoss() {
    var b = G.boss;
    if (!b) return;
    var bf = b.flash > 0;
    ctx.save();
    ctx.translate(b.x, b.y);
    // arms
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(-48, 8); ctx.lineTo(48, 8); ctx.stroke();
    // body
    ctx.fillStyle = bf ? '#ffffff' : '#22304f';
    ctx.strokeStyle = ['#ff8ab5', '#ffd166', '#7ef9ff'][b.phaseIdx];
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(0, -30); ctx.lineTo(30, -8); ctx.lineTo(22, 26); ctx.lineTo(-22, 26); ctx.lineTo(-30, -8);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = bf ? '#ffffff' : ['#ff8ab5', '#ffd166', '#7ef9ff'][b.phaseIdx];
    ctx.beginPath(); ctx.arc(0, 0, 9 + Math.sin(b.t * 5) * 1.5, 0, TAU); ctx.fill();
    ctx.restore();
    // pods
    for (var i = 0; i < b.pods.length; i++) {
      var p = b.pods[i];
      if (p.hp <= 0) continue;
      var px = b.x + p.ox, py = b.y + p.oy;
      ctx.save(); ctx.translate(px, py); ctx.rotate(b.t * 1.2 * (i ? -1 : 1));
      ctx.fillStyle = p.flash > 0 ? '#ffffff' : '#3b2a52';
      ctx.strokeStyle = '#ffb14c'; ctx.lineWidth = 2;
      ctx.beginPath();
      for (var k = 0; k < 6; k++) {
        var a = k * TAU / 6;
        ctx[k ? 'lineTo' : 'moveTo'](Math.cos(a) * p.r, Math.sin(a) * p.r);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(px - 13, py - 20, 26, 3);
      ctx.fillStyle = '#ffb14c';
      ctx.fillRect(px - 13, py - 20, 26 * Math.max(0, p.hp / p.maxhp), 3);
    }
  }

  function drawBullets() {
    var buckets = {}, i, b;
    for (i = 0; i < G.eb.length; i++) {
      b = G.eb[i];
      (buckets[b.c] || (buckets[b.c] = [])).push(b);
    }
    for (var c in buckets) {
      var arr = buckets[c];
      ctx.fillStyle = c;
      ctx.beginPath();
      for (i = 0; i < arr.length; i++) {
        b = arr[i];
        ctx.moveTo(b.x + b.r, b.y);
        ctx.arc(b.x, b.y, b.r, 0, TAU);
      }
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    for (i = 0; i < G.eb.length; i++) {
      b = G.eb[i];
      ctx.moveTo(b.x + b.r * 0.45, b.y);
      ctx.arc(b.x, b.y, b.r * 0.45, 0, TAU);
    }
    ctx.fill();
    // player shots
    ctx.fillStyle = '#fff3a6';
    for (i = 0; i < G.pb.length; i++) {
      b = G.pb[i];
      ctx.fillRect(b.x - 1.6, b.y - 7, 3.2, 10);
    }
  }

  function txt(s, x, y, size, color, align, weight) {
    ctx.font = (weight || 'bold') + ' ' + size + 'px ui-monospace, Menlo, Consolas, monospace';
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = color;
    ctx.fillText(s, x, y);
  }

  function drawHUD() {
    var w = W(), h = H();
    // top strip
    ctx.fillStyle = 'rgba(4,6,14,0.55)';
    ctx.fillRect(0, 0, w, 34);
    txt(String(G.score).padStart(8, '0'), 8, 16, 13, '#ffffff');
    txt('BEST ' + String(Math.max(best, G.score)).padStart(8, '0'), 8, 29, 9, '#8fa6c8');
    txt('x' + mult().toFixed(1), w - 8, 16, 13, G.meter > 5 ? '#ffd166' : '#8fa6c8', 'right');
    txt('GRAZE ' + G.grazes, w - 8, 29, 9, '#8fa6c8', 'right');
    txt('ST ' + (G.stageIdx + 1) + '/3', w * 0.5, 16, 11, '#7ef9ff', 'center');

    // boss bar
    var b = G.boss;
    if (b && b.state !== 'enter') {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(20, 40, w - 40, 7);
      var frac = Math.max(0, b.hp / b.maxhp);
      ctx.fillStyle = ['#ff5f9e', '#ffb14c', '#62e8ff'][b.phaseIdx];
      ctx.fillRect(20, 40, (w - 40) * frac, 7);
      for (var i = 0; i < b.def.phases.length; i++) {
        ctx.fillStyle = i <= b.phaseIdx ? '#ffffff' : '#54607a';
        ctx.fillRect(20 + i * 9, 51, 6, 3);
      }
      txt(b.name, w - 20, 55, 9, '#c8d6ee', 'right');
    }

    // lives / bombs
    for (var l = 0; l < Math.max(0, G.lives); l++) {
      var lx = 12 + l * 14, ly = h - 20;
      ctx.fillStyle = '#7ef9ff';
      ctx.beginPath(); ctx.moveTo(lx, ly - 7); ctx.lineTo(lx + 5, ly + 4); ctx.lineTo(lx - 5, ly + 4);
      ctx.closePath(); ctx.fill();
    }
    for (var bm = 0; bm < G.bombs; bm++) {
      var bx = 12 + bm * 14, by = h - 38;
      ctx.fillStyle = '#ffd166';
      ctx.beginPath(); ctx.moveTo(bx, by - 5); ctx.lineTo(bx + 5, by); ctx.lineTo(bx, by + 5); ctx.lineTo(bx - 5, by);
      ctx.closePath(); ctx.fill();
    }

    // bomb button
    var bb = bombBtn();
    ctx.globalAlpha = G.bombs > 0 ? 0.85 : 0.3;
    ctx.fillStyle = 'rgba(255,209,102,0.16)';
    ctx.beginPath(); ctx.arc(bb.x, bb.y, bb.r, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(bb.x, bb.y, bb.r, 0, TAU); ctx.stroke();
    txt('BOMB', bb.x, bb.y - 2, 11, '#ffd166', 'center');
    txt(String(G.bombs), bb.x, bb.y + 13, 12, '#ffffff', 'center');
    ctx.globalAlpha = 1;

    // intro line
    if (G.intro > 0) {
      ctx.globalAlpha = Math.min(1, G.intro / 1.2);
      txt('DRAG TO FLY  ·  2ND FINGER = FOCUS  ·  BOMB', W() * 0.5, H() * 0.72, 11, '#ffffff', 'center');
      txt('(keys: arrows / WASD · shift focus · space bomb)', W() * 0.5, H() * 0.72 + 14, 8.5, '#9fb2d0', 'center', 'normal');
      ctx.globalAlpha = 1;
    }

    // banner
    if (G.bannerT > 0) {
      var a = Math.min(1, G.bannerT / 0.6);
      ctx.globalAlpha = a;
      txt(G.banner, W() * 0.5, H() * 0.4, 20, '#ffffff', 'center');
      ctx.globalAlpha = 1;
    }
    // boss warning
    if (G.bossWarn > 0) {
      var bl = Math.sin(G.t * 18) > 0 ? 1 : 0.25;
      ctx.globalAlpha = bl;
      txt('WARNING', W() * 0.5, H() * 0.45, 26, '#ff5f9e', 'center');
      txt(G.stage.boss.name + ' INBOUND', W() * 0.5, H() * 0.45 + 22, 12, '#ffd166', 'center');
      ctx.globalAlpha = 1;
    }
  }

  function drawOverlay() {
    if (G.state !== 'over' && G.state !== 'win') return;
    ctx.fillStyle = 'rgba(3,5,12,0.78)';
    ctx.fillRect(0, 0, W(), H());
    var win = G.state === 'win';
    txt(win ? 'ALL CLEAR' : 'SHIP LOST', W() * 0.5, H() * 0.38, 30, win ? '#7ef9ff' : '#ff5f9e', 'center');
    if (win) txt('1CC — THREE STAGES DOWN', W() * 0.5, H() * 0.38 + 22, 11, '#ffd166', 'center');
    txt('SCORE  ' + G.score, W() * 0.5, H() * 0.5, 16, '#ffffff', 'center');
    txt('BEST   ' + best, W() * 0.5, H() * 0.5 + 20, 12, '#8fa6c8', 'center');
    txt('GRAZE  ' + G.grazes, W() * 0.5, H() * 0.5 + 38, 12, '#8fa6c8', 'center');
    if (G.overT > 0.6) {
      ctx.globalAlpha = 0.6 + Math.sin(G.t * 5) * 0.4;
      txt('TAP  ·  ENTER  TO RESTART', W() * 0.5, H() * 0.66, 13, '#ffffff', 'center');
      ctx.globalAlpha = 1;
    }
  }

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, SH.canvas.width, SH.canvas.height);
    SH.applyTransform();
    if (shake > 0.2) {
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    }
    drawBG();
    if (G.bombFx > 0) {
      var r = (0.75 - G.bombFx) * 900;
      ctx.strokeStyle = 'rgba(255,209,102,' + Math.max(0, G.bombFx) + ')';
      ctx.lineWidth = 14;
      ctx.beginPath(); ctx.arc(G.p.x, G.p.y, Math.max(1, r), 0, TAU); ctx.stroke();
    }
    for (var i = 0; i < G.en.length; i++) if (G.en[i].st !== 'wait') drawEnemy(G.en[i]);
    drawBoss();
    SH.drawParts(ctx);
    drawBullets();
    if (G.state !== 'over' && G.state !== 'win') {
      var p = G.p;
      var alpha = p.inv > 0 ? (Math.floor(G.t * 22) % 2 ? 0.35 : 1) : 1;
      drawShip(p.x, p.y, p.focus, alpha);
    }
    if (flash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + Math.min(0.75, flash) + ')';
      ctx.fillRect(0, 0, W(), H());
    }
    if (hitFlash > 0) {
      ctx.fillStyle = 'rgba(255,60,110,' + Math.min(0.4, hitFlash * 0.5) + ')';
      ctx.fillRect(0, 0, W(), H());
    }
    drawHUD();
    drawOverlay();
  }

  /* ---------------- loop ---------------- */
  var last = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    if (!last) last = ts;
    var dt = (ts - last) / 1000;
    last = ts;
    if (dt > 0.05) dt = 0.05;
    if (dt <= 0) dt = 1 / 60;
    update(dt);
    draw();
  }

  SH.__g = function () { return G; };
  newGame();
  requestAnimationFrame(frame);
})(SH);
