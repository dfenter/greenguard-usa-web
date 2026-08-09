'use strict';
/* Steamline - route the trains, keep the line clear. Original work. */

var COLORS = ['#ef4444', '#38bdf8', '#fbbf24', '#34d399', '#a78bfa', '#fb7185'];
var BASE_SPEED = 60, DECEL = 82, ACCEL = 72;
var DWELL = 1.0, FOLLOW_GAP = 34, COLLIDE_DIST = 16, PATIENCE = 34;
var START_STATIONS = 2, GROW_EVERY = 2;

var cv = document.getElementById('cv');
var ctx = cv.getContext('2d', { alpha: false });
var elScore = document.getElementById('score');
var elCombo = document.getElementById('combo'), elStat = document.getElementById('stat');
var elTT = document.getElementById('tt'), elHint = document.getElementById('hint');
var elFlash = document.getElementById('flash'), elOver = document.getElementById('over');
var elOScore = document.getElementById('oscore'), elOBest = document.getElementById('obest');
var elBtn = document.getElementById('btn');

var vw = 0, vh = 0, dpr = 1;
function resize(){
  vw = window.innerWidth; vh = window.innerHeight;
  var d = Math.min(2, window.devicePixelRatio || 1);
  var mx = Math.max(vw, vh);
  if (mx * d > 960) d = 960 / mx;
  dpr = d;
  cv.width = Math.round(vw * d); cv.height = Math.round(vh * d);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', function(){ setTimeout(resize, 120); });

/* ---------- audio (WebAudio only) ---------- */
var actx = null;
function audio(){
  if (!actx){
    var C = window.AudioContext || window.webkitAudioContext;
    if (C) actx = new C();
  }
  if (actx && actx.state === 'suspended') actx.resume();
  return actx;
}
function beep(freq, dur, type, vol, slide){
  var a = audio(); if (!a) return;
  var o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
  o.type = type || 'square'; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol || 0.08, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol){
  var a = audio(); if (!a) return;
  var n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
  for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
  var src = a.createBufferSource(), g = a.createGain(), f = a.createBiquadFilter();
  src.buffer = buf; f.type = 'lowpass'; f.frequency.value = 900;
  g.gain.value = vol || 0.3;
  src.connect(f); f.connect(g); g.connect(a.destination); src.start();
}

/* ---------- game state ---------- */
var spine = buildSpine();
var G = null;
var best = 0;
var overTimer = null;
try {
  var storedBest = Number(localStorage.getItem('steamline.best') || 0);
  best = Number.isFinite(storedBest) && storedBest >= 0 ? Math.floor(storedBest) : 0;
} catch (e) { best = 0; }

function newGame(){
  if (overTimer) { clearTimeout(overTimer); overTimer = null; }
  ptrs.clear(); panned = false; downT = 0; downPos = null; pinch = null; lastTap = 0; lastTapPos = null;
  var seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
  G = {
    rng: mulberry32(seed),
    net: null,
    trains: [],
    parts: [],
    queue: [],
    score: 0, combo: 0, delivered: 0, missed: 0,
    time: 0, nextSpawn: 2.2, interval: 6.4,
    over: false, shake: 0, hintT: 0, sel: -1,
    cam: { x: 0, y: 0, s: 1 },
    tween: null
  };
  G.net = buildNet(spine, START_STATIONS, COLORS);
  fillQueue();
  fitCam(true);
  elOver.classList.remove('on');
  elHint.style.opacity = '1';
  updateHUD(true);
}

function fillQueue(){
  while (G.queue.length < 4){
    var at = G.queue.length ? G.queue[G.queue.length - 1].t + G.interval : G.time + G.nextSpawn;
    G.queue.push({ color: COLORS[Math.floor(G.rng() * G.net.n)], t: at });
  }
}
function retimeQueue(){
  for (var i = 0; i < G.queue.length; i++)
    G.queue[i].t = (i ? G.queue[i-1].t : G.time) + G.interval;
}

/* ---------- camera ---------- */
function padded(){ return { t: 108, b: 62, x: 14 }; }
function tweenTo(x, y, s){
  G.tween = { x0: G.cam.x, y0: G.cam.y, s0: G.cam.s, x: x, y: y, s: s, k: 0 };
}
function fitCam(instant){
  var b = netBounds(G.net), p = padded();
  var aw = Math.max(60, vw - p.x * 2), ah = Math.max(60, vh - p.t - p.b);
  var s = Math.min(aw / (b.x1 - b.x0), ah / (b.y1 - b.y0));
  s = Math.max(0.28, Math.min(2.4, s));
  var cx = (b.x0 + b.x1) / 2;
  var cy = (b.y0 + b.y1) / 2 - (p.t - p.b) / 2 / s;
  if (instant){ G.cam.x = cx; G.cam.y = cy; G.cam.s = s; G.tween = null; }
  else tweenTo(cx, cy, s);
}
function w2s(x, y){ return { x: (x - G.cam.x) * G.cam.s + vw / 2, y: (y - G.cam.y) * G.cam.s + vh / 2 }; }
function s2w(x, y){ return { x: (x - vw / 2) / G.cam.s + G.cam.x, y: (y - vh / 2) / G.cam.s + G.cam.y }; }

/* ---------- trains ---------- */
function spawnTrain(color){
  G.trains.push({
    color: color, edge: 0, s: 0, v: BASE_SPEED * 0.5,
    hold: false, dwell: 0, stationDone: false, done: false,
    patience: PATIENCE, x: 0, y: 0, tx: 0, ty: 1, id: Math.random()
  });
  beep(180, 0.09, 'triangle', 0.05, 260);
}
function entryBlocked(){
  for (var i = 0; i < G.trains.length; i++){
    var t = G.trains[i];
    if (t.edge === 0 && t.s < 46) return true;
  }
  return false;
}

function gapAhead(tr){
  var net = G.net, e = net.edges[tr.edge];
  var kids = childrenIdx(net, tr.edge), best = Infinity;
  for (var i = 0; i < G.trains.length; i++){
    var o = G.trains[i]; if (o === tr) continue;
    if (o.edge === tr.edge){ if (o.s > tr.s) best = Math.min(best, o.s - tr.s); }
    else if (kids.indexOf(o.edge) >= 0) best = Math.min(best, (e.len - tr.s) + o.s);
  }
  return best;
}

function deliver(tr, seg){
  var st = G.net.stations[seg];
  if (st.color === tr.color){
    var onTime = tr.patience > 0;
    var pts = onTime ? Math.round(100 * (1 + Math.min(G.combo, 12) * 0.1)) : 40;
    G.score += pts;
    if (onTime) G.combo++; else G.combo = 0;
    G.delivered++;
    tr.done = true;
    burst(st.x, st.y, tr.color, onTime ? 22 : 12);
    flash(onTime ? 'rgba(103,232,249,.16)' : 'rgba(251,191,36,.14)');
    popup(st.x, st.y, '+' + pts, onTime ? '#a7f0fb' : '#fbbf24');
    beep(onTime ? 620 : 400, 0.11, 'triangle', 0.09, onTime ? 940 : 430);
    if (onTime) setTimeout(function(){ beep(880, 0.09, 'triangle', 0.06); }, 70);
    G.shake = Math.min(G.shake + 2.5, 7);
    if (G.delivered % GROW_EVERY === 0) grow();
  } else {
    burst(st.x, st.y, '#64748b', 8);
    popup(st.x, st.y, 'WRONG STOP', '#94a3b8');
    beep(150, 0.14, 'sawtooth', 0.05, 90);
  }
}

function grow(){
  var net = G.net;
  if (net.n >= NET_MAX) return;
  var sw = net.sw.slice();
  var nn = buildNet(spine, net.n + 1, COLORS);
  for (var i = 0; i < sw.length; i++) nn.sw[i] = sw[i];
  for (var j = 0; j < G.trains.length; j++)
    if (G.trains[j].edge === net.exitIdx) G.trains[j].edge = 1 + 2 * net.n;
  G.net = nn;
  var st = nn.stations[nn.n - 1];
  burst(st.x, st.y, st.color, 26);
  popup(st.x, st.y, 'NEW STATION', st.color);
  beep(300, 0.16, 'triangle', 0.07, 700);
  fitCam(false);
}

/* ---------- particles / feedback ---------- */
function burst(x, y, color, n){
  for (var i = 0; i < n; i++){
    var a = Math.random() * Math.PI * 2, sp = 30 + Math.random() * 110;
    G.parts.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 0.5 + Math.random() * 0.5, max: 1, c: color, r: 1.5 + Math.random() * 2.5, txt: null });
  }
}
function popup(x, y, txt, color){
  G.parts.push({ x: x, y: y - 8, vx: 0, vy: -26, life: 1.1, max: 1.1, c: color, r: 0, txt: txt });
}
var flashT = 0;
function flash(color){ elFlash.style.background = color; elFlash.style.opacity = '1'; flashT = 0.18; }

