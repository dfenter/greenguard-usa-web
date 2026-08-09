'use strict';
/* Vector Storm - gameplay */

var G = {
  state: 'play',           /* play | dead | over */
  arena: { x: 0, y: 0, w: 0, h: 0 },
  player: null,
  bullets: [], enemies: [], crystals: [], drops: [],
  wave: 0, waveTimer: 0, banner: 0, bannerTxt: '',
  score: 0, best: 0, lives: 3, bombs: 1,
  shards: 0, mult: 1, peak: 1,
  shake: 0, hint: 6, seed: 1, rng: null,
  respawn: 0, invuln: 0, over: 0, flash: 0
};

var COL = {
  drifter: '#ff5f6d', weaver: '#ffd166', snake: '#7bffab',
  spawner: '#c08bff', mini: '#ff9d5f', well: '#5f8bff',
  player: '#66f0ff', bullet: '#ffffff', crystal: '#8affe0', bomb: '#ff7bd5'
};

/* ================= setup ================= */
function layout() {
  var W = View.w, H = View.h;
  G.arena.x = 7; G.arena.y = 52;
  G.arena.w = W - 14; G.arena.h = H - 66;
  Input.bomb.x = W * 0.5; Input.bomb.y = H - 46;
}

function reset(full) {
  layout();
  G.bullets.length = 0; G.enemies.length = 0; G.crystals.length = 0; G.drops.length = 0;
  Particles.clear(); Ripples.clear();
  var a = G.arena;
  G.player = { x: a.x + a.w / 2, y: a.y + a.h * 0.62, vx: 0, vy: 0, r: 10, ang: -Math.PI / 2, cd: 0 };
  if (full) {
    G.seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
    G.rng = makeRng(G.seed);
    G.score = 0; G.lives = 3; G.bombs = 1; G.shards = 0; G.mult = 1; G.peak = 1;
    Input.sticks = {}; Input.keys = {}; Input.bombEdge = false; Input.anyEdge = false; G.shake = 0; G.flash = 0;
    G.wave = 0; G.waveTimer = 0.9; G.state = 'play'; G.hint = 6; G.over = 0;
  }
  G.invuln = 2.0; G.respawn = 0;
}

function boot() {
  View.init(); Input.init(); layout();
  try { var storedBest = parseInt(localStorage.getItem('vectorstorm.best') || '0', 10); G.best = Number.isFinite(storedBest) && storedBest >= 0 ? storedBest : 0; } catch (e) { G.best = 0; }
  reset(true);
  requestAnimationFrame(frame);
}

/* ================= spawn grammar ================= */
var FAMILY = [
  { t: 'drifter', cost: 1, from: 1 },
  { t: 'weaver', cost: 2, from: 2 },
  { t: 'snake', cost: 4, from: 4 },
  { t: 'spawner', cost: 5, from: 6 },
  { t: 'well', cost: 6, from: 8 }
];

function spawnWave() {
  G.wave++;
  var r = G.rng, a = G.arena;
  var budget = 3 + G.wave * 1.7;
  var pool = FAMILY.filter(function (f) { return G.wave >= f.from; });
  var guard = 0;
  while (budget > 0 && guard++ < 40 && G.enemies.length < 52) {
    /* pick a family, biased toward newer (harder) ones as waves climb */
    var w = [], tot = 0;
    for (var i = 0; i < pool.length; i++) {
      var age = G.wave - pool[i].from;
      var wt = 1 + Math.min(age, 6) * 0.35 + i * 0.25;
      if (pool[i].cost > budget + 1) wt = 0.02;
      w.push(wt); tot += wt;
    }
    var pick = r() * tot, f = pool[0];
    for (var j = 0; j < pool.length; j++) { pick -= w[j]; if (pick <= 0) { f = pool[j]; break; } }

    /* formation rule */
    var forms = ['cluster', 'ring', 'edge', 'corners'];
    var form = forms[(r() * forms.length) | 0];
    var count = 1;
    if (f.cost <= 2) count = 2 + ((r() * 4) | 0);
    else if (f.cost === 4) count = 1 + ((r() * 2) | 0);
    count = Math.max(1, Math.min(count, Math.ceil(budget / f.cost)));

    var cx = a.x + 40 + r() * (a.w - 80), cy = a.y + 40 + r() * (a.h - 80);
    var rad = 40 + r() * 70, base = r() * TAU;
    for (var k = 0; k < count; k++) {
      var x, y;
      if (form === 'ring') { var an = base + k / count * TAU; x = cx + Math.cos(an) * rad; y = cy + Math.sin(an) * rad; }
      else if (form === 'cluster') { x = cx + (r() - 0.5) * 70; y = cy + (r() - 0.5) * 70; }
      else if (form === 'corners') {
        var q = (k + ((r() * 4) | 0)) % 4;
        x = a.x + 46 + (q & 1 ? a.w - 92 : 0); y = a.y + 46 + (q & 2 ? a.h - 92 : 0);
      } else {
        var side = (r() * 4) | 0;
        var tt = (k + 1) / (count + 1);
        if (side === 0) { x = a.x + a.w * tt; y = a.y + 34; }
        else if (side === 1) { x = a.x + a.w * tt; y = a.y + a.h - 34; }
        else if (side === 2) { x = a.x + 34; y = a.y + a.h * tt; }
        else { x = a.x + a.w - 34; y = a.y + a.h * tt; }
      }
      x = clamp(x, a.x + 26, a.x + a.w - 26);
      y = clamp(y, a.y + 26, a.y + a.h - 26);
      /* never drop one right on top of the player */
      if (dist2(x, y, G.player.x, G.player.y) < 110 * 110) { y = y > G.player.y ? y + 110 : y - 110; y = clamp(y, a.y + 26, a.y + a.h - 26); }
      makeEnemy(f.t, x, y);
      budget -= f.cost;
    }
  }
  G.banner = 1.6; G.bannerTxt = 'WAVE ' + G.wave;
  Snd.wave();
}

