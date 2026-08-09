'use strict';
/* Curbside - game: player, tricks, grinds, bails, render loop */

var cv = document.getElementById('cv');
var ctx = cv.getContext('2d', { alpha: false });
var W = 390, H = 700, DPR = 1;

function resize() {
  var cw = window.innerWidth, ch = window.innerHeight;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var longAxis = Math.max(cw, ch);
  if (longAxis * dpr > 960) dpr = 960 / longAxis;
  W = cw; H = ch; DPR = dpr;
  cv.width = Math.round(cw * dpr);
  cv.height = Math.round(ch * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', function () { setTimeout(resize, 120); });

/* ---------------- trick table ---------------- */
var TRICKS = [
  null,
  { n: 'BACKSPIN CURL', rot: -TAU, dur: 0.44, sc: 150, flip: 0, boost: 0 },
  { n: 'GUTTER WHIP', rot: TAU, dur: 0.42, sc: 130, flip: TAU, boost: 0 },
  { n: 'SKYLATCH GRAB', rot: 0, dur: 0.36, sc: 90, flip: 0, boost: -130 },
  { n: 'DROP SHOVE', rot: 0, dur: 0.32, sc: 110, flip: TAU * 1.5, boost: 0 }
];

var G = 2000;          // gravity px/s^2
var P = {};            // player
var state = 'run';
var score = 0, best = 0, distPx = 0, shake = 0, flash = 0, flashCol = '#fff';
function meters() { return Math.floor(distPx / 22); }
function total() { return score + meters(); }
var popups = [];       // {t,txt,sub,y}
var tHint = 0, timeAll = 0;
var surfBuf = [];
var camX = 0, camY = 0;

try {
  var storedBest = Number(localStorage.getItem('curbside.best') || 0);
  best = Number.isFinite(storedBest) && storedBest >= 0 ? Math.floor(storedBest) : 0;
} catch (e) { best = 0; }

function reset() {
  Input.clear();
  World.reset();
  P = {
    x: 0, y: 0, vy: 0, v: 280,
    onGround: true, seg: null,
    rot: 0, flip: 0, trick: null, tt: 0, trickRot0: 0, trickFlip0: 0,
    grind: false, grindSeg: null, bal: 0, balv: 0, grindPts: 0, grindT: 0,
    wobble: 0, airT: 0, lastLand: 0,
    combo: [], comboSum: 0,
    rag: null, tuck: 0, groundRef: 0
  };
  score = 0; distPx = 0; shake = 0; flash = 0;
  popups.length = 0; Parts.reset();
  camX = -W * 0.30; camY = -H * 0.66;
  World.gen(P.x + W * 2, 0);
  state = 'run'; tHint = 0;
  SFX.grindStop();
}

/* ---------------- combo / scoring ---------------- */
function pop(t, sub) {
  popups.push({ t: 0, txt: t, sub: sub });
  if (popups.length > 4) popups.shift();
}
function addCombo(name, val) {
  P.combo.push(name); P.comboSum += val;
  pop(name, '+' + val);
}
function bankCombo(mulOK) {
  if (!P.combo.length) return;
  var mult = mulOK ? P.combo.length : 1;
  var got = Math.round(P.comboSum * mult);
  score += got;
  pop(mult > 1 ? 'x' + mult + ' LANDED' : 'LANDED', '+' + got);
  flash = 0.3; flashCol = mult > 2 ? '#7bf7c0' : '#ffe08a';
  SFX.chime(Math.min(mult, 6));
  P.combo.length = 0; P.comboSum = 0;
}

/* ---------------- tricks ---------------- */
function startTrick(i) {
  var t = TRICKS[i];
  if (!t || P.trick) return;
  P.trick = t; P.tt = 0; P.trickRot0 = P.rot; P.trickFlip0 = P.flip;
  if (t.boost && P.vy > -120) P.vy += t.boost;
  P.tuck = (i === 3) ? 1 : 0;
  SFX.trick(i);
  Parts.spawn(P.x, P.y - 10, 5, { c: '#8fd6ff', s0: 1.5, s1: 3, g: 200, l1: 0.35 });
}

function popOff(power) {
  P.onGround = false; P.grind = false;
  if (P.grindSeg) endGrind();
  P.vy = -power;
  P.airT = 0;
  SFX.ollie();
  Parts.spawn(P.x, P.y, 7, { c: '#cfd6e6', vy0: -40, vy1: 40, s0: 1.5, s1: 3, l1: 0.4 });
}

/* ---------------- grind ---------------- */
function startGrind(s, y) {
  P.grind = true; P.grindSeg = s; P.y = y; P.vy = 0; P.onGround = false;
  P.bal = rnd(-0.12, 0.12); P.balv = 0; P.grindPts = 0; P.grindT = 0;
  P.trick = null; P.rot = 0; P.flip = 0;
  SFX.grindStart();
  pop(s.k === 'rail' ? 'RAIL SLIDE' : 'LEDGE GRIND', 'HOLD IT');
}
function endGrind() {
  if (P.grindPts > 0) addCombo('GRIND ' + Math.round(P.grindT * 10) / 10 + 's', Math.round(P.grindPts));
  P.grind = false; P.grindSeg = null; P.grindPts = 0;
  SFX.grindStop();
}

/* ---------------- bail ---------------- */
function bail(reason) {
  if (state !== 'run') return;
  state = 'bail';
  SFX.grindStop(); SFX.bail();
  P.combo.length = 0; P.comboSum = 0;
  shake = 18; flash = 0.45; flashCol = '#ff5b6e';
  P.rag = {
    x: P.x, y: P.y - 16, vx: P.v * 0.55, vy: -rnd(220, 380), rot: P.rot, rv: rnd(-9, 9),
    bx: P.x, by: P.y, bvx: P.v * 0.8 + rnd(0, 120), bvy: -rnd(160, 300), brot: 0, brv: rnd(-14, 14),
    t: 0, reason: reason
  };
  Parts.spawn(P.x, P.y - 14, 26, { c: '#ff8fa0', vx0: -180, vx1: 220, vy0: -320, vy1: 40, s0: 2, s1: 5, l1: 0.9, sq: true });
  Parts.spawn(P.x, P.y, 14, { c: '#cfd6e6', vx0: -120, vx1: 180, vy0: -160, vy1: 0, l1: 0.7 });
}

function gameOver() {
  state = 'over';
  if (total() > best) {
    best = total();
    try { localStorage.setItem('curbside.best', String(best)); } catch (e) { }
  }
}

/* ---------------- update ---------------- */
function update(dt) {
  timeAll += dt; tHint += dt;
  shake = Math.max(0, shake - dt * 48);
  flash = Math.max(0, flash - dt * 1.9);
  for (var i = popups.length - 1; i >= 0; i--) { popups[i].t += dt; if (popups[i].t > 1.3) popups.splice(i, 1); }
  Parts.update(dt);
  World.update(dt);

  if (state === 'run') updateRun(dt);
  else if (state === 'bail') {
    var r = P.rag; r.t += dt;
    P.v *= Math.pow(0.16, dt);
    var groundY = bestSurfaceY(r.x);
    r.vy += G * dt; r.x += r.vx * dt; r.y += r.vy * dt; r.rot += r.rv * dt; r.vx *= Math.pow(0.55, dt);
    if (groundY !== null && r.y > groundY - 12) { r.y = groundY - 12; r.vy *= -0.34; r.rv *= 0.5; r.vx *= 0.6; if (Math.abs(r.vy) > 60) Parts.spawn(r.x, groundY, 5, { c: '#9aa4bb', l1: 0.4 }); }
    var gb = bestSurfaceY(r.bx);
    r.bvy += G * dt; r.bx += r.bvx * dt; r.by += r.bvy * dt; r.brot += r.brv * dt; r.bvx *= Math.pow(0.7, dt);
    if (gb !== null && r.by > gb - 3) { r.by = gb - 3; r.bvy *= -0.4; r.brv *= 0.6; }
    camX = lerp(camX, r.x - W * 0.34, 1 - Math.pow(0.001, dt));
    camY = lerp(camY, r.y - H * 0.6, 1 - Math.pow(0.004, dt));
    if (r.t > 1.15) gameOver();
    if (r.t > 0.4 && (Input.tapPress || Input.tapQuick)) { gameOver(); }
  } else if (state === 'over') {
    if (Input.tapPress || Input.tapQuick) reset();
  }
}

function bestSurfaceY(x) {
  World.surfaces(x, surfBuf);
  var y = null;
  for (var i = 0; i < surfBuf.length; i++) if (y === null || surfBuf[i].y > y) y = surfBuf[i].y;
  return y;
}

function updateRun(dt) {
  var i, s;
  // ---- speed ----
  P.v = clamp(P.v + 5 * dt, 240, 660);
  P.x += P.v * dt;
  distPx += P.v * dt;
  P.wobble = Math.max(0, P.wobble - dt * 2.5);

  World.gen(P.x + W * 2.2, distPx);
  World.prune(P.x - W * 1.2);

  // ---- input ----
  var sw = Input.swipe;
  if (P.grind) {
    if (Input.tapQuick) { addCombo('POP OUT', 40); popOff(600); }
  } else if (P.onGround) {
    if (Input.tapPress) popOff(660);
  } else {
    if (sw === 3) {
      if (!tryLatchGrind()) startTrick(3);
    } else if (sw) startTrick(sw);
  }

  // ---- grinding ----
  if (P.grind) {
    var gs = P.grindSeg;
    P.grindT += dt;
    var pts = 45 * dt * (1 + P.grindT * 0.5);
    P.grindPts += pts;
    P.y = World.segY(gs, clamp(P.x, gs.x0, gs.x1));
    // balance
    var ctrl = Input.balance();
    P.balv += (P.bal * 3.4 + Math.sin(timeAll * 7.3) * 0.35 + rnd(-1.1, 1.1)) * dt;
    P.balv -= ctrl * 4.6 * dt;
    P.balv = clamp(P.balv, -3.2, 3.2);
    P.bal += P.balv * dt;
    if (Math.abs(P.bal) >= 1) { bail('lost balance'); return; }
    P.groundRef = P.y;
    Parts.spawn(P.x - 10, P.y, 1, { c: '#ffe66d', vx0: -220, vx1: -60, vy0: -120, vy1: -20, s0: 1, s1: 2.4, l1: 0.35, g: 700 });
    if (P.x > gs.x1) { endGrind(); P.onGround = false; P.vy = -180; }
    camFollow(dt);
    return;
  }

  // ---- vertical ----
  var prevY = P.y;
  if (P.onGround) {
    // stick to surface / step off
    World.surfaces(P.x, surfBuf);
    var found = null;
    for (i = 0; i < surfBuf.length; i++) {
      var c = surfBuf[i];
      if (c.y >= P.y - 7 && c.y <= P.y + 16) { if (found === null || c.y < found.y) found = c; }
    }
    if (found) { P.y = found.y; P.seg = found.s; P.groundRef = P.y; P.rot = lerp(P.rot, 0, 1 - Math.pow(0.001, dt)); }
    else { P.onGround = false; P.vy = 40; P.airT = 0; }
  }
  if (!P.onGround) {
    P.airT += dt;
    P.vy += G * dt;
    P.y += P.vy * dt;
    // trick anim
    if (P.trick) {
      P.tt += dt / P.trick.dur;
      var e = easeOut(clamp(P.tt, 0, 1));
      P.rot = P.trickRot0 + P.trick.rot * e;
      P.flip = P.trickFlip0 + P.trick.flip * e;
      if (P.tt >= 1) {
        P.rot = 0; P.flip = 0;
        addCombo(P.trick.n, P.trick.sc);
        P.trick = null; P.tuck = 0;
      }
    }
    // land?
    World.surfaces(P.x, surfBuf);
    var hit = null;
    for (i = 0; i < surfBuf.length; i++) {
      var su = surfBuf[i];
      if (prevY <= su.y + 2 && P.y >= su.y && P.vy > 0) { if (hit === null || su.y < hit.y) hit = su; }
    }
    if (hit) land(hit);
    else if (P.y > P.groundRef + 250) { bail('fell in the gap'); return; }
  }

  // ---- obstacle collision ----
  var bx0 = P.x - 11, bx1 = P.x + 11, by0 = P.y - 34, by1 = P.y - 2;
  for (i = 0; i < World.obs.length; i++) {
    var o = World.obs[i];
    if (bx1 > o.x && bx0 < o.x + o.w && by1 > o.y && by0 < o.y + o.h) { bail('clipped it'); return; }
  }
  for (i = 0; i < World.cars.length; i++) {
    var car = World.cars[i];
    if (bx1 > car.x + 4 && bx0 < car.x + car.w - 4 && by1 > car.y + 5 && by0 < car.y + car.h) { bail('ate a bumper'); return; }
  }

  camFollow(dt);
}

function camFollow(dt) {
  camX = P.x - W * 0.30;
  camY = lerp(camY, P.groundRef - H * 0.66, 1 - Math.pow(0.02, dt));
}

function tryLatchGrind() {
  for (var i = 0; i < World.segs.length; i++) {
    var s = World.segs[i];
    if (s.k !== 'rail' && s.k !== 'ledge') continue;
    if (P.x < s.x0 - 18 || P.x > s.x1) continue;
    var y = World.segY(s, clamp(P.x, s.x0, s.x1));
    if (P.y > y - 46 && P.y < y + 16) { startGrind(s, y); return true; }
  }
  return false;
}

function land(hit) {
  var s = hit.s;
  // grindable surface -> auto slide
  if ((s.k === 'rail' || s.k === 'ledge') && P.x < s.x1 - 8) {
    if (P.trick && P.tt < 0.85) { bail('caught the lip'); return; }
    if (P.trick) { addCombo(P.trick.n, P.trick.sc); P.trick = null; }
    startGrind(s, hit.y);
    return;
  }
  var err = Math.abs(angNorm(P.rot));
  var mid = P.trick ? P.tt : 1;          // how far through the trick we are
  P.y = hit.y; P.vy = 0; P.onGround = true; P.seg = s; P.tuck = 0; P.groundRef = P.y;

  if (mid < 0.7 || err > 0.85) {
    P.trick = null;
    bail(mid < 0.7 ? 'landed mid-rotation' : 'landed sideways');
    return;
  }
  if (P.trick) {
    // scrappy but survivable: near-finished rotation snaps upright, half credit
    var full = mid >= 0.88;
    addCombo(P.trick.n + (full ? '' : ' (SCRAPPY)'), Math.round(P.trick.sc * (full ? 1 : 0.5)));
    P.trick = null;
    if (!full) err = 0.6;
  }
  P.rot = 0; P.flip = 0;

  if (err < 0.34) {           // clean
    P.v = Math.min(660, P.v + (P.combo.length ? 26 : 8));
    bankCombo(true);
    SFX.land(true);
    Parts.spawn(P.x, P.y, 8, { c: '#cfd6e6', vx0: -140, vx1: -20, vy0: -110, vy1: -10, l1: 0.45 });
  } else {                    // sketchy
    P.v = Math.max(240, P.v - 80);
    P.wobble = 1;
    bankCombo(false);
    shake = Math.max(shake, 7);
    SFX.land(false);
    Parts.spawn(P.x, P.y, 12, { c: '#ffb35c', vx0: -180, vx1: 40, vy0: -140, vy1: 0, l1: 0.5 });
  }
  P.lastLand = timeAll;
}

/* ---------------- render ---------------- */
function hash(n) { var x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); }

function drawSky() {
  var g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#191233');
  g.addColorStop(0.45, '#3b2350');
  g.addColorStop(0.72, '#8b3f63');
  g.addColorStop(1, '#e0714f');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // stars
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  for (var i = 0; i < 34; i++) {
    var sx = hash(i) * W, sy = hash(i + 90) * H * 0.42;
    var tw = 0.5 + 0.5 * Math.sin(timeAll * 2 + i);
    ctx.globalAlpha = 0.25 + tw * 0.4;
    ctx.fillRect(sx, sy, 1.6, 1.6);
  }
  ctx.globalAlpha = 1;
  // sun
  var sunY = H * 0.52 - camY * 0.02, sunX = W * 0.72;
  var sg = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 150);
  sg.addColorStop(0, 'rgba(255,196,120,0.42)');
  sg.addColorStop(0.35, 'rgba(255,140,110,0.18)');
  sg.addColorStop(1, 'rgba(255,120,120,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(sunX - 150, sunY - 150, 300, 300);
}

function drawSkyline(par, bw, hmin, hmax, col, baseFrac) {
  var startX = camX * par;
  var i0 = Math.floor(startX / bw) - 1, n = Math.ceil(W / bw) + 3;
  var baseY = H * baseFrac - camY * par * 0.35;
  ctx.fillStyle = col;
  for (var i = 0; i < n; i++) {
    var idx = i0 + i;
    var h = hmin + hash(idx * 1.7) * (hmax - hmin);
    var x = idx * bw - startX;
    ctx.fillRect(x, baseY - h, bw - 3, h + H + 400);
    // windows
    if (par > 0.28) {
      ctx.fillStyle = 'rgba(255,214,140,0.20)';
      for (var wy = baseY - h + 12; wy < baseY - 8; wy += 18) {
        for (var wx = x + 6; wx < x + bw - 10; wx += 14) {
          if (hash(wx * 0.31 + wy * 0.77 + idx) > 0.55) ctx.fillRect(wx, wy, 5, 8);
        }
      }
      ctx.fillStyle = col;
    }
  }
}

function drawWorld() {
  var bottom = camY + H + 60;
  // ground bodies
  for (var i = 0; i < World.segs.length; i++) {
    var s = World.segs[i];
    if (s.x1 < camX - 40 || s.x0 > camX + W + 40) continue;
    var x0 = s.x0 - camX, x1 = s.x1 - camX, y0 = s.y0 - camY, y1 = s.y1 - camY;
    if (s.k === 'street' || s.k === 'stair' || s.k === 'ramp') {
      ctx.fillStyle = '#2a2739';
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x1, H + 60); ctx.lineTo(x0, H + 60); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = s.k === 'stair' ? '#6f6a92' : '#57527a';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x0, y0 - 1); ctx.lineTo(x1, y1 - 1); ctx.stroke();
      if (s.k === 'street' && s.x1 - s.x0 > 120) {
        ctx.strokeStyle = 'rgba(255,225,140,0.35)'; ctx.lineWidth = 2;
        ctx.setLineDash([16, 22]);
        ctx.beginPath(); ctx.moveTo(x0, y0 + 26); ctx.lineTo(x1, y1 + 26); ctx.stroke();
        ctx.setLineDash([]);
      }
    } else if (s.k === 'ledge') {
      ctx.fillStyle = '#3c3752';
      ctx.fillRect(x0, y0, x1 - x0, 40);
      ctx.fillStyle = '#8ff0d4';
      ctx.fillRect(x0, y0 - 3, x1 - x0, 4);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x0, y0 + 22, x1 - x0, 18);
    } else if (s.k === 'rail') {
      // posts
      ctx.strokeStyle = '#5b6c86'; ctx.lineWidth = 4;
      for (var px = x0 + 8; px < x1; px += 62) {
        var t = (px - x0) / Math.max(1, x1 - x0);
        var py = y0 + (y1 - y0) * t;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py + 48); ctx.stroke();
      }
      ctx.strokeStyle = '#63e6ff'; ctx.lineWidth = 7; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x0, y0 - 2); ctx.lineTo(x1, y1 - 2); ctx.stroke();
      ctx.lineCap = 'butt';
    }
  }
  // obstacles
  for (var j = 0; j < World.obs.length; j++) {
    var o = World.obs[j];
    if (o.x + o.w < camX - 20 || o.x > camX + W + 20) continue;
    var ox = o.x - camX, oy = o.y - camY;
    if (o.k === 'hydrant') {
      ctx.fillStyle = '#e8524f';
      ctx.fillRect(ox, oy + 6, o.w, o.h - 6);
      ctx.fillRect(ox - 4, oy + 12, o.w + 8, 6);
      ctx.beginPath(); ctx.arc(ox + o.w / 2, oy + 6, o.w / 2, 0, TAU); ctx.fill();
    } else if (o.k === 'cone') {
      ctx.fillStyle = '#ff8a3d';
      ctx.beginPath(); ctx.moveTo(ox + o.w / 2, oy); ctx.lineTo(ox + o.w + 3, oy + o.h); ctx.lineTo(ox - 3, oy + o.h); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffe9d6'; ctx.fillRect(ox - 1, oy + o.h * 0.45, o.w + 2, 4);
    }
  }
  // cars
  for (var k = 0; k < World.cars.length; k++) {
    var c = World.cars[k];
    if (c.x + c.w < camX - 40 || c.x > camX + W + 40) continue;
    var cx = c.x - camX, cy = c.y - camY;
    ctx.fillStyle = 'hsl(' + c.hue + ',48%,44%)';
    ctx.fillRect(cx, cy + 16, c.w, c.h - 16);
    ctx.beginPath();
    ctx.moveTo(cx + 18, cy + 16); ctx.lineTo(cx + 34, cy); ctx.lineTo(cx + 84, cy); ctx.lineTo(cx + 100, cy + 16);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(180,230,255,0.55)';
    ctx.fillRect(cx + 36, cy + 3, 44, 12);
    ctx.fillStyle = '#141220';
    ctx.beginPath(); ctx.arc(cx + 26, cy + c.h, 12, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + c.w - 26, cy + c.h, 12, 0, TAU); ctx.fill();
    if (c.vx) { ctx.fillStyle = 'rgba(255,240,180,0.75)'; ctx.fillRect(cx - 4, cy + 26, 6, 7); }
  }
  // props
  for (var m = 0; m < World.props.length; m++) {
    var pr = World.props[m];
    if (pr.x < camX - 20 || pr.x > camX + W + 20) continue;
    var qx = pr.x - camX, qy = pr.y - camY;
    if (pr.k === 'post') { ctx.fillStyle = '#4a4665'; ctx.fillRect(qx, qy - 74, 5, 74); ctx.fillStyle = '#ffd98a'; ctx.fillRect(qx - 5, qy - 80, 16, 7); }
    else if (pr.k === 'trash') { ctx.fillStyle = '#3f4a5c'; ctx.fillRect(qx, qy - 30, 22, 30); ctx.fillStyle = '#586479'; ctx.fillRect(qx - 2, qy - 34, 26, 5); }
    else { ctx.fillStyle = '#4a4665'; ctx.fillRect(qx, qy - 16, 8, 16); }
  }
}

