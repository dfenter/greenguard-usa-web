/* Beastbind Cards - boot, state, storage, input, audio, loop. */
(function (root) {
  'use strict';
  var D = root.BB_CARDS, E = root.BB_ENGINE, U = root.BB_UI, C = D.CARDS;
  var W = U.W, H = U.H;
  var KEY = 'beastbind.v1';
  var MAXP = 120;

  var A = {
    ctx: null, canvas: null, screen: 'map', save: null, G: null,
    mode: null, sel: null, drag: null, parts: [], shake: 0, flash: 0,
    scroll: 0, hint: '', pack: null, aiTimer: 0, paused: false, hidden: !!document.hidden, kb: false,
    focus: -1, ptr: {}, keys: {}, resultApplied: false, dpr: 1, sc: 1, ox: 0, oy: 0
  };
  root.BB = A;

  // ------------------------------------------------------------- storage
  function defSave() {
    var s = { v: 1, rank: 0, wins: 0, credits: 0, col: D.starterCollection(), deck: [], packs: 0 };
    s.deck = autoDeck(s);
    return s;
  }
  function isInt(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n; }
  function clampInt(n, lo, hi, dflt) {
    if (!isInt(n)) return dflt;
    return Math.max(lo, Math.min(hi, n));
  }
  function load() {
    var raw = null;
    try { raw = root.localStorage.getItem(KEY); } catch (e) { raw = null; }
    if (!raw || typeof raw !== 'string') return defSave();
    var o = null;
    try { o = JSON.parse(raw); } catch (e2) { o = null; }
    if (!o || typeof o !== 'object' || Array.isArray(o)) return defSave();
    var s = defSave();
    s.rank = clampInt(o.rank, 0, D.LADDER.length, 0);
    s.wins = clampInt(o.wins, 0, 999999, 0);
    s.credits = clampInt(o.credits, 0, 9999, 0);
    s.packs = clampInt(o.packs, 0, 99, 0);
    if (o.col && typeof o.col === 'object' && !Array.isArray(o.col)) {
      var col = {};
      for (var k in o.col) {
        var id = parseInt(k, 10);
        if (!isInt(id) || id < 0 || id >= D.SET_SIZE || !C[id]) continue;
        var v = clampInt(o.col[k], 0, 2, 0);
        if (v > 0) col[id] = v;
      }
      if (Object.keys(col).length) s.col = col;
    }
    // a collection too small to field a legal deck gets topped up with the starter set
    var total = 0, kk;
    for (kk in s.col) total += s.col[kk];
    if (total < 24) {
      var st = D.starterCollection();
      for (kk in st) s.col[kk] = Math.max(s.col[kk] || 0, st[kk]);
    }
    if (Array.isArray(o.deck)) {
      var d = [], cnt = {};
      for (var i = 0; i < o.deck.length && d.length < 20; i++) {
        var cid = o.deck[i];
        if (!isInt(cid) || cid < 0 || cid >= D.SET_SIZE || !C[cid]) continue;
        cnt[cid] = (cnt[cid] || 0) + 1;
        if (cnt[cid] > Math.min(2, s.col[cid] || 0)) continue;
        d.push(cid);
      }
      s.deck = d.length === 20 ? d : autoDeck(s);
    } else s.deck = autoDeck(s);
    return s;
  }
  function save() {
    try { root.localStorage.setItem(KEY, JSON.stringify(A.save)); } catch (e) { /* full or blocked */ }
  }

  // ------------------------------------------------------------- deck build
  function autoDeck(s) {
    var own = function (id) { return Math.min(2, s.col[id] || 0); };
    var deck = [], i, k;
    // score elements
    var esc = [0, 0, 0];
    for (i = 0; i < D.SET_SIZE; i++) {
      var c = C[i];
      if (c.t !== 'c') continue;
      esc[c.e] += own(i) * c.s * c.s;
    }
    var el = esc.indexOf(Math.max(esc[0], esc[1], esc[2]));
    // group into lines
    var lines = {};
    for (i = 0; i < D.SET_SIZE; i++) {
      var cc = C[i];
      if (cc.t !== 'c' || cc.e !== el) continue;
      (lines[cc.line] = lines[cc.line] || []).push(i);
    }
    var arr = [];
    for (k in lines) {
      var ids = lines[k].sort(function (a, b) { return C[a].s - C[b].s; });
      var sc = 0;
      for (i = 0; i < ids.length; i++) sc += own(ids[i]) * (C[ids[i]].s === 1 ? 1 : C[ids[i]].s * 2);
      if (own(ids[0]) === 0) sc = 0;
      arr.push({ ids: ids, sc: sc });
    }
    arr.sort(function (a, b) { return b.sc - a.sc; });
    var push = function (id, n) {
      for (var q = 0; q < n && deck.length < 20; q++) deck.push(id);
    };
    for (i = 0; i < arr.length && i < 3; i++) {
      var L = arr[i].ids;
      if (!arr[i].sc) continue;
      push(L[0], own(L[0]));
      if (L[1]) push(L[1], own(L[1]));
      if (L[2]) push(L[2], own(L[2]));
    }
    // handlers (max 6)
    var hcount = 0;
    var pref = ['DRAW2', 'EXTRA_E', 'HEAL30', 'SEARCH', 'BOOST20', 'SCOUT', 'DRAW3', 'HEAL60', 'QUICKEVO', 'GUST'];
    for (var p = 0; p < pref.length && hcount < 6 && deck.length < 20; p++) {
      for (i = 0; i < D.SET_SIZE; i++) {
        if (C[i].t === 'h' && C[i].fx === pref[p] && own(i) > 0) {
          var n = Math.min(own(i), 6 - hcount, 20 - deck.length);
          push(i, n); hcount += n;
        }
      }
    }
    // fill with any owned basics first, then anything
    var counts = {};
    for (i = 0; i < deck.length; i++) counts[deck[i]] = (counts[deck[i]] || 0) + 1;
    var fill = function (test) {
      for (var q = 0; q < D.SET_SIZE && deck.length < 20; q++) {
        if (!test(C[q])) continue;
        var room = own(q) - (counts[q] || 0);
        while (room-- > 0 && deck.length < 20) { deck.push(q); counts[q] = (counts[q] || 0) + 1; }
      }
    };
    fill(function (c) { return c.t === 'c' && c.s === 1 && c.e === el; });
    fill(function (c) { return c.t === 'c' && c.s === 1; });
    fill(function (c) { return c.t === 'h'; });
    fill(function () { return true; });
    // guarantee enough starters
    var basics = deck.filter(function (id) { return C[id].t === 'c' && C[id].s === 1; }).length;
    if (basics < 7) {
      for (i = 0; i < D.SET_SIZE && basics < 7; i++) {
        if (!(C[i].t === 'c' && C[i].s === 1)) continue;
        var have = deck.filter(function (x) { return x === i; }).length;
        while (have < own(i) && basics < 7) {
          // swap out a non-basic
          for (var j = deck.length - 1; j >= 0; j--) {
            if (!(C[deck[j]].t === 'c' && C[deck[j]].s === 1)) { deck.splice(j, 1); break; }
          }
          deck.push(i); have++; basics++;
        }
      }
    }
    return deck.slice(0, 20);
  }

  // ------------------------------------------------------------- packs
  function rollRarity(slot) {
    if (slot < 3) return 0;
    var r = Math.random();
    if (slot === 3) return r < 0.75 ? 1 : 2;
    return r < 0.50 ? 0 : (r < 0.82 ? 1 : 2);
  }
  function openPack() {
    var p = { cards: [], isNew: [], dupe: [], rev: 0 };
    for (var i = 0; i < 5; i++) {
      var rar = rollRarity(i);
      var pool = D.BY_RAR[rar];
      var id = pool[Math.floor(Math.random() * pool.length)];
      var have = A.save.col[id] || 0;
      p.cards.push(id);
      if (have >= 2) { p.dupe.push(true); p.isNew.push(false); A.save.credits = Math.min(9999, A.save.credits + 1); }
      else { p.dupe.push(false); p.isNew.push(have === 0); A.save.col[id] = have + 1; }
    }
    A.save.packs = Math.max(0, A.save.packs - 1);
    A.pack = p;
    A.screen = 'pack';
    save();
    sfx('pack');
  }

  // ------------------------------------------------------------- audio
  var actx = null, master = null;
  function audioInit() {
    if (actx) return;
    try {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return;
      actx = new AC();
      master = actx.createGain();
      master.gain.value = 0.22;
      master.connect(actx.destination);
    } catch (e) { actx = null; }
  }
  function tone(f, dur, type, vol, slide) {
    if (!actx || actx.state !== 'running') return;
    try {
      var o = actx.createOscillator(), g = actx.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(f, actx.currentTime);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), actx.currentTime + dur);
      g.gain.setValueAtTime(0.0001, actx.currentTime);
      g.gain.exponentialRampToValueAtTime(vol || 0.3, actx.currentTime + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
      o.connect(g); g.connect(master);
      o.start(); o.stop(actx.currentTime + dur + 0.02);
    } catch (e) { /* ignore */ }
  }
  function noise(dur, vol) {
    if (!actx || actx.state !== 'running') return;
    try {
      var len = Math.floor(actx.sampleRate * dur);
      var buf = actx.createBuffer(1, len, actx.sampleRate);
      var dta = buf.getChannelData(0);
      for (var i = 0; i < len; i++) dta[i] = (Math.random() * 2 - 1) * (1 - i / len);
      var src = actx.createBufferSource(); src.buffer = buf;
      var g = actx.createGain(); g.gain.value = vol || 0.25;
      src.connect(g); g.connect(master); src.start();
    } catch (e) { /* ignore */ }
  }
  // pending audio timers, all cancellable on restart/quit
  var timers = [];
  function arp(notes, gap, dur, type) {
    for (var i = 0; i < notes.length; i++) {
      (function (f, i2) {
        var id = root.setTimeout(function () {
          var p = timers.indexOf(id); if (p >= 0) timers.splice(p, 1);
          tone(f, dur, type, 0.26);
        }, i2 * gap);
        timers.push(id);
      })(notes[i], i);
    }
    while (timers.length > 24) root.clearTimeout(timers.shift());
  }
  function clearTimers() {
    for (var i = 0; i < timers.length; i++) root.clearTimeout(timers[i]);
    timers.length = 0;
  }
  function sfx(k) {
    switch (k) {
      case 'tap': tone(520, 0.05, 'square', 0.16); break;
      case 'place': tone(300, 0.09, 'triangle', 0.25, 460); break;
      case 'energy': tone(660, 0.08, 'sine', 0.3, 990); break;
      case 'hit': noise(0.18, 0.3); tone(140, 0.14, 'sawtooth', 0.25, 60); break;
      case 'ko': noise(0.4, 0.35); tone(200, 0.4, 'sawtooth', 0.3, 45); break;
      case 'evolve': tone(420, 0.1, 'triangle', 0.25, 700); tone(700, 0.14, 'sine', 0.2, 1000); break;
      case 'heal': tone(700, 0.12, 'sine', 0.22, 1150); break;
      case 'bad': tone(180, 0.12, 'square', 0.2, 110); break;
      case 'win': arp([523, 659, 784, 1046], 110, 0.2, 'triangle'); break;
      case 'lose': arp([400, 330, 262, 196], 130, 0.24, 'sawtooth'); break;
      case 'pack': arp([440, 660, 880], 80, 0.16, 'sine'); break;
    }
  }

  // ------------------------------------------------------------- particles
  function burst(x, y, n, col, spd) {
    for (var i = 0; i < n && A.parts.length < MAXP; i++) {
      var a = Math.random() * 6.283, s = (0.4 + Math.random()) * (spd || 140);
      A.parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, l: 0.5 + Math.random() * 0.4, L: 0.9, c: col, s: 2 + Math.random() * 4 });
    }
    while (A.parts.length > MAXP) A.parts.shift();
  }

  function slotXY(side, slot) {
    var L = U.LAY;
    var bw = (W - 24 - 16) / 3;
    if (slot < 0) {
      return side === 'p' ? { x: W / 2, y: L.pact.y + L.pact.h / 2 } : { x: W / 2, y: L.oact.y + L.oact.h / 2 };
    }
    var x = 12 + slot * (bw + 8) + bw / 2;
    return { x: x, y: (side === 'p' ? L.pbench.y : L.obench.y) + 26 };
  }

  function consumeFx() {
    var G = A.G;
    if (!G) return;
    while (G.fx.length) {
      var f = G.fx.shift();
      var p = slotXY(f.a, f.b === undefined ? -1 : f.b);
      switch (f.k) {
        case 'hit': burst(p.x, p.y, 14, '#ff8a5c', 200); A.shake = Math.min(14, 4 + f.b / 12); sfx('hit'); break;
        case 'benchhit': burst(p.x, p.y, 8, '#ffc07a', 150); sfx('hit'); break;
        case 'ko': burst(p.x, p.y, 26, '#ffd98a', 260); A.shake = 16; A.flash = 0.35; sfx('ko'); break;
        case 'heal': burst(p.x, p.y, 10, '#7ddc9a', 110); sfx('heal'); break;
        case 'energy': burst(p.x, p.y, 8, '#8fd0ff', 100); sfx('energy'); break;
        case 'place': burst(p.x, p.y, 8, '#c8d6e3', 90); sfx('place'); break;
        case 'evolve': burst(p.x, p.y, 18, '#ffe89a', 170); A.flash = 0.2; sfx('evolve'); break;
        case 'swap': burst(p.x, p.y, 8, '#9fe4ff', 110); sfx('place'); break;
        case 'handler': burst(W / 2, U.LAY.hand, 10, '#b39ff0', 120); sfx('tap'); break;
      }
    }
  }

  // ------------------------------------------------------------- flow
  function startBattle(rung) {
    clearInput();
    if (A.save.deck.length !== 20) A.save.deck = autoDeck(A.save);
    A.G = E.create(A.save.deck.slice(), rung);
    A.G.turn = 1;
    A.screen = 'battle';
    A.mode = null; A.sel = null; A.drag = null;
    A.parts.length = 0; A.shake = 0; A.flash = 0;
    A.aiTimer = 0.6; A.resultApplied = false;
    A.focus = -1;
  }

  function applyResult() {
    var G = A.G;
    if (A.resultApplied || !G.over) return;
    A.resultApplied = true;
    if (G.over === 1) {
      A.save.wins++;
      if (G.rung === A.save.rank) A.save.rank = Math.min(D.LADDER.length, A.save.rank + 1);
      if (A.save.wins % 2 === 0) A.save.packs = Math.min(99, A.save.packs + 1);
      sfx('win');
    } else sfx('lose');
    save();
  }

  function clearInput() {
    A.ptr = {}; A.keys = {}; A.drag = null; A.sel = null; A.mode = null;
    A.scroll = 0; A.focus = -1;
    clearTimers();
  }

  // ------------------------------------------------------------- actions
  function doAction(id, data) {
    var G = A.G, S = G ? G.p : null;
    switch (id) {
      case 'back':
        if (A.screen === 'deck') { if (A.save.deck.length !== 20) A.save.deck = autoDeck(A.save); save(); }
        A.screen = 'map'; A.scroll = 0; A.focus = -1; A.hint = ''; sfx('tap'); return;
      case 'fight': startBattle(data); sfx('tap'); return;
      case 'deck': A.screen = 'deck'; A.scroll = 0; A.focus = -1; sfx('tap'); return;
      case 'coll': A.screen = 'coll'; A.scroll = 0; A.focus = -1; sfx('tap'); return;
      case 'openpack': if (A.save.packs > 0) openPack(); return;
      case 'quit': A.screen = 'map'; A.G = null; clearInput(); sfx('tap'); return;

      // ---- pack
      case 'reveal':
        if (A.pack.rev <= data) { A.pack.rev = data + 1; sfx('place'); burst(W / 2, 300, 12, '#ffd98a', 160); }
        return;
      case 'revealall': A.pack.rev = 5; sfx('pack'); burst(W / 2, 300, 24, '#ffd98a', 200); return;
      case 'packdone':
        if (A.save.packs > 0) { openPack(); }
        else { A.screen = 'map'; A.pack = null; A.G = null; sfx('tap'); }
        return;

      // ---- collection
      case 'claim':
        if (A.save.credits >= D.CLAIM_COST && !(A.save.col[data] > 0)) {
          A.save.credits -= D.CLAIM_COST; A.save.col[data] = 1; save();
          A.hint = 'Claimed ' + C[data].n + '.';
          sfx('evolve'); burst(W / 2, H / 2, 16, '#ffd98a', 180);
        }
        return;

      // ---- deck builder
      case 'dplus': {
        var have = Math.min(2, A.save.col[data] || 0);
        var inD = A.save.deck.filter(function (x) { return x === data; }).length;
        if (inD < have && A.save.deck.length < 20) { A.save.deck.push(data); sfx('tap'); }
        return;
      }
      case 'dminus': {
        var idx = A.save.deck.lastIndexOf(data);
        if (idx >= 0) { A.save.deck.splice(idx, 1); sfx('tap'); }
        return;
      }
      case 'autodeck': A.save.deck = autoDeck(A.save); sfx('pack'); return;
      case 'deckdone': save(); A.screen = 'map'; A.focus = -1; sfx('tap'); return;

      // ---- battle
      case 'hand': {
        if (!G || G.over) return;
        var cid = S.hand[data];
        if (cid === undefined) return;
        if (!G.started) {
          // setup: only placing the active matters
          A.sel = (A.sel === data ? null : data); sfx('tap'); return;
        }
        if (G.who !== 'p' || G.await) { sfx('bad'); return; }
        if (C[cid].t === 'h' && !E.handlerNeedsTarget(C[cid].fx)) {
          if (E.playHandler(G, S, data)) { A.sel = null; A.mode = null; }
          else sfx('bad');
          return;
        }
        A.sel = (A.sel === data ? null : data);
        A.mode = A.sel === null ? null : 'sel';
        sfx('tap');
        return;
      }
      case 'pact': slotTap(-1); return;
      case 'pslot': slotTap(data); return;
      case 'atk':
        if (G && G.who === 'p' && !G.over && !G.await && E.canAttack(G, G.p, data)) {
          A.sel = null; A.mode = null;
          E.attack(G, G.p, data);
          A.aiTimer = 0.75;
        } else sfx('bad');
        return;
      case 'energy':
        A.mode = (A.mode === 'energy' ? null : 'energy'); A.sel = null; sfx('tap'); return;
      case 'retreat':
        A.mode = (A.mode === 'retreat' ? null : 'retreat'); A.sel = null; sfx('tap'); return;
      case 'end':
        if (G && G.who === 'p' && !G.over && !G.await) {
          A.sel = null; A.mode = null; E.endTurn(G); A.aiTimer = 0.7; sfx('tap');
        }
        return;
      case 'again':
        applyResult();
        if (G.over === 1) {
          if (A.save.packs > 0) { openPack(); return; }
          var next = Math.min(G.rung + 1, D.LADDER.length - 1);
          if (G.rung + 1 <= A.save.rank && G.rung + 1 < D.LADDER.length) startBattle(next);
          else { A.screen = 'map'; A.G = null; }
        } else startBattle(G.rung);
        return;
      case 'tomap':
        applyResult();
        A.screen = 'map'; A.G = null; clearInput();
        if (A.save.packs > 0) A.hint = 'You have ' + A.save.packs + ' pack(s) waiting.';
        return;
    }
  }

  function slotTap(slot) {
    var G = A.G;
    if (!G || G.over) return;
    var S = G.p, cr = E.evoTarget(S, slot);

    if (G.await === 'promote') {
      if (slot >= 0 && S.bench[slot]) {
        E.promote(G, slot);
        if (G.pendingEnd) { G.pendingEnd = false; E.endTurn(G); A.aiTimer = 0.7; }
        sfx('place');
      } else sfx('bad');
      return;
    }
    if (!G.started) {
      if (slot === -1 && A.sel !== null && E.placeActive(G, S, A.sel)) {
        A.sel = null;
        // auto-open: player may bench more before the first turn begins
        E.beginBattle(G);
        G.hint = 'Tap ENERGY then your creature, then tap an attack';
      } else sfx('bad');
      return;
    }
    if (G.who !== 'p') { sfx('bad'); return; }
    if (A.mode === 'energy') {
      if (E.attachEnergy(G, S, slot)) { A.mode = null; } else sfx('bad');
      return;
    }
    if (A.mode === 'retreat') {
      if (slot >= 0 && E.retreat(G, S, slot, false)) { A.mode = null; } else sfx('bad');
      return;
    }
    if (A.sel !== null) {
      var cid = S.hand[A.sel];
      if (cid === undefined) { A.sel = null; return; }
      var ok = false;
      if (C[cid].t === 'h') {
        ok = E.playHandler(G, S, A.sel, slot);
      } else if (cr) {
        ok = E.evolve(G, S, A.sel, slot);
      } else if (slot === -1) {
        ok = E.placeActive(G, S, A.sel);
      } else {
        ok = E.placeBench(G, S, A.sel, slot);
      }
      if (ok) { A.sel = null; A.mode = null; } else sfx('bad');
      return;
    }
    sfx('tap');
  }

  // ------------------------------------------------------------- input
  function toLocal(cx, cy) {
    var r = A.canvas.getBoundingClientRect();
    return { x: (cx - r.left) / A.sc, y: (cy - r.top) / A.sc };
  }
  function hit(x, y) {
    var R = U.regions();
    for (var i = R.length - 1; i >= 0; i--) {
      var g = R[i];
      if (g.dis) continue;
      if (x >= g.x && x <= g.x + g.w && y >= g.y && y <= g.y + g.h) return g;
    }
    return null;
  }

  function onDown(e) {
    if (A.paused || A.hidden || document.hidden) return;
    audioUnlock();
    var pid = e.pointerId === undefined ? 'm' : e.pointerId;
    var p = toLocal(e.clientX, e.clientY);
    var g = hit(p.x, p.y);
    A.ptr[pid] = { x: p.x, y: p.y, sx: p.x, sy: p.y, g: g, moved: false, scroll: false, s0: A.scroll };
    if (!g && (A.screen === 'coll' || A.screen === 'deck')) A.ptr[pid].scroll = true;
    if (g && g.id === 'deckrow') A.ptr[pid].scroll = true;
    if (Object.keys(A.ptr).length > 8) { // cap pointer map
      var ks = Object.keys(A.ptr);
      delete A.ptr[ks[0]];
    }
  }
  function onMove(e) {
    var pid = e.pointerId === undefined ? 'm' : e.pointerId;
    var st = A.ptr[pid];
    if (!st) return;
    var p = toLocal(e.clientX, e.clientY);
    var dx = p.x - st.sx, dy = p.y - st.sy;
    if (Math.abs(dx) + Math.abs(dy) > 8) st.moved = true;
    st.x = p.x; st.y = p.y;
    if (st.scroll) {
      A.scroll = Math.max(0, Math.min(U.scrollMax(), st.s0 - (p.y - st.sy)));
      return;
    }
    if (st.g && st.g.id === 'hand' && st.moved && A.screen === 'battle') {
      if (!A.drag) { A.drag = { idx: st.g.data, x: p.x, y: p.y, pid: pid }; A.sel = st.g.data; A.mode = 'sel'; }
    }
    if (A.drag && A.drag.pid === pid) { A.drag.x = p.x; A.drag.y = p.y; }
  }
  function onUp(e) {
    var pid = e.pointerId === undefined ? 'm' : e.pointerId;
    var st = A.ptr[pid];
    delete A.ptr[pid];
    if (!st || A.paused || A.hidden || document.hidden) { if (A.drag && A.drag.pid === pid) A.drag = null; return; }
    if (A.drag && A.drag.pid === pid) {
      var g = hit(A.drag.x, A.drag.y);
      A.drag = null;
      if (g && (g.id === 'pslot' || g.id === 'pact')) {
        A.sel = st.g.data;
        slotTap(g.id === 'pact' ? -1 : g.data);
      } else if (g && g.id === 'atk') {
        A.sel = null; A.mode = null; doAction('atk', g.data);
      } else { A.sel = null; A.mode = null; }
      return;
    }
    if (st.scroll || st.moved) return;
    var g2 = hit(st.x, st.y);
    if (g2 && st.g && g2.id === st.g.id) doAction(g2.id, g2.data);
    else if (g2) doAction(g2.id, g2.data);
  }
  function onCancel(e) {
    var pid = e.pointerId === undefined ? 'm' : e.pointerId;
    if (A.drag && A.drag.pid === pid) A.drag = null;
    delete A.ptr[pid];
  }

  // keyboard
  function focusables() {
    var R = U.regions(), out = [];
    for (var i = 0; i < R.length; i++) if (!R[i].dis) out.push(i);
    return out;
  }
  function moveFocus(dx, dy) {
    var R = U.regions(), f = focusables();
    if (!f.length) return;
    if (A.focus < 0 || A.focus >= R.length || R[A.focus].dis) { A.focus = f[0]; return; }
    var cur = R[A.focus];
    var cx = cur.x + cur.w / 2, cy = cur.y + cur.h / 2;
    var best = -1, bd = 1e9;
    for (var i = 0; i < f.length; i++) {
      var g = R[f[i]];
      if (f[i] === A.focus) continue;
      var gx = g.x + g.w / 2, gy = g.y + g.h / 2;
      var vx = gx - cx, vy = gy - cy;
      if (dx && Math.sign(vx) !== Math.sign(dx)) continue;
      if (dy && Math.sign(vy) !== Math.sign(dy)) continue;
      if (dx && Math.abs(vx) < 4) continue;
      if (dy && Math.abs(vy) < 4) continue;
      var d = dx ? Math.abs(vx) + Math.abs(vy) * 3 : Math.abs(vy) + Math.abs(vx) * 3;
      if (d < bd) { bd = d; best = f[i]; }
    }
    if (best >= 0) A.focus = best;
    else if (dy && U.scrollMax() > 0) A.scroll = Math.max(0, Math.min(U.scrollMax(), A.scroll + dy * 70));
  }
  function onKey(e) {
    if (A.paused || A.hidden || document.hidden) { e.preventDefault(); return; }
    if (A.keys[e.key]) { /* held */ }
    A.keys[e.key] = 1;
    audioUnlock();
    A.kb = true;
    var k = e.key;
    if (k === 'ArrowLeft') { moveFocus(-1, 0); e.preventDefault(); }
    else if (k === 'ArrowRight') { moveFocus(1, 0); e.preventDefault(); }
    else if (k === 'ArrowUp') { moveFocus(0, -1); e.preventDefault(); }
    else if (k === 'ArrowDown') { moveFocus(0, 1); e.preventDefault(); }
    else if (k === 'Enter' || k === ' ') {
      e.preventDefault();
      var R = U.regions();
      if (A.focus >= 0 && A.focus < R.length && !R[A.focus].dis) doAction(R[A.focus].id, R[A.focus].data);
    } else if (k === 'Escape') {
      e.preventDefault();
      if (A.screen === 'battle') doAction('quit');
      else if (A.screen !== 'map') doAction('back');
    }
  }
  function onKeyUp(e) { delete A.keys[e.key]; }

  function onBlur() {
    A.ptr = {}; A.drag = null; A.keys = {};
    clearTimers();
  }

  // ------------------------------------------------------------- loop
  var last = 0;
  function frame(ts) {
    root.requestAnimationFrame(frame);
    var dt = Math.min(0.05, (ts - last) / 1000 || 0);
    last = ts;
    if (!A.paused) update(dt);
    render();
  }

  function update(dt) {
    A.shake = Math.max(0, A.shake - dt * 40);
    A.flash = Math.max(0, A.flash - dt * 1.6);
    for (var i = A.parts.length - 1; i >= 0; i--) {
      var p = A.parts[i];
      p.l -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 420 * dt;
      if (p.l <= 0) A.parts.splice(i, 1);
    }
    if (A.parts.length > MAXP) A.parts.splice(0, A.parts.length - MAXP);

    var G = A.G;
    if (A.screen === 'battle' && G) {
      consumeFx();
      if (G.over) { applyResult(); return; }
      if (G.started && G.who === 'o' && !G.await) {
        A.aiTimer -= dt;
        if (A.aiTimer <= 0) {
          var more = E.aiStep(G);
          A.aiTimer = more ? 0.45 : 0.5;
        }
      }
      if (G.who === 'p' && G.started && !G.over && !G.hintSet) {
        // rolling hint
        if (!G.p.active) G.hint = 'Drag a creature card onto your ACTIVE slot';
        else if (G.p.energyLeft > 0) G.hint = 'Tap ENERGY then a creature, then tap an attack';
        else G.hint = 'Tap an attack, or END TURN';
      }
    }
  }

  function render() {
    var c = A.ctx;
    c.setTransform(A.dpr * A.sc0, 0, 0, A.dpr * A.sc0, 0, 0);
    c.clearRect(0, 0, W, H);
    U.draw(A);
  }

  // ------------------------------------------------------------- resize
  function resize() {
    var cw = root.innerWidth, ch = root.innerHeight;
    var sc = Math.min(cw / W, ch / H);
    A.sc = sc;
    var dpr = Math.min(root.devicePixelRatio || 1, 2);
    // cap backing store long axis at ~960
    var backH = H * sc * dpr;
    if (backH > 960) dpr = Math.max(0.25, dpr * (960 / backH));
    A.dpr = dpr;
    A.sc0 = sc;
    A.canvas.width = Math.round(W * sc * dpr);
    A.canvas.height = Math.round(H * sc * dpr);
    A.canvas.style.width = (W * sc) + 'px';
    A.canvas.style.height = (H * sc) + 'px';
    checkOrient();
  }

  function checkOrient() {
    var land = root.innerWidth > root.innerHeight && root.innerHeight < 520;
    var el = document.getElementById('rotate');
    if (!el) return;
    el.style.display = land ? 'flex' : 'none';
    A.paused = land || A.hidden;
    if (land) { A.ptr = {}; A.drag = null; A.keys = {}; }
    else last = 0;
  }

  // ------------------------------------------------------------- boot
  var unlocked = false;
  function audioUnlock() {
    if (unlocked) return;
    unlocked = true;
    audioInit();
    if (actx && actx.state === 'suspended') { try { actx.resume(); } catch (e) { } }
  }

  function boot() {
    A.canvas = document.getElementById('game');
    A.ctx = A.canvas.getContext('2d', { alpha: false });
    A.sc0 = 1;
    A.save = load();
    A.screen = 'map';
    resize();

    var cv = A.canvas;
    cv.addEventListener('pointerdown', function (e) { e.preventDefault(); onDown(e); }, { passive: false });
    cv.addEventListener('pointermove', function (e) { e.preventDefault(); onMove(e); }, { passive: false });
    root.addEventListener('pointerup', function (e) { onUp(e); }, { passive: false });
    cv.addEventListener('pointercancel', onCancel);
    cv.addEventListener('touchstart', function (e) { e.preventDefault(); }, { passive: false });
    cv.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    root.addEventListener('keydown', onKey);
    root.addEventListener('keyup', onKeyUp);
    root.addEventListener('blur', onBlur);
    root.addEventListener('resize', resize);
    root.addEventListener('orientationchange', function () { setTimeout(resize, 120); });
    document.addEventListener('visibilitychange', function () {
      A.hidden = document.hidden;
      if (A.hidden) onBlur();
      A.paused = A.hidden || root.innerWidth > root.innerHeight && root.innerHeight < 520;
      if (!A.hidden) last = 0;
    });

    var start = document.getElementById('start');
    var go = function () {
      if (A.paused || A.hidden || document.hidden) return;
      audioUnlock();
      if (start && start.parentNode) start.parentNode.removeChild(start);
      document.removeEventListener('pointerdown', go);
      document.removeEventListener('keydown', go);
    };
    document.addEventListener('pointerdown', go);
    document.addEventListener('keydown', go);

    root.requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