/* ---------- update ---------- */
function update(dt){
  if (G.tween){
    var T = G.tween;
    T.k = Math.min(1, T.k + dt / 0.55);
    var k = smoothstep(0, 1, T.k);
    G.cam.x = T.x0 + (T.x - T.x0) * k;
    G.cam.y = T.y0 + (T.y - T.y0) * k;
    G.cam.s = T.s0 + (T.s - T.s0) * k;
    if (T.k >= 1) G.tween = null;
  }
  if (flashT > 0){ flashT -= dt; if (flashT <= 0) elFlash.style.opacity = '0'; }
  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 14);

  for (var i = G.parts.length - 1; i >= 0; i--){
    var p = G.parts[i];
    p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (!p.txt){ p.vx *= 0.94; p.vy *= 0.94; p.vy += 40 * dt; }
    if (p.life <= 0) G.parts.splice(i, 1);
  }
  if (G.over) return;

  G.time += dt;
  if (G.hintT < 99){ G.hintT += dt; if (G.hintT > 11) elHint.style.opacity = '0'; }

  /* spawns */
  while (G.queue.length && G.queue[0].t <= G.time){
    if (entryBlocked()){ for (var q = 0; q < G.queue.length; q++) G.queue[q].t += 0.6; break; }
    spawnTrain(G.queue.shift().color);
    G.interval = Math.max(1.7, 6.4 - G.delivered * 0.115);
    retimeQueue();
    fillQueue();
  }
  if (G.queue.length < 4) fillQueue();

  /* trains */
  for (var ti = G.trains.length - 1; ti >= 0; ti--){
    var tr = G.trains[ti], net = G.net, e = net.edges[tr.edge];
    if (!e){ G.trains.splice(ti, 1); continue; }
    tr.patience -= dt;

    if (tr.dwell > 0){
      tr.dwell -= dt; tr.v = 0;
      if (tr.dwell <= 0){
        tr.stationDone = true;
        deliver(tr, e.seg);
      }
    } else {
      var base = tr.done ? BASE_SPEED * 1.35 : BASE_SPEED;
      var cap = base;
      var lim = function(d){ var a = Math.sqrt(Math.max(0, 2 * DECEL * d)); if (a < cap) cap = a; };

      if (e.stationS !== null && !tr.stationDone && tr.s <= e.stationS) lim(e.stationS - tr.s);
      if (tr.hold){
        if (e.signalS !== null && tr.s <= e.signalS) lim(e.signalS - tr.s);
        else {
          var ni = nextEdgeIdx(net, tr.edge);
          if (ni >= 0 && net.edges[ni] && net.edges[ni].signalS !== null)
            lim((e.len - tr.s) + net.edges[ni].signalS);
        }
      }
      var g = gapAhead(tr);
      if (g < Infinity) lim(Math.max(0, g - FOLLOW_GAP));

      if (cap > tr.v) tr.v = Math.min(cap, tr.v + ACCEL * dt);
      else tr.v = Math.max(cap, tr.v - DECEL * 1.6 * dt);
      if (tr.v < 0) tr.v = 0;

      tr.s += tr.v * dt;

      /* station arrival */
      if (e.stationS !== null && !tr.stationDone && tr.s >= e.stationS - 0.8){
        tr.s = e.stationS; tr.v = 0; tr.dwell = DWELL;
      }
      /* signal hold */
      if (tr.hold && e.signalS !== null && tr.s >= e.signalS - 0.8 && tr.s <= e.signalS + 2){
        tr.s = e.signalS; tr.v = 0;
      }
      /* edge transition */
      if (tr.s >= e.len){
        var over = tr.s - e.len;
        var nx = nextEdgeIdx(net, tr.edge);
        if (nx < 0){
          if (!tr.done){ G.missed++; G.combo = 0; flash('rgba(239,68,68,.12)');
            popup(tr.x, tr.y, 'MISSED', '#f87171'); beep(120, 0.2, 'sawtooth', 0.06, 70); }
          G.trains.splice(ti, 1); continue;
        }
        tr.edge = nx; tr.s = over; tr.stationDone = false;
      }
    }
    var pt = polyAt(G.net.edges[tr.edge].poly, tr.s);
    tr.x = pt.x; tr.y = pt.y; tr.tx = pt.tx; tr.ty = pt.ty;
  }

  /* collisions */
  for (var a = 0; a < G.trains.length; a++){
    for (var b = a + 1; b < G.trains.length; b++){
      var A = G.trains[a], B = G.trains[b];
      if (Math.abs(A.x - B.x) > COLLIDE_DIST || Math.abs(A.y - B.y) > COLLIDE_DIST) continue;
      if (Math.hypot(A.x - B.x, A.y - B.y) < COLLIDE_DIST){ gameOver(A, B); return; }
    }
  }
}

