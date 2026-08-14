/* Corridor Crawl - seeded room/corridor floors and compact fog of war. */
(function (root) {
  'use strict';
  var CC = root.CC;
  var W = 15, H = 20;
  var WALL = 0, FLOOR = 1, WATER = 2, EMBER = 3, UP = 4, DOWN = 5, VAULT = 6, PILLAR = 7;
  var DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  var ALL_DIRS = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];

  var BANDS = {
    warrens: {
      key: 'warrens', name: 'Shallow Warrens', sub: 'root cellars and rat runs',
      wall: 0x1d202b, floor: 0x3a3747, edge: 0x5a5260, accent: 0xe1a35b,
      water: 0x334353, ember: 0x5f3540, fog: 0x080a11, weight: { rat: 7, ooze: 3, thief: 2 },
      setpiece: 'splitting ooze nest'
    },
    flooded: {
      key: 'flooded', name: 'Flooded Corridors', sub: 'sump gates and drowned stone',
      wall: 0x172a38, floor: 0x254555, edge: 0x3e7080, accent: 0x68d3d0,
      water: 0x1a5368, ember: 0x315069, fog: 0x071016, weight: { rat: 2, ooze: 5, archer: 3, thief: 2 },
      setpiece: 'broken pump room'
    },
    forge: {
      key: 'forge', name: 'Ember Forge', sub: 'slag halls and bellows',
      wall: 0x281d25, floor: 0x51333a, edge: 0x9d5c45, accent: 0xffb35d,
      water: 0x304153, ember: 0xa94432, fog: 0x12090e, weight: { ooze: 2, archer: 4, stalker: 3, brute: 3, thief: 2 },
      setpiece: 'bellows crucible'
    },
    vault: {
      key: 'vault', name: 'Crown Vault', sub: 'the echo chamber',
      wall: 0x241d38, floor: 0x493b65, edge: 0x816bc3, accent: 0xffdd79,
      water: 0x344d6e, ember: 0x804641, fog: 0x0d0918, weight: { archer: 3, stalker: 4, brute: 4, thief: 2, ooze: 2 },
      setpiece: 'echo dais'
    }
  };

  function bandFor(depth, ascending) {
    if (depth >= 8) return BANDS.vault;
    if (depth >= 5) return BANDS.forge;
    if (depth >= 3) return BANDS.flooded;
    if (ascending && depth === 2) return BANDS.forge;
    return BANDS.warrens;
  }

  function Level(depth, rng, ascending) {
    this.depth = depth;
    this.ascending = !!ascending;
    this.band = bandFor(depth, ascending);
    this.w = W; this.h = H;
    this.tiles = new Uint8Array(W * H);
    this.seen = new Uint8Array(W * H);
    this.visible = new Uint8Array(W * H);
    this.rooms = [];
    this.signature = this.band.setpiece;
    this.build(rng);
  }
  Level.prototype.idx = function (x, y) { return y * this.w + x; };
  Level.prototype.at = function (x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return WALL;
    return this.tiles[this.idx(x, y)];
  };
  Level.prototype.set = function (x, y, tile) {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.tiles[this.idx(x, y)] = tile;
  };
  Level.prototype.walkable = function (x, y) {
    var t = this.at(x, y);
    return t !== WALL && t !== PILLAR;
  };
  Level.prototype.opaque = function (x, y) { return this.at(x, y) === WALL || this.at(x, y) === PILLAR; };
  Level.prototype.carveRoom = function (r, tile) {
    for (var y = r.y; y < r.y + r.h; y++) for (var x = r.x; x < r.x + r.w; x++) this.set(x, y, tile || FLOOR);
  };
  Level.prototype.carveH = function (x1, x2, y, tile) {
    var a = Math.min(x1, x2), b = Math.max(x1, x2);
    for (var x = a; x <= b; x++) this.set(x, y, tile || FLOOR);
  };
  Level.prototype.carveV = function (y1, y2, x, tile) {
    var a = Math.min(y1, y2), b = Math.max(y1, y2);
    for (var y = a; y <= b; y++) this.set(x, y, tile || FLOOR);
  };
  Level.prototype.build = function (rng) {
    var tries = 120, target = 8;
    for (var i = 0; i < tries && this.rooms.length < target; i++) {
      var rw = rng.int(4, 7), rh = rng.int(3, 5);
      var rx = rng.int(1, W - rw - 2), ry = rng.int(1, H - rh - 2);
      var room = { x: rx, y: ry, w: rw, h: rh, cx: rx + Math.floor(rw / 2), cy: ry + Math.floor(rh / 2) };
      var ok = true;
      for (var q = 0; q < this.rooms.length; q++) {
        var other = this.rooms[q];
        if (room.x - 1 < other.x + other.w && room.x + room.w + 1 > other.x &&
            room.y - 1 < other.y + other.h && room.y + room.h + 1 > other.y) { ok = false; break; }
      }
      if (!ok) continue;
      this.carveRoom(room);
      if (this.rooms.length) {
        var prev = this.rooms[this.rooms.length - 1];
        if (rng.chance(0.5)) {
          this.carveH(prev.cx, room.cx, prev.cy);
          this.carveV(prev.cy, room.cy, room.cx);
        } else {
          this.carveV(prev.cy, room.cy, prev.cx);
          this.carveH(prev.cx, room.cx, room.cy);
        }
      }
      this.rooms.push(room);
    }
    if (this.rooms.length < 2) {
      this.rooms.length = 0;
      this.carveRoom({ x: 1, y: 2, w: 6, h: 5, cx: 4, cy: 4 });
      this.carveRoom({ x: 8, y: 12, w: 6, h: 5, cx: 11, cy: 14 });
      this.carveH(4, 11, 4); this.carveV(4, 14, 11);
      this.rooms.push({ x: 1, y: 2, w: 6, h: 5, cx: 4, cy: 4 }, { x: 8, y: 12, w: 6, h: 5, cx: 11, cy: 14 });
    }
    for (var loop = 0; loop < 2; loop++) {
      var a = rng.pick(this.rooms), b = rng.pick(this.rooms);
      if (a !== b) { this.carveH(a.cx, b.cx, a.cy); this.carveV(a.cy, b.cy, b.cx); }
    }

    var special = this.rooms[this.rooms.length - 1];
    var cx = special.cx, cy = special.cy;
    this.special = { x: cx, y: cy, kind: this.signature };
    if (this.band.key === 'flooded') {
      for (var fy = special.y; fy < special.y + special.h; fy++) for (var fx = special.x; fx < special.x + special.w; fx++) {
        if ((fx + fy) % 3 !== 0) this.set(fx, fy, WATER);
      }
      this.set(cx, cy, FLOOR);
      this.set(cx - 1, cy, FLOOR); this.set(cx + 1, cy, FLOOR);
      this.set(cx, cy - 1, FLOOR); this.set(cx, cy + 1, FLOOR);
    } else if (this.band.key === 'forge') {
      for (var ey = special.y; ey < special.y + special.h; ey++) for (var ex = special.x; ex < special.x + special.w; ex++) {
        if ((ex + ey) % 3 === 0) this.set(ex, ey, EMBER);
      }
      this.set(cx, cy, FLOOR);
      this.set(cx - 1, cy, FLOOR); this.set(cx + 1, cy, FLOOR);
      this.set(cx, cy - 1, FLOOR); this.set(cx, cy + 1, FLOOR);
    } else if (this.band.key === 'vault') {
      // The vault is authored around the room centre. The old version mixed
      // room top-left coordinates with the centre, which could bury or seal
      // the Crown behind pillars.
      this.carveRoom({ x: cx - 2, y: cy - 2, w: 5, h: 5 }, FLOOR);
      for (var vy = cy - 1; vy <= cy + 1; vy++) for (var vx = cx - 2; vx <= cx + 2; vx++) {
        if ((vx + vy) % 2 === 0) this.set(vx, vy, VAULT);
      }
      // A floor centre and four open cardinal approaches make the dais a
      // guaranteed reachable objective on every seed.
      this.set(cx, cy, FLOOR);
      this.set(cx - 1, cy, FLOOR); this.set(cx + 1, cy, FLOOR);
      this.set(cx, cy - 1, FLOOR); this.set(cx, cy + 1, FLOOR);
      var pillarSites = [[cx - 2, cy - 2], [cx + 2, cy - 2], [cx - 2, cy + 2], [cx + 2, cy + 2]];
      for (var ps = 0; ps < pillarSites.length; ps++) {
        var pillar = pillarSites[ps], entrance = false;
        for (var pd = 0; pd < DIRS.length; pd++) {
          var px = pillar[0] + DIRS[pd][0], py = pillar[1] + DIRS[pd][1];
          if (px < cx - 2 || px > cx + 2 || py < cy - 2 || py > cy + 2) entrance = entrance || this.walkable(px, py);
        }
        // Never place an ornamental pillar on the only corridor mouth.
        if (!entrance) this.set(pillar[0], pillar[1], PILLAR);
      }
    } else {
      // The warrens nest has a small cross-shaped chamber rather than a
      // generic room centre, so its signature reads in both play and map art.
      this.set(cx, cy, FLOOR);
      this.set(cx - 1, cy, FLOOR); this.set(cx + 1, cy, FLOOR);
      this.set(cx, cy - 1, FLOOR); this.set(cx, cy + 1, FLOOR);
    }
    var first = this.rooms[0];
    this.upx = first.cx; this.upy = first.cy;
    this.downx = special.cx; this.downy = special.cy;
    this.set(this.upx, this.upy, UP);
    if (this.depth < 8) this.set(this.downx, this.downy, DOWN);
  };
  Level.prototype.randomFloor = function (rng, avoid) {
    for (var tries = 0; tries < 300; tries++) {
      var room = rng.pick(this.rooms);
      var x = rng.int(room.x, room.x + room.w - 1), y = rng.int(room.y, room.y + room.h - 1);
      if (!this.walkable(x, y) || this.at(x, y) === UP || this.at(x, y) === DOWN) continue;
      var bad = false;
      for (var i = 0; avoid && i < avoid.length; i++) if (avoid[i].x === x && avoid[i].y === y) { bad = true; break; }
      if (!bad) return { x: x, y: y };
    }
    return { x: this.upx, y: this.upy };
  };
  Level.prototype.los = function (x0, y0, x1, y1) {
    var dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    var err = dx - dy, x = x0, y = y0;
    for (var guard = 0; guard < 100; guard++) {
      if (x === x1 && y === y1) return true;
      if (!(x === x0 && y === y0) && this.opaque(x, y)) return false;
      var e2 = err * 2;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
    return false;
  };
  Level.prototype.computeFov = function (px, py, radius) {
    this.visible.fill(0);
    for (var y = Math.max(0, py - radius); y <= Math.min(H - 1, py + radius); y++) {
      for (var x = Math.max(0, px - radius); x <= Math.min(W - 1, px + radius); x++) {
        if (CC.dist(px, py, x, y) <= radius && this.los(px, py, x, y)) {
          var i = this.idx(x, y); this.visible[i] = 1; this.seen[i] = 1;
        }
      }
    }
  };
  root.CC.Level = Level;
  root.CC.TILE = { WALL: WALL, FLOOR: FLOOR, WATER: WATER, EMBER: EMBER, UP: UP, DOWN: DOWN, VAULT: VAULT, PILLAR: PILLAR };
  root.CC.DIRS = DIRS;
  root.CC.ALL_DIRS = ALL_DIRS;
  root.CC.MAPW = W; root.CC.MAPH = H;
  root.CC.FLOOR_BANDS = BANDS;
})(window);
