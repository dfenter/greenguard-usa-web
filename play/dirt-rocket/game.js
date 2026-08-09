/* Dirt Rocket - main game */
(function (g) {
  'use strict';
  var DR = g.DR;

  // ---------------------------------------------------------------- canvas
  var wrap = document.getElementById('wrap');
  var cv = document.getElementById('cv');
  var ctx = cv.getContext('2d', { alpha: false });
  var rotEl = document.getElementById('rot');
  var W = 800, H = 400, SC = 1, portrait = false;

  function resize() {
    W = wrap.clientWidth || window.innerWidth;
    H = wrap.clientHeight || window.innerHeight;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var long = Math.max(W, H);
    if (long * dpr > 960) dpr = 960 / long;
    SC = dpr;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    portrait = W < H;
    rotEl.className = portrait ? 'on' : '';
    layout();
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', function () { setTimeout(resize, 120); });

  // ---------------------------------------------------------------- layout
  var UI = {};
  function layout() {
    var r = Math.max(38, Math.min(58, H * 0.155));
    UI.gas = { x: W - r - 22, y: H - r - 20, r: r };
    UI.boost = { x: W - r - 30, y: H - r * 2.7 - 26, r: Math.max(30, r * 0.7) };
    UI.brake = { x: r + 20, y: H - r - 20, r: r * 0.86 };
    UI.btnA = { x: W * 0.5 - 150, y: H * 0.72, w: 140, h: 48 };
    UI.btnB = { x: W * 0.5 + 10, y: H * 0.72, w: 140, h: 48 };
  }

  // ---------------------------------------------------------------- audio
  var AU = { ctx: null, on: false };
  function audioInit() {
    if (AU.ctx) { if (AU.ctx.state === 'suspended') AU.ctx.resume(); return; }
    var AC = g.AudioContext || g.webkitAudioContext;
    if (!AC) return;
    try {
      var a = new AC();
      var master = a.createGain(); master.gain.value = 0.5; master.connect(a.destination);
      var osc = a.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 70;
      var osc2 = a.createOscillator(); osc2.type = 'square'; osc2.frequency.value = 35;
      var lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
      var eg = a.createGain(); eg.gain.value = 0;
      osc.connect(lp); osc2.connect(lp); lp.connect(eg); eg.connect(master);
      osc.start(); osc2.start();
      // noise buffer
      var nb = a.createBuffer(1, a.sampleRate * 0.5, a.sampleRate), d = nb.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      AU.ctx = a; AU.master = master; AU.osc = osc; AU.osc2 = osc2; AU.eg = eg; AU.lp = lp; AU.noise = nb;
      AU.on = true;
    } catch (e) { AU.on = false; }
  }
  function engine(rpm, gas, boost) {
    if (!AU.on) return;
    var t = AU.ctx.currentTime;
    var f = 62 + rpm * 250 + (boost ? 55 : 0);
    AU.osc.frequency.setTargetAtTime(f, t, 0.06);
    AU.osc2.frequency.setTargetAtTime(f * 0.5, t, 0.06);
    AU.lp.frequency.setTargetAtTime(500 + rpm * 1600 + (gas ? 500 : 0), t, 0.08);
    AU.eg.gain.setTargetAtTime(gas ? 0.075 : 0.026, t, 0.08);
  }
  function thud(vol, dur, freq) {
    if (!AU.on) return;
    var a = AU.ctx, t = a.currentTime;
    var s = a.createBufferSource(); s.buffer = AU.noise;
    var f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq || 220; f.Q.value = 0.8;
    var gn = a.createGain(); gn.gain.setValueAtTime(vol, t);
    gn.gain.exponentialRampToValueAtTime(0.0007, t + (dur || 0.25));
    s.connect(f); f.connect(gn); gn.connect(AU.master); s.start(t); s.stop(t + (dur || 0.25) + 0.05);
  }
  function blip(f0, f1, dur, vol) {
    if (!AU.on) return;
    var a = AU.ctx, t = a.currentTime;
    var o = a.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    var gn = a.createGain(); gn.gain.setValueAtTime(vol || 0.15, t);
    gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(gn); gn.connect(AU.master); o.start(t); o.stop(t + dur + 0.02);
  }

  // ---------------------------------------------------------------- input
  var inp = { gas: false, brake: false, boost: false, lean: 0 };
  var keys = {};
  var ptrs = {};   // id -> {role, y0, lean}
  var uiTapped = null;

  function pos(e) {
    var r = cv.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function inCircle(p, c) { var dx = p.x - c.x, dy = p.y - c.y; return dx * dx + dy * dy <= (c.r + 12) * (c.r + 12); }
  function inRect(p, r) { return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }

  function down(id, p) {
    audioInit();
    if (S.mode !== 'run' && S.mode !== 'crash') { uiTapped = p; return; }
    var role = 'none';
    if (inCircle(p, UI.boost)) role = 'boost';
    else if (p.x > W * 0.5) role = 'gas';
    else { role = 'lean'; if (inCircle(p, UI.brake)) role = 'leanbrake'; }
    ptrs[id] = { role: role, y0: p.y, lean: 0 };
    apply();
  }
  function move(id, p) {
    var t = ptrs[id]; if (!t) return;
    if (t.role === 'lean' || t.role === 'leanbrake') {
      t.lean = Math.max(-1, Math.min(1, (t.y0 - p.y) / 62));
      if (t.role === 'leanbrake' && Math.abs(t.y0 - p.y) > 26) t.role = 'lean';
    } else if (t.role === 'gas' && inCircle(p, UI.boost)) t.role = 'boost';
    apply();
  }
  function up(id) { delete ptrs[id]; apply(); }

  function apply() {
    var gas = false, br = false, bo = false, ln = 0, has = false;
    for (var k in ptrs) {
      var t = ptrs[k];
      if (t.role === 'gas') gas = true;
      else if (t.role === 'boost') { bo = true; gas = true; }
      else if (t.role === 'leanbrake') { br = true; ln += t.lean; has = true; }
      else if (t.role === 'lean') { ln += t.lean; has = true; }
    }
    inp.tGas = gas; inp.tBrake = br; inp.tBoost = bo;
    inp.tLean = has ? Math.max(-1, Math.min(1, ln)) : 0;
  }

  function pd(e) { e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (x) { } down(e.pointerId, pos(e)); }
  function pm(e) { e.preventDefault(); move(e.pointerId, pos(e)); }
  function pu(e) { e.preventDefault(); up(e.pointerId); }
  if (window.PointerEvent) {
    cv.addEventListener('pointerdown', pd);
    cv.addEventListener('pointermove', pm);
    cv.addEventListener('pointerup', pu);
    cv.addEventListener('pointercancel', pu);
  } else {
    cv.addEventListener('touchstart', function (e) {
      e.preventDefault();
      for (var i = 0; i < e.changedTouches.length; i++) { var t = e.changedTouches[i]; down(t.identifier, pos(t)); }
    }, { passive: false });
    cv.addEventListener('touchmove', function (e) {
      e.preventDefault();
      for (var i = 0; i < e.changedTouches.length; i++) { var t = e.changedTouches[i]; move(t.identifier, pos(t)); }
    }, { passive: false });
    var tend = function (e) {
      e.preventDefault();
      for (var i = 0; i < e.changedTouches.length; i++) up(e.changedTouches[i].identifier);
    };
    cv.addEventListener('touchend', tend, { passive: false });
    cv.addEventListener('touchcancel', tend, { passive: false });
    cv.addEventListener('mousedown', function (e) { e.preventDefault(); down('m', pos(e)); });
    cv.addEventListener('mousemove', function (e) { if (ptrs['m']) { e.preventDefault(); move('m', pos(e)); } });
    window.addEventListener('mouseup', function () { up('m'); });
  }
  document.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });

  window.addEventListener('keydown', function (e) {
    audioInit();
    keys[e.code] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter', 'ShiftLeft', 'ShiftRight'].indexOf(e.code) >= 0) e.preventDefault();
    if (e.code === 'KeyR') restartTrack();
    if ((e.code === 'Enter' || e.code === 'Space') && (S.mode === 'result' || S.mode === 'medal')) advance(0);
    if (e.code === 'Escape' && S.mode === 'medal') advance(1);
  });
  window.addEventListener('keyup', function (e) { keys[e.code] = false; });
  window.addEventListener('blur', function () { keys = {}; ptrs = {}; apply(); });

  function readInput() {
    var kg = keys['ArrowRight'] || keys['KeyD'];
    var kb = keys['ArrowLeft'] || keys['KeyA'];
    var kbo = keys['ShiftLeft'] || keys['ShiftRight'] || keys['Space'];
    var kl = (keys['ArrowUp'] || keys['KeyW'] ? 1 : 0) + (keys['ArrowDown'] || keys['KeyS'] ? -1 : 0);
    inp.gas = !!(inp.tGas || kg);
    inp.brake = !!(inp.tBrake || kb);
    inp.boost = !!(inp.tBoost || (kbo && inp.gas));
    inp.lean = kl !== 0 ? kl : (inp.tLean || 0);
  }

  // ---------------------------------------------------------------- state
  var EVENTS = 8;
  var S = {
    mode: 'run', evt: 0, ti: 0, times: [null, null, null], bonus: [0, 0, 0],
    t: 0, tracks: null, timer: 0, shake: 0, flash: 0, flashCol: '#fff',
    crashT: 0, msg: '', msgT: 0, hint: 6.5, camX: 0, camY: 0, cp: 0, best: {}
  };
  var bike = new DR.Bike();
  var parts = [];
  var out = {};

  function loadBest() {
    try {
      var parsed = JSON.parse(localStorage.getItem('dirtrocket.best.v1') || '{}');
      S.best = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
      for (var k in S.best) if (!Number.isFinite(S.best[k]) || S.best[k] < 0) delete S.best[k];
    } catch (e) { S.best = {}; }
  }
  function saveBest() {
    try { localStorage.setItem('dirtrocket.best.v1', JSON.stringify(S.best)); } catch (e) { }
  }
  loadBest();

  function buildEvent(idx) {
    S.evt = ((idx % EVENTS) + EVENTS) % EVENTS;
    S.tracks = [];
    for (var i = 0; i < 3; i++) S.tracks.push(DR.makeTrack((S.evt + 1) * 7919 + i * 1313 + 17));
    S.times = [null, null, null]; S.bonus = [0, 0, 0];
    S.ti = 0;
    startTrack();
  }
  function startTrack() {
    var tr = S.tracks[S.ti];
    bike.reset(120, tr.heightAt(120) - (DR.BK.AY + DR.BK.REST + DR.BK.WR), tr.slopeAt(120));
    bike.vx = 0;
    S.timer = 0; S.mode = 'run'; S.cp = 120; S.crashT = 0; S.stuck = 0; S.lastCrashX = -1e9;
    S.camX = bike.x; S.camY = bike.y;
    parts.length = 0;
    keys = {}; ptrs = {}; uiTapped = null; apply();
    S.msg = ''; S.msgT = 0;
  }
  function restartTrack() {
    if (S.mode === 'medal') return;
    startTrack();
  }

  function medalFor(total, par) {
    if (total <= par * 1.00) return 3;
    if (total <= par * 1.15) return 2;
    if (total <= par * 1.35) return 1;
    return 0;
  }
  var MEDNAME = ['NO MEDAL', 'BRONZE', 'SILVER', 'GOLD'];
  var MEDCOL = ['#7d8798', '#c1743a', '#c9d2de', '#ffc63d'];

  function eventPar() { var p = 0; for (var i = 0; i < 3; i++) p += S.tracks[i].par; return p; }
  function eventTotal() {
    var t = 0; for (var i = 0; i < 3; i++) t += (S.times[i] || 0) - S.bonus[i];
    return Math.max(0.1, t);
  }

  function finishTrack() {
    S.times[S.ti] = S.timer;
    S.bonus[S.ti] = Math.min(2.5, (bike.wheelie / 20) * 0.012);
    S.mode = 'result';
    blip(500, 900, 0.25, 0.2);
  }

  function advance(alt) {
    if (S.mode === 'result') {
      if (S.ti < 2) { S.ti++; startTrack(); }
      else {
        S.mode = 'medal';
        var tot = eventTotal();
        var key = 'e' + S.evt;
        if (!S.best[key] || tot < S.best[key]) { S.best[key] = tot; S.newBest = true; saveBest(); }
        else S.newBest = false;
        blip(320, 780, 0.4, 0.22);
      }
    } else if (S.mode === 'medal') {
      if (alt) buildEvent(S.evt); else buildEvent(S.evt + 1);
    }
  }

  // ---------------------------------------------------------------- particles
  function spawn(x, y, vx, vy, life, size, col, grav) {
    if (parts.length > 210) return;
    parts.push({ x: x, y: y, vx: vx, vy: vy, l: life, m: life, s: size, c: col, g: grav === undefined ? 900 : grav });
  }
  function stepParts(dt) {
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.l -= dt; if (p.l <= 0) { parts.splice(i, 1); continue; }
      p.vy += p.g * dt; p.vx *= 0.99;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
  }

  // nearest gentle patch at or behind x, so a remount never drops you onto a cliff
  function safeSpot(tr, x) {
    for (var d = 0; d < 1200; d += 15) {
      var q = x - d;
      if (q < 80) break;
      if (Math.abs(tr.slopeAt(q)) < 0.22 && Math.abs(tr.slopeAt(q - 34)) < 0.3 &&
        Math.abs(tr.slopeAt(q + 34)) < 0.3) return q;
    }
    return Math.max(80, x - 60);
  }

  function wheelWorld(i) {
    var ca = Math.cos(bike.a), sa = Math.sin(bike.a);
    var ox = (i === 0 ? -DR.BK.AX : DR.BK.AX);
    var oy = DR.BK.AY + DR.BK.REST - Math.min(bike.pen[i], 16);
    return { x: bike.x + ox * ca + (-sa) * oy, y: bike.y + ox * sa + ca * oy };
  }

  // ---------------------------------------------------------------- update
  function update(dt) {
    readInput();
    var tr = S.tracks[S.ti];

    if (S.mode === 'run') {
      S.timer += dt;
      var preX = bike.x;
      bike.step(dt, tr, inp, out);

      // effects from physics events
      if (out.landed === 'clean') { S.flash = 0.3; S.flashCol = '#7dff9b'; S.msg = 'CLEAN LANDING +'; S.msgT = 1.1; S.shake = Math.min(9, out.impact * 0.005); thud(0.22, 0.16, 260); }
      else if (out.landed === 'wobble') { S.flash = 0.3; S.flashCol = '#ffb03a'; S.msg = 'WOBBLE'; S.msgT = 0.9; S.shake = 11; thud(0.4, 0.3, 150); }
      else if (out.landed === 'ok') { S.shake = Math.min(6, out.impact * 0.004); thud(0.16, 0.14, 200); }

      // dust
      if (out.dust > 0 && bike.grounded[0]) {
        var w0 = wheelWorld(0);
        var mud = tr.isMud(w0.x);
        for (var d = 0; d < (bike.boosting ? 3 : 1); d++)
          spawn(w0.x - 6, w0.y + 8, -bike.vx * 0.28 + (Math.random() - 0.5) * 90, -Math.random() * 130,
            0.34 + Math.random() * 0.3, 2 + Math.random() * 3, mud ? '#5b4530' : '#9c8362', 620);
      }
      if (bike.boosting) {
        var wb = wheelWorld(0);
        spawn(wb.x - 10, wb.y - 6, -bike.vx * 0.1 - 120 - Math.random() * 90, (Math.random() - 0.5) * 60,
          0.18 + Math.random() * 0.12, 3 + Math.random() * 4, Math.random() < 0.5 ? '#ff8a2a' : '#ffd45e', -30);
      }

      // checkpoint: only on gentle, two-wheel-planted ground
      if (bike.grounded[0] && bike.grounded[1] && Math.abs(bike.a) < 0.4 &&
        Math.abs(tr.slopeAt(bike.x)) < 0.3 && bike.x > S.cp + 30) S.cp = bike.x - 20;

      if (bike.crashed) {
        S.stuck = (Math.abs(bike.x - (S.lastCrashX || -1e9)) < 340) ? Math.min(3, (S.stuck || 0) + 1) : 0;
        S.lastCrashX = bike.x;
        S.mode = 'crash'; S.crashT = 2.0; S.shake = 18; S.flash = 0.45; S.flashCol = '#ff4d4d';
        thud(0.6, 0.55, 120); blip(260, 70, 0.35, 0.18);
        for (var c = 0; c < 26; c++)
          spawn(bike.x, bike.y, (Math.random() - 0.5) * 460, -Math.random() * 380 - 40,
            0.5 + Math.random() * 0.5, 2 + Math.random() * 4, Math.random() < 0.5 ? '#d8dee9' : '#8a6d4c', 900);
      } else if (bike.x >= tr.finishX) {
        finishTrack();
      }
      engine(bike.rpm, inp.gas, bike.boosting);

    } else if (S.mode === 'crash') {
      S.crashT -= dt; S.timer += dt;
      engine(0.05, false, false);
      if (S.crashT <= 0) {
        var cx = Math.max(60, S.cp);
        bike.reset(cx, tr.heightAt(cx) - (DR.BK.AY + DR.BK.REST + DR.BK.WR) - 2, tr.slopeAt(cx));
        var wk = bike.wheelie; bike.wheelie = wk; // keep wheelie credit
        S.mode = 'run';
      }
    } else {
      engine(0.05, false, false);
    }

    stepParts(dt);
    S.shake *= Math.pow(0.0025, dt);
    S.flash = Math.max(0, S.flash - dt * 1.6);
    S.msgT = Math.max(0, S.msgT - dt);
    S.hint = Math.max(0, S.hint - dt);

    // camera
    var tx = bike.x + Math.min(180, Math.abs(bike.vx) * 0.22) * (bike.vx >= 0 ? 1 : -1);
    var ty = bike.y - 30;
    var k = 1 - Math.pow(0.0012, dt);
    S.camX += (tx - S.camX) * k;
    S.camY += (ty - S.camY) * Math.min(1, k * 0.75);

    // UI taps for panels
    if (uiTapped) {
      var p = uiTapped; uiTapped = null;
      if (S.mode === 'result') advance(0);
      else if (S.mode === 'medal') {
        if (inRect(p, UI.btnA)) advance(1);
        else if (inRect(p, UI.btnB)) advance(0);
      }
    }
  }

  // ---------------------------------------------------------------- render
  var ZOOM = 1, OX = 0, OY = 0;
  function setCam() {
    ZOOM = Math.max(0.55, Math.min(1.2, H / 430));
    OX = W * 0.34; OY = H * 0.58;
  }
  function sx(wx) { return (wx - S.camX) * ZOOM + OX; }
  function sy(wy) { return (wy - S.camY) * ZOOM + OY; }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }

  var skyGrad = null, skyKey = '';
  function render() {
    setCam();
    var tr = S.tracks[S.ti];
    ctx.save();
    var sh = S.shake;
    if (sh > 0.3) ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);

    // sky
    var key = W + 'x' + H + '|' + S.evt;
    if (skyKey !== key) {
      skyGrad = ctx.createLinearGradient(0, 0, 0, H);
      var tint = [['#1a2740', '#3c4f6b', '#7d7a68'], ['#241d38', '#4a3550', '#8a6a5c'],
      ['#12303a', '#2f5c62', '#8fa07a'], ['#2a1c22', '#5c3a35', '#a3765a']][S.evt % 4];
      skyGrad.addColorStop(0, tint[0]); skyGrad.addColorStop(0.55, tint[1]); skyGrad.addColorStop(1, tint[2]);
      skyKey = key;
    }
    ctx.fillStyle = skyGrad; ctx.fillRect(-40, -40, W + 80, H + 80);

    // sun
    ctx.globalAlpha = 0.16; ctx.fillStyle = '#ffe9b0';
    ctx.beginPath(); ctx.arc(W * 0.78, H * 0.22, 62, 0, 6.2832); ctx.fill();
    ctx.globalAlpha = 1;

    drawHills(0.14, H * 0.62, 70, 'rgba(30,42,60,0.72)', 0.0016);
    drawHills(0.3, H * 0.72, 46, 'rgba(44,56,72,0.8)', 0.0031);

    drawTerrain(tr);
    drawMarks(tr);
    drawFinish(tr);
    drawParts();
    if (!bike.crashed || S.crashT > 1.2) drawBike();
    else drawWreck();

    ctx.restore();

    if (S.flash > 0) {
      ctx.globalAlpha = S.flash * 0.35; ctx.fillStyle = S.flashCol;
      ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    }
    drawHUD(tr);
    if (S.mode === 'run' || S.mode === 'crash') drawControls();
    if (S.mode === 'result') drawResult();
    if (S.mode === 'medal') drawMedal();
  }

  function drawHills(par, base, amp, col, freq) {
    ctx.fillStyle = col; ctx.beginPath();
    var ox = S.camX * par;
    ctx.moveTo(-20, H + 20);
    for (var x = -20; x <= W + 20; x += 16) {
      var wx = (x + ox);
      var y = base - amp * (0.55 + 0.45 * Math.sin(wx * freq) * Math.cos(wx * freq * 0.43 + 1.7));
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W + 20, H + 20); ctx.closePath(); ctx.fill();
  }

  function drawTerrain(tr) {
    var DXs = tr.DX;
    var wl = S.camX - OX / ZOOM - 40, wr = S.camX + (W - OX) / ZOOM + 40;
    var i0 = Math.max(0, Math.floor(wl / DXs)), i1 = Math.min(tr.h.length - 1, Math.ceil(wr / DXs));
    ctx.beginPath();
    ctx.moveTo(sx(i0 * DXs), H + 60);
    for (var i = i0; i <= i1; i++) ctx.lineTo(sx(i * DXs), sy(tr.h[i]));
    ctx.lineTo(sx(i1 * DXs), H + 60);
    ctx.closePath();
    var gg = ctx.createLinearGradient(0, sy(tr.h[i0]) - 60, 0, H);
    gg.addColorStop(0, '#7a5f3f'); gg.addColorStop(0.18, '#5d4830'); gg.addColorStop(1, '#2c2117');
    ctx.fillStyle = gg; ctx.fill();

    // surface line
    ctx.beginPath();
    for (var j = i0; j <= i1; j++) { var X = sx(j * DXs), Y = sy(tr.h[j]); if (j === i0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y); }
    ctx.strokeStyle = '#a3855c'; ctx.lineWidth = Math.max(2, 3 * ZOOM); ctx.stroke();

    // mud overlays
    for (var m = 0; m < tr.mud.length; m++) {
      var a = tr.mud[m][0], b = tr.mud[m][1];
      if (b < wl || a > wr) continue;
      ctx.beginPath();
      var ia = Math.max(0, Math.floor(a / DXs)), ib = Math.min(tr.h.length - 1, Math.ceil(b / DXs));
      ctx.moveTo(sx(ia * DXs), sy(tr.h[ia]) + 26 * ZOOM);
      for (var q = ia; q <= ib; q++) ctx.lineTo(sx(q * DXs), sy(tr.h[q]));
      ctx.lineTo(sx(ib * DXs), sy(tr.h[ib]) + 26 * ZOOM);
      ctx.closePath();
      ctx.fillStyle = '#3a2c1c'; ctx.fill();
      ctx.strokeStyle = '#241a10'; ctx.lineWidth = 2; ctx.stroke();
    }
  }

  function drawMarks(tr) {
    var wl = S.camX - 500, wr = S.camX + 900;
    ctx.font = '700 10px system-ui,sans-serif'; ctx.textAlign = 'center';
    for (var i = 0; i < tr.marks.length; i++) {
      var mk = tr.marks[i];
      if (mk.x < wl || mk.x > wr) continue;
      var X = sx(mk.x), Y = sy(tr.heightAt(mk.x));
      var lab = mk.kind === 'jump' ? 'GAP' : mk.kind === 'table' ? 'TABLE' : mk.kind === 'mud' ? 'MUD' : 'WHOOPS';
      var col = mk.kind === 'jump' ? '#ff6b4a' : mk.kind === 'mud' ? '#8b6b3f' : '#5fc8e8';
      ctx.strokeStyle = '#2a3140'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X, Y - 46 * ZOOM); ctx.stroke();
      ctx.fillStyle = col;
      roundRect(ctx, X - 22, Y - 62 * ZOOM, 44, 15, 3); ctx.fill();
      ctx.fillStyle = '#141821'; ctx.fillText(lab, X, Y - 62 * ZOOM + 11);
    }
    ctx.textAlign = 'left';
  }

  function drawFinish(tr) {
    var X = sx(tr.finishX);
    if (X < -120 || X > W + 120) return;
    var Y = sy(tr.heightAt(tr.finishX));
    var hgt = 120 * ZOOM;
    ctx.fillStyle = '#e6ecf5';
    ctx.fillRect(X - 4, Y - hgt, 6, hgt);
    ctx.fillRect(X + 62, Y - hgt, 6, hgt);
    for (var r = 0; r < 3; r++) for (var c = 0; c < 6; c++) {
      ctx.fillStyle = ((r + c) % 2) ? '#161b24' : '#f2f6fb';
      ctx.fillRect(X - 4 + c * 12, Y - hgt + r * 10, 12, 10);
    }
  }

  function drawParts() {
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      ctx.globalAlpha = Math.max(0, Math.min(1, p.l / p.m));
      ctx.fillStyle = p.c;
      var s = p.s * ZOOM;
      ctx.fillRect(sx(p.x) - s * 0.5, sy(p.y) - s * 0.5, s, s);
    }
    ctx.globalAlpha = 1;
  }

  function drawBike() {
    var B = DR.BK;
    ctx.save();
    ctx.translate(sx(bike.x), sy(bike.y));
    ctx.scale(ZOOM, ZOOM);
    ctx.rotate(bike.a);

    // wheels + swingarm/fork
    for (var i = 0; i < 2; i++) {
      var ox = (i === 0 ? -B.AX : B.AX);
      var oy = B.AY + B.REST - Math.min(bike.pen[i], 16);
      ctx.strokeStyle = '#3b4454'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(ox * 0.45, -2); ctx.lineTo(ox, oy); ctx.stroke();
      ctx.beginPath(); ctx.arc(ox, oy, B.WR, 0, 6.2832);
      ctx.fillStyle = '#14181f'; ctx.fill();
      ctx.strokeStyle = '#2f3846'; ctx.lineWidth = 3; ctx.stroke();
      // spokes spin
      var sp = bike.x * 0.06 + (i * 1.1);
      ctx.strokeStyle = '#66738a'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (var k = 0; k < 3; k++) {
        var an = sp + k * 1.047;
        ctx.moveTo(ox + Math.cos(an) * 3, oy + Math.sin(an) * 3);
        ctx.lineTo(ox + Math.cos(an) * (B.WR - 3), oy + Math.sin(an) * (B.WR - 3));
      }
      ctx.stroke();
    }

    // chassis
    ctx.fillStyle = bike.boosting ? '#ff9a3c' : '#e04a2f';
    ctx.beginPath();
    ctx.moveTo(-24, 2); ctx.lineTo(-12, -10); ctx.lineTo(14, -12); ctx.lineTo(26, -2);
    ctx.lineTo(18, 6); ctx.lineTo(-14, 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#2a3140';
    ctx.fillRect(-22, -14, 16, 6);           // seat
    ctx.fillRect(16, -18, 5, 8);             // bar riser

    // rider
    var ln = inp.lean;
    var hx = 2 - ln * 7, hy = -34 + Math.abs(ln) * 2;
    ctx.strokeStyle = '#2f6fb5'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-14, -12); ctx.lineTo(-4, -22); ctx.lineTo(hx, hy + 8); ctx.stroke();  // legs/torso
    ctx.beginPath(); ctx.moveTo(hx, hy + 8); ctx.lineTo(18, -14); ctx.stroke();                        // arms
    ctx.fillStyle = '#f0f4fa';
    ctx.beginPath(); ctx.arc(hx, hy, 7, 0, 6.2832); ctx.fill();
    ctx.fillStyle = '#e04a2f';
    ctx.beginPath(); ctx.arc(hx + 3, hy + 1, 4, 0, 6.2832); ctx.fill();

    ctx.restore();

    // wheelie glow
    if (bike.grounded[0] && !bike.grounded[1] && bike.a < -0.22) {
      var w0 = wheelWorld(0);
      ctx.globalAlpha = 0.5; ctx.strokeStyle = '#ffd45e'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx(w0.x), sy(w0.y), 20 * ZOOM, 0, 6.2832); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function drawWreck() {
    ctx.save();
    ctx.translate(sx(bike.x), sy(bike.y)); ctx.scale(ZOOM, ZOOM); ctx.rotate(bike.a + 0.6);
    ctx.fillStyle = '#8a3a28';
    ctx.fillRect(-22, -6, 44, 12);
    ctx.fillStyle = '#14181f';
    ctx.beginPath(); ctx.arc(-26, 8, 12, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.arc(24, 6, 12, 0, 6.2832); ctx.fill();
    ctx.restore();
  }

  // ---------------------------------------------------------------- HUD
  function fmt(t) {
    if (t == null) return '--.--';
    return (t < 10 ? '0' : '') + t.toFixed(2);
  }
  function panel(x, y, w, h, a) {
    ctx.fillStyle = 'rgba(14,18,26,' + (a || 0.62) + ')';
    roundRect(ctx, x, y, w, h, 8); ctx.fill();
  }

  function drawHUD(tr) {
    ctx.textAlign = 'left';
    panel(10, 10, 168, 54);
    ctx.fillStyle = '#8fa0b8'; ctx.font = '700 11px system-ui,sans-serif';
    ctx.fillText('EVENT ' + (S.evt + 1) + '  ·  TRACK ' + (S.ti + 1) + '/3', 20, 27);
    ctx.fillStyle = '#f2f6fb'; ctx.font = '700 26px system-ui,sans-serif';
    ctx.fillText(fmt(S.timer), 20, 55);

    // progress bar
    var pw = Math.min(230, W * 0.3);
    var px = W * 0.5 - pw * 0.5;
    panel(px - 6, 12, pw + 12, 20);
    ctx.fillStyle = '#2b3444'; roundRect(ctx, px, 18, pw, 8, 4); ctx.fill();
    var pr = Math.max(0, Math.min(1, bike.x / tr.finishX));
    ctx.fillStyle = '#ffb03a'; roundRect(ctx, px, 18, Math.max(4, pw * pr), 8, 4); ctx.fill();
    ctx.fillStyle = '#e6ecf5';
    ctx.beginPath(); ctx.arc(px + pw * pr, 22, 4.5, 0, 6.2832); ctx.fill();

    // best
    var bk = S.best['e' + S.evt];
    ctx.textAlign = 'right';
    ctx.fillStyle = '#8fa0b8'; ctx.font = '700 11px system-ui,sans-serif';
    ctx.fillText(bk ? 'BEST EVENT ' + fmt(bk) : 'NO BEST YET', W - 14, 26);
    ctx.fillStyle = '#cfd9e6'; ctx.font = '700 13px system-ui,sans-serif';
    ctx.fillText(Math.round(Math.abs(bike.vx) * 0.11) + ' km/h', W - 14, 44);
    ctx.textAlign = 'left';

    // wheelie meter
    var wm = bike.wheelie / 20;
    if (wm > 0.5) {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffd45e'; ctx.font = '700 12px system-ui,sans-serif';
      ctx.fillText('WHEELIE ' + wm.toFixed(0) + ' m', 20, 82);
    }

    // messages
    if (S.msgT > 0 && S.mode === 'run') {
      ctx.textAlign = 'center';
      ctx.globalAlpha = Math.min(1, S.msgT * 2);
      ctx.fillStyle = S.msg.indexOf('CLEAN') >= 0 ? '#7dff9b' : '#ffb03a';
      ctx.font = '800 20px system-ui,sans-serif';
      ctx.fillText(S.msg, W * 0.5, H * 0.3);
      ctx.globalAlpha = 1; ctx.textAlign = 'left';
    }

    if (S.mode === 'crash') {
      ctx.textAlign = 'center';
      panel(W * 0.5 - 110, H * 0.36, 220, 62, 0.78);
      ctx.fillStyle = '#ff6b5a'; ctx.font = '800 22px system-ui,sans-serif';
      ctx.fillText('CRASH', W * 0.5, H * 0.36 + 28);
      ctx.fillStyle = '#cfd9e6'; ctx.font = '700 13px system-ui,sans-serif';
      ctx.fillText('remount ' + S.crashT.toFixed(1) + 's', W * 0.5, H * 0.36 + 50);
      ctx.textAlign = 'left';
    }

    if (S.hint > 0 && S.mode === 'run' && S.ti === 0) {
      ctx.globalAlpha = Math.min(1, S.hint / 1.5);
      ctx.textAlign = 'center';
      panel(W * 0.5 - 190, H - 44, 380, 30, 0.7);
      ctx.fillStyle = '#e6ecf5'; ctx.font = '700 13px system-ui,sans-serif';
      ctx.fillText('HOLD GAS · DRAG LEFT SIDE UP/DOWN TO LEAN · LAND FLAT', W * 0.5, H - 24);
      ctx.textAlign = 'left'; ctx.globalAlpha = 1;
    }
  }

  function ring(c, x, y, r, frac, col, bg) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.strokeStyle = bg; ctx.lineWidth = 5; ctx.stroke();
    if (frac > 0.001) {
      ctx.beginPath(); ctx.arc(x, y, r, -1.5708, -1.5708 + 6.2832 * frac);
      ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.stroke();
    }
  }

  function drawControls() {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // gas
    var b = UI.gas;
    ctx.globalAlpha = inp.gas ? 0.92 : 0.55;
    ctx.fillStyle = inp.gas ? '#3fd07a' : '#20303f';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 6.2832); ctx.fill();
    ctx.strokeStyle = '#6ff0a6'; ctx.lineWidth = 3; ctx.stroke();
    ctx.globalAlpha = 1; ctx.fillStyle = '#eafff2'; ctx.font = '800 15px system-ui,sans-serif';
    ctx.fillText('GAS', b.x, b.y);

    // boost + heat ring
    b = UI.boost;
    var lockd = bike.lock;
    ctx.globalAlpha = bike.boosting ? 0.95 : 0.55;
    ctx.fillStyle = lockd ? '#54303a' : (bike.boosting ? '#ff8a2a' : '#2c2434');
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 6.2832); ctx.fill();
    ctx.globalAlpha = 1;
    ring(ctx, b.x, b.y, b.r + 5, bike.heat, lockd ? '#ff4d4d' : (bike.heat > 0.75 ? '#ffb03a' : '#5fc8e8'), 'rgba(255,255,255,0.12)');
    ctx.fillStyle = lockd ? '#ffb3b3' : '#ffe9c8'; ctx.font = '800 12px system-ui,sans-serif';
    ctx.fillText(lockd ? 'HOT' : 'BOOST', b.x, b.y);

    // brake
    b = UI.brake;
    ctx.globalAlpha = inp.brake ? 0.9 : 0.5;
    ctx.fillStyle = inp.brake ? '#e04a2f' : '#20303f';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 6.2832); ctx.fill();
    ctx.strokeStyle = '#ff8a72'; ctx.lineWidth = 3; ctx.stroke();
    ctx.globalAlpha = 1; ctx.fillStyle = '#ffeae5'; ctx.font = '800 14px system-ui,sans-serif';
    ctx.fillText('BRAKE', b.x, b.y);

    // lean indicator
    var lx = 26, ly = H * 0.42, lh = 72;
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#1a2331'; roundRect(ctx, lx - 9, ly - lh * 0.5, 18, lh, 9); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = inp.lean > 0 ? '#ffd45e' : (inp.lean < 0 ? '#5fc8e8' : '#5a6a80');
    ctx.beginPath(); ctx.arc(lx, ly - inp.lean * lh * 0.42, 7, 0, 6.2832); ctx.fill();
    ctx.globalAlpha = 0.55; ctx.fillStyle = '#8fa0b8'; ctx.font = '700 9px system-ui,sans-serif';
    ctx.fillText('BACK', lx, ly - lh * 0.5 - 10);
    ctx.fillText('FWD', lx, ly + lh * 0.5 + 10);
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  }

  function drawResult() {
    ctx.fillStyle = 'rgba(8,11,17,0.72)'; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    var y = H * 0.26;
    panel(W * 0.5 - 170, y - 40, 340, 170, 0.9);
    ctx.fillStyle = '#ffb03a'; ctx.font = '800 22px system-ui,sans-serif';
    ctx.fillText('TRACK ' + (S.ti + 1) + ' DONE', W * 0.5, y - 10);
    ctx.fillStyle = '#f2f6fb'; ctx.font = '800 40px system-ui,sans-serif';
    ctx.fillText(fmt(S.times[S.ti]), W * 0.5, y + 34);
    ctx.fillStyle = '#7dff9b'; ctx.font = '700 13px system-ui,sans-serif';
    ctx.fillText('wheelie bonus  -' + S.bonus[S.ti].toFixed(2) + 's   (' + (bike.wheelie / 20).toFixed(0) + ' m)', W * 0.5, y + 58);
    ctx.fillStyle = '#8fa0b8'; ctx.font = '700 12px system-ui,sans-serif';
    ctx.fillText('par ' + S.tracks[S.ti].par.toFixed(2) + 's', W * 0.5, y + 78);
    ctx.fillStyle = '#e6ecf5'; ctx.font = '800 15px system-ui,sans-serif';
    ctx.fillText(S.ti < 2 ? 'TAP TO START TRACK ' + (S.ti + 2) : 'TAP FOR RESULTS', W * 0.5, y + 108);
    ctx.textAlign = 'left';
  }

  function drawMedal() {
    ctx.fillStyle = 'rgba(8,11,17,0.82)'; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    var tot = eventTotal(), par = eventPar(), m = medalFor(tot, par);
    var top = Math.max(14, H * 0.06);
    panel(W * 0.5 - 200, top, 400, H * 0.62, 0.9);
    ctx.fillStyle = MEDCOL[m]; ctx.font = '800 26px system-ui,sans-serif';
    ctx.fillText(MEDNAME[m], W * 0.5, top + 34);
    ctx.fillStyle = '#8fa0b8'; ctx.font = '700 11px system-ui,sans-serif';
    ctx.fillText('EVENT ' + (S.evt + 1) + ' COMPLETE', W * 0.5, top + 52);

    var ry = top + 76;
    ctx.font = '700 13px system-ui,sans-serif';
    for (var i = 0; i < 3; i++) {
      ctx.fillStyle = '#8fa0b8'; ctx.textAlign = 'left';
      ctx.fillText('TRACK ' + (i + 1), W * 0.5 - 150, ry + i * 20);
      ctx.fillStyle = '#e6ecf5'; ctx.textAlign = 'right';
      ctx.fillText(fmt(S.times[i]) + '  (-' + S.bonus[i].toFixed(2) + ')', W * 0.5 + 150, ry + i * 20);
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f2f6fb'; ctx.font = '800 30px system-ui,sans-serif';
    ctx.fillText('TOTAL ' + fmt(tot), W * 0.5, ry + 84);
    ctx.fillStyle = S.newBest ? '#7dff9b' : '#8fa0b8'; ctx.font = '700 12px system-ui,sans-serif';
    ctx.fillText(S.newBest ? 'NEW BEST!' : 'best ' + fmt(S.best['e' + S.evt]) + '   ·   gold ' + fmt(par), W * 0.5, ry + 104);

    UI.btnA.y = Math.min(H - 60, ry + 122); UI.btnB.y = UI.btnA.y;
    button(UI.btnA, 'RETRY', '#e04a2f');
    button(UI.btnB, 'NEXT EVENT', '#3fd07a');
    ctx.textAlign = 'left';
  }

  function button(b, label, col) {
    ctx.fillStyle = col; roundRect(ctx, b.x, b.y, b.w, b.h, 9); ctx.fill();
    ctx.fillStyle = '#0d1016'; ctx.font = '800 15px system-ui,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, b.x + b.w * 0.5, b.y + b.h * 0.5);
    ctx.textBaseline = 'alphabetic';
  }

  // ---------------------------------------------------------------- loop
  var last = 0;
  function frame(ts) {
    if (!last) last = ts;
    var dt = (ts - last) / 1000; last = ts;
    if (dt > 0.05) dt = 0.05;
    if (!portrait && dt > 0) update(dt);
    render();
    requestAnimationFrame(frame);
  }

  resize();
  buildEvent(0);
  requestAnimationFrame(frame);
})(window);
