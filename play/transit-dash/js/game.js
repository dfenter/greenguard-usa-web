/* Transit Dash simulation and Phaser view. GGKit owns lifecycle, input, save and audio. */
(function (root) {
  'use strict';

  var Phaser = root.Phaser;
  var TD = root.TD;
  var C = TD.COLORS;
  var STEP = TD.STEP;
  var MAX_STEPS = 5;
  var MAX_ENTITIES = 150;
  var MAX_FX = 150;
  var JUMP_SPAN = 9.4;
  var JUMP_PEAK = 1.95;
  var RAMP_SPAN = 22;
  var RAMP_PEAK = 5.5;
  var SPD0 = 9.5;
  var SPDMAX = 23;
  var SPD_RAMP = 0.16;
  var SPAWN_AHEAD = 118;
  var LANE_SHIFT = 0.12;
  var TAU = Math.PI * 2;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function num(v, d) { return Number.isFinite(v) ? v : d; }
  function tint(hex) { return parseInt(String(hex || '#ffffff').replace('#', ''), 16) || 0xffffff; }
  function arcV(speed, span, peak) { return 4 * peak * speed / span; }
  function arcG(speed, span, peak) { return 8 * peak * speed * speed / (span * span); }
  function easeOut(t) { return 1 - Math.pow(1 - clamp(t, 0, 1), 3); }
  function approach(a, b, step) { return a < b ? Math.min(b, a + step) : Math.max(b, a - step); }

  function Runner(scene, kit, runtime) {
    this.scene = scene;
    this.kit = kit;
    this.runtime = runtime;
    this.mode = 'menu';
    this.entities = [];
    this.actions = [];
    this.particles = [];
    this.toast = {text: '', color: C.cyan, life: 0, max: 0.9};
    this.pendingMission = 0;
    this.resetRunData();
  }

  Runner.prototype.resetRunData = function () {
    this.distance = 0; this.score = 0; this.runTokens = 0; this.speed = SPD0;
    this.health = 2; this.shield = 0; this.multiplier = 1; this.nearMisses = 0;
    this.nearScore = 0; this.grindDistance = 0; this.stageIndex = 0; this.lastStage = 0;
    this.simT = 0; this.timeLeft = 75; this.nextZ = 22; this.chunkCount = 0;
    this.stumbles = 0; this.lanesChanged = 0; this.vaults = 0; this.rolls = 0;
    this.ramps = 0; this.powers = 0; this.cleanDistance = 0; this.tokensInRow = 0;
    this.maxTokensInRow = 0; this.nearShieldUses = 0; this.stageCount = 1;
    this.distanceSinceHit = 0; this.lastScore = 0;
    this.player = {lane: 0, lanePos: 0, laneFrom: 0, laneTo: 0, shiftT: 0, air: false, y: 0, vy: 0, grav: 24,
      rollT: 0, hurtT: 0, invulnT: 0, jetT: 0, magnetT: 0, boostT: 0, phase: 0,
      bufferedLane: null, bufferedVertical: null, grindT: 0, grindLane: null};
  };

  Runner.prototype.start = function (runMode, forcedStage) {
    var save = this.runtime.profile;
    this.mode = runMode === 'timeattack' ? 'timeattack' : 'run';
    this.runMode = runMode === 'timeattack' ? 'timeattack' : 'daily';
    this.resetRunData();
    var stage = forcedStage == null ? 0 : clamp(Math.floor(forcedStage), 0, TD.STAGES.length - 1);
    this.distance = TD.STAGES[stage].start;
    this.stageIndex = stage; this.lastStage = stage;
    this.seed = TD.hash(TD.dayKey() * 31 + (this.runMode === 'daily' ? 6073 : 911) + stage * 7919 + save.runs * 13);
    this.rng = TD.rng(this.seed);
    this.nextZ = this.distance + 22;
    this.entities.length = 0; this.actions.length = 0; this.particles.length = 0;
    this.pendingMission = 0;
    this.scene.beginRunVisual(this.runMode, stage);
    this.scene.changeStage(stage, true);
    this.scene.setToast(this.runMode === 'timeattack' ? 'TIME ATTACK' : 'DAILY LINE', TD.STAGES[stage].accent, 1.0);
    this.kit.audio.music(TD.STAGES[stage].music, 500);
    this.spawnAhead();
    this.syncHook();
  };

  Runner.prototype.queueAction = function (action) {
    if (this.mode !== 'run' && this.mode !== 'timeattack') return;
    if (this.actions.length < 10) this.actions.push(action);
  };

  Runner.prototype.acceptAction = function (action) {
    var p = this.player;
    if (action === 'left' || action === 'right') {
      var target = clamp(p.lane + (action === 'left' ? -1 : 1), -1, 1);
      if (target === p.lane && !p.air && p.shiftT <= 0) return;
      if (p.air) { p.bufferedLane = target; return; }
      if (p.shiftT > 0) { p.bufferedLane = target; return; }
      this.startLaneShift(target);
      return;
    }
    if (action === 'up') {
      if (p.air || p.rollT > 0) { p.bufferedVertical = 'up'; return; }
      this.startJump();
      return;
    }
    if (action === 'down') {
      if (p.air) { p.bufferedVertical = 'down'; p.vy = Math.min(p.vy, -this.speed * 0.38); return; }
      this.startRoll();
    }
  };

  Runner.prototype.startLaneShift = function (target) {
    var p = this.player;
    if (target === p.lane) return;
    p.lane = target; p.laneFrom = p.lanePos; p.laneTo = target; p.shiftT = LANE_SHIFT;
    this.lanesChanged++;
    this.bumpMission('lane', 1);
    this.scene.emitBurst(195 + p.lanePos * 62, 655, TD.STAGES[this.stageIndex].accent, 3);
    this.kit.audio.sfx('lane', {volume: 0.45});
  };

  Runner.prototype.startJump = function () {
    var p = this.player;
    p.air = true; p.rollT = 0; p.y = Math.max(0, p.y); p.vy = arcV(this.speed, JUMP_SPAN, JUMP_PEAK); p.grav = arcG(this.speed, JUMP_SPAN, JUMP_PEAK);
    this.scene.emitBurst(195 + p.lanePos * 62, 675, C.cyan, 6);
    this.kit.audio.sfx('vault', {volume: 0.7});
  };

  Runner.prototype.startRoll = function () {
    var p = this.player;
    p.rollT = clamp(7.6 / this.speed, 0.34, 0.9);
    this.scene.emitBurst(195 + p.lanePos * 62, 690, C.gold, 5);
    this.kit.audio.sfx('roll', {volume: 0.7});
  };

  Runner.prototype.launchRamp = function () {
    var p = this.player;
    p.air = true; p.rollT = 0; p.y = 0; p.vy = arcV(this.speed, RAMP_SPAN, RAMP_PEAK); p.grav = arcG(this.speed, RAMP_SPAN, RAMP_PEAK);
    this.ramps++; this.bumpMission('ramp', 1);
    this.scene.setToast('RAMP LAUNCH', C.mint, 0.85);
    this.scene.emitBurst(195 + p.lanePos * 62, 665, C.mint, 14);
    this.kit.juice.shake(4, 120); this.kit.juice.hitStop(45);
    this.kit.audio.sfx('ramp', {volume: 0.8});
  };

  Runner.prototype.step = function (dt) {
    if (this.mode !== 'run' && this.mode !== 'timeattack') return;
    var p = this.player;
    this.simT += dt;
    while (this.actions.length) this.acceptAction(this.actions.shift());
    if (this.runMode === 'timeattack') { this.timeLeft -= dt; if (this.timeLeft <= 0) { this.timeLeft = 0; this.finish('TIME UP'); return; } }
    this.speed = Math.min(SPDMAX, this.speed + SPD_RAMP * dt);
    if (p.boostT > 0) { p.boostT -= dt; }
    var effectiveSpeed = this.speed * (p.boostT > 0 ? 1.22 : 1) * (p.hurtT > 0 ? 0.58 : 1);
    this.distance += effectiveSpeed * dt;
    this.cleanDistance += effectiveSpeed * dt;
    this.distanceSinceHit += effectiveSpeed * dt;
    this.updatePlayer(dt, effectiveSpeed);
    this.spawnAhead();
    this.collide();
    this.prune();
    this.updateParticles(dt);
    if (this.toast.life > 0) this.toast.life -= dt;
    if (p.hurtT > 0) p.hurtT -= dt;
    if (p.invulnT > 0) p.invulnT -= dt;
    if (p.magnetT > 0) p.magnetT -= dt;
    if (p.jetT > 0) { p.jetT -= dt; if (p.jetT <= 0) { p.jetT = 0; p.air = false; p.y = 0; p.vy = 0; } }
    this.bumpMission('distance', Math.floor(this.distance));
    this.bumpMission('score', Math.floor(this.score));
    this.bumpMission('clean', Math.floor(this.cleanDistance));
    this.bumpMission('time', Math.floor(this.simT));
    this.bumpMission('mult', this.multiplier);
    this.bumpMission('health', this.health);
    this.updateStage();
    this.score = Math.floor(this.distance * 10 + this.runTokens * 35 + this.nearScore + this.grindDistance * 5 + this.vaults * 65 + this.rolls * 65);
    this.syncHook();
  };

  Runner.prototype.updatePlayer = function (dt, effectiveSpeed) {
    var p = this.player;
    if (p.shiftT > 0) {
      p.shiftT -= dt;
      var t = 1 - clamp(p.shiftT / LANE_SHIFT, 0, 1);
      p.lanePos = p.laneFrom + (p.laneTo - p.laneFrom) * easeOut(t);
      if (p.shiftT <= 0) { p.lanePos = p.laneTo; p.laneFrom = p.laneTo; if (p.bufferedLane != null && !p.air) { var q = p.bufferedLane; p.bufferedLane = null; this.startLaneShift(q); } }
    }
    if (p.jetT > 0) { p.air = true; p.y = 2.35 + Math.sin(this.simT * 5) * 0.08; p.vy = 0; }
    else if (p.air) {
      p.vy -= p.grav * dt; p.y += p.vy * dt;
      if (p.y <= 0) {
        p.y = 0; p.vy = 0; p.air = false; p.grav = 24;
        this.scene.emitBurst(195 + p.lanePos * 62, 675, '#D7E4F2', 5);
        if (p.bufferedLane != null) { var target = p.bufferedLane; p.bufferedLane = null; this.startLaneShift(target); }
        if (p.bufferedVertical === 'up') { p.bufferedVertical = null; this.startJump(); }
        else if (p.bufferedVertical === 'down') { p.bufferedVertical = null; this.startRoll(); }
      }
    } else { p.phase += effectiveSpeed * dt * 0.82; }
    if (p.rollT > 0) p.rollT = Math.max(0, p.rollT - dt);
    p.grindT = 0; p.grindLane = null;
  };

  Runner.prototype.spawnAhead = function () {
    var guard = 0;
    while (this.nextZ < this.distance + SPAWN_AHEAD && guard++ < 12 && this.entities.length < MAX_ENTITIES - 12) {
      var stage = TD.stageAt(this.nextZ);
      var difficulty = clamp(Math.floor(this.nextZ / 850), 0, 3);
      var options = TD.CHUNKS.filter(function (c) { return c.world.indexOf(stage) >= 0 && c.difficulty <= difficulty && c.difficulty >= Math.max(0, difficulty - 1); });
      if (!options.length) options = TD.CHUNKS.filter(function (c) { return c.world.indexOf(stage) >= 0; });
      var chunk = options[Math.floor(this.rng.f() * options.length) % options.length] || TD.CHUNKS[0];
      for (var r = 0; r < chunk.rows.length; r++) {
        var rr = chunk.rows[r];
        for (var i = 0; i < rr.items.length; i++) {
          var spec = rr.items[i], e = {type: spec.type, lane: spec.lane, y: spec.y == null ? 0 : spec.y, z: this.nextZ + rr.at, dead: false, checked: false, hit: false, power: spec.power || null, stage: stage};
          if (spec.type === 'token') e.value = spec.y > 1.1 ? 2 : 1;
          this.entities.push(e);
        }
      }
      this.nextZ += chunk.len; this.chunkCount++;
      if (this.chunkCount > 2000) break;
    }
  };

  Runner.prototype.updateStage = function () {
    var stage = TD.stageAt(this.distance);
    if (stage === this.stageIndex) return;
    this.stageIndex = stage; this.stageCount = Math.max(this.stageCount, stage + 1);
    this.bumpMission('lines', 1); this.bumpMission('stage', this.stageCount);
    this.scene.changeStage(stage, false);
    this.scene.setToast(TD.STAGES[stage].short + ' LINE', TD.STAGES[stage].accent, 0.9);
    this.kit.audio.music(TD.STAGES[stage].music, 700);
  };

  Runner.prototype.collide = function () {
    var p = this.player, lane = p.lanePos, self = this;
    for (var i = 0; i < this.entities.length; i++) {
      var e = this.entities[i]; if (e.dead) continue;
      var rz = e.z - this.distance;
      if (rz > 3 || rz < -2) continue;
      var laneGap = Math.abs(e.lane - lane);
      if (e.type === 'token') {
        if (rz < 0.7 && rz > -0.75 && (laneGap < 0.52 || (p.magnetT > 0 && laneGap < 1.8))) {
          if (p.magnetT > 0 && laneGap >= 0.52) e.lane += clamp(lane - e.lane, -0.18, 0.18);
          else { e.dead = true; this.collectToken(e); }
        } else if (p.magnetT > 0 && rz < 10 && rz > 0 && laneGap < 1.8) e.lane += clamp(lane - e.lane, -0.08, 0.08);
        continue;
      }
      if (e.type === 'power') {
        if (rz < 0.85 && rz > -0.85 && laneGap < 0.55 && Math.abs(p.y - 0.6) < 2.8) { e.dead = true; this.collectPower(e); }
        continue;
      }
      if (e.type === 'crate') {
        if (rz < 0.8 && rz > -0.8 && laneGap < 0.52) { e.dead = true; this.scene.emitBurst(195 + lane * 62, 645, C.gold, 14); this.scene.setToast('CRATE CRACKED', C.gold, 0.7); this.kit.audio.sfx('crate', {volume: 0.7}); }
        else if (!e.checked && rz < -0.1) { e.checked = true; }
        continue;
      }
      if (e.type === 'rail') {
        if (rz < 0.9 && rz > -0.8 && laneGap < 0.5 && !p.air) { p.grindT += 0.12; p.grindLane = e.lane; this.grindDistance += this.speed * 0.12; this.bumpMission('grind', Math.floor(this.grindDistance)); }
        continue;
      }
      if (e.type === 'ramp') {
        if (rz < 1.0 && rz > -0.9 && laneGap < 0.52 && !e.checked && !p.air) { e.checked = true; e.dead = true; this.launchRamp(); }
        continue;
      }
      if (rz <= 0.7 && !e.checked) {
        e.checked = true;
        var safe = false;
        if (laneGap >= 0.52 && laneGap < 1.25) { this.nearMiss(e); continue; }
        if (laneGap >= 0.52) continue;
        if (e.type === 'train') safe = p.y > 1.22;
        else if (e.type === 'barrier') safe = p.rollT > 0;
        else if (e.type === 'gap') safe = p.y > 0.48 || p.jetT > 0;
        if (safe) {
          // A clean vault over a rail car and a clean roll under a barrier are
          // the two counters the score formula and the vault/roll missions
          // read; nothing ever recorded them.
          if (e.type === 'train') { this.vaults++; this.bumpMission('vault', this.vaults); }
          else if (e.type === 'barrier') { this.rolls++; this.bumpMission('roll', this.rolls); }
          this.nearMiss(e);
        } else this.takeHit(e);
      }
    }
  };

  Runner.prototype.collectToken = function (e) {
    var value = e.value || 1;
    this.runTokens += value; this.tokensInRow++; this.maxTokensInRow = Math.max(this.maxTokensInRow, this.tokensInRow);
    this.multiplier = clamp(1 + Math.floor(this.nearMisses / 3), 1, 5);
    this.bumpMission('tokens', this.runTokens); this.bumpMission('streak', this.maxTokensInRow);
    this.scene.setToast('+' + value + ' TOKEN', value > 1 ? C.cyan : C.gold, 0.5);
    this.scene.emitBurst(195 + e.lane * 62, 640, value > 1 ? C.cyan : C.gold, 8);
    this.kit.audio.sfx('token', {volume: 0.65, rate: value > 1 ? 1.18 : 1});
  };

  Runner.prototype.collectPower = function (e) {
    var p = this.player; this.powers++; this.bumpMission('power', this.powers);
    if (e.power === 'magnet') p.magnetT = 9;
    else if (e.power === 'jetpack') { p.jetT = 7; p.air = true; p.y = 2.35; }
    else if (e.power === 'shield') p.shield = Math.min(2, p.shield + 1);
    else p.boostT = 7;
    this.scene.setToast(e.power.toUpperCase(), e.power === 'shield' ? C.cyan : (e.power === 'jetpack' ? C.mint : C.pink), 0.75);
    this.scene.emitBurst(195 + e.lane * 62, 620, e.power === 'shield' ? C.cyan : C.mint, 13);
    this.kit.juice.shake(2, 80); this.kit.audio.sfx('power', {volume: 0.75});
  };

  Runner.prototype.nearMiss = function (e) {
    this.nearMisses++; this.nearScore += 120 * this.multiplier; this.multiplier = clamp(1 + Math.floor(this.nearMisses / 3), 1, 5);
    this.bumpMission('near', this.nearMisses); this.bumpMission('nearScore', this.nearScore);
    this.scene.nearFlash(); this.scene.setToast('NEAR MISS  x' + this.multiplier, C.cyan, 0.8);
    this.scene.emitBurst(195 + this.player.lanePos * 62, 625, C.cyan, 10);
    this.kit.juice.shake(2, 70); this.kit.audio.sfx('near', {volume: 0.6});
  };

  Runner.prototype.takeHit = function (e) {
    var p = this.player;
    if (p.invulnT > 0) return;
    e.dead = true; this.tokensInRow = 0; this.multiplier = 1;
    if (p.shield > 0) { p.shield--; this.nearShieldUses++; this.bumpMission('shield', this.nearShieldUses); this.scene.setToast('SHIELD SAVE', C.cyan, 0.9); this.scene.emitBurst(195 + p.lanePos * 62, 640, C.cyan, 22); this.kit.audio.sfx('shield', {volume: 0.85}); this.kit.juice.shake(8, 150); this.kit.juice.hitStop(70); return; }
    this.health--; this.stumbles++; this.cleanDistance = 0; this.distanceSinceHit = 0; p.invulnT = 1.0; p.hurtT = 0.75; p.air = false; p.y = 0; p.vy = 0;
    this.scene.damageFlash(); this.scene.emitBurst(195 + p.lanePos * 62, 635, C.red, 24); this.kit.audio.sfx('hit', {volume: 0.9}); this.kit.juice.shake(12, 220); this.kit.juice.hitStop(95);
    this.scene.setToast(this.health > 0 ? 'MISS READ  1 HEART' : 'CAUGHT', C.red, 0.9);
    if (this.health <= 0) this.finish('CAUGHT');
  };

  Runner.prototype.bumpMission = function (kind, value) {
    if (this.mode !== 'run' && this.mode !== 'timeattack') return;
    var ms = this.runtime.profile.missions;
    for (var i = 0; i < ms.length; i++) {
      var m = ms[i], def = TD.missionDef(m.id);
      if (def.kind !== kind) continue;
      var v = Math.max(m.progress, Math.floor(num(value, 0))), goal = TD.missionGoal(m);
      if (v === m.progress) continue;
      m.progress = Math.min(goal, v);
      if (m.progress >= goal) this.completeMission(i);
    }
  };

  Runner.prototype.completeMission = function (index) {
    var ms = this.runtime.profile.missions, old = ms[index], reward = 35 + old.tier * 20;
    this.runTokens += reward; this.pendingMission++;
    var existing = ms.filter(function (_, i) { return i !== index; });
    var seed = TD.hash(this.seed + this.runtime.profile.missionRerolls * 173 + index * 991);
    var replacement = TD.pickMissions(seed, existing)[0]; replacement.tier = Math.min(3, old.tier + 1);
    ms[index] = replacement; this.runtime.profile.missionRerolls++;
    this.runtime.persist();
    this.scene.setToast('MISSION +' + reward, C.mint, 0.9); this.scene.emitBurst(312, 120, C.mint, 16); this.kit.audio.sfx('mission', {volume: 0.8});
  };

  Runner.prototype.prune = function () {
    var keep = [], d = this.distance;
    for (var i = 0; i < this.entities.length; i++) if (!this.entities[i].dead && this.entities[i].z - d > -5) keep.push(this.entities[i]);
    this.entities = keep;
  };

  Runner.prototype.updateParticles = function (dt) {
    for (var i = this.particles.length - 1; i >= 0; i--) {
      var p = this.particles[i]; p.life -= dt; if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 280 * dt;
    }
  };

  Runner.prototype.emitParticle = function (x, y, color) {
    if (this.particles.length >= MAX_FX) this.particles.shift();
    var ang = this.rng ? this.rng.f() * TAU : Math.random() * TAU, speed = 30 + (this.rng ? this.rng.f() : Math.random()) * 100;
    this.particles.push({x: x, y: y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed - 40, life: 0.32 + (this.rng ? this.rng.f() : Math.random()) * 0.45, color: color});
  };

  Runner.prototype.finish = function (reason) {
    if (this.mode !== 'run' && this.mode !== 'timeattack') return;
    this.score = Math.floor(this.distance * 10 + this.runTokens * 35 + this.nearScore + this.grindDistance * 5 + this.vaults * 65 + this.rolls * 65);
    var save = this.runtime.profile;
    save.tokens = Math.min(9999999, save.tokens + this.runTokens);
    save.bestDistance = Math.max(save.bestDistance, Math.floor(this.distance));
    save.bestScore = Math.max(save.bestScore, this.score);
    save.runs++;
    if (this.runMode === 'daily') TD.saveDailyScore(save, this.score, this.distance);
    else save.timeBest = Math.max(save.timeBest, this.score);
    this.runtime.persist();
    this.mode = 'results'; this.resultReason = reason; this.scene.showResults(this); this.kit.audio.sfx('finish', {volume: 0.85});
    this.kit.juice.shake(5, 200); this.kit.juice.hitStop(90); this.syncHook();
  };

  Runner.prototype.syncHook = function () {
    var state = this.runtime.state;
    state.ready = true; state.mode = this.mode; state.runType = this.runMode || 'daily'; state.progress = this.runMode === 'timeattack' ? Math.max(0, 75 - this.timeLeft) : this.distance;
    state.distance = Math.floor(this.distance); state.score = Math.max(0, this.score); state.health = this.health; state.stage = TD.STAGES[this.stageIndex] ? TD.STAGES[this.stageIndex].id : 'yard';
    state.stageIndex = this.stageIndex; state.multiplier = this.multiplier; state.tokens = this.runTokens; state.speed = this.speed; state.forceMode = this.runtime.forceMode; state.forceStage = this.runtime.forceStage;
  };

  function BootScene() { Phaser.Scene.call(this, {key: 'td-boot'}); }
  BootScene.prototype = Object.create(Phaser.Scene.prototype);
  BootScene.prototype.constructor = BootScene;
  BootScene.prototype.create = function () {
    this.runtime = TD.runtime;
    TD.Art.bake(this);
    this.runtime.ready = true;
    this.runtime.kit.loader.progress(1);
    this.scene.start('td-play');
  };

  function PlayScene() { Phaser.Scene.call(this, {key: 'td-play'}); }
  PlayScene.prototype = Object.create(Phaser.Scene.prototype);
  PlayScene.prototype.constructor = PlayScene;

  PlayScene.prototype.create = function () {
    this.runtime = TD.runtime;
    var self = this, r = this.runtime;
    this.runtime.scene = this;
    this.accumulator = 0; this.visualT = 0; this.nearT = 0; this.damageT = 0; this.stageFade = 0;
    this.entityViews = []; this.decorViews = []; this.markViews = []; this.fxViews = [];
    this.buildWorld(); this.buildHud(); this.buildMenu(); this.buildResults(); this.buildPause(); this.buildGarage(); this.buildMissions();
    this.runner = new Runner(this, r.kit, r);
    // The toast banner is one object shared by view and sim: setToast/syncHud
    // read it here, Runner.step ages it. The scene never had its own field, so
    // every setToast and every syncHud threw on `this.toast.life`.
    this.toast = this.runner.toast;
    this.runner.syncHook();
    r.kit.loader.hide();
    this.drawScreen();
    if (r.initialMode) this.startRun(r.initialMode, r.forceStage);
    if (r.forceMode === 'menu') this.runner.mode = 'menu';
    this.scale.on('resize', function () { self.layout(); });
    this.layout();
  };

  PlayScene.prototype.buildWorld = function () {
    this.bg = this.add.image(195, 422, 'td-bg-yard').setDisplaySize(390, 844).setDepth(0);
    this.tintWash = this.add.rectangle(195, 422, 390, 844, 0x000000, 0).setDepth(2);
    for (var i = 0; i < 20; i++) this.markViews.push(this.add.rectangle(195, 0, 4, 18, 0xffffff, 0.14).setDepth(18));
    for (var j = 0; j < 16; j++) this.decorViews.push(this.add.image(0, 0, 'td-sign').setDepth(12).setVisible(false));
    for (var e = 0; e < MAX_ENTITIES; e++) this.entityViews.push(this.add.image(0, 0, 'td-token').setDepth(40).setVisible(false));
    this.shadow = this.add.image(195, 690, 'td-shadow').setDisplaySize(112, 30).setDepth(45);
    this.playerView = this.add.image(195, 620, 'td-char-mara').setDisplaySize(72, 108).setDepth(50);
    for (var p = 0; p < MAX_FX; p++) this.fxViews.push(this.add.image(0, 0, 'td-spark').setDepth(70).setVisible(false));
    this.damageOverlay = this.add.rectangle(195, 430, 374, 772, tint(C.red), 0).setDepth(73);
    this.nearBorder = this.add.rectangle(195, 430, 374, 772, 0x63e4ff, 0).setDepth(72);
    this.nearBorder.setStrokeStyle(4, tint(C.cyan), 1);
  };

  PlayScene.prototype.buildHud = function () {
    this.hudPlate = this.add.rectangle(195, 52, 374, 76, tint(C.deep), 0.82).setDepth(100);
    this.hudLine = this.add.rectangle(195, 91, 350, 1, tint(C.line), 0.85).setDepth(101);
    this.scoreText = this.add.text(18, 22, '◆ 00000', {fontFamily: TD.FONT, fontSize: '22px', fontStyle: '700', color: C.ink}).setDepth(102);
    this.distText = this.add.text(18, 56, '↕ 000 m', {fontFamily: TD.FONT, fontSize: '16px', fontStyle: '700', color: C.muted}).setDepth(102);
    this.multText = this.add.text(190, 28, 'x1', {fontFamily: TD.FONT, fontSize: '20px', fontStyle: '700', color: C.gold}).setOrigin(0.5, 0).setDepth(102);
    this.healthText = this.add.text(260, 28, '♥♥', {fontFamily: TD.FONT, fontSize: '20px', fontStyle: '700', color: C.red}).setOrigin(0, 0).setDepth(102);
    this.stageText = this.add.text(190, 59, 'YARD', {fontFamily: TD.FONT, fontSize: '14px', fontStyle: '700', color: C.cyan}).setOrigin(0.5, 0).setDepth(102);
    this.pausePlate = this.add.rectangle(350, 52, 48, 48, tint(C.panel2), 1).setDepth(103);
    this.pauseText = this.add.text(350, 52, 'Ⅱ', {fontFamily: TD.FONT, fontSize: '21px', fontStyle: '700', color: C.ink}).setOrigin(0.5).setDepth(104);
    this.toastPlate = this.add.rectangle(308, 142, 146, 36, tint(C.panel), 0.94).setDepth(105).setVisible(false);
    this.toastText = this.add.text(308, 142, '', {fontFamily: TD.FONT, fontSize: '14px', fontStyle: '700', color: C.cyan, align: 'center', wordWrap: {width: 132}}).setOrigin(0.5).setDepth(106).setVisible(false);
    this.coachPlate = this.add.rectangle(195, 112, 350, 28, tint(C.deep), 0.48).setDepth(104);
    this.coachText = this.add.text(195, 112, 'SWIPE LANE  /  UP VAULT  /  DOWN ROLL', {fontFamily: TD.FONT, fontSize: '14px', fontStyle: '700', color: C.muted, align: 'center'}).setOrigin(0.5).setDepth(105);
  };

  PlayScene.prototype.makeButton = function (x, y, w, h, label, color) {
    var plate = this.add.rectangle(x, y, w, h, tint(C.panel2), 0.98).setDepth(210);
    plate.setStrokeStyle(2, tint(color || C.line), 0.9);
    var t = this.add.text(x, y, label, {fontFamily: TD.FONT, fontSize: '16px', fontStyle: '700', color: color || C.ink, align: 'center', wordWrap: {width: w - 18}}).setOrigin(0.5).setDepth(211);
    return {plate: plate, text: t, x: x, y: y, w: w, h: h};
  };

  PlayScene.prototype.buildMenu = function () {
    this.menuShade = this.add.rectangle(195, 422, 390, 844, tint(C.deep), 0.26).setDepth(180);
    this.menuPanel = this.add.rectangle(195, 464, 344, 674, tint(C.panel), 0.96).setDepth(181);
    this.menuPanel.setStrokeStyle(2, tint(C.line), 0.9);
    this.menuTransit = this.add.text(195, 92, 'TRANSIT', {fontFamily: TD.FONT, fontSize: '43px', fontStyle: '800', color: C.gold}).setOrigin(0.5).setDepth(182);
    this.menuDash = this.add.text(195, 138, 'DASH', {fontFamily: TD.FONT, fontSize: '43px', fontStyle: '800', color: C.cyan}).setOrigin(0.5).setDepth(182);
    this.menuTag = this.add.text(195, 184, 'FLEET F17  /  THREE LANES', {fontFamily: TD.FONT, fontSize: '14px', fontStyle: '700', color: C.muted}).setOrigin(0.5).setDepth(182);
    this.menuBest = this.add.text(195, 233, '', {fontFamily: TD.FONT, fontSize: '15px', fontStyle: '700', color: C.ink, align: 'center'}).setOrigin(0.5).setDepth(182);
    this.menuButtons = [
      this.makeButton(195, 300, 282, 54, 'DAILY LINE', C.gold),
      this.makeButton(195, 365, 282, 54, 'TIME ATTACK', C.cyan),
      this.makeButton(195, 430, 282, 54, 'GARAGE', C.violet),
      this.makeButton(195, 495, 282, 54, 'MISSIONS', C.mint)
    ];
    this.dailyTitle = this.add.text(195, 552, 'DAILY PERSONAL BEST', {fontFamily: TD.FONT, fontSize: '14px', fontStyle: '700', color: C.muted}).setOrigin(0.5).setDepth(182);
    this.dailyText = this.add.text(195, 580, '', {fontFamily: TD.FONT, fontSize: '15px', fontStyle: '700', color: C.ink, align: 'center', lineSpacing: 7}).setOrigin(0.5, 0).setDepth(182);
    this.menuHint = this.add.text(195, 740, 'TOKENS EARN EVERYTHING', {fontFamily: TD.FONT, fontSize: '14px', fontStyle: '700', color: C.gold}).setOrigin(0.5).setDepth(182);
  };

  PlayScene.prototype.buildResults = function () {
    this.resultShade = this.add.rectangle(195, 422, 390, 844, tint(C.deep), 0.82).setDepth(260).setVisible(false);
    this.resultPanel = this.add.rectangle(195, 400, 330, 510, tint(C.panel), 0.98).setDepth(261).setVisible(false); this.resultPanel.setStrokeStyle(2, tint(C.gold), 0.95);
    this.resultTitle = this.add.text(195, 214, 'RUN OVER', {fontFamily: TD.FONT, fontSize: '31px', fontStyle: '800', color: C.gold}).setOrigin(0.5).setDepth(262).setVisible(false);
    this.resultStats = this.add.text(195, 277, '', {fontFamily: TD.FONT, fontSize: '18px', fontStyle: '700', color: C.ink, align: 'center', lineSpacing: 10}).setOrigin(0.5, 0).setDepth(262).setVisible(false);
    this.resultDaily = this.add.text(195, 435, '', {fontFamily: TD.FONT, fontSize: '15px', fontStyle: '700', color: C.muted, align: 'center', lineSpacing: 7}).setOrigin(0.5, 0).setDepth(262).setVisible(false);
    this.resultAgain = this.makeButton(195, 575, 270, 54, 'RUN AGAIN', C.cyan);
    this.resultHome = this.makeButton(195, 640, 270, 54, 'DEPOT', C.muted);
    this.resultAgain.plate.setDepth(263); this.resultAgain.text.setDepth(264); this.resultHome.plate.setDepth(263); this.resultHome.text.setDepth(264);
    this.setGroupVisible([this.resultAgain, this.resultHome], false);
  };

  PlayScene.prototype.buildPause = function () {
    this.pauseShade = this.add.rectangle(195, 422, 390, 844, tint(C.deep), 0.78).setDepth(220).setVisible(false);
    this.pausePanel = this.add.rectangle(195, 414, 316, 350, tint(C.panel), 0.98).setDepth(221).setVisible(false); this.pausePanel.setStrokeStyle(2, tint(C.cyan), 0.9);
    this.pauseTitle = this.add.text(195, 278, 'PAUSED', {fontFamily: TD.FONT, fontSize: '30px', fontStyle: '800', color: C.cyan}).setOrigin(0.5).setDepth(222).setVisible(false);
    this.pauseResume = this.makeButton(195, 375, 260, 54, 'RESUME', C.mint);
    this.pauseRestart = this.makeButton(195, 440, 260, 54, 'RESTART', C.gold);
    this.pauseHome = this.makeButton(195, 505, 260, 54, 'END RUN', C.muted);
    this.setGroupVisible([this.pauseResume, this.pauseRestart, this.pauseHome], false);
  };

  PlayScene.prototype.buildGarage = function () {
    this.garageShade = this.add.rectangle(195, 422, 390, 844, tint(C.deep), 0.75).setDepth(230).setVisible(false);
    this.garagePanel = this.add.rectangle(195, 422, 340, 650, tint(C.panel), 0.98).setDepth(231).setVisible(false); this.garagePanel.setStrokeStyle(2, tint(C.violet), 0.9);
    this.garageTitle = this.add.text(195, 123, 'GARAGE', {fontFamily: TD.FONT, fontSize: '30px', fontStyle: '800', color: C.violet}).setOrigin(0.5).setDepth(232).setVisible(false);
    this.garageTokens = this.add.text(195, 170, '', {fontFamily: TD.FONT, fontSize: '16px', fontStyle: '700', color: C.gold}).setOrigin(0.5).setDepth(232).setVisible(false);
    this.garageChar = this.add.text(195, 282, '', {fontFamily: TD.FONT, fontSize: '20px', fontStyle: '800', color: C.ink, align: 'center'}).setOrigin(0.5).setDepth(232).setVisible(false);
    this.garageBoard = this.add.text(195, 428, '', {fontFamily: TD.FONT, fontSize: '20px', fontStyle: '800', color: C.ink, align: 'center'}).setOrigin(0.5).setDepth(232).setVisible(false);
    this.garageInfo = this.add.text(195, 480, '', {fontFamily: TD.FONT, fontSize: '14px', fontStyle: '700', color: C.muted, align: 'center', lineSpacing: 7}).setOrigin(0.5).setDepth(232).setVisible(false);
    this.garagePrev = this.makeButton(105, 220, 56, 48, '‹', C.cyan); this.garageNext = this.makeButton(285, 220, 56, 48, '›', C.cyan);
    this.garageBoardPrev = this.makeButton(105, 365, 56, 48, '‹', C.cyan); this.garageBoardNext = this.makeButton(285, 365, 56, 48, '›', C.cyan);
    this.garageUnlock = this.makeButton(195, 560, 250, 54, 'SELECT', C.mint); this.garageBack = this.makeButton(195, 630, 250, 54, 'BACK', C.muted);
    this.setGroupVisible([this.garagePrev, this.garageNext, this.garageBoardPrev, this.garageBoardNext, this.garageUnlock, this.garageBack], false);
  };

  PlayScene.prototype.buildMissions = function () {
    this.missionShade = this.add.rectangle(195, 422, 390, 844, tint(C.deep), 0.76).setDepth(235).setVisible(false);
    this.missionPanel = this.add.rectangle(195, 422, 342, 630, tint(C.panel), 0.98).setDepth(236).setVisible(false); this.missionPanel.setStrokeStyle(2, tint(C.mint), 0.9);
    this.missionTitle = this.add.text(195, 130, 'MISSION BOARD', {fontFamily: TD.FONT, fontSize: '27px', fontStyle: '800', color: C.mint}).setOrigin(0.5).setDepth(237).setVisible(false);
    this.missionRows = [];
    for (var i = 0; i < 3; i++) {
      var plate = this.add.rectangle(195, 255 + i * 112, 292, 90, tint(C.panel2), 1).setDepth(237).setVisible(false);
      var t = this.add.text(55, 228 + i * 112, '', {fontFamily: TD.FONT, fontSize: '14px', fontStyle: '700', color: C.ink, wordWrap: {width: 270}}).setDepth(238).setVisible(false);
      var bar = this.add.rectangle(195, 305 + i * 112, 260, 6, tint(C.line), 1).setOrigin(0.5).setDepth(238).setVisible(false);
      var fill = this.add.rectangle(65, 305 + i * 112, 1, 6, tint(C.mint), 1).setOrigin(0, 0.5).setDepth(239).setVisible(false);
      this.missionRows.push({plate: plate, text: t, bar: bar, fill: fill});
    }
    this.missionBack = this.makeButton(195, 630, 250, 54, 'BACK', C.muted); this.missionBack.plate.setDepth(238); this.missionBack.text.setDepth(239); this.setGroupVisible([this.missionBack], false);
  };

  PlayScene.prototype.setGroupVisible = function (group, visible) { for (var i = 0; i < group.length; i++) { group[i].plate.setVisible(visible); group[i].text.setVisible(visible); } };
  PlayScene.prototype.layout = function () { /* FIT owns the safe-area canvas; virtual coordinates remain stable. */ };

  PlayScene.prototype.beginRunVisual = function (runMode) {
    this.hideMenu(); this.hideGarage(); this.hideMissions(); this.hideResults(); this.setGroupVisible([this.pauseResume, this.pauseRestart, this.pauseHome], false);
    this.coachPlate.setVisible(true); this.coachText.setVisible(true); this.coachText.setAlpha(1);
    this.coachT = 3.2; this.resultRunMode = runMode;
  };

  PlayScene.prototype.changeStage = function (stageIndex, first) {
    var st = TD.STAGES[stageIndex] || TD.STAGES[0];
    this.bg.setTexture('td-bg-' + st.id); this.bg.setDisplaySize(390, 844); this.stageFade = first ? 0 : 1;
    this.stageIndex = stageIndex; TD.fillIfChanged(this.tintWash, st.accent, first ? 0 : 0.14);
    this.stageText.setText(st.short); this.stageText.setColor(st.accent);
  };

  PlayScene.prototype.setToast = function (message, color, life) {
    this.toastText.setText(String(message)); this.toastText.setColor(color || C.cyan); this.toastPlate.setFillStyle(tint(C.panel), 0.94); this.toast.life = life == null ? 0.9 : life; this.toast.max = this.toast.life; this.toast.text = String(message); this.toast.color = color || C.cyan;
    this.toastPlate.setVisible(true); this.toastText.setVisible(true); this.toastText.setAlpha(1);
  };
  PlayScene.prototype.nearFlash = function () { this.nearT = (TD.REDUCED || this.runtime.kit.juice.enabled === false) ? 0.2 : 0.42; };
  PlayScene.prototype.damageFlash = function () { this.damageT = (TD.REDUCED || this.runtime.kit.juice.enabled === false) ? 0.22 : 0.55; };
  PlayScene.prototype.emitBurst = function (x, y, color, count) {
    if (!this.runner) return;
    var n = (TD.REDUCED || this.runtime.kit.juice.enabled === false) ? Math.max(2, Math.floor(count * 0.35)) : count;
    for (var i = 0; i < n; i++) this.runner.emitParticle(x, y, color);
  };

  PlayScene.prototype.startRun = function (mode, forcedStage) { this.runner.start(mode, forcedStage); };
  PlayScene.prototype.showResults = function (runner) {
    this.resultTitle.setText(runner.resultReason || 'RUN OVER');
    this.resultStats.setText('◆ ' + runner.score + '\n↕ ' + Math.floor(runner.distance) + ' m\n' + '♥ ' + runner.health + '   x' + runner.multiplier + '\n+' + runner.runTokens + ' TOKENS');
    var d = runner.runtime.profile.daily, lines = ['DAILY BOARD']; for (var i = 0; i < Math.min(3, d.length); i++) lines.push((i + 1) + '  ' + d[i].score + '  /  ' + d[i].distance + 'm');
    this.resultDaily.setText(lines.join('\n'));
    this.resultShade.setVisible(true); this.resultPanel.setVisible(true); this.resultTitle.setVisible(true); this.resultStats.setVisible(true); this.resultDaily.setVisible(true); this.setGroupVisible([this.resultAgain, this.resultHome], true);
  };
  PlayScene.prototype.hideResults = function () { this.resultShade.setVisible(false); this.resultPanel.setVisible(false); this.resultTitle.setVisible(false); this.resultStats.setVisible(false); this.resultDaily.setVisible(false); this.setGroupVisible([this.resultAgain, this.resultHome], false); };
  PlayScene.prototype.hideMenu = function () { this.menuShade.setVisible(false); this.menuPanel.setVisible(false); this.menuTransit.setVisible(false); this.menuDash.setVisible(false); this.menuTag.setVisible(false); this.menuBest.setVisible(false); this.dailyTitle.setVisible(false); this.dailyText.setVisible(false); this.menuHint.setVisible(false); this.setGroupVisible(this.menuButtons, false); };
  PlayScene.prototype.showMenu = function () { this.hideResults(); this.hideGarage(); this.hideMissions(); this.menuShade.setVisible(true); this.menuPanel.setVisible(true); this.menuTransit.setVisible(true); this.menuDash.setVisible(true); this.menuTag.setVisible(true); this.menuBest.setVisible(true); this.dailyTitle.setVisible(true); this.dailyText.setVisible(true); this.menuHint.setVisible(true); this.setGroupVisible(this.menuButtons, true); this.drawMenu(); };
  PlayScene.prototype.hideGarage = function () { this.garageShade.setVisible(false); this.garagePanel.setVisible(false); this.garageTitle.setVisible(false); this.garageTokens.setVisible(false); this.garageChar.setVisible(false); this.garageBoard.setVisible(false); this.garageInfo.setVisible(false); this.setGroupVisible([this.garagePrev, this.garageNext, this.garageBoardPrev, this.garageBoardNext, this.garageUnlock, this.garageBack], false); };
  PlayScene.prototype.hideMissions = function () { this.missionShade.setVisible(false); this.missionPanel.setVisible(false); this.missionTitle.setVisible(false); for (var i = 0; i < this.missionRows.length; i++) { var r = this.missionRows[i]; r.plate.setVisible(false); r.text.setVisible(false); r.bar.setVisible(false); r.fill.setVisible(false); } this.setGroupVisible([this.missionBack], false); };
  PlayScene.prototype.drawMenu = function () {
    var s = this.runtime.profile, lines = [];
    this.menuBest.setText('◆ ' + s.tokens + ' TOKENS    BEST ' + s.bestDistance + 'm');
    if (!s.daily.length) lines.push('NO RUNS YET'); else for (var i = 0; i < Math.min(3, s.daily.length); i++) lines.push((i + 1) + '   ' + s.daily[i].score + '   ' + s.daily[i].distance + 'm');
    this.dailyText.setText(lines.join('\n'));
  };

  PlayScene.prototype.drawGarage = function () {
    var s = this.runtime.profile, chars = TD.CHARACTERS, boards = TD.BOARDS;
    this.garageTokens.setText('◆ ' + s.tokens + ' TOKENS');
    var ci = Math.max(0, chars.findIndex(function (c) { return c.id === s.selectedCharacter; }));
    var bi = Math.max(0, boards.findIndex(function (b) { return b.id === s.selectedBoard; }));
    this.runtime.garageCharIndex = this.runtime.garageCharIndex == null ? ci : this.runtime.garageCharIndex;
    this.runtime.garageBoardIndex = this.runtime.garageBoardIndex == null ? bi : this.runtime.garageBoardIndex;
    var ch = chars[clamp(this.runtime.garageCharIndex, 0, chars.length - 1)], b = boards[clamp(this.runtime.garageBoardIndex, 0, boards.length - 1)];
    this.garageChar.setText('RUNNER  /  ' + ch.name + '\n' + ch.role); this.garageChar.setColor(ch.color);
    this.garageBoard.setText('BOARD  /  ' + b.name); this.garageBoard.setColor(b.color); this.garageInfo.setText(b.trait + '\n' + (s.characters[this.runtime.garageCharIndex] ? 'UNLOCKED' : '◆ ' + ch.cost) + '     ' + (s.boards[this.runtime.garageBoardIndex] ? 'UNLOCKED' : '◆ ' + b.cost));
    var unlocked = s.characters[this.runtime.garageCharIndex] && s.boards[this.runtime.garageBoardIndex];
    this.garageUnlock.text.setText(unlocked ? 'SELECT LOADOUT' : 'UNLOCK WITH TOKENS'); this.garageUnlock.text.setColor(unlocked ? C.mint : C.gold);
  };

  PlayScene.prototype.showGarage = function () { this.hideMenu(); this.hideMissions(); this.hideResults(); this.garageShade.setVisible(true); this.garagePanel.setVisible(true); this.garageTitle.setVisible(true); this.garageTokens.setVisible(true); this.garageChar.setVisible(true); this.garageBoard.setVisible(true); this.garageInfo.setVisible(true); this.setGroupVisible([this.garagePrev, this.garageNext, this.garageBoardPrev, this.garageBoardNext, this.garageUnlock, this.garageBack], true); this.drawGarage(); };

  PlayScene.prototype.showMissions = function () {
    this.hideMenu(); this.hideGarage(); this.hideResults(); this.missionShade.setVisible(true); this.missionPanel.setVisible(true); this.missionTitle.setVisible(true); this.setGroupVisible([this.missionBack], true);
    var ms = this.runtime.profile.missions;
    for (var i = 0; i < 3; i++) { var m = ms[i], row = this.missionRows[i], goal = TD.missionGoal(m), pct = clamp(m.progress / goal, 0, 1); row.plate.setVisible(true); row.text.setVisible(true); row.bar.setVisible(true); row.fill.setVisible(true); row.text.setText(TD.missionText(m) + '\n' + Math.min(m.progress, goal) + ' / ' + goal); row.fill.width = 260 * pct; }
  };

  PlayScene.prototype.pauseVisual = function (on) {
    this.pauseShade.setVisible(on); this.pausePanel.setVisible(on); this.pauseTitle.setVisible(on); this.setGroupVisible([this.pauseResume, this.pauseRestart, this.pauseHome], on);
  };

  PlayScene.prototype.drawScreen = function () {
    if (this.runner.mode === 'menu') this.showMenu();
    this.pauseVisual(this.runtime.kit.paused);
  };

  PlayScene.prototype.syncWorld = function () {
    var runner = this.runner, p = runner.player, dist = runner.distance, st = TD.STAGES[runner.stageIndex] || TD.STAGES[0];
    this.bg.setTexture('td-bg-' + st.id); this.bg.setDisplaySize(390, 844);
    this.shadow.setPosition(195 + p.lanePos * 62, 696).setAlpha(clamp(0.46 - p.y * 0.08, 0.12, 0.46));
    this.playerView.setTexture('td-char-' + (this.runtime.profile.selectedCharacter || 'mara')).setPosition(195 + p.lanePos * 62, 650 - p.y * 65).setDisplaySize(p.rollT > 0 ? 88 : 72, p.rollT > 0 ? 56 : 108).setAlpha(p.invulnT > 0 && Math.floor(runner.simT * 18) % 2 ? 0.32 : 1);
    this.playerView.setRotation(clamp((p.laneTo - p.laneFrom) * 0.18, -0.3, 0.3));
    var active = runner.entities.slice().filter(function (e) { return !e.dead && e.z - dist < 110 && e.z - dist > -4; }).sort(function (a, b) { return b.z - dist - (a.z - dist); });
    for (var i = 0; i < this.entityViews.length; i++) this.entityViews[i].setVisible(false);
    for (var j = 0; j < active.length && j < this.entityViews.length; j++) {
      var e = active[j], view = this.entityViews[j], rz = e.z - dist, t = clamp(1 - rz / 116, 0.12, 1.15), x = 195 + e.lane * 62 * t, y = 305 + 355 * t;
      var key = e.type === 'token' ? (e.value > 1 ? 'td-token-blue' : 'td-token') : e.type === 'power' ? 'td-power-' + (e.power || 'boost') : 'td-' + e.type;
      if (!this.textures.exists(key)) key = 'td-token';
      view.setTexture(key).setVisible(true).setPosition(x, y - e.y * 34 * t).setScale((0.32 + t * 0.74) * (e.type === 'token' ? 0.8 : 1));
      view.setAlpha(rz < 1 ? 1 : clamp(0.35 + t, 0, 1));
      if (e.type === 'token' || e.type === 'power') view.setRotation(runner.simT * (e.type === 'power' ? 1.7 : 3.4)); else view.setRotation(0);
    }
    var worldZ = Math.floor(dist / 76) * 76;
    for (var d = 0; d < this.decorViews.length; d++) {
      var wz = worldZ + d * 76, dr = wz - dist, dt = clamp(1 - dr / 190, 0.12, 0.95), side = d % 2 ? -1 : 1, dx = 195 + side * (120 + (d % 3) * 30) * dt, dy = 282 + dt * 215;
      var tex = st.life === 'birds' && d < 4 ? 'td-bird' : st.life === 'crowd' && d % 3 === 0 ? 'td-crowd' : d % 5 === 0 ? 'td-ferry' : (d % 2 ? 'td-sign' : 'td-train');
      this.decorViews[d].setTexture(tex).setVisible(true).setPosition(dx, dy + Math.sin(runner.simT * 1.4 + d) * (tex === 'td-bird' ? 8 : 0)).setScale(dt * (tex === 'td-train' ? 0.38 : tex === 'td-ferry' ? 0.54 : tex === 'td-crowd' ? 0.46 : 0.42)).setAlpha(0.35 + dt * 0.55);
    }
    for (var m = 0; m < this.markViews.length; m++) {
      var mr = ((m + Math.floor(dist / 8)) % this.markViews.length) * 8 - (dist % 8), mt = clamp(1 - mr / 116, 0.12, 1), my = 342 + mt * 420;
      this.markViews[m].setPosition(195, my).setScale(0.6 + mt * 2.1, 0.7 + mt * 1.6).setFillStyle(tint(st.accent), 0.12 + mt * 0.16).setVisible(true);
    }
    for (var f = 0; f < this.fxViews.length; f++) this.fxViews[f].setVisible(false);
    for (var q = 0; q < runner.particles.length && q < this.fxViews.length; q++) { var fx = runner.particles[q], iv = this.fxViews[q]; iv.setVisible(true).setPosition(fx.x, fx.y).setTint(tint(fx.color)).setAlpha(clamp(fx.life * 2, 0, 1)).setScale(0.4 + fx.life * 0.9); }
    var ju = this.juiceFrame || {dx: 0, dy: 0}; this.tintWash.setPosition(195 + ju.dx, 422 + ju.dy); this.damageOverlay.setPosition(195 + ju.dx, 422 + ju.dy).setAlpha(this.damageT > 0 ? this.damageT * 0.42 : 0); this.nearBorder.setAlpha(this.nearT > 0 ? this.nearT * 1.6 : 0);
  };

  PlayScene.prototype.syncHud = function () {
    var r = this.runner, p = r.player, st = TD.STAGES[r.stageIndex] || TD.STAGES[0];
    TD.textIfChanged(this.scoreText, '◆ ' + String(r.score).padStart(5, '0'));
    TD.textIfChanged(this.distText, r.runMode === 'timeattack' ? '◷ ' + Math.ceil(r.timeLeft) + ' s' : '↕ ' + Math.floor(r.distance) + ' m');
    TD.textIfChanged(this.multText, 'x' + r.multiplier, r.multiplier > 1 ? C.mint : C.gold);
    TD.textIfChanged(this.healthText, '♥'.repeat(Math.max(0, r.health)) + (p.shield ? ' ◇' : ''), r.health > 1 ? C.red : C.orange);
    TD.textIfChanged(this.stageText, r.runMode === 'timeattack' ? 'SPRINT  /  ' + st.short : st.short, st.accent);
    if (this.toast.life > 0) { this.toastPlate.setVisible(true); this.toastText.setVisible(true); var a = clamp(this.toast.life / Math.min(this.toast.max, 0.22), 0, 1); this.toastText.setAlpha(Math.min(1, this.toast.life < 0.22 ? a : 1)); } else { this.toastPlate.setVisible(false); this.toastText.setVisible(false); }
    if (this.coachT > 0) { this.coachT -= STEP; this.coachText.setAlpha(clamp(this.coachT / 0.8, 0, 1)); if (this.coachT <= 0) { this.coachPlate.setVisible(false); this.coachText.setVisible(false); } }
  };

  PlayScene.prototype.update = function (time, delta) {
    var dt = clamp(num(delta, 16.67) / 1000, 0, 0.1), r = this.runner;
    this.juiceFrame = this.runtime.kit.juice.frame();
    if (!this.runtime.kit.paused) {
      this.accumulator += dt; var steps = 0;
      while (this.accumulator >= STEP && steps++ < MAX_STEPS) { if (!this.juiceFrame.frozen) { this.readKeyboard(); r.step(STEP); } this.accumulator -= STEP; }
      if (steps >= MAX_STEPS) this.accumulator = 0;
      this.visualT += dt; this.nearT = Math.max(0, this.nearT - dt * 3.2); this.damageT = Math.max(0, this.damageT - dt * 2.6);
    } else { this.accumulator = 0; }
    this.syncWorld(); this.syncHud(); this.pauseVisual(this.runtime.kit.paused);
    if (r.mode === 'menu') this.drawMenu();
    r.syncHook();
  };

  PlayScene.prototype.readKeyboard = function () {
    var k = this.runtime.kit.input, codes = ['ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD', 'ArrowUp', 'KeyW', 'Space', 'ArrowDown', 'KeyS', 'KeyP', 'Escape', 'KeyR', 'KeyM', 'Enter'];
    for (var i = 0; i < codes.length; i++) { var code = codes[i], down = k.keyDown(code), was = !!this.runtime.keyPrev[code]; this.runtime.keyPrev[code] = down; if (!down || was) continue;
      if (code === 'ArrowLeft' || code === 'KeyA') this.runner.queueAction('left');
      else if (code === 'ArrowRight' || code === 'KeyD') this.runner.queueAction('right');
      else if (code === 'ArrowUp' || code === 'KeyW' || code === 'Space') this.runner.queueAction('up');
      else if (code === 'ArrowDown' || code === 'KeyS') this.runner.queueAction('down');
      else if (code === 'KeyP' || code === 'Escape') this.handlePauseTap();
      else if (code === 'KeyR') this.runtime.kit.restart();
      else if (code === 'KeyM') this.runtime.kit.audio.setMute(!this.runtime.kit.audio.prefs.mute);
      else if (code === 'Enter' && this.runner.mode === 'menu') this.startRun('daily');
    }
  };

  PlayScene.prototype.handlePauseTap = function () { if (this.runner.mode === 'run' || this.runner.mode === 'timeattack') this.runtime.kit.pause('manual'); };

  PlayScene.prototype.handleTap = function (x, y) {
    var r = this.runner, rt = this.runtime;
    function hit(b) { return x >= b.x - b.w / 2 && x <= b.x + b.w / 2 && y >= b.y - b.h / 2 && y <= b.y + b.h / 2; }
    if (rt.kit.paused) {
      if (hit(this.pauseResume)) { rt.kit.resume('manual'); return true; }
      if (hit(this.pauseRestart)) { rt.kit.restart(); rt.kit.resume('manual'); return true; }
      if (hit(this.pauseHome)) { rt.kit.resume('manual'); r.finish('END RUN'); return true; }
      return false;
    }
    if (r.mode === 'run' || r.mode === 'timeattack') { if (hit({x: 350, y: 52, w: 54, h: 54})) { this.handlePauseTap(); return true; } return false; }
    if (r.mode === 'results') {
      if (hit(this.resultAgain)) { this.startRun(r.runMode, rt.forceStage); return true; }
      if (hit(this.resultHome)) { r.mode = 'menu'; this.showMenu(); r.syncHook(); return true; }
      return false;
    }
    if (rt.screen === 'garage') {
      if (hit(this.garageBack)) { rt.screen = 'menu'; this.showMenu(); return true; }
      if (hit(this.garagePrev)) { rt.garageCharIndex = (rt.garageCharIndex + TD.CHARACTERS.length - 1) % TD.CHARACTERS.length; this.drawGarage(); return true; }
      if (hit(this.garageNext)) { rt.garageCharIndex = (rt.garageCharIndex + 1) % TD.CHARACTERS.length; this.drawGarage(); return true; }
      if (hit(this.garageBoardPrev)) { rt.garageBoardIndex = (rt.garageBoardIndex + TD.BOARDS.length - 1) % TD.BOARDS.length; this.drawGarage(); return true; }
      if (hit(this.garageBoardNext)) { rt.garageBoardIndex = (rt.garageBoardIndex + 1) % TD.BOARDS.length; this.drawGarage(); return true; }
      if (hit(this.garageUnlock)) { this.selectGarage(); return true; }
      return false;
    }
    if (rt.screen === 'missions') { if (hit(this.missionBack)) { rt.screen = 'menu'; this.showMenu(); return true; } return false; }
    if (hit(this.menuButtons[0])) { rt.screen = 'play'; this.startRun('daily', rt.forceStage); return true; }
    if (hit(this.menuButtons[1])) { rt.screen = 'play'; this.startRun('timeattack', rt.forceStage); return true; }
    if (hit(this.menuButtons[2])) { rt.screen = 'garage'; this.showGarage(); return true; }
    if (hit(this.menuButtons[3])) { rt.screen = 'missions'; this.showMissions(); return true; }
    return false;
  };

  PlayScene.prototype.selectGarage = function () {
    var s = this.runtime.profile, ci = this.runtime.garageCharIndex, bi = this.runtime.garageBoardIndex, ch = TD.CHARACTERS[ci], b = TD.BOARDS[bi];
    var cost = (!s.characters[ci] ? ch.cost : 0) + (!s.boards[bi] ? b.cost : 0);
    if (cost > 0) { if (s.tokens < cost) { this.setToast('MORE TOKENS', C.gold, 0.8); return; } s.tokens -= cost; s.characters[ci] = true; s.boards[bi] = true; this.runtime.persist(); this.setToast('LOADOUT UNLOCKED', C.mint, 0.9); }
    s.selectedCharacter = ch.id; s.selectedBoard = b.id; this.runtime.persist(); this.drawGarage();
  };

  PlayScene.prototype.forceMode = function (mode, stage) {
    this.runtime.forceMode = mode; if (stage != null) this.runtime.forceStage = stage;
    if (mode === 'run' || mode === 'daily' || mode === 'play') { this.runtime.screen = 'play'; this.startRun('daily', this.runtime.forceStage); }
    else if (mode === 'timeattack') { this.runtime.screen = 'play'; this.startRun('timeattack', this.runtime.forceStage); }
    else { this.runner.mode = 'menu'; this.runtime.screen = 'menu'; this.showMenu(); }
  };

  TD.Runner = Runner;
  TD.BootScene = BootScene;
  TD.PlayScene = PlayScene;
})(window);