function gameOver(A, B){
  G.over = true; G.shake = 26;
  var mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
  burst(mx, my, '#fb923c', 34); burst(mx, my, '#f87171', 26); burst(mx, my, '#fde68a', 18);
  flash('rgba(239,68,68,.35)');
  noise(0.5, 0.42); beep(90, 0.5, 'sawtooth', 0.12, 40);
  if (G.score > best){
    best = G.score;
    try { localStorage.setItem('steamline.best', String(best)); } catch (e) {}
  }
  elOScore.textContent = G.score;
  elOBest.textContent = 'BEST ' + best;
  overTimer = setTimeout(function(){ elOver.classList.add('on'); overTimer = null; }, 460);
}

/* ---------- render ---------- */
function render(){
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#0b1118'; ctx.fillRect(0, 0, vw, vh);
  var g = ctx.createRadialGradient(vw * 0.5, vh * 0.42, 20, vw * 0.5, vh * 0.42, Math.max(vw, vh) * 0.78);
  g.addColorStop(0, '#152232'); g.addColorStop(1, '#0b1118');
  ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);

  var sx = 0, sy = 0;
  if (G.shake > 0){ sx = (Math.random() - 0.5) * G.shake * 2; sy = (Math.random() - 0.5) * G.shake * 2; }
  ctx.save();
  ctx.translate(vw / 2 + sx, vh / 2 + sy);
  ctx.scale(G.cam.s, G.cam.s);
  ctx.translate(-G.cam.x, -G.cam.y);

  var S = G.cam.s, net = G.net;
  var lwBase = Math.max(11, 7 / S), lwCore = Math.max(2.6, 1.8 / S);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  /* track bed - one combined path, three passes */
  var i, k, e;
  ctx.strokeStyle = '#1c2836'; ctx.lineWidth = lwBase + 5; ctx.stroke(net.allPath);
  ctx.strokeStyle = '#33465c'; ctx.lineWidth = lwBase; ctx.stroke(net.allPath);
  ctx.strokeStyle = '#5d7590'; ctx.lineWidth = lwCore; ctx.stroke(net.allPath);

  /* signals */
  var off = lwBase * 0.62 + 4;
  for (i = 0; i < net.edges.length; i++){
    e = net.edges[i];
    if (!e.signalPt) continue;
    var sp = e.signalPt, held = false;
    for (k = 0; k < G.trains.length; k++){
      var t2 = G.trains[k];
      if (t2.edge === i && t2.hold && Math.abs(t2.s - e.signalS) < 6){ held = true; break; }
    }
    ctx.fillStyle = held ? '#ef4444' : '#22c55e';
    ctx.globalAlpha = held ? 1 : 0.45;
    ctx.beginPath();
    ctx.arc(sp.x - sp.ty * off, sp.y + sp.tx * off, 3.4, 0, 6.2832);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  /* switch highlight + node */
  var pulse = 0.55 + 0.45 * Math.sin(performance.now() / 320);
  for (i = 0; i < net.n; i++){
    var ce = net.edges[childIdx(net, i)];
    ctx.strokeStyle = '#67e8f9'; ctx.lineWidth = lwCore + 2.6; ctx.globalAlpha = 0.9;
    ctx.stroke(ce.headPath); ctx.globalAlpha = 1;

    var nd = net.nodes[i];
    ctx.beginPath(); ctx.arc(nd.x, nd.y, 12, 0, 6.2832);
    ctx.fillStyle = '#0e1a26'; ctx.fill();
    ctx.strokeStyle = '#67e8f9'; ctx.lineWidth = 2.4; ctx.stroke();
    var dir = ce.dirPt;
    ctx.beginPath(); ctx.moveTo(nd.x, nd.y);
    ctx.lineTo(nd.x + (dir.x - nd.x) * 0.42, nd.y + (dir.y - nd.y) * 0.42);
    ctx.strokeStyle = '#a7f0fb'; ctx.lineWidth = 3.4; ctx.stroke();
    ctx.beginPath(); ctx.arc(nd.x, nd.y, 3, 0, 6.2832); ctx.fillStyle = '#a7f0fb'; ctx.fill();
  }

  /* depot (line entry) and terminus (line exit) */
  cap(net.entryPt, '#22c55e', 'in');
  cap(net.exitPt, '#ef4444', 'out');

  /* stations - dark box, thick colour ring, colour disc: distinct from solid trains */
  for (i = 0; i < net.stations.length; i++){
    var st = net.stations[i];
    var want = false;
    for (k = 0; k < G.trains.length; k++)
      if (!G.trains[k].done && G.trains[k].color === st.color){ want = true; break; }
    ctx.save(); ctx.translate(st.x, st.y); ctx.rotate(Math.atan2(st.ty, st.tx));
    if (want){
      ctx.globalAlpha = 0.14 + 0.16 * pulse; ctx.fillStyle = st.color;
      roundRect(-34, -24, 68, 48, 13); ctx.fill(); ctx.globalAlpha = 1;
    }
    ctx.fillStyle = '#0d1620'; roundRect(-26, -17, 52, 34, 8); ctx.fill();
    ctx.strokeStyle = st.color; ctx.lineWidth = 3.2; roundRect(-26, -17, 52, 34, 8); ctx.stroke();
    ctx.fillStyle = st.color;
    ctx.beginPath(); ctx.arc(0, 0, 8.5, 0, 6.2832); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.22)';
    ctx.fillRect(-20, -13, 40, 2.6); ctx.fillRect(-20, 10.4, 40, 2.6);
    ctx.restore();
  }

  /* trains */
  for (i = 0; i < G.trains.length; i++) drawTrain(G.trains[i], i === G.sel);

  /* particles */
  for (i = 0; i < G.parts.length; i++){
    var p = G.parts[i], al = Math.max(0, p.life / p.max);
    if (p.txt){
      ctx.globalAlpha = Math.min(1, al * 1.6);
      ctx.fillStyle = p.c; ctx.font = '700 ' + (14 / S + 5) + 'px ui-sans-serif,system-ui,sans-serif';
      ctx.textAlign = 'center'; ctx.fillText(p.txt, p.x, p.y);
    } else {
      ctx.globalAlpha = al; ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.4 + al), 0, 6.2832); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/* end-of-line marker drawn across the rails */
