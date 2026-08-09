/* Reef Tiles - match-3 board + level screen */
(function () {
  'use strict';
  var G = window.G;
  var COLS = 7, ROWS = 8, NT = 6;
  var GEM = [
    { c: '#ff7a63', d: '#b8402f', n: 'Coral' },
    { c: '#5fd97a', d: '#2b8a45', n: 'Kelp' },
    { c: '#4fc9ef', d: '#1c7fa4', n: 'Bubble' },
    { c: '#ffd75e', d: '#c39118', n: 'Star' },
    { c: '#a98bff', d: '#6248b8', n: 'Pebble' },
    { c: '#ff8ad0', d: '#c0478d', n: 'Shell' }
  ];
  G.GEM = GEM;

  /* ---- deterministic level table ---- */
  G.LEVELS = 15;
  G.levelCfg = function (i) {
    var r = G.mulberry32(4242 + i * 911);
    var order = [0, 1, 2, 3, 4, 5];
    for (var k = order.length - 1; k > 0; k--) { var j = Math.floor(r() * (k + 1)); var t = order[k]; order[k] = order[j]; order[j] = t; }
    var n = i < 4 ? 1 : (i < 9 ? 2 : 3);
    var moves = 24 + (i % 3) * 2 + (n === 3 ? 4 : n === 2 ? 2 : 0);
    var per = Math.max(8, Math.round(moves * (0.40 + 0.008 * i)));
    var goals = [];
    for (var g = 0; g < n; g++) goals.push({ t: order[g], need: per, got: 0 });
    var base = 1100 + i * 110;
    return {
      idx: i, seed: 9001 + i * 137, moves: moves, goals: goals,
      stars: [base, Math.round(base * 1.8), Math.round(base * 2.6)],
      pearls: 18 + i * 3
    };
  };
  G.bandOf = function (i) { return i < 5 ? 0 : i < 10 ? 1 : 2; };
  G.BAND_COMFORT = [0, 30, 60];

  /* ---- board ---- */
  var B = G.board = {
    grid: [], rng: null, cfg: null, phase: 'idle', ph: 0,
    sel: null, cur: { r: 4, c: 3 }, swapA: null, swapB: null,
    score: 0, moves: 0, chain: 0, over: 0, pearlsWon: 0, starsWon: 0,
    flash: 0, dragId: -1, popped: []
  };

  function mk(t) { return { t: t, sp: 0, ox: 0, oy: 0, sc: 1, pop: 0 }; }

  function fill() {
    B.grid = [];
    for (var r = 0; r < ROWS; r++) {
      var row = [];
      for (var c = 0; c < COLS; c++) {
        var t, guard = 0;
        do {
          t = Math.floor(B.rng() * NT);
          guard++;
        } while (guard < 24 && (
          (c >= 2 && row[c - 1] && row[c - 2] && row[c - 1].t === t && row[c - 2].t === t) ||
          (r >= 2 && B.grid[r - 1][c].t === t && B.grid[r - 2][c].t === t)
        ));
        row.push(mk(t));
      }
      B.grid.push(row);
    }
    var guard2 = 0;
    while (!hasMove() && guard2++ < 30) shuffle();
    if (matchRuns().length || !hasMove()) rebuildPlayable();
  }

  function rebuildPlayable() {
    for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) {
      B.grid[r][c].t = (c + r * 2) % NT;
      B.grid[r][c].sp = 0; B.grid[r][c].pop = 0;
    }
    B.grid[0][0].t = 0; B.grid[0][1].t = 0; B.grid[0][2].t = 1; B.grid[0][3].t = 0;
    return hasMove();
  }

  function shuffle() {
    var list = [];
    for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) list.push(B.grid[r][c].t);
    for (var i = list.length - 1; i > 0; i--) { var j = Math.floor(B.rng() * (i + 1)); var t = list[i]; list[i] = list[j]; list[j] = t; }
    var k = 0;
    for (r = 0; r < ROWS; r++) for (c = 0; c < COLS; c++) { B.grid[r][c].t = list[k++]; B.grid[r][c].sp = 0; }
    if (matchRuns().length || !hasMove()) rebuildPlayable();
  }

  function matchRuns() {
    var runs = [];
    var r, c, s, i;
    for (r = 0; r < ROWS; r++) {
      s = 0;
      for (c = 1; c <= COLS; c++) {
        var same = c < COLS && B.grid[r][c].t === B.grid[r][s].t;
        if (!same) {
          if (c - s >= 3) { var cells = []; for (i = s; i < c; i++) cells.push(r * COLS + i); runs.push({ cells: cells, len: c - s, h: true }); }
          s = c;
        }
      }
    }
    for (c = 0; c < COLS; c++) {
      s = 0;
      for (r = 1; r <= ROWS; r++) {
        var same2 = r < ROWS && B.grid[r][c].t === B.grid[s][c].t;
        if (!same2) {
          if (r - s >= 3) { var cl = []; for (i = s; i < r; i++) cl.push(i * COLS + c); runs.push({ cells: cl, len: r - s, h: false }); }
          s = r;
        }
      }
    }
    return runs;
  }

  function hasMove() {
    function tryS(r, c, r2, c2) {
      if (r2 < 0 || r2 >= ROWS || c2 < 0 || c2 >= COLS) return false;
      var a = B.grid[r][c], b = B.grid[r2][c2];
      if (a.sp > 0 || b.sp > 0) return true;
      var t = a.t; a.t = b.t; b.t = t;
      var ok = matchRuns().length > 0;
      t = a.t; a.t = b.t; b.t = t;
      return ok;
    }
    for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) {
      if (tryS(r, c, r, c + 1) || tryS(r, c, r + 1, c)) return true;
    }
    return false;
  }
  B.hasMove = hasMove;

  function expand(set) {
    var q = [], guard = 0;
    set.forEach(function (k) { q.push(k); });
    while (q.length && guard++ < 600) {
      var k = q.pop(), r = (k / COLS) | 0, c = k % COLS, cell = B.grid[r][c];
      if (!cell) continue;
      if (cell.sp === 1) {
        for (var i = 0; i < COLS; i++) { var k1 = r * COLS + i; if (!set.has(k1)) { set.add(k1); q.push(k1); } }
        for (var j = 0; j < ROWS; j++) { var k2 = j * COLS + c; if (!set.has(k2)) { set.add(k2); q.push(k2); } }
        B.flash = Math.max(B.flash, 0.35); G.addShake(5); G.audio.sfx('special');
      } else if (cell.sp === 2) {
        var t = cell.t;
        for (var rr = 0; rr < ROWS; rr++) for (var cc = 0; cc < COLS; cc++) {
          if (B.grid[rr][cc].t === t) { var k3 = rr * COLS + cc; if (!set.has(k3)) { set.add(k3); q.push(k3); } }
        }
        B.flash = Math.max(B.flash, 0.5); G.addShake(7); G.audio.sfx('special');
      }
    }
  }

  function cellXY(r, c) {
    var L = B.geo;
    return { x: L.x + c * L.cs + L.cs / 2, y: L.y + r * L.cs + L.cs / 2 };
  }

  function resolve(origin) {
    var runs = matchRuns();
    var forced = [];
    if (origin) {
      [B.swapA, B.swapB].forEach(function (p) {
        if (p && B.grid[p.r][p.c].sp > 0) forced.push(p.r * COLS + p.c);
      });
    }
    if (!runs.length && !forced.length) return false;

    var set = new Set();
    runs.forEach(function (run) { run.cells.forEach(function (k) { set.add(k); }); });
    forced.forEach(function (k) { set.add(k); });

    // specials to create
    var creates = [];
    runs.forEach(function (run) {
      if (run.len < 4) return;
      var k = run.cells[Math.floor(run.len / 2)];
      if (origin) {
        var ok = origin.r * COLS + origin.c;
        if (run.cells.indexOf(ok) >= 0) k = ok;
      }
      creates.push({ k: k, sp: run.len >= 5 ? 2 : 1, t: B.grid[(k / COLS) | 0][k % COLS].t });
    });

    expand(set);
    creates.forEach(function (cr) { set.delete(cr.k); });

    B.chain++;
    var mult = Math.min(6, B.chain);
    var counted = 0;
    set.forEach(function (k) {
      var r = (k / COLS) | 0, c = k % COLS, cell = B.grid[r][c];
      if (!cell) return;
      counted++;
      B.score += 25 * mult;
      B.cfg.goals.forEach(function (g) { if (g.t === cell.t && g.got < g.need) g.got++; });
      var p = cellXY(r, c);
      G.spark(p.x, p.y, GEM[cell.t].c, 4, 130, 0.45, 220, B.geo.cs * 0.11);
      cell.pop = 0.01;
    });
    B.clearing = set;
    B.creates = creates;
    B.phase = 'clear'; B.ph = 0;
    G.audio.sfx('match', Math.min(5, B.chain - 1));
    if (counted >= 6) G.addShake(4);
    return true;
  }

  function applyClear() {
    var set = B.clearing;
    set.forEach(function (k) {
      var r = (k / COLS) | 0, c = k % COLS;
      B.grid[r][c] = null;
    });
    B.creates.forEach(function (cr) {
      var r = (cr.k / COLS) | 0, c = cr.k % COLS;
      var cell = B.grid[r][c];
      if (!cell) { cell = mk(cr.t); B.grid[r][c] = cell; }
      cell.sp = cr.sp; cell.t = cr.t; cell.sc = 1.5;
    });
    B.clearing = null; B.creates = null;
    // gravity
    for (var c2 = 0; c2 < COLS; c2++) {
      var write = ROWS - 1;
      for (var r2 = ROWS - 1; r2 >= 0; r2--) {
        var cell2 = B.grid[r2][c2];
        if (cell2) {
          if (write !== r2) {
            B.grid[write][c2] = cell2;
            B.grid[r2][c2] = null;
            cell2.oy = (r2 - write) * B.geo.cs;
          }
          write--;
        }
      }
      var spawn = 1;
      for (var r3 = write; r3 >= 0; r3--) {
        var nc = mk(Math.floor(B.rng() * NT));
        nc.oy = -(spawn++) * B.geo.cs - 8;
        B.grid[r3][c2] = nc;
      }
    }
    B.phase = 'fall'; B.ph = 0;
  }

  function trySwap(r, c, r2, c2) {
    if (B.phase !== 'idle' || B.over) return;
    if (r2 < 0 || r2 >= ROWS || c2 < 0 || c2 >= COLS) return;
    B.swapA = { r: r, c: c }; B.swapB = { r: r2, c: c2 };
    var a = B.grid[r][c], b = B.grid[r2][c2];
    B.grid[r][c] = b; B.grid[r2][c2] = a;
    var cs = B.geo.cs;
    b.ox = (c2 - c) * cs; b.oy = (r2 - r) * cs;
    a.ox = (c - c2) * cs; a.oy = (r - r2) * cs;
    B.phase = 'swap'; B.ph = 0;
    B.sel = null;
    G.audio.sfx('swap');
  }

  function undoSwap() {
    var A = B.swapA, Bb = B.swapB;
    var a = B.grid[A.r][A.c], b = B.grid[Bb.r][Bb.c];
    B.grid[A.r][A.c] = b; B.grid[Bb.r][Bb.c] = a;
    var cs = B.geo.cs;
    b.ox = (Bb.c - A.c) * cs; b.oy = (Bb.r - A.r) * cs;
    a.ox = (A.c - Bb.c) * cs; a.oy = (A.r - Bb.r) * cs;
    B.phase = 'back'; B.ph = 0;
    G.audio.sfx('bad');
  }

  /* ---- public level API ---- */
  B.start = function (i) {
    B.cfg = G.levelCfg(i);
    B.rng = G.mulberry32(B.cfg.seed);
    B.score = 0; B.moves = B.cfg.moves; B.chain = 0; B.over = 0;
    B.sel = null; B.cur = { r: ROWS - 2, c: 3 }; B.phase = 'idle'; B.ph = 0;
    B.flash = 0; B.dragId = -1; B.pearlsWon = 0; B.starsWon = 0;
    B.clearing = null; B.creates = null;
    B.layout();
    fill();
    // clear pre-existing matches silently
    var guard = 0;
    while (matchRuns().length && guard++ < 40) {
      var runs = matchRuns();
      runs.forEach(function (run) {
        run.cells.forEach(function (k) {
          var r = (k / COLS) | 0, c = k % COLS;
          B.grid[r][c].t = Math.floor(B.rng() * NT);
        });
      });
    }
    if (!hasMove()) shuffle();
  };

  B.layout = function () {
    var pa = G.LAY.play;
    var top = pa.y + 66;
    var bot = pa.y + pa.h - 26;
    var cs = Math.min((pa.w - 18) / COLS, (bot - top) / ROWS);
    cs = Math.floor(cs);
    B.geo = { cs: cs, x: Math.round(pa.x + (pa.w - cs * COLS) / 2), y: Math.round(top + (bot - top - cs * ROWS) / 2), top: top };
  };

  B.update = function (dt) {
    if (!B.cfg) return;
    B.flash = Math.max(0, B.flash - dt * 2.2);
    var mul = Math.pow(1e-9, dt);
    var still = true;
    for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) {
      var cell = B.grid[r][c];
      if (!cell) continue;
      cell.ox *= mul; cell.oy *= mul;
      if (Math.abs(cell.ox) < 0.6) cell.ox = 0;
      if (Math.abs(cell.oy) < 0.6) cell.oy = 0;
      if (cell.ox || cell.oy) still = false;
      cell.sc += (1 - cell.sc) * Math.min(1, dt * 12);
      if (cell.pop > 0) cell.pop = Math.min(1, cell.pop + dt * 7);
    }
    B.ph += dt;

    if (B.phase === 'swap') {
      if (still || B.ph > 0.32) {
        var origin = B.swapB;
        if (!resolve(origin)) {
          undoSwap();
        } else {
          B.moves--;
        }
      }
    } else if (B.phase === 'back') {
      if (still || B.ph > 0.32) { B.phase = 'idle'; B.swapA = B.swapB = null; }
    } else if (B.phase === 'clear') {
      if (B.ph > 0.16) applyClear();
    } else if (B.phase === 'fall') {
      if (still || B.ph > 0.9) {
        if (!resolve(null)) {
          B.phase = 'idle'; B.chain = 0; B.swapA = B.swapB = null;
          var guard = 0;
          while (!hasMove() && guard++ < 20) shuffle();
          if (!hasMove()) rebuildPlayable();
          B.checkEnd();
        }
      }
    }
  };

  B.goalsDone = function () {
    return B.cfg.goals.every(function (g) { return g.got >= g.need; });
  };

  B.checkEnd = function () {
    if (B.over) return;
    if (B.goalsDone()) {
      B.over = 1;
      var st = 1;
      if (B.score >= B.cfg.stars[1]) st = 2;
      if (B.score >= B.cfg.stars[2]) st = 3;
      B.starsWon = st;
      G.onLevelWin(B.cfg.idx, st, B.score);
      G.audio.sfx('win');
      G.addShake(8);
    } else if (B.moves <= 0) {
      B.over = -1;
      G.audio.sfx('lose');
    }
  };

  /* ---- drawing ---- */
  function gemPath(x, y, s, t) {
    var c = G.ctx, i;
    c.beginPath();
    switch (t) {
      case 0: c.arc(x, y, s * 0.46, 0, 6.2832); break;
      case 1:
        c.moveTo(x, y - s * 0.5); c.quadraticCurveTo(x + s * 0.5, y, x, y + s * 0.5);
        c.quadraticCurveTo(x - s * 0.5, y, x, y - s * 0.5); break;
      case 2: c.arc(x, y, s * 0.44, 0, 6.2832); break;
      case 3:
        for (i = 0; i < 10; i++) {
          var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? s * 0.22 : s * 0.5;
          c[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        c.closePath(); break;
      case 4:
        c.moveTo(x, y - s * 0.5); c.lineTo(x + s * 0.44, y); c.lineTo(x, y + s * 0.5); c.lineTo(x - s * 0.44, y); c.closePath(); break;
      default:
        for (i = 0; i < 6; i++) {
          var a2 = -Math.PI / 2 + i * Math.PI / 3;
          c[i ? 'lineTo' : 'moveTo'](x + Math.cos(a2) * s * 0.47, y + Math.sin(a2) * s * 0.47);
        }
        c.closePath();
    }
  }

  G.drawGem = function (x, y, s, t, sp, alpha) {
    var c = G.ctx;
    c.globalAlpha = alpha === undefined ? 1 : alpha;
    c.fillStyle = GEM[t].d;
    gemPath(x, y + s * 0.06, s, t); c.fill();
    c.fillStyle = GEM[t].c;
    gemPath(x, y, s, t); c.fill();
    if (t === 2) { c.fillStyle = '#0a3346'; c.beginPath(); c.arc(x, y, s * 0.2, 0, 6.2832); c.fill(); }
    c.fillStyle = 'rgba(255,255,255,0.42)';
    c.beginPath(); c.ellipse(x - s * 0.14, y - s * 0.17, s * 0.13, s * 0.09, -0.5, 0, 6.2832); c.fill();
    if (sp === 1) {
      c.strokeStyle = '#fff'; c.lineWidth = Math.max(2, s * 0.07);
      c.beginPath(); c.moveTo(x - s * 0.3, y); c.lineTo(x + s * 0.3, y); c.stroke();
      c.beginPath(); c.moveTo(x, y - s * 0.3); c.lineTo(x, y + s * 0.3); c.stroke();
    } else if (sp === 2) {
      c.strokeStyle = '#fff'; c.lineWidth = Math.max(2, s * 0.06);
      for (var i = 0; i < 4; i++) {
        var a = i * Math.PI / 4 + performance.now() * 0.0012;
        c.beginPath(); c.moveTo(x + Math.cos(a) * s * 0.36, y + Math.sin(a) * s * 0.36);
        c.lineTo(x - Math.cos(a) * s * 0.36, y - Math.sin(a) * s * 0.36); c.stroke();
      }
    }
    c.globalAlpha = 1;
  };

  B.draw = function () {
    var c = G.ctx, L = B.geo, pa = G.LAY.play;
    // panel
    var px = pa.x + 10, py = pa.y + 6, pw = pa.w - 20, ph = 54;
    c.fillStyle = 'rgba(8,40,56,0.85)'; G.rr(px, py, pw, ph, 12); c.fill();
    c.strokeStyle = '#1d6a86'; c.lineWidth = 2; G.rr(px, py, pw, ph, 12); c.stroke();
    G.text('LV ' + (B.cfg.idx + 1), px + 12, py + 16, 13, '#8fd7f0');
    G.text(B.score.toString(), px + 12, py + 37, 20, '#fff');
    var mx = px + pw - 12;
    G.text('MOVES', mx, py + 16, 12, B.moves <= 3 ? '#ff8a7a' : '#8fd7f0', 'right');
    G.text(B.moves.toString(), mx, py + 37, 22, B.moves <= 3 ? '#ff8a7a' : '#fff', 'right');
    var gw = B.cfg.goals.length, gx = px + pw / 2 - (gw * 44) / 2 + 22;
    for (var i = 0; i < gw; i++) {
      var g = B.cfg.goals[i];
      G.drawGem(gx + i * 44, py + 22, 24, g.t, 0, g.got >= g.need ? 0.35 : 1);
      G.text(g.got >= g.need ? 'OK' : (g.need - g.got) + '', gx + i * 44, py + 43, 13, g.got >= g.need ? '#7fe3a0' : '#fff', 'center');
    }

    // board bg
    c.fillStyle = 'rgba(4,28,42,0.7)';
    G.rr(L.x - 5, L.y - 5, L.cs * COLS + 10, L.cs * ROWS + 10, 14); c.fill();
    c.save();
    G.rr(L.x - 5, L.y - 5, L.cs * COLS + 10, L.cs * ROWS + 10, 14); c.clip();
    for (var r = 0; r < ROWS; r++) for (var cc = 0; cc < COLS; cc++) {
      c.fillStyle = ((r + cc) & 1) ? 'rgba(255,255,255,0.030)' : 'rgba(255,255,255,0.055)';
      c.fillRect(L.x + cc * L.cs, L.y + r * L.cs, L.cs, L.cs);
    }
    // selection / cursor
    if (B.sel) {
      c.strokeStyle = '#ffe08a'; c.lineWidth = 3;
      G.rr(L.x + B.sel.c * L.cs + 2, L.y + B.sel.r * L.cs + 2, L.cs - 4, L.cs - 4, 8); c.stroke();
    }
    if (G.keyMode) {
      c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 2;
      G.rr(L.x + B.cur.c * L.cs + 3, L.y + B.cur.r * L.cs + 3, L.cs - 6, L.cs - 6, 8); c.stroke();
    }
    for (r = 0; r < ROWS; r++) for (cc = 0; cc < COLS; cc++) {
      var cell = B.grid[r] && B.grid[r][cc];
      if (!cell) continue;
      var p = cellXY(r, cc);
      var sc = cell.sc * (1 - cell.pop * 0.55);
      G.drawGem(p.x + cell.ox, p.y + cell.oy, L.cs * 0.86 * sc, cell.t, cell.sp, 1 - cell.pop * 0.6);
    }
    c.restore();
    if (B.flash > 0) {
      c.fillStyle = 'rgba(255,255,255,' + (B.flash * 0.5).toFixed(3) + ')';
      c.fillRect(L.x - 5, L.y - 5, L.cs * COLS + 10, L.cs * ROWS + 10);
    }
    G.text('Swipe to swap — match 3+ to fill the goals', pa.x + pa.w / 2, L.y + L.cs * ROWS + 18, 13, '#78b6cd', 'center', '600');
  };

  /* ---- input ---- */
  function cellAt(x, y) {
    var L = B.geo;
    var c = Math.floor((x - L.x) / L.cs), r = Math.floor((y - L.y) / L.cs);
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return null;
    return { r: r, c: c };
  }
  B.down = function (rec) {
    if (B.over || B.phase !== 'idle') return;
    if (B.dragId !== -1 && B.dragId !== rec.id) return;
    var cl = cellAt(rec.x, rec.y);
    if (!cl) return;
    B.dragId = rec.id;
    rec.cell = cl;
    B.sel = cl;
    G.keyMode = false;
  };
  B.move = function (rec) {
    if (rec.id !== B.dragId || !rec.cell || B.phase !== 'idle' || B.over) return;
    var dx = rec.x - rec.sx, dy = rec.y - rec.sy;
    var th = B.geo.cs * 0.4;
    if (Math.abs(dx) < th && Math.abs(dy) < th) return;
    var a = rec.cell;
    var r2 = a.r, c2 = a.c;
    if (Math.abs(dx) > Math.abs(dy)) c2 += dx > 0 ? 1 : -1; else r2 += dy > 0 ? 1 : -1;
    B.dragId = -1; rec.cell = null;
    trySwap(a.r, a.c, r2, c2);
  };
  B.up = function (rec) {
    if (rec.id === B.dragId) B.dragId = -1;
    if (!rec.cell) return;
    // tap-tap swap fallback
    var cl = cellAt(rec.x, rec.y);
    rec.cell = null;
    if (!cl) { B.sel = null; return; }
    if (B.tapSel && B.tapSel.r === cl.r && B.tapSel.c === cl.c) {
      B.tapSel = null; B.sel = null;
    } else if (B.tapSel && (Math.abs(B.tapSel.r - cl.r) + Math.abs(B.tapSel.c - cl.c)) === 1) {
      var s = B.tapSel; B.tapSel = null; B.sel = null;
      trySwap(s.r, s.c, cl.r, cl.c);
    } else {
      B.tapSel = cl; B.sel = cl;
    }
  };
  B.cancel = function (rec) {
    if (rec.id === B.dragId) B.dragId = -1;
    rec.cell = null;
    B.sel = B.tapSel || null;
  };
  B.resetInput = function () { B.dragId = -1; B.sel = null; B.tapSel = null; };

  B.key = function (k) {
    if (B.over) return false;
    var cur = B.cur;
    if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown') {
      var dr = k === 'ArrowUp' ? -1 : k === 'ArrowDown' ? 1 : 0;
      var dc = k === 'ArrowLeft' ? -1 : k === 'ArrowRight' ? 1 : 0;
      if (B.sel) {
        var s = B.sel; B.sel = null; B.tapSel = null;
        trySwap(s.r, s.c, s.r + dr, s.c + dc);
        B.cur = { r: G.clamp(s.r + dr, 0, ROWS - 1), c: G.clamp(s.c + dc, 0, COLS - 1) };
      } else {
        cur.r = G.clamp(cur.r + dr, 0, ROWS - 1);
        cur.c = G.clamp(cur.c + dc, 0, COLS - 1);
      }
      return true;
    }
    if (k === ' ' || k === 'Enter') {
      if (B.phase !== 'idle') return true;
      B.sel = B.sel ? null : { r: cur.r, c: cur.c };
      B.tapSel = B.sel;
      G.audio.sfx('tap');
      return true;
    }
    if (k === 'r' || k === 'R') { G.startLevel(B.cfg.idx); return true; }
    return false;
  };
})();
