/* Mythweave - core: canvas, input, audio, fx, storage */
var M = {};
(function () {
  M.W = 390; M.H = 700;
  M.cv = null; M.ctx = null;
  M.s = 1; M.ox = 0; M.oy = 0; M.bw = 0; M.bh = 0;
  M.paused = false;
  M.hidden = !!document.hidden;
  M.keyq = [];
  M.keys = Object.create(null);
  M.pointers = Object.create(null);
  M.hits = []; M.lastHits = [];
  M.clicks = [];
  M.particles = []; M.floaters = [];
  M.shake = 0; M.flash = 0; M.flashCol = '#fff';
  M.timers = [];
  var PCAP = 220, FCAP = 26, TCAP = 40;

  /* ---------- canvas ---------- */
  M.resize = function () {
    var cw = window.innerWidth, ch = window.innerHeight;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var bw = Math.round(cw * dpr), bh = Math.round(ch * dpr);
    var long = Math.max(bw, bh);
    if (long > 960) { var k = 960 / long; bw = Math.round(bw * k); bh = Math.round(bh * k); }
    bw = Math.max(1, bw); bh = Math.max(1, bh);
    if (M.cv.width !== bw) M.cv.width = bw;
    if (M.cv.height !== bh) M.cv.height = bh;
    M.bw = bw; M.bh = bh;
    M.s = Math.min(bw / M.W, bh / M.H);
    M.ox = (bw - M.W * M.s) / 2;
    M.oy = (bh - M.H * M.s) / 2;
    M.landscape = cw > ch * 1.08;
    var rot = document.getElementById('rot');
    if (M.landscape && M.started) { rot.classList.add('on'); } else { rot.classList.remove('on'); }
    M.paused = !!(M.hidden || (M.landscape && M.started));
    if (M.paused) M.releaseAll();
  };

  /* ---------- input ---------- */
  function toLocal(e) {
    var r = M.cv.getBoundingClientRect();
    var px = (e.clientX - r.left) * (M.bw / Math.max(1, r.width));
    var py = (e.clientY - r.top) * (M.bh / Math.max(1, r.height));
    return { x: (px - M.ox) / M.s, y: (py - M.oy) / M.s };
  }
  M.hit = function (x, y, w, h, id) { M.hits.push({ x: x, y: y, w: w, h: h, id: id }); };
  M.findHit = function (x, y) {
    for (var i = M.lastHits.length - 1; i >= 0; i--) {
      var b = M.lastHits[i];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.id;
    }
    return null;
  };
  M.isDown = function (id) {
    for (var k in M.pointers) if (M.pointers[k].btn === id) return true;
    return false;
  };
  M.beginFrame = function () { M.hits = []; };
  M.endFrame = function () { M.lastHits = M.hits; };
  M.takeClicks = function () { var c = M.clicks; M.clicks = []; return c; };
  M.takeKeys = function () { var k = M.keyq; M.keyq = []; return k; };
  M.releaseAll = function () {
    for (var k in M.pointers) delete M.pointers[k];
    for (var q in M.keys) delete M.keys[q];
    M.keyq.length = 0; M.clicks.length = 0;
  };

  function down(e) {
    e.preventDefault();
    if (M.paused) return;
    var p = toLocal(e);
    var id = M.findHit(p.x, p.y);
    M.pointers[e.pointerId] = { x: p.x, y: p.y, btn: id };
    if (id) M.sfx('tick');
  }
  function move(e) {
    var p = M.pointers[e.pointerId]; if (!p) return;
    e.preventDefault();
    var q = toLocal(e); p.x = q.x; p.y = q.y;
    if (p.btn && M.findHit(q.x, q.y) !== p.btn) p.btn = null;
  }
  function up(e) {
    var p = M.pointers[e.pointerId];
    delete M.pointers[e.pointerId];
    if (!p) return;
    e.preventDefault();
    if (M.paused) return;
    var q = toLocal(e);
    if (p.btn && M.findHit(q.x, q.y) === p.btn) M.clicks.push(p.btn);
  }
  function cancel(e) { delete M.pointers[e.pointerId]; }

  M.initInput = function () {
    var w = document.getElementById('wrap');
    w.addEventListener('pointerdown', down, { passive: false });
    w.addEventListener('pointermove', move, { passive: false });
    w.addEventListener('pointerup', up, { passive: false });
    w.addEventListener('pointercancel', cancel, { passive: false });
    w.addEventListener('pointerleave', cancel, { passive: false });
    w.addEventListener('touchstart', function (e) { e.preventDefault(); }, { passive: false });
    w.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
    w.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    window.addEventListener('blur', M.releaseAll);
    document.addEventListener('visibilitychange', function () {
      M.hidden = document.hidden;
      M.paused = !!(M.hidden || (M.landscape && M.started));
      M.releaseAll();
    });
    window.addEventListener('keydown', function (e) {
      if (M.paused) return;
      if (M.keys[e.key]) return;
      M.keys[e.key] = 1;
      if (M.keyq.length < 12) M.keyq.push(e.key);
      if ([' ', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].indexOf(e.key) >= 0) e.preventDefault();
    });
    window.addEventListener('keyup', function (e) { delete M.keys[e.key]; });
    window.addEventListener('resize', M.resize);
    window.addEventListener('orientationchange', function () { setTimeout(M.resize, 60); });
  };

  /* ---------- timers (sim-time, pausable) ---------- */
  M.after = function (t, fn) {
    if (M.timers.length >= TCAP) M.timers.shift();
    M.timers.push({ t: t, fn: fn });
  };
  M.clearTimers = function () { M.timers.length = 0; if (M.stopSfx) M.stopSfx(); };
  M.busy = function () { return M.timers.length > 0; };
  function tickTimers(dt) {
    for (var i = M.timers.length - 1; i >= 0; i--) {
      var t = M.timers[i];
      t.t -= dt;
      if (t.t <= 0) { M.timers.splice(i, 1); try { t.fn(); } catch (e) { } }
    }
  }

  /* ---------- fx ---------- */
  M.burst = function (x, y, n, col, spd, life) {
    spd = spd || 130; life = life || 0.5;
    for (var i = 0; i < n; i++) {
      if (M.particles.length >= PCAP) M.particles.shift();
      var a = Math.random() * Math.PI * 2, v = spd * (0.3 + Math.random());
      M.particles.push({
        x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        l: life * (0.6 + Math.random() * 0.7), L: life, c: col, r: 2 + Math.random() * 2.5
      });
    }
  };
  M.float = function (x, y, txt, col) {
    if (M.floaters.length >= FCAP) M.floaters.shift();
    M.floaters.push({ x: x, y: y, t: txt, c: col || '#fff', l: 0.95 });
  };
  M.kick = function (v, col) { M.shake = Math.min(14, M.shake + v); if (col) { M.flash = 0.16; M.flashCol = col; } };
  M.clearFx = function () { M.particles.length = 0; M.floaters.length = 0; M.shake = 0; M.flash = 0; };

  function fx(dt) {
    var i, p;
    for (i = M.particles.length - 1; i >= 0; i--) {
      p = M.particles[i]; p.l -= dt;
      if (p.l <= 0) { M.particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 210 * dt; p.vx *= 0.96;
    }
    for (i = M.floaters.length - 1; i >= 0; i--) {
      p = M.floaters[i]; p.l -= dt;
      if (p.l <= 0) { M.floaters.splice(i, 1); continue; }
      p.y -= 34 * dt;
    }
    if (M.shake > 0) M.shake = Math.max(0, M.shake - dt * 34);
    if (M.flash > 0) M.flash = Math.max(0, M.flash - dt);
  }
  M.drawFx = function (c) {
    var i, p;
    for (i = 0; i < M.particles.length; i++) {
      p = M.particles[i];
      c.globalAlpha = Math.max(0, Math.min(1, p.l / p.L));
      c.fillStyle = p.c;
      c.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
    }
    c.globalAlpha = 1;
    c.textAlign = 'center';
    for (i = 0; i < M.floaters.length; i++) {
      p = M.floaters[i];
      c.globalAlpha = Math.max(0, Math.min(1, p.l / 0.6));
      c.font = 'bold 19px system-ui,sans-serif';
      c.fillStyle = '#000'; c.fillText(p.t, p.x + 1.5, p.y + 1.5);
      c.fillStyle = p.c; c.fillText(p.t, p.x, p.y);
    }
    c.globalAlpha = 1;
  };

  /* ---------- audio ---------- */
  var AC = null, master = null;
  M.audioOn = function () {
    try {
      if (!AC) {
        var C = window.AudioContext || window.webkitAudioContext;
        if (!C) return;
        AC = new C();
        master = AC.createGain(); master.gain.value = 0.28; master.connect(AC.destination);
      }
      if (AC.state === 'suspended') AC.resume();
    } catch (e) { AC = null; }
  };
  function tone(f, d, type, g, slide) {
    if (!AC) return;
    try {
      var o = AC.createOscillator(), gn = AC.createGain(), t = AC.currentTime;
      o.type = type || 'square'; o.frequency.setValueAtTime(f, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t + d);
      gn.gain.setValueAtTime(0.0001, t);
      gn.gain.exponentialRampToValueAtTime(g || 0.3, t + 0.012);
      gn.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(gn); gn.connect(master); o.start(t); o.stop(t + d + 0.02);
    } catch (e) { }
  }
  function noise(d, g, hp) {
    if (!AC) return;
    try {
      var n = Math.floor(AC.sampleRate * d), b = AC.createBuffer(1, n, AC.sampleRate), ch = b.getChannelData(0);
      for (var i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n);
      var src = AC.createBufferSource(); src.buffer = b;
      var f = AC.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp || 400;
      var gn = AC.createGain(); gn.gain.value = g || 0.25;
      src.connect(f); f.connect(gn); gn.connect(master); src.start();
    } catch (e) { }
  }
  var sfxT = [];
  function later(f, ms) {
    if (sfxT.length > 24) M.stopSfx();
    sfxT.push(setTimeout(function () { f(); }, ms));
  }
  M.stopSfx = function () {
    for (var i = 0; i < sfxT.length; i++) clearTimeout(sfxT[i]);
    sfxT.length = 0;
  };
  M.sfx = function (k) {
    if (!AC) return;
    switch (k) {
      case 'tick': tone(520, 0.05, 'square', 0.12); break;
      case 'pick': tone(660, 0.07, 'triangle', 0.2); break;
      case 'unpick': tone(330, 0.06, 'triangle', 0.15); break;
      case 'hit': noise(0.16, 0.3, 700); tone(180, 0.1, 'square', 0.2, 70); break;
      case 'big': noise(0.3, 0.4, 300); tone(120, 0.35, 'sawtooth', 0.28, 45); break;
      case 'ult': tone(330, 0.5, 'sawtooth', 0.25, 990); noise(0.4, 0.3, 900); break;
      case 'block': tone(300, 0.12, 'sine', 0.22, 460); break;
      case 'heal': tone(520, 0.18, 'sine', 0.2, 880); break;
      case 'hurt': noise(0.2, 0.35, 200); tone(150, 0.18, 'sawtooth', 0.22, 60); break;
      case 'win': [523, 659, 784, 1046].forEach(function (f, i) { later(function () { tone(f, 0.22, 'triangle', 0.24); }, i * 105); }); break;
      case 'lose': [392, 330, 262, 196].forEach(function (f, i) { later(function () { tone(f, 0.26, 'sawtooth', 0.2); }, i * 130); }); break;
      case 'join': [440, 587, 880].forEach(function (f, i) { later(function () { tone(f, 0.3, 'sine', 0.24); }, i * 130); }); break;
    }
  };

  /* ---------- storage ---------- */
  var KEY = 'mythweave.v1';
  function int(v, lo, hi, d) {
    v = (typeof v === 'number' && isFinite(v)) ? Math.floor(v) : d;
    if (v < lo) v = lo; if (v > hi) v = hi;
    return v;
  }
  M.load = function () {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw || typeof raw !== 'string') return null;
      var o = JSON.parse(raw);
      if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
      var s = { ch: int(o.ch, 0, 2, 0), cleared: {}, lv: {}, best: int(o.best, 0, 99999, 0), roster: [], party: [] };
      if (o.cleared && typeof o.cleared === 'object' && !Array.isArray(o.cleared)) {
        var kn = Object.keys(o.cleared).slice(0, 40);
        for (var i = 0; i < kn.length; i++) if (o.cleared[kn[i]] === true) s.cleared[String(kn[i]).slice(0, 8)] = true;
      }
      if (o.lv && typeof o.lv === 'object' && !Array.isArray(o.lv)) {
        var kl = Object.keys(o.lv).slice(0, 16);
        for (var j = 0; j < kl.length; j++) s.lv[String(kl[j]).slice(0, 16)] = int(o.lv[kl[j]], 1, 3, 1);
      }
      var knownSpirit = function (x) {
        return typeof x === 'string' && M.SPIRITS && Object.prototype.hasOwnProperty.call(M.SPIRITS, x);
      };
      if (Array.isArray(o.roster)) s.roster = o.roster.slice(0, 12).filter(knownSpirit);
      if (Array.isArray(o.party)) s.party = o.party.slice(0, 3).filter(function (x) {
        return knownSpirit(x) && s.roster.indexOf(x) >= 0;
      });
      if (o.lv && typeof o.lv === 'object' && !Array.isArray(o.lv)) {
        var validLv = {};
        for (var sid in s.lv) if (knownSpirit(sid)) validLv[sid] = s.lv[sid];
        s.lv = validLv;
      }
      return s;
    } catch (e) { return null; }
  };
  M.save = function (s) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { }
  };
  M.wipe = function () { try { localStorage.removeItem(KEY); } catch (e) { } };

  /* ---------- helpers ---------- */
  M.rr = function (c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  };
  M.panel = function (c, x, y, w, h, fill, stroke, r) {
    M.rr(c, x, y, w, h, r === undefined ? 10 : r);
    c.fillStyle = fill; c.fill();
    if (stroke) { c.lineWidth = 2; c.strokeStyle = stroke; c.stroke(); }
  };
  M.txt = function (c, s, x, y, size, col, align, bold) {
    c.font = (bold === false ? '' : 'bold ') + size + 'px system-ui,-apple-system,sans-serif';
    c.fillStyle = col; c.textAlign = align || 'left'; c.textBaseline = 'middle';
    c.fillText(s, x, y);
  };
  M.wrap = function (c, s, x, y, w, size, col, lh, align) {
    c.font = size + 'px system-ui,-apple-system,sans-serif';
    c.fillStyle = col; c.textAlign = align || 'left'; c.textBaseline = 'middle';
    var words = String(s).split(' '), line = '', n = 0;
    for (var i = 0; i < words.length; i++) {
      var t = line ? line + ' ' + words[i] : words[i];
      if (c.measureText(t).width > w && line) { c.fillText(line, x, y + n * lh); n++; line = words[i]; }
      else line = t;
    }
    if (line) { c.fillText(line, x, y + n * lh); n++; }
    return n;
  };
  M.bar = function (c, x, y, w, h, p, bg, fg) {
    M.rr(c, x, y, w, h, h / 2); c.fillStyle = bg; c.fill();
    p = Math.max(0, Math.min(1, p));
    if (p > 0) { M.rr(c, x, y, Math.max(h, w * p), h, h / 2); c.fillStyle = fg; c.fill(); }
  };

  /* ---------- loop ---------- */
  var last = 0;
  M.update = null; M.draw = null;
  M.step = function (dt) {
    if (M.paused) dt = 0;
    if (dt > 0) { tickTimers(dt); fx(dt); if (M.update) M.update(dt); }
    else if (M.paused) { M.releaseAll(); }
    if (M.draw) M.draw(dt);
  };
  function frame(ts) {
    requestAnimationFrame(frame);
    if (!last) last = ts;
    var dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    M.step(dt);
  }
  M.boot = function () {
    M.cv = document.getElementById('cv');
    M.ctx = M.cv.getContext('2d', { alpha: false });
    M.initInput();
    M.resize();
    requestAnimationFrame(frame);
  };
})();
