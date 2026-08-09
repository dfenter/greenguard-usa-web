/* Emberline Outpost - rendering + UI layout */
(function (EO) {
  'use strict';
  var G = EO.G;
  EO.UI = { btns: [], cards: [], slots: [], recipes: [], mapBtns: [] };
  var U = EO.UI;

  var BG = '#0d1014', GRID = '#1a2029', GRID2 = '#141a22', PATHC = '#2b2118', INK = '#e8e2d4', DIM = '#7f8b96', HL = '#ffb454';

  function rr(g, x, y, w, h, r) {
    r = Math.min(r, w * 0.5, h * 0.5);
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function txt(g, s, x, y, size, col, align, weight) {
    g.fillStyle = col || INK;
    g.font = (weight || '700') + ' ' + size + 'px -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif';
    g.textAlign = align || 'left';
    g.textBaseline = 'middle';
    g.fillText(s, x, y);
  }
  function button(g, b) {
    var on = b.on !== false;
    g.globalAlpha = on ? 1 : 0.42;
    rr(g, b.x, b.y, b.w, b.h, 8);
    g.fillStyle = b.fill || '#1b222b';
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = b.acc || (b.primary ? HL : '#39434f');
    g.stroke();
    if (b.label) txt(g, b.label, b.x + b.w * 0.5, b.y + b.h * 0.5 + (b.sub ? -8 : 0), b.fs || 14, b.primary ? HL : INK, 'center');
    if (b.sub) txt(g, b.sub, b.x + b.w * 0.5, b.y + b.h * 0.5 + 11, 10, DIM, 'center', '600');
    g.globalAlpha = 1;
  }
  EO.hit = function (b, x, y) { return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h; };

  /* ---------- layout ---------- */
  EO.layout = function (w, h) {
    var L = G.L;
    L.w = w; L.h = h;
    L.hud = 66;
    var trayH = EO.clamp(Math.round(h * 0.19), 92, 146);
    var top = L.hud + 6;
    var space = h - trayH - 10 - top;
    var tile = Math.min((w - 10) / EO.COLS, space / EO.ROWS);
    tile = Math.max(24, tile);
    L.tile = tile;
    L.ox = Math.round((w - tile * EO.COLS) * 0.5);
    L.oy = Math.round(top + Math.max(0, (space - tile * EO.ROWS) * 0.5));
    L.gridB = L.oy + tile * EO.ROWS;
    L.trayH = trayH;
    L.trayY = Math.round(h - trayH - 4);
  };

  /* ---------- play ---------- */
  function drawGrid(g) {
    var L = G.L, t = L.tile;
    g.fillStyle = GRID2;
    g.fillRect(L.ox, L.oy, t * EO.COLS, t * EO.ROWS);
    for (var r = 0; r < EO.ROWS; r++) {
      for (var c = 0; c < EO.COLS; c++) {
        var x = L.ox + c * t, y = L.oy + r * t;
        var p = EO.isPath(c, r);
        g.fillStyle = p ? PATHC : ((c + r) % 2 ? GRID : GRID2);
        g.fillRect(x + 1, y + 1, t - 2, t - 2);
      }
    }
    /* path direction ticks */
    g.strokeStyle = 'rgba(255,180,84,0.20)';
    g.lineWidth = 2;
    for (var pi = 0; pi < G.paths.length; pi++) {
      var pts = G.paths[pi];
      g.beginPath();
      for (var i = 0; i < pts.length; i++) {
        var px = EO.cellX(pts[i].c), py = EO.cellY(pts[i].r);
        if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.stroke();
    }
    /* gate */
    var gx = EO.cellX(G.gate.c), gy = L.gridB;
    g.fillStyle = '#e05f5f';
    g.globalAlpha = 0.8;
    g.fillRect(gx - t * 0.45, gy - 5, t * 0.9, 5);
    g.globalAlpha = 1;
    txt(g, 'OUTPOST', gx, gy + 9, 9, '#e05f5f', 'center', '800');
    /* grid frame */
    g.strokeStyle = '#39434f'; g.lineWidth = 2;
    g.strokeRect(L.ox - 1, L.oy - 1, t * EO.COLS + 2, t * EO.ROWS + 2);
  }

  function drawDefender(g, dd) {
    var L = G.L, t = L.tile, x = EO.cellX(dd.c), y = EO.cellY(dd.r), d = dd.def;
    var s = t * 0.36;
    var grow = dd.born > 0 ? (1 - dd.born / 0.35) : 1;
    s *= 0.6 + 0.4 * grow;
    /* footprint tint when selected */
    if (G.sel === dd) {
      var cells = EO.fpCells(dd);
      g.fillStyle = 'rgba(255,180,84,0.16)';
      for (var i = 0; i < cells.length; i++) {
        g.fillRect(L.ox + cells[i][0] * t + 1, L.oy + cells[i][1] * t + 1, t - 2, t - 2);
      }
      g.strokeStyle = HL; g.lineWidth = 2;
      g.strokeRect(L.ox + dd.c * t + 2, L.oy + dd.r * t + 2, t - 4, t - 4);
    }
    /* body */
    g.fillStyle = dd.flash > 0 ? '#ffffff' : d.col;
    rr(g, x - s, y - s, s * 2, s * 2, 5);
    g.fill();
    if (dd.brace > 0 || dd.shieldT > 0) {
      g.strokeStyle = '#8ad6e8'; g.lineWidth = 2;
      g.beginPath(); g.arc(x, y, s + 4 + Math.sin(dd.pulse * 8) * 1.5, 0, 6.283); g.stroke();
    }
    /* facing wedge */
    var dir = EO.DIRS[dd.dir];
    g.fillStyle = '#12161c';
    g.beginPath();
    var fx = x + dir[0] * s * 0.95, fy = y + dir[1] * s * 0.95;
    var px = -dir[1], py = dir[0];
    g.moveTo(fx + dir[0] * s * 0.5, fy + dir[1] * s * 0.5);
    g.lineTo(fx + px * s * 0.55, fy + py * s * 0.55);
    g.lineTo(fx - px * s * 0.55, fy - py * s * 0.55);
    g.closePath(); g.fill();
    /* label */
    txt(g, d.ab, x, y - 1, Math.max(8, t * 0.20), '#12161c', 'center', '800');
    /* hp bar */
    if (dd.hp < dd.maxhp) {
      var bw = t * 0.7;
      g.fillStyle = '#12161c'; g.fillRect(x - bw / 2, y + s + 2, bw, 3);
      g.fillStyle = '#8fe0a0'; g.fillRect(x - bw / 2, y + s + 2, bw * EO.clamp(dd.hp / dd.maxhp, 0, 1), 3);
    }
    /* skill ready pip */
    if (dd.skcd <= 0) {
      g.fillStyle = HL;
      g.beginPath(); g.arc(x + s - 1, y - s + 1, 3, 0, 6.283); g.fill();
    }
  }

  function drawEnemy(g, e) {
    var d = e.def, r = d.r * (G.L.tile / 54);
    r = Math.max(5, r);
    if (e.air) {
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.beginPath(); g.ellipse(e.x + 6, e.y + 12, r, r * 0.4, 0, 0, 6.283); g.fill();
    }
    g.fillStyle = e.flash > 0 ? '#ffffff' : d.col;
    if (e.air) {
      g.beginPath();
      g.moveTo(e.x, e.y - r); g.lineTo(e.x + r, e.y + r * 0.7); g.lineTo(e.x - r, e.y + r * 0.7);
      g.closePath(); g.fill();
    } else {
      g.beginPath(); g.arc(e.x, e.y, r, 0, 6.283); g.fill();
    }
    if (e.oil > 0) { g.strokeStyle = '#b3a27a'; g.lineWidth = 2; g.beginPath(); g.arc(e.x, e.y, r + 3, 0, 6.283); g.stroke(); }
    if (e.burnT > 0) { g.strokeStyle = '#ff9a3c'; g.lineWidth = 2; g.beginPath(); g.arc(e.x, e.y, r + 5, 0, 6.283); g.stroke(); }
    if (e.stun > 0 || e.root > 0) {
      g.fillStyle = '#8ad6e8';
      g.fillRect(e.x - 2, e.y - r - 8, 4, 4);
    }
    if (e.hp < e.maxhp) {
      var bw = r * 2.2;
      g.fillStyle = '#12161c'; g.fillRect(e.x - bw / 2, e.y - r - 6, bw, 3);
      g.fillStyle = '#e05f5f'; g.fillRect(e.x - bw / 2, e.y - r - 6, bw * EO.clamp(e.hp / e.maxhp, 0, 1), 3);
    }
  }

  function drawShots(g) {
    for (var i = 0; i < G.shots.length; i++) {
      var s = G.shots[i], a = s.t / s.mt;
      g.globalAlpha = a;
      g.strokeStyle = s.c;
      g.lineWidth = s.k === 2 ? 3 : (s.k === 3 ? 2 : 2);
      if (s.k === 4) {
        g.beginPath();
        var mx = (s.x + s.tx) * 0.5, my = Math.min(s.y, s.ty) - 40;
        g.moveTo(s.x, s.y); g.quadraticCurveTo(mx, my, s.tx, s.ty); g.stroke();
      } else if (s.k === 3) {
        g.beginPath(); g.moveTo(s.x, s.y);
        var steps = 4;
        for (var k = 1; k <= steps; k++) {
          var tt = k / steps;
          g.lineTo(EO.lerp(s.x, s.tx, tt) + (k < steps ? EO.rnd(-6, 6) : 0), EO.lerp(s.y, s.ty, tt) + (k < steps ? EO.rnd(-6, 6) : 0));
        }
        g.stroke();
      } else {
        g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(s.tx, s.ty); g.stroke();
      }
      g.globalAlpha = 1;
    }
  }

  function drawHUD(g) {
    var L = G.L, w = L.w;
    g.fillStyle = '#12161c';
    g.fillRect(0, 0, w, L.hud);
    g.strokeStyle = '#232c37'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, L.hud + 0.5); g.lineTo(w, L.hud + 0.5); g.stroke();

    var right = w - 112;
    var m = EO.MAPS[G.mapIdx];
    var colB = Math.max(150, right - 116);

    txt(g, (G.mapIdx + 1) + '. ' + m.name, 10, 16, 12, INK, 'left', '800');
    var wtxt = 'WAVE ' + Math.min(G.waveIdx + 1, G.waves.length) + '/' + G.waves.length;
    txt(g, wtxt, 10, 35, 11, DIM, 'left', '600');
    txt(g, G.state === 'prep' ? 'NEXT IN ' + Math.max(0, G.prepT).toFixed(1) + 's' : 'KILLS ' + G.kills, 10, 52, 10, G.state === 'prep' ? HL : DIM, 'left', '600');

    /* charge */
    txt(g, '◆ ' + Math.floor(G.energy), colB, 18, 17, HL, 'left', '800');

    /* leaks */
    txt(g, 'LEAKS ' + G.leaks + '/' + G.leakCap, colB, 38, 11, G.leaks > G.leakCap * 0.6 ? '#e05f5f' : DIM, 'left', '700');
    var bw = Math.max(60, right - colB - 8);
    g.fillStyle = '#232c37'; g.fillRect(colB, 47, bw, 6);
    g.fillStyle = '#e05f5f'; g.fillRect(colB, 47, bw * EO.clamp(G.leaks / G.leakCap, 0, 1), 6);
    if (G.best) txt(g, 'BEST ' + G.best, colB, 60, 9, DIM, 'left', '600');

    /* buttons (48px+) */
    U.btns.push({ id: 'speed', x: w - 108, y: 9, w: 50, h: 48, label: G.speed === 1 ? '1x' : '2x', fs: 14 });
    U.btns.push({ id: 'pause', x: w - 54, y: 9, w: 48, h: 48, label: G.paused ? '▶' : 'II', fs: 14 });
  }

  function drawTray(g) {
    var L = G.L, w = L.w;
    var list = G.save.unlocked;
    U.cards.length = 0;
    var perRow = 5;
    var pad = 5;
    var cw = (w - pad * (perRow + 1)) / perRow;
    var rows = 2;
    var ch = (L.trayH - pad * (rows + 1)) / rows;
    for (var i = 0; i < list.length && i < 10; i++) {
      var d = EO.DEF_BY_ID[list[i]];
      if (!d) continue;
      var col = i % perRow, row = Math.floor(i / perRow);
      var x = pad + col * (cw + pad), y = L.trayY + pad + row * (ch + pad);
      var afford = G.energy >= d.cost;
      var isDrag = EO.drag && EO.drag.card === i;
      U.cards.push({ id: 'card', idx: i, defId: d.id, x: x, y: y, w: cw, h: ch });
      rr(g, x, y, cw, ch, 7);
      g.fillStyle = isDrag ? '#2a323d' : '#1b222b';
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = (G.kbCard === i && EO.kbActive) ? HL : (afford ? d.col : '#39434f');
      g.globalAlpha = afford ? 1 : 0.45;
      g.stroke();
      /* icon */
      g.fillStyle = d.col;
      var s = Math.min(cw, ch) * 0.19;
      rr(g, x + cw * 0.5 - s, y + ch * 0.36 - s, s * 2, s * 2, 4); g.fill();
      txt(g, d.ab, x + cw * 0.5, y + ch * 0.36, Math.max(8, s * 0.95), '#12161c', 'center', '800');
      txt(g, d.name, x + cw * 0.5, y + ch * 0.68, 8.5, INK, 'center', '700');
      txt(g, '◆' + d.cost, x + cw * 0.5, y + ch * 0.86, 10, afford ? HL : '#e05f5f', 'center', '800');
      g.globalAlpha = 1;
    }
  }

  function drawSelPanel(g) {
    var L = G.L, dd = G.sel;
    if (!dd) return;
    var h = 62, y = L.trayY - h - 4, w = L.w - 12, x = 6;
    rr(g, x, y, w, h, 9);
    g.fillStyle = 'rgba(18,22,28,0.93)'; g.fill();
    g.strokeStyle = dd.def.col; g.lineWidth = 2; g.stroke();
    txt(g, dd.def.name, x + 10, y + 16, 12, dd.def.col, 'left', '800');
    txt(g, 'HULL ' + Math.max(0, Math.round(dd.hp)) + '/' + dd.maxhp, x + 10, y + 33, 10, DIM, 'left', '600');
    txt(g, dd.def.skill.name + ': ' + dd.def.skill.desc, x + 10, y + 49, 9, DIM, 'left', '600');
    var bw = 84, bh = 50;
    var sk = { id: 'skill', x: x + w - bw - 6, y: y + 6, w: bw, h: bh, primary: dd.skcd <= 0, on: dd.skcd <= 0 };
    sk.label = dd.skcd <= 0 ? dd.def.skill.name : Math.ceil(dd.skcd) + 's';
    sk.fs = dd.skcd <= 0 ? 12 : 16;
    U.btns.push(sk);
    button(g, sk);
    var rc = { id: 'recycle', x: x + w - bw - 6 - 62, y: y + 6, w: 56, h: bh, label: 'SCRAP', fs: 10, sub: '+' + Math.round(dd.def.cost * 0.5) };
    U.btns.push(rc); button(g, rc);
  }

  function drawDragGhost(g) {
    var D = EO.drag;
    if (!D || !D.active || D.card < 0) return;
    var L = G.L, t = L.tile;
    var id = G.save.unlocked[D.card];
    var d = EO.DEF_BY_ID[id];
    if (!d) return;
    if (D.cell) {
      var ok = EO.buildable(D.cell.c, D.cell.r) && G.energy >= d.cost;
      var cells = EO.fpPreview(id, D.cell.c, D.cell.r, D.dir);
      g.fillStyle = ok ? 'rgba(255,180,84,0.22)' : 'rgba(224,95,95,0.18)';
      for (var i = 0; i < cells.length; i++) g.fillRect(L.ox + cells[i][0] * t + 1, L.oy + cells[i][1] * t + 1, t - 2, t - 2);
      g.strokeStyle = ok ? HL : '#e05f5f'; g.lineWidth = 3;
      g.strokeRect(L.ox + D.cell.c * t + 2, L.oy + D.cell.r * t + 2, t - 4, t - 4);
      /* facing arrow */
      var cx = EO.cellX(D.cell.c), cy = EO.cellY(D.cell.r), dir = EO.DIRS[D.dir];
      g.strokeStyle = ok ? HL : '#e05f5f'; g.lineWidth = 4;
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + dir[0] * t * 0.75, cy + dir[1] * t * 0.75); g.stroke();
      g.fillStyle = ok ? HL : '#e05f5f';
      g.beginPath();
      var ax = cx + dir[0] * t * 0.95, ay = cy + dir[1] * t * 0.95;
      g.moveTo(ax, ay);
      g.lineTo(ax - dir[0] * 10 - dir[1] * 7, ay - dir[1] * 10 + dir[0] * 7);
      g.lineTo(ax - dir[0] * 10 + dir[1] * 7, ay - dir[1] * 10 - dir[0] * 7);
      g.closePath(); g.fill();
    }
    /* finger ghost */
    g.globalAlpha = 0.75;
    g.fillStyle = d.col;
    rr(g, D.x - 18, D.y - 18, 36, 36, 6); g.fill();
    txt(g, d.ab, D.x, D.y, 12, '#12161c', 'center', '800');
    g.globalAlpha = 1;
  }

  function drawPlay(g) {
    var L = G.L;
    g.save();
    if (G.shake > 0) g.translate(EO.rnd(-G.shake, G.shake) * 0.5, EO.rnd(-G.shake, G.shake) * 0.5);
    drawGrid(g);
    var i;
    for (i = 0; i < G.defs.length; i++) drawDefender(g, G.defs[i]);
    for (i = 0; i < G.enemies.length; i++) if (!G.enemies[i].air) drawEnemy(g, G.enemies[i]);
    for (i = 0; i < G.enemies.length; i++) if (G.enemies[i].air) drawEnemy(g, G.enemies[i]);
    drawShots(g);
    G.parts.draw(g);
    for (i = 0; i < G.floats.length; i++) {
      var f = G.floats[i];
      g.globalAlpha = EO.clamp(f.t / f.mt, 0, 1);
      txt(g, f.s, f.x, f.y, 12, f.c, 'center', '800');
      g.globalAlpha = 1;
    }
    g.restore();

    if (G.flashT > 0) {
      g.fillStyle = 'rgba(224,95,95,' + (G.flashT * 0.7).toFixed(3) + ')';
      g.fillRect(0, 0, L.w, L.h);
    }
    drawHUD(g);
    drawTray(g);
    drawSelPanel(g);
    drawDragGhost(g);

    if (G.hint && !G.sel) {
      var hy = L.trayY - 16;
      g.fillStyle = 'rgba(18,22,28,0.85)';
      g.fillRect(0, hy - 11, L.w, 22);
      txt(g, 'DRAG A CARD ONTO A TILE — FLICK TO AIM ITS FACING', L.w * 0.5, hy, 10.5, HL, 'center', '800');
    }
    if (G.paused) {
      g.fillStyle = 'rgba(13,16,20,0.8)';
      g.fillRect(0, L.hud, L.w, L.gridB - L.hud);
      txt(g, 'PAUSED', L.w * 0.5, L.oy + 120, 26, HL, 'center', '800');
      var b = { id: 'quit', x: L.w * 0.5 - 90, y: L.oy + 160, w: 180, h: 52, label: 'ABANDON MAP' };
      U.btns.push(b); button(g, b);
      var b2 = { id: 'resume', x: L.w * 0.5 - 90, y: L.oy + 220, w: 180, h: 52, label: 'RESUME', primary: true };
      U.btns.push(b2); button(g, b2);
    }
    if (G.state === 'won' || G.state === 'lost') {
      g.fillStyle = 'rgba(13,16,20,0.55)';
      g.fillRect(0, 0, L.w, L.h);
      txt(g, G.state === 'won' ? 'MAP CLEAR' : 'OUTPOST OVERRUN', L.w * 0.5, L.h * 0.42, 24, G.state === 'won' ? '#8fe0a0' : '#e05f5f', 'center', '800');
    }
  }

  /* ---------- result ---------- */
  function drawResult(g) {
    var L = G.L, w = L.w, R = G.resultInfo || { win: false, newDefs: [] };
    g.fillStyle = BG; g.fillRect(0, 0, w, L.h);
    var y = 74;
    txt(g, R.win ? (R.final ? 'THE LINE HOLDS' : 'MAP CLEAR') : 'OUTPOST OVERRUN', w * 0.5, y, 24, R.win ? '#8fe0a0' : '#e05f5f', 'center', '800');
    y += 26;
    txt(g, (G.mapIdx + 1) + '. ' + EO.MAPS[G.mapIdx].name, w * 0.5, y, 12, DIM, 'center', '700');
    y += 40;
    txt(g, 'SCORE', w * 0.5, y, 11, DIM, 'center', '700'); y += 24;
    txt(g, '' + G.score, w * 0.5, y, 32, HL, 'center', '800'); y += 26;
    var bestv = (G.save.best['m' + G.mapIdx]) || 0;
    txt(g, (R.record ? 'NEW BEST  ' : 'BEST  ') + bestv, w * 0.5, y, 11, R.record ? '#8fe0a0' : DIM, 'center', '700');
    y += 30;
    txt(g, 'KILLS ' + G.kills + '   LEAKS ' + G.leaks + '/' + G.leakCap + '   TIME ' + G.time.toFixed(0) + 's', w * 0.5, y, 11, DIM, 'center', '600');
    y += 34;
    if (R.win && R.mats) {
      txt(g, 'SALVAGE', w * 0.5, y, 11, DIM, 'center', '700'); y += 22;
      txt(g, '+' + R.mats.scrap + ' SCRAP   +' + R.mats.ember + ' EMBER   +' + R.mats.alloy + ' ALLOY', w * 0.5, y, 12, '#e2c46a', 'center', '800');
      y += 30;
    }
    if (R.newDefs && R.newDefs.length) {
      txt(g, 'DEFENDERS UNLOCKED', w * 0.5, y, 11, DIM, 'center', '700'); y += 24;
      var names = [];
      for (var i = 0; i < R.newDefs.length; i++) names.push(EO.DEF_BY_ID[R.newDefs[i]].name);
      txt(g, names.join('  +  '), w * 0.5, y, 14, '#8fe0a0', 'center', '800');
      y += 30;
    }
    if (R.final && R.win) {
      txt(g, 'All eight maps held. The emberline is yours.', w * 0.5, y, 11, INK, 'center', '600');
      y += 26;
    }
    var by = Math.max(y + 14, L.h - 226);
    var nextIdx = R.win ? Math.min(G.mapIdx + 1, EO.MAPS.length - 1) : G.mapIdx;
    var canNext = R.win && G.mapIdx < EO.MAPS.length - 1;
    var b1 = { id: 'again', x: w * 0.5 - 130, y: by, w: 260, h: 56, primary: true, fs: 15, next: nextIdx, label: canNext ? 'NEXT: ' + EO.MAPS[nextIdx].name : (R.win ? 'REPLAY MAP' : 'RETRY MAP') };
    U.btns.push(b1); button(g, b1);
    var b2 = { id: 'base', x: w * 0.5 - 130, y: by + 62, w: 126, h: 52, label: 'BASE', fs: 13 };
    U.btns.push(b2); button(g, b2);
    var b3 = { id: 'maps', x: w * 0.5 + 4, y: by + 62, w: 126, h: 52, label: 'MAPS', fs: 13 };
    U.btns.push(b3); button(g, b3);
  }

  /* ---------- base (crafting) ---------- */
  EO.baseSlot = 0;
  function drawBase(g) {
    var L = G.L, w = L.w, S = G.save;
    g.fillStyle = BG; g.fillRect(0, 0, w, L.h);
    txt(g, 'OUTPOST WORKSHOP', w * 0.5, 34, 18, HL, 'center', '800');
    txt(g, 'Craft deploy kits from salvage. Kits apply to every map.', w * 0.5, 55, 10, DIM, 'center', '600');
    txt(g, 'SCRAP ' + S.mats.scrap + '    EMBER ' + S.mats.ember + '    ALLOY ' + S.mats.alloy, w * 0.5, 76, 12, '#e2c46a', 'center', '800');

    U.slots.length = 0;
    var n = EO.slotsUnlocked(S.cleared);
    var sw = (w - 10 - 3 * 6) / 4, sh = 58, sy = 94;
    for (var i = 0; i < 4; i++) {
      var x = 5 + i * (sw + 6);
      var open = i < n;
      var kid = S.kits[i], kit = kid ? EO.KIT_BY_ID[kid] : null;
      U.slots.push({ id: 'slot', idx: i, x: x, y: sy, w: sw, h: sh, open: open });
      rr(g, x, sy, sw, sh, 7);
      g.fillStyle = (EO.baseSlot === i && open) ? '#2a323d' : '#1b222b'; g.fill();
      g.lineWidth = 2;
      g.strokeStyle = !open ? '#39434f' : (EO.baseSlot === i ? HL : (kit ? '#8fe0a0' : '#39434f'));
      g.globalAlpha = open ? 1 : 0.4;
      g.stroke();
      if (!open) {
        txt(g, 'LOCKED', x + sw * 0.5, sy + sh * 0.42, 9, DIM, 'center', '700');
        txt(g, 'CLEAR ' + (i === 1 ? 2 : i === 2 ? 4 : 6), x + sw * 0.5, sy + sh * 0.66, 8.5, DIM, 'center', '600');
      } else if (kit) {
        var parts = kit.name.split(' ');
        txt(g, parts[0], x + sw * 0.5, sy + sh * 0.36, 9.5, '#8fe0a0', 'center', '800');
        txt(g, parts[1] || '', x + sw * 0.5, sy + sh * 0.58, 9.5, '#8fe0a0', 'center', '800');
        txt(g, 'SLOT ' + (i + 1), x + sw * 0.5, sy + sh * 0.82, 8, DIM, 'center', '600');
      } else {
        txt(g, 'EMPTY', x + sw * 0.5, sy + sh * 0.42, 10, DIM, 'center', '700');
        txt(g, 'SLOT ' + (i + 1), x + sw * 0.5, sy + sh * 0.68, 8, DIM, 'center', '600');
      }
      g.globalAlpha = 1;
    }
    txt(g, 'TAP A SLOT, THEN A KIT TO FIT IT', w * 0.5, sy + sh + 14, 9.5, HL, 'center', '800');

    U.recipes.length = 0;
    var ry = sy + sh + 28;
    var rh = EO.clamp((L.h - ry - 68) / EO.KITS.length - 6, 42, 56);
    for (var k = 0; k < EO.KITS.length; k++) {
      var kt = EO.KITS[k];
      var y = ry + k * (rh + 6);
      var equipped = S.kits.indexOf(kt.id) >= 0;
      var afford = S.mats.scrap >= kt.cost.scrap && S.mats.ember >= kt.cost.ember && S.mats.alloy >= kt.cost.alloy;
      U.recipes.push({ id: 'recipe', idx: k, kitId: kt.id, x: 5, y: y, w: w - 10, h: rh, afford: afford, equipped: equipped });
      rr(g, 5, y, w - 10, rh, 7);
      g.fillStyle = '#1b222b'; g.fill();
      g.lineWidth = 2; g.strokeStyle = equipped ? '#8fe0a0' : (afford ? '#39434f' : '#2a323d');
      g.globalAlpha = (afford || equipped) ? 1 : 0.5;
      g.stroke();
      txt(g, kt.name, 14, y + rh * 0.27, 12, equipped ? '#8fe0a0' : INK, 'left', '800');
      txt(g, kt.desc, 14, y + rh * 0.57, 9.5, DIM, 'left', '600');
      var costs = kt.cost.scrap + ' SCRAP';
      if (kt.cost.ember) costs += '  ' + kt.cost.ember + ' EMBER';
      if (kt.cost.alloy) costs += '  ' + kt.cost.alloy + ' ALLOY';
      txt(g, equipped ? 'FITTED' : costs, 14, y + rh * 0.84, 9, equipped ? '#8fe0a0' : (afford ? '#e2c46a' : '#e05f5f'), 'left', '700');
      g.globalAlpha = 1;
    }
    var by = ry + EO.KITS.length * (rh + 6) + 4;
    if (by > L.h - 60) by = L.h - 60;
    var b = { id: 'back', x: w * 0.5 - 120, y: by, w: 240, h: 52, label: 'BACK TO MAPS', primary: true };
    U.btns.push(b); button(g, b);
  }

  /* ---------- map select ---------- */
  function drawMaps(g) {
    var L = G.L, w = L.w, S = G.save;
    g.fillStyle = BG; g.fillRect(0, 0, w, L.h);
    txt(g, 'EMBERLINE OUTPOST', w * 0.5, 32, 19, HL, 'center', '800');
    txt(g, 'MAPS HELD ' + S.cleared + '/8   ·   DEFENDERS ' + S.unlocked.length + '/10', w * 0.5, 53, 10.5, DIM, 'center', '700');

    U.mapBtns.length = 0;
    var cols = 2, bw = (w - 10 - 6) / cols, bh = 56, top = 74;
    for (var i = 0; i < EO.MAPS.length; i++) {
      var cx = i % cols, cy = Math.floor(i / cols);
      var x = 5 + cx * (bw + 6), y = top + cy * (bh + 7);
      var open = i <= S.cleared;
      var best = S.best['m' + i] || 0;
      U.mapBtns.push({ id: 'map', idx: i, x: x, y: y, w: bw, h: bh, open: open });
      rr(g, x, y, bw, bh, 7);
      g.fillStyle = open ? '#1b222b' : '#141a22'; g.fill();
      g.lineWidth = 2; g.strokeStyle = open ? (i === S.cleared ? HL : '#39434f') : '#232c37';
      g.globalAlpha = open ? 1 : 0.45; g.stroke();
      txt(g, (i + 1) + '. ' + EO.MAPS[i].name, x + 10, y + 18, 12, open ? INK : DIM, 'left', '800');
      if (open) txt(g, best ? 'BEST ' + best : 'NOT YET HELD', x + 10, y + 36, 9.5, best ? '#8fe0a0' : DIM, 'left', '600');
      else txt(g, 'LOCKED', x + 10, y + 36, 9.5, DIM, 'left', '600');
      if (open) txt(g, EO.MAPS[i].waves + ' WAVES · LEAK CAP ' + EO.MAPS[i].leak, x + 10, y + 49, 8.5, DIM, 'left', '600');
      g.globalAlpha = 1;
    }
    var by = top + Math.ceil(EO.MAPS.length / cols) * (bh + 7) + 6;
    var b1 = { id: 'base', x: 5, y: by, w: (w - 16) * 0.5, h: 52, label: 'WORKSHOP', fs: 13 };
    U.btns.push(b1); button(g, b1);
    var b2 = { id: 'playsel', x: 5 + (w - 16) * 0.5 + 6, y: by, w: (w - 16) * 0.5, h: 52, label: 'DEPLOY', primary: true, fs: 13 };
    U.btns.push(b2); button(g, b2);

    /* roster */
    var ry = by + 62;
    txt(g, 'ROSTER', w * 0.5, ry, 10, DIM, 'center', '700');
    ry += 16;
    var pw = (w - 12) / 5;
    for (var d = 0; d < EO.DEFS.length; d++) {
      var dd = EO.DEFS[d], has = S.unlocked.indexOf(dd.id) >= 0;
      var px = 6 + (d % 5) * pw, py = ry + Math.floor(d / 5) * 34;
      g.globalAlpha = has ? 1 : 0.28;
      g.fillStyle = dd.col;
      rr(g, px + pw * 0.5 - 11, py, 22, 22, 4); g.fill();
      txt(g, dd.ab, px + pw * 0.5, py + 11, 9, '#12161c', 'center', '800');
      txt(g, has ? dd.name : 'LOCKED', px + pw * 0.5, py + 28, 7.5, has ? DIM : '#4d5762', 'center', '700');
      g.globalAlpha = 1;
    }
  }

  /* ---------- entry ---------- */
  EO.render = function (g) {
    var L = G.L;
    U.btns.length = 0;
    g.fillStyle = BG;
    g.fillRect(0, 0, L.w, L.h);
    if (G.screen === 'play') drawPlay(g);
    else if (G.screen === 'result') drawResult(g);
    else if (G.screen === 'base') drawBase(g);
    else drawMaps(g);
  };

})(window.EO);
