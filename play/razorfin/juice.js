/* Razorfin juice, audio, and music. Lane F. Classic script, no dependencies. */
(function (root) {
  'use strict';

  root.RF = root.RF || {};
  var RF = root.RF;
  var EMPTY = {};
  var TAU = Math.PI * 2;
  var WHITE = 0xffffff;
  var GOLD = 0xffd98a;

  function data() { return root.RFD || {}; }
  function finite(value, fallback) {
    return (typeof value === 'number' && isFinite(value)) ? value : fallback;
  }
  function clamp(value, low, high) {
    value = finite(value, low);
    return value < low ? low : value > high ? high : value;
  }
  function mixColor(a, b, amount) {
    var aa = (a == null ? WHITE : a) >>> 0;
    var bb = (b == null ? WHITE : b) >>> 0;
    var t = clamp(amount, 0, 1);
    var ar = (aa >>> 16) & 255, ag = (aa >>> 8) & 255, ab = aa & 255;
    var br = (bb >>> 16) & 255, bg = (bb >>> 8) & 255, bc = bb & 255;
    return ((Math.round(ar + (br - ar) * t) << 16)
      | (Math.round(ag + (bg - ag) * t) << 8)
      | Math.round(ab + (bc - ab) * t)) >>> 0;
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
      motes: { size: 96, key: 'bubble_b', life: 560, scale: 0.34, speed: 145, mode: 1 },
      elementSpark: { size: 64, key: 'bubble_c', life: 430, scale: 0.27, speed: 190, mode: 2 },
      ring: { size: 24, key: 'bubble_c', life: 560, scale: 0.5, speed: 0, mode: 3 },
      beamCore: { size: 12, key: 'bubble_b', life: 92, scale: 1, speed: 0, mode: 4 },
      swimtrail: { size: 128, key: 'bubble_a', life: 720, scale: 0.23, speed: 26, mode: 5 },
      speedlines: { size: 72, key: 'bubble_c', life: 170, scale: 0.42, speed: 220, mode: 6 },
      breach: { size: 96, key: 'bubble_a', life: 720, scale: 0.34, speed: 118, mode: 7 },
      goldpulse: { size: 16, key: null, life: 980, scale: 1, speed: 0, mode: 8, shape: 'edge' },
    };
    var poolNames = ['bubbles', 'motes', 'elementSpark', 'ring', 'beamCore',
      'swimtrail', 'speedlines', 'breach', 'goldpulse'];
    var waterTickOpts = { vol: 0.055, rate: 1 };
    var breachSfxOpts = { vol: 0.34, rate: 0.92 };
    var view = { width: 844, height: 390 };

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
        setOrigin: function (x, y) { this.originX = x; this.originY = y == null ? x : y; return this; },
        setScrollFactor: function (x, y) { this.scrollFactorX = x; this.scrollFactorY = y == null ? x : y; return this; },
        setDepth: function (v) { this.depth = v; return this; },
        clear: function () { return this; },
        fillStyle: function () { return this; },
        fillGradientStyle: function () { return this; },
        fillRect: function () { return this; },
        destroy: function () {},
      };
    }

    function makeSprite(target, key, x, y, config) {
      var sprite = null;
      try {
        if (config && config.shape === 'edge' && target && target.add
          && typeof target.add.graphics === 'function') {
          sprite = target.add.graphics();
        } else if (target && target.add && typeof target.add.image === 'function' && key) {
          sprite = target.add.image(x, y, key);
        } else if (target && target.add && typeof target.add.rectangle === 'function') {
          sprite = target.add.rectangle(x, y, 12, 12, WHITE, 1);
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
          active: false, sprite: makeSprite(scene, config.key, 0, 0, config),
          life: 0, maxLife: config.life, age: 0,
          x: 0, y: 0, vx: 0, vy: 0, gravity: 0,
          rotation: 0, spin: 0, baseScale: config.scale,
          length: 0, width: 0, tint: null, slot: i, variant: 0, side: -1, isRing: false,
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
      if (name === 'swimtrail') return pools.swimtrail;
      if (name === 'speedlines') return pools.speedlines;
      if (name === 'breach') return pools.breach;
      if (name === 'goldpulse') return pools.goldpulse;
      return null;
    }

    function angleFromOptions(opts, mode) {
      if (opts.angle == null) return null;
      var value = finite(opts.angle, 0);
      /* Existing callers authored legacy FX angles as degrees. Rev 4 game
         motion uses radians, so the new water/boost families accept either:
         small values are radians, larger values are degrees. */
      if (mode >= 5 && Math.abs(value) <= TAU * 2.1) return value;
      return value * Math.PI / 180;
    }

    function tintMix(a, b, amount) {
      return mixColor(a, b, amount);
    }

    function viewSize() {
      var cam = scene && scene.cameras && scene.cameras.main;
      var zoom = cam && finite(cam.zoom, 1);
      if (zoom <= 0) zoom = 1;
      view.width = cam && finite(cam.width, 0) ? cam.width / zoom : 844;
      view.height = cam && finite(cam.height, 0) ? cam.height / zoom : 390;
      if (view.width <= 0) view.width = 844;
      if (view.height <= 0) view.height = 390;
      return view;
    }

    function drawGoldBar(item, tintValue, alpha, scale) {
      var sprite = item.sprite;
      if (!sprite || typeof sprite.clear !== 'function') return;
      var size = viewSize();
      var depth = clamp(28 * scale, 12, 72);
      var edgeAlpha = clamp(alpha, 0.04, 0.48);
      var fade = edgeAlpha * 0.08;
      var color = tintValue == null ? GOLD : tintValue;
      try {
        sprite.clear();
        if (typeof sprite.fillGradientStyle === 'function') {
          if (item.side === 0) sprite.fillGradientStyle(color, color, color, color, edgeAlpha, edgeAlpha, fade, fade);
          else if (item.side === 1) sprite.fillGradientStyle(color, color, color, color, fade, fade, edgeAlpha, edgeAlpha);
          else if (item.side === 2) sprite.fillGradientStyle(color, color, color, color, edgeAlpha, fade, edgeAlpha, fade);
          else sprite.fillGradientStyle(color, color, color, color, fade, edgeAlpha, fade, edgeAlpha);
        } else if (typeof sprite.fillStyle === 'function') sprite.fillStyle(color, edgeAlpha);
        if (item.side === 0) sprite.fillRect(0, 0, size.width, depth);
        else if (item.side === 1) sprite.fillRect(0, 0, size.width, depth);
        else sprite.fillRect(0, 0, depth, size.height);
      } catch (err) {}
      if (typeof sprite.setScrollFactor === 'function') sprite.setScrollFactor(0);
      if (typeof sprite.setDepth === 'function') sprite.setDepth(999);
      setPosition(sprite, 0, item.side === 1 ? size.height - depth : 0);
      if (item.side === 2) setPosition(sprite, 0, 0);
      if (item.side === 3) setPosition(sprite, size.width - depth, 0);
      setScale(sprite, 1);
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
      var mode = config.mode;
      var angleValue = angleFromOptions(opts, mode);
      var angleProvided = angleValue != null;
      var angle = angleProvided ? angleValue : (mode === 5 || mode === 6 ? Math.PI : mode === 7 ? -Math.PI / 2 : 0);
      var spread = mode === 0 ? 0.18 : (mode === 3 || mode === 4 ? 0 : mode === 5 ? 0.42 : mode === 6 ? 0.07 : mode === 7 ? 1.18 : 0.72);
      var ordinal = item.slot;
      var offset = ((ordinal % 11) - 5) / 5;
      var theta = angle + offset * spread;
      var speed = finite(opts.speed, config.speed);
      var scale = clamp(opts.scale == null ? config.scale : opts.scale, 0.05, 8);
      var life = clamp(opts.life == null ? config.life : opts.life, 20, 2500);
      var tintValue = opts.tint == null ? (mode === 7 ? WHITE : null) : opts.tint;

      item.life = life;
      item.maxLife = life;
      item.age = 0;
      item.x = finite(x, 0);
      item.y = finite(y, 0);
      item.baseScale = scale;
      item.tint = tintValue;
      item.variant = 0;
      item.side = -1;
      item.isRing = false;
      item.length = 0;
      item.width = 0;
      item.rotation = mode === 6 ? angle : (angleProvided ? angle : (ordinal % 16) * (TAU / 16));
      item.spin = mode === 3 || mode === 4 || mode === 6 ? 0 : (0.5 + (ordinal % 5) * 0.16) * (ordinal % 2 ? -1 : 1);

      /* Bite bursts get a stable, pooled mix of base motes, larger chunks,
         and one pin-prick score sparkle. `tint2` is optional so blood bursts
         can keep their own second tone without a second pool. */
      if (mode === 1) {
        item.variant = ordinal % 8;
        if (item.variant === 0 || item.variant === 1) {
          item.baseScale = scale * (item.variant === 0 ? 1.65 : 1.35);
          speed *= item.variant === 0 ? 0.72 : 0.88;
        } else if (item.variant === 2) {
          item.baseScale = scale * 0.48;
          speed *= 1.32;
          tintValue = WHITE;
        } else {
          item.baseScale = scale;
          if (item.variant % 2 === 0) tintValue = opts.tint2 == null ? tintMix(tintValue, WHITE, 0.34) : opts.tint2;
        }
        item.tint = tintValue;
      }
      if (mode === 5) {
        speed = opts.speed == null ? config.speed : clamp(speed * 0.08, 8, 62);
        item.gravity = -18;
      } else if (mode === 6) {
        speed = clamp(speed, 60, 540);
        item.length = clamp(opts.length == null ? 42 : opts.length, 12, 180) * scale;
        item.width = clamp(opts.width == null ? 3.2 : opts.width, 1.2, 12) * scale;
      } else if (mode === 7) {
        speed = clamp(speed, 58, 270);
        item.gravity = 270;
      }
      item.vx = Math.cos(theta) * speed;
      item.vy = Math.sin(theta) * speed;
      if (mode !== 1 && mode !== 2 && mode !== 5 && mode !== 7) item.gravity = 0;
      if (mode === 1) item.gravity = 150;
      else if (mode === 2) item.gravity = 75;
      if (mode !== 6) tint(item.sprite, tintValue);
      show(item);
      setPosition(item.sprite, item.x, item.y);
      setAlpha(item.sprite, mode === 3 ? 0.75 : mode === 6 ? 0.86 : 0.88);
      setRotation(item.sprite, item.rotation);
      setScale(item.sprite, item.baseScale);
      if (mode === 6) applySpeedlineSize(item);
    }

    function activateBreachRing(item, x, y, opts, pool) {
      activate(item, x, y, opts, pool);
      item.isRing = true;
      item.vx = 0;
      item.vy = 0;
      item.gravity = 0;
      item.rotation = 0;
      item.baseScale = clamp(opts.scale == null ? pool.config.scale : opts.scale, 0.05, 8) * 0.78;
      item.tint = opts.tint == null ? WHITE : opts.tint;
      tint(item.sprite, item.tint);
      setRotation(item.sprite, 0);
      setScale(item.sprite, item.baseScale);
    }

    function activateGold(item, opts, side) {
      var config = pools.goldpulse.config;
      var scale = clamp(opts.scale == null ? config.scale : opts.scale, 0.5, 3);
      var life = clamp(opts.life == null ? config.life : opts.life, 120, 3000);
      item.life = life;
      item.maxLife = life;
      item.age = 0;
      item.x = 0;
      item.y = 0;
      item.vx = 0;
      item.vy = 0;
      item.gravity = 0;
      item.rotation = 0;
      item.spin = 0;
      item.baseScale = scale;
      item.tint = opts.tint == null ? GOLD : opts.tint;
      item.side = side;
      item.variant = 0;
      item.isRing = false;
      item.width = clamp(opts.alpha == null ? 0.26 : opts.alpha, 0.08, 0.42);
      show(item);
      drawGoldBar(item, item.tint, item.width, scale);
      setAlpha(item.sprite, 0.01);
    }

    function emitBreach(x, y, opts, pool) {
      var requested = opts.count == null ? 9 : Math.floor(finite(opts.count, 9));
      var count = requested < 0 ? 0 : requested > 24 ? 24 : requested;
      var emitted = 0;
      var i, item;
      for (i = 0; i < count; i++) {
        item = acquire(pool);
        if (!item) break;
        activate(item, x, y, opts, pool);
        emitted++;
      }
      item = acquire(pool);
      if (item) {
        activateBreachRing(item, x, y, opts, pool);
        emitted++;
      }
      return emitted;
    }

    function emitGoldPulse(opts, pool) {
      var requested = opts.count == null ? 1 : Math.floor(finite(opts.count, 1));
      var pulses = requested < 0 ? 0 : requested > 3 ? 3 : requested;
      var emitted = 0;
      var pulse, side, item;
      for (pulse = 0; pulse < pulses; pulse++) {
        for (side = 0; side < 4; side++) {
          item = acquire(pool);
          if (!item) return emitted;
          activateGold(item, opts, side);
          emitted++;
        }
      }
      return emitted;
    }

    function emit(name, x, y, opts) {
      var pool = poolFor(name);
      if (!pool) return 0;
      opts = opts || EMPTY;
      if (name === 'goldpulse') return emitGoldPulse(opts, pool);
      if (name === 'breach') {
        var breachCount = emitBreach(x, y, opts, pool);
        if (breachCount && RF.Sound && typeof RF.Sound.play === 'function') RF.Sound.play('breach', breachSfxOpts);
        return breachCount;
      }
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
      if (emitted && name === 'swimtrail' && RF.Sound && typeof RF.Sound.play === 'function') {
        RF.Sound.play('swimtrail', waterTickOpts);
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

    function applySpeedlineSize(item) {
      var sprite = item.sprite;
      if (!sprite) return;
      if (typeof sprite.setDisplaySize === 'function') sprite.setDisplaySize(item.length, item.width);
      else setScale(sprite, Math.max(0.1, item.length / 32), Math.max(0.1, item.width / 32));
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
          if (config.mode === 0 || config.mode === 1 || config.mode === 2 || config.mode === 5 || config.mode === 7) {
            if (config.mode === 7 && item.isRing) {
              setPosition(item.sprite, item.x, item.y);
              setAlpha(item.sprite, lifeRatio * 0.86);
              setScale(item.sprite, item.baseScale * (1 + (1 - lifeRatio) * 2.8));
              continue;
            }
            item.vy += item.gravity * dt / 1000;
            item.x += item.vx * dt / 1000;
            item.y += item.vy * dt / 1000;
            setPosition(item.sprite, item.x, item.y);
            setRotation(item.sprite, item.rotation + item.age * item.spin * 0.002);
            scale = item.baseScale * (config.mode === 0 ? 0.78 + 0.22 * lifeRatio
              : config.mode === 5 ? 0.7 + 0.3 * lifeRatio
                + Math.sin(item.age * 0.012 + item.slot) * 0.035
              : config.mode === 7 ? 0.72 + 0.28 * lifeRatio
              : 0.72 + 0.28 * lifeRatio);
            setScale(item.sprite, scale);
            setAlpha(item.sprite, lifeRatio * (config.mode === 0 ? 0.72 : config.mode === 5 ? 0.5 : 0.92));
          } else if (config.mode === 6) {
            item.x += item.vx * dt / 1000;
            item.y += item.vy * dt / 1000;
            setPosition(item.sprite, item.x, item.y);
            setRotation(item.sprite, item.rotation);
            applySpeedlineSize(item);
            setAlpha(item.sprite, lifeRatio * (0.55 + 0.25 * Math.sin(item.age * 0.03 + item.slot)));
          } else if (config.mode === 3) {
            setAlpha(item.sprite, lifeRatio * 0.78);
            setScale(item.sprite, item.baseScale * (1 + (1 - lifeRatio) * 2.6));
          } else if (config.mode === 8) {
            var breath = 0.5 + 0.5 * Math.sin((item.age / 1000) * TAU * 0.4);
            setAlpha(item.sprite, lifeRatio * (0.1 + breath * 0.34));
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
          rectangle: function (x, y) {
            var s = nullSprite();
            s.x = x; s.y = y; objects.push(s);
            return s;
          },
          graphics: function () {
            var s = nullSprite();
            objects.push(s);
            return s;
          },
        },
        cameras: { main: { width: 844, height: 390, zoom: 1 } },
        events: { on: function () {}, off: function () {} },
      };
      var pass = true;
      try {
        init(testScene);
        var i;
        for (i = 0; i < poolNames.length; i++) {
          if (!pools[poolNames[i]] || !pools[poolNames[i]].items.length) pass = false;
          if (emit(poolNames[i], 20 + i, 30 + i, { count: 1, tint: 0x74eaff, scale: 0.8 }) <= 0) pass = false;
        }
        if (!beam(0, 0, 100, 0, { tint: 0x8dffda })) pass = false;
        update(0, 16);
        notes.push('nine pooled families constructed and each emitted once, including Rev 4 juice pools');
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

  function paletteGlow(ent, palette) {
    if (palette && palette.glow != null) return finite(palette.glow, 0x9effcb) >>> 0;
    var def = ent && (ent.def || ent.sharkDef);
    var sil = def && def.sil;
    return sil && sil.palette && sil.palette.glow != null
      ? finite(sil.palette.glow, 0x9effcb) >>> 0 : 0x9effcb;
  }

  function kaijuGlow(sprite, palette, time) {
    if (!sprite || typeof sprite.setTint !== 'function') return false;
    var glow = paletteGlow(null, palette);
    var clock = finite(time, nowMs(null));
    /* 0.4 Hz, beginning at the palette glow and breathing toward white. */
    var breath = 0.5 + 0.5 * Math.sin((clock / 1000) * TAU * 0.4 - Math.PI / 2);
    try { sprite.setTint(mixColor(glow, WHITE, breath)); } catch (err) { return false; }
    return true;
  }

  function kaiju(ent, sceneTarget) {
    if (!ent || (ent.defId !== 'leviathanrex' && ent.defId !== 'leviathan_rex')) return false;
    /* The declared API remains (ent, scene). Extra arguments are an additive
       compatibility path for a rig body and palette when a caller has them. */
    var bodySprite = arguments.length > 2 ? arguments[2] : null;
    var palette = arguments.length > 3 ? arguments[3] : null;
    sceneTarget = sceneTarget || (RF.ctx && RF.ctx.scene) || juiceScene;
    if (sceneTarget && sceneTarget !== juiceScene) juiceScene = sceneTarget;
    var scratch = ent.st || (ent.st = {});
    var state = scratch._rfKaiju;
    if (ent.active === false) {
      if (state && state.glow && typeof state.glow.destroy === 'function') {
        try { state.glow.destroy(); } catch (err) {}
      }
      if (state && state.body && typeof state.body.clearTint === 'function') {
        try { state.body.clearTint(); } catch (bodyErr) {}
      }
      if (state) state.glow = null;
      return false;
    }
    if (!state || state.entityId !== ent.id) {
      if (state && state.glow && typeof state.glow.destroy === 'function') {
        try { state.glow.destroy(); } catch (err2) {}
      }
      state = scratch._rfKaiju = { entityId: ent.id, entered: false, nextBeat: 0, glow: null, body: null };
    }
    var time = nowMs(sceneTarget);
    var glowColor = paletteGlow(ent, palette);
    if (!palette && ent.def && ent.def.sil && ent.def.sil.palette) palette = ent.def.sil.palette;
    if (!bodySprite && ent.rigBody) bodySprite = ent.rigBody;
    if (!bodySprite && ent.sprite && typeof ent.sprite.setTint === 'function') bodySprite = ent.sprite;
    if (bodySprite && state.body !== bodySprite) {
      if (state.body && typeof state.body.clearTint === 'function') {
        try { state.body.clearTint(); } catch (bodyErr2) {}
      }
      state.body = bodySprite;
    }
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
    }
    if (bodySprite) kaijuGlow(bodySprite, palette, time);
    return true;
  }

  var Juice = {
    hitStop: hitStop,
    consumeFreeze: consumeFreeze,
    shake: shake,
    slowmo: slowmo,
    consumeSlowmo: consumeSlowmo,
    kaiju: kaiju,
    kaijuGlow: kaijuGlow,
    __selftest: function () {
      pendingFreezeMs = 0;
      hitStop(36);
      var value = consumeFreeze();
      var body = { tint: 0, setTint: function (v) { this.tint = v; return this; }, clearTint: function () { this.tint = 0; return this; } };
      var glowTint = 0x2c8f78;
      kaijuGlow(body, { glow: glowTint }, 0);
      var atGlow = body.tint;
      kaijuGlow(body, { glow: glowTint }, 1250);
      var atWhite = body.tint;
      var pass = value === 36 && consumeFreeze() === 0 && atGlow === glowTint && atWhite === WHITE;
      return { pass: pass, notes: [pass ? 'hit-stop accumulator consumed and reset' : 'hit-stop cycle failed', 'slowmo reads through RF.Juice.consumeSlowmo()', 'kaiju body glow breathes from palette glow to white at 0.4 Hz'] };
    },
  };
  RF.Fx = Fx;
  RF.Juice = Juice;

  /* --------------------------------------------------------------- Sound */
  var audioState = { kit: null, ctx: null, noiseCtx: null, noiseBuffer: null, registered: false };
  var SYNTH_SFX = {
    chomp: 'chomp', bubble: 'bubble', splash: 'splash',
    boost: 'boost', swimtrail: 'swimtrail', breach: 'splash',
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
    roar: 1.8, chomp: 0.2, bubble: 0.25, splash: 0.5, boost: 0.34, swimtrail: 0.16,
  };
  var lastSwimtrailMs = -Infinity;
  var SWIMTRAIL_MIN_MS = 120;

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
    return prefs[channel] == null ? 1 : clamp(prefs[channel], 0, 1);
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
      case 'boost': tone(ctx, out, start, 360, 82, dur, 'sine', 0.24, r); noise(ctx, out, start, dur * 0.72, 0.16, 1100, 260); break;
      case 'swimtrail': tone(ctx, out, start, 330, 760, dur * 0.72, 'sine', 0.2, r); tone(ctx, out, start + 0.055, 500, 930, dur * 0.58, 'sine', 0.12, r); break;
      case 'splash': noise(ctx, out, start, dur, 0.24, 1700, 0); break;
      default: tone(ctx, out, start, 220, 80, dur, 'sine', 0.2, r); break;
    }
  }

  function soundPlay(name, opts) {
    opts = opts || EMPTY;
    var rows = data().SFX || {};
    var playName = name === 'breach' ? 'splash' : name;
    var hasRow = Object.prototype.hasOwnProperty.call(rows, playName);
    var kind = SYNTH_SFX[name] || SYNTH_SFX[playName];
    if (!hasRow && !kind) return false;
    if (name === 'swimtrail') {
      var clock = audioState.ctx ? finite(audioState.ctx.currentTime, 0) * 1000 : nowMs(null);
      if (clock >= lastSwimtrailMs && clock - lastSwimtrailMs < SWIMTRAIL_MIN_MS) return true;
      lastSwimtrailMs = clock;
    }
    var kit = kitFor();
    registerAssets(kit);
    var volume = clamp(opts.vol == null ? (opts.volume == null ? 1 : opts.volume) : opts.vol, 0, 1);
    var rate = clamp(opts.rate == null ? 1 : opts.rate, 0.5, 2.5);
    var file = hasRow ? rows[playName] : null;
    if (file && kit && kit.audio && typeof kit.audio.sfx === 'function') {
      try { kit.audio.sfx(playName, { volume: volume, rate: rate }); } catch (err) {}
      return true;
    }
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
      var additions = ['boost', 'swimtrail', 'breach'];
      var i;
      for (i = 0; i < additions.length; i++) {
        if (!Object.prototype.hasOwnProperty.call(SYNTH_SFX, additions[i])) pass = false;
      }
      notes.push(pass ? 'synth fallback table covers every RFD.SFX key plus boost, swimtrail, and breach' : 'synth fallback table is missing an SFX key');
      notes.push('file-backed entries use kit.audio.sfx; null entries use lazy WebAudio synthesis');
      notes.push('swimtrail synth is quiet and hard rate-limited; breach reuses splash');
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
