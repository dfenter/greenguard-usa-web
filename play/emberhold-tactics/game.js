/* EMBERHOLD TACTICS - Phaser view and GGKit shell
 * The scene reads sim.js. It never changes turn order, range, hit rolls, or AI.
 */
(function () {
  'use strict';

  var Sim = window.EmberholdSim;
  var Phaser = window.Phaser;
  var STEP = 1000 / 60;
  var W = 1200, H = 760, N = Sim.N, TILE_W = 78, TILE_H = 39, EXTRUDE = 15;
  var TAU = Math.PI * 2;
  var seedFromUrl = Number(new URLSearchParams(location.search).get('seed'));
  if (!Number.isFinite(seedFromUrl)) seedFromUrl = 2417;
  seedFromUrl = (seedFromUrl >>> 0) || 2417;
  var skirmishFromUrl = Number(new URLSearchParams(location.search).get('skirmish'));
  if (!Number.isFinite(skirmishFromUrl)) skirmishFromUrl = 1;
  skirmishFromUrl = Math.max(1, Math.min(20, Math.floor(skirmishFromUrl)));
  var liveScene = null;
  var $ = function (id) { return document.getElementById(id); };
  var setTextIfChanged = function (el, value) { value = String(value); if (el && el.textContent !== value) el.textContent = value; };
  var reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var urlSeed = seedFromUrl;
  var profileDefault = {version:2,unlocked:1,medals:{},tutorialDone:false,bestRounds:{},permadeath:false,reducedMotion:false,activeRoster:Sim.defaultCampaign().activeRoster,roster:Sim.defaultCampaign().roster};
  function validMapKey(key) { return /^(?:[1-9]|1[0-9]|20)$/.test(key); }
  function validScoreMap(value, min, max) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    return Object.keys(value).every(function (key) { return validMapKey(key) && Number.isInteger(value[key]) && value[key] >= min && value[key] <= max; });
  }
  function validProfile(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
    if (o.version === 1) return Number.isInteger(o.unlocked) && o.unlocked >= 1 && o.unlocked <= 5 && validScoreMap(o.medals, 0, 3) && validScoreMap(o.bestRounds, 1, 9999) && typeof o.tutorialDone === 'boolean';
    if (o.version !== 2 || !Number.isInteger(o.unlocked) || o.unlocked < 1 || o.unlocked > 20) return false;
    if (!validScoreMap(o.medals, 0, 3) || !validScoreMap(o.bestRounds, 1, 9999) || typeof o.tutorialDone !== 'boolean' || typeof o.permadeath !== 'boolean' || typeof o.reducedMotion !== 'boolean') return false;
    if (!Array.isArray(o.activeRoster) || o.activeRoster.length > 4 || !o.activeRoster.every(function (id) { return typeof id === 'string'; })) return false;
    if (!Array.isArray(o.roster) || o.roster.length !== 6) return false;
    return o.roster.every(function (m) { return m && typeof m.id === 'string' && typeof m.name === 'string' && Sim.JOBS[m.job] && Number.isInteger(m.level) && m.level >= 1 && m.level <= 20 && Number.isInteger(m.xp) && m.xp >= 0 && m.xp <= 9999 && typeof m.alive === 'boolean' && (m.promotion === null || typeof m.promotion === 'string') && m.equipment && Object.keys(m.equipment).every(function (slot) { return typeof m.equipment[slot] === 'string' && Sim.EQUIPMENT[m.equipment[slot]]; }); });
  }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function migrateProfile(raw) {
    if (!validProfile(raw)) return clone(profileDefault);
    if (raw.version === 1) {
      var migrated = clone(profileDefault);
      migrated.unlocked = Math.min(20, raw.unlocked);
      migrated.medals = clone(raw.medals || {}); migrated.bestRounds = clone(raw.bestRounds || {}); migrated.tutorialDone = raw.tutorialDone;
      return migrated;
    }
    var next = clone(profileDefault); Object.keys(next).forEach(function (key) { if (raw[key] !== undefined) next[key] = clone(raw[key]); }); return next;
  }
  var profile;
  var kit = GGKit.create({
    slug: 'emberhold-tactics', orientation: 'landscape', validateSave: validProfile,
    onPause: function () { if (liveScene) liveScene.setPaused(true); },
    onResume: function () { if (liveScene) liveScene.setPaused(false); },
    onRestart: function () { if (liveScene) liveScene.restartMap(); }
  });
  kit.input.gamepadState = function () {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    var pads = navigator.getGamepads();
    for (var i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected) return pads[i];
    return null;
  };
  var rawProfile = kit.save.get(profileDefault);
  profile = migrateProfile(rawProfile);
  reducedMotion = reducedMotion || !!profile.reducedMotion;
  if (!rawProfile || rawProfile.version !== 2) kit.save.set(profile);
  skirmishFromUrl = Math.min(skirmishFromUrl, profile.unlocked);
  kit.audio.register({ambient:'assets/ambient_hum.mp3', intensity:'assets/ambient_intensity.mp3', select:'assets/sfx_select.mp3', move:'assets/sfx_move.mp3', clash:'assets/sfx_clash.mp3', damage:'assets/sfx_damage.mp3', confirm:'assets/sfx_confirm.mp3', victory:'assets/sfx_victory.mp3', defeat:'assets/sfx_defeat.mp3', pickup:'assets/sfx_pickup.mp3'});
  kit.registerPWA();

  window.__et = {state:{mode:'boot',round:0,skirmish:skirmishFromUrl,unitsRemaining:9,mapId:'boot'}};

  function color(hex) { return Number('0x' + hex.replace('#', '')); }
  function alphaHex(hex, a) { return {c:color(hex), a:a}; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function mapKey(c, r) { return c + ',' + r; }
  function mapIdForValue(v) { var n = Number(v); if (Number.isFinite(n)) return clamp(Math.floor(n), 1, 20); var hit = Object.keys(Sim.MAPS).find(function (k) { return Sim.MAPS[k].id === v; }); return hit ? Number(hit) : 1; }

  var ICONS = {Attack:'⚔', 'Shield Bash':'⬟', Rampart:'⬢', 'Aimed Shot':'➶', Pin:'⌁', Fireball:'✹', 'Frost Lance':'❄', Heal:'✚', Bless:'✦', Chakra:'◎', 'Wave Fist':'◉', Backstab:'✧', 'Steal Tempo':'↯', 'Ember Sigil':'◇', 'Ruin Wave':'✺', Dash:'➤', 'Brace Charge':'⬢', 'Radiant Ward':'✦', Volley:'▦', 'Piercing Shot':'➶', Inferno:'✹', 'Arcane Edge':'✧', Aegis:'◈', Sanctuary:'◇', Counter:'↯', Meditate:'◎', Vanish:'◌', Decoy:'◆'};
  function abilityIcon(name) { return ICONS[name] || '◆'; }
  function jobSpec(u) { return Sim.JOBS[u.job] || Sim.JOBS.Knight; }

  function EmberholdScene() {
    Phaser.Scene.call(this, {key:'emberhold'});
    this.paused = false; this.accumulator = 0; this.visualTime = 0; this.speed = 1; this.rot = 0; this.zoom = 1; this.panX = 0; this.panY = 0;
    this.pinch = null; this.lastTap = {time:0,x:0,y:0}; this.confirmKey = null; this.uiKey = ''; this.coachTimer = 0; this.views = new Map(); this.fxCursor = 0; this.shakeX = 0; this.shakeY = 0; this.damageFlash = 0; this.dangerMusic = false; this.audioUnlocked = false; this.cursorOwner = ''; this.gamepadLatch = {}; this.battleResolved = false; this.cinematic = null; this.menuBound = false;
    this.fx = Array.from({length:96}, function () { return {active:false,x:0,y:0,vx:0,vy:0,life:0,ttl:500,color:'#fff',kind:'spark',size:3}; });
    this.weaponArcs = Array.from({length:24}, function () { return {active:false,start:{x:0,y:0},end:{x:0,y:0},life:0,ttl:480,color:'#fff',kind:'slash'}; });
    this.toastQueue = []; this.toastActive = ''; this.toastTimer = 0; this.renderSeed = 0x7e57; this.cardKey = '';
  }
  EmberholdScene.prototype = Object.create(Phaser.Scene.prototype);
  EmberholdScene.prototype.constructor = EmberholdScene;

  EmberholdScene.prototype.preload = function () {
    /* Audio is registered with GGKit and decoded lazily after the first gesture. */
    this.load.image('unit_player', 'assets/unit_player.svg');
    this.load.image('unit_enemy', 'assets/unit_enemy.svg');
    this.load.image('unit_boss', 'assets/unit_boss.svg');
    this.load.image('tile_grass', 'assets/tile_grass.svg');
    this.load.image('tile_stone', 'assets/tile_stone.svg');
    this.load.image('tile_sand', 'assets/tile_sand.svg');
    this.load.image('tile_water', 'assets/tile_water.svg');
    this.load.image('pickup_heal', 'assets/pickup_heal.svg');
    this.load.image('pickup_buff', 'assets/pickup_buff.svg');
    this.load.image('fx_spark', 'assets/fx_spark.svg');
    this.load.image('fx_ember', 'assets/fx_ember.svg');
  };
  EmberholdScene.prototype.create = function () {
    liveScene = this;
    this.boardG = this.add.graphics(); this.fxG = this.add.graphics(); this.fogG = this.add.graphics(); this.uiG = this.add.graphics();
    this.tileSprites = new Map(); this.pickupViews = new Map();
    this.particles = {
      sparks: this.add.particles(0, 0, 'fx_spark', {lifespan:420, speed:{min:60,max:210}, scale:{start:.24,end:.02}, alpha:{start:1,end:0}, rotate:{min:0,max:360}, blendMode:'ADD', emitting:false, maxAliveParticles:96}),
      embers: this.add.particles(0, 0, 'fx_ember', {lifespan:900, speed:{min:14,max:70}, gravityY:70, scale:{start:.32,end:.03}, alpha:{start:.8,end:0}, rotate:{min:0,max:360}, blendMode:'ADD', emitting:false, maxAliveParticles:72}),
      rings: this.add.particles(0, 0, 'fx_spark', {lifespan:520, speed:{min:10,max:34}, scale:{start:.12,end:.5}, alpha:{start:.8,end:0}, rotate:{min:0,max:360}, blendMode:'ADD', emitting:false, maxAliveParticles:54}),
      motes: this.add.particles(0, 0, 'fx_ember', {lifespan:1250, speed:{min:4,max:18}, gravityY:-12, scale:{start:.18,end:.02}, alpha:{start:.7,end:0}, rotate:{min:0,max:360}, blendMode:'ADD', emitting:false, maxAliveParticles:48})
    };
    this.particles.sparks.setDepth(16); this.particles.embers.setDepth(17); this.particles.rings.setDepth(18); this.particles.motes.setDepth(15);
    this.damageVignette = document.createElement('div');
    this.damageVignette.style.cssText = 'position:fixed;inset:0;z-index:4;pointer-events:none;opacity:0;background:radial-gradient(ellipse at center,rgba(255,45,74,0) 38%,rgba(255,36,66,.75) 100%);mix-blend-mode:screen;';
    document.body.appendChild(this.damageVignette);
    this.sim = null; this.startSkirmish(skirmishFromUrl, urlSeed);
    this.wireInput(); this.wireDom();
    kit.loader.hide();
    this.render(); this.syncUI(true);
  };
  EmberholdScene.prototype.startSkirmish = function (skirmish, seed) {
    skirmish = Math.min(mapIdForValue(skirmish || 1), profile.unlocked); seed = (Number(seed) >>> 0) || 2417;
    this.accumulator = 0; this.visualTime = 0; this.confirmKey = null; this.panX = 0; this.panY = 0; this.cursor = null; this.pinch = null; this.fxCursor = 0; this.shakeX = 0; this.shakeY = 0; this.dangerMusic = false; this.battleResolved = false; this.cinematic = null;
    this.fx.forEach(function (fx) { fx.active = false; });
    this.weaponArcs.forEach(function (arc) { arc.active = false; });
    this.clearTransients();
    if (this.particles) Object.keys(this.particles).forEach(function (name) { if (this.particles[name].stop) this.particles[name].stop(); }, this);
    kit.input.clearAll();
    this.sim = Sim.create(seed, skirmish, profile); this.sim.start(); window.__et.state = this.sim.state;
    this.consumeEvents(); this.coachTimer = 5000; this.syncUI(true); this.render();
  };
  EmberholdScene.prototype.restartMap = function () { this.startSkirmish(this.sim ? this.sim.state.skirmish : 1, this.sim ? this.sim.state.seed : urlSeed); };
  EmberholdScene.prototype.setPaused = function (v) { this.paused = !!v; this.pinch = null; if (v) this.gamepadLatch = {}; };
  EmberholdScene.prototype.ensureView = function (u) {
    var view = this.views.get(u.id);
    if (view) return view;
    view = {bob:0, lastHp:u.hp, lastC:u.c, lastR:u.r, state:'idle', stateUntil:0, sprite:this.add.image(0,0,'unit_player').setDepth(20), label:this.add.text(0,0,'',{fontFamily:'Arial',fontSize:'18px',fontStyle:'bold',color:'#eff8f5',stroke:'#06101a',strokeThickness:4}).setOrigin(.5).setDepth(21), name:this.add.text(0,0,'',{fontFamily:'Arial',fontSize:'10px',color:'#cce2e5',stroke:'#06101a',strokeThickness:3}).setOrigin(.5).setDepth(21)};
    this.views.set(u.id, view); return view;
  };
  EmberholdScene.prototype.clearDeadViews = function () {
    var alive = new Set(this.sim.state.units.filter(function (u) { return u.alive; }).map(function (u) { return u.id; }));
    this.views.forEach(function (v, id) { if (!alive.has(id) && !(v.state === 'ko' && this.visualTime < v.stateUntil)) { v.sprite.setVisible(false); v.label.setVisible(false); v.name.setVisible(false); } }, this);
  };
  EmberholdScene.prototype.emitSound = function (name, volume) {
    try { kit.audio.sfx(name, {volume:volume == null ? 1 : volume}); } catch (e2) {}
  };
  EmberholdScene.prototype.consumeEvents = function () {
    if (!this.sim) return;
    var events = this.sim.drainEvents();
    for (var i = 0; i < events.length; i++) {
      var e = events[i], target, out, p;
      if (e.type === 'battle-start') { this.emitSound('select', .28); continue; }
      if (e.type === 'turn') { this.coachTimer = 5000; continue; }
      if (e.type === 'move') { this.setUnitState(e.unitId, 'move', 300); var moveEnd = e.path && e.path.length ? e.path[e.path.length - 1] : e.from; if (moveEnd) this.spawnBurst(moveEnd.c, moveEnd.r, '#55c6ff', 5, 'trail'); this.emitSound('move', .35); continue; }
      if (e.type === 'attack') {
        this.setUnitState(e.unitId, 'attack', reducedMotion ? 280 : 560); var attacker = this.sim.state.units.find(function (u) { return u.id === e.unitId; }); this.emitSound('clash', .62); out = e.outcomes || [];
        for (var j = 0; j < out.length; j++) { target = this.sim.state.units.find(function (u) { return u.id === out[j].targetId; }); var tx = out[j].c, ty = out[j].r; if (target) { tx = target.c; ty = target.r; } this.spawnWeaponArc(e, out[j], attacker, tx, ty); this.spawnBurst(tx, ty, out[j].hit ? (out[j].crit ? '#ffd36c' : '#ff6683') : '#94a8b0', out[j].hit ? 14 : 5, out[j].hit ? 'impact' : 'miss'); this.spawnFloat(tx, ty, out[j].hit ? (out[j].crit ? 'CRIT ' : '') + out[j].damage : 'MISS', out[j].hit ? (out[j].crit ? '#ffd36c' : '#f6f8e6') : '#aab8bc', out[j].hit ? 20 : 15); if (out[j].hit && !reducedMotion) { kit.juice.shake(out[j].crit ? 10 : 5, out[j].crit ? 240 : 160); kit.juice.hitStop(out[j].crit ? 85 : 48); } }
        for (var k = 0; k < out.length; k++) { target = this.sim.state.units.find(function (u) { return u.id === out[k].targetId; }); if (target && target.team === 'player' && out[k].hit) { this.damageFlash = 420; this.emitSound('damage', .7); this.setUnitState(target.id, 'hurt', 360); } }
        continue;
      }
      if (e.type === 'support' || e.type === 'buff' || e.type === 'pickup') { this.emitSound(e.type === 'pickup' ? 'pickup' : 'select', .6); target = this.sim.state.units.find(function (u) { return u.id === (e.targetId || e.unitId); }); if (target) { this.spawnBurst(target.c, target.r, e.kind === 'buff' || e.ability === 'Bless' ? '#ffd36c' : '#75f0b0', 12, 'support'); this.spawnFloat(target.c, target.r, e.kind === 'heal' || e.ability === 'Heal' ? '+' + e.amount : e.ability || 'READY', '#9affc9', 16); } continue; }
      if (e.type === 'terrain') { this.spawnBurst(e.c, e.r, e.ability === 'Sanctuary' ? '#75f0b0' : '#c9a5ff', 16, 'rune'); this.spawnFloat(e.c, e.r, e.ability === 'Sanctuary' ? 'SAFE TILE' : 'SIGIL', '#d7c0ff', 14); continue; }
      if (e.type === 'hazard') { target = this.sim.state.units.find(function (u) { return u.id === e.unitId; }); if (target && target.team === 'player') { this.damageFlash = 420; this.emitSound('damage', .7); this.setUnitState(target.id, 'hurt', 360); } this.spawnBurst(e.c, e.r, '#ff9c52', 11, 'hazard'); this.spawnFloat(e.c, e.r, '-' + e.amount, '#ff9c52', 16); continue; }
      if (e.type === 'ko') { target = this.sim.state.units.find(function (u) { return u.id === e.unitId; }); if (target) { this.setUnitState(target.id, 'ko', 700); this.spawnBurst(target.c, target.r, '#e9f4f2', 24, 'ko'); this.spawnFloat(target.c, target.r, 'KO', '#fff0a3', 18); } continue; }
      if (e.type === 'charge') { this.spawnBurst(e.c, e.r, '#c9a5ff', 12, 'charge'); this.spawnFloat(e.c, e.r, 'CHARGE', '#d7c0ff', 13); continue; }
      if (e.type === 'reinforcements') { this.showToast('RESERVES INBOUND'); (e.positions || [{c:8,r:5}]).forEach(function (pos) { this.spawnBurst(pos.c, pos.r, '#ff6683', 20, 'drop'); }, this); continue; }
      if (e.type === 'round') { this.spawnBurst(4, 4, '#ffd36c', 10, 'round'); continue; }
      if (e.type === 'objective') { if (e.kind === 'capture') this.showToast('SIGILS SHIFT'); else if (e.kind === 'escort') this.showToast('COURIER MOVING'); continue; }
      if (e.type === 'battle-end') { this.finishBattle(e.winner, e.rounds); }
    }
    window.__et.state = this.sim.state;
  };
  EmberholdScene.prototype.setUnitState = function (id, state, duration) {
    var view = this.views.get(id);
    if (!view) return;
    view.state = state; view.stateUntil = this.visualTime + duration;
  };
  EmberholdScene.prototype.finishBattle = function (winner, rounds) {
    if (this.battleResolved) return;
    this.battleResolved = true;
    var playerIds = new Set(profile.activeRoster), playerLeft = this.sim.state.units.filter(function (u) { return u.team === 'player' && u.alive && (!u.isRoster || playerIds.has(u.memberId)); }).length;
    var rosterSize = profile.activeRoster.length, lost = Math.max(0, rosterSize - playerLeft), medal = winner === 'player' ? (rounds <= 7 && lost === 0 ? 3 : rounds <= 11 && lost <= 1 ? 2 : 1) : 0;
    if (winner === 'player') { profile.medals[this.sim.state.skirmish] = Math.max(profile.medals[this.sim.state.skirmish] || 0, medal); profile.bestRounds[this.sim.state.skirmish] = Math.min(profile.bestRounds[this.sim.state.skirmish] || 999, rounds); if (this.sim.state.skirmish < 20) profile.unlocked = Math.max(profile.unlocked, this.sim.state.skirmish + 1); profile.tutorialDone = true; var nextCampaign = this.sim.exportCampaign(true); profile.activeRoster = nextCampaign.activeRoster; profile.roster = nextCampaign.roster; kit.save.set(profile); }
    this.clearTransients(); $('coach').classList.add('faded');
    var self = this, show = function () { $('banner-title').textContent = winner === 'player' ? (self.sim.state.skirmish === 20 ? 'EMBERHOLD CLEAR' : 'BATTLE CLEAR') : 'LINE FALLEN'; var best = profile.bestRounds[self.sim.state.skirmish] ? ' · BEST ' + profile.bestRounds[self.sim.state.skirmish] : ''; $('banner-text').textContent = winner === 'player' ? self.sim.state.objective.label + ' · ROUND ' + rounds + ' · ' + medal + ' MEDAL · ' + lost + ' ROSTER LOST' + best : 'The Emberhold line needs another push.'; $('next-map').disabled = winner !== 'player' || self.sim.state.skirmish >= 20; $('next-map').textContent = self.sim.state.skirmish >= 20 ? 'CAMPAIGN COMPLETE' : 'NEXT BATTLE'; $('banner').hidden = false; self.emitSound(winner === 'player' ? 'victory' : 'defeat', winner === 'player' ? .85 : .6); self.syncUI(true); };
    this.cinematic = {kind:winner,start:this.visualTime,duration:reducedMotion ? 1 : 760,baseZoom:this.zoom,basePanX:this.panX,basePanY:this.panY,shown:false,show:show};
    if (reducedMotion) { this.cinematic.shown = true; show(); }
  };
  EmberholdScene.prototype.clearTransients = function () {
    window.clearTimeout(this.toastTimer); this.toastTimer = 0; this.toastQueue.length = 0; this.toastActive = '';
    var toast = $('toast'); if (toast) toast.classList.remove('show');
  };
  EmberholdScene.prototype.flushToast = function () {
    if (this.toastActive || !this.toastQueue.length) return;
    var self = this, toast = $('toast'); this.toastActive = this.toastQueue.shift(); setTextIfChanged(toast, this.toastActive); toast.classList.add('show'); $('coach').classList.add('faded');
    window.clearTimeout(this.toastTimer); this.toastTimer = window.setTimeout(function () {
      toast.classList.remove('show'); self.toastActive = ''; self.toastTimer = window.setTimeout(function () { if (self.toastQueue.length) self.flushToast(); else self.syncUI(false); }, reducedMotion ? 0 : 140);
    }, reducedMotion ? 700 : 1000);
  };
  EmberholdScene.prototype.showToast = function (text) {
    text = String(text); if (!text || text === this.toastActive || this.toastQueue[this.toastQueue.length - 1] === text) return;
    this.toastQueue.push(text); if (this.toastQueue.length > 4) this.toastQueue.shift(); this.flushToast();
  };
  EmberholdScene.prototype.spawnBurst = function (c, r, hex, count, kind) {
    var p = this.tilePoint(c, r), made = 0;
    var tint = color(hex);
    if (this.particles && !reducedMotion) {
      var emitter = kind === 'trail' || kind === 'support' || kind === 'rune' ? this.particles.embers : kind === 'round' || kind === 'drop' ? this.particles.motes : kind === 'miss' ? this.particles.rings : this.particles.sparks;
      if (emitter.setParticleTint) emitter.setParticleTint(tint); if (emitter.emitParticleAt) emitter.emitParticleAt(p.x + this.shakeX, p.y - 16 * this.zoom + this.shakeY, Math.min(count, 18));
    }
    count = reducedMotion ? Math.min(4, count) : count;
    for (var i = 0; i < this.fx.length && made < count; i++) {
      var fx = this.fx[(this.fxCursor + i) % this.fx.length]; if (fx.active) continue; this.fxCursor = (this.fxCursor + i + 1) % this.fx.length;
      var angle = ((this.renderSeed = (this.renderSeed * 1664525 + 1013904223) >>> 0) / 4294967296) * TAU, speed = 20 + ((this.renderSeed >>> 8) % 30);
      Object.assign(fx, {active:true,x:p.x,y:p.y - 16,vx:Math.cos(angle) * speed,vy:Math.sin(angle) * speed - 16,life:0,ttl:kind === 'ko' ? 560 : 360,color:hex,kind:kind,size:kind === 'impact' ? 3 : 2.4}); made++;
    }
  };
  EmberholdScene.prototype.spawnWeaponArc = function (event, outcome, attacker, target, tx, ty) {
    if (reducedMotion || !target && !event.from) return;
    var start = event.from || {c:attacker ? attacker.c : tx,r:attacker ? attacker.r : ty}, from = this.tilePoint(start.c,start.r), to = this.tilePoint(tx,ty), arc = this.weaponArcs.find(function (item) { return !item.active; });
    if (!arc) return;
    var colors = {slash:'#ffd36c',bash:'#ff9c52',arrow:'#79e8ef',fire:'#ff6683',frost:'#8cecff',arcane:'#c9a5ff',wave:'#ff6683',shock:'#ffd36c',heal:'#75f0b0',dash:'#79e8ef'};
    Object.assign(arc,{active:true,start:{x:from.x,y:from.y - 28 * this.zoom},end:{x:to.x,y:to.y - 28 * this.zoom},life:0,ttl:outcome && outcome.crit ? 600 : 460,color:colors[event.presentation] || colors.slash,kind:event.presentation || 'slash'});
  };
  EmberholdScene.prototype.spawnFloat = function (c, r, text, hex, size) {
    this.showToast(text);
  };
  EmberholdScene.prototype.updateFx = function (dt) {
    for (var i = 0; i < this.fx.length; i++) { var fx = this.fx[i]; if (!fx.active) continue; fx.life += dt; fx.x += fx.vx * dt / 1000; fx.y += fx.vy * dt / 1000; fx.vy += 38 * dt / 1000; if (fx.life >= fx.ttl) fx.active = false; }
    for (var j = 0; j < this.weaponArcs.length; j++) { if (!this.weaponArcs[j].active) continue; this.weaponArcs[j].life += dt; if (this.weaponArcs[j].life >= this.weaponArcs[j].ttl) this.weaponArcs[j].active = false; }
  };
  EmberholdScene.prototype.viewCoord = function (c, r) {
    var x = c, y = r; for (var i = 0; i < this.rot; i++) { var nx = N - 1 - y; y = x; x = nx; } return {x:x,y:y};
  };
  EmberholdScene.prototype.tilePoint = function (c, r) {
    var tile = this.sim ? this.sim.state.board[r * N + c] : {h:0}, v = this.viewCoord(c, r);
    return {x:W / 2 + this.panX + (W / 2 + (v.x - v.y) * TILE_W / 2 - W / 2) * this.zoom, y:H / 2 + this.panY + (235 + (v.x + v.y) * TILE_H / 2 - (tile.h || 0) * EXTRUDE - H / 2) * this.zoom};
  };
  EmberholdScene.prototype.tileFromPointer = function (clientX, clientY) {
    var rect = this.game.canvas.getBoundingClientRect(), x = (clientX - rect.left) * W / rect.width - this.shakeX, y = (clientY - rect.top) * H / rect.height - this.shakeY, best = null, bd = Infinity;
    for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) { var p = this.tilePoint(c, r), dx = (x - p.x) / (TILE_W * this.zoom / 2), dy = (y - p.y) / (TILE_H * this.zoom / 2), d = dx * dx + dy * dy; if (d < bd && d < 2.1) { bd = d; best = {c:c, r:r}; } }
    return best;
  };
  EmberholdScene.prototype.diamond = function (g, p, w, h, fill, stroke, line) {
    g.fillStyle(fill.c, fill.a); g.beginPath(); g.moveTo(p.x, p.y - h); g.lineTo(p.x + w, p.y); g.lineTo(p.x, p.y + h); g.lineTo(p.x - w, p.y); g.closePath(); g.fillPath(); if (stroke) { g.lineStyle(line || 1, stroke.c, stroke.a); g.strokePath(); }
  };
  EmberholdScene.prototype.drawTile = function (c, r) {
    var tile = this.sim.state.board[r * N + c], p = this.tilePoint(c, r), palette = this.sim.state.map.palette || {}, base = tile.terrain === 'water' ? '#1f6d8c' : tile.terrain === 'sand' ? '#a98b51' : tile.terrain === 'stone' ? '#667984' : (palette.floor || '#2f745a');
    var hi = tile.terrain === 'water' ? '#4aa3bb' : tile.terrain === 'sand' ? '#caa966' : tile.terrain === 'stone' ? '#8298a0' : (palette.glow || '#4e9c75');
    var tileKey = mapKey(c, r), texture = 'tile_' + tile.terrain, tileSprite = this.tileSprites.get(tileKey);
    if (!tileSprite) { tileSprite = this.add.image(0, 0, texture).setDepth(-1); this.tileSprites.set(tileKey, tileSprite); }
    tileSprite.setTexture(texture).setPosition(p.x + this.shakeX, p.y + this.shakeY).setDisplaySize(TILE_W * this.zoom, TILE_H * this.zoom).setVisible(true);
    if (tile.h > 0) { var side = {x:p.x, y:p.y + TILE_H * this.zoom / 2}; this.boardG.fillStyle(color(base), .5); this.boardG.fillTriangle(p.x - TILE_W * this.zoom / 2, p.y, p.x, p.y + TILE_H * this.zoom / 2, p.x, side.y + tile.h * EXTRUDE * this.zoom); this.boardG.fillStyle(color('#102a34'), .42); this.boardG.fillTriangle(p.x, p.y + TILE_H * this.zoom / 2, p.x + TILE_W * this.zoom / 2, p.y, p.x + TILE_W * this.zoom / 2, p.y + tile.h * EXTRUDE * this.zoom); this.boardG.lineStyle(1.4 * this.zoom, color(hi), .28); this.boardG.lineBetween(p.x - TILE_W * this.zoom * .25, p.y - TILE_H * this.zoom * .1, p.x, p.y - TILE_H * this.zoom * .4 - tile.h * EXTRUDE * this.zoom); }
    this.boardG.fillStyle(color(hi), .08 + tile.h * .015); this.boardG.fillCircle(p.x - 9 * this.zoom, p.y - 5 * this.zoom, 5 * this.zoom);
  };
  EmberholdScene.prototype.drawHighlights = function () {
    var s = this.sim.state, u = s.active, self = this;
    function overlay(c, r, fill, stroke) { var p = self.tilePoint(c, r); self.diamond(self.boardG, p, TILE_W * self.zoom / 2, TILE_H * self.zoom / 2, fill, stroke, 2); }
    function visibleEnemy(enemy) { return s.skirmish !== 4 || s.units.some(function (p) { return p.alive && p.team === 'player' && Math.abs(p.c - enemy.c) + Math.abs(p.r - enemy.r) <= s.map.vision; }); }
    if (!u) return;
    /* Threat range remains visible while planning movement, so cover routes
       can be read without switching to a debug view. */
    s.units.filter(function (x) { return x.alive && x.team === 'enemy' && visibleEnemy(x); }).forEach(function (enemy) { var a = self.sim.actionTiles(enemy, self.sim.abilitySpec(enemy, 'Attack')); a.forEach(function (p) { overlay(p.c, p.r, alphaHex('#ff526f', .1), alphaHex('#ff758c', .28)); }); });
    if (s.mode === 'move') { this.sim.reachable(u).forEach(function (entry) { overlay(entry.c, entry.r, alphaHex('#238cff', .3), alphaHex('#70d8ff', .72)); }); var path = this.cursor ? this.sim.pathTo(u,this.cursor.c,this.cursor.r) : []; if (path.length && !reducedMotion) { var prev = this.tilePoint(u.c,u.r); this.boardG.lineStyle(4 * this.zoom, color('#ffe28a'), .86); path.forEach(function (step) { var next = self.tilePoint(step.c,step.r); self.boardG.lineBetween(prev.x,prev.y - 5 * self.zoom,next.x,next.y - 5 * self.zoom); self.boardG.fillStyle(color('#fff0a3'), .9); self.boardG.fillCircle(next.x,next.y - 5 * self.zoom,3 * self.zoom); prev = next; }); } }
    if (s.mode === 'aim' && s.action) this.sim.actionTiles(u, s.action).forEach(function (entry) { if (self.sim.validTarget(u, s.action, entry.c, entry.r)) overlay(entry.c, entry.r, alphaHex(s.action.kind === 'heal' || s.action.kind === 'buff' ? '#4de09a' : '#ff526f', .26), alphaHex(s.action.kind === 'heal' || s.action.kind === 'buff' ? '#9affc9' : '#ff91a2', .75)); });
    if (s.aim) { var aim = this.tilePoint(s.aim.c, s.aim.r); this.boardG.lineStyle(3, color('#fff0a3'), .95); this.boardG.strokeCircle(aim.x, aim.y - 5 * this.zoom, 20 * this.zoom); }
    if (this.cursor) { var cursor = this.tilePoint(this.cursor.c, this.cursor.r); this.boardG.lineStyle(3, color('#ffffff'), .9); this.boardG.strokeCircle(cursor.x, cursor.y, 15 * this.zoom); }
  };
  EmberholdScene.prototype.drawPickups = function () {
    var self = this;
    this.sim.state.pickups.forEach(function (p) { if (p.collected) return; var q = self.tilePoint(p.c, p.r), col = p.kind === 'heal' ? '#75f0b0' : '#ffd36c', view = self.pickupViews.get(p.id); if (!view) { view = self.add.image(0,0,p.kind === 'heal' ? 'pickup_heal' : 'pickup_buff').setDepth(12); self.pickupViews.set(p.id, view); } view.setTexture(p.kind === 'heal' ? 'pickup_heal' : 'pickup_buff').setPosition(q.x + self.shakeX, q.y - 9 * self.zoom + self.shakeY).setDisplaySize(26 * self.zoom, 26 * self.zoom).setVisible(true); self.fxG.lineStyle(2, color(col), .7); self.fxG.strokeCircle(q.x, q.y - 8 * self.zoom, (11 + Math.sin(self.visualTime / 240) * 2) * self.zoom); });
    this.pickupViews.forEach(function (view, id) { if (!self.sim.state.pickups.some(function (p) { return p.id === id && !p.collected; })) view.setVisible(false); });
    this.sim.state.fields.forEach(function (f) { var q = self.tilePoint(f.c, f.r), fieldColor = f.kind === 'sanctuary' ? '#75f0b0' : '#c9a5ff'; self.fxG.lineStyle(2, color(fieldColor), .7); self.fxG.strokeCircle(q.x, q.y, 17 * self.zoom); self.fxG.fillStyle(color(fieldColor), .12); self.fxG.fillCircle(q.x, q.y, 14 * self.zoom); });
    this.sim.state.capturePoints.forEach(function (point) { var q = self.tilePoint(point.c,point.r), pointColor = point.owner === 'player' ? '#55c6ff' : point.owner === 'enemy' ? '#ff6683' : '#ffd36c'; self.fxG.lineStyle(3, color(pointColor), .8); self.fxG.strokeCircle(q.x,q.y - 8 * self.zoom,(14 + (point.progress || 0) * 3) * self.zoom); self.fxG.lineStyle(2, color(pointColor), .45); self.fxG.lineBetween(q.x - 9 * self.zoom,q.y - 8 * self.zoom,q.x + 9 * self.zoom,q.y - 8 * self.zoom); });
  };
  EmberholdScene.prototype.drawFog = function () {
    if (this.sim.state.skirmish !== 4) return;
    var s = this.sim.state, visible = new Set(); s.units.filter(function (u) { return u.alive && u.team === 'player'; }).forEach(function (u) { for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) if (Math.abs(c - u.c) + Math.abs(r - u.r) <= s.map.vision) visible.add(mapKey(c, r)); });
    for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) if (!visible.has(mapKey(c, r))) { var p = this.tilePoint(c, r); this.diamond(this.fogG, p, TILE_W * this.zoom / 2, TILE_H * this.zoom / 2, alphaHex('#030713', .75), null); }
  };
  EmberholdScene.prototype.drawUnit = function (u) {
    var deadView = this.views.get(u.id);
    if (!u.alive) { if (deadView && deadView.state === 'ko' && this.visualTime < deadView.stateUntil) { var koPoint = this.tilePoint(u.c,u.r), koLife = clamp((deadView.stateUntil - this.visualTime) / 700,0,1); deadView.sprite.setTexture(u.boss ? 'unit_boss' : u.team === 'player' ? 'unit_player' : 'unit_enemy').setPosition(koPoint.x + this.shakeX,koPoint.y - 30 * this.zoom + (1 - koLife) * 14 * this.zoom + this.shakeY).setDisplaySize(72 * this.zoom,72 * this.zoom).setAlpha(koLife).setRotation((1 - koLife) * .5).setVisible(true); deadView.label.setVisible(false); deadView.name.setVisible(false); return; } if (deadView) { deadView.sprite.setVisible(false); deadView.label.setVisible(false); deadView.name.setVisible(false); } return; }
    var s = this.sim.state, hidden = s.skirmish === 4 && u.team === 'enemy' && !s.units.some(function (p) { return p.alive && p.team === 'player' && Math.abs(p.c - u.c) + Math.abs(p.r - u.r) <= s.map.vision; });
    var view = this.ensureView(u);
    if (hidden) { view.sprite.setVisible(false); view.label.setVisible(false); view.name.setVisible(false); return; }
    if (view.lastC !== u.c || view.lastR !== u.r) { view.state = 'move'; view.stateUntil = this.visualTime + 260; view.lastC = u.c; view.lastR = u.r; }
    if (u.hp < view.lastHp) { view.state = 'hurt'; view.stateUntil = this.visualTime + 360; }
    view.lastHp = u.hp;
    if (this.visualTime > view.stateUntil) view.state = 'idle';
    var p = this.tilePoint(u.c, u.r), t = this.visualTime / 300, motion = reducedMotion ? 0 : Math.sin(t + u.c) * 2, statePulse = view.state === 'hurt' && Math.floor(this.visualTime / 70) % 2 === 0 ? .35 : 1;
    var team = u.team === 'player' ? '#55c6ff' : '#ff6683', scale = this.zoom, spriteKey = u.boss ? 'unit_boss' : u.team === 'player' ? 'unit_player' : 'unit_enemy';
    this.fxG.save(); this.fxG.setBlendMode(Phaser.BlendModes.ADD); this.fxG.fillStyle(color(team), .13); this.fxG.fillCircle(p.x, p.y - 28 * scale, (29 + (u.boss ? 10 : 0)) * scale); this.fxG.restore();
    if (u === s.active) { this.fxG.lineStyle(3 * scale, color('#ffd36c'), .9); this.fxG.strokeCircle(p.x, p.y - 12 * scale, (29 + Math.sin(t * 1.7) * 3) * scale); }
    if (u === s.selected) { this.fxG.lineStyle(2 * scale, color(team), .8); this.fxG.strokeEllipse(p.x, p.y + 2 * scale, 58 * scale, 18 * scale); }
    this.fxG.fillStyle(color('#050a12'), .7); this.fxG.fillEllipse(p.x, p.y + 2 * scale, 34 * scale, 10 * scale);
    var spriteScale = u.boss ? 1.18 : 1, spriteBob = view.state === 'move' ? Math.sin(this.visualTime / 55) * 4 : motion, attackAge = view.state === 'attack' ? clamp(1 - (view.stateUntil - this.visualTime) / (reducedMotion ? 280 : 560), 0, 1) : 0, anticipation = view.state === 'attack' ? (attackAge < .28 ? attackAge / .28 : 1) : 0, attackScale = view.state === 'attack' ? 1 + Math.sin(anticipation * Math.PI) * .12 : 1, attackLean = view.state === 'attack' ? (attackAge < .32 ? -.12 * anticipation : attackAge < .7 ? .16 : .04) : 0;
    view.sprite.setTexture(spriteKey).setPosition(p.x + this.shakeX - attackLean * 14 * scale, p.y - 37 * scale + spriteBob + this.shakeY - (view.state === 'attack' ? Math.sin(attackAge * Math.PI) * 8 * scale : 0)).setDisplaySize(76 * scale * spriteScale * attackScale, 76 * scale * spriteScale * attackScale).setAlpha(statePulse).setRotation(attackLean).setVisible(true);
    var hp = clamp(u.hp / u.maxHp, 0, 1); this.fxG.fillStyle(color('#08121a'), .9); this.fxG.fillRoundedRect(p.x - 28 * scale, p.y - 76 * scale + motion, 56 * scale, 6 * scale, 3 * scale); this.fxG.fillStyle(color(u.team === 'player' ? '#75f0b0' : '#ff6683'), 1); this.fxG.fillRoundedRect(p.x - 27 * scale, p.y - 75 * scale + motion, 54 * hp * scale, 4 * scale, 2 * scale);
    view.label.setText((jobSpec(u).glyph || '?')).setPosition(p.x + this.shakeX, p.y - 34 * scale + spriteBob + this.shakeY).setScale(scale).setColor('#eff8f5').setVisible(true); view.name.setVisible(false);
  };
  EmberholdScene.prototype.drawFx = function () {
    for (var a = 0; a < this.weaponArcs.length; a++) { var arc = this.weaponArcs[a]; if (!arc.active) continue; var progress = clamp(arc.life / arc.ttl,0,1), alpha = progress < .18 ? progress / .18 : 1 - (progress - .18) / .82, sx = arc.start.x, sy = arc.start.y, ex = arc.end.x, ey = arc.end.y; this.fxG.lineStyle(arc.kind === 'arrow' ? 3 : 4, color(arc.color), clamp(alpha,.08,.92)); if (arc.kind === 'slash' || arc.kind === 'bash' || arc.kind === 'shock') { var dx = ex - sx, dy = ey - sy, len = Math.max(1,Math.hypot(dx,dy)), nx = -dy / len, ny = dx / len, bend = Math.sin(progress * Math.PI) * Math.min(28 * this.zoom,len * .28), last = {x:sx,y:sy}; for (var seg = 1; seg <= 6; seg++) { var tArc = seg / 6, next = {x:sx + dx * tArc + nx * Math.sin(tArc * Math.PI) * bend,y:sy + dy * tArc + ny * Math.sin(tArc * Math.PI) * bend}; this.fxG.lineBetween(last.x,last.y,next.x,next.y); last = next; } } else if (arc.kind === 'arrow' || arc.kind === 'dash') { this.fxG.lineBetween(sx,sy,ex,ey); this.fxG.fillTriangle(ex,ey,ex - (ex - sx) * .12 - (ey - sy) * .05,ey - (ey - sy) * .12 + (ex - sx) * .05,ex - (ex - sx) * .12 + (ey - sy) * .05,ey - (ey - sy) * .12 - (ex - sx) * .05); } else { this.fxG.lineStyle(3, color(arc.color), clamp(alpha,.08,.8)); this.fxG.strokeCircle(ex,ey,10 * this.zoom * (1 + progress)); this.fxG.fillStyle(color(arc.color),clamp(alpha * .35,0,.5)); this.fxG.fillCircle(ex,ey,8 * this.zoom); } }
    for (var i = 0; i < this.fx.length; i++) { var fx = this.fx[i]; if (!fx.active) continue; var life = 1 - fx.life / fx.ttl; this.fxG.fillStyle(color(fx.color), clamp(life, 0, 1)); if (fx.kind === 'rune') { this.fxG.lineStyle(2, color(fx.color), life); this.fxG.strokeCircle(fx.x, fx.y, (12 + (1 - life) * 18) * this.zoom); } else if (fx.kind === 'hazard') this.fxG.fillTriangle(fx.x, fx.y - 8, fx.x - 6, fx.y + 6, fx.x + 6, fx.y + 6); else this.fxG.fillCircle(fx.x, fx.y, fx.size * this.zoom * (fx.kind === 'impact' ? 1 + (1 - life) * 2 : 1)); }
  };
  EmberholdScene.prototype.render = function () {
    if (!this.sim || !this.boardG) return;
    this.boardG.setPosition(this.shakeX, this.shakeY); this.fxG.setPosition(this.shakeX, this.shakeY); this.fogG.setPosition(this.shakeX, this.shakeY); this.uiG.setPosition(0, 0);
    this.boardG.clear(); this.fxG.clear(); this.fogG.clear(); this.uiG.clear();
    var palette = this.sim.state.map.palette || {sky:'#0d1d2a',floor:'#142b3b',glow:'#55c6ff',accent:'#ffd36c'};
    this.boardG.fillStyle(color(palette.sky), 1); this.boardG.fillRect(0, 0, W, H);
    this.boardG.fillStyle(color(palette.floor), .42); this.boardG.fillCircle(W / 2, 365, 460);
    this.boardG.fillStyle(color(palette.glow), .06); this.boardG.fillCircle(W / 2 + Math.sin(this.visualTime / 1400) * 120, 255, 280);
    var tiles = []; for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) { var v = this.viewCoord(c, r); tiles.push({c:c,r:r,d:v.x + v.y}); } tiles.sort(function (a, b) { return a.d - b.d || a.c - b.c; }); for (var i = 0; i < tiles.length; i++) this.drawTile(tiles[i].c, tiles[i].r);
    this.drawHighlights();
    this.sim.state.waystones.forEach(function (w) { var p = this.tilePoint(w.c, w.r); this.fxG.lineStyle(2, color('#ffd36c'), .55); this.fxG.strokeCircle(p.x, p.y - 6 * this.zoom, (16 + Math.sin(this.visualTime / 320 + w.c) * 2) * this.zoom); this.fxG.fillStyle(color('#ffe69a'), .8); this.fxG.fillTriangle(p.x, p.y - 23 * this.zoom, p.x - 9 * this.zoom, p.y - 4 * this.zoom, p.x + 9 * this.zoom, p.y - 4 * this.zoom); }, this);
    this.drawPickups(); this.drawFog();
    if (this.sim.state.objective.kind === 'hold') this.sim.state.objective.holdTiles.forEach(function (tile) { var q = this.tilePoint(tile.c,tile.r); this.fxG.lineStyle(2,color(palette.accent),.55); this.fxG.strokeCircle(q.x,q.y - 7 * this.zoom,20 * this.zoom); }, this);
    if (this.sim.state.objective.kind === 'escort') { var target = this.sim.state.objective.escortTarget, goal = this.tilePoint(target.c,target.r); this.fxG.lineStyle(3,color(palette.accent),.75); this.fxG.strokeCircle(goal.x,goal.y - 8 * this.zoom,22 * this.zoom); this.fxG.lineBetween(goal.x - 11 * this.zoom,goal.y - 8 * this.zoom,goal.x + 11 * this.zoom,goal.y - 8 * this.zoom); }
    var self = this; this.sim.state.units.slice().sort(function (a, b) { return a.c + a.r - b.c - b.r; }).forEach(function (u) { self.drawUnit(u); });
    this.drawFx();
    this.fxG.lineStyle(1, color(palette.glow || '#79e8ef'), .16); this.fxG.strokeRect(18, 86, W - 36, H - 176);
    this.uiG.fillStyle(color('#ff304e'), clamp(this.damageFlash / 420, 0, .22)); this.uiG.fillRect(0, 0, W, H);
    if (this.damageVignette) this.damageVignette.style.opacity = String(clamp(this.damageFlash / 420, 0, .9));
  };
  EmberholdScene.prototype.syncUI = function (force) {
    if (!this.sim) return;
    var s = this.sim.state, a = s.active, map = Sim.MAPS[s.skirmish] || Sim.MAPS[1], modeKey = s.mode + '|' + (a ? a.id : '') + '|' + (s.action ? s.action.name : '') + '|' + (s.aim ? mapKey(s.aim.c, s.aim.r) : '');
    if (a && this.cursorOwner !== a.id) { this.cursor = {c:a.c,r:a.r}; this.cursorOwner = a.id; }
    var objectiveState = s.objective.kind === 'hold' ? 'HOLD ' + s.objectiveProgress + '/' + s.objective.target : s.objective.kind === 'capture' ? 'CAPTURE ' + s.capturePoints.filter(function (p) { return p.owner === 'player'; }).length + '/' + s.capturePoints.length : s.objective.kind === 'escort' ? 'ESCORT' : 'ROUT';
    setTextIfChanged($('mission-name'), map.name); setTextIfChanged($('mission-state'), s.ended ? (s.winner === 'player' ? 'FIELD SECURED' : 'LINE FALLEN') : (a ? (a.team === 'player' ? 'BLUE' : 'RED') : 'WAIT') + ' · R' + s.round + ' · ' + objectiveState);
    var slots = this.sim.queueForecast().slice(0, 7).map(function (id, i) { var u = s.units.find(function (x) { return x.id === id; }); return u ? '<div class="queue-slot' + (i === 0 ? ' active' : '') + '" style="color:' + (u.team === 'player' ? '#55c6ff' : '#ff6683') + '">' + (jobSpec(u).glyph || '?') + '</div>' : ''; }).join(''); if ($('queue-slots').innerHTML !== slots) $('queue-slots').innerHTML = slots;
    if (a) {
      var hpRatio = clamp(a.hp / a.maxHp, 0, 1), ctRatio = clamp(a.ct / 100, 0, 1), cardHtml = '<span class="eyebrow">' + (a.team === 'player' ? 'BLUE' : 'RED') + ' · R' + s.round + '</span><strong><span aria-hidden="true">' + (jobSpec(a).glyph || '?') + '</span> ' + a.name + '</strong><span class="meter-row" aria-label="Hit points ' + a.hp + ' of ' + a.maxHp + '"><span class="meter-icon" aria-hidden="true">♥</span><span class="meter"><i style="width:' + Math.round(hpRatio * 100) + '%"></i></span><span class="meter-value">' + a.hp + '</span></span><span class="meter-row" aria-label="Charge ' + Math.floor(a.ct) + ' and mana ' + a.mp + ' of ' + a.maxMp + '"><span class="meter-icon ct" aria-hidden="true">⌛</span><span class="meter ct"><i style="width:' + Math.round(ctRatio * 100) + '%"></i></span><span class="meter-value">' + Math.floor(a.ct) + ' · ✦' + a.mp + '</span></span>';
      if (this.cardKey !== cardHtml) { $('active-card').innerHTML = cardHtml; this.cardKey = cardHtml; }
    }
    if (force || this.uiKey !== modeKey) { this.uiKey = modeKey; this.renderActionPanel(); }
    var shouldConfirm = s.mode === 'aim' && s.action && s.aim && this.sim.validTarget(a, s.action, s.aim.c, s.aim.r); $('confirm-bar').hidden = !shouldConfirm;
    if (shouldConfirm) setTextIfChanged($('preview-line'), s.action.name.toUpperCase() + ' · ' + this.previewText(s.action, s.aim.c, s.aim.r) + (this.confirmKey === mapKey(s.aim.c, s.aim.r) ? ' · TAP AGAIN OR CONFIRM' : ' · TAP TARGET TWICE'));
    var coach = s.ended ? '' : a && a.team === 'enemy' ? 'RED TURN · WAIT' : s.mode === 'move' ? 'MOVE · BLUE → TILE' : s.mode === 'action' ? 'ACT · PICK ACTION' : s.mode === 'aim' ? 'AIM · TAP TWICE' : 'END TURN · PASS'; setTextIfChanged($('coach'), coach); $('coach').classList.toggle('faded', !!this.toastActive || !this.coachTimer || this.coachTimer <= 2000 || s.ended);
    if ($('permadeath-map')) setTextIfChanged($('permadeath-map'), 'PERMADEATH ' + (profile.permadeath ? 'ON' : 'OFF')); if ($('motion-map')) setTextIfChanged($('motion-map'), 'ACCESSIBILITY SETTINGS');
    $('end-turn').disabled = !(a && a.team === 'player' && (s.mode === 'move' || s.mode === 'action')); this.updateMenu(); this.syncDangerMusic();
  };
  EmberholdScene.prototype.syncDangerMusic = function () {
    if (!this.audioUnlocked) return;
    var s = this.sim.state, player = s.units.filter(function (u) { return u.alive && u.team === 'player'; }).length, danger = player <= 2 || s.round >= 4;
    if (danger === this.dangerMusic) return;
    this.dangerMusic = danger;
    try { kit.audio.music(danger ? 'intensity' : 'ambient', 650); } catch (e) {}
  };
  EmberholdScene.prototype.previewText = function (spec, c, r) { var s = this.sim.state, u = s.active, t = this.sim.unitAt(c, r); if (spec.kind === 'heal' && t) return 'HEAL +' + Math.min(t.maxHp - t.hp, Math.round(u.ma * spec.factor)) + ' HP'; if (spec.kind === 'buff') return 'SUPPORT READY'; if (spec.kind === 'terrain') return spec.name === 'Sanctuary' ? 'SAFE TILE · -5 HAZARD' : 'BURNING GROUND'; if (spec.aoe) return '3 x 3 AREA'; if (!t) return 'TARGET TILE READY'; var p = this.sim.preview(u, spec, t), terrain = p.terrain !== 'LEVEL' ? ' · ' + p.terrain : '', flank = p.flankBonus ? ' · +' + p.flankBonus + ' FLANK' : ''; return p.hit + '% HIT · ' + p.damage + ' DMG · ' + p.dir + terrain + flank; };
  EmberholdScene.prototype.renderActionPanel = function () {
    var panel = $('action-panel'); panel.replaceChildren(); var s = this.sim.state, u = s.active; if (!u || u.team !== 'player' || s.ended || !['move','action','aim'].includes(s.mode)) return;
    var self = this, promotion = Sim.PROMOTIONS[u.job] || [], promoted = promotion.find(function (item) { return item.id === u.promotion; }), names = ['Attack'].concat((jobSpec(u).abilities || []).filter(function (name) { return name !== 'Attack'; })).concat(promoted ? promoted.abilities : []);
    names.forEach(function (name) { var spec = self.sim.abilitySpec(u, name), b = document.createElement('button'); b.className = 'action-btn ' + (name === 'Attack' ? 'attack' : spec.kind === 'heal' || spec.kind === 'buff' ? 'support' : spec.kind === 'terrain' ? 'terrain' : ''); b.disabled = u.mp < spec.cost; b.title = name + (spec.cost ? ' · ' + spec.cost + ' MP' : '') + (spec.desc ? ' · ' + spec.desc : ''); b.setAttribute('aria-label', b.title); b.innerHTML = '<b><span class="action-icon" aria-hidden="true">' + abilityIcon(name) + '</span><span class="action-label">' + name.toUpperCase() + '</span></b>'; b.addEventListener('click', function () { self.userGesture(); if (self.sim.beginAction(name)) { self.emitSound('confirm', .35); self.confirmKey = null; self.syncUI(true); self.render(); } }); panel.appendChild(b); });
    var end = document.createElement('button'); end.className = 'action-btn'; end.title = 'Wait and finish turn safely'; end.setAttribute('aria-label', end.title); end.innerHTML = '<b><span class="action-icon" aria-hidden="true">⌛</span><span class="action-label">WAIT</span></b>'; end.addEventListener('click', function () { self.userGesture(); self.sim.endTurn(); self.syncUI(true); self.render(); }); panel.appendChild(end);
    if (s.mode === 'action' && u.moveUsed) { var undo = document.createElement('button'); undo.className = 'action-btn'; undo.title = 'Undo move'; undo.setAttribute('aria-label', undo.title); undo.innerHTML = '<b><span class="action-icon" aria-hidden="true">↶</span><span class="action-label">UNDO</span></b>'; undo.addEventListener('click', function () { self.sim.undoMove(); self.syncUI(true); self.render(); }); panel.appendChild(undo); }
    if (s.mode !== 'aim') { ['Surge','Rally'].forEach(function (name) { var b = document.createElement('button'); b.className = 'action-btn tempo'; b.disabled = s.tempo[u.team] < (name === 'Surge' ? 2 : 3); b.title = name + ' · costs ' + (name === 'Surge' ? 2 : 3) + ' tempo'; b.setAttribute('aria-label', b.title); b.innerHTML = '<b><span class="action-icon" aria-hidden="true">✦</span><span class="action-label">' + name.toUpperCase() + '</span></b>'; b.addEventListener('click', function () { self.userGesture(); self.sim.spendTempo(name); self.syncUI(true); self.render(); }); panel.appendChild(b); }); }
  };
  EmberholdScene.prototype.updateMenu = function () {
    var grid = $('scenario-grid'); if (!grid) return;
    if (grid.dataset.ready !== '1') { grid.dataset.ready = '1'; var self = this; Object.keys(Sim.MAPS).forEach(function (k) { var n = Number(k), b = document.createElement('button'); b.dataset.skirmish = String(n); b.addEventListener('click', function () { self.userGesture(); self.closeMenu(); self.startSkirmish(n, urlSeed); }); grid.appendChild(b); }); }
    Array.from(grid.children).forEach(function (b) { var n = Number(b.dataset.skirmish), map = Sim.MAPS[n], best = profile.bestRounds[n] ? ' · BEST ' + profile.bestRounds[n] : ''; b.textContent = (profile.medals[n] ? '★'.repeat(profile.medals[n]) + ' ' : '') + n + ' ' + map.name + ' · ' + map.objective.label + best; b.className = n > profile.unlocked ? 'locked' : n === (this.sim && this.sim.state.skirmish) ? 'selected' : ''; b.disabled = n > profile.unlocked; }, this);
    this.renderRosterMenu();
    if ($('menu-seed')) setTextIfChanged($('menu-seed'), 'SEED ' + (this.sim ? this.sim.state.seed : urlSeed)); if ($('menu-status')) setTextIfChanged($('menu-status'), 'BATTLE ' + (this.sim ? this.sim.state.skirmish : 1) + ' / 20 · ' + (profile.unlocked >= (this.sim ? this.sim.state.skirmish : 1) ? 'UNLOCKED' : 'LOCKED'));
  };
  EmberholdScene.prototype.renderRosterMenu = function () {
    var panel = $('roster-grid'); if (!panel) return; var self = this; panel.replaceChildren(); profile.roster.forEach(function (member) {
      var row = document.createElement('div'); row.className = 'roster-row'; var active = profile.activeRoster.indexOf(member.id) >= 0, options = Sim.PROMOTIONS[member.job] || [], toggle = document.createElement('button'), gear = document.createElement('button'), promote;
      toggle.className = 'roster-toggle' + (active ? ' active' : ''); toggle.disabled = profile.permadeath && !member.alive; toggle.textContent = (active ? '● ' : '○ ') + member.name + ' · ' + member.job + ' L' + member.level + (member.promotion ? ' · ' + member.promotion : '') + (!member.alive ? ' · FALLEN' : ''); toggle.title = 'Toggle active roster slot'; toggle.addEventListener('click', function () { if (active) { if (profile.activeRoster.length <= 2) return; profile.activeRoster = profile.activeRoster.filter(function (id) { return id !== member.id; }); } else if (profile.activeRoster.length < 4 && (!profile.permadeath || member.alive)) profile.activeRoster.push(member.id); kit.save.set(profile); self.updateMenu(); });
      gear.className = 'roster-gear'; gear.textContent = (Sim.EQUIPMENT[member.equipment.weapon] || {}).label || 'GEAR'; gear.title = 'Cycle weapon or focus'; gear.addEventListener('click', function () { self.cycleEquipment(member); });
      if (member.promotion) { promote = document.createElement('button'); promote.className = 'roster-promote'; promote.textContent = 'MASTERED'; promote.disabled = true; }
      else if (member.level >= 3 && options.length) { promote = document.createElement('select'); promote.className = 'roster-promote'; promote.title = 'Choose a promotion branch'; options.forEach(function (option) { var choice = document.createElement('option'); choice.value = option.id; choice.textContent = option.label; promote.appendChild(choice); }); promote.addEventListener('change', function () { member.promotion = promote.value; kit.save.set(profile); self.showToast(member.name.toUpperCase() + ' PROMOTED · ' + promote.value.toUpperCase()); self.updateMenu(); }); }
      else { promote = document.createElement('button'); promote.className = 'roster-promote'; promote.textContent = member.level < 3 ? 'XP ' + member.xp + '/200' : 'TREE'; promote.disabled = true; }
      row.appendChild(toggle); row.appendChild(gear); row.appendChild(promote); panel.appendChild(row);
    });
  };
  EmberholdScene.prototype.cycleEquipment = function (member) { var order = Sim.EQUIPMENT_ORDER, current = member.equipment.weapon, index = order.indexOf(current), next = order[(index + 1 + order.length) % order.length]; member.equipment.weapon = next; kit.save.set(profile); this.showToast(member.name.toUpperCase() + ' · ' + Sim.EQUIPMENT[next].label); this.updateMenu(); };
  EmberholdScene.prototype.promoteMember = function (member) { var options = Sim.PROMOTIONS[member.job] || [], selected = options[0]; if (!selected) return; member.promotion = selected.id; kit.save.set(profile); this.showToast(member.name.toUpperCase() + ' PROMOTED · ' + selected.label.toUpperCase()); this.updateMenu(); };
  EmberholdScene.prototype.userGesture = function () { this.audioUnlocked = true; try { kit.audio.resume(); kit.audio.music(this.dangerMusic ? 'intensity' : 'ambient', 500); } catch (e) {} };
  EmberholdScene.prototype.claimPointer = function (e, zone) { var p = kit.input.pointers.get(e.pointerId); if (p) p.zone = zone; return p; };
  EmberholdScene.prototype.requestRestart = function () { kit.restart(); };
  EmberholdScene.prototype.moveCursor = function (dx, dy) {
    var s = this.sim.state, a = s.active; if (!a) return;
    var cur = this.cursor || {c:a.c,r:a.r}; this.cursor = {c:clamp(cur.c + dx, 0, N - 1), r:clamp(cur.r + dy, 0, N - 1)}; this.render();
  };
  EmberholdScene.prototype.activateCursor = function () {
    if (!this.cursor || !this.sim.state.active) return;
    this.handleTile(this.cursor);
  };
  EmberholdScene.prototype.pollGamepad = function () {
    if (!this.sim || this.sim.state.ended) return;
    var pad = kit.input.gamepadState(); if (!pad) return;
    var pressed = function (index) { return !!(pad.buttons[index] && pad.buttons[index].pressed); };
    var menu = pressed(8); if (kit.paused) { if (menu && !this.gamepadLatch.menu) this.closeMenu(); this.gamepadLatch = {menu:menu}; return; }
    var axisX = Math.abs(pad.axes[0] || 0) > .55 ? Math.sign(pad.axes[0]) : 0, axisY = Math.abs(pad.axes[1] || 0) > .55 ? Math.sign(pad.axes[1]) : 0;
    if (axisX && !this.gamepadLatch.axisX) this.moveCursor(axisX, 0); if (axisY && !this.gamepadLatch.axisY) this.moveCursor(0, axisY);
    var accept = pressed(0) || pressed(9), cancel = pressed(1), end = pressed(3);
    if (accept && !this.gamepadLatch.accept) this.activateCursor(); if (cancel && !this.gamepadLatch.cancel) { this.sim.cancelAction(); this.confirmKey = null; this.syncUI(true); this.render(); }
    if (end && !this.gamepadLatch.end) { if (this.sim.endTurn()) { profile.tutorialDone = true; kit.save.set(profile); this.syncUI(true); this.render(); } }
    if (menu && !this.gamepadLatch.menu) this.openMenu();
    this.gamepadLatch = {axisX:axisX,axisY:axisY,accept:accept,cancel:cancel,end:end,menu:menu};
  };
  EmberholdScene.prototype.openMenu = function () { $('menu-sheet').hidden = false; kit.pause('menu'); this.updateMenu(); };
  EmberholdScene.prototype.closeMenu = function () { $('menu-sheet').hidden = true; kit.resume('menu'); };
  EmberholdScene.prototype.handleTile = function (tile) {
    var s = this.sim.state, u = s.active; if (!u || u.team !== 'player' || s.ended) return;
    if (s.mode === 'aim' && s.action) { if (!this.sim.validTarget(u, s.action, tile.c, tile.r)) { this.showToast('NO VALID TARGET'); return; } var k = mapKey(tile.c, tile.r); if (this.confirmKey === k) { this.sim.confirmAction(tile.c, tile.r); this.confirmKey = null; this.syncUI(true); this.render(); } else { s.aim = tile; this.confirmKey = k; this.showToast('TAP AGAIN OR PRESS CONFIRM'); this.syncUI(true); this.render(); } return; }
    if (s.mode === 'move') { var quick = this.sim.unitAt(tile.c, tile.r); if (quick && quick.team !== u.team && this.sim.validTarget(u, this.sim.abilitySpec(u, 'Attack'), tile.c, tile.r) && this.sim.beginAction('Attack')) { s.aim = tile; this.confirmKey = mapKey(tile.c, tile.r); this.syncUI(true); this.render(); return; } if (this.sim.selectMove(tile.c, tile.r)) { this.userGesture(); this.syncUI(true); this.render(); } return; }
    if (s.mode === 'action') { var target = this.sim.unitAt(tile.c, tile.r); if (target && target.team !== u.team && this.sim.beginAction('Attack')) { s.aim = tile; this.confirmKey = mapKey(tile.c, tile.r); this.syncUI(true); this.render(); } }
  };
  EmberholdScene.prototype.wireInput = function () {
    var self = this, canvas = this.game.canvas;
    function boardPointers() { return Array.from(kit.input.pointers.values()).filter(function (p) { return p.board; }); }
    /* GGKit owns the pointer object. Claims are registered on window after
       GGKit init, never on the canvas pointerdown path. */
    window.addEventListener('pointerdown', function (e) {
      var p = kit.input.pointers.get(e.pointerId); if (!p) return;
      if (canvas.contains(e.target)) { self.userGesture(); if (self.sim.state.ended) return; p.board = true; p.lastX = e.clientX; p.lastY = e.clientY; p.moved = false; var two = boardPointers(); if (two.length >= 2) self.pinch = {distance:Math.hypot(two[1].x - two[0].x, two[1].y - two[0].y),cx:(two[0].x + two[1].x) / 2,cy:(two[0].y + two[1].y) / 2}; }
      else if (e.target && e.target.closest) p.zone = e.target.closest('#menu-sheet') ? 'menu' : 'hud';
    });
    window.addEventListener('pointermove', function (e) {
      var d = kit.input.pointers.get(e.pointerId); if (!d || !d.board) return;
      var prevX = d.lastX, prevY = d.lastY; d.lastX = e.clientX; d.lastY = e.clientY; d.x = e.clientX; d.y = e.clientY; var two = boardPointers();
      if (two.length >= 2) { var nextDistance = Math.max(1, Math.hypot(two[1].x - two[0].x, two[1].y - two[0].y)), nextCx = (two[0].x + two[1].x) / 2, nextCy = (two[0].y + two[1].y) / 2; if (self.pinch) { self.zoom = clamp(self.zoom * nextDistance / self.pinch.distance, .78, 1.5); self.panX = clamp(self.panX + (nextCx - self.pinch.cx) * W / self.game.canvas.getBoundingClientRect().width, -260, 260); self.panY = clamp(self.panY + (nextCy - self.pinch.cy) * H / self.game.canvas.getBoundingClientRect().height, -180, 180); } self.pinch = {distance:nextDistance,cx:nextCx,cy:nextCy}; two.forEach(function (item) { item.moved = true; }); return; }
      var dx = e.clientX - d.startX, dy = e.clientY - d.startY; if (Math.abs(dx) + Math.abs(dy) > (e.pointerType === 'touch' ? 16 : 5)) d.moved = true; if (d.moved) { self.panX = clamp(self.panX + (e.clientX - prevX) * W / self.game.canvas.getBoundingClientRect().width, -260, 260); self.panY = clamp(self.panY + (e.clientY - prevY) * H / self.game.canvas.getBoundingClientRect().height, -180, 180); }
    }, {passive:true});
    window.addEventListener('pointerup', function (e) {
      var d = kit.input.pointers.get(e.pointerId); if (!d || !d.board) return; var wasPinch = !!self.pinch; var two = boardPointers(); if (two.length < 2) self.pinch = null;
      if (!d.moved && !wasPinch) { var tile = self.tileFromPointer(e.clientX, e.clientY), now = performance.now(), dbl = now - self.lastTap.time < 320 && Math.abs(e.clientX - self.lastTap.x) + Math.abs(e.clientY - self.lastTap.y) < 48; self.lastTap = {time:now,x:e.clientX,y:e.clientY}; if (tile) self.handleTile(tile); else if (dbl) self.zoom = self.zoom > 1.15 ? 1 : 1.35; }
      self.render();
    }, {capture:true});
    window.addEventListener('pointercancel', function () { self.pinch = null; }, {capture:true});
    canvas.addEventListener('wheel', function (e) { e.preventDefault(); self.zoom = clamp(self.zoom * (e.deltaY < 0 ? 1.08 : .92), .78, 1.5); self.render(); }, {passive:false});
  };
  EmberholdScene.prototype.wireDom = function () {
    var self = this;
    $('menu-btn').addEventListener('click', function () { self.userGesture(); self.openMenu(); });
    $('close-menu').addEventListener('click', function () { self.closeMenu(); });
    $('menu-sheet').addEventListener('click', function (e) { if (e.target === $('menu-sheet')) self.closeMenu(); });
    $('end-turn').addEventListener('click', function () { self.userGesture(); if (self.sim.endTurn()) { profile.tutorialDone = true; kit.save.set(profile); self.syncUI(true); self.render(); } });
    $('confirm-chip').addEventListener('click', function () { self.userGesture(); var s = self.sim.state; if (s.aim && s.action) { self.sim.confirmAction(s.aim.c, s.aim.r); self.confirmKey = null; self.syncUI(true); self.render(); } });
    $('cancel-chip').addEventListener('click', function () { self.sim.cancelAction(); self.confirmKey = null; self.syncUI(true); self.render(); });
    $('restart-map').addEventListener('click', function () { self.closeMenu(); self.requestRestart(); }); $('random-map').addEventListener('click', function () { self.closeMenu(); self.startSkirmish(self.sim.state.skirmish, (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0); });
    $('rotate-map').addEventListener('click', function () { self.rot = (self.rot + 1) % 4; setTextIfChanged($('rotate-map'), 'ROTATE ' + self.rot * 90 + '°'); self.render(); }); $('speed-map').addEventListener('click', function () { self.speed = self.speed === 1 ? 2 : 1; setTextIfChanged($('speed-map'), 'SPEED ' + self.speed + 'x'); });
    $('permadeath-map').addEventListener('click', function () { profile.permadeath = !profile.permadeath; kit.save.set(profile); self.showToast('PERMADEATH ' + (profile.permadeath ? 'ON' : 'OFF')); self.updateMenu(); });
    $('motion-map').addEventListener('click', function () { kit.openSettings([function (box, row) { row('Reduced motion', function () { return reducedMotion; }, function (value) { profile.reducedMotion = !!value; reducedMotion = profile.reducedMotion || !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); kit.save.set(profile); self.updateMenu(); }); }]); });
    $('same-map').addEventListener('click', function () { $('banner').hidden = true; self.requestRestart(); }); $('next-map').addEventListener('click', function () { if (self.sim.state.skirmish < 20 && self.sim.state.winner === 'player') { $('banner').hidden = true; self.startSkirmish(self.sim.state.skirmish + 1, urlSeed); } });
    window.addEventListener('keydown', function (e) { if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return; var k = e.key.toLowerCase(); if (!$('menu-sheet').hidden) { if (k === 'escape' || k === 'm') { self.closeMenu(); e.preventDefault(); } return; } if (!kit.input.keyDown(e.code)) return; if (k === 'm') { self.openMenu(); e.preventDefault(); return; } if (k === 'r') { self.requestRestart(); e.preventDefault(); return; } if (k === 'escape') { self.sim.cancelAction(); self.confirmKey = null; self.syncUI(true); self.render(); e.preventDefault(); return; } if (k === 'e') { if (self.sim.endTurn()) { profile.tutorialDone = true; kit.save.set(profile); self.syncUI(true); self.render(); } e.preventDefault(); return; } if (k === ' ' || k === 'enter') { self.activateCursor(); e.preventDefault(); return; } var v = {arrowup:[0,-1],w:[0,-1],arrowdown:[0,1],s:[0,1],arrowleft:[-1,0],a:[-1,0],arrowright:[1,0],d:[1,0]}[k]; if (v && self.sim.state.active) { self.moveCursor(v[0], v[1]); e.preventDefault(); } });
  };
  EmberholdScene.prototype.updateCinematic = function () {
    if (!this.cinematic) return;
    var c = this.cinematic, p = clamp((this.visualTime - c.start) / c.duration,0,1), ease = p * p * (3 - 2 * p), direction = c.kind === 'player' ? 1 : -1;
    if (!reducedMotion) { this.zoom = c.baseZoom + direction * ease * .08; this.panX = c.basePanX + direction * ease * 34; this.panY = c.basePanY - ease * 12; }
    if (!c.shown && p >= 1) { c.shown = true; c.show(); }
  };
  EmberholdScene.prototype.update = function (time, delta) {
    if (this.paused || !this.sim) return;
    this.visualTime += Math.min(delta, 50); this.accumulator += Math.min(delta, 50); this.coachTimer = Math.max(0, this.coachTimer - Math.min(delta, 50)); this.updateCinematic();
    var steps = 0, juice = kit.juice.frame();
    this.shakeX = juice.dx; this.shakeY = juice.dy; this.damageFlash = Math.max(0, this.damageFlash - Math.min(delta, 50)); this.pollGamepad();
    if (!juice.frozen) while (this.accumulator >= STEP && steps < 4) { this.sim.step(STEP * this.speed); this.accumulator -= STEP; steps++; this.consumeEvents(); }
    this.updateFx(Math.min(delta, 50)); this.render(); this.syncUI(false); this.clearDeadViews();
  };

  kit.loader.show('EMBERHOLD TACTICS'); kit.loader.progress(.25);
  var game = new Phaser.Game({type:Phaser.CANVAS, width:W, height:H, parent:'game', backgroundColor:'#070d18', scene:[EmberholdScene], render:{antialias:true, roundPixels:false}, scale:{mode:Phaser.Scale.FIT, autoCenter:Phaser.Scale.CENTER_BOTH}, audio:{disableWebAudio:true}});
  kit.loader.progress(1);
  window.__et.game = game;
}());
