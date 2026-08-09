/* Molehunt Manor - canvas UI. Logical space 390x700, portrait. */
(function () {
  'use strict';
  var MH = (window.MH = window.MH || {});
  var W = 390, H = 700;
  MH.VW = W; MH.VH = H;

  var C = {
    bg: '#101219', panel: '#1a1e2b', panel2: '#232838', line: '#333a52',
    ink: '#e9edf7', dim: '#8b93ad', brass: '#f0c064', red: '#ff5f6d',
    green: '#4fe08c', blue: '#63b4ff', purple: '#b98cff'
  };
  MH.C = C;

  function F(w, s) {
    return w + ' ' + s + 'px ui-sans-serif,-apple-system,system-ui,Segoe UI,Helvetica,Arial,sans-serif';
  }
  MH.F = F;

  var ctx = null;
  MH.setCtx = function (c) { ctx = c; };
  MH.hits = [];

  function hit(x, y, w, h, a) {
    if (MH.lockHits) return -1;
    MH.hits.push({ x: x, y: y, w: w, h: h, a: a });
    return MH.hits.length - 1;
  }
  MH.hit = hit;

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
  MH.rr = rr;

  function fitText(t, max, font) {
    ctx.font = font;
    if (ctx.measureText(t).width <= max) return t;
    var s = t;
    while (s.length > 1 && ctx.measureText(s + '…').width > max) s = s.slice(0, -1);
    return s + '…';
  }
  MH.fitText = fitText;

  function wrap(t, max, font) {
    ctx.font = font;
    var words = String(t).split(' '), lines = [], cur = '';
    for (var i = 0; i < words.length; i++) {
      var probe = cur ? cur + ' ' + words[i] : words[i];
      if (ctx.measureText(probe).width > max && cur) { lines.push(cur); cur = words[i]; }
      else cur = probe;
    }
    if (cur) lines.push(cur);
    return lines;
  }
  MH.wrap = wrap;

  function txt(t, x, y, font, col, align) {
    ctx.font = font; ctx.fillStyle = col; ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(t, x, y);
    ctx.textAlign = 'left';
  }
  MH.txt = txt;

  function button(x, y, w, h, label, action, opt) {
    opt = opt || {};
    var idx = opt.dead ? -1 : hit(x, y, w, h, action);
    var focused = (idx >= 0 && idx === MH.G.focus);
    var bg = opt.bg || C.panel2;
    if (opt.dead) bg = '#181b26';
    rr(x, y, w, h, opt.r == null ? 10 : opt.r);
    ctx.fillStyle = bg; ctx.fill();
    ctx.lineWidth = focused ? 3 : 1.5;
    ctx.strokeStyle = focused ? C.brass : (opt.border || C.line);
    ctx.stroke();
    var col = opt.dead ? '#5a6076' : (opt.col || C.ink);
    txt(fitText(label, w - 18, F(700, opt.fs || 15)), x + w / 2, y + h / 2 + (opt.fs || 15) * 0.36,
      F(700, opt.fs || 15), col, 'center');
    return idx;
  }
  MH.button = button;

  function staffColor(id) { return 'hsl(' + ((id * 37 + 20) % 360) + ',62%,62%)'; }
  MH.staffColor = staffColor;

  function chip(x, y, s, id, col) {
    rr(x, y, s, s, 5);
    ctx.fillStyle = col || staffColor(id); ctx.fill();
    txt(MH.STAFF[id][0], x + s / 2, y + s / 2 + s * 0.34, F(800, s * 0.62), '#15161d', 'center');
  }
  MH.chip = chip;

  function statusInfo(c, id) {
    var s = c.status[id];
    if (s === MH.CAUGHT) return { t: 'DETAINED', c: C.purple };
    if (s === MH.EXPOSED) return { t: 'EXPOSED', c: C.red };
    if (s === MH.CLEARED) return { t: 'CLEARED', c: C.green };
    if (c.conf[id] > 0) return { t: 'CONFLICTS ' + c.conf[id], c: C.brass };
    return { t: 'UNVERIFIED', c: C.dim };
  }
  MH.statusInfo = statusInfo;

  /* ---------------- header ---------------- */

  function header(G) {
    var c = G.c, W0 = MH.world(c);
    ctx.fillStyle = C.panel; ctx.fillRect(0, 0, W, 92);
    ctx.fillStyle = C.line; ctx.fillRect(0, 92, W, 1.5);
    txt('MOLEHUNT MANOR', 12, 24, F(800, 15), C.brass);
    txt('ROUND ' + (c.round + 1) + '/' + MH.ROUNDS, W - 12, 24, F(800, 14), C.ink, 'right');

    // sabotage progress bar
    var bx = 12, by = 32, bw = W - 24, bh = 7;
    rr(bx, by, bw, bh, 3.5); ctx.fillStyle = '#0d0f16'; ctx.fill();
    var p = c.round / MH.ROUNDS;
    if (p > 0) {
      rr(bx, by, Math.max(4, bw * p), bh, 3.5);
      ctx.fillStyle = p > 0.66 ? C.red : C.brass; ctx.fill();
    }

    // alert
    var alertTxt = '⚠ ' + MH.alertText(W0);
    var alertCol = W0.alert ? C.red : C.brass;
    rr(10, 46, W - 20, 22, 6);
    ctx.fillStyle = 'rgba(255,95,109,' + (W0.alert ? (0.16 + 0.07 * Math.sin(G.t * 5)) : 0.08) + ')';
    ctx.fill();
    txt(fitText(alertTxt, W - 34, F(800, 12)), W / 2, 61, F(800, 12), alertCol, 'center');

    // action pips
    pips('OBSERVE', 12, 78, c.obsLeft, MH.OBS_PER_ROUND, C.blue);
    pips('QUESTION', 205, 78, c.qLeft, MH.Q_PER_ROUND, C.green);
  }

  MH.header = header;

  function pips(label, x, y, left, max, col) {
    txt(label, x, y + 4, F(700, 11), C.dim);
    var w = ctx.measureText(label).width, i;
    for (i = 0; i < max; i++) {
      ctx.beginPath();
      ctx.arc(x + w + 12 + i * 15, y, 5.5, 0, 6.284);
      ctx.fillStyle = i < left ? col : '#2b3046'; ctx.fill();
    }
  }

  /* ---------------- floor ---------------- */

  var GX = 6, GY = 100, TW = 89, TH = 78, GAPX = 7, GAPY = 7;
  MH.roomRect = function (i) {
    return { x: GX + (i % 4) * (TW + GAPX), y: GY + ((i / 4) | 0) * (TH + GAPY), w: TW, h: TH };
  };

  function floorTab(G) {
    var c = G.c, W0 = MH.world(c), i;
    for (i = 0; i < MH.NR; i++) drawRoom(G, c, W0, i);
    for (i = 0; i < 4; i++) {
      var R0 = MH.roomRect(i * 4);
      var on = MH.inAlert(W0, i * 4);
      rr(1, R0.y + 6, 4, TH - 12, 2);
      ctx.fillStyle = on ? 'rgba(255,95,109,' + (0.5 + 0.4 * Math.sin(G.t * 5)) + ')' : '#2a3048';
      ctx.fill();
    }

    // observation readout
    var px = 10, py = 442, pw = W - 20, ph = 108;
    rr(px, py, pw, ph, 10); ctx.fillStyle = C.panel; ctx.fill();
    ctx.strokeStyle = C.line; ctx.lineWidth = 1.5; ctx.stroke();
    var o = c.lastObs;
    if (!o) {
      txt('OBSERVATION LOG', px + 12, py + 22, F(800, 12), C.dim);
      var hint = W0.alert
        ? 'The saboteur is in a flagged wing right now — and the log posts them somewhere else.'
        : 'The alarm board is out this round. Take statements and cross-check the log.';
      var ls = wrap(hint, pw - 24, F(500, 13)), k;
      for (k = 0; k < Math.min(3, ls.length); k++) txt(ls[k], px + 12, py + 46 + k * 18, F(500, 13), C.dim);
    } else {
      txt('YOU WATCHED: ' + MH.ROOMS[o.room].n.toUpperCase(), px + 12, py + 21, F(800, 12),
        o.hit ? C.red : C.blue);
      if (!o.rows.length) {
        txt('Empty. Nobody there at all.', px + 12, py + 44, F(500, 13), C.dim);
      }
      for (i = 0; i < Math.min(3, o.rows.length); i++) {
        var r = o.rows[i], yy = py + 34 + i * 25;
        chip(px + 12, yy, 18, r.id);
        txt(fitText(MH.STAFF[r.id] + ' — ' + r.t, pw - 46, F(600, 12)), px + 36, yy + 13,
          F(600, 12), r.kind === 2 ? C.red : C.green);
      }
      if (o.rows.length > 3) txt('+' + (o.rows.length - 3) + ' more', px + 12, py + ph - 8, F(600, 11), C.dim);
    }
  }
  MH.floorTab = floorTab;

  function drawRoom(G, c, W0, i) {
    var R = MH.roomRect(i);
    var seen = !!c.obsRooms[c.round + ':' + i];
    var alertWing = MH.inAlert(W0, i);
    var canObs = c.obsLeft > 0 && !seen && !c.over;
    var idx = hit(R.x, R.y, R.w, R.h, { t: 'obs', v: i });
    var focused = idx === MH.G.focus;

    rr(R.x, R.y, R.w, R.h, 8);
    ctx.fillStyle = seen ? '#20263a' : C.panel; ctx.fill();
    ctx.lineWidth = focused ? 3 : (alertWing ? 2.5 : 1.2);
    ctx.strokeStyle = focused ? C.brass
      : (alertWing ? 'rgba(255,95,109,' + (0.5 + 0.35 * Math.sin(G.t * 5 + i)) + ')' : C.line);
    ctx.stroke();

    txt(fitText(MH.ROOMS[i].n, R.w - 8, F(800, 10)), R.x + 5, R.y + 14, F(800, 10),
      alertWing ? C.red : C.ink);

    var claimed = MH.claimedIn(W0, i), k;
    if (!seen) {
      for (k = 0; k < Math.min(2, claimed.length); k++) {
        var ph = G.t * 2 + claimed[k] * 1.7 + i;
        var fx = R.x + 24 + k * 40 + Math.sin(ph) * 3;
        var fy = R.y + 44 + Math.cos(ph * 1.3) * 3;
        ctx.beginPath(); ctx.arc(fx, fy - 8, 5, 0, 6.284);
        ctx.fillStyle = '#5c6480'; ctx.fill();
        rr(fx - 5, fy - 2, 10, 12, 3); ctx.fillStyle = '#4b5370'; ctx.fill();
      }
      txt(claimed.length + ' posted', R.x + 5, R.y + R.h - 7, F(600, 9), C.dim);
      if (canObs) txt('WATCH', R.x + R.w - 5, R.y + R.h - 7, F(800, 9), C.blue, 'right');
    } else {
      var act = MH.actualIn(W0, i);
      for (k = 0; k < Math.min(2, act.length); k++) {
        var id = act[k];
        var cx2 = R.x + 12 + k * 38, cy2 = R.y + 24;
        chip(cx2, cy2, 24, id);
        var vd = c.verdict[c.round][id];
        ctx.beginPath(); ctx.arc(cx2 + 24, cy2 + 3, 4.5, 0, 6.284);
        ctx.fillStyle = vd === 2 ? C.red : C.green; ctx.fill();
      }
      if (!act.length) txt('empty', R.x + 5, R.y + 40, F(600, 10), C.dim);
      var ghosts = 0;
      for (k = 0; k < claimed.length; k++) if (W0.place[claimed[k]] !== i) ghosts++;
      txt(ghosts ? ghosts + ' NO-SHOW' : 'WATCHED', R.x + 5, R.y + R.h - 7, F(800, 9),
        ghosts ? C.red : C.blue);
    }
  }

  /* ---------------- staff ---------------- */

  function staffTab(G) {
    var c = G.c, i;
    for (i = 0; i < 10; i++) {
      var x = 8 + (i % 2) * 190, y = 100 + ((i / 2) | 0) * 84, w = 182, h = 78;
      var idx = hit(x, y, w, h, { t: 'staff', v: i });
      var focused = idx === MH.G.focus;
      var si = statusInfo(c, i);
      rr(x, y, w, h, 10);
      ctx.fillStyle = c.status[i] === MH.CAUGHT ? '#221b33' : C.panel; ctx.fill();
      ctx.lineWidth = focused ? 3 : 1.5;
      ctx.strokeStyle = focused ? C.brass : (c.status[i] === MH.EXPOSED ? C.red : C.line);
      ctx.stroke();
      chip(x + 8, y + 8, 26, i);
      txt(fitText(MH.STAFF[i], w - 46, F(700, 13)), x + 40, y + 26, F(700, 13),
        c.status[i] === MH.CAUGHT ? C.dim : C.ink);
      txt(si.t, x + 40, y + 42, F(800, 10), si.c);
      var W0 = MH.world(c);
      var loc = W0.claim[i] >= 0 ? 'logged: ' + MH.ROOMS[W0.claim[i]].n : 'detained';
      txt(fitText(loc, w - 20, F(500, 11)), x + 9, y + 60, F(500, 11), C.dim);
      var asked = false, k;
      for (k = 0; k < c.stmts.length; k++) if (c.stmts[k].r === c.round && c.stmts[k].sp === i) asked = true;
      txt(asked ? 'ASKED' : (c.qLeft > 0 && W0.place[i] >= 0 && !c.over ? 'TAP TO ASK' : ''),
        x + w - 9, y + 60, F(800, 10), asked ? C.dim : C.green, 'right');
    }
  }
  MH.staffTab = staffTab;

  /* ---------------- log ---------------- */

  function logTab(G) {
    var c = G.c, i;
    var lr = Math.max(0, Math.min(G.logRound, c.round));
    G.logRound = lr;
    var W0 = c.rounds[lr] || MH.world(c);
    button(10, 100, 60, 48, '◀', { t: 'logr', v: -1 }, { dead: lr <= 0, fs: 16 });
    txt('TASK LOG — ROUND ' + (lr + 1), W / 2, 128, F(800, 14), C.ink, 'center');
    button(W - 70, 100, 60, 48, '▶', { t: 'logr', v: 1 }, { dead: lr >= c.round, fs: 16 });

    for (i = 0; i < 10; i++) {
      var y = 154 + i * 39;
      var vd = (c.verdict[lr] && c.verdict[lr][i]) || 0;
      rr(8, y, W - 16, 36, 8);
      ctx.fillStyle = vd === 2 ? 'rgba(255,95,109,0.12)' : (vd === 1 ? 'rgba(79,224,140,0.10)' : C.panel);
      ctx.fill();
      ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke();
      chip(14, y + 8, 20, i);
      var nm = MH.STAFF[i];
      var room = W0.claim[i] >= 0 ? MH.ROOMS[W0.claim[i]].n : 'detained';
      txt(fitText(nm, 96, F(700, 12)), 40, y + 16, F(700, 12), C.ink);
      txt(fitText('→ ' + room, 110, F(600, 12)), 140, y + 16, F(600, 12), C.blue);
      txt(fitText(W0.task[i] || 'not on duty', 210, F(500, 11)), 40, y + 30, F(500, 11), C.dim);
      var tag = vd === 2 ? 'LIE' : (vd === 1 ? 'VERIFIED' : '');
      if (tag) txt(tag, W - 18, y + 23, F(800, 11), vd === 2 ? C.red : C.green, 'right');
      else if (c.conf[i] > 0) txt('⚑' + c.conf[i], W - 18, y + 23, F(800, 11), C.brass, 'right');
    }
  }
  MH.logTab = logTab;

  /* ---------------- accuse ---------------- */

  function accuseTab(G) {
    var c = G.c, i;
    txt('NAME A MOLE. TWO ARE HIDING.', W / 2, 118, F(800, 13), C.ink, 'center');
    for (i = 0; i < 10; i++) {
      var x = 8 + (i % 2) * 190, y = 130 + ((i / 2) | 0) * 66, w = 182, h = 60;
      var dead = c.status[i] === MH.CAUGHT || c.status[i] === MH.CLEARED || c.over;
      var idx = dead ? -1 : hit(x, y, w, h, { t: 'sel', v: i });
      var focused = idx >= 0 && idx === MH.G.focus;
      var sel = G.sel === i;
      rr(x, y, w, h, 10);
      ctx.fillStyle = sel ? 'rgba(255,95,109,0.20)' : (dead ? '#171a24' : C.panel); ctx.fill();
      ctx.lineWidth = focused || sel ? 3 : 1.5;
      ctx.strokeStyle = focused ? C.brass : (sel ? C.red : C.line); ctx.stroke();
      chip(x + 8, y + 8, 24, i, dead ? '#4a5064' : null);
      txt(fitText(MH.STAFF[i], w - 44, F(700, 13)), x + 38, y + 25, F(700, 13), dead ? C.dim : C.ink);
      var si = statusInfo(c, i);
      txt(si.t, x + 38, y + 43, F(800, 10), si.c);
    }
    var lbl = G.sel < 0 ? 'SELECT A SUSPECT' : 'ACCUSE ' + MH.STAFF[G.sel].toUpperCase();
    button(10, 470, W - 20, 56, lbl, { t: 'accuse' },
      { dead: G.sel < 0 || c.over, bg: 'rgba(255,95,109,0.22)', border: C.red, col: C.red, fs: 16 });
    txt('A wrong name burns the rest of the round.', W / 2, 542, F(500, 11), C.dim, 'center');
  }
  MH.accuseTab = accuseTab;

  /* ---------------- bottom bar ---------------- */

  var TABS = ['FLOOR', 'STAFF', 'LOG', 'ACCUSE'];
  function bottom(G) {
    var c = G.c, i;
    if (G.tab !== 3) {
      var left = c.obsLeft + c.qLeft;
      button(10, 556, W - 20, 48, left > 0 ? 'END ROUND — ' + left + ' ACTION' + (left > 1 ? 'S' : '') + ' LEFT'
        : 'END ROUND', { t: 'end' }, { bg: left > 0 ? C.panel2 : 'rgba(240,192,100,0.18)', border: left > 0 ? C.line : C.brass, col: left > 0 ? C.ink : C.brass });
    }
    txt(fitText(G.hint, W - 24, F(600, 12)), W / 2, 624, F(600, 12), C.brass, 'center');
    ctx.fillStyle = C.panel; ctx.fillRect(0, 634, W, H - 634);
    ctx.fillStyle = C.line; ctx.fillRect(0, 634, W, 1.5);
    for (i = 0; i < 4; i++) {
      var x = i * (W / 4), w = W / 4;
      var idx = hit(x, 636, w, 64, { t: 'tab', v: i });
      var focused = idx === MH.G.focus;
      if (G.tab === i) {
        rr(x + 6, 642, w - 12, 52, 10); ctx.fillStyle = C.panel2; ctx.fill();
        ctx.strokeStyle = C.brass; ctx.lineWidth = 2; ctx.stroke();
      } else if (focused) {
        rr(x + 6, 642, w - 12, 52, 10); ctx.strokeStyle = C.brass; ctx.lineWidth = 2; ctx.stroke();
      }
      txt(TABS[i], x + w / 2, 673, F(800, 12), G.tab === i ? C.brass : C.dim, 'center');
      if (i === 0 && c.obsLeft > 0) badge(x + w / 2 + 30, 654, c.obsLeft, C.blue);
      if (i === 1 && c.qLeft > 0) badge(x + w / 2 + 30, 654, c.qLeft, C.green);
    }
  }
  MH.bottom = bottom;

  function badge(x, y, n, col) {
    ctx.beginPath(); ctx.arc(x, y, 8, 0, 6.284); ctx.fillStyle = col; ctx.fill();
    txt(String(n), x, y + 4, F(800, 11), '#12141b', 'center');
  }

  /* ---------------- modal ---------------- */

  function modal(G) {
    var m = G.modal, i;
    ctx.fillStyle = 'rgba(6,7,11,0.78)'; ctx.fillRect(0, 0, W, H);
    var lines = m.lines;
    if (lines.length > 13) lines = lines.slice(0, 13);
    var ph = 110 + lines.length * 20;
    var py = Math.max(70, (H - ph) / 2 - 30);
    rr(20, py, W - 40, ph, 14);
    ctx.fillStyle = C.panel; ctx.fill();
    ctx.strokeStyle = m.col || C.brass; ctx.lineWidth = 2; ctx.stroke();
    txt(fitText(m.title, W - 80, F(800, 15)), W / 2, py + 30, F(800, 15), m.col || C.brass, 'center');
    for (i = 0; i < lines.length; i++) {
      txt(lines[i].t, W / 2, py + 58 + i * 20, F(lines[i].b ? 700 : 500, 13), lines[i].c || C.ink, 'center');
    }
    button(40, py + ph - 62, W - 80, 50, m.btn || 'CLOSE', { t: 'closeModal' }, { bg: C.panel2 });
  }
  MH.modal = modal;

  /* ---------------- start / over ---------------- */

  function startScreen(G) {
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    var i, t = G.t;
    for (i = 0; i < MH.NR; i++) {
      var R = MH.roomRect(i);
      rr(R.x, R.y + 80, R.w, R.h, 8);
      ctx.fillStyle = 'rgba(26,30,43,' + (0.35 + 0.25 * Math.sin(t * 1.5 + i)) + ')'; ctx.fill();
      ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke();
    }
    txt('MOLEHUNT', W / 2, 78, F(900, 40), C.brass, 'center');
    txt('MANOR', W / 2, 116, F(900, 34), C.ink, 'center');
    txt('10 STAFF · 2 MOLES · 6 ROUNDS', W / 2, 160, F(800, 14), C.ink, 'center');
    var brief = [
      'Watch 2 rooms and question 2 staff each round.',
      'The task log posts where everyone claims to be.',
      'A liar is anyone the log puts in the wrong room —',
      'or anyone faking the work in front of you.',
      'Name both moles before the sabotage lands.'
    ];
    for (i = 0; i < brief.length; i++) txt(brief[i], W / 2, 214 + i * 19, F(500, 12), C.dim, 'center');

    txt('CHOOSE THE HOUSEHOLD', W / 2, 400, F(800, 13), C.brass, 'center');
    for (i = 0; i < 3; i++) {
      var y = 414 + i * 72;
      var col = [C.green, C.brass, C.red][i];
      button(24, y, W - 48, 62, '', { t: 'start', v: i }, { bg: C.panel, border: col });
      txt(MH.DIFFS[i].n, W / 2, y + 26, F(800, 17), col, 'center');
      txt(fitText(MH.DIFFS[i].d, W - 70, F(500, 11)), W / 2, y + 45, F(500, 11), C.dim, 'center');
    }
    txt('Tap a difficulty to begin — it also unlocks sound', W / 2, 648, F(600, 12), C.brass, 'center');
    var b = MH.best();
    if (b) txt(b, W / 2, 672, F(600, 11), C.dim, 'center');
  }
  MH.startScreen = startScreen;

  function overScreen(G) {
    var c = G.c, i;
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    var win = c.over === 1;
    txt(win ? 'CASE CLOSED' : 'THE MANOR GOES DARK', W / 2, 90, F(900, win ? 30 : 24),
      win ? C.green : C.red, 'center');
    txt(win ? 'Both moles in irons.' : 'The sabotage completed.', W / 2, 118, F(600, 14), C.dim, 'center');

    rr(20, 140, W - 40, 116, 12); ctx.fillStyle = C.panel; ctx.fill();
    ctx.strokeStyle = C.line; ctx.lineWidth = 1.5; ctx.stroke();
    txt('THE MOLES WERE', W / 2, 164, F(800, 12), C.brass, 'center');
    for (i = 0; i < 2; i++) {
      var id = c.moles[i], x = 40 + i * 170;
      chip(x, 178, 30, id);
      txt(fitText(MH.STAFF[id], 120, F(700, 13)), x + 38, 190, F(700, 13), C.ink);
      txt(c.caught[i] ? 'caught' : 'escaped', x + 38, 206, F(800, 11), c.caught[i] ? C.green : C.red);
    }
    txt('Rounds used: ' + Math.min(MH.ROUNDS, c.round + (c.over === 1 ? 1 : 0)) +
      '   ·   Difficulty: ' + MH.DIFFS[c.diff].n, W / 2, 240, F(600, 12), C.dim, 'center');

    txt('CASE RECORD', W / 2, 288, F(800, 12), C.brass, 'center');
    var rec = MH.records();
    if (!rec.length) txt('no earlier cases', W / 2, 312, F(500, 12), C.dim, 'center');
    for (i = 0; i < Math.min(5, rec.length); i++) {
      var r = rec[i], y = 306 + i * 26;
      rr(30, y, W - 60, 22, 6); ctx.fillStyle = C.panel; ctx.fill();
      txt(r.w ? 'SOLVED' : 'FAILED', 40, y + 16, F(800, 11), r.w ? C.green : C.red);
      txt(MH.DIFFS[r.d] ? MH.DIFFS[r.d].n : '?', 110, y + 16, F(600, 11), C.dim);
      txt(r.w ? 'in ' + r.r + ' rounds' : 'moles escaped', W - 40, y + 16, F(600, 11), C.dim, 'right');
    }
    var b = MH.best();
    if (b) txt(b, W / 2, 460, F(700, 12), C.brass, 'center');

    button(24, 484, W - 48, 56, 'RUN IT BACK (' + MH.DIFFS[c.diff].n + ')', { t: 'again' },
      { bg: 'rgba(240,192,100,0.18)', border: C.brass, col: C.brass, fs: 16 });
    txt('OR PICK A HOUSEHOLD', W / 2, 566, F(800, 11), C.dim, 'center');
    for (i = 0; i < 3; i++) {
      button(10 + i * 124, 578, 118, 50, MH.DIFFS[i].n, { t: 'start', v: i },
        { bg: C.panel, border: [C.green, C.brass, C.red][i], col: [C.green, C.brass, C.red][i], fs: 13 });
    }
    txt('Arrow keys move · Enter selects', W / 2, 660, F(500, 11), C.dim, 'center');
  }
  MH.overScreen = overScreen;
})();
