/* Deep Ballast - original mobile-web submarine trench diver. Vanilla canvas. */
(function () {
'use strict';

// ---------- canvas / sizing ----------
var cv = document.getElementById('c'), ctx = cv.getContext('2d');
var W = 0, H = 0, DPR = 1;
function resize() {
  var cw = window.innerWidth, ch = window.innerHeight;
  DPR = Math.min(2, window.devicePixelRatio || 1);
  var longAxis = Math.max(cw, ch);
  var scale = Math.min(DPR, 960 / longAxis);
  if (scale < 0.75) scale = 0.75;
  W = cw; H = ch;
  cv.width = Math.round(cw * scale);
  cv.height = Math.round(ch * scale);
  cv.style.width = cw + 'px';
  cv.style.height = ch + 'px';
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', function () { setTimeout(resize, 120); });
resize();

// ---------- utils ----------
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ---------- audio (WebAudio only) ----------
var AC = null, master = null;
function audioInit() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  var A = window.AudioContext || window.webkitAudioContext;
  if (!A) return;
  AC = new A();
  master = AC.createGain(); master.gain.value = 0.35; master.connect(AC.destination);
}
function tone(freq, freq2, dur, type, vol) {
  if (!AC) return;
  var t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(freq, t);
  if (freq2) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq2), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol || 0.5, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}
var noiseBuf = null;
function noise(dur, freq, vol, q) {
  if (!AC) return;
  if (!noiseBuf) {
    noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  var t = AC.currentTime, s = AC.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  var f = AC.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1.2;
  var g = AC.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol || 0.3, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.02);
}
function sfxPing() { tone(1500, 420, 0.55, 'sine', 0.45); tone(760, 300, 0.7, 'triangle', 0.18); }
function sfxPickup() { tone(660, 1320, 0.16, 'square', 0.22); }
function sfxCreak() { noise(0.5, 140 + Math.random() * 120, 0.28, 6); }
function sfxHit() { noise(0.22, 260, 0.4, 1.0); tone(150, 60, 0.25, 'sawtooth', 0.25); }
function sfxDead() { noise(1.1, 180, 0.5, 0.7); tone(220, 40, 1.1, 'sawtooth', 0.35); }
function sfxWin() { tone(520, 520, 0.14, 'square', 0.25); setTimeout(function () { tone(780, 780, 0.2, 'square', 0.25); }, 130); setTimeout(function () { tone(1040, 1040, 0.32, 'square', 0.25); }, 280); }
function sfxAlarm() { tone(880, 620, 0.18, 'square', 0.18); }

// ---------- persistence ----------
var SAVE = 'deepballast.v1';
var meta = { bank: 0, best: 0, air: 0, hull: 0, dives: 0 };
try {
  var raw = localStorage.getItem(SAVE);
  if (raw) { var m = JSON.parse(raw); for (var k in meta) if (typeof m[k] === 'number') meta[k] = m[k]; }
} catch (e) {}
function save() { try { localStorage.setItem(SAVE, JSON.stringify(meta)); } catch (e) {} }

// ---------- world constants ----------
var WW = 720;               // world width
var ROW = 36;               // vertical spacing of wall samples
var NROWS = 96;             // depth rows -> ~3456 m
var MAXD = NROWS * ROW;
var SUBR = 11;
function airMax() { return 165 + meta.air * 28; }
function hullMax() { return 100 + meta.hull * 22; }
function redline() { return 700 + meta.hull * 340; }
function upAirCost() { return 3 + meta.air * 2; }
function upHullCost() { return 4 + meta.hull * 2; }

// ---------- game state ----------
var S = { PLAY: 0, OVER: 1, SHOP: 2 };
var state = S.PLAY;
var rows = null, crates = [], fauna = [], pings = [], parts = [], bubbles = [];
var sub, air, hull, held, shake, msgT, overT, overWin, overText, pingCd, seed, tipT;
var camY = 0, camX = 0, now = 0, creakT = 0, alarmT = 0;

function genWorld(sd) {
  var rng = mulberry32(sd);
  var s1 = rng() * 100, s2 = rng() * 100, s3 = rng() * 100;
  rows = new Array(NROWS + 1);
  var i;
  for (i = 0; i <= NROWS; i++) {
    var d = i * ROW, L, R;
    if (d < 120) { L = 30; R = WW - 30; }
    else {
      var t = d - 120;
      var base = 168 - Math.min(96, t * 0.036);
      var wob = Math.sin(t * 0.0062 + s1) * 78 + Math.sin(t * 0.0171 + s2) * 34 + Math.sin(t * 0.041 + s3) * 14;
      var hw = base + Math.sin(t * 0.029 + s3 * 2) * 26 + (rng() - 0.5) * 26;
      hw = clamp(hw, 58, 200);
      var cx = clamp(WW / 2 + wob, hw + 26, WW - hw - 26);
      L = cx - hw; R = cx + hw;
      if (d < 260) { var b = (d - 120) / 140; L = lerp(30, L, b); R = lerp(WW - 30, R, b); }
    }
    rows[i] = { l: L, r: R, ll: -9, rl: -9 };
  }
  // smoothing pass
  for (var p = 0; p < 2; p++) {
    for (i = 1; i < NROWS; i++) {
      rows[i].l = (rows[i - 1].l + rows[i].l * 2 + rows[i + 1].l) / 4;
      rows[i].r = (rows[i - 1].r + rows[i].r * 2 + rows[i + 1].r) / 4;
    }
  }
  // crates
  crates = [];
  var slots = [], nCr = 7;
  for (i = 0; i < nCr; i++) slots.push(6 + Math.floor((i / nCr) * (NROWS - 12) + rng() * 5));
  for (i = 0; i < slots.length; i++) {
    var ri = clamp(slots[i], 5, NROWS - 2), rr = rows[ri];
    crates.push({
      x: lerp(rr.l + 26, rr.r - 26, 0.18 + rng() * 0.64),
      y: ri * ROW + rng() * ROW, lit: -9, got: false, sp: rng() * 6
    });
  }
  // fauna: big listeners + small drifters
  fauna = [];
  for (i = 0; i < 5; i++) {
    var fr = 10 + Math.floor(rng() * (NROWS - 16));
    var f0 = rows[fr];
    fauna.push({
      x: lerp(f0.l + 30, f0.r - 30, rng()), y: fr * ROW,
      vx: 0, vy: 0, tx: 0, ty: 0, has: false, lit: -9,
      r: 22 + rng() * 16, ph: rng() * 6, big: true, hitT: -9
    });
  }
  for (i = 0; i < 9; i++) {
    var sr = 6 + Math.floor(rng() * (NROWS - 8));
    var s0 = rows[sr];
    fauna.push({
      x: lerp(s0.l + 20, s0.r - 20, rng()), y: sr * ROW,
      vx: 0, vy: 0, tx: 0, ty: 0, has: false, lit: -9,
      r: 6 + rng() * 4, ph: rng() * 6, big: false, hitT: -9
    });
  }
}

function wallAt(y) {
  var fi = clamp(y / ROW, 0, NROWS - 0.001);
  var i = Math.floor(fi), t = fi - i;
  var a = rows[i], b = rows[Math.min(NROWS, i + 1)];
  return { l: lerp(a.l, b.l, t), r: lerp(a.r, b.r, t) };
}

function startDive() {
  seed = (Date.now() ^ (meta.dives * 7919)) >>> 0;
  genWorld(seed);
  sub = { x: WW / 2, y: 26, vx: 0, vy: 0, tilt: 0, carry: 0, dmgT: -9 };
  air = airMax(); hull = hullMax();
  pings = []; parts = []; bubbles = [];
  held = false; ballastTouch = -1;
  touchSteer.active = false; touchSteer.id = -1; touchSteer.dx = 0;
  keys = {};
  mouseDown = false;
  shake = 0; pingCd = 0; tipT = 7;
  state = S.PLAY;
  camY = 0; camX = WW / 2 - W / 2;
  msgT = 0;
}

// ---------- input ----------
var touchSteer = { active: false, id: -1, x0: 0, dx: 0 };
var keys = {};
var btnB = { x: 0, y: 0, r: 0 }, btnP = { x: 0, y: 0, r: 0 };
var uiBtns = [];   // overlay buttons {x,y,w,h,fn}
var ballastTouch = -1;

function layoutButtons() {
  var by = H - Math.max(78, H * 0.115);
  btnB.x = Math.max(78, W * 0.19); btnB.y = by; btnB.r = 54;
  btnP.x = W - Math.max(70, W * 0.17); btnP.y = by; btnP.r = 46;
}
function inBtn(b, x, y) { var dx = x - b.x, dy = y - b.y; return dx * dx + dy * dy < (b.r + 14) * (b.r + 14); }

function firePing() {
  if (state !== S.PLAY || pingCd > 0) return;
  pingCd = 1.5;
  pings.push({ x: sub.x, y: sub.y, r: 0, pr: 0, max: 355 });
  sfxPing();
  for (var i = 0; i < fauna.length; i++) {
    var f = fauna[i];
    var d = Math.hypot(f.x - sub.x, f.y - sub.y);
    if (f.big && d < 760) { f.tx = sub.x; f.ty = sub.y; f.has = true; }
  }
}

function pointerDown(x, y, id) {
  audioInit();
  if (state !== S.PLAY) {
    for (var i = 0; i < uiBtns.length; i++) {
      var b = uiBtns[i];
      if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) { b.fn(); return; }
    }
    return;
  }
  if (inBtn(btnB, x, y)) { if (ballastTouch === -1) { held = true; ballastTouch = id; } return; }
  if (inBtn(btnP, x, y)) { firePing(); return; }
  if (!touchSteer.active) { touchSteer.active = true; touchSteer.id = id; touchSteer.x0 = x; touchSteer.dx = 0; }
}
function pointerMove(x, y, id) {
  if (touchSteer.active && touchSteer.id === id) touchSteer.dx = clamp(x - touchSteer.x0, -70, 70);
}
function pointerUp(id) {
  if (touchSteer.active && touchSteer.id === id) { touchSteer.active = false; touchSteer.dx = 0; touchSteer.id = -1; }
  if (ballastTouch === id) { held = false; ballastTouch = -1; }
}

