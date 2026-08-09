/* Hivefall - game shell: layout, states, input, HUD, shop, render loop */
(function (w) {
  'use strict';
  var HF = w.HF;
  var d = w.document;

  var COLS = 6, ROWS = 6, NCOL = 5, MAXFIGHT = 20;
  var GEM = [
    { c: '#ff5f5f', n: 'CANNON' },
    { c: '#57c7ff', n: 'FROST' },
    { c: '#6fdc7f', n: 'REPAIR' },
    { c: '#ffd15c', n: 'COIN' },
    { c: '#b98aff', n: 'VENOM' }
  ];
  var GEAR = [
    { k: 'dmg', name: 'GUN CALIBRE', desc: 'shot damage' },
    { k: 'slow', name: 'FROST COILS', desc: 'slow power' },
    { k: 'wall', name: 'WALL PLATING', desc: 'wall hit points' },
    { k: 'coin', name: 'SALVAGE RIG', desc: 'coin gain' }
  ];
  function gearCost(lvl) { return Math.round(25 * Math.pow(1.78, lvl)); }
  var MAXLVL = 8;

  var cv = d.getElementById('cv'), g = cv.getContext('2d', { alpha: false });
  var bootEl = d.getElementById('boot'), rotEl = d.getElementById('rot');

  var L = { W: 390, H: 700, cell: 60, bx: 0, by: 0, btop: 46, wallY: 300, hud: 46 };
  var save = HF.loadSave();
  var board = new HF.Board(COLS, ROWS, NCOL);
  var battle = new HF.Battle();
  var state = 'shop';         /* shop | fight | lost | won */
  var started = false, paused = false, rotated = false;
  var hintT = 0, shakeT = 0, resultT = 0, endBonus = 0;
  var cursor = { r: ROWS - 1, c: 0, sel: null };
  var shopSel = 0;
  var wave = HF.genWave(save.fight, COLS);
  var lastT = 0;

  /* ---------- input state (fully clearable) ---------- */
  var IN = { ptr: {}, dragId: null, dragCell: null, dragX: 0, dragY: 0, keys: {}, btnDown: null };
  function resetInput() {
    IN.ptr = {}; IN.dragId = null; IN.dragCell = null; IN.dragX = 0; IN.dragY = 0;
    IN.keys = {}; IN.btnDown = null; IN.btnPtr = null; IN.keyMode = false;
    cursor.sel = null;
  }

  /* ---------- layout ---------- */
  function layout() {
    var W = w.innerWidth, H = w.innerHeight;
    var dpr = Math.min(2, w.devicePixelRatio || 1);
    var longAxis = Math.max(W, H);
    if (longAxis * dpr > 960) dpr = 960 / longAxis;
    cv.width = Math.max(1, Math.round(W * dpr));
    cv.height = Math.max(1, Math.round(H * dpr));
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    L.W = W; L.H = H; L.dpr = dpr;
    L.hud = 46; L.btop = L.hud;
    var cell = Math.min((W - 14) / COLS, (H - L.hud - 26 - H * 0.34) / ROWS);
    cell = Math.max(30, cell);
    L.cell = cell;
    L.bw = cell * COLS; L.bh = cell * ROWS;
    L.bx = Math.round((W - L.bw) / 2);
    L.by = Math.round(H - L.bh - 8);
    L.wallY = L.by - 18;
    rotated = W > H;
    rotEl.classList.toggle('on', rotated && started);
  }

  /* ---------- ui buttons ---------- */
  var BTN = [];
  function btn(id, x, y, bw, bh, label, kind) {
    BTN.push({ id: id, x: x, y: y, w: bw, h: bh, label: label, kind: kind || 'main' });
    return BTN[BTN.length - 1];
  }
  function hitBtn(x, y) {
    for (var i = BTN.length - 1; i >= 0; i--) {
      var b = BTN[i];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
    }
    return null;
  }
  function drawBtn(b, on) {
    var bg = b.kind === 'go' ? '#ffd15c' : (b.kind === 'ghost' ? '#182231' : '#22314a');
    var fg = b.kind === 'go' ? '#0b0f14' : '#dfe8f2';
    if (b.dim) { bg = '#141c27'; fg = '#4d5c70'; }
    g.fillStyle = on ? '#ffffff' : bg;
    roundRect(b.x, b.y, b.w, b.h, 10); g.fill();
    g.fillStyle = on ? '#0b0f14' : fg;
    g.font = 'bold ' + (b.fs || 15) + 'px ui-monospace,monospace';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1);
  }
  function roundRect(x, y, ww, hh, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + ww, y, x + ww, y + hh, r);
    g.arcTo(x + ww, y + hh, x, y + hh, r);
    g.arcTo(x, y + hh, x, y, r);
    g.arcTo(x, y, x + ww, y, r);
    g.closePath();
  }

  /* ---------- flow ---------- */
  function persist() {
    save.best = Math.max(save.best, save.fight);
    HF.writeSave(save);
  }
  function startFight() {
    HF.clearTimers();
    resetInput();
    HF.fx.clear();
    board.reset();
    battle.reset(save.fight, save.gear, COLS);
    wave = battle.wave;
    state = 'fight'; hintT = 9; shakeT = 0;
    cursor.r = ROWS - 1; cursor.c = 0; cursor.sel = null;
  }
  function toShop() {
    HF.clearTimers(); resetInput();
    wave = HF.genWave(Math.min(save.fight, MAXFIGHT), COLS);
    state = 'shop'; shopSel = 0;
  }
  function newRun() {
    HF.clearTimers(); resetInput(); HF.fx.clear();
    save.fight = 1; save.coins = 0;
    save.gear = { dmg: 0, slow: 0, wall: 0, coin: 0 };
    persist(); toShop();
  }
  function buy(i) {
    var k = GEAR[i].k, lvl = save.gear[k];
    if (lvl >= MAXLVL) return;
    var cost = gearCost(lvl);
    if (save.coins < cost) { HF.audio.sfx('bad'); return; }
    save.coins -= cost; save.gear[k] = lvl + 1;
    HF.audio.sfx('buy'); persist();
  }

  /* board match -> weapons */
  board.onClear = function (runs, combo) {
    var cmul = 1 + 0.28 * (combo - 1);
    var total = 0;
    for (var i = 0; i < runs.length; i++) {
      var run = runs[i], splash = run.len >= 4, pierce = run.len >= 5;
      var power = cmul * (1 + (run.len - 3) * 0.35);
      for (var j = 0; j < run.cells.length; j++) {
        var cc = run.cells[j];
        battle.fire(cc.c, run.t, power, splash, pierce, L);
        var rect = board.cellRect(L, cc.r, cc.c);
        HF.fx.burst(rect.x + rect.s / 2, rect.y + rect.s / 2, GEM[run.t].c, 5, 130, 0.4);
        total++;
      }
    }
    HF.audio.sfx('match', combo);
    if (combo > 1) {
      HF.fx.text(L.W / 2, L.by - 26, 'COMBO x' + combo, '#ffd15c');
      shakeT = Math.min(8, shakeT + 2);
    }
    if (total > 6) shakeT = Math.min(10, shakeT + 2);
  };

  /* ---------- update ---------- */
  function update(dt) {
    HF.fx.update(dt);
    shakeT = Math.max(0, shakeT - dt * 24);
    if (state === 'fight') {
      hintT -= dt;
      board.update(dt);
      battle.update(dt, L);
      if (battle.coins > 0) { save.coins += battle.coins; battle.coins = 0; }
      if (battle.over === -1) {
        state = 'lost'; resultT = 0; persist();
        HF.audio.sfx('lose'); resetInput();
      } else if (battle.over === 1) {
        endBonus = 25 + save.fight * 12;
        save.coins += endBonus;
        state = 'won'; resultT = 0;
        save.fight = Math.min(MAXFIGHT + 1, save.fight + 1);
        if (save.fight > MAXFIGHT) save.wins++;
        persist(); HF.audio.sfx('win'); resetInput();
      }
    }
  }

  /* ---------- draw ---------- */
  function drawHUD() {
    g.fillStyle = '#111823';
    g.fillRect(0, 0, L.W, L.hud);
    g.textBaseline = 'middle'; g.textAlign = 'left';
    g.font = 'bold 14px ui-monospace,monospace';
    g.fillStyle = '#9fb3c8';
    var f = Math.min(save.fight, MAXFIGHT);
    g.fillText('FIGHT ' + f + '/' + MAXFIGHT, 10, 15);
    g.fillStyle = '#ffd15c';
    g.textAlign = 'right';
    g.fillText(save.coins + 'c', L.W - 56, 15);
    /* wall bar */
    var bw = L.W - 20, hp = state === 'fight' ? battle.wallHp : battle.wallMax(save.gear);
    var mx = state === 'fight' ? battle.wallHpMax : battle.wallMax(save.gear);
    g.fillStyle = '#0b0f14'; g.fillRect(10, 26, bw, 10);
    var frac = HF.clamp(hp / mx, 0, 1);
    g.fillStyle = frac > 0.5 ? '#6fdc7f' : (frac > 0.22 ? '#ffd15c' : '#ff5f5f');
    g.fillRect(10, 26, bw * frac, 10);
    g.fillStyle = '#dfe8f2'; g.font = 'bold 10px ui-monospace,monospace'; g.textAlign = 'left';
    g.fillText('WALL ' + Math.ceil(hp) + '/' + Math.round(mx), 14, 31);
    /* mute */
    var mb = btn('mute', L.W - 50, 0, 50, L.hud, HF.audio.muted() ? 'off' : 'snd', 'ghost');
    mb.fs = 12;
    drawBtn(mb, IN.btnDown === 'mute');
  }

  function drawBoard() {
    /* frame */
    g.fillStyle = '#0d131b';
    g.fillRect(0, L.by - 20, L.W, L.H - (L.by - 20));
    /* wall */
    var wy = L.wallY;
    g.fillStyle = '#3a4b63';
    g.fillRect(0, wy, L.W, 10);
    g.fillStyle = '#22304a';
    for (var i = 0; i < COLS; i++) {
      var x = L.bx + i * L.cell;
      g.fillRect(x + 2, wy + 2, L.cell - 4, 6);
      /* turret nub */
      g.fillStyle = '#5b7595';
      g.fillRect(x + L.cell / 2 - 4, wy - 7, 8, 8);
      g.fillStyle = '#22304a';
    }

    var sw = board.sw;
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var cellObj = board.grid[r][c];
        var rect = board.cellRect(L, r, c);
        var cx = rect.x + rect.s / 2, cy = rect.y + rect.s / 2 - cellObj.oy * L.cell;
        var sc = 1;
        if (cellObj.pop >= 0) sc = 1 - cellObj.pop;
        if (sw) {
          var p = HF.ease(HF.clamp(sw.t, 0, 1));
          var dir = null;
          if (sw.a.r === r && sw.a.c === c) dir = { dr: sw.b.r - r, dc: sw.b.c - c };
          else if (sw.b.r === r && sw.b.c === c) dir = { dr: sw.a.r - r, dc: sw.a.c - c };
          if (dir) { cx += dir.dc * L.cell * p; cy += dir.dr * L.cell * p; }
        }
        /* slot */
        g.fillStyle = ((r + c) % 2) ? '#131c27' : '#16202d';
        g.fillRect(rect.x, rect.y, rect.s, rect.s);
        if (sc <= 0.02) continue;
        drawGem(cellObj.t, cx, cy, L.cell * 0.40 * sc);
      }
    }
    /* selection / cursor */
    if (cursor.sel) outline(cursor.sel.r, cursor.sel.c, '#ffd15c', 3);
    if (IN.dragCell) outline(IN.dragCell.r, IN.dragCell.c, '#ffffff', 3);
    if (IN.keyMode) outline(cursor.r, cursor.c, '#7fd8ff', 2);
    /* board border */
    g.strokeStyle = '#1e2a3a'; g.lineWidth = 2;
    g.strokeRect(L.bx, L.by, L.bw, L.bh);
  }
  function outline(r, c, col, lw) {
    var rect = board.cellRect(L, r, c);
    g.strokeStyle = col; g.lineWidth = lw;
    g.strokeRect(rect.x + 2, rect.y + 2, rect.s - 4, rect.s - 4);
  }

  function drawGem(t, x, y, r) {
    g.fillStyle = GEM[t].c;
    g.beginPath();
    if (t === 0) { g.arc(x, y, r, 0, 6.2832); }
    else if (t === 1) { g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.closePath(); }
    else if (t === 2) {
      var q = r * 0.42;
      g.rect(x - q, y - r, q * 2, r * 2); g.rect(x - r, y - q, r * 2, q * 2);
    } else if (t === 3) { g.rect(x - r * 0.82, y - r * 0.82, r * 1.64, r * 1.64); }
    else { g.moveTo(x, y - r); g.lineTo(x + r * 0.92, y + r * 0.72); g.lineTo(x - r * 0.92, y + r * 0.72); g.closePath(); }
    g.fill();
    g.globalAlpha = 0.3; g.fillStyle = '#ffffff';
    g.fillRect(x - r * 0.5, y - r * 0.72, r * 0.5, r * 0.28);
    g.globalAlpha = 1;
  }

  function drawFight() {
    battle.draw(g, L);
    drawBoard();
    HF.fx.draw(g);
    drawHUD();
    /* remaining */
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 12px ui-monospace,monospace';
    var left = (battle.queue.length - battle.qi) + battle.enemies.length;
    g.fillStyle = '#8fa4bb';
    g.fillText('SWARM LEFT ' + left, L.W / 2, L.hud + 12);
    if (hintT > 0) {
      g.globalAlpha = HF.clamp(hintT, 0, 1);
      g.fillStyle = '#ffd15c';
      g.font = 'bold 12px ui-monospace,monospace';
      g.fillText('SWIPE TO MATCH - SHOTS FIRE UP THAT COLUMN', L.W / 2, L.wallY - 26);
      g.globalAlpha = 1;
    }
  }

  function panel(x, y, ww, hh) {
    g.fillStyle = '#111a25'; roundRect(x, y, ww, hh, 12); g.fill();
    g.strokeStyle = '#1e2a3a'; g.lineWidth = 2; g.stroke();
  }

  function drawShop() {
    g.fillStyle = '#0b0f14'; g.fillRect(0, 0, L.W, L.H);
    drawHUD();
    var y = L.hud + 10, pad = 10, ww = L.W - 20;
    /* wave preview */
    var ph = 92;
    panel(pad, y, ww, ph);
    g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillStyle = '#ffd15c'; g.font = 'bold 16px ui-monospace,monospace';
    g.fillText('WAVE ' + Math.min(save.fight, MAXFIGHT) + (wave.boss ? '  [BROOD]' : ''), pad + 12, y + 20);
    var sum = HF.waveSummary(wave);
    g.font = '12px ui-monospace,monospace';
    var lx = pad + 12, ly = y + 41;
    for (var i = 0; i < 4; i++) {
      if (!sum[i]) continue;
      var K = HF.KINDS[i], lab = K.name + ' x' + sum[i];
      var wdt = 15 + g.measureText(lab).width + 16;
      if (lx + wdt > pad + ww - 8) { lx = pad + 12; ly += 16; }
      g.fillStyle = K.col;
      g.fillRect(lx, ly - 5, 10, 10);
      g.fillStyle = '#c9d8e8';
      g.fillText(lab, lx + 15, ly);
      lx += wdt;
    }
    g.fillStyle = '#8fa4bb'; g.font = '11px ui-monospace,monospace';
    g.fillText('WALL ' + battle.wallMax(save.gear) + ' HP   BEST FIGHT ' + Math.min(save.best, MAXFIGHT) + (save.wins ? '   RUNS WON ' + save.wins : ''), pad + 12, y + 66);

    y += ph + 10;
    /* gear rows */
    var rowH = Math.max(48, Math.min(58, (L.H - y - 100) / 4 - 8));
    for (var k = 0; k < 4; k++) {
      var gy = y + k * (rowH + 8);
      var lvl = save.gear[GEAR[k].k];
      var cost = gearCost(lvl);
      var maxed = lvl >= MAXLVL;
      var afford = save.coins >= cost && !maxed;
      var b = btn('buy' + k, pad, gy, ww, rowH, '', afford ? 'main' : 'ghost');
      b.dim = !afford;
      drawBtn(b, IN.btnDown === b.id);
      /* content */
      g.textAlign = 'left'; g.textBaseline = 'middle';
      g.font = 'bold 14px ui-monospace,monospace';
      g.fillStyle = maxed ? '#6fdc7f' : (afford ? '#dfe8f2' : '#66788d');
      g.fillText(GEAR[k].name, pad + 12, gy + rowH * 0.32);
      g.font = '11px ui-monospace,monospace';
      g.fillStyle = '#8fa4bb';
      g.fillText(GEAR[k].desc, pad + 12, gy + rowH * 0.68);
      /* pips */
      for (var p = 0; p < MAXLVL; p++) {
        g.fillStyle = p < lvl ? '#ffd15c' : '#2b3a4f';
        g.fillRect(pad + 150 + p * 11, gy + rowH * 0.28 - 4, 8, 8);
      }
      g.textAlign = 'right';
      g.font = 'bold 13px ui-monospace,monospace';
      g.fillStyle = maxed ? '#6fdc7f' : (afford ? '#ffd15c' : '#66788d');
      g.fillText(maxed ? 'MAX' : (cost + 'c'), pad + ww - 12, gy + rowH * 0.62);
      if (shopSel === k) { g.strokeStyle = '#7fd8ff'; g.lineWidth = 2; roundRect(pad, gy, ww, rowH, 10); g.stroke(); }
    }
    /* fight button */
    var fy = y + 4 * (rowH + 8) + 6;
    fy = Math.min(fy, L.H - 74);
    var fb = btn('fight', pad, fy, ww, 64, save.fight > MAXFIGHT ? 'RUN COMPLETE - NEW RUN' : 'DEPLOY  >', 'go');
    fb.fs = 18;
    drawBtn(fb, IN.btnDown === 'fight');
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#5b6d82'; g.font = '10px ui-monospace,monospace';
    g.fillText('everything here is earned by playing - no purchases', L.W / 2, Math.min(L.H - 6, fy + 76));
    HF.fx.draw(g);
  }

  function drawResult() {
    drawFight();
    g.fillStyle = 'rgba(6,9,13,0.86)';
    g.fillRect(0, 0, L.W, L.H);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    var cy = L.H * 0.34;
    if (state === 'lost') {
      g.fillStyle = '#ff5f5f'; g.font = 'bold 30px ui-monospace,monospace';
      g.fillText('WALL BREACHED', L.W / 2, cy);
      g.fillStyle = '#c9d8e8'; g.font = '14px ui-monospace,monospace';
      g.fillText('kills ' + battle.killCount + '   salvage kept', L.W / 2, cy + 34);
      g.fillStyle = '#8fa4bb'; g.font = '12px ui-monospace,monospace';
      g.fillText('spend coins on gear, then hit the wave again', L.W / 2, cy + 56);
      var rb = btn('retry', L.W / 2 - 130, cy + 84, 260, 60, 'RETRY FIGHT', 'go'); rb.fs = 17;
      drawBtn(rb, IN.btnDown === 'retry');
      var sb = btn('shop', L.W / 2 - 130, cy + 154, 260, 56, 'UPGRADE SQUAD', 'main'); sb.fs = 15;
      drawBtn(sb, IN.btnDown === 'shop');
    } else if (state === 'won') {
      var done = save.fight > MAXFIGHT;
      g.fillStyle = '#ffd15c'; g.font = 'bold ' + (done ? 26 : 30) + 'px ui-monospace,monospace';
      g.fillText(done ? 'HIVE REPELLED' : 'WAVE CLEARED', L.W / 2, cy);
      g.fillStyle = '#c9d8e8'; g.font = '14px ui-monospace,monospace';
      g.fillText('kills ' + battle.killCount + '   bonus +' + endBonus + 'c', L.W / 2, cy + 34);
      if (done) {
        g.fillStyle = '#6fdc7f';
        g.fillText('all 20 fights held. the wall stands.', L.W / 2, cy + 58);
        var nb = btn('newrun', L.W / 2 - 130, cy + 90, 260, 60, 'NEW RUN', 'go'); nb.fs = 17;
        drawBtn(nb, IN.btnDown === 'newrun');
      } else {
        var cb = btn('shop', L.W / 2 - 130, cy + 84, 260, 60, 'TO THE ARMORY', 'go'); cb.fs = 17;
        drawBtn(cb, IN.btnDown === 'shop');
      }
    }
  }

  function frame(ts) {
    w.requestAnimationFrame(frame);
    var dt = (ts - lastT) / 1000; lastT = ts;
    if (!isFinite(dt) || dt < 0) dt = 0;
    dt = Math.min(dt, 0.05);
    if (!started) { return; }
    if (rotated || paused || d.hidden) { drawFrameOnly(); return; }
    update(dt);
    render();
  }
  function drawFrameOnly() { render(); }

  function render() {
    BTN.length = 0;
    g.save();
    if (shakeT > 0 || (state === 'fight' && battle.shake > 0)) {
      var s = Math.max(shakeT, state === 'fight' ? battle.shake : 0);
      g.translate(HF.rnd(-s, s) * 0.5, HF.rnd(-s, s) * 0.5);
    }
    g.fillStyle = '#0b0f14'; g.fillRect(-20, -20, L.W + 40, L.H + 40);
    if (state === 'shop') drawShop();
    else if (state === 'fight') drawFight();
    else drawResult();
    g.restore();
  }

  /* ---------- pointer input ---------- */
  function pos(e) {
    var r = cv.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function onDown(e) {
    if (!started || rotated || d.hidden) { resetInput(); return; }
    e.preventDefault();
    var p = pos(e), id = (e.pointerId === undefined ? 'm' : e.pointerId);
    IN.ptr[id] = { x: p.x, y: p.y };
    var b = hitBtn(p.x, p.y);
    if (b) { IN.btnDown = b.id; IN.btnPtr = id; return; }
    if (state === 'fight' && board.state === 'idle' && IN.dragId === null) {
      var cell = board.hitCell(L, p.x, p.y);
      if (cell) { IN.dragId = id; IN.dragCell = cell; IN.dragX = p.x; IN.dragY = p.y; IN.keyMode = false; }
    }
  }
  function onMove(e) {
    if (!started || rotated || d.hidden) return;
    var id = (e.pointerId === undefined ? 'm' : e.pointerId);
    if (!IN.ptr[id]) return;
    e.preventDefault();
    var p = pos(e);
    IN.ptr[id].x = p.x; IN.ptr[id].y = p.y;
    if (IN.dragId === id && IN.dragCell) {
      var dx = p.x - IN.dragX, dy = p.y - IN.dragY;
      var th = Math.max(14, L.cell * 0.38);
      if (Math.abs(dx) > th || Math.abs(dy) > th) {
        var r2 = IN.dragCell.r, c2 = IN.dragCell.c;
        if (Math.abs(dx) > Math.abs(dy)) c2 += dx > 0 ? 1 : -1; else r2 += dy > 0 ? 1 : -1;
        board.trySwap(IN.dragCell.r, IN.dragCell.c, r2, c2);
        IN.dragId = null; IN.dragCell = null;
      }
    }
  }
  function onUp(e) {
    if (!started || d.hidden) { resetInput(); return; }
    var id = (e.pointerId === undefined ? 'm' : e.pointerId);
    var p = IN.ptr[id] ? { x: IN.ptr[id].x, y: IN.ptr[id].y } : null;
    delete IN.ptr[id];
    if (IN.dragId === id) { IN.dragId = null; IN.dragCell = null; }
    if (IN.btnDown && IN.btnPtr === id) {
      var wasDown = IN.btnDown; IN.btnDown = null; IN.btnPtr = null;
      if (p && !rotated && !d.hidden) {
        var b = hitBtn(p.x, p.y);
        if (b && b.id === wasDown) activate(b.id);
      }
    }
  }
  function onCancel(e) {
    var id = (e.pointerId === undefined ? 'm' : e.pointerId);
    delete IN.ptr[id];
    if (IN.dragId === id) { IN.dragId = null; IN.dragCell = null; }
    if (IN.btnPtr === id) { IN.btnDown = null; IN.btnPtr = null; }
  }

  function activate(id) {
    if (id === 'mute') { HF.audio.toggle(); return; }
    if (id === 'fight') {
      if (save.fight > MAXFIGHT) { newRun(); return; }
      startFight(); return;
    }
    if (id === 'retry') { startFight(); return; }
    if (id === 'shop') { toShop(); return; }
    if (id === 'newrun') { newRun(); return; }
    if (id.indexOf('buy') === 0) { buy(parseInt(id.slice(3), 10) || 0); return; }
  }

  /* ---------- keyboard ---------- */
  function onKey(e) {
    if (!started || rotated || d.hidden) { resetInput(); return; }
    var k = e.key;
    if (IN.keys[k]) { if (k === ' ') e.preventDefault(); }
    IN.keys[k] = 1;
    if (state === 'fight') {
      IN.keyMode = true;
      var dr = 0, dc = 0;
      if (k === 'ArrowLeft') dc = -1; else if (k === 'ArrowRight') dc = 1;
      else if (k === 'ArrowUp') dr = -1; else if (k === 'ArrowDown') dr = 1;
      if (dr || dc) {
        e.preventDefault();
        if (cursor.sel) {
          board.trySwap(cursor.sel.r, cursor.sel.c, cursor.sel.r + dr, cursor.sel.c + dc);
          cursor.r = HF.clamp(cursor.sel.r + dr, 0, ROWS - 1);
          cursor.c = HF.clamp(cursor.sel.c + dc, 0, COLS - 1);
          cursor.sel = null;
        } else {
          cursor.r = HF.clamp(cursor.r + dr, 0, ROWS - 1);
          cursor.c = HF.clamp(cursor.c + dc, 0, COLS - 1);
        }
      } else if (k === ' ' || k === 'Enter') {
        e.preventDefault();
        cursor.sel = cursor.sel ? null : { r: cursor.r, c: cursor.c };
      } else if (k === 'r' || k === 'R') { startFight(); }
      else if (k === 'm' || k === 'M') { HF.audio.toggle(); }
      return;
    }
    if (state === 'shop') {
      if (k === 'ArrowUp') { shopSel = (shopSel + 3) % 4; e.preventDefault(); }
      else if (k === 'ArrowDown') { shopSel = (shopSel + 1) % 4; e.preventDefault(); }
      else if (k === 'Enter') { buy(shopSel); }
      else if (k === ' ' || k === 'f' || k === 'F') { e.preventDefault(); activate('fight'); }
      else if (k === 'm' || k === 'M') { HF.audio.toggle(); }
      return;
    }
    if (state === 'lost') {
      if (k === 'Enter' || k === ' ' || k === 'r' || k === 'R') { e.preventDefault(); startFight(); }
      else if (k === 'ArrowDown' || k === 'u' || k === 'U') { toShop(); }
      return;
    }
    if (state === 'won') {
      if (k === 'Enter' || k === ' ') { e.preventDefault(); (save.fight > MAXFIGHT) ? newRun() : toShop(); }
      return;
    }
  }
  function onKeyUp(e) { delete IN.keys[e.key]; }

  /* ---------- boot ---------- */
  function boot() {
    HF.audio.unlock();
    bootEl.classList.remove('on');
    started = true;
    lastT = w.performance.now();
    resetInput();
    layout();
    toShop();
  }

  d.getElementById('bootBtn').addEventListener('click', boot);
  bootEl.addEventListener('touchend', function (e) { if (e.target.id === 'bootBtn') { e.preventDefault(); boot(); } }, { passive: false });

  var wrap = d.getElementById('wrap');
  var hasPointer = !!w.PointerEvent;
  if (hasPointer) {
    wrap.addEventListener('pointerdown', onDown, { passive: false });
    wrap.addEventListener('pointermove', onMove, { passive: false });
    w.addEventListener('pointerup', onUp, { passive: false });
    w.addEventListener('pointercancel', onCancel, { passive: false });
  } else {
    wrap.addEventListener('touchstart', function (e) {
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        onDown({ pointerId: t.identifier, clientX: t.clientX, clientY: t.clientY, preventDefault: function () { e.preventDefault(); } });
      }
    }, { passive: false });
    wrap.addEventListener('touchmove', function (e) {
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        onMove({ pointerId: t.identifier, clientX: t.clientX, clientY: t.clientY, preventDefault: function () { e.preventDefault(); } });
      }
    }, { passive: false });
    wrap.addEventListener('touchend', function (e) {
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        onUp({ pointerId: t.identifier, clientX: t.clientX, clientY: t.clientY });
      }
    }, { passive: false });
    wrap.addEventListener('touchcancel', function (e) {
      for (var i = 0; i < e.changedTouches.length; i++) onCancel({ pointerId: e.changedTouches[i].identifier });
    }, { passive: false });
    wrap.addEventListener('mousedown', onDown);
    wrap.addEventListener('mousemove', onMove);
    w.addEventListener('mouseup', onUp);
  }
  wrap.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  d.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  w.addEventListener('keydown', onKey);
  w.addEventListener('keyup', onKeyUp);
  w.addEventListener('blur', function () { resetInput(); });
  d.addEventListener('visibilitychange', function () {
    resetInput();
    if (!d.hidden) lastT = w.performance.now();
  });
  w.addEventListener('resize', function () { layout(); resetInput(); });
  w.addEventListener('orientationchange', function () { HF.after(layout, 60); resetInput(); });

  layout();
  w.requestAnimationFrame(frame);
})(window);
