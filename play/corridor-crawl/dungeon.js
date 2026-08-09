/* Corridor Crawl - dungeon generation, field of view */
(function (g) {
  'use strict';
  var CC = g.CC;

  var W = 38, H = 34;
  var WALL = 0, FLOOR = 1, DOWN = 2, UP = 3;

  function Level(depth, rng) {
    this.depth = depth;
    this.w = W; this.h = H;
    this.tiles = new Uint8Array(W * H);
    this.seen = new Uint8Array(W * H);
    this.vis = new Uint8Array(W * H);
    this.rooms = [];
    this.build(rng);
  }
  Level.prototype.idx = function (x, y) { return y * this.w + x; };
  Level.prototype.at = function (x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return WALL;
    return this.tiles[y * this.w + x];
  };
  Level.prototype.walkable = function (x, y) { return this.at(x, y) !== WALL; };
  Level.prototype.opaque = function (x, y) { return this.at(x, y) === WALL; };

  Level.prototype.carveRoom = function (r) {
    for (var y = r.y; y < r.y + r.h; y++)
      for (var x = r.x; x < r.x + r.w; x++)
        this.tiles[y * this.w + x] = FLOOR;
  };
  Level.prototype.carveH = function (x1, x2, y) {
    var a = Math.min(x1, x2), b = Math.max(x1, x2);
    for (var x = a; x <= b; x++) this.tiles[y * this.w + x] = FLOOR;
  };
  Level.prototype.carveV = function (y1, y2, x) {
    var a = Math.min(y1, y2), b = Math.max(y1, y2);
    for (var y = a; y <= b; y++) this.tiles[y * this.w + x] = FLOOR;
  };

  Level.prototype.build = function (rng) {
    var tries = 160, maxRooms = 11;
    for (var t = 0; t < tries && this.rooms.length < maxRooms; t++) {
      var rw = rng.int(4, 8), rh = rng.int(4, 7);
      var rx = rng.int(1, this.w - rw - 2), ry = rng.int(1, this.h - rh - 2);
      var r = { x: rx, y: ry, w: rw, h: rh, cx: (rx + (rw >> 1)) | 0, cy: (ry + (rh >> 1)) | 0 };
      var ok = true;
      for (var i = 0; i < this.rooms.length; i++) {
        var o = this.rooms[i];
        if (r.x - 1 < o.x + o.w + 1 && r.x + r.w + 1 > o.x - 1 &&
          r.y - 1 < o.y + o.h + 1 && r.y + r.h + 1 > o.y - 1) { ok = false; break; }
      }
      if (!ok) continue;
      this.carveRoom(r);
      if (this.rooms.length > 0) {
        var p = this.rooms[this.rooms.length - 1];
        if (rng.chance(0.5)) { this.carveH(p.cx, r.cx, p.cy); this.carveV(p.cy, r.cy, r.cx); }
        else { this.carveV(p.cy, r.cy, p.cx); this.carveH(p.cx, r.cx, r.cy); }
      }
      this.rooms.push(r);
    }
    // a couple of loop corridors so floors are not pure trees
    for (var k = 0; k < 2 && this.rooms.length > 3; k++) {
      var a = rng.pick(this.rooms), b = rng.pick(this.rooms);
      if (a === b) continue;
      this.carveH(a.cx, b.cx, a.cy); this.carveV(a.cy, b.cy, b.cx);
    }
    // stairs
    var first = this.rooms[0], last = this.rooms[this.rooms.length - 1];
    this.upx = first.cx; this.upy = first.cy;
    this.tiles[this.upy * this.w + this.upx] = UP;
    this.downx = last.cx; this.downy = last.cy;
    this.tiles[this.downy * this.w + this.downx] = DOWN;
  };

  Level.prototype.randomFloor = function (rng, avoid) {
    for (var t = 0; t < 400; t++) {
      var r = rng.pick(this.rooms);
      var x = rng.int(r.x, r.x + r.w - 1), y = rng.int(r.y, r.y + r.h - 1);
      if (this.at(x, y) !== FLOOR) continue;
      var bad = false;
      if (avoid) for (var i = 0; i < avoid.length; i++) if (avoid[i].x === x && avoid[i].y === y) { bad = true; break; }
      if (!bad) return { x: x, y: y };
    }
    return { x: this.upx, y: this.upy };
  };

  /* line of sight (Bresenham); returns true if clear from a to b */
  Level.prototype.los = function (x0, y0, x1, y1) {
    var dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    var sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    var err = dx - dy, x = x0, y = y0, guard = 0;
    while (guard++ < 200) {
      if (x === x1 && y === y1) return true;
      if (!(x === x0 && y === y0) && this.opaque(x, y)) return false;
      var e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
    return false;
  };

  /* symmetric-ish shadowcast-lite: raycast to perimeter of radius box */
  Level.prototype.computeFov = function (px, py, radius) {
    this.vis.fill(0);
    var self = this;
    function mark(x, y) {
      if (x < 0 || y < 0 || x >= self.w || y >= self.h) return;
      var i = y * self.w + x; self.vis[i] = 1; self.seen[i] = 1;
    }
    mark(px, py);
    var steps = 180;
    for (var s = 0; s < steps; s++) {
      var a = (s / steps) * Math.PI * 2;
      var dx = Math.cos(a), dy = Math.sin(a);
      var x = px + 0.5, y = py + 0.5;
      for (var r = 0; r < radius; r++) {
        x += dx; y += dy;
        var tx = Math.floor(x), ty = Math.floor(y);
        if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) break;
        mark(tx, ty);
        if (this.opaque(tx, ty)) break;
      }
    }
    // fill in wall corners adjacent to visible floor for a solid look
    for (var yy = Math.max(0, py - radius - 1); yy <= Math.min(this.h - 1, py + radius + 1); yy++) {
      for (var xx = Math.max(0, px - radius - 1); xx <= Math.min(this.w - 1, px + radius + 1); xx++) {
        if (this.vis[yy * this.w + xx] || !this.opaque(xx, yy)) continue;
        for (var d = 0; d < 8; d++) {
          var nx = xx + DIRS[d][0], ny = yy + DIRS[d][1];
          if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
          if (this.vis[ny * this.w + nx] && !this.opaque(nx, ny) &&
            CC.dist(nx, ny, px, py) <= radius) { mark(xx, yy); break; }
        }
      }
    }
  };

  var DIRS = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];

  g.CC.Level = Level;
  g.CC.TILE = { WALL: WALL, FLOOR: FLOOR, DOWN: DOWN, UP: UP };
  g.CC.DIRS = DIRS;
  g.CC.MAPW = W; g.CC.MAPH = H;
})(window);
