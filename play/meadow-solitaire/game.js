// Meadow Solitaire - tri-peaks that grows a meadow. Vanilla JS, canvas, no deps.
(function () {
  'use strict';

  // ---------------------------------------------------------------- constants
  var VW = 390, VH = 700;                    // virtual design space
  var MAXPX = 960, MAXDPR = 2;
  var COVER = [[3, 4], [5, 6], [7, 8], [9, 10], [10, 11], [12, 13], [13, 14], [15, 16], [16, 17],
  [18, 19], [19, 20], [20, 21], [21, 22], [22, 23], [23, 24], [24, 25], [25, 26], [26, 27]];
  var BLOCKMASK = new Array(28);
  (function () {
    for (var i = 0; i < 28; i++) BLOCKMASK[i] = 0;
    for (var p = 0; p < COVER.length; p++)
      for (var k = 0; k < COVER[p].length; k++) BLOCKMASK[COVER[p][k]] |= (1 << p);
  })();
  var UX = [2, 5, 8, 1.5, 2.5, 4.5, 5.5, 7.5, 8.5, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5];
  var ROW = [0, 0, 0, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2,
    3, 3, 3, 3, 3, 3, 3, 3, 3, 3];
  var UNIT = 37, X0 = 10, CW = 35, CH = 48, RSTEP = 25, BY0 = 74;
  var RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  var SUITS = ['♠', '♥', '♦', '♣'];
  var MAX_WILDS = 3, MAX_PARTS = 200, MAX_FLOATS = 24, MAX_ANIM = 14;
  var KEY = 'meadowsol.v1';

  // ---------------------------------------------------------------- storage
  function blankSave() {
    return {
      v: 1, coins: 0, wilds: 0, current: 0, celebrated: 0,
      meadow: new Array(Meadow.count()).fill(0),
      won: new Array(40).fill(0),
      best: new Array(40).fill(0)
    };
  }
  function intArr(src, len, lo, hi) {
    var out = new Array(len).fill(0);
    if (!Array.isArray(src)) return out;
    for (var i = 0; i < len; i++) {
      var v = src[i];
      if (typeof v !== 'number' || !isFinite(v)) v = 0;
      v = Math.floor(v);
      out[i] = Math.max(lo, Math.min(hi, v));
    }
    return out;
  }
  function num(v, lo, hi, dflt) {
    if (typeof v !== 'number' || !isFinite(v)) return dflt;
    return Math.max(lo, Math.min(hi, Math.floor(v)));
  }
  function load() {
    var s = blankSave();
    try {
      var raw = window.localStorage.getItem(KEY);
      if (!raw || typeof raw !== 'string') return s;
      var d = JSON.parse(raw);
      if (!d || typeof d !== 'object' || Array.isArray(d)) return s;
      s.coins = num(d.coins, 0, 9999999, 0);
      s.wilds = num(d.wilds, 0, MAX_WILDS, 0);
      s.current = num(d.current, 0, 39, 0);
      s.celebrated = num(d.celebrated, 0, 1, 0);
      s.meadow = intArr(d.meadow, Meadow.count(), 0, 3);
      s.won = intArr(d.won, 40, 0, 1);
      s.best = intArr(d.best, 40, 0, 999999);
    } catch (e) { return blankSave(); }
    return s;
  }
  function save() {
    try { window.localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { }
  }

  var S = load();

  // ---------------------------------------------------------------- canvas
  var cv = document.getElementById('c');
  var ctx = cv.getContext('2d', { alpha: false });
  var scale = 1, cssW = VW, cssH = VH;
  var bootEl = document.getElementById('boot');
  var rotEl = document.getElementById('rotate');

  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    var landscape = w > h * 1.05;
    rotEl.style.display = (landscape && G.started) ? 'flex' : 'none';
    var nextPaused = (landscape && G.started) || document.hidden;
    if (nextPaused && !G.paused) { clearInput(); clearTimers(); }
    G.paused = nextPaused;
    var fit = Math.min(w / VW, h / VH);
    cssW = Math.round(VW * fit); cssH = Math.round(VH * fit);
    var dpr = Math.min(MAXDPR, window.devicePixelRatio || 1);
    var bw = Math.round(cssW * dpr), bh = Math.round(cssH * dpr);
    var long = Math.max(bw, bh);
    if (long > MAXPX) { var k = MAXPX / long; bw = Math.round(bw * k); bh = Math.round(bh * k); }
    cv.style.width = cssW + 'px'; cv.style.height = cssH + 'px';
    if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
    scale = bw / VW;
  }

  // ---------------------------------------------------------------- state
  var G = {
    started: false, paused: false, screen: 'meadow',
    deal: S.current, mask: 0, stock: [], si: 1, waste: 0, wasteCard: 0,
    tab: [], score: 0, streak: 0, best: 0, moves: 0, peaks: 0,
    result: null, wildArmed: false, sel: -1, hint: '',
    parts: [], floats: [], anims: [], shake: 0, flash: 0,
    t: 0, coinFx: 0, mSel: -1, celebrate: 0, hintHold: 0, reward: 0
  };
  var timers = [];
  function later(fn, ms) { var id = setTimeout(function () { fn(); }, ms); timers.push(id); if (timers.length > 40) timers.splice(0, timers.length - 40); return id; }
  function clearTimers() { for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]); timers.length = 0; }

  // ---------------------------------------------------------------- input
  var pointers = {};              // pointerId -> {x,y,sx,sy,target}
  var keys = {};
  function clearInput() {
    pointers = {}; keys = {};
    G.wildArmed = false; G.sel = -1; G.mSel = -1;
  }
  function toVirtual(ev) {
    var r = cv.getBoundingClientRect();
    return {
      x: (ev.clientX - r.left) / (r.width || 1) * VW,
      y: (ev.clientY - r.top) / (r.height || 1) * VH
    };
  }

  // ---------------------------------------------------------------- deal setup
  function decodeDeck(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var v = CARD_ALPHABET.indexOf(str.charAt(i));
      out.push(v < 0 ? 0 : v);
    }
    return out;
  }
  function startDeal(idx) {
    clearTimers();
    clearInput();
    G.deal = Math.max(0, Math.min(DEALS.length - 1, idx | 0));
    var deck = decodeDeck(DEALS[G.deal][0]);
    G.tab = deck.slice(0, 28);
    G.stock = deck.slice(28);
    G.mask = (1 << 28) - 1;
    G.si = 1;
    G.wasteCard = G.stock[0];
    G.score = 0; G.streak = 0; G.moves = 0; G.peaks = 0;
    G.result = null; G.parts.length = 0; G.floats.length = 0; G.anims.length = 0;
    G.shake = 0; G.flash = 0; G.coinFx = 0;
    G.screen = 'play';
    G.hint = 'Tap a card one rank above or below the big card.'; G.hintHold = 0;
    S.current = G.deal; save();
  }

  var rank = function (c) { return c % 13; };
  var suit = function (c) { return (c / 13) | 0; };
  function adjacent(a, b) { var d = Math.abs(rank(a) - rank(b)); return d === 1 || d === 12; }
  function alive(i) { return (G.mask & (1 << i)) !== 0; }
  function free(i) { return alive(i) && (G.mask & BLOCKMASK[i]) === 0; }
  function freeList() { var o = []; for (var i = 0; i < 28; i++) if (free(i)) o.push(i); return o; }
  function playable(i) { return free(i) && adjacent(G.tab[i], G.wasteCard); }
  function playableList() { var o = []; for (var i = 0; i < 28; i++) if (playable(i)) o.push(i); return o; }
  function cardsLeft() { var n = 0, m = G.mask; while (m) { n += m & 1; m >>>= 1; } return n; }
  function stuck() { return playableList().length === 0 && G.si >= G.stock.length && !(S.wilds > 0 && freeList().length > 0); }

  // ---------------------------------------------------------------- geometry
  function cardPos(i) {
    return { x: X0 + UX[i] * UNIT - CW / 2, y: BY0 + ROW[i] * RSTEP };
  }
  var WASTE = { x: 165, y: 216, w: 60, h: 84 };
  var STOCK = { x: 40, y: 216, w: 60, h: 84 };
  var WILDB = { x: 290, y: 216, w: 64, h: 84 };
  var MENUB = { x: 8, y: 8, w: 56, h: 44 };

  // ---------------------------------------------------------------- effects
  function burst(x, y, n, col, spd) {
    for (var i = 0; i < n; i++) {
      if (G.parts.length >= MAX_PARTS) break;
      var a = Math.random() * Math.PI * 2, s = (spd || 90) * (0.35 + Math.random());
      G.parts.push({
        x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 30,
        life: 0.5 + Math.random() * 0.5, max: 1, c: col || '#cfe6b0', r: 1.6 + Math.random() * 2.4
      });
    }
    if (G.parts.length > MAX_PARTS) G.parts.splice(0, G.parts.length - MAX_PARTS);
  }
  function float(x, y, text, col) {
    G.floats.push({ x: x, y: y, t: text, c: col || '#f2e7b0', life: 0.9 });
    if (G.floats.length > MAX_FLOATS) G.floats.splice(0, G.floats.length - MAX_FLOATS);
  }
  function shake(v) { G.shake = Math.min(14, G.shake + v); }
  function say(text, secs) { G.hint = text; G.hintHold = secs || 2.2; }

  // ---------------------------------------------------------------- actions
  function doPlay(i, viaWild) {
    if (G.result || G.screen !== 'play') return;
    if (!free(i)) { Sound.deny(); return; }
    if (!viaWild && !adjacent(G.tab[i], G.wasteCard)) { Sound.deny(); shake(3); return; }
    if (viaWild) { S.wilds = Math.max(0, S.wilds - 1); Sound.wild(); save(); }

    var p = cardPos(i);
    if (G.anims.length < MAX_ANIM) {
      G.anims.push({ c: G.tab[i], x: p.x, y: p.y, tx: WASTE.x, ty: WASTE.y, t: 0, d: 0.19, sw: CW, sh: CH });
    }
    G.mask &= ~(1 << i);
    G.wasteCard = G.tab[i];
    G.moves++;
    if (!viaWild) {
      G.streak++;
      var mult = Math.min(6, 1 + (G.streak - 1) * 0.5);
      var gain = Math.round(10 * mult);
      G.score += gain;
      float(p.x + CW / 2, p.y, '+' + gain + (mult > 1 ? '  x' + mult.toFixed(1) : ''), G.streak > 3 ? '#ffd76a' : '#dff0c0');
      Sound.play(Math.min(11, G.streak - 1));
    } else {
      G.streak = 0;
      float(p.x + CW / 2, p.y, 'WILD', '#c9a6ff');
    }
    burst(p.x + CW / 2, p.y + CH / 2, 8, '#9dd06a', 110);
    G.wildArmed = false;
    G.sel = -1;

    if (i < 3) {                                   // a peak top fell
      G.peaks++;
      G.score += 100;
      S.wilds = Math.min(MAX_WILDS, S.wilds + 1);
      save();
      float(p.x + CW / 2, p.y - 14, 'PEAK  +100  +WILD', '#ffd76a');
      burst(p.x + CW / 2, p.y + CH / 2, 26, '#ffd76a', 190);
      shake(7); G.flash = 0.5; Sound.peak();
    }
    checkEnd();
  }
  function doDraw() {
    if (G.result || G.screen !== 'play') return;
    if (G.si >= G.stock.length) { Sound.deny(); shake(2); return; }
    G.wasteCard = G.stock[G.si++];
    G.streak = 0;
    G.wildArmed = false; G.sel = -1;
    Sound.draw();
    if (G.anims.length < MAX_ANIM) {
      G.anims.push({ c: G.wasteCard, x: STOCK.x, y: STOCK.y, tx: WASTE.x, ty: WASTE.y, t: 0, d: 0.16, sw: WASTE.w, sh: WASTE.h });
    }
    checkEnd();
  }
  function checkEnd() {
    if (G.mask === 0) {
      var left = G.stock.length - G.si;
      G.score += 250 + left * 10;
      var gamble = DEALS[G.deal][1] === 0;
      var coins = Math.floor(G.score / 22) + 15;
      if (gamble) coins *= 3;
      G.reward = coins;
      G.result = 'win';
      S.coins += coins;
      S.won[G.deal] = 1;
      if (G.score > S.best[G.deal]) S.best[G.deal] = G.score;
      if (G.deal + 1 < DEALS.length) S.current = G.deal + 1;
      save();
      G.flash = 1; shake(10); Sound.win();
      for (var k = 0; k < 5; k++) later(function () { burst(VW * (0.2 + Math.random() * 0.6), 120 + Math.random() * 120, 20, ['#ffd76a', '#9dd06a', '#f0a6c8'][Math.floor(Math.random() * 3)], 220); }, k * 160);
      return;
    }
    if (stuck()) {
      G.result = 'lose';
      if (G.score > S.best[G.deal]) { S.best[G.deal] = G.score; save(); }
      shake(6); Sound.fail();
    }
  }
  function useWild(i) {
    if (S.wilds <= 0) { Sound.deny(); return; }
    doPlay(i, true);
  }

  // ---------------------------------------------------------------- meadow ops
  function meadowDone() {
    for (var i = 0; i < S.meadow.length; i++) if (S.meadow[i] < 3) return false;
    return true;
  }
  function grow(i) {
    if (i < 0 || i >= S.meadow.length) return;
    var st = S.meadow[i];
    if (st >= 3) { Sound.deny(); return; }
    var c = Meadow.cost(st);
    if (S.coins < c) { Sound.deny(); say('Need ' + (c - S.coins) + ' more coins - win a deal.', 3); return; }
    S.coins -= c;
    S.meadow[i] = st + 1;
    Sound.plant(st);
    save();
    if (meadowDone() && !S.celebrated) {
      S.celebrated = 1; save();
      G.celebrate = 6;
      Sound.bloom();
    }
  }

  // ---------------------------------------------------------------- drawing
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function txt(s, x, y, size, col, align, bold) {
    ctx.fillStyle = col;
    ctx.font = (bold ? '700 ' : '') + size + 'px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(s, x, y);
  }
  function drawCard(c, x, y, w, h, state) {
    // state: 'free' | 'blocked' | 'hot' | 'plain'
    var red = suit(c) === 1 || suit(c) === 2;
    ctx.save();
    if (state === 'hot') { ctx.shadowColor = 'rgba(255,225,120,0.9)'; ctx.shadowBlur = 12; }
    ctx.fillStyle = state === 'blocked' ? '#8f9a8c' : '#f4f1e2';
    rr(x, y, w, h, 5); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = state === 'hot' ? 2.6 : 1.4;
    ctx.strokeStyle = state === 'hot' ? '#ffdf7a' : (state === 'blocked' ? '#5d6a5a' : '#3d4a3c');
    rr(x, y, w, h, 5); ctx.stroke();
    var col = state === 'blocked' ? (red ? '#7e3b3b' : '#333c33') : (red ? '#c03a3a' : '#232b23');
    var fs = Math.max(13, Math.round(h * 0.34));
    txt(RANKS[rank(c)], x + w * 0.5, y + h * 0.36, fs, col, 'center', true);
    txt(SUITS[suit(c)], x + w * 0.5, y + h * 0.72, Math.round(fs * 0.86), col, 'center', false);
    ctx.restore();
  }
  function drawCardBack(x, y, w, h) {
    ctx.fillStyle = '#2f5a3a'; rr(x, y, w, h, 5); ctx.fill();
    ctx.strokeStyle = '#7fae63'; ctx.lineWidth = 1.6; rr(x + 3, y + 3, w - 6, h - 6, 4); ctx.stroke();
    ctx.strokeStyle = 'rgba(160,205,130,0.55)'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y + h - 12);
    ctx.quadraticCurveTo(x + w / 2, y + h * 0.42, x + w / 2, y + 12);
    ctx.stroke();
    for (var k = -1; k <= 1; k += 2) {
      ctx.beginPath();
      ctx.moveTo(x + w / 2, y + h * 0.55);
      ctx.quadraticCurveTo(x + w / 2 + k * 11, y + h * 0.42, x + w / 2, y + h * 0.3);
      ctx.stroke();
    }
  }
  function button(x, y, w, h, label, on, sub) {
    ctx.fillStyle = on ? '#5c8f43' : '#33422f';
    rr(x, y, w, h, 10); ctx.fill();
    ctx.strokeStyle = on ? '#a9d585' : '#4a5b45'; ctx.lineWidth = 2;
    rr(x, y, w, h, 10); ctx.stroke();
    txt(label, x + w / 2, y + h / 2 - (sub ? 8 : 0), 16, on ? '#f2f8e8' : '#8b9a86', 'center', true);
    if (sub) txt(sub, x + w / 2, y + h / 2 + 12, 12, on ? '#dbeec4' : '#75836f', 'center', false);
    return { x: x, y: y, w: w, h: h };
  }

  // ------------------------------------------------------- play screen render
  function drawPlay(dt) {
    var sx = 0, sy = 0;
    if (G.shake > 0.2) { sx = (Math.random() - 0.5) * G.shake; sy = (Math.random() - 0.5) * G.shake; }
    ctx.save(); ctx.translate(sx, sy);

    // background
    var g = ctx.createLinearGradient(0, 0, 0, 330);
    g.addColorStop(0, '#22331f'); g.addColorStop(1, '#1a2a1c');
    ctx.fillStyle = g; ctx.fillRect(0, 0, VW, 332);

    // HUD
    var d = DEALS[G.deal], fair = d[1] === 1;
    ctx.fillStyle = '#2b3a29'; rr(MENUB.x, MENUB.y, MENUB.w, MENUB.h, 9); ctx.fill();
    ctx.strokeStyle = '#5d7554'; ctx.lineWidth = 1.6; rr(MENUB.x, MENUB.y, MENUB.w, MENUB.h, 9); ctx.stroke();
    txt('‹', MENUB.x + MENUB.w / 2, MENUB.y + 15, 18, '#cfe0bd', 'center', true);
    txt('meadow', MENUB.x + MENUB.w / 2, MENUB.y + 32, 9, '#93a68b', 'center', false);

    txt('DEAL ' + (G.deal + 1) + '/' + DEALS.length, 72, 17, 14, '#cfe0bd', 'left', true);
    ctx.fillStyle = fair ? 'rgba(120,190,90,0.22)' : 'rgba(215,150,60,0.22)';
    var bw = fair ? 92 : 108;
    rr(72, 27, bw, 20, 6); ctx.fill();
    ctx.strokeStyle = fair ? '#78be5a' : '#e2a24a'; ctx.lineWidth = 1.2; rr(72, 27, bw, 20, 6); ctx.stroke();
    txt(fair ? 'FAIR · solvable' : 'GAMBLE deal', 78, 37, 11, fair ? '#b7e295' : '#f0c07a', 'left', true);
    txt(d[2] + '% clear odds', 72, 57, 10, '#93a68b', 'left', false);

    txt('SCORE', VW - 10, 15, 10, '#8fa287', 'right', false);
    txt('' + G.score, VW - 10, 32, 20, '#f2f8e8', 'right', true);
    txt('best ' + S.best[G.deal], VW - 10, 48, 10, '#8fa287', 'right', false);
    if (G.streak > 1) {
      var mult = Math.min(6, 1 + (G.streak - 1) * 0.5);
      txt('CHAIN x' + mult.toFixed(1) + '  ·  ' + G.streak + ' in a row', 195, 208, 13, '#ffd76a', 'center', true);
    }

    // tableau
    for (var i = 27; i >= 0; i--) {
      if (!alive(i)) continue;
      var p = cardPos(i);
      var st = free(i) ? (playable(i) || (G.wildArmed) ? 'hot' : 'free') : 'blocked';
      if (G.wildArmed && !free(i)) st = 'blocked';
      drawCard(G.tab[i], p.x, p.y, CW, CH, st);
      if (G.sel === i) {
        ctx.strokeStyle = '#8fd0e8'; ctx.lineWidth = 3;
        rr(p.x - 2, p.y - 2, CW + 4, CH + 4, 6); ctx.stroke();
      }
    }

    // stock
    var remain = G.stock.length - G.si;
    if (remain > 0) {
      for (var s = Math.min(3, remain) - 1; s >= 0; s--) drawCardBack(STOCK.x - s * 2, STOCK.y - s * 2, STOCK.w, STOCK.h);
    } else {
      ctx.strokeStyle = '#4a5b45'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
      rr(STOCK.x, STOCK.y, STOCK.w, STOCK.h, 5); ctx.stroke(); ctx.setLineDash([]);
    }
    txt(remain + ' left', STOCK.x + STOCK.w / 2, STOCK.y + STOCK.h + 14, 12, '#a4b79b', 'center', false);
    txt('DRAW', STOCK.x + STOCK.w / 2, STOCK.y - 12, 11, '#8fa287', 'center', true);

    // waste
    drawCard(G.wasteCard, WASTE.x, WASTE.y, WASTE.w, WASTE.h, 'plain');
    txt('MATCH ±1', WASTE.x + WASTE.w / 2, WASTE.y - 12, 11, '#cfe0bd', 'center', true);
    txt(cardsLeft() + ' cards on the peaks', WASTE.x + WASTE.w / 2, WASTE.y + WASTE.h + 14, 12, '#a4b79b', 'center', false);

    // wild button
    var canWild = S.wilds > 0;
    ctx.fillStyle = G.wildArmed ? '#6b4f9c' : (canWild ? '#3e3357' : '#2a3128');
    rr(WILDB.x, WILDB.y, WILDB.w, WILDB.h, 9); ctx.fill();
    ctx.strokeStyle = canWild ? '#c9a6ff' : '#414d3d'; ctx.lineWidth = 2;
    rr(WILDB.x, WILDB.y, WILDB.w, WILDB.h, 9); ctx.stroke();
    txt('WILD', WILDB.x + WILDB.w / 2, WILDB.y + 22, 14, canWild ? '#e2d2ff' : '#6d7a69', 'center', true);
    txt('x' + S.wilds, WILDB.x + WILDB.w / 2, WILDB.y + 46, 20, canWild ? '#fff' : '#6d7a69', 'center', true);
    txt(G.wildArmed ? 'pick card' : 'any card', WILDB.x + WILDB.w / 2, WILDB.y + 68, 10, canWild ? '#bda9e0' : '#6d7a69', 'center', false);

    // hint line
    txt(G.hint, VW / 2, 318, 12, '#9fb394', 'center', false);

    // meadow strip
    var mb = Meadow.draw(ctx, 0, 332, VW, VH - 332, S.meadow, G.t, { scale: 0.9 });
    ctx.fillStyle = 'rgba(10,18,10,0.55)'; ctx.fillRect(0, 332, VW, 26);
    txt('YOUR MEADOW  ·  ' + grown() + '/' + (S.meadow.length * 3) + ' growth', 10, 345, 12, '#cfe0bd', 'left', true);
    txt(S.coins + ' coins', VW - 10, 345, 12, '#ffd76a', 'right', true);

    // animating cards
    for (var a = 0; a < G.anims.length; a++) {
      var an = G.anims[a], k = Math.min(1, an.t / an.d), e = k * k * (3 - 2 * k);
      var ax = an.x + (an.tx - an.x) * e, ay = an.y + (an.ty - an.y) * e;
      var aw = an.sw + (WASTE.w - an.sw) * e, ah = an.sh + (WASTE.h - an.sh) * e;
      drawCard(an.c, ax, ay, aw, ah, 'plain');
    }
    drawFx();
    ctx.restore();

    if (G.flash > 0) {
      ctx.fillStyle = 'rgba(255,247,210,' + (G.flash * 0.45).toFixed(3) + ')';
      ctx.fillRect(0, 0, VW, VH);
    }
    if (G.result) drawResult();
  }
  function grown() { var n = 0; for (var i = 0; i < S.meadow.length; i++) n += S.meadow[i]; return n; }

  function drawFx() {
    for (var i = 0; i < G.parts.length; i++) {
      var p = G.parts[i];
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (var f = 0; f < G.floats.length; f++) {
      var fl = G.floats[f];
      ctx.globalAlpha = Math.max(0, Math.min(1, fl.life));
      txt(fl.t, fl.x, fl.y, 14, fl.c, 'center', true);
    }
    ctx.globalAlpha = 1;
  }

  var resultBtns = {};
  function drawResult() {
    ctx.fillStyle = 'rgba(8,14,8,0.82)'; ctx.fillRect(0, 0, VW, VH);
    var win = G.result === 'win';
    var y = 170;
    txt(win ? 'MEADOW BLOOMS' : 'DEAL FAILED', VW / 2, y, 26, win ? '#b9dc8a' : '#e2a24a', 'center', true);
    txt(win ? 'Peaks cleared - deal ' + (G.deal + 1) + ' complete' : 'No moves left. Retry costs nothing, ever.',
      VW / 2, y + 30, 13, '#a4b79b', 'center', false);
    txt('SCORE ' + G.score, VW / 2, y + 68, 22, '#f2f8e8', 'center', true);
    txt('best ' + S.best[G.deal], VW / 2, y + 92, 12, '#8fa287', 'center', false);
    if (win) {
      txt('+' + G.reward + ' coins' + (DEALS[G.deal][1] === 0 ? '  (gamble x3)' : ''), VW / 2, y + 120, 17, '#ffd76a', 'center', true);
    } else {
      txt('cards left: ' + cardsLeft() + '  ·  wilds banked: ' + S.wilds, VW / 2, y + 120, 13, '#a4b79b', 'center', false);
    }
    resultBtns.a = button(60, y + 150, 270, 56, win ? 'PLANT THE COINS' : 'RETRY FREE', true,
      win ? 'grow your meadow' : 'same deal, no cost');
    var hasNext = G.deal + 1 < DEALS.length;
    resultBtns.b = button(60, y + 216, 270, 52, win ? (hasNext ? 'NEXT DEAL' : 'BACK TO MEADOW') : 'BACK TO MEADOW', true, null);
    resultBtns.c = button(60, y + 276, 270, 48, win ? 'REPLAY THIS DEAL' : 'PICK ANOTHER DEAL', true, null);
  }

  // ------------------------------------------------------- meadow screen
  var meadowBoxes = [], meadowBtns = {};
  function drawMeadow() {
    ctx.fillStyle = '#16221a'; ctx.fillRect(0, 0, VW, VH);
    meadowBoxes = Meadow.draw(ctx, 0, 56, VW, 400, S.meadow, G.t, {
      selected: G.mSel,
      affordable: function (i) { return S.coins >= Meadow.cost(S.meadow[i]); }
    });
    // header
    ctx.fillStyle = '#101a12'; ctx.fillRect(0, 0, VW, 56);
    txt('MEADOW SOLITAIRE', 12, 20, 15, '#b9dc8a', 'left', true);
    txt(S.coins + ' coins', 12, 40, 13, '#ffd76a', 'left', true);
    txt('wilds ' + S.wilds + '/' + MAX_WILDS, 110, 40, 13, '#c9a6ff', 'left', true);
    var done = grown(), tot = S.meadow.length * 3;
    txt('growth ' + done + '/' + tot, VW - 12, 20, 13, '#cfe0bd', 'right', true);
    ctx.fillStyle = '#2c3a2c'; rr(VW - 122, 30, 110, 10, 5); ctx.fill();
    ctx.fillStyle = '#7fbe55'; rr(VW - 122, 30, 110 * (done / tot), 10, 5); ctx.fill();

    // panel
    ctx.fillStyle = '#111c13'; ctx.fillRect(0, 456, VW, VH - 456);
    var i = G.mSel;
    if (i >= 0) {
      var st = S.meadow[i], c = Meadow.cost(st);
      txt(Meadow.names[Meadow.slots[i].t] + '  #' + (i + 1), 16, 480, 16, '#dfe9d6', 'left', true);
      txt(st >= 3 ? 'Fully grown.' : 'Stage ' + st + '/3  ·  next stage costs ' + c + ' coins',
        16, 502, 12, '#93a68b', 'left', false);
      meadowBtns.grow = button(16, 518, 170, 56, st >= 3 ? 'GROWN' : 'GROW  ' + c,
        st < 3 && S.coins >= c, st < 3 && S.coins < c ? 'need ' + (c - S.coins) + ' more' : null);
    } else {
      txt('Tap a planting to grow it.', 16, 486, 14, '#93a68b', 'left', false);
      txt('Coins come from winning deals. Nothing costs money.', 16, 506, 11, '#6f7f6b', 'left', false);
      meadowBtns.grow = null;
    }
    meadowBtns.play = button(202, 518, 172, 56, 'PLAY DEAL ' + (S.current + 1), true,
      DEALS[S.current][1] ? 'fair · ' + DEALS[S.current][2] + '%' : 'gamble · ' + DEALS[S.current][2] + '%');
    meadowBtns.deals = button(16, 586, 358, 50, 'ALL 40 DEALS', true, null);
    txt(G.hint || 'Every deal is solver-checked. Gambles are labelled.',
      VW / 2, 660, 11, '#6f7f6b', 'center', false);

    if (G.celebrate > 0) {
      ctx.fillStyle = 'rgba(8,14,8,' + Math.min(0.7, G.celebrate * 0.16).toFixed(2) + ')';
      ctx.fillRect(0, 0, VW, VH);
      txt('THE MEADOW IS COMPLETE', VW / 2, 300, 24, '#ffd76a', 'center', true);
      txt('All 12 plantings in full bloom.', VW / 2, 332, 14, '#dfe9d6', 'center', false);
      txt('Keep playing - deals stay free.', VW / 2, 356, 12, '#93a68b', 'center', false);
    }
    drawFx();
  }

  // ------------------------------------------------------- deals screen
  var dealBoxes = [], dealsBack = null;
  function drawDeals() {
    ctx.fillStyle = '#16221a'; ctx.fillRect(0, 0, VW, VH);
    ctx.fillStyle = '#101a12'; ctx.fillRect(0, 0, VW, 78);
    txt('ALL DEALS', 12, 22, 17, '#b9dc8a', 'left', true);
    txt('FAIR = solver proved a full clear exists.', 12, 44, 11, '#93a68b', 'left', false);
    txt('GAMBLE = no clean solve; wilds are your only shot.', 12, 60, 11, '#e2a24a', 'left', false);

    dealBoxes.length = 0;
    var cols = 5, cw = 70, ch = 62, ox = 14, oy = 92;
    for (var i = 0; i < DEALS.length; i++) {
      var cx = ox + (i % cols) * cw, cy = oy + Math.floor(i / cols) * ch;
      var fair = DEALS[i][1] === 1, won = S.won[i] === 1;
      ctx.fillStyle = won ? '#3f6b34' : (fair ? '#26331f' : '#33291c');
      rr(cx, cy, cw - 6, ch - 8, 8); ctx.fill();
      ctx.strokeStyle = i === S.current ? '#8fd0e8' : (fair ? '#4e6b3f' : '#7a5a2c');
      ctx.lineWidth = i === S.current ? 2.4 : 1.3;
      rr(cx, cy, cw - 6, ch - 8, 8); ctx.stroke();
      txt('' + (i + 1), cx + (cw - 6) / 2, cy + 16, 15, '#e6efdc', 'center', true);
      txt(fair ? 'FAIR' : 'GAMBLE', cx + (cw - 6) / 2, cy + 32, 9, fair ? '#9dd06a' : '#e2a24a', 'center', true);
      txt(DEALS[i][2] + '%', cx + (cw - 6) / 2, cy + 45, 10, '#a4b79b', 'center', false);
      if (won) txt('★', cx + cw - 16, cy + 12, 11, '#ffd76a', 'center', false);
      dealBoxes.push({ i: i, x: cx, y: cy, w: cw - 6, h: ch - 8 });
    }
    var by = oy + Math.ceil(DEALS.length / cols) * ch + 8;
    dealsBack = button(14, by, 170, 52, 'BACK', true, null);
    txt('Odds = clear rate of an average player.', VW - 14, by + 18, 10, '#6f7f6b', 'right', false);
    txt('Failing costs nothing.', VW - 14, by + 34, 10, '#6f7f6b', 'right', false);
    drawFx();
  }

  // ---------------------------------------------------------------- update
  function update(dt) {
    G.t += dt;
    if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 26);
    if (G.flash > 0) G.flash = Math.max(0, G.flash - dt * 1.8);
    if (G.celebrate > 0) G.celebrate = Math.max(0, G.celebrate - dt);
    for (var i = G.parts.length - 1; i >= 0; i--) {
      var p = G.parts[i];
      p.vy += 260 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt * 1.15;
      if (p.life <= 0 || p.y > VH + 30) G.parts.splice(i, 1);
    }
    for (var f = G.floats.length - 1; f >= 0; f--) {
      var fl = G.floats[f]; fl.y -= 26 * dt; fl.life -= dt * 1.1;
      if (fl.life <= 0) G.floats.splice(f, 1);
    }
    for (var a = G.anims.length - 1; a >= 0; a--) {
      G.anims[a].t += dt;
      if (G.anims[a].t >= G.anims[a].d) G.anims.splice(a, 1);
    }
    if (G.hintHold > 0) G.hintHold -= dt;
    if (G.screen === 'play' && !G.result && G.hintHold <= 0) {
      var none = playableList().length === 0, empty = G.si >= G.stock.length;
      if (G.wildArmed) G.hint = 'Wild armed - tap any uncovered card, any rank.';
      else if (none && empty && S.wilds > 0) G.hint = 'No matches left - spend a WILD, or leave the deal.';
      else if (none) G.hint = 'No match - tap DRAW for a new card.';
      else if (G.moves === 0) G.hint = 'Tap a card one rank above or below the big card.';
      else if (G.streak >= 3) G.hint = 'Chain running - keep matching for a bigger multiplier.';
      else G.hint = 'Clear a peak top to earn a WILD.';
    }
  }

  var last = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    var dt = (ts - last) / 1000; last = ts;
    if (!isFinite(dt) || dt < 0) dt = 0;
    dt = Math.min(0.05, dt);
    if (!G.started) return;
    if (G.paused) { return; }               // rotate overlay: simulation frozen
    update(dt);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.fillStyle = '#1d2b1f'; ctx.fillRect(0, 0, VW, VH);
    if (G.screen === 'play') drawPlay(dt);
    else if (G.screen === 'meadow') drawMeadow();
    else drawDeals();
  }

  // ---------------------------------------------------------------- hit tests
  function inBox(b, x, y) { return b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h; }

  function tapPlay(x, y) {
    if (G.result) {
      if (inBox(resultBtns.a, x, y)) {
        Sound.tap();
        if (G.result === 'win') { G.screen = 'meadow'; G.hint = 'Tap a planting to grow it.'; clearInput(); }
        else startDeal(G.deal);
        return;
      }
      if (inBox(resultBtns.b, x, y)) {
        Sound.tap();
        if (G.result === 'win' && G.deal + 1 < DEALS.length) startDeal(G.deal + 1);
        else { G.screen = 'meadow'; clearInput(); }
        return;
      }
      if (inBox(resultBtns.c, x, y)) {
        Sound.tap();
        if (G.result === 'win') startDeal(G.deal);
        else { G.screen = 'deals'; clearInput(); }
        return;
      }
      return;
    }
    if (inBox(MENUB, x, y)) { Sound.tap(); G.screen = 'meadow'; clearInput(); return; }
    if (inBox(STOCK, x, y)) { doDraw(); return; }
    if (inBox(WILDB, x, y)) {
      if (S.wilds > 0) { G.wildArmed = !G.wildArmed; Sound.tap(); if (!G.wildArmed) say('Wild cancelled.', 1.4); }
      else { Sound.deny(); say('No wilds banked. Clear a peak top to earn one.', 2.4); }
      return;
    }
    // cards: peaks overlap, so score every card the touch covers and take the
    // best one - playable beats free beats covered, nearest centre breaks ties.
    var bestI = -1, bestScore = -1e9, pad = 7;
    for (var i = 0; i < 28; i++) {
      if (!alive(i)) continue;
      var p = cardPos(i);
      if (x < p.x - pad || x > p.x + CW + pad || y < p.y - pad || y > p.y + CH + pad) continue;
      var dx = x - (p.x + CW / 2), dy = y - (p.y + CH / 2);
      var sc = -Math.sqrt(dx * dx + dy * dy) + ROW[i] * 2;
      if (free(i)) sc += 1000;
      if (!G.wildArmed && playable(i)) sc += 4000;
      if (sc > bestScore) { bestScore = sc; bestI = i; }
    }
    if (bestI >= 0) {
      if (G.wildArmed) { if (free(bestI)) useWild(bestI); else Sound.deny(); }
      else doPlay(bestI, false);
      return;
    }
    if (G.wildArmed) { G.wildArmed = false; }
  }

  function tapMeadow(x, y) {
    if (G.celebrate > 0) { G.celebrate = 0; return; }
    if (inBox(meadowBtns.play, x, y)) { Sound.tap(); startDeal(S.current); return; }
    if (inBox(meadowBtns.deals, x, y)) { Sound.tap(); G.screen = 'deals'; clearInput(); return; }
    if (meadowBtns.grow && inBox(meadowBtns.grow, x, y)) {
      if (G.mSel >= 0) {
        var before = S.meadow[G.mSel];
        grow(G.mSel);
        if (S.meadow[G.mSel] > before) {
          var b = null;
          for (var q = 0; q < meadowBoxes.length; q++) if (meadowBoxes[q].i === G.mSel) b = meadowBoxes[q];
          if (b) { burst(b.cx, b.cy - 10, 18, '#9dd06a', 130); float(b.cx, b.cy - 40, 'GROW', '#b9dc8a'); }
        }
      }
      return;
    }
    for (var k = meadowBoxes.length - 1; k >= 0; k--) {
      if (inBox(meadowBoxes[k], x, y)) { G.mSel = meadowBoxes[k].i; Sound.tap(); G.hint = ''; return; }
    }
    G.mSel = -1;
  }

  function tapDeals(x, y) {
    if (inBox(dealsBack, x, y)) { Sound.tap(); G.screen = 'meadow'; clearInput(); return; }
    for (var i = 0; i < dealBoxes.length; i++) {
      if (inBox(dealBoxes[i], x, y)) { Sound.tap(); startDeal(dealBoxes[i].i); return; }
    }
  }

  function onTap(x, y) {
    if (G.paused || !G.started) return;
    if (G.screen === 'play') tapPlay(x, y);
    else if (G.screen === 'meadow') tapMeadow(x, y);
    else tapDeals(x, y);
  }

  // ---------------------------------------------------------------- events
  function down(ev) {
    ev.preventDefault();
    if (G.paused || document.hidden) return;
    var id = (ev.pointerId === undefined) ? 'm' : ev.pointerId;
    var v = toVirtual(ev);
    pointers[id] = { x: v.x, y: v.y, sx: v.x, sy: v.y, t: G.t };
    Sound.unlock();
  }
  function move(ev) {
    var id = (ev.pointerId === undefined) ? 'm' : ev.pointerId;
    if (G.paused || document.hidden) return;
    var p = pointers[id];
    if (!p) return;
    ev.preventDefault();
    var v = toVirtual(ev);
    p.x = v.x; p.y = v.y;
  }
  function up(ev) {
    var id = (ev.pointerId === undefined) ? 'm' : ev.pointerId;
    if (G.paused || document.hidden) { clearInput(); return; }
    var p = pointers[id];
    delete pointers[id];
    if (!p) return;
    ev.preventDefault();
    var v = toVirtual(ev);
    var dx = v.x - p.sx, dy = v.y - p.sy;
    if (dx * dx + dy * dy < 26 * 26) onTap(v.x, v.y);   // tap, not a drag
  }
  function cancel(ev) {
    var id = (ev.pointerId === undefined) ? 'm' : ev.pointerId;
    delete pointers[id];
  }

  if (window.PointerEvent) {
    cv.addEventListener('pointerdown', down, { passive: false });
    cv.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up, { passive: false });
    window.addEventListener('pointercancel', cancel, { passive: false });
  } else {
    cv.addEventListener('touchstart', function (e) { for (var i = 0; i < e.changedTouches.length; i++) { var t = e.changedTouches[i]; t.pointerId = t.identifier; down(t); } e.preventDefault(); }, { passive: false });
    cv.addEventListener('touchmove', function (e) { for (var i = 0; i < e.changedTouches.length; i++) { var t = e.changedTouches[i]; t.pointerId = t.identifier; move(t); } e.preventDefault(); }, { passive: false });
    window.addEventListener('touchend', function (e) { for (var i = 0; i < e.changedTouches.length; i++) { var t = e.changedTouches[i]; t.pointerId = t.identifier; up(t); } }, { passive: false });
    window.addEventListener('touchcancel', function (e) { for (var i = 0; i < e.changedTouches.length; i++) { var t = e.changedTouches[i]; t.pointerId = t.identifier; cancel(t); } }, { passive: false });
    cv.addEventListener('mousedown', function (e) { down(e); });
    window.addEventListener('mousemove', function (e) { move(e); });
    window.addEventListener('mouseup', function (e) { up(e); });
  }
  cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  window.addEventListener('blur', function () { clearInput(); });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { G.paused = true; clearInput(); clearTimers(); }
    else { G.paused = window.innerWidth > window.innerHeight * 1.05 && G.started; last = performance.now(); }
  });

  // keyboard
  function cycleSel(dir) {
    var list = freeList();
    if (!list.length) { G.sel = -1; return; }
    var pos = list.indexOf(G.sel);
    pos = (pos < 0) ? (dir > 0 ? 0 : list.length - 1) : (pos + dir + list.length) % list.length;
    G.sel = list[pos];
    Sound.tap();
  }
  window.addEventListener('keydown', function (e) {
    var k = e.key;
    if ([' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter'].indexOf(k) >= 0) e.preventDefault();
    if (G.paused || document.hidden) { clearInput(); return; }
    if (keys[k]) return;
    keys[k] = 1;
    if (!G.started) { boot(); return; }
    if (G.paused) return;
    if (G.screen !== 'play') {
      if (k === 'Enter' || k === ' ') { Sound.tap(); if (G.screen === 'meadow') startDeal(S.current); else G.screen = 'meadow'; }
      else if (k === 'Escape') { G.screen = 'meadow'; clearInput(); }
      else if (G.screen === 'meadow' && (k === 'ArrowLeft' || k === 'ArrowRight')) {
        G.mSel = (G.mSel + (k === 'ArrowRight' ? 1 : -1) + S.meadow.length) % S.meadow.length;
        Sound.tap();
      } else if (G.screen === 'meadow' && (k === 'ArrowUp' || k === 'g' || k === 'G')) { grow(G.mSel); }
      return;
    }
    if (G.result) {
      if (k === ' ' || k === 'Enter') { if (G.result === 'win') { G.screen = 'meadow'; clearInput(); } else startDeal(G.deal); }
      else if (k === 'n' || k === 'N') startDeal(Math.min(DEALS.length - 1, G.deal + 1));
      else if (k === 'r' || k === 'R') startDeal(G.deal);
      else if (k === 'Escape') { G.screen = 'meadow'; clearInput(); }
      return;
    }
    if (k === 'ArrowLeft') cycleSel(-1);
    else if (k === 'ArrowRight') cycleSel(1);
    else if (k === 'ArrowDown') doDraw();
    else if (k === 'ArrowUp') { if (G.sel >= 0) useWild(G.sel); else Sound.deny(); }
    else if (k === ' ' || k === 'Enter') {
      if (G.sel >= 0) doPlay(G.sel, false);
      else { var pl = playableList(); if (pl.length) doPlay(pl[0], false); else doDraw(); }
    }
    else if (k === 'r' || k === 'R') startDeal(G.deal);
    else if (k === 'Escape') { G.screen = 'meadow'; clearInput(); }
  });
  window.addEventListener('keyup', function (e) { delete keys[e.key]; });

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', function () { later(resize, 60); });

  // ---------------------------------------------------------------- boot
  function boot() {
    if (G.started || document.hidden) return;
    Sound.unlock();
    G.started = true;
    bootEl.style.display = 'none';
    clearInput();
    resize();
    if (meadowDone()) G.screen = 'meadow';
  }
  bootEl.addEventListener('pointerdown', function (e) { e.preventDefault(); boot(); }, { passive: false });
  bootEl.addEventListener('click', function (e) { e.preventDefault(); boot(); });
  bootEl.addEventListener('touchstart', function (e) { e.preventDefault(); boot(); }, { passive: false });

  resize();
  requestAnimationFrame(frame);
})();
