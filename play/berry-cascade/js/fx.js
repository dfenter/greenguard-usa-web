/* Berry Cascade - pooled cosmetic effects.
 * Four preallocated pools (clear fragments, cascade streaks, syrup droplets,
 * reward celebration). Nothing is allocated per frame and nothing here ever
 * writes simulation state. Every high-energy path is gated on kit.juice.enabled.
 */
var BCFx = (function () {
  'use strict';

  function Pool(scene, layer, key, count, blend) {
    this.items = [];
    for (var i = 0; i < count; i++) {
      var img = scene.add.image(0, 0, key);
      img.setVisible(false).setActive(false);
      if (blend) img.setBlendMode(Phaser.BlendModes.ADD);
      layer.add(img);
      this.items.push({
        img: img, on: false, x: 0, y: 0, vx: 0, vy: 0, t: 0, life: 1,
        s0: 1, s1: 0, a0: 1, a1: 0, rot: 0, spin: 0, grav: 0,
        bsx: 1, bsy: 1                                /* non-uniform base scale */
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
    /* pool is full: recycle the oldest slot rather than allocating */
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
      scene: scene, kit: kit,
      clear: new Pool(scene, layer, 'bc_shard', 16, false),
      cascade: new Pool(scene, layer, 'bc_streak', 14, true),
      drop: new Pool(scene, layer, 'bc_dot', 14, false),
      reward: new Pool(scene, layer, 'bc_ring', 12, true),
      nudge: { x: 0, y: 0, mag: 0, t: 0, dur: 0, ang: 0 },
      rnd: BC.rng(0xC0FFEE)                          /* cosmetic stream only */
    };

    function reduced() { return !(kit && kit.juice && kit.juice.enabled); }
    self.reduced = reduced;

    /* --- clear fragments: 2 to 4 per popped piece, colour-matched --- */
    self.burst = function (x, y, tint, n, spread) {
      n = reduced() ? Math.min(2, n) : n;
      for (var i = 0; i < n; i++) {
        var p = self.clear.take();
        p.bsx = 1; p.bsy = 1;
        var a = self.rnd() * Math.PI * 2;
        var sp = (spread || 120) * (0.4 + self.rnd() * 0.9);
        p.on = true; p.t = 0; p.life = 0.34 + self.rnd() * 0.22;
        p.x = x; p.y = y;
        p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp - 40;
        p.grav = 700; p.rot = self.rnd() * 6.28; p.spin = (self.rnd() - 0.5) * 12;
        p.s0 = 0.6 + self.rnd() * 0.5; p.s1 = 0;
        p.a0 = 0.95; p.a1 = 0;
        p.img.setTint(tint);
        p.img.setVisible(true).setActive(true).setPosition(x, y).setScale(p.s0).setAlpha(p.a0);
      }
    };

    /* --- cascade streaks: one short directional streak per landing --- */
    self.streak = function (x, y, h, tint) {
      if (reduced()) return;
      var p = self.cascade.take();
      /* bc_streak is 10x48; keep the width thin and stretch to the fall height */
      p.bsx = 6 / 10; p.bsy = Math.max(14, h) / 48;
      p.on = true; p.t = 0; p.life = 0.26;
      p.x = x; p.y = y - h * 0.5;
      p.vx = 0; p.vy = 140; p.grav = 0;
      p.rot = 0; p.spin = 0;
      p.s0 = 1; p.s1 = 1;
      p.a0 = 0.5; p.a1 = 0;
      p.img.setTint(tint);
      p.img.setVisible(true).setActive(true).setPosition(p.x, p.y).setAlpha(p.a0);
      p.img.setScale(p.bsx, p.bsy);
    };

    /* --- syrup droplets: the title's signature juice --- */
    self.droplet = function (x, y, n) {
      n = reduced() ? 1 : (n || 3);
      for (var i = 0; i < n; i++) {
        var p = self.drop.take();
        p.bsx = 1; p.bsy = 1;
        var a = -Math.PI / 2 + (self.rnd() - 0.5) * 2.0;
        var sp = 90 + self.rnd() * 130;
        p.on = true; p.t = 0; p.life = 0.42 + self.rnd() * 0.2;
        p.x = x; p.y = y;
        p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
        p.grav = 900; p.rot = 0; p.spin = 0;
        p.s0 = 0.5 + self.rnd() * 0.4; p.s1 = 0.05;
        p.a0 = 0.95; p.a1 = 0;
        p.img.setTint(0xFFD79A);
        p.img.setVisible(true).setActive(true).setPosition(x, y).setScale(p.s0).setAlpha(p.a0);
      }
    };

    /* --- reward: expanding rings, reserved for goal and medal beats --- */
    self.ring = function (x, y, tint, scale, life) {
      var p = self.reward.take();
      p.bsx = 1; p.bsy = 1;
      p.on = true; p.t = 0; p.life = life || 0.55;
      p.x = x; p.y = y; p.vx = 0; p.vy = 0; p.grav = 0; p.rot = 0; p.spin = 0;
      p.s0 = 0.25; p.s1 = (scale || 3.2) * (reduced() ? 0.6 : 1);
      p.a0 = reduced() ? 0.35 : 0.7; p.a1 = 0;
      p.img.setTint(tint);
      p.img.setVisible(true).setActive(true).setPosition(x, y).setScale(p.s0).setAlpha(p.a0);
    };

    self.confetti = function (x, y, w, tint) {
      if (reduced()) { self.ring(x, y, tint, 2.6, 0.5); return; }
      for (var i = 0; i < 14; i++) {
        var p = self.clear.take();
        p.bsx = 1; p.bsy = 1;
        p.on = true; p.t = 0; p.life = 0.7 + self.rnd() * 0.5;
        p.x = x + (self.rnd() - 0.5) * w; p.y = y;
        p.vx = (self.rnd() - 0.5) * 200; p.vy = -180 - self.rnd() * 220;
        p.grav = 780; p.rot = self.rnd() * 6.28; p.spin = (self.rnd() - 0.5) * 16;
        p.s0 = 0.8 + self.rnd() * 0.7; p.s1 = 0.3;
        p.a0 = 1; p.a1 = 0;
        p.img.setTint(BC.FAMILIES[(self.rnd() * BC.FAMILIES.length) | 0].face);
        p.img.setVisible(true).setActive(true).setPosition(p.x, p.y).setScale(p.s0).setAlpha(1);
      }
    };

    /* --- frame nudge: one concurrent shake, capped at 2% of view height --- */
    self.kick = function (mag, ms) {
      if (reduced()) return;
      var cap = self.scene.scale.height * 0.02;
      self.nudge.mag = Math.max(self.nudge.mag, Math.min(mag, cap));
      self.nudge.dur = Math.max(self.nudge.dur, (ms || 160) / 1000);
      self.nudge.t = 0;
      self.nudge.ang = self.rnd() * Math.PI * 2;
    };

    self.update = function (dt) {
      self.clear.update(dt);
      self.cascade.update(dt);
      self.drop.update(dt);
      self.reward.update(dt);
      var n = self.nudge;
      if (n.dur > 0) {
        n.t += dt;
        if (n.t >= n.dur) { n.dur = 0; n.mag = 0; n.x = 0; n.y = 0; }
        else {
          var f = 1 - n.t / n.dur;
          var w = n.t * 58;
          n.x = Math.cos(n.ang + w) * n.mag * f;
          n.y = Math.sin(n.ang * 1.7 + w * 1.3) * n.mag * f;
        }
      } else { n.x = 0; n.y = 0; }
    };

    self.reset = function () {
      self.clear.clear(); self.cascade.clear(); self.drop.clear(); self.reward.clear();
      self.nudge.mag = 0; self.nudge.dur = 0; self.nudge.x = 0; self.nudge.y = 0;
    };

    /* debug/verification counts read the SAME pools the renderer uses */
    self.stats = function () {
      function live(p) { var c = 0; for (var i = 0; i < p.items.length; i++) if (p.items[i].on) c++; return c; }
      return {
        clear: live(self.clear), cascade: live(self.cascade),
        drop: live(self.drop), reward: live(self.reward)
      };
    };

    return self;
  };

  return FX;
})();