var wrap = document.getElementById('wrap');
wrap.addEventListener('touchstart', function (e) {
  e.preventDefault();
  for (var i = 0; i < e.changedTouches.length; i++) {
    var t = e.changedTouches[i];
    pointerDown(t.clientX, t.clientY, t.identifier);
  }
}, { passive: false });
wrap.addEventListener('touchmove', function (e) {
  e.preventDefault();
  for (var i = 0; i < e.changedTouches.length; i++) {
    var t = e.changedTouches[i];
    pointerMove(t.clientX, t.clientY, t.identifier);
  }
}, { passive: false });
function tEnd(e) {
  e.preventDefault();
  for (var i = 0; i < e.changedTouches.length; i++) pointerUp(e.changedTouches[i].identifier);
}
wrap.addEventListener('touchend', tEnd, { passive: false });
wrap.addEventListener('touchcancel', tEnd, { passive: false });

var mouseDown = false;
wrap.addEventListener('mousedown', function (e) { mouseDown = true; pointerDown(e.clientX, e.clientY, -2); });
window.addEventListener('mousemove', function (e) { if (mouseDown) pointerMove(e.clientX, e.clientY, -2); });
window.addEventListener('mouseup', function () { if (mouseDown) { mouseDown = false; pointerUp(-2); } });
document.addEventListener('gesturestart', function (e) { e.preventDefault(); });

