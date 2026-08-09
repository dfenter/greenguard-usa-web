/* Shellshock Pinball - engine: rng, geometry, collision, particles, audio */
var SS = (function () {
  'use strict';

  /* ---------- deterministic rng ---------- */
  function rng(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }
  function hashSeed(str) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }

  /* ---------- small math ---------- */
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var TAU = Math.PI * 2;

  function closestOnSeg(px, py, x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy, t = 0;
    if (l2 > 1e-9) t = ((px - x1) * dx + (py - y1) * dy) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return { x: x1 + t * dx, y: y1 + t * dy, t: t };
  }

  /* ellipse arc -> polyline points */
  function arcPts(cx, cy, rx, ry, a0, a1, n) {
    var out = [];
    for (var i = 0; i <= n; i++) {
      var a = lerp(a0, a1, i / n);
      out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
    }
    return out;
  }

  /* catmull-rom through points -> dense polyline */
  function smooth(pts, per) {
    per = per || 8;
    var p = [pts[0]].concat(pts, [pts[pts.length - 1]]), out = [];
    for (var i = 1; i < p.length - 2; i++) {
      for (var j = 0; j < per; j++) {
        var t = j / per, t2 = t * t, t3 = t2 * t;
        var x = 0.5 * ((2 * p[i][0]) + (-p[i - 1][0] + p[i + 1][0]) * t +
          (2 * p[i - 1][0] - 5 * p[i][0] + 4 * p[i + 1][0] - p[i + 2][0]) * t2 +
          (-p[i - 1][0] + 3 * p[i][0] - 3 * p[i + 1][0] + p[i + 2][0]) * t3);
        var y = 0.5 * ((2 * p[i][1]) + (-p[i - 1][1] + p[i + 1][1]) * t +
          (2 * p[i - 1][1] - 5 * p[i][1] + 4 * p[i + 1][1] - p[i + 2][1]) * t2 +
          (-p[i - 1][1] + 3 * p[i][1] - 3 * p[i + 1][1] + p[i + 2][1]) * t3);
        out.push([x, y]);
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  /* ---------- static geometry builders ---------- */
  function seg(list, x1, y1, x2, y2, opt) {
    var s = { x1: x1, y1: y1, x2: x2, y2: y2, r: 4, rest: 0.32, kind: 'wall' };
    if (opt) for (var k in opt) s[k] = opt[k];
    list.push(s);
    return s;
  }
  function chain(list, pts, opt) {
    for (var i = 0; i < pts.length - 1; i++)
      seg(list, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], opt);
  }

  /* ---------- collision ---------- */
  // returns null or {nx,ny,speed,obj}
  function hitSeg(b, s) {
    if (s.down) return null;
    var c = closestOnSeg(b.x, b.y, s.x1, s.y1, s.x2, s.y2);
    var nx = b.x - c.x, ny = b.y - c.y;
    var d = Math.sqrt(nx * nx + ny * ny);
    var R = b.r + (s.r || 0);
    if (d >= R) return null;
    if (d < 1e-6) { nx = 0; ny = -1; d = 1e-6; } else { nx /= d; ny /= d; }
    if (s.oneWay && (b.vx * s.oneWay.x + b.vy * s.oneWay.y) > 0) return null;
    b.x += nx * (R - d + 0.05);
    b.y += ny * (R - d + 0.05);
    var vn = b.vx * nx + b.vy * ny;
    if (vn > 0) return null;
    var e = s.rest;
    if (e === undefined) e = 0.32;
    var impact = -vn;
    b.vx -= (1 + e) * vn * nx;
    b.vy -= (1 + e) * vn * ny;
    // tangential friction
    var tx = -ny, ty = nx;
    var vt = b.vx * tx + b.vy * ty;
    var f = s.fric === undefined ? 0.02 : s.fric;
    b.vx -= vt * f * tx; b.vy -= vt * f * ty;
    if (s.kick) {
      var k = s.kick;
      b.vx = nx * k + tx * (vt * 0.25);
      b.vy = ny * k + ty * (vt * 0.25);
    }
    return { nx: nx, ny: ny, speed: impact, obj: s };
  }

  function hitCircle(b, c) {
    if (c.down) return null;
    var nx = b.x - c.x, ny = b.y - c.y;
    var d = Math.sqrt(nx * nx + ny * ny);
    var R = b.r + c.r;
    if (d >= R) return null;
    if (d < 1e-6) { nx = 0; ny = -1; d = 1e-6; } else { nx /= d; ny /= d; }
    b.x += nx * (R - d + 0.05);
    b.y += ny * (R - d + 0.05);
    var vn = b.vx * nx + b.vy * ny;
    if (vn > 0) return null;
    var impact = -vn;
    var e = c.rest === undefined ? 0.45 : c.rest;
    b.vx -= (1 + e) * vn * nx;
    b.vy -= (1 + e) * vn * ny;
    if (c.kick) {
      b.vx = nx * c.kick + b.vx * 0.12;
      b.vy = ny * c.kick + b.vy * 0.12;
    }
    return { nx: nx, ny: ny, speed: impact, obj: c };
  }

  // moving capsule (flipper)
  function hitFlipper(b, f) {
    var px = f.x, py = f.y;
    var a = f.angle;
    var ex = px + Math.cos(a) * f.len, ey = py + Math.sin(a) * f.len;
    var c = closestOnSeg(b.x, b.y, px, py, ex, ey);
    var nx = b.x - c.x, ny = b.y - c.y;
    var d = Math.sqrt(nx * nx + ny * ny);
    var R = b.r + f.r;
    if (d >= R) return null;
    if (d < 1e-6) { nx = 0; ny = -1; d = 1e-6; } else { nx /= d; ny /= d; }
    b.x += nx * (R - d + 0.05);
    b.y += ny * (R - d + 0.05);
    // surface point velocity
    var rx = c.x - px, ry = c.y - py;
    var pvx = -f.omega * ry, pvy = f.omega * rx;
    var rvx = b.vx - pvx, rvy = b.vy - pvy;
    var vn = rvx * nx + rvy * ny;
    if (vn > 0) return null;
    var e = 0.42;
    rvx -= (1 + e) * vn * nx;
    rvy -= (1 + e) * vn * ny;
    var tx = -ny, ty = nx;
    var vt = rvx * tx + rvy * ty;
    rvx -= vt * 0.10 * tx; rvy -= vt * 0.10 * ty;
    b.vx = rvx + pvx; b.vy = rvy + pvy;
    return { nx: nx, ny: ny, speed: -vn, obj: f };
  }

  /* ---------- particles ---------- */
  function Particles(max) {
    var p = [], i;
    for (i = 0; i < max; i++) p.push({ life: 0 });
    return {
      list: p,
      burst: function (x, y, n, col, spd, life) {
        var made = 0;
        for (var i = 0; i < p.length && made < n; i++) {
          if (p[i].life > 0) continue;
          var a = Math.random() * TAU, s = spd * (0.35 + Math.random() * 0.9);
          p[i].x = x; p[i].y = y;
          p[i].vx = Math.cos(a) * s; p[i].vy = Math.sin(a) * s;
          p[i].life = p[i].max = life * (0.6 + Math.random() * 0.7);
          p[i].c = col; p[i].sz = 1.6 + Math.random() * 2.4;
          made++;
        }
      },
      update: function (dt) {
        for (var i = 0; i < p.length; i++) {
          var q = p[i]; if (q.life <= 0) continue;
          q.life -= dt;
          q.x += q.vx * dt; q.y += q.vy * dt;
          q.vy += 900 * dt; q.vx *= 0.98; q.vy *= 0.98;
        }
      },
      draw: function (g) {
        for (var i = 0; i < p.length; i++) {
          var q = p[i]; if (q.life <= 0) continue;
          g.globalAlpha = Math.max(0, q.life / q.max);
          g.fillStyle = q.c;
          g.fillRect(q.x - q.sz * 0.5, q.y - q.sz * 0.5, q.sz, q.sz);
        }
        g.globalAlpha = 1;
      }
    };
  }

  /* ---------- audio (WebAudio only) ---------- */
  var actx = null, master = null, muted = false;
  function audioInit() {
    if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      actx = new AC();
      master = actx.createGain();
      master.gain.value = 0.24;
      master.connect(actx.destination);
    } catch (e) { actx = null; }
  }
  function tone(freq, dur, type, vol, slideTo) {
    if (!actx || muted) return;
    var t = actx.currentTime;
    var o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol === undefined ? 0.5 : vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol) {
    if (!actx || muted) return;
    var n = Math.floor(actx.sampleRate * dur);
    var buf = actx.createBuffer(1, n, actx.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var src = actx.createBufferSource(); src.buffer = buf;
    var g = actx.createGain(); g.gain.value = vol || 0.3;
    src.connect(g); g.connect(master); src.start();
  }
  var SFX = {
    flip: function () { tone(180, 0.05, 'square', 0.18, 120); },
    pop: function () { tone(420 + Math.random() * 120, 0.09, 'square', 0.35, 180); },
    sling: function () { tone(300, 0.06, 'sawtooth', 0.3, 700); },
    target: function () { tone(700, 0.07, 'square', 0.3, 900); },
    bank: function () { tone(520, 0.1, 'square', 0.35, 1040); setTimeout(function () { tone(780, 0.14, 'square', 0.3, 1560); }, 90); },
    ramp: function () { tone(300, 0.35, 'sine', 0.3, 1200); },
    spin: function () { tone(900 + Math.random() * 300, 0.03, 'square', 0.13); },
    hole: function () { tone(200, 0.2, 'sine', 0.35, 90); },
    kickb: function () { tone(120, 0.18, 'sawtooth', 0.4, 600); },
    launch: function () { tone(90, 0.22, 'sawtooth', 0.4, 420); },
    drain: function () { tone(320, 0.5, 'sawtooth', 0.35, 60); },
    jack: function () {
      [0, 90, 180, 300].forEach(function (d, i) {
        setTimeout(function () { tone(523 * Math.pow(1.26, i), 0.16, 'square', 0.35); }, d);
      });
    },
    tilt: function () { tone(140, 0.6, 'sawtooth', 0.4, 60); noise(0.4, 0.25); },
    wall: function (v) { if (v > 320) tone(150, 0.03, 'sine', Math.min(0.2, v / 4000)); }
  };

  /* ---------- storage ---------- */
  function best(seed) {
    try { return parseInt(localStorage.getItem('ssp_best_' + seed) || '0', 10) || 0; }
    catch (e) { return 0; }
  }
  function setBest(seed, v) {
    try { localStorage.setItem('ssp_best_' + seed, String(v)); } catch (e) { }
  }
  function lastSeed() {
    try { return localStorage.getItem('ssp_seed'); } catch (e) { return null; }
  }
  function saveSeed(s) { try { localStorage.setItem('ssp_seed', String(s)); } catch (e) { } }

  return {
    rng: rng, hashSeed: hashSeed, clamp: clamp, lerp: lerp, TAU: TAU,
    closestOnSeg: closestOnSeg, arcPts: arcPts, smooth: smooth,
    seg: seg, chain: chain,
    hitSeg: hitSeg, hitCircle: hitCircle, hitFlipper: hitFlipper,
    Particles: Particles, audioInit: audioInit, SFX: SFX,
    best: best, setBest: setBest, lastSeed: lastSeed, saveSeed: saveSeed,
    setMuted: function (m) { muted = m; }, isMuted: function () { return muted; }
  };
})();
