/* Fizzlift - render, input, flow. */
(function (FZ) {
  'use strict';

  var COLS = FZ.COLS, ROWS = FZ.ROWS, K = FZ.K, idx = FZ.idx;

  var cv, ctx, W = 0, H = 0, scale = 1;
  var save = FZ.store.load();

  var COLORS = ['#ffb238', '#3ad1c6', '#ff5f96', '#9ee44a', '#5aa8ff', '#c07bff'];
  var DARK = ['#a56c11', '#1c7c74', '#a32f5b', '#5c8a22', '#2e639e', '#6f3fa3'];

  var st = null;
  var parts = [], bubbles = [], texts = [];
  var MAXP = 220, MAXB = 80, MAXT = 12;
  var timers = [];              /* tracked setTimeout ids (hardening #2) */
  var paused = false, rotate = false;

  /* ---------------- DOM ---------------- */
  var el = {};
  function $(id) { return document.getElementById(id); }

  /* ---------------- input state (hardening #2/#3) ---------------- */
  var input = { ptrId: -1, sx: 0, sy: 0, r: -1, c: -1, dragged: false, keys: Object.create(null) };

  function resetInput() {
    input.ptrId = -1; input.sx = 0; input.sy = 0; input.r = -1; input.c = -1; input.dragged = false;
    input.keys = Object.create(null);
    if (st) { st.sel = null; st.pendingDir = 0; }
  }

  function clearTimers() {
    for (var i = 0; i < timers.length; i++) { try { clearTimeout(timers[i]); } catch (e) { } }
    timers.length = 0;
  }

  /* ---------------- fx ---------------- */
  function addPart(x, y, vx, vy, col, size, life) {
    if (parts.length >= MAXP) parts.shift();
    parts.push({ x: x, y: y, vx: vx, vy: vy, col: col, s: size, l: life, m: life });
  }
  function addText(x, y, txt, col) {
    if (texts.length >= MAXT) texts.shift();
    texts.push({ x: x, y: y, t: txt, l: 0.9, col: col || '#fff' });
  }
  function shake(v) { if (st) st.shake = Math.min(16, st.shake + v); }

  function fxAt(type, r, c, col) {
    if (!st) return;
    var g = geom(), x = g.x + (c + 0.5) * g.t, y = g.y + (r + 0.5) * g.t;
    var i, a;
    if (type === 'clear') {
      for (i = 0; i < 5; i++) {
        a = Math.random() * 6.283;
        addPart(x, y, Math.cos(a) * 90, Math.sin(a) * 90 - 30, COLORS[col % 6] || '#fff', 3 + Math.random() * 3, 0.45);
      }
    } else if (type === 'special') {
      for (i = 0; i < 10; i++) { a = Math.random() * 6.283; addPart(x, y, Math.cos(a) * 150, Math.sin(a) * 150, '#fff', 3, 0.4); }
      shake(4);
    } else if (type === 'cap') {
      for (i = 0; i < 16; i++) { a = Math.random() * 6.283; addPart(x, y, Math.cos(a) * 170, Math.sin(a) * 170 - 90, '#ffe9a8', 3 + Math.random() * 4, 0.7); }
      addText(x, y, 'CAP!', '#ffe9a8'); shake(6); st.flash = Math.max(st.flash, 0.35);
    } else if (type === 'crack') {
      for (i = 0; i < 8; i++) { a = Math.random() * 6.283; addPart(x, y, Math.cos(a) * 120, Math.sin(a) * 120, '#cfd6de', 3, 0.4); }
      shake(3);
    } else if (type === 'valve') {
      for (i = 0; i < 24; i++) { a = Math.random() * 6.283; addPart(x, y, Math.cos(a) * 210, Math.sin(a) * 210, '#9ee44a', 3 + Math.random() * 4, 0.8); }
      addText(x, y, 'VALVE OPEN', '#9ee44a'); shake(9); st.flash = Math.max(st.flash, 0.5);
    }
  }

  /* ---------------- geometry ---------------- */
  function geom() {
    var pad = 8;
    var t = Math.min((W - pad * 2) / COLS, (H - pad * 2) / ROWS);
    var bw = t * COLS, bh = t * ROWS;
    return { t: t, x: (W - bw) / 2, y: (H - bh) / 2, w: bw, h: bh };
  }

  /* ---------------- level lifecycle ---------------- */
  function startLevel(n, endless) {
    clearTimers();
    resetInput();
    parts.length = 0; bubbles.length = 0; texts.length = 0;
    var cfg = endless ? FZ.endlessCfg(0) : FZ.LEVELS[FZ.clamp(n - 1, 0, FZ.LEVELS.length - 1)];
    var b = FZ.makeBoard(cfg);
    FZ.settle(b);
    var noop = function () { };
    for (var q = 0; q < 24; q++) {
      var pl = FZ.planClear(b, -1);
      if (!pl) break;
      FZ.applyClear(b, pl, 0, noop);
      FZ.settle(b);
    }
    if (!FZ.hasMove(b)) FZ.shuffle(b);
    b.score = 0;
    for (var i = 0; i < b.g.length; i++) if (b.g[i]) { b.g[i].ry = b.g[i].r; b.g[i].rx = b.g[i].c; b.g[i].dying = 0; }
    st = {
      level: n, endless: !!endless, cfg: cfg, b: b,
      moves: cfg.moves, phase: 'idle', timer: 0, chain: 0,
      sel: null, cur: { r: (ROWS / 2) | 0, c: (COLS / 2) | 0 },
      plan: null, swapValid: false, swapA: null, swapB: null,
      shake: 0, flash: 0, over: 0, turnShifted: false, capsThisRun: 0,
      hintT: 0, denyT: 0
    };
    hideOverlays();
    syncHUD();
  }

  function restart() {
    if (!st) return;
    startLevel(st.level, st.endless);
  }

  /* ---------------- flow ---------------- */
  function setPhase(p, t) { st.phase = p; st.timer = t || 0; }

  function startClear() {
    var plan = FZ.planClear(st.b, st.swapIdx === undefined ? -1 : st.swapIdx);
    if (!plan) return false;
    st.swapIdx = -1;
    st.plan = plan;
    for (var i = 0; i < plan.list.length; i++) { var cl = st.b.g[plan.list[i]]; if (cl) cl.dying = 1; }
    FZ.audio.match(st.chain);
    if (st.chain > 0) addTextChain(st.chain);
    shake(2 + st.chain);
    setPhase('clear', 0.17);
    return true;
  }

  function addTextChain(ch) {
    var g = geom();
    addText(g.x + g.w * 0.5, g.y + g.h * 0.35, 'CASCADE x' + (ch + 1), '#fff');
  }

  function endTurn() {
    if (!st.turnShifted) {
      st.turnShifted = true;
      var used = st.cfg.moves - st.moves;
      if (st.endless) used = st.movesUsedEndless = (st.movesUsedEndless || 0) + 1;
      if (st.cfg.every > 0 && used > 0 && used % st.cfg.every === 0) {
        if (FZ.advanceWave(st.b)) {
          FZ.audio.fizz(); shake(6);
          addText(geom().x + geom().w * 0.5, geom().y + geom().h * 0.12, 'FIZZ SHIFT', '#3ad1c6');
        }
      }
      if (FZ.settle(st.b)) { setPhase('end', 0.5); return; }
    }
    finishTurn();
  }

  function finishTurn() {
    var b = st.b;
    if (!st.endless && b.capsOut >= st.cfg.caps && b.sealsLeft === 0) { win(); return; }
    if (st.moves <= 0) { lose(); return; }
    if (!FZ.hasMove(b)) {
      FZ.shuffle(b);
      addText(geom().x + geom().w * 0.5, geom().y + geom().h * 0.5, 'NO MOVES - RESTIRRED', '#fff');
      shake(6);
    }
    setPhase('idle', 0);
    syncHUD();
  }

  function step() {
    var b = st.b;
    switch (st.phase) {
      case 'swap':
        if (st.swapValid) {
          st.moves--; st.chain = 0; st.turnShifted = false;
          syncHUD();
          if (!startClear()) endTurn();
        } else {
          FZ.doSwap(b, st.swapA.r, st.swapA.c, st.swapB.r, st.swapB.c);
          setPhase('revert', 0.13);
        }
        break;
      case 'revert':
        setPhase('idle', 0);
        break;
      case 'clear':
        FZ.applyClear(b, st.plan, st.chain, fxAt);
        st.plan = null;
        FZ.settle(b);
        syncHUD();
        setPhase('fall', 0.55);
        break;
      case 'fall': {
        var n = FZ.collectCaps(b, fxAt);
        if (n > 0) {
          FZ.audio.pop();
          st.capsThisRun += n;
          if (st.endless) {
            st.moves += 2 * n;
            if (st.capsThisRun % 10 === 0) { b.wave = Math.min(3, b.wave + 1); FZ.recomputeBnd(b); }
          }
          syncHUD();
          setPhase('cap', 0.2);
        } else {
          st.chain++;
          if (!startClear()) endTurn();
        }
        break;
      }
      case 'cap':
        FZ.settle(b);
        setPhase('fall', 0.55);
        break;
      case 'end': {
        var n2 = FZ.collectCaps(b, fxAt);
        if (n2 > 0) {
          FZ.audio.pop(); st.capsThisRun += n2;
          if (st.endless) st.moves += 2 * n2;
          syncHUD();
          setPhase('cap', 0.2);
        } else if (!startClear()) finishTurn();
        break;
      }
    }
  }

  function win() {
    st.over = 1;
    syncHUD();
    FZ.audio.win();
    var stars = FZ.starsFor(st.cfg, st.moves);
    var key = String(st.level);
    if (!save.stars[key] || save.stars[key] < stars) save.stars[key] = stars;
    if (st.level + 1 > save.unlocked) save.unlocked = Math.min(FZ.LEVELS.length, st.level + 1);
    if (st.b.score > save.best) save.best = st.b.score;
    FZ.store.save(save);
    el.endTitle.textContent = 'GLASS CLEARED';
    el.endBody.innerHTML = starRow(stars) + '<div class="big">' + st.b.score + '</div>' +
      '<div class="sub">Level ' + st.level + ' &middot; ' + st.moves + ' moves left &middot; best ' + save.best + '</div>';
    el.endNext.style.display = (st.level < FZ.LEVELS.length) ? '' : 'none';
    show(el.endOv);
    setPhase('idle', 0);
  }

  function lose() {
    st.over = 2;
    syncHUD();
    FZ.audio.lose();
    if (st.b.score > save.best) { save.best = st.b.score; FZ.store.save(save); }
    el.endTitle.textContent = st.endless ? 'FLAT' : 'OUT OF MOVES';
    el.endBody.innerHTML = '<div class="big">' + st.b.score + '</div><div class="sub">' +
      (st.endless ? st.capsThisRun + ' caps floated' : (st.b.capsOut + '/' + st.cfg.caps + ' caps &middot; ' + st.b.sealsLeft + ' seals left')) +
      ' &middot; best ' + save.best + '</div>';
    el.endNext.style.display = 'none';
    show(el.endOv);
    setPhase('idle', 0);
  }

  function starRow(n) {
    var s = '<div class="stars">';
    for (var i = 0; i < 3; i++) s += '<span class="' + (i < n ? 'on' : '') + '">&#9733;</span>';
    return s + '</div>';
  }

  /* ---------------- interaction ---------------- */
  function canPlay() { return st && !paused && !rotate && st.over === 0 && st.phase === 'idle'; }

  function attemptSwap(r1, c1, r2, c2) {
    if (!canPlay()) return;
    if (r2 < 0 || r2 >= ROWS || c2 < 0 || c2 >= COLS) return;
    var b = st.b;
    var a = b.g[idx(r1, c1)], d = b.g[idx(r2, c2)];
    if (!FZ.swappable(a) || !FZ.swappable(d)) { FZ.audio.deny(); st.denyT = 0.25; shake(3); st.sel = null; return; }
    st.swapValid = FZ.testSwap(b, r1, c1, r2, c2);
    st.swapA = { r: r1, c: c1 }; st.swapB = { r: r2, c: c2 };
    FZ.doSwap(b, r1, c1, r2, c2);
    st.swapIdx = idx(r2, c2);
    st.sel = null;
    FZ.audio.blip();
    if (!st.swapValid) { st.denyT = 0.25; shake(2); }
    setPhase('swap', 0.14);
  }

  function cellAt(px, py) {
    var g = geom();
    var c = Math.floor((px - g.x) / g.t), r = Math.floor((py - g.y) / g.t);
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return null;
    return { r: r, c: c };
  }

  function localPos(e) {
    var rect = cv.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * (W / Math.max(1, rect.width)), y: (e.clientY - rect.top) * (H / Math.max(1, rect.height)) };
  }

  function onDown(e) {
    FZ.audio.unlock();
    e.preventDefault();
    if (!canPlay()) return;
    if (input.ptrId !== -1) return;            /* one pointer owns the board */
    var p = localPos(e), cell = cellAt(p.x, p.y);
    if (!cell) return;
    input.ptrId = (e.pointerId === undefined ? 1 : e.pointerId);
    input.sx = p.x; input.sy = p.y; input.r = cell.r; input.c = cell.c; input.dragged = false;
    st.cur = { r: cell.r, c: cell.c };
    try { cv.setPointerCapture && e.pointerId !== undefined && cv.setPointerCapture(e.pointerId); } catch (err) { }
  }

  function onMove(e) {
    if (input.ptrId === -1) return;
    var pid = (e.pointerId === undefined ? 1 : e.pointerId);
    if (pid !== input.ptrId) return;
    e.preventDefault();
    if (input.dragged || !canPlay()) return;
    var p = localPos(e);
    var dx = p.x - input.sx, dy = p.y - input.sy;
    var g = geom(), th = g.t * 0.38;
    if (Math.abs(dx) < th && Math.abs(dy) < th) return;
    input.dragged = true;
    var r2 = input.r, c2 = input.c;
    if (Math.abs(dx) > Math.abs(dy)) c2 += dx > 0 ? 1 : -1; else r2 += dy > 0 ? 1 : -1;
    attemptSwap(input.r, input.c, r2, c2);
    releasePtr(e);
  }

  function onUp(e) {
    var pid = (e.pointerId === undefined ? 1 : e.pointerId);
    if (input.ptrId === -1 || pid !== input.ptrId) return;
    e.preventDefault();
    if (!input.dragged && canPlay()) {
      var r = input.r, c = input.c;
      if (st.sel && st.sel.r === r && st.sel.c === c) st.sel = null;
      else if (st.sel && Math.abs(st.sel.r - r) + Math.abs(st.sel.c - c) === 1) attemptSwap(st.sel.r, st.sel.c, r, c);
      else {
        var cell = st.b.g[idx(r, c)];
        st.sel = FZ.swappable(cell) ? { r: r, c: c } : null;
        if (st.sel) FZ.audio.blip(); else { FZ.audio.deny(); st.denyT = 0.2; }
      }
    }
    releasePtr(e);
  }

  function releasePtr(e) {
    if (e && e.pointerId !== undefined) { try { cv.releasePointerCapture && cv.releasePointerCapture(e.pointerId); } catch (err) { } }
    input.ptrId = -1; input.dragged = false; input.r = -1; input.c = -1;
  }

  function onCancel(e) {
    var pid = (e && e.pointerId !== undefined) ? e.pointerId : input.ptrId;
    if (pid !== input.ptrId) return;
    releasePtr(e);
  }

  function onKey(e) {
    var k = e.key;
    if (k === undefined) return;
    if (k === 'm' || k === 'M') { toggleMute(); e.preventDefault(); return; }
    if (k === 'r' || k === 'R') { restart(); e.preventDefault(); return; }
    if (k === 'Escape') { if (visible(el.lvOv)) { hideOverlays(); } else if (st) st.sel = null; e.preventDefault(); return; }
    if (!canPlay()) {
      if ((k === 'Enter' || k === ' ') && st && st.over) { e.preventDefault(); if (st.over === 1 && st.level < FZ.LEVELS.length && !st.endless) startLevel(st.level + 1, false); else restart(); }
      return;
    }
    var d = null;
    if (k === 'ArrowLeft') d = [0, -1]; else if (k === 'ArrowRight') d = [0, 1];
    else if (k === 'ArrowUp') d = [-1, 0]; else if (k === 'ArrowDown') d = [1, 0];
    if (d) {
      e.preventDefault();
      if (st.sel) attemptSwap(st.sel.r, st.sel.c, st.sel.r + d[0], st.sel.c + d[1]);
      else { st.cur.r = FZ.clamp(st.cur.r + d[0], 0, ROWS - 1); st.cur.c = FZ.clamp(st.cur.c + d[1], 0, COLS - 1); }
      return;
    }
    if (k === 'Enter' || k === ' ') {
      e.preventDefault();
      if (st.sel) { st.sel = null; }
      else {
        var cell = st.b.g[idx(st.cur.r, st.cur.c)];
        if (FZ.swappable(cell)) { st.sel = { r: st.cur.r, c: st.cur.c }; FZ.audio.blip(); }
        else { FZ.audio.deny(); st.denyT = 0.2; }
      }
    }
  }

  /* ---------------- overlays / HUD ---------------- */
  function show(o) { o.classList.add('show'); }
  function visible(o) { return o.classList.contains('show'); }
  function hideOverlays() { el.endOv.classList.remove('show'); el.lvOv.classList.remove('show'); }

  function syncHUD() {
    if (!st) return;
    var b = st.b;
    el.lvName.textContent = st.endless ? 'ENDLESS FIZZ' : ('LEVEL ' + st.level + ' · ' + FZ.PATTERN_NAMES[st.cfg.bp % 7]);
    el.moves.textContent = st.moves;
    el.caps.textContent = st.endless ? String(b.capsOut) : (b.capsOut + '/' + st.cfg.caps);
    el.seals.textContent = String(b.sealsLeft);
    el.score.textContent = String(b.score);
  }

  function buildLevelGrid() {
    var html = '';
    for (var i = 1; i <= FZ.LEVELS.length; i++) {
      var lock = i > save.unlocked;
      var s = save.stars[String(i)] || 0;
      html += '<button class="lvb' + (lock ? ' lock' : '') + '" data-lv="' + i + '"' + (lock ? ' disabled' : '') + '>' +
        '<b>' + i + '</b><i>' + (lock ? '&#128274;' : ('&#9733;'.repeat(s) || '&middot;')) + '</i></button>';
    }
    el.lvGrid.innerHTML = html;
  }

  function toggleMute() {
    save.mute = !save.mute;
    FZ.audio.setMuted(save.mute);
    FZ.store.save(save);
    el.bSound.textContent = save.mute ? 'Sound off' : 'Sound on';
  }

  /* ---------------- rendering ---------------- */
  function resize() {
    var rect = cv.getBoundingClientRect();
    var cssW = Math.max(120, rect.width), cssH = Math.max(120, rect.height);
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var longest = Math.max(cssW, cssH);
    if (longest * dpr > 960) dpr = 960 / longest;
    W = cssW; H = cssH; scale = dpr;
    cv.width = Math.round(cssW * dpr);
    cv.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function checkRotate() {
    var land = window.innerWidth > window.innerHeight;
    if (land !== rotate) {
      rotate = land;
      el.rotOv.classList.toggle('show', rotate);
      if (rotate) resetInput();
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawGlyph(x, y, s, col) {
    ctx.beginPath();
    var i, a;
    switch (col) {
      case 0: ctx.arc(x, y, s * 0.5, 0, 6.283); break;
      case 1: ctx.rect(x - s * 0.42, y - s * 0.42, s * 0.84, s * 0.84); break;
      case 2: ctx.moveTo(x, y - s * 0.52); ctx.lineTo(x + s * 0.5, y + s * 0.4); ctx.lineTo(x - s * 0.5, y + s * 0.4); ctx.closePath(); break;
      case 3: ctx.moveTo(x, y - s * 0.55); ctx.lineTo(x + s * 0.5, y); ctx.lineTo(x, y + s * 0.55); ctx.lineTo(x - s * 0.5, y); ctx.closePath(); break;
      case 4: for (i = 0; i < 6; i++) { a = -1.5708 + i * 1.0472; var px = x + Math.cos(a) * s * 0.52, py = y + Math.sin(a) * s * 0.52; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); } ctx.closePath(); break;
      default: for (i = 0; i < 10; i++) { a = -1.5708 + i * 0.6283; var rr = (i % 2) ? s * 0.24 : s * 0.55; var qx = x + Math.cos(a) * rr, qy = y + Math.sin(a) * rr; if (i) ctx.lineTo(qx, qy); else ctx.moveTo(qx, qy); } ctx.closePath(); break;
    }
    ctx.fill();
  }

  function surfaceY(g, c, tm) {
    return g.y + st.b.bnd[c] * g.t + Math.sin(tm * 2.2 + c * 0.9) * g.t * 0.06;
  }

  function render(tm) {
    ctx.clearRect(0, 0, W, H);
    if (!st) return;
    var g = geom(), b = st.b, r, c, i;

    ctx.save();
    if (st.shake > 0.2) ctx.translate((Math.random() - 0.5) * st.shake, (Math.random() - 0.5) * st.shake);

    /* glass */
    ctx.fillStyle = '#141a24';
    roundRect(g.x - 4, g.y - 4, g.w + 8, g.h + 8, 12); ctx.fill();

    /* fizz body per column */
    for (c = 0; c < COLS; c++) {
      var sy = surfaceY(g, c, tm);
      var grd = ctx.createLinearGradient(0, sy, 0, g.y + g.h);
      grd.addColorStop(0, 'rgba(60,190,205,0.30)');
      grd.addColorStop(1, 'rgba(30,110,150,0.16)');
      ctx.fillStyle = grd;
      ctx.fillRect(g.x + c * g.t, sy, g.t, g.y + g.h - sy);
    }

    /* grid lines */
    ctx.strokeStyle = 'rgba(255,255,255,0.045)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (c = 1; c < COLS; c++) { ctx.moveTo(g.x + c * g.t, g.y); ctx.lineTo(g.x + c * g.t, g.y + g.h); }
    for (r = 1; r < ROWS; r++) { ctx.moveTo(g.x, g.y + r * g.t); ctx.lineTo(g.x + g.w, g.y + r * g.t); }
    ctx.stroke();

    /* bubbles */
    ctx.fillStyle = 'rgba(190,240,255,0.5)';
    for (i = 0; i < bubbles.length; i++) {
      var bu = bubbles[i];
      ctx.globalAlpha = 0.55 * Math.min(1, bu.l * 3);
      ctx.beginPath(); ctx.arc(bu.x, bu.y, bu.s, 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;

    /* pieces */
    for (i = 0; i < b.g.length; i++) {
      var cell = b.g[i];
      if (!cell) continue;
      drawCell(g, cell, tm);
    }

    /* fizz surface line (drawn over pieces so the split reads clearly) */
    ctx.lineWidth = Math.max(2, g.t * 0.09);
    for (c = 0; c < COLS; c++) {
      var y = surfaceY(g, c, tm);
      ctx.strokeStyle = 'rgba(120,245,255,0.95)';
      ctx.beginPath();
      ctx.moveTo(g.x + c * g.t + 1, y);
      ctx.lineTo(g.x + (c + 1) * g.t - 1, y);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(120,245,255,0.20)';
      ctx.lineWidth = Math.max(6, g.t * 0.28);
      ctx.beginPath();
      ctx.moveTo(g.x + c * g.t + 1, y); ctx.lineTo(g.x + (c + 1) * g.t - 1, y); ctx.stroke();
      ctx.lineWidth = Math.max(2, g.t * 0.09);
    }

    /* gravity arrows in the gutters */
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.font = Math.round(g.t * 0.4) + 'px system-ui,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

    /* selection + cursor */
    if (st.sel) outline(g, st.sel.r, st.sel.c, '#ffffff', 3, tm);
    if (st.cur) outline(g, st.cur.r, st.cur.c, 'rgba(255,255,255,0.42)', 2, 0);

    /* particles */
    for (i = 0; i < parts.length; i++) {
      var p = parts[i];
      ctx.globalAlpha = Math.max(0, p.l / p.m);
      ctx.fillStyle = p.col;
      ctx.fillRect(p.x - p.s * 0.5, p.y - p.s * 0.5, p.s, p.s);
    }
    ctx.globalAlpha = 1;

    /* floating text */
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (i = 0; i < texts.length; i++) {
      var tx = texts[i];
      ctx.globalAlpha = Math.max(0, Math.min(1, tx.l * 1.6));
      ctx.font = 'bold ' + Math.round(g.t * 0.46) + 'px system-ui,sans-serif';
      ctx.fillStyle = '#000'; ctx.fillText(tx.t, tx.x + 2, tx.y + 2);
      ctx.fillStyle = tx.col; ctx.fillText(tx.t, tx.x, tx.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    if (st.flash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + (st.flash * 0.35).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }
  }

  function outline(g, r, c, col, lw, tm) {
    var pulse = tm ? 1 + Math.sin(tm * 9) * 0.05 : 1;
    var s = g.t * pulse;
    ctx.strokeStyle = col; ctx.lineWidth = lw;
    roundRect(g.x + c * g.t + (g.t - s) / 2 + 2, g.y + r * g.t + (g.t - s) / 2 + 2, s - 4, s - 4, 7);
    ctx.stroke();
  }

  function drawCell(g, cell, tm) {
    var t = g.t;
    var x = g.x + cell.rx * t, y = g.y + cell.ry * t;
    var sc = 1;
    if (cell.dying) sc = Math.max(0, 1 - cell.dying * 3.2);
    if (cell.born > 0) sc *= (1 - cell.born * 0.35);
    if (sc <= 0.02) return;
    var pad = t * 0.09 + (t * (1 - sc)) * 0.5;
    var cx = x + t / 2, cy = y + t / 2;
    var inFizz = cell.r >= st.b.bnd[cell.c];

    if (cell.k === K.SEAL) {
      ctx.fillStyle = '#5a6472';
      roundRect(x + pad, y + pad, t - pad * 2, t - pad * 2, 5); ctx.fill();
      ctx.strokeStyle = '#2b313a'; ctx.lineWidth = Math.max(2, t * 0.07);
      ctx.beginPath();
      ctx.moveTo(x + t * 0.3, y + t * 0.3); ctx.lineTo(x + t * 0.7, y + t * 0.7);
      ctx.moveTo(x + t * 0.7, y + t * 0.3); ctx.lineTo(x + t * 0.3, y + t * 0.7);
      ctx.stroke();
      ctx.fillStyle = cell.hp > 1 ? '#9ee44a' : '#ff5f96';
      for (var h = 0; h < cell.hp; h++) ctx.fillRect(x + t * 0.18 + h * t * 0.18, y + t * 0.8, t * 0.12, t * 0.08);
      return;
    }

    if (cell.k === K.CAP) {
      ctx.fillStyle = '#ffe9a8';
      ctx.beginPath(); ctx.arc(cx, cy, (t / 2 - pad) * 0.95, 0, 6.283); ctx.fill();
      ctx.strokeStyle = '#8a6a17'; ctx.lineWidth = Math.max(2, t * 0.08);
      ctx.beginPath(); ctx.arc(cx, cy, (t / 2 - pad) * 0.62, 0, 6.283); ctx.stroke();
      ctx.fillStyle = '#8a6a17';
      ctx.beginPath();
      ctx.moveTo(cx, cy - t * 0.2); ctx.lineTo(cx + t * 0.14, cy + t * 0.04); ctx.lineTo(cx - t * 0.14, cy + t * 0.04);
      ctx.closePath(); ctx.fill();
      return;
    }

    var ci = cell.col % 6;
    ctx.fillStyle = DARK[ci];
    roundRect(x + pad, y + pad, t - pad * 2, t - pad * 2, 7); ctx.fill();
    ctx.fillStyle = COLORS[ci];
    roundRect(x + pad, y + pad, t - pad * 2, (t - pad * 2) * 0.86, 7); ctx.fill();

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    drawGlyph(cx, cy, (t - pad * 2) * 0.52, ci);

    if (cell.k === K.BOMB) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(2, t * 0.07);
      ctx.beginPath(); ctx.arc(cx, cy, (t / 2 - pad) * 0.78, 0, 6.283); ctx.stroke();
    } else if (cell.k === K.SURGE) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect(cx - t * 0.06, y + pad + 2, t * 0.12, t - pad * 2 - 4);
      ctx.fillRect(cx - t * 0.3, y + pad + 2, t * 0.08, t - pad * 2 - 4);
      ctx.fillRect(cx + t * 0.22, y + pad + 2, t * 0.08, t - pad * 2 - 4);
    }

    if (inFizz) {
      ctx.fillStyle = 'rgba(140,240,255,0.10)';
      roundRect(x + pad, y + pad, t - pad * 2, t - pad * 2, 7); ctx.fill();
    }
  }

  /* ---------------- update ---------------- */
  function allSettled() {
    var b = st.b;
    for (var i = 0; i < b.g.length; i++) {
      var cl = b.g[i];
      if (!cl) continue;
      if (Math.abs(cl.ry - cl.r) > 0.035 || Math.abs(cl.rx - cl.c) > 0.035) return false;
    }
    return true;
  }

  function update(dt, tm) {
    if (!st) return;
    var b = st.b, i;
    var k = 1 - Math.exp(-dt * 17);
    for (i = 0; i < b.g.length; i++) {
      var cl = b.g[i];
      if (!cl) continue;
      cl.rx += (cl.c - cl.rx) * k;
      cl.ry += (cl.r - cl.ry) * k;
      if (cl.born > 0) cl.born = Math.max(0, cl.born - dt * 5);
      if (cl.dying) cl.dying += dt;
    }

    st.shake = Math.max(0, st.shake - dt * 40);
    st.flash = Math.max(0, st.flash - dt * 2.2);
    st.denyT = Math.max(0, st.denyT - dt);

    /* particles */
    for (i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.l -= dt;
      if (p.l <= 0) { parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 420 * dt;
    }
    for (i = texts.length - 1; i >= 0; i--) {
      texts[i].l -= dt; texts[i].y -= dt * 34;
      if (texts[i].l <= 0) texts.splice(i, 1);
    }

    /* ambient fizz bubbles */
    var g = geom();
    if (bubbles.length < MAXB && Math.random() < dt * 55) {
      var c = (Math.random() * COLS) | 0;
      bubbles.push({ x: g.x + (c + 0.2 + Math.random() * 0.6) * g.t, y: g.y + g.h - Math.random() * 6, s: 1 + Math.random() * 3, l: 1.6, c: c });
    }
    for (i = bubbles.length - 1; i >= 0; i--) {
      var bu = bubbles[i];
      bu.y -= (26 + bu.s * 9) * dt;
      bu.l -= dt * 0.5;
      var lim = g.y + st.b.bnd[bu.c] * g.t;
      if (bu.l <= 0 || bu.y < lim) bubbles.splice(i, 1);
    }

    /* phase machine */
    if (st.over) return;
    if (st.phase === 'idle') return;
    st.timer -= dt;
    if (st.phase === 'fall') {
      if (allSettled() || st.timer <= 0) { snap(); step(); }
    } else if (st.timer <= 0) {
      step();
    }
  }

  function snap() {
    var b = st.b;
    for (var i = 0; i < b.g.length; i++) { var cl = b.g[i]; if (cl) { cl.rx = cl.c; cl.ry = cl.r; } }
  }

  /* ---------------- loop ---------------- */
  var last = 0, acc = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    if (!last) last = ts;
    var dt = (ts - last) / 1000;
    last = ts;
    if (dt > 0.05) dt = 0.05;          /* clamped delta */
    if (dt < 0) dt = 0;
    checkRotate();
    if (!paused && !rotate) { acc += dt; update(dt, acc); }
    render(acc);
  }

  /* ---------------- boot ---------------- */
  function boot() {
    cv = $('cv'); ctx = cv.getContext('2d');
    el.lvName = $('lvName'); el.moves = $('moves'); el.caps = $('caps');
    el.seals = $('seals'); el.score = $('score');
    el.endOv = $('endOv'); el.endTitle = $('endTitle'); el.endBody = $('endBody');
    el.endNext = $('endNext'); el.lvOv = $('lvOv'); el.lvGrid = $('lvGrid');
    el.rotOv = $('rotOv'); el.bSound = $('bSound');

    FZ.audio.setMuted(save.mute);
    el.bSound.textContent = save.mute ? 'Sound off' : 'Sound on';

    resize();
    window.addEventListener('resize', function () { resize(); checkRotate(); }, { passive: true });
    window.addEventListener('orientationchange', function () { resize(); checkRotate(); }, { passive: true });

    cv.addEventListener('pointerdown', onDown, { passive: false });
    cv.addEventListener('pointermove', onMove, { passive: false });
    cv.addEventListener('pointerup', onUp, { passive: false });
    cv.addEventListener('pointercancel', onCancel, { passive: false });
    cv.addEventListener('lostpointercapture', onCancel, { passive: false });
    cv.addEventListener('touchstart', function (e) { e.preventDefault(); }, { passive: false });
    cv.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', function () { resetInput(); });
    document.addEventListener('visibilitychange', function () {
      paused = document.hidden;
      if (document.hidden) resetInput();
      last = 0;
    });

    $('bRestart').addEventListener('click', function () { FZ.audio.unlock(); restart(); });
    $('bLevels').addEventListener('click', function () {
      FZ.audio.unlock();
      buildLevelGrid();
      show(el.lvOv);
    });
    $('bSound').addEventListener('click', function () { FZ.audio.unlock(); toggleMute(); });
    $('lvClose').addEventListener('click', function () { hideOverlays(); });
    $('lvEndless').addEventListener('click', function () { hideOverlays(); startLevel(1, true); });
    el.lvGrid.addEventListener('click', function (e) {
      var t = e.target;
      while (t && t !== el.lvGrid && !t.getAttribute('data-lv')) t = t.parentNode;
      if (!t || t === el.lvGrid) return;
      var n = parseInt(t.getAttribute('data-lv'), 10);
      if (!isFinite(n)) return;
      hideOverlays(); startLevel(n, false);
    });
    $('endRetry').addEventListener('click', function () { restart(); });
    $('endNext').addEventListener('click', function () {
      if (st && st.level < FZ.LEVELS.length) startLevel(st.level + 1, false); else restart();
    });
    $('endMenu').addEventListener('click', function () { hideOverlays(); buildLevelGrid(); show(el.lvOv); });

    startLevel(Math.min(save.unlocked, FZ.LEVELS.length), false);
    checkRotate();
    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

})(window.FZ);
