/* Beastbind Cards - rendering, hit regions, screens. */
(function (root) {
  'use strict';
  var D = root.BB_CARDS, E = root.BB_ENGINE, C = D.CARDS;
  var W = 390, H = 700;
  var BENCH = 3;

  var ctx = null;
  var R = [];        // hit regions for this frame
  var scrollMax = 0;

  // ------------------------------------------------------------ draw helpers
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
  function fillRR(x, y, w, h, r, col) { ctx.fillStyle = col; rr(x, y, w, h, r); ctx.fill(); }
  function strokeRR(x, y, w, h, r, col, lw) {
    ctx.strokeStyle = col; ctx.lineWidth = lw || 2; rr(x, y, w, h, r); ctx.stroke();
  }
  var FONT = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif';
  function t(s, x, y, size, col, align, bold) {
    ctx.fillStyle = col || '#eef2f6';
    ctx.font = (bold ? '700 ' : '600 ') + size + 'px ' + FONT;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(s, x, y);
  }
  function clip(s, size, max, bold) {
    ctx.font = (bold ? '700 ' : '600 ') + size + 'px ' + FONT;
    if (ctx.measureText(s).width <= max) return s;
    var out = s;
    while (out.length > 2 && ctx.measureText(out + '.').width > max) out = out.slice(0, -1);
    return out + '.';
  }
  function reg(id, x, y, w, h, data, dis) {
    R.push({ id: id, x: x, y: y, w: w, h: h, data: data, dis: !!dis });
  }

  // ------------------------------------------------------------ card art
  function drawCardFace(x, y, w, h, id, opts) {
    opts = opts || {};
    var c = C[id];
    var el = c.t === 'h' ? -1 : c.e;
    var base = el < 0 ? '#6a5aa0' : D.EL_COL[el];
    var dim = el < 0 ? '#2d264d' : D.EL_DIM[el];
    fillRR(x, y, w, h, 7, dim);
    fillRR(x + 3, y + 3, w - 6, h * 0.34, 5, base);
    strokeRR(x, y, w, h, 7, opts.hl ? '#ffe89a' : 'rgba(255,255,255,.22)', opts.hl ? 3 : 1.5);
    // rarity pip
    ctx.fillStyle = D.RAR_COL[c.r];
    ctx.beginPath(); ctx.arc(x + w - 9, y + h - 9, 3.5, 0, 6.3); ctx.fill();
    // glyph blob (greybox creature art)
    var cx = x + w / 2, cy = y + h * 0.2;
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + h * 0.03, w * 0.19, h * 0.09, 0, 0, 6.3); ctx.fill();
    ctx.fillStyle = '#0d1116';
    if (c.t === 'h') {
      ctx.fillRect(cx - w * 0.11, cy - h * 0.07, w * 0.22, h * 0.14);
    } else {
      ctx.beginPath();
      if (c.s === 1) ctx.arc(cx, cy, w * 0.12, 0, 6.3);
      else if (c.s === 2) { ctx.moveTo(cx, cy - h * 0.09); ctx.lineTo(cx + w * 0.13, cy + h * 0.06); ctx.lineTo(cx - w * 0.13, cy + h * 0.06); }
      else { ctx.moveTo(cx, cy - h * 0.1); ctx.lineTo(cx + w * 0.14, cy); ctx.lineTo(cx, cy + h * 0.1); ctx.lineTo(cx - w * 0.14, cy); }
      ctx.closePath(); ctx.fill();
    }
    if (el >= 0) t(D.EL_GLYPH[el], x + 6, y + 9, 9, 'rgba(0,0,0,.65)');
    // stage pips
    if (c.t === 'c') for (var i = 0; i < c.s; i++) {
      ctx.fillStyle = 'rgba(0,0,0,.6)';
      ctx.fillRect(x + w - 8 - i * 5, y + 6, 3, 6);
    }
    // name
    t(clip(c.n, 8.5, w - 6, true), x + 3, y + h * 0.42, 8.5, '#f2f6fa', 'left', true);
    if (c.t === 'c') {
      t('HP ' + c.hp, x + 4, y + h * 0.55, 8, '#c9d4de');
      var ay = y + h * 0.68;
      for (var k = 0; k < c.a.length && k < 2; k++) {
        var a = c.a[k];
        t(clip(a.n, 7.5, w - 22), x + 4, ay, 7.5, '#aab6c2');
        t(String(a.d), x + w - 4, ay, 8, '#ffd98a', 'right', true);
        ay += 10;
      }
    } else {
      var words = wrap(c.text, 8, w - 8);
      var yy = y + h * 0.56;
      for (var q = 0; q < words.length && q < 4; q++) { t(words[q], x + 4, yy, 8, '#c4c9e0'); yy += 9.5; }
    }
  }

  function wrap(s, size, max) {
    ctx.font = '600 ' + size + 'px ' + FONT;
    var w = s.split(' '), lines = [], cur = '';
    for (var i = 0; i < w.length; i++) {
      var tst = cur ? cur + ' ' + w[i] : w[i];
      if (ctx.measureText(tst).width > max && cur) { lines.push(cur); cur = w[i]; }
      else cur = tst;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  function drawBack(x, y, w, h) {
    fillRR(x, y, w, h, 7, '#20283a');
    strokeRR(x, y, w, h, 7, 'rgba(255,255,255,.18)', 1.5);
    ctx.fillStyle = '#38456b';
    ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) * 0.22, 0, 6.3); ctx.fill();
    t('BB', x + w / 2, y + h / 2, 10, '#8fa0d0', 'center', true);
  }

  // creature-in-play slot
  function drawCr(x, y, w, h, cr, opts) {
    opts = opts || {};
    var c = C[cr.c];
    var base = D.EL_COL[c.e], dim = D.EL_DIM[c.e];
    fillRR(x, y, w, h, 6, dim);
    fillRR(x, y, w, 4, 2, base);
    strokeRR(x, y, w, h, 6, opts.hl ? '#ffe89a' : 'rgba(255,255,255,.18)', opts.hl ? 3 : 1.2);
    var big = h > 60;
    t(clip(c.n, big ? 12 : 9.5, w - 10, true), x + 6, y + (big ? 18 : 15), big ? 12 : 9.5, '#f4f8fc', 'left', true);
    // hp bar
    var hp = E.curHp(cr), mx = E.maxHp(cr), fr = Math.max(0, hp / mx);
    var by = y + (big ? 30 : 25), bh = big ? 8 : 6;
    fillRR(x + 6, by, w - 12, bh, 3, '#0b0e13');
    fillRR(x + 6, by, (w - 12) * fr, bh, 3, fr > 0.5 ? '#5fd67a' : fr > 0.25 ? '#e8c14a' : '#e0603c');
    t(hp + '/' + mx, x + w - 6, by + bh + (big ? 9 : 8), big ? 9 : 8, '#c6d1dc', 'right');
    // energy pips
    var ex = x + 6, ey = by + bh + (big ? 9 : 8);
    for (var i = 0; i < cr.e.length; i++) {
      ctx.fillStyle = D.EL_COL[cr.e[i]];
      ctx.beginPath(); ctx.arc(ex + i * 9 + 3, ey, 3.4, 0, 6.3); ctx.fill();
    }
    if (big) {
      var ay = y + h - 8 - (c.a.length - 1) * 11;
      for (var k = 0; k < c.a.length; k++) {
        t(clip(c.a[k].n, 9, w - 40), x + 6, ay, 9, '#a9b7c4');
        t(c.a[k].d + '', x + w - 6, ay, 9, '#ffd98a', 'right', true);
        ay += 11;
      }
    }
    var badge = '';
    if (cr.fzn || cr.fz) badge = 'BOUND';
    else if (cr.sh > 0) badge = 'GUARD ' + cr.sh;
    if (badge) {
      fillRR(x + w - 52, y + 6, 46, 13, 4, 'rgba(0,0,0,.6)');
      t(badge, x + w - 29, y + 12.5, 8, '#9fe4ff', 'center', true);
    }
    if (opts.dmgFlash) {
      ctx.fillStyle = 'rgba(255,90,60,' + opts.dmgFlash + ')';
      rr(x, y, w, h, 6); ctx.fill();
    }
  }

  function emptySlot(x, y, w, h, label, hl) {
    fillRR(x, y, w, h, 6, 'rgba(255,255,255,.045)');
    strokeRR(x, y, w, h, 6, hl ? '#ffe89a' : 'rgba(255,255,255,.16)', hl ? 3 : 1.2);
    t(label, x + w / 2, y + h / 2, 9, hl ? '#ffe89a' : '#6d7c8b', 'center');
  }

  function btn(id, x, y, w, h, label, sub, style, data, dis) {
    var on = style === 'on', warn = style === 'warn';
    fillRR(x, y, w, h, 8, dis ? 'rgba(255,255,255,.06)' : on ? '#2f6fae' : warn ? '#8c3b2e' : 'rgba(255,255,255,.13)');
    strokeRR(x, y, w, h, 8, dis ? 'rgba(255,255,255,.1)' : on ? '#8fd0ff' : 'rgba(255,255,255,.28)', on ? 2.5 : 1.4);
    var fy = sub ? y + h / 2 - 8 : y + h / 2;
    t(clip(label, 13, w - 12, true), x + w / 2, fy, 13, dis ? '#6a7684' : '#f2f7fc', 'center', true);
    if (sub) t(clip(sub, 10, w - 12), x + w / 2, y + h / 2 + 9, 10, dis ? '#5f6b78' : '#bcd0e2', 'center');
    // hit area is never smaller than 48x48 even when the art is compact
    var rx = x, ry = y, rw = w, rh = h;
    if (rh < 48) { ry -= (48 - rh) / 2; rh = 48; }
    if (rw < 48) { rx -= (48 - rw) / 2; rw = 48; }
    reg(id, rx, ry, rw, rh, data, dis);
  }

  function pips(x, y, n, m, el) {
    for (var i = 0; i < n; i++) {
      ctx.fillStyle = i < m ? (el >= 0 ? D.EL_COL[el] : '#ccc') : '#7b8794';
      ctx.beginPath(); ctx.arc(x + i * 10, y, 4, 0, 6.3); ctx.fill();
    }
  }

  // ------------------------------------------------------------ screens
  function header(A, title, sub) {
    fillRR(0, 0, W, 40, 0, '#141a24');
    t(title, 52, 20, 15, '#f2f7fc', 'left', true);
    if (sub) t(sub, W - 12, 20, 10, '#93a3b4', 'right');
    btn('back', 6, 4, 44, 32, '<', null, '', null);
  }

  function drawMap(A) {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#131a26'); g.addColorStop(1, '#0a0e15');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    t('BEASTBIND', W / 2, 30, 26, '#ffd98a', 'center', true);
    t('CARDS  ·  ladder of eight', W / 2, 50, 11, '#8fa2b5', 'center');

    var rank = A.save.rank;
    t(rank >= D.LADDER.length ? 'CHAMPION' : 'Rank ' + (rank + 1) + ' / 8', 14, 74, 12,
      rank >= D.LADDER.length ? '#ffd98a' : '#cfe0f0', 'left', true);
    t('Wins ' + A.save.wins + '   Set ' + collCount(A) + '/' + D.SET_SIZE + '   Credits ' + A.save.credits,
      W - 14, 74, 10, '#8fa2b5', 'right');
    var pw = A.save.wins % 2;
    t('Pack progress: ' + pw + '/2 wins' + (A.save.packs ? '   (' + A.save.packs + ' ready!)' : ''), 14, 90, 10, '#e0b34a');
    t('Ember > Bramble > Tide > Ember  (x2 damage)', W - 14, 90, 9.5, '#8fa2b5', 'right');

    var y = 104;
    for (var i = 0; i < D.LADDER.length; i++) {
      var L = D.LADDER[i];
      var locked = i > rank;
      var done = i < rank;
      var h = 56;
      fillRR(10, y, W - 20, h, 8, locked ? 'rgba(255,255,255,.04)' : done ? 'rgba(70,140,90,.16)' : 'rgba(60,110,175,.22)');
      strokeRR(10, y, W - 20, h, 8, locked ? 'rgba(255,255,255,.08)' : (i === rank ? '#8fd0ff' : 'rgba(255,255,255,.18)'), i === rank ? 2.5 : 1.2);
      t((i + 1) + '. ' + L.n, 20, y + 16, 13, locked ? '#5b6672' : '#f2f7fc', 'left', true);
      var tag = (L.el >= 0 ? D.EL[L.el].toUpperCase() + ' · ' : 'ALL · ') + L.arch.toUpperCase();
      t(tag, W - 20, y + 16, 10, locked ? '#5b6672' : (L.el >= 0 ? D.EL_COL[L.el] : '#ffd98a'), 'right', true);
      var lines = wrap(locked ? 'Locked - beat rank ' + i + ' first.' : 'TELL: ' + L.tell, 9.5, W - 44);
      t(lines[0], 20, y + 33, 9.5, locked ? '#4e5866' : '#a9bccd');
      if (lines[1]) t(lines[1], 20, y + 45, 9.5, locked ? '#4e5866' : '#a9bccd');
      if (done) t('CLEARED', W - 20, y + 42, 9, '#7ddc9a', 'right', true);
      reg('fight', 10, y, W - 20, h, i, locked);
      y += h + 6;
    }
    y += 2;
    var bw = (W - 32) / 3;
    btn('deck', 10, y, bw, 48, 'DECK', A.save.deck.length + '/20', A.save.deck.length === 20 ? '' : 'warn');
    btn('coll', 16 + bw, y, bw, 48, 'CARDS', collCount(A) + '/' + D.SET_SIZE);
    btn('openpack', 22 + bw * 2, y, bw, 48, 'PACK', A.save.packs ? A.save.packs + ' ready' : 'none', A.save.packs ? 'on' : '', null, !A.save.packs);
    t(A.hint || 'Tap a rank to battle. Every 2 wins earns a free pack.', W / 2, H - 14, 10, '#8fa2b5', 'center');
  }

  // ---------------------------------------------------------------- battle
  var LAY = {
    obench: { y: 46, h: 52 }, oact: { y: 104, w: 208, h: 74 },
    logy: 186, pact: { y: 212, w: 208, h: 74 }, pbench: { y: 292, h: 52 },
    atk: 350, row: 458, hand: 516
  };

  function drawBattle(A) {
    var G = A.G;
    ctx.fillStyle = '#0a0e15'; ctx.fillRect(0, 0, W, H);
    // arena backdrop
    ctx.fillStyle = 'rgba(255,255,255,.03)';
    ctx.fillRect(0, 96, W, 250);

    // top bar
    fillRR(0, 0, W, 40, 0, '#141a24');
    btn('quit', 6, 4, 44, 32, 'X', null, '', null);
    t(clip(G.foe.n, 12, 150, true), 56, 14, 12, '#f2f7fc', 'left', true);
    t(G.foe.arch + ' · ' + clip(G.foe.tell, 8, 210), 56, 29, 8, '#8fa2b5');
    // prize markers
    for (var i = 0; i < E.PRIZES; i++) {
      ctx.fillStyle = i < G.p.prizes ? '#ffd98a' : 'rgba(255,255,255,.15)';
      ctx.beginPath(); ctx.arc(W - 16 - i * 13, 12, 5, 0, 6.3); ctx.fill();
      ctx.fillStyle = i < G.o.prizes ? '#e0603c' : 'rgba(255,255,255,.15)';
      ctx.beginPath(); ctx.arc(W - 16 - i * 13, 28, 5, 0, 6.3); ctx.fill();
    }

    var mode = A.mode;
    // ---- opponent bench
    var bw = (W - 24 - 2 * 8) / 3;
    for (i = 0; i < BENCH; i++) {
      var x = 12 + i * (bw + 8);
      if (G.o.bench[i]) drawCr(x, LAY.obench.y, bw, LAY.obench.h, G.o.bench[i]);
      else emptySlot(x, LAY.obench.y, bw, LAY.obench.h, '');
    }
    // ---- opponent active
    var ox = (W - LAY.oact.w) / 2;
    if (G.o.active) drawCr(ox, LAY.oact.y, LAY.oact.w, LAY.oact.h, G.o.active, { hl: false });
    else emptySlot(ox, LAY.oact.y, LAY.oact.w, LAY.oact.h, 'no active');
    t('DECK ' + G.o.deck.length, W - 12, LAY.oact.y + 12, 9, '#7b8b9b', 'right');

    // ---- log
    var last = G.log.length ? G.log[G.log.length - 1] : '';
    fillRR(10, LAY.logy, W - 20, 22, 6, 'rgba(255,255,255,.06)');
    t(clip(last, 10, W - 34), W / 2, LAY.logy + 11, 10, '#c8d6e3', 'center');

    // ---- player active
    var px = (W - LAY.pact.w) / 2;
    var canTargetActive = (mode === 'energy') || (mode === 'sel' && A.sel !== null);
    if (G.p.active) drawCr(px, LAY.pact.y, LAY.pact.w, LAY.pact.h, G.p.active, { hl: canTargetActive });
    else emptySlot(px, LAY.pact.y, LAY.pact.w, LAY.pact.h, G.await === 'promote' ? 'promote from bench' : 'drag a creature here', canTargetActive || G.await === 'promote');
    reg('pact', px, LAY.pact.y, LAY.pact.w, LAY.pact.h, -1);
    t('DECK ' + G.p.deck.length, W - 12, LAY.pact.y + 12, 9, '#7b8b9b', 'right');
    t('HAND ' + G.p.hand.length, 12, LAY.pact.y + 12, 9, '#7b8b9b', 'left');

    // ---- player bench
    for (i = 0; i < BENCH; i++) {
      var bx = 12 + i * (bw + 8);
      var hl = (mode === 'energy' || mode === 'retreat' || (mode === 'sel' && A.sel !== null) || G.await === 'promote');
      if (G.p.bench[i]) drawCr(bx, LAY.pbench.y, bw, LAY.pbench.h, G.p.bench[i], { hl: hl });
      else emptySlot(bx, LAY.pbench.y, bw, LAY.pbench.h, 'bench', mode === 'sel' && A.sel !== null);
      reg('pslot', bx, LAY.pbench.y, bw, LAY.pbench.h, i);
    }

    // ---- attack buttons
    var yourTurn = G.who === 'p' && !G.over && G.started && !G.await;
    var A0 = G.p.active;
    for (i = 0; i < 2; i++) {
      var y = LAY.atk + i * 52;
      var atk = A0 ? C[A0.c].a[i] : null;
      if (!atk) {
        fillRR(12, y, W - 24, 48, 8, 'rgba(255,255,255,.04)');
        if (i === 0 && !A0) t(G.await === 'promote' ? 'Tap a benched creature to promote it' : 'Place a creature in your Active slot',
          W / 2, y + 24, 10, '#6d7c8b', 'center');
        continue;
      }
      var ok = yourTurn && E.canAttack(G, G.p, i);
      var dmg = (A0 && G.o.active) ? E.damageOf(G, G.p, G.o, atk) : atk.d;
      fillRR(12, y, W - 24, 48, 8, ok ? 'rgba(224,96,60,.32)' : 'rgba(255,255,255,.06)');
      strokeRR(12, y, W - 24, 48, 8, ok ? '#ff9f7a' : 'rgba(255,255,255,.12)', ok ? 2.4 : 1.2);
      t(clip(atk.n, 13, 200, true), 22, y + 17, 13, ok ? '#fff1e6' : '#75818e', 'left', true);
      pips(26, y + 35, atk.c, atk.m, C[A0.c].e);
      var mult = (G.o.active && D.WEAK_TO[C[G.o.active.c].e] === C[A0.c].e);
      t(String(dmg), W - 24, y + 20, 20, ok ? '#ffd98a' : '#65707d', 'right', true);
      t(mult ? 'WEAKNESS x2' : (atk.x ? atk.x.replace(':', ' ') : ''), W - 24, y + 37, 9, mult ? '#ff9f7a' : '#8b97a4', 'right', true);
      reg('atk', 12, y, W - 24, 48, i, !ok);
    }

    // ---- action row
    var rw = (W - 30) / 3;
    btn('energy', 12, LAY.row, rw, 48, 'ENERGY', G.p.energyLeft + ' left',
      A.mode === 'energy' ? 'on' : '', null, !yourTurn || G.p.energyLeft <= 0);
    btn('retreat', 18 + rw, LAY.row, rw, 48, 'RETREAT',
      A0 ? 'cost ' + E.retreatCost(A0) : '-', A.mode === 'retreat' ? 'on' : '', null,
      !yourTurn || !A0 || E.countCr(G.p) < 2 || A0.e.length < E.retreatCost(A0));
    btn('end', 24 + rw * 2, LAY.row, rw, 48, 'END TURN', yourTurn ? 'pass' : 'waiting', '', null, !yourTurn);

    // ---- hand
    drawHand(A, G);

    // hint
    t(clip(G.hint || (yourTurn ? '' : G.foe.n + ' is thinking...'), 10, W - 20), W / 2, H - 12, 10, '#8fa2b5', 'center');

    // ---- overlays
    if (G.over) drawResult(A, G);
  }

  function drawHand(A, G) {
    var hand = G.p.hand, n = hand.length;
    var rows = n > 5 ? 2 : 1;
    var cw = rows === 1 ? 72 : 66, ch = rows === 1 ? 104 : 78;
    var hy = rows === 1 ? LAY.hand + 8 : LAY.hand - 6;
    var perRow = Math.ceil(n / rows);
    var panelTop = hy - 8, panelH = rows * (ch + 6) + 10;
    fillRR(6, panelTop, W - 12, panelH, 8, 'rgba(255,255,255,.05)');
    if (!n) { t('hand empty', W / 2, LAY.hand + 40, 10, '#6d7c8b', 'center'); return; }
    var span = Math.min(cw + 6, (W - 22 - cw) / Math.max(1, perRow - 1));
    for (var i = 0; i < n; i++) {
      var r = Math.floor(i / perRow), col = i % perRow;
      var cnt = Math.min(perRow, n - r * perRow);
      var total = cw + span * (cnt - 1);
      var x = (W - total) / 2 + col * span;
      var selected = (A.sel === i);
      var y = hy + r * (ch + 6) + (selected ? -10 : 0);
      if (A.drag && A.drag.idx === i) continue;
      drawCardFace(x, y, cw, ch, hand[i], { hl: selected });
      reg('hand', x, y, col === cnt - 1 ? cw : Math.min(span, cw), ch, i);
    }
    if (A.drag) {
      var dx = A.drag.x - cw / 2, dy = A.drag.y - ch / 2;
      ctx.save(); ctx.globalAlpha = 0.92;
      drawCardFace(dx, dy, 72, 104, hand[A.drag.idx], { hl: true });
      ctx.restore();
    }
  }

  function drawResult(A, G) {
    ctx.fillStyle = 'rgba(4,7,12,.88)'; ctx.fillRect(0, 0, W, H);
    var win = G.over === 1;
    fillRR(26, 218, W - 52, 158, 12, 'rgba(20,26,36,.96)');
    strokeRR(26, 218, W - 52, 158, 12, win ? 'rgba(255,217,138,.5)' : 'rgba(224,96,60,.5)', 2);
    t(win ? 'VICTORY' : 'DEFEATED', W / 2, 250, 34, win ? '#ffd98a' : '#e0603c', 'center', true);
    t(win ? 'Rank ' + (G.rung + 1) + ' cleared' : G.foe.n + ' held the line', W / 2, 284, 12, '#c8d6e3', 'center');
    if (win && G.rung === D.LADDER.length - 1) t('You are the Beastbind Champion.', W / 2, 306, 12, '#7ddc9a', 'center', true);
    var lines = [];
    if (win) {
      lines.push('Wins: ' + A.save.wins);
      lines.push(A.save.wins % 2 === 0 ? 'Pack earned!' : 'Next pack in 1 win');
    }
    for (var i = 0; i < lines.length; i++) t(lines[i], W / 2, 336 + i * 18, 11, '#a9bccd', 'center');
    btn('again', 40, 400, W - 80, 54, win ? 'CONTINUE' : 'REMATCH', null, 'on');
    btn('tomap', 40, 464, W - 80, 48, 'LADDER');
  }

  // ---------------------------------------------------------------- pack
  function drawPack(A) {
    ctx.fillStyle = '#0a0e15'; ctx.fillRect(0, 0, W, H);
    header(A, 'PACK OPENING', A.save.packs + ' packs left');
    var p = A.pack;
    var cw = 104, ch = 148;
    var xs = [(W - cw * 2 - 12) / 2, (W - cw * 2 - 12) / 2 + cw + 12];
    var revealedAll = p.rev >= 5;
    for (var i = 0; i < 5; i++) {
      var col = i % 2, row = Math.floor(i / 2);
      var x = i === 4 ? (W - cw) / 2 : xs[col];
      var y = 60 + row * (ch + 10);
      if (i < p.rev) {
        drawCardFace(x, y, cw, ch, p.cards[i], {});
        var tagd = p.dupe[i];
        fillRR(x, y + ch - 18, cw, 18, 5, tagd ? 'rgba(224,179,74,.85)' : 'rgba(93,214,122,.85)');
        t(tagd ? '3rd copy -> +1 credit' : (p.isNew[i] ? 'NEW CARD' : 'copy 2/2'), x + cw / 2, y + ch - 9, 8.5, '#10151c', 'center', true);
      } else {
        drawBack(x, y, cw, ch);
      }
      reg('reveal', x, y, cw, ch, i);
    }
    var by = 60 + 2 * (ch + 10) + ch + 10;
    t('PULL RATES (posted)', W / 2, by + 10, 10, '#ffd98a', 'center', true);
    var ry = by + 26;
    for (i = 0; i < D.PACK_RATES.slots.length; i++) {
      var s = D.PACK_RATES.slots[i];
      var str = s.rows.map(function (r) { return r[0] + ' ' + r[1] + '%'; }).join('   ');
      t(s.label, 40, ry, 9.5, '#93a3b4');
      t(str, W - 40, ry, 9.5, '#c8d6e3', 'right');
      ry += 13;
    }
    t('Max 2 copies kept. 3rd copy = +1 credit; ' + D.CLAIM_COST + ' credits claim ANY card.', W / 2, ry + 4, 9, '#7ddc9a', 'center');
    btn(revealedAll ? 'packdone' : 'revealall', 40, H - 62, W - 80, 50,
      revealedAll ? (A.save.packs ? 'OPEN NEXT' : 'DONE') : 'REVEAL ALL', null, 'on');
  }

  // ---------------------------------------------------------------- collection
  function drawColl(A) {
    ctx.fillStyle = '#0a0e15'; ctx.fillRect(0, 0, W, H);
    var cols = 4, cw = 88, chh = 122, gap = 6;
    var gx = (W - (cols * cw + (cols - 1) * gap)) / 2;
    var rows = Math.ceil(D.SET_SIZE / cols);
    scrollMax = Math.max(0, 48 + rows * (chh + gap) + 40 - H);
    var off = A.scroll;
    ctx.save(); ctx.beginPath(); ctx.rect(0, 44, W, H - 44); ctx.clip();
    for (var i = 0; i < D.SET_SIZE; i++) {
      var r = Math.floor(i / cols), c2 = i % cols;
      var x = gx + c2 * (cw + gap), y = 52 + r * (chh + gap) - off;
      if (y > H || y + chh < 40) continue;
      var owned = A.save.col[i] || 0;
      if (owned > 0) {
        drawCardFace(x, y, cw, chh, i, {});
        fillRR(x + 3, y + chh - 16, 22, 13, 4, 'rgba(0,0,0,.75)');
        t('x' + owned, x + 14, y + chh - 9, 8.5, '#ffd98a', 'center', true);
      } else {
        fillRR(x, y, cw, chh, 7, 'rgba(255,255,255,.05)');
        var afford = A.save.credits >= D.CLAIM_COST;
        strokeRR(x, y, cw, chh, 7, afford ? 'rgba(224,179,74,.6)' : 'rgba(255,255,255,.12)', 1.4);
        t('#' + (i + 1), x + cw / 2, y + chh / 2 - 14, 11, '#5c6773', 'center', true);
        t(clip(C[i].n, 8.5, cw - 8), x + cw / 2, y + chh / 2 + 2, 8.5, '#4e5866', 'center');
        t(D.RAR[C[i].r], x + cw / 2, y + chh / 2 + 16, 8, D.RAR_COL[C[i].r], 'center');
        t(afford ? 'claim · ' + D.CLAIM_COST + ' cr' : D.CLAIM_COST + ' credits', x + cw / 2, y + chh - 12, 8,
          afford ? '#ffd98a' : '#5c6773', 'center', true);
        reg('claim', x, y, cw, chh, i, !afford);
      }
    }
    ctx.restore();
    fillRR(0, H - 22, W, 22, 0, 'rgba(10,14,21,.92)');
    header(A, 'COLLECTION', collCount(A) + '/' + D.SET_SIZE + '  ·  ' + A.save.credits + ' credits');
    t(A.hint || ('Scroll to browse. ' + D.CLAIM_COST + ' credits claims any missing card.'), W / 2, H - 10, 9.5, '#8fa2b5', 'center');
  }

  function collCount(A) {
    var n = 0;
    for (var k in A.save.col) if (A.save.col[k] > 0) n++;
    return n;
  }

  // ---------------------------------------------------------------- deck
  function drawDeck(A) {
    ctx.fillStyle = '#0a0e15'; ctx.fillRect(0, 0, W, H);
    var ids = [];
    for (var k = 0; k < D.SET_SIZE; k++) if ((A.save.col[k] || 0) > 0) ids.push(k);
    var rowh = 52;
    scrollMax = Math.max(0, 54 + ids.length * (rowh + 4) + 80 - H);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 44, W, H - 44 - 68); ctx.clip();
    var counts = deckCounts(A);
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i], y = 54 + i * (rowh + 4) - A.scroll;
      if (y > H - 68 || y + rowh < 40) continue;
      var c = C[id], inDeck = counts[id] || 0;
      fillRR(10, y, W - 20, rowh, 7, inDeck ? 'rgba(60,110,175,.22)' : 'rgba(255,255,255,.05)');
      strokeRR(10, y, W - 20, rowh, 7, inDeck ? '#5f9fd8' : 'rgba(255,255,255,.1)', 1.2);
      ctx.fillStyle = c.t === 'h' ? '#6a5aa0' : D.EL_COL[c.e];
      fillRR(14, y + 6, 5, rowh - 12, 2, ctx.fillStyle);
      t(clip(c.n, 12, 170, true), 26, y + 17, 12, '#eef4fa', 'left', true);
      var meta = c.t === 'h' ? 'Handler · ' + D.RAR[c.r] : ('Stage ' + c.s + ' · ' + D.EL[c.e] + ' · HP ' + c.hp);
      t(meta, 26, y + 34, 9, '#93a3b4');
      t('own ' + A.save.col[id], 232, y + 26, 9.5, '#8fa2b5', 'right');
      btn('dminus', 238, y + 4, 44, 44, '-', null, '', id, inDeck <= 0);
      t(String(inDeck), 294, y + 26, 14, inDeck ? '#ffd98a' : '#5c6773', 'center', true);
      btn('dplus', 314, y + 4, 44, 44, '+', null, '', id, inDeck >= Math.min(2, A.save.col[id]) || A.save.deck.length >= 20);
      reg('deckrow', 10, y, W - 20, rowh, id, true);
    }
    ctx.restore();
    header(A, 'DECK', 'max 2 copies per card');
    fillRR(0, H - 68, W, 68, 0, '#141a24');
    var full = A.save.deck.length === 20;
    t(A.save.deck.length + ' / 20', 16, H - 46, 16, full ? '#7ddc9a' : '#e0b34a', 'left', true);
    t(basicCount(A) + ' Stage 1 · ' + (A.save.deck.length - basicCount(A)) + ' other', 16, H - 26, 9.5, '#93a3b4');
    btn('autodeck', 150, H - 58, 108, 48, 'AUTO', 'best owned', '', null);
    btn('deckdone', 266, H - 58, 112, 48, 'SAVE', full ? 'ready' : 'need 20', full ? 'on' : 'warn', null, !full);
  }

  function deckCounts(A) {
    var m = {};
    for (var i = 0; i < A.save.deck.length; i++) m[A.save.deck[i]] = (m[A.save.deck[i]] || 0) + 1;
    return m;
  }
  function basicCount(A) {
    var n = 0;
    for (var i = 0; i < A.save.deck.length; i++) { var c = C[A.save.deck[i]]; if (c.t === 'c' && c.s === 1) n++; }
    return n;
  }

  // ---------------------------------------------------------------- particles
  function drawParticles(A) {
    for (var i = 0; i < A.parts.length; i++) {
      var p = A.parts[i];
      ctx.globalAlpha = Math.max(0, p.l / p.L);
      ctx.fillStyle = p.c;
      ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
    }
    ctx.globalAlpha = 1;
  }

  function draw(A) {
    R.length = 0;
    ctx = A.ctx;
    ctx.save();
    if (A.shake > 0) {
      ctx.translate((Math.random() - 0.5) * A.shake, (Math.random() - 0.5) * A.shake);
    }
    switch (A.screen) {
      case 'battle': drawBattle(A); break;
      case 'pack': drawPack(A); break;
      case 'coll': drawColl(A); break;
      case 'deck': drawDeck(A); break;
      default: drawMap(A); scrollMax = 0; break;
    }
    drawParticles(A);
    ctx.restore();
    if (A.flash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + Math.min(0.5, A.flash) + ')';
      ctx.fillRect(0, 0, W, H);
    }
    // keyboard focus ring
    if (A.kb && A.focus >= 0 && A.focus < R.length) {
      var f = R[A.focus];
      ctx.strokeStyle = '#ffe89a'; ctx.lineWidth = 3;
      rr(f.x - 2, f.y - 2, f.w + 4, f.h + 4, 9); ctx.stroke();
    }
    return R;
  }

  root.BB_UI = { W: W, H: H, draw: draw, regions: function () { return R; }, scrollMax: function () { return scrollMax; }, collCount: collCount, LAY: LAY };
})(window);
