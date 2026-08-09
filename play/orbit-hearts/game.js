/* Orbit Hearts - engine. Vanilla JS + canvas. */
(function (g) {
  'use strict';

  var D = g.OH_DATA, A = g.OH_AUDIO;
  var ROUTES = D.ROUTES, NODES = D.NODES, ENDINGS = D.ENDINGS;
  var W = 390, H = 700;
  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d', { alpha: false });

  /* ---------- layout ---------- */
  var cssW = W, cssH = H, sc = 1, offX = 0, offY = 0, bs = 1, landscape = false;

  function fit() {
    var vw = Math.max(1, window.innerWidth), vh = Math.max(1, window.innerHeight);
    cssW = vw; cssH = vh;
    landscape = vw > vh;
    paused = !!(hidden || landscape);
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var bw = vw * dpr, bh = vh * dpr;
    var long = Math.max(bw, bh), cap = 960;
    if (long > cap) { var k = cap / long; bw *= k; bh *= k; }
    bw = Math.max(1, Math.floor(bw)); bh = Math.max(1, Math.floor(bh));
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;
    bs = bw / vw;
    sc = Math.min(vw / W, vh / H);
    offX = (vw - W * sc) / 2;
    offY = (vh - H * sc) / 2;
  }
  window.addEventListener('resize', fit);
  window.addEventListener('orientationchange', fit);

  /* ---------- save ---------- */
  var KEY = 'orbitHearts.v1';
  var save = { endings: {}, log: {}, best: {} };

  function loadSave() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw || typeof raw !== 'string') return;
      var o = JSON.parse(raw);
      if (!o || typeof o !== 'object' || o instanceof Array) return;
      var e = {}, k;
      var knownRoute = {};
      for (var ri0 = 0; ri0 < ROUTES.length; ri0++) knownRoute[ROUTES[ri0].id] = 1;
      if (o.endings && typeof o.endings === 'object' && !(o.endings instanceof Array)) {
        var knownEnding = {};
        for (var ri = 0; ri < ROUTES.length; ri++) for (var ei = 0; ei < ENDINGS[ROUTES[ri].id].length; ei++) {
          knownEnding[ENDINGS[ROUTES[ri].id][ei].id] = 1;
        }
        for (k in o.endings) if (Object.prototype.hasOwnProperty.call(o.endings, k) && o.endings[k] && knownEnding[k]) e[k] = 1;
      }
      var lg = {};
      if (o.log && typeof o.log === 'object' && !(o.log instanceof Array)) {
        for (k in o.log) {
          if (!Object.prototype.hasOwnProperty.call(o.log, k)) continue;
          var arr = o.log[k];
          if (arr instanceof Array) {
            var out = [];
            for (var i = 0; i < arr.length && out.length < 16; i++) if (typeof arr[i] === 'string') out.push(arr[i].slice(0, 90));
          if (knownRoute[k]) lg[String(k)] = out;
          }
        }
      }
      var bt = {};
      if (o.best && typeof o.best === 'object' && !(o.best instanceof Array)) {
        for (k in o.best) {
          if (!Object.prototype.hasOwnProperty.call(o.best, k)) continue;
          var v = Number(o.best[k]);
          if (knownRoute[k] && isFinite(v) && v >= 0) bt[String(k)] = Math.min(99, Math.floor(v));
        }
      }
      save = { endings: e, log: lg, best: bt };
    } catch (err) { save = { endings: {}, log: {}, best: {} }; }
  }

  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (err) {}
  }
  loadSave();

  function endingsFound() { var n = 0, k; for (k in save.endings) if (save.endings[k]) n++; return n; }

  /* ---------- timers (all tracked so restart can cancel) ---------- */
  var timers = [];
  function setT(fn, ms) { var id = setTimeout(function () { drop(id); fn(); }, ms); timers.push(id); return id; }
  function drop(id) { var i = timers.indexOf(id); if (i >= 0) timers.splice(i, 1); }
  function clearTimers() { for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]); timers.length = 0; }

  /* ---------- input ---------- */
  var pointers = {};           // pointerId -> {x,y}
  var keys = {};               // held keys
  var queuedTap = false;
  var focusIdx = 0;
  var btns = [], navBtns = [];

  function resetInput() {
    pointers = {};
    keys = {};
    queuedTap = false;
    focusIdx = 0;
  }

  function toLogical(cx, cy) {
    var r = canvas.getBoundingClientRect();
    return { x: (cx - r.left - offX) / sc, y: (cy - r.top - offY) / sc };
  }

  function onDown(e) {
    e.preventDefault();
    if (paused || hidden || document.hidden) return;
    A.unlock();
    var p = toLogical(e.clientX, e.clientY);
    pointers[e.pointerId] = { x: p.x, y: p.y, id: e.pointerId };
    press(p.x, p.y);
  }
  function onMove(e) {
    if (!pointers[e.pointerId]) return;
    e.preventDefault();
    var p = toLogical(e.clientX, e.clientY);
    pointers[e.pointerId].x = p.x; pointers[e.pointerId].y = p.y;
  }
  function onUp(e) {
    if (pointers[e.pointerId]) delete pointers[e.pointerId];
  }
  function releaseAll() { pointers = {}; keys = {}; queuedTap = false; }

  canvas.addEventListener('pointerdown', onDown, { passive: false });
  canvas.addEventListener('pointermove', onMove, { passive: false });
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointerleave', onUp);
  canvas.addEventListener('touchstart', function (e) { e.preventDefault(); }, { passive: false });
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', function () {
    hidden = document.hidden;
    paused = hidden || landscape;
    releaseAll();
    if (!hidden) last = 0;
  });

  window.addEventListener('keydown', function (e) {
    var k = e.key;
    if (k === ' ' || k === 'Enter' || k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight' || k === 'Escape') e.preventDefault();
    if (paused || hidden || document.hidden) return;
    if (keys[k]) return;
    keys[k] = 1;
    A.unlock();
    if (paused) return;
    if (k === 'ArrowDown' || k === 'ArrowRight') { if (navBtns.length) { focusIdx = (focusIdx + 1) % navBtns.length; A.ui(); } return; }
    if (k === 'ArrowUp' || k === 'ArrowLeft') { if (navBtns.length) { focusIdx = (focusIdx + navBtns.length - 1) % navBtns.length; A.ui(); } return; }
    if (k === 'm' || k === 'M') { A.setMuted(!A.isMuted()); return; }
    if (k === 'Escape') { escape(); return; }
    if (k === ' ' || k === 'Enter') {
      if (navBtns.length && navBtns[focusIdx]) { activate(navBtns[focusIdx]); }
      else { queuedTap = true; }
    }
  });
  window.addEventListener('keyup', function (e) { delete keys[e.key]; });

  function press(x, y) {
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        var ni = navBtns.indexOf(b); if (ni >= 0) focusIdx = ni;
        activate(b); return;
      }
    }
    queuedTap = true;
  }
  function activate(b) { A.ui(); if (b.fn) b.fn(); }

  function escape() {
    if (screen === 'story' || screen === 'ending' || screen === 'map' || screen === 'select') gotoTitle();
  }

  /* ---------- particles (capped) ---------- */
  var parts = [], PMAX = 90;
  function emit(x, y, n, col, kind) {
    for (var i = 0; i < n; i++) {
      if (parts.length >= PMAX) parts.shift();
      var a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 150;
      parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, life: 0.5 + Math.random() * 0.5, t: 0, c: col, k: kind || 'dot' });
    }
  }
  function updParts(dt) {
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.t += dt;
      if (p.t >= p.life) { parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 120 * dt; p.vx *= 0.98;
    }
    if (parts.length > PMAX) parts.splice(0, parts.length - PMAX);
  }
  function drawParts() {
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i], a = 1 - p.t / p.life;
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = p.c;
      if (p.k === 'heart') { heartPath(p.x, p.y, 5 + a * 4); ctx.fill(); }
      else ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;
  }
  function heartPath(x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.75);
    ctx.bezierCurveTo(x - s * 1.3, y - s * 0.3, x - s * 0.45, y - s * 1.1, x, y - s * 0.35);
    ctx.bezierCurveTo(x + s * 0.45, y - s * 1.1, x + s * 1.3, y - s * 0.3, x, y + s * 0.75);
    ctx.closePath();
  }

  var shakeT = 0, shakeM = 0, flashT = 0, flashC = '#fff';
  function shake(m) { shakeM = Math.max(shakeM, m); shakeT = 0.32; }
  function flash(c) { flashT = 0.22; flashC = c || '#fff'; }

  /* ---------- stars ---------- */
  var stars = [];
  (function () {
    for (var i = 0; i < 70; i++) stars.push({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.6 + 0.4, s: 0.1 + Math.random() * 0.5, p: Math.random() * 6.3 });
  })();

  /* ---------- game state ---------- */
  var screen = 'title';  // title|select|story|ending|map
  var route = null, node = null, lines = [], li = 0, typed = 0, mode = 'text';
  var aff = 0, flags = {}, choiceLog = [], curEnding = null, endPage = 0;
  var rh = null, time = 0, paused = false, hidden = !!document.hidden;

  function gotoTitle() {
    clearTimers(); resetInput();
    screen = 'title'; route = null; node = null; rh = null; mode = 'text'; parts.length = 0;
  }

  function startRoute(r) {
    clearTimers(); resetInput();
    route = r; aff = 0; flags = {}; choiceLog = []; parts.length = 0; rh = null; curEnding = null; endPage = 0;
    screen = 'story';
    startNode(r.start);
  }

  function startNode(id) {
    node = NODES[id];
    if (!node) { gotoTitle(); return; }
    lines = [];
    for (var i = 0; i < node.lines.length; i++) {
      var L = node.lines[i];
      if (L[2] && !flags[L[2]]) continue;
      lines.push(L);
    }
    li = 0; typed = 0; mode = 'text';
    node._rdone = false;
  }

  function advance() {
    if (mode !== 'text') return;
    var full = lines[li] ? lines[li][1].length : 0;
    if (typed < full) { typed = full; return; }
    li++;
    typed = 0;
    if (li >= lines.length) resolveNode();
  }

  function resolveNode() {
    if (node.choices) { mode = 'choice'; focusIdx = 0; return; }
    if (node.rhythm && !node._rdone) { startRhythm(); return; }
    nextFrom();
  }

  function nextFrom() {
    if (node.branch) {
      for (var f in node.branch) if (flags[f]) { startNode(node.branch[f]); return; }
      var kk = Object.keys(node.branch);
      startNode(node.branch[kk[0]]); return;
    }
    if (node.go) { startNode(node.go); return; }
    if (node.end) { finish(node.end); return; }
    gotoTitle();
  }

  function pick(c) {
    aff += c.a;
    if (c.f) flags[c.f] = true;
    if (choiceLog.length < 16) choiceLog.push(('Ch' + (node.ch || 1) + ' — ') + c.t);
    A.choose();
    emit(195, 470, 10, route.color, 'heart');
    flash(route.color);
    mode = 'text';
    startNode(c.go);
  }

  function finish(rid) {
    var t = D.TIERS, idx = aff >= t[0] ? 2 : (aff >= t[1] ? 1 : 0);
    curEnding = ENDINGS[rid][idx];
    save.endings[curEnding.id] = 1;
    save.log[rid] = choiceLog.slice(0, 16);
    if (!save.best[rid] || aff > save.best[rid]) save.best[rid] = aff;
    persist();
    screen = 'ending'; endPage = 0;
    A.ending(); flash('#fff'); shake(6);
    emit(195, 260, 26, curEnding === ENDINGS[rid][2] ? '#ffd9ec' : route.color, 'heart');
  }

  /* ---------- rhythm ---------- */
  function startRhythm() {
    mode = 'rhythm';
    rh = { i: 0, p: 0, gap: 0.8, active: false, hits: 0, fb: '', fbT: 0, done: false, name: node.rhythm.name, results: [] };
  }
  var TRAVEL = 1.15, TR = 46, WIN = 26, PERF = 10;

  function rhythmTap() {
    if (!rh || !rh.active) return;
    var r = 150 - 104 * rh.p, err = Math.abs(r - TR);
    rh.active = false; rh.gap = 0.42;
    if (err <= PERF) { rh.hits++; aff += 1; rh.fb = 'PERFECT'; rh.fbT = 0.7; rh.results.push(2); A.perfect(); emit(195, 470, 14, '#ffe9a8'); flash('#ffffff'); shake(4); }
    else if (err <= WIN) { rh.hits++; aff += 1; rh.fb = 'GOOD'; rh.fbT = 0.7; rh.results.push(1); A.hit(rh.i); emit(195, 470, 8, route.color); shake(2); }
    else { rh.fb = 'OFF-BEAT'; rh.fbT = 0.7; rh.results.push(0); A.miss(); }
    rh.i++;
  }

  function updRhythm(dt) {
    if (rh.fbT > 0) rh.fbT -= dt;
    if (rh.done) { rh.gap -= dt; if (rh.gap <= 0) { mode = 'text'; node._rdone = true; rh = null; nextFrom(); } return; }
    if (rh.active) {
      rh.p += dt / TRAVEL;
      if (rh.p > 1 + (WIN / 104)) { rh.active = false; rh.gap = 0.42; rh.fb = 'MISSED'; rh.fbT = 0.7; rh.results.push(0); rh.i++; A.miss(); }
      return;
    }
    rh.gap -= dt;
    if (rh.gap <= 0) {
      if (rh.i >= 3) { rh.done = true; rh.gap = 0.9; if (rh.hits === 3) { flash('#ffd9ec'); emit(195, 300, 18, '#ffd9ec', 'heart'); A.heart(); } }
      else { rh.active = true; rh.p = 0; A.blip(rh.i); }
    }
  }

  /* ---------- text util ---------- */
  var wrapCache = {};
  function wrap(text, font, maxw) {
    var key = font + '|' + maxw + '|' + text;
    if (wrapCache[key]) return wrapCache[key];
    ctx.font = font;
    var words = text.split(' '), out = [], cur = '';
    for (var i = 0; i < words.length; i++) {
      var t = cur ? cur + ' ' + words[i] : words[i];
      if (ctx.measureText(t).width > maxw && cur) { out.push(cur); cur = words[i]; }
      else cur = t;
    }
    if (cur) out.push(cur);
    var keys = Object.keys(wrapCache);
    if (keys.length > 400) delete wrapCache[keys[0]];
    wrapCache[key] = out;
    return out;
  }

  /* ---------- buttons ---------- */
  function btn(x, y, w, h, label, fn, k, style) { btns.push({ x: x, y: y, w: w, h: h, l: label, fn: fn, k: k, s: style || 'normal' }); }

  function drawBtn(b) {
    var foc = !!b.foc;
    var r = 12;
    ctx.save();
    var col = b.s === 'ghost' ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.10)';
    if (b.s === 'route' && b.col) col = 'rgba(255,255,255,0.07)';
    ctx.fillStyle = col;
    roundRect(b.x, b.y, b.w, b.h, r); ctx.fill();
    ctx.lineWidth = foc ? 2.5 : 1.2;
    ctx.strokeStyle = foc ? (b.col || '#ffd9ec') : 'rgba(255,255,255,0.22)';
    roundRect(b.x, b.y, b.w, b.h, r); ctx.stroke();
    ctx.restore();
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

  function label(text, x, y, font, col, align) {
    ctx.font = font; ctx.fillStyle = col; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
    ctx.textAlign = 'left';
  }

  /* ---------- backgrounds ---------- */
  function drawStars(spd) {
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var tw = 0.55 + 0.45 * Math.sin(time * (1 + s.s * 3) + s.p);
      ctx.globalAlpha = tw;
      ctx.fillStyle = '#cfe4ff';
      ctx.fillRect(s.x, (s.y + time * s.s * (spd || 6)) % H, s.r, s.r);
    }
    ctx.globalAlpha = 1;
  }

  function bgFill(a, b) {
    var gr = ctx.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, a); gr.addColorStop(1, b);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
  }

  function drawBG(kind) {
    if (kind === 'ring') {
      bgFill('#0a1020', '#060a14'); drawStars(4);
      ctx.strokeStyle = 'rgba(140,190,240,0.20)'; ctx.lineWidth = 10;
      for (var i = -2; i < 7; i++) {
        ctx.beginPath(); ctx.moveTo(-40 + i * 80, 0); ctx.lineTo(-40 + i * 80 + 120, H * 0.62); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(120,220,255,' + (0.25 + 0.12 * Math.sin(time * 2)) + ')'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(195, H * 0.95, 330, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    } else if (kind === 'core') {
      bgFill('#1a0b0d', '#0a0507');
      var pu = 0.3 + 0.2 * Math.sin(time * 3);
      for (var j = 0; j < 6; j++) {
        ctx.fillStyle = 'rgba(255,110,80,' + (0.07 + 0.05 * Math.sin(time * 2 + j)) + ')';
        ctx.fillRect(18 + j * 64, 0, 26, H * 0.66);
      }
      ctx.fillStyle = 'rgba(255,150,90,' + pu + ')';
      ctx.beginPath(); ctx.arc(195, 210, 90, 0, 6.284); ctx.fill();
    } else if (kind === 'green') {
      bgFill('#08170f', '#040b08');
      for (var k = 0; k < 5; k++) {
        ctx.fillStyle = 'rgba(150,255,170,' + (0.05 + 0.04 * Math.sin(time * 1.5 + k)) + ')';
        ctx.fillRect(0, 60 + k * 92, W, 8);
      }
      ctx.fillStyle = 'rgba(60,140,80,0.35)';
      for (var l = 0; l < 9; l++) {
        var lx = 20 + l * 45, ly = 470 + 22 * Math.sin(time * 0.8 + l);
        ctx.beginPath(); ctx.ellipse(lx, ly, 26, 12, Math.sin(l) * 0.6, 0, 6.284); ctx.fill();
      }
    } else if (kind === 'dock') {
      bgFill('#0e1016', '#05070c'); drawStars(3);
      ctx.fillStyle = 'rgba(160,170,190,0.16)';
      ctx.fillRect(0, 380, W, 40); ctx.fillRect(0, H - 90, W, 90);
      ctx.fillStyle = 'rgba(255,180,120,' + (0.4 + 0.3 * Math.sin(time * 4)) + ')';
      for (var m = 0; m < 6; m++) ctx.fillRect(22 + m * 68, 392, 14, 14);
      ctx.strokeStyle = 'rgba(200,210,235,0.20)'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(-20, 300); ctx.lineTo(150, 190); ctx.lineTo(410, 300); ctx.stroke();
    } else { /* obs */
      bgFill('#060a18', '#03060e');
      ctx.save();
      ctx.beginPath(); ctx.ellipse(195, 250, 175, 200, 0, 0, 6.284); ctx.clip();
      ctx.fillStyle = '#02040c'; ctx.fillRect(0, 0, W, H);
      drawStars(2);
      ctx.fillStyle = 'rgba(90,130,200,0.35)';
      ctx.beginPath(); ctx.arc(120, 400 + 10 * Math.sin(time * 0.4), 190, 0, 6.284); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = 'rgba(180,200,240,0.28)'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.ellipse(195, 250, 175, 200, 0, 0, 6.284); ctx.stroke();
    }
  }

  /* ---------- character sprite ---------- */
  function drawChar(r, cx, cy, s, speaking) {
    var bob = Math.sin(time * 1.6) * 4;
    var talk = speaking ? Math.sin(time * 14) * 1.5 : 0;
    ctx.save();
    ctx.translate(cx, cy + bob);
    ctx.scale(s, s);
    // glow
    var gr = ctx.createRadialGradient(0, 0, 10, 0, 0, 150);
    gr.addColorStop(0, r.color + '33'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 20, 150, 0, 6.284); ctx.fill();
    // body
    ctx.fillStyle = r.accent;
    ctx.beginPath();
    ctx.moveTo(-58, 150); ctx.lineTo(-36, 26); ctx.lineTo(36, 26); ctx.lineTo(58, 150);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(-10, 26, 20, 124);
    // shoulders / role accent
    ctx.fillStyle = r.color;
    if (r.shape === 'hex') { ctx.fillRect(-44, 30, 88, 10); ctx.fillRect(-40, 66, 26, 8); }
    else if (r.shape === 'leaf') {
      ctx.beginPath(); ctx.ellipse(-40, 52, 22, 10, -0.6, 0, 6.284); ctx.fill();
      ctx.beginPath(); ctx.ellipse(40, 52, 22, 10, 0.6, 0, 6.284); ctx.fill();
    } else {
      ctx.beginPath(); ctx.moveTo(-38, 30); ctx.lineTo(-84, 62); ctx.lineTo(-34, 56); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(38, 30); ctx.lineTo(84, 62); ctx.lineTo(34, 56); ctx.closePath(); ctx.fill();
    }
    // neck + head
    ctx.fillStyle = r.accent; ctx.fillRect(-9, 6, 18, 24);
    ctx.fillStyle = r.color;
    ctx.beginPath(); ctx.arc(0, -22 + talk * 0.3, 30, 0, 6.284); ctx.fill();
    // headgear per role
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    if (r.shape === 'hex') ctx.fillRect(-32, -40, 64, 9);
    else if (r.shape === 'leaf') { ctx.beginPath(); ctx.ellipse(18, -48, 18, 8, -0.7, 0, 6.284); ctx.fill(); }
    else { ctx.fillRect(-34, -30, 68, 11); }
    // eyes
    ctx.fillStyle = '#08101c';
    ctx.fillRect(-15, -26, 8, speaking ? 5 : 4);
    ctx.fillRect(7, -26, 8, speaking ? 5 : 4);
    ctx.fillRect(-6 + talk, -12, 12, 3 + Math.abs(talk));
    ctx.restore();
  }

  /* ---------- affinity meter ---------- */
  function drawAff() {
    var max = 18, v = Math.max(0, Math.min(max, aff));
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; roundRect(12, 14, 366, 34, 10); ctx.fill();
    label(route.name.toUpperCase(), 22, 31, '600 11px system-ui', 'rgba(255,255,255,0.75)', 'left');
    var bx = 150, bw = 176;
    ctx.fillStyle = 'rgba(255,255,255,0.14)'; roundRect(bx, 25, bw, 12, 6); ctx.fill();
    ctx.fillStyle = route.color; roundRect(bx, 25, Math.max(4, bw * v / max), 12, 6); ctx.fill();
    ctx.fillStyle = '#ffd9ec'; heartPath(bx - 12, 31, 7); ctx.fill();
    label('CH ' + (node && node.ch ? node.ch : 1) + '/3', 356, 31, '600 11px system-ui', 'rgba(255,255,255,0.7)', 'right');
  }

  /* ---------- screens ---------- */
  function buildTitle() {
    btn(95, 430, 200, 62, 'BEGIN', function () { screen = 'select'; focusIdx = 0; }, 'begin');
    btn(95, 506, 200, 54, 'CONSTELLATION', function () { screen = 'map'; focusIdx = 0; }, 'map', 'ghost');
    btn(315, 14, 60, 52, '', function () { A.setMuted(!A.isMuted()); }, 'mute', 'ghost');
  }

  function drawTitle() {
    bgFill('#0a0d1e', '#04050c'); drawStars(6);
    // orbiting hearts
    for (var i = 0; i < 3; i++) {
      var a = time * 0.55 + i * 2.094;
      var x = 195 + Math.cos(a) * 96, y = 210 + Math.sin(a) * 44;
      ctx.fillStyle = ROUTES[i].color; ctx.globalAlpha = 0.85;
      heartPath(x, y, 13 + 3 * Math.sin(time * 3 + i)); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.13)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(195, 210, 96, 44, 0, 0, 6.284); ctx.stroke();
    ctx.fillStyle = '#ffd9ec'; heartPath(195, 212, 22 + 2 * Math.sin(time * 2)); ctx.fill();

    label('ORBIT HEARTS', 195, 330, '800 40px system-ui', '#eef4ff');
    label('a Vireo Station romance', 195, 362, '400 15px system-ui', 'rgba(200,215,245,0.7)');
    label('Tap to talk. Tap choices. Tap the beat on dates.', 195, 400, '500 13px system-ui', 'rgba(255,217,236,0.85)');

    for (var b = 0; b < btns.length; b++) drawBtn(btns[b]);
    label('BEGIN', 195, 461, '700 20px system-ui', '#fff');
    label('CONSTELLATION  ' + endingsFound() + '/9', 195, 533, '600 15px system-ui', 'rgba(230,240,255,0.9)');
    label(A.isMuted() ? '♪̸' : '♪', 345, 40, '600 20px system-ui', 'rgba(255,255,255,0.8)');
    label('3 routes · 9 endings · everything free, always', 195, 606, '400 12px system-ui', 'rgba(180,195,225,0.6)');
  }

  function buildSelect() {
    for (var i = 0; i < ROUTES.length; i++) {
      (function (r, i) {
        btn(18, 118 + i * 168, 354, 152, r.name, function () { startRoute(r); }, 'r' + i, 'route');
        btns[btns.length - 1].col = r.color;
      })(ROUTES[i], i);
    }
    btn(120, 630, 150, 54, 'BACK', function () { gotoTitle(); }, 'back', 'ghost');
  }

  function drawSelect() {
    bgFill('#0a0d1e', '#04050c'); drawStars(3);
    label('CHOOSE A HEART', 195, 56, '800 24px system-ui', '#eef4ff');
    label('every route is free · 3 chapters · 3 endings each', 195, 84, '400 12px system-ui', 'rgba(190,205,235,0.65)');
    for (var i = 0; i < ROUTES.length; i++) {
      var r = ROUTES[i], b = btns[i];
      drawBtn(b);
      ctx.save();
      ctx.beginPath(); roundRect(b.x, b.y, b.w, b.h, 12); ctx.clip();
      ctx.translate(78, b.y + 96); ctx.scale(0.62, 0.62);
      drawChar(r, 0, 0, 1, false);
      ctx.restore();
      label(r.name, 150, b.y + 34, '700 19px system-ui', r.color, 'left');
      label(r.role, 150, b.y + 56, '600 12px system-ui', 'rgba(255,255,255,0.6)', 'left');
      var wl = wrap(r.blurb, '400 12px system-ui', 210);
      for (var j = 0; j < wl.length && j < 3; j++) label(wl[j], 150, b.y + 80 + j * 16, '400 12px system-ui', 'rgba(220,230,250,0.8)', 'left');
      var found = 0;
      for (var e = 0; e < 3; e++) if (save.endings[ENDINGS[r.id][e].id]) found++;
      for (var d = 0; d < 3; d++) {
        ctx.fillStyle = d < found ? r.color : 'rgba(255,255,255,0.18)';
        heartPath(158 + d * 20, b.y + 132, 7); ctx.fill();
      }
      label(found + '/3 endings', 230, b.y + 132, '600 11px system-ui', 'rgba(255,255,255,0.55)', 'left');
    }
    drawBtn(btns[3]); label('BACK', 195, 657, '700 16px system-ui', '#fff');
  }

  function buildStory() {
    if (mode === 'choice' && node.choices) {
      var n = node.choices.length;
      var h = n === 2 ? 78 : 66, gap = 10;
      var total = n * h + (n - 1) * gap;
      var y0 = H - 26 - total;
      for (var i = 0; i < n; i++) {
        (function (c, yy) { btn(18, yy, 354, h, c.t, function () { pick(c); }, 'c' + yy); btns[btns.length - 1].col = route.color; })(node.choices[i], y0 + i * (h + gap));
      }
    }
    btn(315, 14, 60, 52, '', function () { A.setMuted(!A.isMuted()); }, 'mute', 'ghost');
  }

  function drawStory() {
    drawBG(node.bg);
    var L = lines[li] || lines[lines.length - 1] || ['', ''];
    var spk = L[0];
    var speaking = mode === 'text' && spk && spk !== 'You';
    drawChar(route, 195, mode === 'rhythm' ? 250 : 300, mode === 'rhythm' ? 0.72 : 1, speaking);
    drawParts();
    drawAff();

    if (mode === 'rhythm') { drawRhythm(); return; }

    // dialogue box
    var boxY = mode === 'choice' ? 322 : 470;
    var boxH = mode === 'choice' ? 100 : 200;
    ctx.fillStyle = 'rgba(6,9,20,0.86)'; roundRect(14, boxY, 362, boxH, 14); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 1.2; roundRect(14, boxY, 362, boxH, 14); ctx.stroke();

    var name = L[0];
    var first = route.name.split(' ')[0];
    if (name) {
      var nc = name === 'You' ? '#ffd9ec' : (name === first ? route.color : '#cfd8ee');
      var disp = name === first ? route.name : name;
      ctx.font = '700 14px system-ui';
      var nw = ctx.measureText(disp).width + 32;
      ctx.fillStyle = 'rgba(6,9,20,0.95)'; roundRect(26, boxY - 15, nw, 30, 9); ctx.fill();
      ctx.strokeStyle = nc; ctx.lineWidth = 1.4; roundRect(26, boxY - 15, nw, 30, 9); ctx.stroke();
      label(disp, 42, boxY, '700 14px system-ui', nc, 'left');
    }
    var full = L[1] || '';
    var shownLen = mode === 'choice' ? full.length : Math.floor(typed);
    var font = name ? '400 16px system-ui' : 'italic 400 15px system-ui';
    var col = name ? '#eaf0ff' : 'rgba(205,218,245,0.9)';
    var wl = wrap(full, font, 322);
    var acc = 0;
    for (var i = 0; i < wl.length; i++) {
      var seg = wl[i];
      var vis = Math.max(0, Math.min(seg.length, shownLen - acc));
      label(seg.slice(0, vis), 32, boxY + 34 + i * 24, font, col, 'left');
      acc += seg.length + 1;
    }
    if (mode === 'text' && typed >= full.length) {
      var ar = 3 * Math.sin(time * 5);
      ctx.fillStyle = 'rgba(255,217,236,0.9)';
      ctx.beginPath(); ctx.moveTo(346, boxY + boxH - 24 + ar); ctx.lineTo(360, boxY + boxH - 24 + ar); ctx.lineTo(353, boxY + boxH - 15 + ar); ctx.closePath(); ctx.fill();
    }

    if (mode === 'choice') {
      for (var b = 0; b < btns.length - 1; b++) {
        var bt = btns[b];
        drawBtn(bt);
        var cl = wrap(bt.l, '500 15px system-ui', 316);
        var oy = bt.y + bt.h / 2 - (cl.length - 1) * 10;
        for (var k = 0; k < cl.length; k++) label(cl[k], 195, oy + k * 20, '500 15px system-ui', '#f2f6ff');
      }
      label('choose — it changes what happens next', 195, 438, '500 12px system-ui', 'rgba(255,217,236,0.75)');
    }
    label(A.isMuted() ? '♪̸' : '♪', 345, 40, '600 20px system-ui', 'rgba(255,255,255,0.8)');
  }

  function drawRhythm() {
    ctx.fillStyle = 'rgba(4,6,14,0.55)'; ctx.fillRect(0, 0, W, H);
    label(rh.name, 195, 424, '800 20px system-ui', route.color);
    label('tap on the beat — 3 taps', 195, 450, '500 12px system-ui', 'rgba(255,255,255,0.65)');
    var cy = 540;
    // target
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(195, cy, TR, 0, 6.284); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,217,236,0.18)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(195, cy, TR + WIN, 0, 6.284); ctx.stroke();
    ctx.fillStyle = route.color + '55'; heartPath(195, cy + 6, 20); ctx.fill();
    if (rh.active) {
      var r = 150 - 104 * rh.p;
      ctx.strokeStyle = route.color; ctx.lineWidth = 5;
      ctx.globalAlpha = Math.max(0.15, Math.min(1, rh.p + 0.25));
      ctx.beginPath(); ctx.arc(195, cy, Math.max(6, r), 0, 6.284); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    for (var i = 0; i < 3; i++) {
      var res = rh.results[i];
      ctx.fillStyle = res === undefined ? 'rgba(255,255,255,0.18)' : (res === 0 ? 'rgba(255,120,120,0.7)' : (res === 2 ? '#ffe9a8' : route.color));
      heartPath(155 + i * 40, 638, 11); ctx.fill();
    }
    if (rh.fbT > 0) {
      var a = Math.min(1, rh.fbT / 0.35);
      ctx.globalAlpha = a;
      label(rh.fb, 195, 490, '800 24px system-ui', rh.fb === 'PERFECT' ? '#ffe9a8' : (rh.fb === 'GOOD' ? route.color : '#ff9a9a'));
      ctx.globalAlpha = 1;
    }
    drawParts();
  }

  function buildEnding() {
    if (endPage >= curEnding.text.length) {
      btn(18, 576, 172, 56, 'CONSTELLATION', function () { clearTimers(); resetInput(); screen = 'map'; }, 'e1', 'ghost');
      btn(200, 576, 172, 56, 'NEW ROUTE', function () { clearTimers(); resetInput(); screen = 'select'; }, 'e2');
      btn(120, 640, 150, 48, 'TITLE', function () { gotoTitle(); }, 'e3', 'ghost');
    }
  }

  function drawEnding() {
    bgFill('#0d0a1c', '#04040b'); drawStars(2);
    var r = route;
    // constellation flourish
    ctx.strokeStyle = 'rgba(255,217,236,0.35)'; ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (var i = 0; i < 6; i++) {
      var a = time * 0.2 + i * 1.047, x = 195 + Math.cos(a) * (48 + i * 7), y = 132 + Math.sin(a) * (30 + i * 4);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      ctx.fillStyle = '#fff'; ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    ctx.stroke();
    ctx.fillStyle = r.color; heartPath(195, 132, 22); ctx.fill();

    label('ENDING UNLOCKED', 195, 218, '700 12px system-ui', 'rgba(255,255,255,0.55)');
    label(curEnding.title, 195, 248, '800 26px system-ui', r.color);
    label(r.name + ' · affinity ' + aff + ' / 18', 195, 276, '500 12px system-ui', 'rgba(220,230,250,0.65)');
    label(curEnding.star, 195, 296, 'italic 400 11px system-ui', 'rgba(255,217,236,0.6)');

    var y = 326;
    for (var p = 0; p < curEnding.text.length && p <= endPage; p++) {
      var wl = wrap(curEnding.text[p], '400 13px system-ui', 322);
      for (var j = 0; j < wl.length; j++) { label(wl[j], 195, y, '400 13px system-ui', 'rgba(235,242,255,0.92)'); y += 17; }
      y += 7;
    }
    if (endPage < curEnding.text.length) {
      label('tap to continue', 195, 664, '500 12px system-ui', 'rgba(255,217,236,0.7)');
    } else {
      label(endingsFound() + ' of 9 endings found', 195, 556, '600 13px system-ui', '#ffd9ec');
      for (var b = 0; b < btns.length; b++) drawBtn(btns[b]);
      label('CONSTELLATION', 104, 604, '700 14px system-ui', '#fff');
      label('NEW ROUTE', 286, 604, '700 14px system-ui', '#fff');
      label('TITLE', 195, 664, '700 14px system-ui', '#fff');
    }
    drawParts();
  }

  function buildMap() {
    btn(120, 630, 150, 54, 'BACK', function () { gotoTitle(); }, 'back', 'ghost');
  }

  function drawMap() {
    bgFill('#070a18', '#03040a'); drawStars(2);
    label('CONSTELLATION MAP', 195, 44, '800 22px system-ui', '#eef4ff');
    label(endingsFound() + ' / 9 endings found', 195, 70, '600 13px system-ui', '#ffd9ec');

    for (var i = 0; i < ROUTES.length; i++) {
      var r = ROUTES[i], cx = 76 + i * 119, cy = 160;
      var pts = [[0, -46], [-40, 30], [40, 30]];
      ctx.strokeStyle = r.color + '55'; ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (var p = 0; p < 3; p++) { var x = cx + pts[p][0], y = cy + pts[p][1]; if (p === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.closePath(); ctx.stroke();
      for (var e = 0; e < 3; e++) {
        var en = ENDINGS[r.id][e], px = cx + pts[e][0], py = cy + pts[e][1];
        var got = !!save.endings[en.id];
        if (got) {
          var tw = 0.7 + 0.3 * Math.sin(time * 2 + e + i);
          ctx.globalAlpha = tw; ctx.fillStyle = r.color;
          ctx.beginPath(); ctx.arc(px, py, 7, 0, 6.284); ctx.fill();
          ctx.globalAlpha = 0.28; ctx.beginPath(); ctx.arc(px, py, 15, 0, 6.284); ctx.fill();
          ctx.globalAlpha = 1;
        } else {
          ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(px, py, 6, 0, 6.284); ctx.stroke();
        }
      }
      label(r.name.split(' ')[0].toUpperCase(), cx, 226, '700 12px system-ui', r.color);
      for (var e2 = 0; e2 < 3; e2++) {
        var en2 = ENDINGS[r.id][e2];
        label(save.endings[en2.id] ? en2.title : '? ? ?', cx, 244 + e2 * 15, '500 10px system-ui', save.endings[en2.id] ? 'rgba(235,242,255,0.9)' : 'rgba(255,255,255,0.28)');
      }
      label(save.best[r.id] ? 'best affinity ' + save.best[r.id] : '—', cx, 300, '600 10px system-ui', 'rgba(255,217,236,0.7)');
    }

    ctx.fillStyle = 'rgba(255,255,255,0.05)'; roundRect(16, 322, 358, 292, 12); ctx.fill();
    label('CHOICES ON YOUR LAST RUN', 195, 344, '700 12px system-ui', 'rgba(255,255,255,0.6)');
    var y = 366, any = false;
    for (var q = 0; q < ROUTES.length && y < 600; q++) {
      var rid = ROUTES[q].id, lg = save.log[rid];
      if (!lg || !lg.length) continue;
      any = true;
      label(ROUTES[q].name, 30, y, '700 12px system-ui', ROUTES[q].color, 'left');
      y += 18;
      for (var z = 0; z < lg.length && y < 598; z++) {
        var wl = wrap('• ' + lg[z], '400 11px system-ui', 330);
        for (var w2 = 0; w2 < wl.length && y < 598; w2++) { label(wl[w2], 30, y, '400 11px system-ui', 'rgba(225,235,255,0.75)', 'left'); y += 14; }
      }
      y += 8;
    }
    if (!any) label('play a route and your choices appear here', 195, 400, '400 12px system-ui', 'rgba(255,255,255,0.35)');
    drawBtn(btns[0]); label('BACK', 195, 657, '700 16px system-ui', '#fff');
  }

  /* ---------- rotate overlay ---------- */
  function drawRotate() {
    ctx.setTransform(bs, 0, 0, bs, 0, 0);
    ctx.fillStyle = '#05060f'; ctx.fillRect(0, 0, cssW, cssH);
    ctx.save();
    ctx.translate(cssW / 2, cssH / 2);
    ctx.strokeStyle = '#ffd9ec'; ctx.lineWidth = 3;
    ctx.save(); ctx.rotate(Math.sin(time * 2) * 0.5);
    ctx.strokeRect(-34, -56, 68, 112);
    ctx.restore();
    ctx.fillStyle = '#eef4ff'; ctx.font = '700 18px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('ROTATE TO PORTRAIT', 0, 96);
    ctx.font = '400 13px system-ui'; ctx.fillStyle = 'rgba(220,230,250,0.7)';
    ctx.fillText('Orbit Hearts is paused', 0, 122);
    ctx.restore();
  }

  /* ---------- main loop ---------- */
  var last = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    if (!last) last = ts;
    var dt = (ts - last) / 1000;
    last = ts;
    if (dt > 0.05) dt = 0.05;
    if (dt < 0) dt = 0;

    fitIfNeeded();

    if (landscape || hidden) {
      if (!paused) { paused = true; releaseAll(); }
      if (landscape) drawRotate();
      else render();
      return;
    }
    if (paused) { paused = false; releaseAll(); last = ts; }

    time += dt;
    update(dt);
    render();
  }

  var lastW = -1, lastH = -1;
  function fitIfNeeded() {
    if (window.innerWidth !== lastW || window.innerHeight !== lastH) {
      lastW = window.innerWidth; lastH = window.innerHeight; fit();
    }
  }

  function update(dt) {
    updParts(dt);
    if (shakeT > 0) { shakeT -= dt; if (shakeT <= 0) shakeM = 0; }
    if (flashT > 0) flashT -= dt;

    // build interactive buttons for this frame
    btns = [];
    if (screen === 'title') buildTitle();
    else if (screen === 'select') buildSelect();
    else if (screen === 'story') buildStory();
    else if (screen === 'ending') buildEnding();
    else if (screen === 'map') buildMap();
    navBtns = [];
    for (var bi = 0; bi < btns.length; bi++) { btns[bi].foc = false; if (btns[bi].k !== 'mute') navBtns.push(btns[bi]); }
    if (focusIdx >= navBtns.length) focusIdx = 0;
    if (navBtns.length && navBtns[focusIdx]) navBtns[focusIdx].foc = true;

    if (screen === 'story') {
      if (mode === 'rhythm' && rh) {
        if (queuedTap) { queuedTap = false; rhythmTap(); }
        updRhythm(dt);
      } else if (mode === 'text') {
        var full = lines[li] ? lines[li][1].length : 0;
        if (typed < full) {
          typed += dt * 62;
          if (Math.floor(typed) % 3 === 0 && Math.random() < 0.35) A.blip(li);
          if (typed > full) typed = full;
        }
        if (queuedTap) { queuedTap = false; A.tap(); advance(); }
      } else { queuedTap = false; }
    } else if (screen === 'ending') {
      if (queuedTap) {
        queuedTap = false;
        if (endPage < curEnding.text.length) { endPage++; A.tap(); if (endPage === curEnding.text.length) { emit(195, 190, 14, '#ffd9ec', 'heart'); focusIdx = 0; } }
      }
    } else queuedTap = false;
  }

  function render() {
    ctx.setTransform(bs, 0, 0, bs, 0, 0);
    ctx.fillStyle = '#05060f'; ctx.fillRect(0, 0, cssW, cssH);
    var sx = 0, sy = 0;
    if (shakeT > 0) { sx = (Math.random() - 0.5) * shakeM * 2; sy = (Math.random() - 0.5) * shakeM * 2; }
    ctx.setTransform(bs * sc, 0, 0, bs * sc, bs * (offX + sx), bs * (offY + sy));
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
    ctx.fillStyle = '#04050c'; ctx.fillRect(0, 0, W, H);

    if (screen === 'title') drawTitle();
    else if (screen === 'select') drawSelect();
    else if (screen === 'story') drawStory();
    else if (screen === 'ending') drawEnding();
    else if (screen === 'map') drawMap();

    if (flashT > 0) {
      ctx.globalAlpha = Math.max(0, flashT / 0.22) * 0.35;
      ctx.fillStyle = flashC; ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  fit(); lastW = window.innerWidth; lastH = window.innerHeight;
  requestAnimationFrame(frame);
})(window);
