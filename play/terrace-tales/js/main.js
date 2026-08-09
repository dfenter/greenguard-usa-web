/* Terrace Tales - main loop, screens, input */
(function (T) {
  'use strict';
  var G = T.G, SP = T.SP;
  var W = 390, H = 700;
  var COLS = 7, ROWS = 8, CELL = 50, BX = 20, BY = 152;

  var cv = document.getElementById('cv');
  var ctx = cv.getContext('2d', { alpha: false });
  var rotEl = document.getElementById('rot');

  /* ---------- persistent + session state ---------- */
  var st = T.store.load();
  st.dayT = 0.18; st.night = 0; st.justBuilt = -1; st.justBuiltAt = -9;

  var screen = 'boot';       /* boot | garden | level | choice | end */
  var paused = false;
  var time = 0, shake = 0, flash = 0, flashCol = '#fff';
  var toast = '', toastT = 0;

  /* level runtime */
  var board = null, lvlIdx = 0, moves = 0, score = 0, goals = [];
  var phase = 'idle', animT = 0, animDur = 0, cascade = 0;
  var lastSwap = null, result = null, hintShown = false;
  var cursor = { c: 3, r: 4 }, sel = null;

  /* ---------- input state (hardening #2/#3) ---------- */
  var pointers = Object.create(null);
  var keys = Object.create(null);
  var buttons = [];
  var focusIdx = -1;

  function resetInput() {
    for (var k in pointers) delete pointers[k];
    for (var k2 in keys) delete keys[k2];
    buttons.length = 0;
    focusIdx = -1;
    sel = null;
    T.clearTimers();
  }

  /* ---------- canvas fit ---------- */
  function fit() {
    var vw = window.innerWidth, vh = window.innerHeight;
    var s = Math.min(vw / W, vh / H);
    var cw = Math.max(1, Math.round(W * s)), ch = Math.max(1, Math.round(H * s));
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (ch * dpr > 960) dpr = 960 / ch;
    var bw = Math.max(1, Math.round(cw * dpr)), bh = Math.max(1, Math.round(ch * dpr));
    cv.style.width = cw + 'px'; cv.style.height = ch + 'px';
    if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
    ctx.setTransform(bw / W, 0, 0, bh / H, 0, 0);
    ctx.imageSmoothingEnabled = true;
    checkRotate();
  }
  function checkRotate() {
    var land = window.innerWidth > window.innerHeight && window.innerHeight < 520;
    var wasPaused = paused;
    if (land) { rotEl.style.display = 'flex'; paused = true; }
    else { rotEl.style.display = 'none'; if (paused && !document.hidden) { paused = false; last = 0; } }
    if (paused && !wasPaused) resetInput();
  }
  window.addEventListener('resize', fit);
  window.addEventListener('orientationchange', function () { T.later(fit, 60); });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { paused = true; resetInput(); }
    else { checkRotate(); last = 0; }
  });
  window.addEventListener('blur', function () { resetInput(); });

  /* ---------- helpers ---------- */
  function toLocal(e) {
    var r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
  }
  function btn(x, y, w, h, label, fn, style) {
    buttons.push({ x: x, y: y, w: w, h: h, label: label, fn: fn, style: style || 'primary' });
  }
  function hitBtn(p) {
    for (var i = buttons.length - 1; i >= 0; i--) {
      var b = buttons[i];
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return b;
    }
    return null;
  }
  function say(m) { toast = m; toastT = 1.8; }

  /* ---------- level control ---------- */
  function startLevel(n) {
    resetInput();
    lvlIdx = T.clamp(n, 0, 14);
    var d = G.LEVELS[lvlIdx];
    board = new T.Board(COLS, ROWS, d.n, d.seed);
    moves = d.moves; score = 0; cascade = 0;
    goals = [];
    for (var i = 0; i < d.goals.length; i++) goals.push({ t: d.goals[i][0], need: d.goals[i][1], got: 0 });
    phase = 'idle'; animT = 0; animDur = 0; result = null; lastSwap = null;
    cursor = { c: 3, r: 4 }; sel = null;
    T.fx.clear(); T.floats.length = 0;
    screen = 'level';
    hintShown = lvlIdx === 0;
  }
  function goGarden() {
    screen = st.done ? 'end' : 'garden';
    resetInput();
  }

  function setAnim(dur) { animT = 0; animDur = dur; }

  function tryMove(c1, r1, c2, r2) {
    if (phase !== 'idle' || !board || result) return;
    if (c2 < 0 || r2 < 0 || c2 >= COLS || r2 >= ROWS) return;
    var i1 = board.i(c1, r1), i2 = board.i(c2, r2);
    board.swapCells(c1, r1, c2, r2);
    var m = board.findMatches(i2);
    if (!m) {
      var m2 = board.findMatches(i1);
      if (!m2) {
        /* invalid: revert and bounce */
        board.swapCells(c1, r1, c2, r2);
        var a = board.g[i1], b = board.g[i2];
        a.ax0 = (c2 - c1) * CELL * 0.32; a.ay0 = (r2 - r1) * CELL * 0.32;
        b.ax0 = (c1 - c2) * CELL * 0.32; b.ay0 = (r1 - r2) * CELL * 0.32;
        phase = 'bad'; setAnim(0.18);
        T.sfx.bad();
        sel = null;
        return;
      }
    }
    /* valid swap */
    board.g[i2].ax0 = (c1 - c2) * CELL; board.g[i2].ay0 = (r1 - r2) * CELL;
    board.g[i1].ax0 = (c2 - c1) * CELL; board.g[i1].ay0 = (r2 - r1) * CELL;
    lastSwap = i2;
    moves--;
    cascade = 0;
    phase = 'swap'; setAnim(0.13);
    T.sfx.swap();
    sel = null;
  }

  function resolveClear(prefer) {
    var m = board.findMatches(prefer);
    if (!m) return false;
    var exp = board.expandSpecials(m.clear);
    var list = exp.list;
    var spawnAt = Object.create(null), i;
    for (i = 0; i < m.spawns.length; i++) spawnAt[m.spawns[i].i] = m.spawns[i];
    cascade++;
    var gained = 0, cleared = 0;
    for (i = 0; i < list.length; i++) {
      var idx = list[i], cell = board.g[idx];
      if (!cell) continue;
      if (spawnAt[idx]) { cell.sp = spawnAt[idx].sp; cell.glow = 1; delete spawnAt[idx]; continue; }
      cell.dead = true; cell.pop = 1;
      cleared++;
      gained += 12 * Math.min(6, cascade);
      for (var q = 0; q < goals.length; q++) if (goals[q].t === cell.t) goals[q].got++;
      var cx = BX + (idx % COLS) * CELL + CELL / 2, cy = BY + ((idx / COLS) | 0) * CELL + CELL / 2;
      if (T.fx.list.length < 180) T.fx.burst(cx, cy, G.GEMS[cell.t].c, 5, 100);
    }
    /* any spawn that survived (not in list) still becomes special */
    for (var key in spawnAt) {
      var sc = board.g[key | 0]; if (sc) { sc.sp = spawnAt[key].sp; sc.glow = 1; }
    }
    score += gained;
    if (cleared) {
      T.sfx.match(cascade);
      if (exp.triggered) { T.sfx.special(); shake = Math.min(10, shake + 6); }
      else shake = Math.min(8, shake + 1.5 + cleared * 0.15);
      if (cascade > 1) {
        T.addFloat(W / 2, BY + 120, 'x' + Math.min(6, cascade) + ' cascade', '#ffe08a');
      }
      flash = Math.min(0.4, flash + 0.12); flashCol = '#ffffff';
    }
    phase = 'clear'; setAnim(0.17);
    return true;
  }

  function afterSettle() {
    /* win / fail checks */
    var won = true;
    for (var i = 0; i < goals.length; i++) if (goals[i].got < goals[i].need) won = false;
    if (won) {
      result = 'win';
      score += moves * 30;
      var key = String(lvlIdx);
      if (!(typeof st.best[key] === 'number') || score > st.best[key]) { st.best[key] = score; }
      T.store.save(st);
      T.sfx.win();
      for (var p = 0; p < 5; p++) T.fx.burst(40 + p * 78, BY + 160, '#ffe08a', 12, 150);
      resetInput();
      return;
    }
    if (moves <= 0) {
      result = 'fail'; T.sfx.fail(); shake = 10; resetInput(); return;
    }
    if (!board.hasMove()) { board.shuffle(); say('No moves left - the beds were turned over.'); T.sfx.special(); }
  }

  function updateBoard(dt) {
    if (!board || result) return;
    if (phase === 'idle') return;
    animT += dt;
    var done = animT >= animDur;
    if (!done) return;
    animT = 0;
    var i;
    if (phase === 'bad') {
      for (i = 0; i < board.g.length; i++) { board.g[i].ax0 = 0; board.g[i].ay0 = 0; }
      phase = 'idle'; return;
    }
    if (phase === 'swap') {
      for (i = 0; i < board.g.length; i++) { board.g[i].ax0 = 0; board.g[i].ay0 = 0; }
      if (!resolveClear(lastSwap)) { phase = 'idle'; afterSettle(); }
      return;
    }
    if (phase === 'clear') {
      var moved = board.collapse();
      for (i = 0; i < board.g.length; i++) {
        var c = board.g[i];
        if (!c) continue;
        c.pop = 0; c.dead = false;
        if (c.off) { c.ay0 = -c.off * CELL; c.off = 0; } else { c.ay0 = 0; }
        c.ax0 = 0;
      }
      phase = 'fall'; setAnim(0.20);
      return;
    }
    if (phase === 'fall') {
      for (i = 0; i < board.g.length; i++) { board.g[i].ay0 = 0; board.g[i].ax0 = 0; }
      if (!resolveClear(null)) { phase = 'idle'; afterSettle(); }
      return;
    }
  }

  /* ---------- gem drawing ---------- */
  function drawGem(x, y, s, t, sp, glow) {
    var col = G.GEMS[t] ? G.GEMS[t].c : '#888';
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = col;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2;
    var k;
    if (t === 0) { ctx.beginPath(); ctx.arc(0, 0, s * 0.44, 0, 6.284); ctx.fill(); ctx.stroke(); }
    else if (t === 1) {
      ctx.beginPath(); ctx.moveTo(0, -s * 0.5); ctx.quadraticCurveTo(s * 0.5, 0, 0, s * 0.5);
      ctx.quadraticCurveTo(-s * 0.5, 0, 0, -s * 0.5); ctx.fill(); ctx.stroke();
    } else if (t === 2) {
      ctx.beginPath();
      for (k = 0; k < 6; k++) { var a = k * 1.0472 - 0.5236; var px2 = Math.cos(a) * s * 0.46, py2 = Math.sin(a) * s * 0.46; if (k === 0) ctx.moveTo(px2, py2); else ctx.lineTo(px2, py2); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (t === 3) { T.rr(ctx, -s * 0.4, -s * 0.4, s * 0.8, s * 0.8, 5); ctx.fill(); ctx.stroke(); }
    else if (t === 4) {
      for (k = 0; k < 5; k++) {
        var an = k * 1.2566 - 1.5708;
        ctx.beginPath(); ctx.arc(Math.cos(an) * s * 0.26, Math.sin(an) * s * 0.26, s * 0.2, 0, 6.284); ctx.fill();
      }
      ctx.fillStyle = '#f6e6a8'; ctx.beginPath(); ctx.arc(0, 0, s * 0.15, 0, 6.284); ctx.fill();
    } else {
      ctx.beginPath();
      for (k = 0; k < 10; k++) {
        var ang2 = k * 0.6283 - 1.5708, rr = (k % 2 ? s * 0.2 : s * 0.48);
        var xx = Math.cos(ang2) * rr, yy = Math.sin(ang2) * rr;
        if (k === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    /* highlight */
    ctx.globalAlpha = 0.3; ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(-s * 0.12, -s * 0.16, s * 0.14, s * 0.09, -0.6, 0, 6.284); ctx.fill();
    ctx.globalAlpha = 1;
    /* special marks */
    if (sp === SP.ROW || sp === SP.COL) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.globalAlpha = 0.9;
      ctx.beginPath();
      if (sp === SP.ROW) { ctx.moveTo(-s * 0.45, 0); ctx.lineTo(s * 0.45, 0); }
      else { ctx.moveTo(0, -s * 0.45); ctx.lineTo(0, s * 0.45); }
      ctx.stroke(); ctx.globalAlpha = 1;
    } else if (sp === SP.BOMB) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(0, 0, s * 0.3, 0, 6.284); ctx.stroke();
    } else if (sp === SP.PRISM) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      for (k = 0; k < 4; k++) {
        ctx.beginPath();
        var a3 = k * 0.7854 + time;
        ctx.moveTo(Math.cos(a3) * s * 0.42, Math.sin(a3) * s * 0.42);
        ctx.lineTo(-Math.cos(a3) * s * 0.42, -Math.sin(a3) * s * 0.42);
        ctx.stroke();
      }
    }
    if (glow > 0) {
      ctx.globalAlpha = glow * 0.8; ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(0, 0, s * 0.55, 0, 6.284); ctx.fill(); ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  /* ---------- UI drawing ---------- */
  function panel(x, y, w, h, col) {
    ctx.fillStyle = col || 'rgba(18,26,33,0.92)';
    T.rr(ctx, x, y, w, h, 12); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 1.5; ctx.stroke();
  }
  function drawButtons() {
    for (var i = 0; i < buttons.length; i++) {
      var b = buttons[i], foc = i === focusIdx;
      var base = b.style === 'ghost' ? 'rgba(255,255,255,0.07)' : (b.style === 'warn' ? '#8a4a3c' : '#3f7a52');
      ctx.fillStyle = base;
      T.rr(ctx, b.x, b.y, b.w, b.h, 10); ctx.fill();
      ctx.strokeStyle = foc ? '#ffe08a' : 'rgba(255,255,255,0.18)';
      ctx.lineWidth = foc ? 3 : 1.5; ctx.stroke();
      ctx.fillStyle = '#f2f6f3';
      ctx.font = '600 ' + (b.h > 46 ? 19 : 16) + 'px system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1);
    }
    ctx.textBaseline = 'alphabetic';
  }
  function header(title, sub) {
    ctx.fillStyle = '#0f151b'; ctx.fillRect(0, 0, W, 84);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e8efe9'; ctx.font = '700 24px system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
    ctx.fillText(title, 16, 38);
    ctx.fillStyle = '#8fa3a0'; ctx.font = '500 14px system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
    ctx.fillText(sub, 16, 60);
  }
  function narration(txt, y) {
    ctx.font = '500 15px system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
    var lines = T.wrap(ctx, txt, W - 44);
    ctx.textAlign = 'center';
    for (var i = 0; i < lines.length && i < 2; i++) {
      ctx.fillStyle = '#cfe0d4';
      ctx.fillText(lines[i], W / 2, y + i * 19);
    }
  }

  /* ---------- screens ---------- */
  function drawBoot() {
    ctx.fillStyle = '#0d1218'; ctx.fillRect(0, 0, W, H);
    G.drawScene(ctx, { lvl: 6, choices: [0, 1, 0, 1, 0, 1], night: 0.25, dayT: 0.12, justBuilt: -1, justBuiltAt: -9 }, time, W, H);
    ctx.fillStyle = 'rgba(8,12,16,0.62)'; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f4f9f4'; ctx.font = '800 40px system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
    ctx.fillText('TERRACE', W / 2, 250);
    ctx.fillText('TALES', W / 2, 296);
    ctx.fillStyle = '#9dc0a6'; ctx.font = '500 16px system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
    ctx.fillText('Restore Hollowbrook Rise, match by match.', W / 2, 336);
    ctx.fillStyle = '#e6eee8'; ctx.font = '600 20px system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
    ctx.globalAlpha = 0.6 + Math.sin(time * 3) * 0.35;
    ctx.fillText('Tap to begin', W / 2, 470);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#7d928a'; ctx.font = '500 13px system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
    ctx.fillText('Swipe to swap - arrows + Enter also work', W / 2, 520);
    buttons.length = 0;
    btn(W / 2 - 110, 560, 220, 56, st.lvl > 0 ? 'Continue the garden' : 'Start restoring', function () {
      T.audio.unlock(); st.seen = true; T.store.save(st); goGarden();
    });
    drawButtons();
  }

  function drawGarden() {
    ctx.fillStyle = '#0d1218'; ctx.fillRect(0, 0, W, H);
    G.drawScene(ctx, st, time, W, H);
    var full = st.lvl >= 15;
    header('Hollowbrook Rise', full ? 'Restored - 15 of 15' : ('Restored ' + st.lvl + ' of 15'));
    /* progress pips */
    for (var i = 0; i < 15; i++) {
      var px2 = 16 + i * 24.6, done = i < st.lvl;
      ctx.fillStyle = done ? '#6fc25c' : 'rgba(255,255,255,0.16)';
      T.rr(ctx, px2, 68, 20, 6, 3); ctx.fill();
    }
    /* narration band */
    ctx.fillStyle = 'rgba(10,15,20,0.88)'; ctx.fillRect(0, 596, W, 46);
    narration(full ? G.AFTER[14] : G.BEFORE[st.lvl], 620);
    buttons.length = 0;
    if (!full) {
      btn(20, 644, 250, 52, 'Begin Level ' + (st.lvl + 1), function () { T.audio.unlock(); startLevel(st.lvl); });
      btn(282, 644, 88, 52, T.audio.muted ? 'Sound off' : 'Sound on', function () { T.audio.toggle(); }, 'ghost');
    } else {
      btn(20, 644, 170, 52, 'Free play', function () { T.audio.unlock(); startLevel(14); }, 'ghost');
      btn(200, 644, 170, 52, 'New garden', function () {
        st.lvl = 0; st.choices = []; st.done = false; st.justBuilt = -1;
        T.store.save(st); screen = 'garden'; resetInput(); say('A fresh hillside awaits.');
      }, 'warn');
    }
    drawButtons();
  }

  function drawLevelHud() {
    ctx.fillStyle = '#0f151b'; ctx.fillRect(0, 0, W, 142);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e8efe9'; ctx.font = '700 20px system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
    ctx.fillText('Level ' + (lvlIdx + 1) + ' / 15', 16, 32);
    ctx.fillStyle = '#8fa3a0'; ctx.font = '500 13px system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
    ctx.fillText(G.SLOTS[lvlIdx].k + ' - ' + G.TERRACES[G.SLOTS[lvlIdx].tr].name, 16, 50);
    /* moves */
    ctx.textAlign = 'right';
    ctx.fillStyle = moves <= 3 ? '#e0765c' : '#ffe08a';
    ctx.font = '800 30px system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
    ctx.fillText(String(moves), W - 16, 38);
    ctx.fillStyle = '#8fa3a0'; ctx.font = '500 12px system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
    ctx.fillText('moves', W - 16, 54);
    /* goals */
    var gw = goals.length, startX = 16;
    for (var i = 0; i < gw; i++) {
      var gx = startX + i * 92, gy = 88;
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      T.rr(ctx, gx, gy - 18, 84, 36, 8); ctx.fill();
      drawGem(gx + 20, gy, 26, goals[i].t, 0, 0);
      var met = goals[i].got >= goals[i].need;
      ctx.textAlign = 'left';
      ctx.fillStyle = met ? '#6fc25c' : '#dbe6dd';
      ctx.font = '700 15px system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
      ctx.fillText(Math.min(goals[i].got, goals[i].need) + '/' + goals[i].need, gx + 38, gy + 5);
    }
    ctx.textAlign = 'right';
    ctx.fillStyle = '#9fb3ab'; ctx.font = '600 14px system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
    ctx.fillText('Score ' + score, W - 16, 94);
    var bk = st.best[String(lvlIdx)];
    if (typeof bk === 'number') { ctx.fillStyle = '#6c8078'; ctx.font = '500 12px system-ui,-apple-system,Segoe UI,Roboto,sans-serif'; ctx.fillText('Best ' + bk, W - 16, 110); }
  }

  function drawLevel() {
    ctx.fillStyle = '#131a20'; ctx.fillRect(0, 0, W, H);
    ctx.save();
    if (shake > 0.1) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

    /* board frame */
    ctx.fillStyle = '#1a232b';
    T.rr(ctx, BX - 8, BY - 8, COLS * CELL + 16, ROWS * CELL + 16, 14); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1.5; ctx.stroke();

    var e = animDur > 0 ? T.clamp(animT / animDur, 0, 1) : 1;
    var ease = 1 - Math.pow(1 - e, 3);
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var cell = board.g[board.i(c, r)];
        if (!cell) continue;
        ctx.fillStyle = ((c + r) % 2) ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.10)';
        ctx.fillRect(BX + c * CELL, BY + r * CELL, CELL, CELL);
        var x = BX + c * CELL + CELL / 2 + (cell.ax0 || 0) * (1 - ease);
        var y = BY + r * CELL + CELL / 2 + (cell.ay0 || 0) * (1 - ease);
        var s = CELL - 8;
        if (cell.dead) { s *= (1 - ease * 0.9); }
        if (s > 1) drawGem(x, y, s, cell.t, cell.sp, cell.glow || 0);
        if (cell.glow > 0) cell.glow = Math.max(0, cell.glow - 0.04);
      }
    }
    /* cursor + selection */
    if (sel) {
      ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = 3;
      T.rr(ctx, BX + sel.c * CELL + 3, BY + sel.r * CELL + 3, CELL - 6, CELL - 6, 8); ctx.stroke();
    }
    if (keyMode) {
      ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = 2;
      T.rr(ctx, BX + cursor.c * CELL + 2, BY + cursor.r * CELL + 2, CELL - 4, CELL - 4, 8); ctx.stroke();
    }
    T.fx.draw(ctx);
    T.drawFloats(ctx);
    ctx.restore();

    drawLevelHud();
    /* hint / status line */
    ctx.textAlign = 'center';
    ctx.font = '500 14px system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
    ctx.fillStyle = '#93a8a0';
    var line = toastT > 0 ? toast : (hintShown ? 'Swipe a gem into its neighbour to make a line of 3+.' : G.BEFORE[lvlIdx]);
    var ls = T.wrap(ctx, line || ' ', W - 40);
    if (ls[0]) ctx.fillText(ls[0], W / 2, 578);
    if (ls[1]) ctx.fillText(ls[1], W / 2, 596);

    buttons.length = 0;
    if (result) {
      drawResult();
    } else {
      btn(20, 614, 130, 52, 'Garden', function () { goGarden(); }, 'ghost');
      btn(160, 614, 120, 52, 'Retry', function () { startLevel(lvlIdx); }, 'ghost');
      btn(290, 614, 80, 52, T.audio.muted ? 'Mute' : 'Sound', function () { T.audio.toggle(); }, 'ghost');
    }
    drawButtons();

    if (flash > 0.01) {
      ctx.globalAlpha = flash; ctx.fillStyle = flashCol; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    }
  }

  function drawResult() {
    ctx.fillStyle = 'rgba(8,12,16,0.82)'; ctx.fillRect(0, 0, W, H);
    panel(30, 200, W - 60, 260);
    ctx.textAlign = 'center';
    if (result === 'win') {
      ctx.fillStyle = '#8fe0a0'; ctx.font = '800 30px system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
      ctx.fillText('Funded!', W / 2, 254);
      ctx.fillStyle = '#dbe6dd'; ctx.font = '600 18px system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
      ctx.fillText('Score ' + score, W / 2, 292);
      ctx.fillStyle = '#9fb3ab'; ctx.font = '500 14px system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
      var l2 = T.wrap(ctx, 'Enough for one job on the ' + G.TERRACES[G.SLOTS[lvlIdx].tr].name + ': ' + G.SLOTS[lvlIdx].k + '.', W - 110);
      for (var i = 0; i < l2.length; i++) ctx.fillText(l2[i], W / 2, 324 + i * 19);
      btn(60, 384, W - 120, 56, 'Choose the work', function () { screen = 'choice'; resetInput(); });
    } else {
      ctx.fillStyle = '#e0765c'; ctx.font = '800 28px system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
      ctx.fillText('Out of moves', W / 2, 254);
      ctx.fillStyle = '#9fb3ab'; ctx.font = '500 15px system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
      ctx.fillText('The budget ran dry. No penalty - go again.', W / 2, 288);
      ctx.fillStyle = '#dbe6dd'; ctx.font = '600 16px system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
      ctx.fillText('Score ' + score, W / 2, 318);
      btn(60, 350, W - 120, 56, 'Retry level', function () { startLevel(lvlIdx); });
      btn(60, 414, W - 120, 48, 'Back to garden', function () { goGarden(); }, 'ghost');
    }
  }

  function drawChoice() {
    ctx.fillStyle = '#0d1218'; ctx.fillRect(0, 0, W, H);
    G.drawScene(ctx, st, time, W, H);
    ctx.fillStyle = 'rgba(8,12,16,0.78)'; ctx.fillRect(0, 0, W, H);
    var slot = G.SLOTS[lvlIdx];
    header('Choose the work', G.TERRACES[slot.tr].name + ' - ' + slot.k);
    buttons.length = 0;
    for (var v = 0; v < 2; v++) {
      var y = 110 + v * 200;
      panel(20, y, W - 40, 176);
      /* preview */
      ctx.save();
      ctx.beginPath(); ctx.rect(28, y + 8, W - 56, 104); ctx.clip();
      ctx.fillStyle = '#22303a'; ctx.fillRect(28, y + 8, W - 56, 104);
      ctx.fillStyle = '#3c4a35'; ctx.fillRect(28, y + 92, W - 56, 20);
      ctx.save(); ctx.translate(W / 2 - slot.x + 0, y + 92 - slot.y);
      G.DRAW[lvlIdx](ctx, slot.x, slot.y, v, time, false);
      ctx.restore();
      ctx.restore();
      ctx.textAlign = 'left';
      ctx.fillStyle = '#f0f6f1'; ctx.font = '700 19px system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
      ctx.fillText(slot.v[v], 32, y + 138);
      ctx.fillStyle = '#8fa3a0'; ctx.font = '500 13px system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
      ctx.fillText('Changes the terrace for good.', 32, y + 158);
      (function (vv) {
        btn(W - 138, y + 120, 110, 48, 'Build', function () { pickVariant(vv); });
      })(v);
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = '#7d928a'; ctx.font = '500 13px system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
    ctx.fillText('Both cost the same. Only the garden changes.', W / 2, 528);
    drawButtons();
  }

  function pickVariant(v) {
    st.choices[lvlIdx] = v ? 1 : 0;
    if (lvlIdx >= st.lvl) st.lvl = lvlIdx + 1;
    if (st.lvl >= 15) st.done = true;
    st.justBuilt = lvlIdx; st.justBuiltAt = time;
    T.store.save(st);
    T.sfx.build();
    say(G.AFTER[lvlIdx]);
    screen = st.done ? 'end' : 'garden';
    resetInput();
  }

  function drawEnd() {
    ctx.fillStyle = '#0d1218'; ctx.fillRect(0, 0, W, H);
    G.drawScene(ctx, st, time, W, H);
    header('Hollowbrook Rise', 'Restored - all 15 works complete');
    for (var i = 0; i < 15; i++) { ctx.fillStyle = '#6fc25c'; T.rr(ctx, 16 + i * 24.6, 68, 20, 6, 3); ctx.fill(); }
    ctx.fillStyle = 'rgba(10,15,20,0.88)'; ctx.fillRect(0, 588, W, 54);
    narration(G.AFTER[14], 612);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#8fa3a0'; ctx.font = '500 12px system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
    ctx.fillText('Your garden is yours - every choice is kept.', W / 2, 632);
    buttons.length = 0;
    btn(16, 644, 118, 52, 'Free play', function () { T.audio.unlock(); startLevel(14); }, 'ghost');
    btn(142, 644, 118, 52, T.audio.muted ? 'Sound off' : 'Sound on', function () { T.audio.toggle(); }, 'ghost');
    btn(268, 644, 106, 52, 'New garden', function () {
      st.lvl = 0; st.choices = []; st.done = false; st.justBuilt = -1;
      T.store.save(st); screen = 'garden'; resetInput(); say('A fresh hillside awaits.');
    }, 'warn');
    drawButtons();
  }

  /* ---------- pointer input ---------- */
  var keyMode = false;

  function onDown(e) {
    if (paused) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    T.audio.unlock();
    var p = toLocal(e);
    var rec = { x: p.x, y: p.y, sx: p.x, sy: p.y, btn: null, cell: null, used: false };
    var b = hitBtn(p);
    if (b) { rec.btn = b; focusIdx = buttons.indexOf(b); }
    else if (screen === 'level' && !result && phase === 'idle') {
      var c = Math.floor((p.x - BX) / CELL), r = Math.floor((p.y - BY) / CELL);
      if (c >= 0 && r >= 0 && c < COLS && r < ROWS) rec.cell = { c: c, r: r };
    }
    pointers[e.pointerId] = rec;
    if (Object.keys(pointers).length > 8) delete pointers[Object.keys(pointers)[0]];
    if (screen === 'boot') { /* tap anywhere starts */ }
  }
  function onMove(e) {
    var rec = pointers[e.pointerId];
    if (!rec || paused) return;
    var p = toLocal(e);
    rec.x = p.x; rec.y = p.y;
    if (rec.cell && !rec.used && screen === 'level' && phase === 'idle' && !result) {
      var dx = p.x - rec.sx, dy = p.y - rec.sy;
      if (Math.abs(dx) > 16 || Math.abs(dy) > 16) {
        rec.used = true;
        keyMode = false;
        var c2 = rec.cell.c, r2 = rec.cell.r;
        if (Math.abs(dx) > Math.abs(dy)) c2 += dx > 0 ? 1 : -1; else r2 += dy > 0 ? 1 : -1;
        tryMove(rec.cell.c, rec.cell.r, c2, r2);
      }
    }
  }
  function onUp(e) {
    var rec = pointers[e.pointerId];
    delete pointers[e.pointerId];
    if (!rec || paused) return;
    var p = toLocal(e);
    if (rec.btn) {
      if (p.x >= rec.btn.x && p.x <= rec.btn.x + rec.btn.w && p.y >= rec.btn.y && p.y <= rec.btn.y + rec.btn.h) {
        T.sfx.tap();
        var f = rec.btn.fn; rec.btn = null; f();
      }
      return;
    }
    if (screen === 'boot') { T.audio.unlock(); st.seen = true; T.store.save(st); goGarden(); return; }
    if (rec.cell && !rec.used && screen === 'level' && phase === 'idle' && !result) {
      keyMode = false;
      var c = rec.cell.c, r = rec.cell.r;
      if (sel && (Math.abs(sel.c - c) + Math.abs(sel.r - r)) === 1) { tryMove(sel.c, sel.r, c, r); }
      else if (sel && sel.c === c && sel.r === r) { sel = null; T.sfx.tap(); }
      else { sel = { c: c, r: r }; T.sfx.tap(); }
    }
  }
  function onCancel(e) { delete pointers[e.pointerId]; }

  cv.addEventListener('pointerdown', function (e) { e.preventDefault(); onDown(e); }, { passive: false });
  cv.addEventListener('pointermove', function (e) { e.preventDefault(); onMove(e); }, { passive: false });
  cv.addEventListener('pointerup', function (e) { e.preventDefault(); onUp(e); }, { passive: false });
  cv.addEventListener('pointercancel', onCancel);
  cv.addEventListener('pointerleave', onCancel);
  cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  cv.addEventListener('touchstart', function (e) { e.preventDefault(); }, { passive: false });
  cv.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });

  /* ---------- keyboard ---------- */
  window.addEventListener('keydown', function (e) {
    var k = e.key;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Enter', 'Tab'].indexOf(k) >= 0) e.preventDefault();
    if (keys[k]) return;
    keys[k] = true;
    T.audio.unlock();
    if (paused) return;
    if (screen === 'boot') { if (k === 'Enter' || k === ' ') { st.seen = true; T.store.save(st); goGarden(); } return; }
    if (screen === 'level' && !result) {
      keyMode = true;
      if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown') {
        var dc = k === 'ArrowLeft' ? -1 : (k === 'ArrowRight' ? 1 : 0);
        var dr = k === 'ArrowUp' ? -1 : (k === 'ArrowDown' ? 1 : 0);
        if (sel) { tryMove(sel.c, sel.r, sel.c + dc, sel.r + dr); }
        else { cursor.c = T.clamp(cursor.c + dc, 0, COLS - 1); cursor.r = T.clamp(cursor.r + dr, 0, ROWS - 1); }
        return;
      }
      if (k === 'Enter' || k === ' ') {
        if (sel && sel.c === cursor.c && sel.r === cursor.r) sel = null; else sel = { c: cursor.c, r: cursor.r };
        T.sfx.tap(); return;
      }
      if (k === 'r' || k === 'R') { startLevel(lvlIdx); return; }
      if (k === 'Escape') { goGarden(); return; }
      if (k === 'm' || k === 'M') { T.audio.toggle(); return; }
      return;
    }
    /* menus / overlays: focus navigation */
    if (!buttons.length) return;
    if (k === 'ArrowDown' || k === 'ArrowRight' || k === 'Tab') { focusIdx = (focusIdx + 1) % buttons.length; T.sfx.tap(); return; }
    if (k === 'ArrowUp' || k === 'ArrowLeft') { focusIdx = (focusIdx - 1 + buttons.length) % buttons.length; T.sfx.tap(); return; }
    if (k === 'Enter' || k === ' ') {
      var b = buttons[focusIdx >= 0 ? focusIdx : 0];
      if (b) { T.sfx.tap(); b.fn(); }
      return;
    }
    if (k === 'm' || k === 'M') T.audio.toggle();
    if (k === 'Escape' && screen === 'choice') { goGarden(); return; }
  });
  window.addEventListener('keyup', function (e) { delete keys[e.key]; });

  /* ---------- loop ---------- */
  var last = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    if (!last) last = ts;
    var dt = (ts - last) / 1000; last = ts;
    if (dt > 0.05) dt = 0.05;
    if (dt < 0) dt = 0;
    if (paused) { return; }

    time += dt;
    if (shake > 0) shake = Math.max(0, shake - dt * 34);
    if (flash > 0) flash = Math.max(0, flash - dt * 1.6);
    if (toastT > 0) toastT -= dt;
    T.fx.update(dt);
    T.updateFloats(dt);

    if (screen === 'garden' || screen === 'end' || screen === 'choice' || screen === 'boot') {
      st.dayT = (st.dayT + dt / 54) % 1;
      st.night = (1 - Math.cos(st.dayT * 6.28318)) / 2;
    }
    if (screen === 'level') updateBoard(dt);

    if (screen === 'boot') drawBoot();
    else if (screen === 'garden') drawGarden();
    else if (screen === 'level') drawLevel();
    else if (screen === 'choice') drawChoice();
    else drawEnd();
  }

  fit();
  if (st.lvl >= 15) st.done = true;
  requestAnimationFrame(frame);
})(TT);
