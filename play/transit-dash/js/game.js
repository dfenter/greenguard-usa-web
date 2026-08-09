/* Transit Dash - simulation + renderer */
(function (g) {
  'use strict';
  var TD = g.TD, clamp = TD.clamp, lerp = TD.lerp;

  /* world constants */
  var CAM_D = 8, CAM_BACK = 3;
  var GRAV = 24;
  var JUMP_SPAN = 9.4, JUMP_PEAK = 1.95;
  var RAMP_SPAN = 22, RAMP_PEAK = 5.5;
  /* speed-invariant ballistics: fixed arc SPAN (world units) and PEAK (height) */
  function arcV(speed, span, peak) { return 4 * peak * speed / span; }
  function arcG(speed, span, peak) { return 8 * peak * speed * speed / (span * span); }
  var SPD0 = 9.5, SPDMAX = 23, SPD_RAMP = 0.16;      // units/s, +/s
  var SPAWN_AHEAD = 105, PRUNE_BEHIND = -5;
  var MAX_ENT = 260, MAX_PART = 150, MAX_POPS = 14;

  var SPAN = {
    train: [0, 1.15],
    barrier: [1.08, 2.9],
    block: [0, 3.2]
  };
  var DEPTH = { train: 3.6, barrier: 0.6, block: 1.3, ramp: 2.6 };

  var Game = {
    cv: null, ctx: null, W: 360, H: 640, dpr: 1,
    state: 'menu', theme: 0, save: null,
    onGameOver: null, onMission: null,
    timers: [],

    /* ---------- lifecycle ---------- */
    init: function (cv) {
      this.cv = cv; this.ctx = cv.getContext('2d', { alpha: false });
      this.save = TD.Save.load();
      this.theme = clamp(this.save.theme, 0, TD.THEMES.length - 1);
      this.ents = []; this.parts = []; this.pops = [];
      this.resize();
      this.reset(false);
    },

    resize: function () {
      var host = this.cv.parentNode;
      var w = Math.max(240, this.cv.clientWidth || host.clientWidth || window.innerWidth);
      var h = Math.max(320, this.cv.clientHeight || host.clientHeight || window.innerHeight);
      var s = Math.min(window.devicePixelRatio || 1, 2);
      var longAxis = Math.max(w, h);
      if (longAxis * s > 960) s = 960 / longAxis;
      s = Math.max(0.5, s);
      this.W = w; this.H = h; this.dpr = s;
      this.cv.width = Math.round(w * s);
      this.cv.height = Math.round(h * s);
      this.HZ = h * 0.30;
      this.BOT = h * 0.995;
      this.LANE_PX = w * 0.34;
      this.UNIT_PX = w * 0.205;
    },

    later: function (fn, ms) {
      var self = this;
      var id = setTimeout(function () {
        var i = self.timers.indexOf(id); if (i >= 0) self.timers.splice(i, 1);
        fn();
      }, ms);
      this.timers.push(id);
      if (this.timers.length > 24) { clearTimeout(this.timers.shift()); }
      return id;
    },
    clearTimers: function () {
      for (var i = 0; i < this.timers.length; i++) clearTimeout(this.timers[i]);
      this.timers.length = 0;
    },

    /* ---------- new run (hardening #2) ---------- */
    reset: function (playing) {
      this.clearTimers();
      TD.Input.reset();

      this.ents.length = 0; this.parts.length = 0; this.pops.length = 0;
      this.dist = 0; this.speed = SPD0; this.coins = 0; this.combo = 0;
      this.shake = 0; this.flash = 0; this.flashCol = '#fff';
      this.tick = 0; this.runPickups = 0; this.runRamps = 0;
      this.runSlides = 0; this.runVaults = 0; this.runLanes = 0;
      this.cleanDist = 0; this.stumbles = 0;
      this.magnetT = 0; this.boardT = 0; this.multT = 0;
      this.inspT = 0; this.inspMax = 13;
      this.bannerT = 0; this.bannerTxt = '';
      this.hintT = playing ? 4.2 : 0;

      this.p = {
        lane: 0, lp: 0, y: 0, vy: 0, grav: GRAV,
        air: false, sky: false, slideT: 0, phase: 0, hurt: 0, tilt: 0
      };

      var seed = TD.hashSeed(this.save.day * 31 + this.theme * 7919 + 1013);
      this.rng = TD.makeRng(seed);
      this.nextZ = 30;
      this.genUntil(SPAWN_AHEAD);
      this.state = playing ? 'run' : 'menu';
    },

    start: function () {
      this.save = TD.Save.load();
      this.theme = clamp(this.save.theme, 0, TD.THEMES.length - 1);
      /* per-run missions reset */
      for (var i = 0; i < this.save.missions.length; i++) {
        var m = this.save.missions[i];
        if (TD.missionDef(m.id).run) m.prog = 0;
      }
      this.reset(true);
    },

    th: function () { return TD.THEMES[clamp(this.theme, 0, TD.THEMES.length - 1)]; },

    /* ---------- procedural route ---------- */
    addEnt: function (e) { if (this.ents.length < MAX_ENT) this.ents.push(e); },

    coinRun: function (lane, z, n, h, val, step) {
      step = step || 1.5;
      for (var i = 0; i < n; i++) {
        this.addEnt({ t: 'coin', z: z + i * step, lane: lane, lx: lane, y: h, val: val, dead: false, spin: i * 0.7 });
      }
    },

    /* coins tracing the (speed-invariant) ramp launch parabola */
    coinArc: function (lane, z0, span, peak, n) {
      for (var i = 0; i < n; i++) {
        var dz = 4 + i * 1.6;
        var u = dz / span;
        var y = 4 * peak * (u - u * u) + 0.85;
        this.addEnt({ t: 'coin', z: z0 + dz, lane: lane, lx: lane, y: y, val: 2, dead: false, spin: i * 0.7 });
      }
    },

    pickLanes: function (n) {
      var all = [-1, 0, 1], out = [];
      for (var i = 0; i < n && all.length; i++) {
        var k = Math.floor(this.rng.f() * all.length) % all.length;
        out.push(all[k]); all.splice(k, 1);
      }
      return out;
    },

    genUntil: function (zAhead) {
      var guard = 0;
      while (this.nextZ < this.dist + zAhead && guard++ < 40 && this.ents.length < MAX_ENT - 14) {
        this.emitRow();
      }
    },

    emitRow: function () {
      var r = this.rng, th = this.th(), z = this.nextZ;
      var diff = clamp(this.nextZ / 2600, 0, 1);
      var tight = lerp(1.12, 0.72, diff);
      var dbl = 0.16 + diff * 0.42;

      var roll = r.f(), mix = th.mix, acc = 0, kind = 'block';
      var keys = ['train', 'barrier', 'block', 'ramp'];
      for (var i = 0; i < keys.length; i++) { acc += mix[keys[i]]; if (roll <= acc) { kind = keys[i]; break; } }

      if (kind === 'ramp') {
        var rl = this.pickLanes(1)[0];
        this.addEnt({ t: 'ramp', z: z, lane: rl, dead: false });
        /* alternate rooftop line: high-value coins tracing the launch arc */
        this.coinArc(rl, z - DEPTH.ramp * 0.5, RAMP_SPAN, RAMP_PEAK, 10);
        if (r.chance(0.5)) {
          var ol = rl === 0 ? (r.chance(0.5) ? -1 : 1) : 0;
          this.addEnt({ t: 'block', z: z + 12, lane: ol, dead: false });
        }
        this.nextZ = z + 30 * tight;
        return;
      }

      var n = r.chance(dbl) ? 2 : 1;
      var lanes = this.pickLanes(n);
      for (var j = 0; j < lanes.length; j++) {
        this.addEnt({ t: kind, z: z, lane: lanes[j], dead: false, hit: false, tag: Math.floor(r.f() * 3) });
      }
      /* reward lane: coins in a free lane */
      var free = [-1, 0, 1].filter(function (l) { return lanes.indexOf(l) < 0; });
      if (free.length && r.chance(0.72)) {
        var fl = free[Math.floor(r.f() * free.length) % free.length];
        if (kind === 'train' && free.indexOf(fl) >= 0 && r.chance(0.4)) {
          this.coinRun(lanes[0], z - 1, 5, 2.4, 1, 1.4);   /* vault arc bonus */
        } else {
          this.coinRun(fl, z, 5, kind === 'barrier' ? 0.7 : 0.95, 1, 1.4);
        }
      }
      if (r.chance(0.1)) {
        var pl = this.pickLanes(1)[0];
        var kinds = ['magnet', 'board', 'mult'];
        this.addEnt({ t: 'power', z: z + 6, lane: pl, lx: pl, kind: kinds[Math.floor(r.f() * 3) % 3], y: 1.1, dead: false });
      }
      var gap = (kind === 'train' ? 11 : 8) + r.f() * 7;
      this.nextZ = z + gap * tight;
    },

    /* ---------- input ---------- */
    act: function (a) {
      var p = this.p;
      if (a === 'left' || a === 'right') {
        var d = a === 'left' ? -1 : 1;
        var nl = clamp(p.lane + d, -1, 1);
        if (nl !== p.lane) {
          p.lane = nl; p.tilt = d * 0.9; this.runLanes++;
          this.bumpMission('lanes', 1);
          TD.Audio.tone(420, 0.05, 'square', 0.09);
        }
      } else if (a === 'up') {
        if (!p.air) {
          p.air = true; p.slideT = 0; p.sky = false;
          p.vy = arcV(this.speed, JUMP_SPAN, JUMP_PEAK);
          p.grav = arcG(this.speed, JUMP_SPAN, JUMP_PEAK);
          TD.Audio.jump();
          this.puff(6, '#8fe6ff');
        }
      } else if (a === 'down') {
        if (p.air) { p.vy = Math.min(p.vy, -this.speed * 0.5); p.grav = p.grav * 2.2; }
        else { p.slideT = clamp(7.6 / this.speed, 0.34, 0.9); TD.Audio.slide(); this.puff(8, '#ffd166'); }
      }
    },

    /* ---------- update ---------- */
    update: function (dt) {
      if (this.state !== 'run') return;
      this.tick += dt;
      var p = this.p;

      var a;
      var guard = 0;
      while ((a = TD.Input.take()) && guard++ < 4) this.act(a);

      this.speed = Math.min(SPDMAX, this.speed + SPD_RAMP * dt);
      if (p.hurt > 0) { p.hurt -= dt; }
      var eff = this.speed * (p.hurt > 0 ? 0.55 : 1);
      this.dist += eff * dt;
      this.cleanDist += eff * dt;

      /* lane lerp */
      p.lp += clamp(p.lane - p.lp, -1, 1) * Math.min(1, dt * 13);
      if (Math.abs(p.lane - p.lp) < 0.005) p.lp = p.lane;
      p.tilt *= Math.pow(0.02, dt);

      /* vertical */
      if (p.air) {
        p.vy -= p.grav * dt;
        p.y += p.vy * dt;
        if (p.y <= 0) {
          p.y = 0; p.vy = 0; p.air = false; p.sky = false; p.grav = GRAV;
          TD.Audio.land(); this.puff(5, '#9fb2c8');
        }
      } else {
        p.phase += eff * dt * 0.9;
      }
      if (p.slideT > 0) { p.slideT -= dt; if (p.slideT < 0) p.slideT = 0; }

      /* powers */
      if (this.magnetT > 0) this.magnetT -= dt;
      if (this.boardT > 0) this.boardT -= dt;
      if (this.multT > 0) this.multT -= dt;
      if (this.bannerT > 0) this.bannerT -= dt;
      if (this.hintT > 0) this.hintT -= dt;

      /* inspector recedes while clean */
      if (this.inspT > 0) {
        this.inspT -= dt;
        if (this.inspT <= 0) { this.inspT = 0; this.banner('INSPECTOR LOST'); TD.Audio.tone(660, 0.12, 'triangle', 0.14); }
      }

      this.genUntil(SPAWN_AHEAD);
      this.collide(dt);
      this.prune();
      this.stepFx(dt);

      this.bumpMission('dist', 0, Math.floor(this.dist));
      this.bumpMission('clean', 0, Math.floor(this.cleanDist));

      if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 26);
      if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 3.2);
    },

    playerBox: function () {
      var p = this.p;
      var sliding = p.slideT > 0 && !p.air;
      var h = sliding ? 0.95 : 1.8;
      return { y0: p.y, y1: p.y + h, slide: sliding };
    },

    collide: function () {
      var p = this.p, box = this.playerBox(), self = this;
      var mag = this.magnetT > 0;
      for (var i = 0; i < this.ents.length; i++) {
        var e = this.ents[i];
        if (e.dead) continue;
        var rz = e.z - this.dist;
        if (rz > 30) continue;

        if (e.t === 'coin') {
          if (mag && rz < 14 && rz > -1 && Math.abs(e.lx - p.lp) < 2.2) {
            e.lx += clamp(p.lp - e.lx, -1, 1) * 0.16;
            e.y += clamp((p.y + 0.9) - e.y, -1, 1) * 0.12;
          }
          if (rz < 0.9 && rz > -0.9 && Math.abs(e.lx - p.lp) < 0.62 &&
            Math.abs(e.y - (p.y + (box.slide ? 0.45 : 0.9))) < 1.25) {
            e.dead = true;
            var v = e.val * (this.multT > 0 ? 2 : 1);
            this.coins += v; this.combo++;
            this.bumpMission('coins', v);
            this.pop('+' + v, e.lx, e.y, e.val > 1 ? '#8fe6ff' : '#ffd166');
            TD.Audio.coin(this.combo);
            this.spark(e.lx, e.y, e.val > 1 ? '#8fe6ff' : '#ffd166', 5);
          }
          continue;
        }

        if (e.t === 'power') {
          if (rz < 1.1 && rz > -1.1 && Math.abs(e.lx - p.lp) < 0.7 && Math.abs(p.y - 0.6) < 2.2) {
            e.dead = true; this.runPickups++;
            this.bumpMission('pick', 1);
            if (e.kind === 'magnet') { this.magnetT = 9; this.banner('TOKEN MAGNET'); }
            else if (e.kind === 'board') { this.boardT = 11; this.banner('GRIND BOARD'); }
            else { this.multT = 10; this.banner('DOUBLE FARE'); }
            TD.Audio.power(); this.flashUp('#8fe6ff', 0.5);
            this.spark(e.lx, 1.2, '#8fe6ff', 12);
          }
          continue;
        }

        if (e.t === 'ramp') {
          if (rz < DEPTH.ramp * 0.5 && rz > -DEPTH.ramp * 0.5 && Math.abs(e.lane - p.lp) < 0.62 && p.y < 0.9 && !e.dead) {
            e.dead = true;
            p.air = true; p.sky = true;
            p.vy = arcV(this.speed, RAMP_SPAN, RAMP_PEAK);
            p.grav = arcG(this.speed, RAMP_SPAN, RAMP_PEAK);
            p.slideT = 0;
            this.runRamps++; this.bumpMission('ramp', 1);
            TD.Audio.ramp(); this.shake = 5; this.puff(14, '#ff9de2');
            this.banner('ROOFTOP LINE');
          }
          continue;
        }

        /* solid obstacles */
        var d = DEPTH[e.t] || 1, sp = SPAN[e.t];
        if (rz - d * 0.5 < 0.55 && rz + d * 0.5 > -0.55 && Math.abs(e.lane - p.lp) < 0.62) {
          var vOverlap = box.y0 < sp[1] - 0.02 && box.y1 > sp[0] + 0.02;
          if (!vOverlap) {
            if (!e.hit) {
              e.hit = true;
              if (e.t === 'train') { this.runVaults++; this.bumpMission('vault', 1); this.pop('VAULT', e.lane, 2.2, '#8fe6ff'); }
              else if (e.t === 'barrier') { this.runSlides++; this.bumpMission('slide', 1); this.pop('SLIDE', e.lane, 1.6, '#ffd166'); }
            }
          } else if (!e.hit) {
            e.hit = true;
            this.stumble(e);
          }
        }
      }
    },

    stumble: function (e) {
      var p = this.p;
      if (this.boardT > 0) {
        this.boardT = 0; e.dead = true;
        this.banner('BOARD SHATTERED');
        this.shake = 12; this.flashUp('#8fe6ff', 0.7);
        this.spark(e.lane, 1.2, '#8fe6ff', 18);
        TD.Audio.hit();
        return;
      }
      this.combo = 0;
      this.cleanDist = 0;
      this.shake = 16; this.flashUp('#ff6b6b', 0.85);
      this.spark(e.lane, 1.0, '#ff6b6b', 16);
      TD.Audio.hit();
      if (this.inspT > 0) { this.caught(); return; }
      this.stumbles++;
      this.inspT = this.inspMax;
      p.hurt = 0.85;
      p.air = false; p.vy = 0; p.y = 0; p.sky = false; p.grav = GRAV;
      this.speed = Math.max(SPD0, this.speed - 2.4);
      this.banner('INSPECTOR ON YOUR TAIL');
    },

    caught: function () {
      this.state = 'over';
      this.stumbles++;
      TD.Audio.caught();
      this.shake = 22; this.flashUp('#ff6b6b', 1);
      this.spark(this.p.lp, 1.0, '#ff6b6b', 26);
      var completed = this.commit();
      TD.Input.enabled = false;
      if (this.onGameOver) this.onGameOver(completed);
    },

    /* ---------- missions ---------- */
    bumpMission: function (id, add, setTo) {
      if (this.state !== 'run') return;
      var ms = this.save.missions;
      for (var i = 0; i < ms.length; i++) {
        var m = ms[i];
        if (m.id !== id) continue;
        if (m.done) continue;
        var goal = TD.missionGoal(m);
        if (typeof setTo === 'number') { if (setTo > m.prog) m.prog = setTo; }
        else m.prog += add;
        if (m.prog >= goal) {
          m.prog = goal; m.done = true;
          this.completeMission(m);
        }
      }
    },

    completeMission: function (m) {
      var reward = 40 + m.tier * 30;
      this.coins += reward;
      this.save.rotations = (this.save.rotations || 0) + 1;
      /* MISSION ROTATES THE ROUTE THEME */
      this.theme = (this.theme + 1) % TD.THEMES.length;
      this.save.theme = this.theme;
      var nt = this.th();
      this.banner('ROUTE SHIFT: ' + nt.name);
      this.flashUp(nt.accent, 1);
      this.shake = 10;
      TD.Audio.fanfare();
      /* rebuild the road ahead with the new theme's seeded route */
      var keep = this.dist + 22;
      for (var i = 0; i < this.ents.length; i++) if (this.ents[i].z > keep) this.ents[i].dead = true;
      this.rng = TD.makeRng(TD.hashSeed(this.save.day * 31 + this.theme * 7919 + 1013));
      this.nextZ = keep + 10;
      this.genUntil(SPAWN_AHEAD);
      this.pendingComplete = this.pendingComplete || [];
      if (this.pendingComplete.length < 8) this.pendingComplete.push(TD.missionText(m));
      if (this.onMission) this.onMission(m);
    },

    /* persist run results, advance completed missions; returns completed labels */
    commit: function () {
      var s = this.save, done = this.pendingComplete || [];
      this.pendingComplete = [];
      var m = Math.floor(this.dist);
      if (m > s.best) s.best = m;
      s.coins = Math.min(9999999, s.coins + this.coins);
      s.runs++;
      for (var i = 0; i < s.missions.length; i++) {
        var mi = s.missions[i];
        if (mi.done) {
          delete mi.done;
          mi.tier = Math.min(TD.missionDef(mi.id).tiers.length - 1, mi.tier + 1);
          mi.prog = 0;
        }
      }
      s.theme = this.theme;
      TD.Save.save();
      return done;
    },

    /* ---------- fx ---------- */
    banner: function (txt) { this.bannerTxt = txt; this.bannerT = 2.1; },
    flashUp: function (c, v) { this.flashCol = c; this.flash = Math.max(this.flash, v); },
    pop: function (txt, lx, y, col) {
      if (this.pops.length >= MAX_POPS) this.pops.shift();
      this.pops.push({ txt: txt, lx: lx, y: y, col: col, life: 0.8, z: 2 });
    },
    spark: function (lx, y, col, n) {
      for (var i = 0; i < n; i++) {
        if (this.parts.length >= MAX_PART) this.parts.shift();
        this.parts.push({
          lx: lx + (Math.random() - 0.5) * 0.5, y: y + Math.random() * 0.7, z: 1 + Math.random() * 2,
          vx: (Math.random() - 0.5) * 3.4, vy: Math.random() * 4.5, vz: (Math.random() - 0.5) * 5,
          life: 0.5 + Math.random() * 0.4, max: 0.9, col: col, s: 2 + Math.random() * 3
        });
      }
    },
    puff: function (n, col) { this.spark(this.p.lp, this.p.y + 0.2, col, n); },
    stepFx: function (dt) {
      var i;
      for (i = this.parts.length - 1; i >= 0; i--) {
        var q = this.parts[i];
        q.life -= dt;
        if (q.life <= 0) { this.parts.splice(i, 1); continue; }
        q.lx += q.vx * dt * 0.35; q.y += q.vy * dt; q.vy -= 16 * dt; q.z += q.vz * dt;
        if (q.y < 0) { q.y = 0; q.vy *= -0.35; }
      }
      for (i = this.pops.length - 1; i >= 0; i--) {
        var pp = this.pops[i]; pp.life -= dt; pp.y += dt * 1.5;
        if (pp.life <= 0) this.pops.splice(i, 1);
      }
    },
    prune: function () {
      var out = [], d = this.dist;
      for (var i = 0; i < this.ents.length; i++) {
        var e = this.ents[i];
        if (e.dead || e.z - d < PRUNE_BEHIND) continue;
        out.push(e);
      }
      if (out.length > MAX_ENT) out.length = MAX_ENT;
      this.ents = out;
    },

    /* ---------- projection ---------- */
    tOf: function (rz) { return CAM_D / (CAM_D + Math.max(-2.4, rz) + CAM_BACK); },
    gy: function (t) { return this.HZ + (this.BOT - this.HZ) * t; },
    /* ground plane as seen by the lifting camera */
    g0: function (t) { return this.gy(t) + this.camY * t * this.UNIT_PX; },
    sx: function (lane, t) { return this.W * 0.5 + lane * t * this.LANE_PX; },
    sy: function (t, h) { return this.gy(t) - (h - this.camY) * t * this.UNIT_PX; },

    /* ---------- render ---------- */
    render: function () {
      var ctx = this.ctx, W = this.W, H = this.H, th = this.th();
      this.camY = this.p.y * 0.42;

      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      if (this.shake > 0) {
        var s = this.shake;
        ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
      }

      /* sky */
      var gr = ctx.createLinearGradient(0, 0, 0, this.HZ + 40);
      gr.addColorStop(0, th.sky[0]); gr.addColorStop(1, th.sky[1]);
      ctx.fillStyle = gr; ctx.fillRect(-20, -20, W + 40, this.HZ + 60);
      this.drawBackdrop(th);

      /* ground */
      ctx.fillStyle = th.ground;
      ctx.fillRect(-20, this.HZ - 1, W + 40, H - this.HZ + 40);

      this.drawTrack(th);
      this.drawEnts(th);
      this.drawPlayer(th);
      this.drawParticles();
      this.drawInspector(th);

      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.drawHud(th);

      if (this.flash > 0) {
        ctx.globalAlpha = Math.min(0.55, this.flash * 0.55);
        ctx.fillStyle = this.flashCol; ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1;
      }
    },

    drawBackdrop: function (th) {
      var ctx = this.ctx, W = this.W, hz = this.HZ;
      var d = this.dist;
      ctx.fillStyle = th.prop;
      /* parallax skyline / tunnel ribs */
      var n = 14;
      for (var i = 0; i < n; i++) {
        var seedv = (i * 97) % 41;
        var off = ((i * 60 - d * 3.2) % (W + 120) + W + 120) % (W + 120) - 60;
        var hgt = 20 + (seedv % 7) * 9;
        var wdt = 26 + (seedv % 5) * 8;
        ctx.globalAlpha = 0.55;
        ctx.fillRect(off, hz - hgt, wdt, hgt);
        ctx.globalAlpha = 1;
      }
      /* horizon glow */
      var gr = ctx.createLinearGradient(0, hz - 26, 0, hz + 4);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, th.fog);
      ctx.fillStyle = gr; ctx.fillRect(0, hz - 26, W, 30);
    },

    drawTrack: function (th) {
      var ctx = this.ctx, far = 90;
      var tF = this.tOf(far), tN = this.tOf(-2.4);

      /* road surface */
      ctx.beginPath();
      ctx.moveTo(this.sx(-1.55, tF), this.g0(tF));
      ctx.lineTo(this.sx(1.55, tF), this.g0(tF));
      ctx.lineTo(this.sx(1.55, tN), this.g0(tN));
      ctx.lineTo(this.sx(-1.55, tN), this.g0(tN));
      ctx.closePath();
      ctx.fillStyle = th.rail; ctx.fill();

      /* ties */
      var step = 3.2;
      var k0 = Math.floor(this.dist / step) - 1;
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      for (var k = k0; k < k0 + 30; k++) {
        var rz = k * step - this.dist;
        if (rz > far) break;
        var t = this.tOf(rz);
        var y = this.g0(t);
        var hgt = Math.max(1, t * 7);
        ctx.fillRect(this.sx(-1.55, t), y - hgt * 0.5, (this.sx(1.55, t) - this.sx(-1.55, t)), hgt);
      }
      /* lane lines */
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 2;
      for (var l = -0.5; l <= 0.5; l += 1) {
        ctx.beginPath();
        ctx.moveTo(this.sx(l, tF), this.g0(tF));
        ctx.lineTo(this.sx(l, tN), this.g0(tN));
        ctx.stroke();
      }
      /* edge rails */
      ctx.strokeStyle = th.accent; ctx.globalAlpha = 0.35; ctx.lineWidth = 3;
      for (var e = -1.55; e <= 1.6; e += 3.1) {
        ctx.beginPath();
        ctx.moveTo(this.sx(e, tF), this.g0(tF));
        ctx.lineTo(this.sx(e, tN), this.g0(tN));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      /* distance fog */
      var gr = ctx.createLinearGradient(0, this.HZ, 0, this.HZ + this.H * 0.22);
      gr.addColorStop(0, th.fog); gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr; ctx.fillRect(0, this.HZ, this.W, this.H * 0.22);
    },

    box3: function (lane, rz, depth, y0, y1, w, fill, top, edge) {
      var ctx = this.ctx;
      var zN = rz - depth * 0.5, zF = rz + depth * 0.5;
      if (zF < -2.3) return;
      var tN = this.tOf(zN), tF = this.tOf(zF);
      var hw = w * 0.5;
      var xNL = this.sx(lane - hw, tN), xNR = this.sx(lane + hw, tN);
      var xFL = this.sx(lane - hw, tF), xFR = this.sx(lane + hw, tF);
      var yN0 = this.sy(tN, y0), yN1 = this.sy(tN, y1);
      var yF0 = this.sy(tF, y0), yF1 = this.sy(tF, y1);

      /* far face */
      ctx.fillStyle = edge || fill;
      ctx.fillRect(xFL, yF1, xFR - xFL, yF0 - yF1);
      /* side walls */
      ctx.fillStyle = edge || fill;
      ctx.beginPath();
      ctx.moveTo(xFL, yF1); ctx.lineTo(xNL, yN1); ctx.lineTo(xNL, yN0); ctx.lineTo(xFL, yF0);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(xFR, yF1); ctx.lineTo(xNR, yN1); ctx.lineTo(xNR, yN0); ctx.lineTo(xFR, yF0);
      ctx.closePath(); ctx.fill();
      /* top */
      if (top) {
        ctx.fillStyle = top;
        ctx.beginPath();
        ctx.moveTo(xFL, yF1); ctx.lineTo(xFR, yF1); ctx.lineTo(xNR, yN1); ctx.lineTo(xNL, yN1);
        ctx.closePath(); ctx.fill();
      }
      /* near face */
      ctx.fillStyle = fill;
      ctx.fillRect(xNL, yN1, xNR - xNL, yN0 - yN1);
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 2;
      ctx.strokeRect(xNL, yN1, xNR - xNL, yN0 - yN1);
    },

    drawEnts: function (th) {
      var ctx = this.ctx, d = this.dist;
      var list = [];
      for (var i = 0; i < this.ents.length; i++) {
        var e = this.ents[i];
        if (e.dead) continue;
        var rz = e.z - d;
        if (rz > 92 || rz < -3) continue;
        e._rz = rz; list.push(e);
      }
      list.sort(function (a, b) { return b._rz - a._rz; });

      for (var j = 0; j < list.length; j++) {
        var q = list[j], rz2 = q._rz, t = this.tOf(rz2);
        if (q.t === 'train') {
          this.box3(q.lane, rz2, DEPTH.train, 0, 1.15, 0.88, '#4d5f78', '#6d82a0', '#3a4a5f');
          /* stripe */
          var tn = this.tOf(rz2 - DEPTH.train * 0.5);
          ctx.fillStyle = th.accent; ctx.globalAlpha = 0.85;
          var xl = this.sx(q.lane - 0.44, tn), xr = this.sx(q.lane + 0.44, tn);
          var yy = this.sy(tn, 0.78);
          ctx.fillRect(xl, yy, xr - xl, Math.max(2, tn * 6));
          ctx.globalAlpha = 1;
        } else if (q.t === 'barrier') {
          this.box3(q.lane, rz2, DEPTH.barrier, 1.08, 2.9, 0.94, '#b6482f', '#d05a3c', '#8d3521');
          var tb = this.tOf(rz2);
          ctx.fillStyle = '#ffd166';
          var bx = this.sx(q.lane - 0.44, tb), bx2 = this.sx(q.lane + 0.44, tb);
          ctx.fillRect(bx, this.sy(tb, 1.35), bx2 - bx, Math.max(2, tb * 8));
        } else if (q.t === 'block') {
          this.box3(q.lane, rz2, DEPTH.block, 0, 3.2, 0.8, '#43506a', '#5d6d8c', '#2f3a4e');
        } else if (q.t === 'ramp') {
          var zN = rz2 - DEPTH.ramp * 0.5, zF = rz2 + DEPTH.ramp * 0.5;
          var tNr = this.tOf(zN), tFr = this.tOf(zF);
          ctx.beginPath();
          ctx.moveTo(this.sx(q.lane - 0.45, tNr), this.sy(tNr, 0));
          ctx.lineTo(this.sx(q.lane + 0.45, tNr), this.sy(tNr, 0));
          ctx.lineTo(this.sx(q.lane + 0.45, tFr), this.sy(tFr, 1.5));
          ctx.lineTo(this.sx(q.lane - 0.45, tFr), this.sy(tFr, 1.5));
          ctx.closePath();
          ctx.fillStyle = '#3f9d6b'; ctx.fill();
          ctx.strokeStyle = '#8ff0b8'; ctx.lineWidth = 2; ctx.stroke();
          ctx.fillStyle = '#8ff0b8'; ctx.globalAlpha = 0.7;
          ctx.fillRect(this.sx(q.lane - 0.2, tFr), this.sy(tFr, 1.5), Math.max(3, (this.sx(q.lane + 0.2, tFr) - this.sx(q.lane - 0.2, tFr))), Math.max(2, tFr * 5));
          ctx.globalAlpha = 1;
        } else if (q.t === 'coin') {
          var r = Math.max(1.5, t * this.UNIT_PX * 0.22);
          var cx = this.sx(q.lx, t), cy = this.sy(t, q.y);
          var wob = Math.abs(Math.cos(this.tick * 5 + q.spin));
          ctx.fillStyle = q.val > 1 ? '#8fe6ff' : '#ffd166';
          ctx.beginPath();
          ctx.ellipse(cx, cy, Math.max(1, r * (0.35 + wob * 0.65)), r, 0, 0, 6.2832);
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1.5; ctx.stroke();
        } else if (q.t === 'power') {
          var pr = Math.max(2, t * this.UNIT_PX * 0.34);
          var px = this.sx(q.lx, t), py = this.sy(t, q.y + Math.sin(this.tick * 3) * 0.12);
          var col = q.kind === 'magnet' ? '#ff6bd6' : (q.kind === 'board' ? '#8fe6ff' : '#a0ff7a');
          ctx.save();
          ctx.translate(px, py); ctx.rotate(this.tick * 1.6);
          ctx.fillStyle = col;
          ctx.fillRect(-pr * 0.7, -pr * 0.7, pr * 1.4, pr * 1.4);
          ctx.fillStyle = 'rgba(0,0,0,0.55)';
          ctx.fillRect(-pr * 0.24, -pr * 0.24, pr * 0.48, pr * 0.48);
          ctx.restore();
          ctx.globalAlpha = 0.28; ctx.fillStyle = col;
          ctx.beginPath(); ctx.arc(px, py, pr * 1.7, 0, 6.2832); ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
    },

    drawPlayer: function (th) {
      var ctx = this.ctx, p = this.p;
      var t = this.tOf(0);
      var slide = p.slideT > 0 && !p.air;
      var h = slide ? 0.95 : 1.8;
      var x = this.sx(p.lp, t);
      var yBase = this.sy(t, p.y);
      var U = t * this.UNIT_PX;
      var bw = U * 0.62, bh = U * h;

      /* shadow */
      var sg = this.g0(t);
      ctx.globalAlpha = clamp(0.45 - p.y * 0.06, 0.08, 0.45);
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(this.sx(p.lp, t), sg, bw * 0.6, U * 0.14, 0, 0, 6.2832);
      ctx.fill(); ctx.globalAlpha = 1;

      ctx.save();
      ctx.translate(x, yBase);
      ctx.rotate(clamp(p.tilt * 0.18, -0.35, 0.35));

      if (this.boardT > 0) {
        ctx.fillStyle = '#8fe6ff';
        ctx.fillRect(-bw * 0.75, 0, bw * 1.5, U * 0.13);
        ctx.globalAlpha = 0.3;
        ctx.fillRect(-bw * 0.9, U * 0.13, bw * 1.8, U * 0.06);
        ctx.globalAlpha = 1;
      }
      if (this.magnetT > 0) {
        ctx.globalAlpha = 0.16; ctx.fillStyle = '#ff6bd6';
        ctx.beginPath(); ctx.arc(0, -bh * 0.5, bw * 2.4, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 1;
      }

      var body = p.hurt > 0 && Math.floor(this.tick * 20) % 2 ? '#ff6b6b' : '#e8eef6';
      var accent = this.multT > 0 ? '#a0ff7a' : th.accent;

      /* legs */
      var run = Math.sin(p.phase * 2.2);
      ctx.fillStyle = '#3a4a63';
      if (slide) {
        ctx.fillRect(-bw * 0.55, -bh * 0.55, bw * 1.3, bh * 0.34);
      } else if (p.air) {
        ctx.fillRect(-bw * 0.42, -bh * 0.42, bw * 0.34, bh * 0.4);
        ctx.fillRect(bw * 0.08, -bh * 0.34, bw * 0.34, bh * 0.32);
      } else {
        ctx.fillRect(-bw * 0.4, -bh * 0.44 + run * bh * 0.05, bw * 0.32, bh * 0.46 - run * bh * 0.05);
        ctx.fillRect(bw * 0.08, -bh * 0.44 - run * bh * 0.05, bw * 0.32, bh * 0.46 + run * bh * 0.05);
      }
      /* torso */
      ctx.fillStyle = body;
      var ty = slide ? -bh * 0.95 : -bh;
      var th2 = slide ? bh * 0.5 : bh * 0.58;
      ctx.fillRect(-bw * 0.5, ty, bw, th2);
      /* vest */
      ctx.fillStyle = accent;
      ctx.fillRect(-bw * 0.5, ty + th2 * 0.35, bw, th2 * 0.22);
      /* head */
      ctx.fillStyle = '#f2d6b8';
      var hr = bw * 0.31;
      ctx.beginPath(); ctx.arc(0, ty - hr * 0.85, hr, 0, 6.2832); ctx.fill();
      ctx.fillStyle = '#2b3547';
      ctx.fillRect(-hr, ty - hr * 1.5, hr * 2, hr * 0.7);
      /* arms */
      ctx.fillStyle = body;
      if (!slide) {
        ctx.fillRect(-bw * 0.72, ty + th2 * 0.12 + run * bh * 0.06, bw * 0.22, th2 * 0.5);
        ctx.fillRect(bw * 0.5, ty + th2 * 0.12 - run * bh * 0.06, bw * 0.22, th2 * 0.5);
      }
      ctx.restore();

      /* pops */
      for (var i = 0; i < this.pops.length; i++) {
        var q = this.pops[i], tt = this.tOf(q.z);
        ctx.globalAlpha = clamp(q.life / 0.8, 0, 1);
        ctx.fillStyle = q.col;
        ctx.font = '700 ' + Math.round(tt * this.UNIT_PX * 0.28) + 'px ui-monospace,monospace';
        ctx.textAlign = 'center';
        ctx.fillText(q.txt, this.sx(q.lx, tt), this.sy(tt, q.y));
        ctx.globalAlpha = 1;
      }
    },

    drawParticles: function () {
      var ctx = this.ctx;
      for (var i = 0; i < this.parts.length; i++) {
        var q = this.parts[i], t = this.tOf(q.z);
        if (t <= 0) continue;
        ctx.globalAlpha = clamp(q.life / q.max, 0, 1);
        ctx.fillStyle = q.col;
        var s = Math.max(1, q.s * t * 1.6);
        ctx.fillRect(this.sx(q.lx, t) - s * 0.5, this.sy(t, q.y) - s * 0.5, s, s);
      }
      ctx.globalAlpha = 1;
    },

    drawInspector: function (th) {
      if (this.inspT <= 0) return;
      var ctx = this.ctx, near = clamp(this.inspT / this.inspMax, 0, 1);
      var t = this.tOf(-2.0 - (1 - near) * 3.5);
      var x = this.sx(this.p.lp * 0.6, t);
      var y = this.g0(t);
      var U = t * this.UNIT_PX;
      var bw = U * 0.6, bh = U * 1.85;
      ctx.globalAlpha = clamp(0.35 + near * 0.6, 0, 0.95);
      ctx.fillStyle = '#1a2233';
      ctx.fillRect(x - bw * 0.5, y - bh, bw, bh);
      ctx.fillStyle = '#ff6b6b';
      ctx.fillRect(x - bw * 0.5, y - bh * 0.72, bw, bh * 0.16);
      ctx.fillStyle = '#3b4a63';
      ctx.beginPath(); ctx.arc(x, y - bh - bw * 0.24, bw * 0.32, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = 1;
    },

    drawHud: function (th) {
      var ctx = this.ctx, W = this.W, H = this.H;
      ctx.textAlign = 'left';
      ctx.font = '700 22px ui-monospace,monospace';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(Math.floor(this.dist) + ' m', 12, 32);
      ctx.font = '700 15px ui-monospace,monospace';
      ctx.fillStyle = '#ffd166';
      ctx.fillText('◆ ' + this.coins, 12, 54);
      ctx.font = '600 10px ui-monospace,monospace';
      ctx.fillStyle = '#7d90a8';
      ctx.fillText('BEST ' + this.save.best + 'm  ·  ' + th.name, 12, 70);

      /* power meters */
      var by = H - 22, bx = 12;
      var pw = [
        { t: this.magnetT, m: 9, c: '#ff6bd6', l: 'MAG' },
        { t: this.boardT, m: 11, c: '#8fe6ff', l: 'BRD' },
        { t: this.multT, m: 10, c: '#a0ff7a', l: 'x2' }
      ];
      for (var i = 0; i < pw.length; i++) {
        if (pw[i].t <= 0) continue;
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(bx, by - 10, 72, 14);
        ctx.fillStyle = pw[i].c;
        ctx.fillRect(bx, by - 10, 72 * clamp(pw[i].t / pw[i].m, 0, 1), 14);
        ctx.fillStyle = '#0b1018';
        ctx.font = '700 9px ui-monospace,monospace';
        ctx.fillText(pw[i].l, bx + 5, by);
        bx += 78;
      }

      /* mission ticker */
      var ms = this.save.missions;
      var idx = Math.floor(this.tick / 3.5) % ms.length;
      var m = ms[idx];
      var goal = TD.missionGoal(m);
      ctx.textAlign = 'center';
      ctx.font = '600 11px ui-monospace,monospace';
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(W * 0.5 - 108, H - 62, 216, 26);
      ctx.fillStyle = '#9fb2c8';
      ctx.fillText(TD.missionDef(m.id).label.replace('{n}', goal) + '  ' + Math.min(m.prog, goal) + '/' + goal, W * 0.5, H - 45);
      ctx.fillStyle = '#4fd08a';
      ctx.fillRect(W * 0.5 - 108, H - 40, 216 * clamp(m.prog / goal, 0, 1), 3);

      /* inspector warning */
      if (this.inspT > 0) {
        ctx.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(this.tick * 6));
        ctx.fillStyle = '#ff6b6b';
        ctx.font = '700 13px ui-monospace,monospace';
        ctx.fillText('! INSPECTOR ' + this.inspT.toFixed(1) + 's !', W * 0.5, H - 76);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(255,107,107,' + (0.25 + 0.2 * Math.sin(this.tick * 6)) + ')';
        ctx.lineWidth = 6; ctx.strokeRect(3, 3, W - 6, H - 6);
      }

      /* banner */
      if (this.bannerT > 0) {
        ctx.globalAlpha = clamp(this.bannerT / 0.6, 0, 1);
        ctx.font = '700 17px ui-monospace,monospace';
        ctx.fillStyle = th.accent;
        ctx.fillText(this.bannerTxt, W * 0.5, H * 0.30);
        ctx.globalAlpha = 1;
      }
      /* single hint line */
      if (this.hintT > 0) {
        ctx.globalAlpha = clamp(this.hintT / 1.2, 0, 1);
        ctx.font = '600 11px ui-monospace,monospace';
        ctx.fillStyle = '#cfe0f2';
        ctx.fillText('swipe ←→ track  ↑ vault  ↓ slide', W * 0.5, H * 0.38);
        ctx.globalAlpha = 1;
      }
      ctx.textAlign = 'left';
    }
  };

  g.TD.Game = Game;
})(window);
