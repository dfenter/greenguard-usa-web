/* Aftergate - main loop, state machine, presentation. */
'use strict';

var Game = {
  state: 'idle',      // idle | run | arrive | base | over
  best: 0, bestSquad: 0, waves: 0, arriveT: 0, survivors: 0,
  paused: false, started: false, overBtn: null, result: ''
};

function fitCanvas() {
  var vw = window.innerWidth, vh = window.innerHeight;
  var cssH = Math.min(vh, vw * DH / DW);
  var cssW = cssH * DW / DH;
  cv.style.width = cssW + 'px';
  cv.style.height = cssH + 'px';
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var bh = Math.min(960, Math.round(cssH * dpr));
  var bw = Math.round(bh * DW / DH);
  if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
  scale = cssH / DH;          // CSS px per design unit (for input mapping)
  offX = 0; offY = 0;
  Game.rscale = bh / DH;      // backing px per design unit (for drawing)
}

function isLandscape() { return window.innerWidth > window.innerHeight * 1.12; }

function updateRotate() {
  var rot = document.getElementById('rot');
  var show = isLandscape() && Game.started;
  var wasPaused = Game.paused;
  if (show) { rot.classList.add('on'); Game.paused = true; }
  else { rot.classList.remove('on'); Game.paused = false; }
  if (Game.paused && !wasPaused) Input.reset();
}

/* ---------- state transitions ---------- */
function newGame() {
  Timers.clearAll();
  Input.reset();
  Fx.clear();
  Game.waves = 0; Game.survivors = 0; Game.result = '';
  Run.init(5);
  Game.state = 'run';
}

function toBase(n) {
  Game.survivors = n;
  if (n > Game.bestSquad) { Game.bestSquad = n; Store.set('bestSquad', n); }
  Input.reset();
  Base.init(n);
  Game.state = 'base';
}

function gameOver(result) {
  Game.result = result;
  Game.waves = (result === 'win') ? 10 : Base.cleared;
  if (Game.state !== 'over' && Game.waves > Game.best) { Game.best = Game.waves; Store.set('best', Game.best); }
  Game.state = 'over';
  Input.clearTaps(); Input.releases.length = 0;
}

function onKey(k) {
  if (!Game.started) {
    if (k === ' ' || k === 'Enter') { document.getElementById('startBtn').click(); }
    return;
  }
  if (Game.paused) return;
  if (Game.state === 'over') {
    if (k === ' ' || k === 'Enter' || k === 'r' || k === 'R') newGame();
    return;
  }
  if (Game.state === 'base') Base.key(k);
}

/* ---------- loop ---------- */
var lastT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  var dt = (now - lastT) / 1000;
  lastT = now;
  if (!isFinite(dt) || dt < 0) dt = 0;
  dt = Math.min(dt, 0.05);
  if (Game.paused || document.hidden) return;

  update(dt);
  render();
}

function update(dt) {
  if (Game.state === 'run') {
    Run.update(dt);
    if (Run.done) {
      if (Run.wiped) { Base.cleared = 0; gameOver('wiped'); Sfx.lose(); }
      else { Game.state = 'arrive'; Game.arriveT = 1.5; Game.survivors = Run.n; Sfx.win(); Fx.bang('#7ee0a8', 0.5); }
    }
  } else if (Game.state === 'arrive') {
    Game.arriveT -= dt;
    Input.clearTaps(); Input.releases.length = 0;
    var ps = Input.list();
    for (var i = 0; i < ps.length; i++) { ps[i].dx = 0; ps[i].dy = 0; }
    if (Game.arriveT <= 0) toBase(Game.survivors);
  } else if (Game.state === 'base') {
    Base.update(dt);
    if (Base.result) gameOver(Base.result);
  } else if (Game.state === 'over') {
    var t = Input.consumeTap();
    Input.releases.length = 0;
    if (t && Game.overBtn && inRect(t, Game.overBtn)) newGame();
    else if (t) newGame();
  }
  Fx.update(dt);
}