window.addEventListener('keydown', function (e) {
  audioInit();
  var k = e.key.toLowerCase();
  if ([' ', 'arrowdown', 'arrowleft', 'arrowright', 'arrowup'].indexOf(k) >= 0) e.preventDefault();
  keys[k] = true;
  if (state !== S.PLAY && (k === ' ' || k === 'enter' || k === 'r')) {
    if (uiBtns.length) uiBtns[0].fn();
    return;
  }
  if (k === 'e' || k === 'enter' || k === 'shift') firePing();
});
window.addEventListener('keyup', function (e) { keys[e.key.toLowerCase()] = false; });

// ---------- particles ----------
function burst(x, y, n, col, spd) {
  for (var i = 0; i < n; i++) {
    var a = Math.random() * 6.283, s = spd * (0.3 + Math.random());
    parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.6, t: 0, c: col });
  }
}

// ---------- update ----------
function update(dt) {
  now += dt;
  if (state !== S.PLAY) { for (var q = 0; q < parts.length; q++) { var pp = parts[q]; pp.t += dt; pp.x += pp.vx * dt; pp.y += pp.vy * dt; } shake *= 0.9; return; }

  // controls
  var kb = keys[' '] || keys['arrowdown'] || keys['s'];
  var down = held || kb;
  var steer = touchSteer.active ? touchSteer.dx / 70 : 0;
  if (keys['arrowleft'] || keys['a']) steer -= 1;
  if (keys['arrowright'] || keys['d']) steer += 1;
  steer = clamp(steer, -1, 1);

  // physics
  if (down) sub.vy += 215 * dt; else sub.vy -= 110 * dt;
  sub.vx += steer * 430 * dt;
  sub.vx -= sub.vx * 2.3 * dt;
  sub.vy -= sub.vy * 1.25 * dt;
  sub.vx = clamp(sub.vx, -150, 150);
  sub.vy = clamp(sub.vy, -98, 122);
  sub.x += sub.vx * dt; sub.y += sub.vy * dt;
  sub.tilt = lerp(sub.tilt, steer * 0.4, Math.min(1, dt * 7));
  if (sub.y < 0) { sub.y = 0; if (sub.vy < 0) sub.vy *= -0.2; }
  if (sub.y > MAXD - 20) { sub.y = MAXD - 20; sub.vy = Math.min(sub.vy, 0); }

  // bubbles
  if (down && Math.random() < dt * 34) bubbles.push({ x: sub.x + (Math.random() - 0.5) * 14, y: sub.y, v: 22 + Math.random() * 26, r: 1 + Math.random() * 2.2, t: 0 });
  for (var i = bubbles.length - 1; i >= 0; i--) {
    var b = bubbles[i]; b.t += dt; b.y -= b.v * dt; b.x += Math.sin(b.t * 4 + b.r) * 8 * dt;
    if (b.t > 2.2) bubbles.splice(i, 1);
  }

  // wall collision
  var w = wallAt(sub.y);
  var hitSpd = 0;
  if (sub.x - SUBR < w.l) { hitSpd = Math.abs(sub.vx); sub.x = w.l + SUBR; sub.vx = Math.abs(sub.vx) * 0.35; }
  else if (sub.x + SUBR > w.r) { hitSpd = Math.abs(sub.vx); sub.x = w.r - SUBR; sub.vx = -Math.abs(sub.vx) * 0.35; }
  if (hitSpd > 55) {
    var dmg = (hitSpd - 55) * 0.13;
    hull -= dmg; shake = Math.max(shake, 5 + dmg); sfxHit(); sub.dmgT = now;
    burst(sub.x, sub.y, 6, '160,220,255', 60);
  }

  // air + pressure
  air -= dt;
  var rl = redline();
  if (sub.y > rl) {
    var over = (sub.y - rl) / rl;
    hull -= (0.7 + over * 11) * dt;
    creakT -= dt;
    if (creakT <= 0) { creakT = 0.7 + Math.random() * 1.4 - Math.min(0.5, over); sfxCreak(); shake = Math.max(shake, 2 + over * 5); }
  }
  if (air < 26) { alarmT -= dt; if (alarmT <= 0) { alarmT = air < 12 ? 0.45 : 0.9; sfxAlarm(); } }

  // pings
  for (var pi = pings.length - 1; pi >= 0; pi--) {
    var p = pings[pi]; p.pr = p.r; p.r += 430 * dt;
    var r2 = p.r, pr2 = p.pr;
    for (var ri = 0; ri <= NROWS; ri++) {
      var rw = rows[ri], ry = ri * ROW, dy = ry - p.y;
      if (Math.abs(dy) > r2 + 12) continue;
      var dl = Math.hypot(rw.l - p.x, dy);
      if (dl <= r2 && dl > pr2 - 8) rw.ll = now;
      var dr = Math.hypot(rw.r - p.x, dy);
      if (dr <= r2 && dr > pr2 - 8) rw.rl = now;
    }
    for (var ci = 0; ci < crates.length; ci++) {
      var c = crates[ci]; if (c.got) continue;
      var dc = Math.hypot(c.x - p.x, c.y - p.y);
      if (dc <= r2 && dc > pr2 - 8) c.lit = now;
    }
    for (var fi2 = 0; fi2 < fauna.length; fi2++) {
      var ff = fauna[fi2], df = Math.hypot(ff.x - p.x, ff.y - p.y);
      if (df <= r2 && df > pr2 - 8) ff.lit = now;
    }
    if (p.r > p.max) pings.splice(pi, 1);
  }
  if (pingCd > 0) pingCd -= dt;

  // crates
  for (var ci2 = 0; ci2 < crates.length; ci2++) {
    var cr = crates[ci2];
    if (cr.got) continue;
    if (Math.hypot(cr.x - sub.x, cr.y - sub.y) < SUBR + 13 && sub.carry < 3) {
      cr.got = true; sub.carry++; sfxPickup(); burst(cr.x, cr.y, 14, '255,196,90', 90);
      shake = Math.max(shake, 4);
      msg(sub.carry >= 3 ? 'HOLD FULL - SURFACE NOW' : 'SALVAGE ' + sub.carry + '/3');
    }
  }

  // fauna
  for (var k2 = 0; k2 < fauna.length; k2++) {
    var f = fauna[k2];
    f.ph += dt * (f.big ? 1.6 : 3.4);
    var ax, ay;
    if (f.big && f.has) {
      var dxx = f.tx - f.x, dyy = f.ty - f.y, dd = Math.hypot(dxx, dyy) || 1;
      ax = dxx / dd * 44; ay = dyy / dd * 44;
      if (dd < 22) f.has = false;
    } else {
      ax = Math.cos(f.ph * 0.7 + k2) * 16; ay = Math.sin(f.ph * 0.45 + k2 * 2) * 12;
    }
    f.vx += ax * dt; f.vy += ay * dt;
    f.vx -= f.vx * 0.9 * dt; f.vy -= f.vy * 0.9 * dt;
    var lim = f.big ? 62 : 34;
    f.vx = clamp(f.vx, -lim, lim); f.vy = clamp(f.vy, -lim, lim);
    f.x += f.vx * dt; f.y += f.vy * dt;
    var fw = wallAt(f.y);
    if (f.x < fw.l + f.r) { f.x = fw.l + f.r; f.vx = Math.abs(f.vx); }
    if (f.x > fw.r - f.r) { f.x = fw.r - f.r; f.vx = -Math.abs(f.vx); }
    if (f.y < 90) { f.y = 90; f.vy = Math.abs(f.vy); }
    if (f.y > MAXD - 30) { f.y = MAXD - 30; f.vy = -Math.abs(f.vy); }
    // contact
    if (f.big && now - f.hitT > 1.1 && Math.hypot(f.x - sub.x, f.y - sub.y) < f.r + SUBR) {
      f.hitT = now; hull -= 13; shake = 12; sfxHit(); sub.dmgT = now; f.lit = now; f.has = false;
      var ang = Math.atan2(sub.y - f.y, sub.x - f.x);
      sub.vx += Math.cos(ang) * 130; sub.vy += Math.sin(ang) * 90;
      burst(sub.x, sub.y, 12, '255,90,110', 110);
    }
  }

  // particles
  for (var pj = parts.length - 1; pj >= 0; pj--) {
    var pt = parts[pj]; pt.t += dt; pt.x += pt.vx * dt; pt.y += pt.vy * dt;
    pt.vx -= pt.vx * 1.6 * dt; pt.vy -= pt.vy * 1.6 * dt;
    if (pt.t > pt.life) parts.splice(pj, 1);
  }

  // best depth
  var dm = Math.floor(sub.y);
  if (dm > meta.best) { meta.best = dm; }

  // surfacing
  if (sub.y < 34 && sub.vy <= 6) {
    if (sub.carry > 0) endDive(true);
    else if (msgT <= 0 && now > 4) msg('NO SALVAGE ABOARD - DIVE DEEPER');
  }
  if (air <= 0) { air = 0; endDive(false, 'AIR EXHAUSTED'); }
  else if (hull <= 0) { hull = 0; endDive(false, 'HULL IMPLOSION'); }

  if (tipT > 0) tipT -= dt;
  if (msgT > 0) msgT -= dt;
  shake *= Math.pow(0.0016, dt);
  if (shake < 0.2) shake = 0;
}