function makeEnemy(t, x, y) {
  var sp = 1 + G.wave * 0.03;
  var e = { t: t, x: x, y: y, vx: 0, vy: 0, born: 0.7, ph: Math.random() * TAU, ang: 0 };
  if (t === 'drifter') { e.r = 12; e.hp = 1; e.spd = 62 * sp; e.pts = 10; }
  else if (t === 'mini') { e.r = 7; e.hp = 1; e.spd = 120 * sp; e.pts = 8; e.born = 0.35; }
  else if (t === 'weaver') { e.r = 12; e.hp = 2; e.spd = 96 * sp; e.pts = 25; }
  else if (t === 'snake') {
    e.r = 10; e.hp = 1; e.spd = 108 * sp; e.pts = 15; e.ang = Math.random() * TAU;
    e.segs = [];
    var n = 5 + ((Math.random() * 4) | 0);
    for (var i = 0; i < n; i++) e.segs.push({ x: x, y: y });
  }
  else if (t === 'spawner') { e.r = 18; e.hp = 7; e.spd = 30 * sp; e.pts = 120; e.emit = 1.6; e.kids = 0; }
  else if (t === 'well') { e.r = 20; e.hp = 12; e.spd = 22 * sp; e.pts = 200; }
  G.enemies.push(e);
  return e;
}

/* ================= gameplay ================= */
function fire(ax, ay) {
  var p = G.player;
  var sp = 640, spread = (Math.random() - 0.5) * 0.07;
  var ca = Math.cos(spread), sa = Math.sin(spread);
  var dx = ax * ca - ay * sa, dy = ax * sa + ay * ca;
  G.bullets.push({ x: p.x + dx * 14, y: p.y + dy * 14, vx: dx * sp, vy: dy * sp, l: 1.4, r: 3.5 });
  p.cd = 0.105;
  p.vx -= dx * 22; p.vy -= dy * 22;
  Snd.shoot();
}

function killEnemy(e, i, byBomb) {
  var pts = Math.round(e.pts * G.mult);
  G.score += pts;
  Particles.burst(e.x, e.y, e.t === 'mini' ? 6 : 14, COL[e.t] || '#fff', 190, 0.5, 3);
  G.shake = Math.min(18, G.shake + (e.t === 'well' || e.t === 'spawner' ? 12 : 3.5));
  if (e.t === 'well' || e.t === 'spawner') { Ripples.add(e.x, e.y, 22); Snd.boom(); }
  else Snd.hit();
  /* crystals */
  var n = e.t === 'mini' ? 1 : (e.t === 'well' ? 8 : (e.t === 'spawner' ? 6 : 2));
  for (var k = 0; k < n; k++) {
    var a = Math.random() * TAU, s = 40 + Math.random() * 90;
    G.crystals.push({ x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, l: 9 });
  }
  if (e.t !== 'mini' && !byBomb && G.rng() < 0.045 && G.bombs < 3) {
    G.drops.push({ x: e.x, y: e.y, l: 12, ph: 0 });
  }
  if (e.owner) e.owner.kids--;
  G.enemies.splice(i, 1);
}

