/* Razorfin juice, audio, and music. Lane F. Classic script, no dependencies. */
(function (root) {
  'use strict';

  root.RF = root.RF || {};
  var RF = root.RF;
  var EMPTY = {};
  var TAU = Math.PI * 2;

  function data() { return root.RFD || {}; }
  function finite(value, fallback) {
    return (typeof value === 'number' && isFinite(value)) ? value : fallback;
  }
  function clamp(value, low, high) {
    value = finite(value, low);
    return value < low ? low : value > high ? high : value;
  }
  function eachKey(obj, fn) {
    if (!obj) return;
    for (var key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) fn(key, obj[key]);
    }
  }

  /* ------------------------------------------------------------------ Fx */
  var Fx = (function () {
    var scene = null;
    var boundScene = null;
    var pools = Object.create(null);
    var poolConfig = {
      bubbles: { size: 96, key: 'bubble_a', life: 850, scale: 0.42, speed: 34, mode: 0 },
      motes: { size: 72, key: 'bubble_b', life: 520, scale: 0.34, speed: 145, mode: 1 },
      elementSpark: { size: 64, key: 'bubble_c', life: 430, scale: 0.27, speed: 190, mode: 2 },
      ring: { size: 24, key: 'bubble_c', life: 560, scale: 0.5, speed: 0, mode: 3 },
      beamCore: { size: 12, key: 'bubble_b', life: 92, scale: 1, speed: 0, mode: 4 },
    };
    var poolNames = ['bubbles', 'motes', 'elementSpark', 'ring', 'beamCore'];

    function nullSprite() {
      return {
        x: 0, y: 0, alpha: 0, visible: false, active: false, rotation: 0,
        scaleX: 1, scaleY: 1, setPosition: function (x, y) { this.x = x; this.y = y; return this; },
        setVisible: function (v) { this.visible = v; return this; },
        setActive: function (v) { this.active = v; return this; },
        setAlpha: function (v) { this.alpha = v; return this; },
        setScale: function (x, y) { this.scaleX = x; this.scaleY = y == null ? x : y; return this; },
        setRotation: function (v) { this.rotation = v; return this; },
        setTint: function (v) { this.tint = v; return this; },
        clearTint: function () { delete this.tint; return this; },
        setBlendMode: function (v) { this.blendMode = v; return this; },
        setDisplaySize: function (x, y) { this.displayWidth = x; this.displayHeight = y; return this; },
        destroy: function () {},
      };
    }

    function makeSprite(target, key, x, y) {
      var sprite = null;
      try {
        if (target && target.add && typeof target.add.image === 'function') {
          sprite = target.add.image(x, y, key);
        } else if (target && target.add && typeof target.add.circle === 'function') {
          sprite = target.add.circle(x, y, 12, 0xffffff, 1);
        }
      } catch (err) { sprite = null; }
      return sprite || nullSprite();
    }

    function additive(sprite) {
      if (!sprite || typeof sprite.setBlendMode !== 'function') return;
      var phaser = root.Phaser;
      var add = phaser && phaser.BlendModes ? phaser.BlendModes.ADD : 1;
      try { sprite.setBlendMode(add); } catch (err) {}
    }

    function hide(item) {
      item.active = false;
      var sprite = item.sprite;
      if (!sprite) return;
      if (typeof sprite.setVisible === 'function') sprite.setVisible(false);
      else sprite.visible = false;
      if (typeof sprite.setActive === 'function') sprite.setActive(false);
      else sprite.active = false;
    }

    function show(item) {
      item.active = true;
      var sprite = item.sprite;
      if (!sprite) return;
      if (typeof sprite.setVisible === 'function') sprite.setVisible(true);
      else sprite.visible = true;
      if (typeof sprite.setActive === 'function') sprite.setActive(true);
      else sprite.active = true;
    }

    function tint(sprite, value) {
      if (!sprite) return;
      if (value != null && typeof sprite.setTint === 'function') {
        try { sprite.setTint(value >>> 0); } catch (err) {}
      } else if (value == null && typeof sprite.clearTint === 'function') {
        try { sprite.clearTint(); } catch (err2) {}
      }
    }

    function setPosition(sprite, x, y) {
      if (!sprite) return;
      if (typeof sprite.setPosition === 'function') sprite.setPosition(x, y);
      else { sprite.x = x; sprite.y = y; }
    }

    function setAlpha(sprite, value) {
      if (!sprite) return;
      if (typeof sprite.setAlpha === 'function') sprite.setAlpha(value);
      else sprite.alpha = value;
    }

    function setScale(sprite, x, y) {
      if (!sprite) return;
      if (typeof sprite.setScale === 'function') sprite.setScale(x, y == null ? x : y);
      else { sprite.scaleX = x; sprite.scaleY = y == null ? x : y; }
    }

    function setRotation(sprite, value) {
      if (!sprite) return;
      if (typeof sprite.setRotation === 'function') sprite.setRotation(value);
      else sprite.rotation = value;
    }

    function buildPool(name, config) {
      var pool = { name: name, config: config, items: [], cursor: 0 };
      var i;
      for (i = 0; i < config.size; i++) {
        var item = {
          active: false, sprite: makeSprite(scene, config.key, 0, 0),
          life: 0, maxLife: config.life, age: 0,
          x: 0, y: 0, vx: 0, vy: 0, gravity: 0,
          rotation: 0, spin: 0, baseScale: config.scale,
          length: 0, width: 0, tint: null, slot: i,
        };
        additive(item.sprite);
        hide(item);
        pool.items.push(item);
      }
      return pool;
    }

    function unbind() {
      if (boundScene && boundScene.events && typeof boundScene.events.off === 'function') {
        try { boundScene.events.off('update', update); } catch (err) {}
      }
      boundScene = null;
    }

    function init(target) {
      if (!target) return Fx;
      if (scene === target && pools.bubbles) return Fx;
      unbind();
      scene = target;
      pools = Object.create(null);
      eachKey(poolConfig, function (name, config) { pools[name] = buildPool(name, config); });
      if (scene.events && typeof scene.events.on === 'function') {
        boundScene = scene;
        try { scene.events.on('update', update); } catch (err) { boundScene = null; }
      }
      return Fx;
    }

    function poolFor(name) {
      if (name === 'bubbles') return pools.bubbles;
      if (name === 'motes' || name === 'chomp' || name === 'deathBurst') return pools.motes;
      if (name === 'elementSpark') return pools.elementSpark;
      if (name === 'ring') return pools.ring;
      if (name === 'beamCore') return pools.beamCore;
      return null;
    }

    function acquire(pool) {
      var i, item;
      for (i = 0; i < pool.items.length; i++) {
        item = pool.items[(pool.cursor + i) % pool.items.length];
        if (!item.active) {
          pool.cursor = (item.slot + 1) % pool.items.length;
          return item;
        }
      }
      return null;
    }

    function activate(item, x, y, opts, pool) {
      var config = pool.config;
      var angleProvided = opts.angle != null;
      var angle = angleProvided ? finite(opts.angle, 0) * Math.PI / 180 : 0;
      var spread = config.mode === 0 ? 0.18 : (config.mode === 3 ? 0 : 0.72);
      var ordinal = item.slot;
      var offset = ((ordinal % 11) - 5) / 5;
      var theta = angle + offset * spread;
      var speed = finite(opts.speed, config.speed);
      var scale = clamp(opts.scale == null ? config.scale : opts.scale, 0.05, 8);
      var life = clamp(opts.life == null ? config.life : opts.life, 20, 2500);
      var tintValue = opts.tint;

      item.life = life;
      item.maxLife = life;
      item.age = 0;
      item.x = finite(x, 0);
      item.y = finite(y, 0);
      item.baseScale = scale;
      item.tint = tintValue;
      item.rotation = angleProvided ? angle : (ordinal % 16) * (TAU / 16);
      item.spin = config.mode === 3 ? 0 : (0.5 + (ordinal % 5) * 0.16) * (ordinal % 2 ? -1 : 1);
      item.vx = Math.cos(theta) * speed;
      item.vy = Math.sin(theta) * speed;
      item.gravity = config.mode === 1 ? 150 : config.mode === 2 ? 75 : 0;
      item.length = 0;
      item.width = 0;
      tint(item.sprite, tintValue);
      show(item);
      setPosition(item.sprite, item.x, item.y);
      setAlpha(item.sprite, config.mode === 3 ? 0.75 : 0.88);
      setRotation(item.sprite, item.rotation);
      setScale(item.sprite, scale);
    }

    function emit(name, x, y, opts) {
      var pool = poolFor(name);
      if (!pool) return 0;
      opts = opts || EMPTY;
      var requested = opts.count == null ? (name === 'bubbles' ? 3 : 1) : Math.floor(finite(opts.count, 1));
      var count = requested < 0 ? 0 : requested > 24 ? 24 : requested;
      var emitted = 0;
      var i, item;
      for (i = 0; i < count; i++) {
        item = acquire(pool);
        if (!item) break;
        activate(item, x, y, opts, pool);
        emitted++;
      }
      return emitted;
    }

    function beam(x1, y1, x2, y2, opts) {
      var pool = pools.beamCore;
      if (!pool) return false;
      opts = opts || EMPTY;
      var item = acquire(pool);
      if (!item) return false;
      var dx = finite(x2, 0) - finite(x1, 0);
      var dy = finite(y2, 0) - finite(y1, 0);
      var length = Math.sqrt(dx * dx + dy * dy);
      if (length < 1) return false;
      var width = clamp(opts.width == null ? 18 : opts.width, 2, 160);
      var scale = clamp(opts.scale == null ? 1 : opts.scale, 0.05, 8);
      var config = pool.config;
      item.life = clamp(opts.life == null ? config.life : opts.life, 20, 400);
      item.maxLife = item.life;
      item.age = 0;
      item.x = (finite(x1, 0) + finite(x2, 0)) * 0.5;
      item.y = (finite(y1, 0) + finite(y2, 0)) * 0.5;
      item.vx = 0;
      item.vy = 0;
      item.length = length;
      item.width = width;
      item.baseScale = scale;
      item.rotation = Math.atan2(dy, dx);
      item.tint = opts.tint;
      tint(item.sprite, item.tint);
      show(item);
      setPosition(item.sprite, item.x, item.y);
      setRotation(item.sprite, item.rotation);
      setAlpha(item.sprite, 0.9);
      applyBeamSize(item);
      return true;
    }

    function applyBeamSize(item) {
      var sprite = item.sprite;
      if (!sprite) return;
      var pulse = 0.9 + 0.1 * Math.sin(item.age * 0.035);
      if (typeof sprite.setDisplaySize === 'function') {
        sprite.setDisplaySize(item.length * item.baseScale, item.width * item.baseScale * pulse);
      } else {
        setScale(sprite, Math.max(0.1, item.length / 32) * item.baseScale, Math.max(0.1, item.width / 32) * item.baseScale * pulse);
      }
    }

    function update(time, delta) {
      var dt = clamp(delta == null ? 16.6667 : delta, 1, 50);
      var ni, i, pool, item, config, lifeRatio, scale;
      for (ni = 0; ni < poolNames.length; ni++) {
        pool = pools[poolNames[ni]];
        if (!pool) continue;
        config = pool.config;
        for (i = 0; i < pool.items.length; i++) {
          item = pool.items[i];
          if (!item.active) continue;
          item.age += dt;
          item.life -= dt;
          if (item.life <= 0) {
            hide(item);
            continue;
          }
          lifeRatio = item.life / item.maxLife;
          if (config.mode === 0 || config.mode === 1 || config.mode === 2) {
            item.vy += item.gravity * dt / 1000;
            item.x += item.vx * dt / 1000;
            item.y += item.vy * dt / 1000;
            setPosition(item.sprite, item.x, item.y);
            setRotation(item.sprite, item.rotation + item.age * item.spin * 0.002);
            scale = item.baseScale * (config.mode === 0 ? 0.78 + 0.22 * lifeRatio : 0.72 + 0.28 * lifeRatio);
            setScale(item.sprite, scale);
            setAlpha(item.sprite, lifeRatio * (config.mode === 0 ? 0.72 : 0.92));
          } else if (config.mode === 3) {
            setAlpha(item.sprite, lifeRatio * 0.78);
            setScale(item.sprite, item.baseScale * (1 + (1 - lifeRatio) * 2.6));
          } else {
            setPosition(item.sprite, item.x, item.y);
            setAlpha(item.sprite, lifeRatio * 0.94);
            applyBeamSize(item);
          }
        }
      }
    }

    function selftest() {
      var notes = [];
      var oldScene = scene;
      var oldBound = boundScene;
      var oldPools = pools;
      var objects = [];
      var testScene = {
        add: {
          image: function (x, y) {
            var s = nullSprite();
            s.x = x; s.y = y; objects.push(s);
            return s;
          },
        },
        events: { on: function () {}, off: function () {} },
      };
      var pass = true;
      try {
        init(testScene);
        var i;
        for (i = 0; i < poolNames.length; i++) {
          if (!pools[poolNames[i]] || !pools[poolNames[i]].items.length) pass = false;
          emit(poolNames[i], 20 + i, 30 + i, { count: 1, tint: 0x74eaff, scale: 0.8 });
        }
        if (!beam(0, 0, 100, 0, { tint: 0x8dffda })) pass = false;
        update(0, 16);
        notes.push('five pooled families constructed and emitted');
        notes.push('manual update completed without allocation paths');
      } catch (err) {
        pass = false;
        notes.push('pool self-test threw: ' + (err && err.message ? err.message : String(err)));
      }
      if (boundScene && boundScene !== oldBound && boundScene.events && typeof boundScene.events.off === 'function') {
        try { boundScene.events.off('update', update); } catch (err2) {}
      }
      scene = oldScene;
      pools = oldPools;
      boundScene = oldBound;
      if (oldBound && oldBound.events && typeof oldBound.events.on === 'function') {
        try { oldBound.events.on('update', update); } catch (err3) {}
      }
      return { pass: pass, notes: notes };
    }

    return { init: init, emit: emit, beam: beam, update: update, __selftest: selftest };
  })();

  /* --------------------------------------------------------------- Juice */
  var pendingFreezeMs = 0;
  var pendingSlowmoScale = 1;
  var pendingSlowmoMs = 0;
  var slowmoResult = { scale: 1, ms: 0 };
  var shakeUntil = 0;
  var shakeMax = 0;
  var juiceScene = null;

  function nowMs(target) {
    var ctx = RF.ctx;
    if (ctx && ctx.time) return finite(ctx.time.now, 0);
    if (target && target.time) return finite(target.time.now, 0);
    return 0;
  }

  function hitStop(ms) {
    pendingFreezeMs = clamp(pendingFreezeMs + clamp(ms, 0, 500), 0, 500);
    return pendingFreezeMs;
  }

  function consumeFreeze() {
    var result = pendingFreezeMs;
    pendingFreezeMs = 0;
    return result;
  }

  function shake(intensity, ms) {
    var target = juiceScene || (RF.ctx && RF.ctx.scene);
    var duration = clamp(ms, 1, 500);
    var amount = clamp(intensity, 0, 40);
    var now = nowMs(target);
    if (now >= shakeUntil) shakeMax = 0;
    shakeMax = Math.max(shakeMax, amount);
    shakeUntil = Math.max(shakeUntil, now + duration);
    var camera = target && target.cameras && target.cameras.main;
    if (camera && typeof camera.shake === 'function') {
      var phaserIntensity = shakeMax <= 1 ? shakeMax : Math.min(0.08, shakeMax / 100);
      try { camera.shake(Math.min(500, shakeUntil - now), phaserIntensity, true); } catch (err) {}
    }
    return shakeMax;
  }

  function slowmo(scale, ms) {
    pendingSlowmoScale = Math.min(pendingSlowmoScale, clamp(scale, 0.05, 1));
    pendingSlowmoMs = Math.max(pendingSlowmoMs, clamp(ms, 1, 5000));
    return pendingSlowmoMs;
  }

  function consumeSlowmo() {
    if (pendingSlowmoMs <= 0) return null;
    slowmoResult.scale = pendingSlowmoScale;
    slowmoResult.ms = pendingSlowmoMs;
    pendingSlowmoScale = 1;
    pendingSlowmoMs = 0;
    return slowmoResult;
  }

  function makeGlow(sceneTarget, ent, color) {
    if (!sceneTarget || !sceneTarget.add) return null;
    var glow = null;
    try {
      if (typeof sceneTarget.add.circle === 'function') {
        glow = sceneTarget.add.circle(ent.x || 0, ent.y || 0, Math.max(24, (ent.r || 48) * 1.55), color, 0.2);
      }
    } catch (err) { glow = null; }
    if (glow) {
      if (typeof glow.setBlendMode === 'function') {
        var phaser = root.Phaser;
        var add = phaser && phaser.BlendModes ? phaser.BlendModes.ADD : 1;
        try { glow.setBlendMode(add); } catch (blendErr) {}
      }
      if (typeof glow.setDepth === 'function') {
        try { glow.setDepth(-1); } catch (err2) {}
      }
    }
    return glow;
  }

  function kaiju(ent, sceneTarget) {
    if (!ent || (ent.defId !== 'leviathanrex' && ent.defId !== 'leviathan_rex')) return false;
    sceneTarget = sceneTarget || (RF.ctx && RF.ctx.scene) || juiceScene;
    if (sceneTarget && sceneTarget !== juiceScene) juiceScene = sceneTarget;
    var scratch = ent.st || (ent.st = {});
    var state = scratch._rfKaiju;
    if (ent.active === false) {
      if (state && state.glow && typeof state.glow.destroy === 'function') {
        try { state.glow.destroy(); } catch (err) {}
      }
      if (state) state.glow = null;
      return false;
    }
    if (!state || state.entityId !== ent.id) {
      if (state && state.glow && typeof state.glow.destroy === 'function') {
        try { state.glow.destroy(); } catch (err2) {}
      }
      state = scratch._rfKaiju = { entityId: ent.id, entered: false, nextBeat: 0, glow: null };
    }
    var time = nowMs(sceneTarget);
    var glowColor = 0x9effcb;
    if (!state.entered) {
      state.entered = true;
      state.nextBeat = time;
      RF.Sound.play('roar', { vol: 0.95 });
      RF.Sound.play('power_quake', { vol: 0.45 });
      shake(14, 360);
      if (RF.Fx && typeof RF.Fx.emit === 'function') RF.Fx.emit('elementSpark', ent.x, ent.y, { tint: glowColor, scale: 1.4, count: 6 });
    }
    if (time >= state.nextBeat) {
      RF.Sound.play('power_quake', { vol: 0.38 });
      state.nextBeat = time + 850;
    }
    if (!state.glow && sceneTarget) state.glow = makeGlow(sceneTarget, ent, glowColor);
    var pulse = 0.5 + 0.5 * Math.sin((time % 900) / 900 * TAU);
    if (state.glow) {
      if (typeof state.glow.setPosition === 'function') state.glow.setPosition(finite(ent.x, 0), finite(ent.y, 0));
      else { state.glow.x = finite(ent.x, 0); state.glow.y = finite(ent.y, 0); }
      if (typeof state.glow.setAlpha === 'function') state.glow.setAlpha(0.08 + pulse * 0.24);
      else state.glow.alpha = 0.08 + pulse * 0.24;
      if (typeof state.glow.setScale === 'function') state.glow.setScale(0.92 + pulse * 0.18);
    } else if (ent.sprite && typeof ent.sprite.setTint === 'function') {
      try { ent.sprite.setTint(glowColor); } catch (err3) {}
    }
    return true;
  }

  var Juice = {
    hitStop: hitStop,
    consumeFreeze: consumeFreeze,
    shake: shake,
    slowmo: slowmo,
    consumeSlowmo: consumeSlowmo,
    kaiju: kaiju,
    __selftest: function () {
      pendingFreezeMs = 0;
      hitStop(36);
      var value = consumeFreeze();
      var pass = value === 36 && consumeFreeze() === 0;
      return { pass: pass, notes: [pass ? 'hit-stop accumulator consumed and reset' : 'hit-stop cycle failed', 'slowmo reads through RF.Juice.consumeSlowmo()'] };
    },
  };
  RF.Fx = Fx;
  RF.Juice = Juice;

  /* --------------------------------------------------------------- Sound */
  var audioState = { kit: null, ctx: null, noiseCtx: null, noiseBuffer: null, registered: false };
  var SYNTH_SFX = {
    chomp: 'chomp', bubble: 'bubble', splash: 'splash',
    power_fire: 'fire', power_ice: 'ice', power_volt: 'volt', power_toxin: 'toxin',
    power_sonic: 'sonic', power_vortex: 'vortex', power_phase: 'phase',
    power_quake: 'quake', power_chrono: 'chrono', power_atomic: 'atomic',
    hurt: 'hurt', death: 'death', coin: 'coin', levelup: 'levelup',
    goldrush: 'goldrush', roar: 'roar',
  };
  var SYNTH_DURATION = {
    fire: 0.55, ice: 0.42, volt: 0.44, toxin: 0.68, sonic: 0.76,
    vortex: 0.7, phase: 0.56, quake: 0.78, chrono: 0.68, atomic: 1.7,
    hurt: 0.24, death: 0.86, coin: 0.2, levelup: 0.74, goldrush: 0.62,
    roar: 1.8, chomp: 0.2, bubble: 0.25, splash: 0.5,
  };

  function kitFor() {
    var ctx = RF.ctx;
    return ctx && ctx.kit ? ctx.kit : null;
  }

  function registerAssets(kit) {
    if (!kit || !kit.audio) return;
    if (audioState.kit === kit && audioState.registered) return;
    audioState.kit = kit;
    audioState.registered = true;
    if (typeof kit.audio.register !== 'function') return;
    var sfx = {};
    var music = {};
    var rows = data().SFX || {};
    var musicRows = data().MUSIC || {};
    eachKey(rows, function (name, file) { if (file) sfx[name] = 'assets/' + file; });
    eachKey(musicRows, function (name, file) { if (file) music[name] = 'assets/' + file; });
    try { kit.audio.register(sfx); kit.audio.register(music); } catch (err) {}
  }

  function exposedContext(kit) {
    var audio = kit && kit.audio;
    if (!audio) return null;
    var ctx = null;
    try { ctx = audio.context || audio.ctx || (typeof audio.getContext === 'function' ? audio.getContext() : null); } catch (err) { ctx = null; }
    return ctx && typeof ctx.createGain === 'function' ? ctx : null;
  }

  function audioContext(kit) {
    var ctx = exposedContext(kit);
    if (ctx) {
      audioState.ctx = ctx;
      return ctx;
    }
    if (audioState.ctx) return audioState.ctx;
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC && typeof globalThis !== 'undefined') AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return null;
    try { audioState.ctx = new AC(); } catch (err2) { audioState.ctx = null; }
    return audioState.ctx;
  }

  function unlock(kit, ctx) {
    if (kit && kit.audio && typeof kit.audio.resume === 'function') {
      try { kit.audio.resume(); } catch (err) {}
    }
    if (ctx && ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      try { ctx.resume(); } catch (err2) {}
    }
  }

  function pref(kit, channel) {
    var prefs = kit && kit.audio && kit.audio.prefs;
    if (!prefs) return 1;
    if (prefs.mute) return 0;
    return clamp(prefs[channel], 0, 1);
  }

  function outputNode(ctx, kit, channel, volume) {
    if (!ctx || typeof ctx.createGain !== 'function') return null;
    var out = ctx.createGain();
    var gain = clamp(volume, 0, 1) * pref(kit, channel);
    if (out.gain) out.gain.value = gain;
    var bus = kit && kit.audio && (channel === 'music' ? (kit.audio.musicGain || kit.audio.musicBus) : (kit.audio.sfxGain || kit.audio.sfxBus));
    try { out.connect(bus && typeof bus.connect === 'function' ? bus : ctx.destination); } catch (err) {}
    return out;
  }

  function paramValue(param, value) {
    if (!param) return;
    if (typeof param.setValueAtTime === 'function') param.setValueAtTime(value, audioState.ctx ? audioState.ctx.currentTime : 0);
    else param.value = value;
  }

  function ramp(param, value, at, when) {
    if (!param) return;
    if (typeof param.linearRampToValueAtTime === 'function') param.linearRampToValueAtTime(value, when + at);
    else param.value = value;
  }

  function tone(ctx, out, start, from, to, duration, type, volume, rate) {
    if (!ctx || typeof ctx.createOscillator !== 'function' || !out) return;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    var now = finite(start, 0);
    var dur = Math.max(0.03, duration);
    var level = clamp(volume, 0, 1);
    try {
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(Math.max(20, from * rate), now);
      if (typeof osc.frequency.exponentialRampToValueAtTime === 'function') osc.frequency.exponentialRampToValueAtTime(Math.max(20, to * rate), now + dur);
      if (gain.gain && typeof gain.gain.setValueAtTime === 'function') {
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(level, now + Math.min(0.025, dur * 0.2));
        gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      } else if (gain.gain) gain.gain.value = level;
      osc.connect(gain); gain.connect(out);
      osc.start(now); osc.stop(now + dur + 0.03);
    } catch (err) {}
  }

  function noiseBuffer(ctx) {
    if (!ctx || typeof ctx.createBuffer !== 'function') return null;
    if (audioState.noiseBuffer && audioState.noiseCtx === ctx) return audioState.noiseBuffer;
    try {
      var length = Math.max(1, Math.floor((ctx.sampleRate || 44100) * 0.9));
      var buffer = ctx.createBuffer(1, length, ctx.sampleRate || 44100);
      var channel = buffer.getChannelData(0);
      var seed = 0x51f15e;
      var i;
      for (i = 0; i < channel.length; i++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        channel[i] = (seed / 4294967296) * 2 - 1;
      }
      audioState.noiseCtx = ctx;
      audioState.noiseBuffer = buffer;
      return buffer;
    } catch (err) { return null; }
  }

  function noise(ctx, out, start, duration, volume, lowpass, highpass) {
    if (!ctx || typeof ctx.createBufferSource !== 'function' || !out) return;
    var buffer = noiseBuffer(ctx);
    if (!buffer) return;
    try {
      var src = ctx.createBufferSource();
      var gain = ctx.createGain();
      var node = src;
      if (typeof ctx.createBiquadFilter === 'function') {
        node = ctx.createBiquadFilter();
        node.type = highpass ? 'highpass' : 'lowpass';
        node.frequency.value = highpass || lowpass || 900;
        src.connect(node);
      } else src.connect(gain);
      if (node !== src) node.connect(gain);
      gain.connect(out);
      src.buffer = buffer;
      src.loop = true;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(clamp(volume, 0, 1), start + Math.min(0.04, duration * 0.2));
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      src.start(start); src.stop(start + duration + 0.03);
    } catch (err) {}
  }

  function synthesize(kind, ctx, out, start, rate) {
    var dur = SYNTH_DURATION[kind] || 0.45;
    var r = clamp(rate, 0.5, 2.5);
    switch (kind) {
      case 'fire': tone(ctx, out, start, 170, 48, dur, 'sawtooth', 0.42, r); noise(ctx, out, start, dur * 0.8, 0.34, 1600, 0); break;
      case 'ice': tone(ctx, out, start, 980, 1960, dur, 'sine', 0.42, r); tone(ctx, out, start, 1480, 2360, dur * 0.55, 'triangle', 0.18, r); break;
      case 'volt': tone(ctx, out, start, 140, 940, dur, 'square', 0.35, r); noise(ctx, out, start, dur * 0.6, 0.25, 0, 2400); break;
      case 'toxin': tone(ctx, out, start, 180, 85, dur, 'sine', 0.28, r); noise(ctx, out, start, dur * 0.8, 0.24, 850, 0); break;
      case 'sonic': tone(ctx, out, start, 92, 38, dur, 'sine', 0.5, r); noise(ctx, out, start, dur * 0.45, 0.3, 280, 0); break;
      case 'vortex': tone(ctx, out, start, 780, 110, dur, 'sine', 0.34, r); tone(ctx, out, start, 220, 520, dur, 'triangle', 0.18, r); break;
      case 'phase': tone(ctx, out, start, 460, 1280, dur, 'sine', 0.3, r); tone(ctx, out, start, 880, 330, dur * 0.8, 'sine', 0.15, r); break;
      case 'quake': tone(ctx, out, start, 58, 30, dur, 'sine', 0.55, r); noise(ctx, out, start, dur, 0.35, 180, 0); break;
      case 'chrono': tone(ctx, out, start, 1100, 880, dur, 'square', 0.25, r); tone(ctx, out, start + 0.11, 680, 540, dur * 0.5, 'sine', 0.16, r); break;
      case 'atomic': tone(ctx, out, start, 120, 720, 0.95, 'sawtooth', 0.25, r); tone(ctx, out, start + 0.78, 80, 34, 0.9, 'sine', 0.6, r); noise(ctx, out, start + 0.72, 0.95, 0.4, 460, 0); break;
      case 'hurt': tone(ctx, out, start, 180, 70, dur, 'square', 0.36, r); break;
      case 'death': tone(ctx, out, start, 220, 34, dur, 'sawtooth', 0.45, r); noise(ctx, out, start, dur * 0.7, 0.23, 320, 0); break;
      case 'coin': tone(ctx, out, start, 880, 1320, dur, 'sine', 0.3, r); break;
      case 'levelup': tone(ctx, out, start, 440, 880, dur * 0.7, 'triangle', 0.3, r); tone(ctx, out, start + 0.18, 660, 1320, dur * 0.7, 'sine', 0.25, r); break;
      case 'goldrush': tone(ctx, out, start, 180, 360, dur, 'square', 0.22, r); tone(ctx, out, start + 0.12, 720, 1080, dur * 0.5, 'sine', 0.25, r); break;
      case 'roar': tone(ctx, out, start, 78, 30, dur, 'sawtooth', 0.7, r); noise(ctx, out, start, dur * 0.75, 0.48, 380, 0); break;
      case 'chomp': tone(ctx, out, start, 180, 45, dur, 'square', 0.3, r); break;
      case 'bubble': tone(ctx, out, start, 250, 620, dur, 'sine', 0.2, r); break;
      case 'splash': noise(ctx, out, start, dur, 0.24, 1700, 0); break;
      default: tone(ctx, out, start, 220, 80, dur, 'sine', 0.2, r); break;
    }
  }

  function soundPlay(name, opts) {
    opts = opts || EMPTY;
    var rows = data().SFX || {};
    if (!Object.prototype.hasOwnProperty.call(rows, name)) return false;
    var kit = kitFor();
    registerAssets(kit);
    var volume = clamp(opts.vol == null ? (opts.volume == null ? 1 : opts.volume) : opts.vol, 0, 1);
    var rate = clamp(opts.rate == null ? 1 : opts.rate, 0.5, 2.5);
    var file = rows[name];
    if (file && kit && kit.audio && typeof kit.audio.sfx === 'function') {
      try { kit.audio.sfx(name, { volume: volume, rate: rate }); } catch (err) {}
      return true;
    }
    var kind = SYNTH_SFX[name];
    if (!kind || pref(kit, 'sfx') <= 0) return !!kind;
    var ctx = audioContext(kit);
    if (!ctx) return true;
    unlock(kit, ctx);
    var out = outputNode(ctx, kit, 'sfx', volume);
    if (!out) return true;
    var start = finite(ctx.currentTime, 0);
    try { synthesize(kind, ctx, out, start, rate); } catch (err2) {}
    return true;
  }

  var Sound = {
    play: soundPlay,
    __selftest: function () {
      var rows = data().SFX || {};
      var notes = [];
      var pass = true;
      eachKey(rows, function (name) {
        if (!Object.prototype.hasOwnProperty.call(SYNTH_SFX, name)) pass = false;
      });
      notes.push(pass ? 'synth fallback table covers every RFD.SFX key' : 'synth fallback table is missing an RFD.SFX key');
      notes.push('file-backed entries use kit.audio.sfx; null entries use lazy WebAudio synthesis');
      return { pass: pass, notes: notes };
    },
  };
  RF.Sound = Sound;

  /* --------------------------------------------------------------- Music */
  var musicLayer = null;
  var musicOverlay = null;

  function musicRamp(param, target, now, seconds) {
    if (!param) return;
    try {
      if (typeof param.cancelScheduledValues === 'function') param.cancelScheduledValues(now);
      if (typeof param.setValueAtTime === 'function') param.setValueAtTime(param.value || 0, now);
      if (typeof param.linearRampToValueAtTime === 'function') param.linearRampToValueAtTime(target, now + seconds);
      else param.value = target;
    } catch (err) { try { param.value = target; } catch (err2) {} }
  }

  function makeMusicOverlay(kit) {
    if (musicOverlay) return musicOverlay;
    var ctx = audioContext(kit);
    if (!ctx || typeof ctx.createOscillator !== 'function' || typeof ctx.createGain !== 'function') return null;
    try {
      var out = outputNode(ctx, kit, 'music', 1);
      if (!out) return null;
      var bass = ctx.createOscillator();
      var bassGain = ctx.createGain();
      bass.type = 'sawtooth';
      bass.frequency.value = 58;
      bassGain.gain.value = 0.035;
      bass.connect(bassGain); bassGain.connect(out);

      var pulseGain = ctx.createGain();
      pulseGain.gain.value = 0.045;
      var pulse = ctx.createOscillator();
      var pulseDepth = ctx.createGain();
      pulse.type = 'sine'; pulse.frequency.value = 2.2; pulseDepth.gain.value = 0.035;
      pulse.connect(pulseDepth); pulseDepth.connect(pulseGain.gain);
      var buffer = noiseBuffer(ctx);
      var noiseSource = buffer && typeof ctx.createBufferSource === 'function' ? ctx.createBufferSource() : null;
      if (noiseSource) {
        noiseSource.buffer = buffer; noiseSource.loop = true;
        if (typeof ctx.createBiquadFilter === 'function') {
          var filter = ctx.createBiquadFilter();
          filter.type = 'lowpass'; filter.frequency.value = 800;
          noiseSource.connect(filter); filter.connect(pulseGain);
        } else noiseSource.connect(pulseGain);
      }
      pulseGain.connect(out);
      var now = finite(ctx.currentTime, 0);
      out.gain.value = 0;
      bass.start(now); pulse.start(now);
      if (noiseSource) noiseSource.start(now);
      unlock(kit, ctx);
      musicOverlay = { ctx: ctx, out: out, bass: bass, bassGain: bassGain, pulseGain: pulseGain, pulse: pulse, depth: pulseDepth, noise: noiseSource };
      return musicOverlay;
    } catch (err) { return null; }
  }

  function setLayer(layer) {
    if (layer !== 'calm' && layer !== 'danger' && layer !== 'goldrush') return false;
    if (musicLayer === layer) return true;
    musicLayer = layer;
    var kit = kitFor();
    registerAssets(kit);
    if (!kit || !kit.audio) return true;
    if (typeof kit.audio.music === 'function') {
      try { kit.audio.music('calm', 700); } catch (err) {}
    }
    if (layer === 'calm') {
      if (musicOverlay) musicRamp(musicOverlay.out.gain, 0, finite(musicOverlay.ctx.currentTime, 0), 0.7);
      return true;
    }
    var overlay = makeMusicOverlay(kit);
    if (!overlay) return true;
    var target = layer === 'goldrush' ? 0.22 : 0.12;
    musicRamp(overlay.out.gain, target * pref(kit, 'music'), finite(overlay.ctx.currentTime, 0), 0.7);
    if (layer === 'goldrush') {
      overlay.bass.frequency.value = 82;
      overlay.pulse.frequency.value = 3.6;
    } else {
      overlay.bass.frequency.value = 58;
      overlay.pulse.frequency.value = 2.2;
    }
    return true;
  }

  var Music = {
    setLayer: setLayer,
    __selftest: function () {
      var pass = setLayer('calm') && setLayer('danger') && setLayer('goldrush') && setLayer('calm');
      musicLayer = null;
      return { pass: !!pass, notes: ['calm uses kit.audio.music with its ownership token', 'danger and goldrush share one crossfaded synthesized overlay'] };
    },
  };
  RF.Music = Music;

})(typeof window !== 'undefined' ? window : globalThis);