function cap(p, color, kind){
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.ty, p.tx));
  ctx.fillStyle = '#0d1620'; roundRect(-7, -17, 14, 34, 5); ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = 2.4; roundRect(-7, -17, 14, 34, 5); ctx.stroke();
  ctx.fillStyle = color;
  for (var i = -1; i <= 1; i++){
    ctx.beginPath();
    if (kind === 'in') ctx.arc(0, i * 9, 2.6, 0, 6.2832);
    else { ctx.moveTo(-3.5, i * 9 - 3.5); ctx.lineTo(3, i * 9); ctx.lineTo(-3.5, i * 9 + 3.5); ctx.closePath(); }
    ctx.fill();
  }
  ctx.restore();
}

function roundRect(x, y, w, h, r){
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawTrain(tr, selected){
  var ang = Math.atan2(tr.ty, tr.tx);
  ctx.save(); ctx.translate(tr.x, tr.y); ctx.rotate(ang);
  var col = tr.done ? '#94a3b8' : tr.color;
  if (selected){
    ctx.globalAlpha = 0.35; ctx.fillStyle = '#a7f0fb';
    roundRect(-20, -13, 40, 26, 9); ctx.fill(); ctx.globalAlpha = 1;
  }
  ctx.fillStyle = 'rgba(0,0,0,.45)'; roundRect(-15, -7, 30, 15, 4); ctx.fill();
  ctx.fillStyle = col; roundRect(-15, -8, 30, 15, 4); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.32)'; roundRect(2, -6, 10, 5, 2); ctx.fill();
  ctx.strokeStyle = tr.hold ? '#ef4444' : 'rgba(6,12,18,.85)';
  ctx.lineWidth = tr.hold ? 2.4 : 1.6; roundRect(-15, -8, 30, 15, 4); ctx.stroke();
  if (!tr.done && tr.patience <= 0){
    ctx.globalAlpha = 0.5 + 0.5 * Math.sin(performance.now() / 110);
    ctx.strokeStyle = '#fb923c'; ctx.lineWidth = 2.4; roundRect(-17, -10, 34, 19, 5); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  if (!tr.done){
    var f = Math.max(0, Math.min(1, tr.patience / PATIENCE));
    ctx.fillStyle = 'rgba(8,14,20,.75)';
    ctx.fillRect(tr.x - 13, tr.y - 17, 26, 4);
    ctx.fillStyle = f > 0.45 ? '#34d399' : (f > 0.18 ? '#fbbf24' : '#ef4444');
    ctx.fillRect(tr.x - 12, tr.y - 16.2, 24 * f, 2.4);
  }
  if (tr.hold){
    ctx.fillStyle = '#ef4444';
    ctx.beginPath(); ctx.arc(tr.x, tr.y + 15, 3.6, 0, 6.2832); ctx.fill();
  }
}

/* ---------- HUD ---------- */
var hudT = 0, chips = [];
function updateHUD(force){
  elScore.textContent = G.score;
  elCombo.textContent = 'x' + (1 + Math.min(G.combo, 12) * 0.1).toFixed(1);
  elCombo.style.opacity = G.combo > 0 ? '1' : '0';
  elStat.innerHTML = 'BEST ' + best + '<br>' + G.net.n + ' STATIONS &middot; ' + G.delivered + ' RUNS';
  while (chips.length < 3){
    var c = document.createElement('div'); c.className = 'chip';
    var d = document.createElement('div'); d.className = 'dot';
    var s = document.createElement('span');
    c.appendChild(d); c.appendChild(s); elTT.appendChild(c);
    chips.push({ el: c, dot: d, txt: s });
  }
  for (var i = 0; i < 3; i++){
    var q = G.queue[i];
    if (!q || G.over){ chips[i].el.style.display = 'none'; continue; }
    chips[i].el.style.display = 'flex';
    chips[i].dot.style.background = q.color;
    chips[i].dot.style.color = q.color;
    var dt = Math.max(0, q.t - G.time);
    chips[i].txt.textContent = dt < 0.6 ? 'NOW' : Math.ceil(dt) + 's';
  }
}

/* ---------- input ---------- */
var ptrs = new Map(), panned = false, downT = 0, downPos = null, pinch = null, lastTap = 0, lastTapPos = null;
window.addEventListener('blur', function(){ ptrs.clear(); panned = false; downPos = null; pinch = null; });

function localPos(ev){ return { x: ev.clientX, y: ev.clientY }; }

cv.addEventListener('pointerdown', function(ev){
  audio();
  cv.setPointerCapture(ev.pointerId);
  ptrs.set(ev.pointerId, localPos(ev));
  if (ptrs.size === 1){ panned = false; downT = performance.now(); downPos = localPos(ev); }
  else if (ptrs.size === 2){
    var a = Array.from(ptrs.values());
    pinch = { d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y),
              m: { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 }, s: G.cam.s };
    panned = true;
  }
  ev.preventDefault();
}, { passive: false });

