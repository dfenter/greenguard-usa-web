/* Chroma Tap - rendering, input, game flow */
(function (g) {
  'use strict';

  var G = g.CTGame, Sfx = g.CT.Sfx, Store = g.CT.Store;
  var W = 390, H = 700;
  var COLS = G.COLS, ROWS = G.ROWS, CELL = 51;
  var BX = Math.round((W - COLS * CELL) / 2), BY = 150;
  var BW = COLS * CELL, BH = ROWS * CELL;

  var PAL = ['#f0525b', '#3aa3ef', '#f5b431', '#3ecb7e', '#ab5cf2', '#f27ac4'];
  var PAL_D = ['#a3282f', '#1b62a0', '#a8760d', '#1d8450', '#6a30a8', '#a44583'];

  var cv = document.getElementById('cv');
  var ctx = cv.getContext('2d', { alpha: false });

  /* ---------------- persistent save ---------------- */
  var save = Store.load();
  Sfx.setMuted(!!save.mute);

  /* ---------------- runtime state ---------------- */
  var S = {
    screen: 'play',        // 'play' | 'levels'
    overlay: 'start',      // 'start' | 'rotate' | 'win' | 'lose' | ''
    prevOverlay: '',
    level: Math.max(1, Math.min(G.MAXLV, save.unlocked)),
    board: null,
    parts: [],
    fx: [],
    floats: [],
    shake: 0,
    t: 0,
    hint: null, hintT: 0,
    sel: 1,
    cur: { x: 3, y: 4 }, kb: false,
    winT: 0, starShown: 0,
    landscape: false
  };
  var hits = [];            // hit rects rebuilt each frame
  var timers = [];          // our own pending setTimeouts (hardening #2)

  function later(fn, ms) {
    if (timers.length > 16) clearTimeout(timers.shift());
    var id = setTimeout(function () {
      var k = timers.indexOf(id); if (k >= 0) timers.splice(k, 1);
      fn();
    }, ms);
    timers.push(id);
  }
  function clearTimers() {
    for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
    timers.length = 0;
    Sfx.clearTimers();
  }

  /* ---------------- input state (hardening #2/#3) ---------------- */
  var pointers = {};        // pointerId -> {x,y,sx,sy,btn}
  var keys = {};

  function resetInput() {
    pointers = {};
    keys = {};
    S.kb = false;
  }

  /* ---------------- level flow ---------------- */
  function newLevel(n, keepScreen) {
    clearTimers();
    resetInput();
    S.level = Math.max(1, Math.min(G.MAXLV, n | 0));
    S.board = new G.Board(G.levelDef(S.level));
    S.parts.length = 0; S.fx.length = 0; S.floats.length = 0;
    S.shake = 0; S.hint = null; S.hintT = 0; S.winT = 0; S.starShown = 0;
    S.cur.x = (COLS / 2) | 0; S.cur.y = (ROWS / 2) | 0;
    if (!keepScreen) S.screen = 'play';
    if (S.overlay !== 'start' && S.overlay !== 'rotate') S.overlay = '';
  }

  function finishLevel() {
    var b = S.board, key = '' + S.level;
    if (b.over === 1) {
      var prevStars = save.stars[key] || 0;
      if (b.stars > prevStars) save.stars[key] = b.stars;
      if (b.score > (save.best[key] || 0)) save.best[key] = b.score;
      if (S.level + 1 > save.unlocked) save.unlocked = Math.min(G.MAXLV, S.level + 1);
      save.totalStars = 0;
      for (var k in save.stars) save.totalStars += save.stars[k];
      Store.save(save);
      S.overlay = 'win'; S.winT = 0; S.starShown = 0;
      Sfx.win();
    } else {
      S.overlay = 'lose';
      Sfx.lose();
    }
  }

  /* ---------------- effects ---------------- */
  function burst(x, y, col, n) {
    for (var i = 0; i < n; i++) {
      if (S.parts.length >= 240) S.parts.shift();
      var a = Math.random() * 6.283, sp = 40 + Math.random() * 190;
      S.parts.push({
        x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
        life: 0.35 + Math.random() * 0.4, max: 0.75, col: col, s: 2 + Math.random() * 4
      });
    }
  }
  function addFx(o) { if (S.fx.length >= 40) S.fx.shift(); o.life = o.life || 0.4; o.max = o.life; S.fx.push(o); }
  function addFloat(x, y, s, col) {
    if (S.floats.length >= 12) S.floats.shift();
    S.floats.push({ x: x, y: y, s: s, col: col || '#fff', life: 0.9 });
  }
  function cellCX(x) { return BX + x * CELL + CELL / 2; }
  function cellCY(y) { return BY + y * CELL + CELL / 2; }

  /* ---------------- gameplay action ---------------- */
  function doTap(cx, cy) {
    var b = S.board;
    if (!b || b.over || S.overlay) return;
    var pre = { crate: b.prog.crate, balloon: b.prog.balloon, gear: b.prog.gear };
    var res = b.tap(cx, cy);
    if (!res) { Sfx.bad(); S.shake = Math.min(S.shake + 2, 4); return; }
    S.hint = null; S.hintT = 0;

    var i, e, n = res.cleared.length;
    for (i = 0; i < res.cleared.length; i++) {
      e = res.cleared[i];
      var c = e[2];
      var col = c.k === 'b' ? PAL[c.c] : (c.k === 'crate' ? '#c08a4a' : (c.k === 'balloon' ? '#ff7ab5' : '#9aa4b8'));
      burst(cellCX(e[0]), cellCY(e[1]), col, c.k === 'b' ? 3 : 7);
    }
    for (i = 0; i < b.events.length; i++) {
      e = b.events[i];
      if (e.t === 'rocket') addFx({ t: 'beam', x: e.x, y: e.y, rot: e.rot, life: 0.32 });
      else if (e.t === 'bomb') { addFx({ t: 'ring', x: e.x, y: e.y, r: CELL * 2.6, life: 0.36 }); S.shake += 7; }
      else if (e.t === 'orb') { addFx({ t: 'flash', life: 0.3 }); S.shake += 5; }
      else if (e.t === 'combo') { addFx({ t: 'flash', life: 0.35 }); S.shake += 9; }
      else if (e.t === 'make') { addFx({ t: 'pulse', x: e.x, y: e.y, life: 0.5 }); Sfx.make(); }
      else if (e.t === 'gear') {
        burst(cellCX(e.x), cellCY(e.y), '#ffd166', 14);
        addFloat(cellCX(e.x), cellCY(e.y) - 10, 'GEAR!', '#ffd166');
      }
      else if (e.t === 'pop') { Sfx.pop(e.n); }
    }
    var hadSpecial = false, hadBig = false;
    for (i = 0; i < b.events.length; i++) {
      var t = b.events[i].t;
      if (t === 'rocket' || t === 'bomb') hadSpecial = true;
      if (t === 'orb' || t === 'combo') hadBig = true;
    }
    if (hadBig) Sfx.orb();
    else if (hadSpecial) Sfx.blast();
    if (b.prog.crate > pre.crate) burstText('CRATE');
    if (b.prog.balloon > pre.balloon) burstText('POP!');

    S.shake = Math.min(S.shake + Math.min(9, n * 0.7), 16);
    if (n >= 4) addFloat(cellCX(cx), cellCY(cy) - 14, '+' + (n * n * 6), '#ffffff');

    if (b.over) later(finishLevel, 420);
    function burstText(s) { addFloat(cellCX(cx), cellCY(cy) - 30, s, '#9ff2ff'); }
  }

  function useHint() {
    var b = S.board;
    if (!b || b.over || S.overlay) return;
    S.hint = b.hint(); S.hintT = 3.2;
    Sfx.click();
  }

  /* ---------------- pointer input ---------------- */
  function local(e) {
    var r = cv.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / (r.width || 1) * W,
      y: (e.clientY - r.top) / (r.height || 1) * H
    };
  }
  function btnAt(x, y) {
    for (var i = hits.length - 1; i >= 0; i--) {
      var b = hits[i];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
    }
    return null;
  }

  function onDown(e) {
    e.preventDefault();
    if (S.overlay === 'rotate') return;
    var p = local(e);
    Sfx.unlock();
    pointers[e.pointerId] = { x: p.x, y: p.y, sx: p.x, sy: p.y, btn: btnAt(p.x, p.y) };
    if (Object.keys(pointers).length > 8) delete pointers[Object.keys(pointers)[0]];
    S.kb = false;
  }
  function onMove(e) {
    var p = pointers[e.pointerId];
    if (!p) return;
    e.preventDefault();
    var l = local(e);
    p.x = l.x; p.y = l.y;
  }
  function onUp(e) {
    var p = pointers[e.pointerId];
    delete pointers[e.pointerId];
    if (!p) return;
    e.preventDefault();
    var moved = Math.abs(p.x - p.sx) + Math.abs(p.y - p.sy);
    if (moved > 22) return;
    Sfx.unlock();
    if (S.overlay === 'start') { S.overlay = ''; Sfx.click(); return; }
    if (S.overlay === 'rotate') return;
    var b = btnAt(p.x, p.y);
    if (b && p.btn && b.id === p.btn.id) doAction(b);
  }
  function onCancel(e) { delete pointers[e.pointerId]; }

  function doAction(b) {
    Sfx.unlock();
    if (b.id === 'cell') {
      doTap(b.cx, b.cy);
      return;
    }
    Sfx.click();
    switch (b.id) {
      case 'retry': newLevel(S.level); break;
      case 'next': newLevel(Math.min(G.MAXLV, S.level + 1)); break;
      case 'levels': S.overlay = ''; S.screen = 'levels'; S.sel = S.level; break;
      case 'back': S.screen = 'play'; break;
      case 'hint': useHint(); break;
      case 'sound':
        save.mute = save.mute ? 0 : 1; Sfx.setMuted(!!save.mute); Store.save(save);
        break;
      case 'pick':
        if (b.n <= save.unlocked) { newLevel(b.n); S.screen = 'play'; }
        break;
    }
  }

  cv.addEventListener('pointerdown', onDown, { passive: false });
  cv.addEventListener('pointermove', onMove, { passive: false });
  cv.addEventListener('pointerup', onUp, { passive: false });
  cv.addEventListener('pointercancel', onCancel, { passive: false });
  cv.addEventListener('pointerleave', onCancel, { passive: false });
  cv.addEventListener('touchstart', function (e) { e.preventDefault(); }, { passive: false });
  cv.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
  cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  window.addEventListener('blur', function () { resetInput(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) resetInput(); });

  /* ---------------- keyboard ---------------- */
  window.addEventListener('keydown', function (e) {
    var k = e.key;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Enter'].indexOf(k) >= 0) e.preventDefault();
    if (keys[k]) return;
    keys[k] = 1;
    Sfx.unlock();
    if (S.overlay === 'start') { if (k === ' ' || k === 'Enter') S.overlay = ''; return; }
    if (S.overlay === 'rotate') return;
    S.kb = true;
    if (S.screen === 'levels') {
      if (k === 'ArrowLeft') S.sel = Math.max(1, S.sel - 1);
      else if (k === 'ArrowRight') S.sel = Math.min(G.MAXLV, S.sel + 1);
      else if (k === 'ArrowUp') S.sel = Math.max(1, S.sel - 5);
      else if (k === 'ArrowDown') S.sel = Math.min(G.MAXLV, S.sel + 5);
      else if (k === ' ' || k === 'Enter') { if (S.sel <= save.unlocked) { newLevel(S.sel); S.screen = 'play'; } }
      else if (k === 'Escape') S.screen = 'play';
      return;
    }
    if (S.overlay === 'win') {
      if (k === ' ' || k === 'Enter') newLevel(Math.min(G.MAXLV, S.level + 1));
      else if (k === 'r' || k === 'R') newLevel(S.level);
      else if (k === 'Escape') { S.overlay = ''; S.screen = 'levels'; }
      return;
    }
    if (S.overlay === 'lose') {
      if (k === ' ' || k === 'Enter' || k === 'r' || k === 'R') newLevel(S.level);
      else if (k === 'Escape') { S.overlay = ''; S.screen = 'levels'; }
      return;
    }
    if (k === 'ArrowLeft') S.cur.x = (S.cur.x + COLS - 1) % COLS;
    else if (k === 'ArrowRight') S.cur.x = (S.cur.x + 1) % COLS;
    else if (k === 'ArrowUp') S.cur.y = (S.cur.y + ROWS - 1) % ROWS;
    else if (k === 'ArrowDown') S.cur.y = (S.cur.y + 1) % ROWS;
    else if (k === ' ' || k === 'Enter') doTap(S.cur.x, S.cur.y);
    else if (k === 'r' || k === 'R') newLevel(S.level);
    else if (k === 'h' || k === 'H') useHint();
    else if (k === 'Escape') S.screen = 'levels';
  });
  window.addEventListener('keyup', function (e) { delete keys[e.key]; });

  /* ---------------- canvas fit ---------------- */
  var dpr = 1;
  function fit() {
    var vw = window.innerWidth || W, vh = window.innerHeight || H;
    var wasLandscape = S.landscape;
    var scale = Math.min(vw / W, vh / H);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    dpr = Math.min(dpr, 960 / H);
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    cv.style.width = Math.floor(W * scale) + 'px';
    cv.style.height = Math.floor(H * scale) + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.textBaseline = 'middle';
    S.landscape = vw > vh * 1.12 && vh < 520;
    if (S.landscape && !wasLandscape) resetInput();
  }
  window.addEventListener('resize', fit);
  window.addEventListener('orientationchange', function () { later(fit, 120); });

  /* ---------------- drawing helpers ---------------- */
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function txt(s, x, y, size, col, align, weight) {
    ctx.fillStyle = col || '#fff';
    ctx.font = (weight || '700') + ' ' + size + 'px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Arial, sans-serif';
    ctx.textAlign = align || 'left';
    ctx.fillText(s, x, y);
  }
  function button(id, x, y, w, h, label, opts) {
    opts = opts || {};
    var held = false, k;
    for (k in pointers) {
      var p = pointers[k];
      if (p.btn && p.btn.id === id && p.btn.n === opts.n) held = true;
    }
    var yy = y + (held ? 2 : 0);
    ctx.fillStyle = opts.shadow || '#05070f';
    rr(x, y + 4, w, h, 12); ctx.fill();
    ctx.fillStyle = opts.bg || (held ? '#2f3f66' : '#26365c');
    rr(x, yy, w, h, 12); ctx.fill();
    ctx.strokeStyle = opts.border || 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 2; rr(x, yy, w, h, 12); ctx.stroke();
    if (label) txt(label, x + w / 2, yy + h / 2 + 1, opts.size || 17, opts.fg || '#eaf1ff', 'center');
    hits.push({ id: id, x: x, y: y, w: w, h: h + 4, n: opts.n, cx: opts.cx, cy: opts.cy });
    return { x: x, y: yy, w: w, h: h };
  }

  /* shapes per colour = colour-blind readable */
  function glyph(i, cx, cy, r) {
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.beginPath();
    switch (i) {
      case 0: ctx.arc(cx, cy, r * 0.5, 0, 6.283); break;
      case 1: ctx.rect(cx - r * 0.45, cy - r * 0.45, r * 0.9, r * 0.9); break;
      case 2: ctx.moveTo(cx, cy - r * 0.55); ctx.lineTo(cx + r * 0.55, cy + r * 0.45); ctx.lineTo(cx - r * 0.55, cy + r * 0.45); break;
      case 3: ctx.moveTo(cx, cy - r * 0.6); ctx.lineTo(cx + r * 0.6, cy); ctx.lineTo(cx, cy + r * 0.6); ctx.lineTo(cx - r * 0.6, cy); break;
      case 4: ctx.rect(cx - r * 0.55, cy - r * 0.17, r * 1.1, r * 0.34); ctx.rect(cx - r * 0.17, cy - r * 0.55, r * 0.34, r * 1.1); break;
      default:
        for (var k = 0; k < 5; k++) {
          var a = -1.5708 + k * 1.2566;
          var px = cx + Math.cos(a) * r * 0.55, py = cy + Math.sin(a) * r * 0.55;
          if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
    }
    ctx.fill();
  }

  function drawTile(c, x, y, size, ghost) {
    var pad = 3, s = size - pad * 2, cx = x + size / 2, cy = y + size / 2;
    if (c.k === 'b') {
      ctx.fillStyle = PAL_D[c.c % 6];
      rr(x + pad, y + pad + 3, s, s, 10); ctx.fill();
      ctx.fillStyle = PAL[c.c % 6];
      rr(x + pad, y + pad, s, s - 2, 10); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.20)';
      rr(x + pad + 4, y + pad + 4, s - 8, (s - 8) * 0.34, 7); ctx.fill();
      if (c.sp === G.SP_NONE) glyph(c.c % 6, cx, cy + 1, size * 0.30);
      else drawSpecial(c, cx, cy, size);
      if (c.flash > 0) {
        ctx.fillStyle = 'rgba(255,255,255,' + (c.flash * 0.7).toFixed(3) + ')';
        rr(x + pad, y + pad, s, s - 2, 10); ctx.fill();
      }
    } else if (c.k === 'crate') {
      ctx.fillStyle = '#7a5124'; rr(x + pad, y + pad + 3, s, s, 8); ctx.fill();
      ctx.fillStyle = '#b9823c'; rr(x + pad, y + pad, s, s - 2, 8); ctx.fill();
      ctx.strokeStyle = '#6b4519'; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + pad + 4, y + pad + 4); ctx.lineTo(x + pad + s - 4, y + pad + s - 8);
      ctx.moveTo(x + pad + s - 4, y + pad + 4); ctx.lineTo(x + pad + 4, y + pad + s - 8);
      ctx.stroke();
    } else if (c.k === 'balloon') {
      ctx.strokeStyle = '#dfe6ff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx, cy + size * 0.22); ctx.lineTo(cx + 3, cy + size * 0.42); ctx.stroke();
      ctx.fillStyle = '#ff6fb0';
      ctx.beginPath(); ctx.ellipse(cx, cy - 2, size * 0.30, size * 0.34, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath(); ctx.ellipse(cx - size * 0.10, cy - size * 0.13, size * 0.08, size * 0.11, 0.5, 0, 6.283); ctx.fill();
    } else if (c.k === 'gear') {
      ctx.fillStyle = '#8f9bb3';
      ctx.beginPath(); ctx.arc(cx, cy, size * 0.32, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#c6d0e4';
      for (var i = 0; i < 8; i++) {
        var a = i * 0.785;
        ctx.save(); ctx.translate(cx + Math.cos(a) * size * 0.32, cy + Math.sin(a) * size * 0.32);
        ctx.rotate(a); ctx.fillRect(-size * 0.06, -size * 0.06, size * 0.13, size * 0.12); ctx.restore();
      }
      ctx.fillStyle = '#0e1526';
      ctx.beginPath(); ctx.arc(cx, cy, size * 0.12, 0, 6.283); ctx.fill();
    }
    if (ghost) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; rr(x + pad, y + pad, s, s, 10); ctx.fill(); }
  }

  function drawSpecial(c, cx, cy, size) {
    var r = size * 0.30;
    if (c.sp === G.SP_ROCKET) {
      ctx.save(); ctx.translate(cx, cy); if (c.rot) ctx.rotate(-1.5708);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(-r, -r * 0.5); ctx.lineTo(0, -r * 0.5); ctx.lineTo(r * 0.9, 0); ctx.lineTo(0, r * 0.5); ctx.lineTo(-r, r * 0.5);
      ctx.lineTo(-r * 0.5, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillRect(-r * 1.35, -r * 0.18, r * 0.3, r * 0.36);
      ctx.restore();
    } else if (c.sp === G.SP_BOMB) {
      ctx.fillStyle = '#12172a';
      ctx.beginPath(); ctx.arc(cx, cy + 2, r, 0, 6.283); ctx.fill();
      ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(cx + r * 0.4, cy - r * 0.7); ctx.quadraticCurveTo(cx + r, cy - r * 1.3, cx + r * 1.1, cy - r * 0.5); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath(); ctx.arc(cx - r * 0.35, cy - r * 0.25, r * 0.2, 0, 6.283); ctx.fill();
    } else {
      for (var i = 0; i < 5; i++) {
        ctx.strokeStyle = PAL[(i + Math.floor(S.t * 3)) % 6];
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cx, cy, r * (0.28 + i * 0.19), i * 1.2 + S.t * 2, i * 1.2 + S.t * 2 + 2.6); ctx.stroke();
      }
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.2, 0, 6.283); ctx.fill();
    }
  }

  /* ---------------- HUD ---------------- */
  function goalIcon(kind, x, y, s, col) {
    var fake = { k: kind === 'pop' ? 'b' : kind, c: col || 0, sp: 0, flash: 0 };
    drawTile(fake, x - s / 2, y - s / 2, s, false);
  }

  function drawHUD() {
    var b = S.board;
    ctx.fillStyle = '#131a30';
    rr(10, 6, W - 20, 44, 12); ctx.fill();
    txt('LEVEL ' + S.level, 22, 28, 15, '#8fa3cc', 'left');
    txt('' + b.movesLeft, W / 2, 27, 27, b.movesLeft <= 3 ? '#ff6b74' : '#ffffff', 'center');
    txt('MOVES', W / 2, 44, 9, '#8fa3cc', 'center');
    txt(b.score.toLocaleString ? b.score.toLocaleString() : '' + b.score, W - 22, 22, 15, '#eaf1ff', 'right');
    var best = save.best['' + S.level] || 0;
    txt('best ' + best, W - 22, 38, 10, '#8fa3cc', 'right');

    // goals
    var gs = b.goalsLeft(), n = gs.length;
    var gw = Math.min(112, Math.floor((W - 30) / Math.max(1, n)) - 6);
    var startX = W / 2 - (n * (gw + 6) - 6) / 2;
    for (var i = 0; i < n; i++) {
      var gx = startX + i * (gw + 6), gy = 56, gh = 38;
      var done = gs[i].have >= gs[i].need;
      ctx.fillStyle = done ? '#1c3d2c' : '#131a30';
      rr(gx, gy, gw, gh, 10); ctx.fill();
      if (done) { ctx.strokeStyle = '#3ecb7e'; ctx.lineWidth = 2; rr(gx, gy, gw, gh, 10); ctx.stroke(); }
      goalIcon(gs[i].k, gx + 20, gy + gh / 2, 30, gs[i].c);
      var lbl = done ? 'DONE' : (gs[i].have + '/' + gs[i].need);
      txt(lbl, gx + 38, gy + gh / 2 + 1, 14, done ? '#7ff0ad' : '#eaf1ff', 'left');
    }

    // next-spawn preview: what falls into each column next
    ctx.fillStyle = '#0f1426';
    rr(BX - 5, 100, BW + 10, 44, 10); ctx.fill();
    txt('NEXT SPAWN', BX - 1, 108, 8.5, '#8fa3cc', 'left');
    for (var x = 0; x < COLS; x++) {
      var q = b.queue[x] || [];
      for (var r2 = 0; r2 < 2; r2++) {
        var px = BX + x * CELL + CELL / 2, py = r2 === 0 ? 121 : 135;
        var c = q[r2 === 0 ? 1 : 0];
        if (typeof c !== 'number') continue;
        var sz = r2 === 0 ? 11 : 17;
        ctx.globalAlpha = r2 === 0 ? 0.45 : 1;
        ctx.fillStyle = PAL[c % 6];
        rr(px - sz / 2, py - sz / 2, sz, sz, 4); ctx.fill();
        if (r2 === 1) glyph(c % 6, px, py, sz * 0.52);
        ctx.globalAlpha = 1;
      }
    }
  }

  /* ---------------- board ---------------- */
  function drawBoard() {
    var b = S.board, x, y;
    ctx.fillStyle = '#0f1426';
    rr(BX - 5, BY - 5, BW + 10, BH + 10, 14); ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.rect(BX - 3, BY - 3, BW + 6, BH + 6); ctx.clip();
    ctx.fillStyle = '#0a0f1e';
    for (y = 0; y < ROWS; y++) for (x = 0; x < COLS; x++) {
      if ((x + y) % 2) { ctx.fillRect(BX + x * CELL, BY + y * CELL, CELL, CELL); }
    }
    var hintSet = {};
    if (S.hint && S.hintT > 0) for (var i = 0; i < S.hint.length; i++) hintSet[S.hint[i][0] + ',' + S.hint[i][1]] = 1;

    for (y = 0; y < ROWS; y++) for (x = 0; x < COLS; x++) {
      var c = b.cells[y * COLS + x];
      if (!c) continue;
      var px = BX + x * CELL, py = BY + (y + c.oy) * CELL;
      drawTile(c, px, py, CELL, false);
      if (hintSet[x + ',' + y]) {
        var a = 0.35 + 0.3 * Math.sin(S.t * 9);
        ctx.strokeStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')';
        ctx.lineWidth = 3; rr(px + 3, py + 3, CELL - 6, CELL - 6, 10); ctx.stroke();
      }
    }
    // fx inside board
    for (i = 0; i < S.fx.length; i++) {
      var f = S.fx[i], k = f.life / f.max;
      if (f.t === 'beam') {
        ctx.fillStyle = 'rgba(255,255,255,' + (k * 0.75).toFixed(3) + ')';
        if (f.rot) ctx.fillRect(BX + f.x * CELL + CELL * 0.28, BY, CELL * 0.44, BH);
        else ctx.fillRect(BX, BY + f.y * CELL + CELL * 0.28, BW, CELL * 0.44);
      } else if (f.t === 'ring') {
        ctx.strokeStyle = 'rgba(255,209,102,' + (k * 0.9).toFixed(3) + ')';
        ctx.lineWidth = 6 * k + 2;
        ctx.beginPath(); ctx.arc(cellCX(f.x), cellCY(f.y), f.r * (1 - k) + 8, 0, 6.283); ctx.stroke();
      } else if (f.t === 'pulse') {
        ctx.strokeStyle = 'rgba(255,255,255,' + (k * 0.9).toFixed(3) + ')';
        ctx.lineWidth = 4;
        var rr2 = CELL * (0.4 + (1 - k) * 0.7);
        ctx.beginPath(); ctx.arc(cellCX(f.x), cellCY(f.y), rr2, 0, 6.283); ctx.stroke();
      }
    }
    // particles
    for (i = 0; i < S.parts.length; i++) {
      var p = S.parts[i];
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.max));
      ctx.fillStyle = p.col;
      ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
    }
    ctx.globalAlpha = 1;
    // cursor
    if (S.kb) {
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
      rr(BX + S.cur.x * CELL + 2, BY + S.cur.y * CELL + 2, CELL - 4, CELL - 4, 11); ctx.stroke();
    }
    ctx.restore();

    // floats
    for (i = 0; i < S.floats.length; i++) {
      var fl = S.floats[i];
      ctx.globalAlpha = Math.max(0, Math.min(1, fl.life / 0.9));
      txt(fl.s, fl.x, fl.y, 18, fl.col, 'center');
      ctx.globalAlpha = 1;
    }

    // touch hit rects for cells
    for (y = 0; y < ROWS; y++) for (x = 0; x < COLS; x++) {
      hits.push({ id: 'cell', x: BX + x * CELL, y: BY + y * CELL, w: CELL, h: CELL, cx: x, cy: y });
    }
  }

  function drawFooter() {
    var bw = (W - 30 - 16) / 3;
    button('retry', 15, 566, bw, 50, 'RESTART');
    button('hint', 15 + bw + 8, 566, bw, 50, 'HINT');
    button('levels', 15 + (bw + 8) * 2, 566, bw, 50, 'LEVELS');
    txt('Tap 2+ same tiles to collapse — 5+ builds a rocket, 7+ a bomb, 9+ an orb.',
      W / 2, 634, 11.5, '#93a6cf', 'center', '600');
    txt(save.mute ? 'SOUND OFF' : 'SOUND ON', W - 22, 668, 11.5, '#6d80a8', 'right', '700');
    hits.push({ id: 'sound', x: W - 135, y: 644, w: 120, h: 48 });
    txt('All 25 levels free • no lives, no timers', 15, 668, 11, '#6d80a8', 'left', '600');
  }

  /* ---------------- overlays ---------------- */
  function panel(x, y, w, h) {
    ctx.fillStyle = 'rgba(4,7,16,0.82)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#151d36';
    rr(x, y, w, h, 18); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 2;
    rr(x, y, w, h, 18); ctx.stroke();
  }
  function drawStars(cx, cy, n, shown, size) {
    for (var i = 0; i < 3; i++) {
      var on = i < shown;
      var sx = cx + (i - 1) * (size * 1.5);
      ctx.save(); ctx.translate(sx, cy);
      var sc = on ? 1 : 0.8;
      ctx.scale(sc, sc);
      ctx.beginPath();
      for (var k = 0; k < 10; k++) {
        var a = -1.5708 + k * 0.6283, r = (k % 2 ? size * 0.42 : size);
        var px = Math.cos(a) * r, py = Math.sin(a) * r;
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = on ? '#ffd166' : '#2a3454'; ctx.fill();
      ctx.restore();
    }
  }

  function drawWin() {
    panel(30, 170, W - 60, 330);
    txt('LEVEL CLEAR', W / 2, 214, 26, '#ffffff', 'center');
    drawStars(W / 2, 272, 3, S.starShown, 22);
    txt('SCORE  ' + S.board.score, W / 2, 322, 18, '#eaf1ff', 'center');
    var best = save.best['' + S.level] || 0;
    txt('best ' + best + '   •   moves left ' + S.board.movesLeft, W / 2, 348, 12, '#93a6cf', 'center');
    var bw = (W - 60 - 40 - 12) / 2;
    if (S.level < G.MAXLV) {
      button('retry', 50, 380, bw, 52, 'REPLAY');
      button('next', 50 + bw + 12, 380, bw, 52, 'NEXT', { bg: '#2f7d54' });
    } else {
      button('retry', 50, 380, bw, 52, 'REPLAY');
      button('levels', 50 + bw + 12, 380, bw, 52, 'LEVELS', { bg: '#2f7d54' });
    }
    button('levels', 50, 444, W - 100, 46, 'LEVEL SELECT', { bg: '#1d2743' });
  }

  function drawLose() {
    panel(30, 200, W - 60, 270);
    txt('OUT OF MOVES', W / 2, 244, 24, '#ff8a92', 'center');
    txt('No lives here — retry as often as you like.', W / 2, 278, 12.5, '#93a6cf', 'center', '600');
    var gs = S.board.goalsLeft(), left = [];
    for (var i = 0; i < gs.length; i++) if (gs[i].have < gs[i].need) left.push((gs[i].need - gs[i].have) + ' ' + gs[i].k);
    txt(left.length ? 'still needed: ' + left.join(', ') : '', W / 2, 302, 12, '#c8d4ef', 'center', '600');
    var bw = (W - 60 - 40 - 12) / 2;
    button('retry', 50, 330, bw, 52, 'RETRY', { bg: '#2f7d54' });
    button('levels', 50 + bw + 12, 330, bw, 52, 'LEVELS');
    txt('Tip: plan around the NEXT SPAWN preview above the board.', W / 2, 424, 11.5, '#93a6cf', 'center', '600');
  }

  function drawStart() {
    ctx.fillStyle = 'rgba(4,7,16,0.88)';
    ctx.fillRect(0, 0, W, H);
    for (var i = 0; i < 6; i++) {
      var x = W / 2 + (i - 2.5) * 44, y = 240 + Math.sin(S.t * 2 + i) * 8;
      drawTile({ k: 'b', c: i, sp: 0, flash: 0 }, x - 20, y - 20, 40, false);
    }
    txt('CHROMA TAP', W / 2, 330, 34, '#ffffff', 'center');
    txt('collapse • build • combo', W / 2, 362, 14, '#93a6cf', 'center', '600');
    button('start', W / 2 - 90, 420, 180, 56, 'TAP TO PLAY', { bg: '#2f7d54' });
    txt('Level ' + S.level + '  •  ' + save.totalStars + '/75 stars', W / 2, 508, 13, '#93a6cf', 'center', '600');
    txt('Keyboard: arrows + space, R restart, H hint', W / 2, 540, 11, '#6d80a8', 'center', '600');
  }

  function drawRotate() {
    ctx.fillStyle = '#0b0e1a'; ctx.fillRect(0, 0, W, H);
    txt('ROTATE TO PORTRAIT', W / 2, H / 2 - 20, 22, '#ffffff', 'center');
    txt('Chroma Tap is played upright.', W / 2, H / 2 + 12, 14, '#93a6cf', 'center', '600');
    ctx.strokeStyle = '#3aa3ef'; ctx.lineWidth = 4;
    rr(W / 2 - 34, H / 2 + 50, 68, 108, 12); ctx.stroke();
  }

  function drawLevels() {
    ctx.fillStyle = '#0b0e1a'; ctx.fillRect(0, 0, W, H);
    txt('CHROMA TAP', W / 2, 46, 26, '#ffffff', 'center');
    txt(save.totalStars + ' / 75 stars earned', W / 2, 76, 13, '#93a6cf', 'center', '600');
    var size = 62, gap = 8, sx = (W - (5 * size + 4 * gap)) / 2, sy = 110;
    for (var i = 0; i < G.MAXLV; i++) {
      var n = i + 1, cx = sx + (i % 5) * (size + gap), cy = sy + Math.floor(i / 5) * (size + gap + 12);
      var open = n <= save.unlocked;
      var sel = S.kb && n === S.sel;
      button('pick', cx, cy, size, size, '', {
        n: n, bg: open ? (n === S.level ? '#2f7d54' : '#26365c') : '#171d30',
        border: sel ? '#ffffff' : 'rgba(255,255,255,0.14)'
      });
      txt('' + n, cx + size / 2, cy + size / 2 - 6, 20, open ? '#eaf1ff' : '#44507a', 'center');
      var st = save.stars['' + n] || 0;
      for (var k = 0; k < 3; k++) {
        ctx.fillStyle = k < st ? '#ffd166' : 'rgba(255,255,255,0.14)';
        ctx.beginPath(); ctx.arc(cx + size / 2 + (k - 1) * 11, cy + size - 15, 3.6, 0, 6.283); ctx.fill();
      }
      if (!open) {
        ctx.fillStyle = '#44507a';
        ctx.fillRect(cx + size / 2 - 6, cy + size / 2 + 6, 12, 9);
        ctx.strokeStyle = '#44507a'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx + size / 2, cy + size / 2 + 6, 4, 3.14, 0); ctx.stroke();
      }
    }
    button('back', 15, 620, W - 30, 54, 'BACK TO LEVEL ' + S.level);
    txt('Everything is free. Stars are play-earned.', W / 2, 604, 11.5, '#6d80a8', 'center', '600');
  }

  /* ---------------- update ---------------- */
  function update(dt) {
    S.t += dt;
    var b = S.board, i;
    // tile physics (units = rows)
    for (i = 0; i < b.cells.length; i++) {
      var c = b.cells[i];
      if (!c) continue;
      if (c.oy < 0) {
        c.vy += 46 * dt;
        c.oy += c.vy * dt;
        if (c.oy >= 0) { c.oy = 0; c.vy = 0; }
      } else if (c.oy > 0) {
        c.oy -= 7 * dt;
        if (c.oy <= 0) c.oy = 0;
      }
      if (c.flash > 0) c.flash = Math.max(0, c.flash - dt * 2.4);
    }
    for (i = S.parts.length - 1; i >= 0; i--) {
      var p = S.parts[i];
      p.life -= dt;
      if (p.life <= 0) { S.parts.splice(i, 1); continue; }
      p.vy += 520 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    }
    for (i = S.fx.length - 1; i >= 0; i--) { S.fx[i].life -= dt; if (S.fx[i].life <= 0) S.fx.splice(i, 1); }
    for (i = S.floats.length - 1; i >= 0; i--) {
      S.floats[i].life -= dt; S.floats[i].y -= 34 * dt;
      if (S.floats[i].life <= 0) S.floats.splice(i, 1);
    }
    if (S.shake > 0) S.shake = Math.max(0, S.shake - dt * 34);
    if (S.hintT > 0) S.hintT = Math.max(0, S.hintT - dt);
    if (S.overlay === 'win') {
      S.winT += dt;
      var want = Math.min(S.board.stars, Math.floor(S.winT / 0.32));
      if (want > S.starShown) { S.starShown = want; Sfx.star(want - 1); }
    }
  }

  /* ---------------- frame ---------------- */
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = (now - last) / 1000;
    last = now;
    if (!isFinite(dt) || dt < 0) dt = 0;
    dt = Math.min(dt, 0.05);

    // rotate overlay pauses the sim (hardening #1)
    if (S.landscape && S.overlay !== 'rotate') {
      S.prevOverlay = S.overlay; S.overlay = 'rotate'; resetInput();
    } else if (!S.landscape && S.overlay === 'rotate') {
      S.overlay = S.prevOverlay || ''; S.prevOverlay = '';
    }
    var paused = (S.overlay === 'rotate' || S.overlay === 'start');
    if (!paused) update(dt);

    hits.length = 0;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0b0e1a';
    ctx.fillRect(0, 0, W, H);

    if (S.overlay === 'rotate') { drawRotate(); return; }

    ctx.save();
    if (S.shake > 0.2) {
      ctx.translate((Math.random() - 0.5) * S.shake, (Math.random() - 0.5) * S.shake);
    }
    if (S.screen === 'levels') {
      drawLevels();
    } else {
      drawHUD();
      drawBoard();
      drawFooter();
      if (S.overlay === 'win') drawWin();
      else if (S.overlay === 'lose') drawLose();
    }
    ctx.restore();
    if (S.overlay === 'start') { hits.length = 0; drawStart(); }
  }

  /* ---------------- boot ---------------- */
  var last = 0;
  fit();
  newLevel(S.level);
  S.overlay = 'start';
  last = performance.now();
  requestAnimationFrame(frame);
})(window);
