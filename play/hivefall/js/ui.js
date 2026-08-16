/* Hivefall - UI kit built to the UI Noise Law.
 *
 * One transient at a time, corner chips for in-play events, centre banners
 * only at run boundaries, a thin fading coach strip, icons over labels,
 * >=14px effective text, >=44px touch targets, safe-area aware.
 */
var HFUI = (function () {
  'use strict';
  var U = {};

  var FONT = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  U.FONT = FONT;
  U.TOUCH = 44;

  /* safe-area insets, read from the CSS custom properties in index.html */
  var insetCache = null;
  U.insets = function (force) {
    if (insetCache && !force) return insetCache;
    var cs = null;
    try { cs = getComputedStyle(document.documentElement); } catch (e) { cs = null; }
    function px(name) {
      if (!cs) return 0;
      var v = parseFloat(cs.getPropertyValue(name));
      return isFinite(v) ? v : 0;
    }
    insetCache = {
      top: Math.max(0, px('--sat')), right: Math.max(0, px('--sar')),
      bottom: Math.max(0, px('--sab')), left: Math.max(0, px('--sal'))
    };
    return insetCache;
  };

  /* change-guarded setters: Phaser re-lays a Text object on every setText and
   * re-tints on every setColor, so both get the same guard. */
  U.setText = function (obj, str) {
    if (!obj) return;
    if (obj.__t !== str) { obj.__t = str; obj.setText(str); }
  };
  U.setColor = function (obj, col) {
    if (!obj) return;
    if (obj.__c !== col) { obj.__c = col; obj.setColor(col); }
  };
  U.setTint = function (obj, tint) {
    if (!obj) return;
    if (obj.__tint !== tint) { obj.__tint = tint; obj.setTint(tint); }
  };

  U.text = function (scene, x, y, str, size, color, weight) {
    var t = scene.add.text(x, y, str, {
      fontFamily: FONT,
      fontSize: (size || 15) + 'px',
      fontStyle: String(weight || 650),
      color: color || '#DCE7F4'
    });
    t.__t = str;
    t.setResolution(Math.min(2, window.devicePixelRatio || 1));
    return t;
  };

  U.hexs = function (n) { return '#' + ('000000' + ((n >>> 0) & 0xFFFFFF).toString(16)).slice(-6); };

  /* ------------------------------------------------------------ button -- */
  function Button(scene, opts) {
    this.scene = scene;
    this.kind = opts.kind || 'main';
    this.enabled = opts.enabled !== false;
    this.onTap = opts.onTap || function () {};
    this.w = Math.max(U.TOUCH, opts.w || 200);
    this.h = Math.max(U.TOUCH, opts.h || 56);
    this.img = scene.add.image(opts.x, opts.y, this.kindKey());
    this.img.setDisplaySize(this.w, this.h);
    this.img.setOrigin(0.5, 0.5);
    this.label = U.text(scene, opts.x, opts.y, opts.label || '', opts.fs || 16,
      this.kind === 'go' ? '#20160A' : '#E8F0FA', 750).setOrigin(0.5, 0.5);
    this.icon = null;
    if (opts.icon) {
      this.icon = scene.add.image(opts.x, opts.y, 'hf_ic_' + opts.icon);
      this.icon.setDisplaySize(opts.iconSize || 22, opts.iconSize || 22);
      this.icon.setTint(this.kind === 'go' ? 0x20160A : 0xE8F0FA);
    }
    this.sub = null;
    if (opts.sub) {
      this.sub = U.text(scene, opts.x, opts.y + 14, opts.sub, 12,
        this.kind === 'go' ? '#4A3405' : '#9FB3C8', 620).setOrigin(0.5, 0.5);
    }
    if (opts.container) {
      opts.container.add(this.img);
      opts.container.add(this.label);
      if (this.icon) opts.container.add(this.icon);
      if (this.sub) opts.container.add(this.sub);
    }
    this.layout(opts.x, opts.y);
    this.bind();
    this.setEnabled(this.enabled);
  }
  Button.prototype.kindKey = function () {
    if (!this.enabled) return 'hf_btn_dim';
    return this.kind === 'go' ? 'hf_btn_go' : (this.kind === 'ghost' ? 'hf_btn_dim' : 'hf_btn');
  };
  Button.prototype.layout = function (x, y) {
    this.x = x; this.y = y;
    this.img.setPosition(x, y);
    var lx = x, ly = this.sub ? y - 9 : y;
    if (this.icon) {
      var lw = this.label.width;
      var gap = 8;
      var total = lw + gap + this.icon.displayWidth;
      this.icon.setPosition(x - total / 2 + this.icon.displayWidth / 2, ly);
      lx = x - total / 2 + this.icon.displayWidth + gap + lw / 2;
    }
    this.label.setPosition(lx, ly);
    if (this.sub) this.sub.setPosition(x, y + 13);
  };
  Button.prototype.bind = function () {
    var self = this;
    this.img.setInteractive(new Phaser.Geom.Rectangle(0, 0, this.img.width, this.img.height),
      Phaser.Geom.Rectangle.Contains);
    this.img.on('pointerdown', function () {
      if (!self.enabled) return;
      self.pressed = true;
      self.img.setScale(self.img.scaleX * 0.96, self.img.scaleY * 0.96);
    });
    this.img.on('pointerout', function () {
      if (self.pressed) { self.pressed = false; self.img.setDisplaySize(self.w, self.h); }
    });
    this.img.on('pointerup', function () {
      if (!self.enabled || !self.pressed) return;
      self.pressed = false;
      self.img.setDisplaySize(self.w, self.h);
      self.onTap();
    });
  };
  Button.prototype.setEnabled = function (on) {
    this.enabled = !!on;
    this.img.setTexture(this.kindKey());
    this.img.setDisplaySize(this.w, this.h);
    U.setColor(this.label, this.enabled ? (this.kind === 'go' ? '#20160A' : '#E8F0FA') : '#67788D');
    if (this.icon) this.icon.setTint(this.enabled ? (this.kind === 'go' ? 0x20160A : 0xE8F0FA) : 0x67788D);
    this.img.setAlpha(this.enabled ? 1 : 0.9);
  };
  Button.prototype.setLabel = function (str) { U.setText(this.label, str); this.layout(this.x, this.y); };
  Button.prototype.setFocus = function (on) {
    this.img.setTint(on ? 0xFFF4D8 : 0xFFFFFF);
    if (!on) this.img.clearTint();
  };
  Button.prototype.destroy = function () {
    this.img.destroy(); this.label.destroy();
    if (this.icon) this.icon.destroy();
    if (this.sub) this.sub.destroy();
  };
  U.Button = function (scene, opts) { return new Button(scene, opts); };

  /* keyboard focus ring over a list of buttons */
  function Nav() { this.items = []; this.i = 0; }
  Nav.prototype.add = function (b) { this.items.push(b); return b; };
  Nav.prototype.clear = function () { this.items.length = 0; this.i = 0; };
  Nav.prototype.move = function (d) {
    if (!this.items.length) return;
    var guard = 0;
    do {
      this.i = (this.i + d + this.items.length) % this.items.length;
      guard++;
    } while (guard < this.items.length && !this.items[this.i].enabled);
    this.paint();
  };
  Nav.prototype.paint = function () {
    for (var i = 0; i < this.items.length; i++) this.items[i].setFocus(i === this.i && this.active);
  };
  Nav.prototype.activate = function () {
    var b = this.items[this.i];
    if (b && b.enabled) b.onTap();
  };
  U.Nav = function () { return new Nav(); };

  /* ------------------------------------------------------------- chips -- */
  /* In-play events use one small corner chip at a time: icon plus a short
   * value, max ~24px text height, 1.0s hold, fast fade. They queue; they
   * never stack, and they never sit over the board. */
  function Chips(scene, layer, x, y) {
    this.scene = scene;
    this.x = x; this.y = y;
    this.queue = [];
    this.holdT = 0;
    this.cur = null;
    this.box = scene.add.image(x, y, 'hf_chip').setOrigin(1, 0.5).setVisible(false);
    this.icon = scene.add.image(x, y, 'hf_ic_shell').setDisplaySize(18, 18).setVisible(false);
    this.label = U.text(scene, x, y, '', 15, '#F2F7FF', 750).setOrigin(1, 0.5).setVisible(false);
    if (layer) { layer.add(this.box); layer.add(this.icon); layer.add(this.label); }
  }
  Chips.prototype.setPos = function (x, y) {
    this.x = x; this.y = y;
    this.place();
  };
  Chips.prototype.place = function () {
    var lw = this.label.width;
    var w = lw + 46, h = 30;
    this.box.setPosition(this.x, this.y).setDisplaySize(w, h);
    this.label.setPosition(this.x - 10, this.y);
    this.icon.setPosition(this.x - w + 20, this.y);
  };
  Chips.prototype.push = function (icon, str, tint) {
    if (this.queue.length > 3) this.queue.shift();
    this.queue.push({ icon: icon, str: str, tint: tint || 0xF7B03C });
  };
  Chips.prototype.update = function (dt) {
    if (this.cur) {
      this.holdT += dt;
      var a = this.holdT < 0.72 ? 1 : Math.max(0, 1 - (this.holdT - 0.72) / 0.28);
      this.box.setAlpha(a * 0.95); this.icon.setAlpha(a); this.label.setAlpha(a);
      var pop = this.holdT < 0.14 ? 1 + (0.14 - this.holdT) * 1.4 : 1;
      this.label.setScale(pop);
      if (this.holdT >= 1.0) {
        this.cur = null;
        this.box.setVisible(false); this.icon.setVisible(false); this.label.setVisible(false);
      }
      return;
    }
    if (!this.queue.length) return;
    this.cur = this.queue.shift();
    this.holdT = 0;
    this.icon.setTexture('hf_ic_' + this.cur.icon);
    this.icon.setDisplaySize(18, 18);
    this.icon.setTint(this.cur.tint);
    U.setText(this.label, this.cur.str);
    this.place();
    this.box.setVisible(true); this.icon.setVisible(true); this.label.setVisible(true);
  };
  Chips.prototype.clear = function () {
    this.queue.length = 0; this.cur = null;
    this.box.setVisible(false); this.icon.setVisible(false); this.label.setVisible(false);
  };
  U.Chips = function (scene, layer, x, y) { return new Chips(scene, layer, x, y); };

  /* ------------------------------------------------------------- strip -- */
  /* Coach text: ONE thin line at the top edge, fades to near transparent
   * after about three seconds, never centred, never over the controls. */
  function Strip(scene, layer, w, y) {
    this.scene = scene;
    this.bg = scene.add.image(w / 2, y, 'hf_chip').setDisplaySize(w - 24, 34).setVisible(false).setAlpha(0);
    this.txt = U.text(scene, w / 2, y, '', 14, '#F2F7FF', 620).setOrigin(0.5, 0.5).setVisible(false).setAlpha(0);
    this.t = 0; this.dur = 0; this.on = false;
    if (layer) { layer.add(this.bg); layer.add(this.txt); }
  }
  Strip.prototype.resize = function (w, y) {
    this.bg.setPosition(w / 2, y).setDisplaySize(Math.min(w - 24, 360), 34);
    this.txt.setPosition(w / 2, y);
  };
  Strip.prototype.show = function (str, dur) {
    U.setText(this.txt, str);
    this.t = 0; this.dur = dur || 3.4; this.on = true;
    this.bg.setVisible(true); this.txt.setVisible(true);
  };
  Strip.prototype.hide = function () {
    this.on = false;
    this.bg.setVisible(false).setAlpha(0);
    this.txt.setVisible(false).setAlpha(0);
  };
  Strip.prototype.update = function (dt) {
    if (!this.on) return;
    this.t += dt;
    var a;
    if (this.t < 0.22) a = this.t / 0.22;
    else if (this.t > this.dur) a = Math.max(0, 1 - (this.t - this.dur) / 0.5);
    else a = 1;
    this.bg.setAlpha(a * 0.82);
    this.txt.setAlpha(a);
    if (this.t > this.dur + 0.5) this.hide();
  };
  U.Strip = function (scene, layer, w, y) { return new Strip(scene, layer, w, y); };

  /* ------------------------------------------------------------ banner -- */
  /* Reserved for run boundaries only: wave start, wave clear, boss entry,
   * breach, campaign end. 60 percent width, ease-out-back overshoot. */
  function Banner(scene, layer, w, h) {
    this.scene = scene;
    this.w = w; this.h = h;
    this.card = scene.add.image(w / 2, h * 0.36, 'hf_card').setVisible(false);
    this.title = U.text(scene, w / 2, h * 0.36 - 13, '', 26, '#FFD98A', 800).setOrigin(0.5, 0.5).setVisible(false);
    this.sub = U.text(scene, w / 2, h * 0.36 + 16, '', 15, '#CBDAEA', 600).setOrigin(0.5, 0.5).setVisible(false);
    this.t = 0; this.dur = 0; this.on = false;
    if (layer) { layer.add(this.card); layer.add(this.title); layer.add(this.sub); }
  }
  Banner.prototype.resize = function (w, h) {
    this.w = w; this.h = h;
    this.card.setPosition(w / 2, h * 0.36);
    this.title.setPosition(w / 2, h * 0.36 - 13);
    this.sub.setPosition(w / 2, h * 0.36 + 16);
  };
  Banner.prototype.show = function (title, sub, dur, color) {
    U.setText(this.title, title);
    U.setText(this.sub, sub || '');
    U.setColor(this.title, color || '#FFD98A');
    this.t = 0; this.dur = dur || 1.5; this.on = true;
    this.card.setVisible(true); this.title.setVisible(true);
    this.sub.setVisible(!!sub);
  };
  Banner.prototype.hide = function () {
    this.on = false;
    this.card.setVisible(false); this.title.setVisible(false); this.sub.setVisible(false);
  };
  Banner.prototype.update = function (dt, reduced) {
    if (!this.on) return;
    this.t += dt;
    var bw = Math.min(this.w * 0.62, 300);
    var k, a = 1, s = 1;
    if (this.t < 0.34) {
      k = this.t / 0.34;
      s = reduced ? 1 : HF.easeOutBack(k);
      a = Math.min(1, k * 2.2);
    } else if (this.t > this.dur) {
      a = Math.max(0, 1 - (this.t - this.dur) / 0.36);
    }
    this.card.setDisplaySize(bw * s, 92 * (reduced ? 1 : (0.7 + 0.3 * s)));
    this.card.setAlpha(a * 0.94);
    this.title.setAlpha(a).setScale(reduced ? 1 : s);
    this.sub.setAlpha(a * 0.95);
    if (this.t > this.dur + 0.4) this.hide();
  };
  U.Banner = function (scene, layer, w, h) { return new Banner(scene, layer, w, h); };

  /* --------------------------------------------------------------- bar -- */
  /* Meter drawn as two baked images: no Graphics in the display list. */
  function Bar(scene, layer, x, y, w, h) {
    this.bg = scene.add.image(x, y, 'hf_bar_bg').setOrigin(0, 0.5).setDisplaySize(w, h);
    this.fill = scene.add.image(x + 2, y, 'hf_bar_fill').setOrigin(0, 0.5).setDisplaySize(w - 4, h - 5);
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.v = 1;
    if (layer) { layer.add(this.bg); layer.add(this.fill); }
  }
  Bar.prototype.setGeom = function (x, y, w, h) {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.bg.setPosition(x, y).setDisplaySize(w, h);
    this.fill.setPosition(x + 2, y).setDisplaySize(Math.max(0, (w - 4) * this.v), h - 5);
  };
  Bar.prototype.set = function (frac, tint) {
    frac = HF.clamp(frac, 0, 1);
    if (Math.abs(frac - this.v) > 0.0015) {
      this.v = frac;
      this.fill.setDisplaySize(Math.max(0, (this.w - 4) * frac), this.h - 5);
    }
    if (tint != null) U.setTint(this.fill, tint);
  };
  Bar.prototype.setVisible = function (v) { this.bg.setVisible(v); this.fill.setVisible(v); };
  U.Bar = function (scene, layer, x, y, w, h) { return new Bar(scene, layer, x, y, w, h); };

  return U;
})();
