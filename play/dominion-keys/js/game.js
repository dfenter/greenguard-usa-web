/* Dominion Keys - shell, rendering, input, progression */
(function (root) {
  'use strict';
  var S = root.DKSim, GEN = root.DKGen, LV = root.DKLevels, AU = root.DKAudio;

  var DW = 390, DH = 700;                 // design space
  var CELL = 23, BX = 46, BY = 88;        // board origin
  var BW = S.W * CELL, BH = S.H * CELL;

  var canvas, ctx, view = { s: 1, rect: null };
  var G = {
    screen: 'boot',      // boot | play | kingdom
    over: null,          // null | 'win' | 'fail' | 'crown'
    level: 0, st: null, target: 0, pulls: 0,
    pins: [], sel: 0, settled: true,
    acc: 0, shake: 0, flash: 0, time: 0, overT: 0,
    parts: [], anims: [], paused: !!root.document.hidden, rotate: root.innerWidth > root.innerHeight * 1.12,
    hint: '', banner: '', bannerT: 0
  };
  var save = { done: [], best: [] };
  var timers = [];
  var pointers = {};       // pointerId -> {kind, id, x0, y0, moved}
  var keys = {};

  // ---------- persistence (guarded) ----------
  var KEY = 'dominionKeys.v2';
  function loadSave() {
    var d = { done: [], best: [] }, i;
    for (i = 0; i < 30; i++) { d.done.push(0); d.best.push(0); }
    try {
      var raw = root.localStorage ? root.localStorage.getItem(KEY) : null;
      if (typeof raw === 'string' && raw.length && raw.length < 4000) {
        var o = JSON.parse(raw);
        if (o && typeof o === 'object') {
          if (typeof o.d === 'string' && o.d.length === 30)
            for (i = 0; i < 30; i++) d.done[i] = o.d.charAt(i) === '1' ? 1 : 0;
          if (Object.prototype.toString.call(o.b) === '[object Array]')
            for (i = 0; i < 30; i++) {
              var v = o.b[i];
              d.best[i] = (typeof v === 'number' && isFinite(v) && v > 0 && v < 100) ? (v | 0) : 0;
            }
        }
      }
    } catch (e) { }
    return d;
  }
  function writeSave() {
    try {
      if (!root.localStorage) return;
      root.localStorage.setItem(KEY, JSON.stringify({ d: save.done.join(''), b: save.best }));
    } catch (e) { }
  }

  function clearTimers() { for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]); timers.length = 0; }

  // ---------- level setup ----------
  function descOf(i) {
    var L = LV[i], r = [], m = [], k;
    for (k = 0; k < L.r.length; k++) {
      var a = L.r[k];
      r.push({ id: a[0], cx: a[1], py: a[2], anchor: a[3], mat: a[4], count: a[5] });
    }
    for (k = 0; k < L.m.length; k++) {
      var b = L.m[k];
      m.push({ x: b[0], y: b[1], d: b[2], len: b[3], noShaft: b[4] });
    }
    return { res: r, ramps: m };
  }

  function startLevel(i) {
    clearTimers();
    resetInput();
    G.level = i;
    var d = descOf(i);
    G.st = GEN.buildDesc(d);
    G.st.events = null;
    S.settle(G.st, 220);            // same starting point the solver validated
    for (var h = 0; h < 8; h++) G.st.hist[h] = 0;
    G.st.hi = 0;
    G.st.events = [];
    G.target = LV[i].t;
    G.pulls = 0; G.settled = true; G.over = null; G.overT = 0; G.checked = false;
    G.parts.length = 0; G.anims.length = 0; G.acc = 0; G.shake = 0; G.flash = 0;
    G.pins = [];
    for (var k = 0; k < d.res.length; k++) {
      var r = d.res[k], cells = [], x;
      for (x = r.x0; x <= r.x1; x++) if (G.st.pins[r.py * S.W + x] === r.id) cells.push(x);
      if (!cells.length) continue;
      G.pins.push({
        id: r.id, py: r.py, anchor: r.anchor, mat: r.mat,
        lo: Math.min.apply(null, cells), hi: Math.max.apply(null, cells),
        out: 0, t: 0
      });
    }
    G.pins.sort(function (a, b) { return a.py - b.py || a.anchor - b.anchor; });
    G.sel = 0;
    G.screen = 'play';
    var wing = (i / 10) | 0;
    G.hint = i === 0
      ? 'Drag a key out: treasure to Rell, lava to the side pits.'
      : wing === 0 ? 'Order matters. A wrong key loses the treasure.'
        : wing === 1 ? 'Water freezes lava into stone. Time it.'
          : 'Marshgas turns to fire the moment lava touches it.';
  }

  function nextUnsolved() {
    for (var i = 0; i < 30; i++) if (!save.done[i]) return i;
    return 29;
  }
  function unlocked(i) { return i === 0 || !!save.done[i - 1]; }

  // ---------- particles ----------
  function spark(x, y, n, col, spd, life) {
    for (var i = 0; i < n; i++) {
      if (G.parts.length >= 220) break;
      var a = Math.random() * Math.PI * 2, s = spd * (0.4 + Math.random() * 0.8);
      G.parts.push({
        x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - spd * 0.3,
        l: life * (0.6 + Math.random() * 0.6), m: life, c: col, r: 1.5 + Math.random() * 2
      });
    }
  }
  function cellPx(x, y) { return [BX + (x + 0.5) * CELL, BY + (y + 0.5) * CELL]; }

  function handleEvents(st) {
    var e = st.events, i;
    if (!e || !e.length) return;
    for (i = 0; i < e.length; i += 3) {
      var t = e[i], p = cellPx(e[i + 1], e[i + 2]);
      if (t === 1) { spark(p[0], p[1], 6, '#ffd34d', 90, 0.5); AU.play('coin', st.collected); G.flash = Math.max(G.flash, 0.18); }
      else if (t === 2) { spark(p[0], p[1], 8, '#cfe8ff', 70, 0.6); AU.play('sizzle'); G.shake = Math.max(G.shake, 3); }
      else if (t === 3) { spark(p[0], p[1], 7, '#ff8c2b', 130, 0.5); AU.play('ignite'); G.shake = Math.max(G.shake, 6); G.flash = Math.max(G.flash, 0.3); }
      else if (t === 4) { spark(p[0], p[1], 20, '#ff4b3a', 150, 0.8); G.shake = Math.max(G.shake, 12); }
      else if (t === 6) { spark(p[0], p[1], 5, '#ff9a3c', 60, 0.4); AU.play('burn'); }
      else if (t === 7) { spark(p[0], p[1], 16, '#c07bff', 120, 0.7); AU.play('slay'); G.shake = Math.max(G.shake, 7); }
    }
    e.length = 0;
  }

  // ---------- outcome ----------
  function checkOutcome() {
    var st = G.st;
    if (G.over) return;
    if (!st.dead && st.monsters === 0 && st.collected >= G.target) return win();
    if (st.dead) return fail('The chamber claimed him.');
    if (!G.settled) return;
    var goldLeft = S.countMat(st.grid, S.GOLD);
    var lava = S.countMat(st.grid, S.LAVA) + S.countMat(st.grid, S.GAS);
    var pinsLeft = 0;
    for (var i = 0; i < G.pins.length; i++) if (!G.pins[i].out) pinsLeft++;
    if (st.collected + goldLeft < G.target) return fail('Treasure lost to the fire.');
    if (st.monsters > 0 && lava === 0) return fail('Nothing left to slay the beasts.');
    if (pinsLeft === 0) return fail('Out of keys.');
    // once per settle: is the chamber still winnable with the keys that remain?
    if (G.checked) return;
    G.checked = true;
    if (pinsLeft > 4) return;
    var rem = [];
    for (i = 0; i < G.pins.length; i++) if (!G.pins[i].out) rem.push(G.pins[i].id);
    var probe = S.clone(st);
    var an = GEN.analyze(probe, rem, 200, true, G.target);
    if (!an || an.best < G.target) fail('No path left to the vault.');
  }

  function win() {
    G.over = 'win'; G.overT = 0;
    G.flash = 0.5; G.shake = 6;
    save.done[G.level] = 1;
    if (!save.best[G.level] || G.pulls < save.best[G.level]) save.best[G.level] = G.pulls;
    writeSave();
    var all = true;
    for (var i = 0; i < 30; i++) if (!save.done[i]) all = false;
    if (all) { G.over = 'crown'; AU.play('crown'); } else AU.play('win');
    for (i = 0; i < 26; i++) spark(DW / 2, BY + BH - 60, 1, '#ffd34d', 200, 1.2);
  }
  function fail(msg) {
    G.over = 'fail'; G.overT = 0; G.banner = msg;
    G.shake = 14; AU.play('fail');
  }

  // ---------- input state ----------
  function resetInput() {
    for (var k in pointers) if (Object.prototype.hasOwnProperty.call(pointers, k)) delete pointers[k];
    for (var q in keys) if (Object.prototype.hasOwnProperty.call(keys, q)) delete keys[q];
  }

  function pullPin(p) {
    if (!p || p.out || G.over || G.paused) return;
    p.out = 1; p.t = 0;
    G.st.events = G.st.events || [];
    for (var k = 0; k < 8; k++) G.st.hist[k] = 0;   // cycle detection is per-pull, as in the solver
    G.st.hi = 0;
    S.pull(G.st, p.id);
    G.pulls++;
    G.settled = false;
    G.checked = false;
    AU.play('pull');
    G.shake = Math.max(G.shake, 4);
  }

  function handleAt(px, py) {
    for (var i = 0; i < G.pins.length; i++) {
      var p = G.pins[i];
      if (p.out) continue;
      var h = handlePos(p);
      var dx = px - h[0], dy = py - h[1];
      if (dx * dx + dy * dy < 34 * 34) return i;
    }
    return -1;
  }
  function handlePos(p) {
    var y = BY + (p.py + 0.5) * CELL;
    return [p.anchor < 0 ? BX - 24 : BX + BW + 24, y];
  }

  // buttons: rect list rebuilt per frame-ish (static per screen)
  function buttons() {
    if (G.screen === 'play') {
      return [
        { id: 'retry', x: 24, y: 634, w: 156, h: 52, t: 'Retry' },
        { id: 'kingdom', x: 210, y: 634, w: 156, h: 52, t: 'Kingdom' }
      ];
    }
    if (G.screen === 'kingdom') {
      var b = [{ id: 'play', x: 45, y: 620, w: 300, h: 58, t: 'Enter chamber ' + (nextUnsolved() + 1) }];
      for (var i = 0; i < 30; i++) {
        var c = i % 6, r = (i / 6) | 0;
        b.push({ id: 'lv' + i, x: 30 + c * 56, y: 340 + r * 54, w: 48, h: 48, t: '', lv: i });
      }
      return b;
    }
    return [];
  }
  function hitBtn(px, py) {
    var bs = buttons();
    for (var i = 0; i < bs.length; i++) {
      var b = bs[i];
      if (px >= b.x - 4 && px <= b.x + b.w + 4 && py >= b.y - 4 && py <= b.y + b.h + 4) return b;
    }
    return null;
  }

  function pressBtn(b) {
    AU.play('tap');
    if (b.id === 'retry') startLevel(G.level);
    else if (b.id === 'kingdom') { G.screen = 'kingdom'; G.over = null; resetInput(); }
    else if (b.id === 'play') startLevel(nextUnsolved());
    else if (b.lv != null) { if (unlocked(b.lv)) startLevel(b.lv); }
  }

  // ---------- pointer plumbing ----------
  function toDesign(ev) {
    var r = canvas.getBoundingClientRect();
    return [(ev.clientX - r.left) / r.width * DW, (ev.clientY - r.top) / r.height * DH];
  }

  function onDown(ev) {
    ev.preventDefault();
    if (G.paused || document.hidden) { resetInput(); return; }
    AU.unlock();
    var p = toDesign(ev), px = p[0], py = p[1];
    if (G.screen === 'boot') { G.screen = 'play'; startLevel(nextUnsolved()); return; }
    if (G.over === 'win' || G.over === 'crown') {
      if (G.overT > 0.35) { if (G.over === 'crown') { G.screen = 'kingdom'; G.over = 'crown'; } else { G.screen = 'kingdom'; G.over = null; } }
      return;
    }
    if (G.over === 'fail') { if (G.overT > 0.25) startLevel(G.level); return; }
    var b = hitBtn(px, py);
    if (b) { pointers[ev.pointerId] = { kind: 'btn', b: b }; return; }
    if (G.screen === 'play') {
      var i = handleAt(px, py);
      if (i >= 0) { G.sel = i; pointers[ev.pointerId] = { kind: 'pin', i: i, x0: px, y0: py, moved: 0 }; }
    }
  }
  function onMove(ev) {
    var d = pointers[ev.pointerId];
    if (!d) return;
    ev.preventDefault();
    if (d.kind !== 'pin') return;
    var p = toDesign(ev), dx = p[0] - d.x0, dy = p[1] - d.y0;
    d.moved = Math.max(d.moved, Math.sqrt(dx * dx + dy * dy));
    var pin = G.pins[d.i];
    if (!pin || pin.out) { delete pointers[ev.pointerId]; return; }
    if (dx * pin.anchor > 16) { pullPin(pin); delete pointers[ev.pointerId]; }
  }
  function onUp(ev) {
    var d = pointers[ev.pointerId];
    delete pointers[ev.pointerId];
    if (!d) return;
    ev.preventDefault();
    if (d.kind === 'btn') {
      var p = toDesign(ev);
      var b = hitBtn(p[0], p[1]);
      if (b && b.id === d.b.id) pressBtn(b);
    } else if (d.kind === 'pin' && d.moved < 14) {
      pullPin(G.pins[d.i]);   // forgiving tap
    }
  }
  function onCancel(ev) { delete pointers[ev.pointerId]; }

  function onKey(ev) {
    var k = ev.key;
    if (k === ' ' || k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight') ev.preventDefault();
    if (G.paused || G.rotate || document.hidden) { resetInput(); return; }
    if (ev.repeat) return;
    keys[k] = 1;
    AU.unlock();
    if (G.screen === 'boot') { startLevel(nextUnsolved()); return; }
    if (G.over === 'fail') { if (G.overT > 0.25) startLevel(G.level); return; }
    if (G.over === 'win' || G.over === 'crown') { if (G.overT > 0.35) { G.screen = 'kingdom'; if (G.over === 'win') G.over = null; } return; }
    if (k === 'r' || k === 'R') { startLevel(G.level); return; }
    if (k === 'Escape') { G.screen = G.screen === 'kingdom' ? 'play' : 'kingdom'; resetInput(); return; }
    if (G.screen === 'kingdom') {
      if (k === ' ' || k === 'Enter') { AU.play('tap'); startLevel(nextUnsolved()); }
      return;
    }
    var live = [];
    for (var i = 0; i < G.pins.length; i++) if (!G.pins[i].out) live.push(i);
    if (!live.length) return;
    if (live.indexOf(G.sel) < 0) G.sel = live[0];
    if (k === 'ArrowDown' || k === 'ArrowRight') G.sel = live[(live.indexOf(G.sel) + 1) % live.length];
    else if (k === 'ArrowUp' || k === 'ArrowLeft') G.sel = live[(live.indexOf(G.sel) + live.length - 1) % live.length];
    else if (k === ' ' || k === 'Enter') pullPin(G.pins[G.sel]);
  }
  function onKeyUp(ev) { delete keys[ev.key]; }
  function onBlur() { resetInput(); }

  // ---------- drawing ----------
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function text(t, x, y, size, col, align, weight) {
    ctx.fillStyle = col;
    ctx.font = (weight || '600') + ' ' + size + 'px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t, x, y);
  }

  function drawCells() {
    var g = G.st.grid, x, y, i, c, px, py, t = G.time;
    for (y = 0; y < S.H; y++) {
      for (x = 0; x < S.W; x++) {
        i = y * S.W + x; c = g[i];
        if (c === S.EMPTY) continue;
        px = BX + x * CELL; py = BY + y * CELL;
        if (c === S.WALL) { ctx.fillStyle = '#2b3247'; ctx.fillRect(px, py, CELL, CELL); ctx.fillStyle = '#353d55'; ctx.fillRect(px, py, CELL, 3); }
        else if (c === S.STONE) { ctx.fillStyle = '#5b6478'; rr(px + 1, py + 1, CELL - 2, CELL - 2, 4); ctx.fill(); }
        else if (c === S.CUP) { ctx.fillStyle = '#141a2a'; ctx.fillRect(px, py, CELL, CELL); }
        else if (c === S.PIN) {
          ctx.fillStyle = '#d9ab4c'; rr(px, py + 4, CELL, CELL - 8, 3); ctx.fill();
          ctx.fillStyle = 'rgba(255,238,190,.45)'; ctx.fillRect(px, py + 5, CELL, 2);
        } else if (c === S.GOLD) {
          ctx.fillStyle = '#ffd34d';
          ctx.beginPath(); ctx.arc(px + CELL / 2, py + CELL / 2, CELL * 0.38, 0, 6.284); ctx.fill();
          ctx.fillStyle = '#fff2b8';
          ctx.beginPath(); ctx.arc(px + CELL * 0.4, py + CELL * 0.38, CELL * 0.12, 0, 6.284); ctx.fill();
        } else if (c === S.LAVA) {
          var f = 0.5 + 0.5 * Math.sin(t * 5 + (x * 3 + y * 7));
          ctx.fillStyle = f > 0.6 ? '#ff8a30' : '#f0521f';
          ctx.fillRect(px, py, CELL, CELL);
          ctx.fillStyle = 'rgba(255,214,120,' + (0.15 + 0.25 * f) + ')';
          ctx.fillRect(px + 2, py + 2, CELL - 4, CELL * 0.35);
        } else if (c === S.WATER) {
          ctx.fillStyle = '#2f86e0'; ctx.fillRect(px, py, CELL, CELL);
          ctx.fillStyle = 'rgba(160,220,255,.35)';
          ctx.fillRect(px, py + 3 + Math.sin(t * 4 + x) * 2, CELL, 3);
        } else if (c === S.GAS) {
          ctx.fillStyle = 'rgba(120,235,140,.55)';
          ctx.beginPath(); ctx.arc(px + CELL / 2, py + CELL / 2 + Math.sin(t * 3 + x) * 2, CELL * 0.44, 0, 6.284); ctx.fill();
        } else if (c === S.MONSTER) {
          ctx.fillStyle = '#a94bd8';
          rr(px + 1, py + 2, CELL - 2, CELL - 3, 7); ctx.fill();
          ctx.fillStyle = '#ffe9a8';
          ctx.beginPath(); ctx.arc(px + CELL * 0.34, py + CELL * 0.45, 2.6, 0, 6.284); ctx.fill();
          ctx.beginPath(); ctx.arc(px + CELL * 0.66, py + CELL * 0.45, 2.6, 0, 6.284); ctx.fill();
          ctx.strokeStyle = '#3a1150'; ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.moveTo(px + 5, py + CELL - 5); ctx.lineTo(px + CELL - 5, py + CELL - 5); ctx.stroke();
        } else if (c === S.HERO) {
          var bob = Math.sin(t * 2.2) * 1.4;
          ctx.fillStyle = G.st.dead ? '#7d8598' : '#3fe3c4';
          rr(px + 3, py + 3 + bob, CELL - 6, CELL - 6, 5); ctx.fill();
          ctx.fillStyle = '#08222c';
          ctx.fillRect(px + 6, py + 8 + bob, 3, 3);
          ctx.fillRect(px + CELL - 9, py + 8 + bob, 3, 3);
          ctx.fillStyle = '#d9ab4c';
          ctx.fillRect(px + 4, py + CELL - 8 + bob, CELL - 8, 3);
        }
      }
    }
  }

  function drawPins() {
    for (var i = 0; i < G.pins.length; i++) {
      var p = G.pins[i];
      var y = BY + p.py * CELL, h = handlePos(p);
      var off = p.out ? Math.min(1, p.t / 0.22) * 90 * p.anchor : 0;
      if (p.out && p.t > 0.5) continue;
      var x0 = BX + p.lo * CELL, x1 = BX + (p.hi + 1) * CELL;
      var rodA = p.anchor < 0 ? h[0] : x1, rodB = p.anchor < 0 ? x0 : h[0];
      ctx.save();
      ctx.globalAlpha = p.out ? Math.max(0, 1 - p.t / 0.5) : 1;
      // rod
      ctx.fillStyle = '#b9903c';
      ctx.fillRect(Math.min(rodA, rodB) + off, y + CELL * 0.34, Math.abs(rodB - rodA), CELL * 0.32);
      if (p.out) { ctx.fillStyle = '#d9ab4c'; rr(x0 + off, y + 4, x1 - x0, CELL - 8, 3); ctx.fill(); }
      // handle (48px+ target)
      var sel = (!p.out && i === G.sel);
      ctx.fillStyle = sel ? '#ffe08a' : '#d9ab4c';
      ctx.beginPath(); ctx.arc(h[0] + off, h[1], 15, 0, 6.284); ctx.fill();
      ctx.strokeStyle = sel ? '#fff6d5' : 'rgba(255,240,200,.5)';
      ctx.lineWidth = sel ? 3 : 2;
      ctx.beginPath(); ctx.arc(h[0] + off, h[1], sel ? 20 : 17, 0, 6.284); ctx.stroke();
      ctx.fillStyle = '#2a2110';
      ctx.beginPath(); ctx.arc(h[0] + off, h[1], 5, 0, 6.284); ctx.fill();
      ctx.restore();
    }
  }

  function drawHud() {
    var wing = (G.level / 10) | 0;
    var names = ['Ember Wing', 'Tide Wing', 'Marsh Wing'];
    text('Chamber ' + (G.level + 1) + ' / 30', 20, 26, 15, '#9fb0d0', 'left');
    text(names[wing], DW - 20, 26, 15, '#7f8fb5', 'right');
    // treasure meter
    var n = G.target, cw = 20;
    for (var i = 0; i < n; i++) {
      var x = 20 + i * (cw + 6), y = 52;
      ctx.fillStyle = i < G.st.collected ? '#ffd34d' : 'rgba(255,211,77,.18)';
      ctx.beginPath(); ctx.arc(x + cw / 2, y, 8, 0, 6.284); ctx.fill();
    }
    var bst = save.best[G.level];
    text('Keys ' + G.pulls + (bst ? '   best ' + bst : ''), DW - 20, 52, 15, '#7f8fb5', 'right');
    if (G.st.monsters > 0) text('Beasts ' + G.st.monsters, DW - 20, 74, 13, '#c07bff', 'right');
  }

  function drawButtons() {
    var bs = buttons(), i;
    for (i = 0; i < bs.length; i++) {
      var b = bs[i];
      if (b.lv != null) {
        var ok = unlocked(b.lv), done = save.done[b.lv];
        ctx.fillStyle = done ? '#2f7f68' : ok ? '#2b3247' : '#1b2030';
        rr(b.x, b.y, b.w, b.h, 8); ctx.fill();
        text(done ? '✓' : ok ? (b.lv + 1) : '–', b.x + b.w / 2, b.y + b.h / 2, 15, done ? '#dfffef' : ok ? '#9fb0d0' : '#3d465e');
      } else {
        ctx.fillStyle = '#252c40';
        rr(b.x, b.y, b.w, b.h, 12); ctx.fill();
        ctx.strokeStyle = '#3c4763'; ctx.lineWidth = 2; ctx.stroke();
        text(b.t, b.x + b.w / 2, b.y + b.h / 2, 17, '#dce6ff');
      }
    }
  }

  function drawKingdom() {
    var n = 0, i;
    for (i = 0; i < 30; i++) if (save.done[i]) n++;
    ctx.fillStyle = '#0d1018'; ctx.fillRect(0, 0, DW, DH);
    // sky + hill
    var sky = ctx.createLinearGradient(0, 0, 0, 300);
    sky.addColorStop(0, '#1b2440'); sky.addColorStop(1, '#2a3350');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, DW, 300);
    ctx.fillStyle = '#22402f';
    ctx.beginPath(); ctx.moveTo(0, 300); ctx.quadraticCurveTo(DW / 2, 190, DW, 300); ctx.lineTo(DW, 300); ctx.lineTo(0, 300); ctx.fill();
    text('Your Kingdom', DW / 2, 40, 26, '#e8eefc', 'center', '700');
    text(n + ' of 30 villagers rescued', DW / 2, 68, 15, '#9fb0d0');
    // huts grow with rescues
    for (i = 0; i < n; i++) {
      var col = i % 10, row = (i / 10) | 0;
      var hx = 34 + col * 33 + (row % 2) * 12, hy = 262 - row * 42;
      ctx.fillStyle = '#6b4a2f'; ctx.fillRect(hx, hy, 20, 16);
      ctx.fillStyle = '#c4753c';
      ctx.beginPath(); ctx.moveTo(hx - 3, hy); ctx.lineTo(hx + 10, hy - 12); ctx.lineTo(hx + 23, hy); ctx.fill();
      ctx.fillStyle = '#ffd98a'; ctx.fillRect(hx + 7, hy + 7, 6, 9);
      // villager
      var bob = Math.sin(G.time * 2 + i) * 2;
      ctx.fillStyle = '#3fe3c4';
      ctx.beginPath(); ctx.arc(hx + 10 + Math.sin(G.time + i * 2) * 6, 288 + bob - row * 42, 3.4, 0, 6.284); ctx.fill();
    }
    if (n >= 30) {
      ctx.fillStyle = '#ffd34d';
      ctx.beginPath();
      ctx.moveTo(DW / 2 - 30, 150); ctx.lineTo(DW / 2 - 20, 118); ctx.lineTo(DW / 2, 140);
      ctx.lineTo(DW / 2 + 20, 118); ctx.lineTo(DW / 2 + 30, 150); ctx.closePath(); ctx.fill();
      text('CROWNED', DW / 2, 172, 18, '#ffd34d');
    }
    var wingNames = ['Ember', 'Tide', 'Marsh'];
    for (i = 0; i < 3; i++) {
      var done = 0;
      for (var j = 0; j < 10; j++) if (save.done[i * 10 + j]) done++;
      var open = i === 0 || (function () { for (var k = 0; k < i * 10; k++) if (!save.done[k]) return false; return true; })();
      text(wingNames[i] + ' ' + done + '/10' + (open ? '' : ' (locked)'), 30 + i * 112, 322, 12, open ? '#9fb0d0' : '#4a5470', 'left');
    }
    drawButtons();
  }

  function drawOverlay() {
    if (!G.over) return;
    var a = Math.min(0.72, G.overT * 3);
    ctx.fillStyle = 'rgba(6,8,14,' + a + ')';
    ctx.fillRect(0, 0, DW, DH);
    var cy = 300;
    if (G.over === 'win') {
      text('Villager rescued!', DW / 2, cy, 30, '#ffd34d', 'center', '700');
      text('Treasure ' + G.st.collected + '/' + G.target + '  ·  keys used ' + G.pulls, DW / 2, cy + 40, 16, '#dce6ff');
      text('Tap to see your kingdom', DW / 2, cy + 84, 15, '#9fb0d0');
    } else if (G.over === 'crown') {
      text('The crown is yours', DW / 2, cy - 10, 30, '#ffd34d', 'center', '700');
      text('All 30 chambers cleared', DW / 2, cy + 30, 17, '#dce6ff');
      text('Tap to return to the kingdom', DW / 2, cy + 74, 15, '#9fb0d0');
    } else {
      text('Chamber lost', DW / 2, cy, 30, '#ff6a54', 'center', '700');
      text(G.banner, DW / 2, cy + 38, 16, '#dce6ff');
      text('Tap anywhere to retry', DW / 2, cy + 82, 15, '#9fb0d0');
    }
  }

  function drawPlay() {
    ctx.fillStyle = '#0d1018'; ctx.fillRect(0, 0, DW, DH);
    ctx.fillStyle = '#151a28';
    rr(BX - 6, BY - 6, BW + 12, BH + 12, 10); ctx.fill();
    drawCells();
    drawPins();
    // particles
    for (var i = 0; i < G.parts.length; i++) {
      var p = G.parts[i];
      ctx.globalAlpha = Math.max(0, p.l / p.m);
      ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.284); ctx.fill();
    }
    ctx.globalAlpha = 1;
    drawHud();
    text(G.hint, DW / 2, 612, 13, '#8394b8');
    drawButtons();
  }

  function render() {
    var sx = 0, sy = 0;
    if (G.shake > 0.1) { sx = (Math.random() - 0.5) * G.shake; sy = (Math.random() - 0.5) * G.shake; }
    ctx.setTransform(view.s, 0, 0, view.s, 0, 0);
    ctx.clearRect(0, 0, DW, DH);
    ctx.save();
    ctx.translate(sx, sy);
    if (G.screen === 'kingdom') drawKingdom();
    else if (G.screen === 'boot') {
      ctx.fillStyle = '#0d1018'; ctx.fillRect(0, 0, DW, DH);
      text('DOMINION KEYS', DW / 2, 270, 30, '#ffd34d', 'center', '800');
      text('Pull the keys. Save the hoard. Rebuild the realm.', DW / 2, 306, 14, '#9fb0d0');
      ctx.fillStyle = '#252c40'; rr(75, 380, 240, 60, 14); ctx.fill();
      ctx.strokeStyle = '#3c4763'; ctx.lineWidth = 2; ctx.stroke();
      text('Tap to begin', DW / 2, 410, 19, '#dce6ff');
      text('drag a key handle outward · arrows + space', DW / 2, 470, 12, '#6b7796');
    } else { drawPlay(); drawOverlay(); }
    ctx.restore();
    if (G.flash > 0.01) {
      ctx.fillStyle = 'rgba(255,240,200,' + (G.flash * 0.5) + ')';
      ctx.fillRect(0, 0, DW, DH);
    }
    if (G.rotate) {
      ctx.fillStyle = 'rgba(8,10,16,.94)'; ctx.fillRect(0, 0, DW, DH);
      text('Rotate to portrait', DW / 2, DH / 2 - 10, 24, '#ffd34d');
      text('Dominion Keys is played upright.', DW / 2, DH / 2 + 24, 14, '#9fb0d0');
    }
  }

  // ---------- loop ----------
  var last = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;

    var rot = root.innerWidth > root.innerHeight * 1.12;
    if (rot !== G.rotate) { G.rotate = rot; if (rot) resetInput(); G.acc = 0; }
    var wasPaused = G.paused;
    G.paused = G.rotate || document.hidden;
    if (G.paused && !wasPaused) resetInput();
    if (!G.paused && wasPaused) { resetInput(); G.acc = 0; last = 0; }

    if (!G.paused) {
      G.time += dt;
      G.shake = Math.max(0, G.shake - dt * 40);
      G.flash = Math.max(0, G.flash - dt * 2.2);
      var i;
      for (i = G.parts.length - 1; i >= 0; i--) {
        var p = G.parts[i];
        p.l -= dt;
        if (p.l <= 0) { G.parts[i] = G.parts[G.parts.length - 1]; G.parts.pop(); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 260 * dt;
      }
      if (G.parts.length > 220) G.parts.length = 220;

      if (G.screen === 'play' && G.st) {
        for (i = 0; i < G.pins.length; i++) if (G.pins[i].out) G.pins[i].t += dt;
        if (G.over) G.overT += dt;
        else {
          G.acc += dt;
          var stepDt = 1 / 16, guard = 0;
          while (G.acc >= stepDt && guard < 4) {
            G.acc -= stepDt; guard++;
            if (!G.settled) {
              var ch = S.step(G.st);
              handleEvents(G.st);
              if (!ch) G.settled = true;
              else {
                var h = S.hash(G.st.grid), rep = 0, k;
                for (k = 0; k < 8; k++) if (G.st.hist[k] === h) rep = 1;
                G.st.hist[G.st.hi] = h; G.st.hi = (G.st.hi + 1) & 7;
                if (rep) G.settled = true;
              }
            }
            checkOutcome();
            if (G.over) break;
          }
          if (G.acc > 0.4) G.acc = 0;
        }
      }
    }
    render();
  }

  // ---------- boot ----------
  function resize() {
    var vw = root.innerWidth, vh = root.innerHeight;
    var dpr = Math.min(root.devicePixelRatio || 1, 2);
    var sc = Math.min(vw / DW, vh / DH);
    var cw = Math.max(1, Math.round(DW * sc)), ch = Math.max(1, Math.round(DH * sc));
    canvas.style.width = cw + 'px';
    canvas.style.height = ch + 'px';
    var bw = Math.round(cw * dpr), bh = Math.round(ch * dpr);
    var lng = Math.max(bw, bh);
    if (lng > 960) { var k = 960 / lng; bw = Math.max(1, Math.round(bw * k)); bh = Math.max(1, Math.round(bh * k)); }
    canvas.width = bw; canvas.height = bh;
    view.s = bw / DW;
    ctx.imageSmoothingEnabled = true;
  }

  function init() {
    canvas = document.getElementById('c');
    ctx = canvas.getContext('2d');
    save = loadSave();
    resize();
    root.addEventListener('resize', resize);
    root.addEventListener('orientationchange', resize);
    canvas.addEventListener('pointerdown', onDown, { passive: false });
    root.addEventListener('pointermove', onMove, { passive: false });
    root.addEventListener('pointerup', onUp, { passive: false });
    root.addEventListener('pointercancel', onCancel);
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    canvas.addEventListener('touchstart', function (e) { e.preventDefault(); }, { passive: false });
    root.addEventListener('keydown', onKey);
    root.addEventListener('keyup', onKeyUp);
    root.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', function () {
      resetInput();
      if (!document.hidden) last = 0;
    });
    requestAnimationFrame(frame);
  }

  root.DKGame = G;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : this);
