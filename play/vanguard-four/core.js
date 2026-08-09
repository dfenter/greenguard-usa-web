/* Vanguard Four - core utilities: math, particles, audio, input */
(function (root) {
  'use strict';
  var V = {};
  root.V = V;

  /* ---------- math ---------- */
  V.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  V.lerp = function (a, b, t) { return a + (b - a) * t; };
  V.rand = function (a, b) { return a + Math.random() * (b - a); };
  V.randi = function (a, b) { return Math.floor(a + Math.random() * (b - a)); };
  V.pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
  V.dist2 = function (a, b) { var dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; };
  V.dist = function (a, b) { return Math.sqrt(V.dist2(a, b)); };
  V.angTo = function (a, b) { return Math.atan2(b.y - a.y, b.x - a.x); };
  V.angDiff = function (a, b) {
    var d = (a - b) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  };

  /* ---------- particles ---------- */
  var PMAX = 320;
  V.parts = [];
  V.burst = function (x, y, n, col, spd, life, size) {
    spd = spd || 120; life = life || 0.45; size = size || 3;
    for (var i = 0; i < n; i++) {
      if (V.parts.length >= PMAX) break;
      var a = Math.random() * Math.PI * 2, s = spd * (0.35 + Math.random() * 0.9);
      V.parts.push({
        x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: life * (0.6 + Math.random() * 0.7), max: life, col: col,
        r: size * (0.6 + Math.random() * 0.8), ring: 0
      });
    }
  };
  V.ring = function (x, y, r, col, life) {
    if (V.parts.length >= PMAX) return;
    V.parts.push({ x: x, y: y, vx: 0, vy: 0, life: life || 0.35, max: life || 0.35, col: col, r: r, ring: 1 });
  };
  V.updateParts = function (dt) {
    for (var i = V.parts.length - 1; i >= 0; i--) {
      var p = V.parts[i];
      p.life -= dt;
      if (p.life <= 0) { V.parts.splice(i, 1); continue; }
      if (!p.ring) {
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vx *= 0.90; p.vy *= 0.90;
      }
    }
  };
  V.drawParts = function (c) {
    for (var i = 0; i < V.parts.length; i++) {
      var p = V.parts[i], k = V.clamp(p.life / p.max, 0, 1);
      c.globalAlpha = k;
      if (p.ring) {
        c.strokeStyle = p.col; c.lineWidth = 2 + 3 * k;
        c.beginPath(); c.arc(p.x, p.y, p.r * (1.35 - 0.35 * k), 0, 6.2832); c.stroke();
      } else {
        c.fillStyle = p.col;
        c.beginPath(); c.arc(p.x, p.y, p.r * k, 0, 6.2832); c.fill();
      }
    }
    c.globalAlpha = 1;
  };

  /* ---------- screen shake ---------- */
  V.shakeAmt = 0;
  V.shake = function (a) { V.shakeAmt = Math.min(18, V.shakeAmt + a); };

  /* ---------- audio (WebAudio synth only) ---------- */
  var actx = null, muted = false;
  V.initAudio = function () {
    if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
    try {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (AC) actx = new AC();
    } catch (e) { actx = null; }
  };
  V.toggleMute = function () { muted = !muted; return muted; };
  V.isMuted = function () { return muted; };
  function tone(freq, freq2, dur, type, vol) {
    if (!actx || muted) return;
    var t = actx.currentTime;
    var o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (freq2) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq2), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.12, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(actx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, hp) {
    if (!actx || muted) return;
    var n = Math.floor(actx.sampleRate * dur);
    var buf = actx.createBuffer(1, n, actx.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var s = actx.createBufferSource(); s.buffer = buf;
    var g = actx.createGain(); g.gain.value = vol || 0.14;
    var f = actx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp || 400;
    s.connect(f); f.connect(g); g.connect(actx.destination); s.start();
  }
  V.sfx = function (k) {
    if (!actx || muted) return;
    switch (k) {
      case 'slash': tone(680, 300, 0.09, 'sawtooth', 0.08); break;
      case 'heavy': tone(160, 60, 0.20, 'square', 0.14); noise(0.12, 0.10, 200); break;
      case 'shot': tone(880, 620, 0.07, 'triangle', 0.07); break;
      case 'zap': tone(1400, 500, 0.08, 'sawtooth', 0.07); break;
      case 'hit': tone(240, 150, 0.06, 'square', 0.06); break;
      case 'kill': tone(320, 90, 0.16, 'square', 0.10); noise(0.10, 0.08, 300); break;
      case 'down': tone(220, 70, 0.45, 'sine', 0.14); break;
      case 'revive': tone(420, 880, 0.28, 'triangle', 0.11); break;
      case 'super': tone(180, 1200, 0.5, 'sawtooth', 0.13); noise(0.4, 0.09, 250); break;
      case 'swap': tone(600, 900, 0.09, 'triangle', 0.08); break;
      case 'clear': tone(520, 780, 0.14, 'triangle', 0.10); setTimeout(function () { tone(780, 1040, 0.22, 'triangle', 0.10); }, 110); break;
      case 'over': tone(300, 60, 0.8, 'sawtooth', 0.14); break;
      case 'boss': tone(90, 50, 0.9, 'square', 0.16); break;
    }
  };

  /* ---------- input ---------- */
  var IN = {
    keys: {},
    mx: 0, my: 0,
    stick: { on: false, id: null, ox: 0, oy: 0, x: 0, y: 0, dx: 0, dy: 0, mag: 0 },
    strike: false, superBtn: false,
    superEdge: false, swapReq: -1, anyTap: false, pausePress: false
  };
  V.in = IN;
  V.layout = { W: 390, H: 700, strike: { x: 0, y: 0, r: 46 }, sup: { x: 0, y: 0, r: 34 }, ports: [] };

  var pointers = {};

  function hitCircle(p, x, y) { var dx = x - p.x, dy = y - p.y; return dx * dx + dy * dy <= p.r * p.r; }

  function onDown(id, x, y) {
    V.initAudio();
    IN.anyTap = true;
    var L = V.layout;
    if (hitCircle(L.strike, x, y)) { pointers[id] = 'strike'; IN.strike = true; return; }
    if (hitCircle(L.sup, x, y)) { pointers[id] = 'super'; IN.superBtn = true; IN.superEdge = true; return; }
    for (var i = 0; i < L.ports.length; i++) {
      var p = L.ports[i];
      if (x >= p.x - 6 && x <= p.x + p.w + 6 && y >= p.y - 6 && y <= p.y + p.h + 10) {
        pointers[id] = 'ui'; IN.swapReq = i; return;
      }
    }
    if (L.mute && x >= L.mute.x && x <= L.mute.x + L.mute.w && y >= L.mute.y && y <= L.mute.y + L.mute.h) {
      pointers[id] = 'ui'; V.toggleMute(); return;
    }
    if (!IN.stick.on) {
      pointers[id] = 'stick';
      IN.stick.on = true; IN.stick.id = id;
      IN.stick.ox = x; IN.stick.oy = y; IN.stick.x = x; IN.stick.y = y;
      IN.stick.dx = 0; IN.stick.dy = 0; IN.stick.mag = 0;
      return;
    }
    pointers[id] = 'ui';
  }
  function onMove(id, x, y) {
    var r = pointers[id];
    if (r === 'stick' && IN.stick.id === id) {
      IN.stick.x = x; IN.stick.y = y;
      var dx = x - IN.stick.ox, dy = y - IN.stick.oy;
      var m = Math.sqrt(dx * dx + dy * dy), MAXR = 52;
      if (m > MAXR) { // drag the base along
        IN.stick.ox += dx * (1 - MAXR / m);
        IN.stick.oy += dy * (1 - MAXR / m);
        dx = x - IN.stick.ox; dy = y - IN.stick.oy; m = MAXR;
      }
      IN.stick.mag = V.clamp(m / MAXR, 0, 1);
      if (m > 0.001) { IN.stick.dx = dx / (m || 1); IN.stick.dy = dy / (m || 1); }
      if (m < 6) { IN.stick.mag = 0; }
    }
  }
  function onUp(id) {
    var r = pointers[id];
    delete pointers[id];
    if (r === 'strike') { IN.strike = false; for (var k in pointers) if (pointers[k] === 'strike') { IN.strike = true; break; } }
    else if (r === 'super') { IN.superBtn = false; for (var j in pointers) if (pointers[j] === 'super') { IN.superBtn = true; break; } }
    else if (r === 'stick') {
      IN.stick.on = false; IN.stick.id = null; IN.stick.mag = 0; IN.stick.dx = 0; IN.stick.dy = 0;
    }
  }

  V.resetInput = function () { IN.keys = {}; IN.strike = false; IN.superBtn = false; IN.superEdge = false; IN.swapReq = -1; IN.anyTap = false; IN.pausePress = false; pointers = {}; IN.stick.on = false; IN.stick.id = null; IN.stick.ox = 0; IN.stick.oy = 0; IN.stick.x = 0; IN.stick.y = 0; IN.stick.mag = 0; IN.stick.dx = 0; IN.stick.dy = 0; };

  V.bindInput = function (canvas) {
    function rel(e) {
      var r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    canvas.addEventListener('touchstart', function (e) {
      e.preventDefault();
      var r = canvas.getBoundingClientRect();
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        onDown(t.identifier, t.clientX - r.left, t.clientY - r.top);
      }
    }, { passive: false });
    canvas.addEventListener('touchmove', function (e) {
      e.preventDefault();
      var r = canvas.getBoundingClientRect();
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        onMove(t.identifier, t.clientX - r.left, t.clientY - r.top);
      }
    }, { passive: false });
    function end(e) {
      e.preventDefault();
      for (var i = 0; i < e.changedTouches.length; i++) onUp(e.changedTouches[i].identifier);
    }
    canvas.addEventListener('touchend', end, { passive: false });
    canvas.addEventListener('touchcancel', end, { passive: false });

    var mouseDown = false;
    canvas.addEventListener('mousedown', function (e) { e.preventDefault(); mouseDown = true; var p = rel(e); onDown('m', p.x, p.y); });
    root.addEventListener('mousemove', function (e) { if (!mouseDown) return; var p = rel(e); onMove('m', p.x, p.y); });
    root.addEventListener('mouseup', function () { if (mouseDown) { mouseDown = false; onUp('m'); } });

    root.addEventListener('keydown', function (e) {
      V.initAudio();
      var k = e.key.toLowerCase();
      if (!IN.keys[k]) {
        if (k === 'k' || k === 'shift') IN.superEdge = true;
        if (k >= '1' && k <= '4') IN.swapReq = parseInt(k, 10) - 1;
        if (k === 'm') V.toggleMute();
        if (k === 'p') IN.pausePress = true;
        IN.anyTap = true;
      }
      IN.keys[k] = true;
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].indexOf(k) >= 0) e.preventDefault();
    });
    root.addEventListener('keyup', function (e) { IN.keys[e.key.toLowerCase()] = false; });
    root.addEventListener('blur', function () { V.resetInput(); });
  };

  /* keyboard-merged movement vector */
  V.moveVec = function () {
    var k = IN.keys, dx = 0, dy = 0;
    if (k['a'] || k['arrowleft']) dx -= 1;
    if (k['d'] || k['arrowright']) dx += 1;
    if (k['w'] || k['arrowup']) dy -= 1;
    if (k['s'] || k['arrowdown']) dy += 1;
    if (dx || dy) {
      var m = Math.sqrt(dx * dx + dy * dy);
      return { x: dx / m, y: dy / m, mag: 1 };
    }
    if (IN.stick.mag > 0.05) return { x: IN.stick.dx, y: IN.stick.dy, mag: IN.stick.mag };
    return { x: 0, y: 0, mag: 0 };
  };
  V.strikeHeld = function () { return IN.strike || !!IN.keys['j'] || !!IN.keys[' ']; };
  V.takeSuper = function () { var s = IN.superEdge; IN.superEdge = false; return s; };
  V.takeSwap = function () { var s = IN.swapReq; IN.swapReq = -1; return s; };
  V.takeTap = function () { var s = IN.anyTap; IN.anyTap = false; return s; };
})(window);