function playerDie() {
  var p = G.player;
  Particles.burst(p.x, p.y, 46, COL.player, 300, 0.9, 3.5);
  Ripples.add(p.x, p.y, 30);
  G.shake = 24; G.flash = 0.5;
  Snd.die();
  G.lives--; G.mult = 1; G.shards = 0;
  G.crystals.length = 0;
  if (G.lives <= 0) {
    G.state = 'over'; G.over = 0;
    if (G.score > G.best) { G.best = G.score; try { localStorage.setItem('vectorstorm.best', String(G.best)); } catch (e) {} }
  } else {
    G.state = 'dead'; G.respawn = 1.1;
  }
}

function useBomb() {
  if (G.bombs <= 0 || G.state !== 'play') return;
  G.bombs--;
  var p = G.player;
  Ripples.add(p.x, p.y, 46); G.shake = 26; G.flash = 0.7;
  Snd.bombS();
  for (var i = G.enemies.length - 1; i >= 0; i--) killEnemy(G.enemies[i], i, true);
  Particles.burst(p.x, p.y, 70, COL.bomb, 420, 0.9, 4);
}

function update(dt) {
  layout();
  Input.poll();
  var a = G.arena, p = G.player, i, e;

  if (Input.bombEdge) { useBomb(); Input.bombEdge = false; }
  if (G.hint > 0) G.hint -= dt;
  if (G.banner > 0) G.banner -= dt;
  if (G.flash > 0) G.flash -= dt * 2.2;
  G.shake *= 1 - Math.min(1, 6 * dt);

  if (G.state === 'over') {
    G.over += dt;
    if (G.over > 0.6 && Input.anyEdge) { reset(true); }
    Input.anyEdge = false;
    Particles.update(dt); Ripples.update(dt);
    return;
  }
  Input.anyEdge = false;

  if (G.state === 'dead') {
    G.respawn -= dt;
    Particles.update(dt); Ripples.update(dt);
    updateCrystals(dt, true);
    if (G.respawn <= 0) {
      p.x = a.x + a.w / 2; p.y = a.y + a.h * 0.62; p.vx = p.vy = 0;
      G.invuln = 2.2; G.state = 'play';
      /* clear space around respawn */
      for (i = G.enemies.length - 1; i >= 0; i--) {
        if (dist2(G.enemies[i].x, G.enemies[i].y, p.x, p.y) < 90 * 90) killEnemy(G.enemies[i], i, true);
      }
    }
    /* enemies keep moving while dead, minus contact */
    updateEnemies(dt, false);
    return;
  }

  if (G.invuln > 0) G.invuln -= dt;

  /* --- player --- */
  var m = Input.move;
  var acc = 1900, maxv = 268;
  if (m.mag > 0) { p.vx += m.x * m.mag * acc * dt; p.vy += m.y * m.mag * acc * dt; }
  var damp = 1 - Math.min(1, (m.mag > 0 ? 6 : 11) * dt);
  p.vx *= damp; p.vy *= damp;
  var sp = Math.hypot(p.vx, p.vy);
  if (sp > maxv) { p.vx = p.vx / sp * maxv; p.vy = p.vy / sp * maxv; }
  p.x += p.vx * dt; p.y += p.vy * dt;
  if (p.x < a.x + p.r) { p.x = a.x + p.r; p.vx *= -0.35; }
  if (p.x > a.x + a.w - p.r) { p.x = a.x + a.w - p.r; p.vx *= -0.35; }
  if (p.y < a.y + p.r) { p.y = a.y + p.r; p.vy *= -0.35; }
  if (p.y > a.y + a.h - p.r) { p.y = a.y + a.h - p.r; p.vy *= -0.35; }

  /* --- shooting --- */
  var aim = Input.aim;
  p.cd -= dt;
  if (aim.mag > 0.28) {
    p.ang = Math.atan2(aim.y, aim.x);
    if (p.cd <= 0) fire(aim.x, aim.y);
  } else if (m.mag > 0.1) {
    p.ang = lerp2ang(p.ang, Math.atan2(m.y, m.x), 12 * dt);
  }
  if (Math.random() < dt * 22) Particles.burst(p.x - Math.cos(p.ang) * 9, p.y - Math.sin(p.ang) * 9, 1, '#2ea9c8', 40, 0.28, 2);

  /* --- bullets --- */
  for (i = G.bullets.length - 1; i >= 0; i--) {
    var b = G.bullets[i];
    /* wells bend bullets */
    for (var q = 0; q < G.enemies.length; q++) {
      var wv = G.enemies[q];
      if (wv.t !== 'well' || wv.born > 0) continue;
      var wdx = wv.x - b.x, wdy = wv.y - b.y, wd = Math.hypot(wdx, wdy) + 1;
      if (wd < 190) { var f = 12000 / (wd * wd); b.vx += wdx / wd * f * 60 * dt; b.vy += wdy / wd * f * 60 * dt; }
    }
    b.x += b.vx * dt; b.y += b.vy * dt; b.l -= dt;
    if (b.l <= 0 || b.x < a.x || b.x > a.x + a.w || b.y < a.y || b.y > a.y + a.h) {
      if (b.l > 0) { Particles.burst(b.x, b.y, 3, '#8fd8ff', 90, 0.2, 2); }
      G.bullets.splice(i, 1);
    }
  }

  updateEnemies(dt, true);
  updateCrystals(dt, false);

  /* --- bomb pickups --- */
  for (i = G.drops.length - 1; i >= 0; i--) {
    var d = G.drops[i]; d.l -= dt; d.ph += dt * 3;
    if (d.l <= 0) { G.drops.splice(i, 1); continue; }
    if (dist2(d.x, d.y, p.x, p.y) < 26 * 26) {
      G.bombs = Math.min(3, G.bombs + 1);
      Particles.burst(d.x, d.y, 16, COL.bomb, 160, 0.5, 3);
      Snd.pop(); G.drops.splice(i, 1);
    }
  }

  Particles.update(dt); Ripples.update(dt);

  /* --- wave flow --- */
  if (G.enemies.length === 0) {
    G.waveTimer -= dt;
    if (G.waveTimer <= 0) { spawnWave(); G.waveTimer = 1.1; }
  } else G.waveTimer = 1.1;
}