cv.addEventListener('pointermove', function(ev){
  if (!ptrs.has(ev.pointerId)) return;
  var prev = ptrs.get(ev.pointerId), cur = localPos(ev);
  ptrs.set(ev.pointerId, cur);
  if (ptrs.size >= 2 && pinch){
    var a = Array.from(ptrs.values());
    var d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
    var m = { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 };
    var ns = Math.max(0.25, Math.min(3, pinch.s * (d / (pinch.d || 1))));
    var before = s2w(m.x, m.y);
    G.cam.s = ns; G.tween = null;
    var after = s2w(m.x, m.y);
    G.cam.x += before.x - after.x; G.cam.y += before.y - after.y;
    G.cam.x -= (m.x - pinch.m.x) / G.cam.s; G.cam.y -= (m.y - pinch.m.y) / G.cam.s;
    pinch.m = m;
  } else if (ptrs.size === 1){
    var dx = cur.x - prev.x, dy = cur.y - prev.y;
    if (!panned && downPos && Math.hypot(cur.x - downPos.x, cur.y - downPos.y) > 9) panned = true;
    if (panned){ G.cam.x -= dx / G.cam.s; G.cam.y -= dy / G.cam.s; G.tween = null; }
  }
  ev.preventDefault();
}, { passive: false });