function drawSkater(x, y, rot, flip, grinding, tuck, wob) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot + (wob ? Math.sin(timeAll * 40) * 0.09 * wob : 0));
  // board
  var sx = Math.cos(flip);
  ctx.save();
  ctx.scale(sx < 0 ? Math.min(-0.12, sx) : Math.max(0.12, sx), 1);
  ctx.fillStyle = '#f2f3f8';
  ctx.beginPath();
  ctx.moveTo(-22, 0); ctx.quadraticCurveTo(-25, -6, -18, -6);
  ctx.lineTo(18, -6); ctx.quadraticCurveTo(25, -6, 22, 0);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#f2a33c';
  ctx.fillRect(-16, -6, 32, 2.5);
  ctx.fillStyle = '#201c2e';
  ctx.beginPath(); ctx.arc(-12, 3, 3.4, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(12, 3, 3.4, 0, TAU); ctx.fill();
  ctx.restore();
  // legs
  var kneeUp = tuck ? 10 : 0;
  ctx.strokeStyle = '#3d6ee0'; ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-11, -6); ctx.lineTo(-6, -20 + kneeUp * 0.4); ctx.lineTo(-2, -28 + kneeUp);
  ctx.moveTo(11, -6); ctx.lineTo(7, -20 + kneeUp * 0.4); ctx.lineTo(2, -28 + kneeUp);
  ctx.stroke();
  // torso
  ctx.fillStyle = '#e94f6a';
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(-8, -48 + kneeUp, 16, 22, 5) : ctx.rect(-8, -48 + kneeUp, 16, 22);
  ctx.fill();
  // arms
  ctx.strokeStyle = '#f0d3b0'; ctx.lineWidth = 5;
  ctx.beginPath();
  if (grinding) {
    ctx.moveTo(-4, -44 + kneeUp); ctx.lineTo(-20, -54); ctx.moveTo(4, -44 + kneeUp); ctx.lineTo(20, -52);
  } else if (tuck) {
    ctx.moveTo(-4, -42 + kneeUp); ctx.lineTo(-14, -26); ctx.moveTo(4, -42 + kneeUp); ctx.lineTo(12, -30);
  } else {
    ctx.moveTo(-4, -44); ctx.lineTo(-18, -34); ctx.moveTo(4, -44); ctx.lineTo(16, -50);
  }
  ctx.stroke();
  // head
  ctx.fillStyle = '#f0d3b0';
  ctx.beginPath(); ctx.arc(0, -56 + kneeUp, 8, 0, TAU); ctx.fill();
  ctx.fillStyle = '#2a2739';
  ctx.beginPath(); ctx.arc(0, -58 + kneeUp, 8.4, Math.PI * 1.02, TAU * 1.02); ctx.fill();
  ctx.fillRect(2, -60 + kneeUp, 11, 3);
  ctx.lineCap = 'butt';
  ctx.restore();
}

