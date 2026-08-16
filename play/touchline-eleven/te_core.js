/* te_core.js — Touchline Eleven shared math, pools and renderer guards.
 * Lifecycle, input identity, saves, audio buses and juice are owned by GGKit.
 * Nothing in here touches the DOM or Phaser globals.
 */
(function (root) {
  'use strict';

  var TAU = Math.PI * 2;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function dist2(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
  function dist(ax, ay, bx, by) { return Math.sqrt(dist2(ax, ay, bx, by)); }

  // Direction into a reusable output object. No allocation in the hot path.
  var NORM_OUT = { x: 0, y: 0, len: 0 };
  function norm(x, y, out) {
    var o = out || NORM_OUT;
    var l = Math.sqrt(x * x + y * y);
    o.len = l;
    if (l < 1e-6) { o.x = 0; o.y = 0; } else { o.x = x / l; o.y = y / l; }
    return o;
  }

  function angleLerp(a, b, t) {
    var d = ((b - a + Math.PI * 3) % TAU) - Math.PI;
    return a + d * clamp(t, 0, 1);
  }

  function makeRng(seed) {
    var a = (seed >>> 0) || 0x9e3779b9;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Change-guarded setters. Phaser re-lays-out text on every setText and
  // rebuilds the style on every setColor, so both need the guard.
  function setTextIfChanged(obj, value) {
    var s = String(value);
    if (obj && obj.text !== s) obj.setText(s);
  }
  function setColorIfChanged(obj, color) {
    if (obj && obj.__teColor !== color) { obj.setColor(color); obj.__teColor = color; }
  }
  function setAlphaIfChanged(obj, a) {
    if (obj && obj.__teAlpha !== a) { obj.setAlpha(a); obj.__teAlpha = a; }
  }
  function setVisibleIfChanged(obj, v) {
    if (obj && obj.visible !== v) obj.setVisible(v);
  }

  // Hand-tessellated circle / arc. Phaser Graphics.arc walks the sweep in
  // 0.01 rad steps, which is ruinous at 4x throttle.
  function strokeArc(g, x, y, r, from, to, segments) {
    var n = Math.max(6, segments | 0);
    var step = (to - from) / n;
    g.beginPath();
    for (var i = 0; i <= n; i++) {
      var a = from + step * i;
      var px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.strokePath();
  }

  function hex(value) { return '#' + ('000000' + (value >>> 0).toString(16)).slice(-6); }

  function mixColor(a, b, t) {
    var ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
    var br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
    return (((ar + (br - ar) * t) | 0) << 16) | (((ag + (bg - ag) * t) | 0) << 8) | (((ab + (bb - ab) * t) | 0));
  }

  /* Fixed-capacity pool. Every transient object in the title comes from one
   * of these, including the ones the debug view reads: there is never a
   * second, unpooled copy of a live object. */
  function Pool(capacity, factory, reset) {
    this.items = new Array(capacity);
    this.active = 0;
    for (var i = 0; i < capacity; i++) { this.items[i] = factory(i); this.items[i].__live = false; }
    this.reset = reset;
  }
  Pool.prototype.obtain = function () {
    if (this.active >= this.items.length) return null;
    var it = this.items[this.active++];
    it.__live = true;
    if (this.reset) this.reset(it);
    return it;
  };
  // Swap-remove keeps the live block contiguous at [0, active).
  Pool.prototype.releaseAt = function (index) {
    var last = this.active - 1;
    if (index < 0 || index > last) return;
    var tmp = this.items[index];
    this.items[index] = this.items[last];
    this.items[last] = tmp;
    tmp.__live = false;
    this.active = last;
  };
  Pool.prototype.clear = function () {
    for (var i = 0; i < this.items.length; i++) this.items[i].__live = false;
    this.active = 0;
  };

  // Bounded ring buffer of plain objects (ball trail, event log).
  function Ring(capacity, factory) {
    this.items = new Array(capacity);
    for (var i = 0; i < capacity; i++) this.items[i] = factory(i);
    this.head = 0;
    this.count = 0;
  }
  Ring.prototype.push = function () {
    var it = this.items[this.head];
    this.head = (this.head + 1) % this.items.length;
    if (this.count < this.items.length) this.count++;
    return it;
  };
  Ring.prototype.at = function (i) {
    // 0 = oldest live entry.
    var start = (this.head - this.count + this.items.length * 2) % this.items.length;
    return this.items[(start + i) % this.items.length];
  };
  Ring.prototype.clear = function () { this.head = 0; this.count = 0; };

  function formatClock(seconds) {
    var s = Math.max(0, Math.ceil(seconds));
    var m = Math.floor(s / 60);
    return m + ':' + String(s % 60).padStart(2, '0');
  }
  function formatMs(ms) {
    var s = Math.max(0, ms) / 1000;
    return s.toFixed(2) + 's';
  }

  root.TECore = {
    TAU: TAU,
    clamp: clamp,
    lerp: lerp,
    dist: dist,
    dist2: dist2,
    norm: norm,
    angleLerp: angleLerp,
    makeRng: makeRng,
    setTextIfChanged: setTextIfChanged,
    setColorIfChanged: setColorIfChanged,
    setAlphaIfChanged: setAlphaIfChanged,
    setVisibleIfChanged: setVisibleIfChanged,
    strokeArc: strokeArc,
    hex: hex,
    mixColor: mixColor,
    Pool: Pool,
    Ring: Ring,
    formatClock: formatClock,
    formatMs: formatMs
  };
})(typeof window !== 'undefined' ? window : globalThis);