function endPtr(ev){
  if (!ptrs.has(ev.pointerId)) return;
  var pos = ptrs.get(ev.pointerId);
  ptrs.delete(ev.pointerId);
  if (ptrs.size < 2) pinch = null;
  if (ptrs.size === 0 && !panned && performance.now() - downT < 500) tap(pos);
  ev.preventDefault();
}
cv.addEventListener('pointerup', endPtr, { passive: false });
cv.addEventListener('pointercancel', endPtr, { passive: false });
cv.addEventListener('wheel', function(ev){
  var before = s2w(ev.clientX, ev.clientY);
  G.cam.s = Math.max(0.25, Math.min(3, G.cam.s * (ev.deltaY < 0 ? 1.12 : 0.893)));
  G.tween = null;
  var after = s2w(ev.clientX, ev.clientY);
  G.cam.x += before.x - after.x; G.cam.y += before.y - after.y;
  ev.preventDefault();
}, { passive: false });

function tap(pos){
  var now = performance.now();
  if (G.over) return;
  if (lastTapPos && now - lastTap < 320 && Math.hypot(pos.x - lastTapPos.x, pos.y - lastTapPos.y) < 40){
    lastTap = 0;
    if (G.cam.s < 1.25){
      var w = s2w(pos.x, pos.y);
      tweenTo(w.x, w.y, 1.7);
    } else fitCam(false);
    return;
  }
  lastTap = now; lastTapPos = pos;

  /* trains first (generous hit area) */
  var hitR = Math.max(26, 17 * G.cam.s), bestD = 1e9, bestI = -1, i, p, d;
  for (i = 0; i < G.trains.length; i++){
    p = w2s(G.trains[i].x, G.trains[i].y);
    d = Math.hypot(p.x - pos.x, p.y - pos.y);
    if (d < hitR && d < bestD){ bestD = d; bestI = i; }
  }
  if (bestI >= 0){
    var tr = G.trains[bestI];
    tr.hold = !tr.hold; G.sel = bestI;
    beep(tr.hold ? 320 : 480, 0.06, 'square', 0.05);
    return;
  }
  /* switches */
  var swR = Math.max(28, 15 * G.cam.s); bestD = 1e9; bestI = -1;
  for (i = 0; i < G.net.n; i++){
    p = w2s(G.net.nodes[i].x, G.net.nodes[i].y);
    d = Math.hypot(p.x - pos.x, p.y - pos.y);
    if (d < swR && d < bestD){ bestD = d; bestI = i; }
  }
  if (bestI >= 0) toggleSwitch(bestI);
}

