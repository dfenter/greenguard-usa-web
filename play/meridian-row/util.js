/* Meridian Row - utilities: math, storage, timers, particles, floaters */
'use strict';

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function rint(n) { return (Math.random() * n) | 0; }
function rrange(a, b) { return a + Math.random() * (b - a); }
function pick(arr) { return arr[rint(arr.length)]; }
function easeOut(t) { return 1 - (1 - t) * (1 - t); }

/* ---------- storage (hardening #4: try/catch + type-validated) ---------- */
var Store = {
  KEY: 'meridianrow.v1',
  read: function () {
    var out = { boardsWon: 0, bestTurns: 0, level: 1 };
    var raw = null;
    try { raw = window.localStorage.getItem(Store.KEY); } catch (e) { return out; }
    if (typeof raw !== 'string' || raw.length === 0 || raw.length > 4000) return out;
    var o = null;
    try { o = JSON.parse(raw); } catch (e) { return out; }
    if (!o || typeof o !== 'object' || Array.isArray(o)) return out;
    out.boardsWon = Store.num(o.boardsWon, 0, 0, 9999);
    out.bestTurns = Store.num(o.bestTurns, 0, 0, 99999);
    out.level = Store.num(o.level, 1, 1, 99);
    return out;
  },
  num: function (v, dflt, lo, hi) {
    if (typeof v !== 'number' || !isFinite(v)) return dflt;
    v = Math.floor(v);
    if (v < lo || v > hi) return dflt;
    return v;
  },
  write: function (obj) {
    try {
      window.localStorage.setItem(Store.KEY, JSON.stringify({
        boardsWon: Store.num(obj.boardsWon, 0, 0, 9999),
        bestTurns: Store.num(obj.bestTurns, 0, 0, 99999),
        level: Store.num(obj.level, 1, 1, 99)
      }));
    } catch (e) { /* quota / private mode: ignore */ }
  }
};

/* ---------- game-clock timers (hardening #1 & #2) ----------
   No gameplay setTimeout anywhere: these advance only while the sim runs, so
   the rotate overlay freezes them, and clear() cancels everything on restart. */
function Timers() { this.list = []; }
Timers.prototype.add = function (delay, fn) {
  if (this.list.length > 48) this.list.splice(0, this.list.length - 48);
  var e = { t: delay, fn: fn };
  this.list.push(e);
  return e;
};
Timers.prototype.update = function (dt) {
  for (var i = this.list.length - 1; i >= 0; i--) {
    var e = this.list[i];
    if (e.dead) { this.list.splice(i, 1); continue; }
    e.t -= dt;
    if (e.t <= 0) {
      this.list.splice(i, 1);
      if (!e.dead) e.fn();
    }
  }
};
Timers.prototype.clear = function () {
  for (var i = 0; i < this.list.length; i++) this.list[i].dead = true;
  this.list.length = 0;
};

/* ---------- particles (hardening #5: hard cap) ---------- */
var MAX_PARTS = 180;
function Particles() { this.list = []; }
Particles.prototype.burst = function (x, y, col, n, spd, life) {
  spd = spd || 120; life = life || 0.6;
  for (var i = 0; i < n; i++) {
    if (this.list.length >= MAX_PARTS) this.list.shift();
    var a = Math.random() * Math.PI * 2, s = rrange(spd * 0.3, spd);
    this.list.push({
      x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - spd * 0.25,
      r: rrange(1.6, 3.6), c: col, t: 0, life: life * rrange(0.7, 1.3)
    });
  }
};
Particles.prototype.update = function (dt) {
  for (var i = this.list.length - 1; i >= 0; i--) {
    var p = this.list[i];
    p.t += dt;
    if (p.t >= p.life) { this.list.splice(i, 1); continue; }
    p.vy += 340 * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
  }
};
Particles.prototype.draw = function (g) {
  for (var i = 0; i < this.list.length; i++) {
    var p = this.list[i], a = 1 - p.t / p.life;
    g.globalAlpha = a < 0 ? 0 : a;
    g.fillStyle = p.c;
    g.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
  }
  g.globalAlpha = 1;
};
Particles.prototype.clear = function () { this.list.length = 0; };

/* ---------- floating score text (capped) ---------- */
var MAX_FLOAT = 24;
function Floaters() { this.list = []; }
Floaters.prototype.add = function (x, y, text, col) {
  if (this.list.length >= MAX_FLOAT) this.list.shift();
  this.list.push({ x: x, y: y, s: String(text).slice(0, 18), c: col || '#fff', t: 0, life: 1.1 });
};
Floaters.prototype.update = function (dt) {
  for (var i = this.list.length - 1; i >= 0; i--) {
    var f = this.list[i];
    f.t += dt; f.y -= 26 * dt;
    if (f.t >= f.life) this.list.splice(i, 1);
  }
};
Floaters.prototype.draw = function (g) {
  g.textAlign = 'center';
  for (var i = 0; i < this.list.length; i++) {
    var f = this.list[i], a = 1 - f.t / f.life;
    g.globalAlpha = a;
    g.font = '700 16px system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
    g.fillStyle = '#0a0d14'; g.fillText(f.s, f.x + 1, f.y + 1);
    g.fillStyle = f.c; g.fillText(f.s, f.x, f.y);
  }
  g.globalAlpha = 1;
};
Floaters.prototype.clear = function () { this.list.length = 0; };

/* ---------- misc draw helpers ---------- */
function rrect(g, x, y, w, h, r) {
  if (r > w / 2) r = w / 2; if (r > h / 2) r = h / 2;
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}
function fnt(g, weight, size) {
  g.font = weight + ' ' + size + 'px system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif';
}
function fitText(g, text, maxW) {
  var t = String(text);
  while (t.length > 2 && g.measureText(t).width > maxW) t = t.slice(0, -1);
  return t;
}
