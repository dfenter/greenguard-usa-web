/* Hivefall - pooled cosmetic effects.
 *
 * Five preallocated pools (impact shards, muzzle streaks, salvage sparks,
 * reward rings, breach smoke) plus a pooled floating-number set. Nothing is
 * allocated per frame, nothing here writes simulation state, and every
 * high-energy path is gated on kit.juice.enabled.
 */
var HFFx = (function () {
  'use strict';
  function dpr() { return window.__HF_DPR || GGKit.hiDpi.dpr(); }

  function Pool(scene, layer, key, count, blend) {
    this.items = [];
    for (var i = 0; i < count; i++) {
      var img = scene.add.image(0, 0, key);
      img.setVisible(false).setActive(false);
      if (blend) img.setBlendMode(Phaser.BlendModes.ADD);
      layer.add(img);
      this.items.push({
        img: img, on: false, x: 0, y: 0, vx: 0, vy: 0, t: 0, life: 1,
        s0: 1, s1: 0, a0: 1, a1: 0, rot: 0, spin: 0, grav: 0, bsx: 1, bsy: 1
      });
    }
    this.next = 0;
  }
  Pool.prototype.take = function () {
    var n = this.items.length, i;
    for (i = 0; i < n; i++) {
      var p = this.items[(this.next + i) % n];
      if (!p.on) { this.next = (this.next + i + 1) % n; return p; }
    }
    var q = this.items[this.next];
    this.next = (this.next + 1) % n;
    return q;
  };
  Pool.prototype.update = function (dt) {
    for (var i = 0; i < this.items.length; i++) {
      var p = this.items[i];
      if (!p.on) continue;
      p.t += dt;
      var k = p.t / p.life;
      if (k >= 1) {
        p.on = false;
        p.img.setVisible(false).setActive(false);
        continue;
      }
      p.vy += p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.spin * dt;
      var s = p.s0 + (p.s1 - p.s0) * k;
      p.img.setPosition(p.x, p.y);
      p.img.setScale(p.bsx * s, p.bsy * s);
      p.img.setAlpha(p.a0 + (p.a1 - p.a0) * k);
      p.img.setRotation(p.rot);
    }
  };
  Pool.prototype.clear = function () {
    for (var i = 0; i < this.items.length; i++) {
      this.items[i].on = false;
      this.items[i].img.setVisible(false).setActive(false);
    }
  };

  var FX = {};

  FX.create = function (scene, layer, kit) {
    var self = {
      scene: scene,
      kit: kit,
      shard: new Pool(scene, layer, 'hf_shard', 20, false),
      streak: new Pool(scene, layer, 'hf_streak', 16, true),
      spark: new Pool(scene, layer, 'hf_dot', 18, true),
      ring: new Pool(scene, layer, 'hf_ring', 10, true),
      smoke: new Pool(scene, layer, 'hf_smoke', 12, false),
      nudge: { x: 0, y: 0, mag: 0, t: 0, dur: 0, ang: 0 },
      seed: 0x1F5A3C
    };

    /* cosmetic-only random stream; never touches the sim */
    var s = self.seed;
    function rnd() {
      s |= 0; s = s + 0x6D2B79F5 | 0;
      var t = Math.imul(s ^ s >>> 15, 1 | s);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
    self.rnd = rnd;
    function reduced() { return !(kit && kit.juice && kit.juice.enabled); }
    self.reduced = reduced;

    /* floating numbers: pooled Text objects, never created mid-run */
    var texts = [];
    for (var i = 0; i < 8; i++) {
      var tx = scene.add.text(0, 0, '', {
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: Math.round(18 * dpr()) + 'px', fontStyle: '700', color: '#FFFFFF'
      }).setOrigin(0.5, 0.5).setVisible(false);
      tx.setScale(1 / dpr());
      layer.add(tx);
      texts.push({ obj: tx, on: false, t: 0, life: 0.85, x: 0, y: 0, vy: -42, last: '' });
    }
    self.texts = texts;

    self.pop = function (x, y, str, color) {
      var slot = null;
      for (var i = 0; i < texts.length; i++) if (!texts[i].on) { slot = texts[i]; break; }
      if (!slot) slot = texts[0];
      slot.on = true; slot.t = 0; slot.x = x; slot.y = y;
      if (slot.last !== str) { slot.obj.setText(str); slot.last = str; }
      slot.obj.setColor(color || '#FFFFFF');
      slot.obj.setPosition(x, y).setAlpha(1).setScale(1).setVisible(true);
    };

    /* --- impact shards: contact accent on a clear, hit or kill --- */
    self.burst = function (x, y, tint, n, spread, size) {
      var count = reduced() ? Math.min(3, Math.ceil(n * 0.4)) : n;
      for (var i = 0; i < count; i++) {
        var p = self.shard.take();
        var a = rnd() * Math.PI * 2;
        var sp = spread * (0.35 + rnd() * 0.75);
        p.on = true; p.t = 0; p.life = 0.30 + rnd() * 0.24;
        p.x = x; p.y = y;
        p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp - sp * 0.25;
        p.grav = 620; p.rot = rnd() * 6.28; p.spin = (rnd() - 0.5) * 12;
        p.s0 = (size || 1) * (0.7 + rnd() * 0.5); p.s1 = 0.05;
        p.a0 = 1; p.a1 = 0; p.bsx = 1; p.bsy = 1;
        p.img.setTexture('hf_shard').setTint(tint).setBlendMode(Phaser.BlendModes.NORMAL);
        p.img.setVisible(true).setActive(true);
      }
    };

    /* --- muzzle streak: the authored strike from wall to lane --- */
    self.muzzle = function (x, y, tint) {
      var p = self.streak.take();
      p.on = true; p.t = 0; p.life = 0.20;
      p.x = x; p.y = y - 14;
      p.vx = 0; p.vy = -260; p.grav = 0; p.rot = 0; p.spin = 0;
      p.s0 = 1.15; p.s1 = 0.2; p.a0 = 0.95; p.a1 = 0;
      p.bsx = 1; p.bsy = 1;
      p.img.setTexture('hf_streak').setTint(tint).setBlendMode(Phaser.BlendModes.ADD);
      p.img.setVisible(true).setActive(true);
    };

    /* --- cascade streak: a directional trail down a board column --- */
    self.trail = function (x, y, tint, len) {
      if (reduced()) return;
      var p = self.streak.take();
      p.on = true; p.t = 0; p.life = 0.28;
      p.x = x; p.y = y;
      p.vx = 0; p.vy = 90; p.grav = 0; p.rot = 0; p.spin = 0;
      p.s0 = 1; p.s1 = 0.3; p.a0 = 0.8; p.a1 = 0;
      p.bsx = 0.8; p.bsy = (len || 1);
      p.img.setTexture('hf_streak').setTint(tint).setBlendMode(Phaser.BlendModes.ADD);
      p.img.setVisible(true).setActive(true);
    };

    /* --- salvage sparks / chill motes / venom motes --- */
    self.sparkle = function (x, y, tint, n, up) {
      var count = reduced() ? Math.min(2, n) : n;
      for (var i = 0; i < count; i++) {
        var p = self.spark.take();
        var a = rnd() * Math.PI * 2;
        p.on = true; p.t = 0; p.life = 0.42 + rnd() * 0.3;
        p.x = x; p.y = y;
        p.vx = Math.cos(a) * 60 * rnd(); p.vy = (up ? -90 : 0) + Math.sin(a) * 55 * rnd();
        p.grav = up ? 60 : 180; p.rot = 0; p.spin = 0;
        p.s0 = 0.7 + rnd() * 0.6; p.s1 = 0.05; p.a0 = 0.95; p.a1 = 0;
        p.bsx = 1; p.bsy = 1;
        p.img.setTexture('hf_dot').setTint(tint).setBlendMode(Phaser.BlendModes.ADD);
        p.img.setVisible(true).setActive(true);
      }
    };

    /* --- reward ring: combo tiers, wave clear, boss down --- */
    self.ringAt = function (x, y, tint, scale, life) {
      if (reduced()) return;
      var p = self.ring.take();
      p.on = true; p.t = 0; p.life = life || 0.5;
      p.x = x; p.y = y; p.vx = 0; p.vy = 0; p.grav = 0; p.rot = 0; p.spin = 0.9;
      p.s0 = 0.25; p.s1 = scale || 2.4; p.a0 = 0.9; p.a1 = 0;
      p.bsx = 1; p.bsy = 1;
      p.img.setTexture('hf_ring').setTint(tint).setBlendMode(Phaser.BlendModes.ADD);
      p.img.setVisible(true).setActive(true);
    };

    /* --- breach smoke: the wall taking a hit --- */
    self.puff = function (x, y, tint, n) {
      var count = reduced() ? 1 : n;
      for (var i = 0; i < count; i++) {
        var p = self.smoke.take();
        p.on = true; p.t = 0; p.life = 0.55 + rnd() * 0.4;
        p.x = x + (rnd() - 0.5) * 22; p.y = y;
        p.vx = (rnd() - 0.5) * 60; p.vy = -30 - rnd() * 50;
        p.grav = 22; p.rot = rnd() * 6.28; p.spin = (rnd() - 0.5) * 1.5;
        p.s0 = 0.6; p.s1 = 1.9; p.a0 = 0.62; p.a1 = 0;
        p.bsx = 1; p.bsy = 1;
        p.img.setTexture('hf_smoke').setTint(tint).setBlendMode(Phaser.BlendModes.NORMAL);
        p.img.setVisible(true).setActive(true);
      }
    };

    /* --- one board-wide frame nudge, amplitude capped by the house budget --- */
    self.frameNudge = function (mag, dur, ang) {
      if (reduced()) return;
      var n = self.nudge;
      if (mag <= n.mag && n.t < n.dur) return;      /* one concurrent nudge */
      n.mag = mag; n.t = 0; n.dur = dur || 0.18;
      n.ang = (ang == null) ? -Math.PI / 2 : ang;
    };

    self.update = function (dt) {
      self.shard.update(dt);
      self.streak.update(dt);
      self.spark.update(dt);
      self.ring.update(dt);
      self.smoke.update(dt);
      var i;
      for (i = 0; i < texts.length; i++) {
        var t = texts[i];
        if (!t.on) continue;
        t.t += dt;
        var k = t.t / t.life;
        if (k >= 1) { t.on = false; t.obj.setVisible(false); continue; }
        t.y += t.vy * dt;
        t.obj.setPosition(t.x, t.y);
        t.obj.setAlpha(k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3);
        t.obj.setScale(1 + Math.max(0, 0.28 - k) * 1.2);
      }
      var n = self.nudge;
      if (n.t < n.dur) {
        n.t += dt;
        var f = 1 - n.t / n.dur;
        var amp = n.mag * f * Math.cos(n.t * 46);
        n.x = Math.cos(n.ang) * amp;
        n.y = Math.sin(n.ang) * amp;
      } else { n.x = 0; n.y = 0; n.mag = 0; }
    };

    self.clear = function () {
      self.shard.clear(); self.streak.clear(); self.spark.clear();
      self.ring.clear(); self.smoke.clear();
      for (var i = 0; i < texts.length; i++) { texts[i].on = false; texts[i].obj.setVisible(false); }
      self.nudge.x = 0; self.nudge.y = 0; self.nudge.mag = 0; self.nudge.t = 0; self.nudge.dur = 0;
    };

    return self;
  };

  return FX;
})();
