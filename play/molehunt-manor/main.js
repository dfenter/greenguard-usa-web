/* Molehunt Manor - boot, loop, input, state. */
(function () {
  'use strict';
  var MH = (window.MH = window.MH || {});
  var VW = 390, VH = 700;

  var cv = document.getElementById('cv');
  var ctx = cv.getContext('2d', { alpha: false });
  MH.setCtx(ctx);
  var rot = document.getElementById('rot');

  var G = MH.G = {
    screen: 'start', tab: 0, focus: 0, sel: -1, logRound: 0,
    hint: '', t: 0, modal: null, c: null,
    shake: 0, flash: 0, flashCol: '#fff', parts: [],
    paused: false, hitCount: 0
  };

  var pointers = {};       // pointerId -> {idx, x, y}
  var keys = {};
  var timers = [];

  /* ---------------- storage ---------------- */
  var KEY = 'molehunt.manor.v1';
  function load() {
    var d = { best: [0, 0, 0], cases: [] };
    try {
      var raw = window.localStorage.getItem(KEY);
      if (!raw) return d;
      var o = JSON.parse(raw);
      if (!o || typeof o !== 'object') return d;
      if (Object.prototype.toString.call(o.best) === '[object Array]') {
        for (var i = 0; i < 3; i++) {
          var v = o.best[i];
          d.best[i] = (typeof v === 'number' && isFinite(v) && v > 0 && v <= 99) ? (v | 0) : 0;
        }
      }
      if (Object.prototype.toString.call(o.cases) === '[object Array]') {
        for (var k = 0; k < o.cases.length && d.cases.length < 8; k++) {
          var r = o.cases[k];
          if (!r || typeof r !== 'object') continue;
          if (typeof r.d !== 'number' || !(r.d >= 0 && r.d < 3)) continue;
          if (typeof r.r !== 'number' || !isFinite(r.r) || r.r < 1 || r.r > 99) continue;
          d.cases.push({ w: !!r.w, d: r.d | 0, r: r.r | 0 });
        }
      }
    } catch (e) { /* ignore */ }
    return d;
  }
  function save(d) {
    try {
      while (d.cases.length > 8) d.cases.pop();
      window.localStorage.setItem(KEY, JSON.stringify(d));
    } catch (e) { /* ignore */ }
  }
  var store = load();
  MH.records = function () { return store.cases; };
  MH.best = function () {
    var out = [], i;
    for (i = 0; i < 3; i++) if (store.best[i] > 0) out.push(MH.DIFFS[i].n + ' ' + store.best[i] + 'r');
    return out.length ? 'BEST: ' + out.join('  ·  ') : '';
  };

  /* ---------------- timers ---------------- */
  MH.later = function (fn, ms) {
    var id = window.setTimeout(function () {
      var i = timers.indexOf(id); if (i >= 0) timers.splice(i, 1);
      fn();
    }, ms);
    timers.push(id);
    return id;
  };
  function clearTimers() {
    for (var i = 0; i < timers.length; i++) window.clearTimeout(timers[i]);
    timers.length = 0;
  }

  /* ---------------- input reset ---------------- */
  function clearHeldInput() {
    var k;
    for (k in pointers) if (Object.prototype.hasOwnProperty.call(pointers, k)) delete pointers[k];
    for (k in keys) if (Object.prototype.hasOwnProperty.call(keys, k)) delete keys[k];
  }
  function resetInput() {
    clearHeldInput();
    clearTimers();
  }

  /* ---------------- juice ---------------- */
  function shake(a) { G.shake = Math.min(14, G.shake + a); }
  function flash(col, a) { G.flash = Math.max(G.flash, a); G.flashCol = col; }
  function burst(x, y, col, n) {
    for (var i = 0; i < n; i++) {
      if (G.parts.length >= 120) G.parts.shift();
      var a = Math.random() * 6.283, s = 40 + Math.random() * 160;
      G.parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, l: 0.5 + Math.random() * 0.5, m: 1, c: col });
    }
  }

  /* ---------------- game control ---------------- */
  function newGame(diff) {
    resetInput();
    G.c = MH.newCase(diff, (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);
    G.screen = 'play'; G.tab = 0; G.focus = 0; G.sel = -1;
    G.logRound = 0; G.modal = null; G.parts.length = 0;
    G.shake = 0; G.flash = 0;
    MH.audio.play('round');
  }

  function finish() {
    var c = G.c;
    var used = Math.min(MH.ROUNDS, c.round + (c.over === 1 ? 1 : 0));
    store.cases.unshift({ w: c.over === 1, d: c.diff, r: used });
    while (store.cases.length > 8) store.cases.pop();
    if (c.over === 1 && (store.best[c.diff] === 0 || used < store.best[c.diff])) store.best[c.diff] = used;
    save(store);
    G.screen = 'over'; G.focus = 0; G.modal = null;
    MH.audio.play(c.over === 1 ? 'win' : 'lose');
    flash(c.over === 1 ? '#4fe08c' : '#ff5f6d', 0.55);
    shake(c.over === 1 ? 6 : 12);
  }

  function checkOver() { if (G.c && G.c.over && G.screen === 'play') MH.later(finish, 420); }

  function showModal(title, lines, col, btn) {
    G.modal = { title: title, lines: lines, col: col, btn: btn || 'CLOSE' };
    G.focus = 0;
    MH.audio.play('open');
  }
  function L(t, c, b) { return { t: t, c: c, b: b }; }
  function wrapLines(text, col) {
    var ls = MH.wrap(text, 300, MH.F(500, 13)), out = [], i;
    for (i = 0; i < ls.length && i < 7; i++) out.push(L(ls[i], col));
    return out;
  }

  function doObserve(room) {
    var c = G.c;
    var res = MH.observe(c, room);
    if (!res) { MH.audio.play('close'); return; }
    var R = MH.roomRect(room);
    if (res.hit) {
      MH.audio.play('lie'); shake(8); flash('#ff5f6d', 0.35);
      burst(R.x + R.w / 2, R.y + R.h / 2, '#ff5f6d', 22);
    } else {
      MH.audio.play('look');
      burst(R.x + R.w / 2, R.y + R.h / 2, '#63b4ff', 10);
    }
    var lines = [], i;
    if (!res.rows.length) lines.push(L('Not a soul in there.', MH.C.dim));
    for (i = 0; i < res.rows.length && i < 6; i++) {
      var r = res.rows[i];
      lines.push(L(MH.fitText(MH.STAFF[r.id], 300, MH.F(700, 13)), r.kind === 2 ? MH.C.red : MH.C.green, true));
      var sub = MH.wrap(r.t, 300, MH.F(500, 12));
      lines.push(L(sub[0] + (sub.length > 1 ? ' ' + sub[1] : ''), MH.C.dim));
    }
    showModal((res.hit ? '⚑ ' : '') + MH.ROOMS[room].n.toUpperCase() + ' — WATCHED',
      lines, res.hit ? MH.C.red : MH.C.blue, 'NOTED');
  }

  function doQuestion(id) {
    var c = G.c, i;
    var W0 = MH.world(c);
    var asked = false;
    for (i = 0; i < c.stmts.length; i++) if (c.stmts[i].r === c.round && c.stmts[i].sp === id) asked = true;
    if (asked || c.qLeft <= 0 || W0.place[id] < 0 || c.over) { dossier(id); return; }
    var st = MH.question(c, id);
    if (!st) { dossier(id); return; }
    var lines = wrapLines('"' + st.line + '"', MH.C.ink);
    lines.push(L('', MH.C.dim));
    if (st.conf.length) {
      lines.push(L('THE LOG DISAGREES', MH.C.brass, true));
      for (i = 0; i < st.conf.length && i < 3; i++) {
        var q = st.conf[i];
        var claimed = W0.claim[q] >= 0 ? MH.ROOMS[W0.claim[q]].n : 'nowhere';
        lines.push(L(MH.fitText(MH.STAFF[q] + ' is posted to ' + claimed, 300, MH.F(500, 12)), MH.C.dim));
      }
      MH.audio.play('clue'); flash('#f0c064', 0.2);
    } else {
      lines.push(L('Nothing in the log contradicts this.', MH.C.dim));
      MH.audio.play('tap');
    }
    showModal(MH.STAFF[id].toUpperCase() + ' SAYS', lines, MH.C.green, 'NOTED');
  }

  function dossier(id) {
    var c = G.c, sts = MH.statementsFor(c, id), lines = [], i;
    var si = MH.statusInfo(c, id);
    lines.push(L(si.t + (c.conf[id] ? '  ·  ' + c.conf[id] + ' conflicts' : ''), si.c, true));
    if (!sts.length) lines.push(L('No statement taken yet.', MH.C.dim));
    for (i = Math.max(0, sts.length - 2); i < sts.length; i++) {
      lines.push(L('Round ' + (sts[i].r + 1) + ':', MH.C.brass));
      var ws = MH.wrap('"' + sts[i].line + '"', 300, MH.F(500, 12)), k;
      for (k = 0; k < ws.length && k < 3; k++) lines.push(L(ws[k], MH.C.dim));
    }
    showModal(MH.STAFF[id].toUpperCase(), lines, MH.C.blue, 'CLOSE');
  }

  function doAccuse() {
    var c = G.c, id = G.sel;
    if (id < 0) return;
    var res = MH.accuse(c, id);
    if (!res) { MH.audio.play('close'); return; }
    G.sel = -1;
    if (res.ok) {
      MH.audio.play('catch_'); shake(10); flash('#4fe08c', 0.4);
      burst(VW / 2, 300, '#4fe08c', 30);
      if (!res.win) {
        showModal('MOLE DETAINED', [L(MH.STAFF[id] + ' was a mole.', MH.C.green, true),
          L('One is still loose in the house.', MH.C.dim)], MH.C.green, 'KEEP HUNTING');
      }
    } else {
      MH.audio.play('wrong'); shake(12); flash('#ff5f6d', 0.4);
      if (!c.over) {
        showModal('WRONG NAME', [L(MH.STAFF[id] + ' is innocent — and now cleared.', MH.C.red, true),
          L('The round is gone. Sabotage advances.', MH.C.dim)], MH.C.red, 'DAMN');
        G.tab = 0;
      }
    }
    checkOver();
  }

  function endRound() {
    var c = G.c;
    MH.endRound(c, false);
    if (!c.over) {
      MH.audio.play('alarm');
      flash('#f0c064', 0.22);
      G.tab = 0; G.logRound = c.round; G.sel = -1;
    }
    checkOver();
  }

  function act(a) {
    if (!a) return;
    MH.audio.unlock();
    switch (a.t) {
      case 'start': newGame(a.v); break;
      case 'again': newGame(G.c ? G.c.diff : 0); break;
      case 'tab':
        if (G.tab !== a.v) { G.tab = a.v; G.focus = 0; MH.audio.play('tap'); }
        if (a.v === 2) G.logRound = G.c.round;
        break;
      case 'obs': doObserve(a.v); break;
      case 'staff': doQuestion(a.v); break;
      case 'sel': G.sel = (G.sel === a.v ? -1 : a.v); MH.audio.play('tap'); break;
      case 'accuse': doAccuse(); break;
      case 'end': endRound(); break;
      case 'logr':
        G.logRound = Math.max(0, Math.min(G.c.round, G.logRound + a.v));
        MH.audio.play('move');
        break;
      case 'closeModal': G.modal = null; G.focus = 0; MH.audio.play('close'); break;
      default: break;
    }
  }

  /* ---------------- pointer ---------------- */
  function toLocal(e) {
    var r = cv.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / r.width * VW,
      y: (e.clientY - r.top) / r.height * VH
    };
  }
  function findHit(p) {
    for (var i = MH.hits.length - 1; i >= 0; i--) {
      var h = MH.hits[i];
      if (p.x >= h.x && p.x <= h.x + h.w && p.y >= h.y && p.y <= h.y + h.h) return i;
    }
    return -1;
  }
  function onDown(e) {
    e.preventDefault();
    MH.audio.unlock();
    if (G.paused) return;
    var p = toLocal(e), i = findHit(p);
    pointers[e.pointerId] = { idx: i, x: p.x, y: p.y };
    if (i >= 0) G.focus = i;
  }
  function onUp(e) {
    e.preventDefault();
    var d = pointers[e.pointerId];
    delete pointers[e.pointerId];
    if (!d || G.paused) return;
    var p = toLocal(e), i = findHit(p);
    if (i >= 0 && i === d.idx) act(MH.hits[i].a);
  }
  function onCancel(e) { delete pointers[e.pointerId]; }

  cv.addEventListener('pointerdown', onDown, { passive: false });
  cv.addEventListener('pointerup', onUp, { passive: false });
  cv.addEventListener('pointercancel', onCancel, { passive: false });
  cv.addEventListener('pointerleave', onCancel, { passive: false });
  cv.addEventListener('touchstart', function (e) { e.preventDefault(); }, { passive: false });
  cv.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
  cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  window.addEventListener('blur', function () { resetInput(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) { clearHeldInput(); G.paused = true; } else resize(); });

  /* ---------------- keyboard ---------------- */
  window.addEventListener('keydown', function (e) {
    var k = e.key;
    if (k === 'Tab') return;
    MH.audio.unlock();
    if (G.paused) return;
    keys[k] = 1;
    var n = MH.hits.length;
    if (!n) return;
    if (k === 'ArrowRight' || k === 'ArrowDown') {
      G.focus = (G.focus + 1) % n; MH.audio.play('move'); e.preventDefault();
    } else if (k === 'ArrowLeft' || k === 'ArrowUp') {
      G.focus = (G.focus - 1 + n) % n; MH.audio.play('move'); e.preventDefault();
    } else if (k === 'Enter' || k === ' ') {
      if (G.focus >= 0 && G.focus < n) act(MH.hits[G.focus].a);
      e.preventDefault();
    } else if (k === 'Escape' || k === 'Backspace') {
      if (G.modal) { G.modal = null; G.focus = 0; MH.audio.play('close'); }
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', function (e) { delete keys[e.key]; });

  /* ---------------- sizing ---------------- */
  function resize() {
    var vw = window.innerWidth, vh = window.innerHeight;
    var land = vw > vh;
    if (rot) rot.style.display = land ? 'flex' : 'none';
    G.paused = land || document.hidden;
    if (land) { clearHeldInput(); return; }
    var scale = Math.min(vw / VW, vh / VH);
    var cw = Math.round(VW * scale), ch = Math.round(VH * scale);
    cv.style.width = cw + 'px';
    cv.style.height = ch + 'px';
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var maxLong = 960;
    if (ch * dpr > maxLong) dpr = maxLong / ch;
    var bw = Math.max(1, Math.round(cw * dpr)), bh = Math.max(1, Math.round(ch * dpr));
    if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
    G.scaleX = bw / VW; G.scaleY = bh / VH;
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', function () { MH.later(resize, 120); });

  /* ---------------- hint ---------------- */
  function hintFor() {
    var c = G.c;
    if (!c) return '';
    if (c.obsLeft > 0 && G.tab === 0) {
      var W0 = MH.world(c);
      return W0.alert
        ? 'Watch a room in a red-flagged wing — the saboteur is there, and lying about it.'
        : 'Alarm is dead: watch rooms and see who is missing from their post.';
    }
    if (c.qLeft > 0 && G.tab === 1) return 'Tap a name to take a statement, then check it against the log.';
    if (G.tab === 2) return 'LIE = proven. ⚑ = their alibi clashes with the log.';
    if (G.tab === 3) return 'EXPOSED means proven by your own eyes. Name them.';
    if (c.obsLeft + c.qLeft === 0) return 'Out of actions — accuse, or end the round.';
    return 'Observe rooms, question staff, cross-check the task log.';
  }

  /* ---------------- draw ---------------- */
  function draw(dt) {
    var i;
    ctx.setTransform(G.scaleX || 1, 0, 0, G.scaleY || 1, 0, 0);
    ctx.fillStyle = MH.C.bg;
    ctx.fillRect(0, 0, VW, VH);
    MH.hits.length = 0;
    MH.lockHits = false;

    var sx = 0, sy = 0;
    if (G.shake > 0.2) {
      sx = (Math.random() * 2 - 1) * G.shake;
      sy = (Math.random() * 2 - 1) * G.shake;
    }
    ctx.save();
    ctx.translate(sx, sy);

    if (G.screen === 'start') {
      MH.startScreen(G);
    } else if (G.screen === 'over') {
      MH.overScreen(G);
    } else {
      G.hint = hintFor();
      if (G.modal) MH.lockHits = true;
      MH.header(G);
      if (G.tab === 0) MH.floorTab(G);
      else if (G.tab === 1) MH.staffTab(G);
      else if (G.tab === 2) MH.logTab(G);
      else MH.accuseTab(G);
      MH.bottom(G);
      if (G.modal) { MH.lockHits = false; MH.modal(G); }
    }

    // particles
    for (i = G.parts.length - 1; i >= 0; i--) {
      var p = G.parts[i];
      p.l -= dt;
      if (p.l <= 0) { G.parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 480 * dt;
      ctx.globalAlpha = Math.max(0, Math.min(1, p.l * 1.6));
      ctx.fillStyle = p.c;
      ctx.fillRect(p.x - 2.5, p.y - 2.5, 5, 5);
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    if (G.flash > 0.01) {
      ctx.globalAlpha = Math.min(0.7, G.flash);
      ctx.fillStyle = G.flashCol;
      ctx.fillRect(0, 0, VW, VH);
      ctx.globalAlpha = 1;
    }
    if (G.focus >= MH.hits.length) G.focus = MH.hits.length ? MH.hits.length - 1 : 0;
  }

  /* ---------------- loop ---------------- */
  var last = 0;
  function frame(ts) {
    window.requestAnimationFrame(frame);
    if (!last) last = ts;
    var dt = (ts - last) / 1000;
    last = ts;
    if (dt > 0.05) dt = 0.05;
    if (dt < 0) dt = 0;
    if (G.paused) { return; }
    G.t += dt;
    G.shake *= Math.pow(0.02, dt);
    G.flash *= Math.pow(0.015, dt);
    draw(dt);
  }

  resize();
  G.c = MH.newCase(0, (Date.now() ^ 0x9e3779b9) >>> 0); // placeholder so draw is safe
  G.screen = 'start';
  window.requestAnimationFrame(frame);
})();