function drawRagdoll(r) {
  ctx.save();
  ctx.translate(r.x - camX, r.y - camY); ctx.rotate(r.rot);
  ctx.fillStyle = '#e94f6a';
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-8, -12, 16, 24, 5) : ctx.rect(-8, -12, 16, 24); ctx.fill();
  ctx.strokeStyle = '#3d6ee0'; ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-4, 10); ctx.lineTo(-12, 26); ctx.moveTo(4, 10); ctx.lineTo(14, 22); ctx.stroke();
  ctx.strokeStyle = '#f0d3b0'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(-4, -8); ctx.lineTo(-20, -16); ctx.moveTo(4, -8); ctx.lineTo(18, -18); ctx.stroke();
  ctx.fillStyle = '#f0d3b0'; ctx.beginPath(); ctx.arc(0, -20, 8, 0, TAU); ctx.fill();
  ctx.fillStyle = '#2a2739'; ctx.beginPath(); ctx.arc(0, -22, 8.4, Math.PI, TAU); ctx.fill();
  ctx.lineCap = 'butt';
  ctx.restore();
  ctx.save();
  ctx.translate(r.bx - camX, r.by - camY); ctx.rotate(r.brot);
  ctx.fillStyle = '#f2f3f8'; ctx.fillRect(-22, -5, 44, 6);
  ctx.fillStyle = '#201c2e';
  ctx.beginPath(); ctx.arc(-12, 3, 3.4, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(12, 3, 3.4, 0, TAU); ctx.fill();
  ctx.restore();
}

