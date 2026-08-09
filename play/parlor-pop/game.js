/* Parlor Pop - game.js : canvas render, input, screens, play controller. */
(function (root) {
  'use strict';
  var E = root.PP.engine, LEVELS = root.PP.levels, A = root.PP.audio, M = root.PP.meta;

  var DW = 390, DH = 700;               // portrait design space
  var BX = 15, BY = 118, CELL = 45;     // board origin + cell size
  var BW = CELL * 8;

  var COLORS = ['#e8564a', '#4aa3e8', '#5fc26a', '#f2c14e', '#a76fdc', '#f08a3c', '#3fc9c2'];
  var DARK = ['#8e2a22', '#20567f', '#2c6d34', '#8d6a1c', '#5b357c', '#8c451a', '#1c6d69'];
  var CNAME = ['Ruby', 'Cobalt', 'Fern', 'Amber', 'Plum', 'Ochre', 'Verd'];
  var BNAMES = ['Hammer', 'Rocket', 'Shuffle'];

  var cv, ctx, scale = 1, paused = false, booted = false;
  var screen = 'play';
  var lvIdx = 0, st = null;

  /* ---------------- animation + fx state (all capped) ---------------- */
  var off = new Float32Array(128);   // per-cell draw offset (dx,dy)
  var pop = new Float32Array(64);    // per-cell pop-in scale timer
  var parts = [], ghosts = [], beams = [], floats = [];
  var MAXP = 220, MAXG = 90, MAXB = 24, MAXF = 12;
  var shakeT = 0, shakeM = 0;
  var phase = 'idle', ptimer = 0;
  var sel = null;                    // {x,y} selected tile
  var cur = { x: 3, y: 7 };          // keyboard cursor
  var boosterArmed = -1;
  var idleT = 0, hintMove = null, hintT = 0;
  var toast = '', toastT = 0;
  var result = null;                 // {win, stars, score, got:[]}
  var galaT = 0;
  var roomTab = 0;
  var flashT = 0;

  /* ---------------- input state (fully resettable) ---------------- */
  var pointers = {};                 // pointerId -> {x,y,sx,sy,cell,btn,moved}
  var keys = {};
  var btns = [];                     // rebuilt each frame
  var timers = [];                   // any pending setTimeout ids

  function later(fn, ms) {
    var id = setTimeout(function () {
      var k = timers.indexOf(id); if (k >= 0) timers.splice(k, 1);
      fn();
    }, ms);
    timers.push(id);
    if (timers.length > 32) clearTimeout(timers.shift());
    return id;
  }
  function clearTimers() { while (timers.length) clearTimeout(timers.pop()); }

  function resetInput() {
    pointers = {};
    keys = {};
    btns.length = 0;
    sel = null;
    boosterArmed = -1;
    clearTimers();
    if (A.stopAll) A.stopAll();
  }

  /* ---------------- canvas ---------------- */
  function fit() {
    var vw = root.innerWidth || DW, vh = root.innerHeight || DH;
    var s = Math.min(vw / DW, vh / DH);
    var cssW = DW * s, cssH = DH * s;
    var dpr = Math.min(root.devicePixelRatio || 1, 2);
    // cap the backing store so mid-range phones never push huge buffers
    var longAxis = Math.max(cssW, cssH) * dpr;
    if (longAxis > 960) dpr = dpr * (960 / longAxis);
    cv.style.width = cssW + 'px';
    cv.style.height = cssH + 'px';
    cv.width = Math.max(1, Math.round(cssW * dpr));
    cv.height = Math.max(1, Math.round(cssH * dpr));
    ctx = cv.getContext('2d');
    scale = cv.width / DW;
    checkOrientation();
  }

  function checkOrientation() {
    var land = (root.innerWidth || 0) > (root.innerHeight || 0);
    var hidden = !!document.hidden;
    var el = document.getElementById('rot');
    if ((land || hidden) && booted) {
      if (!el.classList.contains('on')) { el.classList.add('on'); resetInput(); }
      paused = true;
    } else {
      el.classList.remove('on');
      paused = false;
    }
  }

  function toDesign(e) {
    var r = cv.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / (r.width || 1) * DW,
      y: (e.clientY - r.top) / (r.height || 1) * DH
    };
  }

  /* ---------------- drawing helpers ---------------- */
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

  function text(s, x, y, size, col, align, weight) {
    ctx.font = (weight || 700) + ' ' + size + 'px system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
    ctx.fillStyle = col || '#f2e9dc';
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(s, x, y);
  }

  function shape(cx, cy, r, k, fill, stroke) {
    ctx.beginPath();
    var i, a;
    if (k === 0) ctx.arc(cx, cy, r, 0, 6.2832);
    else if (k === 1) { rr(cx - r * .9, cy - r * .9, r * 1.8, r * 1.8, r * .4); }
    else if (k === 2) {
      ctx.moveTo(cx, cy - r * 1.05); ctx.lineTo(cx + r, cy + r * .75); ctx.lineTo(cx - r, cy + r * .75); ctx.closePath();
    } else if (k === 3) {
      ctx.moveTo(cx, cy - r * 1.1); ctx.lineTo(cx + r * .95, cy); ctx.lineTo(cx, cy + r * 1.1); ctx.lineTo(cx - r * .95, cy); ctx.closePath();
    } else if (k === 4) {
      for (i = 0; i < 6; i++) { a = i / 6 * 6.2832; ctx[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
      ctx.closePath();
    } else if (k === 5) {
      for (i = 0; i < 5; i++) { a = -1.5708 + i / 5 * 6.2832; ctx[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
      ctx.closePath();
    } else {
      var t = r * .38;
      ctx.moveTo(cx - t, cy - r); ctx.lineTo(cx + t, cy - r); ctx.lineTo(cx + t, cy - t);
      ctx.lineTo(cx + r, cy - t); ctx.lineTo(cx + r, cy + t); ctx.lineTo(cx + t, cy + t);
      ctx.lineTo(cx + t, cy + r); ctx.lineTo(cx - t, cy + r); ctx.lineTo(cx - t, cy + t);
      ctx.lineTo(cx - r, cy + t); ctx.lineTo(cx - r, cy - t); ctx.lineTo(cx - t, cy - t);
      ctx.closePath();
    }
    ctx.fillStyle = fill; ctx.fill();
    if (stroke) { ctx.lineWidth = 2; ctx.strokeStyle = stroke; ctx.stroke(); }
  }

  function star(cx, cy, r, fill) {
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var a = -1.5708 + i * 0.62832, rad = i % 2 ? r * .45 : r;
      ctx[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
    }
    ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
  }

  /* ---------------- buttons ---------------- */
  function button(id, x, y, w, h, label, opts) {
    opts = opts || {};
    var b = { id: id, x: x - 4, y: y - 4, w: w + 8, h: h + 8 };
    btns.push(b);
    var held = false, k;
    for (k in pointers) if (pointers[k].btn === id && inRect(pointers[k].x, pointers[k].y, b)) held = true;
    var dis = !!opts.disabled;
    var bg = opts.bg || '#3a3048';
    if (opts.on) bg = opts.onBg || '#ffcf5c';
    if (dis) bg = '#2a2434';
    ctx.save();
    if (held && !dis) { ctx.translate(0, 2); }
    rr(x, y, w, h, opts.r === undefined ? 12 : opts.r);
    ctx.fillStyle = bg; ctx.fill();
    if (!dis) { ctx.lineWidth = 2; ctx.strokeStyle = opts.on ? '#fff0c4' : '#544868'; ctx.stroke(); }
    var fg = opts.fg || (opts.on ? '#2a2018' : (dis ? '#5b5468' : '#f2e9dc'));
    if (opts.draw) opts.draw(x, y, w, h, fg);
    else text(label, x + w / 2, y + h / 2 + 1, opts.size || 16, fg, 'center');
    ctx.restore();
    return b;
  }

  function inRect(px, py, b) { return px >= b.x && py >= b.y && px <= b.x + b.w && py <= b.y + b.h; }

  function hitButton(px, py) {
    for (var i = btns.length - 1; i >= 0; i--) if (inRect(px, py, btns[i])) return btns[i];
    return null;
  }

  /* ---------------- fx ---------------- */
  function burst(x, y, col, n) {
    for (var i = 0; i < n; i++) {
      if (parts.length >= MAXP) parts.shift();
      var a = Math.random() * 6.2832, sp = 40 + Math.random() * 150;
      parts.push({
        x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
        life: 0.35 + Math.random() * 0.35, t: 0, c: col, s: 2 + Math.random() * 4
      });
    }
  }
  function ghost(x, y, c, sp) {
    if (ghosts.length >= MAXG) ghosts.shift();
    ghosts.push({ x: x, y: y, c: c, sp: sp || 0, t: 0, max: 0.22 });
  }
  function beam(x, y, kind) {
    if (beams.length >= MAXB) beams.shift();
    beams.push({ x: x, y: y, k: kind, t: 0, max: 0.32 });
  }
  function floatText(s, x, y, col) {
    if (floats.length >= MAXF) floats.shift();
    floats.push({ s: s, x: x, y: y, c: col || '#ffcf5c', t: 0, max: 0.9 });
  }
  function shake(m) { shakeM = Math.min(14, shakeM + m); shakeT = 0.3; }
  function say(s) { toast = s; toastT = 2.2; }

  function clearFx() {
    parts.length = 0; ghosts.length = 0; beams.length = 0; floats.length = 0;
    shakeT = 0; shakeM = 0; flashT = 0;
    for (var i = 0; i < 128; i++) off[i] = 0;
    for (i = 0; i < 64; i++) pop[i] = 0;
  }

  /* ---------------- level control ---------------- */
  function startLevel(i) {
    lvIdx = Math.max(0, Math.min(LEVELS.length - 1, i | 0));
    resetInput();
    clearFx();
    st = new E.State(LEVELS[lvIdx]);
    // settle any cascade the initial board happens to allow, silently
    var guard = 0;
    while (guard++ < 60) {
      var r = st.clearStep();
      if (!r) break;
      st.gravity(); st.collectKeys();
    }
    st.score = 0;
    for (var g = 0; g < st.goals.length; g++) st.goals[g].have = 0;
    st.chain = 0;
    if (!st.hasMove() && !st.shuffle()) st = new E.State(LEVELS[lvIdx]);
    phase = 'idle'; ptimer = 0; result = null;
    idleT = 0; hintMove = null;
    cur.x = 3; cur.y = 7;
    screen = 'play';
    say('Swipe to swap two tiles — line up 3 or more.');
  }

  function cellRect(x, y) {
    var i = y * 8 + x;
    return { x: BX + x * CELL + off[i * 2], y: BY + y * CELL + off[i * 2 + 1] };
  }

  function setOff(i, dx, dy) { off[i * 2] = dx; off[i * 2 + 1] = dy; }

  /* ---------------- play controller ---------------- */
  function trySwap(x1, y1, x2, y2) {
    if (phase !== 'idle' || !st || st.over) return;
    if (!st.inb(x2, y2)) return;
    idleT = 0; hintMove = null;
    if (!st.canSwapCell(x1, y1) || !st.canSwapCell(x2, y2)) { A.bad(); shake(3); return; }
    var i1 = y1 * 8 + x1, i2 = y2 * 8 + x2;
    var dx = (x2 - x1) * CELL, dy = (y2 - y1) * CELL;
    if (st.testSwap(x1, y1, x2, y2)) {
      st.rawSwap(x1, y1, x2, y2);
      setOff(i1, dx, dy); setOff(i2, -dx, -dy);
      st.movesLeft--;
      st.ivyHitThisTurn = false;
      st.chain = 0;
      A.swap();
      phase = 'swap'; ptimer = 0.15;
    } else {
      // illegal: show the nudge without committing
      setOff(i1, dx * 0.45, dy * 0.45); setOff(i2, -dx * 0.45, -dy * 0.45);
      A.bad(); shake(2);
    }
    sel = null;
  }

  function applyResult(r) {
    if (!r) return;
    var i, c;
    for (i = 0; i < r.cleared.length; i++) {
      c = r.cleared[i];
      ghost(c.x, c.y, c.c, c.sp);
      burst(BX + c.x * CELL + CELL / 2, BY + c.y * CELL + CELL / 2, COLORS[c.c] || '#fff', c.slip ? 5 : 3);
    }
    for (i = 0; i < r.damaged.length; i++) {
      var d = r.damaged[i];
      var px = BX + d.x * CELL + CELL / 2, py = BY + d.y * CELL + CELL / 2;
      if (d.plate) burst(px, py, '#d9b26a', 6);
      else { burst(px, py, d.b === E.B_IVY ? '#5fc26a' : '#b98a54', 10); A.crack(); shake(3); }
    }
    for (i = 0; i < r.blasts.length; i++) {
      var b = r.blasts[i];
      beam(b.x, b.y, b.sp);
      A.rocket(); shake(5);
    }
    for (i = 0; i < r.specials.length; i++) {
      var s = r.specials[i];
      pop[s.i] = 0.3;
    }
    if (r.cleared.length) A.pop(st.chain);
    if (r.cleared.length >= 6) shake(3);
  }

  function doGravity() {
    var g = st.gravity();
    var i, m;
    for (i = 0; i < g.moves.length; i++) {
      m = g.moves[i];
      setOff(m.ty * 8 + m.tx, 0, (m.fy - m.ty) * CELL);
    }
    for (i = 0; i < g.spawns.length; i++) {
      var s = g.spawns[i];
      setOff(s.y * 8 + s.x, 0, -(s.y + 1.4) * CELL);
    }
    var got = st.collectKeys();
    for (i = 0; i < got.length; i++) {
      burst(BX + got[i].x * CELL + CELL / 2, BY + got[i].y * CELL + CELL / 2, '#ffcf5c', 16);
      floatText('KEY!', BX + got[i].x * CELL + CELL / 2, BY + got[i].y * CELL, '#ffcf5c');
      A.key(); shake(4);
    }
  }

  function endTurn() {
    var sp = st.spreadIvy();
    if (sp) {
      burst(BX + sp.x * CELL + CELL / 2, BY + sp.y * CELL + CELL / 2, '#5fc26a', 10);
      pop[sp.y * 8 + sp.x] = 0.3;
      say('The ivy spreads. Match beside it to cut it back.');
      A.crack();
    }
    if (!st.hasMove()) {
      if (!st.shuffle()) { startLevel(lvIdx); return; }
      for (var i = 0; i < 64; i++) pop[i] = 0.25;
      say('No moves left on the board — reshuffled, free of charge.');
      A.click();
    }
    if (st.goalsMet()) { finishLevel(true); return; }
    if (st.movesLeft <= 0) { finishLevel(false); return; }
    phase = 'idle'; idleT = 0;
  }

  function finishLevel(win) {
    st.over = win ? 1 : 2;
    phase = 'over';
    if (win) {
      var s = st.stars();
      var got = M.finish(lvIdx, s, st.score);
      result = { win: true, stars: s, score: st.score, got: got, shown: 0 };
      A.win(s);
      flashT = 0.4;
      for (var i = 0; i < 40; i++) {
        burst(DW / 2 + (Math.random() - 0.5) * 300, 200 + Math.random() * 200, COLORS[(Math.random() * 7) | 0], 1);
      }
    } else {
      result = { win: false, stars: 0, score: st.score, got: [], shown: 0 };
      A.lose();
    }
  }

  function useBooster(k, x, y) {
    if (!M.useBooster(k)) return;
    var list = [], i;
    if (k === 0) { list.push(y * 8 + x); A.crack(); shake(5); }
    else if (k === 1) { for (i = 0; i < 8; i++) list.push(y * 8 + i); beam(x, y, E.SP_ROW); A.rocket(); shake(7); }
    else {
      if (!st.shuffle()) { startLevel(lvIdx); return; }
      for (i = 0; i < 64; i++) pop[i] = 0.28;
      A.click(); say('Board shuffled.');
      boosterArmed = -1;
      return;
    }
    st.chain = 0;
    var r = st.blast(list);
    applyResult(r);
    boosterArmed = -1;
    phase = 'clear'; ptimer = 0.2;
  }

  /* ---------------- update ---------------- */
  function update(dt) {
    var i, p;
    // decay cell offsets
    var k = Math.exp(-dt * 15);
    for (i = 0; i < 128; i++) {
      if (off[i] !== 0) { off[i] *= k; if (Math.abs(off[i]) < 0.4) off[i] = 0; }
    }
    for (i = 0; i < 64; i++) if (pop[i] > 0) pop[i] = Math.max(0, pop[i] - dt);

    for (i = parts.length - 1; i >= 0; i--) {
      p = parts[i]; p.t += dt;
      if (p.t >= p.life) { parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 620 * dt;
    }
    for (i = ghosts.length - 1; i >= 0; i--) { ghosts[i].t += dt; if (ghosts[i].t >= ghosts[i].max) ghosts.splice(i, 1); }
    for (i = beams.length - 1; i >= 0; i--) { beams[i].t += dt; if (beams[i].t >= beams[i].max) beams.splice(i, 1); }
    for (i = floats.length - 1; i >= 0; i--) { floats[i].t += dt; floats[i].y -= 26 * dt; if (floats[i].t >= floats[i].max) floats.splice(i, 1); }
    if (shakeT > 0) { shakeT -= dt; if (shakeT <= 0) shakeM = 0; else shakeM *= Math.exp(-dt * 6); }
    if (flashT > 0) flashT -= dt;
    if (toastT > 0) toastT -= dt;
    if (galaT > 0) galaT -= dt;
    if (hintT > 0) hintT -= dt;

    if (screen !== 'play' || !st) return;

    if (phase === 'swap' || phase === 'clear' || phase === 'fall') {
      ptimer -= dt;
      if (ptimer <= 0) {
        if (phase === 'swap') {
          var r0 = st.clearStep();
          if (r0) { applyResult(r0); phase = 'clear'; ptimer = 0.2; }
          else { endTurn(); }
        } else if (phase === 'clear') {
          doGravity(); phase = 'fall'; ptimer = 0.22;
        } else {
          var r1 = st.clearStep();
          if (r1) { applyResult(r1); phase = 'clear'; ptimer = 0.2; }
          else { endTurn(); }
        }
      }
    } else if (phase === 'idle') {
      idleT += dt;
      if (idleT > 5 && !hintMove) {
        var moves = st.listMoves();
        hintMove = moves.length ? moves[(Math.random() * moves.length) | 0] : null;
      }
    }
  }

  /* ---------------- render: board ---------------- */
  function drawTile(x, y, c, sp, sc) {
    var r = cellRect(x, y);
    var cx = r.x + CELL / 2, cy = r.y + CELL / 2;
    var rad = CELL * 0.36 * (sc === undefined ? 1 : sc);
    if (rad <= 0.5) return;
    shape(cx, cy, rad, c % 7, COLORS[c % 7], DARK[c % 7]);
    ctx.globalAlpha = 0.35;
    shape(cx - rad * 0.25, cy - rad * 0.3, rad * 0.3, 0, '#ffffff');
    ctx.globalAlpha = 1;
    if (sp) {
      ctx.save();
      ctx.strokeStyle = '#fff6dd'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath();
      if (sp === E.SP_ROW) { ctx.moveTo(cx - rad, cy); ctx.lineTo(cx + rad, cy); }
      else if (sp === E.SP_COL) { ctx.moveTo(cx, cy - rad); ctx.lineTo(cx, cy + rad); }
      else if (sp === E.SP_BOMB) { ctx.arc(cx, cy, rad * 0.62, 0, 6.2832); }
      else { for (var i = 0; i < 4; i++) { var a = i * 0.7854 * 2 + 0.3927; ctx.moveTo(cx + Math.cos(a) * rad * .3, cy + Math.sin(a) * rad * .3); ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad); } }
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawKey(x, y) {
    var r = cellRect(x, y);
    var cx = r.x + CELL / 2, cy = r.y + CELL / 2;
    ctx.fillStyle = '#ffcf5c';
    ctx.beginPath(); ctx.arc(cx, cy - 7, 8, 0, 6.2832); ctx.fill();
    ctx.fillStyle = '#171320';
    ctx.beginPath(); ctx.arc(cx, cy - 7, 3.2, 0, 6.2832); ctx.fill();
    ctx.fillStyle = '#ffcf5c';
    ctx.fillRect(cx - 2.5, cy - 2, 5, 16);
    ctx.fillRect(cx - 2.5, cy + 6, 9, 3.4);
    ctx.fillRect(cx - 2.5, cy + 11, 7, 3.4);
  }

  function drawBlocker(x, y, b) {
    var px = BX + x * CELL, py = BY + y * CELL;
    if (b === E.B_CRATE) {
      rr(px + 4, py + 4, CELL - 8, CELL - 8, 5);
      ctx.fillStyle = '#8a6440'; ctx.fill();
      ctx.strokeStyle = '#5d4128'; ctx.lineWidth = 3; ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(px + 7, py + 7); ctx.lineTo(px + CELL - 7, py + CELL - 7);
      ctx.moveTo(px + CELL - 7, py + 7); ctx.lineTo(px + 7, py + CELL - 7);
      ctx.strokeStyle = '#6d4d2f'; ctx.lineWidth = 4; ctx.stroke();
    } else {
      rr(px + 3, py + 3, CELL - 6, CELL - 6, 9);
      ctx.fillStyle = '#2f5c31'; ctx.fill();
      ctx.strokeStyle = '#5fc26a'; ctx.lineWidth = 2; ctx.stroke();
      ctx.strokeStyle = '#5fc26a'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      for (var i = 0; i < 3; i++) {
        ctx.beginPath();
        var yy = py + 12 + i * 10;
        ctx.moveTo(px + 8, yy);
        ctx.quadraticCurveTo(px + CELL / 2, yy + (i % 2 ? 9 : -9), px + CELL - 8, yy);
        ctx.stroke();
      }
    }
  }

  function drawBoard() {
    var i, x, y, cc;
    // frame
    rr(BX - 6, BY - 6, BW + 12, BW + 12, 14);
    ctx.fillStyle = '#241d31'; ctx.fill();
    ctx.strokeStyle = '#3d3350'; ctx.lineWidth = 3; ctx.stroke();

    ctx.save();
    rr(BX - 3, BY - 3, BW + 6, BW + 6, 12);
    ctx.clip();

    for (y = 0; y < 8; y++) for (x = 0; x < 8; x++) {
      cc = st.at(x, y);
      var px = BX + x * CELL, py = BY + y * CELL;
      ctx.fillStyle = ((x + y) & 1) ? '#2b2338' : '#251e31';
      ctx.fillRect(px, py, CELL, CELL);
      if (cc.plate > 0) {
        ctx.fillStyle = cc.plate > 1 ? '#7a6136' : '#5e4d2e';
        ctx.fillRect(px + 2, py + 2, CELL - 4, CELL - 4);
        ctx.strokeStyle = '#a98c4e'; ctx.lineWidth = cc.plate > 1 ? 3 : 1.5;
        ctx.strokeRect(px + 3.5, py + 3.5, CELL - 7, CELL - 7);
        if (cc.plate > 1) {
          ctx.strokeStyle = '#d9b26a'; ctx.lineWidth = 1.5;
          ctx.strokeRect(px + 8.5, py + 8.5, CELL - 17, CELL - 17);
        }
      }
    }

    // selection + hint
    if (sel) {
      ctx.strokeStyle = '#ffcf5c'; ctx.lineWidth = 3;
      rr(BX + sel.x * CELL + 2, BY + sel.y * CELL + 2, CELL - 4, CELL - 4, 8); ctx.stroke();
    }
    if (hintMove && phase === 'idle') {
      var a = 0.35 + 0.3 * Math.sin(Date.now() / 180);
      ctx.globalAlpha = a; ctx.strokeStyle = '#8be0ff'; ctx.lineWidth = 3;
      rr(BX + hintMove[0] * CELL + 3, BY + hintMove[1] * CELL + 3, CELL - 6, CELL - 6, 8); ctx.stroke();
      rr(BX + hintMove[2] * CELL + 3, BY + hintMove[3] * CELL + 3, CELL - 6, CELL - 6, 8); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // ghosts (just-cleared tiles)
    for (i = 0; i < ghosts.length; i++) {
      var g = ghosts[i], t = g.t / g.max;
      ctx.globalAlpha = 1 - t;
      var gx = BX + g.x * CELL + CELL / 2, gy = BY + g.y * CELL + CELL / 2;
      shape(gx, gy, CELL * 0.36 * (1 + t * 0.7), g.c % 7, COLORS[g.c % 7]);
      ctx.globalAlpha = 1;
    }

    for (y = 0; y < 8; y++) for (x = 0; x < 8; x++) {
      cc = st.at(x, y);
      i = y * 8 + x;
      if (cc.b) { drawBlocker(x, y, cc.b); continue; }
      if (cc.key) { drawKey(x, y); continue; }
      if (cc.c >= 0) {
        var sc = 1;
        if (pop[i] > 0) sc = 1 + Math.sin(Math.min(1, pop[i] / 0.3) * 3.1416) * 0.28;
        drawTile(x, y, cc.c, cc.sp, sc);
      }
    }

    // beams
    for (i = 0; i < beams.length; i++) {
      var b = beams[i], bt = 1 - b.t / b.max;
      ctx.globalAlpha = bt * 0.8;
      ctx.fillStyle = '#fff6dd';
      if (b.k === E.SP_ROW) ctx.fillRect(BX, BY + b.y * CELL + CELL / 2 - 4 * bt, BW, 8 * bt);
      else if (b.k === E.SP_COL) ctx.fillRect(BX + b.x * CELL + CELL / 2 - 4 * bt, BY, 8 * bt, BW);
      else {
        ctx.beginPath();
        ctx.arc(BX + b.x * CELL + CELL / 2, BY + b.y * CELL + CELL / 2, (1 - bt) * CELL * 2.2, 0, 6.2832);
        ctx.lineWidth = 6 * bt; ctx.strokeStyle = '#fff6dd'; ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  /* ---------------- render: hud ---------------- */
  function goalIcon(g, x, y, r) {
    if (g.type === 'collect') shape(x, y, r, g.color % 7, COLORS[g.color % 7], DARK[g.color % 7]);
    else if (g.type === 'plates') {
      ctx.fillStyle = '#7a6136'; ctx.fillRect(x - r, y - r, r * 2, r * 2);
      ctx.strokeStyle = '#d9b26a'; ctx.lineWidth = 2; ctx.strokeRect(x - r + 1, y - r + 1, r * 2 - 2, r * 2 - 2);
    } else {
      ctx.fillStyle = '#ffcf5c';
      ctx.beginPath(); ctx.arc(x, y - r * .4, r * .5, 0, 6.2832); ctx.fill();
      ctx.fillRect(x - 2, y - r * .2, 4, r * 1.1);
      ctx.fillRect(x - 2, y + r * .4, 6, 2.6);
    }
  }

  function drawHud() {
    var L = LEVELS[lvIdx];
    button('back', 8, 8, 46, 42, '', { r: 11, bg: '#2c2439', draw: function (x, y, w, h, fg) {
      ctx.strokeStyle = fg; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x + w / 2 + 5, y + h / 2 - 8); ctx.lineTo(x + w / 2 - 5, y + h / 2); ctx.lineTo(x + w / 2 + 5, y + h / 2 + 8); ctx.stroke();
    } });
    text('Level ' + (lvIdx + 1) + ' · ' + L.name, DW / 2, 22, 15, '#f2e9dc', 'center');
    text('Score ' + st.score + '   Best ' + M.bestFor(lvIdx), DW / 2, 42, 12, '#9d92b3', 'center', 600);
    button('snd', DW - 54, 8, 46, 42, M.soundOn() ? '♪' : '×', { r: 11, bg: '#2c2439', size: 20 });

    // moves
    rr(15, 58, 66, 52, 11); ctx.fillStyle = '#2c2439'; ctx.fill();
    ctx.strokeStyle = st.movesLeft <= 4 ? '#e8564a' : '#3d3350'; ctx.lineWidth = 2; ctx.stroke();
    text('MOVES', 48, 71, 9, '#9d92b3', 'center');
    text(String(st.movesLeft), 48, 92, 24, st.movesLeft <= 4 ? '#e8564a' : '#f2e9dc', 'center');

    // goals
    var n = st.goals.length, gw = (DW - 15 - 89) / n;
    for (var i = 0; i < n; i++) {
      var g = st.goals[i], gx = 89 + i * gw;
      rr(gx + 2, 58, gw - 4, 52, 11); ctx.fillStyle = '#2c2439'; ctx.fill();
      var done = g.have >= g.need;
      ctx.strokeStyle = done ? '#5fc26a' : '#3d3350'; ctx.lineWidth = 2; ctx.stroke();
      goalIcon(g, gx + gw / 2, 76, 11);
      text(done ? '✓' : (g.need - g.have) + '', gx + gw / 2, 99, 15, done ? '#5fc26a' : '#f2e9dc', 'center');
    }
  }

  function drawBoosterBar() {
    var b = M.boosters();
    for (var i = 0; i < 3; i++) {
      var x = 15 + i * 124, w = 116;
      var have = b[i] > 0;
      button('b' + i, x, 492, w, 56, '', {
        r: 12, disabled: !have, on: boosterArmed === i,
        draw: function (idx) {
          return function (bx, by, bw, bh, fg) {
            var cx = bx + 26, cy = by + bh / 2;
            ctx.strokeStyle = fg; ctx.fillStyle = fg; ctx.lineWidth = 3; ctx.lineCap = 'round';
            if (idx === 0) {
              ctx.beginPath(); ctx.moveTo(cx - 8, cy + 9); ctx.lineTo(cx + 3, cy - 2); ctx.stroke();
              ctx.fillRect(cx - 1, cy - 12, 14, 8);
            } else if (idx === 1) {
              ctx.beginPath(); ctx.moveTo(cx - 10, cy); ctx.lineTo(cx + 8, cy); ctx.stroke();
              ctx.beginPath(); ctx.moveTo(cx + 3, cy - 6); ctx.lineTo(cx + 11, cy); ctx.lineTo(cx + 3, cy + 6); ctx.closePath(); ctx.fill();
            } else {
              ctx.beginPath(); ctx.arc(cx, cy, 9, 0.6, 5.2); ctx.stroke();
              ctx.beginPath(); ctx.moveTo(cx + 6, cy - 11); ctx.lineTo(cx + 11, cy - 4); ctx.lineTo(cx + 3, cy - 3); ctx.closePath(); ctx.fill();
            }
            text(BNAMES[idx], bx + 48, by + 21, 12, fg);
            text('x' + M.boosters()[idx], bx + 48, by + 38, 13, idx === boosterArmed ? fg : '#9d92b3');
          };
        }(i)
      });
    }
  }

  function drawPlay() {
    drawHud();
    drawBoard();
    drawBoosterBar();

    var hint = 'Swipe to swap — line up 3 or more.';
    if (boosterArmed === 0) hint = 'Tap any tile to smash it.';
    else if (boosterArmed === 1) hint = 'Tap a tile to clear its whole row.';
    else if (toastT > 0) hint = toast;
    text(hint, DW / 2, 566, 13, toastT > 0 ? '#ffcf5c' : '#9d92b3', 'center', 600);

    button('retry', 15, 582, 170, 50, 'Restart', { bg: '#2c2439' });
    button('rooms', 205, 582, 170, 50, 'Parlor ★ ' + M.freeStars(), { bg: '#2c2439' });

    var s = M.streak();
    text(s > 0 ? ('3★ streak: ' + s + ' — boosters earned, never bought') : 'Finish with moves to spare to earn boosters',
      DW / 2, 650, 11, '#6f6785', 'center', 600);
  }

  /* ---------------- overlays ---------------- */
  function panel(x, y, w, h) {
    ctx.fillStyle = 'rgba(10,8,16,0.78)';
    ctx.fillRect(0, 0, DW, DH);
    rr(x, y, w, h, 18);
    ctx.fillStyle = '#241d31'; ctx.fill();
    ctx.strokeStyle = '#4a3f60'; ctx.lineWidth = 3; ctx.stroke();
  }

  function drawResult() {
    var w = 320, x = (DW - w) / 2, h = result.win ? 300 : 230, y = 190;
    panel(x, y, w, h);
    if (result.win) {
      text('Room Restored!', DW / 2, y + 40, 24, '#ffcf5c', 'center');
      for (var i = 0; i < 3; i++) {
        var got = i < result.stars;
        star(DW / 2 - 62 + i * 62, y + 100, got ? 30 : 22, got ? '#ffcf5c' : '#3a3048');
      }
      text('Score ' + result.score, DW / 2, y + 148, 16, '#f2e9dc', 'center');
      var msg = result.got.length
        ? ('Earned ' + result.got.map(function (b) { return BNAMES[b]; }).join(' + ') + '!')
        : (result.stars < 3 ? 'Finish with more moves left for a booster.' : '');
      text(msg, DW / 2, y + 174, 12, '#5fc26a', 'center', 600);
      button('next', x + 20, y + 196, w - 40, 50, lvIdx + 1 < LEVELS.length ? 'Next Level' : 'Back to Levels', { bg: '#ffcf5c', fg: '#2a2018' });
      button('rooms', x + 20, y + 252, (w - 50) / 2, 40, 'Parlor', { bg: '#2c2439', size: 14 });
      button('retry', x + 30 + (w - 50) / 2, y + 252, (w - 50) / 2, 40, 'Replay', { bg: '#2c2439', size: 14 });
    } else {
      text('Out of moves', DW / 2, y + 44, 22, '#f2e9dc', 'center');
      text('No lives, no waiting. Go again.', DW / 2, y + 74, 13, '#9d92b3', 'center', 600);
      button('retry', x + 20, y + 100, w - 40, 54, 'Try Again', { bg: '#ffcf5c', fg: '#2a2018' });
      button('back', x + 20, y + 166, w - 40, 44, 'Choose a level', { bg: '#2c2439', size: 14 });
    }
  }

  /* ---------------- level map ---------------- */
  function drawMap() {
    text('PARLOR POP', DW / 2, 44, 30, '#ffcf5c', 'center');
    text('★ ' + M.freeStars() + ' free · ' + M.totalStars() + ' of ' + (LEVELS.length * 3) + ' earned',
      DW / 2, 74, 13, '#9d92b3', 'center', 600);

    var unl = M.unlocked();
    for (var i = 0; i < LEVELS.length; i++) {
      var c = i % 4, r = (i / 4) | 0;
      var x = 9 + c * 96, y = 104 + r * 74;
      var open = i <= unl;
      var s = M.starsFor(i);
      button('lv' + i, x, y, 84, 64, '', {
        r: 12, disabled: !open,
        bg: s ? '#3d3a52' : '#3a3048',
        draw: function (idx, st2, op) {
          return function (bx, by, bw, bh, fg) {
            text(op ? String(idx + 1) : '•', bx + bw / 2, by + 22, 20, op ? '#f2e9dc' : '#5b5468', 'center');
            for (var k = 0; k < 3; k++) star(bx + bw / 2 - 18 + k * 18, by + 46, 8, k < st2 ? '#ffcf5c' : '#2a2434');
          };
        }(i, s, open)
      });
    }
    button('rooms', 15, 486, 170, 56, 'The Parlor', { bg: '#ffcf5c', fg: '#2a2018' });
    button('play', 205, 486, 170, 56, 'Play Level ' + (unl + 1), { bg: '#3a3048' });
    text('Match 3+ tiles, clear each room’s goals, spend stars on furnishings.',
      DW / 2, 566, 12, '#9d92b3', 'center', 600);
    text('Free by design: no lives, no timers, nothing to buy.', DW / 2, 588, 12, '#6f6785', 'center', 600);
    button('snd', 15, 616, 170, 46, 'Sound: ' + (M.soundOn() ? 'On' : 'Off'), { bg: '#2c2439', size: 14 });
    button('reset', 205, 616, 170, 46, 'Reset progress', { bg: '#2c2439', size: 14 });
  }

  /* ---------------- rooms ---------------- */
  function drawFurnishing(r, s, v, x, y, w, h) {
    // greybox furnishings: simple, readable silhouettes
    ctx.save();
    var f = ['#c7a06a', '#8fb3d9', '#d98f8f', '#9bd9a0', '#d9c98f', '#b39bd9'];
    if (r === 0) {
      if (s === 0) {
        if (v === 0) { ctx.fillStyle = '#9d9384'; ctx.fillRect(x, y + h * .3, w, h * .7); ctx.fillStyle = '#2a2018'; ctx.fillRect(x + w * .25, y + h * .55, w * .5, h * .45); ctx.fillStyle = '#f08a3c'; ctx.fillRect(x + w * .33, y + h * .75, w * .34, h * .25); }
        else { ctx.fillStyle = '#4a4450'; rr(x + w * .15, y + h * .25, w * .7, h * .75, 6); ctx.fill(); ctx.fillStyle = '#f08a3c'; ctx.beginPath(); ctx.arc(x + w * .5, y + h * .62, w * .16, 0, 6.28); ctx.fill(); ctx.fillStyle = '#6b6470'; ctx.fillRect(x + w * .42, y, w * .12, h * .3); }
      } else if (s === 1) {
        if (v === 0) { for (var i = 0; i < 2; i++) { var bx = x + i * w * .55; ctx.fillStyle = f[0]; rr(bx, y + h * .35, w * .42, h * .65, 6); ctx.fill(); ctx.fillStyle = '#8a6a44'; ctx.fillRect(bx + w * .04, y + h * .1, w * .34, h * .3); } }
        else { ctx.fillStyle = f[0]; rr(x, y + h * .4, w, h * .6, 8); ctx.fill(); ctx.fillStyle = '#8a6a44'; rr(x + w * .04, y + h * .12, w * .92, h * .34, 6); ctx.fill(); }
      } else {
        if (v === 0) { for (var j = 0; j < 2; j++) { var sx = x + j * w * .7 + w * .1; ctx.fillStyle = '#d9c98f'; ctx.beginPath(); ctx.arc(sx, y + h * .4, w * .1, 0, 6.28); ctx.fill(); ctx.fillStyle = '#ffcf5c'; ctx.globalAlpha = .35; ctx.beginPath(); ctx.arc(sx, y + h * .4, w * .2, 0, 6.28); ctx.fill(); ctx.globalAlpha = 1; } }
        else { ctx.strokeStyle = '#6b6470'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + w * .5, y); ctx.lineTo(x + w * .5, y + h * .35); ctx.stroke(); ctx.fillStyle = '#d9c98f'; ctx.beginPath(); ctx.moveTo(x + w * .28, y + h * .62); ctx.lineTo(x + w * .72, y + h * .62); ctx.lineTo(x + w * .6, y + h * .35); ctx.lineTo(x + w * .4, y + h * .35); ctx.closePath(); ctx.fill(); }
      }
    } else if (r === 1) {
      if (s === 0) {
        ctx.fillStyle = '#8a6a44'; ctx.fillRect(x, y, w, h);
        for (var k = 0; k < 3; k++) {
          ctx.fillStyle = '#5d4128'; ctx.fillRect(x, y + k * h / 3 + h / 3 - 5, w, 5);
          if (v === 0) for (var b = 0; b < 6; b++) { ctx.fillStyle = COLORS[(b + k) % 7]; ctx.fillRect(x + 6 + b * (w - 12) / 6, y + k * h / 3 + 6, (w - 16) / 6 - 2, h / 3 - 13); }
        }
        if (v === 1) { ctx.globalAlpha = .3; ctx.fillStyle = '#8be0ff'; ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1; ctx.strokeStyle = '#cfd8e6'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2); }
      } else if (s === 1) {
        if (v === 0) { ctx.fillStyle = '#a7454a'; rr(x, y + h * .5, w, h * .5, 8); ctx.fill(); ctx.strokeStyle = '#d9c98f'; ctx.lineWidth = 3; ctx.strokeRect(x + 8, y + h * .58, w - 16, h * .34); }
        else { for (var t = 0; t < 12; t++) { ctx.fillStyle = t % 2 ? '#cfc3aa' : '#6b6470'; ctx.fillRect(x + (t % 4) * w / 4, y + h * .5 + ((t / 4) | 0) * h / 6, w / 4 - 2, h / 6 - 2); } }
      } else {
        ctx.fillStyle = '#1b2836'; ctx.fillRect(x, y, w, h);
        if (v === 0) { ctx.strokeStyle = '#cfd8e6'; ctx.lineWidth = 3; ctx.strokeRect(x, y, w, h); ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h); ctx.moveTo(x, y + h / 2); ctx.lineTo(x + w, y + h / 2); ctx.stroke(); }
        else { for (var q = 0; q < 4; q++) { ctx.fillStyle = COLORS[q * 2 % 7]; ctx.globalAlpha = .75; ctx.beginPath(); ctx.arc(x + w / 2, y + h, w * (.45 - q * .1), 3.1416, 6.2832); ctx.fill(); } ctx.globalAlpha = 1; }
      }
    } else {
      if (s === 0) {
        for (var p = 0; p < 4; p++) {
          var px2 = x + p * w / 4 + w / 8;
          if (v === 0) { ctx.fillStyle = '#3f8f4a'; for (var l = 0; l < 5; l++) { ctx.beginPath(); ctx.ellipse(px2, y + h * .7, w * .04, h * .3, (l - 2) * 0.4, 0, 6.28); ctx.fill(); } }
          else { ctx.fillStyle = '#5d4128'; ctx.fillRect(px2 - 3, y + h * .5, 6, h * .5); ctx.fillStyle = '#3f8f4a'; ctx.beginPath(); ctx.arc(px2, y + h * .38, w * .1, 0, 6.28); ctx.fill(); ctx.fillStyle = '#f2c14e'; ctx.beginPath(); ctx.arc(px2 + 5, y + h * .42, 4, 0, 6.28); ctx.fill(); }
        }
      } else if (s === 1) {
        if (v === 0) { ctx.fillStyle = '#5a6f7a'; rr(x + w * .1, y + h * .55, w * .8, h * .45, 10); ctx.fill(); ctx.fillStyle = '#3fc9c2'; rr(x + w * .16, y + h * .62, w * .68, h * .3, 8); ctx.fill(); }
        else { ctx.fillStyle = '#5a6f7a'; ctx.beginPath(); ctx.arc(x + w / 2, y + h * .85, w * .34, 3.1416, 6.2832 * .5 + 3.1416); ctx.fill(); ctx.fillRect(x + w / 2 - 4, y + h * .35, 8, h * .5); ctx.fillStyle = '#3fc9c2'; ctx.beginPath(); ctx.arc(x + w / 2, y + h * .32, w * .12, 0, 6.28); ctx.fill(); }
      } else {
        if (v === 0) { ctx.strokeStyle = '#8be0ff'; ctx.lineWidth = 3; for (var v2 = 0; v2 < 5; v2++) { ctx.beginPath(); ctx.moveTo(x + v2 * w / 4, y + h); ctx.lineTo(x + w / 2, y); ctx.stroke(); } }
        else { for (var sl = 0; sl < 7; sl++) { ctx.fillStyle = sl % 2 ? '#7a6136' : '#5d4128'; ctx.fillRect(x, y + sl * h / 7, w, h / 7 - 2); } }
      }
    }
    ctx.restore();
  }

  function drawRoomArt(r, x, y, w, h) {
    var R = M.ROOMS[r];
    ctx.fillStyle = R.wall; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = R.floor; ctx.fillRect(x, y + h * 0.72, w, h * 0.28);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    var spots = [[0.06, 0.3, 0.28, 0.55], [0.37, 0.34, 0.3, 0.52], [0.7, 0.16, 0.26, 0.55]];
    for (var s = 0; s < 3; s++) {
      var v = M.choiceFor(r, s);
      var sx = x + spots[s][0] * w, sy = y + spots[s][1] * h, sw = spots[s][2] * w, sh = spots[s][3] * h;
      if (v < 0) {
        ctx.setLineDash([6, 5]);
        ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 2;
        ctx.strokeRect(sx, sy, sw, sh);
        ctx.setLineDash([]);
        text(R.slots[s].name, sx + sw / 2, sy + sh / 2, 11, 'rgba(255,255,255,0.45)', 'center', 600);
      } else {
        drawFurnishing(r, s, v, sx, sy, sw, sh);
      }
    }
  }

  function drawRooms() {
    button('back', 8, 8, 46, 42, '', { r: 11, bg: '#2c2439', draw: function (x, y, w, h, fg) {
      ctx.strokeStyle = fg; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x + w / 2 + 5, y + h / 2 - 8); ctx.lineTo(x + w / 2 - 5, y + h / 2); ctx.lineTo(x + w / 2 + 5, y + h / 2 + 8); ctx.stroke();
    } });
    text('THE PARLOR', DW / 2, 22, 18, '#ffcf5c', 'center');
    text('★ ' + M.freeStars() + ' stars to spend', DW / 2, 42, 12, '#9d92b3', 'center', 600);

    for (var r = 0; r < 3; r++) {
      var done = M.roomDone(r);
      button('tab' + r, 15 + r * 121, 60, 113, 44, M.ROOMS[r].name.replace('The ', '') + (done ? ' ✓' : ''),
        { on: roomTab === r, size: 11, bg: '#2c2439' });
    }

    drawRoomArt(roomTab, 15, 116, 360, 210);

    var R = M.ROOMS[roomTab];
    var free = M.freeStars();
    for (var s = 0; s < 3; s++) {
      var y = 340 + s * 96;
      var cur2 = M.choiceFor(roomTab, s);
      var owned = cur2 >= 0;
      text(R.slots[s].name, 16, y + 10, 13, '#f2e9dc');
      text(owned ? 'restored · tap to swap style, free' : ('costs ★ ' + R.slots[s].cost),
        DW - 16, y + 10, 11, owned ? '#5fc26a' : (free >= R.slots[s].cost ? '#ffcf5c' : '#6f6785'), 'right', 600);
      for (var o = 0; o < 2; o++) {
        var afford = owned || free >= R.slots[s].cost;
        button('opt' + roomTab + '-' + s + '-' + o, 16 + o * 188, y + 22, 170, 54, R.slots[s].opts[o],
          { size: 13, on: cur2 === o, disabled: !afford, bg: '#2c2439' });
      }
    }
    text('Stars come from playing. Nothing here costs money.', DW / 2, 668, 11, '#6f6785', 'center', 600);
  }

  function drawGala() {
    ctx.fillStyle = '#171320'; ctx.fillRect(0, 0, DW, DH);
    for (var i = 0; i < 3; i++) drawRoomArt(i, 20, 96 + i * 150, 350, 138);
    text('THE PARLOR REOPENS', DW / 2, 46, 22, '#ffcf5c', 'center');
    text('Every room restored — all of it earned, none of it sold.', DW / 2, 72, 12, '#9d92b3', 'center', 600);
    text('Final stars: ★ ' + M.totalStars() + ' of ' + (LEVELS.length * 3), DW / 2, 560, 15, '#f2e9dc', 'center');
    button('rooms', 15, 586, 170, 54, 'Admire it', { bg: '#2c2439' });
    button('back', 205, 586, 170, 54, 'Keep playing', { bg: '#ffcf5c', fg: '#2a2018' });
  }

  /* ---------------- frame ---------------- */
  function drawFx() {
    var i;
    for (i = 0; i < parts.length; i++) {
      var p = parts[i];
      ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
      ctx.fillStyle = p.c;
      ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
    }
    ctx.globalAlpha = 1;
    for (i = 0; i < floats.length; i++) {
      var f = floats[i];
      ctx.globalAlpha = Math.max(0, 1 - f.t / f.max);
      text(f.s, f.x, f.y, 16, f.c, 'center');
    }
    ctx.globalAlpha = 1;
    if (flashT > 0) {
      ctx.globalAlpha = Math.min(0.5, flashT);
      ctx.fillStyle = '#fff6dd'; ctx.fillRect(0, 0, DW, DH);
      ctx.globalAlpha = 1;
    }
  }

  function render() {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.fillStyle = '#171320';
    ctx.fillRect(0, 0, DW, DH);
    btns.length = 0;

    ctx.save();
    if (shakeM > 0.2) ctx.translate((Math.random() - 0.5) * shakeM, (Math.random() - 0.5) * shakeM);

    if (screen === 'play' && st) {
      drawPlay();
      drawFx();
      if (result) drawResult();
    } else if (screen === 'map') { drawMap(); drawFx(); }
    else if (screen === 'rooms') { drawRooms(); drawFx(); }
    else if (screen === 'gala') { drawGala(); drawFx(); }
    ctx.restore();
  }

  var last = 0;
  function frame(ts) {
    root.requestAnimationFrame(frame);
    var dt = (ts - last) / 1000;
    last = ts;
    if (!isFinite(dt) || dt < 0) dt = 0;
    dt = Math.min(dt, 0.05);           // clamped delta
    if (paused) dt = 0;                // rotate overlay freezes the whole sim
    if (dt > 0) update(dt);
    render();
  }

  /* ---------------- actions ---------------- */
  function act(id) {
    A.click();
    if (id === 'back') {
      if (screen === 'play') { screen = 'map'; resetInput(); }
      else if (screen === 'gala') { screen = 'map'; resetInput(); }
      else { screen = 'play'; resetInput(); if (!st) startLevel(M.unlocked()); }
      return;
    }
    if (id === 'snd') { M.setSound(!M.soundOn()); A.setOn(M.soundOn()); return; }
    if (id === 'retry') { startLevel(lvIdx); return; }
    if (id === 'rooms') { screen = 'rooms'; resetInput(); return; }
    if (id === 'play') { startLevel(M.unlocked()); return; }
    if (id === 'reset') { M.reset(); startLevel(0); screen = 'map'; say('Progress reset.'); return; }
    if (id === 'next') {
      if (lvIdx + 1 < LEVELS.length) startLevel(lvIdx + 1);
      else { screen = 'map'; resetInput(); }
      return;
    }
    if (id.indexOf('lv') === 0) {
      var i = parseInt(id.slice(2), 10);
      if (M.isUnlocked(i)) startLevel(i);
      return;
    }
    if (id.indexOf('tab') === 0) { roomTab = parseInt(id.slice(3), 10); return; }
    if (id.indexOf('opt') === 0) {
      var p = id.slice(3).split('-');
      var r = +p[0], s = +p[1], o = +p[2];
      var had = M.choiceFor(r, s) >= 0;
      if (!had && M.freeStars() < M.ROOMS[r].slots[s].cost) return;
      M.setChoice(r, s, o);
      burst(DW / 2, 220, '#ffcf5c', 16);
      if (!had) { A.goal(); }
      if (M.allDone() && !had) { screen = 'gala'; galaT = 3; A.fanfare(); }
      return;
    }
    if (id.indexOf('b') === 0 && id.length === 2) {
      var k = parseInt(id.slice(1), 10);
      if (M.boosters()[k] <= 0 || phase !== 'idle' || result) return;
      if (k === 2) { useBooster(2); return; }
      boosterArmed = boosterArmed === k ? -1 : k;
      return;
    }
  }

  function boardCell(px, py) {
    var x = Math.floor((px - BX) / CELL), y = Math.floor((py - BY) / CELL);
    if (x < 0 || y < 0 || x > 7 || y > 7) return null;
    return { x: x, y: y };
  }

  /* ---------------- pointer handling (per-id) ---------------- */
  function onDown(e) {
    if (paused) return;
    var p = toDesign(e);
    var b = hitButton(p.x, p.y);
    var rec = { x: p.x, y: p.y, sx: p.x, sy: p.y, btn: b ? b.id : null, cell: null, moved: false };
    if (!b && screen === 'play' && !result && phase === 'idle') {
      rec.cell = boardCell(p.x, p.y);
      if (rec.cell) {
        if (boosterArmed >= 0) {
          useBooster(boosterArmed, rec.cell.x, rec.cell.y);
          rec.cell = null;
        } else if (st.canSwapCell(rec.cell.x, rec.cell.y)) {
          sel = { x: rec.cell.x, y: rec.cell.y };
          cur.x = rec.cell.x; cur.y = rec.cell.y;
        }
      }
    }
    pointers[e.pointerId] = rec;
  }

  function onMove(e) {
    var rec = pointers[e.pointerId];
    if (!rec || paused) return;
    var p = toDesign(e);
    rec.x = p.x; rec.y = p.y;
    if (!rec.cell || rec.moved) return;
    var dx = p.x - rec.sx, dy = p.y - rec.sy;
    if (Math.abs(dx) < 14 && Math.abs(dy) < 14) return;
    rec.moved = true;
    var tx = rec.cell.x, ty = rec.cell.y;
    if (Math.abs(dx) > Math.abs(dy)) tx += dx > 0 ? 1 : -1;
    else ty += dy > 0 ? 1 : -1;
    trySwap(rec.cell.x, rec.cell.y, tx, ty);
  }

  function onUp(e) {
    var rec = pointers[e.pointerId];
    delete pointers[e.pointerId];
    if (!rec || paused) return;
    if (rec.btn) {
      var b = hitButton(rec.x, rec.y);
      if (b && b.id === rec.btn) act(rec.btn);
      return;
    }
    // tap-to-select then tap-neighbour to swap
    if (rec.cell && !rec.moved) {
      var c = boardCell(rec.x, rec.y);
      if (c && sel && (Math.abs(c.x - sel.x) + Math.abs(c.y - sel.y)) === 1) trySwap(sel.x, sel.y, c.x, c.y);
      else if (c && sel && c.x === sel.x && c.y === sel.y) { /* keep selection */ }
    }
  }

  function onCancel(e) { delete pointers[e.pointerId]; }

  function releaseAll() { pointers = {}; keys = {}; sel = null; }

  /* ---------------- keyboard ---------------- */
  function onKey(e) {
    if (paused) return;
    var k = e.key;
    if (keys[k] && k !== 'ArrowLeft' && k !== 'ArrowRight' && k !== 'ArrowUp' && k !== 'ArrowDown') return;
    keys[k] = 1;
    var dx = 0, dy = 0;
    if (k === 'ArrowLeft') dx = -1; else if (k === 'ArrowRight') dx = 1;
    else if (k === 'ArrowUp') dy = -1; else if (k === 'ArrowDown') dy = 1;

    if (screen !== 'play') {
      if (k === 'Escape' || k === 'Backspace') { act('back'); e.preventDefault(); }
      if (screen === 'rooms' && (k === 'ArrowLeft' || k === 'ArrowRight')) { roomTab = (roomTab + dx + 3) % 3; e.preventDefault(); }
      if (screen === 'map' && (k === 'Enter' || k === ' ')) { act('play'); e.preventDefault(); }
      return;
    }
    if (result) {
      if (k === 'Enter' || k === ' ') act(result.win ? 'next' : 'retry');
      else if (k === 'Escape') act('back');
      e.preventDefault();
      return;
    }
    if (dx || dy) {
      e.preventDefault();
      if (sel && phase === 'idle') { trySwap(sel.x, sel.y, sel.x + dx, sel.y + dy); cur.x = Math.max(0, Math.min(7, cur.x + dx)); cur.y = Math.max(0, Math.min(7, cur.y + dy)); }
      else { cur.x = Math.max(0, Math.min(7, cur.x + dx)); cur.y = Math.max(0, Math.min(7, cur.y + dy)); }
      idleT = 0; hintMove = null;
      return;
    }
    if (k === 'Enter' || k === ' ') {
      e.preventDefault();
      if (boosterArmed >= 0) { useBooster(boosterArmed, cur.x, cur.y); return; }
      if (sel && sel.x === cur.x && sel.y === cur.y) sel = null;
      else if (st.canSwapCell(cur.x, cur.y)) { sel = { x: cur.x, y: cur.y }; A.click(); }
      return;
    }
    if (k === 'Escape') { if (boosterArmed >= 0) boosterArmed = -1; else if (sel) sel = null; else act('back'); e.preventDefault(); }
    if (k === 'r' || k === 'R') act('retry');
    if (k === '1' || k === '2' || k === '3') act('b' + (parseInt(k, 10) - 1));
  }

  function onKeyUp(e) { delete keys[e.key]; }

  /* ---------------- boot ---------------- */
  function boot() {
    cv = document.getElementById('cv');
    ctx = cv.getContext('2d');
    M.load();
    A.setOn(M.soundOn());
    fit();

    root.addEventListener('resize', fit);
    root.addEventListener('orientationchange', function () { later(fit, 60); });
    root.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', function () { checkOrientation(); if (document.hidden) resetInput(); });

    var opt = { passive: false };
    cv.addEventListener('pointerdown', function (e) { e.preventDefault(); onDown(e); }, opt);
    cv.addEventListener('pointermove', function (e) { e.preventDefault(); onMove(e); }, opt);
    cv.addEventListener('pointerup', function (e) { e.preventDefault(); onUp(e); }, opt);
    cv.addEventListener('pointercancel', function (e) { e.preventDefault(); onCancel(e); }, opt);
    cv.addEventListener('pointerleave', onCancel);
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    cv.addEventListener('touchstart', function (e) { e.preventDefault(); }, opt);
    cv.addEventListener('touchmove', function (e) { e.preventDefault(); }, opt);
    root.addEventListener('keydown', onKey);
    root.addEventListener('keyup', onKeyUp);

    var start = document.getElementById('start');
    var go = function (e) {
      if (e) e.preventDefault();
      A.unlock();
      A.setOn(M.soundOn());
      start.classList.remove('on');
      booted = true;
      M.markSeen();
      startLevel(M.unlocked());
      checkOrientation();
    };
    document.getElementById('startBtn').addEventListener('click', go);
    document.getElementById('startBtn').addEventListener('touchend', go, opt);
    start.addEventListener('click', go);

    startLevel(M.unlocked());
    screen = 'play';
    root.requestAnimationFrame(function (t) { last = t; root.requestAnimationFrame(frame); });
  }

  // small introspection hook used by the build-time harness (harmless at runtime)
  root.PP.game = {
    st: function () { return st; },
    screen: function () { return screen; },
    fx: function () { return { parts: parts.length, ghosts: ghosts.length, beams: beams.length, floats: floats.length, timers: timers.length, btns: btns.length }; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof globalThis !== 'undefined' ? globalThis : this);
