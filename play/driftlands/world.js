/* Driftlands — world generation, content registry and save schema.
 * Pure logic, no rendering. The island generator, landmark set and tuned
 * constants are carried over from the prototype design document.
 */
(function (root) {
  'use strict';
  var DL = root.DL || (root.DL = {});

  var MAP = 128;
  var WATER = 0, BEACH = 1, GRASS = 2, FOREST = 3, ROCK = 4, RUIN = 5, SHALLOW = 6;
  // Portrait rooms: the prototype's 20x13 gauntlet room rotated to 13x20 so a
  // whole room reads on a phone without shrinking the tiles.
  var ROOM_W = 13, ROOM_H = 20;
  var CAMP = [64, 106];
  var RUIN_GATE = [64, 51];
  // Gauntlets are ordered by distance from camp, so difficulty (which rises
  // with the gate index) also rises with how far you have travelled.
  // Distances from CAMP: 15.6, 72.1, 74.7 tiles.
  var GATES = [[74, 94], [99, 43], [31, 39]];
  var TAU = Math.PI * 2;

  function clamp(n, a, b) { return n < a ? a : n > b ? b : n; }
  function dist(a, b, c, d) { return Math.hypot(a - c, b - d); }

  function rng(start) {
    var n = (start >>> 0) || 1;
    return function () { n = (n * 1664525 + 1013904223) >>> 0; return n / 4294967296; };
  }

  function makeHash(seed) {
    return function (x, y, s) {
      var n = (Math.imul(x + 17, 374761393) ^ Math.imul(y + 29, 668265263) ^ (s === undefined ? seed : s)) >>> 0;
      n = Math.imul(n ^ (n >>> 13), 1274126177) >>> 0;
      return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
    };
  }

  /* ------------------------------------------------------------- world gen */
  // The opening cove is authored, not rolled: a fixed beach crescent, a grass
  // clearing for the camp, a rock shoulder on each side and one north exit.
  // Every seed therefore starts on the same readable piece of ground.
  var COVE = { x: CAMP[0], y: CAMP[1], r: 11, exitW: 6 };

  function carveCove(tiles) {
    var cx = COVE.x, cy = COVE.y, R = COVE.r;
    for (var y = cy - R - 3; y <= cy + R + 3; y++) {
      for (var x = cx - R - 3; x <= cx + R + 3; x++) {
        if (x < 1 || y < 1 || x >= MAP - 1 || y >= MAP - 1) continue;
        var d = dist(x, y, cx, cy);
        if (d > R + 3) continue;
        if (d > R + 1) { if (tiles[y * MAP + x] === WATER) tiles[y * MAP + x] = BEACH; continue; }
        if (y > cy + R - 4) tiles[y * MAP + x] = BEACH;             // shoreline crescent
        else if (d > R - 2 && x < cx) tiles[y * MAP + x] = ROCK;    // west shoulder
        else if (d > R - 2 && x > cx) tiles[y * MAP + x] = ROCK;    // east shoulder
        else tiles[y * MAP + x] = GRASS;
      }
    }
    // the single north exit out of the cove
    for (var ey = cy - R - 4; ey <= cy - R + 2; ey++) {
      for (var ex = cx - (COVE.exitW >> 1); ex <= cx + (COVE.exitW >> 1); ex++) {
        if (ex < 1 || ey < 1 || ex >= MAP - 1 || ey >= MAP - 1) continue;
        tiles[ey * MAP + ex] = GRASS;
      }
    }
  }

  function generate(seed) {
    var hash = makeHash(seed);
    var tiles = new Uint8Array(MAP * MAP);
    var x, y;
    for (y = 0; y < MAP; y++) {
      for (x = 0; x < MAP; x++) {
        var dx = (x - 63.5) / 1.02, dy = (y - 63.5) / 0.91;
        var edge = Math.hypot(dx, dy) + (hash(x, y) - 0.5) * 7;
        var tile = WATER;
        if (edge < 60) {
          var patch = (Math.sin(x * 0.15 + seed * 0.00001) + Math.cos(y * 0.12 - seed * 0.00002) + hash(x >> 1, y >> 1) * 1.8) / 3;
          tile = edge > 53 ? BEACH : patch > 0.44 ? FOREST : patch < -0.46 ? ROCK : GRASS;
          // ruin outcrops cluster into readable patches instead of single tiles
          if (hash((x >> 2) + 70, (y >> 2) - 25) > 0.968) tile = RUIN;
        } else if (edge < 64) tile = BEACH;
        tiles[y * MAP + x] = tile;
      }
    }
    // Landmarks stay reachable whatever the seed rolls.
    [[RUIN_GATE[0], RUIN_GATE[1], 5], [GATES[0][0], GATES[0][1], 3],
      [GATES[1][0], GATES[1][1], 3], [GATES[2][0], GATES[2][1], 3]].forEach(function (p) {
      var cx = p[0], cy = p[1], r = p[2];
      for (var yy = cy - r; yy <= cy + r; yy++) for (var xx = cx - r; xx <= cx + r; xx++) {
        if (xx >= 0 && yy >= 0 && xx < MAP && yy < MAP && dist(xx, yy, cx, cy) <= r) {
          tiles[yy * MAP + xx] = yy > cy + r - 2 ? BEACH : GRASS;
        }
      }
    });
    for (y = 48; y <= 54; y++) for (x = 60; x <= 68; x++) if (dist(x, y, 64, 51) < 5) tiles[y * MAP + x] = RUIN;
    carveCove(tiles);

    // shallow shelf: water within two tiles of the shore
    var out = new Uint8Array(tiles);
    for (y = 0; y < MAP; y++) for (x = 0; x < MAP; x++) {
      if (tiles[y * MAP + x] !== WATER) continue;
      var near = false;
      for (var oy = -2; oy <= 2 && !near; oy++) for (var ox = -2; ox <= 2; ox++) {
        var nx = x + ox, ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= MAP || ny >= MAP) continue;
        if (tiles[ny * MAP + nx] !== WATER) { near = true; break; }
      }
      if (near) out[y * MAP + x] = SHALLOW;
    }
    return out;
  }

  function isLand(tiles, x, y) {
    var tx = Math.floor(x), ty = Math.floor(y);
    if (tx < 1 || ty < 1 || tx >= MAP - 1 || ty >= MAP - 1) return false;
    var t = tiles[ty * MAP + tx];
    return t !== WATER && t !== SHALLOW;
  }

  // Difficulty ramps with distance from the camp beach.
  function tierAt(x, y) { return clamp(Math.floor(dist(x, y, CAMP[0], CAMP[1]) / 24), 0, 3); }

  var TYPES = ['mossling', 'skitter', 'brute'];

  // Phase is derived from the seed and the enemy id, never Math.random, so a
  // reloaded save reproduces the same wander pattern.
  function makeWorldEnemy(type, x, y, id, seed) {
    var tier = tierAt(x, y);
    var base = type === 'brute' ? 3 : 2;
    var hp = base + tier;
    var h = makeHash((seed || 0) >>> 0);
    return {
      id: id, type: type, x: x, y: y, homeX: x, homeY: y, tier: tier,
      hp: hp, maxHp: hp, phase: h(id, id * 7, ((seed || 0) + 5011) >>> 0) * TAU,
      cooldown: 0, hit: 0, kx: 0, ky: 0, atk: 0, dying: 0,
      dead: false, respawn: 0
    };
  }

  function spawnEnemies(tiles, seed) {
    var r = rng(seed ^ 0xa91e37);
    var list = [];
    for (var i = 0; i < 34; i++) {
      var x = 14 + r() * 100, y = 14 + r() * 100, tries = 0;
      while ((!isLand(tiles, x, y) || dist(x, y, CAMP[0], CAMP[1]) < 15 ||
              GATES.some(function (p) { return dist(x, y, p[0], p[1]) < 7; })) && tries++ < 24) {
        x = 14 + r() * 100; y = 14 + r() * 100;
      }
      if (isLand(tiles, x, y) && dist(x, y, CAMP[0], CAMP[1]) >= 15) list.push(makeWorldEnemy(TYPES[i % 3], x, y, i, seed));
    }
    return list;
  }

  // Twelve sigils seeded across the island in widening rings from camp.
  function spawnSigils(tiles, seed) {
    var r = rng(seed ^ 0x5c191d);
    var out = [];
    for (var i = 0; i < 12; i++) {
      var ring = 18 + (i % 4) * 16 + (i / 4 | 0) * 6;
      var ok = null;
      for (var t = 0; t < 60 && !ok; t++) {
        var a = r() * TAU;
        var rad = ring + (r() - 0.5) * 10;
        var x = CAMP[0] + Math.cos(a) * rad, y = CAMP[1] + Math.sin(a) * rad * 0.9;
        if (isLand(tiles, x, y) && dist(x, y, CAMP[0], CAMP[1]) > 14) ok = [x, y];
      }
      if (!ok) ok = [CAMP[0] + 6 + i, CAMP[1] - 16];
      out.push({ id: i, x: ok[0], y: ok[1] });
    }
    return out;
  }

  /* --------------------------------------------------------------- dungeon */
  // Five rooms per gauntlet. Room 3 hides the ward key, room 5 holds the
  // guardian and the relic chest it locks. Room silhouettes vary per room so
  // a gauntlet is not the same 13x20 box repainted five times.
  var ROOM_SHAPES = ['open', 'pillars', 'alcoves', 'choke', 'arena'];

  // Returns a ROOM_H x ROOM_W grid of 0 floor / 1 wall / 2 prop.
  function roomLayout(index, room) {
    var shape = ROOM_SHAPES[room % ROOM_SHAPES.length];
    var g = [];
    for (var y = 0; y < ROOM_H; y++) {
      g.push(new Array(ROOM_W));
      for (var x = 0; x < ROOM_W; x++) {
        g[y][x] = (x === 0 || y === 0 || x === ROOM_W - 1 || y === ROOM_H - 1) ? 1 : 0;
      }
    }
    function wall(x, y) { if (x > 0 && y > 0 && x < ROOM_W - 1 && y < ROOM_H - 1) g[y][x] = 1; }
    function prop(x, y) { if (x > 0 && y > 0 && x < ROOM_W - 1 && y < ROOM_H - 1 && !g[y][x]) g[y][x] = 2; }
    if (shape === 'pillars') {
      for (var py = 5; py < ROOM_H - 4; py += 5) for (var px = 3; px < ROOM_W - 2; px += 4) { wall(px, py); wall(px, py + 1); }
    } else if (shape === 'alcoves') {
      for (var ay = 4; ay < ROOM_H - 3; ay += 6) {
        wall(1, ay); wall(2, ay); wall(1, ay + 3); wall(2, ay + 3);
        wall(ROOM_W - 2, ay); wall(ROOM_W - 3, ay); wall(ROOM_W - 2, ay + 3); wall(ROOM_W - 3, ay + 3);
        prop(1, ay + 1); prop(ROOM_W - 2, ay + 1);
      }
    } else if (shape === 'choke') {
      var my = (ROOM_H >> 1);
      for (var cx = 1; cx < ROOM_W - 1; cx++) if (cx < (ROOM_W >> 1) - 1 || cx > (ROOM_W >> 1) + 1) { wall(cx, my); wall(cx, my + 1); }
      prop(2, my - 2); prop(ROOM_W - 3, my + 3);
    } else if (shape === 'arena') {
      for (var k = 0; k < 4; k++) {
        wall(2 + k, 3); wall(ROOM_W - 3 - k, 3);
        wall(2, 4 + k); wall(ROOM_W - 3, 4 + k);
      }
      prop(3, 4); prop(ROOM_W - 4, 4);
    } else {
      prop(3, ROOM_H - 6); prop(ROOM_W - 4, 6);
    }
    // the north gate lane and the south entry lane always stay clear
    for (var gy = 0; gy < 4; gy++) for (var gx = (ROOM_W >> 1) - 1; gx <= (ROOM_W >> 1) + 1; gx++) g[gy][gx] = gy === 0 ? 1 : 0;
    for (var sy = ROOM_H - 4; sy < ROOM_H - 1; sy++) for (var sx = (ROOM_W >> 1) - 1; sx <= (ROOM_W >> 1) + 1; sx++) g[sy][sx] = 0;
    return g;
  }

  function dungeonRoster(seed, index, room) {
    var r = rng(seed + index * 991 + room * 173);
    var list = [];
    var count = 2 + room + (index % 2);
    var types = index === 0 ? ['skitter', 'mossling'] : index === 1 ? ['brute', 'wisp'] : ['wisp', 'skitter', 'brute'];
    for (var i = 0; i < count; i++) {
      var type = types[i % types.length];
      var hp = (type === 'brute' ? 4 : type === 'wisp' ? 2 : 3) + index;
      list.push({
        type: type, x: 2.2 + r() * (ROOM_W - 4.4), y: 2.5 + r() * (ROOM_H - 7),
        hp: hp, maxHp: hp, phase: r() * TAU, cooldown: 0.4 + r(), hit: 0,
        kx: 0, ky: 0, atk: 0, dying: 0, dead: false
      });
    }
    if (room === 4) {
      list.push({
        type: 'guardian', x: ROOM_W / 2, y: 5, hp: 12 + index * 4, maxHp: 12 + index * 4,
        phase: 0, cooldown: 1.4, hit: 0, kx: 0, ky: 0, atk: 0, dying: 0, dead: false, boss: true
      });
    }
    return list;
  }

  /* ------------------------------------------------------------ save state */
  var SAVE_V = 4;

  function blankSave(seed) {
    return {
      v: SAVE_V,
      seed: seed >>> 0,
      gear: { sword: 0, armor: 0, speed: 0 },
      relics: [false, false, false],
      keys: [false, false, false],
      sigils: new Array(12).fill(false),
      fog: '',
      best: 0,
      score: 0,
      elapsed: 0,
      taught: false,
      won: false
    };
  }

  /* Deep validation. Anything a hand edited or corrupted localStorage record
   * could smuggle in (string relics, object scores, fractional gear levels,
   * a fog string with characters outside the encoding) is rejected outright
   * rather than coerced during play.
   */
  function isBoolArray(a, n) {
    if (!Array.isArray(a) || a.length !== n) return false;
    for (var i = 0; i < n; i++) if (a[i] !== true && a[i] !== false) return false;
    return true;
  }
  function isInt(v, lo, hi) {
    return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v >= lo && v <= hi;
  }
  function isNum(v, lo, hi) {
    return typeof v === 'number' && isFinite(v) && v >= lo && v <= hi;
  }

  function validate(s) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return false;
    if (s.v !== SAVE_V) return false;
    if (!isInt(s.seed, 0, 0xffffffff)) return false;
    if (!s.gear || typeof s.gear !== 'object' || Array.isArray(s.gear)) return false;
    if (!isInt(s.gear.sword, 0, 4) || !isInt(s.gear.armor, 0, 4) || !isInt(s.gear.speed, 0, 4)) return false;
    if (!isBoolArray(s.relics, 3)) return false;
    if (!isBoolArray(s.keys, 3)) return false;
    if (!isBoolArray(s.sigils, 12)) return false;
    if (typeof s.fog !== 'string') return false;
    if (s.fog.length !== 0 && s.fog.length !== 64 * 64) return false;
    for (var i = 0; i < s.fog.length; i++) {
      var c = s.fog.charCodeAt(i);
      if (c !== 48 && c !== 49) return false;
    }
    if (!isNum(s.best, 0, 1e9)) return false;
    if (!isNum(s.score, 0, 1e9)) return false;
    if (!isNum(s.elapsed, 0, 1e7)) return false;
    if (s.taught !== true && s.taught !== false) return false;
    if (s.won !== true && s.won !== false) return false;
    return true;
  }

  DL.world = {
    MAP: MAP, ROOM_W: ROOM_W, ROOM_H: ROOM_H,
    WATER: WATER, BEACH: BEACH, GRASS: GRASS, FOREST: FOREST, ROCK: ROCK, RUIN: RUIN, SHALLOW: SHALLOW,
    CAMP: CAMP, RUIN_GATE: RUIN_GATE, GATES: GATES, COVE: COVE,
    generate: generate, isLand: isLand, tierAt: tierAt,
    spawnEnemies: spawnEnemies, spawnSigils: spawnSigils, makeWorldEnemy: makeWorldEnemy,
    dungeonRoster: dungeonRoster, roomLayout: roomLayout, ROOM_SHAPES: ROOM_SHAPES,
    blankSave: blankSave, validate: validate, SAVE_V: SAVE_V,
    rng: rng, makeHash: makeHash, clamp: clamp, dist: dist
  };
})(window);