function toggleSwitch(i){
  if (i < 0 || i >= G.net.n) return;
  G.net.sw[i] = !G.net.sw[i];
  var nd = G.net.nodes[i];
  burst(nd.x, nd.y, '#67e8f9', 6);
  beep(560, 0.05, 'square', 0.05, 700);
  G.hintT = 99; elHint.style.opacity = '0';
}

window.addEventListener('keydown', function(ev){
  audio();
  var k = ev.key.toLowerCase();
  if (G.over){ if (k === 'enter' || k === ' ' || k === 'r') newGame(); return; }
  if (k >= '1' && k <= '9'){ toggleSwitch(parseInt(k, 10) - 1); ev.preventDefault(); return; }
  var pan = 90 / G.cam.s;
  if (k === 'arrowleft' || k === 'a') G.cam.x -= pan;
  else if (k === 'arrowright' || k === 'd') G.cam.x += pan;
  else if (k === 'arrowup' || k === 'w') G.cam.y -= pan;
  else if (k === 'arrowdown' || k === 's') G.cam.y += pan;
  else if (k === '=' || k === '+' || k === 'e') G.cam.s = Math.min(3, G.cam.s * 1.15);
  else if (k === '-' || k === '_' || k === 'q') G.cam.s = Math.max(0.25, G.cam.s / 1.15);
  else if (k === '0' || k === 'f') { fitCam(false); return; }
  else if (k === 'tab'){
    if (G.trains.length) G.sel = (G.sel + 1) % G.trains.length;
    ev.preventDefault(); return;
  }
  else if (k === ' ' || k === 'enter'){
    if (G.sel >= 0 && G.sel < G.trains.length){
      var tr = G.trains[G.sel]; tr.hold = !tr.hold;
      beep(tr.hold ? 320 : 480, 0.06, 'square', 0.05);
    }
    ev.preventDefault(); return;
  }
  else if (k === 'r'){ newGame(); return; }
  else return;
  G.tween = null; ev.preventDefault();
});

elBtn.addEventListener('click', function(){ newGame(); });
elOver.addEventListener('pointerdown', function(ev){ if (G.over && ev.target !== elBtn) newGame(); });
document.addEventListener('touchmove', function(e){ e.preventDefault(); }, { passive: false });
document.addEventListener('gesturestart', function(e){ e.preventDefault(); }, { passive: false });
document.addEventListener('contextmenu', function(e){ e.preventDefault(); });

/* ---------- loop ---------- */
var prev = performance.now(), hudAcc = 0;
function frame(now){
  var dt = (now - prev) / 1000; prev = now;
  if (dt > 0.05) dt = 0.05;
  update(dt);
  render();
  hudAcc += dt;
  if (hudAcc > 0.12){ hudAcc = 0; updateHUD(); }
  requestAnimationFrame(frame);
}

resize();
newGame();
requestAnimationFrame(frame);