function render() {
  var g = ctx;
  g.setTransform(Game.rscale, 0, 0, Game.rscale, 0, 0);
  g.save();
  if (Fx.shake > 0) g.translate(rnd(-Fx.shake, Fx.shake), rnd(-Fx.shake, Fx.shake));

  if (Game.state === 'run') Run.draw(g);
  else if (Game.state === 'arrive') { Run.draw(g); drawArrive(g); }
  else if (Game.state === 'base' || Game.state === 'over') {
    if (Game.result === 'wiped') Run.draw(g); else Base.draw(g);
  } else { g.fillStyle = '#12151c'; g.fillRect(0, 0, DW, DH); }

  Fx.draw(g);
  g.restore();

  if (Fx.flash > 0) {
    g.globalAlpha = Math.min(0.6, Fx.flash);
    g.fillStyle = Fx.flashCol; g.fillRect(0, 0, DW, DH); g.globalAlpha = 1;
  }
  if (Game.state === 'over') drawOver(g);
}

function drawArrive(g) {
  g.fillStyle = 'rgba(8,10,15,.72)'; g.fillRect(0, 0, DW, DH);
  txtO(g, String(Game.survivors), DW / 2, DH / 2 - 60, 96, '#7ee0a8');
  txtO(g, 'REACH THE WALL', DW / 2, DH / 2 + 20, 30, '#e8edf5');
  txtO(g, 'they garrison your base', DW / 2, DH / 2 + 62, 18, '#9fb0c6');
}

function drawOver(g) {
  var win = Game.result === 'win';
  var wiped = Game.result === 'wiped';
  g.fillStyle = 'rgba(8,10,15,.9)'; g.fillRect(0, 0, DW, DH);
  txtO(g, win ? 'THE WALL HOLDS' : (wiped ? 'SQUAD WIPED' : 'BASE OVERRUN'),
    DW / 2, 300, win ? 40 : 42, win ? '#7ee0a8' : '#ff6b6b');
  txtO(g, wiped ? 'You never made it off the road.' : 'WAVES SURVIVED', DW / 2, 372, 20, '#9fb0c6');
  if (!wiped) txtO(g, String(Game.waves) + ' / 10', DW / 2, 440, 72, '#ffd479');
  txtO(g, 'squad at the wall: ' + Game.survivors, DW / 2, 520, 19, '#9fb0c6');
  txtO(g, 'best: ' + Game.best + ' waves  ·  biggest squad: ' + Game.bestSquad, DW / 2, 552, 18, '#9fb0c6');

  var b = { x: 90, y: 620, w: DW - 180, h: 76 };
  Game.overBtn = b;
  g.fillStyle = 'rgba(30,50,72,.98)'; rr(g, b.x, b.y, b.w, b.h, 12); g.fill();
  g.lineWidth = 3; g.strokeStyle = '#5aa9ff'; rr(g, b.x, b.y, b.w, b.h, 12); g.stroke();
  txt(g, 'RUN AGAIN', b.x + b.w / 2, b.y + b.h / 2, 26, '#8fd0ff');
  txtO(g, 'tap anywhere · no waiting, ever', DW / 2, 730, 16, '#6d7d92');
}

/* ---------- boot ---------- */
(function boot() {
  cv = document.getElementById('cv');
  ctx = cv.getContext('2d', { alpha: false });
  Game.best = Store.get('best', 0);
  Game.bestSquad = Store.get('bestSquad', 0);
  if (Game.best < 0 || Game.best > 10) Game.best = 0;
  if (Game.bestSquad < 0 || Game.bestSquad > MAX_SQUAD) Game.bestSquad = 0;
  fitCanvas();
  bindInput();
  window.addEventListener('resize', function () { fitCanvas(); updateRotate(); });
  window.addEventListener('orientationchange', function () { Timers.after(120, function () { fitCanvas(); updateRotate(); }); });

  var sb = document.getElementById('startBtn');
  sb.addEventListener('click', function () {
    Sfx.unlock();
    document.getElementById('start').classList.remove('on');
    Game.started = true;
    Input.reset();
    newGame();
    updateRotate();
    lastT = performance.now();
  });

  render();
  lastT = performance.now();
  requestAnimationFrame(frame);
})();
