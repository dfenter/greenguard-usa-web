/* Spire Ascent - world generation & rendering (original work) */
'use strict';

var VW = 390;          // virtual width
var WALL = 15;         // wall thickness
var ROW = 76;          // vertical spacing between generated rows
var PT = 12;           // platform thickness

function makeRng(seed) {
  var a = (seed >>> 0) || 1;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dailySeed() {
  var d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function World(seed, startY) {
  this.rng = makeRng(seed);
  this.startY = startY;
  this.plats = [];
  this.winds = [];
  this.spikes = [];   // wall spikes
  this.genY = startY;
  this.lastSpike = { 0: 1e9, 1: 1e9 };
  // guaranteed safe launch pad
  this.plats.push({ x: VW / 2 - 60, y: startY, w: 120, t: 'ledge', sp: 0, dead: 0, tmr: 0, ph: 0, amp: 0, bx: 0 });
  for (var i = 0; i < 14; i++) this.genRow();
}

World.prototype.diffAt = function (y) {
  return Math.min(1, (this.startY - y) / 7000);
};

World.prototype.mkPlat = function (y, w, d) {
  var r = this.rng;
  var minX = WALL + 8, maxX = VW - WALL - 8 - w;
  var x = minX + r() * (maxX - minX);
  // never park a platform inside a wall-spike band
  for (var si = 0; si < this.spikes.length; si++) {
    var sk = this.spikes[si];
    if (y > sk.y - 26 && y < sk.y + sk.h + 26) {
      if (sk.side === 0) x = Math.max(x, WALL + 46);
      else x = Math.min(x, VW - WALL - 46 - w);
    }
  }
  x = Math.max(minX, Math.min(maxX, x));
  var p = { x: x, y: y, w: w, t: 'ledge', sp: 0, dead: 0, tmr: 0, ph: r() * 6.283, amp: 0, bx: x };
  var q = r();
  if (q < 0.08) p.t = 'spring';
  else if (q < 0.20 + 0.20 * d) p.t = 'crumble';
  else if (q < 0.30 + 0.36 * d) {
    p.t = 'mover';
    p.amp = Math.min(52 + r() * 45, (maxX - minX) / 2);
    p.bx = Math.max(minX + p.amp, Math.min(maxX - p.amp, x));
    p.sp = (0.6 + r() * 0.8) * (r() < 0.5 ? -1 : 1);
  }
  // spike strip on part of the top (never the whole platform)
  if (p.t !== 'spring' && r() < 0.03 + 0.13 * d) {
    p.spike = r() < 0.5 ? 'L' : 'R';
    p.spw = p.w * (0.28 + r() * 0.14);
  }
  return p;
};

World.prototype.genRow = function () {
  var r = this.rng;
  this.genY -= ROW;
  var y = this.genY;
  var d = this.diffAt(y);

  // wall spike band (placed above this row so platforms above route around it)
  if (r() < 0.04 + 0.13 * d) {
    var side = r() < 0.5 ? 0 : 1;
    if (this.lastSpike[side] - (y - 30) > 270) {
      var sh = 40 + r() * 52;
      this.spikes.push({ side: side, y: y - 30 - sh, h: sh });
      this.lastSpike[side] = y - 30 - sh;
    }
  }

  var w1 = 62 + r() * 52 - 18 * d;
  var a = this.mkPlat(y, Math.max(44, w1), d);
  this.plats.push(a);

  if (r() < 0.5 - 0.26 * d) {
    var b = this.mkPlat(y - 12 - r() * 22, Math.max(42, 54 + r() * 44 - 16 * d), d);
    if (Math.abs((b.x + b.w / 2) - (a.x + a.w / 2)) > 92) this.plats.push(b);
  }

  // wind zone
  if (r() < 0.06 + 0.08 * d) {
    this.winds.push({ y: y - 40, h: 150 + r() * 130, f: (r() < 0.5 ? -1 : 1) * (70 + r() * 70), t: 0 });
  }
};

World.prototype.ensure = function (topY) {
  var guard = 0;
  while (this.genY > topY && guard++ < 400) this.genRow();
};

World.prototype.cull = function (botY) {
  var f = function (o) { return o.y < botY + 200; };
  if (this.plats.length > 90) this.plats = this.plats.filter(function (p) { return p.y < botY + 200; });
  if (this.winds.length > 20) this.winds = this.winds.filter(f);
  if (this.spikes.length > 20) this.spikes = this.spikes.filter(f);
};

World.prototype.update = function (dt) {
  for (var i = 0; i < this.plats.length; i++) {
    var p = this.plats[i];
    p.px = p.x;
    if (p.t === 'mover') {
      p.ph += dt * p.sp * 1.5;
      p.x = p.bx + Math.sin(p.ph) * p.amp;
    }
    if (p.t === 'crumble' && p.tmr > 0) {
      p.tmr -= dt;
      if (p.tmr <= 0) p.dead = 1;
    }
    p.dx = p.x - p.px;
  }
  for (var j = 0; j < this.winds.length; j++) this.winds[j].t += dt;
};

World.prototype.windAt = function (y) {
  var f = 0;
  for (var i = 0; i < this.winds.length; i++) {
    var w = this.winds[i];
    if (y < w.y + w.h && y > w.y) f += w.f;
  }
  return f;
};

/* ---------- drawing ---------- */

World.prototype.drawBack = function (g, camY, H, tint) {
  var grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#0a0713');
  grd.addColorStop(1, '#1a1030');
  g.fillStyle = grd; g.fillRect(0, 0, VW, H);

  // parallax masonry
  g.save();
  var par = camY * 0.35, bh = 54, bw = 74;
  var y0 = Math.floor((par - H) / bh) * bh;
  for (var y = y0; y < par + H + bh; y += bh) {
    var row = Math.floor(y / bh);
    for (var x = -bw; x < VW + bw; x += bw) {
      var sx = x + (row % 2 ? bw / 2 : 0);
      g.fillStyle = ((row + Math.floor(sx / bw)) % 2) ? 'rgba(255,255,255,0.022)' : 'rgba(255,255,255,0.010)';
      g.fillRect(sx + 2, y - par + 2, bw - 4, bh - 4);
    }
  }
  g.restore();

  // side walls
  var wg = g.createLinearGradient(0, 0, WALL, 0);
  wg.addColorStop(0, '#2a1c4e'); wg.addColorStop(1, '#150d2b');
  g.fillStyle = wg; g.fillRect(0, 0, WALL, H);
  var wg2 = g.createLinearGradient(VW - WALL, 0, VW, 0);
  wg2.addColorStop(0, '#150d2b'); wg2.addColorStop(1, '#2a1c4e');
  g.fillStyle = wg2; g.fillRect(VW - WALL, 0, WALL, H);
  g.fillStyle = 'rgba(140,110,255,0.20)';
  g.fillRect(WALL - 2, 0, 2, H); g.fillRect(VW - WALL, 0, 2, H);

  if (tint > 0) { g.fillStyle = 'rgba(255,70,20,' + (tint * 0.20).toFixed(3) + ')'; g.fillRect(0, 0, VW, H); }
};

World.prototype.drawWinds = function (g, camY, H) {
  for (var i = 0; i < this.winds.length; i++) {
    var w = this.winds[i], sy = w.y - camY;
    if (sy > H || sy + w.h < 0) continue;
    g.fillStyle = 'rgba(90,200,255,0.07)';
    g.fillRect(WALL, sy, VW - WALL * 2, w.h);
    g.strokeStyle = 'rgba(140,220,255,0.45)'; g.lineWidth = 2; g.lineCap = 'round';
    var dir = w.f > 0 ? 1 : -1;
    for (var k = 0; k < 7; k++) {
      var ly = sy + ((k + 0.5) / 7) * w.h;
      var t = (w.t * 130 * dir + k * 97) % (VW * 2);
      var lx = dir > 0 ? (WALL + ((t) % (VW - WALL * 2 + 60)) - 30) : (VW - WALL - ((t * -1 + 9999) % (VW - WALL * 2 + 60)) + 30);
      g.beginPath(); g.moveTo(lx, ly); g.lineTo(lx + 26 * dir, ly); g.stroke();
    }
  }
};

function spikeTeeth(g, x, y, w, up, col) {
  g.fillStyle = col; g.beginPath();
  var n = Math.max(2, Math.round(w / 9));
  for (var i = 0; i < n; i++) {
    var sx = x + (i / n) * w, sw = w / n;
    g.moveTo(sx, y); g.lineTo(sx + sw / 2, y - up); g.lineTo(sx + sw, y);
  }
  g.closePath(); g.fill();
}

World.prototype.drawSpikes = function (g, camY, H, tm) {
  for (var i = 0; i < this.spikes.length; i++) {
    var s = this.spikes[i], sy = s.y - camY;
    if (sy > H || sy + s.h < 0) continue;
    var pul = 0.55 + 0.45 * Math.sin(tm * 6 + s.y * 0.05);
    g.fillStyle = 'rgba(255,60,80,' + (0.16 * pul).toFixed(3) + ')';
    if (s.side === 0) g.fillRect(WALL, sy, 28, s.h); else g.fillRect(VW - WALL - 28, sy, 28, s.h);
    var bx = s.side === 0 ? WALL : VW - WALL, d = s.side === 0 ? 14 : -14;
    var n = Math.max(2, Math.round(s.h / 14)), th = s.h / n;
    g.fillStyle = '#ff3c50'; g.beginPath();
    for (var k = 0; k < n; k++) {
      var ty = sy + k * th;
      g.moveTo(bx, ty); g.lineTo(bx + d, ty + th / 2); g.lineTo(bx, ty + th);
    }
    g.closePath(); g.fill();
  }
};

World.prototype.drawPlats = function (g, camY, H) {
  for (var i = 0; i < this.plats.length; i++) {
    var p = this.plats[i];
    if (p.dead) continue;
    var sy = p.y - camY;
    if (sy > H + 20 || sy < -30) continue;
    var x = p.x, w = p.w, col = '#7f8ea8', top = '#c9d6ea';

    if (p.t === 'crumble') {
      var shake = p.tmr > 0 ? (Math.random() - 0.5) * 3 : 0;
      x += shake;
      var f = p.tmr > 0 ? p.tmr / 0.45 : 1;
      col = 'rgb(' + Math.round(150 + 80 * (1 - f)) + ',' + Math.round(105 * f + 40) + ',60)';
      top = '#e8a35c';
    } else if (p.t === 'spring') { col = '#1f7a52'; top = '#4dffa6'; }
    else if (p.t === 'mover') { col = '#3a4f8a'; top = '#8fb6ff'; }

    g.fillStyle = col; g.fillRect(x, sy, w, PT);
    g.fillStyle = top; g.fillRect(x, sy, w, 3);
    g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(x, sy + PT - 3, w, 3);

    if (p.t === 'spring') {
      var cx = x + w / 2;
      g.strokeStyle = '#4dffa6'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(cx - 11, sy - 3); g.lineTo(cx, sy - 12); g.lineTo(cx + 11, sy - 3); g.stroke();
    }
    if (p.t === 'crumble') {
      g.fillStyle = 'rgba(0,0,0,0.35)';
      for (var k = 1; k < 4; k++) g.fillRect(x + (w * k / 4), sy + 3, 2, PT - 5);
    }
    if (p.spike) {
      var sx = p.spike === 'L' ? x : x + w - p.spw;
      spikeTeeth(g, sx, sy, p.spw, 11, '#ff3c50');
    }
  }
};