function lerp2ang(a, b, t) {
  var d = ((b - a + Math.PI * 3) % TAU) - Math.PI;
  return a + d * clamp(t, 0, 1);
}

function updateCrystals(dt, noPickup) {
  var p = G.player;
  for (var i = G.crystals.length - 1; i >= 0; i--) {
    var c = G.crystals[i];
    c.l -= dt;
    if (c.l <= 0) { G.crystals.splice(i, 1); continue; }
    var dx = p.x - c.x, dy = p.y - c.y, d = Math.hypot(dx, dy) + 0.001;
    if (!noPickup && d < 150) {
      var pull = 900 / Math.max(24, d);
      c.vx += dx / d * pull * dt * 9; c.vy += dy / d * pull * dt * 9;
    }
    c.vx *= 1 - 1.4 * dt; c.vy *= 1 - 1.4 * dt;
    c.x += c.vx * dt; c.y += c.vy * dt;
    if (!noPickup && d < 18) {
      G.crystals.splice(i, 1);
      G.shards++;
      G.mult = Math.min(25, 1 + Math.floor(G.shards / 8));
      if (G.mult > G.peak) G.peak = G.mult;
      G.score += Math.round(2 * G.mult);
      Particles.burst(c.x, c.y, 4, COL.crystal, 110, 0.3, 2);
      if (G.shards % 8 === 0) Snd.pop();
    }
  }
}

