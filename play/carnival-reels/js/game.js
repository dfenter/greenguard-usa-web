/* Carnival Reels - main loop, HUD, transparency panel, persistence. */
(function (root) {
  'use strict';
  var CR = root.CR, U = CR.U, D = CR.D, Store = CR.Store, Audio = CR.Audio, Timers = CR.Timers;
  var M = CR_MACHINES, V = CR_VIEWS;

  var VW = 390, VH = 700;
  var BETS = [1, 2, 5, 10, 20, 50, 100];
  var START_BANK = 1000;
  var GOALS = [1250, 1500, 2000, 3000, 5000, 10000, 25000];
  var CURVE_CAP = 240;

  var BADGES = [
    { id: 'triple_crown', name: 'Triple Crown', m: 0, tag: 'TSE', desc: 'Three Sevens on the line' },
    { id: 'ghost_train', name: 'Wake the Train', m: 1, tag: 'bonusTrig', desc: 'Land 3+ coins' },
    { id: 'full_vault', name: 'Full Vault', m: 1, tag: 'fullVault', desc: 'Lock all five coins' },
    { id: 'deep_chain', name: 'Deep Chain', m: 2, tag: 'deepChain', desc: 'A 5-tumble cascade' },
    { id: 'mega_cluster', name: 'Mega Cluster', m: 2, tag: 'megaCluster', desc: 'Cluster of 13+' },
    { id: 'grand_ring', name: 'Grand Ring', m: 3, tag: 'w9', desc: 'The 500x ring' },
    { id: 'high_road', name: 'High Road', m: 3, tag: 'w8', desc: 'Land the 100x wedge' },
    { id: 'big_hit', name: 'Big Hit', m: -1, tag: null, desc: 'Win 50x+ on one spin' },
    { id: 'ladder_v', name: 'Ladder Five', m: -1, tag: null, desc: 'Reach 5,000 in a session' },
    { id: 'century', name: 'Century', m: -1, tag: null, desc: '100 spins on one machine' }
  ];
  var BADGE_IDS = BADGES.map(function (b) { return b.id; });

  /* ---------------- layout ---------------- */
  var L = {
    top: { x: 0, y: 0, w: VW, h: 56 },
    tabs: { x: 0, y: 58, w: VW, h: 50 },
    view: { x: 0, y: 112, w: VW, h: 274 },
    msg: { x: 0, y: 388, w: VW, h: 22 },
    ptabs: { x: 0, y: 412, w: VW, h: 48 },
    panel: { x: 0, y: 462, w: VW, h: 110 },
    bet: { x: 0, y: 576, w: VW, h: 50 },
    spin: { x: 14, y: 632, w: VW - 28, h: 62 }
  };
  var PTABS = ['MATH', 'CURVE', 'BADGES'];

  /* ---------------- state ---------------- */
  var G = {
    started: false, paused: false, rotate: false,
    mi: 0, betIdx: 2, bank: START_BANK, panel: 0, panelScroll: 0, panelMax: 0,
    spinning: false, res: null, flash: 0, shake: 0, shakeT: 0,
    msg: '', msgT: 0, hint: true,
    session: { spins: 0, wagered: 0, won: 0, peak: START_BANK, low: START_BANK, curve: [START_BANK], goal: 0 },
    badges: {}, best: {}, life: {}, bestPeak: START_BANK,
    toast: null, toastT: 0
  };
  var canvas, g, input, parts, dragId = null, dragY = 0, dragMoved = 0;

  /* ---------------- persistence (hardening #4) ---------------- */
  function load() {
    var d = Store.read();
    G.betIdx = Store.num(d.betIdx, 2, 0, BETS.length - 1) | 0;
    G.mi = Store.num(d.mi, 0, 0, 3) | 0;
    G.panel = Store.num(d.panel, 0, 0, 2) | 0;
    Audio.muted = Store.bool(d.muted, false);
    G.bestPeak = Store.num(d.bestPeak, START_BANK, 0, 1e12);
    var b = Store.obj(d.badges); G.badges = {};
    for (var i = 0; i < BADGE_IDS.length; i++) if (b[BADGE_IDS[i]] === true) G.badges[BADGE_IDS[i]] = true;
    var bs = Store.obj(d.best), lf = Store.obj(d.life);
    G.best = {}; G.life = {};
    M.MACHINES.forEach(function (m) {
      var o = Store.obj(bs[m.id]);
      G.best[m.id] = { peak: Store.num(o.peak, START_BANK, 0, 1e12), big: Store.num(o.big, 0, 0, 1e9) };
      var l = Store.obj(lf[m.id]);
      G.life[m.id] = {
        spins: Store.num(l.spins, 0, 0, 1e9) | 0,
        wagered: Store.num(l.wagered, 0, 0, 1e12),
        won: Store.num(l.won, 0, 0, 1e12)
      };
    });
  }
  function save() {
    Store.write({
      v: 1, betIdx: G.betIdx, mi: G.mi, panel: G.panel, muted: Audio.muted,
      bestPeak: G.bestPeak, badges: G.badges, best: G.best, life: G.life
    });
  }

  /* ---------------- canvas sizing ---------------- */
  var scale = 1, offX = 0, offY = 0, cssW = VW, cssH = VH;
  function resize() {
    var iw = root.innerWidth, ih = root.innerHeight;
    G.rotate = iw > ih * 1.25;
    if (input) {
      input.enabled = !G.rotate && !document.hidden;
      if (!input.enabled) input.releaseAll();
    }
    var fit = Math.min(iw / VW, ih / VH);
    cssW = Math.floor(VW * fit); cssH = Math.floor(VH * fit);
    var dpr = Math.min(root.devicePixelRatio || 1, 2);
    if (cssH * dpr > 960) dpr = 960 / cssH;
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.max(1, Math.round(cssW * dpr));
    canvas.height = Math.max(1, Math.round(cssH * dpr));
    scale = canvas.width / VW;
    var r = canvas.getBoundingClientRect();
    offX = r.left; offY = r.top;
    g.setTransform(scale, 0, 0, scale, 0, 0);
    g.imageSmoothingEnabled = true;
  }
  function toVirtual(cx, cy) {
    var r = canvas.getBoundingClientRect();
    return { x: (cx - r.left) / r.width * VW, y: (cy - r.top) / r.height * VH };
  }

  /* ---------------- analysis engine ---------------- */
  function analyseBoot() {
    M.MACHINES.forEach(function (m) {
      if (m.enumerate) m.enumerate(m.an);
    });
  }
  function analyseChunk(budgetMs) {
    if (budgetMs <= 0) return;
    var t0 = root.performance ? performance.now() : Date.now();
    for (var k = 0; k < M.MACHINES.length; k++) {
      var m = M.MACHINES[k];
      if (m.an.done) continue;
      while (m.an.n < m.simTarget) {
        for (var i = 0; i < 150; i++) m.an.add(m.spin(true), 1);
        var t1 = root.performance ? performance.now() : Date.now();
        if (t1 - t0 > budgetMs) return;
      }
      m.an.done = true;
    }
  }

  /* ---------------- helpers ---------------- */
  function machine() { return M.MACHINES[G.mi]; }
  function view() { return [V.A, V.B, V.C, V.D][G.mi]; }
  function bet() { return BETS[G.betIdx]; }
  function tagProb(mi, tag) {
    var an = M.MACHINES[mi].an;
    if (!an.n || !an.tags[tag]) return 0;
    return an.tags[tag].n / an.n;
  }
  function pushCurve(v) {
    var c = G.session.curve;
    c.push(v);
    if (c.length > CURVE_CAP) {
      var out = [], i;
      for (i = 0; i < c.length; i += 2) out.push(c[i]);
      out.push(c[c.length - 1]);
      G.session.curve = out.slice(-CURVE_CAP);
    }
  }
  function toast(text) { G.toast = text; G.toastT = 2.6; }
  function award(id) {
    if (G.badges[id]) return;
    G.badges[id] = true;
    var b = null;
    for (var i = 0; i < BADGES.length; i++) if (BADGES[i].id === id) b = BADGES[i];
    toast('BADGE  ' + (b ? b.name : id));
    Audio.badge();
    parts.burst(VW / 2, L.view.y + L.view.h / 2, 26, '#ffd76b', 190, 1.0);
    save();
  }

  /* ---------------- actions ---------------- */
  function resetBank(quiet) {
    G.bank = START_BANK;
    G.session = { spins: 0, wagered: 0, won: 0, peak: START_BANK, low: START_BANK, curve: [START_BANK], goal: 0 };
    if (!quiet) { G.msg = 'Bank reset - free, always.'; G.msgT = 2.5; Audio.click(); }
    hardReset();
  }
  // hardening #2: clear ALL transient state
  function hardReset() {
    Timers.clearAll();
    input.releaseAll();
    parts.clear();
    dragId = null; dragMoved = 0;
    G.spinning = false; G.res = null; G.flash = 0; G.shake = 0; G.shakeT = 0;
    V.A.reset(); V.B.reset(); V.C.reset(); V.D.reset();
  }
  function selectMachine(i) {
    if (i === G.mi || G.spinning) return;
    G.mi = i; G.panelScroll = 0;
    hardReset();
    Audio.click();
    G.msg = machine().blurb; G.msgT = 2.6;
    save();
  }
  function changeBet(d) {
    var n = U.clamp(G.betIdx + d, 0, BETS.length - 1);
    if (n === G.betIdx) return;
    G.betIdx = n; Audio.click(); save();
  }
  function doSpin() {
    if (G.spinning || G.paused) return;
    var b = bet();
    if (G.bank < b) {
      G.msg = 'Bank too small - tap RESET (free)'; G.msgT = 2.6;
      Audio.lose();
      return;
    }
    G.hint = false;
    G.bank -= b;
    var m = machine();
    var res = m.spin(false);
    G.res = res;
    G.spinning = true;
    G.flash = 0;
    G.msg = ''; G.msgT = 0;
    view().begin(res, FX);
    G.session.spins++;
    G.session.wagered += b;
    var lf = G.life[m.id];
    lf.spins++; lf.wagered += b;
    if (lf.wagered > 1e11) { lf.spins = 0; lf.wagered = 0; lf.won = 0; }  // hardening #5
  }
  function settle() {
    var m = machine(), res = G.res, b = bet();
    var winAmt = res.mult * b;
    G.bank += winAmt;
    G.session.won += winAmt;
    G.life[m.id].won += winAmt;
    G.spinning = false;
    G.flash = res.mult > 0 ? 1 : 0;
    if (res.mult > 0) {
      Audio.win(Math.log(1 + res.mult) * 1.6);
      var pn = Math.min(60, 8 + res.mult * 2) | 0;
      parts.burst(VW / 2, L.view.y + L.view.h * 0.55, pn, '#ffd76b', 150 + Math.min(250, res.mult * 8), 0.85);
      FX.shake(Math.min(18, 3 + res.mult));
      G.msg = 'WIN ' + U.fmt(winAmt) + '  (' + U.mx(res.mult) + ')';
    } else {
      Audio.lose();
      G.msg = 'No win  (0x)';
    }
    G.msgT = 3.2;
    if (res.mult >= 50) award('big_hit');
    if (res.badges) for (var i = 0; i < res.badges.length; i++) award(res.badges[i]);
    if (G.life[m.id].spins >= 100) award('century');
    if (res.mult * b > (G.best[m.id].big || 0)) G.best[m.id].big = res.mult * b;

    if (G.bank > G.session.peak) {
      G.session.peak = G.bank;
      if (G.bank > G.best[m.id].peak) G.best[m.id].peak = G.bank;
      if (G.bank > G.bestPeak) G.bestPeak = G.bank;
    }
    if (G.bank < G.session.low) G.session.low = G.bank;
    while (G.session.goal < GOALS.length && G.session.peak >= GOALS[G.session.goal]) {
      G.session.goal++;
      toast('GOAL  ' + U.fmt(GOALS[G.session.goal - 1]));
      Audio.fanfare();
    }
    if (G.session.peak >= 5000) award('ladder_v');
    pushCurve(G.bank);
    save();
  }

  /* ---------------- fx bridge for views ---------------- */
  var FX = {
    shake: function (a) { G.shake = Math.max(G.shake, a); G.shakeT = 0.32; },
    burstAt: function (i, n, r, color) {
      var b = V.B.cellRect(L.view, i);
      parts.burst(b.x + b.w / 2, b.y + b.h / 2, n, color, 160, 0.7);
    },
    burstCell: function (idx, n, color) {
      var go = V.C.geo(L.view);
      parts.burst(go.x + (idx % 5) * go.s + go.s / 2, go.y + ((idx / 5) | 0) * go.s + go.s / 2, n, color, 130, 0.55);
    }
  };

  /* ---------------- input actions ---------------- */
  function onAction(id) {
    if (!G.started) return;
    if (id === 'spin') doSpin();
    else if (id === 'betUp') changeBet(1);
    else if (id === 'betDown') changeBet(-1);
    else if (id === 'reset') resetBank(false);
    else if (id === 'mute') { Audio.muted = !Audio.muted; if (!Audio.muted) Audio.click(); save(); }
    else if (id === 'help') { G.hint = !G.hint; }
    else if (id.charAt(0) === 'm' && id.length === 2) selectMachine(+id.charAt(1));
    else if (id.charAt(0) === 'p' && id.length === 2) { G.panel = +id.charAt(1); G.panelScroll = 0; Audio.click(); save(); }
    else if (id === 'panelNext') { G.panelScroll += 30; }
    else if (id === 'panelPrev') { G.panelScroll -= 30; }
  }

  /* ---------------- controls registry ---------------- */
  function buildControls() {
    var c = input.controls;
    c.length = 0;
    var i, w, x;
    // machine tabs
    w = (VW - 20 - 18) / 4;
    for (i = 0; i < 4; i++) {
      x = 10 + i * (w + 6);
      c.push({ id: 'm' + i, x: x, y: L.tabs.y, w: w, h: L.tabs.h, disabled: G.spinning });
    }
    // panel tabs
    w = (VW - 20 - 12) / 3;
    for (i = 0; i < 3; i++) {
      x = 10 + i * (w + 6);
      c.push({ id: 'p' + i, x: x, y: L.ptabs.y, w: w, h: L.ptabs.h });
    }
    c.push({ id: 'panelScroll', x: L.panel.x, y: L.panel.y, w: L.panel.w, h: L.panel.h });
    c.push({ id: 'betDown', x: 14, y: L.bet.y, w: 76, h: L.bet.h });
    c.push({ id: 'betUp', x: VW - 90, y: L.bet.y, w: 76, h: L.bet.h });
    c.push({ id: 'spin', x: L.spin.x, y: L.spin.y, w: L.spin.w, h: L.spin.h, disabled: G.spinning });
    c.push({ id: 'mute', x: VW - 106, y: 4, w: 48, h: 48 });
    c.push({ id: 'reset', x: VW - 54, y: 4, w: 48, h: 48 });
  }

  /* ---------------- drawing ---------------- */
  function drawButton(rect, label, opts) {
    opts = opts || {};
    var pressed = input.pressed === opts.id && !opts.disabled;
    var y = rect.y + (pressed ? 2 : 0);
    g.fillStyle = opts.disabled ? '#1a2330' : (opts.active ? (opts.accent || '#2a5f8f') : '#1e2836');
    D.rr(g, rect.x, y, rect.w, rect.h, opts.r || 10); g.fill();
    g.strokeStyle = opts.active ? (opts.accentEdge || '#63b3f0') : '#33455c';
    g.lineWidth = 2; g.stroke();
    D.text(g, label, rect.x + rect.w / 2, y + rect.h / 2, opts.size || 13,
      opts.disabled ? '#4b5a6d' : (opts.active ? '#eaf4ff' : '#a9bdd4'), 'center', '700');
  }

  function drawTop() {
    g.fillStyle = '#111823';
    g.fillRect(0, 0, VW, L.top.h);
    D.text(g, 'BANK', 14, 18, 10, '#6d829b', 'left');
    var bankCol = G.bank >= START_BANK ? '#8ef0a8' : '#ffd0d0';
    D.text(g, U.fmt(G.bank), 14, 36, 22, bankCol, 'left', '800');
    D.text(g, 'SESSION PEAK', 150, 16, 9, '#6d829b', 'left');
    D.text(g, U.fmt(G.session.peak), 150, 32, 13, '#cfe0f2', 'left', '700');
    D.text(g, 'BEST ' + U.fmt(G.bestPeak), 150, 46, 9, '#6d829b', 'left');
    drawButton({ x: VW - 106, y: 4, w: 48, h: 48 }, Audio.muted ? 'X' : '((' , { id: 'mute', size: 15 });
    drawButton({ x: VW - 54, y: 4, w: 48, h: 48 }, 'RST', { id: 'reset', size: 12, accent: '#5c3a2a', active: G.bank <= 0 });
  }

  function drawTabs() {
    var w = (VW - 20 - 18) / 4;
    for (var i = 0; i < 4; i++) {
      var m = M.MACHINES[i], x = 10 + i * (w + 6);
      var act = i === G.mi;
      drawButton({ x: x, y: L.tabs.y, w: w, h: L.tabs.h }, '', { id: 'm' + i, active: act, disabled: G.spinning && !act });
      var col = act ? '#eaf4ff' : (G.spinning ? '#4b5a6d' : '#a9bdd4');
      var name = m.name.split(' ');
      D.text(g, name[0].toUpperCase(), x + w / 2, L.tabs.y + 17, 11, col, 'center', '800');
      D.text(g, name[1] ? name[1].toUpperCase() : '', x + w / 2, L.tabs.y + 30, 10, col, 'center', '600');
      D.text(g, (i + 1) + '', x + w / 2, L.tabs.y + 42, 9, act ? '#8fc6f5' : '#5d738c', 'center');
    }
  }

  function drawMsg() {
    var y = L.msg.y + L.msg.h / 2;
    if (G.msgT > 0 && G.msg) {
      var a = Math.min(1, G.msgT);
      g.globalAlpha = a;
      var col = G.msg.indexOf('WIN') === 0 ? '#ffe08a' : '#9fb4cc';
      D.text(g, G.msg, VW / 2, y, G.msg.length > 34 ? 11 : 14, col, 'center', '800');
      g.globalAlpha = 1;
    } else if (G.hint) {
      D.text(g, 'Tap SPIN - every number below is live and real', VW / 2, y, 11, '#7f93ab', 'center');
    } else {
      var nx = G.session.goal < GOALS.length ? GOALS[G.session.goal] : null;
      D.text(g, nx ? ('Next goal: ' + U.fmt(nx) + '   peak ' + U.fmt(G.session.peak))
        : ('Ladder complete - peak ' + U.fmt(G.session.peak)), VW / 2, y, 11, '#7f93ab', 'center');
    }
  }

  function drawPanelTabs() {
    var w = (VW - 20 - 12) / 3;
    for (var i = 0; i < 3; i++) {
      var x = 10 + i * (w + 6);
      drawButton({ x: x, y: L.ptabs.y, w: w, h: L.ptabs.h }, PTABS[i],
        { id: 'p' + i, active: i === G.panel, size: 12 });
    }
  }

  function panelRow(y, a, b, c, col, size) {
    D.text(g, a, 18, y, size || 11, col, 'left');
    if (b !== null) D.text(g, b, 258, y, size || 11, col, 'right');
    if (c !== null) D.text(g, c, VW - 18, y, size || 11, col, 'right');
  }

  function drawPanel() {
    var p = L.panel;
    g.fillStyle = '#0e141d';
    D.rr(g, 8, p.y, VW - 16, p.h, 10); g.fill();
    g.strokeStyle = '#223042'; g.lineWidth = 2; g.stroke();
    g.save();
    g.beginPath(); D.rr(g, 8, p.y, VW - 16, p.h, 10); g.clip();
    var y = p.y + 14 - G.panelScroll, h = 0;
    var m = machine(), an = m.an;

    if (G.panel === 0) {
      var src = an.exact ? ('exact - ' + U.fmt(an.n) + ' outcomes')
        : ('sim ' + U.fmt(an.n) + (an.done ? '' : ' / ' + U.fmt(m.simTarget)) + ' spins');
      D.text(g, 'RTP ' + (an.rtp() * 100).toFixed(2) + '%', 18, y, 15, '#8ef0a8', 'left', '800');
      var se = an.exact ? 0 : an.sd() / Math.sqrt(Math.max(1, an.n));
      D.text(g, an.exact ? src : (src + '  +/-' + (se * 200).toFixed(2) + '%'), VW - 18, y, 9, '#6d829b', 'right');
      y += 18;
      D.text(g, 'House edge ' + ((1 - an.rtp()) * 100).toFixed(2) + '%   volatility SD ' + an.sd().toFixed(1) + 'x',
        18, y, 10, '#9fb4cc', 'left'); y += 15;
      D.text(g, 'Hit any ' + U.pct(an.hitAny / an.n) + '   Hit 1x+ ' + U.pct(an.hit1 / an.n) +
        '   Top ' + U.mx(an.max), 18, y, 10, '#9fb4cc', 'left'); y += 15;
      var lf = G.life[m.id];
      D.text(g, lf.wagered > 0
        ? ('YOU: ' + (lf.won / lf.wagered * 100).toFixed(1) + '% over ' + U.fmt(lf.spins) + (lf.spins === 1 ? ' spin' : ' spins'))
        : 'YOU: no spins yet on this machine', 18, y, 10, '#ffd76b', 'left', '700'); y += 17;
      g.strokeStyle = '#22304a'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(16, y - 7); g.lineTo(VW - 16, y - 7); g.stroke();
      panelRow(y, 'OUTCOME', 'FREQUENCY', 'OF RTP', '#6d829b', 9); y += 15;
      var rows = an.n ? an.rows() : [];
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        panelRow(y, r.label, U.oneIn(r.p), r.rtp > 0 ? (r.rtp / an.rtp() * 100).toFixed(1) + '%' : '-',
          r.rtp > 0.05 ? '#dfe9f5' : '#93a7bd', 11);
        y += 15;
      }
      h = y + G.panelScroll - p.y + 6;
    } else if (G.panel === 1) {
      var s = G.session;
      D.text(g, 'SESSION CURVE  ' + U.fmt(s.spins) + ' spins', 18, y, 11, '#cfe0f2', 'left', '700');
      D.text(g, (s.wagered > 0 ? (s.won / s.wagered * 100).toFixed(1) + '% returned' : '-'), VW - 18, y, 11, '#ffd76b', 'right', '700');
      y += 16;
      drawChart(16, y, VW - 32, 58);
      y += 64;
      D.text(g, 'peak ' + U.fmt(s.peak) + '   low ' + U.fmt(s.low) +
        '   net ' + (G.bank - START_BANK >= 0 ? '+' : '') + U.fmt(G.bank - START_BANK), 18, y, 10, '#9fb4cc', 'left');
      y += 15;
      var nx = s.goal < GOALS.length ? GOALS[s.goal] : null;
      D.text(g, nx ? ('Goal ladder ' + s.goal + '/' + GOALS.length + '  next ' + U.fmt(nx))
        : ('Goal ladder COMPLETE ' + GOALS.length + '/' + GOALS.length), 18, y, 10, nx ? '#9fb4cc' : '#8ef0a8', 'left');
      y += 15;
      D.text(g, 'Bank resets are free and unlimited (RST).', 18, y, 10, '#6d829b', 'left');
      y += 15;
      h = y + G.panelScroll - p.y + 6;
    } else {
      var got = 0;
      for (var k = 0; k < BADGES.length; k++) if (G.badges[BADGES[k].id]) got++;
      D.text(g, 'ODDITY BADGES  ' + got + '/' + BADGES.length, 18, y, 11, '#cfe0f2', 'left', '700'); y += 17;
      for (var j = 0; j < BADGES.length; j++) {
        var bd = BADGES[j], have = !!G.badges[bd.id];
        var odds = '-';
        if (bd.m >= 0 && bd.tag) {
          var pp = tagProb(bd.m, bd.tag);
          if (pp > 0) odds = U.oneIn(pp);
        }
        g.fillStyle = have ? '#2c3f22' : '#161e2a';
        D.rr(g, 16, y - 8, VW - 32, 17, 5); g.fill();
        D.text(g, (have ? '* ' : '  ') + bd.name, 22, y, 10, have ? '#a8f0a8' : '#7f93ab', 'left', '700');
        D.text(g, bd.desc, 128, y, 9, have ? '#9fc9a0' : '#61748a', 'left');
        D.text(g, odds, VW - 22, y, 9, have ? '#cfe0a8' : '#61748a', 'right');
        y += 19;
      }
      h = y + G.panelScroll - p.y + 6;
    }
    g.restore();
    G.panelMax = Math.max(0, h - p.h);
    if (G.panelMax > 0) {
      var frac = p.h / (p.h + G.panelMax);
      var bh = Math.max(18, p.h * frac);
      var by = p.y + (p.h - bh) * (G.panelScroll / G.panelMax);
      g.fillStyle = 'rgba(120,150,190,0.35)';
      D.rr(g, VW - 13, by, 4, bh, 2); g.fill();
    }
  }

  function drawChart(x, y, w, h) {
    var c = G.session.curve;
    g.fillStyle = '#0a0f16';
    D.rr(g, x, y, w, h, 6); g.fill();
    var lo = Math.min.apply(null, c), hi = Math.max.apply(null, c);
    if (hi - lo < 1) { hi = lo + 1; }
    var pad = (hi - lo) * 0.12; lo -= pad; hi += pad;
    function px(i) { return x + (c.length < 2 ? 0 : i / (c.length - 1) * w); }
    function py(v) { return y + h - (v - lo) / (hi - lo) * h; }
    // start reference
    var sy = py(START_BANK);
    if (sy > y && sy < y + h) {
      g.strokeStyle = 'rgba(140,165,195,0.4)'; g.lineWidth = 1;
      g.setLineDash([3, 3]); g.beginPath(); g.moveTo(x, sy); g.lineTo(x + w, sy); g.stroke();
      g.setLineDash([]);
      D.text(g, U.fmt(START_BANK), x + 3, sy - 6, 8, 'rgba(160,180,205,0.7)', 'left');
    }
    // area + line
    g.beginPath();
    for (var i = 0; i < c.length; i++) { var X = px(i), Y = py(c[i]); if (i) g.lineTo(X, Y); else g.moveTo(X, Y); }
    g.strokeStyle = G.bank >= START_BANK ? '#6fe89a' : '#ff9aa5';
    g.lineWidth = 2; g.lineJoin = 'round'; g.stroke();
    g.lineTo(px(c.length - 1), y + h); g.lineTo(px(0), y + h); g.closePath();
    g.fillStyle = G.bank >= START_BANK ? 'rgba(111,232,154,0.12)' : 'rgba(255,154,165,0.12)';
    g.fill();
    if (c.length > 1) {
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(px(c.length - 1), py(c[c.length - 1]), 2.6, 0, 6.284); g.fill();
    }
    g.strokeStyle = '#22304a'; g.lineWidth = 1; D.rr(g, x, y, w, h, 6); g.stroke();
    D.text(g, U.fmt(hi), x + w - 4, y + 8, 8, '#5d738c', 'right');
    D.text(g, U.fmt(lo < 0 ? 0 : lo), x + w - 4, y + h - 8, 8, '#5d738c', 'right');
  }

  function drawBetAndSpin() {
    var b = bet();
    drawButton({ x: 14, y: L.bet.y, w: 76, h: L.bet.h }, '-', { id: 'betDown', size: 22, disabled: G.betIdx === 0 });
    drawButton({ x: VW - 90, y: L.bet.y, w: 76, h: L.bet.h }, '+', { id: 'betUp', size: 22, disabled: G.betIdx === BETS.length - 1 });
    D.text(g, 'BET', VW / 2, L.bet.y + 13, 9, '#6d829b', 'center');
    D.text(g, U.fmt(b), VW / 2, L.bet.y + 32, 20, '#eaf4ff', 'center', '800');
    var canSpin = !G.spinning && G.bank >= b;
    var pressed = input.pressed === 'spin' && canSpin;
    var sy = L.spin.y + (pressed ? 3 : 0);
    g.fillStyle = canSpin ? (pressed ? '#2f8f5f' : '#39a86f') : '#233040';
    D.rr(g, L.spin.x, sy, L.spin.w, L.spin.h, 14); g.fill();
    g.strokeStyle = canSpin ? '#7ff0b0' : '#33455c'; g.lineWidth = 2; g.stroke();
    D.text(g, G.spinning ? 'SPINNING...' : (G.bank < b ? 'RESET TO PLAY' : 'SPIN'),
      VW / 2, sy + L.spin.h / 2 - 6, 22, canSpin ? '#eafff2' : '#5b6c80', 'center', '800');
    D.text(g, G.spinning ? '' : ('-' + U.fmt(b) + '   space'), VW / 2, sy + L.spin.h / 2 + 15, 10,
      canSpin ? 'rgba(230,255,240,0.7)' : '#4b5a6d', 'center');
  }

  function drawToast() {
    if (G.toastT <= 0 || !G.toast) return;
    var a = Math.min(1, G.toastT / 0.5);
    var yy = L.view.y + 24 - (1 - Math.min(1, (2.6 - G.toastT) / 0.25)) * 20;
    g.globalAlpha = a;
    var w = 230;
    g.fillStyle = 'rgba(20,32,20,0.92)';
    D.rr(g, (VW - w) / 2, yy - 15, w, 30, 8); g.fill();
    g.strokeStyle = '#7ff0b0'; g.lineWidth = 2; g.stroke();
    D.text(g, G.toast, VW / 2, yy, 13, '#c8ffd8', 'center', '800');
    g.globalAlpha = 1;
  }

  function drawRotate() {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#0b1017';
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.setTransform(scale, 0, 0, scale, 0, 0);
    D.text(g, 'ROTATE TO PORTRAIT', VW / 2, VH / 2 - 14, 18, '#eaf4ff', 'center', '800');
    D.text(g, 'Carnival Reels is a portrait game. Paused.', VW / 2, VH / 2 + 12, 12, '#9fb4cc', 'center');
    g.strokeStyle = '#63b3f0'; g.lineWidth = 3;
    D.rr(g, VW / 2 - 26, VH / 2 - 100, 52, 76, 8); g.stroke();
  }

  function drawStart() {
    g.fillStyle = 'rgba(8,12,18,0.94)';
    g.fillRect(0, 0, VW, VH);
    D.text(g, 'CARNIVAL', VW / 2, VH / 2 - 96, 40, '#ffd76b', 'center', '800');
    D.text(g, 'REELS', VW / 2, VH / 2 - 54, 40, '#63b3f0', 'center', '800');
    D.text(g, 'A transparent probability toy.', VW / 2, VH / 2 - 12, 13, '#cfe0f2', 'center');
    D.text(g, 'Four original machines. Every payout,', VW / 2, VH / 2 + 12, 11, '#8fa5bd', 'center');
    D.text(g, 'every odd, shown live while you play.', VW / 2, VH / 2 + 28, 11, '#8fa5bd', 'center');
    D.text(g, 'Play money only. Bank resets free, forever.', VW / 2, VH / 2 + 52, 11, '#6fe89a', 'center');
    var pulse = 0.6 + 0.4 * Math.sin(Date.now() / 320);
    g.globalAlpha = pulse;
    g.fillStyle = '#39a86f';
    D.rr(g, VW / 2 - 110, VH / 2 + 84, 220, 58, 14); g.fill();
    g.globalAlpha = 1;
    D.text(g, 'TAP TO START', VW / 2, VH / 2 + 113, 18, '#eafff2', 'center', '800');
    D.text(g, 'space / tap  -  1-4 machines  -  R resets bank', VW / 2, VH - 40, 10, '#5d738c', 'center');
  }

  function render() {
    g.setTransform(scale, 0, 0, scale, 0, 0);
    g.fillStyle = '#0b1017';
    g.fillRect(0, 0, VW, VH);
    if (G.rotate) { drawRotate(); return; }

    var sh = 0;
    if (G.shakeT > 0) {
      sh = G.shake * (G.shakeT / 0.32);
      g.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
    }
    drawTop();
    drawTabs();
    view().draw(g, L.view, G.flash);
    parts.draw(g);
    drawToast();
    if (sh) g.setTransform(scale, 0, 0, scale, 0, 0);
    drawMsg();
    drawPanelTabs();
    drawPanel();
    drawBetAndSpin();
    if (!G.started) drawStart();
  }

  /* ---------------- loop ---------------- */
  var last = 0, acc = 0;
  function frame(ts) {
    root.requestAnimationFrame(frame);
    if (!last) last = ts;
    var dt = (ts - last) / 1000;
    last = ts;
    if (dt > 0.05) dt = 0.05;      // clamped delta
    if (dt < 0) dt = 0;

    var wasPaused = G.paused;
    G.paused = G.rotate || document.hidden;
    if (G.paused) {
      input.enabled = false;
      if (!wasPaused) input.releaseAll();
    } else {
      input.enabled = true;
    }
    buildControls();
    if (!G.paused) input.drain(onAction);

    if (!G.paused && G.started) {
      // panel drag-scroll
      var found = null, k;
      for (k in input.pointers) if (input.pointers[k].btn === 'panelScroll') { found = input.pointers[k]; break; }
      if (found) {
        if (dragId === null) { dragId = 1; dragY = found.y; dragMoved = 0; }
        else { var d = found.y - dragY; G.panelScroll -= d; dragMoved += Math.abs(d); dragY = found.y; }
      } else dragId = null;
      G.panelScroll = U.clamp(G.panelScroll, 0, G.panelMax);

      var v = view();
      if (G.spinning) {
        v.update(dt);
        if (v.done) settle();
      }
      parts.update(dt);
      if (G.flash > 0) G.flash = Math.max(0, G.flash - dt * 1.1);
      if (G.shakeT > 0) { G.shakeT -= dt; if (G.shakeT <= 0) G.shake = 0; }
      if (G.msgT > 0) G.msgT -= dt;
      if (G.toastT > 0) { G.toastT -= dt; if (G.toastT <= 0) G.toast = null; }
      analyseChunk(G.spinning ? 1.2 : 5);
    } else if (!G.paused) {
      analyseChunk(6);
    }
    render();
  }

  /* ---------------- boot ---------------- */
  function boot() {
    canvas = document.getElementById('c');
    g = canvas.getContext('2d', { alpha: false });
    parts = new CR.Particles(220);
    input = new CR.Input(canvas, toVirtual);
    load();
    analyseBoot();
    resize();
    root.addEventListener('resize', resize);
    root.addEventListener('orientationchange', function () { Timers.clearAll(); if (!document.hidden) Timers.set(resize, 120); });
    root.addEventListener('visibilitychange', function () {
      if (document.hidden) { Timers.clearAll(); if (input) input.releaseAll(); }
    });
    // first gesture starts the game + unlocks audio
    function start(e) {
      if (G.started) return;
      if (e) e.preventDefault();
      Audio.unlock();
      G.started = true;
      input.releaseAll();
      G.msg = machine().blurb; G.msgT = 2.6;
    }
    canvas.addEventListener('pointerdown', start, { passive: false });
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('mousedown', start, { passive: false });
    root.addEventListener('keydown', function (e) {
      if (!G.started) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); start(null); } }
    });
    root.requestAnimationFrame(frame);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
