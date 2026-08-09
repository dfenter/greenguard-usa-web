/* Spire Ascent - core game (original work) */
'use strict';
(function () {

var cv = document.getElementById('c');
var g = cv.getContext('2d', { alpha: false });

var VH = 700, S = 1;
function resize() {
  var vw = Math.max(200, window.innerWidth), vh = Math.max(320, window.innerHeight);
  var cw = Math.min(vw, vh * 0.62), ch = vh;   // keep a portrait play column
  if (cv.style) { cv.style.width = cw + 'px'; cv.style.height = ch + 'px'; }
  var sc = Math.min(window.devicePixelRatio || 1, 2);
  var long = Math.max(cw, ch);
  if (long * sc > 960) sc = 960 / long;
  cv.width = Math.round(cw * sc); cv.height = Math.round(ch * sc);
  S = cv.width / VW;
  VH = cv.height / S;
  g.imageSmoothingEnabled = true;
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', function () { setTimeout(resize, 120); });
resize();

/* ---------- audio ---------- */
var AC = null;
function audioInit() {
  if (AC) return;
  try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; }
}
function sfx(f0, f1, dur, type, vol) {
  if (!AC || AC.state === 'suspended') { if (AC) AC.resume(); }
  if (!AC) return;
  var t = AC.currentTime;
  var o = AC.createOscillator(), gn = AC.createGain();
  o.type = type || 'square';
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  gn.gain.setValueAtTime(0.0001, t);
  gn.gain.exponentialRampToValueAtTime(vol || 0.08, t + 0.012);
  gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(gn); gn.connect(AC.destination);
  o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol) {
  if (!AC) return;
  var n = Math.floor(AC.sampleRate * dur);
  var buf = AC.createBuffer(1, n, AC.sampleRate), d = buf.getChannelData(0);
  for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  var s = AC.createBufferSource(); s.buffer = buf;
  var gn = AC.createGain(); gn.gain.value = vol || 0.10;
  s.connect(gn); gn.connect(AC.destination); s.start();
}

/* ---------- constants ---------- */
var GRAV = 2100, RUN = 178, JUMP = 640, HOLD_G = 0.42, HOLD_MAX = 0.20;
var SPRING = 1010, DASH_V = 470, DASH_T = 0.20, WKICK = 620, CRUMBLE = 0.45;
var HW = 9, PHH = 22, START_Y = 0;

/* ---------- state ---------- */
var mode = 'endless';
var world, P, cam, lava, lavaSpd, elapsed, dead, deadT, score, best, combo, bestCombo, bonus = 0;
var parts = [], shake = 0, tint = 0, tm = 0, hintT, flashT = 0, newBest = false, seedUsed = 0;
var jumpPointerId = null;

function LS(k, v) {
  try {
    if (v === undefined) return localStorage.getItem(k);
    localStorage.setItem(k, v);
  } catch (e) { }
  return null;
}
function bestKey() { return mode === 'daily' ? 'spire.best.d' + dailySeed() : 'spire.best'; }
function loadBest() { var value = parseInt(LS(bestKey()) || '0', 10); best = Number.isFinite(value) && value >= 0 ? value : 0; }

function reset() {
  seedUsed = mode === 'daily' ? dailySeed() : (Math.random() * 4294967295) >>> 0;
  world = new World(seedUsed, START_Y);
  P = { x: VW / 2, y: START_Y, vx: 0, vy: 0, dir: 1, plat: null, coyote: 0, buf: 0,
        dashT: 0, dashOk: true, dashMemo: 0, holdT: 0, holding: false, bestY: START_Y, sq: 0 };
  cam = START_Y - VH * 0.60;
  lava = START_Y + VH * 0.80;
  lavaSpd = 44; elapsed = 0; dead = false; deadT = 0; score = 0; combo = 0; bestCombo = 0; bonus = 0;
  parts.length = 0; shake = 0; tint = 0; hintT = 5.2; newBest = false;
  lastTap = 0; jumpPointerId = null;
  loadBest();
}

/* ---------- particles ---------- */
function burst(x, y, n, col, spd, up) {
  for (var i = 0; i < n; i++) {
    var a = Math.random() * Math.PI * 2;
    parts.push({ x: x, y: y, vx: Math.cos(a) * spd * (0.4 + Math.random()),
      vy: Math.sin(a) * spd * (0.4 + Math.random()) - (up || 0),
      life: 0.35 + Math.random() * 0.45, max: 0.8, c: col, s: 2 + Math.random() * 3, gr: 1 });
  }
}

/* ---------- input ---------- */
var lastTap = 0;
function pressJump() {
  audioInit();
  if (dead) { if (deadT > 0.35) restartTap(); return; }
  var now = tm;
  if (!P.plat && P.coyote <= 0 && (now - lastTap) < 0.30 && P.dashOk) { doDash(); lastTap = 0; }
  else { P.buf = 0.13; P.holding = true; lastTap = now; }
}
function releaseJump() { P.holding = false; }

function doDash() {
  P.dashT = DASH_T; P.dashOk = false; P.dashMemo = 0.34;
  P.vy = -90; P.vx = P.dir * DASH_V;
  burst(P.x - P.dir * 8, P.y - PHH / 2, 10, '#8fe9ff', 90);
  shake = Math.max(shake, 3); sfx(340, 880, 0.13, 'sawtooth', 0.07);
}

var overlayBtn = null;
function pointAt(e) {
  var r = cv.getBoundingClientRect();
  var cx = (e.clientX - r.left) / r.width * VW;
  var cy = (e.clientY - r.top) / r.height * VH;
  return { x: cx, y: cy };
}
function restartTap() { reset(); }

function onDown(e) {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (jumpPointerId !== null && jumpPointerId !== e.pointerId) return;
  jumpPointerId = e.pointerId;
  e.preventDefault();
  wrap.setPointerCapture?.(e.pointerId);
  audioInit();
  if (dead && overlayBtn) {
    var p = pointAt(e.touches ? e.touches[0] : e);
    if (p.x > overlayBtn.x && p.x < overlayBtn.x + overlayBtn.w &&
        p.y > overlayBtn.y && p.y < overlayBtn.y + overlayBtn.h) {
      mode = (mode === 'daily') ? 'endless' : 'daily';
      loadBest(); sfx(500, 700, 0.08, 'triangle', 0.06); reset(); return;
    }
  }
  pressJump();
}
function onUp(e) {
  if (jumpPointerId !== e.pointerId) return;
  jumpPointerId = null;
  if (e.cancelable) e.preventDefault();
  releaseJump();
}

var wrap = document.getElementById('wrap');
wrap.addEventListener('pointerdown', onDown, { passive: false });
wrap.addEventListener('pointerup', onUp, { passive: false });
wrap.addEventListener('pointercancel', onUp, { passive: false });
wrap.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
wrap.addEventListener('contextmenu', function (e) { e.preventDefault(); });

window.addEventListener('keydown', function (e) {
  var k = e.key;
  if (k === ' ' || k === 'Spacebar' || k === 'ArrowUp' || k === 'w' || k === 'W' || k === 'Enter') {
    e.preventDefault(); if (!e.repeat) pressJump();
  } else if (k === 'ArrowLeft' || k === 'a' || k === 'A') { if (!dead) P.dir = -1; }
  else if (k === 'ArrowRight' || k === 'd' || k === 'D') { if (!dead) P.dir = 1; }
  else if (k === 'r' || k === 'R') { reset(); }
});
window.addEventListener('keyup', function (e) {
  var k = e.key;
  if (k === ' ' || k === 'Spacebar' || k === 'ArrowUp' || k === 'w' || k === 'W' || k === 'Enter') releaseJump();
});

/* ---------- death ---------- */
var deathReason='';
function die(reason) {
  if (dead) return;
  dead = true; deadT = 0; deathReason = reason;
  burst(P.x, P.y - PHH / 2, 26, '#ff5a4a', 180, 60);
  shake = 12; noise(0.45, 0.16); sfx(320, 60, 0.5, 'sawtooth', 0.09);
  var total = Math.floor(score);
  if (total > best) { best = total; newBest = true; LS(bestKey(), String(best)); }
}

/* ---------- update ---------- */
function step(dt) {
  tm += dt;
  if (shake > 0) shake = Math.max(0, shake - dt * 26);
  for (var i = parts.length - 1; i >= 0; i--) {
    var q = parts[i];
    q.life -= dt; if (q.life <= 0) { parts.splice(i, 1); continue; }
    q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 700 * q.gr * dt;
    q.vx *= (1 - 1.6 * dt);
  }
  if (dead) { deadT += dt; return; }

  elapsed += dt; hintT -= dt; if (flashT > 0) flashT -= dt;
  world.update(dt);

  // ---- horizontal ----
  P.dashT = Math.max(0, P.dashT - dt);
  P.dashMemo = Math.max(0, P.dashMemo - dt);
  var wind = world.windAt(P.y - PHH / 2);
  var vx = P.dashT > 0 ? P.vx : P.dir * RUN;
  if (P.dashT > 0) P.vx *= (1 - 1.2 * dt);
  P.x += (vx + wind) * dt;
  if (P.plat) P.x += P.plat.dx || 0;

  // ---- wall spikes (stick 14px out of the wall) ----
  for (var s = 0; s < world.spikes.length; s++) {
    var sp = world.spikes[s];
    if (P.y < sp.y || P.y - PHH > sp.y + sp.h) continue;
    if (sp.side === 0 ? (P.x - HW < WALL + 13) : (P.x + HW > VW - WALL - 13)) { die('spike'); return; }
  }

  // ---- walls ----
  var hitWall = 0;
  if (P.x - HW < WALL) { P.x = WALL + HW; hitWall = -1; }
  else if (P.x + HW > VW - WALL) { P.x = VW - WALL - HW; hitWall = 1; }
  if (hitWall) {
    if (P.dashT > 0 || P.dashMemo > 0) {
      P.vy = -WKICK; P.dashT = 0; P.dashMemo = 0; P.dashOk = true; P.plat = null;
      P.dir = -hitWall; P.holdT = 0; P.holding = false;
      burst(P.x + hitWall * 8, P.y - PHH / 2, 12, '#ffe27a', 150);
      shake = Math.max(shake, 5); sfx(520, 1000, 0.12, 'square', 0.08); flashT = 0.18;
    } else if (P.dir === hitWall) {
      P.dir = -hitWall;
      if (P.dashT <= 0) P.vx = 0;
      burst(P.x + hitWall * 8, P.y - PHH / 2, 3, '#b9a7ff', 50);
      sfx(220, 180, 0.05, 'triangle', 0.03);
    }
  }

  // ---- vertical ----
  var prevY = P.y;
  if (P.plat) {
    if (P.plat.dead) { P.plat = null; P.coyote = 0.05; }
    else {
      P.y = P.plat.y;
      if (P.x + HW < P.plat.x + 1 || P.x - HW > P.plat.x + P.plat.w - 1) { P.plat = null; P.coyote = 0.09; }
    }
  }
  if (!P.plat) {
    var gm = 1;
    if (P.dashT > 0) gm = 0.18;
    else if (P.holding && P.vy < 0 && P.holdT < HOLD_MAX) { gm = HOLD_G; P.holdT += dt; }
    P.vy += GRAV * gm * dt;
    if (P.vy > 1250) P.vy = 1250;
    P.y += P.vy * dt;
    P.coyote = Math.max(0, P.coyote - dt);
  } else { P.vy = 0; P.coyote = 0.09; }

  // ---- jump ----
  P.buf = Math.max(0, P.buf - dt);
  if (P.buf > 0 && (P.plat || P.coyote > 0)) {
    P.vy = -JUMP; P.plat = null; P.coyote = 0; P.buf = 0; P.holdT = 0; P.sq = -1;
    burst(P.x, P.y, 6, '#cfe0ff', 70);
    sfx(400, 720, 0.09, 'square', 0.055);
  }

  // ---- landing ----
  if (!P.plat && P.vy > 0) {
    for (var i2 = 0; i2 < world.plats.length; i2++) {
      var p = world.plats[i2];
      if (p.dead) continue;
      if (prevY <= p.y + 1 && P.y >= p.y && P.x + HW > p.x && P.x - HW < p.x + p.w) {
        land(p); break;
      }
    }
    if (dead) return;
  }

  // ---- height / score ----
  if (P.y < P.bestY) P.bestY = P.y;
  var h = Math.max(0, (START_Y - P.bestY) / 11);
  score = Math.max(score, h + bonus);

  // ---- doom ----
  lavaSpd = 36 + Math.min(elapsed, 150) * 0.60;
  lava -= lavaSpd * dt;
  if (lava > P.bestY + 760) lava = P.bestY + 760;
  if (P.y > lava) { die('lava'); return; }

  // ---- camera ----
  var target = P.y - VH * 0.60;
  if (target < cam) cam += (target - cam) * Math.min(1, dt * 9);
  if (P.y - cam > VH * 0.86) cam = P.y - VH * 0.86;
  if (lava - cam < VH * 0.30) cam = lava - VH * 0.30;

  tint = Math.max(0, Math.min(1, 1 - (lava - P.y) / 320));

  world.ensure(cam - VH);
  world.cull(lava + 120);
  if (P.dashT <= 0 && (P.plat || P.coyote > 0)) P.dashOk = true;
  if (P.sq > 0) P.sq = Math.max(0, P.sq - dt * 5);
  else if (P.sq < 0) P.sq = Math.min(0, P.sq + dt * 5);
}

var bonus = 0;
function land(p) {
  P.y = p.y; P.vy = 0; P.plat = p; P.dashOk = true; P.dashT = 0; P.holdT = 0; P.sq = 1;
  if (p.spike) {
    var sx = p.spike === 'L' ? p.x : p.x + p.w - p.spw;
    if (P.x + HW * 0.5 > sx && P.x - HW * 0.5 < sx + p.spw) { die('spike'); return; }
  }
  if (p.t === 'spring') {
    P.vy = -SPRING; P.plat = null; P.coyote = 0; P.dashOk = true;
    combo++; bonusAdd(combo);
    burst(P.x, p.y, 12, '#4dffa6', 130, 40);
    shake = Math.max(shake, 4); sfx(300, 1200, 0.16, 'triangle', 0.08);
    return;
  }
  if (p.t === 'crumble') {
    if (p.tmr <= 0) p.tmr = CRUMBLE;
    if (combo > 2) sfx(180, 90, 0.14, 'sawtooth', 0.05);
    combo = 0;
    burst(P.x, p.y, 6, '#e8a35c', 60);
  } else {
    combo++; bonusAdd(combo);
    if (combo > bestCombo) bestCombo = combo;
    burst(P.x, p.y, 4, '#cfe0ff', 50);
    sfx(combo > 1 ? Math.min(1200, 260 + combo * 40) : 260, 200, 0.05, 'triangle', 0.04);
    if (combo > 0 && combo % 5 === 0) { flashT = 0.25; shake = Math.max(shake, 3); sfx(700, 1400, 0.16, 'square', 0.07); }
  }
}
function bonusAdd(c) { bonus += c * 1.5; }

/* ---------- render ---------- */
function fmt(n) { return String(Math.floor(n)); }

function draw() {
  g.setTransform(S, 0, 0, S, 0, 0);
  var sx = 0, sy = 0;
  if (shake > 0) { sx = (Math.random() - 0.5) * shake; sy = (Math.random() - 0.5) * shake; }
  g.save(); g.translate(sx, sy);

  world.drawBack(g, cam, VH, tint);
  world.drawWinds(g, cam, VH);
  world.drawPlats(g, cam, VH);
  world.drawSpikes(g, cam, VH, tm);

  // player
  if (!dead) {
    var py = P.y - cam, px = P.x;
    var sqz = P.sq > 0 ? P.sq : 0, str = P.sq < 0 ? -P.sq : 0;
    var w = (HW * 2) * (1 + sqz * 0.35 - str * 0.2);
    var h = PHH * (1 - sqz * 0.28 + str * 0.22);
    // trail
    if (P.dashT > 0) {
      g.fillStyle = 'rgba(140,235,255,0.30)';
      for (var t = 1; t <= 3; t++) g.fillRect(px - w / 2 - P.dir * t * 11, py - h, w, h);
    }
    var pg = g.createLinearGradient(0, py - h, 0, py);
    pg.addColorStop(0, P.dashT > 0 ? '#c9f6ff' : '#ffe9a8');
    pg.addColorStop(1, P.dashT > 0 ? '#3fb6d8' : '#ff9c3c');
    g.fillStyle = pg;
    g.fillRect(px - w / 2, py - h, w, h);
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.fillRect(px - w / 2 + (P.dir > 0 ? w * 0.52 : w * 0.16), py - h * 0.78, w * 0.3, 4);
    if (P.dashOk && !P.plat && P.dashT <= 0) {
      g.strokeStyle = 'rgba(150,240,255,0.75)'; g.lineWidth = 2;
      g.beginPath(); g.arc(px, py - h / 2, w * 0.95, 0, 6.283); g.stroke();
    }
  }

  // particles
  for (var i = 0; i < parts.length; i++) {
    var q = parts[i];
    g.globalAlpha = Math.max(0, Math.min(1, q.life / 0.5));
    g.fillStyle = q.c; g.fillRect(q.x - q.s / 2, q.y - cam - q.s / 2, q.s, q.s);
  }
  g.globalAlpha = 1;

  // lava
  var ly = lava - cam;
  if (ly < VH + 40) {
    var lg = g.createLinearGradient(0, ly - 46, 0, ly + 60);
    lg.addColorStop(0, 'rgba(255,110,30,0)');
    lg.addColorStop(0.42, 'rgba(255,120,40,0.55)');
    lg.addColorStop(0.62, '#ff5a10');
    lg.addColorStop(1, '#8a1200');
    g.fillStyle = lg; g.fillRect(0, ly - 46, VW, VH - ly + 90);
    g.fillStyle = '#ffd27a';
    for (var x = 0; x < VW; x += 13) {
      var wv = Math.sin(tm * 5 + x * 0.09) * 5 + Math.sin(tm * 2.3 + x * 0.03) * 3;
      g.fillRect(x, ly + wv, 13, 4);
    }
  }
  g.restore();

  drawHud();
}

function rr(x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

function drawHud() {
  var F = 'system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif';
  g.textBaseline = 'top';
  if (flashT > 0) { g.fillStyle = 'rgba(255,255,255,' + (flashT * 0.5).toFixed(3) + ')'; g.fillRect(0, 0, VW, VH); }

  var top = 10;
  g.textAlign = 'left';
  g.fillStyle = 'rgba(0,0,0,0.35)'; rr(8, top, 128, 42, 8); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.55)'; g.font = '600 11px ' + F;
  g.fillText('SCORE', 16, top + 5);
  g.fillStyle = '#fff'; g.font = '700 24px ' + F;
  g.fillText(fmt(score), 16, top + 16);

  g.textAlign = 'right';
  g.fillStyle = 'rgba(0,0,0,0.35)'; rr(VW - 140, top, 132, 42, 8); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.85)'; g.font = '700 15px ' + F;
  g.fillText('BEST ' + best, VW - 16, top + 6);
  g.fillStyle = mode === 'daily' ? '#7de3ff' : 'rgba(255,255,255,0.5)';
  g.font = '600 11px ' + F;
  g.fillText(mode === 'daily' ? 'DAILY SEED' : 'ENDLESS', VW - 16, top + 26);

  if (!dead && combo > 1) {
    g.textAlign = 'center';
    var pul = 1 + 0.12 * Math.sin(tm * 12);
    g.save(); g.translate(VW / 2, top + 54); g.scale(pul, pul);
    g.fillStyle = combo >= 5 ? '#ffd84d' : '#9fe8ff';
    g.font = '800 24px ' + F;
    g.fillText('x' + combo, 0, 0);
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.font = '600 10px ' + F;
    g.fillText('COMBO', 0, 26);
    g.restore();
  }

  if (hintT > 0 && !dead) {
    g.globalAlpha = Math.min(1, hintT / 1.2);
    g.textAlign = 'center';
    g.fillStyle = 'rgba(0,0,0,0.45)'; rr(VW / 2 - 155, VH - 92, 310, 34, 10); g.fill();
    g.fillStyle = '#fff'; g.font = '600 14px ' + F;
    g.fillText('TAP to jump (hold = higher) · DOUBLE-TAP to dash', VW / 2, VH - 82);
    g.globalAlpha = 1;
  }

  if (dead) {
    g.fillStyle = 'rgba(6,4,14,0.72)'; g.fillRect(0, 0, VW, VH);
    var cy = VH / 2 - 110;
    g.textAlign = 'center';
    g.fillStyle = '#ff6a4a'; g.font = '800 34px ' + F;
    g.fillText('THE SPIRE WINS', VW / 2, cy);
    g.fillStyle = '#fff'; g.font = '800 62px ' + F;
    g.fillText(fmt(score), VW / 2, cy + 48);
    g.fillStyle = 'rgba(255,255,255,0.55)'; g.font = '600 12px ' + F;
    g.fillText('SCORE', VW / 2, cy + 116);
    g.fillStyle = newBest ? '#ffd84d' : 'rgba(255,255,255,0.8)'; g.font = '700 17px ' + F;
    g.fillText(newBest ? 'NEW BEST!' : 'BEST ' + best, VW / 2, cy + 140);
    g.fillStyle = 'rgba(255,255,255,0.6)'; g.font = '600 13px ' + F;
    g.fillText('height ' + Math.floor(Math.max(0, (START_Y - P.bestY) / 11)) + 'm · best combo x' + bestCombo, VW / 2, cy + 168);

    var bw = 220, bh = 52, bx = VW / 2 - bw / 2, by = cy + 202;
    overlayBtn = { x: bx, y: by, w: bw, h: bh };
    g.fillStyle = mode === 'daily' ? 'rgba(125,227,255,0.18)' : 'rgba(255,255,255,0.10)';
    rr(bx, by, bw, bh, 12); g.fill();
    g.strokeStyle = mode === 'daily' ? '#7de3ff' : 'rgba(255,255,255,0.35)'; g.lineWidth = 2;
    rr(bx, by, bw, bh, 12); g.stroke();
    g.fillStyle = '#fff'; g.font = '700 15px ' + F;
    g.fillText(mode === 'daily' ? 'MODE: DAILY SEED' : 'MODE: ENDLESS', VW / 2, by + 11);
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.font = '600 11px ' + F;
    g.fillText('tap to switch', VW / 2, by + 31);

    if (deadT > 0.35) {
      g.globalAlpha = 0.65 + 0.35 * Math.sin(tm * 5);
      g.fillStyle = '#fff'; g.font = '700 18px ' + F;
      g.fillText('TAP ANYWHERE TO CLIMB AGAIN', VW / 2, by + bh + 34);
      g.globalAlpha = 1;
    }
  }
}

/* ---------- loop ---------- */
var prev = 0, acc = 0;
function frame(t) {
  requestAnimationFrame(frame);
  if (!prev) prev = t;
  var dt = (t - prev) / 1000; prev = t;
  if (dt > 0.1) dt = 0.1;
  acc += dt;
  var guard = 0;
  while (acc > 1 / 120 && guard++ < 8) { var s = Math.min(1 / 60, acc); step(s); acc -= s; }
  draw();
}

window.SpireState = function () { return { P: P, world: world, lava: lava, cam: cam, dead: dead, score: score, VH: VH, why: deathReason }; };

reset();
requestAnimationFrame(frame);
document.addEventListener('visibilitychange', function () { prev = 0; acc = 0; });

})();
