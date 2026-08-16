/* Runeline Depths - pooled effects.
 * Five preallocated particle systems plus a pooled float-text bank. Nothing
 * here allocates during play: every emitter draws from a fixed pool and a
 * dead item is hidden, never destroyed. Cosmetic randomness uses its own
 * stream so no effect can perturb the simulation.
 */
(function (root) {
  'use strict';

  var RD = root.RD || {}; root.RD = RD;

  function Pool(scene, key, count, blend) {
    this.items = [];
    this.live = [];
    this.next = 0;
    for (var i = 0; i < count; i++) {
      var img = scene.add.image(-500, -500, key);
      img.setVisible(false).setActive(false);
      if (blend) img.setBlendMode(Phaser.BlendModes.ADD);
      this.items.push(img);
      img.__p = { life: 0, max: 1, vx: 0, vy: 0, g: 0, drag: 0.97, s0: 1, s1: 0, r: 0, a0: 1 };
    }
  }
  Pool.prototype.take = function () {
    for (var n = 0; n < this.items.length; n++) {
      var i = (this.next + n) % this.items.length;
      var it = this.items[i];
      if (!it.active) { this.next = (i + 1) % this.items.length; return it; }
    }
    /* all busy: steal the oldest so the pool never grows */
    var st = this.items[this.next];
    this.next = (this.next + 1) % this.items.length;
    return st;
  };
  Pool.prototype.update = function (dt) {
    for (var i = 0; i < this.items.length; i++) {
      var it = this.items[i];
      if (!it.active) continue;
      var p = it.__p;
      p.life -= dt;
      if (p.life <= 0) { it.setActive(false).setVisible(false); it.x = -500; continue; }
      p.vy += p.g * dt;
      p.vx *= Math.pow(p.drag, dt * 60);
      p.vy *= Math.pow(p.drag, dt * 60);
      it.x += p.vx * dt;
      it.y += p.vy * dt;
      it.rotation += p.r * dt;
      var t = 1 - p.life / p.max;
      it.setScale(p.s0 + (p.s1 - p.s0) * t);
      it.setAlpha(p.a0 * (1 - t * t));
    }
  };
  Pool.prototype.clear = function () {
    for (var i = 0; i < this.items.length; i++) {
      this.items[i].setActive(false).setVisible(false);
      this.items[i].x = -500;
    }
  };

  RD.createFX = function (scene, kit) {
    var vfx = RD.Art.rng(0x5EED11FE);
    var fx = {
      frag: new Pool(scene, 'px-shard', 30),
      streak: new Pool(scene, 'px-streak', 18, true),
      spark: new Pool(scene, 'px-spark', 26, true),
      confetti: new Pool(scene, 'px-dot', 26),
      trail: new Pool(scene, 'px-spark', 22, true),
      texts: [],
      textNext: 0
    };

    for (var i = 0; i < 10; i++) {
      var t = scene.add.text(-500, -500, '', {
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: '22px', fontStyle: '800', color: '#ffffff', resolution: GGKit.hiDpi.dpr()
      }).setOrigin(0.5).setVisible(false).setActive(false);
      t.__p = { life: 0, max: 1, vy: -46 };
      fx.texts.push(t);
    }

    function dense(n) { return kit.juice.enabled ? n : Math.max(2, Math.round(n * 0.4)); }

    /* system 1: clear fragments, the contact accent on every cleared orb */
    fx.fragments = function (x, y, color, count) {
      var n = dense(count == null ? 6 : count);
      for (var i = 0; i < n; i++) {
        var it = fx.frag.take();
        var a = vfx() * Math.PI * 2, sp = 60 + vfx() * 190;
        it.setTexture('px-shard').setTint(color).setPosition(x, y).setDepth(60);
        it.setActive(true).setVisible(true).setBlendMode(Phaser.BlendModes.NORMAL);
        it.rotation = vfx() * Math.PI;
        var p = it.__p;
        p.life = p.max = 0.34 + vfx() * 0.36;
        p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp - 40;
        p.g = 620; p.drag = 0.985; p.s0 = 0.42 + vfx() * 0.3; p.s1 = 0; p.r = (vfx() - 0.5) * 12; p.a0 = 1;
      }
    };

    /* system 2: movement and cascade streaks */
    fx.streakTo = function (x0, y0, x1, y1, color, width) {
      var it = fx.streak.take();
      var dx = x1 - x0, dy = y1 - y0;
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      it.setTexture('px-streak').setTint(color).setDepth(58);
      it.setPosition((x0 + x1) / 2, (y0 + y1) / 2);
      it.setActive(true).setVisible(true).setBlendMode(Phaser.BlendModes.ADD);
      it.rotation = Math.atan2(dy, dx);
      it.setDisplaySize(len, width || 9);
      var p = it.__p;
      p.life = p.max = 0.26; p.vx = 0; p.vy = 0; p.g = 0; p.drag = 1;
      p.s0 = it.scaleX; p.s1 = it.scaleX; p.r = 0; p.a0 = 0.85;
    };

    /* system 3: impact sparks for strikes and hits */
    fx.sparks = function (x, y, color, count, spread) {
      var n = dense(count == null ? 8 : count);
      for (var i = 0; i < n; i++) {
        var it = fx.spark.take();
        var a = (spread == null ? vfx() * Math.PI * 2 : spread + (vfx() - 0.5) * 1.1);
        var sp = 90 + vfx() * 260;
        it.setTexture('px-spark').setTint(color).setPosition(x, y).setDepth(62);
        it.setActive(true).setVisible(true).setBlendMode(Phaser.BlendModes.ADD);
        it.rotation = 0;
        var p = it.__p;
        p.life = p.max = 0.22 + vfx() * 0.3;
        p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
        p.g = 120; p.drag = 0.93; p.s0 = 0.5 + vfx() * 0.5; p.s1 = 0; p.r = 0; p.a0 = 0.95;
      }
    };

    /* system 4: reward celebration, reserved for room and dungeon beats */
    fx.celebrate = function (x, y, colors, count) {
      var n = dense(count == null ? 20 : count);
      for (var i = 0; i < n; i++) {
        var it = fx.confetti.take();
        var a = -Math.PI / 2 + (vfx() - 0.5) * 2.4;
        var sp = 160 + vfx() * 330;
        it.setTexture('px-dot').setTint(colors[(vfx() * colors.length) | 0]);
        it.setPosition(x + (vfx() - 0.5) * 40, y).setDepth(70);
        it.setActive(true).setVisible(true).setBlendMode(Phaser.BlendModes.NORMAL);
        var p = it.__p;
        p.life = p.max = 0.7 + vfx() * 0.6;
        p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
        p.g = 700; p.drag = 0.99; p.s0 = 0.6 + vfx() * 0.7; p.s1 = 0.1; p.r = (vfx() - 0.5) * 10; p.a0 = 1;
      }
    };

    /* system 5: the orb trail behind the held orb, one clean line that
       fades before the next decision window */
    fx.trailDot = function (x, y, color, scale) {
      var it = fx.trail.take();
      it.setTexture('px-spark').setTint(color).setPosition(x, y).setDepth(56);
      it.setActive(true).setVisible(true).setBlendMode(Phaser.BlendModes.ADD);
      var p = it.__p;
      p.life = p.max = 0.30; p.vx = 0; p.vy = 0; p.g = 0; p.drag = 1;
      p.s0 = scale || 1.1; p.s1 = 0.1; p.r = 0; p.a0 = 0.55;
    };

    fx.float = function (x, y, text, color, size) {
      var t = fx.texts[fx.textNext];
      fx.textNext = (fx.textNext + 1) % fx.texts.length;
      t.setText(text);
      t.setColor(color || '#ffffff');
      t.setFontSize((size || 22) + 'px');
      t.setPosition(x, y).setDepth(90);
      t.setActive(true).setVisible(true).setAlpha(1).setScale(1);
      t.__p.life = t.__p.max = 0.95;
      t.__p.vy = -52;
    };

    fx.update = function (dt) {
      fx.frag.update(dt);
      fx.streak.update(dt);
      fx.spark.update(dt);
      fx.confetti.update(dt);
      fx.trail.update(dt);
      for (var i = 0; i < fx.texts.length; i++) {
        var t = fx.texts[i];
        if (!t.active) continue;
        var p = t.__p;
        p.life -= dt;
        if (p.life <= 0) { t.setActive(false).setVisible(false); t.x = -500; continue; }
        var k = 1 - p.life / p.max;
        t.y += p.vy * dt;
        t.setAlpha(k < 0.15 ? k / 0.15 : 1 - Math.max(0, (k - 0.55) / 0.45));
        t.setScale(1 + (k < 0.2 ? (0.2 - k) * 1.2 : 0));
      }
    };

    fx.clear = function () {
      fx.frag.clear(); fx.streak.clear(); fx.spark.clear();
      fx.confetti.clear(); fx.trail.clear();
      for (var i = 0; i < fx.texts.length; i++) {
        fx.texts[i].setActive(false).setVisible(false);
        fx.texts[i].x = -500;
      }
    };

    return fx;
  };
})(typeof window !== 'undefined' ? window : globalThis);
