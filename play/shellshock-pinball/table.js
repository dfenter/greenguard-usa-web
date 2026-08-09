/* Shellshock Pinball - table: static shell + seeded parts grammar */
(function (SS) {
  'use strict';

  var W = SS.W = 430, H = SS.H = 730;
  var D2R = Math.PI / 180;

  function buildShell(T) {
    var S = T.segs;
    // outer top arc
    SS.chain(S, SS.arcPts(216, 150, 206, 132, Math.PI, Math.PI * 2, 26), { rest: 0.36 });
    // left wall / right outer wall
    SS.seg(S, 10, 150, 10, 530, { rest: 0.36 });
    SS.seg(S, 422, 150, 422, 730, { rest: 0.36 });
    // plunger lane divider (straight + curl over the top)
    SS.seg(S, 380, 730, 380, 180, { rest: 0.3 });
    var curl = SS.arcPts(216, 180, 164, 116, 0, -140 * D2R, 22);
    SS.chain(S, curl, { rest: 0.3 });
    T.curl = curl;
    // one-way exit gate at the end of the curl
    var g = SS.seg(S, 90, 105, 74, 140, { rest: 0.2, r: 3 });
    g.oneWay = { x: -0.909, y: -0.416 };
    g.kind = 'gate';
    T.gate = g;
    // plunger floor
    SS.seg(S, 380, 724, 422, 724, { rest: 0.05, kind: 'plungerfloor' });
    // lower funnels
    T.funL = [[10, 530], [13, 600], [46, 672], [60, 712]];
    T.funR = [[380, 530], [377, 600], [344, 672], [330, 712]];
    SS.chain(S, T.funL, { rest: 0.3 });
    SS.chain(S, T.funR, { rest: 0.3 });
    // inlane / outlane dividers (closed quads)
    T.divL = [[48, 580], [136, 644], [130, 656], [42, 590]];
    T.divR = [[342, 580], [254, 644], [260, 656], [348, 590]];
    [T.divL, T.divR].forEach(function (q) {
      SS.chain(S, q.concat([q[0]]), { rest: 0.25, r: 3 });
    });
    // outlane inner guides + under-flipper closers
    T.outL = [[46, 592], [96, 712]];
    T.outR = [[344, 592], [294, 712]];
    SS.chain(S, T.outL, { rest: 0.28, r: 3 });
    SS.chain(S, T.outR, { rest: 0.28, r: 3 });
    // slingshots
    T.slings = [
      { p: [[96, 524], [162, 590], [96, 590]], flash: 0 },
      { p: [[294, 524], [228, 590], [294, 590]], flash: 0 }
    ];
    T.slings.forEach(function (sl) {
      var a = sl.p[0], b = sl.p[1], c = sl.p[2];
      var f = SS.seg(S, a[0], a[1], b[0], b[1], { rest: 0.5, r: 4, kick: 640, kind: 'sling' });
      f.ref = sl;
      SS.seg(S, b[0], b[1], c[0], c[1], { rest: 0.3, r: 3, kind: 'slingedge' });
      SS.seg(S, c[0], c[1], a[0], a[1], { rest: 0.3, r: 3, kind: 'slingedge' });
    });
    // flippers
    T.flipL = { x: 132, y: 652, len: 56, r: 7.5, rest: 30 * D2R, up: -32 * D2R, angle: 30 * D2R, omega: 0, side: -1, on: false };
    T.flipR = { x: 258, y: 652, len: 56, r: 7.5, rest: 150 * D2R, up: 212 * D2R, angle: 150 * D2R, omega: 0, side: 1, on: false };
    // kickback (left outlane)
    T.kick = { x: 54, y: 660, r: 15, charged: true, flash: 0 };
    // ball entry point of the curl
    T.entry = [90, 105];
  }

  /* ---------- parts ---------- */
  function addPops(T, ax, ay, n, rnd) {
    var base = rnd() * SS.TAU;
    for (var i = 0; i < n; i++) {
      var a = base + i * SS.TAU / n;
      var rr = 30 + rnd() * 12;
      var p = {
        x: ax + Math.cos(a) * rr, y: ay + Math.sin(a) * rr * 0.85,
        r: 17, rest: 0.35, kick: 700, kind: 'pop', flash: 0, hits: 0
      };
      T.circles.push(p); T.pops.push(p);
    }
  }

  function addBank(T, ax, ay, ang, n, rnd) {
    var dx = Math.cos(ang), dy = Math.sin(ang);
    var bank = { x: ax, y: ay, ang: ang, targets: [], flash: 0, done: false, resetAt: 0 };
    for (var i = 0; i < n; i++) {
      var o = (i - (n - 1) / 2) * 21;
      var cx = ax + dx * o, cy = ay + dy * o;
      var t = { cx: cx, cy: cy, down: false, flash: 0, bank: bank };
      var s = SS.seg(T.segs, cx - dx * 8, cy - dy * 8, cx + dx * 8, cy + dy * 8,
        { rest: 0.45, r: 4.5, kind: 'target' });
      s.target = t; t.seg = s;
      bank.targets.push(t);
    }
    T.banks.push(bank);
    return bank;
  }

  function addSpinner(T, ax, ay, ang) {
    var sp = { x: ax, y: ay, ang: ang, rot: 0, vel: 0, r: 17, spins: 0, flash: 0 };
    var dx = Math.cos(ang), dy = Math.sin(ang); // lane direction
    var nx = -dy, ny = dx;
    // chute guides either side of the lane
    SS.seg(T.segs, ax + nx * 26 - dx * 40, ay + ny * 26 - dy * 40, ax + nx * 26 + dx * 40, ay + ny * 26 + dy * 40, { rest: 0.3, r: 3.5 });
    SS.seg(T.segs, ax - nx * 26 - dx * 40, ay - ny * 26 - dy * 40, ax - nx * 26 + dx * 40, ay - ny * 26 + dy * 40, { rest: 0.3, r: 3.5 });
    T.spinner = sp;
  }

  function addHole(T, ax, ay) {
    T.hole = { x: ax, y: ay, r: 14, lit: false, flash: 0, hold: 0, ejectAng: 0 };
    // horseshoe rim so the saucer reads as a target
    var pts = SS.arcPts(ax, ay, 24, 24, 152 * D2R, 388 * D2R, 12);
    SS.chain(T.segs, pts, { rest: 0.4, r: 3 });
  }

  function addRamp(T, rampX, rnd) {
    var exitRight = rampX <= 195;
    var s = exitRight ? 1 : -1;
    var ey = 340;
    // funnel guides into the ramp mouth
    SS.seg(T.segs, rampX - 48, ey + 82, rampX - 23, ey + 2, { rest: 0.35, r: 3.5 });
    SS.seg(T.segs, rampX + 48, ey + 82, rampX + 23, ey + 2, { rest: 0.35, r: 3.5 });
    var ctrl;
    if (exitRight) {
      ctrl = [[rampX, ey], [rampX + 22, 264], [rampX + 76, 194], [296, 134], [356, 246], [364, 402], [348, 512], [316, 574]];
    } else {
      ctrl = [[rampX, ey], [rampX - 22, 264], [rampX - 76, 194], [94, 134], [34, 246], [26, 402], [42, 512], [74, 574]];
    }
    var path = SS.smooth(ctrl, 7);
    var len = 0, cum = [0];
    for (var i = 1; i < path.length; i++) {
      len += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
      cum.push(len);
    }
    T.ramp = {
      x: rampX, y: ey, path: path, cum: cum, len: len, exitRight: exitRight,
      flash: 0, mouth: { x1: rampX - 23, y1: ey, x2: rampX + 23, y2: ey }
    };
  }

  /* ---------- generator ---------- */
  SS.genTable = function (seed) {
    var rnd = SS.rng(seed);
    var T = {
      seed: seed, segs: [], circles: [], pops: [], banks: [], posts: [],
      ramp: null, spinner: null, hole: null
    };
    buildShell(T);

    var rampX = [115, 195, 275][Math.floor(rnd() * 3) % 3];
    addRamp(T, rampX, rnd);

    var used = [{ x: rampX, y: 388, r: 76 }, { x: 90, y: 112, r: 46 }];
    function free(a, r) {
      if (a[0] < 44 || a[0] > 346 || a[1] < 118 || a[1] > 486) return false;
      for (var i = 0; i < used.length; i++) {
        if (Math.hypot(a[0] - used[i].x, a[1] - used[i].y) < r + used[i].r) return false;
      }
      return true;
    }
    function shuffle(arr) {
      var a = arr.slice();
      for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(rnd() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t;
      }
      return a;
    }
    var upper = shuffle([[100, 178], [195, 148], [292, 178]]);
    var mid = shuffle([[78, 316], [312, 316], [195, 288]]);
    var low = shuffle([[108, 440], [282, 440], [195, 462]]);
    var pool = upper.concat(mid).concat(low);
    function take(list, r) {
      for (var i = 0; i < list.length; i++) {
        if (free(list[i], r)) { var a = list.splice(i, 1)[0]; used.push({ x: a[0], y: a[1], r: r }); return a; }
      }
      for (var j = 0; j < pool.length; j++) {
        if (free(pool[j], r)) {
          var b = pool[j];
          var k = list.indexOf(b); if (k >= 0) list.splice(k, 1);
          pool.splice(j, 1);
          used.push({ x: b[0], y: b[1], r: r }); return b;
        }
      }
      return null;
    }
    function sync(a) { var i = pool.indexOf(a); if (i >= 0) pool.splice(i, 1); }

    // pop bumper cluster
    var pa = take(upper, 58); if (pa) { sync(pa); addPops(T, pa[0], pa[1], 3 + Math.floor(rnd() * 2), rnd); }
    // primary drop bank
    var ba = take(upper.concat(mid).slice(0), 52);
    if (ba) {
      sync(ba); removeFrom(upper, ba); removeFrom(mid, ba);
      addBank(T, ba[0], ba[1], (rnd() < 0.5 ? 1 : -1) * (20 + rnd() * 45) * D2R, 3 + Math.floor(rnd() * 3), rnd);
    }
    // spinner lane
    var sa = take(mid, 46);
    if (sa) { sync(sa); addSpinner(T, sa[0], sa[1], (75 + rnd() * 30) * D2R); }
    // second drop bank
    var b2 = take(low, 50);
    if (b2) { sync(b2); addBank(T, b2[0], b2[1], (rnd() < 0.5 ? 1 : -1) * (15 + rnd() * 40) * D2R, 3 + Math.floor(rnd() * 2), rnd); }
    // mode hole
    var ha = take(mid.concat(low).concat(upper), 40);
    if (!ha) ha = [195, 230];
    else { sync(ha); removeFrom(upper, ha); removeFrom(mid, ha); removeFrom(low, ha); }
    addHole(T, ha[0], ha[1]);
    T.hole.ejectAng = (rnd() < 0.5 ? -125 : -55) * D2R;

    // scattered rubber posts
    var np = 4 + Math.floor(rnd() * 4);
    for (var i = 0, guard = 0; i < np && guard < 200; guard++) {
      var px = 50 + rnd() * 296, py = 150 + rnd() * 330;
      if (!free([px, py], 22)) continue;
      used.push({ x: px, y: py, r: 20 });
      var post = { x: px, y: py, r: 6.5, rest: 0.62, kind: 'post', flash: 0 };
      T.circles.push(post); T.posts.push(post);
      i++;
    }

    function removeFrom(list, a) { var i = list.indexOf(a); if (i >= 0) list.splice(i, 1); }

    T.name = tableName(seed);
    return T;
  };

  var ADJ = ['CRIMSON', 'HOLLOW', 'IRON', 'VOLT', 'GLASS', 'NEON', 'ASH', 'DEEP', 'STORM', 'COBALT', 'RUST', 'PRISM'];
  var NOUN = ['CARAPACE', 'REEF', 'FORGE', 'SPIRE', 'BASIN', 'CIRCUIT', 'MOLT', 'HARBOR', 'VAULT', 'DRIFT', 'SHELL', 'CRATER'];
  function tableName(seed) {
    var r = SS.rng(seed ^ 0x9e37);
    return ADJ[Math.floor(r() * ADJ.length)] + ' ' + NOUN[Math.floor(r() * NOUN.length)];
  }
})(SS);