var msgText = '';
function msg(t) { msgText = t; msgT = 2.2; }

function endDive(win, why) {
  state = S.OVER; overT = 0; overWin = win;
  meta.dives++;
  if (win) {
    meta.bank += sub.carry;
    overText = sub.carry >= 3 ? 'DIVE COMPLETE' : 'PARTIAL HAUL';
    sfxWin();
  } else {
    overText = why || 'DIVE LOST';
    sfxDead();
    burst(sub.x, sub.y, 40, '255,120,80', 200);
    shake = 20;
  }
  save();
}

// ---------- render ----------
function render() {
  // camera
  var tCamY = clamp(sub.y - H * 0.44, -60, MAXD - H + 60);
  camY = lerp(camY, tCamY, 0.18);
  var tCamX = clamp(sub.x - W / 2, -40, WW - W + 40);
  if (WW < W) tCamX = (WW - W) / 2;
  camX = lerp(camX, tCamX, 0.15);
  var sx = 0, sy = 0;
  if (shake > 0.2) { sx = (Math.random() - 0.5) * shake; sy = (Math.random() - 0.5) * shake; }

  ctx.fillStyle = '#03070d';
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.translate(-camX + sx, -camY + sy);

  // faint depth gradient near surface
  if (camY < 340) {
    var g = ctx.createLinearGradient(0, 0, 0, 360);
    g.addColorStop(0, 'rgba(24,72,104,0.55)');
    g.addColorStop(1, 'rgba(3,7,13,0)');
    ctx.fillStyle = g; ctx.fillRect(camX - 10, -80, W + 20, 440);
    // surface ship
    ctx.strokeStyle = 'rgba(150,225,255,0.75)'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(WW / 2 - 62, -10); ctx.lineTo(WW / 2 + 62, -10);
    ctx.lineTo(WW / 2 + 44, 16); ctx.lineTo(WW / 2 - 44, 16); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(WW / 2 - 14, -10); ctx.lineTo(WW / 2 - 14, -30);
    ctx.lineTo(WW / 2 + 16, -30); ctx.lineTo(WW / 2 + 16, -10); ctx.stroke();
    var lg = ctx.createLinearGradient(0, 16, 0, 260);
    lg.addColorStop(0, 'rgba(160,230,255,0.20)'); lg.addColorStop(1, 'rgba(160,230,255,0)');
    ctx.fillStyle = lg;
    ctx.beginPath(); ctx.moveTo(WW / 2 - 26, 16); ctx.lineTo(WW / 2 + 26, 16);
    ctx.lineTo(WW / 2 + 110, 260); ctx.lineTo(WW / 2 - 110, 260); ctx.closePath(); ctx.fill();
    // surface line
    ctx.strokeStyle = 'rgba(120,210,255,0.45)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(camX - 10, 16); ctx.lineTo(camX + W + 10, 16); ctx.stroke();
  }

  var i0 = clamp(Math.floor((camY - 40) / ROW), 0, NROWS);
  var i1 = clamp(Math.ceil((camY + H + 40) / ROW), 0, NROWS);
  var FADE = 2.7;

  // walls (wireframe reveal + hull glow proximity)
  ctx.lineWidth = 2.2; ctx.lineCap = 'round';
  for (var i = i0; i < i1; i++) {
    var a = rows[i], b = rows[i + 1], ya = i * ROW, yb = (i + 1) * ROW;
    drawSeg(a.l, ya, b.l, yb, a.ll, b.ll);
    drawSeg(a.r, ya, b.r, yb, a.rl, b.rl);
  }
  function segAlpha(lt, x, y) {
    var al = lt > -1 ? Math.max(0, 1 - (now - lt) / FADE) : 0;
    var d = Math.hypot(x - sub.x, y - sub.y);
    var glow = d < 120 ? (1 - d / 120) * 0.42 : 0;
    return Math.max(al * 0.95, glow);
  }
  function drawSeg(x1, y1, x2, y2, l1, l2) {
    var a1 = segAlpha(l1, x1, y1), a2 = segAlpha(l2, x2, y2);
    var al = (a1 + a2) / 2;
    if (al < 0.02) return;
    ctx.strokeStyle = 'rgba(96,214,255,' + al.toFixed(3) + ')';
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    // rib tick
    if (al > 0.25 && (i & 1) === 0) {
      var dir = x1 < WW / 2 ? -1 : 1;
      ctx.strokeStyle = 'rgba(96,214,255,' + (al * 0.4).toFixed(3) + ')';
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 + dir * 13, y1 + 6); ctx.stroke();
    }
  }

  // crates
  for (var ci = 0; ci < crates.length; ci++) {
    var c = crates[ci]; if (c.got) continue;
    var al = Math.max(c.lit > -1 ? 1 - (now - c.lit) / FADE : 0,
      Math.hypot(c.x - sub.x, c.y - sub.y) < 110 ? 0.5 : 0);
    if (al <= 0.02) continue;
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(now * 0.5 + c.sp);
    ctx.strokeStyle = 'rgba(255,196,90,' + al.toFixed(3) + ')'; ctx.lineWidth = 2;
    ctx.strokeRect(-10, -10, 20, 20);
    ctx.beginPath(); ctx.moveTo(-10, -10); ctx.lineTo(10, 10); ctx.moveTo(10, -10); ctx.lineTo(-10, 10); ctx.stroke();
    ctx.restore();
  }

  // fauna
  for (var fi = 0; fi < fauna.length; fi++) {
    var f = fauna[fi];
    var fa = Math.max(f.lit > -1 ? 1 - (now - f.lit) / FADE : 0,
      Math.hypot(f.x - sub.x, f.y - sub.y) < 105 ? 0.55 : 0);
    if (fa <= 0.02) continue;
    var col = f.big ? '255,86,110' : '150,255,200';
    ctx.strokeStyle = 'rgba(' + col + ',' + fa.toFixed(3) + ')';
    ctx.lineWidth = f.big ? 2.2 : 1.6;
    ctx.beginPath();
    var seg = f.big ? 9 : 6;
    for (var s = 0; s <= seg; s++) {
      var tt = s / seg, ang = Math.PI * 2 * tt;
      var wob = 1 + Math.sin(ang * 3 + f.ph) * 0.22;
      var px = f.x + Math.cos(ang) * f.r * 1.45 * wob;
      var py = f.y + Math.sin(ang) * f.r * wob;
      if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.stroke();
    if (f.big) {
      // tail streamers
      ctx.beginPath();
      for (var t2 = 0; t2 < 3; t2++) {
        var oy = (t2 - 1) * f.r * 0.5;
        ctx.moveTo(f.x - f.r * 1.4, f.y + oy);
        ctx.lineTo(f.x - f.r * 2.3 - Math.sin(f.ph + t2) * 8, f.y + oy + Math.cos(f.ph + t2) * 7);
      }
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,220,120,' + (fa * 0.9).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(f.x + f.r * 0.7, f.y - f.r * 0.25, 2.6, 0, 6.283); ctx.fill();
    }
  }

  // ping rings
  for (var pi = 0; pi < pings.length; pi++) {
    var p = pings[pi], pa = 1 - p.r / p.max;
    ctx.strokeStyle = 'rgba(150,240,255,' + (pa * 0.55).toFixed(3) + ')';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.stroke();
  }

  // bubbles
  ctx.strokeStyle = 'rgba(170,230,255,0.35)'; ctx.lineWidth = 1;
  for (var bi = 0; bi < bubbles.length; bi++) {
    var bb = bubbles[bi];
    ctx.globalAlpha = Math.max(0, 1 - bb.t / 2.2) * 0.6;
    ctx.beginPath(); ctx.arc(bb.x, bb.y, bb.r, 0, 6.283); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // particles
  for (var pj = 0; pj < parts.length; pj++) {
    var pt = parts[pj], al2 = Math.max(0, 1 - pt.t / pt.life);
    ctx.fillStyle = 'rgba(' + pt.c + ',' + al2.toFixed(3) + ')';
    ctx.fillRect(pt.x - 1.6, pt.y - 1.6, 3.2, 3.2);
  }

  // sub
  if (state === S.PLAY || overWin) drawSub();

  ctx.restore();

  drawHUD();
}

function drawSub() {
  var glow = ctx.createRadialGradient(sub.x, sub.y, 4, sub.x, sub.y, 130);
  var flash = now - sub.dmgT < 0.22;
  glow.addColorStop(0, flash ? 'rgba(255,120,110,0.42)' : 'rgba(120,220,255,0.24)');
  glow.addColorStop(0.45, 'rgba(80,180,240,0.07)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(sub.x, sub.y, 130, 0, 6.283); ctx.fill();

  ctx.save();
  ctx.translate(sub.x, sub.y); ctx.rotate(sub.tilt * 0.5);
  ctx.strokeStyle = flash ? '#ffb0a8' : '#bff0ff'; ctx.lineWidth = 2.2;
  ctx.fillStyle = 'rgba(20,52,74,0.9)';
  ctx.beginPath(); ctx.ellipse(0, 0, 17, 9.5, 0, 0, 6.283); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-2, -9.5); ctx.lineTo(-2, -16); ctx.lineTo(7, -16); ctx.lineTo(7, -9.5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(-23, -6); ctx.moveTo(-16, 0); ctx.lineTo(-23, 6); ctx.stroke();
  ctx.fillStyle = '#ffe27a';
  ctx.beginPath(); ctx.arc(9, -1, 2.6, 0, 6.283); ctx.fill();
  ctx.restore();

  // carry markers
  for (var i = 0; i < sub.carry; i++) {
    ctx.fillStyle = '#ffc45a';
    ctx.fillRect(sub.x - 12 + i * 9, sub.y + 15, 6, 6);
  }
}

function bar(x, y, w, h, v, col, bg) {
  ctx.fillStyle = bg || 'rgba(255,255,255,0.10)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = col;
  ctx.fillRect(x, y, w * clamp(v, 0, 1), h);
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

function drawHUD() {
  layoutButtons();
  ctx.textBaseline = 'middle';

  if (state === S.PLAY || state === S.OVER) {
    // top bars
    var pad = 12, bw = Math.min(150, (W - pad * 3) / 2);
    ctx.font = '10px ui-monospace,monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#7fd4ef';
    ctx.fillText('AIR', pad, 16);
    bar(pad, 23, bw, 9, air / airMax(), air < 26 ? (Math.floor(now * 6) % 2 ? '#ff6a6a' : '#ffb36a') : '#6fe0ff');
    ctx.textAlign = 'right';
    ctx.fillStyle = '#7fd4ef';
    ctx.fillText('HULL', W - pad, 16);
    bar(W - pad - bw, 23, bw, 9, hull / hullMax(), hull < hullMax() * 0.3 ? '#ff6a6a' : '#9dffc4');

    // depth
    ctx.textAlign = 'center';
    var d = Math.floor(sub.y);
    var rl = redline();
    ctx.font = 'bold 22px ui-monospace,monospace';
    ctx.fillStyle = d > rl ? (Math.floor(now * 5) % 2 ? '#ff6a6a' : '#ffd0a0') : '#c9f4ff';
    ctx.fillText(d + ' m', W / 2, 26);
    ctx.font = '9px ui-monospace,monospace';
    ctx.fillStyle = d > rl ? '#ff8a8a' : 'rgba(150,220,245,0.6)';
    ctx.fillText(d > rl ? 'PRESSURE CRITICAL' : 'REDLINE ' + rl + ' m', W / 2, 43);

    // salvage
    ctx.textAlign = 'center';
    ctx.font = '11px ui-monospace,monospace';
    ctx.fillStyle = '#ffc45a';
    ctx.fillText('SALVAGE ' + sub.carry + '/3   BANK ' + meta.bank, W / 2, 60);

    // depth tape (right edge)
    var tapeH = H - 200, ty = 78;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(W - 6, ty, 3, tapeH);
    var rlY = ty + tapeH * (rl / MAXD);
    ctx.fillStyle = 'rgba(255,90,90,0.7)'; ctx.fillRect(W - 9, rlY, 9, 2);
    ctx.fillStyle = '#6fe0ff';
    ctx.fillRect(W - 10, ty + tapeH * clamp(sub.y / MAXD, 0, 1) - 1, 11, 3);

    // controls
    var down = held || keys[' '] || keys['arrowdown'] || keys['s'];
    drawRoundBtn(btnB, down ? 'rgba(110,230,255,0.30)' : 'rgba(110,230,255,0.12)', '#8fe3ff', 'BALLAST', down ? 'FLOOD' : 'HOLD');
    var ready = pingCd <= 0;
    drawRoundBtn(btnP, ready ? 'rgba(255,200,110,0.16)' : 'rgba(255,255,255,0.05)', ready ? '#ffd47a' : 'rgba(255,212,122,0.35)', 'SONAR', ready ? 'PING' : Math.max(0, pingCd).toFixed(1));
    if (!ready) {
      ctx.strokeStyle = 'rgba(255,212,122,0.7)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(btnP.x, btnP.y, btnP.r, -1.5708, -1.5708 + 6.283 * (1 - pingCd / 1.5)); ctx.stroke();
    }

    // steer indicator
    if (touchSteer.active) {
      ctx.strokeStyle = 'rgba(150,230,255,0.35)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(touchSteer.x0 + touchSteer.dx, H * 0.5, 22, 0, 6.283); ctx.stroke();
    }

    // tip line
    if (tipT > 0 && state === S.PLAY) {
      ctx.globalAlpha = Math.min(1, tipT / 1.5);
      ctx.textAlign = 'center'; ctx.font = '11px ui-monospace,monospace';
      ctx.fillStyle = '#bfeaff';
      ctx.fillText('HOLD BALLAST to sink, DRAG to steer, PING to see - grab 3 crates and surface', W / 2, H * 0.62);
      ctx.globalAlpha = 1;
    }
    if (msgT > 0) {
      ctx.globalAlpha = Math.min(1, msgT / 0.8);
      ctx.textAlign = 'center'; ctx.font = 'bold 15px ui-monospace,monospace';
      ctx.fillStyle = '#ffd47a';
      ctx.fillText(msgText, W / 2, H * 0.3);
      ctx.globalAlpha = 1;
    }
  }

  uiBtns = [];
  if (state === S.OVER) drawOver();
  else if (state === S.SHOP) drawShop();
}

function drawRoundBtn(b, fill, stroke, t1, t2) {
  ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 6.283); ctx.fill(); ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = stroke;
  ctx.font = 'bold 11px ui-monospace,monospace';
  ctx.fillText(t1, b.x, b.y - 7);
  ctx.font = '10px ui-monospace,monospace';
  ctx.fillText(t2, b.x, b.y + 9);
}

function panel(y, h) {
  ctx.fillStyle = 'rgba(4,12,20,0.88)';
  ctx.fillRect(0, y, W, h);
  ctx.strokeStyle = 'rgba(110,220,255,0.35)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5);
  ctx.moveTo(0, y + h - 0.5); ctx.lineTo(W, y + h - 0.5); ctx.stroke();
}
function uiButton(x, y, w, h, label, sub2, fn, enabled) {
  ctx.fillStyle = enabled === false ? 'rgba(255,255,255,0.05)' : 'rgba(110,230,255,0.15)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = enabled === false ? 'rgba(255,255,255,0.18)' : '#7fe0ff'; ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.textAlign = 'center';
  ctx.fillStyle = enabled === false ? 'rgba(200,230,245,0.35)' : '#d6f6ff';
  ctx.font = 'bold 13px ui-monospace,monospace';
  ctx.fillText(label, x + w / 2, y + (sub2 ? h / 2 - 8 : h / 2));
  if (sub2) {
    ctx.font = '10px ui-monospace,monospace';
    ctx.fillStyle = enabled === false ? 'rgba(200,230,245,0.3)' : 'rgba(190,235,250,0.8)';
    ctx.fillText(sub2, x + w / 2, y + h / 2 + 9);
  }
  if (enabled !== false) uiBtns.push({ x: x, y: y, w: w, h: h, fn: fn });
}

function drawOver() {
  var ph = 230, py = H / 2 - ph / 2;
  panel(py, ph);
  ctx.textAlign = 'center';
  ctx.font = 'bold 24px ui-monospace,monospace';
  ctx.fillStyle = overWin ? '#9dffc4' : '#ff8a8a';
  ctx.fillText(overText, W / 2, py + 38);
  ctx.font = '12px ui-monospace,monospace';
  ctx.fillStyle = '#bfeaff';
  ctx.fillText(overWin ? 'Banked ' + sub.carry + ' salvage' : 'Salvage lost at depth', W / 2, py + 66);
  ctx.fillText('Depth reached ' + Math.floor(sub.y) + ' m   Best ' + meta.best + ' m', W / 2, py + 88);
  ctx.font = 'bold 14px ui-monospace,monospace';
  ctx.fillStyle = '#ffc45a';
  ctx.fillText('BANK: ' + meta.bank + ' SALVAGE', W / 2, py + 114);
  var bw = Math.min(240, W - 60);
  uiButton(W / 2 - bw / 2, py + 132, bw, 44, 'DIVE AGAIN', null, function () { startDive(); });
  uiButton(W / 2 - bw / 2, py + 180, bw, 40, 'DRY DOCK', 'upgrade air & hull', function () { state = S.SHOP; });
}

function drawShop() {
  var ph = 300, py = H / 2 - ph / 2;
  panel(py, ph);
  ctx.textAlign = 'center';
  ctx.font = 'bold 20px ui-monospace,monospace';
  ctx.fillStyle = '#bfeaff';
  ctx.fillText('DRY DOCK', W / 2, py + 30);
  ctx.font = 'bold 13px ui-monospace,monospace';
  ctx.fillStyle = '#ffc45a';
  ctx.fillText('BANK: ' + meta.bank + ' SALVAGE', W / 2, py + 54);
  var bw = Math.min(260, W - 50), bx = W / 2 - bw / 2;
  var ca = upAirCost(), ch = upHullCost();
  uiButton(bx, py + 72, bw, 52,
    'AIR TANKS Lv' + (meta.air + 1),
    Math.round(airMax()) + 's -> ' + Math.round(airMax() + 28) + 's   cost ' + ca,
    function () { if (meta.bank >= ca) { meta.bank -= ca; meta.air++; save(); sfxPickup(); } },
    meta.bank >= ca);
  uiButton(bx, py + 132, bw, 52,
    'HULL PLATING Lv' + (meta.hull + 1),
    'redline ' + redline() + 'm -> ' + (redline() + 340) + 'm   cost ' + ch,
    function () { if (meta.bank >= ch) { meta.bank -= ch; meta.hull++; save(); sfxPickup(); } },
    meta.bank >= ch);
  ctx.font = '10px ui-monospace,monospace';
  ctx.fillStyle = 'rgba(180,225,245,0.65)';
  ctx.fillText('best depth ' + meta.best + ' m   dives ' + meta.dives, W / 2, py + 202);
  uiButton(bx, py + 218, bw, 48, 'LAUNCH DIVE', null, function () { startDive(); });
  ctx.font = '9px ui-monospace,monospace';
  ctx.fillStyle = 'rgba(180,225,245,0.5)';
  ctx.fillText('salvage banks only when you surface alive', W / 2, py + 282);
}

// ---------- loop ----------
var last = 0;
function frame(t) {
  var dt = last ? (t - last) / 1000 : 0.016;
  last = t;
  if (dt > 0.05) dt = 0.05;
  update(dt);
  render();
  requestAnimationFrame(frame);
}
startDive();
requestAnimationFrame(frame);
})();
