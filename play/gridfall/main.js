/* Gridfall - main.js : layout, render, input, loop */
'use strict';
(function () {

  var N = G.N;
  var cv = document.getElementById('cv');
  var ctx = cv.getContext('2d', { alpha: false });
  var $ = function (id) { return document.getElementById(id); };
  var elScore = $('sScore'), elBest = $('sBest'), elStreak = $('sStreak');
  var ovStart = $('ovStart'), ovRot = $('ovRot'), ovOver = $('ovOver');

  /* ================= state ================= */
  var S = {
    mode: 'marathon',
    board: G.newBoard(),
    hand: [null, null, null],
    next: [null, null, null],
    rng: U.makeRng(1),
    score: 0, best: 0, streak: 0, lines: 0, placed: 0,
    over: false, started: false, paused: false, dailyKey: ''
  };
  var FX = { parts: [], pops: [], flash: [], shake: 0, boardPulse: 0 };
  var MAXP = 220, MAXPOP = 10, MAXFLASH = 80;
  var scratch = G.newBoard();

  /* input state - fully resettable */
  var drag = { on: false, pid: -1, piece: null, slot: -1, x: 0, y: 0, gc: 0, gr: 0, ok: false, moved: false };
  var kb = { on: false, slot: 0, c: 3, r: 3, keys: Object.create(null) };

  function resetInput() {
    drag.on = false; drag.pid = -1; drag.piece = null; drag.slot = -1;
    drag.x = drag.y = 0; drag.gc = drag.gr = 0; drag.ok = false; drag.moved = false;
    kb.on = false; kb.slot = 0; kb.c = 3; kb.r = 3; kb.keys = Object.create(null);
  }

  /* ================= layout ================= */
  var L = { w: 0, h: 0, c: 40, bx: 0, by: 0, bs: 320, hy: 0, hh: 0, sw: 0, ny: 0, nh: 0, pad: 8 };
  function resize() {
    var r = cv.getBoundingClientRect();
    var W = Math.max(200, r.width), H = Math.max(200, r.height);
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var sc = Math.min(dpr, 960 / Math.max(W, H));
    var bw = Math.max(1, Math.round(W * sc)), bh = Math.max(1, Math.round(H * sc));
    if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
    ctx.setTransform(bw / W, 0, 0, bh / H, 0, 0);
    var pad = 8;
    var c = Math.min((H - 2 * pad) / 11.9, (W - 2 * pad) / 8);
    c = Math.max(14, c);
    /* spread any leftover vertical space instead of leaving a dead gap */
    var extra = Math.max(0, H - 2 * pad - 11.9 * c);
    L.w = W; L.h = H; L.pad = pad; L.c = c; L.bs = c * 8;
    L.bx = Math.round((W - L.bs) / 2); L.by = Math.round(pad + extra * 0.22);
    L.hy = L.by + L.bs + c * 0.35 + extra * 0.28;
    L.hh = c * 2.2 + extra * 0.28;
    L.sw = (W - 2 * pad) / 3;
    L.ny = L.hy + L.hh + c * 0.25 + extra * 0.1; L.nh = c * 1.1;
    checkOrient();
  }
  function checkOrient() {
    var land = window.innerWidth > window.innerHeight && window.innerHeight < 520;
    if (land !== S.paused) {
      S.paused = land;
      ovRot.className = land ? 'ov' : 'ov hide';
      if (land) releaseAll();
    }
  }

  /* ================= game control ================= */
  function bestKey(m) { return 'best.' + m; }

  function start(mode) {
    U.clearTimers();
    resetInput();
    FX.parts.length = 0; FX.pops.length = 0; FX.flash.length = 0; FX.shake = 0; FX.boardPulse = 0;
    S.mode = (mode === 'daily') ? 'daily' : 'marathon';
    S.board = G.newBoard();
    S.score = 0; S.streak = 0; S.lines = 0; S.placed = 0; S.over = false; S.started = true;
    S.best = Math.max(0, Math.round(U.getNum(bestKey(S.mode), 0)));
    if (S.mode === 'daily') {
      S.dailyKey = U.todayKey();
      S.rng = U.makeRng(U.hashStr('gridfall|' + S.dailyKey));
      G.seedBoard(S.board, S.rng);
    } else {
      S.dailyKey = '';
      S.rng = U.makeRng((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);
    }
    S.hand = G.dealHand(S.board, S.rng);
    S.next = G.rollHand(S.rng);
    ovOver.className = 'ov hide';
    $('tabM').className = S.mode === 'marathon' ? 'tab on' : 'tab';
    $('tabD').className = S.mode === 'daily' ? 'tab on' : 'tab';
    syncHud();
  }

  function syncHud() {
    elScore.textContent = String(S.score);
    elBest.textContent = String(Math.max(S.best, S.score));
    elStreak.textContent = String(S.streak);
  }

  function handEmpty() { return !S.hand[0] && !S.hand[1] && !S.hand[2]; }

  function tryPlace(piece, slot, cx, cy) {
    if (S.over || S.paused) return false;
    if (!piece || !G.canPlace(S.board, piece, cx, cy)) return false;
    var cells = G.place(S.board, piece, cx, cy);
    S.hand[slot] = null;
    S.placed++;
    for (var i = 0; i < cells.length; i++) spawnPuff(cells[i][0], cells[i][1], G.COLORS[piece.col], 3);
    var cl = G.clearLines(S.board);
    var perfect = cl.count > 0 && G.isEmpty(S.board);
    if (cl.count > 0) {
      S.streak++;
      S.lines += cl.count;
      for (i = 0; i < cl.cells.length && FX.flash.length < MAXFLASH; i++) {
        FX.flash.push({ x: cl.cells[i][0], y: cl.cells[i][1], t: 0.42, col: G.COLORS[(cl.cells[i][2] || 1) - 1] || '#fff' });
        spawnPuff(cl.cells[i][0], cl.cells[i][1], G.COLORS[(cl.cells[i][2] || 1) - 1] || '#fff', 6);
      }
      FX.shake = Math.min(1, 0.35 + cl.count * 0.18);
      FX.boardPulse = 1;
      var names = ['', 'LINE CLEAR', 'DOUBLE', 'TRIPLE', 'QUAD', 'PENTA', 'MEGA'];
      pop(names[Math.min(cl.count, 6)] + (S.streak > 1 ? '  STREAK x' + S.streak : ''), '#ffe066');
      if (perfect) pop('BOARD WIPE  +300', '#7ed37e');
      Snd.clear(cl.count, S.streak);
      if (perfect) U.later(function () { Snd.perfect(); }, 180);
    } else {
      S.streak = 0;
      Snd.drop();
    }
    S.score += G.scoreFor(piece.n, cl, S.streak, perfect);
    if (handEmpty()) {
      var nx = S.next;
      if (G.handDead(S.board, nx)) nx = G.dealHand(S.board, S.rng);
      S.hand = nx;
      S.next = G.rollHand(S.rng);
    }
    syncHud();
    if (G.handDead(S.board, S.hand)) endRun();
    return true;
  }

  function endRun() {
    if (S.over) return;
    S.over = true;
    resetInput();
    FX.shake = 0.6;
    Snd.over();
    var newBest = S.score > S.best;
    if (newBest) { S.best = S.score; U.setNum(bestKey(S.mode), S.score); }
    var official = true;
    if (S.mode === 'daily') {
      var rec = U.getJSON('daily.result', null);
      var have = rec && typeof rec === 'object' && rec.d === S.dailyKey && isFinite(parseFloat(rec.s));
      if (have) { official = false; }
      else U.setJSON('daily.result', { d: S.dailyKey, s: S.score, l: S.lines });
    }
    var hist = U.pushHistory({ m: S.mode, s: S.score, l: S.lines, d: U.todayKey() });
    U.later(function () { showCard(newBest, official, hist); }, 650);
  }

  function showCard(newBest, official, hist) {
    $('oTitle').textContent = 'NO ROOM LEFT';
    $('oScore').textContent = String(S.score);
    var sub = (S.mode === 'daily' ? 'Daily ' + S.dailyKey : 'Marathon') +
      ' · ' + S.lines + ' lines · best ' + S.best;
    $('oSub').textContent = sub;
    var badge = '';
    if (newBest) badge = '<span class="nb">NEW BEST</span>';
    else if (S.mode === 'daily' && !official) {
      var rec = U.getJSON('daily.result', null);
      var sv = rec && isFinite(parseFloat(rec.s)) ? Math.round(parseFloat(rec.s)) : 0;
      badge = '<div class="sub">Practice run — today\'s logged daily score: ' + sv + '</div>';
    } else if (S.mode === 'daily') badge = '<span class="nb">DAILY LOGGED</span>';
    $('oBadge').innerHTML = badge;
    var rows = '';
    for (var i = 0; i < hist.length; i++) {
      rows += '<div class="row"><i>' + (hist[i].m === 'daily' ? 'Daily' : 'Marathon') +
        ' · ' + (hist[i].d || '') + '</i><b>' + hist[i].s + '</b></div>';
    }
    if (!rows) rows = '<div class="row"><i>no runs yet</i></div>';
    $('histRows').innerHTML = rows;
    ovOver.className = 'ov';
  }

  /* ================= fx ================= */
  function spawnPuff(cx, cy, col, n) {
    var x = L.bx + (cx + 0.5) * L.c, y = L.by + (cy + 0.5) * L.c;
    for (var i = 0; i < n; i++) {
      if (FX.parts.length >= MAXP) break;
      var a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 160;
      FX.parts.push({
        x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
        life: 0.45 + Math.random() * 0.4, max: 0.85, col: col, s: L.c * (0.1 + Math.random() * 0.16)
      });
    }
    while (FX.parts.length > MAXP) FX.parts.shift();
  }
  function pop(text, col) {
    FX.pops.push({ t: 1.1, text: text, col: col || '#fff' });
    while (FX.pops.length > MAXPOP) FX.pops.shift();
  }

  function update(dt) {
    var i, p;
    for (i = FX.parts.length - 1; i >= 0; i--) {
      p = FX.parts[i];
      p.life -= dt;
      if (p.life <= 0) { FX.parts.splice(i, 1); continue; }
      p.vy += 900 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    }
    for (i = FX.flash.length - 1; i >= 0; i--) { FX.flash[i].t -= dt; if (FX.flash[i].t <= 0) FX.flash.splice(i, 1); }
    for (i = FX.pops.length - 1; i >= 0; i--) { FX.pops[i].t -= dt; if (FX.pops[i].t <= 0) FX.pops.splice(i, 1); }
    if (FX.shake > 0) FX.shake = Math.max(0, FX.shake - dt * 2.2);
    if (FX.boardPulse > 0) FX.boardPulse = Math.max(0, FX.boardPulse - dt * 2.5);
  }

  /* ================= drawing ================= */
  function rr(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function block(x, y, s, col, alpha) {
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    var g = s * 0.07;
    ctx.fillStyle = col;
    rr(x + g, y + g, s - g * 2, s - g * 2, s * 0.2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.22)';
    rr(x + g * 2, y + g * 2, s - g * 4, (s - g * 4) * 0.34, s * 0.14); ctx.fill();
    ctx.globalAlpha = 1;
  }
  function drawPiece(piece, x, y, cell, alpha) {
    var c = piece.cells;
    for (var i = 0; i < c.length; i++) block(x + c[i][0] * cell, y + c[i][1] * cell, cell, G.COLORS[piece.col], alpha);
  }

  function previewClears(piece, ox, oy) {
    /* returns map of cells that would clear, for the highlight */
    scratch.set(S.board);
    var c = piece.cells, i, x, y;
    for (i = 0; i < c.length; i++) scratch[(oy + c[i][1]) * N + (ox + c[i][0])] = 9;
    var out = null;
    for (y = 0; y < N; y++) {
      var full = true;
      for (x = 0; x < N; x++) if (!scratch[y * N + x]) { full = false; break; }
      if (full) { out = out || {}; for (x = 0; x < N; x++) out[y * N + x] = 1; }
    }
    for (x = 0; x < N; x++) {
      var f2 = true;
      for (y = 0; y < N; y++) if (!scratch[y * N + x]) { f2 = false; break; }
      if (f2) { out = out || {}; for (y = 0; y < N; y++) out[y * N + x] = 1; }
    }
    return out;
  }

  function render() {
    var W = L.w, H = L.h, c = L.c, i, j;
    ctx.fillStyle = '#0e1220';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    if (FX.shake > 0) {
      var m = FX.shake * c * 0.16;
      ctx.translate((Math.random() * 2 - 1) * m, (Math.random() * 2 - 1) * m);
    }

    /* board frame */
    var pulse = FX.boardPulse;
    ctx.fillStyle = '#151b2e';
    rr(L.bx - c * 0.12, L.by - c * 0.12, L.bs + c * 0.24, L.bs + c * 0.24, c * 0.3); ctx.fill();
    if (pulse > 0) { ctx.strokeStyle = 'rgba(255,224,102,' + (pulse * 0.7).toFixed(3) + ')'; ctx.lineWidth = 3; ctx.stroke(); }

    /* ghost target cells */
    var ghostSet = null, ghostOK = false, gp = null, gx = 0, gy = 0;
    if (drag.on && drag.piece) { gp = drag.piece; gx = drag.gc; gy = drag.gr; ghostOK = drag.ok; }
    else if (kb.on && S.hand[kb.slot] && !S.over) {
      gp = S.hand[kb.slot];
      gx = U.clamp(kb.c, 0, N - gp.w); gy = U.clamp(kb.r, 0, N - gp.h);
      ghostOK = G.canPlace(S.board, gp, gx, gy);
    }
    if (gp && ghostOK) ghostSet = previewClears(gp, gx, gy);

    /* cells */
    for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) {
      var px = L.bx + x * c, py = L.by + y * c, v = S.board[y * N + x];
      var hot = ghostSet && ghostSet[y * N + x];
      if (!v) {
        ctx.fillStyle = hot ? 'rgba(255,224,102,.16)' : ((x + y) & 1 ? '#1b2238' : '#1e2740');
        rr(px + c * 0.07, py + c * 0.07, c * 0.86, c * 0.86, c * 0.2); ctx.fill();
      } else {
        block(px, py, c, G.COLORS[v - 1] || '#888', 1);
        if (hot) { ctx.fillStyle = 'rgba(255,255,255,.3)'; rr(px + c * .07, py + c * .07, c * .86, c * .86, c * .2); ctx.fill(); }
      }
    }
    /* ghost outline */
    if (gp) {
      var cs = gp.cells;
      for (i = 0; i < cs.length; i++) {
        var ex = L.bx + (gx + cs[i][0]) * c, ey = L.by + (gy + cs[i][1]) * c;
        if (ghostOK) { block(ex, ey, c, G.COLORS[gp.col], 0.42); }
        else {
          ctx.globalAlpha = 0.5; ctx.strokeStyle = '#ef6b6b'; ctx.lineWidth = 2;
          rr(ex + c * .1, ey + c * .1, c * .8, c * .8, c * .18); ctx.stroke(); ctx.globalAlpha = 1;
        }
      }
    }
    /* clear flashes */
    for (i = 0; i < FX.flash.length; i++) {
      var f = FX.flash[i], a = f.t / 0.42;
      ctx.globalAlpha = a * 0.85;
      ctx.fillStyle = '#ffffff';
      var s2 = c * (1 + (1 - a) * 0.5), off = (s2 - c) / 2;
      rr(L.bx + f.x * c - off, L.by + f.y * c - off, s2, s2, c * 0.2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    /* particles */
    for (i = 0; i < FX.parts.length; i++) {
      var p = FX.parts[i];
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.max));
      ctx.fillStyle = p.col;
      ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
    }
    ctx.globalAlpha = 1;

    /* hand slots */
    for (i = 0; i < 3; i++) {
      var sx = L.pad + i * L.sw, sy = L.hy, sw = L.sw - 6, sh = L.hh;
      var pc = S.hand[i];
      var isDragged = drag.on && drag.slot === i;
      var sel = kb.on && kb.slot === i && pc;
      ctx.fillStyle = sel ? '#22304f' : '#141a2c';
      rr(sx + 3, sy, sw, sh, c * 0.22); ctx.fill();
      if (sel) { ctx.strokeStyle = '#4d7bea'; ctx.lineWidth = 2; ctx.stroke(); }
      if (pc && !isDragged) {
        var hc = Math.min(sw * 0.8 / pc.w, sh * 0.74 / pc.h, c * 0.7);
        var ox = sx + 3 + (sw - pc.w * hc) / 2, oy = sy + (sh - pc.h * hc) / 2;
        drawPiece(pc, ox, oy, hc, 1);
      }
    }

    /* next hand preview */
    ctx.fillStyle = '#7f8fb8';
    ctx.font = '700 ' + Math.round(c * 0.24) + 'px -apple-system,system-ui,sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('NEXT', L.pad + 2, L.ny + L.nh / 2);
    var lw = Math.max(34, c * 0.95), avail = (W - 2 * L.pad - lw) / 3;
    for (i = 0; i < 3; i++) {
      var np = S.next[i]; if (!np) continue;
      var nc = Math.min(avail * 0.62 / np.w, L.nh * 0.8 / np.h, c * 0.3);
      var nx = L.pad + lw + i * avail + (avail - np.w * nc) / 2;
      var ny = L.ny + (L.nh - np.h * nc) / 2;
      drawPiece(np, nx, ny, nc, 0.55);
    }

    /* dragged piece, lifted above the finger */
    if (drag.on && drag.piece) {
      var dp = drag.piece;
      var px2 = drag.x - dp.w * c / 2, py2 = drag.y - dp.h * c - c * 0.55;
      ctx.globalAlpha = 0.28; ctx.fillStyle = '#000';
      rr(px2 + 4, py2 + 6, dp.w * c, dp.h * c, c * 0.2); ctx.fill(); ctx.globalAlpha = 1;
      drawPiece(dp, px2, py2, c, 1);
    }

    /* combo popups */
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (i = 0; i < FX.pops.length; i++) {
      var q = FX.pops[i], t = q.t / 1.1;
      ctx.globalAlpha = Math.min(1, t * 1.6);
      var yy = L.by + L.bs * 0.42 - (1 - t) * c * 1.6 + i * c * 0.85;
      ctx.font = '800 ' + Math.round(c * (0.44 + (1 - t) * 0.06)) + 'px -apple-system,system-ui,sans-serif';
      ctx.lineWidth = Math.max(3, c * 0.1); ctx.strokeStyle = 'rgba(8,10,20,.9)';
      ctx.strokeText(q.text, L.w / 2, yy);
      ctx.fillStyle = q.col;
      ctx.fillText(q.text, L.w / 2, yy);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  /* ================= input ================= */
  function pos(e) {
    var r = cv.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function slotAt(x, y) {
    if (y < L.hy || y > L.hy + L.hh) return -1;
    var i = Math.floor((x - L.pad) / L.sw);
    return (i >= 0 && i < 3) ? i : -1;
  }
  function updGhost() {
    var p = drag.piece;
    if (!p) return;
    var px = drag.x - p.w * L.c / 2, py = drag.y - p.h * L.c - L.c * 0.55;
    drag.gc = Math.round((px - L.bx) / L.c);
    drag.gr = Math.round((py - L.by) / L.c);
    drag.gc = U.clamp(drag.gc, 0, N - p.w);
    drag.gr = U.clamp(drag.gr, 0, N - p.h);
    drag.ok = G.canPlace(S.board, p, drag.gc, drag.gr);
  }
  function onDown(e) {
    if (!S.started || S.paused || S.over) return;
    if (drag.on) return;
    var q = pos(e), si = slotAt(q.x, q.y);
    if (si < 0 || !S.hand[si]) return;
    drag.on = true; drag.pid = (e.pointerId === undefined ? -2 : e.pointerId);
    drag.slot = si; drag.piece = S.hand[si];
    drag.x = q.x; drag.y = q.y; drag.moved = false;
    kb.on = false;
    updGhost();
    Snd.pick();
    if (cv.setPointerCapture && e.pointerId !== undefined) { try { cv.setPointerCapture(e.pointerId); } catch (er) {} }
    e.preventDefault();
  }
  function onMove(e) {
    if (!drag.on) return;
    var id = (e.pointerId === undefined ? -2 : e.pointerId);
    if (id !== drag.pid) return;
    var q = pos(e);
    drag.x = q.x; drag.y = q.y; drag.moved = true;
    updGhost();
    e.preventDefault();
  }
  function onUp(e) {
    if (!drag.on) return;
    var id = (e.pointerId === undefined ? -2 : e.pointerId);
    if (id !== drag.pid) return;
    var piece = drag.piece, slot = drag.slot, gc = drag.gc, gr = drag.gr, ok = drag.ok;
    drag.on = false; drag.pid = -1; drag.piece = null; drag.slot = -1; drag.moved = false;
    if (ok) tryPlace(piece, slot, gc, gr); else Snd.bad();
    if (e && e.preventDefault) e.preventDefault();
  }
  function onCancel(e) {
    if (!drag.on) return;
    var id = (e && e.pointerId !== undefined) ? e.pointerId : drag.pid;
    if (id !== drag.pid) return;
    drag.on = false; drag.pid = -1; drag.piece = null; drag.slot = -1; drag.moved = false;
  }
  function releaseAll() {
    drag.on = false; drag.pid = -1; drag.piece = null; drag.slot = -1; drag.moved = false;
    kb.keys = Object.create(null);
  }

  if (window.PointerEvent) {
    cv.addEventListener('pointerdown', onDown, { passive: false });
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp, { passive: false });
    window.addEventListener('pointercancel', onCancel, { passive: false });
  } else {
    cv.addEventListener('touchstart', function (e) { var t = e.changedTouches[0]; onDown({ clientX: t.clientX, clientY: t.clientY, pointerId: t.identifier, preventDefault: function () { e.preventDefault(); } }); }, { passive: false });
    window.addEventListener('touchmove', function (e) { var t = e.changedTouches[0]; onMove({ clientX: t.clientX, clientY: t.clientY, pointerId: t.identifier, preventDefault: function () { e.preventDefault(); } }); }, { passive: false });
    window.addEventListener('touchend', function (e) { var t = e.changedTouches[0]; onUp({ clientX: t.clientX, clientY: t.clientY, pointerId: t.identifier, preventDefault: function () { e.preventDefault(); } }); }, { passive: false });
    window.addEventListener('touchcancel', function (e) { onCancel({ pointerId: e.changedTouches[0].identifier }); }, { passive: false });
    cv.addEventListener('mousedown', function (e) { onDown({ clientX: e.clientX, clientY: e.clientY, pointerId: -2, preventDefault: function () { e.preventDefault(); } }); });
    window.addEventListener('mousemove', function (e) { onMove({ clientX: e.clientX, clientY: e.clientY, pointerId: -2, preventDefault: function () {} }); });
    window.addEventListener('mouseup', function (e) { onUp({ clientX: e.clientX, clientY: e.clientY, pointerId: -2, preventDefault: function () {} }); });
  }
  cv.addEventListener('touchstart', function (e) { e.preventDefault(); }, { passive: false });
  cv.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
  cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  /* keyboard */
  function nextSlot(dir) {
    for (var k = 1; k <= 3; k++) {
      var i = ((kb.slot + dir * k) % 3 + 3) % 3;
      if (S.hand[i]) { kb.slot = i; return; }
    }
  }
  window.addEventListener('keydown', function (e) {
    var k = e.key;
    if (k === ' ' || k.indexOf('Arrow') === 0) e.preventDefault();
    kb.keys[k] = 1;
    if (!S.started) { if (k === ' ' || k === 'Enter') begin(); return; }
    if (k === 'r' || k === 'R') { Snd.ui(); start(S.mode); return; }
    if (S.over || S.paused) { if (k === ' ' || k === 'Enter') start(S.mode); return; }
    var p = S.hand[kb.slot];
    if (!p) nextSlot(1), p = S.hand[kb.slot];
    if (k === 'ArrowLeft') { kb.on = true; kb.c--; }
    else if (k === 'ArrowRight') { kb.on = true; kb.c++; }
    else if (k === 'ArrowUp') { kb.on = true; kb.r--; }
    else if (k === 'ArrowDown') { kb.on = true; kb.r++; }
    else if (k === '1' || k === '2' || k === '3') { kb.on = true; var i = parseInt(k, 10) - 1; if (S.hand[i]) { kb.slot = i; Snd.pick(); } }
    else if (k === 'Tab') { e.preventDefault(); kb.on = true; nextSlot(1); Snd.pick(); }
    else if (k === ' ' || k === 'Enter') {
      kb.on = true;
      p = S.hand[kb.slot];
      if (p) {
        var cx = U.clamp(kb.c, 0, N - p.w), cy = U.clamp(kb.r, 0, N - p.h);
        if (!tryPlace(p, kb.slot, cx, cy)) Snd.bad();
        else if (!S.hand[kb.slot]) nextSlot(1);
      }
    }
    if (p) { kb.c = U.clamp(kb.c, 0, N - p.w); kb.r = U.clamp(kb.r, 0, N - p.h); }
    else { kb.c = U.clamp(kb.c, 0, N - 1); kb.r = U.clamp(kb.r, 0, N - 1); }
  });
  window.addEventListener('keyup', function (e) { delete kb.keys[e.key]; });
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', function () { if (document.hidden) releaseAll(); });

  /* buttons */
  function bind(id, fn) {
    var el = $(id);
    el.addEventListener('click', function (e) { e.preventDefault(); Snd.unlock(); Snd.ui(); fn(); });
  }
  bind('tabM', function () { if (S.mode !== 'marathon' || S.over) start('marathon'); });
  bind('tabD', function () { if (S.mode !== 'daily' || S.over) start('daily'); });
  bind('btnAgain', function () { start(S.mode); });
  bind('btnSwap', function () { start(S.mode === 'daily' ? 'marathon' : 'daily'); });
  bind('btnStart', function () { begin(); });

  function begin() {
    Snd.unlock();
    ovStart.className = 'ov hide';
    resize();
    start('marathon');
  }

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', function () { U.later(resize, 120); });

  /* ================= loop ================= */
  var last = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    var dt = (ts - last) / 1000;
    last = ts;
    if (!isFinite(dt) || dt < 0) dt = 0;
    dt = Math.min(dt, 0.05);
    if (!S.paused) update(dt);
    render();
  }

  resize();
  S.best = Math.max(0, Math.round(U.getNum(bestKey('marathon'), 0)));
  syncHud();
  requestAnimationFrame(function (t) { last = t; requestAnimationFrame(frame); });
})();
