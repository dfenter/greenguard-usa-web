/* Siegebreak - core: math, rng, audio, canvas fit, input */
'use strict';

var VW = 390, VH = 700;

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function rand(a, b) { return a + Math.random() * (b - a); }
function dist(a, b) { return Math.abs(a - b); }

/* deterministic seeded rng (mulberry32) */
function makeRng(seed) {
  var a = seed >>> 0;
  return function () {
    a += 0x6D2B79F5;
    var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- audio (WebAudio synth only) ---------- */
var Audio2 = (function () {
  var ac = null, master = null, on = true;
  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    try {
      var C = window.AudioContext || window.webkitAudioContext;
      if (!C) return;
      ac = new C();
      master = ac.createGain();
      master.gain.value = 0.22;
      master.connect(ac.destination);
    } catch (e) { ac = null; }
  }
  function tone(freq, dur, type, vol, slide) {
    if (!ac || !on) return;
    var t = ac.currentTime;
    var o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.3, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, hp) {
    if (!ac || !on) return;
    var n = Math.floor(ac.sampleRate * dur);
    var buf = ac.createBuffer(1, n, ac.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var s = ac.createBufferSource(); s.buffer = buf;
    var f = ac.createBiquadFilter(); f.type = hp ? 'highpass' : 'lowpass';
    f.frequency.value = hp || 900;
    var g = ac.createGain(); g.gain.value = vol || 0.3;
    s.connect(f); f.connect(g); g.connect(master);
    s.start();
  }
  var S = {
    init: init,
    toggle: function () { on = !on; return on; },
    isOn: function () { return on; },
    swing: function () { noise(0.10, 0.25, 1400); tone(320, 0.07, 'sawtooth', 0.10, 0.5); },
    hit: function () { tone(180, 0.09, 'square', 0.20, 0.4); noise(0.06, 0.18); },
    kick: function () { tone(90, 0.16, 'sawtooth', 0.25, 0.35); noise(0.12, 0.2, 300); },
    kill: function () { tone(420, 0.12, 'triangle', 0.16, 0.25); },
    ladder: function () { tone(140, 0.2, 'sawtooth', 0.16, 2.2); },
    oil: function () { noise(0.35, 0.22, 260); tone(70, 0.3, 'sine', 0.12, 0.6); },
    rally: function () { tone(300, 0.13, 'square', 0.16); setTimeout(function () { tone(450, 0.16, 'square', 0.16); }, 90); },
    banner: function () {
      [330, 415, 500, 660].forEach(function (f, i) { setTimeout(function () { tone(f, 0.25, 'sawtooth', 0.15); }, i * 85); });
      noise(0.5, 0.2, 200);
    },
    gate: function () { tone(60, 0.28, 'square', 0.28, 0.5); noise(0.2, 0.25, 200); },
    ui: function () { tone(620, 0.05, 'square', 0.12); },
    buy: function () { tone(520, 0.07, 'square', 0.14); setTimeout(function () { tone(780, 0.1, 'square', 0.14); }, 70); },
    lose: function () { [400, 320, 250, 170].forEach(function (f, i) { setTimeout(function () { tone(f, 0.35, 'sawtooth', 0.18); }, i * 150); }); },
    win: function () { [400, 500, 600, 800].forEach(function (f, i) { setTimeout(function () { tone(f, 0.3, 'triangle', 0.18); }, i * 130); }); }
  };
  return S;
})();

/* ---------- canvas fit ---------- */
var cv = document.getElementById('c');
var ctx = cv.getContext('2d', { alpha: false });
var SCALE = 1;

function fit() {
  var w = window.innerWidth, h = window.innerHeight;
  var s = Math.min(w / VW, h / VH);
  var cssW = Math.floor(VW * s), cssH = Math.floor(VH * s);
  cv.style.width = cssW + 'px';
  cv.style.height = cssH + 'px';
  var dpr = Math.min(2, window.devicePixelRatio || 1);
  var bw = cssW * dpr, bh = cssH * dpr;
  if (bh > 960) { var k = 960 / bh; bw *= k; bh *= k; }
  cv.width = Math.max(1, Math.round(bw));
  cv.height = Math.max(1, Math.round(bh));
  SCALE = cv.width / VW;
}
window.addEventListener('resize', fit);
window.addEventListener('orientationchange', function () { setTimeout(fit, 120); });
fit();

/* ---------- input ---------- */
var Input = {
  keys: {},
  down: false,
  sx: 0, sy: 0, cx: 0, cy: 0, st: 0,
  onTap: null,      // (x,y,dir) dir: 'tap'|'up'|'down'|'left'|'right'
  onPress: null,    // (x,y) immediate press
  onRelease: null
};
var activePointers = Object.create(null);

function toLocal(clientX, clientY) {
  var r = cv.getBoundingClientRect();
  return {
    x: (clientX - r.left) / r.width * VW,
    y: (clientY - r.top) / r.height * VH
  };
}

function pressAt(x, y, id) {
  Audio2.init();
  activePointers[id] = { sx: x, sy: y, st: performance.now() };
  Input.down = true;
  Input.sx = Input.cx = x; Input.sy = Input.cy = y;
  Input.st = performance.now();
  if (Input.onPress) Input.onPress(x, y);
}
function releaseAt(x, y, id) {
  var rec = activePointers[id]; if (!rec) return;
  delete activePointers[id]; Input.down = Object.keys(activePointers).length > 0;
  var dx = x - rec.sx, dy = y - rec.sy;
  var ad = Math.sqrt(dx * dx + dy * dy);
  var dir = 'tap';
  if (ad > 22) {
    if (Math.abs(dx) > Math.abs(dy)) dir = dx > 0 ? 'right' : 'left';
    else dir = dy > 0 ? 'down' : 'up';
  }
  if (Input.onTap) Input.onTap(rec.sx, rec.sy, dir, x, y);
  if (Input.onRelease) Input.onRelease(x, y);
}
function cancelAt(id) { if (activePointers[id]) delete activePointers[id]; Input.down = Object.keys(activePointers).length > 0; }
Input.clear = function () { activePointers = Object.create(null); Input.down = false; Input.keys = {}; Input.sx = Input.sy = Input.cx = Input.cy = Input.st = 0; };

cv.addEventListener('touchstart', function (e) {
  e.preventDefault();
  for (var i = 0; i < e.changedTouches.length; i++) { var t = e.changedTouches[i], p = toLocal(t.clientX, t.clientY); pressAt(p.x, p.y, t.identifier); }
}, { passive: false });
cv.addEventListener('touchmove', function (e) {
  e.preventDefault();
  for (var i = 0; i < e.changedTouches.length; i++) { var t = e.changedTouches[i], p = toLocal(t.clientX, t.clientY); if (activePointers[t.identifier]) { Input.cx = p.x; Input.cy = p.y; } }
}, { passive: false });
cv.addEventListener('touchend', function (e) {
  e.preventDefault();
  for (var i = 0; i < e.changedTouches.length; i++) { var t = e.changedTouches[i], p = toLocal(t.clientX, t.clientY); releaseAt(p.x, p.y, t.identifier); }
}, { passive: false });
cv.addEventListener('touchcancel', function (e) { e.preventDefault(); for (var i = 0; i < e.changedTouches.length; i++) cancelAt(e.changedTouches[i].identifier); }, { passive: false });

cv.addEventListener('mousedown', function (e) {
  e.preventDefault();
  var p = toLocal(e.clientX, e.clientY); pressAt(p.x, p.y, -9);
});
window.addEventListener('mousemove', function (e) {
  if (!activePointers[-9]) return;
  var p = toLocal(e.clientX, e.clientY); Input.cx = p.x; Input.cy = p.y;
});
window.addEventListener('mouseup', function (e) {
  var p = toLocal(e.clientX, e.clientY); releaseAt(p.x, p.y, -9);
});
document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
document.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });

window.addEventListener('keydown', function (e) {
  Audio2.init();
  Input.keys[e.key.toLowerCase()] = true;
  if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].indexOf(e.key.toLowerCase()) >= 0) e.preventDefault();
  if (Input.onKey) Input.onKey(e.key.toLowerCase());
});
window.addEventListener('keyup', function (e) { Input.keys[e.key.toLowerCase()] = false; });
window.addEventListener('blur', function () { Input.clear(); });

/* ---------- storage ---------- */
function loadBest() {
  try { return parseInt(localStorage.getItem('siegebreak.best') || '0', 10) || 0; } catch (e) { return 0; }
}
function saveBest(v) {
  try { localStorage.setItem('siegebreak.best', String(v)); } catch (e) { }
}
