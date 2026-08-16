/* Corridor Crawl - seeded room/corridor floors, boss arenas, shrines, fog. */
(function (root) {
  'use strict';
  var CC = root.CC;
  var W = 15, H = 20;
  var WALL = 0, FLOOR = 1, WATER = 2, EMBER = 3, UP = 4, DOWN = 5, VAULT = 6, PILLAR = 7,
      SHRINE = 8, BONES = 9;
  var DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  var ALL_DIRS = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
  var MAX_DEPTH = 10;

  // Five authored bands across ten depths. `deco` selects the floor-glyph
  // vocabulary baked into the board texture so bands never read as recolours.
  var BANDS = {
    warrens: {
      key: 'warrens', name: 'Shallow Warrens', sub: 'root cellars and rat runs',
      wall: 0x2b2f3d, floor: 0x4e4a5e, edge: 0x7d7288, accent: 0xe1a35b,
      water: 0x334353, ember: 0x5f3540, fog: 0x080a11, deco: 'roots',
      weight: { rat: 7, swarm: 3, ooze: 3, thief: 2 },
      setpiece: 'splitting ooze nest'
    },
    flooded: {
      key: 'flooded', name: 'Flooded Corridors', sub: 'sump gates and drowned stone',
      wall: 0x1f3a4c, floor: 0x33596c, edge: 0x5a94a5, accent: 0x68d3d0,
      water: 0x1a5368, ember: 0x315069, fog: 0x071016, deco: 'tide',
      weight: { rat: 2, ooze: 5, archer: 3, spitter: 4, thief: 2, mimic: 1 },
      setpiece: 'broken pump room'
    },
    forge: {
      key: 'forge', name: 'Ember Forge', sub: 'slag halls and bellows',
      wall: 0x3a2b31, floor: 0x69434b, edge: 0xbd7455, accent: 0xffb35d,
      water: 0x304153, ember: 0xa94432, fog: 0x12090e, deco: 'slag',
      weight: { swarm: 2, ooze: 2, archer: 3, spitter: 2, stalker: 3, brute: 3, bulwark: 3, thief: 2, mimic: 1 },
      setpiece: 'bellows crucible'
    },
    deeps: {
      key: 'deeps', name: 'Hollow Deeps', sub: 'bone galleries and cold air',
      wall: 0x27333a, floor: 0x455a62, edge: 0x8aa9ab, accent: 0x9fe0c8,
      water: 0x24424c, ember: 0x4a4a3c, fog: 0x060c0e, deco: 'bone',
      weight: { wraith: 4, warden: 3, stalker: 3, bulwark: 3, brute: 2, spitter: 2, mimic: 2 },
      setpiece: 'ossuary gallery'
    },
    vault: {
      key: 'vault', name: 'Crown Vault', sub: 'the echo chamber',
      wall: 0x322847, floor: 0x5d4c80, edge: 0x9a83dc, accent: 0xffdd79,
      water: 0x344d6e, ember: 0x804641, fog: 0x0d0918, deco: 'rune',
      weight: { archer: 3, stalker: 4, brute: 4, bulwark: 4, warden: 3, wraith: 3, thief: 2 },
      setpiece: 'echo dais'
    }
  };

  function bandFor(depth, ascending) {
    if (depth >= 10) return BANDS.vault;
    if (depth >= 8) return BANDS.deeps;
    if (depth >= 5) return BANDS.forge;
    if (depth >= 3) return BANDS.flooded;
    if (ascending && depth === 2) return BANDS.forge;
    return BANDS.warrens;
  }
  function isBossDepth(depth) { return depth === 5 || depth === 10; }
  function bossKeyFor(depth) { return depth >= 10 ? 'sovereign' : 'slagmaw'; }

  function Level(depth, rng, ascending) {
    this.depth = depth;
    this.ascending = !!ascending;
    this.band = bandFor(depth, ascending);
    // The ascent is a victory lap through cleared ground: no second boss fight,
    // but every other pressure (spawn weight, hunger, torch) stays raised.
    this.boss = isBossDepth(depth) && !this.ascending;
    this.bossKey = this.boss ? bossKeyFor(depth) : null;
    this.w = W; this.h = H;
    this.tiles = new Uint8Array(W * H);
    this.seen = new Uint8Array(W * H);
    this.visible = new Uint8Array(W * H);
    this.light = new Float32Array(W * H);
    this.rooms = [];
    this.shrine = null;
    this.signature = this.boss ? (this.bossKey === 'sovereign' ? 'echo throne' : 'slag pit') : this.band.setpiece;
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
    if (this.boss) this.buildArena(rng); else this.buildWarren(rng);
    var first = this.rooms[0];
    this.upx = first.cx; this.upy = first.cy;
    this.set(this.upx, this.upy, UP);
    if (this.depth < MAX_DEPTH) this.set(this.downx, this.downy, DOWN);
    this.placeShrine(rng);
  };
  Level.prototype.buildWarren = function (rng) {
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
      this.openCross(cx, cy);
    } else if (this.band.key === 'forge') {
      for (var ey = special.y; ey < special.y + special.h; ey++) for (var ex = special.x; ex < special.x + special.w; ex++) {
        if ((ex + ey) % 3 === 0) this.set(ex, ey, EMBER);
      }
      this.openCross(cx, cy);
    } else if (this.band.key === 'deeps') {
      // The ossuary gallery reads as bone-strewn stone with two standing ribs.
      for (var by = special.y; by < special.y + special.h; by++) for (var bx = special.x; bx < special.x + special.w; bx++) {
        if ((bx * 3 + by * 5) % 4 === 0) this.set(bx, by, BONES);
      }
      this.openCross(cx, cy);
      this.setIfSafe(cx - 2, cy - 1, PILLAR); this.setIfSafe(cx + 2, cy + 1, PILLAR);
    } else if (this.band.key === 'vault') {
      this.carveRoom({ x: cx - 2, y: cy - 2, w: 5, h: 5 }, FLOOR);
      for (var vy = cy - 1; vy <= cy + 1; vy++) for (var vx = cx - 2; vx <= cx + 2; vx++) {
        if ((vx + vy) % 2 === 0) this.set(vx, vy, VAULT);
      }
      this.openCross(cx, cy);
      var pillarSites = [[cx - 2, cy - 2], [cx + 2, cy - 2], [cx - 2, cy + 2], [cx + 2, cy + 2]];
      for (var ps = 0; ps < pillarSites.length; ps++) this.setIfSafe(pillarSites[ps][0], pillarSites[ps][1], PILLAR);
    } else {
      this.openCross(cx, cy);
    }
    this.downx = special.cx; this.downy = special.cy;
  };
  // A floor centre plus four open cardinal approaches keeps every authored
  // set-piece objective reachable on every seed.
  Level.prototype.openCross = function (cx, cy) {
    this.set(cx, cy, FLOOR);
    this.set(cx - 1, cy, FLOOR); this.set(cx + 1, cy, FLOOR);
    this.set(cx, cy - 1, FLOOR); this.set(cx, cy + 1, FLOOR);
  };
  // Ornamental blockers never take the only corridor mouth into a chamber.
  Level.prototype.setIfSafe = function (x, y, tile) {
    if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) return;
    if (!this.walkable(x, y)) return;
    var open = 0;
    for (var d = 0; d < DIRS.length; d++) if (this.walkable(x + DIRS[d][0], y + DIRS[d][1])) open++;
    if (open <= 2) return;
    this.set(x, y, tile);
  };
  Level.prototype.buildArena = function (rng) {
    // Boss floors are authored, not seeded: a gate room, a throat corridor, and
    // a wide arena with room to kite. Seeded variation lives in the decor.
    var entry = { x: 5, y: 1, w: 5, h: 3 };
    entry.cx = entry.x + 2; entry.cy = entry.y + 1;
    var arena = { x: 1, y: 6, w: 13, h: 12 };
    arena.cx = arena.x + 6; arena.cy = arena.y + 5;
    this.carveRoom(entry);
    this.carveRoom(arena);
    this.carveV(entry.cy, arena.y, entry.cx);
    this.rooms.push(entry, arena);
    this.special = { x: arena.cx, y: arena.cy, kind: this.signature };
    var deco = this.bossKey === 'sovereign' ? VAULT : EMBER;
    for (var y = arena.y; y < arena.y + arena.h; y++) {
      for (var x = arena.x; x < arena.x + arena.w; x++) {
        var dx = x - arena.cx, dy = y - arena.cy;
        if (Math.abs(dx) + Math.abs(dy) === 5 && rng.chance(0.7)) this.set(x, y, deco);
        else if ((x + y) % 7 === 0 && rng.chance(0.4)) this.set(x, y, deco);
      }
    }
    var pillars = [[arena.cx - 4, arena.cy - 3], [arena.cx + 4, arena.cy - 3],
                   [arena.cx - 4, arena.cy + 3], [arena.cx + 4, arena.cy + 3]];
    for (var p = 0; p < pillars.length; p++) this.setIfSafe(pillars[p][0], pillars[p][1], PILLAR);
    this.openCross(arena.cx, arena.cy);
    if (this.bossKey === 'sovereign') {
      // The dais is the crown pedestal; it stays clear so the reward is takeable.
      this.set(arena.cx, arena.cy, VAULT);
      this.downx = arena.cx; this.downy = arena.cy;
    } else {
      this.downx = arena.cx; this.downy = arena.y + arena.h - 2;
      this.set(this.downx, this.downy, FLOOR);
    }
  };
  Level.prototype.placeShrine = function (rng) {
    if (this.depth < 2 || this.boss || this.ascending) return;
    if (!rng.chance(0.62)) return;
    for (var tries = 0; tries < 60; tries++) {
      var room = rng.pick(this.rooms);
      var x = rng.int(room.x, room.x + room.w - 1), y = rng.int(room.y, room.y + room.h - 1);
      var t = this.at(x, y);
      if (t !== FLOOR && t !== BONES) continue;
      if (CC.dist(x, y, this.upx, this.upy) < 3 || CC.dist(x, y, this.downx, this.downy) < 3) continue;
      this.set(x, y, SHRINE);
      this.shrine = { x: x, y: y };
      return;
    }
  };
  Level.prototype.randomFloor = function (rng, avoid) {
    for (var tries = 0; tries < 300; tries++) {
      var room = rng.pick(this.rooms);
      var x = rng.int(room.x, room.x + room.w - 1), y = rng.int(room.y, room.y + room.h - 1);
      var t = this.at(x, y);
      if (!this.walkable(x, y) || t === UP || t === DOWN || t === SHRINE) continue;
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
  // Visibility now carries a light value per tile so the board bake can render
  // a real falloff instead of one flat lit colour plus a gradient overlay.
  Level.prototype.computeFov = function (px, py, radius) {
    this.visible.fill(0);
    this.light.fill(0);
    var soft = radius + 1.35;
    for (var y = Math.max(0, py - radius - 1); y <= Math.min(H - 1, py + radius + 1); y++) {
      for (var x = Math.max(0, px - radius - 1); x <= Math.min(W - 1, px + radius + 1); x++) {
        var d = Math.sqrt((px - x) * (px - x) + (py - y) * (py - y));
        if (d > soft) continue;
        if (!this.los(px, py, x, y)) continue;
        var i = this.idx(x, y);
        this.visible[i] = 1; this.seen[i] = 1;
        this.light[i] = CC.clamp(1 - Math.pow(d / soft, 1.55), 0.08, 1);
      }
    }
    this.light[this.idx(px, py)] = 1;
  };
  root.CC.Level = Level;
  root.CC.TILE = { WALL: WALL, FLOOR: FLOOR, WATER: WATER, EMBER: EMBER, UP: UP, DOWN: DOWN,
    VAULT: VAULT, PILLAR: PILLAR, SHRINE: SHRINE, BONES: BONES };
  root.CC.DIRS = DIRS;
  root.CC.ALL_DIRS = ALL_DIRS;
  root.CC.MAPW = W; root.CC.MAPH = H;
  root.CC.FLOOR_BANDS = BANDS;
  root.CC.bandFor = bandFor;
  root.CC.isBossDepth = isBossDepth;
  root.CC.bossKeyFor = bossKeyFor;
})(window);
