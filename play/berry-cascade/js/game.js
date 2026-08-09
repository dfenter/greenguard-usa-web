/* Berry Cascade - scenes, rendering, input, main loop */
(function (BC) {
  'use strict';

  var canvas, g, W = 390, H = 700, dpr = 1;
  var save = BC.Store.read();
  var scene = 'map';
  var paused = false, booted = false;
  var lastT = 0;

  var COL = ['#ff4d6d', '#ffb020', '#7bd94a', '#35d0e6', '#a97bff', '#ff8ad8'];
  var COLD = ['#8c1f36', '#8a5a08', '#3d7220', '#146a78', '#553a91', '#8c3f74'];
  var SP = BC.SP, EMPTY = BC.EMPTY, ACORN = BC.ACORN, PRISMC = BC.PRISMC;

  /* ---------------- UI buttons ---------------- */
  var Buttons = [];
  function btn(id, x, y, w, h, label, style) {
    Buttons.push({ id: id, x: x, y: y, w: w, h: h, label: label, style: style || 'main' });
    return Buttons[Buttons.length - 1];
  }
  function hitBtn(x, y) {
    for (var i = Buttons.length - 1; i >= 0; i--) {
      var b = Buttons[i];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
    }
    return null;
  }

  /* ---------------- map scene ---------------- */
  var MAPTOP = 96, STEP = 108;
  var map = { scroll: 0, maxScroll: 0, sel: 0, nodes: [] };
  function buildMapNodes() {
    map.nodes.length = 0;
    for (var i = 0; i < 30; i++) {
      map.nodes.push({ x: W / 2 + Math.sin(i * 0.85) * Math.min(W * 0.29, 118), i: i });
    }
    map.maxScroll = Math.max(0, 29 * STEP - (H - 70 - MAPTOP - 70));
    map.scroll = BC.clamp(map.scroll, 0, map.maxScroll);
  }
  function nodeScreenY(i) { return (H - 70) - i * STEP + map.scroll; }

  /* ---------------- play scene ---------------- */
  var P = null;
  var pending = -1, pendingDrawn = false;

  // level generation runs a validation playout batch; show a frame first so it never stalls silently
  function queueLevel(n) { pending = n; pendingDrawn = false; scene = 'loading'; }
  function drawLoading() {
    bg();
    Buttons.length = 0;
    text('GROVE ' + (pending + 1), W / 2, H / 2 - 26, 24, '#ffd45e');
    text(BC.levelName(pending), W / 2, H / 2 + 4, 16, '#fff', 'center', 600);
    text('checking every grove is winnable…', W / 2, H / 2 + 34, 12, '#9d97be', 'center', 600);
  }

  function newPlay(levelIndex, endless) {
    BC.Timers.clearAll();
    BC.Input.reset();
    BC.Fx.reset();
    var lv = endless ? BC.endlessLevel(0) : BC.getLevel(levelIndex);
    var init = BC.initBoardFor(lv);
    P = {
      endless: !!endless, lv: lv, b: init.board, rand: init.rand,
      st: BC.newState(lv),
      phase: 'idle', t: 0,
      swapA: -1, swapB: -1,
      popping: [], chain: 0,
      oy: new Float32Array(init.board.n), vy: new Float32Array(init.board.n),
      sq: new Float32Array(init.board.n),
      sel: -1, cx: 3, cy: 4,
      dragId: null, dragCell: -1, dragX: 0, dragY: 0, dragged: false,
      over: 0, stars: 0, stage: 0, nextBonus: 3000, bonusCount: 0,
      acornAnim: [], newSpecials: [],
      hintT: 0
    };
    layoutBoard();
  }

  var BX = 0, BY = 0, CS = 46, HUDH = 112, BOTH = 76;
  function layoutBoard() {
    HUDH = H < 620 ? 104 : 116;
    BOTH = H < 620 ? 74 : 86;
    var availW = W - 16, availH = H - HUDH - BOTH - 12;
    CS = Math.floor(Math.min(availW / BC.W, availH / BC.H));
    if (CS < 24) CS = 24;
    BX = Math.round((W - CS * BC.W) / 2);
    BY = Math.round(HUDH + (availH - CS * BC.H) / 2) + 4;
  }

  /* ---------------- drawing helpers ---------------- */
  function rr(x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function text(s, x, y, size, col, align, weight) {
    g.font = (weight || 700) + ' ' + size + 'px ui-sans-serif,system-ui,-apple-system,sans-serif';
    g.textAlign = align || 'center'; g.textBaseline = 'middle';
    g.fillStyle = col; g.fillText(s, x, y);
  }
  function shapePath(shape, cx, cy, r) {
    var i, a;
    g.beginPath();
    if (shape === 0) { g.arc(cx, cy, r, 0, 6.2832); }
    else if (shape === 1) {
      var q = r * 0.88;
      g.moveTo(cx - q + 5, cy - q); g.arcTo(cx + q, cy - q, cx + q, cy + q, 6);
      g.arcTo(cx + q, cy + q, cx - q, cy + q, 6); g.arcTo(cx - q, cy + q, cx - q, cy - q, 6);
      g.arcTo(cx - q, cy - q, cx + q, cy - q, 6); g.closePath();
    }
    else if (shape === 2) {
      g.moveTo(cx, cy - r * 1.05);
      g.lineTo(cx + r * 0.98, cy + r * 0.75);
      g.lineTo(cx - r * 0.98, cy + r * 0.75);
      g.closePath();
    }
    else if (shape === 3) {
      g.moveTo(cx, cy - r * 1.1); g.lineTo(cx + r * 0.92, cy); g.lineTo(cx, cy + r * 1.1); g.lineTo(cx - r * 0.92, cy); g.closePath();
    }
    else if (shape === 4) {
      for (i = 0; i < 6; i++) { a = -Math.PI / 2 + i * Math.PI / 3; var px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r; if (i === 0) g.moveTo(px, py); else g.lineTo(px, py); }
      g.closePath();
    }
    else {
      for (i = 0; i < 10; i++) {
        a = -Math.PI / 2 + i * Math.PI / 5;
        var rad = (i % 2 === 0) ? r * 1.08 : r * 0.5;
        var sx = cx + Math.cos(a) * rad, sy = cy + Math.sin(a) * rad;
        if (i === 0) g.moveTo(sx, sy); else g.lineTo(sx, sy);
      }
      g.closePath();
    }
  }

  /* pieces are pre-rendered once per cell size and blitted: ~64 drawImage calls per frame
     instead of ~1400 path ops, which is what keeps this at 60fps on a mid phone */
  var sprites = {}, spriteCS = -1, boardBg = null;
  function makeCanvas(w, h) {
    if (!document.createElement) return null;
    var cn = document.createElement('canvas');
    if (!cn || !cn.getContext) return null;
    cn.width = w; cn.height = h;
    return cn;
  }
  function sprite(c, sp) {
    if (spriteCS !== CS) { sprites = {}; boardBg = null; spriteCS = CS; }
    var key = c + '_' + sp;
    if (sprites[key] !== undefined) return sprites[key];
    var size = Math.ceil(CS * 1.4);
    var cn = makeCanvas(size, size);
    if (!cn) { sprites[key] = null; return null; }
    var og = g;
    g = cn.getContext('2d');
    paintPiece(size / 2, size / 2, CS * 0.38, c, sp);
    g = og;
    sprites[key] = cn;
    return cn;
  }
  function drawPiece(cx, cy, r, c, sp, alpha, scale) {
    var a = (alpha === undefined ? 1 : alpha);
    if (a <= 0) return;
    var img = sprite(c, sp);
    if (!img) { g.globalAlpha = a; paintPiece(cx, cy, r * (scale === undefined ? 1 : scale), c, sp); g.globalAlpha = 1; return; }
    var s = (scale === undefined ? 1 : scale) * (r / (CS * 0.38));
    var w = img.width * s;
    g.globalAlpha = a;
    g.drawImage(img, cx - w / 2, cy - w / 2, w, w);
    g.globalAlpha = 1;
  }

  function paintPiece(cx, cy, r, c, sp) {
    if (c === ACORN) {
      g.fillStyle = '#c98a3c';
      rr(cx - r * 0.8, cy - r * 0.35, r * 1.6, r * 1.15, r * 0.5); g.fill();
      g.fillStyle = '#6d4520';
      rr(cx - r * 0.85, cy - r * 0.85, r * 1.7, r * 0.62, 4); g.fill();
      g.fillStyle = '#3c2510';
      g.fillRect(cx - 2, cy - r * 1.15, 4, r * 0.35);
      g.globalAlpha = 1; return;
    }
    if (sp === SP.PRISM || c === PRISMC) {
      for (var k = 0; k < 6; k++) {
        g.beginPath(); g.moveTo(cx, cy);
        g.arc(cx, cy, r, k * 1.0472 - 0.5236, (k + 1) * 1.0472 - 0.5236);
        g.closePath(); g.fillStyle = COL[k]; g.fill();
      }
      g.lineWidth = 2.5; g.strokeStyle = 'rgba(255,255,255,0.92)';
      g.beginPath(); g.arc(cx, cy, r, 0, 6.2832); g.stroke();
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(cx, cy, r * 0.3, 0, 6.2832); g.fill();
      g.globalAlpha = 1; return;
    }
    var col = COL[c] || '#888', cold = COLD[c] || '#444';
    shapePath(c, cx, cy + 1.5, r); g.fillStyle = cold; g.fill();
    shapePath(c, cx, cy, r); g.fillStyle = col; g.fill();
    g.globalAlpha = 0.35;
    g.fillStyle = '#fff';
    g.beginPath(); g.ellipse(cx - r * 0.28, cy - r * 0.38, r * 0.3, r * 0.19, -0.5, 0, 6.2832); g.fill();
    g.globalAlpha = 1;
    if (sp === SP.LH || sp === SP.LV) {
      g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = Math.max(3, r * 0.24);
      g.beginPath();
      if (sp === SP.LH) { g.moveTo(cx - r * 0.95, cy); g.lineTo(cx + r * 0.95, cy); }
      else { g.moveTo(cx, cy - r * 0.95); g.lineTo(cx, cy + r * 0.95); }
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.95)';
      if (sp === SP.LH) { tri(cx + r * 0.95, cy, r * 0.34, 0); tri(cx - r * 0.95, cy, r * 0.34, Math.PI); }
      else { tri(cx, cy - r * 0.95, r * 0.34, -Math.PI / 2); tri(cx, cy + r * 0.95, r * 0.34, Math.PI / 2); }
    } else if (sp === SP.BURST) {
      g.strokeStyle = '#fff'; g.lineWidth = 2.4;
      g.beginPath();
      for (var s = 0; s < 8; s++) {
        var a = s * 0.7854;
        g.moveTo(cx + Math.cos(a) * r * 0.45, cy + Math.sin(a) * r * 0.45);
        g.lineTo(cx + Math.cos(a) * r * 1.0, cy + Math.sin(a) * r * 1.0);
      }
      g.stroke();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(cx, cy, r * 0.28, 0, 6.2832); g.fill();
    }
    g.globalAlpha = 1;
  }
  function tri(x, y, r, a) {
    g.beginPath();
    g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    g.lineTo(x + Math.cos(a + 2.6) * r, y + Math.sin(a + 2.6) * r);
    g.lineTo(x + Math.cos(a - 2.6) * r, y + Math.sin(a - 2.6) * r);
    g.closePath(); g.fill();
  }

  function bg() {
    var grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#171129'); grad.addColorStop(0.55, '#12101f'); grad.addColorStop(1, '#0d0b16');
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
  }

  function drawButton(b) {
    var st = b.style;
    var fill = st === 'main' ? '#2b2444' : (st === 'go' ? '#4bbf5d' : (st === 'warn' ? '#c0455f' : '#1d1930'));
    g.fillStyle = 'rgba(0,0,0,0.35)'; rr(b.x, b.y + 3, b.w, b.h, 12); g.fill();
    g.fillStyle = fill; rr(b.x, b.y, b.w, b.h, 12); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.16)'; g.lineWidth = 1.5; rr(b.x, b.y, b.w, b.h, 12); g.stroke();
    text(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1, Math.min(19, b.h * 0.42), '#fff');
  }

  function drawStars(x, y, s, n, gap) {
    for (var i = 0; i < 3; i++) {
      var on = i < n;
      g.fillStyle = on ? '#ffd45e' : 'rgba(255,255,255,0.16)';
      shapePath(5, x + (i - 1) * (s * 2 + (gap || 4)), y, s);
      g.fill();
    }
  }

  /* ---------------- MAP ---------------- */
  function drawMap() {
    bg();
    Buttons.length = 0;
    var top = MAPTOP;
    g.save();
    g.beginPath(); g.rect(0, top, W, H - top); g.clip();
    // path
    g.strokeStyle = 'rgba(255,255,255,0.13)'; g.lineWidth = 14; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath();
    for (var i = 0; i < 30; i++) {
      var nd = map.nodes[i], py = nodeScreenY(i);
      if (i === 0) g.moveTo(nd.x, py); else g.lineTo(nd.x, py);
    }
    g.stroke();
    for (i = 0; i < 30; i++) {
      var n2 = map.nodes[i], y2 = nodeScreenY(i);
      if (y2 < top - 60 || y2 > H + 60) continue;
      var unlocked = i < save.unlocked;
      var stars = save.stars[i] | 0;
      g.fillStyle = 'rgba(0,0,0,0.4)'; g.beginPath(); g.arc(n2.x, y2 + 3, 25, 0, 6.2832); g.fill();
      g.fillStyle = !unlocked ? '#2a2740' : (stars > 0 ? '#4bbf5d' : '#5a49a8');
      g.beginPath(); g.arc(n2.x, y2, 25, 0, 6.2832); g.fill();
      g.lineWidth = (map.sel === i) ? 3.5 : 2;
      g.strokeStyle = (map.sel === i) ? '#ffd45e' : 'rgba(255,255,255,0.28)';
      g.beginPath(); g.arc(n2.x, y2, 25, 0, 6.2832); g.stroke();
      text(unlocked ? String(i + 1) : '•', n2.x, y2 + 1, 19, unlocked ? '#fff' : '#6b6690');
      if (unlocked) drawStars(n2.x, y2 + 34, 5, stars, 3);
      if (i === 29) text('CROWN', n2.x, y2 - 38, 12, '#ffd45e');
    }
    g.restore();

    // top bar
    g.fillStyle = 'rgba(10,8,18,0.94)'; g.fillRect(0, 0, W, top);
    g.strokeStyle = 'rgba(255,255,255,0.1)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, top); g.lineTo(W, top); g.stroke();
    text('BERRY CASCADE', 14, 24, 20, '#ffd45e', 'left');
    var tot = 0; for (i = 0; i < 30; i++) tot += save.stars[i] | 0;
    text(tot + '/90 stars • endless best ' + save.endless, 14, 46, 11.5, '#a9a2c8', 'left', 600);
    btn('endless', 14, 58, 116, 32, 'ENDLESS', 'go');
    btn('mute', W - 68, 58, 54, 32, save.mute ? 'SND OFF' : 'SND ON', 'flat');
    if (save.stars[29] > 0) btn('crown', W / 2 - 44, 58, 88, 32, 'CROWN', 'flat');
    for (var bi = 0; bi < Buttons.length; bi++) {
      var b = Buttons[bi];
      g.fillStyle = b.style === 'go' ? '#4bbf5d' : '#26213c';
      rr(b.x, b.y - 8, b.w, b.h + 16, 10); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.16)'; g.lineWidth = 1.2; rr(b.x, b.y - 8, b.w, b.h + 16, 10); g.stroke();
      text(b.label, b.x + b.w / 2, b.y + b.h / 2, 12, '#fff');
      b.y -= 8; b.h += 16; // 48px tall hit area
    }
    // hint
    g.fillStyle = 'rgba(10,8,18,0.86)'; g.fillRect(0, H - 32, W, 32);
    text('Tap a grove to play • drag to scroll the trail • arrows + enter work too', W / 2, H - 16, 11.5, '#9d97be', 'center', 600);
    BC.Fx.draw(g);
  }

  /* ---------------- PLAY HUD ---------------- */
  function goalChips() {
    var lv = P.lv, st = P.st, list = [];
    if (P.endless) {
      list.push({ label: 'SCORE', cur: st.score, max: 0, col: '#ffd45e' });
      list.push({ label: 'BEST', cur: save.endless, max: 0, col: '#8fe3ff' });
    } else {
      list.push({ label: 'SCORE', cur: st.score, max: lv.target, col: '#ffd45e' });
      if (lv.syrupTotal > 0) list.push({ label: 'SYRUP', cur: st.syrup, max: lv.syrupTotal, col: '#ff8ad8' });
      if (lv.acorns > 0) list.push({ label: 'ACORNS', cur: st.acorns, max: lv.acorns, col: '#c98a3c' });
    }
    return list;
  }

  function drawHUD() {
    g.fillStyle = 'rgba(10,8,18,0.9)'; g.fillRect(0, 0, W, HUDH);
    if (!P.over) {   // never leave invisible controls live under the end-of-level overlay
      btn('back', 8, 4, 54, 48, '‹', 'flat');
      btn('retry', W - 62, 4, 54, 48, '↻', 'flat');
    }
    text(P.endless ? 'ENDLESS CASCADE' : ((P.lv.n + 1) + '. ' + P.lv.name), W / 2, 26, 15, '#fff');

    var y = 58, h = HUDH - y - 6;
    // moves pill
    g.fillStyle = P.st.moves <= 3 ? '#7a2033' : '#2b2444';
    rr(8, y, 72, h, 12); g.fill();
    text('MOVES', 44, y + 12, 10, '#b9b2d8');
    text(String(P.st.moves), 44, y + h - 16, 22, '#fff');

    var chips = goalChips();
    var cw = (W - 96 - (chips.length - 1) * 6) / chips.length;
    for (var i = 0; i < chips.length; i++) {
      var c = chips[i], x = 88 + i * (cw + 6);
      g.fillStyle = '#1e1a30'; rr(x, y, cw, h, 12); g.fill();
      var pr = c.max > 0 ? BC.clamp(c.cur / c.max, 0, 1) : 0;
      if (c.max > 0) {
        g.fillStyle = c.col; g.globalAlpha = 0.22;
        rr(x, y, cw * pr, h, 12); g.fill(); g.globalAlpha = 1;
      }
      text(c.label, x + cw / 2, y + 12, 10, '#b9b2d8');
      var val = c.max > 0 ? (c.cur + '/' + c.max) : String(c.cur);
      text(val, x + cw / 2, y + h - 15, Math.min(17, cw / (val.length * 0.52)), '#fff');
    }
    for (var bi = 0; bi < Buttons.length; bi++) {
      var b = Buttons[bi];
      if (b.id !== 'back' && b.id !== 'retry') continue;
      g.fillStyle = '#26213c'; rr(b.x, b.y, b.w, b.h, 10); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.16)'; g.lineWidth = 1.2; rr(b.x, b.y, b.w, b.h, 10); g.stroke();
      text(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1, 22, '#fff');
    }
  }

  function cellRect(i) {
    var x = i % BC.W, y = (i / BC.W) | 0;
    return { x: BX + x * CS, y: BY + y * CS };
  }

  function drawBoard() {
    var b = P.b, i, x, y, r = CS * 0.38;
    g.fillStyle = 'rgba(255,255,255,0.045)';
    rr(BX - 5, BY - 5, CS * BC.W + 10, CS * BC.H + 10, 14); g.fill();
    if (spriteCS !== CS) sprite(0, 0);            // resets the caches on a size change
    if (boardBg === null) {
      boardBg = makeCanvas(CS * BC.W, CS * BC.H) || false;
      if (boardBg) {
        var og = g; g = boardBg.getContext('2d');
        for (i = 0; i < BC.W * BC.H; i++) {
          g.fillStyle = ((i % BC.W) + ((i / BC.W) | 0)) % 2 ? 'rgba(255,255,255,0.035)' : 'rgba(255,255,255,0.015)';
          rr((i % BC.W) * CS + 2, ((i / BC.W) | 0) * CS + 2, CS - 4, CS - 4, 8); g.fill();
        }
        g = og;
      }
    }
    if (boardBg) g.drawImage(boardBg, BX, BY);
    for (i = 0; i < b.n; i++) {
      x = BX + (i % BC.W) * CS; y = BY + ((i / BC.W) | 0) * CS;
      if (!boardBg) {
        g.fillStyle = ((i % BC.W) + ((i / BC.W) | 0)) % 2 ? 'rgba(255,255,255,0.035)' : 'rgba(255,255,255,0.015)';
        rr(x + 2, y + 2, CS - 4, CS - 4, 8); g.fill();
      }
      if (b.syr[i] > 0) {
        g.fillStyle = b.syr[i] > 1 ? 'rgba(255,138,216,0.42)' : 'rgba(255,138,216,0.2)';
        rr(x + 2, y + 2, CS - 4, CS - 4, 8); g.fill();
        g.strokeStyle = b.syr[i] > 1 ? 'rgba(255,180,235,0.9)' : 'rgba(255,180,235,0.45)';
        g.lineWidth = b.syr[i] > 1 ? 2.5 : 1.4;
        rr(x + 3.5, y + 3.5, CS - 7, CS - 7, 7); g.stroke();
      }
    }
    // selection / cursor
    if (P.sel >= 0) {
      var s = cellRect(P.sel);
      g.strokeStyle = '#ffd45e'; g.lineWidth = 3;
      rr(s.x + 2, s.y + 2, CS - 4, CS - 4, 8); g.stroke();
    }
    if (kbActive) {
      var ci = P.cy * BC.W + P.cx, cr = cellRect(ci);
      g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 2;
      g.setLineDash([5, 4]);
      rr(cr.x + 3, cr.y + 3, CS - 6, CS - 6, 8); g.stroke();
      g.setLineDash([]);
    }
    // pieces
    for (i = 0; i < b.n; i++) {
      if (b.c[i] === EMPTY) continue;
      x = BX + (i % BC.W) * CS + CS / 2;
      y = BY + ((i / BC.W) | 0) * CS + CS / 2 + P.oy[i];
      var sc = 1;
      if (P.sq[i] > 0) sc = 1 + Math.sin(P.sq[i] * Math.PI) * 0.16;
      var ox = 0, oyy = 0;
      if (P.phase === 'swap' || P.phase === 'unswap') {
        var pr = BC.clamp(P.t / 0.13, 0, 1);
        if (P.phase === 'unswap') pr = 1 - pr;
        if (i === P.swapA || i === P.swapB) {
          var other = (i === P.swapA) ? P.swapB : P.swapA;
          var oxs = ((other % BC.W) - (i % BC.W)) * CS, oys = (((other / BC.W) | 0) - ((i / BC.W) | 0)) * CS;
          ox = oxs * BC.easeInOut(pr); oyy = oys * BC.easeInOut(pr);
        }
      }
      drawPiece(x + ox, y + oyy, r, b.c[i], b.sp[i], 1, sc);
    }
    // popping
    for (i = 0; i < P.popping.length; i++) {
      var p = P.popping[i], k = BC.clamp(p.t / 0.16, 0, 1);
      drawPiece(p.x, p.y, r, p.c, p.sp, 1 - k, 1 + k * 0.55);
    }
  }

  function drawPlay() {
    bg();
    Buttons.length = 0;
    g.save();
    if (BC.Fx.shake > 0.2) {
      g.translate((Math.random() - 0.5) * BC.Fx.shake, (Math.random() - 0.5) * BC.Fx.shake);
    }
    drawBoard();
    BC.Fx.draw(g);
    g.restore();
    drawHUD();

    // bottom bar
    g.fillStyle = 'rgba(10,8,18,0.9)'; g.fillRect(0, H - BOTH, W, BOTH);
    var hint = P.endless
      ? 'Swipe to swap • every 1500 pts = +4 moves • chase your best'
      : 'Swipe to swap 3+ berries • hit every goal before moves run out';
    text(hint, W / 2, H - BOTH + 16, 11.5, '#9d97be', 'center', 600);
    btn('menu', 10, H - BOTH + 26, 112, Math.max(48, BOTH - 34), 'MAP', 'flat');
    btn('again', W - 122, H - BOTH + 26, 112, Math.max(48, BOTH - 34), 'RESTART', 'flat');
    for (var bi = 0; bi < Buttons.length; bi++) {
      var b = Buttons[bi];
      if (b.id !== 'menu' && b.id !== 'again') continue;
      drawButton(b);
    }
    if (P.over) drawOverlay();
  }

  function drawOverlay() {
    g.fillStyle = 'rgba(6,4,12,0.82)'; g.fillRect(0, 0, W, H);
    var cx = W / 2, cy = H / 2 - 40;
    var won = P.over === 1;
    text(won ? 'GROVE CLEARED!' : 'OUT OF MOVES', cx, cy - 96, 26, won ? '#7bd94a' : '#ff6b83');
    if (won && !P.endless) drawStars(cx, cy - 46, 15, P.stars, 8);
    if (P.endless) {
      text('SCORE  ' + P.st.score, cx, cy - 46, 22, '#fff');
      text('BEST  ' + save.endless, cx, cy - 16, 16, '#8fe3ff');
    } else {
      text('SCORE  ' + P.st.score, cx, cy - 6, 20, '#fff');
      if (!won) {
        var miss = [];
        if (P.st.score < P.lv.target) miss.push('score');
        if (P.st.syrup < P.lv.syrupTotal) miss.push('syrup');
        if (P.st.acorns < P.lv.acorns) miss.push('acorns');
        text('missing: ' + miss.join(', '), cx, cy + 20, 14, '#b9b2d8', 'center', 600);
      }
    }
    var bw = Math.min(230, W - 60), bx = cx - bw / 2;
    var by = cy + 56;
    if (won && !P.endless && P.lv.n < 29) btn('next', bx, by, bw, 52, 'NEXT GROVE', 'go');
    else if (won && !P.endless) btn('crown', bx, by, bw, 52, 'CLAIM THE CROWN', 'go');
    else btn('again', bx, by, bw, 52, won ? 'PLAY AGAIN' : 'RETRY', 'go');
    btn('menu', bx, by + 60, bw, 48, 'BACK TO MAP', 'main');
    if (won && !P.endless && P.lv.n < 29) btn('again', bx, by + 116, bw, 48, 'REPLAY GROVE', 'flat');
    for (var i = 0; i < Buttons.length; i++) {
      var b = Buttons[i];
      if (b.y < cy) continue;
      drawButton(b);
    }
  }

  /* ---------------- CROWN ---------------- */
  var crownT = 0;
  function drawCrown() {
    bg();
    Buttons.length = 0;
    crownT += 0.016;
    var tot = 0; for (var i = 0; i < 30; i++) tot += save.stars[i] | 0;
    var cx = W / 2;
    for (i = 0; i < 3; i++) {
      var a = crownT * 0.8 + i * 2.1;
      g.globalAlpha = 0.18; g.fillStyle = COL[i * 2];
      g.beginPath(); g.arc(cx + Math.cos(a) * 90, 210 + Math.sin(a * 1.3) * 60, 70, 0, 6.2832); g.fill();
    }
    g.globalAlpha = 1;
    g.fillStyle = '#ffd45e';
    g.beginPath();
    g.moveTo(cx - 62, 240); g.lineTo(cx - 46, 176); g.lineTo(cx - 20, 214); g.lineTo(cx, 164);
    g.lineTo(cx + 20, 214); g.lineTo(cx + 46, 176); g.lineTo(cx + 62, 240);
    g.closePath(); g.fill();
    g.fillStyle = '#e8b93c'; g.fillRect(cx - 62, 240, 124, 16);
    text('CASCADE CROWN', cx, 300, 26, '#ffd45e');
    text('All 30 groves cleared.', cx, 336, 16, '#fff', 'center', 600);
    text(tot + ' / 90 stars collected', cx, 362, 16, '#8fe3ff', 'center', 600);
    text('Endless best: ' + save.endless, cx, 388, 14, '#b9b2d8', 'center', 600);
    var bw = Math.min(230, W - 60);
    btn('menu', cx - bw / 2, 430, bw, 52, 'BACK TO MAP', 'go');
    btn('endless', cx - bw / 2, 492, bw, 48, 'ENDLESS CASCADE', 'main');
    for (i = 0; i < Buttons.length; i++) drawButton(Buttons[i]);
    BC.Fx.draw(g);
  }

  /* ---------------- game logic steps ---------------- */
  function startPop(step) {
    var b = P.b, i;
    P.popping.length = 0;
    for (i = 0; i < step.cells.length; i++) {
      var idx = step.cells[i];
      if (b.c[idx] === EMPTY || b.c[idx] === ACORN) continue;
      var rc = cellRect(idx);
      var px = rc.x + CS / 2, py = rc.y + CS / 2;
      if (P.popping.length < 90) P.popping.push({ x: px, y: py, c: b.c[idx], sp: b.sp[idx], t: 0 });
      BC.Fx.burst(px, py, COL[b.c[idx]] || '#fff', b.sp[idx] ? 8 : 3, b.sp[idx] ? 220 : 130);
    }
    if (step.fx && step.fx.length) { BC.Audio.special(); BC.Fx.kick(6 + step.fx.length * 1.5); BC.Fx.flash = 0.5; }
    BC.Audio.pop(P.chain);
    BC.Fx.kick(1.6 + Math.min(6, step.cells.length * 0.22));

    var res = BC.applyClear(b, step, P.st);
    var pts = BC.scoreFor(res.cleared, P.chain) + res.syrup * 120;
    P.st.score += pts;
    var cxp = BX + CS * BC.W / 2, cyp = BY + CS * BC.H / 2;
    if (P.chain >= 1) BC.Fx.pop(cxp, cyp - 30 - P.chain * 6, 'CASCADE x' + (P.chain + 1), '#ffd45e');
    if (step.combo) BC.Fx.pop(cxp, cyp + 10, step.combo, '#ff8ad8');
    else if (res.cleared >= 7) BC.Fx.pop(cxp, cyp + 10, 'JUICY!', '#7bd94a');
    if (res.syrup > 0) BC.Fx.pop(cxp - 40, cyp - 60, '+' + res.syrup + ' syrup', '#ff8ad8');
    // create specials pop
    for (i = 0; i < step.creates.length; i++) {
      var crc = cellRect(step.creates[i].i);
      P.sq[step.creates[i].i] = 1;
      BC.Fx.burst(crc.x + CS / 2, crc.y + CS / 2, '#fff', 10, 200);
    }
    P.phase = 'pop'; P.t = 0;
  }

  function doGravity() {
    var b = P.b, i;
    var before = P.st.acorns;
    var gr = BC.gravity(b, P.rand, P.lv, P.st);
    for (i = 0; i < b.n; i++) { P.oy[i] = 0; P.vy[i] = 0; }
    for (var key in gr.falls) {
      var k = key | 0;
      if (k >= 0 && k < b.n) P.oy[k] = -Math.min(gr.falls[key], BC.H + 2) * CS;
    }
    var got = P.st.acorns - before;
    if (got > 0) {
      BC.Audio.acorn();
      P.st.score += got * 500;
      for (i = 0; i < gr.acorns.length; i++) {
        var rc = cellRect(gr.acorns[i]);
        BC.Fx.burst(rc.x + CS / 2, rc.y + CS / 2, '#c98a3c', 16, 220);
      }
      BC.Fx.pop(BX + CS * BC.W / 2, BY + CS * BC.H - 40, 'ACORN SAVED!', '#ffb020');
      BC.Fx.kick(7);
    }
    P.phase = 'fall'; P.t = 0;
  }

  function settle() {
    var lv = P.lv, st = P.st;
    if (P.endless) {
      // each refill costs more score than the last, so the run always tightens
      while (st.score >= P.nextBonus && P.bonusCount < 200) {
        P.bonusCount++;
        P.nextBonus += 3000 + P.bonusCount * 1800;
        st.moves += 2;
        BC.Fx.pop(W / 2, BY + 40, '+2 MOVES', '#7bd94a');
      }
      var stage = Math.min(8, Math.floor(st.score / 14000));
      if (stage > P.stage) { P.stage = stage; lv.colors = stage < 1 ? 4 : (stage < 3 ? 5 : 6); BC.Fx.pop(W / 2, BY + 70, 'DIFFICULTY UP', '#ff6b83'); }
      if (st.moves <= 0) { endGame(0); return; }
    } else {
      if (BC.goalsMet(lv, st)) { endGame(1); return; }
      if (st.moves <= 0) { endGame(0); return; }
    }
    if (!BC.listMoves(P.b).length) {
      BC.shuffle(P.b, P.rand, lv);
      BC.Fx.pop(W / 2, BY + CS * BC.H / 2, 'NO MOVES — SHUFFLE', '#8fe3ff');
      BC.Audio.swap();
    }
    P.phase = 'idle'; P.chain = 0; P.t = 0;
  }

  function endGame(won) {
    P.over = won ? 1 : 2;
    P.phase = 'over';
    P.sel = -1;
    if (P.endless) {
      if (P.st.score > save.endless) { save.endless = P.st.score; BC.Store.write(save); }
      BC.Audio.lose();
      return;
    }
    if (won) {
      var s = 1, lv = P.lv;
      if (P.st.score >= lv.stars[1]) s = 2;
      if (P.st.score >= lv.stars[2]) s = 3;
      P.stars = s;
      var n = lv.n;
      if ((save.stars[n] | 0) < s) save.stars[n] = s;
      if ((save.best[n] | 0) < P.st.score) save.best[n] = P.st.score;
      if (save.unlocked < Math.min(30, n + 2)) save.unlocked = Math.min(30, n + 2);
      BC.Store.write(save);
      BC.Audio.win();
      BC.Fx.kick(10);
      for (var k = 0; k < 40; k++) BC.Fx.burst(Math.random() * W, H * 0.35 + Math.random() * 120, COL[k % 6], 2, 200);
    } else {
      BC.Audio.lose();
      BC.Fx.kick(9);
    }
  }

  function attemptSwap(i, j) {
    if (P.phase !== 'idle' || P.over) return false;
    if (i < 0 || j < 0 || i >= P.b.n || j >= P.b.n) return false;
    var b = P.b;
    if (b.c[i] === ACORN || b.c[j] === ACORN || b.c[i] === EMPTY || b.c[j] === EMPTY) { BC.Audio.deny(); return false; }
    P.sel = -1;
    P.swapA = i; P.swapB = j; P.t = 0;
    P.pendingValid = BC.canSwap(b, i, j);
    P.phase = 'swap';
    BC.Audio.swap();
    return true;
  }

  function updatePlay(dt) {
    var i;
    if (P.phase === 'swap') {
      P.t += dt;
      if (P.t >= 0.13) {
        BC.doSwap(P.b, P.swapA, P.swapB);
        if (!P.pendingValid) { P.phase = 'unswap'; P.t = 0; BC.Audio.deny(); }
        else {
          P.st.moves--;
          P.chain = 0;
          var step = BC.swapClear(P.b, P.swapA, P.swapB, P.rand);
          if (step) startPop(step);
          else { P.phase = 'idle'; P.t = 0; }
        }
      }
    } else if (P.phase === 'unswap') {
      P.t += dt;
      if (P.t >= 0.13) { BC.doSwap(P.b, P.swapA, P.swapB); P.phase = 'idle'; P.swapA = P.swapB = -1; P.t = 0; }
    } else if (P.phase === 'pop') {
      P.t += dt;
      for (i = 0; i < P.popping.length; i++) P.popping[i].t += dt;
      if (P.t >= 0.16) { P.popping.length = 0; doGravity(); }
    } else if (P.phase === 'fall') {
      P.t += dt;
      var moving = false;
      for (i = 0; i < P.b.n; i++) {
        if (P.oy[i] < 0) {
          P.vy[i] += 3600 * dt;
          P.oy[i] += P.vy[i] * dt;
          if (P.oy[i] >= 0) { P.oy[i] = 0; P.vy[i] = 0; P.sq[i] = 1; }
          else moving = true;
        }
        if (P.sq[i] > 0) { P.sq[i] -= dt * 5.5; if (P.sq[i] < 0) P.sq[i] = 0; }
      }
      if (!moving || P.t > 2.2) {
        for (i = 0; i < P.b.n; i++) { if (P.oy[i] < 0) { P.oy[i] = 0; P.vy[i] = 0; } }
        var st2 = BC.stepClear(P.b, -1, P.rand);
        if (st2) { P.chain++; startPop(st2); }
        else settle();
      }
    } else {
      for (i = 0; i < P.b.n; i++) if (P.sq[i] > 0) { P.sq[i] -= dt * 5.5; if (P.sq[i] < 0) P.sq[i] = 0; }
    }
    P.hintT += dt;
  }

  /* ---------------- input ---------------- */
  var kbActive = false;

  function cellAt(px, py) {
    var x = Math.floor((px - BX) / CS), y = Math.floor((py - BY) / CS);
    if (x < 0 || y < 0 || x >= BC.W || y >= BC.H) return -1;
    return y * BC.W + x;
  }

  function fireButton(id) {
    BC.Audio.unlock();
    if (id === 'mute') { save.mute = save.mute ? 0 : 1; BC.Audio.setMute(save.mute); BC.Store.write(save); return; }
    if (id === 'endless') { newPlay(0, true); scene = 'play'; return; }
    if (id === 'crown') { scene = 'crown'; BC.Audio.crown(); return; }
    if (id === 'menu' || id === 'back') { BC.Timers.clearAll(); BC.Input.reset(); BC.Fx.reset(); pending = -1; scene = 'map'; P = null; centerMapOn(save.unlocked - 1); return; }
    if (id === 'retry' || id === 'again') {
      if (!P) return;
      if (P.endless) newPlay(0, true); else newPlay(P.lv.n, false);
      return;
    }
    if (id === 'next') {
      var n = P.lv.n + 1;
      if (n > 29) { scene = 'crown'; return; }
      queueLevel(n); return;
    }
  }

  function centerMapOn(i) {
    i = BC.clamp(i, 0, 29);
    map.sel = i;
    map.scroll = BC.clamp(i * STEP - (H - 70) + (H + MAPTOP) / 2, 0, map.maxScroll);
  }

  function onDown(e) {
    var id = (e.pointerId === undefined ? 'm' : e.pointerId);
    var x = e.clientX, y = e.clientY;
    BC.Audio.unlock();
    var b = hitBtn(x, y);
    if (b) { BC.Input.pointers[id] = { kind: 'btn', btn: b.id, x: x, y: y }; if (Object.keys(BC.Input.pointers).length > 8) delete BC.Input.pointers[Object.keys(BC.Input.pointers)[0]]; return; }
    if (paused) return;
    if (scene === 'map') {
      BC.Input.pointers[id] = { kind: 'map', x: x, y: y, sx: x, sy: y, s0: map.scroll, moved: false };
      if (Object.keys(BC.Input.pointers).length > 8) delete BC.Input.pointers[Object.keys(BC.Input.pointers)[0]];
      return;
    }
    if (scene === 'play' && P && !P.over) {
      var c = cellAt(x, y);
      if (c >= 0) {
        kbActive = false;
        BC.Input.pointers[id] = { kind: 'board', cell: c, sx: x, sy: y, moved: false };
        if (Object.keys(BC.Input.pointers).length > 8) delete BC.Input.pointers[Object.keys(BC.Input.pointers)[0]];
        if (P.sel >= 0 && P.sel !== c && adjacent(P.sel, c)) { attemptSwap(P.sel, c); BC.Input.pointers[id].done = true; }
        else if (P.phase === 'idle') P.sel = (P.sel === c ? -1 : c);
      } else { BC.Input.pointers[id] = { kind: 'none' }; }
    }
  }
  function adjacent(a, b) {
    var ax = a % BC.W, ay = (a / BC.W) | 0, bx = b % BC.W, by = (b / BC.W) | 0;
    return Math.abs(ax - bx) + Math.abs(ay - by) === 1;
  }
  function onMove(e) {
    var id = (e.pointerId === undefined ? 'm' : e.pointerId);
    var p = BC.Input.pointers[id];
    if (!p) return;
    var x = e.clientX, y = e.clientY;
    if (p.kind === 'map') {
      map.scroll = BC.clamp(p.s0 + (y - p.sy), 0, map.maxScroll);
      if (Math.abs(y - p.sy) > 8 || Math.abs(x - p.sx) > 8) p.moved = true;
      return;
    }
    if (p.kind === 'board' && !p.done && P && P.phase === 'idle') {
      var dx = x - p.sx, dy = y - p.sy;
      if (Math.abs(dx) > 16 || Math.abs(dy) > 16) {
        var cx = p.cell % BC.W, cy = (p.cell / BC.W) | 0, tx = cx, ty = cy;
        if (Math.abs(dx) > Math.abs(dy)) tx += dx > 0 ? 1 : -1; else ty += dy > 0 ? 1 : -1;
        p.done = true;
        if (tx >= 0 && tx < BC.W && ty >= 0 && ty < BC.H) attemptSwap(p.cell, ty * BC.W + tx);
        P.sel = -1;
      }
    }
  }
  function onUp(e) {
    var id = (e.pointerId === undefined ? 'm' : e.pointerId);
    var p = BC.Input.pointers[id];
    delete BC.Input.pointers[id];
    if (!p || paused) return;
    if (p.kind === 'btn') {
      var b2 = hitBtn(e.clientX, e.clientY);
      if (b2 && b2.id === p.btn) fireButton(p.btn);
      return;
    }
    if (p.kind === 'map' && !p.moved) {
      for (var i = 0; i < 30; i++) {
        var ny = nodeScreenY(i);
        if (ny < 40 || ny > H + 40) continue;
        var dx = e.clientX - map.nodes[i].x, dy = e.clientY - ny;
        if (dx * dx + dy * dy <= 30 * 30) {
          if (i < save.unlocked) { map.sel = i; BC.Audio.unlock(); queueLevel(i); }
          else BC.Audio.deny();
          return;
        }
      }
    }
  }
  function onCancel(e) {
    var id = (e.pointerId === undefined ? 'm' : e.pointerId);
    delete BC.Input.pointers[id];
  }

  function onKey(e) {
    var k = e.key;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Enter'].indexOf(k) >= 0) e.preventDefault();
    BC.Audio.unlock();
    BC.Input.keys[k] = 1;
    if (paused) return;
    if (scene === 'crown') { if (k === 'Enter' || k === 'Escape' || k === ' ') fireButton('menu'); return; }
    if (scene === 'map') {
      if (k === 'ArrowUp' || k === 'ArrowRight') { map.sel = BC.clamp(map.sel + 1, 0, save.unlocked - 1); centerMapOn(map.sel); }
      else if (k === 'ArrowDown' || k === 'ArrowLeft') { map.sel = BC.clamp(map.sel - 1, 0, 29); centerMapOn(map.sel); }
      else if (k === 'Enter' || k === ' ') { if (map.sel < save.unlocked) queueLevel(map.sel); else BC.Audio.deny(); }
      else if (k === 'e' || k === 'E') fireButton('endless');
      else if (k === 'm' || k === 'M') fireButton('mute');
      return;
    }
    if (scene === 'play' && P) {
      if (k === 'Escape') { fireButton('menu'); return; }
      if (k === 'r' || k === 'R') { fireButton('again'); return; }
      if (k === 'm' || k === 'M') { fireButton('mute'); return; }
      if (P.over) {
        if (k === 'Enter' || k === ' ') {
          if (P.over === 1 && !P.endless && P.lv.n < 29) fireButton('next');
          else if (P.over === 1 && !P.endless) fireButton('crown');
          else fireButton('again');
        }
        return;
      }
      kbActive = true;
      if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown') {
        var dx = (k === 'ArrowRight') - (k === 'ArrowLeft');
        var dy = (k === 'ArrowDown') - (k === 'ArrowUp');
        if (P.sel >= 0) {
          var tx = (P.sel % BC.W) + dx, ty = ((P.sel / BC.W) | 0) + dy;
          if (tx >= 0 && tx < BC.W && ty >= 0 && ty < BC.H) { attemptSwap(P.sel, ty * BC.W + tx); P.cx = BC.clamp(tx, 0, BC.W - 1); P.cy = BC.clamp(ty, 0, BC.H - 1); }
          P.sel = -1;
        } else {
          P.cx = BC.clamp(P.cx + dx, 0, BC.W - 1);
          P.cy = BC.clamp(P.cy + dy, 0, BC.H - 1);
        }
      } else if (k === 'Enter' || k === ' ') {
        var ci = P.cy * BC.W + P.cx;
        P.sel = (P.sel === ci) ? -1 : ci;
      }
    }
  }
  function onKeyUp(e) { delete BC.Input.keys[e.key]; }

  function releaseAll() { BC.Input.reset(); }

  /* ---------------- orientation / pause (hardening #1) ---------------- */
  function checkOrientation() {
    var landscape = W > H && H < 460;
    if (landscape !== paused) {
      paused = landscape;
      if (paused) releaseAll();
      lastT = 0;
    }
    var el = document.getElementById('rotate');
    if (el) el.style.display = paused ? 'flex' : 'none';
  }

  /* ---------------- loop ---------------- */
  function resize() {
    W = Math.max(240, window.innerWidth);
    H = Math.max(320, window.innerHeight);
    var d = Math.min(window.devicePixelRatio || 1, 2);
    var longAxis = Math.max(W, H);
    if (longAxis * d > 960) d = 960 / longAxis;
    dpr = d;
    canvas.width = Math.round(W * d);
    canvas.height = Math.round(H * d);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    g.setTransform(d, 0, 0, d, 0, 0);
    buildMapNodes();
    if (P) layoutBoard();
    checkOrientation();
  }

  function frame(ts) {
    window.requestAnimationFrame(frame);
    if (!lastT) lastT = ts;
    var dt = (ts - lastT) / 1000;
    lastT = ts;
    if (dt > 0.05) dt = 0.05;
    if (dt < 0) dt = 0;
    if (paused) { return; }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (booted) {
      BC.Fx.update(dt);
      if (scene === 'play' && P && !P.over) updatePlay(dt);
      if (scene === 'loading') {
        if (pendingDrawn) { var pn = pending; pending = -1; newPlay(pn, false); scene = 'play'; drawPlay(); }
        else { drawLoading(); pendingDrawn = true; }
      }
      else if (scene === 'map') drawMap();
      else if (scene === 'play') drawPlay();
      else drawCrown();
      if (BC.Fx.flash > 0) {
        g.globalAlpha = Math.min(0.35, BC.Fx.flash * 0.4);
        g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.globalAlpha = 1;
      }
    }
  }

  /* ---------------- boot ---------------- */
  function boot() {
    canvas = document.getElementById('cv');
    g = canvas.getContext('2d', { alpha: false });
    BC.Audio.setMute(save.mute);
    resize();
    centerMapOn(save.unlocked - 1);

    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', function () { BC.Timers.set(resize, 120); });

    var opts = { passive: false };
    if (window.PointerEvent) {
      canvas.addEventListener('pointerdown', function (e) { e.preventDefault(); onDown(e); }, opts);
      window.addEventListener('pointermove', function (e) { if (BC.Input.pointers[e.pointerId] !== undefined) e.preventDefault(); onMove(e); }, opts);
      window.addEventListener('pointerup', function (e) { onUp(e); }, opts);
      window.addEventListener('pointercancel', onCancel, opts);
    } else {
      canvas.addEventListener('touchstart', function (e) { e.preventDefault(); for (var i = 0; i < e.changedTouches.length; i++) { var t = e.changedTouches[i]; onDown({ pointerId: t.identifier, clientX: t.clientX, clientY: t.clientY }); } }, opts);
      canvas.addEventListener('touchmove', function (e) { e.preventDefault(); for (var i = 0; i < e.changedTouches.length; i++) { var t = e.changedTouches[i]; onMove({ pointerId: t.identifier, clientX: t.clientX, clientY: t.clientY }); } }, opts);
      canvas.addEventListener('touchend', function (e) { e.preventDefault(); for (var i = 0; i < e.changedTouches.length; i++) { var t = e.changedTouches[i]; onUp({ pointerId: t.identifier, clientX: t.clientX, clientY: t.clientY }); } }, opts);
      canvas.addEventListener('touchcancel', function (e) { for (var i = 0; i < e.changedTouches.length; i++) onCancel({ pointerId: e.changedTouches[i].identifier }); }, opts);
      canvas.addEventListener('mousedown', onDown);
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    }
    canvas.addEventListener('wheel', function (e) {
      if (scene === 'map') { e.preventDefault(); map.scroll = BC.clamp(map.scroll - e.deltaY, 0, map.maxScroll); }
    }, opts);
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', function () { if (document.hidden) { releaseAll(); lastT = 0; } });

    var ov = document.getElementById('tap');
    function start() {
      BC.Audio.unlock();
      if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
      booted = true;
      lastT = 0;
    }
    if (ov) {
      ov.addEventListener('pointerdown', function (e) { e.preventDefault(); start(); });
      ov.addEventListener('click', start);
      ov.addEventListener('touchstart', function (e) { e.preventDefault(); start(); }, opts);
      window.addEventListener('keydown', function once(e) { window.removeEventListener('keydown', once); start(); });
    } else { booted = true; }

    window.requestAnimationFrame(frame);
  }

  BC.dbg = function () { return { scene: scene, P: P, save: save, map: map, paused: paused, buttons: Buttons, layout: { BX: BX, BY: BY, CS: CS } }; };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(BC);