function updateEnemies(dt, canHurt) {
  var a = G.arena, p = G.player, i, j;
  for (i = G.enemies.length - 1; i >= 0; i--) {
    var e = G.enemies[i];
    if (e.born > 0) { e.born -= dt; continue; }
    e.ph += dt;
    var dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) + 0.001;

    if (e.t === 'drifter' || e.t === 'mini') {
      e.vx = lerp(e.vx, dx / d * e.spd, 2.2 * dt);
      e.vy = lerp(e.vy, dy / d * e.spd, 2.2 * dt);
      e.ang += dt * 2;
    } else if (e.t === 'weaver') {
      var tx = dx / d, ty = dy / d;
      /* dodge: perpendicular kick away from close incoming bullets */
      var dodgeX = 0, dodgeY = 0;
      for (j = 0; j < G.bullets.length; j++) {
        var b = G.bullets[j];
        var bx = e.x - b.x, by = e.y - b.y, bd = Math.hypot(bx, by);
        if (bd < 100) {
          var dot = (b.vx * bx + b.vy * by) / (bd + 0.001);
          if (dot > 0) { dodgeX += -b.vy / 640 * (1 - bd / 100) * 2.4; dodgeY += b.vx / 640 * (1 - bd / 100) * 2.4; }
        }
      }
      var wob = Math.sin(e.ph * 3.4) * 0.7;
      var vx = tx + (-ty) * wob + dodgeX * 2.4;
      var vy = ty + (tx) * wob + dodgeY * 2.4;
      var vl = Math.hypot(vx, vy) + 0.001;
      e.vx = lerp(e.vx, vx / vl * e.spd, 6 * dt);
      e.vy = lerp(e.vy, vy / vl * e.spd, 6 * dt);
      e.ang += dt * 4;
    } else if (e.t === 'snake') {
      var want = Math.atan2(dy, dx);
      e.ang = lerp2ang(e.ang, want, 2.0 * dt);
      e.vx = Math.cos(e.ang) * e.spd; e.vy = Math.sin(e.ang) * e.spd;
    } else if (e.t === 'spawner') {
      var away = d < 190 ? -1 : 1;
      e.vx = lerp(e.vx, dx / d * e.spd * away + Math.cos(e.ph * 0.8) * 22, 1.6 * dt);
      e.vy = lerp(e.vy, dy / d * e.spd * away + Math.sin(e.ph * 0.9) * 22, 1.6 * dt);
      e.emit -= dt;
      if (e.emit <= 0) {
        e.emit = 1.5 + Math.random() * 0.9;
        if (e.kids < 5 && G.enemies.length < 56) {
          var an = Math.random() * TAU;
          var k = makeEnemy('mini', e.x + Math.cos(an) * 24, e.y + Math.sin(an) * 24);
          k.owner = e; e.kids++;
          Particles.burst(k.x, k.y, 6, COL.mini, 120, 0.3, 2);
        }
      }
    } else if (e.t === 'well') {
      e.vx = lerp(e.vx, dx / d * e.spd, 1.0 * dt);
      e.vy = lerp(e.vy, dy / d * e.spd, 1.0 * dt);
      e.ang += dt * 1.4;
      /* pull the player */
      if (d < 260) {
        var f = 34000 / Math.max(2600, d * d);
        p.vx += dx / d * f * 60 * dt; p.vy += dy / d * f * 60 * dt;
      }
      if (Math.random() < dt * 30) {
        var pa = Math.random() * TAU, pr = 60 + Math.random() * 90;
        Particles.burst(e.x + Math.cos(pa) * pr, e.y + Math.sin(pa) * pr, 1, '#8fb0ff', 10, 0.55, 2);
      }
    }

    e.x += e.vx * dt; e.y += e.vy * dt;

    /* arena bounds */
    if (e.t === 'snake') {
      if (e.x < a.x + e.r || e.x > a.x + a.w - e.r) { e.ang = Math.PI - e.ang; e.x = clamp(e.x, a.x + e.r, a.x + a.w - e.r); }
      if (e.y < a.y + e.r || e.y > a.y + a.h - e.r) { e.ang = -e.ang; e.y = clamp(e.y, a.y + e.r, a.y + a.h - e.r); }
      /* segment trail */
      var px = e.x, py = e.y;
      for (j = 0; j < e.segs.length; j++) {
        var s = e.segs[j];
        var sdx = px - s.x, sdy = py - s.y, sd = Math.hypot(sdx, sdy);
        var spac = 13;
        if (sd > spac) { s.x += sdx / sd * (sd - spac); s.y += sdy / sd * (sd - spac); }
        px = s.x; py = s.y;
      }
    } else {
      if (e.x < a.x + e.r) { e.x = a.x + e.r; e.vx = Math.abs(e.vx); }
      if (e.x > a.x + a.w - e.r) { e.x = a.x + a.w - e.r; e.vx = -Math.abs(e.vx); }
      if (e.y < a.y + e.r) { e.y = a.y + e.r; e.vy = Math.abs(e.vy); }
      if (e.y > a.y + a.h - e.r) { e.y = a.y + a.h - e.r; e.vy = -Math.abs(e.vy); }
    }

    /* bullets vs enemy */
    var dead = false;
    for (j = G.bullets.length - 1; j >= 0; j--) {
      var bl = G.bullets[j];
      var hitSeg = -1;
      if (dist2(bl.x, bl.y, e.x, e.y) < (e.r + bl.r) * (e.r + bl.r)) hitSeg = 0;
      else if (e.t === 'snake') {
        for (var si = 0; si < e.segs.length; si++) {
          if (dist2(bl.x, bl.y, e.segs[si].x, e.segs[si].y) < (9 + bl.r) * (9 + bl.r)) { hitSeg = si + 1; break; }
        }
      }
      if (hitSeg < 0) continue;
      Particles.burst(bl.x, bl.y, 4, '#ffffff', 130, 0.22, 2.4);
      G.bullets.splice(j, 1);
      if (e.t === 'snake' && hitSeg > 0) {
        /* sever: destroy that segment and everything behind it */
        var lost = e.segs.length - (hitSeg - 1);
        for (var z = e.segs.length - 1; z >= hitSeg - 1; z--) {
          var sg = e.segs[z];
          Particles.burst(sg.x, sg.y, 6, COL.snake, 150, 0.4, 2.6);
          G.crystals.push({ x: sg.x, y: sg.y, vx: (Math.random() - 0.5) * 90, vy: (Math.random() - 0.5) * 90, l: 9 });
          e.segs.pop();
        }
        G.score += Math.round(15 * lost * G.mult);
        Snd.hit(); G.shake = Math.min(16, G.shake + 2);
        continue;
      }
      e.hp--;
      e.hurt = 0.12;
      if (e.hp <= 0) { killEnemy(e, i, false); dead = true; break; }
      else Snd.hit();
    }
    if (dead) continue;
    if (e.hurt > 0) e.hurt -= dt;

    /* enemy vs player */
    if (canHurt && G.invuln <= 0 && G.state === 'play') {
      var hitR = e.r + p.r - 3;
      var hitP = dist2(e.x, e.y, p.x, p.y) < hitR * hitR;
      if (!hitP && e.t === 'snake') {
        for (var s2 = 0; s2 < e.segs.length; s2++) {
          if (dist2(e.segs[s2].x, e.segs[s2].y, p.x, p.y) < (9 + p.r - 3) * (9 + p.r - 3)) { hitP = true; break; }
        }
      }
      if (hitP) { playerDie(); return; }
    }
  }
}

