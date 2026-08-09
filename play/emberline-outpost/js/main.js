/* Emberline Outpost - boot, input, loop */
(function (EO) {
  'use strict';
  var G = EO.G, U = EO.UI;
  var cv = document.getElementById('cv'), g = cv.getContext('2d', { alpha: false });
  var startOv = document.getElementById('start'), startBtn = document.getElementById('startBtn'), rotOv = document.getElementById('rot');
  var running = false, raf = 0, last = 0;

  EO.blocked = false;
  EO.kbActive = false;
  EO.selMap = 0;
  EO.drag = { active: false, id: -1, card: -1, x: 0, y: 0, cell: null, dir: 0, moved: false, sx: 0, sy: 0 };
  var pointers = {};
  var keys = {};

  /* ---------- sizing ---------- */
  function resize() {
    var w = Math.max(240, window.innerWidth), h = Math.max(320, window.innerHeight);
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var long = Math.max(w, h);
    if (long * dpr > 960) dpr = 960 / long;
    if (dpr < 0.6) dpr = 0.6;
    cv.width = Math.max(1, Math.round(w * dpr));
    cv.height = Math.max(1, Math.round(h * dpr));
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    EO.layout(w, h);
    for (var i = 0; i < G.enemies.length; i++) {
      var e = G.enemies[i];
      if (e.air) { e.gx = EO.cellX(G.gate.c); e.gy = EO.cellY(G.gate.r); }
    }
    checkOrient(w, h);
  }
  function checkOrient(w, h) {
    var land = w > h, blocked = land || document.hidden;
    if (blocked) {
      if (!EO.blocked) { EO.blocked = true; clearInput(); last = 0; }
      rotOv.style.display = land ? 'flex' : 'none';
    } else if (EO.blocked) {
      EO.blocked = false; rotOv.style.display = 'none'; last = 0;
    }
  }

  /* ---------- input state reset (hardening #2/#3) ---------- */
  function clearInput() {
    for (var k in pointers) if (Object.prototype.hasOwnProperty.call(pointers, k)) delete pointers[k];
    keys = {};
    EO.drag.active = false; EO.drag.id = -1; EO.drag.card = -1; EO.drag.cell = null; EO.drag.moved = false;
  }
  EO.clearInput = clearInput;

  function fullReset() {
    clearInput();
    EO.clearTimers();
    G.sel = null;
    G.paused = false;
    G.speed = 1;
    last = 0;
  }

  function setPaused(value) {
    G.paused = !!value;
    if (G.paused) clearInput();
    EO.sfx.ui();
  }

  /* ---------- coordinate helpers ---------- */
  function pos(ev) {
    var r = cv.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }
  function cellAt(x, y) {
    var L = G.L;
    var c = Math.floor((x - L.ox) / L.tile), r = Math.floor((y - L.oy) / L.tile);
    if (c < 0 || r < 0 || c >= EO.COLS || r >= EO.ROWS) return null;
    return { c: c, r: r };
  }
  function defaultDir(c, r) {
    /* face the nearest path tile */
    var bd = 1e9, bdir = 0;
    for (var d = 0; d < 4; d++) {
      for (var k = 1; k <= 3; k++) {
        var cc = c + EO.DIRS[d][0] * k, rr2 = r + EO.DIRS[d][1] * k;
        if (EO.isPath(cc, rr2)) { if (k < bd) { bd = k; bdir = d; } break; }
      }
    }
    return bdir;
  }
  function dirFrom(dx, dy) {
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 1 : 3;
    return dy > 0 ? 2 : 0;
  }

  /* ---------- actions ---------- */
  function goMaps() { fullReset(); G.screen = 'maps'; EO.sfx.ui(); }
  function goBase() { fullReset(); G.screen = 'base'; EO.sfx.ui(); }
  function deploy(i) {
    fullReset();
    EO.startMap(i);
    EO.sfx.ui();
  }

  function craft(kitId) {
    var S = G.save, kt = EO.KIT_BY_ID[kitId];
    if (!kt) return;
    var slot = EO.baseSlot;
    if (slot >= EO.slotsUnlocked(S.cleared)) { EO.sfx.deny(); return; }
    if (S.kits.indexOf(kitId) >= 0) { EO.sfx.deny(); return; }
    if (S.mats.scrap < kt.cost.scrap || S.mats.ember < kt.cost.ember || S.mats.alloy < kt.cost.alloy) { EO.sfx.deny(); return; }
    S.mats.scrap -= kt.cost.scrap; S.mats.ember -= kt.cost.ember; S.mats.alloy -= kt.cost.alloy;
    S.kits[slot] = kitId;
    EO.writeSave(S);
    EO.sfx.craft();
  }

  function handleButton(b) {
    switch (b.id) {
      case 'speed': G.speed = G.speed === 1 ? 2 : 1; EO.sfx.ui(); return true;
      case 'pause': setPaused(!G.paused); return true;
      case 'resume': setPaused(false); return true;
      case 'quit': goMaps(); return true;
      case 'skill': if (G.sel) EO.useSkill(G.sel); return true;
      case 'recycle': if (G.sel) EO.recycle(G.sel); return true;
      case 'again':
        deploy(b.next);
        return true;
      case 'base': goBase(); return true;
      case 'maps': goMaps(); return true;
      case 'back': goMaps(); return true;
      case 'playsel': deploy(Math.min(G.save.cleared, EO.MAPS.length - 1)); return true;
    }
    return false;
  }

  /* ---------- pointer ---------- */
  function onDown(ev) {
    if (EO.blocked || document.hidden) return;
    EO.audio.resume();
    var p = pos(ev);
    pointers[ev.pointerId] = { x: p.x, y: p.y };
    EO.kbActive = false;
    var i;
    /* UI buttons first (they are rebuilt each frame) */
    for (i = U.btns.length - 1; i >= 0; i--) {
      if (U.btns[i].on !== false && EO.hit(U.btns[i], p.x, p.y) && (!G.paused || U.btns[i].id === 'pause' || U.btns[i].id === 'resume')) { if (handleButton(U.btns[i])) return; }
    }
    if (G.screen === 'maps') {
      for (i = 0; i < U.mapBtns.length; i++) {
        var mb = U.mapBtns[i];
        if (mb.open && EO.hit(mb, p.x, p.y)) { deploy(mb.idx); return; }
      }
      return;
    }
    if (G.screen === 'base') {
      for (i = 0; i < U.slots.length; i++) {
        if (U.slots[i].open && EO.hit(U.slots[i], p.x, p.y)) { EO.baseSlot = U.slots[i].idx; EO.sfx.ui(); return; }
      }
      for (i = 0; i < U.recipes.length; i++) {
        if (EO.hit(U.recipes[i], p.x, p.y)) { craft(U.recipes[i].kitId); return; }
      }
      return;
    }
    if (G.screen !== 'play' || G.paused || G.state === 'won' || G.state === 'lost') return;

    /* tray cards */
    for (i = 0; i < U.cards.length; i++) {
      if (EO.hit(U.cards[i], p.x, p.y)) {
        var D = EO.drag;
        if (D.active) return;
        D.active = true; D.id = ev.pointerId; D.card = U.cards[i].idx;
        D.x = p.x; D.y = p.y; D.sx = p.x; D.sy = p.y; D.moved = false;
        D.cell = null; D.dir = 0;
        G.sel = null;
        G.kbCard = D.card;
        EO.audio.tone(420, 0.04, 'square', 0.08);
        return;
      }
    }
    /* grid tap: select / deselect */
    var cell = cellAt(p.x, p.y);
    if (cell) {
      var dd = EO.defAt(cell.c, cell.r);
      if (dd) { G.sel = (G.sel === dd) ? null : dd; EO.sfx.ui(); }
      else G.sel = null;
    }
  }

  function onMove(ev) {
    if (EO.blocked || document.hidden) return;
    var pt = pointers[ev.pointerId];
    if (!pt) return;
    var p = pos(ev);
    pt.x = p.x; pt.y = p.y;
    var D = EO.drag;
    if (D.active && D.id === ev.pointerId) {
      D.x = p.x; D.y = p.y;
      if (Math.abs(p.x - D.sx) > 6 || Math.abs(p.y - D.sy) > 6) D.moved = true;
      var cell = cellAt(p.x, p.y);
      if (cell) {
        if (!D.cell || D.cell.c !== cell.c || D.cell.r !== cell.r) {
          D.cell = cell;
          D.dir = defaultDir(cell.c, cell.r);
        } else {
          var cx = EO.cellX(cell.c), cy = EO.cellY(cell.r);
          var dx = p.x - cx, dy = p.y - cy;
          if (dx * dx + dy * dy > (G.L.tile * 0.30) * (G.L.tile * 0.30)) D.dir = dirFrom(dx, dy);
        }
      } else {
        D.cell = null;
      }
    }
  }

  function onUp(ev, cancel) {
    var D = EO.drag;
    if (D.active && D.id === ev.pointerId) {
      if (!cancel && D.cell && !EO.blocked && !document.hidden) {
        var id = G.save.unlocked[D.card];
        if (id) EO.placeDefender(id, D.cell.c, D.cell.r, D.dir);
      }
      D.active = false; D.id = -1; D.card = -1; D.cell = null; D.moved = false;
    }
    delete pointers[ev.pointerId];
  }

  cv.addEventListener('pointerdown', function (e) { e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (x) { } onDown(e); }, { passive: false });
  cv.addEventListener('pointermove', function (e) { e.preventDefault(); onMove(e); }, { passive: false });
  cv.addEventListener('pointerup', function (e) { e.preventDefault(); onUp(e, false); }, { passive: false });
  cv.addEventListener('pointercancel', function (e) { e.preventDefault(); onUp(e, true); }, { passive: false });
  cv.addEventListener('pointerleave', function (e) { if (EO.drag.active && EO.drag.id === e.pointerId) { EO.drag.cell = null; } }, { passive: true });
  cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  cv.addEventListener('touchstart', function (e) { e.preventDefault(); }, { passive: false });
  cv.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
  window.addEventListener('blur', function () { clearInput(); });
  document.addEventListener('visibilitychange', function () { checkOrient(window.innerWidth, window.innerHeight); if (document.hidden) { clearInput(); last = 0; } });

  /* ---------- keyboard ---------- */
  window.addEventListener('keydown', function (e) {
    if (EO.blocked || document.hidden) return;
    var k = e.key;
    if (G.paused && k !== 'p' && k !== 'P' && k !== 'Escape') return;
    if (keys[k]) { if (k === ' ' || k.indexOf('Arrow') === 0) e.preventDefault(); return; }
    keys[k] = 1;
    if (!running) {
      if (k === ' ' || k === 'Enter') { e.preventDefault(); boot(); }
      return;
    }
    EO.audio.resume();
    if (G.screen !== 'play') {
      if (k === 'Enter' || k === ' ') {
        e.preventDefault();
        if (G.screen === 'result') { var nb = null; for (var i = 0; i < U.btns.length; i++) if (U.btns[i].id === 'again') nb = U.btns[i]; if (nb) handleButton(nb); }
        else if (G.screen === 'maps') deploy(Math.min(G.save.cleared, EO.MAPS.length - 1));
        else if (G.screen === 'base') goMaps();
      } else if (k === 'Escape' || k === 'b' || k === 'B') { goMaps(); }
      return;
    }
    EO.kbActive = true;
    var C = G.cursor;
    switch (k) {
      case 'ArrowUp': e.preventDefault(); C.r = EO.clamp(C.r - 1, 0, EO.ROWS - 1); break;
      case 'ArrowDown': e.preventDefault(); C.r = EO.clamp(C.r + 1, 0, EO.ROWS - 1); break;
      case 'ArrowLeft': e.preventDefault(); C.c = EO.clamp(C.c - 1, 0, EO.COLS - 1); break;
      case 'ArrowRight': e.preventDefault(); C.c = EO.clamp(C.c + 1, 0, EO.COLS - 1); break;
      case 'r': case 'R': G.kbDir = (G.kbDir + 1) & 3; EO.sfx.ui(); break;
      case 'q': case 'Q': G.kbCard = (G.kbCard + G.save.unlocked.length - 1) % G.save.unlocked.length; EO.sfx.ui(); break;
      case 'e': case 'E': case 'Tab': e.preventDefault(); G.kbCard = (G.kbCard + 1) % G.save.unlocked.length; EO.sfx.ui(); break;
      case ' ': {
        e.preventDefault();
        var dd = EO.defAt(C.c, C.r);
        if (dd) { G.sel = (G.sel === dd) ? null : dd; EO.sfx.ui(); }
        else { var id = G.save.unlocked[G.kbCard]; if (id) EO.placeDefender(id, C.c, C.r, G.kbDir); }
        break;
      }
      case 'Enter': e.preventDefault(); if (G.sel) EO.useSkill(G.sel); break;
      case 'x': case 'X': if (G.sel) EO.recycle(G.sel); break;
      case 'p': case 'P': case 'Escape': setPaused(!G.paused); break;
      case 'f': case 'F': G.speed = G.speed === 1 ? 2 : 1; EO.sfx.ui(); break;
    }
  }, { passive: false });
  window.addEventListener('keyup', function (e) { delete keys[e.key]; });

  /* ---------- keyboard cursor overlay ---------- */
  function drawCursor() {
    if (!EO.kbActive || G.screen !== 'play' || G.paused) return;
    var L = G.L, t = L.tile, C = G.cursor;
    var id = G.save.unlocked[G.kbCard];
    var free = EO.buildable(C.c, C.r);
    if (id && free) {
      var cells = EO.fpPreview(id, C.c, C.r, G.kbDir);
      g.fillStyle = 'rgba(255,180,84,0.16)';
      for (var i = 0; i < cells.length; i++) g.fillRect(L.ox + cells[i][0] * t + 1, L.oy + cells[i][1] * t + 1, t - 2, t - 2);
      var cx = EO.cellX(C.c), cy = EO.cellY(C.r), d = EO.DIRS[G.kbDir];
      g.strokeStyle = '#ffb454'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + d[0] * t * 0.7, cy + d[1] * t * 0.7); g.stroke();
    }
    g.strokeStyle = free ? '#ffb454' : '#e05f5f';
    g.lineWidth = 3;
    g.strokeRect(L.ox + C.c * t + 2, L.oy + C.r * t + 2, t - 4, t - 4);
  }

  /* ---------- loop ---------- */
  function frame(ts) {
    raf = requestAnimationFrame(frame);
    if (EO.blocked || document.hidden) { last = 0; return; }
    if (!last) last = ts;
    var dt = (ts - last) / 1000;
    last = ts;
    if (!(dt > 0)) dt = 0;
    if (dt > 0.05) dt = 0.05;
    EO.update(dt);
    EO.render(g);
    drawCursor();
  }

  /* ---------- boot ---------- */
  function boot() {
    if (running) return;
    running = true;
    EO.audio.init();
    EO.audio.resume();
    startOv.style.display = 'none';
    G.save = EO.loadSave();
    resize();
    EO.startMap(Math.min(G.save.cleared, EO.MAPS.length - 1));
    last = 0;
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }
  startBtn.addEventListener('click', function (e) { e.preventDefault(); boot(); });
  startBtn.addEventListener('touchend', function (e) { e.preventDefault(); boot(); }, { passive: false });

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', function () { EO.after(120, resize); });

  /* pre-boot layout so the first frame is correct */
  G.save = EO.loadSave();
  resize();

})(window.EO);
