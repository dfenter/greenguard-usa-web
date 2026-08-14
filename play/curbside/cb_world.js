/* cb_world.js - Curbside street generation and skate simulation.
 *
 * Deliberately engine-free: nothing in this file touches Phaser, the DOM or
 * GGKit. game.js owns every pixel and every sound; this file owns the truth.
 * That split is what lets the sim be stepped headlessly by the verification
 * harness at a fixed 60 Hz with no renderer attached.
 *
 * POOLING CONTRACT: every collection here is a swap-remove pool over a
 * preallocated record array. alloc() hands back a record that already
 * exists; free(i) swaps the last live record into slot i. The hot loop never
 * allocates, and the pools never grow past their ceiling - generation stops
 * instead, because a dropped chunk is survivable and a GC spike is not.
 *
 * RENDER-STATE RULE (bug class): sim records carry NO renderer handles. The
 * renderer keeps its own parallel view arrays keyed by the record's stable
 * `uid`. A record passed to the renderer is read-only to it.
 */
(function (root) {
  'use strict';

  var CB = root.CB_DATA || (typeof require === 'function' ? require('./cb_data.js') : null);

  var TAU = Math.PI * 2;
  var S = {};

  // ------------------------------------------------------------- tuning
  var T = {
    STEP: 1 / 60,
    PPM: 42,              // pixels per metre for the distance readout
    GRAV: 2050,           // px/s^2
    SPEED_BASE: 372,
    SPEED_MIN: 210,
    SPEED_MAX: 760,
    SPEED_RAMP: 11,       // px/s gained per 100 m travelled
    CLEAN_GAIN: 16,
    SKETCHY_LOSS: 62,
    DRAG_GROUND: 6,       // passive bleed toward the target cruise speed
    POP_MIN: 470,
    POP_RANGE: 350,
    CHARGE_TIME: 0.32,    // seconds of squash to reach a full pop
    SQUASH_MAX: 0.30,     // anticipation squash depth
    STEP_SNAP: 26,        // how far down the wheels will follow the street
    LAND_WINDOW: 40,      // vertical catch window when falling onto a surface
    GRIND_SNAP: 26,       // generous lock-on band above a rail or ledge
    GRIND_ARM_TIME: 0.55, // how long an up-swipe stays armed
    GRIND_POP: 400,
    BAL_CORRECT: 2.35,    // player authority over the wobble, per second
    BAL_WOBBLE: 0.95,     // base wobble growth
    BAL_SPEEDK: 0.0016,
    BAL_WARN: 0.62,
    CLEAN_ANG: 0.34,      // radians of board tilt still counted clean
    SKETCHY_ANG: 0.92,
    CATCH_MAX: 1.9,       // how much a rider may hurry a rotation to land it
    COMBO_DECAY: 2.4,     // seconds of stall before the multiplier steps down
    COMBO_MULT_STEP: 0.5,
    COMBO_MULT_MAX: 12,
    KILL_DROP: 300,       // fall this far below the street and it is a bail
    BOOST_SPEED: 168,
    PROMPT_TIME: 4.0,
    DENSITY_RAMP: 900,    // metres over which obstacle density reaches full
  };
  S.TUNING = T;

  // ---------------------------------------------------------- utilities
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function angNorm(a) {
    a = a % TAU;
    if (a > Math.PI) a -= TAU;
    if (a < -Math.PI) a += TAU;
    return a;
  }
  S.clamp = clamp; S.lerp = lerp; S.angNorm = angNorm; S.TAU = TAU;

  // Deterministic RNG so a seeded run replays identically for verification.
  function Rng(seed) {
    this.s = (seed >>> 0) || 0x9e3779b9;
  }
  Rng.prototype.next = function () {
    var x = this.s;
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5; x >>>= 0;
    this.s = x;
    return x / 4294967296;
  };
  Rng.prototype.range = function (a, b) { return a + this.next() * (b - a); };
  Rng.prototype.int = function (a, b) { return Math.floor(this.range(a, b + 1)); };
  Rng.prototype.pick = function (arr) { return arr[Math.floor(this.next() * arr.length) % arr.length]; };
  S.Rng = Rng;

  // -------------------------------------------------------------- pools
  // Swap-remove pool over preallocated records. `make` is called exactly
  // `cap` times at construction and never again.
  function Pool(cap, make) {
    this.cap = cap;
    this.n = 0;
    this.items = new Array(cap);
    this.uid = 0;
    for (var i = 0; i < cap; i++) {
      var r = make();
      r.uid = 0;
      this.items[i] = r;
    }
  }
  Pool.prototype.alloc = function () {
    if (this.n >= this.cap) return null;   // refuse, never grow
    var r = this.items[this.n++];
    this.uid = (this.uid + 1) & 0x3fffffff;
    r.uid = this.uid;
    return r;
  };
  Pool.prototype.freeAt = function (i) {
    var last = --this.n;
    if (i !== last) {
      var tmp = this.items[i];
      this.items[i] = this.items[last];
      this.items[last] = tmp;
    }
  };
  Pool.prototype.clear = function () { this.n = 0; };
  S.Pool = Pool;

  // ---------------------------------------------------- obstacle metrics
  // Collision boxes, deliberately a little smaller than the artwork so a
  // near miss reads as a near miss.
  var OBS = {
    hydrant: { w: 16, h: 28, frame: 'hydrant', ox: 22, oy: 34 },
    cone:    { w: 15, h: 23, frame: 'cone', ox: 22, oy: 28 },
    trash:   { w: 20, h: 30, frame: 'trash', ox: 26, oy: 34 },
    crate:   { w: 30, h: 27, frame: 'crate', ox: 34, oy: 30 },
    pallet:  { w: 36, h: 12, frame: 'pallet', ox: 40, oy: 14 },
    barrier: { w: 42, h: 21, frame: 'barrier', ox: 46, oy: 26 },
    bench:   { w: 46, h: 20, frame: 'bench', ox: 52, oy: 24 },
    planter: { w: 34, h: 25, frame: 'planter', ox: 40, oy: 30 },
    bollard: { w: 12, h: 26, frame: 'bollard', ox: 14, oy: 30 },
    face:    { w: 11, h: 30, frame: '', ox: 0, oy: 0 }
  };
  S.OBS = OBS;
  function obsDef(kind) { return OBS[kind] || OBS.cone; }
  // Street laid backwards from a feature so there is always a run-up.
  var LEAD_IN = 120;
  // Anything this low is a SCUFF, not a bail: you clip it, lose your speed
  // and your combo decays, but the run continues. Kerbs, pallets, benches
  // and low marble faces all fall under this, which is what stops a landing
  // that happens to touch down near a ledge from ending the run outright.
  var SCUFF_H = 22;
  S.obsDef = obsDef;

  var CARS = {
    car_sedan: { w: 128, h: 46 },
    car_taxi:  { w: 132, h: 48 },
    car_van:   { w: 146, h: 60 },
    car_truck: { w: 176, h: 66 }
  };
  S.CARS = CARS;
  function carDef(kind) { return CARS[kind] || CARS.car_sedan; }

  var PROPS = {
    lamp: { w: 28, h: 96 }, sign: { w: 30, h: 70 }, palm: { w: 46, h: 110 },
    stack: { w: 30, h: 90 }, bench: { w: 52, h: 24 }, planter: { w: 40, h: 30 },
    trash: { w: 26, h: 34 }, crate: { w: 34, h: 30 }
  };
  function propDef(kind) { return PROPS[kind] || PROPS.sign; }
  S.propDef = propDef;

  // ========================================================= the street
  function World() {
    this.segs = new Pool(340, function () {
      return { x0: 0, y0: 0, x1: 0, y1: 0, k: 'street', name: '' };
    });
    this.obs = new Pool(90, function () {
      return { x: 0, y: 0, w: 0, h: 0, kind: 'cone', solid: true };
    });
    this.cars = new Pool(18, function () {
      return { x: 0, y: 0, w: 0, h: 0, kind: 'car_sedan', vx: 0, honk: 0 };
    });
    this.props = new Pool(64, function () {
      return { x: 0, y: 0, kind: 'sign', depth: 0 };
    });
    this.crowd = new Pool(72, function () {
      return { x: 0, y: 0, frame: 0, phase: 0 };
    });
    this.picks = new Pool(56, function () {
      return { x: 0, y: 0, kind: 'combo', taken: false, bob: 0 };
    });
    this.gaps = new Pool(28, function () {
      return { x0: 0, x1: 0, name: '', points: 0, cleared: false, floor: 0 };
    });
    this.beats = new Pool(24, function () {
      return { x0: 0, x1: 0, kind: 'trick', label: '', hit: false, index: 0 };
    });
    this.shorts = new Pool(10, function () {
      return { x0: 0, x1: 0, y: 0, name: '', found: false };
    });

    this.gx = 0;
    this.gy = 0;
    this.baseY = 0;
    this.district = null;
    this.rng = new Rng(1);
    this.lastChunk = '';
    this.chunkCount = 0;
    // Cadence knobs. The mode sets these; the generator never hardcodes how
    // often the signature centrepiece or the high line comes round.
    this.sigEvery = 5;
    this.shortEvery = 7;
    this.streetGaps = 0;          // named filler gaps per breathing flat
    this.gapSeq = 0;
    this.endX = Infinity;         // finite for authored lines
    this.beatIndex = 0;
    // Preallocated surface-query scratch. surfaces() fills these and returns
    // a COUNT; it never allocates, and the records are reused every frame.
    this.surfN = 0;
    this.surfBuf = new Array(24);
    for (var si = 0; si < 24; si++) this.surfBuf[si] = { y: 0, seg: null };
    this.roofSeg = new Array(18);
    for (var ri = 0; ri < 18; ri++) {
      this.roofSeg[ri] = { k: 'roof', x0: 0, x1: 0, y0: 0, y1: 0, name: '', car: null };
    }
    this.grindHit = { y: 0, seg: null };
  }
  S.World = World;

  World.prototype.reset = function (district, seed, baseY) {
    this.segs.clear(); this.obs.clear(); this.cars.clear(); this.props.clear();
    this.crowd.clear(); this.picks.clear(); this.gaps.clear();
    this.beats.clear(); this.shorts.clear();
    this.district = district;
    this.rng = new Rng(seed);
    this.baseY = baseY;
    this.gy = baseY;
    this.gx = -700;
    this.lastChunk = '';
    this.chunkCount = 0;
    this.beatIndex = 0;
    this.endX = Infinity;
    // An open run-in before the first authored chunk: a few seconds of
    // clear street to find the controls in. The first chunk after it is
    // pinned to the district's gentle opener (see ensure), so a run never
    // begins with a stair set arriving at speed.
    // The cursor starts 700px behind the skater, so this run-in puts the
    // first authored chunk about 1600px (four seconds) down the road.
    this.piece(['flat', 2300]);
  };

  World.prototype.seg = function (x0, y0, x1, y1, k, name) {
    var s = this.segs.alloc();
    if (!s) return null;
    s.x0 = x0; s.y0 = y0; s.x1 = x1; s.y1 = y1; s.k = k; s.name = name || '';
    return s;
  };

  // ---------------------------------------------------- piece grammar
  World.prototype.piece = function (p) {
    var t = p[0], i, n;
    if (t === 'flat') {
      this.seg(this.gx, this.gy, this.gx + p[1], this.gy, 'street');
      this.gx += p[1];
    } else if (t === 'slope') {
      this.seg(this.gx, this.gy, this.gx + p[2], this.gy + p[1], 'street');
      this.gy += p[1]; this.gx += p[2];
    } else if (t === 'step') {
      if (p[1] < 0) {   // a step UP needs a face you have to clear
        var f = this.obs.alloc();
        if (f) {
          f.x = this.gx; f.y = this.gy + p[1]; f.w = 11; f.h = -p[1];
          f.kind = 'face'; f.solid = true;
        }
      }
      this.gy += p[1];
    } else if (t === 'stairs') {
      n = p[1];
      var rise = p[2], run = p[3], x0 = this.gx, y0 = this.gy;
      for (i = 0; i < n; i++) {
        this.seg(this.gx, this.gy, this.gx + run, this.gy, 'stair');
        this.gx += run; this.gy += rise;
      }
      if (p[4]) {
        this.seg(x0 - 22, y0 - 52, this.gx + 30, this.gy - 52, 'rail', 'HAND RAIL');
      }
    } else if (t === 'gap') {
      var g = this.gaps.alloc();
      if (g) {
        g.x0 = this.gx; g.x1 = this.gx + p[1];
        g.name = p[2] || ''; g.points = p[3] || 0;
        g.cleared = false; g.floor = this.gy;
      }
      this.gx += p[1];
    } else if (t === 'rail') {
      // LEAD_IN of real street BEFORE the feature. This advances the
      // cursor rather than just painting backwards, because a rail that
      // arrives right on top of a landing cannot be read, let alone popped
      // onto - that was the source of the unreactable kerb hits.
      this.piece(['flat', LEAD_IN]);
      this.seg(this.gx, this.gy, this.gx + p[1] + 60, this.gy, 'street');
      this.seg(this.gx, this.gy - p[2], this.gx + p[1], this.gy - p[2], 'rail', p[3] || '');
      this.gx += p[1] + 60;
    } else if (t === 'ledge') {
      this.piece(['flat', LEAD_IN]);
      this.seg(this.gx, this.gy, this.gx + p[1] + 60, this.gy, 'street');
      this.seg(this.gx, this.gy - p[2], this.gx + p[1], this.gy - p[2], 'ledge', p[3] || '');
      var face = this.obs.alloc();
      if (face) {
        face.x = this.gx; face.y = this.gy - p[2]; face.w = 11; face.h = p[2];
        face.kind = 'face'; face.solid = true;
      }
      this.gx += p[1] + 60;
    } else if (t === 'kicker') {
      this.seg(this.gx, this.gy, this.gx + p[2], this.gy - p[1], 'ramp');
      this.gx += p[2];
    } else if (t === 'obs') {
      var d = obsDef(p[1]);
      var o = this.obs.alloc();
      if (o) {
        o.x = this.gx + (p[2] || 0); o.y = this.gy - d.h;
        o.w = d.w; o.h = d.h; o.kind = p[1]; o.solid = true;
      }
    } else if (t === 'prop') {
      var pr = this.props.alloc();
      if (pr) {
        pr.x = this.gx + (p[2] || 0); pr.y = this.gy; pr.kind = p[1];
        pr.depth = 0;
      }
    } else if (t === 'car') {
      var cd = carDef(p[1]);
      var c = this.cars.alloc();
      if (c) {
        c.x = this.gx + 40; c.y = this.gy - cd.h; c.w = cd.w; c.h = cd.h;
        c.kind = p[1];
        // Traffic runs WITH the skater, slower than a cruising board, so a
        // car is something you catch and have to deal with rather than a
        // head-on hit with no reaction time. Parked cars have vx 0.
        c.vx = p[2] ? this.rng.range(96, 196) : 0;
        c.honk = 0;
      }
    } else if (t === 'pick') {
      var pk = this.picks.alloc();
      if (pk) {
        pk.x = this.gx + (p[2] || 0); pk.y = this.gy - (p[3] || 70);
        pk.kind = p[1]; pk.taken = false; pk.bob = this.rng.range(0, TAU);
      }
    } else if (t === 'crowd') {
      n = p[1] || 3;
      for (i = 0; i < n; i++) {
        var cw = this.crowd.alloc();
        if (!cw) break;
        cw.x = this.gx + this.rng.range(-160, 220);
        cw.y = this.gy;
        cw.frame = this.rng.int(0, 3);
        cw.phase = this.rng.range(0, TAU);
      }
    } else if (t === 'shortcut') {
      var h = p[1], len = p[2];
      this.seg(this.gx, this.gy, this.gx + len + 120, this.gy, 'street');
      this.seg(this.gx, this.gy - h, this.gx + len, this.gy - h, 'deck', p[3] || '');
      var sc = this.shorts.alloc();
      if (sc) {
        sc.x0 = this.gx; sc.x1 = this.gx + len; sc.y = this.gy - h;
        sc.name = p[3] || 'SHORTCUT'; sc.found = false;
      }
      // the reward for finding the high line: three generous drops on it
      for (i = 0; i < 3; i++) {
        var rp = this.picks.alloc();
        if (!rp) break;
        rp.x = this.gx + len * (0.22 + i * 0.28);
        rp.y = this.gy - h - 46;
        rp.kind = i === 1 ? 'boost' : 'combo';
        rp.taken = false; rp.bob = this.rng.range(0, TAU);
      }
      this.gx += len + 120;
    } else if (t === 'beat') {
      var b = this.beats.alloc();
      if (b) {
        b.x0 = this.gx - 40; b.x1 = this.gx + 300;
        b.kind = p[1]; b.label = p[2]; b.hit = false;
        b.index = this.beatIndex++;
      }
    }
  };

  World.prototype.buildChunk = function (chunk) {
    for (var i = 0; i < chunk.pieces.length; i++) this.piece(chunk.pieces[i]);
    this.chunkCount++;
    this.lastChunk = chunk.id;
  };

  // Endless generation. Density climbs with distance, and the signature gap
  // plus the shortcut chunk are guaranteed to appear on a fixed cadence so
  // every district shows its centrepiece and its high line.
  World.prototype.ensure = function (aheadX, metres) {
    var guard = 0;
    var d = this.district;
    if (!d) return;
    while (this.gx < aheadX && guard++ < 12) {
      if (this.segs.n > this.segs.cap - 26 || this.gx >= this.endX) return;
      // keep the street from wandering out of the viewport band
      if (this.gy > this.baseY + 300) { this.piece(['slope', -70, 170]); continue; }
      if (this.gy < this.baseY - 300) { this.piece(['step', 40]); this.piece(['flat', 200]); continue; }

      var density = clamp(metres / T.DENSITY_RAMP, 0, 1);
      if (this.chunkCount === 0) {
        this.buildChunk(d.chunks[0]);
        this.piece(['flat', 320]);
        continue;
      }
      var pool = [];
      for (var i = 0; i < d.chunks.length; i++) {
        var c = d.chunks[i];
        if (c.id === this.lastChunk) continue;
        if (c.signature) { if (this.chunkCount % this.sigEvery !== this.sigEvery - 1) continue; }
        else if (c.shortcut) { if (this.chunkCount % this.shortEvery !== 3) continue; }
        pool.push(c);
      }
      if (!pool.length) pool = d.chunks;
      var pickC = pool[Math.floor(this.rng.next() * pool.length) % pool.length];
      this.buildChunk(pickC);

      // Breathing room AFTER every authored chunk, laid down BEFORE any
      // procedural clutter. The order matters: escalation used to drop a
      // trash can at a negative offset straight onto the landing of the
      // chunk that just ended, which reads as an unfair hit. Clutter is now
      // only ever placed inside a flat run this generator laid itself.
      this.piece(['flat', this.rng.range(300, 460)]);
      // Gap Challenge seeds its own named gaps into the breathing flats.
      if (this.streetGaps > 0 && this.rng.next() < this.streetGaps) {
        var sg = CB.STREET_GAPS[this.gapSeq++ % CB.STREET_GAPS.length];
        this.piece(['gap', sg.len, sg.name, sg.points]);
        this.piece(['flat', this.rng.range(280, 420)]);
      }
      if (this.rng.next() < 0.25 + density * 0.45) {
        this.piece(['obs', this.rng.pick(['cone', 'trash', 'crate', 'bollard']),
                    this.rng.range(-250, -140)]);
      }
      // GENEROUS DROPS: the owner's rule. Density never reduces the drops.
      if (this.rng.next() < 0.78) {
        this.piece(['pick', this.rng.pick(['combo', 'boost', 'bonus', 'combo', 'boost']),
                    this.rng.range(-280, -60), this.rng.range(66, 104)]);
      }
      if (this.rng.next() < 0.20) {
        this.piece(['pick', 'save', this.rng.range(-240, -90), 78]);
      }
      if (this.rng.next() < 0.18 + density * 0.34) {
        this.piece(['car', this.rng.pick(['car_sedan', 'car_taxi', 'car_van']), 1]);
        this.piece(['flat', this.rng.range(300, 440)]);
      } else {
        this.piece(['flat', this.rng.range(140, 240)]);
      }
    }
  };

  // Authored fixed line: no RNG, no repeats, ends where the pieces end.
  World.prototype.buildLine = function (line) {
    for (var i = 0; i < line.pieces.length; i++) this.piece(line.pieces[i]);
    this.endX = this.gx;
  };

  World.prototype.prune = function (behindX) {
    var i;
    for (i = this.segs.n - 1; i >= 0; i--) if (this.segs.items[i].x1 < behindX) this.segs.freeAt(i);
    for (i = this.obs.n - 1; i >= 0; i--) if (this.obs.items[i].x + this.obs.items[i].w < behindX) this.obs.freeAt(i);
    for (i = this.cars.n - 1; i >= 0; i--) if (this.cars.items[i].x + this.cars.items[i].w < behindX) this.cars.freeAt(i);
    for (i = this.props.n - 1; i >= 0; i--) if (this.props.items[i].x < behindX) this.props.freeAt(i);
    for (i = this.crowd.n - 1; i >= 0; i--) if (this.crowd.items[i].x < behindX) this.crowd.freeAt(i);
    for (i = this.picks.n - 1; i >= 0; i--) if (this.picks.items[i].x < behindX) this.picks.freeAt(i);
    for (i = this.gaps.n - 1; i >= 0; i--) if (this.gaps.items[i].x1 < behindX - 400) this.gaps.freeAt(i);
    for (i = this.shorts.n - 1; i >= 0; i--) if (this.shorts.items[i].x1 < behindX) this.shorts.freeAt(i);
  };

  World.prototype.update = function (dt) {
    for (var i = 0; i < this.cars.n; i++) {
      var c = this.cars.items[i];
      if (c.vx) c.x += c.vx * dt;
      if (c.honk > 0) c.honk -= dt;
    }
    for (var j = 0; j < this.picks.n; j++) this.picks.items[j].bob += dt * 3.1;
  };

  function segY(s, x) {
    if (s.y0 === s.y1) return s.y0;
    var span = (s.x1 - s.x0) || 1;
    return s.y0 + (s.y1 - s.y0) * ((x - s.x0) / span);
  }
  S.segY = segY;

  // All rideable surfaces under a given world x. Fills the preallocated
  // scratch and returns the live count; allocates nothing.
  World.prototype.surfaces = function (x) {
    var n = 0, cap = this.surfBuf.length, i, s, rec;
    for (i = 0; i < this.segs.n && n < cap; i++) {
      s = this.segs.items[i];
      if (x >= s.x0 && x <= s.x1) {
        rec = this.surfBuf[n++];
        rec.y = segY(s, x); rec.seg = s;
      }
    }
    for (i = 0; i < this.cars.n && n < cap; i++) {
      var c = this.cars.items[i];
      if (x >= c.x + 8 && x <= c.x + c.w - 8) {
        var rs = this.roofSeg[i];
        rs.x0 = c.x; rs.x1 = c.x + c.w; rs.y0 = c.y; rs.y1 = c.y; rs.car = c;
        rec = this.surfBuf[n++];
        rec.y = c.y; rec.seg = rs;
      }
    }
    this.surfN = n;
    return n;
  };

  World.prototype.streetLevel = function (x) {
    var best = null;
    for (var i = 0; i < this.segs.n; i++) {
      var s = this.segs.items[i];
      if (s.k !== 'street' && s.k !== 'stair' && s.k !== 'ramp') continue;
      if (x < s.x0 || x > s.x1) continue;
      var y = segY(s, x);
      if (best === null || y > best) best = y;
    }
    return best === null ? this.baseY : best;
  };

  // ========================================================== the skater
  function Skater() {
    this.reset(0, 0);
  }
  S.Skater = Skater;

  Skater.prototype.reset = function (x, y) {
    this.x = x; this.y = y;
    this.vx = T.SPEED_BASE; this.vy = 0;
    this.state = 'roll';           // roll | air | grind | bail
    this.pose = 'roll';
    this.rot = 0;                  // board angle, radians
    this.spin = 0;                 // active angular velocity
    this.spinTarget = 0;           // remaining authored rotation
    this.charge = 0;               // ollie anticipation, 0..1
    this.charging = false;
    this.squash = 0;
    this.grindArm = 0;
    this.grindSeg = null;
    this.grindKind = 'fifty';
    this.grindTime = 0;
    this.bal = 0;
    this.balWarn = 0;
    this.airTime = 0;
    this.trick = null;
    this.trickAge = 0;
    this.trickPoints = 0;
    this.trickBonus = false;
    this.grindPoints = 0;
    this.lastLanding = '';
    this.coyote = 0;
    this.landPose = 0;
    this.scuffLock = 0;
    this.groundSeg = null;
  };

  // ---------------------------------------------------------- the combo
  function Combo() { this.reset(); }
  S.Combo = Combo;
  Combo.prototype.reset = function () {
    this.count = 0;
    this.pending = 0;
    this.mult = 1;
    this.decay = 0;
    this.decayMax = T.COMBO_DECAY;
    this.frozen = 0;
    this.label = '';
    this.labelAge = 99;
  };
  Combo.prototype.addTrick = function (name, points) {
    this.count++;
    this.pending += points;
    this.mult = Math.min(T.COMBO_MULT_MAX, 1 + this.count * T.COMBO_MULT_STEP);
    this.decay = this.decayMax;
    this.label = this.label ? (this.label + ' + ' + name) : name;
    this.labelAge = 0;
  };
  Combo.prototype.tick = function (dt) {
    this.labelAge += dt;
    if (this.frozen > 0) { this.frozen -= dt; return false; }
    if (this.count <= 0) return false;
    this.decay -= dt;
    if (this.decay <= 0) {
      // Visible decay: the multiplier steps DOWN rather than vanishing, so
      // the player can watch the stall cost them.
      this.count = Math.max(0, this.count - 1);
      this.mult = Math.max(1, 1 + this.count * T.COMBO_MULT_STEP);
      this.decay = this.decayMax * 0.7;
      if (this.count === 0) { this.pending = 0; this.label = ''; }
      return true;   // a step happened, so the HUD can flash
    }
    return false;
  };
  Combo.prototype.bank = function () {
    var v = Math.round(this.pending * this.mult);
    this.reset();
    return v;
  };
  Combo.prototype.wipe = function () { this.reset(); };

  // ============================================================== the run
  // One Run owns a world, a skater, a combo and the mode rules. game.js
  // drives it with step(dt, ctl) and reads it for rendering; the harness
  // drives it with the same call and no renderer at all.
  function Run(opts) {
    this.world = new World();
    this.skater = new Skater();
    this.combo = new Combo();
    // Preallocated event ring. The presenter drains it every frame with
    // drainEvents(); the sim never allocates an event record.
    this.eventCap = 32;
    this.events = new Array(this.eventCap);
    for (var ei = 0; ei < this.eventCap; ei++) {
      this.events[ei] = { type: '', a: 0, b: 0, c: 0 };
    }
    this.eventN = 0;
    this.eventsDropped = 0;
    this.reset(opts);
  }
  S.Run = Run;

  Run.prototype.emit = function (type, a, b, c) {
    if (this.eventN >= this.eventCap) { this.eventsDropped++; return; }
    var e = this.events[this.eventN++];
    e.type = type; e.a = a; e.b = b; e.c = c;
  };

  // The presenter calls this once per frame. Records stay owned by the ring.
  Run.prototype.drainEvents = function (fn, ctx) {
    for (var i = 0; i < this.eventN; i++) fn.call(ctx, this.events[i]);
    this.eventN = 0;
  };

  Run.prototype.reset = function (opts) {
    opts = opts || {};
    var districtKey = opts.district || 'downtown';
    this.districtKey = districtKey;
    this.district = CB.district(districtKey);
    this.modeKey = opts.mode || 'score';
    this.mode = CB.mode(this.modeKey);
    this.seed = opts.seed || 0x51ceb0;
    this.baseY = opts.baseY || 0;

    this.world.reset(this.district, this.seed, this.baseY);
    this.skater.reset(0, this.baseY - 1);
    this.combo.reset();
    this.eventN = 0;

    this.score = 0;
    this.startX = 0;
    this.metres = 0;
    this.best = 0;
    this.time = this.mode.timed || 0;
    this.elapsed = 0;
    this.over = false;
    this.result = '';
    this.gapsCleared = 0;
    this.gapNames = [];
    this.beatsHit = 0;
    this.beatsTotal = 0;
    this.saves = 0;
    this.boost = 0;
    this.comboFreeze = 0;
    this.prompt = null;
    this.promptTime = 0;
    this.bonusHits = 0;
    this.shortcutsFound = 0;
    this.landingTier = '';
    this.finished = false;
    this.finaleReached = false;

    if (this.modeKey === 'line') {
      var line = CB.line(districtKey);
      this.lineName = line.name;
      this.world.buildLine(line);
      this.beatsTotal = this.world.beats.n;
    } else {
      this.lineName = '';
      if (this.modeKey === 'gap') {
        this.world.sigEvery = 3;
        this.world.streetGaps = 0.85;
      }
      this.world.ensure(2600, 0);
    }
    // stand the skater on the street
    this.skater.y = this.world.streetLevel(0) - 1;
  };

  // -------------------------------------------------------------- input
  // ctl is a plain record owned by the caller: { press, held, release,
  // swipe (0 none, 1 left, 2 right, 3 up, 4 down), balAxis (-1..1) }.
  S.makeControl = function () {
    return { press: false, held: false, release: false, swipe: 0, balAxis: 0, tap: false };
  };

  Run.prototype.trickForSwipe = function (swipe) {
    var dir = swipe === 1 ? 'left' : swipe === 2 ? 'right' : swipe === 3 ? 'up' : 'down';
    var base = null, chained = null;
    for (var i = 0; i < CB.TRICKS.length; i++) {
      var t = CB.TRICKS[i];
      if (t.dir !== dir) continue;
      if (t.chain) { if (!chained) chained = t; }
      else if (!base) base = t;
    }
    // An active bonus call is a named contract. Resolve it before the normal
    // chain chooser so a prompt can never call one trick and pay another.
    if (this.prompt) {
      var called = CB.trick(this.prompt.trick);
      if (called && called.dir === dir) return called;
    }
    // Air budget drives which variant comes out. GENEROSITY RULE: a hop
    // with no room for a full rotation gives the player the no-spin grab
    // instead of a flip that is guaranteed to land mid-rotation. A short
    // pop should never be a hidden death sentence.
    var sk = this.skater;
    var airLeft = this.airBudget();
    if (chained && airLeft > chained.air * 1.15 && this.combo.count >= 1) return chained;
    if (base && airLeft >= base.air * 0.95) return base;
    return CB.trick('grab');
  };

  // Seconds of hang time left before the wheels reach the street below.
  Run.prototype.airBudget = function () {
    var sk = this.skater;
    var ground = this.world.streetLevel(sk.x + sk.vx * 0.25);
    var drop = Math.max(0, ground - sk.y);
    var v = sk.vy;
    // solve drop = v t + g t^2 / 2 for t
    var disc = v * v + 2 * T.GRAV * drop;
    if (disc < 0) return 0;
    return (-v + Math.sqrt(disc)) / T.GRAV;
  };

  Run.prototype.startTrick = function (t) {
    var sk = this.skater;
    if (!t || sk.trick) return;
    sk.trick = t;
    sk.trickAge = 0;
    sk.pose = t.pose;
    if (t.spin !== 0) {
      // Angular velocity comes from the table, never from a magic constant:
      // the arc takes exactly t.air seconds, which is the same number
      // trickForSwipe() checked the hang time against.
      sk.spinTarget = t.spin * TAU;
      sk.spin = sk.spinTarget / Math.max(0.08, t.air);
    } else {
      sk.spinTarget = 0;
      sk.spin = 0;
    }
    var pts = t.score;
    sk.trickBonus = !!(this.prompt && this.prompt.trick === t.key);
    sk.trickPoints = sk.trickBonus ? Math.round(pts * 2.5) : pts;
    // Starting a trick is a readable action, but it is not score. Score and
    // Line Run beat credit are committed by commitTrick on a valid landing or
    // grind exit.
    this.emit('trickstart', t.name, sk.trickPoints);
  };

  Run.prototype.commitTrick = function () {
    var sk = this.skater, t = sk.trick;
    if (!t) return false;
    var pts = sk.trickPoints || t.score;
    if (sk.trickBonus) {
      this.bonusHits++;
      this.emit('bonus', t.name, pts);
      this.prompt = null;
      this.promptTime = 0;
    }
    this.combo.addTrick(t.name, pts);
    this.emit('trick', t.name, pts);
    this.markBeat('trick');
    sk.trick = null;
    sk.trickAge = 0;
    sk.trickPoints = 0;
    sk.trickBonus = false;
    return true;
  };

  Run.prototype.markBeat = function (kind) {
    var w = this.world, sk = this.skater;
    for (var i = 0; i < w.beats.n; i++) {
      var b = w.beats.items[i];
      if (b.hit || b.kind !== kind) continue;
      if (sk.x >= b.x0 && sk.x <= b.x1) {
        b.hit = true;
        this.beatsHit++;
        this.score += 400;
        this.emit('beat', b.label, this.beatsHit, this.beatsTotal);
        return true;
      }
    }
    return false;
  };

  Run.prototype.bail = function (reason) {
    var sk = this.skater;
    if (sk.state === 'bail') return;
    if (this.saves > 0) {
      // Bail Save token: generous by design, and always announced.
      this.saves--;
      sk.state = 'roll';
      sk.rot = 0; sk.spin = 0; sk.spinTarget = 0; sk.trick = null;
      sk.trickPoints = 0; sk.trickBonus = false; sk.grindPoints = 0;
      sk.vy = 0;
      sk.vx = Math.max(T.SPEED_MIN, sk.vx * 0.72);
      sk.y = this.world.streetLevel(sk.x) - 1;
      sk.bal = 0; sk.grindSeg = null;
      this.emit('save', reason);
      return;
    }
    sk.state = 'bail';
    sk.pose = 'brace';
    sk.charging = false; sk.charge = 0; sk.squash = 0;
    sk.trick = null; sk.trickPoints = 0; sk.trickBonus = false;
    sk.grindPoints = 0; sk.grindSeg = null;
    this.combo.wipe();
    this.emit('bail', reason);
    this.finish('bail');
  };

  Run.prototype.finish = function (why) {
    if (this.over) return;
    this.over = true;
    this.result = why;
    this.emit('over', why);
  };

  Run.prototype.cancelCharge = function () {
    var sk = this.skater;
    sk.charging = false;
    sk.charge = 0;
    sk.squash = 0;
  };

  // ------------------------------------------------------------ stepping
  Run.prototype.step = function (dt, ctl) {
    if (this.over && this.skater.state !== 'bail') return;
    var sk = this.skater, w = this.world;

    this.elapsed += dt;
    if (this.mode.timed && !this.over) {
      this.time -= dt;
      if (this.time <= 0) { this.time = 0; this.finish('time'); }
    }

    if (sk.state === 'bail') { this.stepBail(dt); return; }

    // ------------------------------------------------------ timers
    if (this.boost > 0) this.boost -= dt;
    if (this.comboFreeze > 0) { this.comboFreeze -= dt; this.combo.frozen = 0.02; }
    if (this.prompt) {
      this.promptTime -= dt;
      if (this.promptTime <= 0) { this.emit('promptend', this.prompt.trick); this.prompt = null; }
    }
    if (this.combo.tick(dt)) this.emit('decay', this.combo.mult);

    // ------------------------------------------------------ ollie charge
    if (ctl.held && (sk.state === 'roll' || sk.state === 'grind')) {
      sk.charging = true;
      sk.charge = Math.min(1, sk.charge + dt / T.CHARGE_TIME);
    } else if (sk.charging) {
      sk.charging = false;
      this.pop(sk.charge);
      sk.charge = 0;
    }
    // The squash is the anticipation: the body compresses before the pop.
    var wantSquash = sk.charging ? sk.charge * T.SQUASH_MAX : 0;
    sk.squash += (wantSquash - sk.squash) * Math.min(1, dt * 18);

    if (sk.state === 'roll') this.stepRoll(dt, ctl);
    else if (sk.state === 'air') this.stepAir(dt, ctl);
    else if (sk.state === 'grind') this.stepGrind(dt, ctl);

    // ------------------------------------------------------ world upkeep
    w.update(dt);
    this.metres = Math.max(this.metres, (sk.x - this.startX) / T.PPM);
    if (this.modeKey !== 'line') w.ensure(sk.x + 2600, this.metres);
    w.prune(sk.x - 900);
    this.collectPickups();
    this.checkGaps();
    this.checkShortcuts();
    this.checkCollisions();

    if (this.modeKey === 'line' && sk.x >= w.endX - 120 && !this.over) {
      this.finish('line');
    }
  };

  Run.prototype.pop = function (charge) {
    var sk = this.skater;
    if (sk.state === 'grind') {
      this.leaveGrind(true);
      sk.vy = -(T.GRIND_POP + charge * 200);
      sk.state = 'air';
      sk.pose = 'air';
      sk.airTime = 0;
      this.emit('pop', charge, true);
      return;
    }
    if (sk.state !== 'roll') return;
    if (sk.coyote <= 0) return;
    sk.vy = -(T.POP_MIN + charge * T.POP_RANGE);
    sk.state = 'air';
    sk.pose = 'pop';
    sk.airTime = 0;
    sk.coyote = 0;
    sk.rot = 0; sk.spin = 0; sk.spinTarget = 0;
    this.emit('pop', charge, false);
  };

  Run.prototype.targetSpeed = function () {
    var base = T.SPEED_BASE + (this.metres / 100) * T.SPEED_RAMP;
    if (this.boost > 0) base += T.BOOST_SPEED;
    return clamp(base, T.SPEED_MIN, T.SPEED_MAX);
  };

  Run.prototype.stepRoll = function (dt, ctl) {
    var sk = this.skater, w = this.world;
    var tgt = this.targetSpeed();
    sk.vx += (tgt - sk.vx) * Math.min(1, dt * (sk.vx < tgt ? 1.6 : T.DRAG_GROUND * 0.4));
    sk.x += sk.vx * dt;

    var nSurf = w.surfaces(sk.x);
    var bestY = null, bestSeg = null;
    for (var i = 0; i < nSurf; i++) {
      var s = w.surfBuf[i];
      // stay with the surface band we are already riding
      if (s.y >= sk.y - 6 && s.y <= sk.y + T.STEP_SNAP) {
        if (bestY === null || s.y < bestY) { bestY = s.y; bestSeg = s.seg; }
      }
    }
    if (bestY === null) {
      sk.state = 'air';
      sk.pose = 'air';
      sk.airTime = 0;
      sk.coyote = 0.09;   // a hair of coyote time so curbs feel forgiving
      return;
    }
    if (bestY - sk.y > 3) {
      // riding down a step or a stair tread: a touch of speed and dust
      this.emit('scuff', sk.x, bestY);
    }
    sk.y = bestY;
    sk.groundSeg = bestSeg;
    sk.coyote = 0.09;
    sk.rot += (0 - sk.rot) * Math.min(1, dt * 14);
    if (sk.landPose > 0) sk.landPose -= dt;
    if (!sk.charging) {
      sk.pose = sk.landPose > 0 ? 'brace' : (this.boost > 0 ? 'tuck' : 'roll');
    } else {
      sk.pose = 'crouch';
    }
    // rolling on a car roof is a stunt in its own right
    if (bestSeg && bestSeg.k === 'roof' && this.combo.decay < this.combo.decayMax * 0.9) {
      this.combo.decay = this.combo.decayMax;
    }
  };

  Run.prototype.stepAir = function (dt, ctl) {
    var sk = this.skater, w = this.world;
    var prevY = sk.y;
    sk.airTime += dt;
    if (sk.coyote > 0) sk.coyote -= dt;
    sk.vy += T.GRAV * dt;
    sk.x += sk.vx * dt;
    sk.y += sk.vy * dt;

    // --------------------------------------------- trick input and spin
    if (ctl.swipe === 3) sk.grindArm = T.GRIND_ARM_TIME;
    if (ctl.swipe && sk.airTime > 0.04 && !sk.trick) {
      var t = this.trickForSwipe(ctl.swipe);
      if (t) this.startTrick(t);
    }
    if (sk.grindArm > 0) sk.grindArm -= dt;
    if (sk.trick) sk.trickAge += dt;
    if (sk.spinTarget !== 0) {
      // THE CATCH: if touchdown is arriving early (the street rose, or a
      // roof got in the way) the rider can hurry the rotation by up to
      // CATCH_MAX. Beyond that the trick genuinely does not fit and the
      // landing judge is entitled to call it sketchy or a bail. This is the
      // affordance that keeps unfair rotation deaths out without deleting
      // the skill of picking a trick that fits the gap.
      var need = Math.abs(sk.spinTarget) / Math.abs(sk.spin || 1);
      var left = this.airBudget();
      if (left > 0.001 && need > left) {
        var boost = Math.min(T.CATCH_MAX, need / left);
        sk.spin *= boost;
      }
      var d = sk.spin * dt;
      if (Math.abs(d) >= Math.abs(sk.spinTarget)) { d = sk.spinTarget; sk.spin = 0; sk.spinTarget = 0; }
      else sk.spinTarget -= d;
      sk.rot += d;
    } else {
      // level the board out so a completed trick reads as landed clean
      sk.rot -= angNorm(sk.rot) * Math.min(1, dt * 6.5);
    }

    // ------------------------------------------------- grind lock-on
    if (sk.vy > -60 && sk.grindArm > 0 && sk.spinTarget === 0) {
      var lock = this.findGrind(sk.x, prevY, sk.y);
      if (lock) { this.enterGrind(lock); return; }
    }

    // ------------------------------------------------------ touchdown
    var nSurf = w.surfaces(sk.x);
    var landY = null, landSeg = null;
    for (var i = 0; i < nSurf; i++) {
      var s = w.surfBuf[i];
      if (s.y >= prevY - 2 && s.y <= sk.y + 2 && sk.vy > 0) {
        if (landY === null || s.y < landY) { landY = s.y; landSeg = s.seg; }
      }
    }
    if (landY !== null) { this.land(landY, landSeg); return; }

    if (sk.y > w.streetLevel(sk.x) + T.KILL_DROP) this.bail('gap');
  };

  Run.prototype.findGrind = function (x, prevY, y) {
    var w = this.world, hit = w.grindHit, found = false;
    for (var i = 0; i < w.segs.n; i++) {
      var s = w.segs.items[i];
      if (s.k !== 'rail' && s.k !== 'ledge' && s.k !== 'deck') continue;
      if (x < s.x0 || x > s.x1) continue;
      var sy = segY(s, x);
      if (sy >= prevY - T.GRIND_SNAP && sy <= y + T.GRIND_SNAP) {
        if (!found || sy < hit.y) { hit.y = sy; hit.seg = s; found = true; }
      }
    }
    return found ? hit : null;
  };

  Run.prototype.enterGrind = function (lock) {
    var sk = this.skater;
    sk.state = 'grind';
    sk.pose = 'grind';
    sk.y = lock.y;
    sk.vy = 0;
    sk.grindSeg = lock.seg;
    sk.grindTime = 0;
    sk.grindPoints = 0;
    sk.bal = 0;
    sk.balWarn = 0;
    sk.grindArm = 0;
    sk.rot = 0; sk.spin = 0; sk.spinTarget = 0;
    // Harder board angles on entry score more; a straight drop is a 50-50.
    var pick = 'fifty';
    var a = Math.abs(angNorm(sk.rot));
    if (this.combo.count >= 3) pick = 'bluntsl';
    else if (this.combo.count === 2) pick = 'crook';
    else if (this.combo.count === 1) pick = 'boardsl';
    var g = CB.grind(pick);
    sk.grindKind = g.key;
    this.emit('grindstart', g.name, lock.seg.name || '');
  };

  Run.prototype.stepGrind = function (dt, ctl) {
    var sk = this.skater, w = this.world;
    var seg = sk.grindSeg;
    if (!seg) { sk.state = 'air'; return; }
    var g = CB.grind(sk.grindKind);

    sk.vx += (this.targetSpeed() * 0.96 - sk.vx) * Math.min(1, dt * 2.2);
    sk.x += sk.vx * dt;
    sk.grindTime += dt;

    if (sk.x > seg.x1 || sk.x < seg.x0) { this.leaveGrind(false); return; }
    sk.y = segY(seg, sk.x);

    // ---- balance as an active skill -------------------------------
    // Wobble grows with time on the rail, board speed and the trick's own
    // drift. The only counter is a live micro-drag in the other direction.
    var pressure = T.BAL_WOBBLE * g.drift * (0.55 + sk.grindTime * 0.42)
                 * (1 + sk.vx * T.BAL_SPEEDK);
    var push = Math.sin(sk.grindTime * 5.7 + seg.x0 * 0.013) * 0.62
             + Math.sin(sk.grindTime * 2.3 + seg.x0 * 0.007) * 0.38;
    sk.bal += push * pressure * dt;
    sk.bal -= ctl.balAxis * T.BAL_CORRECT * dt;
    sk.bal = clamp(sk.bal, -1.35, 1.35);

    var mag = Math.abs(sk.bal);
    if (mag > T.BAL_WARN) {
      sk.balWarn += dt;
      if (sk.balWarn > 0.22) { sk.balWarn = 0; this.emit('wobble', sk.bal); }
    } else sk.balWarn = 0;
    if (mag >= 1) { this.bail('balance'); return; }

    // Held grinds accumulate potential points. They are not combo score until
    // the rider exits the rail successfully.
    if (sk.grindTime > 0.35) {
      var tickPts = Math.round(g.score * 0.35 * dt * 10);
      if (tickPts > 0) {
        sk.grindPoints += tickPts;
      }
    }
    sk.rot = sk.bal * 0.22;
    this.emit('grindtick', sk.x, sk.y);
  };

  Run.prototype.leaveGrind = function (popped) {
    var sk = this.skater;
    var g = CB.grind(sk.grindKind);
    var valid = sk.grindTime >= 0.18;
    if (valid) {
      this.commitTrick();
      var points = Math.max(0, Math.round(sk.grindPoints));
      if (points > 0) {
        this.combo.addTrick(g.name, points);
        this.emit('grindcomplete', g.name, points);
      }
      this.markBeat('grind');
    }
    sk.grindSeg = null;
    sk.bal = 0;
    sk.grindPoints = 0;
    if (!popped) {
      sk.state = 'air';
      sk.pose = 'air';
      sk.vy = -90;
      sk.airTime = 0;
    }
    this.emit('grindend', popped);
  };

  // -------------------------------------------------- landing judgement
  Run.prototype.land = function (y, seg) {
    var sk = this.skater;
    sk.y = y;
    sk.groundSeg = seg;
    var ang = Math.abs(angNorm(sk.rot));
    var trickIncomplete = !!(sk.trick && sk.trickAge < sk.trick.air * 0.78);
    var incomplete = Math.abs(sk.spinTarget) > 0.35 || trickIncomplete;
    var tier;
    if (!incomplete && ang < T.CLEAN_ANG) tier = 'clean';
    else if (ang < T.SKETCHY_ANG) tier = 'sketchy';
    else tier = 'bail';

    if (tier === 'bail') { this.bail('rotation'); return; }

    sk.state = 'roll';
    sk.pose = 'brace';
    sk.vy = 0;
    sk.rot = 0; sk.spin = 0; sk.spinTarget = 0;
    sk.coyote = 0.09;
    sk.landPose = 0.20;
    sk.lastLanding = tier;
    this.landingTier = tier;

    if (tier === 'clean') {
      sk.vx = Math.min(T.SPEED_MAX, sk.vx + T.CLEAN_GAIN);
      this.commitTrick();
      this.emit('land', 'clean');
      var banked = this.combo.count > 0 ? this.combo.bank() : 0;
      if (banked > 0) {
        this.score += banked;
        this.emit('bank', banked, 'CLEAN');
      }
    } else {
      sk.vx = Math.max(T.SPEED_MIN, sk.vx - T.SKETCHY_LOSS);
      // Sketchy keeps the combo alive but banks nothing and costs the decay.
      this.combo.decay = Math.min(this.combo.decay, this.combo.decayMax * 0.4);
      this.commitTrick();
      this.emit('land', 'sketchy');
    }
  };

  Run.prototype.stepBail = function (dt) {
    var sk = this.skater;
    sk.vx *= (1 - Math.min(1, dt * 2.4));
    sk.vy += T.GRAV * 0.7 * dt;
    sk.x += sk.vx * dt;
    sk.y += sk.vy * dt;
    var floor = this.world.streetLevel(sk.x);
    if (sk.y > floor) { sk.y = floor; sk.vy *= -0.24; sk.vx *= 0.7; }
    this.world.update(dt);
  };

  // --------------------------------------------------------- interactions
  Run.prototype.collectPickups = function () {
    var sk = this.skater, w = this.world;
    for (var i = 0; i < w.picks.n; i++) {
      var p = w.picks.items[i];
      if (p.taken) continue;
      if (Math.abs(p.x - sk.x) > 40) continue;
      // Generous vertical grab window: anywhere from the wheels to well
      // over the rider's head counts as a pickup.
      if (p.y > sk.y + 26 || p.y < sk.y - 128) continue;
      p.taken = true;
      this.applyPickup(p.kind, p);
    }
  };

  Run.prototype.applyPickup = function (kind, rec) {
    var def = CB.pickup(kind);
    if (kind === 'combo') {
      this.comboFreeze = def.hold;
      this.combo.decay = this.combo.decayMax;
      if (this.combo.count === 0) this.combo.addTrick('STREET FLOW', 60);
    } else if (kind === 'boost') {
      this.boost = def.hold;
      this.skater.vx = Math.min(T.SPEED_MAX, this.skater.vx + 120);
    } else if (kind === 'bonus') {
      var t = CB.TRICKS[Math.floor(this.world.rng.next() * 4) % 4];
      this.prompt = { trick: t.key, name: t.name, dir: t.dir };
      this.promptTime = T.PROMPT_TIME;
      this.emit('prompt', t.name, t.dir);
    } else if (kind === 'save') {
      this.saves = Math.min(3, this.saves + 1);
    }
    this.score += 50;
    this.emit('pickup', kind, def.name, rec ? rec.x : 0);
  };

  Run.prototype.checkGaps = function () {
    var sk = this.skater, w = this.world;
    for (var i = 0; i < w.gaps.n; i++) {
      var g = w.gaps.items[i];
      if (g.cleared || !g.name) continue;
      if (sk.x < g.x1) continue;
      // cleared only if the wheels were never down inside the gap
      if (sk.state === 'bail') continue;
      g.cleared = true;
      this.gapsCleared++;
      if (this.gapNames.length < 32) this.gapNames.push(g.name);
      this.score += g.points;
      this.combo.decay = this.combo.decayMax;
      this.emit('gap', g.name, g.points);
      this.markBeat('gap');
    }
  };

  Run.prototype.checkShortcuts = function () {
    var sk = this.skater, w = this.world;
    for (var i = 0; i < w.shorts.n; i++) {
      var s = w.shorts.items[i];
      if (s.found) continue;
      if (sk.x < s.x0 || sk.x > s.x1) continue;
      if (sk.y > s.y + 30) continue;
      s.found = true;
      this.shortcutsFound++;
      this.score += 750;
      this.emit('shortcut', s.name, 750);
    }
  };

  Run.prototype.checkCollisions = function () {
    var sk = this.skater, w = this.world, i;
    var bx = sk.x - 13, by = sk.y - 40, bw = 26, bh = 40;
    if (sk.scuffLock > 0) sk.scuffLock -= T.STEP;
    for (i = 0; i < w.obs.n; i++) {
      var o = w.obs.items[i];
      if (!o.solid) continue;
      if (bx + bw < o.x || bx > o.x + o.w) continue;
      if (by + bh < o.y || by > o.y + o.h) continue;
      // A ledge or kerb FACE is terrain, not an obstacle. Clipping one costs
      // you your speed and your combo, but it never ends the run at any
      // height - only the solid street furniture and traffic do that. The
      // first build bailed on a forty pixel marble face, which made the
      // opening seconds of a district feel like a trap.
      if (o.kind === 'face' || o.h <= SCUFF_H) { this.scuff(o); return; }
      this.bail(o.kind);
      return;
    }
    for (i = 0; i < w.cars.n; i++) {
      var c = w.cars.items[i];
      if (bx + bw < c.x + 6 || bx > c.x + c.w - 6) continue;
      if (by + bh < c.y || by > c.y + c.h) continue;
      if (sk.y <= c.y + 6) continue;   // landed on the roof, that is allowed
      if (c.honk <= 0) { c.honk = 1.2; this.emit('honk', c.x); }
      this.bail('traffic');
      return;
    }
  };

  // A clipped kerb: expensive, but never the end of the run.
  Run.prototype.scuff = function (o) {
    var sk = this.skater;
    if (sk.scuffLock > 0) return;
    sk.scuffLock = 0.40;
    sk.vx = Math.max(T.SPEED_MIN, sk.vx * 0.52);
    sk.x = o.x - 15;
    if (sk.state === 'air') { sk.vy = Math.max(sk.vy, 40); }
    this.combo.decay = Math.min(this.combo.decay, 0.35);
    this.emit('scuffhit', o.kind, sk.x, sk.y);
  };

  // ------------------------------------------------------------- scoring
  Run.prototype.finalScore = function () {
    var s = this.score;
    if (this.combo.count > 0) s += Math.round(this.combo.pending * this.combo.mult * 0.5);
    return s;
  };

  Run.prototype.medalValue = function () {
    if (this.modeKey === 'gap') return this.gapsCleared;
    if (this.modeKey === 'line') return this.beatsHit;
    return this.finalScore();
  };

  Run.prototype.medalIndex = function () {
    var chal = CB.challenge(this.districtKey + ':' + this.modeKey);
    var v = this.medalValue();
    var idx = -1;
    for (var i = 0; i < chal.tiers.length; i++) if (v >= chal.tiers[i]) idx = i;
    return idx;
  };

  root.CB_SIM = S;
  if (typeof module !== 'undefined' && module.exports) module.exports = S;
})(typeof window !== 'undefined' ? window : globalThis);