/* ================= rendering ================= */
var _d = [0, 0];
var _wellGrad = null;

function drawGrid(c) {
  var a = G.arena;
  var step = 48, samp = 24;
  c.lineWidth = 1;
  c.strokeStyle = 'rgba(60,120,190,0.30)';
  var x, y, first;
  for (x = a.x; x <= a.x + a.w + 1; x += step) {
    var xx = Math.min(x, a.x + a.w);
    c.beginPath(); first = true;
    for (y = a.y; y <= a.y + a.h; y += samp) {
      Ripples.disp(xx, y, _d);
      if (first) { c.moveTo(xx + _d[0], y + _d[1]); first = false; }
      else c.lineTo(xx + _d[0], y + _d[1]);
    }
    c.stroke();
  }
  for (y = a.y; y <= a.y + a.h + 1; y += step) {
    var yy = Math.min(y, a.y + a.h);
    c.beginPath(); first = true;
    for (x = a.x; x <= a.x + a.w; x += samp) {
      Ripples.disp(x, yy, _d);
      if (first) { c.moveTo(x + _d[0], yy + _d[1]); first = false; }
      else c.lineTo(x + _d[0], yy + _d[1]);
    }
    c.stroke();
  }
  /* arena border */
  c.strokeStyle = 'rgba(120,220,255,0.20)'; c.lineWidth = 6;
  c.strokeRect(a.x, a.y, a.w, a.h);
  c.strokeStyle = 'rgba(150,240,255,0.85)'; c.lineWidth = 1.6;
  c.strokeRect(a.x, a.y, a.w, a.h);
}

function poly(c, cx, cy, r, n, rot, col, fillA) {
  c.beginPath();
  for (var i = 0; i < n; i++) {
    var an = rot + i / n * TAU;
    var px = cx + Math.cos(an) * r, py = cy + Math.sin(an) * r;
    if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
  }
  c.closePath();
  if (fillA) { c.globalAlpha = fillA; c.fillStyle = col; c.fill(); c.globalAlpha = 1; }
  c.lineWidth = 3.4; c.globalAlpha = 0.28; c.strokeStyle = col; c.stroke();
  c.globalAlpha = 1; c.lineWidth = 1.6; c.stroke();
}

function drawEnemy(c, e) {
  var col = COL[e.t] || '#fff';
  if (e.born > 0) {
    var t = 1 - e.born / (e.t === 'mini' ? 0.35 : 0.7);
    c.globalAlpha = 0.25 + t * 0.5;
    c.strokeStyle = col; c.lineWidth = 2;
    c.beginPath(); c.arc(e.x, e.y, e.r + (1 - t) * 26, 0, TAU); c.stroke();
    c.globalAlpha = 1;
    return;
  }
  if (e.hurt > 0) col = '#ffffff';
  if (e.t === 'drifter') poly(c, e.x, e.y, e.r, 4, e.ang, col, 0.16);
  else if (e.t === 'mini') poly(c, e.x, e.y, e.r, 3, e.ang, col, 0.2);
  else if (e.t === 'weaver') {
    poly(c, e.x, e.y, e.r, 3, e.ang, col, 0.14);
    poly(c, e.x, e.y, e.r * 0.55, 3, -e.ang, col, 0.3);
  } else if (e.t === 'snake') {
    for (var i = e.segs.length - 1; i >= 0; i--) {
      var s = e.segs[i], f = 1 - i / (e.segs.length + 1) * 0.55;
      c.globalAlpha = 0.55 * f + 0.2;
      c.fillStyle = col;
      c.beginPath(); c.arc(s.x, s.y, 8 * f + 2, 0, TAU); c.fill();
      c.globalAlpha = 1;
      c.strokeStyle = col; c.lineWidth = 1.4;
      c.beginPath(); c.arc(s.x, s.y, 8 * f + 2, 0, TAU); c.stroke();
    }
    poly(c, e.x, e.y, e.r, 5, e.ang, col, 0.4);
  } else if (e.t === 'spawner') {
    poly(c, e.x, e.y, e.r, 6, e.ph * 0.6, col, 0.14);
    poly(c, e.x, e.y, e.r * 0.5 + Math.sin(e.ph * 4) * 2, 6, -e.ph, col, 0.35);
  } else if (e.t === 'well') {
    /* gradient built once at the origin, then translated into place */
    if (!_wellGrad) {
      _wellGrad = c.createRadialGradient(0, 0, 2, 0, 0, 130);
      _wellGrad.addColorStop(0, 'rgba(95,139,255,0.42)');
      _wellGrad.addColorStop(0.45, 'rgba(60,80,190,0.13)');
      _wellGrad.addColorStop(1, 'rgba(0,0,0,0)');
    }
    c.save(); c.translate(e.x, e.y);
    c.fillStyle = _wellGrad;
    c.beginPath(); c.arc(0, 0, 130, 0, TAU); c.fill();
    c.restore();
    c.fillStyle = '#04050e';
    c.beginPath(); c.arc(e.x, e.y, e.r * 0.72, 0, TAU); c.fill();
    poly(c, e.x, e.y, e.r, 8, e.ang, col, 0);
    poly(c, e.x, e.y, e.r * 1.5, 3, -e.ang * 1.7, col, 0);
  }
}