function txt(s, x, y, size, col, align, weight) {
  ctx.font = (weight || '700') + ' ' + size + 'px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = col;
  ctx.fillText(s, x, y);
}

function drawHUD() {
  ctx.save();
  // score panel
  ctx.fillStyle = 'rgba(12,10,22,0.42)';
  ctx.fillRect(0, 0, W, 62);
  txt(String(total()), 14, 34, 30, '#ffffff');
  txt('SCORE', 14, 50, 11, 'rgba(255,255,255,0.55)');
  txt(meters() + ' m', W - 14, 30, 20, '#8ff0d4', 'right');
  txt('BEST ' + best, W - 14, 50, 12, 'rgba(255,255,255,0.55)', 'right');

  // speed bar
  var sp = (P.v - 240) / (660 - 240);
  ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(14, 56, W - 28, 4);
  ctx.fillStyle = sp > 0.75 ? '#ff8a3d' : '#63e6ff'; ctx.fillRect(14, 56, (W - 28) * clamp(sp, 0, 1), 4);

  // combo
  if (state === 'run' && P.combo.length) {
    var cy = 96;
    txt('x' + P.combo.length + '  ' + Math.round(P.comboSum), W / 2, cy, 30, '#ffe08a', 'center');
    txt(P.combo[P.combo.length - 1], W / 2, cy + 20, 13, 'rgba(255,255,255,0.75)', 'center');
  }

  // popups: newest on top, fixed rows so they never overlap
  var rows = Math.min(popups.length, 3);
  for (var i = 0; i < rows; i++) {
    var p = popups[popups.length - 1 - i];
    var a = clamp((1.3 - p.t) * 1.4, 0, 1) * (i === 0 ? 1 : 0.6);
    if (a <= 0.02) continue;
    ctx.globalAlpha = a;
    var py = H * 0.26 + i * 34 - clamp(p.t, 0, 0.3) * 18;
    var sz = i === 0 ? 20 : 15;
    txt(p.txt, W / 2, py, sz, '#ffffff', 'center');
    txt(p.sub, W / 2, py + sz - 2, i === 0 ? 14 : 11, '#8ff0d4', 'center');
    ctx.globalAlpha = 1;
  }

  // balance meter
  if (state === 'run' && P.grind) {
    var bw = Math.min(260, W - 60), bx = (W - bw) / 2, by = H - 92;
    ctx.fillStyle = 'rgba(10,8,18,0.6)'; ctx.fillRect(bx - 4, by - 16, bw + 8, 34);
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(bx, by, bw, 8);
    var dang = Math.abs(P.bal);
    ctx.fillStyle = dang > 0.7 ? '#ff5b6e' : (dang > 0.4 ? '#ffb35c' : '#8ff0d4');
    ctx.fillRect(bx + bw / 2 - 2, by - 5, 4, 18);
    var kx = bx + bw / 2 + P.bal * bw / 2;
    ctx.fillRect(kx - 7, by - 7, 14, 22);
    txt('DRAG TO BALANCE  •  TAP TO POP OUT', W / 2, by - 22, 12, 'rgba(255,255,255,0.8)', 'center');
  }

  // hint line
  if (state === 'run' && tHint < 7) {
    ctx.globalAlpha = clamp(7 - tHint, 0, 1);
    ctx.fillStyle = 'rgba(10,8,18,0.55)';
    ctx.fillRect(0, H - 66, W, 34);
    txt('TAP = OLLIE  •  SWIPE IN THE AIR = TRICK', W / 2, H - 44, 14, '#ffffff', 'center');
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawOver() {
  ctx.fillStyle = 'rgba(10,8,18,0.72)';
  ctx.fillRect(0, 0, W, H);
  var cy = H * 0.32;
  txt('BAILED', W / 2, cy, 46, '#ff5b6e', 'center');
  txt(P.rag ? P.rag.reason.toUpperCase() : '', W / 2, cy + 24, 14, 'rgba(255,255,255,0.6)', 'center');
  txt(String(total()), W / 2, cy + 92, 56, '#ffffff', 'center');
  txt('TRICKS ' + score + '   •   DISTANCE ' + meters(), W / 2, cy + 114, 12, 'rgba(255,255,255,0.55)', 'center');
  txt(meters() + ' m', W / 2, cy + 152, 22, '#8ff0d4', 'center');
  txt('BEST  ' + best, W / 2, cy + 182, 18, '#ffe08a', 'center');
  var pulse = 0.6 + 0.4 * Math.sin(timeAll * 4);
  ctx.globalAlpha = pulse;
  txt('TAP TO SKATE AGAIN', W / 2, H * 0.82, 20, '#ffffff', 'center');
  ctx.globalAlpha = 1;
  txt('space / tap  ollie   •   arrows / swipe  tricks', W / 2, H * 0.82 + 26, 12, 'rgba(255,255,255,0.5)', 'center');
}

function render() {
  ctx.save();
  if (shake > 0.2) ctx.translate(rnd(-shake, shake) * 0.5, rnd(-shake, shake) * 0.5);
  drawSky();
  drawSkyline(0.10, 74, 90, 230, '#241b3d', 0.70);
  drawSkyline(0.24, 58, 70, 190, '#2c2049', 0.76);
  drawSkyline(0.45, 46, 40, 130, '#332457', 0.82);
  drawWorld();
  Parts.draw(ctx);
  if (state === 'bail' && P.rag) drawRagdoll(P.rag);
  else {
    var sx = P.x - camX, sy = P.y - camY;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    var gy = bestSurfaceY(P.x);
    if (gy !== null) { ctx.beginPath(); ctx.ellipse(sx, gy - camY, 20, 5, 0, 0, TAU); ctx.fill(); }
    drawSkater(sx, sy, P.rot, P.flip, P.grind, P.tuck, P.wobble);
  }
  ctx.restore();
  if (flash > 0.01) { ctx.globalAlpha = flash * 0.5; ctx.fillStyle = flashCol; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  drawHUD();
  if (state === 'over') drawOver();
}

/* ---------------- loop ---------------- */
var last = 0;
function frame(now) {
  if (!last) last = now;
  var dt = (now - last) / 1000; last = now;
  if (dt > 0.05) dt = 0.05;
  if (window.innerWidth !== W || window.innerHeight !== H) resize();
  update(dt);
  render();
  Input.endFrame();
  requestAnimationFrame(frame);
}

resize();
Input.bind(cv);
reset();
requestAnimationFrame(frame);
document.addEventListener('visibilitychange', function () { if (document.hidden) { SFX.grindStop(); } last = 0; });
