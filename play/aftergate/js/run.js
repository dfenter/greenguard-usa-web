/* Aftergate - RUN phase: steer the marching squad through gates. */
'use strict';

var LANE_L = 46, LANE_R = 494, SQUAD_Y = 742, TOTAL = 5200, RUN_SPEED = 252;
var MAX_SQUAD = 300;

var Run = {
  objs: [], prog: 0, n: 0, x: 270, vx: 0, done: false, wiped: false,
  hint: 0, inv: 0, flashT: 0, tail: [],

  init: function (startN) {
    this.objs.length = 0; this.tail.length = 0;
    this.prog = 0; this.n = startN || 5; this.x = (LANE_L + LANE_R) / 2;
    this.vx = 0; this.done = false; this.wiped = false; this.hint = 5.5;
    this.inv = 0; this.flashT = 0;
    this.gen();
  },

  gen: function () {
    var y = 620, i = 0, guard = 0;
    while (y < TOTAL - 380 && guard++ < 64) {
      var t = y / TOTAL, k = i % 4;
      if (k === 0 || k === 2) this.objs.push(this.mkGate(y, t));
      else if (k === 1) this.objs.push(this.mkMob(y, t));
      else this.objs.push(this.mkSaw(y, t));
      y += 330 + rndi(0, 90);
      i++;
    }
    // guaranteed final reward gate before the wall
    this.objs.push(this.mkGate(TOTAL - 300, 1));
    if (this.objs.length > 40) this.objs.length = 40;
  },

  mkGate: function (y, t) {
    var goods = [
      { op: 'mul', v: 2, s: '×2' },
      { op: 'add', v: 7 + Math.round(15 * t), s: '' },
      { op: 'add', v: 10 + Math.round(22 * t), s: '' },
      { op: 'add', v: 9 + Math.round(18 * t), s: '' }
    ];
    if (t > 0.7) goods.push({ op: 'mul', v: 3, s: '×3' });
    var bads = [
      { op: 'div', v: 2, s: '÷2' },
      { op: 'sub', v: 8 + Math.round(20 * t), s: '' },
      { op: 'div', v: 2, s: '÷2' },
      { op: 'sub', v: 12 + Math.round(26 * t), s: '' }
    ];
    var a, b;
    if (Math.random() < 0.66) { a = pick(goods); b = pick(bads); }
    else {
      a = pick(goods); b = pick(goods);
      if (a === b) b = { op: 'add', v: 6 + Math.round(10 * t), s: '' };
    }
    a = this.lbl(a); b = this.lbl(b);
    if (Math.random() < 0.5) { var tmp = a; a = b; b = tmp; }
    return { k: 'gate', y: y, L: a, R: b, hit: false };
  },
  lbl: function (o) {
    var c = { op: o.op, v: o.v, s: o.s };
    if (!c.s) c.s = (o.op === 'add' ? '+' : '−') + o.v;
    c.good = (o.op === 'add' || o.op === 'mul');
    return c;
  },

  mkMob: function (y, t) {
    var r = Math.random(), side;
    if (r < 0.29) side = 'L'; else if (r < 0.58) side = 'R'; else side = 'F';
    return { k: 'mob', y: y, side: side, size: -1, dead: false, hurt: 0 };
  },
  mkSaw: function (y, t) {
    return { k: 'saw', y: y, ph: rnd(0, 6.28), spd: 1.1 + t * 0.9, hit: false };
  },

  /* -------- update -------- */
  update: function (dt) {
    if (this.done) return;
    this.hint = Math.max(0, this.hint - dt);
    this.inv = Math.max(0, this.inv - dt);
    this.flashT = Math.max(0, this.flashT - dt);

    // steering: every pointer contributes its own delta (own pointerId)
    var ps = Input.list(), i;
    for (i = 0; i < ps.length; i++) { this.x += ps[i].dx * 1.06; ps[i].dx = 0; ps[i].dy = 0; }
    var kv = 0;
    if (Input.keys['ArrowLeft'] || Input.keys['a'] || Input.keys['A']) kv -= 1;
    if (Input.keys['ArrowRight'] || Input.keys['d'] || Input.keys['D']) kv += 1;
    this.x += kv * 430 * dt;
    this.x = clamp(this.x, LANE_L + 20, LANE_R - 20);

    var prev = this.prog;
    this.prog += RUN_SPEED * dt;

    // trail
    this.tail.push({ x: this.x, y: this.prog });
    if (this.tail.length > 26) this.tail.shift();

    for (i = 0; i < this.objs.length; i++) {
      var o = this.objs[i];
      if (o.k === 'gate') {
        if (!o.hit && prev < o.y && this.prog >= o.y) {
          o.hit = true;
          var side = (this.x < (LANE_L + LANE_R) / 2) ? o.L : o.R;
          this.applyOp(side, o.y);
        }
      } else if (o.k === 'mob') {
        if (o.size < 0 && o.y - this.prog < 900) o.size = Math.max(3, Math.round(this.n * (o.side === 'F' ? 0.32 : 0.44)));
        if (!o.dead && prev < o.y && this.prog >= o.y) {
          var span = this.mobSpan(o);
          if (this.x > span[0] - 14 && this.x < span[1] + 14) {
            o.dead = true;
            this.n -= o.size;
            Fx.pop(this.x, SQUAD_Y - 90, '−' + o.size, '#ff6b6b');
            Fx.burst(this.x, SQUAD_Y - 40, 18, '#ff5555', 300);
            Fx.kick(11); Fx.bang('#ff3b3b', 0.4); Sfx.thud();
            this.flashT = 0.25;
          }
        }
      } else if (o.k === 'saw') {
        o.ph += dt * o.spd;
        var sy = SQUAD_Y - (o.y - this.prog);
        if (!this.inv && Math.abs(sy - SQUAD_Y) < 40) {
          var bx = this.sawX(o, 0), bx2 = this.sawX(o, 1);
          if (Math.abs(bx - this.x) < 46 || Math.abs(bx2 - this.x) < 46) {
            var loss = Math.max(3, Math.round(this.n * 0.16));
            this.n -= loss; this.inv = 0.75;
            Fx.pop(this.x, SQUAD_Y - 90, '−' + loss, '#ffa04d');
            Fx.burst(this.x, SQUAD_Y, 14, '#ffa04d', 260);
            Fx.kick(9); Sfx.hit();
          }
        }
      }
    }

    if (this.n > MAX_SQUAD) this.n = MAX_SQUAD;
    if (this.n <= 0) { this.n = 0; this.done = true; this.wiped = true; return; }
    if (this.prog >= TOTAL) { this.done = true; this.wiped = false; }
  },

  applyOp: function (o, gy) {
    var before = this.n;
    if (o.op === 'mul') this.n = Math.round(this.n * o.v);
    else if (o.op === 'div') this.n = Math.floor(this.n / o.v);
    else if (o.op === 'add') this.n += o.v;
    else this.n -= o.v;
    if (this.n > MAX_SQUAD) this.n = MAX_SQUAD;
    var d = this.n - before;
    Fx.pop(this.x, SQUAD_Y - 100, (d >= 0 ? '+' : '−') + Math.abs(d), d >= 0 ? '#7ee0a8' : '#ff6b6b');
    Fx.burst(this.x, SQUAD_Y - 30, d >= 0 ? 16 : 12, d >= 0 ? '#7ee0a8' : '#ff6b6b', 260);
    if (d >= 0) { Sfx.good(); Fx.bang('#7ee0a8', 0.22); }
    else { Sfx.bad(); Fx.kick(7); Fx.bang('#ff3b3b', 0.3); }
  },

  mobSpan: function (o) {
    var mid = (LANE_L + LANE_R) / 2;
    if (o.side === 'L') return [LANE_L, mid];
    if (o.side === 'R') return [mid, LANE_R];
    return [LANE_L, LANE_R];
  },
  sawX: function (o, idx) {
    var mid = (LANE_L + LANE_R) / 2, amp = (LANE_R - LANE_L) / 2 - 40;
    return mid + Math.sin(o.ph + idx * Math.PI) * amp;
  },

  /* -------- draw -------- */
  draw: function (g) {
    // road
    g.fillStyle = '#171b25'; g.fillRect(0, 0, DW, DH);
    g.fillStyle = '#232a38'; g.fillRect(LANE_L, 0, LANE_R - LANE_L, DH);
    g.fillStyle = '#2e3748';
    g.fillRect(LANE_L - 8, 0, 8, DH); g.fillRect(LANE_R, 0, 8, DH);
    // moving stripes
    var st = 90, o0 = (this.prog % st);
    g.fillStyle = 'rgba(255,255,255,.045)';
    for (var y = -st + o0; y < DH; y += st) g.fillRect(LANE_L, y, LANE_R - LANE_L, 30);
    // centre dashes
    g.fillStyle = 'rgba(255,255,255,.09)';
    for (y = -60 + (this.prog % 120); y < DH; y += 120) g.fillRect(DW / 2 - 2, y, 4, 50);

    // finish line
    var fy = SQUAD_Y - (TOTAL - this.prog);
    if (fy > -80) {
      g.fillStyle = '#3d5a7d'; g.fillRect(LANE_L, fy - 26, LANE_R - LANE_L, 26);
      for (var c = 0; c < 12; c++) { g.fillStyle = c % 2 ? '#e8edf5' : '#12151c'; g.fillRect(LANE_L + c * (LANE_R - LANE_L) / 12, fy - 26, (LANE_R - LANE_L) / 12, 13); }
      txtO(g, 'THE WALL', DW / 2, fy - 52, 26, '#ffd479');
    }

    var i, o, sy;
    for (i = 0; i < this.objs.length; i++) {
      o = this.objs[i];
      sy = SQUAD_Y - (o.y - this.prog);
      if (sy < -200 || sy > DH + 120) continue;
      if (o.k === 'gate') this.drawGate(g, o, sy);
      else if (o.k === 'mob') this.drawMob(g, o, sy);
      else this.drawSaw(g, o, sy);
    }

    this.drawSquad(g);

    // top HUD
    g.fillStyle = 'rgba(8,10,15,.86)'; g.fillRect(0, 0, DW, 78);
    g.fillStyle = '#2a3345'; rr(g, 20, 46, DW - 40, 14, 7); g.fill();
    g.fillStyle = '#7ee0a8'; var pw = (DW - 44) * clamp(this.prog / TOTAL, 0, 1);
    rr(g, 22, 48, Math.max(4, pw), 10, 5); g.fill();
    txtO(g, 'SQUAD ' + this.n, 20, 26, 26, '#e8edf5', 'left');
    txtO(g, 'THE ROAD', DW - 20, 26, 20, '#9fb0c6', 'right');

    if (this.hint > 0) {
      g.globalAlpha = Math.min(1, this.hint);
      g.fillStyle = 'rgba(8,10,15,.8)'; rr(g, 30, DH - 96, DW - 60, 54, 12); g.fill();
      txtO(g, 'DRAG TO STEER — TAKE THE BIGGER GATE', DW / 2, DH - 69, 19, '#ffd479');
      g.globalAlpha = 1;
    }
  },

  drawGate: function (g, o, sy) {
    var mid = (LANE_L + LANE_R) / 2, h = 92;
    var halves = [[LANE_L, mid, o.L], [mid, LANE_R, o.R]];
    for (var i = 0; i < 2; i++) {
      var x0 = halves[i][0], x1 = halves[i][1], d = halves[i][2];
      var good = d.good;
      g.globalAlpha = o.hit ? 0.25 : 1;
      g.fillStyle = good ? 'rgba(60,190,130,.30)' : 'rgba(200,60,70,.30)';
      g.fillRect(x0 + 3, sy - h, x1 - x0 - 6, h);
      g.fillStyle = good ? '#3fd18a' : '#e8515f';
      g.fillRect(x0 + 3, sy - 10, x1 - x0 - 6, 10);
      txtO(g, d.s, (x0 + x1) / 2, sy - h / 2 - 4, 40, good ? '#a9f5cd' : '#ffb3ba');
      g.globalAlpha = 1;
    }
    g.fillStyle = '#0b0d12'; g.fillRect(mid - 3, sy - h, 6, h);
  },

  drawMob: function (g, o, sy) {
    if (o.dead) return;
    var sp = this.mobSpan(o), w = sp[1] - sp[0], h = 74;
    g.fillStyle = 'rgba(190,50,60,.22)'; g.fillRect(sp[0] + 4, sy - h, w - 8, h);
    g.strokeStyle = '#e8515f'; g.lineWidth = 4; g.strokeRect(sp[0] + 4, sy - h, w - 8, h);
    // greybox foes
    var cols = Math.max(2, Math.floor(w / 46));
    for (var c = 0; c < cols; c++) {
      var cx = sp[0] + 14 + c * ((w - 28) / cols) + ((w - 28) / cols) / 2;
      g.fillStyle = '#8f2b34'; g.fillRect(cx - 9, sy - h + 14, 18, 22);
      g.fillStyle = '#c04450'; g.fillRect(cx - 6, sy - h + 8, 12, 10);
    }
    txtO(g, o.size >= 0 ? String(o.size) : '?', (sp[0] + sp[1]) / 2, sy - 26, 34, '#ffb3ba');
  },

  drawSaw: function (g, o, sy) {
    for (var i = 0; i < 2; i++) {
      var x = this.sawX(o, i);
      g.save(); g.translate(x, sy - 34); g.rotate(o.ph * 3 + i);
      g.fillStyle = '#ffa04d';
      for (var t = 0; t < 6; t++) {
        g.rotate(Math.PI / 3);
        g.fillRect(-6, -36, 12, 20);
      }
      g.fillStyle = '#c9762f'; g.beginPath(); g.arc(0, 0, 22, 0, 6.284); g.fill();
      g.fillStyle = '#12151c'; g.beginPath(); g.arc(0, 0, 7, 0, 6.284); g.fill();
      g.restore();
    }
  },

  drawSquad: function (g) {
    var n = this.n, show = Math.min(30, n), i;
    if (this.inv > 0 && Math.floor(this.inv * 14) % 2) g.globalAlpha = 0.45;
    // trail dust
    g.fillStyle = 'rgba(255,255,255,.05)';
    for (i = 0; i < this.tail.length; i += 3) {
      var t = this.tail[i], ty = SQUAD_Y + (this.prog - t.y);
      if (ty < DH) g.fillRect(t.x - 12, ty, 24, 6);
    }
    for (i = 0; i < show; i++) {
      var row = Math.floor(i / 6), col = i % 6;
      var ox = (col - 2.5) * 17 + (row % 2 ? 8 : 0);
      var oy = row * 15;
      var wob = Math.sin(this.prog * 0.06 + i * 1.3) * 2.2;
      var px = this.x + ox, py = SQUAD_Y + oy + wob;
      g.fillStyle = this.flashT > 0 ? '#ffffff' : '#2f6ea8';
      g.fillRect(px - 6, py - 8, 12, 16);
      g.fillStyle = this.flashT > 0 ? '#ffffff' : '#8fd0ff';
      g.fillRect(px - 4, py - 15, 8, 8);
    }
    g.globalAlpha = 1;
    txtO(g, String(n), this.x, SQUAD_Y - 42, 42, '#8fd0ff');
  }
};
