/* Bulwark - deterministic content, map solving, and wave construction. */
'use strict';

(function (root) {
  var E = {};
  var TAU = Math.PI * 2;

  E.VERSION = 2;
  E.EMPTY = 0;
  E.ROCK = 1;
  E.WALL = 2;
  E.TOWER = 3;

  E.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  E.dist2 = function (ax, ay, bx, by) {
    var dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy;
  };
  E.rng = function (seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /* Rows are authored in the same 14x9 coordinate system used by the scene.
   * S is the north gate, E is the protected gate, and # is neutral terrain. */
  E.MAPS = [
    {
      id: 'open-plains', name: 'OPEN PLAINS', subtitle: 'wide sightlines / twin pockets',
      biome: 'plains', entryHint: 'The Long Approach', signature: 'Offset the route through two open pockets.',
      rows: [
        '..S...........',
        '...#..#....#..',
        '...#..#.......',
        '........##....',
        '......#.......',
        '....##........',
        '.......#..#...',
        '.........#....',
        '...........E..'
      ]
    },
    {
      id: 'river-split', name: 'RIVER SPLIT', subtitle: 'two banks / one bridge choice',
      biome: 'river', entryHint: 'The Split Current', signature: 'Reserve one bridge, then fold the banks into a loop.',
      rows: [
        '....S.........',
        '....###.......',
        '..#####..##...',
        '..#####..##...',
        '.......###....',
        '...##..###....',
        '...##.........',
        '...##......#..',
        '..........E...'
      ]
    },
    {
      id: 'canyon-funnel', name: 'CANYON FUNNEL', subtitle: 'stone jaws / single throat',
      biome: 'canyon', entryHint: 'The Red Throat', signature: 'The canyon has one throat. Make it longer, never closed.',
      rows: [
        '......S.......',
        '######.#######',
        '######.#######',
        '#####...######',
        '#####.########',
        '#####.########',
        '#####.########',
        '#####.########',
        '......E.......'
      ]
    },
    {
      id: 'final-bastion', name: 'FINAL BASTION', subtitle: 'fortress rings / two gate puzzle',
      biome: 'bastion', entryHint: 'The Crown Gate', signature: 'Crack the outer ring, then turn the inner gate into a kill lane.',
      rows: [
        '..S...........',
        '..##....##....',
        '..##....##....',
        '....######....',
        '....#....#....',
        '....#....#....',
        '....######....',
        '..##....##....',
        '...........E..'
      ]
    }
  ];

  E.TOWERS = {
    wall: {
      key: 'wall', name: 'WALL', short: 'WALL', cost: 8, color: 0x93a1b4, dark: 0x3d4c60,
      role: 'barrier', desc: 'blocks and bends the route', unlock: 0
    },
    arrow: {
      key: 'arrow', name: 'ARROW', short: 'ARROW', cost: 28, color: 0x54d6ec, dark: 0x1b5d76,
      role: 'precision', desc: 'fast single target fire', unlock: 0, damage: 11, rate: 0.54, range: 3.2
    },
    frost: {
      key: 'frost', name: 'FROST', short: 'FROST', cost: 40, color: 0x8fe7ff, dark: 0x265f88,
      role: 'control', desc: 'slows a target in its ring', unlock: 10, damage: 5, rate: 0.68, range: 2.8, slow: 0.48
    },
    splash: {
      key: 'splash', name: 'SPLASH', short: 'SPLASH', cost: 58, color: 0xffc45d, dark: 0x805426,
      role: 'area', desc: 'lobbed impact hits a cluster', unlock: 20, damage: 20, rate: 1.18, range: 2.7, aoe: 1.1
    },
    zap: {
      key: 'zap', name: 'ZAP', short: 'ZAP', cost: 72, color: 0xcda1ff, dark: 0x5d438e,
      role: 'chain', desc: 'links through nearby creeps', unlock: 30, damage: 16, rate: 0.96, range: 3.3, chains: 3
    },
    bank: {
      key: 'bank', name: 'BANK', short: 'BANK', cost: 48, color: 0xffdf79, dark: 0x806c28,
      role: 'economy', desc: 'adds interest between waves', unlock: 0, bank: true
    }
  };
  E.CHIP_ORDER = ['wall', 'arrow', 'frost', 'splash', 'zap', 'bank'];

  E.ENEMIES = {
    grunt:  { name: 'GRUNT',  hp: 28, speed: 1.42, color: 0xff665c, radius: 0.27, gold: 4, leak: 1, silhouette: 'grunt' },
    runner: { name: 'RUNNER', hp: 18, speed: 2.55, color: 0xffb86b, radius: 0.22, gold: 4, leak: 1, silhouette: 'runner' },
    tank:   { name: 'TANK',   hp: 96, speed: 0.82, color: 0xc9c0a9, radius: 0.36, gold: 10, leak: 2, armor: 4, silhouette: 'tank' },
    flier:  { name: 'FLIER',  hp: 24, speed: 1.85, color: 0x8bd9c5, radius: 0.24, gold: 6, leak: 1, fly: true, silhouette: 'flier' },
    shield: { name: 'SHIELD', hp: 38, speed: 1.17, color: 0x85a9ff, radius: 0.31, gold: 8, leak: 1, shield: 32, silhouette: 'shield' },
    boss:   { name: 'WARDEN', hp: 640, speed: 0.62, color: 0xff4d8d, radius: 0.54, gold: 80, leak: 8, armor: 7, boss: true, silhouette: 'boss' }
  };

  E.MEDALS = [
    { wave: 10, name: 'BRONZE', color: 0xd89462, desc: 'FROST chip online' },
    { wave: 20, name: 'SILVER', color: 0xc9d8e5, desc: 'SPLASH chip online' },
    { wave: 30, name: 'GOLD', color: 0xffdf79, desc: 'ZAP chip online' }
  ];

  function normalizedRows(rows, cols, rowsCount) {
    var out = [], y;
    for (y = 0; y < rowsCount; y++) {
      var line = String(rows[y] || '').slice(0, cols);
      while (line.length < cols) line += '.';
      out.push(line);
    }
    return out;
  }

  E.Map = function (definition) {
    this.definition = definition;
    this.id = definition.id;
    this.cols = 14;
    this.rows = 9;
    this.n = this.cols * this.rows;
    this.g = new Uint8Array(this.n);
    this.dist = new Int32Array(this.n);
    this.next = new Int32Array(this.n);
    this.entry = 0;
    this.exit = this.n - 1;
    this.entryC = 0;
    this.exitC = this.cols - 1;
    var source = normalizedRows(definition.rows, this.cols, this.rows);
    for (var y = 0; y < this.rows; y++) {
      for (var x = 0; x < this.cols; x++) {
        var ch = source[y].charAt(x);
        var index = y * this.cols + x;
        if (ch === '#') this.g[index] = E.ROCK;
        if (ch === 'S') { this.entry = index; this.entryC = x; }
        if (ch === 'E') { this.exit = index; this.exitC = x; }
      }
    }
    this.solve();
    if (this.dist[this.entry] < 0) this.carveFallback();
  };
  E.Map.prototype.idx = function (x, y) { return y * this.cols + x; };
  E.Map.prototype.walkable = function (i) { return this.g[i] === E.EMPTY; };
  E.Map.prototype.solve = function (override, overrideValue) {
    var n = this.n, cols = this.cols, rows = this.rows, q = new Int32Array(n), head = 0, tail = 0;
    var i;
    for (i = 0; i < n; i++) { this.dist[i] = -1; this.next[i] = -1; }
    function blocked(index, g) {
      return (index === override ? overrideValue : g[index]) !== E.EMPTY;
    }
    if (blocked(this.exit, this.g)) return false;
    this.dist[this.exit] = 0;
    q[tail++] = this.exit;
    while (head < tail) {
      var current = q[head++], cx = current % cols, cy = (current / cols) | 0;
      for (var k = 0; k < 4; k++) {
        var ax = cx + (k === 0 ? 1 : k === 1 ? -1 : 0);
        var ay = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (ax < 0 || ay < 0 || ax >= cols || ay >= rows) continue;
        var j = ay * cols + ax;
        if (this.dist[j] !== -1 || blocked(j, this.g)) continue;
        this.dist[j] = this.dist[current] + 1;
        this.next[j] = current;
        q[tail++] = j;
      }
    }
    return this.dist[this.entry] >= 0;
  };
  E.Map.prototype.carveFallback = function () {
    var y, x;
    for (y = 0; y < this.rows; y++) this.g[y * this.cols + this.entryC] = E.EMPTY;
    for (x = 0; x < this.cols; x++) this.g[(this.rows - 1) * this.cols + x] = E.EMPTY;
    this.g[this.entry] = E.EMPTY;
    this.g[this.exit] = E.EMPTY;
    this.solve();
  };
  E.Map.prototype.canPlace = function (index, occupiedCells) {
    if (index < 0 || index >= this.n || this.g[index] !== E.EMPTY || index === this.entry || index === this.exit) return false;
    var old = this.g[index];
    this.g[index] = E.WALL;
    var ok = this.solve();
    if (ok && occupiedCells) {
      for (var i = 0; i < occupiedCells.length; i++) {
        var c = occupiedCells[i];
        if (c === index || this.dist[c] < 0) { ok = false; break; }
      }
    }
    this.g[index] = old;
    this.solve();
    return ok;
  };
  E.Map.prototype.path = function () {
    var out = [], i = this.entry, guard = 0;
    while (i >= 0 && guard++ < this.n + 4) {
      out.push(i);
      if (i === this.exit) break;
      i = this.next[i];
    }
    return out;
  };

  E.mapIndex = function (key) {
    if (typeof key === 'string') {
      for (var i = 0; i < E.MAPS.length; i++) if (E.MAPS[i].id === key) return i;
    }
    var number = Number(key);
    return isFinite(number) ? E.clamp(Math.floor(number), 0, E.MAPS.length - 1) : 0;
  };
  E.mapByKey = function (key) { return E.MAPS[E.mapIndex(key)] || E.MAPS[0]; };

  E.isUnlocked = function (key, wavesDone) {
    var d = E.TOWERS[key];
    return !!d && (d.unlock || 0) <= (wavesDone || 0);
  };

  E.makeWave = function (wave, seed) {
    var r = E.rng((seed || 0xB17A4) + wave * 104729);
    var queue = [], t = 0, i, kind;
    if (wave % 10 === 0) {
      queue.push({ type: 'boss', at: 0.65, scale: 1 + Math.min(1.65, (wave - 10) * 0.075) });
      var escort = Math.min(24, 8 + Math.floor(wave * 0.7));
      for (i = 0; i < escort; i++) {
        kind = r() < 0.35 ? 'runner' : (r() < 0.55 ? 'shield' : 'grunt');
        queue.push({ type: kind, at: 1.45 + i * 0.34, scale: 1 + Math.min(1.3, wave * 0.045) });
      }
      return queue;
    }
    var count = Math.min(48, 7 + Math.floor(wave * 1.35));
    var pool = ['grunt'];
    if (wave >= 3) pool.push('runner');
    if (wave >= 5) pool.push('flier');
    if (wave >= 7) pool.push('tank');
    if (wave >= 9) pool.push('shield');
    if (wave >= 15) pool.push('tank', 'flier');
    for (i = 0; i < count; i++) {
      t += 0.27 + r() * 0.36;
      kind = pool[(r() * pool.length) | 0];
      queue.push({ type: kind, at: t, scale: 1 + Math.min(1.45, wave * 0.042) });
    }
    return queue;
  };

  E.TAU = TAU;
  if (typeof module !== 'undefined' && module.exports) module.exports = E;
  root.BulwarkEngine = E;
}(typeof window !== 'undefined' ? window : globalThis));
