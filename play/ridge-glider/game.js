/* Ridge Glider - main game */
(function () {
  'use strict';

  var cv = document.getElementById('cv');
  var ctx = cv.getContext('2d', { alpha: false });
  var rotateEl = document.getElementById('rotate');
  var W = 960, H = 540, DPR = 1;

  // ---------------- physics constants ----------------
  var MASS = 100, S = 15, RHO = 1.225, G = 9.81;
  var CL0 = 0.35, CLA = 4.6, A_STALL = 0.145;
  var CD0 = 0.032, KIND = 0.062;
  var A_TRIM = 0.0, A_NEG = 0.055, A_POS = 0.155;
  var BEST_KEY = 'ridgeGliderBest';

  var best = 0;
  try {
    var storedBest = Number(localStorage.getItem(BEST_KEY) || 0);
    best = Number.isFinite(storedBest) && storedBest >= 0 ? Math.floor(storedBest) : 0;
  } catch (e) { }

  // ---------------- state ----------------
  var world, g, cam, particles = [], tmpTherm = [];
  var shake = 0, flash = 0, flashCol = '#fff';
  var state = 'fly';   // 'fly' | 'over'
  var overInfo = null, overT = 0;
  var tNow = 0, hintT = 0;

  function rnd(a, b) { return a + Math.random() * (b - a); }

  function newFlight() {
    world = new window.RG.World((Math.random() * 1e9) | 0);
    var y0 = world.h(0) + 300;
    g = {
      x: 0, y: y0, V: 17, gam: -0.06,
      alpha: A_TRIM, input: 0, inTarget: 0,
      stalled: 0, vy: 0, vx: 17, roll: 0,
      trail: [], t: 0
    };
    cam = { x: -60, yTop: y0 + 120, scale: 2.4 };
    particles.length = 0;
    state = 'fly'; overInfo = null; shake = 0; flash = 0;
    hintT = 6.5;
    tNow = 0;
    drag = null; keyUp = false; keyDn = false; dragPointer = null;
  }

  // ---------------- canvas sizing ----------------
  function resize() {
    var cw = window.innerWidth, ch = window.innerHeight;
    DPR = Math.min(2, window.devicePixelRatio || 1);
    var longCss = Math.max(cw, ch);
    var scale = Math.min(DPR, 960 / longCss);
    if (scale < 0.5) scale = 0.5;
    W = Math.max(320, Math.round(cw * scale));
    H = Math.max(200, Math.round(ch * scale));
    cv.width = W; cv.height = H;
    rotateEl.className = (ch > cw * 1.05) ? 'on' : '';
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', function () { setTimeout(resize, 250); });

  // ---------------- input ----------------
  var drag = null, dragPointer = null, keyUp = false, keyDn = false;
  var DRAG_PX = 90; // css px for full deflection

  function pressStart(x, y) {
    audioUnlock();
    drag = { y0: y, cur: y };
  }
  function pressMove(y, id) { if (drag && dragPointer === id) drag.cur = y; }
  function pressEnd(id) { if (dragPointer !== id) return; drag = null; dragPointer = null; }

  cv.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    if (dragPointer !== null) return;
    if (state === 'over' && overT > 0.45) { newFlight(); return; }
    dragPointer = e.pointerId; pressStart(e.clientX, e.clientY);
    if (cv.setPointerCapture) { try { cv.setPointerCapture(e.pointerId); } catch (x) {} }
  }, { passive: false });
  cv.addEventListener('pointermove', function (e) {
    if (dragPointer !== e.pointerId) return;
    e.preventDefault(); pressMove(e.clientY, e.pointerId);
  }, { passive: false });
  cv.addEventListener('pointerup', function (e) { e.preventDefault(); pressEnd(e.pointerId); }, { passive: false });
  cv.addEventListener('pointercancel', function (e) { e.preventDefault(); pressEnd(e.pointerId); }, { passive: false });
  document.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });

  window.addEventListener('keydown', function (e) {
    var k = e.key;
    if (k === 'ArrowUp' || k === 'w' || k === 'W') { keyUp = true; e.preventDefault(); }
    else if (k === 'ArrowDown' || k === 's' || k === 'S') { keyDn = true; e.preventDefault(); }
    else if (k === ' ' || k === 'Enter') {
      e.preventDefault();
      if (state === 'over' && overT > 0.45) newFlight();
    }
    audioUnlock();
  });
  window.addEventListener('keyup', function (e) {
    var k = e.key;
    if (k === 'ArrowUp' || k === 'w' || k === 'W') keyUp = false;
    if (k === 'ArrowDown' || k === 's' || k === 'S') keyDn = false;
  });
  window.addEventListener('blur', function () { drag = null; dragPointer = null; keyUp = false; keyDn = false; });

  function readInput(dt) {
    var target = 0, active = false;
    if (drag) {
      target = (drag.y0 - drag.cur) / DRAG_PX;
      if (target > 1) target = 1; if (target < -1) target = -1;
      active = true;
    }
    // keyboard stops just short of the stall so a held key mushes, not spins
    if (keyUp) { target = 0.85; active = true; }
    if (keyDn) { target = -1; active = true; }
    if (!active) target = g.inTarget * Math.max(0, 1 - dt * 1.6);
    g.inTarget = target;
    var rate = 5.5;
    g.input += (target - g.input) * Math.min(1, dt * rate);
  }

  // ---------------- audio (WebAudio only) ----------------
  var AC = null, master = null, varioOsc = null, varioGain = null;
  function audioUnlock() {
    if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
    try {
      var C = window.AudioContext || window.webkitAudioContext;
      if (!C) return;
      AC = new C();
      master = AC.createGain(); master.gain.value = 0.18; master.connect(AC.destination);
      varioOsc = AC.createOscillator(); varioOsc.type = 'square'; varioOsc.frequency.value = 700;
      varioGain = AC.createGain(); varioGain.gain.value = 0;
      varioOsc.connect(varioGain); varioGain.connect(master); varioOsc.start();
    } catch (e) { AC = null; }
  }
  var beepAcc = 0;
  function vario(dt, w) {
    if (!AC) return;
    if (w > 0.4 && state === 'fly') {
      var rate = 1.2 + Math.min(4.5, w) * 1.5;
      varioOsc.frequency.value = 620 + Math.min(5, w) * 150;
      beepAcc += dt * rate;
      var ph = beepAcc % 1;
      varioGain.gain.value = ph < 0.45 ? 0.25 : 0;
    } else {
      varioGain.gain.value = 0; beepAcc = 0;
    }
  }
  function thud(freq, dur, type, vol) {
    if (!AC) return;
    try {
      var o = AC.createOscillator(), gn = AC.createGain();
      o.type = type || 'sawtooth'; o.frequency.setValueAtTime(freq, AC.currentTime);
      o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.25), AC.currentTime + dur);
      gn.gain.setValueAtTime(vol || 0.5, AC.currentTime);
      gn.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + dur);
      o.connect(gn); gn.connect(master); o.start(); o.stop(AC.currentTime + dur + 0.02);
    } catch (e) { }
  }

  // ---------------- simulation ----------------
  function step(dt) {
    g.t += dt;
    readInput(dt);

    // weight-shift lag
    var aCmd = A_TRIM + (g.input < 0 ? g.input * A_NEG : g.input * A_POS);
    g.alpha += (aCmd - g.alpha) * Math.min(1, dt * 4.2);

    var a = g.alpha;
    var CL = CL0 + CLA * a;
    var extraD = 0;
    if (a > A_STALL) {
      var ex = a - A_STALL;
      CL = CL0 + CLA * A_STALL - 3.4 * ex;
      extraD = 0.9 * ex;
      g.stalled = Math.min(1, g.stalled + dt * 4);
    } else {
      g.stalled = Math.max(0, g.stalled - dt * 2.5);
    }
    if (CL < 0.10) CL = 0.10;

    var V = g.V; if (V < 3) V = 3;
    var q = 0.5 * RHO * V * V * S;
    var CD = CD0 + KIND * CL * CL + extraD;
    if (V > 32) { var o = (V - 32) / 10; CD += 0.022 * o * o; }

    var L = q * CL, D = q * CD;
    var sg = Math.sin(g.gam), cg = Math.cos(g.gam);

    var dV = (-D - MASS * G * sg) / MASS;
    var Vd = Math.max(6, g.V);
    var dgam = (L - MASS * G * cg) / (MASS * Vd);
    if (dgam > 2.8) dgam = 2.8; if (dgam < -2.8) dgam = -2.8;

    g.V += dV * dt;
    if (g.V < 4.5) g.V = 4.5;
    if (g.V > 44) g.V = 44;
    g.gam += dgam * dt;
    if (g.gam > 1.35) g.gam = 1.35;
    if (g.gam < -1.45) g.gam = -1.45;

    var w = world.lift(g.x, g.y);
    g.air = w;
    g.vx = g.V * Math.cos(g.gam) + world.wind;
    g.vy = g.V * Math.sin(g.gam) + w;

    g.x += g.vx * dt;
    g.y += g.vy * dt;

    g.roll += ((g.input * 0.22) - g.roll) * Math.min(1, dt * 6);

    // trail
    if (g.trail.length === 0 || g.x - g.trail[g.trail.length - 1].x > 6) {
      g.trail.push({ x: g.x, y: g.y });
      if (g.trail.length > 120) g.trail.shift();
    }

    // wingtip vortices when fast, sparkles when climbing
    if (g.V > 23 && Math.random() < dt * 30) {
      particles.push({ x: g.x, y: g.y, vx: -rnd(2, 6), vy: rnd(-2, 2), l: 0.7, m: 0.7, k: 0 });
    }
    if (w > 1.0 && Math.random() < dt * (8 + w * 6)) {
      particles.push({ x: g.x + rnd(-40, 40), y: g.y + rnd(-25, 25), vx: rnd(-1, 1), vy: w * rnd(0.5, 1.1), l: 1.4, m: 1.4, k: 1 });
    }
    if (g.stalled > 0.4) shake = Math.max(shake, 2 + g.stalled * 3);

    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.l -= dt; if (p.l <= 0) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
    }

    // ground contact
    var gh = world.h(g.x);
    if (g.y <= gh) {
      g.y = gh;
      land(gh);
    }
    vario(dt, w);
  }

  function land(gh) {
    var lz = world.lzAt(g.x);
    var slope = Math.abs(world.slope(g.x));
    var gentle = (g.vy > -3.4) && (g.V < 15.5) && (slope < 0.28) && (g.stalled < 0.5);
    var dist = Math.max(0, Math.round(g.x));
    var bonus = 0, msg, sub;

    if (gentle && lz) {
      var acc = 1 - Math.abs(lz.dx) / lz.half;
      var soft = Math.max(0, Math.min(1, (3.4 + g.vy) / 3.4));
      bonus = Math.round(400 + 400 * acc + 300 * soft);
      msg = 'SPOT LANDING';
      sub = 'zone bonus +' + bonus;
      flashCol = '#7dffb0'; flash = 0.6;
      thud(520, 0.35, 'triangle', 0.4);
    } else if (gentle) {
      msg = 'LANDED OUT';
      sub = 'no zone bonus';
      flashCol = '#ffe08a'; flash = 0.4;
      thud(260, 0.3, 'triangle', 0.35);
    } else {
      msg = g.stalled > 0.5 ? 'STALLED IN' : 'CRASHED';
      sub = 'flew it into the hill';
      flashCol = '#ff6b6b'; flash = 0.8; shake = 22;
      thud(150, 0.55, 'sawtooth', 0.7);
      for (var i = 0; i < 40; i++) {
        particles.push({ x: g.x, y: gh + 4, vx: rnd(-30, 25), vy: rnd(2, 26), l: rnd(0.5, 1.3), m: 1.3, k: 2 });
      }
    }
    var score = dist + bonus;
    var isBest = score > best;
    if (isBest) {
      best = score;
      try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) { }
    }
    overInfo = { msg: msg, sub: sub, dist: dist, bonus: bonus, score: score, isBest: isBest };
    state = 'over'; overT = 0;
    if (varioGain) varioGain.gain.value = 0;
  }

  // ---------------- camera ----------------
  function updateCam(dt) {
    var gh = world.h(g.x);
    var agl = g.y - gh;
    var t = Math.min(1, Math.max(0, (agl - 70) / 430));
    var want = 2.9 - 1.75 * t;             // px per metre (in backing-store px)
    want *= (W / 960);
    if (want < 0.6) want = 0.6;
    cam.scale += (want - cam.scale) * Math.min(1, dt * 1.6);

    var s = cam.scale;
    var wantX = g.x - (W * 0.32) / s;
    var wantY = g.y + (H * 0.40) / s;
    // keep some ground visible
    var lowest = gh;
    for (var i = 0; i <= 6; i++) {
      var hh = world.h(g.x + i * (W / s) / 6);
      if (hh > lowest) lowest = hh;
    }
    var maxTop = lowest + H / s * 0.98;
    if (wantY > maxTop && agl < 200) wantY = Math.max(g.y + 30 / s, maxTop);

    var k = Math.min(1, dt * 6);
    cam.x += (wantX - cam.x) * k;
    cam.y = 0;
    cam.yTop += (wantY - cam.yTop) * Math.min(1, dt * 4);
  }

  function sx(wx) { return (wx - cam.x) * cam.scale; }
  function sy(wy) { return (cam.yTop - wy) * cam.scale; }

  // ---------------- rendering ----------------
  var skyGrad = null, skyKey = '', terrGrad = null, terrGradH = -1;
  function drawSky() {
    var key = W + 'x' + H;
    if (skyKey !== key) {
      skyGrad = ctx.createLinearGradient(0, 0, 0, H);
      skyGrad.addColorStop(0, '#1a3f6b');
      skyGrad.addColorStop(0.45, '#2f76a8');
      skyGrad.addColorStop(0.8, '#7fb6cf');
      skyGrad.addColorStop(1, '#c9dbe0');
      skyKey = key;
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, H);
  }

  function drawClouds() {
    // simple cumulus row near cloudbase, parallax
    var base = 1150;
    var pf = 0.35;
    var step = 520;
    var x0 = cam.x * pf;
    var i0 = Math.floor(x0 / step) - 1;
    ctx.save();
    for (var i = i0; i < i0 + Math.ceil(W / cam.scale / step) + 3; i++) {
      var r = ((Math.sin(i * 12.9898 + world.seed * 0.001) * 43758.5453) % 1 + 1) % 1;
      if (r > 0.75) continue;
      var cx = (i * step + r * 300 - x0) * cam.scale;
      var cy = sy(base + r * 130) * pf + H * 0.10;
      var rad = (34 + r * 26) * cam.scale;
      if (cx < -rad * 3 || cx > W + rad * 3) continue;
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, 6.283);
      ctx.arc(cx + rad * 0.9, cy + rad * 0.15, rad * 0.75, 0, 6.283);
      ctx.arc(cx - rad * 0.85, cy + rad * 0.2, rad * 0.65, 0, 6.283);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBgRidge(pf, amp, off, col) {
    var s = cam.scale;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, H);
    var stepPx = 10;
    for (var px = 0; px <= W + stepPx; px += stepPx) {
      var wx = cam.x * pf + px / s;
      var hb = 120 + amp * world.n(wx / 900 + off, 5) + amp * 0.45 * world.n(wx / 320 + off * 2, 6);
      var y = (cam.yTop - hb) * s * pf + H * (1 - pf) * 0.42;
      ctx.lineTo(px, y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
  }

  function drawTerrain() {
    var s = cam.scale;
    var stepPx = 4;
    var pts = [];
    for (var px = -stepPx; px <= W + stepPx; px += stepPx) {
      var wx = cam.x + px / s;
      pts.push([px, sy(world.h(wx)), wx]);
    }
    // body
    if (!terrGrad || terrGradH !== H) {
      terrGrad = ctx.createLinearGradient(0, 0, 0, H);
      terrGrad.addColorStop(0, '#3c6b4a');
      terrGrad.addColorStop(1, '#16261f');
      terrGradH = H;
    }
    ctx.fillStyle = terrGrad;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], H);
    for (var i = 0; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.lineTo(pts[pts.length - 1][0], H);
    ctx.closePath();
    ctx.fill();
    // crest line
    ctx.strokeStyle = '#8fd6a0';
    ctx.lineWidth = Math.max(1.5, 2 * (W / 960));
    ctx.beginPath();
    for (i = 0; i < pts.length; i++) { if (i === 0) ctx.moveTo(pts[i][0], pts[i][1]); else ctx.lineTo(pts[i][0], pts[i][1]); }
    ctx.stroke();

    // windward lift band shading (banded fills - cheap, no per-column gradients)
    ctx.fillStyle = '#96e1ff';
    for (i = 0; i < pts.length - 1; i += 2) {
      var wx2 = pts[i][2];
      var sl = world.slope(wx2);
      if (sl <= 0.09) continue;
      var band = 70 + 190 * Math.min(1, sl);
      var ghc = world.h(wx2);
      var alpha = Math.min(0.26, (sl - 0.08) * 0.45);
      var wpx = stepPx * 2 + 1;
      for (var bq = 0; bq < 4; bq++) {
        var f0 = bq / 4, f1 = (bq + 1) / 4;
        var yA = sy(ghc + band * f1), yB = sy(ghc + band * f0);
        ctx.globalAlpha = alpha * (1 - (f0 + f1) / 2);
        ctx.fillRect(pts[i][0], yA, wpx, yB - yA + 1);
      }
    }
    ctx.globalAlpha = 1;

    // rising streaks over windward faces
    ctx.save();
    ctx.strokeStyle = 'rgba(190,240,255,0.45)';
    ctx.lineWidth = Math.max(1, 1.4 * (W / 960));
    var t = tNow;
    for (var px2 = 0; px2 < W; px2 += 46) {
      var wx3 = cam.x + px2 / s;
      var sl2 = world.slope(wx3);
      if (sl2 <= 0.12) continue;
      var bd = 70 + 190 * Math.min(1, sl2);
      var gh = world.h(wx3);
      var ph = ((t * (0.28 + sl2 * 0.3) + px2 * 0.013) % 1);
      var yy = gh + ph * bd;
      var y1 = sy(yy), y2 = sy(yy + bd * 0.16);
      ctx.globalAlpha = 0.55 * (1 - ph);
      ctx.beginPath();
      ctx.moveTo(px2, y1); ctx.lineTo(px2 + 2, y2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawLZ() {
    var s = cam.scale;
    var SP = window.RG.LZ_SPACING, HALF = window.RG.LZ_HALF;
    var k0 = Math.max(1, Math.floor(cam.x / SP));
    var k1 = Math.floor((cam.x + W / s) / SP) + 1;
    for (var k = k0; k <= k1; k++) {
      var cx = k * SP, gy = world.h(cx);
      var x1 = sx(cx - HALF), x2 = sx(cx + HALF), y = sy(gy);
      if (x2 < -20 || x1 > W + 20) continue;
      ctx.fillStyle = 'rgba(255,220,90,0.30)';
      ctx.fillRect(x1, y - 3, x2 - x1, Math.max(3, 5 * s * 0.5 + 3));
      ctx.strokeStyle = '#ffdc5a';
      ctx.lineWidth = Math.max(1.5, 2 * (W / 960));
      ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
      // poles + flags
      var ph = Math.max(14, 26 * s * 0.6);
      [x1, x2].forEach(function (px) {
        ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px, y - ph); ctx.stroke();
        ctx.fillStyle = '#ffdc5a';
        ctx.beginPath();
        ctx.moveTo(px, y - ph);
        ctx.lineTo(px + ph * 0.55, y - ph + ph * 0.16);
        ctx.lineTo(px, y - ph + ph * 0.32);
        ctx.closePath(); ctx.fill();
      });
      // centre chevron
      var mid = sx(cx);
      ctx.fillStyle = 'rgba(255,220,90,0.85)';
      ctx.beginPath();
      ctx.moveTo(mid, y - 4);
      ctx.lineTo(mid - ph * 0.3, y - ph * 0.55);
      ctx.lineTo(mid + ph * 0.3, y - ph * 0.55);
      ctx.closePath(); ctx.fill();
      // label
      if (x2 - x1 > 60) {
        ctx.fillStyle = 'rgba(255,240,190,0.9)';
        ctx.font = Math.round(Math.max(10, 12 * (W / 960))) + 'px ui-sans-serif,system-ui,sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('LZ ' + k, mid, y - ph - 6);
        ctx.textAlign = 'left';
      }
    }
  }

  function drawThermals() {
    var s = cam.scale;
    world.thermalsNear(cam.x - 200, cam.x + W / s + 200, tmpTherm);
    for (var i = 0; i < tmpTherm.length; i++) {
      var c = tmpTherm[i];
      var cx = sx(c.x);
      var rp = c.r * s;
      if (cx + rp < -30 || cx - rp > W + 30) continue;
      var yb = sy(c.base), yt = sy(c.top);
      var alpha = 0.05 + Math.min(0.10, c.s * 0.022);
      var grd = ctx.createLinearGradient(0, yb, 0, yt);
      grd.addColorStop(0, 'rgba(255,238,190,' + (alpha * 1.6).toFixed(3) + ')');
      grd.addColorStop(0.75, 'rgba(255,238,190,' + alpha.toFixed(3) + ')');
      grd.addColorStop(1, 'rgba(255,238,190,0)');
      ctx.fillStyle = grd;
      // wavy column
      ctx.beginPath();
      var segs = 10;
      for (var q = 0; q <= segs; q++) {
        var f = q / segs;
        var yy = yb + (yt - yb) * f;
        var wob = Math.sin(tNow * 1.6 + c.ph + f * 5.0) * rp * 0.13;
        ctx.lineTo(cx - rp * (1 - f * 0.12) + wob, yy);
      }
      for (q = segs; q >= 0; q--) {
        var f2 = q / segs;
        var yy2 = yb + (yt - yb) * f2;
        var wob2 = Math.sin(tNow * 1.6 + c.ph + f2 * 5.0 + 1.7) * rp * 0.13;
        ctx.lineTo(cx + rp * (1 - f2 * 0.12) + wob2, yy2);
      }
      ctx.closePath();
      ctx.fill();

      // circling birds
      if (rp > 12) {
        ctx.strokeStyle = 'rgba(25,30,40,0.75)';
        ctx.lineWidth = Math.max(1, 1.6 * (W / 960));
        for (var b = 0; b < 3; b++) {
          var ang = tNow * 0.9 + c.ph + b * 2.09;
          var bx = cx + Math.cos(ang) * rp * 0.62;
          var alt = c.base + 90 + ((tNow * 22 + b * 130 + c.ph * 60) % Math.max(120, (c.top - c.base - 160)));
          var by = sy(alt);
          if (by < -20 || by > H + 20) continue;
          var sz = Math.max(3, 5 * (W / 960)) * (0.75 + 0.35 * Math.sin(ang));
          ctx.beginPath();
          ctx.moveTo(bx - sz, by);
          ctx.quadraticCurveTo(bx - sz * 0.5, by - sz * 0.7, bx, by);
          ctx.quadraticCurveTo(bx + sz * 0.5, by - sz * 0.7, bx + sz, by);
          ctx.stroke();
        }
      }
    }
  }

  function drawParticles() {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      var a = p.l / p.m;
      var X = sx(p.x), Y = sy(p.y);
      if (X < -20 || X > W + 20) continue;
      if (p.k === 0) { ctx.fillStyle = 'rgba(255,255,255,' + (a * 0.5).toFixed(3) + ')'; ctx.fillRect(X, Y, 3, 2); }
      else if (p.k === 1) { ctx.fillStyle = 'rgba(255,240,170,' + (a * 0.8).toFixed(3) + ')'; ctx.fillRect(X, Y, 3, 3); }
      else { ctx.fillStyle = 'rgba(210,120,70,' + (a * 0.9).toFixed(3) + ')'; ctx.fillRect(X - 2, Y - 2, 4, 4); }
    }
  }

  function drawGlider() {
    var s = cam.scale;
    var X = sx(g.x), Y = sy(g.y);
    // trail
    if (g.trail.length > 1) {
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = Math.max(1, 1.6 * (W / 960));
      ctx.beginPath();
      for (var i = 0; i < g.trail.length; i++) {
        var t = g.trail[i];
        var tx = sx(t.x), ty = sy(t.y);
        if (i === 0) ctx.moveTo(tx, ty); else ctx.lineTo(tx, ty);
      }
      ctx.stroke();
    }

    var span = Math.max(20, 11 * s);
    var pitch = g.gam + g.alpha * 0.9;
    ctx.save();
    ctx.translate(X, Y);
    ctx.rotate(-pitch);
    // wing
    var stalled = g.stalled > 0.35;
    var col = stalled ? '#ff7a6b' : '#f2f6ff';
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(span * 0.52, 0);
    ctx.lineTo(-span * 0.48, -span * 0.20);
    ctx.lineTo(-span * 0.34, 0);
    ctx.lineTo(-span * 0.48, span * 0.20);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = stalled ? '#a63b30' : '#2c6ea8';
    ctx.beginPath();
    ctx.moveTo(span * 0.52, 0);
    ctx.lineTo(-span * 0.48, span * 0.20);
    ctx.lineTo(-span * 0.34, 0);
    ctx.closePath();
    ctx.fill();
    // pilot under the keel
    ctx.fillStyle = '#1b2733';
    ctx.beginPath();
    ctx.ellipse(-span * 0.02 - g.input * span * 0.10, span * 0.16, span * 0.16, span * 0.07, 0, 0, 6.283);
    ctx.fill();
    ctx.strokeStyle = '#1b2733';
    ctx.lineWidth = Math.max(1, span * 0.03);
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(-g.input * span * 0.10, span * 0.13);
    ctx.stroke();
    ctx.restore();

    if (stalled) {
      ctx.fillStyle = 'rgba(255,90,80,' + (0.5 + 0.5 * Math.sin(tNow * 22)).toFixed(2) + ')';
      ctx.font = 'bold ' + Math.round(16 * (W / 960) + 8) + 'px ui-sans-serif,system-ui,sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('STALL', X, Y - span * 0.9);
      ctx.textAlign = 'left';
    }
  }

  // ---------------- HUD ----------------
  function F(n) { return Math.round(n); }
  function hud() {
    var u = W / 960;
    var pad = Math.round(14 * u) + 6;
    var fs = Math.round(15 * u) + 6;
    ctx.textBaseline = 'top';
    ctx.font = '600 ' + fs + 'px ui-sans-serif,system-ui,sans-serif';

    var gh = world.h(g.x);
    var agl = g.y - gh;
    var dist = g.x;

    // left block
    ctx.fillStyle = 'rgba(8,18,28,0.42)';
    var bw = fs * 8.4, bh = fs * 3.5;
    roundRect(pad - 8, pad - 6, bw, bh, 8); ctx.fill();
    ctx.fillStyle = '#eaf4ff';
    ctx.fillText((dist / 1000).toFixed(2) + ' km', pad, pad);
    ctx.font = Math.round(fs * 0.72) + 'px ui-sans-serif,system-ui,sans-serif';
    ctx.fillStyle = '#a9c6dd';
    ctx.fillText('best ' + best, pad, pad + fs * 1.25);
    var nxt = world.nextLZ(g.x) - g.x;
    ctx.fillStyle = '#ffdc5a';
    ctx.fillText('next LZ ' + F(nxt) + ' m', pad, pad + fs * 2.15);

    // right block
    ctx.textAlign = 'right';
    var rx = W - pad;
    ctx.fillStyle = 'rgba(8,18,28,0.42)';
    roundRect(rx - bw + 8, pad - 6, bw, bh, 8); ctx.fill();
    ctx.font = '600 ' + fs + 'px ui-sans-serif,system-ui,sans-serif';
    var fast = g.V > 30, slow = g.V < 11.5;
    ctx.fillStyle = slow ? '#ff8b7a' : (fast ? '#ffd27a' : '#eaf4ff');
    ctx.fillText(F(g.V * 3.6) + ' km/h', rx, pad);
    ctx.font = Math.round(fs * 0.72) + 'px ui-sans-serif,system-ui,sans-serif';
    ctx.fillStyle = '#a9c6dd';
    ctx.fillText(F(agl) + ' m agl', rx, pad + fs * 1.25);
    ctx.fillStyle = g.vy > 0.2 ? '#7dffb0' : '#c9d8e6';
    ctx.fillText((g.vy >= 0 ? '+' : '') + g.vy.toFixed(1) + ' m/s', rx, pad + fs * 2.15);
    ctx.textAlign = 'left';

    // vario bar (right edge)
    var barH = Math.min(H * 0.5, 210 * u + 60);
    var barW = Math.round(10 * u) + 6;
    var bx = W - barW - pad * 0.5;
    var by = H * 0.5 - barH / 2;
    ctx.fillStyle = 'rgba(8,18,28,0.35)';
    roundRect(bx, by, barW, barH, barW / 2); ctx.fill();
    var mid = by + barH / 2;
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(bx, mid - 1, barW, 2);
    var v = Math.max(-5, Math.min(5, g.vy)) / 5;
    var len = v * (barH / 2 - 3);
    ctx.fillStyle = v > 0 ? '#7dffb0' : '#ff9d8a';
    if (len > 0) ctx.fillRect(bx + 2, mid - len, barW - 4, len);
    else ctx.fillRect(bx + 2, mid, barW - 4, -len);

    // pitch / control indicator (left edge)
    var pbH = barH, pbW = barW, pbx = pad * 0.5, pby = by;
    ctx.fillStyle = 'rgba(8,18,28,0.35)';
    roundRect(pbx, pby, pbW, pbH, pbW / 2); ctx.fill();
    var pmid = pby + pbH / 2;
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(pbx, pmid - 1, pbW, 2);
    var kn = pmid - g.input * (pbH / 2 - 8);
    ctx.fillStyle = g.stalled > 0.35 ? '#ff7a6b' : '#eaf4ff';
    ctx.beginPath(); ctx.arc(pbx + pbW / 2, kn, pbW * 0.62, 0, 6.283); ctx.fill();

    // hint line
    if (hintT > 0) {
      ctx.globalAlpha = Math.min(1, hintT);
      ctx.textAlign = 'center';
      ctx.font = '600 ' + Math.round(fs * 0.95) + 'px ui-sans-serif,system-ui,sans-serif';
      ctx.fillStyle = 'rgba(6,14,22,0.5)';
      var msg = 'Drag up to flare and climb, down to dive for speed - ride lift, go far.';
      var tw = ctx.measureText(msg).width;
      roundRect(W / 2 - tw / 2 - 14, H - fs * 2.9, tw + 28, fs * 1.8, 10); ctx.fill();
      ctx.fillStyle = '#eaf4ff';
      ctx.fillText(msg, W / 2, H - fs * 2.5);
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
    }
    ctx.textBaseline = 'alphabetic';
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function overlay() {
    var u = W / 960;
    var a = Math.min(1, overT * 2.4);
    ctx.fillStyle = 'rgba(6,14,22,' + (0.62 * a).toFixed(3) + ')';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.globalAlpha = a;
    var cy = H * 0.30;
    ctx.fillStyle = overInfo.bonus > 0 ? '#7dffb0' : (overInfo.msg === 'LANDED OUT' ? '#ffe08a' : '#ff8f80');
    ctx.font = 'bold ' + Math.round(30 * u + 16) + 'px ui-sans-serif,system-ui,sans-serif';
    ctx.fillText(overInfo.msg, W / 2, cy);
    ctx.font = Math.round(13 * u + 6) + 'px ui-sans-serif,system-ui,sans-serif';
    ctx.fillStyle = '#a9c6dd';
    ctx.fillText(overInfo.sub, W / 2, cy + 26 * u + 14);

    ctx.font = '600 ' + Math.round(17 * u + 8) + 'px ui-sans-serif,system-ui,sans-serif';
    ctx.fillStyle = '#eaf4ff';
    ctx.fillText('distance ' + (overInfo.dist / 1000).toFixed(2) + ' km   +   bonus ' + overInfo.bonus,
      W / 2, cy + 58 * u + 34);
    ctx.font = 'bold ' + Math.round(26 * u + 14) + 'px ui-sans-serif,system-ui,sans-serif';
    ctx.fillStyle = overInfo.isBest ? '#ffdc5a' : '#eaf4ff';
    ctx.fillText('SCORE ' + overInfo.score + (overInfo.isBest ? '  NEW BEST' : ''), W / 2, cy + 96 * u + 60);
    ctx.font = Math.round(13 * u + 6) + 'px ui-sans-serif,system-ui,sans-serif';
    ctx.fillStyle = '#a9c6dd';
    ctx.fillText('best ' + best, W / 2, cy + 124 * u + 82);

    if (overT > 0.45) {
      ctx.globalAlpha = a * (0.6 + 0.4 * Math.sin(tNow * 4));
      ctx.font = '600 ' + Math.round(16 * u + 8) + 'px ui-sans-serif,system-ui,sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('TAP  /  SPACE  to launch again', W / 2, H - 34 * u - 18);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawSky();
    var shx = 0, shy = 0;
    if (shake > 0.05) { shx = rnd(-shake, shake); shy = rnd(-shake, shake); }
    ctx.save();
    ctx.translate(shx, shy);
    drawClouds();
    drawBgRidge(0.30, 210, 3.1, '#4d6f88');
    drawBgRidge(0.55, 260, 8.4, '#3a5a63');
    drawThermals();
    drawTerrain();
    drawLZ();
    drawParticles();
    drawGlider();
    ctx.restore();

    if (flash > 0.01) {
      ctx.globalAlpha = Math.min(0.55, flash);
      ctx.fillStyle = flashCol;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    if (state === 'fly') hud(); else { hud(); overlay(); }
  }

  // ---------------- loop ----------------
  var last = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    if (window.innerHeight > window.innerWidth * 1.05) {
      last = ts; drag = null; dragPointer = null; keyUp = false; keyDn = false; render(); return;
    }
    if (!last) last = ts;
    var dt = (ts - last) / 1000;
    last = ts;
    if (dt > 0.1) dt = 0.1;
    if (dt <= 0) dt = 0.0001;
    tNow += dt;
    if (hintT > 0) hintT -= dt;
    shake *= Math.pow(0.02, dt);
    flash *= Math.pow(0.02, dt);

    if (state === 'fly') {
      var rem = dt;
      while (rem > 0 && state === 'fly') {
        var h = Math.min(0.016, rem);
        step(h);
        rem -= h;
      }
      updateCam(dt);
    } else {
      overT += dt;
      for (var i = particles.length - 1; i >= 0; i--) {
        var p = particles[i];
        p.l -= dt; if (p.l <= 0) { particles.splice(i, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.vy -= 30 * dt;
      }
    }
    render();
  }

  resize();
  newFlight();
  requestAnimationFrame(frame);
})();
