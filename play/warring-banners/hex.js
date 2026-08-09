// Warring Banners - axial pointy-top hex geometry + seeded RNG.
var HEX = (function () {
  var DIRS = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];

  function key(q, r) { return q + ',' + r; }
  function dist(aq, ar, bq, br) {
    var dq = aq - bq, dr = ar - br;
    return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
  }
  function neighbors(q, r) {
    var o = [];
    for (var i = 0; i < 6; i++) o.push([q + DIRS[i][0], r + DIRS[i][1]]);
    return o;
  }
  // pointy-top layout
  function toPix(q, r, s) {
    return { x: s * Math.sqrt(3) * (q + r / 2), y: s * 1.5 * r };
  }
  function fromPix(x, y, s) {
    var q = (Math.sqrt(3) / 3 * x - y / 3) / s;
    var r = (2 / 3 * y) / s;
    return round(q, r);
  }
  function round(q, r) {
    var x = q, z = r, y = -x - z;
    var rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
    var dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
    if (dx > dy && dx > dz) rx = -ry - rz;
    else if (dy > dz) ry = -rx - rz;
    else rz = -rx - ry;
    return { q: rx, r: rz };
  }
  function corners(cx, cy, s) {
    var pts = [];
    for (var i = 0; i < 6; i++) {
      var a = Math.PI / 180 * (60 * i - 30);
      pts.push([cx + s * Math.cos(a), cy + s * Math.sin(a)]);
    }
    return pts;
  }

  // deterministic PRNG (mulberry32)
  function rng(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  return { DIRS: DIRS, key: key, dist: dist, neighbors: neighbors,
           toPix: toPix, fromPix: fromPix, corners: corners, rng: rng };
})();
