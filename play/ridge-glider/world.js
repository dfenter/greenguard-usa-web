/* Ridge Glider - world: terrain, thermals, ridge lift, landing zones */
(function (root) {
  'use strict';

  var LZ_SPACING = 2000;   // metres between landing zones
  var LZ_HALF = 160;       // half-width of the scoring pad
  var CELL = 300;          // thermal generator cell size (m)
  var WIND = 5.5;          // tailwind, +x, m/s
  var AMBIENT = -0.6;      // ambient sink, m/s
  var CEILING = 1450;      // no lift above this altitude

  function hash1(i, seed) {
    var h = (i | 0) * 374761393 + (seed | 0) * 668265263;
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function World(seed) {
    this.seed = seed | 0;
    this.wind = WIND;
    this.cells = {};
  }

  World.prototype.n = function (x, o) {
    var s = this.seed + (o | 0) * 7919;
    var i = Math.floor(x), f = x - i;
    var u = f * f * (3 - 2 * f);
    var a = hash1(i, s), b = hash1(i + 1, s);
    return a + (b - a) * u;
  };

  // raw ridgeline (metres above sea level)
  World.prototype.raw = function (x) {
    var n = this;
    return 40
      + 215 * n.n(x / 1100 + 1.3, 1)
      + 128 * n.n(x / 430 + 9.7, 2)
      + 46 * n.n(x / 165 + 21.1, 3)
      + 15 * n.n(x / 62 + 37.5, 4);
  };

  // terrain height with landing zones flattened in
  World.prototype.h = function (x) {
    var hr = this.raw(x);
    var k = Math.round(x / LZ_SPACING);
    if (k < 1) return hr;
    var cx = k * LZ_SPACING;
    var d = x - cx;                       // signed: extra flat run-in on the approach side
    if (d < -430 || d > 250) return hr;
    var t;
    if (d < -250) t = (d + 430) / 180;
    else if (d > 160) t = (250 - d) / 90;
    else t = 1;
    t = t * t * (3 - 2 * t);
    return hr + (this.raw(cx) - hr) * t;
  };

  World.prototype.slope = function (x) {
    return (this.h(x + 3) - this.h(x - 3)) / 6;
  };

  World.prototype.nextLZ = function (x) {
    var k = Math.floor(x / LZ_SPACING) + 1;
    if (k < 1) k = 1;
    return k * LZ_SPACING;
  };

  World.prototype.lzAt = function (x) {
    var k = Math.round(x / LZ_SPACING);
    if (k < 1) return null;
    var cx = k * LZ_SPACING;
    if (Math.abs(x - cx) > LZ_HALF) return null;
    return { x: cx, dx: x - cx, half: LZ_HALF, y: this.raw(cx) };
  };

  // ---- thermals -------------------------------------------------------
  World.prototype.cell = function (ci) {
    var c = this.cells[ci];
    if (c !== undefined) return c;
    var r1 = hash1(ci * 3 + 11, this.seed + 555);
    if (r1 > 0.58) { c = null; }
    else {
      var r2 = hash1(ci * 3 + 12, this.seed + 555);
      var r3 = hash1(ci * 3 + 13, this.seed + 555);
      var r4 = hash1(ci * 3 + 17, this.seed + 555);
      var x = ci * CELL + 40 + r2 * (CELL - 80);
      c = {
        x: x,
        r: 85 + r3 * 130,
        s: 3.2 + r4 * 3.8,
        base: this.h(x) + 15,
        top: 620 + r2 * 560,
        ph: r3 * 6.283
      };
      if (c.top < c.base + 220) c.top = c.base + 220;
    }
    this.cells[ci] = c;
    return c;
  };

  World.prototype.thermalsNear = function (x0, x1, out) {
    out.length = 0;
    var a = Math.floor(x0 / CELL) - 1, b = Math.floor(x1 / CELL) + 1;
    for (var i = a; i <= b; i++) {
      var c = this.cell(i);
      if (c) out.push(c);
    }
    return out;
  };

  World.prototype.thermalLift = function (x, y) {
    var w = 0;
    var a = Math.floor((x - 500) / CELL), b = Math.floor((x + 500) / CELL);
    for (var i = a; i <= b; i++) {
      var c = this.cell(i);
      if (!c) continue;
      if (y < c.base || y > c.top) continue;
      var d = Math.abs(x - c.x);
      if (d > c.r * 1.9) continue;
      // vertical taper: ramp in at base, fade out under the top
      var vt = Math.min(1, (y - c.base) / 60);
      var tt = Math.min(1, (c.top - y) / 170);
      var env = vt * tt * tt;
      if (d <= c.r) {
        var f = 1 - (d / c.r) * (d / c.r);
        w += c.s * f * env;
      } else {
        var g = (d - c.r) / (c.r * 0.9);
        w -= c.s * 0.34 * (1 - g) * (1 - g) * env;
      }
    }
    return w;
  };

  // ---- ridge lift -----------------------------------------------------
  // Wind blows downrange (+x). Windward faces are the rising slopes the
  // glider approaches; lift sits in a band above them.
  World.prototype.ridgeLift = function (x, y) {
    var s = this.slope(x);
    if (s <= 0.08) return 0;
    var g = this.h(x);
    var agl = y - g;
    if (agl < 0) return 0;
    var band = 70 + 190 * Math.min(1, s);
    if (agl > band) return 0;
    var f = 1 - agl / band;
    f = f * f;
    var str = this.wind * Math.min(0.70, (s - 0.08) * 1.35);
    return str * f * 1.35;
  };

  World.prototype.lift = function (x, y) {
    if (y > CEILING) return -1.2;
    return AMBIENT + this.thermalLift(x, y) + this.ridgeLift(x, y);
  };

  root.RG = root.RG || {};
  root.RG.World = World;
  root.RG.LZ_SPACING = LZ_SPACING;
  root.RG.LZ_HALF = LZ_HALF;
  root.RG.CEILING = CEILING;
})(window);
