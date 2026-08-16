/* hb_play.js — Hullbreaker simulation: pools, spawning, the sector run,
 * and the fixed-step world update. Presentation lives in hb_hud.js, which
 * appends its methods to the same PLAY object before the game boots.
 */
(function () {
  'use strict';

  var I = window.HB_INTERNAL;
  var D = window.HB_DATA;
  var kit = I.kit, Tap = I.Tap, HB = I.HB_STATE, Game = I.Game;
  var SHIP = I.SHIP, STEP = I.STEP;
  var clamp = I.clamp, lerp = I.lerp, angDiff = I.angDiff;
  var wrapDelta = I.wrapDelta;
  var mulberry32 = I.mulberry32, rngRange = I.rngRange, rngPick = I.rngPick;
  var tex = I.tex, img = I.img, setFrame = I.setFrame;

  var TAU = Math.PI * 2;
  var ROCK_RESERVE = 18;
  var SHOT_RESERVE = 16;
  var PICKUP_RESERVE = 16;

  function newRock() {
    return {
      alive: false, x: 0, y: 0, vx: 0, vy: 0, r: 12, rot: 0, spin: 0,
      size: 'small', hp: 1, hpMax: 1, fam: 'belt', texKey: '', hit: 0,
      comet: false, ore: 1, score: 10, mass: 1, spr: null, kind: 'rock',
      trailT: 0, born: 0, priority: 1, bornSeq: 0
    };
  }
  function newShot() {
    return {
      alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, dmg: 1, r: 5,
      homing: 0, pierce: 0, hitList: null, spr: null, tint: 0xffffff, ang: 0,
      hostile: false, priority: 1, bornSeq: 0
    };
  }
  function newPickup() {
    return {
      alive: false, x: 0, y: 0, vx: 0, vy: 0, kind: 'ore', life: 0, amount: 1,
      spr: null, pull: 0, bob: 0, spark: 0
    };
  }
  function newHazard() {
    return {
      alive: false, type: 'mine', x: 0, y: 0, vx: 0, vy: 0, r: 16, hp: 1,
      hpMax: 1, state: 'idle', timer: 0, spr: null, rot: 0, spin: 0,
      pull: 0, hit: 0, fire: 0, nodes: null
    };
  }

  function poolTake(arr, priority, canEvict, reserve) {
    var i, active = 0, victim = null, free = null;
    for (i = 0; i < arr.length; i++) {
      if (!arr[i].alive) { if (!free) free = arr[i]; continue; }
      active++;
    }
    if (reserve && active >= arr.length - reserve) return null;
    if (free) { free._poolEvicted = false; return free; }
    if (canEvict) {
      for (i = 0; i < arr.length; i++) {
        if (!canEvict(arr[i])) continue;
        if (!victim || arr[i].bornSeq < victim.bornSeq) victim = arr[i];
      }
    }
    if (victim) {
      victim.alive = false;
      victim._poolEvicted = true;
      if (victim.spr) victim.spr.setVisible(false);
      return victim;
    }
    return null;
  }

  function pickupPriority(id) {
    return id === 'ore' ? 0 : id === 'burst' ? 1 : 2;
  }

  var PLAY = {
    key: 'Play',

    // ================================================================ init
    init: function (data) {
      this.sectorIndex = clamp((data && data.sector) != null ? data.sector : 0,
        0, D.SECTORS.length - 1);
      this.startWave = clamp((data && data.wave) || 1, 1, D.WAVES_PER_SECTOR);
      this.startLadder = !!(data && data.ladder);
      if (this.startLadder && data && data.stage) this.startWave = Math.max(1, data.stage | 0);
      // Both switches are one-shot. Consuming them here is what lets the run
      // advance normally afterwards instead of being yanked back to the
      // forced wave on the next poll.
      HB.forceSector = 0;
      HB.forceWave = 0;
    },

    create: function () {
      var scene = this;
      Game.play = this;
      Game.scene = this;
      Tap.clear();
      Tap.refreshRect();

      this.acc = 0;
      this.mode = 'play';
      this.frozen = false;
      this.paused = false;

      this.sector = D.sectorAt(this.sectorIndex);
      this.family = D.family(this.sector.family);
      this.sky = I.makeBackdrop(this, this.sector);

      this.buildPools();
      this.buildFx();
      this.buildEntities();
      this.buildHud();

      this.control = {
        stickId: null, ox: 0, oy: 0, x: 0, y: 0, mag: 0, active: false,
        firing: false, fireIds: 0
      };
      this.keyEdge = {};
      this.edgeFired = {};
      this.setpiece = null;

      // layout first: the field is sized from the viewport, so spawning
      // before the first layout would seed rocks against a fallback size
      this.layout();
      this.startRun(this.startWave);

      this.scale.on('resize', this.layout, this);
      this.events.once('shutdown', function () {
        scene.scale.off('resize', scene.layout, scene);
        if (Game.play === scene) Game.play = null;
      });
    },

    // ============================================================== pools
    buildPools: function () {
      var i;
      this.rocks = [];
      for (i = 0; i < I.MAX_ROCKS; i++) {
        var r = newRock();
        r.spr = img(this, -999, -999, 'rock_belt_s0').setDepth(30).setVisible(false);
        this.rocks.push(r);
      }
      this.shots = [];
      for (i = 0; i < I.MAX_SHOTS; i++) {
        var s = newShot();
        s.spr = img(this, -999, -999, 'shot_pulse')
          .setDepth(38).setVisible(false).setBlendMode(Phaser.BlendModes.ADD);
        this.shots.push(s);
      }
      this.pickups = [];
      for (i = 0; i < I.MAX_PICKUPS; i++) {
        var p = newPickup();
        p.spr = img(this, -999, -999, 'ic_ore').setDepth(34).setVisible(false);
        this.pickups.push(p);
      }
      this.hazards = [];
      for (i = 0; i < I.MAX_HAZARDS; i++) {
        var h = newHazard();
        h.spr = img(this, -999, -999, 'mine').setDepth(28).setVisible(false);
        this.hazards.push(h);
      }
      // Wrap ghosts: their own pool of images, never an alias of an entity
      // sprite, so a ghost can never be mistaken for a live object.
      this.ghosts = [];
      for (i = 0; i < I.MAX_GHOSTS; i++) {
        this.ghosts.push(img(this, -999, -999, 'rock_belt_s0').setDepth(29).setVisible(false));
      }
      this.ghostNext = 0;
    },

    buildEntities: function () {
      this.ship = {
        x: 0, y: 0, vx: 0, vy: 0, ang: -Math.PI / 2, r: SHIP.r,
        thrusting: 0, retro: 0, invuln: 0, dash: 0, dashDir: 0,
        hitFlash: 0, alive: true, spr: null
      };
      this.ship.spr = img(this, 0, 0, 'ship').setDepth(40).setScale(0.62);
      this.shipGlow = img(this, 0, 0, 'p_glow').setDepth(39)
        .setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setScale(1.4);

      this.boss = {
        alive: false, x: 0, y: 0, vx: 0, vy: 0, r: 74, hp: 0, hpMax: 1,
        phase: 0, timer: 0, telegraph: 0, spin: 0, ramT: 0, hit: 0,
        spr: null, arms: [], podsLeft: 0, name: ''
      };
      this.boss.spr = img(this, -999, -999, 'hive_core').setDepth(36).setVisible(false);

      // Four arms is the ceiling in the tables; preallocate the segments.
      var a, k;
      for (a = 0; a < 4; a++) {
        var arm = {
          alive: false, ang: 0, len: 120, sweep: 0, detached: false,
          orbit: 0, x: 0, y: 0, attackT: 0, segs: [], pod: null
        };
        for (k = 0; k < 3; k++) {
          arm.segs.push(img(this, -999, -999, 'hive_arm').setDepth(35).setVisible(false));
        }
        arm.pod = {
          alive: false, x: 0, y: 0, hp: 0, hpMax: 1, hit: 0,
          spr: img(this, -999, -999, 'hive_pod').setDepth(37).setVisible(false)
        };
        this.boss.arms.push(arm);
      }
    },

    // ============================================================= layout
    layout: function () {
      var W = this.scale.width, H = this.scale.height;
      this.W = W; this.H = H;
      this.ins = I.safeInsets();
      this.uiScale = clamp(Math.min(W / 900, H / 480), 0.66, 1.3);
      this.sky.resize(W, H);
      this.layoutHud();
      Tap.refreshRect();
    },

    // ================================================================ run
    startRun: function (wave) {
      var s = this.sector;
      this.runSeed = s.seed >>> 0;
      this.ladder = !!this.startLadder;
      this.ladderSeed = this.ladder ? D.dailySeed() : 0;
      this.runSeed = this.ladder ? this.ladderSeed : (s.seed >>> 0);
      this.rng = mulberry32(this.runSeed);
      this.score = 0;
      this.ore = 0;
      this.salvageEarned = 0;
      this.salvageBanked = false;
      this.runTime = 0;
      this.musicTrack = '';
      this.poolDrops = { rocks: 0, hazards: 0, shotsPlayer: 0, shotsFx: 0,
        pickups: 0, pickupStacked: 0, poolEvicted: 0 };
      this.wave = 0;
      this.mode = 'play';
      this.result = null;
      this.pendingResults = 0;
      this.pendingUpgrade = 0;
      this.clearToast();

      // Run stat block. Every upgrade writes only into fields that already
      // exist here, so a stale saved id can never introduce NaN.
      this.st = {
        shield: 3, shieldMax: 3,
        rateMul: 1, dmgAdd: 0, heatCap: I.HEAT_CAP, coolMul: 1,
        thrustMul: 1, turnMul: 1, brakeMul: 1,
        dashMax: 2, dashCharge: 2, dashTimer: 0,
        iframeMul: 1, dashPowerMul: 1,
        magnetMul: 1, oreMul: 1, oreAdd: 0, overMul: 1,
        dropLifeMul: 1, shrapnel: 0, kinetic: false
      };
      var refits = I.PROFILE.refits || {};
      for (var ri = 0; ri < D.REFIT_ORDER.length; ri++) {
        var rid = D.REFIT_ORDER[ri];
        var level = clamp(refits[rid] || 0, 0, D.refit(rid).max);
        if (level) D.refit(rid).apply(this.st, level);
      }
      this.heat = 0;
      this.vent = 0;
      this.overcharge = 0;
      this.fireTimer = 0;
      this.beamT = 0;
      this.engineT = 0;
      this.critWarn = 0;
      this.critKlaxon = 0;
      this.takenUpgrades = [];

      this.weapons = I.unlockedWeapons();
      if (HB.forceWeapon && D.WEAPONS[HB.forceWeapon] &&
          this.weapons.indexOf(HB.forceWeapon) < 0) {
        this.weapons.push(HB.forceWeapon);
      }
      this.weapon = HB.forceWeapon && D.WEAPONS[HB.forceWeapon] ? HB.forceWeapon : 'pulse';

      this.ship.x = this.W ? this.W / 2 : 400;
      this.ship.y = this.H ? this.H / 2 : 240;
      this.ship.vx = this.ship.vy = 0;
      this.ship.ang = -Math.PI / 2;
      this.ship.invuln = 1.2;
      this.ship.dash = 0;
      this.ship.alive = true;

      this.killAll();

      // Tutorial: first run only, and only from wave 1 of sector 1.
      var wantTut = !I.PROFILE.tutorial && !HB.forceSkipTutorial &&
        this.sectorIndex === 0 && wave === 1;
      this.tut = wantTut ? {
        step: 0, t: 0, done: false, thrust: 0, turn: 0, fired: 0, dashed: 0, ore: 0
      } : null;
      HB.tutorialStep = this.tut ? 0 : -1;

      this.beginWave(wave);
      this.updateDebugState();
    },

    restartRun: function () {
      this.clearOverlay();
      this.startRun(1);
    },

    killAll: function () {
      var i;
      for (i = 0; i < this.rocks.length; i++) { this.rocks[i].alive = false; this.rocks[i].spr.setVisible(false); }
      for (i = 0; i < this.shots.length; i++) { this.shots[i].alive = false; this.shots[i].spr.setVisible(false); }
      for (i = 0; i < this.pickups.length; i++) { this.pickups[i].alive = false; this.pickups[i].spr.setVisible(false); }
      for (i = 0; i < this.hazards.length; i++) this.clearHazard(this.hazards[i]);
      for (i = 0; i < this.ghosts.length; i++) this.ghosts[i].setVisible(false);
      this.clearBoss();
    },

    clearHazard: function (h) {
      h.alive = false;
      if (h.spr) h.spr.setVisible(false);
      if (h.nodes) {
        for (var i = 0; i < h.nodes.length; i++) {
          if (h.nodes[i].spr) h.nodes[i].spr.destroy();
        }
        h.nodes = null;
      }
    },

    clearBoss: function () {
      this.boss.alive = false;
      this.boss.spr.setVisible(false);
      for (var a = 0; a < this.boss.arms.length; a++) {
        var arm = this.boss.arms[a];
        arm.alive = false;
        arm.x = arm.y = 0;
        arm.attackT = 0;
        arm.pod.alive = false;
        arm.pod.spr.setVisible(false);
        for (var k = 0; k < arm.segs.length; k++) arm.segs[k].setVisible(false);
      }
    },

    setMusicTrack: function (track) {
      if (this.musicTrack === track) return;
      this.musicTrack = track;
      kit.audio.music(track === 'boss' ? 'musicBoss' :
        (track === 'intensity' ? 'musicIntensity' : 'musicField'), 700);
    },

    updateMusicIntensity: function () {
      if (!this.spec || this.spec.kind === 'boss' || this.mode !== 'play') return;
      var danger = this.st.shield <= 1 || this.vent > 0 ||
        this.heat >= this.heatCap() * 0.84;
      this.setMusicTrack(danger ? 'intensity' : 'field');
    },

    // ============================================================== waves
    beginWave: function (w) {
      var s = this.sector;
      if (this.ladder) {
        this.ladderStage = Math.max(1, w | 0);
        this.sectorIndex = Math.floor((this.ladderStage - 1) / D.WAVES_PER_SECTOR) % D.SECTORS.length;
        this.sector = s = D.sectorAt(this.sectorIndex);
        this.family = D.family(s.family);
        this.spec = D.ladderSpec(s, this.ladderStage, this.ladderSeed);
        this.wave = this.ladderStage;
        this.waveIndex = this.spec.index;
        this.sky.setSector(s);
        // Daily fields are deterministic for the same UTC day and stage.
        this.waveRng = mulberry32((this.ladderSeed + Math.imul(this.ladderStage, 0x45d9f3b)) >>> 0);
      } else {
        this.wave = clamp(w, 1, D.WAVES_PER_SECTOR);
        this.waveIndex = this.wave;
        this.spec = D.waveSpec(s, this.wave);
        // seeded per (sector, wave): a forced wave reproduces the shipped field
        this.waveRng = mulberry32((s.seed + Math.imul(this.wave, 0x45d9f3b)) >>> 0);
      }
      this.waveTime = 0;
      this.waveClear = false;
      this.clearDelay = 0;
      this.survive = 0;
      this.spawnStream = 0;
      this.setpiece = null;

      var i;
      for (i = 0; i < this.shots.length; i++) { this.shots[i].alive = false; this.shots[i].spr.setVisible(false); }

      if (this.spec.kind === 'boss') {
        this.spawnBoss();
        this.setMusicTrack('boss');
        kit.audio.sfx('boss', { volume: 0.9 });
      } else {
        this.setMusicTrack('field');
      }
      for (i = 0; i < this.spec.rocks; i++) this.spawnRock('large', null, null, true);
      this.spawnHazards();
      if (this.spec.kind === 'setpiece') this.startSetpiece(this.spec.setpiece);

      this.clearSpawnBubble();
      // Every wave opens with a grace window. Waves 4 and 8 place authored
      // content, and the player gets a moment to read the small edge chip.
      this.ship.invuln = Math.max(this.ship.invuln, 1.8);

      this.queueToast(this.spec.kind === 'boss' ? 'BOSS' :
        (this.spec.kind === 'setpiece' ? 'SET PIECE' : 'WAVE ' + this.wave),
        this.spec.kind === 'boss' ? 0xff9060 :
          (this.spec.kind === 'setpiece' ? 0xffd76a : 0x6fe0ff));
      this.updateDebugState();
    },

    // Nothing dangerous may start the wave sitting on the ship. Anything
    // inside the bubble is pushed out along the ray away from the hull.
    clearSpawnBubble: function () {
      var ship = this.ship;
      var W = this.W || 800, H = this.H || 480;
      var R = 190;
      function push(e, extra) {
        var dx = wrapDelta(e.x, ship.x, W), dy = wrapDelta(e.y, ship.y, H);
        var d = Math.hypot(dx, dy);
        var want = R + (extra || 0);
        if (d >= want) return;
        if (d < 1) { dx = 1; dy = 0; d = 1; }
        e.x = ship.x + (dx / d) * want;
        e.y = ship.y + (dy / d) * want;
        if (e.x < 0) e.x += W; else if (e.x > W) e.x -= W;
        if (e.y < 0) e.y += H; else if (e.y > H) e.y -= H;
      }
      var i;
      for (i = 0; i < this.rocks.length; i++) {
        if (this.rocks[i].alive) push(this.rocks[i], this.rocks[i].r);
      }
      for (i = 0; i < this.hazards.length; i++) {
        var h = this.hazards[i];
        if (!h.alive) continue;
        push(h, h.r);
        if (h.type === 'geode') {
          for (var n = 0; n < h.nodes.length; n++) {
            h.nodes[n].x = h.x + Math.cos(h.nodes[n].ang) * (h.r + 26);
            h.nodes[n].y = h.y + Math.sin(h.nodes[n].ang) * (h.r + 26);
          }
        } else if (h.type === 'hulk' && h.nodes) {
          for (var hn = 0; hn < h.nodes.length; hn++) {
            h.nodes[hn].x = h.x + Math.cos(h.nodes[hn].ang) * h.nodes[hn].radius;
            h.nodes[hn].y = h.y + Math.sin(h.nodes[hn].ang) * h.nodes[hn].radius;
          }
        }
      }
      if (this.boss.alive) {
        var bdx = wrapDelta(this.boss.x, ship.x, W), bdy = wrapDelta(this.boss.y, ship.y, H);
        if (bdx * bdx + bdy * bdy < 260 * 260) {
          this.boss.x = W * 0.5;
          this.boss.y = H * 0.3;
          ship.y = H * 0.8;
        }
      }
    },

    // A clear spawn point: away from the ship, inside the field.
    spawnPoint: function (minDist) {
      var rng = this.waveRng, W = this.W || 800, H = this.H || 480;
      var x = 0, y = 0, tries = 0;
      minDist = minDist || 210;
      do {
        x = rngRange(rng, 30, W - 30);
        y = rngRange(rng, 30, H - 30);
        tries++;
      } while (tries < 40 &&
        wrapDelta(x, this.ship.x, W) * wrapDelta(x, this.ship.x, W) +
        wrapDelta(y, this.ship.y, H) * wrapDelta(y, this.ship.y, H) < minDist * minDist);
      return { x: x, y: y };
    },

    spawnRock: function (sizeKey, at, vel, safe, opts) {
      var priority = opts && opts.priority ? opts.priority : 1;
      var r = poolTake(this.rocks, priority, function (q) {
        return q.priority < priority;
      }, priority < 2 ? ROCK_RESERVE : 0);
      if (!r) { this.poolDrops.rocks++; return null; }
      if (r._poolEvicted) this.poolDrops.poolEvicted++;
      var sz = D.rockSize(sizeKey);
      var fam = this.family;
      var rng = this.waveRng;
      var p = at || this.spawnPoint(safe ? 230 : 40);
      var variants = sizeKey === 'large' ? fam.variantsL : (sizeKey === 'med' ? fam.variantsM : fam.variantsS);
      var v = Math.floor(rng() * variants);
      var key = 'rock_' + fam.id + '_' + sz.tex + v;

      r.alive = true;
      r.kind = 'rock';
      r.x = p.x; r.y = p.y;
      r.size = sizeKey;
      r.fam = fam.id;
      r.r = sz.r * (opts && opts.scale ? opts.scale : 1);
      r.hp = r.hpMax = Math.max(1, Math.round(sz.hp * fam.hpMul * (opts && opts.hpMul ? opts.hpMul : 1)));
      r.ore = Math.max(1, Math.round(sz.ore * fam.oreMul));
      r.score = sz.score;
      r.mass = r.r * r.r;
      r.rot = rngRange(rng, 0, TAU);
      r.spin = rngRange(rng, -sz.spin, sz.spin);
      r.hit = 0;
      r.comet = !!(opts && opts.comet);
      r.trailT = 0;
      r.born = this.waveTime;
      r.priority = priority;
      r.bornSeq = (this.spawnSeq = (this.spawnSeq || 0) + 1);
      if (vel) { r.vx = vel.x; r.vy = vel.y; }
      else {
        var a = rngRange(rng, 0, TAU);
        var sp = this.spec.speed * fam.speedMul * rngRange(rng, 0.65, 1.3);
        r.vx = Math.cos(a) * sp; r.vy = Math.sin(a) * sp;
      }
      r.texKey = key;
      setFrame(r.spr, this, key);
      r.spr.setVisible(true).setScale((r.r * 2) / Math.max(8, r.spr.width) * 1.14)
        .setTint(0xffffff).setAlpha(1).setDepth(r.size === 'large' ? 31 : 30);
      return r;
    },

    // The fracture chain: a large rock is never destroyed, it becomes
    // medium rock plus debris; medium becomes shards; a shard becomes dust.
    splitRock: function (r) {
      var sz = D.rockSize(r.size);
      if (!sz.next) return;
      var fam = D.family(r.fam);
      var n = r.size === 'large' ? fam.splitLarge : fam.splitMed;
      var base = Math.atan2(r.vy, r.vx);
      var speed = Math.hypot(r.vx, r.vy);
      var parentVx = r.vx, parentVy = r.vy;
      // Keep the inherited momentum on every child, then distribute a
      // symmetric kick. The result reads as a massive chunk breaking apart,
      // instead of independent pebbles appearing with unrelated velocities.
      var childMass = Math.max(1, D.rockSize(sz.next).r * D.rockSize(sz.next).r);
      var totalMass = childMass * n;
      for (var i = 0; i < n; i++) {
        var spread = (i - (n - 1) / 2) * (0.9 + this.waveRng() * 0.5);
        var a = base + spread;
        var kick = Math.max(48, speed * 0.42 + rngRange(this.waveRng, 30, 90));
        var child = this.spawnRock(sz.next,
          { x: r.x + Math.cos(a) * r.r * 0.5, y: r.y + Math.sin(a) * r.r * 0.5 },
          { x: parentVx + Math.cos(a) * kick, y: parentVy + Math.sin(a) * kick },
          false, { priority: 2 });
        if (child) {
          child.born = this.waveTime;
          child.mass = childMass * (fam.id === 'wreck' ? 1.15 : 1);
          // A tiny correction keeps the inherited component balanced across
          // uneven pool pressure without introducing a visible hitch.
          child.vx -= (parentVx * childMass / totalMass) * 0.08;
          child.vy -= (parentVy * childMass / totalMass) * 0.08;
        }
      }
    },

    spawnHazards: function () {
      var h = this.spec.hazards, k, n, i;
      for (k in h) {
        n = h[k];
        for (i = 0; i < n; i++) this.spawnHazard(k);
      }
    },

    spawnHazard: function (type, at, opts) {
      var e = poolTake(this.hazards, 1);
      if (!e) { this.poolDrops.hazards++; return null; }
      var rng = this.waveRng;
      var p = at || this.spawnPoint(type === 'well' ? 300 : 250);
      e.alive = true;
      e.type = type;
      e.x = p.x; e.y = p.y;
      e.vx = e.vy = 0;
      e.rot = rngRange(rng, 0, TAU);
      e.spin = 0;
      e.state = 'idle';
      e.timer = 0;
      e.hit = 0;
      e.fire = 0;
      e.pull = 0;
      e.nodes = null;
      var a, sp;
      if (type === 'mine') {
        e.r = 18; e.hp = e.hpMax = 2;
        a = rngRange(rng, 0, TAU); sp = rngRange(rng, 10, 34);
        e.vx = Math.cos(a) * sp; e.vy = Math.sin(a) * sp;
        setFrame(e.spr, this, 'mine').setScale(0.66);
      } else if (type === 'well') {
        e.r = 34; e.hp = e.hpMax = 1e9;
        e.pull = 190 + rng() * 90;
        setFrame(e.spr, this, 'well').setScale(1.5);
      } else if (type === 'hulk') {
        e.r = 62; e.hp = e.hpMax = 54;
        a = rngRange(rng, 0, TAU); sp = rngRange(rng, 8, 22);
        e.vx = Math.cos(a) * sp; e.vy = Math.sin(a) * sp;
        e.spin = rngRange(rng, -0.16, 0.16);
        e.weakOpen = false;
        e.nodes = [];
        for (var hn = 0; hn < 3; hn++) {
          e.nodes.push({ alive: true, ang: (hn / 3) * TAU, radius: 58,
            hp: 8, hpMax: 8, hit: 0,
            x: e.x, y: e.y,
            spr: img(this, -999, -999, 'geode_node').setDepth(37) });
        }
        setFrame(e.spr, this, 'hulk').setScale(0.9);
      } else if (type === 'drone') {
        e.r = 20; e.hp = e.hpMax = 7;
        setFrame(e.spr, this, 'drone').setScale(0.62);
      } else if (type === 'pirate') {
        e.r = 24; e.hp = e.hpMax = 12;
        a = rngRange(rng, 0, TAU); sp = rngRange(rng, 28, 48);
        e.vx = Math.cos(a) * sp; e.vy = Math.sin(a) * sp;
        e.spin = rngRange(rng, -0.8, 0.8); e.fire = rngRange(rng, 0.6, 1.4);
        setFrame(e.spr, this, 'drone').setScale(0.72);
      } else if (type === 'icefield') {
        e.r = 108; e.hp = e.hpMax = 1e9; e.pull = 0;
        setFrame(e.spr, this, 'well').setScale(2.25);
      } else if (type === 'storm') {
        e.r = 96; e.hp = e.hpMax = 1e9; e.pull = 150 + rng() * 80;
        setFrame(e.spr, this, 'well').setScale(2.05);
      } else if (type === 'geode') {
        e.r = 66; e.hp = e.hpMax = 1e9;
        setFrame(e.spr, this, 'geode').setScale(0.85);
        e.nodes = [];
        var nodeCount = (opts && opts.nodes) || 4;
        for (var i = 0; i < nodeCount; i++) {
          e.nodes.push({
            alive: true, ang: (i / nodeCount) * TAU, hp: 14, hpMax: 14, hit: 0,
            x: 0, y: 0,
            spr: img(this, -999, -999, 'geode_node').setDepth(37)
          });
        }
      } else {
        e.r = 18; e.hp = e.hpMax = 2;
        setFrame(e.spr, this, 'mine').setScale(0.6);
      }
      e.spr.setVisible(true).setTint(0xffffff).setAlpha(1);
      return e;
    },

    // ========================================================== setpieces
    startSetpiece: function (id) {
      var W = this.W || 800, H = this.H || 480;
      var rng = this.waveRng;
      var i, a, sp;
      this.setpiece = { id: id || 'cascade', done: false, t: 0 };
      if (id === 'cascade') {
        // a wall of large rock crossing the belt on one axis
        var fromLeft = rng() > 0.5;
        for (i = 0; i < 6; i++) {
          this.spawnRock('large',
            { x: fromLeft ? -60 - i * 40 : W + 60 + i * 40, y: (i + 0.5) / 6 * H },
            { x: (fromLeft ? 1 : -1) * (110 + rng() * 40), y: rngRange(rng, -28, 28) },
            false, { hpMul: 1.15 });
        }
      } else if (id === 'comets') {
        for (i = 0; i < 3; i++) {
          a = rngRange(rng, 0, TAU);
          sp = 250 + rng() * 60;
          this.spawnRock('large',
            { x: W / 2 - Math.cos(a) * W * 0.7, y: H / 2 - Math.sin(a) * H * 0.7 },
            { x: Math.cos(a) * sp, y: Math.sin(a) * sp },
            false, { comet: true, hpMul: 1.4 });
        }
      } else if (id === 'convoy') {
        for (i = 0; i < 3; i++) {
          var hk = this.spawnHazard('hulk', { x: -120 - i * 210, y: H * (0.3 + i * 0.2) });
          if (hk) { hk.vx = 60; hk.vy = rngRange(rng, -8, 8); }
          this.spawnHazard('mine', { x: -60 - i * 210, y: H * (0.3 + i * 0.2) - 70 });
          this.spawnHazard('mine', { x: -60 - i * 210, y: H * (0.3 + i * 0.2) + 70 });
        }
      } else if (id === 'bloom') {
        this.spawnHazard('geode', { x: W / 2, y: H * 0.36 }, { nodes: 4 });
      } else if (id === 'grinder') {
        this.spawnHazard('well', { x: W * 0.28, y: H * 0.4 });
        this.spawnHazard('well', { x: W * 0.72, y: H * 0.62 });
        this.survive = 34;
      }
    },

    // =============================================================== boss
    spawnBoss: function () {
      var b = this.boss, cfg = this.sector.boss, W = this.W || 800, H = this.H || 480;
      b.alive = true;
      b.x = W / 2; b.y = H * 0.42;
      b.vx = 26; b.vy = 18;
      b.hp = b.hpMax = cfg.hp;
      b.phase = 1;
      b.timer = 2.4;
      b.telegraph = 0;
      b.spin = 0.42;
      b.ramT = 0;
      b.hit = 0;
      b.name = cfg.name;
      b.r = 74;
      b.spr.setVisible(true).setTint(this.family.tint).setScale(0.98).setAlpha(1);
      var podsTotal = 0;
      for (var a = 0; a < b.arms.length; a++) {
        var arm = b.arms[a];
        arm.alive = a < cfg.arms;
        arm.ang = (a / Math.max(1, cfg.arms)) * TAU;
        arm.len = 128;
        arm.sweep = 0;
        arm.detached = false;
        arm.orbit = 0;
        arm.x = b.x; arm.y = b.y; arm.attackT = 0;
        arm.pod.alive = arm.alive;
        arm.pod.hp = arm.pod.hpMax = Math.round(cfg.hp * 0.09) + 18;
        arm.pod.hit = 0;
        arm.pod.spr.setVisible(arm.alive).setTint(this.family.tint);
        for (var k = 0; k < arm.segs.length; k++) arm.segs[k].setVisible(arm.alive)
          .setTint(this.family.tint);
        if (arm.alive) podsTotal++;
      }
      b.podsLeft = podsTotal;
    },

    // ============================================================ weapons
    currentWeapon: function () { return D.weapon(this.weapon); },

    cycleWeapon: function (dir) {
      if (!this.weapons.length) return;
      var i = this.weapons.indexOf(this.weapon);
      if (i < 0) i = 0;
      i = (i + (dir || 1) + this.weapons.length) % this.weapons.length;
      this.weapon = this.weapons[i];
      kit.audio.sfx('ui', { volume: 0.7 });
    },
    selectWeapon: function (id) {
      if (this.weapons.indexOf(id) >= 0 && this.weapon !== id) {
        this.weapon = id;
        kit.audio.sfx('ui', { volume: 0.7 });
      }
    },

    heatCap: function () { return this.st.heatCap; },

    fireShot: function (w) {
      var ship = this.ship;
      var count = w.count || 1;
      var spread = (w.spreadDeg || 0) * Math.PI / 180;
      var dmg = (w.dmg || 1) + this.st.dmgAdd;
      for (var i = 0; i < count; i++) {
        var s = poolTake(this.shots, 2, function (q) { return q.priority < 2; });
        if (!s) { this.poolDrops.shotsPlayer++; break; }
        var off = count === 1 ? 0 : (i / (count - 1) - 0.5) * spread;
        var a = ship.ang + off;
        var sp = w.speed;
        s.alive = true;
        s.x = ship.x + Math.cos(ship.ang) * 22;
        s.y = ship.y + Math.sin(ship.ang) * 22;
        s.vx = ship.vx * 0.35 + Math.cos(a) * sp;
        s.vy = ship.vy * 0.35 + Math.sin(a) * sp;
        s.life = w.life;
        s.dmg = dmg;
        s.r = w.r;
        s.homing = w.homing || 0;
        s.hostile = false;
        s.pierce = 0;
        s.ang = a;
        s.tint = w.tint;
        s.priority = 2;
        s.bornSeq = (this.shotSeq = (this.shotSeq || 0) + 1);
        setFrame(s.spr, this, w.tex).setVisible(true).setTint(w.tint)
          .setRotation(a).setScale(1).setAlpha(1);
      }
      this.muzzle(ship.x + Math.cos(ship.ang) * 24, ship.y + Math.sin(ship.ang) * 24, w.tint);
      kit.audio.sfx(w.sfx, { volume: 0.5, rate: 0.94 + Math.random() * 0.12 });
    },

    spawnEnemyShot: function (x, y, angle, speed, dmg, tint) {
      var s = poolTake(this.shots, 1, function (q) { return q.hostile; });
      if (!s) { this.poolDrops.shotsFx++; return null; }
      s.alive = true; s.hostile = true;
      s.x = x; s.y = y; s.vx = Math.cos(angle) * speed; s.vy = Math.sin(angle) * speed;
      s.life = 2.7; s.dmg = dmg || 1; s.r = 7; s.homing = 0; s.ang = angle;
      s.tint = tint || 0xff7188; s.priority = 1;
      s.bornSeq = (this.shotSeq = (this.shotSeq || 0) + 1);
      setFrame(s.spr, this, 'shot_homing').setVisible(true).setTint(s.tint)
        .setRotation(angle).setScale(0.76).setAlpha(0.95);
      kit.audio.sfx('homing', { volume: 0.28, rate: 1.25 });
      return s;
    },

    // ============================================================== input
    readInput: function () {
      var c = this.control;
      var W = this.W || 800;
      var tap = Tap.update();
      var i, p;
      this.layoutChips();

      for (i = 0; i < tap.pressed.length; i++) {
        p = tap.pressed[i];
        if (this.mode !== 'play') { p.claim = 'ui'; continue; }
        if (I.inCircle(p, this.hudBtn.pause)) { p.claim = 'pause'; continue; }
        var wi = this.weaponChipAt(p);
        if (wi >= 0) { p.claim = 'weap'; p.weapIndex = wi; continue; }
        if (I.inCircle(p, this.hudBtn.dash)) {
          p.claim = 'dash';
          this.tryDash();
          continue;
        }
        if (p.x > W * 0.5) { p.claim = 'fire'; continue; }
        if (c.stickId == null) {
          p.claim = 'stick';
          c.stickId = p.id; c.ox = p.x; c.oy = p.y; c.x = 0; c.y = 0; c.mag = 0; c.active = true;
        } else { p.claim = 'fire'; }
      }

      // live state
      c.firing = false;
      var stickAlive = false;
      tap.live.forEach(function (rec) {
        if (rec.claim === 'fire') c.firing = true;
        if (rec.claim === 'stick' && rec.id === c.stickId) {
          stickAlive = true;
          var dx = rec.x - c.ox, dy = rec.y - c.oy;
          var d = Math.hypot(dx, dy);
          var R = 82;
          if (d > R) {
            // drag the origin so a long swipe never pins the stick
            c.ox += dx * (1 - R / d); c.oy += dy * (1 - R / d);
            dx *= R / d; dy *= R / d; d = R;
          }
          c.x = dx / R; c.y = dy / R; c.mag = clamp(d / R, 0, 1);
        }
      });
      if (!stickAlive) { c.stickId = null; c.active = false; c.x = c.y = c.mag = 0; }

      for (i = 0; i < tap.released.length; i++) {
        p = tap.released[i];
        if (p.claim === 'pause' && I.inCircle(p, this.hudBtn.pause)) this.togglePause();
        else if (p.claim === 'weap' && this.weaponChipAt(p) === p.weapIndex) {
          this.selectWeapon(this.weapons[p.weapIndex]);
        }
      }

      // keyboard
      var kx = 0, ky = 0, rotate = 0, thrustKey = false, retroKey = false;
      var pad = kit.input.gamepad ? kit.input.gamepad() : null;
      var pb = pad ? pad.buttons : [];
      var pax = pad ? pad.axes[0] : 0, pay = pad ? pad.axes[1] : 0;
      var pmag = Math.hypot(pax, pay);
      if (kit.input.keyDown('KeyA') || kit.input.keyDown('ArrowLeft')) rotate -= 1;
      if (kit.input.keyDown('KeyD') || kit.input.keyDown('ArrowRight')) rotate += 1;
      if (kit.input.keyDown('KeyW') || kit.input.keyDown('ArrowUp')) thrustKey = true;
      if (kit.input.keyDown('KeyS') || kit.input.keyDown('ArrowDown')) retroKey = true;
      if (kit.input.keyDown('Space') || pb[0] || pb[4]) c.firing = true;

      this.edge('ShiftLeft', 'dash'); this.edge('ShiftRight', 'dash2');
      if (this.edgeFired.dash || this.edgeFired.dash2) this.tryDash();
      this.edge('Digit1', 'w1'); this.edge('Digit2', 'w2');
      this.edge('Digit3', 'w3'); this.edge('Digit4', 'w4');
      for (i = 1; i <= 4; i++) {
        if (this.edgeFired['w' + i] && this.weapons[i - 1]) this.selectWeapon(this.weapons[i - 1]);
      }
      this.edge('KeyQ', 'wprev'); this.edge('KeyE', 'wnext');
      if (this.edgeFired.wprev) this.cycleWeapon(-1);
      if (this.edgeFired.wnext) this.cycleWeapon(1);
      if (this.padEdge('prev', !!pb[6])) this.cycleWeapon(-1);
      if (this.padEdge('next', !!pb[7])) this.cycleWeapon(1);
      this.edge('Escape', 'pause'); this.edge('KeyP', 'pause2');
      if (this.padEdge('dash', !!pb[1])) this.tryDash(pax, pay);
      if (this.padEdge('pausePad', !!pb[5])) this.togglePause();
      if (this.edgeFired.pause || this.edgeFired.pause2) this.togglePause();

      return {
        rotate: rotate, thrustKey: thrustKey, retroKey: retroKey,
        stick: c.active || pmag > 0.12,
        sx: c.active ? c.x : pax, sy: c.active ? c.y : pay,
        smag: c.active ? c.mag : clamp(pmag, 0, 1), firing: c.firing
      };
    },

    // one-shot keyboard edges; the map lives on the scene, not on a shared
    // record, so two keys can never share a latch
    edge: function (code, name) {
      if (!this.edgeFired) this.edgeFired = {};
      var down = kit.input.keyDown(code);
      var was = !!this.keyEdge[name + ':' + code];
      this.edgeFired[name] = down && !was;
      this.keyEdge[name + ':' + code] = down;
      if (this.edgeFired[name]) this.edgeFired[name] = true;
      return this.edgeFired[name];
    },

    padEdge: function (name, down) {
      if (!this.padEdges) this.padEdges = {};
      var was = !!this.padEdges[name];
      this.padEdges[name] = !!down;
      return !!down && !was;
    },

    tryDash: function (gamepadX, gamepadY) {
      if (this.mode !== 'play' || !this.ship.alive) return;
      var st = this.st;
      if (st.dashCharge < 1 || this.ship.dash > 0) return;
      st.dashCharge -= 1;
      var ship = this.ship;
      var dx = Math.cos(ship.ang), dy = Math.sin(ship.ang);
      if (gamepadX != null && Math.hypot(gamepadX, gamepadY) > 0.25) {
        var gd = Math.hypot(gamepadX, gamepadY);
        dx = gamepadX / gd; dy = gamepadY / gd;
      } else if (this.control.mag > 0.25) {
        var d = Math.hypot(this.control.x, this.control.y) || 1;
        dx = this.control.x / d; dy = this.control.y / d;
      }
      var sp = SHIP.dashSpeed * st.dashPowerMul;
      ship.vx = dx * sp; ship.vy = dy * sp;
      ship.dash = SHIP.dashTime;
      ship.dashDir = Math.atan2(dy, dx);
      ship.invuln = Math.max(ship.invuln, SHIP.dashIFrame * st.iframeMul);
      I.shake(7, 160);
      kit.audio.sfx('dash', { volume: 0.75 });
      this.dashBurst(ship.x, ship.y);
      if (this.tut) this.tut.dashed++;
    },

    togglePause: function () {
      // kit.openSettings owns the pause reason and releases it on close, so
      // the scene never holds a second reason that could strand the sim.
      if (!kit.paused) I.openSettings();
    },
    onKitPause: function () { this.paused = true; this.acc = 0; this.padEdges = {}; Tap.clear(); this.control.stickId = null; this.control.active = false; this.control.mag = 0; },
    onKitResume: function () { this.paused = false; this.acc = 0; this.padEdges = {}; Tap.clear(); },

    // =============================================================== step
    step: function (dt) {
      this.runTime += dt;
      this.waveTime += dt;
      var input = this.inputCache;
      this.stepShip(dt, input);
      this.stepWeapon(dt, input);
      this.stepShots(dt);
      this.stepRocks(dt);
      this.stepHazards(dt);
      this.stepBoss(dt);
      this.stepPickups(dt);
      this.collide(dt);
      this.stepWaveFlow(dt);
      this.stepTutorial(dt);
      this.updateMusicIntensity();
    },

    stepShip: function (dt, inp) {
      var ship = this.ship, st = this.st;
      ship.invuln = Math.max(0, ship.invuln - dt);
      ship.dash = Math.max(0, ship.dash - dt);
      ship.hitFlash = Math.max(0, ship.hitFlash - dt * 2.4);
      this.critWarn = Math.max(0, this.critWarn - dt);

      // dash charge regeneration
      if (st.dashCharge < st.dashMax) {
        st.dashTimer += dt;
        if (st.dashTimer >= SHIP.dashRecharge) { st.dashTimer = 0; st.dashCharge += 1; }
      } else st.dashTimer = 0;

      var thrust = 0, retro = 0;
      var turn = SHIP.turn * st.turnMul;
      var fieldIce = this.fieldInfluence(ship, dt);
      if (fieldIce) turn *= 0.58;
      if (inp.stick && inp.smag > 0.06) {
        var target = Math.atan2(inp.sy, inp.sx);
        var delta = angDiff(ship.ang, target);
        ship.ang += clamp(delta, -turn * dt, turn * dt);
        // counter-thrust: pushing against travel brakes hard and lights the
        // retro jets, which is the whole readability of the drift model
        var speed = Math.hypot(ship.vx, ship.vy);
        var opposing = 0;
        if (speed > 30) {
          var vAng = Math.atan2(ship.vy, ship.vx);
          opposing = clamp(-Math.cos(target - vAng), 0, 1);
        }
        thrust = inp.smag;
        retro = opposing * inp.smag;
      } else {
        if (inp.rotate) ship.ang += inp.rotate * turn * 0.8 * dt;
        if (inp.thrustKey) thrust = 1;
        if (inp.retroKey) retro = 1;
      }

      if (thrust > 0.02 && ship.dash <= 0) {
        var acc = SHIP.thrust * st.thrustMul * thrust;
        ship.vx += Math.cos(ship.ang) * acc * dt;
        ship.vy += Math.sin(ship.ang) * acc * dt;
      }
      if (retro > 0.05) {
        // brake along the velocity vector rather than the nose, so the
        // ship kills drift instead of spinning around it
        var sp2 = Math.hypot(ship.vx, ship.vy);
        if (sp2 > 8) {
          var b = SHIP.retro * st.brakeMul * retro * dt;
          var k = Math.max(0, 1 - b / sp2);
          ship.vx *= k; ship.vy *= k;
        }
      }
      ship.thrusting = thrust;
      ship.retro = retro;

      // gravity wells act on the ship
      this.applyWells(ship, dt, 1);

      var baseDrag = this.sector.drag != null ? this.sector.drag : SHIP.drag;
      // Ice fields make the ship skate: drift persists, but steering loses
      // authority. Magnetic storms add a readable lateral pull and heat.
      var drag = Math.pow(1 - clamp(fieldIce ? baseDrag * 0.28 : baseDrag, 0, 0.99), dt);
      ship.vx *= drag; ship.vy *= drag;
      var maxSp = ship.dash > 0 ? SHIP.dashSpeed * st.dashPowerMul : SHIP.maxSpeed * (0.85 + 0.35 * st.thrustMul);
      var spd = Math.hypot(ship.vx, ship.vy);
      if (spd > maxSp) { ship.vx = ship.vx / spd * maxSp; ship.vy = ship.vy / spd * maxSp; }
      ship.x += ship.vx * dt; ship.y += ship.vy * dt;
      this.wrap(ship, ship.r);

      // engine hum, driven through the kit audio bus at loop length
      this.engineT -= dt;
      var throttle = clamp(Math.max(thrust, ship.dash > 0 ? 1 : 0), 0, 1);
      if (throttle > 0.08) {
        if (this.engineT <= 0) {
          var rate = 0.86 + throttle * 0.4;
          kit.audio.sfx('engine', { volume: 0.10 + throttle * 0.2, rate: rate });
          this.engineT = 1.95 / rate;
        }
      } else this.engineT = Math.min(this.engineT, 0.05);

      if (this.tut) {
        if (thrust > 0.3) this.tut.thrust += dt;
        if (Math.abs(inp.rotate) > 0 || (inp.stick && inp.smag > 0.3)) this.tut.turn += dt;
      }
    },

    stepWeapon: function (dt, inp) {
      var w = this.currentWeapon();
      var st = this.st;
      this.overcharge = Math.max(0, this.overcharge - dt);
      var over = this.overcharge > 0;

      if (this.vent > 0) {
        this.vent = Math.max(0, this.vent - dt);
        this.heat = Math.max(0, this.heat - this.heatCap() / I.VENT_LOCK * dt);
        this.beamT = 0;
        return;
      }

      var wantFire = inp.firing && this.ship.alive && this.mode === 'play';
      var cap = this.heatCap();

      if (w.kind === 'beam') {
        if (wantFire) {
          this.beamT += dt;
          if (!over) this.heat += w.heatRate * dt;
          this.beamDamage(dt, w);
          if (this.beamSfxT == null) this.beamSfxT = 0;
          this.beamSfxT -= dt;
          if (this.beamSfxT <= 0) { kit.audio.sfx('laser', { volume: 0.4 }); this.beamSfxT = 0.36; }
          if (this.tut) this.tut.fired += dt;
        } else {
          this.beamT = 0;
          this.heat = Math.max(0, this.heat - I.HEAT_COOL * st.coolMul * dt);
        }
      } else {
        this.fireTimer -= dt;
        if (wantFire && this.fireTimer <= 0) {
          this.fireTimer = 1 / (w.rate * st.rateMul * (over ? 1.4 : 1));
          this.fireShot(w);
          if (!over) this.heat += w.heat;
          if (this.tut) this.tut.fired += 1;
        }
        var coolRate = wantFire ? I.HEAT_COOL_FIRING : I.HEAT_COOL;
        this.heat = Math.max(0, this.heat - coolRate * st.coolMul * dt);
      }

      if (this.heat >= cap && !over) {
        this.heat = cap;
        this.vent = I.VENT_LOCK;
        kit.audio.sfx('overheat', { volume: 0.7 });
        this.ventBurst();
      }
    },

    stepShots: function (dt) {
      var i, j, s;
      for (i = 0; i < this.shots.length; i++) {
        s = this.shots[i];
        if (!s.alive) continue;
        if (s.hostile) {
          s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
          this.wrap(s, 8);
          if (s.life <= 0) { s.alive = false; s.spr.setVisible(false); }
          continue;
        }
        if (s.homing) {
          var best = null, bd = 1e9;
          var sw = this.W || 800, sh = this.H || 480;
          for (j = 0; j < this.rocks.length; j++) {
            var r = this.rocks[j];
            if (!r.alive) continue;
            var dx = wrapDelta(r.x, s.x, sw), dy = wrapDelta(r.y, s.y, sh);
            var d2 = dx * dx + dy * dy;
            if (d2 < bd) { bd = d2; best = r; }
          }
          if (!best && this.boss.alive) best = this.boss;
          if (best) {
            var tx = wrapDelta(best.x, s.x, sw), ty = wrapDelta(best.y, s.y, sh);
            var ta = Math.atan2(ty, tx);
            var ca = Math.atan2(s.vy, s.vx);
            var na = ca + clamp(angDiff(ca, ta), -s.homing * Math.PI / 180 * dt * 60,
              s.homing * Math.PI / 180 * dt * 60);
            var sp = Math.hypot(s.vx, s.vy);
            s.vx = Math.cos(na) * sp; s.vy = Math.sin(na) * sp;
            s.ang = na;
          }
        }
        s.x += s.vx * dt; s.y += s.vy * dt;
        s.life -= dt;
        this.wrap(s, 6);
        if (s.life <= 0) { s.alive = false; s.spr.setVisible(false); }
      }
    },

    stepRocks: function (dt) {
      var i, r;
      var W = this.W || 800, H = this.H || 480;
      for (i = 0; i < this.rocks.length; i++) {
        r = this.rocks[i];
        if (!r.alive) continue;
        this.applyWells(r, dt, 0.7);
        r.x += r.vx * dt; r.y += r.vy * dt;
        r.rot += r.spin * dt;
        r.hit = Math.max(0, r.hit - dt * 4);
        if (r.comet) {
          // comets leave the field once they cross; they are a timed threat
          if (r.x < -160 || r.x > W + 160 || r.y < -160 || r.y > H + 160) {
            r.alive = false; r.spr.setVisible(false);
            continue;
          }
          r.trailT += dt;
          if (r.trailT > 0.03) { r.trailT = 0; this.cometTrail(r); }
        } else {
          this.wrap(r, r.r);
        }
      }
      // rock on rock, every other step: enough to sell the belt, half cost
      this.rockPairT = (this.rockPairT || 0) + dt;
      if (this.rockPairT >= STEP * 2) {
        this.rockPairT = 0;
        this.rockCollisions();
      }
    },

    rockCollisions: function () {
      var list = [];
      var i, j;
      for (i = 0; i < this.rocks.length; i++) if (this.rocks[i].alive && !this.rocks[i].comet) list.push(this.rocks[i]);
      for (i = 0; i < list.length; i++) {
        var a = list[i];
        for (j = i + 1; j < list.length; j++) {
          var b = list[j];
          var dx = wrapDelta(b.x, a.x, this.W || 800);
          var dy = wrapDelta(b.y, a.y, this.H || 480);
          var rr = a.r + b.r;
          var d2 = dx * dx + dy * dy;
          if (d2 >= rr * rr || d2 < 1e-4) continue;
          var d = Math.sqrt(d2);
          var nx = dx / d, ny = dy / d;
          var overlap = rr - d;
          var ma = a.mass, mb = b.mass, tm = ma + mb;
          a.x -= nx * overlap * (mb / tm); a.y -= ny * overlap * (mb / tm);
          b.x += nx * overlap * (ma / tm); b.y += ny * overlap * (ma / tm);
          this.wrap(a, a.r); this.wrap(b, b.r);
          var rvx = b.vx - a.vx, rvy = b.vy - a.vy;
          var vn = rvx * nx + rvy * ny;
          if (vn > 0) continue;
          var imp = -1.7 * vn / (1 / ma + 1 / mb);
          a.vx -= imp * nx / ma; a.vy -= imp * ny / ma;
          b.vx += imp * nx / mb; b.vy += imp * ny / mb;
          if (-vn > 90) {
            a.hit = Math.max(a.hit, 0.16); b.hit = Math.max(b.hit, 0.16);
            this.dustPuff((a.x + b.x) / 2, (a.y + b.y) / 2, D.family(a.fam).dust, 4);
          }
        }
      }
    },

    applyWells: function (e, dt, scale) {
      for (var i = 0; i < this.hazards.length; i++) {
        var h = this.hazards[i];
        if (!h.alive || h.type !== 'well') continue;
        var dx = wrapDelta(h.x, e.x, this.W || 800);
        var dy = wrapDelta(h.y, e.y, this.H || 480);
        var d2 = dx * dx + dy * dy;
        var R = 230;
        if (d2 > R * R || d2 < 4) continue;
        var d = Math.sqrt(d2);
        var f = h.pull * (1 - d / R) * scale;
        e.vx += (dx / d) * f * dt;
        e.vy += (dy / d) * f * dt;
      }
    },

    fieldInfluence: function (e, dt) {
      var ice = false;
      var W = this.W || 800, H = this.H || 480;
      for (var i = 0; i < this.hazards.length; i++) {
        var h = this.hazards[i];
        if (!h.alive || (h.type !== 'icefield' && h.type !== 'storm')) continue;
        var dx = wrapDelta(h.x, e.x, W), dy = wrapDelta(h.y, e.y, H);
        var d = Math.hypot(dx, dy);
        if (d > h.r) continue;
        var falloff = 1 - d / h.r;
        if (h.type === 'icefield') {
          ice = true;
          e.vx += (dx / Math.max(1, d)) * 12 * falloff * dt;
          e.vy += (dy / Math.max(1, d)) * 12 * falloff * dt;
          if (this.runTime % 0.24 < dt) this.iceSparkle(e.x, e.y);
        } else {
          // Rotate the velocity around the storm core. This is deliberately
          // force-based, so the player can brake out instead of being snapped.
          e.vx += (-dy / Math.max(1, d)) * h.pull * falloff * dt;
          e.vy += (dx / Math.max(1, d)) * h.pull * falloff * dt;
          this.heat = Math.min(this.heatCap(), this.heat + 5 * falloff * dt);
          if (this.runTime % 0.18 < dt) this.stormArc(h);
        }
      }
      return ice;
    },

    wrap: function (e, margin) {
      var W = this.W || 800, H = this.H || 480;
      var m = margin || 0;
      if (e.x < -m) e.x += W + m * 2;
      else if (e.x > W + m) e.x -= W + m * 2;
      if (e.y < -m) e.y += H + m * 2;
      else if (e.y > H + m) e.y -= H + m * 2;
    },

    // ============================================================ pickups
    dropFrom: function (x, y, sizeKey, oreAmount) {
      var rng = this.waveRng;
      this.spawnPickup('ore', x, y, oreAmount);
      var table = D.dropsFor(sizeKey);
      var boost = HB.forceGenerousDrops ? 2.2 : 1;
      for (var i = 0; i < table.length; i++) {
        var id = table[i][0], chance = table[i][1] * boost;
        if (id === 'weapon' && this.weapons.length >= D.WEAPON_ORDER.length) continue;
        if (rng() < chance) {
          this.spawnPickup(id, x + rngRange(rng, -14, 14), y + rngRange(rng, -14, 14), 1);
        }
      }
    },

    spawnPickup: function (kind, x, y, amount) {
      var def = D.pickup(kind);
      var rng = this.waveRng;
      var priority = pickupPriority(def.id);
      var p = poolTake(this.pickups, priority, function (q) {
        return pickupPriority(q.kind) < priority;
      }, priority < 2 ? PICKUP_RESERVE : 0);
      if (!p) {
        var nearest = null, nearestD = 1e9;
        for (var si = 0; si < this.pickups.length; si++) {
          var same = this.pickups[si];
          if (!same.alive || same.kind !== def.id) continue;
          var sx = wrapDelta(same.x, x, this.W || 800);
          var sy = wrapDelta(same.y, y, this.H || 480);
          var sd = sx * sx + sy * sy;
          if (sd < nearestD) { nearestD = sd; nearest = same; }
        }
        if (nearest && nearestD <= 52 * 52) {
          nearest.amount += amount || 1;
          nearest.life = Math.max(nearest.life, I.DROP_LIFE * this.st.dropLifeMul);
          this.poolDrops.pickupStacked++;
          return nearest;
        }
        this.poolDrops.pickups++;
        // Capacity pressure must never erase a guaranteed reward. Resolve it
        // immediately through the same collection path used by a live disc.
        this.collectPickup({ kind: def.id, amount: amount || 1, x: x, y: y, spr: null });
        return null;
      }
      if (p._poolEvicted) this.poolDrops.poolEvicted++;
      p.alive = true;
      p.kind = def.id;
      p.x = x; p.y = y;
      var a = rngRange(rng, 0, TAU), sp = rngRange(rng, 16, 62);
      p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
      p.life = I.DROP_LIFE * this.st.dropLifeMul;
      p.amount = amount || 1;
      p.pull = 0;
      p.bob = rngRange(rng, 0, TAU);
      p.spark = 0;
      p.priority = priority;
      p.bornSeq = (this.pickupSeq = (this.pickupSeq || 0) + 1);
      setFrame(p.spr, this, def.tex).setVisible(true).setTint(def.tint)
        .setScale(def.id === 'burst' ? 0.62 : 0.5).setAlpha(1);
      return p;
    },

    stepPickups: function (dt) {
      var ship = this.ship;
      var magnet = I.MAGNET_R * this.st.magnetMul;
      for (var i = 0; i < this.pickups.length; i++) {
        var p = this.pickups[i];
        if (!p.alive) continue;
        p.life -= dt;
        p.bob += dt * 3.4;
        var dx = wrapDelta(ship.x, p.x, this.W || 800);
        var dy = wrapDelta(ship.y, p.y, this.H || 480);
        var d = Math.hypot(dx, dy);
        if (d < magnet && d > 1) {
          var f = (1 - d / magnet);
          p.vx += (dx / d) * 900 * f * dt;
          p.vy += (dy / d) * 900 * f * dt;
          p.pull = f;
          p.spark += dt;
          if (p.spark > 0.11) { p.spark = 0; this.oreSparkle(p); }
        } else p.pull = 0;
        p.vx *= Math.pow(0.28, dt); p.vy *= Math.pow(0.28, dt);
        p.x += p.vx * dt; p.y += p.vy * dt;
        this.wrap(p, 10);
        if (p.life <= 0) { p.alive = false; p.spr.setVisible(false); }
      }
    },

    collectPickup: function (p) {
      var st = this.st;
      var def = D.pickup(p.kind);
      p.alive = false;
      if (p.spr) p.spr.setVisible(false);
      var label = def.label;
      if (p.kind === 'ore' || p.kind === 'burst') {
        var n = Math.max(1, Math.round((p.amount + st.oreAdd) * st.oreMul *
          (p.kind === 'burst' ? 5 : 1)));
        this.ore += n;
        this.score += n * 6;
        label = '+' + n + ' ORE';
        if (this.tut) this.tut.ore += 1;
      } else if (p.kind === 'shield') {
        if (st.shield < st.shieldMax) { st.shield += 1; label = 'SHIELD +1'; }
        else { this.ore += 12; label = 'ORE +12'; }
      } else if (p.kind === 'over') {
        this.overcharge = Math.max(this.overcharge, I.OVERCHARGE_TIME * st.overMul);
        this.heat = 0;
        this.vent = 0;
        label = 'OVERCHARGE';
      } else if (p.kind === 'dash') {
        if (st.dashCharge < st.dashMax) st.dashCharge += 1;
        else { st.dashMax += 1; st.dashCharge = st.dashMax; label = 'DASH MAX +1'; }
      } else if (p.kind === 'weapon') {
        var missing = [];
        for (var i = 0; i < D.WEAPON_ORDER.length; i++) {
          if (this.weapons.indexOf(D.WEAPON_ORDER[i]) < 0) missing.push(D.WEAPON_ORDER[i]);
        }
        if (missing.length) {
          var got = rngPick(this.waveRng, missing);
          this.weapons.push(got);
          this.weapon = got;
          label = 'WEAPON ' + D.weapon(got).short;
        } else { this.overcharge = Math.max(this.overcharge, 4); label = 'OVERCHARGE'; }
      }
      kit.audio.sfx(def.sfx, { volume: 0.55, rate: 0.95 + Math.random() * 0.1 });
      this.popText(p.x, p.y, label, def.tint);
      this.pickupBurst(p.x, p.y, def.tint, p.kind !== 'ore');
    },

    // ============================================================ damage
    hurt: function (amount, sourceX, sourceY, knock) {
      var ship = this.ship, st = this.st;
      if (ship.invuln > 0 || !ship.alive || this.mode !== 'play') return;
      if (HB.forceInvincible) return;
      st.shield -= amount;
      ship.hitFlash = 1;
      var dx = wrapDelta(ship.x, sourceX != null ? sourceX : ship.x, this.W || 800);
      var dy = wrapDelta(ship.y, sourceY != null ? sourceY : ship.y, this.H || 480);
      var d = Math.hypot(dx, dy) || 1;
      var k = knock || 200;
      ship.vx = ship.vx * 0.25 + (dx / d) * k;
      ship.vy = ship.vy * 0.25 + (dy / d) * k;
      this.shieldBurst(ship.x, ship.y);
      I.shake(14, 260);
      I.hitStop(90);
      kit.audio.sfx('shield', { volume: 0.85 });

      if (st.shield <= 0) {
        st.shield = 0;
        this.gameOver();
        return;
      }
      // The last cell gets a longer grace window plus a klaxon, so the run
      // never ends on a hit the player had no chance to read.
      if (st.shield === 1) {
        ship.invuln = SHIP.criticalIFrame * st.iframeMul;
        this.critWarn = 3.4;
        kit.audio.sfx('critical', { volume: 0.8 });
        this.queueToast('HULL CRITICAL', 0xff6a72, 1.0);
      } else {
        ship.invuln = SHIP.hitIFrame * st.iframeMul;
      }
    },

    damageRock: function (r, dmg, fx, fy) {
      r.hp -= dmg;
      r.hit = 0.2;
      if (r.hp > 0) {
        this.chipSpark(fx != null ? fx : r.x, fy != null ? fy : r.y, D.family(r.fam).shard);
        return false;
      }
      this.killRock(r);
      return true;
    },

    killRock: function (r) {
      var sz = D.rockSize(r.size);
      var fam = D.family(r.fam);
      r.alive = false;
      r.spr.setVisible(false);
      this.score += sz.score;
      this.popText(r.x, r.y, '+' + sz.score, fam.tint);
      this.fracture(r.x, r.y, r.size, fam);
      this.splitRock(r);
      this.dropFrom(r.x, r.y, r.size, r.ore);
      if (this.st.shrapnel > 0) this.shrapnelBurst(r);
      var sfx = r.size === 'large' ? 'fracBig' : (r.size === 'med' ? 'fracMed' : 'fracSmall');
      kit.audio.sfx(sfx, { volume: 0.72, rate: 0.9 + Math.random() * 0.2 });
      I.shake(sz.shake, 170);
      I.hitStop(Math.round(28 + sz.shake * 3));
    },

    shrapnelBurst: function (r) {
      var n = 3 + this.st.shrapnel;
      for (var i = 0; i < n; i++) {
        var s = poolTake(this.shots, 1, null, SHOT_RESERVE);
        if (!s) { this.poolDrops.shotsFx++; break; }
        var a = (i / n) * TAU + this.waveRng();
        s.alive = true;
        s.x = r.x; s.y = r.y;
        s.vx = Math.cos(a) * 330; s.vy = Math.sin(a) * 330;
        s.life = 0.42; s.dmg = 1 + this.st.dmgAdd; s.r = 5;
        s.homing = 0; s.ang = a; s.tint = D.family(r.fam).shard;
        s.priority = 1;
        s.bornSeq = (this.shotSeq = (this.shotSeq || 0) + 1);
        setFrame(s.spr, this, 'shot_spread').setVisible(true)
          .setTint(s.tint).setRotation(a).setScale(0.8).setAlpha(1);
      }
    },

    // ============================================================ hazards
    stepHazards: function (dt) {
      var ship = this.ship;
      for (var i = 0; i < this.hazards.length; i++) {
        var h = this.hazards[i];
        if (!h.alive) continue;
        h.hit = Math.max(0, h.hit - dt * 4);
        var fieldW = this.W || 800, fieldH = this.H || 480;
        var dx, dy, d;
        if (h.type === 'mine') {
          dx = wrapDelta(ship.x, h.x, fieldW); dy = wrapDelta(ship.y, h.y, fieldH); d = Math.hypot(dx, dy);
          if (h.state === 'idle') {
            h.x += h.vx * dt; h.y += h.vy * dt;
            h.rot += 0.5 * dt;
            if (d < 190) { h.state = 'armed'; h.timer = 0.85; }
          } else if (h.state === 'armed') {
            h.timer -= dt;
            h.rot += 3.2 * dt;
            h.x += h.vx * 0.4 * dt; h.y += h.vy * 0.4 * dt;
            if (h.timer <= 0) { h.state = 'charge'; h.timer = 1.15; }
          } else if (h.state === 'charge') {
            h.timer -= dt;
            if (d > 1) { h.vx += (dx / d) * 220 * dt; h.vy += (dy / d) * 220 * dt; }
            var sp = Math.hypot(h.vx, h.vy);
            if (sp > 210) { h.vx = h.vx / sp * 210; h.vy = h.vy / sp * 210; }
            h.x += h.vx * dt; h.y += h.vy * dt;
            h.rot += 7 * dt;
            if (h.timer <= 0 || d < h.r + ship.r + 4) { this.detonateMine(h); continue; }
          }
          this.wrap(h, h.r);
        } else if (h.type === 'hulk') {
          h.x += h.vx * dt; h.y += h.vy * dt; h.rot += h.spin * dt;
          this.wrap(h, h.r);
          for (var hn = 0; hn < (h.nodes ? h.nodes.length : 0); hn++) {
            var hnode = h.nodes[hn];
            hnode.hit = Math.max(0, hnode.hit - dt * 4);
            hnode.ang += (h.weakOpen ? 0.7 : 0.35) * dt;
            hnode.x = h.x + Math.cos(hnode.ang) * hnode.radius;
            hnode.y = h.y + Math.sin(hnode.ang) * hnode.radius;
          }
        } else if (h.type === 'drone') {
          dx = wrapDelta(ship.x, h.x, fieldW); dy = wrapDelta(ship.y, h.y, fieldH); d = Math.hypot(dx, dy) || 1;
          h.vx += (dx / d) * 120 * dt; h.vy += (dy / d) * 120 * dt;
          var ds = Math.hypot(h.vx, h.vy);
          if (ds > 128) { h.vx = h.vx / ds * 128; h.vy = h.vy / ds * 128; }
          h.vx *= Math.pow(0.5, dt); h.vy *= Math.pow(0.5, dt);
          h.x += h.vx * dt; h.y += h.vy * dt;
          h.rot = Math.atan2(h.vy, h.vx);
          this.wrap(h, h.r);
        } else if (h.type === 'pirate') {
          dx = wrapDelta(ship.x, h.x, fieldW); dy = wrapDelta(ship.y, h.y, fieldH); d = Math.hypot(dx, dy) || 1;
          // Pirate wings strafe, then fire a lead shot. The lateral term
          // keeps them from becoming stationary target dummies.
          var side = Math.sin(this.runTime * 1.8 + h.rot) > 0 ? 1 : -1;
          h.vx += ((dx / d) * 70 + (-dy / d) * 115 * side) * dt;
          h.vy += ((dy / d) * 70 + (dx / d) * 115 * side) * dt;
          var ps = Math.hypot(h.vx, h.vy);
          if (ps > 150) { h.vx = h.vx / ps * 150; h.vy = h.vy / ps * 150; }
          h.vx *= Math.pow(0.68, dt); h.vy *= Math.pow(0.68, dt);
          h.x += h.vx * dt; h.y += h.vy * dt; h.rot += h.spin * dt;
          this.wrap(h, h.r);
          h.fire -= dt;
          if (h.fire <= 0) {
            h.fire = 1.45;
            var leadX = ship.x + ship.vx * 0.36, leadY = ship.y + ship.vy * 0.36;
            var pa = Math.atan2(wrapDelta(leadY, h.y, fieldH), wrapDelta(leadX, h.x, fieldW));
            this.spawnEnemyShot(h.x, h.y, pa, 190 + (this.ladderStage || 0) * 2, 1, 0xff7188);
          }
        } else if (h.type === 'well') {
          h.rot += 0.6 * dt;
        } else if (h.type === 'icefield') {
          h.rot += 0.25 * dt;
        } else if (h.type === 'storm') {
          h.rot += 1.2 * dt;
          h.timer -= dt;
          if (h.timer <= 0) { h.timer = 0.75; this.stormArc(h); }
        } else if (h.type === 'geode') {
          h.rot += 0.3 * dt;
          h.timer -= dt;
          if (h.timer <= 0) {
            h.timer = 3.1;
            this.geodeRing(h);
          }
          var live = 0;
          for (var n = 0; n < h.nodes.length; n++) {
            var nd = h.nodes[n];
            nd.hit = Math.max(0, nd.hit - dt * 4);
            nd.ang += 0.55 * dt;
            nd.x = h.x + Math.cos(nd.ang) * (h.r + 26);
            nd.y = h.y + Math.sin(nd.ang) * (h.r + 26);
            if (nd.alive) live++;
          }
          if (live === 0) {
            this.clearHazard(h);
            this.bigBoom(h.x, h.y, 0xe0c2ff);
            for (n = 0; n < 10; n++) this.spawnPickup('burst', h.x + rngRange(this.waveRng, -50, 50),
              h.y + rngRange(this.waveRng, -50, 50), 3);
          }
        }
      }
    },

    detonateMine: function (h) {
      if (!h.alive) return;
      this.clearHazard(h);
      this.bigBoom(h.x, h.y, 0xff9060);
      kit.audio.sfx('fracBig', { volume: 0.8, rate: 0.82 });
      I.shake(11, 220);
      this.score += 160;
      this.popText(h.x, h.y, '+160', 0xff9060);
      I.hitStop(42);
      var R = 96;
      var dx = wrapDelta(this.ship.x, h.x, this.W || 800);
      var dy = wrapDelta(this.ship.y, h.y, this.H || 480);
      if (dx * dx + dy * dy < R * R) this.hurt(1, h.x, h.y, 300);
      for (var i = 0; i < this.rocks.length; i++) {
        var r = this.rocks[i];
        if (!r.alive) continue;
        var rx = wrapDelta(r.x, h.x, this.W || 800);
        var ry = wrapDelta(r.y, h.y, this.H || 480);
        if (rx * rx + ry * ry < (R + r.r) * (R + r.r)) this.damageRock(r, 3, r.x, r.y);
      }
      this.spawnPickup('burst', h.x, h.y, 2);
    },

    damageHulkNode: function (h, node, dmg, x, y) {
      node.hp -= dmg;
      node.hit = 0.22;
      this.chipSpark(x, y, 0xffd8a0);
      if (node.hp > 0) return;
      node.alive = false;
      node.spr.setVisible(false);
      this.score += 90;
      this.popText(node.x, node.y, '+90', 0xffd8a0);
      this.bigBoom(node.x, node.y, 0xffd8a0);
      kit.audio.sfx('fracMed', { volume: 0.55, rate: 1.2 });
      var open = true;
      for (var i = 0; i < h.nodes.length; i++) if (h.nodes[i].alive) open = false;
      if (open) {
        h.weakOpen = true;
        this.queueToast('HULK CORE EXPOSED', 0xffd8a0, 1.0);
        kit.audio.sfx('boss', { volume: 0.48, rate: 1.3 });
        this.spawnPickup('burst', h.x, h.y, 3);
      }
    },

    killHazard: function (h) {
      if (!h.alive) return;
      var score = h.type === 'hulk' ? 480 : (h.type === 'pirate' ? 380 : 260);
      var tint = h.type === 'hulk' ? this.family.tint : (h.type === 'pirate' ? 0xff7188 : 0xd2a0ff);
      var x = h.x, y = h.y;
      this.clearHazard(h);
      this.score += score;
      this.popText(x, y, '+' + score, tint);
      this.bigBoom(x, y, tint);
      if (h.type === 'hulk') {
        this.fracture(x, y, 'med', this.family);
        for (var i = 0; i < 3; i++) {
          var a = (i / 3) * TAU + this.waveRng();
          this.spawnRock('small', { x: x, y: y },
            { x: Math.cos(a) * 150, y: Math.sin(a) * 150 }, false, { priority: 2, hpMul: 0.7 });
        }
      }
      for (i = 0; i < (h.type === 'hulk' ? 8 : (h.type === 'pirate' ? 5 : 3)); i++) {
        this.spawnPickup('burst', x + rngRange(this.waveRng, -50, 50),
          y + rngRange(this.waveRng, -40, 40), 3);
      }
      kit.audio.sfx('fracBig', { volume: 0.8 });
      I.shake(h.type === 'hulk' ? 12 : 8, 220);
      I.hitStop(h.type === 'hulk' ? 58 : 36);
    },

    geodeRing: function (h) {
      var n = 8;
      for (var i = 0; i < n; i++) {
        var a = (i / n) * TAU + h.rot;
        this.spawnRock('small',
          { x: h.x + Math.cos(a) * (h.r + 12), y: h.y + Math.sin(a) * (h.r + 12) },
          { x: Math.cos(a) * 165, y: Math.sin(a) * 165 });
      }
      kit.audio.sfx('fracMed', { volume: 0.6, rate: 1.15 });
    },

    // =============================================================== boss
    stepBoss: function (dt) {
      var b = this.boss;
      if (!b.alive) return;
      var ship = this.ship;
      var W = this.W || 800, H = this.H || 480;
      b.hit = Math.max(0, b.hit - dt * 4);
      b.telegraph = Math.max(0, b.telegraph - dt);

      var frac = b.hp / b.hpMax;
      var wantPhase = b.podsLeft > 0 ? 1 : (frac > 0.35 ? 2 : 3);
      if (wantPhase !== b.phase) {
        b.phase = wantPhase;
        b.timer = 1.6;
        b.telegraph = 0.9;
        kit.audio.sfx('boss', { volume: 0.8, rate: 0.9 + b.phase * 0.08 });
        this.queueToast('PHASE ' + b.phase, 0xff9060, 1.0);
        if (b.phase === 3) {
          for (var a2 = 0; a2 < b.arms.length; a2++) {
            if (b.arms[a2].alive) {
              b.arms[a2].detached = true;
              b.arms[a2].orbit = 0;
              // The detached arm gets its own exposed attack pod. It is no
              // longer part of the phase-one pod count.
              b.arms[a2].pod.alive = true;
              b.arms[a2].pod.hp = b.arms[a2].pod.hpMax = Math.max(14, Math.round(b.hpMax * 0.05));
            }
          }
        }
      }

      // drift, with a ram in phase 3
      if (b.phase === 3 && b.ramT <= 0 && b.timer <= 0) {
        b.telegraph = 0.85;
        b.timer = 0.85;
        b.ramT = -1;
      }
      if (b.ramT === -1 && b.telegraph <= 0) {
        var ra = Math.atan2(wrapDelta(ship.y, b.y, H), wrapDelta(ship.x, b.x, W));
        var rs = this.sector.boss.ramSpeed;
        b.vx = Math.cos(ra) * rs; b.vy = Math.sin(ra) * rs;
        b.ramT = 1.1;
        I.shake(8, 200);
      }
      if (b.ramT > 0) {
        b.ramT -= dt;
        if (b.ramT <= 0) { b.timer = 2.2; b.ramT = 0; }
      } else if (b.phase < 3) {
        b.vx += (W / 2 - b.x) * 0.12 * dt;
        b.vy += (H * 0.45 - b.y) * 0.12 * dt;
        var bs = Math.hypot(b.vx, b.vy);
        var lim = 60 + b.phase * 22;
        if (bs > lim) { b.vx = b.vx / bs * lim; b.vy = b.vy / bs * lim; }
      }
      b.vx *= Math.pow(0.6, dt); b.vy *= Math.pow(0.6, dt);
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.x = clamp(b.x, b.r, W - b.r);
      b.y = clamp(b.y, b.r, H - b.r);

      b.spin += dt * (0.32 + b.phase * 0.16);
      var i, arm;
      for (i = 0; i < b.arms.length; i++) {
        arm = b.arms[i];
        if (!arm.alive) continue;
        if (arm.detached) {
          arm.orbit += dt * 1.9;
          var orbitAngle = arm.orbit + (i / Math.max(1, b.arms.length)) * TAU;
          var orbitRadius = 148 + i * 18;
          arm.x = b.x + Math.cos(orbitAngle) * orbitRadius;
          arm.y = b.y + Math.sin(orbitAngle) * orbitRadius;
          this.wrap(arm, 0);
          arm.ang = orbitAngle + Math.PI * 0.5;
          arm.attackT = Math.max(0, arm.attackT - dt);
        } else {
          arm.x = b.x; arm.y = b.y;
          arm.ang = b.spin + (i / b.arms.length) * TAU;
        }
        var armBase = arm.detached ? arm.len * 0.72 : b.r + arm.len;
        var ax = arm.x + Math.cos(arm.ang) * armBase;
        var ay = arm.y + Math.sin(arm.ang) * armBase;
        arm.pod.x = ax; arm.pod.y = ay;
        arm.pod.hit = Math.max(0, arm.pod.hit - dt * 4);
      }

      // hive spits rock; phase 2+ adds a telegraphed shotgun
      b.timer -= dt;
      if (b.timer <= 0) {
        if (b.phase === 1) {
          b.timer = 2.6;
          this.bossSpit(3, 150);
        } else if (b.phase === 2) {
          b.timer = 2.2;
          b.telegraph = 0.55;
          this.bossSpit(5, 190);
        } else {
          b.timer = 2.8;
          this.bossSpit(4, 210);
          for (i = 0; i < 3; i++) {
            this.spawnPickup('burst', b.x + rngRange(this.waveRng, -60, 60),
              b.y + rngRange(this.waveRng, -60, 60), 3);
          }
        }
      }
    },

    bossSpit: function (n, speed) {
      var b = this.boss;
      var base = Math.atan2(wrapDelta(this.ship.y, b.y, this.H || 480),
        wrapDelta(this.ship.x, b.x, this.W || 800));
      for (var i = 0; i < n; i++) {
        var a = base + (i - (n - 1) / 2) * 0.34;
        this.spawnRock(i % 2 === 0 ? 'small' : 'med',
          { x: b.x + Math.cos(a) * (b.r + 16), y: b.y + Math.sin(a) * (b.r + 16) },
          { x: Math.cos(a) * speed, y: Math.sin(a) * speed });
      }
      kit.audio.sfx('fracMed', { volume: 0.6, rate: 0.85 });
    },

    damageBoss: function (dmg, x, y) {
      var b = this.boss;
      if (!b.alive) return;
      if (b.podsLeft > 0) {
        // armoured: the core shrugs it off, and says so
        this.chipSpark(x, y, 0x9fd8ff);
        return;
      }
      b.hp -= dmg;
      b.hit = 0.2;
      this.chipSpark(x, y, this.family.shard);
      if (b.hp <= 0) this.killBoss();
    },

    damagePod: function (arm, dmg, x, y) {
      arm.pod.hp -= dmg;
      arm.pod.hit = 0.22;
      this.chipSpark(x, y, this.family.shard);
      if (arm.pod.hp <= 0) {
        arm.pod.alive = false;
        arm.pod.spr.setVisible(false);
        if (!arm.detached) this.boss.podsLeft = Math.max(0, this.boss.podsLeft - 1);
        this.bigBoom(arm.pod.x, arm.pod.y, this.family.tint);
        this.popText(arm.pod.x, arm.pod.y, '+180', this.family.tint);
        this.score += 180;
        kit.audio.sfx('fracBig', { volume: 0.85 });
        I.shake(10, 230);
        I.hitStop(48);
        for (var i = 0; i < 5; i++) {
          this.spawnPickup('burst', arm.pod.x + rngRange(this.waveRng, -30, 30),
            arm.pod.y + rngRange(this.waveRng, -30, 30), 3);
        }
        this.spawnPickup('shield', arm.pod.x, arm.pod.y, 1);
      }
    },

    killBoss: function () {
      var b = this.boss;
      b.hp = 0;
      this.score += 2200;
      this.popText(b.x, b.y, '+2200', this.family.tint);
      this.bigBoom(b.x, b.y, this.family.tint);
      for (var i = 0; i < 14; i++) {
        this.spawnPickup('burst', b.x + rngRange(this.waveRng, -110, 110),
          b.y + rngRange(this.waveRng, -90, 90), 4);
      }
      kit.audio.sfx('boss', { volume: 1, rate: 0.8 });
      I.shake(20, 520);
      I.hitStop(140);
      this.clearBoss();
    },

    // ========================================================= collisions
    collide: function () {
      var i, j, s, r, h;
      var ship = this.ship, b = this.boss;
      var fieldW = this.W || 800, fieldH = this.H || 480;

      // shots
      for (i = 0; i < this.shots.length; i++) {
        s = this.shots[i];
        if (!s.alive) continue;
        if (s.hostile) {
          var esx = wrapDelta(s.x, ship.x, fieldW), esy = wrapDelta(s.y, ship.y, fieldH);
          if (ship.alive && ship.invuln <= 0 && esx * esx + esy * esy <= (ship.r + s.r) * (ship.r + s.r)) {
            this.hurt(s.dmg, s.x, s.y, 190);
            this.chipSpark(s.x, s.y, 0xff7188);
            s.alive = false; s.spr.setVisible(false);
          }
          continue;
        }
        var consumed = false;
        for (j = 0; j < this.rocks.length && !consumed; j++) {
          r = this.rocks[j];
          if (!r.alive) continue;
          var dx = wrapDelta(r.x, s.x, fieldW), dy = wrapDelta(r.y, s.y, fieldH), rr = r.r + s.r;
          if (dx * dx + dy * dy > rr * rr) continue;
          this.damageRock(r, s.dmg, s.x, s.y);
          consumed = true;
        }
        for (j = 0; j < this.hazards.length && !consumed; j++) {
          h = this.hazards[j];
          if (!h.alive || h.type === 'well' || h.type === 'icefield' || h.type === 'storm') continue;
          if (h.type === 'geode') {
            for (var n = 0; n < h.nodes.length; n++) {
              var nd = h.nodes[n];
              if (!nd.alive) continue;
              var ndx = wrapDelta(nd.x, s.x, fieldW), ndy = wrapDelta(nd.y, s.y, fieldH);
              if (ndx * ndx + ndy * ndy > 30 * 30) continue;
              nd.hp -= s.dmg; nd.hit = 0.2;
              this.chipSpark(s.x, s.y, 0xe0c2ff);
              if (nd.hp <= 0) {
                nd.alive = false; nd.spr.setVisible(false);
                this.bigBoom(nd.x, nd.y, 0xe0c2ff);
                kit.audio.sfx('fracBig', { volume: 0.8 });
              }
              consumed = true;
              break;
            }
            continue;
          }
          if (h.type === 'hulk' && h.nodes) {
            for (var hn = 0; hn < h.nodes.length; hn++) {
              var hnd = h.nodes[hn];
              if (!hnd.alive) continue;
              var hnx = wrapDelta(hnd.x, s.x, fieldW), hny = wrapDelta(hnd.y, s.y, fieldH);
              if (hnx * hnx + hny * hny <= 24 * 24) {
                this.damageHulkNode(h, hnd, s.dmg, s.x, s.y);
                consumed = true;
                break;
              }
            }
            if (consumed) continue;
          }
          var hdx = wrapDelta(h.x, s.x, fieldW), hdy = wrapDelta(h.y, s.y, fieldH), hrr = h.r + s.r;
          if (hdx * hdx + hdy * hdy > hrr * hrr) continue;
          if (h.type === 'mine') { this.detonateMine(h); }
          else {
            h.hp -= h.type === 'hulk' && !h.weakOpen ? s.dmg * 0.35 : s.dmg; h.hit = 0.2;
            this.chipSpark(s.x, s.y, 0xbfe6ff);
            if (h.hp <= 0) this.killHazard(h);
          }
          consumed = true;
        }
        if (!consumed && b.alive) {
          for (j = 0; j < b.arms.length && !consumed; j++) {
            var arm = b.arms[j];
            if (!arm.alive || !arm.pod.alive) continue;
            var pdx = wrapDelta(arm.pod.x, s.x, fieldW);
            var pdy = wrapDelta(arm.pod.y, s.y, fieldH);
            if (pdx * pdx + pdy * pdy > 34 * 34) continue;
            this.damagePod(arm, s.dmg, s.x, s.y);
            consumed = true;
          }
          if (!consumed) {
            var bdx = wrapDelta(b.x, s.x, fieldW), bdy = wrapDelta(b.y, s.y, fieldH), brr = b.r + s.r;
            if (bdx * bdx + bdy * bdy <= brr * brr) {
              this.damageBoss(s.dmg, s.x, s.y);
              consumed = true;
            }
          }
        }
        if (consumed) { s.alive = false; s.spr.setVisible(false); }
      }

      // ship
      if (ship.alive && ship.invuln <= 0) {
        for (i = 0; i < this.rocks.length; i++) {
          r = this.rocks[i];
          if (!r.alive) continue;
          var sdx = wrapDelta(r.x, ship.x, fieldW), sdy = wrapDelta(r.y, ship.y, fieldH), srr = r.r + ship.r;
          if (sdx * sdx + sdy * sdy > srr * srr) continue;
          if (this.st.kinetic && ship.dash > 0) { this.killRock(r); continue; }
          var sz = D.rockSize(r.size);
          this.hurt(sz.dmg, r.x, r.y, sz.knock);
          this.damageRock(r, 99, r.x, r.y);
          break;
        }
      }
      if (ship.alive && ship.invuln <= 0) {
        for (i = 0; i < this.hazards.length; i++) {
          h = this.hazards[i];
          if (!h.alive || h.type === 'well' || h.type === 'icefield' || h.type === 'storm') continue;
          var ex = wrapDelta(h.x, ship.x, fieldW), ey = wrapDelta(h.y, ship.y, fieldH), er = h.r + ship.r;
          if (h.type === 'geode') er = h.r + ship.r;
          if (ex * ex + ey * ey > er * er) continue;
          if (h.type === 'mine') { this.detonateMine(h); }
          else if (h.type === 'hulk') this.hurt(2, h.x, h.y, 340);
          else if (h.type === 'pirate') this.hurt(1, h.x, h.y, 260);
          else if (h.type === 'drone') {
            this.hurt(1, h.x, h.y, 220); h.hp -= 3;
            if (h.hp <= 0) this.killHazard(h);
          }
          else this.hurt(1, h.x, h.y, 240);
          break;
        }
      }
      if (ship.alive && ship.invuln <= 0 && b.alive) {
        var cdx = wrapDelta(b.x, ship.x, fieldW), cdy = wrapDelta(b.y, ship.y, fieldH), crr = b.r + ship.r;
        if (cdx * cdx + cdy * cdy <= crr * crr) this.hurt(2, b.x, b.y, 380);
        if (ship.alive && ship.invuln <= 0) {
          for (i = 0; i < b.arms.length; i++) {
            var attackArm = b.arms[i];
            if (!attackArm.detached || !attackArm.alive || !attackArm.pod.alive) continue;
            var adx = wrapDelta(attackArm.pod.x, ship.x, fieldW);
            var ady = wrapDelta(attackArm.pod.y, ship.y, fieldH);
            var ar = ship.r + 24;
            if (adx * adx + ady * ady <= ar * ar) {
              attackArm.attackT = 0.22;
              this.hurt(1, attackArm.pod.x, attackArm.pod.y, 260);
              break;
            }
          }
        }
      }

      // pickups
      for (i = 0; i < this.pickups.length; i++) {
        var p = this.pickups[i];
        if (!p.alive) continue;
        var px = wrapDelta(p.x, ship.x, fieldW), py = wrapDelta(p.y, ship.y, fieldH);
        var pr = ship.r + 20;
        if (px * px + py * py <= pr * pr) this.collectPickup(p);
      }
    },

    beamDamage: function (dt, w) {
      var ship = this.ship;
      var range = w.range;
      var dmg = (w.dps + this.st.dmgAdd * 6) * dt;
      var cos = Math.cos(ship.ang), sin = Math.sin(ship.ang);
      var i, hitAny = 0;
      for (i = 0; i < this.rocks.length; i++) {
        var r = this.rocks[i];
        if (!r.alive) continue;
        var dx = wrapDelta(r.x, ship.x, this.W || 800);
        var dy = wrapDelta(r.y, ship.y, this.H || 480);
        var proj = dx * cos + dy * sin;
        if (proj < 0 || proj > range) continue;
        var perp = Math.abs(-dx * sin + dy * cos);
        if (perp > r.r + w.r) continue;
        this.damageRock(r, dmg, ship.x + cos * proj, ship.y + sin * proj);
        hitAny++;
      }
      for (i = 0; i < this.hazards.length; i++) {
        var h = this.hazards[i];
        if (!h.alive || h.type === 'well' || h.type === 'icefield' || h.type === 'storm' || h.type === 'geode') continue;
        if (h.type === 'hulk' && h.nodes) {
          for (var hn = 0; hn < h.nodes.length; hn++) {
            var hnd = h.nodes[hn];
            if (!hnd.alive) continue;
            var hnx = wrapDelta(hnd.x, ship.x, this.W || 800);
            var hny = wrapDelta(hnd.y, ship.y, this.H || 480);
            var hnp = hnx * cos + hny * sin;
            if (hnp >= 0 && hnp <= range && Math.abs(-hnx * sin + hny * cos) <= 24) {
              this.damageHulkNode(h, hnd, dmg, hnd.x, hnd.y); hitAny++;
            }
          }
        }
        var hx = wrapDelta(h.x, ship.x, this.W || 800);
        var hy = wrapDelta(h.y, ship.y, this.H || 480);
        var hp = hx * cos + hy * sin;
        if (hp < 0 || hp > range) continue;
        if (Math.abs(-hx * sin + hy * cos) > h.r + w.r) continue;
        if (h.type === 'mine') this.detonateMine(h);
        else {
          h.hp -= h.type === 'hulk' && !h.weakOpen ? dmg * 0.35 : dmg; h.hit = 0.2;
          if (h.hp <= 0) {
            this.killHazard(h);
          }
        }
        hitAny++;
      }
      var b = this.boss;
      if (b.alive) {
        for (i = 0; i < b.arms.length; i++) {
          var arm = b.arms[i];
          if (!arm.alive || !arm.pod.alive) continue;
          var ax = wrapDelta(arm.pod.x, ship.x, this.W || 800);
          var ay = wrapDelta(arm.pod.y, ship.y, this.H || 480);
          var ap = ax * cos + ay * sin;
          if (ap < 0 || ap > range) continue;
          if (Math.abs(-ax * sin + ay * cos) > 32) continue;
          this.damagePod(arm, dmg, arm.pod.x, arm.pod.y);
          hitAny++;
        }
        var bx = wrapDelta(b.x, ship.x, this.W || 800);
        var by = wrapDelta(b.y, ship.y, this.H || 480);
        var bp = bx * cos + by * sin;
        if (bp >= 0 && bp <= range && Math.abs(-bx * sin + by * cos) < b.r) {
          this.damageBoss(dmg, ship.x + cos * bp, ship.y + sin * bp);
          hitAny++;
        }
      }
      this.beamHits = hitAny;
    },

    // ============================================================== flow
    aliveRocks: function () {
      var n = 0;
      for (var i = 0; i < this.rocks.length; i++) if (this.rocks[i].alive) n++;
      return n;
    },
    aliveHazards: function (type) {
      var n = 0;
      for (var i = 0; i < this.hazards.length; i++) {
        var h = this.hazards[i];
        if (h.alive && (!type || h.type === type)) n++;
      }
      return n;
    },

    stepWaveFlow: function (dt) {
      if (this.mode !== 'play') return;
      if (HB.forceClearWave) { HB.forceClearWave = false; this.forceClear(); }

      var kind = this.spec.kind;
      var done = false;

      if (kind === 'boss') {
        done = !this.boss.alive;
      } else if (kind === 'setpiece' && this.setpiece) {
        var id = this.setpiece.id;
        if (id === 'grinder') {
          this.survive = Math.max(0, this.survive - dt);
          this.spawnStream -= dt;
          if (this.spawnStream <= 0) {
            this.spawnStream = 1.15;
            this.spawnRock('med', null, null, true);
          }
          done = this.survive <= 0;
        } else if (id === 'convoy') {
          done = this.aliveHazards('hulk') === 0 && this.aliveRocks() === 0;
        } else if (id === 'bloom') {
          done = this.aliveHazards('geode') === 0 && this.aliveRocks() === 0;
        } else {
          done = this.aliveRocks() === 0;
        }
      } else {
        done = this.aliveRocks() === 0;
      }

      if (done && !this.waveClear) {
        this.waveClear = true;
        this.clearDelay = 0.85;
      }
      if (this.waveClear) {
        this.clearDelay -= dt;
        if (this.clearDelay <= 0) this.onWaveCleared();
      }
    },

    forceClear: function () {
      var i;
      // killing a large rock produces its children, so the sweep repeats
      // until the fracture chain has bottomed out
      for (var pass = 0; pass < 6 && this.aliveRocks() > 0; pass++) {
        for (i = 0; i < this.rocks.length; i++) if (this.rocks[i].alive) this.killRock(this.rocks[i]);
      }
      for (i = 0; i < this.hazards.length; i++) {
        var h = this.hazards[i];
        if (h.alive && h.type !== 'well') {
          this.clearHazard(h);
        }
      }
      if (this.boss.alive) this.killBoss();
      this.survive = 0;
    },

    onWaveCleared: function () {
      this.waveClear = false;
      this.score += this.wave * 140;
      this.salvageEarned += Math.max(3, Math.floor(this.ore / 18) + Math.ceil(this.wave / 2));
      if (this.ladder) {
        this.mode = 'upgrade';
        this.clearToast();
        this.pendingUpgrade = 0.7;
        return;
      }
      if (this.wave >= D.WAVES_PER_SECTOR) { this.sectorCleared(); return; }
      this.mode = 'upgrade';
      this.clearToast();
      this.pendingUpgrade = 1.5;
    },

    advanceWave: function () {
      this.mode = 'play';
      this.beginWave(this.wave + 1);
    },

    sectorCleared: function () {
      this.mode = 'results';
      var s = this.sector;
      var medal = D.medalFor(s, this.runTime, this.ore);
      this.result = { win: true, medal: medal, time: this.runTime, ore: this.ore, score: this.score };
      var prevBest = I.PROFILE.best[s.id] || 0;
      if (this.score > prevBest) I.PROFILE.best[s.id] = this.score;
      var prev = I.PROFILE.medals[s.id] || 'none';
      if ((D.MEDAL_RANK[medal] || 0) > (D.MEDAL_RANK[prev] || 0)) I.PROFILE.medals[s.id] = medal;
      if (this.sectorIndex + 2 > I.PROFILE.unlocked) {
        I.PROFILE.unlocked = clamp(this.sectorIndex + 2, 1, D.SECTORS.length);
      }
      if (this.tut) { I.PROFILE.tutorial = true; }
      this.bankSalvage();
      this.result.salvage = this.salvageEarned;
      I.saveProfile();
      kit.audio.stopMusic(600);
      kit.audio.sfx('medal', { volume: 0.95 });
      // the banner beat lands first; the results card follows it in rather
      // than stacking two headlines on the same pixels
      this.showBanner('SECTOR CLEAR', s.name + '   ' + medal.toUpperCase() + ' MEDAL', 0x7ef0b4, 2.6);
      this.pendingResults = 1.9;
      this.updateDebugState();
    },

    gameOver: function () {
      this.mode = 'gameover';
      this.ship.alive = false;
      this.result = { win: false, medal: 'none', time: this.runTime, ore: this.ore, score: this.score };
      this.pendingResults = 0;
      var s = this.sector;
      if (this.score > (I.PROFILE.best[s.id] || 0)) { I.PROFILE.best[s.id] = this.score; I.saveProfile(); }
      this.bankSalvage();
      this.result.salvage = this.salvageEarned;
      if (this.ladder && this.ladderStage > (I.PROFILE.ladderBest || 0)) I.PROFILE.ladderBest = this.ladderStage;
      I.saveProfile();
      this.bigBoom(this.ship.x, this.ship.y, 0xff7a86);
      kit.audio.stopMusic(500);
      kit.audio.sfx('lose', { volume: 0.9 });
      I.shake(22, 600);
      I.hitStop(220);
      this.openResults();
      this.updateDebugState();
    },

    bankSalvage: function () {
      if (this.salvageBanked) return;
      this.salvageBanked = true;
      var gain = Math.max(0, Math.floor(this.salvageEarned + this.ore / 24));
      I.PROFILE.salvage = clamp((I.PROFILE.salvage || 0) + gain, 0, 1000000);
      this.salvageEarned = gain;
    },

    // =========================================================== tutorial
    stepTutorial: function (dt) {
      var t = this.tut;
      if (!t || t.done) return;
      t.t += dt;
      var advance = false;
      if (t.step === 0) advance = t.thrust > 1.1;
      else if (t.step === 1) advance = t.turn > 1.0;
      else if (t.step === 2) advance = t.fired >= 3;
      else if (t.step === 3) advance = t.dashed >= 1;
      else if (t.step === 4) advance = t.ore >= 2;
      else if (t.step === 5) advance = this.wave > 1;
      if (advance) {
        t.step++;
        t.t = 0;
        kit.audio.sfx('ui', { volume: 0.7 });
        if (t.step > 5) {
          t.done = true;
          I.PROFILE.tutorial = true;
          I.saveProfile();
        }
      }
      HB.tutorialStep = t.done ? -1 : t.step;
    },

    // ============================================================== debug
    // Rebuilt as fresh arrays each call. A probe can splice or sort the
    // result without ever touching a live pool.
    updateDebugState: function () {
      var s = HB;
      s.mode = this.mode;
      s.sector = this.sectorIndex + 1;
      s.sectorId = this.sector.id;
      s.sectorName = this.sector.name;
      s.family = this.sector.family;
      s.wave = this.wave;
      s.waveKind = this.spec ? this.spec.kind : '';
      s.waveName = this.spec ? this.spec.name : '';
      s.score = Math.round(this.score);
      s.ore = this.ore;
      s.runOre = this.ore;
      s.shield = this.st.shield;
      s.shieldMax = this.st.shieldMax;
      s.weapon = this.weapon;
      s.weapons = this.weapons.slice();
      s.heat = Math.round(this.heat);
      s.vented = this.vent > 0;
      s.overcharge = Math.round(this.overcharge * 100) / 100;
      s.dashCharge = this.st.dashCharge;
      s.dashMax = this.st.dashMax;
      s.rocks = this.aliveRocks();
      s.hazards = this.aliveHazards(null);
      s.poolDrops = {
        rocks: this.poolDrops.rocks, hazards: this.poolDrops.hazards,
        shotsPlayer: this.poolDrops.shotsPlayer, shotsFx: this.poolDrops.shotsFx,
        pickups: this.poolDrops.pickups, pickupStacked: this.poolDrops.pickupStacked,
        poolEvicted: this.poolDrops.poolEvicted
      };
      s.bossPhase = this.boss.alive ? this.boss.phase : 0;
      s.bossHp = this.boss.alive ? Math.round(this.boss.hp) : 0;
      s.bossHpMax = this.boss.alive ? this.boss.hpMax : 0;
      s.runTime = Math.round(this.runTime * 100) / 100;
      s.medal = this.result ? this.result.medal : 'none';
      s.salvage = I.PROFILE.salvage || 0;
      s.refits = {
        hull: I.PROFILE.refits.hull, coil: I.PROFILE.refits.coil,
        drive: I.PROFILE.refits.drive, magnet: I.PROFILE.refits.magnet
      };
      s.ladderStage = this.ladder ? this.ladderStage : 0;
      s.ladderSeed = this.ladder ? this.ladderSeed : 0;
      s.unlocked = I.unlockedCount();
      s.medals = I.PROFILE.medals;
      s.reducedMotion = I.isReduced();
      var view = [];
      for (var i = 0; i < this.pickups.length; i++) {
        var p = this.pickups[i];
        if (!p.alive) continue;
        view.push({ kind: p.kind, x: Math.round(p.x), y: Math.round(p.y),
          amount: p.amount, life: Math.round(p.life * 10) / 10 });
      }
      s.livePickups = view;
    },

    // Test switches are polled live so the orchestrator can flip a lever
    // mid-run, not only before boot.
    pollSwitches: function () {
      if (HB.forceSector && HB.forceSector - 1 !== this.sectorIndex) {
        var idx = clamp(HB.forceSector - 1, 0, D.SECTORS.length - 1);
        HB.forceSector = 0;
        this.scene.start('Play', { sector: idx, wave: HB.forceWave || 1 });
        return true;
      }
      if (HB.forceWave && HB.forceWave !== this.wave && this.mode === 'play') {
        var w = clamp(HB.forceWave, 1, D.WAVES_PER_SECTOR);
        HB.forceWave = 0;
        this.killAll();
        this.beginWave(w);
      }
      if (HB.forceWeapon && D.WEAPONS[HB.forceWeapon]) {
        if (this.weapons.indexOf(HB.forceWeapon) < 0) this.weapons.push(HB.forceWeapon);
        this.weapon = HB.forceWeapon;
        HB.forceWeapon = '';
      }
      return false;
    },

    // =============================================================== tick
    update: function (time, delta) {
      var dt = Math.min(0.05, delta / 1000);
      var j = kit.juice.frame();
      this.cameras.main.setScroll(j.dx, j.dy);

      if (this.pollSwitches()) return;

      this.inputCache = this.readInput();

      var steps = 0;
      if (!j.frozen && !this.paused && !kit.paused) {
        this.acc += dt;
        while (this.acc >= I.STEP && steps < I.MAX_STEPS) {
          this.acc -= I.STEP;
          steps++;
          if (this.mode === 'play') this.step(I.STEP);
          else this.stepIdle(I.STEP);
        }
        // A device that cannot keep up runs in slow motion. The leftover is
        // dropped instead of banked, so the sim never skips forward.
        if (steps >= I.MAX_STEPS) this.acc = 0;
      } else {
        this.acc = 0;
      }

      // The cosmetic clock never advances further than the sim just did.
      var vdt = j.frozen ? 0 : steps * I.STEP;
      var clockDt = j.frozen ? 0 : dt;
      if (this.pendingResults > 0) {
        this.pendingResults -= clockDt;
        if (this.pendingResults <= 0) { this.pendingResults = 0; this.openResults(); }
      }
      if (this.pendingUpgrade > 0) {
        this.pendingUpgrade -= clockDt;
        if (this.pendingUpgrade <= 0) { this.pendingUpgrade = 0; this.openUpgrade(); }
      }
      this.paint(vdt);
      this.debugT = (this.debugT || 0) + dt;
      if (this.debugT >= 0.1) { this.debugT = 0; this.updateDebugState(); }
    },

    // Non-play modes still need drifting rocks behind the overlay.
    stepIdle: function (dt) {
      this.stepRocks(dt);
      this.stepPickups(dt);
      var ship = this.ship;
      ship.x += ship.vx * dt; ship.y += ship.vy * dt;
      ship.vx *= Math.pow(0.4, dt); ship.vy *= Math.pow(0.4, dt);
      this.wrap(ship, ship.r);
    }
  };

  window.HB_PLAY = { PLAY: PLAY };
}());