function drawPlayer(c) {
  var p = G.player;
  if (G.state === 'dead' || G.state === 'over') return;
  if (G.invuln > 0 && (Math.floor(G.invuln * 12) & 1)) return;
  c.save();
  c.translate(p.x, p.y); c.rotate(p.ang);
  c.beginPath();
  c.moveTo(14, 0); c.lineTo(-9, 8.5); c.lineTo(-5, 0); c.lineTo(-9, -8.5);
  c.closePath();
  c.globalAlpha = 0.22; c.fillStyle = COL.player; c.fill(); c.globalAlpha = 1;
  c.lineWidth = 3.6; c.globalAlpha = 0.3; c.strokeStyle = COL.player; c.stroke();
  c.globalAlpha = 1; c.lineWidth = 1.7; c.strokeStyle = '#e8ffff'; c.stroke();
  c.restore();
}

function drawHud(c) {
  var W = View.w, H = View.h;
  c.textAlign = 'left'; c.textBaseline = 'top';
  c.font = 'bold 22px monospace';
  c.fillStyle = '#dff6ff';
  c.fillText(String(G.score), 12, 12);
  c.font = 'bold 13px monospace';
  c.fillStyle = 'rgba(160,200,225,0.8)';
  c.fillText('BEST ' + G.best, 12, 36);

  c.textAlign = 'right';
  c.font = 'bold 20px monospace';
  c.fillStyle = G.mult > 1 ? '#8affe0' : 'rgba(150,190,215,0.75)';
  c.fillText('x' + G.mult, W - 12, 12);
  c.font = 'bold 13px monospace';
  c.fillStyle = 'rgba(160,200,225,0.8)';
  c.fillText('WAVE ' + Math.max(1, G.wave), W - 12, 36);

  /* lives pips */
  c.textAlign = 'center';
  for (var i = 0; i < 3; i++) {
    var lx = W * 0.5 - 22 + i * 22, ly = 22;
    c.beginPath();
    c.moveTo(lx + 7, ly); c.lineTo(lx - 5, ly + 5); c.lineTo(lx - 5, ly - 5);
    c.closePath();
    if (i < G.lives) { c.fillStyle = COL.player; c.globalAlpha = 0.85; c.fill(); c.globalAlpha = 1; }
    else { c.strokeStyle = 'rgba(120,180,205,0.4)'; c.lineWidth = 1.2; c.stroke(); }
  }

  /* bomb button */
  var b = Input.bomb;
  c.globalAlpha = G.bombs > 0 ? 1 : 0.28;
  c.beginPath(); c.arc(b.x, b.y, b.r, 0, TAU);
  c.fillStyle = 'rgba(255,123,213,0.13)'; c.fill();
  c.strokeStyle = COL.bomb; c.lineWidth = 2; c.stroke();
  c.fillStyle = COL.bomb; c.font = 'bold 12px monospace'; c.textBaseline = 'middle';
  c.fillText('BOMB', b.x, b.y - 6);
  c.font = 'bold 15px monospace';
  c.fillText(String(G.bombs), b.x, b.y + 9);
  c.globalAlpha = 1;
  c.textBaseline = 'top';
}

