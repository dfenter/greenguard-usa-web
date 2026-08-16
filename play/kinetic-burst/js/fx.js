/* Kinetic Burst - pooled cosmetic effects.
 *
 * Five preallocated pools: orb shards, trace sparks, impact bursts, rising
 * motes, and reward rings. Nothing allocates during play and nothing here
 * ever writes simulation state. Every high energy path is gated on
 * kit.juice.enabled, and the debug counters read the SAME pools the renderer
 * draws from.
 */
var KBFx = (function () {
  'use strict';

  function Pool(scene, layer, key, count, additive) {
    this.items = [];
    for (var i = 0; i < count; i++) {
      var img = scene.add.image(0, 0, key);
      img.setVisible(false).setActive(false);
      if (additive) img.setBlendMode(Phaser.BlendModes.ADD);
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
      if (k >= 1) { p.on = false; p.img.setVisible(false).setActive(false); continue; }
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
  Pool.prototype.live = function () {
    var c = 0;
    for (var i = 0; i < this.items.length; i++) if (this.items[i].on) c++;
    return c;
  };

  var FX = {};

  FX.create = function (scene, layer, kit) {
    var self = {
      scene: scene,
      shard: new Pool(scene, layer, 'kb_shard', 20, false),
      spark: new Pool(scene, layer, 'kb_dot', 18, true),
      impact: new Pool(scene, layer, 'kb_streak', 14, true),
      mote: new Pool(scene, layer, 'kb_spark', 14, true),
      reward: new Pool(scene, layer, 'kb_ring', 10, true),
      nudge: { x: 0, y: 0, mag: 0, t: 0, dur: 0, ang: 0 },
      rnd: KB.rng(0xC0FFEE)                    /* cosmetic stream only */
    };

    function reduced() { return !(kit && kit.juice && kit.juice.enabled); }
    self.reduced = reduced;

    /* 1. orb shards: colour matched fragments where an orb popped */
    self.shards = function (x, y, tint, n) {
      n = reduced() ? Math.min(2, n || 4) : (n || 4);
      for (var i = 0; i < n; i++) {
        var p = self.shard.take();
        var a = self.rnd() * Math.PI * 2;
        var sp = 90 + self.rnd() * 190;
        p.bsx = 1; p.bsy = 1;
        p.on = true; p.t = 0; p.life = 0.30 + self.rnd() * 0.22;
        p.x = x; p.y = y;
        p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp - 50;
        p.grav = 760; p.rot = self.rnd() * 6.28; p.spin = (self.rnd() - 0.5) * 14;
        p.s0 = 0.55 + self.rnd() * 0.5; p.s1 = 0;
        p.a0 = 0.95; p.a1 = 0;
        p.img.setTint(tint);
        p.img.setVisible(true).setActive(true).setPosition(x, y).setScale(p.s0).setAlpha(p.a0);
      }
    };

    /* 2. trace sparks: one soft mote per linked orb, the trace signature */
    self.spark2 = function (x, y, tint) {
      if (reduced()) return;
      var p = self.spark.take();
      p.bsx = 1; p.bsy = 1;
      p.on = true; p.t = 0; p.life = 0.34;
      p.x = x; p.y = y;
      var a = self.rnd() * Math.PI * 2;
      p.vx = Math.cos(a) * 40; p.vy = Math.sin(a) * 40 - 30;
      p.grav = 0; p.rot = 0; p.spin = 0;
      p.s0 = 1.6; p.s1 = 0.2;
      p.a0 = 0.8; p.a1 = 0;
      p.img.setTint(tint);
      p.img.setVisible(true).setActive(true).setPosition(x, y).setScale(p.s0).setAlpha(p.a0);
    };

    /* 3. impact: a directional streak fired from the board into a target */
    self.impact2 = function (x, y, angle, len, tint) {
      var p = self.impact.take();
      p.bsx = (reduced() ? 4 : 7) / 12;
      p.bsy = Math.max(20, len) / 56;
      p.on = true; p.t = 0; p.life = 0.22;
      p.x = x; p.y = y;
      p.vx = Math.cos(angle) * 260; p.vy = Math.sin(angle) * 260;
      p.grav = 0; p.rot = angle - Math.PI / 2; p.spin = 0;
      p.s0 = 1; p.s1 = 0.7;
      p.a0 = reduced() ? 0.4 : 0.85; p.a1 = 0;
      p.img.setTint(tint);
      p.img.setVisible(true).setActive(true).setPosition(x, y)
        .setScale(p.bsx, p.bsy).setAlpha(p.a0).setRotation(p.rot);
    };

    /* 4. motes: charge and mend, always rising */
    self.motes = function (x, y, tint, n) {
      n = reduced() ? 1 : (n || 4);
      for (var i = 0; i < n; i++) {
        var p = self.mote.take();
        p.bsx = 1; p.bsy = 1;
        p.on = true; p.t = 0; p.life = 0.5 + self.rnd() * 0.35;
        p.x = x + (self.rnd() - 0.5) * 34; p.y = y + (self.rnd() - 0.5) * 18;
        p.vx = (self.rnd() - 0.5) * 40; p.vy = -70 - self.rnd() * 90;
        p.grav = 60; p.rot = self.rnd() * 6.28; p.spin = (self.rnd() - 0.5) * 5;
        p.s0 = 0.4 + self.rnd() * 0.35; p.s1 = 0;
        p.a0 = 0.9; p.a1 = 0;
        p.img.setTint(tint);
        p.img.setVisible(true).setActive(true).setPosition(p.x, p.y).setScale(p.s0).setAlpha(p.a0);
      }
    };

    /* 5. reward rings, reserved for burst, wave clear and stage clear */
    self.ring = function (x, y, tint, scale, life) {
      var p = self.reward.take();
      p.bsx = 1; p.bsy = 1;
      p.on = true; p.t = 0; p.life = life || 0.5;
      p.x = x; p.y = y; p.vx = 0; p.vy = 0; p.grav = 0; p.rot = 0; p.spin = 0;
      p.s0 = 0.2; p.s1 = (scale || 3) * (reduced() ? 0.6 : 1);
      p.a0 = reduced() ? 0.3 : 0.75; p.a1 = 0;
      p.img.setTint(tint);
      p.img.setVisible(true).setActive(true).setPosition(x, y).setScale(p.s0).setAlpha(p.a0);
    };

    self.confetti = function (x, y, w, tint) {
      if (reduced()) { self.ring(x, y, tint, 2.6, 0.5); return; }
      for (var i = 0; i < 14; i++) {
        var p = self.shard.take();
        p.bsx = 1; p.bsy = 1;
        p.on = true; p.t = 0; p.life = 0.75 + self.rnd() * 0.5;
        p.x = x + (self.rnd() - 0.5) * w; p.y = y;
        p.vx = (self.rnd() - 0.5) * 210; p.vy = -190 - self.rnd() * 210;
        p.grav = 760; p.rot = self.rnd() * 6.28; p.spin = (self.rnd() - 0.5) * 16;
        p.s0 = 0.7 + self.rnd() * 0.6; p.s1 = 0.25;
        p.a0 = 1; p.a1 = 0;
        p.img.setTint(i % 4 === 0 ? tint : KB.KI[(self.rnd() * 4) | 0].face);
        p.img.setVisible(true).setActive(true).setPosition(p.x, p.y).setScale(p.s0).setAlpha(1);
      }
    };

    /* one concurrent frame nudge, amplitude capped at 2 percent of view */
    self.kick = function (mag, ms) {
      if (reduced()) return;
      var dpr = window.__KB_DPR || GGKit.hiDpi.dpr();
      var cap = self.scene.scale.height / dpr * 0.02;
      self.nudge.mag = Math.max(self.nudge.mag, Math.min(mag, cap));
      self.nudge.dur = Math.max(self.nudge.dur, (ms || 160) / 1000);
      self.nudge.t = 0;
      self.nudge.ang = self.rnd() * Math.PI * 2;
    };

    self.update = function (dt) {
      self.shard.update(dt);
      self.spark.update(dt);
      self.impact.update(dt);
      self.mote.update(dt);
      self.reward.update(dt);
      var n = self.nudge;
      if (n.dur > 0) {
        n.t += dt;
        if (n.t >= n.dur) { n.dur = 0; n.mag = 0; n.x = 0; n.y = 0; }
        else {
          var f = 1 - n.t / n.dur;
          var w = n.t * 60;
          n.x = Math.cos(n.ang + w) * n.mag * f;
          n.y = Math.sin(n.ang * 1.6 + w * 1.25) * n.mag * f;
        }
      } else { n.x = 0; n.y = 0; }
    };

    self.reset = function () {
      self.shard.clear(); self.spark.clear(); self.impact.clear();
      self.mote.clear(); self.reward.clear();
      self.nudge.mag = 0; self.nudge.dur = 0; self.nudge.x = 0; self.nudge.y = 0;
    };

    self.stats = function () {
      return {
        shard: self.shard.live(), spark: self.spark.live(), impact: self.impact.live(),
        mote: self.mote.live(), reward: self.reward.live()
      };
    };

    return self;
  };

  return FX;
})();
