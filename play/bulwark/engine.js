/* Bulwark - engine: rng, audio, math, map gen, pathfinding */
'use strict';

var E = {};

/* ---------- rng ---------- */
E.rng = function (seed) {
  var s = seed >>> 0;
  return function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    var t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/* ---------- math ---------- */
E.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
E.lerp = function (a, b, t) { return a + (b - a) * t; };
E.dist2 = function (ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };

/* ---------- audio (WebAudio only, no files) ---------- */
E.audio = (function () {
  var ctx = null, master = null, on = true;
  function init() {
    if (ctx) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { on = false; return; }
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.22;
      master.connect(ctx.destination);
    } catch (e) { on = false; }
  }
  function blip(freq, dur, type, vol, slide) {
    if (!on || !ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    var t = ctx.currentTime;
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.5, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, f0) {
    if (!on || !ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    var n = Math.floor(ctx.sampleRate * dur);
    var buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var src = ctx.createBufferSource(); src.buffer = buf;
    var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f0 || 900; bp.Q.value = 1.2;
    var g = ctx.createGain(); g.gain.value = vol || 0.4;
    src.connect(bp); bp.connect(g); g.connect(master);
    src.start();
  }
  return {
    init: init,
    toggle: function () { on = !on; if (on) init(); return on; },
    isOn: function () { return on; },
    shoot: function () { blip(680, 0.05, 'square', 0.16, 0.5); },
    zap: function () { blip(1400, 0.09, 'sawtooth', 0.14, 0.3); },
    boom: function () { noise(0.22, 0.4, 220); },
    frost: function () { blip(320, 0.09, 'sine', 0.14, 1.8); },
    kill: function () { blip(220, 0.09, 'triangle', 0.22, 2.2); },
    build: function () { blip(440, 0.07, 'square', 0.22, 1.6); blip(660, 0.09, 'square', 0.14, 1.4); },
    deny: function () { blip(150, 0.13, 'sawtooth', 0.2, 0.7); },
    leak: function () { blip(180, 0.3, 'sawtooth', 0.3, 0.4); noise(0.25, 0.3, 320); },
    coin: function () { blip(880, 0.06, 'square', 0.14, 1.5); blip(1320, 0.08, 'square', 0.1, 1.2); },
    wave: function () { blip(300, 0.12, 'triangle', 0.2, 1.9); },
    win: function () { [523, 659, 784, 1046].forEach(function (f, i) { setTimeout(function () { blip(f, 0.22, 'triangle', 0.22, 1); }, i * 120); }); },
    lose: function () { [400, 320, 250, 180].forEach(function (f, i) { setTimeout(function () { blip(f, 0.3, 'sawtooth', 0.24, 0.7); }, i * 150); }); }
  };
})();

/* ---------- map ---------- */
/* cell codes */
E.EMPTY = 0; E.ROCK = 1; E.WALL = 2; E.TOWER = 3;

E.Map = function (cols, rows, seed) {
  this.cols = cols; this.rows = rows;
  this.n = cols * rows;
  this.g = new Uint8Array(this.n);
  this.dist = new Int32Array(this.n);
  this.next = new Int32Array(this.n);
  var r = E.rng(seed);
  this.entryC = 1 + Math.floor(r() * (cols - 2));
  this.exitC = 1 + Math.floor(r() * (cols - 2));
  if (Math.abs(this.entryC - this.exitC) < 2) this.exitC = (this.exitC + 3) % (cols - 2) + 1;
  this.entry = this.entryC;                  // index in top row
  this.exit = (rows - 1) * cols + this.exitC; // index in bottom row
  // rock blobs
  var blobs = 3 + Math.floor(r() * 4);
  for (var b = 0; b < blobs; b++) {
    var cx = Math.floor(r() * cols), cy = 2 + Math.floor(r() * (rows - 4));
    var sz = 2 + Math.floor(r() * 4);
    for (var k = 0; k < sz; k++) {
      var x = cx + Math.round((r() - 0.5) * 2.4), y = cy + Math.round((r() - 0.5) * 2.4);
      if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
      var i = y * cols + x;
      if (y === 0 || y === rows - 1) continue;
      if (x === this.entryC && y < 2) continue;
      if (x === this.exitC && y > rows - 3) continue;
      this.g[i] = E.ROCK;
    }
  }
  // keep entry/exit lanes clear
  this.g[this.entry] = E.EMPTY;
  this.g[this.exit] = E.EMPTY;
  this.g[this.entry + cols] = E.EMPTY;
  this.g[this.exit - cols] = E.EMPTY;
  if (!this.solve()) { // rare: carve a corridor
    for (var y2 = 0; y2 < rows; y2++) this.g[y2 * cols + this.entryC] = E.EMPTY;
    for (var x2 = 0; x2 < cols; x2++) this.g[(rows - 1) * cols + x2] = E.EMPTY;
    this.solve();
  }
};

E.Map.prototype.idx = function (x, y) { return y * this.cols + x; };
E.Map.prototype.walkable = function (i) { return this.g[i] === E.EMPTY; };

/* BFS distance field from exit; fills dist + next. returns true if entry reachable */
E.Map.prototype.solve = function (override, ovVal) {
  var cols = this.cols, rows = this.rows, n = this.n;
  var d = this.dist, nx = this.next, g = this.g;
  for (var i = 0; i < n; i++) { d[i] = -1; nx[i] = -1; }
  var q = new Int32Array(n), head = 0, tail = 0;
  var blocked = function (j) {
    var v = (override === j) ? ovVal : g[j];
    return v !== E.EMPTY;
  };
  if (blocked(this.exit)) return false;
  d[this.exit] = 0; q[tail++] = this.exit;
  while (head < tail) {
    var c = q[head++], cd = d[c];
    var cx = c % cols, cy = (c / cols) | 0;
    for (var k = 0; k < 4; k++) {
      var ax = cx + (k === 0 ? 1 : k === 1 ? -1 : 0);
      var ay = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
      if (ax < 0 || ay < 0 || ax >= cols || ay >= rows) continue;
      var j = ay * cols + ax;
      if (d[j] !== -1) continue;
      if (blocked(j)) continue;
      d[j] = cd + 1; nx[j] = c; q[tail++] = j;
    }
  }
  return d[this.entry] >= 0;
};

/* can we place val at cell i without sealing the map or trapping creeps? */
E.Map.prototype.canPlace = function (i, occupiedCells) {
  if (this.g[i] !== E.EMPTY) return false;
  if (i === this.entry || i === this.exit) return false;
  var save = this.g[i];
  this.g[i] = E.WALL;
  var ok = this.solve();
  if (ok && occupiedCells) {
    for (var k = 0; k < occupiedCells.length; k++) {
      var c = occupiedCells[k];
      if (c === i) { ok = false; break; }
      if (this.dist[c] < 0) { ok = false; break; }
    }
  }
  this.g[i] = save;
  this.solve();
  return ok;
};