function draw() {
  var c = View.ctx, W = View.w, H = View.h;
  View.begin();
  c.fillStyle = '#05060c';
  c.fillRect(0, 0, W, H);

  var sx = 0, sy = 0;
  if (G.shake > 0.3) { sx = (Math.random() - 0.5) * G.shake; sy = (Math.random() - 0.5) * G.shake; }
  c.save();
  c.translate(sx, sy);

  drawGrid(c);

  /* crystals */
  for (var i = 0; i < G.crystals.length; i++) {
    var cr = G.crystals[i];
    if (cr.l < 2 && (Math.floor(cr.l * 8) & 1)) continue;
    c.fillStyle = COL.crystal; c.globalAlpha = 0.85;
    c.beginPath();
    c.moveTo(cr.x, cr.y - 4.5); c.lineTo(cr.x + 3.4, cr.y); c.lineTo(cr.x, cr.y + 4.5); c.lineTo(cr.x - 3.4, cr.y);
    c.closePath(); c.fill(); c.globalAlpha = 1;
  }
  /* bomb pickups */
  for (i = 0; i < G.drops.length; i++) {
    var d = G.drops[i];
    if (d.l < 3 && (Math.floor(d.l * 8) & 1)) continue;
    poly(c, d.x, d.y, 9 + Math.sin(d.ph) * 1.6, 6, d.ph * 0.5, COL.bomb, 0.3);
  }

  Particles.draw(c);
  for (i = 0; i < G.enemies.length; i++) drawEnemy(c, G.enemies[i]);

  /* bullets */
  c.fillStyle = '#ffffff';
  for (i = 0; i < G.bullets.length; i++) {
    var b = G.bullets[i];
    c.globalAlpha = 0.3;
    c.fillRect(b.x - 2.8, b.y - 2.8, 5.6, 5.6);
    c.globalAlpha = 1;
    c.fillRect(b.x - 1.5, b.y - 1.5, 3, 3);
  }
  drawPlayer(c);
  c.restore();

  drawHud(c);
  Input.drawSticks(c);

  /* banner */
  if (G.banner > 0 && G.state === 'play') {
    var al = Math.min(1, G.banner / 0.5);
    c.globalAlpha = al * 0.9;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = 'bold 30px monospace'; c.fillStyle = '#9be8ff';
    c.fillText(G.bannerTxt, W * 0.5, G.arena.y + G.arena.h * 0.32);
    c.globalAlpha = 1; c.textBaseline = 'top';
  }

  /* one-line hint */
  if (G.hint > 0) {
    c.globalAlpha = Math.min(1, G.hint / 1.5) * 0.85;
    c.textAlign = 'center';
    c.font = 'bold 13px monospace'; c.fillStyle = '#bfe6ff';
    c.fillText('DRAG LEFT TO MOVE  ·  DRAG RIGHT TO SHOOT', W * 0.5, G.arena.y + G.arena.h - 92);
    c.globalAlpha = 1;
  }

  if (G.flash > 0) {
    c.globalAlpha = clamp(G.flash, 0, 1) * 0.35;
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, H); c.globalAlpha = 1;
  }

  if (G.state === 'over') {
    c.fillStyle = 'rgba(3,5,12,0.82)'; c.fillRect(0, 0, W, H);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    var cy = H * 0.42;
    c.font = 'bold 34px monospace'; c.fillStyle = '#ff5f6d';
    c.fillText('GAME OVER', W * 0.5, cy - 74);
    c.font = 'bold 15px monospace'; c.fillStyle = 'rgba(180,215,235,0.85)';
    c.fillText('SCORE', W * 0.5, cy - 24);
    c.font = 'bold 42px monospace'; c.fillStyle = '#dff6ff';
    c.fillText(String(G.score), W * 0.5, cy + 8);
    c.font = 'bold 15px monospace'; c.fillStyle = '#8affe0';
    c.fillText('BEST ' + G.best + (G.score >= G.best && G.score > 0 ? '  ·  NEW!' : ''), W * 0.5, cy + 46);
    c.fillStyle = 'rgba(180,215,235,0.7)';
    c.fillText('WAVE ' + G.wave + '  ·  PEAK x' + G.peak, W * 0.5, cy + 70);
    if (G.over > 0.6 && (Math.floor(G.over * 1.6) & 1)) {
      c.font = 'bold 17px monospace'; c.fillStyle = '#9be8ff';
      c.fillText('TAP OR PRESS ANY KEY', W * 0.5, cy + 120);
    }
    c.textBaseline = 'top';
  }
}

/* ================= loop ================= */
var _last = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  if (!_last) _last = ts;
  var dt = (ts - _last) / 1000;
  _last = ts;
  if (dt > 1 / 20) dt = 1 / 20;
  if (dt <= 0) dt = 1 / 60;
  update(dt);
  draw();
}

document.addEventListener('visibilitychange', function () { _last = 0; });
boot();
