/* Shellshock Pinball - deterministic geometry and collision kernel. */
(function (root) {
  'use strict';

  var SS = {};
  var TAU = Math.PI * 2;
  var HIT = { nx: 0, ny: 0, speed: 0, obj: null };
  var CLOSE = { x: 0, y: 0, t: 0 };

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function hashSeed(value) {
    var str = String(value), h = 2166136261 >>> 0, i;
    for (i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return (h || 1) >>> 0;
  }
  function rng(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17; s >>>= 0;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }
  function arcPoints(cx, cy, rx, ry, start, end, count) {
    var out = [], i, t, a;
    for (i = 0; i <= count; i++) {
      t = i / count; a = lerp(start, end, t);
      out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
    }
    return out;
  }
  function smooth(points, per) {
    var out = [], p = [points[0]].concat(points, [points[points.length - 1]]);
    var i, j, t, t2, t3, a, b, c, d;
    per = per || 6;
    for (i = 1; i < p.length - 2; i++) {
      a = p[i - 1]; b = p[i]; c = p[i + 1]; d = p[i + 2];
      for (j = 0; j < per; j++) {
        t = j / per; t2 = t * t; t3 = t2 * t;
        out.push([
          0.5 * (2 * b[0] + (-a[0] + c[0]) * t + (2 * a[0] - 5 * b[0] + 4 * c[0] - d[0]) * t2 + (-a[0] + 3 * b[0] - 3 * c[0] + d[0]) * t3),
          0.5 * (2 * b[1] + (-a[1] + c[1]) * t + (2 * a[1] - 5 * b[1] + 4 * c[1] - d[1]) * t2 + (-a[1] + 3 * b[1] - 3 * c[1] + d[1]) * t3)
        ]);
      }
    }
    out.push(points[points.length - 1]);
    return out;
  }
  function pathLength(path) {
    var cumulative = [0], total = 0, i, dx, dy;
    for (i = 1; i < path.length; i++) {
      dx = path[i][0] - path[i - 1][0];
      dy = path[i][1] - path[i - 1][1];
      total += Math.sqrt(dx * dx + dy * dy);
      cumulative.push(total);
    }
    return { total: total, cumulative: cumulative };
  }
  function samplePath(path, cumulative, distance) {
    var lo = 0, hi = cumulative.length - 1, mid, span, t;
    distance = clamp(distance, 0, cumulative[hi]);
    while (lo < hi - 1) {
      mid = (lo + hi) >> 1;
      if (cumulative[mid] <= distance) lo = mid; else hi = mid;
    }
    span = cumulative[hi] - cumulative[lo];
    t = span > 0 ? (distance - cumulative[lo]) / span : 0;
    return [lerp(path[lo][0], path[hi][0], t), lerp(path[lo][1], path[hi][1], t)];
  }
  function seg(list, x1, y1, x2, y2, options) {
    var s = { x1: x1, y1: y1, x2: x2, y2: y2, r: 4, rest: 0.34, kind: 'wall', down: false };
    var key;
    if (options) for (key in options) s[key] = options[key];
    list.push(s);
    return s;
  }
  function chain(list, points, options) {
    var i;
    for (i = 0; i < points.length - 1; i++) seg(list, points[i][0], points[i][1], points[i + 1][0], points[i + 1][1], options);
  }
  function closest(px, py, x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy, t;
    t = l2 > 0 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
    t = clamp(t, 0, 1);
    CLOSE.x = x1 + dx * t; CLOSE.y = y1 + dy * t; CLOSE.t = t;
    return CLOSE;
  }
  function hitSegment(ball, wall) {
    var c, nx, ny, d, radius, vn, impact, tx, ty, vt, friction;
    if (wall.down) return null;
    c = closest(ball.x, ball.y, wall.x1, wall.y1, wall.x2, wall.y2);
    nx = ball.x - c.x; ny = ball.y - c.y;
    d = Math.sqrt(nx * nx + ny * ny);
    radius = ball.r + (wall.r || 0);
    if (d >= radius) return null;
    if (d < 0.0001) { nx = 0; ny = -1; d = 0.0001; }
    else { nx /= d; ny /= d; }
    if (wall.oneWay && ball.vx * wall.oneWay.x + ball.vy * wall.oneWay.y > 0) return null;
    ball.x += nx * (radius - d + 0.04);
    ball.y += ny * (radius - d + 0.04);
    vn = ball.vx * nx + ball.vy * ny;
    if (vn > 0) return null;
    impact = -vn;
    ball.vx -= (1 + (wall.rest == null ? 0.34 : wall.rest)) * vn * nx;
    ball.vy -= (1 + (wall.rest == null ? 0.34 : wall.rest)) * vn * ny;
    tx = -ny; ty = nx;
    vt = ball.vx * tx + ball.vy * ty;
    friction = wall.fric == null ? 0.015 : wall.fric;
    ball.vx -= vt * friction * tx;
    ball.vy -= vt * friction * ty;
    if (wall.kick) {
      ball.vx = nx * wall.kick + tx * vt * 0.22;
      ball.vy = ny * wall.kick + ty * vt * 0.22;
    }
    HIT.nx = nx; HIT.ny = ny; HIT.speed = impact; HIT.obj = wall;
    return HIT;
  }
  function hitCircle(ball, circle) {
    var nx, ny, d, radius, vn, impact, kick;
    if (circle.down) return null;
    nx = ball.x - circle.x; ny = ball.y - circle.y;
    d = Math.sqrt(nx * nx + ny * ny);
    radius = ball.r + circle.r;
    if (d >= radius) return null;
    if (d < 0.0001) { nx = 0; ny = -1; d = 0.0001; }
    else { nx /= d; ny /= d; }
    ball.x += nx * (radius - d + 0.04);
    ball.y += ny * (radius - d + 0.04);
    vn = ball.vx * nx + ball.vy * ny;
    if (vn > 0) return null;
    impact = -vn;
    ball.vx -= (1 + (circle.rest == null ? 0.46 : circle.rest)) * vn * nx;
    ball.vy -= (1 + (circle.rest == null ? 0.46 : circle.rest)) * vn * ny;
    kick = circle.kick || 0;
    if (kick) {
      ball.vx = nx * kick + ball.vx * 0.10;
      ball.vy = ny * kick + ball.vy * 0.10;
    }
    HIT.nx = nx; HIT.ny = ny; HIT.speed = impact; HIT.obj = circle;
    return HIT;
  }
  function hitFlipper(ball, flipper) {
    var ex = flipper.x + Math.cos(flipper.angle) * flipper.len;
    var ey = flipper.y + Math.sin(flipper.angle) * flipper.len;
    var c = closest(ball.x, ball.y, flipper.x, flipper.y, ex, ey);
    var nx = ball.x - c.x, ny = ball.y - c.y, d = Math.sqrt(nx * nx + ny * ny);
    var radius = ball.r + flipper.r, rx, ry, pvx, pvy, rvx, rvy, vn, tx, ty, vt;
    if (d >= radius) return null;
    if (d < 0.0001) { nx = 0; ny = -1; d = 0.0001; }
    else { nx /= d; ny /= d; }
    ball.x += nx * (radius - d + 0.05);
    ball.y += ny * (radius - d + 0.05);
    rx = c.x - flipper.x; ry = c.y - flipper.y;
    pvx = -flipper.omega * ry; pvy = flipper.omega * rx;
    rvx = ball.vx - pvx; rvy = ball.vy - pvy;
    vn = rvx * nx + rvy * ny;
    if (vn > 0) return null;
    rvx -= 1.44 * vn * nx; rvy -= 1.44 * vn * ny;
    tx = -ny; ty = nx; vt = rvx * tx + rvy * ty;
    rvx -= vt * 0.07 * tx; rvy -= vt * 0.07 * ty;
    ball.vx = rvx + pvx; ball.vy = rvy + pvy;
    HIT.nx = nx; HIT.ny = ny; HIT.speed = -vn; HIT.obj = flipper;
    return HIT;
  }

  SS.TAU = TAU;
  SS.clamp = clamp;
  SS.lerp = lerp;
  SS.hashSeed = hashSeed;
  SS.rng = rng;
  SS.arcPoints = arcPoints;
  SS.smooth = smooth;
  SS.pathLength = pathLength;
  SS.samplePath = samplePath;
  SS.seg = seg;
  SS.chain = chain;
  SS.hitSegment = hitSegment;
  SS.hitCircle = hitCircle;
  SS.hitFlipper = hitFlipper;
  SS.safeName = function (value, fallback) { return typeof value === 'string' && value.length ? value : fallback; };
  root.SS = SS;
}(window));
