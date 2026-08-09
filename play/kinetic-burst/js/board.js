/* Kinetic Burst - orb board, trace path, chain resolution */
'use strict';

var COLS = 6, ROWS = 5, CELL = 56, BX = 27, BY = 334;

var Board = {
  g: [],            // g[r][c] = {t, oy, pop, dead}
  path: [],         // [{c,r}]
  tracing: false,
  traceT: 0,
  traceId: null,
  cursor: { c: 2, r: 2 },
  kbTrace: false,

  init: function () {
    this.g = [];
    for (var r = 0; r < ROWS; r++) {
      var row = [];
      for (var c = 0; c < COLS; c++) row.push(this.newOrb(0));
      this.g.push(row);
    }
    this.clearTrace();
    this.cursor.c = 2; this.cursor.r = 2;
  },
  newOrb: function (oy) {
    // 4 orb types; hearts slightly rarer (rates shown in MATH panel)
    var t, roll = Math.random();
    if (roll < 0.19) t = 3; else t = (Math.random() * 3) | 0;
    return { t: t, oy: oy || 0, pop: 0, dead: false };
  },
  clearTrace: function () {
    this.path.length = 0;
    this.tracing = false;
    this.traceT = 0;
    this.traceId = null;
    this.kbTrace = false;
  },
  cx: function (c) { return BX + c * CELL + CELL / 2; },
  cy: function (r) { return BY + r * CELL + CELL / 2; },
  cellAt: function (px, py) {
    var c = Math.floor((px - BX) / CELL), r = Math.floor((py - BY) / CELL);
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return null;
    return { c: c, r: r };
  },
  inPath: function (c, r) {
    for (var i = 0; i < this.path.length; i++) if (this.path[i].c === c && this.path[i].r === r) return i;
    return -1;
  },
  start: function (c, r, id) {
    this.path.length = 0;
    this.path.push({ c: c, r: r });
    this.tracing = true;
    this.traceT = M.traceTime;
    this.traceId = id;
    Snd.link(0);
  },
  extend: function (c, r) {
    if (!this.tracing || !this.path.length) return false;
    var last = this.path[this.path.length - 1];
    if (last.c === c && last.r === r) return false;
    // backtrack support
    if (this.path.length >= 2) {
      var prev = this.path[this.path.length - 2];
      if (prev.c === c && prev.r === r) { this.path.pop(); Snd.link(0); return true; }
    }
    if (this.inPath(c, r) >= 0) return false;
    if (this.path.length >= M.maxPath) return false;
    var dc = c - last.c, dr = r - last.r;
    if (Math.abs(dc) > 1 || Math.abs(dr) > 1) {
      // fast drag skipped cells: walk the gap so the chain still links
      var cc = last.c, rr = last.r, added = false, guard = 0;
      while ((cc !== c || rr !== r) && guard++ < COLS + ROWS) {
        cc += Math.sign(c - cc);
        rr += Math.sign(r - rr);
        if (this.inPath(cc, rr) >= 0) return added;
        if (this.path.length >= M.maxPath) return added;
        this.path.push({ c: cc, r: rr });
        Snd.link(this.path.length);
        added = true;
      }
      return added;
    }
    this.path.push({ c: c, r: r });
    Snd.link(this.path.length);
    return true;
  },
  /* Split the traced path into scoring runs of same-type orbs (length >= minRun). */
  runs: function () {
    var out = [], cur = null, i, cell, t;
    for (i = 0; i < this.path.length; i++) {
      cell = this.path[i];
      t = this.g[cell.r][cell.c].t;
      if (cur && cur.t === t) cur.cells.push(cell);
      else { if (cur && cur.cells.length >= M.minRun) out.push(cur); cur = { t: t, cells: [cell] }; }
    }
    if (cur && cur.cells.length >= M.minRun) out.push(cur);
    return out;
  },
  /* live preview count of scoring orbs */
  previewCount: function () {
    var rs = this.runs(), n = 0;
    for (var i = 0; i < rs.length; i++) n += rs[i].cells.length;
    return { orbs: n, runs: rs.length };
  },
  markDead: function (cells) {
    for (var i = 0; i < cells.length; i++) {
      var o = this.g[cells[i].r][cells[i].c];
      if (o) { o.dead = true; o.pop = 1; }
    }
  },
  collapse: function () {
    for (var c = 0; c < COLS; c++) {
      var write = ROWS - 1;
      for (var r = ROWS - 1; r >= 0; r--) {
        var o = this.g[r][c];
        if (!o.dead) {
          if (write !== r) { o.oy = (write - r) * CELL; this.g[write][c] = o; }
          write--;
        }
      }
      for (var k = write; k >= 0; k--) {
        this.g[k][c] = this.newOrb((k + 2) * CELL);
      }
    }
  },
  update: function (dt) {
    for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) {
      var o = this.g[r][c];
      if (o.oy > 0) { o.oy -= (600 + o.oy * 6) * dt; if (o.oy < 0) o.oy = 0; }
      if (o.pop > 0) { o.pop -= dt * 5; if (o.pop < 0) o.pop = 0; }
    }
  },

  /* ---- rendering ---- */
  drawGlyph: function (ctx, t, x, y, rad) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#0b0d14';
    ctx.strokeStyle = '#0b0d14';
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (t === 0) { // POWER - triangle
      ctx.moveTo(0, -rad); ctx.lineTo(rad * 0.88, rad * 0.66); ctx.lineTo(-rad * 0.88, rad * 0.66); ctx.closePath(); ctx.fill();
    } else if (t === 1) { // SPEED - chevron
      ctx.moveTo(-rad * 0.85, -rad * 0.55); ctx.lineTo(0, rad * 0.15); ctx.lineTo(rad * 0.85, -rad * 0.55);
      ctx.lineTo(rad * 0.85, rad * 0.05); ctx.lineTo(0, rad * 0.75); ctx.lineTo(-rad * 0.85, rad * 0.05);
      ctx.closePath(); ctx.fill();
    } else if (t === 2) { // FOCUS - ring
      ctx.lineWidth = rad * 0.42;
      ctx.arc(0, 0, rad * 0.6, 0, Math.PI * 2); ctx.stroke();
    } else { // HEART - diamond cross
      ctx.moveTo(0, -rad * 0.95); ctx.lineTo(rad * 0.62, 0); ctx.lineTo(0, rad * 0.95); ctx.lineTo(-rad * 0.62, 0);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  },
  draw: function (ctx, active) {
    var r, c, i;
    // frame
    ctx.fillStyle = '#0d1119';
    rrect(ctx, BX - 6, BY - 6, COLS * CELL + 12, ROWS * CELL + 12, 12); ctx.fill();
    ctx.strokeStyle = active ? '#26314a' : '#1a2130'; ctx.lineWidth = 2; ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.rect(BX - 6, BY - 6, COLS * CELL + 12, ROWS * CELL + 12);
    ctx.clip();

    // orbs
    for (r = 0; r < ROWS; r++) for (c = 0; c < COLS; c++) {
      var o = this.g[r][c];
      var x = this.cx(c), y = this.cy(r) - o.oy;
      var idx = this.inPath(c, r);
      var rad = CELL * 0.40 * (1 + (o.pop > 0 ? o.pop * 0.35 : 0)) * (idx >= 0 ? 1.1 : 1);
      var col = ORBS[o.t].col;
      ctx.fillStyle = ORBS[o.t].dim;
      ctx.beginPath(); ctx.arc(x, y + 2, rad, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
      if (idx >= 0) {
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, y, rad + 3, 0, Math.PI * 2); ctx.stroke();
      }
      this.drawGlyph(ctx, o.t, x, y, rad * 0.72);
    }

    // path line
    if (this.path.length > 1) {
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 7;
      ctx.beginPath();
      for (i = 0; i < this.path.length; i++) {
        var p = this.path[i];
        var px = this.cx(p.c), py = this.cy(p.r) - this.g[p.r][p.c].oy;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(90,169,255,0.9)'; ctx.lineWidth = 3; ctx.stroke();
    }

    // keyboard cursor
    if (active && (Input.keys.__kb || this.kbTrace || KB.visible)) {
      var kx = this.cx(this.cursor.c), ky = this.cy(this.cursor.r);
      ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 3;
      rrect(ctx, kx - CELL / 2 + 3, ky - CELL / 2 + 3, CELL - 6, CELL - 6, 8); ctx.stroke();
    }
    ctx.restore();
  }
};

/* keyboard-visibility helper: cursor shows once any key is used */
var KB = { visible: false };
